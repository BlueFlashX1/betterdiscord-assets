/**
 * @name ShadowArmy
 * @author BlueFlashX1
 * @description Solo Leveling Shadow Army system - Extract and collect shadows with ranks, roles, and abilities
 * @version 3.3.0
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 *
 * ============================================================================
 * STORAGE & SCALABILITY
 * ============================================================================
 * - Uses IndexedDB for scalable storage (user-specific)
 * - Supports 100,000+ shadows without performance degradation
 * - Async operations (non-blocking)
 * - Role-based statistics and analytics
 * - Memory caching for aggregation
 *
 * ============================================================================
 * CORE FEATURES
 * ============================================================================
 * - 26 total shadow types (8 humanoid + 18 magic beast)
 * - 100% magic beasts from dungeons, 100% humanoids from messages
 * - Beast family classification (10 families)
 * - Biome-specific extraction filtering
 * - Automatic rank-up system (80% threshold)
 * - Individual shadow progression (level, XP, stats, growth)
 * - Natural growth (combat-time based, 10x base rate)
 * - Generals system (top 7 strongest) - Elite command view
 * - Auto-resurrection with exponential mana costs
 * - Dragon restrictions (NH+ ranks only)
 * - Extended ranks to Shadow Monarch
 * - Member list widget (rank distribution display)
 * - Role/class analytics with average stats
 *
 * ============================================================================
 * VERSION HISTORY
 * ============================================================================
 *
 * @changelog v3.3.0 (2025-12-04) - HYBRID COMPRESSION SYSTEM
 * NEW FEATURE: Hybrid Memory Compression
 * - Top 100 shadows: Full data (Elite Force)
 * - Rest: Compressed data (80% memory savings per shadow!)
 * - Compression format: 500 bytes → 100 bytes per shadow
 * - Automatic compression every hour
 * - Transparent decompression (seamless in combat/UI)
 * - Result: Massive army (1,000+) with 85-90% less memory
 *
 * EMERGENCY CLEANUP: Shadow Essence
 * - Only triggers if army exceeds 5,000 shadows
 * - Converts weakest to essence (backup safety)
 * - Essence value by rank (E=1 to Shadow Monarch=7680)
 * - Keeps army manageable in extreme cases
 *
 * MEMORY IMPACT:
 * - 1,000 shadows: ~500 KB → ~100 KB (80% savings!)
 * - 5,000 shadows: ~2.5 MB → ~500 KB (80% savings!)
 * - Maintains massive army feel with minimal memory
 *
 * @changelog v3.2.0 (2025-12-04) - DUNGEON-ONLY EXTRACTION
 * EXTRACTION SYSTEM REDESIGN:
 * - REMOVED message-based shadow extraction completely
 * - Extraction now ONLY happens from dead mobs in dungeons
 * - Automatic system listens for mob deaths (no manual trigger)
 * - Separate from ARISE animation (mob extraction vs boss ARISE)
 * - Cleaner, more focused extraction experience
 *
 * @changelog v3.3.0 (2025-12-06) - MESSAGE EXTRACTION RE-ENABLED
 * MESSAGE EXTRACTION RESTORED:
 * - Re-enabled message-based shadow extraction (humanoid shadows only)
 * - Hooks into SoloLevelingStats message processing
 * - Rate limited (max 3 extractions per minute by default)
 * - Respects 30% extraction cap (dungeons skip this cap)
 * - Magic beasts remain dungeon-only (messages extract humanoids only)
 * - No more random chat extractions
 *
 * BUG FIXES:
 * - Fixed removeShadowArmyButton error (function removed in v3.0.0)
 * - Removed extraction rank spam ("Cannot extract X" → debug mode)
 *
 * @changelog v3.1.0 (2025-12-04) - GENERALS UI REDESIGN
 * UI IMPROVEMENTS:
 * - Modal shows only 7 generals (elite command view)
 * - Removed filter system (unnecessary)
 * - Removed "show all shadows" view
 * - Added role/class distribution with counts
 * - Added average stats per role/class
 * - Magic beasts marked with 🐾
 * - General ranking badges (#1-#7)
 * - Enhanced stats display
 *
 * @changelog v3.0.1 (2025-12-04) - EXTRACTION OPTIMIZATION
 * - Added configurable retry system (maxAttempts parameter)
 * - Mobs now use 1 extraction attempt (prevents queue buildup)
 * - Bosses still use 3 extraction attempts (important targets)
 * - Added isBoss parameter to attemptDungeonExtraction
 * - Enhanced memory cleanup (caches, timestamps, tracking)
 * - Performance improvements for high-volume extraction
 *
 * @changelog v3.0.0 (2025-12-04) - UI SYSTEM OVERHAUL
 * MAJOR CHANGES:
 * - Chatbox button UI disabled (cleaner Discord toolbar)
 * - Member list widget system refactored and stabilized
 * - Widget persistence fixes (survives channel/guild switching)
 * - BdApi.DOM migration (injectCSS → DOM.addStyle/removeStyle)
 * - BdApi.showToast for user notifications (extraction success, essence conversion)
 * - BdApi.Plugins.get for plugin integration (SoloLevelingStats, ShadowAriseAnimation)
 * - BdApi.Webpack.getStore/getModule for Discord API access (UserStore)
 * - BdApi.Data.load/save for settings persistence (user-specific storage)
 * - BdApi.DOM.append/remove for DOM manipulation (animations, modals)
 * - Duplicate widget prevention system
 * - Speed optimizations (instant widget injection)
 * - Removed chatbox shadow display (too cluttered)
 * - Member list now shows shadow rank distribution
 *
 * UI IMPROVEMENTS:
 * - Single shadow count widget in member list
 * - Shows total shadows + breakdown by rank
 * - Auto-updates every 10 seconds
 * - Clean, non-intrusive design
 * - Proper CSS injection lifecycle
 *
 * BUG FIXES:
 * - Fixed widget disappearing on channel switch
 * - Fixed duplicate 999+ badges
 * - Fixed CSS not persisting properly
 * - Fixed BdApi compatibility (v1.13.0+)
 *
 * @changelog v2.0.0 (2025-12-03) - BEAST FAMILY SYSTEM
 * - Added 10 new magic beast types (Orc, Naga, Titan, Giant, Elf, Demon, Ghoul, Ogre, Centipede, Yeti)
 * - Implemented beast family classification system
 * - 100% magic beast extraction from dungeons
 * - Added rank restrictions (Dragons NH+, Titans A+, Demons B+, Wyverns S+)
 * - Biome-based extraction filtering
 * - Auto-rank-up when stats reach 80% of next rank
 * - Auto-resurrection with exponential mana costs
 * - Extended rank system to Shadow Monarch
 * - Improved natural growth rates (10x base increase)
 * - Enhanced role specialization for magic beasts
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
 *
 * ============================================================================
 * CODE STRUCTURE
 * ============================================================================
 * STORAGE SECTION 2: CONFIGURATION & HELPERS (constructor, helpers, utilities)
 * STORAGE SECTION 3: MAJOR OPERATIONS (database, shadows, cache, aggregation)
 */
class ShadowStorageManager {
  // ============================================================================
  // STORAGE SECTION 2: CONFIGURATION & HELPERS
  // ============================================================================

  /**
   * Initialize ShadowStorageManager with user ID
   * Operations:
   * 1. Store user ID for database naming
   * 2. Set database name and version
   * 3. Initialize memory caches
   * 4. Set cache TTL for aggregation
   * 5. Load migration flag from BdApi.Data
   */
  constructor(userId, debugLogFn = null, debugErrorFn = null) {
    // Database configuration
    this.userId = userId || 'default';
    this.dbName = `ShadowArmyDB_${this.userId}`;
    this.dbVersion = 2; // Upgraded for natural growth system
    this.storeName = 'shadows';
    this.db = null;

    // Debug logging functions (provided by parent plugin)
    this.debugLog = debugLogFn || (() => {});
    this.debugError =
      debugErrorFn ||
      ((tag, msg, err) => {
        console.error(`[ShadowStorageManager:${tag}]`, msg, err);
      });

    // Memory cache
    this.recentCache = new Map(); // Recently accessed shadows
    this.cacheLimit = 100;

    // Aggregation cache (for performance)
    this.aggregatedPowerCache = null;
    this.aggregatedPowerCacheTime = null;
    this.cacheTTL = 60000; // 1 minute

    // Buff cache (for synchronous access by SoloLevelingStats)
    this.cachedBuffs = null;
    this.cachedBuffsTime = null;

    // Migration flag - load persisted value from stable storage
    try {
      const persistedMigration = BdApi.Data.load('ShadowArmy', 'migrationCompleted');
      this.migrationCompleted = persistedMigration === true;
      this.debugLog('STORAGE', 'Migration status loaded', { completed: this.migrationCompleted });
    } catch (error) {
      this.debugError('STORAGE', 'Failed to load migration flag from BdApi.Data', error);
      this.migrationCompleted = false;
    }

    // Natural growth tracking
    this.lastNaturalGrowthTime = Date.now();

    // Concurrent operation locks
    this._aggregatingPower = null;
  }

  // ============================================================================
  // STORAGE 2.2 SHADOW DATA HELPERS
  // ============================================================================

  /**
   * Helper method for accessing shadow data with transparent decompression
   * Handles both full and compressed shadow formats (regular and ultra-compression)
   * Operations:
   * 1. Check if shadow is compressed (_c marker)
   * 2. Decompress if needed (regular or ultra)
   * 3. Return full shadow object
   * @param {Object} shadow - Shadow object (may be compressed)
   * @returns {Object} - Decompressed shadow object
   */
  getShadowData(shadow) {
    if (!shadow) return null;

    // Check compression markers
    if (shadow._c === 1) {
      // Regular compression - delegate to parent plugin's decompressShadow
      // Note: This method should be provided by parent ShadowArmy class
      if (typeof this.decompressShadow === 'function') {
        return this.decompressShadow(shadow);
      }
      // Fallback: return as-is if decompression not available
      return shadow;
    }

    if (shadow._c === 2) {
      // Ultra compression - delegate to parent plugin's decompressShadowUltra
      if (typeof this.decompressShadowUltra === 'function') {
        return this.decompressShadowUltra(shadow);
      }
      // Fallback: return as-is if decompression not available
      return shadow;
    }

    // Not compressed - return as-is
    return shadow;
  }

  /**
   * Prepare shadow for saving (handles compression state)
   * Operations:
   * 1. Check if shadow is already compressed
   * 2. Return as-is if compressed, otherwise return full shadow
   * @param {Object} shadow - Shadow object to prepare
   * @returns {Object} - Shadow ready for storage
   */
  prepareShadowForSave(shadow) {
    if (!shadow) return null;

    // If already compressed, return as-is
    if (shadow._c === 1 || shadow._c === 2) {
      return shadow;
    }

    // Ensure all required fields are present
    if (!shadow.baseStats) {
      shadow.baseStats = {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        perception: 0,
      };
    }
    if (!shadow.growthStats) {
      shadow.growthStats = {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        perception: 0,
      };
    }
    if (!shadow.naturalGrowthStats) {
      shadow.naturalGrowthStats = {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        perception: 0,
      };
    }

    // CRITICAL: Ensure strength is calculated before saving
    // This ensures IndexedDB has accurate power values
    if (!shadow.strength || shadow.strength === 0) {
      // Decompress if needed to get accurate stats
      const decompressed = this.getShadowData ? this.getShadowData(shadow) : shadow;
      const effective = this.getShadowEffectiveStats
        ? this.getShadowEffectiveStats(decompressed)
        : null;

      // Get identifier for logging (accept both id and i for compressed shadows)
      const shadowId = shadow.id || shadow.i;

      if (effective) {
        shadow.strength = this.calculateShadowStrength(effective, 1);
        this.debugLog('PREPARE_SAVE', 'Calculated missing strength', {
          shadowId: shadowId,
          calculatedStrength: shadow.strength,
        });
      } else if (decompressed && decompressed.baseStats) {
        // Fallback: calculate from baseStats if effective stats unavailable
        shadow.strength = this.calculateShadowStrength(decompressed.baseStats, 1);
        this.debugLog('PREPARE_SAVE', 'Calculated strength from baseStats', {
          shadowId: shadowId,
          calculatedStrength: shadow.strength,
        });
      }
    }

    return shadow;
  }

  // ============================================================================
  // STORAGE 2.3 VALIDATION HELPERS
  // ============================================================================

