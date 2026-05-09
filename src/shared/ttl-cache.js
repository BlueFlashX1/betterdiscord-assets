/**
 * Simple TTL (time-to-live) cache.
 * Replaces the 4+ independent TTL cache implementations in
 * RulersAuthority, TitleManager, HSLWheelBridge, and discord-classes.
 *
 * Usage:
 *   const { createTtlCache } = require("../shared/ttl-cache");
 *   const cache = createTtlCache(5000);  // 5s TTL
 *
 *   cache.set("key", expensiveResult);
 *   cache.get("key");       // => expensiveResult (within TTL)
 *   // ... after 5s ...
 *   cache.get("key");       // => undefined (expired)
 *   cache.invalidate("key");
 *   cache.clear();
 */

/**
 * Create a simple TTL cache.
 * @param {number} [ttlMs=5000] - Time-to-live in milliseconds
 * @returns {{ get: (key: string) => *, set: (key: string, value: *) => void, invalidate: (key: string) => void, clear: () => void }}
 */
function createTtlCache(ttlMs = 5000) {
  const entries = new Map();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (Date.now() - entry.time > ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.set(key, { value, time: Date.now() });
    },
    invalidate(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    }
  };
}

/**
 * Create a single-value TTL cache (no key needed).
 * Drop-in replacement for the inline _ttl pattern used in ShadowStep, ShadowSenses, etc.
 * @param {number} [ttlMs=5000] - Time-to-live in milliseconds
 * @returns {{ get: () => *, set: (value: *) => void, invalidate: () => void }}
 */
function createSingleValueCache(ttlMs = 5000) {
  let value;
  let timestamp = 0;

  return {
    get() {
      return Date.now() - timestamp < ttlMs ? value : null;
    },
    set(v) {
      value = v;
      timestamp = Date.now();
    },
    invalidate() {
      value = null;
      timestamp = 0;
    }
  };
}

module.exports = { createTtlCache, createSingleValueCache };
