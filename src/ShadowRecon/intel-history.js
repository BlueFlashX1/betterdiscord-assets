/**
 * Intel history utilities for ShadowRecon — ring buffers persisted via
 * BdApi.Data and FluxDispatcher subscription bookkeeping.
 *
 * All ring storage uses `BdApi.Data.save("ShadowRecon", key, [...])`. Keys
 * follow the convention `intel:<bucket>:<id>` so they group cleanly when
 * inspecting persistence dumps.
 */

const PLUGIN_NAME = "ShadowRecon";

// ─── Ring buffer helpers ───────────────────────────────────────────────

function ringRead(key) {
  try {
    const raw = BdApi.Data.load(PLUGIN_NAME, key);
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function ringWrite(key, arr, cap) {
  try {
    const trimmed = arr.length > cap ? arr.slice(arr.length - cap) : arr;
    BdApi.Data.save(PLUGIN_NAME, key, trimmed);
    return trimmed;
  } catch (_) {
    return arr;
  }
}

/**
 * Append `entry` to the ring at `key`, deduping by `bucketFn(entry) ===
 * bucketFn(lastExisting)` so e.g. multiple samples within the same hour
 * collapse to one. `entry.t` is expected to be a Date.now() timestamp.
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
 * Per the betterdiscord-assets CLAUDE.md guidance, the most reliable
 * way to acquire the dispatcher is via UserStore._dispatcher; falls
 * back to a getModule filter without optional chaining (which breaks
 * Webpack matching).
 */
function dispatcherSubscribe(plugin, event, handler) {
  try {
    const Webpack = BdApi?.Webpack;
    if (!Webpack) return false;
    const dispatcher =
      Webpack.Stores?.UserStore?._dispatcher ||
      Webpack.getModule(function (m) { return m && m.dispatch && m.subscribe; });
    if (!dispatcher || typeof dispatcher.subscribe !== "function") return false;
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
  bucketHour,
  bucketDay,
  dispatcherSubscribe,
  dispatcherUnsubscribeAll,
};