  /**
   * Validate shadow object structure
   * Operations:
   * 1. Check required fields (id, rank, role)
   * 2. Validate stat objects structure
   * 3. Return validation result with errors
   * @param {Object} shadow - Shadow object to validate
   * @returns {Object} - { valid: boolean, errors: string[] }
   */
  validateShadow(shadow) {
    const errors = [];

    if (!shadow) {
      return { valid: false, errors: ['Shadow object is null or undefined'] };
    }

    // Required fields
    // Accept both id (uncompressed) and i (compressed) for identifier
    if (!shadow.id && !shadow.i) {
      errors.push('Missing required field: id or i');
    }
    if (!shadow.rank) errors.push('Missing required field: rank');
    if (!shadow.role && !shadow.roleName) errors.push('Missing required field: role or roleName');

    // Validate stat objects structure
    const statFields = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const statObjects = ['baseStats', 'growthStats', 'naturalGrowthStats'];

    statObjects.forEach((statObj) => {
      if (shadow[statObj] && typeof shadow[statObj] === 'object') {
        statFields.forEach((field) => {
          if (typeof shadow[statObj][field] !== 'number') {
            errors.push(`Invalid ${statObj}.${field}: must be a number`);
          }
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Normalize shadow object (ensure all fields are present with defaults)
   * Operations:
   * 1. Ensure required fields exist
   * 2. Add default values for missing optional fields
   * 3. Normalize stat objects
   * @param {Object} shadow - Shadow object to normalize
   * @returns {Object} - Normalized shadow object
   */
  normalizeShadow(shadow) {
    if (!shadow) return null;

    const normalized = { ...shadow };

    // Required fields with defaults
    normalized.id =
      normalized.id || `shadow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    normalized.rank = normalized.rank || 'E';
    normalized.role = normalized.role || 'knight';
    normalized.level = normalized.level || 1;
    normalized.xp = normalized.xp || 0;
    normalized.strength = normalized.strength || 0;
    normalized.extractedAt = normalized.extractedAt || Date.now();

    // Stat objects with defaults
    const defaultStats = {
      strength: 0,
      agility: 0,
      intelligence: 0,
      vitality: 0,
      perception: 0,
    };

    normalized.baseStats = normalized.baseStats || { ...defaultStats };
    normalized.growthStats = normalized.growthStats || { ...defaultStats };
    normalized.naturalGrowthStats = normalized.naturalGrowthStats || { ...defaultStats };

    // Ensure all stat fields exist
    Object.keys(defaultStats).forEach((stat) => {
      normalized.baseStats[stat] = normalized.baseStats[stat] || 0;
      normalized.growthStats[stat] = normalized.growthStats[stat] || 0;
      normalized.naturalGrowthStats[stat] = normalized.naturalGrowthStats[stat] || 0;
    });

    // Optional fields with defaults
    normalized.totalCombatTime = normalized.totalCombatTime || 0;
    normalized.lastNaturalGrowth = normalized.lastNaturalGrowth || normalized.extractedAt;
    normalized.ownerLevelAtExtraction = normalized.ownerLevelAtExtraction || 1;
    normalized.growthVarianceSeed = normalized.growthVarianceSeed || Math.random();

    return normalized;
  }

  /**
   * Check if shadow ID is valid
   * @param {string} id - Shadow ID to validate
   * @returns {boolean} - True if valid
   */
  isValidShadowId(id) {
    return id && typeof id === 'string' && id.trim().length > 0;
  }

  // ============================================================================
  // STORAGE 2.4 CACHE MANAGEMENT HELPERS
  // ============================================================================

  /**
   * Get cache key for shadow (handles both id and i for compressed shadows)
   * Normalizes cache keys to handle compression state changes
   * @param {Object} shadow - Shadow object
   * @returns {string|null} - Cache key or null if invalid
   */
  getCacheKey(shadow) {
    if (!shadow) return null;
    // Prefer full id if available, otherwise use i (compressed)
    return shadow.id || shadow.i || null;
  }

  /**
   * Get all possible cache keys for a shadow (for invalidation)
   * Returns both id and i if both exist, for proper cache invalidation
   * @param {Object} shadow - Shadow object
   * @returns {string[]} - Array of cache keys
   */
  getAllCacheKeys(shadow) {
    if (!shadow) return [];
    const keys = [];
    if (shadow.id) keys.push(shadow.id);
    if (shadow.i && shadow.i !== shadow.id) keys.push(shadow.i);
    return keys;
  }

  /**
   * Invalidate cache entries for a shadow (handles both id and i)
   * Invalidates recent cache (storage manager only handles its own cache)
   * @param {Object} shadow - Shadow object to invalidate
   */
  invalidateCache(shadow) {
    if (!shadow) return;
    const keys = this.getAllCacheKeys(shadow);

    // Invalidate recent cache
    keys.forEach((key) => {
      if (this.recentCache.has(key)) {
        this.recentCache.delete(key);
        this.debugLog('CACHE', 'Invalidated recent cache entry', { key });
      }
    });
  }

  /**
   * Update memory cache with shadow (LRU behavior)
   * Uses BdAPI patterns: Efficient cache management, size limits
   * Operations:
   * 1. Validate shadow input (guard clause)
   * 2. Invalidate old cache entries (if shadow was compressed/decompressed)
   * 3. Add to recentCache (LRU eviction)
   * 4. Limit cache size to prevent memory issues
   * @param {Object} shadow - Shadow object to cache
   * @param {Object} oldShadow - Previous shadow state (for invalidation)
   */
  updateCache(shadow, oldShadow = null) {
    // Guard clause: Validate input (accept both id and i for compressed shadows)
    const shadowId = this.getCacheKey(shadow);
    if (!shadow || !shadowId) {
      this.debugError('CACHE', 'Cannot update cache: invalid shadow', { shadow });
      return;
    }

    // Invalidate old cache entries if shadow state changed (compression/decompression)
    if (oldShadow) {
      const oldKeys = this.getAllCacheKeys(oldShadow);
      const newKeys = this.getAllCacheKeys(shadow);

      // Remove old keys that are different from new keys
      oldKeys.forEach((oldKey) => {
        if (!newKeys.includes(oldKey)) {
          // Invalidate all caches for old key
          if (this.recentCache.has(oldKey)) {
            this.recentCache.delete(oldKey);
          }
          if (this._shadowPowerCache) {
            this._shadowPowerCache.delete(`power_${oldKey}`);
          }
          if (this._shadowPersonalityCache) {
            this._shadowPersonalityCache.delete(`personality_${oldKey}`);
          }
          this.debugLog('CACHE', 'Invalidated old cache entry', { oldKey, newKey: shadowId });
        }
      });
    }

    // Add to recent cache (LRU)
    if (this.recentCache.has(shadowId)) {
      // Move to end (most recently used)
      this.recentCache.delete(shadowId);
    }
    this.recentCache.set(shadowId, shadow);

    // Evict oldest if recent cache limit reached
    if (this.recentCache.size > this.cacheLimit) {
      const firstKey = this.recentCache.keys().next().value;
      this.recentCache.delete(firstKey);
      this.debugLog('CACHE', 'Evicted oldest from recent cache', { evictedId: firstKey });
    }
  }

  /**
   * Clear all memory caches
   * Operations:
   * 1. Clear recent cache
   * 2. Clear aggregation cache
   * 3. Reset cache timestamps
   */
  clearCache() {
    this.recentCache.clear();
    this.aggregatedPowerCache = null;
    this.aggregatedPowerCacheTime = null;
    this.debugLog('CACHE', 'All caches cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getCacheStats() {
    return {
      recentCache: {
        size: this.recentCache.size,
        limit: this.cacheLimit,
      },
      aggregatedPowerCache: {
        cached: this.aggregatedPowerCache !== null,
        age: this.aggregatedPowerCacheTime ? Date.now() - this.aggregatedPowerCacheTime : null,
      },
    };
  }

  // ============================================================================
  // STORAGE 2.5 UTILITY HELPERS
  // ============================================================================

  /**
   * Format combat time for display
   * @param {number} seconds - Combat time in seconds
   * @returns {string} - Formatted time string
   */
  formatCombatTime(seconds) {
    if (!seconds || seconds < 0) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  /**
   * Calculate shadow power from effective stats
   * @param {Object} effectiveStats - Effective stats object
   * @param {number} level - Shadow level (optional multiplier)
   * @returns {number} - Total power value
   */
  calculateShadowPower(effectiveStats, level = 1) {
    if (!effectiveStats) return 0;

    const totalStats =
      (effectiveStats.strength || 0) +
      (effectiveStats.agility || 0) +
      (effectiveStats.intelligence || 0) +
      (effectiveStats.vitality || 0) +
      (effectiveStats.perception || 0);

    return Math.floor(totalStats * level);
  }

  /**
   * Check if cache is expired based on TTL
   * @param {number} cacheTime - Cache timestamp
   * @param {number} ttl - Time to live in milliseconds
   * @returns {boolean} - True if expired
   */
  isCacheExpired(cacheTime, ttl = this.cacheTTL) {
    if (!cacheTime) return true;
    return Date.now() - cacheTime >= ttl;
  }

  /**
   * Deep clone shadow object (prevents mutation)
   * @param {Object} shadow - Shadow object to clone
   * @returns {Object} - Cloned shadow object
   */
  cloneShadow(shadow) {
    if (!shadow) return null;
    try {
      return JSON.parse(JSON.stringify(shadow));
    } catch (error) {
      this.debugError('UTILITY', 'Failed to clone shadow', error);
      // Fallback: shallow clone
      return { ...shadow };
    }
  }

  // ============================================================================
  // STORAGE SECTION 3: MAJOR OPERATIONS
  // ============================================================================

  // ============================================================================
  // STORAGE 3.1 DATABASE INITIALIZATION
  // ============================================================================

  /**
   * Initialize IndexedDB database
   * Operations:
   * 1. Check IndexedDB support
   * 2. Open database with version
   * 3. Create object store if doesn't exist
   * 4. Create indexes for fast queries
   * 5. Handle version upgrades
   */
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

        this.debugLog('INIT', 'Database upgrade needed', {
          oldVersion,
          newVersion: this.dbVersion,
        });

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

          this.debugLog('INIT', 'Created object store and indexes', { storeName: this.storeName });
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

          this.debugLog('INIT', 'Added v2 indexes for natural growth', { oldVersion });
        }
      };
    });
  }

  // ============================================================================
  // STORAGE 3.2 MIGRATION FROM LOCALSTORAGE
  // ============================================================================

  /**
   * Migrate shadows from localStorage to IndexedDB
   * Operations:
   * 1. Check if migration already completed
   * 2. Load old data from BdApi.Data
   * 3. Initialize IndexedDB if not already done
   * 4. Batch save all shadows to IndexedDB
   * 5. Mark migration as complete in BdApi.Data
   * 6. Keep localStorage as backup for 1 version
   */
  async migrateFromLocalStorage() {
    if (this.migrationCompleted) {
      this.debugLog('MIGRATION', 'Migration already completed, skipping');
      return { migrated: false, reason: 'Already migrated' };
    }

    try {
      this.debugLog('MIGRATION', 'Starting migration from localStorage to IndexedDB');

      // Load old data using BdApi.Data
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
        this.debugLog('MIGRATION', 'No data to migrate');
        return { migrated: false, reason: 'No data to migrate' };
      }

      this.debugLog('MIGRATION', 'Found shadows to migrate', { count: oldData.shadows.length });

      // Ensure database is initialized
      if (!this.db) {
        await this.init();
      }

      // Batch save shadows
      const migrated = await this.saveShadowsBatch(oldData.shadows);

      // Mark migration complete and persist flag to stable storage
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

  // ============================================================================
  // STORAGE 3.3 SHADOW OPERATIONS
  // ============================================================================

  /**
   * Save a single shadow to IndexedDB
   * Uses BdAPI patterns: Input validation, error handling, cache management
   * Operations:
   * 1. Validate shadow object (guard clause)
   * 2. Ensure database initialized
   * 3. Open transaction in readwrite mode
   * 4. Add/update shadow in object store
   * 5. Update memory cache (favorite/recent)
   * 6. Handle transaction errors
   * 7. Return success status with shadow
   */
  async saveShadow(shadow) {
    // Guard clause: Validate input (accept both id and i for compressed shadows)
    const shadowId = shadow?.id || shadow?.i;
    if (!shadow || !shadowId) {
      const error = new Error('Invalid shadow object: missing id or i');
      this.debugError('SAVE', 'Cannot save shadow: invalid input', error);
      throw error;
    }

    // Ensure database initialized
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(shadow);

      // Transaction error handler (catches all transaction errors)
      transaction.onerror = () => {
        this.debugError('SAVE', 'Transaction failed while saving shadow', transaction.error);
        reject(transaction.error || request.error);
      };

      // Request success handler
      request.onsuccess = () => {
        // Update cache (recent cache - optimize memory usage)
        this.updateCache(shadow);

        // Invalidate aggregated power cache when new shadow is saved
        this.aggregatedPowerCache = null;
        this.aggregatedPowerCacheTime = null;

        // Get identifier for logging (accept both id and i for compressed shadows)
        const shadowId = shadow.id || shadow.i;
        this.debugLog('SAVE', 'Shadow saved successfully', { id: shadowId, rank: shadow.rank });
        resolve({ success: true, shadow });
      };

      // Request error handler (fallback)
      request.onerror = () => {
        this.debugError('SAVE', 'Failed to save shadow', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get a single shadow by ID
   * Uses BdAPI patterns: Cache-first lookup, proper error handling
   * Operations:
   * 1. Validate ID input (guard clause)
   * 2. Check memory cache first (fast path - O(1))
   * 3. Query IndexedDB if not in cache
   * 4. Update cache with result (LRU behavior)
   * 5. Return shadow object or null if not found
   */
  async getShadow(id) {
    // Guard clause: Validate input
    if (!id) {
      this.debugError('GET', 'Cannot get shadow: missing id', null);
      return null;
    }

    // Fast path: Check cache first (O(1) lookup)
    // Handle both full id and compressed i
    if (this.recentCache.has(id)) {
      this.debugLog('GET', 'Shadow found in recent cache', { id });
      return this.recentCache.get(id);
    }

    // Also check if id matches any shadow's i (compressed key)
    // This handles lookups by full id when shadow is compressed
    for (const [cacheKey, cachedShadow] of this.recentCache.entries()) {
      if (cachedShadow && (cachedShadow.id === id || cachedShadow.i === id)) {
        this.debugLog('GET', 'Shadow found in recent cache (by identifier match)', {
          id,
          cacheKey,
        });
        return cachedShadow;
      }
    }

    // Ensure database initialized
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      // Transaction error handler
      transaction.onerror = () => {
        this.debugError('GET', 'Transaction failed while getting shadow', transaction.error);
        reject(transaction.error || request.error);
      };

      // Request success handler
      request.onsuccess = () => {
        const shadow = request.result;
        if (shadow) {
          // Update cache for future lookups (LRU behavior)
          this.updateCache(shadow);
          this.debugLog('GET', 'Shadow retrieved from IndexedDB', { id, rank: shadow.rank });
        } else {
          this.debugLog('GET', 'Shadow not found in IndexedDB', { id });
        }
        resolve(shadow || null);
      };

      // Request error handler (fallback)
      request.onerror = () => {
        this.debugError('GET', 'Failed to get shadow', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Save multiple shadows in batch (optimized for migration)
   * Uses BdAPI patterns: Batch operations, error aggregation, progress tracking
   * Operations:
   * 1. Validate input array (guard clause)
   * 2. Ensure database initialized
   * 3. Open single transaction for all operations (efficient)
   * 4. Add all shadows to object store in batch
   * 5. Track completion and errors
   * 6. Return count of successfully saved shadows
   */
  async saveShadowsBatch(shadows) {
    // Guard clause: Validate input
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) {
      this.debugLog('BATCH_SAVE', 'No shadows to save', { count: 0 });
      return 0;
    }

    // Ensure database initialized
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      let completed = 0;
      let errors = 0;
      const total = shadows.length;

      // Transaction error handler (catches all transaction errors)
      transaction.onerror = () => {
        this.debugError('BATCH_SAVE', 'Transaction failed during batch save', transaction.error);
        reject(transaction.error);
      };

      // Transaction complete handler (all operations finished)
      transaction.oncomplete = () => {
        // Invalidate aggregated power cache when shadows are saved
        this.aggregatedPowerCache = null;
        this.aggregatedPowerCacheTime = null;

        this.debugLog('BATCH_SAVE', 'Batch save transaction completed', {
          completed,
          errors,
          total,
          successRate: `${((completed / total) * 100).toFixed(1)}%`,
        });
        resolve(completed);
      };

      // Process each shadow in batch
      shadows.forEach((shadow, index) => {
        // Validate shadow before saving (accept both id and i for compressed shadows)
        const shadowId = shadow?.id || shadow?.i;
        if (!shadow || !shadowId) {
          errors++;
          this.debugError('BATCH_SAVE', `Invalid shadow at index ${index}`, { index, shadow });
          if (completed + errors === total) {
            // All processed, but transaction still running - wait for oncomplete
          }
          return;
        }

        const request = store.put(shadow);

        request.onsuccess = () => {
          completed++;
          // Don't resolve here - wait for transaction.oncomplete
        };

        request.onerror = () => {
          errors++;
          this.debugError('BATCH_SAVE', `Failed to save shadow at index ${index}`, {
            index,
            id: shadowId,
            error: request.error,
          });
          // Don't reject here - continue with other shadows
        };
      });

      // Edge case: If all shadows are invalid, transaction completes immediately
      if (errors === total) {
        // Transaction will still fire oncomplete, which will resolve
      }
    });
  }

  /**
   * Get shadows with pagination and filters (optimized with indexes)
   * Uses BdAPI patterns: Indexed queries, efficient filtering, proper error handling
   * Operations:
   * 1. Validate input parameters (guard clauses)
   * 2. Ensure database initialized
   * 3. Select optimal index based on filters (rank, role, rank_role)
   * 4. Open cursor on selected index
   * 5. Apply filters during cursor iteration (efficient)
   * 6. Sort results in memory (if needed)
   * 7. Apply pagination (offset, limit)
   * 8. Return filtered and paginated array
   */
  async getShadows(
    filters = {},
    offset = 0,
    limit = 50,
    sortBy = 'extractedAt',
    sortOrder = 'desc'
  ) {
    // Guard clause: Validate parameters
    if (offset < 0) offset = 0;
    if (limit < 1) limit = 50;
    if (limit > 10000) {
      this.debugLog('GET_SHADOWS', 'Limit too large, capping at 10000', { requested: limit });
      limit = 10000;
    }

    // Ensure database initialized
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      // Select optimal index based on filters (indexed queries are faster)
      let index = store;

      if (filters.rank && filters.role) {
        // Composite index for rank + role (most specific)
        try {
          index = store.index('rank_role');
        } catch (e) {
          this.debugError('GET_SHADOWS', 'rank_role index not found, using object store', e);
        }
      } else if (filters.rank) {
        // Rank index (common filter)
        try {
          index = store.index('rank');
        } catch (e) {
          this.debugError('GET_SHADOWS', 'rank index not found, using object store', e);
        }
      } else if (filters.role) {
        // Role index (common filter)
        try {
          index = store.index('role');
        } catch (e) {
          this.debugError('GET_SHADOWS', 'role index not found, using object store', e);
        }
      }

      const request = index.openCursor();
      const results = [];

      // Transaction error handler
      transaction.onerror = () => {
        this.debugError('GET_SHADOWS', 'Transaction failed', transaction.error);
        reject(transaction.error || request.error);
      };

      // Cursor success handler
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const shadow = cursor.value;

          // Apply filters (early exit for performance)
          let matches = true;
          if (filters.rank && shadow.rank !== filters.rank) matches = false;
          if (filters.role && shadow.role !== filters.role) matches = false;
          if (filters.minLevel && (shadow.level || 1) < filters.minLevel) matches = false;
          if (filters.maxLevel && (shadow.level || 1) > filters.maxLevel) matches = false;
          if (filters.minStrength && (shadow.strength || 0) < filters.minStrength) matches = false;

          if (matches) {
            results.push(shadow);
          }

          cursor.continue();
        } else {
          // All shadows processed - sort and paginate
          results.sort((a, b) => {
            const aVal = a[sortBy] || 0;
            const bVal = b[sortBy] || 0;
            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
          });

          // Apply pagination
          const paginated = results.slice(offset, offset + limit);

          this.debugLog('GET_SHADOWS', 'Query completed', {
            total: results.length,
            returned: paginated.length,
            offset,
            limit,
            filters,
            dbInitialized: !!this.db,
            storeName: this.storeName,
          });

          // Debug: Log sample shadow data if available
          if (paginated.length > 0 && paginated.length <= 5) {
            this.debugLog('GET_SHADOWS', 'Sample shadow data', {
              sampleShadows: paginated.map((s) => ({
                id: s.id,
                rank: s.rank,
                strength: s.strength,
                hasBaseStats: !!s.baseStats,
                level: s.level || 1,
              })),
            });
          }

          resolve(paginated);
        }
      };

      // Request error handler (fallback)
      request.onerror = () => {
        this.debugError('GET_SHADOWS', 'Failed to open cursor', request.error);
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
              effectiveStats.perception) /
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
          this.debugLog('GET_ARMY_STATS', 'Statistics calculated', {
            total: stats.total,
            avgLevel: stats.avgLevel,
          });
          resolve(stats);
        }
      };

      // Transaction error handler
      transaction.onerror = () => {
        this.debugError('GET_ARMY_STATS', 'Transaction failed', transaction.error);
        reject(transaction.error || request.error);
      };

      // Request error handler
      request.onerror = () => {
        this.debugError('GET_ARMY_STATS', 'Failed to get army statistics', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get effective stats for a shadow (base + growth + natural growth)
   * Used internally by ShadowStorageManager for stat calculations.
   * Operations:
   * 1. Get base stats from shadow.baseStats
   * 2. Get growth stats from shadow.growthStats (level-ups)
   * 3. Get natural growth stats from shadow.naturalGrowthStats (passive)
   * 4. Sum all three for each stat
   * 5. Return effective stats object
   */
  getShadowEffectiveStats(shadow) {
    // HYBRID COMPRESSION: Decompress if needed
    shadow = this.getShadowData(shadow);
    const base = shadow.baseStats || {};
    const growth = shadow.growthStats || {};
    const naturalGrowth = shadow.naturalGrowthStats || {};

    return {
      strength: (base.strength || 0) + (growth.strength || 0) + (naturalGrowth.strength || 0),
      agility: (base.agility || 0) + (growth.agility || 0) + (naturalGrowth.agility || 0),
      intelligence:
        (base.intelligence || 0) + (growth.intelligence || 0) + (naturalGrowth.intelligence || 0),
      vitality: (base.vitality || 0) + (growth.vitality || 0) + (naturalGrowth.vitality || 0),
      perception:
        (base.perception || 0) + (growth.perception || 0) + (naturalGrowth.perception || 0),
    };
  }

  /**
   * Get total shadow count (optimized with IndexedDB count())
   * Uses BdAPI patterns: Efficient counting, proper error handling
   * Operations:
   * 1. Ensure database initialized
   * 2. Open transaction in readonly mode
   * 3. Use IndexedDB count() method (O(1) operation, no cursor needed)
   * 4. Return total count
   */
  async getTotalCount() {
    // Ensure database initialized
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      // Transaction error handler
      transaction.onerror = () => {
        this.debugError('GET_TOTAL_COUNT', 'Transaction failed', transaction.error);
        reject(transaction.error || request.error);
      };

      // Request success handler
      request.onsuccess = () => {
        const count = request.result;
        this.debugLog('GET_TOTAL_COUNT', 'Count retrieved', { count });
        resolve(count);
      };

      // Request error handler
      request.onerror = () => {
        this.debugError('GET_TOTAL_COUNT', 'Failed to get count', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete a shadow by ID
   * Uses BdAPI patterns: Input validation, cache cleanup, proper error handling
   * Operations:
   * 1. Validate ID input (guard clause)
   * 2. Ensure database initialized
   * 3. Open transaction in readwrite mode
   * 4. Delete shadow from object store
   * 5. Remove from all caches (favorite, recent)
   * 6. Return success status
   */
  async deleteShadow(id) {
    // Guard clause: Validate input
    if (!id) {
      const error = new Error('Invalid shadow ID: missing id');
      this.debugError('DELETE', 'Cannot delete shadow: invalid input', error);
      throw error;
    }

    // Ensure database initialized
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      // Transaction error handler
      transaction.onerror = () => {
        this.debugError('DELETE', 'Transaction failed while deleting shadow', transaction.error);
        reject(transaction.error || request.error);
      };

      // Request success handler
      request.onsuccess = () => {
        // Remove from cache (cleanup) - handle both id and i
        // Try to get shadow first to invalidate all possible keys
        const cachedShadow = this.recentCache.get(id);
        if (cachedShadow) {
          this.invalidateCache(cachedShadow);
        } else {
          // Fallback: just delete by id
          this.recentCache.delete(id);
        }
        this.debugLog('DELETE', 'Shadow deleted successfully', { id });
        resolve({ success: true });
      };

      // Request error handler (fallback)
      request.onerror = () => {
        this.debugError('DELETE', 'Failed to delete shadow', request.error);
        reject(request.error);
      };
    });
  }

  // ============================================================================
  // Note: Favorite shadows removed - widgets automatically show top 7 generals by power
  // ============================================================================

  // ============================================================================
  // STORAGE 3.3 BATCH OPERATIONS FOR PERFORMANCE
  // ============================================================================

  /**
   * Batch update shadows (optimized for compression operations)
   * Uses single transaction for multiple updates (much faster than delete+save)
   * Operations:
   * 1. Validate input array (guard clause)
   * 2. Ensure database initialized
   * 3. Open single transaction for all updates
   * 4. Update all shadows in batch
   * 5. Track completion and errors
   * 6. Return count of successfully updated shadows
   * @param {Array<Object>} shadows - Array of shadow objects to update
   * @returns {Promise<number>} - Count of successfully updated shadows
   */
  async updateShadowsBatch(shadows) {
    // Guard clause: Validate input
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) {
      this.debugLog('BATCH_UPDATE', 'No shadows to update', { count: 0 });
      return 0;
    }

    // Ensure database initialized
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      let completed = 0;
      let errors = 0;
      const total = shadows.length;

      // Transaction error handler
      transaction.onerror = () => {
        this.debugError(
          'BATCH_UPDATE',
          'Transaction failed during batch update',
          transaction.error
        );
        reject(transaction.error);
      };

      // Transaction complete handler
      transaction.oncomplete = () => {
        this.debugLog('BATCH_UPDATE', 'Batch update transaction completed', {
          completed,
          errors,
          total,
          successRate: `${((completed / total) * 100).toFixed(1)}%`,
        });
        resolve(completed);
      };

      // Process each shadow in batch
      shadows.forEach((shadow, index) => {
        // Guard clause: Validate shadow has identifier
        // Compressed shadows use 'i', uncompressed use 'id'
        if (!shadow) {
          errors++;
          this.debugError('BATCH_UPDATE', `Null shadow at index ${index}`, { index });
          return;
        }

        // Check for identifier: compressed shadows need 'i', others need 'id'
        const isCompressed = shadow._c === 1 || shadow._c === 2;
        const hasIdentifier = isCompressed ? shadow.i : shadow.id;

        if (!hasIdentifier) {
          errors++;
          this.debugError('BATCH_UPDATE', `Invalid shadow at index ${index}`, {
            index,
            isCompressed,
            hasI: !!shadow.i,
            hasId: !!shadow.id,
            shadowKeys: Object.keys(shadow || {}),
          });
          return;
        }

        const request = store.put(shadow);

        request.onsuccess = () => {
          completed++;
          // Invalidate cache for updated shadow (handles compression state changes)
          // Store old shadow before update for proper invalidation
          const oldShadow = this.recentCache.get(shadow.id || shadow.i);
          if (oldShadow) {
            this.invalidateCache(oldShadow);
          }
          // Update cache with new shadow state
          this.updateCache(shadow, oldShadow);
        };

        request.onerror = () => {
          errors++;
          this.debugError('BATCH_UPDATE', `Failed to update shadow at index ${index}`, {
            index,
            id: shadow.id || shadow.i,
            error: request.error,
          });
        };
      });
    });
  }

  /**
   * Batch delete shadows (optimized for essence conversion)
   * Uses single transaction for multiple deletes (much faster than sequential)
   * Operations:
   * 1. Validate input array (guard clause)
   * 2. Ensure database initialized
   * 3. Open single transaction for all deletes
   * 4. Delete all shadows in batch
   * 5. Track completion and errors
   * 6. Return count of successfully deleted shadows
   * @param {Array<string>} shadowIds - Array of shadow IDs to delete
   * @returns {Promise<number>} - Count of successfully deleted shadows
   */
  async deleteShadowsBatch(shadowIds) {
    // Guard clause: Validate input
    if (!shadowIds || !Array.isArray(shadowIds) || shadowIds.length === 0) {
      this.debugLog('BATCH_DELETE', 'No shadows to delete', { count: 0 });
      return 0;
    }

    // Ensure database initialized
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      let completed = 0;
      let errors = 0;
      const total = shadowIds.length;

      // Transaction error handler
      transaction.onerror = () => {
        this.debugError(
          'BATCH_DELETE',
          'Transaction failed during batch delete',
          transaction.error
        );
        reject(transaction.error);
      };

      // Transaction complete handler
      transaction.oncomplete = () => {
        // Invalidate aggregated power cache when shadows are deleted
        this.aggregatedPowerCache = null;
        this.aggregatedPowerCacheTime = null;

        this.debugLog('BATCH_DELETE', 'Batch delete transaction completed', {
          completed,
          errors,
          total,
          successRate: `${((completed / total) * 100).toFixed(1)}%`,
        });
        resolve(completed);
      };

      // Process each shadow ID in batch
      shadowIds.forEach((id, index) => {
        // Guard clause: Validate ID
        if (!id) {
          errors++;
          this.debugError('BATCH_DELETE', `Invalid shadow ID at index ${index}`, { index, id });
          return;
        }

        const request = store.delete(id);

        request.onsuccess = () => {
          completed++;
          // Remove from cache - handle both id and i for compressed shadows
          const cachedShadow = this.recentCache.get(id);
          if (cachedShadow) {
            this.invalidateCache(cachedShadow);
          } else {
            // Fallback: just delete by id
            this.recentCache.delete(id);
          }
        };

        request.onerror = () => {
          errors++;
          this.debugError('BATCH_DELETE', `Failed to delete shadow at index ${index}`, {
            index,
            id,
            error: request.error,
          });
        };
      });
    });
  }

  // ============================================================================
  // STORAGE 3.4 AGGREGATION FOR PERFORMANCE
  // ============================================================================

  /**
   * Get aggregated power for weak shadows (2+ ranks below user rank)
   * Uses BdAPI patterns: Cache-first with TTL, concurrent execution prevention, indexed queries
   * Operations:
   * 1. Validate input parameters (guard clauses)
   * 2. Check cache first (1 minute TTL) - fast path
   * 3. Prevent concurrent execution (lock mechanism)
   * 4. Calculate weak rank threshold (2+ ranks below user)
   * 5. Query IndexedDB using rank index (batch queries)
   * 6. Sum total power and count
   * 7. Update cache and resolve
   * @param {string} userRank - User's current rank
   * @param {string[]} shadowRanks - Array of all shadow ranks in order
   * @returns {Promise<Object>} - { totalPower, totalCount, ranks, timestamp }
   */
  async getAggregatedPower(userRank, shadowRanks, forceRecalculate = false) {
    this.debugLog('GET_AGGREGATED_POWER', 'Starting aggregated power calculation', {
      userRank,
      shadowRanksCount: shadowRanks?.length || 0,
      forceRecalculate,
      hasCache: !!this.aggregatedPowerCache,
      cacheAge: this.aggregatedPowerCacheTime ? Date.now() - this.aggregatedPowerCacheTime : null,
    });

    // Guard clause: Validate input
    if (!userRank || !shadowRanks || !Array.isArray(shadowRanks)) {
      const error = new Error('Invalid parameters: userRank and shadowRanks required');
      this.debugError('GET_AGGREGATED_POWER', 'Invalid parameters', error);
      return { totalPower: 0, totalCount: 0, ranks: [], timestamp: Date.now() };
    }

    // Fast path: Check cache first (uses helper from STORAGE SECTION 2.5)
    // Skip cache if forceRecalculate is true
    if (
      !forceRecalculate &&
      this.aggregatedPowerCache &&
      !this.isCacheExpired(this.aggregatedPowerCacheTime, this.cacheTTL)
    ) {
      this.debugLog('GET_AGGREGATED_POWER', 'Returning cached aggregated power', {
        totalPower: this.aggregatedPowerCache.totalPower,
        totalCount: this.aggregatedPowerCache.totalCount,
        cacheAge: Date.now() - this.aggregatedPowerCacheTime,
      });
      return this.aggregatedPowerCache;
    }

    this.debugLog(
      'GET_AGGREGATED_POWER',
      'Cache miss or force recalculate - performing fresh calculation'
    );

    // Prevent concurrent execution (avoid duplicate queries)
    if (this._aggregatingPower) {
      this.debugLog('GET_AGGREGATED_POWER', 'Waiting for concurrent aggregation to complete');
      return this._aggregatingPower;
    }

    // Ensure database initialized
    if (!this.db) {
      await this.init();
    }

    // Calculate weak rank threshold (2+ ranks below user rank)
    const userRankIndex = shadowRanks.indexOf(userRank);
    if (userRankIndex === -1) {
      this.debugError('GET_AGGREGATED_POWER', 'User rank not found in shadowRanks array', {
        userRank,
        shadowRanks,
      });
      return { totalPower: 0, totalCount: 0, ranks: [], timestamp: Date.now() };
    }

    const weakRankThreshold = Math.max(0, userRankIndex - 2);
    const weakRanks = shadowRanks.slice(0, weakRankThreshold + 1);

    // Guard clause: No weak ranks to aggregate
    if (weakRanks.length === 0) {
      const result = { totalPower: 0, totalCount: 0, ranks: [], timestamp: Date.now() };
      this.aggregatedPowerCache = result;
      this.aggregatedPowerCacheTime = Date.now();
      return result;
    }

    // Create aggregation promise (prevents concurrent execution)
    this._aggregatingPower = new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const rankIndex = store.index('rank');

      let totalPower = 0;
      let totalCount = 0;
      let completed = 0;
      let errors = 0;

      // Transaction error handler
      transaction.onerror = () => {
        this.debugError('GET_AGGREGATED_POWER', 'Transaction failed', transaction.error);
        this._aggregatingPower = null;
        reject(transaction.error);
      };

      // Process each weak rank in parallel
      weakRanks.forEach((rank) => {
        const request = rankIndex.getAll(rank);

        request.onsuccess = () => {
          const shadows = request.result || [];
          shadows.forEach((shadow) => {
            // Calculate strength from stats if missing
            let shadowStrength = shadow.strength;

            // Handle ultra-compressed shadows (they store power as 'p' scaled by 100)
            if (!shadowStrength || shadowStrength === 0) {
              if (shadow._c === 2 && shadow.p !== undefined) {
                // Ultra-compressed: p is scaled power (strength / 100)
                shadowStrength = shadow.p * 100;
                this.debugLog('GET_AGGREGATED_POWER', 'Using ultra-compressed power', {
                  shadowId: shadow.i,
                  p: shadow.p,
                  calculatedStrength: shadowStrength,
                });
              } else if (shadow.baseStats) {
                // Try to calculate from baseStats
                shadowStrength = this.calculateShadowPower(shadow.baseStats, 1); // Use multiplier 1, not level
              } else {
                // Fallback: use decompressed data
                const decompressed = this.getShadowData(shadow);
                if (decompressed && decompressed.baseStats) {
                  shadowStrength = this.calculateShadowPower(decompressed.baseStats, 1); // Use multiplier 1
                } else if (decompressed && decompressed.strength) {
                  shadowStrength = decompressed.strength;
                } else if (decompressed && decompressed._c === 2 && decompressed.p !== undefined) {
                  // Decompressed ultra-compressed shadow still has 'p'
                  shadowStrength = decompressed.p * 100;
                }
              }
            }
            // Ensure we have a valid strength value
            if (!shadowStrength || shadowStrength === 0) {
              // Last resort: try to get from shadow directly if it exists
              if (shadow.strength && shadow.strength > 0) {
                shadowStrength = shadow.strength;
              } else {
                // Try to calculate from effective stats if available
                const effectiveStats = this.getShadowEffectiveStats
                  ? this.getShadowEffectiveStats(shadow)
                  : null;
                if (effectiveStats) {
                  shadowStrength = this.calculateShadowPower(effectiveStats, 1);
                } else {
                  // Skip this shadow if we can't calculate strength
                  this.debugLog(
                    'GET_AGGREGATED_POWER',
                    'Skipping shadow with no calculable strength',
                    {
                      shadowId: shadow.id || shadow.i,
                      hasBaseStats: !!shadow.baseStats,
                      hasStrength: !!shadow.strength,
                      isCompressed: !!(shadow._c === 1 || shadow._c === 2),
                    }
                  );
                  return; // Skip this shadow (use return in forEach, not continue)
                }
              }
            }
            // Only add to totals if we have valid strength
            if (shadowStrength && shadowStrength > 0) {
              totalPower += shadowStrength;
              totalCount++;
            }
          });

          completed++;

          // Check if all ranks processed
          if (completed + errors === weakRanks.length) {
            const result = {
              totalPower,
              totalCount,
              ranks: weakRanks,
              timestamp: Date.now(),
            };

            // Update cache
            this.aggregatedPowerCache = result;
            this.aggregatedPowerCacheTime = Date.now();
            this._aggregatingPower = null;

            this.debugLog('GET_AGGREGATED_POWER', 'Aggregation completed successfully', {
              totalPower,
              totalCount,
              ranksProcessed: weakRanks.length,
              weakRanks,
              avgPowerPerShadow: totalCount > 0 ? Math.floor(totalPower / totalCount) : 0,
              cacheUpdated: true,
            });

            resolve(result);
          }
        };

        request.onerror = () => {
          errors++;
          this.debugError(
            'GET_AGGREGATED_POWER',
            `Failed to get shadows for rank ${rank}`,
            request.error
          );

          // Continue with other ranks even if one fails
          if (completed + errors === weakRanks.length) {
            const result = {
              totalPower,
              totalCount,
              ranks: weakRanks,
              timestamp: Date.now(),
            };

            // Update cache even with partial results
            this.aggregatedPowerCache = result;
            this.aggregatedPowerCacheTime = Date.now();
            this._aggregatingPower = null;

            this.debugLog('GET_AGGREGATED_POWER', 'Aggregation completed with errors', {
              totalPower,
              totalCount,
              errors,
              ranksProcessed: weakRanks.length,
            });

            resolve(result);
          }
        };
      });
    });

    return this._aggregatingPower;
  }

  // ============================================================================
  // 3.5.1 QUERY OPTIMIZATION HELPERS (Indexed Queries)
  // ============================================================================
  // Note: Cache management helpers are in STORAGE SECTION 2.4
  // Note: Shadow data helpers are in STORAGE SECTION 2.2
  // These are optimized query methods that use IndexedDB indexes directly

  /**
   * Get shadows by rank using index directly (FAST for millions)
   * Query optimization: Uses IndexedDB index instead of loading all then filtering
   * Operations:
   * 1. Use rank index for fast lookup
   * 2. Return all shadows with matching rank
   * @param {string} rank - Shadow rank to filter by
   * @returns {Promise<Array>} - Array of shadows with matching rank
   */
  async getShadowsByRank(rank) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('rank');
      const request = index.getAll(rank); // Direct index query - FAST!

      transaction.onerror = () => {
        this.debugError('GET_BY_RANK', 'Transaction failed', transaction.error);
        reject(transaction.error || request.error);
      };

      request.onsuccess = () => {
        const shadows = request.result || [];
        this.debugLog('GET_BY_RANK', 'Shadows retrieved by rank', { rank, count: shadows.length });
        resolve(shadows);
      };

      request.onerror = () => {
        this.debugError('GET_BY_RANK', 'Failed to get shadows by rank', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get top N shadows by power (using strength index)
   * Query optimization: Uses IndexedDB index with cursor for efficient sorting
   * Operations:
   * 1. Use strength index for sorting
   * 2. Return top N shadows by power
   * @param {number} limit - Maximum number of shadows to return
   * @returns {Promise<Array>} - Array of top shadows
   */
  async getTopShadowsByPower(limit = 100) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('strength');
      const request = index.openCursor(null, 'prev'); // Descending order

      const results = [];

      transaction.onerror = () => {
        this.debugError('GET_TOP_POWER', 'Transaction failed', transaction.error);
        reject(transaction.error || request.error);
      };

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          this.debugLog('GET_TOP_POWER', 'Top shadows retrieved', { count: results.length, limit });
          resolve(results);
        }
      };

      request.onerror = () => {
        this.debugError('GET_TOP_POWER', 'Failed to get top shadows by power', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get shadow count by rank (FAST aggregation)
   * Query optimization: Uses IndexedDB count() method - very fast
   * Operations:
   * 1. Use rank index for fast counting
   * 2. Return count of shadows with matching rank
   * @param {string} rank - Shadow rank to count
   * @returns {Promise<number>} - Count of shadows with matching rank
   */
  async getCountByRank(rank) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('rank');
      const request = index.count(rank); // Direct count - VERY FAST!

      transaction.onerror = () => {
        this.debugError('GET_COUNT_BY_RANK', 'Transaction failed', transaction.error);
        reject(transaction.error || request.error);
      };

      request.onsuccess = () => {
        const count = request.result || 0;
        this.debugLog('GET_COUNT_BY_RANK', 'Count retrieved by rank', { rank, count });
        resolve(count);
      };

      request.onerror = () => {
        this.debugError('GET_COUNT_BY_RANK', 'Failed to get count by rank', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get shadows by role using index (optimized query)
   * Operations:
   * 1. Use role index for fast lookup
   * 2. Return all shadows with matching role
   * @param {string} role - Shadow role to filter by
   * @returns {Promise<Array>} - Array of shadows with matching role
   */
  async getShadowsByRole(role) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const roleIndex = store.index('role');
      const request = roleIndex.getAll(role);

      transaction.onerror = () => {
        this.debugError('GET_BY_ROLE', 'Transaction failed', transaction.error);
        reject(transaction.error || request.error);
      };

      request.onsuccess = () => {
        const shadows = request.result || [];
        this.debugLog('GET_BY_ROLE', 'Shadows retrieved by role', { role, count: shadows.length });
        resolve(shadows);
      };

      request.onerror = () => {
        this.debugError('GET_BY_ROLE', 'Failed to get shadows by role', request.error);
        reject(request.error);
      };
    });
  }

  // ============================================================================
  // STORAGE 3.6 DATABASE CLEANUP
  // ============================================================================

  /**
   * Close IndexedDB connection and cleanup
   * Operations:
   * 1. Close database connection
   * 2. Clear all caches (via helper in STORAGE SECTION 2.4)
   * 3. Reset database reference
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.debugLog('CLOSE', 'Database connection closed');
    }
    this.clearCache(); // Helper method from STORAGE SECTION 2.4
  }
}

// ================================================================================
// MAIN PLUGIN CLASS - Shadow Army Management
// ================================================================================

module.exports = class ShadowArmy {
  // ============================================================================
  // SECTION 1: IMPORTS & DEPENDENCIES
  // ============================================================================
  // No external imports (BetterDiscord plugin)
  // Uses: BdApi, IndexedDB, DOM APIs

  // ============================================================================
  // SECTION 2: CONFIGURATION & HELPERS
  // ============================================================================

  // ============================================================================
  // 2.1 CONSTRUCTOR & INITIALIZATION
  // ============================================================================

  /**
   * Initialize ShadowArmy plugin with default settings and configuration
   * Uses BdAPI patterns: Deep copy for settings, proper initialization order
   * Operations:
   * 1. Set up default settings (enabled, shadows array, extraction config)
   * 2. Deep copy settings to prevent mutation (CRITICAL: prevents save corruption)
   * 3. Define shadow rank system (E through Shadow Monarch)
   * 4. Define shadow roles with buffs and effects (26 total: 8 humanoid + 18 magic beast)
   * 5. Define stat weight templates for role-based stat generation
   * 6. Initialize component references (storage, UI, solo plugin)
   * 7. Initialize debug logging system (methods in SECTION 4)
   */
  constructor() {
    // ============================================================================
    // DEFAULT SETTINGS - Plugin Configuration
    // ============================================================================
    this.defaultSettings = {
      enabled: true,
      shadows: [], // Array of shadow objects
      totalShadowsExtracted: 0,
      lastExtractionTime: null,
      // Note: Generals are now auto-selected based on 7 strongest shadows (no manual selection)
      extractionConfig: {
        // Base extraction tuning (regular messages)
        minBaseChance: 0.01, // 1% minimum (reasonable starting chance)
        chancePerInt: 0.01, // +1% per INT point (more impactful)
        maxExtractionChance: 0.3, // 30% cap for regular messages (dungeons skip this cap via skipCap=true)
        maxExtractionsPerMinute: 20, // hard safety cap
        // Special ARISE event tuning
        specialBaseChance: 0.01, // 1% base
        specialIntMultiplier: 0.003, // +0.3% per INT
        specialLuckMultiplier: 0.002, // +0.2% per Perception (perception proxy)
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
      shadowEssence: {
        enabled: true,
        essence: 0, // Total essence accumulated
        lastConversionTime: null,
        conversionIntervalHours: 1, // Convert weakest shadows every hour
        weakShadowThreshold: 0.1, // Bottom 10% by power are converted (regular cleanup)
        minShadowsToKeep: 100, // Always keep at least 100 shadows (safety for large armies)
        essencePerShadow: {
          // Essence value by rank (higher rank = more essence)
          E: 1,
          D: 3,
          C: 7,
          B: 15,
          A: 30,
          S: 60,
          SS: 120,
          SSS: 240,
          'SSS+': 480,
          NH: 960,
          Monarch: 1920,
          'Monarch+': 3840,
          'Shadow Monarch': 7680,
        },
      },
      shadowCompression: {
        enabled: true, // Enable hybrid compression system
        eliteThreshold: 100, // Top 100 shadows kept uncompressed
        compressionVersion: 1, // Track compression format version
        lastCompressionTime: null,
        compressionIntervalHours: 1, // Compress shadows every hour
      },
      // ARISE Animation settings (merged from ShadowAriseAnimation plugin)
      ariseAnimation: {
        enabled: true, // Enable epic ARISE animation
        animationDuration: 2500, // Animation duration in milliseconds
        scale: 1.0, // Animation scale multiplier
        showRankAndRole: true, // Show rank and role under ARISE text
        animationFont: 'Speedy Space Goat Oddity', // Font for ARISE animation text
        useLocalFonts: true, // Use local font files for animation font
      },
    };

    // ============================================================================
    // SETTINGS INITIALIZATION - Deep Copy to Prevent Mutation
    // ============================================================================
    // CRITICAL: Deep copy prevents defaultSettings from being modified by user changes
    // This ensures defaultSettings always contains the original values for merging
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));

    // ============================================================================
    // SHADOW RANK SYSTEM - Solo Leveling Rank Hierarchy
    // ============================================================================
    // Shadow ranks matching Solo Leveling rank system (E through Shadow Monarch)
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

    // ============================================================================
    // SHADOW ROLES SYSTEM - 26 Total Types (8 Humanoid + 18 Magic Beast)
    // ============================================================================
    // Shadow roles with their abilities, buffs, and effects
    // Humanoid roles: Extracted from regular messages (100%)
    // Magic Beast roles: Extracted from dungeons only (100%)
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
        buffs: { vitality: 0.15, perception: 0.1 }, // +15% VIT, +10% PER per shadow
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
        buffs: { perception: 0.15, intelligence: 0.1 }, // +15% PER, +10% INT per shadow
        effect: 'Perception Amplification', // Increases perception-based bonuses
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
        buffs: { intelligence: 0.16, agility: 0.14, perception: 0.1 },
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

    // ============================================================================
    // STAT WEIGHT TEMPLATES - Role-Based Stat Generation
    // ============================================================================
    // Stat weight templates per role (used to generate per-shadow stats)
    // Higher weight = that role favors that stat more
    // EXTREME SPECIALIZATION: Strong stats are VERY strong, weak stats are VERY weak
    this.shadowRoleStatWeights = {
      tank: {
        strength: 0.9, // Above average
        agility: 0.3, // WEAK (slow, heavy armor)
        intelligence: 0.2, // VERY WEAK (brute)
        vitality: 1.5, // VERY STRONG (tank)
        perception: 0.3, // WEAK
      },
      healer: {
        strength: 0.2, // VERY WEAK (support, not fighter)
        agility: 0.4, // WEAK
        intelligence: 1.3, // VERY STRONG (magic knowledge)
        vitality: 1.1, // STRONG (support endurance)
        perception: 1.0, // STRONG (healing perception)
      },
      mage: {
        strength: 0.15, // EXTREMELY WEAK (glass cannon)
        agility: 0.5, // WEAK (not mobile)
        intelligence: 1.6, // EXTREMELY STRONG (magic power)
        vitality: 0.4, // WEAK (fragile)
        perception: 0.6, // Below average
      },
      assassin: {
        strength: 0.7, // Above average (needs damage)
        agility: 1.7, // EXTREMELY STRONG (speed/stealth)
        intelligence: 0.5, // WEAK (not thinker)
        vitality: 0.3, // VERY WEAK (glass cannon)
        perception: 0.8, // Above average (crit)
      },
      ranger: {
        strength: 0.6, // Below average
        agility: 1.3, // VERY STRONG (ranged mobility)
        intelligence: 1.0, // STRONG (tactical)
        vitality: 0.5, // WEAK (light armor)
        perception: 0.8, // Above average (accuracy)
      },
      knight: {
        strength: 1.1, // STRONG (balanced warrior)
        agility: 0.9, // Above average
        intelligence: 0.6, // Below average
        vitality: 1.1, // STRONG (armor)
        perception: 0.5, // WEAK
      },
      berserker: {
        strength: 1.8, // EXTREMELY STRONG (raw power)
        agility: 0.7, // Below average (heavy weapons)
        intelligence: 0.15, // EXTREMELY WEAK (brute force)
        vitality: 0.5, // WEAK (reckless)
        perception: 0.4, // WEAK
      },
      support: {
        strength: 0.25, // VERY WEAK (non-combatant)
        agility: 0.6, // Below average
        intelligence: 1.2, // VERY STRONG (strategy)
        vitality: 0.7, // Below average
        perception: 1.4, // EXTREMELY STRONG (buffs)
      },
      // MAGIC BEAST STAT WEIGHTS - Dungeon-Only Shadows
      ant: {
        strength: 1.1, // STRONG (powerful mandibles)
        agility: 1.2, // VERY STRONG (fast insect)
        intelligence: 0.4, // WEAK (instinct-driven)
        vitality: 0.9, // Above average (exoskeleton)
        perception: 0.5, // WEAK
      },
      bear: {
        strength: 1.6, // EXTREMELY STRONG (raw power)
        agility: 0.4, // WEAK (heavy, slow)
        intelligence: 0.3, // VERY WEAK (beast)
        vitality: 1.4, // VERY STRONG (thick hide)
        perception: 0.4, // WEAK
      },
      wolf: {
        strength: 1.0, // STRONG (predator)
        agility: 1.5, // EXTREMELY STRONG (pack hunter)
        intelligence: 0.7, // Below average (pack tactics)
        vitality: 0.8, // Above average
        perception: 0.6, // Below average
      },
      spider: {
        strength: 0.6, // Below average
        agility: 1.4, // VERY STRONG (eight legs)
        intelligence: 1.1, // STRONG (trap tactics)
        vitality: 0.5, // WEAK (fragile body)
        perception: 0.8, // Above average (web perception)
      },
      golem: {
        strength: 1.3, // VERY STRONG (stone fists)
        agility: 0.2, // EXTREMELY WEAK (slow construct)
        intelligence: 0.1, // EXTREMELY WEAK (mindless)
        vitality: 1.9, // EXTREMELY STRONG (stone body)
        perception: 0.3, // VERY WEAK
      },
      wyvern: {
        strength: 1.4, // VERY STRONG (claws/bite)
        agility: 1.6, // EXTREMELY STRONG (aerial)
        intelligence: 0.6, // Below average (beast)
        vitality: 1.0, // STRONG (dragon scales)
        perception: 0.7, // Below average
      },
      serpent: {
        strength: 0.8, // Above average (constrictor)
        agility: 1.3, // VERY STRONG (slithering)
        intelligence: 1.1, // STRONG (cunning predator)
        vitality: 0.7, // Below average (reptile)
        perception: 0.9, // Above average (venom perception)
      },
      dragon: {
        strength: 1.7, // EXTREMELY STRONG (apex)
        agility: 1.4, // VERY STRONG (flying)
        intelligence: 1.5, // VERY STRONG (ancient wisdom)
        vitality: 1.6, // EXTREMELY STRONG (dragon scales)
        perception: 1.2, // VERY STRONG (legendary)
      },
      orc: {
        strength: 1.5, // EXTREMELY STRONG (brutal warrior)
        agility: 0.7, // Below average (heavy build)
        intelligence: 0.3, // VERY WEAK (savage)
        vitality: 1.2, // VERY STRONG (tough skin)
        perception: 0.5, // WEAK
      },
      naga: {
        strength: 0.8, // Above average (serpent tail)
        agility: 1.3, // VERY STRONG (slithering)
        intelligence: 1.4, // VERY STRONG (water magic)
        vitality: 0.9, // Above average (scales)
        perception: 1.0, // STRONG
      },
      titan: {
        strength: 1.8, // EXTREMELY STRONG (colossal)
        agility: 0.3, // VERY WEAK (massive size)
        intelligence: 0.4, // WEAK (ancient but simple)
        vitality: 1.7, // EXTREMELY STRONG (titan endurance)
        perception: 0.6, // Below average
      },
      giant: {
        strength: 1.6, // EXTREMELY STRONG (massive)
        agility: 0.4, // WEAK (large, slow)
        intelligence: 0.5, // WEAK (brutish)
        vitality: 1.5, // VERY STRONG (giant constitution)
        perception: 0.5, // WEAK
      },
      elf: {
        strength: 0.5, // WEAK (elegant, not brutish)
        agility: 1.5, // EXTREMELY STRONG (graceful)
        intelligence: 1.6, // EXTREMELY STRONG (ancient magic)
        vitality: 0.6, // Below average (slender)
        perception: 1.3, // VERY STRONG (blessed)
      },
      demon: {
        strength: 1.5, // EXTREMELY STRONG (dark power)
        agility: 1.2, // VERY STRONG (supernatural speed)
        intelligence: 1.4, // VERY STRONG (dark magic)
        vitality: 1.1, // STRONG (demonic endurance)
        perception: 0.8, // Above average (chaos)
      },
      ghoul: {
        strength: 0.9, // Above average (undead strength)
        agility: 1.1, // STRONG (quick movements)
        intelligence: 0.8, // Above average (cunning)
        vitality: 1.3, // VERY STRONG (undead endurance)
        perception: 0.6, // Below average
      },
      ogre: {
        strength: 1.7, // EXTREMELY STRONG (brutal power)
        agility: 0.3, // VERY WEAK (clumsy)
        intelligence: 0.2, // EXTREMELY WEAK (stupid)
        vitality: 1.4, // VERY STRONG (thick hide)
        perception: 0.4, // WEAK
      },
      centipede: {
        strength: 1.0, // STRONG (many legs)
        agility: 1.4, // VERY STRONG (multi-legged)
        intelligence: 0.5, // WEAK (insect mind)
        vitality: 1.1, // STRONG (exoskeleton)
        perception: 0.7, // Below average
      },
      yeti: {
        strength: 1.4, // VERY STRONG (ice beast)
        agility: 0.8, // Above average (mountain predator)
        intelligence: 0.6, // Below average (beast)
        vitality: 1.5, // EXTREMELY STRONG (frost endurance)
        perception: 0.7, // Below average
      },
    };

    // ============================================================================
    // RANK PROBABILITY MULTIPLIERS - Extraction Chance Scaling
    // ============================================================================
    // Lower ranks easier, higher ranks exponentially harder
    // Used in extraction chance calculations (weighted probability)
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

    // ============================================================================
    // RANK STAT MULTIPLIERS - Exponential Power Scaling (1.5x per rank)
    // ============================================================================
    // Each rank is exponentially stronger than the previous (1.5^rank_index)
    // - E rank: Base (1.0x) - 1.5^0
    // - D rank: 1.5x stronger than E - 1.5^1
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

    // ============================================================================
    // COMPONENT REFERENCES - Storage, UI, Integration
    // ============================================================================
    // IndexedDB storage manager (initialized in start())
    this.storageManager = null;
    this.userId = null;

    // Performance cache for shadow power calculations
    this._shadowPowerCache = new Map();
    this._shadowPowerCacheLimit = 1000; // Cache up to 1000 shadow powers

    // CSS management tracking
    this._injectedStyles = new Set(); // Track all injected CSS styles for cleanup

    // Combat performance tracking
    this._armyStatsCache = null; // Cached aggregated army stats
    this._armyStatsCacheTime = null; // Cache timestamp
    this._aggregatingArmyStats = null; // Promise for concurrent aggregation prevention
    this._combatPerformance = null; // Performance metrics tracker

    // Shadow personality system
    this._shadowPersonalityCache = new Map(); // Cache shadow personalities

    // Solo Leveling Stats plugin integration
    this.soloPlugin = null;
    this.originalProcessMessage = null;
    this._extractionTimestamps = [];

    // UI elements (chat button disabled, widgets used instead)
    this.shadowArmyButton = null;
    this.shadowArmyModal = null;
    this.toolbarObserver = null;
    this.toolbarCheckInterval = null;
    this._shadowArmyButtonRetryCount = 0;

    // ARISE Animation system (merged from ShadowAriseAnimation plugin)
    this.animationContainer = null; // Animation container element
    this.webpackModules = {
      UserStore: null,
      ChannelStore: null,
    };
    this.webpackModuleAccess = false;
    this.reactInjectionActive = false;

    // ============================================================================
    // LIFECYCLE STATE - Cleanup Tracking
    // ============================================================================
    // Track all retry timeouts for proper cleanup
    this._retryTimeouts = new Set();
    this._isStopped = false;

    // ============================================================================
    // DEBUG SYSTEM - Property initialization (methods in SECTION 4)
    // ============================================================================
    // Debug logging system (default disabled, enabled via settings)
    // Note: debug.enabled will be synced with settings.debugMode in loadSettings()
    // Debug methods (debugLog, debugError) are defined in SECTION 4
    this.debug = {
      enabled: false, // Will be synced with settings in loadSettings()
      errorCount: 0,
      lastError: null,
      operationCounts: {},
      lastLogTimes: {}, // Track last log time for throttling frequent operations
    };
  }

  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================

  // ============================================================================
  // 3.1 PLUGIN LIFECYCLE (Start & Stop)
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
    // Reset stopped flag to allow watchers to recreate
    this._isStopped = false;

    // Get user ID for storage isolation
    this.userId = await this.getUserId();

    // Initialize IndexedDB storage
    // Note: debugLog and debugError methods are in SECTION 4
    try {
      this.storageManager = new ShadowStorageManager(
        this.userId,
        (tag, msg, data) => this.debugLog(tag, msg, data),
        (tag, msg, err) => this.debugError(tag, msg, err)
      );
      // Provide decompression methods to storage manager for transparent decompression
      this.storageManager.decompressShadow = (shadow) => this.decompressShadow(shadow);
      this.storageManager.decompressShadowUltra = (shadow) => this.decompressShadowUltra(shadow);
      await this.storageManager.init();

      // Migrate from localStorage if needed
      const migrationResult = await this.storageManager.migrateFromLocalStorage();
      if (migrationResult && migrationResult.migrated > 0) {
        this.debugLog(
          'MIGRATION',
          `Migrated ${migrationResult.migrated} shadows from localStorage to IndexedDB`,
          {
            migrated: migrationResult.migrated,
            total: migrationResult.total,
          }
        );
      }

      // Verify storage is working by checking count
      const initialCount = await this.storageManager.getTotalCount();
      const localStorageCount = (this.settings.shadows || []).length;
      this.debugLog('STORAGE', `IndexedDB initialized successfully`, {
        indexedDBShadows: initialCount,
        localStorageShadows: localStorageCount,
        userId: this.userId,
        dbName: this.storageManager.dbName,
        migrationCompleted: migrationResult?.migrated > 0,
      });

      // Warn if there's a mismatch
      if (localStorageCount > 0 && initialCount === 0) {
        this.debugLog(
          'STORAGE',
          'WARNING: Shadows in localStorage but not in IndexedDB - migration may have failed',
          {
            localStorageCount,
            indexedDBCount: initialCount,
          }
        );
      }
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError(
        'STORAGE',
        'IndexedDB initialization failed, using localStorage fallback',
        error
      );
      this.storageManager = null;
    }

    this.loadSettings();

    // Load font for arise animation (Speedy Space Goat Oddity)
    this.loadAriseAnimationFont();

    // Initialize ARISE animation system (merged from ShadowAriseAnimation plugin)
    this.initializeAriseAnimationSystem();

    this.injectCSS(); // Keep CSS for extraction animations (includes ARISE animation CSS)
    this.injectWidgetCSS(); // Widget CSS for member list display (DOM injection disabled)
    this.integrateWithSoloLeveling();
    this.setupMessageListener();
    // Shadow Army button disabled - no chatbox UI
    // this.createShadowArmyButton();

    // Watch for channel changes (button recreation disabled)
    this.setupChannelWatcher();

    // Button retry disabled - no chatbox UI needed
    // (Retries commented out to prevent button recreation)

    // Recalculate all shadows with new exponential formula (one-time migration)
    try {
      await this.recalculateAllShadows();
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('MIGRATION', 'Error recalculating shadows during startup', error);
      // Log error but don't prevent plugin from starting
      // The migration can be retried on next start
    }

    // Fix shadow base stats to match rank baselines (v4 migration)
    try {
      await this.fixShadowBaseStatsToRankBaselines();
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('MIGRATION', 'Error fixing shadow base stats', error);
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

    // Process shadow compression on start (delayed 10 mins to avoid startup lag)
    setTimeout(() => {
      this.processShadowCompression();
    }, 600000); // 10 minutes after start

    // Emergency essence conversion (only if army > 5000)
    setTimeout(() => {
      this.processEmergencyCleanup();
    }, 900000); // 15 minutes after start

    // Then process every hour
    this.naturalGrowthInterval = setInterval(() => {
      this.processNaturalGrowthForAllShadows();
      this.processShadowCompression(); // Compress weak shadows (tiered system)
      this.processShadowEssenceConversion(); // Regular cleanup: Convert weakest shadows to essence
    }, 60 * 60 * 1000); // 1 hour

    // Shadow rank widget for member list display (chatbox button still disabled)
    setTimeout(() => {
      this.injectShadowRankWidget();
    }, 100);

    // Update widget every 30 seconds
    this.widgetUpdateInterval = setInterval(() => {
      this.updateShadowRankWidget();
    }, 30000);

    // Chatbox button disabled - no removal needed
    // Button UI was removed in v3.0.0
  }

  /**
   * Stop the ShadowArmy plugin and clean up resources
   * Operations:
   * 1. Remove message listener to prevent memory leaks
   * 2. Remove injected CSS styles
   * 3. Clear natural growth interval
   */
  stop() {
    // Set stopped flag to prevent recreating watchers
    this._isStopped = true;

    // Cleanup ARISE animation system (merged from ShadowAriseAnimation plugin)
    this.cleanupAriseAnimationSystem();

    this.removeMessageListener();
    this.removeCSS();
    this.removeWidgetCSS();
    // Cleanup all CSS (including any dungeon CSS)
    this.cleanupAllCSS();
    // Cleanup combat caches
    this.clearCombatCache();
    // Chatbox button disabled - no removal needed
    this.closeShadowArmyModal();

    // Clear all tracked retry timeouts
    this._retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._retryTimeouts.clear();

    // Clear retry timeout if pending (legacy)
    if (this._shadowArmyButtonRetryTimeout) {
      clearTimeout(this._shadowArmyButtonRetryTimeout);
      this._shadowArmyButtonRetryTimeout = null;
    }

    // Clear natural growth interval
    if (this.naturalGrowthInterval) {
      clearInterval(this.naturalGrowthInterval);
      this.naturalGrowthInterval = null;
    }

    // Cleanup URL change watcher
    if (this._urlChangeCleanup) {
      this._urlChangeCleanup();
      this._urlChangeCleanup = null;
    }

    // Clear widget update interval
    if (this.widgetUpdateInterval) {
      clearInterval(this.widgetUpdateInterval);
      this.widgetUpdateInterval = null;
    }

    // Clear widget reinjection timeout
    if (this.widgetReinjectionTimeout) {
      clearTimeout(this.widgetReinjectionTimeout);
      this.widgetReinjectionTimeout = null;
    }

    // COMPREHENSIVE MEMORY CLEANUP
    // Clear caches
    if (this.cachedBuffs) this.cachedBuffs = null;
    this.cachedBuffsTime = null;

    // Clear extraction timestamps
    if (this.extractionTimestamps) {
      this.extractionTimestamps.length = 0;
      this.extractionTimestamps = null;
    }

    // Clear dungeon extraction attempts tracking
    if (this.settings.dungeonExtractionAttempts) {
      this.settings.dungeonExtractionAttempts = null;
    }

    // Note: StorageManager caches (recentCache, aggregationCache)
    // are managed by the storage manager itself and will be cleaned up when
    // database is closed

    // Clear widget injection timeouts
    if (this._widgetInjectionTimeouts) {
      this._widgetInjectionTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this._widgetInjectionTimeouts.clear();
      this._widgetInjectionTimeouts = null;
    }

    // Disconnect member list observer
    if (this.memberListObserver) {
      this.memberListObserver.disconnect();
      this.memberListObserver = null;
    }

    // Remove shadow rank widget
    this.removeShadowRankWidget();

    // Clear cached buffs
    this.cachedBuffs = null;
    this.cachedBuffsTime = null;

    // Close IndexedDB connection
    if (this.storageManager) {
      this.storageManager.close();
      this.storageManager = null;
    }
  }

  // ============================================================================
  // 3.2 EVENT HANDLING & WATCHERS
  // ============================================================================

  /**
   * Setup channel watcher for URL changes (event-based, no polling)
   * Ensures button and widget persist across guild/channel switches
   */
  setupChannelWatcher() {
    // Use event-based URL change detection (no polling)
    let lastUrl = window.location.href;

    // Watch for URL changes via popstate and pushState/replaceState
    const handleUrlChange = () => {
      // Guard clause: Return early if plugin is stopped
      if (this._isStopped) return;

      const currentUrl = window.location.href;
      // Guard clause: Only process if URL changed
      if (currentUrl === lastUrl) return;

      lastUrl = currentUrl;
      // Re-inject widget after channel/guild change (button still disabled)
      const timeoutId = setTimeout(() => {
        this._retryTimeouts.delete(timeoutId);
        // Widget re-injection on channel change
        this.injectShadowRankWidget();
      }, 200);
      this._retryTimeouts.add(timeoutId);
    };

    // Listen to browser navigation events
    window.addEventListener('popstate', handleUrlChange);

    // Override pushState and replaceState to detect programmatic navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(history, args);
      handleUrlChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args);
      handleUrlChange();
    };

    // Setup member list watcher for widget persistence
    this.setupMemberListWatcher();

    // Store cleanup functions
    this._urlChangeCleanup = () => {
      window.removeEventListener('popstate', handleUrlChange);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }

  /**
   * Setup MutationObserver to watch for member list changes
   * Re-injects widget when member list is re-rendered (channel/guild switch)
   */
  setupMemberListWatcher() {
    // RE-ENABLED: Watch for member list changes to maintain widget
    // Guard clause: Disconnect existing observer if any
    if (this.memberListObserver) {
      this.memberListObserver.disconnect();
    }

    // Create observer to watch for member list changes
    this.memberListObserver = new MutationObserver(() => {
      const widget = document.getElementById('shadow-army-widget');
      const membersList = document.querySelector('[class*="members"]');

      // Guard clause: If member list exists but widget doesn't, re-inject
      if (!membersList || widget) return;

      // Fast debounce re-injection (prevent multiple calls)
      if (this.widgetReinjectionTimeout) {
        clearTimeout(this.widgetReinjectionTimeout);
      }
      this.widgetReinjectionTimeout = setTimeout(() => {
        this.injectShadowRankWidget();
      }, 100);
    });

    // Start observing the entire document for member list changes
    this.memberListObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ============================================================================
  // 3.3 USER ID DETECTION
  // ============================================================================

  /**
   * Get Discord user ID for storage isolation
   * Operations:
   * 1. Try BetterDiscord Webpack UserStore (BdApi - PRIMARY METHOD)
   * 2. Try window.Discord (fallback)
   * 3. Try React fiber traversal (fallback)
   * 4. Fallback to 'default' if unavailable
   */
  async getUserId() {
    try {
      // Method 1: Try BetterDiscord Webpack UserStore (BdApi - PRIMARY)
      // Prefer getStore, fallback to getModule with search
      const UserStore =
        (BdApi.Webpack && BdApi.Webpack.getStore && BdApi.Webpack.getStore('UserStore')) ||
        (BdApi.Webpack &&
          BdApi.Webpack.getModule &&
          BdApi.Webpack.getModule((m) => m && typeof m.getCurrentUser === 'function'));

      if (UserStore && typeof UserStore.getCurrentUser === 'function') {
        try {
          const currentUser = UserStore.getCurrentUser();
          if (currentUser && currentUser.id) {
            // debugLog method is in SECTION 4
            this.debugLog('USER_ID', 'Got user ID from BdApi.Webpack.UserStore', {
              userId: currentUser.id,
            });
            return currentUser.id;
          }
        } catch (webpackError) {
          // debugError method is in SECTION 4
          this.debugError('USER_ID', 'Error calling UserStore.getCurrentUser()', webpackError);
        }
      }

      // Method 2: Try window.Discord (fallback if BdApi unavailable)
      if (window.Discord && window.Discord.user && window.Discord.user.id) {
        // debugLog method is in SECTION 4
        this.debugLog('USER_ID', 'Got user ID from window.Discord (fallback)', {
          userId: window.Discord.user.id,
        });
        return window.Discord.user.id;
      }

      // Method 3: Try React fiber traversal (fallback)
      try {
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
                // debugLog method is in SECTION 4
                this.debugLog('USER_ID', 'Got user ID from React fiber (fallback)', {
                  userId: fiber.memoizedProps.user.id,
                });
                return fiber.memoizedProps.user.id;
              }
              fiber = fiber.return;
            }
          }
        }
      } catch (fiberError) {
        // debugError method is in SECTION 4
        this.debugError('USER_ID', 'Error in React fiber traversal', fiberError);
      }
    } catch (error) {
      this.debugError('USER_ID', 'Failed to get user ID', error);
    }

    // Fallback to default
    // debugLog method is in SECTION 4
    this.debugLog('USER_ID', 'Using default user ID (fallback)', { reason: 'All methods failed' });
    return 'default';
  }

  // ============================================================================
  // 3.4 SETTINGS MANAGEMENT
  // ============================================================================

  /**
   * Load settings from localStorage with validation and defaults
   * Operations:
   * 1. Attempt to load saved settings using BdApi.Data
   * 2. Merge with default settings to ensure all keys exist
   * 3. Validate arrays (shadows)
   * 4. Backfill missing extraction config keys
   * 5. Initialize specialArise tracking if missing
   * 6. Sync debug mode with settings.debugMode
   * 7. Handle errors gracefully with fallback to defaults
   * Note: Legacy favoriteShadowIds may exist but are no longer used (generals auto-selected)
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
        // Initialize ariseAnimation settings if missing
        if (!this.settings.ariseAnimation) {
          this.settings.ariseAnimation = { ...this.defaultSettings.ariseAnimation };
        } else {
          // Backfill any missing ariseAnimation keys
          this.settings.ariseAnimation = {
            ...this.defaultSettings.ariseAnimation,
            ...this.settings.ariseAnimation,
          };
        }
      } else {
        // No saved settings, use defaults
        this.settings = { ...this.defaultSettings };
      }

      // Sync debug mode with settings (after loading)
      this.debug.enabled = this.settings.debugMode === true;
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('SETTINGS', 'Error loading settings', error);
      this.settings = { ...this.defaultSettings };
      // Ensure debug mode is synced even on error
      this.debug.enabled = this.settings.debugMode === true;
    }
  }

  /**
   * Save current settings to localStorage
   * Operations:
   * 1. Sync debug mode from this.debug.enabled to settings.debugMode
   * 2. Serialize settings object to JSON
   * 3. Save using BdApi.Data.save()
   * 4. Handle errors gracefully with debug logging (debugError method in SECTION 4)
   *
   * NOTE: For large shadow arrays (5,000+), this can cause UI blocking.
   * Consider implementing IndexedDB storage for better performance.
   */
  saveSettings() {
    try {
      // Sync debug mode from debug.enabled to settings
      if (this.settings.debugMode !== this.debug.enabled) {
        this.settings.debugMode = this.debug.enabled;
      }

      // Use user-specific storage key
      const storageKey = this.userId ? `settings_${this.userId}` : 'settings';
      BdApi.Data.save('ShadowArmy', storageKey, this.settings);
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('SETTINGS', 'Error saving settings', error);
    }
  }

  // ============================================================================
  // 3.5 SOLO LEVELING INTEGRATION
  // ============================================================================

  /**
   * Integrate with SoloLevelingStats plugin to access user stats
   * Operations:
   * 1. Get SoloLevelingStats plugin instance via BdApi.Plugins
   * 2. Store reference for later use
   * 3. Log warning if plugin not found
   */
  integrateWithSoloLeveling() {
    try {
      // Get SoloLevelingStats plugin via BdApi
      this.soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!this.soloPlugin) {
        // debugLog method is in SECTION 4
        this.debugLog('INTEGRATION', 'SoloLevelingStats plugin not found');
      }
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError(
        'INTEGRATION',
        'Failed to integrate with SoloLevelingStats via BdApi.Plugins',
        error
      );
      this.soloPlugin = null;
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
    // Guard clause: Re-integrate if plugin not loaded
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
  // 3.6 SHADOW EXTRACTION OPERATIONS
  // ============================================================================

  /**
   * Message listener setup for message-based shadow extraction
   * Operations:
   * 1. Hook into SoloLevelingStats plugin's message processing
   * 2. Intercept processMessageSent to attempt extraction
   * 3. Store original function for cleanup
   * 4. Attempt extraction on each message (with rate limiting)
   */
  setupMessageListener() {
    // Guard clause: Require SoloLevelingStats plugin
    if (!this.soloPlugin) {
      this.integrateWithSoloLeveling();
    }
    if (!this.soloPlugin) {
      this.debugLog(
        'MESSAGE_LISTENER',
        'SoloLevelingStats not available, message extraction disabled'
      );
      return;
    }

    const instance = this.soloPlugin.instance || this.soloPlugin;
    if (!instance || !instance.processMessageSent) {
      this.debugLog(
        'MESSAGE_LISTENER',
        'processMessageSent not found, message extraction disabled'
      );
      return;
    }

    // Store original function for cleanup
    this.originalProcessMessage = instance.processMessageSent;

    // Wrap processMessageSent to add extraction logic
    // NOTE: processMessageSent is SYNCHRONOUS in SoloLevelingStats, not async
    const self = this;
    instance.processMessageSent = function (messageText) {
      // Call original function first (synchronous)
      const result = self.originalProcessMessage.call(this, messageText);

      // Attempt extraction after message is processed
      // Use setTimeout to avoid blocking message processing
      // Fire and forget - don't wait for result
      self.debugLog('MESSAGE_LISTENER', 'Message received, attempting extraction', {
        messageLength: messageText?.length || 0,
        messagePreview: messageText?.substring(0, 30) || 'N/A',
      });
      setTimeout(() => {
        self
          .attemptShadowExtraction()
          .then((shadow) => {
            if (shadow) {
              // Get identifier for logging (accept both id and i for compressed shadows)
              const shadowId = shadow.id || shadow.i;
              self.debugLog('MESSAGE_EXTRACTION', 'SUCCESS: Shadow extracted from message', {
                rank: shadow.rank,
                role: shadow.role,
                id: shadowId,
              });
            } else {
              self.debugLog('MESSAGE_EXTRACTION', 'No shadow extracted (returned null)');
            }
          })
          .catch((error) => {
            self.debugError('MESSAGE_EXTRACTION', 'Error during message extraction', error);
          });
      }, 100); // Small delay to ensure message is fully processed

      return result;
    };

    this.debugLog('MESSAGE_LISTENER', 'Message listener setup complete', {
      hasOriginalFunction: !!this.originalProcessMessage,
      hasInstance: !!instance,
      hasProcessMessageSent: !!instance.processMessageSent,
    });
  }

  /**
   * Remove message listener and restore original function
   * Operations:
   * 1. Unsubscribe from messageSent events if subscribed
   * 2. Restore original processMessageSent method
   * 3. Clean up references to prevent memory leaks
   */
  removeMessageListener() {
    // Guard clause: Unsubscribe if exists
    if (this.messageUnsubscribe) {
      this.messageUnsubscribe();
    }
    // Guard clause: Restore original function if exists
    if (this.soloPlugin && this.originalProcessMessage) {
      const instance = this.soloPlugin.instance || this.soloPlugin;
      if (instance && instance.processMessageSent) {
        instance.processMessageSent = this.originalProcessMessage;
      }
    }
  }

  /**
   * Message-based extraction (humanoid shadows only, no magic beasts)
   * Operations:
   * 1. Get user stats from SoloLevelingStats
   * 2. Check rate limiting (max extractions per minute)
   * 3. Calculate extraction chance based on stats
   * 4. Attempt extraction with retries (up to 3 attempts)
   * 5. Only extracts humanoid shadows (no magic beasts from messages)
   * @returns {Object|null} - Extracted shadow or null if failed
   */
  async attemptShadowExtraction() {
    // Guard clause: Require SoloLevelingStats plugin
    const soloData = this.getSoloLevelingData();
    if (!soloData) {
      return null; // No stats available
    }

    const { rank, level, stats } = soloData;
    const intelligence = stats.intelligence || 0;
    const perception = stats.perception || 0;
    const strength = stats.strength || 0;

    // Rate limiting: Check max extractions per minute
    const now = Date.now();
    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;
    const maxPerMinute = cfg.maxExtractionsPerMinute || 3;

    // Initialize extraction timestamps if needed
    if (!this._extractionTimestamps) {
      this._extractionTimestamps = [];
    }

    // Remove timestamps older than 1 minute
    this._extractionTimestamps = this._extractionTimestamps.filter(
      (timestamp) => now - timestamp < 60000
    );

    // Guard clause: Rate limit check
    if (this._extractionTimestamps.length >= maxPerMinute) {
      return null;
    }

    // Calculate extraction chance based on stats
    const extractionChance = this.calculateExtractionChance(
      intelligence,
      perception,
      strength,
      rank
    );

    // Guard clause: Random roll for extraction
    const roll = Math.random();
    if (roll > extractionChance) {
      this.debugLog('MESSAGE_EXTRACTION', 'Extraction roll failed', {
        extractionChance: (extractionChance * 100).toFixed(2) + '%',
        roll: (roll * 100).toFixed(2) + '%',
        intelligence,
        perception,
        strength,
        rank,
      });
      return null; // Failed extraction roll
    }

    this.debugLog('MESSAGE_EXTRACTION', 'Extraction roll succeeded, proceeding to extraction', {
      extractionChance: (extractionChance * 100).toFixed(2) + '%',
      roll: (roll * 100).toFixed(2) + '%',
      intelligence,
      perception,
      strength,
      rank,
    });

    // Record extraction attempt timestamp
    this._extractionTimestamps.push(now);

    // Determine target rank (can extract same rank or 1 rank above)
    const rankIndex = this.shadowRanks.indexOf(rank);
    const availableRanks = this.shadowRanks.slice(
      0,
      Math.min(rankIndex + 2, this.shadowRanks.length)
    );
    const targetRank = availableRanks[Math.floor(Math.random() * availableRanks.length)];

    // Attempt extraction (humanoid only, respects 30% cap, max 3 attempts)
    const extractedShadow = await this.attemptExtractionWithRetries(
      rank,
      level,
      stats,
      targetRank,
      null, // targetStats - will generate
      null, // targetStrength - will calculate
      false, // skipCap = false (respects 30% max cap for messages)
      false, // fromDungeon = false (humanoid shadows only, no magic beasts)
      null, // beastFamilies - not applicable for messages
      3 // maxAttempts = 3 for messages
    );

    if (extractedShadow) {
      // Shadow extracted successfully
      this.debugLog('MESSAGE_EXTRACTION', 'Shadow extracted from message', {
        rank: extractedShadow.rank,
        role: extractedShadow.role,
        strength: extractedShadow.strength,
        id: extractedShadow.id,
      });
    }

    return extractedShadow;
  }

  /**
   * Attempt extraction with retry logic (configurable attempts)
   * Generates shadow first, then tries to extract it
   * Only saves to database if successful
   * Operations:
   * 1. Generate shadow with target rank and stats
   * 2. Calculate extraction chance based on shadow stats vs user stats
   * 3. Try extraction up to maxAttempts times (1 for mobs, 3 for bosses/messages)
   * 4. If successful, save shadow to database
   * 5. If fails all attempts, discard shadow
   * @param {string} userRank - User's current rank
   * @param {number} userLevel - User's current level
   * @param {Object} userStats - User's stats
   * @param {string} targetRank - Target shadow rank
   * @param {Object} targetStats - Target shadow stats (optional, will generate if not provided)
   * @param {number} targetStrength - Target shadow strength (optional)
   * @param {boolean} skipCap - Skip extraction cap (for dungeons)
   * @param {boolean} fromDungeon - Is this from a dungeon (for magic beast extraction)
   * @param {Array} beastFamilies - Allowed beast families (biome-specific)
   * @param {number} maxAttempts - Maximum extraction attempts (default: 3)
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
    beastFamilies = null,
    maxAttempts = 3
  ) {
    // Stats extracted but not used in current extraction logic (reserved for future use)

    const _intelligence = userStats.intelligence || 0;

    const _perception = userStats.perception || 0;

    const _strength = userStats.strength || 0;

    // RANK VALIDATION: Ensure target rank is not too high
    const userRankIndex = this.shadowRanks.indexOf(userRank);
    const targetRankIndex = this.shadowRanks.indexOf(targetRank);
    const rankDiff = targetRankIndex - userRankIndex;

    // Guard clause: STRICT ENFORCEMENT - Cannot extract more than 1 rank above
    if (rankDiff > 1) {
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
          (key) => this.shadowRoles[key].isMagicBeast
        );

        // Filter by biome families if provided
        if (beastFamilies && beastFamilies.length > 0) {
          availableBeastRoles = availableBeastRoles.filter((key) => {
            const beast = this.shadowRoles[key];
            return beastFamilies.includes(beast.family);
          });
        }

        // Filter by rank restrictions (e.g., dragons only NH+)
        const rankIndex = this.shadowRanks.indexOf(targetRank);
        availableBeastRoles = availableBeastRoles.filter((key) => {
          const beast = this.shadowRoles[key];
          if (!beast.minRank) return true; // No restriction
          const minRankIndex = this.shadowRanks.indexOf(beast.minRank);
          return rankIndex >= minRankIndex; // Only if dungeon rank meets minimum
        });

        // Fallback: If no beasts available after filtering, use all non-restricted beasts
        if (availableBeastRoles.length === 0) {
          availableBeastRoles = Object.keys(this.shadowRoles).filter(
            (key) => this.shadowRoles[key].isMagicBeast && !this.shadowRoles[key].minRank
          );
        }

        roleKey = availableBeastRoles[Math.floor(Math.random() * availableBeastRoles.length)];
      } else {
        // Select humanoid role (message-based extraction only)
        const humanoidRoles = Object.keys(this.shadowRoles).filter(
          (key) => !this.shadowRoles[key].isMagicBeast
        );
        roleKey = humanoidRoles[Math.floor(Math.random() * humanoidRoles.length)];
      }
      const role = this.shadowRoles[roleKey];

      // Calculate strength from stats if not provided
      const calculatedStrength =
        targetStrength || (targetStats ? this.calculateShadowStrength(targetStats, 1) : 0);

      shadow = {
        id: `shadow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        rank: targetRank,
        role: roleKey,
        roleName: role.name,
        strength: calculatedStrength,
        extractedAt: Date.now(),
        level: 1,
        xp: 0,
        baseStats: targetStats,
        growthStats: {
          strength: 0,
          agility: 0,
          intelligence: 0,
          vitality: 0,
          perception: 0,
        },
        naturalGrowthStats: {
          strength: 0,
          agility: 0,
          intelligence: 0,
          vitality: 0,
          perception: 0,
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

    // Guard clause: Ensure shadow was generated
    if (!shadow) {
      this.debugError('EXTRACTION_RETRIES', 'Shadow generation failed - shadow is null/undefined', {
        targetRank,
        userLevel,
        hasUserStats: !!userStats,
      });
      return null;
    }

    // Extract stats from userStats for extraction chance calculation
    const intelligence = userStats?.intelligence || 0;
    const perception = userStats?.perception || 0;
    const strength = userStats?.strength || 0;

    // Try extraction up to maxAttempts times (1 for mobs, 3 for bosses/messages)
    // Use Array.from for functional pattern
    const attempts = Array.from({ length: maxAttempts }, (_, i) => i + 1);

    for (const attemptNum of attempts) {
      this.debugLog(
        'EXTRACTION_RETRIES',
        `Attempt ${attemptNum}/${maxAttempts} - Starting extraction`,
        {
          attemptNum,
          maxAttempts,
          targetRank,
          targetStrength,
          userRank,
          skipCap,
          intelligence,
          perception,
          strength,
        }
      );

      // Calculate extraction chance based on stats
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

      this.debugLog('EXTRACTION_RETRIES', `Attempt ${attemptNum} - Extraction roll`, {
        attemptNum,
        extractionChance: (extractionChance * 100).toFixed(2) + '%',
        roll: (roll * 100).toFixed(2) + '%',
        success: roll < extractionChance,
      });

      // Guard clause: Early return on failure
      if (roll >= extractionChance) {
        this.debugLog(
          'EXTRACTION_RETRIES',
          `Attempt ${attemptNum} - Roll failed, trying next attempt`,
          {
            attemptNum,
          }
        );
        continue; // Failed extraction roll, try next attempt
      }

      // Extraction succeeded
      {
        this.debugLog(
          'EXTRACTION_RETRIES',
          `Attempt ${attemptNum} - Roll succeeded, attempting to save shadow`,
          {
            attemptNum,
            shadowExists: !!shadow,
            shadowId: shadow?.id || shadow?.i,
            shadowRank: shadow?.rank,
            shadowRole: shadow?.role,
          }
        );

        // Guard clause: Ensure shadow exists
        if (!shadow) {
          this.debugError(
            'EXTRACTION_RETRIES',
            `Attempt ${attemptNum} - Shadow is null/undefined`,
            {
              attemptNum,
            }
          );
          continue; // Try next attempt
        }

        // Success! Save shadow to database
        // Get identifier for logging (accept both id and i for compressed shadows)
        const shadowId = shadow.id || shadow.i;

        if (this.storageManager) {
          try {
            // Ensure shadow has strength calculated before saving
            if (!shadow.strength || shadow.strength === 0) {
              const decompressed = this.getShadowData(shadow);
              const effective = this.getShadowEffectiveStats(decompressed);
              if (effective) {
                shadow.strength = this.calculateShadowStrength(effective, 1);
                this.debugLog('EXTRACTION', 'Calculated missing strength before save', {
                  shadowId,
                  calculatedStrength: shadow.strength,
                });
              }
            }

            const shadowToSave = this.prepareShadowForSave(shadow);
            await this.storageManager.saveShadow(shadowToSave);
            this.debugLog('EXTRACTION', 'Shadow saved to IndexedDB', {
              shadowId,
              rank: shadow.rank,
              role: shadow.role,
              strength: shadow.strength,
              shadowToSaveStrength: shadowToSave.strength,
            });

            // Verify it was saved by checking count
            const newCount = await this.storageManager.getTotalCount();

            this.debugLog('EXTRACTION', 'Shadow saved successfully', {
              totalCount: newCount,
              shadowId: shadow.id || shadow.i,
              shadowRank: shadow.rank,
              shadowRole: shadow.role,
            });

            // Show success toast notification using BdApi
            if (BdApi && BdApi.showToast) {
              BdApi.showToast(
                `Shadow Extracted: ${shadow.rank}-Rank ${shadow.roleName || shadow.role}`,
                {
                  type: 'success',
                  timeout: 3000,
                }
              );
            }

            // Shadow extraction completed - logged above in EXTRACTION_RETRIES completion log

            // Emit shadowExtracted event for Dungeons plugin verification
            try {
              // eslint-disable-next-line no-undef
              const event = new CustomEvent('shadowExtracted', {
                detail: {
                  shadow,
                  timestamp: Date.now(),
                  source: 'message',
                },
              });
              document.dispatchEvent(event);
            } catch (error) {
              this.debugError('EXTRACTION_RETRIES', 'Failed to emit shadowExtracted event', error);
            }

            // Show extraction animation
            this.showExtractionAnimation(shadow);

            // Update counters
            const now = Date.now();
            this.settings.totalShadowsExtracted++;
            this.settings.lastExtractionTime = now;

            // Grant XP
            await this.grantShadowXP(2, 'extraction');

            this.saveSettings();

            // Force recalculation of aggregated power after shadow extraction
            // This ensures the progress bar shows updated total power immediately
            if (
              this.storageManager &&
              typeof this.storageManager.getAggregatedPower === 'function'
            ) {
              try {
                const soloData = this.getSoloLevelingData();
                const userRank = soloData?.rank || 'E';
                this.debugLog(
                  'TOTAL_POWER_UPDATE',
                  'Forcing aggregated power recalculation after shadow extraction',
                  {
                    userRank,
                    shadowRanks: this.shadowRanks,
                  }
                );
                // Force recalculation by passing true as third parameter
                const result = await this.storageManager.getAggregatedPower(
                  userRank,
                  this.shadowRanks,
                  true
                );
                this.debugLog('TOTAL_POWER_UPDATE', 'Aggregated power recalculation completed', {
                  totalPower: result?.totalPower || 0,
                  totalCount: result?.totalCount || 0,
                });
              } catch (error) {
                this.debugError(
                  'TOTAL_POWER_UPDATE',
                  'Failed to recalculate aggregated power',
                  error
                );
              }
            }

            // Invalidate army stats cache so progress bar updates with new shadow power
            const hadCache = !!this._armyStatsCache;
            const cachedPower = this._armyStatsCache?.totalPower || 0;
            this._armyStatsCache = null;
            this._armyStatsCacheTime = null;
            this.debugLog(
              'TOTAL_POWER_UPDATE',
              'Invalidated army stats cache after shadow extraction',
              {
                hadCache,
                previousCachedPower: cachedPower,
              }
            );

            this.debugLog(
              'EXTRACTION_RETRIES',
              `Attempt ${attemptNum} - Shadow extraction completed successfully`,
              {
                attemptNum,
                shadowId: shadow.id || shadow.i,
                shadowRank: shadow.rank,
                shadowRole: shadow.role,
                shadowStrength: shadow.strength,
                totalPowerRecalculated: true,
                cacheInvalidated: true,
              }
            );

            this.updateUI();
            return shadow; // SUCCESS - return immediately
          } catch (error) {
            // debugError method is in SECTION 4
            this.debugError(
              'EXTRACTION_RETRIES',
              `Attempt ${attemptNum} - Failed to save shadow to IndexedDB`,
              error
            );
            // Fallback to localStorage
            if (!this.settings.shadows) this.settings.shadows = [];
            this.settings.shadows.push(shadow);
            this.saveSettings();

            // Still return shadow even if IndexedDB failed (localStorage fallback worked)
            const now = Date.now();
            this.settings.totalShadowsExtracted++;
            this.settings.lastExtractionTime = now;
            await this.grantShadowXP(2, 'extraction');

            // Invalidate army stats cache to force recalculation
            this._armyStatsCache = null;
            this._armyStatsCacheTime = null;

            this.updateUI();

            this.debugLog(
              'EXTRACTION_RETRIES',
              `Attempt ${attemptNum} - Fallback to localStorage succeeded`,
              {
                attemptNum,
                shadowId: shadow.id || shadow.i,
                shadowRank: shadow.rank,
              }
            );
            return shadow;
          }
        } else {
          // Fallback to localStorage
          this.debugLog(
            'EXTRACTION_RETRIES',
            `Attempt ${attemptNum} - No storageManager, using localStorage fallback`,
            {
              attemptNum,
              shadowId: shadow.id || shadow.i,
            }
          );
          if (!this.settings.shadows) this.settings.shadows = [];
          this.settings.shadows.push(shadow);
          this.saveSettings();

          const now = Date.now();
          this.settings.totalShadowsExtracted++;
          this.settings.lastExtractionTime = now;
          await this.grantShadowXP(2, 'extraction');
          this.updateUI();

          this.debugLog(
            'EXTRACTION_RETRIES',
            `Attempt ${attemptNum} - localStorage fallback succeeded`,
            {
              attemptNum,
              shadowId: shadow.id || shadow.i,
              shadowRank: shadow.rank,
            }
          );
          return shadow;
        }
      }
    }

    // All attempts failed
    return null;
  }

  /**
   * Attempt shadow extraction from dungeon mob or boss
   * Bosses: 3 extraction retries per corpse (more attempts for important targets)
   * Mobs: 1 extraction attempt only (fast extraction, prevents queue buildup)
   * Operations:
   * 1. Check boss attempt limit if boss (lore: max 3 attempts per corpse per day)
   * 2. Generate shadow with mob stats and rank
   * 3. Try extraction with appropriate retry count (1 for mobs, 3 for bosses)
   * 4. Record attempt if boss (success or failure counts toward daily limit)
   * 5. Return result with attempts remaining
   *
   * @param {string} bossId - Unique boss identifier (e.g., "dungeon_ice_cavern_boss_frost_dragon" or "dungeon_mob_12345")
   * @param {string} userRank - User's current rank
   * @param {number} userLevel - User's current level
   * @param {Object} userStats - User's stats
   * @param {string} mobRank - Mob's rank
   * @param {Object} mobStats - Mob's stats
   * @param {number} mobStrength - Mob's strength
   * @param {Array} beastFamilies - Allowed beast families (biome-specific)
   * @param {boolean} isBoss - Is this a boss (true) or regular mob (false)? Default: true for backwards compatibility
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
    beastFamilies = null,
    isBoss = true
  ) {
    // Guard clause: Check boss attempt limit ONLY if this is a boss (not regular mobs)
    if (isBoss) {
      const canExtract = this.canExtractFromBoss(bossId);
      if (!canExtract.allowed) {
        return {
          success: false,
          shadow: null,
          error: canExtract.reason,
          attemptsRemaining: canExtract.attemptsRemaining,
        };
      }
    }

    // Determine retry count: Bosses get 3 attempts, regular mobs get 1 attempt
    // This prevents queue buildup and improves performance for mass mob extraction
    // Use lookup map instead of ternary for clarity
    const attemptMap = { boss: 3, mob: 1 };
    const maxAttempts = attemptMap[isBoss ? 'boss' : 'mob'];

    // Attempt extraction with appropriate retry count
    const extractedShadow = await this.attemptExtractionWithRetries(
      userRank,
      userLevel,
      userStats,
      mobRank,
      mobStats,
      mobStrength,
      true, // skipCap = true for dungeons
      true, // fromDungeon = true (enables magic beast extraction)
      beastFamilies, // Pass biome families for themed extraction
      maxAttempts // 1 for mobs, 3 for bosses
    );

    // Record boss attempt ONLY if this is a boss (counts toward daily limit)
    if (isBoss) {
      this.recordBossExtractionAttempt(bossId, extractedShadow !== null);
    }

    return {
      success: extractedShadow !== null,
      shadow: extractedShadow,
      error: extractedShadow ? null : 'Extraction failed',
      attemptsRemaining: isBoss ? this.getBossAttemptsRemaining(bossId) : 0, // Only bosses have attempt tracking
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
    // Guard clause: Initialize if missing
    if (!this.settings.dungeonExtractionAttempts) {
      this.settings.dungeonExtractionAttempts = {};
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;
    const maxAttempts = cfg.maxBossAttemptsPerDay || 3;
    const today = new Date().toDateString();
    const attempts = this.settings.dungeonExtractionAttempts[bossId];

    // Guard clause: No previous attempts or from different day
    if (!attempts || attempts.lastReset !== today) {
      return {
        allowed: true,
        reason: null,
        attemptsRemaining: maxAttempts,
      };
    }

    // Guard clause: Check attempt count
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
    // Guard clause: Initialize if missing
    if (!this.settings.dungeonExtractionAttempts) {
      this.settings.dungeonExtractionAttempts = {};
    }

    const today = new Date().toDateString();
    const attempts = this.settings.dungeonExtractionAttempts[bossId];

    // Use dictionary pattern for update vs add operations
    const attemptHandlers = {
      update: () => {
        attempts.count++;
        attempts.lastAttempt = Date.now();
        attempts.lastSuccess = success;
      },
      add: () => {
        this.settings.dungeonExtractionAttempts[bossId] = {
          count: 1,
          lastAttempt: Date.now(),
          lastReset: today,
          lastSuccess: success,
        };
      },
    };

    const handler =
      attempts && attempts.lastReset === today ? attemptHandlers.update : attemptHandlers.add;
    handler();

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
    // Guard clause: Return default if tracking not initialized
    if (!this.settings.dungeonExtractionAttempts) {
      return this.settings.extractionConfig?.maxBossAttemptsPerDay || 3;
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;
    const maxAttempts = cfg.maxBossAttemptsPerDay || 3;
    const today = new Date().toDateString();
    const attempts = this.settings.dungeonExtractionAttempts[bossId];

    // Guard clause: No attempts or different day
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

    // Use Object.keys with filter for functional pattern
    Object.keys(attempts)
      .filter((bossId) => attempts[bossId].lastAttempt < sevenDaysAgo)
      .forEach((bossId) => delete attempts[bossId]);
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
  async handleExtractionBurst(
    userRank,
    userLevel,
    userStats,
    isSpecial,
    targetRank = null,
    fromDungeon = false
  ) {
    const now = Date.now();
    const _cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

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
        // debugLog method is in SECTION 4
        this.debugLog('EXTRACTION', 'Extraction target adjusted', {
          original: targetRank,
          adjusted: rankToUse,
          userRank,
        });
      }
    }

    // Generate shadows using Array.from for functional pattern
    const extractedShadows = await Promise.all(
      Array.from({ length: count }, async () => {
        const shadow = this.generateShadow(rankToUse, userLevel, userStats, fromDungeon);

        // Save to IndexedDB if available, otherwise fallback to localStorage
        if (this.storageManager) {
          try {
            await this.storageManager.saveShadow(this.prepareShadowForSave(shadow));
          } catch (error) {
            // debugError method is in SECTION 4
            this.debugError('STORAGE', 'Failed to save shadow to IndexedDB', error);
            // Fallback to localStorage
            if (!this.settings.shadows) this.settings.shadows = [];
            this.settings.shadows.push(shadow);
          }
        } else {
          // Fallback to localStorage
          if (!this.settings.shadows) this.settings.shadows = [];
          this.settings.shadows.push(shadow);
        }

        this.settings.totalShadowsExtracted++;
        this.settings.lastExtractionTime = now;
        if (!this.extractionTimestamps) this.extractionTimestamps = [];
        this.extractionTimestamps.push(now);

        // Invalidate buff cache when new shadows are added
        this.cachedBuffs = null;
        this.cachedBuffsTime = null;

        // debugLog method is in SECTION 4
        this.debugLog('EXTRACTION', 'Shadow extracted', { rank: shadow.rank, role: shadow.role });

        return shadow;
      })
    );

    // New shadows start with 0 shadow XP; give them a small burst so they can level over time
    if (isSpecial) {
      await this.grantShadowXP(10, 'special_arise');
    } else {
      await this.grantShadowXP(2, 'extraction');
    }

    this.saveSettings();

    // Show extraction animation for the last shadow
    // Guard clause: Only show if shadows were extracted
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
    // Guard clause: Initialize if missing
    if (!this.settings.specialArise) {
      this.settings.specialArise = { ...this.defaultSettings.specialArise };
    }
    // Guard clause: Reset counter if new day
    if (this.settings.specialArise.lastDate !== today) {
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
    // Guard clause: Initialize if missing
    if (!this.settings.specialArise) {
      this.settings.specialArise = { ...this.defaultSettings.specialArise };
    }
    // Guard clause: Reset counter if new day
    if (this.settings.specialArise.lastDate !== today) {
      this.settings.specialArise.lastDate = today;
      this.settings.specialArise.countToday = 0;
    }
    this.settings.specialArise.countToday += 1;
    this.saveSettings();
  }

  // ============================================================================
  // 3.7 SHADOW GENERATION & STATS - Creation & Calculation
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
    // Use dictionary pattern for role selection
    const roleSelectors = {
      dungeon: () => {
        // Select magic beast role (dungeon-only, 100% magic beast)
        let availableBeastRoles = Object.keys(this.shadowRoles).filter(
          (key) => this.shadowRoles[key].isMagicBeast
        );

        // Filter by biome families if provided
        if (beastFamilies && beastFamilies.length > 0) {
          availableBeastRoles = availableBeastRoles.filter((key) => {
            const beast = this.shadowRoles[key];
            return beastFamilies.includes(beast.family);
          });
        }

        // Filter by rank restrictions (e.g., dragons only NH+)
        const rankIndex = this.shadowRanks.indexOf(shadowRank);
        availableBeastRoles = availableBeastRoles.filter((key) => {
          const beast = this.shadowRoles[key];
          if (!beast.minRank) return true; // No restriction
          const minRankIndex = this.shadowRanks.indexOf(beast.minRank);
          return rankIndex >= minRankIndex; // Only if dungeon rank meets minimum
        });

        // Guard clause: Fallback if no beasts available after filtering
        if (availableBeastRoles.length === 0) {
          availableBeastRoles = Object.keys(this.shadowRoles).filter(
            (key) => this.shadowRoles[key].isMagicBeast && !this.shadowRoles[key].minRank
          );
        }

        return availableBeastRoles[Math.floor(Math.random() * availableBeastRoles.length)];
      },
      message: () => {
        // Select humanoid role (message-based extraction only)
        const humanoidRoles = Object.keys(this.shadowRoles).filter(
          (key) => !this.shadowRoles[key].isMagicBeast
        );
        return humanoidRoles[Math.floor(Math.random() * humanoidRoles.length)];
      },
    };

    const roleKey = roleSelectors[fromDungeon ? 'dungeon' : 'message']();
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
        perception: 0,
      },
      naturalGrowthStats: {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        perception: 0,
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

    // Use Array.from with find for functional pattern
    let cumulative = 0;
    const selectedRank = this.shadowRanks.find((_, i) => {
      cumulative += rankProbabilities[i];
      return roll < cumulative;
    });

    // Guard clause: Fallback to user's rank if no match
    return selectedRank || this.shadowRanks[Math.min(userRankIndex, this.shadowRanks.length - 1)];
  }

  /**
   * Calculate probability distribution for shadow ranks based on user rank
   * STRICT RULE: Cannot extract shadows ABOVE your rank (Solo Leveling lore)
   *
   * Restrictions:
   * - Your rank: Most common (40-50%)
   * - 1 rank above: Rare (5-10%) - requires high stats/perception
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

    // Guard clause: Return zeros if invalid rank index
    if (userRankIndex < 0) return probabilities;

    // STRICT ENFORCEMENT: Cannot extract more than 1 rank above user
    const maxExtractableIndex = Math.min(userRankIndex + 1, this.shadowRanks.length - 1);

    // Distribution centered on user rank:
    // - 1 rank above: 5% (rare, requires perception)
    // - Your rank: 50% (most common)
    // - 1 rank below: 25%
    // - 2 ranks below: 15%
    // - 3 ranks below: 5%
    // - 4+ ranks below: 0% (too weak to extract)

    // Use lookup map for probability distribution
    const probabilityMap = {
      above: {
        index: maxExtractableIndex,
        value: 0.05,
        condition: () =>
          maxExtractableIndex > userRankIndex && maxExtractableIndex < this.shadowRanks.length,
      },
      current: { index: userRankIndex, value: 0.5, condition: () => true },
      below1: { index: userRankIndex - 1, value: 0.25, condition: () => userRankIndex - 1 >= 0 },
      below2: { index: userRankIndex - 2, value: 0.15, condition: () => userRankIndex - 2 >= 0 },
      below3: { index: userRankIndex - 3, value: 0.05, condition: () => userRankIndex - 3 >= 0 },
    };

    // Apply probabilities using dictionary pattern
    Object.values(probabilityMap).forEach(({ index, value, condition }) => {
      if (condition()) {
        probabilities[index] = value;
      }
    });

    // Normalize probabilities to ensure they sum to 1.0
    const sum = probabilities.reduce((a, b) => a + b, 0);
    // Guard clause: Only normalize if sum > 0
    if (sum <= 0) return probabilities;

    // Use map for functional pattern
    return probabilities.map((prob) => prob / sum);
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

    // Guard clause: Return empty array if invalid rank
    if (userRankIndex < 0) return [];

    // Lore constraint: Can extract up to 2 ranks above user rank
    const maxExtractableIndex = Math.min(userRankIndex + 2, this.shadowRanks.length - 1);

    // Guard clause: Return empty array if no extractable ranks
    if (maxExtractableIndex < 0) return [];

    // Stats influence
    const intelligence = userStats?.intelligence || 0;
    const statsBoost = 1.0 + intelligence * 0.01; // +1% per INT point

    // Use Array.from with map for functional pattern
    const extractableRanks = Array.from({ length: maxExtractableIndex + 1 }, (_, i) => {
      const rank = this.shadowRanks[i];
      const multiplier = (this.rankProbabilityMultipliers[rank] || 1.0) * statsBoost;
      return { rank, multiplier };
    });

    // Normalize probabilities using map
    const totalMultiplier = extractableRanks.reduce((sum, r) => sum + r.multiplier, 0);

    // Guard clause: Return empty array if total multiplier is zero
    if (totalMultiplier <= 0) return [];

    return extractableRanks.map((r) => ({
      ...r,
      probability: r.multiplier / totalMultiplier,
    }));
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

    // Guard clause: STRICT RANK ENFORCEMENT - Cannot extract shadows more than 1 rank above you
    // B-rank hunter: Can extract up to A-rank (1 above), CANNOT extract S-rank (2 above)
    const rankDiff = targetRankIndex - userRankIndex;
    if (rankDiff > 1) {
      // debugLog method is in SECTION 4
      this.debugLog(
        'EXTRACTION_RANK_CHECK',
        `Cannot extract [${targetRank}] shadow - too high! (User rank: ${userRank}, Max: ${
          this.shadowRanks[Math.min(userRankIndex + 1, this.shadowRanks.length - 1)]
        })`
      );
      return 0; // Target too strong - impossible extraction
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    // Base chance from Intelligence
    const baseChance = Math.max(
      cfg.minBaseChance || 0.01,
      intelligence * (cfg.chancePerInt || 0.01)
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
    // Use dictionary pattern for resistance calculation
    const userStrength = this.calculateUserStrength(userStats);
    const resistanceCalculators = {
      strengthBased: () => {
        const strengthRatio = Math.min(1.0, targetStrength / Math.max(1, userStrength));
        return Math.min(0.9, strengthRatio * 0.7); // Max 70% resistance from strength difference
      },
      rankBased: () => {
        return Math.min(0.9, (targetRankIndex + 1) / ((userRankIndex + 1) * 2));
      },
    };

    const targetResistance =
      targetStrength > 0
        ? resistanceCalculators.strengthBased()
        : resistanceCalculators.rankBased();

    // Calculate raw chance
    const rawChance =
      baseChance * statsMultiplier * rankMultiplier * rankPenalty * (1 - targetResistance);

    // Apply hard cap to prevent 100% extraction on every message (skip for dungeons)
    // Use lookup map for cap values
    const capMap = {
      capped: () => {
        const maxChance = cfg.maxExtractionChance || 0.15; // Default 15% cap
        return Math.max(0, Math.min(maxChance, rawChance));
      },
      uncapped: () => Math.max(0, Math.min(1, rawChance)), // For dungeons: no cap, but ensure 0-1
    };

    return capMap[skipCap ? 'uncapped' : 'capped']();
  }

  /**
   * Select rank by weighted probability
   * Operations:
   * 1. Generate random roll (0-1)
   * 2. Use cumulative probability to select rank
   * 3. Return selected rank
   */
  selectRankByProbability(rankChances) {
    // Guard clause: Return null if invalid input
    if (!rankChances || rankChances.length === 0) return null;

    const roll = Math.random();
    let cumulative = 0;

    // Use find for functional pattern (early return on match)
    const selected = rankChances.find((rankChance) => {
      cumulative += rankChance.probability || rankChance.chance || 0;
      return roll < cumulative;
    });

    // Guard clause: Fallback to first rank if no match found
    return selected?.rank || rankChances[0]?.rank || null;
  }

  /**
   * Calculate user strength from stats (for resistance calculation)
   */
  calculateUserStrength(userStats) {
    // Guard clause: Return 0 if no stats provided
    if (!userStats) return 0;

    // Use Object.values with reduce for functional pattern
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    return statKeys.reduce((sum, key) => sum + (userStats[key] || 0), 0);
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
    // Guard clause: Return 0 if invalid rank
    if (!targetRank || targetRankIndex < 0) return 0;

    // Get rank baseline stats (similar to shadow generation)
    const rankBaselines = this.getRankBaselineStats(
      targetRank,
      this.rankStatMultipliers[targetRank] || 1.0
    );

    // Guard clause: Return 0 if no baselines
    if (!rankBaselines) return 0;

    // Calculate estimated total stats for this rank
    // Use reduce for functional pattern
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const estimatedStats = statKeys.reduce((stats, key) => {
      stats[key] = rankBaselines[key] || 10;
      return stats;
    }, {});

    // Calculate strength value (similar to shadow strength calculation)
    return this.calculateShadowStrength(estimatedStats, 1);
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
    // Guard clause: Return default baselines if invalid rank
    if (!shadowRank) {
      const defaultBaseline = 10;
      const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
      return statKeys.reduce((stats, key) => {
        stats[key] = defaultBaseline;
        return stats;
      }, {});
    }

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

    // Use reduce for functional pattern to build stats object
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    return statKeys.reduce((stats, key) => {
      stats[key] = baselineValue;
      return stats;
    }, {});
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
    // Guard clause: Return default stats if invalid inputs
    if (!roleKey || !shadowRank) {
      const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
      return statKeys.reduce((stats, key) => {
        stats[key] = 10; // Default baseline
        return stats;
      }, {});
    }

    const weights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];

    // Get rank baseline stats (proportionate to expected stats at that rank)
    const rankBaselines = this.getRankBaselineStats(shadowRank, rankMultiplier);

    // Guard clause: Return default stats if no baselines
    if (!rankBaselines) {
      return statKeys.reduce((stats, key) => {
        stats[key] = 10; // Default baseline
        return stats;
      }, {});
    }

    // Use reduce for functional pattern to build baseStats object
    return statKeys.reduce((baseStats, stat) => {
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
      return baseStats;
    }, {});
  }

  /**
   * Calculate shadow strength based on shadow stats and optional multiplier
   * Operations:
   * 1. Sum all stat values (STR + AGI + INT + VIT + PER)
   * 2. Multiply by multiplier (default 1)
   * 3. Return floor of result
   */
  calculateShadowStrength(stats, multiplier = 1) {
    // Guard clause: Return 0 if no stats provided
    if (!stats) return 0;

    // Guard clause: Return 0 if invalid multiplier
    if (multiplier <= 0) return 0;

    // Use reduce for functional pattern
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const totalStats = statKeys.reduce((sum, key) => sum + (stats[key] || 0), 0);

    // Base strength = total stats * multiplier
    return Math.floor(totalStats * multiplier);
  }

  // ============================================================================
  // 3.8 SHADOW STORAGE & RETRIEVAL
  // ============================================================================

  /**
   * Show extraction animation when shadow is extracted
   * Operations:
   * 1. Use integrated ARISE animation system (merged from ShadowAriseAnimation plugin)
   * 2. Fallback to simple inline animation if ARISE animation disabled
   * 3. Create animation element with ARISE text and shadow info
   * 4. Append to document body
   * 5. Schedule fade-out and removal after animation duration
   */
  showExtractionAnimation(shadow) {
    // Guard clause: Return early if no shadow provided
    if (!shadow) return;

    // Use integrated ARISE animation if enabled
    if (this.settings?.ariseAnimation?.enabled) {
      try {
        this.triggerArise(shadow);
        return;
      } catch (error) {
        this.debugError('ANIMATION', 'Error triggering ARISE animation', error);
        // Fall through to fallback animation
      }
    }

    // Fallback: simple inline ARISE animation (minimal, in case ARISE animation disabled or fails)
    // Use BdApi.DOM utilities if available for better integration
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

    // Use BdApi.DOM utilities if available, otherwise fallback to manual append
    if (BdApi && BdApi.DOM && typeof BdApi.DOM.append === 'function') {
      BdApi.DOM.append(document.body, animation);
    } else {
      document.body.appendChild(animation);
    }

    setTimeout(() => {
      animation.classList.add('fade-out');
      setTimeout(() => {
        // Use BdApi.DOM utilities if available for removal
        if (BdApi && BdApi.DOM && typeof BdApi.DOM.remove === 'function') {
          BdApi.DOM.remove(animation);
        } else {
          animation.remove();
        }
      }, 500);
    }, 2000);
  }

  // ============================================================================
  // 3.8.1 SHADOW QUERY & MANAGEMENT
  // ============================================================================

  /**
   * Get total shadow count
   * Operations:
   * 1. Use IndexedDB if available, otherwise fallback to localStorage array
   * 2. Return total count
   */
  async getTotalShadowCount() {
    // Guard clause: Use IndexedDB if available
    if (this.storageManager) {
      try {
        const count = await this.storageManager.getTotalCount();
        this.debugLog('GET_TOTAL_COUNT', `Total shadows in IndexedDB: ${count}`);
        return count;
      } catch (error) {
        // debugError method is in SECTION 4
        this.debugError('STORAGE', 'Failed to get count from IndexedDB', error);
      }
    }
    // Fallback to localStorage
    const localStorageCount = (this.settings.shadows || []).length;
    this.debugLog('GET_TOTAL_COUNT', `Total shadows in localStorage: ${localStorageCount}`);
    return localStorageCount;
  }

  /**
   * Get shadows filtered by role
   * Operations:
   * 1. Use IndexedDB if available with role filter
   * 2. Otherwise fallback to localStorage array filter
   * 3. Return filtered array
   */
  async getShadowsByRole(role) {
    // Guard clause: Return empty array if no role provided
    if (!role) return [];

    // Guard clause: Use IndexedDB if available
    if (this.storageManager) {
      try {
        return await this.storageManager.getShadows({ role }, 0, 10000);
      } catch (error) {
        // debugError method is in SECTION 4
        this.debugError('STORAGE', 'Failed to get shadows by role from IndexedDB', error);
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
    // Guard clause: Return empty array if no rank provided
    if (!rank) return [];

    // Guard clause: Use IndexedDB if available
    if (this.storageManager) {
      try {
        return await this.storageManager.getShadows({ rank }, 0, 10000);
      } catch (error) {
        // debugError method is in SECTION 4
        this.debugError('STORAGE', 'Failed to get shadows by rank from IndexedDB', error);
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
    // Guard clause: Fallback to localStorage if no storage manager
    if (!this.storageManager) {
      return this.settings.shadows || [];
    }

    try {
      let shadows = await this.storageManager.getShadows({}, 0, 100000);

      // HYBRID COMPRESSION: Decompress all shadows transparently
      // This ensures all operations (XP, level-ups, stats) work correctly
      // regardless of compression state in storage
      // Guard clause: Only map if shadows exist
      if (shadows && shadows.length > 0) {
        shadows = shadows.map((s) => this.getShadowData(s));
      }

      return shadows;
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('STORAGE', 'Failed to get all shadows from IndexedDB', error);
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

      // Guard clause: Use IndexedDB if available, fallback to localStorage
      if (this.storageManager) {
        try {
          // Get all shadows from IndexedDB
          shadows = await this.storageManager.getShadows({}, 0, 10000);
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('STORAGE', 'Failed to get shadows from IndexedDB', error);
          shadows = this.settings.shadows || [];
        }
      } else {
        shadows = this.settings.shadows || [];
      }

      // Guard clause: Return empty array if no shadows
      if (!shadows || shadows.length === 0) return [];

      // Compute strength on the fly without mutating stored shadows
      // (strength = sum of all effective stats: base + growth + natural)
      const withPower = shadows.map((shadow) => {
        const effective = this.getShadowEffectiveStats(shadow);
        const strength = this.calculateShadowStrength(effective, 1);
        return { shadow, strength };
      });

      // Sort by strength (total power) descending
      withPower.sort((a, b) => b.strength - a.strength);

      // Return top 7 strongest (generals)
      return withPower.slice(0, 7).map((x) => x.shadow);
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('STORAGE', 'Error getting top generals', error);
      return [];
    }
  }

  // ============================================================================
  // 3.9 SHADOW PROCESSING HELPERS
  // ============================================================================

  /**
   * Calculate shadow power with caching for performance
   * Caches power calculations to avoid redundant computations
   * Operations:
   * 1. Check cache first (fast path)
   * 2. Decompress shadow if needed
   * 3. Get effective stats
   * 4. Calculate power
   * 5. Cache result
   * 6. Return power value
   * @param {Object} shadow - Shadow object
   * @returns {number} - Shadow power value
   */
  calculateShadowPowerCached(shadow) {
    // Guard clause: Return 0 for invalid shadow
    // Accept both id (uncompressed) and i (compressed) for identifier
    if (!shadow || (!shadow.id && !shadow.i)) {
      this.debugLog('POWER_CALC', 'Invalid shadow object', {
        hasShadow: !!shadow,
        hasId: !!(shadow && shadow.id),
        hasI: !!(shadow && shadow.i),
      });
      return 0;
    }

    // Get identifier for cache key (use id or i)
    const shadowId = shadow.id || shadow.i;
    if (!shadowId) {
      return 0;
    }

    // Check cache first (fast path)
    const cacheKey = `power_${shadowId}`;
    if (this._shadowPowerCache && this._shadowPowerCache.has(cacheKey)) {
      return this._shadowPowerCache.get(cacheKey);
    }

    // Decompress if needed
    const decompressed = this.getShadowData(shadow);
    if (!decompressed) {
      this.debugLog('POWER_CALC', 'Failed to decompress shadow', {
        shadowId,
        isCompressed: !!(shadow._c === 1 || shadow._c === 2),
      });
      return 0;
    }

    // Use shadow.strength if available (most accurate)
    if (decompressed.strength && decompressed.strength > 0) {
      if (!this._shadowPowerCache) {
        this._shadowPowerCache = new Map();
      }
      this._shadowPowerCache.set(cacheKey, decompressed.strength);
      return decompressed.strength;
    }

    // Calculate from effective stats if strength not available
    const effective = this.getShadowEffectiveStats(decompressed);
    if (!effective) {
      this.debugLog('POWER_CALC', 'No effective stats available', {
        shadowId: shadowId,
        hasDecompressed: !!decompressed,
        hasBaseStats: !!decompressed?.baseStats,
      });
      return 0;
    }
    const power = this.calculateShadowPower(effective, 1); // Use multiplier 1, not level

    // Debug log if power is 0
    if (power === 0) {
      this.debugLog('POWER_CALC', 'Calculated power is 0', {
        shadowId: shadowId,
        effectiveStats: effective,
        hasStrength: !!decompressed.strength,
        decompressedStrength: decompressed.strength,
      });
    }

    // Evict oldest entries if cache is full
    if (!this._shadowPowerCache) {
      this._shadowPowerCache = new Map();
    }
    if (this._shadowPowerCache.size >= this._shadowPowerCacheLimit) {
      const firstKey = this._shadowPowerCache.keys().next().value;
      this._shadowPowerCache.delete(firstKey);
    }

    this._shadowPowerCache.set(cacheKey, power);
    return power;
  }

  /**
   * Process shadows with power calculation (helper for compression/essence operations)
   * Combines decompression, effective stats, and power calculation in one operation
   * Operations:
   * 1. Map shadows to include decompressed data, effective stats, and power
   * 2. Use cached power calculation when possible
   * 3. Return array of shadow objects with power metadata
   * @param {Array<Object>} shadows - Array of shadow objects
   * @param {boolean} useCache - Whether to use power cache (default: true)
   * @returns {Array<Object>} - Array of { shadow, decompressed, effective, power }
   */
  processShadowsWithPower(shadows, useCache = true) {
    // Guard clause: Return empty array if no shadows
    if (!shadows || shadows.length === 0) return [];

    return shadows.map((shadow) => {
      const decompressed = this.getShadowData(shadow);
      const effective = this.getShadowEffectiveStats(decompressed);
      const power = useCache
        ? this.calculateShadowPowerCached(shadow)
        : this.calculateShadowStrength(effective, decompressed.level || 1);

      return {
        shadow,
        decompressed,
        effective,
        power,
        compressionLevel: shadow._c || 0,
      };
    });
  }

  /**
   * Clear shadow power cache (call after major operations that change shadow stats)
   * Operations:
   * 1. Clear power cache map
   * 2. Log cache clear for debugging
   */
  clearShadowPowerCache() {
    if (this._shadowPowerCache) {
      this._shadowPowerCache.clear();
      this.debugLog('CACHE', 'Shadow power cache cleared');
    }
  }

  /**
   * Invalidate power cache for specific shadow (handles compression state changes)
   * @param {Object} shadow - Shadow object to invalidate
   */
  invalidateShadowPowerCache(shadow) {
    if (!shadow || !this._shadowPowerCache) return;
    const keys = this.getAllCacheKeys
      ? this.getAllCacheKeys(shadow)
      : [shadow.id || shadow.i].filter(Boolean);
    keys.forEach((key) => {
      const powerCacheKey = `power_${key}`;
      if (this._shadowPowerCache.has(powerCacheKey)) {
        this._shadowPowerCache.delete(powerCacheKey);
        this.debugLog('CACHE', 'Invalidated power cache', { key: powerCacheKey });
      }
    });
  }

  // ============================================================================
  // 3.9.5 DUNGEON COMBAT OPTIMIZATION HELPERS
  // ============================================================================

  /**
   * Combat Performance Manager - Optimizes combat calculations for millions of shadows
   * Provides batching, throttling, caching, and aggregation for CPU/memory efficiency
   */

  /**
   * Pre-calculate aggregated army stats for combat (avoids individual calculations)
   * Operations:
   * 1. Get all shadows (or use cached aggregation)
   * 2. Group by rank and role
   * 3. Calculate aggregated stats per group
   * 4. Cache result for reuse
   * @param {boolean} forceRecalculate - Force recalculation even if cache exists
   * @returns {Promise<Object>} - Aggregated army stats
   */
  async getAggregatedArmyStats(forceRecalculate = false) {
    // Check cache first (fast path)
    const cacheTTL = 30000; // 30 seconds cache
    const now = Date.now();

    if (
      !forceRecalculate &&
      this._armyStatsCache &&
      this._armyStatsCacheTime &&
      now - this._armyStatsCacheTime < cacheTTL
    ) {
      this.debugLog('COMBAT', 'Returning cached army stats');
      return this._armyStatsCache;
    }

    // Prevent concurrent execution
    if (this._aggregatingArmyStats) {
      this.debugLog('COMBAT', 'Waiting for concurrent army stats aggregation');
      return this._aggregatingArmyStats;
    }

    // Create aggregation promise
    this._aggregatingArmyStats = (async () => {
      try {
        // Get all shadows efficiently
        let allShadows = [];
        if (this.storageManager) {
          try {
            // Ensure storage manager is initialized
            if (!this.storageManager.db) {
              this.debugLog('COMBAT', 'IndexedDB not initialized, initializing now...');
              await this.storageManager.init();
            }

            // Verify IndexedDB is working by checking count first
            const totalCount = await this.storageManager.getTotalCount();
            this.debugLog('COMBAT', 'IndexedDB status check', {
              totalCount,
              dbName: this.storageManager.dbName,
              dbInitialized: !!this.storageManager.db,
            });

            if (totalCount > 0) {
              allShadows = await this.storageManager.getShadows({}, 0, 1000000);
              this.debugLog('COMBAT', 'Retrieved shadows from IndexedDB', {
                shadowCount: allShadows?.length || 0,
                totalCount,
                hasStorageManager: !!this.storageManager,
                dbInitialized: !!this.storageManager.db,
              });
            } else {
              // IndexedDB is empty, check localStorage fallback
              this.debugLog('COMBAT', 'IndexedDB is empty, checking localStorage fallback', {
                settingsShadowsCount: (this.settings.shadows || []).length,
              });
              allShadows = this.settings.shadows || [];
            }
          } catch (storageError) {
            this.debugError('COMBAT', 'Failed to get shadows from storage', storageError);
            // Fallback to settings if storage fails
            allShadows = this.settings.shadows || [];
            this.debugLog('COMBAT', 'Using fallback shadows from settings', {
              shadowCount: allShadows?.length || 0,
            });
          }
        } else {
          this.debugLog('COMBAT', 'No storage manager, using settings shadows', {
            shadowCount: (this.settings.shadows || []).length,
          });
          allShadows = this.settings.shadows || [];
        }

        // Guard clause: Return empty stats if no shadows
        if (!allShadows || allShadows.length === 0) {
          this.debugLog('COMBAT', 'No shadows found in storage', {
            hasStorageManager: !!this.storageManager,
            dbInitialized: !!this.storageManager?.db,
            settingsShadowsCount: (this.settings.shadows || []).length,
            storageManagerDbName: this.storageManager?.dbName,
          });

          // Try to get count from IndexedDB to verify it's working
          if (this.storageManager) {
            try {
              const count = await this.storageManager.getTotalCount();
              this.debugLog('COMBAT', 'IndexedDB total count check', {
                totalCount: count,
                dbName: this.storageManager.dbName,
              });
            } catch (countError) {
              this.debugError('COMBAT', 'Failed to get total count from IndexedDB', countError);
            }
          }

          const emptyStats = {
            totalShadows: 0,
            totalPower: 0,
            totalStats: { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 },
            byRank: {},
            byRole: {},
            avgLevel: 0,
          };
          // Cache empty result
          this._armyStatsCache = emptyStats;
          this._armyStatsCacheTime = Date.now();
          return emptyStats;
        }

        // Debug: Log shadow retrieval success
        this.debugLog('COMBAT', 'Retrieved shadows for aggregation', {
          shadowCount: allShadows.length,
          firstShadowSample: allShadows[0]
            ? {
                id: allShadows[0].id,
                rank: allShadows[0].rank,
                hasStrength: !!allShadows[0].strength,
                strength: allShadows[0].strength,
                hasBaseStats: !!allShadows[0].baseStats,
              }
            : null,
        });

        // Use reduce for functional aggregation
        const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
        const aggregated = allShadows.reduce(
          (acc, shadow) => {
            // Decompress if needed
            const decompressed = this.getShadowData(shadow);
            if (!decompressed) {
              const shadowId = shadow?.id || shadow?.i;
              this.debugLog('COMBAT', 'Failed to decompress shadow', { shadowId });
              return acc; // Skip invalid shadow
            }

            const effective = this.getShadowEffectiveStats(decompressed);
            if (!effective) {
              this.debugLog('COMBAT', 'Failed to get effective stats', {
                shadowId: shadow?.id,
                hasDecompressed: !!decompressed,
                hasBaseStats: !!decompressed?.baseStats,
              });
              return acc; // Skip shadow without effective stats
            }

            const power = this.calculateShadowPowerCached(shadow);

            // Debug log for zero power shadows (only log first few to avoid spam)
            if (power === 0 && acc.totalShadows < 3) {
              this.debugLog('COMBAT', 'Shadow has zero power', {
                shadowId: shadow?.id,
                hasStrength: !!shadow?.strength,
                shadowStrength: shadow?.strength,
                hasBaseStats: !!decompressed?.baseStats,
                baseStats: decompressed?.baseStats,
                hasEffective: !!effective,
                effectiveStats: effective,
                decompressedStrength: decompressed?.strength,
                rank: decompressed?.rank,
                level: decompressed?.level,
                calculatedPower: power,
              });
            }

            // Aggregate totals
            acc.totalShadows++;
            acc.totalPower += power;
            acc.totalLevel += decompressed.level || 1;

            // Aggregate stats
            statKeys.forEach((stat) => {
              acc.totalStats[stat] += effective[stat] || 0;
            });

            // Group by rank
            const rank = decompressed.rank || 'E';
            if (!acc.byRank[rank]) {
              acc.byRank[rank] = {
                count: 0,
                totalPower: 0,
                totalStats: statKeys.reduce((s, k) => ({ ...s, [k]: 0 }), {}),
              };
            }
            acc.byRank[rank].count++;
            acc.byRank[rank].totalPower += power;
            statKeys.forEach((stat) => {
              acc.byRank[rank].totalStats[stat] += effective[stat] || 0;
            });

            // Group by role
            const role = decompressed.role || decompressed.roleName || 'Unknown';
            if (!acc.byRole[role]) {
              acc.byRole[role] = {
                count: 0,
                totalPower: 0,
                totalStats: statKeys.reduce((s, k) => ({ ...s, [k]: 0 }), {}),
              };
            }
            acc.byRole[role].count++;
            acc.byRole[role].totalPower += power;
            statKeys.forEach((stat) => {
              acc.byRole[role].totalStats[stat] += effective[stat] || 0;
            });

            return acc;
          },
          {
            totalShadows: 0,
            totalPower: 0,
            totalLevel: 0,
            totalStats: statKeys.reduce((s, k) => ({ ...s, [k]: 0 }), {}),
            byRank: {},
            byRole: {},
          }
        );

        // Calculate averages
        aggregated.avgLevel =
          aggregated.totalShadows > 0
            ? Math.floor(aggregated.totalLevel / aggregated.totalShadows)
            : 0;

        // Cache result
        this._armyStatsCache = aggregated;
        this._armyStatsCacheTime = Date.now();

        this.debugLog('GET_AGGREGATED_ARMY_STATS', 'Army stats aggregated successfully', {
          totalShadows: aggregated.totalShadows,
          totalPower: aggregated.totalPower,
          shadowCount: allShadows.length,
          avgPower:
            aggregated.totalShadows > 0
              ? Math.floor(aggregated.totalPower / aggregated.totalShadows)
              : 0,
          avgLevel: aggregated.avgLevel,
          byRankCounts: Object.keys(aggregated.byRank).map((rank) => ({
            rank,
            count: aggregated.byRank[rank].count,
            power: aggregated.byRank[rank].totalPower,
          })),
          cacheUpdated: true,
          calculationTime: Date.now() - now,
        });

        return aggregated;
      } catch (error) {
        this.debugError('COMBAT', 'Failed to aggregate army stats', error);
        // Return empty stats on error (prevents "failed to load data" errors)
        const emptyStats = {
          totalShadows: 0,
          totalPower: 0,
          totalStats: { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 },
          byRank: {},
          byRole: {},
          avgLevel: 0,
        };
        // Cache empty result to prevent repeated failed attempts
        this._armyStatsCache = emptyStats;
        this._armyStatsCacheTime = Date.now();
        return emptyStats;
      } finally {
        // Clear aggregation flag
        this._aggregatingArmyStats = null;
      }
    })();

    return this._aggregatingArmyStats;
  }

  /**
   * Calculate army damage output using aggregated stats (O(1) instead of O(n))
   * Operations:
   * 1. Get aggregated army stats (cached)
   * 2. Calculate damage using aggregated power
   * 3. Apply damage multipliers
   * 4. Return total damage
   * @param {Object} options - Combat options
   * @param {number} options.damageMultiplier - Damage multiplier (default: 1.0)
   * @param {string} options.targetType - Target type (mob/boss) for different multipliers
   * @returns {Promise<number>} - Total army damage
   */
  async calculateArmyDamage(options = {}) {
    const { damageMultiplier = 1.0, targetType = 'mob' } = options;

    // Get aggregated stats (uses cache)
    const armyStats = await this.getAggregatedArmyStats();

    // Guard clause: Return 0 if no army
    if (armyStats.totalShadows === 0) return 0;

    // Base damage from total power
    const baseDamage = armyStats.totalPower * 0.1; // 10% of power as base damage

    // Apply target type multipliers
    const targetMultipliers = {
      mob: 1.0,
      boss: 0.5, // Bosses take 50% damage (tankier)
      elite: 0.75, // Elite mobs take 75% damage
    };
    const targetMultiplier = targetMultipliers[targetType] || 1.0;

    // Calculate final damage
    const totalDamage = baseDamage * damageMultiplier * targetMultiplier;

    return Math.floor(totalDamage);
  }

  /**
   * Process combat in batches with throttling (prevents CPU overload)
   * Operations:
   * 1. Split shadows into batches
   * 2. Process each batch with delay
   * 3. Use requestAnimationFrame for smooth updates
   * 4. Return combat results
   * @param {Array<Object>} shadows - Shadows to process
   * @param {Object} target - Target monster/boss
   * @param {Object} options - Combat processing options
   * @param {number} options.batchSize - Shadows per batch (default: 100)
   * @param {number} options.delayMs - Delay between batches (default: 16ms for 60fps)
   * @param {Function} options.onBatchComplete - Callback after each batch
   * @returns {Promise<Object>} - Combat results
   */
  async processCombatBatch(shadows, target, options = {}) {
    const {
      batchSize = 100,
      delayMs = 16, // ~60fps
      onBatchComplete = null,
    } = options;

    // Guard clause: Return early if no shadows
    if (!shadows || shadows.length === 0) {
      return { totalDamage: 0, shadowsProcessed: 0, batches: 0 };
    }

    // Split into batches
    const batches = [];
    for (let i = 0; i < shadows.length; i += batchSize) {
      batches.push(shadows.slice(i, i + batchSize));
    }

    let totalDamage = 0;
    let shadowsProcessed = 0;

    // Process batches with throttling
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      // Process batch (use cached power calculations)
      const batchResults = batch.map((shadow) => {
        const power = this.calculateShadowPowerCached(shadow);
        const damage = power * 0.1; // 10% of power as damage
        return { shadowId: shadow.id || shadow.i, damage, power };
      });

      // Aggregate batch damage
      const batchDamage = batchResults.reduce((sum, result) => sum + result.damage, 0);
      totalDamage += batchDamage;
      shadowsProcessed += batch.length;

      // Callback if provided
      if (onBatchComplete && typeof onBatchComplete === 'function') {
        onBatchComplete({ batchIndex: i, totalBatches: batches.length, batchDamage, totalDamage });
      }

      // Throttle: Wait before next batch (except last batch)
      if (i < batches.length - 1) {
        await new Promise((resolve) => {
          if (window.requestAnimationFrame) {
            requestAnimationFrame(() => setTimeout(resolve, delayMs));
          } else {
            setTimeout(resolve, delayMs);
          }
        });
      }
    }

    return {
      totalDamage: Math.floor(totalDamage),
      shadowsProcessed,
      batches: batches.length,
      avgDamagePerShadow: shadowsProcessed > 0 ? Math.floor(totalDamage / shadowsProcessed) : 0,
    };
  }

  /**
   * Calculate combat result using aggregated stats (ultra-fast for millions)
   * Uses pre-calculated army stats instead of individual shadow calculations
   * Operations:
   * 1. Get aggregated army stats (cached)
   * 2. Calculate total damage from aggregated power
   * 3. Apply combat modifiers
   * 4. Return combat result
   * @param {Object} target - Target monster/boss
   * @param {Object} options - Combat options
   * @returns {Promise<Object>} - Combat result
   */
  async calculateCombatResultAggregated(target, options = {}) {
    const { damageMultiplier = 1.0 } = options;

    // Get aggregated stats (fast, uses cache)
    const armyStats = await this.getAggregatedArmyStats();

    // Guard clause: Return early if no army
    if (armyStats.totalShadows === 0) {
      return {
        damage: 0,
        targetHP: target.hp || 0,
        targetKilled: false,
        shadowsUsed: 0,
      };
    }

    // Calculate damage from aggregated power
    const baseDamage = armyStats.totalPower * 0.1; // 10% of power as damage
    const finalDamage = Math.floor(baseDamage * damageMultiplier);

    // Apply to target
    const targetHP = target.hp || 0;
    const newTargetHP = Math.max(0, targetHP - finalDamage);
    const targetKilled = newTargetHP <= 0;

    return {
      damage: finalDamage,
      targetHP: newTargetHP,
      targetKilled,
      shadowsUsed: armyStats.totalShadows,
      armyPower: armyStats.totalPower,
    };
  }

  /**
   * Performance monitor for combat operations
   * Tracks FPS, CPU usage, and memory to prevent overload
   * Operations:
   * 1. Track frame times
   * 2. Calculate FPS
   * 3. Monitor memory usage
   * 4. Return performance metrics
   * @returns {Object} - Performance metrics
   */
  getCombatPerformanceMetrics() {
    // eslint-disable-next-line no-undef
    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const now = perfNow;

    // Initialize performance tracking if needed
    if (!this._combatPerformance) {
      this._combatPerformance = {
        frameTimes: [],
        lastFrameTime: now,
        fps: 60,
        memoryUsage: 0,
        combatOperations: 0,
        lastUpdate: now,
      };
    }

    const perf = this._combatPerformance;

    // Calculate FPS from frame times
    const frameTime = now - perf.lastFrameTime;
    perf.frameTimes.push(frameTime);
    if (perf.frameTimes.length > 60) {
      perf.frameTimes.shift(); // Keep last 60 frames
    }

    const avgFrameTime = perf.frameTimes.reduce((sum, t) => sum + t, 0) / perf.frameTimes.length;
    perf.fps = avgFrameTime > 0 ? Math.floor(1000 / avgFrameTime) : 60;

    // Get memory usage (if available)
    // eslint-disable-next-line no-undef
    if (typeof performance !== 'undefined' && performance.memory) {
      // eslint-disable-next-line no-undef
      perf.memoryUsage = Math.floor(performance.memory.usedJSHeapSize / 1024 / 1024); // MB
    }

    perf.lastFrameTime = now;
    perf.lastUpdate = now;

    return {
      fps: perf.fps,
      memoryMB: perf.memoryUsage,
      combatOperations: perf.combatOperations,
      avgFrameTime: Math.floor(avgFrameTime),
      isHealthy: perf.fps >= 30 && perf.memoryUsage < 500, // Healthy if 30+ FPS and <500MB
    };
  }

  /**
   * Throttle combat operations based on performance metrics
   * Automatically adjusts batch size and delay based on FPS
   * Operations:
   * 1. Get current performance metrics
   * 2. Adjust batch size based on FPS
   * 3. Adjust delay based on memory usage
   * 4. Return optimized combat options
   * @returns {Object} - Optimized combat options
   */
  getOptimizedCombatOptions() {
    const metrics = this.getCombatPerformanceMetrics();

    // Adjust batch size based on FPS
    let batchSize = 100; // Default
    if (metrics.fps < 30) {
      batchSize = 50; // Smaller batches if FPS is low
    } else if (metrics.fps >= 60) {
      batchSize = 200; // Larger batches if FPS is high
    }

    // Adjust delay based on memory
    let delayMs = 16; // Default ~60fps
    if (metrics.memoryMB > 300) {
      delayMs = 32; // Slower if memory is high
    } else if (metrics.memoryMB < 100) {
      delayMs = 8; // Faster if memory is low
    }

    return {
      batchSize,
      delayMs,
      useAggregation: metrics.combatOperations > 1000, // Use aggregation for large armies
      throttle: !metrics.isHealthy, // Throttle if performance is poor
    };
  }

  /**
   * Clear combat performance cache
   * Call after major combat operations to free memory
   */
  clearCombatCache() {
    // Clear army stats cache
    this._armyStatsCache = null;
    this._armyStatsCacheTime = null;

    // Clear power cache
    this.clearShadowPowerCache();

    // Clear personality cache (keep recent entries, clear old)
    if (this._shadowPersonalityCache && this._shadowPersonalityCache.size > 1000) {
      // Keep only most recent 1000 personalities
      const entries = Array.from(this._shadowPersonalityCache.entries());
      this._shadowPersonalityCache.clear();
      entries.slice(-1000).forEach(([key, value]) => {
        this._shadowPersonalityCache.set(key, value);
      });
    }

    // Reset performance tracking
    if (this._combatPerformance) {
      this._combatPerformance.frameTimes = [];
      this._combatPerformance.combatOperations = 0;
    }

    this.debugLog('COMBAT', 'Combat cache cleared');
  }

  /**
   * Initialize combat performance tracking
   * Call at start of combat session
   */
  initCombatPerformanceTracking() {
    // eslint-disable-next-line no-undef
    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._combatPerformance = {
      frameTimes: [],
      lastFrameTime: perfNow,
      fps: 60,
      memoryUsage: 0,
      combatOperations: 0,
      lastUpdate: perfNow,
    };
    this.debugLog('COMBAT', 'Combat performance tracking initialized');
  }

  /**
   * Combat queue manager - Processes combat in priority order
   * Operations:
   * 1. Queue combat operations with priority
   * 2. Process queue in batches
   * 3. Handle high-priority operations first
   * 4. Throttle based on performance
   * @param {Array<Object>} combatOperations - Array of { priority, shadow, target, callback }
   * @param {Object} options - Queue processing options
   * @returns {Promise<Array>} - Combat results
   */
  async processCombatQueue(combatOperations, options = {}) {
    const { maxConcurrent = 10, priorityThreshold = 5 } = options;

    // Guard clause: Return early if no operations
    if (!combatOperations || combatOperations.length === 0) {
      return [];
    }

    // Sort by priority (higher priority first)
    const sortedOps = [...combatOperations].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Split into high and low priority
    const highPriority = sortedOps.filter((op) => (op.priority || 0) >= priorityThreshold);
    const lowPriority = sortedOps.filter((op) => (op.priority || 0) < priorityThreshold);

    const results = [];

    // Process high priority first (synchronous, fast)
    for (const op of highPriority) {
      try {
        const result = await this.processSingleCombat(op.shadow, op.target);
        if (op.callback) op.callback(result);
        results.push(result);
      } catch (error) {
        this.debugError('COMBAT', 'High priority combat error', error);
      }
    }

    // Process low priority in batches (throttled)
    const batchSize = Math.min(maxConcurrent, lowPriority.length);
    for (let i = 0; i < lowPriority.length; i += batchSize) {
      const batch = lowPriority.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (op) => {
          try {
            const result = await this.processSingleCombat(op.shadow, op.target);
            if (op.callback) op.callback(result);
            return result;
          } catch (error) {
            this.debugError('COMBAT', 'Low priority combat error', error);
            return null;
          }
        })
      );
      results.push(...batchResults.filter((r) => r !== null));

      // Throttle between batches
      if (i + batchSize < lowPriority.length) {
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(undefined);
          }, 16); // ~60fps
        });
      }
    }

    return results;
  }

  /**
   * Process single combat operation (lightweight, cached)
   * Operations:
   * 1. Get shadow power (cached)
   * 2. Calculate damage
   * 3. Apply to target
   * 4. Return result
   * @param {Object} shadow - Shadow object
   * @param {Object} target - Target monster/boss
   * @returns {Object} - Combat result
   */
  async processSingleCombat(shadow, target) {
    // Guard clause: Return early if invalid inputs
    if (!shadow || !target) {
      return { damage: 0, targetKilled: false };
    }

    // Use cached power calculation
    const power = this.calculateShadowPowerCached(shadow);
    const damage = Math.floor(power * 0.1); // 10% of power as damage

    // Apply damage to target
    const targetHP = target.hp || 0;
    const newTargetHP = Math.max(0, targetHP - damage);
    const targetKilled = newTargetHP <= 0;

    // Update performance counter
    if (this._combatPerformance) {
      this._combatPerformance.combatOperations++;
    }

    // Get identifier (accept both id and i for compressed shadows)
    const shadowId = shadow.id || shadow.i;
    return {
      shadowId: shadowId,
      damage,
      targetHP: newTargetHP,
      targetKilled,
      power,
    };
  }

  /**
   * Batch update shadows after combat (efficient database operations)
   * Operations:
   * 1. Collect all shadow updates
   * 2. Batch update in single transaction
   * 3. Clear caches after update
   * @param {Array<Object>} shadowUpdates - Array of { shadow, updates }
   * @returns {Promise<number>} - Count of updated shadows
   */
  async batchUpdateShadowsAfterCombat(shadowUpdates) {
    // Guard clause: Return early if no updates
    if (!shadowUpdates || shadowUpdates.length === 0) {
      return 0;
    }

    try {
      // Prepare shadows for batch update
      const shadowsToUpdate = shadowUpdates
        .map(({ shadow, updates }) => {
          // Apply updates to shadow
          const updatedShadow = { ...shadow, ...updates };
          // Recalculate strength if stats changed
          if (updates.baseStats || updates.growthStats || updates.naturalGrowthStats) {
            const effective = this.getShadowEffectiveStats(updatedShadow);
            updatedShadow.strength = this.calculateShadowStrength(
              effective,
              updatedShadow.level || 1
            );
          }
          return this.prepareShadowForSave(updatedShadow);
        })
        .filter((shadow) => shadow !== null);

      // Batch update using storage manager
      if (this.storageManager?.updateShadowsBatch && shadowsToUpdate.length > 0) {
        const updated = await this.storageManager.updateShadowsBatch(shadowsToUpdate);
        // Clear caches after update
        this.clearCombatCache();
        return updated;
      }

      return 0;
    } catch (error) {
      this.debugError('COMBAT', 'Failed to batch update shadows after combat', error);
      return 0;
    }
  }

  /**
   * Get combat-ready shadow subset (top performers only)
   * For millions of shadows, only use top N for combat calculations
   * Operations:
   * 1. Get aggregated stats
   * 2. Calculate top N shadows needed for combat
   * 3. Return subset of shadows
   * @param {number} maxShadows - Maximum shadows to use (default: 1000)
   * @returns {Promise<Array<Object>>} - Combat-ready shadow subset
   */
  async getCombatReadyShadows(maxShadows = 1000) {
    try {
      // Get all shadows
      let allShadows = [];
      if (this.storageManager) {
        allShadows = await this.storageManager.getShadows({}, 0, maxShadows * 2); // Get 2x for filtering
      } else {
        allShadows = this.settings.shadows || [];
      }

      // Guard clause: Return all if below limit
      if (allShadows.length <= maxShadows) {
        return allShadows.map((s) => this.getShadowData(s));
      }

      // Process with power and sort (use cached calculations)
      const withPower = this.processShadowsWithPower(allShadows, true);

      // Sort by power (strongest first)
      withPower.sort((a, b) => b.power - a.power);

      // Return top N shadows
      return withPower.slice(0, maxShadows).map(({ shadow }) => this.getShadowData(shadow));
    } catch (error) {
      this.debugError('COMBAT', 'Failed to get combat-ready shadows', error);
      return [];
    }
  }

  /**
   * Calculate army effectiveness against target (early exit optimization)
   * Quickly determines if army can defeat target without full calculation
   * Operations:
   * 1. Get aggregated army stats
   * 2. Calculate total army damage
   * 3. Compare with target HP
   * 4. Return effectiveness estimate
   * @param {Object} target - Target monster/boss
   * @returns {Promise<Object>} - Effectiveness estimate
   */
  async estimateArmyEffectiveness(target) {
    const targetHP = target.hp || 0;

    // Guard clause: Return early if no target HP
    if (targetHP <= 0) {
      return { canDefeat: true, estimatedRounds: 0, confidence: 1.0 };
    }

    // Get aggregated stats (fast, cached)
    const armyStats = await this.getAggregatedArmyStats();

    // Guard clause: Return early if no army
    if (armyStats.totalShadows === 0) {
      return { canDefeat: false, estimatedRounds: Infinity, confidence: 1.0 };
    }

    // Calculate damage per round (using aggregated power)
    const damagePerRound = Math.floor(armyStats.totalPower * 0.1); // 10% of power

    // Guard clause: Early exit if damage is 0
    if (damagePerRound <= 0) {
      return { canDefeat: false, estimatedRounds: Infinity, confidence: 1.0 };
    }

    // Estimate rounds needed
    const estimatedRounds = Math.ceil(targetHP / damagePerRound);

    // Calculate confidence (based on army size and power)
    const confidence = Math.min(1.0, armyStats.totalShadows / 1000); // More shadows = higher confidence

    return {
      canDefeat: true,
      estimatedRounds,
      confidence,
      damagePerRound,
      armyPower: armyStats.totalPower,
    };
  }

  /**
   * Memory-efficient combat data structure
   * Stores only essential combat data to minimize memory usage
   * @param {Object} shadow - Shadow object
   * @param {Object} target - Target object
   * @returns {Object} - Minimal combat data
   */
  createCombatData(shadow, target) {
    // Store only essential data (minimal memory footprint)
    // Get identifier (accept both id and i for compressed shadows)
    const shadowId = shadow.id || shadow.i;
    return {
      s: shadowId, // Shadow ID (compressed key)
      t: target.id || 'unknown', // Target ID
      p: this.calculateShadowPowerCached(shadow), // Power (cached)
      d: 0, // Damage (calculated)
      ts: Date.now(), // Timestamp
    };
  }

  /**
   * Debounce combat updates (prevents excessive UI updates)
   * Operations:
   * 1. Debounce combat result updates
   * 2. Batch UI updates
   * 3. Return debounced update function
   * @param {Function} updateFn - Update function to debounce
   * @param {number} delayMs - Debounce delay (default: 100ms)
   * @returns {Function} - Debounced update function
   */
  debounceCombatUpdate(updateFn, delayMs = 100) {
    let timeoutId = null;

    return (...args) => {
      // Clear existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Set new timeout
      timeoutId = setTimeout(() => {
        updateFn(...args);
        timeoutId = null;
      }, delayMs);
    };
  }

  /**
   * Throttle combat calculations (prevents CPU overload)
   * Operations:
   * 1. Throttle function calls
   * 2. Skip calls if too frequent
   * 3. Return throttled function
   * @param {Function} fn - Function to throttle
   * @param {number} delayMs - Throttle delay (default: 16ms for 60fps)
   * @returns {Function} - Throttled function
   */
  throttleCombatCalculation(fn, delayMs = 16) {
    let lastCall = 0;
    let timeoutId = null;

    return (...args) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall;

      if (timeSinceLastCall >= delayMs) {
        // Enough time passed, call immediately
        lastCall = now;
        fn(...args);
      } else {
        // Too soon, schedule for later
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          fn(...args);
          timeoutId = null;
        }, delayMs - timeSinceLastCall);
      }
    };
  }

