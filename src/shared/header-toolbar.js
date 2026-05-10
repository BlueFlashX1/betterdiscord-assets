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
function watchToolbar(onChange) {
  if (typeof onChange !== 'function') return () => {};

  let rafScheduled = false;
  let disposed = false;
  const fire = () => {
    if (disposed || rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      if (disposed) return;
      try { onChange(); } catch (_) {}
    });
  };

  // Dispatcher triggers — primary, covers 99% of cases.
  const dispatcher = _resolveDispatcher();
  const dispatcherUnsubs = [];
  if (dispatcher) {
    const actions = ['CHANNEL_SELECT', 'VOICE_STATE_UPDATES'];
    for (const action of actions) {
      try {
        dispatcher.subscribe(action, fire);
        dispatcherUnsubs.push(() => {
          try { dispatcher.unsubscribe(action, fire); } catch (_) {}
        });
      } catch (_) {}
    }
  }

  // MutationObserver — narrow filter, only fires for direct toolbar /
  // channel-header insertions/removals. Subtree:true is required because
  // Discord re-renders the chat layer (which contains the channel header)
  // as part of a larger React subtree, but we DON'T do a subtree
  // querySelector inside the callback — only matches() on the added node
  // itself. That keeps the callback O(1) per mutation regardless of
  // subtree depth.
  let mo = null;
  try {
    const target = document.getElementById('app-mount') || document.body;
    mo = new MutationObserver((records) => {
      if (disposed) return;
      for (const r of records) {
        for (const list of [r.addedNodes, r.removedNodes]) {
          for (const node of list) {
            if (node.nodeType !== 1) continue;
            if (node.matches?.('[aria-label="Channel header"], [class*="toolbar_"]')) {
              fire();
              return;
            }
          }
        }
      }
    });
    mo.observe(target, { childList: true, subtree: true });
  } catch (_) {
    mo = null;
  }

  // Fire once on attach so initial DOM is evaluated immediately.
  fire();

  return function unwatch() {
    if (disposed) return;
    disposed = true;
    for (const fn of dispatcherUnsubs) {
      try { fn(); } catch (_) {}
    }
    if (mo) {
      try { mo.disconnect(); } catch (_) {}
      mo = null;
    }
  };
}

module.exports = {
  TOOLBAR_FALLBACKS,
  getChannelHeaderToolbar,
  getAllChannelHeaderToolbars,
  watchToolbar,
};
