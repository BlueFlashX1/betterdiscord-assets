/**
 * Bounded last-known-content cache.
 *
 * Why this exists: on MESSAGE_UPDATE we need the message text as it was
 * BEFORE the edit. Two sources can supply it and neither is reliable alone:
 *
 *   1. MessageStore.getMessage() — holds the old text only if our dispatcher
 *      subscriber runs before the store's own action handler. Flux runs store
 *      handlers first and plain subscribers after, so by the time we look the
 *      store has usually already applied the new text.
 *   2. This cache — our own snapshot, written when we first see a message
 *      (MESSAGE_CREATE / channel history load). Immune to dispatch ordering.
 *
 * index.js reads the cache first and falls back to the store, using an
 * equality check to detect the "store already applied the edit" case. This
 * file is only the storage half.
 *
 * Bounded by insertion order (oldest evicted first) — an unbounded map of
 * every message text seen in a long session is a leak, and old entries are
 * worthless anyway: an edit lands seconds to minutes after the message, and
 * anything already persisted to IndexedDB no longer needs a live snapshot.
 */

const DEFAULT_MAX_ENTRIES = 5000;

/**
 * @param {number} [maxEntries] - Hard cap on retained snapshots.
 */
function createContentCache(maxEntries = DEFAULT_MAX_ENTRIES) {
  // Map preserves insertion order, which gives FIFO eviction for free.
  const entries = new Map();

  return {
    /**
     * Record the current text of a message. Re-setting an existing id
     * refreshes its content but keeps its original eviction position — the
     * cap must bound total age, not be resettable by repeated edits.
     */
    set(messageId, content) {
      if (!messageId) return;
      entries.set(messageId, content ?? "");
      if (entries.size > maxEntries) {
        // Evict oldest. One per insert keeps this O(1) amortised.
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }
    },

    /** @returns {string|undefined} undefined when never seen (not "" — empty content is valid). */
    get(messageId) {
      return entries.get(messageId);
    },

    delete(messageId) {
      entries.delete(messageId);
    },

    clear() {
      entries.clear();
    },

    get size() {
      return entries.size;
    },
  };
}

module.exports = { createContentCache };
