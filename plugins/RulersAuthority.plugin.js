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
 *
 * Sections:
 *   §1  Constants + Fallback Selectors .................. ~L 40
 *   §2  Webpack Module Definitions ...................... ~L 90
 *   §3  Default Settings ................................ ~L 140
 *   §4  Hotkey Utilities ................................ ~L 190
 *   §5  Core Class (constructor, start, stop) ........... ~L 230
 *   §6  Webpack Init + Dynamic Selectors ................ ~L 360
 *   §7  Inter-Plugin Integration (SLS, SkillTree) ....... ~L 440
 *   §8  Macro Panel Control ............................. ~L 510
 *   §9  Hover-to-Expand System .......................... ~L 570
 *   §10 Resize Handle System ............................ ~L 680
 *   §11 Micro: Push Channel + Crush Category ............ ~L 760
 *   §12 Micro: Grip DM ................................. ~L 910
 *   §13 Context Menu Patches ............................ ~L 990
 *   §14 Toolbar Icon + Observer ......................... ~L 1080
 *   §15 Visual Effects .................................. ~L 1190
 *   §16 Settings Panel .................................. ~L 1230
 *   §17 CSS Builder (custom props + dynamic selectors) .. ~L 1400
 *   §18 Utilities ....................................... ~L 1660
 */

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

// ═══════════════════════════════════════════════════════════════════════════
// §1  Constants + Fallback Selectors
// ═══════════════════════════════════════════════════════════════════════════

const RA_PLUGIN_NAME = "RulersAuthority";
const RA_VERSION = "2.1.2";
const RA_STYLE_ID = "rulers-authority-css";
const RA_VARS_STYLE_ID = "rulers-authority-vars";
const RA_TOOLBAR_ICON_ID = "ra-toolbar-icon";
const RA_ICON_REINJECT_DELAY_MS = 140;
const RA_STATS_CACHE_TTL = 5000;
const RA_OBSERVER_THROTTLE_MS = 200;
const RA_RESIZE_MIN_WIDTH = 80;
const RA_SETTINGS_OPEN_CLASS = "ra-settings-open";

// Fallback selectors — used when Webpack module extraction fails.
// These use wildcard attribute selectors (less precise but always work).
const SIDEBAR_FALLBACKS = [
  'nav[aria-label="Channels sidebar"]',
  'nav[aria-label="Channels"]',
  '[class*="sidebar_"][class*="container_"]',
  '[class*="sidebar_"]',
];

// CSS-safe subset — excludes the broad [class*="sidebar_"] which also matches
// the settings modal's navigation sidebar, causing it to collapse to width:0.
// The first 3 selectors are specific enough for CSS targeting.
const SIDEBAR_CSS_SAFE = SIDEBAR_FALLBACKS.slice(0, -1);

const MEMBERS_FALLBACKS = [
  '[class^="membersWrap_"]',
  '[class*=" membersWrap_"]',
  '[class*="membersWrap"]',
];

const PROFILE_FALLBACKS = [
  '[class*="userProfileOuter_"]',
  '[class*="userPanelOuter_"]',
  '[class*="profilePanel_"]',
];

const SEARCH_FALLBACKS = [
  '[class*="searchResultsWrap_"]',
];

const TOOLBAR_FALLBACKS = [
  '[aria-label="Channel header"] [class*="toolbar_"]',
  '[class*="titleWrapper_"] [class*="toolbar_"]',
  'header [class*="toolbar_"]',
];

const DM_LIST_FALLBACKS = [
  '[class*="privateChannels_"] [class*="scroller_"]',
  '[class*="privateChannels_"] [role="list"]',
];

// ═══════════════════════════════════════════════════════════════════════════
// §2  Webpack Module Definitions (lazy getter pattern — matches CollapsibleUI)
// ═══════════════════════════════════════════════════════════════════════════
//
// Each getter calls BdApi.Webpack.getByKeys() once and caches the result.
// Key combinations are chosen to uniquely identify CSS class modules.
// If Discord changes their module structure, these degrade gracefully to null
// and the fallback selectors in §1 take over.

// CRITICAL FIX: Use _resolved flags to avoid repeated Webpack lookups.
// getByKeys() can return null/undefined for missing modules — we must cache
// that result rather than re-querying on every access.
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

// Panel definition — label, hover support, which Webpack module + property to use
const PANEL_DEFS = {
  sidebar: { label: "Channel Sidebar", hoverCapable: true, moduleName: "sidebar", moduleKey: "sidebarList" },
  members: { label: "Members List",    hoverCapable: true,  moduleName: "members", moduleKey: "membersWrap" },
  profile: { label: "User Profile",    hoverCapable: true,  moduleName: "panel",   moduleKey: "outer" },
  search:  { label: "Search Results",  hoverCapable: false, moduleName: "search",  moduleKey: "searchResultsWrap" },
};

// ═══════════════════════════════════════════════════════════════════════════
// §3  Default Settings
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_SETTINGS = {
  enabled: true,
  debugMode: false,
  transitionSpeed: 250,
  animationsEnabled: true,

  // Panel states + widths
  panels: {
    sidebar: { pushed: false, hotkey: "Ctrl+Shift+R", hoverExpand: true, width: 0 },
    members: { pushed: false, hotkey: "", hoverExpand: true, width: 0 },
    profile: { pushed: false, hotkey: "", hoverExpand: true, width: 0 },
    search:  { pushed: false, hotkey: "", width: 0 },
  },

  // Default panel widths (used for reset)
  defaultWidths: {
    sidebar: 240,
    members: 245,
    profile: 340,
    search: 400,
  },

  // Hover config
  hoverFudgePx: 15,
  hoverRevealDelayMs: 120,
  hoverHideDelayMs: 300,

  // Per-guild micro state
  guilds: {},
  // { [guildId]: { hiddenChannels: [{ id, name }], crushedCategories: [{ id, name }] } }

  // DM gripping
  grippedDMs: [],
  // [{ channelId, username }]
};

// ═══════════════════════════════════════════════════════════════════════════
// §4  Hotkey Utilities (from BetterDiscordPluginUtils)
// ═══════════════════════════════════════════════════════════════════════════
let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

