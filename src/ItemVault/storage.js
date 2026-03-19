/**
 * ItemVault Storage — IndexedDB-backed persistent item storage.
 *
 * Schema: database "ItemVault", object store "items"
 *   key: itemId (string)
 *   value: { id, amount, lastModified, meta }
 *
 * All mutations go through this layer. The in-memory cache is the
 * authoritative read path; IDB writes are fire-and-forget with
 * periodic flush for durability.
 */

const DB_NAME = 'ItemVault';
const DB_VERSION = 1;
const STORE_NAME = 'items';
const FLUSH_INTERVAL_MS = 10_000; // 10s periodic flush

class ItemVaultStorage {
  constructor() {
    this._db = null;
    this._cache = new Map();       // itemId → { id, amount, lastModified, meta }
    this._dirty = new Set();       // itemIds that need IDB write
    this._flushTimer = null;
    this._ready = false;
  }

  async open() {
    if (this._db) return;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      req.onsuccess = (e) => {
        this._db = e.target.result;
        this._startFlushTimer();
        resolve();
      };

      req.onerror = (e) => {
        console.error('[ItemVault] IDB open failed:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /** Load all items from IDB into memory cache */
  async loadAll() {
    if (!this._db) return;

    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        this._cache.clear();
        for (const record of req.result) {
          this._cache.set(record.id, record);
        }
        this._ready = true;
        resolve(this._cache);
      };

      req.onerror = (e) => {
        console.error('[ItemVault] loadAll failed:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /** Get current amount for an item (0 if not found) */
  getAmount(itemId) {
    return this._cache.get(itemId)?.amount || 0;
  }

  /** Get full record for an item */
  getRecord(itemId) {
    return this._cache.get(itemId) || null;
  }

  /** Get all records as a plain object { itemId: amount } */
  getAllBalances() {
    const balances = {};
    for (const [id, record] of this._cache) {
      balances[id] = record.amount;
    }
    return balances;
  }

  /**
   * Add amount to an item. Creates record if it doesn't exist.
   * Returns the new total.
   */
  add(itemId, amount, meta = {}) {
    if (amount <= 0) return this.getAmount(itemId);

    const existing = this._cache.get(itemId);
    if (existing) {
      existing.amount += amount;
      existing.lastModified = Date.now();
      if (meta && Object.keys(meta).length) {
        existing.meta = { ...existing.meta, ...meta };
      }
    } else {
      this._cache.set(itemId, {
        id: itemId,
        amount,
        lastModified: Date.now(),
        meta,
      });
    }

    this._dirty.add(itemId);
    return this.getAmount(itemId);
  }

  /**
   * Spend/consume amount from an item.
   * Returns { success, newAmount, shortfall }.
   * If insufficient, nothing is deducted.
   */
  spend(itemId, amount) {
    if (amount <= 0) return { success: true, newAmount: this.getAmount(itemId), shortfall: 0 };

    const current = this.getAmount(itemId);
    if (current < amount) {
      return { success: false, newAmount: current, shortfall: amount - current };
    }

    const record = this._cache.get(itemId);
    record.amount -= amount;
    record.lastModified = Date.now();
    this._dirty.add(itemId);

    return { success: true, newAmount: record.amount, shortfall: 0 };
  }

  /**
   * Set exact amount (for migrations or corrections).
   */
  set(itemId, amount, meta = {}) {
    const record = this._cache.get(itemId);
    if (record) {
      record.amount = Math.max(0, amount);
      record.lastModified = Date.now();
      if (meta && Object.keys(meta).length) {
        record.meta = { ...record.meta, ...meta };
      }
    } else {
      this._cache.set(itemId, {
        id: itemId,
        amount: Math.max(0, amount),
        lastModified: Date.now(),
        meta,
      });
    }
    this._dirty.add(itemId);
    return this.getAmount(itemId);
  }

  /** Flush dirty records to IDB */
  async flush() {
    if (!this._db || this._dirty.size === 0) return;

    const toWrite = [...this._dirty];
    this._dirty.clear();

    return new Promise((resolve) => {
      try {
        const tx = this._db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        for (const itemId of toWrite) {
          const record = this._cache.get(itemId);
          if (record) {
            store.put(record);
          }
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => {
          // Re-mark as dirty for retry
          for (const id of toWrite) this._dirty.add(id);
          resolve(false);
        };
      } catch (err) {
        console.error('[ItemVault] flush error:', err);
        for (const id of toWrite) this._dirty.add(id);
        resolve(false);
      }
    });
  }

  _startFlushTimer() {
    if (this._flushTimer) return;
    this._flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  async close() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    await this.flush();
    if (this._db) {
      this._db.close();
      this._db = null;
    }
    this._ready = false;
  }

  get isReady() {
    return this._ready;
  }
}

module.exports = { ItemVaultStorage };
