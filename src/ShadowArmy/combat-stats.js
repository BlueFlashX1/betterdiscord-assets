/**
 * ShadowArmy — Shadow generation, stat calculation, power computation, and caching.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./combat-stats'))
 */
const C = require('./constants');

module.exports = {
  // ============================================================================
  // SHADOW GENERATION & STATS
  // ============================================================================

  _pickRandom(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const idx = Math.floor(Math.random() * items.length);
    return items[idx] ?? null;
  },

  generateShadow(shadowRank, userLevel, userStats, fromDungeon = false, beastFamilies = null) {
    const roleSelectors = {
      dungeon: () => {
        const availableBeastRoles = this._getAvailableDungeonBeastRoles(shadowRank, beastFamilies);
        return this._pickRandom(availableBeastRoles);
      },
      message: () => {
        const humanoidRoles = Object.keys(this.shadowRoles).filter(
          (key) => !this.shadowRoles[key].isMagicBeast
        );
        return this._pickRandom(humanoidRoles);
      },
    };

    let roleKey = roleSelectors[fromDungeon ? 'dungeon' : 'message']();
    if (!roleKey) {
      roleKey = 'knight';
    }
    const role = this.shadowRoles[roleKey] || this.shadowRoles.knight || { name: roleKey };
    const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;
    const baseStats = this.generateShadowBaseStats(userStats, roleKey, shadowRank, rankMultiplier);
    const baseStrength = this.calculateShadowPower(baseStats, 1);

    const shadow = {
      id: `shadow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      rank: shadowRank,
      role: roleKey,
      roleName: role.name,
      strength: baseStrength,
      extractedAt: Date.now(),
      level: 1,
      xp: 0,
      baseStats,
      growthStats: this.createZeroStatBlock(),
      naturalGrowthStats: this.createZeroStatBlock(),
      totalCombatTime: 0,
      lastNaturalGrowth: Date.now(),
      ownerLevelAtExtraction: userLevel,
      growthVarianceSeed: Math.random(),
    };

    return shadow;
  },

  calculateExtractionChance(
    userRank, userStats, targetRank, targetStrength,
    intelligence, perception, strength, skipCap = false
  ) {
    const usingLegacySignature =
      typeof userRank === 'number' &&
      typeof userStats === 'number' &&
      typeof targetRank === 'number' &&
      typeof targetStrength === 'string';
    if (usingLegacySignature) {
      intelligence = userRank;
      perception = userStats;
      strength = targetRank;
      const legacyRank = targetStrength;
      userRank = legacyRank;
      targetRank = legacyRank;
      targetStrength = 0;
      userStats = {
        strength: Number.isFinite(strength) ? strength : 0,
        agility: 0,
        intelligence: Number.isFinite(intelligence) ? intelligence : 0,
        vitality: 0,
        perception: Number.isFinite(perception) ? perception : 0,
      };
    }

    const numericOrZero = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const safeUserStats =
      userStats && typeof userStats === 'object'
        ? {
            strength: numericOrZero(userStats.strength),
            agility: numericOrZero(userStats.agility),
            intelligence: numericOrZero(userStats.intelligence),
            vitality: numericOrZero(userStats.vitality),
            perception: numericOrZero(userStats.perception),
          }
        : { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };
    const safeIntelligence = numericOrZero(intelligence || safeUserStats.intelligence);
    const safePerception = numericOrZero(perception || safeUserStats.perception);
    const safeStrength = numericOrZero(strength || safeUserStats.strength);
    const safeTargetStrength = numericOrZero(targetStrength);

    const safeUserRank = this.shadowRanks.includes(userRank) ? userRank : 'E';
    const safeTargetRank = this.shadowRanks.includes(targetRank) ? targetRank : safeUserRank;

    const userRankIndex = this.shadowRanks.indexOf(safeUserRank);
    const targetRankIndex = this.shadowRanks.indexOf(safeTargetRank);

    const rankDiff = targetRankIndex - userRankIndex;
    if (rankDiff > 1) {
      this.debugLog(
        'EXTRACTION_RANK_CHECK',
        `Extracting [${safeTargetRank}] shadow is extremely difficult (User: ${safeUserRank}, gap: +${rankDiff})`
      );
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    const baseChance = Math.max(
      cfg.minBaseChance || 0.01,
      safeIntelligence * (cfg.chancePerInt || 0.01)
    );

    const totalStats = this.calculateUserStrength(safeUserStats);
    const statsMultiplier =
      1.0 +
      (safeIntelligence * 0.01 +
        safePerception * 0.005 +
        safeStrength * 0.003 +
        (totalStats / 1000) * 0.01);

    const rankMultiplier = this.rankProbabilityMultipliers[safeTargetRank] || 1.0;

    let rankPenalty = 1.0;
    if (rankDiff > 0) {
      rankPenalty = 0.5;
      if (rankDiff > 1) {
        rankPenalty *= Math.pow(0.1, rankDiff - 1);
      }
    }

    const userStrength = this.calculateUserStrength(safeUserStats);
    const resistanceCalculators = {
      strengthBased: () => {
        const strengthRatio = Math.min(1.0, safeTargetStrength / Math.max(1, userStrength));
        return Math.min(0.9, strengthRatio * 0.7);
      },
      rankBased: () => {
        return Math.min(0.9, (targetRankIndex + 1) / ((userRankIndex + 1) * 2));
      },
    };

    const targetResistance =
      safeTargetStrength > 0
        ? resistanceCalculators.strengthBased()
        : resistanceCalculators.rankBased();

    const rawChance =
      baseChance * statsMultiplier * rankMultiplier * rankPenalty * (1 - targetResistance);
    if (!Number.isFinite(rawChance)) return 0;

    const capMap = {
      capped: () => {
        const maxChance = cfg.maxExtractionChance || 0.15;
        return Math.max(0, Math.min(maxChance, rawChance));
      },
      uncapped: () => Math.max(0, Math.min(1, rawChance)),
    };

    return capMap[skipCap ? 'uncapped' : 'capped']();
  },

  calculateUserStrength(userStats) {
    if (!userStats) return 0;
    const statKeys = C.STAT_KEYS;
    return statKeys.reduce((sum, key) => sum + (userStats[key] || 0), 0);
  },

  getRankBaselineStats(shadowRank, rankMultiplier) {
    if (!shadowRank) {
      const defaultBaseline = 10;
      const statKeys = C.STAT_KEYS;
      return statKeys.reduce((stats, key) => {
        stats[key] = defaultBaseline;
        return stats;
      }, {});
    }

    const rankBaselinesFixed = {
      E: 10, D: 22, C: 50, B: 112, A: 252, S: 567, SS: 1275,
      SSS: 2866, 'SSS+': 6447, NH: 14505, Monarch: 32636,
      'Monarch+': 73431, 'Shadow Monarch': 165219,
    };

    const baselineValue = rankBaselinesFixed[shadowRank] || 10;
    const statKeys = C.STAT_KEYS;
    return statKeys.reduce((stats, key) => {
      stats[key] = baselineValue;
      return stats;
    }, {});
  },

  generateShadowBaseStats(userStats, roleKey, shadowRank, rankMultiplier) {
    if (!roleKey || !shadowRank) {
      const statKeys = C.STAT_KEYS;
      return statKeys.reduce((stats, key) => {
        stats[key] = 10;
        return stats;
      }, {});
    }

    const weights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;
    const statKeys = C.STAT_KEYS;
    const rankBaselines = this.getRankBaselineStats(shadowRank, rankMultiplier);

    if (!rankBaselines) {
      return statKeys.reduce((stats, key) => {
        stats[key] = 10;
        return stats;
      }, {});
    }

    return statKeys.reduce((baseStats, stat) => {
      const roleWeight = weights[stat] || 1.0;
      const rankBaseline = rankBaselines[stat] || 10;
      const variance = 0.9 + Math.random() * 0.2;
      const shadowStat = rankBaseline * roleWeight * variance;
      baseStats[stat] = Math.max(1, Math.round(shadowStat));
      return baseStats;
    }, {});
  },

  calculateShadowStrength(stats, multiplier = 1) {
    if (!stats) return 0;
    if (multiplier <= 0) return 0;
    const statKeys = C.STAT_KEYS;
    const totalStats = statKeys.reduce((sum, key) => sum + (stats[key] || 0), 0);
    return Math.floor(totalStats * multiplier);
  },

  // ============================================================================
  // POWER CALCULATION & CACHING
  // ============================================================================

  calculateShadowPower(effectiveStats, multiplier = 1) {
    return this.calculateShadowStrength(effectiveStats, multiplier);
  },

  _setShadowPowerCacheValue(cacheKey, powerValue) {
    if (!cacheKey) return;
    if (!this._shadowPowerCache) {
      this._shadowPowerCache = new Map();
    }
    if (this._shadowPowerCache.size >= this._shadowPowerCacheLimit) {
      const firstKey = this._shadowPowerCache.keys().next().value;
      this._shadowPowerCache.delete(firstKey);
    }
    this._shadowPowerCache.set(cacheKey, powerValue);
  },

  calculateShadowPowerCached(shadow, preDecompressedShadow = null) {
    if (!this.getCacheKey(shadow)) {
      this.debugLog('POWER_CALC', 'Invalid shadow object', {
        hasShadow: !!shadow,
        hasId: !!(shadow && shadow.id),
        hasI: !!(shadow && shadow.i),
      });
      return 0;
    }

    const shadowId = this.getCacheKey(shadow);
    if (!shadowId) return 0;

    const cacheKey = `power_${shadowId}`;
    if (this._shadowPowerCache && this._shadowPowerCache.has(cacheKey)) {
      return this._shadowPowerCache.get(cacheKey);
    }

    const decompressed = preDecompressedShadow || this.getShadowData(shadow);
    if (!decompressed) {
      this.debugLog('POWER_CALC', 'Failed to decompress shadow', {
        shadowId,
        isCompressed: !!(shadow._c === 1 || shadow._c === 2),
      });
      return 0;
    }

    if (decompressed.strength && decompressed.strength > 0) {
      this._setShadowPowerCacheValue(cacheKey, decompressed.strength);
      return decompressed.strength;
    }

    const effective = this.getShadowEffectiveStats(decompressed);
    if (!effective) {
      this.debugLog('POWER_CALC', 'No effective stats available', {
        shadowId: shadowId,
        hasDecompressed: !!decompressed,
        hasBaseStats: !!decompressed?.baseStats,
      });
      return 0;
    }
    const power = this.calculateShadowPower(effective, 1);

    if (power === 0) {
      this.debugLog('POWER_CALC', 'Calculated power is 0', {
        shadowId: shadowId,
        effectiveStats: effective,
        hasStrength: !!decompressed.strength,
        decompressedStrength: decompressed.strength,
      });
    }

    this._setShadowPowerCacheValue(cacheKey, power);
    return power;
  },

  processShadowsWithPower(shadows, useCache = true) {
    if (!shadows || shadows.length === 0) return [];

    return shadows.map((shadow) => {
      const decompressed = this.getShadowData(shadow);
      const effective = this.getShadowEffectiveStats(decompressed);
      const power = useCache
        ? this.calculateShadowPowerCached(shadow, decompressed)
        : this.calculateShadowStrength(effective, decompressed.level || 1);

      return {
        shadow,
        decompressed,
        effective,
        power,
        compressionLevel: shadow._c || 0,
      };
    });
  },

  clearShadowPowerCache() {
    if (this._shadowPowerCache) {
      this._shadowPowerCache.clear();
      this.debugLog('CACHE', 'Shadow power cache cleared');
    }
  },

  clearCombatCache() {
    this.clearShadowPowerCache();
    this._soloDataCache = null;
    this._soloDataCacheTime = 0;
    this._snapshotCache = null;
    this._snapshotTimestamp = 0;
    this._topGeneralsCache = null;
    this._topGeneralsCacheKey = null;
    this._topGeneralsCacheTime = 0;
    this._armyStatsCache = null;
    this._armyStatsCacheTime = null;
    this._armyStatsCacheKey = null;
    this._widgetDirty = true;
  },

  getCacheKey(shadow) {
    if (!shadow) return null;
    return shadow.id || shadow.i || null;
  },

  getAllCacheKeys(shadow) {
    if (!shadow) return [];

    const keys = new Set();
    const add = (value) => {
      if (value === null || value === undefined) return;
      const normalized = String(value).trim();
      normalized && keys.add(normalized);
    };

    add(shadow.id);
    add(shadow.i);
    add(shadow.extractedData?.id);
    add(shadow.extractedData?.i);

    if (keys.size === 0 && typeof this.decompressShadow === 'function') {
      try {
        const decompressed = this.decompressShadow(shadow);
        add(decompressed?.id);
        add(decompressed?.i);
      } catch (error) {
        this.debugError('CACHE', 'Failed to derive cache keys from compressed shadow payload', error);
      }
    }

    return [...keys];
  },

  invalidateShadowPowerCache(shadow) {
    if (!shadow || !this._shadowPowerCache) return;
    const keys = this.getAllCacheKeys
      ? this.getAllCacheKeys(shadow)
      : [this.getCacheKey(shadow)].filter(Boolean);
    keys.forEach((key) => {
      const powerCacheKey = `power_${key}`;
      if (this._shadowPowerCache.has(powerCacheKey)) {
        this._shadowPowerCache.delete(powerCacheKey);
        this.debugLog('CACHE', 'Invalidated power cache', { key: powerCacheKey });
      }
    });
  },

  getArmyStatsCacheKey() {
    const ts = this.settings?.cachedTotalPowerTimestamp || 0;
    const count = this.settings?.cachedTotalPowerShadowCount || 0;
    const version = this.settings?.cachedTotalPowerVersion || 0;
    return `${ts}_${count}_${version}`;
  },

  createEmptyArmyStats() {
    return {
      totalShadows: 0,
      totalPower: 0,
      totalStats: this.createZeroStatBlock(),
      byRank: {},
      byRole: {},
      avgLevel: 0,
    };
  },

  createZeroStatBlock() {
    return C.STAT_KEYS.reduce((stats, key) => {
      stats[key] = 0;
      return stats;
    }, {});
  },
};
