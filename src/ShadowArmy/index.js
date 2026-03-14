const C = require('./constants');
const ShadowStorageManager = require('./storage');
const { buildWidgetComponents } = require('./components');

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

// Load UnifiedSaveManager for crash-resistant IndexedDB storage
const _shadowArmyStartupWarn = (...args) => {
  try {
    if (typeof window !== 'undefined' && window.__SHADOW_ARMY_DEBUG_STARTUP__) {
      console.warn(...args);
    }
  } catch (_) {
    // ignore
  }
};

let UnifiedSaveManager;
try {
  if (typeof window !== 'undefined' && typeof window.UnifiedSaveManager === 'function') {
    UnifiedSaveManager = window.UnifiedSaveManager;
  } else {
    UnifiedSaveManager = _bdLoad("UnifiedSaveManager.js") || window.UnifiedSaveManager || null;
    if (UnifiedSaveManager && !window.UnifiedSaveManager) window.UnifiedSaveManager = UnifiedSaveManager;
  }
} catch (error) {
  _shadowArmyStartupWarn('[ShadowArmy] Failed to load UnifiedSaveManager:', error);
  UnifiedSaveManager = typeof window !== 'undefined' ? window.UnifiedSaveManager || null : null;
}

let _ReactUtils;
try { _ReactUtils = _bdLoad('BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

const ShadowArmy = class ShadowArmy {
  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================

  constructor() {
    // Default settings (deep-copied to prevent mutation)
    this.defaultSettings = C.DEFAULT_SETTINGS;
    this.settings = structuredClone(this.defaultSettings);

    // Initialize UnifiedSaveManager for crash-resistant IndexedDB storage
    this.saveManager = null;
    if (typeof UnifiedSaveManager === 'function') {
      try {
        this.saveManager = new UnifiedSaveManager('ShadowArmy');
      } catch (e) {
        console.warn('[ShadowArmy] UnifiedSaveManager initialization failed:', e.message);
      }
    }

    // Shadow rank system (E through Shadow Monarch)
    this.shadowRanks = C.SHADOW_RANKS;
    // Shadow roles with buffs and effects (26 total: 8 humanoid + 18 magic beast)
    this.shadowRoles = C.SHADOW_ROLES;
    // Stat weight templates per role
    this.shadowRoleStatWeights = C.SHADOW_ROLE_STAT_WEIGHTS;
    // Rank probability multipliers for extraction
    this.rankProbabilityMultipliers = C.RANK_PROBABILITY_MULTIPLIERS;
    // Rank stat multipliers (1.5^rank_index exponential scaling)
    this.rankStatMultipliers = C.RANK_STAT_MULTIPLIERS;
    // Shadow army capacity per player rank (lore-accurate, Shadow Monarch = Infinity)
    this.shadowArmyCapacity = C.SHADOW_ARMY_CAPACITY;

    // ============================================================================
    // COMPONENT REFERENCES - Storage, UI, Integration
    // ============================================================================
    this.storageManager = null;
    this.userId = null;

    // Performance cache for shadow power calculations
    this._shadowPowerCache = new Map();
    this._shadowPowerCacheLimit = 1000;

    // Cache for Solo Leveling data (user stats, rank, level)
    this._soloDataCache = null;
    this._soloDataCacheTime = 0;
    this._soloDataCacheTTL = 500;

    // CSS management tracking
    this._injectedStyles = new Set();

    // Solo Leveling Stats plugin integration
    this.soloPlugin = null;
    this.originalProcessMessage = null;
    this._messageProcessWrapper = null;
    this._extractionTimestamps = [];
    this._pendingMessageExtractionCount = 0;
    this._isProcessingMessageExtractionQueue = false;
    this._messageExtractionQueueTimeout = null;

    // UI elements
    this.shadowArmyModal = null;

    // ARISE Animation system
    this.animationContainer = null;
    this._lastAriseAnimationAt = 0;
    this._pendingAriseShadow = null;
    this._ariseDrainTimeout = null;
    this.webpackModules = {
      UserStore: null,
      ChannelStore: null,
      PermissionStore: null,
      Permissions: null,
    };
    this.webpackModuleAccess = false;
    this.reactInjectionActive = false;

    // ============================================================================
    // LIFECYCLE STATE - Cleanup Tracking
    // ============================================================================
    this._retryTimeouts = new Set();
    this._memberListSetupRetryTimeout = null;
    this._isStopped = true;
    this._widgetDirty = true;
    this._widgetRefreshTimer = null;
    this._widgetRefreshInFlight = false;
    this._widgetRefreshQueued = false;
    this._lastWidgetRefreshAt = 0;
    this._widgetRefreshMinIntervalMs = 800;
    this._navBusUnsub = null;
    this._navChangeTimeout = null;
    this.widgetReinjectionTimeout = null;
    this._discordMediaUnhandledRejectionHandler = null;
    this._discordMediaErrorHandlerAdded = false;

    // React widget refs (v3.6.0)
    this._widgetReactRoot = null;
    this._widgetForceUpdate = null;
    this._widgetComponents = null;
    this._dungeonEssenceListener = null;
    this._batchExtractionListener = null;

    // Module-level references made available as instance properties for mixins
    this._ReactUtils = _ReactUtils;
    this._PluginUtils = _PluginUtils;

    // ============================================================================
    // DEBUG SYSTEM
    // ============================================================================
    this.debug = {
      enabled: false,
      errorCount: 0,
      lastError: null,
      operationCounts: {},
      lastLogTimes: {},
    };
  }

  // ============================================================================
  // PLUGIN LIFECYCLE
  // ============================================================================

  async start() {
    if (!this._isStopped) {
      this.stop();
    }
    this._toast = _PluginUtils?.createToastHelper?.("shadowArmy") || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
    this._isStopped = false;
    // SNAPSHOT CACHE: Instance-level (NOT in this.settings — must not be persisted to disk)
    this._snapshotCache = null;
    this._snapshotTimestamp = 0;
    this._pendingMessageExtractionCount = 0;
    this._isProcessingMessageExtractionQueue = false;
    this._messageExtractionQueueTimeout = null;
    this._lastAriseAnimationAt = 0;
    this._pendingAriseShadow = null;
    this._ariseDrainTimeout = null;

    this._widgetResourcesActive = false;
    this._setupDiscordMediaErrorSuppression();

    // Get user ID for storage isolation
    this.userId = await this.getUserId();

    // Initialize IndexedDB storage
    try {
      this.storageManager = new ShadowStorageManager(
        this.userId,
        (tag, msg, data) => this.debugLog(tag, msg, data),
        (tag, msg, err) => this.debugError(tag, msg, err)
      );
      this.storageManager.decompressShadow = (shadow) => this.decompressShadow(shadow);
      this.storageManager.decompressShadowUltra = (shadow) => this.decompressShadowUltra(shadow);
      await this.storageManager.init();

      // Initialize UnifiedSaveManager (IndexedDB) for settings
      if (this.saveManager) {
        try {
          await this.saveManager.init();
          this.debugLog('START', 'UnifiedSaveManager initialized (IndexedDB)');
        } catch (error) {
          this.debugError('START', 'Failed to initialize UnifiedSaveManager', error);
          this.saveManager = null;
        }
      }

      // Migrate from localStorage if needed
      const migrationResult = await this.storageManager.migrateFromLocalStorage();
      if (migrationResult && migrationResult.migrated > 0) {
        this.debugLog(
          'MIGRATION',
          `Migrated ${migrationResult.migrated} shadows from localStorage to IndexedDB`,
          { migrated: migrationResult.migrated, total: migrationResult.total }
        );
      }

      // Ensure personalityKey exists on all records
      try {
        const personalityMigration = await this.storageManager.ensurePersonalityKeyMigration(false);
        if (personalityMigration?.migrated) {
          this.debugLog('MIGRATION', 'Personality key migration completed', {
            scanned: personalityMigration.scanned || 0,
            updated: personalityMigration.updated || 0,
            errors: personalityMigration.errors || 0,
            batches: personalityMigration.batches || 0,
          });
        }
      } catch (error) {
        this.debugError('MIGRATION', 'Personality key migration failed', error);
      }

      // Verify storage is working
      const initialCount = await this.storageManager.getTotalCount();

      this.debugLog('STORAGE', `IndexedDB initialized successfully`, {
        indexedDBShadows: initialCount,
        userId: this.userId,
        dbName: this.storageManager?.dbName || 'unknown',
        migrationCompleted: migrationResult?.migrated > 0,
      });

      if (initialCount > 0) {
        this.debugLog('STORAGE', 'IndexedDB initialized with shadows', { shadowCount: initialCount });

        // Trigger background recalculation
        this.getTotalShadowPower(true)
          .then((power) => {
            if (power > 0) {
              this.debugLog('STORAGE', 'Recalculated total power after IndexedDB init', {
                totalPower: power,
                shadowCount: initialCount,
              });
            }
          })
          .catch((error) => {
            this.debugError('STORAGE', 'Failed to recalculate total power after IndexedDB init', error);
          });
      }

    } catch (error) {
      this.debugError('STORAGE', 'IndexedDB initialization failed, using localStorage fallback', error);
      this.storageManager = null;
    }

    await this.loadSettings();

    // Guard: if stop() was called during async init, bail out
    if (this._isStopped) return;

    this.injectCSS();
    this.integrateWithSoloLeveling();

    // Defer extraction-only resources until shadow_extraction skill is unlocked.
    // Prevents message listener, queue machinery, and ARISE animation from
    // consuming resources when the player hasn't progressed far enough.
    this._extractionResourcesActive = false;
    if (this._isSkillTreeSkillUnlocked('shadow_extraction')) {
      this._activateExtractionResources();
    } else {
      this.debugLog('START', 'shadow_extraction skill not unlocked — extraction resources deferred');
    }

    // Defer widget resources (React components, CSS, MutationObserver, refresh interval)
    // until both shadow_extraction AND shadow_preservation are unlocked.
    const _bothShadowSkillsUnlocked = () =>
      this._isSkillTreeSkillUnlocked('shadow_extraction') &&
      this._isSkillTreeSkillUnlocked('shadow_preservation');

    if (_bothShadowSkillsUnlocked()) {
      this._activateWidgetResources();
    } else {
      this.debugLog('START', 'Shadow skills not fully unlocked — widget resources deferred');
    }

    // Listen for SkillTree skill level changes to activate/deactivate features dynamically
    this._onSkillLevelChanged = (event) => {
      if (this._isStopped) return;
      const { skillId, level } = event.detail || {};

      // Extraction resources: gate on shadow_extraction
      if (skillId === 'shadow_extraction') {
        if (level >= 1 && !this._extractionResourcesActive) {
          this.debugLog('SKILL_GATE', 'shadow_extraction unlocked — activating extraction resources');
          this._activateExtractionResources();
        } else if (level < 1 && this._extractionResourcesActive) {
          this.debugLog('SKILL_GATE', 'shadow_extraction reset — tearing down extraction resources');
          this._deactivateExtractionResources();
        }
      }

      // Widget resources: gate on both shadow_extraction AND shadow_preservation
      if (skillId === 'shadow_extraction' || skillId === 'shadow_preservation') {
        if (_bothShadowSkillsUnlocked() && !this._widgetResourcesActive) {
          this.debugLog('SKILL_GATE', 'Both shadow skills unlocked — activating widget resources');
          this._activateWidgetResources();
        } else if (!_bothShadowSkillsUnlocked() && this._widgetResourcesActive) {
          this.debugLog('SKILL_GATE', 'Shadow skill reset — tearing down widget resources');
          this._deactivateWidgetResources();
        }
      }
    };
    document.addEventListener('SkillTree:skillLevelChanged', this._onSkillLevelChanged);

    // Run all data migrations
    try {
      await this.runDataMigrations();
    } catch (error) {
      this.debugError('MIGRATION', 'Data migration runner failed', error);
    }

    // Start natural growth processing
    this.startNaturalGrowthInterval();
  }

  /**
   * Activate extraction-only resources (message listener, ARISE animation).
   * Called immediately if shadow_extraction is already unlocked, or deferred
   * until the SkillTree:skillLevelChanged event fires.
   */
  _activateExtractionResources() {
    if (this._extractionResourcesActive) return;
    this._extractionResourcesActive = true;

    this.loadAriseAnimationFont();
    this.initializeAriseAnimationSystem();
    this.setupMessageListener();

    this.debugLog('SKILL_GATE', 'Extraction resources activated (message listener + ARISE)');
  }

  /**
   * Tear down extraction resources when shadow_extraction skill is reset.
   * Removes message listener and ARISE animation to free resources.
   */
  _deactivateExtractionResources() {
    if (!this._extractionResourcesActive) return;
    this._extractionResourcesActive = false;

    this.removeMessageListener();
    this.cleanupAriseAnimationSystem();

    this.debugLog('SKILL_GATE', 'Extraction resources deactivated (skill reset)');
  }

  /**
   * Activate widget resources (React components, CSS, channel watcher, refresh interval).
   * Deferred until both shadow_extraction AND shadow_preservation are unlocked.
   */
  _activateWidgetResources() {
    if (this._widgetResourcesActive) return;
    this._widgetResourcesActive = true;

    // Build React components for the widget
    this._widgetComponents = buildWidgetComponents(this);

    // Inject widget CSS
    this.injectWidgetCSS();

    // Setup channel/member list watcher (MutationObserver + NavigationBus)
    this.setupChannelWatcher();

    // Initial widget injection (slight delay for DOM readiness)
    const widgetStartupTimeoutId = setTimeout(() => {
      this._retryTimeouts.delete(widgetStartupTimeoutId);
      if (this._isStopped) return;
      this.injectShadowRankWidget();
    }, 100);
    this._retryTimeouts.add(widgetStartupTimeoutId);

    // 30s refresh interval (only fires when data changed and window visible)
    if (this.widgetUpdateInterval) {
      clearInterval(this.widgetUpdateInterval);
    }
    this.widgetUpdateInterval = setInterval(() => {
      if (document.hidden) return;
      if (!this._widgetDirty) return;
      this.scheduleWidgetRefresh({ reason: 'interval', delayMs: 0 });
    }, 30000);

    this.debugLog('SKILL_GATE', 'Widget resources activated (components + CSS + watchers + interval)');
  }

  /**
   * Tear down widget resources when shadow skills are reset.
   * Removes widget, CSS, watchers, and refresh interval.
   */
  _deactivateWidgetResources() {
    if (!this._widgetResourcesActive) return;
    this._widgetResourcesActive = false;

    // Remove widget from DOM
    this.removeShadowRankWidget();

    // Clear refresh interval
    if (this.widgetUpdateInterval) {
      clearInterval(this.widgetUpdateInterval);
      this.widgetUpdateInterval = null;
    }

    // Disconnect member list MutationObserver
    if (this.memberListObserver) {
      this.memberListObserver.disconnect();
      this.memberListObserver = null;
    }
    if (this._memberListHealthCheck) {
      clearInterval(this._memberListHealthCheck);
      this._memberListHealthCheck = null;
    }

    // Unsubscribe NavigationBus
    if (typeof this._navBusUnsub === 'function') {
      this._navBusUnsub();
      this._navBusUnsub = null;
    }

    // Remove widget CSS
    this.removeWidgetCSS();

    // Clear widget components
    this._widgetComponents = null;

    this.debugLog('SKILL_GATE', 'Widget resources deactivated (skill reset)');
  }

  // ============================================================================
  // NATURAL GROWTH INTERVAL & WIDGET TIMERS
  // ============================================================================

  startNaturalGrowthInterval() {
    if (this.naturalGrowthInterval) {
      clearInterval(this.naturalGrowthInterval);
    }

    // Process shadow compression on start (delayed 10 mins to avoid startup lag)
    const compressionTimeoutId = setTimeout(() => {
      this._retryTimeouts.delete(compressionTimeoutId);
      if (this._isStopped) return;
      this.processShadowCompression();
    }, 600000);
    this._retryTimeouts.add(compressionTimeoutId);

    // Then process every hour
    this.naturalGrowthInterval = setInterval(() => {
      this.processShadowCompression();
    }, 60 * 60 * 1000);

    // Listen for Dungeons essence awards
    if (typeof BdApi?.Events?.on === 'function') {
      if (typeof BdApi?.Events?.off === 'function' && this._dungeonEssenceListener) {
        BdApi.Events.off('Dungeons:awardEssence', this._dungeonEssenceListener);
        this._dungeonEssenceListener = null;
      }
      this._dungeonEssenceListener = (data) => {
        const amount = data?.amount || 0;
        if (amount > 0 && this.settings?.shadowEssence) {
          this.settings.shadowEssence.essence = (this.settings.shadowEssence.essence || 0) + amount;
          this.saveSettings();
        }
      };
      BdApi.Events.on('Dungeons:awardEssence', this._dungeonEssenceListener);

      // Listen for batch extraction complete
      if (typeof BdApi?.Events?.off === 'function' && this._batchExtractionListener) {
        BdApi.Events.off('ShadowArmy:batchExtractionComplete', this._batchExtractionListener);
        this._batchExtractionListener = null;
      }
      this._batchExtractionListener = async (data) => {
        if (data?.extracted > 0 && typeof this.updateShadowRankWidget === 'function') {
          this.scheduleWidgetRefresh({ reason: 'batch_extraction_event', delayMs: 250 });
        }
      };
      BdApi.Events.on('ShadowArmy:batchExtractionComplete', this._batchExtractionListener);
    }
  }

  // ============================================================================
  // DISCORD MEDIA ERROR SUPPRESSION
  // ============================================================================

  _setupDiscordMediaErrorSuppression() {
    if (typeof window === 'undefined' || this._discordMediaErrorHandlerAdded) return;
    this._discordMediaErrorHandlerAdded = true;

    this._discordMediaUnhandledRejectionHandler = (event) => {
      if (this._isStopped) return;
      const error = event.reason;
      const errorMessage = error?.message || error?.toString() || '';
      const errorStack = error?.stack || '';
      if (
        errorMessage.includes("Cannot find module 'discord_media'") ||
        errorMessage.includes('discord_media') ||
        errorStack.includes('discord_media') ||
        errorStack.includes('nativeModules.js')
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', this._discordMediaUnhandledRejectionHandler);
  }

  // ============================================================================
  // STOP — CLEANUP
  // ============================================================================

  stop() {
    this._isStopped = true;

    // Remove SkillTree skill gate listener
    if (this._onSkillLevelChanged) {
      document.removeEventListener('SkillTree:skillLevelChanged', this._onSkillLevelChanged);
      this._onSkillLevelChanged = null;
    }
    this._extractionResourcesActive = false;
    this._widgetResourcesActive = false;

    // Flush any pending debounced save immediately
    if (this._saveSettingsTimer) {
      clearTimeout(this._saveSettingsTimer);
      this._saveSettingsTimer = null;
    }
    if (this._settingsDirty) {
      this._settingsDirty = false;
      this._saveSettingsImmediate();
    }

    // Cleanup ARISE animation system
    this.cleanupAriseAnimationSystem();

    this.removeMessageListener();
    this.soloPlugin = null;
    this.detachShadowArmySettingsPanelHandlers();
    this.removeCSS();
    this.removeWidgetCSS();
    this.cleanupAllCSS();
    this.clearCombatCache();
    this.closeShadowArmyModal();
    this.__ShadowArmyModalCached = null;

    // Remove global error suppression handler
    if (this._discordMediaUnhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this._discordMediaUnhandledRejectionHandler);
      this._discordMediaUnhandledRejectionHandler = null;
      this._discordMediaErrorHandlerAdded = false;
    }

    // Clear all tracked retry timeouts
    this._retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._retryTimeouts.clear();
    this._messageExtractionQueueTimeout = null;
    this._ariseDrainTimeout = null;
    this._pendingMessageExtractionCount = 0;
    this._isProcessingMessageExtractionQueue = false;
    this._pendingAriseShadow = null;
    this._lastAriseAnimationAt = 0;

    // Clear natural growth interval
    if (this.naturalGrowthInterval) {
      clearInterval(this.naturalGrowthInterval);
      this.naturalGrowthInterval = null;
    }

    // Unsubscribe from shared NavigationBus
    if (this._navBusUnsub) {
      this._navBusUnsub();
      this._navBusUnsub = null;
    }

    // Clear widget update interval
    if (this.widgetUpdateInterval) {
      clearInterval(this.widgetUpdateInterval);
      this.widgetUpdateInterval = null;
    }

    // Clear modal auto-refresh interval
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }

    // Clear coalesced widget refresh timer
    if (this._widgetRefreshTimer) {
      clearTimeout(this._widgetRefreshTimer);
      this._widgetRefreshTimer = null;
    }
    this._widgetRefreshInFlight = false;
    this._widgetRefreshQueued = false;

    // Clear member list observer health check
    if (this._memberListHealthCheck) {
      clearInterval(this._memberListHealthCheck);
      this._memberListHealthCheck = null;
    }

    // Clear widget reinjection timeout
    if (this.widgetReinjectionTimeout) {
      clearTimeout(this.widgetReinjectionTimeout);
      this._retryTimeouts?.delete?.(this.widgetReinjectionTimeout);
      this.widgetReinjectionTimeout = null;
    }
    if (this._memberListSetupRetryTimeout) {
      clearTimeout(this._memberListSetupRetryTimeout);
      this._retryTimeouts?.delete?.(this._memberListSetupRetryTimeout);
      this._memberListSetupRetryTimeout = null;
    }
    // Clear navigation change debounce
    if (this._navChangeTimeout) {
      clearTimeout(this._navChangeTimeout);
      this._retryTimeouts?.delete?.(this._navChangeTimeout);
      this._navChangeTimeout = null;
    }

    // COMPREHENSIVE MEMORY CLEANUP
    if (this.cachedBuffs) this.cachedBuffs = null;
    this.cachedBuffsTime = null;

    if (this._extractionTimestamps) {
      this._extractionTimestamps.length = 0;
      this._extractionTimestamps = null;
    }

    // dungeonExtractionAttempts is a persisted settings field, not runtime state —
    // do NOT null it here (save already flushed above, and nulling after save
    // creates transient inconsistency if canExtractFromBoss() is called during shutdown)

    // Disconnect member list observer
    if (this.memberListObserver) {
      this.memberListObserver.disconnect();
      this.memberListObserver = null;
    }

    // Remove shadow rank widget (React unmount + DOM)
    this.removeShadowRankWidget();
    this._widgetComponents = null;

    // Clear Solo Leveling data cache
    this._soloDataCache = null;
    this._soloDataCacheTime = 0;

    // Cleanup cross-plugin event listeners
    if (typeof BdApi?.Events?.off === 'function') {
      if (this._dungeonEssenceListener) {
        BdApi.Events.off('Dungeons:awardEssence', this._dungeonEssenceListener);
        this._dungeonEssenceListener = null;
      }
      if (this._batchExtractionListener) {
        BdApi.Events.off('ShadowArmy:batchExtractionComplete', this._batchExtractionListener);
        this._batchExtractionListener = null;
      }
    }

    // Close IndexedDB connection
    if (this.storageManager) {
      this.storageManager.close();
      this.storageManager = null;
    }
  }
};

// ============================================================================
// MIXIN WIRING — all methods assigned to ShadowArmy.prototype
// ============================================================================
Object.assign(
  ShadowArmy.prototype,
  require('./watchers'),
  require('./extraction'),
  require('./extraction-queue'),
  require('./combat-stats'),
  require('./army-stats'),
  require('./progression'),
  require('./migrations'),
  require('./shadow-management'),
  require('./compression'),
  require('./animation'),
  require('./ui-settings'),
  require('./widget'),
  require('./modal'),
);

module.exports = ShadowArmy;
