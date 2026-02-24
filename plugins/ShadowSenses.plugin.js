/**
 * @name ShadowSenses
 * @description Deploy shadow soldiers to monitor Discord users — get notified when they speak, even while invisible. Solo Leveling themed.
 * @version 1.1.3
 * @author matthewthompson
 */

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

// ─── Constants ─────────────────────────────────────────────────────────────

const PLUGIN_NAME = "ShadowSenses";
const PLUGIN_VERSION = "1.1.3";
const STYLE_ID = "shadow-senses-css";
const WIDGET_ID = "shadow-senses-widget";
const WIDGET_SPACER_ID = "shadow-senses-widget-spacer";
const PANEL_CONTAINER_ID = "shadow-senses-panel-root";
const TRANSITION_ID = "shadow-senses-transition-overlay";
const GLOBAL_UTILITY_FEED_ID = "__shadow_senses_global__";

const RANKS = window.SoloLevelingUtils?.RANKS || ["E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+", "NH", "Monarch", "Monarch+", "Shadow Monarch"];
const RANK_COLORS = {
  E: "#9ca3af", D: "#60a5fa", C: "#34d399", B: "#a78bfa",
  A: "#f59e0b", S: "#ef4444", SS: "#ec4899", SSS: "#8b5cf6",
  "SSS+": "#c084fc", NH: "#14b8a6", Monarch: "#fbbf24",
  "Monarch+": "#f97316", "Shadow Monarch": "#8a2be2",
};

const GUILD_FEED_CAP = 5000;
const GLOBAL_FEED_CAP = 25000;
const FEED_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const PURGE_INTERVAL_MS = 10 * 60 * 1000; // Check for stale entries every 10 minutes
const WIDGET_OBSERVER_DEBOUNCE_MS = 200;
const WIDGET_REINJECT_DELAY_MS = 300;
const STARTUP_TOAST_GRACE_MS = 3000;
const DEFAULT_TYPING_ALERT_COOLDOWN_MS = 15000;
const ONLINE_STATUSES = new Set(["online", "idle", "dnd"]);
const PRESENCE_EVENT_NAMES = ["PRESENCE_UPDATES", "PRESENCE_UPDATE"];
const RELATIONSHIP_EVENT_NAMES = ["FRIEND_REQUEST_ACCEPTED", "RELATIONSHIP_ADD", "RELATIONSHIP_UPDATE", "RELATIONSHIP_REMOVE"];
const STATUS_LABELS = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
  invisible: "Invisible",
};
const STATUS_ACCENT_COLORS = {
  online: "#22c55e",
  idle: "#f59e0b",
  dnd: "#ef4444",
  offline: "#9ca3af",
  invisible: "#9ca3af",
};
const STATUS_TOAST_ROOT_ID = "shadow-senses-status-toast-root";
const STATUS_TOAST_TIMEOUT_MS = 5200;
const STATUS_TOAST_EXIT_MS = 220;
const STATUS_TOAST_MAX_VISIBLE = 4;
const DEFAULT_SETTINGS = {
  animationEnabled: true,
  respectReducedMotion: false,
  animationDuration: 550,
  statusAlerts: true,
  typingAlerts: true,
  removedFriendAlerts: true,
  showMarkedOnlineCount: true,
  typingAlertCooldownMs: DEFAULT_TYPING_ALERT_COOLDOWN_MS,
};

// ─── DeploymentManager ─────────────────────────────────────────────────────

class DeploymentManager {
  constructor(debugLog, debugError) {
    this._debugLog = debugLog;
    this._debugError = debugError;
    this._deployments = [];
    this._monitoredUserIds = new Set();
    this._deployedShadowIds = new Set();
    this._availableCache = _ttl(5000); // 5s TTL — avoids redundant IDB reads
  }

  load() {
    try {
      const saved = BdApi.Data.load(PLUGIN_NAME, "deployments");
      this._deployments = Array.isArray(saved) ? saved : [];
      this._rebuildSets();
      this._debugLog("DeploymentManager", "Loaded deployments", { count: this._deployments.length });
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to load deployments", err);
      this._deployments = [];
      this._rebuildSets();
    }
  }

  _save() {
    try {
      BdApi.Data.save(PLUGIN_NAME, "deployments", this._deployments);
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to save deployments", err);
    }
  }

  _rebuildSets() {
    this._monitoredUserIds = new Set(this._deployments.map(d => d.targetUserId));
    this._deployedShadowIds = new Set(this._deployments.map(d => d.shadowId));
  }

  async deploy(shadow, targetUser) {
    if (!shadow || !shadow.id || !targetUser) {
      this._debugError("DeploymentManager", "Invalid deploy args", { shadow, targetUser });
      return false;
    }

    if (this._deployedShadowIds.has(shadow.id)) {
      this._debugLog("DeploymentManager", "Shadow already deployed", shadow.id);
      return false;
    }

    const targetUserId = targetUser.id || targetUser.userId;
    if (!targetUserId) {
      this._debugError("DeploymentManager", "No target user ID");
      return false;
    }

    if (this._monitoredUserIds.has(targetUserId)) {
      this._debugLog("DeploymentManager", "User already monitored", targetUserId);
      return false;
    }

    // Re-verify shadow is still available before committing deployment
    try {
      const currentAvailable = await this.getAvailableShadows();
      const stillAvailable = currentAvailable.find(s => s.id === shadow.id);
      if (!stillAvailable) {
        this._debugLog("DeploymentManager", `Shadow ${shadow.id} no longer available, aborting deployment`);
        return false;
      }
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to re-verify shadow availability", err);
      // Proceed with deployment if verification fails — better than blocking
    }

    const record = {
      shadowId: shadow.id,
      shadowName: shadow.roleName || shadow.role || "Shadow",
      shadowRank: shadow.rank || "E",
      targetUserId,
      targetUsername: targetUser.username || targetUser.globalName || "Unknown",
      deployedAt: Date.now(),
    };

    this._deployments.push(record);
    this._rebuildSets();
    this._availableCache.invalidate(); // deployment state changed
    this._save();
    this._debugLog("DeploymentManager", "Deployed shadow", record);
    return true;
  }

  recall(shadowId) {
    const idx = this._deployments.findIndex(d => d.shadowId === shadowId);
    if (idx === -1) return false;

    this._deployments.splice(idx, 1);
    this._rebuildSets();
    this._availableCache.invalidate(); // deployment state changed
    this._save();
    this._debugLog("DeploymentManager", "Recalled shadow", shadowId);
    return true;
  }

  isDeployed(shadowId) {
    return this._deployedShadowIds.has(shadowId);
  }

  getDeployedShadowIds() {
    return new Set(this._deployedShadowIds);
  }

  isMonitored(userId) {
    return this._monitoredUserIds.has(userId);
  }

  getDeploymentForUser(userId) {
    return this._deployments.find(d => d.targetUserId === userId) || null;
  }

  getDeployments() {
    return [...this._deployments];
  }

  getDeploymentCount() {
    return this._deployments.length;
  }

  getMonitoredUserIds() {
    return this._monitoredUserIds;
  }

  async getAvailableShadows() {
    // 5s TTL cache — avoids redundant IDB reads + 3 cross-plugin lookups
    const cached = this._availableCache.get();
    if (cached) return cached;
    try {
      if (!BdApi.Plugins.isEnabled("ShadowArmy")) {
        this._debugError("DeploymentManager", "ShadowArmy plugin not enabled");
        return [];
      }
      const armyPlugin = BdApi.Plugins.get("ShadowArmy");
      if (!armyPlugin || !armyPlugin.instance) {
        this._debugError("DeploymentManager", "ShadowArmy plugin not available");
        return [];
      }

      // CROSS-PLUGIN SNAPSHOT: Use ShadowArmy's shared snapshot if fresh, else fall back to IDB
      const allShadows = armyPlugin.instance.getShadowSnapshot?.() || await armyPlugin.instance.getAllShadows();
      if (!Array.isArray(allShadows)) return [];

      // Get IDs to exclude: already deployed + exchange-marked + dungeon-allocated
      // Dungeons now keeps a reserve pool (weakest shadows) idle for ShadowSenses.
      // Reserve shadows are available. Dungeon-allocated shadows are NOT (lore: one place at a time).
      // Fallback: if zero available, pull the weakest shadow from a dungeon silently.
      const deployedIds = this._deployedShadowIds;
      let exchangeMarkedIds = new Set();
      let dungeonAllocatedIds = new Set();
      let dungeonReserve = [];

      try {
        if (BdApi.Plugins.isEnabled("ShadowExchange")) {
          const exchangePlugin = BdApi.Plugins.get("ShadowExchange");
          if (exchangePlugin && exchangePlugin.instance && typeof exchangePlugin.instance.getMarkedShadowIds === "function") {
            exchangeMarkedIds = exchangePlugin.instance.getMarkedShadowIds();
          }
        }
      } catch (exErr) {
        this._debugLog("DeploymentManager", "ShadowExchange not available for exclusion", exErr);
      }

      try {
        const dungeonsPlugin = BdApi.Plugins.isEnabled("Dungeons") ? BdApi.Plugins.get("Dungeons") : null;
        if (dungeonsPlugin && dungeonsPlugin.instance) {
          // Get reserve pool (idle shadows held back by Dungeons)
          dungeonReserve = Array.isArray(dungeonsPlugin.instance.shadowReserve)
            ? dungeonsPlugin.instance.shadowReserve : [];
          // Build set of all dungeon-allocated shadow IDs
          if (dungeonsPlugin.instance.shadowAllocations instanceof Map) {
            for (const shadows of dungeonsPlugin.instance.shadowAllocations.values()) {
              if (Array.isArray(shadows)) {
                for (const s of shadows) {
                  const sid = s?.id || s?.extractedData?.id;
                  if (sid) dungeonAllocatedIds.add(sid);
                }
              }
            }
          }
        }
      } catch (dgErr) {
        this._debugLog("DeploymentManager", "Dungeons not available for exclusion", dgErr);
      }

      const reserveIds = new Set(dungeonReserve.map(s => s?.id || s?.extractedData?.id).filter(Boolean));

      // Available = not deployed, not exchange-marked, and either in reserve OR not in any dungeon
      const available = allShadows.filter(s => {
        if (!s || !s.id) return false;
        if (deployedIds.has(s.id)) return false;
        if (exchangeMarkedIds.has(s.id)) return false;
        if (reserveIds.has(s.id)) return true;           // Reserve = idle = available
        if (dungeonAllocatedIds.has(s.id)) return false;  // In dungeon = not available
        return true;
      });

      // Fallback: if no idle shadows, pull weakest from dungeon silently
      if (available.length === 0 && dungeonAllocatedIds.size > 0) {
        const dungeonShadows = allShadows
          .filter(s => s && s.id && dungeonAllocatedIds.has(s.id) && !deployedIds.has(s.id) && !exchangeMarkedIds.has(s.id))
          .sort((a, b) => RANKS.indexOf(a.rank || "E") - RANKS.indexOf(b.rank || "E"));
        if (dungeonShadows.length > 0) available.push(dungeonShadows[0]);
      }

      this._debugLog("DeploymentManager", "Available shadows", {
        total: allShadows.length,
        available: available.length,
        deployed: deployedIds.size,
        exchangeMarked: exchangeMarkedIds.size,
        dungeonAllocated: dungeonAllocatedIds.size,
        reservePool: reserveIds.size,
      });

      this._availableCache.set(available);
      return available;
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to get available shadows", err);
      return [];
    }
  }

