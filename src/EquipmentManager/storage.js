/**
 * EquipmentManager Storage — IndexedDB-backed persistent equipment storage.
 *
 * Schema: database "EquipmentManagerDB" v1
 *   Object store "inventory": keyPath: instanceId
 *     value: equipment instance records owned by the player
 *   Object store "equipped": keyPath: slot
 *     value: { slot, instanceId } — which instanceId occupies each slot
 *
 * All mutations go through this layer. The in-memory cache is the
 * authoritative read path; IDB writes are fire-and-forget with a
 * debounced 2s flush for durability.
 *
 * Dirty tracking is per-store ('inventory' | 'equipped') rather than
 * per-record, so flush always rewrites the full store contents for
 * each marked store. This is safe given the small record counts
 * (inventory is unbounded but equipment instances are player-scoped;
 * equipped is capped at 10 slots).
 */

const DB_NAME = 'EquipmentManagerDB';
const DB_VERSION = 1;
const STORE_INVENTORY = 'inventory';
const STORE_EQUIPPED = 'equipped';
const FLUSH_DEBOUNCE_MS = 2_000;

class EquipmentStorage {
  constructor() {
    this._db = null;
    this._inventory = new Map(); // instanceId → instance record
    this._equipped = new Map();  // slot → instanceId
    this._dirty = new Set();     // 'inventory' | 'equipped'
    this._flushTimer = null;
    this._ready = false;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Open the IDB database, create stores on first run, then load all data into
   * the in-memory cache. Must be called before any read/write operations.
   */
  async open() {
    if (this._db) return;

    await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_INVENTORY)) {
          db.createObjectStore(STORE_INVENTORY, { keyPath: 'instanceId' });
        }
        if (!db.objectStoreNames.contains(STORE_EQUIPPED)) {
          db.createObjectStore(STORE_EQUIPPED, { keyPath: 'slot' });
        }
      };

      req.onsuccess = (e) => {
        this._db = e.target.result;
        resolve();
      };

      req.onerror = (e) => {
        console.error('[EquipmentManager] IDB open failed:', e.target.error);
        reject(e.target.error);
      };
    });

    await this.loadAll();
  }

  /**
   * Read both stores into memory. Called once after open(). Safe to call
   * again to re-sync from disk (discards any in-memory dirty state).
   */
  async loadAll() {
    if (!this._db) return;

    try {
      const tx = this._db.transaction([STORE_INVENTORY, STORE_EQUIPPED], 'readonly');

      const [inventoryRecords, equippedRecords] = await Promise.all([
        this._getAllFromStore(tx, STORE_INVENTORY),
        this._getAllFromStore(tx, STORE_EQUIPPED),
      ]);

      this._inventory.clear();
      for (const record of inventoryRecords) {
        this._inventory.set(record.instanceId, record);
      }

      this._equipped.clear();
      for (const record of equippedRecords) {
        this._equipped.set(record.slot, record.instanceId);
      }

      this._ready = true;
    } catch (err) {
      console.error('[EquipmentManager] loadAll failed:', err);
    }
  }

  /** Flush dirty stores and close the IDB connection. */
  async close() {
    this._cancelFlushTimer();
    await this.flush();
    if (this._db) {
      this._db.close();
      this._db = null;
    }
    this._ready = false;
  }

  // ---------------------------------------------------------------------------
  // Read API
  // ---------------------------------------------------------------------------

  /** Returns all inventory instances as an Array. */
  getInventory() {
    return Array.from(this._inventory.values());
  }

  /** Returns equipped slots as a plain object { [slot]: instanceId }. */
  getEquipped() {
    const result = {};
    for (const [slot, instanceId] of this._equipped) {
      result[slot] = instanceId;
    }
    return result;
  }

  /** Returns the instanceId in the given slot, or null if empty. */
  getEquippedInstanceId(slot) {
    return this._equipped.get(slot) ?? null;
  }

  get isReady() {
    return this._ready;
  }

  // ---------------------------------------------------------------------------
  // Write API
  // ---------------------------------------------------------------------------

  /** Add or overwrite an equipment instance in inventory. */
  addToInventory(instance) {
    this._inventory.set(instance.instanceId, instance);
    this._dirty.add(STORE_INVENTORY);
    this._scheduleFlush();
  }

  /** Remove an equipment instance from inventory by instanceId. */
  removeFromInventory(instanceId) {
    if (!this._inventory.has(instanceId)) return;
    this._inventory.delete(instanceId);
    this._dirty.add(STORE_INVENTORY);
    this._scheduleFlush();
  }

  /** Assign an instanceId to a slot. */
  setEquipped(slot, instanceId) {
    this._equipped.set(slot, instanceId);
    this._dirty.add(STORE_EQUIPPED);
    this._scheduleFlush();
  }

  /** Remove whatever is equipped in a slot. */
  clearEquipped(slot) {
    if (!this._equipped.has(slot)) return;
    this._equipped.delete(slot);
    this._dirty.add(STORE_EQUIPPED);
    this._scheduleFlush();
  }

  // ---------------------------------------------------------------------------
  // Flush
  // ---------------------------------------------------------------------------

  /**
   * Write all dirty stores to IDB in a single atomic transaction.
   * Both inventory and equipped are written together so a crash between
   * them cannot leave dangling equipped slots referencing missing instances.
   * Dirty entries are cleared optimistically; re-marked on failure.
   */
  async flush() {
    if (!this._db || this._dirty.size === 0) return;

    const dirtyStores = [...this._dirty];
    this._dirty.clear();

    return new Promise((resolve, reject) => {
      try {
        const tx = this._db.transaction(dirtyStores, 'readwrite');

        for (const storeName of dirtyStores) {
          const store = tx.objectStore(storeName);

          // Clear then re-insert to handle deletes correctly.
          const clearReq = store.clear();

          clearReq.onsuccess = () => {
            const records = this._getRecordsForStore(storeName);
            for (const record of records) {
              const putReq = store.put(record);
              putReq.onerror = (e) => {
                console.error(
                  `[EquipmentManager] put failed for "${storeName}" record:`,
                  record,
                  e.target.error,
                );
                // Abort entire transaction to prevent partial writes after clear
                try { tx.abort(); } catch (_) {}
              };
            }
          };

          clearReq.onerror = (e) => {
            console.error(`[EquipmentManager] clear failed for "${storeName}":`, e.target.error);
          };
        }

        tx.oncomplete = () => resolve(true);

        tx.onerror = (e) => {
          console.error('[EquipmentManager] flush transaction failed:', e.target.error);
          // Re-mark all stores dirty for retry on next flush.
          for (const storeName of dirtyStores) {
            this._dirty.add(storeName);
          }
          reject(tx.error);
        };

        tx.onabort = () => {
          console.error('[EquipmentManager] flush transaction aborted');
          for (const storeName of dirtyStores) {
            this._dirty.add(storeName);
          }
          reject(tx.error || new Error('Transaction aborted'));
        };
      } catch (err) {
        console.error('[EquipmentManager] flush error:', err);
        for (const storeName of dirtyStores) {
          this._dirty.add(storeName);
        }
        reject(err);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _scheduleFlush() {
    this._cancelFlushTimer();
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  _cancelFlushTimer() {
    if (this._flushTimer !== null) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
  }

  /** Build the array of records to write for a given store name. */
  _getRecordsForStore(storeName) {
    if (storeName === STORE_INVENTORY) {
      return Array.from(this._inventory.values());
    }
    if (storeName === STORE_EQUIPPED) {
      const records = [];
      for (const [slot, instanceId] of this._equipped) {
        records.push({ slot, instanceId });
      }
      return records;
    }
    return [];
  }

  /** Promise wrapper around IDBObjectStore.getAll() within an existing tx. */
  _getAllFromStore(tx, storeName) {
    return new Promise((resolve, reject) => {
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }
}

module.exports = { EquipmentStorage };
