/**
 * @name UserPanelDockMover
 * @description Visually moves the user status/settings panel into the horizontal server list dock via CSS positioning.
 * @version 3.6.0
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
    this.version = "3.6.0";

    this.panelSelector = "section[aria-label='User status and settings']";
    this.dockSelector = "nav[aria-label='Servers sidebar']";

    this.panel = null;
    this.dock = null;
    this.pollInterval = null;
    this.isPositioned = false;

    // Dock-hover bridge: keep HSLDockAutoHide open while hovering nametag
    this._onPanelEnter = null;
    this._onPanelLeave = null;
    this._bridgedContainer = null;
    this._origHitTest = null; // saved original isPointerOnDockHitTarget

    // Clean up stale CSS variable from previous versions
    document.body.style.removeProperty("--sl-userpanel-width");

    // Collapse sidebar panels height so DM list fills the gap
    this._origPanelsHeight = document.body.style.getPropertyValue("--custom-app-panels-height") || null;
    document.body.style.setProperty("--custom-app-panels-height", "0px");

    this.injectStyles();

    // Initial sync + recurring poll to find elements after React renders
    this.trySetup();
    this.pollInterval = setInterval(() => this.trySetup(), 900);

    BdApi.UI.showToast("UserPanelDockMover v3.6.0 active", { type: "success", timeout: 2200 });
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Unbind dock-hover bridge
    this.unbindDockHoverBridge();

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
        border-radius: 8px !important;
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

  /**
   * Tell HSLDockAutoHide that hovering the nametag = hovering the dock.
   *
   * Two-pronged approach:
   * 1. mouseenter/mouseleave on the inner container for immediate response.
   * 2. Monkey-patch isPointerOnDockHitTarget() so the 850ms tick in
   *    refreshPointerState() also considers the nametag as "on dock".
   *    Without this, the tick resets pointerOverDock = false every cycle.
   */
  bindDockHoverBridge(panel) {
    this.unbindDockHoverBridge();

    // Target the inner container (pointer-events: auto) — the outer section
    // is pointer-events: none so it never fires mouse events.
    const container = panel.querySelector("div[class^='container_']");
    if (!container) return;

    this._onPanelEnter = () => {
      const inst = window.__HSLDockAutoHideLiveInstance;
      if (!inst) return;
      inst.pointerOverDock = true;
      inst.revealHoldUntil = 0;
      if (inst.hideTimer) { clearTimeout(inst.hideTimer); inst.hideTimer = null; }
      if (inst.clearRevealTimer) inst.clearRevealTimer("userpanel-enter");
      inst.showDock?.("userpanel-enter");
    };

    this._onPanelLeave = () => {
      const inst = window.__HSLDockAutoHideLiveInstance;
      if (!inst) return;
      inst.pointerOverDock = false;
      inst.scheduleHide?.(inst.hideDelayMs || 220);
    };

    container.addEventListener("mouseenter", this._onPanelEnter);
    container.addEventListener("mouseleave", this._onPanelLeave);
    this._bridgedContainer = container;

    // Patch isPointerOnDockHitTarget so the periodic tick also sees the
    // nametag panel as "on dock" — prevents refreshPointerState from
    // overriding pointerOverDock back to false every 850ms.
    this._patchHitTest(panel);
  }

  _patchHitTest(panel) {
    const inst = window.__HSLDockAutoHideLiveInstance;
    if (!inst || this._origHitTest) return; // already patched or no instance

    this._origHitTest = inst.isPointerOnDockHitTarget.bind(inst);
    const self = this;

    inst.isPointerOnDockHitTarget = function (x, y) {
      // Original check — is cursor on the actual dock?
      if (self._origHitTest(x, y)) return true;

      // Extended check — is cursor on the nametag panel or its children?
      if (!self.panel || !document?.elementFromPoint) return false;
      const cx = (x !== undefined) ? x : inst.lastMouseX;
      const cy = (y !== undefined) ? y : inst.lastMouseY;
      if (typeof cx !== "number" || typeof cy !== "number" || cx < 0 || cy < 0) return false;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(hit instanceof Element)) return false;
      return hit === self.panel || self.panel.contains(hit);
    };
  }

  unbindDockHoverBridge() {
    if (this._bridgedContainer) {
      if (this._onPanelEnter) this._bridgedContainer.removeEventListener("mouseenter", this._onPanelEnter);
      if (this._onPanelLeave) this._bridgedContainer.removeEventListener("mouseleave", this._onPanelLeave);
    }
    this._bridgedContainer = null;
    this._onPanelEnter = null;
    this._onPanelLeave = null;

    // Restore original hit test
    if (this._origHitTest) {
      const inst = window.__HSLDockAutoHideLiveInstance;
      if (inst) inst.isPointerOnDockHitTarget = this._origHitTest;
      this._origHitTest = null;
    }
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

    // Bind dock-hover bridge so hovering nametag keeps dock open
    this.bindDockHoverBridge(panel);
  }
};
