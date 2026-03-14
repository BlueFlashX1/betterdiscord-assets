/**
 * ShadowArmy — ShadowStorageManager class.
 * IndexedDB storage manager for shadow army data.
 * Self-contained: own constructor, CRUD, cache, migration, aggregation.
 * Instantiated in start(), NOT mixed onto prototype.
 *
 * External wiring (set by parent plugin after construction):
 *   - this.decompressShadow      (from compression.js)
 *   - this.decompressShadowUltra (from compression.js)
 *   - this.calculateShadowPower  (from combat-stats.js)
 *   - this.getShadowEffectiveStats (from combat-stats.js)
 */

const {
  normalizeShadowPersonalityValue,
  deriveShadowPersonalityFromRole,
} = require('./constants');

class ShadowStorageManager {
  // ============================================================================
  // CONSTRUCTOR & CONFIGURATION
  // ============================================================================

  /**
   * Initialize ShadowStorageManager with user ID
   * @param {string} userId - Discord user ID for database naming
   * @param {Function} debugLogFn - Debug logging function from parent plugin
   * @param {Function} debugErrorFn - Error logging function from parent plugin
   */
  constructor(userId, debugLogFn = null, debugErrorFn = null) {
    this.userId = userId || 'default';
    this.dbName = `ShadowArmyDB_${this.userId}`;
    this.dbVersion = 3; // v3 adds personalityKey normalization index
    this.storeName = 'shadows';
    this.db = null;

    this.debugLog = debugLogFn || (() => {});
    this.debugError =
      debugErrorFn ||
      ((tag, msg, err) => {
        console.error(`[ShadowStorageManager:${tag}]`, msg, err);
      });

    // Memory cache (LRU)
    this.recentCache = new Map();
    this.cacheLimit = 100;

    // Buff cache (for synchronous access by SoloLevelingStats)
    this.cachedBuffs = null;
    this.cachedBuffsTime = null;

    // Migration flags — load persisted values from stable storage
    try {
      const persistedMigration = BdApi.Data.load('ShadowArmy', 'migrationCompleted');
      this.migrationCompleted = persistedMigration === true;
      this.debugLog('STORAGE', 'Migration status loaded', { completed: this.migrationCompleted });
    } catch (error) {
      this.debugError('STORAGE', 'Failed to load migration flag from BdApi.Data', error);
      this.migrationCompleted = false;
    }

    this.personalityMigrationFlagKey = `personalityKeyMigrationCompleted_${this.userId}`;
    try {
      this.personalityKeyMigrationCompleted =
        BdApi.Data.load('ShadowArmy', this.personalityMigrationFlagKey) === true;
    } catch (error) {
      this.debugError('STORAGE', 'Failed to load personality migration flag', error);
      this.personalityKeyMigrationCompleted = false;
    }
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  getCacheKey(shadow) {
    if (!shadow) return null;
    return shadow.id || shadow.i || null;
  }

  normalizePersonalityValue(value) {
    return normalizeShadowPersonalityValue(value);
  }

  derivePersonalityKeyFromRole(role) {
    return deriveShadowPersonalityFromRole(role);
  }

  getNormalizedPersonalityKey(shadow) {
    if (!shadow || typeof shadow !== 'object') return '';

    const explicitKey = this.normalizePersonalityValue(shadow.personalityKey || shadow.pk);
    if (explicitKey) return explicitKey;

    const explicitPersonality = this.normalizePersonalityValue(shadow.personality);
    if (explicitPersonality) return explicitPersonality;

    const role = shadow.role || shadow.ro || '';
    return this.derivePersonalityKeyFromRole(role);
  }

  ensurePersonalityKey(shadow) {
    if (!shadow || typeof shadow !== 'object') return { shadow, changed: false };

    const normalizedKey = this.getNormalizedPersonalityKey(shadow);
    const currentKey = this.normalizePersonalityValue(shadow.personalityKey);
    const currentPersonality = this.normalizePersonalityValue(shadow.personality);
    let changed = false;

    if (currentKey !== normalizedKey) {
      shadow.personalityKey = normalizedKey;
      changed = true;
    } else if (!Object.prototype.hasOwnProperty.call(shadow, 'personalityKey')) {
      shadow.personalityKey = normalizedKey;
      changed = true;
    }

    if (!currentPersonality && normalizedKey) {
      shadow.personality = normalizedKey;
      changed = true;
    } else if (currentPersonality && shadow.personality !== currentPersonality) {
      shadow.personality = currentPersonality;
      changed = true;
    }

    if ((shadow._c === 1 || shadow._c === 2) && this.normalizePersonalityValue(shadow.pk) !== normalizedKey) {
      shadow.pk = normalizedKey;
      changed = true;
    }

    return { shadow, changed };
  }

  invalidateCache(shadow) {
    if (!shadow) return;
    const id = shadow.id || shadow.i;
    if (id) this.recentCache.delete(id);
    if (shadow.id && shadow.i && shadow.id !== shadow.i) {
      this.recentCache.delete(shadow.i);
    }
  }

  updateCache(shadow, oldShadow = null) {
    const shadowId = this.getCacheKey(shadow);
    if (!shadow || !shadowId) return;

    if (oldShadow) {
      this.invalidateCache(oldShadow);
    }

    this.recentCache.delete(shadowId);
    this.recentCache.set(shadowId, shadow);

    if (this.recentCache.size > this.cacheLimit) {
      const firstKey = this.recentCache.keys().next().value;
      this.recentCache.delete(firstKey);
    }
  }

  clearCache() {
    this.recentCache.clear();
    this.debugLog('CACHE', 'Recent cache cleared');
  }

  // ============================================================================
  // SHADOW DATA HELPERS
  // ============================================================================

  /**
   * Get shadow in correct format (decompress if needed).
   * decompressShadow/decompressShadowUltra are wired up externally.
   */
  getShadowData(shadow) {
    if (!shadow) return null;

    const decompressors = {
      1: this.decompressShadow,
      2: this.decompressShadowUltra,
    };
    const decompressor = decompressors[shadow._c];

    return typeof decompressor === 'function' ? decompressor.call(this, shadow) : shadow;
  }

  // ============================================================================
  // DATABASE INITIALIZATION
  // ============================================================================

  async init() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        const error = new Error('IndexedDB not supported');
        this.debugError('INIT', 'IndexedDB not supported, falling back to localStorage', error);
        reject(error);
        return;
      }

