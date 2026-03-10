const {
  DEFAULT_SETTINGS,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  PRESENCE_EVENT_NAMES,
  PURGE_INTERVAL_MS,
  RELATIONSHIP_EVENT_NAMES,
  TRANSITION_ID,
  WIDGET_SPACER_ID,
} = require("./constants");
const { DeploymentManager } = require("./deployment-manager");
const { buildComponents } = require("./components");
const ShadowSensesUiMethods = require("./plugin-ui-methods");
const SensesEngineFeed = require("./senses-engine-feed");
const SensesEngineEvents = require("./senses-engine-events");
const SensesEngineUtils = require("./senses-engine-utils");
const { _TransitionCleanupUtils } = require("./shared-utils");

// ─── SensesEngine ──────────────────────────────────────────────────────────

class SensesEngine {
  constructor(pluginRef) {
    this._plugin = pluginRef;
    this._guildFeeds = {};          // { guildId: entry[] } — per-guild persistent feeds
    this._lastSeenCount = {};       // { guildId: number } — track what user has seen per guild
    this._currentGuildId = null;
    this._sessionMessageCount = 0;
    this._totalDetections = 0;
    this._dirty = false;
    this._dirtyGuilds = new Set();  // Per-guild dirty tracking — flush only changed guilds
    this._flushInterval = null;
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;
    this._handlePresenceUpdate = null;
    this._handleTypingStart = null;
    this._handleRelationshipChange = null;
    this._subscribedEventHandlers = new Map(); // eventName -> Set<handler>
    this._totalFeedEntries = 0;  // Incremental counter — avoids O(G×F) per message
    this._feedVersion = 0;       // Bumped on every feed mutation — lets consumers skip unchanged polls
    this._burstMap = new Map();  // "authorId:channelId" -> { guildId, feedIndex, timestamp }

    // Presence detection — in-memory only, resets on restart/reload
    // Tracks last message timestamp per monitored user to detect:
    //   1. First activity after restart → "user is active" toast
    //   2. Return from AFK (1-3h silence) → "back from AFK" toast
    this._userLastActivity = new Map();  // authorId → { timestamp, notifiedActive }
    this._USER_ACTIVITY_MAX = 1000; // LRU cap — evict oldest when exceeded
    this._AFK_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours — sweet spot for real AFK detection
    this._subscribeTime = 0; // Set when subscribe() fires — used to defer early toasts
    this._statusByUserId = new Map(); // userId -> normalized status
    this._relationshipFriendIds = new Set();
    this._typingToastCooldown = new Map(); // userId:channelId -> timestamp
    this._deferredStatusToastTimers = new Set(); // startup-deferred status toast timers
    this._deferredUtilityToastTimers = new Set(); // deferred non-status toasts (startup grace)

    // Load persisted data — per-guild keys first, legacy monolithic fallback
    const feedGuildIds = BdApi.Data.load(PLUGIN_NAME, "feedGuildIds");
    if (Array.isArray(feedGuildIds) && feedGuildIds.length > 0) {
      this._guildFeeds = {};
      for (const gid of feedGuildIds) {
        const feed = BdApi.Data.load(PLUGIN_NAME, `feed_${gid}`);
        if (Array.isArray(feed) && feed.length > 0) {
          this._guildFeeds[gid] = feed;
        }
      }
    } else {
      // Legacy: single monolithic key (pre-Opt6 data)
      this._guildFeeds = BdApi.Data.load(PLUGIN_NAME, "guildFeeds") || {};
    }
    this._totalDetections = BdApi.Data.load(PLUGIN_NAME, "totalDetections") || 0;

    // Count existing entries for lastSeenCount (mark all persisted as "seen")
    // and initialize _totalFeedEntries from persisted data
    for (const guildId of Object.keys(this._guildFeeds)) {
      this._lastSeenCount[guildId] = this._guildFeeds[guildId].length;
      this._totalFeedEntries += this._guildFeeds[guildId].length;
    }

    // Purge entries older than 3 days on startup
    this._purgeOldEntries();
    // Keep history chat-only: status/typing/relationship events are toast-only intel
    this._purgeUtilityEntries();
    if (this._dirty) this._flushToDisk();

    this._plugin.debugLog("SensesEngine", "Loaded persisted feeds", {
      guilds: Object.keys(this._guildFeeds).length,
      totalEntries: this._totalFeedEntries,
    });
  }

