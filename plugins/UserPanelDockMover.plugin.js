/**
 * @name UserPanelDockMover
 * @description Visually moves the user status/settings panel into the horizontal server list dock via CSS positioning.
 * @version 3.7.0
 * @author BlueFlashX1
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/shared/bd-module-loader.js
var require_bd_module_loader = __commonJS({
  "src/shared/bd-module-loader.js"(exports2, module2) {
    function loadBdModuleFromPlugins2(fileName) {
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
          `${source}
return module.exports || exports || null;`
        );
        const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
        const candidate = loaded || moduleObj.exports;
        if (typeof candidate === "function") return candidate;
        if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) {
          return candidate;
        }
      } catch (_) {
      }
      return null;
    }
    module2.exports = {
      loadBdModuleFromPlugins: loadBdModuleFromPlugins2
    };
  }
});

// src/UserPanelDockMover/styles.css
var styles_default = '/* \u2500\u2500 Docked user panel \u2014 right-side overlay on dock \u2500\u2500\n   pointer-events: none on the section so horizontal scroll passes\n   through to the dock underneath. Children re-enable pointer-events.\n   Does NOT modify the dock itself. \u2500\u2500 */\nsection[aria-label="User status and settings"].sl-userpanel-docked {\n  position: fixed !important;\n  right: 0 !important;\n  left: auto !important;\n  z-index: 42 !important;\n  pointer-events: none !important;\n\n  /* Fixed width */\n  height: var(--sl-dock-height, 80px) !important;\n  width: 300px !important;\n  min-width: 300px !important;\n  max-width: 300px !important;\n\n  /* Transparent \u2014 scroll/click passes through to dock */\n  background: transparent !important;\n  background-color: transparent !important;\n  background-image: none !important;\n  border: none !important;\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  padding: 4px 12px !important;\n  margin: 0 !important;\n\n  /* Row layout */\n  display: flex !important;\n  flex-direction: row !important;\n  align-items: center !important;\n  gap: 0 !important;\n  overflow: hidden !important;\n\n  /* Transition to follow dock show/hide */\n  transition: bottom 240ms cubic-bezier(0.2, 0.75, 0.25, 1),\n              opacity 180ms ease !important;\n}\n\n/* When dock is hidden, push panel off-screen matching dock peek */\nbody.sl-dock-autohide.sl-dock-hidden section[aria-label="User status and settings"].sl-userpanel-docked {\n  bottom: calc(-1 * (var(--sl-dock-height, 80px) - var(--sl-dock-peek, 8px))) !important;\n}\n\n/* When dock is visible, panel sits at bottom */\nbody.sl-dock-autohide.sl-dock-visible section[aria-label="User status and settings"].sl-userpanel-docked {\n  bottom: 0 !important;\n}\n\n/* Kill transition during composer lock */\nbody.sl-dock-autohide.sl-dock-composer-lock section[aria-label="User status and settings"].sl-userpanel-docked {\n  transition: none !important;\n  bottom: calc(-1 * (var(--sl-dock-height, 80px) - var(--sl-dock-peek, 8px))) !important;\n}\n\n/* \u2500\u2500 Voice/connection wrapper \u2014 hide when empty, compact when active \u2500\u2500 */\nsection[aria-label="User status and settings"].sl-userpanel-docked > div[class^="wrapper_"]:empty {\n  display: none !important;\n}\n\nsection[aria-label="User status and settings"].sl-userpanel-docked > div[class^="wrapper_"] {\n  pointer-events: auto !important;\n  margin: 0 6px 0 0 !important;\n  padding: 0 !important;\n  flex-shrink: 0 !important;\n}\n\n/* \u2500\u2500 Avatar + name + buttons container \u2014 re-enable clicks, solid bg \u2500\u2500 */\nsection[aria-label="User status and settings"].sl-userpanel-docked > div[class^="container_"] {\n  pointer-events: auto !important;\n  display: flex !important;\n  flex-direction: row !important;\n  align-items: center !important;\n  padding: 4px 12px !important;\n  margin: 0 !important;\n  border-radius: 0 !important;\n  background: rgba(8, 10, 20, 0.96) !important;\n  background-image: none !important;\n  border-left: 1px solid rgba(138, 43, 226, 0.22) !important;\n  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3) !important;\n  gap: 10px !important;\n  min-width: 0 !important;\n  width: 100% !important;\n  max-width: 100% !important;\n  flex: 1 1 0% !important;\n  height: auto !important;\n  max-height: calc(var(--sl-dock-height, 80px) - 10px) !important;\n  overflow: hidden !important;\n}\n\n/* \u2500\u2500 Force ALL descendants to respect flex layout \u2500\u2500 */\nsection[aria-label="User status and settings"].sl-userpanel-docked > div[class^="container_"] > * {\n  max-width: none !important;\n  min-width: 0 !important;\n}\n\n/* \u2500\u2500 Username text \u2014 stretch to fill available space \u2500\u2500 */\nsection[aria-label="User status and settings"].sl-userpanel-docked [class^="nameTag_"],\nsection[aria-label="User status and settings"].sl-userpanel-docked [class^="panelSubtextContainer_"],\nsection[aria-label="User status and settings"].sl-userpanel-docked [class^="panelTitleContainer_"] {\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n  max-width: none !important;\n  width: auto !important;\n  flex: 1 1 0% !important;\n  min-width: 0 !important;\n}\n\n/* \u2500\u2500 The clickable user-info wrapper that Discord constrains \u2500\u2500 */\nsection[aria-label="User status and settings"].sl-userpanel-docked [class^="avatarWrapper_"],\nsection[aria-label="User status and settings"].sl-userpanel-docked [class*="withTagAsButton_"],\nsection[aria-label="User status and settings"].sl-userpanel-docked [class^="canCopy_"] {\n  flex: 1 1 0% !important;\n  min-width: 0 !important;\n  max-width: none !important;\n  width: auto !important;\n  overflow: hidden !important;\n}\n\n/* \u2500\u2500 Avatar size \u2500\u2500 */\nsection[aria-label="User status and settings"].sl-userpanel-docked [class^="avatar_"] {\n  width: 32px !important;\n  height: 32px !important;\n  min-width: 32px !important;\n  flex-shrink: 0 !important;\n}\n\n/* \u2500\u2500 Action buttons \u2014 compact row, pushed to the right \u2500\u2500 */\nsection[aria-label="User status and settings"].sl-userpanel-docked [class^="actionButtons_"],\nsection[aria-label="User status and settings"].sl-userpanel-docked [class^="actions_"] {\n  display: flex !important;\n  flex-direction: row !important;\n  align-items: center !important;\n  gap: 2px !important;\n  flex-shrink: 0 !important;\n  flex-grow: 0 !important;\n  margin-left: auto !important;\n}\n\nsection[aria-label="User status and settings"].sl-userpanel-docked [class^="actionButtons_"] button,\nsection[aria-label="User status and settings"].sl-userpanel-docked [class^="actions_"] button {\n  width: 28px !important;\n  height: 28px !important;\n  min-width: 28px !important;\n  padding: 2px !important;\n}\n\n/* \u2500\u2500 Reclaim sidebar space \u2014 panel is visually in the dock now \u2500\u2500\n   The panels wrapper in the sidebar still reserves height for the\n   user panel. Collapse it so the DM list extends into the gap. */\ndiv[class^="panels_"] section[aria-label="User status and settings"].sl-userpanel-docked {\n  height: 0 !important;\n  min-height: 0 !important;\n  max-height: 0 !important;\n  padding: 0 !important;\n  margin: 0 !important;\n  overflow: hidden !important;\n}\n\n/* Collapse the panels wrapper itself when panel is docked */\ndiv[class^="panels_"]:has(section[aria-label="User status and settings"].sl-userpanel-docked) {\n  height: 0 !important;\n  min-height: 0 !important;\n  max-height: 0 !important;\n  padding: 0 !important;\n  margin: 0 !important;\n  overflow: hidden !important;\n}\n';

