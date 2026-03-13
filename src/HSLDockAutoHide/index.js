/**
 * HSLDockAutoHide plugin lifecycle + React patcher shell.
 * Dock behavior/state machine lives in ./engine as DockEngine.
 *
 * The user-panel nameplate positioning is ALWAYS active (not skill-gated).
 * Only the dock auto-hide engine is gated behind rulers_authority >= 1.
 */

const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const { createWarnOnce } = require("../shared/warn-once");

let _PluginUtils;
try { _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

const { createToast } = require("../shared/toast");
const { DockEngine } = require("./engine");
const { getUserPanelDockCss, getDockAutoHideCss } = require("./styles");
const { version: PLUGIN_VERSION } = require("./manifest.json");

const STYLE_ID_USERPANEL = "HSLDockAutoHide-userpanel";
const STYLE_ID_AUTOHIDE  = "HSLDockAutoHide-autohide";

const PANEL_SELECTORS = [
  "section[aria-label='User status and settings']",
  `section${dc.sel.panels} > section`,  // panels_ has no DEFS entry — keep wildcard
];
const PANEL_SELECTOR_STR = PANEL_SELECTORS.join(", ");

module.exports = class HSLDockAutoHide {
  constructor() {
    this._patcherId = "HSLDockAutoHide";
    this._isStopped = true;
    this._engineMounted = false;
    this._fallbackEngine = null;
    this._fallbackTimer = null;
    this._fallbackDelayMs = 1000;
    this._warnOnce = createWarnOnce();
    this._toastImpl = null;
    this._dockResourcesActive = false;
    this._onSkillLevelChanged = null;
    // User panel always-on state
    this._userPanelEl = null;
    this._userPanelPollTimer = null;
    this._userPanelPollIntervalMs = 250;
    this._userPanelSlowPollMs = 10000;
  }

  _toast(message, type = "info", timeout = null) {
    this._toastImpl?.(message, type, timeout);
  }

  _isRulersAuthorityUnlocked() {
    try {
      return (BdApi.Plugins.get("SkillTree")?.instance?.getSkillLevel("rulers_authority") || 0) >= 1;
    } catch (_) { return false; }
  }

  start() {
    // Restart-safe: clear stale patchers/engines/timers without user-facing stop toast.
    this.stop(false);
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

    // ── Always-on: user panel nameplate positioning ──
    BdApi.DOM.addStyle(STYLE_ID_USERPANEL, getUserPanelDockCss());
    this._startUserPanelPoller();

    // ── SkillTree gate: rulers_authority >= 1 (dock auto-hide only) ──
    this._onSkillLevelChanged = (e) => {
      if (e.detail?.skillId !== "rulers_authority") return;
      const level = e.detail.level || 0;
      if (level >= 1 && !this._dockResourcesActive) {
        this._activateDockResources();
      } else if (level < 1 && this._dockResourcesActive) {
        this._deactivateDockResources();
      }
    };
    document.addEventListener("SkillTree:skillLevelChanged", this._onSkillLevelChanged);

    if (this._isRulersAuthorityUnlocked()) {
      this._activateDockResources();
    } else {
      // SkillTree may not have started yet — retry after a delay as fallback.
      // Primary path is the SkillTree:skillLevelChanged event listener above.
      this._skillTreeRetryTimer = setTimeout(() => {
        this._skillTreeRetryTimer = null;
        if (!this._isStopped && !this._dockResourcesActive && this._isRulersAuthorityUnlocked()) {
          this._activateDockResources();
        }
      }, 4000);
      this._toast("HSLDockAutoHide awaiting Ruler's Authority unlock", "info", 2200);
    }
  }

  // ── Always-on user panel poller ─────────────────────────────────────────────
  // Finds the user panel element and adds sl-userpanel-docked class.
  // Once found, slows to a background heartbeat to handle Discord re-renders.

  _startUserPanelPoller() {
    this._stopUserPanelPoller();
    let found = this._trySetupUserPanel();
    if (found) {
      // Slow heartbeat to re-acquire after Discord re-renders
      this._userPanelPollTimer = setInterval(() => this._trySetupUserPanel(), this._userPanelSlowPollMs);
    } else {
      // Fast poll until found, then switch to slow
      this._userPanelPollTimer = setInterval(() => {
        if (this._trySetupUserPanel()) {
          clearInterval(this._userPanelPollTimer);
          this._userPanelPollTimer = setInterval(() => this._trySetupUserPanel(), this._userPanelSlowPollMs);
        }
      }, this._userPanelPollIntervalMs);
    }
  }

  _stopUserPanelPoller() {
    if (this._userPanelPollTimer) {
      clearInterval(this._userPanelPollTimer);
      this._userPanelPollTimer = null;
    }
  }

  _trySetupUserPanel() {
    const panel = document.querySelector(PANEL_SELECTOR_STR);
    if (!panel) return false;

    if (this._userPanelEl && this._userPanelEl !== panel) {
      this._userPanelEl.classList.remove("sl-userpanel-docked");
    }

    this._userPanelEl = panel;
    if (!panel.classList.contains("sl-userpanel-docked")) {
      panel.classList.add("sl-userpanel-docked");
    }
    return true;
  }

  _teardownUserPanel() {
    this._stopUserPanelPoller();
    if (this._userPanelEl) {
      this._userPanelEl.classList.remove("sl-userpanel-docked");
      this._userPanelEl = null;
    }
    document.querySelectorAll(".sl-userpanel-docked").forEach((el) => el.classList.remove("sl-userpanel-docked"));
    BdApi.DOM.removeStyle(STYLE_ID_USERPANEL);
  }

  // ── Gated dock auto-hide resources ──────────────────────────────────────────

  _activateDockResources() {
    if (this._dockResourcesActive || this._isStopped) return;
    this._dockResourcesActive = true;
    this._engineMounted = false;
    this._fallbackEngine = null;
    BdApi.DOM.addStyle(STYLE_ID_AUTOHIDE, getDockAutoHideCss());
    this._installReactPatcher();

    // Wait for Discord's dock nav to exist in DOM before mounting engine.
    // On cold start the DOM may not be ready yet — poll until found.
    this._fallbackTimer = setTimeout(() => {
      this._fallbackTimer = null;
      if (this._isStopped || this._engineMounted) return;

      const dc = require("../shared/discord-classes");
      const dockProbe = () => document.querySelector(
        `nav[aria-label='Servers sidebar'], nav[aria-label='Servers'], nav${dc.sel.guilds}`
      );

      const mountEngine = () => {
        if (this._isStopped || this._engineMounted) return;
        this._warnOnce("react-fallback-timeout", "React patcher did not mount - using direct DOM fallback");
        const engine = new DockEngine();
        this._fallbackEngine = engine;
        this._engineMounted = true;
        engine.mount();
      };

      if (dockProbe()) { mountEngine(); return; }

      // Dock not ready yet — poll briefly
      let attempts = 0;
      this._dockReadyPoller = setInterval(() => {
        attempts++;
        if (this._isStopped || this._engineMounted) {
          clearInterval(this._dockReadyPoller); this._dockReadyPoller = null; return;
        }
        if (dockProbe() || attempts >= 30) {  // ~3s max additional wait
          clearInterval(this._dockReadyPoller); this._dockReadyPoller = null;
          mountEngine();
        }
      }, 100);
    }, this._fallbackDelayMs);

    this._toast(`HSLDockAutoHide v${PLUGIN_VERSION} active (+ UserPanel)`, "success", 2200);
  }

  _deactivateDockResources() {
    if (!this._dockResourcesActive) return;
    this._dockResourcesActive = false;
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
    if (this._dockReadyPoller) {
      clearInterval(this._dockReadyPoller);
      this._dockReadyPoller = null;
    }
    if (this._fallbackEngine) {
      this._fallbackEngine.unmount();
      this._fallbackEngine = null;
    }
    this._engineMounted = false;
    BdApi.Patcher.unpatchAll(this._patcherId);
    BdApi.DOM.removeStyle(STYLE_ID_AUTOHIDE);
    document.body.classList.remove("sl-dock-autohide", "sl-dock-visible", "sl-dock-hidden", "sl-dock-composer-lock");
    document.body.style.removeProperty("--sl-dock-height");
    document.body.style.removeProperty("--sl-dock-peek");
    // NOTE: user panel stays positioned — only auto-hide transitions are removed.
    // The always-on poller + STYLE_ID_USERPANEL keep the nameplate in the dock area.
    document.querySelectorAll(".sl-hsl-dock-target").forEach((el) => el.classList.remove("sl-hsl-dock-target"));
    document.getElementById("sl-hsl-alert-rail")?.remove();
    this._toast("Ruler's Authority revoked — dock auto-hide disabled", "info", 2000);
  }

  stop(showToast = true) {
    this._isStopped = true;
    // Clear SkillTree retry timer
    if (this._skillTreeRetryTimer) {
      clearTimeout(this._skillTreeRetryTimer);
      this._skillTreeRetryTimer = null;
    }
    // Remove skill listener
    if (this._onSkillLevelChanged) {
      document.removeEventListener("SkillTree:skillLevelChanged", this._onSkillLevelChanged);
      this._onSkillLevelChanged = null;
    }
    // Tear down dock resources if active
    if (this._dockResourcesActive) {
      this._dockResourcesActive = false;
      if (this._fallbackTimer) {
        clearTimeout(this._fallbackTimer);
        this._fallbackTimer = null;
      }
      if (this._dockReadyPoller) {
        clearInterval(this._dockReadyPoller);
        this._dockReadyPoller = null;
      }
      if (this._fallbackEngine) {
        this._fallbackEngine.unmount();
        this._fallbackEngine = null;
      }
      this._engineMounted = false;
      BdApi.Patcher.unpatchAll(this._patcherId);
      BdApi.DOM.removeStyle(STYLE_ID_AUTOHIDE);
      document.body.classList.remove("sl-dock-autohide", "sl-dock-visible", "sl-dock-hidden", "sl-dock-composer-lock");
      document.body.style.removeProperty("--sl-dock-height");
      document.body.style.removeProperty("--sl-dock-peek");
      document.body.style.removeProperty("--custom-app-panels-height");
      document.querySelectorAll(".sl-hsl-dock-target").forEach((el) => el.classList.remove("sl-hsl-dock-target"));
      document.getElementById("sl-hsl-alert-rail")?.remove();
    }
    // Tear down always-on user panel (full plugin stop)
    this._teardownUserPanel();
    if (showToast) this._toast("HSLDockAutoHide stopped", "info", 2000);
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
    // Legacy — returns combined CSS for backward compat
    return getUserPanelDockCss() + getDockAutoHideCss();
  }
};
