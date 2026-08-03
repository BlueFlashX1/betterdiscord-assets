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

  /**
   * Army-wide XP broadcast — NO-OP since 2026-07-30, kept as a stable entry
   * point for its external callers (SoloLevelingStats chat/quest XP).
   *
   * This never targeted specific shadows: every call meant "give XP to all
   * 281,345 of them". Even fully coalesced into a 10-minute accumulator, each
   * flush had to decompress, mutate and recompress the entire store — ~562,000
   * IDB callbacks and ~29 SECONDS of CPU per flush, 87% of all IDB traffic in
   * the suite (AAPerfSentinel, 2026-07-30).
   *
   * Army-wide growth is now DERIVED instead of written: see
   * _getVeterancyMultiplier, which scales every shadow's stats by time since
   * extraction at read time, for zero writes. Veterans stay ahead, newer
   * shadows accrue at the same rate, nobody's progress was erased.
   *
   * TARGETED XP still works and is unaffected — grantShadowXP(amount, reason,
   * ids) is bounded by the id list, so Dungeons combat XP and extraction XP
   * continue to level the specific shadows that earned it. Only the
   * everybody-gets-some broadcast is gone.
   */
  shareShadowXP(_xpAmount, _source = 'message') {
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
   * NO-OP since 2026-07-30 (kept: called by a timer in index.js and by stop()).
   *
   * Formerly applied the accumulated army-wide XP by walking all 281k shadows.
   * That work is replaced by derived veterancy (_getVeterancyMultiplier), which
   * needs no flush, no accumulator, and no writes. The lap-rotation scheme that
   * briefly split this walk into slices is gone with it — there is nothing left
   * to slice.
   */
  async flushPendingSharedXp() {
    return { updatedShadows: [] };
  },

  // ── PENDING NATURAL GROWTH (banked dungeon combat hours, drained in background) ──
  //
  // Dungeons banks participation-weighted combat hours per shadow id at
  // completion (bankPendingGrowth) instead of fetching every contributor
  // record at that moment — a 200k-shadow deploy made that fetch ~51k chunked
  // IDB gets per completion, 95% of ShadowArmy's IDB traffic (sentinel
  // 2026-07-31). The drain interval (index.js) applies banked hours in small
  // merge-on-write batches: transformShadowsBatch reads the FRESH record
  // inside its own transaction, so autoPromote/self-heal writes land safely
  // in between. Hours for the same shadow merge additively — one
  // applyNaturalGrowth(h1+h2) equals two smaller applications up to
  // per-application rounding, so banking is the same growth, later.

  /** BdApi.Data key for the persisted pending-growth map (user-scoped). */
  _pendingGrowthDataKey() {
    return this.userId ? `pendingGrowthHours_${this.userId}` : 'pendingGrowthHours';
  },

  /** Restore banked growth hours at startup (persisted once, on stop()). */
  _restorePendingGrowth() {
    this._pendingGrowthHours = {};
    try {
      const stored = BdApi.Data.load('ShadowArmy', this._pendingGrowthDataKey());
      if (stored && typeof stored === 'object') {
        for (const [sid, hours] of Object.entries(stored)) {
          const h = Number(hours);
          if (h > 0 && sid) this._pendingGrowthHours[sid] = h;
        }
      }
    } catch (error) {
      this.debugError('GROWTH', 'Failed to restore pending growth hours', error);
    }
  },

  /**
   * Persist banked hours. Called from stop() only — the map can hold one
   * entry per deployed shadow (hundreds of thousands), so per-completion
   * persistence would reintroduce a multi-MB serialize on the very path this
   * accumulator exists to unburden. A hard crash loses only in-flight banked
   * hours (bounded, passive system) — same tradeoff as pendingSharedXp.
   */
  _persistPendingGrowth() {
    try {
      BdApi.Data.save('ShadowArmy', this._pendingGrowthDataKey(), this._pendingGrowthHours || {});
    } catch (error) {
      this.debugError('GROWTH', 'Failed to persist pending growth hours', error);
    }
  },

  /** Bank combat hours per shadow id ({ id: hours }). Returns true if anything banked. */
  bankPendingGrowth(hoursByShadowId) {
    if (!hoursByShadowId || typeof hoursByShadowId !== 'object') return false;
    const pending = this._pendingGrowthHours || (this._pendingGrowthHours = {});
    let banked = 0;
    for (const [sid, hours] of Object.entries(hoursByShadowId)) {
      const h = Number(hours);
      if (!(h > 0)) continue;
      const key = String(sid).trim();
      if (!key) continue;
      pending[key] = (pending[key] || 0) + h;
      banked++;
    }
    return banked > 0;
  },

  /**
   * Apply banked growth for up to maxShadows ids. Runs on a 30s interval
   * (index.js), hidden-gated like autoPromoteGrades — the backlog just
   * accumulates hours until the next visible tick. Ids whose record no
   * longer exists (extracted/deleted) are consumed, not retried.
   */
  async drainPendingGrowth(maxShadows = 500) {
    if (this._pendingGrowthDrainInFlight) return 0;
    const pending = this._pendingGrowthHours;
    if (!pending || !this.storageManager?.transformShadowsBatch) return 0;
    const ids = Object.keys(pending).slice(0, Math.max(1, maxShadows));
    if (ids.length === 0) return 0;

    // Snapshot the hours being applied — bankPendingGrowth can add MORE hours
    // for the same shadow mid-drain; subtracting the snapshot (instead of
    // deleting the key) keeps those late hours banked for the next tick.
    const hoursSnapshot = {};
    for (const id of ids) {
      const h = Number(pending[id]);
      if (h > 0) hoursSnapshot[id] = h;
    }

    this._pendingGrowthDrainInFlight = true;
    let applied = 0;
    let netPowerDelta = 0;
    try {
      // Suppress attemptAutoRankUp's per-shadow power delta (and its full
      // clearShadowPowerCache) — the net delta is applied once, below.
      this._batchXpInProgress = true;
      try {
        const CHUNK = 250;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const { failedIds } = await this.storageManager.transformShadowsBatch(
            chunk,
            (freshRecord) => {
              const shadow = this.getShadowData(freshRecord);
              if (!shadow) return null;
              const sid = String(shadow.id || shadow.i || '');
              const hours = hoursSnapshot[sid];
              if (!(hours > 0)) return null;

              const prevPower = this._getShadowPowerValue?.(shadow) ?? (Number(shadow.strength) || 0);
              if (!this.applyNaturalGrowth(shadow, hours)) return null;
              // Growth can cross promotion thresholds (same behavior as the
              // old completion-time path).
              this.attemptAutoRankUp(shadow);
              const newPower = this._getShadowPowerValue?.(shadow) ?? (Number(shadow.strength) || 0);
              netPowerDelta += newPower - prevPower;
              this.invalidateShadowPowerCache(shadow);
              applied++;
              return this.prepareShadowForSave(shadow) ?? null;
            },
            { chunkSize: chunk.length }
          );

          // Consume the applied hours. failedIds retry next tick with their
          // hours intact; missing/skipped ids are consumed so an extracted
          // shadow can't wedge the queue.
          const failedSet = new Set((failedIds || []).map((id) => String(id)));
          for (const id of chunk) {
            if (failedSet.has(String(id))) continue;
            const remaining = (Number(pending[id]) || 0) - (hoursSnapshot[id] || 0);
            if (remaining > 0.0001) pending[id] = remaining;
            else delete pending[id];
          }

          if (i + CHUNK < ids.length) await new Promise((r) => setTimeout(r, 0));
        }
      } finally {
        this._batchXpInProgress = false;
      }

      if (applied > 0) {
        this._invalidateSnapshot?.();
        // Strength changed — bump the write-gen counter the hourly
        // compression gate uses (see army-stats.js:_applyTotalPowerDelta).
        this._armyWriteGen = (this._armyWriteGen || 0) + 1;
        // NOTE: cachedTotalPowerShadowCount is deliberately NOT zeroed —
        // zeroing forces the next getTotalShadowPower into a full-store walk
        // (see attemptAutoRankUp's incremental note). The army total moves by
        // exactly the summed strength change.
        if (netPowerDelta !== 0 && typeof this._applyTotalPowerDelta === 'function') {
          await this._applyTotalPowerDelta(
            { strength: Math.abs(netPowerDelta) },
            netPowerDelta > 0 ? 'increment' : 'decrement'
          );
        }
      }
      return applied;
    } catch (error) {
      this.debugError('GROWTH', 'Pending-growth drain failed', error);
      return applied;
    } finally {
      this._pendingGrowthDrainInFlight = false;
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

    // UNTARGETED GRANTS REFUSED (2026-07-30). Without ids this walked all
    // 281,345 shadows: ~562k IDB callbacks and ~29s of CPU per call. Army-wide
    // growth is now derived (see _getVeterancyMultiplier), so the only
    // legitimate callers left pass an explicit id list (Dungeons combat XP,
    // extraction XP) and stay bounded by it. Returning empty rather than
    // silently walking the store keeps the cost impossible to reintroduce by
    // accident; the log line names the caller if one ever tries.
    if (!Array.isArray(shadowIds) && !perShadowAmounts) {
      this.debugLog(
        'SHADOW_XP',
        `grantShadowXP called with no target ids (amount=${baseAmount}, reason=${reason}) — ignored; army-wide XP is derived now`
      );
      return { updatedShadows: [] };
    }

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

  getShadowEffectiveStats(shadow, options = null) {
    // intrinsic:true returns what the shadow itself has earned — base stats,
    // growth from combat XP, and veterancy — WITHOUT the Shadow Monarch
    // replacement. Rank promotion gates on this; see getRankUpEligibility.
    const intrinsicOnly = options?.intrinsic === true;
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
    const vetMultiplier = this._getVeterancyMultiplier(shadow);
    let monarchScaled = false;
    const soloData = intrinsicOnly ? null : this.getSoloLevelingData?.();
    if (soloData?.rank === 'Shadow Monarch') {
      const playerStats = soloData.stats || {};
      const factor = SHADOW_SCALE_FACTOR_BY_RANK[shadow.rank] ?? 0.50;
      // VETERANCY UNDER THE MONARCH PERK (2026-07-30): age CLOSES THE GAP to
      // the Monarch instead of multiplying past them. Applying the veterancy
      // multiplier after this replacement (as it is for non-SM shadows) broke
      // the perk's stated invariant — a 4-year Monarch+ shadow measured 1.71x
      // the player, and "never reach (let alone exceed) the player's stats" is
      // the whole point of the per-rank factor table.
      //
      //     factor' = 1 - (1 - factor) / vet
      //
      // Halving the remaining distance to 1.0 as age grows: asymptotic, so it
      // approaches the Monarch without ever touching them, and rank ordering
      // survives because a higher base factor stays closer at every age.
      const vetFactor = vetMultiplier > 1 ? 1 - (1 - factor) / vetMultiplier : factor;
      statKeys.forEach((stat) => {
        effective[stat] = Math.floor((Number(playerStats[stat]) || 0) * vetFactor);
      });
      monarchScaled = true;
    }

    // MONARCH'S NAMING: a named general carries the Monarch's favor — +5% all
    // stats. MUST run after the SM replacement above (naming is SM-gated, so
    // applying it before would be overwritten at exactly the rank that names).
    if (shadow.customName) {
      statKeys.forEach((stat) => {
        effective[stat] = Math.floor(effective[stat] * 1.05);
      });
    }

    // VETERANCY (2026-07-30) — time served, DERIVED, never stored.
    // Applied last and as a MULTIPLIER so it composes with everything above,
    // including the Shadow Monarch block that REPLACES effective[] outright.
    // An additive term placed earlier would be silently wiped for SM players,
    // i.e. exactly the players with the oldest armies.
    // Skipped when the Monarch perk already folded veterancy into its scale
    // factor above — applying it twice is what exceeded the player's stats.
    if (!monarchScaled && vetMultiplier > 1) {
      statKeys.forEach((stat) => {
        effective[stat] = Math.floor(effective[stat] * vetMultiplier);
      });
    }

    return effective;
  },

  /**
   * Veterancy multiplier from time since extraction. Pure function of the
   * clock — nothing is written, ever.
   *
   * This replaces the XP grant path, which cost ~29s of CPU and ~562k IDB
   * callbacks per flush because it decompressed, mutated and recompressed all
   * 281k shadows to add a number. Age already sits on every record
   * (`extractedAt`, indexed, survives both compression levels), so the same
   * "shadows get stronger over time" behaviour comes free at read time.
   *
   * sqrt curve: growth is real but decelerating, so an old shadow stays ahead
   * without a new one being hopeless. Linear would make a 1-year shadow 365x a
   * 1-day shadow. At the default rate (0.02):
   *     1 day ~ +2%   |  100 days ~ +20%  |  400 days ~ +40%  |  4 years ~ +78%
   *
   * Veterans keep their edge permanently (age only grows), and newer shadows
   * accrue at the same rate from their own extraction date, so there is no
   * permanent caste split between shadows raised before and after this change.
   */
  _getVeterancyMultiplier(shadow) {
    const extractedAt = Number(shadow?.extractedAt) || 0;
    if (!extractedAt) return 1; // unknown age = no bonus, never a penalty
    const ageMs = Date.now() - extractedAt;
    if (!(ageMs > 0)) return 1; // clock skew / future timestamp
    const rate = Number(this.settings?.veterancyRate ?? C.VETERANCY_RATE);
    if (!Number.isFinite(rate) || rate <= 0) return 1;
    return 1 + rate * Math.sqrt(ageMs / 86400000);
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

  /**
   * Can this shadow rank up on STATS alone? (essence is charged by the caller)
   *
   * Extracted 2026-07-30 so the essence pre-check in autoPromoteGrades and the
   * promotion itself run the identical gate. Two copies of this test would
   * drift, and the failure mode is silent: essence charged for a promotion the
   * transform then declines, i.e. the player pays for nothing.
   *
   * The old LEVEL gate is gone. Levels still advance for shadows that earn
   * TARGETED xp (Dungeons combat, extraction), but the army-wide broadcast that
   * levelled everyone else is derived now, so the vast majority of shadows will
   * never gain another level. A level requirement would therefore be
   * permanently unsatisfiable for them and would freeze the rank ladder for the
   * whole army except the handful that happen to see combat. Stats carry the
   * gate instead, and they keep growing for everyone: veterancy
   * (_getVeterancyMultiplier) raises effective stats with age.
   *
   * @returns {{eligible: boolean, nextRank?: string, reason?: string}}
   */
  getRankUpEligibility(shadow) {
    if (!shadow || !shadow.rank) return { eligible: false, reason: 'no_shadow' };

    const currentRankIndex = this.shadowRanks.indexOf(shadow.rank);
    const nextRank = this.shadowRanks[currentRankIndex + 1];
    if (!nextRank) return { eligible: false, reason: 'max_rank' };
    // Shadow Monarch is player-exclusive.
    if (nextRank === 'Shadow Monarch') return { eligible: false, reason: 'monarch_locked' };

    // THE GATE IS STATS — but the shadow's OWN stats, not its combat stats.
    //
    // Gating on getShadowEffectiveStats() looked like a stat gate and was not
    // one: while the player is Shadow Monarch that function REPLACES a shadow's
    // stats with playerStats x rankFactor, so every rank cleared its next
    // baseline by 100-650x. Worse, the factor RISES with rank (0.50 at E to
    // 0.97 at Monarch+), so each promotion made the next easier — a ladder that
    // climbs itself.
    //
    // The intrinsic view is what the shadow actually earned: its base stats,
    // growth banked from combat XP, and veterancy from time served. It cannot
    // be inflated by the player getting stronger, so a promotion means the
    // shadow grew, which is the point.
    const effectiveStats = this.getShadowEffectiveStats(shadow, { intrinsic: true });
    const nextRankMultiplier = this.rankStatMultipliers[nextRank] || 1.0;
    const baselineForNextRank = this.getRankBaselineStats(nextRank, nextRankMultiplier);

    const statKeys = C.STAT_KEYS;
    const totalBaseline = statKeys.reduce((sum, stat) => sum + (baselineForNextRank[stat] || 0), 0);
    const totalEffective = statKeys.reduce((sum, stat) => sum + (effectiveStats[stat] || 0), 0);

    const roleThresholdFactor = this.getRoleRankUpThresholdFactor(shadow.role);
    const requiredTotal = totalBaseline * 0.8 * roleThresholdFactor;

    if (totalEffective < requiredTotal) {
      return { eligible: false, reason: 'stats_gate', nextRank };
    }
    return { eligible: true, nextRank };
  },

  attemptAutoRankUp(shadow) {
    const gate = this.getRankUpEligibility(shadow);
    if (!gate.eligible) return { success: false, reason: gate.reason };
    const nextRank = gate.nextRank;

    // Essence for rank promotion is charged by the CALLER (autoPromoteGrades),
    // which is the only place that can query and spend the ItemVault balance —
    // this function runs inside a synchronous transformShadowsBatch callback
    // and cannot await anything.

    // Capture the pre-promotion rank BEFORE shadow.rank is reassigned below.
    // _applyRankPromotionProgressCarry needs it to compute the OLD rank's
    // XP-to-next-level and carry progress proportionally; the return value
    // reports it as oldRank. Reading it after the mutation (or not declaring
    // it at all) is what made every promotion throw ReferenceError.
    const currentRank = shadow.rank;
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
