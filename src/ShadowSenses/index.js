const fs = require("fs");
const path = require("path");
const {
  DEFAULT_SETTINGS,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  PRESENCE_EVENT_NAMES,
  PURGE_INTERVAL_MS,
  RELATIONSHIP_EVENT_NAMES,
  STARTUP_REPORT_ARTWORK_FALLBACK_URL,
  STARTUP_TOAST_GRACE_MS,
  STATUS_POLL_INTERVAL_MS,
  TRANSITION_ID,
  WIDGET_SPACER_ID,
} = require("./constants");
const { loadSettings, saveSettings } = require("../shared/settings");
const { DeploymentManager } = require("./deployment-manager");
const { buildComponents } = require("./components");
const ShadowSensesUiMethods = require("./plugin-ui-methods");
const SensesEngineFeed = require("./senses-engine-feed");
const SensesEngineEvents = require("./senses-engine-events");
const SensesEngineUtils = require("./senses-engine-utils");
const { _TransitionCleanupUtils } = require("./shared-utils");
const { createToast } = require("../shared/toast");
let _EmbeddedShadowPortalCore;
try { _EmbeddedShadowPortalCore = require("../ShadowPortalCore"); } catch (_) { _EmbeddedShadowPortalCore = null; }
const _fallbackToast = createToast();
const STARTUP_NOISE_TOPICS = new Set(["lmao", "lmfao", "lol", "ooo", "ohh", "haha", "fr", "ok", "k", "uwu"]);

function toFileUrl(filePath) {
  const resolvedPath = path.resolve(String(filePath || ""));
  const normalizedPath = resolvedPath.replace(/\\/g, "/");
  const urlPath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return `file://${encodeURI(urlPath).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

function parseEnvValue(content, key) {
  if (typeof content !== "string" || !content) return "";
  const escapedKey = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^\\s*${escapedKey}\\s*=\\s*(.*)\\s*$`, "m");
  const match = content.match(regex);
  if (!match) return "";
  let value = String(match[1] || "").trim();
  if (!value) return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value.trim();
}

// SensesEngine

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
    this._presenceStore = null;
    this._presenceStoreListener = null;
    this._presencePollDebounce = null;
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;
    this._handlePresenceUpdate = null;
    this._handleTypingStart = null;
    this._handleRelationshipChange = null;
    this._subscribedEventHandlers = new Map(); // eventName -> Set<handler>
    this._totalFeedEntries = 0;  // Incremental counter — avoids O(G×F) per message

    // _feedVersion — bumped on every feed mutation. Setter emits a
    // 'change' event on _feedBus so React components (FeedTab) can
    // subscribe instead of polling. All `ctx._feedVersion++` write
    // sites across senses-engine-feed.js go through this setter
    // unchanged.
    this._feedBus = new EventTarget();
    this.__feedVersion = 0;
    Object.defineProperty(this, "_feedVersion", {
      get() { return this.__feedVersion; },
      set(value) {
        this.__feedVersion = value;
        if (this._feedBus) this._feedBus.dispatchEvent(new Event("change"));
      },
      configurable: true,
      enumerable: true,
    });

    this._burstMap = new Map();  // "authorId:channelId" -> { guildId, feedIndex, timestamp }

    // Presence detection — in-memory only, resets on restart/reload
    // Tracks last message timestamp per monitored user to detect:
    //   1. First activity after restart → "user is active" toast
    //   2. Return from AFK (1-3h silence) → "back from AFK" toast
    this._userLastActivity = new Map();  // authorId → { timestamp, notifiedActive }
    this._sessionActivityNotified = new Set(); // authorId -> first-session activity toast emitted
    this._activitySeededFromHistory = false;
    this._activityIndexDirty = false;
    this._USER_ACTIVITY_MAX = 1000; // LRU cap — evict oldest when exceeded
    this._AFK_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours — sweet spot for real AFK detection
    this._subscribeTime = 0; // Set when subscribe() fires — used to defer early toasts
    this._statusByUserId = new Map(); // userId -> normalized status
    this._presenceStatusMissCount = new Map(); // userId -> consecutive empty PresenceStore reads
    this._relationshipFriendIds = new Set();
    this._typingToastCooldown = new Map(); // userId:channelId -> timestamp
    this._invisibleToastCooldown = new Map(); // userId:channelId -> timestamp
    this._deferredStatusToastTimers = new Set(); // startup-deferred status toast timers
    this._deferredUtilityToastTimers = new Set(); // deferred non-status toasts (startup grace)

    // Unread badge counter — tracks messages arrived since last panel open
    this._unreadCount = 0;
    this._lastPanelOpenedAt = Date.now(); // Messages before this are "seen"

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
    const persistedActivityIndex = BdApi.Data.load(PLUGIN_NAME, "userLastActivityIndex");
    if (persistedActivityIndex && typeof persistedActivityIndex === "object") {
      for (const [userId, savedValue] of Object.entries(persistedActivityIndex)) {
        const timestamp = Number(
          savedValue && typeof savedValue === "object"
            ? (savedValue.t ?? savedValue.timestamp)
            : savedValue
        ) || 0;
        const isFallback = !!(
          savedValue &&
          typeof savedValue === "object" &&
          (savedValue.f || savedValue.isFallback)
        );
        const normalizedUserId = String(userId || "");
        if (!normalizedUserId || timestamp <= 0) continue;
        this._userLastActivity.set(normalizedUserId, {
          timestamp,
          notifiedActive: false,
          isFallback,
        });
      }
      if (this._userLastActivity.size > this._USER_ACTIVITY_MAX) {
        const trimmed = Array.from(this._userLastActivity.entries())
          .sort((a, b) => (b[1]?.timestamp || 0) - (a[1]?.timestamp || 0))
          .slice(0, this._USER_ACTIVITY_MAX);
        this._userLastActivity = new Map(trimmed);
        this._activityIndexDirty = true;
      }
    }

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
    if (this._dirty || this._activityIndexDirty) this._flushToDisk();

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
    this._seedUserActivityFromFeeds();
    this._snapshotFriendRelationships();

    // Presence change listener — replaces the prior 10s setInterval
    // fallback. PresenceStore.addChangeListener fires on every store
    // mutation (which is broader than dispatcher payloads — it catches
    // the merged-truth state Discord uses internally). Debounced via
    // setTimeout(200ms) so a burst of presence changes triggers one
    // _pollMonitoredPresenceStatuses pass instead of N. The dispatcher
    // subscriptions above remain primary; this store listener is the
    // belt-and-suspenders that fills the "missed transitions" gap the
    // poll used to handle.
    try {
      const PresenceStore = BdApi.Webpack.getStore?.("PresenceStore");
      if (PresenceStore && typeof PresenceStore.addChangeListener === "function") {
        this._presenceStoreListener = () => {
          if (this._plugin._stopped) return;
          if (document.hidden) return;
          if (this._presencePollDebounce) return;
          this._presencePollDebounce = setTimeout(() => {
            this._presencePollDebounce = null;
            this._pollMonitoredPresenceStatuses("store-change");
          }, 200);
        };
        PresenceStore.addChangeListener(this._presenceStoreListener);
        this._presenceStore = PresenceStore;
      }
    } catch (_) {}

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
    if (this._presenceStore && this._presenceStoreListener) {
      try { this._presenceStore.removeChangeListener(this._presenceStoreListener); } catch (_) {}
      this._presenceStore = null;
      this._presenceStoreListener = null;
    }
    if (this._presencePollDebounce) {
      clearTimeout(this._presencePollDebounce);
      this._presencePollDebounce = null;
    }
    if (this._dirty || this._activityIndexDirty) {
      this._flushToDisk();
    }

    this._typingToastCooldown.clear();
    this._invisibleToastCooldown.clear();
    this._statusByUserId.clear();
    this._presenceStatusMissCount.clear();
    this._relationshipFriendIds.clear();
    this._sessionActivityNotified.clear();
    this._activitySeededFromHistory = false;
    this._activityIndexDirty = false;
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
    this._presenceStatusMissCount = new Map();
    this._typingToastCooldown = new Map();
    this._invisibleToastCooldown = new Map();
    this._relationshipFriendIds = new Set();
    this._userLastActivity = new Map();
    this._sessionActivityNotified = new Set();
    this._activitySeededFromHistory = false;
    this._activityIndexDirty = false;
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

