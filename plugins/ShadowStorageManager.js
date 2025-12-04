/**
 * ShadowStorageManager - IndexedDB storage manager for ShadowArmy plugin
 * Provides user-specific, scalable storage for thousands of shadows
 *
 * Features:
 * - User-specific databases (per Discord user ID)
 * - Async operations (non-blocking)
 * - Pagination and filtering
 * - Aggregation for performance
 * - Migration from localStorage
 */

class ShadowStorageManager {
  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================

  /**
   * Initialize ShadowStorageManager with user ID
   * Operations:
   * 1. Store user ID for database naming
   * 2. Set database name and version
   * 3. Initialize memory caches
   * 4. Set cache TTL for aggregation
   */
  constructor(userId) {
    this.userId = userId || 'default';
    this.dbName = `ShadowArmyDB_${this.userId}`;
    this.dbVersion = 1;
    this.storeName = 'shadows';
    this.db = null;

    // Memory cache
    this.favoriteCache = new Map(); // Favorite shadows (7 generals)
    this.recentCache = new Map(); // Recently accessed shadows
    this.cacheLimit = 100;

    // Aggregation cache (for performance)
    this.aggregatedPowerCache = null;
    this.aggregatedPowerCacheTime = null;
    this.cacheTTL = 60000; // 1 minute

    // Migration flag
    this.migrationCompleted = false;
  }

  // ============================================================================
  // DATABASE INITIALIZATION
  // ============================================================================

