module.exports = {
  async start() {
    if (this.started) {
      await this.stop();
    }

    // Set plugin running state
    this.started = true;

    // Reset observer start time when plugin starts
    this.observerStartTime = Date.now();

    // Initialize UnifiedSaveManager FIRST (IndexedDB) — must be ready before loadSettings
    if (this.saveManager) {
      try {
        await this.saveManager.init();
        this.debugLog('START', 'UnifiedSaveManager initialized (IndexedDB)');
      } catch (error) {
        this.errorLog('START', 'Failed to initialize UnifiedSaveManager', error);
        this.saveManager = null; // Fallback to BdApi.Data
      }
    }

    // Load settings ONCE (uses IndexedDB if available, fallback to BdApi.Data)
    await this.loadSettings();

    // Build O(1) lookup tables for rank-based values (resurrection costs, mob stats, boss HP)
    this._buildRankLookupTables();

    // NOTE: Testing spawn override removed — spawn chance now respects user settings
    // To test with 100% spawn, set spawnChance in plugin settings manually

    // Inject CSS using BdApi.DOM.addStyle (official API, persistent)
    this.injectCSS();
    this.installDelegatedUiHandlers();

    this.loadPluginReferences();
    await this.initStorage();

    // Recalculate mana pool on startup (in case shadow army grew while plugin was off)
    this._recalculateManaTimeout = this._setTrackedTimeout(async () => {
      await this.recalculateUserMana();
    }, 2000);

    // Retry loading plugin references (especially for toasts plugin)
    this._setTrackedTimeout(() => {
      if (!this.toasts) {
        this.loadPluginReferences();
      }
    }, 1000);

    this._setTrackedTimeout(() => {
      if (!this.toasts) {
        this.loadPluginReferences();
      }
    }, 3000);

    this.startMessageObserver();
    this.startDungeonCleanupLoop();

    // Restore AFTER storage + saveManager + settings are all ready
    await this.restoreActiveDungeons();

    // Validate active dungeon status after restoration
    this.validateActiveDungeonStatus();

    this.setupChannelWatcher();

    // PERF: Pre-warm shadow cache in background so first deploy is instant (~<50ms)
    // instead of paying cold-cache IDB penalty (~2-5s). Runs after ShadowArmy ref
    // and IDB are ready. Fire-and-forget — failure falls back to current behavior.
    this._setTrackedTimeout(() => {
      this._preWarmShadowCache().catch(() => {});
    }, 3000);

    // Start window visibility tracking for performance optimization
    this.startVisibilityTracking();

    // Start HP bar restoration loop (checks every 2 seconds for missing HP bars)
    this.startHPBarRestoration();

    // Start HP/Mana regeneration loop (every 1 second)
    this.startRegeneration();

    // PERF: 10s status validation interval removed — validation is event-driven
    // (called in selectDungeon, deployStarterAllocation, channel watcher, etc.)

    // GARBAGE COLLECTION: Periodic cleanup every 5 minutes
    this.gcInterval = setInterval(() => {
      this.triggerGarbageCollection('periodic');
    }, 300000); // 5 minutes
    this._intervals.add(this.gcInterval);

    // PERF: Event-driven plugin re-validation (replaces old 30s polling interval)
    this._pluginToggleHandler = () => {
      if (this._cache) {
        this._cache.pluginInstances = {};
        this._cache.pluginInstancesTime = {};
      }
      // Re-acquire plugin references on toggle (was previously polled every 30s)
      if (!this.soloLevelingStats?.settings) {
        this.soloLevelingStats = this.validatePluginReference('SoloLevelingStats', 'settings');
      }
      if (!BdApi.Plugins.isEnabled('ShadowArmy')) {
        this.shadowArmy = null;
        return;
      }
      const saPlugin = BdApi.Plugins.get('ShadowArmy');
      const saInstance = saPlugin?.instance;
      if (!this.shadowArmy || (saInstance && this.shadowArmy !== saInstance)) {
        this.shadowArmy = this.validatePluginReference('ShadowArmy', 'storageManager');
        if (this.shadowArmy) {
          this.invalidateShadowCountCache();
          this.invalidateShadowsCache();
        }
      }
    };
    if (typeof BdApi?.Events?.on === 'function') {
      BdApi.Events.on('plugin-loaded', this._pluginToggleHandler);
      BdApi.Events.on('plugin-unloaded', this._pluginToggleHandler);
    }
  },

  async stop() {
    this.started = false;
    this.removeDelegatedUiHandlers();

    this._stopRuntimePipelines();
    this._clearStopCachesAndState();
    this._cleanupUiAndStyleStateOnStop();
    this._cleanupTrackedResourcesOnStop();
    await this._flushPendingMobWritesOnStop();
  },

  _stopRuntimePipelines() {
    // Stop HP/Mana regeneration
    this.stopRegeneration();

    if (this._recalculateManaTimeout) {
      clearTimeout(this._recalculateManaTimeout);
      this._timeouts.delete(this._recalculateManaTimeout);
      this._recalculateManaTimeout = null;
    }

    this.stopMessageObserver();
    this.stopAllShadowAttacks();
    this.stopAllBossAttacks();
    this.stopAllMobAttacks();
    this._stopCombatLoop();
    this.stopAllDungeonCleanup();
    // Corpse pile lives on dungeon objects (persisted to IDB) — no separate cleanup needed.
    this.removeAllIndicators();
    this.removeAllBossHPBars();

    // RELEASE ALL CHANNEL LOCKS: Plugin stopping - free all channels
    if (this.channelLocks) {
      this.debugLog(`Releasing ${this.channelLocks.size} channel locks on plugin stop`);
      this.channelLocks.clear();
    }

    // Stop all tracked intervals (centralized cleanup)
    this._intervals.forEach((intervalId) => clearInterval(intervalId));
    this._intervals.clear();

    // PERF-6: Cancel orphaned rAF from scheduleBossBarLayout
    if (this._bossBarLayoutFrame) {
      cancelAnimationFrame(this._bossBarLayoutFrame);
      this._bossBarLayoutFrame = null;
    }

    // Stop HP bar restoration
    this.stopHPBarRestoration();

    // Stop window visibility tracking
    this.stopVisibilityTracking();
  },

  _clearStopCachesAndState() {
    // Clear all caches
    if (this._cache) {
      this._cache.pluginInstances = {};
      this._cache.pluginInstancesTime = {};
      this._cache.userEffectiveStats = null;
      this._cache.userEffectiveStatsTime = 0;
    }

    // Stop garbage collection interval (also tracked in _intervals, but clear reference)
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }

    // Clear extraction systems
    if (this.shadowArmyCountCache) {
      this.shadowArmyCountCache.clear();
    }

    // Clear mob capacity warning tracking
    if (this._mobCapWarningShown) {
      this._mobCapWarningShown = {};
    }

    this.invalidateShadowCountCache();
    this.invalidateShadowsCache();
    if (this._shadowStatsCache) this._shadowStatsCache.clear();
    // Boss stats rolled fresh per instance (no cache to clear)
    if (this._personalityCache) this._personalityCache.clear();
    if (this._memberWidthCache) this._memberWidthCache.clear();
    if (this._containerCache) this._containerCache.clear();
    if (this._mobSpawnQueue) this._mobSpawnQueue.clear();
    if (this.cache) this.cache.clear();
    if (this.extractionEvents) this.extractionEvents.clear();
    if (this._mobGenerationCache) this._mobGenerationCache.clear();

    // Remove plugin toggle event listeners
    if (this._pluginToggleHandler) {
      if (typeof BdApi?.Events?.off === 'function') {
        BdApi.Events.off('plugin-loaded', this._pluginToggleHandler);
        BdApi.Events.off('plugin-unloaded', this._pluginToggleHandler);
      }
      this._pluginToggleHandler = null;
    }

    // Remove shadow extraction event listeners
    if (this._shadowExtractedListener) {
      if (typeof BdApi?.Events?.off === 'function') {
        BdApi.Events.off('ShadowArmy:shadowExtracted', this._shadowExtractedListener);
      }
      if (typeof document.removeEventListener === 'function') {
        document.removeEventListener('shadowExtracted', this._shadowExtractedListener);
      }
      this._shadowExtractedListener = null;
    }

    // Clear combat/deployment tracking state
    if (this.deadShadows) this.deadShadows.clear();
    if (this._roleCombatStates) this._roleCombatStates.clear();
    if (this.defeatedBosses) this.defeatedBosses.clear();
    if (this.shadowAllocations) this.shadowAllocations.clear();
    if (this._pendingDungeonMobXPByBatch) this._pendingDungeonMobXPByBatch.clear();
    if (this._pendingDungeonMobKillsByBatch) this._pendingDungeonMobKillsByBatch.clear();
    if (this._deployRebalanceInFlight) this._deployRebalanceInFlight.clear();
    if (this._mobContributionMissLogState) this._mobContributionMissLogState.clear();

    this.allocationCache = null;
    this.allocationCacheTime = null;
    this._allocationSortedShadowsCache = null;
    this._allocationSortedShadowsCacheTime = null;
    this._allocationScoreCache = null;
    this._deployStarterPoolCache = null;
    this._deployStarterPoolCacheTime = null;
    this._deployStarterPoolCacheRank = null;
    this._deployStarterWarmInFlight = null;
    this._allocationDirty = true;
    this._allocationDirtyReason = 'stop';
    this._allocationShadowSetDirty = true;
    this._restoringDungeons = false; // Allow restore on next start()

    if (this._lastShadowAttackTime) this._lastShadowAttackTime.clear();
    if (this._lastBossAttackTime) this._lastBossAttackTime.clear();
    if (this._lastMobAttackTime) this._lastMobAttackTime.clear();

    if (this._dungeonSaveTimers) {
      this._dungeonSaveTimers.forEach((timerId) => clearTimeout(timerId));
      this._dungeonSaveTimers.clear();
    }

    // Corpse pile persists on dungeon objects in IDB — intentionally NOT cleared on stop.
    if (this._guildChannelCache) this._guildChannelCache.clear();
    if (this._spawnableChannelCache) this._spawnableChannelCache.clear();
    if (this.processedMessageIds) this.processedMessageIds.clear();

    // Clear saveSettings debounce timer (flush happens below via saveSettings(true))
    if (this._saveSettingsTimer) {
      this._timeouts.delete(this._saveSettingsTimer);
      clearTimeout(this._saveSettingsTimer);
      this._saveSettingsTimer = null;
    }

    // Restore all hidden comments
    this.hiddenComments.forEach((_, channelKey) => {
      this.showChannelHeaderComments(channelKey);
    });
    this.hiddenComments.clear();

    this.stopChannelWatcher?.();
    this.currentChannelKey = null;

    // Clear HP bar update queue
    if (this._hpBarUpdateQueue) this._hpBarUpdateQueue.clear();
    if (this._hpBarUpdateTimer) {
      this._timeouts.delete(this._hpBarUpdateTimer);
      clearTimeout(this._hpBarUpdateTimer);
      this._hpBarUpdateTimer = null;
    }
    this._hpBarUpdateScheduled = false;
    this._lastHPBarUpdate = {};
    this._settingsLayerOpenCache = null;
  },

  _cleanupUiAndStyleStateOnStop() {
    // Remove injected CSS (cleanup all tracked styles)
    this.cleanupAllCSS();

    // Flush pending debounced save immediately on shutdown
    this.saveSettings(true);
  },

  _cleanupTrackedResourcesOnStop() {
    // CENTRALIZED CLEANUP: Remove all tracked resources to prevent memory leaks
    // Remove all event listeners (handles both Set<handler> and {target,event,handler,capture} shapes)
    this._listeners.forEach((value, key) => {
      if (value instanceof Set) {
        // Set<handler> shape (e.g., popstate handlers)
        value.forEach((handler) => {
          if (key === 'popstate') {
            window.removeEventListener(key, handler);
          } else {
            document.removeEventListener(key, handler);
          }
        });
      } else if (value && typeof value === 'object' && value.handler) {
        // Object shape { target, event, handler, capture }
        const target = value.target || document;
        target.removeEventListener(value.event || key, value.handler, !!value.capture);
      }
    });
    this._listeners.clear();

    // Disconnect all observers
    this._observers.forEach((observer) => observer.disconnect());
    this._observers.clear();

    // Clear all timeouts
    this._timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._timeouts.clear();

    // Legacy cleanup (for compatibility)
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
      this._popstateHandler = null;
    }
    if (this._onStatsChangedUnsubscribe && typeof this._onStatsChangedUnsubscribe === 'function') {
      this._onStatsChangedUnsubscribe();
      this._onStatsChangedUnsubscribe = null;
    }
    // _restoreLocalAgentLogs removed (Sprint 3) — window.fetch no longer monkey-patched
  },

  async _flushPendingMobWritesOnStop() {
    // Flush any pending mob writes before fully stopping
    if (!this.mobBossStorageManager?.flushAll) return;
    try {
      await this.mobBossStorageManager.flushAll('plugin-stop');
    } catch (error) {
      this.errorLog('Failed to flush pending mobs on stop', error);
    }
  }
};
