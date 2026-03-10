/**
 * Shared Dispatcher acquisition with polling fallback.
 * Replaces the duplicated Dispatcher acquisition pattern found in
 * ShadowSenses, Stealth, and ShadowRecon.
 *
 * Uses the reliable pattern: Webpack.Stores.UserStore._dispatcher
 * (confirmed by BD core dev doggybootsy, Dec 2025)
 *
 * IMPORTANT: NO optional chaining in Webpack.getModule filter — breaks BD matching.
 *
 * Usage:
 *   import { acquireDispatcher, acquireDispatcherAsync } from "../shared/dispatcher";
 *
 *   // Sync (returns null if not ready):
 *   this._Dispatcher = acquireDispatcher();
 *
 *   // Async with polling (returns promise, rejects after timeout):
 *   this._Dispatcher = await acquireDispatcherAsync({ onAcquired: () => this._subscribe() });
 */

const { Webpack } = BdApi;

/**
 * Try to acquire the Dispatcher synchronously.
 * @returns {object|null} The Dispatcher or null
 */
function acquireDispatcher() {
  return (
    Webpack.Stores?.UserStore?._dispatcher ||
    Webpack.getModule((m) => m.dispatch && m.subscribe) ||
    Webpack.getByKeys("actionLogger") ||
    null
  );
}

/**
 * Acquire the Dispatcher with polling fallback.
 * @param {object} [options]
 * @param {number} [options.interval=500] - Poll interval in ms
 * @param {number} [options.maxAttempts=30] - Max poll attempts (default ~15s)
 * @param {function} [options.onAcquired] - Callback when dispatcher is found
 * @param {function} [options.onTimeout] - Callback when polling times out
 * @returns {{ dispatcher: object|null, cancel: function }} Result with cancel handle
 */
function pollForDispatcher(options = {}) {
  const { interval = 500, maxAttempts = 30, onAcquired, onTimeout } = options;

  // Try sync first
  const immediate = acquireDispatcher();
  if (immediate) {
    onAcquired?.(immediate);
    return { dispatcher: immediate, cancel: () => {} };
  }

  let attempt = 0;
  let timer = null;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const tryAcquire = () => {
    attempt++;
    const dispatcher = acquireDispatcher();
    if (dispatcher) {
      timer = null;
      onAcquired?.(dispatcher);
      return;
    }
    if (attempt >= maxAttempts) {
      timer = null;
      onTimeout?.();
      return;
    }
    timer = setTimeout(tryAcquire, interval);
  };

  timer = setTimeout(tryAcquire, interval);
  return { dispatcher: null, cancel };
}

module.exports = { acquireDispatcher, pollForDispatcher };
