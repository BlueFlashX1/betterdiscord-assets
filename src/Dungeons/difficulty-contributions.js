const SLEvents = require('../shared/event-bus');

module.exports = {
  _resolveDungeonXPBatchKey(channelKey, dungeonLike = null) {
    const explicit = typeof dungeonLike?._xpBatchKey === 'string' ? dungeonLike._xpBatchKey.trim() : '';
    if (explicit) return explicit;
    const startTime = Number(dungeonLike?.startTime);
    if (Number.isFinite(startTime) && startTime > 0) {
      return `${channelKey}:${Math.floor(startTime)}`;
    }
    return `${channelKey}:legacy`;
  },

  _queuePendingDungeonMobXP(channelKey, dungeon, xpAmount, killCount = 1) {
    const normalizedXP = Math.floor(Number(xpAmount) || 0);
    if (!dungeon || normalizedXP <= 0) return 0;

    const batchKey = this._resolveDungeonXPBatchKey(channelKey, dungeon);
    dungeon._xpBatchKey = batchKey;

    const currentXP = Number(dungeon.pendingUserMobXP);
    const safeCurrentXP = Number.isFinite(currentXP) && currentXP > 0 ? Math.floor(currentXP) : 0;
    const nextXP = safeCurrentXP + normalizedXP;
    dungeon.pendingUserMobXP = nextXP;

    const currentKills = Number(dungeon.pendingUserMobKills);
    const safeCurrentKills = Number.isFinite(currentKills) && currentKills > 0 ? Math.floor(currentKills) : 0;
    const normalizedKills = Math.max(1, Math.floor(Number(killCount) || 1));
    const nextKills = safeCurrentKills + normalizedKills;
    dungeon.pendingUserMobKills = nextKills;

    this._pendingDungeonMobXPByBatch?.set(batchKey, nextXP);
    this._pendingDungeonMobKillsByBatch?.set(batchKey, nextKills);
    return nextXP;
  },

  _consumePendingDungeonMobXP(batchKey, snapshot = null) {
    const snapXP = Number(snapshot?.pendingUserMobXP);
    const queuedXP = Number(this._pendingDungeonMobXPByBatch?.get(batchKey));
    const pendingXP = Math.max(
      Number.isFinite(snapXP) && snapXP > 0 ? Math.floor(snapXP) : 0,
      Number.isFinite(queuedXP) && queuedXP > 0 ? Math.floor(queuedXP) : 0
    );

    const snapKills = Number(snapshot?.pendingUserMobKills);
    const queuedKills = Number(this._pendingDungeonMobKillsByBatch?.get(batchKey));
    const pendingKills = Math.max(
      Number.isFinite(snapKills) && snapKills > 0 ? Math.floor(snapKills) : 0,
      Number.isFinite(queuedKills) && queuedKills > 0 ? Math.floor(queuedKills) : 0
    );

    this._pendingDungeonMobXPByBatch?.delete(batchKey);
    this._pendingDungeonMobKillsByBatch?.delete(batchKey);
    return { pendingXP, pendingKills };
  },

  _discardPendingDungeonMobXP(batchKey) {
    if (!batchKey) return;
    this._pendingDungeonMobXPByBatch?.delete(batchKey);
    this._pendingDungeonMobKillsByBatch?.delete(batchKey);
  },

  // Rank histogram of a dungeon's assigned shadows, cached against the
  // allocation array identity — recomputed only when the allocation is
  // replaced (re-split / deploy), so the per-tick warfront read is O(ranks),
  // not O(army). Compressed shadow records carry `rank` top-level (IDB index
  // field), so this works for both compressed and full records.
  _getShadowSpeciesKeyDg(s) {
    return String(
      s?.beastFamily || s?.bf || s?.beastType || s?.bt || s?.role || s?.ro || 'shadow'
    );
  },

  // War intel for a dungeon's allocation, cached against allocation identity:
  // - counts: effective-rank histogram (rank + grade bump) for the war math
  // - leaders: species → sovereign specialization ('offense'/'defense') for
  //   every species whose GRAND MARSHAL is fielded in THIS dungeon
  // - speciesTroops / ledOffense / ledDefense: troop tallies for the buffs
  // Recomputed only when the allocation array is replaced — O(assigned) once,
  // O(1) per tick.
  _getWarIntel(dungeon, assigned) {
    const cache = dungeon._warIntel;
    if (cache && cache.ref === assigned) return cache;
    // GRADE BUMP (lore: named marshals ARE monarch-tier — Beru/Igris fight far
    // above their nominal rank): General +0.5, Marshal +1, Grand Marshal +2
    // effective rank steps in the mass battle.
    const GRADE_BUMP = { General: 0.5, Marshal: 1, 'Grand Marshal': 2 };
    const counts = {}; // effectiveRankIndex (may be half-steps) → count
    const speciesTroops = {};
    const leaders = {}; // species → 'offense' | 'defense'
    if (Array.isArray(assigned)) {
      for (let i = 0; i < assigned.length; i++) {
        const s = assigned[i];
        const grade = s?.grade || s?.gr || '';
        const baseIdx = this.getRankIndexValue(s?.rank || 'E');
        const key = (baseIdx + (GRADE_BUMP[grade] || 0)).toFixed(1);
        counts[key] = (counts[key] || 0) + 1;
        const species = this._getShadowSpeciesKeyDg(s);
        speciesTroops[species] = (speciesTroops[species] || 0) + 1;
        // SOVEREIGN'S COMMAND: the species' Grand Marshal on the field buffs
        // its own kind, themed by the sovereign's specialization (lore: Igris
        // the swordmaster, Tusk's Hellfire, Iron's taunt, Beru's healing).
        if (grade === 'Grand Marshal') {
          const archetype = this._getShadowArchetypeForRole
            ? this._getShadowArchetypeForRole(s)
            : 'balanced';
          leaders[species] =
            archetype === 'tank' || archetype === 'support' ? 'defense' : 'offense';
        }
      }
    }
    let ledOffense = 0;
    let ledDefense = 0;
    for (const [species, spec] of Object.entries(leaders)) {
      if (spec === 'offense') ledOffense += speciesTroops[species] || 0;
      else ledDefense += speciesTroops[species] || 0;
    }
    const intel = {
      ref: assigned,
      counts,
      leaders,
      speciesTroops,
      ledOffense,
      ledDefense,
      total: Array.isArray(assigned) ? assigned.length : 0,
    };
    dungeon._warIntel = intel;
    return intel;
  },

  // SOVEREIGN'S COMMAND (frontline): a shadow fighting under its species'
  // fielded Grand Marshal hits harder in the object-simulated skirmish too.
  _getShadowLeadershipMult(dungeon, shadow, assigned) {
    try {
      if (this.settings?.gmLeadershipEnabled === false) return 1;
      const intel = this._getWarIntel(dungeon, assigned);
      if (!intel || !intel.leaders) return 1;
      if (!intel.leaders[this._getShadowSpeciesKeyDg(shadow)]) return 1;
      const raw = Number(this.settings?.gmLeadershipFrontlineBonus);
      return 1 + this.clampNumber(Number.isFinite(raw) ? raw : 0.1, 0, 1);
    } catch (_) { return 1; }
  },

  // ── WARFRONT: aggregate army-vs-host battle (O(1) per tick) ────────────────
  // The object-simulated frontline stays small (performanceAliveMobCap); the
  // MASS battle happens here: shadows beyond the frontline's needs grind the
  // gate's war host (dungeon.war.reserves) down arithmetically. Kills flow
  // through _onMobKilled, so XP batching, essence batching, gate-kill credit,
  // and reserve depletion all reuse the existing pipeline. War-scale numbers
  // (thousands of kills a minute for a big army) with zero per-entity cost.
  _processWarfrontTick(channelKey, dungeon, now) {
    try {
      if (this.settings?.warfrontEnabled === false) return;
      if (!dungeon || !dungeon.shadowsDeployed || dungeon.completed || dungeon.failed || dungeon._completing) return;
      if ((dungeon.boss?.hp || 0) <= 0) return; // war ends when the general falls
      // Demon Castle floors use inverted remaining semantics (counts DOWN) and
      // pre-set totals — aggregate kills would corrupt floor accounting. The
      // warfront is for open gates only.
      if (dungeon._isDemonCastle) return;

      // Lazy-seed for dungeons created before the warfront existed.
      if (!dungeon.war || !Number.isFinite(dungeon.war.reserves)) {
        const cap = Number(dungeon.mobs?.mobCapacity) || 0;
        const killed = Number(dungeon.mobs?.killed) || 0;
        dungeon.war = { reserves: Math.max(0, cap - killed), fallen: killed, shadowsFallen: 0 };
      }
      if (dungeon.war.reserves <= 0) return; // host annihilated — stragglers remain

      const assigned = this.shadowAllocations.get(channelKey);
      const armySize = Array.isArray(assigned) ? assigned.length : 0;
      // Shadows engaged at the object-sim frontline don't double-dip: reserve
      // 2× the alive cap for the skirmish line, the rest fight the mass battle.
      const aliveCapRaw = Number(this.settings?.performanceAliveMobCap);
      const frontlineNeed = 2 * (Number.isFinite(aliveCapRaw) && aliveCapRaw >= 100 ? aliveCapRaw : 800);
      const surplus = Math.max(0, armySize - frontlineNeed);
      if (surplus <= 0) return; // no mass army — the frontline is the whole battle

      const rateRaw = Number(this.settings?.warfrontKillRatePerShadow);
      const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? Math.min(rateRaw, 1) : 0.015;
      const capRaw = Number(this.settings?.warfrontMaxKillsPerTick);
      const perTickCap = Number.isFinite(capRaw) && capRaw >= 100 ? Math.floor(capRaw) : 5000;

      // RANK-AWARE WAR MATH (lore: "it takes 10 C-Ranks to possibly overpower
      // a B-Rank" — one rank step ≈ 10:1 in mass battle; at 2+ ranks the gap is
      // "a different species"). Each shadow's contribution is weighted
      // 10^(shadowRankIdx − hostRankIdx), clamped [0.001, 100]:
      //   even rank  → 1×   (numbers decide — parity with the flat model)
      //   1 below    → 0.1× (ten fodder ≈ one even soldier)
      //   2+ below   → ~0   (fodder cannot meaningfully cull a higher host)
      //   1 above    → 10×  (one general shreds ten lessers)
      //   2+ above   → 100× cap (functional annihilation)
      const intel = this._getWarIntel(dungeon, assigned);
      const hist = intel.counts;
      const hostIdx = this.getRankIndexValue(dungeon.rank);
      let effPower = 0;
      let casualtyWeight = 0;
      const surplusShare = armySize > 0 ? surplus / armySize : 0;
      for (const effIdxKey in hist) {
        const count = hist[effIdxKey] * surplusShare; // surplus slice of each tier
        if (!(count > 0)) continue;
        const diff = parseFloat(effIdxKey) - hostIdx; // effective idx (rank + grade bump)
        effPower += count * this.clampNumber(Math.pow(10, diff), 0.001, 100);
        // Inverse for casualties: fodder dies en masse to a higher host.
        casualtyWeight += count * this.clampNumber(Math.pow(10, -diff), 0.001, 100);
      }
      // The Monarch takes the field: participating amplifies the whole war
      // effort (same lever as the boss-damage commander's presence bonus).
      if (dungeon.userParticipating) {
        const bonusRaw = Number(this.settings?.userParticipationDamageBonus);
        effPower *= 1 + this.clampNumber(Number.isFinite(bonusRaw) ? bonusRaw : 0.25, 0, 2);
      }
      // SOVEREIGN'S COMMAND: species led by their fielded Grand Marshal fight
      // harder. Offense sovereigns (Igris' blades, Tusk's Hellfire) raise the
      // led troops' war output; defense sovereigns (Iron's taunt, Beru's
      // healing) cut the led troops' casualties. Scaled by the LED share of
      // the army, so a leaderless horde gains nothing — the user-visible edge
      // of having each species' commander on the field.
      if (intel.total > 0 && this.settings?.gmLeadershipEnabled !== false) {
        const offBonusRaw = Number(this.settings?.gmLeadershipOffenseBonus);
        const offBonus = this.clampNumber(Number.isFinite(offBonusRaw) ? offBonusRaw : 0.2, 0, 1);
        const defCutRaw = Number(this.settings?.gmLeadershipCasualtyCut);
        const defCut = this.clampNumber(Number.isFinite(defCutRaw) ? defCutRaw : 0.4, 0, 0.9);
        effPower *= 1 + offBonus * (intel.ledOffense / intel.total);
        casualtyWeight *= 1 - defCut * (intel.ledDefense / intel.total);
      }

      const kills = Math.min(
        dungeon.war.reserves,
        perTickCap,
        Math.floor(effPower * rate)
      );
      if (kills > 0) {
        // Existing pipeline: gate-kill credit, batched XP, batched essence,
        // war-reserve depletion (all inside _onMobKilled).
        this._onMobKilled(channelKey, dungeon, dungeon.rank, kills);
      }

      // Casualties of war (report-only — the shadows rise again): scales with
      // the host's rank advantage. Even-rank war ≈ 0.03% of engaged per tick;
      // a fodder army thrown at a higher host bleeds hard.
      const fallen = Math.min(surplus, Math.floor(casualtyWeight * 0.0003));
      if (fallen > 0) {
        dungeon.war.shadowsFallen = (dungeon.war.shadowsFallen || 0) + fallen;
      }
      if (kills <= 0 && fallen <= 0) return;

      // War report — one toast a minute while the mass battle rages.
      if (!dungeon.war._lastReportAt || now - dungeon.war._lastReportAt >= 60000) {
        dungeon.war._lastReportAt = now;
        const fallen = (dungeon.war.fallen || 0).toLocaleString();
        const reserves = dungeon.war.reserves.toLocaleString();
        const lost = (dungeon.war.shadowsFallen || 0).toLocaleString();
        const sovereignCount = Object.keys(intel.leaders || {}).length;
        const led = sovereignCount > 0 ? ` ${sovereignCount} sovereign${sovereignCount > 1 ? 's' : ''} command the field.` : '';
        this.showToast(
          `⚔ Warfront ${dungeon.name}: ${fallen} of the host annihilated — ${reserves} remain. ${lost} shadows fell and rose again.${led}`,
          'info'
        );
      }
    } catch (error) {
      this.errorLog?.('WARFRONT', 'warfront tick failed', error);
    }
  },

  _onMobKilled(channelKey, dungeon, mobRank, killCount = 1) {
    if (!dungeon || typeof dungeon !== 'object') return;
    if (!Number.isFinite(killCount) || killCount <= 0) killCount = 1;
    if (!dungeon.mobs || typeof dungeon.mobs !== 'object') {
      dungeon.mobs = { killed: 0, remaining: 0, activeMobs: [], total: 0 };
    }
    if (!Number.isFinite(dungeon.mobs.killed)) dungeon.mobs.killed = 0;
    if (!Number.isFinite(dungeon.mobs.remaining)) dungeon.mobs.remaining = 0;

    dungeon.mobs.killed += killCount;
    dungeon.mobs.remaining = Math.max(0, dungeon.mobs.remaining - killCount);
    // WARFRONT: every kill — frontline object-sim or aggregate war — depletes
    // the gate's war host. Single decrement point for both layers.
    if (dungeon.war && Number.isFinite(dungeon.war.reserves)) {
      dungeon.war.reserves = Math.max(0, dungeon.war.reserves - killCount);
      dungeon.war.fallen = (dungeon.war.fallen || 0) + killCount;
    }

    if (!this.settings.mobKillNotifications) this.settings.mobKillNotifications = {};
    if (!this.settings.mobKillNotifications[channelKey]) {
      this.settings.mobKillNotifications[channelKey] = { count: 0, lastNotification: Date.now() };
    }
    this.settings.mobKillNotifications[channelKey].count += killCount;

    // Batch mob XP per dungeon run and award once on dungeon completion.
    // This prevents XP-event fanout during high-kill combat bursts.
    const xpPerKill = this.calculateMobXP(mobRank, true, dungeon?.rank);
    if (xpPerKill > 0) {
      const totalMobXP = xpPerKill * killCount;
      this._queuePendingDungeonMobXP(channelKey, dungeon, totalMobXP, killCount);
    }

    // Award shadow essence on every mob kill — batched per dungeon to avoid
    // event storm during high-kill ticks. Accumulated in dungeon state and
    // flushed periodically + on completion.
    if (!dungeon._pendingEssence) dungeon._pendingEssence = 0;
    dungeon._pendingEssence += killCount;
    // Flush essence every 10 kills to keep ShadowArmy roughly up to date
    // without emitting on every single kill (which could be 50+ per tick).
    if (dungeon._pendingEssence >= 10) {
      const essenceAmount = dungeon._pendingEssence;
      const resolvedMobRank = mobRank || dungeon.rank || 'E';
      const perKill = this.shadowArmy?.settings?.shadowEssence?.essencePerMobKill?.[resolvedMobRank]
        || this.shadowArmy?.defaultSettings?.shadowEssence?.essencePerMobKill?.[resolvedMobRank]
        || 1;
      const itemVaultEssenceAmount = essenceAmount * perKill;
      dungeon._pendingEssence = 0;
      try {
        if (SLEvents) {
          SLEvents.emit('Dungeons:awardEssence', {
            amount: essenceAmount,
            mobRank: resolvedMobRank,
            source: 'mob_kill',
          });
          // Mirror to ItemVault
          SLEvents.emit('ItemVault:add', {
            itemId: 'shadow_essence',
            amount: itemVaultEssenceAmount,
            source: 'Dungeons',
            meta: { mobRank: resolvedMobRank, trigger: 'mob_kill' },
          });
        }
      } catch (_) {}
    }

    // Demon Castle: collect demon souls + roll entry permit drops + check floor clear
    if (dungeon._isDemonCastle) {
      if (this._demonCastle) {
        this._demonCastle.totalDemonSouls = (this._demonCastle.totalDemonSouls || 0) + killCount;
        this._demonCastle.totalDemonsKilled = (this._demonCastle.totalDemonsKilled || 0) + killCount;
      }
      // Deposit demon souls into ItemVault
      try {
        SLEvents.emit('ItemVault:add', {
          itemId: 'demon_soul',
          amount: killCount,
          source: 'Dungeons',
          meta: { floor: dungeon._dcFloor },
        });
      } catch (_) {}
      if (typeof this._rollDemonCastlePermitDrop === 'function') {
        this._rollDemonCastlePermitDrop(dungeon._dcFloor, killCount);
      }
      if (typeof this._checkDemonCastleFloorClear === 'function') {
        this._checkDemonCastleFloorClear(channelKey, dungeon);
      }
    }
  },

  _grantUserDungeonXP(amount, source = 'dungeon', context = {}) {
    const xpAmount = Math.floor(Number(amount) || 0);
    if (xpAmount <= 0) return false;
    if (!this.soloLevelingStats) return false;

    if (typeof this.soloLevelingStats.addXP === 'function') {
      this.soloLevelingStats.addXP(xpAmount, {
        source,
        shareShadowXP: false,
      });
      return true;
    }

    this.errorLog(true, 'DUNGEON_XP_API_MISSING: SoloLevelingStats.addXP unavailable; XP not granted', {
      source,
      xpAmount,
      ...context,
    });
    return false;
  },

  _getOrCreateShadowContributionEntry(dungeon, shadowId) {
    if (!dungeon || shadowId === null || shadowId === undefined) return null;
    const sid = String(shadowId).trim();
    if (!sid) return null;

    if (!dungeon.shadowContributions || typeof dungeon.shadowContributions !== 'object') {
      dungeon.shadowContributions = {};
    }

    if (!dungeon.shadowContributions[sid] || typeof dungeon.shadowContributions[sid] !== 'object') {
      dungeon.shadowContributions[sid] = { mobsKilled: 0, bossDamage: 0 };
    }

    const entry = dungeon.shadowContributions[sid];
    if (!Number.isFinite(entry.mobsKilled)) entry.mobsKilled = 0;
    if (!Number.isFinite(entry.bossDamage)) entry.bossDamage = 0;
    return entry;
  },

  _addShadowContribution(dungeon, shadowId, field, amount) {
    if (!(Number.isFinite(amount) && amount > 0)) return false;
    if (field !== 'mobsKilled' && field !== 'bossDamage') return false;

    const entry = this._getOrCreateShadowContributionEntry(dungeon, shadowId);
    if (!entry) return false;
    entry[field] += amount;
    return true;
  },

  _getMobContributionLedger(dungeon, createIfMissing = false) {
    if (!dungeon || typeof dungeon !== 'object') return null;

    if (
      dungeon._mobContributionByMobId &&
      typeof dungeon._mobContributionByMobId === 'object' &&
      !Array.isArray(dungeon._mobContributionByMobId)
    ) {
      return dungeon._mobContributionByMobId;
    }

    if (!createIfMissing) return null;
    dungeon._mobContributionByMobId = Object.create(null);
    return dungeon._mobContributionByMobId;
  },

  _recordShadowMobDamageContribution(dungeon, mobId, shadowId, damage) {
    if (!(Number.isFinite(damage) && damage > 0)) return false;
    if (!mobId || shadowId === null || shadowId === undefined) return false;
    const sid = String(shadowId).trim();
    if (!sid) return false;

    const ledger = this._getMobContributionLedger(dungeon, true);
    if (!ledger) return false;

    const mid = String(mobId);
    if (!ledger[mid] || typeof ledger[mid] !== 'object') {
      ledger[mid] = Object.create(null);
    }

    ledger[mid][sid] = (Number(ledger[mid][sid]) || 0) + damage;
    return true;
  },

  _applyMobKillContributionsFromLedger(dungeon, mobId, killCount = 1) {
    if (!mobId || !(Number.isFinite(killCount) && killCount > 0)) return false;

    const ledger = this._getMobContributionLedger(dungeon, false);
    if (!ledger) return false;

    const mid = String(mobId);
    const contributionEntry = ledger[mid];
    if (!contributionEntry || typeof contributionEntry !== 'object') return false;

    const contributors = Object.entries(contributionEntry)
      .map(([shadowId, dmg]) => [String(shadowId), Number(dmg)])
      .filter(([shadowId, dmg]) => shadowId && Number.isFinite(dmg) && dmg > 0);

    delete ledger[mid];
    if (contributors.length === 0) return false;

    const totalDamage = contributors.reduce((sum, [, dmg]) => sum + dmg, 0);
    if (!(totalDamage > 0)) return false;

    for (const [shadowId, damage] of contributors) {
      const killShare = (damage / totalDamage) * killCount;
      this._addShadowContribution(dungeon, shadowId, 'mobsKilled', killShare);
    }

    return true;
  },

  _pruneShadowMobContributionLedger(dungeon) {
    const ledger = this._getMobContributionLedger(dungeon, false);
    if (!ledger) return;

    const activeMobIds = new Set();
    const activeMobs = dungeon?.mobs?.activeMobs || [];
    for (const mob of activeMobs) {
      if (!mob || mob.hp <= 0) continue;
      const mobId = this.getEnemyKey(mob, 'mob');
      mobId && activeMobIds.add(String(mobId));
    }

    let remainingEntries = 0;
    for (const mobId of Object.keys(ledger)) {
      if (!activeMobIds.has(mobId)) {
        delete ledger[mobId];
      } else {
        remainingEntries++;
      }
    }

    if (remainingEntries === 0) {
      delete dungeon._mobContributionByMobId;
    }
  },

  _buildShadowContributionWeights(shadows = []) {
    const normalized = Array.isArray(shadows) ? shadows : [];
    const weights = [];
    let totalWeight = 0;

    for (const shadow of normalized) {
      const shadowId = this.getShadowIdValue(shadow);
      if (!shadowId) continue;

      const score = this.getShadowCombatScore(shadow);
      const weight = Number.isFinite(score) && score > 0 ? score : 1;
      weights.push({ shadowId: String(shadowId), weight });
      totalWeight += weight;
    }

    return { weights, totalWeight };
  },

  _distributeWeightedShadowContribution(dungeon, weights, totalWeight, field, totalAmount) {
    if (!(Number.isFinite(totalAmount) && totalAmount > 0)) return false;
    if (!Array.isArray(weights) || weights.length === 0) return false;

    const safeTotalWeight = Number.isFinite(totalWeight) && totalWeight > 0 ? totalWeight : weights.length;
    for (const entry of weights) {
      if (!entry || !entry.shadowId) continue;
      const weight = Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight : 1;
      const share = totalAmount * (weight / safeTotalWeight);
      this._addShadowContribution(dungeon, entry.shadowId, field, share);
    }
    return true;
  },

  _applyFallbackMobKillContribution(dungeon, assignedShadows = [], fallbackShadowId = null, killCount = 1) {
    const safeKillCount =
      Number.isFinite(killCount) && killCount > 0 ? Math.floor(killCount) : 1;

    if (
      fallbackShadowId &&
      this._addShadowContribution(dungeon, fallbackShadowId, 'mobsKilled', safeKillCount)
    ) {
      return true;
    }

    const { weights, totalWeight } = this._buildShadowContributionWeights(assignedShadows);
    return this._distributeWeightedShadowContribution(
      dungeon,
      weights,
      totalWeight,
      'mobsKilled',
      safeKillCount
    );
  },

  _logMobContributionMiss(channelKey, mobId, extra = null) {
    const logKey = String(channelKey || 'unknown');
    const now = Date.now();
    const cooldownMs = 15000;
    const state = this._mobContributionMissLogState.get(logKey) || { lastAt: 0, suppressed: 0 };

    if (now - state.lastAt < cooldownMs) {
      state.suppressed += 1;
      this._mobContributionMissLogState.set(logKey, state);
      return;
    }

    this._mobContributionMissLogState.set(logKey, { lastAt: now, suppressed: 0 });
    this.errorLog(
      true,
      'MOB_CONTRIBUTION_MISS: Missing shadow damage attribution for mob kill',
      {
        channelKey,
        mobId,
        suppressedSinceLast: state.suppressed || 0,
        ...(extra && typeof extra === 'object' ? extra : {}),
      }
    );
  },

  _getDungeonShadowCombatContext(channelKey, dungeon) {
    const assignedShadows = this.shadowAllocations.get(channelKey) || dungeon.shadowAllocation?.shadows || [];
    const shadowHP = dungeon.shadowHP || (dungeon.shadowHP = new Map());
    const deadShadows = this.deadShadows.get(channelKey) || new Set();
    this.maybePruneDungeonShadowState({ dungeon, channelKey, assignedShadows, deadShadows });
    return { assignedShadows, shadowHP, deadShadows };
  },

  async _applyAccumulatedShadowAndUserDamage({
    shadowDamageMap,
    assignedShadows,
    shadowHP,
    deadShadows,
    channelKey,
    totalUserDamage,
    dungeon,
    userDamageToast = null,
    shadowByIdMap = null, // Optional pre-built Map for O(1) lookup (avoids O(N) .find per entry)
    damageAlreadyApplied = false, // When true, HP already deducted (per-round processing); skip Phase 1 damage, only collect deaths
  }) {
    // PERF: O(1) Map lookup — without this, N damaged × M assigned = O(NM) per tick
    const shadowById = shadowByIdMap || new Map(
      assignedShadows.map((s) => [this.getShadowIdValue(s), s])
    );

    // damageAlreadyApplied=true: HP already deducted per-round; just scan for deaths
    const newlyDead = [];
    for (const [shadowId, damage] of shadowDamageMap.entries()) {
      const targetShadow = shadowById.get(shadowId);
      const shadowHPData = shadowHP.get(shadowId);
      if (!targetShadow || !shadowHPData) continue;

      if (damageAlreadyApplied) {
        // Damage already applied per-round — just check if dead
        if (shadowHPData.hp <= 0) {
          newlyDead.push({ shadowId, targetShadow, shadowHPData });
        }
      } else {
        const oldHP = shadowHPData.hp;
        shadowHPData.hp = Math.max(0, shadowHPData.hp - damage);
        shadowHP.set(shadowId, shadowHPData);

        if (oldHP > 0 && shadowHPData.hp <= 0) {
          newlyDead.push({ shadowId, targetShadow, shadowHPData });
        }
      }
    }

    // PERF: Batched resurrection — one mana write-back for all deaths this tick
    if (newlyDead.length > 0 && this.soloLevelingStats) {
      if (!dungeon._lastResurrectionAttempt) dungeon._lastResurrectionAttempt = {};
      const now = Date.now();

      // BUGFIX: Parallel mode uses per-dungeon mana budget; defer write-back to post-Promise.all
      if (this._tickManaBudgetPerDungeon === undefined) {
        this.syncManaFromStats();
      }
      let manaPool = this._tickManaBudgetPerDungeon !== undefined
        ? this._tickManaBudgetPerDungeon - (dungeon._tickManaUsed || 0)
        : (this.settings.userMana || 0);

      const { getRankIndex } = require('../shared/rank-utils');
      newlyDead.sort((a, b) => getRankIndex(b.targetShadow.rank) - getRankIndex(a.targetShadow.rank));

      let resurrectedCount = 0;
      for (const { shadowId, targetShadow, shadowHPData } of newlyDead) {
        dungeon._lastResurrectionAttempt[shadowId] = now;
        const cost = this.getResurrectionCost(targetShadow.rank || 'E');

        if (manaPool >= cost) {
          manaPool -= cost;
          resurrectedCount++;

          if (!shadowHPData.maxHp || shadowHPData.maxHp <= 0) {
            const recalculatedHP = this.initializeShadowHPSync(targetShadow, shadowHP);
            if (recalculatedHP) shadowHPData.maxHp = recalculatedHP.maxHp;
          }
          shadowHPData.hp = shadowHPData.maxHp || 1;
          shadowHP.set(shadowId, { ...shadowHPData });
          deadShadows.delete(shadowId);
          delete dungeon._lastResurrectionAttempt[shadowId];
        }
      }

      if (resurrectedCount > 0) {
        if (this._tickManaBudgetPerDungeon !== undefined) {
          const totalSpent = (this._tickManaBudgetPerDungeon - (dungeon._tickManaUsed || 0)) - manaPool;
          dungeon._tickManaUsed = (dungeon._tickManaUsed || 0) + Math.max(0, totalSpent);
        } else {
          this.settings.userMana = Math.max(0, manaPool);
          this.pushManaToStats(false);
        }
        dungeon.shadowRevives = (dungeon.shadowRevives || 0) + resurrectedCount;
        dungeon.successfulResurrections = (dungeon.successfulResurrections || 0) + resurrectedCount;
        this.markCombatSettingsDirty('batch-resurrection');
        this.startRegeneration(); // PERF: restart regen if it was paused
      }

      if (dungeon._cachedAliveCount != null) {
        dungeon._cachedAliveCount = Math.max(0, dungeon._cachedAliveCount - newlyDead.length + resurrectedCount);
      }
    }

    if (totalUserDamage > 0) {
      const adjustedUserDamage = this.applyStatusAdjustedIncomingDamage(
        channelKey,
        'user',
        'user',
        totalUserDamage,
        Date.now()
      );
      this.syncHPFromStats();
      this.settings.userHP = this._applyUserHpFloor(this.settings.userHP - adjustedUserDamage);
      this.pushHPToStats(true);
      this.updateStatsUI();
      this.startRegeneration(); // PERF: restart regen if it was paused

      if (userDamageToast && dungeon.userParticipating) {
        this.showToast(userDamageToast(adjustedUserDamage), 'error');
      }

      if (this.settings.userHP <= 0) {
        await this.handleUserDefeat(channelKey);
      }
    }
  },

  _createBossHPBarInPreferredContainer(channelKey) {
    const channelHeader = this.findChannelHeader();
    if (channelHeader) {
      const headerContainer = channelHeader.parentElement || channelHeader;
      if (headerContainer.isConnected) {
        this.createBossHPBarInContainer(headerContainer, channelKey);
      }
    }

    let hpBar = this.bossHPBars.get(channelKey);
    if (!hpBar) {
      const channelContainer = this.findChannelContainer();
      if (channelContainer && channelContainer.isConnected) {
        this.createBossHPBarInContainer(channelContainer, channelKey);
        hpBar = this.bossHPBars.get(channelKey);
      }
    }

    return hpBar || null;
  }
};
