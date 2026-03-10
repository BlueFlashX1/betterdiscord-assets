/**
 * @name RulersAuthority
 * @description Telekinetic control over Discord's UI — push, pull, grip, and crush panels and channels. Solo Leveling themed.
 * @version 2.1.2
 * @author BlueFlashX1
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 *
 * ============================================================================
 * RULER'S AUTHORITY — Sung Jin-Woo's Telekinesis (v2)
 * ============================================================================
 *
 * Macro (panel-level): Push/pull sidebar, members list, profile, search
 *   - Hover-to-expand on members list and profile panel
 *   - Resize handles on all panels (drag edge to resize)
 *   - Toolbar icon in channel header
 *
 * Micro (channel-level): Push channels, crush categories, grip DMs
 *   - Right-click context menu integration
 *   - Per-guild persistence with MutationObserver re-render resilience
 *
 * Architecture: Matches CollapsibleUI + Hide Channels core patterns
 *   - Webpack module extraction for CSS class discovery (lazy getters)
 *   - CSS custom properties (--ra-*) for dynamic state management
 *   - Resize handles via ::before pseudo-elements
 *   - Wildcard selector fallbacks when Webpack modules unavailable
 *
 * SkillTree integration: rulers_authority active skill → visual Amplified Mode
 *   (pulsing glow on toolbar icon, purple aura effects)
 */

import {
  RA_PLUGIN_NAME, RA_STYLE_ID, RA_VARS_STYLE_ID, RA_TOOLBAR_ICON_ID,
  RA_STATS_CACHE_TTL, RA_SETTINGS_OPEN_CLASS,
  SIDEBAR_FALLBACKS, MEMBERS_FALLBACKS, PROFILE_FALLBACKS,
  SEARCH_FALLBACKS, TOOLBAR_FALLBACKS, DM_LIST_FALLBACKS,
  PANEL_DEFS, DEFAULT_SETTINGS, _PluginUtils,
} from "./constants";

// ═══════════════════════════════════════════════════════════════════════════
// §2  Webpack Module Definitions (lazy getter pattern — matches CollapsibleUI)
// ═══════════════════════════════════════════════════════════════════════════

// CRITICAL FIX: Use _resolved flags to avoid repeated Webpack lookups.
const _createModules = () => ({
  _members: undefined, _membersResolved: false,
  _sidebar: undefined, _sidebarResolved: false,
  _panel: undefined,   _panelResolved: false,
  _search: undefined,  _searchResolved: false,
  _toolbar: undefined, _toolbarResolved: false,
  _icons: undefined,   _iconsResolved: false,
  _guilds: undefined,  _guildsResolved: false,
  _channels: undefined, _channelsResolved: false,

  get members()  { if (!this._membersResolved)  { this._members  = BdApi.Webpack.getByKeys("membersWrap", "hiddenMembers") || null;               this._membersResolved = true; }  return this._members; },
  get sidebar()  { if (!this._sidebarResolved)  { this._sidebar  = BdApi.Webpack.getByKeys("sidebar", "activityPanel", "sidebarListRounded") || null; this._sidebarResolved = true; }  return this._sidebar; },
  get panel()    { if (!this._panelResolved)    { this._panel    = BdApi.Webpack.getByKeys("outer", "inner", "overlay") || null;                   this._panelResolved = true; }    return this._panel; },
  get search()   { if (!this._searchResolved)   { this._search   = BdApi.Webpack.getByKeys("searchResultsWrap", "stillIndexing", "noResults") || null; this._searchResolved = true; }   return this._search; },
  get toolbar()  { if (!this._toolbarResolved)  { this._toolbar  = BdApi.Webpack.getByKeys("updateIconForeground", "search", "downloadArrow") || null; this._toolbarResolved = true; }  return this._toolbar; },
  get icons()    { if (!this._iconsResolved)    { this._icons    = BdApi.Webpack.getByKeys("selected", "iconWrapper", "clickable", "icon") || null;    this._iconsResolved = true; }    return this._icons; },
  get guilds()   { if (!this._guildsResolved)   { this._guilds   = BdApi.Webpack.getByKeys("chatContent", "noChat", "parentChannelName") || null;      this._guildsResolved = true; }   return this._guilds; },
  get channels() { if (!this._channelsResolved) { this._channels = BdApi.Webpack.getByKeys("channel", "closeIcon", "dm") || null;                     this._channelsResolved = true; } return this._channels; },
});

