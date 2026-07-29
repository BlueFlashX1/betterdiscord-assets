const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const { createToast } = require("../shared/toast");
const { loadSettings, saveSettings } = require("../shared/settings");
const PLUGIN_NAME = "ShadowRecon";
const PLUGIN_VERSION = "1.0.5";
const STYLE_ID = "shadow-recon-css";
const WIDGET_ID = "shadow-recon-widget";
const MODAL_ID = "shadow-recon-modal-root";
const SNOWFLAKE_RE = /\d{16,20}/;

const DEFAULT_SETTINGS = {
  loreLockedRecon: true,
  showServerCounterWidget: true,
  showGuildHoverIntel: true,
  showStaffIntelInContextMenu: true,
  showMarkedTargetIntelInContext: true,
  // Tier C dispatcher-subscriber features. Default OFF for privacy —
  // user opts in via settings panel toggles. Both subscribe to
  // PRESENCE_UPDATES; skirmish also subscribes to VOICE_STATE_UPDATES
  // and CHANNEL_SELECT. Strong gate: only marked targets in marked
  // guilds get tracked.
  enableSkirmishLog: false,
  enableAuraReading: false,
};

// Channel-permission cache TTL for "Choke Points" intel (5 minutes).
const CHOKE_POINT_CACHE_TTL = 5 * 60 * 1000;

// Ring-buffer caps. All entries are {t: epochMs, ...payload} JSON.
const PATROL_RING_CAP = 168;     // ~1 week of hourly samples per marked guild
const MANA_RING_CAP = 90;        // 90 days of daily member-count samples
const SKIRMISH_RING_CAP = 200;   // ~24h activity trail per marked target
const AURA_RING_CAP = 100;       // ~100 distinct aura/activity changes per target

const IMPORTANT_PERMISSIONS = [
  "ADMINISTRATOR",
  "MANAGE_GUILD",
  "MANAGE_CHANNELS",
  "MANAGE_ROLES",
  "MANAGE_MESSAGES",
  "MANAGE_EVENTS",
  "MANAGE_THREADS",
  "BAN_MEMBERS",
  "KICK_MEMBERS",
  "VIEW_AUDIT_LOG",
  "MENTION_EVERYONE",
  "MODERATE_MEMBERS",
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "CONNECT",
  "SPEAK",
];

const STAFF_PERMISSION_KEYS = [
  "ADMINISTRATOR",
  "MANAGE_GUILD",
  "MANAGE_CHANNELS",
  "MANAGE_ROLES",
  "MANAGE_MESSAGES",
  "BAN_MEMBERS",
  "KICK_MEMBERS",
  "MANAGE_EVENTS",
  "MANAGE_THREADS",
  "MODERATE_MEMBERS",
];

const PLATFORM_LABELS = {
  desktop: "Desktop",
  web: "Web",
  mobile: "Mobile",
  embedded: "Embedded",
};

const STATUS_LABELS = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
  invisible: "Invisible",
  streaming: "Streaming",
};

