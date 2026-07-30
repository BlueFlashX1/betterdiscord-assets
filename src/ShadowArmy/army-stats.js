/**
 * ShadowArmy — Dungeon combat optimization helpers and army stats aggregation.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./army-stats'))
 */
const C = require('./constants');

module.exports = {
  // DUNGEON COMBAT OPTIMIZATION HELPERS

  _getShadowPowerValue(shadow) {
    const indexedStrength = Number(shadow?.strength);
    if (Number.isFinite(indexedStrength) && indexedStrength > 0) {
      return indexedStrength;
    }

    let decompressed = shadow;
    if (this.getShadowData && typeof this.getShadowData === 'function') {
      decompressed = this.getShadowData(shadow) || shadow;
    }

    const decompressedStrength = Number(decompressed?.strength);
    if (Number.isFinite(decompressedStrength) && decompressedStrength > 0) {
      return decompressedStrength;
    }

    const effective = this.getShadowEffectiveStats(decompressed);
    if (effective) {
      const power = this.calculateShadowPower(effective, 1);
      if (power > 0) return power;
    }

    return 0;
  },

  _accumulateShadowPower(shadow, totals) {
    try {
      const power = this._getShadowPowerValue(shadow);
      if (power > 0) {
        totals.totalPower += power;
        totals.processedCount += 1;
      }
    } catch (shadowError) {
      this.debugLog('POWER', 'Failed to calculate power for shadow', {
        shadowId: this.getCacheKey(shadow),
        error: shadowError?.message,
      });
    }
  },

  _persistTotalPowerCache(totalPower, currentCount) {
    this.settings.cachedTotalPower = totalPower;
    this.settings.cachedTotalPowerShadowCount = currentCount;
    this.settings.cachedTotalPowerTimestamp = Date.now();
    this.settings.cachedTotalPowerVersion = (this.settings.cachedTotalPowerVersion || 0) + 1;
    this.saveSettings();
  },

  async _applyTotalPowerDelta(shadow, direction) {
    const shadowPower = this._getShadowPowerValue(shadow);
    if (!(shadowPower > 0)) return null;

    // A1 (audit): serialize concurrent delta applications via a promise
    // chain. Without this, two parallel extractions both read the same
    // currentPower → race produces a missed contribution. With burst
    // extractions (450ms intervals, 20/min cap), 2-3 increments can be
    // in-flight simultaneously and quietly under-count army power.
    this._applyTotalPowerDeltaChain = (this._applyTotalPowerDeltaChain || Promise.resolve())
      .then(async () => {
        const currentCount = (await this.storageManager?.getTotalCount()) || 0;
        const currentPower = this.settings.cachedTotalPower || 0;
        const newPower =
          direction === 'decrement'
            ? Math.max(0, currentPower - shadowPower)
            : currentPower + shadowPower;

        this.settings.cachedTotalPower = newPower;
        this.settings.cachedTotalPowerShadowCount = currentCount;
        this.settings.cachedTotalPowerTimestamp = Date.now();
        this.settings.cachedTotalPowerVersion = (this.settings.cachedTotalPowerVersion || 0) + 1;
        this.saveSettings();

        // Real army mutation (extraction add/remove) — bump the write-gen
        // counter the hourly compression gate uses. NOTE: do NOT bump this
        // from _persistTotalPowerCache/getTotalShadowPower — those also run
        // on passive cache-refresh reads (e.g. widget/buff lookups) with no
        // underlying mutation, which would falsely defeat the gate.
        this._armyWriteGen = (this._armyWriteGen || 0) + 1;

        return { shadowPower, currentPower, newPower, currentCount };
      })
      .catch((err) => {
        this.debugError('POWER', '_applyTotalPowerDelta chain error', err);
        return null;
      });
    return this._applyTotalPowerDeltaChain;
  },

  async getTotalShadowPower(forceRecalculate = false) {
    if (!forceRecalculate && this.storageManager && this.settings.cachedTotalPowerTimestamp) {
      const currentCount = (await this.storageManager.getTotalCount()) || 0;
      const cachedCount = this.settings.cachedTotalPowerShadowCount || 0;

      if (currentCount === cachedCount) {
        const cachedPower = this.settings.cachedTotalPower || 0;
        this.debugLog('POWER', 'Using incremental cache', { cachedPower, shadowCount: currentCount });
        return cachedPower;
      }
    }

    this.debugLog('POWER', 'Recalculating total power from all shadows', {
      forceRecalculate,
      cachedPower: this.settings.cachedTotalPower,
      cachedCount: this.settings.cachedTotalPowerShadowCount || 0,
    });

    const totals = { totalPower: 0, processedCount: 0 };

    if (this.storageManager) {
      try {
        // Power accumulation is order-free — paged walker (500/IDB event)
        // instead of per-record cursor (profiler 2026-07-29: 281k events/walk).
        const streamPower = this.storageManager.forEachShadowBatchPaged
          ? this.storageManager.forEachShadowBatchPaged.bind(this.storageManager)
          : this.storageManager.forEachShadowBatch.bind(this.storageManager);
        const streamResult = await streamPower(
          (batch) => {
            for (let i = 0; i < batch.length; i++) {
              this._accumulateShadowPower(batch[i], totals);
            }
          },
          { batchSize: 500 }
        );

        // Re-guard with optional chain: plugin.stop() can null storageManager
        // mid-stream while we're awaiting forEachShadowBatch above.
        const currentCount = (await this.storageManager?.getTotalCount()) || 0;
        this._persistTotalPowerCache(totals.totalPower, currentCount);

        this.debugLog('POWER', 'Total power calculated', {
          totalPower: totals.totalPower,
          processedShadows: totals.processedCount,
          scannedShadows: streamResult?.scanned || 0,
          streamBatches: streamResult?.batches || 0,
          totalShadows: currentCount,
          cacheUpdated: true,
        });

        return totals.totalPower;
      } catch (error) {
        this.debugError('POWER', 'Failed to calculate total power', error);
        // Use ?? so a legitimately cached 0 is preserved; only fall back to 0
        // if the cache itself is missing. Surface a toast when BOTH the
        // calculation failed AND we have no cache to fall back on, since
        // returning 0 to downstream buff calculations is silently dramatic
        // (Solo Leveling buffs collapse to 0 with no user signal).
        const cached = this.settings.cachedTotalPower ?? 0;
        if (cached === 0 && !this._totalPowerFailureToastShown) {
          this._totalPowerFailureToastShown = true;
          try {
            BdApi.UI?.showToast?.(
              'ShadowArmy: failed to compute total power and no cache available. Army buffs may be wrong.',
              { type: 'error', timeout: 8000 }
            );
          } catch (_) {}
        }
        return cached;
      }
    }

    return 0;
  },

  async incrementTotalPower(shadow) {
    try {
      const result = await this._applyTotalPowerDelta(shadow, 'increment');
      if (result) {
        this.debugLog('POWER', 'Incremented total power cache', {
          shadowPower: result.shadowPower,
          previousPower: result.currentPower,
          newPower: result.newPower,
          shadowCount: result.currentCount,
        });
        return result.newPower;
      }
    } catch (error) {
      this.debugError('POWER', 'Failed to increment total power', error);
    }

    return this.settings.cachedTotalPower || 0;
  },

  // ARMY STATS AGGREGATION

  logShadowAggregationSamples(allShadows) {
    this.debugLog('COMBAT', 'Retrieved shadows for aggregation', {
      shadowCount: allShadows.length,
      firstShadowSample: allShadows[0]
        ? {
            id: allShadows[0].id || allShadows[0].i,
            rank: allShadows[0].rank,
            hasStrength: !!allShadows[0].strength,
            strength: allShadows[0].strength,
            hasBaseStats: !!allShadows[0].baseStats,
            baseStats: allShadows[0].baseStats,
            isCompressed: !!(allShadows[0]._c === 1 || allShadows[0]._c === 2),
          }
        : null,
    });

    if (allShadows.length > 0) {
      const sampleShadow = allShadows[0];
      let decompressed = sampleShadow;
      if (this.getShadowData && typeof this.getShadowData === 'function') {
        decompressed = this.getShadowData(sampleShadow) || sampleShadow;
      }
      const effective = this.getShadowEffectiveStats(decompressed);
      const power = this.calculateShadowPower(effective, 1);

      this.debugLog('COMBAT', 'Sample shadow power calculation', {
        shadowId: sampleShadow.id || sampleShadow.i,
        hasGetShadowData: !!this.getShadowData,
        hasDecompressed: !!decompressed,
        hasEffective: !!effective,
        effectiveStats: effective,
        calculatedPower: power,
        storedStrength: sampleShadow.strength,
        decompressedStrength: decompressed?.strength,
        hasBaseStats: !!decompressed?.baseStats,
        baseStats: decompressed?.baseStats,
      });
    }
  },

  createArmyStatsAccumulator(statKeys) {
    const keys = Array.isArray(statKeys)
      ? statKeys
      : C.STAT_KEYS;

    return {
      totalShadows: 0,
      totalPower: 0,
      totalLevel: 0,
      totalStats: this.createZeroStatsBucket(keys),
      byRank: {},
      byRole: {},
    };
  },

  createZeroStatsBucket(statKeys) {
    const keys = Array.isArray(statKeys)
      ? statKeys
      : C.STAT_KEYS;
    return keys.reduce((stats, key) => {
      stats[key] = 0;
      return stats;
    }, {});
  },

  _accumulateArmyStatsForShadow(acc, shadow, statKeys) {
    let decompressed = shadow;
    if (this.getShadowData && typeof this.getShadowData === 'function') {
      decompressed = this.getShadowData(shadow);
    }
    if (!decompressed) decompressed = shadow;

    if (!decompressed || (!decompressed.id && !decompressed.i)) {
      const shadowId = this.getCacheKey(shadow);
      this.debugLog('COMBAT', 'Invalid shadow data, skipping', {
        shadowId,
        hasGetShadowData: !!this.getShadowData,
      });
      return;
    }

    const effective = this.getShadowEffectiveStats(decompressed);
    if (!effective) {
      this.debugLog('COMBAT', 'Cannot calculate effective stats, skipping shadow', {
        shadowId: this.getCacheKey(decompressed),
        hasBaseStats: !!decompressed.baseStats,
        hasGrowthStats: !!decompressed.growthStats,
        hasNaturalGrowthStats: !!decompressed.naturalGrowthStats,
      });
      return;
    }

    const totalEffectiveStats = statKeys.reduce((sum, key) => sum + (effective[key] || 0), 0);
    if (totalEffectiveStats === 0) {
      const fallbackStrength = decompressed.strength || shadow.strength || 0;
      if (fallbackStrength > 0) {
        this.debugLog('COMBAT', 'Using stored strength as fallback (effective stats are all 0)', {
          shadowId: this.getCacheKey(decompressed),
          storedStrength: fallbackStrength,
          effectiveStats: effective,
          baseStats: decompressed.baseStats,
        });
        const power = fallbackStrength;
        acc.totalShadows++;
        acc.totalPower += power;
        acc.totalLevel += decompressed.level || 1;
        const fallbackShare = Math.floor(power / 5);
        for (let k = 0; k < statKeys.length; k++) {
          acc.totalStats[statKeys[k]] += fallbackShare;
        }
      } else {
        this.debugLog('COMBAT', 'Skipping shadow with no valid stats or strength', {
          shadowId: this.getCacheKey(decompressed),
          effectiveStats: effective,
          storedStrength: fallbackStrength,
          baseStats: decompressed.baseStats,
          rank: decompressed?.rank,
        });
      }
      return;
    }

    const power = this.calculateShadowPower(effective, 1);

    if (power === 0 && acc.totalShadows < 3) {
      this.debugLog('COMBAT', 'Power is 0 despite having effective stats', {
        shadowId: this.getCacheKey(decompressed),
        effectiveStats: effective,
        totalEffectiveStats,
        baseStats: decompressed.baseStats,
        growthStats: decompressed.growthStats,
        naturalGrowthStats: decompressed.naturalGrowthStats,
        rank: decompressed?.rank,
        level: decompressed?.level,
        calculatedPower: power,
      });
    }

    acc.totalShadows++;
    acc.totalPower += power;
    acc.totalLevel += decompressed.level || 1;
    for (let k = 0; k < statKeys.length; k++) {
      const stat = statKeys[k];
      acc.totalStats[stat] += effective[stat] || 0;
    }

    const rank = decompressed.rank || 'E';
    if (!acc.byRank[rank]) {
      acc.byRank[rank] = { count: 0, totalPower: 0, totalStats: this.createZeroStatsBucket(statKeys) };
    }
    acc.byRank[rank].count++;
    acc.byRank[rank].totalPower += power;
    const rankStats = acc.byRank[rank].totalStats;
    for (let k = 0; k < statKeys.length; k++) {
      const stat = statKeys[k];
      rankStats[stat] += effective[stat] || 0;
    }

    const role = decompressed.role || decompressed.roleName || 'Unknown';
    if (!acc.byRole[role]) {
      acc.byRole[role] = { count: 0, totalPower: 0, totalStats: this.createZeroStatsBucket(statKeys) };
    }
    acc.byRole[role].count++;
    acc.byRole[role].totalPower += power;
    const roleStats = acc.byRole[role].totalStats;
    for (let k = 0; k < statKeys.length; k++) {
      const stat = statKeys[k];
      roleStats[stat] += effective[stat] || 0;
    }
  },

  aggregateShadowsForArmyStats(allShadows) {
    const statKeys = C.STAT_KEYS;
    const aggregatedData = this.createArmyStatsAccumulator(statKeys);
    const safeShadows = Array.isArray(allShadows) ? allShadows : [];

    for (let i = 0; i < safeShadows.length; i++) {
      this._accumulateArmyStatsForShadow(aggregatedData, safeShadows[i], statKeys);
    }

    return aggregatedData;
  },

  async aggregateShadowsForArmyStatsStreamed(batchSize = 200) {
    const statKeys = C.STAT_KEYS;
    const aggregatedData = this.createArmyStatsAccumulator(statKeys);
    let sampleShadow = null;

    if (!this.storageManager?.forEachShadowBatch) {
      return { aggregatedData, sampleShadow, scanned: 0, batches: 0 };
    }

    // Stats aggregation is order-free (sums + any-record sample) — paged
    // walker instead of per-record cursor (profiler 2026-07-29).
    const streamStats = this.storageManager.forEachShadowBatchPaged
      ? this.storageManager.forEachShadowBatchPaged.bind(this.storageManager)
      : this.storageManager.forEachShadowBatch.bind(this.storageManager);
    const streamResult = await streamStats(
      (batch) => {
        if (!sampleShadow && batch.length > 0) sampleShadow = batch[0];
        for (let i = 0; i < batch.length; i++) {
          this._accumulateArmyStatsForShadow(aggregatedData, batch[i], statKeys);
        }
      },
      { batchSize: Math.max(batchSize, 500) }
    );

    return {
      aggregatedData,
      sampleShadow,
      scanned: streamResult?.scanned || aggregatedData.totalShadows,
      batches: streamResult?.batches || 0,
    };
  },

  async finalizeAggregatedArmyStats({ aggregatedData, allShadowsLength }) {
    const avgLevel =
      aggregatedData.totalShadows > 0
        ? Math.floor(aggregatedData.totalLevel / aggregatedData.totalShadows)
        : 0;

    const totalShadowsCount = aggregatedData.totalShadows;
    const fallbackPower = aggregatedData.totalPower;

    // A2 (audit): trust the freshly-streamed fallbackPower. The streaming
    // aggregation just iterated every shadow and computed the current
    // total. Calling getTotalShadowPower(false) here previously discarded
    // that fresh sum in favor of a possibly-stale cache (e.g. cached value
    // from before a self-heal that increased army power). Use the stream
    // result as the source of truth; only fall back to the cache as a
    // safety net when the stream produced 0 despite having shadows.
    let finalPower = fallbackPower;
    if (totalShadowsCount > 0 && !(fallbackPower > 0)) {
      try {
        const directPower = await this.getTotalShadowPower(false);
        if (directPower > 0) finalPower = directPower;
        this.debugLog('GET_AGGREGATED_ARMY_STATS', 'Stream produced 0 — used cached power', {
          directPower, totalShadows: totalShadowsCount, finalPower,
        });
      } catch (powerError) {
        this.debugError('GET_AGGREGATED_ARMY_STATS', 'Failed to get cached power fallback', powerError);
      }
    }

    const aggregated = { ...aggregatedData, avgLevel, totalPower: finalPower };

    if (typeof aggregated.totalPower !== 'number' || isNaN(aggregated.totalPower)) {
      this.debugError('GET_AGGREGATED_ARMY_STATS', 'Invalid totalPower calculated', {
        totalPower: aggregated.totalPower,
        totalShadows: aggregated.totalShadows,
        shadowCount: allShadowsLength,
      });
      return { aggregated: { ...aggregated, totalPower: 0 }, shouldCache: false };
    }

    const avgPower =
      aggregated.totalShadows > 0 ? Math.floor(aggregated.totalPower / aggregated.totalShadows) : 0;

    this.debugLog('GET_AGGREGATED_ARMY_STATS', 'Army stats aggregated successfully', {
      totalShadows: aggregated.totalShadows,
      totalPower: aggregated.totalPower,
      shadowCount: allShadowsLength,
      avgPower,
      avgLevel: aggregated.avgLevel,
      byRankCounts: Object.keys(aggregated.byRank).map((rank) => ({
        rank, count: aggregated.byRank[rank].count, power: aggregated.byRank[rank].totalPower,
      })),
      totalStatsSum: Object.values(aggregated.totalStats).reduce((sum, val) => sum + (val || 0), 0),
    });

    if (aggregated.totalShadows > 0 && aggregated.totalPower === 0) {
      this.debugError('GET_AGGREGATED_ARMY_STATS', 'WARNING: Shadows exist but totalPower is 0!', {
        totalShadows: aggregated.totalShadows,
        shadowCount: allShadowsLength,
        totalStats: aggregated.totalStats,
        byRank: aggregated.byRank,
        possibleCauses: [
          'Shadows have no baseStats',
          'Effective stats calculation is returning all zeros',
          'Power calculation is failing',
          'Shadows are compressed incorrectly',
        ],
      });
    }

    return { aggregated, shouldCache: true };
  },

  async getAggregatedArmyStats() {
    // cacheKey (getArmyStatsCacheKey) already encodes {timestamp, count, version}
    // and is the real "did the army change" signal — it's the primary validity
    // check below. This TTL is only a safety-net ceiling for clock-drift/edge
    // cases, not a forced re-scan cadence (previously 1.5s, which re-ran the
    // full-store dual scan every 1.5-5s during any UI/XP activity regardless
    // of whether the army had actually changed).
    const cacheTtlMs = 30000;
    const now = Date.now();
    const currentCacheKey = this.getArmyStatsCacheKey();
    if (
      this._armyStatsCache &&
      this._armyStatsCacheTime &&
      this._armyStatsCacheKey === currentCacheKey &&
      now - this._armyStatsCacheTime < cacheTtlMs
    ) {
      return this._armyStatsCache;
    }

    try {
      const totalCount = this.storageManager ? await this.storageManager.getTotalCount() : 0;

      if (!totalCount || totalCount <= 0) {
        this.debugLog('COMBAT', 'No shadows found in storage', {
          hasStorageManager: !!this.storageManager,
          dbInitialized: !!this.storageManager?.db,
          settingsShadowsCount: (this.settings.shadows || []).length,
          storageManagerDbName: this.storageManager?.dbName,
        });

        if (this.storageManager) {
          this.debugLog('COMBAT', 'IndexedDB total count check', {
            totalCount, dbName: this.storageManager?.dbName || 'unknown',
          });
        }

        return this.createEmptyArmyStats();
      }

      const snapshot = this.getShadowSnapshot();
      let aggregatedData;
      if (snapshot && snapshot.length > 0 && snapshot.length === totalCount) {
        this.debugLog('COMBAT', 'Using snapshot cache for aggregation', {
          snapshotSize: snapshot.length, totalCount,
        });
        this.logShadowAggregationSamples(snapshot);
        aggregatedData = this.aggregateShadowsForArmyStats(snapshot);
      } else {
        const streamed = await this.aggregateShadowsForArmyStatsStreamed(200);
        aggregatedData = streamed.aggregatedData;
        this.debugLog('COMBAT', 'Streamed shadow aggregation complete', {
          scanned: streamed.scanned,
          batches: streamed.batches,
          totalCount,
          sampleShadow: streamed.sampleShadow
            ? {
                id: streamed.sampleShadow.id || streamed.sampleShadow.i,
                rank: streamed.sampleShadow.rank,
                hasStrength: !!streamed.sampleShadow.strength,
              }
            : null,
        });
      }

      const { aggregated, shouldCache } = await this.finalizeAggregatedArmyStats({
        aggregatedData, allShadowsLength: totalCount,
      });

      if (
        shouldCache &&
        (this.settings.cachedTotalPowerShadowCount || 0) === aggregated.totalShadows
      ) {
        this._armyStatsCache = aggregated;
        this._armyStatsCacheTime = Date.now();
        this._armyStatsCacheKey = this.getArmyStatsCacheKey();
      }

      return aggregated;
    } catch (error) {
      this.debugError('COMBAT', 'Failed to aggregate army stats', error);

      if (this._armyStatsCache && this._armyStatsCache.totalPower > 0) {
        this.debugLog('COMBAT', 'Returning previous cache due to error', {
          previousTotalPower: this._armyStatsCache.totalPower,
          previousTotalShadows: this._armyStatsCache.totalShadows,
        });
        return this._armyStatsCache;
      }

      return this.createEmptyArmyStats();
    }
  },
};
