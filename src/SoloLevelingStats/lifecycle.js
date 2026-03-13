const buildChatUIComponents = require('./components');
const dc = require('../shared/discord-classes');

module.exports = {
  _loadSLUtils() {
    this._SLUtils = this._SLUtils || window.SoloLevelingUtils || null;
  },

  async start() {
    let bootstrapSettingsChanged = false;
    try {
      if (this._isRunning) {
        this.stop();
      }
      this.debugLog('START', 'Plugin starting...');

      // Record plugin start time to prevent processing old messages
      this.pluginStartTime = Date.now();
      this._isRunning = true;
      this._loadSLUtils();

      // Init React components factory (v3.0.0)
      this._chatUIComponents = buildChatUIComponents(this);

      this.debugLog('START', 'Plugin start time recorded', { startTime: this.pluginStartTime });

      // ============================================================================
      // PERFORMANCE OPTIMIZATION: Initialize systems
      // ============================================================================

      // Initialize DOM cache (eliminates 84 querySelector calls per update!)
      this.initDOMCache();

      // FUNCTIONAL: Safe method binding (NO IF-ELSE!)
      // Only binds methods that exist, returns no-op for missing methods
      const bindIfExists = (methodName, wait, throttleOrDebounce) => {
        const method = this[methodName];
        const noOp = () => this.debugLog('BIND_SKIP', `Method ${methodName} not found`);
        return method ? throttleOrDebounce(method.bind(this), wait) : noOp;
      };

      // Create throttled versions (4x per second max)
      this.throttled.checkDailyQuests = bindIfExists(
        'checkDailyQuests',
        500,
        this.throttle.bind(this)
      );

      // Create debounced versions (wait 1 sec after last call)
      this.debounced.saveSettings = bindIfExists('saveSettings', 1000, this.debounce.bind(this));

      this.debugLog('START', 'Performance optimizations initialized');

      // Initialize UnifiedSaveManager (IndexedDB)
      if (this.saveManager) {
        try {
          await this.saveManager.init();
          this.debugLog('START', 'UnifiedSaveManager initialized (IndexedDB)');
        } catch (error) {
          this.debugError('START', 'Failed to initialize UnifiedSaveManager', error);
          this.saveManager = null; // Fallback to BdApi.Data
        }
      }

      // STARTUP SAVE GUARD: block all saves until loadSettings() completes.
      // Also reset first-save persisted-progress probe for this session.
      this._startupLoadComplete = false;
      this._startupProgressProbeComplete = false;
      this._hasRealProgress = false;

      // Load settings (will use IndexedDB if available, fallback to BdApi.Data)
      await this.loadSettings();
      this.debugLog('START', 'Settings loaded', {
        level: this.settings.level,
        rank: this.settings.rank,
        totalXP: this.settings.totalXP,
      });

      // Initialize date values if not set
      if (!this.settings.activity.lastActiveTime) {
        this.settings.activity.lastActiveTime = Date.now();
        bootstrapSettingsChanged = true;
      }
      if (!this.settings.activity.sessionStartTime) {
        this.settings.activity.sessionStartTime = Date.now();
        bootstrapSettingsChanged = true;
      }
      if (!this.settings.dailyQuests.lastResetDate) {
        this.settings.dailyQuests.lastResetDate = new Date().toDateString();
        bootstrapSettingsChanged = true;
      }

      // Initialize rank if not set
      if (!this.settings.rank) {
        this.settings.rank = 'E';
        bootstrapSettingsChanged = true;
      }
      if (!this.settings.rankHistory) {
        this.settings.rankHistory = [];
        bootstrapSettingsChanged = true;
      }

      // Check for rank promotion on startup
      this.checkRankPromotion();

      this.debugLog('START', 'Plugin started successfully');

      // Expose backup helpers to console for quick checks/restores
      this.registerBackupConsoleHooks();

      // Initialize shadow power cache from saved settings or default to '0'
      // Also check ShadowArmy's cached value as fallback
      const shadowArmyInstance = this._SLUtils?.getPluginInstance?.('ShadowArmy');
      const shadowArmyCachedPower = shadowArmyInstance?.settings?.cachedTotalPower;

      if (shadowArmyCachedPower !== undefined && shadowArmyCachedPower > 0) {
        // Use ShadowArmy's cached value if available and valid
        this.cachedShadowPower = shadowArmyCachedPower.toLocaleString();
        if (this.settings.cachedShadowPower !== this.cachedShadowPower) {
          this.settings.cachedShadowPower = this.cachedShadowPower;
          bootstrapSettingsChanged = true;
        }
        this.debugLog('START', 'Loaded shadow power from ShadowArmy cache', {
          cachedShadowPower: this.cachedShadowPower,
          source: 'ShadowArmy',
        });
      } else {
        // Fallback to SoloLevelingStats cached value
        this.cachedShadowPower = this.settings.cachedShadowPower || '0';
        this.debugLog('START', 'Loaded cached shadow power from settings', {
          cachedShadowPower: this.cachedShadowPower,
          source: 'SoloLevelingStats',
        });
      }

      // Initialize shadow power immediately on startup (don't wait for interval)
      if (typeof this.updateShadowPower === 'function') {
        this.updateShadowPower().catch((error) => {
          this.debugError('START', 'Failed to initialize shadow power', error);
        });
      }
      // PERF: shadowPowerObserver removed (P5-2) — redundant with event + 5s interval below

      // Listen for shadow extraction events from ShadowArmy
      this._shadowExtractedHandler = () => {
        // Update shadow power when a new shadow is extracted
        this.updateShadowPower?.();
      };
      document.addEventListener('shadowExtracted', this._shadowExtractedHandler);

      // Fallback: Update shadow power periodically (safe call with optional chaining)
      this.shadowPowerInterval = setInterval(() => {
        if (document.hidden) return; // PERF: Skip when window not visible
        this.updateShadowPower?.();
      }, 5000);

      // PERIODIC BACKUP SAVE (Every 30 seconds)
      // Safety net — only saves if settings actually changed since last save
      this.periodicSaveInterval = setInterval(() => {
        if (this._settingsDirty) {
          this.debugLog('PERIODIC_SAVE', 'Backup auto-save triggered');
          this.saveSettings();
        }
      }, this.saveInterval); // 30 seconds (defined in constructor)

      if (typeof this.getSettingsPanel !== 'function') {
        this.debugError('DEBUG', new Error('getSettingsPanel() method NOT FOUND!'));
      }
    } catch (error) {
      this.debugError('START', error, { phase: 'initialization' });
    }

    const levelInfo = this.getCurrentLevel();
    if (this.settings.level !== levelInfo.level) {
      this.settings.level = levelInfo.level;
      this.settings.xp = levelInfo.xp;
      bootstrapSettingsChanged = true;
    }

    // Initialize HP/Mana from stats
    const vitality = this.settings.stats.vitality || 0;
    const intelligence = this.settings.stats.intelligence || 0;
    const userRank = this.settings.rank || 'E';
    if (!this.settings.userMaxHP || this.settings.userMaxHP === null) {
      this.settings.userMaxHP = this.calculateHP(vitality, userRank);
      this.settings.userHP = this.settings.userMaxHP;
      bootstrapSettingsChanged = true;
    }
    if (!this.settings.userMaxMana || this.settings.userMaxMana === null) {
      this.settings.userMaxMana = this.calculateMana(intelligence);
      this.settings.userMana = this.settings.userMaxMana;
      bootstrapSettingsChanged = true;
    }

    // Reset daily quests if new day
    this.checkDailyReset();

    // Track initial channel visit
    this.trackChannelVisit();

    // Start real-time channel change detection
    this.startChannelTracking();

    // Start activity tracking
    this.startActivityTracking();

    // Start message observation
    this.startObserving();

    // Start auto-save interval
    this.startAutoSave();

    // Cleanup unwanted titles from saved data
    this.cleanupUnwantedTitles();

    // Re-validate unlocked achievements against current requirements
    // (revokes titles if level requirements were raised)
    this.revalidateUnlockedAchievements();

    // Apply retroactive natural stat growth based on level and activity
    this.applyRetroactiveNaturalStatGrowth();

    // Integrate with CriticalHit plugin (if available)
    this.integrateWithCriticalHit();

    // Create in-chat UI panel
    try {
      this.createChatUI();
    } catch (error) {
      this.debugError('CREATE_CHAT_UI', error);
      // Retry after a delay if initial creation fails
      if (this._createChatUIStartupRetryTimeout) {
        clearTimeout(this._createChatUIStartupRetryTimeout);
      }
      this._createChatUIStartupRetryTimeout = setTimeout(() => {
        this._createChatUIStartupRetryTimeout = null;
        try {
          this.createChatUI();
        } catch (retryError) {
          this.debugError('CREATE_CHAT_UI_RETRY', retryError);
        }
      }, 2000);
    }

    this.ensureHeaderStatsButton();

    if (bootstrapSettingsChanged) {
      // Persist startup self-healing/default field initialization.
      this.saveSettings();
    }

    // OPTIMIZED: Use debugLog instead of direct console.log
    this.debugLog('START', `Started! Level ${this.settings.level}, ${this.settings.xp} XP`);
    this.debugLog('START', `Rank ${this.settings.rank}, Total XP: ${this.settings.totalXP}`);

    // Emit initial XP changed event for progress bar plugins
    this.emitXPChanged();

    // Set up event listener to update UI when XP changes (clear stale handler on restart)
    if (typeof this._xpChangedUnsub === 'function') {
      try {
        this._xpChangedUnsub();
      } catch (_) {
        // ignore stale unsubscribe errors
      }
    }
    this._xpChangedUnsub = this.on('xpChanged', () => {
      try {
        this.updateChatUI();
      } catch (error) {
        this.debugError('XP_CHANGED_LISTENER', 'Error updating UI on XP change', error);
      }
    });

    // Startup is silent — no toast on every reload.
  },

  stop() {
    this._isRunning = false;
    this._shadowBuffsRefreshPromise = null;
    this._shadowBuffsRefreshAt = 0;

    // Clean up level up debounce timeout
    if (this.levelUpDebounceTimeout) {
      clearTimeout(this.levelUpDebounceTimeout);
      this.levelUpDebounceTimeout = null;
    }
    this.pendingLevelUp = null;

    // Stop observing
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }
    if (this._mutationDebounceTimer) {
      clearTimeout(this._mutationDebounceTimer);
      this._mutationDebounceTimer = null;
    }
    this._pendingMutationNodes = [];
    this._domNodeAddedTime = null;
    if (this.processedMessageIds) {
      this.processedMessageIds.clear();
      this.processedMessageIds = null;
    }
    if (this.recentMessages) {
      // recentMessages may be Map or Set depending on version
      this.recentMessages.clear?.();
      this.recentMessages = null;
    }
    if (this._startObservingRetryTimeout) {
      clearTimeout(this._startObservingRetryTimeout);
      this._startObservingRetryTimeout = null;
    }
    if (this._setupInputRetryTimeout) {
      clearTimeout(this._setupInputRetryTimeout);
      this._setupInputRetryTimeout = null;
    }
    if (this._messageProcessTimeouts) {
      this._messageProcessTimeouts.forEach((id) => clearTimeout(id));
      this._messageProcessTimeouts.clear();
    }

    // Prevent delayed stat allocation notifications after disable
    if (this._statAllocationTimeout) {
      clearTimeout(this._statAllocationTimeout);
      this._statAllocationTimeout = null;
    }
    if (this._statAllocationQueue) {
      this._statAllocationQueue.length = 0;
    }

    if (this._saveSettingsTimer) {
      clearTimeout(this._saveSettingsTimer);
      this._saveSettingsTimer = null;
      this._settingsDirty = false;
    }

    if (this.activityTracker) {
      clearInterval(this.activityTracker);
      this.activityTracker = null;
    }

    // Stop periodic save
    if (this.periodicSaveInterval) {
      clearInterval(this.periodicSaveInterval);
      this.periodicSaveInterval = null;
      this.debugLog('STOP', 'Periodic save stopped');
    }

    // Stop legacy auto-save interval (if present)
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    // Remove auto-save listeners
    if (this._autoSaveHandlers) {
      window.removeEventListener('beforeunload', this._autoSaveHandlers.beforeUnloadHandler);
      document.removeEventListener(
        'visibilitychange',
        this._autoSaveHandlers.visibilityChangeHandler
      );
      this._autoSaveHandlers = null;
    }

    // Stop channel tracking
    if (this.channelTrackingInterval) {
      clearInterval(this.channelTrackingInterval);
      this.channelTrackingInterval = null;
      this.debugLog('STOP', 'Channel tracking stopped');
    }
    // PERF(P5-1): Unsubscribe from shared NavigationBus
    if (this._navBusUnsub) {
      this._navBusUnsub();
      this._navBusUnsub = null;
    }
    this._channelTrackingHooks = null;
    this._channelTrackingState = null;
    this._channelInfoCacheUrl = null;
    this._channelInfoCache = null;
    this._messageInputElCache = null;
    this.debugLog('STOP', 'Channel tracking listeners/hooks restored');

    // Remove event listeners
    if (this.messageInputHandler) {
      const messageInput =
        this.messageInputHandler.element ||
        document.querySelector(dc.sel.slateTextArea) ||
        document.querySelector(dc.sel.textArea) ||
        document.querySelector('textarea[placeholder*="Message"]');

      if (messageInput && this.messageInputHandler.handleKeyDown) {
        // These listeners were added with capture=true, so they must be removed with capture=true
        messageInput.removeEventListener('keydown', this.messageInputHandler.handleKeyDown, true);
        messageInput.removeEventListener('input', this.messageInputHandler.handleInput, true);
      }
      if (messageInput && this.messageInputHandler.handlePaste) {
        messageInput.removeEventListener('paste', this.messageInputHandler.handlePaste, true);
      }
      if (this.messageInputHandler.observer) {
        this.messageInputHandler.observer.disconnect();
      }
      this.messageInputHandler = null;
    }

    // Remove chat UI
    this.removeChatUI();

    // Cleanup webpack patches
    if (this.messageStorePatch || this.reactInjectionActive) {
      try {
        BdApi.Patcher.unpatchAll('SoloLevelingStats');
        this.messageStorePatch = null;
        this.reactInjectionActive = false;
        this.debugLog('STOP', 'Webpack patches and React injection removed');
      } catch (error) {
        this.debugError('STOP', error, { phase: 'unpatch' });
      }
    }

    // Clear webpack module references
    this.webpackModules = {
      MessageStore: null,
      UserStore: null,
      ChannelStore: null,
      MessageActions: null,
    };
    this.webpackModuleAccess = false;

    // Stop shadow power observer/interval
    if (this.shadowPowerObserver) {
      this.shadowPowerObserver.disconnect();
      this.shadowPowerObserver = null;
    }
    if (this.shadowPowerInterval) {
      clearInterval(this.shadowPowerInterval);
      this.shadowPowerInterval = null;
    }
    if (this.shadowPowerUpdateTimeout) {
      clearTimeout(this.shadowPowerUpdateTimeout);
      this.shadowPowerUpdateTimeout = null;
    }

    // Remove shadow extraction event listener
    if (this._shadowExtractedHandler) {
      document.removeEventListener('shadowExtracted', this._shadowExtractedHandler);
      this._shadowExtractedHandler = null;
    }

    // Cleanup HP bar position updater
    if (this.userHPBarPositionUpdater) {
      clearInterval(this.userHPBarPositionUpdater);
      this.userHPBarPositionUpdater = null;
    }

    // Cleanup panel watcher
    if (this.panelWatcher) {
      this.panelWatcher.disconnect();
      this.panelWatcher = null;
    }

    // Cleanup user HP bar
    if (this.userHPBar) {
      this.userHPBar = null;
    }

    // Remove activity tracking event listeners
    if (this._activityTrackingHandlers) {
      document.removeEventListener('mousemove', this._activityTrackingHandlers.mousemove);
      document.removeEventListener('keydown', this._activityTrackingHandlers.keydown);
      this._activityTrackingHandlers = null;
    }
    if (this._activityTimeout) {
      clearTimeout(this._activityTimeout);
      this._activityTimeout = null;
    }

    if (typeof this._xpChangedUnsub === 'function') {
      try {
        this._xpChangedUnsub();
      } catch (_) {
        // ignore stale unsubscribe errors
      }
      this._xpChangedUnsub = null;
    }

    // MEMORY CLEANUP: Clear quest celebration particles and animations
    document.querySelectorAll('.sls-quest-celebration, .sls-quest-particle').forEach((el) => {
      // Clear any timeouts stored on elements
      if (el._removeTimeout) {
        clearTimeout(el._removeTimeout);
      }
      el.remove();
    });

    // MEMORY CLEANUP: Clear level-up overlay animation (non-toast)
    this.clearLevelUpAnimationTimeouts?.();
    this._levelUpAnimationQueue && (this._levelUpAnimationQueue.length = 0);
    this._levelUpAnimationInFlight = false;
    document.getElementById('sls-levelup-overlay')?.remove();

    // Also cleanup tracked celebrations
    if (this._questCelebrations) {
      this._questCelebrations.forEach((celebration) => {
        if (celebration._removeTimeout) {
          clearTimeout(celebration._removeTimeout);
        }
        if (celebration._progressInterval) {
          clearInterval(celebration._progressInterval);
        }
        if (celebration && celebration.parentNode) {
          celebration.remove();
        }
      });
      this._questCelebrations.clear();
    }

    // Clear pending level up data
    if (this.pendingLevelUp) {
      this.pendingLevelUp = null;
    }

    // Save before stopping
    this.saveSettings(true);

    // Detach settings panel delegated handlers if attached
    this._detachSettingsPanelHandlers();
    if (this._settingsPreviewRoot) {
      try {
        this._settingsPreviewRoot.unmount();
      } catch (error) {
        this.debugError('STOP', error, { phase: 'unmount-settings-preview-root' });
      }
      this._settingsPreviewRoot = null;
    }

    this.debugLog('STOP', 'Plugin stopped');
  },

  _detachSettingsPanelHandlers() {
    if (this._settingsPanelRoot && this._settingsPanelHandlers?.change) {
      try {
        this._settingsPanelRoot.removeEventListener('change', this._settingsPanelHandlers.change);
      } catch (_) {
        // Ignore removal errors
      }
    }
    if (this._settingsPanelRoot && this._settingsPanelHandlers?.click) {
      try {
        this._settingsPanelRoot.removeEventListener('click', this._settingsPanelHandlers.click);
      } catch (_) {
        // Ignore removal errors
      }
    }
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
  },
};
