const { version: PLUGIN_VERSION } = require("./manifest.json");
const C = require("./constants");
const { FRIENDORFOEBB_WOFF2_DATA, SPEEDYSPACEGOATODDITY_WOFF2_DATA } = require("./font-data");

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

let _ReactUtils;
try { _ReactUtils = _bdLoad('BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

const CriticalHit = class CriticalHit {
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
  // Uses shared 6-tier acquisition with exponential backoff (src/shared/dispatcher.js)

  _initDispatcher() {
    const { acquireDispatcher, pollForDispatcher } = require('../shared/dispatcher');
    try {
      this._Dispatcher = acquireDispatcher();
      if (this._Dispatcher) {
        this._subscribeDispatcher();
        return;
      }

      this.debugLog('DISPATCHER', 'FluxDispatcher not available yet — starting poll');
      this._dispatcherPollHandle = pollForDispatcher({
        onAcquired: (d) => {
          this._Dispatcher = d;
          this.debugLog('DISPATCHER', 'Acquired via polling');
          this._subscribeDispatcher();
        },
        onTimeout: () => {
          this.debugLog('DISPATCHER', 'Failed to acquire after 30s — falling back to observer-only');
        },
        onPoll: (attempt) => {
          if (this._isStopped) this._dispatcherPollHandle?.cancel();
        },
      });
    } catch (error) {
      this.debugError('DISPATCHER', error, { phase: 'init' });
    }
  }

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

  start() {
    this._toast = _PluginUtils?.createToastHelper?.("criticalHit") || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
    this._pluginUtils = _PluginUtils;
    this._reactUtils = _ReactUtils;
    try {
      if (!this._isStopped) {
        this.stop();
      }
      this._isStopped = false;

      // BUGFIX: Clear leftover scheduled work — BD may reuse instance on hot reload
      this._clearTrackedTimeouts();
      this._clearTrackedIntervals();
      this._cancelTrackedRafs();

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

      this.loadMessageHistory();

      const critFontName = this._extractFontName(this.settings.critFont) || C.DEFAULT_CRIT_FONT;
      const animationFontName = this.settings.animationFont || C.DEFAULT_ANIMATION_FONT;

      this.loadCritFont(critFontName);
      this.loadCritAnimationFont(animationFontName);
      this.injectStaticCSS();
      this.injectCritCSS();
      this.injectAnimationCSS();

      this.initializeWebpackModules();
      this.getCurrentUserId();

      this._initDispatcher();
      this.startObserving();

      if (this.settings.autoCleanupHistory) {
        this.startPeriodicCleanup();
      }

      this.debugLog('PLUGIN_START', 'SUCCESS: CriticalHit plugin started successfully');
    } catch (error) {
      this.debugError('PLUGIN_START', error, { phase: 'initialization' });
      this.debugError('START', error);
    }
  }

  stop() {
    try {
      this._isStopped = true;

      this.debugLog('PLUGIN_STOP', 'Stopping CriticalHit plugin', {
        historySize: this.messageHistory.length,
        critCount: this.getCritHistory().length,
      });

      this._clearTrackedTimeouts();
      this._clearTrackedIntervals();
      this._cancelTrackedRafs();

      this.teardownChannelChangeListener();

      if (this._saveDebounceTimer) {
        clearTimeout(this._saveDebounceTimer);
        this._saveDebounceTimer = null;
        this._flushSaveSettings();
      }

      // CRITICAL: Force save now — bypass throttle before shutdown
      this._clearTrackedTimeout(this._saveHistoryThrottle);
      this._saveHistoryThrottle = null;
      this._saveHistoryPending = false;
      this.saveMessageHistory();

      if (this._Dispatcher && this._handleMessageCreate) {
        try { this._Dispatcher.unsubscribe('MESSAGE_CREATE', this._handleMessageCreate); } catch (_) {}
      }
      this._Dispatcher = null;
      this._handleMessageCreate = null;
      this._pendingAnimations?.clear();

      if (this.messageObserver) {
        this.messageObserver.disconnect();
        this.messageObserver = null;
      }

      if (this._transientObservers?.size) {
        this._transientObservers.forEach((obs) => {
          try { obs.disconnect(); } catch (_) {}
        });
        this._transientObservers.clear();
      }

      if (this._pendingRechecks?.size) {
        this._pendingRechecks.forEach((timers) => {
          timers.forEach((id) => clearTimeout(id));
        });
        this._pendingRechecks.clear();
      }

      if (this.historyCleanupInterval) {
        clearInterval(this.historyCleanupInterval);
        this.historyCleanupInterval = null;
      }

      this.userCombos?.forEach((combo) => {
        this._clearTrackedTimeout(combo?.timeout);
        combo && (combo.timeout = null);
      });

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

      this._cachedMessageContainer = null;
      this._cachedMessageContainerTimestamp = 0;

      BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.static);
      BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.crit);
      BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.critMessages);
      BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.settings);
      BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.animation);
      this._critCSSInjected = false;
      this.critCSSRules?.clear();
      if (this._critCSSRebuildRAF) {
        cancelAnimationFrame(this._critCSSRebuildRAF);
        this._critCSSRebuildRAF = null;
      }

      const fontLink = document.getElementById('bd-crit-hit-nova-flat-font');
      fontLink && fontLink.remove();

      try {
        BdApi.Patcher.unpatchAll('CriticalHit');
      } catch (error) {
        this.debugError('PLUGIN_STOP', error, { phase: 'unpatch' });
      }

      if (this.webpackModules) {
        this.webpackModules.MessageStore = null;
        this.webpackModules.UserStore = null;
        this.webpackModules.MessageActions = null;
      }
      this.messageStorePatch = null;

      this.clearSessionTracking();
      this.pendingCrits && this.pendingCrits.clear();
      this.animatedMessages && this.animatedMessages.clear();
      this._diagLogThrottle && this._diagLogThrottle.clear();
      this.activeAnimations?.forEach((el) => this._cancelComboCountUp(el));
      this.activeAnimations && this.activeAnimations.clear();

      if (this.animationContainer) {
        this.animationContainer.remove();
        this.animationContainer = null;
      }

      if (this._shakeStyleEl) {
        this._shakeStyleEl.remove();
        this._shakeStyleEl = null;
      }

      this.detachCriticalHitSettingsPanelHandlers();

      this.debugLog('PLUGIN_STOP', 'SUCCESS: CriticalHit plugin stopped successfully');
    } catch (error) {
      this.debugError('PLUGIN_STOP', error, { phase: 'cleanup' });
    }
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load('CriticalHit', 'settings');
      if (saved && typeof saved === 'object') {
        this.settings = { ...this.defaultSettings, ...saved };
      } else {
        this.settings = structuredClone(this.defaultSettings);
      }

      // Force debug/diagnostic off — opt-in only; never persist ON across restarts
      this.settings.debugMode = false;
      this.settings.diagnosticLogs = false;

      this.debug.enabled = this.settings.debugMode === true;
      this.maxHistorySize = this.settings.maxHistorySize ?? 2000;
      this.maxCritHistory = this.settings.maxCritHistory ?? 1000;
      this.maxHistoryPerChannel = this.settings.maxHistoryPerChannel ?? 500;

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
      this.settings = structuredClone(this.defaultSettings);
      this.settings.debugMode = false;
      this.settings.diagnosticLogs = false;
      this.debug.enabled = false;
    }
  }

  /** Debounced save — batches rapid settings changes into a single disk write after 300ms. */
  saveSettings() {
    this.debug.enabled = this.settings.debugMode === true;

    if (this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
    this._saveDebounceTimer = setTimeout(() => {
      this._saveDebounceTimer = null;
      this._flushSaveSettings();
    }, 300);
  }

  _flushSaveSettings() {
    try {
      BdApi.Data.save('CriticalHit', 'settings', this.settings);
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
