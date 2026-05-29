/**
 * Shared header-toolbar utility — eliminates per-plugin 2s/3s/5s self-heal
 * polls that wait for Discord to re-render the channel header.
 *
 * Two helpers:
 *   - getChannelHeaderToolbar()  — one-shot lookup, returns the visible
 *                                  canonical toolbar element or null.
 *   - watchToolbar(onChange)     — subscribes to toolbar-changed events
 *                                  (CHANNEL_SELECT, VOICE_STATE_UPDATES,
 *                                  and a narrow MutationObserver as a
 *                                  belt-and-suspenders fallback).
 *                                  Fires once on attach, returns an
 *                                  unsubscribe function.
 *
 * Replaces the per-plugin pattern:
 *   this._headerIconLoop = setInterval(() => this._ensureHeaderIcon(), 2000);
 * with:
 *   this._unwatchToolbar = watchToolbar(() => this._ensureHeaderIcon());
 *
 * Why this is event-driven, not polled:
 *   - 99% of "toolbar disappeared" cases are caused by a channel switch.
 *     CHANNEL_SELECT FluxDispatcher event fires exactly when this happens.
 *   - Edge cases (BD plugin reload, settings modal closing) are covered by
 *     a single MutationObserver scoped to #app-mount that filters down to
 *     additions/removals of elements that match toolbar / channel-header
 *     selectors directly (no subtree querySelector — cheap).
 *   - All onChange invocations are coalesced through one rAF tick so a
 *     burst of mutations only triggers one user-callback.
 *
 * Adapted from the original implementation in
 * src/RulersAuthority/panels.js (getChannelHeaderToolbar +
 * TOOLBAR_FALLBACKS) which already proved out the selector cascade.
 */

const TOOLBAR_FALLBACKS = [
  '[aria-label="Channel header"] [class*="toolbar_"]',
  '[class*="titleWrapper_"] [class*="toolbar_"]',
  'header [class*="toolbar_"]',
];

/**
 * Returns the canonical visible toolbar element, or null if none is mounted.
 * Filters out off-screen / hidden toolbars (offsetParent === null) so plugins
 * inject into the channel currently in view, not a stale one from a previous
 * mount.
 */
function getChannelHeaderToolbar() {
  for (const selector of TOOLBAR_FALLBACKS) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!node || node.offsetParent === null) continue;
      const host = node.closest('[aria-label="Channel header"], [class*="titleWrapper_"], header');
      if (host && host.offsetParent === null) continue;
      return node;
    }
  }
  return null;
}

/**
 * Returns every visible toolbar element (multi-pane layouts can mount more
 * than one — e.g. forum split-view).
 */
function getAllChannelHeaderToolbars() {
  const out = [];
  const seen = new Set();
  for (const selector of TOOLBAR_FALLBACKS) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!node || seen.has(node)) continue;
      if (node.offsetParent === null) continue;
      seen.add(node);
      out.push(node);
    }
  }
  return out;
}

function _resolveDispatcher() {
  const Webpack = BdApi.Webpack;
  if (!Webpack) return null;
  const fromStore = Webpack.Stores?.UserStore?._dispatcher;
  if (fromStore && typeof fromStore.subscribe === 'function') return fromStore;
  if (typeof Webpack.getModule === 'function') {
    try {
      const mod = Webpack.getModule((m) => m && typeof m.dispatch === 'function' && typeof m.subscribe === 'function');
      if (mod && typeof mod.subscribe === 'function') return mod;
    } catch (_) {}
  }
  return null;
}

/**
 * Subscribe to "toolbar might need re-evaluation" events.
 *
 * Triggers:
 *   1. CHANNEL_SELECT FluxDispatcher action — every channel/DM/thread switch.
 *   2. VOICE_STATE_UPDATES — current user joined/left voice (changes which
 *      toolbar is canonical when the VC overlay mounts/unmounts).
 *   3. MutationObserver on #app-mount — narrow filter, only fires for
 *      added/removed nodes that ARE a toolbar / channel header directly
 *      (no subtree query). Catches BD plugin reload, settings close, etc.
 *
 * The onChange callback is called once on attach so the first paint is
 * handled, then on every trigger. All invocations are coalesced via rAF.
 *
 * @param {Function} onChange — invoked with no args when re-evaluation is needed
 * @returns {Function} unsubscribe — call from your plugin's stop()
 */
