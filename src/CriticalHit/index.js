const { version: PLUGIN_VERSION } = require("./manifest.json");
const C = require("./constants");
const { FRIENDORFOEBB_WOFF2_DATA, SPEEDYSPACEGOATODDITY_WOFF2_DATA } = require("./font-data");

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

// SECTION 1: IMPORTS & DEPENDENCIES
// No external imports (BetterDiscord plugin)

// SECTION 2: CONFIGURATION & HELPERS
// (Configuration constants and helper methods organized below in class)

// SECTION 3: MAJOR OPERATIONS
// (Core plugin logic organized below in class)

// SECTION 4: DEBUGGING & DEVELOPMENT
// (Debug system organized below in class)

let _ReactUtils;
try { _ReactUtils = _bdLoad('BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

const CriticalHit = class CriticalHit {
  // SECTION 2: CONFIGURATION & HELPERS

  // CONSTRUCTOR & INITIALIZATION
  constructor() {
    this.defaultSettings = C.DEFAULT_SETTINGS;
    this.settings = structuredClone(C.DEFAULT_SETTINGS);
    this.messageObserver = null;
    this.urlObserver = null;
    // styleObservers — REMOVED in v3.4.0 (per-message CSS replaces observer-based styling)
    this.critMessages = new Set(); // Track which messages are crits (in current session)
    this.processedMessages = new Set(); // Track all processed messages (crit or not) - uses message IDs
    this.processedMessagesOrder = []; // Track insertion order for LRU cleanup
    this.maxProcessedMessages = 5000; // Maximum processed messages to keep in memory
    this.messageHistory = []; // Full history of all processed messages with crit info
    // Pending crits queue to handle race condition
    this.pendingCrits = new Map(); // Map<messageId, {critSettings, timestamp, channelId}>
    this.maxPendingCrits = 100;
    this.critCSSRules = new Map(); // Map<messageId, cssRuleString> — attribute-targeted CSS for re-render persistence
    this._critCSSRebuildRAF = null; // Debounce handle for rebuildCritMessageStyles
    // _isApplyingGradient — REMOVED in v3.4.0 (no observer cascades with CSS-only approach)
    // Cache crit history to avoid repeated filter operations
    this._cachedCritHistory = null;
    this._cachedCritHistoryTimestamp = 0;
    this._cachedCritHistoryMaxAge = 5000; // 5 second cache validity (was 1s)
    this._historyMap = new Map(); // O(1) lookup for message history (messageId -> historyEntry)
    // Throttle restoration checks to prevent spam
    this._restorationCheckThrottle = new Map(); // Map<messageId, lastCheckTime>
    this._restorationCheckThrottleMs = 100; // Minimum 100ms between checks for same message
    this._diagLogThrottle = new Map(); // Map<operation:key, ts> to suppress repeated diagnostics
    this._diagLogThrottleMs = 15000;
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.observerStartTime = Date.now(); // Track when observer started
    this.channelLoadTime = Date.now(); // Track when channel finished loading
    this.isLoadingChannel = false; // Flag to prevent processing during channel load
    this.currentChannelId = null; // Track current channel ID
    this.currentGuildId = null; // Track current guild ID (for accuracy across guilds)
    // OPTIMIZED: Smart history limits with crit prioritization (configurable via settings)
    this.maxHistorySize = this.settings.maxHistorySize ?? 2000;
    this.maxCritHistory = this.settings.maxCritHistory ?? 1000;
    this.maxHistoryPerChannel = this.settings.maxHistoryPerChannel ?? 500;
    this.historyCleanupInterval = null; // Interval for periodic history cleanup
    // novaFlatObserver — REMOVED in v3.4.0 (per-message CSS handles font enforcement)
    // Cache DOM queries
    // Additional performance caches
    this._cache = {
      currentChannelId: null,
      currentChannelIdTime: 0,
      currentChannelIdTTL: 500, // 500ms - channel changes infrequently
      currentGuildId: null,
      currentGuildIdTime: 0,
      currentGuildIdTTL: 500, // 500ms - guild changes infrequently
      stats: null,
      statsTime: 0,
      statsTTL: 1000, // 1s - stats change when messages are processed
      urlChannelId: null,
      urlChannelIdTime: 0,
      urlChannelIdTTL: 200, // 200ms - URL changes infrequently but check often
      urlChannelIdSource: null, // Track source URL for cache validation
      urlGuildId: null,
      urlGuildIdTime: 0,
      urlGuildIdTTL: 200, // 200ms - URL changes infrequently but check often
      urlGuildIdSource: null, // Track source URL for cache validation
    };

    // FluxDispatcher — instant crit detection via MESSAGE_CREATE (v3.6.0)
    this._Dispatcher = null;
    this._handleMessageCreate = null; // Bound handler for subscribe/unsubscribe
    this._pendingAnimations = new Map(); // Map<messageId, {critSettings, comboCount, timestamp}>

    // Webpack modules (for advanced Discord integration)
    this.webpackModules = {
      MessageStore: null,
      UserStore: null,
      MessageActions: null,
      SelectedChannelStore: null,
      SelectedGuildStore: null,
    };
    this.messageStorePatch = null; // Track MessageStore patch for cleanup
    // Processing locks to prevent duplicate calls during spam
    this._processingCrits = new Set(); // Track message IDs currently being processed for crit styling
    this._processingAnimations = new Set(); // Track message IDs currently being processed for animation
    this._onCritHitThrottle = new Map(); // Map<messageId, lastCallTime> - throttle onCritHit calls
    this._onCritHitThrottleMs = 200; // Minimum 200ms between onCritHit calls for same message
    this._comboUpdatedMessages = new Set(); // Track message IDs that have already had combo updated (prevents duplicate increments)
    this._comboUpdatedContentHashes = new Set(); // Track content hashes that have already had combo updated (prevents duplicate increments when message ID changes)

    // Debug system (default disabled, throttling for frequent ops)
    // Note: debug.enabled is updated in loadSettings() after settings are loaded
    this.debug = {
      enabled: false, // Will be synced with settings.debugMode in loadSettings()
      errorCount: 0,
      lastError: null,
      operationCounts: {},
      lastLogTimes: {}, // Track last log time for throttling
    };

    // Stats tracking
    this.stats = {
      totalCrits: 0,
      totalMessages: 0,
      critRate: 0,
      lastUpdated: Date.now(),
    };

    // ANIMATION STATE (from CriticalHitAnimation)
    this.animationContainer = null;
    this.activeAnimations = new Set();
    this.userCombos = new Map();
    this.animatedMessages = new Map(); // Stores { position, timestamp, messageId } for duplicate detection
    this.currentUserId = null;
    this.pluginStartTime = Date.now();
    this.lastAnimationTime = 0;

    // Performance optimization: Observer limits
    // _maxStyleObservers, _observerCleanupInterval — REMOVED in v3.4.0 (no observer limits needed)
    this._critCSSInjected = false; // Guard: inject CSS only once
    this._msgIdCache = new WeakMap(); // Cache: getMessageIdFromElement results (auto-GC on element detach)

    // Performance optimization: History save throttling
    this._saveHistoryThrottle = null; // Timeout for throttled saves
    this._saveHistoryPending = false; // Flag for pending save
    this._lastSaveTime = 0; // Last save timestamp
    this._minSaveInterval = 1000; // Minimum 1 second between saves
    this._maxSaveInterval = 5000; // Maximum 5 seconds between saves (force save)
    this._pendingCritSaves = 0; // Count of pending crit saves

    // Cached DOM queries (animation)
    this._cachedChatInput = null;
    this._cachedMessageList = null;
    // Lifecycle safety (stop-safe scheduling + cleanup)
    this._isStopped = true;
    this._trackedTimeouts = new Set();
    this._trackedIntervals = new Set();
    this._trackedRafIds = new Set();
    this._transientObservers = new Set();

    // Settings panel lifecycle (for delegated handlers + cleanup)
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
    this._settingsRoot = null; // React 18 createRoot instance
  }

  // HELPER FUNCTIONS - EXTRACTED FROM LONG FUNCTIONS

  _setTrackedTimeout(callback, delayMs) {
    const timeoutId = setTimeout(() => {
      this._trackedTimeouts.delete(timeoutId);
      !this._isStopped && callback();
    }, delayMs);
    this._trackedTimeouts.add(timeoutId);
    return timeoutId;
  }

  _clearTrackedTimeout(timeoutId) {
    if (!timeoutId) return;
    this._trackedTimeouts.delete(timeoutId);
    clearTimeout(timeoutId);
  }

  _clearTrackedTimeouts() {
    this._trackedTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._trackedTimeouts.clear();
  }

  _clearAnimationTracking(messageId) {
    if (!messageId) return;
    this.animatedMessages.delete(messageId);
    this._processingAnimations.delete(messageId);
  }

  _setTrackedInterval(callback, intervalMs) {
    const intervalId = setInterval(() => {
      !this._isStopped && callback();
    }, intervalMs);
    this._trackedIntervals.add(intervalId);
    return intervalId;
  }

  _clearTrackedIntervals() {
    this._trackedIntervals.forEach((intervalId) => clearInterval(intervalId));
    this._trackedIntervals.clear();
  }

  _cancelTrackedRafs() {
    this._trackedRafIds.forEach((rafId) => cancelAnimationFrame(rafId));
    this._trackedRafIds.clear();
  }

  _trackTransientObserver(observer) {
    observer && this._transientObservers.add(observer);
    return observer;
  }

  _disconnectTransientObserver(observer) {
    if (!observer) return;
    try {
      observer.disconnect();
    } catch (e) {
      // Ignore
    } finally {
      this._transientObservers.delete(observer);
    }
  }

  // Methods split into: debug.js, id-extraction.js, message-filtering.js, dom-helpers.js,
  // crit-engine.js, history.js, animation.js, styling.js, settings-panel.js, observer.js,
  // pipeline.js, restoration.js — merged via Object.assign at bottom of file.

  // FLUX DISPATCHER — Instant crit detection via MESSAGE_CREATE (v3.6.0)

  /**
   * Acquires Discord's FluxDispatcher and subscribes to MESSAGE_CREATE.
   * Uses the proven ShadowSenses 3-tier acquisition pattern.
   */
  _initDispatcher() {
    try {
      const { Webpack } = BdApi;
      this._Dispatcher =
        Webpack.Stores?.UserStore?._dispatcher ||           // Extract from Flux store (MOST RELIABLE)
        Webpack.getModule(m => m.dispatch && m.subscribe) || // NO optional chaining in filter!
        Webpack.getByKeys('actionLogger');                   // Legacy fallback

      if (!this._Dispatcher) {
        this.debugLog('DISPATCHER', 'FluxDispatcher not available yet — starting poll');
        this._startDispatcherWait();
        return;
      }

      this._subscribeDispatcher();
    } catch (error) {
      this.debugError('DISPATCHER', error, { phase: 'init' });
    }
  }

  /**
   * Polls for FluxDispatcher if not immediately available (30 attempts × 500ms).
   */
  _startDispatcherWait() {
    let attempts = 0;
    const maxAttempts = 30;

    const poll = () => {
      if (this._isStopped || this._Dispatcher) return;
      attempts++;

      const { Webpack } = BdApi;
      this._Dispatcher =
        Webpack.Stores?.UserStore?._dispatcher ||
        Webpack.getModule(m => m.dispatch && m.subscribe) ||
        Webpack.getByKeys('actionLogger');

      if (this._Dispatcher) {
        this.debugLog('DISPATCHER', `Acquired after ${attempts} polls`);
        this._subscribeDispatcher();
      } else if (attempts < maxAttempts) {
        this._setTrackedTimeout(poll, 500);
      } else {
        this.debugLog('DISPATCHER', 'Failed to acquire after 30 polls — falling back to observer-only');
      }
    };

    this._setTrackedTimeout(poll, 500);
  }

  /**
   * Subscribes the MESSAGE_CREATE handler to the Dispatcher.
   */
  _subscribeDispatcher() {
    if (!this._Dispatcher) return;

    this._handleMessageCreate = (payload) => this._onMessageCreate(payload);
    try {
      this._Dispatcher.subscribe('MESSAGE_CREATE', this._handleMessageCreate);
      this.debugLog('DISPATCHER', 'Subscribed to MESSAGE_CREATE');
    } catch (error) {
      this.debugError('DISPATCHER', error, { phase: 'subscribe' });
    }
  }

  // BETTERDISCORD PLUGIN LIFECYCLE METHODS
  // Required by BetterDiscord: start() and stop() methods

  /**
   * BetterDiscord plugin start method
   * Called when plugin is enabled or Discord starts
   * Initializes the plugin: loads history, injects CSS, starts observers
   */

  start() {
    this._toast = _PluginUtils?.createToastHelper?.("criticalHit") || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
    this._pluginUtils = _PluginUtils;
    this._reactUtils = _ReactUtils;
    try {
      if (!this._isStopped) {
        this.stop();
      }
      this._isStopped = false;

      // Defensive: clear any leftover scheduled work (in case BD reuses instance)
      this._clearTrackedTimeouts();
      this._clearTrackedIntervals();
      this._cancelTrackedRafs();

      // Load settings first (before any debug logging)
      this.loadSettings();

      // PERSISTENT STARTUP LOG: Always show this so user knows if debug mode is on
      console.log(`%c[CriticalHit] Plugin Started. Debug Mode: ${this.settings.debugMode ? 'ON' : 'OFF'}`, 'color: #ff0000; font-weight: bold; background: #222; padding: 4px; border-radius: 4px;');

      this.debugLog('PLUGIN_START', 'Starting CriticalHit plugin', {
        version: PLUGIN_VERSION,
        settings: {
          enabled: this.settings.enabled,
          critChance: this.settings.critChance,
          critGradient: this.settings.critGradient,
          debugMode: this.settings.debugMode,
        },
      });

      // Load message history from storage
      this.loadMessageHistory();

      // Load fonts first, then inject CSS styles
      // This ensures fonts are available before CSS tries to use them
      const critFontName = this._extractFontName(this.settings.critFont) || C.DEFAULT_CRIT_FONT;
      const animationFontName = this.settings.animationFont || C.DEFAULT_ANIMATION_FONT;

      // Force load both fonts immediately
      this.loadCritFont(critFontName);
      this.loadCritAnimationFont(animationFontName);

      // Inject all static CSS (keyframes, base classes, settings panel) + load fonts
      this.injectStaticCSS();
      this.injectCritCSS();
      this.injectAnimationCSS();

      // are available before observer-based processing starts.
      this.initializeWebpackModules();

      // Get current user ID before setting up hooks
      this.getCurrentUserId();

      // FluxDispatcher: instant crit detection for own messages (v3.6.0)
      this._initDispatcher();

      // Start observing for new messages (animation trigger + restoration)
      this.startObserving();

      // Start periodic cleanup if enabled
      if (this.settings.autoCleanupHistory) {
        this.startPeriodicCleanup();
      }

      this.debugLog('PLUGIN_START', 'SUCCESS: CriticalHit plugin started successfully');
    } catch (error) {
      this.debugError('PLUGIN_START', error, { phase: 'initialization' });
      this.debugError('START', error);
    }
  }

  /**
   * BetterDiscord plugin stop method
   * Called when plugin is disabled or Discord closes
   * Cleans up: saves history, stops observers, removes CSS
   */
  stop() {
    try {
      this._isStopped = true;

      this.debugLog('PLUGIN_STOP', 'Stopping CriticalHit plugin', {
        historySize: this.messageHistory.length,
        critCount: this.getCritHistory().length,
      });

      // Stop-safe: prevent any pending retries from firing after stop()
      this._clearTrackedTimeouts();
      this._clearTrackedIntervals();
      this._cancelTrackedRafs();

      // Restore global navigation hooks + disconnect URL observer
      this.teardownChannelChangeListener();

      // Flush any debounced settings save before stopping
      if (this._saveDebounceTimer) {
        clearTimeout(this._saveDebounceTimer);
        this._saveDebounceTimer = null;
        this._flushSaveSettings();
      }

      // OPTIMIZED: Force immediate save before stopping (bypass throttle)
      // Clear any pending throttled save
      this._clearTrackedTimeout(this._saveHistoryThrottle);
      this._saveHistoryThrottle = null;
      this._saveHistoryPending = false;
      // Save immediately (no throttle on stop - critical for data persistence)
      this.saveMessageHistory();

      // Unsubscribe FluxDispatcher
      if (this._Dispatcher && this._handleMessageCreate) {
        try { this._Dispatcher.unsubscribe('MESSAGE_CREATE', this._handleMessageCreate); } catch (_) {}
      }
      this._Dispatcher = null;
      this._handleMessageCreate = null;
      this._pendingAnimations?.clear();

      // Stop all observers
      if (this.messageObserver) {
        this.messageObserver.disconnect();
        this.messageObserver = null;
      }

      // Disconnect all transient observers (visual recheck observers, etc.)
      if (this._transientObservers?.size) {
        this._transientObservers.forEach((obs) => {
          try { obs.disconnect(); } catch (_) {}
        });
        this._transientObservers.clear();
      }

      // Clear pending recheck timers and map
      if (this._pendingRechecks?.size) {
        this._pendingRechecks.forEach((timers) => {
          timers.forEach((id) => clearTimeout(id));
        });
        this._pendingRechecks.clear();
      }

      // Stop periodic cleanup
      if (this.historyCleanupInterval) {
        clearInterval(this.historyCleanupInterval);
        this.historyCleanupInterval = null;
      }

      // Clear combo timers
      this.userCombos?.forEach((combo) => {
        this._clearTrackedTimeout(combo?.timeout);
        combo && (combo.timeout = null);
      });

      // Clear all caches
      if (this._cache) {
        this._cache.currentChannelId = null;
        this._cache.currentChannelIdTime = 0;
        this._cache.currentGuildId = null;
        this._cache.currentGuildIdTime = 0;
        this._cache.stats = null;
        this._cache.statsTime = 0;
        this._cache.urlChannelId = null;
        this._cache.urlChannelIdTime = 0;
        this._cache.urlChannelIdSource = null;
        this._cache.urlGuildId = null;
        this._cache.urlGuildIdTime = 0;
        this._cache.urlGuildIdSource = null;
      }

      // Clear cached DOM element references (prevent GC blocking on reload)
      this._cachedMessageContainer = null;
      this._cachedMessageContainerTimestamp = 0;

      // Remove injected CSS via BdApi
      BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.static);
      BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.crit);
      BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.critMessages);
      BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.settings);
      BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.animation);
      this._critCSSInjected = false; // Reset so CSS re-injects on next start()
      this.critCSSRules?.clear();
      if (this._critCSSRebuildRAF) {
        cancelAnimationFrame(this._critCSSRebuildRAF);
        this._critCSSRebuildRAF = null;
      }

      // Remove font link (manual DOM - dynamic ID)
      const fontLink = document.getElementById('bd-crit-hit-nova-flat-font');
      fontLink && fontLink.remove();

      // Unpatch all BetterDiscord patches (including message send hook and receive hook)
      try {
        BdApi.Patcher.unpatchAll('CriticalHit');
      } catch (error) {
        this.debugError('PLUGIN_STOP', error, { phase: 'unpatch' });
      }

      // Clear webpack module references
      if (this.webpackModules) {
        this.webpackModules.MessageStore = null;
        this.webpackModules.UserStore = null;
        this.webpackModules.MessageActions = null;
      }
      this.messageStorePatch = null;

      // Clear tracking data (with null checks)
      this.clearSessionTracking();
      this.pendingCrits && this.pendingCrits.clear();
      this.animatedMessages && this.animatedMessages.clear();
      this._diagLogThrottle && this._diagLogThrottle.clear();
      this.activeAnimations?.forEach((el) => this._cancelComboCountUp(el));
      this.activeAnimations && this.activeAnimations.clear();

      // Remove persistent animation container from DOM
      if (this.animationContainer) {
        this.animationContainer.remove();
        this.animationContainer = null;
      }

      // Remove screen-shake style element (injected by animation.js)
      if (this._shakeStyleEl) {
        this._shakeStyleEl.remove();
        this._shakeStyleEl = null;
      }

      this.detachCriticalHitSettingsPanelHandlers();

      this.debugLog('PLUGIN_STOP', 'SUCCESS: CriticalHit plugin stopped successfully');
    } catch (error) {
      this.debugError('PLUGIN_STOP', error, { phase: 'cleanup' });
      // Error already logged via debugError (only if debug enabled)
    }
  }

  // SECTION 4: DEBUGGING & DEVELOPMENT
  // Moved to end of file for better organization

  // SETTINGS MANAGEMENT

  /**
   * Loads settings from BetterDiscord storage
   * Syncs debug.enabled with settings.debugMode
   */
  loadSettings() {
    try {
      const saved = BdApi.Data.load('CriticalHit', 'settings');
      if (saved && typeof saved === 'object') {
        // Merge saved settings with defaults (preserve defaults for new settings)
        this.settings = { ...this.defaultSettings, ...saved };
      } else {
        // No saved settings, use defaults
        this.settings = structuredClone(this.defaultSettings);
      }

      // Force debug off — re-enable manually via settings when needed
      this.settings.debugMode = false;
      // Diagnostic stream is intentionally opt-in to avoid noisy consoles during normal play.
      this.settings.diagnosticLogs = false;

      // Sync debug.enabled with settings.debugMode
      this.debug.enabled = this.settings.debugMode === true;

      // OPTIMIZED: Update history limits from settings
      this.maxHistorySize = this.settings.maxHistorySize ?? 2000;
      this.maxCritHistory = this.settings.maxCritHistory ?? 1000;
      this.maxHistoryPerChannel = this.settings.maxHistoryPerChannel ?? 500;

      // Only log if debug mode is enabled (avoid circular logging)
      if (this.settings.debugMode === true) {
        this.debugLog('LOAD_SETTINGS', 'Settings loaded', {
          debugMode: this.settings.debugMode,
          debugEnabled: this.debug.enabled,
          maxHistorySize: this.maxHistorySize,
          maxCritHistory: this.maxCritHistory,
          maxHistoryPerChannel: this.maxHistoryPerChannel,
        });
      }
    } catch (error) {
      this.debugError('LOAD_SETTINGS', error);
      // Fallback to defaults on error
      this.settings = structuredClone(this.defaultSettings);
      // Ensure debugMode is false (default)
      this.settings.debugMode = false;
      this.settings.diagnosticLogs = false;
      this.debug.enabled = false;
    }
  }

  /**
   * Saves settings to BetterDiscord storage
   * Syncs debug.enabled with settings.debugMode before saving
   */
  /**
   * Debounced save — batches rapid settings changes (e.g. slider adjustments)
   * into a single disk write + CSS rebuild after 300ms of inactivity.
   */
  saveSettings() {
    // Sync debug state immediately (in-memory, no disk I/O)
    this.debug.enabled = this.settings.debugMode === true;

    // Debounce actual disk write + CSS rebuild
    if (this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
    this._saveDebounceTimer = setTimeout(() => {
      this._saveDebounceTimer = null;
      this._flushSaveSettings();
    }, 300);
  }

  /** Immediate disk write + CSS rebuild — called by debounce timer */
  _flushSaveSettings() {
    try {
      BdApi.Data.save('CriticalHit', 'settings', this.settings);

      // Only rebuild CSS if visual settings could have changed
      this._critCSSInjected = false;
      this.injectCritCSS();

      this.debugLog('SAVE_SETTINGS', 'Settings saved (debounced)', {
        debugMode: this.settings.debugMode,
        debugEnabled: this.debug.enabled,
      });
    } catch (error) {
      this.debugError('SAVE_SETTINGS', error);
    }
  }

  // debug.js: updateDebugMode, diagLog, debugLog, debugError

};

// Mixin split modules onto prototype (methods keep `this` binding)
// Phases will progressively add: require('./debug'), require('./id-extraction'), etc.
Object.assign(CriticalHit.prototype,
  require('./debug'),
  require('./id-extraction'),
  require('./message-filtering'),
  require('./dom-helpers'),
  require('./crit-engine'),
  require('./history'),
  require('./history-maintenance'),
  require('./animation'),
  require('./styling'),
  require('./settings-panel'),
  require('./restoration'),
  require('./pipeline'),
  require('./observer'),
);

module.exports = CriticalHit;
