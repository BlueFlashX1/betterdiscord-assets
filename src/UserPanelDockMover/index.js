import STYLES from "./styles.css";

/** Load a local shared module from BD's plugins folder. */
const _bdLoad = (fileName) => {
  if (!fileName) return null;
  try {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), "utf8");
    const moduleObj = { exports: {} };
    const factory = new Function(
      "module",
      "exports",
      "require",
      "BdApi",
      `${source}\nreturn module.exports || exports || null;`
    );
    const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
    const candidate = loaded || moduleObj.exports;
    if (typeof candidate === "function") return candidate;
    if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) return candidate;
  } catch (_) {}
  return null;
};

let _PluginUtils = null;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

// =========================================================================
// PLUGIN
// =========================================================================

module.exports = class UserPanelDockMover {
  constructor() {
    this.pluginId = "UserPanelDockMover";
    this.version = "3.7.0";
    this.instanceKey = "__UserPanelDockMoverInstance";
    this.panelSelector = "section[aria-label='User status and settings']";
    this.dockSelector = "nav[aria-label='Servers sidebar']";
    this.panel = null;
    this.dock = null;
    this.pollInterval = null;
    this.isPositioned = false;
    this._pollSlowed = false;
    this._layoutUnsub = null;
    this.debug = false;
  }

  _toast(message, type = "info", timeout = null) {
    if (this._toastEngine) {
      this._toastEngine.showToast(message, type, timeout, { callerId: "userPanelDockMover" });
    } else {
      BdApi.UI.showToast(message, { type: type === "level-up" ? "info" : type });
    }
  }

  _logDebug(...args) {
    if (!this.debug) return;
    console.debug("[UserPanelDockMover]", ...args);
  }

  // =========================================================================
  // 1) LIFECYCLE
  // =========================================================================
  start() {
    this._toastEngine = (() => {
      try {
        const p = BdApi.Plugins.get("SoloLevelingToasts");
        return p?.instance?.toastEngineVersion >= 2 ? p.instance : null;
      } catch { return null; }
    })();
    this.stop({ silent: true });

    try {
      const prev = window[this.instanceKey];
      if (prev && prev !== this && typeof prev.stop === "function") prev.stop();
      window[this.instanceKey] = this;
    } catch (error) {
      this._logDebug("Failed to register singleton instance", error);
    }

    this._pollSlowed = false;

    // NOTE: Dock-hover bridge code was removed in v3.7.0.
    // HSLDockAutoHide v4.0.0+ handles user panel hover internally via
    // DockEngine.bindUserPanelHover(). When this plugin runs standalone
    // (without HSLDockAutoHide), there is no auto-hide dock to bridge to.

    document.body.style.removeProperty("--sl-userpanel-width");

    this._origPanelsHeight = document.body.style.getPropertyValue("--custom-app-panels-height") || null;
    document.body.style.setProperty("--custom-app-panels-height", "0px");

    this.injectStyles();

    this.trySetup();
    this.pollInterval = setInterval(() => {
      if (document.hidden) return;
      this.trySetup();
    }, 2000);

    if (_PluginUtils?.LayoutObserverBus) {
      this._layoutUnsub = _PluginUtils.LayoutObserverBus.subscribe(
        `${this.pluginId}:dock-sync`,
        () => this.trySetup(),
        500
      );
    }

    this._toast("UserPanelDockMover v3.7.0 active", "success", 2200);
  }

  stop({ silent = false } = {}) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
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

  // =========================================================================
  // 2) STYLING
  // =========================================================================
  injectStyles() {
    // HSLDockAutoHide already injects the identical .sl-userpanel-docked CSS
    // ruleset. Skip duplicate injection when it's active to avoid redundancy.
    const hslActive = BdApi.Plugins.isEnabled("HSLDockAutoHide");
    if (hslActive) return;

    if (BdApi?.DOM?.addStyle) BdApi.DOM.addStyle(this.pluginId, STYLES);
  }

  // =========================================================================
  // 3) DOCK/PANEL SYNC LOOP
  // =========================================================================
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
      this._pollSlowed = false;
    }

    this.panel = panel;
    this.dock = dock;

    panel.classList.add("sl-userpanel-docked");
    this.isPositioned = true;

    // PERF: Slow down poll after successful setup (2s → 10s safety net)
    if (this.pollInterval && !this._pollSlowed) {
      clearInterval(this.pollInterval);
      this.pollInterval = setInterval(() => {
        if (document.hidden) return;
        this.trySetup();
      }, 10000);
      this._pollSlowed = true;
    }
  }
};
