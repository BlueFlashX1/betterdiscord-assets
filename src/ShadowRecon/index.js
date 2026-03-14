const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");

const { createToast } = require("../shared/toast");
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
};

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
  buildGrid,
} = require("./modal-utils");
const {
  getPlatformIntel,
  getConnectionsIntel,
} = require("./target-intel");
const {
  getCurrentUserPermissionSummary,
  getPermissionSummaryForMember,
  getStaffIntel,
  isDetailedStaffIntelUnlocked,
  toBigInt,
} = require("./permissions");
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
    this._clearRuntimeCaches();
    this.closeModal();
    BdApi.DOM.removeStyle(STYLE_ID);
    if (!silent) this._toast(`${PLUGIN_NAME} - Recon dismissed`, "info");
  }

  // ---- Data / Settings -------------------------------------------------

  loadSettings() {
    try {
      const saved = BdApi.Data.load(PLUGIN_NAME, "settings");
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...(saved && typeof saved === "object" ? saved : {}),
      };
    } catch (err) {
      this.settings = { ...DEFAULT_SETTINGS };
      console.error(`[${PLUGIN_NAME}] Failed loading settings`, err);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save(PLUGIN_NAME, "settings", this.settings);
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed saving settings`, err);
    }
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
    try {
      BdApi.Data.save(PLUGIN_NAME, "markedGuildIds", Array.from(this._markedGuildIds));
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed saving marked guilds`, err);
    }
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
    this._GuildMemberCountStore = Webpack.getStore("GuildMemberCountStore");
    this._SessionsStore = Webpack.getStore("SessionsStore");

    this._PermissionStore = Webpack.getStore("PermissionStore");

    this._UserProfileStore = Webpack.getStore("UserProfileStore");

    this._UserProfileActions =
      Webpack.getByKeys("fetchProfile", "fetchUserProfile") ||
      Webpack.getModule(m => m && (typeof m.fetchProfile === "function" || typeof m.fetchUserProfile === "function"));

    this._PermissionsBits =
      Webpack.getModule(m => m && typeof m === "object" && m.ADMINISTRATOR && m.VIEW_CHANNEL, { searchExports: true }) ||
      Webpack.getByKeys("ADMINISTRATOR", "VIEW_CHANNEL");

    this._sortedGuildStore = Webpack.getStore("SortedGuildStore");

    // Cache stores used in per-guild counting methods (avoid repeated getStore calls)
    this._EmojiStore = Webpack.getStore("EmojiStore");
    this._StickersStore = Webpack.getStore("StickersStore");
    this._SoundboardStore = Webpack.getStore("SoundboardStore");
  }

  // ---- ShadowSenses Integration ---------------------------------------

  _getShadowDeploymentMap() {
    const now = Date.now();
    if (now - this._shadowCache.timestamp < 5000) return this._shadowCache.map;

    const nextMap = new Map();
    try {
      const plugin = BdApi.Plugins.get("ShadowSenses");
      const instance = plugin?.instance || plugin;
      const live = instance?.deploymentManager?.getDeployments?.();
      let deployments;
      if (Array.isArray(live)) {
        deployments = live;
      } else if (!this._shadowCache.diskFallbackDone) {
        deployments = BdApi.Data.load("ShadowSenses", "deployments") || [];
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
    // PERF: 15s refresh (was 4s — guild hints rarely change, MutationObserver handles DOM)
    this._refreshInterval = setInterval(() => {
      if (this._stopped || document.hidden) return;
      this._queueVisualRefresh(0);
    }, 15000);
  }

  stopRefreshLoops() {
    if (this._refreshInterval) clearInterval(this._refreshInterval);
    this._refreshInterval = null;
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

    body.appendChild(this._buildPermissionsSection("Your Effective Authority", intel.currentUserPermissionSummary));

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

    if (this.settings.loreLockedRecon && !marked) {
      body.appendChild(this._buildKeyValueSection("Recon Note", [
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
      memberCount,
      onlineCount,
      description: guild?.description || "",
      emojiCount: this._countGuildEmojis(guildId, guild),
      stickerCount: this._countGuildStickers(guildId, guild),
      soundboardCount: this._countGuildSoundboard(guildId),
      preferredLocale: this._getGuildPreferredLocale(guild),
      currentUserPermissionSummary: permissionSummary,
    };
  }

  // ---- Target Intel Modal ---------------------------------------------

  async openUserIntelModal(userId, guildId) {
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
  }

  getPlatformIntel(userId) {
    return getPlatformIntel(this, userId, {
      platformLabels: PLATFORM_LABELS,
      statusLabels: STATUS_LABELS,
    });
  }

  async getConnectionsIntel(userId, guildId) {
    return getConnectionsIntel(this, userId, guildId, PLUGIN_NAME);
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

  _buildGrid(rows) {
    return buildGrid(rows);
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
