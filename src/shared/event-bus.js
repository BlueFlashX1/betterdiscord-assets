/**
 * Cross-plugin event bus — GLOBAL singleton via window.__SL_EventBus.
 *
 * Each plugin bundles its own copy of this module via esbuild, but they
 * all share the SAME event bus instance through window.__SL_EventBus.
 *
 * IMPORTANT: This bus WRAPS BdApi.Events if it exists, forwarding events
 * to both buses so listeners on either side always receive events.
 */

(function initGlobalEventBus() {
  if (typeof window === 'undefined') return;

  if (!window.__SL_EventBus) {
    const listeners = new Map();

    // Detect native BdApi.Events (present in BetterDiscord 1.10+)
    const nativeBus = (typeof BdApi !== 'undefined' && BdApi.Events &&
      typeof BdApi.Events.on === 'function' && typeof BdApi.Events.emit === 'function')
      ? BdApi.Events : null;

    window.__SL_EventBus = {
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        // Also subscribe on native bus so events from plugins using BdApi.Events directly arrive
        if (nativeBus) {
          try { nativeBus.on(event, handler); } catch (_) {}
        }
      },
      off(event, handler) {
        const set = listeners.get(event);
        if (set) {
          set.delete(handler);
          if (set.size === 0) listeners.delete(event);
        }
        if (nativeBus) {
          try { nativeBus.off(event, handler); } catch (_) {}
        }
      },
      emit(event, ...args) {
        // Fire on our own listeners
        const set = listeners.get(event);
        if (set) {
          for (const handler of set) {
            try { handler(...args); }
            catch (err) { console.error(`[SL:EventBus] ${event}:`, err); }
          }
        }
        // Also fire on native BdApi.Events so plugins listening there receive it
        if (nativeBus) {
          try { nativeBus.emit(event, ...args); } catch (_) {}
        }
      },
    };
  }
})();

module.exports = window.__SL_EventBus;
