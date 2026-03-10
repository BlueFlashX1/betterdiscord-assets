/**
 * TABLE OF CONTENTS
 * 1) Bootstrap + Constants
 * 2) React Components (AnchorCard/AnchorPanel)
 * 3) Plugin Lifecycle + Webpack
 * 4) Settings + Anchor CRUD
 * 5) Navigation + Transition
 * 6) Hotkey + Panel Mount
 * 7) Styles + Settings Panel UI
 * 8) Diagnostics + Shared Portal Core
 */

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

// ─── Constants ──────────────────────────────────────────────────────────────
const PLUGIN_NAME = "ShadowStep";
const PLUGIN_VERSION = "1.0.1";
const STYLE_ID = "shadow-step-css";
const PANEL_CONTAINER_ID = "ss-panel-root";
const TRANSITION_ID = "ss-transition-overlay";
const BASE_MAX_ANCHORS = 10;
const AGI_BONUS_DIVISOR = 20; // 1 extra slot per 20 AGI
const STATS_CACHE_TTL = 5000;

const DEFAULT_SETTINGS = {
  anchors: [],
  hotkey: "Ctrl+Shift+S",
  animationEnabled: true,
  respectReducedMotion: false,
  animationDuration: 550,
  maxAnchors: BASE_MAX_ANCHORS,
  sortBy: "manual",
  debugMode: false,
};

// ─── Hotkey Utilities (from BetterDiscordPluginUtils) ────────────────────────
let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

let _SLUtils;
try { _SLUtils = _bdLoad("SoloLevelingUtils.js") || window.SoloLevelingUtils || null; } catch (_) { _SLUtils = window.SoloLevelingUtils || null; }

let _TransitionCleanupUtils;
try { _TransitionCleanupUtils = _bdLoad("TransitionCleanupUtils.js"); } catch (_) { _TransitionCleanupUtils = null; }

const { isEditableTarget, matchesHotkey } = _PluginUtils || {
  isEditableTarget: (t) => { if (!t) return false; const tag = t.tagName?.toLowerCase?.() || ""; return tag === "input" || tag === "textarea" || tag === "select" || !!t.isContentEditable; },
  matchesHotkey: () => false,
};
const _ttl = _PluginUtils?.createTTLCache || (ms => { let v, t = 0; return { get: () => Date.now() - t < ms ? v : null, set: x => { v = x; t = Date.now(); }, invalidate: () => { v = null; t = 0; } }; });
const { buildComponents } = require("./components");
const { buildShadowStepSettingsPanel } = require("./settings-panel");

// ─── Plugin Class ───────────────────────────────────────────────────────────

