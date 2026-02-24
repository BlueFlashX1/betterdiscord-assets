/**
 * @name ShadowRecon
 * @description Lore-accurate recon suite: mark guilds for dossiers, track staff authority, and inspect marked targets from ShadowSenses (platform + connections).
 * @version 1.0.5
 * @author matthewthompson
 */

const PLUGIN_NAME = "ShadowRecon";
const PLUGIN_VERSION = "1.0.5";
const STYLE_ID = "shadow-recon-css";
const WIDGET_ID = "shadow-recon-widget";
const MEMBER_BANNER_ID = "shadow-recon-member-banner";
const MODAL_ID = "shadow-recon-modal-root";

const DEFAULT_SETTINGS = {
  loreLockedRecon: true,
  showServerCounterWidget: true,
  showMemberCounterBanner: false, // deprecated: member-list banner removed by request
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

let _ReactUtils;
try { _ReactUtils = require("./BetterDiscordReactUtils.js"); } catch (_) { _ReactUtils = null; }

module.exports = class ShadowRecon {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._markedGuildIds = new Set();
    this._stopped = true;

    this._guildContextUnpatch = null;
    this._channelContextUnpatch = null;
    this._userContextUnpatch = null;

    this._domObserver = null;
    this._refreshInterval = null;

    this._modalEl = null;

    this._shadowCache = { timestamp: 0, map: new Map() };
    this._permissionBitsCache = null;
  }

  start() {
    try {
      this._stopped = false;
      this.loadSettings();
      this.loadMarkedGuilds();
      this.initWebpack();
      this.injectCSS();

      this.patchGuildContextMenu();
      this.patchChannelContextMenu();
      this.patchUserContextMenu();

      this.injectServerCounterWidget();
      this.removeMemberCounterBanner();
      this.refreshGuildIconHints();
      this.startRefreshLoops();
      this.setupObserver();

      BdApi.UI.showToast(`${PLUGIN_NAME} v${PLUGIN_VERSION} - Recon online`, { type: "info" });
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed to start`, err);
      BdApi.UI.showToast(`${PLUGIN_NAME} failed to start: ${err.message}`, { type: "error" });
    }
  }

  stop() {
    this._stopped = true;
    this.unpatchContextMenus();
    this.stopRefreshLoops();
    this.teardownObserver();
    this.removeServerCounterWidget();
    this.removeMemberCounterBanner();
    this.clearGuildIconHints();
    this.closeModal();
    BdApi.DOM.removeStyle(STYLE_ID);
    BdApi.UI.showToast(`${PLUGIN_NAME} - Recon dismissed`, { type: "info" });
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
      BdApi.UI.showToast("Select a guild first", { type: "warning" });
      return null;
    }
    const marked = this.toggleGuildMark(guildId);
    const guild = this._GuildStore?.getGuild?.(guildId);
    BdApi.UI.showToast(
      marked
        ? `Recon enabled for guild: ${guild?.name || guildId}`
        : `Recon removed for guild: ${guild?.name || guildId}`,
      { type: marked ? "success" : "info" }
    );
    return marked;
  }

  // ---- Webpack ---------------------------------------------------------

  initWebpack() {
    const { Webpack } = BdApi;

    this._Dispatcher =
      Webpack.Stores?.UserStore?._dispatcher ||
      Webpack.getModule(m => m && typeof m.dispatch === "function" && typeof m.subscribe === "function") ||
      null;

    this._GuildStore = Webpack.getStore("GuildStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._SelectedChannelStore = Webpack.getStore("SelectedChannelStore");
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._GuildChannelStore = Webpack.getStore("GuildChannelStore");

    this._UserStore = Webpack.getStore("UserStore");
    this._PresenceStore = Webpack.getStore("PresenceStore") || Webpack.getModule(m => m && typeof m.getStatus === "function");
    this._GuildMemberStore = Webpack.getStore("GuildMemberStore");
    this._GuildMemberCountStore = Webpack.getStore("GuildMemberCountStore");
    this._SessionsStore = Webpack.getStore("SessionsStore");

    this._PermissionStore = Webpack.getStore("PermissionStore") || Webpack.getModule(m => m && typeof m.getGuildPermissions === "function");

    this._UserProfileStore =
      Webpack.getStore("UserProfileStore") ||
      Webpack.getModule(m => m && (typeof m.getUserProfile === "function" || typeof m.getProfile === "function"));

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

  _getCreateRoot() {
    if (_ReactUtils?.getCreateRoot) return _ReactUtils.getCreateRoot();
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  }

  // ---- ShadowSenses Integration ---------------------------------------

  _getShadowDeploymentMap() {
    const now = Date.now();
    if (now - this._shadowCache.timestamp < 3000 &&
        BdApi.Plugins.isEnabled("ShadowSenses")) return this._shadowCache.map;

    const nextMap = new Map();
    try {
      const plugin = BdApi.Plugins.get("ShadowSenses");
      const instance = plugin?.instance || plugin;
      const live = instance?.deploymentManager?.getDeployments?.();
      const deployments = Array.isArray(live)
        ? live
        : (BdApi.Data.load("ShadowSenses", "deployments") || []);

      for (const dep of deployments) {
        const userId = String(dep?.targetUserId || "");
        if (!userId) continue;
        nextMap.set(userId, dep);
      }
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed loading ShadowSenses deployments`, err);
    }

    this._shadowCache = { timestamp: now, map: nextMap };
    return nextMap;
  }

  _isMarkedTarget(userId) {
    if (!userId) return false;
    return this._getShadowDeploymentMap().has(String(userId));
  }

  // ---- Context Menus ---------------------------------------------------

  patchGuildContextMenu() {
    try {
      this._guildContextUnpatch = BdApi.ContextMenu.patch("guild-context", (tree, props) => {
        try {
          const guild = props?.guild || this._GuildStore?.getGuild?.(props?.guildId);
          const guildId = guild?.id || props?.guildId;
          if (!guildId) return;

          const items = this._buildGuildReconActions(guildId, guild);
          let groupedItem = null;
          try {
            groupedItem = BdApi.ContextMenu.buildItem({
              type: "submenu",
              label: "Shadow Recon",
              items,
            });
          } catch (_) {}

          this._appendContextItems(tree, groupedItem ? [groupedItem] : items);
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
                BdApi.UI.showToast(
                  nextMarked
                    ? `Recon enabled for guild: ${guild?.name || guildId}`
                    : `Recon removed for guild: ${guild?.name || guildId}`,
                  { type: nextMarked ? "success" : "info" }
                );
              },
            }),
            BdApi.ContextMenu.buildItem({
              type: "text",
              label: "Shadow Recon: Open Current Guild Dossier",
              action: () => this.openGuildDossier(guildId),
            }),
          ];
          this._appendContextItems(tree, items);
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
      this._userContextUnpatch = BdApi.ContextMenu.patch("user-context", (tree, props) => {
        try {
          const user = props?.user;
          if (!user?.id) return;

          const currentGuildId = this._SelectedGuildStore?.getGuildId?.();
          const items = [];

          if (this.settings.showStaffIntelInContextMenu) {
            const staff = this.getStaffIntel(user.id, currentGuildId);
            if (staff) {
              const detailedUnlocked = this.isDetailedStaffIntelUnlocked(currentGuildId);
              items.push(BdApi.ContextMenu.buildItem({
                type: "text",
                label: `Shadow Recon: ${staff.label}`,
                disabled: true,
              }));
              items.push(BdApi.ContextMenu.buildItem({
                type: "text",
                label: detailedUnlocked
                  ? "Shadow Recon: Open Staff Dossier"
                  : "Shadow Recon: Staff Dossier (recon guild)",
                action: detailedUnlocked
                  ? () => this.openStaffIntelModal(user.id, currentGuildId)
                  : undefined,
                disabled: !detailedUnlocked,
              }));
            }
          }

          if (this.settings.showMarkedTargetIntelInContext && this._isMarkedTarget(user.id)) {
            const deployment = this._getShadowDeploymentMap().get(String(user.id));
            items.push(BdApi.ContextMenu.buildItem({
              type: "text",
              label: `Shadow Recon: Target Intel${deployment?.shadowRank ? ` [${deployment.shadowRank}]` : ""}`,
              action: () => this.openUserIntelModal(user.id, currentGuildId),
            }));
          }

          if (items.length > 0) this._appendContextItems(tree, items);
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

  _appendContextItems(tree, items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const target = this._resolveContextChildrenArray(tree);
    if (!target || !Array.isArray(target)) return;
    target.push(BdApi.ContextMenu.buildItem({ type: "separator" }), ...items);
  }

  _buildGuildReconActions(guildId, guild = null) {
    if (!guildId) return [];
    const marked = this.isGuildMarked(guildId);
    const guildName = guild?.name || guildId;

    return [
      BdApi.ContextMenu.buildItem({
        type: "text",
        label: marked ? "Unrecon Guild" : "Recon Guild",
        action: () => {
          const nextMarked = this.toggleGuildMark(guildId);
          BdApi.UI.showToast(
            nextMarked
              ? `Recon enabled for guild: ${guildName}`
              : `Recon removed for guild: ${guildName}`,
            { type: nextMarked ? "success" : "info" }
          );
        },
      }),
      BdApi.ContextMenu.buildItem({
        type: "text",
        label: "Open Guild Dossier",
        action: () => this.openGuildDossier(guildId),
      }),
    ];
  }

  _resolveContextChildrenArray(node, depth = 0, seen = null) {
    if (!node || depth > 7) return null;
    if (!seen) seen = new Set();
    if (typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) return node;

    if (Array.isArray(node?.props?.children)) return node.props.children;
    if (Array.isArray(node?.children)) return node.children;

    const candidates = [];
    if (node?.props?.children) candidates.push(node.props.children);
    if (node?.children) candidates.push(node.children);

    if (node?.props && typeof node.props === "object") {
      for (const value of Object.values(node.props)) {
        if (!value || value === node.props.children) continue;
        if (typeof value === "object") candidates.push(value);
      }
    }

    for (const candidate of candidates) {
      const found = this._resolveContextChildrenArray(candidate, depth + 1, seen);
      if (found) return found;
    }

    return null;
  }

  // ---- Visual Refresh --------------------------------------------------

  startRefreshLoops() {
    this.stopRefreshLoops();
    // PERF: 15s refresh (was 4s — guild hints rarely change, MutationObserver handles DOM)
    this._refreshInterval = setInterval(() => {
      if (this._stopped) return;
      this.refreshAllVisuals();
    }, 15000);
  }

  stopRefreshLoops() {
    if (this._refreshInterval) clearInterval(this._refreshInterval);
    this._refreshInterval = null;
  }

  refreshAllVisuals() {
    this.updateServerCounterWidget();
    this.removeMemberCounterBanner();
    this.refreshGuildIconHints();
  }

  setupObserver() {
    try {
      const appMount = document.getElementById("app-mount");
      if (!appMount) return;
      let last = 0;
      this._domObserver = new MutationObserver(() => {
        const now = Date.now();
        if (now - last < 500) return;
        last = now;
        this.injectServerCounterWidget();
        this.removeMemberCounterBanner();
        this.refreshGuildIconHints();
      });
      this._domObserver.observe(appMount, { childList: true, subtree: true });
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed observer setup`, err);
    }
  }

  teardownObserver() {
    if (this._domObserver) {
      this._domObserver.disconnect();
      this._domObserver = null;
    }
  }

  // ---- Server Counter Widget ------------------------------------------

  _getGuildsTarget() {
    return (
      document.querySelector('[data-list-id="guildsnav"]') ||
      document.querySelector('[class*="guilds_"] [class*="scroller_"]') ||
      document.querySelector('[class*="guilds_"]')
    );
  }

  _isHorizontalGuildNav(target) {
    if (!target || typeof window === "undefined" || typeof window.getComputedStyle !== "function") return false;

    const candidates = [target, target.firstElementChild, target.parentElement].filter(Boolean);
    for (const node of candidates) {
      try {
        const style = window.getComputedStyle(node);
        const direction = String(style?.flexDirection || "").toLowerCase();
        if (direction.startsWith("row")) return true;
      } catch (_) {}
    }

    try {
      const rect = target.getBoundingClientRect();
      if (rect.width > rect.height * 1.3) return true;
    } catch (_) {}

    return false;
  }

  _syncServerCounterWidgetOrientation(widget, target = null) {
    if (!widget) return false;
    const navTarget = target || this._getGuildsTarget();
    const horizontal = this._isHorizontalGuildNav(navTarget);
    widget.classList.toggle("shadow-recon-widget--rotated", horizontal);
    return horizontal;
  }

  injectServerCounterWidget() {
    if (!this.settings.showServerCounterWidget) {
      this.removeServerCounterWidget();
      return;
    }

    const target = this._getGuildsTarget();
    if (!target) return;

    let widget = document.getElementById(WIDGET_ID);
    if (!widget) {
      widget = document.createElement("div");
      widget.id = WIDGET_ID;
      widget.className = "shadow-recon-widget";
      widget.title = "Left click: Open current guild dossier | Right click: Recon/unrecon current guild";
      widget.addEventListener("click", () => {
        const guildId = this._getCurrentGuildId();
        if (guildId) this.openGuildDossier(guildId);
        else BdApi.UI.showToast("Select a guild first", { type: "warning" });
      });
      widget.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this._toggleCurrentGuildMarkWithToast();
      });

      if (target.firstChild) target.insertBefore(widget, target.firstChild);
      else target.appendChild(widget);
    }

    this._syncServerCounterWidgetOrientation(widget, target);
    this.updateServerCounterWidget(target);
  }

  updateServerCounterWidget(target = null) {
    const widget = document.getElementById(WIDGET_ID);
    if (!widget) return;
    const horizontal = this._syncServerCounterWidgetOrientation(widget, target);
    const guildCount = this.getServerCount();
    const markedGuildCount = this._markedGuildIds.size;
    const markedTargetCount = this._getShadowDeploymentMap().size;
    widget.textContent = horizontal
      ? `R ${guildCount} / ${markedGuildCount} / ${markedTargetCount}`
      : `Recon: ${guildCount} guilds | ${markedGuildCount} marked | ${markedTargetCount} marked targets`;
  }

  removeServerCounterWidget() {
    const widget = document.getElementById(WIDGET_ID);
    if (widget) widget.remove();
  }

  // ---- Member Counter Banner ------------------------------------------

  _getMembersListTarget() {
    const membersWrap = document.querySelector('[class^="membersWrap_"], [class*=" membersWrap_"]');
    if (!membersWrap) return null;
    return membersWrap.querySelector('[class^="members_"], [class*=" members_"]') || membersWrap;
  }

  injectMemberCounterBanner() {
    if (!this.settings.showMemberCounterBanner) {
      this.removeMemberCounterBanner();
      return;
    }

    const target = this._getMembersListTarget();
    if (!target) {
      this.removeMemberCounterBanner();
      return;
    }

    let banner = document.getElementById(MEMBER_BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = MEMBER_BANNER_ID;
      banner.className = "shadow-recon-member-banner";
      banner.title = "Left click: Open current guild dossier | Right click: Recon/unrecon current guild";
      banner.addEventListener("click", () => {
        const guildId = this._getCurrentGuildId();
        if (guildId) this.openGuildDossier(guildId);
      });
      banner.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this._toggleCurrentGuildMarkWithToast();
      });
      if (target.firstChild) target.insertBefore(banner, target.firstChild);
      else target.appendChild(banner);
    }

    this.updateMemberCounterBanner();
  }

  updateMemberCounterBanner() {
    const banner = document.getElementById(MEMBER_BANNER_ID);
    if (!banner) return;

    const guildId = this._getCurrentGuildId();
    if (!guildId) {
      banner.textContent = "Shadow Recon - Member Intel unavailable outside guild channels";
      return;
    }

    const guild = this._GuildStore?.getGuild?.(guildId);
    const total = this._GuildMemberCountStore?.getMemberCount?.(guildId)
      || guild?.memberCount
      || guild?.member_count
      || 0;
    const online = this._getGuildOnlineCount(guildId, guild);
    banner.textContent = `Shadow Recon - Members: ${this._formatNumber(total)} | Online: ${this._formatNumber(online)}`;
  }

  removeMemberCounterBanner() {
    const banner = document.getElementById(MEMBER_BANNER_ID);
    if (banner) banner.remove();
  }

  _getGuildOnlineCount(guildId, guild = null) {
    if (!guildId) return 0;

    const toSafeInt = (value) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
    };

    const fromObject = (obj) => {
      if (!obj || typeof obj !== "object") return null;
      const keys = [
        "online",
        "onlineCount",
        "presence",
        "presenceCount",
        "approximatePresenceCount",
        "approximate_presence_count",
      ];
      for (const key of keys) {
        const parsed = toSafeInt(obj[key]);
        if (parsed !== null) return parsed;
      }
      return null;
    };

    const countStore = this._GuildMemberCountStore;
    const storeMethods = [
      "getOnlineCount",
      "getOnlineMemberCount",
      "getPresenceCount",
      "getMemberCounts",
      "getCounts",
      "getGuildCounts",
    ];

    if (countStore && typeof countStore === "object") {
      for (const methodName of storeMethods) {
        const fn = countStore?.[methodName];
        if (typeof fn !== "function") continue;
        try {
          const result = fn.call(countStore, guildId);
          const direct = toSafeInt(result);
          if (direct !== null) return direct;
          const nested = fromObject(result);
          if (nested !== null) return nested;
        } catch (_) {}
      }
    }

    const activeGuild = guild || this._GuildStore?.getGuild?.(guildId);
    const directGuildCount = fromObject(activeGuild);
    if (directGuildCount !== null) return directGuildCount;

    return 0;
  }

  // ---- Guild Hover Intel ----------------------------------------------

  refreshGuildIconHints() {
    if (!this.settings.showGuildHoverIntel) return;
    const nodes = document.querySelectorAll('[data-list-item-id*="guild"]');
    for (const node of nodes) {
      const raw = node.getAttribute("data-list-item-id") || "";
      const guildId = this._extractSnowflake(raw);
      if (!guildId) continue;

      const guild = this._GuildStore?.getGuild?.(guildId);
      if (!guild) continue;

      const memberCount = this._GuildMemberCountStore?.getMemberCount?.(guildId)
        || guild?.memberCount
        || guild?.member_count
        || 0;
      const online = this._getGuildOnlineCount(guildId, guild);
      const markedLabel = this.isGuildMarked(guildId) ? "[Marked]" : "[Unmarked]";

      const title = `${markedLabel} ${guild.name} | Online ${this._formatNumber(online)} | Members ${this._formatNumber(memberCount)}`;
      node.setAttribute("title", title);
      node.setAttribute("data-shadow-recon-title", "1");
    }
  }

  clearGuildIconHints() {
    const nodes = document.querySelectorAll('[data-shadow-recon-title="1"]');
    for (const node of nodes) {
      node.removeAttribute("title");
      node.removeAttribute("data-shadow-recon-title");
    }
  }

  _extractSnowflake(text) {
    if (!text) return null;
    const match = String(text).match(/\d{16,20}/);
    return match ? match[0] : null;
  }

  // ---- Guild Dossier ---------------------------------------------------

  openGuildDossier(guildId) {
    const guild = this._GuildStore?.getGuild?.(guildId);
    if (!guild) {
      BdApi.UI.showToast("Guild intel unavailable", { type: "error" });
      return;
    }

    const marked = this.isGuildMarked(guildId);
    const lockFull = this.settings.loreLockedRecon && !marked;
    const intel = this.getGuildIntel(guildId);

    const overlay = this._createModal(`Shadow Recon - Guild Dossier`, `${guild.name}${marked ? " [Marked]" : " [Unmarked]"}`);
    const body = overlay.querySelector(".shadow-recon-modal-body");

    body.appendChild(this._buildKeyValueSection("Server Details", [
      ["Guild ID", guild.id],
      ["Owner", intel.ownerName],
      ["Created", intel.createdAt],
      ["Joined", intel.joinedAt],
      ["Boost Tier", String(intel.premiumTier)],
      ["Boost Count", this._formatNumber(intel.premiumSubscriptionCount)],
      ["Roles", this._formatNumber(intel.roleCount)],
      ["Channels", this._formatNumber(intel.channelCount)],
      ["Features", intel.featuresLabel],
    ]));

    body.appendChild(this._buildKeyValueSection("Server Counter", [
      ["Total Guilds", this._formatNumber(this.getServerCount())],
      ["Marked Guilds", this._formatNumber(this._markedGuildIds.size)],
      ["Marked Targets", this._formatNumber(this._getShadowDeploymentMap().size)],
    ]));

    body.appendChild(this._buildKeyValueSection("Member Counter", [
      ["Total Members", this._formatNumber(intel.memberCount)],
      ["Online Members", this._formatNumber(intel.onlineCount)],
    ]));

    if (lockFull) {
      const notice = document.createElement("div");
      notice.className = "shadow-recon-notice";
      notice.textContent = "Guild is not recon-marked. Recon this guild to unlock full Shadow Recon intel (lore lock).";

      const markBtn = document.createElement("button");
      markBtn.className = "shadow-recon-button";
      markBtn.textContent = "Recon Guild Now";
      markBtn.addEventListener("click", () => {
        this.toggleGuildMark(guildId);
        this.closeModal();
        this.openGuildDossier(guildId);
      });

      body.appendChild(notice);
      body.appendChild(markBtn);
      return;
    }

    body.appendChild(this._buildPermissionsSection("Your Guild Permissions", intel.currentUserPermissionSummary));

    body.appendChild(this._buildKeyValueSection("Guild Profile", [
      ["Description", intel.description || "None"],
      ["Emoji Count", this._formatNumber(intel.emojiCount)],
      ["Sticker Count", this._formatNumber(intel.stickerCount)],
      ["Soundboard Count", this._formatNumber(intel.soundboardCount)],
      ["Preferred Locale", intel.preferredLocale || "Unknown"],
    ]));
  }

  getGuildIntel(guildId) {
    const guild = this._GuildStore?.getGuild?.(guildId);
    const owner = guild ? this._UserStore?.getUser?.(guild.ownerId) : null;

    const createdAt = this._safeDateFromSnowflake(guild?.id);
    const joinedAt = guild?.joinedAt ? new Date(guild.joinedAt).toLocaleString() : "Unknown";

    const channelCount = this._countGuildChannels(guildId);
    const roleCount = guild?.roles ? Object.keys(guild.roles).length : 0;

    const memberCount = this._GuildMemberCountStore?.getMemberCount?.(guildId)
      || guild?.memberCount
      || guild?.member_count
      || 0;
    const onlineCount = this._getGuildOnlineCount(guildId, guild);

    const permissionSummary = this.getCurrentUserPermissionSummary(guildId);

    return {
      ownerName: owner ? (owner.globalName || owner.username || owner.id) : guild?.ownerId || "Unknown",
      createdAt,
      joinedAt,
      premiumTier: guild?.premiumTier || 0,
      premiumSubscriptionCount: guild?.premiumSubscriptionCount || 0,
      roleCount,
      channelCount,
      featuresLabel: Array.isArray(guild?.features) && guild.features.length > 0 ? guild.features.slice(0, 8).join(", ") : "None",
      memberCount,
      onlineCount,
      description: guild?.description || "",
      emojiCount: this._countGuildEmojis(guildId, guild),
      stickerCount: this._countGuildStickers(guildId, guild),
      soundboardCount: this._countGuildSoundboard(guildId),
      preferredLocale: guild?.preferredLocale || guild?.preferred_locale || "",
      currentUserPermissionSummary: permissionSummary,
    };
  }

  // ---- Target Intel Modal ---------------------------------------------

  async openUserIntelModal(userId, guildId) {
    const user = this._UserStore?.getUser?.(userId);
    const deployment = this._getShadowDeploymentMap().get(String(userId));

    const overlay = this._createModal(
      "Shadow Recon - Target Intel",
      `${user?.globalName || user?.username || userId}${deployment?.shadowName ? ` | reported by ${deployment.shadowName}` : ""}`
    );

    const body = overlay.querySelector(".shadow-recon-modal-body");
    const platformData = this.getPlatformIntel(userId);
    const staff = this.getStaffIntel(userId, guildId);
    const detailedStaffUnlocked = this.isDetailedStaffIntelUnlocked(guildId);

    body.appendChild(this._buildKeyValueSection("Platform Indicators", platformData.length
      ? platformData.map(p => [p.platform, p.status])
      : [["Intel", "No platform statuses reported"]]
    ));

    body.appendChild(this._buildKeyValueSection(
      "Staff Intel",
      staff
        ? [
            ["Rank", staff.label],
            ["Capabilities", detailedStaffUnlocked ? (staff.capabilities.join(", ") || "None") : "Locked - recon guild for full staff dossier"],
          ]
        : [["Rank", "No elevated staff permissions detected"]]
    ));

    const connectionsSection = this._buildKeyValueSection("Connections", [["Status", "Fetching profile intel..."]]);
    body.appendChild(connectionsSection);

    try {
      const connections = await this.getConnectionsIntel(userId, guildId);
      connectionsSection.innerHTML = "";
      const rows = connections.length
        ? connections.map(c => [c.type, `${c.name}${c.verified ? " (verified)" : ""}`])
        : [["Status", "No public connections returned for this target"]];
      connectionsSection.appendChild(this._buildGrid(rows));
    } catch (err) {
      connectionsSection.innerHTML = "";
      connectionsSection.appendChild(this._buildGrid([["Error", "Failed to load connection intel"]]));
      console.error(`[${PLUGIN_NAME}] Failed fetching target connections`, err);
    }
  }

  getPlatformIntel(userId) {
    const rows = [];
    try {
      const currentUserId = this._UserStore?.getCurrentUser?.()?.id;
      let clientStatuses = {};

      if (currentUserId && String(userId) === String(currentUserId) && this._SessionsStore?.getSessions) {
        const sessions = this._SessionsStore.getSessions() || {};
        for (const session of Object.values(sessions)) {
          const client = session?.clientInfo?.client;
          const status = session?.status;
          if (!client) continue;
          clientStatuses[client] = status || "unknown";
        }
      } else {
        clientStatuses = this._PresenceStore?.getState?.()?.clientStatuses?.[userId] || {};
      }

      for (const [platformRaw, statusRaw] of Object.entries(clientStatuses)) {
        const platform = PLATFORM_LABELS[platformRaw] || this._capitalize(platformRaw);
        const status = STATUS_LABELS[statusRaw] || this._capitalize(statusRaw);
        rows.push({ platform, status });
      }

      if (rows.length === 0) {
        const statusRaw = this._PresenceStore?.getStatus?.(userId);
        if (statusRaw) rows.push({ platform: "Presence", status: STATUS_LABELS[statusRaw] || this._capitalize(statusRaw) });
      }
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed getting platform intel`, err);
    }
    return rows;
  }

  async getConnectionsIntel(userId, guildId) {
    await this._requestUserProfile(userId, guildId);

    const profile = this._getUserProfile(userId);
    const possible =
      profile?.connectedAccounts ||
      profile?.connected_accounts ||
      profile?.connections ||
      profile?.userProfile?.connectedAccounts ||
      profile?.userProfile?.connected_accounts ||
      [];

    if (!Array.isArray(possible)) return [];

    return possible
      .map((c) => ({
        type: this._capitalize(String(c?.type || c?.platform || "unknown")),
        name: String(c?.name || c?.username || c?.id || "unknown"),
        verified: Boolean(c?.verified),
      }))
      .slice(0, 20);
  }

  async _requestUserProfile(userId, guildId) {
    const actions = this._UserProfileActions;
    if (!actions) return;

    try {
      if (typeof actions.fetchProfile === "function") {
        await Promise.resolve(actions.fetchProfile(userId, { guildId }));
      } else if (typeof actions.fetchUserProfile === "function") {
        await Promise.resolve(actions.fetchUserProfile(userId, { guildId }));
      }
    } catch (_) {
      try {
        if (typeof actions.fetchProfile === "function") {
          await Promise.resolve(actions.fetchProfile(userId));
        } else if (typeof actions.fetchUserProfile === "function") {
          await Promise.resolve(actions.fetchUserProfile(userId));
        }
      } catch (err) {
        console.error(`[${PLUGIN_NAME}] profile request failed`, err);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  _getUserProfile(userId) {
    const store = this._UserProfileStore;
    if (!store) return null;

    try {
      if (typeof store.getUserProfile === "function") return store.getUserProfile(userId);
      if (typeof store.getProfile === "function") return store.getProfile(userId);
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] Failed reading UserProfileStore`, err);
    }

    return null;
  }

  // ---- Staff / Permissions --------------------------------------------

  isDetailedStaffIntelUnlocked(guildId) {
    if (!guildId) return false;
    if (!this.settings.loreLockedRecon) return true;
    return this.isGuildMarked(guildId);
  }

  openStaffIntelModal(userId, guildId) {
    if (!guildId || !userId) {
      BdApi.UI.showToast("Guild context required for staff dossier", { type: "warning" });
      return;
    }

    const guild = this._GuildStore?.getGuild?.(guildId);
    const user = this._UserStore?.getUser?.(userId);
    const staff = this.getStaffIntel(userId, guildId);
    if (!guild || !staff) {
      BdApi.UI.showToast("No staff dossier available for this user", { type: "warning" });
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
    const currentUser = this._UserStore?.getCurrentUser?.();
    if (!currentUser?.id) return [];
    return this.getPermissionSummaryForMember(guildId, currentUser.id);
  }

  getStaffIntel(userId, guildId) {
    if (!guildId || !userId) return null;
    const guild = this._GuildStore?.getGuild?.(guildId);
    if (!guild) return null;

    if (String(guild.ownerId) === String(userId)) {
      return { label: "Server Owner", capabilities: ["Full control"] };
    }

    const summary = this.getPermissionSummaryForMember(guildId, userId);
    const hasAdmin = summary.find(p => p.key === "ADMINISTRATOR" && p.allowed);
    if (hasAdmin) {
      return { label: "Administrator", capabilities: ["Full administrative access"] };
    }

    const capabilities = summary
      .filter(p => p.allowed && STAFF_PERMISSION_KEYS.includes(p.key) && p.key !== "ADMINISTRATOR")
      .map(p => p.label);

    if (capabilities.length > 0) {
      return { label: "Management", capabilities };
    }

    return null;
  }

  getPermissionSummaryForMember(guildId, userId) {
    const bits = this._computeGuildPermissionBits(guildId, userId);
    const bitMap = this._getPermissionBitsMap();
    const adminBit = bitMap.ADMINISTRATOR || 0n;
    const hasAdmin = adminBit !== 0n && ((bits & adminBit) === adminBit);

    const summary = [];
    for (const key of IMPORTANT_PERMISSIONS) {
      const bit = bitMap[key] || 0n;
      const allowed = hasAdmin || (bit !== 0n && ((bits & bit) === bit));
      summary.push({ key, label: this._humanizePermissionKey(key), allowed });
    }
    return summary;
  }

  _computeGuildPermissionBits(guildId, userId) {
    const guild = this._GuildStore?.getGuild?.(guildId);
    if (!guild) return 0n;

    if (String(guild.ownerId) === String(userId)) {
      return this._allPermissionBits();
    }

    const member = this._GuildMemberStore?.getMember?.(guildId, userId);
    if (!member) return 0n;

    const roleIds = new Set([String(guildId), ...(Array.isArray(member.roles) ? member.roles.map(String) : [])]);
    let bits = 0n;

    for (const roleId of roleIds) {
      const role = guild.roles?.[roleId];
      if (!role) continue;
      bits |= this._toBigInt(role.permissions);
    }

    return bits;
  }

  _allPermissionBits() {
    const map = this._getPermissionBitsMap();
    let all = 0n;
    for (const bit of Object.values(map)) {
      if (typeof bit === "bigint") all |= bit;
    }
    return all;
  }

  _getPermissionBitsMap() {
    if (this._permissionBitsCache) return this._permissionBitsCache;

    const source = this._PermissionsBits || {};
    const map = {};
    for (const [key, value] of Object.entries(source)) {
      if (!/^[A-Z0-9_]+$/.test(key)) continue;
      if (!["number", "string", "bigint"].includes(typeof value)) continue;
      try {
        map[key] = this._toBigInt(value);
      } catch (_) {}
    }

    this._permissionBitsCache = map;
    return map;
  }

  // ---- Modal Builders --------------------------------------------------

  _createModal(title, subtitle = "") {
    this.closeModal();

    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "shadow-recon-overlay";

    const panel = document.createElement("div");
    panel.className = "shadow-recon-modal";

    const header = document.createElement("div");
    header.className = "shadow-recon-modal-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "shadow-recon-modal-title-wrap";

    const titleEl = document.createElement("h2");
    titleEl.className = "shadow-recon-modal-title";
    titleEl.textContent = title;

    const subtitleEl = document.createElement("div");
    subtitleEl.className = "shadow-recon-modal-subtitle";
    subtitleEl.textContent = subtitle;

    const closeBtn = document.createElement("button");
    closeBtn.className = "shadow-recon-close";
    closeBtn.textContent = "x";
    closeBtn.addEventListener("click", () => this.closeModal());

    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(subtitleEl);
    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "shadow-recon-modal-body";

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.closeModal();
    });

    document.body.appendChild(overlay);
    this._modalEl = overlay;
    return overlay;
  }

  closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
    this._modalEl = null;
  }

  _buildKeyValueSection(title, rows) {
    const section = document.createElement("section");
    section.className = "shadow-recon-section";

    const h = document.createElement("h3");
    h.className = "shadow-recon-section-title";
    h.textContent = title;

    section.appendChild(h);
    section.appendChild(this._buildGrid(rows));
    return section;
  }

  _buildPermissionsSection(title, summary) {
    const section = document.createElement("section");
    section.className = "shadow-recon-section";

    const h = document.createElement("h3");
    h.className = "shadow-recon-section-title";
    h.textContent = title;

    const list = document.createElement("div");
    list.className = "shadow-recon-perm-list";

    for (const item of summary) {
      const row = document.createElement("div");
      row.className = `shadow-recon-perm-item ${item.allowed ? "allowed" : "denied"}`;

      const label = document.createElement("span");
      label.textContent = item.label;

      const status = document.createElement("span");
      status.textContent = item.allowed ? "Allowed" : "Denied";

      row.appendChild(label);
      row.appendChild(status);
      list.appendChild(row);
    }

    section.appendChild(h);
    section.appendChild(list);
    return section;
  }

  _buildGrid(rows) {
    const grid = document.createElement("div");
    grid.className = "shadow-recon-grid";

    for (const [key, value] of rows) {
      const k = document.createElement("div");
      k.className = "shadow-recon-key";
      k.textContent = String(key);

      const v = document.createElement("div");
      v.className = "shadow-recon-value";
      v.textContent = String(value);

      grid.appendChild(k);
      grid.appendChild(v);
    }

    return grid;
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
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && value.trim().length > 0) {
      try { return BigInt(value); } catch (_) { return 0n; }
    }
    return 0n;
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

  _humanizePermissionKey(key) {
    return String(key)
      .toLowerCase()
      .split("_")
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  // ---- Settings Panel --------------------------------------------------

  getSettingsPanel() {
    const React = BdApi.React;
    const ce = React.createElement;

    const makeToggle = (label, key, note) => ce("div", { style: rowStyle },
      ce("div", null,
        ce("div", { style: labelStyle }, label),
        note ? ce("div", { style: noteStyle }, note) : null
      ),
      ce("input", {
        type: "checkbox",
        defaultChecked: !!this.settings[key],
        onChange: (e) => {
          this.settings[key] = e.target.checked;
          this.saveSettings();
          this.refreshAllVisuals();
        },
        style: { accentColor: "#4b7bec" },
      })
    );

    const currentGuildId = this._SelectedGuildStore?.getGuildId?.();
    const markedTargets = this._getShadowDeploymentMap().size;

    const panelStyle = {
      padding: "16px",
      background: "#111827",
      color: "#d1d5db",
      borderRadius: "10px",
      border: "1px solid rgba(75, 123, 236, 0.35)",
    };

    const rowStyle = {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
      padding: "10px 0",
      borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
    };

    const labelStyle = { color: "#e5e7eb", fontSize: "13px", fontWeight: "600" };
    const noteStyle = { color: "#9ca3af", fontSize: "11px", marginTop: "2px", maxWidth: "480px" };
    const statStyle = { color: "#93c5fd", fontWeight: "700" };

    return ce("div", { style: panelStyle },
      ce("h3", { style: { marginTop: 0, color: "#60a5fa" } }, "Shadow Recon Control"),

      ce("div", { style: { marginBottom: "12px", color: "#9ca3af", fontSize: "12px" } },
        ce("span", null, "Guilds: "),
        ce("span", { style: statStyle }, this._formatNumber(this.getServerCount())),
        ce("span", null, " | Marked Guilds: "),
        ce("span", { style: statStyle }, this._formatNumber(this._markedGuildIds.size)),
        ce("span", null, " | Marked Targets: "),
        ce("span", { style: statStyle }, this._formatNumber(markedTargets))
      ),

      makeToggle("Lore Lock (recon guild for full dossier)", "loreLockedRecon", "When enabled, unrecon guild dossiers only show a limited briefing."),
      makeToggle("Server Counter Widget", "showServerCounterWidget", "Adds total guild / marked intel at top of guild bar."),
      makeToggle("Guild Hover Intel Hint", "showGuildHoverIntel", "Adds recon hint text on guild icon hover elements."),
      makeToggle("Staff Intel in User Context", "showStaffIntelInContextMenu", "Shows rank without recon mark; detailed staff dossier unlocks when guild is recon-marked."),
      makeToggle("Marked Target Intel Action", "showMarkedTargetIntelInContext", "Adds platform/connections intel action for ShadowSenses targets."),

      ce("div", { style: { display: "flex", gap: "8px", marginTop: "14px" } },
        ce("button", {
          className: "shadow-recon-button",
          onClick: () => this._toggleCurrentGuildMarkWithToast(),
        }, currentGuildId && this.isGuildMarked(currentGuildId) ? "Unrecon Current Guild" : "Recon Current Guild"),
        ce("button", {
          className: "shadow-recon-button",
          onClick: () => {
            if (currentGuildId) this.openGuildDossier(currentGuildId);
            else BdApi.UI.showToast("Select a guild first", { type: "warning" });
          },
        }, "Open Current Guild Dossier"),
        ce("button", {
          className: "shadow-recon-button",
          onClick: () => {
            this._markedGuildIds.clear();
            this.saveMarkedGuilds();
            this.refreshAllVisuals();
            BdApi.UI.showToast("Shadow Recon guild marks cleared", { type: "info" });
          },
        }, "Clear Recon Guilds")
      )
    );
  }

  // ---- CSS -------------------------------------------------------------

  injectCSS() {
    BdApi.DOM.addStyle(STYLE_ID, `
#${WIDGET_ID}.shadow-recon-widget {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 6px 8px;
  padding: 8px 10px;
  border: 1px solid rgba(96, 165, 250, 0.45);
  border-radius: 2px;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
  color: #bfdbfe;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transform-origin: center center;
  transition: border-color 120ms ease, color 120ms ease, transform 140ms ease;
}

#${WIDGET_ID}.shadow-recon-widget.shadow-recon-widget--rotated {
  transform: rotate(90deg);
  margin: 10px -12px;
  padding: 7px 9px;
  border-radius: 2px;
  font-size: 10px;
  line-height: 1.2;
}

#${WIDGET_ID}.shadow-recon-widget:hover {
  border-color: rgba(96, 165, 250, 0.85);
  color: #dbeafe;
}

#${MEMBER_BANNER_ID}.shadow-recon-member-banner {
  margin: 8px 10px;
  padding: 8px 10px;
  border: 1px solid rgba(96, 165, 250, 0.35);
  border-radius: 2px;
  background: rgba(15, 23, 42, 0.85);
  color: #bfdbfe;
  font-size: 12px;
  font-weight: 600;
}

#${MODAL_ID}.shadow-recon-overlay {
  position: fixed;
  inset: 0;
  z-index: 10060;
  background: rgba(2, 6, 23, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

#${MODAL_ID} .shadow-recon-modal {
  width: min(900px, 94vw);
  max-height: 85vh;
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid rgba(96, 165, 250, 0.45);
  background: #0f172a;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
}

#${MODAL_ID} .shadow-recon-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(96, 165, 250, 0.25);
  background: rgba(30, 41, 59, 0.9);
}

#${MODAL_ID} .shadow-recon-modal-title-wrap { display: flex; flex-direction: column; gap: 2px; }
#${MODAL_ID} .shadow-recon-modal-title { margin: 0; color: #dbeafe; font-size: 16px; }
#${MODAL_ID} .shadow-recon-modal-subtitle { color: #93c5fd; font-size: 12px; }

#${MODAL_ID} .shadow-recon-close {
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: transparent;
  color: #e2e8f0;
  border-radius: 2px;
  width: 30px;
  height: 30px;
  cursor: pointer;
}

#${MODAL_ID} .shadow-recon-close:hover {
  border-color: rgba(248, 113, 113, 0.8);
  color: #fecaca;
}

