/**
 * ShadowArmy — Self-Heal System
 *
 * Two-phase approach:
 *   Phase 1 (v6 migration): Full scan of ALL shadows in IDB — runs once.
 *   Phase 2 (every start):  Lightweight scan that catches any shadow still
 *                           missing beastType/beastFamily or with stale stats.
 *                           Skips shadows already healed (checks _healV field).
 *                           Skips the ENTIRE traversal once a completed pass
 *                           has been recorded (BdApi.Data 'selfHealCleanV' >=
 *                           HEAL_VERSION) — safe only because extraction.js
 *                           and combat-stats.js stamp _healV on every newly
 *                           created shadow, so nothing created after that
 *                           pass can be un-healed.
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

// Current heal version — single source of truth in constants.js so
// extraction.js/combat-stats.js (creation-time stamping) and self-heal.js
// (Phase 2 skip check) can never drift apart. Bump C.HEAL_VERSION when
// stat weights change again to force a re-heal of all shadows on next start.
const HEAL_VERSION = C.HEAL_VERSION;

// BdApi.Data key for the Phase 2 completion flag. When this is >= HEAL_VERSION,
// every shadow in IDB is either: (a) present during the completed pass this
// flag records (validated then), or (b) created after extraction/combat-stats
// began stamping _healV at creation (clean by construction, never touched by
// Phase 2 healing) — so a full Phase 2 traversal is provably unnecessary.
// Bumping HEAL_VERSION invalidates this flag naturally (stale value < new
// version), re-enabling exactly one more full pass.
const SELF_HEAL_CLEAN_KEY = 'selfHealCleanV';

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

    // Skip the full 281k-row traversal entirely once a prior Phase 2 pass has
    // PROVABLY completed at this heal version: every shadow present then was
    // validated, and every shadow created since is stamped _healV at creation
    // (extraction.js/combat-stats.js) — so nothing in IDB can be un-healed.
    const cleanVersion = BdApi.Data.load('ShadowArmy', SELF_HEAL_CLEAN_KEY) || 0;
    if (cleanVersion >= HEAL_VERSION) {
      this.debugLog('SELF-HEAL', `Phase 2: skipped (army already clean at v${cleanVersion})`);
      return;
    }

    this.debugLog('SELF-HEAL', `Phase 2: Integrity check (heal version ${HEAL_VERSION})...`);
    const result = await this._healShadowBatch(HEAL_VERSION);

    if (result.aborted) {
      // Do NOT persist the clean flag — an aborted pass never verified every
      // shadow, so the next start must retry the full traversal.
      this.debugLog('SELF-HEAL', `Phase 2 aborted before completion (${result.healed} healed so far)`);
      return;
    }

    BdApi.Data.save('ShadowArmy', SELF_HEAL_CLEAN_KEY, HEAL_VERSION);

    if (result.healed > 0) {
      this.debugLog('SELF-HEAL', `Phase 2 complete: healed ${result.healed} shadows`);
    } else {
      this.debugLog('SELF-HEAL', 'Phase 2: All shadows healthy');
    }
  },

  /**
   * Pure per-record heal computation. Shared by the snapshot scan below
   * (which decides WHICH ids are candidates for healing — a cheap
   * version-check hint) and the merge-on-write transform passed to
   * storageManager.transformShadowsBatch() (which re-runs this against the
   * FRESH record at write time). Re-deriving from the fresh record — not
   * the stale snapshot `shadow` — means a concurrent XP grant, rank-up, or
   * grade promotion landing mid-pass is preserved: self-heal never touches
   * rank/grade, only initializes level/xp/growthStats/naturalGrowthStats
   * when MISSING (never overwrites an existing value), and recalculates
   * strength from whatever baseStats/growthStats are on the fresh record
   * (so a concurrent level-up's growth contribution is included, not lost).
   * @param {object} rawShadow - possibly-compressed record as stored in IDB.
   * @param {number|null} healVersion - skip if _healV/hv >= this. null = heal everything (Phase 1).
   * @returns {{record: object|null, healed: boolean, skip: boolean}|null}
   *   null = shadow missing/malformed, do not write.
   *   {skip: true} = already healed at this version, do not write.
   *   {record, healed: true} = dirty, healed, write this record.
   *   {record, healed: false} = not dirty, only the heal-version stamp changed.
   */
  _computeHealedShadow(rawShadow, healVersion) {
    if (!rawShadow) return null;

    try {
      if (healVersion !== null) {
        // Uncompressed: _healV; compressed (_c:1/_c:2): hv
        const rawHealV = rawShadow._healV ?? rawShadow.hv ?? null;
        if (rawHealV != null && rawHealV >= healVersion) {
          return { record: null, healed: false, skip: true };
        }
      }

      // Decompress if needed
      let working;
      if (rawShadow._c === 2) {
        working = this.decompressShadowUltra(rawShadow);
      } else if (rawShadow._c === 1) {
        working = this.decompressShadow(rawShadow);
      } else {
        working = rawShadow;
      }

      if (!working || !working.id) return null;

      // Fast-path for decompressed shadows
      if (healVersion !== null && working._healV >= healVersion) {
        return { record: null, healed: false, skip: true };
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
          if (typeof this.calculateShadowStrength === 'function') {
            working.strength = this.calculateShadowStrength(effectiveStats, 1);
          } else {
            this.debugError?.('SELF-HEAL', 'calculateShadowStrength missing — strength not recalculated');
          }
        }
      }

      // --- FIX 4: Ensure required fields (init-if-missing only — never
      // overwrites an existing value, so a concurrent XP grant's level/xp
      // is preserved when this runs against the fresh record) ---
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
        return toSave ? { record: toSave, healed: true, skip: false } : null;
      }

      // Nothing broken — just stamp _healV to skip next time. Carries the
      // FRESH rawShadow's compressed fields forward (not the possibly-stale
      // snapshot), so a compression-tier change that landed between scan and
      // write isn't reverted by this lightweight stamp-only save.
      const stamped = rawShadow._c
        ? { ...rawShadow, hv: HEAL_VERSION }
        : this.prepareShadowForSave(working);
      return { record: stamped, healed: false, skip: false };
    } catch (error) {
      this.debugError('SELF-HEAL', `Error healing shadow ${rawShadow.id || rawShadow.i}`, error);
      return null;
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
    let idBatch = [];

    // Merge-on-write flush: transformShadowsBatch re-reads each id FRESH
    // inside its own transaction and re-runs _computeHealedShadow against
    // that fresh record — see the primitive's doc comment in storage.js for
    // why this closes the self-heal-vs-{compression,XP-grant,rank-up,grade
    // promotion} lost-update races.
    const flushIdBatch = async () => {
      if (idBatch.length === 0) return;
      const ids = idBatch;
      idBatch = [];
      const { failedIds } = await this.storageManager.transformShadowsBatch(
        ids,
        (freshRecord) => {
          const outcome = this._computeHealedShadow(freshRecord, healVersion);
          if (!outcome || outcome.skip) { result.skipped++; return null; }
          if (outcome.healed) result.healed++; else result.skipped++;
          return outcome.record;
        },
        { chunkSize: batchSize }
      );
      if (failedIds.length > 0) {
        this.debugError('SELF-HEAL', `transformShadowsBatch: ${failedIds.length} record(s) failed to heal`, { failedIds });
      }
    };

    for (let i = 0; i < allShadows.length; i += batchSize) {
      if (this._isStopped || this._selfHealAborted) {
        this.debugLog('SELF-HEAL', `Aborted (${this._isStopped ? 'plugin stopped' : 'deployment requested IDB'})`);
        await flushIdBatch();
        result.aborted = true;
        return result;
      }

      const batch = allShadows.slice(i, i + batchSize);

      for (const shadow of batch) {
        if (this._isStopped || this._selfHealAborted) {
          await flushIdBatch();
          result.aborted = true;
          return result;
        }

        const id = shadow?.id || shadow?.i;
        if (!id) {
          result.skipped++;
          continue;
        }

        // Cheap scan-time pre-filter (mirrors _computeHealedShadow's own
        // version check): avoids queuing an id for a fresh re-read+write
        // when the snapshot already shows it healed. This is a HINT only —
        // the authoritative dirty/heal decision happens against the FRESH
        // record inside _computeHealedShadow above, so this pre-filter can
        // only ever cause an extra (harmless) re-check, never a missed heal.
        if (healVersion !== null) {
          const rawHealV = shadow._healV ?? shadow.hv ?? null;
          if (rawHealV != null && rawHealV >= healVersion) {
            result.skipped++;
            continue;
          }
        }

        idBatch.push(id);
      }

      // Flush batch to IDB periodically
      if (idBatch.length >= batchSize) {
        await flushIdBatch();
        // Yield to event loop between batches — prevents IDB write storms from
        // starving concurrent reads (e.g., Dungeons deployment shadow lookups)
        await new Promise((r) => setTimeout(r, 50));
        // Re-check abort after yield — deployment may have signaled during flush
        if (this._selfHealAborted) {
          this.debugLog('SELF-HEAL', 'Aborted after flush (deployment requested IDB)');
          result.aborted = true;
          return result;
        }
      }

      // Progress log for large armies
      if (allShadows.length > 200 && (i + batchSize) % 500 < batchSize) {
        this.debugLog('SELF-HEAL', `Progress: ${Math.min(i + batchSize, allShadows.length)}/${allShadows.length} scanned, ${result.healed} healed`);
      }
    }

    // Flush remaining
    await flushIdBatch();

    // Invalidate caches if anything changed
    if (result.healed > 0) {
      this.cachedBuffs = null;
      this.cachedBuffsTime = null;
      this._totalPowerCache = null;
      this._totalPowerCacheTime = null;
      if (this._shadowPowerCache) this._shadowPowerCache.clear();
      // Heal writes change shadow.strength (recalculated from corrected
      // stats) — bump the army write-generation counter so the hourly
      // compression tiering gate (compression.js:processShadowCompression)
      // doesn't skip a pass that heal just made tiering-relevant.
      this._armyWriteGen = (this._armyWriteGen || 0) + 1;
    }

    return result;
  },

  /**
   * Abort any running self-heal scan. Called by Dungeons before IDB-heavy
   * deployment reads so self-heal writes don't starve the read queue.
   * Self-heal can be rescheduled later via resumeSelfHeal().
   */
  abortSelfHeal() {
    this._selfHealAborted = true;
    this.debugLog?.('SELF-HEAL', 'Abort signal set (deployment priority)');
  },

  /**
   * Reschedule self-heal after deployment finishes.
   * Defers 30s so deployment + early combat don't compete with IDB writes.
   */
  resumeSelfHeal(delayMs = 30000) {
    this._selfHealAborted = false;
    if (this._selfHealResumeTimer) clearTimeout(this._selfHealResumeTimer);
    this._selfHealResumeTimer = setTimeout(() => {
      if (this._isStopped || this._selfHealAborted) return;
      this.selfHealOnStart().catch((error) => {
        this.debugError?.('SELF-HEAL', 'Resumed self-heal failed', error);
      });
    }, delayMs);
  },
};
