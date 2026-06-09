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

    // Lazily-resolved reference to BdApi.Events. Captured at first call
    // rather than at module-init, because BdApi.Events may not be ready
    // when the first plugin initialises window.__SL_EventBus.
    // Memoized on first success so the lookup runs at most once.
    let _nativeBus = null;
    let _nativeBusChecked = false;
    function _getNativeBus() {
      if (_nativeBusChecked) return _nativeBus;
      _nativeBusChecked = true;
      if (typeof BdApi !== 'undefined' && BdApi.Events &&
          typeof BdApi.Events.on === 'function' && typeof BdApi.Events.emit === 'function') {
        _nativeBus = BdApi.Events;
      }
      return _nativeBus;
    }

    window.__SL_EventBus = {
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        // Also subscribe on native bus so events from plugins using BdApi.Events directly arrive
        const _nb_on = _getNativeBus();
        if (_nb_on) {
          try { _nb_on.on(event, handler); } catch (_) {}
        }
      },
      off(event, handler) {
        const set = listeners.get(event);
        if (set) {
          set.delete(handler);
          if (set.size === 0) listeners.delete(event);
        }
        const _nb_off = _getNativeBus();
        if (_nb_off) {
          try { _nb_off.off(event, handler); } catch (_) {}
        }
      },
      emit(event, ...args) {
        const set = listeners.get(event);
        if (set) {
          for (const handler of set) {
            try { handler(...args); }
            catch (err) { console.error(`[SL:EventBus] ${event}:`, err); }
          }
        }
        // DO NOT forward to nativeBus — handlers are already registered there
        // via on(). Forwarding would cause double-fire.
      },
    };
  }
})();

module.exports = window.__SL_EventBus;