  subscribe() {
    const Dispatcher = this._plugin._Dispatcher;
    if (!Dispatcher) {
      this._plugin.debugError("SensesEngine", "Dispatcher not available, cannot subscribe");
      return;
    }

    // Resolve unified toast engine (v2+)
    this._toastEngine = (() => {
      try {
        const p = BdApi.Plugins.get("SoloLevelingToasts");
        const inst = p?.instance;
        return inst?.toastEngineVersion >= 2 ? inst : null;
      } catch { return null; }
    })();
    this._plugin.debugLog("SensesEngine", `Toast engine: ${this._toastEngine ? "v2 connected" : "fallback mode"}`);

    // Store current guild — try immediately, retry if null (Discord may not be ready yet)
    try {
      this._currentGuildId = this._plugin._SelectedGuildStore
        ? this._plugin._SelectedGuildStore.getGuildId()
        : null;
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Failed to get initial guild ID", err);
    }
    this._plugin._debugMode && console.log(`[ShadowSenses] subscribe: _currentGuildId=${this._currentGuildId}`);

    // Mark current guild as seen
    if (this._currentGuildId && this._guildFeeds[this._currentGuildId]) {
      this._lastSeenCount[this._currentGuildId] = this._guildFeeds[this._currentGuildId].length;
    }

    this._handleMessageCreate = this._onMessageCreate.bind(this);
    this._handleChannelSelect = this._onChannelSelect.bind(this);
    this._handlePresenceUpdate = this._onPresenceUpdate.bind(this);
    this._handleTypingStart = this._onTypingStart.bind(this);
    this._handleRelationshipChange = this._onRelationshipChange.bind(this);

    this._subscribeEvent("MESSAGE_CREATE", this._handleMessageCreate);
    this._subscribeEvent("CHANNEL_SELECT", this._handleChannelSelect);
    this._subscribeEvent("TYPING_START", this._handleTypingStart);
    for (const eventName of PRESENCE_EVENT_NAMES) {
      this._subscribeEvent(eventName, this._handlePresenceUpdate);
    }
    for (const eventName of RELATIONSHIP_EVENT_NAMES) {
      this._subscribeEvent(eventName, this._handleRelationshipChange);
    }
    this._subscribeTime = Date.now();
    this._seedTrackedStatuses();
    this._snapshotFriendRelationships();

    // Start debounced flush interval (30s)
    this._flushInterval = setInterval(() => {
      if (!this._dirty) return;
      this._flushToDisk();
    }, 30000);

    // Periodic purge of old entries (every 10 minutes)
    this._purgeInterval = setInterval(() => this._purgeOldEntries(), PURGE_INTERVAL_MS);

    this._plugin.debugLog("SensesEngine", "Subscribed to dispatcher events", {
      currentGuildId: this._currentGuildId,
      events: Array.from(this._subscribedEventHandlers.keys()),
    });
  }

  unsubscribe() {
    const Dispatcher = this._plugin._Dispatcher;
    if (!Dispatcher) return;
    for (const [eventName, handlers] of this._subscribedEventHandlers.entries()) {
      for (const handler of handlers) {
        try {
          Dispatcher.unsubscribe(eventName, handler);
        } catch (err) {
          this._plugin.debugError("SensesEngine", `Failed to unsubscribe ${eventName}`, err);
        }
      }
    }
    this._subscribedEventHandlers.clear();
    this._burstMap?.clear();
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;
    this._handlePresenceUpdate = null;
    this._handleTypingStart = null;
    this._handleRelationshipChange = null;

    // Stop flush + purge intervals and do final flush
    if (this._flushInterval) {
      clearInterval(this._flushInterval);
      this._flushInterval = null;
    }
    if (this._purgeInterval) {
      clearInterval(this._purgeInterval);
      this._purgeInterval = null;
    }
    if (this._dirty) {
      this._flushToDisk();
    }

    this._typingToastCooldown.clear();
    this._statusByUserId.clear();
    this._relationshipFriendIds.clear();
    for (const timer of this._deferredStatusToastTimers) clearTimeout(timer);
    this._deferredStatusToastTimers.clear();
    for (const timer of this._deferredUtilityToastTimers) clearTimeout(timer);
    this._deferredUtilityToastTimers.clear();

    this._plugin.debugLog("SensesEngine", "Unsubscribed from all events");
  }

