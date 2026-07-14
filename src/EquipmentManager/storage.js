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
 * Dirty tracking is PER-RECORD (2026-07-13). It was previously per-store,
 * so every mutation cleared the whole object store and re-put every record
 * — O(inventory) IDB work per 2s flush, on a Map that only ever grows
 * (nothing calls removeFromInventory; there is no salvage/cap yet). A
 * single drop roll therefore rewrote the entire inventory. Flush now
 * writes only the records that actually changed and deletes only the keys
 * actually removed, so cost is O(delta) regardless of inventory size.
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
    this._dirty = new Set();     // 'inventory' | 'equipped' — which stores need a tx
    // Per-record deltas (2026-07-13). Keys touched since the last flush:
    //   _dirtyKeys[store]   — keys to put (value read from the live Map at flush)
    //   _deletedKeys[store] — keys to delete
    // A key is only ever in one of the two: marking it in either side removes
    // it from the other, so re-adding a just-deleted key resolves correctly.
    this._dirtyKeys = {
      [STORE_INVENTORY]: new Set(),
      [STORE_EQUIPPED]: new Set(),
    };
    this._deletedKeys = {
      [STORE_INVENTORY]: new Set(),
      [STORE_EQUIPPED]: new Set(),
    };
    this._flushTimer = null;
    this._ready = false;
    this._version = 0; // incremented on every mutation; used by popup dirty-check
  }

  /** Monotonically increasing counter — changes whenever inventory or equipped changes. */
  get version() {
    return this._version;
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

  /**
   * O(1) lookup of a single inventory instance (2026-07-13). Callers used to
   * rebuild a full instanceId→item Map (or run a linear .find()) for a single
   * lookup — up to 3-4 times per equip click — even though the authoritative
   * Map already lives here.
   */
  getInstance(instanceId) {
    return this._inventory.get(instanceId) ?? null;
  }

  get isReady() {
    return this._ready;
  }

  // ---------------------------------------------------------------------------
  // Write API
  // ---------------------------------------------------------------------------

  /** Mark a key for write (put) on next flush. */
  _markPut(storeName, key) {
    this._deletedKeys[storeName].delete(key);
    this._dirtyKeys[storeName].add(key);
    this._dirty.add(storeName);
  }

  /** Mark a key for deletion on next flush. */
  _markDelete(storeName, key) {
    this._dirtyKeys[storeName].delete(key);
    this._deletedKeys[storeName].add(key);
    this._dirty.add(storeName);
  }

  /** Add or overwrite an equipment instance in inventory. */
  addToInventory(instance) {
    this._inventory.set(instance.instanceId, instance);
    this._markPut(STORE_INVENTORY, instance.instanceId);
    this._version++;
    this._scheduleFlush();
  }

  /** Remove an equipment instance from inventory by instanceId. */
  removeFromInventory(instanceId) {
    if (!this._inventory.has(instanceId)) return;
    this._inventory.delete(instanceId);
    this._markDelete(STORE_INVENTORY, instanceId);
    this._version++;
    this._scheduleFlush();
  }

  /** Assign an instanceId to a slot. */
  setEquipped(slot, instanceId) {
    this._equipped.set(slot, instanceId);
    this._markPut(STORE_EQUIPPED, slot);
    this._version++;
    this._scheduleFlush();
  }

  /** Remove whatever is equipped in a slot. */
  clearEquipped(slot) {
    if (!this._equipped.has(slot)) return;
    this._equipped.delete(slot);
    this._markDelete(STORE_EQUIPPED, slot);
    this._version++;
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

    // Snapshot the deltas and reset them optimistically. On failure the
    // snapshot is merged BACK into the live sets (below) so nothing is lost —
    // and any key touched during the in-flight tx keeps its newer marking.
    const putSnapshot = {};
    const delSnapshot = {};
    for (const storeName of dirtyStores) {
      putSnapshot[storeName] = [...this._dirtyKeys[storeName]];
      delSnapshot[storeName] = [...this._deletedKeys[storeName]];
      this._dirtyKeys[storeName].clear();
      this._deletedKeys[storeName].clear();
    }

    const requeue = () => {
      for (const storeName of dirtyStores) {
        for (const k of putSnapshot[storeName]) {
          // Don't resurrect a key that has since been deleted.
          if (!this._deletedKeys[storeName].has(k)) this._dirtyKeys[storeName].add(k);
        }
        for (const k of delSnapshot[storeName]) {
          if (!this._dirtyKeys[storeName].has(k)) this._deletedKeys[storeName].add(k);
        }
        this._dirty.add(storeName);
      }
    };

    return new Promise((resolve, reject) => {
      try {
        const tx = this._db.transaction(dirtyStores, 'readwrite');

        for (const storeName of dirtyStores) {
          const store = tx.objectStore(storeName);
          const sourceMap = storeName === STORE_INVENTORY ? this._inventory : this._equipped;

          // Deletes first, then puts — an id that was deleted and re-added in
          // the same window is marked put-only, so ordering is safe either way.
          for (const key of delSnapshot[storeName]) {
            const delReq = store.delete(key);
            delReq.onerror = (e) => {
              console.error(`[EquipmentManager] delete failed for "${storeName}" key:`, key, e.target.error);
              try { tx.abort(); } catch (_) {}
            };
          }

          for (const key of putSnapshot[storeName]) {
            // Read the CURRENT value at flush time (the Map is authoritative).
            // A key marked dirty but since removed from the Map is skipped —
            // its delete marking will carry it on a later flush.
            const record = storeName === STORE_INVENTORY
              ? sourceMap.get(key)
              : (sourceMap.has(key) ? { slot: key, instanceId: sourceMap.get(key) } : undefined);
            if (record === undefined) continue;
            const putReq = store.put(record);
            putReq.onerror = (e) => {
              console.error(
                `[EquipmentManager] put failed for "${storeName}" record:`,
                record,
                e.target.error,
              );
              // Abort the whole tx — partial writes would desync IDB from memory.
              try { tx.abort(); } catch (_) {}
            };
          }
        }

        tx.oncomplete = () => resolve(true);

        tx.onerror = (e) => {
          console.error('[EquipmentManager] flush transaction failed:', e.target.error);
          requeue();
          reject(tx.error);
        };

        tx.onabort = () => {
          console.error('[EquipmentManager] flush transaction aborted');
          requeue();
          reject(tx.error || new Error('Transaction aborted'));
        };
      } catch (err) {
        console.error('[EquipmentManager] flush error:', err);
        requeue();
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
