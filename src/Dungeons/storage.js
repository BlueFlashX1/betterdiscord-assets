const { openIndexedDbDatabase } = require('./bootstrap-runtime');

// ==== STORAGE MANAGER - IndexedDB Management ====
/**
 * DungeonStorageManager - IndexedDB storage manager for Dungeons plugin
 * Handles persistent storage of dungeon data across sessions
 */
class DungeonStorageManager {
  constructor(userId) {
    this.userId = userId || 'default';
    this.dbName = `DungeonsDB_${this.userId}`;
    this.dbVersion = 3; // Incremented for performance optimizations
    this.storeName = 'dungeons';
    this.archiveStoreName = 'dungeons_archive'; // Hot/cold data separation
    this.db = null;
  }

  async init() {
    if (this.db !== null) {
      return this.db;
    }

    this.db = await openIndexedDbDatabase({
      dbName: this.dbName,
      dbVersion: this.dbVersion,
      onUpgrade: (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // Create object store if doesn't exist (v1)
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
          objectStore.createIndex('channelKey', 'channelKey', { unique: true });
          objectStore.createIndex('guildId', 'guildId', { unique: false });
          objectStore.createIndex('channelId', 'channelId', { unique: false });
          objectStore.createIndex('rank', 'rank', { unique: false });
          objectStore.createIndex('startTime', 'startTime', { unique: false });
        }

        // Add new indices for v2 (new features)
        if (oldVersion < 2) {
          const transaction = event.target.transaction;
          const objectStore = transaction.objectStore(this.storeName);

          // Add new indices for enhanced features
          if (!objectStore.indexNames.contains('type')) {
            objectStore.createIndex('type', 'type', { unique: false });
          }
          if (!objectStore.indexNames.contains('completed')) {
            objectStore.createIndex('completed', 'completed', { unique: false });
          }
          if (!objectStore.indexNames.contains('failed')) {
            objectStore.createIndex('failed', 'failed', { unique: false });
          }
          if (!objectStore.indexNames.contains('userParticipating')) {
            objectStore.createIndex('userParticipating', 'userParticipating', { unique: false });
          }

          // V2 upgrade complete
        }

        // V3: Performance optimizations
        if (oldVersion < 3) {
          const transaction = event.target.transaction;

          // Create archive store for hot/cold data separation
          if (!db.objectStoreNames.contains(this.archiveStoreName)) {
            const archiveStore = db.createObjectStore(this.archiveStoreName, { keyPath: 'id' });
            archiveStore.createIndex('channelKey', 'channelKey', { unique: true });
            archiveStore.createIndex('rank', 'rank', { unique: false });
            archiveStore.createIndex('completedAt', 'completedAt', { unique: false });
          }

          const objectStore = transaction.objectStore(this.storeName);

          // Add compound indexes for common filtered queries
          if (!objectStore.indexNames.contains('status_rank')) {
            objectStore.createIndex('status_rank', ['completed', 'rank'], { unique: false });
          }
          if (!objectStore.indexNames.contains('active_rank')) {
            objectStore.createIndex('active_rank', ['failed', 'completed', 'rank'], {
              unique: false,
            });
          }
          if (!objectStore.indexNames.contains('type_rank')) {
            objectStore.createIndex('type_rank', ['type', 'rank'], { unique: false });
          }

          // V3 upgrade complete
        }
      },
      onBlocked: () => {
        // Database upgrade blocked by other tabs holding an old DB version.
        // Surface a toast so the user actually knows to close their other
        // Discord tabs — previously this was a silent no-op and the
        // dungeon DB never upgraded, breaking all persistence on the
        // affected tab.
        try {
          BdApi.UI?.showToast?.(
            'Dungeons: close other Discord tabs/windows to upgrade dungeon data.',
            { type: 'warning', timeout: 8000 }
          );
        } catch (_) {}
      },
    });

