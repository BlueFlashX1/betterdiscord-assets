module.exports = {
  syncHPFromStats() {
    if (!this.soloLevelingStats?.settings) return false;
    if (
      typeof this.soloLevelingStats.settings.userHP === 'number' &&
      !isNaN(this.soloLevelingStats.settings.userHP)
    ) {
      this.settings.userHP = this.soloLevelingStats.settings.userHP;
      this.settings.userMaxHP = this.soloLevelingStats.settings.userMaxHP;
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
      this.settings.userMaxMana = this.soloLevelingStats.settings.userMaxMana;
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
    const minReusablePool = this.clampNumber(
      Number.isFinite(targetCount) ? Math.floor(targetCount) : this._deployStarterShadowCap || 240,
      24,
      2000
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
      const desiredCount = this.clampNumber(
        Math.max(
          200,
          Math.floor((Number.isFinite(targetCount) ? targetCount : this._deployStarterShadowCap || 240) * 4)
        ),
        200,
        8000
      );
      const hardLimit = this.clampNumber(
        Math.max(desiredCount, Number.isFinite(sampleLimit) ? Math.floor(sampleLimit) : 2000),
        200,
        10000
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
          const rank = rankOrder[rankIdx];
          const rows = await shadowStorage.getShadows({ rank }, 0, perRankLimit);
          pushCandidates(rows);
          rankQueryCount++;
          if (rankQueryCount % 2 === 0) {
            await this._yieldToEventLoop();
            if (!this.started) return 0;
          }
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

    this._setTrackedTimeout(() => {
      Promise.resolve()
        .then(async () => {
          const warmedPoolCount = await this._warmDeployStarterPool({
            dungeonRank: dungeonRank || null,
            targetCount: this._deployStarterShadowCap || 240,
            sampleLimit: Math.max(1200, Math.floor((this._deployStarterShadowCap || 240) * 8)),
            forceRefresh,
          });

          this.settings.debug && this.debugLog('DEPLOY', 'Spawn rank warmup completed', {
            channelKey,
            dungeonRank: dungeonRank || null,
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
    const starterCapSetting = Number(this.settings?.deployStarterShadowCap);
    const starterCap = this.clampNumber(
      Number.isFinite(starterCapSetting) && starterCapSetting > 0
        ? Math.floor(starterCapSetting)
        : this._deployStarterShadowCap,
      24,
      2000
    );

    const deployedDungeonCount = Math.max(
      1,
      Array.from(this.activeDungeons.values()).filter(
        (d) => d && !d.completed && !d.failed && d.shadowsDeployed
      ).length
    );
    const knownShadowCount = Number.isFinite(this.allocationCache?.count)
      ? Math.max(0, Math.floor(this.allocationCache.count))
      : 0;
    const fairShare = knownShadowCount > 0 ? Math.floor(knownShadowCount / deployedDungeonCount) : starterCap;
    const targetCount = this.clampNumber(fairShare || starterCap, 24, starterCap);

    const usedIds = new Set();
    for (const [otherKey, assigned] of this.shadowAllocations.entries()) {
      if (otherKey === channelKey || !Array.isArray(assigned) || assigned.length === 0) continue;
      const otherDungeon = this._getActiveDungeon(otherKey);
      if (
        !otherDungeon ||
        !otherDungeon.shadowsDeployed ||
        otherDungeon._completing ||
        (otherDungeon.boss?.hp || 0) <= 0
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

    // Pass 1: rank-adjacent shadows for fast combat fit.
    const preferredRankDistance = 2;
    for (let i = 0; i < candidatePool.length && picked.length < targetCount; i++) {
      const normalized = normalizeCandidateShadow(candidatePool[i]);
      if (!normalized) continue;
      const rankDistance = Math.abs(
        this.getRankIndexValue(normalized.rank || 'E') - dungeonRankIndex
      );
      if (rankDistance > preferredRankDistance) continue;
      const accepted = tryPickShadow(normalized);
      accepted && picked.push(accepted);
    }

    // Pass 2: fallback to any remaining available shadows.
    if (picked.length < targetCount) {
      for (let i = 0; i < candidatePool.length && picked.length < targetCount; i++) {
        const accepted = tryPickShadow(candidatePool[i]);
        accepted && picked.push(accepted);
      }
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
          if (!dungeon || !dungeon.shadowsDeployed || dungeon.boss?.hp <= 0) return;

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
        !isValidHpData &&
          this.debugLogOnce(`SHADOW_HP_INIT_INVALID:${shadowId}`, 'SHADOW_HP', {
              shadowId,
              hpData,
              context,
            });
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