  _subscribeEvent(eventName, handler) {
    const Dispatcher = this._plugin._Dispatcher;
    if (!Dispatcher || !eventName || typeof handler !== "function") return false;
    const existing = this._subscribedEventHandlers.get(eventName);
    if (existing?.has(handler)) {
      this._plugin.debugLog("SensesEngine", `Duplicate subscribe ignored for ${eventName}`);
      return true;
    }
    try {
      Dispatcher.subscribe(eventName, handler);
      if (existing) {
        existing.add(handler);
      } else {
        this._subscribedEventHandlers.set(eventName, new Set([handler]));
      }
      return true;
    } catch (err) {
      this._plugin.debugError("SensesEngine", `Failed to subscribe ${eventName}`, err);
      return false;
    }
  }

  // Feed/utils/event handler methods are mixed in from dedicated modules.

  _clearDispatcherSubscriptions() {
    const Dispatcher = this._plugin._Dispatcher;
    if (!(Dispatcher && this._subscribedEventHandlers?.size > 0)) return;

    for (const [eventName, handlers] of this._subscribedEventHandlers.entries()) {
      for (const handler of handlers) {
        try {
          Dispatcher.unsubscribe(eventName, handler);
        } catch (_) {}
      }
    }
    this._subscribedEventHandlers.clear();
  }

  _clearDeferredToastTimers() {
    if (this._deferredStatusToastTimers instanceof Set) {
      for (const timer of this._deferredStatusToastTimers) clearTimeout(timer);
    }
    if (this._deferredUtilityToastTimers instanceof Set) {
      for (const timer of this._deferredUtilityToastTimers) clearTimeout(timer);
    }
  }

  _resetRuntimeState() {
    this._guildFeeds = {};
    this._lastSeenCount = {};
    this._burstMap = new Map();
    this._currentGuildId = null;
    this._sessionMessageCount = 0;
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;
    this._handlePresenceUpdate = null;
    this._handleTypingStart = null;
    this._handleRelationshipChange = null;
    this._subscribedEventHandlers = new Map();
    this._dirty = false;
    this._dirtyGuilds = new Set();
    this._totalFeedEntries = 0;
    this._feedVersion = 0;
    this._statusByUserId = new Map();
    this._typingToastCooldown = new Map();
    this._relationshipFriendIds = new Set();
    this._deferredStatusToastTimers = new Set();
    this._deferredUtilityToastTimers = new Set();
  }

  clear() {
    // Unsubscribe first to avoid dangling handlers during teardown.
    this._clearDispatcherSubscriptions();
    this._clearDeferredToastTimers();
    this._resetRuntimeState();
  }
}

Object.assign(
  SensesEngine.prototype,
  SensesEngineUtils,
  SensesEngineFeed,
  SensesEngineEvents
);

// ─── CSS ───────────────────────────────────────────────────────────────────

// ─── Shared Utilities ─────────────────────────────────────────────────────

// ─── Plugin Class ──────────────────────────────────────────────────────────