  // ============================================================================
  // 3.9.6 SHADOW PERSONALITY & BEHAVIOR SYSTEM
  // ============================================================================

  /**
   * Shadow Personality System - Individualistic combat behavior
   * Each shadow has unique personality affecting attack speed, damage, and targeting
   */

  /**
   * Shadow personality types with behavior modifiers
   * Each personality affects attack interval, damage calculation, and targeting
   * Defined as instance property (not in constructor) for easier access
   */
  get shadowPersonalities() {
    return {
      aggressive: {
        name: 'Aggressive',
        attackIntervalMultiplier: 0.7, // Attacks 30% faster
        damageMultiplier: 1.2, // 20% more damage
        targetPreference: 'weakest', // Targets weakest enemies
        defenseMultiplier: 0.8, // 20% less defense (glass cannon)
        description: 'Fast, high damage, low defense',
      },
      defensive: {
        name: 'Defensive',
        attackIntervalMultiplier: 1.3, // Attacks 30% slower
        damageMultiplier: 0.8, // 20% less damage
        targetPreference: 'strongest', // Tanks strongest enemies
        defenseMultiplier: 1.5, // 50% more defense (tank)
        description: 'Slow, low damage, high defense',
      },
      balanced: {
        name: 'Balanced',
        attackIntervalMultiplier: 1.0, // Normal speed
        damageMultiplier: 1.0, // Normal damage
        targetPreference: 'random', // Random targeting
        defenseMultiplier: 1.0, // Normal defense
        description: 'Average in all stats',
      },
      berserker: {
        name: 'Berserker',
        attackIntervalMultiplier: 0.5, // Attacks 50% faster
        damageMultiplier: 1.5, // 50% more damage
        targetPreference: 'nearest', // Attacks nearest
        defenseMultiplier: 0.5, // 50% less defense (very fragile)
        description: 'Extremely fast, very high damage, very low defense',
      },
      tank: {
        name: 'Tank',
        attackIntervalMultiplier: 1.5, // Attacks 50% slower
        damageMultiplier: 0.6, // 40% less damage
        targetPreference: 'strongest', // Always tanks
        defenseMultiplier: 2.0, // 100% more defense (very tanky)
        description: 'Very slow, low damage, very high defense',
      },
      assassin: {
        name: 'Assassin',
        attackIntervalMultiplier: 0.8, // Attacks 20% faster
        damageMultiplier: 1.3, // 30% more damage
        targetPreference: 'weakest', // Targets weak enemies (cleanup)
        defenseMultiplier: 0.9, // 10% less defense
        description: 'Fast, high damage, targets weak enemies',
      },
      support: {
        name: 'Support',
        attackIntervalMultiplier: 1.2, // Attacks 20% slower
        damageMultiplier: 0.7, // 30% less damage
        targetPreference: 'random', // Random targeting
        defenseMultiplier: 1.2, // 20% more defense
        description: 'Slower, lower damage, higher defense',
      },
    };
  }