      this.debugLog('INIT', 'Opening IndexedDB', { dbName: this.dbName, version: this.dbVersion });

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        this.debugError('INIT', 'Failed to open database', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.debugLog('INIT', 'Database opened successfully', { dbName: this.dbName });
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        this.debugLog('INIT', 'Database upgrade needed', { oldVersion, newVersion: this.dbVersion });

        // Create object store if it doesn't exist (v1)
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
          objectStore.createIndex('rank', 'rank', { unique: false });
          objectStore.createIndex('role', 'role', { unique: false });
          objectStore.createIndex('level', 'level', { unique: false });
          objectStore.createIndex('strength', 'strength', { unique: false });
          objectStore.createIndex('extractedAt', 'extractedAt', { unique: false });
          objectStore.createIndex('rank_role', ['rank', 'role'], { unique: false });
          objectStore.createIndex('personality', 'personality', { unique: false });
          objectStore.createIndex('personalityKey', 'personalityKey', { unique: false });
          this.debugLog('INIT', 'Created object store and indexes', { storeName: this.storeName });
        }

        // v2: natural growth system indexes
        if (oldVersion < 2) {
          const transaction = event.target.transaction;
          const objectStore = transaction.objectStore(this.storeName);
          if (!objectStore.indexNames.contains('lastNaturalGrowth')) {
            objectStore.createIndex('lastNaturalGrowth', 'lastNaturalGrowth', { unique: false });
          }
          if (!objectStore.indexNames.contains('totalCombatTime')) {
            objectStore.createIndex('totalCombatTime', 'totalCombatTime', { unique: false });
          }
          if (!objectStore.indexNames.contains('personality')) {
            objectStore.createIndex('personality', 'personality', { unique: false });
          }
          this.debugLog('INIT', 'Added v2 indexes for natural growth', { oldVersion });
        }