#${MODAL_ID} .shadow-recon-modal-body {
  overflow: auto;
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

#${MODAL_ID} .shadow-recon-section {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 2px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.82);
}

#${MODAL_ID} .shadow-recon-section-title {
  margin: 0 0 8px;
  color: #93c5fd;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

#${MODAL_ID} .shadow-recon-grid {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 6px 10px;
}

#${MODAL_ID} .shadow-recon-key {
  color: #94a3b8;
  font-size: 11px;
}

#${MODAL_ID} .shadow-recon-value {
  color: #e2e8f0;
  font-size: 12px;
  word-break: break-word;
}

#${MODAL_ID} .shadow-recon-perm-list {
  display: grid;
  gap: 6px;
}

#${MODAL_ID} .shadow-recon-perm-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 2px;
  padding: 6px 8px;
  font-size: 12px;
}

#${MODAL_ID} .shadow-recon-perm-item.allowed {
  border-color: rgba(34, 197, 94, 0.45);
  color: #bbf7d0;
}

#${MODAL_ID} .shadow-recon-perm-item.denied {
  border-color: rgba(239, 68, 68, 0.4);
  color: #fecaca;
}

.shadow-recon-notice {
  grid-column: 1 / -1;
  padding: 10px;
  border: 1px solid rgba(250, 204, 21, 0.5);
  border-radius: 2px;
  color: #fde68a;
  background: rgba(120, 53, 15, 0.22);
  margin-bottom: 8px;
}

.shadow-recon-button {
  border: 1px solid rgba(96, 165, 250, 0.45);
  border-radius: 2px;
  background: rgba(15, 23, 42, 0.85);
  color: #dbeafe;
  padding: 7px 10px;
  cursor: pointer;
}

.shadow-recon-button:hover {
  border-color: rgba(96, 165, 250, 0.85);
  background: rgba(30, 58, 138, 0.35);
}
`);
  }
};