  /**
   * Get or assign personality to shadow
   * Operations:
   * 1. Check if shadow already has personality
   * 2. If not, assign based on role and stats
   * 3. Return personality object
   * @param {Object} shadow - Shadow object
   * @returns {Object} - Personality object with modifiers
   */
  getShadowPersonality(shadow) {
    // Guard clause: Return default if no shadow
    if (!shadow) {
      return this.shadowPersonalities.balanced;
    }

    // Get identifier for cache key (accept both id and i for compressed shadows)
    const shadowId = shadow.id || shadow.i;
    if (!shadowId) {
      return this.shadowPersonalities.balanced;
    }

    // Check cache first (fast path)
    const cacheKey = `personality_${shadowId}`;
    if (this._shadowPersonalityCache && this._shadowPersonalityCache.has(cacheKey)) {
      const cachedPersonality = this._shadowPersonalityCache.get(cacheKey);
      if (this.shadowPersonalities[cachedPersonality]) {
        return this.shadowPersonalities[cachedPersonality];
      }
    }

    // Check if shadow already has assigned personality (from storage)
    if (shadow.personality && this.shadowPersonalities[shadow.personality]) {
      // Cache it
      if (this._shadowPersonalityCache) {
        this._shadowPersonalityCache.set(cacheKey, shadow.personality);
      }
      return this.shadowPersonalities[shadow.personality];
    }

    // Assign personality based on role and stats
    const role = this.shadowRoles[shadow.role || shadow.roleName];
    const effective = this.getShadowEffectiveStats(shadow);

    // Calculate stat ratios to determine personality
    const totalStats =
      effective.strength +
      effective.agility +
      effective.intelligence +
      effective.vitality +
      effective.perception;
    const strengthRatio = totalStats > 0 ? effective.strength / totalStats : 0.2;
    const agilityRatio = totalStats > 0 ? effective.agility / totalStats : 0.2;
    const vitalityRatio = totalStats > 0 ? effective.vitality / totalStats : 0.2;

    // Determine personality based on stat distribution
    let personality = 'balanced'; // Default

    if (strengthRatio > 0.3 && agilityRatio > 0.25) {
      personality = 'berserker'; // High STR + AGI = berserker
    } else if (strengthRatio > 0.35) {
      personality = 'aggressive'; // High STR = aggressive
    } else if (vitalityRatio > 0.4) {
      personality = 'tank'; // High VIT = tank
    } else if (agilityRatio > 0.3 && strengthRatio < 0.2) {
      personality = 'assassin'; // High AGI, low STR = assassin
    } else if (vitalityRatio > 0.3 && strengthRatio < 0.25) {
      personality = 'defensive'; // High VIT, low STR = defensive
    } else if (strengthRatio < 0.2 && vitalityRatio < 0.2) {
      personality = 'support'; // Low STR + VIT = support
    }

    // Role-based personality overrides
    if (role) {
      if (
        role.name?.toLowerCase().includes('tank') ||
        role.name?.toLowerCase().includes('guardian')
      ) {
        personality = 'tank';
      } else if (
        role.name?.toLowerCase().includes('assassin') ||
        role.name?.toLowerCase().includes('rogue')
      ) {
        personality = 'assassin';
      } else if (
        role.name?.toLowerCase().includes('berserker') ||
        role.name?.toLowerCase().includes('warrior')
      ) {
        personality = 'berserker';
      }
    }

    // Cache personality for shadow (don't mutate original)
    // cacheKey already declared above at line 5322, reuse it
    if (this._shadowPersonalityCache && !this._shadowPersonalityCache.has(cacheKey)) {
      this._shadowPersonalityCache.set(cacheKey, personality);
      // Evict oldest entries if cache is full (limit 5000)
      if (this._shadowPersonalityCache.size > 5000) {
        const firstKey = this._shadowPersonalityCache.keys().next().value;
        this._shadowPersonalityCache.delete(firstKey);
      }
    }

    return this.shadowPersonalities[personality] || this.shadowPersonalities.balanced;
  }

