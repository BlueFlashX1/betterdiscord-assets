/**
 * @name ShadowArmy
 * @author BlueFlashX1
 * @description Solo Leveling Shadow Army system - Extract and collect shadows with ranks, roles, and abilities
 * @version 1.0.2
 *
 * STORAGE: Uses IndexedDB for scalable storage (user-specific, supports 100,000+ shadows)
 * Features:
 * - User-specific storage (per Discord user ID)
 * - Exponential stat scaling between ranks
 * - Stats-influenced extraction probability
 * - Solo Leveling lore constraints (can't extract significantly stronger targets)
 * - Aggregation for performance (weak shadows aggregated, stats preserved)
 */

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
    this.dbVersion = 2; // Upgraded for natural growth system
    this.storeName = 'shadows';
    this.db = null;

    // Memory cache
    this.favoriteCache = new Map(); // Favorite shadows (7 generals)
    this.recentCache = new Map(); // Recently accessed shadows
    this.cacheLimit = 100;
    this.favoriteLimit = 7; // Limit for favorite cache (7 generals)
    this.favoriteIds = new Set(); // Track favorite shadow IDs for cache updates

    // Aggregation cache (for performance)
    this.aggregatedPowerCache = null;
    this.aggregatedPowerCacheTime = null;
    this.cacheTTL = 60000; // 1 minute

    // Buff cache (for synchronous access by SoloLevelingStats)
    this.cachedBuffs = null;
    this.cachedBuffsTime = null;

    // Migration flag - load persisted value from stable storage
    const persistedMigration = BdApi.Data.load('ShadowArmy', 'migrationCompleted');
    this.migrationCompleted = persistedMigration === true;

    // Natural growth tracking
    this.lastNaturalGrowthTime = Date.now();
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
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // Create object store if it doesn't exist (v1)
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

        // Add new indices for v2 (natural growth system)
        if (oldVersion < 2) {
          const transaction = event.target.transaction;
          const objectStore = transaction.objectStore(this.storeName);

          // Add index for natural growth tracking
          if (!objectStore.indexNames.contains('lastNaturalGrowth')) {
            objectStore.createIndex('lastNaturalGrowth', 'lastNaturalGrowth', { unique: false });
          }
          if (!objectStore.indexNames.contains('totalCombatTime')) {
            objectStore.createIndex('totalCombatTime', 'totalCombatTime', { unique: false });
          }

          console.log(
            '[ShadowStorageManager] Database upgraded to v2 with natural growth tracking'
          );
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
        // Persist migration flag to stable storage
        BdApi.Data.save('ShadowArmy', 'migrationCompleted', true);
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

      // Mark migration complete and persist flag to stable storage
      this.migrationCompleted = true;
      BdApi.Data.save('ShadowArmy', 'migrationCompleted', true);

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
   * 2. Apply filters (rank, role, etc.)
   * 3. Sort by specified field
   * 4. Apply pagination (offset, limit)
   * 5. Return array of shadows
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
      let index = store;

      // Use index if filtering by rank or role
      if (filters.rank && filters.role) {
        index = store.index('rank_role');
      } else if (filters.rank) {
        index = store.index('rank');
      } else if (filters.role) {
        index = store.index('role');
      } else if (filters.sortBy) {
        index = store.index(filters.sortBy);
      }

      const request = index.openCursor();
      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const shadow = cursor.value;

          // Apply filters
          let matches = true;
          if (filters.rank && shadow.rank !== filters.rank) matches = false;
          if (filters.role && shadow.role !== filters.role) matches = false;
          if (filters.minLevel && shadow.level < filters.minLevel) matches = false;
          if (filters.maxLevel && shadow.level > filters.maxLevel) matches = false;
          if (filters.minStrength && shadow.strength < filters.minStrength) matches = false;

          if (matches) {
            results.push(shadow);
          }

          cursor.continue();
        } else {
          // Sort results
          results.sort((a, b) => {
            const aVal = a[sortBy] || 0;
            const bVal = b[sortBy] || 0;
            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
          });

          // Apply pagination
          const paginated = results.slice(offset, offset + limit);
          resolve(paginated);
        }
      };

      request.onerror = () => {
        console.error('ShadowStorageManager: Failed to get shadows', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get army statistics without loading all shadows (efficient for 300+ shadows)
   * Returns aggregate data: total, by rank, avg level, ready for rank-up, etc.
   */
  async getArmyStatistics() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();

      const stats = {
        total: 0,
        byRank: {},
        byRole: {},
        avgLevel: 0,
        totalCombatTime: 0,
        readyForRankUp: 0,
        totalPower: 0,
      };
      let levelSum = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const shadow = cursor.value;
          stats.total++;

          // By rank
          stats.byRank[shadow.rank] = (stats.byRank[shadow.rank] || 0) + 1;

          // By role
          const role = shadow.role || shadow.roleName || 'Unknown';
          stats.byRole[role] = (stats.byRole[role] || 0) + 1;

          // Level sum
          levelSum += shadow.level || 1;

          // Combat time
          stats.totalCombatTime += shadow.totalCombatTime || 0;

          // Power
          stats.totalPower += shadow.strength || 0;

          // Check rank-up readiness (simplified, just check avg stats)
          const effectiveStats = this.getShadowEffectiveStats(shadow);
          const avgStats =
            (effectiveStats.strength +
              effectiveStats.agility +
              effectiveStats.intelligence +
              effectiveStats.vitality +
              effectiveStats.luck) /
            5;

          const shadowRanks = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'Monarch'];
          const idx = shadowRanks.indexOf(shadow.rank);
          const nextRank = shadowRanks[idx + 1];
          const baselineStats = {
            E: 10,
            D: 25,
            C: 50,
            B: 100,
            A: 200,
            S: 400,
            SS: 800,
            SSS: 1600,
            Monarch: 3200,
          };
          const nextBaseline = baselineStats[nextRank] || 9999;

          if (nextRank && avgStats >= nextBaseline * 0.8) {
            stats.readyForRankUp++;
          }

          cursor.continue();
        } else {
          // Calculate averages
          stats.avgLevel = stats.total > 0 ? Math.floor(levelSum / stats.total) : 0;
          stats.totalCombatTime = Math.floor(stats.totalCombatTime);
          resolve(stats);
        }
      };

      request.onerror = () => reject(request.error);
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
   */
  async getAggregatedPower(userRank, shadowRanks) {
    // Check cache
    if (this.aggregatedPowerCache && Date.now() - this.aggregatedPowerCacheTime < this.cacheTTL) {
      return this.aggregatedPowerCache;
    }

    // Prevent concurrent execution
    if (this._aggregatingPower) {
      return this._aggregatingPower;
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

    this._aggregatingPower = new Promise((resolve, reject) => {
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
            this._aggregatingPower = null;
            resolve(result);
          }
        };
        request.onerror = () => {
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
            this._aggregatingPower = null;
            resolve(result);
          }
        };
      });
    });

    return this._aggregatingPower;
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Update memory cache with shadow
   * Operations:
   * 1. Add to favoriteCache if favorite (with limit enforcement)
   * 2. Add to recentCache (LRU eviction)
   * 3. Limit cache size separately for each cache
   */
  updateCache(shadow) {
    // Guard: ensure shadow and shadow.id exist
    if (!shadow || !shadow.id) return;

    // Add to favorite cache if favorite
    if (this.favoriteIds.has(shadow.id)) {
      // Update existing favorite or add new one
      if (this.favoriteCache.has(shadow.id)) {
        // Update existing favorite (move to end for LRU)
        this.favoriteCache.delete(shadow.id);
      } else {
        // Evict oldest if favorite cache limit reached
        if (this.favoriteCache.size >= this.favoriteLimit) {
          const firstKey = this.favoriteCache.keys().next().value;
          this.favoriteCache.delete(firstKey);
        }
      }
      this.favoriteCache.set(shadow.id, shadow);
    } else {
      // Remove from favorite cache if no longer favorite
      if (this.favoriteCache.has(shadow.id)) {
        this.favoriteCache.delete(shadow.id);
      }
    }

    // Add to recent cache (LRU)
    if (this.recentCache.has(shadow.id)) {
      // Move to end (most recently used)
      this.recentCache.delete(shadow.id);
    }
    this.recentCache.set(shadow.id, shadow);

    // Evict oldest if recent cache limit reached
    if (this.recentCache.size > this.cacheLimit) {
      const firstKey = this.recentCache.keys().next().value;
      this.recentCache.delete(firstKey);
    }
  }

  /**
   * Set favorite shadow IDs for cache management
   * @param {string[]} favoriteIds - Array of favorite shadow IDs
   */
  setFavoriteIds(favoriteIds) {
    this.favoriteIds = new Set(favoriteIds || []);
    // Clean up favoriteCache to remove non-favorites
    for (const id of this.favoriteCache.keys()) {
      if (!this.favoriteIds.has(id)) {
        this.favoriteCache.delete(id);
      }
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

// ================================================================================
// MAIN PLUGIN CLASS - Shadow Army Management
// ================================================================================
module.exports = class ShadowArmy {
  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================

  /**
   * Initialize ShadowArmy plugin with default settings and configuration
   * Operations:
   * 1. Set up default settings (enabled, shadows array, extraction config)
   * 2. Define shadow rank system (E through Shadow Monarch)
   * 3. Define shadow roles with buffs and effects
   * 4. Define stat weight templates for role-based stat generation
   * 5. Initialize settings and solo plugin reference
   */
  constructor() {
    this.defaultSettings = {
      enabled: true,
      shadows: [], // Array of shadow objects
      totalShadowsExtracted: 0,
      lastExtractionTime: null,
      // Note: Generals are now auto-selected based on 7 strongest shadows (no manual selection)
      extractionConfig: {
        // Base extraction tuning (regular messages)
        minBaseChance: 0.0005, // 0.05% minimum (reduced from 0.1%)
        chancePerInt: 0.003, // +0.3% per INT (reduced from 0.5%)
        maxExtractionChance: 0.05, // 5% hard cap (reduced from 15% to prevent spam)
        maxExtractionsPerMinute: 20, // hard safety cap
        // Special ARISE event tuning
        specialBaseChance: 0.01, // 1% base
        specialIntMultiplier: 0.003, // +0.3% per INT
        specialLuckMultiplier: 0.002, // +0.2% per Luck (perception proxy)
        specialMaxChance: 0.3, // 30% hard cap
        specialMaxPerDay: 5, // limit special events per day
        // Dungeon/Boss extraction limits (Solo Leveling lore: max 3 attempts per corpse)
        maxBossAttemptsPerDay: 3, // Max extraction attempts per boss per day
        bossAttemptResetHour: 0, // Reset at midnight (0-23)
      },
      dungeonExtractionAttempts: {
        // Tracks per-boss extraction attempts: { bossId: { count, lastAttempt, lastReset } }
        // Example: "dungeon_ice_cavern_boss_frost_dragon": { count: 2, lastAttempt: timestamp, lastReset: "2025-12-03" }
      },
      specialArise: {
        lastDate: null,
        countToday: 0,
      },
    };

    // Shadow ranks (matching Solo Leveling rank system)
    this.shadowRanks = [
      'E',
      'D',
      'C',
      'B',
      'A',
      'S',
      'SS',
      'SSS',
      'SSS+',
      'NH',
      'Monarch',
      'Monarch+',
      'Shadow Monarch',
    ];

    // Shadow roles with their abilities and effects
    this.shadowRoles = {
      tank: {
        name: 'Tank',
        description: 'High defense, protects your messages',
        buffs: { vitality: 0.1, strength: 0.05 }, // +10% VIT, +5% STR per shadow
        effect: 'Message Protection', // Reduces message deletion chance
      },
      healer: {
        name: 'Healer',
        description: 'Restores HP and provides support',
        buffs: { vitality: 0.15, luck: 0.1 }, // +15% VIT, +10% LUK per shadow
        effect: 'HP Regeneration', // Restores HP over time
      },
      mage: {
        name: 'Mage',
        description: 'Powerful magic attacks, boosts XP',
        buffs: { intelligence: 0.15, agility: 0.05 }, // +15% INT, +5% AGI per shadow
        effect: 'XP Amplification', // Increases XP gain
      },
      assassin: {
        name: 'Assassin',
        description: 'High crit chance and stealth',
        buffs: { agility: 0.2, strength: 0.05 }, // +20% AGI, +5% STR per shadow
        effect: 'Crit Enhancement', // Increases crit chance
      },
      ranger: {
        name: 'Ranger',
        description: 'Long-range attacks, boosts collection',
        buffs: { agility: 0.1, intelligence: 0.1 }, // +10% AGI, +10% INT per shadow
        effect: 'Collection Boost', // Increases shadow extraction chance
      },
      knight: {
        name: 'Knight',
        description: 'Balanced warrior, all-around buffs',
        buffs: { strength: 0.1, agility: 0.1, vitality: 0.1 }, // +10% STR/AGI/VIT per shadow
        effect: 'Balanced Power', // General stat boost
      },
      berserker: {
        name: 'Berserker',
        description: 'High damage, low defense',
        buffs: { strength: 0.2, vitality: -0.05 }, // +20% STR, -5% VIT per shadow
        effect: 'Damage Boost', // Increases damage/XP multiplier
      },
      support: {
        name: 'Support',
        description: 'Buffs allies and provides utility',
        buffs: { luck: 0.15, intelligence: 0.1 }, // +15% LUK, +10% INT per shadow
        effect: 'Luck Amplification', // Increases luck-based bonuses
      },
      // ========================================================================
      // MAGIC BEAST ROLES - 100% DUNGEON-ONLY EXTRACTION
      // Based on Solo Leveling lore: actual monsters, not humanoid shadows
      // These can ONLY be extracted from dungeon mobs/bosses!
      // Classified by species/family for biome-specific spawning
      // ========================================================================

      // INSECT FAMILY - Forest, Cavern biomes
      ant: {
        name: 'Ant',
        description: 'Insect-type beast - High numbers, coordinated attacks',
        buffs: { strength: 0.12, agility: 0.12 },
        effect: 'Swarm Tactics',
        isMagicBeast: true,
        family: 'insect',
      },
      // BEAST FAMILY - Forest, Arctic biomes
      bear: {
        name: 'Bear',
        description: 'Beast-type - Raw power and endurance',
        buffs: { strength: 0.18, vitality: 0.12 },
        effect: 'Berserker Rage',
        isMagicBeast: true,
        family: 'beast',
      },
      wolf: {
        name: 'Wolf',
        description: 'Pack hunter - Speed and coordination',
        buffs: { agility: 0.15, strength: 0.1 },
        effect: 'Pack Hunter',
        isMagicBeast: true,
        family: 'beast',
      },

      // INSECT FAMILY - Forest, Cavern biomes
      spider: {
        name: 'Spider',
        description: 'Arachnid-type - Web traps and venom',
        buffs: { agility: 0.13, intelligence: 0.12 },
        effect: 'Web Trap',
        isMagicBeast: true,
        family: 'insect',
      },
      centipede: {
        name: 'Centipede',
        description: 'Multi-legged horror - Poison and speed',
        buffs: { agility: 0.15, intelligence: 0.1 },
        effect: 'Poison Sting',
        isMagicBeast: true,
        family: 'insect',
      },

      // CONSTRUCT FAMILY - Cavern, Ancient Ruins biomes
      golem: {
        name: 'Golem',
        description: 'Stone construct - Extreme defense, slow',
        buffs: { vitality: 0.25, strength: 0.08 },
        effect: 'Stone Skin',
        isMagicBeast: true,
        family: 'construct',
      },

      // REPTILE FAMILY - Swamp biomes
      serpent: {
        name: 'Serpent',
        description: 'Snake-type - Venom and cunning',
        buffs: { intelligence: 0.14, agility: 0.12 },
        effect: 'Venom Strike',
        isMagicBeast: true,
        family: 'reptile',
      },
      naga: {
        name: 'Naga',
        description: 'Serpent humanoid - Magic and agility',
        buffs: { intelligence: 0.15, agility: 0.13 },
        effect: 'Water Magic',
        isMagicBeast: true,
        family: 'reptile',
      },

      // DRAGON FAMILY - Mountains, Volcano, Dark Abyss (NH+ ONLY!)
      wyvern: {
        name: 'Wyvern',
        description: 'Flying beast - Aerial superiority',
        buffs: { agility: 0.16, strength: 0.14 },
        effect: 'Aerial Strike',
        isMagicBeast: true,
        family: 'dragon',
        minRank: 'S', // Wyverns start at S-rank
      },
      dragon: {
        name: 'Dragon',
        description: 'Apex predator - Supreme in all aspects',
        buffs: { strength: 0.15, intelligence: 0.15, agility: 0.1 },
        effect: 'Dragon Dominance',
        isMagicBeast: true,
        family: 'dragon',
        minRank: 'NH', // DRAGONS ONLY IN NH+ DUNGEONS!
      },

      // GIANT FAMILY - Mountains, Tribal Grounds biomes
      titan: {
        name: 'Titan',
        description: 'Ancient giant - Colossal power and endurance',
        buffs: { strength: 0.2, vitality: 0.18 },
        effect: 'Titan Force',
        isMagicBeast: true,
        family: 'giant',
        minRank: 'A', // Titans start at A-rank
      },
      giant: {
        name: 'Giant',
        description: 'Massive humanoid - Overwhelming size and strength',
        buffs: { strength: 0.17, vitality: 0.14 },
        effect: 'Giant Slam',
        isMagicBeast: true,
        family: 'giant',
      },

      // ANCIENT FAMILY - Ancient Ruins biomes
      elf: {
        name: 'Elf',
        description: 'Ancient race - Magic mastery and precision',
        buffs: { intelligence: 0.16, agility: 0.14, luck: 0.1 },
        effect: 'Ancient Magic',
        isMagicBeast: true,
        family: 'ancient',
      },

      // DEMON FAMILY - Volcano, Dark Abyss biomes
      demon: {
        name: 'Demon',
        description: 'Dark entity - Chaos and destruction',
        buffs: { strength: 0.16, intelligence: 0.16 },
        effect: 'Dark Power',
        isMagicBeast: true,
        family: 'demon',
        minRank: 'B', // Demons start at B-rank
      },

      // UNDEAD FAMILY - Cavern, Swamp, Ancient Ruins, Dark Abyss biomes
      ghoul: {
        name: 'Ghoul',
        description: 'Undead horror - Life drain and regeneration',
        buffs: { vitality: 0.14, intelligence: 0.11 },
        effect: 'Life Drain',
        isMagicBeast: true,
        family: 'undead',
      },

      // HUMANOID-BEAST FAMILY - Tribal Grounds, Volcano biomes
      orc: {
        name: 'Orc',
        description: 'Brutal warrior - Savage strength and ferocity',
        buffs: { strength: 0.16, vitality: 0.1 },
        effect: 'Savage Fury',
        isMagicBeast: true,
        family: 'humanoid-beast',
      },
      ogre: {
        name: 'Ogre',
        description: 'Brute monster - Raw strength, low intelligence',
        buffs: { strength: 0.19, vitality: 0.13 },
        effect: 'Crushing Blow',
        isMagicBeast: true,
        family: 'humanoid-beast',
      },

      // ICE FAMILY - Arctic biomes (exclusive!)
      yeti: {
        name: 'Yeti',
        description: 'Ice beast - Frozen fury and endurance',
        buffs: { strength: 0.15, vitality: 0.15 },
        effect: 'Frost Aura',
        isMagicBeast: true,
        family: 'ice',
      },
    };

    // Stat weight templates per role (used to generate per-shadow stats)
    // Higher weight = that role favors that stat more
    // EXTREME SPECIALIZATION: Strong stats are VERY strong, weak stats are VERY weak
    this.shadowRoleStatWeights = {
      tank: {
        strength: 0.9, // Above average
        agility: 0.3, // WEAK (slow, heavy armor)
        intelligence: 0.2, // VERY WEAK (brute)
        vitality: 1.5, // VERY STRONG (tank)
        luck: 0.3, // WEAK
      },
      healer: {
        strength: 0.2, // VERY WEAK (support, not fighter)
        agility: 0.4, // WEAK
        intelligence: 1.3, // VERY STRONG (magic knowledge)
        vitality: 1.1, // STRONG (support endurance)
        luck: 1.0, // STRONG (healing luck)
      },
      mage: {
        strength: 0.15, // EXTREMELY WEAK (glass cannon)
        agility: 0.5, // WEAK (not mobile)
        intelligence: 1.6, // EXTREMELY STRONG (magic power)
        vitality: 0.4, // WEAK (fragile)
        luck: 0.6, // Below average
      },
      assassin: {
        strength: 0.7, // Above average (needs damage)
        agility: 1.7, // EXTREMELY STRONG (speed/stealth)
        intelligence: 0.5, // WEAK (not thinker)
        vitality: 0.3, // VERY WEAK (glass cannon)
        luck: 0.8, // Above average (crit)
      },
      ranger: {
        strength: 0.6, // Below average
        agility: 1.3, // VERY STRONG (ranged mobility)
        intelligence: 1.0, // STRONG (tactical)
        vitality: 0.5, // WEAK (light armor)
        luck: 0.8, // Above average (accuracy)
      },
      knight: {
        strength: 1.1, // STRONG (balanced warrior)
        agility: 0.9, // Above average
        intelligence: 0.6, // Below average
        vitality: 1.1, // STRONG (armor)
        luck: 0.5, // WEAK
      },
      berserker: {
        strength: 1.8, // EXTREMELY STRONG (raw power)
        agility: 0.7, // Below average (heavy weapons)
        intelligence: 0.15, // EXTREMELY WEAK (brute force)
        vitality: 0.5, // WEAK (reckless)
        luck: 0.4, // WEAK
      },
      support: {
        strength: 0.25, // VERY WEAK (non-combatant)
        agility: 0.6, // Below average
        intelligence: 1.2, // VERY STRONG (strategy)
        vitality: 0.7, // Below average
        luck: 1.4, // EXTREMELY STRONG (buffs)
      },
      // MAGIC BEAST STAT WEIGHTS - Dungeon-Only Shadows
      ant: {
        strength: 1.1, // STRONG (powerful mandibles)
        agility: 1.2, // VERY STRONG (fast insect)
        intelligence: 0.4, // WEAK (instinct-driven)
        vitality: 0.9, // Above average (exoskeleton)
        luck: 0.5, // WEAK
      },
      bear: {
        strength: 1.6, // EXTREMELY STRONG (raw power)
        agility: 0.4, // WEAK (heavy, slow)
        intelligence: 0.3, // VERY WEAK (beast)
        vitality: 1.4, // VERY STRONG (thick hide)
        luck: 0.4, // WEAK
      },
      wolf: {
        strength: 1.0, // STRONG (predator)
        agility: 1.5, // EXTREMELY STRONG (pack hunter)
        intelligence: 0.7, // Below average (pack tactics)
        vitality: 0.8, // Above average
        luck: 0.6, // Below average
      },
      spider: {
        strength: 0.6, // Below average
        agility: 1.4, // VERY STRONG (eight legs)
        intelligence: 1.1, // STRONG (trap tactics)
        vitality: 0.5, // WEAK (fragile body)
        luck: 0.8, // Above average (web luck)
      },
      golem: {
        strength: 1.3, // VERY STRONG (stone fists)
        agility: 0.2, // EXTREMELY WEAK (slow construct)
        intelligence: 0.1, // EXTREMELY WEAK (mindless)
        vitality: 1.9, // EXTREMELY STRONG (stone body)
        luck: 0.3, // VERY WEAK
      },
      wyvern: {
        strength: 1.4, // VERY STRONG (claws/bite)
        agility: 1.6, // EXTREMELY STRONG (aerial)
        intelligence: 0.6, // Below average (beast)
        vitality: 1.0, // STRONG (dragon scales)
        luck: 0.7, // Below average
      },
      serpent: {
        strength: 0.8, // Above average (constrictor)
        agility: 1.3, // VERY STRONG (slithering)
        intelligence: 1.1, // STRONG (cunning predator)
        vitality: 0.7, // Below average (reptile)
        luck: 0.9, // Above average (venom luck)
      },
      dragon: {
        strength: 1.7, // EXTREMELY STRONG (apex)
        agility: 1.4, // VERY STRONG (flying)
        intelligence: 1.5, // VERY STRONG (ancient wisdom)
        vitality: 1.6, // EXTREMELY STRONG (dragon scales)
        luck: 1.2, // VERY STRONG (legendary)
      },
      orc: {
        strength: 1.5, // EXTREMELY STRONG (brutal warrior)
        agility: 0.7, // Below average (heavy build)
        intelligence: 0.3, // VERY WEAK (savage)
        vitality: 1.2, // VERY STRONG (tough skin)
        luck: 0.5, // WEAK
      },
      naga: {
        strength: 0.8, // Above average (serpent tail)
        agility: 1.3, // VERY STRONG (slithering)
        intelligence: 1.4, // VERY STRONG (water magic)
        vitality: 0.9, // Above average (scales)
        luck: 1.0, // STRONG
      },
      titan: {
        strength: 1.8, // EXTREMELY STRONG (colossal)
        agility: 0.3, // VERY WEAK (massive size)
        intelligence: 0.4, // WEAK (ancient but simple)
        vitality: 1.7, // EXTREMELY STRONG (titan endurance)
        luck: 0.6, // Below average
      },
      giant: {
        strength: 1.6, // EXTREMELY STRONG (massive)
        agility: 0.4, // WEAK (large, slow)
        intelligence: 0.5, // WEAK (brutish)
        vitality: 1.5, // VERY STRONG (giant constitution)
        luck: 0.5, // WEAK
      },
      elf: {
        strength: 0.5, // WEAK (elegant, not brutish)
        agility: 1.5, // EXTREMELY STRONG (graceful)
        intelligence: 1.6, // EXTREMELY STRONG (ancient magic)
        vitality: 0.6, // Below average (slender)
        luck: 1.3, // VERY STRONG (blessed)
      },
      demon: {
        strength: 1.5, // EXTREMELY STRONG (dark power)
        agility: 1.2, // VERY STRONG (supernatural speed)
        intelligence: 1.4, // VERY STRONG (dark magic)
        vitality: 1.1, // STRONG (demonic endurance)
        luck: 0.8, // Above average (chaos)
      },
      ghoul: {
        strength: 0.9, // Above average (undead strength)
        agility: 1.1, // STRONG (quick movements)
        intelligence: 0.8, // Above average (cunning)
        vitality: 1.3, // VERY STRONG (undead endurance)
        luck: 0.6, // Below average
      },
      ogre: {
        strength: 1.7, // EXTREMELY STRONG (brutal power)
        agility: 0.3, // VERY WEAK (clumsy)
        intelligence: 0.2, // EXTREMELY WEAK (stupid)
        vitality: 1.4, // VERY STRONG (thick hide)
        luck: 0.4, // WEAK
      },
      centipede: {
        strength: 1.0, // STRONG (many legs)
        agility: 1.4, // VERY STRONG (multi-legged)
        intelligence: 0.5, // WEAK (insect mind)
        vitality: 1.1, // STRONG (exoskeleton)
        luck: 0.7, // Below average
      },
      yeti: {
        strength: 1.4, // VERY STRONG (ice beast)
        agility: 0.8, // Above average (mountain predator)
        intelligence: 0.6, // Below average (beast)
        vitality: 1.5, // EXTREMELY STRONG (frost endurance)
        luck: 0.7, // Below average
      },
    };

    this.settings = this.defaultSettings;
    this.soloPlugin = null;

    // IndexedDB storage manager
    this.storageManager = null;
    this.userId = null;

    // UI elements
    this.shadowArmyButton = null;
    this.shadowArmyModal = null;
    this.toolbarObserver = null;
    this.toolbarCheckInterval = null;
    this._shadowArmyButtonRetryCount = 0;

    // Rank probability multipliers (lower ranks easier, higher ranks exponentially harder)
    this.rankProbabilityMultipliers = {
      E: 10.0, // Very common (10x base chance)
      D: 5.0, // Common (5x base chance)
      C: 2.5, // Uncommon (2.5x base chance)
      B: 1.0, // Normal (1x base chance)
      A: 0.5, // Rare (0.5x base chance)
      S: 0.2, // Very rare (0.2x base chance)
      SS: 0.1, // Extremely rare (0.1x base chance)
      SSS: 0.05, // Ultra rare (0.05x base chance)
      'SSS+': 0.02, // Legendary (0.02x base chance)
      NH: 0.01, // Mythic (0.01x base chance)
      Monarch: 0.005, // Near impossible (0.005x base chance)
      'Monarch+': 0.001, // Almost never (0.001x base chance)
      'Shadow Monarch': 0.0001, // Once in a lifetime (0.0001x base chance)
    };

    // Exponential stat multipliers per rank (1.5x per rank)
    // Each rank is exponentially stronger than the previous:
    // - E rank: Base (1.0x)
    // - D rank: 1.5x stronger than E
    // - C rank: 2.25x stronger than E (1.5^2)
    // - B rank: 3.375x stronger than E (1.5^3)
    // - A rank: 5.0625x stronger than E (1.5^4)
    // - S rank: 7.59375x stronger than E (1.5^5)
    // - SS rank: 11.390625x stronger than E (1.5^6)
    // - SSS rank: 17.0859375x stronger than E (1.5^7)
    // - SSS+ rank: 25.62890625x stronger than E (1.5^8)
    // - NH rank: 38.443359375x stronger than E (1.5^9)
    // - Monarch rank: 57.6650390625x stronger than E (1.5^10)
    // - Monarch+ rank: 86.49755859375x stronger than E (1.5^11)
    // - Shadow Monarch rank: 129.746337890625x stronger than E (1.5^12)
    this.rankStatMultipliers = {
      E: 1.0, // Base (100%) - 1.5^0
      D: 1.5, // 150% (1.5x) - 1.5^1
      C: 2.25, // 225% (1.5^2)
      B: 3.375, // 337.5% (1.5^3)
      A: 5.0625, // 506.25% (1.5^4)
      S: 7.59375, // 759.375% (1.5^5)
      SS: 11.390625, // 1139% (1.5^6)
      SSS: 17.0859375, // 1708% (1.5^7)
      'SSS+': 25.62890625, // 2562% (1.5^8)
      NH: 38.443359375, // 3844% (1.5^9)
      Monarch: 57.6650390625, // 5766% (1.5^10)
      'Monarch+': 86.49755859375, // 8649% (1.5^11)
      'Shadow Monarch': 129.746337890625, // 12974% (1.5^12)
    };
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  // ============================================================================
  // PLUGIN LIFECYCLE - Start & Stop Operations
  // ============================================================================
  /**
   * Start the ShadowArmy plugin
   * Operations:
   * 1. Get Discord user ID for storage isolation
   * 2. Initialize IndexedDB storage manager
   * 3. Migrate from localStorage if needed
   * 4. Load saved settings from localStorage (config only)
   * 5. Inject CSS styles for UI components
   * 6. Integrate with SoloLevelingStats plugin
   * 7. Set up message listener for shadow extraction
   */
  async start() {
    // Get user ID for storage isolation
    this.userId = await this.getUserId();

    // Initialize IndexedDB storage
    try {
      this.storageManager = new ShadowStorageManager(this.userId);
      await this.storageManager.init();

      // Migrate from localStorage if needed
      const migrationResult = await this.storageManager.migrateFromLocalStorage();
      if (migrationResult.migrated) {
        console.log(`ShadowArmy: Migrated ${migrationResult.count} shadows to IndexedDB`);
      }
    } catch (error) {
      console.warn(
        'ShadowArmy: IndexedDB initialization failed, using localStorage fallback',
        error
      );
      this.storageManager = null;
    }

    this.loadSettings();

    this.injectCSS();
    this.integrateWithSoloLeveling();
    this.setupMessageListener();
    this.createShadowArmyButton();

    // Retry button creation after delays to ensure Discord UI is ready
    setTimeout(() => {
      if (!this.shadowArmyButton || !document.body.contains(this.shadowArmyButton)) {
        console.log('[ShadowArmy] Retrying button creation...');
        this.createShadowArmyButton();
      }
    }, 2000);

    // Additional retry after longer delay (for plugin re-enabling)
    setTimeout(() => {
      if (!this.shadowArmyButton || !document.body.contains(this.shadowArmyButton)) {
        console.log('[ShadowArmy] Final retry for button creation...');
        this.createShadowArmyButton();
      }
    }, 5000);

    // Recalculate all shadows with new exponential formula (one-time migration)
    try {
      await this.recalculateAllShadows();
    } catch (error) {
      console.error('ShadowArmy: Error recalculating shadows during startup', error);
      // Log error but don't prevent plugin from starting
      // The migration can be retried on next start
    }

    // Fix shadow base stats to match rank baselines (v4 migration)
    try {
      await this.fixShadowBaseStatsToRankBaselines();
    } catch (error) {
      console.error('ShadowArmy: Error fixing shadow base stats', error);
    }

    // Start natural growth processing (runs every hour)
    this.startNaturalGrowthInterval();

  }

  /**
   * Start natural growth interval (processes every hour)
   */
  startNaturalGrowthInterval() {
    if (this.naturalGrowthInterval) {
      clearInterval(this.naturalGrowthInterval);
    }

    // Process immediately on start
    this.processNaturalGrowthForAllShadows();

    // Then process every hour
    this.naturalGrowthInterval = setInterval(() => {
      this.processNaturalGrowthForAllShadows();
    }, 60 * 60 * 1000); // 1 hour

  }

  /**
   * Stop the ShadowArmy plugin and clean up resources
   * Operations:
   * 1. Remove message listener to prevent memory leaks
   * 2. Remove injected CSS styles
   * 3. Clear natural growth interval
   */
  stop() {
    this.removeMessageListener();
    this.removeCSS();
    this.removeShadowArmyButton();
    this.closeShadowArmyModal();

    // Clear retry timeout if pending
    if (this._shadowArmyButtonRetryTimeout) {
      clearTimeout(this._shadowArmyButtonRetryTimeout);
      this._shadowArmyButtonRetryTimeout = null;
    }

    // Clear natural growth interval
    if (this.naturalGrowthInterval) {
      clearInterval(this.naturalGrowthInterval);
      this.naturalGrowthInterval = null;
    }

    // Close IndexedDB connection
    if (this.storageManager) {
      this.storageManager.close();
      this.storageManager = null;
    }
  }

  // ============================================================================
  // USER ID DETECTION
  // ============================================================================

  /**
   * Get Discord user ID for storage isolation
   * Operations:
   * 1. Try to get user ID from React fiber (similar to SoloLevelingStats)
   * 2. Try BetterDiscord UserStore module
   * 3. Fallback to 'default' if unavailable
   */
  async getUserId() {
    try {
      // Method 1: Try window.Discord (most reliable)
      if (window.Discord && window.Discord.user && window.Discord.user.id) {
        return window.Discord.user.id;
      }

      // Method 2: Try BetterDiscord Webpack UserStore
      const UserStore =
        BdApi.Webpack?.getStore?.('UserStore') ||
        BdApi.Webpack?.getModule?.((m) => m?.getCurrentUser);
      if (UserStore && UserStore.getCurrentUser) {
        const currentUser = UserStore.getCurrentUser();
        if (currentUser && currentUser.id) {
          return currentUser.id;
        }
      }

      // Method 3: Try React fiber traversal (deprioritized)
      const userElement =
        document.querySelector('[class*="avatar"]') || document.querySelector('[class*="user"]');
      if (userElement) {
        const reactKey = Object.keys(userElement).find(
          (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
        );
        if (reactKey) {
          let fiber = userElement[reactKey];
          for (let i = 0; i < 10 && fiber; i++) {
            if (fiber.memoizedProps?.user?.id) {
              return fiber.memoizedProps.user.id;
            }
            fiber = fiber.return;
          }
        }
      }
    } catch (error) {
      console.warn('ShadowArmy: Failed to get user ID', error);
    }

    // Fallback to default
    return 'default';
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  /**
   * Load settings from localStorage with validation and defaults
   * Operations:
   * 1. Attempt to load saved settings using BdApi.Data
   * 2. Merge with default settings to ensure all keys exist
   * 3. Validate arrays (shadows, favoriteShadowIds)
   * 4. Backfill missing extraction config keys
   * 5. Initialize specialArise tracking if missing
   * 6. Handle errors gracefully with fallback to defaults
   */
  loadSettings() {
    try {
      // Use user-specific storage key
      const storageKey = this.userId ? `settings_${this.userId}` : 'settings';
      const saved = BdApi.Data.load('ShadowArmy', storageKey);
      if (saved) {
        this.settings = { ...this.defaultSettings, ...saved };
        // Ensure shadows array exists (for fallback/display)
        if (!Array.isArray(this.settings.shadows)) {
          this.settings.shadows = [];
        }
        if (!this.settings.extractionConfig) {
          this.settings.extractionConfig = { ...this.defaultSettings.extractionConfig };
        } else {
          // Backfill any missing config keys
          this.settings.extractionConfig = {
            ...this.defaultSettings.extractionConfig,
            ...this.settings.extractionConfig,
          };
        }
        if (!this.settings.specialArise) {
          this.settings.specialArise = { ...this.defaultSettings.specialArise };
        }
        // Initialize dungeon extraction attempts tracking
        if (!this.settings.dungeonExtractionAttempts) {
          this.settings.dungeonExtractionAttempts = {};
        }
      }
    } catch (error) {
      console.error('ShadowArmy: Error loading settings', error);
      this.settings = { ...this.defaultSettings };
    }
  }

  /**
   * Save current settings to localStorage
   * Operations:
   * 1. Serialize settings object to JSON
   * 2. Save using BdApi.Data.save()
   * 3. Handle errors gracefully with console logging
   *
   * NOTE: For large shadow arrays (5,000+), this can cause UI blocking.
   * Consider implementing IndexedDB storage for better performance.
   */
  saveSettings() {
    try {
      // Use user-specific storage key
      const storageKey = this.userId ? `settings_${this.userId}` : 'settings';
      BdApi.Data.save('ShadowArmy', storageKey, this.settings);
    } catch (error) {
      console.error('ShadowArmy: Error saving settings', error);
    }
  }

  // ============================================================================
  // SOLO LEVELING INTEGRATION
  // ============================================================================

  /**
   * Integrate with SoloLevelingStats plugin to access user stats
   * Operations:
   * 1. Get SoloLevelingStats plugin instance via BdApi.Plugins
   * 2. Store reference for later use
   * 3. Log warning if plugin not found
   */
  integrateWithSoloLeveling() {
    // Get SoloLevelingStats plugin
    this.soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
    if (!this.soloPlugin) {
      console.warn('ShadowArmy: SoloLevelingStats plugin not found');
    }
  }

  /**
   * Get current Solo Leveling data (rank, level, stats, intelligence)
   * Operations:
   * 1. Ensure solo plugin is loaded (re-integrate if needed)
   * 2. Get plugin instance (handle both instance and direct access)
   * 3. Extract rank, level, stats, and intelligence
   * 4. Return null if plugin unavailable or data missing
   */
  getSoloLevelingData() {
    if (!this.soloPlugin) {
      this.integrateWithSoloLeveling();
    }
    if (!this.soloPlugin) return null;

    const instance = this.soloPlugin.instance || this.soloPlugin;
    if (!instance || !instance.settings) return null;

    return {
      rank: instance.settings.rank || 'E',
      level: instance.settings.level || 1,
      stats: instance.settings.stats || {},
      intelligence: instance.settings.stats?.intelligence || 0,
    };
  }

  // ============================================================================
  // MESSAGE LISTENING & EXTRACTION
  // ============================================================================

  /**
   * Set up message listener to trigger shadow extraction on message send
   * Operations:
   * 1. Get SoloLevelingStats plugin instance
   * 2. Patch processMessageSent method to call extraction after processing
   * 3. Store original method for restoration on stop
   * 4. Optionally subscribe to messageSent events if available
   */
  setupMessageListener() {
    // Hook into SoloLevelingStats processMessageSent
    if (this.soloPlugin) {
      const instance = this.soloPlugin.instance || this.soloPlugin;
      if (instance) {
        // Patch processMessageSent to call shadow extraction
        this.originalProcessMessage = instance.processMessageSent;
        if (this.originalProcessMessage) {
          instance.processMessageSent = (messageText) => {
            const result = this.originalProcessMessage.call(instance, messageText);
            // Attempt shadow extraction after message is processed
            setTimeout(() => this.attemptShadowExtraction(), 100);
            return result;
          };
        }

        // Also listen to events if available
        if (typeof instance.on === 'function') {
          this.messageUnsubscribe = instance.on('messageSent', () => {
            this.attemptShadowExtraction();
          });
        }
      }
    }
  }

  /**
   * Remove message listener and restore original function
   * Operations:
   * 1. Unsubscribe from messageSent events if subscribed
   * 2. Restore original processMessageSent method
   * 3. Clean up references to prevent memory leaks
   */
  removeMessageListener() {
    if (this.messageUnsubscribe) {
      this.messageUnsubscribe();
    }
    // Restore original function
    if (this.soloPlugin && this.originalProcessMessage) {
      const instance = this.soloPlugin.instance || this.soloPlugin;
      if (instance && instance.processMessageSent) {
        instance.processMessageSent = this.originalProcessMessage;
      }
    }
  }

  /**
   * Attempt to extract a shadow when sending a message
   * Chance based on Intelligence stat, stats influence, and Solo Leveling lore constraints
   * Operations:
   * 1. Get current Solo Leveling data (rank, level, stats, intelligence)
   * 2. Apply rate limiting (max extractions per minute)
   * 3. Determine extractable ranks based on user rank (lore: can't extract significantly stronger)
   * 4. Calculate extraction chance with stats influence for each extractable rank
   * 5. Select target rank based on weighted probabilities
   * 6. Check extraction attempt limit (lore: max 3 attempts per target)
   * 7. Roll for extraction with final chance
   * 8. Grant small XP to favorite shadows regardless of extraction
   * 9. Calculate special ARISE chance (Intelligence + Perception)
   * 10. Roll for special ARISE event if within daily limits
   */
  async attemptShadowExtraction() {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData) return;

      const intelligence = soloData.intelligence || 0;
      const perception = soloData.stats?.perception || 0;
      const strength = soloData.stats?.strength || 0;
      const rank = soloData.rank;
      const level = soloData.level;
      const stats = soloData.stats;

      const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

      // Simple rate limiting: cap extractions per minute
      if (!this.extractionTimestamps) this.extractionTimestamps = [];
      const now = Date.now();
      this.extractionTimestamps = this.extractionTimestamps.filter((t) => now - t < 60 * 1000);
      if (this.extractionTimestamps.length >= (cfg.maxExtractionsPerMinute || 20)) {
        return;
      }

      // Determine extractable ranks (lore: can't extract significantly stronger - max 2 ranks above)
      const extractableRanks = this.determineExtractableRanks(rank, stats);
      if (extractableRanks.length === 0) {
        return; // No extractable ranks
      }

      // Calculate extraction chance for each rank with stats influence
      // Also calculate target strength based on rank for more accurate extraction chances
      const rankChances = extractableRanks.map((r) => {
        // Estimate target strength based on rank (for better extraction calculation)
        const targetRankIndex = this.shadowRanks.indexOf(r.rank);
        const estimatedTargetStrength = this.estimateTargetStrengthByRank(
          r.rank,
          targetRankIndex,
          stats
        );

        const chance = this.calculateExtractionChance(
          rank,
          stats,
          r.rank,
          estimatedTargetStrength, // Use estimated target strength instead of 0
          intelligence,
          perception,
          strength
        );
        return { rank: r.rank, chance, multiplier: r.multiplier, probability: chance };
      });

      // Select target rank based on weighted probabilities
      const selectedRank = this.selectRankByProbability(rankChances);
      if (!selectedRank) return;

      // Use new retry system: generate shadow first, try extraction up to 3 times
      const extractedShadow = await this.attemptExtractionWithRetries(
        rank,
        level,
        stats,
        selectedRank,
        null, // Will generate stats
        null, // Will calculate strength
        false // Use cap for regular messages
      );

      if (extractedShadow) {
        // Show extraction animation
        this.showExtractionAnimation(extractedShadow);
      }

      // Give a tiny amount of XP to favorite shadows per message regardless of extraction
      await this.grantShadowXP(1, 'message');

      // Second independent roll: chance for special ARISE event
      // Perception stat used (renamed from Luck)
      const specialChanceRaw =
        (cfg.specialBaseChance || 0.01) +
        intelligence * (cfg.specialIntMultiplier || 0.003) +
        perception * (cfg.specialLuckMultiplier || 0.002);

      const specialChance = Math.min(cfg.specialMaxChance || 0.3, specialChanceRaw);

      if (specialChance > 0) {
        if (this.canTriggerSpecialArise() && Math.random() < specialChance) {
          // Special ARISE: can extract up to 2 ranks higher
          const userRankIndex = this.shadowRanks.indexOf(rank);
          const boostedRankIndex = Math.min(userRankIndex + 2, this.shadowRanks.length - 1);
          const boostedRank = this.shadowRanks[boostedRankIndex];

          // Special ARISE: extract 3-7 shadows
          const count = 3 + Math.floor(Math.random() * 5);
          const extractedShadows = [];

          for (let i = 0; i < count; i++) {
            const shadow = await this.attemptExtractionWithRetries(
              rank,
              level,
              stats,
              boostedRank,
              null,
              null,
              false // Use cap for regular messages
            );
            if (shadow) {
              extractedShadows.push(shadow);
            }
          }

          if (extractedShadows.length > 0) {
            await this.grantShadowXP(10, 'special_arise');
            this.markSpecialAriseUsed();
            // Show animation for last shadow
            this.showExtractionAnimation(extractedShadows[extractedShadows.length - 1]);
          }
        }
      }
    } catch (error) {
      console.error('ShadowArmy: Error attempting extraction', error);
    }
  }

  /**
   * Attempt extraction with retry logic (up to 3 attempts)
   * Generates shadow first, then tries to extract it
   * Only saves to database if successful
   * Operations:
   * 1. Generate shadow with target rank and stats
   * 2. Calculate extraction chance based on shadow stats vs user stats
   * 3. Try extraction up to 3 times
   * 4. If successful, save shadow to database
   * 5. If fails 3 times, discard shadow
   * @param {string} userRank - User's current rank
   * @param {number} userLevel - User's current level
   * @param {Object} userStats - User's stats
   * @param {string} targetRank - Target shadow rank
   * @param {Object} targetStats - Target shadow stats (optional, will generate if not provided)
   * @param {number} targetStrength - Target shadow strength (optional)
   * @param {boolean} skipCap - Skip extraction cap (for dungeons)
   * @returns {Object|null} - Extracted shadow or null if failed
   */
  async attemptExtractionWithRetries(
    userRank,
    userLevel,
    userStats,
    targetRank,
    targetStats = null,
    targetStrength = null,
    skipCap = false,
    fromDungeon = false,
    beastFamilies = null
  ) {
    const intelligence = userStats.intelligence || 0;
    const perception = userStats.perception || 0;
    const strength = userStats.strength || 0;

    // RANK VALIDATION: Ensure target rank is not too high
    const userRankIndex = this.shadowRanks.indexOf(userRank);
    const targetRankIndex = this.shadowRanks.indexOf(targetRank);
    const rankDiff = targetRankIndex - userRankIndex;

    // STRICT ENFORCEMENT: Cannot extract more than 1 rank above
    if (rankDiff > 1) {
      console.log(
        `[ShadowArmy] ❌ Extraction blocked: [${targetRank}] is too high for ${userRank}-rank hunter (max: ${
          this.shadowRanks[Math.min(userRankIndex + 1, this.shadowRanks.length - 1)]
        })`
      );
      return null; // Impossible to extract
    }

    // Generate shadow first (with target stats if provided)
    let shadow;
    if (targetStats && targetStrength != null) {
      // Use provided stats for dungeon mobs
      // MAGIC BEASTS: 100% from dungeons (filtered by biome), 0% from messages!
      let roleKey;
      if (fromDungeon) {
        // Select magic beast role (dungeon-only, 100% magic beast)
        let availableBeastRoles = Object.keys(this.shadowRoles).filter(
          key => this.shadowRoles[key].isMagicBeast
        );

        // Filter by biome families if provided
        if (beastFamilies && beastFamilies.length > 0) {
          availableBeastRoles = availableBeastRoles.filter(key => {
            const beast = this.shadowRoles[key];
            return beastFamilies.includes(beast.family);
          });
        }

        // Filter by rank restrictions (e.g., dragons only NH+)
        const rankIndex = this.shadowRanks.indexOf(targetRank);
        availableBeastRoles = availableBeastRoles.filter(key => {
          const beast = this.shadowRoles[key];
          if (!beast.minRank) return true; // No restriction
          const minRankIndex = this.shadowRanks.indexOf(beast.minRank);
          return rankIndex >= minRankIndex; // Only if dungeon rank meets minimum
        });

        // Fallback: If no beasts available after filtering, use all non-restricted beasts
        if (availableBeastRoles.length === 0) {
          availableBeastRoles = Object.keys(this.shadowRoles).filter(
            key => this.shadowRoles[key].isMagicBeast && !this.shadowRoles[key].minRank
          );
        }

        roleKey = availableBeastRoles[Math.floor(Math.random() * availableBeastRoles.length)];
      } else {
        // Select humanoid role (message-based extraction only)
        const humanoidRoles = Object.keys(this.shadowRoles).filter(
          key => !this.shadowRoles[key].isMagicBeast
        );
        roleKey = humanoidRoles[Math.floor(Math.random() * humanoidRoles.length)];
      }
      const role = this.shadowRoles[roleKey];

      shadow = {
        id: `shadow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        rank: targetRank,
        role: roleKey,
        roleName: role.name,
        strength: targetStrength,
        extractedAt: Date.now(),
        level: 1,
        xp: 0,
        baseStats: targetStats,
        growthStats: {
          strength: 0,
          agility: 0,
          intelligence: 0,
          vitality: 0,
          luck: 0,
        },
        naturalGrowthStats: {
          strength: 0,
          agility: 0,
          intelligence: 0,
          vitality: 0,
          luck: 0,
        },
        totalCombatTime: 0,
        lastNaturalGrowth: Date.now(),
        ownerLevelAtExtraction: userLevel,
      };
    } else {
      // Generate shadow normally
      shadow = this.generateShadow(targetRank, userLevel, userStats);
      targetStrength = shadow.strength;
      targetStats = shadow.baseStats;
    }

    // Try extraction up to 3 times
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Calculate extraction chance based on actual shadow stats
      const extractionChance = this.calculateExtractionChance(
        userRank,
        userStats,
        targetRank,
        targetStrength,
        intelligence,
        perception,
        strength,
        skipCap
      );

      // Roll for extraction
      const roll = Math.random();
      if (roll < extractionChance) {
        // Success! Save shadow to database
        if (this.storageManager) {
          try {
            await this.storageManager.saveShadow(shadow);
          } catch (error) {
            console.error('ShadowArmy: Failed to save shadow to IndexedDB', error);
            // Fallback to localStorage
            if (!this.settings.shadows) this.settings.shadows = [];
            this.settings.shadows.push(shadow);
          }
        } else {
          // Fallback to localStorage
          if (!this.settings.shadows) this.settings.shadows = [];
          this.settings.shadows.push(shadow);
        }

        const now = Date.now();
        this.settings.totalShadowsExtracted++;
        this.settings.lastExtractionTime = now;
        if (!this.extractionTimestamps) this.extractionTimestamps = [];
        this.extractionTimestamps.push(now);

        // Invalidate buff cache
        this.cachedBuffs = null;
        this.cachedBuffsTime = null;

        // Grant XP
        await this.grantShadowXP(2, 'extraction');

        this.saveSettings();
        this.updateUI();

        return shadow; // Success!
      }
    }

    // Failed all 3 attempts - discard shadow
    return null;
  }

  /**
   * Attempt shadow extraction from dungeon boss (with per-boss attempt limits)
   * Implements Solo Leveling lore: max 3 attempts per corpse (boss) per day
   * Operations:
   * 1. Check boss attempt limit (lore: max 3 attempts per corpse)
   * 2. Generate shadow with mob stats and rank
   * 3. Try extraction based on factors (no cap)
   * 4. Record attempt (success or failure counts toward limit)
   * 5. Return result with attempts remaining
   *
   * @param {string} bossId - Unique boss identifier (e.g., "dungeon_ice_cavern_boss_frost_dragon")
   * @param {string} userRank - User's current rank
   * @param {number} userLevel - User's current level
   * @param {Object} userStats - User's stats
   * @param {string} mobRank - Mob's rank
   * @param {Object} mobStats - Mob's stats
   * @param {number} mobStrength - Mob's strength
   * @returns {Object} - { success: boolean, shadow: Object|null, error: string|null, attemptsRemaining: number }
   */
  async attemptDungeonExtraction(
    bossId,
    userRank,
    userLevel,
    userStats,
    mobRank,
    mobStats,
    mobStrength,
    beastFamilies = null
  ) {
    // Check if can extract from this boss (lore: max 3 attempts per day)
    const canExtract = this.canExtractFromBoss(bossId);
    if (!canExtract.allowed) {
      return {
        success: false,
        shadow: null,
        error: canExtract.reason,
        attemptsRemaining: canExtract.attemptsRemaining,
      };
    }

    // Attempt extraction with retries (internal to this single attempt)
    const extractedShadow = await this.attemptExtractionWithRetries(
      userRank,
      userLevel,
      userStats,
      mobRank,
      mobStats,
      mobStrength,
      true, // skipCap = true for dungeons
      true, // fromDungeon = true (enables magic beast extraction)
      beastFamilies // Pass biome families for themed extraction
    );

    // Record attempt (counts both success and failure toward limit)
    this.recordBossExtractionAttempt(bossId, extractedShadow !== null);

    return {
      success: extractedShadow !== null,
      shadow: extractedShadow,
      error: extractedShadow ? null : 'Extraction failed',
      attemptsRemaining: this.getBossAttemptsRemaining(bossId),
    };
  }

  /**
   * Check if can extract from boss (Solo Leveling lore: max 3 attempts per corpse per day)
   * Operations:
   * 1. Initialize dungeonExtractionAttempts if needed
   * 2. Check for daily reset
   * 3. Return true if attempts < limit, false otherwise
   *
   * @param {string} bossId - Unique boss identifier
   * @returns {Object} - { allowed: boolean, reason: string|null, attemptsRemaining: number }
   */
  canExtractFromBoss(bossId) {
    if (!this.settings.dungeonExtractionAttempts) {
      this.settings.dungeonExtractionAttempts = {};
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;
    const maxAttempts = cfg.maxBossAttemptsPerDay || 3;
    const today = new Date().toDateString();

    const attempts = this.settings.dungeonExtractionAttempts[bossId];

    // No previous attempts or from different day
    if (!attempts || attempts.lastReset !== today) {
      return {
        allowed: true,
        reason: null,
        attemptsRemaining: maxAttempts,
      };
    }

    // Check attempt count
    if (attempts.count >= maxAttempts) {
      return {
        allowed: false,
        reason: `Maximum extraction attempts reached (${maxAttempts}/${maxAttempts}). Boss corpse has degraded. Try again tomorrow.`,
        attemptsRemaining: 0,
      };
    }

    return {
      allowed: true,
      reason: null,
      attemptsRemaining: maxAttempts - attempts.count,
    };
  }

  /**
   * Record boss extraction attempt (counts both success and failure)
   * Operations:
   * 1. Initialize tracking if needed
   * 2. Check for daily reset
   * 3. Increment attempt count
   * 4. Update timestamp
   * 5. Save settings
   *
   * @param {string} bossId - Unique boss identifier
   * @param {boolean} success - Whether extraction succeeded
   */
  recordBossExtractionAttempt(bossId, success) {
    if (!this.settings.dungeonExtractionAttempts) {
      this.settings.dungeonExtractionAttempts = {};
    }

    const today = new Date().toDateString();
    const attempts = this.settings.dungeonExtractionAttempts[bossId];

    // Reset if new day or first attempt
    if (!attempts || attempts.lastReset !== today) {
      this.settings.dungeonExtractionAttempts[bossId] = {
        count: 1,
        lastAttempt: Date.now(),
        lastReset: today,
        lastSuccess: success,
      };
    } else {
      // Increment count
      attempts.count++;
      attempts.lastAttempt = Date.now();
      attempts.lastSuccess = success;
    }

    // Clean up old entries (older than 7 days) to prevent unbounded growth
    this.cleanupOldBossAttempts();

    // Save settings
    this.saveSettings();
  }

  /**
   * Get remaining extraction attempts for a boss today
   *
   * @param {string} bossId - Unique boss identifier
   * @returns {number} - Attempts remaining (0-3)
   */
  getBossAttemptsRemaining(bossId) {
    if (!this.settings.dungeonExtractionAttempts) {
      return this.settings.extractionConfig?.maxBossAttemptsPerDay || 3;
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;
    const maxAttempts = cfg.maxBossAttemptsPerDay || 3;
    const today = new Date().toDateString();
    const attempts = this.settings.dungeonExtractionAttempts[bossId];

    if (!attempts || attempts.lastReset !== today) {
      return maxAttempts;
    }

    return Math.max(0, maxAttempts - attempts.count);
  }

  /**
   * Clean up old boss attempt records (older than 7 days)
   * Prevents unbounded growth of dungeonExtractionAttempts object
   */
  cleanupOldBossAttempts() {
    if (!this.settings.dungeonExtractionAttempts) return;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const attempts = this.settings.dungeonExtractionAttempts;

    for (const bossId in attempts) {
      if (attempts[bossId].lastAttempt < sevenDaysAgo) {
        delete attempts[bossId];
      }
    }
  }

  /**
   * Handle one or multiple extractions (normal or special ARISE)
   * Operations:
   * 1. Determine extraction count (1 for normal, 3-7 for special)
   * 2. Generate shadows in a loop with specified target rank
   * 3. Save shadows to IndexedDB (async, non-blocking)
   * 4. Update extraction timestamps and counters
   * 5. Grant XP to shadows based on extraction type
   * 6. Save settings (config only, shadows in IndexedDB)
   * 7. Show extraction animation
   * 8. Update UI if needed
   *
   * @param {boolean} fromDungeon - If true, can extract magic beast shadows
   */
  async handleExtractionBurst(userRank, userLevel, userStats, isSpecial, targetRank = null, fromDungeon = false) {
    const now = Date.now();
    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    // Decide how many shadows to extract in this burst
    const count = isSpecial ? 3 + Math.floor(Math.random() * 5) : 1; // 3–7 for special, 1 for normal

    // RANK VALIDATION: Ensure target rank is not too high
    let rankToUse = targetRank || userRank;

    if (targetRank) {
      const userRankIndex = this.shadowRanks.indexOf(userRank);
      const targetRankIndex = this.shadowRanks.indexOf(targetRank);
      const rankDiff = targetRankIndex - userRankIndex;

      // If target rank is more than 1 above user, cap it to user rank + 1
      if (rankDiff > 1) {
        rankToUse = this.shadowRanks[Math.min(userRankIndex + 1, this.shadowRanks.length - 1)];
        console.log(
          `[ShadowArmy] Extraction target adjusted: ${targetRank} → ${rankToUse} (user rank: ${userRank})`
        );
      }
    }

    const extractedShadows = [];

    // Generate shadows
    for (let i = 0; i < count; i++) {
      const shadow = this.generateShadow(rankToUse, userLevel, userStats, fromDungeon);

      // Save to IndexedDB if available, otherwise fallback to localStorage
      if (this.storageManager) {
        try {
          await this.storageManager.saveShadow(shadow);
          extractedShadows.push(shadow);
        } catch (error) {
          console.error('ShadowArmy: Failed to save shadow to IndexedDB', error);
          // Fallback to localStorage
          if (!this.settings.shadows) this.settings.shadows = [];
          this.settings.shadows.push(shadow);
          extractedShadows.push(shadow);
        }
      } else {
        // Fallback to localStorage
        if (!this.settings.shadows) this.settings.shadows = [];
        this.settings.shadows.push(shadow);
        extractedShadows.push(shadow);
      }

      this.settings.totalShadowsExtracted++;
      this.settings.lastExtractionTime = now;
      if (!this.extractionTimestamps) this.extractionTimestamps = [];
      this.extractionTimestamps.push(now);

      // Invalidate buff cache when new shadows are added
      this.cachedBuffs = null;
      this.cachedBuffsTime = null;
      console.log('ShadowArmy: Shadow extracted!', shadow);
    }

    // New shadows start with 0 shadow XP; give them a small burst so they can level over time
    if (isSpecial) {
      await this.grantShadowXP(10, 'special_arise');
    } else {
      await this.grantShadowXP(2, 'extraction');
    }

    this.saveSettings();

    // Show extraction animation for the last shadow
    if (extractedShadows.length > 0) {
      this.showExtractionAnimation(extractedShadows[extractedShadows.length - 1]);
    }

    this.updateUI();
  }

  /**
   * Check if special ARISE event can be triggered (daily limit)
   * Operations:
   * 1. Get today's date string
   * 2. Initialize specialArise tracking if missing
   * 3. Reset counter if new day
   * 4. Check if countToday is below maxPerDay limit
   */
  canTriggerSpecialArise() {
    const today = new Date().toDateString();
    if (!this.settings.specialArise) {
      this.settings.specialArise = { ...this.defaultSettings.specialArise };
    }
    if (this.settings.specialArise.lastDate !== today) {
      // New day, reset counter
      this.settings.specialArise.lastDate = today;
      this.settings.specialArise.countToday = 0;
    }
    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;
    return this.settings.specialArise.countToday < (cfg.specialMaxPerDay || 5);
  }

  /**
   * Mark that a special ARISE event was used (increment daily counter)
   * Operations:
   * 1. Get today's date string
   * 2. Initialize specialArise tracking if missing
   * 3. Reset counter if new day
   * 4. Increment countToday
   * 5. Save settings to persist daily limit
   */
  markSpecialAriseUsed() {
    const today = new Date().toDateString();
    if (!this.settings.specialArise) {
      this.settings.specialArise = { ...this.defaultSettings.specialArise };
    }
    if (this.settings.specialArise.lastDate !== today) {
      this.settings.specialArise.lastDate = today;
      this.settings.specialArise.countToday = 0;
    }
    this.settings.specialArise.countToday += 1;
    this.saveSettings();
  }

  // ============================================================================
  // SHADOW GENERATION
  // ============================================================================

  // ============================================================================
  // SHADOW GENERATION & STATS - Creation & Calculation
  // ============================================================================
  /**
   * Generate a shadow based on rank, level, and stats
   * Uses exponential stat scaling - higher rank = exponentially stronger
   * Operations:
   * 1. Use provided shadow rank (determined by probability system)
   * 2. Randomly select shadow role (humanoid or magic beast if from dungeon)
   * 3. Filter by biome families and rank restrictions
   * 4. Get exponential rank multiplier for stat scaling
   * 5. Generate base stats using role weights and exponential rank multiplier
   * 6. Calculate initial shadow strength from base stats
   * 7. Create shadow object with id, rank, role, stats, level, XP
   * 8. Initialize growth stats for level-up progression
   *
   * @param {string} shadowRank - Rank of shadow to generate
   * @param {number} userLevel - Current user level
   * @param {object} userStats - User's current stats
   * @param {boolean} fromDungeon - If true, can generate magic beast shadows
   * @param {Array} beastFamilies - Allowed beast families for this biome
   */
  generateShadow(shadowRank, userLevel, userStats, fromDungeon = false, beastFamilies = null) {
    // VALIDATION: Ensure shadow rank is not invalid
    // This is called after determineShadowRank, so it should always be valid
    // But we add this check as a safety measure

    // Random role selection
    // MAGIC BEASTS: 100% from dungeons (filtered by biome), 0% from messages!
    let roleKey;
    if (fromDungeon) {
      // Select magic beast role (dungeon-only, 100% magic beast)
      let availableBeastRoles = Object.keys(this.shadowRoles).filter(
        key => this.shadowRoles[key].isMagicBeast
      );

      // Filter by biome families if provided
      if (beastFamilies && beastFamilies.length > 0) {
        availableBeastRoles = availableBeastRoles.filter(key => {
          const beast = this.shadowRoles[key];
          return beastFamilies.includes(beast.family);
        });
      }

      // Filter by rank restrictions (e.g., dragons only NH+)
      const rankIndex = this.shadowRanks.indexOf(shadowRank);
      availableBeastRoles = availableBeastRoles.filter(key => {
        const beast = this.shadowRoles[key];
        if (!beast.minRank) return true; // No restriction
        const minRankIndex = this.shadowRanks.indexOf(beast.minRank);
        return rankIndex >= minRankIndex; // Only if dungeon rank meets minimum
      });

      // Fallback: If no beasts available after filtering, use all beasts
      if (availableBeastRoles.length === 0) {
        availableBeastRoles = Object.keys(this.shadowRoles).filter(
          key => this.shadowRoles[key].isMagicBeast && !this.shadowRoles[key].minRank
        );
      }

      roleKey = availableBeastRoles[Math.floor(Math.random() * availableBeastRoles.length)];
    } else {
      // Select humanoid role (message-based extraction only)
      const humanoidRoles = Object.keys(this.shadowRoles).filter(
        key => !this.shadowRoles[key].isMagicBeast
      );
      roleKey = humanoidRoles[Math.floor(Math.random() * humanoidRoles.length)];
    }
    const role = this.shadowRoles[roleKey];

    // Get exponential rank multiplier (1.5x per rank)
    const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;

    // Generate base stats with exponential scaling (NO USER STAT CAPS!)
    const baseStats = this.generateShadowBaseStats(userStats, roleKey, shadowRank, rankMultiplier);
    const baseStrength = this.calculateShadowStrength(baseStats, 1); // use internal stats for power

    const shadow = {
      id: `shadow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      rank: shadowRank,
      role: roleKey,
      roleName: role.name,
      strength: baseStrength,
      extractedAt: Date.now(),
      level: 1, // Shadow's own level
      xp: 0, // Shadow XP for growth
      baseStats, // Role-weighted stats based on rank baseline only
      growthStats: {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        luck: 0,
      },
      naturalGrowthStats: {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        luck: 0,
      },
      totalCombatTime: 0,
      lastNaturalGrowth: Date.now(),
      ownerLevelAtExtraction: userLevel, // For reference only, doesn't affect stats
      growthVarianceSeed: Math.random(), // Unique growth pattern (0-1, creates 0.8-1.2x variance)
    };

    return shadow;
  }

  /**
   * Determine shadow rank based on user rank and level
   * Higher rank = better shadows, but still chance for lower ranks
   * Operations:
   * 1. Calculate probability distribution for each rank based on user rank
   * 2. Generate random roll (0-1)
   * 3. Use cumulative probability to select rank
   * 4. Return selected rank or fallback to user's rank
   */
  determineShadowRank(userRankIndex, userLevel) {
    // Base probabilities shift based on user rank
    // E rank: Mostly E, some D
    // S rank: Mostly A-S, some B-C
    // Monarch: Mostly S-SSS, some A

    const rankProbabilities = this.calculateRankProbabilities(userRankIndex);
    const roll = Math.random();
    let cumulative = 0;

    for (let i = 0; i < this.shadowRanks.length; i++) {
      cumulative += rankProbabilities[i];
      if (roll < cumulative) {
        return this.shadowRanks[i];
      }
    }

    // Fallback to user's rank
    return this.shadowRanks[Math.min(userRankIndex, this.shadowRanks.length - 1)];
  }

  /**
   * Calculate probability distribution for shadow ranks based on user rank
   * STRICT RULE: Cannot extract shadows ABOVE your rank (Solo Leveling lore)
   *
   * Restrictions:
   * - Your rank: Most common (40-50%)
   * - 1 rank above: Rare (5-10%) - requires high stats/luck
   * - 2+ ranks above: IMPOSSIBLE (0%)
   * - Lower ranks: Decreasing probability
   *
   * Example (B-rank user):
   * - A-rank: 5% (1 above, rare)
   * - B-rank: 50% (your rank, common)
   * - C-rank: 25% (1 below, common)
   * - D-rank: 15% (2 below, uncommon)
   * - E-rank: 5% (3 below, rare)
   * - S-rank+: 0% (impossible)
   *
   * Operations:
   * 1. Initialize probability array (all zeros)
   * 2. Set probabilities centered on user rank
   * 3. Allow 1 rank above with low chance (5-10%)
   * 4. Prevent 2+ ranks above (0%)
   * 5. Return probability array for rank selection
   */
  calculateRankProbabilities(userRankIndex) {
    const probabilities = new Array(this.shadowRanks.length).fill(0);

    // STRICT ENFORCEMENT: Cannot extract more than 1 rank above user
    const maxExtractableIndex = Math.min(userRankIndex + 1, this.shadowRanks.length - 1);

    // Distribution centered on user rank:
    // - 1 rank above: 5% (rare, requires luck)
    // - Your rank: 50% (most common)
    // - 1 rank below: 25%
    // - 2 ranks below: 15%
    // - 3 ranks below: 5%
    // - 4+ ranks below: 0% (too weak to extract)

    if (userRankIndex >= 0) {
      // 1 rank above (rare - only if high INT/LUK)
      if (maxExtractableIndex > userRankIndex && maxExtractableIndex < this.shadowRanks.length) {
        probabilities[maxExtractableIndex] = 0.05; // 5% for 1 rank above
      }

      // Your rank (most common)
      probabilities[userRankIndex] = 0.5; // 50%

      // 1 rank below (common)
      if (userRankIndex - 1 >= 0) {
        probabilities[userRankIndex - 1] = 0.25; // 25%
      }

      // 2 ranks below (uncommon)
      if (userRankIndex - 2 >= 0) {
        probabilities[userRankIndex - 2] = 0.15; // 15%
      }

      // 3 ranks below (rare)
      if (userRankIndex - 3 >= 0) {
        probabilities[userRankIndex - 3] = 0.05; // 5%
      }

      // 4+ ranks below: too weak, 0% chance
    }

    // Normalize probabilities to ensure they sum to 1.0
    const sum = probabilities.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let i = 0; i < probabilities.length; i++) {
        probabilities[i] = probabilities[i] / sum;
      }
    }

    return probabilities;
  }

  /**
   * Get exponential rank multiplier for shadow strength scaling
   * Operations:
   * 1. Get multiplier from rankStatMultipliers (exponential: 1.5x per rank)
   * 2. Return multiplier (E = 1.0x, S = 7.59x, Shadow Monarch = 129.74x)
   */
  getRankMultiplier(shadowRank) {
    return this.rankStatMultipliers[shadowRank] || 1.0;
  }

  // ============================================================================
  // PROBABILITY SYSTEM WITH STATS INFLUENCE
  // ============================================================================

  /**
   * Determine extractable ranks based on user rank (Solo Leveling lore)
   * Operations:
   * 1. Get user rank index
   * 2. Calculate extractable ranks (user rank + up to 2 ranks above)
   * 3. Apply rank probability multipliers (lower ranks easier)
   * 4. Apply stats boost to multipliers
   * 5. Normalize probabilities
   */
  determineExtractableRanks(userRank, userStats) {
    const userRankIndex = this.shadowRanks.indexOf(userRank);
    const extractableRanks = [];

    // Lore constraint: Can extract up to 2 ranks above user rank
    const maxExtractableIndex = Math.min(userRankIndex + 2, this.shadowRanks.length - 1);

    // Stats influence
    const intelligence = userStats.intelligence || 0;
    const statsBoost = 1.0 + intelligence * 0.01; // +1% per INT point

    for (let i = 0; i <= maxExtractableIndex; i++) {
      const rank = this.shadowRanks[i];
      const multiplier = (this.rankProbabilityMultipliers[rank] || 1.0) * statsBoost;
      extractableRanks.push({ rank, multiplier });
    }

    // Normalize probabilities
    const totalMultiplier = extractableRanks.reduce((sum, r) => sum + r.multiplier, 0);
    extractableRanks.forEach((r) => {
      r.probability = r.multiplier / totalMultiplier;
    });

    return extractableRanks;
  }

  /**
   * Calculate extraction chance with stats influence and lore constraints
   * Operations:
   * 1. Check lore constraint (can't extract significantly stronger - max 2 ranks above)
   * 2. Calculate base chance from Intelligence
   * 3. Apply stats multiplier (INT, PER, STR, total stats)
   * 4. Apply rank probability multiplier
   * 5. Apply rank difference penalty if target is stronger
   * 6. Apply target strength resistance
   * 7. Return final chance (0-1)
   */
  calculateExtractionChance(
    userRank,
    userStats,
    targetRank,
    targetStrength,
    intelligence,
    perception,
    strength,
    skipCap = false
  ) {
    const userRankIndex = this.shadowRanks.indexOf(userRank);
    const targetRankIndex = this.shadowRanks.indexOf(targetRank);

    // STRICT RANK ENFORCEMENT: Cannot extract shadows more than 1 rank above you
    // B-rank hunter: Can extract up to A-rank (1 above), CANNOT extract S-rank (2 above)
    const rankDiff = targetRankIndex - userRankIndex;
    if (rankDiff > 1) {
      console.log(
        `[ShadowArmy] ❌ Cannot extract [${targetRank}] shadow - too high! (User rank: ${userRank}, Max: ${
          this.shadowRanks[Math.min(userRankIndex + 1, this.shadowRanks.length - 1)]
        })`
      );
      return 0; // Target too strong - impossible extraction
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    // Base chance from Intelligence
    const baseChance = Math.max(
      cfg.minBaseChance || 0.001,
      intelligence * (cfg.chancePerInt || 0.005)
    );

    // Stats multiplier
    const totalStats = Object.values(userStats).reduce((sum, val) => sum + (val || 0), 0);
    const statsMultiplier =
      1.0 +
      (intelligence * 0.01 + // INT: +1% per point
        perception * 0.005 + // PER: +0.5% per point
        strength * 0.003 + // STR: +0.3% per point
        (totalStats / 1000) * 0.01); // Total power bonus

    // Rank probability multiplier (lower ranks easier)
    const rankMultiplier = this.rankProbabilityMultipliers[targetRank] || 1.0;

    // Rank difference penalty (if target is stronger)
    const rankPenalty = rankDiff > 0 ? Math.pow(0.5, rankDiff) : 1.0; // 50% reduction per rank above

    // Target strength resistance (improved - uses actual target strength if provided)
    const userStrength = this.calculateUserStrength(userStats);
    let targetResistance;

    if (targetStrength > 0) {
      // Use actual target strength for more accurate resistance
      const strengthRatio = Math.min(1.0, targetStrength / Math.max(1, userStrength));
      targetResistance = Math.min(0.9, strengthRatio * 0.7); // Max 70% resistance from strength difference
    } else {
      // Fallback to rank-based resistance
      targetResistance = Math.min(0.9, (targetRankIndex + 1) / ((userRankIndex + 1) * 2));
    }

    // Calculate raw chance
    const rawChance =
      baseChance * statsMultiplier * rankMultiplier * rankPenalty * (1 - targetResistance);

    // Apply hard cap to prevent 100% extraction on every message (skip for dungeons)
    if (!skipCap) {
      const maxChance = cfg.maxExtractionChance || 0.15; // Default 15% cap
      const finalChance = Math.max(0, Math.min(maxChance, rawChance));
      return finalChance;
    }

    // For dungeons: no cap, but still ensure it's between 0 and 1
    return Math.max(0, Math.min(1, rawChance));
  }

  /**
   * Select rank by weighted probability
   * Operations:
   * 1. Generate random roll (0-1)
   * 2. Use cumulative probability to select rank
   * 3. Return selected rank
   */
  selectRankByProbability(rankChances) {
    if (!rankChances || rankChances.length === 0) return null;

    const roll = Math.random();
    let cumulative = 0;

    for (const rankChance of rankChances) {
      cumulative += rankChance.probability || rankChance.chance || 0;
      if (roll < cumulative) {
        return rankChance.rank;
      }
    }

    // Fallback to first rank
    return rankChances[0].rank;
  }

  /**
   * Calculate user strength from stats (for resistance calculation)
   */
  calculateUserStrength(userStats) {
    return (
      (userStats.strength || 0) +
      (userStats.agility || 0) +
      (userStats.intelligence || 0) +
      (userStats.vitality || 0) +
      (userStats.luck || 0)
    );
  }

  /**
   * Estimate target strength based on rank for extraction calculations
   * This provides a more accurate extraction chance by considering target power
   * Operations:
   * 1. Get rank baseline stats (proportionate to expected stats at that rank)
   * 2. Apply rank multiplier for exponential scaling
   * 3. Calculate total strength from estimated stats
   * 4. Return estimated strength value
   */
  estimateTargetStrengthByRank(targetRank, targetRankIndex, userStats) {
    // Get rank baseline stats (similar to shadow generation)
    const rankBaselines = this.getRankBaselineStats(
      targetRank,
      this.rankStatMultipliers[targetRank] || 1.0
    );

    // Calculate estimated total stats for this rank
    const estimatedStats = {
      strength: rankBaselines.strength || 10,
      agility: rankBaselines.agility || 10,
      intelligence: rankBaselines.intelligence || 10,
      vitality: rankBaselines.vitality || 10,
      luck: rankBaselines.luck || 10,
    };

    // Calculate strength value (similar to shadow strength calculation)
    const estimatedStrength = this.calculateShadowStrength(estimatedStats, 1);

    return estimatedStrength;
  }

  /**
   * Get expected baseline stats for a rank (proportionate to expected user stats at that rank)
   * These baselines ensure shadows are strong regardless of user's current stats
   *
   * Formula: Expected stats scale exponentially with rank
   * - E rank: ~10-15 per stat (level 1 equivalent)
   * - D rank: ~15-22 per stat (level 5 equivalent)
   * - C rank: ~22-33 per stat (level 10 equivalent)
   * - B rank: ~33-50 per stat (level 15 equivalent)
   * - A rank: ~50-75 per stat (level 20 equivalent)
   * - S rank: ~75-112 per stat (level 30 equivalent)
   * - SS rank: ~112-168 per stat (level 40 equivalent)
   * - SSS rank: ~168-252 per stat (level 50 equivalent)
   * - SSS+ rank: ~252-378 per stat (level 60 equivalent)
   * - NH rank: ~378-567 per stat (level 70 equivalent)
   * - Monarch rank: ~567-850 per stat (level 80 equivalent)
   * - Monarch+ rank: ~850-1275 per stat (level 90 equivalent)
   * - Shadow Monarch rank: ~1275-1912 per stat (level 100 equivalent)
   */
  getRankBaselineStats(shadowRank, rankMultiplier) {
    // FIXED: Hardcoded rank baselines (exponential 1.5x per rank, properly calculated)
    // Each rank should be exponentially stronger, not capped by weird formulas
    const rankBaselinesFixed = {
      E: 10,
      D: 22, // 10 × 1.5^1 × 1.5
      C: 50, // 10 × 1.5^2 × 1.5
      B: 112, // 10 × 1.5^3 × 1.5
      A: 252, // 10 × 1.5^4 × 1.5
      S: 567, // 10 × 1.5^5 × 1.5
      SS: 1275, // 10 × 1.5^6 × 1.5
      SSS: 2866, // 10 × 1.5^7 × 1.5 ← CORRECT!
      'SSS+': 6447,
      NH: 14505,
      Monarch: 32636,
      'Monarch+': 73431,
      'Shadow Monarch': 165219,
    };

    const baselineValue = rankBaselinesFixed[shadowRank] || 10;

    return {
      strength: baselineValue,
      agility: baselineValue,
      intelligence: baselineValue,
      vitality: baselineValue,
      luck: baselineValue,
    };
  }

  /**
   * Generate base stats for a new shadow with exponential scaling
   *
   * PURE RANK + ROLE FORMULA (NO USER STAT CAPPING!)
   * Shadows stats are determined ONLY by rank and role, regardless of user level
   *
   * EXPONENTIAL SCALING FORMULA:
   * Each rank is exponentially stronger than the previous rank (1.5x multiplier per rank)
   *
   * Formula: shadowStat = rankBaseline × roleWeight × variance
   *
   * Rank Baselines (per stat):
   * - E: 10       - D: 22        - C: 50        - B: 112
   * - A: 252      - S: 567       - SS: 1,275    - SSS: 2,866
   * - SSS+: 6,447 - NH: 14,505   - Monarch: 32,636
   *
   * Role Weights (specialization multipliers):
   * - Mage: STR 0.15x (WEAK), INT 1.6x (STRONG)
   * - Assassin: VIT 0.3x (WEAK), AGI 1.7x (STRONG)
   * - Berserker: INT 0.15x (WEAK), STR 1.8x (STRONG)
   * - Tank: AGI 0.3x (WEAK), VIT 1.5x (STRONG)
   *
   * Example (SSS Mage):
   * - STR: 2866 × 0.15 × 1.0 = 430 (EXTREMELY WEAK)
   * - INT: 2866 × 1.6 × 1.0 = 4,586 (EXTREMELY STRONG)
   * - Total Power: ~9,300
   *
   * This ensures:
   * - SSS shadows are ALWAYS strong (14k+ power)
   * - Role specialization is EXTREME
   * - User level doesn't affect shadow strength
   * - Each shadow is unique (90-110% variance)
   *
   * Operations:
   * 1. Get rank baseline stats (exponential per rank)
   * 2. Get role weights for specialization
   * 3. For each stat: rankBaseline × roleWeight × variance
   * 4. Return base stats object
   */
  generateShadowBaseStats(userStats, roleKey, shadowRank, rankMultiplier) {
    const weights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;
    const stats = ['strength', 'agility', 'intelligence', 'vitality', 'luck'];

    // Get rank baseline stats (proportionate to expected stats at that rank)
    const rankBaselines = this.getRankBaselineStats(shadowRank, rankMultiplier);

    const baseStats = {};

    stats.forEach((stat) => {
      const roleWeight = weights[stat] || 1.0;
      const rankBaseline = rankBaselines[stat] || 10;

      // Shadow stat = rank baseline × role weight × variance
      // This ensures:
      // 1. SSS shadows are ALWAYS strong (based on SSS baseline)
      // 2. Mages have HIGH INT, LOW STR (role weights)
      // 3. Tanks have HIGH VIT, LOW AGI (role weights)
      // 4. Random variance (90%-110%) for uniqueness

      const variance = 0.9 + Math.random() * 0.2; // 90%-110% variance
      const shadowStat = rankBaseline * roleWeight * variance;

      baseStats[stat] = Math.max(1, Math.round(shadowStat));
    });

    return baseStats;
  }

  /**
   * Calculate shadow strength based on shadow stats and optional multiplier
   * Operations:
   * 1. Sum all stat values (STR + AGI + INT + VIT + LUK)
   * 2. Multiply by multiplier (default 1)
   * 3. Return floor of result
   */
  calculateShadowStrength(stats, multiplier = 1) {
    const totalStats =
      (stats.strength || 0) +
      (stats.agility || 0) +
      (stats.intelligence || 0) +
      (stats.vitality || 0) +
      (stats.luck || 0);

    // Base strength = total stats * multiplier
    return Math.floor(totalStats * multiplier);
  }

  // ============================================================================
  // ANIMATION & UI
  // ============================================================================

  /**
   * Show extraction animation when shadow is extracted
   * Operations:
   * 1. Try to use ShadowAriseAnimation plugin if available
   * 2. Fallback to simple inline animation if plugin missing
   * 3. Create animation element with ARISE text and shadow info
   * 4. Append to document body
   * 5. Schedule fade-out and removal after animation duration
   */
  showExtractionAnimation(shadow) {
    try {
      // Prefer external ShadowAriseAnimation plugin, if present
      const saPlugin = BdApi.Plugins.get('ShadowAriseAnimation');
      const instance = saPlugin && (saPlugin.instance || saPlugin);
      if (instance && typeof instance.triggerArise === 'function') {
        instance.triggerArise(shadow);
        return;
      }
    } catch (error) {
      console.warn('ShadowArmy: Unable to use ShadowAriseAnimation plugin', error);
    }

    // Fallback: simple inline ARISE animation (minimal, in case plugin is missing)
    const animation = document.createElement('div');
    animation.className = 'shadow-army-extraction-animation';
    animation.innerHTML = `
      <div class="shadow-extraction-content">
        <div class="shadow-extraction-title">ARISE</div>
        <div class="shadow-extraction-info">
          <div class="shadow-rank">${shadow.rank || ''}</div>
          <div class="shadow-role">${shadow.roleName || shadow.role || ''}</div>
        </div>
      </div>
    `;

    document.body.appendChild(animation);

    setTimeout(() => {
      animation.classList.add('fade-out');
      setTimeout(() => animation.remove(), 500);
    }, 2000);
  }

  // ============================================================================
  // SHADOW QUERY & MANAGEMENT
  // ============================================================================

  /**
   * Get total shadow count
   * Operations:
   * 1. Use IndexedDB if available, otherwise fallback to localStorage array
   * 2. Return total count
   */
  async getTotalShadowCount() {
    if (this.storageManager) {
      try {
        return await this.storageManager.getTotalCount();
      } catch (error) {
        console.error('ShadowArmy: Failed to get count from IndexedDB', error);
      }
    }
    // Fallback to localStorage
    return (this.settings.shadows || []).length;
  }

  /**
   * Get shadows filtered by role
   * Operations:
   * 1. Use IndexedDB if available with role filter
   * 2. Otherwise fallback to localStorage array filter
   * 3. Return filtered array
   */
  async getShadowsByRole(role) {
    if (this.storageManager) {
      try {
        return await this.storageManager.getShadows({ role }, 0, 10000);
      } catch (error) {
        console.error('ShadowArmy: Failed to get shadows by role from IndexedDB', error);
      }
    }
    // Fallback to localStorage
    return (this.settings.shadows || []).filter((s) => s.role === role);
  }

  /**
   * Get shadows filtered by rank
   * Operations:
   * 1. Use IndexedDB if available with rank filter
   * 2. Otherwise fallback to localStorage array filter
   * 3. Return filtered array
   */
  async getShadowsByRank(rank) {
    if (this.storageManager) {
      try {
        return await this.storageManager.getShadows({ rank }, 0, 10000);
      } catch (error) {
        console.error('ShadowArmy: Failed to get shadows by rank from IndexedDB', error);
      }
    }
    // Fallback to localStorage
    return (this.settings.shadows || []).filter((s) => s.rank === rank);
  }

  /**
   * Get all shadows from storage
   * Operations:
   * 1. Attempt to read all shadows from IndexedDB using storageManager.getShadows with large limit
   * 2. Return result on success
   * 3. Log error and fallback to localStorage if storageManager is missing or error occurs
   * 4. Return empty array if no shadows found
   */
  async getAllShadows() {
    if (!this.storageManager) {
      return this.settings.shadows || [];
    }

    try {
      return await this.storageManager.getShadows({}, 0, 100000);
    } catch (error) {
      console.error('[ShadowArmy] Failed to get all shadows from IndexedDB', error);
      return this.settings.shadows || [];
    }
  }

  /**
   * Get top 7 generals (strongest shadows by total power)
   * Automatic selection - no manual favorites!
   *
   * Operations:
   * 1. Load all shadows from storage
   * 2. Sort by strength (total power) descending
   * 3. Return top 7 strongest shadows
   * 4. These are the "generals" who provide full buffs
   */
  async getTopGenerals() {
    try {
      let shadows = [];

      if (this.storageManager) {
        try {
          // Get all shadows from IndexedDB
          shadows = await this.storageManager.getShadows({}, 0, 10000);
        } catch (error) {
          console.error('ShadowArmy: Failed to get shadows from IndexedDB', error);
          shadows = this.settings.shadows || [];
        }
      } else {
        shadows = this.settings.shadows || [];
      }

      // Ensure each shadow has up-to-date strength calculation
      // (strength = sum of all effective stats: base + growth + natural)
      shadows.forEach((shadow) => {
        if (!shadow.strength || shadow.strength === 0) {
          const effectiveStats = this.getShadowEffectiveStats(shadow);
          shadow.strength = this.calculateShadowStrength(effectiveStats, 1);
        }
      });

      // Sort by strength (total power) descending
      shadows.sort((a, b) => (b.strength || 0) - (a.strength || 0));

      // Return top 7 strongest (generals)
      return shadows.slice(0, 7);
    } catch (error) {
      console.error('ShadowArmy: Error getting top generals', error);
      return [];
    }
  }

  // ============================================================================
  // SHADOW BUFFS & XP SYSTEM
  // ============================================================================

  /**
   * Calculate total buffs from all shadows
   * Top 7 strongest shadows (generals) give full buffs, others aggregated for performance
   *
   * BALANCING: Implements caps and diminishing returns to prevent OP buffs from millions of shadows
   * - Top 7 strongest shadows (GENERALS): Full buffs, no cap
   * - Aggregated weak shadows: Diminishing returns + hard cap
   * - Total buff cap: Max +50% per stat from all shadows combined
   *
   * Operations:
   * 1. Initialize buffs object (STR, AGI, INT, VIT, LUK all 0)
   * 2. Get top 7 generals (strongest by total power) - full buffs
   * 3. Get user rank for aggregation threshold
   * 4. Aggregate weak shadows (2+ ranks below) with diminishing returns
   * 5. Apply caps to prevent overpowered buffs
   * 6. Return total buffs object
   */
  async calculateTotalBuffs() {
    const buffs = {
      strength: 0,
      agility: 0,
      intelligence: 0,
      vitality: 0,
      luck: 0,
      perception: 0, // Add perception for compatibility
    };

    // Get top 7 generals (strongest shadows) - full buffs, no cap
    const generals = await this.getTopGenerals();
    generals.forEach((shadow) => {
      const role = this.shadowRoles[shadow.role];
      if (!role || !role.buffs) return;

      Object.keys(role.buffs).forEach((stat) => {
        const amount = role.buffs[stat] * 1.0; // Full buffs for top 7 generals
        buffs[stat] = (buffs[stat] || 0) + amount;
      });
    });

    // Get user rank for aggregation
    const soloData = this.getSoloLevelingData();
    if (!soloData) {
      // Apply caps even if no solo data
      this.applyBuffCaps(buffs);
      this.cachedBuffs = buffs;
      this.cachedBuffsTime = Date.now();
      return buffs;
    }

    const userRank = soloData.rank;
    const userRankIndex = this.shadowRanks.indexOf(userRank);
    const weakRankThreshold = Math.max(0, userRankIndex - 2);

    // Aggregate weak shadows (2+ ranks below) for performance
    // Individual stats preserved in IndexedDB, but we use aggregated power for buffs
    if (
      this.storageManager &&
      weakRankThreshold >= 0 &&
      typeof this.storageManager.getAggregatedPower === 'function'
    ) {
      try {
        const aggregated = await this.storageManager.getAggregatedPower(userRank, this.shadowRanks);

        // Apply aggregated buffs with DIMINISHING RETURNS to prevent OP scaling
        // Formula: sqrt(totalPower / 10000) * 0.01
        // This means:
        // - 10,000 power = sqrt(1) * 0.01 = 0.01 (1% buff)
        // - 100,000 power = sqrt(10) * 0.01 = 0.0316 (3.16% buff)
        // - 1,000,000 power = sqrt(100) * 0.01 = 0.1 (10% buff)
        // - 10,000,000 power = sqrt(1000) * 0.01 = 0.316 (31.6% buff, but capped at 50%)
        // This prevents linear scaling while still rewarding large armies

        const baseAggregatedBuff = Math.sqrt(aggregated.totalPower / 10000) * 0.01;

        // Cap aggregated buffs at 0.4 (40%) to leave room for favorites
        const cappedAggregatedBuff = Math.min(0.4, baseAggregatedBuff);

        const aggregatedBuffs = {
          strength: cappedAggregatedBuff,
          agility: cappedAggregatedBuff,
          intelligence: cappedAggregatedBuff,
          vitality: cappedAggregatedBuff,
          luck: cappedAggregatedBuff,
          perception: cappedAggregatedBuff,
        };

        Object.keys(aggregatedBuffs).forEach((stat) => {
          buffs[stat] = (buffs[stat] || 0) + aggregatedBuffs[stat];
        });
      } catch (error) {
        console.error('ShadowArmy: Failed to get aggregated power', error);
      }
    } else {
      // Fallback: process non-favorite shadows from localStorage with diminishing returns
      // (Favorites already processed above)
      const favoriteIds = new Set(this.settings.favoriteShadowIds || []);
      const allShadows = this.settings.shadows || [];
      let nonFavoriteCount = 0;

      allShadows.forEach((shadow) => {
        const role = this.shadowRoles[shadow.role];
        if (!role || !role.buffs) return;

        const isFavorite = favoriteIds.has(shadow.id);

        if (!isFavorite) {
          nonFavoriteCount++;
        }
        // Favorites already processed at start of function
      });

      // Apply diminishing returns for non-favorites
      // Formula: sqrt(nonFavoriteCount / 100) * 0.01 per shadow role average
      // This prevents linear scaling
      if (nonFavoriteCount > 0) {
        const diminishingFactor = Math.sqrt(nonFavoriteCount / 100) * 0.01;
        const cappedFactor = Math.min(0.4, diminishingFactor); // Cap at 40%

        // Estimate average buff per shadow (simplified)
        const avgBuffPerShadow = 0.1; // Average ~10% per shadow role
        const totalNonFavoriteBuff = cappedFactor * avgBuffPerShadow;

        Object.keys(buffs).forEach((stat) => {
          buffs[stat] = (buffs[stat] || 0) + totalNonFavoriteBuff;
        });
      }
    }

    // Ensure perception is set (for compatibility)
    if (!buffs.perception) {
      buffs.perception = buffs.luck || 0;
    }

    // Apply hard caps to prevent overpowered buffs
    this.applyBuffCaps(buffs);

    // Cache buffs for synchronous access by SoloLevelingStats
    this.cachedBuffs = buffs;
    this.cachedBuffsTime = Date.now();

    return buffs;
  }

  /**
   * Apply hard caps to shadow buffs to prevent overpowered stats
   * Max +50% per stat from all shadows combined
   */
  applyBuffCaps(buffs) {
    const maxBuff = 0.5; // Max +50% per stat

    Object.keys(buffs).forEach((stat) => {
      if (buffs[stat] > maxBuff) {
        buffs[stat] = maxBuff;
      }
    });
  }

  // ============================================================================
  // XP & LEVELING SYSTEM - Experience & Growth Management
  // ============================================================================
  /**
   * Grant XP to shadows so they can grow over time
   * Called from message events / dungeons
   *
   * NEW: Can grant XP to specific shadows (by ID) or all shadows
   *
   * Operations:
   * 1. Validate baseAmount > 0
   * 2. If shadowIds provided, grant XP to those specific shadows
   * 3. Otherwise, get favorite shadows (only favorites receive XP from messages)
   * 4. For each shadow:
   *    - Add XP to shadow
   *    - Check if XP exceeds level-up requirement
   *    - Level up loop: subtract XP requirement, increment level
   *    - Apply stat growth on level up
   *    - Recalculate shadow strength with new stats
   *    - Save updated shadow to IndexedDB
   * 5. Save settings (config only)
   */
  async grantShadowXP(baseAmount, reason = 'message', shadowIds = null) {
    if (baseAmount <= 0) return;

    let shadowsToGrant = [];

    if (shadowIds && Array.isArray(shadowIds) && shadowIds.length > 0) {
      // Grant XP to specific shadows (from dungeons)
      const allShadows = await this.getAllShadows();
      shadowsToGrant = allShadows.filter((s) => shadowIds.includes(s.id));
    } else {
      // Default: grant XP to top 7 generals only (from messages)
      shadowsToGrant = await this.getTopGenerals();
    }

    if (!shadowsToGrant.length) return;

    const perShadow = baseAmount;

    for (const shadow of shadowsToGrant) {
      shadow.xp = (shadow.xp || 0) + perShadow;
      let level = shadow.level || 1;

      // Level up loop in case of big XP grants
      const shadowRank = shadow.rank || 'E';
      let leveledUp = false;
      while (shadow.xp >= this.getShadowXpForNextLevel(level, shadowRank)) {
        shadow.xp -= this.getShadowXpForNextLevel(level, shadowRank);
        level += 1;
        shadow.level = level;
        this.applyShadowLevelUpStats(shadow);
        leveledUp = true;
        // Recompute strength after level up
        const effectiveStats = this.getShadowEffectiveStats(shadow);
        shadow.strength = this.calculateShadowStrength(effectiveStats, 1);
      }

      // AUTO RANK-UP: Check if shadow qualifies for rank promotion after level-up
      if (leveledUp) {
        const rankUpResult = this.attemptAutoRankUp(shadow);
        if (rankUpResult.success) {
          console.log(
            `[ShadowArmy] AUTO RANK-UP: ${shadow.name || 'Shadow'} promoted ${
              rankUpResult.oldRank
            } -> ${rankUpResult.newRank}!`
          );
        }
      }

      // Save updated shadow to IndexedDB
      if (this.storageManager) {
        try {
          await this.storageManager.saveShadow(shadow);
        } catch (error) {
          console.error('ShadowArmy: Failed to save shadow XP update', error);
          // Fallback: update in localStorage array if exists
          const index = (this.settings.shadows || []).findIndex((s) => s.id === shadow.id);
          if (index !== -1) {
            this.settings.shadows[index] = shadow;
          }
        }
      } else {
        // Fallback: update in localStorage array
        const index = (this.settings.shadows || []).findIndex((s) => s.id === shadow.id);
        if (index !== -1) {
          this.settings.shadows[index] = shadow;
        }
      }
    }

    this.saveSettings();
  }

  /**
   * Calculate XP required for next shadow level
   * Higher rank shadows require more XP per level (they grow stronger per level)
   * Operations:
   * 1. Base XP formula: 25 + (level * level * 5)
   * 2. Scale by rank multiplier (higher ranks need more XP)
   * 3. Return XP requirement
   */
  getShadowXpForNextLevel(level, shadowRank = 'E') {
    // Base XP curve: grows roughly quadratically
    const baseXP = 25 + level * level * 5;

    // Scale by rank multiplier (higher ranks need more XP per level)
    // E rank: 1.0x multiplier
    // SSS rank: ~17x multiplier (requires more XP but grows much stronger)
    // Shadow Monarch: ~130x multiplier
    const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;
    const rankXPModifier = 1.0 + (rankMultiplier - 1.0) * 0.3; // Scale XP requirement with rank

    return Math.round(baseXP * rankXPModifier);
  }

  /**
   * Get effective stats for a shadow (base + growth + natural growth)
   * Operations:
   * 1. Get base stats from shadow.baseStats
   * 2. Get growth stats from shadow.growthStats (level-ups)
   * 3. Get natural growth stats from shadow.naturalGrowthStats (passive)
   * 4. Sum all three for each stat
   * 5. Return effective stats object
   */
  getShadowEffectiveStats(shadow) {
    const base = shadow.baseStats || {};
    const growth = shadow.growthStats || {};
    const naturalGrowth = shadow.naturalGrowthStats || {};

    return {
      strength: (base.strength || 0) + (growth.strength || 0) + (naturalGrowth.strength || 0),
      agility: (base.agility || 0) + (growth.agility || 0) + (naturalGrowth.agility || 0),
      intelligence:
        (base.intelligence || 0) + (growth.intelligence || 0) + (naturalGrowth.intelligence || 0),
      vitality: (base.vitality || 0) + (growth.vitality || 0) + (naturalGrowth.vitality || 0),
      luck: (base.luck || 0) + (growth.luck || 0) + (naturalGrowth.luck || 0),
    };
  }

  // ============================================================================
  // AUTO RANK-UP SYSTEM - Automatic Shadow Promotion
  // ============================================================================
  /**
   * Attempt automatic rank-up for shadow
   * Called after level-up to check if shadow qualifies for promotion
   * Returns: { success: boolean, oldRank: string, newRank: string }
   */
  attemptAutoRankUp(shadow) {
    if (!shadow || !shadow.rank) {
      return { success: false };
    }

    const currentRank = shadow.rank;
    const shadowRanks = [
      'E',
      'D',
      'C',
      'B',
      'A',
      'S',
      'SS',
      'SSS',
      'SSS+',
      'NH',
      'Monarch',
      'Monarch+',
      'Shadow Monarch',
    ];
    const currentRankIndex = shadowRanks.indexOf(currentRank);

    // Can't rank up if already max rank
    if (currentRankIndex === -1 || currentRankIndex >= shadowRanks.length - 1) {
      return { success: false };
    }

    const nextRank = shadowRanks[currentRankIndex + 1];

    // Get shadow's effective stats (base + growth + natural growth)
    const effectiveStats = this.getShadowEffectiveStats(shadow);

    // Calculate average stat value
    const avgStats =
      (effectiveStats.strength +
        effectiveStats.agility +
        effectiveStats.intelligence +
        effectiveStats.vitality +
        effectiveStats.luck) /
      5;

    // Get baseline for next rank
    const nextRankIndex = currentRankIndex + 1;
    const baselineForNextRank = this.getRankBaselineStats(nextRank);
    const nextBaseline =
      (baselineForNextRank.strength +
        baselineForNextRank.agility +
        baselineForNextRank.intelligence +
        baselineForNextRank.vitality +
        baselineForNextRank.luck) /
      5;

    // Check if shadow qualifies (80% of next rank's baseline stats)
    if (avgStats >= nextBaseline * 0.8) {
      // PERFORM RANK-UP
      shadow.rank = nextRank;

      // Reset level to 1 for new rank (fresh start at new tier)
      shadow.level = 1;
      shadow.xp = 0;

      // Recalculate strength with new rank
      const newEffectiveStats = this.getShadowEffectiveStats(shadow);
      shadow.strength = this.calculateShadowStrength(newEffectiveStats, 1);

      return {
        success: true,
        oldRank: currentRank,
        newRank: nextRank,
      };
    }

    return { success: false };
  }

  // ============================================================================
  // NATURAL GROWTH SYSTEM - Combat-Based Stat Growth
  // ============================================================================
  /**
   * Apply natural growth to shadow based on DUNGEON COMBAT time
   * Shadows grow from fighting in dungeons (combat experience)
   * ROLE-WEIGHTED: Mages grow INT from combat, Assassins grow AGI
   * INDIVIDUAL VARIANCE: Each shadow grows uniquely
   *
   * Formula: (combat time hours × rank multiplier × role weight × variance)
   * This creates exponential growth that reflects rank potential AND role specialization
   */
  async applyNaturalGrowth(shadow, combatTimeHours = 0) {
    if (!shadow) return false;

    const shadowRank = shadow.rank || 'E';
    const roleKey = shadow.role || 'knight';
    const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;
    const roleWeights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;

    // Initialize natural growth stats if not exists
    if (!shadow.naturalGrowthStats) {
      shadow.naturalGrowthStats = {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        luck: 0,
      };
    }

    // Initialize tracking fields
    if (!shadow.totalCombatTime) {
      shadow.totalCombatTime = 0;
    }
    if (!shadow.lastNaturalGrowth) {
      shadow.lastNaturalGrowth = Date.now();
    }

    // Initialize individual variance seed if not exists
    if (!shadow.growthVarianceSeed) {
      shadow.growthVarianceSeed = Math.random();
    }

    // Base natural growth per hour (scaled by rank)
    // Increased significantly to work with dungeons lasting 5-60 minutes
    const baseGrowthPerHour = rankMultiplier * 10; // E: 10/hr, SSS: 170/hr

    if (combatTimeHours > 0) {
      // Apply role-weighted growth to each stat
      const stats = ['strength', 'agility', 'intelligence', 'vitality', 'luck'];

      stats.forEach((stat) => {
        const roleWeight = roleWeights[stat] || 1.0;

        // Individual variance (each shadow grows uniquely)
        const individualVariance = 0.8 + shadow.growthVarianceSeed * 0.4; // 0.8-1.2

        // Calculate growth for this stat
        // Strong stats grow MORE naturally, weak stats grow LESS
        const statGrowth = baseGrowthPerHour * combatTimeHours * roleWeight * individualVariance;
        const roundedGrowth = Math.max(0, Math.round(statGrowth));

        shadow.naturalGrowthStats[stat] += roundedGrowth;
      });

      shadow.totalCombatTime += combatTimeHours;
      shadow.lastNaturalGrowth = Date.now();

      // Recalculate shadow strength with new stats
      const effectiveStats = this.getShadowEffectiveStats(shadow);
      shadow.strength = this.calculateShadowStrength(effectiveStats, 1);

      return true;
    }

    return false;
  }

  /**
   * Process natural growth for all shadows based on REAL TIME ELAPSED
   * Applies retroactively - shadows grow even when you're offline!
   * Called on plugin start and hourly
   */
  async processNaturalGrowthForAllShadows() {
    // Natural growth is now COMBAT-BASED ONLY (handled by Dungeons plugin)
    // Shadows grow from fighting in dungeons, not from real-world time
    // This function is kept for compatibility but does nothing
  }

  /**
   * Apply stat increases on shadow level up based on role specialization
   * ROLE-WEIGHTED GROWTH: Strong stats grow FAST, weak stats grow SLOW
   * INDIVIDUAL VARIANCE: Each shadow grows uniquely (based on growthVarianceSeed)
   * NO CAPS: Shadows can grow indefinitely!
   *
   * Growth Formula:
   * 1. Base growth by role weight:
   *    - roleWeight ≥ 1.5: +5 base (VERY HIGH) - e.g., Berserker STR
   *    - roleWeight ≥ 1.2: +4 base (HIGH)
   *    - roleWeight ≥ 0.8: +3 base (MEDIUM)
   *    - roleWeight ≥ 0.5: +2 base (LOW)
   *    - roleWeight ≥ 0.3: +1 base (VERY LOW)
   *    - roleWeight < 0.3:  +0.5 base (MINIMAL) - e.g., Mage STR
   *
   * 2. Multiply by rank growth multiplier:
   *    - E rank: 1.0x, SSS rank: 3.41x, Shadow Monarch: 20.46x
   *
   * 3. Apply individual variance (0.8-1.2x per shadow)
   *
   * 4. Apply per-level random variance (0.9-1.1x)
   *
   * Example (SSS Mage, seed 1.0):
   * - INT growth: 5 × 3.41 × 1.0 × 1.0 = ~17 per level (MASSIVE!)
   * - STR growth: 0.5 × 3.41 × 1.0 × 1.0 = ~2 per level (MINIMAL!)
   *
   * Result: Each shadow develops unique personality through growth!
   */
  applyShadowLevelUpStats(shadow) {
    const roleKey = shadow.role;
    const roleWeights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;
    const shadowRank = shadow.rank || 'E';
    const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;

    // Growth multiplier scales with rank (higher ranks grow MORE per level)
    // E rank: +1-3 per level, SSS rank: +17-51 per level
    const rankGrowthMultiplier = 1.0 + (rankMultiplier - 1.0) * 0.15;

    if (!shadow.growthStats) {
      shadow.growthStats = { strength: 0, agility: 0, intelligence: 0, vitality: 0, luck: 0 };
    }

    // Initialize individual variance seed if not exists (unique per shadow)
    if (!shadow.growthVarianceSeed) {
      shadow.growthVarianceSeed = Math.random(); // 0-1, unique per shadow
    }

    const stats = ['strength', 'agility', 'intelligence', 'vitality', 'luck'];

    stats.forEach((stat) => {
      const roleWeight = roleWeights[stat] || 1.0;

      // Base growth per level based on role weight and individual variance
      // Strong stats (roleWeight > 1.2): Grow FAST
      // Weak stats (roleWeight < 0.5): Grow SLOW
      // Medium stats (0.5-1.2): Moderate growth

      let baseGrowth;
      if (roleWeight >= 1.5) {
        baseGrowth = 5; // VERY HIGH growth for strong stats
      } else if (roleWeight >= 1.2) {
        baseGrowth = 4; // HIGH growth
      } else if (roleWeight >= 0.8) {
        baseGrowth = 3; // MEDIUM growth
      } else if (roleWeight >= 0.5) {
        baseGrowth = 2; // LOW growth
      } else if (roleWeight >= 0.3) {
        baseGrowth = 1; // VERY LOW growth
      } else {
        baseGrowth = 0.5; // MINIMAL growth
      }

      // Individual variance (±20% based on shadow's unique seed)
      // This makes each shadow unique even if same role/rank
      const seedVariance = 0.8 + shadow.growthVarianceSeed * 0.4; // 0.8-1.2

      // Per-level random variance (±10% per level up)
      const levelVariance = 0.9 + Math.random() * 0.2; // 0.9-1.1

      // Calculate final growth for this level
      const growth = baseGrowth * rankGrowthMultiplier * seedVariance * levelVariance;
      const roundedGrowth = Math.max(1, Math.round(growth));

      // Add growth (NO CAPS - let shadows grow freely!)
      const currentGrowth = shadow.growthStats[stat] || 0;
      shadow.growthStats[stat] = currentGrowth + roundedGrowth;
    });
  }

  /**
   * Fix shadow base stats to match rank baselines (v4 migration)
   * CRITICAL FIX: Some shadows were extracted when user was weak, giving them low base stats
   * This migration ensures ALL shadows have proper base stats for their rank
   *
   * Operations:
   * 1. Check if migration already done
   * 2. For each shadow:
   *    - Calculate proper baseline stats based ONLY on rank (not user stats)
   *    - Keep all progression: level, XP, growthStats, naturalGrowthStats, combat time
   *    - Recalculate total strength
   *    - Save updated shadow
   * 3. Mark migration complete
   */
  async fixShadowBaseStatsToRankBaselines() {
    try {
      // Check if we've already done this migration
      const migrationKey = 'shadowArmy_baseStats_v4';
      if (BdApi.Data.load('ShadowArmy', migrationKey)) {
        return; // Already migrated
      }

      console.log('[ShadowArmy] 🔧 Fixing shadow base stats to match rank baselines...');

      let allShadows = [];

      // Get shadows from IndexedDB
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, 100000);
          console.log(`[ShadowArmy] Found ${allShadows.length} shadows to fix`);
        } catch (error) {
          console.error('[ShadowArmy] Error getting shadows from IndexedDB', error);
        }
      }

      // Also get shadows from localStorage as fallback
      if (this.settings.shadows && this.settings.shadows.length > 0) {
        const localStorageShadows = this.settings.shadows.filter(
          (s) => !allShadows.find((dbShadow) => dbShadow.id === s.id)
        );
        allShadows = allShadows.concat(localStorageShadows);
      }

      if (allShadows.length === 0) {
        console.log('[ShadowArmy] No shadows to fix');
        BdApi.Data.save('ShadowArmy', migrationKey, true);
        return;
      }

      let fixed = 0;
      const batchSize = 50;

      for (let i = 0; i < allShadows.length; i += batchSize) {
        const batch = allShadows.slice(i, i + batchSize);

        for (const shadow of batch) {
          try {
            const shadowRank = shadow.rank || 'E';
            const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;
            const roleKey = shadow.role || 'knight';
            const role = this.shadowRoles[roleKey];

            if (!role) continue;

            // Calculate PROPER baseline stats for this rank (not capped by user stats)
            const rankBaseline = this.getRankBaselineStats(shadowRank, rankMultiplier);
            const roleWeights =
              this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;

            // Apply role weights to baseline
            const newBaseStats = {};
            Object.keys(rankBaseline).forEach((stat) => {
              const roleWeight = roleWeights[stat] || 1.0;
              // Base stat = rank baseline × role weight (with slight variance)
              const variance = 0.9 + Math.random() * 0.2; // 90%-110%
              newBaseStats[stat] = Math.max(
                1,
                Math.round(rankBaseline[stat] * roleWeight * variance)
              );
            });

            // Preserve ALL progression data
            const existingGrowthStats = shadow.growthStats || {
              strength: 0,
              agility: 0,
              intelligence: 0,
              vitality: 0,
              luck: 0,
            };

            const existingNaturalGrowthStats = shadow.naturalGrowthStats || {
              strength: 0,
              agility: 0,
              intelligence: 0,
              vitality: 0,
              luck: 0,
            };

            // Update shadow with new proper base stats
            shadow.baseStats = newBaseStats;
            shadow.growthStats = existingGrowthStats;
            shadow.naturalGrowthStats = existingNaturalGrowthStats;

            // Preserve all other data
            shadow.level = shadow.level || 1;
            shadow.xp = shadow.xp || 0;
            shadow.totalCombatTime = shadow.totalCombatTime || 0;
            shadow.lastNaturalGrowth = shadow.lastNaturalGrowth || Date.now();

            // Recalculate total strength with all stat layers
            const effectiveStats = this.getShadowEffectiveStats(shadow);
            shadow.strength = this.calculateShadowStrength(effectiveStats, 1);

            // Save to IndexedDB
            if (this.storageManager) {
              await this.storageManager.saveShadow(shadow);
            }

            // Also update localStorage if it exists
            const localIndex = (this.settings.shadows || []).findIndex((s) => s.id === shadow.id);
            if (localIndex !== -1) {
              this.settings.shadows[localIndex] = shadow;
            }

            fixed++;
          } catch (error) {
            console.error(`[ShadowArmy] Error fixing shadow ${shadow.id}:`, error);
          }
        }

        // Log progress for large batches
        if (allShadows.length > 100) {
          console.log(
            `[ShadowArmy] Fixed ${Math.min(i + batchSize, allShadows.length)}/${
              allShadows.length
            } shadows...`
          );
        }
      }

      // Save localStorage changes
      this.saveSettings();

      // Mark migration complete
      BdApi.Data.save('ShadowArmy', migrationKey, true);

      console.log(`[ShadowArmy] ✅ Fixed ${fixed} shadows to proper rank baselines!`);
      console.log('[ShadowArmy] SSS shadows now have SSS-level base stats!');

      // Invalidate buff cache
      this.cachedBuffs = null;
      this.cachedBuffsTime = null;
    } catch (error) {
      console.error('[ShadowArmy] Error in fixShadowBaseStatsToRankBaselines:', error);
      throw error;
    }
  }

  /**
   * Recalculate all shadows in IndexedDB with new exponential formula
   * This is a one-time migration to fix existing shadows
   * Operations:
   * 1. Get all shadows from IndexedDB
   * 2. For each shadow:
   *    - Get rank multiplier
   *    - Recalculate baseStats using new rank-based baseline formula
   *    - Recalculate strength
   *    - Save updated shadow
   * 3. Also update localStorage shadows if they exist
   */
  async recalculateAllShadows() {
    try {
      // Check if we've already done this migration
      const migrationKey = 'shadowArmy_recalculated_v3'; // Updated for user stat capping
      if (BdApi.Data.load('ShadowArmy', migrationKey)) {
        return; // Already migrated
      }

      console.log('[ShadowArmy] Recalculating all shadows with user stat capping formula...');

      let allShadows = [];

      // Get shadows from IndexedDB
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, 100000);
          console.log(`[ShadowArmy] Found ${allShadows.length} shadows in IndexedDB`);
        } catch (error) {
          console.error('[ShadowArmy] Error getting shadows from IndexedDB', error);
        }
      }

      // Also get shadows from localStorage as fallback
      if (this.settings.shadows && this.settings.shadows.length > 0) {
        const localStorageShadows = this.settings.shadows.filter(
          (s) => !allShadows.find((dbShadow) => dbShadow.id === s.id)
        );
        allShadows = allShadows.concat(localStorageShadows);
        console.log(
          `[ShadowArmy] Found ${localStorageShadows.length} additional shadows in localStorage`
        );
      }

      if (allShadows.length === 0) {
        console.log('[ShadowArmy] No shadows to recalculate');
        BdApi.Data.save('ShadowArmy', migrationKey, true);
        return;
      }

      let recalculated = 0;
      const batchSize = 50;

      for (let i = 0; i < allShadows.length; i += batchSize) {
        const batch = allShadows.slice(i, i + batchSize);

        for (const shadow of batch) {
          try {
            const shadowRank = shadow.rank || 'E';
            const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;
            const roleKey = shadow.role || 'knight';

            // Recalculate baseStats using new formula that caps shadows relative to user stats
            // Get current user stats for proper capping
            const soloData = this.getSoloLevelingData();
            const currentUserStats = soloData?.stats || {
              strength: 0,
              agility: 0,
              intelligence: 0,
              vitality: 0,
              luck: 0,
            };
            const newBaseStats = this.generateShadowBaseStats(
              currentUserStats,
              roleKey,
              shadowRank,
              rankMultiplier
            );

            // Preserve existing growthStats if they exist
            const existingGrowthStats = shadow.growthStats || {
              strength: 0,
              agility: 0,
              intelligence: 0,
              vitality: 0,
              luck: 0,
            };

            // Update shadow with new baseStats
            shadow.baseStats = newBaseStats;
            shadow.growthStats = existingGrowthStats;

            // Recalculate strength
            const effectiveStats = this.getShadowEffectiveStats(shadow);
            shadow.strength = this.calculateShadowStrength(effectiveStats, 1);

            // Save updated shadow
            if (this.storageManager) {
              try {
                await this.storageManager.saveShadow(shadow);
              } catch (error) {
                console.error(`[ShadowArmy] Failed to save shadow ${shadow.id}`, error);
                // Fallback: update in localStorage
                const index = (this.settings.shadows || []).findIndex((s) => s.id === shadow.id);
                if (index !== -1) {
                  this.settings.shadows[index] = shadow;
                }
              }
            } else {
              // Fallback: update in localStorage
              const index = (this.settings.shadows || []).findIndex((s) => s.id === shadow.id);
              if (index !== -1) {
                this.settings.shadows[index] = shadow;
              }
            }

            recalculated++;
          } catch (error) {
            console.error(`[ShadowArmy] Error recalculating shadow ${shadow.id}`, error);
          }
        }

        // Save progress every batch
        this.saveSettings();
      }

      // Mark migration as complete
      BdApi.Data.save('ShadowArmy', migrationKey, true);
      console.log(`[ShadowArmy] Recalculated ${recalculated} shadows with new exponential formula`);
    } catch (error) {
      console.error('[ShadowArmy] Error recalculating shadows', error);
    }
  }

  /**
   * Update UI if needed (placeholder for future UI updates)
   * Operations:
   * 1. Placeholder method for UI updates
   * 2. Can be called by SoloLevelingStats or custom UI
   */
  updateUI() {
    // Update shadow count display if it exists
    // This will be called by SoloLevelingStats or we can create our own UI
  }

  // ============================================================================
  // CSS & UI RENDERING
  // ============================================================================

  /**
   * Inject CSS styles for shadow army UI components
   * Operations:
   * 1. Check if styles already injected (prevent duplicates)
   * 2. Create style element with all CSS rules
   * 3. Append to document head
   */
  injectCSS() {
    const styleId = 'shadow-army-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .shadow-army-extraction-animation {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10000;
        pointer-events: none;
        animation: shadowExtract 2s ease-out;
      }

      .shadow-extraction-content {
        background: rgba(0, 0, 0, 0.9);
        border: 2px solid #8b5cf6;
        border-radius: 12px;
        padding: 20px 30px;
        text-align: center;
        box-shadow: 0 0 20px rgba(139, 92, 246, 0.6);
      }

      .shadow-extraction-title {
        font-size: 32px;
        font-weight: 700;
        color: #a78bfa;
        text-shadow: 0 0 10px rgba(139, 92, 246, 0.8);
        margin-bottom: 10px;
        animation: glow 1s ease-in-out infinite alternate;
      }

      .shadow-extraction-info {
        color: #d4a5ff;
        font-size: 16px;
      }

      .shadow-rank {
        font-weight: 700;
        margin-bottom: 5px;
      }

      .shadow-role {
        font-size: 14px;
        opacity: 0.8;
      }

      @keyframes shadowExtract {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.5);
        }
        20% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      @keyframes glow {
        from {
          text-shadow: 0 0 10px rgba(139, 92, 246, 0.8);
        }
        to {
          text-shadow: 0 0 20px rgba(139, 92, 246, 1), 0 0 30px rgba(139, 92, 246, 0.6);
        }
      }

      .shadow-army-extraction-animation.fade-out {
        animation: fadeOut 0.5s ease-out forwards;
      }

      @keyframes fadeOut {
        to {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8);
        }
      }

      .shadow-army-settings {
        padding: 10px;
        color: #d4a5ff;
      }

      .shadow-army-settings h2,
      .shadow-army-settings h3 {
        margin: 4px 0;
      }

      .shadow-army-stats > div,
      .shadow-army-config > div {
        margin: 2px 0;
      }

      .shadow-army-list {
        margin-top: 8px;
        max-height: 300px;
        overflow-y: auto;
        border-top: 1px solid rgba(139, 92, 246, 0.4);
        padding-top: 6px;
      }

      .shadow-list-item {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 4px 0;
        border-bottom: 1px solid rgba(139, 92, 246, 0.15);
      }

      .shadow-fav-toggle {
        border: none;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
        font-size: 16px;
        padding: 0 4px;
        transition: color 0.15s ease, transform 0.15s ease;
      }

      .shadow-fav-toggle:hover {
        color: #facc15;
        transform: scale(1.1);
      }

      .shadow-fav-active {
        color: #facc15;
      }

      .shadow-list-main {
        flex: 1;
      }

      .shadow-list-header {
        display: flex;
        gap: 8px;
        font-size: 12px;
      }

      .shadow-list-rank {
        font-weight: 700;
        color: #f97316;
      }

      .shadow-list-role {
        color: #a5b4fc;
      }

      .shadow-list-strength {
        color: #34d399;
      }

      .shadow-list-meta {
        font-size: 11px;
        opacity: 0.8;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .shadow-list-empty {
        font-size: 12px;
        opacity: 0.8;
      }

      .shadow-army-button {
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: var(--interactive-normal, #b9bbbe);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        margin: 0 2px;
        flex-shrink: 0;
        padding: 6px;
        box-sizing: border-box;
      }
      .shadow-army-button svg {
        width: 20px;
        height: 20px;
        transition: all 0.2s ease;
        display: block;
      }
      .shadow-army-button:hover {
        background: var(--background-modifier-hover, rgba(4, 4, 5, 0.6));
        color: var(--interactive-hover, #dcddde);
      }
      .shadow-army-button:hover svg {
        transform: scale(1.1);
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Remove injected CSS styles
   * Operations:
   * 1. Find style element by ID
   * 2. Remove from document head if found
   */
  removeCSS() {
    const style = document.getElementById('shadow-army-styles');
    if (style) style.remove();
  }

  // ============================================================================
  // UI METHODS (CHAT BUTTON & MODAL)
  // ============================================================================

  /**
   * Find Discord's toolbar/button container
   * Operations:
   * 1. Look for existing TitleManager or SkillTree buttons to find toolbar
   * 2. Fallback to finding by Discord button classes
   * 3. Fallback to finding by textarea and traversing DOM
   */
  findToolbar() {
    // Method 1: Look for existing TitleManager or SkillTree buttons to find toolbar
    const titleBtn = document.querySelector('.tm-title-button');
    const skillTreeBtn = document.querySelector('.st-skill-tree-button');
    if (titleBtn && titleBtn.parentElement) {
      return titleBtn.parentElement;
    }
    if (skillTreeBtn && skillTreeBtn.parentElement) {
      return skillTreeBtn.parentElement;
    }

    // Method 2: Find by looking for common Discord button classes
    const buttonRow =
      Array.from(document.querySelectorAll('[class*="button"]')).find((el) => {
        const siblings = Array.from(el.parentElement?.children || []);
        return (
          siblings.length >= 4 &&
          siblings.some(
            (s) =>
              s.querySelector('[class*="emoji"]') ||
              s.querySelector('[class*="gif"]') ||
              s.querySelector('[class*="attach"]') ||
              s.classList.contains('tm-title-button') ||
              s.classList.contains('st-skill-tree-button')
          )
        );
      })?.parentElement ||
      (() => {
        const textArea =
          document.querySelector('[class*="channelTextArea"]') ||
          document.querySelector('[class*="slateTextArea"]') ||
          document.querySelector('textarea[placeholder*="Message"]');
        if (!textArea) return null;
        let container =
          textArea.closest('[class*="container"]') ||
          textArea.closest('[class*="wrapper"]') ||
          textArea.parentElement?.parentElement?.parentElement;
        const buttons = container?.querySelectorAll('[class*="button"]');
        if (buttons && buttons.length >= 4) {
          return buttons[0]?.parentElement;
        }
        return (
          container?.querySelector('[class*="buttons"]') ||
          container?.querySelector('[class*="buttonContainer"]') ||
          container?.querySelector('[class*="toolbar"]')
        );
      })();
    return buttonRow;
  }

  /**
   * Create ShadowArmy button in chat toolbar
   */
  async createShadowArmyButton() {
    // Re-entrance guard: prevent infinite loops during button creation
    if (this._creatingShadowArmyButton) {
      return;
    }
    this._creatingShadowArmyButton = true;

    try {
      // Remove existing button first to avoid duplicates
      const existingShadowArmyBtn = document.querySelector('.shadow-army-button');
      if (existingShadowArmyBtn) existingShadowArmyBtn.remove();
      this.shadowArmyButton = null;

      const toolbar = this.findToolbar();
      if (!toolbar) {
        // Retry with exponential backoff
        // Clear any existing retry timeout before scheduling a new one
        if (this._shadowArmyButtonRetryTimeout) {
          clearTimeout(this._shadowArmyButtonRetryTimeout);
          this._shadowArmyButtonRetryTimeout = null;
        }
        const retryCount = (this._shadowArmyButtonRetryCount || 0) + 1;
        this._shadowArmyButtonRetryCount = retryCount;
        const delay = Math.min(1000 * retryCount, 5000);
        this._shadowArmyButtonRetryTimeout = setTimeout(() => {
          this._shadowArmyButtonRetryTimeout = null;
          this._creatingShadowArmyButton = false;
          this.createShadowArmyButton();
        }, delay);
        return;
      }
      this._shadowArmyButtonRetryCount = 0;

      // Create ShadowArmy button with shadow/skull icon
      const shadowArmyButton = document.createElement('button');
      shadowArmyButton.className = 'shadow-army-button';
      // Enhanced SVG with dynamic shadow count badge
      // Get count from IndexedDB if available, otherwise fallback to settings
      let shadowCount = 0;
      if (this.storageManager && this.storageManager.getTotalCount) {
        try {
          shadowCount = await this.storageManager.getTotalCount();
        } catch (error) {
          shadowCount = this.settings.shadows?.length || 0;
        }
      } else {
        shadowCount = this.settings.shadows?.length || 0;
      }

      shadowArmyButton.innerHTML = `
      <div style="position: relative;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        ${
          shadowCount > 0
            ? `<span style="
          position: absolute;
          top: -4px;
          right: -6px;
          background: #8b5cf6;
          color: white;
          border-radius: 8px;
          padding: 1px 4px;
          font-size: 9px;
          font-weight: bold;
          min-width: 14px;
          text-align: center;
        ">${shadowCount > 999 ? '999+' : shadowCount}</span>`
            : ''
        }
      </div>
    `;
      shadowArmyButton.title = `Shadow Army (${shadowCount} shadows)`;
      shadowArmyButton.addEventListener('click', () => this.openShadowArmyUI());

      const skillTreeBtn = toolbar.querySelector('.st-skill-tree-button');
      const titleBtn = toolbar.querySelector('.tm-title-button');
      const appsButton = Array.from(toolbar.children).find(
        (el) =>
          el.querySelector('[class*="apps"]') ||
          el.getAttribute('aria-label')?.toLowerCase().includes('app')
      );

      // Insert ShadowArmy button after Skill Tree (third position)
      let inserted = false;

      if (skillTreeBtn && skillTreeBtn.parentElement === toolbar) {
        // Insert after Skill Tree button
        toolbar.insertBefore(shadowArmyButton, skillTreeBtn.nextSibling);
        inserted = true;
      } else if (titleBtn && titleBtn.parentElement === toolbar) {
        // Insert after Title button
        toolbar.insertBefore(shadowArmyButton, titleBtn.nextSibling);
        inserted = true;
      } else if (appsButton && appsButton.parentElement === toolbar) {
        // Insert before apps button
        toolbar.insertBefore(shadowArmyButton, appsButton);
        inserted = true;
      }

      // Fallback: append to end if couldn't find reference buttons
      if (!inserted) {
        toolbar.appendChild(shadowArmyButton);
      }

      // Store reference
      this.shadowArmyButton = shadowArmyButton;

      // Ensure button is visible
      shadowArmyButton.style.display = 'flex';

      // Observe toolbar for changes
      this.observeToolbar(toolbar);

    } finally {
      // Always clear the creation flag
      this._creatingShadowArmyButton = false;
    }
  }

  /**
   * Observe toolbar for changes and recreate button if needed
   */
  observeToolbar(toolbar) {
    if (this.toolbarObserver) {
      this.toolbarObserver.disconnect();
    }

    // Clear any existing interval check
    if (this.toolbarCheckInterval) {
      clearInterval(this.toolbarCheckInterval);
      this.toolbarCheckInterval = null;
    }

    // Clear any existing timeout
    if (this._recreateTimeout) {
      clearTimeout(this._recreateTimeout);
      this._recreateTimeout = null;
    }

    // Simple check: if button removed, recreate it immediately
    // Matches SkillTree's successful pattern
    this.toolbarObserver = new MutationObserver(() => {
      // Clear any pending timeout to debounce rapid changes
      if (this._recreateTimeout) {
        clearTimeout(this._recreateTimeout);
      }

      // Use instance variable so timeout persists
      this._recreateTimeout = setTimeout(() => {
        const shadowBtnExists = this.shadowArmyButton && toolbar.contains(this.shadowArmyButton);
        if (!shadowBtnExists && !this._creatingShadowArmyButton) {
          this.createShadowArmyButton();
        }
        this._recreateTimeout = null;
      }, 100);
    });

    this.toolbarObserver.observe(toolbar, { childList: true, subtree: true });
  }

  /**
   * Remove ShadowArmy button from toolbar
   */
  removeShadowArmyButton() {
    if (this.shadowArmyButton) {
      this.shadowArmyButton.remove();
      this.shadowArmyButton = null;
    }
    if (this.toolbarObserver) {
      this.toolbarObserver.disconnect();
      this.toolbarObserver = null;
    }
    if (this.toolbarCheckInterval) {
      clearInterval(this.toolbarCheckInterval);
      this.toolbarCheckInterval = null;
    }
    if (this._recreateTimeout) {
      clearTimeout(this._recreateTimeout);
      this._recreateTimeout = null;
    }
  }

  /**
   * Open ShadowArmy UI modal
   */
  async openShadowArmyUI() {
    if (this.shadowArmyModal) {
      this.closeShadowArmyModal();
      return;
    }

    try {
      // Get all shadows from IndexedDB or localStorage
      let shadows = [];
      if (this.storageManager && this.storageManager.getShadows) {
        try {
          shadows = await this.storageManager.getShadows({}, 0, 10000);
        } catch (err) {
          console.warn('ShadowArmy: Could not get shadows from IndexedDB', err);
          shadows = this.settings.shadows || [];
        }
      } else {
        shadows = this.settings.shadows || [];
      }

      const total = shadows.length;

      // Create modal similar to TitleManager/SkillTree
      const modal = document.createElement('div');
      modal.className = 'shadow-army-modal';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        z-index: 10002;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(5px);
      `;

      // Filter state
      let currentFilter = 'all'; // all, generals, rank, role
      let currentRankFilter = '';
      let currentRoleFilter = '';
      let searchQuery = '';

      // Baseline stats for rank-up calculations
      const baselineStats = {
        E: 10,
        D: 25,
        C: 50,
        B: 100,
        A: 200,
        S: 400,
        SS: 800,
        SSS: 1600,
        Monarch: 3200,
      };

      const renderModal = () => {
        // Calculate generals (top 7 strongest) - DYNAMIC, recalculates on each render
        shadows.forEach((shadow) => {
          if (!shadow.strength || shadow.strength === 0) {
            const effectiveStats = this.getShadowEffectiveStats(shadow);
            shadow.strength = this.calculateShadowStrength(effectiveStats, 1);
          }
        });
        const sortedByPower = [...shadows].sort((a, b) => (b.strength || 0) - (a.strength || 0));
        const generalIds = new Set(sortedByPower.slice(0, 7).map((s) => s.id));

        let filteredShadows = shadows;

        // Apply filters
        if (currentFilter === 'generals') {
          filteredShadows = filteredShadows.filter((s) => generalIds.has(s.id));
        }
        if (currentRankFilter) {
          filteredShadows = filteredShadows.filter((s) => s.rank === currentRankFilter);
        }
        if (currentRoleFilter) {
          filteredShadows = filteredShadows.filter(
            (s) => (s.role || s.roleName) === currentRoleFilter
          );
        }
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filteredShadows = filteredShadows.filter(
            (s) =>
              (s.roleName || s.role || '').toLowerCase().includes(query) ||
              s.rank.toLowerCase().includes(query) ||
              s.id.toLowerCase().includes(query)
          );
        }

        // Sort shadows by rank (higher to lower)
        const rankOrder = [
          'Shadow Monarch',
          'Monarch+',
          'Monarch',
          'NH',
          'SSS+',
          'SSS',
          'SS',
          'S',
          'A',
          'B',
          'C',
          'D',
          'E',
        ];
        const getRankIndex = (rank) => {
          const index = rankOrder.indexOf(rank);
          return index === -1 ? 999 : index; // Unknown ranks go to end
        };
        filteredShadows.sort((a, b) => getRankIndex(a.rank) - getRankIndex(b.rank));

        // Get unique ranks and roles for filters
        const ranks = [...new Set(shadows.map((s) => s.rank))].sort(
          (a, b) => getRankIndex(a) - getRankIndex(b)
        );
        const roles = [...new Set(shadows.map((s) => s.role || s.roleName).filter(Boolean))].sort();

        modal.innerHTML = `
          <div style="
            width: 90%;
            max-width: 800px;
            max-height: 90vh;
            background: #1e1e1e;
            border: 2px solid #8b5cf6;
            border-radius: 12px;
            padding: 20px;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
              <h2 style="color: #8b5cf6; margin: 0;">Shadow Army</h2>
              <button id="close-shadow-army-modal" style="
                background: transparent;
                border: none;
                color: #999;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
              ">×</button>
            </div>

            <div style="margin-bottom: 20px;">
              <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
                <button class="sa-filter-btn" data-filter="all" style="
                  padding: 6px 12px;
                  background: ${currentFilter === 'all' ? '#8b5cf6' : 'rgba(139, 92, 246, 0.2)'};
                  border: 1px solid #8b5cf6;
                  border-radius: 6px;
                  color: white;
                  cursor: pointer;
                ">All (${total})</button>
                <button class="sa-filter-btn" data-filter="generals" style="
                  padding: 6px 12px;
                  background: ${
                    currentFilter === 'generals' ? '#8b5cf6' : 'rgba(139, 92, 246, 0.2)'
                  };
                  border: 1px solid #8b5cf6;
                  border-radius: 6px;
                  color: white;
                  cursor: pointer;
                ">👑 Generals (7)</button>
                <select id="sa-rank-filter" style="
                  padding: 6px 12px;
                  background: rgba(139, 92, 246, 0.2);
                  border: 1px solid #8b5cf6;
                  border-radius: 6px;
                  color: white;
                  cursor: pointer;
                ">
                  <option value="">All Ranks</option>
                  ${ranks
                    .map(
                      (r) =>
                        `<option value="${r}" ${
                          currentRankFilter === r ? 'selected' : ''
                        }>${r}</option>`
                    )
                    .join('')}
                </select>
                <select id="sa-role-filter" style="
                  padding: 6px 12px;
                  background: rgba(139, 92, 246, 0.2);
                  border: 1px solid #8b5cf6;
                  border-radius: 6px;
                  color: white;
                  cursor: pointer;
                ">
                  <option value="">All Roles</option>
                  ${roles
                    .map(
                      (r) =>
                        `<option value="${r}" ${
                          currentRoleFilter === r ? 'selected' : ''
                        }>${r}</option>`
                    )
                    .join('')}
                </select>
                <input type="text" id="sa-search" placeholder="Search..." value="${searchQuery}" style="
                  padding: 6px 12px;
                  background: rgba(139, 92, 246, 0.2);
                  border: 1px solid #8b5cf6;
                  border-radius: 6px;
                  color: white;
                  flex: 1;
                  min-width: 150px;
                ">
              </div>
              <div style="color: #999; font-size: 12px;">
                Showing ${Math.min(50, filteredShadows.length)} of ${
          filteredShadows.length
        } filtered (${total} total)
              </div>
            </div>

            <!-- Army Summary Dashboard -->
            <div style="
              background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(168, 85, 247, 0.1));
              border: 1px solid #8b5cf6;
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 12px;
            ">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; margin-bottom: 8px;">
                <div style="text-align: center;">
                  <div style="color: #8b5cf6; font-size: 20px; font-weight: bold;">${
                    shadows.length
                  }</div>
                  <div style="color: #999; font-size: 11px;">Total Shadows</div>
                </div>
                <div style="text-align: center;">
                  <div style="color: #34d399; font-size: 20px; font-weight: bold;">${Math.floor(
                    shadows.reduce((sum, s) => sum + (s.level || 1), 0) /
                      Math.max(1, shadows.length)
                  )}</div>
                  <div style="color: #999; font-size: 11px;">Avg Level</div>
                </div>
                <div style="text-align: center;">
                  <div style="color: #fbbf24; font-size: 20px; font-weight: bold;">${
                    shadows.filter((s) => {
                      const stats = this.getShadowEffectiveStats(s);
                      const avg =
                        (stats.strength +
                          stats.agility +
                          stats.intelligence +
                          stats.vitality +
                          stats.luck) /
                        5;
                      const shadowRanks = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'Monarch'];
                      const idx = shadowRanks.indexOf(s.rank);
                      const next = shadowRanks[idx + 1];
                      const baseline = baselineStats[next] || 9999;
                      return next && avg >= baseline * 0.8;
                    }).length
                  }</div>
                  <div style="color: #999; font-size: 11px;">Ready Rank-Up</div>
                </div>
                <div style="text-align: center;">
                  <div style="color: #ef4444; font-size: 20px; font-weight: bold;">${Math.floor(
                    shadows.reduce((sum, s) => sum + (s.totalCombatTime || 0), 0)
                  )}h</div>
                  <div style="color: #999; font-size: 11px;">Total Combat</div>
                </div>
              </div>
              <div style="font-size: 10px; color: #888; text-align: center;">
                ${shadows.filter((s) => s.rank === 'SSS').length} SSS |
                ${shadows.filter((s) => s.rank === 'SS').length} SS |
                ${shadows.filter((s) => s.rank === 'S').length} S |
                ${shadows.filter((s) => s.rank === 'A').length} A |
                ${shadows.filter((s) => s.rank === 'B').length} B |
                ${shadows.filter((s) => s.rank === 'C').length} C |
                ${shadows.filter((s) => s.rank === 'D').length} D |
                ${shadows.filter((s) => s.rank === 'E').length} E
              </div>
            </div>

            <div style="max-height: 60vh; overflow-y: auto;">
              ${
                filteredShadows.length > 50
                  ? `
                <div style="background: rgba(251, 191, 36, 0.2); padding: 8px; border-radius: 6px; margin-bottom: 10px; font-size: 12px; color: #fbbf24; text-align: center;">
                  Showing first 50 of ${filteredShadows.length} shadows (use filters to narrow down)
                </div>
              `
                  : ''
              }
              ${
                filteredShadows.length === 0
                  ? `
                <div style="text-align: center; padding: 40px; color: #999;">
                  No shadows found matching filters
                </div>
              `
                  : filteredShadows
                      .slice(0, 50) // Pagination: Show first 50 for performance
                      .map((shadow) => {
                        const isGeneral = generalIds.has(shadow.id);

                        // Calculate effective stats (base + growth + natural)
                        const effectiveStats = this.getShadowEffectiveStats(shadow);
                        const avgStats =
                          (effectiveStats.strength +
                            effectiveStats.agility +
                            effectiveStats.intelligence +
                            effectiveStats.vitality +
                            effectiveStats.luck) /
                          5;

                        // XP progress to next level
                        const xpNeeded = this.getShadowXpForNextLevel(
                          shadow.level || 1,
                          shadow.rank
                        );
                        const xpProgress = ((shadow.xp || 0) / xpNeeded) * 100;

                        // Rank-up readiness
                        const baselineStats = {
                          E: 10,
                          D: 25,
                          C: 50,
                          B: 100,
                          A: 200,
                          S: 400,
                          SS: 800,
                          SSS: 1600,
                          Monarch: 3200,
                        };
                        const shadowRanks = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'Monarch'];
                        const currentRankIndex = shadowRanks.indexOf(shadow.rank);
                        const nextRank = shadowRanks[currentRankIndex + 1];
                        const nextBaseline = baselineStats[nextRank] || 9999;
                        const rankUpProgress = (avgStats / (nextBaseline * 0.8)) * 100;
                        const canRankUp = nextRank && avgStats >= nextBaseline * 0.8;

                        // Growth indicators
                        const naturalGrowth = shadow.naturalGrowthStats || {};
                        const hasNaturalGrowth = (naturalGrowth.strength || 0) > 0;
                        const combatTime = Math.floor((shadow.totalCombatTime || 0) * 10) / 10;

                        return `
                  <div class="sa-shadow-item" data-shadow-id="${shadow.id}" style="
                    background: ${
                      isGeneral ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.05)'
                    };
                    border: 2px solid ${isGeneral ? '#fbbf24' : '#444'};
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 10px;
                    ${isGeneral ? 'box-shadow: 0 0 15px rgba(251, 191, 36, 0.3);' : ''}
                  ">
                    <div style="display: flex; align-items: start; gap: 8px;">
                      ${
                        isGeneral
                          ? `
                        <div style="
                          background: linear-gradient(135deg, #fbbf24, #f59e0b);
                          color: #000;
                          font-size: 16px;
                          font-weight: bold;
                          padding: 4px 6px;
                          border-radius: 6px;
                          width: 32px;
                          height: 32px;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                        ">👑</div>
                      `
                          : ''
                      }

                      <div style="flex: 1;">
                        <!-- Header -->
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
                          ${
                            isGeneral
                              ? '<span style="color: #fbbf24; font-size: 11px; font-weight: bold; background: rgba(251, 191, 36, 0.2); padding: 2px 6px; border-radius: 4px;">GENERAL</span>'
                              : ''
                          }
                          <span style="color: #8b5cf6; font-weight: bold; font-size: 14px;">${
                            shadow.rank
                          }</span>
                          <span style="color: #999; font-size: 13px;">${
                            shadow.roleName || shadow.role || 'Unknown'
                          }</span>
                          ${
                            canRankUp
                              ? '<span style="color: #34d399; font-size: 11px; background: rgba(52, 211, 153, 0.2); padding: 2px 6px; border-radius: 4px;">RANK UP!</span>'
                              : ''
                          }
                          <span style="color: #34d399; margin-left: auto; font-size: 13px; font-weight: bold;">⚡ ${
                            shadow.strength || 0
                          }</span>
                        </div>

                        <!-- Level & XP Bar -->
                        <div style="margin-bottom: 6px;">
                          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #999; margin-bottom: 2px;">
                            <span>Level ${shadow.level || 1}</span>
                            <span>${shadow.xp || 0} / ${xpNeeded} XP</span>
                          </div>
                          <div style="background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="background: linear-gradient(90deg, #8b5cf6, #a78bfa); width: ${xpProgress}%; height: 100%; transition: width 0.3s;"></div>
                          </div>
                        </div>

                        <!-- Stats Breakdown -->
                        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 6px; font-size: 10px;">
                          <div style="text-align: center; background: rgba(239, 68, 68, 0.15); padding: 3px; border-radius: 3px;">
                            <div style="color: #ef4444; font-weight: bold;">STR</div>
                            <div style="color: #999;">${effectiveStats.strength || 0}</div>
                          </div>
                          <div style="text-align: center; background: rgba(34, 197, 94, 0.15); padding: 3px; border-radius: 3px;">
                            <div style="color: #22c55e; font-weight: bold;">AGI</div>
                            <div style="color: #999;">${effectiveStats.agility || 0}</div>
                          </div>
                          <div style="text-align: center; background: rgba(59, 130, 246, 0.15); padding: 3px; border-radius: 3px;">
                            <div style="color: #3b82f6; font-weight: bold;">INT</div>
                            <div style="color: #999;">${effectiveStats.intelligence || 0}</div>
                          </div>
                          <div style="text-align: center; background: rgba(168, 85, 247, 0.15); padding: 3px; border-radius: 3px;">
                            <div style="color: #a855f7; font-weight: bold;">VIT</div>
                            <div style="color: #999;">${effectiveStats.vitality || 0}</div>
                          </div>
                          <div style="text-align: center; background: rgba(251, 191, 36, 0.15); padding: 3px; border-radius: 3px;">
                            <div style="color: #fbbf24; font-weight: bold;">LUK</div>
                            <div style="color: #999;">${effectiveStats.luck || 0}</div>
                          </div>
                        </div>

                        <!-- Growth Indicators -->
                        <div style="display: flex; gap: 8px; font-size: 10px; color: #666;">
                          ${
                            combatTime > 0
                              ? `<span style="color: #34d399;">⏱ ${combatTime}h combat</span>`
                              : ''
                          }
                          ${
                            hasNaturalGrowth
                              ? `<span style="color: #fbbf24;">+${
                                  naturalGrowth.strength || 0
                                } natural</span>`
                              : ''
                          }
                          ${
                            canRankUp
                              ? `<span style="color: #34d399;">→ ${nextRank}</span>`
                              : nextRank
                              ? `<span style="color: #666;">${Math.floor(
                                  rankUpProgress
                                )}% to ${nextRank}</span>`
                              : ''
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                `;
                      })
                      .join('')
              }
            </div>
          </div>
        `;

        // Attach event listeners
        modal.querySelector('#close-shadow-army-modal').addEventListener('click', () => {
          this.closeShadowArmyModal();
        });

        modal.querySelectorAll('.sa-filter-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            currentFilter = btn.dataset.filter;
            renderModal();
          });
        });

        modal.querySelector('#sa-rank-filter').addEventListener('change', (e) => {
          currentRankFilter = e.target.value;
          renderModal();
        });

        modal.querySelector('#sa-role-filter').addEventListener('change', (e) => {
          currentRoleFilter = e.target.value;
          renderModal();
        });

        modal.querySelector('#sa-search').addEventListener('input', (e) => {
          searchQuery = e.target.value;
          renderModal();
        });

        // Note: No favorite toggle buttons - generals are auto-selected by power

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            this.closeShadowArmyModal();
          }
        });
      };

      renderModal();
      document.body.appendChild(modal);
      this.shadowArmyModal = modal;

      // Real-time updates: Re-fetch and re-render every 3 seconds
      const autoRefreshInterval = setInterval(async () => {
        if (!this.shadowArmyModal || !document.body.contains(modal)) {
          clearInterval(autoRefreshInterval);
          return;
        }

        try {
          // Re-fetch shadows for real-time stats
          if (this.storageManager && this.storageManager.getShadows) {
            shadows = await this.storageManager.getShadows({}, 0, 10000);
            renderModal();
          }
        } catch (error) {
          console.error('[ShadowArmy] Error refreshing UI:', error);
        }
      }, 3000); // Refresh every 3 seconds for real-time updates

    } catch (error) {
      console.error('ShadowArmy: Failed to open UI', error);
    }
  }

  /**
   * Close ShadowArmy UI modal
   */
  closeShadowArmyModal() {
    if (this.shadowArmyModal) {
      this.shadowArmyModal.remove();
      this.shadowArmyModal = null;
    }
  }

  /**
   * Generate settings panel HTML for BetterDiscord settings UI
   * Operations:
   * 1. Get total shadow count and favorites
   * 2. Create Set of favorite IDs for lookup
   * 3. Generate list items for first 50 shadows
   * 4. Format extraction config display
   * 5. Return HTML string with stats, config, and shadow list
   */
  getSettingsPanel() {
    // Note: BetterDiscord settings panels are synchronous, so we use fallback data
    // For full IndexedDB data, the panel will show cached/localStorage data
    const favoriteIds = new Set(this.settings.favoriteShadowIds || []);
    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    // Get shadows from localStorage fallback (for display)
    // Full data is in IndexedDB but we show what's available synchronously
    const shadowsForDisplay = this.settings.shadows || [];
    const total = shadowsForDisplay.length;
    const maxList = 50;

    const listItems = shadowsForDisplay
      .slice(0, maxList)
      .map((shadow, index) => {
        const isFavorite = favoriteIds.has(shadow.id);
        const starClass = isFavorite ? 'shadow-fav-toggle shadow-fav-active' : 'shadow-fav-toggle';
        const extractedDate = new Date(shadow.extractedAt).toLocaleString();
        // Sanitize shadow ID to prevent XSS (remove quotes and escape)
        const safeId = String(shadow.id).replace(/['"]/g, '');
        return `
          <div class="shadow-list-item">
            <button class="${starClass}"
              data-shadow-id="${safeId}"
              onclick="try { const p = BdApi.Plugins.get('ShadowArmy'); const btn = event.target.closest('button[data-shadow-id]'); if (btn) { (p.instance || p).toggleFavorite(btn.dataset.shadowId); } } catch (e) { console.error(e); }">

            </button>
            <div class="shadow-list-main">
              <div class="shadow-list-header">
                <span class="shadow-list-rank">${shadow.rank}-Rank</span>
                <span class="shadow-list-role">${shadow.roleName || shadow.role}</span>
                <span class="shadow-list-strength">Power: ${shadow.strength}</span>
              </div>
              <div class="shadow-list-meta">
                <span>Shadow Lv. ${shadow.level || 1}</span>
                <span>Extracted: ${extractedDate}</span>
                <span>ID: ${shadow.id}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const storageInfo = this.storageManager
      ? '<div style="color: #34d399; font-size: 11px; margin-top: 4px;">Using IndexedDB storage (scalable)</div>'
      : '<div style="color: #facc15; font-size: 11px; margin-top: 4px;">Using localStorage (limited to ~5,000 shadows)</div>';

    return `
      <div class="shadow-army-settings">
        <h2>Shadow Army</h2>
        ${storageInfo}
        <div class="shadow-army-stats">
          <div>Total Shadows: ${total}${this.storageManager ? ' (from cache)' : ''}</div>
          <div>Total Extracted: ${this.settings.totalShadowsExtracted}</div>
          <div>Favorite Generals: ${(this.settings.favoriteShadowIds || []).length} / ${
      this.settings.favoriteLimit || 7
    }</div>
        </div>
        <div class="shadow-army-config">
          <h3>Extraction Config</h3>
          <div>Min Base Chance: ${(cfg.minBaseChance * 100).toFixed(2)}%</div>
          <div>Chance per INT: ${(cfg.chancePerInt * 100).toFixed(2)}% / INT</div>
          <div>Max Extraction Chance (Hard Cap): ${(
            (cfg.maxExtractionChance || 0.15) * 100
          ).toFixed(1)}%</div>
          <div>Max Extractions / Minute: ${cfg.maxExtractionsPerMinute}</div>
          <div>Special ARISE Max Chance: ${(cfg.specialMaxChance * 100).toFixed(1)}%</div>
          <div>Special ARISE Max / Day: ${cfg.specialMaxPerDay}</div>
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(139, 92, 246, 0.3);">
            <div style="font-size: 11px; opacity: 0.8;">Stats Influence: INT +1%, PER +0.5%, STR +0.3% per point</div>
            <div style="font-size: 11px; opacity: 0.8;">Lore: Can't extract targets 2+ ranks stronger</div>
            <div style="font-size: 11px; opacity: 0.8;">Max 3 extraction attempts per target</div>
          </div>
        </div>
        <div class="shadow-army-list">
          <h3>Shadows (first ${maxList})</h3>
          ${
            total === 0
              ? '<div class="shadow-list-empty">No shadows extracted yet. Send messages to begin extraction.</div>'
              : listItems
          }
        </div>
      </div>
    `;
  }
};