  /**
   * Initialize IndexedDB database
   * Operations:
   * 1. Open database with version
   * 2. Create object store if doesn't exist
   * 3. Create indexes for fast queries
   * 4. Handle version upgrades
   */
  async init() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('ShadowStorageManager: IndexedDB not supported, falling back to localStorage');
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('ShadowStorageManager: Failed to open database', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('ShadowStorageManager: Database opened successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });

          // Create indexes for fast queries
          objectStore.createIndex('rank', 'rank', { unique: false });
          objectStore.createIndex('role', 'role', { unique: false });
          objectStore.createIndex('level', 'level', { unique: false });
          objectStore.createIndex('strength', 'strength', { unique: false });
          objectStore.createIndex('extractedAt', 'extractedAt', { unique: false });
          objectStore.createIndex('rank_role', ['rank', 'role'], { unique: false });

          console.log('ShadowStorageManager: Object store and indexes created');
        }
      };
    });
  }

  // ============================================================================
  // MIGRATION FROM LOCALSTORAGE
  // ============================================================================

  /**
   * Migrate shadows from localStorage to IndexedDB
   * Operations:
   * 1. Load old data from localStorage
   * 2. Initialize IndexedDB if not already done
   * 3. Batch save all shadows to IndexedDB
   * 4. Mark migration as complete
   * 5. Keep localStorage as backup for 1 version
   */
  async migrateFromLocalStorage() {
    if (this.migrationCompleted) {
      return { migrated: false, reason: 'Already migrated' };
    }

    try {
      // Load old data
      const oldData = BdApi.Data.load('ShadowArmy', 'settings');
      if (
        !oldData ||
        !oldData.shadows ||
        !Array.isArray(oldData.shadows) ||
        oldData.shadows.length === 0
      ) {
        this.migrationCompleted = true;
        return { migrated: false, reason: 'No data to migrate' };
      }

      console.log(
        `ShadowStorageManager: Migrating ${oldData.shadows.length} shadows from localStorage`
      );

      // Ensure database is initialized
      if (!this.db) {
        await this.init();
      }

      // Batch save shadows
      const migrated = await this.saveShadowsBatch(oldData.shadows);

      // Mark migration complete
      this.migrationCompleted = true;

      // Keep localStorage as backup (will be removed in future version)
      console.log('ShadowStorageManager: Migration complete, localStorage kept as backup');

      return {
        migrated: true,
        count: migrated,
        shadows: oldData.shadows.length,
      };
    } catch (error) {
      console.error('ShadowStorageManager: Migration failed', error);
      return { migrated: false, error: error.message };
    }
  }

  // ============================================================================
  // SHADOW OPERATIONS
  // ============================================================================

  /**
   * Save a single shadow to IndexedDB
   * Operations:
   * 1. Open transaction in readwrite mode
   * 2. Add shadow to object store
   * 3. Update memory cache if favorite or recent
   * 4. Return success status
   */
  async saveShadow(shadow) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(shadow);

      request.onsuccess = () => {
        // Update cache if favorite or recent
        this.updateCache(shadow);
        resolve({ success: true, shadow });
      };

      request.onerror = () => {
        console.error('ShadowStorageManager: Failed to save shadow', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get a single shadow by ID
   * Operations:
   * 1. Check memory cache first (fast path)
   * 2. Query IndexedDB if not in cache
   * 3. Update cache with result
   * 4. Return shadow object
   */
  async getShadow(id) {
    // Check cache first
    if (this.favoriteCache.has(id)) {
      return this.favoriteCache.get(id);
    }
    if (this.recentCache.has(id)) {
      return this.recentCache.get(id);
    }

    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        const shadow = request.result;
        if (shadow) {
          this.updateCache(shadow);
        }
        resolve(shadow || null);
      };

      request.onerror = () => {
        console.error('ShadowStorageManager: Failed to get shadow', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Save multiple shadows in batch (for migration)
   * Operations:
   * 1. Open transaction in readwrite mode
   * 2. Add all shadows to object store
   * 3. Return count of saved shadows
   */
  async saveShadowsBatch(shadows) {
    if (!shadows || shadows.length === 0) {
      return 0;
    }

    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      let completed = 0;
      let errors = 0;

      transaction.onabort = () => {
        console.error('ShadowStorageManager: Batch transaction aborted', transaction.error);
        reject(transaction.error);
      };

      shadows.forEach((shadow) => {
        const request = store.put(shadow);
        request.onsuccess = () => {
          completed++;
          if (completed + errors === shadows.length) {
            resolve(completed);
          }
        };
        request.onerror = () => {
          errors++;
          console.error('ShadowStorageManager: Failed to save shadow in batch', request.error);
          if (completed + errors === shadows.length) {
            resolve(completed);
          }
        };
      });
    });
  }

  /**
   * Get shadows with pagination and filters
   * Operations:
   * 1. Open transaction in readonly mode
   * 2. Select appropriate index and build IDBKeyRange
   * 3. Open cursor with direction (prev for desc, next for asc)
   * 4. Use cursor.advance(offset) to skip to first page item
   * 5. Collect up to limit results with in-cursor filtering
   * 6. Stop early to avoid scanning remaining records
   */
  async getShadows(
    filters = {},
    offset = 0,
    limit = 50,
    sortBy = 'extractedAt',
    sortOrder = 'desc'
  ) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      // Determine best index and key range based on filters
      let index;
      let keyRange = null;
      let needsInCursorFiltering = false;

      // Priority 1: Use composite rank_role index if both are specified
      if (filters.rank && filters.role) {
        index = store.index('rank_role');
        keyRange = IDBKeyRange.only([filters.rank, filters.role]);

        // Check if we need additional filtering
        needsInCursorFiltering = filters.minLevel || filters.maxLevel || filters.minStrength;
      }
      // Priority 2: Use single-value indexes with exact match
      else if (filters.rank) {
        index = store.index('rank');
        keyRange = IDBKeyRange.only(filters.rank);
        needsInCursorFiltering =
          filters.role || filters.minLevel || filters.maxLevel || filters.minStrength;
      } else if (filters.role) {
        index = store.index('role');
        keyRange = IDBKeyRange.only(filters.role);
        needsInCursorFiltering = filters.minLevel || filters.maxLevel || filters.minStrength;
      }
      // Priority 3: Use range indexes for min/max bounds
      else if (filters.minLevel || filters.maxLevel) {
        index = store.index('level');
        if (filters.minLevel && filters.maxLevel) {
          keyRange = IDBKeyRange.bound(filters.minLevel, filters.maxLevel);
        } else if (filters.minLevel) {
          keyRange = IDBKeyRange.lowerBound(filters.minLevel);
        } else {
          keyRange = IDBKeyRange.upperBound(filters.maxLevel);
        }
        needsInCursorFiltering = filters.minStrength;
      } else if (filters.minStrength) {
        index = store.index('strength');
        keyRange = IDBKeyRange.lowerBound(filters.minStrength);
      }
      // Priority 4: Use sortBy index for ordering
      else if (sortBy && ['rank', 'role', 'level', 'strength', 'extractedAt'].includes(sortBy)) {
        index = store.index(sortBy);
      }
      // Fallback: Use primary key
      else {
        index = store;
      }

      // Determine cursor direction based on sort order
      const direction = sortOrder === 'desc' ? 'prev' : 'next';

      // Open cursor with key range and direction
      const request = index.openCursor(keyRange, direction);
      const results = [];
      let skipped = false;

      request.onsuccess = (event) => {
        const cursor = event.target.result;

        if (!cursor) {
          // No more records, return what we have
          resolve(results);
          return;
        }

        // Skip to offset position (only once)
        if (!skipped && offset > 0) {
          skipped = true;
          cursor.advance(offset);
          return;
        }

        // Check if we've collected enough results
        if (results.length >= limit) {
          // Stop early - no need to scan remaining records
          resolve(results);
          return;
        }

        const shadow = cursor.value;

        // Apply in-cursor filtering for conditions not covered by index
        if (needsInCursorFiltering) {
          let matches = true;

          // Only apply filters not already covered by the index
          if (filters.role && !filters.rank && shadow.role !== filters.role) {
            matches = false;
          }
          if (
            filters.minLevel &&
            shadow.level < filters.minLevel &&
            index !== store.index('level')
          ) {
            matches = false;
          }
          if (
            filters.maxLevel &&
            shadow.level > filters.maxLevel &&
            index !== store.index('level')
          ) {
            matches = false;
          }
          if (
            filters.minStrength &&
            shadow.strength < filters.minStrength &&
            index !== store.index('strength')
          ) {
            matches = false;
          }

          if (matches) {
            results.push(shadow);
          }
        } else {
          // No filtering needed, add directly
          results.push(shadow);
        }

        // Continue to next record
        cursor.continue();
      };

      request.onerror = () => {
        console.error('ShadowStorageManager: Failed to get shadows', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get total shadow count
   * Operations:
   * 1. Open transaction in readonly mode
   * 2. Count all records in object store
   * 3. Return count
   */
  async getTotalCount() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('ShadowStorageManager: Failed to get count', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete a shadow by ID
   * Operations:
   * 1. Open transaction in readwrite mode
   * 2. Delete shadow from object store
   * 3. Remove from cache
   * 4. Return success status
   */
  async deleteShadow(id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        // Remove from cache
        this.favoriteCache.delete(id);
        this.recentCache.delete(id);
        resolve({ success: true });
      };

      request.onerror = () => {
        console.error('ShadowStorageManager: Failed to delete shadow', request.error);
        reject(request.error);
      };
    });
  }

  // ============================================================================
  // FAVORITE SHADOWS
  // ============================================================================

  /**
   * Get favorite shadows (from memory cache)
   * Operations:
   * 1. Return all shadows in favoriteCache
   * 2. Cache is updated when shadows are loaded
   */
  async getFavoriteShadows(favoriteIds) {
    if (!favoriteIds || favoriteIds.length === 0) {
      return [];
    }

    const favorites = [];
    const missingIds = [];

    // Get from cache
    favoriteIds.forEach((id) => {
      if (this.favoriteCache.has(id)) {
        favorites.push(this.favoriteCache.get(id));
      } else {
        missingIds.push(id);
      }
    });

    // Load missing favorites from IndexedDB
    if (missingIds.length > 0) {
      const promises = missingIds.map((id) => this.getShadow(id));
      const loaded = await Promise.all(promises);
      favorites.push(...loaded.filter(Boolean));
    }

    return favorites;
  }

  // ============================================================================
  // AGGREGATION FOR PERFORMANCE
  // ============================================================================

  /**
   * Get aggregated power for weak shadows (2+ ranks below user rank)
   * Operations:
   * 1. Check cache first (1 minute TTL)
   * 2. Calculate weak rank threshold
   * 3. Query IndexedDB for weak shadows
   * 4. Sum total power
   * 5. Cache result
   * 6. Return aggregated data
   */
  async getAggregatedPower(userRank, shadowRanks) {
    // Check cache
    if (this.aggregatedPowerCache && Date.now() - this.aggregatedPowerCacheTime < this.cacheTTL) {
      return this.aggregatedPowerCache;
    }

    if (!this.db) {
      await this.init();
    }

    const userRankIndex = shadowRanks.indexOf(userRank);
    const weakRankThreshold = Math.max(0, userRankIndex - 2);
    const weakRanks = shadowRanks.slice(0, weakRankThreshold + 1);

    if (weakRanks.length === 0) {
      return { totalPower: 0, totalCount: 0, ranks: [] };
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const rankIndex = store.index('rank');

      let totalPower = 0;
      let totalCount = 0;
      let completed = 0;

      weakRanks.forEach((rank) => {
        const request = rankIndex.getAll(rank);
        request.onsuccess = () => {
          const shadows = request.result || [];
          shadows.forEach((shadow) => {
            totalPower += shadow.strength || 0;
            totalCount++;
          });

          completed++;
          if (completed === weakRanks.length) {
            const result = {
              totalPower,
              totalCount,
              ranks: weakRanks,
              timestamp: Date.now(),
            };
            this.aggregatedPowerCache = result;
            this.aggregatedPowerCacheTime = Date.now();
            resolve(result);
          }
        };

        request.onerror = () => {
          console.error(
            'ShadowStorageManager: Failed to get shadows for rank aggregation',
            request.error
          );
          completed++;
          if (completed === weakRanks.length) {
            // Don't cache partial results on error - return without caching
            resolve({
              totalPower,
              totalCount,
              ranks: weakRanks,
              timestamp: Date.now(),
              partial: true,
            });
          }
        };
      });
    });
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Update memory cache with shadow
   * Operations:
   * 1. Add to favoriteCache if favorite
   * 2. Add to recentCache (LRU eviction)
   * 3. Limit cache size
   */
  updateCache(shadow) {
    if (!shadow || !shadow.id) return;

    // Add to recent cache (LRU)
    if (this.recentCache.has(shadow.id)) {
      this.recentCache.delete(shadow.id);
    }
    this.recentCache.set(shadow.id, shadow);

    // Evict oldest if cache limit reached
    if (this.recentCache.size > this.cacheLimit) {
      const firstKey = this.recentCache.keys().next().value;
      this.recentCache.delete(firstKey);
    }
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.favoriteCache.clear();
    this.recentCache.clear();
    this.aggregatedPowerCache = null;
    this.aggregatedPowerCacheTime = null;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get shadows by rank
   */
  async getShadowsByRank(rank) {
    return this.getShadows({ rank }, 0, 10000);
  }

  /**
   * Get shadows by role
   */
  async getShadowsByRole(role) {
    return this.getShadows({ role }, 0, 10000);
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.clearCache();
  }
}

// Export for use in ShadowArmy plugin
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShadowStorageManager;
}
