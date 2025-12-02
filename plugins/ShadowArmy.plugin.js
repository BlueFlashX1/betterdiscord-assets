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
      if (!oldData || !oldData.shadows || !Array.isArray(oldData.shadows) || oldData.shadows.length === 0) {
        this.migrationCompleted = true;
        return { migrated: false, reason: 'No data to migrate' };
      }

      console.log(`ShadowStorageManager: Migrating ${oldData.shadows.length} shadows from localStorage`);

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
  async getShadows(filters = {}, offset = 0, limit = 50, sortBy = 'extractedAt', sortOrder = 'desc') {
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
    if (
      this.aggregatedPowerCache &&
      Date.now() - this.aggregatedPowerCacheTime < this.cacheTTL
    ) {
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
      favoriteShadowIds: [], // Up to 7 "general" shadows (favorites)
      favoriteLimit: 7,
      extractionConfig: {
        // Base extraction tuning
        minBaseChance: 0.001, // 0.1% minimum
        chancePerInt: 0.005, // +0.5% per INT
        maxExtractionsPerMinute: 20, // hard safety cap
        // Special ARISE event tuning
        specialBaseChance: 0.01, // 1% base
        specialIntMultiplier: 0.003, // +0.3% per INT
        specialLuckMultiplier: 0.002, // +0.2% per Luck (perception proxy)
        specialMaxChance: 0.3, // 30% hard cap
        specialMaxPerDay: 5, // limit special events per day
      },
      specialArise: {
        lastDate: null,
        countToday: 0,
      },
    };

    // Shadow ranks (matching Solo Leveling rank system)
    this.shadowRanks = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SSS+', 'NH', 'Monarch', 'Monarch+', 'Shadow Monarch'];

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
    };

    // Stat weight templates per role (used to generate per-shadow stats)
    // Higher weight = that role favors that stat more
    this.shadowRoleStatWeights = {
      tank:        { strength: 0.8, agility: 0.4, intelligence: 0.2, vitality: 1.2, luck: 0.3 },
      healer:      { strength: 0.3, agility: 0.3, intelligence: 0.9, vitality: 1.1, luck: 0.8 },
      mage:        { strength: 0.2, agility: 0.5, intelligence: 1.3, vitality: 0.5, luck: 0.5 },
      assassin:    { strength: 0.7, agility: 1.4, intelligence: 0.4, vitality: 0.4, luck: 0.6 },
      ranger:      { strength: 0.5, agility: 1.0, intelligence: 0.9, vitality: 0.5, luck: 0.6 },
      knight:      { strength: 1.0, agility: 0.9, intelligence: 0.5, vitality: 1.0, luck: 0.4 },
      berserker:   { strength: 1.4, agility: 0.7, intelligence: 0.2, vitality: 0.6, luck: 0.3 },
      support:     { strength: 0.3, agility: 0.5, intelligence: 1.0, vitality: 0.7, luck: 1.1 },
    };

    this.settings = this.defaultSettings;
    this.soloPlugin = null;

    // IndexedDB storage manager
    this.storageManager = null;
    this.userId = null;

    // Extraction attempt tracking (Solo Leveling lore: max 3 attempts per target)
    this.extractionAttempts = {}; // { targetId: { count: number, lastAttempt: timestamp } }

    // Rank probability multipliers (lower ranks easier, higher ranks exponentially harder)
    this.rankProbabilityMultipliers = {
      'E': 10.0,      // Very common (10x base chance)
      'D': 5.0,       // Common (5x base chance)
      'C': 2.5,       // Uncommon (2.5x base chance)
      'B': 1.0,       // Normal (1x base chance)
      'A': 0.5,       // Rare (0.5x base chance)
      'S': 0.2,       // Very rare (0.2x base chance)
      'SS': 0.1,      // Extremely rare (0.1x base chance)
      'SSS': 0.05,    // Ultra rare (0.05x base chance)
      'SSS+': 0.02,   // Legendary (0.02x base chance)
      'NH': 0.01,     // Mythic (0.01x base chance)
      'Monarch': 0.005,    // Near impossible (0.005x base chance)
      'Monarch+': 0.001,   // Almost never (0.001x base chance)
      'Shadow Monarch': 0.0001, // Once in a lifetime (0.0001x base chance)
    };

    // Exponential stat multipliers per rank (1.5x per rank)
    this.rankStatMultipliers = {
      'E': 1.0,           // Base (100%)
      'D': 1.5,           // 150% (1.5x)
      'C': 2.25,          // 225% (1.5^2)
      'B': 3.375,         // 337.5% (1.5^3)
      'A': 5.0625,        // 506.25% (1.5^4)
      'S': 7.59375,       // 759.375% (1.5^5)
      'SS': 11.390625,    // 1139% (1.5^6)
      'SSS': 17.0859375,  // 1708% (1.5^7)
      'SSS+': 25.62890625, // 2562% (1.5^8)
      'NH': 38.443359375,  // 3844% (1.5^9)
      'Monarch': 57.6650390625,      // 5766% (1.5^10)
      'Monarch+': 86.49755859375,    // 8649% (1.5^11)
      'Shadow Monarch': 129.746337890625, // 12974% (1.5^12)
    };
  }

  // ============================================================================
  // LIFECYCLE METHODS
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
      console.warn('ShadowArmy: IndexedDB initialization failed, using localStorage fallback', error);
      this.storageManager = null;
    }

    this.loadSettings();
    this.injectCSS();
    this.integrateWithSoloLeveling();
    this.setupMessageListener();
    console.log('ShadowArmy: Plugin started');
  }

  /**
   * Stop the ShadowArmy plugin and clean up resources
   * Operations:
   * 1. Remove message listener to prevent memory leaks
   * 2. Remove injected CSS styles
   */
  stop() {
    this.removeMessageListener();
    this.removeCSS();

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
      const UserStore = BdApi.Webpack?.getStore?.('UserStore') || BdApi.Webpack?.getModule?.(m => m?.getCurrentUser);
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
        // Ensure favorites array exists
        if (!Array.isArray(this.settings.favoriteShadowIds)) {
          this.settings.favoriteShadowIds = [];
        }
        if (typeof this.settings.favoriteLimit !== 'number') {
          this.settings.favoriteLimit = 7;
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
        // Load extraction attempts tracking
        if (saved.extractionAttempts) {
          this.extractionAttempts = saved.extractionAttempts;
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
      this.extractionTimestamps = this.extractionTimestamps.filter(
        (t) => now - t < 60 * 1000
      );
      if (this.extractionTimestamps.length >= (cfg.maxExtractionsPerMinute || 20)) {
        return;
      }

      // Determine extractable ranks (lore: can't extract significantly stronger - max 2 ranks above)
      const extractableRanks = this.determineExtractableRanks(rank, stats);
      if (extractableRanks.length === 0) {
        return; // No extractable ranks
      }

      // Calculate extraction chance for each rank with stats influence
      const rankChances = extractableRanks.map((r) => {
        const chance = this.calculateExtractionChance(
          rank,
          stats,
          r.rank,
          0, // Target strength (will be calculated during generation)
          intelligence,
          perception,
          strength
        );
        return { rank: r.rank, chance, multiplier: r.multiplier };
      });

      // Select target rank based on weighted probabilities
      const selectedRank = this.selectRankByProbability(rankChances);
      if (!selectedRank) return;

      // Check extraction attempt limit (lore: max 3 attempts per target)
      // Use message hash or timestamp as target identifier
      const targetId = `msg_${now}`; // Simplified - could use message hash
      if (!this.canExtractFromTarget(targetId)) {
        return; // Max attempts reached for this target
      }

      // Calculate final extraction chance for selected rank
      const finalChance = this.calculateExtractionChance(
        rank,
        stats,
        selectedRank,
        0,
        intelligence,
        perception,
        strength
      );

      // Roll for extraction
      const roll = Math.random();
      if (roll < finalChance) {
        // Record extraction attempt
        this.recordExtractionAttempt(targetId);

        // Handle extraction
        await this.handleExtractionBurst(rank, level, stats, false, selectedRank);
      }

      // Give a tiny amount of XP to favorite shadows per message regardless of extraction
      await this.grantShadowXP(1, 'message');

      // Second independent roll: chance for special ARISE event
      // Perception stat used (renamed from Luck)
      const specialChanceRaw =
        (cfg.specialBaseChance || 0.01) +
        intelligence * (cfg.specialIntMultiplier || 0.003) +
        perception * (cfg.specialLuckMultiplier || 0.002);

      const specialChance = Math.min(
        cfg.specialMaxChance || 0.3,
        specialChanceRaw
      );

      if (specialChance > 0) {
        if (this.canTriggerSpecialArise() && Math.random() < specialChance) {
          // Special ARISE: can extract up to 2 ranks higher
          const userRankIndex = this.shadowRanks.indexOf(rank);
          const boostedRankIndex = Math.min(userRankIndex + 2, this.shadowRanks.length - 1);
          const boostedRank = this.shadowRanks[boostedRankIndex];

          await this.handleExtractionBurst(rank, level, stats, true, boostedRank);
          this.markSpecialAriseUsed();
        }
      }
    } catch (error) {
      console.error('ShadowArmy: Error attempting extraction', error);
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
   */
  async handleExtractionBurst(userRank, userLevel, userStats, isSpecial, targetRank = null) {
    const now = Date.now();
    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    // Decide how many shadows to extract in this burst
    const count = isSpecial ? 3 + Math.floor(Math.random() * 5) : 1; // 3–7 for special, 1 for normal

    // Use target rank if provided, otherwise use user rank
    const rankToUse = targetRank || userRank;
    const extractedShadows = [];

    // Generate shadows
    for (let i = 0; i < count; i++) {
      const shadow = this.generateShadow(rankToUse, userLevel, userStats);

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

  /**
   * Generate a shadow based on rank, level, and stats
   * Uses exponential stat scaling - higher rank = exponentially stronger
   * Operations:
   * 1. Use provided shadow rank (determined by probability system)
   * 2. Randomly select shadow role from available roles
   * 3. Get exponential rank multiplier for stat scaling
   * 4. Generate base stats using role weights and exponential rank multiplier
   * 5. Calculate initial shadow strength from base stats
   * 6. Create shadow object with id, rank, role, stats, level, XP
   * 7. Initialize growth stats for level-up progression
   */
  generateShadow(shadowRank, userLevel, userStats) {
    // Random role selection
    const roleKeys = Object.keys(this.shadowRoles);
    const roleKey = roleKeys[Math.floor(Math.random() * roleKeys.length)];
    const role = this.shadowRoles[roleKey];

    // Get exponential rank multiplier (1.5x per rank)
    const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;

    // Generate base stats with exponential scaling
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
      baseStats,
      growthStats: {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        luck: 0,
      },
      ownerLevelAtExtraction: userLevel,
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
   * Operations:
   * 1. Initialize probability array (all zeros)
   * 2. Set probabilities based on user rank tier:
   *    - E rank: 70% E, 20% D, 10% C
   *    - D-C rank: Mix of E-D-C-B
   *    - B-A rank: Mix of C-B-A-S
   *    - S-SS rank: Mix of B-A-S-SS-SSS
   *    - SSS+ and above: Mix of A-S-SS-SSS-SSS+
   * 3. Return probability array for rank selection
   */
  calculateRankProbabilities(userRankIndex) {
    const probabilities = new Array(this.shadowRanks.length).fill(0);

    // Higher user rank = better shadow distribution
    // E rank (0): 70% E, 20% D, 10% C
    // S rank (5): 5% C, 15% B, 30% A, 40% S, 10% SS
    // Monarch (10+): 10% A, 20% S, 30% SS, 25% SSS, 15% SSS+

    if (userRankIndex <= 0) {
      // E rank
      probabilities[0] = 0.7; // E
      probabilities[1] = 0.2; // D
      probabilities[2] = 0.1; // C
    } else if (userRankIndex <= 2) {
      // D-C rank
      probabilities[0] = 0.3; // E
      probabilities[1] = 0.4; // D
      probabilities[2] = 0.25; // C
      probabilities[3] = 0.05; // B
    } else if (userRankIndex <= 4) {
      // B-A rank
      probabilities[2] = 0.1; // C
      probabilities[3] = 0.3; // B
      probabilities[4] = 0.4; // A
      probabilities[5] = 0.2; // S
    } else if (userRankIndex <= 6) {
      // S-SS rank
      probabilities[3] = 0.05; // B
      probabilities[4] = 0.15; // A
      probabilities[5] = 0.4; // S
      probabilities[6] = 0.3; // SS
      probabilities[7] = 0.1; // SSS
    } else {
      // SSS+ and above
      probabilities[4] = 0.1; // A
      probabilities[5] = 0.2; // S
      probabilities[6] = 0.3; // SS
      probabilities[7] = 0.25; // SSS
      probabilities[8] = 0.15; // SSS+
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
    const statsBoost = 1.0 + (intelligence * 0.01); // +1% per INT point

    for (let i = 0; i <= maxExtractableIndex; i++) {
      const rank = this.shadowRanks[i];
      const multiplier = (this.rankProbabilityMultipliers[rank] || 1.0) * statsBoost;
      extractableRanks.push({ rank, multiplier });
    }

    // Normalize probabilities
    const totalMultiplier = extractableRanks.reduce((sum, r) => sum + r.multiplier, 0);
    extractableRanks.forEach(r => {
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
  calculateExtractionChance(userRank, userStats, targetRank, targetStrength, intelligence, perception, strength) {
    const userRankIndex = this.shadowRanks.indexOf(userRank);
    const targetRankIndex = this.shadowRanks.indexOf(targetRank);

    // Lore constraint: Can't extract significantly stronger targets (max 2 ranks above)
    const rankDiff = targetRankIndex - userRankIndex;
    if (rankDiff > 2) {
      return 0; // Target too strong
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    // Base chance from Intelligence
    const baseChance = Math.max(
      cfg.minBaseChance || 0.001,
      intelligence * (cfg.chancePerInt || 0.005)
    );

    // Stats multiplier
    const totalStats = Object.values(userStats).reduce((sum, val) => sum + (val || 0), 0);
    const statsMultiplier = 1.0 + (
      (intelligence * 0.01) +      // INT: +1% per point
      (perception * 0.005) +        // PER: +0.5% per point
      (strength * 0.003) +          // STR: +0.3% per point
      (totalStats / 1000 * 0.01)    // Total power bonus
    );

    // Rank probability multiplier (lower ranks easier)
    const rankMultiplier = this.rankProbabilityMultipliers[targetRank] || 1.0;

    // Rank difference penalty (if target is stronger)
    const rankPenalty = rankDiff > 0 ? Math.pow(0.5, rankDiff) : 1.0; // 50% reduction per rank above

    // Target strength resistance (simplified - use rank as proxy)
    const userStrength = this.calculateUserStrength(userStats);
    const targetResistance = Math.min(0.9, (targetRankIndex + 1) / ((userRankIndex + 1) * 2));

    // Final chance
    const finalChance = Math.max(0, Math.min(1,
      baseChance *
      statsMultiplier *
      rankMultiplier *
      rankPenalty *
      (1 - targetResistance)
    ));

    return finalChance;
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
      cumulative += rankChance.probability || (rankChance.chance || 0);
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
   * Check if can extract from target (lore: max 3 attempts per target)
   * Operations:
   * 1. Check if target has extraction attempts recorded
   * 2. Return true if attempts < 3, false otherwise
   */
  canExtractFromTarget(targetId) {
    if (!this.extractionAttempts) {
      this.extractionAttempts = {};
    }

    const attempts = this.extractionAttempts[targetId];
    if (!attempts) return true; // No previous attempts

    // Lore: Max 3 attempts per target
    return attempts.count < 3;
  }

  /**
   * Record extraction attempt for target (lore: max 3 attempts)
   * Operations:
   * 1. Initialize extractionAttempts if needed
   * 2. Increment attempt count for target
   * 3. Update last attempt timestamp
   * 4. Save settings
   */
  recordExtractionAttempt(targetId) {
    if (!this.extractionAttempts) {
      this.extractionAttempts = {};
    }

    const attempts = this.extractionAttempts[targetId] || { count: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.extractionAttempts[targetId] = attempts;

    // Save to settings
    if (!this.settings.extractionAttempts) {
      this.settings.extractionAttempts = {};
    }
    this.settings.extractionAttempts[targetId] = attempts;
    this.saveSettings();
  }

  /**
   * Generate base stats for a new shadow with exponential scaling
   * Operations:
   * 1. Get stat weights for the shadow's role
   * 2. Calculate total user stats for baseline
   * 3. For each stat (STR, AGI, INT, VIT, LUK):
   *    - Mix user stat (70%) + total stats (10%) + base (5)
   *    - Apply role weight and EXPONENTIAL rank multiplier
   *    - Add random variance (0-20% for higher ranks)
   *    - Ensure minimum of 1
   * 4. Return base stats object with exponential scaling
   */
  generateShadowBaseStats(userStats, roleKey, shadowRank, rankMultiplier) {
    const weights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;
    const stats = ['strength', 'agility', 'intelligence', 'vitality', 'luck'];

    // Sum of user stats to give even 0 builds some baseline
    const totalUserStats =
      (userStats.strength || 0) +
      (userStats.agility || 0) +
      (userStats.intelligence || 0) +
      (userStats.vitality || 0) +
      (userStats.luck || 0);

    const baseStats = {};

    stats.forEach((stat) => {
      const userStat = userStats[stat] || 0;
      const w = weights[stat] || 0.5;

      // Base formula with EXPONENTIAL rank multiplier
      const baseValue = userStat * 0.7 + totalUserStats * 0.1 + 5;
      const variance = Math.random() * 0.2; // 0-20% variance

      const raw = baseValue * w * rankMultiplier * (1 + variance);
      baseStats[stat] = Math.max(1, Math.round(raw));
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
    return (this.settings.shadows || []).filter(s => s.role === role);
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
    return (this.settings.shadows || []).filter(s => s.rank === rank);
  }

  /**
   * Get favorite/general shadows (up to favoriteLimit)
   * Operations:
   * 1. Validate favoriteShadowIds array exists
   * 2. Use IndexedDB to load favorite shadows if available
   * 3. Otherwise fallback to localStorage array filter
   * 4. Return array of favorite shadow objects
   */
  async getFavoriteShadows() {
    if (!Array.isArray(this.settings.favoriteShadowIds) || this.settings.favoriteShadowIds.length === 0) {
      return [];
    }

    if (this.storageManager) {
      try {
        return await this.storageManager.getFavoriteShadows(this.settings.favoriteShadowIds);
      } catch (error) {
        console.error('ShadowArmy: Failed to get favorites from IndexedDB', error);
      }
    }

    // Fallback to localStorage
    const idSet = new Set(this.settings.favoriteShadowIds);
    return (this.settings.shadows || []).filter((shadow) => idSet.has(shadow.id));
  }

  /**
   * Toggle a shadow as favorite/general
   * - Adds if not present (up to favoriteLimit)
   * - Removes if already favorite
   * Operations:
   * 1. Validate shadowId provided
   * 2. Ensure favoriteShadowIds array exists
   * 3. Check if shadow is already favorite
   * 4. If favorite: remove from array
   * 5. If not favorite: add to array (enforce limit, remove oldest if needed)
   * 6. Save settings to persist changes
   */
  toggleFavorite(shadowId) {
    if (!shadowId) return;
    if (!Array.isArray(this.settings.favoriteShadowIds)) {
      this.settings.favoriteShadowIds = [];
    }

    const idx = this.settings.favoriteShadowIds.indexOf(shadowId);
    if (idx !== -1) {
      // Remove from favorites
      this.settings.favoriteShadowIds.splice(idx, 1);
    } else {
      // Enforce favorite limit (7 generals by default)
      if (this.settings.favoriteShadowIds.length >= (this.settings.favoriteLimit || 7)) {
        // Remove the oldest favorite (FIFO) to make room
        this.settings.favoriteShadowIds.shift();
      }
      this.settings.favoriteShadowIds.push(shadowId);
    }

    this.saveSettings();
  }

  // ============================================================================
  // SHADOW BUFFS & XP SYSTEM
  // ============================================================================

  /**
   * Calculate total buffs from all shadows
   * Favorites (generals) give full buffs, weak shadows (2+ ranks below) are aggregated for performance
   * Operations:
   * 1. Initialize buffs object (STR, AGI, INT, VIT, LUK all 0)
   * 2. Get favorite shadows (full buffs)
   * 3. Get user rank for aggregation threshold
   * 4. Aggregate weak shadows (2+ ranks below) - use total power, preserve individual stats in DB
   * 5. Apply buffs from favorites and aggregated weak shadows
   * 6. Return total buffs object
   */
  async calculateTotalBuffs() {
    const buffs = {
      strength: 0,
      agility: 0,
      intelligence: 0,
      vitality: 0,
      luck: 0,
    };

    // Get favorite shadows (full buffs)
    const favorites = await this.getFavoriteShadows();
    favorites.forEach((shadow) => {
      const role = this.shadowRoles[shadow.role];
      if (!role || !role.buffs) return;

      Object.keys(role.buffs).forEach((stat) => {
        const amount = role.buffs[stat] * 1.0; // Full buffs for favorites
        buffs[stat] = (buffs[stat] || 0) + amount;
      });
    });

    // Get user rank for aggregation
    const soloData = this.getSoloLevelingData();
    if (!soloData) return buffs;

    const userRank = soloData.rank;
    const userRankIndex = this.shadowRanks.indexOf(userRank);
    const weakRankThreshold = Math.max(0, userRankIndex - 2);

    // Aggregate weak shadows (2+ ranks below) for performance
    // Individual stats preserved in IndexedDB, but we use aggregated power for buffs
    if (this.storageManager && weakRankThreshold >= 0) {
      try {
        const aggregated = await this.storageManager.getAggregatedPower(userRank, this.shadowRanks);

        // Apply aggregated buffs (10% effect from non-favorites)
        // Estimate buff contribution based on total power
        // This is a simplified calculation - full stats preserved in DB for future use
        const aggregatedBuffs = {
          strength: aggregated.totalPower * 0.0001, // Small buff per power point
          agility: aggregated.totalPower * 0.0001,
          intelligence: aggregated.totalPower * 0.0001,
          vitality: aggregated.totalPower * 0.0001,
          luck: aggregated.totalPower * 0.0001,
        };

        Object.keys(aggregatedBuffs).forEach((stat) => {
          buffs[stat] = (buffs[stat] || 0) + aggregatedBuffs[stat] * 0.1; // 10% effect
        });
      } catch (error) {
        console.error('ShadowArmy: Failed to get aggregated power', error);
      }
    } else {
      // Fallback: process all shadows from localStorage
      const favoriteIds = new Set(this.settings.favoriteShadowIds || []);
      const allShadows = this.settings.shadows || [];
      allShadows.forEach((shadow) => {
      const role = this.shadowRoles[shadow.role];
      if (!role || !role.buffs) return;

      const isFavorite = favoriteIds.has(shadow.id);
      const scale = isFavorite ? 1 : 0.1; // 10% effect from non-favorites

      Object.keys(role.buffs).forEach((stat) => {
        const amount = role.buffs[stat] * scale;
        buffs[stat] = (buffs[stat] || 0) + amount;
      });
    });
    }

    return buffs;
  }

  /**
   * Grant XP to shadows (mainly favorites) so they can grow over time
   * Called from message events / dungeons
   * Operations:
   * 1. Validate baseAmount > 0
   * 2. Get favorite shadows (only favorites receive XP)
   * 3. For each favorite shadow:
   *    - Add XP to shadow
   *    - Check if XP exceeds level-up requirement
   *    - Level up loop: subtract XP requirement, increment level
   *    - Apply stat growth on level up
   *    - Recalculate shadow strength with new stats
   *    - Save updated shadow to IndexedDB
   * 4. Save settings (config only)
   */
  async grantShadowXP(baseAmount, reason = 'message') {
    if (baseAmount <= 0) return;

    const favorites = await this.getFavoriteShadows();
    if (!favorites.length) return;

    const perShadow = baseAmount;

    for (const shadow of favorites) {
      shadow.xp = (shadow.xp || 0) + perShadow;
      let level = shadow.level || 1;

      // Level up loop in case of big XP grants
      while (shadow.xp >= this.getShadowXpForNextLevel(level)) {
        shadow.xp -= this.getShadowXpForNextLevel(level);
        level += 1;
        shadow.level = level;
        this.applyShadowLevelUpStats(shadow);
        // Recompute strength after level up
        const effectiveStats = this.getShadowEffectiveStats(shadow);
        shadow.strength = this.calculateShadowStrength(effectiveStats, 1);
      }

      // Save updated shadow to IndexedDB
      if (this.storageManager) {
        try {
          await this.storageManager.saveShadow(shadow);
        } catch (error) {
          console.error('ShadowArmy: Failed to save shadow XP update', error);
          // Fallback: update in localStorage array if exists
          const index = (this.settings.shadows || []).findIndex(s => s.id === shadow.id);
          if (index !== -1) {
            this.settings.shadows[index] = shadow;
          }
        }
      } else {
        // Fallback: update in localStorage array
        const index = (this.settings.shadows || []).findIndex(s => s.id === shadow.id);
        if (index !== -1) {
          this.settings.shadows[index] = shadow;
        }
      }
    }

    this.saveSettings();
  }

  /**
   * Calculate XP required for next shadow level
   * Operations:
   * 1. Use quadratic formula: 25 + (level * level * 5)
   * 2. Return XP requirement
   */
  getShadowXpForNextLevel(level) {
    // Simple curve: grows roughly quadratically
    return 25 + level * level * 5;
  }

  /**
   * Get effective stats for a shadow (base + growth)
   * Operations:
   * 1. Get base stats from shadow.baseStats
   * 2. Get growth stats from shadow.growthStats
   * 3. Sum base and growth for each stat
   * 4. Return effective stats object
   */
  getShadowEffectiveStats(shadow) {
    const base = shadow.baseStats || {};
    const growth = shadow.growthStats || {};
    return {
      strength: (base.strength || 0) + (growth.strength || 0),
      agility: (base.agility || 0) + (growth.agility || 0),
      intelligence: (base.intelligence || 0) + (growth.intelligence || 0),
      vitality: (base.vitality || 0) + (growth.vitality || 0),
      luck: (base.luck || 0) + (growth.luck || 0),
    };
  }

  /**
   * Apply stat increases on shadow level up based on its role weights
   * Operations:
   * 1. Get shadow's role and corresponding stat weights
   * 2. Initialize growthStats if missing
   * 3. For each stat:
   *    - Get weight for that stat
   *    - Primary stats (w >= 1.1): +3 growth
   *    - Secondary stats (w >= 0.8): +2 growth
   *    - Tertiary stats (w > 0): +1 growth
   *    - Negative/zero weight: no growth
   * 4. Update shadow.growthStats
   */
  applyShadowLevelUpStats(shadow) {
    const roleKey = shadow.role;
    const weights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;
    if (!shadow.growthStats) {
      shadow.growthStats = { strength: 0, agility: 0, intelligence: 0, vitality: 0, luck: 0 };
    }

    const stats = ['strength', 'agility', 'intelligence', 'vitality', 'luck'];

    stats.forEach((stat) => {
      const w = weights[stat] || 0.5;
      // Primary stats (w >= 1.0) grow faster, secondary slightly, others small
      let delta;
      if (w >= 1.1) delta = 3;
      else if (w >= 0.8) delta = 2;
      else if (w > 0) delta = 1;
      else delta = 0;

      shadow.growthStats[stat] = (shadow.growthStats[stat] || 0) + delta;
    });
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
        return `
          <div class="shadow-list-item">
            <button class="${starClass}"
              onclick="try { const p = BdApi.Plugins.get('ShadowArmy'); (p.instance || p).toggleFavorite('${shadow.id}'); } catch (e) { console.error(e); }">

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