  async validateDeployments(getAvailableShadowsFn) {
    if (!getAvailableShadowsFn) return;
    try {
      const available = await getAvailableShadowsFn();
      const availableIds = new Set(available.map(s => s.id));
      const before = this._deployments.length;
      this._deployments = this._deployments.filter(d => availableIds.has(d.shadowId));
      if (this._deployments.length < before) {
        this._debugLog("DeploymentManager", `Pruned ${before - this._deployments.length} stale deployments`);
        this._rebuildSets();
        this._save();
      }
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to validate deployments", err);
    }
  }
}

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
    this._subscribedEventHandlers = new Map(); // eventName -> handler
    this._totalFeedEntries = 0;  // Incremental counter — avoids O(G×F) per message
    this._feedVersion = 0;       // Bumped on every feed mutation — lets consumers skip unchanged polls

    // Presence detection — in-memory only, resets on restart/reload
    // Tracks last message timestamp per monitored user to detect:
    //   1. First activity after restart → "user is active" toast
    //   2. Return from AFK (1-3h silence) → "back from AFK" toast
    this._userLastActivity = new Map();  // authorId → { timestamp, notifiedActive }
    this._AFK_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours — sweet spot for real AFK detection
    this._subscribeTime = 0; // Set when subscribe() fires — used to defer early toasts
    this._statusByUserId = new Map(); // userId -> normalized status
    this._relationshipFriendIds = new Set();
    this._typingToastCooldown = new Map(); // userId:channelId -> timestamp
    this._statusToastTimers = new Map(); // toastId -> timeout ID
    this._statusToastExitTimers = new Map(); // toastId -> timeout ID
    this._deferredStatusToastTimers = new Set(); // startup-deferred status toast timers
    this._deferredUtilityToastTimers = new Set(); // deferred non-status toasts (startup grace)
    this._statusToastCounter = 0;

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

    // Store current guild — try immediately, retry if null (Discord may not be ready yet)
    try {
      this._currentGuildId = this._plugin._SelectedGuildStore
        ? this._plugin._SelectedGuildStore.getGuildId()
        : null;
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Failed to get initial guild ID", err);
    }
    console.log(`[ShadowSenses] subscribe: _currentGuildId=${this._currentGuildId}`);

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
    for (const [eventName, handler] of this._subscribedEventHandlers.entries()) {
      try {
        Dispatcher.unsubscribe(eventName, handler);
      } catch (err) {
        this._plugin.debugError("SensesEngine", `Failed to unsubscribe ${eventName}`, err);
      }
    }
    this._subscribedEventHandlers.clear();
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
    for (const timer of this._statusToastTimers.values()) clearTimeout(timer);
    for (const timer of this._statusToastExitTimers.values()) clearTimeout(timer);
    this._statusToastTimers.clear();
    this._statusToastExitTimers.clear();
    this._clearStatusToastRoot();

    this._plugin.debugLog("SensesEngine", "Unsubscribed from all events");
  }

  _subscribeEvent(eventName, handler) {
    const Dispatcher = this._plugin._Dispatcher;
    if (!Dispatcher || !eventName || typeof handler !== "function") return false;
    if (this._subscribedEventHandlers.has(eventName)) return true;
    try {
      Dispatcher.subscribe(eventName, handler);
      this._subscribedEventHandlers.set(eventName, handler);
      return true;
    } catch (err) {
      this._plugin.debugError("SensesEngine", `Failed to subscribe ${eventName}`, err);
      return false;
    }
  }

  _resolveUserStore() {
    if (this._plugin._UserStore) return this._plugin._UserStore;
    try {
      this._plugin._UserStore = BdApi.Webpack.getStore("UserStore");
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Failed to resolve UserStore", err);
    }
    return this._plugin._UserStore;
  }

  _resolvePresenceStore() {
    if (this._plugin._PresenceStore) return this._plugin._PresenceStore;
    try {
      this._plugin._PresenceStore = BdApi.Webpack.getStore("PresenceStore");
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Failed to resolve PresenceStore", err);
    }
    return this._plugin._PresenceStore;
  }

  _resolveRelationshipStore() {
    if (this._plugin._RelationshipStore) return this._plugin._RelationshipStore;
    try {
      this._plugin._RelationshipStore = BdApi.Webpack.getStore("RelationshipStore");
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Failed to resolve RelationshipStore", err);
    }
    return this._plugin._RelationshipStore;
  }

  _normalizeStatus(status) {
    if (!status || typeof status !== "string") return "offline";
    return status.toLowerCase();
  }

  _isOnlineStatus(status) {
    return ONLINE_STATUSES.has(this._normalizeStatus(status));
  }

  _getStatusLabel(status) {
    const normalized = this._normalizeStatus(status);
    return STATUS_LABELS[normalized] || normalized;
  }

  _getFriendIdSet() {
    const relationshipStore = this._resolveRelationshipStore();
    if (!relationshipStore || typeof relationshipStore.getFriendIDs !== "function") return new Set();
    try {
      return new Set((relationshipStore.getFriendIDs() || []).map(String));
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Failed to read friend IDs", err);
      return new Set();
    }
  }

  _snapshotFriendRelationships() {
    this._relationshipFriendIds = this._getFriendIdSet();
  }

  _resolveUserName(userId, fallbackName = "Unknown") {
    const userStore = this._resolveUserStore();
    if (!userStore || typeof userStore.getUser !== "function") return fallbackName;
    try {
      const user = userStore.getUser(userId);
      return user?.globalName || user?.global_name || user?.username || fallbackName;
    } catch (_) {
      return fallbackName;
    }
  }

  _resolveUserAvatarUrl(userId) {
    const userStore = this._resolveUserStore();
    if (!userStore || typeof userStore.getUser !== "function") return null;
    try {
      const user = userStore.getUser(userId);
      if (!user) return null;

      const candidateCalls = [
        () => user.getAvatarURL?.(null, 64, true),
        () => user.getAvatarURL?.(),
        () => user.getAvatarURL?.(64),
        () => user.getDefaultAvatarURL?.(),
      ];
      for (const call of candidateCalls) {
        try {
          const value = call();
          if (typeof value === "string" && value.length > 4) return value;
        } catch (_) {}
      }

      if (typeof user.defaultAvatarURL === "string" && user.defaultAvatarURL.length > 4) {
        return user.defaultAvatarURL;
      }
      if (user.avatar && user.id) {
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
      }
    } catch (_) {}
    return null;
  }

  _isFriend(userId) {
    return this._relationshipFriendIds instanceof Set && this._relationshipFriendIds.has(String(userId));
  }

  _ensureStatusToastRoot() {
    let root = document.getElementById(STATUS_TOAST_ROOT_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = STATUS_TOAST_ROOT_ID;
    root.className = "shadow-senses-status-toast-root";
    document.body.appendChild(root);
    return root;
  }

  _clearStatusToastRoot() {
    const root = document.getElementById(STATUS_TOAST_ROOT_ID);
    if (root) root.remove();
  }

  _dismissStatusToast(toastId, immediate = false) {
    if (!toastId) return;

    const showTimer = this._statusToastTimers.get(toastId);
    if (showTimer) {
      clearTimeout(showTimer);
      this._statusToastTimers.delete(toastId);
    }

    const existingExitTimer = this._statusToastExitTimers.get(toastId);
    if (existingExitTimer) {
      clearTimeout(existingExitTimer);
      this._statusToastExitTimers.delete(toastId);
    }

    const root = document.getElementById(STATUS_TOAST_ROOT_ID);
    if (!root) return;
    const toast = root.querySelector(`[data-ss-toast-id="${toastId}"]`);
    if (!toast) return;

    if (immediate) {
      toast.remove();
      if (!root.childElementCount) root.remove();
      return;
    }

    toast.classList.add("is-leaving");
    const exitTimer = setTimeout(() => {
      this._statusToastExitTimers.delete(toastId);
      toast.remove();
      if (!root.childElementCount) root.remove();
    }, STATUS_TOAST_EXIT_MS);
    this._statusToastExitTimers.set(toastId, exitTimer);
  }

  _scheduleStatusToast(toastPayload, delayMs = 0) {
    const emit = () => {
      if (this._plugin._stopped) return;
      this._showStatusToast(toastPayload);
    };
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      emit();
      return;
    }
    const timer = setTimeout(() => {
      this._deferredStatusToastTimers.delete(timer);
      emit();
    }, Math.floor(delayMs));
    this._deferredStatusToastTimers.add(timer);
  }

  _scheduleDeferredUtilityToast(callback, delayMs = 0) {
    if (typeof callback !== "function") return;
    const emit = () => {
      if (this._plugin._stopped) return;
      callback();
    };
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      emit();
      return;
    }
    const timer = setTimeout(() => {
      this._deferredUtilityToastTimers.delete(timer);
      emit();
    }, Math.floor(delayMs));
    this._deferredUtilityToastTimers.add(timer);
  }

  _showStatusToast({ userId, userName, previousLabel, nextLabel, nextStatus, deployment }) {
    const root = this._ensureStatusToastRoot();
    if (!root) return;

    while (root.childElementCount >= STATUS_TOAST_MAX_VISIBLE) {
      const oldest = root.firstElementChild;
      const oldId = oldest?.dataset?.ssToastId;
      if (!oldId) {
        oldest?.remove?.();
        break;
      }
      this._dismissStatusToast(oldId, true);
    }

    const toastId = `status-${Date.now()}-${++this._statusToastCounter}`;
    const accent = STATUS_ACCENT_COLORS[nextStatus] || "#8a2be2";
    const rankColor = RANK_COLORS[deployment?.shadowRank] || "#8a2be2";

    const toast = document.createElement("div");
    toast.className = "shadow-senses-status-toast";
    toast.dataset.ssToastId = toastId;
    toast.dataset.status = nextStatus || "offline";
    toast.style.setProperty("--ss-status-accent", accent);
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    const avatarWrap = document.createElement("div");
    avatarWrap.className = "shadow-senses-status-toast-avatar-wrap";

    const avatarUrl = this._resolveUserAvatarUrl(userId);
    if (avatarUrl) {
      const avatar = document.createElement("img");
      avatar.className = "shadow-senses-status-toast-avatar";
      avatar.src = avatarUrl;
      avatar.alt = `${userName} avatar`;
      avatarWrap.appendChild(avatar);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "shadow-senses-status-toast-avatar-fallback";
      fallback.textContent = (userName || "?").charAt(0).toUpperCase();
      avatarWrap.appendChild(fallback);
    }

    const dot = document.createElement("span");
    dot.className = "shadow-senses-status-toast-dot";
    dot.dataset.status = nextStatus || "offline";
    avatarWrap.appendChild(dot);

    const main = document.createElement("div");
    main.className = "shadow-senses-status-toast-main";

    const header = document.createElement("div");
    header.className = "shadow-senses-status-toast-header";

    const rank = document.createElement("span");
    rank.className = "shadow-senses-status-toast-rank";
    rank.style.color = rankColor;
    rank.textContent = `[${deployment?.shadowRank || "E"}]`;
    header.appendChild(rank);

    const shadowName = document.createElement("span");
    shadowName.textContent = `${deployment?.shadowName || "Shadow"} reports`;
    header.appendChild(shadowName);

    if (this._isFriend(userId)) {
      const friendTag = document.createElement("span");
      friendTag.className = "shadow-senses-status-toast-chip";
      friendTag.textContent = "FRIEND";
      header.appendChild(friendTag);
    }

    const body = document.createElement("div");
    body.className = "shadow-senses-status-toast-message";

    const user = document.createElement("span");
    user.className = "shadow-senses-status-toast-user";
    user.textContent = userName || "Unknown";
    body.appendChild(user);

    const prev = document.createElement("span");
    prev.className = "shadow-senses-status-toast-prev";
    prev.textContent = ` ${previousLabel}`;
    body.appendChild(prev);

    const arrow = document.createElement("span");
    arrow.className = "shadow-senses-status-toast-arrow";
    arrow.textContent = " -> ";
    body.appendChild(arrow);

    const next = document.createElement("span");
    next.className = "shadow-senses-status-toast-next";
    next.textContent = nextLabel;
    body.appendChild(next);

    main.appendChild(header);
    main.appendChild(body);
    toast.appendChild(avatarWrap);
    toast.appendChild(main);
    root.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("is-visible"));

    const timeout = setTimeout(
      () => this._dismissStatusToast(toastId, false),
      STATUS_TOAST_TIMEOUT_MS
    );
    this._statusToastTimers.set(toastId, timeout);
    toast.addEventListener("click", () => this._dismissStatusToast(toastId, false), { once: true });
  }

  _seedTrackedStatuses() {
    const presenceStore = this._resolvePresenceStore();
    this._statusByUserId.clear();
    if (!presenceStore || typeof presenceStore.getStatus !== "function") return;
    const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
    for (const userId of monitoredIds) {
      try {
        const status = this._normalizeStatus(presenceStore.getStatus(userId));
        this._statusByUserId.set(userId, status);
      } catch (_) {}
    }
  }

  _getTypingCooldownMs() {
    const ms = Number(this._plugin.settings?.typingAlertCooldownMs);
    if (!Number.isFinite(ms)) return DEFAULT_TYPING_ALERT_COOLDOWN_MS;
    return Math.min(60000, Math.max(3000, Math.floor(ms)));
  }

  _extractPresenceUpdates(payload) {
    if (!payload) return [];
    const updates = [];
    const push = (userId, status) => {
      if (!userId) return;
      updates.push({
        userId: String(userId),
        status: this._normalizeStatus(status),
      });
    };

    if (Array.isArray(payload.updates)) {
      for (const update of payload.updates) {
        if (!update) continue;
        const userId = update.userId || update.user_id || update.user?.id;
        const status = update.status || update.presence?.status;
        if (userId) push(userId, status);
      }
    }

    const directUserId = payload.userId || payload.user_id || payload.user?.id || payload.id;
    if (directUserId) {
      const directStatus = payload.status || payload.presence?.status;
      push(directUserId, directStatus);
    }

    return updates;
  }

  _addUtilityFeedEntry(_entry, _guildId = GLOBAL_UTILITY_FEED_ID) {
    // By design: utility alerts are transient toast intel, not feed history.
    // Active Feed remains chat-message history only.
    return;
  }

  _flushToDisk() {
    try {
      const dirtyCount = this._dirtyGuilds.size;
      if (dirtyCount === 0 && !this._dirty) return;

      // Save only dirty guilds (O(1 guild) instead of O(all guilds))
      for (const guildId of this._dirtyGuilds) {
        BdApi.Data.save(PLUGIN_NAME, `feed_${guildId}`, this._guildFeeds[guildId] || []);
      }
      // Save guild index for load-time discovery + detection counter
      BdApi.Data.save(PLUGIN_NAME, "feedGuildIds", Object.keys(this._guildFeeds));
      BdApi.Data.save(PLUGIN_NAME, "totalDetections", this._totalDetections);

      this._dirtyGuilds.clear();
      this._dirty = false;
      this._plugin.debugLog("SensesEngine", "Flushed to disk", {
        dirtyGuilds: dirtyCount,
        totalGuilds: Object.keys(this._guildFeeds).length,
      });
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Failed to flush to disk", err);
    }
  }

  _addToGuildFeed(guildId, entry) {
    if (!this._guildFeeds[guildId]) {
      this._guildFeeds[guildId] = [];
    }
    this._guildFeeds[guildId].push(entry);
    this._totalFeedEntries++;

    if (this._guildFeeds[guildId].length > GUILD_FEED_CAP) {
      this._guildFeeds[guildId].shift();
      this._totalFeedEntries--;
    }

    // Global cap: O(1) check via incremental counter (was O(G×F) reduce)
    if (this._totalFeedEntries > GLOBAL_FEED_CAP) {
      let maxGuild = null, maxLen = 0;
      for (const [gid, arr] of Object.entries(this._guildFeeds)) {
        if (arr.length > maxLen) { maxGuild = gid; maxLen = arr.length; }
      }
      if (maxGuild) {
        const trimTo = Math.max(100, Math.floor(maxLen / 2));
        const trimmed = maxLen - trimTo;
        this._guildFeeds[maxGuild] = this._guildFeeds[maxGuild].slice(-trimTo);
        this._totalFeedEntries -= trimmed;
        this._dirtyGuilds.add(maxGuild);
        this._plugin.debugLog?.("SensesEngine", `Global cap: trimmed guild ${maxGuild} from ${maxLen} to ${trimTo}`);
      }
    }

    this._feedVersion++;
    this._dirtyGuilds.add(guildId);
    this._dirty = true;
  }

  /**
   * Remove feed entries older than FEED_MAX_AGE_MS (3 days).
   * Called on startup and periodically via _purgeInterval.
   */
  _purgeOldEntries() {
    const cutoff = Date.now() - FEED_MAX_AGE_MS;
    let totalPurged = 0;

    for (const guildId of Object.keys(this._guildFeeds)) {
      const feed = this._guildFeeds[guildId];
      if (!feed || feed.length === 0) continue;

      // Entries are chronological — find first entry newer than cutoff
      let keepFrom = 0;
      while (keepFrom < feed.length && feed[keepFrom].timestamp < cutoff) {
        keepFrom++;
      }

      if (keepFrom > 0) {
        this._guildFeeds[guildId] = feed.slice(keepFrom);
        this._totalFeedEntries -= keepFrom;
        totalPurged += keepFrom;
        this._dirtyGuilds.add(guildId);
        this._dirty = true;

        // Remove empty guilds from feeds
        if (this._guildFeeds[guildId].length === 0) {
          delete this._guildFeeds[guildId];
        }
      }
    }

    if (totalPurged > 0) {
      this._feedVersion++;
      this._plugin.debugLog("SensesEngine", `Purged ${totalPurged} entries older than 3 days`);
    }
  }

  /**
   * Remove non-message utility events from persisted history.
   * Utility alerts (status/typing/relationship) are toast-only.
   */
  _purgeUtilityEntries() {
    let removed = 0;
    for (const guildId of Object.keys(this._guildFeeds)) {
      const feed = this._guildFeeds[guildId];
      if (!Array.isArray(feed) || feed.length === 0) continue;

      const filtered = feed.filter(entry => !entry?.eventType || entry.eventType === "message");
      if (filtered.length === feed.length) continue;

      const diff = feed.length - filtered.length;
      this._guildFeeds[guildId] = filtered;
      this._totalFeedEntries -= diff;
      removed += diff;
      this._dirtyGuilds.add(guildId);
      this._dirty = true;

      if (filtered.length === 0) delete this._guildFeeds[guildId];
    }

    if (removed > 0) {
      this._feedVersion++;
      this._plugin.debugLog("SensesEngine", `Purged ${removed} non-message utility entries`);
    }
  }

  _onPresenceUpdate(payload) {
    try {
      const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
      if (!monitoredIds || monitoredIds.size === 0) return;

      const updates = this._extractPresenceUpdates(payload);
      if (updates.length === 0) return;

      const now = Date.now();
      const msSinceSubscribe = now - this._subscribeTime;
      const isEarlyStartup = this._subscribeTime > 0 && msSinceSubscribe < STARTUP_TOAST_GRACE_MS;

      for (const update of updates) {
        const userId = update.userId;
        if (!userId || !monitoredIds.has(userId)) continue;

        const deployment = this._plugin.deploymentManager.getDeploymentForUser(userId);
        if (!deployment) continue;

        const hasPriorStatus = this._statusByUserId.has(userId);
        const previousStatus = hasPriorStatus ? this._normalizeStatus(this._statusByUserId.get(userId)) : null;
        const nextStatus = this._normalizeStatus(update.status);
        this._statusByUserId.set(userId, nextStatus);

        if (!hasPriorStatus || previousStatus === nextStatus) continue;

        const userName = this._resolveUserName(userId, deployment.targetUsername || "Unknown");
        const previousLabel = this._getStatusLabel(previousStatus);
        const nextLabel = this._getStatusLabel(nextStatus);

        if (this._plugin.settings?.statusAlerts) {
          const delayMs = isEarlyStartup ? Math.max(0, STARTUP_TOAST_GRACE_MS - msSinceSubscribe) : 0;
          const toastPayload = {
            userId,
            userName,
            previousLabel,
            nextLabel,
            nextStatus,
            deployment,
          };
          if (isEarlyStartup) {
            this._scheduleStatusToast(toastPayload, delayMs);
          } else {
            this._showStatusToast(toastPayload);
          }
        }

        this._addUtilityFeedEntry({
          eventType: "status",
          messageId: `status-${userId}-${now}`,
          authorId: userId,
          authorName: userName,
          guildId: GLOBAL_UTILITY_FEED_ID,
          guildName: "Shadow Network",
          channelId: null,
          channelName: "presence",
          content: `Status changed: ${previousLabel} \u2192 ${nextLabel}`,
          timestamp: now,
          shadowName: deployment.shadowName,
          shadowRank: deployment.shadowRank,
        });

        this._plugin._widgetDirty = true;
      }
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Error in PRESENCE_UPDATE handler", err);
    }
  }

  _onTypingStart(payload) {
    try {
      if (!payload) return;
      const userId = String(payload.userId || payload.user_id || "");
      if (!userId) return;

      const userStore = this._resolveUserStore();
      const currentUserId = userStore?.getCurrentUser?.()?.id;
      if (currentUserId && userId === currentUserId) return;

      const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
      if (!monitoredIds || !monitoredIds.has(userId)) return;

      const deployment = this._plugin.deploymentManager.getDeploymentForUser(userId);
      if (!deployment) return;

      const channelId = payload.channelId || payload.channel_id || null;
      let guildId = payload.guildId || payload.guild_id || null;
      let channelName = "unknown";
      if (channelId && this._plugin._ChannelStore?.getChannel) {
        try {
          const channel = this._plugin._ChannelStore.getChannel(channelId);
          if (channel) {
            channelName = channel.name || channel.rawRecipients?.map(r => r?.username).filter(Boolean).join(", ") || "Direct Message";
            if (!guildId && channel.guild_id) guildId = channel.guild_id;
          }
        } catch (err) {
          this._plugin.debugError("SensesEngine", "Failed to resolve typing channel", err);
        }
      }

      const eventScopeId = guildId || GLOBAL_UTILITY_FEED_ID;
      const cooldownKey = `${userId}:${channelId || eventScopeId}`;
      const now = Date.now();
      const lastToastAt = this._typingToastCooldown.get(cooldownKey) || 0;
      const cooldownMs = this._getTypingCooldownMs();
      if (now - lastToastAt < cooldownMs) return;
      this._typingToastCooldown.set(cooldownKey, now);
      if (this._typingToastCooldown.size > 500) {
        for (const [key, ts] of this._typingToastCooldown.entries()) {
          if (now - ts > cooldownMs * 4) this._typingToastCooldown.delete(key);
        }
      }

      const userName = this._resolveUserName(userId, deployment.targetUsername || "Unknown");
      const guildName = guildId ? this._plugin._getGuildName(guildId) : "Shadow Network";
      const locationLabel = channelId
        ? `${guildName} #${channelName}`
        : guildName;

      if (this._plugin.settings?.typingAlerts) {
        BdApi.UI.showToast(
          `[${deployment.shadowRank}] ${deployment.shadowName} senses ${userName} typing in ${locationLabel}`,
          { type: "info", timeout: 4000 }
        );
      }

      this._addUtilityFeedEntry({
        eventType: "typing",
        messageId: `typing-${userId}-${channelId || "none"}-${now}`,
        authorId: userId,
        authorName: userName,
        guildId: eventScopeId,
        guildName,
        channelId: channelId || null,
        channelName,
        content: `Typing detected in ${locationLabel}`,
        timestamp: now,
        shadowName: deployment.shadowName,
        shadowRank: deployment.shadowRank,
      }, eventScopeId);

      if (guildId && guildId === this._currentGuildId && this._guildFeeds[guildId]) {
        this._lastSeenCount[guildId] = this._guildFeeds[guildId].length;
      }

      this._plugin._widgetDirty = true;
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Error in TYPING_START handler", err);
    }
  }

  _onRelationshipChange() {
    try {
      const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
      if (!monitoredIds || monitoredIds.size === 0) {
        this._snapshotFriendRelationships();
        return;
      }

      const previousFriends = this._relationshipFriendIds || new Set();
      const nextFriends = this._getFriendIdSet();
      this._relationshipFriendIds = nextFriends;
      if (previousFriends.size === 0) return;

      const removedFriendIds = [];
      for (const friendId of previousFriends) {
        if (!nextFriends.has(friendId)) removedFriendIds.push(friendId);
      }
      if (removedFriendIds.length === 0) return;

      const now = Date.now();
      for (const removedId of removedFriendIds) {
        if (!monitoredIds.has(removedId)) continue;
        const deployment = this._plugin.deploymentManager.getDeploymentForUser(removedId);
        if (!deployment) continue;

        const userName = this._resolveUserName(removedId, deployment.targetUsername || "Unknown");
        if (this._plugin.settings?.removedFriendAlerts) {
          BdApi.UI.showToast(
            `[${deployment.shadowRank}] ${deployment.shadowName} reports: ${userName} removed your connection`,
            { type: "warning", timeout: 5000 }
          );
        }

        this._addUtilityFeedEntry({
          eventType: "relationship",
          messageId: `relationship-${removedId}-${now}`,
          authorId: removedId,
          authorName: userName,
          guildId: GLOBAL_UTILITY_FEED_ID,
          guildName: "Shadow Network",
          channelId: null,
          channelName: "relationships",
          content: "Friend connection removed",
          timestamp: now,
          shadowName: deployment.shadowName,
          shadowRank: deployment.shadowRank,
        });
        this._plugin._widgetDirty = true;
      }
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Error in relationship handler", err);
    }
  }

  _onMessageCreate(payload) {
    try {
      if (!payload || !payload.message || !payload.message.author) return;

      const message = payload.message;
      const authorId = message.author.id;

      // O(1) lookup — exit immediately if not monitored
      const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
      if (!monitoredIds.has(authorId)) return;

      // This user IS monitored — resolve deployment info
      const deployment = this._plugin.deploymentManager.getDeploymentForUser(authorId);
      if (!deployment) return;

      // Lazy guild resolution — if subscribe() fired before Discord was ready,
      // _currentGuildId may be null. Try to resolve it now.
      if (!this._currentGuildId) {
        try {
          this._currentGuildId = this._plugin._SelectedGuildStore
            ? this._plugin._SelectedGuildStore.getGuildId()
            : null;
          if (this._currentGuildId) {
            console.log(`[ShadowSenses] Lazy guild resolve: _currentGuildId=${this._currentGuildId}`);
          }
        } catch (_) { /* silent */ }
      }

      // Resolve channel + guild FIRST (needed for presence toast context)
      let channelName = "unknown";
      let guildId = message.guild_id || null;

      try {
        const channel = this._plugin._ChannelStore
          ? this._plugin._ChannelStore.getChannel(message.channel_id)
          : null;
        if (channel) {
          channelName = channel.name || "unknown";
          if (!guildId) guildId = channel.guild_id;
        }
      } catch (chErr) {
        this._plugin.debugError("SensesEngine", "Failed to resolve channel", chErr);
      }

      if (!guildId) return;

      // Resolve guild name for display
      const guildName = this._plugin._getGuildName(guildId);
      const isAwayGuild = guildId !== this._currentGuildId;
      const authorName = message.author.username || message.author.global_name || "Unknown";

      // ── Presence Detection ──────────────────────────────────────────────
      // Track user activity to generate one-time presence toasts:
      //   - First message after restart → "is now active" (once per user, any guild)
      //   - Message after 2h+ silence → "has returned" (once per user, any guild)
      // These fire regardless of current guild — presence is user-level awareness.
      const now = Date.now();
      const lastActivity = this._userLastActivity.get(authorId);

      // During early startup (<3s after subscribe), BdApi.UI.showToast can silently
      // fail if Discord's DOM isn't fully rendered. Defer toasts in that window.
      const msSinceSubscribe = now - this._subscribeTime;
      const isEarlyStartup = this._subscribeTime > 0 && msSinceSubscribe < STARTUP_TOAST_GRACE_MS;

      if (!lastActivity) {
        // First message from this user since restart/reload
        const toastMsg = `[${deployment.shadowRank}] ${deployment.shadowName} reports: ${authorName} is now active`;
        if (isEarlyStartup) {
          this._scheduleDeferredUtilityToast(
            () => BdApi.UI.showToast(toastMsg, { type: "success", timeout: 5000 }),
            STARTUP_TOAST_GRACE_MS - msSinceSubscribe
          );
        } else {
          BdApi.UI.showToast(toastMsg, { type: "success", timeout: 5000 });
        }
        this._userLastActivity.set(authorId, { timestamp: now, notifiedActive: true });
      } else {
        const silenceMs = now - lastActivity.timestamp;

        if (silenceMs >= this._AFK_THRESHOLD_MS) {
          // User was silent for 2h+ → AFK return toast
          const silenceHours = Math.floor(silenceMs / (60 * 60 * 1000));
          const silenceMins = Math.floor((silenceMs % (60 * 60 * 1000)) / (60 * 1000));
          const timeStr = silenceHours > 0
            ? `${silenceHours}h${silenceMins > 0 ? ` ${silenceMins}m` : ""}`
            : `${silenceMins}m`;

          const toastMsg = `[${deployment.shadowRank}] ${deployment.shadowName} reports: ${authorName} has returned (AFK ${timeStr})`;
          if (isEarlyStartup) {
            this._scheduleDeferredUtilityToast(
              () => BdApi.UI.showToast(toastMsg, { type: "warning", timeout: 5000 }),
              STARTUP_TOAST_GRACE_MS - msSinceSubscribe
            );
          } else {
            BdApi.UI.showToast(toastMsg, { type: "warning", timeout: 5000 });
          }
        }

        // Always update timestamp
        this._userLastActivity.set(authorId, { timestamp: now, notifiedActive: true });
      }

      // Build feed entry
      const entry = {
        eventType: "message",
        messageId: message.id,
        authorId,
        authorName,
        channelId: message.channel_id,
        channelName,
        guildId,
        guildName,
        content: (message.content || "").slice(0, 200),
        timestamp: now,
        shadowName: deployment.shadowName,
        shadowRank: deployment.shadowRank,
      };

      // Add to the guild's feed (always, regardless of current guild)
      this._addToGuildFeed(guildId, entry);

      // Invisible detection: PresenceStore reports invisible users as "offline".
      // If someone with "offline" status sends a message, they're invisible — toast it.
      // Visible users (online/idle/dnd) already get status change toasts, so only
      // message-toast for invisible users to avoid double-notification spam.
      const presenceStore = this._resolvePresenceStore();
      const userStatus = presenceStore?.getStatus?.(authorId) || "offline";
      const isInvisible = userStatus === "offline"; // sending msg while "offline" = invisible

      if (isAwayGuild) {
        // Away guild — always toast (you can't see the message)
        BdApi.UI.showToast(
          `[${entry.shadowRank}] ${entry.shadowName} sensed ${entry.authorName} in ${guildName} #${entry.channelName}`,
          { type: "info" }
        );
      } else if (isInvisible) {
        // Current guild + invisible — toast because status toasts won't fire for them
        BdApi.UI.showToast(
          `[${entry.shadowRank}] ${entry.shadowName} sensed ${entry.authorName} (invisible) in #${entry.channelName}`,
          { type: "warning" }
        );
        this._lastSeenCount[guildId] = this._guildFeeds[guildId].length;
      } else {
        // Current guild + visible — silently track (status toasts already cover them)
        this._lastSeenCount[guildId] = this._guildFeeds[guildId].length;
      }

      // Update counters
      this._sessionMessageCount++;
      this._totalDetections++;

      // Signal widget refresh
      this._plugin._widgetDirty = true;
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Error in MESSAGE_CREATE handler", err);
    }
  }

  _onChannelSelect(payload) {
    try {
      let newGuildId = null;

      if (payload && payload.guildId) {
        newGuildId = payload.guildId;
      } else {
        try {
          newGuildId = this._plugin._SelectedGuildStore
            ? this._plugin._SelectedGuildStore.getGuildId()
            : null;
        } catch (gErr) {
          this._plugin.debugError("SensesEngine", "Failed to get guild ID on select", gErr);
        }
      }

      // Same guild — no action
      if (newGuildId === this._currentGuildId) return;

      // Check for unseen messages in the guild we're switching TO
      if (newGuildId && this._guildFeeds[newGuildId]) {
        const feed = this._guildFeeds[newGuildId];
        const lastSeen = this._lastSeenCount[newGuildId] || 0;
        const unseenCount = feed.length - lastSeen;

        if (unseenCount > 0) {
          // Collect unique shadow names from unseen entries
          const unseenEntries = feed.slice(lastSeen);
          const shadowNames = new Set(unseenEntries.map(e => e.shadowName));
          const guildName = this._plugin._getGuildName(newGuildId);

          BdApi.UI.showToast(
            `Shadow Senses: ${unseenCount} signal${unseenCount > 1 ? "s" : ""} in ${guildName} from ${shadowNames.size} shadow${shadowNames.size > 1 ? "s" : ""} while away`,
            { type: "info" }
          );
          this._plugin._widgetDirty = true;
        }

        // Mark all as seen now that we're viewing this guild
        this._lastSeenCount[newGuildId] = feed.length;
      }

      // Update current guild
      this._currentGuildId = newGuildId;

      this._plugin.debugLog("SensesEngine", "Guild switched", { newGuildId });
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Error in CHANNEL_SELECT handler", err);
    }
  }

  /**
   * Returns merged feed from all guilds EXCEPT the one you're currently viewing,
   * sorted by timestamp (newest last). This gives you a cross-server "what did I miss"
   * view that automatically excludes the guild you're already looking at.
   */
  getActiveFeed() {
    const merged = [];
    for (const [guildId, feed] of Object.entries(this._guildFeeds)) {
      if (guildId === this._currentGuildId) continue; // Skip current guild
      for (let i = 0; i < feed.length; i++) {
        merged.push(feed[i]);
      }
    }
    // Sort by timestamp ascending (oldest first, newest at bottom for scroll)
    merged.sort((a, b) => a.timestamp - b.timestamp);
    return merged;
  }

  /** Count of away-guild feed entries — no array copy. */
  getActiveFeedCount() {
    let count = 0;
    for (const [guildId, feed] of Object.entries(this._guildFeeds)) {
      if (guildId === this._currentGuildId) continue;
      count += feed.length;
    }
    return count;
  }

  getMarkedOnlineCount() {
    const monitoredIds = this._plugin.deploymentManager?.getMonitoredUserIds?.();
    if (!monitoredIds || monitoredIds.size === 0) return 0;

    const presenceStore = this._resolvePresenceStore();
    if (!presenceStore || typeof presenceStore.getStatus !== "function") return 0;

    let onlineCount = 0;
    for (const userId of monitoredIds) {
      try {
        const status = this._normalizeStatus(presenceStore.getStatus(userId));
        this._statusByUserId.set(userId, status);
        if (this._isOnlineStatus(status)) onlineCount++;
      } catch (_) {}
    }
    return onlineCount;
  }

  getSessionMessageCount() {
    return this._sessionMessageCount;
  }

  getTotalDetections() {
    return this._totalDetections;
  }

  clear() {
    // Note: Timer cleanup is handled by unsubscribe(), not here.
    // clear() only resets data state.
    if (this._statusToastTimers instanceof Map) {
      for (const timer of this._statusToastTimers.values()) clearTimeout(timer);
    }
    if (this._statusToastExitTimers instanceof Map) {
      for (const timer of this._statusToastExitTimers.values()) clearTimeout(timer);
    }
    if (this._deferredStatusToastTimers instanceof Set) {
      for (const timer of this._deferredStatusToastTimers) clearTimeout(timer);
    }
    if (this._deferredUtilityToastTimers instanceof Set) {
      for (const timer of this._deferredUtilityToastTimers) clearTimeout(timer);
    }
    this._guildFeeds = {};
    this._lastSeenCount = {};
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
    this._statusToastTimers = new Map();
    this._statusToastExitTimers = new Map();
    this._deferredStatusToastTimers = new Set();
    this._deferredUtilityToastTimers = new Set();
    this._statusToastCounter = 0;
    this._clearStatusToastRoot();
  }
}

