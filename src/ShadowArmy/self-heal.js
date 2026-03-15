/**
 * ShadowArmy — Self-Heal System
 *
 * Two-phase approach:
 *   Phase 1 (v6 migration): Full scan of ALL shadows in IDB — runs once.
 *   Phase 2 (every start):  Lightweight scan that catches any shadow still
 *                           missing beastType/beastFamily or with stale stats.
 *                           Skips shadows already healed (checks _healV field).
 *
 * Repairs:
 *   1. Adds beastType/beastFamily derived from role
 *   2. Recalculates baseStats with corrected species stat weights
 *   3. Recalculates strength (power) from corrected effective stats
 *   4. Backfills missing required fields
 *   5. Handles compressed shadows (_c:1 and _c:2)
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./self-heal'))
 */
const C = require('./constants');

// Current heal version — bump this when stat weights change again
// to force a re-heal of all shadows on next start
const HEAL_VERSION = 1;

module.exports = {
  /**
   * Phase 1: Full migration (runs once via runDataMigrations v6).
   * Scans and heals every shadow in IDB.
   */
  async selfHealShadowStats() {
    const migrationKey = 'shadowArmy_selfHeal_v6';
    if (BdApi.Data.load('ShadowArmy', migrationKey)) return;

    this.debugLog('SELF-HEAL', 'Phase 1: Full IDB scan starting...');
    const result = await this._healShadowBatch(null); // null = scan all
    BdApi.Data.save('ShadowArmy', migrationKey, { completedAt: new Date().toISOString() });
    this.debugLog('SELF-HEAL', `Phase 1 complete: ${result.healed} healed, ${result.skipped} skipped out of ${result.total}`);
  },

  /**
   * Phase 2: Continuous integrity check (runs every plugin start).
   * Only touches shadows missing _healV or with _healV < HEAL_VERSION.
   */
  async selfHealOnStart() {
    if (!this.storageManager) return;

    this.debugLog('SELF-HEAL', `Phase 2: Integrity check (heal version ${HEAL_VERSION})...`);
    const result = await this._healShadowBatch(HEAL_VERSION);

    if (result.healed > 0) {
      this.debugLog('SELF-HEAL', `Phase 2 complete: healed ${result.healed} shadows`);
    } else {
      this.debugLog('SELF-HEAL', 'Phase 2: All shadows healthy');
    }
  },

  /**
   * Core heal logic shared by Phase 1 and Phase 2.
   * @param {number|null} healVersion - If set, skip shadows where _healV >= this value.
   *                                    If null, heal everything (Phase 1).
   */
  async _healShadowBatch(healVersion) {
    const allShadows = await this._loadShadowsForMigration();
    const result = { total: allShadows.length, healed: 0, skipped: 0 };

    if (allShadows.length === 0) return result;

    const batchSize = 50;
    const saveBatch = [];

    for (let i = 0; i < allShadows.length; i += batchSize) {
      if (this._isStopped) {
        this.debugLog('SELF-HEAL', 'Aborted (plugin stopped)');
        return result;
      }

      const batch = allShadows.slice(i, i + batchSize);

      for (const shadow of batch) {
        if (this._isStopped) return result;

        try {
          // Phase 2 fast-path: skip already-healed shadows
          if (healVersion !== null) {
            // Uncompressed: _healV; compressed (_c:1/_c:2): hv
            const rawHealV = shadow._healV ?? shadow.hv ?? null;
            if (rawHealV != null && rawHealV >= healVersion) {
              result.skipped++;
              continue;
            }
          }

          // Decompress if needed
          let working;
          if (shadow._c === 2) {
            working = this.decompressShadowUltra(shadow);
          } else if (shadow._c === 1) {
            working = this.decompressShadow(shadow);
          } else {
            working = shadow;
          }

          if (!working || !working.id) {
            result.skipped++;
            continue;
          }

          // Phase 2 fast-path for decompressed shadows
          if (healVersion !== null && working._healV >= healVersion) {
            result.skipped++;
            continue;
          }

          let dirty = false;
          const roleKey = working.role || 'knight';
          const role = this.shadowRoles[roleKey];

          // --- FIX 1: Add beastType/beastFamily if missing ---
          if (!working.beastType && role?.isMagicBeast) {
            working.beastType = roleKey;
            working.beastFamily = role.family || null;
            dirty = true;
          }
          if (working.beastType === undefined) {
            working.beastType = null;
            dirty = true;
          }
          if (working.beastFamily === undefined) {
            working.beastFamily = null;
            dirty = true;
          }

          // --- FIX 2: Recalculate baseStats with corrected species weights ---
          const shadowRank = working.rank || 'E';
          const rankMultiplier = this.rankStatMultipliers?.[shadowRank] || 1.0;
          const roleWeights = this.shadowRoleStatWeights?.[roleKey] || this.shadowRoleStatWeights?.knight;
          const rankBaseline = this.getRankBaselineStats?.(shadowRank, rankMultiplier);

          if (rankBaseline && roleWeights && working.baseStats) {
            const statKeys = C.STAT_KEYS;
            const seed = working.growthVarianceSeed || 0.5;
            const newBaseStats = {};

            for (let s = 0; s < statKeys.length; s++) {
              const stat = statKeys[s];
              const roleWeight = roleWeights[stat] || 1.0;
              // Deterministic per-stat variance from seed (0.9-1.1 range)
              const statVariance = 0.9 + ((seed * 7 + s * 13) % 100) / 500;
              newBaseStats[stat] = Math.max(1, Math.round(rankBaseline[stat] * roleWeight * statVariance));
            }

            working.baseStats = newBaseStats;
            dirty = true;
          }

          // --- FIX 3: Recalculate strength from effective stats ---
          if (dirty && working.baseStats) {
            if (!working.growthStats) {
              working.growthStats = C.STAT_KEYS.reduce((o, k) => { o[k] = 0; return o; }, {});
            }
            if (!working.naturalGrowthStats) {
              working.naturalGrowthStats = C.STAT_KEYS.reduce((o, k) => { o[k] = 0; return o; }, {});
            }

            const effectiveStats = this.getShadowEffectiveStats?.(working);
            if (effectiveStats) {
              working.strength = this.calculateShadowStrength?.(effectiveStats, 1) || working.strength || 0;
            }
          }

          // --- FIX 4: Ensure required fields ---
          if (!working.level || working.level < 1) { working.level = 1; dirty = true; }
          if (working.xp === undefined || working.xp === null) { working.xp = 0; dirty = true; }
          if (!working.totalCombatTime && working.totalCombatTime !== 0) { working.totalCombatTime = 0; dirty = true; }
          if (!working.lastNaturalGrowth) { working.lastNaturalGrowth = working.extractedAt || Date.now(); dirty = true; }
          if (!working.growthVarianceSeed) { working.growthVarianceSeed = Math.random(); dirty = true; }
          if (!working.roleName && role) { working.roleName = role.name; dirty = true; }

          // Stamp heal version so Phase 2 skips this shadow next time
          working._healV = HEAL_VERSION;

          if (dirty) {
            const toSave = this.prepareShadowForSave(working);
            if (toSave) {
              saveBatch.push(toSave);
              result.healed++;
            }
          } else {
            // Nothing broken — just stamp _healV to skip next time (lightweight save)
            saveBatch.push(shadow._c
              ? { ...shadow, hv: HEAL_VERSION }
              : this.prepareShadowForSave(working));
            result.skipped++;
          }
        } catch (error) {
          this.debugError('SELF-HEAL', `Error healing shadow ${shadow.id || shadow.i}`, error);
          result.skipped++;
        }
      }

      // Flush batch to IDB periodically
      if (saveBatch.length >= batchSize) {
        await this._flushHealBatch(saveBatch);
        saveBatch.length = 0;
        // Yield to event loop between batches — prevents IDB write storms from
        // starving concurrent reads (e.g., Dungeons deployment shadow lookups)
        await new Promise((r) => setTimeout(r, 50));
      }

      // Progress log for large armies
      if (allShadows.length > 200 && (i + batchSize) % 500 < batchSize) {
        this.debugLog('SELF-HEAL', `Progress: ${Math.min(i + batchSize, allShadows.length)}/${allShadows.length} scanned, ${result.healed} healed`);
      }
    }

    // Flush remaining
    if (saveBatch.length > 0) {
      await this._flushHealBatch(saveBatch);
    }

    // Invalidate caches if anything changed
    if (result.healed > 0) {
      this.cachedBuffs = null;
      this.cachedBuffsTime = null;
      this._totalPowerCache = null;
      this._totalPowerCacheTime = null;
      if (this._shadowPowerCache) this._shadowPowerCache.clear();
    }

    return result;
  },

  async _flushHealBatch(batch) {
    if (!batch || batch.length === 0) return;
    try {
      await this.storageManager.saveShadowsBatch(batch);
    } catch (error) {
      this.debugError('SELF-HEAL', `Batch save failed (${batch.length} shadows), falling back to individual saves`);
      for (const s of batch) {
        try { await this.storageManager.saveShadow(s); } catch (_) { /* skip */ }
      }
    }
  },
};
