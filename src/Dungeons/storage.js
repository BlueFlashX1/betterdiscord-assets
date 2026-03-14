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
        // Database upgrade blocked by other tabs — user needs to close other Discord tabs
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
      next.shadowAllocation = undefined;

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
      const request = store.openCursor();
      let deleted = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const dungeon = cursor.value;
          if (dungeon.completed || dungeon.failed) {
            cursor.delete();
            deleted++;
          }
          cursor.continue();
        } else {
          resolve({ deleted });
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

}

/**
 * MobBossStorageManager - IndexedDB storage manager for Mobs and Bosses
 * Handles persistent storage of mob and boss data for caching and migration
 */
class MobBossStorageManager {
  constructor(userId) {
    this.userId = userId || 'default';
    this.dbName = `MobBossDB_${this.userId}`;
    this.dbVersion = 2; // Incremented for performance optimizations
    this.mobStoreName = 'mobs';
    this.bossStoreName = 'bosses';
    this.deadMobsStoreName = 'mobs_dead'; // Hot/cold separation
    this.db = null;
    this._pendingMobs = new Map();
    this._pendingTimers = new Map();
    this._flushIntervalMs = 5000; // Debounce writes to reduce IndexedDB churn
    this._flushThreshold = 300; // Flush immediately when large batches accumulate
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

        // Create mobs object store (V1)
        if (!db.objectStoreNames.contains(this.mobStoreName)) {
          const mobStore = db.createObjectStore(this.mobStoreName, { keyPath: 'id' });
          mobStore.createIndex('dungeonKey', 'dungeonKey', { unique: false });
          mobStore.createIndex('extracted', 'extracted', { unique: false });
          mobStore.createIndex('rank', 'rank', { unique: false });
          mobStore.createIndex('beastType', 'beastType', { unique: false });
          mobStore.createIndex('spawnedAt', 'spawnedAt', { unique: false });
        }

        // Create bosses object store (V1)
        if (!db.objectStoreNames.contains(this.bossStoreName)) {
          const bossStore = db.createObjectStore(this.bossStoreName, { keyPath: 'id' });
          bossStore.createIndex('dungeonKey', 'dungeonKey', { unique: true });
          bossStore.createIndex('rank', 'rank', { unique: false });
          bossStore.createIndex('spawnedAt', 'spawnedAt', { unique: false });
        }

        // V2: Performance optimizations
        if (oldVersion < 2) {
          const transaction = event.target.transaction;

          // Create dead mobs store for hot/cold data separation
          if (!db.objectStoreNames.contains(this.deadMobsStoreName)) {
            const deadMobStore = db.createObjectStore(this.deadMobsStoreName, { keyPath: 'id' });
            deadMobStore.createIndex('dungeonKey', 'dungeonKey', { unique: false });
            deadMobStore.createIndex('killedAt', 'killedAt', { unique: false });
            deadMobStore.createIndex('extractedAt', 'extractedAt', { unique: false });
          }

          // Add compound indexes to mobs store
          const mobStore = transaction.objectStore(this.mobStoreName);
          if (!mobStore.indexNames.contains('dungeonKey_extracted')) {
            mobStore.createIndex('dungeonKey_extracted', ['dungeonKey', 'extracted'], {
              unique: false,
            });
          }
          if (!mobStore.indexNames.contains('dungeonKey_rank')) {
            mobStore.createIndex('dungeonKey_rank', ['dungeonKey', 'rank'], { unique: false });
          }
          if (!mobStore.indexNames.contains('extracted_rank')) {
            mobStore.createIndex('extracted_rank', ['extracted', 'rank'], { unique: false });
          }

          // V2 upgrade complete
        }
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
   * Batch save mobs (for performance)
   */
  async batchSaveMobs(mobs, dungeonKey) {
    if (!this.db) await this.init();
    if (!mobs || mobs.length === 0) return { saved: 0 };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.mobStoreName], 'readwrite');
      const store = transaction.objectStore(this.mobStoreName);
      let saved = 0;
      let errors = 0;

