/**
 * Dungeons — shadow-side combat support (mixin).
 *
 * The most-consumed file in Dungeons: nine sibling modules call into it. It owns
 * four things the combat loops depend on but never define themselves.
 *
 * 1. SETUP. `initializeShadowCombatData` and `initializeShadowHPSync` derive a
 *    shadow's combat profile from ShadowArmy's stored data (personality, attack
 *    interval, effective stats) rather than recomputing it. Both degrade to
 *    literal defaults when ShadowArmy is absent, so combat still runs standalone.
 *
 * 2. ATTACK PACING. `getEffectiveAttackCooldownMs` and `getCappedAttackElapsedMs`
 *    convert wall-clock elapsed into a bounded attack count. The 5-minute
 *    MAX_CATCHUP_MS ceiling exists because a backgrounded tab has its timers
 *    throttled: without it, refocusing replayed the entire gap as one synchronous
 *    burst (measured PERF SPIKE ticks of 350-465ms).
 *    CROSS-FILE PAIR: combat-shadow-execution.js applies its own 5-minute cap to
 *    revisitSpan, but compensates for it arithmetically via `scaleFactor`
 *    (rawRevisitSpan / revisitSpan). This file's cap has no such compensation —
 *    it is a burst guard, not a throughput model. Change one and check the other,
 *    since together they set effective DPS at very large deployment counts.
 *
 * 3. LIFECYCLE. `maybePruneDungeonShadowState` is the only thing keeping the
 *    per-dungeon Maps bounded. It runs when the allocation count changes or every
 *    60s, and drops entries for shadows no longer assigned. Any new per-shadow Map
 *    added to a dungeon must be pruned here too or it grows without limit.
 *
 * 4. ELIGIBILITY. `getCombatReadyShadows` is the single gate deciding who fights.
 *    It excludes three disjoint groups: dead, marked-for-trade by ShadowExchange,
 *    and deployed by ShadowSenses. The latter two are CROSS-PLUGIN reads, cached
 *    for 5s — so a shadow withdrawn elsewhere can still swing for up to 5 seconds.
 *
 * INVARIANT worth knowing: `dungeon.shadowHP` holds combat participants, not the
 * whole army, and it GROWS toward the full allocation size over a long fight.
 * Anything that touches it per-tick must therefore be rotation-budgeted, not a
 * full scan — the heal pass learned this the hard way (see _applyShadowHealPass).
 * Per-tick cost must never scale with fight duration.
 */
