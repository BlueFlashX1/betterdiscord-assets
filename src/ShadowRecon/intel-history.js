/**
 * Intel history utilities for ShadowRecon — ring buffers persisted via
 * BdApi.Data and FluxDispatcher subscription bookkeeping.
 *
 * All ring storage uses `BdApi.Data.save("ShadowRecon", key, [...])`. Keys
 * follow the convention `intel:<bucket>:<id>` so they group cleanly when
 * inspecting persistence dumps.
 *
 * Perf note: ringPush / ringRead use an in-memory working-set Map to avoid
 * synchronous IDB round-trips on every PRESENCE_UPDATES event. Dirty keys are
 * flushed to BdApi.Data on a 500 ms trailing debounce or on explicit
 * flushRingBuffers() calls (e.g. stop()). The on-disk shape is unchanged —
 * history rings survive reload because the first ringRead for any key cold-
 * loads from disk into the working-set.
 */

const { acquireDispatcher } = require("../shared/dispatcher");

const PLUGIN_NAME = "ShadowRecon";

// ─── In-memory working-set ─────────────────────────────────────────────

/** @type {Map<string, Array>} */
const _ringCache = new Map();
/** @type {Set<string>} */
const _ringDirty = new Set();
/** @type {number|null} */
let _ringFlushTimer = null;
/** @type {boolean} LEAK FIX: guard so debounced flush no-ops after stop(). */
let _ringStopped = false;

const FLUSH_DEBOUNCE_MS = 500;

/**
 * Flush all dirty keys to BdApi.Data. Safe to call from stop() even if no
 * timer is pending — it's a no-op when nothing is dirty.
 */
function flushRingBuffers() {
  if (_ringFlushTimer !== null) {
    clearTimeout(_ringFlushTimer);
    _ringFlushTimer = null;
  }
  for (const key of _ringDirty) {
    try {
      const arr = _ringCache.get(key);
      if (Array.isArray(arr)) BdApi.Data.save(PLUGIN_NAME, key, arr);
    } catch (_) {}
  }
  _ringDirty.clear();
}

function _scheduleFlush() {
  if (_ringStopped) return; // LEAK FIX: no-op after stop()
  if (_ringFlushTimer !== null) return; // already scheduled
  _ringFlushTimer = setTimeout(() => {
    _ringFlushTimer = null;
    if (!_ringStopped) flushRingBuffers(); // LEAK FIX: guard stale callback
  }, FLUSH_DEBOUNCE_MS);
}

/**
 * Clear the in-memory working-set and cancel any pending flush.
 * Call from the plugin's stop()/teardown path so the Map doesn't
 * persist across re-enables within the same BD session.
 */
function clearRingCache() {
  _ringStopped = true;
  if (_ringFlushTimer !== null) {
    clearTimeout(_ringFlushTimer);
    _ringFlushTimer = null;
  }
  _ringCache.clear();
  // NOTE: _ringDirty is already cleared by flushRingBuffers() on stop();
  // if stop() calls flushRingBuffers() THEN clearRingCache() the Set is
  // already empty. Clear defensively in case the order is reversed.
  _ringDirty.clear();
  _ringStopped = false; // reset so re-enable works cleanly
}

// ─── Ring buffer helpers ───────────────────────────────────────────────

/**
 * Read a ring from the in-memory working-set, cold-loading from disk on the
 * first access for a given key. Never hits IDB on subsequent calls within the
 * same session.
 */
function ringRead(key) {
  if (_ringCache.has(key)) return _ringCache.get(key);
  try {
    const raw = BdApi.Data.load(PLUGIN_NAME, key);
    const arr = Array.isArray(raw) ? raw : [];
    _ringCache.set(key, arr);
    return arr;
  } catch (_) {
    _ringCache.set(key, []);
    return [];
  }
}

/**
 * Trim the in-memory array to cap and mark it dirty for flushing.
 * Does NOT call BdApi.Data.save synchronously.
 */
function ringWrite(key, arr, cap) {
  try {
    const trimmed = arr.length > cap ? arr.slice(arr.length - cap) : arr;
    _ringCache.set(key, trimmed);
    _ringDirty.add(key);
    _scheduleFlush();
    return trimmed;
  } catch (_) {
    return arr;
  }
}

/**
 * Append `entry` to the ring at `key`, deduping by `bucketFn(entry) ===
 * bucketFn(lastExisting)` so e.g. multiple samples within the same hour
 * collapse to one. `entry.t` is expected to be a Date.now() timestamp.
 *
 * Mutates only the in-memory working-set; disk flush is debounced to 500 ms.
 */
function ringPush(key, entry, cap, bucketFn) {
  const arr = ringRead(key);
  if (typeof bucketFn === "function" && arr.length > 0) {
    const lastBucket = bucketFn(arr[arr.length - 1]);
    const newBucket = bucketFn(entry);
    if (lastBucket === newBucket) {
      // Same bucket — replace the existing entry rather than append.
      arr[arr.length - 1] = entry;
      return ringWrite(key, arr, cap);
    }
  }
  arr.push(entry);
  return ringWrite(key, arr, cap);
}

// Bucket helpers for common time granularities.
function bucketHour(entry) {
  return Math.floor((entry?.t || 0) / 3600000);
}
function bucketDay(entry) {
  return Math.floor((entry?.t || 0) / 86400000);
}

// ─── FluxDispatcher subscription bookkeeping ────────────────────────────

/**
 * Subscribe `handler` to `event` on Discord's FluxDispatcher and track
 * the pair on `plugin._dispatcherSubs` so `dispatcherUnsubscribeAll` can
 * drain everything during stop().
 *
 * Acquisition delegates to the shared 6-tier waterfall in
 * shared/dispatcher.js (acquireDispatcher) rather than hand-rolling a
 * subset here.
 */
function dispatcherSubscribe(plugin, event, handler) {
  try {
    const dispatcher = acquireDispatcher();
    if (!dispatcher) return false;
    dispatcher.subscribe(event, handler);
    if (!Array.isArray(plugin._dispatcherSubs)) plugin._dispatcherSubs = [];
    plugin._dispatcherSubs.push({ dispatcher, event, handler });
    return true;
  } catch (_) {
    return false;
  }
}

function dispatcherUnsubscribeAll(plugin) {
  const list = plugin?._dispatcherSubs;
  if (!Array.isArray(list)) return;
  for (const { dispatcher, event, handler } of list) {
    try { dispatcher.unsubscribe(event, handler); } catch (_) {}
  }
  plugin._dispatcherSubs = [];
}

module.exports = {
  ringRead,
  ringWrite,
  ringPush,
  flushRingBuffers,
  clearRingCache,
  bucketHour,
  bucketDay,
  dispatcherSubscribe,
  dispatcherUnsubscribeAll,
};