      mobs.forEach((mob) => {
        const mobData = {
          ...mob,
          dungeonKey,
          cachedAt: Date.now(),
          extracted: false,
        };
        const request = store.put(mobData);
        request.onsuccess = () => saved++;
        request.onerror = () => errors++;
      });

      transaction.oncomplete = () => resolve({ saved, errors });
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Queue mobs for throttled batch persistence.
   * Flushes immediately if threshold exceeded, otherwise debounced.
   */
  async enqueueMobs(mobs, dungeonKey) {
    if (!mobs || mobs.length === 0) return { queued: 0, flushed: false };

    const current = this._pendingMobs.get(dungeonKey) || [];
    current.push(...mobs);
    this._pendingMobs.set(dungeonKey, current);

    // Flush immediately if threshold exceeded
    if (current.length >= this._flushThreshold) {
      const result = await this.flushMobs(dungeonKey, 'threshold');
      return { queued: current.length, flushed: true, ...result };
    }

    // Debounce flush
    if (!this._pendingTimers.has(dungeonKey)) {
      const timer = setTimeout(() => {
        this.flushMobs(dungeonKey, 'interval').catch((error) => {
          this._logWarn(
            'Failed to flush mobs (interval)',
            { dungeonKey, error: error?.message || String(error) },
            `flush-interval-failed:${dungeonKey}`
          );
        });
      }, this._flushIntervalMs);
      this._pendingTimers.set(dungeonKey, timer);
    }

    return { queued: mobs.length, flushed: false };
  }

  /**
   * Flush queued mobs for a specific dungeon key.
   */
  async flushMobs(dungeonKey, reason = 'manual') {
    const pending = this._pendingMobs.get(dungeonKey);
    if (!pending || pending.length === 0) return { saved: 0, errors: 0 };

    // Clear debounce timer if present
    if (this._pendingTimers.has(dungeonKey)) {
      clearTimeout(this._pendingTimers.get(dungeonKey));
      this._pendingTimers.delete(dungeonKey);
    }

    // Swap out pending array before writing
    this._pendingMobs.set(dungeonKey, []);
    try {
      const result = await this.batchSaveMobs(pending, dungeonKey);
      if (result.errors > 0) {
        this._logDebug('Flush completed with write errors', {
          dungeonKey,
          saved: result.saved,
          errors: result.errors,
          reason,
        });
      }
      return result;
    } catch (error) {
      this._logError(
        'Failed to flush mobs',
        { dungeonKey, reason },
        error
      );
      return { saved: 0, errors: pending.length };
    }
  }

  /**
   * Flush all pending mobs for all dungeons (e.g., on plugin stop).
   */
  async flushAll(reason = 'stop') {
    const keys = Array.from(this._pendingMobs.keys());
    for (const key of keys) {
      await this.flushMobs(key, reason);
    }
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

  async _deleteMobCursorMatches(openCursor, shouldDelete) {
    return this._withSingleStore(this.mobStoreName, 'readwrite', (store, _tx, resolve, reject) => {
      const request = openCursor(store);
      let deleted = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve({ deleted });
          return;
        }

        if (shouldDelete(cursor.value)) {
          cursor.delete();
          deleted++;
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clean up old extracted mobs (older than 24 hours)
   */
  async cleanupOldExtractedMobs() {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    return this._deleteMobCursorMatches(
      (store) => store.openCursor(),
      (mob) => mob.extracted && mob.extractedAt && mob.extractedAt < cutoffTime
    );
  }

  /**
   * Delete mobs by dungeon key (cleanup when dungeon completes)
   */
  async deleteMobsByDungeon(dungeonKey) {
    return this._deleteMobCursorMatches(
      (store) => store.index('dungeonKey').openCursor(IDBKeyRange.only(dungeonKey)),
      () => true
    );
  }

}

module.exports = {
  DungeonStorageManager,
  MobBossStorageManager,
};