module.exports = class ShadowSenses {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._stopped = true;

    // Widget dirty-flag with event emission. Setter fires 'dirty' on
    // every false→true transition so the SensesWidget React component
    // can subscribe instead of polling every 3s. All ~8 existing write
    // sites across this file, plugin-ui-methods.js, components.js,
    // senses-engine-events.js go through the setter unchanged.
    this._widgetBus = new EventTarget();
    this.__widgetDirty = false;
    Object.defineProperty(this, "_widgetDirty", {
      get() { return this.__widgetDirty; },
      set(value) {
        const wasFalsy = !this.__widgetDirty;
        this.__widgetDirty = !!value;
        if (this.__widgetDirty && wasFalsy && this._widgetBus) {
          this._widgetBus.dispatchEvent(new Event("dirty"));
        }
      },
      configurable: true,
      enumerable: true,
    });

    this._dispatcherPollHandle = null;
    this._widgetReinjectTimeout = null;
    this._unpatchContextMenu = null;
    this._layoutBusUnsub = null;
    this.sensesEngine = null;
    this.deploymentManager = null;
    this._components = null;
    this._transitionNavTimeout = null;
    this._transitionCleanupTimeout = null;
    this._transitionRunId = 0;
    this._transitionStopCanvas = null;
    this._navigateRetryTimers = new Set();
    this._navigateRequestId = 0;
    this._channelFadeToken = 0;
    this._channelFadeResetTimer = null;
    this._startupReportTimer = null;
  }

  /**
   * Check if a SkillTree skill is unlocked (level >= 1).
   */
  _isSkillTreeSkillUnlocked(skillId) {
    try {
      const plugin = BdApi.Plugins.get('SkillTree');
      const instance = plugin?.instance || null;
      if (!instance || typeof instance.getSkillLevel !== 'function') return false;
      return instance.getSkillLevel(skillId) >= 1;
    } catch {
      return false;
    }
  }

  start() {
    try {
      if (!this._stopped) {
        this.stop(false);
      }
      this._debugMode = BdApi.Data.load(PLUGIN_NAME, "debugMode") ?? false;
      if (this._debugMode) {
        console.log(`[${PLUGIN_NAME}] Starting v${PLUGIN_VERSION}...`);
      }
      this.loadSettings();
      this._stopped = false;
      this._sensesResourcesActive = false;
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
      this._startupReportTimer = null;

      // Listen for SkillTree skill changes (activate/deactivate on unlock/reset)
      this._onSkillLevelChanged = (event) => {
        if (this._stopped) return;
        const { skillId, level } = event.detail || {};
        if (skillId !== 'shadow_senses') return;
        if (level >= 1 && !this._sensesResourcesActive) {
          this.debugLog('SKILL_GATE', 'shadow_senses unlocked — activating senses resources');
          this._activateSensesResources();
        } else if (level < 1 && this._sensesResourcesActive) {
          this.debugLog('SKILL_GATE', 'shadow_senses reset — tearing down senses resources');
          this._deactivateSensesResources();
        }
      };
      document.addEventListener('SkillTree:skillLevelChanged', this._onSkillLevelChanged);

      // Only activate heavy resources if shadow_senses skill is unlocked
      if (this._isSkillTreeSkillUnlocked('shadow_senses')) {
        this._activateSensesResources();
      } else {
        this.debugLog("SKILL_GATE", "shadow_senses not unlocked — senses dormant, waiting for skill event");
        this._toast(`${PLUGIN_NAME} v${PLUGIN_VERSION} \u2014 Awaiting Shadow Senses skill`);
      }
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] FATAL: start() crashed:`, err);
      this._toast(`${PLUGIN_NAME} failed to start: ${err.message}`, "error");
    }
  }

  /**
   * Activate all heavy resources (Dispatcher, SensesEngine, CSS, widget, etc.).
   * Called when shadow_senses skill is confirmed unlocked.
   */
  _activateSensesResources() {
    if (this._sensesResourcesActive) return;
    this._sensesResourcesActive = true;

    this.deploymentManager = new DeploymentManager(
      (...args) => this.debugLog(...args),
      (...args) => this.debugError(...args)
    );
    this.deploymentManager.load();

    // Webpack modules
    this.initWebpack();

    this.sensesEngine = new SensesEngine(this);

    // Subscribe immediately if Dispatcher ready, otherwise poll until available
    if (this._Dispatcher) {
      this.sensesEngine.subscribe();
    } else {
      this._startDispatcherWait();
    }

    this.injectCSS();

    // React components
    this._components = buildComponents(this);

    // Channel header icon with unread badge (replaces old members panel widget)
    this.startSensesHeaderIcon();

    // ESC handler + context menu
    this.registerEscHandler();
    this.patchContextMenu();

    this.debugLog("Lifecycle", "Senses resources activated");
    this._toast(`${PLUGIN_NAME} v${PLUGIN_VERSION} \u2014 Shadow deployment online`);
    this._scheduleStartupShadowReport();
  }

  /**
   * Tear down all heavy resources without fully stopping the plugin.
   * The skill listener stays active so resources re-activate on skill unlock.
   */
  _deactivateSensesResources() {
    if (!this._sensesResourcesActive) return;
    this._sensesResourcesActive = false;

    // Dispatcher poll handle
    if (this._dispatcherPollHandle) {
      this._dispatcherPollHandle.cancel();
      this._dispatcherPollHandle = null;
    }
    if (this._startupReportTimer) {
      clearTimeout(this._startupReportTimer);
      this._startupReportTimer = null;
    }

    // SensesEngine
    if (this.sensesEngine) {
      this.sensesEngine.unsubscribe();
      this.sensesEngine = null;
    }

    // Context menu
    if (this._unpatchContextMenu) {
      try { this._unpatchContextMenu(); } catch (_) {}
      this._unpatchContextMenu = null;
    }

    // Panel
    this.closePanel();

    // Header icon
    this.stopSensesHeaderIcon();

    // Widget + observer
    if (this._layoutBusUnsub) {
      this._layoutBusUnsub();
      this._layoutBusUnsub = null;
    }
    clearTimeout(this._widgetReinjectTimeout);
    this._widgetReinjectTimeout = null;
    this.removeWidget();
    try {
      const spacer = document.getElementById(WIDGET_SPACER_ID);
      if (spacer) spacer.remove();
    } catch (_) {}

    // ESC handler
    if (this._escHandler) {
      document.removeEventListener("keydown", this._escHandler);
      this._escHandler = null;
    }

    // Transitions
    _TransitionCleanupUtils?.cancelPendingTransition?.(this);
    _TransitionCleanupUtils?.clearNavigateRetries?.(this);
    _TransitionCleanupUtils?.cancelChannelViewFade?.(this);

    // CSS + refs
    this.removeCSS();
    this._components = null;
    this.deploymentManager = null;

    this.debugLog("SKILL_GATE", "Senses resources deactivated");
    this._toast(`${PLUGIN_NAME} \u2014 Shadows recalled (skill reset)`);
  }

  stop(showToast = true) {
    try {
      this._stopped = true;

      // Remove skill listener
      if (this._onSkillLevelChanged) {
        document.removeEventListener('SkillTree:skillLevelChanged', this._onSkillLevelChanged);
        this._onSkillLevelChanged = null;
      }

      // Tear down resources if active
      this._sensesResourcesActive = true; // ensure guard passes
      this._deactivateSensesResources();
      const _portalCore = _EmbeddedShadowPortalCore || (typeof window !== "undefined" && window.ShadowPortalCore);
      _portalCore?.stop?.();
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    if (showToast) this._toast(`${PLUGIN_NAME} \u2014 Shadows recalled`);
  }

  _toast(message, type = "info", timeout = null) {
    const engine = this.sensesEngine?._toastEngine;
    if (engine) {
      engine.showToast(message, type, timeout, { callerId: "shadowSenses" });
    } else {
      _fallbackToast(message, type);
    }
  }

  _getStartupShadowReportWindowMs() {
    const configuredHours = Number(this.settings?.startupShadowReportWindowHours);
    const safeHours = Number.isFinite(configuredHours)
      ? Math.min(72, Math.max(1, Math.floor(configuredHours)))
      : 24;
    return safeHours * 60 * 60 * 1000;
  }

  _formatStartupTopList(items, emptyLabel = "None", prefix = "") {
    if (!Array.isArray(items) || items.length === 0) return emptyLabel;
    return items.map((item) => `${prefix}${item.name} (${item.count})`).join(", ");
  }

  _formatStartupChannelLabel(channelName) {
    const rawName = String(channelName || "unknown").trim() || "unknown";
    return rawName.startsWith("#") ? rawName : `#${rawName}`;
  }

  _cleanStartupTopicSnippet(rawContent, maxLength = 72) {
    let content = String(rawContent || "").replace(/\s+/g, " ").trim();
    if (!content) return "";
    content = content
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/<https?:\/\/[^>]+>/gi, "")
      .replace(/<@!?\d+>/g, "")
      .replace(/<#\d+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!content) return "";
    const noiseKey = content.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (STARTUP_NOISE_TOPICS.has(noiseKey)) {
      return "";
    }
    if (content.length <= maxLength) return content;
    const clipped = content.slice(0, Math.max(16, maxLength - 3));
    const boundary = clipped.lastIndexOf(" ");
    if (boundary > 18) return `${clipped.slice(0, boundary)}...`;
    return `${clipped}...`;
  }

  _buildStartupAttentionDigest(summary, recentEntries, options = {}) {
    const maxChannels = Math.max(1, Math.floor(Number(options.maxChannels) || 2));
    const maxSpeakers = Math.max(1, Math.floor(Number(options.maxSpeakers) || 3));
    const maxTopics = Math.max(1, Math.floor(Number(options.maxTopics) || 2));
    const actionableCount = Math.max(
      0,
      Number(summary?.urgentCount || 0) +
      Number(summary?.highCount || 0) +
      Number(summary?.mediumCount || 0)
    );

    const channelMap = new Map();
    const entries = Array.isArray(recentEntries) ? recentEntries : [];
    for (const entry of entries) {
      const priority = Number(entry?.priority) || 1;
      if (priority < 2) continue;

      const channelName = String(entry?.channelName || "unknown").trim() || "unknown";
      const authorName = String(entry?.authorName || "Unknown").trim() || "Unknown";
      const weight = Math.max(1, Math.floor(Number(entry?.messageCount) || 1));
      const topicSnippet = this._cleanStartupTopicSnippet(entry?.content || "");

      if (!channelMap.has(channelName)) {
        channelMap.set(channelName, {
          signalCount: 0,
          speakerCounts: new Map(),
          topicSnippets: [],
          summaryOnly: false,
        });
      }
      const channelRecord = channelMap.get(channelName);
      channelRecord.signalCount += weight;
      channelRecord.speakerCounts.set(
        authorName,
        (channelRecord.speakerCounts.get(authorName) || 0) + weight
      );
      if (
        topicSnippet &&
        channelRecord.topicSnippets.length < 8 &&
        !channelRecord.topicSnippets.includes(topicSnippet)
      ) {
        channelRecord.topicSnippets.push(topicSnippet);
      }
    }

    const topChannels = Array.isArray(summary?.topChannels) ? summary.topChannels : [];
    for (const topChannel of topChannels) {
      const topName = String(topChannel?.name || "").trim();
      if (!topName || channelMap.has(topName)) continue;
      channelMap.set(topName, {
        signalCount: Math.max(1, Math.floor(Number(topChannel?.count) || 1)),
        speakerCounts: new Map(),
        topicSnippets: [],
        summaryOnly: true,
      });
      if (channelMap.size >= maxChannels) break;
    }

    const channels = Array.from(channelMap.entries())
      .sort((left, right) => {
        const leftCount = left[1]?.signalCount || 0;
        const rightCount = right[1]?.signalCount || 0;
        if (rightCount !== leftCount) return rightCount - leftCount;
        return String(left[0]).localeCompare(String(right[0]));
      })
      .slice(0, maxChannels)
      .map(([channelName, record]) => {
        const speakers = Array.from(record.speakerCounts.entries())
          .sort((left, right) => {
            if (right[1] !== left[1]) return right[1] - left[1];
            return left[0].localeCompare(right[0]);
          })
          .slice(0, maxSpeakers)
          .map(([name]) => name);
        const topics = Array.isArray(record.topicSnippets)
          ? record.topicSnippets.slice(0, maxTopics)
          : [];
        return {
          channelName,
          channelLabel: this._formatStartupChannelLabel(channelName),
          signalCount: Number(record.signalCount) || 0,
          speakers,
          topics,
          summaryOnly: !!record.summaryOnly,
        };
      });

    const focusText = channels.length
      ? channels
        .map((channel) => {
          const speakersLabel = channel.speakers.length
            ? channel.speakers.join(", ")
            : "top recent speakers";
          const topicsLabel = channel.topics.length
            ? `; topics: ${channel.topics.join(" | ")}`
            : "";
          return `${channel.channelLabel} (${speakersLabel}${topicsLabel})`;
        })
        .join(" and ")
      : "recent monitored channels";

    return { actionableCount, channels, focusText };
  }

  _resolveDefaultStartupArtworkUrl() {
    const homeDir = process.env.HOME || "";
    if (homeDir) {
      const candidatePaths = [
        path.join(homeDir, "Downloads", "Igris.svg"),
        path.join(homeDir, "Downloads", "Igris.png"),
        path.join(homeDir, "Downloads", "Igris.webp"),
        path.join(homeDir, "Downloads", "Igris.jpg"),
        path.join(homeDir, "Downloads", "Igris.jpeg"),
      ];
      for (const candidatePath of candidatePaths) {
        try {
          if (fs.existsSync(candidatePath)) return toFileUrl(candidatePath);
        } catch (_) {}
      }
    }
    return STARTUP_REPORT_ARTWORK_FALLBACK_URL || null;
  }

  _normalizeArtworkInput(value) {
    const configured = String(value || "").trim();
    if (!configured) return "";
    if (/^(https?:|data:|file:)/i.test(configured)) return configured;

    const homeDir = process.env.HOME || "";
    if (configured.startsWith("~/") && homeDir) {
      return path.join(homeDir, configured.slice(2));
    }
    if (configured.startsWith("/Downloads/") && homeDir) {
      return path.join(homeDir, "Downloads", configured.slice("/Downloads/".length));
    }
    return configured;
  }

  _resolveStartupReportArtworkUrl(override = null) {
    const fallback = "https://cdn.discordapp.com/embed/avatars/0.png";
    const rawValue =
      typeof override === "string" ? override : this.settings?.startupShadowReportArtwork;
    const configured = this._normalizeArtworkInput(rawValue);
    if (!configured) {
      const autoDetected = this._resolveDefaultStartupArtworkUrl();
      return autoDetected || STARTUP_REPORT_ARTWORK_FALLBACK_URL || fallback;
    }
    if (/^(https?:|data:|file:)/i.test(configured)) return configured;

    const candidates = [];
    if (path.isAbsolute(configured)) {
      candidates.push(configured);
    } else {
      const pluginFolder = BdApi?.Plugins?.folder;
      if (typeof pluginFolder === "string" && pluginFolder.trim().length > 0) {
        candidates.push(path.resolve(pluginFolder, configured));
      }
      candidates.push(path.resolve(process.cwd(), configured));
    }

    for (const candidatePath of candidates) {
      try {
        if (fs.existsSync(candidatePath)) return toFileUrl(candidatePath);
      } catch (_) {}
    }
    const autoDetected = this._resolveDefaultStartupArtworkUrl();
    return autoDetected || STARTUP_REPORT_ARTWORK_FALLBACK_URL || fallback;
  }

  _readEnvValueFromFile(filePath, key) {
    try {
      const resolvedPath = path.resolve(String(filePath || ""));
      if (!resolvedPath || !fs.existsSync(resolvedPath)) return "";
      const content = fs.readFileSync(resolvedPath, "utf8");
      return parseEnvValue(content, key);
    } catch (_) {
      return "";
    }
  }

  _resolveStartupAiConfig() {
    // 1) Plugin settings — explicit user-configured key (preferred path).
    const apiKeyFromSettings = String(this.settings?.startupReportApiKey || "").trim();
    const modelFromSettings = String(this.settings?.startupReportModel || "").trim();
    if (apiKeyFromSettings) {
      return {
        apiKey: apiKeyFromSettings,
        model: modelFromSettings || "gpt-4o-mini",
      };
    }

    // 2) Process env vars — for users running Discord with shell-set env.
    const apiKeyFromProcess = String(process.env.OPENAI_API_KEY || "").trim();
    const modelFromProcess = String(process.env.OPENAI_MODEL || "").trim();
    if (apiKeyFromProcess) {
      return {
        apiKey: apiKeyFromProcess,
        model: modelFromProcess || "gpt-4o-mini",
      };
    }

    // 3) Legacy fallback — sibling shadow-away-bot project's .env file.
    // Only works on the original developer's machine layout; deprecated
    // path kept for backwards-compatibility. New users should set the key
    // via the plugin settings UI instead.
    const homeDir = process.env.HOME || "";
    if (!homeDir) return null;

    const shadowAwayEnvPath = path.join(
      homeDir,
      "Documents",
      "DEVELOPMENT",
      "discord",
      "bots",
      "shadow-away-bot",
      ".env"
    );
    const apiKey = this._readEnvValueFromFile(shadowAwayEnvPath, "OPENAI_API_KEY");
    if (!apiKey) return null;
    const model = this._readEnvValueFromFile(shadowAwayEnvPath, "OPENAI_MODEL") || "gpt-4o-mini";
    return { apiKey, model };
  }

  async _requestOpenAiChatCompletion({ apiKey, model, messages, maxTokens = 260, temperature = 0.45, timeoutMs = 8000 }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`openai_http_${res.status}:${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("openai_empty_response");
      return String(content);
    } catch (error) {
      clearTimeout(timer);
      if (error?.name === "AbortError") throw new Error("openai_timeout");
      throw error;
    }
  }

  _buildStartupReportFallbackNarration(summary, windowHours, recentEntries = []) {
    if (!summary || Number(summary.totalEvents || 0) <= 0) {
      return `My liege, in the last ${windowHours} hour${windowHours === 1 ? "" : "s"}, your shadows detected no notable monitored activity.`;
    }

    const totalEvents = Math.max(0, Number(summary.totalEvents || 0));
    const topChannel = Array.isArray(summary.topChannels) && summary.topChannels.length > 0
      ? summary.topChannels[0]
      : null;
    const topChannelLabel = topChannel
      ? this._formatStartupChannelLabel(topChannel.name)
      : "your monitored channels";
    const topChannelCount = Math.max(0, Number(topChannel?.count || 0));
    const attentionDigest = this._buildStartupAttentionDigest(summary, recentEntries);
    const actionableCount = Math.max(0, Number(attentionDigest.actionableCount || 0));

    const parts = [
      `My liege, shadows observed ${totalEvents} event${totalEvents === 1 ? "" : "s"} in the last ${windowHours} hour${windowHours === 1 ? "" : "s"}.`,
      topChannel
        ? `Most activity came from ${topChannelLabel} (${topChannelCount} signal${topChannelCount === 1 ? "" : "s"}).`
        : `Most activity came from your monitored channels.`,
    ];

    if (actionableCount > 0) {
      parts.push(
        `${actionableCount} of ${totalEvents} signals require your attention, concentrated in: ${attentionDigest.focusText}.`
      );
    } else {
      parts.push("No urgent, high, or medium-priority signals require your attention in this window.");
    }

    return parts.join(" ");
  }

  async _generateAiStartupNarration(summary, recentEntries, windowHours) {
    const attentionDigest = this._buildStartupAttentionDigest(summary, recentEntries);
    const fallback = this._buildStartupReportFallbackNarration(summary, windowHours, recentEntries);
    const aiConfig = this._resolveStartupAiConfig();
    if (!aiConfig?.apiKey) return { narration: fallback, signalBreakdown: "" };

    // Cache: identical signal-set within 30 minutes returns the same
    // narration without paying for another OpenAI call. Key combines
    // window, total/urgent counts, and the most-recent entry timestamp,
    // which is deterministic across rapid restarts.
    const STARTUP_CACHE_TTL_MS = 30 * 60 * 1000;
    const lastEntryTs = recentEntries?.[0]?.timestamp || 0;
    const cacheKey = [
      windowHours,
      Number(summary?.totalEvents || 0),
      Number(summary?.urgentCount || 0),
      Number(summary?.highCount || 0),
      lastEntryTs,
    ].join(":");
    try {
      const cached = BdApi.Data.load(PLUGIN_NAME, "startupReportCache");
      if (cached && cached.cacheKey === cacheKey && Date.now() - (cached.ts || 0) < STARTUP_CACHE_TTL_MS) {
        this.debugLog("StartupReport", "Cache hit — skipping OpenAI call", { cacheKey });
        return cached.result || { narration: fallback, signalBreakdown: "" };
      }
    } catch (_) { /* cache read failure is non-fatal */ }

    const promptPayload = {
      windowHours,
      summary: {
        totalEvents: Number(summary?.totalEvents || 0),
        urgentCount: Number(summary?.urgentCount || 0),
        highCount: Number(summary?.highCount || 0),
        mediumCount: Number(summary?.mediumCount || 0),
        lowCount: Number(summary?.lowCount || 0),
        activeGuildCount: Number(summary?.activeGuildCount || 0),
        actionableCount: Number(attentionDigest?.actionableCount || 0),
        topTargets: Array.isArray(summary?.topTargets) ? summary.topTargets : [],
        topChannels: Array.isArray(summary?.topChannels) ? summary.topChannels : [],
        actionableChannelFocus: Array.isArray(attentionDigest?.channels)
          ? attentionDigest.channels.map((channel) => ({
            channel: channel.channelLabel,
            signalCount: channel.signalCount,
            speakers: channel.speakers,
            topics: channel.topics,
          }))
          : [],
      },
      recentSignals: Array.isArray(recentEntries)
        ? recentEntries.slice(0, 16).map((entry) => ({
          when: new Date(Number(entry.timestamp) || Date.now()).toISOString(),
          guild: entry.guildName,
          channel: entry.channelName,
          author: entry.authorName,
          priority: Number(entry.priority) || 1,
          content: String(entry.content || "").slice(0, 180),
          messageCount: Number(entry.messageCount) || 1,
        }))
        : [],
    };

    const systemPrompt = [
      "You are Igris, a loyal shadow retainer reporting to the Shadow Monarch.",
      "You must return TWO pieces in a single JSON response.",
      "",
      "1) \"report\" — a concise 3-5 sentence startup catch-up narration in plain text.",
      "   Tone: respectful, direct, tactical, calm. Always begin with 'My liege,'.",
      "   Flow: total events → most active channel → actionable signal count and key channels/speakers.",
      "",
      "2) \"signalBreakdown\" — a detailed tactical briefing on the attention-worthy signals (priority >= 2).",
      "   Group by channel. For each channel: name the speakers, summarize what they discussed or what triggered the alert.",
      "   Include priority context (P4 = direct mention of the Monarch, P3 = reply/@everyone, P2 = role mention/keyword).",
      "   Use numbered entries. Keep each entry to 1-2 lines. Cover up to 10 entries.",
      "   If no actionable signals exist, write a single line: 'No signals require your attention in this window.'",
      "   Plain text only, no markdown or emojis.",
      "",
      "Do not use markdown, emojis, or bullet lists in either field.",
      "Never invent events; use only provided data.",
      "Return JSON only: {\"report\":\"...\",\"signalBreakdown\":\"...\"}.",
    ].join("\n");

    try {
      const raw = await this._requestOpenAiChatCompletion({
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(promptPayload) },
        ],
        maxTokens: 700,
        timeoutMs: 12000,
      });
      this.debugLog("StartupReport", "AI raw response", { rawLength: raw?.length, raw: String(raw || "").slice(0, 500) });
      let report = "";
      let signalBreakdown = "";
      try {
        const parsed = JSON.parse(raw);
        report = String(parsed?.report || "").trim();
        signalBreakdown = String(parsed?.signalBreakdown || "").trim();
        this.debugLog("StartupReport", "AI parsed fields", {
          reportLength: report.length,
          signalBreakdownLength: signalBreakdown.length,
          hasSignalBreakdown: signalBreakdown.length > 0,
          signalBreakdownPreview: signalBreakdown.slice(0, 200),
        });
      } catch (parseErr) {
        this.debugLog("StartupReport", "AI JSON parse failed", { error: parseErr?.message });
        report = String(raw || "").trim();
      }
      report = report.replace(/```/g, "").replace(/\s+/g, " ").trim();
      signalBreakdown = signalBreakdown.replace(/```/g, "").trim();
      if (!report) return { narration: fallback, signalBreakdown: "" };
      if (!/^My liege,/i.test(report)) {
        report = `My liege, ${report.charAt(0).toLowerCase()}${report.slice(1)}`;
      }
      const result = { narration: report.slice(0, 700), signalBreakdown: signalBreakdown.slice(0, 1200) };
      // Persist to cache so a quick restart within 30 min reuses this.
      try {
        BdApi.Data.save(PLUGIN_NAME, "startupReportCache", { cacheKey, ts: Date.now(), result });
      } catch (_) { /* cache write failure is non-fatal */ }
      return result;
    } catch (error) {
      this.debugLog("StartupReport", "AI summary fallback", {
        reason: error?.message || String(error),
      });
      return { narration: fallback, signalBreakdown: "" };
    }
  }

  _showStartupShadowReportModal({ summary, windowHours, narration, recentEntries, signalBreakdown }) {
    const React = BdApi.React;
    const title = `Igris Report \u2022 ${windowHours}h`;
    const safeNarration = String(
      narration || this._buildStartupReportFallbackNarration(summary, windowHours, recentEntries)
    );
    const attentionEntries = (Array.isArray(recentEntries) ? recentEntries : [])
      .filter((entry) => (Number(entry?.priority) || 1) >= 2)
      .sort((left, right) => {
        const rightPriority = Number(right?.priority) || 1;
        const leftPriority = Number(left?.priority) || 1;
        if (rightPriority !== leftPriority) return rightPriority - leftPriority;
        return (Number(right?.timestamp) || 0) - (Number(left?.timestamp) || 0);
      })
      .slice(0, 12);
    const detailLine =
      `Urgent: ${Number(summary?.urgentCount || 0)} \u2022 ` +
      `High: ${Number(summary?.highCount || 0)} \u2022 ` +
      `Medium: ${Number(summary?.mediumCount || 0)} \u2022 ` +
      `Active guilds: ${Number(summary?.activeGuildCount || 0)}`;
    const topTargetsLine = `Top targets: ${this._formatStartupTopList(summary?.topTargets, "None")}`;
    const topChannelsLine = `Top channels: ${this._formatStartupTopList(summary?.topChannels, "None", "#")}`;
    const artworkUrl = this._resolveStartupReportArtworkUrl();
    const summaryActionableCount =
      Number(summary?.urgentCount || 0) +
      Number(summary?.highCount || 0) +
      Number(summary?.mediumCount || 0);
    let attentionSignalText;
    const aiBreakdown = typeof signalBreakdown === "string" ? signalBreakdown.trim() : "";
    if (aiBreakdown) {
      // AI-powered signal breakdown from Igris
      attentionSignalText = aiBreakdown;
    } else if (attentionEntries.length) {
      attentionSignalText = attentionEntries
        .map((entry, idx) => {
          const when = new Date(Number(entry.timestamp) || Date.now()).toLocaleString();
          const countLabel = Number(entry.messageCount) > 1 ? ` x${entry.messageCount}` : "";
          return `${idx + 1}. [P${Number(entry.priority) || 1}] ${entry.authorName} in #${entry.channelName} (${entry.guildName})${countLabel}\n${entry.content}\n${when}`;
        })
        .join("\n\n");
    } else if (summaryActionableCount > 0) {
      const lines = [];
      const urgent = Number(summary?.urgentCount || 0);
      const high = Number(summary?.highCount || 0);
      const medium = Number(summary?.mediumCount || 0);
      lines.push(`${summaryActionableCount} signal${summaryActionableCount === 1 ? "" : "s"} detected:`);
      if (urgent > 0) lines.push(`  \u2022 ${urgent} urgent (direct mentions of you)`);
      if (high > 0) lines.push(`  \u2022 ${high} high (replies to you, @everyone, name matches)`);
      if (medium > 0) lines.push(`  \u2022 ${medium} medium (role mentions, keyword triggers)`);
      const topTargets = summary?.topTargets;
      if (Array.isArray(topTargets) && topTargets.length > 0) {
        const targetList = topTargets.map((t) => `${t.name} (${t.count})`).join(", ");
        lines.push(`\nMost active targets: ${targetList}`);
      }
      const topChannels = summary?.topChannels;
      if (Array.isArray(topChannels) && topChannels.length > 0) {
        const channelList = topChannels.map((c) => `#${c.name} (${c.count})`).join(", ");
        lines.push(`Hottest channels: ${channelList}`);
      }
      attentionSignalText = lines.join("\n");
    } else {
      attentionSignalText = "No urgent, high, or medium-priority signals require your attention in this window.";
    }

    if (!React || !BdApi.UI?.showConfirmationModal) {
      const fallbackText =
        `${safeNarration}\n\n${detailLine}\n${topTargetsLine}\n${topChannelsLine}\n\nSignals Requiring Attention:\n${attentionSignalText}`;
      BdApi.UI?.alert?.(title, fallbackText);
      return;
    }

    const content = React.createElement(
      "div",
      {
        // Marker class for the CSS in styles.js to scope-target this
        // modal's frame (header + footer) and force opaque background.
        className: "shadowsenses-igris-report-modal",
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          maxHeight: "68vh",
          overflowY: "auto",
          // Solid background on the content area itself. Outer modal
          // frame (header/footer) is filled by the CSS rules in
          // styles.js scoped via [role="dialog"]:has(.shadowsenses-igris-report-modal).
          background: "#0d0d18",
          padding: "16px",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "10px",
            alignItems: "center",
            padding: "8px 10px",
            borderRadius: "10px",
            border: "1px solid rgba(138, 43, 226, 0.35)",
            background: "linear-gradient(120deg, rgba(138, 43, 226, 0.15), rgba(15, 15, 24, 0.96))",
          },
        },
        React.createElement("img", {
          src: artworkUrl,
          alt: "Igris",
          style: {
            width: "52px",
            height: "52px",
            borderRadius: "10px",
            objectFit: "cover",
            border: "1px solid rgba(138, 43, 226, 0.45)",
          },
          onError: (event) => {
            if (event?.target?.style) event.target.style.display = "none";
          },
        }),
        React.createElement(
          "div",
          { style: { color: "#d6bcff", fontSize: "12px", lineHeight: 1.45, fontWeight: 600 } },
          safeNarration
        )
      ),
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "4px" } },
        React.createElement(
          "div",
          { style: { color: "#a3a3a3", fontSize: "12px", lineHeight: 1.45 } },
          detailLine
        ),
        React.createElement(
          "div",
          { style: { color: "#8a8a8a", fontSize: "11px", lineHeight: 1.45 } },
          topTargetsLine
        ),
        React.createElement(
          "div",
          { style: { color: "#8a8a8a", fontSize: "11px", lineHeight: 1.45 } },
          topChannelsLine
        )
      ),
      React.createElement(
        "div",
        { style: { color: "#8a8a8a", fontSize: "11px", letterSpacing: "0.02em", fontWeight: 700 } },
        "SIGNALS REQUIRING ATTENTION"
      ),
      React.createElement(
        "pre",
        {
          style: {
            margin: 0,
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid rgba(138, 43, 226, 0.22)",
            background: "rgba(18, 18, 30, 0.92)",
            color: "#d1d5db",
            fontSize: "11px",
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            // #13: bound the breakdown's height + give it its own scroll
            // so a long AI response can't push the modal past 68vh and
            // overflow narrow Discord windows.
            maxHeight: "30vh",
            overflowY: "auto",
          },
        },
        attentionSignalText
      ),
      // #22: copy the full report to clipboard so the user can keep a log
      // (modal is otherwise ephemeral — closing loses everything).
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => this._copyStartupReportToClipboard({
            title, safeNarration, detailLine, topTargetsLine, topChannelsLine, attentionSignalText,
          }),
          style: {
            alignSelf: "flex-start",
            marginTop: "4px",
            padding: "5px 12px",
            background: "rgba(138, 43, 226, 0.18)",
            border: "1px solid rgba(138, 43, 226, 0.45)",
            borderRadius: "6px",
            color: "#d6bcff",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.04em",
          },
        },
        "COPY REPORT"
      )
    );

    // #12: single dismiss button — "Understood" + "Dismiss" had no
    // distinct callbacks, so showing both was confusing UX. Single confirm
    // button + Esc/click-outside both close the modal cleanly.
    BdApi.UI.showConfirmationModal(title, content, {
      confirmText: "Understood",
    });

    // CSS via :has() proved unreliable — BD's modal wrapping appears to
    // swallow / re-render in a way that breaks the selector chain. Apply
    // styles imperatively via inline styles with !important so the modal
    // frame, header, footer, and buttons all match the SoloLeveling
    // aesthetic regardless of Discord's hash-class shuffle or BD's
    // React handling.
    this._applyIgrisModalStyles();
  }

  _applyIgrisModalStyles() {
    let attempts = 0;
    const maxAttempts = 30; // ~1.5s polling window
    const tick = () => {
      attempts++;
      const marker = document.querySelector(".shadowsenses-igris-report-modal");
      if (!marker) {
        if (attempts < maxAttempts) setTimeout(tick, 50);
        return;
      }
      try {
        const dialog = marker.closest('[role="dialog"]') || marker.parentElement?.parentElement?.parentElement;
        if (!dialog) return;

        const setImp = (el, prop, val) => el.style.setProperty(prop, val, "important");

        setImp(dialog, "background-color", "#0d0d18");
        Array.from(dialog.children).forEach((child) => setImp(child, "background-color", "#0d0d18"));

        // Header / footer / content areas
        dialog.querySelectorAll('[class*="header"], [class*="footer"], [class*="content"]').forEach((el) => {
          if (el.closest("button")) return; // skip button internals
          setImp(el, "background-color", "#0d0d18");
        });

        // Footer flex gap so buttons don't touch
        dialog.querySelectorAll('[class*="footer"]').forEach((footer) => {
          setImp(footer, "gap", "12px");
          setImp(footer, "column-gap", "12px");
        });

        // Buttons
        const buttons = Array.from(dialog.querySelectorAll("button"));
        buttons.forEach((btn) => {
          const cls = String(btn.className || "");
          // Detect confirm by TEXT — Discord's DOM order puts Cancel last
          // (visually right-aligned but DOM-last), so the previous "last
          // button is confirm" heuristic mis-applied the gradient to Cancel.
          // Text matches reliably since we know confirmText = "Understood".
          const text = String(btn.textContent || "").trim().toLowerCase();
          const isConfirm = text === "understood" || /colorBrand/i.test(cls);

          if (isConfirm) {
            setImp(btn, "background", "linear-gradient(120deg, rgba(138, 43, 226, 0.55), rgba(168, 80, 255, 0.7))");
            setImp(btn, "color", "#ffffff");
            setImp(btn, "text-shadow", "0 0 6px rgba(168, 80, 255, 0.55)");
            setImp(btn, "box-shadow", "0 0 12px rgba(138, 43, 226, 0.45)");
            setImp(btn, "border", "1px solid rgba(180, 110, 255, 0.85)");
          } else {
            setImp(btn, "background", "rgba(138, 43, 226, 0.14)");
            setImp(btn, "color", "#d6bcff");
            setImp(btn, "border", "1px solid rgba(138, 43, 226, 0.45)");
          }
          setImp(btn, "border-radius", "0");
          setImp(btn, "font-weight", "600");
          setImp(btn, "letter-spacing", "0.04em");

          // Flatten inner label divs (they had Discord's dark fill)
          btn.querySelectorAll("*").forEach((child) => {
            setImp(child, "background-color", "transparent");
          });
        });

        // Pre-emptive bg-clear on close. Discord's modal close animation
        // fades only the inner modal-box opacity, but our inline-style
        // paint sits on the outer [role="dialog"] (and on header/footer/
        // content). Inline styles persist until React unmounts the DOM,
        // so the painted outer rect stays solid for ~1-2 frames after
        // the inner box has reached opacity 0 — visible as a lingering
        // dark afterimage when clicking Understood. Wipe the paint
        // synchronously on any close trigger so the dialog turns
        // transparent BEFORE the close animation starts.
        const paintTargets = new Set([dialog]);
        Array.from(dialog.children).forEach((c) => paintTargets.add(c));
        dialog.querySelectorAll('[class*="header"], [class*="footer"], [class*="content"]').forEach((el) => {
          if (!el.closest("button")) paintTargets.add(el);
        });
        const clearBgPaint = () => {
          for (const el of paintTargets) {
            try { el.style.removeProperty("background-color"); } catch (_) {}
          }
        };

        // Click on any action button (Understood / Cancel / etc.).
        buttons.forEach((btn) => btn.addEventListener("click", clearBgPaint, { once: true, capture: true }));
        // Escape key while focus is anywhere inside the dialog.
        dialog.addEventListener("keydown", (e) => {
          if (e.key === "Escape") clearBgPaint();
        }, { capture: true });
        // Click on the dialog backdrop (outside the modal-box). If the
        // click target IS the dialog itself, the user clicked outside
        // the modal — Discord treats that as a close trigger.
        dialog.addEventListener("mousedown", (e) => {
          if (e.target === dialog) clearBgPaint();
        }, { capture: true });
      } catch (err) {
        this.debugError("StartupReport", "applyIgrisModalStyles failed", err);
      }
    };
    setTimeout(tick, 30);
  }

  // #22: serialize the modal's report content to plain text and write to
  // the system clipboard. Toast on success/failure for feedback.
  _copyStartupReportToClipboard({ title, safeNarration, detailLine, topTargetsLine, topChannelsLine, attentionSignalText }) {
    const text = [
      title,
      "",
      safeNarration,
      "",
      detailLine,
      topTargetsLine,
      topChannelsLine,
      "",
      "Signals Requiring Attention:",
      attentionSignalText,
    ]
      .filter((line) => line !== undefined && line !== null && String(line).trim().length > 0)
      .join("\n");

    if (!navigator?.clipboard?.writeText) {
      BdApi.UI?.showToast?.("Clipboard API unavailable", { type: "error" });
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => BdApi.UI?.showToast?.("Igris report copied to clipboard", { type: "success" }))
      .catch((err) => {
        this.debugError("StartupReport", "Clipboard copy failed", err);
        BdApi.UI?.showToast?.("Copy failed — see console", { type: "error" });
      });
  }

  async _showStartupShadowReport() {
    if (this._stopped) return;
    if (!this.settings?.startupShadowReport) return;
    if (!this.sensesEngine?.getStartupSummary) return;

    // #11: skip when there are no monitored friends — nothing to report on.
    const monitoredCount = this.deploymentManager?.getMonitoredUserIds?.().size || 0;
    if (monitoredCount === 0) {
      this.debugLog("Lifecycle", "Startup report skipped — no deployments");
      return;
    }

    // #4: optional "since-last-report" window mode. When enabled, the window
    // is the time elapsed since the last successful report fire (capped at
    // the configured max hours). Otherwise fall back to the fixed window.
    const configuredWindowMs = this._getStartupShadowReportWindowMs();
    let windowMs = configuredWindowMs;
    if (this.settings?.startupReportSinceLastSession) {
      try {
        const lastReportAt = Number(BdApi.Data.load(PLUGIN_NAME, "lastStartupReportAt") || 0);
        if (lastReportAt > 0 && lastReportAt < Date.now()) {
          const sinceLastMs = Date.now() - lastReportAt;
          // Min 1h floor (avoid sub-hour reports), capped at configured window.
          windowMs = Math.max(60 * 60 * 1000, Math.min(configuredWindowMs, sinceLastMs));
        }
      } catch (_) { /* fallback to fixed window on read error */ }
    }
    const summary = this.sensesEngine.getStartupSummary(windowMs, 3, 2);
    if (!summary) return;

    // #2: skip when nothing happened in the window — avoid useless modal +
    // wasted AI call. summary.totalEvents counts all observed events
    // (messages, presence, mentions, etc.) within the configured window.
    if (!summary.totalEvents || summary.totalEvents === 0) {
      this.debugLog("Lifecycle", "Startup report skipped — no activity in window");
      return;
    }

    const recentEntries = this.sensesEngine.getStartupEntries
      ? this.sensesEngine.getStartupEntries(windowMs, 50)
      : [];

    const windowHours = Math.max(1, Math.round(summary.windowMs / (60 * 60 * 1000)));
    const aiResult = await this._generateAiStartupNarration(summary, recentEntries, windowHours);

    // #16: AI call can take 8-12s. If user toggled the skill off / stopped
    // the plugin during the await, drop the result instead of rendering
    // into a torn-down context.
    if (this._stopped || !this._sensesResourcesActive) {
      this.debugLog("Lifecycle", "Startup report aborted — plugin/resources stopped during AI call");
      return;
    }

    const narration = aiResult?.narration || aiResult;
    const signalBreakdown = aiResult?.signalBreakdown || "";
    this._showStartupShadowReportModal({
      summary,
      windowHours,
      narration,
      recentEntries,
      signalBreakdown,
    });

    // #1: mark fired so a skill-toggle (off/on) within the same session
    // doesn't re-fire the same report. Cleared on full plugin restart since
    // the class is re-instantiated.
    this._startupReportFired = true;

    // #4: persist successful-fire timestamp so the next startup can compute
    // a since-last-session window if the user has that mode enabled.
    try {
      BdApi.Data.save(PLUGIN_NAME, "lastStartupReportAt", Date.now());
    } catch (_) { /* persist failure is non-fatal */ }

    this.debugLog("Lifecycle", "Startup shadow report emitted", {
      windowHours,
      totalEvents: summary.totalEvents,
      urgentCount: summary.urgentCount,
      highCount: summary.highCount,
      mediumCount: summary.mediumCount,
      activeGuildCount: summary.activeGuildCount,
    });
  }

  _scheduleStartupShadowReport() {
    if (this._startupReportTimer) {
      clearTimeout(this._startupReportTimer);
      this._startupReportTimer = null;
    }
    if (!this.settings?.startupShadowReport) return;

    // #1: don't re-schedule when this session already fired the report.
    // Skill toggle off/on calls _deactivateSensesResources +
    // _activateSensesResources which used to fire a fresh report each cycle.
    if (this._startupReportFired) {
      this.debugLog("Lifecycle", "Startup report skipped — already fired this session");
      return;
    }

    const delayMs = STARTUP_TOAST_GRACE_MS + 750;
    this._startupReportTimer = setTimeout(() => {
      this._startupReportTimer = null;
      this._showStartupShadowReport().catch((error) => {
        this.debugError("Lifecycle", "Startup report failed", error);
      });
    }, delayMs);
  }

  loadSettings() {
    this.settings = loadSettings(PLUGIN_NAME, DEFAULT_SETTINGS);
  }

  saveSettings() {
    saveSettings(PLUGIN_NAME, this.settings);
  }

  initWebpack() {
    const { Webpack } = BdApi;
    const { acquireDispatcher } = require('../shared/dispatcher');
    // Shared 6-tier dispatcher acquisition with singleton cache
    this._Dispatcher = acquireDispatcher();
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._GuildStore = Webpack.getStore("GuildStore");
    this._UserStore = Webpack.getStore("UserStore");
    this._PresenceStore = Webpack.getStore("PresenceStore");
    this._RelationshipStore = Webpack.getStore("RelationshipStore");
    this._GuildMemberStore = Webpack.getStore("GuildMemberStore");
    const { getNavigationUtils } = require("../shared/navigation");
    this._NavigationUtils = getNavigationUtils();
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
    const { pollForDispatcher } = require('../shared/dispatcher');
    this._dispatcherPollHandle = pollForDispatcher({
      onAcquired: (d) => {
        this._Dispatcher = d;
        this.debugLog("Webpack", "Dispatcher acquired via polling");
        this.initWebpack();
        if (this.sensesEngine) this.sensesEngine.subscribe();
      },
      onTimeout: () => {
        console.error(`[${PLUGIN_NAME}] Dispatcher unavailable after 30s — message detection will NOT work`);
        this._toast(`${PLUGIN_NAME}: Dispatcher not found — message detection disabled`, "error");
      },
      onPoll: () => {
        if (this._stopped) this._dispatcherPollHandle?.cancel();
      },
    });
  }

  teleportToPath(path, context = {}) {
    // Shared teleport cooldown (synced with ShadowExchange + ShadowStep)
    const portalCore = _EmbeddedShadowPortalCore || (typeof window !== "undefined" && window.ShadowPortalCore);
    if (portalCore?.checkTeleportCooldown) {
      const cdCheck = portalCore.checkTeleportCooldown();
      if (cdCheck.onCooldown) {
        this._toast(`Teleport on cooldown \u2014 ${cdCheck.remainingText} remaining`, "error", 3000);
        return;
      }
    }

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

    // Stamp shared teleport cooldown
    if (portalCore?.stampTeleportCooldown) portalCore.stampTeleportCooldown();

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
  // Primary path: bundled src module (esbuild-resolved) so runtime does not
  // depend on external plugin-folder loading.
  if (_EmbeddedShadowPortalCore?.applyPortalCoreToClass) {
    return _EmbeddedShadowPortalCore;
  }
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
