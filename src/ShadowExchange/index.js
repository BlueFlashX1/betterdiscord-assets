/**
 * ============================================================================
 * REACT PANEL ARCHITECTURE (v2.1.0)
 * ============================================================================
 *
 * The waypoint panel is now a React component tree rendered via
 * BdApi.ReactDOM.createPortal into a body-level container.  This replaces
 * the v1.x template-literal innerHTML approach that required manual event
 * delegation, cloneNode listener dedup, and full innerHTML replacement on
 * every search/sort change.
 *
 * What changed:
 *   - Panel UI: React functional components with useState/useCallback
 *   - Search/sort: React state → automatic re-render (no innerHTML replace)
 *   - Event handling: React onClick props (no data-action delegation)
 *   - Card list: React keys for identity (no cloneNode hack)
 *
 * What did NOT change:
 *   - Swirl icon interaction and behavior (still opens waypoint panel)
 *   - Context menu: still BdApi.ContextMenu.patch (already React-based)
 *   - Persistence: identical BdApi.Data + file backup
 *   - Navigation: identical NavigationUtils.transitionTo
 *   - Shadow assignment: identical ShadowArmy integration
 *   - CSS: identical stylesheet via BdApi.DOM.addStyle
 *   - Public API: getMarkedShadowIds(), isShadowMarked()
 */

const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");

// ─── Constants ─────────────────────────────────────────────────────────────

const SE_PLUGIN_ID = "ShadowExchange";
const SE_VERSION = "2.1.1";
const SE_STYLE_ID = "shadow-exchange-css";
const SE_SWIRL_ID = "se-swirl-icon";
const SE_PANEL_CONTAINER_ID = "se-panel-root";
const TRANSITION_ID = "se-transition-overlay";
const SWIRL_REINJECT_DELAY_MS = 140;

const FALLBACK_SHADOWS = [
  { name: "Shadow Scout", rank: "E" },
  { name: "Shadow Sentry", rank: "E" },
  { name: "Shadow Guard", rank: "E" },
  { name: "Shadow Watcher", rank: "D" },
  { name: "Shadow Patrol", rank: "D" },
  { name: "Shadow Ranger", rank: "D" },
  { name: "Shadow Knight", rank: "C" },
  { name: "Shadow Striker", rank: "C" },
  { name: "Shadow Warrior", rank: "B" },
  { name: "Shadow Vanguard", rank: "B" },
  { name: "Shadow Elite", rank: "A" },
  { name: "Shadow Blade", rank: "A" },
  { name: "Shadow Marshal", rank: "S" },
  { name: "Shadow Commander", rank: "S" },
  { name: "Shadow Overlord", rank: "SS" },
  { name: "Shadow Arbiter", rank: "SS" },
  { name: "Shadow Sovereign", rank: "SSS" },
  { name: "Shadow Titan", rank: "SSS" },
  { name: "Shadow Paragon", rank: "SSS+" },
  { name: "Shadow Apex", rank: "Shadow Monarch" },
];

const { createToast } = require("../shared/toast");
const { getNavigationUtils } = require("../shared/navigation");
const { buildPanelComponents } = require("./panel-components");
const { getShadowExchangeCss } = require("./styles");
const { PORTAL_TRANSITION_CSS } = require("./portal-transition-css");
const {
  flushSaveSettings,
  initBackupPath,
  loadSettings,
  readFileBackup,
  saveSettings,
  writeFileBackup,
} = require("./persistence");

