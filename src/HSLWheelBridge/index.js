/**
 * 1) Scroller Discovery + Wheel Engine
 * 2) Plugin Lifecycle
 * 3) React Patcher + Fallback Mount
 */

const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const { createWarnOnce } = require("../shared/warn-once");
const { createToast } = require("../shared/toast");
const dc = require("../shared/discord-classes");

// Scroller selectors — primary + fallbacks for Discord class name changes
const HSL_SCROLLER_SELECTORS = [
  `nav[aria-label='Servers sidebar'] ul[role='tree'] > div[class^='itemsContainer_'] > div[class^='stack_']${dc.sel.scroller}${dc.sel.scrollerBase}`,
  `nav[aria-label='Servers'] ul[role='tree'] ${dc.sel.scroller}`,
  `nav${dc.sel.guilds} ${dc.sel.scroller}${dc.sel.scrollerBase}`,
];

// TTL cache for scroller lookups — avoids 1-3 querySelector calls per render
const _scrollerCache = {};

let _PluginUtils;
try { _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

// 1) SCROLLER DISCOVERY + WHEEL ENGINE

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

// WheelBridgeEngine — lightweight imperative manager

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

module.exports = class HSLWheelBridge {
  constructor() {
    this._patcherId = 'HSLWheelBridge';
    this._isStopped = false;
    this._engineMounted = false;
    this._fallbackEngine = null;
    this._fallbackTimer = null;
    this._fallbackStore = null;
    this._fallbackStoreListener = null;
    this._toast = createToast();
    this._warnOnce = createWarnOnce();
  }

  _cleanupRuntime() {
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
    if (this._fallbackStore && this._fallbackStoreListener) {
      try { this._fallbackStore.removeChangeListener(this._fallbackStoreListener); } catch (_) {}
      this._fallbackStore = null;
      this._fallbackStoreListener = null;
    }
    if (this._fallbackEngine) {
      this._fallbackEngine.unmount();
      this._fallbackEngine = null;
    }
    this._engineMounted = false;
    // Clear module-level scroller cache to prevent stale DOM refs across hot-reload
    for (const k in _scrollerCache) delete _scrollerCache[k];
    BdApi.Patcher.unpatchAll(this._patcherId);
  }

  // 2) PLUGIN LIFECYCLE
  start() {
    this._toast = _PluginUtils?.createToastHelper?.("HSLWheelBridge") || createToast();
    this._cleanupRuntime();
    this._isStopped = false;
    this._engineMounted = false;
    this._warnOnce = createWarnOnce();
    this._installReactPatcher();

    // Fallback: if React patcher does not mount within 3s, mount engine directly
    this._fallbackTimer = setTimeout(() => {
      this._fallbackTimer = null;
      if (!this._isStopped && !this._engineMounted) {
        this._warnOnce('react-fallback', '[HSLWheelBridge] React patcher did not mount — using direct DOM fallback');
        const engine = new WheelBridgeEngine();
        this._fallbackEngine = engine;
        this._engineMounted = true;
        engine.syncScroller();
        // Event-driven scroller re-discovery — replaces the prior 2s
        // setInterval. SelectedChannelStore fires on every channel /
        // DM / thread switch, which is the only event that swaps the
        // scroller node identity. syncScroller is idempotent.
        try {
          const SelectedChannelStore = BdApi.Webpack.getStore?.('SelectedChannelStore');
          if (SelectedChannelStore && typeof SelectedChannelStore.addChangeListener === 'function') {
            this._fallbackStoreListener = () => {
              if (this._isStopped || document.hidden) return;
              engine.syncScroller();
            };
            SelectedChannelStore.addChangeListener(this._fallbackStoreListener);
            this._fallbackStore = SelectedChannelStore;
          }
        } catch (_) {}
      }
    }, 3000);

    this._toast('HSLWheelBridge active', "success", 2000);
  }

  stop() {
    this._isStopped = true;
    this._cleanupRuntime();
    this._toast('HSLWheelBridge stopped', "info", 2000);
  }

  // 3) REACT PATCHER + FALLBACK MOUNT

  _installReactPatcher() {
    let ReactUtils;
    try {
      ReactUtils = loadBdModuleFromPlugins("BetterDiscordReactUtils.js");
    } catch (_) {
      ReactUtils = null;
    }

    if (!ReactUtils?.patchReactMainContent || !ReactUtils?.injectReactComponent) {
      this._warnOnce('react-utils-missing', '[HSLWheelBridge] ReactUtils unavailable — waiting for DOM fallback');
      return;
    }

    const pluginInstance = this;
    const ok = ReactUtils.patchReactMainContent(this, this._patcherId, (React, appNode, returnValue) => {
      const component = React.createElement(pluginInstance._WheelController, {
        key: 'sl-wheel-bridge',
        pluginInstance,
      });
      ReactUtils.injectReactComponent(appNode, 'sl-wheel-bridge-root', component, returnValue);
    });

    if (!ok) {
      this._warnOnce('maincontent-missing', '[HSLWheelBridge] MainContent module not found — waiting for DOM fallback');
    }
  }

  // WheelController — React Functional Component

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
        if (pluginInstance._fallbackStore && pluginInstance._fallbackStoreListener) {
          try { pluginInstance._fallbackStore.removeChangeListener(pluginInstance._fallbackStoreListener); } catch (_) {}
          pluginInstance._fallbackStore = null;
          pluginInstance._fallbackStoreListener = null;
        }

        const engine = new WheelBridgeEngine();
        engineRef.current = engine;
        engine.syncScroller();

        // Event-driven scroller re-discovery — replaces the prior 2s
        // setInterval. Same rationale as the DOM-fallback path above.
        let storeUnsub = null;
        try {
          const SelectedChannelStore = BdApi.Webpack.getStore?.('SelectedChannelStore');
          if (SelectedChannelStore && typeof SelectedChannelStore.addChangeListener === 'function') {
            const listener = () => {
              if (pluginInstance._isStopped || document.hidden) return;
              engine.syncScroller();
            };
            SelectedChannelStore.addChangeListener(listener);
            storeUnsub = () => {
              try { SelectedChannelStore.removeChangeListener(listener); } catch (_) {}
            };
          }
        } catch (_) {}

        return () => {
          if (storeUnsub) storeUnsub();
          engine.unmount();
          engineRef.current = null;
        };
      }, []);

      return null; // No visible output
    };

    return this.__WheelControllerCached;
  }
};