  /**
   * Calculate individual shadow attack interval based on personality
   * Operations:
   * 1. Get shadow personality
   * 2. Calculate base interval from agility
   * 3. Apply personality multiplier
   * 4. Add random variance
   * @param {Object} shadow - Shadow object
   * @param {number} baseIntervalMs - Base attack interval in milliseconds
   * @returns {number} - Individual attack interval in milliseconds
   */
  calculateShadowAttackInterval(shadow, baseIntervalMs = 2000) {
    // Guard clause: Return base if no shadow
    if (!shadow) return baseIntervalMs;

    const personality = this.getShadowPersonality(shadow);
    const effective = this.getShadowEffectiveStats(shadow);

    // Base interval from agility (higher agility = faster attacks)
    const agilityFactor = Math.max(0.5, 1.0 - effective.agility / 1000); // Agility reduces interval

    // Apply personality multiplier
    const personalityInterval = baseIntervalMs * personality.attackIntervalMultiplier;

    // Apply agility factor
    const agilityAdjusted = personalityInterval * agilityFactor;

    // Add random variance (±10% for unpredictability)
    const variance = 0.9 + Math.random() * 0.2; // 90-110%

    return Math.max(100, Math.floor(agilityAdjusted * variance)); // Minimum 100ms
  }

  /**
   * Calculate individual shadow damage based on personality
   * Operations:
   * 1. Get shadow personality
   * 2. Calculate base damage from stats
   * 3. Apply personality damage multiplier
   * 4. Add random variance
   * @param {Object} shadow - Shadow object
   * @param {Object} target - Target monster/boss
   * @returns {number} - Individual damage value
   */
  calculateShadowDamage(shadow, target) {
    // Guard clause: Return 0 if invalid inputs
    if (!shadow || !target) return 0;

    const personality = this.getShadowPersonality(shadow);
    const effective = this.getShadowEffectiveStats(shadow);

    // Base damage from strength (primary stat)
    const baseDamage = effective.strength * 0.15; // 15% of strength as base damage

    // Apply personality damage multiplier
    const personalityDamage = baseDamage * personality.damageMultiplier;

    // Apply target type modifiers
    const targetType = target.type || 'mob';
    const targetMultipliers = {
      mob: 1.0,
      elite: 0.9,
      boss: 0.7, // Bosses take less damage
    };
    const targetMultiplier = targetMultipliers[targetType] || 1.0;

    // Add random variance (±15% for unpredictability)
    const variance = 0.85 + Math.random() * 0.3; // 85-115%

    return Math.floor(personalityDamage * targetMultiplier * variance);
  }

  /**
   * Calculate shadow defense based on personality
   * Operations:
   * 1. Get shadow personality
   * 2. Calculate base defense from vitality
   * 3. Apply personality defense multiplier
   * @param {Object} shadow - Shadow object
   * @returns {number} - Defense value
   */
  calculateShadowDefense(shadow) {
    // Guard clause: Return 0 if no shadow
    if (!shadow) return 0;

    const personality = this.getShadowPersonality(shadow);
    const effective = this.getShadowEffectiveStats(shadow);

    // Base defense from vitality
    const baseDefense = effective.vitality * 0.2; // 20% of vitality as defense

    // Apply personality defense multiplier
    return Math.floor(baseDefense * personality.defenseMultiplier);
  }

  /**
   * Select target for shadow based on personality
   * Operations:
   * 1. Get shadow personality
   * 2. Filter available targets
   * 3. Select target based on personality preference
   * @param {Object} shadow - Shadow object
   * @param {Array<Object>} availableTargets - Array of target monsters/bosses
   * @returns {Object|null} - Selected target or null
   */
  selectTargetForShadow(shadow, availableTargets) {
    // Guard clause: Return null if no shadow or targets
    if (!shadow || !availableTargets || availableTargets.length === 0) {
      return null;
    }

    const personality = this.getShadowPersonality(shadow);
    const preference = personality.targetPreference || 'random';

    // Filter out dead targets
    const aliveTargets = availableTargets.filter((t) => (t.hp || 0) > 0);

    if (aliveTargets.length === 0) return null;

    // Select target based on personality preference
    const targetSelectors = {
      weakest: () => {
        // Target with lowest HP
        return aliveTargets.reduce((weakest, target) => {
          return (target.hp || 0) < (weakest.hp || 0) ? target : weakest;
        }, aliveTargets[0]);
      },
      strongest: () => {
        // Target with highest HP
        return aliveTargets.reduce((strongest, target) => {
          return (target.hp || 0) > (strongest.hp || 0) ? target : strongest;
        }, aliveTargets[0]);
      },
      nearest: () => {
        // Target first in array (nearest)
        return aliveTargets[0];
      },
      random: () => {
        // Random target
        return aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
      },
    };

    const selector = targetSelectors[preference] || targetSelectors.random;
    return selector();
  }

  /**
   * Select shadow target for mob (mobs attack different shadows)
   * Operations:
   * 1. Filter available shadows
   * 2. Select target based on mob behavior
   * 3. Return selected shadow
   * @param {Object} mob - Mob object
   * @param {Array<Object>} availableShadows - Array of shadow objects
   * @returns {Object|null} - Selected shadow target or null
   */
  selectShadowTargetForMob(mob, availableShadows) {
    // Guard clause: Return null if no mob or shadows
    if (!mob || !availableShadows || availableShadows.length === 0) {
      return null;
    }

    // Filter out dead shadows (if tracking HP)
    const aliveShadows = availableShadows.filter((s) => {
      // If shadow has HP tracking, filter by HP > 0
      if (s.currentHP !== undefined) {
        return s.currentHP > 0;
      }
      return true; // Assume alive if no HP tracking
    });

    if (aliveShadows.length === 0) return null;

    // Mob behavior: Different mobs target different shadows
    const mobType = mob.type || 'normal';
    const mobBehavior = {
      aggressive: () => {
        // Aggressive mobs target weakest shadows
        return aliveShadows.reduce((weakest, shadow) => {
          const weakPower = this.calculateShadowPowerCached(weakest);
          const shadowPower = this.calculateShadowPowerCached(shadow);
          return shadowPower < weakPower ? shadow : weakest;
        }, aliveShadows[0]);
      },
      defensive: () => {
        // Defensive mobs target strongest shadows (threat elimination)
        return aliveShadows.reduce((strongest, shadow) => {
          const strongPower = this.calculateShadowPowerCached(strongest);
          const shadowPower = this.calculateShadowPowerCached(shadow);
          return shadowPower > strongPower ? shadow : strongest;
        }, aliveShadows[0]);
      },
      balanced: () => {
        // Balanced mobs target random shadows
        return aliveShadows[Math.floor(Math.random() * aliveShadows.length)];
      },
      boss: () => {
        // Bosses target strongest shadows (generals)
        return aliveShadows.reduce((strongest, shadow) => {
          const strongPower = this.calculateShadowPowerCached(strongest);
          const shadowPower = this.calculateShadowPowerCached(shadow);
          return shadowPower > strongPower ? shadow : strongest;
        }, aliveShadows[0]);
      },
    };

    // Determine mob behavior based on type
    let behavior = 'balanced';
    if (mobType === 'boss' || mob.rank === 'SSS' || mob.rank === 'NH') {
      behavior = 'boss';
    } else if (mob.aggressive || mobType === 'aggressive') {
      behavior = 'aggressive';
    } else if (mob.defensive || mobType === 'defensive') {
      behavior = 'defensive';
    }

    const selector = mobBehavior[behavior] || mobBehavior.balanced;
    return selector();
  }

  /**
   * Process individualistic combat with personality-based behavior
   * Operations:
   * 1. Get shadow personality
   * 2. Calculate individual attack interval
   * 3. Select target based on personality
   * 4. Calculate damage with personality modifiers
   * 5. Return combat result
   * @param {Object} shadow - Shadow object
   * @param {Array<Object>} availableTargets - Available targets
   * @param {number} baseIntervalMs - Base attack interval
   * @returns {Object} - Combat result with timing
   */
  processIndividualisticCombat(shadow, availableTargets, baseIntervalMs = 2000) {
    // Get identifier (accept both id and i for compressed shadows)
    const shadowId = shadow?.id || shadow?.i;

    // Guard clause: Return early if invalid inputs
    if (!shadow || !availableTargets || availableTargets.length === 0) {
      return {
        shadowId: shadowId || null,
        target: null,
        damage: 0,
        attackInterval: baseIntervalMs,
        personality: 'balanced',
      };
    }

    const personality = this.getShadowPersonality(shadow);

    // Calculate individual attack interval
    const attackInterval = this.calculateShadowAttackInterval(shadow, baseIntervalMs);

    // Select target based on personality
    const target = this.selectTargetForShadow(shadow, availableTargets);

    if (!target) {
      return {
        shadowId: shadowId,
        target: null,
        damage: 0,
        attackInterval,
        personality: personality.name,
      };
    }

    // Calculate damage with personality modifiers
    const damage = this.calculateShadowDamage(shadow, target);

    return {
      shadowId: shadowId,
      shadowPersonality: personality.name,
      target: target.id || 'unknown',
      targetType: target.type || 'mob',
      damage,
      attackInterval,
      nextAttackTime: Date.now() + attackInterval,
      defense: this.calculateShadowDefense(shadow),
    };
  }

  /**
   * Process mob attack on shadow (mobs attack different shadows)
   * Operations:
   * 1. Select shadow target for mob
   * 2. Calculate mob damage
   * 3. Apply shadow defense
   * 4. Return attack result
   * @param {Object} mob - Mob object
   * @param {Array<Object>} availableShadows - Available shadows
   * @returns {Object} - Attack result
   */
  processMobAttackOnShadow(mob, availableShadows) {
    // Guard clause: Return early if invalid inputs
    if (!mob || !availableShadows || availableShadows.length === 0) {
      return {
        mobId: mob?.id || null,
        targetShadow: null,
        damage: 0,
        shadowKilled: false,
      };
    }

    // Select shadow target for mob
    const targetShadow = this.selectShadowTargetForMob(mob, availableShadows);

    if (!targetShadow) {
      return {
        mobId: mob.id,
        targetShadow: null,
        damage: 0,
        shadowKilled: false,
      };
    }

    // Calculate mob damage
    const mobDamage = (mob.strength || 100) * 0.1; // 10% of mob strength as damage

    // Apply shadow defense
    const shadowDefense = this.calculateShadowDefense(targetShadow);
    const finalDamage = Math.max(1, Math.floor(mobDamage - shadowDefense * 0.5)); // Defense reduces damage

    // Apply damage to shadow (if tracking HP)
    let shadowKilled = false;
    if (targetShadow.currentHP !== undefined) {
      targetShadow.currentHP = Math.max(0, (targetShadow.currentHP || 100) - finalDamage);
      shadowKilled = targetShadow.currentHP <= 0;
    }

    return {
      mobId: mob.id,
      mobType: mob.type || 'normal',
      targetShadow: targetShadow.id,
      targetShadowPersonality: this.getShadowPersonality(targetShadow).name,
      damage: finalDamage,
      shadowKilled,
      shadowDefense,
    };
  }

  /**
   * Schedule individualistic attacks for shadows
   * Each shadow attacks at different intervals based on personality
   * Operations:
   * 1. Process each shadow with individual timing
   * 2. Schedule attacks based on personality intervals
   * 3. Return attack schedule
   * @param {Array<Object>} shadows - Array of shadows
   * @param {Array<Object>} targets - Array of targets
   * @param {number} baseIntervalMs - Base attack interval
   * @returns {Array<Object>} - Attack schedule with timing
   */
  scheduleIndividualisticAttacks(shadows, targets, baseIntervalMs = 2000) {
    // Guard clause: Return empty array if no shadows or targets
    if (!shadows || shadows.length === 0 || !targets || targets.length === 0) {
      return [];
    }

    const now = Date.now();
    const attackSchedule = [];

    // Process each shadow with individual timing
    shadows.forEach((shadow) => {
      const combatResult = this.processIndividualisticCombat(shadow, targets, baseIntervalMs);

      if (combatResult.target) {
        attackSchedule.push({
          ...combatResult,
          scheduledTime: now + combatResult.attackInterval,
          shadow,
        });
      }
    });

    // Sort by scheduled time (earliest first)
    attackSchedule.sort((a, b) => a.scheduledTime - b.scheduledTime);

    return attackSchedule;
  }

  /**
   * Process combat round with individualistic behavior
   * Operations:
   * 1. Process shadow attacks with individual timing
   * 2. Process mob attacks on shadows
   * 3. Return round results
   * @param {Array<Object>} shadows - Array of shadows
   * @param {Array<Object>} mobs - Array of mobs
   * @param {Object} boss - Boss object (optional)
   * @returns {Object} - Combat round results
   */
  async processCombatRound(shadows, mobs, boss = null) {
    // Guard clause: Return early if no shadows
    if (!shadows || shadows.length === 0) {
      return {
        shadowAttacks: [],
        mobAttacks: [],
        bossAttacks: [],
        totalDamageDealt: 0,
        totalDamageTaken: 0,
      };
    }

    const targets = [];
    if (boss && (boss.hp || 0) > 0) targets.push(boss);
    if (mobs && mobs.length > 0) {
      targets.push(...mobs.filter((m) => (m.hp || 0) > 0));
    }

    // Process shadow attacks (individualistic)
    const shadowAttacks = shadows
      .map((shadow) => this.processIndividualisticCombat(shadow, targets, 2000))
      .filter((attack) => attack.target !== null);

    // Process mob attacks on shadows (mobs target different shadows)
    const mobAttacks = [];
    if (mobs && mobs.length > 0) {
      mobs.forEach((mob) => {
        if ((mob.hp || 0) > 0) {
          const attack = this.processMobAttackOnShadow(mob, shadows);
          if (attack.targetShadow) {
            mobAttacks.push(attack);
          }
        }
      });
    }

    // Calculate totals
    const totalDamageDealt = shadowAttacks.reduce((sum, attack) => sum + attack.damage, 0);
    const totalDamageTaken = mobAttacks.reduce((sum, attack) => sum + attack.damage, 0);

    return {
      shadowAttacks,
      mobAttacks,
      bossAttacks: boss ? [] : [], // Boss attacks can be added later
      totalDamageDealt,
      totalDamageTaken,
      shadowsUsed: shadowAttacks.length,
      mobsActive: mobAttacks.length,
    };
  }

