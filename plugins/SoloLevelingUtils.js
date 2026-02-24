/**
 * @name SoloLevelingUtils
 * @description Shared utilities for the Solo Leveling BetterDiscord plugin ecosystem.
 *              Used by SoloLevelingStats, LevelProgressBar, and future plugins.
 * @version 1.0.0
 * @author BlueFlashX1
 */

/* global BdApi */

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/**
 * Canonical rank hierarchy (ascending). Used across ShadowArmy, ShadowSenses,
 * ShadowExchange for iteration, validation, and display ordering.
 * RANK_COLORS intentionally vary per plugin for visual theming — keep those local.
 */
const RANKS = ["E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+", "NH", "Monarch", "Monarch+", "Shadow Monarch"];

/**
 * Initialize BdApi webpack modules used across plugins.
 * Returns an object with resolved modules and an `ok` flag.
 *
 * @param {Object} opts
 * @param {boolean} opts.messageStore  - include MessageStore
 * @param {boolean} opts.messageActions - include MessageActions
 * @returns {{ ok: boolean, UserStore: any, ChannelStore: any, MessageStore: any, MessageActions: any }}
 */
function initWebpackModules(opts = {}) {
  const result = {
    ok: false,
    UserStore: null,
    ChannelStore: null,
    MessageStore: null,
    MessageActions: null,
  };

  try {
    result.UserStore = BdApi.Webpack.getStore("UserStore");
    result.ChannelStore = BdApi.Webpack.getStore("ChannelStore");

    if (opts.messageStore) {
      result.MessageStore = BdApi.Webpack.getStore("MessageStore");
    }

    if (opts.messageActions) {
      result.MessageActions = BdApi.Webpack.getModule(
        (m) => m && m.sendMessage && (m.receiveMessage || m.editMessage)
      );
    }

    result.ok = !!(result.UserStore);
  } catch (_) {
    result.ok = false;
  }

  return result;
}

/**
 * Try to inject a React element into Discord's base layer.
 *
 * @param {Object} opts
 * @param {string}   opts.patcherId   - BdApi patcher namespace (e.g. 'SoloLevelingStats')
 * @param {string}   opts.elementId   - id attribute of the injected wrapper div
 * @param {Function} opts.render      - (React) => ReactElement to inject
 * @param {Function} opts.onMount     - (domElement) => void, called after DOM element appears
 * @param {Function} opts.debugLog    - logging callback (operation, message, data)
 * @param {Function} opts.debugError  - error logging callback (operation, error)
 * @returns {boolean} true if patch was installed
 */
