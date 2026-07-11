import STYLES from "./styles.css";
const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const { createToast } = require("../shared/toast");
const { version: PLUGIN_VERSION } = require("./manifest.json");

let _PluginUtils = null;
try { _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

module.exports = class UserPanelDockMover {
  constructor() {
    this.pluginId = "UserPanelDockMover";
    this.instanceKey = "__UserPanelDockMoverInstance";
    this.panelSelector = "section[aria-label='User status and settings']";
    this.dockSelector = "nav[aria-label='Servers sidebar']";
    this.panel = null;
    this.dock = null;
    this.isPositioned = false;
    this._stopped = false;
    this._layoutUnsub = null;
    this.debug = false;
  }

  _toast(message, type = "info", timeout = null) {
    if (this._toastEngine) {
      this._toastEngine.showToast(message, type, timeout, { callerId: "userPanelDockMover" });
    } else {
      createToast()(message, type);
    }
  }

  _logDebug(...args) {
    if (!this.debug) return;
    console.debug("[UserPanelDockMover]", ...args);
  }

  // 1) LIFECYCLE
  start() {
    this._toastEngine = (() => {
      try {
        const p = BdApi.Plugins.get("SoloLevelingToasts");
        return p?.instance?.toastEngineVersion >= 2 ? p.instance : null;
      } catch { return null; }
    })();
    try {
      const prev = window[this.instanceKey];
      if (prev && prev !== this && typeof prev.stop === "function") prev.stop();
    } catch (error) {
      this._logDebug("Failed to check for zombie singleton instance", error);
    }

    this.stop({ silent: true });

    try {
      window[this.instanceKey] = this;
    } catch (error) {
      this._logDebug("Failed to register singleton instance", error);
    }

    this._stopped = false;

    // NOTE: Dock-hover bridge code was removed in v3.7.0.
    // HSLDockAutoHide v4.0.0+ handles user panel hover internally via
    // DockEngine.bindUserPanelHover(). When this plugin runs standalone
    // (without HSLDockAutoHide), there is no auto-hide dock to bridge to.

    document.body.style.removeProperty("--sl-userpanel-width");

    this._origPanelsHeight = document.body.style.getPropertyValue("--custom-app-panels-height") || null;
    document.body.style.setProperty("--custom-app-panels-height", "0px");

    this.injectStyles();

    this.trySetup();
    // Event-driven re-detection via BD's built-in observer(mutation)
    // lifecycle hook (defined below). Replaces the prior 1s startup
    // poll and the 10s post-success safety-net poll. BD runs a single
    // global MutationObserver and calls our observer() method for
    // every document mutation, so no extra observer instance is
    // allocated.

    if (_PluginUtils?.LayoutObserverBus) {
      this._layoutUnsub = _PluginUtils.LayoutObserverBus.subscribe(
        `${this.pluginId}:dock-sync`,
        () => this.trySetup(),
        120
      );
    }

    this._toast(`UserPanelDockMover v${PLUGIN_VERSION} active`, "success", 2200);
  }

  stop({ silent = false } = {}) {
    this._stopped = true;
    if (this._layoutUnsub) {
      this._layoutUnsub();
      this._layoutUnsub = null;
    }

    if (this.panel) {
      this.panel.classList.remove("sl-userpanel-docked");
      this.panel.style.removeProperty("right");
      this.panel.style.removeProperty("left");
    }

    document.body.style.removeProperty("--sl-userpanel-width");

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
      this._logDebug("Failed to clear singleton instance key", error);
    }

    if (!silent) {
      this._toast("UserPanelDockMover stopped", "info", 2200);
    }
  }

  // 2) STYLING
  injectStyles() {
    // Always inject own CSS — HSLDockAutoHide defers its CSS behind a skill
    // gate, so we can't rely on it being present. Duplicate rules are harmless.
    if (BdApi?.DOM?.addStyle) BdApi.DOM.addStyle(this.pluginId, STYLES);
  }

  // 3) DOCK/PANEL SYNC LOOP
  trySetup() {
    // Fast path: skip DOM queries if cached elements are still connected
    if (this.isPositioned && this.panel?.isConnected && this.dock?.isConnected) {
      if (!this.panel.classList.contains("sl-userpanel-docked")) {
        this.panel.classList.add("sl-userpanel-docked");
      }
      return;
    }

    const panel = document.querySelector(this.panelSelector);
    const dock = document.querySelector(this.dockSelector);

    if (!panel || !dock) return;

    if (this.isPositioned && panel === this.panel && dock === this.dock) {
      if (!panel.classList.contains("sl-userpanel-docked")) {
        panel.classList.add("sl-userpanel-docked");
      }
      return;
    }

    if (this.panel && this.panel !== panel) {
      this.panel.classList.remove("sl-userpanel-docked");
      this.panel.style.removeProperty("right");
      this.panel.style.removeProperty("left");
    }

    this.panel = panel;
    this.dock = dock;

    panel.classList.add("sl-userpanel-docked");
    this.isPositioned = true;
    // Slow-down poll logic removed — BD observer(mutation) hook below
    // handles re-detection without any timer.
  }

  // BD plugin lifecycle hook: called for every document mutation by the
  // global observer BD already runs. Replaces the previous start-up /
  // safety-net setInterval polls. trySetup() is idempotent and fast on
  // its hot path (skips DOM queries when cached refs are still
  // connected) so re-running on every relevant mutation is cheap.
  observer(mutation) {
    if (this._stopped) return;
    if (!mutation) return;
    if (document.hidden) return;
    if (mutation.addedNodes.length === 0 && mutation.removedNodes.length === 0) return;
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;
      const hit =
        node.matches?.(this.panelSelector) ||
        node.matches?.(this.dockSelector) ||
        node.querySelector?.(this.panelSelector) ||
        node.querySelector?.(this.dockSelector);
      if (hit) { this.trySetup(); return; }
    }
    for (const node of mutation.removedNodes) {
      if (node.nodeType !== 1) continue;
      // A removed node's subtree is already detached — querySelector into it
      // is pointless. matches() on the node itself is sufficient.
      const hit =
        node.matches?.(this.panelSelector) ||
        node.matches?.(this.dockSelector);
      if (hit) { this.trySetup(); return; }
    }
  }
};
