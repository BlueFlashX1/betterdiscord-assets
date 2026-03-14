module.exports = {
  calculateHPSync(vitality, rank = 'E') {
    const safeVitalityRaw = Number(vitality);
    const safeVitality = Number.isFinite(safeVitalityRaw) ? Math.max(0, safeVitalityRaw) : 0;
    const rankIndex = this.getRankIndexValue(rank);
    const rankHpBonus = this.getUserRankHpBonusByIndex(rankIndex);
    return 100 + safeVitality * 10 + rankHpBonus;
  },

  getUserRankHpBonusByIndex(rankIndex) {
    const safeRankIndex = Number.isFinite(rankIndex) ? Math.max(0, rankIndex) : 0;
    const linearStep = Number.isFinite(this.settings?.userRankHpLinearStep)
      ? this.settings.userRankHpLinearStep
      : 50;
    const curveStep = Number.isFinite(this.settings?.userRankHpCurveStep)
      ? this.settings.userRankHpCurveStep
      : 35;
    return Math.max(0, Math.floor(safeRankIndex * linearStep + safeRankIndex * safeRankIndex * curveStep));
  },

  calculateShadowArmyHpBonus(shadowCount, rank = 'E') {
    const safeShadowCountRaw = Number(shadowCount);
    const safeShadowCount = Number.isFinite(safeShadowCountRaw) ? Math.max(0, Math.floor(safeShadowCountRaw)) : 0;
    if (safeShadowCount <= 0) return 0;

    const rankIndex = this.getRankIndexValue(rank);
    const perShadowBase = Number.isFinite(this.settings?.userHpPerShadowBase)
      ? this.settings.userHpPerShadowBase
      : 8;
    const perShadowRankStep = Number.isFinite(this.settings?.userHpPerShadowRankStep)
      ? this.settings.userHpPerShadowRankStep
      : 0.6;
    const perShadowValue = Math.max(0, perShadowBase + rankIndex * perShadowRankStep);

    const softCapCount = Number.isFinite(this.settings?.userHpShadowSoftCapCount)
      ? Math.max(0, Math.floor(this.settings.userHpShadowSoftCapCount))
      : 500;
    const tailMultiplier = Number.isFinite(this.settings?.userHpShadowSoftCapMultiplier)
      ? this.clampNumber(this.settings.userHpShadowSoftCapMultiplier, 0, 1)
      : 0.12;

    const primaryCount = Math.min(safeShadowCount, softCapCount);
    const overflowCount = Math.max(0, safeShadowCount - softCapCount);
    const primaryBonus = primaryCount * perShadowValue;
    const overflowBonus = overflowCount * perShadowValue * tailMultiplier;
    return Math.max(0, Math.floor(primaryBonus + overflowBonus));
  },

  async calculateHP(vitality, rank = 'E', includeShadowBonus = false) {
    const baseHP = this.calculateHPSync(vitality, rank);

    if (includeShadowBonus) {
      const shadowCount = await this.getShadowCount();
      const shadowArmyBonus = this.calculateShadowArmyHpBonus(shadowCount, rank);
      return baseHP + shadowArmyBonus;
    }

    return baseHP;
  },

  async calculateMana(intelligence, level = 1) {
    const safeLevel = Number.isFinite(level) ? Math.max(1, level) : 1;
    return 100 + intelligence * 12 + safeLevel * 8;
  },

  async recalculateUserHP() {
    if (!this.soloLevelingStats) return;

    // CRITICAL: Sync HP from Stats plugin first (get latest value)
    this.syncHPFromStats();

    const totalStats = this.getUserEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const rank = this.soloLevelingStats.settings?.rank || 'E';
    await this.getShadowCount(); // Cache shadow count for HP calculation

    const oldMaxHP = this.settings.userMaxHP || 0;
    this.settings.userMaxHP = await this.calculateHP(vitality, rank, true);

    // If max HP increased, increase current HP proportionally
    if (this.settings.userMaxHP > oldMaxHP) {
      const hpIncrease = this.settings.userMaxHP - oldMaxHP;
      this.settings.userHP = Math.min(
        this.settings.userMaxHP,
        (this.settings.userHP || 0) + hpIncrease
      );
    }

    // CRITICAL: Push HP to Stats plugin and update UI in real-time
    this.pushHPToStats(true); // Save immediately
    this.updateStatsUI(); // Real-time UI update
  },

  async recalculateUserMana() {
    if (!this.soloLevelingStats) return;

    // CRITICAL: Sync mana from Stats plugin first (get latest value)
    this.syncManaFromStats();

    const totalStats = this.getUserEffectiveStats();
    const intelligence = totalStats.intelligence || 0;
    const level = this.soloLevelingStats?.settings?.level || 1;

    const oldMaxMana = this.settings.userMaxMana || 0;
    this.settings.userMaxMana = await this.calculateMana(intelligence, level);

    // If max mana increased, increase current mana proportionally
    if (this.settings.userMaxMana > oldMaxMana) {
      const manaIncrease = this.settings.userMaxMana - oldMaxMana;
      this.settings.userMana = Math.min(
        this.settings.userMaxMana,
        this.settings.userMana + manaIncrease
      );
      // Mana pool updated silently
    } else {
      // Clamp current mana if max dropped (e.g., buff expired)
      this.settings.userMana = Math.min(this.settings.userMaxMana, this.settings.userMana || 0);
    }

    // CRITICAL: Push Mana to Stats plugin and update UI in real-time
    this.pushManaToStats(true); // Save immediately
    this.updateStatsUI(); // Real-time UI update
    this.saveSettings();
  },

  calculateBossBaseStats(rankIndex) {
    // Fresh random roll per boss instance (not cached — bosses spawn infrequently)
    const mobBase = this.calculateMobBaseStats(rankIndex);
    const multiplier = 2.2 + Math.random() * 0.8; // 2.2–3.0x (boss is much stronger than mobs)

    // Derive boss stats from mob baseline so scaling stays consistent
    const strength = Math.floor(mobBase.strength * multiplier);
    const agility = Math.floor(mobBase.agility * multiplier);
    const intelligence = Math.floor(mobBase.intelligence * multiplier);
    const vitality = Math.floor(mobBase.vitality * multiplier);

    // Perception derived from average of primary stats with the same multiplier, scaled down
    const avgCore = (mobBase.strength + mobBase.agility + mobBase.intelligence) / 3;
    const perception = Math.floor(avgCore * multiplier * 0.5);

    return { strength, agility, intelligence, vitality, perception };
  },

  calculateMobBaseStats(rankIndex) {
    // O(1) lookup from precomputed typed arrays (quadratic+linear scaling)
    const i = Math.min(rankIndex, (this._mobStatTable?.strength?.length || 12) - 1);
    if (this._mobStatTable) {
      return {
        strength:     this._mobStatTable.strength[i],
        agility:      this._mobStatTable.agility[i],
        intelligence: this._mobStatTable.intelligence[i],
        vitality:     this._mobStatTable.vitality[i],
      };
    }
    // Fallback if tables not built yet
    return {
      strength:     100 + rankIndex * 50 + Math.floor(rankIndex * rankIndex * 15),
      agility:      80  + rankIndex * 40 + Math.floor(rankIndex * rankIndex * 12),
      intelligence: 60  + rankIndex * 30 + Math.floor(rankIndex * rankIndex * 8),
      vitality:     150 + rankIndex * 100 + Math.floor(rankIndex * rankIndex * 40),
    };
  },

  startRegeneration() {
    if (this.regenInterval) {
      this.debugLog('⏰ Regeneration interval already running');
      return; // Already running
    }

    this.debugLog('⏰ Regeneration interval started (auto-pauses when full)');
    // Start HP/Mana regeneration interval
    this.regenInterval = setInterval(() => {
      if (!this.isWindowVisible()) return; // PERF(P5-3): Skip regen when hidden
      this.regenerateHPAndMana();
    }, 3000); // Regenerate every 3 seconds
    this._intervals.add(this.regenInterval);
  },

  stopRegeneration() {
    if (this.regenInterval) {
      clearInterval(this.regenInterval);
      this.regenInterval = null;
      this._regenDebugShown = false;
      this.debugLog('⏸️ Regeneration paused (HP & Mana full)');
    }
  },

  _hasActiveDungeonCombat() {
    if (!this.activeDungeons || this.activeDungeons.size === 0) return false;
    for (const dungeon of this.activeDungeons.values()) {
      if (!dungeon || dungeon.completed || dungeon.failed || !dungeon.shadowsDeployed) continue;
      const bossAlive = (dungeon?.boss?.hp || 0) > 0;
      const mobsRemaining = Number.isFinite(dungeon?.mobs?.remaining)
        ? dungeon.mobs.remaining
        : dungeon?.mobs?.activeMobs?.length || 0;
      if (bossAlive || mobsRemaining > 0) return true;
    }
    return false;
  },

  regenerateHPAndMana() {
    if (!this.soloLevelingStats) {
      this.debugLogOnce(
        'REGEN_SKIPPED:NO_STATS',
        'Regeneration skipped: SoloLevelingStats plugin not available'
      );
      return;
    }

    // CRITICAL: SYNC FROM STATS PLUGIN FIRST (pull latest values before regenerating)
    // SoloLevelingStats may have its own regeneration or HP changes we need to respect
    this.syncHPAndManaFromStats();

    // Get total effective stats (including buffs) and level
    const totalStats = this.getUserEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const intelligence = totalStats.intelligence || 0;
    const level = this.soloLevelingStats?.settings?.level || 1;

    // Debug logging (first run only)
    if (!this._regenDebugShown) {
      this.debugLog('Regeneration system active', {
        level,
        vitality,
        intelligence,
        currentHP: this.settings.userHP,
        maxHP: this.settings.userMaxHP,
        currentMana: this.settings.userMana,
        maxMana: this.settings.userMaxMana,
      });
      this._regenDebugShown = true;
    }

    // VALIDATION: Ensure HP/Mana values are valid numbers
    if (typeof this.settings.userHP !== 'number' || isNaN(this.settings.userHP)) {
      this.settings.userHP = this.settings.userMaxHP || 100;
    }
    if (typeof this.settings.userMana !== 'number' || isNaN(this.settings.userMana)) {
      this.settings.userMana = this.settings.userMaxMana || 100;
    }
    if (
      typeof this.settings.userMaxHP !== 'number' ||
      isNaN(this.settings.userMaxHP) ||
      this.settings.userMaxHP <= 0
    ) {
      this.settings.userMaxHP = 100;
    }
    if (
      typeof this.settings.userMaxMana !== 'number' ||
      isNaN(this.settings.userMaxMana) ||
      this.settings.userMaxMana <= 0
    ) {
      this.settings.userMaxMana = 100;
    }

    // HP regeneration: 1% of max HP per second per 100 vitality
    // Formula: (vitality / 100) * 0.01 * maxHP per second
    let hpChanged = false;
    let manaChanged = false;
    const skillBonuses = this.getSkillTreeBonuses?.() || {};
    const hpRegenMultiplier = 1 + Math.max(0, Number(skillBonuses.hpRegenBonus || 0));
    const manaRegenMultiplier = 1 + Math.max(0, Number(skillBonuses.manaRegenBonus || 0));

    // DETECTION: Check if regeneration is needed
    const needsHPRegen = this.settings.userHP < this.settings.userMaxHP;
    const needsManaRegen = this.settings.userMana < this.settings.userMaxMana;

    // PERF: Stop interval entirely when both are full — restarts on damage/mana spend
    if (!needsHPRegen && !needsManaRegen) {
      this.stopRegeneration();
      return;
    }

    // HP REGENERATION: Execute if HP is below max
    if (needsHPRegen) {
      // Enhanced regeneration formula with level and stat scaling
      const baseRate = 0.005; // 0.5% base regeneration
      const statRate = (vitality / 50) * 0.005; // 0.5% per 50 vitality (1% per 100)
      const levelRate = (level / 10) * 0.002; // 0.2% per 10 levels
      const totalRate = (baseRate + statRate + levelRate) * hpRegenMultiplier;

      const hpRegen = Math.max(1, Math.floor(this.settings.userMaxHP * totalRate));
      const oldHP = this.settings.userHP;
      this.settings.userHP = Math.min(this.settings.userMaxHP, this.settings.userHP + hpRegen);

      // Debug: Log HP regeneration (first 3 times only, debug mode only)
      if (!this._hpRegenCount) this._hpRegenCount = 0;
      if (this._hpRegenCount < 3 && this.settings.userHP !== oldHP) {
        this.debugLog(
          `HP Regen: +${hpRegen}/sec (${(totalRate * 100).toFixed(2)}% rate) | ${oldHP} -> ${
            this.settings.userHP
          } / ${this.settings.userMaxHP}`
        );
        this._hpRegenCount++;
      }

      hpChanged = this.settings.userHP !== oldHP;

      // BIDIRECTIONAL SYNC: Push HP changes to SoloLevelingStats immediately
      if (hpChanged) {
        this.pushHPToStats(false); // Don't save immediately, will batch save later
      }

      // Track regeneration state (logging removed - visible in UI)
      if (!this._hpRegenActive) {
        this._hpRegenActive = true;
      }

      // Reset flag when HP becomes full
      if (this.settings.userHP >= this.settings.userMaxHP && this._hpRegenActive) {
        this._hpRegenActive = false;
      }

      // HP save batched below with mana
    } else {
      this._hpRegenActive = false;
    }

    // MANA REGENERATION: Execute if Mana is below max
    // Uses sqrt scaling for INT with mode-aware caps:
    // - In combat: intentionally low regen so resurrection costs matter.
    // - Out of combat: faster refill for QoL between fights.
    if (needsManaRegen) {
      const inCombat = this._hasActiveDungeonCombat();
      const baseRate = inCombat ? 0.0015 : 0.008;
      const statRate = inCombat
        ? (Math.sqrt(intelligence) / 18) * 0.0015
        : (Math.sqrt(intelligence) / 12) * 0.007; // sqrt diminishing returns
      const levelRate = inCombat ? (level / 20) * 0.0005 : (level / 10) * 0.003;
      const capRate = inCombat ? 0.02 : 0.10; // Combat regen intentionally much lower
      const totalRate = Math.min(capRate, (baseRate + statRate + levelRate) * manaRegenMultiplier);

      const manaRegen = Math.max(1, Math.floor(this.settings.userMaxMana * totalRate));
      const oldMana = this.settings.userMana;
      this.settings.userMana = Math.min(
        this.settings.userMaxMana,
        this.settings.userMana + manaRegen
      );

      if (!this._manaRegenCount) this._manaRegenCount = 0;
      if (this._manaRegenCount < 3 && this.settings.userMana !== oldMana) {
        this.debugLog(
          `Mana Regen: +${manaRegen}/sec (${(totalRate * 100).toFixed(2)}% rate) | ${oldMana} -> ${
            this.settings.userMana
          } / ${this.settings.userMaxMana}`
        );
        this._manaRegenCount++;
      }

      manaChanged = this.settings.userMana !== oldMana;

      if (manaChanged) {
        this.pushManaToStats(false); // UI-only — saves handled by debounced saveSettings below
        this.updateStatsUI();
      }

      if (!this._manaRegenActive) this._manaRegenActive = true;
      if (this.settings.userMana >= this.settings.userMaxMana && this._manaRegenActive) {
        this._manaRegenActive = false;
      }
    } else {
      this._manaRegenActive = false;
    }

    // BATCHED SAVE: Single save for both HP and Mana changes (was 2 saves per tick)
    if (hpChanged || manaChanged) {
      this.saveSettings();
    }

    // Periodic Stats plugin save — every 30 ticks (~30s) instead of every tick
    // Dungeons saveSettings() at line above handles Dungeons persistence already
    if (hpChanged || manaChanged) {
      if (!this._regenCycleCount) this._regenCycleCount = 0;
      this._regenCycleCount++;
      if (this._regenCycleCount >= 30) {
        if (typeof this.soloLevelingStats?.saveSettings === 'function') {
          this.soloLevelingStats.saveSettings();
        }
        this._regenCycleCount = 0;
      }
    }
  },

  async handleUserDefeat(channelKey) {
    // CRITICAL: Sync HP from Stats plugin to get the absolute latest value
    // This prevents false defeat notifications due to stale HP values
    this.syncHPFromStats();

    // VALIDATION: Double-check HP is actually 0 before showing defeat
    if (this.settings.userHP > 0) {
      this.debugLog('DEFEAT_CHECK', 'Defeat triggered but HP > 0, ignoring', {
        userHP: this.settings.userHP,
        userMaxHP: this.settings.userMaxHP,
        channelKey,
      });
      return; // HP is not 0, don't process defeat
    }

    const dungeon = this.activeDungeons.get(channelKey);

    // Check if shadows are actually all dead BEFORE clearing them
    let shadowsWereAlive = false;
    if (dungeon) {
      const allShadows = await this.getAllShadows();
      const shadowHP = dungeon.shadowHP || new Map();
      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      for (const s of allShadows) {
        if (!s || !s.id) continue;
        if (deadShadows.has(s.id)) continue;
        if (shadowHP.get(s.id)?.hp > 0) {
          shadowsWereAlive = true;
          break;
        }
      }
    }

    this.showToast('You were defeated!', 'error');

    // Remove user from current dungeon participation
    if (dungeon) {
      dungeon.userParticipating = false;
    }

    // Clear active dungeon
    this.settings.userActiveDungeon = null;

    // KEEP channel lock active — dungeon is still running with shadows fighting
    // Lock is released when dungeon actually completes (boss death or timeout)

    // SHADOWS PERSIST: Keep shadows fighting even when user is defeated
    // Do NOT stop shadow attacks — shadows continue combat autonomously
    // The combat loop (_combatLoopTick) will keep processing shadow attacks

    // DO NOT clear shadow HP - shadows persist and continue fighting
    // Shadows can still fight even if user is defeated

    // Only show "All shadows defeated" if shadows were actually alive before defeat
    if (shadowsWereAlive) {
      this.showToast('All shadows defeated. Rejoin when HP regenerates.', 'info');
    }

    this.saveSettings();
  },

  getUserStats() {
    if (!this.soloLevelingStats?.settings) return null;

    return {
      stats:
        this.soloLevelingStats.getTotalEffectiveStats?.() ||
        this.soloLevelingStats.settings.stats ||
        {},
      rank: this.soloLevelingStats.settings.rank || 'E',
      level: this.soloLevelingStats.settings.level || 1,
      hp: this.soloLevelingStats.settings.userHP,
      maxHP: this.soloLevelingStats.settings.userMaxHP,
      mana: this.soloLevelingStats.settings.userMana,
      maxMana: this.soloLevelingStats.settings.userMaxMana,
    };
  },

  getUserEffectiveStats() {
    // Check cache first
    const now = Date.now();
    if (
      this._cache.userEffectiveStats &&
      this._cache.userEffectiveStatsTime &&
      now - this._cache.userEffectiveStatsTime < this._cache.userEffectiveStatsTTL
    ) {
      return this._cache.userEffectiveStats;
    }

    const result =
      this.soloLevelingStats?.getTotalEffectiveStats?.() ||
      this.soloLevelingStats?.settings?.stats ||
      this.getUserStats()?.stats ||
      {};

    // Cache the result
    this._cache.userEffectiveStats = result;
    this._cache.userEffectiveStatsTime = now;

    return result;
  },

  getShadowIdValue(shadow) {
    return shadow?.id || shadow?.i || null;
  },

  normalizeShadowId(shadow) {
    if (!shadow) return null;
    const stableId = this.getShadowIdValue(shadow);
    return stableId && !shadow.id ? { ...shadow, id: stableId } : shadow;
  },

  clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  _clampStat(value, min, max, label) {
    const clamped = Math.max(min, Math.min(max, value));
    if (clamped !== value && this.settings.debug) {
      this.debugLog('CLAMP', `Clamped ${label}: ${value} -> ${clamped}`);
    }
    return clamped;
  },

  normalizeRankLabel(rank, rankArray = this.settings?.dungeonRanks) {
    const list = Array.isArray(rankArray) && rankArray.length ? rankArray : ['E'];
    if (rank == null) return list[0] || 'E';

    const raw = String(rank).trim();
    if (!raw) return list[0] || 'E';

    const normalizeKey = (value) =>
      String(value || '')
        .toLowerCase()
        .replace(/[\s_-]+/g, ' ')
        .trim();

    const canonicalByNormalized = new Map(
      list.map((entry) => [normalizeKey(entry), String(entry)])
    );
    const tryResolve = (candidate) => {
      const value = String(candidate || '').trim();
      if (!value) return null;
      if (list.includes(value)) return value;
      const normalizedMatch = canonicalByNormalized.get(normalizeKey(value));
      if (normalizedMatch) return normalizedMatch;
      const stripped = value.replace(/^\[+|\]+$/g, '').trim();
      if (!stripped) return null;
      if (list.includes(stripped)) return stripped;
      const strippedMatch = canonicalByNormalized.get(normalizeKey(stripped));
      if (strippedMatch) return strippedMatch;
      const upper = stripped.toUpperCase();
      if (list.includes(upper)) return upper;
      return canonicalByNormalized.get(normalizeKey(upper)) || null;
    };

    const candidates = [raw];
    const bracketMatch = raw.match(/\[([^[\]]+)\]/);
    bracketMatch?.[1] && candidates.push(bracketMatch[1]);
    const rankSuffixMatch = raw.match(/([A-Za-z0-9+\s]+)\s*-?\s*rank/i);
    rankSuffixMatch?.[1] && candidates.push(rankSuffixMatch[1]);
    const firstToken = raw.split(/\s+/)[0];
    firstToken && candidates.push(firstToken);

    for (let i = 0; i < candidates.length; i++) {
      const resolved = tryResolve(candidates[i]);
      if (resolved) return resolved;
    }
    return null;
  },

  findRankIndex(rank, rankArray = this.settings?.dungeonRanks) {
    const list = Array.isArray(rankArray) && rankArray.length ? rankArray : ['E'];
    const canonical = this.normalizeRankLabel(rank, list);
    return canonical ? list.indexOf(canonical) : -1;
  },

  getRankIndexValue(rank, rankArray = this.settings?.dungeonRanks) {
    const idx = this.findRankIndex(rank, rankArray);
    return idx >= 0 ? idx : 0;
  },

  getRankPowerValue(rank) {
    const step = this.rankScaling?.powerStep ?? 1.35;
    const list = Array.isArray(this.settings?.dungeonRanks) ? this.settings.dungeonRanks : ['E'];
    const key = `${step}|${list.join(',')}`;
    if (this._rankPowerCacheKey !== key) {
      this._rankPowerCacheKey = key;
      this._rankPowerCache = new Map();
    }

    const cacheKey = this.normalizeRankLabel(rank, list) || list[0] || 'E';
    const cached = this._rankPowerCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const computed = Math.pow(step, this.getRankIndexValue(cacheKey, list));
    this._rankPowerCache.set(cacheKey, computed);
    return computed;
  },

  getShadowCombatScore(shadow) {
    const stats = this.getShadowEffectiveStatsCached(shadow) || {};
    const sum =
      (stats.strength || 0) * 1.0 +
      (stats.intelligence || 0) * 0.8 +
      (stats.agility || 0) * 0.5 +
      (stats.vitality || 0) * 0.6 +
      (stats.perception || 0) * 0.2;
    return this.getRankPowerValue(shadow?.rank || 'E') * (10 + sum);
  },

  getRankDamageMultiplier(attackerRank, defenderRank) {
    const exponent = this.rankScaling?.damageExponent ?? 0.9;
    const min = this.rankScaling?.damageMin ?? 0.25;
    const max = this.rankScaling?.damageMax ?? 4.0;
    const list = Array.isArray(this.settings?.dungeonRanks) ? this.settings.dungeonRanks : ['E'];
    const key = `${exponent}|${min}|${max}|${this.rankScaling?.powerStep ?? 1.35}|${list.join(
      ','
    )}`;
    if (this._rankDamageCacheKey !== key) {
      this._rankDamageCacheKey = key;
      this._rankDamageCache = new Map();
    }

    const a = attackerRank || 'E';
    const d = defenderRank || 'E';
    const pairKey = `${a}|${d}`;
    const cached = this._rankDamageCache.get(pairKey);
    if (cached !== undefined) return cached;

    const defenderPower = this.getRankPowerValue(d);
    const ratio = (Number.isFinite(defenderPower) && defenderPower > 0)
      ? this.getRankPowerValue(a) / defenderPower
      : 1;
    const computed = this.clampNumber(Math.pow(ratio, exponent), min, max);
    this._rankDamageCache.set(pairKey, computed);
    return computed;
  },

  getMobRankHpFactorByIndex(rankIndex) {
    const step = this.rankScaling?.mobHpStep ?? 1.18;
    const maxFactor = this.rankScaling?.mobHpMaxFactor ?? 12;
    return this.clampNumber(Math.pow(step, Math.max(0, rankIndex)), 1, maxFactor);
  },

  getShadowRankHpFactorByIndex(rankIndex) {
    const base = this.rankScaling?.shadowHpBaseFactor ?? 0.9;
    const step = this.rankScaling?.shadowHpStep ?? 0.05;
    const maxFactor = this.rankScaling?.shadowHpMaxFactor ?? 1.5;
    return this.clampNumber(base + Math.max(0, rankIndex) * step, base, maxFactor);
  },

  getEnemyKey(enemy, fallbackType = 'mob') {
    if (!enemy || typeof enemy !== 'object') return null;
    const type = enemy.type || fallbackType;
    return enemy.id || enemy.name || (type === 'boss' ? 'boss' : null);
  },

  _normalizeCombatStatBlock(statsSource) {
    const { STAT_KEYS: statNames } = require('../shared/safe-numbers');
    return statNames.reduce((acc, statName) => {
      const rawValue = Number(statsSource?.[statName]);
      acc[statName] = Number.isFinite(rawValue) ? rawValue : 0;
      return acc;
    }, {});
  },

  normalizeEnemyForCombat(enemy, fallbackType = 'mob') {
    const safeEnemy = enemy && typeof enemy === 'object' ? enemy : {};
    const entityType = safeEnemy.type || fallbackType;
    const id = this.getEnemyKey(safeEnemy, entityType);
    const rank = safeEnemy.rank || 'E';
    const hp = Number.isFinite(safeEnemy.hp) ? safeEnemy.hp : 0;
    const maxHp = Number.isFinite(safeEnemy.maxHp) ? safeEnemy.maxHp : hp;
    const statsSource =
      safeEnemy.baseStats && typeof safeEnemy.baseStats === 'object'
        ? safeEnemy.baseStats
        : safeEnemy;
    const normalizedStats = this._normalizeCombatStatBlock(statsSource);

    return {
      ...safeEnemy,
      id,
      type: entityType,
      rank,
      hp,
      maxHp: Math.max(maxHp, hp),
      ...normalizedStats,
    };
  },

  resolveCombatStats({ entityType, entity, stats, rank, fallbackType = 'mob' }) {
    if (entityType === 'shadow') {
      const normalizedShadow = this.normalizeShadowId(entity);
      const shadowRank = normalizedShadow?.rank || rank || 'E';
      const shadowStats = this.getShadowEffectiveStatsCached(normalizedShadow) || {};
      return {
        id: this.getShadowIdValue(normalizedShadow),
        type: 'shadow',
        rank: shadowRank,
        stats: this._normalizeCombatStatBlock(shadowStats),
        hp: 0,
        maxHp: 0,
      };
    }

    if (entityType === 'user') {
      const userRank = rank || this.soloLevelingStats?.settings?.rank || 'E';
      const userStats = stats || this.getUserEffectiveStats() || {};
      const hp = Number.isFinite(this.settings?.userHP) ? this.settings.userHP : 0;
      const maxHp = Number.isFinite(this.settings?.userMaxHP) ? this.settings.userMaxHP : 0;
      return {
        id: 'user',
        type: 'user',
        rank: userRank,
        stats: this._normalizeCombatStatBlock(userStats),
        hp,
        maxHp,
      };
    }

    const normalizedEnemy = entity ? this.normalizeEnemyForCombat(entity, fallbackType) : null;
    const fallbackStats = this._normalizeCombatStatBlock(stats || {});
    return {
      id: normalizedEnemy?.id || null,
      type: normalizedEnemy?.type || fallbackType,
      rank: normalizedEnemy?.rank || rank || 'E',
      stats: normalizedEnemy ? this._normalizeCombatStatBlock(normalizedEnemy) : fallbackStats,
      hp: normalizedEnemy?.hp ?? 0,
      maxHp: normalizedEnemy?.maxHp ?? 0,
    };
  }
};
