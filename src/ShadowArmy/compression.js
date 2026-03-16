/**
 * ShadowArmy — Hybrid compression system + essence conversion + data prep.
 * Mixin: all methods assigned to ShadowArmy.prototype via Object.assign.
 *
 * Tiered Compression:
 *   Tier 1 (top 1,000): Full data (generals + elites)
 *   Tier 2 (next 9,000): Regular compression (_c:1, 80% savings)
 *   Tier 3 (rest): Ultra-compression (_c:2, 95% savings)
 */
const C = require('./constants');

module.exports = {
  // PERSONALITY HELPERS (wrappers around constants.js)

  normalizePersonalityValue(value) {
    return C.normalizeShadowPersonalityValue(value);
  },

  derivePersonalityFromRole(role) {
    return C.deriveShadowPersonalityFromRole(role);
  },

  getShadowPersonalityKey(shadow) {
    if (!shadow || typeof shadow !== 'object') return '';

    // Prefer storage manager normalization when available (single source of truth).
    if (this.storageManager?.getNormalizedPersonalityKey) {
      return this.storageManager.getNormalizedPersonalityKey(shadow);
    }

    const explicitKey = this.normalizePersonalityValue(shadow.personalityKey || shadow.pk);
    if (explicitKey) return explicitKey;

    const explicitPersonality = this.normalizePersonalityValue(shadow.personality);
    if (explicitPersonality) return explicitPersonality;

    return this.derivePersonalityFromRole(shadow.role || shadow.ro || '');
  },

  // COMPRESSION (regular _c:1, 80% savings)

  /**
   * Compress shadow data (80% memory reduction per shadow).
   * Full format (500 bytes) → Compressed format (100 bytes).
   */
  compressShadow(shadow) {
    if (!shadow || !shadow.id) return null;

    return {
      _c: 1, // Compression marker
      i: shadow.id,
      r: shadow.rank,
      ro: shadow.role,
      bt: shadow.beastType || null,
      bf: shadow.beastFamily || null,
      pk: this.getShadowPersonalityKey(shadow),
      l: shadow.level || 1,
      x: shadow.xp || 0,
      b: [
        shadow.baseStats?.strength || 0,
        shadow.baseStats?.agility || 0,
        shadow.baseStats?.intelligence || 0,
        shadow.baseStats?.vitality || 0,
        shadow.baseStats?.perception || 0,
      ],
      g: [
        shadow.growthStats?.strength || 0,
        shadow.growthStats?.agility || 0,
        shadow.growthStats?.intelligence || 0,
        shadow.growthStats?.vitality || 0,
        shadow.growthStats?.perception || 0,
      ],
      n: [
        shadow.naturalGrowthStats?.strength || 0,
        shadow.naturalGrowthStats?.agility || 0,
        shadow.naturalGrowthStats?.intelligence || 0,
        shadow.naturalGrowthStats?.vitality || 0,
        shadow.naturalGrowthStats?.perception || 0,
      ],
      c: Math.round((shadow.totalCombatTime || 0) * 10) / 10,
      e: shadow.extractedAt,
      lng: shadow.lastNaturalGrowth || shadow.extractedAt,
      s: Math.round((shadow.growthVarianceSeed || Math.random()) * 100) / 100,
      ol: shadow.ownerLevelAtExtraction || 1,
      hv: shadow._healV || 0,
      gr: shadow.grade || 'Common', // Shadow grade (manhwa lore tier)

      // IDB index fields — full-name properties so compressed shadows
      // remain visible to IndexedDB secondary indexes
      rank: shadow.rank,
      role: shadow.role,
      level: shadow.level || 1,
      strength: shadow.strength || 0,
      extractedAt: shadow.extractedAt,
    };
  },

  // ULTRA-COMPRESSION (_c:2, 95% savings)

  /**
   * Ultra-compress shadow data (95% memory reduction).
   * Used for shadows beyond top 1,000 (cold data).
   */
  compressShadowUltra(shadow) {
    if (!shadow || !shadow.id) return null;

    const effectiveStats = this.getShadowEffectiveStats(shadow);
    const statKeys = C.STAT_KEYS;
    const totalStats = statKeys.reduce((sum, stat) => sum + (effectiveStats[stat] || 0), 0);

    // Preserve growth totals as scaled sums (prevents permanent data loss)
    const totalGrowth = statKeys.reduce(
      (sum, stat) => sum + (shadow.growthStats?.[stat] || 0),
      0
    );
    const totalNatGrowth = statKeys.reduce(
      (sum, stat) => sum + (shadow.naturalGrowthStats?.[stat] || 0),
      0
    );

    return {
      _c: 2, // Ultra-compression marker
      i: shadow.id,
      r: shadow.rank || 'E',
      ro: shadow.role || 'unknown',
      bt: shadow.beastType || null,
      bf: shadow.beastFamily || null,
      pk: this.getShadowPersonalityKey(shadow),
      p: Math.round((shadow.strength || 0) / 10),
      l: shadow.level || 1,
      x: shadow.xp || 0,
      e: Math.floor((shadow.extractedAt || Date.now()) / 86400000),
      s: Math.floor(totalStats / 100),
      gt: Math.round(totalGrowth),
      nt: Math.round(totalNatGrowth),
      vs: Math.round((shadow.growthVarianceSeed || Math.random()) * 100) / 100,
      ol: shadow.ownerLevelAtExtraction || 1,
      hv: shadow._healV || 0,
      gr: shadow.grade || 'Common',

      // IDB index fields
      rank: shadow.rank || 'E',
      role: shadow.role || 'unknown',
      level: shadow.level || 1,
      strength: shadow.strength || 0,
      extractedAt: shadow.extractedAt || Date.now(),
    };
  },

  // DECOMPRESSION

  /**
   * Decompress ultra-compressed shadow (_c:2) back to usable format.
   * Note: Some data is approximated (stats are reconstructed).
   */
  decompressShadowUltra(compressed) {
    if (!compressed || compressed._c !== 2) {
      return compressed;
    }

    const statKeys = C.STAT_KEYS;

    // Reconstruct growth totals from preserved sums (distribute evenly)
    const totalGrowth = compressed.gt || 0;
    const totalNatGrowth = compressed.nt || 0;
    const perStatGrowth = Math.floor(totalGrowth / 5);
    const perStatNatGrowth = Math.floor(totalNatGrowth / 5);

    // Base stats = total effective scaled back minus growth contributions
    const totalEffective = compressed.s * 100;
    const perStatBase = Math.max(0, Math.floor((totalEffective - totalGrowth - totalNatGrowth) / 5));

    const baseStats = statKeys.reduce((stats, stat) => {
      stats[stat] = perStatBase;
      return stats;
    }, {});

    const growthStats = statKeys.reduce((stats, stat) => {
      stats[stat] = perStatGrowth;
      return stats;
    }, {});

    const naturalGrowthStats = statKeys.reduce((stats, stat) => {
      stats[stat] = perStatNatGrowth;
      return stats;
    }, {});

    const role = compressed.ro || 'unknown';
    return {
      id: compressed.i,
      rank: compressed.r,
      role,
      beastType: compressed.bt || null,
      beastFamily: compressed.bf || null,
      roleName: this.shadowRoles?.[role]?.name || role,
      personalityKey: this.normalizePersonalityValue(compressed.pk),
      personality: this.normalizePersonalityValue(compressed.pk),
      level: compressed.l,
      xp: compressed.x || 0,
      strength: compressed.p * 10,
      baseStats,
      growthStats,
      naturalGrowthStats,
      totalCombatTime: 0,
      extractedAt: compressed.e * 86400000,
      growthVarianceSeed: compressed.vs || Math.random(),
      ownerLevelAtExtraction: compressed.ol || 1,
      lastNaturalGrowth: compressed.e * 86400000,
      _healV: compressed.hv || 0,
      grade: compressed.gr || 'Common',
      _ultraCompressed: true,
    };
  },

  /**
   * Decompress regular compressed shadow (_c:1) back to full format.
   */
  decompressShadow(compressed) {
    if (!compressed || !compressed._c) {
      return compressed;
    }

    const statKeys = C.STAT_KEYS;

    const baseStats = statKeys.reduce((stats, stat, index) => {
      stats[stat] = compressed.b[index] || 0;
      return stats;
    }, {});

    const growthStats = statKeys.reduce((stats, stat, index) => {
      stats[stat] = compressed.g[index] || 0;
      return stats;
    }, {});

    const naturalGrowthStats = statKeys.reduce((stats, stat, index) => {
      stats[stat] = compressed.n[index] || 0;
      return stats;
    }, {});

    return {
      id: compressed.i,
      rank: compressed.r,
      role: compressed.ro,
      beastType: compressed.bt || null,
      beastFamily: compressed.bf || null,
      roleName: this.shadowRoles[compressed.ro]?.name || compressed.ro,
      personalityKey:
        this.normalizePersonalityValue(compressed.pk) ||
        this.derivePersonalityFromRole(compressed.ro),
      personality:
        this.normalizePersonalityValue(compressed.pk) ||
        this.derivePersonalityFromRole(compressed.ro),
      level: compressed.l,
      xp: compressed.x,
      baseStats,
      growthStats,
      naturalGrowthStats,
      totalCombatTime: compressed.c,
      extractedAt: compressed.e,
      growthVarianceSeed: compressed.s || Math.random(),
      ownerLevelAtExtraction: compressed.ol || 1,
      lastNaturalGrowth: compressed.lng || compressed.e,
      strength: 0,
      _healV: compressed.hv || 0,
      grade: compressed.gr || 'Common',
      _compressed: true,
    };
  },

  // CACHE INVALIDATION & BATCH DELETE

  _invalidateShadowStateCaches(oldShadow) {
    if (!oldShadow) return;

    this.storageManager?.invalidateCache?.(oldShadow);
    this.invalidateShadowPowerCache(oldShadow);

    const oldId = this.getCacheKey(oldShadow);
    const oldI = oldShadow.i;
    if (!this._shadowPersonalityCache) return;
    oldId && this._shadowPersonalityCache.delete(`personality_${oldId}`);
    oldI && oldI !== oldId && this._shadowPersonalityCache.delete(`personality_${oldI}`);
  },

  async _deleteShadowsByIds(shadowIds, scope = 'ESSENCE') {
    if (!Array.isArray(shadowIds) || shadowIds.length === 0) return true;
    if (!this.storageManager?.deleteShadowsBatch) return false;

    try {
      await this.storageManager.deleteShadowsBatch(shadowIds);
      this.clearShadowPowerCache();
      this._invalidateSnapshot();
      return true;
    } catch (error) {
      this.debugError(scope, 'Batch delete error', error);
      return false;
    }
  },

  // TIERED COMPRESSION PIPELINE

  /**
   * Process shadow compression — compress weak shadows to save memory.
   * Runs periodically (every hour) alongside natural growth.
   *
   * Tier 1: Top 1,000 — Full format (Elite Force)
   * Tier 2: Next 9,000 — Regular compression (80% savings)
   * Tier 3: Rest — Ultra-compression (95% savings)
   */
  async processShadowCompression() {
    try {
      const config = this.settings.shadowCompression || this.defaultSettings.shadowCompression;

      if (!config.enabled) {
        return;
      }

      let allShadows = [];
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, Infinity);
        } catch (error) {
          this.debugError('COMPRESSION', 'Error getting shadows', error);
          return;
        }
      }

      if (allShadows.length <= 1000) {
        this.debugLog('COMPRESSION', 'Army too small, skipping');
        return;
      }

      // Calculate power for each shadow (with caching)
      const shadowsWithPower = this.processShadowsWithPower(allShadows, true).map(
        ({ shadow, decompressed, power, compressionLevel }) => ({
          shadow: decompressed,
          power,
          isCompressed: compressionLevel > 0,
          compressionLevel,
        })
      );

      shadowsWithPower.sort((a, b) => b.power - a.power);

      const eliteThreshold = 1000;
      const warmThreshold = 10000;

      const elites = shadowsWithPower.slice(0, eliteThreshold);
      const warm = shadowsWithPower.slice(eliteThreshold, warmThreshold);
      const cold = shadowsWithPower.slice(warmThreshold);

      const counters = { compressed: 0, ultraCompressed: 0, decompressed: 0 };

      // --- Cold tier: ultra-compress ---
      const coldToUpdate = cold
        .filter(({ compressionLevel }) => compressionLevel !== 2)
        .map(({ shadow }) => {
          if (shadow._c === 2) return shadow;
          const oldShadow = { ...shadow };
          const ultraCompressedShadow = this.compressShadowUltra(shadow);
          if (ultraCompressedShadow) {
            this._invalidateShadowStateCaches(oldShadow);
          }
          return ultraCompressedShadow;
        })
        .filter((shadow) => shadow !== null && this.getCacheKey(shadow));

      let coldUpdated = 0;
      if (coldToUpdate.length > 0 && this.storageManager?.updateShadowsBatch) {
        try {
          coldUpdated = await this.storageManager.updateShadowsBatch(coldToUpdate);
        } catch (error) {
          this.debugError('COMPRESSION', 'Ultra-compression: Batch update error', error);
        }
      }
      counters.ultraCompressed = coldUpdated;

      // --- Warm tier: regular compress ---
      const warmToCompress = warm
        .filter(({ compressionLevel }) => compressionLevel !== 1)
        .map(({ shadow, compressionLevel }) => {
          const oldShadow = { ...shadow };
          let compressedShadow = null;

          if (compressionLevel === 2) {
            const decompressed = this.decompressShadowUltra(shadow);
            compressedShadow = decompressed ? this.compressShadow(decompressed) : null;
          } else if (shadow._c === 1 || shadow._c === 2) {
            compressedShadow = shadow;
          } else {
            compressedShadow = this.compressShadow(shadow);
          }

          if (compressedShadow && compressedShadow !== shadow) {
            this._invalidateShadowStateCaches(oldShadow);
          }

          return compressedShadow;
        })
        .filter((shadow) => shadow !== null && this.getCacheKey(shadow));

      let warmUpdated = 0;
      if (warmToCompress.length > 0 && this.storageManager?.updateShadowsBatch) {
        try {
          warmUpdated = await this.storageManager.updateShadowsBatch(warmToCompress);
        } catch (error) {
          this.debugError('COMPRESSION', 'Compression: Batch update error', error);
        }
      }

      const downgradeCount = warm.filter(({ compressionLevel }) => compressionLevel === 2).length;
      counters.compressed = warmUpdated;
      counters.ultraCompressed -= downgradeCount;

      // --- Elite tier: decompress if needed ---
      const elitesToDecompress = elites
        .filter(({ compressionLevel }) => compressionLevel !== 0)
        .map(({ shadow }) => {
          const oldShadow = { ...shadow };
          const decompressed = this.prepareShadowForSave(shadow);
          if (decompressed) {
            this._invalidateShadowStateCaches(oldShadow);
          }
          return decompressed;
        })
        .filter((shadow) => shadow !== null && this.getCacheKey(shadow));

      let elitesUpdated = 0;
      if (elitesToDecompress.length > 0 && this.storageManager?.updateShadowsBatch) {
        try {
          elitesUpdated = await this.storageManager.updateShadowsBatch(elitesToDecompress);
        } catch (error) {
          this.debugError('COMPRESSION', 'Decompression: Batch update error', error);
        }
      }
      counters.decompressed = elitesUpdated;

      // Consolidated cache invalidation — once after all tiers
      if (coldUpdated > 0 || warmUpdated > 0 || elitesUpdated > 0) {
        this.clearShadowPowerCache();
        this.settings.cachedTotalPowerShadowCount = 0;
      }

      const { compressed, ultraCompressed, decompressed } = counters;

      if (!this.settings.shadowCompression) {
        this.settings.shadowCompression = { ...config };
      }
      this.settings.shadowCompression.lastCompressionTime = Date.now();
      this.saveSettings();

      if (compressed > 0 || ultraCompressed > 0 || decompressed > 0) {
        this.debugLog(
          'COMPRESSION',
          `Compression: ${compressed} compressed, ${ultraCompressed} ultra-compressed, ${decompressed} decompressed`
        );
        this.debugLog(
          'COMPRESSION',
          `Elite: ${elites.length} (full) | Warm: ${warm.length} (compressed) | Cold: ${cold.length} (ultra)`
        );
        const savings = Math.floor((compressed * 0.8 * 500 + ultraCompressed * 0.95 * 500) / 1024);
        this.debugLog('COMPRESSION', `Memory Savings: ~${savings} KB`);
      }
    } catch (error) {
      this.debugError('COMPRESSION', 'Error processing', error);
    }
  },

  // ESSENCE CONVERSION

  /**
   * Convert shadows to essence by rank and quantity.
   * Selects weakest shadows of the given rank.
   * @param {string} rank - Rank of shadows to convert
   * @param {number} quantity - Number of shadows to convert
   * @returns {Promise<Object>} Conversion result
   */
  // SHADOW GRADE AUTO-PROMOTION
  // Promotes shadows through manhwa lore grades (Common→Elite→Knight→...→Grand Marshal)
  // using accumulated shadow essence. Runs automatically on a timer.

  async autoPromoteGrades() {
    const essenceConfig = this.settings?.shadowEssence || this.defaultSettings.shadowEssence;
    if (essenceConfig?.enabled === false) return { promoted: 0 };
    const currentEssence = essenceConfig?.essence || 0;
    if (currentEssence <= 0) return { promoted: 0 };

    const gradeOrder = C.SHADOW_GRADES;
    const promotionCosts = essenceConfig?.gradePromotionCost
      || this.defaultSettings.shadowEssence.gradePromotionCost;
    const batchSize = essenceConfig?.autoPromoteBatchSize || 50;

    // Load a sample of shadows to promote (prioritize highest-level first)
    let shadows = [];
    if (this.storageManager?.getShadows) {
      try {
        shadows = await this.storageManager.getShadows({}, 0, batchSize * 4);
      } catch (error) {
        this.debugError('GRADE', 'Failed to load shadows for grade promotion', error);
        return { promoted: 0 };
      }
    }
    if (shadows.length === 0) return { promoted: 0 };

    // Sort by level descending — promote strongest shadows first (Monarch's priority)
    const withLevel = shadows.map((s) => {
      const data = this.getShadowData(s);
      return { raw: s, data, level: data?.level || 1, grade: data?.grade || s?.gr || 'Common' };
    });
    withLevel.sort((a, b) => b.level - a.level);

    let promoted = 0;
    let essenceSpent = 0;
    let remainingEssence = currentEssence;
    const saveBatch = [];

    for (let i = 0; i < withLevel.length && promoted < batchSize; i++) {
      const entry = withLevel[i];
      const currentGrade = entry.grade;
      const gradeIndex = gradeOrder.indexOf(currentGrade);
      if (gradeIndex < 0 || gradeIndex >= gradeOrder.length - 1) continue;

      const nextGrade = gradeOrder[gradeIndex + 1];
      const cost = promotionCosts?.[nextGrade] || 0;
      if (cost <= 0 || remainingEssence < cost) continue;

      // Promote!
      remainingEssence -= cost;
      essenceSpent += cost;
      promoted++;

      // Update shadow grade in both decompressed and raw form
      if (entry.data) entry.data.grade = nextGrade;
      const rawShadow = entry.raw;
      if (rawShadow._c) {
        // Compressed: update gr field directly
        rawShadow.gr = nextGrade;
      } else {
        rawShadow.grade = nextGrade;
      }
      saveBatch.push(rawShadow);
    }

    if (promoted > 0) {
      // Persist essence deduction
      essenceConfig.essence = Math.max(0, remainingEssence);

      // Batch-save promoted shadows
      if (this.storageManager?.saveShadow) {
        for (const shadow of saveBatch) {
          try {
            await this.storageManager.saveShadow(shadow);
          } catch (error) {
            this.debugError('GRADE', 'Failed to save promoted shadow', error);
          }
        }
      }
      this._invalidateSnapshot?.();
      this.saveSettings();

      this.debugLog?.('GRADE', `Auto-promoted ${promoted} shadows (${essenceSpent.toLocaleString()} essence spent, ${remainingEssence.toLocaleString()} remaining)`);
    }

    return { promoted, essenceSpent, remainingEssence };
  },

  // DATA ACCESS & SAVE PREP

  /**
   * Get shadow in correct format (decompress if needed).
   * Used throughout plugin to handle both formats transparently.
   */
  getShadowData(shadow) {
    if (!shadow) return null;

    const decompressors = {
      1: this.decompressShadow,
      2: this.decompressShadowUltra,
    };

    const decompressor = decompressors[shadow._c];
    return typeof decompressor === 'function' ? decompressor.call(this, shadow) : shadow;
  },

  /**
   * Prepare shadow for saving to IndexedDB.
   * Removes compression markers and ensures clean save.
   * Compression system will re-compress weak shadows on next hourly run.
   */
  prepareShadowForSave(shadow) {
    if (!shadow) return null;

    // If already stored in compressed form, keep it as-is
    if (shadow._c === 1 || shadow._c === 2) {
      const personalityKey = this.getShadowPersonalityKey(shadow);
      if (shadow.pk === personalityKey) {
        return shadow;
      }
      return {
        ...shadow,
        pk: personalityKey,
      };
    }

    // Omit UI-only decompression markers via destructuring
    const {
      _compressed: _ignoredCompressed,
      _ultraCompressed: _ignoredUltra,
      ...shadowToSave
    } = shadow;

    const defaultStats =
      typeof this.createZeroStatBlock === 'function'
        ? this.createZeroStatBlock()
        : C.STAT_KEYS.reduce((stats, key) => {
            stats[key] = 0;
            return stats;
          }, {});

    shadowToSave.baseStats = shadowToSave.baseStats || { ...defaultStats };
    shadowToSave.growthStats = shadowToSave.growthStats || { ...defaultStats };
    shadowToSave.naturalGrowthStats = shadowToSave.naturalGrowthStats || { ...defaultStats };
    shadowToSave.personalityKey = this.getShadowPersonalityKey(shadowToSave);
    if (!shadowToSave.personality && shadowToSave.personalityKey) {
      shadowToSave.personality = shadowToSave.personalityKey;
    }

    // Ensure strength is populated before saving
    if (
      (!shadowToSave.strength || shadowToSave.strength === 0) &&
      typeof this.calculateShadowPower === 'function'
    ) {
      const decompressed = this.getShadowData ? this.getShadowData(shadowToSave) : shadowToSave;
      const effective =
        typeof this.getShadowEffectiveStats === 'function'
          ? this.getShadowEffectiveStats(decompressed)
          : null;

      if (effective) {
        shadowToSave.strength = this.calculateShadowPower(effective, 1);
      } else if (decompressed?.baseStats) {
        shadowToSave.strength = this.calculateShadowPower(decompressed.baseStats, 1);
      }
    }

    return shadowToSave;
  },
};