// ─── Shared Utilities ─────────────────────────────────────────────────────
let _ReactUtils;
try { _ReactUtils = loadBdModuleFromPlugins('BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }

let _PluginUtils;
try { _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

let _SLUtils;
try { _SLUtils = loadBdModuleFromPlugins("SoloLevelingUtils.js") || window.SoloLevelingUtils || null; } catch (_) { _SLUtils = window.SoloLevelingUtils || null; }

let _TransitionCleanupUtils;
try { _TransitionCleanupUtils = loadBdModuleFromPlugins("TransitionCleanupUtils.js"); } catch (_) { _TransitionCleanupUtils = null; }

// ─── Plugin Class ──────────────────────────────────────────────────────────

module.exports = class ShadowExchange {
  // ── Lifecycle ──────────────────────────────────────────────────────────

  _flushPendingSave() {
    if (!this._saveDebounceTimer) return;
    clearTimeout(this._saveDebounceTimer);
    this._saveDebounceTimer = null;
    this._flushSaveSettings();
  }

  _teardownRuntime() {
    if (this._unpatchContextMenu) {
      try { this._unpatchContextMenu(); } catch (_) {}
      this._unpatchContextMenu = null;
    }
    this.closePanel();
    _TransitionCleanupUtils?.cancelPendingTransition?.(this);
    _TransitionCleanupUtils?.clearNavigateRetries?.(this);
    _TransitionCleanupUtils?.cancelChannelViewFade?.(this);
    this.teardownSwirlObserver();
    this.removeSwirlIcon();
    const seTip = document.getElementById("sl-toolbar-tip-se");
    if (seTip) seTip.remove();
    this.removeCSS();
  }

  _resetRuntimeState() {
    this._panelForceUpdate = null;
    this._panelContainer = null;
    this._swirlReinjectTimeout = null;
    this._swirlResizeHandler = null;
    this._transitionNavTimeout = null;
    this._transitionCleanupTimeout = null;
    this._transitionRunId = 0;
    this._transitionStopCanvas = null;
    this._navigateRetryTimers = new Set();
    this._navigateRequestId = 0;
    this._channelFadeToken = 0;
    this._channelFadeResetTimer = null;
    this._saveDebounceTimer = null;
    this._layoutBusUnsub = null;
    this._markedShadowIdsCache = null;
    this._waypointByLocationCache = null;
  }

  constructor() {
    this._resetRuntimeState();
    this._NavigationUtils = null;
  }

  start() {
    this._toast = _PluginUtils?.createToastHelper?.("shadowExchange") || createToast();
    try {
      this._flushPendingSave();
      this._teardownRuntime();
      this.panelOpen = false;
      this.swirlIcon = null;
      this.fallbackIdx = 0;
      this.fileBackupPath = null;
      this._resetRuntimeState();
      this.defaultSettings = {
        waypoints: [],
        sortBy: "created",
        debug: false,
        animationEnabled: true,
        respectReducedMotion: false,
        animationDuration: 550,
        _metadata: { lastSave: null, version: SE_VERSION },
      };
      this.settings = { ...this.defaultSettings, waypoints: [] };

      this.initWebpack();
      this.initBackupPath();
      this.loadSettings();
      this.injectCSS();

      // Build React components (cached for this plugin instance)
      this._components = buildPanelComponents(BdApi, this);

      // Swirl icon — anchored to the channel header toolbar.
      this.injectSwirlIcon();
      this.setupSwirlObserver();

      // Right-click context menu on messages → "Shadow Mark"
      this.patchContextMenu();

      this._toast(`ShadowExchange v${SE_VERSION} active`, "success");
    } catch (err) {
      console.error("[ShadowExchange] start() failed:", err);
      this._toast("ShadowExchange failed to start", "error");
    }
  }

  stop() {
    this._flushPendingSave();
    try {
      this._teardownRuntime();
      this._resetRuntimeState();
    } catch (err) {
      console.error("[ShadowExchange] stop() failed:", err);
    }
  }

  // ── Webpack Modules ────────────────────────────────────────────────────

  initWebpack() {
    const { Webpack } = BdApi;
    try {
      this._NavigationUtils = getNavigationUtils();
      this.NavigationUtils = this._NavigationUtils;
    } catch (_) {
      this._NavigationUtils = null;
      this.NavigationUtils = null;
    }
    this.ChannelStore = Webpack.getStore("ChannelStore");
    this.GuildStore = Webpack.getStore("GuildStore");
    this.MessageStore = Webpack.getStore("MessageStore");
    this.UserStore = Webpack.getStore("UserStore");
  }

  // ── Context Menu (right-click → Shadow Mark) ──────────────────────────

  patchContextMenu() {
    try {
      if (this._unpatchContextMenu) {
        try { this._unpatchContextMenu(); } catch (_) {}
        this._unpatchContextMenu = null;
      }
      this._unpatchContextMenu = BdApi.ContextMenu.patch("message", (tree, props) => {
        try {
          const { message, channel } = props;
          if (!message || !channel) return;

          const existingWaypoint = this._getWaypointByLocation(channel.id, message.id);

          const separator = BdApi.ContextMenu.buildItem({ type: "separator" });

          let item;
          if (existingWaypoint) {
            item = BdApi.ContextMenu.buildItem({
              type: "text",
              label: `Shadow Unmark (${existingWaypoint.shadowName})`,
              id: "shadow-exchange-unmark",
              action: () => {
                this.removeWaypoint(existingWaypoint.id);
                this._toast(
                  `${existingWaypoint.shadowName} recalled \u2014 available for deployment`,
                  "info"
                );
              },
            });
          } else {
            item = BdApi.ContextMenu.buildItem({
              type: "text",
              label: "Shadow Mark",
              id: "shadow-exchange-mark",
              action: () => this.markMessage(channel, message),
            });
          }

          const children = tree?.props?.children;
          if (Array.isArray(children)) {
            children.push(separator, item);
          } else if (children?.props?.children && Array.isArray(children.props.children)) {
            children.props.children.push(separator, item);
          }
        } catch (err) {
          console.error("[ShadowExchange] Context menu callback error:", err);
        }
      });
    } catch (err) {
      console.error("[ShadowExchange] Context menu patch failed:", err);
    }
  }

  /**
   * Mark a specific message from the context menu.
   */
  _resolveWaypointLocationNames(channel, guildId) {
    let channelName = channel.name || "DM";
    let guildName = guildId ? "Unknown Server" : "Direct Messages";

    try {
      if (guildId) {
        const guild = this.GuildStore?.getGuild(guildId);
        if (guild) guildName = guild.name;
      }
      if (!channel.name && channel.recipients?.length) channelName = "DM";
    } catch (error) {
      this.debugError("Mark", "Failed to resolve guild/channel labels for message waypoint", error);
    }

    return { channelName, guildName };
  }

  _buildWaypointLabel(guildId, guildName, channelName) {
    return guildId
      ? `${guildName} \u00BB #${channelName}`
      : `DM \u00BB ${channelName}`;
  }

  _extractMessagePreviewText(message) {
    try {
      if (message.content) {
        return message.content.length > 120
          ? `${message.content.slice(0, 120)}\u2026`
          : message.content;
      }
      if (message.embeds?.length) return "[Embed]";
      if (message.attachments?.length) {
        const count = message.attachments.length;
        return `[${count} attachment${count > 1 ? "s" : ""}]`;
      }
    } catch (error) {
      this.debugError("Mark", "Failed to build message preview text", error);
    }
    return "";
  }

  _extractMessageAuthor(message) {
    try {
      if (message.author) {
        return message.author.globalName || message.author.username || "";
      }
    } catch (error) {
      this.debugError("Mark", "Failed to read message author for waypoint", error);
    }
    return "";
  }

  async markMessage(channel, message) {
    const channelId = channel.id;
    const guildId = channel.guild_id || null;
    const messageId = message.id;

    const dup = this._getWaypointByLocation(channelId, messageId);
    if (dup) {
      this._toast(`Already marked: ${dup.label}`, "warning");
      return;
    }

    const { channelName, guildName } = this._resolveWaypointLocationNames(channel, guildId);

    const shadow = await this.getWeakestAvailableShadow();
    if (!shadow) {
      this._toast("No shadows available!", "error");
      return;
    }

    const label = this._buildWaypointLabel(guildId, guildName, channelName);
    const messagePreview = this._extractMessagePreviewText(message);
    const messageAuthor = this._extractMessageAuthor(message);

    const waypoint = {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      locationType: "message",
      guildId,
      channelId,
      messageId,
      shadowId: shadow.id,
      shadowName: shadow.name,
      shadowRank: shadow.rank,
      createdAt: Date.now(),
      lastVisited: null,
      visitCount: 0,
      channelName,
      guildName,
      messagePreview,
      messageAuthor,
    };

    this.settings.waypoints.push(waypoint);
    this.saveSettings();
    this._triggerPanelRefresh();

    this._toast(`${shadow.name} stationed at message in ${label}`, "success");
  }

  // ── Persistence ────────────────────────────────────────────────────────

  initBackupPath() {
    return initBackupPath(this);
  }

  loadSettings() {
    return loadSettings(this, this.defaultSettings, {
      pluginId: SE_PLUGIN_ID,
    });
  }

  /** Debounced save — batches rapid actions (sort/navigate/mark) into one write */
  saveSettings() {
    return saveSettings(this);
  }

  _flushSaveSettings() {
    return flushSaveSettings(this, {
      pluginId: SE_PLUGIN_ID,
      version: SE_VERSION,
    });
  }

  readFileBackup() {
    return readFileBackup(this);
  }

  writeFileBackup(data) {
    return writeFileBackup(this, data);
  }

  debugError(system, ...args) {
    console.error(`[ShadowExchange][${system}]`, ...args);
  }

  // ── Public API (for cross-plugin integration) ─────────────────────────

  /**
   * Returns a Set of shadow IDs currently stationed at waypoints.
   * Other plugins (e.g., Dungeons) should exclude these from battle deployment.
   */
  getMarkedShadowIds() {
    if (!this._markedShadowIdsCache) {
      this._markedShadowIdsCache = new Set(
        (this.settings?.waypoints || [])
          .map((w) => w.shadowId)
          .filter(Boolean)
      );
    }
    return this._markedShadowIdsCache;
  }

  isShadowMarked(shadowId) {
    return this.getMarkedShadowIds().has(shadowId);
  }

  /** O(1) waypoint lookup by channelId+messageId (cached Map, invalidated on save) */
  _getWaypointByLocation(channelId, messageId) {
    if (!this._waypointByLocationCache) {
      this._waypointByLocationCache = new Map();
      for (const w of this.settings?.waypoints || []) {
        this._waypointByLocationCache.set(`${w.channelId}:${w.messageId || ''}`, w);
      }
    }
    return this._waypointByLocationCache.get(`${channelId}:${messageId || ''}`) || null;
  }

  // ── Shadow Assignment ────────────────────────────────────────────────

  async getWeakestAvailableShadow() {
    if (!BdApi.Plugins.isEnabled("ShadowArmy")) return this.getFallbackShadow();
    const saPlugin = BdApi.Plugins.get("ShadowArmy");
    const saInstance = saPlugin?.instance;

    if (!saInstance || typeof saInstance.getAllShadows !== "function") {
      return this.getFallbackShadow();
    }

    try {
      // CROSS-PLUGIN SNAPSHOT: Use ShadowArmy's shared snapshot if fresh, else fall back to IDB
      const allShadows = saInstance.getShadowSnapshot?.() || await saInstance.getAllShadows();
      if (!Array.isArray(allShadows) || allShadows.length === 0) {
        return this.getFallbackShadow();
      }

      const available = allShadows.filter((s) => s?.id && !this.isShadowMarked(s.id));

      if (available.length === 0) {
        return this.getFallbackShadow();
      }

      const withPower = available.map((shadow) => {
        let power = 0;
        try {
          if (typeof saInstance.getShadowEffectiveStats === "function") {
            const stats = saInstance.getShadowEffectiveStats(shadow);
            power = Object.values(stats).reduce((sum, v) => sum + (Number(v) || 0), 0);
          } else {
            power = Number(shadow.strength) || 0;
          }
        } catch (_) {
          power = Number(shadow.strength) || 0;
        }
        return { shadow, power };
      });

      withPower.sort((a, b) => a.power - b.power);

      const weakest = withPower[0].shadow;
      return {
        id: weakest.id,
        name: weakest.roleName || weakest.role || "Shadow Soldier",
        rank: weakest.rank || "E",
        source: "army",
      };
    } catch (err) {
      console.error("[ShadowExchange] Shadow query failed:", err);
      return this.getFallbackShadow();
    }
  }

  getFallbackShadow() {
    const pool = FALLBACK_SHADOWS;
    const assignedNames = new Set(this.settings.waypoints.map((w) => w.shadowName));
    const available = pool.filter((s) => !assignedNames.has(s.name));
    if (available.length > 0) return { ...available[0], id: `fallback_${Date.now()}`, source: "fallback" };

    this.fallbackIdx += 1;
    return {
      id: `fallback_${Date.now()}`,
      name: `Shadow Soldier #${this.fallbackIdx}`,
      rank: "E",
      source: "fallback",
    };
  }

  async getAvailableShadowCount() {
    if (!BdApi.Plugins.isEnabled("ShadowArmy")) {
      return Math.max(0, FALLBACK_SHADOWS.length - this.settings.waypoints.length);
    }
    const saPlugin = BdApi.Plugins.get("ShadowArmy");
    const saInstance = saPlugin?.instance;
    if (!saInstance || typeof saInstance.getAllShadows !== "function") {
      return Math.max(0, FALLBACK_SHADOWS.length - this.settings.waypoints.length);
    }
    try {
      // CROSS-PLUGIN SNAPSHOT: Use ShadowArmy's shared snapshot if fresh, else fall back to IDB
      const all = saInstance.getShadowSnapshot?.() || await saInstance.getAllShadows();
      return all.filter((s) => s?.id && !this.isShadowMarked(s.id)).length;
    } catch (_) {
      return 0;
    }
  }

  // ── Location Detection ─────────────────────────────────────────────────

  _parseCurrentLocationFromUrl(url) {
    const match = url.match(/channels\/(@me|(\d+))\/(\d+)(?:\/(\d+))?/);
    if (!match) return null;

    const [, guildIdOrMe, guildIdNum, channelId, messageId] = match;
    return {
      guildId: guildIdOrMe === "@me" ? null : guildIdNum || guildIdOrMe,
      channelId,
      messageId: messageId || null,
    };
  }

  _resolveCurrentChannelMetadata(channelId, guildId) {
    let channelName = "Unknown";
    let locationType = "channel";
    try {
      const channel = this.ChannelStore?.getChannel(channelId);
      if (!channel) return { channelName, locationType };
      channelName = channel.name || (channel.recipients?.length ? "DM" : "Unknown");
      if (channel.isThread && channel.isThread()) locationType = "thread";
      else if (!guildId) locationType = "dm";
    } catch (error) {
      this.debugError("Location", "Failed to resolve channel metadata for current location", error);
    }
    return { channelName, locationType };
  }

  _resolveCurrentGuildName(guildId) {
    if (!guildId) return "Direct Messages";
    let guildName = "Unknown Server";
    try {
      const guild = this.GuildStore?.getGuild(guildId);
      if (guild) guildName = guild.name;
    } catch (error) {
      this.debugError("Location", "Failed to resolve guild metadata for current location", error);
    }
    return guildName;
  }

  getCurrentLocation() {
    const parsed = this._parseCurrentLocationFromUrl(window.location.href);
    if (!parsed) return null;

    const { guildId, channelId, messageId } = parsed;
    const { channelName, locationType: baseType } = this._resolveCurrentChannelMetadata(channelId, guildId);
    const guildName = this._resolveCurrentGuildName(guildId);
    const locationType = messageId ? "message" : baseType;

    return { guildId, channelId, messageId, channelName, guildName, locationType };
  }

  // ── Marking ────────────────────────────────────────────────────────────

  async markCurrentLocation() {
    const loc = this.getCurrentLocation();
    if (!loc) {
      this._toast("Navigate to a channel first", "warning");
      return;
    }

    const dup = this._getWaypointByLocation(loc.channelId, loc.messageId);
    if (dup) {
      this._toast(`Already marked: ${dup.label}`, "warning");
      return;
    }

    const shadow = await this.getWeakestAvailableShadow();
    if (!shadow) {
      this._toast("No shadows available!", "error");
      return;
    }

    const label =
      loc.guildId
        ? `${loc.guildName} \u00BB #${loc.channelName}`
        : `DM \u00BB ${loc.channelName}`;

    const waypoint = {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      locationType: loc.locationType,
      guildId: loc.guildId,
      channelId: loc.channelId,
      messageId: loc.messageId,
      shadowId: shadow.id,
      shadowName: shadow.name,
      shadowRank: shadow.rank,
      createdAt: Date.now(),
      lastVisited: null,
      visitCount: 0,
      channelName: loc.channelName,
      guildName: loc.guildName,
      messagePreview: "",
      messageAuthor: "",
    };

    this.settings.waypoints.push(waypoint);
    this.saveSettings();
    this._triggerPanelRefresh();

    this._toast(`${shadow.name} stationed at ${label}`, "success");
  }

  removeWaypoint(waypointId) {
    const idx = this.settings.waypoints.findIndex((w) => w.id === waypointId);
    if (idx === -1) return;
    const wp = this.settings.waypoints[idx];
    this.settings.waypoints.splice(idx, 1);
    this.saveSettings();
    this._triggerPanelRefresh();
    this._toast(`${wp.shadowName} recalled from ${wp.label}`, "info");
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  teleportTo(waypointId) {
    const wp = this.settings.waypoints.find((w) => w.id === waypointId);
    if (!wp) return;

    let url = "/channels/";
    url += wp.guildId || "@me";
    url += `/${wp.channelId}`;
    if (wp.messageId) url += `/${wp.messageId}`;

    // Close panel first so target channel is visible during reveal.
    this.closePanel();

    wp.lastVisited = Date.now();
    wp.visitCount = (wp.visitCount || 0) + 1;
    this.saveSettings();

    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      _ensureShadowPortalCoreApplied(this.constructor);
    }

    // Fail-safe: do not throw if shared core failed to load.
    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      this.debugError("Teleport", "Shared portal core missing; using direct navigation fallback");
      if (this._NavigationUtils?.transitionTo) {
        this._NavigationUtils.transitionTo(url);
      } else if (window.history?.pushState) {
        window.history.pushState({}, "", url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      this._toast(`Exchanged to ${wp.label}`, "warning", 2500);
      return;
    }

    this.playTransition(() => {
      const fadeToken = this._beginChannelViewFadeOut();
      this._navigate(url, {
        waypointId: wp.id,
        waypointLabel: wp.label,
        channelId: wp.channelId,
      }, {
        onConfirmed: () => this._finishChannelViewFade(fadeToken, true),
        onFailed: () => this._finishChannelViewFade(fadeToken, false),
      });
    }, url);

    this._toast(`Exchanged to ${wp.label}`, "success", 2500);
  }

  // ── Panel refresh bridge (imperative → React) ─────────────────────────

  _triggerPanelRefresh() {
    if (this._panelForceUpdate) {
      this._panelForceUpdate();
    }
  }

  // ── Swirl Icon (channel-header anchored) ───────────────────────────────

  _getChannelHeaderToolbar() {
    // PERF: find visible channel header host first, then query toolbar inside it.
    const hosts = document.querySelectorAll('[aria-label="Channel header"], [class*="titleWrapper_"], header');
    for (const host of hosts) {
      if (host.offsetParent === null) continue;
      const node = host.querySelector('[class*="toolbar_"]');
      if (!node || node.offsetParent === null) continue;
      return node;
    }
    return null;
  }

  _attachSwirlIconToHeader(icon = null) {
    const targetIcon = icon || document.getElementById(SE_SWIRL_ID);
    if (!targetIcon) return false;

    const toolbar = this._getChannelHeaderToolbar();
    if (!toolbar) return false;

    if (targetIcon.parentElement !== toolbar) {
      toolbar.appendChild(targetIcon);
    }
    targetIcon.classList.remove("se-swirl-icon--hidden");
    return true;
  }

  _showToolbarTooltip(icon, tooltipId, label) {
    const tip = typeof _SLUtils?.getOrCreateOverlay === "function"
      ? _SLUtils.getOrCreateOverlay(tooltipId, "sl-toolbar-tip")
      : (() => {
          const existing = document.getElementById(tooltipId);
          if (existing) return existing;
          const created = document.createElement("div");
          created.id = tooltipId;
          created.className = "sl-toolbar-tip";
          (document.body || document.documentElement).appendChild(created);
          return created;
        })();
    const rect = icon.getBoundingClientRect();
    tip.textContent = label;
    tip.style.top = `${rect.top - tip.offsetHeight - 8}px`;
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.classList.add("sl-toolbar-tip--visible");
  }

  _hideToolbarTooltip(tooltipId) {
    const tip = document.getElementById(tooltipId);
    if (tip) tip.classList.remove("sl-toolbar-tip--visible");
  }

  _scheduleSwirlIconReinject(delayMs = SWIRL_REINJECT_DELAY_MS) {
    if (this._swirlReinjectTimeout) clearTimeout(this._swirlReinjectTimeout);
    this._swirlReinjectTimeout = setTimeout(() => {
      this._swirlReinjectTimeout = null;
      this.injectSwirlIcon();
    }, delayMs);
  }

  setupSwirlObserver() {
    if (this._layoutBusUnsub) return;

    // PERF(P5-4): Use shared LayoutObserverBus instead of independent MutationObserver
    if (_PluginUtils?.LayoutObserverBus) {
      this._layoutBusUnsub = _PluginUtils.LayoutObserverBus.subscribe('ShadowExchange', () => {
        this._scheduleSwirlIconReinject();
      }, 250);
    }

    this._swirlResizeHandler = () => this._scheduleSwirlIconReinject(80);
    window.addEventListener("resize", this._swirlResizeHandler, { passive: true });

    this._scheduleSwirlIconReinject(60);
  }

  teardownSwirlObserver() {
    // PERF(P5-4): Unsubscribe from shared LayoutObserverBus
    if (this._layoutBusUnsub) {
      this._layoutBusUnsub();
      this._layoutBusUnsub = null;
    }

    if (this._swirlReinjectTimeout) {
      clearTimeout(this._swirlReinjectTimeout);
      this._swirlReinjectTimeout = null;
    }

    if (this._swirlResizeHandler) {
      window.removeEventListener("resize", this._swirlResizeHandler);
      this._swirlResizeHandler = null;
    }
  }

  injectSwirlIcon() {
    let icon = document.getElementById(SE_SWIRL_ID);

    if (!icon) {
      icon = document.createElement("div");
      icon.id = SE_SWIRL_ID;
      icon.className = "se-swirl-icon";
      icon.innerHTML = [
        '<svg viewBox="0 0 512 512" width="18" height="18" xmlns="http://www.w3.org/2000/svg">',
        '<path fill="#b5b5be" d="M298.736 21.016c-99.298 0-195.928 104.647-215.83 233.736-7.074 45.887-3.493 88.68 8.512 124.787-4.082-6.407-7.92-13.09-11.467-20.034-16.516-32.335-24.627-65.378-25-96.272-11.74 36.254-8.083 82.47 14.482 126.643 27.7 54.227 81.563 91.94 139.87 97.502 5.658.725 11.447 1.108 17.364 1.108 99.298 0 195.93-104.647 215.83-233.736 9.28-60.196.23-115.072-22.133-156.506 21.625 21.867 36.56 45.786 44.617 69.496.623-30.408-14.064-65.766-44.21-95.806-33.718-33.598-77.227-50.91-114.995-50.723-2.328-.118-4.67-.197-7.04-.197zm-5.6 36.357c40.223 0 73.65 20.342 95.702 53.533 15.915 42.888 12.51 108.315.98 147.858-16.02 54.944-40.598 96.035-79.77 126.107-41.79 32.084-98.447 24.39-115.874-5.798-1.365-2.363-2.487-4.832-3.38-7.385 11.724 14.06 38.188 14.944 61.817 1.3 25.48-14.71 38.003-40.727 27.968-58.108-10.036-17.384-38.826-19.548-64.307-4.837-9.83 5.676-17.72 13.037-23.14 20.934.507-1.295 1.043-2.59 1.626-3.88-18.687 24.49-24.562 52.126-12.848 72.417 38.702 45.923 98.07 25.503 140.746-6.426 37.95-28.392 72.32-73.55 89.356-131.988 1.265-4.34 2.416-8.677 3.467-13.008-.286 2.218-.59 4.442-.934 6.678-16.807 109.02-98.412 197.396-182.272 197.396-35.644 0-65.954-15.975-87.74-42.71-26.492-48.396-15.988-142.083 4.675-185.15 26.745-55.742 66.133-122.77 134.324-116.804 46.03 4.027 63.098 58.637 39.128 116.22-8.61 20.685-21.192 39.314-36.21 54.313 24.91-16.6 46.72-42.13 59.572-73 23.97-57.583 6.94-113.422-39.13-116.805-85.737-6.296-137.638 58.55-177.542 128.485-9.21 19.9-16.182 40.35-20.977 60.707.494-7.435 1.312-14.99 2.493-22.652C127.67 145.75 209.275 57.373 293.135 57.373z"/>',
        "</svg>",
      ].join("");

      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.togglePanel();
      });

      // Custom themed tooltip (appended to body to avoid overflow clipping)
      icon.addEventListener("mouseenter", () => {
        this._showToolbarTooltip(icon, "sl-toolbar-tip-se", "Shadow Exchange");
      });
      icon.addEventListener("mouseleave", () => {
        this._hideToolbarTooltip("sl-toolbar-tip-se");
      });
    }

    const anchored = this._attachSwirlIconToHeader(icon);
    if (!anchored) {
      if (!icon.parentElement) document.body.appendChild(icon);
      icon.classList.add("se-swirl-icon--hidden");
    }

    this.swirlIcon = icon;
  }

  removeSwirlIcon() {
    const icon = document.getElementById(SE_SWIRL_ID);
    if (icon) icon.remove();
    this.swirlIcon = null;
  }

  // ── Panel (React-rendered) ─────────────────────────────────────────────

  togglePanel() {
    if (this.panelOpen) this.closePanel();
    else this.openPanel();
  }

  /**
   * Get react-dom/client.createRoot (React 18+).
   * Discord uses React 18, which removed ReactDOM.render() in favor of createRoot().
   */
  _getCreateRoot() {
    if (_ReactUtils?.getCreateRoot) return _ReactUtils.getCreateRoot();
    // Minimal inline fallback
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  }

  openPanel() {
    if (this.panelOpen) return;
    this.panelOpen = true;

    try {
      // Create container for React root
      let container = document.getElementById(SE_PANEL_CONTAINER_ID);
      if (!container) {
        container = document.createElement("div");
        container.id = SE_PANEL_CONTAINER_ID;
        container.style.display = "contents";
        document.body.appendChild(container);
      }
      this._panelContainer = container;

      const React = BdApi.React;
      const { WaypointPanel } = this._components;
      const onClose = () => this.closePanel();
      const element = React.createElement(WaypointPanel, { onClose });

      // React 18: createRoot API
      const createRoot = this._getCreateRoot();
      if (createRoot) {
        const root = createRoot(container);
        this._reactRoot = root;
        root.render(element);
        return;
      }

      // React 17 fallback: legacy ReactDOM.render
      const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule(
        (m) => m && m.render && m.unmountComponentAtNode
      );
      if (ReactDOM?.render) {
        ReactDOM.render(element, container);
        return;
      }

      // Last resort: manual DOM rendering (non-React fallback)
      console.error("[ShadowExchange] Neither createRoot nor ReactDOM.render available");
      this.panelOpen = false;
      container.remove();
      this._toast("ShadowExchange: React rendering unavailable", "error");
    } catch (err) {
      console.error("[ShadowExchange] openPanel() failed:", err);
      this.panelOpen = false;
      this._toast("ShadowExchange: panel error", "error");
    }
  }

  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = false;

    // React 18: unmount via root
    if (this._reactRoot) {
      try {
        this._reactRoot.unmount();
      } catch (error) {
        this.debugError("Panel", "Failed to unmount panel React root", error);
      }
      this._reactRoot = null;
    }

    const container = document.getElementById(SE_PANEL_CONTAINER_ID);
    if (container) {
      // React 17 fallback cleanup
      try {
        const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule(
          (m) => m && m.unmountComponentAtNode
        );
        if (ReactDOM?.unmountComponentAtNode) ReactDOM.unmountComponentAtNode(container);
      } catch (error) {
        this.debugError("Panel", "Failed to unmount legacy panel container", error);
      }
      container.remove();
    }
    this._panelContainer = null;
    this._panelForceUpdate = null;
  }

  // ── CSS ────────────────────────────────────────────────────────────────

  injectCSS() {
    const css = getShadowExchangeCss(PORTAL_TRANSITION_CSS);

    try {
      BdApi.DOM.addStyle(SE_STYLE_ID, css);
    } catch (_) {
      const style = document.createElement("style");
      style.id = SE_STYLE_ID;
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  removeCSS() {
    try {
      BdApi.DOM.removeStyle(SE_STYLE_ID);
    } catch (_) {
      const el = document.getElementById(SE_STYLE_ID);
      if (el) el.remove();
    }
  }
};

const _loadShadowPortalCore = () => {
  if (typeof _SLUtils?.loadShadowPortalCore === "function") {
    const mod = _SLUtils.loadShadowPortalCore();
    if (mod?.applyPortalCoreToClass) return mod;
  }
  return typeof window !== "undefined" && window.ShadowPortalCore?.applyPortalCoreToClass
    ? window.ShadowPortalCore
    : null;
};

const SHADOW_PORTAL_CONFIG = {
  transitionId: TRANSITION_ID,
  navigationFailureToast: "Shadow Exchange failed to switch channel",
  contextLabelKeys: ["waypointLabel", "anchorName", "label", "name"],
};

const _ensureShadowPortalCoreApplied = (PluginClass = module.exports) => {
  const core = _loadShadowPortalCore();
  if (!core?.applyPortalCoreToClass) return false;
  core.applyPortalCoreToClass(PluginClass, SHADOW_PORTAL_CONFIG);
  return true;
};

if (!_ensureShadowPortalCoreApplied(module.exports)) {
  console.warn(`[${SE_PLUGIN_ID}] Shared portal core unavailable. Navigation/transition patch will not be shared.`);
}
