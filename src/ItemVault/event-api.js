/**
 * ItemVault Event API — cross-plugin interface via event bus.
 */

const Events = require('../shared/event-bus');
const { isValidItem } = require('./item-registry');

class ItemVaultEventAPI {
  constructor(storage, debugLog) {
    this._storage = storage;
    this._debugLog = debugLog || (() => {});
    this._handlers = {};
  }

  mount() {
    this._handlers = {
      add: (data) => this._onAdd(data),
      spend: (data) => this._onSpend(data),
      set: (data) => this._onSet(data),
      query: (data) => this._onQuery(data),
      queryAll: (data) => this._onQueryAll(data),
    };

    Events.on('ItemVault:add', this._handlers.add);
    Events.on('ItemVault:spend', this._handlers.spend);
    Events.on('ItemVault:set', this._handlers.set);
    Events.on('ItemVault:query', this._handlers.query);
    Events.on('ItemVault:queryAll', this._handlers.queryAll);

    this._debugLog('EventAPI mounted — listening for ItemVault events');
  }

  unmount() {
    Events.off('ItemVault:add', this._handlers.add);
    Events.off('ItemVault:spend', this._handlers.spend);
    Events.off('ItemVault:set', this._handlers.set);
    Events.off('ItemVault:query', this._handlers.query);
    Events.off('ItemVault:queryAll', this._handlers.queryAll);
    this._handlers = {};
  }

  broadcastReady() {
    Events.emit('ItemVault:ready', {
      balances: this._storage.getAllBalances(),
    });
  }

  _onAdd({ itemId, amount, source, meta } = {}) {
    if (!itemId || !amount || amount <= 0) return;
    if (!isValidItem(itemId)) {
      this._debugLog(`ADD rejected — unknown item: ${itemId}`);
      return;
    }

    const oldAmount = this._storage.getAmount(itemId);
    const newAmount = this._storage.add(itemId, amount, meta);

    this._debugLog(`ADD ${itemId}: ${oldAmount} → ${newAmount} (+${amount}) [${source || 'unknown'}]`);

    Events.emit('ItemVault:changed', {
      itemId, oldAmount, newAmount,
      action: 'add', amount,
      source: source || 'unknown',
    });
  }

  _onSpend({ itemId, amount, source, reason } = {}) {
    if (!itemId || !amount || amount <= 0) return;
    if (!isValidItem(itemId)) {
      this._debugLog(`SPEND rejected — unknown item: ${itemId}`);
      return;
    }

    const oldAmount = this._storage.getAmount(itemId);
    const result = this._storage.spend(itemId, amount);

    if (result.success) {
      this._debugLog(`SPEND ${itemId}: ${oldAmount} → ${result.newAmount} (-${amount}) [${source || 'unknown'}] ${reason || ''}`);

      Events.emit('ItemVault:changed', {
        itemId, oldAmount,
        newAmount: result.newAmount,
        action: 'spend', amount,
        source: source || 'unknown',
        reason,
      });
    } else {
      // Dedup identical failures: a caller retrying the same unaffordable spend
      // (same item, same need, same balance) logs once, not once per attempt.
      // A change in either amount or balance produces a new key and logs again.
      const failKey = `${itemId}:${amount}:${oldAmount}`;
      if (this._lastSpendFailKey !== failKey) {
        this._lastSpendFailKey = failKey;
        this._debugLog(`SPEND FAILED ${itemId}: have ${oldAmount}, need ${amount}, short ${result.shortfall} [${source || 'unknown'}]`);
      }

      Events.emit('ItemVault:spendFailed', {
        itemId,
        requested: amount,
        current: oldAmount,
        shortfall: result.shortfall,
        source: source || 'unknown',
        reason,
      });
    }
  }

  _onSet({ itemId, amount, source } = {}) {
    if (!itemId || amount == null) return;
    if (!isValidItem(itemId)) return;

    const oldAmount = this._storage.getAmount(itemId);
    const newAmount = this._storage.set(itemId, amount);

    // No-op set: another plugin (e.g. ShadowArmy/Dungeons) re-syncing an unchanged
    // value. Skip the log and the change event so it doesn't spam the console or
    // trigger needless downstream re-renders.
    if (newAmount === oldAmount) return;

    this._debugLog(`SET ${itemId}: ${oldAmount} → ${newAmount} [${source || 'unknown'}]`);

    Events.emit('ItemVault:changed', {
      itemId, oldAmount, newAmount,
      action: 'set',
      source: source || 'unknown',
    });
  }

  _onQuery({ itemId, callback } = {}) {
    if (typeof callback !== 'function') return;
    if (itemId) {
      callback({ itemId, amount: this._storage.getAmount(itemId) });
    } else {
      callback({ balances: this._storage.getAllBalances() });
    }
  }

  _onQueryAll({ callback } = {}) {
    if (typeof callback !== 'function') return;
    callback({ balances: this._storage.getAllBalances() });
  }
}

module.exports = { ItemVaultEventAPI };
