module.exports = {
  _addToCorpsePile(channelKey, deadMob, isBoss = false) {
    if (!deadMob) return;
    // Store corpse pile ON the dungeon object so it persists to IDB with periodic saves.
    // No separate in-memory Map — dungeon.corpsePile survives hot-reloads.
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;
    if (!dungeon.corpsePile) dungeon.corpsePile = [];
    const baseStats = deadMob.baseStats || {};
    dungeon.corpsePile.push({
      id: deadMob.id,
      rank: deadMob.rank,
      // Keep corpse payload compact and deterministic for large kill counts.
      baseStats: {
        strength: Number(baseStats.strength) || 0,
        agility: Number(baseStats.agility) || 0,
        intelligence: Number(baseStats.intelligence) || 0,
        vitality: Number(baseStats.vitality) || 0,
        perception: Number(baseStats.perception) || 0,
      },
      strength: Number(deadMob.strength) || 0,
      isBoss,
    });
  },

  async _processCorpsePile(channelKey, dungeon, pileSnapshot = null) {
    const pile = pileSnapshot || dungeon?.corpsePile;
    if (!pile || pile.length === 0) {
      this.debugLog(
        'ARISE',
        `Corpse pile EMPTY for ${channelKey} — no enemies to extract (deployed: ${dungeon?.shadowsDeployed}, mobs killed: ${dungeon?.mobs?.killed || 0})`
      );
      return { extracted: 0, attempted: 0 };
    }

    const shadowArmy = this.shadowArmy || this.validatePluginReference('ShadowArmy', 'storageManager');
    if (!shadowArmy?.attemptDungeonExtraction) {
      this.debugLog(
        'ARISE',
        `ShadowArmy plugin not available — ${pile.length} corpses lost (${channelKey})`
      );
      return { extracted: 0, attempted: 0 };
    }

    // Shadow army cap gate: skip ALL mob extractions if already at/over cap
    // This avoids hundreds of wasted IDB reads (each attemptDungeonExtraction checks cap individually).
    // Mob extractions remain skipped until cap is below limit (e.g., player ranks up or releases shadows).
    if (typeof shadowArmy.checkShadowArmyCap === 'function') {
      try {
        const capStatus = await shadowArmy.checkShadowArmyCap();
        if (capStatus.atCap) {
          this.debugLog(
            'ARISE',
            `Skipping corpse pile extraction — shadow army at cap (${capStatus.currentCount}/${capStatus.cap}). ${pile.length} corpses discarded.`
          );
          if (dungeon) dungeon.corpsePile = [];
          return { extracted: 0, attempted: 0 };
        }
      } catch (e) {
        this.debugLog('ARISE', 'Cap pre-check failed, proceeding with extraction', e?.message);
      }
    }

    const userRank = this.soloLevelingStats?.settings?.rank || 'E';
    const userLevel = this.soloLevelingStats?.settings?.level || 1;
    const userStats = this.soloLevelingStats?.getTotalEffectiveStats?.() || {};
    const beastFamilies = dungeon?.beastFamilies || [];
    const total = pile.length;
    let extracted = 0;
    let attempted = 0;

    this.settings.debug && console.log(`[Dungeons] ⚔️ ARISE: Processing corpse pile — ${total} bodies awaiting extraction in ${channelKey}`);

    // Use ShadowArmy's streaming bulk extractor when available.
    // It keeps peak memory flat for 10k+ corpse piles.
    if (typeof shadowArmy.bulkDungeonExtraction === 'function') {
      try {
        const result = await shadowArmy.bulkDungeonExtraction(
          pile,
          userRank,
          userLevel,
          userStats,
          beastFamilies
        );
        extracted = Number(result?.extracted) || 0;
        attempted = Number(result?.attempted) || 0;
      } catch (error) {
        this.errorLog('Bulk corpse extraction failed; falling back to sequential batches', error);
      }
    }

    // Fallback path if bulk extraction is unavailable or failed.
    if (attempted === 0 && extracted === 0) {
      const BATCH_SIZE = 12; // Lower concurrency to minimize memory spikes in fallback mode
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = pile.slice(i, i + BATCH_SIZE);
        attempted += batch.length;

        const results = await Promise.allSettled(
          batch.map((corpse) =>
            shadowArmy.attemptDungeonExtraction(
              corpse.id, userRank, userLevel, userStats,
              corpse.rank, corpse.baseStats, corpse.strength,
              beastFamilies, corpse.isBoss
            )
          )
        );

        for (const r of results) {
          if (r.status === 'fulfilled' && r.value?.success) extracted++;
        }

        if (i + BATCH_SIZE < total) {
          await new Promise(r => setTimeout(r, 1));
        }
      }
    }

    // Clear the dungeon's corpse pile (already snapshotted, don't process again)
    if (dungeon) dungeon.corpsePile = [];

    this.settings.debug && console.log(`[Dungeons] ⚔️ ARISE COMPLETE: ${extracted}/${attempted} shadows extracted from corpse pile (${channelKey})`);

    // Notify ShadowArmy of batch completion (cache invalidation, UI updates)
    if (extracted > 0 && typeof BdApi?.Events?.emit === 'function') {
      BdApi.Events.emit('ShadowArmy:batchExtractionComplete', { extracted, total: attempted, channelKey });
    }

    return { extracted, attempted };
  },

  async _mobSpawnLoopTick(isVisible = true) {
    const tickStartedAt = Date.now();
    const now = tickStartedAt;
    const desiredTickMs = this._getDesiredMobSpawnTickMs(isVisible);
    if (this._mobSpawnLoopNextAt && now < this._mobSpawnLoopNextAt) {
      return;
    }
    this._mobSpawnLoopNextAt = now + desiredTickMs;
    const adaptive = this._getAdaptiveLoadState();
    const MAX_QUEUE_FLUSH_PER_TICK = adaptive.maxEma >= 300 ? 1 : 2; // lower per tick under sustained load
    const MAX_SPAWN_WAVES_PER_TICK = 1; // one wave per tick to smooth load

    try {
      // Flush queued mobs (batch append) when ready
      if (this._mobSpawnQueueNextAt && this._mobSpawnQueueNextAt.size > 0) {
        let flushes = 0;
        for (const [channelKey, nextAt] of this._mobSpawnQueueNextAt.entries()) {
          if (flushes >= MAX_QUEUE_FLUSH_PER_TICK) break;
          if (now < nextAt) continue;
          this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TICK: FLUSHING queue for ${channelKey}, queuedMobs=${this._mobSpawnQueue?.get(channelKey)?.length || 0}`);
          const queuedRemaining = this.processMobSpawnQueue(channelKey);
          if (queuedRemaining > 0) {
            const retryDelay = 500 + Math.random() * 500;
            this._mobSpawnQueueNextAt.set(channelKey, now + retryDelay);
          } else {
            this._mobSpawnQueueNextAt.delete(channelKey);
          }
          flushes++;
        }
      }

      // Trigger spawn waves when due.
      // PERF: Still spawn while hidden but at reduced rate (1 wave per tick, already throttled by delay).
      // Previously skipping entirely while hidden caused "frozen" mob counts on dungeon creation.
      if (this._mobSpawnNextAt && this._mobSpawnNextAt.size > 0) {
        let spawns = 0;
        for (const [channelKey, nextAt] of this._mobSpawnNextAt.entries()) {
          if (spawns >= MAX_SPAWN_WAVES_PER_TICK) break;
          if (now < nextAt) continue;

          const dungeon = this._getActiveDungeon(channelKey);
          if (!dungeon) {
            this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TICK: NO DUNGEON for ${channelKey} — cleaning up`);
            this._mobSpawnNextAt.delete(channelKey);
            this._mobSpawnQueueNextAt?.delete?.(channelKey);
            this._mobSpawnQueue?.delete?.(channelKey);
            continue;
          }

          // Quick alive-count pre-check — if at concurrent cap, short backoff (2.5s) to retry
          // as shadows kill mobs. No permanent stop — spawning continues until boss dies.
          const _preCheckCap = this._getMobActiveCap(dungeon);
          let _preCheckAlive = 0;
          const _pcCache = this._mobCleanupCache.get(channelKey);
          if (_pcCache && (now - _pcCache.time < 1000)) {
            _preCheckAlive = _pcCache.alive || 0;
          } else {
            const _pcMobs = dungeon.mobs?.activeMobs;
            if (_pcMobs) for (let _i = 0; _i < _pcMobs.length; _i++) _pcMobs[_i]?.hp > 0 && _preCheckAlive++;
          }
          if (_preCheckAlive >= _preCheckCap) {
            // At concurrent cap — short backoff, will retry once shadows kill mobs
            this._mobSpawnNextAt.set(channelKey, now + 2500);
            continue;
          }

          this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TICK: SPAWNING wave for ${channelKey}, boss.hp=${dungeon.boss?.hp}, activeMobs=${_preCheckAlive}/${_preCheckCap}, total=${dungeon.mobs?.total || 0}`);
          this.spawnMobs(channelKey);
          const nextDelay = this._computeNextMobSpawnDelayMs(dungeon);
          this._mobSpawnNextAt.set(channelKey, now + nextDelay);
          spawns++;
        }
      }

      const hasWork =
        (this._mobSpawnNextAt && this._mobSpawnNextAt.size > 0) ||
        (this._mobSpawnQueueNextAt && this._mobSpawnQueueNextAt.size > 0);
      !hasWork && this._stopMobSpawnLoop();
    } finally {
      this._recordPerfMetric('mobSpawnTickEmaMs', Date.now() - tickStartedAt, 0.2);
    }
  },

  async _combatLoopTick() {
    const now = Date.now();
    const isWindowVisible = this.isWindowVisible();
    const desiredTickMs = this._getDesiredCombatTickMs(isWindowVisible);
    let activeDungeonCount = this.activeDungeons?.size || 0;
    let processedDungeonCount = 0;
    let skippedDungeonCount = 0;
    if (this._combatLoopNextAt && now < this._combatLoopNextAt) {
      return;
    }
    this._combatLoopNextAt = now + desiredTickMs;
    this._combatTickCount = ((this._combatTickCount || 0) + 1) % 1000;
    const tickStartedAt = now;
    try {
      // PERF: Hoist shared computations — compute ONCE per tick, not per-dungeon × per-function
      if (isWindowVisible) {
        this.syncHPAndManaFromStats();
      }

      // Build candidate list once and drop invalid/completed dungeons before scheduling.
      activeDungeonCount = Math.max(1, this.activeDungeons.size);
      const adaptive = this._getAdaptiveLoadState();
      const combatEntries = [];
      for (const [channelKey, dungeon] of this.activeDungeons.entries()) {
        if (!dungeon || dungeon.completed || dungeon.failed || dungeon._completing) {
          this.shadowAttackIntervals.has(channelKey) && this.stopShadowAttacks(channelKey);
          this.bossAttackTimers.has(channelKey) && this.stopBossAttacks(channelKey);
          this.mobAttackTimers.has(channelKey) && this.stopMobAttacks(channelKey);
          continue;
        }
        // Combat loop only needs deployed dungeons; non-deployed entries are managed by deploy/spawn paths.
        if (!dungeon.shadowsDeployed) {
          this.shadowAttackIntervals.has(channelKey) && this.stopShadowAttacks(channelKey);
          this.bossAttackTimers.has(channelKey) && this.stopBossAttacks(channelKey);
          this.mobAttackTimers.has(channelKey) && this.stopMobAttacks(channelKey);
          continue;
        }
        combatEntries.push([channelKey, dungeon]);
      }

      const schedulableDungeonCount = combatEntries.length;
      const processingCap = this._getCombatProcessingCap(
        schedulableDungeonCount,
        adaptive,
        isWindowVisible
      );
      const { selectedEntries, skippedCount } = this._selectCombatDungeonBatch(
        combatEntries,
        processingCap
      );
      processedDungeonCount = selectedEntries.length;
      skippedDungeonCount = skippedCount;
      if (this._perfTelemetry) {
        this._perfTelemetry.lastProcessedDungeonCount = processedDungeonCount;
        this._perfTelemetry.lastSkippedDungeonCount = skippedDungeonCount;
      }

      // PERF T2-1: Global combat budget — divide fixed sample cap across dungeons so total
      // CPU stays constant regardless of dungeon count.
      const configuredShadowBudget = Number.isFinite(this.settings?.maxSimulatedShadowsPerTick) && this.settings.maxSimulatedShadowsPerTick > 0
        ? this.settings.maxSimulatedShadowsPerTick
        : 400; // Total shadow samples across ALL dungeons
      const pressureScale = activeDungeonCount >= 4 ? 0.65 : activeDungeonCount >= 2 ? 0.8 : 1;
      const visibilityScale = isWindowVisible ? 1 : 0.65;
      const adaptiveScale = this.clampNumber(adaptive?.budgetScale ?? 1, 0.5, 1);
      const globalShadowBudget = Math.max(160, Math.floor(configuredShadowBudget * pressureScale * visibilityScale * adaptiveScale));
      const globalMobBudget = Math.max(320, Math.floor(800 * pressureScale * visibilityScale * adaptiveScale));
      const budgetDivisor = Math.max(1, processedDungeonCount);
      const perDungeonShadowBudget = Math.max(20, Math.floor(globalShadowBudget / budgetDivisor));
      const perDungeonMobBudget = Math.max(50, Math.floor(globalMobBudget / budgetDivisor));

      if (
        this.settings.debug &&
        adaptive.maxEma >= 200 &&
        (!this._perfTelemetry?.lastAutotuneLogAt || now - this._perfTelemetry.lastAutotuneLogAt >= 30000)
      ) {
        this._perfTelemetry.lastAutotuneLogAt = now;
        console.log(
          `[Dungeons] PERF AUTOTUNE combatEma=${Math.round(adaptive.combatEma)}ms spawnEma=${Math.round(adaptive.spawnEma)}ms ` +
          `tick=${desiredTickMs}ms scale=${adaptiveScale.toFixed(2)} budget=${globalShadowBudget}/${globalMobBudget}`
        );
      }
      if (
        this.settings.debug &&
        skippedDungeonCount > 0 &&
        adaptive.maxEma >= 200 &&
        (!this._perfTelemetry?.lastSchedulerLogAt || now - this._perfTelemetry.lastSchedulerLogAt >= 30000)
      ) {
        this._perfTelemetry.lastSchedulerLogAt = now;
        console.log(
          `[Dungeons] PERF SCHEDULER active=${activeDungeonCount} scheduled=${processedDungeonCount}/${schedulableDungeonCount} ` +
          `skipped=${skippedDungeonCount} cap=${processingCap} ema=${Math.round(adaptive.maxEma)}ms`
        );
      }

      // PERF T1-1: Pre-ensure shadow allocations exist before parallel processing.
      // preSplitShadowArmy is expensive (IDB read + sort), so call it once here instead of
      // letting each parallel dungeon race to call it.
      const forceRefresh =
        this._allocationDirty ||
        this._isAllocationHardExpired(now) ||
        this._hasDeployedDungeonMissingAllocation();
      if (forceRefresh && processedDungeonCount > 0) {
        await this.preSplitShadowArmy();
      }

      // Per-tick lock: prevent parallel dungeons from calling preSplitShadowArmy redundantly
      this._tickAllocationLock = false;

      // BUGFIX LOGIC-1: Pre-snapshot mana to prevent race conditions during Promise.all.
      // Each dungeon gets an equal slice of the available mana pool for resurrections.
      // This prevents concurrent dungeons from both reading the same mana balance and
      // double-spending (non-atomic read-modify-write on this.settings.userMana).
      if (processedDungeonCount > 1) {
        this._tickManaPool = this.settings.userMana || 0;
        this._tickManaBudgetPerDungeon = Math.floor(this._tickManaPool / processedDungeonCount);
        this._tickManaSpent = 0;
      } else {
        this._tickManaPool = undefined;
        this._tickManaBudgetPerDungeon = undefined;
      }

      // PERF T1-1: Process dungeons in parallel — tick time = max(perDungeon) instead of sum(perDungeon).
      // Each dungeon has isolated shadow allocations, deadShadows, and dungeon state.
      // Shared state (userHP, userMana) has minor race potential but is self-correcting via
      // periodic SoloLevelingStats sync and debounced saveSettings.
      const dungeonPromises = [];
      let dungeonIndex = 0;
      for (const [channelKey, dungeon] of selectedEntries) {
        dungeonPromises.push(this._processDungeonCombatTick(
          channelKey, dungeon, now, isWindowVisible, perDungeonShadowBudget, perDungeonMobBudget, dungeonIndex
        ));
        dungeonIndex++;
      }

      if (dungeonPromises.length > 0) {
        await Promise.all(dungeonPromises);
      }

      // BUGFIX LOGIC-1: Reconcile mana after parallel dungeon processing.
      // Each dungeon tracked its own spend via dungeon._tickManaUsed (set in attemptAutoResurrection).
      // Deduct the actual total from the real mana pool in one atomic operation.
      if (this._tickManaBudgetPerDungeon !== undefined) {
        let totalManaUsed = 0;
        for (const [, dungeon] of this.activeDungeons.entries()) {
          if (dungeon._tickManaUsed > 0) {
            totalManaUsed += dungeon._tickManaUsed;
            dungeon._tickManaUsed = 0;
          }
        }
        if (totalManaUsed > 0) {
          this.settings.userMana = Math.max(0, this._tickManaPool - totalManaUsed);
          // Sync reconciled mana to SoloLevelingStats (deferred from parallel mode)
          this.pushManaToStats(false);
        }
        this._tickManaBudgetPerDungeon = undefined;
        this._tickManaPool = undefined;
      }

      // ALWAYS-ON: Periodic combat status log (every 30s) — mob kills, shadow deaths, resurrections
      if (this._combatTickCount % 30 === 0) {
        for (const [channelKey, dungeon] of this.activeDungeons.entries()) {
          if (!dungeon || dungeon.completed || dungeon.failed || !dungeon.shadowsDeployed) continue;
          const deadSet = this.deadShadows.get(channelKey);
          const permanentDeaths = deadSet?.size || 0;
          const totalRevives = dungeon.shadowRevives || 0;
          const totalDeaths = permanentDeaths + totalRevives; // Total deaths ever = still dead + successfully revived
          const assigned = this.shadowAllocations.get(channelKey)?.length || 0;
          const alive = assigned - permanentDeaths;
          this.settings.debug && console.log(
            `[Dungeons] 📊 COMBAT STATUS: ${dungeon.name} (${dungeon.rank}) | ` +
            `Mobs killed: ${dungeon.mobs?.killed || 0}/${dungeon.mobs?.targetCount || '?'} | ` +
            `Boss HP: ${dungeon.boss?.hp?.toLocaleString() || 0}/${dungeon.boss?.maxHp?.toLocaleString() || '?'} | ` +
            `Shadows: ${alive}/${assigned} alive | ` +
            `Deaths: ${totalDeaths} total (${permanentDeaths} still dead, ${totalRevives} resurrected)`
          );
        }
      }
    } finally {
      const tickEndedAt = Date.now();
      const tickMs = tickEndedAt - tickStartedAt;
      this._recordPerfMetric('combatTickEmaMs', tickMs, 0.15);
      this.flushCombatSettingsDirty?.(tickEndedAt);
      this._maybeLogPerfSpike?.({
        now: tickEndedAt,
        tickMs,
        desiredTickMs,
        activeDungeonCount,
        processedDungeonCount,
        skippedDungeonCount,
        isWindowVisible,
      });
    }
  },

  _getCombatProcessingCap(schedulableDungeonCount, adaptiveState = null, isWindowVisible = true) {
    const total = Number.isFinite(schedulableDungeonCount)
      ? Math.max(0, Math.floor(schedulableDungeonCount))
      : 0;
    if (total <= 0) return 0;
    if (total <= 3) return total;

    const maxEma = Number(adaptiveState?.maxEma) || 0;
    let cap;
    if (!isWindowVisible) cap = 4;
    else if (maxEma >= 450) cap = 4;
    else if (maxEma >= 300) cap = 6;
    else if (maxEma >= 200) cap = 8;
    else cap = 12;

    return this.clampNumber(cap, 1, total);
  },

  _selectCombatDungeonBatch(entries, cap) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return { selectedEntries: [], skippedCount: 0 };
    }
    const total = entries.length;
    const normalizedCap = this.clampNumber(Math.floor(cap || total), 1, total);
    if (total <= normalizedCap) {
      return { selectedEntries: entries, skippedCount: 0 };
    }

    const selectedEntries = [];
    const selectedKeys = new Set();
    const addEntry = (entry) => {
      if (!entry || !Array.isArray(entry) || entry.length < 2) return false;
      const channelKey = entry[0];
      if (!channelKey || selectedKeys.has(channelKey)) return false;
      selectedEntries.push(entry);
      selectedKeys.add(channelKey);
      return true;
    };

    // Prioritize user-focused dungeons first so the visible experience stays responsive.
    const priorityKeys = [
      this.settings?.userActiveDungeon || null,
      this.currentChannelKey || null,
    ].filter(Boolean);
    for (const key of priorityKeys) {
      if (selectedEntries.length >= normalizedCap) break;
      const entry = entries.find(([channelKey]) => channelKey === key);
      addEntry(entry);
    }

    // Fair round-robin fill for the remaining slots.
    let cursor = Number.isFinite(this._combatRoundRobinCursor)
      ? this._combatRoundRobinCursor
      : 0;
    cursor = ((cursor % total) + total) % total;
    let scanned = 0;
    while (selectedEntries.length < normalizedCap && scanned < total) {
      addEntry(entries[cursor]);
      cursor = (cursor + 1) % total;
      scanned++;
    }
    this._combatRoundRobinCursor = cursor;

    return { selectedEntries, skippedCount: Math.max(0, total - selectedEntries.length) };
  },

  async _processDungeonCombatTick(channelKey, dungeon, now, isWindowVisible, shadowBudget, mobBudget, dungeonIndex = 0) {
    try {
      // MANUAL DEPLOY: Skip combat entirely for dungeons where shadows haven't been deployed
      if (!dungeon.shadowsDeployed) return;

      const isActive = this.isActiveDungeon(channelKey);
      const cadenceTick = (this._combatTickCount + dungeonIndex) % 5 === 0;
      const needsDeployGuard = !dungeon._deploying && cadenceTick && dungeon.boss?.hp > 0;
      const needsUiGuard = isActive && cadenceTick;

      const hasShadowTimer = this.shadowAttackIntervals.has(channelKey);
      const shadowActiveInterval = this._shadowActiveIntervalMs.get(channelKey) || 3000;
      const shadowBackgroundInterval = this._shadowBackgroundIntervalMs.get(channelKey) || 5000;
      const shadowIntervalTime = isActive ? shadowActiveInterval : shadowBackgroundInterval;
      const shadowLastTime = hasShadowTimer ? (this._lastShadowAttackTime.get(channelKey) || now) : now;
      const shadowElapsed = now - shadowLastTime;
      const shadowDue = hasShadowTimer && shadowElapsed >= shadowIntervalTime;

      const hasBossTimer = this.bossAttackTimers.has(channelKey);
      const bossActiveInterval = 1000;
      const bossBackgroundInterval = this._bossBackgroundIntervalMs.get(channelKey) || 5000;
      const bossIntervalTime = isActive ? bossActiveInterval : bossBackgroundInterval;
      const bossLastTime = hasBossTimer ? (this._lastBossAttackTime.get(channelKey) || now) : now;
      const bossElapsed = now - bossLastTime;
      const bossDue = hasBossTimer && dungeon.boss?.hp > 0 && bossElapsed >= bossIntervalTime;

      const hasMobTimer = this.mobAttackTimers.has(channelKey);
      const mobActiveInterval = 1000;
      const mobBackgroundInterval = this._mobBackgroundIntervalMs.get(channelKey) || 5000;
      const mobIntervalTime = isActive ? mobActiveInterval : mobBackgroundInterval;
      const mobLastTime = hasMobTimer ? (this._lastMobAttackTime.get(channelKey) || now) : now;
      const mobElapsed = now - mobLastTime;
      const mobDue = hasMobTimer && mobElapsed >= mobIntervalTime;
      const statusDue = this.isCombatStatusTickDue(channelKey, now);

      // Fast path: no due attacks and no periodic maintenance work.
      const hasDots = dungeon.activeDots && Object.keys(dungeon.activeDots).length > 0;
      if (!needsDeployGuard && !needsUiGuard && !shadowDue && !bossDue && !mobDue && !statusDue && !hasDots) return;

      // React re-render guard: every 5th tick, verify injected UI is still in DOM
      if (needsUiGuard) {
        const hpBar = this.bossHPBars.get(channelKey);
        if (hpBar && !hpBar.isConnected) {
          this.bossHPBars.delete(channelKey);
          this._bossBarCache?.delete?.(channelKey);
          this.queueHPBarUpdate(channelKey);
        }
        // PERF: Check ARISE button via cached ref (was document.querySelector every 5 ticks)
        const cachedAriseBtn = this._ariseButtonRefs?.get(channelKey);
        if (cachedAriseBtn && !cachedAriseBtn.isConnected) {
          this._ariseButtonRefs.delete(channelKey);
          // Re-show if boss is still defeated
          this.defeatedBosses.has(channelKey) && this.showAriseButton(channelKey);
        }
      }

      if (needsDeployGuard) {
        const liveMobs = this._countLiveMobs(dungeon);
        const hasSpawnScheduled = this._mobSpawnNextAt.has(channelKey);
        const deployAge = dungeon.deployedAt ? (now - dungeon.deployedAt) : 0;
        if (liveMobs === 0 && !hasSpawnScheduled && deployAge > 5000) {
          this._logSpawnPipelineGuard(
            channelKey,
            `stuck deploy heal: "${dungeon.name}" deployed ${Math.floor(deployAge / 1000)}s ago with 0 mobs and no spawn schedule`
          );
          this.ensureDeployedSpawnPipeline(channelKey, 'stuck_deploy_heal');
        }
      }

      // DOT tick processing (Dagger Rush etc.)
      if (dungeon.activeDots && Object.keys(dungeon.activeDots).length > 0) {
        this._processDotTicks(channelKey, dungeon, now);
      }

      if (statusDue) {
        await this.processCombatStatusEffects(channelKey, dungeon, now);
        if (!this._getActiveDungeon(channelKey)) return;
      }

      // Shadow attacks
      if (hasShadowTimer) {
        // Periodic trace (every 10 ticks ~10s) so user can see combat is alive
        if ((this._combatTickCount + dungeonIndex) % 10 === 0) {
          const allocCount = (this.shadowAllocations.get(channelKey) || []).length;
          const mobCount = dungeon.mobs?.activeMobs?.length || 0;
          const bossHp = dungeon.boss?.hp ?? 'N/A';
          this.settings.debug && console.log(`[Dungeons] COMBAT_TRACE: Tick #${this._combatTickCount} — ch=${channelKey.slice(-8)}, shadows=${allocCount}, mobs=${mobCount}, bossHP=${bossHp}, elapsed=${shadowElapsed}ms, willFire=${shadowDue}`);
        }

        if (shadowDue) {
          const cyclesToProcess = isActive ? 1 : Math.max(1, Math.floor(shadowElapsed / shadowActiveInterval));
          const preAttackMobs = dungeon.mobs?.activeMobs?.length || 0;
          await this.processShadowAttacks(channelKey, cyclesToProcess, isWindowVisible, shadowBudget);
          const postAttackMobs = dungeon.mobs?.activeMobs?.length || 0;
          this._lastShadowAttackTime.set(channelKey, now);
          this.settings.debug && console.log(`[Dungeons] COMBAT_MOB_TRACE: ch=${channelKey.slice(-8)}, isActive=${isActive}, mobsBefore=${preAttackMobs}, mobsAfter=${postAttackMobs}, bossHP=${dungeon.boss?.hp}, elapsed=${shadowElapsed}ms`);
          isActive && this.queueHPBarUpdate(channelKey);
        }
      }

      let _tickShadowByIdMap = null;
      const getTickShadowByIdMap = () => {
        if (_tickShadowByIdMap) return _tickShadowByIdMap;
        const tickAssigned = this.shadowAllocations.get(channelKey);
        if (!tickAssigned || tickAssigned.length === 0) return null;
        _tickShadowByIdMap = new Map(tickAssigned.map((s) => [this.getShadowIdValue(s), s]));
        return _tickShadowByIdMap;
      };

      // Boss attacks
      if (bossDue) {
        const cyclesToProcess = isActive ? 1 : Math.max(1, Math.floor(bossElapsed / bossActiveInterval));
        await this.processBossAttacks(
          channelKey,
          cyclesToProcess,
          isWindowVisible,
          getTickShadowByIdMap()
        );
        this._lastBossAttackTime.set(channelKey, now);
      }

      // Mob attacks
      if (mobDue) {
        const cyclesToProcess = isActive ? 1 : Math.max(1, Math.floor(mobElapsed / mobActiveInterval));
        await this.processMobAttacks(
          channelKey,
          cyclesToProcess,
          isWindowVisible,
          mobBudget,
          getTickShadowByIdMap()
        );
        this._lastMobAttackTime.set(channelKey, now);
      }
    } catch (error) {
      this.errorLog('CRITICAL', 'Error in parallel dungeon combat tick', { channelKey, error });
    }
  },

  errorLog(...args) {
    const first = args[0];
    const isBooleanForce = typeof first === 'boolean';
    const tag = !isBooleanForce && typeof first === 'string' && args.length > 1 ? first : null;
    const force = isBooleanForce ? first : tag === 'CRITICAL';
    const payload = isBooleanForce ? args.slice(1) : tag ? args.slice(1) : args;

    // Only log when forced or in debug mode (prevents console/Sentry spam).
    if (!force && !this.settings?.debug) return;

    // Throttle repeated errors.
    const now = Date.now();
    const throttleMs = 30000;
    this._errorLogLastAt || (this._errorLogLastAt = new Map());
    const keyHead = String(payload?.[0] ?? 'UNKNOWN');
    const key = tag ? `TAG:${tag}:${keyHead}` : `MSG:${keyHead}`;
    const lastAt = this._errorLogLastAt.get(key) || 0;
    const shouldLog = force || now - lastAt >= throttleMs;
    if (!shouldLog) return;

    this._errorLogLastAt.set(key, now);
    const prefix = tag ? `[Dungeons][${tag}]` : '[Dungeons]';
    console.error(prefix, ...payload);
  }
};