const { isEditableTarget, matchesHotkey } = _PluginUtils || {
  isEditableTarget: (t) => { if (!t) return false; const tag = t.tagName?.toLowerCase?.() || ""; return tag === "input" || tag === "textarea" || tag === "select" || !!t.isContentEditable; },
  matchesHotkey: () => false,
};
const _ttl = _PluginUtils?.createTTLCache || (ms => { let v, t = 0; return { get: () => Date.now() - t < ms ? v : null, set: x => { v = x; t = Date.now(); }, invalidate: () => { v = null; t = 0; } }; });

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
    try {
      this._controller = new AbortController();
      this.loadSettings();
      this.initWebpack();
      this.setupSettingsGuard();
      this.injectCSS();
      this.updateCSSVars();
      this.restorePanelStates();
      this.injectToolbarIcon();
      this.setupToolbarObserver();
      this.patchContextMenus();
      this.setupHotkeyListener();
      this.setupHoverHandlers();
      this.setupResizeHandlers();
      this.setupChannelObserver();
      this.setupGuildChangeListener();
      this.setupSkillTreeListeners();
      this.applyMicroStateForCurrentGuild();
      this.applyDMGripping();
      this.setupDMObserver();
      BdApi.UI.showToast("Ruler's Authority — Active", { type: "info" });
    } catch (err) {
      this.debugError("Lifecycle", "Error during start:", err);
      BdApi.UI.showToast("Ruler's Authority — Failed to start", { type: "error" });
    }
  }

  stop() {
    try {
      // 1. Clear all timers FIRST (prevents callbacks firing on stopped plugin)
      clearTimeout(this._iconReinjectTimeout);
      this._iconReinjectTimeout = null;
      clearTimeout(this._sidebarRevealTimer);
      clearTimeout(this._sidebarHideTimer);
      clearTimeout(this._membersRevealTimer);
      clearTimeout(this._membersHideTimer);
      clearTimeout(this._profileRevealTimer);
      clearTimeout(this._profileHideTimer);
      clearTimeout(this._channelRevealTimer);
      clearTimeout(this._channelHideTimer);
      clearTimeout(this._pushAnimTimer);
      clearTimeout(this._pullAnimTimer);
      clearTimeout(this._guildChangeApplyTimer);
      clearTimeout(this._channelObserverRetryTimer);

      // 2. Abort all listeners registered via AbortController
      if (this._controller) {
        this._controller.abort();
        this._controller = null;
      }

      // 3. Remove body classes
      for (const panelName of Object.keys(PANEL_DEFS)) {
        document.body.classList.remove(`ra-${panelName}-pushed`, `ra-${panelName}-hover-reveal`);
      }
      document.body.classList.remove("ra-amplified", "ra-pushing", "ra-pulling", "ra-channels-hover-reveal");
      this._channelsHoverRevealActive = false;

      // 4. Remove CSS
      BdApi.DOM.removeStyle(RA_STYLE_ID);
      BdApi.DOM.removeStyle(RA_VARS_STYLE_ID);

      // 5. Remove toolbar icon
      const icon = document.getElementById(RA_TOOLBAR_ICON_ID);
      if (icon) icon.remove();
      this.teardownToolbarObserver();

      // 6. Unpatch context menus
      if (this._unpatchChannelCtx) { this._unpatchChannelCtx(); this._unpatchChannelCtx = null; }

      // 7. Disconnect observers
      if (this._channelObserver) { this._channelObserver.disconnect(); this._channelObserver = null; }
      if (this._dmObserver) { this._dmObserver.disconnect(); this._dmObserver = null; }
      if (this._settingsObserver) { this._settingsObserver.disconnect(); this._settingsObserver = null; }
      if (this._settingsGuardInterval) { clearInterval(this._settingsGuardInterval); this._settingsGuardInterval = null; }

      // 8. SkillTree listeners
      if (this._onSkillActivated) {
        document.removeEventListener("SkillTree:activeSkillActivated", this._onSkillActivated);
        this._onSkillActivated = null;
      }
      if (this._onSkillExpired) {
        document.removeEventListener("SkillTree:activeSkillExpired", this._onSkillExpired);
        this._onSkillExpired = null;
      }

      // 9. Guild + channel change listeners
      if (this._guildChangeHandler && this._SelectedGuildStore) {
        this._SelectedGuildStore.removeChangeListener(this._guildChangeHandler);
        this._guildChangeHandler = null;
      }
      if (this._channelChangeHandler && this._SelectedChannelStore) {
        this._SelectedChannelStore.removeChangeListener(this._channelChangeHandler);
        this._channelChangeHandler = null;
      }

      // 10. Restore hidden channels
      this.restoreAllHiddenChannels();
      this.restoreAllCrushedCategories();

      // 11. Remove resize inline styles
      this._removeAllResizeStyles();
      document.body.classList.remove(RA_SETTINGS_OPEN_CLASS);

      // 12. Null refs
      this._ChannelStore = null;
      this._GuildStore = null;
      this._SelectedGuildStore = null;
      this._SelectedChannelStore = null;
      this._statsCache.invalidate();
      this._modules = null;
      this._resolvedSelectors = {};
      this._dragging = null;
      this._dragPanel = null;
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    BdApi.UI.showToast("Ruler's Authority — Dormant", { type: "info" });
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

  // Get a CSS selector string for a panel (for use in CSS rules)
  _getCSSSelector(panelName) {
    const m = this._modules;
    switch (panelName) {
      case "sidebar": return m.sidebar?.sidebarList ? `.${m.sidebar.sidebarList}` : SIDEBAR_FALLBACKS[0];
      case "members": return m.members?.membersWrap ? `.${m.members.membersWrap}` : MEMBERS_FALLBACKS[0];
      case "profile":  return m.panel?.outer ? `.${m.panel.outer}` : PROFILE_FALLBACKS[0];
      case "search":   return m.search?.searchResultsWrap ? `.${m.search.searchResultsWrap}` : SEARCH_FALLBACKS[0];
      default: return "";
    }
  }

  // Find a DOM element using resolved selectors for a panel
  // PERF: Caches element refs — panel elements rarely change (only on guild/channel switch).
  // Eliminates up to 4 querySelector() calls per mousemove frame.
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

  // ═══════════════════════════════════════════════════════════════════════
  // §7  Inter-Plugin Integration (SoloLevelingStats, SkillTree)
  // ═══════════════════════════════════════════════════════════════════════

  getSoloLevelingData() {
    const cached = this._statsCache.get();
    if (cached && BdApi.Plugins.isEnabled("SoloLevelingStats")) {
      return cached;
    }
    if (!BdApi.Plugins.isEnabled("SoloLevelingStats")) return null;

    const soloPlugin = BdApi.Plugins.get("SoloLevelingStats");
    const instance = soloPlugin?.instance || soloPlugin;
    if (!instance?.settings) return null;

    const data = {
      level: instance.settings.level || 1,
      intelligence: instance.settings.stats?.intelligence || 0,
      stats: { ...instance.settings.stats },
    };

    this._statsCache.set(data);
    return data;
  }

  setupSkillTreeListeners() {
    this._onSkillActivated = (e) => {
      if (e.detail?.skillId === "rulers_authority") {
        this._amplifiedMode = true;
        this._amplifiedExpiresAt = e.detail.expiresAt || 0;
        this.onAmplifiedModeChange(true);
      }
    };
    this._onSkillExpired = (e) => {
      if (e.detail?.skillId === "rulers_authority") {
        this._amplifiedMode = false;
        this.onAmplifiedModeChange(false);
      }
    };
    document.addEventListener("SkillTree:activeSkillActivated", this._onSkillActivated);
    document.addEventListener("SkillTree:activeSkillExpired", this._onSkillExpired);

    // Check if skill is already active on start
    if (BdApi.Plugins.isEnabled("SkillTree")) {
      const stInstance = BdApi.Plugins.get("SkillTree")?.instance;
      if (stInstance?.isActiveSkillRunning?.("rulers_authority")) {
        this._amplifiedMode = true;
        this.debugLog("SkillTree", "rulers_authority already active on start");
      }
    }
  }

  onAmplifiedModeChange(active) {
    if (active) {
      document.body.classList.add("ra-amplified");
      BdApi.UI.showToast("Ruler's Authority AMPLIFIED — Full telekinetic power!", { type: "success", timeout: 4000 });
    } else {
      document.body.classList.remove("ra-amplified");
      BdApi.UI.showToast("Ruler's Authority amplification expired.", { type: "info" });
    }
    this.updateToolbarIcon();
  }

  setupGuildChangeListener() {
    if (!this._SelectedGuildStore) return;
    this._guildChangeHandler = () => {
      this._panelElCache = null; // Invalidate panel element cache on guild switch
      clearTimeout(this._guildChangeApplyTimer);
      this._guildChangeApplyTimer = setTimeout(() => {
        if (!this._controller) return;
        this.applyMicroStateForCurrentGuild();
        this.setupChannelObserver();
      }, 300);
    };
    this._SelectedGuildStore.addChangeListener(this._guildChangeHandler);

    // Also listen for channel changes within the same guild — Discord can
    // remount the sidebar when navigating to/from forums, stages, threads, etc.
    // This re-applies micro state and reconnects the observer if orphaned.
    if (this._SelectedChannelStore) {
      this._channelChangeHandler = this._throttle(() => {
        if (!this._controller) return;
        this._panelElCache = null;
        this.applyMicroStateForCurrentGuild();
        // Reconnect observer only if it's missing or its target detached
        if (!this._channelObserver) {
          this.setupChannelObserver();
        }
      }, 500); // Throttle to 500ms — channel switches can fire rapidly
      this._SelectedChannelStore.addChangeListener(this._channelChangeHandler);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §8  Macro Panel Control
  // ═══════════════════════════════════════════════════════════════════════

  togglePanel(panelName) {
    const def = PANEL_DEFS[panelName];
    if (!def) return;

    // No tier gating — all panels available immediately
    const isPushed = this.settings.panels[panelName].pushed;
    this.settings.panels[panelName].pushed = !isPushed;

    if (!isPushed) {
      // Capture current width before pushing (for restore)
      const el = this._findPanelElement(panelName);
      if (el && !this.settings.panels[panelName].width) {
        this.settings.panels[panelName].width = el.getBoundingClientRect().width;
      }
      document.body.classList.add(`ra-${panelName}-pushed`);
      this.showPushEffect(panelName);
      this.debugLog("Panel", `Pushed ${panelName}`);
    } else {
      document.body.classList.remove(`ra-${panelName}-pushed`);
      document.body.classList.remove(`ra-${panelName}-hover-reveal`);
      this.showPullEffect(panelName);
      this.debugLog("Panel", `Pulled ${panelName}`);
    }

    this.saveSettings();
    this.updateCSSVars();
    this.updateToolbarIcon();
  }

  restorePanelStates() {
    for (const [panelName, config] of Object.entries(this.settings.panels)) {
      if (config.pushed) {
        document.body.classList.add(`ra-${panelName}-pushed`);
      }
    }
  }

  getPushedPanelCount() {
    return Object.values(this.settings.panels).filter((p) => p.pushed).length;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §9  Hover-to-Expand System
  // ═══════════════════════════════════════════════════════════════════════

  setupHoverHandlers() {
    if (!this._controller) return;

    // Read settings dynamically inside handler so changes take effect immediately
    const handler = this._throttle((e) => {
      if (!this._controller) return; // Guard: plugin stopped
      if (document.body.classList.contains(RA_SETTINGS_OPEN_CLASS)) {
        this._clearAllHoverStates();
        return;
      }
      const sidebarHoverEnabled = this.settings.panels.sidebar.hoverExpand;
      const membersHoverEnabled = this.settings.panels.members.hoverExpand;
      const profileHoverEnabled = this.settings.panels.profile.hoverExpand;
      const currentGuildId = this._SelectedGuildStore?.getGuildId?.();
      const hiddenChannelsCount = currentGuildId
        ? this.settings.guilds?.[currentGuildId]?.hiddenChannels?.length || 0
        : 0;
      const channelHoverEnabled = hiddenChannelsCount > 0;
      if (!sidebarHoverEnabled && !membersHoverEnabled && !profileHoverEnabled && !channelHoverEnabled) {
        this._setHiddenChannelRevealState(false);
        return;
      }

      const fudge = this.settings.hoverFudgePx;
      const revealDelay = this.settings.hoverRevealDelayMs;
      const hideDelay = this.settings.hoverHideDelayMs;
      const viewportWidth = window.innerWidth;

      // ── Channel sidebar hover (left edge) ──
      if (sidebarHoverEnabled && this.settings.panels.sidebar.pushed) {
        const inZone = e.clientX <= fudge;
        const sidebarEl = this._findPanelElement("sidebar");
        const inPanel = sidebarEl ? this._isInsideElement(e, sidebarEl, fudge) : false;

        if (inZone || inPanel) {
          clearTimeout(this._sidebarHideTimer);
          this._sidebarHideTimer = null;
          if (!this._sidebarRevealTimer && !document.body.classList.contains("ra-sidebar-hover-reveal")) {
            this._sidebarRevealTimer = setTimeout(() => {
              this._sidebarRevealTimer = null;
              document.body.classList.add("ra-sidebar-hover-reveal");
            }, revealDelay);
          }
        } else {
          clearTimeout(this._sidebarRevealTimer);
          this._sidebarRevealTimer = null;
          if (!this._sidebarHideTimer && document.body.classList.contains("ra-sidebar-hover-reveal")) {
            this._sidebarHideTimer = setTimeout(() => {
              this._sidebarHideTimer = null;
              document.body.classList.remove("ra-sidebar-hover-reveal");
            }, hideDelay);
          }
        }
      }

      // ── Members list hover (right edge) ──
      if (membersHoverEnabled && this.settings.panels.members.pushed) {
        const distFromRight = viewportWidth - e.clientX;
        const inZone = distFromRight <= fudge;

        const membersEl = this._findPanelElement("members");
        const inPanel = membersEl ? this._isInsideElement(e, membersEl, fudge) : false;

        if (inZone || inPanel) {
          clearTimeout(this._membersHideTimer);
          this._membersHideTimer = null;
          if (!this._membersRevealTimer && !document.body.classList.contains("ra-members-hover-reveal")) {
            this._membersRevealTimer = setTimeout(() => {
              this._membersRevealTimer = null;
              document.body.classList.add("ra-members-hover-reveal");
            }, revealDelay);
          }
        } else {
          clearTimeout(this._membersRevealTimer);
          this._membersRevealTimer = null;
          if (!this._membersHideTimer && document.body.classList.contains("ra-members-hover-reveal")) {
            this._membersHideTimer = setTimeout(() => {
              this._membersHideTimer = null;
              document.body.classList.remove("ra-members-hover-reveal");
            }, hideDelay);
          }
        }
      }

      // ── Profile panel hover (right edge, offset from members) ──
      if (profileHoverEnabled && this.settings.panels.profile.pushed) {
        const profileEl = this._findPanelElement("profile");
        const inPanel = profileEl ? this._isInsideElement(e, profileEl, fudge) : false;

        const distFromRight = viewportWidth - e.clientX;
        const inZone = distFromRight <= fudge && !document.body.classList.contains("ra-members-hover-reveal");

        if (inZone || inPanel) {
          clearTimeout(this._profileHideTimer);
          this._profileHideTimer = null;
          if (!this._profileRevealTimer && !document.body.classList.contains("ra-profile-hover-reveal")) {
            this._profileRevealTimer = setTimeout(() => {
              this._profileRevealTimer = null;
              document.body.classList.add("ra-profile-hover-reveal");
            }, revealDelay);
          }
        } else {
          clearTimeout(this._profileRevealTimer);
          this._profileRevealTimer = null;
          if (!this._profileHideTimer && document.body.classList.contains("ra-profile-hover-reveal")) {
            this._profileHideTimer = setTimeout(() => {
              this._profileHideTimer = null;
              document.body.classList.remove("ra-profile-hover-reveal");
            }, hideDelay);
          }
        }
      }

      // ── Pushed channel hover reveal (channel sidebar region) ──
      if (channelHoverEnabled) {
        const hoverEl = this._getChannelHoverElement();
        const inChannelPanel = hoverEl ? this._isInsideElement(e, hoverEl, fudge) : false;

        if (inChannelPanel) {
          clearTimeout(this._channelHideTimer);
          this._channelHideTimer = null;
          if (!this._channelRevealTimer && !this._channelsHoverRevealActive) {
            this._channelRevealTimer = setTimeout(() => {
              this._channelRevealTimer = null;
              this._setHiddenChannelRevealState(true);
            }, revealDelay);
          }
        } else {
          clearTimeout(this._channelRevealTimer);
          this._channelRevealTimer = null;
          if (!this._channelHideTimer && this._channelsHoverRevealActive) {
            this._channelHideTimer = setTimeout(() => {
              this._channelHideTimer = null;
              this._setHiddenChannelRevealState(false);
            }, hideDelay);
          }
        }
      } else {
        clearTimeout(this._channelRevealTimer);
        clearTimeout(this._channelHideTimer);
        this._channelRevealTimer = null;
        this._channelHideTimer = null;
        this._setHiddenChannelRevealState(false);
      }
    }, 16); // ~60fps throttle

    document.addEventListener("mousemove", handler, {
      passive: true,
      signal: this._controller.signal,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §10  Resize Handle System (CollapsibleUI pattern)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Resize handles are ::before pseudo-elements on the panel itself.
  // mousedown on the panel edge → track mousemove → mouseup commits width.
  // CSS for handles is in §17 buildCSS().

  setupResizeHandlers() {
    if (!this._controller) return;
    const signal = this._controller.signal;

    // ── mousedown: detect drag start (on document for full coverage) ──
    document.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const target = e.target;

      // Check if target matches any panel's resize handle zone
      for (const panelName of Object.keys(PANEL_DEFS)) {
        if (panelName === "sidebar" && document.body.classList.contains(RA_SETTINGS_OPEN_CLASS)) continue;
        const panelEl = this._findPanelElement(panelName);
        if (!panelEl) continue;

        // The ::before pseudo-element click registers on the parent element
        if (target === panelEl || target.parentElement === panelEl) {
          const rect = panelEl.getBoundingClientRect();
          // Only trigger if click is near the resize edge (left edge for right panels, right edge for sidebar)
          const isLeftEdge = panelName !== "sidebar" && e.clientX <= rect.left + 12;
          const isRightEdge = panelName === "sidebar" && e.clientX >= rect.right - 12;

          if (isLeftEdge || isRightEdge) {
            e.preventDefault();
            this._dragging = panelEl;
            this._dragPanel = panelName;
            panelEl.style.setProperty("transition", "none", "important");
            this.debugLog("Resize", `Started dragging ${panelName}`);
          }
        }
      }
    }, { passive: false, signal });

    // ── mousemove: update width while dragging (on document for full coverage) ──
    document.addEventListener("mousemove", (e) => {
      if (!this._dragging || !this._dragPanel) return;

      const rect = this._dragging.getBoundingClientRect();
      let width;

      if (this._dragPanel === "sidebar") {
        // Sidebar: cursor X minus left edge
        width = e.clientX - rect.left;
      } else {
        // Right-side panels: right edge minus cursor X
        width = rect.right - e.clientX;
      }

      // Clamp: min 80px, max 60vw
      width = Math.max(RA_RESIZE_MIN_WIDTH, Math.min(width, window.innerWidth * 0.6));

      this._dragging.style.setProperty("width", `${width}px`, "important");
      this._dragging.style.setProperty("max-width", `${width}px`, "important");
      this._dragging.style.setProperty("min-width", `${width}px`, "important");
    }, { passive: true, signal });

    // ── mouseup: commit width and restore transitions (on document for full coverage) ──
    document.addEventListener("mouseup", (e) => {
      if (!this._dragging || !this._dragPanel) return;
      if (e.button !== 0) return; // Only commit on left-click release

      const panelName = this._dragPanel;
      const dragged = this._dragging;

      // Commit dragged width
      this.settings.panels[panelName].width = parseInt(dragged.style.width, 10) || this.settings.defaultWidths[panelName];

      // Remove inline overrides, let CSS vars take over
      dragged.style.removeProperty("width");
      dragged.style.removeProperty("max-width");
      dragged.style.removeProperty("min-width");

      this.saveSettings();
      this.updateCSSVars();

      // Restore transitions after a tick
      setTimeout(() => {
        dragged.style.removeProperty("transition");
      }, this.settings.transitionSpeed);

      this._dragging = null;
      this._dragPanel = null;
      this.debugLog("Resize", `Committed ${panelName} width: ${this.settings.panels[panelName].width}px`);
    }, { passive: true, signal });
  }

  _removeAllResizeStyles() {
    for (const panelName of Object.keys(PANEL_DEFS)) {
      const el = this._findPanelElement(panelName);
      if (el) {
        el.style.removeProperty("width");
        el.style.removeProperty("max-width");
        el.style.removeProperty("min-width");
        el.style.removeProperty("transition");
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §11  Micro: Push Channel + Crush Category
  // ═══════════════════════════════════════════════════════════════════════

  _getGuildData(guildId) {
    if (!this.settings.guilds[guildId]) {
      this.settings.guilds[guildId] = { hiddenChannels: [], crushedCategories: [] };
    }
    return this.settings.guilds[guildId];
  }

  // ── Push Channel ──

  pushChannel(guildId, channelId, channelName) {
    const guildData = this._getGuildData(guildId);
    if (guildData.hiddenChannels.some((c) => c.id === channelId)) return;
    guildData.hiddenChannels.push({ id: channelId, name: channelName });
    this.applyChannelHiding(guildId);
    this.saveSettings();
    this.debugLog("PushChannel", `Pushed #${channelName} in ${guildId}`);
  }

  recallChannel(guildId, channelId) {
    const guildData = this._getGuildData(guildId);
    guildData.hiddenChannels = guildData.hiddenChannels.filter((c) => c.id !== channelId);
    const el = document.querySelector(`[data-list-item-id="channels___${channelId}"]`);
    if (el) {
      el.style.display = "";
      el.removeAttribute("data-ra-pushed");
    }
    this.applyChannelHiding(guildId);
    this.saveSettings();
    this.debugLog("RecallChannel", `Recalled ${channelId} in ${guildId}`);
  }

  isChannelHidden(guildId, channelId) {
    const guildData = this.settings.guilds[guildId];
    return guildData?.hiddenChannels?.some((c) => c.id === channelId) || false;
  }

  _getChannelHoverElement() {
    const channelTree =
      document.querySelector('ul[aria-label="Channels"]') ||
      document.querySelector('[role="tree"][aria-label="Channels"]') ||
      document.querySelector('[class*="sidebar_"] [role="tree"]');
    if (!channelTree) return null;
    return channelTree.closest('[class*="sidebar_"]') || channelTree;
  }

  _setHiddenChannelRevealState(shouldReveal) {
    const next = !!shouldReveal;
    if (this._channelsHoverRevealActive === next) return;
    this._channelsHoverRevealActive = next;
    document.body.classList.toggle("ra-channels-hover-reveal", next);
    this.applyChannelHiding();
  }

  applyChannelHiding(guildId) {
    const currentGuildId = this._SelectedGuildStore?.getGuildId?.();
    if (guildId && guildId !== currentGuildId) return;

    const effectiveGuildId = guildId || currentGuildId;
    if (!effectiveGuildId) return;
    const guildData = this.settings.guilds[effectiveGuildId];
    const hiddenIds = new Set((guildData?.hiddenChannels || []).map((entry) => String(entry.id)));

    // Clear stale pushed markers first (when channels were recalled or guild changed)
    const pushedEls = document.querySelectorAll("[data-ra-pushed]");
    for (const el of pushedEls) {
      const listId = el.getAttribute("data-list-item-id") || "";
      const channelId = listId.startsWith("channels___")
        ? listId.replace("channels___", "")
        : null;
      if (!channelId || !hiddenIds.has(channelId)) {
        el.style.display = "";
        el.removeAttribute("data-ra-pushed");
      }
    }

    if (hiddenIds.size === 0) {
      this._channelsHoverRevealActive = false;
      document.body.classList.remove("ra-channels-hover-reveal");
      return;
    }

    for (const id of hiddenIds) {
      const el = document.querySelector(`[data-list-item-id="channels___${id}"]`);
      if (el) {
        el.style.display = this._channelsHoverRevealActive ? "" : "none";
        el.setAttribute("data-ra-pushed", "true");
      }
    }
  }

  restoreAllHiddenChannels() {
    const pushed = document.querySelectorAll("[data-ra-pushed]");
    for (const el of pushed) {
      el.style.display = "";
      el.removeAttribute("data-ra-pushed");
    }
    this._channelsHoverRevealActive = false;
    document.body.classList.remove("ra-channels-hover-reveal");
  }

  // ── Crush Category ──

  crushCategory(guildId, categoryId, categoryName) {
    const guildData = this._getGuildData(guildId);
    if (guildData.crushedCategories.some((c) => c.id === categoryId)) return;
    guildData.crushedCategories.push({ id: categoryId, name: categoryName });
    this.applyCategoryCrushing(guildId);
    this.saveSettings();
    this.debugLog("CrushCategory", `Crushed ${categoryName} in ${guildId}`);
  }

  releaseCategory(guildId, categoryId) {
    const guildData = this._getGuildData(guildId);
    guildData.crushedCategories = guildData.crushedCategories.filter((c) => c.id !== categoryId);
    const children = document.querySelectorAll(`[data-ra-category-crushed="${categoryId}"]`);
    for (const el of children) {
      el.style.display = "";
      el.removeAttribute("data-ra-category-crushed");
    }
    const catEl = document.querySelector(`[data-list-item-id="channels___${categoryId}"]`);
    if (catEl) catEl.removeAttribute("data-ra-crushed");
    this.saveSettings();
    this.debugLog("ReleaseCategory", `Released ${categoryId} in ${guildId}`);
  }

  isCategoryCrushed(guildId, categoryId) {
    const guildData = this.settings.guilds[guildId];
    return guildData?.crushedCategories?.some((c) => c.id === categoryId) || false;
  }

  applyCategoryCrushing(guildId) {
    const currentGuildId = this._SelectedGuildStore?.getGuildId?.();
    if (guildId && guildId !== currentGuildId) return;

    const effectiveGuildId = guildId || currentGuildId;
    if (!effectiveGuildId) return;
    const guildData = this.settings.guilds[effectiveGuildId];
    if (!guildData?.crushedCategories?.length) return;

    for (const { id: catId } of guildData.crushedCategories) {
      const catEl = document.querySelector(`[data-list-item-id="channels___${catId}"]`);
      if (!catEl) continue;

      catEl.setAttribute("data-ra-crushed", "true");

      let next = catEl.nextElementSibling;
      let safetyLimit = 200; // Prevent runaway walks (Discord guilds rarely have >200 channels)
      let nonChannelSkips = 0;
      while (next && safetyLimit-- > 0) {
        const listId = next.getAttribute("data-list-item-id") || "";
        if (!listId.startsWith("channels___")) {
          nonChannelSkips++;
          // If we've skipped too many non-channel elements, we've likely crossed into another section
          if (nonChannelSkips > 5) break;
          next = next.nextElementSibling;
          continue;
        }
        nonChannelSkips = 0; // Reset on valid channel element
        const channelId = listId.replace("channels___", "");
        const channel = this._ChannelStore?.getChannel?.(channelId);
        if (!channel || channel.type === 4) break; // Stop at next category or unknown channel
        next.style.display = "none";
        next.setAttribute("data-ra-category-crushed", catId);
        next = next.nextElementSibling;
      }
    }
  }

  restoreAllCrushedCategories() {
    const crushed = document.querySelectorAll("[data-ra-category-crushed]");
    for (const el of crushed) {
      el.style.display = "";
      el.removeAttribute("data-ra-category-crushed");
    }
    const cats = document.querySelectorAll("[data-ra-crushed]");
    for (const el of cats) {
      el.removeAttribute("data-ra-crushed");
    }
  }

  applyMicroStateForCurrentGuild() {
    const guildId = this._SelectedGuildStore?.getGuildId?.();
    if (guildId) {
      this.applyChannelHiding(guildId);
      this.applyCategoryCrushing(guildId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §12  Micro: Grip DM
  // ═══════════════════════════════════════════════════════════════════════

  gripDM(channelId, username) {
    if (this.settings.grippedDMs.some((d) => d.channelId === channelId)) return;
    this.settings.grippedDMs.push({ channelId, username });
    this.applyDMGripping();
    this.saveSettings();
    BdApi.UI.showToast(`Gripped DM: ${username}`, { type: "success" });
    this.debugLog("GripDM", `Gripped ${username} (${channelId})`);
  }

  releaseDM(channelId) {
    this.settings.grippedDMs = this.settings.grippedDMs.filter((d) => d.channelId !== channelId);
    const el = document.querySelector(`[data-list-item-id*="${channelId}"] .ra-grip-indicator`);
    if (el) el.remove();
    this.saveSettings();
    BdApi.UI.showToast("Released DM grip", { type: "info" });
    this.debugLog("ReleaseDM", `Released ${channelId}`);
  }

  isDMGripped(channelId) {
    return this.settings.grippedDMs.some((d) => d.channelId === channelId);
  }

  setupDMObserver() {
    if (this._dmObserver) { this._dmObserver.disconnect(); this._dmObserver = null; }
    if (this.settings.grippedDMs.length === 0) return;

    const dmList = this._findElement(DM_LIST_FALLBACKS);
    if (!dmList) return;

    const throttledGrip = this._throttle(() => {
      if (!this._dmObserver) return;
      this.applyDMGripping();
    }, RA_OBSERVER_THROTTLE_MS);

    this._dmObserver = new MutationObserver(throttledGrip);
    this._dmObserver.observe(dmList, { childList: true, subtree: true });
  }

  applyDMGripping() {
    const dmList = this._findElement(DM_LIST_FALLBACKS);
    if (!dmList) return;

    const header = dmList.querySelector('[class*="searchBar_"]') ||
                   dmList.querySelector('[class*="privateChannelsHeaderContainer_"]') ||
                   dmList.querySelector("h2");
    const insertAfterEl = header?.closest('[class*="listItem_"]') || header?.parentElement || null;

    for (const { channelId } of [...this.settings.grippedDMs].reverse()) {
      const dmEl = dmList.querySelector(`[data-list-item-id*="${channelId}"]`) ||
                   dmList.querySelector(`a[href="/channels/@me/${channelId}"]`)?.closest("[data-list-item-id]");
      if (!dmEl) continue;

      if (!dmEl.querySelector(".ra-grip-indicator")) {
        const indicator = document.createElement("div");
        indicator.className = "ra-grip-indicator";
        indicator.title = "Telekinetic Grip";
        dmEl.style.position = "relative";
        dmEl.appendChild(indicator);
      }

      if (insertAfterEl && insertAfterEl.nextSibling !== dmEl) {
        dmList.insertBefore(dmEl, insertAfterEl.nextSibling);
      } else if (!insertAfterEl && dmList.firstChild !== dmEl) {
        dmList.insertBefore(dmEl, dmList.firstChild);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §13  Context Menu Patches
  // ═══════════════════════════════════════════════════════════════════════

  patchContextMenus() {
    try {
      this._unpatchChannelCtx = BdApi.ContextMenu.patch("channel-context", (tree, props) => {
        if (!props?.channel) return;
        const channel = props.channel;
        const channelId = channel.id;
        const guildId = channel.guild_id || null;

        // ── DM Context: Grip ──
        if (!guildId && (channel.type === 1 || channel.type === 3)) {
          const isGripped = this.isDMGripped(channelId);
          const separator = BdApi.ContextMenu.buildItem({ type: "separator" });
          const item = BdApi.ContextMenu.buildItem({
            type: "text",
            label: isGripped ? "Release Grip" : "Grip DM",
            id: isGripped ? "ra-release-dm" : "ra-grip-dm",
            action: () => {
              if (isGripped) {
                this.releaseDM(channelId);
              } else {
                this.gripDM(channelId, channel.rawRecipients?.[0]?.username || channel.name || "Unknown");
              }
            },
          });
          const children = tree?.props?.children;
          if (Array.isArray(children)) children.push(separator, item);
          return;
        }

        // ── Guild Context: Push Channel / Crush Category ──
        if (!guildId) return;
        const items = [];

        // Category (type === 4): Crush
        if (channel.type === 4) {
          const isCrushed = this.isCategoryCrushed(guildId, channelId);
          items.push({
            type: "text",
            label: isCrushed ? "Release Category" : "Crush Category",
            id: isCrushed ? "ra-release-category" : "ra-crush-category",
            action: () => {
              if (isCrushed) {
                this.releaseCategory(guildId, channelId);
                BdApi.UI.showToast(`Released ${channel.name}`, { type: "info" });
              } else {
                this.crushCategory(guildId, channelId, channel.name);
                BdApi.UI.showToast(`Crushed ${channel.name}`, { type: "success" });
              }
            },
          });
        }

        // Regular channel: Push
        if (channel.type !== 4) {
          const isHidden = this.isChannelHidden(guildId, channelId);
          items.push({
            type: "text",
            label: isHidden ? "Recall Channel" : "Push Channel",
            id: isHidden ? "ra-recall-channel" : "ra-push-channel",
            action: () => {
              if (isHidden) {
                this.recallChannel(guildId, channelId);
                BdApi.UI.showToast(`Recalled #${channel.name}`, { type: "info" });
              } else {
                this.pushChannel(guildId, channelId, channel.name);
                BdApi.UI.showToast(`Pushed #${channel.name}`, { type: "success" });
              }
            },
          });
        }

        if (items.length === 0) return;

        const separator = BdApi.ContextMenu.buildItem({ type: "separator" });
        const submenu = BdApi.ContextMenu.buildItem({
          type: "submenu",
          label: "Ruler's Authority",
          id: "ra-submenu",
          items,
        });

        const children = tree?.props?.children;
        if (Array.isArray(children)) children.push(separator, submenu);
      });
      this.debugLog("ContextMenu", "Patched channel-context");
    } catch (err) {
      this.debugError("ContextMenu", "Failed to patch:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §14  Toolbar Icon + Observer
  // ═══════════════════════════════════════════════════════════════════════

  _getChannelHeaderToolbar() {
    const selectors = this._resolvedSelectors.toolbar || TOOLBAR_FALLBACKS;
    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!node || node.offsetParent === null) continue;
        const host = node.closest('[aria-label="Channel header"], [class*="titleWrapper_"], header');
        if (host && host.offsetParent === null) continue;
        return node;
      }
    }
    return null;
  }

  _attachToolbarIcon(icon) {
    const toolbar = this._getChannelHeaderToolbar();
    if (!toolbar) return false;
    if (icon.parentElement !== toolbar) {
      toolbar.appendChild(icon);
    }
    icon.classList.remove("ra-toolbar-icon--hidden");
    return true;
  }

  injectToolbarIcon() {
    let icon = document.getElementById(RA_TOOLBAR_ICON_ID);

    if (!icon) {
      icon = document.createElement("div");
      icon.id = RA_TOOLBAR_ICON_ID;
      icon.className = "ra-toolbar-icon";
      icon.title = "Ruler's Authority";
      icon.setAttribute("role", "button");
      icon.setAttribute("aria-label", "Ruler's Authority — Toggle Sidebar");
      icon.setAttribute("tabindex", "0");

      // Telekinesis hand SVG
      icon.innerHTML = [
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">',
        '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="rgba(138,43,226,0.12)"/>',
        '<path d="M8 14l-1-5a1.2 1.2 0 012.3-.4L10 12m0 0l.5-5.5a1.2 1.2 0 012.4 0L13 12m0 0l.5-4.5a1.2 1.2 0 012.3.4L15 12" stroke="#9b59b6" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
        '<path d="M15 12l.8-2.5a1.1 1.1 0 012.1.5L17 13c0 2.8-2.2 5-5 5s-5-2.2-5-5l.5-2" stroke="#9b59b6" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
        '<circle cx="12" cy="5" r="1" fill="#b49bff" opacity="0.6"/>',
        '<circle cx="8" cy="7" r="0.6" fill="#b49bff" opacity="0.4"/>',
        '<circle cx="16" cy="7" r="0.6" fill="#b49bff" opacity="0.4"/>',
        "</svg>",
      ].join("");

      // Left click = toggle sidebar (signal for clean teardown)
      const iconSignal = this._controller ? { signal: this._controller.signal } : {};
      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.togglePanel("sidebar");
      }, iconSignal);

      // Right click = cycle through panels
      icon.addEventListener("contextmenu", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.togglePanel("members");
      }, iconSignal);
    }

    this.updateToolbarIcon();

    const anchored = this._attachToolbarIcon(icon);
    if (!anchored) {
      if (!icon.parentElement) document.body.appendChild(icon);
      icon.classList.add("ra-toolbar-icon--hidden");
    }
  }

  updateToolbarIcon() {
    const icon = document.getElementById(RA_TOOLBAR_ICON_ID);
    if (!icon) return;
    const anyPushed = this.getPushedPanelCount() > 0;
    icon.classList.toggle("ra-toolbar-icon--active", anyPushed);
    icon.classList.toggle("ra-toolbar-icon--amplified", this._amplifiedMode);

    icon.title = `Ruler's Authority${anyPushed ? ` (${this.getPushedPanelCount()} pushed)` : ""}${this._amplifiedMode ? " [AMPLIFIED]" : ""}`;
  }

  _scheduleIconReinject(delayMs = RA_ICON_REINJECT_DELAY_MS) {
    if (this._iconReinjectTimeout) clearTimeout(this._iconReinjectTimeout);
    this._iconReinjectTimeout = setTimeout(() => {
      this._iconReinjectTimeout = null;
      this.injectToolbarIcon();
    }, delayMs);
  }

  setupToolbarObserver() {
    if (this._layoutBusUnsub) return;

    // PERF(P5-4): Use shared LayoutObserverBus instead of independent MutationObserver
    if (_PluginUtils?.LayoutObserverBus) {
      this._layoutBusUnsub = _PluginUtils.LayoutObserverBus.subscribe('RulersAuthority', () => {
        const icon = document.getElementById(RA_TOOLBAR_ICON_ID);
        const toolbar = this._getChannelHeaderToolbar();
        if (!icon || !toolbar || icon.parentElement !== toolbar) {
          this._scheduleIconReinject();
        }
      }, 250);
    }

    if (this._controller) {
      window.addEventListener("resize", () => this._scheduleIconReinject(80), {
        passive: true,
        signal: this._controller.signal,
      });
    }

    this._scheduleIconReinject(60);
  }

  teardownToolbarObserver() {
    // PERF(P5-4): Unsubscribe from shared LayoutObserverBus
    if (this._layoutBusUnsub) {
      this._layoutBusUnsub();
      this._layoutBusUnsub = null;
    }
    if (this._iconReinjectTimeout) {
      clearTimeout(this._iconReinjectTimeout);
      this._iconReinjectTimeout = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §15  Visual Effects + Animations
  // ═══════════════════════════════════════════════════════════════════════

  showPushEffect(panelName) {
    if (!this.settings.animationsEnabled) return;
    document.body.classList.add("ra-pushing");
    clearTimeout(this._pushAnimTimer);
    this._pushAnimTimer = setTimeout(() => {
      document.body.classList.remove("ra-pushing");
    }, 500);
  }

  showPullEffect(panelName) {
    if (!this.settings.animationsEnabled) return;
    document.body.classList.add("ra-pulling");
    clearTimeout(this._pullAnimTimer);
    this._pullAnimTimer = setTimeout(() => {
      document.body.classList.remove("ra-pulling");
    }, 350);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §16  Settings Panel
  // ═══════════════════════════════════════════════════════════════════════

  getSettingsPanel() {
    const React = BdApi.React;
    const { useState, useCallback, useReducer } = React;
    const ce = React.createElement;
    const self = this;

    const SettingsPanel = () => {
      const [, forceUpdate] = useReducer((x) => x + 1, 0);
      const [debug, setDebug] = useState(self.settings.debugMode);
      const [transSpeed, setTransSpeed] = useState(self.settings.transitionSpeed);
      const [anims, setAnims] = useState(self.settings.animationsEnabled);

      const slsData = self.getSoloLevelingData();

      const updateSetting = useCallback((key, value) => {
        self.settings[key] = value;
        self.saveSettings();
        forceUpdate();
      }, []);

      // ── Styles ──
      const containerStyle = {
        background: "#1e1e2e", padding: "16px", borderRadius: "8px",
        color: "#ccc", fontFamily: "inherit", fontSize: "14px",
      };
      const sectionStyle = {
        marginBottom: "16px", padding: "12px",
        background: "#252540", borderRadius: "6px",
      };
      const headerStyle = { color: "#b49bff", fontSize: "16px", marginBottom: "8px", fontWeight: "600" };
      const subHeaderStyle = { color: "#9b8ec4", fontSize: "13px", marginBottom: "6px", fontWeight: "500" };
      const labelStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" };
      const dimStyle = { fontSize: "11px", color: "#666", marginTop: "2px" };
      const btnStyle = {
        background: "#9b59b6", border: "none", color: "#fff", padding: "4px 10px",
        borderRadius: "4px", cursor: "pointer", fontSize: "12px", marginRight: "6px", marginBottom: "4px",
      };
      const btnDimStyle = { ...btnStyle, background: "#444" };

      // ── Toggle Helper ──
      const Toggle = ({ label, checked, onChange }) =>
        ce("label", { style: labelStyle },
          ce("span", null, label),
          ce("input", {
            type: "checkbox", checked,
            style: { accentColor: "#9b59b6" },
            onChange: (e) => onChange(e.target.checked),
          })
        );

      // ── Status Display ──
      const StatusSection = () =>
        ce("div", { style: sectionStyle },
          ce("div", { style: headerStyle }, "Ruler's Authority"),
          ce("div", { style: dimStyle },
            slsData ? `INT: ${slsData.intelligence} | Level: ${slsData.level}` : "SoloLevelingStats not detected"
          ),
          self._amplifiedMode && ce("div", { style: { ...dimStyle, color: "#b49bff", marginTop: "4px" } },
            "AMPLIFIED MODE ACTIVE"
          ),
          ce("div", { style: { ...dimStyle, marginTop: "4px" } },
            `Webpack: ${Object.keys(self._resolvedSelectors).filter((k) => {
              const m = self._modules;
              if (k === "sidebar") return !!m.sidebar?.sidebarList;
              if (k === "members") return !!m.members?.membersWrap;
              if (k === "profile") return !!m.panel?.outer;
              if (k === "search") return !!m.search?.searchResultsWrap;
              if (k === "toolbar") return !!m.icons?.toolbar;
              return false;
            }).length}/5 modules resolved`
          )
        );

      // ── Panel Toggles ──
      const PanelSection = () =>
        ce("div", { style: sectionStyle },
          ce("div", { style: subHeaderStyle }, "Panel Controls"),
          Object.entries(PANEL_DEFS).map(([name, def]) =>
            ce("div", { key: name, style: { marginBottom: "8px" } },
              ce(Toggle, {
                label: def.label,
                checked: self.settings.panels[name].pushed,
                onChange: () => {
                  self.togglePanel(name);
                  forceUpdate();
                },
              }),
              def.hoverCapable &&
                ce(Toggle, {
                  label: "  \u21b3 Hover to expand",
                  checked: self.settings.panels[name].hoverExpand,
                  onChange: (v) => {
                    self.settings.panels[name].hoverExpand = v;
                    self.saveSettings();
                    forceUpdate();
                  },
                }),
              // Width display (if panel has been resized)
              self.settings.panels[name].width > 0 &&
                ce("div", { style: { ...dimStyle, display: "flex", alignItems: "center", gap: "6px" } },
                  ce("span", null, `Width: ${self.settings.panels[name].width}px`),
                  ce("button", {
                    style: { ...btnDimStyle, fontSize: "10px", padding: "2px 6px", marginBottom: "0" },
                    onClick: () => {
                      self.settings.panels[name].width = self.settings.defaultWidths[name];
                      self.saveSettings();
                      self.updateCSSVars();
                      forceUpdate();
                    },
                  }, "Reset")
                )
            )
          )
        );

      // ── Hidden Channels (per guild) ──
      const HiddenChannelsSection = () => {
        const guildEntries = Object.entries(self.settings.guilds).filter(
          ([, data]) => data.hiddenChannels?.length > 0 || data.crushedCategories?.length > 0
        );
        if (guildEntries.length === 0) return null;

        return ce("div", { style: sectionStyle },
          ce("div", { style: subHeaderStyle }, "Pushed Channels & Crushed Categories"),
          guildEntries.map(([guildId, data]) => {
            const guild = self._GuildStore?.getGuild?.(guildId);
            const guildName = guild?.name || guildId;
            return ce("div", { key: guildId, style: { marginBottom: "10px" } },
              ce("div", { style: { fontSize: "12px", color: "#999", marginBottom: "4px" } }, guildName),
              data.hiddenChannels?.map((ch) =>
                ce("button", {
                  key: ch.id, style: btnDimStyle,
                  onClick: () => { self.recallChannel(guildId, ch.id); forceUpdate(); },
                }, `Recall #${ch.name}`)
              ),
              data.crushedCategories?.map((cat) =>
                ce("button", {
                  key: cat.id, style: btnDimStyle,
                  onClick: () => { self.releaseCategory(guildId, cat.id); forceUpdate(); },
                }, `Release ${cat.name}`)
              )
            );
          })
        );
      };

      // ── Gripped DMs ──
      const GrippedDMsSection = () => {
        if (self.settings.grippedDMs.length === 0) return null;
        return ce("div", { style: sectionStyle },
          ce("div", { style: subHeaderStyle }, "Gripped DMs"),
          self.settings.grippedDMs.map((dm) =>
            ce("button", {
              key: dm.channelId, style: btnDimStyle,
              onClick: () => { self.releaseDM(dm.channelId); forceUpdate(); },
            }, `Release ${dm.username}`)
          )
        );
      };

      // ── General Settings ──
      const GeneralSection = () =>
        ce("div", { style: sectionStyle },
          ce("div", { style: subHeaderStyle }, "General"),
          ce("label", { style: { ...labelStyle, marginBottom: "10px" } },
            ce("span", null, `Transition Speed: ${transSpeed}ms`),
            ce("input", {
              type: "range", min: 0, max: 600, step: 50, value: transSpeed,
              style: { width: "120px", accentColor: "#9b59b6" },
              onChange: (e) => {
                const v = Number(e.target.value);
                setTransSpeed(v);
                self.settings.transitionSpeed = v;
                self.saveSettings();
                self.updateCSSVars();
              },
            })
          ),
          ce(Toggle, {
            label: "Animations",
            checked: anims,
            onChange: (v) => { setAnims(v); updateSetting("animationsEnabled", v); },
          }),
          ce(Toggle, {
            label: "Debug Mode",
            checked: debug,
            onChange: (v) => { setDebug(v); updateSetting("debugMode", v); },
          })
        );

      return ce("div", { style: containerStyle },
        ce(StatusSection),
        ce(PanelSection),
        ce(HiddenChannelsSection),
        ce(GrippedDMsSection),
        ce(GeneralSection)
      );
    };

    return React.createElement(SettingsPanel);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §17  CSS Builder (custom properties + dynamic selectors)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Updates CSS custom properties on :root.
   * Called whenever settings change (transition speed, panel widths).
   * Matches CollapsibleUI's styles.update() pattern.
   */
  updateCSSVars() {
    const s = this.settings;
    BdApi.DOM.removeStyle(RA_VARS_STYLE_ID);
    BdApi.DOM.addStyle(RA_VARS_STYLE_ID, `
      :root {
        --ra-transition-speed: ${s.transitionSpeed}ms;
        --ra-sidebar-width: ${s.panels.sidebar.width || s.defaultWidths.sidebar}px;
        --ra-members-width: ${s.panels.members.width || s.defaultWidths.members}px;
        --ra-profile-width: ${s.panels.profile.width || s.defaultWidths.profile}px;
        --ra-search-width: ${s.panels.search.width || s.defaultWidths.search}px;
        --ra-push-color: rgba(138, 43, 226, 0.25);
        --ra-members-bg: rgba(10, 14, 24, 0.44);
        --ra-hover-fudge: ${s.hoverFudgePx}px;
      }
    `.replace(/\s+/g, " "));
  }

  /**
   * Builds the static CSS rules using dynamic Webpack selectors.
   * Selectors are built from discovered CSS class modules when available,
   * falling back to wildcard attribute selectors when Webpack fails.
   */
  buildCSS() {
    const m = this._modules || {};

    // Build panel selectors — prefer Webpack class, fall back to wildcard
    const sidebarSel = m.sidebar?.sidebarList
      ? `.${m.sidebar.sidebarList}`
      : SIDEBAR_CSS_SAFE.join(", ");
    const membersSel = m.members?.membersWrap
      ? `.${m.members.membersWrap}`
      : MEMBERS_FALLBACKS.join(", ");
    const profileSel = m.panel?.outer
      ? `.${m.panel.outer}`
      : PROFILE_FALLBACKS.join(", ");
    const searchSel = m.search?.searchResultsWrap
      ? `.${m.search.searchResultsWrap}`
      : SEARCH_FALLBACKS.join(", ");
    const chatSel = m.guilds?.chatContent
      ? `.${m.guilds.chatContent}`
      : '[class*="chatContent_"]';

    // Build push selectors with body class qualifier
    // Use SIDEBAR_CSS_SAFE to avoid matching the settings modal's nav sidebar
    const sidebarPush = SIDEBAR_CSS_SAFE.map((s) => `body.ra-sidebar-pushed:not(.${RA_SETTINGS_OPEN_CLASS}) ${s}`);
    const membersPush = MEMBERS_FALLBACKS.map((s) => `body.ra-members-pushed ${s}`);
    const profilePush = PROFILE_FALLBACKS.map((s) => `body.ra-profile-pushed ${s}`);
    const searchPush  = SEARCH_FALLBACKS.map((s) => `body.ra-search-pushed ${s}`);

    // Add Webpack-derived selectors first (more specific, faster matching)
    if (m.sidebar?.sidebarList)      sidebarPush.unshift(`body.ra-sidebar-pushed:not(.${RA_SETTINGS_OPEN_CLASS}) .${m.sidebar.sidebarList}`);
    if (m.members?.membersWrap)      membersPush.unshift(`body.ra-members-pushed .${m.members.membersWrap}`);
    if (m.panel?.outer)              profilePush.unshift(`body.ra-profile-pushed .${m.panel.outer}`);
    if (m.search?.searchResultsWrap) searchPush.unshift(`body.ra-search-pushed .${m.search.searchResultsWrap}`);

    // Hover selectors (also use CSS-safe subset for sidebar)
    const sidebarHover = SIDEBAR_CSS_SAFE.map((s) => `body.ra-sidebar-pushed.ra-sidebar-hover-reveal:not(.${RA_SETTINGS_OPEN_CLASS}) ${s}`);
    const membersHover = MEMBERS_FALLBACKS.map((s) => `body.ra-members-pushed.ra-members-hover-reveal ${s}`);
    const profileHover = PROFILE_FALLBACKS.map((s) => `body.ra-profile-pushed.ra-profile-hover-reveal ${s}`);
    if (m.sidebar?.sidebarList) sidebarHover.unshift(`body.ra-sidebar-pushed.ra-sidebar-hover-reveal:not(.${RA_SETTINGS_OPEN_CLASS}) .${m.sidebar.sidebarList}`);
    if (m.members?.membersWrap) membersHover.unshift(`body.ra-members-pushed.ra-members-hover-reveal .${m.members.membersWrap}`);
    if (m.panel?.outer) profileHover.unshift(`body.ra-profile-pushed.ra-profile-hover-reveal .${m.panel.outer}`);

    const sidebarHandleDisable = SIDEBAR_FALLBACKS.map((s) => `body.${RA_SETTINGS_OPEN_CLASS} ${s}::before`);
    if (m.sidebar?.sidebarList) sidebarHandleDisable.unshift(`body.${RA_SETTINGS_OPEN_CLASS} .${m.sidebar.sidebarList}::before`);

    return `
/* ── Ruler's Authority v${RA_VERSION} — Dynamic CSS ──────────────────── */

/* ── Core Panel Push ────────────────────────────────────────────── */

${sidebarPush.join(",\n")} {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}

${membersPush.join(",\n")} {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}

${profilePush.join(",\n")} {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}

${searchPush.join(",\n")} {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}

/* ── Members Column Surface (transparent) ──────────────────────── */

${membersSel},
${membersSel} > div[class*="members_"],
${membersSel} > div[class*="container_"] {
  background: var(--ra-members-bg) !important;
  position: relative !important;
  overflow: visible !important;
}

${membersSel},
${membersSel} [class*="members_"],
${membersSel} [class*="scroller_"],
${membersSel} [class*="thin_"],
${membersSel} [class*="scrollerBase_"] {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

${membersSel}::-webkit-scrollbar,
${membersSel} [class*="members_"]::-webkit-scrollbar,
${membersSel} [class*="scroller_"]::-webkit-scrollbar,
${membersSel} [class*="thin_"]::-webkit-scrollbar,
${membersSel} [class*="scrollerBase_"]::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}

/* ── Chat content dark overlay ───────────────────────────────── */
body.ra-members-pushed.ra-members-hover-reveal ${chatSel} {
  background: rgba(0, 0, 0, 0.4) !important;
}

/* ── Members: outer wrap matches inner dark overlay ── */
body.ra-members-pushed.ra-members-hover-reveal ${membersSel},
body.ra-members-pushed.ra-members-hover-reveal div[class^="membersWrap_"] {
  background: rgba(0, 0, 0, 0.4) !important;
  background-color: rgba(0, 0, 0, 0.4) !important;
  box-shadow: none !important;
  border-left: 0 !important;
  outline: none !important;
}

body.ra-members-pushed.ra-members-hover-reveal div[class^="members_"] {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border-left: 0 !important;
  outline: none !important;
}

body.ra-members-pushed.ra-members-hover-reveal div[aria-label="Members"][role="list"] {
  background: transparent !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}

/* ── Hover-to-Expand (float overlay) ────────────────────────────── */

${sidebarHover.join(",\n")} {
  width: var(--ra-sidebar-width) !important;
  min-width: var(--ra-sidebar-width) !important;
  max-width: var(--ra-sidebar-width) !important;
  overflow-y: auto !important;
  box-shadow: none !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}

${membersHover.join(",\n")} {
  width: var(--ra-members-width) !important;
  min-width: var(--ra-members-width) !important;
  max-width: var(--ra-members-width) !important;
  overflow-y: auto !important;
  overflow-x: visible !important;
  position: relative !important;
  border-left: 0 !important;
  box-shadow: none !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}

/* Stable selectors from live DOM: force-hide member list scrollbar */
body.ra-members-pushed.ra-members-hover-reveal aside[class^="membersWrap_"] > div[class^="members_"],
body.ra-members-pushed.ra-members-hover-reveal div[aria-label="Members"][role="list"] {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

body.ra-members-pushed.ra-members-hover-reveal aside[class^="membersWrap_"] > div[class^="members_"]::-webkit-scrollbar,
body.ra-members-pushed.ra-members-hover-reveal div[aria-label="Members"][role="list"]::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
  background: transparent !important;
}

${profileHover.join(",\n")} {
  width: var(--ra-profile-width) !important;
  min-width: var(--ra-profile-width) !important;
  max-width: var(--ra-profile-width) !important;
  overflow-y: auto !important;
  position: absolute !important;
  right: 0 !important;
  top: 0 !important;
  height: 100% !important;
  z-index: 101 !important;
  box-shadow: -4px 0 20px var(--ra-push-color) !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}

/* ── Resize Handles (::before pseudo-elements — CollapsibleUI pattern) ── */

${membersSel}:before,
${profileSel}:before,
${searchSel}:before {
  cursor: e-resize;
  z-index: 200;
  position: absolute;
  content: "";
  width: 12px;
  height: 100%;
  left: -4px;
  opacity: 0;
  transition: opacity 200ms ease;
}

${membersSel}:hover:before,
${profileSel}:hover:before,
${searchSel}:hover:before {
  opacity: 1;
  background: transparent;
}

${sidebarSel}:before {
  cursor: e-resize;
  z-index: 200;
  position: absolute;
  content: "";
  width: 12px;
  height: 100%;
  right: -4px;
  left: auto;
  opacity: 0;
  transition: opacity 200ms ease;
}

${sidebarSel}:hover:before {
  opacity: 1;
  background: transparent;
}

${sidebarHandleDisable.join(",\n")} {
  opacity: 0 !important;
  background: none !important;
  pointer-events: none !important;
}

/* ── Crushed Category Visual ────────────────────────────────────── */

[data-ra-crushed="true"] {
  opacity: 0.5;
  border-left: 2px solid rgba(138, 43, 226, 0.4);
}

/* ── Grip DM Indicator ──────────────────────────────────────────── */

.ra-grip-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: radial-gradient(circle, #b49bff 0%, rgba(138, 43, 226, 0.3) 100%);
  border-radius: 50%;
  pointer-events: none;
  animation: ra-grip-pulse 2s ease-in-out infinite;
}

@keyframes ra-grip-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}

/* ── Toolbar Icon ───────────────────────────────────────────────── */

.ra-toolbar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  border-radius: 2px;
  transition: background 150ms ease, filter 200ms ease;
  margin-left: 4px;
  opacity: 0.7;
}

.ra-toolbar-icon:hover {
  background: rgba(138, 43, 226, 0.15);
  opacity: 1;
}

.ra-toolbar-icon--active {
  opacity: 1;
}

.ra-toolbar-icon--active svg {
  filter: drop-shadow(0 0 4px rgba(138, 43, 226, 0.6));
}

.ra-toolbar-icon--hidden {
  display: none !important;
}

/* ── Amplified Mode ─────────────────────────────────────────────── */

.ra-toolbar-icon--amplified svg {
  filter: drop-shadow(0 0 8px rgba(138, 43, 226, 0.8)) !important;
  animation: ra-amplified-glow 2s ease-in-out infinite;
}

@keyframes ra-amplified-glow {
  0%, 100% { filter: drop-shadow(0 0 8px rgba(138, 43, 226, 0.8)); }
  50% { filter: drop-shadow(0 0 16px rgba(180, 60, 255, 1.0)); }
}

body.ra-amplified [data-ra-crushed="true"] {
  border-left-color: rgba(180, 60, 255, 0.6);
}

body.ra-amplified .ra-grip-indicator {
  background: radial-gradient(circle, #c78dff 0%, rgba(180, 60, 255, 0.5) 100%);
}

/* ── Push/Pull Animation ────────────────────────────────────────── */

@keyframes ra-push-ripple {
  0% { box-shadow: inset 3px 0 12px rgba(138, 43, 226, 0.5); }
  50% { box-shadow: inset 3px 0 20px rgba(138, 43, 226, 0.2); }
  100% { box-shadow: none; }
}

@keyframes ra-pull-bounce {
  0% { transform: scaleX(0.97); }
  60% { transform: scaleX(1.01); }
  100% { transform: scaleX(1); }
}

body.ra-pushing ${chatSel},
body.ra-pushing [class*="chatContent_"] {
  animation: ra-push-ripple 500ms ease-out;
}

body.ra-pulling ${chatSel},
body.ra-pulling [class*="chatContent_"] {
  animation: ra-pull-bounce 350ms ease-out;
}
    `.trim();
  }

  injectCSS() {
    BdApi.DOM.removeStyle(RA_STYLE_ID);
    BdApi.DOM.addStyle(RA_STYLE_ID, this.buildCSS());
  }

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

  setupHotkeyListener() {
    if (!this._controller) return;
    document.addEventListener("keydown", (e) => {
      if (isEditableTarget(e.target)) return;

      for (const [panelName, config] of Object.entries(this.settings.panels)) {
        if (config.hotkey && matchesHotkey(e, config.hotkey)) {
          e.preventDefault();
          e.stopPropagation();
          this.togglePanel(panelName);
          return;
        }
      }
    }, { capture: true, signal: this._controller.signal });
  }

  setupChannelObserver(retries = 0) {
    if (this._channelObserver) {
      this._channelObserver.disconnect();
      this._channelObserver = null;
    }
    clearTimeout(this._channelObserverRetryTimer);

    // Try Webpack-discovered selector first, then fallback
    const m = this._modules;
    const channelList =
      (m?.sidebar?.sidebarList && document.querySelector(`.${m.sidebar.sidebarList} [role="tree"]`)) ||
      document.querySelector('[class*="sidebar_"] [role="tree"]') ||
      document.querySelector('[class*="sidebar_"] [class*="scroller_"]');

    if (!channelList) {
      // Retry with increasing delay — DOM may not be ready after guild/channel switch
      if (retries < 4 && this._controller) {
        const delay = 300 * (retries + 1);
        this._channelObserverRetryTimer = setTimeout(() => {
          if (this._controller) this.setupChannelObserver(retries + 1);
        }, delay);
      }
      return;
    }

    const throttledApply = this._throttle(() => {
      if (!this._channelObserver) return;
      // Self-heal: if Discord replaced the tree element, reconnect observer
      if (!channelList.isConnected) {
        this.setupChannelObserver();
        return;
      }
      this.applyMicroStateForCurrentGuild();
    }, RA_OBSERVER_THROTTLE_MS);

    this._channelObserver = new MutationObserver(throttledApply);
    this._channelObserver.observe(channelList, { childList: true, subtree: true });
  }

  // PERF(P5-5): Replaced document.body subtree MutationObserver with 1.5s polling.
  // The observer fired on every DOM mutation in all of Discord (~50+/sec in active channels)
  // just to detect settings modal open/close (a rare, latency-insensitive event).
  // Polling at 1.5s is unnoticeable for this use case and eliminates the most expensive
  // single observer in the plugin suite.
  setupSettingsGuard() {
    // Clean up previous observer (if any from older version) or interval
    if (this._settingsObserver) {
      this._settingsObserver.disconnect();
      this._settingsObserver = null;
    }
    if (this._settingsGuardInterval) {
      clearInterval(this._settingsGuardInterval);
      this._settingsGuardInterval = null;
    }

    this._syncSettingsGuardState();
    this._settingsGuardInterval = setInterval(() => {
      if (!this._controller) return;
      if (document.hidden) return;
      this._syncSettingsGuardState();
    }, 1500);
  }

  _isSettingsModalOpen() {
    // standardSidebarView_ is specific to Discord's settings modal layout
    // (User Settings, Server Settings, Channel Settings). It does NOT appear
    // in normal Discord UI, so this check alone is reliable.
    //
    // REMOVED: [aria-label="User Settings"] — this matched the always-present
    // gear icon button in the user panel, causing a permanent false positive
    // that blocked all hover processing.
    return !!document.querySelector('[class*="standardSidebarView_"]');
  }

  _syncSettingsGuardState(forceOpen) {
    const body = document.body;
    if (!body) return false;

    const isOpen = typeof forceOpen === "boolean" ? forceOpen : this._isSettingsModalOpen();
    body.classList.toggle(RA_SETTINGS_OPEN_CLASS, isOpen);
    if (isOpen) this._clearAllHoverStates();
    return isOpen;
  }

  _clearSidebarHoverState() {
    clearTimeout(this._sidebarRevealTimer);
    clearTimeout(this._sidebarHideTimer);
    clearTimeout(this._channelRevealTimer);
    clearTimeout(this._channelHideTimer);
    this._sidebarRevealTimer = null;
    this._sidebarHideTimer = null;
    this._channelRevealTimer = null;
    this._channelHideTimer = null;
    document.body.classList.remove("ra-sidebar-hover-reveal");
    if (this._channelsHoverRevealActive) this._setHiddenChannelRevealState(false);
  }

  _clearAllHoverStates() {
    // Clear ALL hover timers and reveal states (used when settings open or plugin stopping)
    this._clearSidebarHoverState();
    clearTimeout(this._membersRevealTimer);
    clearTimeout(this._membersHideTimer);
    clearTimeout(this._profileRevealTimer);
    clearTimeout(this._profileHideTimer);
    this._membersRevealTimer = null;
    this._membersHideTimer = null;
    this._profileRevealTimer = null;
    this._profileHideTimer = null;
    document.body.classList.remove("ra-members-hover-reveal", "ra-profile-hover-reveal");
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
