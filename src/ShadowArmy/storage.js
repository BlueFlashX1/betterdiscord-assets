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
  // CONSTRUCTOR & CONFIGURATION

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

  // CACHE MANAGEMENT

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

  // SHADOW DATA HELPERS

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

  // DATABASE INITIALIZATION

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

      request.onblocked = () => {
        this.debugError('INIT', 'Database upgrade blocked — close other Discord windows');
        reject(new Error('ShadowArmy IDB blocked by another window'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        // Handle version change from another window — release this connection
        this.db.onversionchange = () => {
          this.debugLog('INIT', 'Database version changed in another window — closing connection');
          this.db.close();
          this.db = null;
        };
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
    // DIAGNOSTIC PROBE (2026-07-29, AAPerfSentinel wave): count callers by
    // name. External profilers can't see past the async boundary, but HERE
    // the true caller is one synchronous frame up. AAPerfSentinel's report
    // reads window.__SA_STORE_CALLERS. Cost: one stack capture per
    // TRANSACTION (~28/min measured) — negligible. Remove once the
    // full-store-walk driver is confirmed and fixed.
    try {
      const callers = (window.__SA_STORE_CALLERS ||= new Map());
      // 3 frames (2026-07-30): frame[2] alone names the storage method, which
      // told us WHICH primitive runs but not WHO drives it — paged walks
      // jumped 0.7/min -> 155/min and the caller was unidentifiable. Capture
      // the chain instead of guessing again.
      const lines = (new Error().stack || '').split('\n');
      const names = [];
      for (let i = 2; i < lines.length && names.length < 3; i++) {
        const fm = /\bat\s+(?:async\s+)?([\w$.<>[\]]+)/.exec(lines[i] || '');
        if (fm && fm[1] !== 'Object.<anonymous>') names.push(fm[1]);
      }
      const key = `${names.length ? names.join('<') : '(anon)'} [${mode}]`;
      callers.set(key, (callers.get(key) || 0) + 1);
    } catch (_) {}

    if (!this.db) await this.init();
    if (!this.db) throw new Error('ShadowArmy: Database not initialized');
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], mode, { durability: 'relaxed' });
      const store = transaction.objectStore(this.storeName);
      transaction.onerror = () => reject(transaction.error);
      fn(store, transaction, resolve, reject);
    });
  }

  // MIGRATION FROM LOCALSTORAGE

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

      const { completed: migrated } = await this.saveShadowsBatch(oldData.shadows);

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

          localScanned++;
          const shadow = cursor.value;
          const { shadow: normalizedShadow, changed } = this.ensurePersonalityKey(shadow);
          const shouldContinue = localScanned < safeBatchSize;
          nextKey = cursor.key;

          if (!changed) {
            if (shouldContinue) cursor.continue();
            return;
          }

          const updateRequest = cursor.update(normalizedShadow);
          updateRequest.onsuccess = () => { localUpdated++; };
          updateRequest.onerror = (event) => {
            // Prevent the per-record error from bubbling to tx.onerror and
            // aborting the whole cursor batch (up to 1000 records) — mirrors
            // the saveShadowsBatch/updateShadowsBatch/deleteShadowsBatch fix.
            event.preventDefault();
            event.stopPropagation();
            localErrors++;
          };
          if (shouldContinue) cursor.continue();
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

    if (batches >= MAX_BATCHES) {
      this.debugError('MIGRATION', 'migratePersonalityKeys: hit MAX_BATCHES cap — migration may be incomplete; scanned=' + scanned + ' batches=' + batches, null);
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

  // SHADOW CRUD OPERATIONS

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
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) {
      return { completed: 0, failedIndices: [] };
    }

    return this._withStore('readwrite', (store, tx, resolve, reject) => {
      let completed = 0;
      const failedIndices = [];

      tx.oncomplete = () => resolve({ completed, failedIndices });
      tx.onabort = () => reject(tx.error || new Error('saveShadowsBatch transaction aborted'));

      shadows.forEach((shadow, index) => {
        const shadowId = this.getCacheKey(shadow);
        if (!shadow || !shadowId) {
          this.debugError('BATCH_SAVE', `Invalid shadow at index ${index}`, { index });
          failedIndices.push(index);
          return;
        }
        const { shadow: normalizedShadow } = this.ensurePersonalityKey(shadow);
        const request = store.put(normalizedShadow);
        request.onsuccess = () => { completed++; };
        request.onerror = (event) => {
          // Prevent the per-item error from bubbling to tx.onerror and
          // aborting the whole batch — one bad record must not discard
          // every other successful write in a 50-250 item batch.
          event.preventDefault();
          event.stopPropagation();
          failedIndices.push(index);
          this.debugError('BATCH_SAVE', `Failed to save shadow at index ${index}`, {
            index, id: shadowId, error: request.error,
          });
        };
      });
    });
  }

  /**
   * Chunked batch save — writes shadows in sequential IDB transactions with
   * event-loop yields between chunks to keep the UI responsive.
   *
   * Default raised 10 -> 100 (2026-07-30, burst capture): at 10 per chunk a
   * 500-shadow combat growth save cost FIFTY transactions, and the profiler
   * measured 369 saveShadowsBatch transactions in 3 minutes (~123/min) with
   * 3 dungeons active — the top storage caller in the suite. Every other
   * batch path here already uses 200-400 per transaction (getShadowsByIds
   * 200, transformShadowsBatch 200, compression tiering 400), so 10 was an
   * outlier, not a considered limit. Records are ~1KB, so 100/txn is well
   * inside safe territory and the inter-chunk yield is preserved.
   */
  async saveShadowsChunked(shadows, chunkSize = 100) {
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) {
      return { completed: 0, failedIndices: [] };
    }

    if (shadows.length <= chunkSize) {
      return this.saveShadowsBatch(shadows);
    }

    let totalCompleted = 0;
    const failedIndices = [];
    for (let i = 0; i < shadows.length; i += chunkSize) {
      const chunk = shadows.slice(i, i + chunkSize);
      const { completed, failedIndices: chunkFailedIndices } = await this.saveShadowsBatch(chunk);
      totalCompleted += completed;
      chunkFailedIndices.forEach((idx) => failedIndices.push(i + idx));

      if (i + chunkSize < shadows.length) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
    return { completed: totalCompleted, failedIndices };
  }

  /**
   * Get a page of shadows via primary-key cursor resume (keyset pagination).
   * Unlike getShadows()'s offset pagination — which costs O(offset) cursor
   * steps to skip to a position, growing to O(N) near the end of a large
   * store — this resumes directly from lastKey via IDBKeyRange, so each call
   * costs O(limit) regardless of how far through the store it is. Same
   * resume-cursor pattern as migratePersonalityKeys() above.
   * @param {string|null} lastKey - primary key ('id') to resume after, or null to start from the beginning
   * @param {number} limit - max records to return
   * @returns {Promise<{shadows: Array, lastKey: string|null, exhausted: boolean}>}
   */
  async getShadowsByKeyPage(lastKey, limit) {
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
    return this._withStore('readonly', (store, _tx, resolve, reject) => {
      const range = lastKey == null ? null : IDBKeyRange.lowerBound(lastKey, true);
      const request = range ? store.openCursor(range) : store.openCursor();
      const results = [];
      let nextKey = null;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve({ shadows: results, lastKey: null, exhausted: true });
          return;
        }
        results.push(cursor.value);
        nextKey = cursor.key;
        if (results.length >= safeLimit) {
          resolve({ shadows: results, lastKey: nextKey, exhausted: false });
          return;
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
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
   * UNORDERED full-store stream using paged getAll() on the PRIMARY key
   * (unique → keyset-safe, no boundary loss). ~batchSize records per IDB
   * event instead of ONE per record: openCursor/continue costs 281k
   * onsuccess callbacks per walk at army scale (AAPerfSentinel 2026-07-29
   * measured 370M callbacks/2.5h across all walkers — the "idle churn").
   * Use for anything order-insensitive: tallies, sums, censuses, power
   * accumulation. onBatch must be synchronous (runs in the live txn).
   */
  async forEachShadowBatchPaged(onBatch, { batchSize = 500 } = {}) {
    if (typeof onBatch !== 'function') {
      throw new Error('forEachShadowBatchPaged requires an onBatch callback');
    }
    const size = Math.max(50, Math.floor(batchSize) || 500);
    let scanned = 0;
    let batches = 0;

    return this._withStore('readonly', (store, _tx, resolve, reject) => {
      const issue = (lastId) => {
        const range = lastId === null ? null : IDBKeyRange.lowerBound(lastId, true);
        const req = store.getAll(range, size);
        req.onsuccess = () => {
          const page = req.result || [];
          if (page.length > 0) {
            try {
              onBatch(page);
            } catch (error) {
              reject(error);
              return;
            }
            scanned += page.length;
            batches++;
          }
          if (page.length < size) {
            resolve({ scanned, batches });
            return;
          }
          issue(page[page.length - 1].id);
        };
        req.onerror = () => reject(req.error);
      };
      issue(null);
    });
  }

  /**
   * Stream shadows in fixed-size batches without materializing the whole table.
   * IMPORTANT: onBatch must be synchronous (no awaits) — runs inside live IDB transaction.
   * NOTE: per-record cursor iteration (1 IDB event per record). Prefer
   * forEachShadowBatchPaged when ordering doesn't matter.
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

  /**
   * Collect every shadow via the bounded batch cursor (forEachShadowBatch)
   * instead of getShadows({}, 0, Infinity)'s FILTERED PATH, which opens an
   * unindexed store cursor then does a full in-memory Array.sort over the
   * entire result — wasted work when the caller needs the whole army anyway
   * (order already comes out correct from the index-ordered cursor below).
   * Returns raw records as stored (no auto-decompression) — same contract
   * as the getShadows() call sites this replaces.
   */
  async getAllShadowsRaw({ batchSize = 500 } = {}) {
    // PAGED (2026-07-30): now streams via forEachShadowBatchPaged — primary-
    // key order, ~500 records per IDB event instead of one per record (each
    // cursor walk here cost 281k onsuccess events; these walks were the last
    // ~1.7M events/12min after the tally/stats walkers were switched).
    // ORDER CHANGE audited across every consumer 2026-07-30: compression
    // sorts by power itself, migrations/XP-enum build id sets, census/stats
    // tally, snapshot consumers count/filter/min-scan (order only breaks
    // ties between equal-power shadows). Nothing reads recency order.
    const collected = [];
    await this.forEachShadowBatchPaged(
      (batch) => {
        for (let i = 0; i < batch.length; i++) collected.push(batch[i]);
      },
      { batchSize }
    );
    return collected;
  }

  async getTotalCount() {
    return this._withStore('readonly', (store, _tx, resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IDB count failed'));
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
          request.onerror = (event) => {
            // Prevent the per-id error from bubbling to tx.onerror and
            // aborting the whole chunk — one bad record shouldn't lose every
            // other id's result in this chunk (R8: per-item IDB tolerance).
            event.preventDefault();
            event.stopPropagation();
            // Surface the per-key read failure: previously counted down as if
            // the id were absent, which silently produced short result lists
            // (e.g. grantShadowXP would grant 0 XP to the missing shadows).
            this.debugError?.('IDB', 'getShadowsByIds: request error', { id, error: request.error });
            finalize();
          };
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

  // BATCH OPERATIONS

  async updateShadowsBatch(shadows) {
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) return 0;

    return this._withStore('readwrite', (store, tx, resolve, reject) => {
      let completed = 0;

      tx.oncomplete = () => resolve(completed);
      tx.onabort = () => reject(tx.error || new Error('updateShadowsBatch transaction aborted'));

      shadows.forEach((shadow, index) => {
        if (!shadow) { return; }
        const idForStore = this.getCacheKey(shadow);
        if (!idForStore) {
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
        request.onerror = (event) => {
          // Prevent the per-item error from bubbling to tx.onerror and
          // aborting the whole batch — see saveShadowsBatch above.
          event.preventDefault();
          event.stopPropagation();
          this.debugError('BATCH_UPDATE', `Failed to update shadow at index ${index}`, {
            index, id: this.getCacheKey(normalizedShadow), error: request.error,
          });
        };
      });
    });
  }

  /**
   * Merge-on-write batch transform — chunked readwrite transactions where
   * each id is `get`-ed FRESH inside the transaction, passed to `transformFn`,
   * and the returned record is `put` back in the SAME transaction. Fixes the
   * ShadowArmy lost-update class (self-heal / hourly compression tiering /
   * autoPromoteGrades / XP grant-flush all used to read one full-army
   * snapshot, mutate in memory across several `await`s, then batch-`put`
   * stale full records — silently reverting whatever any other pass wrote
   * to the same shadow in between). See
   * memory/scratch/arch-sa-concurrency-2026-07-12.md for the audit.
   *
   * `transformFn` MUST be synchronous — no `await` inside it. IndexedDB
   * transactions auto-commit once the microtask queue empties; an `await`
   * inside transformFn yields control back to the event loop, the browser
   * closes the transaction underneath the pending `get`/`put` calls, and
   * every subsequent request in that chunk fails with
   * TransactionInactiveError. Do all async work (fetching related data,
   * yielding between chunks) OUTSIDE transformFn, before calling this.
   *
   * @param {Array<string>} ids - primary keys ('id') to transform.
   * @param {(freshRecord: object) => (object|null|undefined)} transformFn -
   *   receives the FRESH record read inside this transaction. Return the
   *   record to `put()`, or null/undefined to skip the write for that id
   *   (e.g. the id no longer exists, or nothing changed).
   * @param {Object} [opts]
   * @param {number} [opts.chunkSize=200] - ids per IDB readwrite transaction.
   * @returns {Promise<{completed: number, skipped: number, failedIds: Array<string>}>}
   *
   * Field ownership (which pass writes which field — audited 2026-07-12,
   * memory/scratch/arch-sa-concurrency-2026-07-12.md). Callers rewired to
   * this primitive derive every written field from the FRESH record passed
   * into transformFn, never from a captured snapshot, so this table only
   * needs to call out fields two DIFFERENT passes both touch:
   *   beastType, beastFamily          -> self-heal only (role-derived)
   *   baseStats                       -> self-heal only (full recompute)
   *   growthStats                     -> self-heal (init-if-missing only),
   *                                       progression (level-up append)
   *   naturalGrowthStats              -> self-heal (init-if-missing only)
   *   level, xp                       -> self-heal (init-if-missing only),
   *                                       progression (grant/level-up/rank carry)
   *   rank                            -> progression (attemptAutoRankUp) only
   *   strength                        -> self-heal (recalc from fresh
   *                                       base+growth stats) AND progression
   *                                       (level/rank-up recalc) — the one
   *                                       TRUE same-field race, but both
   *                                       derive strength from the SAME fresh
   *                                       baseStats/growthStats via
   *                                       getShadowEffectiveStats(), so
   *                                       whichever write lands last is still
   *                                       self-consistent with what's on the
   *                                       record at that moment
   *   grade / gr                      -> compression.autoPromoteGrades only;
   *                                       self-heal and compression-tiering
   *                                       pass it through unchanged from the
   *                                       fresh record
   *   _c + compressed representation  -> compression tiering only (self-heal,
   *                                       when it heals a dirty record, always
   *                                       writes an uncompressed record
   *                                       regardless of prior tier —
   *                                       pre-existing behavior, unchanged)
   *   _healV / hv                     -> self-heal only (always stamped);
   *                                       compression/progression carry the
   *                                       existing value through unchanged
   *   totalCombatTime, lastNaturalGrowth,
   *   growthVarianceSeed, roleName    -> self-heal (init-if-missing only)
   *
   * migrations.js (Phase-1 backfill/recalc) is deliberately NOT rewired to
   * this primitive — those passes are one-time, version-gated (run once per
   * install/upgrade, never concurrently with themselves or with each other),
   * lower priority than the four recurring passes above. They still
   * snapshot-then-batch-put; tolerated because nothing else runs
   * concurrently during a one-time migration gate.
   */
  async transformShadowsBatch(ids, transformFn, opts = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return { completed: 0, skipped: 0, failedIds: [] };
    if (typeof transformFn !== 'function') {
      throw new Error('transformShadowsBatch requires a synchronous transformFn');
    }

    const chunkSize = Math.max(1, Math.floor(opts.chunkSize) || 200);
    let completed = 0;
    let skipped = 0;
    const failedIds = [];

    // Error-log storm cap (2026-07-29): the keyPath outage produced ~280k
    // identical per-item error lines PER PASS — roughly 30-60s of main-thread
    // time spent logging plus ~70MB of log growth per session, amplifying the
    // outage it was reporting. Errors stay UNCONDITIONAL (loud is correct —
    // it's how the outage was found); only repetition is bounded: first
    // ERR_LOG_CAP lines per error class, then one summary after the batch.
    const ERR_LOG_CAP = 5;
    const errCounts = { threw: 0, get: 0, put: 0, abort: 0 };
    let lastErrorName = null;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const rawChunk = ids.slice(i, i + chunkSize);
      const uniqueChunkIds = Array.from(
        new Set(rawChunk.map((id) => (id === null || id === undefined ? '' : String(id))).filter(Boolean))
      );

      if (uniqueChunkIds.length > 0) {
        try {
          await this._withStore('readwrite', (store, tx, resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error || new Error('transformShadowsBatch transaction aborted'));

            uniqueChunkIds.forEach((id) => {
              const getRequest = store.get(id);
              getRequest.onsuccess = () => {
                const freshRecord = getRequest.result;
                if (!freshRecord) { skipped++; return; }

                let transformed;
                try {
                  transformed = transformFn(freshRecord);
                } catch (error) {
                  if (++errCounts.threw <= ERR_LOG_CAP) {
                    this.debugError('TRANSFORM_BATCH', `transformFn threw for id ${id}`, error);
                  }
                  failedIds.push(id);
                  return;
                }

                if (transformed === null || transformed === undefined) { skipped++; return; }

                // keyPath parity with updateShadowsBatch (storage.js): compressShadow/
                // compressShadowUltra outputs carry `i` but not `id`, and the store's
                // keyPath is 'id' — put() on an id-less object THROWS SYNCHRONOUSLY,
                // which aborts the whole chunk transaction and errors every sibling
                // get (the 2026-07 army-wide TRANSFORM_BATCH failure storms; latent
                // since the wave-6 rewire onto this path, 2026-07-12).
                transformed.id || (transformed.id = this.getCacheKey(transformed));
                if (!transformed.id) { skipped++; return; }

                const { shadow: normalizedShadow } = this.ensurePersonalityKey(transformed);
                const putRequest = store.put(normalizedShadow);
                putRequest.onsuccess = () => {
                  completed++;
                  const oldShadow = this.recentCache.get(this.getCacheKey(normalizedShadow));
                  if (oldShadow) this.invalidateCache(oldShadow);
                  this.updateCache(normalizedShadow, oldShadow);
                };
                putRequest.onerror = (event) => {
                  // R8: per-item onerror must preventDefault()+stopPropagation()
                  // or one bad record aborts the whole chunk transaction.
                  event.preventDefault();
                  event.stopPropagation();
                  failedIds.push(id);
                  lastErrorName = putRequest.error?.name || lastErrorName;
                  if (++errCounts.put <= ERR_LOG_CAP) {
                    this.debugError('TRANSFORM_BATCH', `Failed to put transformed record ${id}`, {
                      name: putRequest.error?.name || null,
                      message: putRequest.error?.message || null,
                    });
                  }
                };
              };
              getRequest.onerror = (event) => {
                event.preventDefault();
                event.stopPropagation();
                failedIds.push(id);
                lastErrorName = getRequest.error?.name || lastErrorName;
                if (++errCounts.get <= ERR_LOG_CAP) {
                  this.debugError('TRANSFORM_BATCH', `Failed to get record ${id} for transform`, {
                    name: getRequest.error?.name || null,
                    message: getRequest.error?.message || null,
                  });
                }
              };
            });
          });
        } catch (error) {
          // onabort path — the whole chunk's writes were rolled back; report
          // every id in the chunk as failed rather than silently losing them.
          uniqueChunkIds.forEach((id) => failedIds.push(id));
          lastErrorName = error?.name || lastErrorName;
          // DOMExceptions JSON-serialize to {} — surface name/message explicitly
          // (the 2026-07 failure storm was undiagnosable from `{"error":{}}` logs).
          if (++errCounts.abort <= ERR_LOG_CAP) {
            this.debugError('TRANSFORM_BATCH', `Chunk transaction aborted (${uniqueChunkIds.length} ids)`, {
              name: error?.name || null,
              message: error?.message || null,
            });
          }
        }
      }

      if (i + chunkSize < ids.length) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const totalErrs = errCounts.threw + errCounts.get + errCounts.put + errCounts.abort;
    if (totalErrs > ERR_LOG_CAP) {
      this.debugError(
        'TRANSFORM_BATCH',
        `Batch finished with ${failedIds.length}/${ids.length} failed ids (per-class error lines capped at ${ERR_LOG_CAP})`,
        { errorCounts: errCounts, lastErrorName }
      );
    }

    return { completed, skipped, failedIds };
  }

  async deleteShadowsBatch(shadowIds) {
    if (!shadowIds || !Array.isArray(shadowIds) || shadowIds.length === 0) return 0;

    return this._withStore('readwrite', (store, tx, resolve, reject) => {
      let completed = 0;

      tx.oncomplete = () => resolve(completed);
      tx.onabort = () => reject(tx.error || new Error('deleteShadowsBatch transaction aborted'));

      shadowIds.forEach((id, index) => {
        if (!id) { return; }
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
        request.onerror = (event) => {
          // Prevent the per-item error from bubbling to tx.onerror and
          // aborting the whole batch — see saveShadowsBatch above.
          event.preventDefault();
          event.stopPropagation();
          this.debugError('BATCH_DELETE', `Failed to delete shadow at index ${index}`, {
            index, id, error: request.error,
          });
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

  /**
   * Fetch up to `limit` shadows of a single rank via the 'rank' index.
   * Bounded read — avoids a full-store scan when only a small sample of
   * one rank is needed (e.g. deployment's weakest-available-shadow lookup).
   */
  async getShadowsByRankLimited(rank, limit = 500) {
    if (!rank) return [];
    const safeLimit = Math.max(1, Math.floor(limit) || 500);

    return this._withStore('readonly', (store, _tx, resolve, reject) => {
      const request = store.index('rank').getAll(rank, safeLimit);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('getShadowsByRankLimited failed'));
    });
  }

  // DATABASE CLEANUP

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
