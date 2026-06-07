/**
 * HSLDockAutoHide plugin lifecycle + React patcher shell.
 * Dock behavior/state machine lives in ./engine as DockEngine.
 *
 * The user-panel nameplate positioning is ALWAYS active (not skill-gated).
 * Only the dock auto-hide engine is gated behind rulers_authority >= 1.
 */

const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const { createWarnOnce } = require("../shared/warn-once");
const dc = require("../shared/discord-classes");
const { getPluginInstance, getSkillTreeLevel } = require("../shared/plugin-bridge");

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
  `section${dc.sel.panels} > section`,
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
    return getSkillTreeLevel("rulers_authority") >= 1;
  }

  start() {
    // Restart-safe: clear stale patchers/engines/timers without user-facing stop toast.
    this.stop(false);
    this._toastImpl = _PluginUtils?.createToastHelper?.("HSLDockAutoHide")
      || ((message, type = "info", timeout = null) => {
        const p = (() => {
          try {
            const inst = getPluginInstance("SoloLevelingToasts");
            return inst?.toastEngineVersion >= 2 ? inst : null;
          } catch (_) { return null; }
        })();
        if (p) p.showToast(message, type, timeout, { callerId: "HSLDockAutoHide" });
        else createToast()(message, type);
      });
    this._isStopped = false;

    // Always-on: user panel nameplate positioning
    BdApi.DOM.addStyle(STYLE_ID_USERPANEL, getUserPanelDockCss());
    this._startUserPanelPoller();

    // SkillTree gate: rulers_authority >= 1 (dock auto-hide only)
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

  // Always-on user panel poller
  // Finds the user panel element and adds sl-userpanel-docked class.
  // Once found, slows to a background heartbeat to handle Discord re-renders.

  _startUserPanelPoller() {
    this._stopUserPanelPoller();
    // Event-driven re-detection via BD's built-in observer(mutation)
    // lifecycle hook (defined below). Replaces the prior fast/slow
    // setInterval heartbeat — BD already runs one global MutationObserver
    // and calls observer() on every document mutation, so no extra
    // observer instance is allocated. Initial attempt below catches
    // the case where the panel is already mounted at start time.
    this._trySetupUserPanel();
  }

  _stopUserPanelPoller() {
    // No timer to clear — observer() lifecycle hook is bound to the
    // plugin's lifetime by BD.
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

  // Gated dock auto-hide resources

  _activateDockResources() {
    if (this._dockResourcesActive || this._isStopped) return;
    // If the SkillTree event path got here first, cancel the pending fallback
    // retry timer so it doesn't fire (and leak) after we're already active.
    if (this._skillTreeRetryTimer) {
      clearTimeout(this._skillTreeRetryTimer);
      this._skillTreeRetryTimer = null;
    }
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

      const dockProbe = () => document.querySelector(
        `nav[aria-label='Servers sidebar'], nav[aria-label='Servers'], nav${dc.sel.guilds}`
      );

      const mountEngine = () => {
        if (this._isStopped || this._engineMounted || !this._dockResourcesActive) return;
        this._warnOnce("react-fallback-timeout", "React patcher did not mount - using direct DOM fallback");
        const engine = new DockEngine();
        this._fallbackEngine = engine;
        this._engineMounted = true;
        engine.mount();
      };

      if (dockProbe()) { mountEngine(); return; }

      // Dock not ready yet — wait for it via one-shot MutationObserver
      // (replaces the prior 100ms × 30 setInterval burst). Fires only
      // when DOM actually changes, then disconnects. Hard 3s ceiling
      // preserved as a safety timeout that mounts the engine regardless,
      // matching the prior `attempts >= 30` exit branch.
      this._dockReadyObserver = new MutationObserver((mutations) => {
        // PERF: skip text/attribute-only mutations — we're waiting for an Element node
        const hasElementNode = mutations.some(
          m => m.addedNodes.length > 0 &&
               Array.prototype.some.call(m.addedNodes, n => n.nodeType === 1)
        );
        if (!hasElementNode) return;
        if (this._isStopped || this._engineMounted) {
          this._dockReadyObserver?.disconnect();
          this._dockReadyObserver = null;
          return;
        }
        if (dockProbe()) {
          this._dockReadyObserver.disconnect();
          this._dockReadyObserver = null;
          if (this._dockReadyTimeout) {
            clearTimeout(this._dockReadyTimeout);
            this._dockReadyTimeout = null;
          }
          mountEngine();
        }
      });
      this._dockReadyObserver.observe(document.body, { childList: true, subtree: true });
      this._dockReadyTimeout = setTimeout(() => {
        this._dockReadyTimeout = null;
        if (this._dockReadyObserver) {
          this._dockReadyObserver.disconnect();
          this._dockReadyObserver = null;
        }
        if (!this._isStopped && !this._engineMounted) mountEngine();
      }, 3000);
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
    if (this._dockReadyObserver) {
      try { this._dockReadyObserver.disconnect(); } catch (_) {}
      this._dockReadyObserver = null;
    }
    if (this._dockReadyTimeout) {
      clearTimeout(this._dockReadyTimeout);
      this._dockReadyTimeout = null;
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
    // NOTE: --custom-app-panels-height is owned by UserPanelDockMover (UPDM), not by this
    // plugin. HSLDockAutoHide never sets it, so it must never remove it — doing so would
    // clobber UPDM's value when both plugins are active and dock-skill toggles off.
    // NOTE: user panel stays positioned — only auto-hide transitions are removed.
    // The always-on poller + STYLE_ID_USERPANEL keep the nameplate in the dock area.
    document.querySelectorAll(".sl-hsl-dock-target").forEach((el) => el.classList.remove("sl-hsl-dock-target"));
    document.getElementById("sl-hsl-alert-rail")?.remove();
    // Only show revocation toast when triggered by a skill change, not by full plugin stop.
    if (!this._isStopped) this._toast("Ruler's Authority revoked — dock auto-hide disabled", "info", 2000);
  }

  // BD plugin lifecycle hook: called by BD's single global MutationObserver
  // on every document mutation. Replaces the prior _userPanelPollTimer
  // setInterval (fast/slow heartbeat) — _trySetupUserPanel is idempotent
  // and fast on hot path (cached element check), so re-running on every
  // mutation that adds/removes a panel-selector match is cheap.
  observer(mutation) {
    if (this._isStopped) return;
    if (!mutation) return;
    if (mutation.addedNodes.length === 0 && mutation.removedNodes.length === 0) return;
    for (const list of [mutation.addedNodes, mutation.removedNodes]) {
      for (const node of list) {
        // PERF FIX: skip text/comment nodes and known-irrelevant tags before
        // the heavier matches/querySelector call (matches the pre-filter
        // pattern used elsewhere in the codebase at _deactivateDockResources).
        if (node.nodeType !== 1) continue;
        const tag = node.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "META") continue;
        if (node.matches?.(PANEL_SELECTOR_STR) || node.querySelector?.(PANEL_SELECTOR_STR)) {
          this._trySetupUserPanel();
          return;
        }
      }
    }
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
    this._deactivateDockResources();
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
      }, []);

      return null;
    };

    return this.__DockControllerCached;
  }

};