module.exports = class ShadowSenses {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._transitionNavTimeout = null;
    this._transitionCleanupTimeout = null;
    this._transitionRunId = 0;
    this._transitionStopCanvas = null;
    this._navigateRetryTimers = new Set();
    this._navigateRequestId = 0;
    this._channelFadeToken = 0;
    this._channelFadeResetTimer = null;
  }

  start() {
    try {
      this._debugMode = BdApi.Data.load(PLUGIN_NAME, "debugMode") ?? false;
      if (this._debugMode) {
        console.log(`[${PLUGIN_NAME}] Starting v${PLUGIN_VERSION}...`);
      }
      this.loadSettings();
      this._stopped = false;
      this._widgetDirty = true;
      this._panelOpen = false;
      this._transitionNavTimeout = null;
      this._transitionCleanupTimeout = null;
      this._transitionRunId = 0;
      this._transitionStopCanvas = null;
      this._navigateRetryTimers = new Set();
      this._navigateRequestId = 0;
      this._channelFadeToken = 0;
      this._channelFadeResetTimer = null;

      // DeploymentManager
      this.deploymentManager = new DeploymentManager(
        (...args) => this.debugLog(...args),
        (...args) => this.debugError(...args)
      );
      this.deploymentManager.load();

      // Webpack modules
      this.initWebpack();

      // SensesEngine
      this.sensesEngine = new SensesEngine(this);

      // Subscribe immediately if Dispatcher ready, otherwise poll until available
      if (this._Dispatcher) {
        this.sensesEngine.subscribe();
      } else {
        this._startDispatcherWait();
      }

      // CSS
      this.injectCSS();

      // React components
      this._components = buildComponents(this);

      // Widget
      this.injectWidget();
      this.setupWidgetObserver();

      // ESC handler + context menu
      this.registerEscHandler();
      this.patchContextMenu();

      this.debugLog("Lifecycle", "Started successfully");
      this._toast(`${PLUGIN_NAME} v${PLUGIN_VERSION} \u2014 Shadow deployment online`);
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] FATAL: start() crashed:`, err);
      this._toast(`${PLUGIN_NAME} failed to start: ${err.message}`, "error");
    }
  }

  stop() {
    try {
      // 0. Mark stopped + clear Dispatcher retry timer if still pending
      this._stopped = true;
      if (this._dispatcherRetryTimer) {
        clearTimeout(this._dispatcherRetryTimer);
        this._dispatcherRetryTimer = null;
      }

      // 1. Unsubscribe Dispatcher + final flush (persists feeds to disk)
      if (this.sensesEngine) {
        this.sensesEngine.unsubscribe();
        this.sensesEngine = null;
      }

      // 2. Unpatch context menu
      if (this._unpatchContextMenu) {
        try { this._unpatchContextMenu(); } catch (_) { this.debugLog?.('CLEANUP', 'Context menu unpatch error', _); }
        this._unpatchContextMenu = null;
      }

      // 3. Close panel
      this.closePanel();

      // 4. Widget + observer — PERF(P5-4): Unsubscribe from shared LayoutObserverBus
      if (this._layoutBusUnsub) {
        this._layoutBusUnsub();
        this._layoutBusUnsub = null;
      }
      clearTimeout(this._widgetReinjectTimeout);
      this._widgetReinjectTimeout = null;
      this.removeWidget();

      // 4b. Direct spacer cleanup (in case removeWidget didn't run)
      try {
        const spacer = document.getElementById(WIDGET_SPACER_ID);
        if (spacer) spacer.remove();
      } catch (_) { this.debugLog?.('CLEANUP', 'Spacer cleanup error', _); }

      // 5. ESC handler
      if (this._escHandler) {
        document.removeEventListener("keydown", this._escHandler);
        this._escHandler = null;
      }

      // 6. Stop and remove any active transition
      _TransitionCleanupUtils?.cancelPendingTransition?.(this);
      _TransitionCleanupUtils?.clearNavigateRetries?.(this);
      _TransitionCleanupUtils?.cancelChannelViewFade?.(this);

      // 7. CSS
      this.removeCSS();

      // 7. Clear refs
      this._components = null;
      this.deploymentManager = null;
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    this._toast(`${PLUGIN_NAME} \u2014 Shadows recalled`);
  }

  _toast(message, type = "info", timeout = null) {
    const engine = this.sensesEngine?._toastEngine;
    if (engine) {
      engine.showToast(message, type, timeout, { callerId: "shadowSenses" });
    } else {
      BdApi.UI.showToast(message, { type: type === "level-up" ? "info" : type });
    }
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load(PLUGIN_NAME, "settings");
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...(saved && typeof saved === "object" ? saved : {}),
      };
    } catch (err) {
      this.debugError("Settings", "Failed to load settings; using defaults", err);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save(PLUGIN_NAME, "settings", this.settings);
    } catch (err) {
      this.debugError("Settings", "Failed to save settings", err);
    }
  }

  initWebpack() {
    const { Webpack } = BdApi;
    // Dispatcher: extract from Flux store (most reliable), then filter fallback, then legacy key
    // IMPORTANT: NO optional chaining in Webpack.getModule filter — breaks BD matching
    this._Dispatcher =
      Webpack.Stores?.UserStore?._dispatcher ||
      Webpack.getModule(m => m.dispatch && m.subscribe) ||
      Webpack.getByKeys("actionLogger") ||
      null;
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._GuildStore = Webpack.getStore("GuildStore");
    this._UserStore = Webpack.getStore("UserStore");
    this._PresenceStore = Webpack.getStore("PresenceStore");
    this._RelationshipStore = Webpack.getStore("RelationshipStore");
    this._GuildMemberStore = Webpack.getStore("GuildMemberStore");
    this._NavigationUtils =
      Webpack.getByKeys("transitionTo", "back", "forward") ||
      Webpack.getModule(m => m.transitionTo && m.back && m.forward);
    this.debugLog("Webpack", "Modules acquired (sync)", {
      Dispatcher: !!this._Dispatcher,
      ChannelStore: !!this._ChannelStore,
      SelectedGuildStore: !!this._SelectedGuildStore,
      GuildStore: !!this._GuildStore,
      UserStore: !!this._UserStore,
      PresenceStore: !!this._PresenceStore,
      RelationshipStore: !!this._RelationshipStore,
      GuildMemberStore: !!this._GuildMemberStore,
      NavigationUtils: !!this._NavigationUtils,
    });
  }

  /**
   * Resolve a guild's display name from its ID.
   * @param {string} guildId
   * @returns {string} Guild name or truncated ID fallback
   */
  _getGuildName(guildId) {
    try {
      const guild = this._GuildStore?.getGuild(guildId);
      return guild?.name || guildId?.slice(-6) || "Unknown";
    } catch (_) {
      return guildId?.slice(-6) || "Unknown";
    }
  }

  _startDispatcherWait() {
    let attempt = 0;
    const maxAttempts = 30; // 30 × 500ms = 15s

    const tryAcquire = () => {
      if (this._stopped) return;
      attempt++;

      // Dispatcher: extract from Flux store (most reliable) — NO optional chaining in filter
      this._Dispatcher =
        BdApi.Webpack.Stores?.UserStore?._dispatcher ||
        BdApi.Webpack.getModule(m => m.dispatch && m.subscribe) ||
        BdApi.Webpack.getByKeys("actionLogger") ||
        null;

      if (this._Dispatcher) {
        this.debugLog("Webpack", `Dispatcher acquired on poll #${attempt} (${attempt * 500}ms)`);
        this.initWebpack();
        if (this.sensesEngine) this.sensesEngine.subscribe();
        return;
      }

      if (attempt >= maxAttempts) {
        console.error(`[${PLUGIN_NAME}] Dispatcher unavailable after ${maxAttempts} polls (~15s) — message detection will NOT work`);
        this._toast(`${PLUGIN_NAME}: Dispatcher not found — message detection disabled`, "error");
        return;
      }
      this._dispatcherRetryTimer = setTimeout(tryAcquire, 500);
    };

    this._dispatcherRetryTimer = setTimeout(tryAcquire, 500);
  }

  teleportToPath(path, context = {}) {
    const targetPath = this._normalizePath(path);
    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      _ensureShadowPortalCoreApplied(this.constructor);
    }

    // Fail-safe: do not throw if shared core failed to load.
    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      this.debugError("Teleport", "Shared portal core missing; using direct navigation fallback");
      if (this._NavigationUtils?.transitionTo) {
        this._NavigationUtils.transitionTo(targetPath);
      } else if (window.history?.pushState) {
        window.history.pushState({}, "", targetPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      this._toast("Shadow Senses navigation fallback used", "warning");
      return;
    }

    this.playTransition(() => {
      const fadeToken = this._beginChannelViewFadeOut();
      this._navigate(targetPath, context, {
        onConfirmed: () => this._finishChannelViewFade(fadeToken, true),
        onFailed: () => this._finishChannelViewFade(fadeToken, false),
      });
    }, targetPath);
  }

  // UI/widget/panel/settings methods are mixed in from plugin-ui-methods.js
};

