/**
 * ShadowArmy — Shadow growth, leveling, auto rank-up, and natural growth.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./progression'))
 */
const C = require('./constants');

module.exports = {
  // ============================================================================
  // SHADOW GROWTH & LEVELING SYSTEM
  // ============================================================================

  async grantShadowXP(baseAmount, reason = 'message', shadowIds = null, options = {}) {
    const perShadowAmounts =
      options && typeof options === 'object' && options.perShadowAmounts && typeof options.perShadowAmounts === 'object'
        ? options.perShadowAmounts
        : null;
    const skipPowerRecalc = Boolean(options?.skipPowerRecalc);
    const targetFetchChunkSize = Math.max(25, Math.floor(Number(options?.fetchChunkSize) || 300));

    if (baseAmount <= 0 && !perShadowAmounts) return { updatedShadows: [] };

    let shadowsToGrant = [];
    let hasPersistedUpdates = false;
    const allUpdatedShadows = [];
    const targetShadowIds =
      Array.isArray(shadowIds) && shadowIds.length > 0
        ? shadowIds
        : perShadowAmounts
        ? Object.keys(perShadowAmounts)
        : null;

    const MAX_LEVEL = 9999;
    const perShadow = baseAmount;

    const processXpBatch = async (batchShadows) => {
      if (!Array.isArray(batchShadows) || batchShadows.length === 0) return 0;

      const updatedShadows = [];
      for (const shadow of batchShadows) {
        const shadowId = shadow?.id || shadow?.i;
        const xpOverride = perShadowAmounts && shadowId != null
          ? Number(perShadowAmounts[String(shadowId)]) || 0
          : null;
        const xpGrant = xpOverride != null ? xpOverride : perShadow;
        if (!(xpGrant > 0)) continue;

        shadow.xp = (shadow.xp || 0) + xpGrant;
        let level = shadow.level || 1;

        const shadowRank = shadow.rank || 'E';
        let leveledUp = false;
        while (shadow.xp >= this.getShadowXpForNextLevel(level, shadowRank) && level < MAX_LEVEL) {
          shadow.xp -= this.getShadowXpForNextLevel(level, shadowRank);
          level += 1;
          shadow.level = level;
          this.applyShadowLevelUpStats(shadow);
          leveledUp = true;
          const effectiveStats = this.getShadowEffectiveStats(shadow);
          shadow.strength = this.calculateShadowStrength(effectiveStats, 1);
        }

        if (leveledUp) {
          const rankUpResult = this.attemptAutoRankUp(shadow);
          if (rankUpResult.success) {
            this.debugLog(
              'RANK_UP',
              `AUTO RANK-UP: ${shadow.roleName || shadow.role || shadow.name || 'Shadow'} promoted ${rankUpResult.oldRank} -> ${rankUpResult.newRank}!`
            );
          }
        }

        this.invalidateShadowPowerCache(shadow);
        updatedShadows.push(this.prepareShadowForSave(shadow));
      }

      if (!this.storageManager || updatedShadows.length === 0) return 0;

      try {
        if (this.storageManager.updateShadowsBatch) {
          await this.storageManager.updateShadowsBatch(updatedShadows);
        } else {
          await Promise.all(updatedShadows.map((s) => this.storageManager.saveShadow(s)));
        }
        hasPersistedUpdates = true;
        allUpdatedShadows.push(...updatedShadows);
        return updatedShadows.length;
      } catch (error) {
        this.debugError('STORAGE', 'Failed to batch-save shadow XP updates to IndexedDB', error);
        return 0;
      }
    };

    if (targetShadowIds && targetShadowIds.length > 0 && this.storageManager?.getShadowsByIds) {
      const uniqueTargetIds = Array.from(
        new Set(
          targetShadowIds
            .map((id) => (id === null || id === undefined ? '' : String(id).trim()))
            .filter(Boolean)
        )
      );
      if (uniqueTargetIds.length === 0) return { updatedShadows: [] };

      for (let i = 0; i < uniqueTargetIds.length; i += targetFetchChunkSize) {
        const idChunk = uniqueTargetIds.slice(i, i + targetFetchChunkSize);
        let shadowsChunk = await this.storageManager.getShadowsByIds(idChunk, {
          chunkSize: idChunk.length,
        });
        if (this.getShadowData && shadowsChunk.length > 0) {
          shadowsChunk = shadowsChunk.map((s) => this.getShadowData(s));
        }
        await processXpBatch(shadowsChunk);

        if (i + targetFetchChunkSize < uniqueTargetIds.length) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    } else {
      if (targetShadowIds && targetShadowIds.length > 0) {
        const targetIds = new Set(targetShadowIds.map((id) => String(id)));
        const allShadows = await this.getAllShadows();
        shadowsToGrant = allShadows.filter((s) => {
          const sid = s?.id || s?.i;
          return sid && targetIds.has(String(sid));
        });
      } else {
        shadowsToGrant = await this.getAllShadows();
      }

      if (!shadowsToGrant.length) return { updatedShadows: [] };
      await processXpBatch(shadowsToGrant);
    }

    if (!hasPersistedUpdates) return { updatedShadows: [] };
    this._invalidateSnapshot();

    this.settings.cachedTotalPowerShadowCount = 0;
    this.clearShadowPowerCache();

    if (!skipPowerRecalc) {
      this.getTotalShadowPower(true).catch((error) => {
        this.debugError('POWER_CALC', 'Failed to refresh total shadow power after XP grant', error);
      });
    }

    this.saveSettings();
    return { updatedShadows: allUpdatedShadows };
  },

  getShadowXpForNextLevel(level, shadowRank = 'E') {
    if (level < 1) return 25;
    const baseXP = 25 + level * level * 5;
    const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;
    const rankXPModifier = 1.0 + (rankMultiplier - 1.0) * 0.3;
    return Math.round(baseXP * rankXPModifier);
  },

  _applyRankPromotionProgressCarry(shadow, oldRank, newRank) {
    if (!shadow) return;
    const currentLevel = Math.max(1, Math.floor(Number(shadow.level) || 1));
    const currentXp = Math.max(0, Number(shadow.xp) || 0);
    const oldReq = Math.max(1, this.getShadowXpForNextLevel(currentLevel, oldRank));
    const newReq = Math.max(1, this.getShadowXpForNextLevel(currentLevel, newRank));
    const progress = Math.max(0, Math.min(0.99, currentXp / oldReq));
    const carriedXp = Math.floor(newReq * progress);
    shadow.level = currentLevel;
    shadow.xp = Math.max(0, Math.min(newReq - 1, carriedXp));
  },

  getShadowEffectiveStats(shadow) {
    if (!shadow) return this.createZeroStatBlock();

    shadow = this.getShadowData(shadow);
    const base = shadow.baseStats || {};
    const growth = shadow.growthStats || {};
    const naturalGrowth = shadow.naturalGrowthStats || {};

    const statKeys = C.STAT_KEYS;
    const effective = statKeys.reduce((stats, stat) => {
      stats[stat] = (base[stat] || 0) + (growth[stat] || 0) + (naturalGrowth[stat] || 0);
      return stats;
    }, {});

    const totalStats = statKeys.reduce((sum, stat) => sum + (effective[stat] || 0), 0);
    if (totalStats === 0 && shadow.level) {
      const shadowLevel = shadow.level || 1;
      const rankMultiplier = this.rankStatMultipliers[shadow.rank] || 1.0;
      const minStatValue = Math.max(1, Math.floor(shadowLevel * 5 * rankMultiplier));
      statKeys.forEach((stat) => {
        effective[stat] = minStatValue;
      });
      this.debugLog('STATS', 'Shadow had 0 stats, applied fallback minimum stats', {
        shadowId: shadow.id, level: shadowLevel, rank: shadow.rank, minStatValue,
      });
    }

    return effective;
  },

  getRoleRankUpThresholdFactor(roleKey) {
    const stats = C.STAT_KEYS;
    const roleWeights = this.shadowRoleStatWeights?.[roleKey] || this.shadowRoleStatWeights?.knight;
    if (!roleWeights) return 1;

    if (!Number.isFinite(this._avgRoleWeightSum) || this._avgRoleWeightSum <= 0) {
      const allRoleWeights = Object.values(this.shadowRoleStatWeights || {});
      const sums = allRoleWeights
        .map((weights) => stats.reduce((sum, stat) => sum + (Number(weights?.[stat]) || 0), 0))
        .filter((sum) => Number.isFinite(sum) && sum > 0);
      this._avgRoleWeightSum =
        sums.length > 0 ? sums.reduce((sum, v) => sum + v, 0) / sums.length : 1;
    }

    const roleSum = stats.reduce((sum, stat) => sum + (Number(roleWeights?.[stat]) || 0), 0);
    if (!Number.isFinite(roleSum) || roleSum <= 0) return 1;

    const rawFactor = roleSum / this._avgRoleWeightSum;
    const softened = 1 + (rawFactor - 1) * 0.5;
    return Math.max(0.8, Math.min(1.2, softened));
  },

  // ============================================================================
  // AUTO RANK-UP SYSTEM
  // ============================================================================

  attemptAutoRankUp(shadow) {
    if (!shadow || !shadow.rank) return { success: false };

    const currentRank = shadow.rank;
    const currentRankIndex = this.shadowRanks.indexOf(currentRank);
    const nextRank = this.shadowRanks[currentRankIndex + 1];

    if (!nextRank) return { success: false };
    if (nextRank === 'Shadow Monarch') return { success: false };

    const promotionConfig = this.settings?.rankPromotionConfig || this.defaultSettings.rankPromotionConfig;
    if (promotionConfig?.enabled !== false) {
      const currentLevel = Math.max(1, Math.floor(Number(shadow.level) || 1));
      const requiredLevelRaw = promotionConfig?.minLevelByRank?.[nextRank];
      const requiredLevel = Math.max(1, Math.floor(Number(requiredLevelRaw) || 0));
      if (requiredLevel > 0 && currentLevel < requiredLevel) {
        return {
          success: false, reason: 'level_gate',
          currentLevel, requiredLevel, targetRank: nextRank,
        };
      }
    }

    const effectiveStats = this.getShadowEffectiveStats(shadow);
    const nextRankMultiplier = this.rankStatMultipliers[nextRank] || 1.0;
    const baselineForNextRank = this.getRankBaselineStats(nextRank, nextRankMultiplier);

    const statKeys = C.STAT_KEYS;
    const totalBaseline = statKeys.reduce((sum, stat) => sum + (baselineForNextRank[stat] || 0), 0);
    const totalEffective = statKeys.reduce((sum, stat) => sum + (effectiveStats[stat] || 0), 0);

    const roleThresholdFactor = this.getRoleRankUpThresholdFactor(shadow.role);
    const requiredTotal = totalBaseline * 0.8 * roleThresholdFactor;

    if (totalEffective >= requiredTotal) {
      const oldLevel = Math.max(1, Math.floor(Number(shadow.level) || 1));
      const oldXp = Math.max(0, Number(shadow.xp) || 0);
      shadow.rank = nextRank;

      this._applyRankPromotionProgressCarry(shadow, currentRank, nextRank);

      const newEffectiveStats = this.getShadowEffectiveStats(shadow);
      shadow.strength = this.calculateShadowStrength(newEffectiveStats, 1);

      this.invalidateShadowPowerCache(shadow);
      this.settings.cachedTotalPowerShadowCount = 0;
      this.clearShadowPowerCache();

      this.getTotalShadowPower(true).catch((error) => {
        this.debugError('POWER_CALC', 'Failed to refresh total shadow power after rank up', error);
      });

      return {
        success: true, oldRank: currentRank, newRank: nextRank,
        oldLevel, newLevel: shadow.level || oldLevel,
        oldXp, newXp: shadow.xp || 0,
      };
    }

    return { success: false };
  },

  // ============================================================================
  // NATURAL GROWTH SYSTEM
  // ============================================================================

  applyNaturalGrowth(shadow, combatTimeHours = 0) {
    if (!shadow) return false;

    const shadowRank = shadow.rank || 'E';
    const roleKey = shadow.role || 'knight';
    const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;
    const roleWeights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;

    if (!shadow.naturalGrowthStats) {
      shadow.naturalGrowthStats = { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };
    }
    if (!shadow.totalCombatTime) shadow.totalCombatTime = 0;
    if (!shadow.lastNaturalGrowth) shadow.lastNaturalGrowth = Date.now();
    if (!shadow.growthVarianceSeed) shadow.growthVarianceSeed = Math.random();

    // True Shadow Monarch: accelerated shadow growth
    const bonuses = typeof this._getSkillTreeBonuses === 'function' ? this._getSkillTreeBonuses() : null;
    const growthMult = (bonuses && bonuses.shadowGrowthMultiplier > 1) ? bonuses.shadowGrowthMultiplier : 1;

    const baseGrowthPerHour = rankMultiplier * 10 * growthMult;
    if (combatTimeHours <= 0) return false;

    const stats = C.STAT_KEYS;
    const individualVariance = 0.8 + shadow.growthVarianceSeed * 0.4;

    stats.reduce((naturalGrowth, stat) => {
      const roleWeight = roleWeights[stat] || 1.0;
      const statGrowth = baseGrowthPerHour * combatTimeHours * roleWeight * individualVariance;
      const roundedGrowth = Math.max(0, Math.round(statGrowth));
      naturalGrowth[stat] = (naturalGrowth[stat] || 0) + roundedGrowth;
      return naturalGrowth;
    }, shadow.naturalGrowthStats);

    shadow.totalCombatTime += combatTimeHours;
    shadow.lastNaturalGrowth = Date.now();

    const effectiveStats = this.getShadowEffectiveStats(shadow);
    shadow.strength = this.calculateShadowStrength(effectiveStats, 1);

    // Monarch cap: no shadow can exceed the Shadow Monarch's own strength
    if (growthMult > 1) {
      const monarchStrength = this._getMonarchStrength();
      if (monarchStrength > 0 && shadow.strength > monarchStrength) {
        shadow.strength = monarchStrength;
      }
    }

    return true;
  },

  applyShadowLevelUpStats(shadow) {
    const roleKey = shadow.role;
    const roleWeights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;
    const shadowRank = shadow.rank || 'E';
    const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;
    const rankGrowthMultiplier = 1.0 + (rankMultiplier - 1.0) * 0.15;

    if (!shadow.growthStats) {
      shadow.growthStats = { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };
    }
    if (!shadow.growthVarianceSeed) {
      shadow.growthVarianceSeed = Math.random();
    }

    // True Shadow Monarch: accelerated shadow level-up growth
    const bonuses = typeof this._getSkillTreeBonuses === 'function' ? this._getSkillTreeBonuses() : null;
    const growthMult = (bonuses && bonuses.shadowGrowthMultiplier > 1) ? bonuses.shadowGrowthMultiplier : 1;

    const stats = C.STAT_KEYS;

    const baseGrowthMap = [
      [(w) => w >= 1.5, 5],
      [(w) => w >= 1.2, 4],
      [(w) => w >= 0.8, 3],
      [(w) => w >= 0.5, 2],
      [(w) => w >= 0.3, 1],
      [() => true, 0.5],
    ];

    const getBaseGrowth = (roleWeight) => {
      const [, growth] = baseGrowthMap.find(([predicate]) => predicate(roleWeight));
      return growth;
    };

    const seedVariance = 0.8 + shadow.growthVarianceSeed * 0.4;

    stats.reduce((growthStats, stat) => {
      const roleWeight = roleWeights[stat] || 1.0;
      const baseGrowth = getBaseGrowth(roleWeight);
      const levelVariance = 0.9 + Math.random() * 0.2;
      const growth = baseGrowth * rankGrowthMultiplier * seedVariance * levelVariance * growthMult;
      const roundedGrowth = Math.max(1, Math.round(growth));
      growthStats[stat] = (growthStats[stat] || 0) + roundedGrowth;
      return growthStats;
    }, shadow.growthStats);

    // Monarch cap: no shadow can exceed the Shadow Monarch's own strength
    if (growthMult > 1) {
      const effectiveStats = this.getShadowEffectiveStats(shadow);
      const currentStrength = this.calculateShadowStrength(effectiveStats, 1);
      const monarchStrength = typeof this._getMonarchStrength === 'function' ? this._getMonarchStrength() : 0;
      if (monarchStrength > 0 && currentStrength > monarchStrength) {
        shadow.strength = monarchStrength;
      }
    }
  },
};
