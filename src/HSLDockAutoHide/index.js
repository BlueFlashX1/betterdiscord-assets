/**
 * HSLDockAutoHide plugin lifecycle + React patcher shell.
 * Dock behavior/state machine lives in ./engine as DockEngine.
 */

const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const { createWarnOnce } = require("../shared/warn-once");

let _PluginUtils;
try { _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

const { createToast } = require("../shared/toast");
const { DockEngine } = require("./engine");
const { getHslDockAutoHideCss } = require("./styles");
const { version: PLUGIN_VERSION } = require("./manifest.json");

module.exports = class HSLDockAutoHide {
  constructor() {
    this._patcherId = "HSLDockAutoHide";
    this._isStopped = false;
    this._engineMounted = false;
    this._fallbackEngine = null;
    this._fallbackTimer = null;
    this._warnOnce = createWarnOnce();
    this._toastImpl = null;
  }

  _toast(message, type = "info", timeout = null) {
    this._toastImpl?.(message, type, timeout);
  }

  start() {
    this._toastImpl = _PluginUtils?.createToastHelper?.("HSLDockAutoHide")
      || ((message, type = "info", timeout = null) => {
        const p = (() => {
          try {
            const plugin = BdApi.Plugins.get("SoloLevelingToasts");
            return plugin?.instance?.toastEngineVersion >= 2 ? plugin.instance : null;
          } catch (_) { return null; }
        })();
        if (p) p.showToast(message, type, timeout, { callerId: "HSLDockAutoHide" });
        else createToast()(message, type);
      });
    this._isStopped = false;
    this._engineMounted = false;
    this._fallbackEngine = null;
    BdApi.DOM.addStyle("HSLDockAutoHide", this.getCSS());
    this._installReactPatcher();

    this._fallbackTimer = setTimeout(() => {
      this._fallbackTimer = null;
      if (!this._isStopped && !this._engineMounted) {
        this._warnOnce("react-fallback-timeout", "React patcher did not mount - using direct DOM fallback");
        const engine = new DockEngine();
        this._fallbackEngine = engine;
        this._engineMounted = true;
        engine.mount();
      }
    }, 3000);

    this._toast(`HSLDockAutoHide v${PLUGIN_VERSION} active (+ UserPanel)`, "success", 2200);
  }

  stop() {
    this._isStopped = true;
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
    if (this._fallbackEngine) {
      this._fallbackEngine.unmount();
      this._fallbackEngine = null;
    }
    this._engineMounted = false;
    BdApi.Patcher.unpatchAll(this._patcherId);
    BdApi.DOM.removeStyle("HSLDockAutoHide");
    document.body.classList.remove("sl-dock-autohide", "sl-dock-visible", "sl-dock-hidden", "sl-dock-composer-lock");
    document.body.style.removeProperty("--sl-dock-height");
    document.body.style.removeProperty("--sl-dock-peek");
    document.body.style.removeProperty("--custom-app-panels-height");
    document.querySelectorAll(".sl-hsl-dock-target").forEach((el) => el.classList.remove("sl-hsl-dock-target"));
    document.querySelectorAll(".sl-userpanel-docked").forEach((el) => el.classList.remove("sl-userpanel-docked"));
    document.getElementById("sl-hsl-alert-rail")?.remove();
    this._toast("HSLDockAutoHide stopped", "info", 2000);
  }

  _installReactPatcher() {
    let ReactUtils;
    try {
      ReactUtils = loadBdModuleFromPlugins("BetterDiscordReactUtils.js");
    } catch (_) {
      ReactUtils = null;
    }

    if (!ReactUtils?.patchReactMainContent || !ReactUtils?.injectReactComponent) {
      this._warnOnce("react-utils-missing", "BetterDiscordReactUtils unavailable; relying on direct DOM fallback");
      return;
    }

    const pluginInstance = this;
    const ok = ReactUtils.patchReactMainContent(this, this._patcherId, (React, appNode, returnValue) => {
      const component = React.createElement(pluginInstance._DockController, {
        key: "sl-dock-autohide",
        pluginInstance,
      });
      ReactUtils.injectReactComponent(appNode, "sl-dock-autohide-root", component, returnValue);
    });

    if (!ok) {
      this._warnOnce("maincontent-patch-missing", "MainContent React patch unavailable; relying on direct DOM fallback");
    }
  }

  get _DockController() {
    if (this.__DockControllerCached) return this.__DockControllerCached;

    this.__DockControllerCached = ({ pluginInstance }) => {
      const React = BdApi.React;
      const engineRef = React.useRef(null);

      React.useEffect(() => {
        if (pluginInstance._isStopped) return;

        pluginInstance._engineMounted = true;
        if (pluginInstance._fallbackTimer) {
          clearTimeout(pluginInstance._fallbackTimer);
          pluginInstance._fallbackTimer = null;
        }
        if (pluginInstance._fallbackEngine) {
          pluginInstance._fallbackEngine.unmount();
          pluginInstance._fallbackEngine = null;
        }

        const engine = new DockEngine();
        engineRef.current = engine;
        engine.mount();
        return () => {
          engine.unmount();
          engineRef.current = null;
        };
      }, []);

      React.useEffect(() => {
        if (!engineRef.current || pluginInstance._isStopped) return;
        engineRef.current.syncDock();
        engineRef.current.trySetupUserPanel();
      });

      return null;
    };

    return this.__DockControllerCached;
  }

  getCSS() {
    return getHslDockAutoHideCss();
  }
};