// src/UserPanelDockMover/index.js
var { loadBdModuleFromPlugins } = require_bd_module_loader();
var _PluginUtils = null;
try {
  _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js");
} catch (_) {
  _PluginUtils = null;
}
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
      var _a;
      try {
        const p = BdApi.Plugins.get("SoloLevelingToasts");
        return ((_a = p == null ? void 0 : p.instance) == null ? void 0 : _a.toastEngineVersion) >= 2 ? p.instance : null;
      } catch {
        return null;
      }
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
    document.body.style.removeProperty("--sl-userpanel-width");
    this._origPanelsHeight = document.body.style.getPropertyValue("--custom-app-panels-height") || null;
    document.body.style.setProperty("--custom-app-panels-height", "0px");
    this.injectStyles();
    this.trySetup();
    this.pollInterval = setInterval(() => {
      if (document.hidden) return;
      this.trySetup();
    }, 2e3);
    if (_PluginUtils == null ? void 0 : _PluginUtils.LayoutObserverBus) {
      this._layoutUnsub = _PluginUtils.LayoutObserverBus.subscribe(
        `${this.pluginId}:dock-sync`,
        () => this.trySetup(),
        500
      );
    }
    this._toast("UserPanelDockMover v3.7.0 active", "success", 2200);
  }
  stop({ silent = false } = {}) {
    var _a;
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
    if ((_a = BdApi == null ? void 0 : BdApi.DOM) == null ? void 0 : _a.removeStyle) {
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
    var _a;
    const hslActive = BdApi.Plugins.isEnabled("HSLDockAutoHide");
    if (hslActive) return;
    if ((_a = BdApi == null ? void 0 : BdApi.DOM) == null ? void 0 : _a.addStyle) BdApi.DOM.addStyle(this.pluginId, styles_default);
  }
  // =========================================================================
  // 3) DOCK/PANEL SYNC LOOP
  // =========================================================================
  trySetup() {
    var _a, _b;
    if (this.isPositioned && ((_a = this.panel) == null ? void 0 : _a.isConnected) && ((_b = this.dock) == null ? void 0 : _b.isConnected)) {
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
    if (this.pollInterval && !this._pollSlowed) {
      clearInterval(this.pollInterval);
      this.pollInterval = setInterval(() => {
        if (document.hidden) return;
        this.trySetup();
      }, 1e4);
      this._pollSlowed = true;
    }
  }
};