Object.assign(module.exports.prototype, ShadowSensesUiMethods);

const _getShadowPortalCoreCandidates = (path) => {
  const candidates = [];
  if (BdApi?.Plugins?.folder && typeof BdApi.Plugins.folder === "string") {
    candidates.push(path.join(BdApi.Plugins.folder, "ShadowPortalCore.js"));
  }
  candidates.push("./ShadowPortalCore.js");
  return candidates;
};

const _tryLoadShadowPortalCoreViaRequire = (candidate) => {
  try {
    const resolved = require.resolve(candidate);
    if (require.cache[resolved]) delete require.cache[resolved];
    const mod = require(resolved);
    return mod?.applyPortalCoreToClass ? mod : null;
  } catch (_) {
    return null;
  }
};

const _resolveShadowPortalAbsolutePath = (path, candidate) => {
  if (path.isAbsolute(candidate)) return candidate;
  const pluginsFolder = BdApi?.Plugins?.folder || "";
  return path.join(pluginsFolder, candidate.replace(/^\.\//, ""));
};

const _tryLoadShadowPortalCoreViaFactory = (path, fs, candidate) => {
  try {
    const absolute = _resolveShadowPortalAbsolutePath(path, candidate);
    if (!absolute || !fs.existsSync(absolute)) return null;

    const source = fs.readFileSync(absolute, "utf8");
    const moduleObj = { exports: {} };
    const factory = new Function(
      "module",
      "exports",
      "require",
      "window",
      "BdApi",
      `${source}\nreturn module.exports || exports || (window && window.ShadowPortalCore) || null;`
    );
    const loaded = factory(
      moduleObj,
      moduleObj.exports,
      require,
      typeof window !== "undefined" ? window : null,
      BdApi
    );
    const mod =
      loaded ||
      moduleObj.exports ||
      (typeof window !== "undefined" ? window.ShadowPortalCore : null);
    return mod?.applyPortalCoreToClass ? mod : null;
  } catch (_) {
    return null;
  }
};

const _loadShadowPortalCore = () => {
  try {
    const path = require("path");
    const fs = require("fs");
    const candidates = _getShadowPortalCoreCandidates(path);

    for (const candidate of candidates) {
      const fromRequire = _tryLoadShadowPortalCoreViaRequire(candidate);
      if (fromRequire) return fromRequire;

      const fromFactory = _tryLoadShadowPortalCoreViaFactory(path, fs, candidate);
      if (fromFactory) return fromFactory;
    }
  } catch (_) {}
  return typeof window !== "undefined" ? window.ShadowPortalCore || null : null;
};

const SHADOW_PORTAL_CONFIG = {
  transitionId: TRANSITION_ID,
  navigationFailureToast: "Shadow Senses failed to switch channel",
  contextLabelKeys: ["anchorName", "targetUsername", "targetName", "label", "name"],
};

const _ensureShadowPortalCoreApplied = (PluginClass = module.exports) => {
  const core = _loadShadowPortalCore();
  if (!core?.applyPortalCoreToClass) return false;
  core.applyPortalCoreToClass(PluginClass, SHADOW_PORTAL_CONFIG);
  return true;
};

if (!_ensureShadowPortalCoreApplied(module.exports)) {
  const warnOnceKey = "__shadowSensesPortalCoreWarned";
  if (typeof window !== "undefined" && !window[warnOnceKey]) {
    window[warnOnceKey] = true;
    console.warn(`[${PLUGIN_NAME}] Shared portal core unavailable. Navigation/transition patch will not be shared.`);
  }
}