let _PluginUtils;
try { _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

const _humanizedPermCache = {}; // permission key → "Manage Channels" etc. (fixed set, never evicted)

const { buildSettingsPanel } = require("./settings-panel");
const { getShadowReconCss } = require("./styles");
const {
  createModal,
  buildKeyValueSection,
  buildPermissionsSection,
} = require("./modal-utils");
const {
  getPlatformIntel,
} = require("./target-intel");
const {
  getCurrentUserPermissionSummary,
  getPermissionSummaryForMember,
  getStaffIntel,
  isDetailedStaffIntelUnlocked,
  bandRolesByPower,
  toBigInt,
} = require("./permissions");
const {
  ringPush,
  ringRead,
  flushRingBuffers,
  clearRingCache,
  bucketHour,
  bucketDay,
  dispatcherSubscribe,
  dispatcherUnsubscribeAll,
} = require("./intel-history");
const {
  clearGuildIconHints,
  getGuildOnlineCount,
  injectServerCounterWidget,
  refreshGuildIconHints,
  removeGuildTooltip,
  removeServerCounterWidget,
  updateServerCounterWidget,
} = require("./guild-visuals");
const {
  appendContextItems,
  buildGuildReconActions,
  buildUserContextReconItems,
} = require("./context-menu");
const { onPresence } = require("../shared/presence-bus");

module.exports = class ShadowRecon {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._markedGuildIds = new Set();
    this._stopped = true;

    this._guildContextUnpatch = null;
    this._channelContextUnpatch = null;
    this._userContextUnpatch = null;

    this._refreshInterval = null;
    this._visualRefreshTimeout = null;

    this._modalEl = null;

    this._shadowCache = { timestamp: 0, map: new Map(), diskFallbackDone: false };
    this._permissionBitsCache = null;
    this._allPermsBitsCache = undefined;
    this._onlineCountMethod = null; // cached working store method for online count
    this._guildsTargetCache = null; // cached DOM element for guild nav
    this._guildHintCache = new Map(); // guildId -> { memberCount, online, marked, title }
    this._guildNavOrientationCache = { target: null, measuredAt: 0, horizontal: false };
    this._guildNavOrientationCacheTTL = 1200;

    // Choke-points cache (Tier C item 10): guildId -> {ts, data}.
    // Computing per-channel permission bits scales linearly with channel
    // count; cache for 5 min so reopening the dossier is instant.
    this._chokePointCache = new Map();

    // FluxDispatcher subscription bookkeeping (Tier C items 8/9). Filled
    // by intel-history.dispatcherSubscribe; drained on stop().
    this._dispatcherSubs = [];
  }

  _clearRuntimeCaches() {
    this._permissionBitsCache = null;
    this._allPermsBitsCache = undefined;
    this._onlineCountMethod = null;
    this._guildsTargetCache = null;
    this._guildHintCache.clear();
    this._guildNavOrientationCache.target = null;
    this._guildNavOrientationCache.measuredAt = 0;
    this._guildNavOrientationCache.horizontal = false;
    if (this._shadowCache?.map) this._shadowCache.map.clear();
    this._shadowCache.timestamp = 0;
    this._shadowCache.diskFallbackDone = false;
  }

  start() {
    this._toast = _PluginUtils?.createToastHelper?.("shadowRecon") || createToast();
    try {
      if (!this._stopped) this.stop({ silent: true });
      this._stopped = false;
      this.loadSettings();
      this.loadMarkedGuilds();
      this.initWebpack();
      this.injectCSS();

      this.patchGuildContextMenu();
      this.patchChannelContextMenu();
      this.patchUserContextMenu();

      this.injectServerCounterWidget();
      this.refreshGuildIconHints();
      this.startRefreshLoops();
      this.setupObserver();
      this.refreshDispatcherSubs();

      // Discord's guild nav may not be in the DOM yet at startup.
      // Schedule a few early retries so the widget appears once the nav loads.
      if (!document.getElementById(WIDGET_ID)) {
        const retryDelays = [800, 2000, 5000];
        this._startupRetryTimers = retryDelays.map(delay =>
          setTimeout(() => {
            if (this._stopped) return;
            if (!document.getElementById(WIDGET_ID)) {
              this.injectServerCounterWidget();
              this.refreshGuildIconHints();
            }
          }, delay)
        );
      }

      this._toast(`${PLUGIN_NAME} v${PLUGIN_VERSION} - Recon online`, "info");
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed to start`, err);
      try { this.stop({ silent: true }); } catch (_) {}
      this._toast(`${PLUGIN_NAME} failed to start: ${err.message}`, "error");
    }
  }

  stop(options = {}) {
    const { silent = false } = options;
    this._stopped = true;
    if (this._saveMarkedGuildsTimer) {
      clearTimeout(this._saveMarkedGuildsTimer);
      this._saveMarkedGuildsTimer = null;
    }
    if (this._startupRetryTimers) {
      this._startupRetryTimers.forEach(t => clearTimeout(t));
      this._startupRetryTimers = null;
    }
    this.unpatchContextMenus();
    this.stopRefreshLoops();
    this.teardownObserver();
    this.removeServerCounterWidget();
    this.clearGuildIconHints();
    removeGuildTooltip();
    // Flush any buffered ring writes before unsubscribing so no data is lost.
    flushRingBuffers();
    // LEAK FIX: clear in-memory ring cache and cancel any pending debounced flush.
    clearRingCache();
    if (this._presenceUnsub) { this._presenceUnsub(); this._presenceUnsub = null; }
    dispatcherUnsubscribeAll(this);
    this._chokePointCache.clear();
    this._clearRuntimeCaches();
    this.closeModal();
    BdApi.DOM.removeStyle(STYLE_ID);
    if (!silent) this._toast(`${PLUGIN_NAME} - Recon dismissed`, "info");
  }

  // ---- Data / Settings -------------------------------------------------

  loadSettings() {
    this.settings = loadSettings(PLUGIN_NAME, DEFAULT_SETTINGS);
  }

  saveSettings() {
    saveSettings(PLUGIN_NAME, this.settings);
  }

  loadMarkedGuilds() {
    try {
      const raw = BdApi.Data.load(PLUGIN_NAME, "markedGuildIds");
      this._markedGuildIds = new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch (err) {
      this._markedGuildIds = new Set();
      console.error(`[${PLUGIN_NAME}] Failed loading marked guilds`, err);
    }
  }

  saveMarkedGuilds() {
    // Debounce: snapshot current set immediately, write after 0ms so rapid
    // bulk toggles (e.g. context-menu) coalesce into one BdApi.Data.save call.
    if (this._saveMarkedGuildsTimer) {
      clearTimeout(this._saveMarkedGuildsTimer);
    }
    const snapshot = Array.from(this._markedGuildIds);
    this._saveMarkedGuildsTimer = setTimeout(() => {
      this._saveMarkedGuildsTimer = null;
      try {
        BdApi.Data.save(PLUGIN_NAME, "markedGuildIds", snapshot);
      } catch (err) {
        console.error(`[${PLUGIN_NAME}] Failed saving marked guilds`, err);
      }
    }, 0);
  }

  isGuildMarked(guildId) {
    if (!guildId) return false;
    return this._markedGuildIds.has(String(guildId));
  }

  toggleGuildMark(guildId) {
    if (!guildId) return false;
    const id = String(guildId);
    const marked = this._markedGuildIds.has(id);
    if (marked) this._markedGuildIds.delete(id);
    else this._markedGuildIds.add(id);
    this.saveMarkedGuilds();
    this.refreshAllVisuals();
    return !marked;
  }

  _getCurrentGuildId() {
    return this._SelectedGuildStore?.getGuildId?.() || null;
  }

  _toggleCurrentGuildMarkWithToast() {
    const guildId = this._getCurrentGuildId();
    if (!guildId) {
      this._toast("Select a guild first", "warning");
      return null;
    }
    const marked = this.toggleGuildMark(guildId);
    const guild = this._GuildStore?.getGuild?.(guildId);
    this._toast(
      marked
        ? `Recon enabled for guild: ${guild?.name || guildId}`
        : `Recon removed for guild: ${guild?.name || guildId}`,
      marked ? "success" : "info"
    );
    return marked;
  }

  // ---- Webpack ---------------------------------------------------------

  initWebpack() {
    const { Webpack } = BdApi;

    this._GuildStore = Webpack.getStore("GuildStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._SelectedChannelStore = Webpack.getStore("SelectedChannelStore");
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._GuildChannelStore = Webpack.getStore("GuildChannelStore");

    this._UserStore = Webpack.getStore("UserStore");
    this._PresenceStore = Webpack.getStore("PresenceStore");
    this._GuildMemberStore = Webpack.getStore("GuildMemberStore");
    // GuildRoleStore (2026-07-13): Discord moved role data OUT of the guild
    // record (guild.roles) into a dedicated store. Without this, every
    // non-owner's permissions computed to zero — admins/mods/staff were
    // invisible. getStore returns null on builds that still keep guild.roles;
    // computeGuildPermissionBits falls back to that.
    this._GuildRoleStore = Webpack.getStore("GuildRoleStore");
    this._GuildMemberCountStore = Webpack.getStore("GuildMemberCountStore");
    this._SessionsStore = Webpack.getStore("SessionsStore");

    this._PermissionStore = Webpack.getStore("PermissionStore");

    this._PermissionsBits =
      Webpack.getModule(m => m && typeof m === "object" && m.ADMINISTRATOR && m.VIEW_CHANNEL, { searchExports: true }) ||
      Webpack.getByKeys("ADMINISTRATOR", "VIEW_CHANNEL");

    this._sortedGuildStore = Webpack.getStore("SortedGuildStore");

    // Cache stores used in per-guild counting methods (avoid repeated getStore calls)
    this._EmojiStore = Webpack.getStore("EmojiStore");
    this._StickersStore = Webpack.getStore("StickersStore");
    this._SoundboardStore = Webpack.getStore("SoundboardStore");

    // Voice state store for "Voice Encampments" (Tier B item 6).
    this._VoiceStateStore = Webpack.getStore("VoiceStateStore");
  }

  // ---- ShadowSenses Integration ---------------------------------------

  _getShadowDeploymentMap() {
    const now = Date.now();
    if (now - this._shadowCache.timestamp < 5000) return this._shadowCache.map;

    const nextMap = new Map();
    try {
      const plugin = BdApi.Plugins.isEnabled("ShadowSenses") && BdApi.Plugins.get("ShadowSenses");
      const instance = plugin?.instance || null;
      const live = instance?.deploymentManager?.getDeployments?.();
      let deployments;
      if (Array.isArray(live)) {
        deployments = live;
      } else if (!this._shadowCache.diskFallbackDone) {
        // NOTE: Accessing ShadowSenses internal data store directly creates tight coupling
        // to its persistence format. Prefer instance.deploymentManager.getDeployments() above.
        // This fallback only fires when ShadowSenses is enabled but its deploymentManager is
        // not yet initialized (e.g., loading race). Coupling is accepted here as a one-shot
        // cold-start aid; diskFallbackDone prevents repeated reads.
        deployments = instance?.getDeployments?.() ?? BdApi.Data.load("ShadowSenses", "deployments") ?? [];
        this._shadowCache.diskFallbackDone = true;
      } else {
        deployments = [];
      }

      for (const dep of deployments) {
        const userId = String(dep?.targetUserId || "");
        if (!userId) continue;
        nextMap.set(userId, dep);
      }
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed loading ShadowSenses deployments`, err);
    }

    this._shadowCache.timestamp = now;
    this._shadowCache.map = nextMap;
    return nextMap;
  }

  _isMarkedTarget(userId) {
    if (!userId) return false;
    return this._getShadowDeploymentMap().has(String(userId));
  }

  _isUserPresentInGuild(userId, guildId) {
    if (!userId || !guildId) return false;
    try {
      return !!this._GuildMemberStore?.getMember?.(guildId, userId);
    } catch (_) {
      return false;
    }
  }

  _canShowLimitedTargetIntel(userId, guildId) {
    if (!this._isMarkedTarget(userId)) return false;
    return this._isUserPresentInGuild(userId, guildId);
  }

  // ---- Context Menus ---------------------------------------------------

  _resetContextPatch(unpatchKey) {
    const unpatch = this?.[unpatchKey];
    if (typeof unpatch !== "function") return;
    try { unpatch(); } catch (_) {}
    this[unpatchKey] = null;
  }

  patchGuildContextMenu() {
    try {
      this._resetContextPatch("_guildContextUnpatch");
      this._guildContextUnpatch = BdApi.ContextMenu.patch("guild-context", (tree, props) => {
        try {
          const guild = props?.guild || this._GuildStore?.getGuild?.(props?.guildId);
          const guildId = guild?.id || props?.guildId;
          if (!guildId) return;

          const items = buildGuildReconActions(this, BdApi, guildId, guild);
          let groupedItem = null;
          try {
            groupedItem = BdApi.ContextMenu.buildItem({
              type: "submenu",
              label: "Shadow Recon",
              items,
            });
          } catch (_) {}

          appendContextItems(BdApi, tree, groupedItem ? [groupedItem] : items);
        } catch (err) {
          console.error(`[${PLUGIN_NAME}] guild-context patch error`, err);
        }
      });
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed to patch guild-context`, err);
    }
  }

  patchChannelContextMenu() {
    try {
      this._resetContextPatch("_channelContextUnpatch");
      this._channelContextUnpatch = BdApi.ContextMenu.patch("channel-context", (tree, props) => {
        try {
          const guildId =
            props?.channel?.guild_id ||
            props?.channel?.guildId ||
            props?.guildId ||
            this._getCurrentGuildId();
          if (!guildId) return;

          const guild = this._GuildStore?.getGuild?.(guildId);
          const marked = this.isGuildMarked(guildId);
          const items = [
            BdApi.ContextMenu.buildItem({
              type: "text",
              label: marked ? "Shadow Recon: Unrecon Current Guild" : "Shadow Recon: Recon Current Guild",
              action: () => {
                const nextMarked = this.toggleGuildMark(guildId);
                this._toast(
                  nextMarked
                    ? `Recon enabled for guild: ${guild?.name || guildId}`
                    : `Recon removed for guild: ${guild?.name || guildId}`,
                  nextMarked ? "success" : "info"
                );
              },
            }),
            BdApi.ContextMenu.buildItem({
              type: "text",
              label: "Shadow Recon: Open Current Guild Dossier",
              action: () => this.openGuildDossier(guildId),
            }),
          ];
          appendContextItems(BdApi, tree, items);
        } catch (err) {
          console.error(`[${PLUGIN_NAME}] channel-context patch error`, err);
        }
      });
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed to patch channel-context`, err);
    }
  }

  patchUserContextMenu() {
    try {
      this._resetContextPatch("_userContextUnpatch");
      this._userContextUnpatch = BdApi.ContextMenu.patch("user-context", (tree, props) => {
        try {
          const user = props?.user;
          if (!user?.id) return;

          const currentGuildId = this._SelectedGuildStore?.getGuildId?.();
          const items = buildUserContextReconItems(this, BdApi, user.id, currentGuildId);

          if (items.length > 0) appendContextItems(BdApi, tree, items);
        } catch (err) {
          console.error(`[${PLUGIN_NAME}] user-context patch error`, err);
        }
      });
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed to patch user-context`, err);
    }
  }

  unpatchContextMenus() {
    try { if (this._guildContextUnpatch) this._guildContextUnpatch(); } catch (_) {}
    try { if (this._channelContextUnpatch) this._channelContextUnpatch(); } catch (_) {}
    try { if (this._userContextUnpatch) this._userContextUnpatch(); } catch (_) {}
    this._guildContextUnpatch = null;
    this._channelContextUnpatch = null;
    this._userContextUnpatch = null;
  }

  // ---- Visual Refresh --------------------------------------------------

  startRefreshLoops() {
    this.stopRefreshLoops();
    // Event-driven refresh — replaces the prior 15s setInterval. Guild hints
    // change when guilds are joined/left/renamed/updated; subscribing to
    // GuildStore + SelectedGuildStore catches every such case and fires
    // immediately instead of waiting up to 15s for the next tick. The
    // existing MutationObserver handles DOM-only re-renders.
    try {
      const GuildStore = BdApi.Webpack.getStore?.("GuildStore");
      if (GuildStore && typeof GuildStore.addChangeListener === "function") {
        this._guildStoreListener = () => {
          if (this._stopped || document.hidden) return;
          this._queueVisualRefresh(0);
        };
        GuildStore.addChangeListener(this._guildStoreListener);
        this._guildStore = GuildStore;
      }
      const SelectedGuildStore = BdApi.Webpack.getStore?.("SelectedGuildStore");
      if (SelectedGuildStore && typeof SelectedGuildStore.addChangeListener === "function") {
        this._selGuildStoreListener = () => {
          if (this._stopped || document.hidden) return;
          this._queueVisualRefresh(0);
        };
        SelectedGuildStore.addChangeListener(this._selGuildStoreListener);
        this._selGuildStore = SelectedGuildStore;
      }
    } catch (_) {}
  }

  stopRefreshLoops() {
    if (this._guildStore && this._guildStoreListener) {
      try { this._guildStore.removeChangeListener(this._guildStoreListener); } catch (_) {}
      this._guildStore = null;
      this._guildStoreListener = null;
    }
    if (this._selGuildStore && this._selGuildStoreListener) {
      try { this._selGuildStore.removeChangeListener(this._selGuildStoreListener); } catch (_) {}
      this._selGuildStore = null;
      this._selGuildStoreListener = null;
    }
    if (this._visualRefreshTimeout) clearTimeout(this._visualRefreshTimeout);
    this._visualRefreshTimeout = null;
  }

  refreshAllVisuals() {
    // Re-inject widget if it was missed at startup (DOM wasn't ready)
    if (this.settings.showServerCounterWidget && !document.getElementById(WIDGET_ID)) {
      this.injectServerCounterWidget();
    } else {
      this.updateServerCounterWidget();
    }
    this.refreshGuildIconHints();
  }

  _queueVisualRefresh(delayMs = 120) {
    if (this._visualRefreshTimeout) return;
    this._visualRefreshTimeout = setTimeout(() => {
      this._visualRefreshTimeout = null;
      if (this._stopped || document.hidden) return;
      this.refreshAllVisuals();
    }, Math.max(0, delayMs));
  }

  setupObserver() {
    try {
      if (this._layoutBusUnsub) return;
      // PERF(P5-4): Use shared LayoutObserverBus instead of independent MutationObserver
      if (_PluginUtils?.LayoutObserverBus) {
        this._layoutBusUnsub = _PluginUtils.LayoutObserverBus.subscribe('ShadowRecon', () => {
          if (this._stopped || document.hidden) return;
          this._queueVisualRefresh(120);
        }, 500);
      } else if (!this._layoutBusWarned) {
        // Intentional degradation, not silent: without PluginUtils there is no
        // observer (and nothing to tear down) — visuals won't auto-refresh.
        this._layoutBusWarned = true;
        console.warn(`[${PLUGIN_NAME}] LayoutObserverBus unavailable (PluginUtils missing) — guild visual hints will not auto-refresh on layout changes`);
      }
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed observer setup`, err);
    }
  }

  teardownObserver() {
    // PERF(P5-4): Unsubscribe from shared LayoutObserverBus
    if (this._layoutBusUnsub) {
      this._layoutBusUnsub();
      this._layoutBusUnsub = null;
    }
  }

  // ---- Server Counter Widget ------------------------------------------

  injectServerCounterWidget() {
    return injectServerCounterWidget(this, WIDGET_ID);
  }

  updateServerCounterWidget(target = null) {
    return updateServerCounterWidget(this, WIDGET_ID, target);
  }

  removeServerCounterWidget() {
    return removeServerCounterWidget(this, WIDGET_ID);
  }

  _getGuildOnlineCount(guildId, guild = null) {
    return getGuildOnlineCount(this, guildId, guild);
  }

  // ---- Guild Hover Intel ----------------------------------------------

  refreshGuildIconHints() {
    return refreshGuildIconHints(this, SNOWFLAKE_RE);
  }

  clearGuildIconHints() {
    return clearGuildIconHints();
  }

  // ---- Guild Dossier ---------------------------------------------------

  openGuildDossier(guildId) {
    this.closeModal();
    const guild = this._GuildStore?.getGuild?.(guildId);
    if (!guild) {
      this._toast("Guild intel unavailable", "error");
      return;
    }

    const marked = this.isGuildMarked(guildId);
    const intel = this.getGuildIntel(guildId);
    const createdTs = this._safeTimestampFromSnowflake(guild.id);
    const joinedTs = guild?.joinedAt ? new Date(guild.joinedAt).getTime() : 0;
    const staffSnapshot = this._collectStaffSnapshot(guildId, 20);

    const overlay = this._createModal(`Shadow Recon - Guild Dossier`, `${guild.name}${marked ? " [Marked]" : " [Unmarked]"}`);
    const body = overlay.querySelector(".shadow-recon-modal-body");

    body.appendChild(this._buildKeyValueSection("Guild Baseline", [
      ["Guild ID", guild.id],
      ["Owner", intel.ownerName],
      ["Created", intel.createdAt],
      ["Joined", intel.joinedAt],
      ["Guild Age", this._formatElapsedSince(createdTs)],
      ["Your Tenure", this._formatElapsedSince(joinedTs)],
    ]));

    body.appendChild(this._buildKeyValueSection("Member Snapshot", [
      ["Total Members", this._formatNumber(intel.memberCount)],
      ["Online Members", this._formatNumber(intel.onlineCount)],
    ]));

    // Item 11 — Member Count History: record daily snapshot for marked
    // guilds, render delta if any samples exist.
    if (marked) this._recordManaPulse(guildId, intel.memberCount);
    const manaHistory = this._getManaPulseHistory(guildId);
    if (manaHistory.length > 1) {
      const sorted = [...manaHistory].sort((a, b) => a.t - b.t);
      const oldest = sorted[0];
      const newest = sorted[sorted.length - 1];
      const delta = (newest.count || 0) - (oldest.count || 0);
      const span = Math.max(1, Math.round((newest.t - oldest.t) / 86400000));
      let min = Infinity, max = -Infinity;
      for (const e of sorted) { if (e.count < min) min = e.count; if (e.count > max) max = e.count; }
      body.appendChild(this._buildKeyValueSection("Member Count History", [
        ["Tracking Window", `Last ${span} day${span === 1 ? "" : "s"} (${sorted.length} samples)`],
        ["Net Change", `${delta >= 0 ? "+" : ""}${this._formatNumber(delta)} members`],
        ["Range", `${this._formatNumber(min)} → ${this._formatNumber(max)}`],
      ]));
    }

    // Item 2 — Boost & Features.
    const features = intel.featuresList || [];
    body.appendChild(this._buildKeyValueSection("Boost & Features", [
      ["Boost Tier", `Tier ${intel.premiumTier || 0}`],
      ["Active Boosts", this._formatNumber(intel.premiumSubscriptionCount)],
      ["Server Features", features.length > 0 ? features.slice(0, 8).join(", ") : "None"],
      ...(features.length > 8 ? [["+more", `${features.length - 8} additional`]] : []),
      ...(intel.description ? [["Description", String(intel.description).slice(0, 120)]] : []),
    ]));

    // Item 3 — Custom Assets.
    body.appendChild(this._buildKeyValueSection("Custom Assets", [
      ["Custom Emoji", this._formatNumber(intel.emojiCount)],
      ["Custom Stickers", this._formatNumber(intel.stickerCount)],
      ["Soundboard Sounds", this._formatNumber(intel.soundboardCount)],
    ]));

    // Item 1 — Channel Breakdown.
    const terrain = this._surveyGuildChannels(guildId);
    body.appendChild(this._buildKeyValueSection("Channel Breakdown", [
      ["Total Channels", this._formatNumber(terrain.total)],
      ["Visible / Locked", `${this._formatNumber(terrain.visible)} / ${this._formatNumber(terrain.locked)}`],
      ["Text", this._formatNumber(terrain.byType.text)],
      ["Voice", this._formatNumber(terrain.byType.voice)],
      ["Forum", this._formatNumber(terrain.byType.forum)],
      ["Announcement", this._formatNumber(terrain.byType.announcement)],
      ["Stage", this._formatNumber(terrain.byType.stage)],
      ["Categories", this._formatNumber(terrain.byType.category)],
    ]));

    // Item 7 — Server Verification.
    const verifLabels = ["None", "Low", "Medium", "High", "Very High"];
    const nsfwLabels = ["Default", "Explicit", "Safe", "Age-Restricted"];
    const filterLabels = ["Disabled", "Members Without Roles", "All Members"];
    body.appendChild(this._buildKeyValueSection("Server Verification", [
      ["Vanity URL", intel.vanityURLCode ? `discord.gg/${intel.vanityURLCode}` : "None"],
      ["Verification Level", intel.verificationLevel != null ? (verifLabels[intel.verificationLevel] || `Level ${intel.verificationLevel}`) : "Unknown"],
      ["2FA Required for Mod", intel.mfaLevel === 1 ? "Yes" : intel.mfaLevel === 0 ? "No" : "Unknown"],
      ["Age Rating", intel.nsfwLevel != null ? (nsfwLabels[intel.nsfwLevel] || `Level ${intel.nsfwLevel}`) : "Unknown"],
      ["Content Filter", intel.explicitContentFilter != null ? (filterLabels[intel.explicitContentFilter] || `Level ${intel.explicitContentFilter}`) : "Unknown"],
    ]));

    // Item 10 — Your Channel Access (current user's perm map).
    const choke = this._getChokePoints(guildId);
    const chokeRows = [
      ["Channels You Can View", this._formatNumber(choke.viewable)],
      ["Channels You Can Post In", this._formatNumber(choke.sendable)],
      ["Voice Channels You Can Join", this._formatNumber(choke.connectable)],
    ];
    if (choke.blocked.length > 0) {
      chokeRows.push(["Locked to You", `${choke.blocked.length} channel${choke.blocked.length === 1 ? "" : "s"}`]);
      for (const b of choke.blocked.slice(0, 6)) {
        chokeRows.push([" - Locked", b.name]);
      }
    }
    body.appendChild(this._buildKeyValueSection("Your Channel Access", chokeRows));

    body.appendChild(this._buildPermissionsSection("Your Effective Authority", intel.currentUserPermissionSummary));

    // Item 4 — Staff Online History (per-dossier-open ring sample).
    if (marked) this._recordPatrolSample(guildId, staffSnapshot.onlineCount);
    const patrol = this._getPatrolStats(guildId);
    if (patrol && (patrol.last24h || patrol.last7d)) {
      const rows = [];
      if (patrol.last24h) rows.push(["Last 24h", `min ${patrol.last24h.min} / avg ${patrol.last24h.avg} / max ${patrol.last24h.max} (${patrol.last24h.samples} samples)`]);
      if (patrol.last7d) rows.push(["Last 7d", `min ${patrol.last7d.min} / avg ${patrol.last7d.avg} / max ${patrol.last7d.max} (${patrol.last7d.samples} samples)`]);
      rows.push(["Sample Count", this._formatNumber(patrol.totalSamples)]);
      body.appendChild(this._buildKeyValueSection("Staff Online History", rows));
    }

    body.appendChild(this._buildKeyValueSection("Staff Presence Snapshot", [
      ["Owner", intel.ownerName],
      ["Loaded Staff Online", this._formatNumber(staffSnapshot.onlineCount)],
      ["Loaded Staff Total", this._formatNumber(staffSnapshot.totalCount)],
      ["Scanned Members", `${this._formatNumber(staffSnapshot.scannedCount)}${staffSnapshot.truncated ? "+" : ""}`],
    ]));

    body.appendChild(this._buildKeyValueSection(
      "Staff Map (Loaded Cache)",
      staffSnapshot.rows.length > 0
        ? staffSnapshot.rows
        : [["Staff", "No elevated staff members in current cache"]]
    ));

    // Item 5 — Role Permission Tiers. Banding by which permission bits
    // each role holds: S=Admin, A=Manage Guild/Roles/Ban,
    // B=Kick/Manage Channels-Messages/Timeout, C=Mention Everyone /
    // Manage Threads-Events, D=any other role with at least one
    // elevated bit. Cosmetic roles (color/display only) and @everyone
    // are excluded — they have no permission bits.
    const bands = this._bandRolesByPower(guildId);
    const bandRows = [];
    for (const tier of ["S", "A", "B", "C", "D"]) {
      const list = bands[tier];
      if (!list || list.length === 0) continue;
      bandRows.push([`Tier ${tier}`, `${list.length} role${list.length === 1 ? "" : "s"}`]);
      for (const r of list.slice(0, 3)) {
        bandRows.push([` - ${r.name}`, r.memberCount > 0 ? `${this._formatNumber(r.memberCount)} member${r.memberCount === 1 ? "" : "s"}` : "—"]);
      }
    }
    if (bandRows.length === 0) {
      bandRows.push(["No mod roles", "Only the owner has elevated power here"]);
      bandRows.push(["What this means", "No roles in this server grant moderation perms (kick/ban/manage). Cosmetic roles and @everyone are excluded."]);
    }
    body.appendChild(this._buildKeyValueSection("Role Permission Tiers", bandRows));

    // Item 6 — Active Voice Channels (live snapshot of who's in VC).
    const camps = this._getVoiceEncampments(guildId);
    if (camps.length > 0) {
      const campRows = camps.slice(0, 8).map(c => [c.channelName, `${this._formatNumber(c.occupantCount)} member${c.occupantCount === 1 ? "" : "s"}`]);
      if (camps.length > 8) campRows.push(["+more", `${camps.length - 8} additional`]);
      body.appendChild(this._buildKeyValueSection("Active Voice Channels", campRows));
    }

    if (this.settings.loreLockedRecon && !marked) {
      body.appendChild(this._buildKeyValueSection("Briefing", [
        ["Mode", "Lore lock is enabled. Extended dossiers remain limited until this guild is marked."],
      ]));
    }
  }

  _collectLoadedGuildMembers(guildId, maxScan = 500) {
    const out = [];
    const seen = new Set();
    const sources = [
      this._GuildMemberStore?.getMembers?.(guildId),
      this._GuildMemberStore?.getMutableGuildMembers?.(guildId),
      this._GuildMemberStore?.members?.[guildId],
      this._GuildMemberStore?.guildMemberMap?.[guildId],
    ];

    for (const source of sources) {
      if (!source) continue;
      const values = Array.isArray(source)
        ? source
        : typeof source === "object"
          ? Object.values(source)
          : [];
      for (const member of values) {
        const userId = String(member?.userId || member?.user_id || member?.id || "").trim();
        if (!userId || seen.has(userId)) continue;
        seen.add(userId);
        out.push({ userId, member });
        if (out.length >= maxScan) return { members: out, truncated: true };
      }
    }

    return { members: out, truncated: false };
  }

  _collectStaffSnapshot(guildId, listLimit = 20) {
    const { members, truncated } = this._collectLoadedGuildMembers(guildId, 500);
    const rows = [];
    let totalCount = 0;
    let onlineCount = 0;

    for (const { userId, member } of members) {
      const staff = this.getStaffIntel(userId, guildId);
      if (!staff) continue;
      totalCount += 1;

      const statusRaw = String(this._PresenceStore?.getStatus?.(userId) || "offline").toLowerCase();
      const isOnline = statusRaw !== "offline" && statusRaw !== "invisible";
      if (isOnline) onlineCount += 1;

      if (rows.length < listLimit) {
        const user = this._UserStore?.getUser?.(userId);
        const displayName = user?.globalName || user?.username || member?.nick || userId;
        rows.push([`${displayName} (${staff.label})`, this._capitalize(statusRaw)]);
      }
    }

    return {
      rows,
      totalCount,
      onlineCount,
      scannedCount: members.length,
      truncated,
    };
  }

  _safeTimestampFromSnowflake(id) {
    const num = this._toBigInt(id);
    if (num === 0n) return 0;
    const discordEpoch = 1420070400000n;
    const ts = Number((num >> 22n) + discordEpoch);
    if (!Number.isFinite(ts) || ts <= 0) return 0;
    return ts;
  }

  _formatElapsedSince(timestampMs) {
    const ts = Number(timestampMs);
    if (!Number.isFinite(ts) || ts <= 0) return "Unknown";
    const delta = Date.now() - ts;
    if (!Number.isFinite(delta) || delta < 0) return "Unknown";
    const minutes = Math.floor(delta / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 24) return `${months}mo`;
    return `${Math.floor(months / 12)}y`;
  }

  _getGuildOwner(guild) {
    if (!guild) return null;
    return this._UserStore?.getUser?.(guild.ownerId) || null;
  }

  _getGuildOwnerName(owner, guild) {
    if (owner) return owner.globalName || owner.username || owner.id;
    return guild?.ownerId || "Unknown";
  }

  _getGuildJoinedAtLabel(guild) {
    return guild?.joinedAt ? new Date(guild.joinedAt).toLocaleString() : "Unknown";
  }

  _getGuildRoleCount(guild) {
    return guild?.roles ? Object.keys(guild.roles).length : 0;
  }

  _getGuildMemberCount(guildId, guild) {
    return this._GuildMemberCountStore?.getMemberCount?.(guildId)
      || guild?.memberCount
      || guild?.member_count
      || 0;
  }

  _getGuildFeaturesLabel(guild) {
    const features = guild?.features;
    if (!Array.isArray(features) || features.length === 0) return "None";
    return features.slice(0, 8).join(", ");
  }

  _getGuildPreferredLocale(guild) {
    return guild?.preferredLocale || guild?.preferred_locale || "";
  }

  getGuildIntel(guildId) {
    const guild = this._GuildStore?.getGuild?.(guildId);
    const owner = this._getGuildOwner(guild);

    const createdAt = this._safeDateFromSnowflake(guild?.id);
    const joinedAt = this._getGuildJoinedAtLabel(guild);

    const channelCount = this._countGuildChannels(guildId);
    const roleCount = this._getGuildRoleCount(guild);

    const memberCount = this._getGuildMemberCount(guildId, guild);
    const onlineCount = this._getGuildOnlineCount(guildId, guild);

    const permissionSummary = this.getCurrentUserPermissionSummary(guildId);

    return {
      ownerName: this._getGuildOwnerName(owner, guild),
      createdAt,
      joinedAt,
      premiumTier: guild?.premiumTier || 0,
      premiumSubscriptionCount: guild?.premiumSubscriptionCount || 0,
      roleCount,
      channelCount,
      featuresLabel: this._getGuildFeaturesLabel(guild),
      featuresList: Array.isArray(guild?.features) ? guild.features : [],
      memberCount,
      onlineCount,
      description: guild?.description || "",
      emojiCount: this._countGuildEmojis(guildId, guild),
      stickerCount: this._countGuildStickers(guildId, guild),
      soundboardCount: this._countGuildSoundboard(guildId),
      preferredLocale: this._getGuildPreferredLocale(guild),
      // Sigil Provenance fields (Tier B item 7) — read-only metadata
      // already on the `guild` object, just never previously surfaced.
      vanityURLCode: guild?.vanityURLCode || guild?.vanity_url_code || null,
      verificationLevel: typeof guild?.verificationLevel === "number" ? guild.verificationLevel : null,
      mfaLevel: typeof guild?.mfaLevel === "number" ? guild.mfaLevel : null,
      nsfwLevel: typeof guild?.nsfwLevel === "number" ? guild.nsfwLevel : null,
      explicitContentFilter: typeof guild?.explicitContentFilter === "number" ? guild.explicitContentFilter : null,
      currentUserPermissionSummary: permissionSummary,
    };
  }

  // ─── Tier A (item 1): Terrain Survey ────────────────────────────────
  // Channel topology breakdown by type + locked-vs-visible split (using
  // the current user's VIEW_CHANNEL permission). Replaces the single
  // integer count from _countGuildChannels with a structured survey.
  _surveyGuildChannels(guildId) {
    const survey = {
      total: 0,
      visible: 0,
      locked: 0,
      byType: { text: 0, voice: 0, forum: 0, announcement: 0, stage: 0, category: 0, thread: 0, media: 0, other: 0 },
    };
    try {
      const grouped = this._GuildChannelStore?.getChannels?.(guildId);
      if (!grouped || typeof grouped !== "object") return survey;

      const VIEW_CHANNEL_BIT = (this._PermissionsBits?.VIEW_CHANNEL) || 0n;

      for (const bucket of Object.values(grouped)) {
        if (!Array.isArray(bucket)) continue;
        for (const entry of bucket) {
          const channel = entry?.channel;
          if (!channel) continue;
          survey.total += 1;

          const t = Number(channel.type);
          if (t === 0) survey.byType.text += 1;
          else if (t === 2) survey.byType.voice += 1;
          else if (t === 4) survey.byType.category += 1;
          else if (t === 5) survey.byType.announcement += 1;
          else if (t === 13) survey.byType.stage += 1;
          else if (t === 15) survey.byType.forum += 1;
          else if (t === 16) survey.byType.media += 1;
          else if (t === 10 || t === 11 || t === 12) survey.byType.thread += 1;
          else survey.byType.other += 1;

          // Locked = current user lacks VIEW_CHANNEL.
          let visible = true;
          try {
            if (this._PermissionStore?.can && VIEW_CHANNEL_BIT) {
              visible = !!this._PermissionStore.can(VIEW_CHANNEL_BIT, channel);
            }
          } catch (_) {}
          if (visible) survey.visible += 1;
          else survey.locked += 1;
        }
      }
    } catch (_) {}
    return survey;
  }

  // ─── Tier B (item 5): Threat Tier Roster ────────────────────────────
  _bandRolesByPower(guildId) {
    return bandRolesByPower(this, guildId);
  }

  // ─── Tier B (item 6): Voice Encampments ──────────────────────────────
  // List currently-occupied voice channels in this guild with occupant
  // counts. Pure live read from VoiceStateStore + ChannelStore — no
  // persistence, no subscription.
  _getVoiceEncampments(guildId) {
    const encampments = [];
    try {
      const states = this._VoiceStateStore?.getVoiceStatesForGuild?.(guildId)
        || this._VoiceStateStore?.getAllVoiceStates?.()?.[guildId];
      if (!states || typeof states !== "object") return encampments;

      const occupantsByChannel = new Map();
      for (const state of Object.values(states)) {
        const channelId = state?.channelId;
        if (!channelId) continue;
        const arr = occupantsByChannel.get(channelId) || [];
        arr.push(state);
        occupantsByChannel.set(channelId, arr);
      }

      for (const [channelId, occupants] of occupantsByChannel) {
        const channel = this._ChannelStore?.getChannel?.(channelId);
        encampments.push({
          channelId,
          channelName: channel?.name || channelId,
          occupantCount: occupants.length,
        });
      }
      encampments.sort((a, b) => b.occupantCount - a.occupantCount);
    } catch (_) {}
    return encampments;
  }

  // ─── Tier B (item 4): Patrol Patterns ────────────────────────────────
  // Sample staff-online count per dossier-open into a 1-week hourly ring.
  _recordPatrolSample(guildId, onlineStaffCount) {
    if (!guildId) return;
    ringPush(
      `intel:patrol:${guildId}`,
      { t: Date.now(), online: Number(onlineStaffCount) || 0 },
      PATROL_RING_CAP,
      bucketHour
    );
  }

  _getPatrolStats(guildId) {
    const ring = ringRead(`intel:patrol:${guildId}`);
    if (ring.length === 0) return null;
    const now = Date.now();
    const last24h = ring.filter(e => (now - e.t) <= 86400000);
    const last7d = ring.filter(e => (now - e.t) <= 604800000);
    const stat = (arr) => {
      if (arr.length === 0) return null;
      let min = Infinity, max = -Infinity, sum = 0;
      for (const e of arr) { const v = Number(e.online) || 0; if (v < min) min = v; if (v > max) max = v; sum += v; }
      return { min, max, avg: Math.round(sum / arr.length), samples: arr.length };
    };
    return { last24h: stat(last24h), last7d: stat(last7d), totalSamples: ring.length };
  }

  // ─── Tier C (item 10): Choke Points ──────────────────────────────────
  // Per-channel permission map for the current user, cached 5 min.
  _getChokePoints(guildId) {
    const cached = this._chokePointCache.get(guildId);
    if (cached && (Date.now() - cached.ts) < CHOKE_POINT_CACHE_TTL) return cached.data;

    const data = { viewable: 0, sendable: 0, connectable: 0, blocked: [] };
    try {
      const grouped = this._GuildChannelStore?.getChannels?.(guildId);
      if (!grouped || typeof grouped !== "object") return data;

      const VIEW = (this._PermissionsBits?.VIEW_CHANNEL) || 0n;
      const SEND = (this._PermissionsBits?.SEND_MESSAGES) || 0n;
      const CONN = (this._PermissionsBits?.CONNECT) || 0n;

      for (const bucket of Object.values(grouped)) {
        if (!Array.isArray(bucket)) continue;
        for (const entry of bucket) {
          const channel = entry?.channel;
          if (!channel) continue;
          // Skip categories — they're organizational, not user-facing surfaces.
          if (Number(channel.type) === 4) continue;

          const can = this._PermissionStore?.can;
          const canView = can && VIEW ? !!can(VIEW, channel) : true;
          const canSend = can && SEND ? !!can(SEND, channel) : true;
          const canConn = can && CONN ? !!can(CONN, channel) : true;

          if (canView) data.viewable += 1;
          if (canSend) data.sendable += 1;
          if (canConn && (Number(channel.type) === 2 || Number(channel.type) === 13)) data.connectable += 1;

          if (!canView && data.blocked.length < 12) {
            data.blocked.push({ name: channel.name || channel.id, type: Number(channel.type) });
          }
        }
      }
    } catch (_) {}

    this._chokePointCache.set(guildId, { ts: Date.now(), data });
    return data;
  }

  // ─── Tier C (item 11): Mana Pulse ────────────────────────────────────
  // Daily member-count snapshot, 90 days cap.
  _recordManaPulse(guildId, memberCount) {
    if (!guildId) return;
    ringPush(
      `intel:mana:${guildId}`,
      { t: Date.now(), count: Number(memberCount) || 0 },
      MANA_RING_CAP,
      bucketDay
    );
  }

  _getManaPulseHistory(guildId) {
    return ringRead(`intel:mana:${guildId}`);
  }

  // ─── Tier C (items 8/9): Skirmish Log + Aura Reading dispatcher ─────
  // Single PRESENCE_UPDATES handler that branches on which settings are
  // on. Filtered by `_isMarkedTarget` AND `_isUserPresentInGuild` so we
  // only pay the cost for users we care about.
  refreshDispatcherSubs() {
    // Drop any existing subs first so toggle changes apply atomically.
    dispatcherUnsubscribeAll(this);
    if (this._stopped) return;

    const wantSkirmish = !!this.settings.enableSkirmishLog;
    const wantAura = !!this.settings.enableAuraReading;
    if (!wantSkirmish && !wantAura) return;

    // PRESENCE_UPDATES — both features need this.
    // Route through the shared presence-bus (one Flux subscription for the suite).
    // Clean up any prior unsub before re-registering (handles toggle/refresh).
    if (this._presenceUnsub) { this._presenceUnsub(); this._presenceUnsub = null; }
    const presenceHandler = (action) => {
      try { this._onPresenceUpdate(action); } catch (_) {}
    };
    this._presenceUnsub = onPresence("PRESENCE_UPDATES", presenceHandler);

    if (wantSkirmish) {
      const voiceHandler = (action) => {
        try { this._onVoiceStateUpdate(action); } catch (_) {}
      };
      dispatcherSubscribe(this, "VOICE_STATE_UPDATES", voiceHandler);
      // CHANNEL_SELECT — this fires for the CURRENT user's nav, used to
      // record observation timestamps when the user navigates into a
      // channel where a marked target is present. Lightweight.
      const channelHandler = (action) => {
        try { this._onChannelSelect(action); } catch (_) {}
      };
      dispatcherSubscribe(this, "CHANNEL_SELECT", channelHandler);
    }
  }

  // Discord wraps PRESENCE_UPDATES around a `updates` array of records.
  _onPresenceUpdate(action) {
    // PERF (2026-07-13): PRESENCE_UPDATES is one of the highest-frequency
    // gateway events (every user in every mutual guild). Two hoists:
    //   1. Resolve the deployment map ONCE per dispatch instead of once per
    //      record via _isMarkedTarget (each call re-ran a Date.now() TTL
    //      check + Map lookup, and a batched dispatch carries many records).
    //   2. Zero deployed targets — the common case for anyone not actively
    //      running recon — now costs ONE Map.size check for the whole
    //      dispatch instead of a per-record String() + lookup.
    const deploymentMap = this._getShadowDeploymentMap();
    if (deploymentMap.size === 0) return;

    // Hoist settings reads out of the per-record loop as well.
    const wantSkirmish = this.settings.enableSkirmishLog;
    const wantAura = this.settings.enableAuraReading;
    if (!wantSkirmish && !wantAura) return;

    const updates = Array.isArray(action?.updates) ? action.updates : [action];
    for (const upd of updates) {
      const rawId = upd?.user?.id || upd?.userId;
      if (!rawId) continue;
      const userId = String(rawId);
      if (!deploymentMap.has(userId)) continue;

      const guildId = upd?.guildId || upd?.guild_id;
      // For skirmish: require user present in a marked guild.
      if (wantSkirmish && guildId && this.isGuildMarked(guildId) && this._isUserPresentInGuild(userId, guildId)) {
        ringPush(
          `intel:skirmish:${userId}`,
          { t: Date.now(), type: "presence", status: String(upd?.status || "").toLowerCase(), guildId: String(guildId) },
          SKIRMISH_RING_CAP
        );
      }

      // For aura: capture custom-status + activities for ANY marked target
      // (no guild filter — aura is user-level info, not guild-scoped).
      if (wantAura) {
        const activities = Array.isArray(upd?.activities) ? upd.activities : [];
        const customStatus = activities.find(a => a?.type === 4) || null;
        const games = activities.filter(a => a?.type !== 4).map(a => ({
          name: String(a?.name || "").slice(0, 80),
          type: Number(a?.type) || 0,
          details: a?.details ? String(a.details).slice(0, 100) : undefined,
          state: a?.state ? String(a.state).slice(0, 100) : undefined,
        }));
        ringPush(
          `intel:aura:${userId}`,
          {
            t: Date.now(),
            customStatus: customStatus ? { state: String(customStatus.state || "").slice(0, 100), emoji: customStatus.emoji?.name || null } : null,
            activities: games,
          },
          AURA_RING_CAP
        );
      }
    }
  }

  _onVoiceStateUpdate(action) {
    const states = Array.isArray(action?.voiceStates) ? action.voiceStates : [];
    if (states.length === 0) return;
    // PERF (2026-07-13): same hoist as _onPresenceUpdate — one map resolve
    // per dispatch, and zero-deployment is a single size check.
    const deploymentMap = this._getShadowDeploymentMap();
    if (deploymentMap.size === 0) return;
    for (const s of states) {
      const rawId = s?.userId;
      const guildId = s?.guildId;
      if (!rawId || !guildId) continue;
      const userId = String(rawId);
      if (!deploymentMap.has(userId)) continue;
      if (!this.isGuildMarked(guildId)) continue;
      ringPush(
        `intel:skirmish:${userId}`,
        { t: Date.now(), type: "voice", channelId: s?.channelId || null, guildId: String(guildId) },
        SKIRMISH_RING_CAP
      );
    }
  }

  _onChannelSelect(action) {
    const guildId = action?.guildId;
    if (!guildId || !this.isGuildMarked(guildId)) return;
    const channelId = action?.channelId;
    if (!channelId) return;
    // Early-exit: skip per-target getMember scans when no targets are
    // deployed — avoids O(N) GuildMemberStore lookups on every navigation.
    const deploymentMap = this._getShadowDeploymentMap();
    if (deploymentMap.size === 0) return;
    // Record any marked target that's currently in this guild — the user
    // navigated into its channel and might observe them.
    const now = Date.now();
    for (const userId of deploymentMap.keys()) {
      if (!this._isUserPresentInGuild(userId, guildId)) continue;
      ringPush(
        `intel:skirmish:${userId}`,
        { t: now, type: "channel-select", channelId: String(channelId), guildId: String(guildId) },
        SKIRMISH_RING_CAP
      );
    }
  }

  _getSkirmishLog(userId) {
    return ringRead(`intel:skirmish:${userId}`);
  }

  _getAuraTrail(userId) {
    return ringRead(`intel:aura:${userId}`);
  }

  // ---- Target Intel Modal ---------------------------------------------

  async openUserIntelModal(userId, guildId) {
    this.closeModal();
    if (!this._canShowLimitedTargetIntel(userId, guildId)) {
      this._toast("Target intel is limited to monitored users present in this guild", "warning");
      return;
    }

    const user = this._UserStore?.getUser?.(userId);
    const deployment = this._getShadowDeploymentMap().get(String(userId));

    const overlay = this._createModal(
      "Shadow Recon - Target Intel",
      `${user?.globalName || user?.username || userId}${deployment?.shadowName ? ` | reported by ${deployment.shadowName}` : ""}`
    );

    const body = overlay.querySelector(".shadow-recon-modal-body");
    const platformData = this.getPlatformIntel(userId);
    const staff = this.getStaffIntel(userId, guildId);

    body.appendChild(this._buildKeyValueSection("Presence Snapshot", platformData.length
      ? platformData.map(p => [p.platform, p.status])
      : [["Intel", "No platform statuses reported"]]
    ));

    body.appendChild(this._buildKeyValueSection(
      "Guild Role Snapshot",
      staff
        ? [
            ["Rank", staff.label],
            ["Capabilities", staff.capabilities.join(", ") || "None"],
          ]
        : [["Rank", "No elevated staff permissions detected"]]
    ));

    // Item 8 — Activity Log (last 24h trail of presence/voice/channel transitions).
    if (this.settings.enableSkirmishLog) {
      const log = this._getSkirmishLog(userId);
      const cutoff = Date.now() - 86400000;
      const recent = log.filter(e => e.t >= cutoff).reverse(); // newest first
      const rows = [];
      for (const e of recent.slice(0, 12)) {
        const when = this._formatElapsedSince(e.t) + " ago";
        let what = "—";
        if (e.type === "presence") what = `Status → ${this._capitalize(e.status || "unknown")}`;
        else if (e.type === "voice") what = e.channelId ? `Joined VC ${this._channelDisplayName(e.channelId)}` : "Left voice";
        else if (e.type === "channel-select") what = `Seen in ${this._channelDisplayName(e.channelId)}`;
        rows.push([when, what]);
      }
      if (rows.length === 0) rows.push(["Activity Log", "No tracked activity in the last 24h"]);
      body.appendChild(this._buildKeyValueSection("Activity Log (24h)", rows));
    }

    // Item 9 — Status & Activity History (custom-status + rich-presence trail).
    if (this.settings.enableAuraReading) {
      const trail = this._getAuraTrail(userId);
      const recent = [...trail].reverse().slice(0, 8);
      const rows = [];
      for (const e of recent) {
        const when = this._formatElapsedSince(e.t) + " ago";
        const cs = e.customStatus?.state ? `"${e.customStatus.state}"` : null;
        const act = (e.activities || []).map(a => a.name).filter(Boolean).slice(0, 3).join(", ");
        const parts = [];
        if (cs) parts.push(cs);
        if (act) parts.push(act);
        rows.push([when, parts.length > 0 ? parts.join(" | ") : "—"]);
      }
      if (rows.length === 0) rows.push(["Status History", "No status / activity changes captured yet"]);
      body.appendChild(this._buildKeyValueSection("Status & Activity History", rows));
    }
  }

  // Helper for skirmish/aura rendering — resolve a channel ID to a
  // human-readable name without spamming Discord lookups.
  _channelDisplayName(channelId) {
    if (!channelId) return "—";
    try {
      const ch = this._ChannelStore?.getChannel?.(channelId);
      return ch?.name ? `#${ch.name}` : String(channelId);
    } catch (_) {
      return String(channelId);
    }
  }

  getPlatformIntel(userId) {
    return getPlatformIntel(this, userId, {
      platformLabels: PLATFORM_LABELS,
      statusLabels: STATUS_LABELS,
    });
  }

  // ---- Staff / Permissions --------------------------------------------

  isDetailedStaffIntelUnlocked(guildId) {
    return isDetailedStaffIntelUnlocked(this, guildId);
  }

  openStaffIntelModal(userId, guildId) {
    if (!guildId || !userId) {
      this._toast("Guild context required for staff dossier", "warning");
      return;
    }

    const guild = this._GuildStore?.getGuild?.(guildId);
    const user = this._UserStore?.getUser?.(userId);
    const staff = this.getStaffIntel(userId, guildId);
    if (!guild || !staff) {
      this._toast("No staff dossier available for this user", "warning");
      return;
    }

    const overlay = this._createModal(
      "Shadow Recon - Staff Dossier",
      `${user?.globalName || user?.username || userId} @ ${guild.name}`
    );
    const body = overlay.querySelector(".shadow-recon-modal-body");

    body.appendChild(this._buildKeyValueSection("Staff Profile", [
      ["Rank", staff.label],
      ["Guild", guild.name],
      ["User ID", String(userId)],
    ]));

    const unlocked = this.isDetailedStaffIntelUnlocked(guildId);
    if (!unlocked) {
      const notice = document.createElement("div");
      notice.className = "shadow-recon-notice";
      notice.textContent = "Detailed staff capability intel is lore-locked. Recon this guild to unlock full staff dossier.";

      const markBtn = document.createElement("button");
      markBtn.className = "shadow-recon-button";
      markBtn.textContent = "Recon Guild and Reload Dossier";
      markBtn.addEventListener("click", () => {
        this.toggleGuildMark(guildId);
        this.closeModal();
        this.openStaffIntelModal(userId, guildId);
      });

      body.appendChild(notice);
      body.appendChild(markBtn);
      return;
    }

    body.appendChild(this._buildKeyValueSection("Capabilities", [
      ["Capabilities", staff.capabilities.join(", ") || "None"],
    ]));

    body.appendChild(this._buildPermissionsSection(
      "Permission Breakdown",
      this.getPermissionSummaryForMember(guildId, userId)
    ));
  }

  getCurrentUserPermissionSummary(guildId) {
    return getCurrentUserPermissionSummary(this, guildId, {
      importantPermissions: IMPORTANT_PERMISSIONS,
      staffPermissionKeys: STAFF_PERMISSION_KEYS,
      humanizedPermCache: _humanizedPermCache,
    });
  }

  getStaffIntel(userId, guildId) {
    return getStaffIntel(this, userId, guildId, {
      importantPermissions: IMPORTANT_PERMISSIONS,
      staffPermissionKeys: STAFF_PERMISSION_KEYS,
      humanizedPermCache: _humanizedPermCache,
    });
  }

  getPermissionSummaryForMember(guildId, userId) {
    return getPermissionSummaryForMember(this, guildId, userId, {
      importantPermissions: IMPORTANT_PERMISSIONS,
      staffPermissionKeys: STAFF_PERMISSION_KEYS,
      humanizedPermCache: _humanizedPermCache,
    });
  }

  // ---- Modal Builders --------------------------------------------------

  _createModal(title, subtitle = "") {
    return createModal(this, MODAL_ID, title, subtitle);
  }

  closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
    this._modalEl = null;
  }

  _buildKeyValueSection(title, rows) {
    return buildKeyValueSection(title, rows);
  }

  _buildPermissionsSection(title, summary) {
    return buildPermissionsSection(title, summary);
  }

  // ---- Counts / Stores -------------------------------------------------

  getServerCount() {
    try {
      if (typeof this._GuildStore?.getGuildCount === "function") return this._GuildStore.getGuildCount();
      const guilds = this._GuildStore?.getGuilds?.();
      if (guilds && typeof guilds === "object") return Object.keys(guilds).length;
      const flattened = this._sortedGuildStore?.getFlattenedGuildIds?.();
      if (Array.isArray(flattened)) return flattened.length;
    } catch (_) {}
    return 0;
  }

  _countGuildChannels(guildId) {
    try {
      const grouped = this._GuildChannelStore?.getChannels?.(guildId);
      if (!grouped || typeof grouped !== "object") return 0;
      let count = 0;
      for (const bucket of Object.values(grouped)) {
        if (!Array.isArray(bucket)) continue;
        for (const entry of bucket) {
          if (entry?.channel) count++;
        }
      }
      return count;
    } catch (_) {
      return 0;
    }
  }

  _countGuildEmojis(guildId, guild) {
    try {
      const guildEmojis = this._EmojiStore?.getGuilds?.()?.[guildId];
      if (Array.isArray(guildEmojis)) return guildEmojis.length;
    } catch (_) {}
    return Array.isArray(guild?.emojis) ? guild.emojis.length : 0;
  }

  _countGuildStickers(guildId, guild) {
    try {
      const stickers = this._StickersStore?.getGuildStickers?.(guildId);
      if (Array.isArray(stickers)) return stickers.length;
    } catch (_) {}
    return Array.isArray(guild?.stickers) ? guild.stickers.length : 0;
  }

  _countGuildSoundboard(guildId) {
    try {
      const sounds = this._SoundboardStore?.getGuildSounds?.(guildId);
      if (Array.isArray(sounds)) return sounds.length;
    } catch (_) {}
    return 0;
  }

  // ---- Utility ---------------------------------------------------------

  _safeDateFromSnowflake(id) {
    const num = this._toBigInt(id);
    if (num === 0n) return "Unknown";
    const discordEpoch = 1420070400000n;
    const ts = Number((num >> 22n) + discordEpoch);
    if (!Number.isFinite(ts) || ts <= 0) return "Unknown";
    return new Date(ts).toLocaleString();
  }

  _toBigInt(value) {
    return toBigInt(value);
  }

  _formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return Math.trunc(n).toLocaleString();
  }

  _capitalize(text) {
    const str = String(text || "");
    if (!str) return "Unknown";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ---- Settings Panel --------------------------------------------------

  getSettingsPanel() {
    return buildSettingsPanel(BdApi, this);
  }

  // ---- CSS -------------------------------------------------------------

  injectCSS() {
    BdApi.DOM.addStyle(STYLE_ID, getShadowReconCss(WIDGET_ID, MODAL_ID));
  }
};
