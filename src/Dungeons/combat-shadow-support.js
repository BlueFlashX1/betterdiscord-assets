module.exports = {
  initializeShadowCombatData(shadow, dungeon) {
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
    if (dungeon._lastResurrectionAttempt) {
      for (const shadowId of Object.keys(dungeon._lastResurrectionAttempt)) {
        if (!assignedIds.has(shadowId)) {
          delete dungeon._lastResurrectionAttempt[shadowId];
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

    return true;
  },

  calculateAttacksInTimeSpan(timeSinceLastAttack, attackInterval, totalTimeSpan) {
    // CRITICAL: Cap timeSinceLastAttack to prevent one-shot when joining
    // If timeSinceLastAttack is huge (dungeon running for hours), cap it to reasonable value
    const maxTimeSinceLastAttack = totalTimeSpan * 2; // Max 2x the time span
    const cappedTimeSinceLastAttack = Math.min(
      Math.max(0, timeSinceLastAttack),
      maxTimeSinceLastAttack
    );

    const effectiveCooldown = Math.max(attackInterval, 800); // Min 800ms cooldown

    // If timeSinceLastAttack is 0 or negative (just joined), process 1 attack
    if (cappedTimeSinceLastAttack <= 0) {
      return 1; // Process at least 1 attack if cooldown is ready
    }

    // Calculate how many attacks fit in the remaining time
    const remainingTime = totalTimeSpan - cappedTimeSinceLastAttack;
    if (remainingTime <= 0) {
      return 0; // No time remaining
    }

    // Calculate attacks based on remaining time and cooldown
    // BUGFIX LOGIC-8: Removed Math.max(1,...) — forces >=1 attack even when remainingTime < cooldown.
    // First-attack case is already handled above (return 1 when timeSinceLastAttack <= 0).
    return Math.floor(remainingTime / effectiveCooldown);
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
        typeof shadow.strength === 'number' && shadow.strength > 0 ? shadow.strength : 50;
    }
    if (shadowVitality < 0) shadowVitality = 0;

    const shadowRank = shadow.rank || 'E';
    const baseHP = this.calculateHPSync(shadowVitality, shadowRank);
    const shadowRankIndex = this.getRankIndexValue(shadowRank);
    const shadowRankHpFactor = this.getShadowRankHpFactorByIndex(shadowRankIndex);
    const finalMaxHP = Math.max(1, Math.floor(baseHP * 0.2 * shadowRankHpFactor));

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

  async initializeShadowHP(shadow, shadowHP) {
    // Delegate to sync version — kept async for backward compatibility with callers outside the combat tick
    return this.initializeShadowHPSync(shadow, shadowHP);
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