// ─── CSS ───────────────────────────────────────────────────────────────────

function buildPortalTransitionCSS() {
  return `
@keyframes ss-mist-css-overlay {
  0% { opacity: 0; }
  14% { opacity: 0.98; }
  56% { opacity: 1; }
  74% { opacity: 0.82; }
  100% { opacity: 0; }
}

@keyframes ss-mist-css-plume {
  0% {
    opacity: 0;
    transform: translate3d(-2%, 4%, 0) scale(1.12) rotate(-3deg);
  }
  22% {
    opacity: 0.9;
    transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
  }
  62% {
    opacity: 0.74;
    transform: translate3d(3%, -2%, 0) scale(1.08) rotate(2deg);
  }
  100% {
    opacity: 0;
    transform: translate3d(6%, -4%, 0) scale(1.18) rotate(4deg);
  }
}

@keyframes ss-mist-css-abyss {
  0% {
    opacity: 0;
    transform: translate3d(2%, -2%, 0) scale(1.05);
  }
  20% {
    opacity: 0.93;
    transform: translate3d(0, 0, 0) scale(1);
  }
  68% {
    opacity: 0.78;
    transform: translate3d(-2%, 1%, 0) scale(1.08);
  }
  100% {
    opacity: 0.12;
    transform: translate3d(-3%, 2%, 0) scale(1.14);
  }
}

@keyframes ss-mist-css-mist {
  0% {
    opacity: 0;
    transform: translate3d(-2%, 3%, 0) scale(calc(var(--ss-ms, 1) * 0.72)) rotate(calc(var(--ss-mr, 0deg) * -0.2));
  }
  26% {
    opacity: 0.86;
    transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
  }
  68% {
    opacity: 0.64;
    transform: translate3d(calc(var(--ss-mx, 0px) * 0.44), calc(var(--ss-my, 0px) * 0.44), 0) scale(calc(var(--ss-ms, 1) * 1.06)) rotate(calc(var(--ss-mr, 0deg) * 0.5));
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--ss-mx, 0px), var(--ss-my, 0px), 0) scale(calc(var(--ss-ms, 1) * 1.2)) rotate(var(--ss-mr, 0deg));
  }
}

@keyframes ss-mist-css-shard {
  0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(0.3); opacity: 0; }
  22% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); opacity: 0.72; }
  100% {
    transform: translate3d(var(--ss-shard-x, 0px), var(--ss-shard-y, -80px), 0) rotate(var(--ss-shard-r, 0deg)) scale(0.2);
    opacity: 0;
  }
}

.ss-transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  pointer-events: none;
  overflow: hidden;
  opacity: 0;
  background: transparent;
  will-change: opacity;
}

.ss-transition-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  opacity: 1;
}

.ss-transition-plume,
.ss-transition-abyss,
.ss-mist,
.ss-shard {
  position: absolute;
  pointer-events: none;
}

.ss-transition-plume {
  inset: -18%;
  opacity: 0;
  transform: translate3d(-2%, 4%, 0) scale(1.12) rotate(-3deg);
  background:
    radial-gradient(65% 48% at 24% 38%, rgba(88, 88, 100, 0.32) 0%, rgba(38, 38, 48, 0.22) 48%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(70% 58% at 74% 62%, rgba(66, 66, 78, 0.3) 0%, rgba(24, 24, 32, 0.2) 52%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(85% 70% at 52% 50%, rgba(0, 0, 0, 0.88) 18%, rgba(0, 0, 0, 0) 100%);
  filter: blur(20px) saturate(0.8);
  will-change: transform, opacity;
}

.ss-transition-abyss {
  inset: -22%;
  opacity: 0;
  transform: translate3d(2%, -2%, 0) scale(1.05);
  background: radial-gradient(95% 84% at 42% 46%, rgba(0, 0, 0, 0.96) 22%, rgba(0, 0, 0, 0.78) 58%, rgba(0, 0, 0, 0.2) 78%, rgba(0, 0, 0, 0) 100%);
  filter: blur(12px);
  will-change: transform, opacity;
}

.ss-mist {
  inset: -30%;
  background:
    radial-gradient(50% 42% at 24% 36%, rgba(84, 84, 96, 0.36) 0%, rgba(34, 34, 44, 0.26) 46%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(56% 46% at 74% 58%, rgba(72, 72, 84, 0.34) 0%, rgba(28, 28, 38, 0.24) 48%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(60% 50% at 52% 52%, rgba(14, 14, 18, 0.72) 0%, rgba(0, 0, 0, 0) 100%);
  filter: blur(30px) saturate(0.78);
  opacity: 0;
  transform: translate3d(-2%, 3%, 0) scale(calc(var(--ss-ms, 1) * 0.72)) rotate(calc(var(--ss-mr, 0deg) * -0.2));
  will-change: transform, opacity;
}

.ss-shard {
  border-radius: 999px;
  transform-origin: center;
  background: linear-gradient(180deg, rgba(204, 188, 166, 0.78) 0%, rgba(96, 72, 54, 0.54) 52%, rgba(16, 10, 8, 0) 100%);
  box-shadow: 0 0 6px rgba(110, 82, 56, 0.28);
  opacity: 0;
  will-change: transform, opacity;
}

.ss-transition-overlay--waapi .ss-transition-plume,
.ss-transition-overlay--waapi .ss-transition-abyss,
.ss-transition-overlay--waapi .ss-mist,
.ss-transition-overlay--waapi .ss-shard {
  animation: none !important;
}

.ss-transition-overlay--css {
  background: radial-gradient(120% 95% at 50% 50%, rgba(8, 8, 12, 0.7) 30%, rgba(0, 0, 0, 0.88) 100%);
  animation: ss-mist-css-overlay var(--ss-total-duration, 1000ms) cubic-bezier(.2,.58,.2,1) forwards;
}

.ss-transition-overlay--css .ss-transition-plume {
  animation: ss-mist-css-plume calc(var(--ss-total-duration, 1000ms) + 120ms) cubic-bezier(.22,.61,.36,1) forwards;
}

.ss-transition-overlay--css .ss-transition-abyss {
  animation: ss-mist-css-abyss calc(var(--ss-total-duration, 1000ms) + 80ms) ease-out forwards;
}

.ss-transition-overlay--css .ss-mist {
  animation: ss-mist-css-mist calc(var(--ss-total-duration, 1000ms) + 180ms) cubic-bezier(.22,.61,.36,1) forwards;
  animation-delay: var(--ss-mist-delay, 0ms);
}

.ss-transition-overlay--css .ss-shard {
  animation: ss-mist-css-shard 900ms cubic-bezier(.22,.61,.36,1) forwards;
  animation-delay: var(--ss-delay, 0ms);
}

.ss-transition-overlay--reduced {
  background: rgba(0, 0, 0, 0.65);
}

.ss-transition-overlay--reduced .ss-transition-plume,
.ss-transition-overlay--reduced .ss-transition-abyss,
.ss-transition-overlay--reduced .ss-mist,
.ss-transition-overlay--reduced .ss-shard {
  display: none;
}
`;
}


