import bdModuleLoader from "../shared/bd-module-loader.js";
import dc from "../shared/discord-classes";

// §1  Constants + Fallback Selectors

export const RA_PLUGIN_NAME = "RulersAuthority";
export const RA_VERSION = "2.1.2";
export const RA_STYLE_ID = "rulers-authority-css";
export const RA_VARS_STYLE_ID = "rulers-authority-vars";
export const RA_TOOLBAR_ICON_ID = "ra-toolbar-icon";
export const RA_ICON_REINJECT_DELAY_MS = 140;
export const RA_STATS_CACHE_TTL = 5000;
export const RA_OBSERVER_THROTTLE_MS = 200;
export const RA_RESIZE_MIN_WIDTH = 80;
export const RA_PANEL_HOVER_REVEAL_MIN_MS = 1000;
export const RA_SETTINGS_OPEN_CLASS = "ra-settings-open";

// Fallback selectors — used when Webpack module extraction fails.
// These use wildcard attribute selectors (less precise but always work).
export const SIDEBAR_FALLBACKS = [
  'nav[aria-label="Channels sidebar"]',
  'nav[aria-label="Channels"]',
  `${dc.sel.sidebar}${dc.sel.container}`,
  dc.sel.sidebar,
];

// CSS-safe subset — excludes the broad [class*="sidebar_"] which also matches
// the settings modal's navigation sidebar, causing it to collapse to width:0.
// The first 3 selectors are specific enough for CSS targeting.
export const SIDEBAR_CSS_SAFE = SIDEBAR_FALLBACKS.slice(0, -1);

export const MEMBERS_FALLBACKS = [
  dc.sel.membersWrap,
];

export const PROFILE_FALLBACKS = [
  dc.sel.userProfileOuter,
  '[class*="userPanelOuter_"]',
  '[class*="profilePanel_"]',
];

export const SEARCH_FALLBACKS = [
  dc.sel.searchResultsWrap,
];

export const TOOLBAR_FALLBACKS = [
  '[aria-label="Channel header"] [class*="toolbar_"]',
  '[class*="titleWrapper_"] [class*="toolbar_"]',
  'header [class*="toolbar_"]',
];

export const DM_LIST_FALLBACKS = [
  `${dc.sel.privateChannels} ${dc.sel.scroller}`,
  `${dc.sel.privateChannels} [role="list"]`,
];

// Panel definition — label, hover support, which Webpack module + property to use
export const PANEL_DEFS = {
  sidebar: { label: "Channel Sidebar", hoverCapable: true, moduleName: "sidebar", moduleKey: "sidebarList" },
  members: { label: "Members List",    hoverCapable: true,  moduleName: "members", moduleKey: "membersWrap" },
  profile: { label: "User Profile",    hoverCapable: true,  moduleName: "panel",   moduleKey: "outer" },
  search:  { label: "Search Results",  hoverCapable: false, moduleName: "search",  moduleKey: "searchResultsWrap" },
};

// §3  Default Settings

export const DEFAULT_SETTINGS = {
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
  hoverRevealDelayMs: 1000,
  hoverHideDelayMs: 500,

  // Per-guild micro state
  guilds: {},
  // { [guildId]: { hiddenChannels: [{ id, name }], crushedCategories: [{ id, name }] } }

  // DM gripping
  grippedDMs: [],
  // [{ channelId, username }]
};

// §4  Shared PluginUtils

const { loadBdModuleFromPlugins } = bdModuleLoader;
const _bdLoad = loadBdModuleFromPlugins;

export let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }
