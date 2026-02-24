/**
 * @name HSLWheelBridge
 * @description Makes horizontal wheel gestures work on rotated Horizontal Server List by mapping deltaX/Shift+wheel into scrollTop.
 * @version 2.0.0
 * @author Solo Leveling Theme Dev
 *
 * ============================================================================
 * REACT PATCHER ARCHITECTURE (v2.0.0)
 * ============================================================================
 *
 * Injects via MainContent.Z React patcher (same proven target as ChatNavArrows,
 * HSLDockAutoHide, SoloLevelingStats).  A lightweight React functional component
 * re-discovers the HSL scroller on every render and attaches the wheel handler
 * via useEffect.  Replaces the v1.x MutationObserver on document.body which
 * fired on every DOM mutation — expensive and unnecessary.
 *
 * Includes 3s direct DOM fallback for when the React patcher's findInTree
 * fails (same resilience pattern as HSLDockAutoHide v4.0.0).
 *
 * Previous approach (v1.x): MutationObserver on document.body with
 * { childList: true, subtree: true } — fired on every DOM change app-wide.
 */

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

// Scroller selectors — primary + fallbacks for Discord class name changes
const HSL_SCROLLER_SELECTORS = [
  "nav[aria-label='Servers sidebar'] ul[role='tree'] > div[class^='itemsContainer_'] > div[class^='stack_'][class*='scroller_'][class*='scrollerBase_']",
  "nav[aria-label='Servers'] ul[role='tree'] [class*='scroller_']",
  "nav[class*='guilds_'] [class*='scroller_'][class*='scrollerBase_']",
];

// TTL cache for scroller lookups — avoids 1-3 querySelector calls per render
const _scrollerCache = {};

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

function findHSLScroller() {
  if (_PluginUtils) {
    return _PluginUtils.querySelectorFallback(HSL_SCROLLER_SELECTORS, {
      cache: _scrollerCache, cacheKey: "hsl-scroller", ttlMs: 2000,
    });
  }
  // Inline fallback with cache
  const entry = _scrollerCache["hsl-scroller"];
  if (entry && Date.now() - entry.time < 2000 && entry.el && entry.el.isConnected) {
    return entry.el;
  }
  let scroller = null;
  for (const sel of HSL_SCROLLER_SELECTORS) {
    scroller = document.querySelector(sel);
    if (scroller) break;
  }
  _scrollerCache["hsl-scroller"] = scroller ? { el: scroller, time: Date.now() } : null;
  return scroller;
}

function handleWheel(event) {
  const scroller = event.currentTarget;
  if (!scroller) return;

  const hasHorizontalGesture = Math.abs(event.deltaX) > 0.01;
  const shiftWheel = event.shiftKey && Math.abs(event.deltaY) > 0.01;

  // Block pure vertical scrolls on the dock — they shouldn't do anything.
  if (!hasHorizontalGesture && !shiftWheel) {
    if (Math.abs(event.deltaY) > 0.01) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }

  const delta = hasHorizontalGesture ? event.deltaX : event.deltaY;
  scroller.scrollTop += delta;
  event.preventDefault();
  event.stopPropagation();
}

// ─── WheelBridgeEngine — lightweight imperative manager ─────────────────────

class WheelBridgeEngine {
  constructor() {
    this.scroller = null;
    this.handleWheel = handleWheel;
  }

  syncScroller() {
    const nextScroller = findHSLScroller();
    if (nextScroller === this.scroller) return;
    this.detach();
    if (!nextScroller) return;
    nextScroller.addEventListener('wheel', this.handleWheel, { passive: false });
    this.scroller = nextScroller;
  }

  detach() {
    if (!this.scroller) return;
    this.scroller.removeEventListener('wheel', this.handleWheel);
    this.scroller = null;
  }

  unmount() {
    this.detach();
  }
}

// ─── Plugin Class ───────────────────────────────────────────────────────────

