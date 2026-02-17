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
// Toolbar Injection — React Patcher + DOM Fallback
// ---------------------------------------------------------------------------
//
// Two-tier system:
//   Tier 1 (preferred): Patch ChatButtonsGroup.type via BdApi.Patcher.after()
//     - Buttons live in React's tree → survive re-renders natively
//     - Single patch handles all registered buttons
//   Tier 2 (fallback):  DOM injection + shared MutationObserver
//     - Used when the ChatButtonsGroup webpack module can't be found
//     - Identical behaviour to the pre-React approach
//
// Plugins call registerToolbarButton() with BOTH a renderReact callback
// (for Tier 1) and a renderDOM callback (for Tier 2).  SLUtils picks the
// best available strategy automatically.
// ---------------------------------------------------------------------------

// ── Shared state ──
const _toolbarRegistry = [];       // { id, priority, renderReact?, renderDOM?, cleanup?, onDOMMount? }
let _toolbarPatcherActive = false;  // true once Tier 1 React patcher is installed
let _toolbarObserver = null;        // Tier 2 MutationObserver
let _toolbarReinjectTimer = null;   // Tier 2 debounce RAF id
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

// ── Tier 2: DOM fallback (unchanged from original) ──

function _findToolbarContainer() {
  const actionBtns = document.querySelectorAll(
    '[class*="channelTextArea"] [aria-label*="emoji" i], ' +
    '[class*="channelTextArea"] [aria-label*="gif" i], ' +
    '[class*="channelTextArea"] [aria-label*="sticker" i], ' +
    '[class*="channelTextArea"] [class*="emojiButton"], ' +
    '[class*="channelTextArea"] [class*="attachButton"]'
  );
  const candidates = new Set();
  actionBtns.forEach((btn) => {
    if (btn.parentElement) candidates.add(btn.parentElement);
    const container = btn.closest(
      '[class*="buttons"], [class*="buttonContainer"], [class*="actionButtons"], [class*="inner"]'
    );
    if (container) candidates.add(container);
  });
  let best = null;
  let bestScore = -1;
  candidates.forEach((c) => {
    const hasAction = !!c.querySelector(
      '[aria-label*="emoji" i], [aria-label*="gif" i], [class*="emojiButton"]'
    );
    const btnCount = c.querySelectorAll('button, [class*="button"], [aria-label]').length;
    const score = (hasAction ? 100 : 0) + btnCount;
    if (score > bestScore) { bestScore = score; best = c; }
  });
  return best;
}

function _injectAllToolbarButtons() {
  const toolbar = _findToolbarContainer();
  if (!toolbar) return;
  const sorted = [..._toolbarRegistry]
    .filter((e) => typeof e.renderDOM === 'function')
    .sort((a, b) => a.priority - b.priority);
  sorted.forEach((entry) => {
    if (toolbar.querySelector(`#${entry.id}`)) return;
    document.querySelectorAll(`#${entry.id}`).forEach((el) => el.remove());
    try {
      entry.renderDOM(toolbar);
      if (entry.onDOMMount) {
        const el = document.getElementById(entry.id);
        if (el) entry.onDOMMount(el);
      }
    } catch (e) {
      console.error(`[SLUtils:TOOLBAR_DOM] Failed to inject ${entry.id}:`, e);
    }
  });
}

function _ensureToolbarObserver() {
  if (_toolbarObserver) return;
  const chatArea = document.querySelector('[class*="channelTextArea"]');
  const target = chatArea || document.body;
  _toolbarObserver = new MutationObserver(() => {
    if (_toolbarReinjectTimer) return;
    _toolbarReinjectTimer = requestAnimationFrame(() => {
      _toolbarReinjectTimer = null;
      const anyMissing = _toolbarRegistry.some(
        (entry) => entry.renderDOM && !document.body.contains(document.getElementById(entry.id))
      );
      if (anyMissing) _injectAllToolbarButtons();
    });
  });
  _toolbarObserver.observe(target, { childList: true, subtree: true });
}

// ── Public API ──

/**
 * Register a toolbar button.
 *
 * Automatically uses React patcher (Tier 1) if the ChatButtonsGroup
 * webpack module is available, otherwise falls back to DOM injection
 * (Tier 2).  Both tiers can coexist — the DOM fallback acts as a
 * safety net if React patching fails silently.
 *
 * @param {Object} opts
 * @param {string}   opts.id          - Unique identifier (used as DOM id for Tier 2, React key for Tier 1)
 * @param {number}   opts.priority    - Insertion order (lower = leftmost). TitleManager=10, SkillTree=20
 * @param {Function} [opts.renderReact] - (React, channel) => ReactElement. For Tier 1 React injection.
 * @param {Function} [opts.renderDOM]   - (toolbar: HTMLElement) => void. For Tier 2 DOM fallback.
 *                                        If omitted, falls back to legacy `render` param.
 * @param {Function} [opts.render]      - DEPRECATED alias for renderDOM (backward compat)
 * @param {Function} [opts.cleanup]     - () => void. Called on unregister.
 * @param {Function} [opts.onDOMMount]  - (domElement) => void. Called after Tier 2 DOM insertion.
 */
function registerToolbarButton(opts) {
  const { id, priority = 50, renderReact, renderDOM, render, cleanup, onDOMMount } = opts;

  // Prevent duplicates
  const existing = _toolbarRegistry.findIndex((e) => e.id === id);
  if (existing >= 0) _toolbarRegistry.splice(existing, 1);

  _toolbarRegistry.push({
    id,
    priority,
    renderReact: renderReact || null,
    renderDOM: renderDOM || render || null,   // `render` is the legacy name
    cleanup: cleanup || null,
    onDOMMount: onDOMMount || null,
  });

  // Try React patcher first
  const reactOk = renderReact ? _installToolbarReactPatcher() : false;

  // Always set up DOM fallback as safety net
  if (renderDOM || render) {
    _ensureToolbarObserver();
    // Only do DOM injection immediately if React patcher isn't active
    if (!reactOk) {
      _injectAllToolbarButtons();
    }
  }
}

/**
 * Unregister a toolbar button.  Calls cleanup, removes DOM elements,
 * and tears down patcher/observer if no buttons remain.
 *
 * @param {string} id
 */
function unregisterToolbarButton(id) {
  const idx = _toolbarRegistry.findIndex((e) => e.id === id);
  if (idx >= 0) {
    try { _toolbarRegistry[idx].cleanup?.(); } catch (_) {}
    _toolbarRegistry.splice(idx, 1);
  }
  document.querySelectorAll(`#${id}`).forEach((el) => el.remove());

  if (_toolbarRegistry.length === 0) {
    // Tear down React patcher
    _removeToolbarReactPatcher();
    // Tear down DOM observer
    if (_toolbarObserver) {
      _toolbarObserver.disconnect();
      _toolbarObserver = null;
      if (_toolbarReinjectTimer) {
        cancelAnimationFrame(_toolbarReinjectTimer);
        _toolbarReinjectTimer = null;
      }
    }
  }
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
    registerToolbarButton,
    unregisterToolbarButton,
  };
}
