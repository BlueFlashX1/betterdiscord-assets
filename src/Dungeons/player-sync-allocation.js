const C = require('./constants');

module.exports = {
  // Shared by _scheduleSpawnRankStarterWarm (below) and player-flow.js's cold-cache
  // recovery warm calls -- previously each computed this independently (one via a
  // WARM_MOB_CAP_BY_RANK local copy, the others via a flat _deployStarterShadowCap
  // fallback that ignored dungeon rank entirely). Centralizing here means every warm
  // call fetches enough candidates for the ACTUAL rank-scaled deploy target, not just
  // the generic 240-shadow starter floor.
  _getDeployWarmTarget(dungeonRank) {
    const rankIdx = dungeonRank ? Math.max(0, this.getRankIndexValue(dungeonRank)) : 0;
    const mobCap = (dungeonRank && C.DUNGEON_MOB_CAPACITY_BY_RANK[dungeonRank])
      || Math.round(50 * Math.pow(2.5, rankIdx));
    return Math.max(
      this._deployStarterShadowCap || 240,
      Math.ceil(mobCap * (C.DEPLOY_MOB_RATIO || 1.5))
    );
  },

  syncHPFromStats() {
    if (!this.soloLevelingStats?.settings) return false;
    if (
      typeof this.soloLevelingStats.settings.userHP === 'number' &&
      !isNaN(this.soloLevelingStats.settings.userHP)
    ) {
      this.settings.userHP = this.soloLevelingStats.settings.userHP;
      if (typeof this.soloLevelingStats.settings.userMaxHP === 'number' &&
          !isNaN(this.soloLevelingStats.settings.userMaxHP)) {
        this.settings.userMaxHP = this.soloLevelingStats.settings.userMaxHP;
      }
      return true;
    }
    return false;
  },

  syncManaFromStats() {
    if (!this.soloLevelingStats?.settings) return false;
    if (
      typeof this.soloLevelingStats.settings.userMana === 'number' &&
      !isNaN(this.soloLevelingStats.settings.userMana)
    ) {
      this.settings.userMana = this.soloLevelingStats.settings.userMana;
      // Validate userMaxMana separately — syncHPFromStats validates HP
      // before copying; this method previously copied userMaxMana
      // unconditionally. If SLStats was mid-reset or cold-loaded,
      // userMaxMana could be NaN/undefined/null, and the mana regen
      // formula (combat-primitives.js dividing by userMaxMana) would
      // silently collapse mana regen to NaN. Only overwrite when the
      // incoming value is a finite positive number.
      const incomingMaxMana = this.soloLevelingStats.settings.userMaxMana;
      if (typeof incomingMaxMana === 'number' && Number.isFinite(incomingMaxMana) && incomingMaxMana > 0) {
        this.settings.userMaxMana = incomingMaxMana;
      }
      return true;
    }
    return false;
  },

  syncHPAndManaFromStats() {
    // Throttle: skip if called within the last 250ms (combat calls this 3-4x per tick)
    const now = Date.now();
    if (this._lastHPManaSync && now - this._lastHPManaSync < 250) {
      return { hpSynced: false, manaSynced: false };
    }
    this._lastHPManaSync = now;
    return {
      hpSynced: this.syncHPFromStats(),
      manaSynced: this.syncManaFromStats(),
    };
  },

  pushHPToStats(saveImmediately = false) {
    if (!this.soloLevelingStats?.settings) return;
    this.soloLevelingStats.settings.userHP = this.settings.userHP;
    this.soloLevelingStats.settings.userMaxHP = this.settings.userMaxHP;

    // Update UI immediately (v3: React re-render via updateChatUI)
    if (typeof this.soloLevelingStats.updateChatUI === 'function') {
      this.soloLevelingStats.updateChatUI();
    }

    if (saveImmediately && typeof this.soloLevelingStats.saveSettings === 'function') {
      this.soloLevelingStats.saveSettings();
    }
  },

  pushManaToStats(saveImmediately = false) {
    if (!this.soloLevelingStats?.settings) return;
    this.soloLevelingStats.settings.userMana = this.settings.userMana;
    this.soloLevelingStats.settings.userMaxMana = this.settings.userMaxMana;

    // Update UI immediately (v3: React re-render via updateChatUI)
    if (typeof this.soloLevelingStats.updateChatUI === 'function') {
      this.soloLevelingStats.updateChatUI();
    }

    if (saveImmediately && typeof this.soloLevelingStats.saveSettings === 'function') {
      this.soloLevelingStats.saveSettings();
    }
  },

  updateStatsUI() {
    if (!this.soloLevelingStats) return;
    if (typeof this.soloLevelingStats.updateChatUI === 'function') {
      this.soloLevelingStats.updateChatUI();
    }
  },

  async _warmDeployStarterPool(options = {}) {
    const {
      dungeonRank = null,
      targetCount = this._deployStarterShadowCap || 240,
      sampleLimit = 2000,
      forceRefresh = false,
    } = options || {};
    if (!this.started || !this.shadowArmy) return 0;

    const now = Date.now();
    const starterPoolFresh =
      Array.isArray(this._deployStarterPoolCache) &&
      this._deployStarterPoolCache.length > 0 &&
      this._deployStarterPoolCacheTime &&
      now - this._deployStarterPoolCacheTime < this._deployStarterPoolCacheTTL;
    const sameRankHint =
      !dungeonRank ||
      !this._deployStarterPoolCacheRank ||
      this._deployStarterPoolCacheRank === dungeonRank;
    // minReusablePool: pool must be at least this large to be reused without a fresh warm.
    // Raised cap to 50000 so large-army deploys (mob × 1.5 can exceed 2000) aren't stale-served.
    const minReusablePool = this.clampNumber(
      Number.isFinite(targetCount) ? Math.floor(targetCount) : this._deployStarterShadowCap || 240,
      24,
      50000
    );

    if (
      !forceRefresh &&
      starterPoolFresh &&
      (sameRankHint || this._deployStarterPoolCache.length >= minReusablePool)
    ) {
      return this._deployStarterPoolCache.length;
    }

    if (this._deployStarterWarmInFlight && !forceRefresh) {
      try {
        return await this._deployStarterWarmInFlight;
      } catch (_) {
        return 0;
      }
    }
    if (this._deployStarterWarmInFlight && forceRefresh) {
      try {
        await this._deployStarterWarmInFlight;
      } catch (_) {}
    }

    const warmPromise = (async () => {
      // desiredCount: fetch 4× target so rank-filtered selection has enough candidates.
      // Raised cap 8000→100000 to accommodate large deploy targets (S = 15k, SS = 37k, etc.)
      const desiredCount = this.clampNumber(
        Math.max(
          200,
          Math.floor((Number.isFinite(targetCount) ? targetCount : this._deployStarterShadowCap || 240) * 4)
        ),
        200,
        100000
      );
      // hardLimit: absolute cap on pool size. Raised 10000→100000 so the pool can hold
      // enough rank-appropriate shadows for large dungeons without being truncated.
      const hardLimit = this.clampNumber(
        Math.max(desiredCount, Number.isFinite(sampleLimit) ? Math.floor(sampleLimit) : 2000),
        200,
        100000
      );

      const candidates = [];
      const seenIds = new Set();
      const pushCandidates = (rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        for (let i = 0; i < rows.length; i++) {
          const raw = rows[i];
          let normalized = this.normalizeShadowId(raw);

          // Some startup snapshots can contain lightweight IDs/primitives.
          // Try to hydrate those entries before deciding they're unusable.
          if ((!normalized || !this.getShadowIdValue(normalized)) && this.shadowArmy.getShadowData) {
            try {
              const decoded = this.shadowArmy.getShadowData(raw);
              normalized = this.normalizeShadowId(decoded) || decoded;
            } catch (_) {}
          }

          if (!normalized) continue;
          const sid = this.getShadowIdValue(normalized);
          if (!sid) continue;
          const idKey = String(sid);
          if (seenIds.has(idKey)) continue;
          seenIds.add(idKey);
          candidates.push(normalized);
          if (candidates.length >= hardLimit) break;
        }
      };

      // 1) Fast path: seed from ShadowArmy's shared in-memory snapshot when available.
      //    Use deploy-friendly 60s TTL snapshot — standard 2s TTL is almost always expired
      //    by the time deployment runs, forcing unnecessary IDB reads.
      const snapshot = this.shadowArmy.getShadowSnapshotForDeploy?.() || this.shadowArmy.getShadowSnapshot?.();
      if (Array.isArray(snapshot) && snapshot.length > 0) {
        pushCandidates(snapshot);
        if (this.settings.debug && candidates.length < snapshot.length) {
          this.debugLog('DEPLOY', 'Starter warmup snapshot dropped non-shadow entries', {
            snapshotSize: snapshot.length,
            usableCount: candidates.length,
            dropped: snapshot.length - candidates.length,
          });
        }

        if (candidates.length >= minReusablePool) {
          this._deployStarterPoolCache = candidates.slice(0, hardLimit);
          this._deployStarterPoolCacheTime = Date.now();
          this._deployStarterPoolCacheRank = null;

          // Only mirror to broad cache when snapshot appears fully usable.
          if (candidates.length === snapshot.length) {
            this._shadowsCache = {
              shadows: this._deployStarterPoolCache.slice(),
              timestamp: Date.now(),
            };
          }
          return this._deployStarterPoolCache.length;
        }
      }

      // 2) Fallback: read a bounded sample from IDB instead of Infinity rows.
      const shadowStorage = this.shadowArmy.storageManager;
      if (!shadowStorage?.getShadows) {
        if (candidates.length > 0) {
          this._deployStarterPoolCache = candidates.slice(0, hardLimit);
          this._deployStarterPoolCacheTime = Date.now();
          this._deployStarterPoolCacheRank = dungeonRank || null;
          return this._deployStarterPoolCache.length;
        }
        return this._deployStarterPoolCache?.length || 0;
      }

      // 2a) Rank-targeted sampling first (requested dungeon rank ± nearby ranks).
      let rankQueryCount = 0;
      const rankOrder = Array.isArray(this.settings?.dungeonRanks) ? this.settings.dungeonRanks : [];
      const rankHintIndex =
        dungeonRank && rankOrder.length > 0 ? this.getRankIndexValue(dungeonRank, rankOrder) : -1;
      const triedRankIndices = new Set();
      if (rankHintIndex >= 0) {
        const rankOffsets = [0, 1, -1, 2, -2, 3, -3];
        const perRankLimit = this.clampNumber(
          Math.ceil(desiredCount / Math.max(1, rankOffsets.length)),
          80,
          1400
        );
        for (let i = 0; i < rankOffsets.length && candidates.length < desiredCount; i++) {
          const rankIdx = rankHintIndex + rankOffsets[i];
          if (rankIdx < 0 || rankIdx >= rankOrder.length) continue;
          triedRankIndices.add(rankIdx);
          const rank = rankOrder[rankIdx];
          // BOUNDED FETCH (wave 9c, 2026-07-13): getShadows({rank}) looks filtered but opens
          // the rank index with NO key range -- it cursor-walks the entire 281k store, JS-
          // filters, and for a populous rank materializes + sorts the whole bucket before
          // slicing (the 45s-stall class hiding behind a filtered-looking call). Use the
          // genuinely index-bounded getAll(rank, limit) primitive instead; only semantic
          // delta is within-rank selection order (index order vs recency), immaterial to the
          // tiered bucket picker downstream and already the order the wave-9b cascade uses.
          const rows = shadowStorage.getShadowsByRankLimited
            ? await shadowStorage.getShadowsByRankLimited(rank, perRankLimit)
            : await shadowStorage.getShadows({ rank }, 0, perRankLimit);
          pushCandidates(rows);
          rankQueryCount++;
          if (rankQueryCount % 2 === 0) {
            await this._yieldToEventLoop();
            if (!this.started) return 0;
          }
        }

        // FILL-DOWN CASCADE (wave 9b, 2026-07-12): the ±3 offset window above can be
        // entirely empty on a bottom-heavy army (mass of low-rank shadows, few high-rank)
        // for a high-rank dungeon. Walk DOWN the rest of the ladder toward E, fetching
        // just enough per rank to cover what's still needed (limit = remaining need, not
        // a small constant). Uses getShadowsByRankLimited (index('rank').getAll(rank,
        // limit)) -- a genuinely bounded indexed lookup, unlike the unfiltered-scan-shaped
        // getShadows({rank}) call above -- so this doesn't add scan cost, only targeted reads.
        if (candidates.length < desiredCount && shadowStorage.getShadowsByRankLimited) {
          const lowestTried = Math.min(rankHintIndex, ...Array.from(triedRankIndices));
          let cascadeSteps = 0;
          for (let rankIdx = lowestTried - 1; rankIdx >= 0 && candidates.length < desiredCount; rankIdx--) {
            if (triedRankIndices.has(rankIdx)) continue;
            triedRankIndices.add(rankIdx);
            const rank = rankOrder[rankIdx];
            if (!rank) continue;
            const remaining = desiredCount - candidates.length;
            try {
              const rows = await shadowStorage.getShadowsByRankLimited(
                rank,
                this.clampNumber(remaining, 80, 100000)
              );
              pushCandidates(rows);
            } catch (error) {
              this.errorLog('DEPLOY', 'Warm-pool fill-down cascade query failed', { rank, error });
            }
            cascadeSteps++;
            if (cascadeSteps % 2 === 0) {
              await this._yieldToEventLoop();
              if (!this.started) return 0;
            }
          }
          this.settings.debug && cascadeSteps > 0 && this.debugLog('DEPLOY', 'Warm-pool fill-down cascade ran', {
            dungeonRank, desiredCount, candidatesAfterCascade: candidates.length, cascadeSteps,
          });
        }
      }

      // 2b) Fill any remaining gaps with an unfiltered bounded sample.
      const minHealthyPool = this.clampNumber(
        Math.max(120, Math.floor((Number.isFinite(targetCount) ? targetCount : 240) * 1.5)),
        120,
        hardLimit
      );
      if (candidates.length < minHealthyPool) {
        const remaining = this.clampNumber(hardLimit - candidates.length, 0, hardLimit);
        if (remaining > 0) {
          const rows = await shadowStorage.getShadows({}, 0, remaining);
          pushCandidates(rows);
        }
      }

      if (candidates.length === 0) {
        return 0;
      }

      const sortedCache = await this._buildSortedShadowCache(candidates, { yieldEvery: 2500 });
      if (!sortedCache) {
        return 0;
      }
      const sortedCandidates = sortedCache.sorted;

      if (sortedCandidates.length > hardLimit) {
        sortedCandidates.length = hardLimit;
      }

      this._deployStarterPoolCache = sortedCandidates;
      this._deployStarterPoolCacheTime = Date.now();
      this._deployStarterPoolCacheRank = dungeonRank || null;
      return sortedCandidates.length;
    })();

    this._deployStarterWarmInFlight = warmPromise;
    try {
      return await warmPromise;
    } finally {
      this._deployStarterWarmInFlight === warmPromise && (this._deployStarterWarmInFlight = null);
    }
  },

  // R1 CONFORMANCE (2026-07-12): replaces deployShadows()'s previous last-resort
  // getAllShadows(false) full-store scan (281k-record, 45-50s per PERF-CONVENTIONS.md
  // R1). Mirrors ShadowSenses/deployment-manager.js:getWeakestAvailableShadow's bounded
  // per-rank walk via ShadowArmy's 'rank' IDB index (getShadowsByRankLimited), but walks
  // outward from the DUNGEON'S rank using the same offset order _warmDeployStarterPool
  // already uses above — deploy wants rank-appropriate shadows, not the globally weakest.
  // Populates _deployStarterPoolCache (deploy's own pool) so the retry _buildDeployStarterAllocation
  // call picks candidates up through its normal deployStarterPoolCache source — it does
  // NOT touch _shadowsCache, which getAllShadows()'s many other call sites already keep warm.
  async _lastResortRankBoundedStarterPool(dungeonRank, targetCount = this._deployStarterShadowCap || 240) {
    if (!this.started || !this.shadowArmy) return 0;
    const shadowStorage = this.shadowArmy.storageManager;
    if (!shadowStorage?.getShadowsByRankLimited) return 0;

    // Budgets scale with targetCount (raised cap wave 9, 2026-07-12: was clamped to 2000/500
    // regardless of how large targetCount had grown, undersizing this last-resort pool for
    // high-rank dungeons). Still R1-bounded -- every fetch below goes through
    // getShadowsByRankLimited's indexed getAll(rank, limit), never a full-store scan.
    const desiredCount = this.clampNumber(
      Math.max(200, Math.floor((Number.isFinite(targetCount) ? targetCount : this._deployStarterShadowCap || 240) * 4)),
      200,
      100000
    );
    const rankOrder = Array.isArray(this.settings?.dungeonRanks) ? this.settings.dungeonRanks : [];
    const rankHintIndex =
      dungeonRank && rankOrder.length > 0 ? this.getRankIndexValue(dungeonRank, rankOrder) : -1;
    const rankOffsets = [0, 1, -1, 2, -2, 3, -3];
    const perRankLimit = this.clampNumber(Math.ceil(desiredCount / rankOffsets.length), 80, 4000);

    const candidates = [];
    const seenIds = new Set();
    const triedRankIndices = new Set();
    const fetchRank = async (rank, limit) => {
      let rows;
      try {
        rows = await shadowStorage.getShadowsByRankLimited(rank, limit);
      } catch (error) {
        this.errorLog('DEPLOY', 'Last-resort bounded rank query failed', { rank, error });
        return;
      }
      if (!Array.isArray(rows) || rows.length === 0) return;
      for (let j = 0; j < rows.length; j++) {
        let normalized = this.normalizeShadowId(rows[j]);
        if ((!normalized || !this.getShadowIdValue(normalized)) && this.shadowArmy.getShadowData) {
          try {
            const decoded = this.shadowArmy.getShadowData(rows[j]);
            normalized = this.normalizeShadowId(decoded) || decoded;
          } catch (_) {}
        }
        if (!normalized) continue;
        const sid = this.getShadowIdValue(normalized);
        if (!sid) continue;
        const idKey = String(sid);
        if (seenIds.has(idKey)) continue;
        seenIds.add(idKey);
        candidates.push(normalized);
      }
    };

    for (let i = 0; i < rankOffsets.length && candidates.length < desiredCount; i++) {
      const rankIdx = rankHintIndex >= 0 ? rankHintIndex + rankOffsets[i] : -1;
      const rank = rankIdx >= 0 && rankIdx < rankOrder.length ? rankOrder[rankIdx] : null;
      if (!rank) continue;
      triedRankIndices.add(rankIdx);
      await fetchRank(rank, perRankLimit);

      if (i % 2 === 1) {
        await this._yieldToEventLoop();
        if (!this.started) return 0;
      }
    }

    // FILL-DOWN CASCADE (wave 9b, 2026-07-12): the offset window above only reaches
    // dungeonRank ± 3 -- on a bottom-heavy army (mass of low-rank shadows, few high-rank),
    // a Monarch-tier dungeon's window (SSS..Shadow Monarch) can be genuinely empty while
    // hundreds of thousands of E/D/C shadows sit untouched. Walk DOWN the rest of the
    // ladder, lowest-tried-rank-minus-one down to E, fetching just enough per rank to
    // cover what's still needed (limit = remaining need, not a small constant -- the
    // E-tier fetch on a bottom-heavy army may need to supply most of the target).
    // Still fully R1-bounded: every call goes through getShadowsByRankLimited's indexed
    // getAll(rank, limit), never an unbounded/full-store scan.
    if (candidates.length < desiredCount && rankHintIndex >= 0 && rankOrder.length > 0) {
      const lowestTried = Math.min(rankHintIndex, ...Array.from(triedRankIndices));
      let cascadeSteps = 0;
      for (let rankIdx = lowestTried - 1; rankIdx >= 0 && candidates.length < desiredCount; rankIdx--) {
        if (triedRankIndices.has(rankIdx)) continue;
        triedRankIndices.add(rankIdx);
        const rank = rankOrder[rankIdx];
        if (!rank) continue;
        const remaining = desiredCount - candidates.length;
        await fetchRank(rank, this.clampNumber(remaining, perRankLimit, 100000));
        cascadeSteps++;
        if (cascadeSteps % 2 === 0) {
          await this._yieldToEventLoop();
          if (!this.started) return 0;
        }
      }
      this.settings.debug && candidates.length > 0 && this.debugLog('DEPLOY', 'Last-resort fill-down cascade ran', {
        dungeonRank, desiredCount, candidatesAfterCascade: candidates.length, cascadeSteps,
      });
    }

    if (candidates.length === 0) return 0;

    this._deployStarterPoolCache = candidates;
    this._deployStarterPoolCacheTime = Date.now();
    this._deployStarterPoolCacheRank = dungeonRank || null;
    return candidates.length;
  },

  _scheduleSpawnRankStarterWarm(channelKey, dungeonRank) {
    if (!this.started || !this.shadowArmy || !channelKey) return;

    const ageMs = this._deployStarterPoolCacheTime
      ? Date.now() - this._deployStarterPoolCacheTime
      : Number.POSITIVE_INFINITY;
    const sameRankHint =
      !dungeonRank ||
      !this._deployStarterPoolCacheRank ||
      this._deployStarterPoolCacheRank === dungeonRank;

    // Force refresh when rank mismatch or cache is aging out soon.
    const forceRefresh = !sameRankHint || ageMs > Math.max(30000, Math.floor(this._deployStarterPoolCacheTTL * 0.5));

    // Warm the pool to the actual expected deploy count (mob × 1.5) so rank-appropriate
    // shadows from IDB are fetched instead of just the top-240 elites.
    // Table + ratio centralized in constants.js (wave 9) -- see _getDeployWarmTarget above,
    // which _buildDeployStarterAllocation's own targetCount math also derives from.
    const warmTarget = this._getDeployWarmTarget(dungeonRank);

    this._setTrackedTimeout(() => {
      Promise.resolve()
        .then(async () => {
          const warmedPoolCount = await this._warmDeployStarterPool({
            dungeonRank: dungeonRank || null,
            targetCount: warmTarget,
            sampleLimit: Math.max(1200, Math.floor(warmTarget * 8)),
            forceRefresh,
          });

          this.settings.debug && this.debugLog('DEPLOY', 'Spawn rank warmup completed', {
            channelKey,
            dungeonRank: dungeonRank || null,
            warmTarget,
            warmedPoolCount,
            forceRefresh,
            cacheRank: this._deployStarterPoolCacheRank || null,
          });
        })
        .catch((error) => {
          this.errorLog('DEPLOY', 'Spawn rank warmup failed', { channelKey, dungeonRank, error });
        });
    }, 0);
  },

  _buildDeployStarterAllocation(channelKey, dungeon) {
    // Deploy target scales with mob capacity (rank-rebalance, 2026-06-08; table +
    // ceiling centralized + raised, wave 9, 2026-07-12):
    // - DEPLOY_MOB_RATIO: deploy ~1.5× the dungeon's mob capacity (overwhelming but not OP)
    // - armyAvailableCap: hard upper bound (25% reserve, split by active dungeons)
    // - MAX_OVERRANK: shadows more than this many ranks ABOVE the dungeon are withheld
    //   (prevents Monarchs flooding an S dungeon; they deploy only as absolute last resort)
    // MOB_CAP_BY_RANK / DEPLOY_MOB_RATIO / DEFAULT_DEPLOY_CEIL now read from constants.js --
    // see DUNGEON_MOB_CAPACITY_BY_RANK / DEPLOY_MOB_RATIO / DEPLOY_CEILING_ABSOLUTE for the
    // full curve + cost-model rationale (single source of truth shared with spawn-core.js
    // and the pool-warming helper above).
    const MOB_CAP_BY_RANK = C.DUNGEON_MOB_CAPACITY_BY_RANK;
    // --- Tunable constants (rank-rebalance, 2026-06-08) ---
    const RESERVE_FRACTION  = 0.25; // keep 25% of army as reserve across all active dungeons
    const DEPLOY_MOB_RATIO  = C.DEPLOY_MOB_RATIO || 1.5;  // target ≈ 1.5× mob capacity (overwhelming, not OP)
    const MAX_OVERRANK      = 1;    // max ranks ABOVE dungeon a shadow may be deployed (anti-overkill)
    // deployCeiling: safe with rotating-subset combat (O(TICK_BUDGET) per tick) --
    // see constants.js:DEPLOY_CEILING_ABSOLUTE for the full cost-model writeup.
    const DEFAULT_DEPLOY_CEIL = C.DEPLOY_CEILING_ABSOLUTE || 200000;
    const userCap = Number(this.settings?.deployStarterShadowCap);
    const hasUserCap = Number.isFinite(userCap) && userCap > 0;
    const deployCeiling = hasUserCap
      ? this.clampNumber(Math.floor(userCap), 24, DEFAULT_DEPLOY_CEIL)
      : DEFAULT_DEPLOY_CEIL;
    // deployScale: optional user-facing multiplier (settings-only, no UI convention exists
    // in Dungeons -- mirrors the deployStarterShadowCap precedent above). Default 1.0 = the
    // curve as tuned; 0.5-3x lets a player scale the whole rank curve up or down without
    // touching individual rank numbers. Applied to the target BEFORE reserve/ceiling clamps
    // so it never bypasses the army-reserve or perf-safety limits, only scales within them.
    const scaleRaw = Number(this.settings?.deployScale);
    const deployScale = (Number.isFinite(scaleRaw) && scaleRaw > 0)
      ? this.clampNumber(scaleRaw, 0.1, 5)
      : 1;

    const deployedDungeonCount = Math.max(
      1,
      Array.from(this.activeDungeons.values()).filter(
        (d) => d && !d.completed && !d.failed && d.shadowsDeployed
      ).length
    );
    const knownShadowCount = Number.isFinite(this.allocationCache?.count)
      ? Math.max(0, Math.floor(this.allocationCache.count))
      : 0;

    // Available army: total army minus reserve, split equally across active dungeons.
    // e.g. 53k army, 1 dungeon, 25% reserve → armyAvailableCap = 39,750
    const armyAvailableCap = knownShadowCount > 0
      ? Math.max(24, Math.floor((knownShadowCount * (1 - RESERVE_FRACTION)) / deployedDungeonCount))
      : deployCeiling;

    let targetCount;
    if (dungeon._isDemonCastle && knownShadowCount > 0) {
      // Demon Castle: deploy a floor-scaled fraction, still reserve + perf-bounded.
      // Intentionally NOT scaled by deployScale -- its fraction curve (story-constants.js)
      // is tuned per-floor independently of the rank-mobCap curve below.
      const DC = require('./story-constants');
      const fraction = DC.getDeployFraction(dungeon._dcFloor || 1);
      targetCount = this.clampNumber(
        Math.min(Math.floor(knownShadowCount * fraction), armyAvailableCap),
        24,
        deployCeiling
      );
    } else {
      // Target = ceil(mobCap × DEPLOY_MOB_RATIO × deployScale), capped by available army
      // and ceiling. Use the dungeon's LIVE mob capacity (what the UI shows, e.g. 12,000)
      // so the ratio tracks the actual dungeon; fall back to the static rank table pre-spawn.
      // S dungeon @ 12,000 cap → target = ceil(12000 × 1.5) = 18,000 (before deployScale).
      // Small armies are still capped by armyAvailableCap so the reserve is honored.
      const rankIdx = Math.max(0, this.getRankIndexValue(dungeon.rank));
      const liveMobCap = Number(dungeon.mobs?.mobCapacity);
      const mobCap = (Number.isFinite(liveMobCap) && liveMobCap > 0)
        ? liveMobCap
        : (MOB_CAP_BY_RANK[dungeon.rank] || Math.round(50 * Math.pow(2.5, rankIdx)));
      const mobTarget = Math.ceil(mobCap * DEPLOY_MOB_RATIO * deployScale);
      targetCount = this.clampNumber(
        Math.min(mobTarget, armyAvailableCap),
        24,
        deployCeiling
      );
    }

    const usedIds = new Set();
    for (const [otherKey, assigned] of this.shadowAllocations.entries()) {
      if (otherKey === channelKey || !Array.isArray(assigned) || assigned.length === 0) continue;
      const otherDungeon = this._getActiveDungeon(otherKey);
      if (
        !otherDungeon ||
        !otherDungeon.shadowsDeployed ||
        otherDungeon._completing ||
        ((otherDungeon.boss?.hp || 0) <= 0 && !otherDungeon.boss?._isSentinel)
      ) continue;
      for (const shadow of assigned) {
        const sid = this.getShadowIdValue(shadow);
        sid && usedIds.add(String(sid));
      }
    }

    const exchangeBlockedIds = new Set();
    try {
      const exchange = this._getPluginSafe('ShadowExchange');
      const markedIds = exchange?.getMarkedShadowIds?.();
      markedIds instanceof Set && markedIds.forEach((id) => id && exchangeBlockedIds.add(String(id)));
    } catch (err) {
      this.errorLog('DEPLOY', 'ShadowExchange blocked-ID fetch failed (non-fatal)', err);
    }
    const sensesBlockedIds = this._getShadowSensesDeployedIds();
    const blockedIds = new Set([...exchangeBlockedIds, ...sensesBlockedIds]);

    let candidatePool =
      Array.isArray(this._allocationSortedShadowsCache) && this._allocationSortedShadowsCache.length > 0
        ? this._allocationSortedShadowsCache
        : null;
    let candidateSource = candidatePool ? 'allocationSortedCache' : null;

    const starterPoolAvailable =
      Array.isArray(this._deployStarterPoolCache) &&
      this._deployStarterPoolCache.length > 0 &&
      this._deployStarterPoolCacheTime;
    const starterPoolAgeMs = starterPoolAvailable
      ? Date.now() - this._deployStarterPoolCacheTime
      : Number.POSITIVE_INFINITY;

    if (!candidatePool) {
      const starterPoolFresh =
        starterPoolAvailable &&
        starterPoolAgeMs < this._deployStarterPoolCacheTTL;
      if (starterPoolFresh) {
        candidatePool = this._deployStarterPoolCache;
        candidateSource = 'deployStarterPoolCache';
      }
    }

    if (!candidatePool) {
      const staleMaxAge = Number.isFinite(this._deployStarterPoolStaleMaxAge)
        ? this._deployStarterPoolStaleMaxAge
        : 900000;
      const starterPoolStaleButUsable =
        starterPoolAvailable &&
        starterPoolAgeMs < staleMaxAge;
      if (starterPoolStaleButUsable) {
        candidatePool = this._deployStarterPoolCache;
        candidateSource = 'deployStarterPoolCacheStale';
      }
    }

    if (!candidatePool) {
      const snapshot = this.shadowArmy?.getShadowSnapshotForDeploy?.() || this.shadowArmy?.getShadowSnapshot?.();
      if (Array.isArray(snapshot) && snapshot.length > 0) {
        candidatePool = snapshot;
        candidateSource = 'shadowArmySnapshot';
      }
    }

    if (!candidatePool) {
      const cached = this._shadowsCache?.shadows;
      if (Array.isArray(cached) && cached.length > 0) {
        candidatePool = cached;
        candidateSource = 'shadowsCache';
      }
    }

    if (!Array.isArray(candidatePool) || candidatePool.length === 0) {
      return [];
    }

    const picked = [];
    const pickedIds = new Set();
    const dungeonRankIndex = this.getRankIndexValue(dungeon?.rank || 'E');
    const normalizeCandidateShadow = (shadowLike) => {
      let normalized = this.normalizeShadowId(shadowLike);
      if (normalized && this.getShadowIdValue(normalized)) {
        return normalized;
      }
      if (this.shadowArmy?.getShadowData) {
        try {
          const decoded = this.shadowArmy.getShadowData(shadowLike);
          normalized = this.normalizeShadowId(decoded) || decoded;
        } catch (_) {}
      }
      return normalized && this.getShadowIdValue(normalized) ? normalized : null;
    };

    const tryPickShadow = (shadow) => {
      const normalized = normalizeCandidateShadow(shadow);
      const shadowId = this.getShadowIdValue(normalized);
      if (!shadowId) return null;
      const sid = String(shadowId);
      if (usedIds.has(sid) || blockedIds.has(sid) || pickedIds.has(sid)) return null;
      pickedIds.add(sid);
      return normalized;
    };

    // ── Tiered rank composition (rank-rebalance, 2026-06-08) ────────
    // Deploy rank-APPROPRIATE shadows: bulk of same-rank, some ±1 adjacent,
    // some under-ranked backfill — but NO over-ranked elites above MAX_OVERRANK.
    //
    // Tier A (50%): same rank as dungeon                 (signed dist = 0)
    // Tier B (35%): within ±1 rank OR up to MAX_OVERRANK above (dist ≤ 1)
    // Tier C (15%): under-ranked backfill (MORE than 1 below dungeon rank)
    // Overkill: shadows more than MAX_OVERRANK ranks ABOVE dungeon → withheld.
    //           Only deployed as absolute last-resort if other tiers all empty.
    //
    // signed dist: positive = shadow rank ABOVE dungeon, negative = below.
    // This prevents "far above" (Monarch) being lumped with "far below" (B-rank).
    //
    // Each tier fills its quota then shortfalls cascade downward.

    const tierATarget = Math.ceil(targetCount * 0.50);
    const tierBTarget = Math.ceil(targetCount * 0.35);
    const tierCTarget = targetCount - tierATarget - tierBTarget; // remainder ≈ 15%

    // Pre-bucket candidates by SIGNED rank distance (single pass over pool)
    const bucketA       = []; // signedDist = 0 (same rank)
    const bucketB       = []; // |signedDist| = 1, OR signedDist is 1..MAX_OVERRANK above
    const bucketC       = []; // signedDist < -1 (under-ranked backfill, more than 1 below)
    const bucketOverkill = []; // signedDist > MAX_OVERRANK (far-above — withheld from normal fill)
    for (let i = 0; i < candidatePool.length; i++) {
      const normalized = normalizeCandidateShadow(candidatePool[i]);
      if (!normalized) continue;
      const sid = this.getShadowIdValue(normalized);
      if (!sid || usedIds.has(String(sid)) || blockedIds.has(String(sid))) continue;
      // positive = shadow is HIGHER rank than dungeon; negative = lower rank
      const signedDist = this.getRankIndexValue(normalized.rank || 'E') - dungeonRankIndex;
      if (signedDist === 0) {
        bucketA.push(normalized);
      } else if (signedDist > MAX_OVERRANK) {
        // Too many ranks above — overkill; withheld unless we run out of everything else
        bucketOverkill.push(normalized);
      } else if (signedDist >= -1) {
        // 1 below, or up to MAX_OVERRANK above (same-rank already went to bucketA)
        bucketB.push(normalized);
      } else {
        // More than 1 below: under-ranked backfill (deploy by numbers to meet target)
        bucketC.push(normalized);
      }
    }

    // Pick from each tier up to its quota (pool is already power-desc sorted)
    const pickFromBucket = (bucket, quota) => {
      let count = 0;
      for (let i = 0; i < bucket.length && count < quota; i++) {
        const accepted = tryPickShadow(bucket[i]);
        if (accepted) { picked.push(accepted); count++; }
      }
      return count;
    };

    // Fill tiers — shortfalls cascade to the next appropriate tier
    const pickedA  = pickFromBucket(bucketA, tierATarget);
    const shortfallA = tierATarget - pickedA;

    const pickedB  = pickFromBucket(bucketB, tierBTarget + shortfallA);
    const shortfallB = (tierBTarget + shortfallA) - pickedB;

    pickFromBucket(bucketC, tierCTarget + shortfallB);

    // Last-resort fallback 1: any remaining shadow in the eligible pool (still NO overkill)
    if (picked.length < targetCount) {
      for (let i = 0; i < candidatePool.length && picked.length < targetCount; i++) {
        const normalized = normalizeCandidateShadow(candidatePool[i]);
        if (!normalized) continue;
        const sid = this.getShadowIdValue(normalized);
        if (!sid) continue;
        const signedDist = this.getRankIndexValue(normalized.rank || 'E') - dungeonRankIndex;
        if (signedDist > MAX_OVERRANK) continue; // skip overkill in this pass
        const accepted = tryPickShadow(normalized);
        accepted && picked.push(accepted);
      }
    }

    // Last-resort fallback 2: overkill shadows if we're still under target
    // (e.g. player genuinely lacks rank-appropriate shadows to fill the quota)
    if (picked.length < targetCount) {
      pickFromBucket(bucketOverkill, targetCount - picked.length);
    }

    if (picked.length === 0 && this.settings.debug) {
      let totalWithId = 0;
      let usedHits = 0;
      let exchangeBlockedHits = 0;
      let sensesBlockedHits = 0;
      let availableStrict = 0;
      for (let i = 0; i < candidatePool.length; i++) {
        const normalized = normalizeCandidateShadow(candidatePool[i]);
        const sidValue = this.getShadowIdValue(normalized);
        if (!sidValue) continue;
        totalWithId++;
        const sid = String(sidValue);
        if (usedIds.has(sid)) {
          usedHits++;
          continue;
        }
        if (exchangeBlockedIds.has(sid)) {
          exchangeBlockedHits++;
          continue;
        }
        if (sensesBlockedIds.has(sid)) {
          sensesBlockedHits++;
          continue;
        }
        availableStrict++;
      }
      this.debugLog('DEPLOY', 'Starter allocation produced 0 candidates', {
        channelKey,
        dungeonRank: dungeon?.rank,
        candidateSource,
        starterPoolAgeMs: Number.isFinite(starterPoolAgeMs) ? Math.floor(starterPoolAgeMs) : null,
        poolSize: candidatePool.length,
        totalWithId,
        usedHits,
        exchangeBlockedHits,
        sensesBlockedHits,
        availableStrict,
        usedSetSize: usedIds.size,
        blockedSetSize: blockedIds.size,
        exchangeBlockedSetSize: exchangeBlockedIds.size,
        sensesBlockedSetSize: sensesBlockedIds.size,
      });
    }

    // Composition visibility (wave 9b, 2026-07-12): with the fill-down cascade now able
    // to pull deep under-ranked shadows to meet high-rank targets, surface what actually
    // got deployed so a bottom-heavy-army player can see fill-down working rather than
    // just a final count. Example: "Deployed 150,000: E:120k D:20k C:8k S:2k".
    if (this.settings.debug && picked.length > 0) {
      const rankTally = new Map();
      for (let i = 0; i < picked.length; i++) {
        const r = picked[i]?.rank || 'E';
        rankTally.set(r, (rankTally.get(r) || 0) + 1);
      }
      const rankOrderForLog = Array.isArray(this.settings?.dungeonRanks) ? this.settings.dungeonRanks : [];
      const formatCount = (n) => {
        if (n >= 1000000) return (n % 1000000 === 0 ? n / 1000000 : (n / 1000000).toFixed(1)) + 'M';
        if (n >= 1000) return (n % 1000 === 0 ? n / 1000 : (n / 1000).toFixed(1)) + 'k';
        return String(n);
      };
      const orderedRanks = rankOrderForLog.length > 0
        ? rankOrderForLog.filter((r) => rankTally.has(r))
        : Array.from(rankTally.keys());
      const composition = orderedRanks.map((r) => `${r}:${formatCount(rankTally.get(r))}`).join(' ');
      this.debugLog('DEPLOY', `Deployed ${picked.length.toLocaleString()}: ${composition}`, {
        channelKey,
        dungeonRank: dungeon?.rank,
        targetCount,
        pickedCount: picked.length,
        rankBreakdown: Object.fromEntries(rankTally),
      });
    }

    return picked;
  },

  _applyDeployStarterAllocation(channelKey, dungeon, starterShadows) {
    if (!Array.isArray(starterShadows) || starterShadows.length === 0 || !dungeon) return 0;

    const assigned = [];
    const seen = new Set();
    for (let i = 0; i < starterShadows.length; i++) {
      const normalized = this.normalizeShadowId(starterShadows[i]);
      if (!normalized) continue;
      const shadowId = this.getShadowIdValue(normalized);
      if (!shadowId) continue;
      const sid = String(shadowId);
      if (seen.has(sid)) continue;
      seen.add(sid);
      assigned.push(normalized);
    }

    if (assigned.length === 0) return 0;

    let totalPower = 0;
    for (let i = 0; i < assigned.length; i++) {
      totalPower += this.getShadowCombatScore(assigned[i]);
    }

    this.shadowAllocations.set(channelKey, assigned);
    dungeon.shadowAllocation = {
      shadows: assigned,
      totalPower,
      updatedAt: Date.now(),
      source: 'deploy_starter',
    };
    if (dungeon.boss) {
      dungeon.boss.expectedShadowCount = assigned.length;
    }

    // Only update allocationCache if we're raising the known count.
    // On first deploy, assigned.length can be tiny (7 shadows from a cold snapshot)
    // which poisons fairShare for subsequent deploys until preSplitShadowArmy reconciles.
    // The rebalance fires within 50ms and sets the real count — don't downgrade it here.
    const existingCount = Number.isFinite(this.allocationCache?.count)
      ? this.allocationCache.count
      : 0;
    if (assigned.length > existingCount) {
      this.allocationCache = { count: assigned.length };
      this.allocationCacheTime = Date.now();
    }

    return assigned.length;
  },

  _scheduleDeployRebalance(channelKey, deployStartedAt = Date.now()) {
    if (!channelKey || this._deployRebalanceInFlight.has(channelKey)) return;
    this._deployRebalanceInFlight.add(channelKey);

    this._setTrackedTimeout(() => {
      Promise.resolve()
        .then(async () => {
          if (!this.started) return;
          const dungeon = this._getActiveDungeon(channelKey);
          if (!dungeon || !dungeon.shadowsDeployed || (dungeon.boss?.hp <= 0 && !dungeon.boss?._isSentinel)) return;

          const beforeCount = (this.shadowAllocations.get(channelKey) || []).length;
          const rebalanceStartAt = Date.now();
          await this.preSplitShadowArmy();

          if (!this.started) return;
          const refreshedDungeon = this._getActiveDungeon(channelKey);
          if (!refreshedDungeon || !refreshedDungeon.shadowsDeployed) return;

          const afterCount = (this.shadowAllocations.get(channelKey) || []).length;
          this.ensureDeployedSpawnPipeline(channelKey, 'deploy_async_rebalance');
          // Force structural rebuild so shadow count reflects rebalanced allocation
          this._bossBarCache?.delete?.(channelKey);
          this.queueHPBarUpdate(channelKey);

          this.settings.debug && console.log(
            `[Dungeons] ⚔️ DEPLOY REBALANCE: "${refreshedDungeon.name}" [${refreshedDungeon.rank}] ` +
              `starter=${beforeCount} -> full=${afterCount} shadows | ` +
              `rebalance=${Date.now() - rebalanceStartAt}ms | total=${Date.now() - deployStartedAt}ms | ` +
              `Key: ${channelKey}`
          );
        })
        .catch((error) => this.errorLog('DEPLOY', 'Async deploy rebalance failed', { channelKey, error }))
        .finally(() => {
          const pendingDungeon = this._getActiveDungeon(channelKey);
          if (pendingDungeon) {
            pendingDungeon._deployPendingFullAllocation = false;
          }
          this._deployRebalanceInFlight.delete(channelKey);
        });
    }, 50);
  },

  _getAssignedShadowsForDungeon(channelKey, dungeon) {
    const assignedFromMap = this.shadowAllocations.get(channelKey) || [];
    const assignedFromDungeon = dungeon.shadowAllocation?.shadows || [];
    const assignedShadows = assignedFromMap.length > 0 ? assignedFromMap : assignedFromDungeon;

    if (assignedFromMap.length > 0) {
      dungeon.shadowAllocation = {
        shadows: assignedFromMap,
        updatedAt: Date.now(),
        source: 'shadowAllocations',
      };
    }

    return { assignedFromMap, assignedFromDungeon, assignedShadows };
  },

  _collectShadowsNeedingHPInit(assignedShadows, deadShadows) {
    const shadowsToInitialize = [];
    for (const shadow of assignedShadows) {
      const shadowId = this.getShadowIdValue(shadow);
      if (!shadowId) continue;
      deadShadows.has(shadowId) || shadowsToInitialize.push(shadow);
    }
    return shadowsToInitialize;
  },

  async _initializeShadowHPBatch(shadowsToInitialize, shadowHP, context) {
    // PERF: Use sync initializer — no Promise.all / microtask overhead for pure-math HP calc.
    for (const shadow of shadowsToInitialize) {
      try {
        const hpData = this.initializeShadowHPSync(shadow, shadowHP);
        const shadowId = this.getShadowIdValue(shadow);
        const isValidHpData =
          hpData &&
          typeof hpData.hp === 'number' &&
          !isNaN(hpData.hp) &&
          typeof hpData.maxHp === 'number' &&
          !isNaN(hpData.maxHp) &&
          hpData.maxHp > 0 &&
          hpData.hp >= 0;
        if (!isValidHpData) {
          this.debugLogOnce(`SHADOW_HP_INIT_INVALID:${shadowId}`, 'SHADOW_HP', {
            shadowId,
            hpData,
            context,
          });
          shadowHP.set(String(shadowId), { hp: 1, maxHp: 1 });
        }
        } catch (error) {
          this.errorLog(
            'SHADOW_INIT',
            `Failed to initialize shadow ${this.getShadowIdValue(shadow)} (${context})`,
            error
          );
        }
    }
  },

  _cleanupDungeonActiveMobs(dungeon) {
    // NUMPY-STYLE IN-PLACE COMPACTION: Swap-remove dead mobs without allocating a new array.
    // Old pattern allocated a full copy every tick (10,000 objects → GC pressure).
    // New pattern: scan forward, swap live mobs to write position, truncate once at end.
    const mobs = dungeon?.mobs?.activeMobs;
    if (!mobs) return;

    let writeIdx = 0;
    for (let readIdx = 0; readIdx < mobs.length; readIdx++) {
      const mob = mobs[readIdx];
      if (mob && mob.hp > 0) {
        if (writeIdx !== readIdx) mobs[writeIdx] = mobs[readIdx];
        writeIdx++;
      }
    }
    mobs.length = writeIdx; // Truncate dead tail in-place (no new array)

    // Scale emergency trim to dungeon capacity — don't destroy mobs before combat processes them.
    // E(50)→50, B(1200)→1200, Monarch(250k)→250k — no artificial ceiling.
    const dungeonCap = this._getMobActiveCap?.(dungeon) || 3000;
    const maxSize = Math.max(3000, dungeonCap);
    if (mobs.length > maxSize) {
      // Trim to 80% of cap (keep most alive mobs, just prevent runaway growth beyond cap)
      mobs.length = Math.max(500, Math.floor(maxSize * 0.8));
    }
  },

  _getActiveDungeon(channelKey) {
    const d = this.activeDungeons.get(channelKey);
    return d && !d.completed && !d.failed ? d : null;
  },

  _varianceWide() { return 0.85 + Math.random() * 0.3; },

  _varianceNarrow() { return 0.9 + Math.random() * 0.2; },

  _resolveSpawnTierShares() {
    const normal = Number.isFinite(this.settings?.mobTierNormalShare) ? this.settings.mobTierNormalShare : 0.7;
    const elite = Number.isFinite(this.settings?.mobTierEliteShare) ? this.settings.mobTierEliteShare : 0.25;
    const champion = Number.isFinite(this.settings?.mobTierChampionShare)
      ? this.settings.mobTierChampionShare
      : 0.05;
    const sum = Math.max(0.01, normal + elite + champion);
    return {
      normal: normal / sum,
      elite: elite / sum,
      champion: champion / sum,
    };
  },

  _rollMobTier() {
    const shares = this._resolveSpawnTierShares();
    const roll = Math.random();
    if (roll < shares.normal) return 'normal';
    if (roll < shares.normal + shares.elite) return 'elite';
    return 'champion';
  },

  _getMobTierMultipliers(tier) {
    switch (tier) {
      case 'champion':
        return { statMultiplier: 1.7, hpMultiplier: 2.7, cooldownMultiplier: 0.9 };
      case 'elite':
        return { statMultiplier: 1.35, hpMultiplier: 1.8, cooldownMultiplier: 0.95 };
      default:
        return { statMultiplier: 1.0, hpMultiplier: 1.0, cooldownMultiplier: 1.0 };
    }
  },

  _getShadowPressureScaleFromPower(totalPower, step, maxScale) {
    const safePower = Math.max(0, Number.isFinite(totalPower) ? totalPower : 0);
    const safeStep = Number.isFinite(step) ? step : 0;
    const safeMax = Number.isFinite(maxScale) ? maxScale : 2.75;
    if (safePower <= 0 || safeStep <= 0) return 1;
    const rawScale = 1 + safeStep * Math.log10(safePower + 1);
    return this.clampNumber(rawScale, 1, safeMax);
  },

  getStaticBossHpMultiplier(rankIndex) {
    const safeRankIndex = Math.max(0, Number.isFinite(rankIndex) ? rankIndex : 0);
    const base = Number.isFinite(this.settings?.staticBossHpBaseMultiplier)
      ? this.settings.staticBossHpBaseMultiplier
      : 2.3;
    const rankStep = Number.isFinite(this.settings?.staticBossHpRankStep)
      ? this.settings.staticBossHpRankStep
      : 0.14;
    return this.clampNumber(base + safeRankIndex * rankStep, 1, 12);
  },

  getShadowPressureMobFactor(dungeon) {
    if (this.settings?.shadowPressureScalingEnabled !== true) return 1;
    const totalPower = Number.isFinite(dungeon?.shadowAllocation?.totalPower)
      ? dungeon.shadowAllocation.totalPower
      : 0;
    const step = Number.isFinite(this.settings?.shadowPressureMobScaleStep)
      ? this.settings.shadowPressureMobScaleStep
      : 0.12;
    const maxScale = Number.isFinite(this.settings?.shadowPressureScaleMax)
      ? this.settings.shadowPressureScaleMax
      : 2.75;
    return this._getShadowPressureScaleFromPower(totalPower, step, maxScale);
  },

  getShadowPressureBossFactor(dungeon) {
    if (this.settings?.shadowPressureScalingEnabled !== true) return 1;
    const totalPower = Number.isFinite(dungeon?.shadowAllocation?.totalPower)
      ? dungeon.shadowAllocation.totalPower
      : 0;
    const step = Number.isFinite(this.settings?.shadowPressureBossScaleStep)
      ? this.settings.shadowPressureBossScaleStep
      : 0.18;
    const maxScale = Number.isFinite(this.settings?.shadowPressureScaleMax)
      ? this.settings.shadowPressureScaleMax
      : 2.75;
    return this._getShadowPressureScaleFromPower(totalPower, step, maxScale);
  },

  syncDungeonDifficultyScale(dungeon, channelKey = null, { scaleExistingMobs = false } = {}) {
    if (!dungeon?.boss) return false;

    if (!dungeon.difficultyScale || typeof dungeon.difficultyScale !== 'object') {
      dungeon.difficultyScale = {
        mobFactor: 1,
        bossFactor: 1,
        lastPower: 0,
        updatedAt: Date.now(),
      };
    }

    const prevMobFactor = Number.isFinite(dungeon.difficultyScale.mobFactor)
      ? dungeon.difficultyScale.mobFactor
      : 1;
    const prevBossFactor = Number.isFinite(dungeon.difficultyScale.bossFactor)
      ? dungeon.difficultyScale.bossFactor
      : 1;
    const scalingEnabled = this.settings?.shadowPressureScalingEnabled === true;
    if (!scalingEnabled) {
      dungeon.difficultyScale = {
        mobFactor: 1,
        bossFactor: 1,
        lastPower: Number.isFinite(dungeon?.shadowAllocation?.totalPower)
          ? dungeon.shadowAllocation.totalPower
          : 0,
        updatedAt: Date.now(),
      };
      return false;
    }

    const nextMobFactor = this.getShadowPressureMobFactor(dungeon);
    const nextBossFactor = this.getShadowPressureBossFactor(dungeon);

    const mobRatio = prevMobFactor > 0 ? nextMobFactor / prevMobFactor : nextMobFactor;
    const bossRatio = prevBossFactor > 0 ? nextBossFactor / prevBossFactor : nextBossFactor;
    const changedBoss = Math.abs(bossRatio - 1) >= 0.03;
    const changedMobs = Math.abs(mobRatio - 1) >= 0.03;

    if (changedBoss && Number.isFinite(dungeon.boss.maxHp) && dungeon.boss.maxHp > 0) {
      const hpRatio = Number.isFinite(dungeon.boss.hp) ? dungeon.boss.hp / dungeon.boss.maxHp : 1;
      const scaledMax = Math.max(1, Math.floor(dungeon.boss.maxHp * bossRatio));
      dungeon.boss.maxHp = scaledMax;
      if (Number.isFinite(dungeon.boss.hp) && dungeon.boss.hp > 0) {
        dungeon.boss.hp = Math.max(1, Math.min(scaledMax, Math.floor(scaledMax * hpRatio)));
      } else {
        dungeon.boss.hp = Math.max(0, Math.min(scaledMax, dungeon.boss.hp || 0));
      }
    }

    if (scaleExistingMobs && changedMobs && Array.isArray(dungeon?.mobs?.activeMobs)) {
      for (const mob of dungeon.mobs.activeMobs) {
        if (!mob || !Number.isFinite(mob.maxHp) || mob.maxHp <= 0) continue;
        const hpRatio = Number.isFinite(mob.hp) ? mob.hp / mob.maxHp : 1;
        const scaledMax = Math.max(1, Math.floor(mob.maxHp * mobRatio));
        mob.maxHp = scaledMax;
        if (Number.isFinite(mob.hp) && mob.hp > 0) {
          mob.hp = Math.max(1, Math.min(scaledMax, Math.floor(scaledMax * hpRatio)));
        } else {
          mob.hp = Math.max(0, Math.min(scaledMax, mob.hp || 0));
        }
      }
    }

    dungeon.difficultyScale = {
      mobFactor: nextMobFactor,
      bossFactor: nextBossFactor,
      lastPower: Number.isFinite(dungeon?.shadowAllocation?.totalPower)
        ? dungeon.shadowAllocation.totalPower
        : 0,
      updatedAt: Date.now(),
    };

    if ((changedBoss || (scaleExistingMobs && changedMobs)) && channelKey) {
      this.debugLog('DIFFICULTY', 'Updated dungeon pressure scaling', {
        channelKey,
        bossFactor: nextBossFactor,
        mobFactor: nextMobFactor,
        changedBoss,
        changedMobs: scaleExistingMobs ? changedMobs : false,
      });
    }

    return changedBoss || (scaleExistingMobs && changedMobs);
  },

  ensureBossEngagementUnlocked(dungeon, channelKey = null) {
    if (!dungeon?.boss) return false;

    const bossGateConfig = this.getBossGateRuntimeConfig();
    if (!dungeon.bossGate || typeof dungeon.bossGate !== 'object') {
      dungeon.bossGate = {
        enabled: bossGateConfig.enabled,
        minDurationMs: bossGateConfig.minDurationMs,
        requiredMobKills: bossGateConfig.requiredMobKills,
        deployedAt: null,
        unlockedAt: null,
      };
    } else {
      // Self-heal stale/corrupt gate payloads from persisted dungeons.
      if (typeof dungeon.bossGate.enabled !== 'boolean') {
        dungeon.bossGate.enabled = bossGateConfig.enabled;
      }
      if (
        !Number.isFinite(dungeon.bossGate.minDurationMs) ||
        dungeon.bossGate.minDurationMs < 5000
      ) {
        dungeon.bossGate.minDurationMs = bossGateConfig.minDurationMs;
      }
      if (
        !Number.isFinite(dungeon.bossGate.requiredMobKills) ||
        dungeon.bossGate.requiredMobKills < 0
      ) {
        dungeon.bossGate.requiredMobKills = bossGateConfig.requiredMobKills;
      }
    }

    if (!dungeon.shadowsDeployed) return false;

    const now = Date.now();
    const gateDeployedAt = Number(dungeon.bossGate.deployedAt);
    const dungeonDeployedAt = Number(dungeon.deployedAt);
    let deployedAt = Math.max(
      Number.isFinite(gateDeployedAt) ? gateDeployedAt : 0,
      Number.isFinite(dungeonDeployedAt) ? dungeonDeployedAt : 0
    );

    if (!Number.isFinite(deployedAt) || deployedAt <= 0 || deployedAt > now) {
      deployedAt = now;
      dungeon.bossGate.unlockedAt = null;
    }
    dungeon.deployedAt = deployedAt;
    dungeon.bossGate.deployedAt = deployedAt;

    const hasSpawnedMobs =
      this._countLiveMobs(dungeon) > 0 ||
      (Number.isFinite(dungeon?.mobs?.total) && dungeon.mobs.total > 0) ||
      (Number.isFinite(dungeon?.mobs?.killed) && dungeon.mobs.killed > 0);

    if (!hasSpawnedMobs && channelKey) {
      this.ensureDeployedSpawnPipeline(channelKey, 'boss_gate_precheck');
    }

    if (dungeon.bossGate.enabled === false) {
      // Even with gate disabled, require at least one successful spawn wave so
      // deploys cannot insta-kill boss when spawn inputs silently collapse.
      return hasSpawnedMobs;
    }
    if (!hasSpawnedMobs) return false;

    const elapsed = Math.max(0, now - deployedAt);
    const kills = Number.isFinite(dungeon?.mobs?.killed) ? dungeon.mobs.killed : 0;
    const minDurationMs = Math.max(
      0,
      Number.isFinite(dungeon.bossGate.minDurationMs) ? dungeon.bossGate.minDurationMs : 180000
    );
    const requiredMobKills = Math.max(
      0,
      Number.isFinite(dungeon.bossGate.requiredMobKills) ? dungeon.bossGate.requiredMobKills : 0
    );

    const unlockedAt = Number(dungeon.bossGate.unlockedAt);
    const hasValidUnlockStamp = Number.isFinite(unlockedAt) && unlockedAt >= deployedAt;
    if (hasValidUnlockStamp) {
      if (elapsed >= minDurationMs && kills >= requiredMobKills) return true;
      dungeon.bossGate.unlockedAt = null;
    }

    if (elapsed < minDurationMs || kills < requiredMobKills) return false;

    dungeon.bossGate.unlockedAt = now;
    dungeon.boss.lastAttackTime = now;

    if (channelKey) {
      this.debugLog('BOSS_GATE', 'Boss engagement unlocked', {
        channelKey,
        elapsed,
        kills,
        minDurationMs,
        requiredMobKills,
        deployedAt: dungeon.bossGate.deployedAt,
      });
      this.showToast(`${dungeon.name}: Boss is now vulnerable!`, 'success');
    }

    return true;
  },

  // Pure read-only predicate — checks boss gate status without mutating dungeon state.
  // Use this in simulation/offline paths (e.g. simulateShadowAttacks, simulateBossAttacks)
  // to avoid permanently unlocking the boss gate as a side effect of simulation.
  isBossGateUnlocked(dungeon) {
    if (!dungeon?.boss || !dungeon.shadowsDeployed) return false;
    if (!dungeon.bossGate || typeof dungeon.bossGate !== 'object') return false;

    if (dungeon.bossGate.enabled === false) {
      const hasSpawnedMobs =
        this._countLiveMobs(dungeon) > 0 ||
        (Number.isFinite(dungeon?.mobs?.total) && dungeon.mobs.total > 0) ||
        (Number.isFinite(dungeon?.mobs?.killed) && dungeon.mobs.killed > 0);
      return hasSpawnedMobs;
    }

    const now = Date.now();
    const deployedAt = Math.max(
      Number.isFinite(Number(dungeon.bossGate.deployedAt)) ? Number(dungeon.bossGate.deployedAt) : 0,
      Number.isFinite(Number(dungeon.deployedAt)) ? Number(dungeon.deployedAt) : 0
    );
    if (deployedAt <= 0) return false;

    const elapsed = Math.max(0, now - deployedAt);
    const kills = Number.isFinite(dungeon?.mobs?.killed) ? dungeon.mobs.killed : 0;
    const minDurationMs = Number.isFinite(dungeon.bossGate.minDurationMs) ? dungeon.bossGate.minDurationMs : 180000;
    const requiredMobKills = Number.isFinite(dungeon.bossGate.requiredMobKills) ? dungeon.bossGate.requiredMobKills : 0;

    const unlockedAt = Number(dungeon.bossGate.unlockedAt);
    if (Number.isFinite(unlockedAt) && unlockedAt >= deployedAt) {
      return elapsed >= minDurationMs && kills >= requiredMobKills;
    }

    return elapsed >= minDurationMs && kills >= requiredMobKills;
  }
};
