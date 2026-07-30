/**
 * ShadowArmy — Shadow growth, leveling, auto rank-up, and natural growth.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./progression'))
 */
const C = require('./constants');

// SHADOW MONARCH PERK (H4): once the player is the Shadow Monarch, shadow stats track the
// player's stats by this per-rank factor. Always < 1 — higher-rank shadows scale closer
// to the Monarch but NEVER reach (let alone exceed) the player's stats.
const SHADOW_SCALE_FACTOR_BY_RANK = {
  E: 0.50, D: 0.55, C: 0.60, B: 0.65, A: 0.70, S: 0.75, SS: 0.80,
  SSS: 0.84, 'SSS+': 0.88, NH: 0.91, 'National Level': 0.91, Monarch: 0.94, 'Monarch+': 0.97,
};

module.exports = {
  // SHADOW GROWTH & LEVELING SYSTEM

  shareShadowXP(xpAmount, source = 'message') {
    const amount = Math.max(0, Math.floor(Number(xpAmount) || 0));
    if (amount <= 0) return { updatedShadows: [] };

    // shareShadowXP never targets specific shadows (no shadowIds param) — every
    // call is an army-wide broadcast. Each grant used to trigger a full
    // 281k-row IDB scan + decompress-all + army-wide XP loop + write-back on
    // every distinct source event (chat message, quest completion, etc).
    // Coalesce ALL sources into one accumulator instead of granting
    // synchronously — flushPendingSharedXp() applies the sum via the normal
    // grantShadowXP/processXpBatch path on a 10-minute timer (index.js) and
    // on stop(). The per-shadow XP application in processXpBatch is
    // source-agnostic (grantShadowXP's `reason` param is never read past the
    // function signature), so merging sources here changes only arrival
    // timing, never total XP awarded or how it's applied.
    this._pendingSharedXp = (this._pendingSharedXp || 0) + amount;
    return { updatedShadows: [] };
  },

  /** BdApi.Data key for the persisted pending-shared-XP counter (user-scoped). */
  _pendingSharedXpDataKey() {
    return this.userId ? `pendingSharedXp_${this.userId}` : 'pendingSharedXp';
  },

  /** Restore the pending shared-XP counter at startup (crash loses at most one flush window). */
  _restorePendingSharedXp() {
    try {
      const stored = BdApi.Data.load('ShadowArmy', this._pendingSharedXpDataKey());
      this._pendingSharedXp = Math.max(0, Math.floor(Number(stored) || 0));
    } catch (error) {
      this.debugError('SHADOW_XP_SHARE', 'Failed to restore pending shared XP', error);
      this._pendingSharedXp = 0;
    }
  },

  /** Persist the pending shared-XP counter. Called only from flush/stop — never per message. */
  _persistPendingSharedXp() {
    try {
      BdApi.Data.save('ShadowArmy', this._pendingSharedXpDataKey(), this._pendingSharedXp || 0);
    } catch (error) {
      this.debugError('SHADOW_XP_SHARE', 'Failed to persist pending shared XP', error);
    }
  },

  /**
   * Apply accumulated army-wide shared XP (all shareShadowXP sources — chat
   * messages, quests, etc — merged into one counter) via the existing
   * grantShadowXP/processXpBatch machinery. Called on a 10-minute timer and
   * synchronously (awaited) before teardown in stop().
   */
  /** BdApi.Data key for the in-flight XP lap (user-scoped). */
  _xpLapDataKey() {
    return this.userId ? `xpLap_${this.userId}` : 'xpLap';
  },

  /** Restore the in-flight XP lap at startup so a restart resumes mid-army. */
  _restoreXpLap() {
    try {
      const stored = BdApi.Data.load('ShadowArmy', this._xpLapDataKey()) || {};
      this._xpLapAmount = Math.max(0, Math.floor(Number(stored.amount) || 0));
      this._xpLapKey = stored.key == null ? null : String(stored.key);
    } catch (error) {
      this.debugError('SHADOW_XP_SHARE', 'Failed to restore XP lap', error);
      this._xpLapAmount = 0;
      this._xpLapKey = null;
    }
  },

  _persistXpLap() {
    try {
      BdApi.Data.save('ShadowArmy', this._xpLapDataKey(), {
        amount: this._xpLapAmount || 0,
        key: this._xpLapKey ?? null,
      });
    } catch (error) {
      this.debugError('SHADOW_XP_SHARE', 'Failed to persist XP lap', error);
    }
  },

  /**
   * Apply accumulated army-wide shared XP one SLICE per flush (lap rotation,
   * 2026-07-30).
   *
   * Previously every flush granted XP to the entire army in one pass. Measured
   * on a 281,345-shadow store: ~562,000 IDB request callbacks and ~29 SECONDS
   * of CPU per flush (AAPerfSentinel attributed 1,890,998 requests to this path
   * alone, 87% of all IDB traffic suite-wide). The work itself is unavoidable
   * per shadow — decompress, add XP, run the level-up loop, recompress — so the
   * only lever is not touching every shadow at once.
   *
   * Lap contract (totals are preserved exactly):
   *   - A lap begins by snapshotting the accumulator into _xpLapAmount and
   *     zeroing the accumulator. New XP earned during the lap accrues to the
   *     NEXT lap; it is never lost and never double-counted.
   *   - Each flush grants _xpLapAmount to one slice and advances the keyset
   *     cursor. Every shadow in the lap receives the identical amount.
   *   - When the cursor drains, the lap closes and the next flush starts a new
   *     one from whatever has since accumulated.
   *
   * Trade-off: a shadow receives its XP up to one lap later than before, so
   * level-ups can lag by that much. Totals, ordering within a shadow, and the
   * merge-on-write guarantees in processXpBatch are unaffected.
   *
   * Same rotation pattern as autoPromoteGrades (_gradePromoteLastKey), which
   * already walks this store a slice at a time.
   */
  async flushPendingSharedXp() {
    // Reuse the existing _batchXpInProgress guard (set/cleared by grantShadowXP's
    // try/finally) instead of introducing a second in-progress flag — a flush and
    // any other concurrent grant are mutually exclusive by construction.
    if (this._batchXpInProgress) return { updatedShadows: [] };
    if (!this.storageManager?.getShadowKeyPage) {
      // No keyset pager (older storage wiring) — fall back to the whole-army
      // grant rather than silently dropping XP.
      const amount = Math.floor(this._pendingSharedXp || 0);
      if (amount <= 0) return { updatedShadows: [] };
      this._pendingSharedXp = 0;
      try {
        const result = await this.grantShadowXP(amount, 'shared', null);
        this._persistPendingSharedXp();
        return result;
      } catch (error) {
        this._pendingSharedXp += amount;
        this._persistPendingSharedXp();
        this.debugError('SHADOW_XP_SHARE', 'Failed to flush pending shared XP', error);
        return { updatedShadows: [] };
      }
    }

    // Resume an in-flight lap, or open a new one from the accumulator.
    let lapAmount = Math.floor(this._xpLapAmount || 0);
    if (lapAmount <= 0) {
      lapAmount = Math.floor(this._pendingSharedXp || 0);
      if (lapAmount <= 0) return { updatedShadows: [] };
      this._pendingSharedXp = 0;
      this._xpLapAmount = lapAmount;
      this._xpLapKey = null;
      this._persistPendingSharedXp();
      this._persistXpLap();
    }

    const sliceSize = Math.max(
      1000,
      Math.floor(Number(this.settings?.xpLapSliceSize) || C.XP_LAP_SLICE_SIZE || 30000)
    );

    let page;
    try {
      page = await this.storageManager.getShadowKeyPage(this._xpLapKey ?? null, sliceSize);
    } catch (error) {
      this.debugError('SHADOW_XP_SHARE', 'Failed to page shadow ids for XP lap', error);
      return { updatedShadows: [] }; // lap state untouched — retried next flush
    }

    const ids = (page?.ids || []).map((id) => String(id)).filter(Boolean);

    if (ids.length === 0) {
      // Empty slice: the store drained (or is empty). Close the lap so the
      // accumulated XP is not stranded behind a cursor that never advances.
      this._xpLapAmount = 0;
      this._xpLapKey = null;
      this._persistXpLap();
      return { updatedShadows: [] };
    }

    try {
      // 'shared' reflects the merged sources — grantShadowXP's `reason` param
      // has no functional effect (never read beyond the function signature),
      // so this label is for debug-log clarity only.
      const result = await this.grantShadowXP(lapAmount, 'shared', ids);

      if (page.exhausted) {
        this._xpLapAmount = 0;
        this._xpLapKey = null;
      } else {
        this._xpLapKey = page.lastKey;
      }
      this._persistXpLap();

      this.debugLog(
        'SHADOW_XP_SHARE',
        `XP lap slice: ${ids.length} shadows @ ${lapAmount} xp${page.exhausted ? ' (lap complete)' : ''}`
      );
      return result;
    } catch (error) {
      // Cursor deliberately NOT advanced — the same slice retries next flush.
      // Re-granting a slice is safer than skipping one: XP is additive and a
      // duplicate grant is visible/correctable, whereas a skipped slice is a
      // silent permanent shortfall for those shadows.
      this.debugError('SHADOW_XP_SHARE', 'Failed to flush XP lap slice', error);
      return { updatedShadows: [] };
    }
  },

  async grantShadowXP(baseAmount, reason = 'message', shadowIds = null, options = {}) {
    const perShadowAmounts =
      options && typeof options === 'object' && options.perShadowAmounts && typeof options.perShadowAmounts === 'object'
        ? options.perShadowAmounts
        : null;
    const skipPowerRecalc = Boolean(options?.skipPowerRecalc);
    const targetFetchChunkSize = Math.max(25, Math.floor(Number(options?.fetchChunkSize) || 300));

    if (baseAmount <= 0 && !perShadowAmounts) return { updatedShadows: [] };

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

    // Merge-on-write: processXpBatch takes IDS (not pre-fetched shadow
    // objects) and applies grantShadowXP/level-up/rank-up against the FRESH
    // record read inside storageManager.transformShadowsBatch's own
    // transaction. This closes the "army-wide shared flush reads one
    // getAllShadows() snapshot, then batch-puts stale full records" lost
    // update — self-heal, compression tiering, and autoPromoteGrades can
    // now land between this grant's decision and its write without either
    // side reverting the other's fields (see storage.js:transformShadowsBatch
    // field-ownership table).
    const processXpBatch = async (ids) => {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      if (!this.storageManager?.transformShadowsBatch) {
        this.debugError('STORAGE', 'grantShadowXP: transformShadowsBatch unavailable — skipping batch', null);
        return 0;
      }

      const chunkUpdated = [];
      const { completed, failedIds } = await this.storageManager.transformShadowsBatch(
        ids,
        (freshRecord) => {
          const shadow = this.getShadowData(freshRecord);
          if (!shadow) return null;

          const shadowId = shadow.id || shadow.i;
          const xpOverride = perShadowAmounts && shadowId != null
            ? Number(perShadowAmounts[String(shadowId)]) || 0
            : null;
          const xpGrant = xpOverride != null ? xpOverride : perShadow;
          if (!(xpGrant > 0)) return null;

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
          const toSave = this.prepareShadowForSave(shadow);
          if (toSave) chunkUpdated.push(toSave);
          return toSave;
        },
        { chunkSize: ids.length }
      );

      if (failedIds.length > 0) {
        this.debugError('STORAGE', `Failed to batch-save shadow XP updates to IndexedDB (${failedIds.length} ids)`, { failedIds });
        const failedSet = new Set(failedIds.map((id) => String(id)));
        for (const s of chunkUpdated) {
          const sid = String(s.id || s.i || '');
          if (!failedSet.has(sid)) allUpdatedShadows.push(s);
        }
      } else {
        for (const s of chunkUpdated) allUpdatedShadows.push(s);
      }

      if (completed > 0) hasPersistedUpdates = true;
      return completed;
    };

    this._batchXpInProgress = true;
    try {
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
          await processXpBatch(idChunk);

          if (i + targetFetchChunkSize < uniqueTargetIds.length) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      } else {
        // Army-wide grant (no target ids) or getShadowsByIds unavailable —
        // enumerate ids via the bounded batch cursor (getAllShadowsRaw, no
        // decompression needed just to read ids) instead of getAllShadows()
        // (which decompresses every record AND refreshes the cross-plugin
        // snapshot cache with data that _invalidateSnapshot() below discards
        // moments later — both wasted work for an id-only enumeration).
        let allIds = [];
        try {
          const allShadowsRaw = await this.storageManager?.getAllShadowsRaw();
          allIds = (allShadowsRaw || []).map((s) => this.storageManager?.getCacheKey(s)).filter(Boolean);
        } catch (error) {
          this.debugError('STORAGE', 'Failed to enumerate shadow ids for XP grant', error);
          return { updatedShadows: [] };
        }

        if (targetShadowIds && targetShadowIds.length > 0) {
          if (!this._getShadowsByIdsFallbackWarned) {
            this._getShadowsByIdsFallbackWarned = true;
            this.debugError('XP_PERF', 'grantShadowXP: getShadowsByIds unavailable, falling back to full IDB scan — check storageManager wiring', null);
          }
          const targetIds = new Set(targetShadowIds.map((id) => String(id)));
          allIds = allIds.filter((id) => targetIds.has(String(id)));
        }

        if (!allIds.length) return { updatedShadows: [] };

        for (let i = 0; i < allIds.length; i += targetFetchChunkSize) {
          const idChunk = allIds.slice(i, i + targetFetchChunkSize);
          await processXpBatch(idChunk);

          if (i + targetFetchChunkSize < allIds.length) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      }
    } finally {
      this._batchXpInProgress = false;
    }

    if (!hasPersistedUpdates) return { updatedShadows: [] };
    this._invalidateSnapshot();

    this.settings.cachedTotalPowerShadowCount = 0;
    this.clearShadowPowerCache();
    // XP/level changes mutate shadow.strength — bump the write-gen counter
    // the hourly compression gate uses (see army-stats.js:_applyTotalPowerDelta
    // for why this is NOT bumped from the getTotalShadowPower recalc below).
    this._armyWriteGen = (this._armyWriteGen || 0) + 1;

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

    // PERF: skip the re-decompress when caller already passed a decompressed
    // shadow (the streaming aggregation in army-stats.js does this for every
    // shadow). getShadowData returns the input unchanged when shadow._c is
    // not 1 or 2 (compression.js:639-648), so checking the marker here lets
    // us bypass one function call + decompressor lookup per call. For a
    // 1000-shadow aggregation this removes 1000 redundant calls.
    if (shadow._c === 1 || shadow._c === 2) {
      shadow = this.getShadowData(shadow);
    }
    if (!shadow) return this.createZeroStatBlock?.() || { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };
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

    // Apply grade multiplier — higher manhwa grade = proportionally stronger.
    // Common=1.0×, Elite=1.15×, Knight=1.35×, General=2.0×, Marshal=2.5×, Grand Marshal=3.5×
    const grade = shadow.grade || 'Common';
    const gradeMultipliers = this.settings?.shadowEssence?.gradeStatMultiplier
      || this.defaultSettings?.shadowEssence?.gradeStatMultiplier;
    const gradeMult = gradeMultipliers?.[grade] || 1.0;
    if (gradeMult !== 1.0) {
      statKeys.forEach((stat) => {
        effective[stat] = Math.floor(effective[stat] * gradeMult);
      });
    }

    // SHADOW MONARCH PERK (H4 — shadows scale with the Monarch, never reaching them):
    // once you are the Shadow Monarch, a shadow's stats are NO LONGER fixed — they track
    // YOUR base stats by a per-rank factor that is always < 1 (higher-rank shadows scale
    // closer to you, but never to 100%). This REPLACES the base/growth/grade computation
    // above and supersedes the old flat Monarch's Aura. getSoloLevelingData is cached, so
    // the per-shadow read is cheap even across a 10k+ army aggregation.
    const soloData = this.getSoloLevelingData?.();
    if (soloData?.rank === 'Shadow Monarch') {
      const playerStats = soloData.stats || {};
      const factor = SHADOW_SCALE_FACTOR_BY_RANK[shadow.rank] ?? 0.50;
      statKeys.forEach((stat) => {
        effective[stat] = Math.floor((Number(playerStats[stat]) || 0) * factor);
      });
    }

    // MONARCH'S NAMING: a named general carries the Monarch's favor — +5% all
    // stats. MUST run after the SM replacement above (naming is SM-gated, so
    // applying it before would be overwritten at exactly the rank that names).
    if (shadow.customName) {
      statKeys.forEach((stat) => {
        effective[stat] = Math.floor(effective[stat] * 1.05);
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

  // AUTO RANK-UP SYSTEM

  attemptAutoRankUp(shadow) {
    if (!shadow || !shadow.rank) return { success: false };

    const currentRank = shadow.rank;
    const currentRankIndex = this.shadowRanks.indexOf(currentRank);
    const nextRank = this.shadowRanks[currentRankIndex + 1];

    if (!nextRank) return { success: false };
    if (nextRank === 'Shadow Monarch') return { success: false };

    // GATE 1: Level requirement
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

    // GATE 2: Stat requirement
    const effectiveStats = this.getShadowEffectiveStats(shadow);
    const nextRankMultiplier = this.rankStatMultipliers[nextRank] || 1.0;
    const baselineForNextRank = this.getRankBaselineStats(nextRank, nextRankMultiplier);

    const statKeys = C.STAT_KEYS;
    const totalBaseline = statKeys.reduce((sum, stat) => sum + (baselineForNextRank[stat] || 0), 0);
    const totalEffective = statKeys.reduce((sum, stat) => sum + (effectiveStats[stat] || 0), 0);

    const roleThresholdFactor = this.getRoleRankUpThresholdFactor(shadow.role);
    const requiredTotal = totalBaseline * 0.8 * roleThresholdFactor;

    if (totalEffective < requiredTotal) {
      return { success: false, reason: 'stats_gate' };
    }

    // NOTE: Essence is NOT used for rank promotion (E→D→C etc.).
    // Essence is spent on GRADE promotion (Common→Elite→Knight etc.) — see autoPromoteGrades().
    // Rank promotion uses only level + stats gates.

    const oldLevel = Math.max(1, Math.floor(Number(shadow.level) || 1));
    const oldXp = Math.max(0, Number(shadow.xp) || 0);
    // Capture pre-promotion power so the cached army total can be adjusted by
    // the DELTA instead of recomputed from the whole store (see below).
    const prevPower = this._getShadowPowerValue?.(shadow) ?? (Number(shadow.strength) || 0);
    shadow.rank = nextRank;

    this._applyRankPromotionProgressCarry(shadow, currentRank, nextRank);

    const newEffectiveStats = this.getShadowEffectiveStats(shadow);
    shadow.strength = this.calculateShadowStrength(newEffectiveStats, 1);

    this.invalidateShadowPowerCache(shadow);
    this.clearShadowPowerCache();
    // Rank-up mutates shadow.strength — bump the write-gen counter the
    // hourly compression gate uses (see army-stats.js:_applyTotalPowerDelta).
    this._armyWriteGen = (this._armyWriteGen || 0) + 1;

    if (!this._batchXpInProgress) {
      // INCREMENTAL (2026-07-30, burst capture): this used to call
      // getTotalShadowPower(true) — a FORCED full-store walk of the entire
      // army — on EVERY rank-up. The profiler's burst capture caught 540
      // paged walks in one 4-minute window (~135/min) during combat, all
      // from this line. The army total only moves by this one shadow's power
      // change, and the incremental path already exists and is race-safe
      // (serialized promise chain). O(1) instead of O(281k).
      // NOTE: cachedTotalPowerShadowCount is deliberately NOT zeroed here
      // anymore — zeroing it made the next getTotalShadowPower(false) see a
      // count mismatch and walk the store anyway, defeating the delta.
      const newPower = this._getShadowPowerValue?.(shadow) ?? (Number(shadow.strength) || 0);
      const powerDelta = newPower - prevPower;
      if (powerDelta !== 0 && typeof this._applyTotalPowerDelta === 'function') {
        this._applyTotalPowerDelta({ strength: Math.abs(powerDelta) }, powerDelta > 0 ? 'increment' : 'decrement')
          .catch?.((error) => {
            this.debugError('POWER_CALC', 'Failed to apply rank-up power delta', error);
          });
      }
    }

    return {
      success: true, oldRank: currentRank, newRank: nextRank,
      oldLevel, newLevel: shadow.level || oldLevel,
      oldXp, newXp: shadow.xp || 0,
    };
  },

  // NATURAL GROWTH SYSTEM

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
      const roundedGrowth = Math.max(0, Math.round(growth));
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
