/**
 * BetterDiscordPluginUtils — Shared utilities for BetterDiscord plugins.
 * Eliminates duplicate patterns across standalone and connected plugins.
 *
 * Provides: toast, settings, hotkey, editable-target, cached-query, TTL cache,
 *           dispatcher, throttle helpers.
 * @version 1.2.0
 */

// ── Toast ────────────────────────────────────────────────────────────────────
// Modern API first (BdApi.UI.showToast), deprecated fallback (BdApi.showToast).

/**
 * Show a toast notification using the best available BdApi method.
 * @param {string} message
 * @param {{ type?: string, timeout?: number }} [options]
 */
function showToast(message, options = {}) {
  const opts = { timeout: 2500, ...options };
  if (typeof BdApi.UI?.showToast === "function") {
    BdApi.UI.showToast(message, opts);
    return;
  }
  if (typeof BdApi.showToast === "function") {
    BdApi.showToast(message, opts);
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

/**
 * Load plugin settings with safe defaults merge.
 * @param {string} pluginName
 * @param {object} defaults
 * @returns {object}
 */
function loadSettings(pluginName, defaults) {
  try {
    const saved = BdApi.Data.load(pluginName, "settings");
    return { ...defaults, ...(saved && typeof saved === "object" ? saved : {}) };
  } catch (_) {
    return { ...defaults };
  }
}

/**
 * Save plugin settings.
 * @param {string} pluginName
 * @param {object} settings
 */
function saveSettings(pluginName, settings) {
  try {
    BdApi.Data.save(pluginName, "settings", settings);
  } catch (_) {
    // Silently fail — caller can add logging if needed
  }
}

// ── Hotkey ────────────────────────────────────────────────────────────────────

/**
 * Normalize a hotkey string to lowercase, trimmed, no whitespace.
 * @param {string} hotkey
 * @returns {string}
 */
function normalizeHotkey(hotkey) {
  return String(hotkey || "").trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Parse a hotkey string into modifier flags + key.
 * @param {string} hotkey - e.g. "Ctrl+Shift+P"
 * @returns {{ key: string, hasCtrl: boolean, hasShift: boolean, hasAlt: boolean, hasMeta: boolean }}
 */
function parseHotkey(hotkey) {
  const normalized = normalizeHotkey(hotkey);
  const parts = normalized.split("+").filter(Boolean);
  const modifiers = new Set(
    parts.filter((p) => ["ctrl", "shift", "alt", "meta", "cmd", "command"].includes(p))
  );
  const key = parts.find((p) => !modifiers.has(p)) || "";
  return {
    key,
    hasCtrl: modifiers.has("ctrl"),
    hasShift: modifiers.has("shift"),
    hasAlt: modifiers.has("alt"),
    hasMeta: modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command"),
  };
}

/**
 * Check if a KeyboardEvent matches a hotkey spec string.
 * @param {KeyboardEvent} event
 * @param {string} hotkey - e.g. "Ctrl+Shift+P"
 * @returns {boolean}
 */
function matchesHotkey(event, hotkey) {
  const spec = parseHotkey(hotkey);
  if (!spec.key) return false;
  const key = String(event.key || "").toLowerCase();
  return (
    key === spec.key &&
    !!event.ctrlKey === spec.hasCtrl &&
    !!event.shiftKey === spec.hasShift &&
    !!event.altKey === spec.hasAlt &&
    !!event.metaKey === spec.hasMeta
  );
}

// ── DOM Helpers ──────────────────────────────────────────────────────────────

/**
 * Check if an element is an editable target (input, textarea, contenteditable).
 * Useful for suppressing hotkeys when user is typing.
 * @param {Element|null} target
 * @returns {boolean}
 */
function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase?.() || "";
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return !!target.isContentEditable;
}

/**
 * Query DOM using an array of fallback selectors. Returns first match.
 * Optionally caches result with a TTL to avoid redundant DOM queries.
 *
 * @param {string[]} selectors - Array of CSS selectors to try in order
 * @param {{ cache?: object, cacheKey?: string, ttlMs?: number }} [options]
 * @returns {Element|null}
 *
 * Usage with cache:
 *   const _cache = {};
 *   const el = querySelectorFallback(SELECTORS, { cache: _cache, cacheKey: 'hsl-scroller', ttlMs: 2000 });
 */
function querySelectorFallback(selectors, options = {}) {
  const { cache, cacheKey, ttlMs } = options;

  // Check cache if provided
  if (cache && cacheKey && ttlMs) {
    const entry = cache[cacheKey];
    if (entry && Date.now() - entry.time < ttlMs) {
      // Verify cached element is still connected
      if (entry.el && entry.el.isConnected) return entry.el;
      // Element disconnected — invalidate
      cache[cacheKey] = null;
    }
  }

  let result = null;
  for (const sel of selectors) {
    result = document.querySelector(sel);
    if (result) break;
  }

  // Update cache
  if (cache && cacheKey && ttlMs) {
    cache[cacheKey] = result ? { el: result, time: Date.now() } : null;
  }

  return result;
}

// ── TTL Cache ───────────────────────────────────────────────────────────────

/**
 * Create a generic TTL-based value cache.
 * Replaces the inline `if (cache && now - cacheTime < TTL)` pattern
 * found across 9+ plugins.
 *
 * @param {number} ttlMs - Time-to-live in milliseconds
 * @returns {{ get: () => any, set: (v: any) => void, invalidate: () => void }}
 */
function createTTLCache(ttlMs) {
  let value = null;
  let time = 0;
  return {
    get() { return Date.now() - time < ttlMs ? value : null; },
    set(v) { value = v; time = Date.now(); },
    invalidate() { value = null; time = 0; },
  };
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Acquire Discord's FluxDispatcher using the confirmed working approach.
 * Per doggybootsy (BD core dev, Dec 2025):
 *   1. Webpack.Stores.UserStore._dispatcher  (most reliable)
 *   2. Webpack.getModule(m => m.dispatch && m.subscribe)  (NO optional chaining!)
 *   3. Webpack.getByKeys("actionLogger")  (legacy fallback)
 *
 * @returns {Object|null} The Dispatcher, or null if unavailable
 */
function getDispatcher() {
  try {
    const { Webpack } = BdApi;
    return (
      Webpack.Stores?.UserStore?._dispatcher ||
      Webpack.getModule((m) => m && typeof m.dispatch === "function" && typeof m.subscribe === "function") ||
      Webpack.getByKeys("actionLogger") ||
      null
    );
  } catch (_) {
    return null;
  }
}

// ── Throttle ────────────────────────────────────────────────────────────────

/**
 * Create a throttled version of a function (trailing edge).
 * @param {Function} fn - Function to throttle
 * @param {number} waitMs - Minimum interval between invocations
 * @returns {Function} Throttled function
 */
function createThrottle(fn, waitMs) {
  let lastTime = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = waitMs - (now - lastTime);
    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      lastTime = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

// ── NavigationBus (P5-1) ────────────────────────────────────────────────────
// Shared navigation event bus. Replaces 7 independent history.pushState/
// replaceState wrapper chains with a single coordinated wrapper.
// Eliminates decorator-chain race conditions when plugins start/stop in
// different orders.
//
// Usage:
//   const unsub = NavigationBus.subscribe(({ type, url }) => { ... });
//   // In stop(): unsub();

const NavigationBus = (() => {
  // Window-level singleton — _bdLoad creates separate module copies per plugin,
  // so module scope alone can't share state. All plugins must share ONE bus
  // to avoid 7 independent pushState wrappers.
  if (typeof window !== 'undefined' && window.__BD_NavigationBus) return window.__BD_NavigationBus;

  let initialized = false;
  let originalPushState = null;
  let originalReplaceState = null;
  let popstateHandler = null;
  const subscribers = new Set();

  function init() {
    if (initialized) return;
    initialized = true;
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      notify('pushState', args);
      return result;
    };
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      notify('replaceState', args);
      return result;
    };
    popstateHandler = () => notify('popstate');
    window.addEventListener('popstate', popstateHandler);
  }

  function notify(type, args) {
    const url = window.location.href;
    subscribers.forEach(cb => {
      try { cb({ type, url, args }); } catch (_) { /* subscriber error isolation */ }
    });
  }

  function subscribe(callback) {
    init();
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) teardown();
    };
  }

  function teardown() {
    if (!initialized) return;
    if (subscribers.size > 0) return; // Don't teardown while subscribers exist
    if (originalPushState) history.pushState = originalPushState;
    if (originalReplaceState) history.replaceState = originalReplaceState;
    if (popstateHandler) window.removeEventListener('popstate', popstateHandler);
    originalPushState = null;
    originalReplaceState = null;
    popstateHandler = null;
    initialized = false;
    if (typeof window !== 'undefined') delete window.__BD_NavigationBus;
  }

  const bus = { subscribe, teardown };
  if (typeof window !== 'undefined') window.__BD_NavigationBus = bus;
  return bus;
})();

