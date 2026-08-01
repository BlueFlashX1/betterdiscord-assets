module.exports = {
  _markAllocationDirty(reason = 'unknown', { shadowSetChanged = false } = {}) {
    this._allocationDirty = true;
    this._allocationDirtyReason = reason || 'unknown';
    if (shadowSetChanged) {
      this._allocationShadowSetDirty = true;
      this._allocationSortedShadowsCache = null;
      this._allocationSortedShadowsCacheTime = null;
      this._allocationScoreCache = null;
      this._deployStarterPoolCache = null;
      this._deployStarterPoolCacheTime = null;
      this._deployStarterPoolCacheRank = null;
    }
  },

  _removeExtractedShadowFromAllocations(extractedShadowId) {
    if (!extractedShadowId) return;
    const idStr = String(extractedShadowId);
    for (const [channelKey, allocation] of (this.shadowAllocations || new Map()).entries()) {
      if (!Array.isArray(allocation)) continue;
      const idx = allocation.findIndex(s => String(this.getShadowIdValue(s)) === idStr);
      if (idx !== -1) {
        allocation.splice(idx, 1);
        this.debugLog(`Removed extracted shadow ${idStr} from dungeon ${channelKey}`);
      }
    }
  },

  async _buildSortedShadowCache(shadows, { yieldEvery = 2500 } = {}) {
    if (!Array.isArray(shadows) || shadows.length === 0) {
      return { sorted: [], scoreCache: new Map() };
    }

    const scoreCache = new Map();
    const readScore = (shadow) => {
      const sid = this.getShadowIdValue(shadow);
      if (!sid) return this.getShadowCombatScore(shadow);
      const key = String(sid);
      if (scoreCache.has(key)) return scoreCache.get(key);
      const score = this.getShadowCombatScore(shadow);
      scoreCache.set(key, score);
      return score;
    };

    const normalizedShadows = [];
    const yieldStride = Number.isFinite(yieldEvery) && yieldEvery > 0 ? Math.floor(yieldEvery) : 2500;
    for (let i = 0; i < shadows.length; i++) {
      const normalized = this.normalizeShadowId(shadows[i]) || shadows[i];
      normalized && normalizedShadows.push(normalized);
      if ((i + 1) % yieldStride === 0) {
        await this._yieldToEventLoop();
        if (!this.started) return null;
      }
    }

    normalizedShadows.sort((a, b) => readScore(b) - readScore(a));
    return {
      sorted: normalizedShadows,
      scoreCache,
    };
  },

  // Guarantee a minimum support+tank presence in the deployed (capped) set.
  // A pure strongest-first army cap can bench every support/tank shadow when
  // they score lower than strikers, silently zeroing the guard/weaken/heal
  // role-pressure mechanics. This swaps the WEAKEST deployed non-support/tank
  // shadows for the STRONGEST benched support/tank shadows, preserving the
  // deployed count and only touching up to `minSupportTankShare` of it.
  //
  // Bounded: classifies the `deployed` set (O(cap)) and scans only the top of
  // `benched` (strongest-first) up to a cap, so it stays cheap even for very
  // large armies. Gated by roleDiversityGuaranteeEnabled (default on).
  _applyRoleDiversityGuarantee(deployed, benched) {
    if (this.settings?.roleDiversityGuaranteeEnabled === false) return deployed;
    const cap = deployed.length;
    if (cap < 10 || !Array.isArray(benched) || benched.length === 0) return deployed;

    const minShare = this.clampNumber(
      Number.isFinite(this.settings?.minSupportTankShare) ? this.settings.minSupportTankShare : 0.12,
      0,
      0.5
    );
    const targetCount = Math.floor(cap * minShare);
    if (targetCount <= 0) return deployed;

    const isSupportOrTank = (s) => {
      const a = this._getShadowArchetypeForRole(s);
      return a === 'support' || a === 'tank';
    };

    // Count support/tank already deployed; collect weakest-first swap targets
    // (deployed is strongest-first, so later indices are weaker).
    let haveCount = 0;
    const swappableStrikerIdx = [];
    for (let i = 0; i < deployed.length; i++) {
      if (isSupportOrTank(deployed[i])) haveCount++;
      else swappableStrikerIdx.push(i);
    }
    if (haveCount >= targetCount || swappableStrikerIdx.length === 0) return deployed;

    let need = targetCount - haveCount;
    const result = deployed.slice();
    let swapCursor = swappableStrikerIdx.length - 1; // weakest deployed striker
    const scanCap = Math.min(benched.length, Math.max(1000, cap * 3)); // bound the benched scan
    for (let b = 0; b < scanCap && need > 0 && swapCursor >= 0; b++) {
      if (!isSupportOrTank(benched[b])) continue;
      result[swappableStrikerIdx[swapCursor--]] = benched[b];
      need--;
    }

    if (need < targetCount - haveCount) {
      this.debugLog?.('ALLOCATION', `Role-diversity guarantee: promoted ${(targetCount - haveCount) - need} support/tank shadow(s) into the deployed set`);
    }
    return result;
  },

  // In-flight guard (2026-07-15): overlapping calls — a deploy-storm across many
  // dungeons plus the combat tick's own refresh — must not each run the full
  // O(army) sort + O(combatPool) distribution concurrently (they interleave via
  // the sort's setTimeout(0) yields). Coalesce non-forced callers onto the
  // in-flight run; a forced recompute waits for it, then runs fresh so it never
  // rides stale/cached data.
  async preSplitShadowArmy(forceRecalculate = false) {
    if (this._preSplitInFlight) {
      if (!forceRecalculate) {
        const coalesced = await this._preSplitInFlight;
        // The in-flight run snapshotted its dungeon list at START (before the
        // sort's setTimeout(0) yields). It may not cover a dungeon that became
        // deployed-but-unallocated AFTER that snapshot. If any deployed dungeon
        // is still missing an allocation, don't return this stale success —
        // fall through to a fresh run so the late dungeon gets shadows.
        if (!this._hasDeployedDungeonMissingAllocation?.()) {
          return coalesced;
        }
      } else {
        try { await this._preSplitInFlight; } catch (_) {}
      }
    }
    const run = (async () => {
      try {
        return await this._preSplitShadowArmyImpl(forceRecalculate);
      } finally {
        if (this._preSplitInFlight === run) this._preSplitInFlight = null;
      }
    })();
    this._preSplitInFlight = run;
    return run;
  },

  async _preSplitShadowArmyImpl(forceRecalculate = false) {
    const now = Date.now();
    const cacheFresh =
      this.allocationCacheTime && now - this.allocationCacheTime < this.allocationCacheTTL;

    // PERF (2026-04-12): The dirty flag previously bypassed the cache freshness
    // check, so during active combat the 45-second cache was effectively never
    // used. Combat events constantly mark _allocationDirty (combat-rebalance,
    // combat-missing-allocation, combat-hard-refresh, invalidate-shadows-cache,
    // etc.), causing every combat tick (every 2s while dungeons are active) to
    // do a full IDB read of all shadows via getAllShadows().
    //
    // Verified via fs_usage on Discord main process: ~270 file opens per burst
    // recurring every 2-15 seconds, hitting Discord's IDB origin
    // (https_discord.com_0.indexeddb.leveldb). LevelDB segments contained
    // mob_<id> and shadow records, confirming the source. With ~1500 file
    // opens per burst × 1200 preads each = ~1.8M IDB reads per cycle, which
    // pegged Discord main process at 100-150% CPU during each burst.
    //
    // The fix: respect the cache TTL even when dirty. Combat events that mark
    // dirty will be picked up at the next natural cache expiry (within 45s).
    // User-action paths (deploy, manual recall) pass forceRecalculate=true and
    // bypass this floor — those still refresh immediately.
    //
    // Edge case: a deployed dungeon missing its allocation must always refresh
    // immediately (otherwise combat would have nothing to fight with). The
    // _hasDeployedDungeonMissingAllocation() check guarantees that.
    if (!forceRecalculate && cacheFresh && !this._hasDeployedDungeonMissingAllocation()) {
      return; // Cache still valid — defer the dirty refresh until natural expiry
    }
    if (!forceRecalculate && !this._allocationDirty && cacheFresh) {
      return; // Cache still valid (legacy path: not dirty either)
    }

    // Get active dungeons — ONLY those where shadows are deployed (manual deploy)
    const activeDungeonsList = Array.from(this.activeDungeons.values()).filter(
      (d) => !d.completed && !d.failed && (d.boss.hp > 0 || d.boss._isSentinel) && d.shadowsDeployed
    );

    if (activeDungeonsList.length === 0) {
      this.shadowAllocations.clear();
      this.shadowReserve = [];
      const cachedShadowCount = Array.isArray(this._allocationSortedShadowsCache)
        ? this._allocationSortedShadowsCache.length
        : this.allocationCache?.count || 0;
      this.allocationCache = { count: cachedShadowCount };
      this.allocationCacheTime = now;
      this._allocationDirty = false;
      this._allocationDirtyReason = null;
      return;
    }

    // Allocation goals:
    // - UNIQUE shadow assignment across dungeons (finite army)
    // - Prefer shadows close to the dungeon rank, but escalate to stronger ones if underpowered
    // - Higher-rank / higher-progress dungeons get priority first
    const getRankIndex = (rank) => this.getRankIndexValue(rank);
    const getShadowId = (s) => {
      const id = this.getShadowIdValue(s);
      return id ? String(id) : null;
    };
    const getBossFraction = (d) =>
      d?.boss?.maxHp && d?.boss?.hp >= 0 ? d.boss.hp / d.boss.maxHp : 0;
    const getMobFraction = (d) =>
      d?.mobs?.targetCount && d?.mobs?.remaining >= 0 ? d.mobs.remaining / d.mobs.targetCount : 0;
    const getUrgency = (d) => {
      // Boss alive matters most, then remaining mobs.
      const bossAlive = (d?.boss?.hp || 0) > 0;
      const bossUrgency = bossAlive ? 0.7 + getBossFraction(d) * 0.6 : 0.55;
      const mobUrgency = 0.6 + getMobFraction(d) * 0.5;
      return bossUrgency * mobUrgency;
    };

    const weightedDungeons = activeDungeonsList
      .map((d) => {
        const canonicalRank = this.normalizeRankLabel(d?.rank) || 'E';
        d.rank = canonicalRank;
        const rIdx = getRankIndex(canonicalRank);
        const weight = Math.pow(rIdx + 1, 1.25) * getUrgency(d);
        return { dungeon: d, channelKey: d.channelKey, rankIndex: rIdx, weight };
      })
      .sort((a, b) => b.weight - a.weight);

    const assignedIds = new Set();

    // Shadows stationed at ShadowExchange waypoints are unavailable for battle
    let exchangeMarkedIds = new Set();
    try {
      const seInstance = this._getPluginSafe("ShadowExchange");
      if (seInstance?.getMarkedShadowIds) {
        const rawMarked = seInstance.getMarkedShadowIds();
        if (rawMarked instanceof Set) {
          rawMarked.forEach((id) => id && exchangeMarkedIds.add(String(id)));
        }
      }
    } catch (_) { this.debugLog?.('ERROR', 'Failed to get ShadowExchange marked IDs', _); }

    // Shadows deployed to ShadowSenses monitoring are unavailable for battle.
    const sensesDeployedIds = this._getShadowSensesDeployedIds();

    let shadowsSortedAll = this._allocationSortedShadowsCache;
    const sortedCacheTTL = Number.isFinite(this._allocationSortedShadowsCacheTTL)
      ? Math.max(0, this._allocationSortedShadowsCacheTTL)
      : this.allocationCacheTTL;
    const sortedCacheFresh = this._allocationSortedShadowsCacheTime
      ? sortedCacheTTL <= 0 ||
        now - this._allocationSortedShadowsCacheTime < sortedCacheTTL
      : false;
    const canReuseSortedCache =
      !forceRecalculate &&
      !this._allocationShadowSetDirty &&
      Array.isArray(shadowsSortedAll) &&
      this._allocationSortedShadowsCacheTime &&
      sortedCacheFresh;

    if (!canReuseSortedCache) {
      const allShadows = await this.getAllShadows();
      if (!allShadows || allShadows.length === 0) {
        this.shadowAllocations.clear();
        this.shadowReserve = [];
        this.allocationCache = { count: 0 };
        this.allocationCacheTime = now;
        this._allocationDirty = false;
        this._allocationDirtyReason = null;
        this._allocationShadowSetDirty = false;
        this._allocationSortedShadowsCache = [];
        this._allocationSortedShadowsCacheTime = now;
        this._allocationScoreCache = new Map();
        return;
      }

      const sortedCache = await this._buildSortedShadowCache(allShadows, { yieldEvery: 2500 });
      if (!sortedCache) return;
      shadowsSortedAll = sortedCache.sorted;

      this._allocationSortedShadowsCache = shadowsSortedAll;
      this._allocationSortedShadowsCacheTime = now;
      this._allocationScoreCache = sortedCache.scoreCache;
      this._allocationShadowSetDirty = false;
    }

    const allocationScoreCache =
      this._allocationScoreCache instanceof Map ? this._allocationScoreCache : new Map();
    this._allocationScoreCache = allocationScoreCache;
    const getShadowScore = (shadow) => {
      const sid = getShadowId(shadow);
      if (!sid) return this.getShadowCombatScore(shadow);
      const key = String(sid);
      if (allocationScoreCache.has(key)) return allocationScoreCache.get(key);
      const score = this.getShadowCombatScore(shadow);
      allocationScoreCache.set(key, score);
      return score;
    };

    // Filter cached sorted army by real-time exclusions.
    let shadowsSorted = shadowsSortedAll
      .filter((s) => {
        const id = getShadowId(s);
        return id && !exchangeMarkedIds.has(id) && !sensesDeployedIds.has(id);
      });

    // SHADOW ARMY CAP: Only deploy up to capacity (strongest first).
    // Shadows over-cap are stored but can't fight until player ranks up or gains INT.
    // Shadow Monarch = Infinity (no cap). shadowArmy.getShadowArmyCap() handles the formula.
    let overCapBenched = []; // over-cap remainder, used by the role-diversity guarantee below
    if (this.shadowArmy && typeof this.shadowArmy.getShadowArmyCap === 'function') {
      const soloData = this.shadowArmy.getSoloLevelingData?.();
      const playerRank = soloData?.rank || 'E';
      const intelligence = soloData?.stats?.intelligence || 0;
      const cap = this.shadowArmy.getShadowArmyCap(playerRank, intelligence);
      if (Number.isFinite(cap) && shadowsSorted.length > cap) {
        const benchedCount = shadowsSorted.length - cap;
        this.debugLog('ALLOCATION', `Shadow army over capacity: deploying ${cap}/${shadowsSorted.length} (${benchedCount} benched)`, {
          playerRank, intelligence, cap, total: shadowsSorted.length, benchedCount,
        });
        // shadowsSorted is already strongest-first — take the top `cap` shadows.
        // Capture the over-cap remainder so the role-diversity guarantee (applied
        // to the combat pool AFTER the reserve split, below) can promote from it.
        // NB: the guarantee runs post-reserve on purpose — running it here would
        // let the reserve's slice(-N) "weakest" cut re-bench the promoted
        // support/tank shadows (they land at the weak end) and also break the
        // strongest-first invariant that reserve slice depends on.
        overCapBenched = shadowsSorted.slice(cap);
        shadowsSorted = shadowsSorted.slice(0, cap);
      }
    }

    // Reserve pool: hold back weakest shadows for ShadowSenses deployment.
    // Base 10% reserve, reduced to 5% if all active dungeons are A-rank or above.
    const aRankIndex = getRankIndex('A');
    const allHighRank = activeDungeonsList.every(d => getRankIndex(d.rank) >= aRankIndex);
    const reservePercent = allHighRank ? 0.05 : 0.10;
    const reserveCount = shadowsSorted.length <= 1
      ? 0
      : Math.min(shadowsSorted.length - 1, Math.max(1, Math.floor(shadowsSorted.length * reservePercent)));

    // Reserve = weakest shadows (end of the sorted array, since sorted strongest-first)
    // Normalize reserve shadows so ShadowSenses can match by .id (compressed shadows only have .i)
    const reserveShadows = reserveCount > 0
      ? shadowsSorted.slice(-reserveCount).map(s => this.normalizeShadowId(s) || s)
      : [];
    const reserveIds = new Set(
      reserveShadows
        .map((s) => getShadowId(s))
        .filter(Boolean)
    );
    let combatPool = shadowsSorted.filter(s => !reserveIds.has(getShadowId(s)));

    // ROLE-DIVERSITY GUARANTEE (applied post-reserve): if a strongest-first cap
    // benched the army's support/tank shadows, promote the strongest benched
    // ones into the combat pool (swapping the weakest deployed strikers) so the
    // guard/weaken/heal role-pressure mechanics actually engage. Count is
    // preserved; the reserve pool is already split off and untouched. No-op if
    // the army has no support/tank to promote or nothing was benched.
    if (overCapBenched.length > 0) {
      combatPool = this._applyRoleDiversityGuarantee(combatPool, overCapBenched);
    }

    // Store reserve on instance for ShadowSenses to query
    this.shadowReserve = reserveShadows;

    this.debugLog('ALLOCATION', 'Reserve pool', {
      total: shadowsSorted.length,
      reserveCount,
      reservePercent: Math.round(reservePercent * 100) + '%',
      combatPool: combatPool.length,
      allHighRank,
    });

    // Pre-mark reserve shadows as assigned so they're excluded from allocation
    for (const id of reserveIds) {
      assignedIds.add(id);
    }

    // RANK-TIERED ALLOCATION: Deploy shadows by rank proximity
    //   • 90% of same-rank shadows → dungeon of that rank
    //   • 25% of one-rank-higher shadows → supplement the dungeon
    //   • Lower-rank shadows fill remaining gaps (spillover)
    //   • Multiple dungeons of the same rank share proportionally
    // This preserves high-rank shadows for high-rank dungeons.

    // Step 1: Bucket available combat-pool shadows by rank index
    const rankBuckets = new Map(); // rankIndex → [shadow, ...]
    for (const s of combatPool) {
      const id = getShadowId(s);
      if (!id || assignedIds.has(id)) continue;
      const ri = getRankIndex(s.rank);
      if (!rankBuckets.has(ri)) rankBuckets.set(ri, []);
      rankBuckets.get(ri).push(s);
    }

    // Step 2: Global deployment budget + per-dungeon rank-pair targets
    const DEPLOY_POOL_SHARE = this.clampNumber(
      Number.isFinite(this.settings?.rankAllocationDeployPoolShare)
        ? this.settings.rankAllocationDeployPoolShare
        : 0.8,
      0.05,
      1
    );
    const PREFERRED_PAIR_SHARE = this.clampNumber(
      Number.isFinite(this.settings?.rankAllocationPreferredPairShare)
        ? this.settings.rankAllocationPreferredPairShare
        : 0.85,
      0.5,
      1
    );
    const SAME_RANK_WITHIN_PAIR_SHARE = this.clampNumber(
      Number.isFinite(this.settings?.rankAllocationSameRankShare)
        ? this.settings.rankAllocationSameRankShare
        : 0.85,
      0.5,
      0.95
    );
    const MIN_DUNGEON_ASSIGNMENT = 3;
    const totalWeight = weightedDungeons.reduce((sum, d) => sum + d.weight, 0) || 1;
    const minDeployTarget = Math.min(
      combatPool.length,
      weightedDungeons.length * MIN_DUNGEON_ASSIGNMENT
    );
    const deployPoolTarget = Math.min(
      combatPool.length,
      Math.max(minDeployTarget, Math.floor(combatPool.length * DEPLOY_POOL_SHARE))
    );

    // PERF (2026-07-15): per-bucket cursor. pickFromBucket used to rescan each
    // rank bucket from index 0 on every call, so D dungeons drawing from one
    // shared rank bucket cost O(D²) skip-checks (bottom-heavy armies put ~all
    // shadows in one bucket). Buckets are consumed strongest-first and each
    // shadow lives in exactly one bucket, and reserve shadows are already
    // filtered out of combatPool — so everything before the cursor is
    // definitively consumed. The cursor advances monotonically, making the
    // whole distribution O(combatPool) instead of O(dungeons × bucket).
    const bucketCursors = new Map(); // rankIndex → next unconsumed index
    const bucketAvailable = (ri) =>
      (rankBuckets.get(ri)?.length || 0) - (bucketCursors.get(ri) || 0);
    const pickFromBucket = (ri, count) => {
      const bucket = rankBuckets.get(ri);
      const picked = [];
      if (!bucket || count <= 0) return picked;
      let i = bucketCursors.get(ri) || 0;
      for (; i < bucket.length && picked.length < count; i++) {
        const s = bucket[i];
        const id = getShadowId(s);
        if (!id || assignedIds.has(id)) continue; // defensive; within-bucket dedup is the cursor
        assignedIds.add(id);
        picked.push(s);
      }
      bucketCursors.set(ri, i); // everything up to i is consumed or skipped
      return picked;
    };

    const pickFallbackNearest = (dungeonRI, neededCount) => {
      if (neededCount <= 0) return [];
      const picked = [];
      const rankIndices = Array.from(rankBuckets.keys());
      if (rankIndices.length === 0) return picked;
      const maxRI = Math.max(...rankIndices);
      for (let distance = 1; distance <= maxRI + 1 && picked.length < neededCount; distance++) {
        const lowerRI = dungeonRI - distance;
        if (lowerRI >= 0) {
          picked.push(...pickFromBucket(lowerRI, neededCount - picked.length));
        }
        if (picked.length >= neededCount) break;
        const upperRI = dungeonRI + distance;
        if (upperRI <= maxRI) {
          picked.push(...pickFromBucket(upperRI, neededCount - picked.length));
        }
      }
      return picked;
    };

    // Allocate rank-tiered shadows to each dungeon
    let remainingDeployBudget = deployPoolTarget;
    let remainingWeight = totalWeight;
    weightedDungeons.forEach((dw, idx) => {
      const previousAssigned = this.shadowAllocations.get(dw.channelKey);
      const previousCount = Array.isArray(previousAssigned) ? previousAssigned.length : 0;
      const selected = [];
      const dungeonRI = dw.rankIndex;
      // O(1) availability via the per-bucket cursor (was an O(bucket) reduce per
      // dungeon → O(dungeons × bucket) for shared buckets).
      const sameRankAvailable = bucketAvailable(dungeonRI);
      const higherRankAvailable = bucketAvailable(dungeonRI + 1);
      const pairAvailable = sameRankAvailable + higherRankAvailable;
      const dungeonsLeft = weightedDungeons.length - idx;
      const reservedForOthers = Math.max(0, (dungeonsLeft - 1) * MIN_DUNGEON_ASSIGNMENT);
      const maxForThis = Math.max(0, remainingDeployBudget - reservedForOthers);
      const weightedShare =
        remainingWeight > 0
          ? Math.round((remainingDeployBudget * dw.weight) / remainingWeight)
          : Math.floor(remainingDeployBudget / Math.max(1, dungeonsLeft));
      const baseTargetCount = Math.max(
        0,
        Math.min(maxForThis, Math.max(MIN_DUNGEON_ASSIGNMENT, weightedShare))
      );
      const maxTargetByPair =
        PREFERRED_PAIR_SHARE > 0
          ? Math.floor(pairAvailable / PREFERRED_PAIR_SHARE)
          : baseTargetCount;
      const targetCount =
        maxTargetByPair > 0 ? Math.min(baseTargetCount, maxTargetByPair) : Math.min(baseTargetCount, MIN_DUNGEON_ASSIGNMENT);

      const pairTarget = Math.min(
        targetCount,
        Math.max(1, Math.floor(targetCount * PREFERRED_PAIR_SHARE))
      );
      const sameRankTarget = Math.floor(pairTarget * SAME_RANK_WITHIN_PAIR_SHARE);
      const higherRankTarget = Math.max(0, pairTarget - sameRankTarget);

      // Preferred composition: same-rank majority + smaller one-rank-higher supplement.
      if (sameRankTarget > 0) {
        selected.push(...pickFromBucket(dungeonRI, sameRankTarget));
      }
      if (higherRankTarget > 0) {
        selected.push(...pickFromBucket(dungeonRI + 1, higherRankTarget));
      }

      // Pair top-up: if preferred pair shortfalls, fill from same/higher before any spillover.
      if (selected.length < pairTarget) {
        selected.push(...pickFromBucket(dungeonRI, pairTarget - selected.length));
      }
      if (selected.length < pairTarget) {
        selected.push(...pickFromBucket(dungeonRI + 1, pairTarget - selected.length));
      }

      // Spillover: nearest-rank fallback only after pair target is exhausted.
      if (selected.length < targetCount) {
        selected.push(...pickFallbackNearest(dungeonRI, targetCount - selected.length));
      }

      // Normalize IDs: older shadow records sometimes use `i` instead of `id`.
      // Some combat paths require `shadow.id`, so ensure it always exists when possible.
      const normalizedAssigned = selected.map((s) => this.normalizeShadowId(s)).filter(Boolean);
      this.shadowAllocations.set(dw.channelKey, normalizedAssigned);

      // Keep dungeon-local view in sync (some paths initialize HP from `dungeon.shadowAllocation`).
      dw.dungeon.shadowAllocation = {
        shadows: normalizedAssigned,
        totalPower: normalizedAssigned.reduce((sum, s) => sum + getShadowScore(s), 0),
        updatedAt: Date.now(),
        source: 'shadowAllocations',
      };

      // DYNAMIC: Update expectedShadowCount so rebalance thresholds use live values
      // instead of the stale snapshot from dungeon creation time.
      if (dw.dungeon.boss) {
        dw.dungeon.boss.expectedShadowCount = normalizedAssigned.length;
      }
      if (normalizedAssigned.length !== previousCount) {
        // Allocation size changed; force alive-count recompute to avoid stale critical warnings.
        dw.dungeon._cachedAliveCount = null;
        dw.dungeon.criticalHPWarningShown = false;
      }

      remainingDeployBudget = Math.max(0, remainingDeployBudget - normalizedAssigned.length);
      remainingWeight = Math.max(0, remainingWeight - dw.weight);
    });

    // Allocation summary (debug-only): helps validate rank-tiered deployment decisions quickly.
    if (this.settings?.debug) {
      this._allocationSummary = new Map();
      const rankNames = this.settings.dungeonRanks || [];
      weightedDungeons.forEach((dw) => {
        const assigned = this.shadowAllocations.get(dw.channelKey) || [];
        // Build per-rank breakdown of assigned shadows
        const rankBreakdown = {};
        for (const s of assigned) {
          const r = s?.rank || 'E';
          rankBreakdown[r] = (rankBreakdown[r] || 0) + 1;
        }
        const avgRankIndex =
          assigned.reduce((sum, s) => sum + getRankIndex(s?.rank || 'E'), 0) /
          Math.max(1, assigned.length);
        this._allocationSummary.set(dw.channelKey, {
          dungeonRank: dw.dungeon.rank,
          assignedCount: assigned.length,
          avgShadowRankIndex: avgRankIndex,
          rankBreakdown,
        });
      });
      this.debugLog('ALLOCATION', 'Rank-tiered allocation summary', {
        strategy:
          `${Math.round(PREFERRED_PAIR_SHARE * 100)}% preferred pair ` +
          `(same-rank ${Math.round(SAME_RANK_WITHIN_PAIR_SHARE * 100)}% / one-rank-higher ${Math.round((1 - SAME_RANK_WITHIN_PAIR_SHARE) * 100)}%)`,
        deployPoolShare: `${Math.round(DEPLOY_POOL_SHARE * 100)}%`,
        deployPoolTarget,
        rankBucketSizes: Object.fromEntries(
          Array.from(rankBuckets.entries()).map(([ri, arr]) => [rankNames[ri] || ri, arr.length])
        ),
        dungeons: Array.from(this._allocationSummary.entries()).map(([channelKey, meta]) => ({
          channelKey,
          ...meta,
        })),
      });
    } else if (this._allocationSummary?.size) {
      this._allocationSummary.clear();
    }

    // Update cache (store only lightweight metadata to avoid retaining huge arrays)
    this.allocationCache = { count: shadowsSortedAll.length };
    this.allocationCacheTime = now;
    this._allocationDirty = false;
    this._allocationDirtyReason = null;
    // The re-split reassigned every dungeon — the deploy-time assigned-ID union
    // is now stale; force a rebuild on the next deploy.
    this._invalidateDeployAssignedUnion?.();
  },

  async startShadowAttacks(channelKey, options = {}) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (
      !dungeon ||
      dungeon.completed ||
      dungeon.failed ||
      dungeon._completing ||
      !dungeon.shadowsDeployed ||
      (dungeon.boss?.hp <= 0 && !dungeon.boss?._isSentinel)
    ) {
      this.shadowAttackIntervals.has(channelKey) && this.stopShadowAttacks(channelKey);
      return;
    }
    if (this.shadowAttackIntervals.has(channelKey)) return;
    const allowBlockingReallocation = options?.allowBlockingReallocation !== false;

    // CRITICAL: Initialize shadow HP BEFORE starting combat
    // This ensures all shadows have HP initialized before they start attacking
    let { assignedFromMap, assignedFromDungeon, assignedShadows } =
      this._getAssignedShadowsForDungeon(channelKey, dungeon);

    // Self-heal: allocation can be empty due to restore/timing. Force a one-time reallocation and retry.
    if (assignedShadows.length === 0 && allowBlockingReallocation) {
      try {
        this._markAllocationDirty('start-shadow-attacks-missing-allocation');
        await this.preSplitShadowArmy();
        assignedFromMap = this.shadowAllocations.get(channelKey) || [];
        assignedShadows = assignedFromMap.length > 0 ? assignedFromMap : assignedFromDungeon;
        assignedFromMap.length > 0 &&
          ({ assignedShadows } = this._getAssignedShadowsForDungeon(channelKey, dungeon));
      } catch (error) {
        this.errorLog('DEPLOY', 'Failed to reallocate shadows on startShadowAttacks', error);
      }
    }

    // Throttled warning for missing deployments (helps debug “no shadows deployed” reports).
    if (assignedShadows.length === 0) {
      this._deployWarnings ??= new Map();
      const last = this._deployWarnings.get(channelKey) || 0;
      const nowWarn = Date.now();
      if (nowWarn - last > 30000) {
        this._deployWarnings.set(channelKey, nowWarn);
        this.debugLog('DEPLOY', 'No shadows allocated for dungeon at startShadowAttacks', {
          channelKey,
          dungeonRank: dungeon.rank,
          bossHp: dungeon.boss?.hp,
          totalShadowsKnown: Number.isFinite(this.allocationCache?.count)
            ? this.allocationCache.count
            : undefined,
          hasShadowArmy: Boolean(this.shadowArmy),
          activeDungeons: this.activeDungeons?.size ?? 0,
        });
      }
    }
    if (assignedShadows.length > 0) {
      const wasShadowHPEmpty =
        !dungeon.shadowHP || dungeon.shadowHP.size === 0;
      const shadowHP = dungeon.shadowHP || (dungeon.shadowHP = new Map());
      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      this.maybePruneDungeonShadowState({ dungeon, channelKey, assignedShadows, deadShadows });
      const shadowsToInitialize = this._collectShadowsNeedingHPInit(assignedShadows, deadShadows);
      await this._initializeShadowHPBatch(shadowsToInitialize, shadowHP, 'before_combat');

      // Deployment verification: on first init for a dungeon, ensure all assigned shadows start at full HP.
      // (We do NOT refill to full HP on subsequent passes to avoid erasing combat damage.)
      if (wasShadowHPEmpty) {
        for (const shadow of assignedShadows) {
          const shadowId = this.getShadowIdValue(shadow);
          if (!shadowId) continue;
          const hpData = shadowHP.get(shadowId);
          if (!hpData || typeof hpData.maxHp !== 'number' || hpData.maxHp <= 0) continue;
          typeof hpData.hp === 'number' && hpData.hp < hpData.maxHp && (hpData.hp = hpData.maxHp);
        }
      }

      // Save initialized HP to dungeon
      dungeon.shadowHP = shadowHP;
    }

    // PERSONALITY-BASED INTERVALS: Use average personality interval for active dungeons
    // Active: Dynamic based on shadow personalities (average ~2000ms), Background: 15-20s
    let activeInterval = 3000; // Default fallback
    if (this.shadowArmy && dungeon) {
      // Calculate average attack interval from assigned shadows
      const assignedShadows = this.shadowAllocations.get(channelKey) || [];
      if (assignedShadows.length > 0) {
        const intervals = assignedShadows
          .map((shadow) => {
            if (this.shadowArmy.calculateShadowAttackInterval) {
              return this.shadowArmy.calculateShadowAttackInterval(shadow, 2000);
            }
            return 2000; // Default
          })
          .filter((i) => i > 0);
        if (intervals.length > 0) {
          // Use average interval (rounded to nearest 100ms for performance)
          activeInterval =
            Math.round(intervals.reduce((sum, i) => sum + i, 0) / intervals.length / 100) * 100;
          activeInterval = Math.max(1000, Math.min(5000, activeInterval)); // Clamp 1-5s
        }
      }
    }
    let backgroundInterval = 5000 + Math.random() * 2000; // 5-7s
    const isWindowVisible = this.isWindowVisible();
    if (!isWindowVisible) {
      // Window hidden - use much longer intervals (60-120s) to prevent crashes
      backgroundInterval = 60000 + Math.random() * 60000; // 60-120s (much slower)
    }
    this._lastShadowAttackTime.set(channelKey, Date.now());

    // Store cadence for global combat loop
    this._shadowActiveIntervalMs.set(channelKey, activeInterval);
    this._shadowBackgroundIntervalMs.set(channelKey, backgroundInterval);
    this.shadowAttackIntervals.set(channelKey, true);
    this.settings.debug && console.log(`[Dungeons] COMBAT_TRACE: startShadowAttacks — key=${channelKey}, shadows=${assignedShadows.length}, active=${activeInterval}ms, bg=${backgroundInterval}ms`);
    this._ensureCombatLoop();
  },

  stopShadowAttacks(channelKey) {
    this.shadowAttackIntervals.delete(channelKey);
    this._shadowActiveIntervalMs.delete(channelKey);
    this._shadowBackgroundIntervalMs.delete(channelKey);
    this.shadowAttackIntervals.size === 0 &&
      this.bossAttackTimers.size === 0 &&
      this.mobAttackTimers.size === 0 &&
      this._stopCombatLoop();
  },

  stopAllShadowAttacks() {
    this.shadowAttackIntervals.clear();
    this._shadowActiveIntervalMs.clear();
    this._shadowBackgroundIntervalMs.clear();
    this.shadowAttackIntervals.size === 0 &&
      this.bossAttackTimers.size === 0 &&
      this.mobAttackTimers.size === 0 &&
      this._stopCombatLoop();
  },

  startBossAttacks(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (
      !dungeon ||
      dungeon.completed ||
      dungeon.failed ||
      dungeon._completing ||
      !dungeon.shadowsDeployed ||
      // Demon Castle sentinel bosses start at hp:0 — don't block boss attacks
      (dungeon.boss?.hp <= 0 && !dungeon.boss?._isSentinel)
    ) {
      this.bossAttackTimers.has(channelKey) && this.stopBossAttacks(channelKey);
      return;
    }
    if (this.bossAttackTimers.has(channelKey)) return;

    // PERFORMANCE: Different intervals for active vs background dungeons
    const isWindowVisible = this.isWindowVisible();

    // Active: 1s, Background: 15-20s (randomized for variance)
    // If window is hidden, use much longer intervals to prevent crashes
    let backgroundInterval = 5000 + Math.random() * 2000; // 5-7s
    if (!isWindowVisible) {
      // Window hidden - use much longer intervals (60-120s) to prevent crashes
      backgroundInterval = 60000 + Math.random() * 60000; // 60-120s (much slower)
    }
    this._lastBossAttackTime.set(channelKey, Date.now());

    this._bossBackgroundIntervalMs.set(channelKey, backgroundInterval);
    this.bossAttackTimers.set(channelKey, true);
    this._ensureCombatLoop();
  },

  stopBossAttacks(channelKey) {
    this.bossAttackTimers.delete(channelKey);
    this._bossBackgroundIntervalMs.delete(channelKey);
    this.shadowAttackIntervals.size === 0 &&
      this.bossAttackTimers.size === 0 &&
      this.mobAttackTimers.size === 0 &&
      this._stopCombatLoop();
  },

  stopAllBossAttacks() {
    this.bossAttackTimers.clear();
    this._bossBackgroundIntervalMs.clear();
    this.shadowAttackIntervals.size === 0 &&
      this.bossAttackTimers.size === 0 &&
      this.mobAttackTimers.size === 0 &&
      this._stopCombatLoop();
  },

  startMobAttacks(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (
      !dungeon ||
      dungeon.completed ||
      dungeon.failed ||
      dungeon._completing ||
      !dungeon.shadowsDeployed ||
      (dungeon.boss?.hp <= 0 && !dungeon.boss?._isSentinel)
    ) {
      this.mobAttackTimers.has(channelKey) && this.stopMobAttacks(channelKey);
      return;
    }
    if (this.mobAttackTimers.has(channelKey)) return;

    // PERFORMANCE: Different intervals for active vs background dungeons
    const isWindowVisible = this.isWindowVisible();

    // Active: 1s, Background: 15-20s (randomized for variance)
    // If window is hidden, use much longer intervals to prevent crashes
    let backgroundInterval = 5000 + Math.random() * 2000; // 5-7s
    if (!isWindowVisible) {
      // Window hidden - use much longer intervals (60-120s) to prevent crashes
      backgroundInterval = 60000 + Math.random() * 60000; // 60-120s (much slower)
    }
    this._lastMobAttackTime.set(channelKey, Date.now());

    this._mobBackgroundIntervalMs.set(channelKey, backgroundInterval);
    this.mobAttackTimers.set(channelKey, true);
    this._ensureCombatLoop();
  },

  stopMobAttacks(channelKey) {
    this.mobAttackTimers.delete(channelKey);
    this._mobBackgroundIntervalMs.delete(channelKey);
    this.shadowAttackIntervals.size === 0 &&
      this.bossAttackTimers.size === 0 &&
      this.mobAttackTimers.size === 0 &&
      this._stopCombatLoop();
  },

  stopAllMobAttacks() {
    this.mobAttackTimers.clear();
    this._mobBackgroundIntervalMs.clear();
    this.shadowAttackIntervals.size === 0 &&
      this.bossAttackTimers.size === 0 &&
      this.mobAttackTimers.size === 0 &&
      this._stopCombatLoop();
  }
};
