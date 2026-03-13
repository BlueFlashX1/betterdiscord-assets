// ═══════════════════════════════════════════════════════════════════════════
// CSS Builder (custom properties + dynamic selectors)
// ═══════════════════════════════════════════════════════════════════════════
//
// Dynamic CSS built via JS — uses runtime Webpack module references and
// settings values. Cannot be a static .css file.

import {
  RA_VERSION,
  RA_STYLE_ID,
  RA_VARS_STYLE_ID,
  RA_SETTINGS_OPEN_CLASS,
  SIDEBAR_FALLBACKS,
  SIDEBAR_CSS_SAFE,
  MEMBERS_FALLBACKS,
  PROFILE_FALLBACKS,
  SEARCH_FALLBACKS,
} from "./constants";

const dc = require("../shared/discord-classes");

/**
 * Updates CSS custom properties on :root.
 * Called whenever settings change (transition speed, panel widths).
 * Matches CollapsibleUI's styles.update() pattern.
 * @param {RulersAuthority} ctx - plugin instance
 */
export function updateCSSVars(ctx) {
  const s = ctx.settings;
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
 * @param {RulersAuthority} ctx - plugin instance
 * @returns {string} Complete CSS string
 */
export function buildCSS(ctx) {
  const m = ctx._modules || {};
  const buildCollapsedPushRule = (selectors) => `${selectors.join(",\n")} {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}`;

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
    : dc.sel.chatContent;

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

${buildCollapsedPushRule(sidebarPush)}

${buildCollapsedPushRule(membersPush)}

${buildCollapsedPushRule(profilePush)}

${buildCollapsedPushRule(searchPush)}

/* ── Members Column Surface (transparent) ──────────────────────── */

${membersSel},
${membersSel} > div${dc.sel.members},
${membersSel} > div${dc.sel.container} {
  background: var(--ra-members-bg) !important;
  position: relative !important;
  overflow: visible !important;
}

${membersSel},
${membersSel} ${dc.sel.members},
${membersSel} ${dc.sel.scroller},
${membersSel} ${dc.sel.thin},
${membersSel} ${dc.sel.scrollerBase} {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

${membersSel}::-webkit-scrollbar,
${membersSel} ${dc.sel.members}::-webkit-scrollbar,
${membersSel} ${dc.sel.scroller}::-webkit-scrollbar,
${membersSel} ${dc.sel.thin}::-webkit-scrollbar,
${membersSel} ${dc.sel.scrollerBase}::-webkit-scrollbar {
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
  border-radius: 4px;
  transition: opacity 0.15s ease, background 0.15s ease;
  margin-left: 4px;
  opacity: 0.8;
}

.ra-toolbar-icon:hover {
  opacity: 1;
}

.ra-toolbar-icon:hover svg {
  filter: drop-shadow(0 0 4px rgba(200, 170, 255, 0.7));
}

/* ── Shared Toolbar Tooltip ────────────────────────────────────── */
.sl-toolbar-tip {
  position: fixed;
  transform: translateX(-50%);
  padding: 8px 12px;
  background: rgb(10, 10, 15);
  border: 1px solid rgba(138, 43, 226, 0.4);
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(138, 43, 226, 0.25), 0 0 20px rgba(138, 43, 226, 0.08);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.1s ease;
  z-index: 999999;
}
.sl-toolbar-tip--visible {
  opacity: 1;
}
.sl-toolbar-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: rgba(138, 43, 226, 0.4);
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

body.ra-pushing ${chatSel} {
  animation: ra-push-ripple 500ms ease-out;
}

body.ra-pulling ${chatSel} {
  animation: ra-pull-bounce 350ms ease-out;
}
  `.trim();
}

/**
 * Inject CSS into the DOM.
 * @param {RulersAuthority} ctx - plugin instance
 */
export function injectCSS(ctx) {
  if (!ctx._builtCSS) ctx._builtCSS = buildCSS(ctx);
  BdApi.DOM.removeStyle(RA_STYLE_ID);
  BdApi.DOM.addStyle(RA_STYLE_ID, ctx._builtCSS);
}