module.exports = {
  initializeShadowCombatData(shadow) {
    // Get shadow personality from ShadowArmy (uses stored data if available)
    let personality = 'balanced';
    let attackInterval = 2000; // Base interval
    let effectiveStats = null;

    if (this.shadowArmy) {
      // Get personality (now uses stored data from ShadowArmy)
      if (this.shadowArmy.getShadowPersonalityKey) {
        const personalityKey = this.shadowArmy.getShadowPersonalityKey(shadow);
        personality = personalityKey || shadow.personality || 'balanced';
      }

      // Get base attack interval (now uses stored data from ShadowArmy)
      if (this.shadowArmy.calculateShadowAttackInterval) {
        // This will use stored baseAttackInterval if available
        attackInterval = this.shadowArmy.calculateShadowAttackInterval(shadow, 2000);
      }

      // Get effective stats (cached)
      if (this.shadowArmy.getShadowEffectiveStats) {
        effectiveStats = this.shadowArmy.getShadowEffectiveStats(shadow);
      }
    }

    // Create comprehensive combat data using ShadowArmy's stored info
    return {
      lastAttackTime: Date.now() - Math.random() * attackInterval, // Stagger initial attacks
      attackInterval, // Individual interval (from stored baseAttackInterval)
      personality, // Stored personality from ShadowArmy
      behavior: personality, // Legacy field kept in sync for old fallback paths
      effectiveStats: effectiveStats || {
        strength: shadow.strength || 0,
        agility: shadow.agility || 0,
        intelligence: shadow.intelligence || 0,
        vitality: shadow.vitality || 0,
      },
      attackCount: 0,
      damageDealt: 0,
      // Combo tracking: consecutive hits on same target type scale damage via perception
      comboHits: 0,
      lastTargetType: null, // 'boss' | 'mob' — resets combo on switch
      // Store shadow ID for reference
      shadowId: this.getShadowIdValue(shadow),
    };
  },

  maybePruneDungeonShadowState({ dungeon, channelKey, assignedShadows, deadShadows }) {
    if (!dungeon || !Array.isArray(assignedShadows)) return false;

    const now = Date.now();
    const assignedCount = assignedShadows.length;
    const lastAssignedCount = dungeon._shadowStateAssignedCount || 0;
    const lastPruneAt = dungeon._shadowStateLastPruneAt || 0;

    const pruneDueToAllocationChange = assignedCount !== lastAssignedCount;
    const pruneDueToTime = now - lastPruneAt >= 60000;

    if (!pruneDueToAllocationChange && !pruneDueToTime) return false;

    dungeon._shadowStateAssignedCount = assignedCount;
    dungeon._shadowStateLastPruneAt = now;

    const assignedIds = new Set();
    for (const shadow of assignedShadows) {
      const shadowId = this.getShadowIdValue(shadow);
      shadowId && assignedIds.add(shadowId);
    }

    // LEAK-2: Prune stale resurrection attempt timestamps (only keep assigned shadows)
    if (dungeon._lastResurrectionAttempt instanceof Map) {
      for (const shadowId of dungeon._lastResurrectionAttempt.keys()) {
        if (!assignedIds.has(shadowId)) {
          dungeon._lastResurrectionAttempt.delete(shadowId);
        }
      }
    }

    // If there are no assigned shadows, clear state completely.
    if (assignedIds.size === 0) {
      dungeon.shadowHP && (dungeon.shadowHP = new Map());
      dungeon.shadowCombatData && (dungeon.shadowCombatData = new Map());
      deadShadows?.clear?.();
      this.deadShadows.set(channelKey, deadShadows || new Set());
      return true;
    }

    if (dungeon.shadowHP instanceof Map) {
      for (const shadowId of dungeon.shadowHP.keys()) {
        assignedIds.has(shadowId) || dungeon.shadowHP.delete(shadowId);
      }
    }

    if (dungeon.shadowCombatData instanceof Map) {
      for (const shadowId of dungeon.shadowCombatData.keys()) {
        assignedIds.has(shadowId) || dungeon.shadowCombatData.delete(shadowId);
      }
    }

    if (deadShadows && typeof deadShadows.forEach === 'function') {
      deadShadows.forEach((shadowId) => {
        assignedIds.has(shadowId) || deadShadows.delete(shadowId);
      });
      this.deadShadows.set(channelKey, deadShadows);
    }

    // Prune stale _shadowLastProcessed entries for shadows no longer assigned.
    // Without this, the rotation-cursor timestamp Map grows unbounded as shadows leave.
    if (dungeon._shadowLastProcessed instanceof Map) {
      for (var sid of dungeon._shadowLastProcessed.keys()) {
        assignedIds.has(sid) || dungeon._shadowLastProcessed.delete(sid);
      }
    }

    return true;
  },

  getEffectiveAttackCooldownMs(attackInterval, fallbackInterval = 1000) {
    const fallback = Number.isFinite(Number(fallbackInterval)) && Number(fallbackInterval) > 0
      ? Number(fallbackInterval)
      : 1000;
    const candidate = Number(attackInterval);
    const cooldown = Number.isFinite(candidate) && candidate > 0 ? candidate : fallback;
    return Math.max(800, Math.floor(cooldown));
  },

  getCappedAttackElapsedMs(timeSinceLastAttack, attackInterval, totalTimeSpan) {
    const effectiveCooldown = this.getEffectiveAttackCooldownMs(attackInterval, 1000);
    const span = Number.isFinite(Number(totalTimeSpan)) && Number(totalTimeSpan) > 0
      ? Number(totalTimeSpan)
      : 1000;
    // Catch-up window allows moderate backlog processing without huge burst loops.
    // Absolute 5-min ceiling mirrors the shadow-rotation revisitSpan cap
    // (combat-shadow-execution.js): span itself scales with wall-clock elapsed,
    // so without this ceiling a long-backgrounded (timer-throttled) session made
    // the boss/mob attack loops iterate proportionally to the whole gap in one
    // synchronous burst on refocus — measured PERF SPIKE ticks of 350-465ms.
    const MAX_CATCHUP_MS = 5 * 60 * 1000;
    const maxCatchUp = Math.min(Math.max(span * 2, effectiveCooldown * 4), MAX_CATCHUP_MS);
    const elapsed = Number(timeSinceLastAttack);
    const safeElapsed = Number.isFinite(elapsed) ? elapsed : 0;
    return Math.min(Math.max(0, safeElapsed), maxCatchUp);
  },

  calculateAttacksInTimeSpan(timeSinceLastAttack, attackInterval, totalTimeSpan) {
    const effectiveCooldown = this.getEffectiveAttackCooldownMs(attackInterval, 1000);
    const effectiveElapsed = this.getCappedAttackElapsedMs(
      timeSinceLastAttack,
      effectiveCooldown,
      totalTimeSpan
    );
    return Math.floor(effectiveElapsed / effectiveCooldown);
  },

  getPostAttackTimestamp(
    now,
    timeSinceLastAttack,
    attackInterval,
    totalTimeSpan,
    attacksProcessed
  ) {
    const safeNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const effectiveCooldown = this.getEffectiveAttackCooldownMs(attackInterval, 1000);
    const effectiveElapsed = this.getCappedAttackElapsedMs(
      timeSinceLastAttack,
      effectiveCooldown,
      totalTimeSpan
    );
    const processed = Math.max(0, Math.floor(Number(attacksProcessed) || 0));
    const consumedMs = processed * effectiveCooldown;
    const remainingElapsed = Math.max(0, effectiveElapsed - consumedMs);
    return safeNow - remainingElapsed;
  },

  batchApplyDamage(damageMap, targets, applyDamageCallback, targetIndex = null) {
    let totalDamage = 0;
    let targetsKilled = 0;

    const getTarget =
      targetIndex && typeof targetIndex.get === 'function'
        ? (id) => targetIndex.get(id)
        : (id) => targets.find((t) => this.getEnemyKey(t, 'mob') === id);

    damageMap.forEach((damage, targetId) => {
      const target = getTarget(targetId);
      if (!target || target.hp <= 0) return;

      const oldHP = target.hp;
      applyDamageCallback(target, damage);
      totalDamage += damage;

      // Track kills
      if (oldHP > 0 && target.hp <= 0) {
        targetsKilled++;
      }
    });

    return { totalDamage, targetsKilled };
  },

  // Healer/support restoration pass. Runs once per combat tick after damage.
  // The "healer" role (and support archetype generally) now actively restores
  // shadow HP: healers/support build a `heal` accumulator in the role-combat
  // state (updateRoleCombatStateFromPressure), surfaced as shadowHealFraction
  // by getRoleCombatTickContext. Heals only ALIVE-but-damaged shadows (never
  // revives — that's the mana-gated resurrection path) and never overheals.
  // Rotation-budgeted like the attack path: at most HEAL_TICK_BUDGET entries
  // are visited per tick from a persistent cursor, so per-tick cost is constant
  // no matter how large shadowHP grows or how long the fight runs.
  _applyShadowHealPass(channelKey, dungeon) {
    if (!dungeon) return;
    if (this.settings?.shadowHealerRestorationEnabled === false) return;

    const ctx = this.getRoleCombatTickContext?.(channelKey);
    let healFraction = ctx && ctx.enabled ? (ctx.shadowHealFraction || 0) : 0;
    // SOVEREIGN DOCTRINE (Beru's Grace / Battle Hymns): a fielded healer
    // sovereign amplifies the army's restoration.
    healFraction *= 1 + (Number(dungeon.war?._sovereignHealBoost) || 0);
    if (!(healFraction > 0)) return;

    const shadowHP = dungeon.shadowHP;
    if (!shadowHP || shadowHP.size === 0) return;

    // ROTATION-BUDGETED (2026-08-04) — this used to scan up to 6,000 entries
    // EVERY tick. shadowHP grows toward the dungeon's allocation size over a
    // fight, so once a fight ran long enough to saturate it, every combat tick
    // paid a full 6,000-entry scan. Measured: per-dungeon Dungeons-timer work
    // rose 2.23x while tick CADENCE stayed flat (60.6 vs 66.7 calls/min) —
    // the signature of per-tick cost growing, not more ticks.
    //
    // The attack path solved this long ago: it visits TICK_BUDGET shadows per
    // tick from a cursor, so cost scales with the budget and never with N.
    // This now does the same. Per-tick cost is constant regardless of how long
    // a fight has been running.
    //
    // Throughput is preserved by scaling the per-visit heal by the revisit
    // span: a shadow seen once every `revisit` ticks heals `revisit`x as much
    // when its turn comes. Clamped so a huge roster cannot turn one visit into
    // a full heal.
    //
    // This also FIXES a fairness bug: the old cap meant entries past index
    // 6,000 in insertion order were never healed at all. The rotation reaches
    // every participant eventually.
    const HEAL_TICK_BUDGET = 500; // mirrors TICK_BUDGET in combat-shadow-execution
    const size = shadowHP.size;
    const revisit = Math.max(1, Math.ceil(size / HEAL_TICK_BUDGET));
    const effectiveFraction = Math.min(0.5, healFraction * revisit);

    // Persistent cursor. Map iterators stay valid across ticks, but prune
    // replaces dungeon.shadowHP with a NEW Map — so re-seed when identity changes.
    if (dungeon._healIterMap !== shadowHP || !dungeon._healIter) {
      dungeon._healIter = shadowHP.values();
      dungeon._healIterMap = shadowHP;
    }

    let scanned = 0;
    let healedCount = 0;
    let wrapped = false;
    while (scanned < HEAL_TICK_BUDGET) {
      const next = dungeon._healIter.next();
      if (next.done) {
        if (wrapped) break; // empty or fully consumed twice — stop, don't spin
        dungeon._healIter = shadowHP.values();
        wrapped = true;
        continue;
      }
      scanned++;
      const hpData = next.value;
      if (!hpData) continue;
      const maxHp = Number(hpData.maxHp) || 0;
      const hp = Number(hpData.hp) || 0;
      if (maxHp <= 0 || hp <= 0 || hp >= maxHp) continue; // dead or already full
      hpData.hp = Math.min(maxHp, hp + Math.max(1, Math.floor(maxHp * effectiveFraction)));
      healedCount++;
    }

    if (healedCount > 0) {
      this.debugLog?.(
        'HEALER',
        `Restored ${healedCount} shadows in ${dungeon.name || channelKey} (frac=${healFraction.toFixed(3)})`
      );
    }
  },

  initializeShadowHPSync(shadow, shadowHP) {
    const shadowId = this.getShadowIdValue(shadow);
    if (!shadowId) return null;

    const existingHP = shadowHP.get(shadowId);
    if (
      existingHP &&
      typeof existingHP.hp === 'number' &&
      !isNaN(existingHP.hp) &&
      !(existingHP.hp instanceof Promise)
    ) {
      return existingHP;
    }

    const effectiveStats = this.getShadowEffectiveStatsCached(shadow);
    let shadowVitality =
      effectiveStats?.vitality != null && !isNaN(effectiveStats.vitality)
        ? effectiveStats.vitality
        : (shadow.baseStats?.vitality || 0) +
          (shadow.growthStats?.vitality || 0) +
          (shadow.naturalGrowthStats?.vitality || 0);

    if (!shadowVitality || typeof shadowVitality !== 'number' || isNaN(shadowVitality)) {
      shadowVitality =
        typeof shadow.vitality === 'number' && shadow.vitality > 0 ? shadow.vitality : 50;
    }
    if (shadowVitality < 0) shadowVitality = 0;

    const shadowRank = shadow.rank || 'E';
    const baseHP = this.calculateHPSync(shadowVitality, shadowRank);
    const shadowRankIndex = this.getRankIndexValue(shadowRank);
    const shadowRankHpFactor = this.getShadowRankHpFactorByIndex(shadowRankIndex);
    // FIX: Shadow HP multiplier scales with rank instead of flat 0.2 for all.
    // E(0.2) → D(0.25) → C(0.3) → B(0.35) → A(0.4) → S(0.5) → SS(0.55) → SSS(0.6)
    // → SSS+(0.65) → NH(0.7) → Monarch(0.75) → Monarch+(0.8) → SM(0.85)
    const shadowHpMultiplier = Math.min(0.85, 0.2 + shadowRankIndex * 0.05);
    const finalMaxHP = Math.max(1, Math.floor(baseHP * shadowHpMultiplier * shadowRankHpFactor));

    if (typeof finalMaxHP !== 'number' || isNaN(finalMaxHP) || finalMaxHP <= 0) {
      const rankIndex = this.getRankIndexValue(shadowRank);
      const minHP = Math.max(1, Math.floor((100 + 50 * 10 + rankIndex * 50) * 0.1));
      const hpData = { hp: minHP, maxHp: minHP };
      shadowHP.set(shadowId, hpData);
      return hpData;
    }

    const hpData = { hp: finalMaxHP, maxHp: finalMaxHP };
    shadowHP.set(shadowId, hpData);
    return hpData;
  },

  _getCachedExclusionSets() {
    const now = Date.now();
    if (this._exclusionCache && now - this._exclusionCache.ts < 5000) {
      return this._exclusionCache;
    }

    const normalizeIdSet = (setLike) => {
      const normalized = new Set();
      if (!(setLike instanceof Set)) return normalized;
      setLike.forEach((id) => id && normalized.add(String(id)));
      return normalized;
    };

    let exchangeMarkedIds = new Set();
    const sensesDeployedIds = this._getShadowSensesDeployedIds();

    try {
      if (BdApi.Plugins.isEnabled('ShadowExchange')) {
        exchangeMarkedIds = normalizeIdSet(
          BdApi.Plugins.get('ShadowExchange')?.instance?.getMarkedShadowIds?.() || new Set()
        );
      }
    } catch (error) {
      this.errorLog?.(true, 'Failed to read ShadowExchange exclusion set', error);
    }

    this._exclusionCache = { exchangeMarkedIds, sensesDeployedIds, ts: now };
    return this._exclusionCache;
  },

  getCombatReadyShadows(assignedShadows, deadShadows, shadowHP) {
    const { exchangeMarkedIds, sensesDeployedIds } = this._getCachedExclusionSets();

    const combatReady = [];
    for (const shadow of assignedShadows) {
      const shadowId = this.getShadowIdValue(shadow);
      if (!shadowId) continue;
      const shadowKey = String(shadowId);
      if (deadShadows.has(shadowId) || deadShadows.has(shadowKey)) continue;
      if (exchangeMarkedIds.has(shadowKey)) continue;
      if (sensesDeployedIds.has(shadowKey)) continue;
      const hpData = shadowHP.get(shadowId) || shadowHP.get(shadowKey);
      hpData && hpData.hp > 0 && combatReady.push(shadow);
    }
    return combatReady;
  },
};
