/**
 * CSS for HSLDockAutoHide.
 *
 * Split into two layers:
 *   1. getUserPanelDockCss()  — always injected so the nameplate moves to the
 *      dock area regardless of skill-gate state.
 *   2. getDockAutoHideCss()   — injected only when rulers_authority is unlocked;
 *      adds the show/hide transitions and dock target transforms.
 */

const dc = require("../shared/discord-classes");

function getUserPanelDockCss() {
  return `
      /* ── User Panel Dock Mover (always active) ── */
      section[aria-label="User status and settings"].sl-userpanel-docked {
        position: fixed !important;
        bottom: 0 !important;
        right: 0 !important;
        left: auto !important;
        z-index: 42 !important;
        pointer-events: none !important;
        height: var(--sl-dock-height, 80px) !important;
        width: 300px !important;
        min-width: 300px !important;
        max-width: 300px !important;
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        padding: 4px 12px !important;
        margin: 0 !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 0 !important;
        overflow: hidden !important;
        transition: bottom 240ms cubic-bezier(0.2, 0.75, 0.25, 1),
                    opacity 180ms ease !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="wrapper_"]:empty {
        display: none !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="wrapper_"] {
        pointer-events: auto !important;
        margin: 0 6px 0 0 !important;
        padding: 0 !important;
        flex-shrink: 0 !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="container_"] {
        pointer-events: auto !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        padding: 4px 12px !important;
        margin: 0 !important;
        border-radius: 0 !important;
        background: rgba(8, 10, 20, 0.96) !important;
        background-image: none !important;
        border-left: 1px solid rgba(138, 43, 226, 0.22) !important;
        box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3) !important;
        gap: 10px !important;
        min-width: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        flex: 1 1 0% !important;
        height: auto !important;
        max-height: calc(var(--sl-dock-height, 80px) - 10px) !important;
        overflow: hidden !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="container_"] > * {
        max-width: none !important;
        min-width: 0 !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked [class^="nameTag_"],
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="panelSubtextContainer_"],
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="panelTitleContainer_"] {
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        max-width: none !important;
        width: auto !important;
        flex: 1 1 0% !important;
        min-width: 0 !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked [class^="avatarWrapper_"],
      section[aria-label="User status and settings"].sl-userpanel-docked ${dc.sel.withTagAsButton},
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="canCopy_"] {
        flex: 1 1 0% !important;
        min-width: 0 !important;
        max-width: none !important;
        width: auto !important;
        overflow: hidden !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked [class^="avatar_"] {
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
        flex-shrink: 0 !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked [class^="actionButtons_"],
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="actions_"] {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 2px !important;
        flex-shrink: 0 !important;
        flex-grow: 0 !important;
        margin-left: auto !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked [class^="actionButtons_"] button,
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="actions_"] button {
        width: 28px !important;
        height: 28px !important;
        min-width: 28px !important;
        padding: 2px !important;
      }

      /* Collapse the sidebar panels wrapper so the fixed-position panel
         does not leave a gap.  The section itself is position:fixed and
         escapes the wrapper's overflow clipping — do NOT collapse the
         section directly or its height:0 will make the fixed panel invisible.
         overflow: visible so transform-ancestor containment doesn't clip. */
      div[class^="panels_"]:has(section[aria-label="User status and settings"].sl-userpanel-docked) {
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: visible !important;
      }
    `;
}

function getDockAutoHideCss() {
  return `
      body.sl-dock-autohide {
        --sl-dock-height: 80px;
        --sl-dock-peek: 8px;
      }

      body.sl-dock-autohide .sl-hsl-dock-target {
        transition: translate 240ms cubic-bezier(0.2, 0.75, 0.25, 1) !important;
        will-change: translate;
        scale: 1 !important;
      }

      body.sl-dock-autohide.sl-dock-visible .sl-hsl-dock-target {
        translate: 0 0 !important;
      }

      body.sl-dock-autohide.sl-dock-hidden .sl-hsl-dock-target {
        translate: 0 calc(var(--sl-dock-height) - var(--sl-dock-peek)) !important;
      }

      body.sl-dock-autohide.sl-dock-composer-lock .sl-hsl-dock-target {
        transition: none !important;
        translate: 0 calc(var(--sl-dock-height) - var(--sl-dock-peek)) !important;
      }

      body.sl-dock-autohide ${dc.sel.base}[data-fullscreen="false"] > ${dc.sel.content} {
        transition: margin-bottom 240ms cubic-bezier(0.2, 0.75, 0.25, 1) !important;
        margin-bottom: var(--sl-dock-height) !important;
      }

      body.sl-dock-autohide.sl-dock-hidden ${dc.sel.base}[data-fullscreen="false"] > ${dc.sel.content} {
        margin-bottom: var(--sl-dock-peek) !important;
      }

      /* ── Dock auto-hide overrides for user panel position ── */
      body.sl-dock-autohide.sl-dock-hidden section[aria-label="User status and settings"].sl-userpanel-docked {
        bottom: calc(-1 * (var(--sl-dock-height, 80px) - var(--sl-dock-peek, 8px))) !important;
      }

      body.sl-dock-autohide.sl-dock-visible section[aria-label="User status and settings"].sl-userpanel-docked {
        bottom: 0 !important;
      }

      body.sl-dock-autohide.sl-dock-composer-lock section[aria-label="User status and settings"].sl-userpanel-docked {
        transition: none !important;
        bottom: calc(-1 * (var(--sl-dock-height, 80px) - var(--sl-dock-peek, 8px))) !important;
      }
    `;
}

/** Legacy combined getter — returns both layers for backward compat */
function getHslDockAutoHideCss() {
  return getUserPanelDockCss() + getDockAutoHideCss();
}

module.exports = {
  getUserPanelDockCss,
  getDockAutoHideCss,
  getHslDockAutoHideCss,
};