function tryReactInjection(opts) {
  const { patcherId, elementId, render, onMount, guard, debugLog, debugError } = opts;
  const log = debugLog || (() => {});
  const err = debugError || (() => {});

  try {
    let MainContent = BdApi.Webpack.getByStrings('baseLayer', { defaultExport: false });
    if (!MainContent) {
      MainContent = BdApi.Webpack.getByStrings('appMount', { defaultExport: false });
    }
    if (!MainContent) {
      log('REACT_INJECTION', 'Main content component not found, using DOM fallback');
      return false;
    }

    const React = BdApi.React;

    BdApi.Patcher.after(patcherId, MainContent, 'Z', (_this, _args, returnValue) => {
      try {
        // Optional per-render guard — if it returns false, skip injection for this render
        if (guard && !guard()) return returnValue;

        const bodyPath = BdApi.Utils.findInTree(
          returnValue,
          (prop) =>
            prop &&
            prop.props &&
            (prop.props.className?.includes('app') ||
              prop.props.id === 'app-mount' ||
              prop.type === 'body'),
          { walkable: ['props', 'children'] }
        );

        if (!bodyPath || !bodyPath.props) return returnValue;

        const alreadyInjected = BdApi.Utils.findInTree(
          returnValue,
          (prop) => prop && prop.props && prop.props.id === elementId,
          { walkable: ['props', 'children'] }
        );

        if (alreadyInjected) return returnValue;

        const element = render(React);

        if (Array.isArray(bodyPath.props.children)) {
          bodyPath.props.children.unshift(element);
        } else if (bodyPath.props.children) {
          bodyPath.props.children = [element, bodyPath.props.children];
        } else {
          bodyPath.props.children = element;
        }

        log('REACT_INJECTION', `${elementId} injected via React`);

        if (onMount) {
          setTimeout(() => {
            const domEl = document.getElementById(elementId);
            if (domEl) onMount(domEl);
          }, 100);
        }
      } catch (error) {
        err('REACT_INJECTION', error);
      }
      return returnValue;
    });

    log('REACT_INJECTION', 'React injection patch installed');
    return true;
  } catch (error) {
    err('REACT_INJECTION', error, { phase: 'setup' });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

/**
 * Create a debug logger bound to a plugin name.
 *
 * @param {string} pluginName - e.g. 'SoloLevelingStats'
 * @param {Function} isEnabled - () => boolean, returns whether debug mode is on
 * @returns {{ log: Function, error: Function, console: Function }}
 */
function createDebugLogger(pluginName, isEnabled) {
  const state = {
    errorCount: 0,
    lastError: null,
    operationCounts: {},
    lastLogTimes: {},
    frequentOps: new Set([
      'DOM_UPDATE', 'CACHE_HIT', 'XP_CALC', 'RENDER_CYCLE',
      'OBSERVER_MUTATION', 'MESSAGE_CHECK', 'UI_UPDATE',
    ]),
    throttleMs: 5000,
  };

  function log(operation, message, data = null) {
    if (!isEnabled()) return;

    const isFrequent = state.frequentOps.has(operation);
    if (isFrequent) {
      const now = Date.now();
      const last = state.lastLogTimes[operation] || 0;
      if (now - last < state.throttleMs) {
        state.operationCounts[operation] = (state.operationCounts[operation] || 0) + 1;
        return;
      }
      state.lastLogTimes[operation] = now;
    }

    console.warn(`[${pluginName}:${operation}] ${message}`, data || '');
    state.operationCounts[operation] = (state.operationCounts[operation] || 0) + 1;
  }

  function error(operation, err, context = {}) {
    state.errorCount++;

    let errorMessage = 'Unknown error';
    let errorStack = null;

    if (err instanceof Error) {
      errorMessage = err.message || String(err);
      errorStack = err.stack;
    } else if (typeof err === 'string') {
      errorMessage = err;
    } else if (err && typeof err === 'object') {
      errorMessage = err.message || err.toString() || JSON.stringify(err).substring(0, 200);
      errorStack = err.stack;
    } else {
      errorMessage = String(err);
    }

    state.lastError = { operation, error: errorMessage, stack: errorStack, context, timestamp: Date.now() };
    console.error(`[${pluginName}:ERROR:${operation}]`, errorMessage, { stack: errorStack, context });
  }

  function debugConsole(prefix, message, data = {}) {
    if (isEnabled()) console.log(`${prefix}`, message, data);
  }

  return { log, error, console: debugConsole, state };
}

// ---------------------------------------------------------------------------
// DOM Caching
// ---------------------------------------------------------------------------

/**
 * Create a TTL-based DOM element cache.
 *
 * @param {number} ttlMs - cache time-to-live in ms (default 2000)
 * @returns {{ get: Function, invalidate: Function }}
 */
function createDOMCache(ttlMs = 2000) {
  const elements = new Map();
  let lastRefresh = 0;

  function get(selector, container) {
    if (!container) return null;
    const now = Date.now();
    const cached = elements.get(selector);

    if (cached && container.contains(cached) && now - lastRefresh < ttlMs) {
      return cached;
    }

    const el = container.querySelector(selector);
    if (el) {
      elements.set(selector, el);
      lastRefresh = now;
    } else {
      elements.delete(selector);
    }
    return el;
  }

  function invalidate() {
    elements.clear();
    lastRefresh = 0;
  }

  return { get, invalidate };
}

// ---------------------------------------------------------------------------
// Tracked Timeouts
// ---------------------------------------------------------------------------

/**
 * Create a tracked-timeout manager so all pending timeouts can be bulk-cleared
 * on plugin stop.
 *
 * @returns {{ set: Function, clear: Function, clearAll: Function }}
 */
function createTrackedTimeouts() {
  const ids = new Set();

  function set(callback, delayMs) {
    let stopped = false;
    const wrapped = () => {
      ids.delete(timeoutId);
      if (!stopped) callback();
    };
    const timeoutId = setTimeout(wrapped, delayMs);
    ids.add(timeoutId);
    return timeoutId;
  }

  function clear(id) {
    clearTimeout(id);
    ids.delete(id);
  }

  function clearAll() {
    ids.forEach((id) => clearTimeout(id));
    ids.clear();
  }

  /** Mark all future callbacks as no-op (for stop() semantics). */
  function stop() {
    clearAll();
  }

  return { set, clear, clearAll, stop };
}

// ---------------------------------------------------------------------------
// Deep copy settings
// ---------------------------------------------------------------------------

/**
 * Deep-merge saved settings onto defaults, returning a fresh deep copy
 * so no nested references are shared.
 *
 * @param {Object} defaults - the plugin's defaultSettings
 * @param {Object} saved    - user-saved settings (may be partial)
 * @returns {Object} merged deep copy
 */
function mergeSettings(defaults, saved) {
  const merged = { ...defaults, ...saved };
  return JSON.parse(JSON.stringify(merged));
}

// ---------------------------------------------------------------------------
// Level-up animation overlay
// ---------------------------------------------------------------------------

/**
 * Create or retrieve a level-up animation overlay element.
 *
 * @param {string} id        - overlay element id (e.g. 'sls-levelup-overlay')
 * @param {string} className - CSS class (e.g. 'sls-levelup-overlay')
 * @returns {HTMLElement}
 */
function getOrCreateOverlay(id, className) {
  const existing = document.getElementById(id);
  if (existing) {
    existing.className = className;
    return existing;
  }
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = className;
  (document.body || document.documentElement).appendChild(overlay);
  return overlay;
}

// ---------------------------------------------------------------------------
// Toolbar Injection — React Patcher
// ---------------------------------------------------------------------------
//
// Patches ChatButtonsGroup.type via BdApi.Patcher.after() so buttons live
// in React's tree and survive re-renders natively.  Single patch handles
// all registered buttons sorted by priority.
//
// Plugins call registerToolbarButton() with a renderReact callback.
// ---------------------------------------------------------------------------

// ── Shared state ──
const _toolbarRegistry = [];       // { id, priority, renderReact, cleanup? }
let _toolbarPatcherActive = false;  // true once React patcher is installed
const _TOOLBAR_PATCHER_ID = 'SLUtils_Toolbar';

// ── Tier 1: React patcher ──

/**
 * Attempt to find Discord's ChatButtonsGroup webpack module and install
 * a single BdApi.Patcher.after() that injects ALL registered buttons
 * into the React children array.
 *
 * Pattern adapted from InvisibleTyping by Strencher:
 *   ChatButtonsGroup = Webpack.getBySource("type","showAllButtons","paymentsBlocked")?.A
 *   Patcher.after(ChatButtonsGroup, "type", (_, args, res) => { ... })
 *
 * @returns {boolean} true if the patcher was installed
 */
function _installToolbarReactPatcher() {
  if (_toolbarPatcherActive) return true;

  try {
    // Strategy 1: primary search strings
    let mod = BdApi.Webpack.getBySource('type', 'showAllButtons', 'paymentsBlocked');
    let exportKey = 'A';

    // Strategy 2: getWithKey for resilience against mangled export names
    if (!mod || !mod[exportKey]) {
      const pair = BdApi.Webpack.getWithKey(
        (m) =>
          m?.type &&
          typeof m.type === 'function' &&
          m.type.toString?.().includes('showAllButtons')
      );
      if (pair) {
        mod = { [pair[1]]: pair[0] };
        exportKey = pair[1];
      }
    }

    // Strategy 3: alternative source strings
    if (!mod || !mod[exportKey]) {
      mod = BdApi.Webpack.getBySource('ChannelTextAreaButtons', { defaultExport: false });
      if (mod) {
        const key = Object.keys(mod).find(
          (k) => typeof mod[k] === 'object' && typeof mod[k]?.type === 'function'
        );
        if (key) exportKey = key;
      }
    }

    const component = mod?.[exportKey];
    if (!component || typeof component.type !== 'function') {
      return false;
    }

    const React = BdApi.React;

    BdApi.Patcher.after(_TOOLBAR_PATCHER_ID, component, 'type', (_thisObj, args, returnValue) => {
      try {
        // Guard: only patch the main chat input (not reply/thread/etc.)
        if (!args || args.length < 2) return;
        const props = args[0];
        if (props?.disabled) return;
        if (props?.type?.analyticsName !== 'normal') return;
        if (!returnValue?.props?.children || !Array.isArray(returnValue.props.children)) return;

        // Sort by priority and inject
        const sorted = [..._toolbarRegistry]
          .filter((e) => typeof e.renderReact === 'function')
          .sort((a, b) => a.priority - b.priority);

        sorted.forEach((entry) => {
          try {
            // Skip if already injected (by key)
            const key = `sl-toolbar-${entry.id}`;
            const alreadyPresent = returnValue.props.children.some(
              (c) => c && c.key === key
            );
            if (alreadyPresent) return;

            const element = entry.renderReact(React, props.channel);
            if (!element) return;

            // Ensure stable React key
            const keyed = React.cloneElement
              ? React.cloneElement(element, { key })
              : { ...element, key };

            returnValue.props.children.unshift(keyed);
          } catch (e) {
            console.error(`[SLUtils:TOOLBAR_REACT] Failed to inject ${entry.id}:`, e);
          }
        });
      } catch (e) {
        console.error('[SLUtils:TOOLBAR_REACT] Patch error:', e);
      }
    });

    _toolbarPatcherActive = true;
    return true;
  } catch (e) {
    console.error('[SLUtils:TOOLBAR_REACT] Failed to install patcher:', e);
    return false;
  }
}

/**
 * Remove the React toolbar patcher.
 */
function _removeToolbarReactPatcher() {
  if (!_toolbarPatcherActive) return;
  try {
    BdApi.Patcher.unpatchAll(_TOOLBAR_PATCHER_ID);
  } catch (_) {}
  _toolbarPatcherActive = false;
}

// ── Public API ──

/**
 * Register a toolbar button via React patcher.
 *
 * Injects into Discord's ChatButtonsGroup React component so the button
 * lives in React's tree and survives re-renders natively.
 *
 * @param {Object} opts
 * @param {string}   opts.id          - Unique identifier (used as React key)
 * @param {number}   opts.priority    - Insertion order (lower = leftmost). TitleManager=10, SkillTree=20
 * @param {Function} opts.renderReact - (React, channel) => ReactElement
 * @param {Function} [opts.cleanup]   - () => void. Called on unregister.
 */
function registerToolbarButton(opts) {
  const { id, priority = 50, renderReact, cleanup } = opts;

  if (typeof renderReact !== 'function') {
    console.error(`[SLUtils:TOOLBAR] registerToolbarButton('${id}') requires renderReact callback`);
    return;
  }

  // Prevent duplicates
  const existing = _toolbarRegistry.findIndex((e) => e.id === id);
  if (existing >= 0) _toolbarRegistry.splice(existing, 1);

  _toolbarRegistry.push({
    id,
    priority,
    renderReact,
    cleanup: cleanup || null,
  });

  _installToolbarReactPatcher();
}

/**
 * Unregister a toolbar button.  Calls cleanup and tears down the React
 * patcher if no buttons remain.
 *
 * @param {string} id
 */
function unregisterToolbarButton(id) {
  const idx = _toolbarRegistry.findIndex((e) => e.id === id);
  if (idx >= 0) {
    try { _toolbarRegistry[idx].cleanup?.(); } catch (_) {}
    _toolbarRegistry.splice(idx, 1);
  }

  if (_toolbarRegistry.length === 0) {
    _removeToolbarReactPatcher();
  }
}

// ---------------------------------------------------------------------------
// Cross-plugin helpers
// ---------------------------------------------------------------------------

/**
 * Get a plugin's live instance if it's enabled and loaded.
 * Combines isEnabled + get + instance extraction in one safe call.
 *
 * Replaces the repeated 3-line pattern found across 12+ plugins:
 *   if (!BdApi.Plugins.isEnabled('Name')) return null;
 *   const plugin = BdApi.Plugins.get('Name');
 *   const instance = plugin?.instance;
 *
 * @param {string} name - Plugin name (e.g. 'ShadowArmy')
 * @returns {Object|null} The plugin instance, or null if disabled/unavailable
 */
function getPluginInstance(name) {
  try {
    if (!BdApi.Plugins.isEnabled(name)) return null;
    const plugin = BdApi.Plugins.get(name);
    return plugin?.instance || null;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// BetterDiscord plugins are loaded via eval/require in a shared scope.
// We attach to `window` so other plugins can import.
if (typeof window !== 'undefined') {
  window.SoloLevelingUtils = {
    RANKS,
    initWebpackModules,
    tryReactInjection,
    createDebugLogger,
    createDOMCache,
    createTrackedTimeouts,
    mergeSettings,
    getOrCreateOverlay,
    registerToolbarButton,
    unregisterToolbarButton,
    getPluginInstance,
  };
}