const _ttl = _PluginUtils?.createTTLCache || (ms => { let v, t = 0; return { get: () => Date.now() - t < ms ? v : null, set: x => { v = x; t = Date.now(); }, invalidate: () => { v = null; t = 0; } }; });

// ═══════════════════════════════════════════════════════════════════════════
// Module imports
// ═══════════════════════════════════════════════════════════════════════════

import { setPluginUtils, isEditableTarget, matchesHotkey } from "./hotkeys";
import { setupResizeHandlers, removeAllResizeStyles } from "./resize";
import {
  togglePanel,
  restorePanelStates,
  getPushedPanelCount,
  setupHoverHandlers,
  setupSettingsGuard,
  setupGuildChangeListener,
  setupSkillTreeListeners,
  setupChannelObserver,
  setupDMObserver,
  setupToolbarObserver,
  teardownToolbarObserver,
  injectToolbarIcon,
  updateToolbarIcon,
  patchContextMenus,
  applyMicroStateForCurrentGuild,
  applyDMGripping,
  restoreAllHiddenChannels,
  restoreAllCrushedCategories,
  clearAllHoverStates,
} from "./panels";
import { updateCSSVars, buildCSS, injectCSS } from "./styles";
import { getSettingsPanel } from "./settings";

// Inject PluginUtils into hotkeys module
setPluginUtils(_PluginUtils);

// ═══════════════════════════════════════════════════════════════════════════
// §5  Core Class
// ═══════════════════════════════════════════════════════════════════════════

