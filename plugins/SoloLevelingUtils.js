/**
 * @name SoloLevelingUtils
 * @description Shared utilities for the Solo Leveling BetterDiscord plugin ecosystem.
 *              Used by SoloLevelingStats, LevelProgressBar, and future plugins.
 * @version 1.0.0
 * @author BlueFlashX1
 */

/* global BdApi */

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
    result.UserStore = BdApi.Webpack.getModule((m) => m && m.getCurrentUser);
    result.ChannelStore = BdApi.Webpack.getModule(
      (m) => m && (m.getChannel || m.getChannelId)
    );

    if (opts.messageStore) {
      result.MessageStore = BdApi.Webpack.getModule(
        (m) => m && (m.getMessage || m.getMessages || m.receiveMessage)
      );
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
  const { patcherId, elementId, render, onMount, debugLog, debugError } = opts;
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

/**
 * Show a level-up banner inside an overlay element.
 *
 * @param {HTMLElement} overlay
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.subtitle
 * @param {string} opts.bannerClass  - CSS class for the banner div
 * @param {string} opts.titleClass   - CSS class for the title div
 * @param {string} opts.subtitleClass - CSS class for the subtitle div
 * @param {number} opts.durationMs   - how long before auto-removal (default 1300)
 * @param {Function} opts.onTimeout  - optional callback receiving the timeout id for tracking
 */
function showLevelUpBanner(overlay, opts = {}) {
  if (!overlay) return;

  const {
    title = 'LEVEL UP',
    subtitle = '',
    bannerClass = 'sls-levelup-banner',
    titleClass = 'sls-levelup-title',
    subtitleClass = 'sls-levelup-subtitle',
    durationMs = 1300,
    onTimeout,
  } = opts;

  const banner = document.createElement('div');
  banner.className = bannerClass;

  const titleEl = document.createElement('div');
  titleEl.className = titleClass;
  titleEl.textContent = title;
  banner.appendChild(titleEl);

  if (subtitle) {
    const subtitleEl = document.createElement('div');
    subtitleEl.className = subtitleClass;
    subtitleEl.textContent = subtitle;
    banner.appendChild(subtitleEl);
  }

  overlay.appendChild(banner);

  const tid = setTimeout(() => banner.remove(), durationMs);
  if (onTimeout) onTimeout(tid);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// BetterDiscord plugins are loaded via eval/require in a shared scope.
// We attach to `window` so other plugins can import.
if (typeof window !== 'undefined') {
  window.SoloLevelingUtils = {
    initWebpackModules,
    tryReactInjection,
    createDebugLogger,
    createDOMCache,
    createTrackedTimeouts,
    mergeSettings,
    getOrCreateOverlay,
    showLevelUpBanner,
  };
}