function buildCSS() {
  return `
${buildPortalTransitionCSS()}

/* ─── Shadow Senses Widget ──────────────────────────────────────────────── */

.shadow-senses-widget {
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(138, 43, 226, 0.05));
  border: 1px solid #8a2be2;
  border-radius: 2px;
  padding: 8px 10px;
  margin: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.shadow-senses-widget:hover {
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.25), rgba(138, 43, 226, 0.1));
  border-color: #a78bfa;
}

.shadow-senses-widget-label {
  color: #a78bfa;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.shadow-senses-widget-badge {
  background: #8a2be2;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 2px;
  min-width: 20px;
  text-align: center;
}

/* ─── Overlay ───────────────────────────────────────────────────────────── */

.shadow-senses-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(5px);
}

/* ─── Panel ─────────────────────────────────────────────────────────────── */

.shadow-senses-panel {
  background: #1e1e2e;
  border: 1px solid #8a2be2;
  border-radius: 2px;
  width: 700px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(138, 43, 226, 0.3);
}

.shadow-senses-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(138, 43, 226, 0.3);
}

.shadow-senses-panel-title {
  color: #8a2be2;
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.shadow-senses-close-btn {
  background: transparent;
  border: none;
  color: #999;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 2px;
  transition: color 0.15s ease;
}

.shadow-senses-close-btn:hover {
  color: #fff;
}

/* ─── Tabs ──────────────────────────────────────────────────────────────── */

.shadow-senses-tabs {
  display: flex;
  border-bottom: 1px solid rgba(138, 43, 226, 0.2);
  padding: 0 20px;
}

.shadow-senses-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #999;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.shadow-senses-tab:hover {
  color: #ccc;
}

.shadow-senses-tab.active {
  color: #8a2be2;
  border-bottom-color: #8a2be2;
}

/* ─── Feed Card ─────────────────────────────────────────────────────────── */

.shadow-senses-feed-card {
  background: rgba(20, 20, 40, 0.6);
  border: 1px solid rgba(138, 43, 226, 0.15);
  border-radius: 2px;
  padding: 10px 14px;
  margin: 4px 0;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.shadow-senses-feed-card:hover {
  border-color: #8a2be2;
  background: rgba(20, 20, 40, 0.8);
}

.shadow-senses-feed-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #a78bfa;
  margin-bottom: 4px;
}

.shadow-senses-feed-card-header .time {
  color: #666;
  margin-left: auto;
}

.shadow-senses-feed-card-header .channel {
  color: #60a5fa;
}

.shadow-senses-feed-card-header .shadow-info {
  font-weight: 600;
}

.shadow-senses-feed-content {
  color: #ccc;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* ─── Deploy / Recall ───────────────────────────────────────────────────── */

.shadow-senses-deploy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(20, 20, 40, 0.4);
  border-radius: 2px;
  margin: 4px 0;
  border: 1px solid rgba(138, 43, 226, 0.1);
}

.shadow-senses-deploy-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ccc;
  font-size: 13px;
}

.shadow-senses-deploy-rank {
  font-weight: 700;
  font-size: 12px;
  min-width: 24px;
  text-align: center;
}

.shadow-senses-deploy-arrow {
  color: #666;
  font-size: 14px;
}

.shadow-senses-deploy-target {
  color: #a78bfa;
  font-weight: 600;
}

.shadow-senses-recall-btn {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid #ef4444;
  color: #ef4444;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.shadow-senses-recall-btn:hover {
  background: rgba(239, 68, 68, 0.3);
}

.shadow-senses-deploy-btn {
  background: rgba(138, 43, 226, 0.15);
  border: 1px solid #8a2be2;
  color: #a78bfa;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 2px;
  cursor: pointer;
  width: 100%;
  text-align: center;
  transition: background 0.15s ease;
}

.shadow-senses-deploy-btn:hover {
  background: rgba(138, 43, 226, 0.3);
}

/* ─── Picker (shadow selection overlay) ─────────────────────────────────── */

.shadow-senses-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  z-index: 10003;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(5px);
}

.shadow-senses-picker {
  background: #1e1e2e;
  border: 1px solid #8a2be2;
  border-radius: 2px;
  width: 400px;
  max-width: 90vw;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(138, 43, 226, 0.3);
}

.shadow-senses-picker-title {
  color: #8a2be2;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 12px;
  text-align: center;
  padding: 14px 14px 0;
}

.shadow-senses-picker-shadow-name {
  color: #ccc;
  font-size: 13px;
}

.shadow-senses-picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(138, 43, 226, 0.1);
  transition: background 0.15s ease;
}

.shadow-senses-picker-item:hover {
  background: rgba(138, 43, 226, 0.15);
}

.shadow-senses-picker-item:last-child {
  border-bottom: none;
}

/* ─── Footer ────────────────────────────────────────────────────────────── */

.shadow-senses-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid rgba(138, 43, 226, 0.2);
  color: #666;
  font-size: 11px;
}

/* ─── Status Toasts ─────────────────────────────────────────────────────── */

.shadow-senses-status-toast-root {
  position: fixed;
  top: 72px;
  right: 18px;
  width: min(360px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 10010;
  pointer-events: none;
}

.shadow-senses-status-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 0;
  border: 1px solid rgba(138, 43, 226, 0.38);
  border-left: 3px solid var(--ss-status-accent, #8a2be2);
  background:
    radial-gradient(120% 100% at 20% 12%, rgba(138, 43, 226, 0.18) 0%, rgba(12, 10, 22, 0) 56%),
    linear-gradient(135deg, rgba(18, 14, 34, 0.96), rgba(11, 9, 18, 0.95));
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(138, 43, 226, 0.15) inset;
  transform: translate3d(18px, 0, 0);
  opacity: 0;
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.shadow-senses-status-toast.is-visible {
  transform: translate3d(0, 0, 0);
  opacity: 1;
}

.shadow-senses-status-toast.is-leaving {
  transform: translate3d(18px, 0, 0);
  opacity: 0;
}

.shadow-senses-status-toast-avatar-wrap {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.shadow-senses-status-toast-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.shadow-senses-status-toast-avatar-fallback {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 800;
  color: #e9ddff;
  background: linear-gradient(160deg, rgba(138, 43, 226, 0.55), rgba(71, 33, 127, 0.8));
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.shadow-senses-status-toast-dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid #100b1f;
  background: #9ca3af;
}

.shadow-senses-status-toast-dot[data-status="online"] { background: #22c55e; }
.shadow-senses-status-toast-dot[data-status="idle"] { background: #f59e0b; }
.shadow-senses-status-toast-dot[data-status="dnd"] { background: #ef4444; }
.shadow-senses-status-toast-dot[data-status="offline"],
.shadow-senses-status-toast-dot[data-status="invisible"] { background: #9ca3af; }

.shadow-senses-status-toast-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shadow-senses-status-toast-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  line-height: 1.2;
  color: #b8aacd;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.shadow-senses-status-toast-rank {
  font-weight: 800;
}

.shadow-senses-status-toast-chip {
  margin-left: auto;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(138, 43, 226, 0.48);
  background: rgba(138, 43, 226, 0.2);
  color: #d7c3ff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.shadow-senses-status-toast-message {
  color: #e4e4ee;
  font-size: 13px;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shadow-senses-status-toast-user {
  color: #ffffff;
  font-weight: 700;
}

.shadow-senses-status-toast-prev {
  color: #c8cad8;
}

.shadow-senses-status-toast-arrow {
  color: #8f94a8;
  font-weight: 700;
}

.shadow-senses-status-toast-next {
  color: var(--ss-status-accent, #8a2be2);
  font-weight: 700;
}

@media (max-width: 520px) {
  .shadow-senses-status-toast-root {
    right: 10px;
    left: 10px;
    width: auto;
    top: 68px;
  }
}

/* ─── Empty State ───────────────────────────────────────────────────────── */

.shadow-senses-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
`;
}