        // v3: personalityKey normalization index
        if (oldVersion < 3) {
          const transaction = event.target.transaction;
          const objectStore = transaction.objectStore(this.storeName);
          if (!objectStore.indexNames.contains('personalityKey')) {
            objectStore.createIndex('personalityKey', 'personalityKey', { unique: false });
          }
          this.debugLog('INIT', 'Added v3 index for personality key normalization', { oldVersion });
        }
      };
    });
  }

  /**
   * Execute a function within an IndexedDB transaction.
   * Eliminates boilerplate for db init check, transaction creation, error handling.
   */
  async _withStore(mode, fn) {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('ShadowArmy: Database not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], mode, { durability: 'relaxed' });
      const store = transaction.objectStore(this.storeName);
      transaction.onerror = () => reject(transaction.error);
      fn(store, transaction, resolve, reject);
    });
  }

  // ============================================================================
  // MIGRATION FROM LOCALSTORAGE
  // ============================================================================

  async migrateFromLocalStorage() {
    if (this.migrationCompleted) {
      this.debugLog('MIGRATION', 'Migration already completed, skipping');
      return { migrated: false, reason: 'Already migrated' };
    }

    try {
      this.debugLog('MIGRATION', 'Starting migration from localStorage to IndexedDB');

      const oldData = BdApi.Data.load('ShadowArmy', 'settings');
      if (
        !oldData ||
        !oldData.shadows ||
        !Array.isArray(oldData.shadows) ||
        oldData.shadows.length === 0
      ) {
        this.migrationCompleted = true;
        BdApi.Data.save('ShadowArmy', 'migrationCompleted', true);
        this.debugLog('MIGRATION', 'No data to migrate');
        return { migrated: false, reason: 'No data to migrate' };
      }

      this.debugLog('MIGRATION', 'Found shadows to migrate', { count: oldData.shadows.length });

      if (!this.db) {
        await this.init();
      }

      const migrated = await this.saveShadowsBatch(oldData.shadows);

      this.migrationCompleted = true;
      BdApi.Data.save('ShadowArmy', 'migrationCompleted', true);

      this.debugLog('MIGRATION', 'Migration completed successfully', {
        migrated,
        total: oldData.shadows.length,
      });

      return {
        migrated: true,
        count: migrated,
        shadows: oldData.shadows.length,
      };
    } catch (error) {
      this.debugError('MIGRATION', 'Migration failed', error);
      return { migrated: false, error: error.message };
    }
  }

  /**
   * Backfill personalityKey for all existing IndexedDB shadow records in batches.
   */
  async migratePersonalityKeys({ batchSize = 1000 } = {}) {
    if (!this.db) await this.init();

    const safeBatchSize = Math.max(100, Math.floor(batchSize) || 1000);
    const MAX_BATCHES = 500;
    let scanned = 0;
    let updated = 0;
    let errors = 0;
    let batches = 0;
    let lastKey = null;

    while (batches < MAX_BATCHES) {
      const batchResult = await new Promise((resolve, reject) => {
        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const range = lastKey == null ? null : IDBKeyRange.lowerBound(lastKey, true);

        let localScanned = 0;
        let localUpdated = 0;
        let localErrors = 0;
        let nextKey = null;
        let cursorFinished = false;

        const request = range ? store.openCursor(range) : store.openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) {
            cursorFinished = true;
            return;
          }

          if (localScanned >= safeBatchSize) {
            nextKey = cursor.key;
            return;
          }

          localScanned++;
          const shadow = cursor.value;
          const { shadow: normalizedShadow, changed } = this.ensurePersonalityKey(shadow);
          if (!changed) {
            cursor.continue();
            return;
          }

          const updateRequest = cursor.update(normalizedShadow);
          updateRequest.onsuccess = () => { localUpdated++; };
          updateRequest.onerror = () => { localErrors++; };
          cursor.continue();
        };
        request.onerror = () => reject(request.error);

        tx.oncomplete = () => {
          resolve({ scanned: localScanned, updated: localUpdated, errors: localErrors, nextKey, cursorFinished });
        };
        tx.onerror = () => reject(tx.error);
      });

      scanned += batchResult.scanned;
      updated += batchResult.updated;
      errors += batchResult.errors;
      batches++;

      if (batchResult.cursorFinished || batchResult.scanned === 0) break;
      if (batchResult.nextKey == null) break;
      lastKey = batchResult.nextKey;

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return { scanned, updated, errors, batches };
  }

  async ensurePersonalityKeyMigration(force = false) {
    if (!force && this.personalityKeyMigrationCompleted) {
      return { migrated: false, reason: 'Already migrated', scanned: 0, updated: 0, errors: 0 };
    }

    const result = await this.migratePersonalityKeys({ batchSize: 1000 });
    if (result.errors === 0) {
      this.personalityKeyMigrationCompleted = true;
      try {
        BdApi.Data.save('ShadowArmy', this.personalityMigrationFlagKey, true);
      } catch (error) {
        this.debugError('MIGRATION', 'Failed to persist personality key migration flag', error);
      }
    }

    return { migrated: true, ...result };
  }

  // ============================================================================
  // SHADOW CRUD OPERATIONS
  // ============================================================================

  async saveShadow(shadow) {
    if (!shadow || !this.getCacheKey(shadow)) {
      throw new Error('Invalid shadow object: missing id or i');
    }

    // Validate required fields for non-compressed shadows
    if (!shadow._c) {
      if (!shadow.rank) {
        this.debugError('STORAGE', 'saveShadow: missing rank, defaulting to E', { id: this.getCacheKey(shadow) });
        shadow.rank = 'E';
      }
      if (!shadow.baseStats || typeof shadow.baseStats !== 'object') {
        this.debugError('STORAGE', 'saveShadow: missing baseStats, applying defaults', { id: this.getCacheKey(shadow) });
        shadow.baseStats = { strength: 10, agility: 10, intelligence: 10, vitality: 10, perception: 10 };
      }
    }

    const { shadow: normalizedShadow } = this.ensurePersonalityKey(shadow);

    return this._withStore('readwrite', (store, _tx, resolve, reject) => {
      const request = store.put(normalizedShadow);
      request.onsuccess = () => {
        this.updateCache(normalizedShadow);
        resolve({ success: true, shadow: normalizedShadow });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveShadowsBatch(shadows) {
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) return 0;

    return this._withStore('readwrite', (store, tx, resolve, reject) => {
      let completed = 0;
      let errors = 0;

      tx.oncomplete = () => resolve(completed);
      tx.onabort = () => reject(tx.error || new Error('saveShadowsBatch transaction aborted'));

      shadows.forEach((shadow, index) => {
        const shadowId = this.getCacheKey(shadow);
        if (!shadow || !shadowId) {
          errors++;
          this.debugError('BATCH_SAVE', `Invalid shadow at index ${index}`, { index });
          return;
        }
        const { shadow: normalizedShadow } = this.ensurePersonalityKey(shadow);
        const request = store.put(normalizedShadow);
        request.onsuccess = () => { completed++; };
        request.onerror = () => {
          errors++;
          this.debugError('BATCH_SAVE', `Failed to save shadow at index ${index}`, {
            index, id: shadowId, error: request.error,
          });
        };
      });
    });
  }

  /**
   * Chunked batch save — writes shadows in small sequential IDB transactions
   * with event-loop yields between chunks to prevent OOM.
   */
  async saveShadowsChunked(shadows, chunkSize = 10) {
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) return 0;

    if (shadows.length <= chunkSize) {
      return this.saveShadowsBatch(shadows);
    }

    let totalSaved = 0;
    for (let i = 0; i < shadows.length; i += chunkSize) {
      const chunk = shadows.slice(i, i + chunkSize);
      const saved = await this.saveShadowsBatch(chunk);
      totalSaved += saved;

      if (i + chunkSize < shadows.length) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
    return totalSaved;
  }

  /**
   * Get shadows with pagination and filters (optimized with indexes).
   */
  async getShadows(
    filters = {},
    offset = 0,
    limit = 50,
    sortBy = 'extractedAt',
    sortOrder = 'desc'
  ) {
    if (offset < 0) offset = 0;
    if (limit !== Infinity && (!Number.isFinite(limit) || limit < 1)) limit = 50;
    const wantsUnlimited = limit === Infinity || !Number.isFinite(limit);
    const cursorDirection = sortOrder === 'asc' ? 'next' : 'prev';

    const hasFilters = !!(filters.rank || filters.role || filters.minLevel || filters.maxLevel || filters.minStrength);

    return this._withStore('readonly', (store, _tx, resolve, reject) => {
      // PAGED FAST PATH: no filters + finite limit
      if (!hasFilters && !wantsUnlimited && Number.isFinite(limit) && limit > 0) {
        let source = store;
        let canUseCursorPage = true;
        if (sortBy && sortBy !== 'id') {
          try {
            source = store.index(sortBy);
          } catch (_) {
            source = store;
            canUseCursorPage = false;
          }
        }
        if (canUseCursorPage) {
          const request = source.openCursor(null, cursorDirection);
          const results = [];
          let scanned = 0;
          request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) { resolve(results); return; }
            if (scanned < offset) { scanned++; cursor.continue(); return; }
            results.push(cursor.value);
            if (results.length >= limit) { resolve(results); return; }
            cursor.continue();
          };
          request.onerror = () => reject(request.error);
          return;
        }
      }

      // FILTERED PATH: Use cursor with index optimization
      let index = store;
      if (filters.rank && filters.role) {
        try { index = store.index('rank_role'); } catch (e) { /* fallback */ }
      } else if (filters.rank) {
        try { index = store.index('rank'); } catch (e) { /* fallback */ }
      } else if (filters.role) {
        try { index = store.index('role'); } catch (e) { /* fallback */ }
      }

      const results = [];
      const request = index.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const shadow = cursor.value;
          let matches = true;
          if (filters.rank && shadow.rank !== filters.rank) matches = false;
          if (filters.role && shadow.role !== filters.role) matches = false;
          if (filters.minLevel && (shadow.level || 1) < filters.minLevel) matches = false;
          if (filters.maxLevel && (shadow.level || 1) > filters.maxLevel) matches = false;
          if (filters.minStrength && (shadow.strength || 0) < filters.minStrength) matches = false;
          if (matches) results.push(shadow);
          cursor.continue();
        } else {
          results.sort((a, b) => {
            const aVal = a[sortBy] || 0;
            const bVal = b[sortBy] || 0;
            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
          });
          if (wantsUnlimited) {
            resolve(results.slice(offset));
          } else {
            resolve(results.slice(offset, offset + limit));
          }
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Stream shadows in fixed-size batches without materializing the whole table.
   * IMPORTANT: onBatch must be synchronous (no awaits) — runs inside live IDB transaction.
   */
  async forEachShadowBatch(
    onBatch,
    { batchSize = 200, sortBy = 'extractedAt', sortOrder = 'desc' } = {}
  ) {
    if (typeof onBatch !== 'function') {
      throw new Error('forEachShadowBatch requires an onBatch callback');
    }

    const safeBatchSize = Math.max(25, Math.floor(batchSize) || 200);
    const cursorDirection = sortOrder === 'asc' ? 'next' : 'prev';

    let scanned = 0;
    let batches = 0;

    await this._withStore('readonly', (store, _tx, resolve, reject) => {
      let source = store;
      if (sortBy && sortBy !== 'id') {
        try { source = store.index(sortBy); } catch (_) { source = store; }
      }

      const request = source.openCursor(null, cursorDirection);
      let batch = [];
      const emitBatch = () => {
        if (batch.length === 0) return true;
        try {
          const maybePromise = onBatch(batch);
          if (maybePromise && typeof maybePromise.then === 'function') {
            reject(new Error('forEachShadowBatch callback must be synchronous'));
            return false;
          }
          batches++;
          batch = [];
          return true;
        } catch (error) {
          reject(error);
          return false;
        }
      };

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          emitBatch();
          resolve({ scanned, batches });
          return;
        }

        batch.push(cursor.value);
        scanned++;

        if (batch.length >= safeBatchSize && !emitBatch()) return;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    return { scanned, batches };
  }

  async getTotalCount() {
    return this._withStore('readonly', (store, _tx, resolve) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  }

  /**
   * Fetch a targeted set of shadows by ID in bounded chunks.
   */
  async getShadowsByIds(ids = [], { chunkSize = 200 } = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const uniqueIds = Array.from(
      new Set(
        ids.map((id) => (id === null || id === undefined ? '' : String(id).trim())).filter(Boolean)
      )
    );
    if (uniqueIds.length === 0) return [];

    const safeChunkSize = Math.max(25, Math.floor(chunkSize) || 200);
    const results = [];

    for (let i = 0; i < uniqueIds.length; i += safeChunkSize) {
      const idChunk = uniqueIds.slice(i, i + safeChunkSize);
      const chunkResults = await this._withStore('readonly', (store, _tx, resolve) => {
        const found = [];
        let remaining = idChunk.length;

        if (remaining === 0) { resolve(found); return; }

        const finalize = () => {
          remaining -= 1;
          if (remaining <= 0) resolve(found);
        };

        idChunk.forEach((id) => {
          const request = store.get(id);
          request.onsuccess = () => {
            request.result && found.push(request.result);
            finalize();
          };
          request.onerror = () => finalize();
        });
      });
      chunkResults.length > 0 && results.push(...chunkResults);
    }

    return results;
  }

  async deleteShadow(id) {
    if (!id) throw new Error('Invalid shadow ID: missing id');

    return this._withStore('readwrite', (store, _tx, resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        const cachedShadow = this.recentCache.get(id);
        if (cachedShadow) {
          this.invalidateCache(cachedShadow);
        } else {
          this.recentCache.delete(id);
        }
        resolve({ success: true });
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  async updateShadowsBatch(shadows) {
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) return 0;

    return this._withStore('readwrite', (store, tx, resolve, reject) => {
      let completed = 0;
      let errors = 0;

      tx.oncomplete = () => resolve(completed);
      tx.onabort = () => reject(tx.error || new Error('updateShadowsBatch transaction aborted'));

      shadows.forEach((shadow, index) => {
        if (!shadow) { errors++; return; }
        const idForStore = this.getCacheKey(shadow);
        if (!idForStore) {
          errors++;
          this.debugError('BATCH_UPDATE', `Invalid shadow at index ${index}`, {
            index, hasI: !!shadow.i, hasId: !!shadow.id,
          });
          return;
        }
        shadow.id || (shadow.id = idForStore);
        const { shadow: normalizedShadow } = this.ensurePersonalityKey(shadow);

        const request = store.put(normalizedShadow);
        request.onsuccess = () => {
          completed++;
          const oldShadow = this.recentCache.get(this.getCacheKey(normalizedShadow));
          if (oldShadow) this.invalidateCache(oldShadow);
          this.updateCache(normalizedShadow, oldShadow);
        };
        request.onerror = () => {
          errors++;
          this.debugError('BATCH_UPDATE', `Failed to update shadow at index ${index}`, {
            index, id: this.getCacheKey(normalizedShadow), error: request.error,
          });
        };
      });
    });
  }

  async deleteShadowsBatch(shadowIds) {
    if (!shadowIds || !Array.isArray(shadowIds) || shadowIds.length === 0) return 0;

    return this._withStore('readwrite', (store, tx, resolve, reject) => {
      let completed = 0;
      let errors = 0;

      tx.oncomplete = () => resolve(completed);
      tx.onabort = () => reject(tx.error || new Error('deleteShadowsBatch transaction aborted'));

      shadowIds.forEach((id, index) => {
        if (!id) { errors++; return; }
        const request = store.delete(id);
        request.onsuccess = () => {
          completed++;
          const cachedShadow = this.recentCache.get(id);
          if (cachedShadow) {
            this.invalidateCache(cachedShadow);
          } else {
            this.recentCache.delete(id);
          }
        };
        request.onerror = () => {
          errors++;
          this.debugError('BATCH_DELETE', `Failed to delete shadow at index ${index}`, {
            index, id, error: request.error,
          });
        };
      });
    });
  }

  // ============================================================================
  // AGGREGATION
  // ============================================================================

  async getAggregatedPower(userRank, shadowRanks) {
    const emptyResult = { totalPower: 0, totalCount: 0, ranks: [], timestamp: Date.now() };
    if (!userRank || !shadowRanks || !Array.isArray(shadowRanks)) return emptyResult;

    const userRankIndex = shadowRanks.indexOf(userRank);
    if (userRankIndex === -1) return emptyResult;

    const weakRanks = shadowRanks.slice(0, Math.max(0, userRankIndex - 2) + 1);
    if (weakRanks.length === 0) return emptyResult;

    const resolveStrength = (shadow) => {
      if (shadow.strength > 0) return shadow.strength;
      if (shadow._c === 2 && shadow.p !== undefined) return shadow.p * 100;
      if (shadow.baseStats) return this.calculateShadowPower(shadow.baseStats, 1);
      const decompressed = this.getShadowData(shadow);
      if (decompressed?.baseStats) return this.calculateShadowPower(decompressed.baseStats, 1);
      if (decompressed?.strength > 0) return decompressed.strength;
      if (decompressed?._c === 2 && decompressed?.p !== undefined) return decompressed.p * 100;
      const effectiveStats = this.getShadowEffectiveStats?.(shadow);
      if (effectiveStats) return this.calculateShadowPower(effectiveStats, 1);
      return 0;
    };

    return this._withStore('readonly', (store, _tx, resolve) => {
      const rankIndex = store.index('rank');
      let totalPower = 0;
      let totalCount = 0;
      let completed = 0;
      let errors = 0;

      weakRanks.forEach((rank) => {
        const request = rankIndex.getAll(rank);
        request.onsuccess = () => {
          (request.result || []).forEach((shadow) => {
            const strength = resolveStrength(shadow);
            if (strength > 0) {
              totalPower += strength;
              totalCount++;
            }
          });
          completed++;
          if (completed + errors === weakRanks.length) {
            resolve({ totalPower, totalCount, ranks: weakRanks, timestamp: Date.now() });
          }
        };
        request.onerror = () => {
          errors++;
          if (completed + errors === weakRanks.length) {
            resolve({ totalPower, totalCount, ranks: weakRanks, timestamp: Date.now() });
          }
        };
      });
    });
  }

  async getCountByRank(rank) {
    return this._withStore('readonly', (store, _tx, resolve) => {
      const request = store.index('rank').count(rank);
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => resolve(0);
    });
  }

  // ============================================================================
  // DATABASE CLEANUP
  // ============================================================================

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.debugLog('CLOSE', 'Database connection closed');
    }
    this.clearCache();
  }
}

module.exports = ShadowStorageManager;
