/**
 * BetterDiscordPluginUtils — Shared utilities for BetterDiscord plugins.
 * Eliminates duplicate patterns across standalone and connected plugins.
 *
 * Provides: toast, settings, hotkey, editable-target, cached-query helpers.
 * @version 1.0.0
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
};