    return this.db;
  }

  async _withStore(mode, operation) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], mode);
      const store = transaction.objectStore(this.storeName);
      operation(store, transaction, resolve, reject);
    });
  }

  async _getAllFromStore() {
    return this._withStore('readonly', (store, _tx, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveDungeon(dungeon) {
    if (!this.db) await this.init();

    // CRITICAL: Sanitize dungeon object before saving to prevent DataCloneError
    // Remove any Promise values that can't be serialized to IndexedDB
    const sanitizedDungeon = this.sanitizeDungeonForStorage(dungeon);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(sanitizedDungeon);
      request.onsuccess = () => resolve({ success: true });
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Sanitize dungeon object for IndexedDB storage.
   * Removes Promises and other non-serializable values; ensures object is safe for IndexedDB storage.
   */
  sanitizeDungeonForStorage(dungeon) {
    const MAX_ACTIVE_MOBS_TO_STORE = 250;

    // Pre-prune hot/huge fields before deep cloning.
    // This prevents CPU spikes / freezes from stringifying very large runtime state.
    const prunedDungeon = (() => {
      if (!dungeon || typeof dungeon !== 'object') return dungeon;

      const next = { ...dungeon };

      // Active mobs can be extremely large; store only a bounded slice.
      if (next.mobs && typeof next.mobs === 'object') {
        next.mobs = { ...next.mobs };
        if (
          Array.isArray(next.mobs.activeMobs) &&
          next.mobs.activeMobs.length > MAX_ACTIVE_MOBS_TO_STORE
        ) {
          next.mobs.activeMobs = next.mobs.activeMobs.slice(-MAX_ACTIVE_MOBS_TO_STORE);
        }
      }

      // Shadow allocations may contain full shadow objects (very large); recompute on restore.
      delete next.shadowAllocation;

      // Runtime-only flags — must not persist (would block completeDungeon on restore)
      delete next._completing;
      // Runtime-only pooled Map caches — not useful across sessions, cause TypeError on restore
      delete next._pooledMobDamageMap;

      // Cap corpse pile to last 500 entries for IDB storage (each ~100 bytes ≈ 50KB max).
      // Later mobs tend to be higher rank, so keep the tail.
      if (Array.isArray(next.corpsePile) && next.corpsePile.length > 500) {
        next.corpsePile = next.corpsePile.slice(-500);
      }

      // Convert Map fields to plain objects for JSON serialization
      if (next.shadowHP instanceof Map) {
        const shadowHPObj = {};
        next.shadowHP.forEach((value, key) => { shadowHPObj[key] = value; });
        next.shadowHP = shadowHPObj;
      }
      if (next.shadowCombatData instanceof Map) {
        const combatObj = {};
        next.shadowCombatData.forEach((value, key) => { combatObj[key] = value; });
        next.shadowCombatData = combatObj;
      }

      return next;
    })();

    // Deep clone to avoid modifying original
    const sanitized = JSON.parse(
      JSON.stringify(prunedDungeon, (key, value) => {
        // Skip Promise values
        if (value instanceof Promise) {
          return undefined;
        }
        // Skip function values
        if (typeof value === 'function') {
          return undefined;
        }
        // Convert any remaining Maps to objects
        if (value instanceof Map) {
          const obj = {};
          value.forEach((v, k) => { obj[k] = v; });
          return obj;
        }
        return value;
      })
    );

    return sanitized;
  }

  async getAllDungeons() {
    return this._getAllFromStore();
  }

  async deleteDungeon(channelKey) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('channelKey');
      const request = index.getKey(channelKey);
      request.onsuccess = () => {
        const key = request.result;
        if (key) {
          const deleteRequest = store.delete(key);
          deleteRequest.onsuccess = () => resolve({ success: true });
          deleteRequest.onerror = () => reject(deleteRequest.error);
        } else {
          resolve({ success: false, reason: 'Not found' });
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearCompletedDungeons() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      // FIX (2026-07-30): the previous index-scoped scans used
      // IDBKeyRange.only(true) — booleans are NOT valid IDB keys, so this
      // threw synchronously on every 5-min GC run since dbVersion 2 (the
      // recurring 'Failed to cleanup completed dungeons' error), and the
      // completed/failed indices were permanently EMPTY anyway (IDB never
      // indexes boolean values). Plain cursor + JS filter is correct AND
      // cheap: normal completion deletes records directly within ~30s, so
      // steady-state population ≈ concurrently-active dungeons only. The
      // dead indices (completed/failed/status_rank/active_rank) are flagged
      // for removal at the next dbVersion bump.
      let deleted = 0;
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const d = cursor.value;
        if (d && (d.completed === true || d.failed === true)) {
          const deleteRequest = cursor.delete();
          // R8: a bad record must not abort the whole cleanup transaction.
          deleteRequest.onerror = (delEvent) => {
            delEvent.preventDefault();
            delEvent.stopPropagation();
          };
          deleted++;
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => resolve({ deleted });
      transaction.onerror = () => reject(transaction.error);
    });
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }

}

/**
 * MobBossStorageManager - IndexedDB storage manager for Mobs and Bosses
 * Handles persistent storage of mob and boss data for caching and migration
 */
// 2026-07-30: mob persistence REMOVED (user decision, ponytail follow-up).
// The mobs/mobs_dead stores were write-only at runtime (nothing ever read
// them back), and the extracted-index GC had never worked (boolean keys are
// invalid in IDB). This manager now persists BOSSES only. Existing installs
// keep orphaned empty mobs stores (harmless); physically dropping them would
// need a dbVersion bump + deleteObjectStore — deliberately not done.
class MobBossStorageManager {
  constructor(userId) {
    this.userId = userId || 'default';
    this.dbName = `MobBossDB_${this.userId}`;
    this.dbVersion = 2; // Incremented for performance optimizations
    this.bossStoreName = 'bosses';
    this.db = null;
    this._lastBossSaveFraction = new Map(); // Throttle boss saves on HP delta
    this._logHandlers = {
      debug: null,
      warn: null,
      error: null,
    };
    this._warnOnceKeys = new Set();
  }

  setLogHandlers(handlers = {}) {
    if (!handlers || typeof handlers !== 'object') return;
    if (typeof handlers.debug === 'function') this._logHandlers.debug = handlers.debug;
    if (typeof handlers.warn === 'function') this._logHandlers.warn = handlers.warn;
    if (typeof handlers.error === 'function') this._logHandlers.error = handlers.error;
  }

  _logDebug(message, context = null) {
    const handler = this._logHandlers.debug;
    if (typeof handler === 'function') {
      handler(message, context);
    }
  }

  _logWarn(message, context = null, onceKey = null) {
    if (onceKey && this._warnOnceKeys.has(onceKey)) return;
    onceKey && this._warnOnceKeys.add(onceKey);

    const handler = this._logHandlers.warn;
    if (typeof handler === 'function') {
      handler(message, context);
      return;
    }
    console.warn(`[MobBossStorageManager] ${message}`, context || '');
  }

  _logError(message, context = null, error = null) {
    const handler = this._logHandlers.error;
    if (typeof handler === 'function') {
      handler(message, context, error);
      return;
    }
    console.error(`[MobBossStorageManager] ${message}`, context || '', error || '');
  }

  async init() {
    if (this.db) return this.db;

    this.db = await openIndexedDbDatabase({
      dbName: this.dbName,
      dbVersion: this.dbVersion,
      onUpgrade: (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // Create bosses object store (V1)
        if (!db.objectStoreNames.contains(this.bossStoreName)) {
          const bossStore = db.createObjectStore(this.bossStoreName, { keyPath: 'id' });
          bossStore.createIndex('dungeonKey', 'dungeonKey', { unique: true });
          bossStore.createIndex('rank', 'rank', { unique: false });
          bossStore.createIndex('spawnedAt', 'spawnedAt', { unique: false });
        }

      },
      onBlocked: () => {
        // See DungeonStorageManager.init above for rationale.
        try {
          BdApi.UI?.showToast?.(
            'Dungeons: close other Discord tabs/windows to upgrade mob/boss data.',
            { type: 'warning', timeout: 8000 }
          );
        } catch (_) {}
      },
    });

    return this.db;
  }

  async _withSingleStore(storeName, mode, operation) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);
      operation(store, transaction, resolve, reject);
    });
  }

  /**
   * Save boss to database
   */
  async saveBoss(boss, dungeonKey) {
    const bossData = {
      ...boss,
      id: boss.id || `boss_${dungeonKey}`,
      dungeonKey,
      cachedAt: Date.now(),
    };

    // Throttle boss saves unless significant HP change
    const fraction = bossData.maxHp ? bossData.hp / bossData.maxHp : 1;
    const prevFraction = this._lastBossSaveFraction.get(bossData.id);
    if (prevFraction !== undefined && Math.abs(prevFraction - fraction) < 0.1 && fraction < 1) {
      return { success: true, skipped: true, reason: 'unchanged_threshold' };
    }

    return this._withSingleStore(
      this.bossStoreName,
      'readwrite',
      (store, _tx, resolve, reject) => {
      const request = store.put(bossData);
      request.onsuccess = () => {
        this._lastBossSaveFraction.set(bossData.id, fraction);
        resolve({ success: true, id: bossData.id });
      };
      request.onerror = () => reject(request.error);
      }
    );
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }

}

module.exports = {
  DungeonStorageManager,
  MobBossStorageManager,
};
