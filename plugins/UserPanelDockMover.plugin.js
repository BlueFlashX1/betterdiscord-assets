/**
 * @name UserPanelDockMover
 * @description Visually moves the user status/settings panel into the horizontal server list dock via CSS positioning.
 * @version 3.7.0
 * @author BlueFlashX1
 */

module.exports = class UserPanelDockMover {
  start() {
    const instanceKey = "__UserPanelDockMoverInstance";
    try {
      const prev = window[instanceKey];
      if (prev && prev !== this && typeof prev.stop === "function") prev.stop();
      window[instanceKey] = this;
    } catch (error) {
      console.warn("[UserPanelDockMover] Failed to register singleton instance:", error);
    }

    this.instanceKey = instanceKey;
    this.pluginId = "UserPanelDockMover";
    this.version = "3.7.0";

    this.panelSelector = "section[aria-label='User status and settings']";
    this.dockSelector = "nav[aria-label='Servers sidebar']";

    this.panel = null;
    this.dock = null;
    this.pollInterval = null;
    this.isPositioned = false;

    // NOTE: Dock-hover bridge code was removed in v3.7.0.
    // HSLDockAutoHide v4.0.0+ handles user panel hover internally via
    // DockEngine.bindUserPanelHover(). When this plugin runs standalone
    // (without HSLDockAutoHide), there is no auto-hide dock to bridge to.

    // Clean up stale CSS variable from previous versions
    document.body.style.removeProperty("--sl-userpanel-width");

    // Collapse sidebar panels height so DM list fills the gap
    this._origPanelsHeight = document.body.style.getPropertyValue("--custom-app-panels-height") || null;
    document.body.style.setProperty("--custom-app-panels-height", "0px");

    this.injectStyles();

    // Initial sync + recurring poll to find elements after React renders
    this.trySetup();
    this.pollInterval = setInterval(() => this.trySetup(), 900);

    BdApi.UI.showToast("UserPanelDockMover v3.7.0 active", { type: "success", timeout: 2200 });
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Remove positioning class
    if (this.panel) {
      this.panel.classList.remove("sl-userpanel-docked");
      this.panel.style.removeProperty("right");
      this.panel.style.removeProperty("left");
    }

    // Clean up stale CSS variables from older versions
    document.body.style.removeProperty("--sl-userpanel-width");

    // Restore sidebar panels height
    if (this._origPanelsHeight) {
      document.body.style.setProperty("--custom-app-panels-height", this._origPanelsHeight);
    } else {
      document.body.style.removeProperty("--custom-app-panels-height");
    }

    if (BdApi?.DOM?.removeStyle) {
      BdApi.DOM.removeStyle(this.pluginId);
    }

    this.panel = null;
    this.dock = null;
    this.isPositioned = false;

    try {
      delete window[this.instanceKey];
    } catch (error) {
      console.warn("[UserPanelDockMover] Failed to clear singleton instance key:", error);
    }

    BdApi.UI.showToast("UserPanelDockMover stopped", { type: "info", timeout: 2200 });
  }

  injectStyles() {
    const css = `
      /* ── Docked user panel — right-side overlay on dock ──
         pointer-events: none on the section so horizontal scroll passes
         through to the dock underneath. Children re-enable pointer-events.
         Does NOT modify the dock itself. ── */
      section[aria-label="User status and settings"].sl-userpanel-docked {
        position: fixed !important;
        right: 0 !important;
        left: auto !important;
        z-index: 42 !important;
        pointer-events: none !important;

        /* Fixed width */
        height: var(--sl-dock-height, 80px) !important;
        width: 300px !important;
        min-width: 300px !important;
        max-width: 300px !important;

        /* Transparent — scroll/click passes through to dock */
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        padding: 4px 12px !important;
        margin: 0 !important;

        /* Row layout */
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 0 !important;
        overflow: hidden !important;

        /* Transition to follow dock show/hide */
        transition: bottom 240ms cubic-bezier(0.2, 0.75, 0.25, 1),
                    opacity 180ms ease !important;
      }

      /* When dock is hidden, push panel off-screen matching dock peek */
      body.sl-dock-autohide.sl-dock-hidden section[aria-label="User status and settings"].sl-userpanel-docked {
        bottom: calc(-1 * (var(--sl-dock-height, 80px) - var(--sl-dock-peek, 8px))) !important;
      }

      /* When dock is visible, panel sits at bottom */
      body.sl-dock-autohide.sl-dock-visible section[aria-label="User status and settings"].sl-userpanel-docked {
        bottom: 0 !important;
      }

      /* Kill transition during composer lock */
      body.sl-dock-autohide.sl-dock-composer-lock section[aria-label="User status and settings"].sl-userpanel-docked {
        transition: none !important;
        bottom: calc(-1 * (var(--sl-dock-height, 80px) - var(--sl-dock-peek, 8px))) !important;
      }

      /* ── Voice/connection wrapper — hide when empty, compact when active ── */
      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="wrapper_"]:empty {
        display: none !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="wrapper_"] {
        pointer-events: auto !important;
        margin: 0 6px 0 0 !important;
        padding: 0 !important;
        flex-shrink: 0 !important;
      }

      /* ── Avatar + name + buttons container — re-enable clicks, solid bg ── */
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

      /* ── Force ALL descendants to respect flex layout ── */
      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="container_"] > * {
        max-width: none !important;
        min-width: 0 !important;
      }

      /* ── Username text — stretch to fill available space ── */
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

      /* ── The clickable user-info wrapper that Discord constrains ── */
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="avatarWrapper_"],
      section[aria-label="User status and settings"].sl-userpanel-docked [class*="withTagAsButton_"],
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="canCopy_"] {
        flex: 1 1 0% !important;
        min-width: 0 !important;
        max-width: none !important;
        width: auto !important;
        overflow: hidden !important;
      }

      /* ── Avatar size ── */
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="avatar_"] {
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
        flex-shrink: 0 !important;
      }

      /* ── Action buttons — compact row, pushed to the right ── */
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

      /* ── Reclaim sidebar space — panel is visually in the dock now ──
         The panels wrapper in the sidebar still reserves height for the
         user panel. Collapse it so the DM list extends into the gap. */
      div[class^="panels_"] section[aria-label="User status and settings"].sl-userpanel-docked {
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }

      /* Collapse the panels wrapper itself when panel is docked */
      div[class^="panels_"]:has(section[aria-label="User status and settings"].sl-userpanel-docked) {
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
    `;

    if (BdApi?.DOM?.addStyle) BdApi.DOM.addStyle(this.pluginId, css);
  }

  trySetup() {
    const panel = document.querySelector(this.panelSelector);
    const dock = document.querySelector(this.dockSelector);

    if (!panel || !dock) return;

    // Already tracking these exact elements
    if (this.isPositioned && panel === this.panel && dock === this.dock) {
      if (!panel.classList.contains("sl-userpanel-docked")) {
        panel.classList.add("sl-userpanel-docked");
      }
      return;
    }

    // Clean up previous panel if it changed
    if (this.panel && this.panel !== panel) {
      this.panel.classList.remove("sl-userpanel-docked");
      this.panel.style.removeProperty("right");
      this.panel.style.removeProperty("left");
    }

    this.panel = panel;
    this.dock = dock;

    panel.classList.add("sl-userpanel-docked");
    this.isPositioned = true;

    // PERF: Slow down poll after successful setup (900ms → 10s safety net)
    if (this.pollInterval && !this._pollSlowed) {
      clearInterval(this.pollInterval);
      this.pollInterval = setInterval(() => this.trySetup(), 10000);
      this._pollSlowed = true;
    }
  }
};