module.exports = class RulersAuthority {
  constructor() {
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this._amplifiedMode = false;
    this._amplifiedExpiresAt = 0;

    // Webpack modules (lazy getters — CollapsibleUI pattern)
    this._modules = null;

    // Webpack stores
    this._ChannelStore = null;
    this._GuildStore = null;
    this._SelectedGuildStore = null;
    this._SelectedChannelStore = null;

    // Caches
    this._statsCache = _ttl(RA_STATS_CACHE_TTL);
    this._panelElCache = null;

    // Resolved selectors (built from Webpack modules + fallbacks)
    this._resolvedSelectors = {};

    // AbortController for clean listener teardown (CollapsibleUI pattern)
    this._controller = null;

    // Observers
    this._channelObserver = null;
    this._dmObserver = null;
    this._toolbarObserver = null;
    this._settingsObserver = null;
    this._iconReinjectTimeout = null;

    // Hover timers
    this._sidebarRevealTimer = null;
    this._sidebarHideTimer = null;
    this._membersRevealTimer = null;
    this._membersHideTimer = null;
    this._profileRevealTimer = null;
    this._profileHideTimer = null;
    this._channelRevealTimer = null;
    this._channelHideTimer = null;
    this._channelsHoverRevealActive = false;

    // SkillTree event handlers
    this._onSkillActivated = null;
    this._onSkillExpired = null;

    // Animation timers
    this._pushAnimTimer = null;
    this._pullAnimTimer = null;

    // Resize state
    this._dragging = null;
    this._dragPanel = null;

    // Guild + channel change handlers
    this._guildChangeHandler = null;
    this._channelChangeHandler = null;
    this._guildChangeApplyTimer = null;
    this._channelObserverRetryTimer = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  start() {
    this._toast = _PluginUtils?.createToastHelper?.("rulersAuthority") || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
    try {
      this._controller = new AbortController();
      this.loadSettings();
      this.initWebpack();
      setupSettingsGuard(this);
      injectCSS(this);
      updateCSSVars(this);
      restorePanelStates(this);
      injectToolbarIcon(this);
      setupToolbarObserver(this);
      patchContextMenus(this);
      this.setupHotkeyListener();
      setupHoverHandlers(this);
      setupResizeHandlers(this);
      setupChannelObserver(this);
      setupGuildChangeListener(this);
      setupSkillTreeListeners(this);
      applyMicroStateForCurrentGuild(this);
      applyDMGripping(this);
      setupDMObserver(this);
      this._toast("Ruler's Authority \u2014 Active", "info");
    } catch (err) {
      this.debugError("Lifecycle", "Error during start:", err);
      this._toast("Ruler's Authority \u2014 Failed to start", "error");
    }
  }

  stop() {
    try {
      // 1. Clear all timers first (prevents callbacks on stopped plugin).
      this._clearLifecycleTimers();

      // 2. Abort all listeners registered via AbortController.
      if (this._controller) {
        this._controller.abort();
        this._controller = null;
      }

      // 3. Remove body classes and visual state.
      this._resetBodyVisualState();

      // 4. Remove CSS.
      BdApi.DOM.removeStyle(RA_STYLE_ID);
      BdApi.DOM.removeStyle(RA_VARS_STYLE_ID);

      // 5. Remove toolbar icon + tooltip.
      const icon = document.getElementById(RA_TOOLBAR_ICON_ID);
      if (icon) icon.remove();
      const raTip = document.getElementById("sl-toolbar-tip-ra");
      if (raTip) raTip.remove();
      teardownToolbarObserver(this);

      // 6. Unpatch context menus.
      if (this._unpatchChannelCtx) { this._unpatchChannelCtx(); this._unpatchChannelCtx = null; }

      // 7. Disconnect observers + guard interval.
      this._disconnectObserversAndGuards();

      // 8. SkillTree listeners.
      this._detachSkillTreeListeners();

      // 9. Guild + channel change listeners.
      this._detachStoreListeners();

      // 10. Restore hidden channels.
      restoreAllHiddenChannels();
      restoreAllCrushedCategories();

      // 11. Remove resize inline styles.
      removeAllResizeStyles(this);
      document.body.classList.remove(RA_SETTINGS_OPEN_CLASS);

      // 12. Null refs.
      this._resetRuntimeReferences();
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    this._toast("Ruler's Authority \u2014 Dormant", "info");
  }

  _clearLifecycleTimers() {
    const timeoutKeys = [
      "_iconReinjectTimeout",
      "_sidebarRevealTimer",
      "_sidebarHideTimer",
      "_membersRevealTimer",
      "_membersHideTimer",
      "_profileRevealTimer",
      "_profileHideTimer",
      "_channelRevealTimer",
      "_channelHideTimer",
      "_pushAnimTimer",
      "_pullAnimTimer",
      "_guildChangeApplyTimer",
      "_channelObserverRetryTimer",
    ];
    for (const key of timeoutKeys) {
      clearTimeout(this[key]);
      this[key] = null;
    }
  }

  _resetBodyVisualState() {
    for (const panelName of Object.keys(PANEL_DEFS)) {
      document.body.classList.remove(`ra-${panelName}-pushed`, `ra-${panelName}-hover-reveal`);
    }
    document.body.classList.remove("ra-amplified", "ra-pushing", "ra-pulling", "ra-channels-hover-reveal");
    this._channelsHoverRevealActive = false;
  }

  _disconnectObserversAndGuards() {
    if (this._channelObserver) { this._channelObserver.disconnect(); this._channelObserver = null; }
    if (this._dmObserver) { this._dmObserver.disconnect(); this._dmObserver = null; }
    if (this._settingsObserver) { this._settingsObserver.disconnect(); this._settingsObserver = null; }
    if (this._settingsGuardInterval) { clearInterval(this._settingsGuardInterval); this._settingsGuardInterval = null; }
  }

  _detachSkillTreeListeners() {
    if (this._onSkillActivated) {
      document.removeEventListener("SkillTree:activeSkillActivated", this._onSkillActivated);
      this._onSkillActivated = null;
    }
    if (this._onSkillExpired) {
      document.removeEventListener("SkillTree:activeSkillExpired", this._onSkillExpired);
      this._onSkillExpired = null;
    }
  }

  _detachStoreListeners() {
    if (this._guildChangeHandler && this._SelectedGuildStore) {
      this._SelectedGuildStore.removeChangeListener(this._guildChangeHandler);
      this._guildChangeHandler = null;
    }
    if (this._channelChangeHandler && this._SelectedChannelStore) {
      this._SelectedChannelStore.removeChangeListener(this._channelChangeHandler);
      this._channelChangeHandler = null;
    }
  }

  _resetRuntimeReferences() {
    this._ChannelStore = null;
    this._GuildStore = null;
    this._SelectedGuildStore = null;
    this._SelectedChannelStore = null;
    this._statsCache.invalidate();
    this._modules = null;
    this._resolvedSelectors = {};
    this._dragging = null;
    this._dragPanel = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §6  Webpack Init + Dynamic Selectors
  // ═══════════════════════════════════════════════════════════════════════

  initWebpack() {
    const { Webpack } = BdApi;

    // ── Flux stores ──
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._GuildStore = Webpack.getStore("GuildStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._SelectedChannelStore = Webpack.getStore("SelectedChannelStore");

    // ── CSS class modules (lazy getters — CollapsibleUI pattern) ──
    this._modules = _createModules();
    this._builtCSS = null; // invalidate cached CSS on module refresh

    // ── Build resolved selectors from Webpack + fallbacks ──
    this._buildResolvedSelectors();

    this.debugLog("Webpack", "Modules acquired", {
      stores: {
        ChannelStore: !!this._ChannelStore,
        GuildStore: !!this._GuildStore,
        SelectedGuildStore: !!this._SelectedGuildStore,
        SelectedChannelStore: !!this._SelectedChannelStore,
      },
      cssModules: {
        members: !!this._modules.members,
        sidebar: !!this._modules.sidebar,
        panel: !!this._modules.panel,
        search: !!this._modules.search,
        toolbar: !!this._modules.toolbar,
        icons: !!this._modules.icons,
        guilds: !!this._modules.guilds,
      },
    });
  }

  _buildResolvedSelectors() {
    const m = this._modules;

    // For each panel, prefer Webpack-discovered class, fall back to wildcard
    this._resolvedSelectors = {
      sidebar: m.sidebar?.sidebarList
        ? [`.${m.sidebar.sidebarList}`]
        : SIDEBAR_FALLBACKS,

      members: m.members?.membersWrap
        ? [`.${m.members.membersWrap}`]
        : MEMBERS_FALLBACKS,

      profile: m.panel?.outer
        ? [
            ...(m.guilds?.content ? [`.${m.guilds.content} .${m.panel.outer}`] : []),
            `.${m.panel.outer}`,
          ]
        : PROFILE_FALLBACKS,

      search: m.search?.searchResultsWrap
        ? [`.${m.search.searchResultsWrap}`]
        : SEARCH_FALLBACKS,

      toolbar: m.icons?.toolbar
        ? [`.${m.icons.toolbar}`]
        : TOOLBAR_FALLBACKS,

      dmList: DM_LIST_FALLBACKS, // DM list doesn't change often, keep fallbacks
    };

    this.debugLog("Selectors", "Resolved selectors", {
      sidebar: m.sidebar?.sidebarList ? "webpack" : "fallback",
      members: m.members?.membersWrap ? "webpack" : "fallback",
      profile: m.panel?.outer ? "webpack" : "fallback",
      search: m.search?.searchResultsWrap ? "webpack" : "fallback",
      toolbar: m.icons?.toolbar ? "webpack" : "fallback",
    });
  }

  // Find a DOM element using resolved selectors for a panel
  // PERF: Caches element refs — panel elements rarely change (only on guild/channel switch).
  _findPanelElement(panelName) {
    const cached = this._panelElCache?.[panelName];
    if (cached && cached.isConnected) return cached;
    const selectors = this._resolvedSelectors[panelName];
    if (!selectors) return null;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.isConnected) {
        if (!this._panelElCache) this._panelElCache = {};
        this._panelElCache[panelName] = el;
        return el;
      }
    }
    if (this._panelElCache) this._panelElCache[panelName] = null;
    return null;
  }

  // ── Delegated methods (call module functions with `this` context) ──

  togglePanel(panelName) { togglePanel(this, panelName); }
  updateCSSVars() { updateCSSVars(this); }
  updateToolbarIcon() { updateToolbarIcon(this); }

  setupHotkeyListener() {
    if (!this._controller) return;
    document.addEventListener("keydown", (e) => {
      if (isEditableTarget(e.target)) return;

      for (const [panelName, config] of Object.entries(this.settings.panels)) {
        if (config.hotkey && matchesHotkey(e, config.hotkey)) {
          e.preventDefault();
          e.stopPropagation();
          togglePanel(this, panelName);
          return;
        }
      }
    }, { capture: true, signal: this._controller.signal });
  }

  getSettingsPanel() { return getSettingsPanel(this); }

  // ═══════════════════════════════════════════════════════════════════════
  // §18  Utilities
  // ═══════════════════════════════════════════════════════════════════════

  loadSettings() {
    try {
      const saved = BdApi.Data.load(RA_PLUGIN_NAME, "settings") || {};
      this.settings = this._deepMerge(DEFAULT_SETTINGS, saved);
      if (!Array.isArray(this.settings.grippedDMs)) this.settings.grippedDMs = [];
      if (typeof this.settings.guilds !== "object" || this.settings.guilds === null) this.settings.guilds = {};
      if (!this.settings.defaultWidths) this.settings.defaultWidths = { ...DEFAULT_SETTINGS.defaultWidths };
      if (!this.settings.panels || typeof this.settings.panels !== "object") {
        this.settings.panels = structuredClone(DEFAULT_SETTINGS.panels);
      }
      for (const [panelName, def] of Object.entries(PANEL_DEFS)) {
        if (!this.settings.panels[panelName] || typeof this.settings.panels[panelName] !== "object") {
          this.settings.panels[panelName] = structuredClone(DEFAULT_SETTINGS.panels[panelName] || {});
        }
        if (def.hoverCapable && typeof this.settings.panels[panelName].hoverExpand !== "boolean") {
          this.settings.panels[panelName].hoverExpand = true;
        }
      }
      // Migration: old default reveal delay (120ms) caused accidental panel opens.
      if (this.settings.hoverRevealDelayMs === 120) {
        this.settings.hoverRevealDelayMs = DEFAULT_SETTINGS.hoverRevealDelayMs;
      }
      if (!Number.isFinite(this.settings.hoverRevealDelayMs) || this.settings.hoverRevealDelayMs < 0) {
        this.settings.hoverRevealDelayMs = DEFAULT_SETTINGS.hoverRevealDelayMs;
      }
      if (!Number.isFinite(this.settings.hoverHideDelayMs) || this.settings.hoverHideDelayMs < 0) {
        this.settings.hoverHideDelayMs = DEFAULT_SETTINGS.hoverHideDelayMs;
      }
    } catch (_) {
      this.settings = structuredClone(DEFAULT_SETTINGS);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save(RA_PLUGIN_NAME, "settings", this.settings);
    } catch (err) {
      this.debugError("Settings", "Failed to save:", err);
    }
  }

  // ── DOM Helpers ──

  _findElement(selectorArray) {
    for (const selector of selectorArray) {
      const el = document.querySelector(selector);
      if (el && el.isConnected) return el;
    }
    return null;
  }

  _isInsideElement(mouseEvent, element, fudgePx = 0) {
    const rect = element.getBoundingClientRect();
    return (
      mouseEvent.clientX >= rect.left - fudgePx &&
      mouseEvent.clientX <= rect.right + fudgePx &&
      mouseEvent.clientY >= rect.top - fudgePx &&
      mouseEvent.clientY <= rect.bottom + fudgePx
    );
  }

  // ── General Helpers ──

  _throttle(fn, wait) {
    if (_PluginUtils?.createThrottle) return _PluginUtils.createThrottle(fn, wait);
    let lastTime = 0;
    let timer = null;
    return function (...args) {
      const now = Date.now();
      const remaining = wait - (now - lastTime);
      if (remaining <= 0) { clearTimeout(timer); timer = null; lastTime = now; fn(...args); }
      else if (!timer) { timer = setTimeout(() => { lastTime = Date.now(); timer = null; fn(...args); }, remaining); }
    };
  }

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === "object" &&
        !Array.isArray(target[key])
      ) {
        result[key] = this._deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  debugLog(tag, msg, data) {
    if (!this.settings.debugMode) return;
    console.log(`[${RA_PLUGIN_NAME}][${tag}]`, msg, data || "");
  }

  debugError(tag, msg, err) {
    console.error(`[${RA_PLUGIN_NAME}][${tag}]`, msg, err || "");
  }
};
