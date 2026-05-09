/**
 * Shared FluxDispatcher acquisition — single source of truth.
 *
 * 6-tier waterfall + exponential backoff polling + singleton cache.
 * Replaces all inline dispatcher code in CriticalHit, Stealth,
 * ShadowSenses, and ShadowAwayBridge.
 *
 * Confirmed pattern: Webpack.Stores.<AnyStore>._dispatcher
 * (BD core dev doggybootsy, Dec 2025)
 *
 * IMPORTANT: NO optional chaining in Webpack.getModule filters —
 * breaks BdApi's internal filter matching.
 *
 * Usage:
 *   const { acquireDispatcher, pollForDispatcher } = require("../shared/dispatcher");
 *
 *   // Sync (returns cached instance or attempts acquisition):
 *   this._Dispatcher = acquireDispatcher();
 *
 *   // Async with exponential backoff (recommended for start()):
 *   const handle = pollForDispatcher({
 *     onAcquired: (d) => { this._Dispatcher = d; this._subscribe(); },
 *     onTimeout:  ()  => { console.error('Dispatcher unavailable'); },
 *   });
 *   // To cancel on stop(): handle.cancel();
 */

const { Webpack } = BdApi;

// ── Singleton cache ──────────────────────────────────────────────
// Once acquired, the dispatcher never changes for the lifetime of
// Discord's renderer process. Cache it so subsequent calls are free.
let _cached = null;

/**
 * Validate that an object looks like a real FluxDispatcher.
 * Guards against Webpack returning a wrong module.
 */
function isValidDispatcher(d) {
  return (
    d != null &&
    typeof d.subscribe === 'function' &&
    typeof d.dispatch === 'function' &&
    typeof d.unsubscribe === 'function'
  );
}

/**
 * Try to extract _dispatcher from any available Flux store.
 * Every Flux store instance holds a reference to the shared dispatcher.
 */
function extractFromStores() {
  try {
    const stores = Webpack.Stores;
    if (!stores) return null;

    // Priority order: UserStore is always loaded first, then common stores
    const storeNames = [
      'UserStore',
      'GuildStore',
      'ChannelStore',
      'SelectedChannelStore',
      'MessageStore',
      'PresenceStore',
    ];

    for (const name of storeNames) {
      const d = stores[name]?._dispatcher;
      if (isValidDispatcher(d)) return d;
    }

    // Fallback: iterate ALL stores if named ones failed
    for (const key of Object.keys(stores)) {
      try {
        const d = stores[key]?._dispatcher;
        if (isValidDispatcher(d)) return d;
      } catch (_) { /* some stores may throw on access */ }
    }
  } catch (_) {}
  return null;
}

/**
 * Acquire the FluxDispatcher synchronously.
 * Uses a 6-tier waterfall, returning the first valid match.
 * Result is cached — subsequent calls return instantly.
 *
 * @returns {object|null} The Dispatcher, or null if not yet available.
 */
function acquireDispatcher() {
  // Return cached if we already found it
  if (_cached) return _cached;

  const d =
    // Tier 1: Extract from Flux stores (most reliable, zero search cost)
    extractFromStores() ||
    // Tier 2: Webpack module filter (NO optional chaining!)
    Webpack.getModule(m => m.dispatch && m.subscribe && m.unsubscribe) ||
    // Tier 3: Legacy named key
    Webpack.getByKeys('actionLogger') ||
    // Tier 4: Webpack filter with _actionHandlers (Discord-specific internal)
    Webpack.getModule(m => m.dispatch && m._actionHandlers) ||
    // Tier 5: Check for global FluxDispatcher (some BD builds expose it)
    (typeof window !== 'undefined' && isValidDispatcher(window.FluxDispatcher) ? window.FluxDispatcher : null) ||
    null;

  if (isValidDispatcher(d)) {
    _cached = d;
    return d;
  }
  return null;
}

/**
 * Acquire the Dispatcher with exponential backoff polling.
 *
 * Backoff schedule: 200ms, 400ms, 800ms, 1.6s, 3.2s... capped at 5s.
 * Total timeout default: 30s (covers slow Discord cold-starts).
 *
 * @param {object} [options]
 * @param {number} [options.initialDelay=200]  - First poll delay (ms)
 * @param {number} [options.maxDelay=5000]     - Cap on backoff delay (ms)
 * @param {number} [options.timeout=30000]     - Total timeout (ms)
 * @param {function} [options.onAcquired]      - Called with dispatcher on success
 * @param {function} [options.onTimeout]       - Called if timeout expires
 * @param {function} [options.onPoll]          - Called each poll attempt (attempt, delay)
 * @returns {{ dispatcher: object|null, cancel: function }}
 */
function pollForDispatcher(options = {}) {
  const {
    initialDelay = 200,
    maxDelay = 5000,
    timeout = 30000,
    onAcquired,
    onTimeout,
    onPoll,
  } = options;

  // Try sync first — fast path
  const immediate = acquireDispatcher();
  if (immediate) {
    onAcquired?.(immediate);
    return { dispatcher: immediate, cancel: () => {} };
  }

  let timer = null;
  let cancelled = false;
  let attempt = 0;
  let delay = initialDelay;
  const startTime = Date.now();

  const cancel = () => {
    cancelled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const tryAcquire = () => {
    if (cancelled) return;
    attempt++;

    onPoll?.(attempt, delay);

    const dispatcher = acquireDispatcher();
    if (dispatcher) {
      timer = null;
      onAcquired?.(dispatcher);
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= timeout) {
      timer = null;
      onTimeout?.();
      return;
    }

    // Exponential backoff capped at maxDelay
    delay = Math.min(delay * 2, maxDelay);
    // Don't exceed remaining timeout
    delay = Math.min(delay, timeout - elapsed);
    timer = setTimeout(tryAcquire, delay);
  };

  timer = setTimeout(tryAcquire, initialDelay);
  return { dispatcher: null, cancel };
}

/**
 * Reset the cached dispatcher (for testing or hot-reload recovery).
 */
function resetCache() {
  _cached = null;
}

module.exports = { acquireDispatcher, pollForDispatcher, isValidDispatcher, resetCache };
