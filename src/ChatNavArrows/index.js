import STYLES from "./styles.css";
const { startDomFallback, stopDomFallback } = require("./dom-fallback");
const { createArrowManagerComponent } = require("./arrow-manager-component");
const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const { createWarnOnce } = require("../shared/warn-once");

/**
 * TABLE OF CONTENTS
 * 1) Lifecycle + Settings
 * 2) React Patcher + DOM Fallback
 * 3) Arrow Manager Component
 */

module.exports = class ChatNavArrows {
  constructor() {
    this._patcherId = 'ChatNavArrows';
    this._isStopped = false;
    this._domFallback = null;
    this._settings = Object.assign({ debug: false }, BdApi.Data.load('ChatNavArrows', 'settings'));
    this._warnOnce = createWarnOnce();
  }

  // 1) LIFECYCLE + SETTINGS

  _debugLog(...args) {
    if (!this._settings.debug) return;
    console.log('[ChatNavArrows:DEBUG]', ...args);
  }

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = 'padding:12px;background:#1e1e2e;border-radius:8px;color:#cdd6f4;font-family:system-ui,sans-serif';

    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = this._settings.debug;
    cb.addEventListener('change', () => {
      this._settings.debug = cb.checked;
      BdApi.Data.save('ChatNavArrows', 'settings', this._settings);
    });

    row.appendChild(cb);
    row.appendChild(document.createTextNode('Debug Mode — log arrow diagnostics to console'));
    panel.appendChild(row);
    return panel;
  }

  start() {
    // Idempotent start: clear stale patch/fallback if plugin is reloaded quickly.
    this._stopDomFallback();
    BdApi.Patcher.unpatchAll(this._patcherId);
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }

    this._isStopped = false;
    this._patcherCallbackFired = false;
    this._warnOnce = createWarnOnce();
    BdApi.DOM.addStyle('sl-chat-nav-arrows-css', STYLES);
    this._debugLog('start() called');
    const reactPatched = this._installReactPatcher();
    this._debugLog('React patcher result:', reactPatched);
    if (!reactPatched) {
      this._debugLog('Falling back to DOM mode immediately');
      this._startDomFallback();
    } else {
      // React patcher installed, but MainContent may have already rendered.
      // Attempt to force a re-render so the patcher callback fires.
      requestAnimationFrame(() => {
        if (this._patcherCallbackFired || this._isStopped) return;
        this._debugLog('Patcher callback not yet fired — attempting force re-render');
        this._forceAppRerender();
      });
      // Safety net: if patcher callback still hasn't fired after 2s, start DOM fallback
      this._fallbackTimer = setTimeout(() => {
        if (!this._patcherCallbackFired && !this._isStopped) {
          this._debugLog('Patcher callback not fired after 2s — starting DOM fallback as safety net');
          this._startDomFallback();
        }
      }, 2000);
    }
  }

  stop() {
    this._isStopped = true;
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
    BdApi.Patcher.unpatchAll(this._patcherId);
    BdApi.DOM.removeStyle('sl-chat-nav-arrows-css');
    this._stopDomFallback();

    // Restore hidden jump bars
    document.querySelectorAll('div[class^="jumpToPresentBar_"]').forEach((bar) => {
      bar.style.display = '';
    });
    // Remove any residual arrow elements
    document.querySelectorAll('.sl-chat-nav-arrow').forEach((el) => el.remove());
  }

  /**
   * Walk up the React Fiber tree from #app-mount and call forceUpdate on the
   * first class component found. This nudges MainContent to re-render so our
   * patcher callback fires at least once.
   */
  _forceAppRerender() {
    try {
      const node = document.getElementById('app-mount');
      if (!node) { this._debugLog('forceRerender: #app-mount not found'); return; }
      const fiberKey = Object.keys(node).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) { this._debugLog('forceRerender: no fiber key on #app-mount'); return; }
      let fiber = node[fiberKey];
      let attempts = 0;
      while (fiber && attempts < 50) {
        attempts++;
        if (fiber.stateNode?.forceUpdate) {
          fiber.stateNode.forceUpdate();
          this._debugLog(`forceRerender: forceUpdate called (depth ${attempts})`);
          return;
        }
        fiber = fiber.return;
      }
      this._debugLog(`forceRerender: no forceUpdate-able node found (walked ${attempts} fibers)`);
    } catch (e) {
      this._debugLog('forceRerender error:', e.message);
    }
  }

  // 2) REACT PATCHER + DOM FALLBACK

  _installReactPatcher() {
    let ReactUtils;
    try {
      ReactUtils = loadBdModuleFromPlugins("BetterDiscordReactUtils.js");
    } catch (e) {
      this._debugLog('ReactUtils load error:', e.message);
      ReactUtils = null;
    }
    this._debugLog('ReactUtils loaded:', !!ReactUtils);

    if (!ReactUtils?.patchReactMainContent || !ReactUtils?.injectReactComponent) {
      this._debugLog('ReactUtils unavailable for patching — using DOM fallback');
      return false;
    }

    const pluginInstance = this;
    let patcherCallCount = 0;
    const ok = ReactUtils.patchReactMainContent(this, this._patcherId, (React, appNode, returnValue) => {
      patcherCallCount++;
      pluginInstance._patcherCallbackFired = true;
      if (pluginInstance._fallbackTimer) {
        clearTimeout(pluginInstance._fallbackTimer);
        pluginInstance._fallbackTimer = null;
      }
      if (pluginInstance._domFallback && patcherCallCount === 1) {
        pluginInstance._debugLog('Patcher callback fired — stopping DOM fallback');
        pluginInstance._stopDomFallback();
      }
      pluginInstance._debugLog(`Patcher callback #${patcherCallCount} — appNode:`, !!appNode, 'appNode.props:', !!appNode?.props);
      const component = React.createElement(pluginInstance._ArrowManager, {
        key: 'sl-chat-nav-arrows',
        pluginInstance,
      });
      const injected = ReactUtils.injectReactComponent(appNode, 'sl-chat-nav-arrows-root', component, returnValue);
      pluginInstance._debugLog(`injectReactComponent result: ${injected ? 'injected' : 'already exists (dedup)'}`);
    });

    this._debugLog('patchReactMainContent result:', ok);
    if (!ok) {
      this._warnOnce('maincontent-missing', '[ChatNavArrows] MainContent module not found — using DOM fallback');
      return false;
    }
    return true;
  }

  _startDomFallback() {
    startDomFallback(this);
  }

  _stopDomFallback() {
    stopDomFallback(this);
  }

  // 3) ARROW MANAGER COMPONENT

  get _ArrowManager() {
    // Cache the component so React doesn't re-create it every render
    if (this.__ArrowManagerCached) return this.__ArrowManagerCached;
    this.__ArrowManagerCached = createArrowManagerComponent(BdApi, this);
    return this.__ArrowManagerCached;
  }
};
