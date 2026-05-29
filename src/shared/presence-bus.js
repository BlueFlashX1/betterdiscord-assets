/**
 * Window-hosted Flux presence relay — shared across every plugin.
 *
 * Discord fires PRESENCE_UPDATES (and PRESENCE_UPDATE / PRESENCES_REPLACE) very
 * frequently on busy servers. Multiple plugins (ShadowSenses, ShadowRecon,
 * Stealth) each registered their OWN Flux subscription for the same event,
 * so every presence event ran N independent dispatcher subscriptions.
 *
 * This hosts ONE subscription per distinct event name on window.__SL_PresenceBus
 * (first-wins, like event-bus.js) and fans each event out to all registered
 * handlers. Fan-out is FAITHFUL and UNTHROTTLED: every event reaches every
 * handler with its original payload — presence payloads are per-event (handlers
 * diff individual users), so coalescing would drop data. The win is collapsing
 * duplicate subscriptions, not dropping events.
 */
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

function _getPresenceBus() {
  if (window.__SL_PresenceBus) return window.__SL_PresenceBus;

  const bus = {
    _byEvent: new Map(), // eventName -> { handlers: Set, sub: fn|null }
    _dispatcher: null,

    _ensureDispatcher() {
      if (!this._dispatcher) this._dispatcher = _resolveDispatcher();
      return this._dispatcher;
    },

    on(eventName, handler) {
      let entry = this._byEvent.get(eventName);
      if (!entry) { entry = { handlers: new Set(), sub: null }; this._byEvent.set(eventName, entry); }
      entry.handlers.add(handler);
      if (!entry.sub) {
        const d = this._ensureDispatcher();
        if (d) {
          entry.sub = (action) => { for (const h of entry.handlers) { try { h(action); } catch (_) {} } };
          try { d.subscribe(eventName, entry.sub); } catch (_) { entry.sub = null; }
        }
      }
      return () => {
        entry.handlers.delete(handler);
        if (entry.handlers.size === 0 && entry.sub && this._dispatcher) {
          try { this._dispatcher.unsubscribe(eventName, entry.sub); } catch (_) {}
          entry.sub = null;
        }
      };
    },
  };

  window.__SL_PresenceBus = bus;
  return bus;
}

/**
 * Subscribe to a Discord presence Flux event via the shared single subscription.
 * Handler receives the raw Flux action (same shape Discord dispatches).
 * @param {string} eventName e.g. "PRESENCE_UPDATES" | "PRESENCE_UPDATE" | "PRESENCES_REPLACE"
 * @param {(action: any) => void} handler
 * @returns {() => void} unsubscribe
 */
function onPresence(eventName, handler) {
  if (typeof eventName !== 'string' || typeof handler !== 'function') return () => {};
  return _getPresenceBus().on(eventName, handler);
}

module.exports = { onPresence };