// ─── React Components ─────────────────────────────────────────────────────

function buildComponents(pluginRef) {
  const React = BdApi.React;
  const { useState, useEffect, useCallback, useRef, useReducer } = React;
  const ce = React.createElement;

  // ── FeedCard ──────────────────────────────────────────────────────────
  function FeedCard({ entry, onNavigate }) {
    const time = new Date(entry.timestamp);
    const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
    const rankColor = RANK_COLORS[entry.shadowRank] || "#8a2be2";
    const eventType = entry.eventType || "message";
    const isNavigable = !!(entry.guildId && entry.channelId && entry.guildId !== GLOBAL_UTILITY_FEED_ID);
    const eventLabel =
      eventType === "message" ? null :
      eventType === "status" ? "STATUS" :
      eventType === "typing" ? "TYPING" :
      eventType === "relationship" ? "CONNECTION" :
      eventType.toUpperCase();
    const contentText = eventType === "message"
      ? (entry.content ? `\u201C${entry.content}\u201D` : "\u2014 no text content \u2014")
      : (entry.content || "\u2014 no details \u2014");

    return ce("div", {
      className: "shadow-senses-feed-card",
      style: { cursor: isNavigable ? "pointer" : "default" },
      onClick: () => {
        if (!isNavigable) return;
        if (onNavigate) onNavigate(entry);
      },
    },
      ce("div", { className: "shadow-senses-feed-card-header" },
        ce("span", { style: { color: rankColor, fontWeight: 600 } },
          `[${entry.shadowRank}] ${entry.shadowName}`
        ),
        ce("span", { style: { color: "#666" } }, "\u2192"),
        ce("span", { style: { color: "#ccc" } }, entry.authorName),
        eventLabel
          ? ce("span", { style: { color: "#fbbf24", fontSize: "0.8em", fontWeight: 700 } }, eventLabel)
          : null,
        entry.guildName
          ? ce("span", { style: { color: "#a78bfa", fontSize: "0.85em" } }, entry.guildName)
          : null,
        entry.channelId
          ? ce("span", { style: { color: "#60a5fa" } }, `#${entry.channelName}`)
          : null,
        ce("span", { style: { color: "#666", marginLeft: "auto" } }, timeStr)
      ),
      ce("div", { className: "shadow-senses-feed-content" },
        contentText
      )
    );
  }

  // ── DeploymentRow ─────────────────────────────────────────────────────
  function DeploymentRow({ deployment, onRecall }) {
    const rankColor = RANK_COLORS[deployment.shadowRank] || "#8a2be2";

    return ce("div", { className: "shadow-senses-deploy-row" },
      ce("div", { className: "shadow-senses-deploy-info" },
        ce("span", { className: "shadow-senses-deploy-rank", style: { color: rankColor } },
          `[${deployment.shadowRank}]`
        ),
        ce("span", null, deployment.shadowName),
        ce("span", { className: "shadow-senses-deploy-arrow" }, "\u2192"),
        ce("span", { className: "shadow-senses-deploy-target" }, deployment.targetUsername)
      ),
      ce("button", {
        className: "shadow-senses-recall-btn",
        onClick: () => onRecall && onRecall(deployment),
      }, "Recall")
    );
  }

  // ── FeedTab ───────────────────────────────────────────────────────────
  function FeedTab({ onNavigate }) {
    const [feed, setFeed] = useState([]);
    const scrollRef = useRef(null);
    const prevLenRef = useRef(0);

    useEffect(() => {
      let lastVersion = -1;
      const poll = setInterval(() => {
        if (document.hidden) return; // PERF: Skip when window not visible
        try {
          const engine = pluginRef.sensesEngine;
          if (!engine) return;
          // Only copy the feed array when _feedVersion changes (~95% of polls skip)
          const currentVersion = engine._feedVersion;
          if (currentVersion !== lastVersion) {
            lastVersion = currentVersion;
            setFeed(engine.getActiveFeed());
          }
        } catch (_) { pluginRef.debugLog?.('REACT', 'Feed poll error', _); }
      }, 2000);
      // Initial load
      try {
        const engine = pluginRef.sensesEngine;
        if (engine) {
          setFeed(engine.getActiveFeed());
          lastVersion = engine._feedVersion;
        }
      } catch (_) { pluginRef.debugLog?.('REACT', 'Feed initial load error', _); }
      return () => clearInterval(poll);
    }, []);

    useEffect(() => {
      if (feed.length > prevLenRef.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      prevLenRef.current = feed.length;
    }, [feed.length]);

    if (feed.length === 0) {
      return ce("div", { className: "shadow-senses-empty" },
        "No messages detected yet. Shadows are watching..."
      );
    }

    return ce("div", {
      ref: scrollRef,
      style: { maxHeight: "50vh", overflowY: "auto", padding: "8px 16px" },
    },
      feed.map((entry, i) =>
        ce(FeedCard, { key: `${entry.messageId}-${i}`, entry, onNavigate })
      )
    );
  }

  // ── DeploymentsTab ────────────────────────────────────────────────────
  function DeploymentsTab({ onRecall, onDeployNew }) {
    const [deployments, setDeployments] = useState([]);

    useEffect(() => {
      try {
        setDeployments(pluginRef.deploymentManager ? pluginRef.deploymentManager.getDeployments() : []);
      } catch (_) { pluginRef.debugLog?.('REACT', 'Deployments load error', _); }
    }, []);

    const handleRecall = useCallback((deployment) => {
      try {
        if (pluginRef.deploymentManager) {
          pluginRef.deploymentManager.recall(deployment.shadowId);
          setDeployments(pluginRef.deploymentManager.getDeployments());
          pluginRef._widgetDirty = true;
        }
      } catch (err) {
        pluginRef.debugError("DeploymentsTab", "Recall failed:", err);
      }
      if (onRecall) onRecall(deployment);
    }, [onRecall]);

    if (deployments.length === 0) {
      return ce("div", { style: { padding: "16px" } },
        ce("div", { className: "shadow-senses-empty" },
          "No shadows deployed. Right-click a user to deploy a shadow."
        ),
        ce("button", {
          className: "shadow-senses-deploy-btn",
          onClick: onDeployNew,
          style: { marginTop: 12 },
        }, "Deploy New Shadow")
      );
    }

    return ce("div", { style: { padding: "8px 16px", maxHeight: "50vh", overflowY: "auto" } },
      deployments.map((d) =>
        ce(DeploymentRow, { key: d.shadowId, deployment: d, onRecall: handleRecall })
      ),
      ce("button", {
        className: "shadow-senses-deploy-btn",
        onClick: onDeployNew,
        style: { marginTop: 8 },
      }, "Deploy New Shadow")
    );
  }

  // ── SensesPanel ───────────────────────────────────────────────────────
  function SensesPanel({ onClose }) {
    const [activeTab, setActiveTab] = useState("feed");

    const handleOverlayClick = useCallback((e) => {
      if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const handleNavigate = useCallback((entry) => {
      if (!entry.guildId || !entry.channelId) { onClose(); return; }
      const path = entry.messageId
        ? `/channels/${entry.guildId}/${entry.channelId}/${entry.messageId}`
        : `/channels/${entry.guildId}/${entry.channelId}`;
      onClose();
      pluginRef.teleportToPath(path, {
        guildId: entry.guildId,
        channelId: entry.channelId,
        messageId: entry.messageId || null,
      });
    }, [onClose]);

    const handleDeployNew = useCallback(() => {
      BdApi.UI.showToast("Right-click a user to deploy a shadow", { type: "info" });
    }, []);

    const deployCount = pluginRef.deploymentManager
      ? pluginRef.deploymentManager.getDeploymentCount()
      : 0;
    const onlineMarkedCount = pluginRef.sensesEngine
      ? pluginRef.sensesEngine.getMarkedOnlineCount()
      : 0;
    const msgCount = pluginRef.sensesEngine
      ? pluginRef.sensesEngine.getSessionMessageCount()
      : 0;

    return ce("div", {
      className: "shadow-senses-overlay",
      onClick: handleOverlayClick,
    },
      ce("div", { className: "shadow-senses-panel" },
        // Header
        ce("div", { className: "shadow-senses-panel-header" },
          ce("h2", { className: "shadow-senses-panel-title" }, "Shadow Senses"),
          ce("button", {
            className: "shadow-senses-close-btn",
            onClick: onClose,
          }, "\u2715")
        ),
        // Tabs
        ce("div", { className: "shadow-senses-tabs" },
          ce("button", {
            className: `shadow-senses-tab${activeTab === "feed" ? " active" : ""}`,
            onClick: () => setActiveTab("feed"),
          }, "Active Feed"),
          ce("button", {
            className: `shadow-senses-tab${activeTab === "deployments" ? " active" : ""}`,
            onClick: () => setActiveTab("deployments"),
          }, "Deployments")
        ),
        // Tab content
        activeTab === "feed"
          ? ce(FeedTab, { onNavigate: handleNavigate })
          : ce(DeploymentsTab, { onRecall: null, onDeployNew: handleDeployNew }),
        // Footer
        ce("div", { className: "shadow-senses-footer" },
          ce("span", null,
            pluginRef.settings?.showMarkedOnlineCount
              ? `${deployCount} deployed \u2022 ${onlineMarkedCount} online`
              : `${deployCount} shadow${deployCount !== 1 ? "s" : ""} deployed`
          ),
          ce("span", null, `${msgCount} detection${msgCount !== 1 ? "s" : ""} (since restart)`)
        )
      )
    );
  }

  // ── SensesWidget ──────────────────────────────────────────────────────
  function SensesWidget() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    useEffect(() => {
      pluginRef._widgetForceUpdate = forceUpdate;
      const poll = setInterval(() => {
        if (document.hidden) return; // PERF: Skip when window not visible
        if (pluginRef._widgetDirty) {
          pluginRef._widgetDirty = false;
          forceUpdate();
        }
      }, 3000);
      return () => {
        clearInterval(poll);
        pluginRef._widgetForceUpdate = null;
      };
    }, []);

    const feedCount = pluginRef.sensesEngine
      ? pluginRef.sensesEngine.getActiveFeedCount()
      : 0;
    const label = "Shadow Sense";

    return ce("div", {
      className: "shadow-senses-widget",
      onClick: () => pluginRef.openPanel(),
    },
      ce("span", { className: "shadow-senses-widget-label" },
        label
      ),
      feedCount > 0
        ? ce("span", { className: "shadow-senses-widget-badge" }, feedCount)
        : null
    );
  }

  // ── ShadowPicker ──────────────────────────────────────────────────────
  function ShadowPicker({ targetUser, onSelect, onClose }) {
    const [shadows, setShadows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const available = pluginRef.deploymentManager
            ? await pluginRef.deploymentManager.getAvailableShadows()
            : [];
          if (!cancelled) {
            // Sort by rank — higher ranks first
            const sorted = [...available].sort((a, b) => {
              const aIdx = RANKS.indexOf(a.rank || "E");
              const bIdx = RANKS.indexOf(b.rank || "E");
              return bIdx - aIdx;
            });
            setShadows(sorted);
            setLoading(false);
          }
        } catch (err) {
          if (!cancelled) {
            pluginRef.debugError("ShadowPicker", "Failed to load shadows:", err);
            setLoading(false);
          }
        }
      })();
      return () => { cancelled = true; };
    }, []);

    const handleOverlayClick = useCallback((e) => {
      if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const targetName = targetUser
      ? (targetUser.globalName || targetUser.username || "User")
      : "User";

    return ce("div", {
      className: "shadow-senses-picker-overlay",
      onClick: handleOverlayClick,
    },
      ce("div", { className: "shadow-senses-picker" },
        ce("div", { className: "shadow-senses-picker-title" },
          `Deploy a shadow to watch ${targetName}`
        ),
        ce("div", { style: { overflowY: "auto", flex: 1 } },
          loading
            ? ce("div", { className: "shadow-senses-empty" }, "Loading shadows...")
            : shadows.length === 0
              ? ce("div", { className: "shadow-senses-empty" }, "No available shadows. Extract more from ShadowArmy first.")
              : shadows.map((shadow) => {
                  const rankColor = RANK_COLORS[shadow.rank] || "#8a2be2";
                  return ce("div", {
                    key: shadow.id,
                    className: "shadow-senses-picker-item",
                    onClick: () => onSelect(shadow),
                  },
                    ce("span", { className: "shadow-senses-picker-shadow-name" },
                      shadow.roleName || shadow.role || shadow.name || "Shadow"
                    ),
                    ce("span", { style: { color: rankColor, fontWeight: 700, fontSize: 12 } },
                      `[${shadow.rank || "E"}]`
                    )
                  );
                })
        )
      )
    );
  }

  return { SensesWidget, SensesPanel, ShadowPicker };
}

