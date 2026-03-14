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

  _normalizeShadowIds(ids = []) {
    return Array.from(
      new Set(
        (Array.isArray(ids) ? ids : [])
          .map((id) => (id === null || id === undefined ? '' : String(id).trim()))
          .filter(Boolean)
      )
    );
  },

  async _fetchDungeonShadowsByIds(ids) {
    const uniqueIds = this._normalizeShadowIds(ids);
    if (uniqueIds.length === 0 || !this.shadowArmy) return [];

    const shadowStorage = this.shadowArmy.storageManager;
    let shadows = [];

    if (shadowStorage?.getShadowsByIds) {
      shadows = await shadowStorage.getShadowsByIds(uniqueIds);
    } else {
      const allShadows = await this.getAllShadows();
      const idSet = new Set(uniqueIds);
      shadows = allShadows.filter((shadow) => {
        const sid = this.getShadowIdValue(shadow);
        return sid && idSet.has(String(sid));
      });
    }

    if (this.shadowArmy.getShadowData && shadows.length > 0) {
      shadows = shadows.map((raw) => this.shadowArmy.getShadowData(raw));
    }
    return shadows;
  },

  _queueDeferredDungeonXpPostProcess({
    channelKey,
    dungeonName,
    dungeonRank,
    xpTargetIds,
    beforeStatesEntries,
    combatHours,
    growthHoursByShadowId,
    postXpShadows,
  }) {
    const uniqueIds = this._normalizeShadowIds(xpTargetIds);
    if (uniqueIds.length === 0) return false;

    const taskKey = `${channelKey}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    this._pendingDungeonXpPostProcess.set(taskKey, {
      channelKey,
      dungeonName,
      dungeonRank,
      queuedAt: Date.now(),
      targets: uniqueIds.length,
    });

    this._setTrackedTimeout(() => {
      if (!this.started) {
        this._pendingDungeonXpPostProcess.delete(taskKey);
        return;
      }
      this._runDeferredDungeonXpPostProcess({
        taskKey,
        channelKey,
        dungeonName,
        dungeonRank,
        xpTargetIds: uniqueIds,
        beforeStatesEntries,
        combatHours,
        growthHoursByShadowId,
        postXpShadows,
      }).catch((error) => {
        this.errorLog('Deferred dungeon shadow XP post-processing failed', error);
        try { this.showToast('Shadow XP post-processing failed — XP may be incomplete.', 'error'); } catch (_) {}
      });
    }, 0);

    return true;
  },

  async _runDeferredDungeonXpPostProcess({
    taskKey,
    channelKey,
    dungeonName,
    dungeonRank,
    xpTargetIds,
    beforeStatesEntries,
    combatHours,
    growthHoursByShadowId,
    postXpShadows,
  }) {
    const startMs = Date.now();
    const beforeStates = new Map(beforeStatesEntries || []);
    const shadowStorage = this.shadowArmy?.storageManager;

    try {
      // Build post-XP shadow map: prefer in-memory data from grantShadowXP,
      // fall back to IDB fetch only when postXpShadows is empty/missing
      let updatedMap = new Map();
      const usingPostXpCache = Array.isArray(postXpShadows) && postXpShadows.length > 0;

      if (usingPostXpCache) {
        // Use in-memory post-XP shadows — no IDB read needed
        for (const shadow of postXpShadows) {
          const sid = String(this.getShadowIdValue(shadow) || '');
          if (sid && beforeStates.has(sid)) {
            updatedMap.set(sid, shadow);
          }
        }
        this.settings.debug && console.log(
          `[Dungeons] ⚡ POST-XP CACHE HIT: ${updatedMap.size}/${xpTargetIds.length} shadows from grantShadowXP (skipped IDB fetch)`
        );
      } else {
        // Fallback: re-fetch from IDB (postXpShadows missing or partial failure)
        const updatedShadows = await this._fetchDungeonShadowsByIds(xpTargetIds);
        for (const shadow of updatedShadows) {
          const sid = String(this.getShadowIdValue(shadow) || '');
          if (sid && beforeStates.has(sid)) {
            updatedMap.set(sid, shadow);
          }
        }
        this.settings.debug && console.log(
          `[Dungeons] 📦 POST-XP FALLBACK: fetched ${updatedMap.size}/${xpTargetIds.length} shadows from IDB` +
          (Array.isArray(postXpShadows) ? ` (postXpShadows was empty)` : ' (no postXpShadows)')
        );
      }

      const leveledUpShadows = [];
      const rankedUpShadows = [];
      for (const [sid, before] of beforeStates.entries()) {
        const shadow = updatedMap.get(sid);
        if (!shadow) continue;

        const levelAfter = shadow.level || 1;
        if (levelAfter > before.level) {
          leveledUpShadows.push({
            name: shadow.roleName || shadow.role || shadow.name || before.name || 'Shadow',
            levelBefore: before.level,
            levelAfter,
          });
        }

        const rankAfter = shadow.rank;
        if (rankAfter && rankAfter !== before.rank) {
          rankedUpShadows.push({
            name: shadow.roleName || shadow.role || shadow.name || before.name || 'Shadow',
            oldRank: before.rank,
            newRank: rankAfter,
          });
        }
      }

      let growthSaved = 0;
      if (this.shadowArmy?.applyNaturalGrowth && combatHours > 0 && updatedMap.size > 0) {
        const growthUpdates = [];
        for (const [sid, shadow] of updatedMap.entries()) {
          const requestedHours = Number(growthHoursByShadowId?.[sid]);
          const shadowCombatHours = Number.isFinite(requestedHours)
            ? Math.max(0, requestedHours)
            : combatHours;
          if (shadowCombatHours <= 0) continue;

          const growthApplied = this.shadowArmy.applyNaturalGrowth(shadow, shadowCombatHours);
          if (!growthApplied || !shadowStorage) continue;

          // Natural growth can push a shadow over promotion thresholds.
          if (typeof this.shadowArmy.attemptAutoRankUp === 'function') {
            const growthRankUp = this.shadowArmy.attemptAutoRankUp(shadow);
            if (growthRankUp?.success) {
              rankedUpShadows.push({
                name: shadow.roleName || shadow.role || shadow.name || beforeStates.get(sid)?.name || 'Shadow',
                oldRank: growthRankUp.oldRank,
                newRank: growthRankUp.newRank,
              });
            }
          }

          // Fast path: postXpShadows already prepped by grantShadowXP pipeline;
          // applyNaturalGrowth + attemptAutoRankUp mutate in-place and recalculate strength.
          // Fallback path: raw IDB records may be compressed — must go through full prep.
          const prepared = usingPostXpCache
            ? shadow
            : (this.shadowArmy.prepareShadowForSave?.(shadow) ?? shadow);
          prepared && growthUpdates.push(prepared);
        }

        if (growthUpdates.length > 0 && shadowStorage) {
          // Prefer single-transaction updateShadowsBatch for typical dungeon sizes (≤50).
          // Updates recentCache (fixes cache coherence) and avoids multi-txn overhead.
          // Fall back to chunked writes for large batches to avoid blocking IDB.
          if (growthUpdates.length <= 50 && typeof shadowStorage.updateShadowsBatch === 'function') {
            await shadowStorage.updateShadowsBatch(growthUpdates);
          } else if (typeof shadowStorage.saveShadowsChunked === 'function') {
            await shadowStorage.saveShadowsChunked(growthUpdates, 10);
          } else {
            await Promise.all(growthUpdates.map((shadow) => shadowStorage.saveShadow(shadow)));
          }
          growthSaved = growthUpdates.length;
        }
      }

      const hasStatChanges =
        leveledUpShadows.length > 0 || rankedUpShadows.length > 0 || growthSaved > 0;
      if (hasStatChanges) {
        this.invalidateShadowsCache();
        this.shadowArmy?.getTotalShadowPower?.(true).catch((error) => {
          this.errorLog?.(true, 'Failed to refresh ShadowArmy total power after dungeon XP post-process', {
            channelKey,
            error,
          });
        });
      }

      const elapsedMs = Date.now() - startMs;
      this.settings.debug && console.log(
        `[Dungeons] ⏱️ SHADOW XP POST: "${dungeonName || channelKey}" [${dungeonRank || '?'}] | ` +
        `targets=${xpTargetIds.length} | leveled=${leveledUpShadows.length} | ranked=${rankedUpShadows.length} | ` +
        `growthSaved=${growthSaved} | ${elapsedMs}ms`
      );

      if (leveledUpShadows.length > 0) {
        this.showToast(`${leveledUpShadows.length} shadows leveled up after dungeon XP`, 'success');
      }
      if (rankedUpShadows.length > 0) {
        this.showToast(`${rankedUpShadows.length} shadows ranked up after dungeon XP`, 'success');
      }
    } finally {
      this._pendingDungeonXpPostProcess.delete(taskKey);
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

  async preSplitShadowArmy(forceRecalculate = false) {
    const now = Date.now();
    const cacheFresh =
      this.allocationCacheTime && now - this.allocationCacheTime < this.allocationCacheTTL;

    // Check cache validity unless forced/dirty
    if (!forceRecalculate && !this._allocationDirty && cacheFresh) {
      return; // Cache still valid
    }

    // Get active dungeons — ONLY those where shadows are deployed (manual deploy)
    const activeDungeonsList = Array.from(this.activeDungeons.values()).filter(
      (d) => !d.completed && !d.failed && d.boss.hp > 0 && d.shadowsDeployed
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
    if (this.shadowArmy && typeof this.shadowArmy.getShadowArmyCap === 'function') {
      const soloData = this.shadowArmy.getSoloLevelingData?.();
      const playerRank = soloData?.rank || 'E';
      const intelligence = soloData?.stats?.intelligence || 0;
      const cap = this.shadowArmy.getShadowArmyCap(playerRank, intelligence);
      if (Number.isFinite(cap) && shadowsSorted.length > cap) {
        const benched = shadowsSorted.length - cap;
        this.debugLog('ALLOCATION', `Shadow army over capacity: deploying ${cap}/${shadowsSorted.length} (${benched} benched)`, {
          playerRank, intelligence, cap, total: shadowsSorted.length, benched,
        });
        // shadowsSorted is already strongest-first — take the top `cap` shadows
        shadowsSorted = shadowsSorted.slice(0, cap);
      }
    }

    // Reserve pool: hold back weakest shadows for ShadowSenses deployment.
    // Base 10% reserve, reduced to 5% if all active dungeons are A-rank or above.
    const aRankIndex = getRankIndex('A');
    const allHighRank = activeDungeonsList.every(d => getRankIndex(d.rank) >= aRankIndex);
    const reservePercent = allHighRank ? 0.05 : 0.10;
    const reserveCount = Math.max(1, Math.floor(shadowsSorted.length * reservePercent));

    // Reserve = weakest shadows (end of the sorted array, since sorted strongest-first)
    // Normalize reserve shadows so ShadowSenses can match by .id (compressed shadows only have .i)
    const reserveShadows = shadowsSorted.slice(-reserveCount)
      .map(s => this.normalizeShadowId(s) || s);
    const reserveIds = new Set(
      reserveShadows
        .map((s) => getShadowId(s))
        .filter(Boolean)
    );
    const combatPool = shadowsSorted.filter(s => !reserveIds.has(getShadowId(s)));

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

    const pickFromBucket = (bucket, count) => {
      // Pick strongest-first (bucket inherits combatPool sort order: strongest first)
      const picked = [];
      for (let i = 0; i < bucket.length && picked.length < count; i++) {
        const s = bucket[i];
        const id = getShadowId(s);
        if (!id || assignedIds.has(id)) continue;
        assignedIds.add(id);
        picked.push(s);
      }
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
          picked.push(...pickFromBucket(rankBuckets.get(lowerRI) || [], neededCount - picked.length));
        }
        if (picked.length >= neededCount) break;
        const upperRI = dungeonRI + distance;
        if (upperRI <= maxRI) {
          picked.push(...pickFromBucket(rankBuckets.get(upperRI) || [], neededCount - picked.length));
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
      const sameRankBucket = rankBuckets.get(dungeonRI) || [];
      const higherBucket = rankBuckets.get(dungeonRI + 1) || [];
      const sameRankAvailable = sameRankBucket.reduce(
        (count, shadow) => count + (assignedIds.has(getShadowId(shadow)) ? 0 : 1),
        0
      );
      const higherRankAvailable = higherBucket.reduce(
        (count, shadow) => count + (assignedIds.has(getShadowId(shadow)) ? 0 : 1),
        0
      );
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
        selected.push(...pickFromBucket(sameRankBucket, sameRankTarget));
      }
      if (higherRankTarget > 0) {
        selected.push(...pickFromBucket(higherBucket, higherRankTarget));
      }

      // Pair top-up: if preferred pair shortfalls, fill from same/higher before any spillover.
      if (selected.length < pairTarget) {
        selected.push(...pickFromBucket(sameRankBucket, pairTarget - selected.length));
      }
      if (selected.length < pairTarget) {
        selected.push(...pickFromBucket(higherBucket, pairTarget - selected.length));
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
  },

  async startShadowAttacks(channelKey, options = {}) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (
      !dungeon ||
      dungeon.completed ||
      dungeon.failed ||
      dungeon._completing ||
      !dungeon.shadowsDeployed ||
      dungeon.boss?.hp <= 0
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
      dungeon.boss?.hp <= 0
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
      dungeon.boss?.hp <= 0
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
