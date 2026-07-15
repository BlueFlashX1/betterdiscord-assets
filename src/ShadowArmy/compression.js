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
const SLEvents = require('../shared/event-bus');

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
      cn: shadow.customName || null, // Monarch's Naming — custom general name

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
      cn: shadow.customName || null,

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

    // Base stats = total effective scaled back minus growth contributions.
    // A3 (audit): clamp to 0, not 1. When compression rounding inflates
    // totalGrowth + totalNatGrowth past totalEffective, the formula
    // produces a negative number — clamping to 1 silently bumped each
    // stat by 1 (×5 stats = +5 per shadow), over-crediting power.
    // Clamping to 0 reflects the reconstructed truth.
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
      customName: compressed.cn || null,
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
      customName: compressed.cn || null,
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
      this._invalidateCapCountCache?.();
      // Deletion/exchange mutates the army — bump the write-gen counter the
      // hourly compression gate uses (see army-stats.js:_applyTotalPowerDelta).
      // Currently unreached (no live caller), kept for when a shadow-exchange
      // feature routes through here.
      this._armyWriteGen = (this._armyWriteGen || 0) + 1;
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

      // R1 (perf): skip the full 281k-row scan entirely when nothing
      // tiering-relevant has happened since the last completed pass.
      // this._armyWriteGen is a dedicated write-generation counter bumped
      // only at real mutation sites (extraction: army-stats.js
      // _applyTotalPowerDelta; XP/rank-up: progression.js grantShadowXP +
      // attemptAutoRankUp; heal: self-heal.js). It deliberately does NOT
      // reuse getArmyStatsCacheKey()/cachedTotalPowerVersion — that field is
      // also re-stamped by passive cache-refresh reads (widget/buff lookups
      // recomputing a stale cachedTotalPowerShadowCount, including the one
      // THIS pass resets below), which would make the gate look "changed"
      // on every tick regardless of real activity and defeat the skip for
      // exactly the large/active armies that need it.
      // this._lastCompressionGen starts undefined, so the first pass after
      // plugin start always runs.
      const currentGen = this._armyWriteGen || 0;
      if (this._lastCompressionGen !== undefined && currentGen === this._lastCompressionGen) {
        this.debugLog('COMPRESSION', 'Army unchanged since last pass, skipping full scan');
        return;
      }

      let allShadows = [];
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getAllShadowsRaw();
        } catch (error) {
          this.debugError('COMPRESSION', 'Error getting shadows', error);
          return;
        }
      }

      if (allShadows.length <= 1000) {
        this.debugLog('COMPRESSION', 'Army too small, skipping');
        // Record completion even for the "too small" branch — re-reading
        // getAllShadowsRaw() every tick for a stable small army is exactly
        // the wasted work this gate exists to remove.
        this._lastCompressionGen = this._armyWriteGen || 0;
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
      // Tracks whether every attempted tier write actually landed — gates
      // whether _lastCompressionGen may advance below (item 3b: a transient
      // IDB failure must NOT be recorded as "pass complete", or the retry
      // never happens until an unrelated future mutation bumps the gen).
      let anyTierWriteFailed = false;

      // Tier CLASSIFICATION (which id belongs in which tier) is inherently
      // a whole-army-relative ranking decision from this pass's snapshot —
      // it can't be recomputed per-record in isolation, and re-deciding it
      // fresh every hourly pass is by design (a shadow's rank in the power
      // ordering naturally drifts). What must NOT come from the snapshot is
      // the VALUE written for each id: every transform below re-decompresses
      // and re-serializes from the FRESH record via transformShadowsBatch,
      // so a concurrent XP grant / rank-up / grade promotion / self-heal fix
      // landing between this snapshot and the write is carried through
      // instead of silently reverted.

      // --- Cold tier: ultra-compress ---
      const coldIds = cold
        .filter(({ compressionLevel }) => compressionLevel !== 2)
        .map(({ shadow }) => this.getCacheKey(shadow))
        .filter(Boolean);

      let coldUpdated = 0;
      if (coldIds.length > 0 && this.storageManager?.transformShadowsBatch) {
        try {
          const { completed, failedIds } = await this.storageManager.transformShadowsBatch(
            coldIds,
            (freshRecord) => {
              if (freshRecord._c === 2) return null; // already ultra since snapshot, no-op
              const decompressedFresh = this.getShadowData(freshRecord);
              if (!decompressedFresh) return null;
              const oldShadow = { ...freshRecord };
              const ultraCompressedShadow = this.compressShadowUltra(decompressedFresh);
              if (!ultraCompressedShadow || !this.getCacheKey(ultraCompressedShadow)) return null;
              this._invalidateShadowStateCaches(oldShadow);
              return ultraCompressedShadow;
            }
          );
          coldUpdated = completed;
          if (failedIds.length > 0) anyTierWriteFailed = true;
        } catch (error) {
          this.debugError('COMPRESSION', 'Ultra-compression: batch transform error', error);
          anyTierWriteFailed = true;
        }
      }
      counters.ultraCompressed = coldUpdated;

      // --- Warm tier: regular compress ---
      const warmIds = warm
        .filter(({ compressionLevel }) => compressionLevel !== 1)
        .map(({ shadow }) => this.getCacheKey(shadow))
        .filter(Boolean);

      let warmUpdated = 0;
      if (warmIds.length > 0 && this.storageManager?.transformShadowsBatch) {
        try {
          const { completed, failedIds } = await this.storageManager.transformShadowsBatch(
            warmIds,
            (freshRecord) => {
              if (freshRecord._c === 1) return null; // already regular-compressed since snapshot, no-op
              const decompressedFresh = this.getShadowData(freshRecord);
              if (!decompressedFresh) return null;
              const oldShadow = { ...freshRecord };
              const compressedShadow = this.compressShadow(decompressedFresh);
              if (!compressedShadow || !this.getCacheKey(compressedShadow)) return null;
              this._invalidateShadowStateCaches(oldShadow);
              return compressedShadow;
            }
          );
          warmUpdated = completed;
          if (failedIds.length > 0) anyTierWriteFailed = true;
        } catch (error) {
          this.debugError('COMPRESSION', 'Compression: batch transform error', error);
          anyTierWriteFailed = true;
        }
      }

      const downgradeCount = warm.filter(({ compressionLevel }) => compressionLevel === 2).length;
      counters.compressed = warmUpdated;
      counters.ultraCompressed -= downgradeCount;

      // --- Elite tier: decompress if needed ---
      const eliteIds = elites
        .filter(({ compressionLevel }) => compressionLevel !== 0)
        .map(({ shadow }) => this.getCacheKey(shadow))
        .filter(Boolean);

      let elitesUpdated = 0;
      if (eliteIds.length > 0 && this.storageManager?.transformShadowsBatch) {
        try {
          const { completed, failedIds } = await this.storageManager.transformShadowsBatch(
            eliteIds,
            (freshRecord) => {
              if (!freshRecord._c) return null; // already full/uncompressed since snapshot, no-op
              const oldShadow = { ...freshRecord };
              const decompressedForSave = this.prepareShadowForSave(this.getShadowData(freshRecord));
              if (!decompressedForSave || !this.getCacheKey(decompressedForSave)) return null;
              this._invalidateShadowStateCaches(oldShadow);
              return decompressedForSave;
            }
          );
          elitesUpdated = completed;
          if (failedIds.length > 0) anyTierWriteFailed = true;
        } catch (error) {
          this.debugError('COMPRESSION', 'Decompression: batch transform error', error);
          anyTierWriteFailed = true;
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

      // Record completion — but ONLY if every tier's writes actually landed
      // (item 3b). A transient IDB failure mid-pass must leave
      // _lastCompressionGen stale so the NEXT tick's gen-compare still sees
      // "changed" and retries the tiering that failed, instead of silently
      // skipping it until an unrelated future mutation bumps the write-gen.
      // Re-read this._armyWriteGen fresh (not the currentGen captured at the
      // top) in case a real mutation landed mid-pass (e.g. a concurrent
      // extraction while getAllShadowsRaw() was awaited) — recording the
      // newer value means next tick still detects that change instead of
      // masking it.
      if (!anyTierWriteFailed) {
        this._lastCompressionGen = this._armyWriteGen || 0;
      } else {
        this.debugLog('COMPRESSION', 'One or more tier writes failed — _lastCompressionGen NOT advanced, next tick will retry');
      }

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
    const localEssence = essenceConfig?.essence || 0;
    if (localEssence <= 0) return { promoted: 0 };

    // PRE-CHECK (burst-retry fix): ShadowArmy's local essenceConfig.essence counter
    // is maintained independently of ItemVault's real ledger (it's only ever pushed
    // TO ItemVault via fire-and-forget add/spend events — see the Dungeons essence
    // listener in index.js — never re-synced back down). When the two drift, this
    // cycle used to promote against the stale local value, then emit a spend
    // ItemVault could never honor, repeating "SPEND FAILED" every autoPromote tick.
    // Query the actual balance once per cycle (event bus emit is synchronous, so
    // this read and the spend below happen in the same tick — no other writer can
    // interleave) and cap what we're willing to spend to it.
    let vaultBalance = null;
    if (SLEvents) {
      SLEvents.emit('ItemVault:query', {
        itemId: 'shadow_essence',
        callback: (result) => { vaultBalance = result?.amount ?? 0; },
      });
    }
    // If ItemVault didn't answer (not mounted yet), fall back to the local counter
    // rather than blocking promotions outright.
    const currentEssence = vaultBalance != null ? Math.min(localEssence, vaultBalance) : localEssence;
    if (currentEssence <= 0) return { promoted: 0 };

    // Cooldown safety net: if a prior cycle's spend still failed (e.g. the vault
    // query above ever misses a mounted-but-desynced ItemVault instance), don't
    // retry until the vault balance has grown past what we tried to spend, or 5
    // minutes have passed.
    const cooldownUntil = this._essenceSpendCooldownUntil || 0;
    if (Date.now() < cooldownUntil && currentEssence < (this._essenceSpendCooldownAmount || 0)) {
      return { promoted: 0 };
    }

    const gradeOrder = C.SHADOW_GRADES;
    // SHADOW MONARCH PERK (player-exclusive): the top grade (Grand Marshal) is only
    // reachable while you are the Shadow Monarch. Otherwise shadows cap at the
    // second-to-top grade (Marshal). maxGradeIndex = the highest grade a shadow may
    // be promoted TO; a shadow at index >= maxGradeIndex won't promote further.
    const isShadowMonarch = this.getSoloLevelingData?.()?.rank === 'Shadow Monarch';
    const maxGradeIndex = isShadowMonarch ? gradeOrder.length - 1 : gradeOrder.length - 2;
    const promotionCosts = essenceConfig?.gradePromotionCost
      || this.defaultSettings.shadowEssence.gradePromotionCost;
    // Scale the per-cycle batch to army size — a flat 50/cycle can never
    // distribute a 300K-shadow army. Capped so each 30s tick stays bounded.
    let totalCount = 0;
    try { totalCount = (await this.storageManager?.getTotalCount?.()) || 0; } catch (_) {}
    const configuredBatch = essenceConfig?.autoPromoteBatchSize || 50;
    const batchSize = Math.min(500, Math.max(configuredBatch, Math.ceil(totalCount / 600)));
    const windowSize = batchSize * 4;

    // ROTATING SCAN — the distribution fix. Previously this always loaded offset 0
    // (the newest ~1000 shadows by extractedAt), so 99%+ of a large army was NEVER
    // considered for promotion and stayed Common forever. Resume from the last-seen
    // primary key each cycle (keyset pagination) so every shadow gets a promotion
    // chance; wrap to the start on a short read (end of the army reached). Keyset
    // resume costs O(windowSize) per tick regardless of position, unlike the old
    // offset-based getShadows() call, which cost O(offset) cursor-skip steps and
    // grew to ~20M cursor steps/lap near the end of a 281k-shadow store.
    if (this._gradePromoteLastKey === undefined) this._gradePromoteLastKey = null;

    let shadows = [];
    if (this.storageManager?.getShadowsByKeyPage) {
      try {
        const page = await this.storageManager.getShadowsByKeyPage(this._gradePromoteLastKey, windowSize);
        shadows = page.shadows;
        this._gradePromoteLastKey = page.exhausted ? null : page.lastKey;
      } catch (error) {
        this.debugError('GRADE', 'Failed to load shadows for grade promotion', error);
        return { promoted: 0 };
      }
    }
    if (shadows.length === 0) return { promoted: 0 };

    // Sort by LOWEST grade first (ensure even progression through grade tiers),
    // then by highest rank + level as tiebreaker within same grade.
    // This prevents the same top-200 shadows from monopolizing all promotions
    // while 280K+ shadows stay at Common.
    const rankOrder = this.shadowRanks || C.SHADOW_RANKS || [];
    // Read grade/rank/level from the raw (possibly compressed) fields directly —
    // do NOT getShadowData() the whole window. Decompressing every sampled shadow
    // each cycle was the heavy synchronous cost; we only need these few fields to
    // sort, and the promotion loop below updates the raw grade field in place.
    // (s.gr/s.r/s.l = compressed fields; s.grade/s.rank/s.level = uncompressed.)
    const withLevel = shadows.map((s) => {
      const grade = s?.grade || s?.gr || 'Common';
      const rank = s?.r || s?.rank || 'E';
      return {
        raw: s,
        level: s?.l || s?.level || 1,
        rankIndex: rankOrder.indexOf(rank),
        grade,
        gradeIndex: gradeOrder.indexOf(grade),
      };
    });
    // Filter out max-grade shadows (nothing to promote)
    const promotable = withLevel.filter(e => e.gradeIndex >= 0 && e.gradeIndex < maxGradeIndex);
    if (promotable.length === 0) return { promoted: 0 };

    // Primary sort: lowest grade first (Common before Elite before Knight...)
    // Secondary: highest rank first within same grade (strongest get promoted first at each tier)
    // Tertiary: highest level as final tiebreaker
    promotable.sort((a, b) => {
      if (a.gradeIndex !== b.gradeIndex) return a.gradeIndex - b.gradeIndex;
      if (b.rankIndex !== a.rankIndex) return b.rankIndex - a.rankIndex;
      return b.level - a.level;
    });

    let promoted = 0;
    let essenceSpent = 0;
    let remainingEssence = currentEssence;
    // Essence-budget decisions (who gets promoted, to what grade, at what
    // cost) stay computed here from the snapshot — this is a single
    // synchronous JS loop with no awaits, so it's race-free by construction
    // (nothing else can run between iterations). Only the FIELD WRITE is
    // deferred to a merge-on-write transform below: idsToPromote records
    // "this id should advance one grade step"; the transform re-derives
    // the actual nextGrade from the FRESH record's CURRENT grade so it's
    // self-consistent even if something else touched the record's grade
    // between this snapshot and the write landing.
    const idsToPromote = [];

    for (let i = 0; i < promotable.length && promoted < batchSize; i++) {
      const entry = promotable[i];
      const currentGrade = entry.grade;
      const gradeIndex = gradeOrder.indexOf(currentGrade);
      if (gradeIndex < 0 || gradeIndex >= maxGradeIndex) continue;

      const nextGrade = gradeOrder[gradeIndex + 1];
      const cost = promotionCosts?.[nextGrade] || 0;
      if (cost <= 0 || remainingEssence < cost) continue;

      // Promote!
      remainingEssence -= cost;
      essenceSpent += cost;
      promoted++;

      const id = this.getCacheKey?.(entry.raw) || entry.raw?.id || entry.raw?.i;
      if (id) idsToPromote.push(id);
    }

    if (promoted > 0) {
      // Persist essence deduction as a DELTA against the CURRENT value, not
      // an absolute overwrite of the stale `remainingEssence` captured
      // before the two awaits above (getTotalCount/getShadowsByKeyPage).
      // If Dungeons:awardEssence's synchronous handler landed during either
      // await, it already applied `essenceConfig.essence += essenceGain` in
      // isolation — reading essenceConfig.essence fresh here and subtracting
      // only what THIS cycle spent preserves that concurrent award instead
      // of discarding it via an absolute Math.max(0, remainingEssence) write.
      essenceConfig.essence = Math.max(0, (essenceConfig.essence || 0) - essenceSpent);

      // Mirror essence spend to ItemVault audit trail. The pre-check above caps
      // essenceSpent to the real vault balance, so this should always succeed —
      // but if it doesn't (e.g. ItemVault wasn't mounted when we queried), arm a
      // cooldown so the next cycle doesn't immediately repeat the same failed spend.
      if (SLEvents && essenceSpent > 0) {
        let spendFailed = false;
        const onSpendFailed = (data) => {
          if (data?.itemId === 'shadow_essence') spendFailed = true;
        };
        SLEvents.on('ItemVault:spendFailed', onSpendFailed);
        SLEvents.emit('ItemVault:spend', {
          itemId: 'shadow_essence',
          amount: essenceSpent,
          source: 'ShadowArmy',
          reason: 'grade_promotion',
        });
        SLEvents.off('ItemVault:spendFailed', onSpendFailed);
        if (spendFailed) {
          this._essenceSpendCooldownUntil = Date.now() + 5 * 60 * 1000;
          this._essenceSpendCooldownAmount = essenceSpent;
        }
      }

      // PERF (2026-04-12): Yield to the event loop after the heavy load+sort
      // phase (up to ~1000 shadows decompressed and sorted synchronously)
      // before starting the save phase. Prevents the renderer from blocking
      // for the entire promote cycle in one tick.
      await new Promise((r) => setTimeout(r, 0));

      // Merge-on-write: each id's grade advance is re-derived from the FRESH
      // record at write time (not the stale `nextGrade` decided above),
      // so self-heal or compression tiering rewriting the rest of the
      // record around the same time can never revert this promotion —
      // and this promotion can never stomp a concurrent structural change
      // to the record, since only the grade/gr field is touched.
      if (this.storageManager?.transformShadowsBatch && idsToPromote.length > 0) {
        const { failedIds } = await this.storageManager.transformShadowsBatch(
          idsToPromote,
          (freshRecord) => {
            const isCompressed = !!freshRecord._c;
            const freshGrade = isCompressed ? (freshRecord.gr || 'Common') : (freshRecord.grade || 'Common');
            const freshGradeIndex = gradeOrder.indexOf(freshGrade);
            if (freshGradeIndex < 0 || freshGradeIndex >= maxGradeIndex) return null; // already maxed / unknown, skip
            const freshNextGrade = gradeOrder[freshGradeIndex + 1];
            if (isCompressed) {
              freshRecord.gr = freshNextGrade;
            } else {
              freshRecord.grade = freshNextGrade;
            }
            return freshRecord;
          }
        );
        if (failedIds.length > 0) {
          this.debugError('GRADE', `transformShadowsBatch: ${failedIds.length} promoted shadow(s) failed to save`, { failedIds });
        }
      }
      this._invalidateSnapshot?.();
      this._gradeCacheTs = 0; // Invalidate widget grade-count cache after promotion
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