module.exports = class ShadowStep {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._NavigationUtils = null;
    this._ChannelStore = null;
    this._GuildStore = null;
    this._SelectedGuildStore = null;
    this._transitionNavTimeout = null;
    this._transitionCleanupTimeout = null;
    this._transitionRunId = 0;
    this._transitionStopCanvas = null;
    this._navigateRetryTimers = new Set();
    this._navigateRequestId = 0;
    this._channelFadeToken = 0;
    this._channelFadeResetTimer = null;
    this._unpatchContextMenu = null;
    this._hotkeyHandler = null;
    this._panelReactRoot = null;
    this._panelForceUpdate = null;
    this._panelOpen = false;
    this._components = null;
    this._statsCache = _ttl(STATS_CACHE_TTL);
    this._settingsSaveTimer = null;
  }

  // ── Lifecycle ───────────────────────────────────────────────

  start() {
    this._toast = _PluginUtils?.createToastHelper?.("shadowStep") || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
    this.loadSettings();
    this.initWebpack();
    this._components = buildComponents(BdApi, this);
    this.injectCSS();
    this.patchContextMenu();
    this._registerHotkey();
    this._pruneStaleAnchors();
    this._toast(`${PLUGIN_NAME} v${PLUGIN_VERSION} \u2014 Shadows ready`, "info");
  }

  stop() {
    try {
      // 1. Close panel
      this.closePanel();

      // 2. Unpatch context menu
      if (this._unpatchContextMenu) {
        try {
          this._unpatchContextMenu();
        } catch (error) {
          this.debugError("ContextMenu", "Failed to unpatch context menu", error);
        }
        this._unpatchContextMenu = null;
      }

      // 3. Unregister hotkey
      this._unregisterHotkey();

      // 4. Stop and remove any active transition
      _TransitionCleanupUtils?.cancelPendingTransition?.(this);
      // Fallback timer cleanup if TransitionCleanupUtils unavailable
      if (this._transitionNavTimeout) { clearTimeout(this._transitionNavTimeout); this._transitionNavTimeout = null; }
      if (this._transitionCleanupTimeout) { clearTimeout(this._transitionCleanupTimeout); this._transitionCleanupTimeout = null; }

      // 5. Clear any queued navigation retries
      _TransitionCleanupUtils?.clearNavigateRetries?.(this);
      // Fallback: clear retry timers directly
      if (this._navigateRetryTimers?.size) { for (const t of this._navigateRetryTimers) clearTimeout(t); this._navigateRetryTimers.clear(); }

      // 6. Clear channel view fade state
      _TransitionCleanupUtils?.cancelChannelViewFade?.(this);
      if (this._channelFadeResetTimer) { clearTimeout(this._channelFadeResetTimer); this._channelFadeResetTimer = null; }

      // 7. Remove CSS
      this.removeCSS();

      // 8. Clear refs
      this._components = null;
      this._NavigationUtils = null;
      this._ChannelStore = null;
      this._GuildStore = null;
      this._SelectedGuildStore = null;
      this._statsCache.invalidate();
      this._cssCache = null;
      this._flushScheduledSettingsSave();
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    this._toast(`${PLUGIN_NAME} \u2014 Anchors dormant`, "info");
  }

  // ── Webpack ─────────────────────────────────────────────────

  initWebpack() {
    const { Webpack } = BdApi;
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._GuildStore = Webpack.getStore("GuildStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._NavigationUtils =
      Webpack.getByKeys("transitionTo", "back", "forward") ||
      Webpack.getModule((m) => m.transitionTo && m.back && m.forward);
    this.debugLog("Webpack", "Modules acquired", {
      ChannelStore: !!this._ChannelStore,
      GuildStore: !!this._GuildStore,
      SelectedGuildStore: !!this._SelectedGuildStore,
      NavigationUtils: !!this._NavigationUtils,
    });
  }

  // ── Settings ────────────────────────────────────────────────

  loadSettings() {
    try {
      if (typeof _PluginUtils?.loadSettings === "function") {
        this.settings = _PluginUtils.loadSettings(PLUGIN_NAME, DEFAULT_SETTINGS);
      } else {
        const saved = BdApi.Data.load(PLUGIN_NAME, "settings") || {};
        this.settings = { ...DEFAULT_SETTINGS, ...saved };
      }
      // Ensure anchors is always an array
      if (!Array.isArray(this.settings.anchors)) this.settings.anchors = [];
    } catch (_) {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    this._rebuildAnchorIndex();
  }

  saveSettings() {
    try {
      if (typeof _PluginUtils?.saveSettings === "function") {
        _PluginUtils.saveSettings(PLUGIN_NAME, this.settings);
      } else {
        BdApi.Data.save(PLUGIN_NAME, "settings", this.settings);
      }
    } catch (err) {
      this.debugError("Settings", "Failed to save:", err);
    }
  }

  scheduleSaveSettings(delayMs = 180) {
    if (this._settingsSaveTimer) clearTimeout(this._settingsSaveTimer);
    this._settingsSaveTimer = setTimeout(() => {
      this._settingsSaveTimer = null;
      this.saveSettings();
    }, delayMs);
  }

  _flushScheduledSettingsSave() {
    if (!this._settingsSaveTimer) return;
    clearTimeout(this._settingsSaveTimer);
    this._settingsSaveTimer = null;
    this.saveSettings();
  }

  // ── Context Menu ────────────────────────────────────────────

  patchContextMenu() {
    try {
      if (this._unpatchContextMenu) {
        try { this._unpatchContextMenu(); } catch (_) {}
        this._unpatchContextMenu = null;
      }
      this._unpatchContextMenu = BdApi.ContextMenu.patch("channel-context", (tree, props) => {
        if (!props || !props.channel) return;
        const channel = props.channel;
        const channelId = channel.id;
        const guildId = channel.guild_id || null;

        const isAnchored = this.hasAnchor(channelId);
        const separator = BdApi.ContextMenu.buildItem({ type: "separator" });

        let menuItem;
        if (isAnchored) {
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: "Uproot Shadow Anchor",
            id: "shadow-step-remove",
            action: () => {
              const anchor = this.settings.anchors.find((a) => a.channelId === channelId);
              if (anchor) {
                this.removeAnchor(anchor.id);
                this._toast(`Uprooted anchor: #${anchor.channelName}`, "info");
              }
            },
          });
        } else {
          const maxAnchors = this.getMaxAnchors();
          const atMax = this.settings.anchors.length >= maxAnchors;
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: atMax
              ? `Shadow Anchor (${this.settings.anchors.length}/${maxAnchors})`
              : "Plant Shadow Anchor",
            id: "shadow-step-add",
            disabled: atMax,
            action: () => {
              if (atMax) return;
              this.addAnchor(channelId, guildId);
            },
          });
        }

        const children = tree?.props?.children;
        if (Array.isArray(children)) {
          children.push(separator, menuItem);
        }
      });
      this.debugLog("ContextMenu", "Patched channel-context");
    } catch (err) {
      this.debugError("ContextMenu", "Failed to patch:", err);
    }
  }

  // ── Anchor CRUD ─────────────────────────────────────────────

  addAnchor(channelId, guildId) {
    if (this.hasAnchor(channelId)) {
      this._toast("Channel already anchored", "warning");
      return;
    }
    const maxAnchors = this.getMaxAnchors();
    if (this.settings.anchors.length >= maxAnchors) {
      this._toast(`Max anchors reached (${maxAnchors})`, "warning");
      return;
    }

    const channel = this._ChannelStore?.getChannel(channelId);
    const guild = guildId ? this._GuildStore?.getGuild(guildId) : null;

    const anchor = {
      id: `sa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: channel?.name || "unknown",
      guildId: guildId || null,
      channelId,
      guildName: guild?.name || (guildId ? "Unknown Server" : "DM"),
      channelName: channel?.name || "unknown",
      createdAt: Date.now(),
      lastUsed: null,
      useCount: 0,
      sortOrder: this.settings.anchors.length,
    };

    this.settings.anchors = [...this.settings.anchors, anchor];
    this._rebuildAnchorIndex();
    this.saveSettings();
    if (this._panelForceUpdate) this._panelForceUpdate();
    this._toast(`Shadow Anchor planted: #${anchor.channelName}`, "success");
    this.debugLog("Anchor", "Added:", anchor.name, anchor.channelId);
  }

  removeAnchor(anchorId) {
    this.settings.anchors = this.settings.anchors.filter((a) => a.id !== anchorId);
    // Re-index sortOrder
    this.settings.anchors.forEach((a, i) => { a.sortOrder = i; });
    this._rebuildAnchorIndex();
    this.saveSettings();
    if (this._panelForceUpdate) this._panelForceUpdate();
    this.debugLog("Anchor", "Removed:", anchorId);
  }

  renameAnchor(anchorId, newName) {
    const anchor = this.settings.anchors.find((a) => a.id === anchorId);
    if (anchor) {
      anchor.name = newName;
      this.saveSettings();
      this.debugLog("Anchor", "Renamed:", anchorId, "->", newName);
    }
  }

  hasAnchor(channelId) {
    return this._anchoredChannelIds?.has(channelId) ?? this.settings.anchors.some((a) => a.channelId === channelId);
  }

  _rebuildAnchorIndex() {
    this._anchoredChannelIds = new Set(this.settings.anchors.map((a) => a.channelId));
  }

  getMaxAnchors() {
    const base = this.settings.maxAnchors || BASE_MAX_ANCHORS;
    const agi = this._getAgiStat();
    return base + Math.floor(agi / AGI_BONUS_DIVISOR);
  }

  _pruneStaleAnchors() {
    if (!this._ChannelStore) return;
    const before = this.settings.anchors.length;
    this.settings.anchors = this.settings.anchors.filter((a) => {
      const ch = this._ChannelStore.getChannel(a.channelId);
      return !!ch;
    });
    const pruned = before - this.settings.anchors.length;
    if (pruned > 0) {
      this.settings.anchors.forEach((a, i) => { a.sortOrder = i; });
      this._rebuildAnchorIndex();
      this.saveSettings();
      this.debugLog("Prune", `Removed ${pruned} stale anchors`);
    }
  }

  // ── Stats Integration ───────────────────────────────────────

  _getAgiStat() {
    const cached = this._statsCache.get();
    if (cached !== null) {
      return cached.agility || 0;
    }
    try {
      const soloPlugin = BdApi.Plugins.get("SoloLevelingStats");
      if (!soloPlugin?.instance) {
        this._statsCache.set({ agility: 0 });
        return 0;
      }
      const stats =
        soloPlugin.instance.getTotalEffectiveStats?.() ||
        soloPlugin.instance.settings?.stats ||
        {};
      this._statsCache.set(stats);
      return stats.agility || 0;
    } catch (_) {
      this._statsCache.set({ agility: 0 });
      return 0;
    }
  }

  // ── Navigation ──────────────────────────────────────────────

  teleportTo(anchorId) {
    const anchor = this.settings.anchors.find((a) => a.id === anchorId);
    if (!anchor) {
      this._toast("Anchor not found", "error");
      return;
    }

    const channelExists = this._ChannelStore?.getChannel(anchor.channelId);
    if (!channelExists) {
      this.removeAnchor(anchor.id);
      this._toast("Anchor is stale and was removed", "warning");
      this.debugLog("Teleport", "Blocked stale anchor", anchor.id, anchor.channelId);
      return;
    }

    const path = anchor.guildId
      ? `/channels/${anchor.guildId}/${anchor.channelId}`
      : `/channels/@me/${anchor.channelId}`;

    // Close panel first
    this.closePanel();

    // Update usage stats
    anchor.lastUsed = Date.now();
    anchor.useCount = (anchor.useCount || 0) + 1;
    this.saveSettings();

    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      _ensureShadowPortalCoreApplied(this.constructor);
    }

    // Fail-safe: never crash teleport if shared core failed to load.
    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      this.debugError("Teleport", "Shared portal core missing; using direct navigation fallback");
      if (this._NavigationUtils?.transitionTo) {
        this._NavigationUtils.transitionTo(path);
      } else if (window.history?.pushState) {
        window.history.pushState({}, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      this._toast(`Shadow Step \u2192 #${anchor.channelName}`, "warning");
      return;
    }

    // Play transition then navigate
    const _ssT0 = performance.now();
    const _ssDiag = this.settings.debugMode
      ? (phase) => console.log(`%c[PortalDiag:ShadowStep]%c ${phase} %c@ ${Math.round(performance.now() - _ssT0)}ms`, "color:#f59e0b;font-weight:bold", "color:#e2e8f0", "color:#94a3b8")
      : () => {};
    _ssDiag(`TELEPORT_START → ${anchor.name} (${path})`);

    this.playTransition(() => {
      _ssDiag("NAV_CALLBACK_ENTERED (playTransition fired callback)");
      const fadeToken = this._beginChannelViewFadeOut();
      _ssDiag("CHANNEL_FADE_OUT_STARTED");
      this._navigate(path, {
        anchorId: anchor.id,
        anchorName: anchor.name,
        channelId: anchor.channelId,
      }, {
        onConfirmed: () => {
          _ssDiag("NAVIGATE_CONFIRMED (Discord switched)");
          this._finishChannelViewFade(fadeToken, true);
          _ssDiag("CHANNEL_FADE_IN_STARTED (success)");
        },
        onFailed: () => {
          _ssDiag("NAVIGATE_FAILED");
          this._finishChannelViewFade(fadeToken, false);
          _ssDiag("CHANNEL_FADE_IN_STARTED (failure)");
        },
      });
    }, path);

    this._toast(`Shadow Step \u2192 #${anchor.channelName}`, "success");
    this.debugLog("Teleport", anchor.name, path);
  }

  // ── Hotkey ──────────────────────────────────────────────────

  _registerHotkey() {
    const isMac = navigator.platform?.startsWith("Mac") || navigator.userAgent?.includes("Mac");
    this._hotkeyHandler = (e) => {
      if (!this.settings.hotkey) return;
      if (isEditableTarget(e.target)) return;
      // On macOS, also match Cmd (metaKey) when hotkey specifies Ctrl
      const directMatch = matchesHotkey(e, this.settings.hotkey);
      const macAlias = isMac && e.metaKey && !e.ctrlKey && matchesHotkey(
        { key: e.key, ctrlKey: true, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: false },
        this.settings.hotkey
      );
      if (directMatch || macAlias) {
        e.preventDefault();
        e.stopPropagation();
        this.togglePanel();
      }
    };
    document.addEventListener("keydown", this._hotkeyHandler);
    this.debugLog("Hotkey", `Registered: ${this.settings.hotkey} (macOS Cmd alias: ${isMac})`);
  }

  _unregisterHotkey() {
    if (this._hotkeyHandler) {
      document.removeEventListener("keydown", this._hotkeyHandler);
      this._hotkeyHandler = null;
    }
  }

  // ── Panel ───────────────────────────────────────────────────

  togglePanel() {
    if (this._panelOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  openPanel() {
    if (this._panelOpen) return;

    const container = document.createElement("div");
    container.id = PANEL_CONTAINER_ID;
    document.body.appendChild(container);

    const createRoot = BdApi.ReactDOM?.createRoot;
    if (createRoot) {
      const root = createRoot(container);
      root.render(
        BdApi.React.createElement(this._components.AnchorPanel, {
          onClose: () => this.closePanel(),
        })
      );
      this._panelReactRoot = root;
    } else {
      // React 17 fallback
      BdApi.ReactDOM.render(
        BdApi.React.createElement(this._components.AnchorPanel, {
          onClose: () => this.closePanel(),
        }),
        container
      );
      this._panelReactRoot = "legacy";
    }

    this._panelOpen = true;
    this.debugLog("Panel", "Opened");
  }

  closePanel() {
    if (!this._panelOpen) return;

    if (this._panelReactRoot === "legacy") {
      const container = document.getElementById(PANEL_CONTAINER_ID);
      if (container) BdApi.ReactDOM.unmountComponentAtNode(container);
    } else if (this._panelReactRoot) {
      try {
        this._panelReactRoot.unmount();
      } catch (error) {
        this.debugError("Panel", "Failed to unmount panel React root", error);
      }
    }
    this._panelReactRoot = null;

    const container = document.getElementById(PANEL_CONTAINER_ID);
    if (container) container.remove();

    this._panelOpen = false;
    this._panelForceUpdate = null;
    this.debugLog("Panel", "Closed");
  }

  // ── CSS ─────────────────────────────────────────────────────

  injectCSS() {
    try {
      BdApi.DOM.addStyle(STYLE_ID, this.buildCSS());
    } catch (_) {
      try {
        if (!document.getElementById(STYLE_ID)) {
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = this.buildCSS();
          document.head.appendChild(style);
        }
      } catch (err) {
        this.debugError("CSS", "Failed to inject:", err);
      }
    }
  }

  removeCSS() {
    try {
      BdApi.DOM.removeStyle(STYLE_ID);
    } catch (_) {
      try {
        const el = document.getElementById(STYLE_ID);
        if (el) el.remove();
      } catch (err) {
        this.debugError("CSS", "Failed to remove:", err);
      }
    }
  }

  buildCSS() {
    if (this._cssCache) return this._cssCache;
    return (this._cssCache = `
/* ═══════════════════════════════════════════════════════════════
   ShadowStep v${PLUGIN_VERSION} — Shadow Anchor Teleportation
   ═══════════════════════════════════════════════════════════════ */

/* ── Transition Animation ────────────────────────────────────── */

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

/* ── Panel Overlay ───────────────────────────────────────────── */

.ss-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 100001;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ss-fade-in 150ms ease;
}

@keyframes ss-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.ss-panel-container {
  background: #1e1e2e;
  border: 1px solid rgba(138, 43, 226, 0.4);
  border-radius: 2px;
  width: 420px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(138, 43, 226, 0.15);
  overflow: hidden;
}

/* ── Panel Header ────────────────────────────────────────────── */

.ss-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(138, 43, 226, 0.2);
}

.ss-panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #8a2be2;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.5px;
}

.ss-panel-close {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 2px;
  transition: color 0.15s ease, background 0.15s ease;
}
.ss-panel-close:hover { color: #fff; background: rgba(138, 43, 226, 0.2); }

/* ── Search ──────────────────────────────────────────────────── */

.ss-panel-search {
  margin: 10px 16px 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(138, 43, 226, 0.2);
  border-radius: 2px;
  color: #ddd;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s ease;
}
.ss-panel-search:focus {
  border-color: rgba(138, 43, 226, 0.5);
}
.ss-panel-search::placeholder { color: #666; }

/* ── Sort Controls ───────────────────────────────────────────── */

.ss-panel-sort {
  display: flex;
  gap: 4px;
  padding: 6px 16px;
}

.ss-sort-btn {
  background: none;
  border: 1px solid transparent;
  color: #777;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.ss-sort-btn:hover { color: #aaa; }
.ss-sort-active {
  color: #8a2be2;
  border-color: rgba(138, 43, 226, 0.3);
  background: rgba(138, 43, 226, 0.08);
}

/* ── Anchor List ─────────────────────────────────────────────── */

.ss-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
  min-height: 80px;
  max-height: 45vh;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

.ss-panel-list::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
.ss-panel-list::-webkit-scrollbar-track { background: transparent !important; }
.ss-panel-list::-webkit-scrollbar-thumb {
  background: transparent !important;
  border: none !important;
}

.ss-panel-empty {
  text-align: center;
  color: #666;
  padding: 24px 16px;
  font-size: 13px;
  line-height: 1.5;
}

.ss-anchor-group {
  margin-bottom: 8px;
}

.ss-anchor-group:last-child {
  margin-bottom: 0;
}

.ss-anchor-group-header {
  color: #9f9faf;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 6px 10px 4px;
}

/* ── Anchor Card ─────────────────────────────────────────────── */

.ss-anchor-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.15s ease;
  margin-bottom: 2px;
}
.ss-anchor-card:hover {
  background: rgba(138, 43, 226, 0.12);
}
.ss-anchor-card:active {
  background: rgba(138, 43, 226, 0.2);
}

.ss-anchor-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.25), rgba(75, 0, 130, 0.4));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.ss-anchor-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.ss-anchor-name {
  color: #ddd;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-anchor-server {
  color: #777;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-anchor-rename-input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(138, 43, 226, 0.4);
  border-radius: 2px;
  color: #ddd;
  font-size: 13px;
  padding: 2px 6px;
  outline: none;
  width: 100%;
}

.ss-anchor-remove {
  background: none;
  border: none;
  color: #555;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 2px;
  transition: color 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
  opacity: 0;
}
.ss-anchor-card:hover .ss-anchor-remove { opacity: 1; }
.ss-anchor-remove:hover {
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

/* ── Panel Footer ────────────────────────────────────────────── */

.ss-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid rgba(138, 43, 226, 0.2);
  color: #777;
  font-size: 11px;
}

.ss-panel-hint { color: #555; }
`);
  }

  // ── Settings Panel ──────────────────────────────────────────

  getSettingsPanel() {
    return buildShadowStepSettingsPanel(BdApi, this, {
      baseMaxAnchors: BASE_MAX_ANCHORS,
      agiBonusDivisor: AGI_BONUS_DIVISOR,
    });
  }

  // ── Debug ───────────────────────────────────────────────────

  debugLog(tag, ...args) {
    if (this.settings.debugMode) {
      console.log(`%c[${PLUGIN_NAME}]%c [${tag}]`, "color: #8a2be2; font-weight: bold", "color: #999", ...args);
    }
  }

  debugError(tag, ...args) {
    console.error(`[${PLUGIN_NAME}] [${tag}]`, ...args);
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
  navigationFailureToast: "Shadow Step failed to switch channel",
  contextLabelKeys: ["anchorName", "label", "name"],
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
