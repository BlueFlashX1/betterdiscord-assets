/**
 * Cross-plugin event bus — GLOBAL singleton via window.__SL_EventBus.
 *
 * Each plugin bundles its own copy of this module via esbuild, but they
 * all share the SAME event bus instance through window.__SL_EventBus.
 * This ensures Dungeons' emit() reaches ItemVault's on().
 */

(function initGlobalEventBus() {
  if (typeof window === 'undefined') return;

  if (!window.__SL_EventBus) {
    const listeners = new Map();
    window.__SL_EventBus = {
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
      },
      off(event, handler) {
        const set = listeners.get(event);
        if (set) {
          set.delete(handler);
          if (set.size === 0) listeners.delete(event);
        }
      },
      emit(event, ...args) {
        const set = listeners.get(event);
        if (!set) return;
        for (const handler of set) {
          try { handler(...args); }
          catch (err) { console.error(`[SL:EventBus] ${event}:`, err); }
        }
      },
    };
  }

  // Also patch BdApi.Events if missing
  if (typeof BdApi !== 'undefined' && (!BdApi.Events || typeof BdApi.Events.on !== 'function')) {
    BdApi.Events = window.__SL_EventBus;
  }
})();

module.exports = window.__SL_EventBus;