  // ============================================================================
  // 3.10 SHADOW BUFFS & XP SYSTEM
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
   * 1. Initialize buffs object (STR, AGI, INT, VIT, PER all 0)
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
      perception: 0,
    };

    // Get top 7 generals (strongest shadows) - full buffs, no cap
    const generals = await this.getTopGenerals();

    // Use reduce for functional pattern to accumulate general buffs
    generals.reduce((accBuffs, shadow) => {
      const role = this.shadowRoles[shadow.role];
      // Guard clause: Skip if no role or buffs
      if (!role || !role.buffs) return accBuffs;

      // Accumulate buffs using reduce
      Object.keys(role.buffs).reduce((stats, stat) => {
        const amount = role.buffs[stat] * 1.0; // Full buffs for top 7 generals
        stats[stat] = (stats[stat] || 0) + amount;
        return stats;
      }, accBuffs);

      return accBuffs;
    }, buffs);

    // Get user rank for aggregation
    const soloData = this.getSoloLevelingData();
    // Guard clause: Apply caps and return early if no solo data
    if (!soloData) {
      this.applyBuffCaps(buffs);
      this.cachedBuffs = buffs;
      this.cachedBuffsTime = Date.now();
      return buffs;
    }

    const userRank = soloData.rank;
    const userRankIndex = this.shadowRanks.indexOf(userRank);
    const weakRankThreshold = Math.max(0, userRankIndex - 2);

    // Guard clause: Aggregate weak shadows (2+ ranks below) for performance
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

        // Cap aggregated buffs at 0.4 (40%) to leave room for generals
        const cappedAggregatedBuff = Math.min(0.4, baseAggregatedBuff);

        // Use reduce for functional pattern to build aggregated buffs object
        const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
        const aggregatedBuffs = statKeys.reduce((stats, key) => {
          stats[key] = cappedAggregatedBuff;
          return stats;
        }, {});

        // Accumulate aggregated buffs using reduce
        Object.keys(aggregatedBuffs).reduce((accBuffs, stat) => {
          accBuffs[stat] = (accBuffs[stat] || 0) + aggregatedBuffs[stat];
          return accBuffs;
        }, buffs);
      } catch (error) {
        // debugError method is in SECTION 4
        this.debugError('STORAGE', 'Failed to get aggregated power', error);
      }
    } else {
      // Fallback: process non-general shadows from localStorage with diminishing returns
      // (Generals already processed above)
      const generalIds = new Set(generals.map((g) => g.id));
      const allShadows = this.settings.shadows || [];

      // Use filter and reduce for functional pattern
      const nonGeneralShadows = allShadows.filter((shadow) => !generalIds.has(shadow.id));

      // Accumulate non-general shadow buffs using reduce
      const aggregatedNonGeneralBuffs = nonGeneralShadows.reduce(
        (accBuffs, shadow) => {
          const role = this.shadowRoles[shadow.role];
          // Guard clause: Skip if no role or buffs
          if (!role || !role.buffs) return accBuffs;

          // Accumulate buffs per stat
          Object.keys(role.buffs).reduce((stats, stat) => {
            const amount = role.buffs[stat] || 0;
            stats[stat] = (stats[stat] || 0) + amount;
            return stats;
          }, accBuffs);

          return accBuffs;
        },
        {
          strength: 0,
          agility: 0,
          intelligence: 0,
          vitality: 0,
          perception: 0,
        }
      );

      const nonGeneralCount = nonGeneralShadows.length;

      // Guard clause: Apply diminishing returns for non-generals
      // Formula: sqrt(nonGeneralCount / 100) * 0.01
      // This prevents linear scaling
      if (nonGeneralCount > 0) {
        const diminishingFactor = Math.sqrt(nonGeneralCount / 100) * 0.01;
        const cappedFactor = Math.min(0.4, diminishingFactor); // Cap at 40%

        // Apply capped diminishing factor using reduce
        Object.keys(aggregatedNonGeneralBuffs).reduce((accBuffs, stat) => {
          const diminishedBuff = aggregatedNonGeneralBuffs[stat] * cappedFactor;
          accBuffs[stat] = (accBuffs[stat] || 0) + diminishedBuff;
          return accBuffs;
        }, buffs);
      }
    }

    // Guard clause: Ensure perception is set (for compatibility)
    if (buffs.perception == null) {
      buffs.perception = 0;
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
    // Guard clause: Return early if no buffs provided
    if (!buffs) return;

    const maxBuff = 0.5; // Max +50% per stat

    // Use reduce for functional pattern to apply caps
    Object.keys(buffs).reduce((cappedBuffs, stat) => {
      cappedBuffs[stat] = Math.min(maxBuff, buffs[stat] || 0);
      return cappedBuffs;
    }, buffs);
  }

  // ============================================================================
  // 3.11 SHADOW GROWTH & LEVELING SYSTEM
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
   * 3. Otherwise, get top 7 generals (only generals receive XP from messages)
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
    // Guard clause: Return early if invalid baseAmount
    if (baseAmount <= 0) return;

    let shadowsToGrant = [];

    // Guard clause: Grant XP to specific shadows if provided
    if (shadowIds && Array.isArray(shadowIds) && shadowIds.length > 0) {
      const allShadows = await this.getAllShadows();
      shadowsToGrant = allShadows.filter((s) => shadowIds.includes(s.id));
    } else {
      // Default: grant XP to top 7 generals only (from messages)
      shadowsToGrant = await this.getTopGenerals();
    }

    // Guard clause: Return early if no shadows to grant XP to
    if (!shadowsToGrant.length) return;

    const perShadow = baseAmount;

    // Use Promise.all for parallel processing
    await Promise.all(
      shadowsToGrant.map(async (shadow) => {
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
            // debugLog method is in SECTION 4
            this.debugLog(
              'RANK_UP',
              `AUTO RANK-UP: ${shadow.name || 'Shadow'} promoted ${rankUpResult.oldRank} -> ${
                rankUpResult.newRank
              }!`
            );
          }
        }

        // Save updated shadow to IndexedDB
        if (this.storageManager) {
          try {
            await this.storageManager.saveShadow(this.prepareShadowForSave(shadow));
          } catch (error) {
            // debugError method is in SECTION 4
            this.debugError('STORAGE', 'Failed to save shadow XP update', error);
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
      })
    );

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
    // Guard clause: Return minimum XP for invalid level
    if (level < 1) return 25;

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
    // Guard clause: Return zero stats if no shadow provided
    if (!shadow) {
      return {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        perception: 0,
      };
    }

    // HYBRID COMPRESSION: Decompress if needed
    shadow = this.getShadowData(shadow);
    const base = shadow.baseStats || {};
    const growth = shadow.growthStats || {};
    const naturalGrowth = shadow.naturalGrowthStats || {};

    // Use reduce for functional pattern to build effective stats
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    return statKeys.reduce((effective, stat) => {
      effective[stat] = (base[stat] || 0) + (growth[stat] || 0) + (naturalGrowth[stat] || 0);
      return effective;
    }, {});
  }

  // ============================================================================
  // 3.11.1 AUTO RANK-UP SYSTEM - Automatic Shadow Promotion
  // ============================================================================
  /**
   * Attempt automatic rank-up for shadow
   * Called after level-up to check if shadow qualifies for promotion
   * Returns: { success: boolean, oldRank: string, newRank: string }
   */
  attemptAutoRankUp(shadow) {
    // Guard clause: Return early if no shadow or rank
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
    const nextRank = shadowRanks[currentRankIndex + 1];

    // Guard clause: Can't rank up if already max rank
    if (!nextRank) {
      return { success: false };
    }

    // Get shadow's effective stats
    const effectiveStats = this.getShadowEffectiveStats(shadow);

    // Get baseline for next rank
    const nextRankMultiplier = this.rankStatMultipliers[nextRank] || 1.0;
    const baselineForNextRank = this.getRankBaselineStats(nextRank, nextRankMultiplier);

    // Use reduce for functional pattern to calculate average
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const nextBaseline =
      statKeys.reduce((sum, stat) => sum + (baselineForNextRank[stat] || 0), 0) / statKeys.length;
    const avgStats =
      statKeys.reduce((sum, stat) => sum + (effectiveStats[stat] || 0), 0) / statKeys.length;

    // Guard clause: Check if shadow qualifies (80% of next rank's baseline stats)
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
  // 3.12 NATURAL GROWTH SYSTEM
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
        perception: 0,
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

    // Guard clause: Return early if no combat time
    if (combatTimeHours <= 0) return false;

    // Apply role-weighted growth to each stat using reduce
    const stats = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const individualVariance = 0.8 + shadow.growthVarianceSeed * 0.4; // 0.8-1.2

    stats.reduce((naturalGrowth, stat) => {
      const roleWeight = roleWeights[stat] || 1.0;

      // Calculate growth for this stat
      // Strong stats grow MORE naturally, weak stats grow LESS
      const statGrowth = baseGrowthPerHour * combatTimeHours * roleWeight * individualVariance;
      const roundedGrowth = Math.max(0, Math.round(statGrowth));

      naturalGrowth[stat] = (naturalGrowth[stat] || 0) + roundedGrowth;
      return naturalGrowth;
    }, shadow.naturalGrowthStats);

    shadow.totalCombatTime += combatTimeHours;
    shadow.lastNaturalGrowth = Date.now();

    // Recalculate shadow strength with new stats
    const effectiveStats = this.getShadowEffectiveStats(shadow);
    shadow.strength = this.calculateShadowStrength(effectiveStats, 1);

    return true;
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
      shadow.growthStats = { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };
    }

    // Initialize individual variance seed if not exists (unique per shadow)
    if (!shadow.growthVarianceSeed) {
      shadow.growthVarianceSeed = Math.random(); // 0-1, unique per shadow
    }

    const stats = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];

    // Use dictionary pattern for base growth calculation
    const baseGrowthMap = [
      [(w) => w >= 1.5, 5], // VERY HIGH growth for strong stats
      [(w) => w >= 1.2, 4], // HIGH growth
      [(w) => w >= 0.8, 3], // MEDIUM growth
      [(w) => w >= 0.5, 2], // LOW growth
      [(w) => w >= 0.3, 1], // VERY LOW growth
      [() => true, 0.5], // MINIMAL growth (default)
    ];

    const getBaseGrowth = (roleWeight) => {
      const [, growth] = baseGrowthMap.find(([predicate]) => predicate(roleWeight));
      return growth;
    };

    // Individual variance (±20% based on shadow's unique seed)
    // This makes each shadow unique even if same role/rank
    const seedVariance = 0.8 + shadow.growthVarianceSeed * 0.4; // 0.8-1.2

    // Use reduce for functional pattern
    stats.reduce((growthStats, stat) => {
      const roleWeight = roleWeights[stat] || 1.0;
      const baseGrowth = getBaseGrowth(roleWeight);

      // Per-level random variance (±10% per level up)
      const levelVariance = 0.9 + Math.random() * 0.2; // 0.9-1.1

      // Calculate final growth for this level
      const growth = baseGrowth * rankGrowthMultiplier * seedVariance * levelVariance;
      const roundedGrowth = Math.max(1, Math.round(growth));

      // Add growth (NO CAPS - let shadows grow freely!)
      growthStats[stat] = (growthStats[stat] || 0) + roundedGrowth;
      return growthStats;
    }, shadow.growthStats);
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

      // debugLog method is in SECTION 4
      this.debugLog('MIGRATION', 'Fixing shadow base stats to match rank baselines...');

      let allShadows = [];

      // Get shadows from IndexedDB
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, 100000);
          this.debugLog('MIGRATION', `Found ${allShadows.length} shadows to fix`);
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('MIGRATION', 'Error getting shadows from IndexedDB', error);
        }
      }

      // Also get shadows from localStorage as fallback
      if (this.settings.shadows && this.settings.shadows.length > 0) {
        const localStorageShadows = this.settings.shadows.filter(
          (s) => !allShadows.find((dbShadow) => dbShadow.id === s.id)
        );
        allShadows = allShadows.concat(localStorageShadows);
      }

      // Guard clause: Return early if no shadows to fix
      if (allShadows.length === 0) {
        this.debugLog('MIGRATION', 'No shadows to fix');
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

            // Apply role weights to baseline using reduce
            const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
            const newBaseStats = statKeys.reduce((stats, stat) => {
              const roleWeight = roleWeights[stat] || 1.0;
              // Base stat = rank baseline × role weight (with slight variance)
              const variance = 0.9 + Math.random() * 0.2; // 90%-110%
              stats[stat] = Math.max(1, Math.round(rankBaseline[stat] * roleWeight * variance));
              return stats;
            }, {});

            // Preserve ALL progression data
            const existingGrowthStats = shadow.growthStats || {
              strength: 0,
              agility: 0,
              intelligence: 0,
              vitality: 0,
              perception: 0,
            };

            const existingNaturalGrowthStats = shadow.naturalGrowthStats || {
              strength: 0,
              agility: 0,
              intelligence: 0,
              vitality: 0,
              perception: 0,
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
              await this.storageManager.saveShadow(this.prepareShadowForSave(shadow));
            }

            // Also update localStorage if it exists
            const localIndex = (this.settings.shadows || []).findIndex((s) => s.id === shadow.id);
            if (localIndex !== -1) {
              this.settings.shadows[localIndex] = shadow;
            }

            fixed++;
          } catch (error) {
            // debugError method is in SECTION 4
            this.debugError('MIGRATION', `Error fixing shadow ${shadow.id}`, error);
          }
        }

        // Log progress for large batches
        if (allShadows.length > 100) {
          // debugLog method is in SECTION 4
          this.debugLog(
            'MIGRATION',
            `Fixed ${Math.min(i + batchSize, allShadows.length)}/${allShadows.length} shadows...`
          );
        }
      }

      // Save localStorage changes
      this.saveSettings();

      // Mark migration complete
      BdApi.Data.save('ShadowArmy', migrationKey, true);

      // debugLog method is in SECTION 4
      this.debugLog('MIGRATION', `Fixed ${fixed} shadows to proper rank baselines!`);
      this.debugLog('MIGRATION', 'SSS shadows now have SSS-level base stats!');

      // Invalidate buff cache
      this.cachedBuffs = null;
      this.cachedBuffsTime = null;
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('MIGRATION', 'Error in fixShadowBaseStatsToRankBaselines', error);
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

      // debugLog method is in SECTION 4
      this.debugLog('MIGRATION', 'Recalculating all shadows with user stat capping formula...');

      let allShadows = [];

      // Get shadows from IndexedDB
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, 100000);
          this.debugLog('MIGRATION', `Found ${allShadows.length} shadows in IndexedDB`);
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('MIGRATION', 'Error getting shadows from IndexedDB', error);
        }
      }

      // Also get shadows from localStorage as fallback
      if (this.settings.shadows && this.settings.shadows.length > 0) {
        const localStorageShadows = this.settings.shadows.filter(
          (s) => !allShadows.find((dbShadow) => dbShadow.id === s.id)
        );
        allShadows = allShadows.concat(localStorageShadows);
        this.debugLog(
          'MIGRATION',
          `Found ${localStorageShadows.length} additional shadows in localStorage`
        );
      }

      // Guard clause: Return early if no shadows to recalculate
      if (allShadows.length === 0) {
        this.debugLog('MIGRATION', 'No shadows to recalculate');
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
              perception: 0,
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
              perception: 0,
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
                await this.storageManager.saveShadow(this.prepareShadowForSave(shadow));
              } catch (error) {
                // debugError method is in SECTION 4
                this.debugError('MIGRATION', `Failed to save shadow ${shadow.id}`, error);
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
            // debugError method is in SECTION 4
            this.debugError('MIGRATION', `Error recalculating shadow ${shadow.id}`, error);
          }
        }

        // Save progress every batch
        this.saveSettings();
      }

      // Mark migration as complete
      BdApi.Data.save('ShadowArmy', migrationKey, true);
      // debugLog method is in SECTION 4
      this.debugLog(
        'MIGRATION',
        `Recalculated ${recalculated} shadows with new exponential formula`
      );
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('MIGRATION', 'Error recalculating shadows', error);
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
  // 3.13 CSS MANAGEMENT SYSTEM - Dynamic CSS & Theme Integration
  // ============================================================================

  /**
   * CSS Manager - Centralized CSS injection, updates, and theme integration
   * Provides helpers for dynamic CSS, theme detection, and conflict management
   * Used for widget styling, dungeon CSS, and theme-aware styling
   */

  // ============================================================================
  // 3.13.1 CSS INJECTION & REMOVAL
  // ============================================================================

  /**
   * Load font for arise animation (Speedy Space Goat Oddity)
   * Operations:
   * 1. Get font name from settings (defaults to 'Speedy Space Goat Oddity')
   * 2. Check if CriticalHit plugin has already loaded the font
   * 3. If not, try to use CriticalHit's font loading method if available
   * 4. If CriticalHit not available, check if font style element already exists
   * 5. Font will be used by CSS font-family declaration
   */
  loadAriseAnimationFont() {
    const fontName = this.settings?.ariseAnimation?.animationFont || 'Speedy Space Goat Oddity';
    const fontStyleId = `cha-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;

    // Check if font is already loaded (by CriticalHit or previous load)
    if (document.getElementById(fontStyleId)) {
      this.debugLog('FONT_LOADER', 'Font already loaded (likely by CriticalHit plugin)', {
        fontName,
        fontStyleId,
      });
      return true;
    }

    // Try to use CriticalHit's font loading if available
    try {
      const criticalHitPlugin = BdApi.Plugins.get('CriticalHit');
      if (criticalHitPlugin) {
        const instance = criticalHitPlugin.instance || criticalHitPlugin;
        if (instance && typeof instance.loadLocalFont === 'function') {
          const loaded = instance.loadLocalFont(fontName);
          if (loaded) {
            this.debugLog('FONT_LOADER', 'Font loaded via CriticalHit plugin', {
              fontName,
            });
            return true;
          }
        }
      }
    } catch (error) {
      this.debugLog('FONT_LOADER', 'Could not use CriticalHit font loading', {
        fontName,
        error: error?.message,
        note: 'Font may still work if CriticalHit has it loaded',
      });
    }

    // Font not loaded yet - it may be loaded by CriticalHit later
    // CSS will use fallback font until then
    this.debugLog('FONT_LOADER', 'Font not yet loaded, will use fallback until available', {
      fontName,
      note: 'If CriticalHit plugin is enabled, it will load this font automatically',
    });
    return false;
  }

  injectCSS() {
    const styleId = 'shadow-army-styles';
    // Use new CSS management system for tracking
    if (!this._injectedStyles) {
      this._injectedStyles = new Set();
    }
    const cssContent = `
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
        font-family: 'Speedy Space Goat Oddity', sans-serif !important;
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

      /* ARISE Animation CSS (merged from ShadowAriseAnimation plugin) */
      .sa-animation-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999999;
      }

      .sa-arise-wrapper {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        animation: sa-arise-float var(--sa-duration, 2.5s) ease-out forwards;
      }

      .sa-arise-text {
        font-family: '${
          this.settings?.ariseAnimation?.animationFont || 'Speedy Space Goat Oddity'
        }', system-ui, sans-serif;
        font-weight: 700;
        font-size: 42px;
        letter-spacing: 0.12em;
        text-transform: none; /* Preserve "ARiSe" casing */
        background: linear-gradient(135deg, #020617 0%, #0f172a 35%, #1d4ed8 70%, #38bdf8 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-shadow:
          0 0 10px rgba(15, 23, 42, 0.95),
          0 0 18px rgba(37, 99, 235, 0.95),
          0 0 26px rgba(56, 189, 248, 0.75);
        animation: sa-arise-glow 0.7s ease-in-out infinite alternate;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }

      .sa-arise-text .sa-small-r {
        font-size: 0.9em !important; /* Make R 10% smaller */
        display: inline-block !important;
      }

      .sa-arise-meta {
        margin-top: 6px;
        font-size: 14px;
        color: #e5e7eb;
        text-shadow: 0 0 8px rgba(15, 23, 42, 0.8);
        opacity: 0.9;
      }

      .sa-arise-particle {
        position: absolute;
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: radial-gradient(circle, #38bdf8 0%, rgba(15, 23, 42, 0) 70%);
        animation: sa-arise-particle-fade var(--sa-duration, 2.5s) ease-out forwards;
      }

      @keyframes sa-arise-float {
        0% {
          opacity: 0;
          transform: translate(-50%, -40%) scale(calc(0.6 * var(--sa-scale, 1)));
        }
        15% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(calc(1.1 * var(--sa-scale, 1)));
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -70%) scale(calc(0.9 * var(--sa-scale, 1)));
        }
      }

      @keyframes sa-arise-glow {
        from {
          filter:
            drop-shadow(0 0 10px rgba(15, 23, 42, 1))
            drop-shadow(0 0 18px rgba(37, 99, 235, 0.9));
        }
        to {
          filter:
            drop-shadow(0 0 16px rgba(30, 64, 175, 1))
            drop-shadow(0 0 30px rgba(56, 189, 248, 0.95));
        }
      }

      @keyframes sa-arise-particle-fade {
        0% {
          opacity: 1;
          transform: translate(0, 0) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(var(--sa-particle-x, 0px), var(--sa-particle-y, -140px)) scale(0);
        }
      }

      .shadow-army-settings {
        padding: 10px;
        color: #d4a5ff;
        max-width: 600px;
        width: 100%;
        box-sizing: border-box;
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
        max-width: 100%;
        overflow: hidden;
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
        min-width: 0;
        overflow: hidden;
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
        max-width: 100%;
        overflow: hidden;
      }

      .shadow-list-meta span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
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

    // Use BdApi.DOM for persistent CSS injection (v1.8.0+)
    try {
      BdApi.DOM.addStyle(styleId, cssContent);
    } catch (error) {
      // Fallback to manual injection if BdApi.DOM is unavailable
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = cssContent;
      document.head.appendChild(style);
      this.debugError('CSS', 'BdApi.DOM.addStyle failed, using fallback for main CSS', error);
    }
  }

  /**
   * Remove injected CSS styles using BdApi.DOM (v1.8.0+)
   */
  removeCSS() {
    const styleId = 'shadow-army-styles';
    // Use new CSS management system
    this.removeCSSById(styleId);
  }

  // ============================================================================
  // ============================================================================
  // 3.13.3 ARISE ANIMATION SYSTEM (Merged from ShadowAriseAnimation plugin)
  // ============================================================================

  /**
   * Initialize ARISE animation system
   * Operations:
   * 1. Initialize webpack modules for Discord integration
   * 2. Attempt React injection for stable container
   * 3. Create fallback DOM container if React injection fails
   */
  initializeAriseAnimationSystem() {
    if (!this.settings?.ariseAnimation?.enabled) {
      this.debugLog('ARISE_ANIMATION', 'ARISE animation disabled in settings');
      return;
    }

    // Initialize webpack modules for better Discord integration
    this.initializeWebpackModules();

    // Attempt React injection for animation container (more stable)
    if (this.webpackModuleAccess) {
      this.tryReactInjection();
    }

    // Ensure container exists (fallback to DOM if React injection not available)
    this.getContainer();
  }

  /**
   * Cleanup ARISE animation system
   * Operations:
   * 1. Cleanup webpack patches and React injection
   * 2. Remove all active animations from DOM
   * 3. Clear webpack module references
   */
  cleanupAriseAnimationSystem() {
    // Cleanup webpack patches and React injection
    if (this.reactInjectionActive) {
      try {
        BdApi.Patcher.unpatchAll('ShadowArmy-AriseAnimation');
        this.reactInjectionActive = false;
        this.debugLog('ARISE_ANIMATION', 'Webpack patches and React injection removed');
      } catch (error) {
        this.debugError('ARISE_ANIMATION', 'Error during cleanup', error);
      }
    }

    // Clear webpack module references
    this.webpackModules = {
      UserStore: null,
      ChannelStore: null,
    };
    this.webpackModuleAccess = false;

    // Remove all animations
    this.removeAllAnimations();
  }

  /**
   * Initialize Webpack modules for better Discord integration
   * Operations:
   * 1. Fetch UserStore and ChannelStore via BdApi.Webpack
   * 2. Set webpackModuleAccess flag
   * 3. Attempt React injection if modules available
   */
  initializeWebpackModules() {
    try {
      // Fetch UserStore and ChannelStore
      this.webpackModules.UserStore = BdApi.Webpack.getModule((m) => m && m.getCurrentUser);
      this.webpackModules.ChannelStore = BdApi.Webpack.getModule(
        (m) => m && m.getChannel && m.getChannelId
      );

      this.webpackModuleAccess = !!(
        this.webpackModules.UserStore && this.webpackModules.ChannelStore
      );

      this.debugLog('ARISE_ANIMATION', 'Webpack module access initialized', {
        hasUserStore: !!this.webpackModules.UserStore,
        hasChannelStore: !!this.webpackModules.ChannelStore,
        access: this.webpackModuleAccess,
      });
    } catch (error) {
      this.debugError('ARISE_ANIMATION', 'Webpack initialization error', error);
      this.webpackModuleAccess = false;
    }
  }

  /**
   * Attempt to inject animation container into Discord's React tree
   * Operations:
   * 1. Find MainContent component via webpack
   * 2. Patch component to inject animation container
   * 3. Use BdApi.Utils.findInTree to locate injection point
   * 4. Create React element for container
   * 5. Set reactInjectionActive flag if successful
   */
  tryReactInjection() {
    try {
      // Find MainContent component (Discord's main app container)
      let MainContent = BdApi.Webpack.getByStrings('baseLayer', {
        searchExports: true,
      });

      if (!MainContent) {
        MainContent = BdApi.Webpack.getByStrings('appMount', {
          searchExports: true,
        });
      }

      if (!MainContent) {
        this.debugLog('ARISE_ANIMATION', 'MainContent component not found, using DOM fallback');
        return;
      }

      const React = BdApi.React;
      const pluginInstance = this;

      // Patch MainContent to inject animation container
      BdApi.Patcher.after(
        'ShadowArmy-AriseAnimation',
        MainContent,
        'Z',
        (thisObject, args, returnValue) => {
          try {
            // Find body element in React tree
            const bodyPath = BdApi.Utils.findInTree(
              returnValue,
              (node) => node && node.props && node.props.children && node.props.className
            );

            if (!bodyPath || !bodyPath.props || !bodyPath.props.children) {
              return;
            }

            // Check if container already exists
            const hasContainer = BdApi.Utils.findInTree(
              bodyPath.props.children,
              (node) => node && node.props && node.props.className === 'sa-animation-container'
            );

            if (hasContainer) {
              return; // Container already injected
            }

            // Create React element for animation container
            const containerElement = React.createElement('div', {
              className: 'sa-animation-container',
              key: 'sa-animation-container',
            });

            // Inject into React tree
            if (Array.isArray(bodyPath.props.children)) {
              bodyPath.props.children.push(containerElement);
            } else {
              bodyPath.props.children = [bodyPath.props.children, containerElement];
            }

            // Set DOM reference after a short delay (React needs to render first)
            setTimeout(() => {
              const domContainer = document.querySelector('.sa-animation-container');
              if (domContainer) {
                pluginInstance.animationContainer = domContainer;
                pluginInstance.debugLog(
                  'ARISE_ANIMATION',
                  'Animation container injected successfully'
                );
              }
            }, 100);
          } catch (error) {
            pluginInstance.debugError('ARISE_ANIMATION', 'React injection error', error);
          }
        }
      );

      this.reactInjectionActive = true;
      this.debugLog('ARISE_ANIMATION', 'React injection setup complete');
    } catch (error) {
      this.debugError('ARISE_ANIMATION', 'React injection setup error', error);
      // Fallback to DOM-based injection
      this.createContainerDOM();
    }
  }

  /**
   * Get or create animation container element
   * Operations:
   * 1. Check if container already exists
   * 2. Try React injection first (if available)
   * 3. Fallback to DOM-based creation if React injection fails
   * 4. Store reference for later use
   * 5. Return container element
   */
  getContainer() {
    if (this.animationContainer) {
      return this.animationContainer;
    }

    // Try React injection first (if not already attempted)
    if (this.webpackModuleAccess && !this.reactInjectionActive) {
      this.tryReactInjection();
      // Wait a bit for React injection to complete
      setTimeout(() => {
        if (!this.animationContainer) {
          // React injection failed, use DOM fallback
          this.createContainerDOM();
        }
      }, 200);
      return this.animationContainer;
    }

    // DOM fallback
    this.createContainerDOM();
    return this.animationContainer;
  }

  /**
   * Create animation container using DOM (fallback method)
   */
  createContainerDOM() {
    const container = document.createElement('div');
    container.className = 'sa-animation-container';
    document.body.appendChild(container);
    this.animationContainer = container;
    this.debugLog('ARISE_ANIMATION', 'Created animation container via DOM fallback');
  }

  /**
   * Remove all animations and clean up container
   * Operations:
   * 1. Check if container exists and has parent
   * 2. Remove container from DOM
   * 3. Clear reference to null
   */
  removeAllAnimations() {
    // FUNCTIONAL: Short-circuit cleanup (no if-else)
    this.animationContainer?.parentNode &&
      (this.animationContainer.parentNode.removeChild(this.animationContainer),
      (this.animationContainer = null));
  }

  /**
   * Trigger ARISE animation for a given shadow (merged from ShadowAriseAnimation plugin)
   * Public API used by showExtractionAnimation
   * Operations:
   * 1. Check if animation is enabled
   * 2. Validate document exists (SSR safety)
   * 3. Get animation container
   * 4. Create wrapper element with animation class
   * 5. Set CSS custom properties (duration, scale)
   * 6. Create "ARiSe" text element with gradient styling
   * 7. Optionally create meta element with rank and role
   * 8. Spawn particle effects (22 particles with random positions)
   * 9. Append wrapper to container
   * 10. Schedule removal after animation duration
   */
  triggerArise(shadow) {
    // Guard clauses (early returns)
    if (!this.settings?.ariseAnimation?.enabled) return;
    if (typeof document === 'undefined') return;

    const container = this.getContainer();
    const ariseSettings = this.settings.ariseAnimation;
    const durationMs = ariseSettings.animationDuration || 2500;

    const wrapper = document.createElement('div');
    wrapper.className = 'sa-arise-wrapper';
    wrapper.style.setProperty('--sa-duration', `${durationMs}ms`);
    const scale = ariseSettings.scale || 1;
    wrapper.style.setProperty('--sa-scale', String(scale));

    const title = document.createElement('div');
    title.className = 'sa-arise-text';
    // Text should be "ARiSe" (capital A, R, i, S, e) with R slightly smaller
    title.innerHTML = 'A<span class="sa-small-r">R</span>iSe';
    wrapper.appendChild(title);

    // FUNCTIONAL: Short-circuit for conditional rendering (no if-else)
    ariseSettings.showRankAndRole &&
      shadow &&
      (() => {
        const meta = document.createElement('div');
        meta.className = 'sa-arise-meta';
        const rankText = shadow.rank ? `${shadow.rank}-Rank` : '';
        const roleText = shadow.roleName || shadow.role || '';
        meta.textContent = [rankText, roleText].filter(Boolean).join(' • ');
        wrapper.appendChild(meta);
      })();

    // FUNCTIONAL: Spawn particles using Array.from (no for-loop)
    const particleCount = 22;
    Array.from({ length: particleCount }, () => {
      const p = document.createElement('div');
      p.className = 'sa-arise-particle';
      const angle = Math.random() * Math.PI * 2;
      const radius = 40 + Math.random() * 80;
      const dx = Math.cos(angle) * radius;
      const dy = -Math.abs(Math.sin(angle) * radius);
      p.style.setProperty('--sa-particle-x', `${dx}px`);
      p.style.setProperty('--sa-particle-y', `${dy}px`);
      p.style.left = '50%';
      p.style.top = '50%';
      wrapper.appendChild(p);
      return p;
    });

    container.appendChild(wrapper);

    setTimeout(() => {
      wrapper.remove();
    }, durationMs + 200);
  }

  // 3.13.2 CSS MANAGEMENT HELPERS - Theme Integration & Advanced Features
  // ============================================================================

  /**
   * Inject or update CSS with automatic theme variable integration
   * Operations:
   * 1. Check if style already exists
   * 2. Detect active theme and extract CSS variables
   * 3. Merge CSS with theme variables
   * 4. Inject or update style element
   * 5. Track injected styles for cleanup
   * @param {string} styleId - Unique identifier for the style
   * @param {string} cssContent - CSS content (can include CSS variable placeholders)
   * @param {Object} options - Options for CSS injection
   * @param {boolean} options.forceUpdate - Force update even if style exists (default: false)
   * @param {boolean} options.useThemeVars - Auto-detect and inject theme variables (default: true)
   * @param {number} options.priority - CSS priority (higher = more important, default: 100)
   * @returns {boolean} - Success status
   */
  injectOrUpdateCSS(styleId, cssContent, options = {}) {
    const { forceUpdate = false, useThemeVars = true, priority = 100 } = options;

    // Guard clause: Validate inputs
    if (!styleId || !cssContent) {
      this.debugError('CSS', 'Invalid CSS injection parameters', {
        styleId,
        hasContent: !!cssContent,
      });
      return false;
    }

    try {
      // Check if style already exists
      const existingStyle = document.getElementById(styleId);
      if (existingStyle && !forceUpdate) {
        this.debugLog('CSS', `Style ${styleId} already exists, skipping injection`);
        return true;
      }

      // Merge with theme variables if enabled
      let finalCSS = cssContent;
      if (useThemeVars) {
        finalCSS = this.mergeCSSWithThemeVars(cssContent);
      }

      // Add priority marker for conflict resolution
      const priorityCSS = `/* Priority: ${priority} */\n${finalCSS}`;

      // Use BdApi.DOM for persistent injection (preferred method)
      if (BdApi && BdApi.DOM && BdApi.DOM.addStyle) {
        try {
          BdApi.DOM.addStyle(styleId, priorityCSS);
        } catch (error) {
          this.debugError('CSS', `BdApi.DOM.addStyle failed for ${styleId}, using fallback`, error);
          // Fallback to manual injection
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = priorityCSS;
          style.setAttribute('data-priority', priority);
          document.head.appendChild(style);
        }
      } else {
        // Fallback to manual injection
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = priorityCSS;
        style.setAttribute('data-priority', priority);
        document.head.appendChild(style);
      }

      // Track injected styles for cleanup
      if (!this._injectedStyles) {
        this._injectedStyles = new Set();
      }
      this._injectedStyles.add(styleId);

      this.debugLog('CSS', `CSS injected/updated: ${styleId}`, { priority, useThemeVars });
      return true;
    } catch (error) {
      this.debugError('CSS', `Failed to inject CSS: ${styleId}`, error);
      return false;
    }
  }

  /**
   * Remove CSS by style ID
   * Operations:
   * 1. Try BdApi.DOM.removeStyle first
   * 2. Fallback to manual removal
   * 3. Remove from tracking set
   * @param {string} styleId - Style identifier to remove
   * @returns {boolean} - Success status
   */
  removeCSSById(styleId) {
    // Guard clause: Validate input
    if (!styleId) {
      this.debugError('CSS', 'Invalid CSS removal: missing styleId');
      return false;
    }

    try {
      // Try BdApi.DOM first (preferred method)
      if (BdApi && BdApi.DOM && BdApi.DOM.removeStyle) {
        try {
          BdApi.DOM.removeStyle(styleId);
        } catch (error) {
          this.debugError(
            'CSS',
            `BdApi.DOM.removeStyle failed for ${styleId}, using fallback`,
            error
          );
          // Fallback to manual removal
          const style = document.getElementById(styleId);
          if (style && style.parentNode) {
            style.parentNode.removeChild(style);
          }
        }
      } else {
        // Fallback to manual removal
        const style = document.getElementById(styleId);
        if (style && style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }

      // Remove from tracking
      if (this._injectedStyles) {
        this._injectedStyles.delete(styleId);
      }

      this.debugLog('CSS', `CSS removed: ${styleId}`);
      return true;
    } catch (error) {
      this.debugError('CSS', `Failed to remove CSS: ${styleId}`, error);
      return false;
    }
  }

  /**
   * Detect active theme and extract CSS variables
   * Operations:
   * 1. Check for theme meta tags
   * 2. Extract CSS variables from :root
   * 3. Return theme variables object
   * @returns {Object} - Theme variables object
   */
  detectThemeVariables() {
    try {
      const root = document.documentElement;
      const computedStyle = window.getComputedStyle(root);
      const themeVars = {};

      // Common Discord/BetterDiscord CSS variables
      const commonVars = [
        '--background-primary',
        '--background-secondary',
        '--background-tertiary',
        '--background-accent',
        '--text-normal',
        '--text-muted',
        '--text-link',
        '--interactive-normal',
        '--interactive-hover',
        '--interactive-active',
        '--brand-experiment',
        '--header-primary',
        '--header-secondary',
      ];

      // Extract variables
      commonVars.forEach((varName) => {
        const value = computedStyle.getPropertyValue(varName).trim();
        if (value) {
          themeVars[varName] = value;
        }
      });

      // Check for theme name in meta or class
      const themeMeta = document.querySelector('meta[name="theme"]');
      const themeName = themeMeta?.content || root.getAttribute('data-theme') || 'default';

      return {
        name: themeName,
        variables: themeVars,
        hasVariables: Object.keys(themeVars).length > 0,
      };
    } catch (error) {
      this.debugError('CSS', 'Failed to detect theme variables', error);
      return { name: 'default', variables: {}, hasVariables: false };
    }
  }

  /**
   * Merge CSS content with theme variables
   * Replaces CSS variable placeholders with actual theme values
   * Operations:
   * 1. Detect theme variables
   * 2. Replace placeholders in CSS
   * 3. Add fallback values
   * @param {string} cssContent - CSS content with variable placeholders
   * @returns {string} - CSS with theme variables merged
   */
  mergeCSSWithThemeVars(cssContent) {
    const theme = this.detectThemeVariables();

    // Guard clause: Return original if no theme variables
    if (!theme.hasVariables) {
      return cssContent;
    }

    // Create variable map with fallbacks
    const varMap = {
      '--bg-primary': theme.variables['--background-primary'] || 'rgba(32, 34, 37, 1)',
      '--bg-secondary': theme.variables['--background-secondary'] || 'rgba(24, 25, 28, 1)',
      '--bg-tertiary': theme.variables['--background-tertiary'] || 'rgba(18, 19, 22, 1)',
      '--text-normal': theme.variables['--text-normal'] || 'rgba(220, 221, 222, 1)',
      '--text-muted': theme.variables['--text-muted'] || 'rgba(142, 146, 151, 1)',
      '--brand-color': theme.variables['--brand-experiment'] || 'rgba(88, 101, 242, 1)',
      '--interactive-normal': theme.variables['--interactive-normal'] || 'rgba(185, 187, 190, 1)',
      '--interactive-hover': theme.variables['--interactive-hover'] || 'rgba(220, 221, 222, 1)',
    };

    // Replace placeholders in CSS
    let mergedCSS = cssContent;
    Object.entries(varMap).forEach(([placeholder, value]) => {
      const regex = new RegExp(`\\$\\{${placeholder}\\}`, 'g');
      mergedCSS = mergedCSS.replace(regex, value);
    });

    // Inject theme variables as CSS custom properties if not already present
    if (!mergedCSS.includes(':root') && theme.hasVariables) {
      const themeVarsCSS = `:root {\n  ${Object.entries(varMap)
        .map(([key, value]) => `${key}: ${value};`)
        .join('\n  ')}\n}\n\n`;
      mergedCSS = themeVarsCSS + mergedCSS;
    }

    return mergedCSS;
  }

  /**
   * Update CSS dynamically (for runtime theme changes)
   * Operations:
   * 1. Find existing style element
   * 2. Update content with new theme variables
   * 3. Trigger reflow for immediate update
   * @param {string} styleId - Style identifier
   * @param {string} cssContent - New CSS content
   * @returns {boolean} - Success status
   */
  updateCSS(styleId, cssContent) {
    return this.injectOrUpdateCSS(styleId, cssContent, { forceUpdate: true, useThemeVars: true });
  }

  /**
   * Get CSS template with theme variable placeholders
   * Helper for creating CSS templates that auto-adapt to themes
   * @param {string} baseCSS - Base CSS with ${variable} placeholders
   * @returns {string} - CSS ready for injection
   */
  getCSSTemplate(baseCSS) {
    return this.mergeCSSWithThemeVars(baseCSS);
  }

  /**
   * Check for CSS conflicts (duplicate selectors)
   * Operations:
   * 1. Parse CSS selectors
   * 2. Check for conflicts with existing styles
   * 3. Return conflict report
   * @param {string} cssContent - CSS to check
   * @returns {Object} - Conflict report
   */
  checkCSSConflicts(cssContent) {
    try {
      // Simple selector extraction (basic implementation)
      const selectorRegex = /([^{]+)\{/g;
      const selectors = [];
      let match;

      while ((match = selectorRegex.exec(cssContent)) !== null) {
        const selector = match[1].trim();
        if (selector && !selector.startsWith('@')) {
          selectors.push(selector);
        }
      }

      // Check for conflicts in existing styles
      const conflicts = [];
      if (this._injectedStyles) {
        this._injectedStyles.forEach((styleId) => {
          const style = document.getElementById(styleId);
          if (style && style.textContent) {
            selectors.forEach((selector) => {
              if (style.textContent.includes(selector)) {
                conflicts.push({ selector, conflictingStyle: styleId });
              }
            });
          }
        });
      }

      return {
        hasConflicts: conflicts.length > 0,
        conflicts,
        selectors: selectors.length,
      };
    } catch (error) {
      this.debugError('CSS', 'Failed to check CSS conflicts', error);
      return { hasConflicts: false, conflicts: [], selectors: 0 };
    }
  }

  /**
   * Cleanup all injected CSS styles
   * Operations:
   * 1. Iterate through tracked styles
   * 2. Remove each style
   * 3. Clear tracking set
   */
  cleanupAllCSS() {
    if (!this._injectedStyles) return;

    this._injectedStyles.forEach((styleId) => {
      this.removeCSSById(styleId);
    });

    this._injectedStyles.clear();
    this.debugLog('CSS', 'All injected CSS cleaned up');
  }

  /**
   * Get list of all injected CSS styles
   * @returns {Array<string>} - Array of style IDs
   */
  getInjectedStyles() {
    return this._injectedStyles ? Array.from(this._injectedStyles) : [];
  }

  /**
   * Generate dungeon CSS template with theme integration
   * Helper for creating dungeon-specific CSS that adapts to themes
   * Operations:
   * 1. Generate base dungeon CSS with theme variable placeholders
   * 2. Merge with detected theme variables
   * 3. Return ready-to-inject CSS
   * @param {Object} options - Dungeon CSS options
   * @param {string} options.biome - Biome name for biome-specific styling
   * @param {boolean} options.darkMode - Force dark mode (default: auto-detect)
   * @param {Object} options.customColors - Custom color overrides
   * @returns {string} - Complete CSS ready for injection
   */
  generateDungeonCSSTemplate(options = {}) {
    const { biome = 'default', customColors = {} } = options;

    // Base dungeon CSS with theme variable placeholders
    // Note: CSS variables use ${VAR} syntax which will be replaced by mergeCSSWithThemeVars
    const bgSecondary = customColors.background || 'var(--bg-secondary)';
    const brandColor = customColors.border || customColors.bossBorder || 'var(--brand-color)';
    const textNormal = customColors.text || customColors.title || 'var(--text-normal)';
    const textMuted = customColors.muted || 'var(--text-muted)';
    const bgTertiary = customColors.mobBg || 'var(--bg-tertiary)';
    const interactiveNormal = customColors.mobBorder || 'var(--interactive-normal)';
    const interactiveHover =
      customColors.mobHover || customColors.buttonHover || 'var(--interactive-hover)';
    const buttonBg = customColors.buttonBg || 'var(--brand-color)';

    const baseDungeonCSS = `
      /* Dungeon UI Styles - Biome: ${biome} */
      .dungeon-container {
        background: ${bgSecondary};
        border: 2px solid ${brandColor};
        border-radius: 8px;
        padding: 16px;
        margin: 12px 0;
        color: ${textNormal};
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }

      .dungeon-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid ${brandColor}40;
      }

      .dungeon-title {
        font-size: 18px;
        font-weight: bold;
        color: ${textNormal};
      }

      .dungeon-biome {
        font-size: 12px;
        color: ${textMuted};
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .dungeon-hp-bar {
        width: 100%;
        height: 24px;
        background: ${customColors.hpBg || 'rgba(0, 0, 0, 0.3)'};
        border-radius: 4px;
        overflow: hidden;
        margin: 8px 0;
        border: 1px solid ${brandColor}40;
      }

      .dungeon-hp-fill {
        height: 100%;
        background: linear-gradient(90deg,
          ${customColors.hpStart || '#ef4444'},
          ${customColors.hpEnd || '#f59e0b'}
        );
        transition: width 0.3s ease;
        box-shadow: 0 0 8px ${customColors.hpGlow || 'rgba(239, 68, 68, 0.5)'};
      }

      .dungeon-mob-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 8px;
        margin-top: 12px;
        max-height: 300px;
        overflow-y: auto;
      }

      .dungeon-mob-item {
        background: ${bgTertiary};
        border: 1px solid ${interactiveNormal}40;
        border-radius: 6px;
        padding: 8px;
        text-align: center;
        transition: all 0.2s ease;
      }

      .dungeon-mob-item:hover {
        border-color: ${interactiveHover};
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      }

      .dungeon-boss-container {
        background: linear-gradient(135deg,
          ${customColors.bossBgStart || 'rgba(139, 92, 246, 0.2)'},
          ${customColors.bossBgEnd || 'rgba(168, 85, 247, 0.1)'}
        );
        border: 2px solid ${customColors.bossBorder || '#8b5cf6'};
        border-radius: 12px;
        padding: 20px;
        margin: 16px 0;
        box-shadow: 0 0 20px ${customColors.bossGlow || 'rgba(139, 92, 246, 0.3)'};
      }

      .dungeon-button {
        background: ${buttonBg};
        color: ${customColors.buttonText || '#ffffff'};
        border: none;
        border-radius: 4px;
        padding: 8px 16px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s ease;
      }

      .dungeon-button:hover {
        background: ${interactiveHover};
        transform: scale(1.05);
      }

      .dungeon-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      /* Responsive design */
      @media (max-width: 768px) {
        .dungeon-mob-list {
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        }

        .dungeon-container {
          padding: 12px;
        }
      }

      /* Animation for dungeon events */
      @keyframes dungeonPulse {
        0%, 100% {
          box-shadow: 0 0 20px ${customColors.pulseGlow || 'rgba(139, 92, 246, 0.3)'};
        }
        50% {
          box-shadow: 0 0 30px ${customColors.pulseGlow || 'rgba(139, 92, 246, 0.6)'};
        }
      }

      .dungeon-pulse {
        animation: dungeonPulse 2s ease-in-out infinite;
      }
    `;

    // Merge with theme variables
    return this.mergeCSSWithThemeVars(baseDungeonCSS);
  }

  /**
   * Inject dungeon CSS with automatic theme integration
   * Convenience method for dungeon CSS injection
   * @param {Object} options - Dungeon CSS options (same as generateDungeonCSSTemplate)
   * @returns {boolean} - Success status
   */
  injectDungeonCSS(options = {}) {
    const styleId = 'shadow-army-dungeon-styles';
    const cssContent = this.generateDungeonCSSTemplate(options);
    return this.injectOrUpdateCSS(styleId, cssContent, {
      forceUpdate: true,
      useThemeVars: true,
      priority: 200, // Higher priority for dungeon CSS
    });
  }

  /**
   * Remove dungeon CSS
   * @returns {boolean} - Success status
   */
  removeDungeonCSS() {
    return this.removeCSSById('shadow-army-dungeon-styles');
  }

  // ============================================================================
  // 3.15 HYBRID COMPRESSION SYSTEM - Top 100 Full, Rest Compressed
  // ============================================================================

  /**
   * Compress shadow data (80% memory reduction per shadow)
   * Used for non-elite shadows (beyond top 100)
   *
   * Full format (500 bytes):
   * { id, rank, role, level, xp, baseStats: {...}, growthStats: {...}, ... }
   *
   * Compressed format (100 bytes):
   * { _c: 1, i, r, ro, l, x, b: [5 nums], g: [5 nums], n: [5 nums], c, e, s }
   */
  compressShadow(shadow) {
    // Guard clause: Return null if no shadow or no ID
    if (!shadow || !shadow.id) return null;

    return {
      _c: 1, // Compression marker
      i: shadow.id.slice(-12), // Last 12 chars of ID (still unique)
      r: shadow.rank,
      ro: shadow.role,
      l: shadow.level || 1,
      x: shadow.xp || 0,
      b: [
        shadow.baseStats?.strength || 0,
        shadow.baseStats?.agility || 0,
        shadow.baseStats?.intelligence || 0,
        shadow.baseStats?.vitality || 0,
        shadow.baseStats?.perception || 0,
      ],
      g: [
        shadow.growthStats?.strength || 0,
        shadow.growthStats?.agility || 0,
        shadow.growthStats?.intelligence || 0,
        shadow.growthStats?.vitality || 0,
        shadow.growthStats?.perception || 0,
      ],
      n: [
        shadow.naturalGrowthStats?.strength || 0,
        shadow.naturalGrowthStats?.agility || 0,
        shadow.naturalGrowthStats?.intelligence || 0,
        shadow.naturalGrowthStats?.vitality || 0,
        shadow.naturalGrowthStats?.perception || 0,
      ],
      c: Math.round((shadow.totalCombatTime || 0) * 10) / 10,
      e: shadow.extractedAt,
      s: Math.round((shadow.growthVarianceSeed || Math.random()) * 100) / 100,
    };
  }

  /**
   * Ultra-compress shadow data (95% memory reduction)
   * Used for shadows beyond top 1,000 (cold data)
   *
   * Format: { _c: 2, i, r, p, l, e, s }
   * - i: Last 8 chars of ID (still unique)
   * - r: Rank (single char)
   * - p: Power (strength / 100, scaled)
   * - l: Level (1-2000)
   * - e: Days since epoch (extractedAt / 86400000)
   * - s: Total stats sum / 100 (scaled)
   */
  compressShadowUltra(shadow) {
    // Guard clause: Return null if no shadow or no ID
    if (!shadow || !shadow.id) return null;

    // Get effective stats for accurate compression
    const effectiveStats = this.getShadowEffectiveStats(shadow);
    // Use reduce for functional pattern to calculate total stats
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const totalStats = statKeys.reduce((sum, stat) => sum + (effectiveStats[stat] || 0), 0);

    return {
      _c: 2, // Ultra-compression marker
      i: shadow.id.slice(-8), // Last 8 chars (still unique)
      r: shadow.rank || 'E',
      p: Math.floor((shadow.strength || 0) / 100), // Power (scaled)
      l: shadow.level || 1,
      e: Math.floor((shadow.extractedAt || Date.now()) / 86400000), // Days since epoch
      s: Math.floor(totalStats / 100), // Total stats (scaled)
    };
  }

  /**
   * Decompress ultra-compressed shadow back to usable format
   * Note: Some data is approximated (stats are reconstructed)
   */
  decompressShadowUltra(compressed) {
    // Guard clause: Return as-is if already decompressed or invalid
    if (!compressed || compressed._c !== 2) {
      return compressed;
    }

    // Reconstruct shadow with approximated stats
    const baseStat = Math.floor(compressed.s * 20); // Approximate per stat
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];

    // Use reduce for functional pattern to build stats objects
    const baseStats = statKeys.reduce((stats, stat) => {
      stats[stat] = baseStat;
      return stats;
    }, {});

    const zeroStats = statKeys.reduce((stats, stat) => {
      stats[stat] = 0;
      return stats;
    }, {});

    return {
      id: `shadow_ultra_${compressed.i}`,
      rank: compressed.r,
      role: 'unknown', // Not stored in ultra-compressed
      roleName: 'Unknown',
      level: compressed.l,
      xp: 0, // Not stored
      strength: compressed.p * 100, // Reconstruct power
      baseStats,
      growthStats: zeroStats,
      naturalGrowthStats: zeroStats,
      totalCombatTime: 0, // Not stored
      extractedAt: compressed.e * 86400000, // Reconstruct timestamp
      growthVarianceSeed: 0, // Not stored
      ownerLevelAtExtraction: 1,
      lastNaturalGrowth: compressed.e * 86400000,
      _ultraCompressed: true, // Mark as decompressed from ultra
    };
  }

  /**
   * Decompress shadow data back to full format
   */
  decompressShadow(compressed) {
    // Guard clause: Return as-is if already decompressed or invalid
    if (!compressed || !compressed._c) {
      return compressed;
    }

    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];

    // Use reduce for functional pattern to build stats objects (index directly from reduce)
    const baseStats = statKeys.reduce((stats, stat, index) => {
      stats[stat] = compressed.b[index] || 0;
      return stats;
    }, {});

    const growthStats = statKeys.reduce((stats, stat, index) => {
      stats[stat] = compressed.g[index] || 0;
      return stats;
    }, {});

    const naturalGrowthStats = statKeys.reduce((stats, stat, index) => {
      stats[stat] = compressed.n[index] || 0;
      return stats;
    }, {});

    return {
      id: `shadow_compressed_${compressed.i}`,
      rank: compressed.r,
      role: compressed.ro,
      roleName: this.shadowRoles[compressed.ro]?.name || compressed.ro,
      level: compressed.l,
      xp: compressed.x,
      baseStats,
      growthStats,
      naturalGrowthStats,
      totalCombatTime: compressed.c,
      extractedAt: compressed.e,
      growthVarianceSeed: compressed.s,
      ownerLevelAtExtraction: 1, // Not tracked for compressed
      lastNaturalGrowth: compressed.e,
      strength: 0, // Will be calculated
      _compressed: true, // Mark as decompressed
    };
  }

  /**
   * Process shadow compression - compress weak shadows to save memory
   * Runs periodically (every hour) alongside natural growth
   *
   * Hybrid System:
   * - Top 100 shadows: Full data (generals + elites)
   * - Rest: Compressed data (80% memory savings each)
   * - Result: Massive army with manageable memory
   *
   * Operations:
   * 1. Get all shadows and calculate power
   * 2. Sort by power (strongest first)
   * 3. Top 100: Keep full format
   * 4. Rest: Compress to compact format
   * 5. Save compressed shadows
   * 6. Report memory savings
   */
  async processShadowCompression() {
    try {
      const config = this.settings.shadowCompression || this.defaultSettings.shadowCompression;

      if (!config.enabled) {
        return; // Feature disabled
      }

      // Get all shadows (support up to 1M+)
      let allShadows = [];
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, 1000000);
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('COMPRESSION', 'Error getting shadows', error);
          return;
        }
      }

      // Guard clause: Skip compression if army too small
      if (allShadows.length <= 1000) {
        // debugLog method is in SECTION 4
        this.debugLog('COMPRESSION', 'Army too small, skipping');
        return;
      }

      // Calculate power for each shadow using helper (with caching)
      const shadowsWithPower = this.processShadowsWithPower(allShadows, true).map(
        ({ shadow, decompressed, power, compressionLevel }) => ({
          shadow: decompressed,
          power,
          isCompressed: compressionLevel > 0,
          compressionLevel,
        })
      );

      // Sort by power (strongest first)
      shadowsWithPower.sort((a, b) => b.power - a.power);

      // TIERED COMPRESSION:
      // Tier 1: Top 1,000 - Full format (Elite Force)
      // Tier 2: Next 9,000 - Regular compression (80% savings)
      // Tier 3: Rest - Ultra-compression (95% savings)
      const eliteThreshold = 1000; // Top 1,000
      const warmThreshold = 10000; // Top 10,000

      const elites = shadowsWithPower.slice(0, eliteThreshold);
      const warm = shadowsWithPower.slice(eliteThreshold, warmThreshold);
      const cold = shadowsWithPower.slice(warmThreshold);

      // Use shared counter object for thread-safe counting in parallel operations
      const counters = { compressed: 0, ultraCompressed: 0, decompressed: 0 };

      // Process cold shadows (ultra-compress) - batch update for performance
      const coldToUpdate = cold
        .filter(({ compressionLevel }) => compressionLevel !== 2)
        .map(({ shadow }) => {
          // Guard clause: Skip if shadow already ultra-compressed (shouldn't happen but safety check)
          if (shadow._c === 2) {
            return shadow; // Already ultra-compressed, return as-is
          }
          // Store old shadow for cache invalidation
          const oldShadow = { ...shadow };
          const ultraCompressedShadow = this.compressShadowUltra(shadow);
          // Invalidate cache for old shadow state (both storage manager and main plugin caches)
          if (ultraCompressedShadow) {
            // Invalidate storage manager cache
            if (this.storageManager?.invalidateCache) {
              this.storageManager.invalidateCache(oldShadow);
            }
            // Invalidate main plugin caches (power and personality)
            this.invalidateShadowPowerCache(oldShadow);
            const oldId = oldShadow.id || oldShadow.i;
            const oldI = oldShadow.i;
            if (this._shadowPersonalityCache) {
              if (oldId) this._shadowPersonalityCache.delete(`personality_${oldId}`);
              if (oldI && oldI !== oldId)
                this._shadowPersonalityCache.delete(`personality_${oldI}`);
            }
          }
          return ultraCompressedShadow;
        })
        .filter((shadow) => shadow !== null && (shadow.id || shadow.i));

      let coldUpdated = 0;
      if (coldToUpdate.length > 0 && this.storageManager?.updateShadowsBatch) {
        try {
          coldUpdated = await this.storageManager.updateShadowsBatch(coldToUpdate);
          // Clear power cache after compression (handles cache key changes)
          this.clearShadowPowerCache();
          // Invalidate aggregated power cache since compression changes shadow data
          if (this.storageManager) {
            this.storageManager.aggregatedPowerCache = null;
            this.storageManager.aggregatedPowerCacheTime = null;
          }
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('COMPRESSION', 'Ultra-compression: Batch update error', error);
        }
      }
      counters.ultraCompressed = coldUpdated;

      // Process warm shadows (regular compression) - batch update for performance
      const warmToCompress = warm
        .filter(({ compressionLevel }) => compressionLevel !== 1)
        .map(({ shadow, compressionLevel }) => {
          // Store old shadow for cache invalidation
          const oldShadow = { ...shadow };
          let compressedShadow = null;

          // If ultra-compressed (level 2), decompress first then compress to regular
          if (compressionLevel === 2) {
            const decompressed = this.decompressShadowUltra(shadow);
            compressedShadow = decompressed ? this.compressShadow(decompressed) : null;
          } else if (shadow._c === 1 || shadow._c === 2) {
            // Already compressed, return as-is
            compressedShadow = shadow;
          } else {
            // If uncompressed (level 0), compress to regular
            compressedShadow = this.compressShadow(shadow);
          }

          // Invalidate cache for old shadow state if compression changed it
          if (compressedShadow && compressedShadow !== shadow) {
            // Invalidate storage manager cache
            if (this.storageManager?.invalidateCache) {
              this.storageManager.invalidateCache(oldShadow);
            }
            // Invalidate main plugin caches (power and personality)
            this.invalidateShadowPowerCache(oldShadow);
            const oldId = oldShadow.id || oldShadow.i;
            const oldI = oldShadow.i;
            if (this._shadowPersonalityCache) {
              if (oldId) this._shadowPersonalityCache.delete(`personality_${oldId}`);
              if (oldI && oldI !== oldId)
                this._shadowPersonalityCache.delete(`personality_${oldI}`);
            }
          }

          return compressedShadow;
        })
        .filter((shadow) => shadow !== null && (shadow.id || shadow.i));

      let warmUpdated = 0;
      if (warmToCompress.length > 0 && this.storageManager?.updateShadowsBatch) {
        try {
          warmUpdated = await this.storageManager.updateShadowsBatch(warmToCompress);
          // Clear power cache after compression (handles cache key changes)
          this.clearShadowPowerCache();
          // Invalidate aggregated power cache since compression changes shadow data
          if (this.storageManager) {
            this.storageManager.aggregatedPowerCache = null;
            this.storageManager.aggregatedPowerCacheTime = null;
          }
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('COMPRESSION', 'Compression: Batch update error', error);
        }
      }

      // Count downgrades (ultra -> regular)
      const downgradeCount = warm.filter(({ compressionLevel }) => compressionLevel === 2).length;
      counters.compressed = warmUpdated;
      counters.ultraCompressed -= downgradeCount; // Subtract downgraded from ultra count

      // Process elite shadows (decompress if needed) - batch update for performance
      const elitesToDecompress = elites
        .filter(({ compressionLevel }) => compressionLevel !== 0)
        .map(({ shadow }) => {
          // Store old shadow for cache invalidation
          const oldShadow = { ...shadow };
          const decompressed = this.prepareShadowForSave(shadow);
          // Invalidate cache for old compressed shadow state (both storage manager and main plugin caches)
          if (decompressed) {
            // Invalidate storage manager cache
            if (this.storageManager?.invalidateCache) {
              this.storageManager.invalidateCache(oldShadow);
            }
            // Invalidate main plugin caches (power and personality)
            this.invalidateShadowPowerCache(oldShadow);
            const oldId = oldShadow.id || oldShadow.i;
            const oldI = oldShadow.i;
            if (this._shadowPersonalityCache) {
              if (oldId) this._shadowPersonalityCache.delete(`personality_${oldId}`);
              if (oldI && oldI !== oldId)
                this._shadowPersonalityCache.delete(`personality_${oldI}`);
            }
          }
          return decompressed;
        })
        .filter((shadow) => shadow !== null && (shadow.id || shadow.i));

      let elitesUpdated = 0;
      if (elitesToDecompress.length > 0 && this.storageManager?.updateShadowsBatch) {
        try {
          elitesUpdated = await this.storageManager.updateShadowsBatch(elitesToDecompress);
          // Clear power cache after decompression (handles cache key changes)
          this.clearShadowPowerCache();
          // Invalidate aggregated power cache since decompression changes shadow data
          if (this.storageManager) {
            this.storageManager.aggregatedPowerCache = null;
            this.storageManager.aggregatedPowerCacheTime = null;
          }
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('COMPRESSION', 'Decompression: Batch update error', error);
        }
      }
      counters.decompressed = elitesUpdated;

      const { compressed, ultraCompressed, decompressed } = counters;

      // Update last compression time
      if (!this.settings.shadowCompression) {
        this.settings.shadowCompression = { ...config };
      }
      this.settings.shadowCompression.lastCompressionTime = Date.now();
      this.saveSettings();

      // Guard clause: Log results only if changes were made
      if (compressed > 0 || ultraCompressed > 0 || decompressed > 0) {
        // debugLog method is in SECTION 4
        this.debugLog(
          'COMPRESSION',
          `Compression: ${compressed} compressed, ${ultraCompressed} ultra-compressed, ${decompressed} decompressed`
        );
        this.debugLog(
          'COMPRESSION',
          `Elite: ${elites.length} (full) | Warm: ${warm.length} (compressed) | Cold: ${cold.length} (ultra)`
        );
        const savings = Math.floor((compressed * 0.8 * 500 + ultraCompressed * 0.95 * 500) / 1024);
        this.debugLog('COMPRESSION', `Memory Savings: ~${savings} KB`);
      }
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('COMPRESSION', 'Error processing', error);
    }
  }

  /**
   * Regular cleanup: Convert weakest shadows to essence
   * Runs periodically to keep army size manageable
   * Converts bottom 10% of shadows (by power) to essence
   */
  async processShadowEssenceConversion() {
    try {
      const config = this.settings.shadowEssence || this.defaultSettings.shadowEssence;

      if (!config.enabled) {
        return; // Feature disabled
      }

      // Get all shadows (support up to 1M+)
      let allShadows = [];
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, 1000000);
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('ESSENCE', 'Error getting shadows', error);
          return;
        }
      }

      // Guard clause: Don't convert if below minimum
      if (allShadows.length <= (config.minShadowsToKeep || 20)) {
        // debugLog method is in SECTION 4
        this.debugLog(
          'ESSENCE',
          `Skipping conversion (${allShadows.length} shadows, min ${config.minShadowsToKeep})`
        );
        return;
      }

      // Calculate power for each shadow using helper (with caching)
      const shadowsWithPower = this.processShadowsWithPower(allShadows, true).map(
        ({ shadow, decompressed, power }) => ({
          shadow: decompressed,
          power,
        })
      );

      // Sort by power (weakest first)
      shadowsWithPower.sort((a, b) => a.power - b.power);

      // Calculate threshold with variance (±10% for unpredictability)
      const baseThreshold = config.weakShadowThreshold || 0.3; // 30%
      const variance = 0.9 + Math.random() * 0.2; // 90-110%
      const threshold = baseThreshold * variance;

      // Select weakest X% for conversion
      const conversionCount = Math.floor(allShadows.length * threshold);
      const toConvert = shadowsWithPower.slice(0, conversionCount);

      // Guard clause: Don't convert if would go below minimum
      const remaining = allShadows.length - conversionCount;
      if (remaining < (config.minShadowsToKeep || 20)) {
        // debugLog method is in SECTION 4
        this.debugLog('ESSENCE', 'Skipping conversion (would drop below minimum)');
        return;
      }

      // Convert shadows to essence - batch delete for performance
      // Shadows are decompressed from processShadowsWithPower, but use id || i for safety
      const shadowIdsToDelete = toConvert
        .map(({ shadow }) => shadow.id || shadow.i)
        .filter(Boolean);

      if (shadowIdsToDelete.length > 0 && this.storageManager?.deleteShadowsBatch) {
        try {
          await this.storageManager.deleteShadowsBatch(shadowIdsToDelete);
          // Clear power cache after deletion
          this.clearShadowPowerCache();
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('ESSENCE', 'Batch delete error', error);
        }
      }

      // Calculate essence for deleted shadows
      const conversionResult = toConvert.map(({ shadow }) => {
        const rank = shadow.rank || 'E';
        const baseEssence = config.essencePerShadow[rank] || 1;
        // Add variance based on power (±20%)
        const powerVariance = 0.8 + Math.random() * 0.4;
        const essence = Math.max(1, Math.floor(baseEssence * powerVariance));
        return { rank, essence };
      });

      // Aggregate results using reduce
      const { totalEssence, essenceByRank } = conversionResult.reduce(
        (acc, { rank, essence }) => {
          acc.totalEssence += essence;
          acc.essenceByRank[rank] = (acc.essenceByRank[rank] || 0) + 1;
          return acc;
        },
        { totalEssence: 0, essenceByRank: {} }
      );

      // Update essence total
      if (!this.settings.shadowEssence) {
        this.settings.shadowEssence = { ...config };
      }
      this.settings.shadowEssence.essence =
        (this.settings.shadowEssence.essence || 0) + totalEssence;
      this.settings.shadowEssence.lastConversionTime = Date.now();
      this.saveSettings();

      // Invalidate caches
      this.cachedBuffs = null;
      this.cachedBuffsTime = null;

      // Show notification
      const rankSummary = Object.entries(essenceByRank)
        .map(([rank, count]) => `${count}×${rank}`)
        .join(', ');

      // debugLog method is in SECTION 4
      this.debugLog(
        'ESSENCE',
        `Converted ${toConvert.length} weak shadows to ${totalEssence} essence (${rankSummary})`
      );
      this.debugLog(
        'ESSENCE',
        `Total essence: ${this.settings.shadowEssence.essence} | Remaining shadows: ${remaining}`
      );

      // Show toast if available
      if (BdApi.showToast) {
        BdApi.showToast(
          `💎 Converted ${toConvert.length} weak shadows to ${totalEssence} essence!`,
          {
            type: 'info',
            timeout: 5000,
          }
        );
      }

      // Update UI if modal is open
      if (this.shadowArmyModal && document.body.contains(this.shadowArmyModal)) {
        this.closeShadowArmyModal();
        setTimeout(() => this.openShadowArmyUI(), 100);
      }
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('ESSENCE', 'Error processing conversion', error);
    }
  }

  /**
   * Emergency cleanup wrapper - only runs essence conversion if army > 5000
   */
  async processEmergencyCleanup() {
    try {
      let count = 0;
      if (this.storageManager) {
        // Get user rank and shadow ranks for getAggregatedPower
        const soloData = this.getSoloLevelingData();
        const userRank = soloData?.rank || 'E';
        const shadowRanks = this.shadowRanks || [
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

        // Guard clause: Call getAggregatedPower with required parameters
        try {
          const stats = await this.storageManager.getAggregatedPower(userRank, shadowRanks);
          count = stats?.totalCount || 0;
        } catch (error) {
          // Fallback: Use getAllShadows if getAggregatedPower fails
          this.debugLog(
            'CLEANUP',
            'getAggregatedPower failed, using getAllShadows fallback',
            error
          );
          const allShadows = await this.getAllShadows();
          count = allShadows?.length || 0;
        }
      }

      // Guard clause: Trigger cleanup only if count exceeds threshold
      if (count > 5000) {
        // debugLog method is in SECTION 4
        this.debugLog('CLEANUP', `Emergency cleanup triggered (${count} shadows)`);
        await this.processShadowEssenceConversion();
      }
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('CLEANUP', 'Emergency cleanup error', error);
    }
  }

  /**
   * Get shadow in correct format (decompress if needed)
   * Used throughout plugin to handle both formats transparently
   */
  getShadowData(shadow) {
    if (!shadow) return null;

    // Handle ultra-compression (v2)
    if (shadow._c === 2) {
      return this.decompressShadowUltra(shadow);
    }

    // Handle regular compression (v1)
    if (shadow._c === 1) {
      return this.decompressShadow(shadow);
    }

    // Already decompressed
    return shadow;
  }

  /**
   * Prepare shadow for saving to IndexedDB
   * Removes compression markers and ensures clean save
   * Compression system will re-compress weak shadows on next hourly run
   */
  prepareShadowForSave(shadow) {
    // Guard clause: Return null if no shadow provided
    if (!shadow) return null;

    // Clone shadow to avoid mutating original
    const shadowToSave = { ...shadow };

    // Remove compression marker (shadow is now full format)
    delete shadowToSave._compressed;
    delete shadowToSave._ultraCompressed;

    // Use reduce for functional pattern to build default stats objects
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const defaultStats = statKeys.reduce((stats, key) => {
      stats[key] = 0;
      return stats;
    }, {});

    // Ensure all required fields are present
    shadowToSave.baseStats = shadowToSave.baseStats || { ...defaultStats };
    shadowToSave.growthStats = shadowToSave.growthStats || { ...defaultStats };
    shadowToSave.naturalGrowthStats = shadowToSave.naturalGrowthStats || { ...defaultStats };

    return shadowToSave;
  }

  // ============================================================================
  // 3.14 UI METHODS - Chat Button & Modal (Disabled Features)
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
    const referenceButtons = [
      document.querySelector('.tm-title-button'),
      document.querySelector('.st-skill-tree-button'),
    ];

    // Use find for functional pattern
    const foundButton = referenceButtons.find((btn) => btn && btn.parentElement);
    if (foundButton?.parentElement) {
      return foundButton.parentElement;
    }

    // Method 2: Find by looking for common Discord button classes
    const buttonSelectors = ['[class*="button"]'];
    const buttonElements = Array.from(document.querySelectorAll(buttonSelectors[0]));

    // Use find for functional pattern
    const toolbarButton = buttonElements.find((el) => {
      const siblings = Array.from(el.parentElement?.children || []);
      const hasRequiredSiblings = siblings.length >= 4;
      const hasToolbarMarkers = siblings.some(
        (s) =>
          s.querySelector('[class*="emoji"]') ||
          s.querySelector('[class*="gif"]') ||
          s.querySelector('[class*="attach"]') ||
          s.classList.contains('tm-title-button') ||
          s.classList.contains('st-skill-tree-button')
      );
      return hasRequiredSiblings && hasToolbarMarkers;
    });

    if (toolbarButton?.parentElement) {
      return toolbarButton.parentElement;
    }

    // Method 3: Fallback - find by textarea and traverse DOM
    const textAreaSelectors = [
      '[class*="channelTextArea"]',
      '[class*="slateTextArea"]',
      'textarea[placeholder*="Message"]',
    ];

    // Use find for functional pattern
    const textArea = textAreaSelectors
      .map((selector) => document.querySelector(selector))
      .find((el) => el !== null);

    if (!textArea) return null;

    // Use optional chaining and find for container
    const containerSelectors = [
      '[class*="container"]',
      '[class*="wrapper"]',
      '[class*="buttons"]',
      '[class*="buttonContainer"]',
      '[class*="toolbar"]',
    ];

    let container =
      textArea.closest(containerSelectors[0]) ||
      textArea.closest(containerSelectors[1]) ||
      textArea.parentElement?.parentElement?.parentElement;

    if (!container) return null;

    const buttons = container.querySelectorAll('[class*="button"]');
    if (buttons && buttons.length >= 4) {
      return buttons[0]?.parentElement;
    }

    // Use find for functional pattern to find toolbar container
    const toolbarContainer = containerSelectors
      .slice(2)
      .map((selector) => container.querySelector(selector))
      .find((el) => el !== null);

    return toolbarContainer || null;
  }

  /**
   * Create ShadowArmy button in chat toolbar
   */
  /**
   * Cleanup function for shadow army button (disabled feature)
   * Removed chatbox UI per user request - kept for cleanup only
   */
  async createShadowArmyButton() {
    // Clean up any existing buttons (safety cleanup)
    const existingShadowArmyBtn = document.querySelector('.shadow-army-button');
    if (existingShadowArmyBtn) existingShadowArmyBtn.remove();
    this.shadowArmyButton = null;
  }

  /**
   * Toolbar observer (disabled feature - kept for cleanup)
   */
  observeToolbar(toolbar) {
    // Feature disabled - no-op
  }

  /**
   * Inject CSS for shadow rank widget (using BdApi.DOM for persistence)
   */
  injectWidgetCSS() {
    // RE-ENABLED: Widget CSS needed for member list display
    const cssContent = `
      #shadow-army-widget {
        background: linear-gradient(135deg, rgba(20, 10, 30, 0.95), rgba(10, 10, 20, 0.95)) !important;
        border: 1px solid rgba(139, 92, 246, 0.4) !important;
        border-radius: 8px !important;
        padding: 12px !important;
        margin: 12px 8px !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 20px rgba(139, 92, 246, 0.15) !important;
        cursor: pointer !important;
        transition: all 0.3s ease !important;
      }

      #shadow-army-widget:hover {
        border-color: rgba(139, 92, 246, 0.6) !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 24px rgba(139, 92, 246, 0.25) !important;
      }

      #shadow-army-widget .widget-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        margin-bottom: 8px !important;
      }

      #shadow-army-widget .widget-title {
        color: #8b5cf6 !important;
        font-size: 12px !important;
        font-weight: bold !important;
        text-shadow: 0 0 8px rgba(139, 92, 246, 0.8) !important;
      }

      #shadow-army-widget .widget-total {
        color: #999 !important;
        font-size: 11px !important;
      }

      #shadow-army-widget .rank-grid {
        display: grid !important;
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 6px !important;
      }

      #shadow-army-widget .rank-box {
        text-align: center !important;
        padding: 4px !important;
        background: rgba(0, 0, 0, 0.4) !important;
        border-radius: 4px !important;
        transition: all 0.2s ease !important;
      }

      #shadow-army-widget .rank-label {
        font-size: 10px !important;
        font-weight: bold !important;
      }

      #shadow-army-widget .rank-count {
        color: #fff !important;
        font-size: 14px !important;
        font-weight: bold !important;
      }

      #shadow-army-widget .widget-footer {
        margin-top: 8px !important;
        padding-top: 8px !important;
        border-top: 1px solid rgba(139, 92, 246, 0.2) !important;
        text-align: center !important;
        color: #888 !important;
        font-size: 9px !important;
      }
    `;

    // Use new CSS management system
    const widgetStyleId = 'shadow-army-widget-styles';
    this.injectOrUpdateCSS(widgetStyleId, cssContent, {
      forceUpdate: false,
      useThemeVars: false, // Widget CSS doesn't need theme vars
      priority: 100,
    });
  }

  /**
   * Remove widget CSS
   */
  removeWidgetCSS() {
    const styleId = 'shadow-army-widget-styles';
    // Use new CSS management system
    this.removeCSSById(styleId);
  }

  /**
   * Inject shadow rank widget into member list sidebar
   * Fast injection with smart retry logic
   */
  async injectShadowRankWidget() {
    // RE-ENABLED: Widget needed for member list display
    // Guard clause: Prevent reinjection after plugin stop
    if (this._isStopped) return;

    // Guard clause: Check if widget already exists
    if (document.getElementById('shadow-army-widget')) return;

    // Check for member list immediately (no delay)
    const membersList = document.querySelector('[class*="members"]');
    if (!membersList) {
      // Fast retry - check again in 200ms
      const timeoutId = setTimeout(() => this.injectShadowRankWidget(), 200);
      // Track timeout for cleanup
      if (!this._widgetInjectionTimeouts) {
        this._widgetInjectionTimeouts = new Set();
      }
      this._widgetInjectionTimeouts.add(timeoutId);
      return;
    }

    try {
      // Create widget container
      const widget = document.createElement('div');
      widget.id = 'shadow-army-widget';

      // Click to open Shadow Army modal
      widget.addEventListener('click', () => {
        this.openShadowArmyUI();
      });

      // Insert at the top of member list
      const membersContent = membersList.querySelector('[class*="content"]');
      if (membersContent && membersContent.firstChild) {
        membersContent.insertBefore(widget, membersContent.firstChild);
      } else if (membersList.firstChild) {
        membersList.insertBefore(widget, membersList.firstChild);
      } else {
        // Fallback: append to membersList if no firstChild
        membersList.appendChild(widget);
      }

      // Initial update
      this.updateShadowRankWidget();
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('WIDGET', 'Error injecting shadow rank widget', error);
    }
  }

  /**
   * Update shadow rank widget content
   */
  async updateShadowRankWidget() {
    // RE-ENABLED: Widget update for member list display
    // Prevent updates after plugin stop
    if (this._isStopped) return;

    const widget = document.getElementById('shadow-army-widget');
    if (!widget) return;

    try {
      // Get all shadows
      let shadows = [];
      if (this.storageManager && this.storageManager.getShadows) {
        try {
          shadows = await this.storageManager.getShadows({}, 0, 10000);
        } catch (err) {
          shadows = this.settings.shadows || [];
        }
      } else {
        shadows = this.settings.shadows || [];
      }

      // Guard clause: Return early if no shadows
      if (!shadows || shadows.length === 0) {
        widget.innerHTML = `
          <div class="widget-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div class="widget-title" style="color: #8b5cf6; font-size: 12px; font-weight: bold;">MY SHADOW ARMY</div>
            <div class="widget-total" style="color: #999; font-size: 11px;">0 Total</div>
          </div>
          <div style="text-align: center; padding: 20px; color: #999; font-size: 11px;">No shadows yet</div>
        `;
        return;
      }

      // Count by rank using reduce for functional pattern
      const ranks = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E'];
      const rankColors = {
        SSS: '#ec4899',
        SS: '#ef4444',
        S: '#f59e0b',
        A: '#8b5cf6',
        B: '#3b82f6',
        C: '#22c55e',
        D: '#a0a0a0',
        E: '#999',
      };

      // Use reduce to count shadows by rank
      const rankCountsMap = shadows.reduce((counts, shadow) => {
        const rank = shadow.rank || 'E';
        counts[rank] = (counts[rank] || 0) + 1;
        return counts;
      }, {});

      const rankCounts = ranks.map((rank) => ({
        rank,
        count: rankCountsMap[rank] || 0,
        color: rankColors[rank] || '#999',
      }));

      // Generate HTML with proper structure
      widget.innerHTML = `
        <div class="widget-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div class="widget-title" style="color: #8b5cf6; font-size: 12px; font-weight: bold; text-shadow: 0 0 8px rgba(139, 92, 246, 0.8);">
            MY SHADOW ARMY
          </div>
          <div class="widget-total" style="color: #999; font-size: 11px;">
            ${shadows.length} Total
          </div>
        </div>
        <div class="rank-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
          ${rankCounts
            .map(
              ({ rank, count, color }) => `
            <div class="rank-box" style="
              text-align: center;
              padding: 4px;
              background: rgba(0, 0, 0, 0.4);
              border-radius: 4px;
              border: 1px solid ${color}40;
            ">
              <div class="rank-label" style="color: ${color}; font-size: 10px; font-weight: bold;">${rank}</div>
              <div class="rank-count" style="color: #fff; font-size: 14px; font-weight: bold;">${count}</div>
            </div>
          `
            )
            .join('')}
        </div>
        <div class="widget-footer" style="
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(139, 92, 246, 0.2);
          text-align: center;
          color: #888;
          font-size: 9px;
        ">
          Click to manage shadows
        </div>
      `;
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('WIDGET', 'Error updating widget', error);
    }
  }

  /**
   * Remove shadow rank widget
   */
  removeShadowRankWidget() {
    const widget = document.getElementById('shadow-army-widget');
    if (widget) {
      widget.remove();
    }
    this.removeWidgetCSS();
  }

  /**
   * Format combat time dynamically (seconds, minutes, or hours)
   * Internal calculations stay in hours, display adapts to magnitude
   */
  formatCombatTime(hours) {
    // Guard clause: Return early for invalid hours
    if (!hours || hours === 0) return '0s';

    const totalSeconds = hours * 3600;

    // Use dictionary pattern for time formatting
    const timeFormatters = [
      [(s) => s < 60, (s) => `${Math.floor(s)}s`], // Less than 1 minute - show seconds
      [(s) => s < 3600, (s) => `${Math.floor(s / 60)}m`], // Less than 1 hour - show minutes
      [(s) => hours < 10, () => `${hours.toFixed(1)}h`], // 1-10 hours - show with decimal
      [() => true, () => `${Math.floor(hours)}h`], // 10+ hours - show whole hours
    ];

    const [, formatter] = timeFormatters.find(([predicate]) => predicate(totalSeconds));
    return formatter(totalSeconds);
  }

  /**
   * Generate rank distribution HTML
   * Shows count of shadows per rank with color coding
   */
  generateRankDistribution(shadows) {
    // Guard clause: Return empty string if no shadows
    if (!shadows || shadows.length === 0) return '';

    const ranks = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    const rankColors = {
      E: '#999',
      D: '#a0a0a0',
      C: '#22c55e',
      B: '#3b82f6',
      A: '#8b5cf6',
      S: '#f59e0b',
      SS: '#ef4444',
      SSS: '#ec4899',
    };

    // Use reduce for functional pattern to count shadows by rank
    const rankCounts = shadows.reduce((counts, shadow) => {
      const rank = shadow.rank || 'E';
      counts[rank] = (counts[rank] || 0) + 1;
      return counts;
    }, {});

    return ranks
      .map((rank) => {
        const count = rankCounts[rank] || 0;
        const color = rankColors[rank] || '#999';
        const percentage = shadows.length > 0 ? ((count / shadows.length) * 100).toFixed(1) : 0;

        return `
        <div style="text-align: center; padding: 6px; background: rgba(0, 0, 0, 0.3); border-radius: 4px; border: 1px solid ${color}40;">
          <div style="color: ${color}; font-size: 14px; font-weight: bold;">${rank}</div>
          <div style="color: #fff; font-size: 16px; font-weight: bold; margin: 2px 0;">${count}</div>
          <div style="color: #888; font-size: 9px;">${percentage}%</div>
        </div>
      `;
      })
      .join('');
  }

  async openShadowArmyUI() {
    // Guard clause: Toggle modal if already open
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
          // debugError method is in SECTION 4
          this.debugError('UI', 'Could not get shadows from IndexedDB', err);
          shadows = this.settings.shadows || [];
        }
      } else {
        shadows = this.settings.shadows || [];
      }

      // Guard clause: Return early if no shadows
      if (!shadows || shadows.length === 0) {
        // Show empty state modal
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
        modal.innerHTML = `
          <div style="width: 90%; max-width: 900px; background: #1e1e1e; border: 2px solid #8b5cf6; border-radius: 12px; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
              <h2 style="color: #8b5cf6; margin: 0;">Shadow Army Command</h2>
              <button id="close-shadow-army-modal" style="background: transparent; border: none; color: #999; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">×</button>
            </div>
            <div style="text-align: center; padding: 40px; color: #999;">
              No shadows in army yet. Extract shadows from dungeons!
            </div>
          </div>
        `;
        modal.querySelector('#close-shadow-army-modal')?.addEventListener('click', () => {
          this.closeShadowArmyModal();
        });
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            this.closeShadowArmyModal();
          }
        });
        // Use BdApi.DOM utilities if available for better integration
        if (BdApi && BdApi.DOM && typeof BdApi.DOM.append === 'function') {
          BdApi.DOM.append(document.body, modal);
        } else {
          document.body.appendChild(modal);
        }
        this.shadowArmyModal = modal;
        return;
      }

      // HYBRID COMPRESSION: Decompress all shadows for UI display
      // Ensures calculations work correctly regardless of compression state
      shadows = shadows.map((s) => this.getShadowData(s));

      // Count compressed vs full for stats using reduce
      const compressionStats = shadows.reduce(
        (stats, shadow) => {
          if (shadow._compressed || shadow._ultraCompressed) {
            stats.compressed++;
          } else {
            stats.elite++;
          }
          return stats;
        },
        { compressed: 0, elite: 0 }
      );
      const { compressed: compressedCount, elite: eliteCount } = compressionStats;

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

      const renderModal = () => {
        // Guard clause: Return early if no shadows
        if (!shadows || shadows.length === 0) {
          modal.innerHTML = `
            <div style="width: 90%; max-width: 900px; background: #1e1e1e; border: 2px solid #8b5cf6; border-radius: 12px; padding: 20px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="color: #8b5cf6; margin: 0;">Shadow Army Command</h2>
                <button id="close-shadow-army-modal" style="background: transparent; border: none; color: #999; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">×</button>
              </div>
              <div style="text-align: center; padding: 40px; color: #999;">
                No shadows in army yet. Extract shadows from dungeons!
              </div>
            </div>
          `;
          modal.querySelector('#close-shadow-army-modal')?.addEventListener('click', () => {
            this.closeShadowArmyModal();
          });
          return;
        }

        // Calculate generals (top 7 strongest) - DYNAMIC using functional patterns
        // Use calculateShadowPowerCached for accurate power calculation
        const withPower = shadows.map((shadow) => {
          const power = this.calculateShadowPowerCached(shadow);
          // Get identifier (accept both id and i for compressed shadows)
          const shadowId = shadow.id || shadow.i;
          return { shadow, power, id: shadowId };
        });
        const sortedByPower = [...withPower].sort((a, b) => b.power - a.power);
        const generals = sortedByPower.slice(0, 7).map((x) => x.shadow);

        // Calculate total army power
        const totalArmyPower = withPower.reduce((sum, { power }) => sum + power, 0);

        // Calculate role/class distribution with average stats using reduce
        const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
        const roleStats = shadows.reduce((stats, shadow) => {
          const role = shadow.role || shadow.roleName || 'Unknown';
          if (!stats[role]) {
            stats[role] = {
              count: 0,
              totalStats: statKeys.reduce((acc, key) => {
                acc[key] = 0;
                return acc;
              }, {}),
              totalLevel: 0,
              isMagicBeast: this.shadowRoles[role]?.isMagicBeast || false,
            };
          }

          stats[role].count++;
          const effective = this.getShadowEffectiveStats(shadow);
          statKeys.reduce((totalStats, key) => {
            totalStats[key] += effective[key] || 0;
            return totalStats;
          }, stats[role].totalStats);
          stats[role].totalLevel += shadow.level || 1;
          return stats;
        }, {});

        // Calculate averages using reduce
        const roleStatsWithAverages = Object.entries(roleStats).reduce((acc, [role, data]) => {
          const count = data.count;
          acc[role] = {
            ...data,
            avgStats: statKeys.reduce((avgStats, key) => {
              avgStats[key] = Math.floor(data.totalStats[key] / count);
              return avgStats;
            }, {}),
            avgLevel: Math.floor(data.totalLevel / count),
          };
          // Calculate average power using reduce
          acc[role].avgPower = Math.floor(
            statKeys.reduce((sum, key) => sum + acc[role].avgStats[key], 0) / statKeys.length
          );
          return acc;
        }, {});

        // Sort roles by count (descending)
        const sortedRoles = Object.entries(roleStatsWithAverages).sort(
          (a, b) => b[1].count - a[1].count
        );

        modal.innerHTML = `
          <div style="
            width: 90%;
            max-width: 900px;
            max-height: 90vh;
            background: #1e1e1e;
            border: 2px solid #8b5cf6;
            border-radius: 12px;
            padding: 20px;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
              <h2 style="color: #8b5cf6; margin: 0;">Shadow Army Command</h2>
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

            <!-- Army Overview -->
            <div style="
              background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(168, 85, 247, 0.1));
              border: 1px solid #8b5cf6;
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 16px;
            ">
              <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 12px;">
                <div style="text-align: center;">
                  <div style="color: #8b5cf6; font-size: 20px; font-weight: bold;">${
                    shadows.length
                  }</div>
                  <div style="color: #999; font-size: 11px;">Total Shadows</div>
                </div>
                <div style="text-align: center;">
                  <div style="color: #34d399; font-size: 20px; font-weight: bold;">${eliteCount}</div>
                  <div style="color: #999; font-size: 11px;">Elite Force</div>
                </div>
                <div style="text-align: center;">
                  <div style="color: #64748b; font-size: 20px; font-weight: bold;">${compressedCount}</div>
                  <div style="color: #999; font-size: 11px;">Legion</div>
                </div>
                <div style="text-align: center;">
                  <div style="color: #ef4444; font-size: 20px; font-weight: bold;">${this.formatCombatTime(
                    shadows.reduce((sum, shadow) => sum + (shadow.totalCombatTime || 0), 0)
                  )}</div>
                  <div style="color: #999; font-size: 11px;">Total Combat</div>
                </div>
                <div style="text-align: center;">
                  <div style="color: #fbbf24; font-size: 20px; font-weight: bold;">⚔️ ${totalArmyPower.toLocaleString()}</div>
                  <div style="color: #999; font-size: 11px;">Total Power</div>
                </div>
                <div style="text-align: center;">
                  <div style="color: #a78bfa; font-size: 20px; font-weight: bold;">💎 ${(
                    this.settings.shadowEssence?.essence || 0
                  ).toLocaleString()}</div>
                  <div style="color: #999; font-size: 11px;">Essence</div>
                </div>
              </div>

              <!-- Shadow Rank Distribution -->
              <div style="background: rgba(20, 20, 40, 0.6); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="color: #8b5cf6; font-size: 13px; font-weight: bold; margin-bottom: 8px; text-align: center;">
                  Shadow Rank Distribution
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                  ${this.generateRankDistribution(shadows)}
              </div>
            </div>

              <!-- Shadow Role/Class Distribution -->
              <div style="background: rgba(20, 20, 40, 0.6); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; padding: 12px;">
                <div style="color: #8b5cf6; font-size: 13px; font-weight: bold; margin-bottom: 8px; text-align: center;">
                  Army Composition by Role/Class
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
                  ${sortedRoles
                    .map(
                      ([role, data]) => `
                    <div style="background: rgba(139, 92, 246, 0.1); border-radius: 6px; padding: 8px;">
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="color: ${
                          data.isMagicBeast ? '#f59e0b' : '#8b5cf6'
                        }; font-size: 12px; font-weight: bold;">
                          ${role}${data.isMagicBeast ? ' 🐾' : ''}
                        </span>
                        <span style="color: #34d399; font-size: 11px; font-weight: bold;">${
                          data.count
                        }</span>
                </div>
                      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; font-size: 9px; color: #999;">
                        <div>Lvl: <span style="color: #34d399;">${data.avgLevel}</span></div>
                        <div>Pwr: <span style="color: #8b5cf6;">${data.avgPower}</span></div>
                        <div>STR: <span style="color: #ef4444;">${
                          data.avgStats.strength
                        }</span></div>
                      </div>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            </div>

            <!-- Generals Section -->
            <div style="margin-bottom: 12px;">
              <h3 style="color: #fbbf24; font-size: 16px; margin-bottom: 12px; text-align: center; text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);">
                ⭐ SHADOW GENERALS ⭐
              </h3>
            </div>

            <div style="max-height: 50vh; overflow-y: auto;">
              ${
                generals.length === 0
                  ? `<div style="text-align: center; padding: 40px; color: #999;">
                      No shadows in army yet. Extract shadows from dungeons!
                    </div>`
                  : generals
                      .map((shadow, index) => {
                        // General ranking (1-7)
                        const generalRank = index + 1;

                        // Calculate effective stats
                        const effectiveStats = this.getShadowEffectiveStats(shadow);
                        const totalPower = this.calculateShadowStrength(
                          effectiveStats,
                          shadow.level || 1
                        );

                        // XP progress
                        const xpNeeded = this.getShadowXpForNextLevel(
                          shadow.level || 1,
                          shadow.rank
                        );
                        const xpProgress = ((shadow.xp || 0) / xpNeeded) * 100;

                        // Combat time
                        const combatTime = this.formatCombatTime(shadow.totalCombatTime || 0);

                        // Role info
                        const role = shadow.role || shadow.roleName || 'Unknown';
                        const isMagicBeast = this.shadowRoles[role]?.isMagicBeast || false;

                        return `
                  <div class="sa-general-card" data-shadow-id="${shadow.id}" style="
                    background: rgba(251, 191, 36, 0.15);
                    border: 2px solid #fbbf24;
                    border-radius: 8px;
                    padding: 14px;
                    margin-bottom: 12px;
                    box-shadow: 0 0 15px rgba(251, 191, 36, 0.3);
                  ">
                    <div style="display: flex; gap: 12px;">
                      <!-- General Rank Badge -->
                        <div style="
                          background: linear-gradient(135deg, #fbbf24, #f59e0b);
                          color: #000;
                        font-size: 20px;
                          font-weight: bold;
                        padding: 8px;
                        border-radius: 8px;
                        width: 48px;
                        height: 48px;
                          display: flex;
                        flex-direction: column;
                          align-items: center;
                          justify-content: center;
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
                      ">
                        <div style="font-size: 16px;">★</div>
                        <div style="font-size: 10px;">#${generalRank}</div>
                      </div>

                      <div style="flex: 1;">
                        <!-- Header -->
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
                          <span style="color: #8b5cf6; font-weight: bold; font-size: 14px;">[${
                            shadow.rank
                          }]</span>
                          <span style="color: ${
                            isMagicBeast ? '#f59e0b' : '#fff'
                          }; font-size: 14px; font-weight: bold;">${role}${
                          isMagicBeast ? ' 🐾' : ''
                        }</span>
                          <span style="color: #34d399; margin-left: auto; font-size: 14px; font-weight: bold;">⚡ ${totalPower.toLocaleString()}</span>
                        </div>

                        <!-- Level & XP Bar -->
                        <div style="margin-bottom: 8px;">
                          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #999; margin-bottom: 2px;">
                            <span>Level ${shadow.level || 1}</span>
                            <span>${(
                              shadow.xp || 0
                            ).toLocaleString()} / ${xpNeeded.toLocaleString()} XP</span>
                          </div>
                          <div style="background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="background: linear-gradient(90deg, #fbbf24, #f59e0b); width: ${xpProgress}%; height: 100%; transition: width 0.3s;"></div>
                          </div>
                        </div>

                        <!-- Stats Grid -->
                        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 8px;">
                          <div style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); padding: 6px; border-radius: 6px; text-align: center;">
                            <div style="color: #ef4444; font-size: 10px; font-weight: bold;">STR</div>
                            <div style="color: #fff; font-size: 14px; font-weight: bold;">${
                              effectiveStats.strength || 0
                            }</div>
                          </div>
                          <div style="background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); padding: 6px; border-radius: 6px; text-align: center;">
                            <div style="color: #22c55e; font-size: 10px; font-weight: bold;">AGI</div>
                            <div style="color: #fff; font-size: 14px; font-weight: bold;">${
                              effectiveStats.agility || 0
                            }</div>
                          </div>
                          <div style="background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); padding: 6px; border-radius: 6px; text-align: center;">
                            <div style="color: #3b82f6; font-size: 10px; font-weight: bold;">INT</div>
                            <div style="color: #fff; font-size: 14px; font-weight: bold;">${
                              effectiveStats.intelligence || 0
                            }</div>
                          </div>
                          <div style="background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.4); padding: 6px; border-radius: 6px; text-align: center;">
                            <div style="color: #a855f7; font-size: 10px; font-weight: bold;">VIT</div>
                            <div style="color: #fff; font-size: 14px; font-weight: bold;">${
                              effectiveStats.vitality || 0
                            }</div>
                          </div>
                          <div style="background: rgba(251, 191, 36, 0.2); border: 1px solid rgba(251, 191, 36, 0.4); padding: 6px; border-radius: 6px; text-align: center;">
                            <div style="color: #fbbf24; font-size: 10px; font-weight: bold;">PER</div>
                            <div style="color: #fff; font-size: 14px; font-weight: bold;">${
                              effectiveStats.perception || 0
                            }</div>
                          </div>
                        </div>

                        <!-- Combat Info -->
                        <div style="display: flex; gap: 12px; font-size: 11px;">
                          <div style="color: #34d399;">⚔️ ${combatTime} Combat</div>
                          <div style="color: #8b5cf6;">🎯 Level ${shadow.level || 1}</div>
                          <div style="color: #fbbf24; margin-left: auto;">ID: ${shadow.id.slice(
                            -8
                          )}</div>
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

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            this.closeShadowArmyModal();
          }
        });

        // Escape key to close (with lag protection)
        this._modalEscapeHandler = (e) => {
          if (e.key === 'Escape' && this.shadowArmyModal) {
            e.preventDefault();
            e.stopPropagation();
            this.closeShadowArmyModal();
          }
        };
        document.addEventListener('keydown', this._modalEscapeHandler);
      };

      renderModal();
      document.body.appendChild(modal);
      this.shadowArmyModal = modal;

      // Real-time updates: Re-fetch and re-render every 3 seconds
      // Store interval ID for proper cleanup
      this.autoRefreshInterval = setInterval(async () => {
        // Guard clause: Clear interval if modal no longer exists
        if (!this.shadowArmyModal || !document.body.contains(modal)) {
          if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
          }
          return;
        }

        try {
          // Re-fetch shadows for real-time stats
          if (this.storageManager && this.storageManager.getShadows) {
            const freshShadows = await this.storageManager.getShadows({}, 0, 10000);
            // Guard clause: Only update if we got shadows
            if (freshShadows && freshShadows.length > 0) {
              shadows = freshShadows.map((s) => this.getShadowData(s));
              renderModal();
            }
          }
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('UI', 'Error refreshing UI', error);
        }
      }, 3000); // Refresh every 3 seconds for real-time updates
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('UI', 'Failed to open UI', error);
    }
  }

  /**
   * Close ShadowArmy UI modal
   * Cleans up modal element and auto-refresh interval to prevent memory leaks
   */
  closeShadowArmyModal() {
    // Clear auto-refresh interval immediately (prevent memory leak)
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }

    // Force remove modal from DOM (robust under lag)
    if (this.shadowArmyModal) {
      try {
        // Try graceful removal first
        if (this.shadowArmyModal.parentNode) {
          this.shadowArmyModal.parentNode.removeChild(this.shadowArmyModal);
        } else {
          // Fallback: direct remove
          this.shadowArmyModal.remove();
        }
      } catch (error) {
        // Under heavy lag, force remove with querySelector
        const existingModal = document.querySelector('.shadow-army-modal');
        if (existingModal) {
          existingModal.remove();
        }
        // debugError method is in SECTION 4
        this.debugError('UI', 'Error removing modal during close', error);
      }
      this.shadowArmyModal = null;
    }

    // Cleanup: Remove any orphaned modals (lag protection) using functional pattern
    try {
      Array.from(document.querySelectorAll('.shadow-army-modal')).forEach((modal) => {
        if (modal?.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      });
    } catch (error) {
      // Ignore cleanup errors (non-critical)
      // debugError method is in SECTION 4
      this.debugError('UI', 'Error during modal cleanup', error);
    }

    // Remove escape key listener
    if (this._modalEscapeHandler) {
      document.removeEventListener('keydown', this._modalEscapeHandler);
      this._modalEscapeHandler = null;
    }
  }

  // ============================================================================
  // 3.16 SETTINGS PANEL UI
  // ============================================================================

  /**
   * Generate settings panel HTML for BetterDiscord settings UI
   * Operations:
   * 1. Get total shadow count and top generals
   * 2. Identify top 7 generals by power for display
   * 3. Generate list items for first 50 shadows
   * 4. Format extraction config display
   * 5. Return HTML string with stats, config, and shadow list
   */
  getSettingsPanel() {
    // CRITICAL: BetterDiscord settings panels MUST be synchronous
    // Cannot use async/await - use cached data or localStorage fallback
    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    // Use localStorage fallback for immediate display (synchronous)
    // Real data is in IndexedDB - use diagnostic button to check actual count
    const shadowsForDisplay = this.settings.shadows || [];
    const total = shadowsForDisplay.length;
    const maxList = 50;

    // Guard clause: Return early if no shadows
    if (total === 0) {
      return `
        <div class="shadow-army-settings">
          <h2>Shadow Army</h2>
          <div class="shadow-army-stats">
            <div>Total Shadows: 0</div>
            <div>No shadows extracted yet. Send messages to begin extraction.</div>
          </div>
        </div>
      `;
    }

    // Compute strength and sort to identify generals (top 7)
    const shadowsWithPower = shadowsForDisplay.map((shadow) => {
      const effective = this.getShadowEffectiveStats(shadow);
      const strength = this.calculateShadowStrength(effective, 1);
      return { shadow, strength };
    });
    shadowsWithPower.sort((a, b) => b.strength - a.strength);
    const generalIds = new Set(shadowsWithPower.slice(0, 7).map((x) => x.shadow.id));

    const listItems = shadowsForDisplay
      .slice(0, maxList)
      .map((shadow, index) => {
        const isGeneral = generalIds.has(shadow.id);
        const generalBadge = isGeneral
          ? '<span style="background: rgba(139, 92, 246, 0.3); color: #8b5cf6; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 8px;">⭐ GENERAL</span>'
          : '';
        const _extractedDate = new Date(shadow.extractedAt).toLocaleString();
        return `
          <div class="shadow-list-item">
            <div class="shadow-list-main">
              <div class="shadow-list-header">
                <span class="shadow-list-rank">${shadow.rank}-Rank</span>
                <span class="shadow-list-role">${shadow.roleName || shadow.role}</span>
                ${generalBadge}
                <span class="shadow-list-strength">Power: ${shadow.strength || 0}</span>
              </div>
              <div class="shadow-list-meta">
                <span>Level ${shadow.level || 1}</span>
                <span>${shadow.xp || 0} / ${this.getShadowXpForNextLevel(
          shadow.level || 1,
          shadow.rank || 'E'
        )} XP</span>
                <span>${Math.floor(((shadow.level || 1) / 2000) * 100)}% to Monarch</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const storageInfo = this.storageManager
      ? '<div style="color: #34d399; font-size: 11px; margin-top: 4px;">Using IndexedDB storage (scalable)</div>'
      : '<div style="color: #facc15; font-size: 11px; margin-top: 4px;">Using localStorage (limited to ~5,000 shadows)</div>';

    // Count generals (top 7 strongest)
    const generalsCount = Math.min(7, shadowsWithPower.length);

    // Diagnostic button to check actual storage
    const diagnosticButton = `
      <div style="margin-top: 12px; padding: 8px; background: rgba(139, 92, 246, 0.1); border-radius: 4px;">
        <button id="shadow-army-diagnostic" style="padding: 6px 12px; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
          🔍 Check Actual Storage (Diagnostic)
        </button>
        <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">Click to check IndexedDB for actual shadow count</div>
        <div id="shadow-army-diagnostic-result" style="margin-top: 8px; font-size: 11px; color: #a78bfa;"></div>
      </div>
    `;

    return `
      <div class="shadow-army-settings">
        <h2>Shadow Army</h2>
        ${storageInfo}
        <div class="shadow-army-stats">
          <div>Total Shadows: ${total}${
      this.storageManager ? ' (from IndexedDB)' : ' (from localStorage)'
    }</div>
          <div>Total Extracted: ${this.settings.totalShadowsExtracted}</div>
          <div style="color: #8b5cf6; font-weight: bold;">⭐ Generals: ${generalsCount} / 7 (Auto-selected strongest)</div>
          <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">Generals provide full buffs • Other shadows provide diminishing returns</div>
        </div>
        ${diagnosticButton}
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
        <div class="shadow-army-config" style="margin-top: 16px;">
          <h3>ARISE Animation Settings</h3>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
            <input type="checkbox" id="sa-arise-enabled" ${
              this.settings?.ariseAnimation?.enabled !== false ? 'checked' : ''
            }>
            <span>Enable epic ARISE animation</span>
          </label>
          <label style="display:block;margin-bottom:8px;">
            <span style="display:block;margin-bottom:4px;">Animation duration (ms)</span>
            <input type="number" id="sa-arise-duration" value="${
              this.settings?.ariseAnimation?.animationDuration || 2500
            }" min="800" max="6000" step="200" style="width:100%;padding:4px;">
          </label>
          <label style="display:block;margin-bottom:8px;">
            <span style="display:block;margin-bottom:4px;">Scale</span>
            <input type="number" id="sa-arise-scale" value="${
              this.settings?.ariseAnimation?.scale || 1.0
            }" min="0.5" max="2.0" step="0.1" style="width:100%;padding:4px;">
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
            <input type="checkbox" id="sa-arise-show-meta" ${
              this.settings?.ariseAnimation?.showRankAndRole !== false ? 'checked' : ''
            }>
            <span>Show rank and role under ARISE</span>
          </label>
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
      <script>
        (function() {
          const diagnosticBtn = document.getElementById('shadow-army-diagnostic');
          const resultDiv = document.getElementById('shadow-army-diagnostic-result');
          if (diagnosticBtn && resultDiv) {
            diagnosticBtn.addEventListener('click', async function() {
              resultDiv.textContent = 'Checking storage...';
              try {
                resultDiv.textContent = 'Running diagnostic...';
                const plugin = BdApi.Plugins.get('ShadowArmy');
                if (!plugin || !plugin.instance) {
                  resultDiv.innerHTML = '<span style="color: #ef4444;">Plugin instance not found</span>';
                  return;
                }
                const instance = plugin.instance;

                // Use diagnostic function if available
                if (typeof instance.diagnoseStorage === 'function') {
                  const diagnostic = await instance.diagnoseStorage();
                  const statusColor = diagnostic.counts.indexedDB > 0 ? '#34d399' : (diagnostic.errors.length > 0 ? '#ef4444' : '#facc15');
                  resultDiv.innerHTML = \`
                    <div style="background: rgba(139, 92, 246, 0.15); padding: 12px; border-radius: 4px; margin-top: 8px; border: 1px solid rgba(139, 92, 246, 0.3);">
                      <div style="font-weight: bold; margin-bottom: 8px; color: #a78bfa;">📊 Storage Diagnostic Results:</div>
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                        <div>localStorage:</div>
                        <div style="font-weight: bold;">\${diagnostic.counts.localStorage} shadows</div>
                        <div>IndexedDB:</div>
                        <div style="font-weight: bold; color: \${statusColor};">\${diagnostic.counts.indexedDB} shadows</div>
                        <div>Storage Manager:</div>
                        <div style="font-weight: bold;">\${diagnostic.storageManager.exists ? '✅ Exists' : '❌ Missing'}</div>
                        <div>DB Initialized:</div>
                        <div style="font-weight: bold;">\${diagnostic.storageManager.initialized ? '✅ Yes' : '❌ No'}</div>
                        <div>DB Connection:</div>
                        <div style="font-weight: bold;">\${diagnostic.storageManager.dbOpen ? '✅ Open' : '❌ Closed'}</div>
                        <div>Database Name:</div>
                        <div style="font-weight: bold; font-size: 10px;">\${diagnostic.storageManager.dbName}</div>
                        <div>User ID:</div>
                        <div style="font-weight: bold; font-size: 10px;">\${diagnostic.userId}</div>
                      </div>
                      \${diagnostic.sampleShadow ? \`
                        <div style="margin-top: 8px; padding: 6px; background: rgba(52, 211, 153, 0.1); border-radius: 4px; font-size: 10px;">
                          <strong>✅ Sample Shadow Found:</strong><br>
                          ID: \${diagnostic.sampleShadow.id}<br>
                          Rank: \${diagnostic.sampleShadow.rank}, Role: \${diagnostic.sampleShadow.role}<br>
                          Strength: \${diagnostic.sampleShadow.strength}
                        </div>
                      \` : ''}
                      \${diagnostic.errors.length > 0 ? \`
                        <div style="margin-top: 8px; padding: 6px; background: rgba(239, 68, 68, 0.1); border-radius: 4px; font-size: 10px; color: #ef4444;">
                          <strong>❌ Errors:</strong><br>
                          \${diagnostic.errors.map(e => '• ' + e).join('<br>')}
                        </div>
                      \` : ''}
                      \${diagnostic.counts.indexedDB > 0 && diagnostic.counts.localStorage === 0 ? \`
                        <div style="margin-top: 8px; padding: 6px; background: rgba(139, 92, 246, 0.2); border-radius: 4px; font-size: 10px; color: #a78bfa;">
                          <strong>💡 Note:</strong> Shadows are in IndexedDB (\${diagnostic.counts.indexedDB}) but not in localStorage. This is normal - IndexedDB is the primary storage. The settings panel shows localStorage count, but your actual shadows are in IndexedDB.
                        </div>
                      \` : ''}
                      \${diagnostic.counts.indexedDB === 0 && diagnostic.counts.localStorage === 0 ? \`
                        <div style="margin-top: 8px; padding: 6px; background: rgba(250, 204, 21, 0.2); border-radius: 4px; font-size: 10px; color: #facc15;">
                          <strong>⚠️ No Shadows Found:</strong><br>
                          • Try extracting shadows from dungeons<br>
                          • Check extraction probability settings (should be 1% base + 1% per INT)<br>
                          • Enable debug mode to see extraction attempts<br>
                          • Check if extraction events are being triggered
                        </div>
                      \` : ''}
                    </div>
                  \`;
                  return;
                }

                // Fallback to manual check

                // Check all storage locations
                const results = {
                  localStorage: (instance.settings?.shadows || []).length,
                  indexedDB: 0,
                  storageManager: !!instance.storageManager,
                  dbInitialized: false,
                  dbName: null,
                  userId: instance.userId || 'unknown',
                  migrationStatus: 'unknown',
                };

                // Check IndexedDB
                if (instance.storageManager) {
                  try {
                    results.dbName = instance.storageManager.dbName || 'unknown';
                    results.dbInitialized = instance.storageManager.db !== null;
                    results.indexedDB = await instance.getTotalShadowCount();

                    // Try to get a sample shadow to verify data exists
                    try {
                      const sampleShadows = await instance.storageManager.getShadows({}, 0, 1);
                      results.hasSampleData = sampleShadows.length > 0;
                      if (sampleShadows.length > 0) {
                        results.sampleShadow = {
                          id: sampleShadows[0].id,
                          rank: sampleShadows[0].rank,
                          role: sampleShadows[0].role,
                        };
                      }
                    } catch (sampleError) {
                      results.sampleError = sampleError.message;
                    }
                  } catch (error) {
                    results.indexedDBError = error.message;
                    results.indexedDBStack = error.stack;
                  }
                } else {
                  results.indexedDBError = 'Storage manager not initialized';
                }

                // Check migration status
                if (instance.storageManager) {
                  try {
                    const migrationFlag = BdApi.Data.load('ShadowArmy', 'migrationComplete_' + results.userId);
                    results.migrationStatus = migrationFlag ? 'Completed' : 'Not migrated';
                  } catch (e) {
                    results.migrationStatus = 'Unknown';
                  }
                }

                // Format results
                const statusColor = results.indexedDB > 0 ? '#34d399' : (results.indexedDBError ? '#ef4444' : '#facc15');
                resultDiv.innerHTML = \`
                  <div style="background: rgba(139, 92, 246, 0.15); padding: 12px; border-radius: 4px; margin-top: 8px; border: 1px solid rgba(139, 92, 246, 0.3);">
                    <div style="font-weight: bold; margin-bottom: 8px; color: #a78bfa;">📊 Storage Diagnostic Results:</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                      <div>localStorage:</div>
                      <div style="font-weight: bold;">\${results.localStorage} shadows</div>
                      <div>IndexedDB:</div>
                      <div style="font-weight: bold; color: \${statusColor};">\${results.indexedDB} shadows</div>
                      <div>Storage Manager:</div>
                      <div style="font-weight: bold;">\${results.storageManager ? '✅ Initialized' : '❌ Not initialized'}</div>
                      <div>DB Connection:</div>
                      <div style="font-weight: bold;">\${results.dbInitialized ? '✅ Open' : '❌ Closed'}</div>
                      <div>Database Name:</div>
                      <div style="font-weight: bold; font-size: 10px;">\${results.dbName}</div>
                      <div>User ID:</div>
                      <div style="font-weight: bold; font-size: 10px;">\${results.userId}</div>
                      <div>Migration:</div>
                      <div style="font-weight: bold;">\${results.migrationStatus}</div>
                    </div>
                    \${results.sampleShadow ? \`
                      <div style="margin-top: 8px; padding: 6px; background: rgba(52, 211, 153, 0.1); border-radius: 4px; font-size: 10px;">
                        <strong>✅ Sample Shadow Found:</strong> ID: \${results.sampleShadow.id}, Rank: \${results.sampleShadow.rank}, Role: \${results.sampleShadow.role}
                      </div>
                    \` : ''}
                    \${results.indexedDBError ? \`
                      <div style="margin-top: 8px; padding: 6px; background: rgba(239, 68, 68, 0.1); border-radius: 4px; font-size: 10px; color: #ef4444;">
                        <strong>❌ Error:</strong> \${results.indexedDBError}
                        \${results.indexedDBStack ? '<div style="font-size: 9px; opacity: 0.7; margin-top: 4px;">' + results.indexedDBStack.substring(0, 200) + '...</div>' : ''}
                      </div>
                    \` : ''}
                    \${results.indexedDB > 0 && results.localStorage === 0 ? \`
                      <div style="margin-top: 8px; padding: 6px; background: rgba(139, 92, 246, 0.2); border-radius: 4px; font-size: 10px; color: #a78bfa;">
                        <strong>💡 Note:</strong> Shadows are in IndexedDB (\${results.indexedDB}) but not in localStorage. This is normal - IndexedDB is the primary storage.
                      </div>
                    \` : ''}
                    \${results.indexedDB === 0 && results.localStorage === 0 ? \`
                      <div style="margin-top: 8px; padding: 6px; background: rgba(250, 204, 21, 0.2); border-radius: 4px; font-size: 10px; color: #facc15;">
                        <strong>⚠️ No Shadows Found:</strong> Try extracting shadows from dungeons. Check extraction probability settings.
                      </div>
                    \` : ''}
                  </div>
                \`;
              } catch (error) {
                resultDiv.innerHTML = '<span style="color: #ef4444;">Error: ' + error.message + '</span>';
              }
            });
          }

          // ARISE Animation Settings Event Listeners
          const ariseEnabled = document.getElementById('sa-arise-enabled');
          const ariseDuration = document.getElementById('sa-arise-duration');
          const ariseScale = document.getElementById('sa-arise-scale');
          const ariseShowMeta = document.getElementById('sa-arise-show-meta');

          if (ariseEnabled) {
            ariseEnabled.addEventListener('change', function(e) {
              const plugin = BdApi.Plugins.get('ShadowArmy');
              if (plugin && plugin.instance) {
                if (!plugin.instance.settings.ariseAnimation) {
                  plugin.instance.settings.ariseAnimation = {};
                }
                plugin.instance.settings.ariseAnimation.enabled = e.target.checked;
                plugin.instance.saveSettings();
              }
            });
          }

          if (ariseDuration) {
            ariseDuration.addEventListener('change', function(e) {
              const plugin = BdApi.Plugins.get('ShadowArmy');
              if (plugin && plugin.instance) {
                if (!plugin.instance.settings.ariseAnimation) {
                  plugin.instance.settings.ariseAnimation = {};
                }
                plugin.instance.settings.ariseAnimation.animationDuration = parseInt(e.target.value, 10) || 2500;
                plugin.instance.saveSettings();
              }
            });
          }

          if (ariseScale) {
            ariseScale.addEventListener('change', function(e) {
              const plugin = BdApi.Plugins.get('ShadowArmy');
              if (plugin && plugin.instance) {
                if (!plugin.instance.settings.ariseAnimation) {
                  plugin.instance.settings.ariseAnimation = {};
                }
                plugin.instance.settings.ariseAnimation.scale = parseFloat(e.target.value) || 1.0;
                plugin.instance.saveSettings();
              }
            });
          }

          if (ariseShowMeta) {
            ariseShowMeta.addEventListener('change', function(e) {
              const plugin = BdApi.Plugins.get('ShadowArmy');
              if (plugin && plugin.instance) {
                if (!plugin.instance.settings.ariseAnimation) {
                  plugin.instance.settings.ariseAnimation = {};
                }
                plugin.instance.settings.ariseAnimation.showRankAndRole = e.target.checked;
                plugin.instance.saveSettings();
              }
            });
          }
        })();
      </script>
    `;
  }

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT
  // ============================================================================

  // ============================================================================
  // 4.1 DEBUG SYSTEM
  // ============================================================================

  /**
   * Debug logging method with throttling and settings check
   * Operations:
   * 1. Check if debug mode is enabled
   * 2. Throttle frequent operations to prevent spam
   * 3. Format and output debug message
   * @param {string} tag - Operation tag (e.g., 'STORAGE', 'EXTRACTION')
   * @param {string} message - Debug message
   * @param {any} data - Optional data object
   */
  debugLog(tag, message, data = null) {
    if (!this.debug.enabled) return;

    // Throttle frequent operations (e.g., storage queries)
    const throttleKey = `${tag}:${message}`;
    const now = Date.now();
    const lastLogTime = this.debug.lastLogTimes[throttleKey] || 0;
    const throttleMs = 1000; // 1 second throttle for frequent operations

    if (now - lastLogTime < throttleMs) return;

    this.debug.lastLogTimes[throttleKey] = now;

    // Increment operation counter
    this.debug.operationCounts[tag] = (this.debug.operationCounts[tag] || 0) + 1;

    // Format debug message
    const prefix = `[ShadowArmy:${tag}]`;
    if (data !== null) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }

  // ============================================================================
  // 4.2 DEBUG HELPERS
  // ============================================================================

  /**
   * Debug error logging method
   * Operations:
   * 1. Always log errors (even if debug disabled for critical errors)
   * 2. Track error count and last error
   * 3. Format and output error message
   * @param {string} tag - Operation tag
   * @param {string} message - Error message
   * @param {Error|any} error - Error object or data
   */
  debugError(tag, message, error = null) {
    // Always log errors (even if debug disabled)
    this.debug.errorCount++;
    this.debug.lastError = { tag, message, error, timestamp: Date.now() };

    // Format error message
    const prefix = `[ShadowArmy:${tag}]`;
    if (error !== null) {
      console.error(prefix, message, error);
    } else {
      console.error(prefix, message);
    }
  }

  // ============================================================================
  // 4.3 DIAGNOSTIC TOOLS
  // ============================================================================

  /**
   * Diagnostic function to check all storage locations
   * Returns comprehensive storage status for debugging
   * Operations:
   * 1. Check storage manager initialization status
   * 2. Get shadow counts from both localStorage and IndexedDB
   * 3. Verify database connection and sample data
   * 4. Collect any errors encountered during checks
   * @returns {Promise<Object>} - Storage diagnostic information
   */
  async diagnoseStorage() {
    const diagnostic = {
      timestamp: Date.now(),
      userId: this.userId || 'unknown',
      storageManager: {
        exists: !!this.storageManager,
        initialized: false,
        dbOpen: false,
        dbName: null,
      },
      counts: {
        localStorage: (this.settings.shadows || []).length,
        indexedDB: 0,
      },
      errors: [],
      sampleShadow: null,
    };

    // Check storage manager
    if (this.storageManager) {
      diagnostic.storageManager.dbName = this.storageManager.dbName || 'unknown';
      diagnostic.storageManager.initialized = this.storageManager.db !== null;
      diagnostic.storageManager.dbOpen = this.storageManager.db !== null;

      // Try to get count
      try {
        diagnostic.counts.indexedDB = await this.storageManager.getTotalCount();
      } catch (error) {
        diagnostic.errors.push(`getTotalCount failed: ${error.message}`);
      }

      // Try to get a sample shadow
      try {
        const sampleShadows = await this.storageManager.getShadows({}, 0, 1);
        if (sampleShadows.length > 0) {
          diagnostic.sampleShadow = {
            id: sampleShadows[0].id,
            rank: sampleShadows[0].rank,
            role: sampleShadows[0].role,
            strength: sampleShadows[0].strength,
          };
        }
      } catch (error) {
        diagnostic.errors.push(`getShadows failed: ${error.message}`);
      }
    } else {
      diagnostic.errors.push('Storage manager not initialized');
    }

    return diagnostic;
  }
};