/**
 * Window-hosted toolbar hub — ONE MutationObserver + ONE pair of Flux
 * subscriptions + ONE visibilitychange listener shared across EVERY plugin
 * that calls watchToolbar(), regardless of which bundle they live in.
 *
 * esbuild bundles src/shared/* into each plugin separately, so module-level
 * state is NOT shared cross-plugin — only globals are. Previously each
 * consumer created its own observer on #app-mount (N observers firing on
 * every Discord re-render). This collapses them to one, fanning out to all
 * registered callbacks. Same first-wins pattern as shared/event-bus.js.
 */
function _getToolbarHub() {
  if (window.__SL_ToolbarHub) return window.__SL_ToolbarHub;

  const hub = {
    callbacks: new Set(),
    _rafScheduled: false,
    _mo: null,
    _dispatcherUnsubs: [],
    _onVisibility: null,

    // Coalesce a burst of triggers into one rAF tick, fan out to all callbacks.
    fireAll() {
      if (this._rafScheduled || document.hidden) return;
      this._rafScheduled = true;
      requestAnimationFrame(() => {
        this._rafScheduled = false;
        for (const cb of this.callbacks) {
          try { cb(); } catch (_) {}
        }
      });
    },

    _setup() {
      const dispatcher = _resolveDispatcher();
      if (dispatcher) {
        const fire = () => this.fireAll();
        for (const action of ['CHANNEL_SELECT', 'VOICE_STATE_UPDATES']) {
          try {
            dispatcher.subscribe(action, fire);
            this._dispatcherUnsubs.push(() => {
              try { dispatcher.unsubscribe(action, fire); } catch (_) {}
            });
          } catch (_) {}
        }
      }
      try {
        const target = document.getElementById('app-mount') || document.body;
        this._mo = new MutationObserver((records) => {
          // PERF: no work while hidden; visibilitychange re-fires on return.
          if (document.hidden) return;
          for (const r of records) {
            for (const list of [r.addedNodes, r.removedNodes]) {
              for (const node of list) {
                if (node.nodeType !== 1) continue;
                if (node.matches?.('[aria-label="Channel header"], [class*="toolbar_"]')) {
                  this.fireAll();
                  return;
                }
              }
            }
          }
        });
        this._mo.observe(target, { childList: true, subtree: true });
      } catch (_) { this._mo = null; }
      try {
        this._onVisibility = () => { if (!document.hidden) this.fireAll(); };
        document.addEventListener('visibilitychange', this._onVisibility);
      } catch (_) { this._onVisibility = null; }
    },

    _teardown() {
      for (const fn of this._dispatcherUnsubs) { try { fn(); } catch (_) {} }
      this._dispatcherUnsubs = [];
      if (this._mo) { try { this._mo.disconnect(); } catch (_) {} this._mo = null; }
      if (this._onVisibility) {
        try { document.removeEventListener('visibilitychange', this._onVisibility); } catch (_) {}
        this._onVisibility = null;
      }
    },

    add(cb) {
      const wasEmpty = this.callbacks.size === 0;
      this.callbacks.add(cb);
      if (wasEmpty) this._setup();
      // Fire only the newly-registered callback once on attach.
      requestAnimationFrame(() => {
        if (this.callbacks.has(cb)) { try { cb(); } catch (_) {} }
      });
    },

    remove(cb) {
      this.callbacks.delete(cb);
      if (this.callbacks.size === 0) this._teardown();
    },
  };

  window.__SL_ToolbarHub = hub;
  return hub;
}

function watchToolbar(onChange) {
  if (typeof onChange !== 'function') return () => {};
  const hub = _getToolbarHub();
  hub.add(onChange);
  let disposed = false;
  return function unwatch() {
    if (disposed) return;
    disposed = true;
    hub.remove(onChange);
  };
}

module.exports = {
  TOOLBAR_FALLBACKS,
  getChannelHeaderToolbar,
  getAllChannelHeaderToolbars,
  watchToolbar,
};