// ── LayoutObserverBus (P5-4) ────────────────────────────────────────────────
// Shared MutationObserver for the Discord layout container. Replaces 3-5
// independent subtree observers with a single shared observer that dispatches
// to subscribers with per-subscriber throttling.
//
// Usage:
//   const unsub = LayoutObserverBus.subscribe('MyPlugin', () => { ... }, 500);
//   // In stop(): unsub();

const LayoutObserverBus = (() => {
  // Window-level singleton — same reason as NavigationBus above.
  if (typeof window !== 'undefined' && window.__BD_LayoutObserverBus) return window.__BD_LayoutObserverBus;

  let observer = null;
  let target = null;
  const subscribers = new Map(); // id -> { callback, throttleMs, lastFired }

  function ensure() {
    if (observer) return !!target;
    target =
      document.querySelector('[class*="base_"][class*="container_"]') ||
      document.querySelector('[class*="app_"]') ||
      document.getElementById('app-mount');
    if (!target) return false;

    observer = new MutationObserver(() => {
      const now = Date.now();
      subscribers.forEach((sub) => {
        if (now - sub.lastFired < sub.throttleMs) return;
        sub.lastFired = now;
        try { sub.callback(); } catch (_) { /* subscriber error isolation */ }
      });
    });
    observer.observe(target, { childList: true, subtree: true });
    return true;
  }

  function subscribe(id, callback, throttleMs = 500) {
    ensure();
    subscribers.set(id, { callback, throttleMs, lastFired: 0 });
    return () => {
      subscribers.delete(id);
      if (subscribers.size === 0 && observer) {
        observer.disconnect();
        observer = null;
        target = null;
        if (typeof window !== 'undefined') delete window.__BD_LayoutObserverBus;
      }
    };
  }

  const bus = { subscribe, ensure };
  if (typeof window !== 'undefined') window.__BD_LayoutObserverBus = bus;
  return bus;
})();

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  showToast,
  loadSettings,
  saveSettings,
  normalizeHotkey,
  parseHotkey,
  matchesHotkey,
  isEditableTarget,
  querySelectorFallback,
  createTTLCache,
  getDispatcher,
  createThrottle,
  NavigationBus,
  LayoutObserverBus,
};
