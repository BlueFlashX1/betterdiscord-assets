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

const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
let _EmbeddedShadowPortalCore;
try { _EmbeddedShadowPortalCore = require("../ShadowPortalCore"); } catch (_) { _EmbeddedShadowPortalCore = null; }

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
try { _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

let _SLUtils;
try { _SLUtils = loadBdModuleFromPlugins("SoloLevelingUtils.js") || window.SoloLevelingUtils || null; } catch (_) { _SLUtils = window.SoloLevelingUtils || null; }

let _TransitionCleanupUtils;
try { _TransitionCleanupUtils = loadBdModuleFromPlugins("TransitionCleanupUtils.js"); } catch (_) { _TransitionCleanupUtils = null; }

const { isEditableTarget: _sharedIsEditableTarget, matchesHotkey: _sharedMatchesHotkey } = require("../shared/hotkeys");
const { createToast } = require("../shared/toast");
const { getNavigationUtils } = require("../shared/navigation");
const isEditableTarget = _PluginUtils?.isEditableTarget || _sharedIsEditableTarget;
const matchesHotkey = _PluginUtils?.matchesHotkey || _sharedMatchesHotkey;
const _ttl = _PluginUtils?.createTTLCache || (ms => { let v, t = 0; return { get: () => Date.now() - t < ms ? v : null, set: x => { v = x; t = Date.now(); }, invalidate: () => { v = null; t = 0; } }; });
const { buildComponents } = require("./components");
const { buildShadowStepSettingsPanel } = require("./settings-panel");
const { getShadowStepCss } = require("./styles");

// ─── Plugin Class ───────────────────────────────────────────────────────────

module.exports = class ShadowStep {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._toast = () => {};
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
    this._stepResourcesActive = false;
    this._onSkillLevelChanged = null;
  }

  // ── SkillTree gate helpers ──────────────────────────────────

  _isShadowExchangeUnlocked() {
    try {
      return (BdApi.Plugins.get("SkillTree")?.instance?.getSkillLevel("shadow_exchange") || 0) >= 1;
    } catch (_) { return false; }
  }

  // ── Lifecycle ───────────────────────────────────────────────

  start() {
    this.stop(false);
    this._toast = _PluginUtils?.createToastHelper?.("shadowStep") || createToast();

    // ── SkillTree gate: shadow_exchange >= 1 ──
    this._onSkillLevelChanged = (e) => {
      if (e.detail?.skillId !== "shadow_exchange") return;
      const level = e.detail.level || 0;
      if (level >= 1 && !this._stepResourcesActive) {
        this._activateStepResources();
      } else if (level < 1 && this._stepResourcesActive) {
        this._deactivateStepResources();
      }
    };
    document.addEventListener("SkillTree:skillLevelChanged", this._onSkillLevelChanged);

    if (this._isShadowExchangeUnlocked()) {
      this._activateStepResources();
    } else {
      this._toast("ShadowStep awaiting Shadow Exchange unlock", "info");
    }
  }

  _activateStepResources() {
    if (this._stepResourcesActive) return;
    this._stepResourcesActive = true;
    this.loadSettings();
    this.initWebpack();
    this._components = buildComponents(BdApi, this);
    this.injectCSS();
    this.patchContextMenu();
    this._registerHotkey();
    this._pruneStaleAnchors();
    this._toast(`${PLUGIN_NAME} v${PLUGIN_VERSION} \u2014 Shadows ready`, "info");
  }

  _deactivateStepResources() {
    if (!this._stepResourcesActive) return;
    this._stepResourcesActive = false;
    this._teardownStepRuntime();
    this._toast("Shadow Exchange revoked \u2014 anchors dormant", "info");
  }

  _teardownStepRuntime() {
    this.closePanel();
    if (this._unpatchContextMenu) {
      try { this._unpatchContextMenu(); } catch (_) {}
      this._unpatchContextMenu = null;
    }
    this._unregisterHotkey();
    _TransitionCleanupUtils?.cancelPendingTransition?.(this);
    if (this._transitionNavTimeout) { clearTimeout(this._transitionNavTimeout); this._transitionNavTimeout = null; }
    if (this._transitionCleanupTimeout) { clearTimeout(this._transitionCleanupTimeout); this._transitionCleanupTimeout = null; }
    _TransitionCleanupUtils?.clearNavigateRetries?.(this);
    if (this._navigateRetryTimers?.size) { for (const t of this._navigateRetryTimers) clearTimeout(t); this._navigateRetryTimers.clear(); }
    _TransitionCleanupUtils?.cancelChannelViewFade?.(this);
    if (this._channelFadeResetTimer) { clearTimeout(this._channelFadeResetTimer); this._channelFadeResetTimer = null; }
    this.removeCSS();
    this._components = null;
    this._NavigationUtils = null;
    this._ChannelStore = null;
    this._GuildStore = null;
    this._SelectedGuildStore = null;
    this._statsCache.invalidate();
    this._cssCache = null;
    this._flushScheduledSettingsSave();
  }

  stop(showToast = true) {
    try {
      // Remove skill listener
      if (this._onSkillLevelChanged) {
        document.removeEventListener("SkillTree:skillLevelChanged", this._onSkillLevelChanged);
        this._onSkillLevelChanged = null;
      }
      // Tear down resources if active
      if (this._stepResourcesActive) {
        this._stepResourcesActive = false;
      }
      this._teardownStepRuntime();
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    if (showToast) this._toast(`${PLUGIN_NAME} \u2014 Anchors dormant`, "info");
  }

  // ── Webpack ─────────────────────────────────────────────────

  initWebpack() {
    const { Webpack } = BdApi;
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._GuildStore = Webpack.getStore("GuildStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._NavigationUtils = getNavigationUtils();
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
    this._unregisterHotkey();
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
    if (!this._components) this._components = buildComponents(BdApi, this);
    if (!this._components?.AnchorPanel) {
      this.debugError("Panel", "Cannot open panel: AnchorPanel component unavailable");
      return;
    }

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
    this._cssCache = getShadowStepCss(PLUGIN_VERSION);
    return this._cssCache;
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
  // Primary path: bundled src module (esbuild-resolved) so runtime does not
  // depend on external plugin-folder loading.
  if (_EmbeddedShadowPortalCore?.applyPortalCoreToClass) {
    return _EmbeddedShadowPortalCore;
  }
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