module.exports = class HSLWheelBridge {
  constructor() {
    this._patcherId = 'HSLWheelBridge';
    this._isStopped = false;
    this._engineMounted = false;
    this._fallbackEngine = null;
    this._fallbackTimer = null;
  }

  start() {
    this._isStopped = false;
    this._engineMounted = false;
    this._fallbackEngine = null;
    this._installReactPatcher();

    // Fallback: if React patcher does not mount within 3s, mount engine directly
    this._fallbackTimer = setTimeout(() => {
      this._fallbackTimer = null;
      if (!this._isStopped && !this._engineMounted) {
        console.warn('[HSLWheelBridge] React patcher did not mount — using direct DOM fallback');
        const engine = new WheelBridgeEngine();
        this._fallbackEngine = engine;
        this._engineMounted = true;
        engine.syncScroller();
        // Poll for scroller changes (replaces MutationObserver, much cheaper)
        this._fallbackPoll = setInterval(() => {
          if (this._isStopped || document.hidden) return;
          engine.syncScroller();
        }, 2000);
      }
    }, 3000);

    BdApi.UI.showToast('HSLWheelBridge active', { type: 'success', timeout: 2000 });
  }

  stop() {
    this._isStopped = true;
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
    if (this._fallbackPoll) {
      clearInterval(this._fallbackPoll);
      this._fallbackPoll = null;
    }
    if (this._fallbackEngine) {
      this._fallbackEngine.unmount();
      this._fallbackEngine = null;
    }
    this._engineMounted = false;
    BdApi.Patcher.unpatchAll(this._patcherId);
    BdApi.UI.showToast('HSLWheelBridge stopped', { type: 'info', timeout: 2000 });
  }

  // ── React Patcher — MainContent.Z ─────────────────────────────────────────

  _installReactPatcher() {
    let ReactUtils;
    try {
      ReactUtils = _bdLoad('BetterDiscordReactUtils.js');
    } catch (_) {
      ReactUtils = null;
    }

    if (ReactUtils) {
      const pluginInstance = this;
      const ok = ReactUtils.patchReactMainContent(this, this._patcherId, (React, appNode, returnValue) => {
        const component = React.createElement(pluginInstance._WheelController, {
          key: 'sl-wheel-bridge',
          pluginInstance,
        });
        ReactUtils.injectReactComponent(appNode, 'sl-wheel-bridge-root', component, returnValue);
      });
      if (!ok) {
        console.error('[HSLWheelBridge] MainContent module not found — plugin inactive');
      }
      return;
    }

    // Inline fallback if BetterDiscordReactUtils.js is not available
    // Multi-strategy MainContent finder (resilient to Discord renames)
    const _mcStrings = ['baseLayer', 'appMount', 'app-mount'];
    let MainContent = null, _mcKey = 'Z';
    if (typeof BdApi.Webpack.getWithKey === 'function') {
      for (const s of _mcStrings) {
        try { const r = BdApi.Webpack.getWithKey(m => typeof m === 'function' && m.toString().includes(s)); if (r && r[0]) { MainContent = r[0]; _mcKey = r[1]; break; } } catch (_) {}
      }
    }
    if (!MainContent) {
      for (const s of _mcStrings) {
        try { const mod = BdApi.Webpack.getByStrings(s, { defaultExport: false }); if (mod) { for (const k of ['Z','ZP','default']) { if (typeof mod[k] === 'function') { MainContent = mod; _mcKey = k; break; } } if (!MainContent) { const k = Object.keys(mod).find(k => typeof mod[k] === 'function'); if (k) { MainContent = mod; _mcKey = k; } } if (MainContent) break; } } catch (_) {}
      }
    }
    if (!MainContent) {
      console.error('[HSLWheelBridge] MainContent module not found (all strategies exhausted) — using DOM fallback');
      return;
    }

    const pluginInstance = this;

    BdApi.Patcher.after(this._patcherId, MainContent, _mcKey, (_this, _args, returnValue) => {
      try {
        if (pluginInstance._isStopped) return returnValue;

        const appNode = BdApi.Utils.findInTree(
          returnValue,
          (prop) =>
            prop && prop.props &&
            (prop.props.className?.includes('app') ||
              prop.props.id === 'app-mount' ||
              prop.type === 'body'),
          { walkable: ['props', 'children'] }
        );

        if (!appNode || !appNode.props) return returnValue;

        const already = BdApi.Utils.findInTree(
          returnValue,
          (prop) => prop && prop.props && prop.props.id === 'sl-wheel-bridge-root',
          { walkable: ['props', 'children'] }
        );
        if (already) return returnValue;

        const React = BdApi.React;
        const controller = React.createElement(pluginInstance._WheelController, {
          key: 'sl-wheel-bridge',
          pluginInstance,
        });
        const wrapper = React.createElement('div', {
          id: 'sl-wheel-bridge-root',
          style: { display: 'contents' },
        }, controller);

        if (Array.isArray(appNode.props.children)) {
          appNode.props.children.push(wrapper);
        } else if (appNode.props.children) {
          appNode.props.children = [appNode.props.children, wrapper];
        } else {
          appNode.props.children = wrapper;
        }
      } catch (e) {
        console.error('[HSLWheelBridge] React patcher error:', e);
      }
      return returnValue;
    });
  }

  // ── WheelController — React Functional Component ──────────────────────────

  get _WheelController() {
    if (this.__WheelControllerCached) return this.__WheelControllerCached;

    this.__WheelControllerCached = ({ pluginInstance }) => {
      const React = BdApi.React;
      const engineRef = React.useRef(null);

      // Mount: create engine
      React.useEffect(() => {
        if (pluginInstance._isStopped) return;

        // Signal React mount — cancel fallback
        pluginInstance._engineMounted = true;
        if (pluginInstance._fallbackTimer) {
          clearTimeout(pluginInstance._fallbackTimer);
          pluginInstance._fallbackTimer = null;
        }
        if (pluginInstance._fallbackEngine) {
          pluginInstance._fallbackEngine.unmount();
          pluginInstance._fallbackEngine = null;
        }
        if (pluginInstance._fallbackPoll) {
          clearInterval(pluginInstance._fallbackPoll);
          pluginInstance._fallbackPoll = null;
        }

        const engine = new WheelBridgeEngine();
        engineRef.current = engine;
        engine.syncScroller();

        return () => {
          engine.unmount();
          engineRef.current = null;
        };
      }, []);

      // Re-discover scroller on every React render (instant recovery)
      React.useEffect(() => {
        if (!engineRef.current || pluginInstance._isStopped) return;
        engineRef.current.syncScroller();
      }); // No deps = runs on every render

      return null; // No visible output
    };

    return this.__WheelControllerCached;
  }
};