// ─── Shared Utilities ─────────────────────────────────────────────────────
let _ReactUtils;
try { _ReactUtils = _bdLoad('BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }
let _PluginUtils;
try { _PluginUtils = _bdLoad('BetterDiscordPluginUtils.js'); } catch (_) { _PluginUtils = null; }
const _ttl = _PluginUtils?.createTTLCache || (ms => { let v, t = 0; return { get: () => Date.now() - t < ms ? v : null, set: x => { v = x; t = Date.now(); }, invalidate: () => { v = null; t = 0; } }; });

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
      console.log(`[${PLUGIN_NAME}] Starting v${PLUGIN_VERSION}...`);
      this._debugMode = BdApi.Data.load(PLUGIN_NAME, "debugMode") ?? false;
      this.loadSettings();
      this._stopped = false;
      this._widgetDirty = true;
      this._panelOpen = false;
      this._pickerOpen = false;
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
      BdApi.UI.showToast(`${PLUGIN_NAME} v${PLUGIN_VERSION} \u2014 Shadow deployment online`, { type: "info" });
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] FATAL: start() crashed:`, err);
      BdApi.UI.showToast(`${PLUGIN_NAME} failed to start: ${err.message}`, { type: "error" });
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

      // 3. Close panel + picker
      this.closePanel();
      if (this._pickerReactRoot) {
        try { this._pickerReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Picker unmount error in stop()', _); }
        this._pickerReactRoot = null;
      }
      const picker = document.getElementById("shadow-senses-picker-root");
      if (picker) picker.remove();
      this._pickerOpen = false;

      // 4. Widget + observer
      if (this._widgetObserver) {
        this._widgetObserver.disconnect();
        this._widgetObserver = null;
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
      this._cancelPendingTransition();
      this._clearNavigateRetries();
      this._cancelChannelViewFade();

      // 7. CSS
      this.removeCSS();

      // 7. Clear refs
      this._components = null;
      this.deploymentManager = null;
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    BdApi.UI.showToast(`${PLUGIN_NAME} \u2014 Shadows recalled`, { type: "info" });
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
        BdApi.UI.showToast(`${PLUGIN_NAME}: Dispatcher not found — message detection disabled`, { type: "error" });
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
      BdApi.UI.showToast("Shadow Senses navigation fallback used", { type: "warning" });
      return;
    }

    this.playTransition(() => {
      const fadeToken = this._beginChannelViewFadeOut();
      this._navigate(targetPath, context, {
        onConfirmed: () => this._finishChannelViewFade(fadeToken, true),
        onFailed: () => this._finishChannelViewFade(fadeToken, false),
      });
    });
  }

  injectCSS() {
    try {
      BdApi.DOM.addStyle(STYLE_ID, buildCSS());
      this.debugLog("CSS", "Injected via BdApi.DOM.addStyle");
    } catch (err) {
      // Manual fallback
      try {
        if (!document.getElementById(STYLE_ID)) {
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = buildCSS();
          document.head.appendChild(style);
          this.debugLog("CSS", "Injected via manual <style> fallback");
        }
      } catch (fallbackErr) {
        this.debugError("CSS", "Failed to inject CSS", fallbackErr);
      }
    }
  }

  removeCSS() {
    try {
      BdApi.DOM.removeStyle(STYLE_ID);
    } catch (err) {
      // Manual fallback
      try {
        const el = document.getElementById(STYLE_ID);
        if (el) el.remove();
      } catch (fallbackErr) {
        this.debugError("CSS", "Failed to remove CSS", fallbackErr);
      }
    }
  }

  debugLog(system, ...args) {
    if (this._debugMode) console.log(`[${PLUGIN_NAME}][${system}]`, ...args);
  }

  debugError(system, ...args) {
    console.error(`[${PLUGIN_NAME}][${system}]`, ...args);
  }

  // ── Widget Injection ────────────────────────────────────────────────────

  _getMembersWrap() {
    try {
      const wraps = document.querySelectorAll('[class^="membersWrap_"], [class*=" membersWrap_"]');
      for (const wrap of wraps) {
        if (wrap.offsetParent !== null) return wrap;
      }
    } catch (err) {
      this.debugError("Widget", "Failed to find membersWrap", err);
    }
    return null;
  }

  _getCreateRoot() {
    if (_ReactUtils?.getCreateRoot) return _ReactUtils.getCreateRoot();
    // Minimal inline fallback
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  }

  injectWidget() {
    try {
      if (!this._components?.SensesWidget) {
        this.debugError?.('Widget', 'Components not initialized');
        return;
      }

      // Clean up any existing widget
      this.removeWidget();

      const membersWrap = this._getMembersWrap();
      if (!membersWrap) {
        this.debugLog("Widget", "membersWrap not found, skipping widget inject");
        return;
      }

      // Find innermost content target: membersList > membersContent (or first child)
      const membersList = membersWrap.querySelector('[class^="members_"], [class*=" members_"]');
      const target = membersList || membersWrap;

      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        this.debugError("Widget", "createRoot not available");
        return;
      }

      // Create spacer
      const spacer = document.createElement("div");
      spacer.id = WIDGET_SPACER_ID;
      spacer.style.height = "16px";
      spacer.style.flexShrink = "0";

      // Create widget container
      const widgetDiv = document.createElement("div");
      widgetDiv.id = WIDGET_ID;
      widgetDiv.style.flexShrink = "0";

      // Insert at top
      if (target.firstChild) {
        target.insertBefore(widgetDiv, target.firstChild);
        target.insertBefore(spacer, widgetDiv);
      } else {
        target.appendChild(spacer);
        target.appendChild(widgetDiv);
      }

      // Mount React
      const root = createRoot(widgetDiv);
      root.render(BdApi.React.createElement(this._components.SensesWidget));
      this._widgetReactRoot = root;

      this.debugLog("Widget", "Injected into members panel");
    } catch (err) {
      this.debugError("Widget", "Failed to inject widget", err);
    }
  }

  removeWidget() {
    try {
      if (this._widgetReactRoot) {
        try { this._widgetReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Widget unmount error', _); }
        this._widgetReactRoot = null;
      }
      const existing = document.getElementById(WIDGET_ID);
      if (existing) existing.remove();
      const spacer = document.getElementById(WIDGET_SPACER_ID);
      if (spacer) spacer.remove();
    } catch (err) {
      this.debugError("Widget", "Failed to remove widget", err);
    }
  }

  setupWidgetObserver() {
    try {
      const appMount = document.getElementById("app-mount");
      if (!appMount) {
        this.debugError("Widget", "app-mount not found for observer");
        return;
      }

      // Narrow target: observe layout container instead of entire Discord DOM.
      // Chromium creates O(depth) ancestor walks per mutation with subtree:true.
      // app-mount captures ALL mutations (typing, presence, popups, tooltips).
      // Layout container only captures channel/member list structural changes.
      const layoutContainer = appMount.querySelector('[class*="base_"][class*="container_"]')
        || appMount.querySelector('[class*="app_"]')
        || appMount; // fallback if Discord class names change

      let lastCheck = 0;
      this._widgetObserver = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastCheck < 500) return; // 500ms — widget reinject is not time-critical
        lastCheck = now;

        const membersWrap = this._getMembersWrap();
        const widgetEl = document.getElementById(WIDGET_ID);

        if (membersWrap && !widgetEl) {
          // Members visible but widget gone — reinject after short delay
          clearTimeout(this._widgetReinjectTimeout);
          this._widgetReinjectTimeout = setTimeout(() => {
            try { this.injectWidget(); } catch (err) {
              this.debugError("Widget", "Reinject failed", err);
            }
          }, WIDGET_REINJECT_DELAY_MS);
        } else if (!membersWrap && widgetEl) {
          // Members gone but widget still in DOM — clean up
          this.removeWidget();
        }
      });

      this._widgetObserver.observe(layoutContainer, { childList: true, subtree: true });
      this.debugLog("Widget", `MutationObserver attached to ${layoutContainer === appMount ? "app-mount (fallback)" : "layout container"}`);
    } catch (err) {
      this.debugError("Widget", "Failed to setup observer", err);
    }
  }

  // ── Panel ───────────────────────────────────────────────────────────────

  openPanel() {
    try {
      if (!this._components?.SensesPanel) {
        this.debugError?.('Panel', 'Components not initialized');
        return;
      }

      // Force-close any existing panel to prevent overlap
      if (this._panelReactRoot) {
        try { this._panelReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Panel pre-close unmount error', _); }
        this._panelReactRoot = null;
      }

      // Toggle if already open
      if (this._panelOpen) {
        this.closePanel();
        return;
      }

      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        this.debugError("Panel", "createRoot not available");
        return;
      }

      const container = document.createElement("div");
      container.id = PANEL_CONTAINER_ID;
      container.style.display = "contents";
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(BdApi.React.createElement(this._components.SensesPanel, {
        onClose: () => this.closePanel(),
      }));

      this._panelReactRoot = root;
      this._panelOpen = true;
      this.debugLog("Panel", "Opened");
    } catch (err) {
      this.debugError("Panel", "Failed to open panel", err);
    }
  }

  closePanel() {
    try {
      if (this._panelReactRoot) {
        try { this._panelReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Panel unmount error', _); }
        this._panelReactRoot = null;
      }
      const container = document.getElementById(PANEL_CONTAINER_ID);
      if (container) container.remove();
      this._panelOpen = false;
      this.debugLog("Panel", "Closed");
    } catch (err) {
      this.debugError("Panel", "Failed to close panel", err);
    }
  }

  // ── Shadow Picker ───────────────────────────────────────────────────────

  openShadowPicker(targetUser) {
    try {
      if (!this._components?.ShadowPicker) {
        this.debugError?.('Picker', 'Components not initialized');
        return;
      }

      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        this.debugError("Picker", "createRoot not available");
        return;
      }

      // Close existing picker if open
      if (this._pickerReactRoot) {
        try { this._pickerReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Picker unmount error in openShadowPicker()', _); }
        this._pickerReactRoot = null;
      }
      const existingPicker = document.getElementById("shadow-senses-picker-root");
      if (existingPicker) existingPicker.remove();

      const container = document.createElement("div");
      container.id = "shadow-senses-picker-root";
      container.style.display = "contents";
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(BdApi.React.createElement(this._components.ShadowPicker, {
        targetUser,
        onSelect: async (shadow) => {
          try {
            const success = await this.deploymentManager.deploy(shadow, targetUser);
            if (success) {
              const targetName = targetUser.globalName || targetUser.username || "User";
              BdApi.UI.showToast(
                `Deployed ${shadow.roleName || shadow.role || "Shadow"} [${shadow.rank || "E"}] to monitor ${targetName}`,
                { type: "success" }
              );
              this._widgetDirty = true;
            } else {
              BdApi.UI.showToast("Shadow already deployed or target already monitored", { type: "warning" });
            }
          } catch (err) {
            this.debugError("Picker", "Deploy failed", err);
            BdApi.UI.showToast("Failed to deploy shadow", { type: "error" });
          }
          // Close picker after selection
          this._closePicker();
        },
        onClose: () => this._closePicker(),
      }));

      this._pickerReactRoot = root;
      this._pickerOpen = true;
      this.debugLog("Picker", "Opened for user", targetUser?.username);
    } catch (err) {
      this.debugError("Picker", "Failed to open picker", err);
    }
  }

  _closePicker() {
    try {
      if (this._pickerReactRoot) {
        try { this._pickerReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Picker unmount error in _closePicker()', _); }
        this._pickerReactRoot = null;
      }
      const container = document.getElementById("shadow-senses-picker-root");
      if (container) container.remove();
      this._pickerOpen = false;
      this.debugLog("Picker", "Closed");
    } catch (err) {
      this.debugError("Picker", "Failed to close picker", err);
    }
  }

  // ── ESC Handler ─────────────────────────────────────────────────────────

  registerEscHandler() {
    try {
      this._escHandler = (e) => {
        if (e.key !== "Escape") return;
        // Close picker first (higher z-index), then panel
        if (this._pickerOpen) {
          this._closePicker();
          e.stopPropagation();
        } else if (this._panelOpen) {
          this.closePanel();
          e.stopPropagation();
        }
      };
      document.addEventListener("keydown", this._escHandler);
      this.debugLog("ESC", "Handler registered");
    } catch (err) {
      this.debugError("ESC", "Failed to register ESC handler", err);
    }
  }

  // ── Context Menu ────────────────────────────────────────────────────────

  patchContextMenu() {
    try {
      this._unpatchContextMenu = BdApi.ContextMenu.patch("user-context", (tree, props) => {
        // No outer try-catch — let menu construction errors propagate visibly
        if (!props || !props.user) return;
        const user = props.user;
        const userId = user.id;

        const deployment = this.deploymentManager.getDeploymentForUser(userId);

        let menuItem;
        if (deployment) {
          // Already monitored — show recall option
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: "Recall",
            action: () => {
              try {
                this.deploymentManager.recall(deployment.shadowId);
                BdApi.UI.showToast(
                  `Recalled ${deployment.shadowName} from ${deployment.targetUsername}`,
                  { type: "info" }
                );
                this._widgetDirty = true;
              } catch (err) {
                this.debugError("ContextMenu", "Recall failed", err);
              }
            },
          });
        } else {
          // Not monitored — auto-deploy weakest available shadow
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: "Deploy Shadow",
            action: async () => {
              // Try-catch only around risky async shadow loading
              let available;
              try {
                available = this.deploymentManager
                  ? await this.deploymentManager.getAvailableShadows()
                  : [];
              } catch (err) {
                this.debugError("ContextMenu", "Failed to load available shadows", err);
                BdApi.UI.showToast("Failed to load shadows", { type: "error" });
                return;
              }

              try {
                if (available.length === 0) {
                  BdApi.UI.showToast("No available shadows. All are deployed, in dungeons, or marked for exchange.", { type: "warning" });
                  return;
                }
                // Sort weakest first (ascending rank index)
                const sorted = [...available].sort((a, b) => {
                  const aIdx = RANKS.indexOf(a.rank || "E");
                  const bIdx = RANKS.indexOf(b.rank || "E");
                  return aIdx - bIdx;
                });
                const weakest = sorted[0];
                const success = await this.deploymentManager.deploy(weakest, user);
                if (success) {
                  const targetName = user.globalName || user.username || "User";
                  BdApi.UI.showToast(
                    `Deployed ${weakest.roleName || weakest.role || "Shadow"} [${weakest.rank || "E"}] to monitor ${targetName}`,
                    { type: "success" }
                  );
                  this._widgetDirty = true;
                } else {
                  BdApi.UI.showToast("Shadow already deployed or target already monitored", { type: "warning" });
                }
              } catch (err) {
                this.debugError("ContextMenu", "Auto-deploy failed", err);
                BdApi.UI.showToast("Failed to deploy shadow", { type: "error" });
              }
            },
          });
        }

        const separator = BdApi.ContextMenu.buildItem({ type: "separator" });

        // Append to children
        if (tree && tree.props && tree.props.children) {
          if (Array.isArray(tree.props.children)) {
            tree.props.children.push(separator, menuItem);
          }
        }
      });
      this.debugLog("ContextMenu", "Patched user-context menu");
    } catch (err) {
      this.debugError("ContextMenu", "Failed to patch context menu", err);
    }
  }

  getSettingsPanel() {
    const React = BdApi.React;
    const ce = React.createElement;

    const deployCount = this.deploymentManager?.getDeploymentCount() || 0;
    const onlineMarkedCount = this.sensesEngine?.getMarkedOnlineCount?.() || 0;
    const sessionCount = this.sensesEngine?.getSessionMessageCount() || 0;
    const totalDetections = this.sensesEngine?.getTotalDetections() || 0;

    const statCardStyle = {
      background: "rgba(138, 43, 226, 0.1)",
      border: "1px solid rgba(138, 43, 226, 0.3)",
      borderRadius: "8px",
      padding: "12px",
      textAlign: "center",
    };
    const rowStyle = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      marginTop: "10px",
    };

    const updateSetting = (key, value) => {
      this.settings[key] = value;
      this.saveSettings();
      this._widgetDirty = true;
      if (typeof this._widgetForceUpdate === "function") this._widgetForceUpdate();
    };

    return ce("div", { style: { padding: "16px", background: "#1e1e2e", borderRadius: "8px", color: "#ccc" } },
      // Statistics header
      ce("h3", { style: { color: "#8a2be2", marginTop: 0, marginBottom: "12px" } }, "Shadow Senses Statistics"),

      // Stat cards grid
      ce("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" } },
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, deployCount),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Deployed")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, onlineMarkedCount),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Marked Online")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, sessionCount),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Detections (since restart)")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, totalDetections.toLocaleString()),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Total Detections")
        )
      ),

      ce("h3", { style: { color: "#8a2be2", marginTop: 0, marginBottom: "8px", fontSize: "14px" } }, "Marked Utility Alerts"),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Status Change Alerts"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.statusAlerts,
          onChange: (e) => updateSetting("statusAlerts", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Typing Alerts"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.typingAlerts,
          onChange: (e) => updateSetting("typingAlerts", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Removed Friend Alerts"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.removedFriendAlerts,
          onChange: (e) => updateSetting("removedFriendAlerts", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Show Marked Online Count"),
        ce("input", {
          type: "checkbox",
          defaultChecked: !!this.settings.showMarkedOnlineCount,
          onChange: (e) => updateSetting("showMarkedOnlineCount", e.target.checked),
          style: { accentColor: "#8a2be2" },
        })
      ),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Typing Alert Cooldown (seconds)"),
        ce("input", {
          type: "number",
          min: 3,
          max: 60,
          step: 1,
          defaultValue: Math.round((this.settings.typingAlertCooldownMs || DEFAULT_TYPING_ALERT_COOLDOWN_MS) / 1000),
          onChange: (e) => {
            const seconds = Number(e.target.value);
            if (!Number.isFinite(seconds)) return;
            updateSetting("typingAlertCooldownMs", Math.min(60000, Math.max(3000, Math.floor(seconds * 1000))));
          },
          style: {
            width: "80px",
            padding: "4px 6px",
            borderRadius: "6px",
            border: "1px solid rgba(138, 43, 226, 0.4)",
            background: "#111827",
            color: "#ccc",
          },
        })
      ),

      ce("h3", { style: { color: "#8a2be2", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Feed Policy"),
      ce("div", {
        style: {
          marginTop: "6px",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(138, 43, 226, 0.25)",
          background: "rgba(138, 43, 226, 0.08)",
          color: "#b8b8b8",
          fontSize: "12px",
          lineHeight: 1.45,
        },
      },
      "Status, typing, and connection alerts are toast-only and are not saved in Active Feed history. ",
      "Active Feed records chat message detections only."
      ),

      ce("h3", { style: { color: "#8a2be2", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Diagnostics"),

      ce("div", { style: rowStyle },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Debug Mode"),
        ce("input", {
          type: "checkbox",
          defaultChecked: this._debugMode,
          onChange: (e) => {
            this._debugMode = e.target.checked;
            BdApi.Data.save(PLUGIN_NAME, "debugMode", this._debugMode);
          },
          style: { accentColor: "#8a2be2" },
        })
      )
    );
  }
};

const _loadShadowPortalCore = () => {
  try {
    const path = require("path");
    const fs = require("fs");
    const candidates = [];
    if (BdApi?.Plugins?.folder && typeof BdApi.Plugins.folder === "string") {
      candidates.push(path.join(BdApi.Plugins.folder, "ShadowPortalCore.js"));
    }
    candidates.push("./ShadowPortalCore.js");

    for (const candidate of candidates) {
      try {
        const resolved = require.resolve(candidate);
        if (require.cache[resolved]) delete require.cache[resolved];
        const mod = require(resolved);
        if (mod?.applyPortalCoreToClass) return mod;
      } catch (_) {}
      try {
        const absolute = path.isAbsolute(candidate)
          ? candidate
          : path.join(BdApi?.Plugins?.folder || "", candidate.replace(/^\.\//, ""));
        if (!absolute || !fs.existsSync(absolute)) continue;
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
        const loaded = factory(moduleObj, moduleObj.exports, require, typeof window !== "undefined" ? window : null, BdApi);
        const mod = loaded || moduleObj.exports || (typeof window !== "undefined" ? window.ShadowPortalCore : null);
        if (mod?.applyPortalCoreToClass) return mod;
      } catch (_) {}
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
  console.warn(`[${PLUGIN_NAME}] Shared portal core unavailable. Navigation/transition patch will not be shared.`);
}
