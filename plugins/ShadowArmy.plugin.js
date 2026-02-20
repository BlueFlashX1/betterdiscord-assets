/**
 * @name ShadowArmy
 * @author BlueFlashX1
 * @description Solo Leveling Shadow Army system - Extract and collect shadows with ranks, roles, and abilities
 * @version 3.6.0
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 *
 * ============================================================================
 * PLUGIN DEPENDENCIES & API
 * ============================================================================
 * Requires:
 * - SoloLevelingStats: For user stats, intelligence-based extraction
 *
 * Provides:
 * - Shadow extraction system (dungeons + messages)
 * - Shadow storage and management
 * - Shadow combat stats and calculations
 * - Shadow buffs for user stats
 *
 * PUBLIC API FOR OTHER PLUGINS:
 * - getShadowCount() - Returns Promise<number>
 * - getAllShadows() - Returns Promise<Array<Shadow>>
 * - getShadowEffectiveStats(shadow) - Returns Object<stats>
 * - calculateShadowPower(stats, multiplier) - Returns number
 * - getAggregatedArmyStats() - Returns Promise<Object> { totalShadows, totalPower, totalStats, byRank, byRole, avgLevel } (direct calculation, no cache)
 * - attemptDungeonExtraction(bossId, userRank, userLevel, userStats, mobRank, mobStats, mobStrength, beastFamilies, isBoss) - Returns Promise<Object>
 * - grantShadowXP(amount, reason, shadowIds) - Returns Promise<void>
 * - getShadowData(shadow) - Returns Object (decompressed shadow)
 * - calculateShadowAttackInterval(shadow, baseInterval) - Returns number
 * - calculateShadowDamage(shadow, target) - Returns number
 * - selectTargetForShadow(shadow, availableTargets) - Returns Object
 * - getShadowPersonality(shadow) - Returns Object
 * - processMobAttackOnShadow(mob, shadows) - Returns Object
 * - Event: Emits 'ShadowArmy:shadowExtracted' when shadow is extracted
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
 * @changelog v3.6.0 (2026-02-17) - REACT WIDGET MIGRATION
 * - Migrated member list sidebar widget from innerHTML to React components
 * - Added buildWidgetComponents() factory with ShadowArmyWidget + RankBox
 * - Uses createRoot into widget container; MutationObserver injection unchanged
 * - Widget updates via forceUpdate (React diffs only changed rank counts)
 * - Deleted ~130 lines of innerHTML generation from updateShadowRankWidget
 *
 * @changelog v3.4.0 (2025-12-08) - EVENT-BASED SYNC & API DOCUMENTATION
 * SYNC IMPROVEMENTS:
 * - Added event emission on shadow extraction ('ShadowArmy:shadowExtracted')
 * - Events notify other plugins (Dungeons) immediately when shadows are extracted
 * - Supports both BdApi.Events and DOM events (fallback)
 * - Enables real-time cache invalidation in dependent plugins
 *
 * API DOCUMENTATION:
 * - Added comprehensive API documentation in plugin header
 * - Documented all public methods for plugin cooperation
 * - Clear dependency and provider information
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
 * - Magic beasts are marked in the UI
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
 * - BdApi.Plugins.get for plugin integration (SoloLevelingStats)
 * - ARISE Animation system integrated (merged from ShadowAriseAnimation plugin)
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
/* eslint-env browser */
/* global CustomEvent */

const SHADOW_PERSONALITY_ROLE_MAP = {
  tank: 'tank',
  healer: 'supportive',
  support: 'supportive',
  mage: 'strategic',
  ranger: 'tactical',
  assassin: 'aggressive',
  berserker: 'aggressive',
  knight: 'balanced',
  ant: 'aggressive',
  bear: 'aggressive',
  wolf: 'tactical',
  spider: 'strategic',
  centipede: 'strategic',
  golem: 'tank',
  serpent: 'strategic',
  naga: 'strategic',
  wyvern: 'tactical',
  dragon: 'aggressive',
  titan: 'aggressive',
  giant: 'aggressive',
  elf: 'strategic',
  demon: 'aggressive',
  ghoul: 'aggressive',
  orc: 'aggressive',
  ogre: 'aggressive',
  yeti: 'tank',
};

function normalizeShadowPersonalityValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function deriveShadowPersonalityFromRole(role) {
  const normalizedRole = normalizeShadowPersonalityValue(role);
  if (!normalizedRole) return '';
  return SHADOW_PERSONALITY_ROLE_MAP[normalizedRole] || 'balanced';
}

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
    this.dbVersion = 3; // v3 adds personalityKey normalization index
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

    // Note: Aggregation cache removed - using direct calculations instead

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

    this.personalityMigrationFlagKey = `personalityKeyMigrationCompleted_${this.userId}`;
    try {
      this.personalityKeyMigrationCompleted =
        BdApi.Data.load('ShadowArmy', this.personalityMigrationFlagKey) === true;
    } catch (error) {
      this.debugError('STORAGE', 'Failed to load personality migration flag', error);
      this.personalityKeyMigrationCompleted = false;
    }

    // Note: Natural growth tracking is stored per-shadow (lastNaturalGrowth) in records
    // and does not require a manager-level timestamp.
  }

  // ============================================================================
  // STORAGE 2.2 SHADOW DATA HELPERS
  // ============================================================================

  // ============================================================================
  // STORAGE 2.3 VALIDATION HELPERS
  // ============================================================================

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

    // Ensure field exists on all records so index queries remain predictable.
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

  // ============================================================================
  // COMBAT ENTITY NORMALIZATION HELPERS
  // ============================================================================
  /**
   * Normalize a shadow object for combat so all downstream code can rely on:
   * - a stable `id`
   * - consistent `rank`
   * - decompressed stats when possible
   *
   * NOTE: This returns a new object when it needs to add `id` to old/compressed shapes.
   * It does NOT mutate the input.
   *
   * @param {Object} shadow
   * @returns {Object|null}
   */
  normalizeShadowForCombat(shadow) {
    const shadowId = this.getCacheKey(shadow);
    if (!shadowId) return null;

    const decompressed =
      typeof this.getShadowData === 'function' ? this.getShadowData(shadow) || shadow : shadow;

    // Ensure an `id` exists for combat/caches even if the record uses only `i`.
    return decompressed?.id
      ? decompressed
      : {
          ...decompressed,
          id: shadowId,
          i: decompressed?.i || shadow?.i,
        };
  }

  /**
   * Normalize a target (mob/boss/elite) object for combat.
   * Supports the minimal target shapes passed in from Dungeons (type/rank/strength only).
   *
   * @param {Object} target
   * @returns {Object}
   */
  normalizeTargetForCombat(target) {
    const safeTarget = target && typeof target === 'object' ? target : {};
    const type = safeTarget.type || 'mob';
    const id = safeTarget.id || safeTarget.name || (type === 'boss' ? 'boss' : 'unknown');
    const rank = safeTarget.rank || 'E';

    const hp = Number.isFinite(safeTarget.hp) ? safeTarget.hp : 0;
    const maxHp = Number.isFinite(safeTarget.maxHp) ? safeTarget.maxHp : hp;

    const stats =
      safeTarget.stats && typeof safeTarget.stats === 'object' ? safeTarget.stats : safeTarget;

    return {
      ...safeTarget,
      id,
      type,
      rank,
      hp,
      maxHp: Math.max(maxHp, hp),
      strength: Number.isFinite(stats.strength) ? stats.strength : 0,
      agility: Number.isFinite(stats.agility) ? stats.agility : 0,
      intelligence: Number.isFinite(stats.intelligence) ? stats.intelligence : 0,
      vitality: Number.isFinite(stats.vitality) ? stats.vitality : 0,
      perception: Number.isFinite(stats.perception) ? stats.perception : 0,
    };
  }

  /**
   * Invalidate cache entries for a shadow (handles both id and i)
   * @param {Object} shadow - Shadow object to invalidate
   */
  invalidateCache(shadow) {
    if (!shadow) return;
    const id = shadow.id || shadow.i;
    if (id) this.recentCache.delete(id);
    if (shadow.id && shadow.i && shadow.id !== shadow.i) {
      this.recentCache.delete(shadow.i);
    }
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
    const shadowId = this.getCacheKey(shadow);
    if (!shadow || !shadowId) return;

    // Invalidate old cache entries if shadow state changed (compression/decompression)
    if (oldShadow) {
      this.invalidateCache(oldShadow);
    }

    // Add to recent cache (LRU) — delete first to move to end
    this.recentCache.delete(shadowId);
    this.recentCache.set(shadowId, shadow);

    // Evict oldest if recent cache limit reached
    if (this.recentCache.size > this.cacheLimit) {
      const firstKey = this.recentCache.keys().next().value;
      this.recentCache.delete(firstKey);
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
    // Note: Aggregation cache removed - using direct calculations instead
    this.debugLog('CACHE', 'Recent cache cleared');
  }

  // ============================================================================
  // STORAGE 2.5 UTILITY HELPERS
  // ============================================================================

  /**
   * Get shadow in correct format (decompress if needed)
   * Used throughout storage manager to handle both compressed and full formats transparently.
   * @param {Object} shadow
   * @returns {Object|null}
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

  // calculateShadowPower: Primary definition is in Section 3.7 (delegates to calculateShadowStrength)

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
          objectStore.createIndex('personality', 'personality', { unique: false });
          objectStore.createIndex('personalityKey', 'personalityKey', { unique: false });

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

          // Add index for personality (for fast combat queries)
          if (!objectStore.indexNames.contains('personality')) {
            objectStore.createIndex('personality', 'personality', { unique: false });
          }

          this.debugLog('INIT', 'Added v2 indexes for natural growth', { oldVersion });
        }

        if (oldVersion < 3) {
          const transaction = event.target.transaction;
          const objectStore = transaction.objectStore(this.storeName);
          if (!objectStore.indexNames.contains('personalityKey')) {
            objectStore.createIndex('personalityKey', 'personalityKey', { unique: false });
          }
          this.debugLog('INIT', 'Added v3 index for personality key normalization', {
            oldVersion,
          });
        }
      };
    });
  }

  /**
   * Execute a function within an IndexedDB transaction
   * Eliminates boilerplate for db init check, transaction creation, error handling
   * @param {string} mode - 'readonly' or 'readwrite'
   * @param {Function} fn - (store, transaction, resolve, reject) => void
   * @returns {Promise<*>}
   */
  async _withStore(mode, fn) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      // Relaxed durability: don't wait for disk flush before resolving oncomplete.
      // Shadow data isn't mission-critical — reduces write latency and memory pressure.
      // Supported since Chrome 121 (Electron/Discord uses modern Chromium).
      const transaction = this.db.transaction([this.storeName], mode, { durability: 'relaxed' });
      const store = transaction.objectStore(this.storeName);
      transaction.onerror = () => reject(transaction.error);
      fn(store, transaction, resolve, reject);
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

  /**
   * Backfill personalityKey for all existing IndexedDB shadow records in batches.
   * This makes personality queries index-friendly and avoids full scans.
   *
   * @param {Object} options
   * @param {number} options.batchSize - Max records per transaction batch
   * @returns {Promise<{scanned:number,updated:number,errors:number,batches:number}>}
   */
  async migratePersonalityKeys({ batchSize = 1000 } = {}) {
    if (!this.db) await this.init();

    const safeBatchSize = Math.max(100, Math.floor(batchSize) || 1000);
    const MAX_BATCHES = 500; // Safety cap: 500 batches × 1000 = 500K shadows max
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
            // Defer this row to the next batch to keep transactions short.
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
          updateRequest.onsuccess = () => {
            localUpdated++;
          };
          updateRequest.onerror = () => {
            localErrors++;
          };
          cursor.continue();
        };
        request.onerror = () => reject(request.error);

        tx.oncomplete = () => {
          resolve({
            scanned: localScanned,
            updated: localUpdated,
            errors: localErrors,
            nextKey,
            cursorFinished,
          });
        };
        tx.onerror = () => reject(tx.error);
      });

      scanned += batchResult.scanned;
      updated += batchResult.updated;
      errors += batchResult.errors;
      batches++;

      // Stop if cursor exhausted all records or batch was empty
      if (batchResult.cursorFinished || batchResult.scanned === 0) {
        break;
      }

      if (batchResult.nextKey == null) {
        break;
      }
      lastKey = batchResult.nextKey;

      // Yield to UI/event loop between large batches.
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

    return {
      migrated: true,
      ...result,
    };
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
    if (!shadow || !this.getCacheKey(shadow)) {
      throw new Error('Invalid shadow object: missing id or i');
    }

    // Validate required fields for non-compressed shadows to prevent corrupted IDB entries
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
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) return 0;

    return this._withStore('readwrite', (store, tx, resolve) => {
      let completed = 0;
      let errors = 0;
      const total = shadows.length;

      tx.oncomplete = () => resolve(completed);

      shadows.forEach((shadow, index) => {
        const shadowId = this.getCacheKey(shadow);
        if (!shadow || !shadowId) {
          errors++;
          this.debugError('BATCH_SAVE', `Invalid shadow at index ${index}`, { index });
          return;
        }
        const { shadow: normalizedShadow } = this.ensurePersonalityKey(shadow);
        const request = store.put(normalizedShadow);
        request.onsuccess = () => {
          completed++;
        };
        request.onerror = () => {
          errors++;
          this.debugError('BATCH_SAVE', `Failed to save shadow at index ${index}`, {
            index,
            id: shadowId,
            error: request.error,
          });
        };
      });
    });
  }

  /**
   * Chunked batch save — writes shadows in small sequential IDB transactions with
   * event-loop yields between chunks. Prevents OOM by letting V8 GC structured-clone
   * buffers after each chunk commits, instead of holding everything in one mega-transaction.
   *
   * Chromium's IDB holds the ENTIRE write buffer in memory until transaction commit.
   * A single transaction with 50+ shadows can spike 2-3x the raw data size in memory.
   * Chunking at 10 shadows/tx keeps peak write buffer at ~50 KB per chunk.
   *
   * @param {Array} shadows - Array of shadow objects to save
   * @param {number} chunkSize - Shadows per IDB transaction (default: 10)
   * @returns {Promise<number>} Total shadows saved
   */
  async saveShadowsChunked(shadows, chunkSize = 10) {
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) return 0;

    // Small batches can go through the single-transaction path safely
    if (shadows.length <= chunkSize) {
      return this.saveShadowsBatch(shadows);
    }

    let totalSaved = 0;
    for (let i = 0; i < shadows.length; i += chunkSize) {
      const chunk = shadows.slice(i, i + chunkSize);
      const saved = await this.saveShadowsBatch(chunk);
      totalSaved += saved;

      // Yield to event loop between chunks — lets V8 GC the previous chunk's
      // structured-clone write buffers before allocating the next batch
      if (i + chunkSize < shadows.length) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
    return totalSaved;
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
    if (offset < 0) offset = 0;
    if (limit < 1) limit = 50;
    // No hard cap — getAll() loads everything anyway (single native IDB call).
    // Callers that need ALL shadows (power calc, compression, army display)
    // should get ALL shadows. The OOM fix is getAll() vs cursor, not truncation.

    // Check if any filters are actually active
    const hasFilters = !!(filters.rank || filters.role || filters.minLevel || filters.maxLevel || filters.minStrength);

    return this._withStore('readonly', (store, _tx, resolve, reject) => {
      // FAST PATH: No filters — use IDB getAll() which is native, memory-efficient,
      // and avoids cursor iteration. Handles the vast majority of calls
      // (getAllShadowsForAggregation, getTotalShadowPower, widget refresh, etc.)
      if (!hasFilters) {
        const request = store.getAll();
        request.onsuccess = () => {
          let results = request.result || [];
          // Sort in-memory (still needed for pagination correctness)
          results.sort((a, b) => {
            const aVal = a[sortBy] || 0;
            const bVal = b[sortBy] || 0;
            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
          });
          resolve(results.slice(offset, offset + limit));
        };
        request.onerror = () => reject(request.error);
        return;
      }

      // FILTERED PATH: Use cursor with index optimization
      let index = store;
      if (filters.rank && filters.role) {
        try {
          index = store.index('rank_role');
        } catch (e) {
          /* fallback to store */
        }
      } else if (filters.rank) {
        try {
          index = store.index('rank');
        } catch (e) {
          /* fallback to store */
        }
      } else if (filters.role) {
        try {
          index = store.index('role');
        } catch (e) {
          /* fallback to store */
        }
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
          resolve(results.slice(offset, offset + limit));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // getShadowEffectiveStats: Primary definition is in Section 3.11 (with null guard + zero-stats fallback)

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
    return this._withStore('readonly', (store, _tx, resolve) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
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
    if (!shadows || !Array.isArray(shadows) || shadows.length === 0) return 0;

    return this._withStore('readwrite', (store, tx, resolve) => {
      let completed = 0;
      let errors = 0;

      tx.oncomplete = () => resolve(completed);

      shadows.forEach((shadow, index) => {
        if (!shadow) {
          errors++;
          return;
        }
        const idForStore = this.getCacheKey(shadow);
        if (!idForStore) {
          errors++;
          this.debugError('BATCH_UPDATE', `Invalid shadow at index ${index}`, {
            index,
            hasI: !!shadow.i,
            hasId: !!shadow.id,
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
            index,
            id: this.getCacheKey(normalizedShadow),
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
    if (!shadowIds || !Array.isArray(shadowIds) || shadowIds.length === 0) return 0;

    return this._withStore('readwrite', (store, tx, resolve) => {
      let completed = 0;
      let errors = 0;

      tx.oncomplete = () => resolve(completed);

      shadowIds.forEach((id, index) => {
        if (!id) {
          errors++;
          return;
        }
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
   * Calculate weak shadow power directly (no cache)
   * Weak shadows are 2+ ranks below user rank, used for buffs
   * @param {string} userRank - User's current rank
   * @param {Array<string>} shadowRanks - Array of shadow ranks in order
   * @returns {Promise<Object>} - { totalPower, totalCount, ranks, timestamp }
   */
  async getAggregatedPower(userRank, shadowRanks) {
    const emptyResult = { totalPower: 0, totalCount: 0, ranks: [], timestamp: Date.now() };
    if (!userRank || !shadowRanks || !Array.isArray(shadowRanks)) return emptyResult;

    const userRankIndex = shadowRanks.indexOf(userRank);
    if (userRankIndex === -1) return emptyResult;

    const weakRanks = shadowRanks.slice(0, Math.max(0, userRankIndex - 2) + 1);
    if (weakRanks.length === 0) return emptyResult;

    // Resolve shadow strength from various storage formats
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

  // ============================================================================
  // 3.5.1 QUERY OPTIMIZATION HELPERS (Indexed Queries)
  // ============================================================================
  // These are optimized query methods that use IndexedDB indexes directly

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
    return this._withStore('readonly', (store, _tx, resolve) => {
      const request = store.index('rank').count(rank);
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => resolve(0);
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

// Load UnifiedSaveManager for crash-resistant IndexedDB storage
let UnifiedSaveManager;
try {
  if (typeof window !== 'undefined' && typeof window.UnifiedSaveManager === 'function') {
    UnifiedSaveManager = window.UnifiedSaveManager;
  } else {
    const fs = require('fs');
    const path = require('path');
    const pluginFolder =
      (BdApi?.Plugins?.folder && typeof BdApi.Plugins.folder === 'string'
        ? BdApi.Plugins.folder
        : null) ||
      (typeof __dirname === 'string' ? __dirname : null);
    if (pluginFolder) {
      const saveManagerPath = path.join(pluginFolder, 'UnifiedSaveManager.js');
      if (fs.existsSync(saveManagerPath)) {
        const saveManagerCode = fs.readFileSync(saveManagerPath, 'utf8');
        const moduleSandbox = { exports: {} };
        const exportsSandbox = moduleSandbox.exports;
        const loader = new Function(
          'window',
          'module',
          'exports',
          `${saveManagerCode}\nreturn module.exports || (typeof UnifiedSaveManager !== 'undefined' ? UnifiedSaveManager : null) || (window && window.UnifiedSaveManager) || null;`
        );
        UnifiedSaveManager = loader(
          typeof window !== 'undefined' ? window : undefined,
          moduleSandbox,
          exportsSandbox
        );
        if (UnifiedSaveManager && typeof window !== 'undefined') {
          window.UnifiedSaveManager = UnifiedSaveManager;
        }
      } else {
        UnifiedSaveManager = typeof window !== 'undefined' ? window.UnifiedSaveManager || null : null;
      }
    } else {
      UnifiedSaveManager = typeof window !== 'undefined' ? window.UnifiedSaveManager || null : null;
    }
  }
} catch (error) {
  console.warn('[ShadowArmy] Failed to load UnifiedSaveManager:', error);
  UnifiedSaveManager = typeof window !== 'undefined' ? window.UnifiedSaveManager || null : null;
}

// ============================================================================
// REACT COMPONENT FACTORY (v3.6.0 — replaces innerHTML widget rendering)
// ============================================================================
function buildWidgetComponents(pluginInstance) {
  const React = BdApi.React;
  const ce = React.createElement;

  const RANKS = ['Monarch+', 'Monarch', 'NH', 'SSS+', 'SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E'];
  const RANK_COLORS = {
    'Monarch+': '#ff6b2b', Monarch: '#ff4500', NH: '#e040fb', 'SSS+': '#f50057',
    SSS: '#ec4899', SS: '#ef4444', S: '#f59e0b', A: '#8a2be2',
    B: '#3b82f6', C: '#22c55e', D: '#a0a0a0', E: '#999',
  };
  const RANK_LABELS = { 'Monarch+': 'M+', Monarch: 'M', NH: 'NH', 'SSS+': 'SSS+' };
  const ELITE_RANKS = new Set(['Monarch+', 'Monarch', 'NH', 'SSS+']);

  function formatPower(raw) {
    if (!raw) return '0';
    if (raw >= 1e6) return (raw / 1e6).toFixed(1) + 'M';
    if (raw >= 1e3) return (raw / 1e3).toFixed(1) + 'K';
    return String(Math.floor(raw));
  }

  // ── RankBox ──
  function RankBox({ rank, count, color, isElite }) {
    const label = RANK_LABELS[rank] || rank;
    const boxStyle = {
      textAlign: 'center',
      padding: isElite ? '3px 2px' : '4px',
      background: isElite ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.4)',
      borderRadius: '4px',
      border: `1px solid ${color}${isElite ? '60' : '40'}`,
      boxShadow: isElite && count > 0 ? `0 0 6px ${color}30` : undefined,
      transition: 'all 0.2s ease',
    };
    const labelStyle = {
      color,
      fontSize: isElite ? '8px' : '10px',
      fontWeight: 'bold',
      textShadow: isElite && count > 0 ? `0 0 4px ${color}` : 'none',
    };
    const countStyle = {
      color: count > 0 ? '#fff' : '#555',
      fontSize: isElite ? '12px' : '14px',
      fontWeight: 'bold',
    };
    return ce('div', { className: 'rank-box', style: boxStyle },
      ce('div', { className: 'rank-label', style: labelStyle }, label),
      ce('div', { className: 'rank-count', style: countStyle }, count)
    );
  }

  // ── ShadowArmyWidget ──
  function ShadowArmyWidget() {
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
    const [data, setData] = React.useState(null);

    // Expose forceUpdate to plugin
    React.useEffect(() => {
      pluginInstance._widgetForceUpdate = forceUpdate;
      return () => { pluginInstance._widgetForceUpdate = null; };
    }, [forceUpdate]);

    // Fetch rank data on mount + whenever forceUpdate is called
    const fetchIdRef = React.useRef(0);
    React.useEffect(() => {
      const id = ++fetchIdRef.current;
      (async () => {
        try {
          let rankCounts, totalCount;
          const sm = pluginInstance.storageManager;
          if (sm?.getCountByRank) {
            try {
              const counts = await Promise.all(
                RANKS.map(async (rank) => ({
                  rank, count: await sm.getCountByRank(rank), color: RANK_COLORS[rank] || '#999',
                }))
              );
              totalCount = (await sm.getTotalCount()) || counts.reduce((s, r) => s + r.count, 0);
              rankCounts = counts;
            } catch (_) {
              const shadows = pluginInstance.settings.shadows || [];
              totalCount = shadows.length;
              const map = shadows.reduce((c, s) => { c[s.rank || 'E'] = (c[s.rank || 'E'] || 0) + 1; return c; }, {});
              rankCounts = RANKS.map((rank) => ({ rank, count: map[rank] || 0, color: RANK_COLORS[rank] || '#999' }));
            }
          } else {
            const shadows = pluginInstance.settings.shadows || [];
            totalCount = shadows.length;
            const map = shadows.reduce((c, s) => { c[s.rank || 'E'] = (c[s.rank || 'E'] || 0) + 1; return c; }, {});
            rankCounts = RANKS.map((rank) => ({ rank, count: map[rank] || 0, color: RANK_COLORS[rank] || '#999' }));
          }
          if (id === fetchIdRef.current) setData({ rankCounts, totalCount });
        } catch (err) {
          pluginInstance.debugError?.('WIDGET', 'Error fetching widget data', err);
        }
      })();
    });

    if (!data) return null;
    const { rankCounts, totalCount } = data;
    const totalPower = formatPower(pluginInstance.settings.cachedTotalPower || 0);
    const eliteRanks = rankCounts.filter((r) => ELITE_RANKS.has(r.rank));
    const standardRanks = rankCounts.filter((r) => !ELITE_RANKS.has(r.rank));

    // Empty state
    if (totalCount === 0) {
      return ce(React.Fragment, null,
        ce('div', { className: 'widget-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
          ce('div', { className: 'widget-title', style: { color: '#8a2be2', fontSize: '12px', fontWeight: 'bold' } }, 'MY SHADOW ARMY'),
          ce('div', { className: 'widget-total', style: { color: '#999', fontSize: '11px' } }, '0 Total')
        ),
        ce('div', { style: { textAlign: 'center', padding: '20px', color: '#999', fontSize: '11px' } }, 'No shadows yet')
      );
    }

    return ce(React.Fragment, null,
      // Header
      ce('div', { className: 'widget-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
        ce('div', { className: 'widget-title', style: { color: '#8a2be2', fontSize: '12px', fontWeight: 'bold', textShadow: '0 0 8px rgba(138, 43, 226, 0.8)' } }, 'MY SHADOW ARMY'),
        ce('div', { className: 'widget-total', style: { color: '#999', fontSize: '11px' } }, totalCount + ' Total')
      ),
      // Power bar
      ce('div', { className: 'widget-power', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px', padding: '6px 8px', background: 'rgba(0, 0, 0, 0.8)', border: '1px solid rgba(138, 43, 226, 0.5)', borderRadius: '4px' } },
        ce('span', { style: { color: '#8a2be2', fontSize: '11px', fontWeight: '600', textShadow: '0 0 4px rgba(138, 43, 226, 0.6)', fontFamily: "'Orbitron', sans-serif" } }, '\u2694 Total Power: ' + totalPower)
      ),
      // Elite ranks grid
      ce('div', { className: 'elite-rank-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '6px' } },
        eliteRanks.map(({ rank, count, color }) => ce(RankBox, { key: rank, rank, count, color, isElite: true }))
      ),
      // Standard ranks grid
      ce('div', { className: 'rank-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' } },
        standardRanks.map(({ rank, count, color }) => ce(RankBox, { key: rank, rank, count, color, isElite: false }))
      ),
      // Footer
      ce('div', { className: 'widget-footer', style: { marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(138, 43, 226, 0.2)', textAlign: 'center', color: '#888', fontSize: '9px' } }, 'Click to manage shadows')
    );
  }

  return { ShadowArmyWidget, RankBox };
}

let _ReactUtils;
try { _ReactUtils = require('./BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }

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
      shadows: [], // DEPRECATED: Shadows are stored in IndexedDB via storageManager, not in settings
      // This array is kept for backwards compatibility during migration period only
      totalShadowsExtracted: 0,
      lastExtractionTime: null,
      cachedTotalPower: 0, // Cached total power for SoloLevelingStats progress bar (incremental cache)
      cachedTotalPowerTimestamp: 0, // Timestamp of when power was cached
      cachedTotalPowerShadowCount: 0, // Shadow count when power was cached (for validation)
      cachedTotalPowerVersion: 1, // Cache version (increment on full recalculation)
      extractionConfig: {
        // Base extraction tuning (regular messages)
        minBaseChance: 0.01, // 1% minimum (reasonable starting chance)
        chancePerInt: 0.01, // +1% per INT point (more impactful)
        maxExtractionChance: 0.3, // 30% cap for regular messages (dungeons skip this cap via skipCap=true)
        maxExtractionsPerMinute: 20, // hard safety cap
        messageQueueInitialDelayMs: 120, // Delay before first queued extraction after a message
        messageQueueIntervalMs: 450, // Gap between queued message extraction attempts
        messageQueueMaxPending: 20, // Max queued extraction attempts kept during message spam
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
        enabled: false, // Manual conversion only (user controls via button)
        essence: 0, // Total essence accumulated
        lastConversionTime: null,
        conversionIntervalHours: 1, // Convert weakest shadows every hour (disabled when enabled=false)
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
        minGapMs: 900, // Minimum gap between ARISE animations (prevents burst spam)
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

    // Initialize UnifiedSaveManager for crash-resistant IndexedDB storage
    this.saveManager = null;
    if (typeof UnifiedSaveManager === 'function') {
      try {
        this.saveManager = new UnifiedSaveManager('ShadowArmy');
      } catch (e) {
        console.warn('[ShadowArmy] UnifiedSaveManager initialization failed:', e.message);
      }
    }

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

    // Cache for Solo Leveling data (user stats, rank, level)
    this._soloDataCache = null;
    this._soloDataCacheTime = 0;
    this._soloDataCacheTTL = 500; // 500ms TTL - stats don't change frequently

    // CSS management tracking
    this._injectedStyles = new Set(); // Track all injected CSS styles for cleanup

    // Solo Leveling Stats plugin integration
    this.soloPlugin = null;
    this.originalProcessMessage = null;
    this._messageProcessWrapper = null;
    this._extractionTimestamps = [];
    this._pendingMessageExtractionCount = 0;
    this._isProcessingMessageExtractionQueue = false;
    this._messageExtractionQueueTimeout = null;

    // UI elements (widgets used instead)
    this.shadowArmyModal = null;

    // ARISE Animation system (merged from ShadowAriseAnimation plugin)
    this.animationContainer = null; // Animation container element
    this._lastAriseAnimationAt = 0;
    this._pendingAriseShadow = null;
    this._ariseDrainTimeout = null;
    this.webpackModules = {
      UserStore: null,
      ChannelStore: null,
      PermissionStore: null,
      Permissions: null,
    };
    this.webpackModuleAccess = false;
    this.reactInjectionActive = false;

    // ============================================================================
    // LIFECYCLE STATE - Cleanup Tracking
    // ============================================================================
    // Track all retry timeouts for proper cleanup
    this._retryTimeouts = new Set();
    this._isStopped = false;
    // PERF: Dirty flag — skip widget/modal IDB queries when no data has changed
    this._widgetDirty = true; // Start dirty so first update runs
    this._postExtractionDebounceTimer = null; // Debounce post-extraction cascade

    // React widget refs (v3.6.0)
    this._widgetReactRoot = null;
    this._widgetForceUpdate = null;
    this._widgetComponents = null;

    // ============================================================================
    // DEBUG SYSTEM - Property initialization (methods in SECTION 4)
    // ============================================================================
    // Debug logging system (default disabled, enabled via settings)
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
    // SNAPSHOT CACHE: Instance-level (NOT in this.settings — must not be persisted to disk)
    this._snapshotCache = null;
    this._snapshotTimestamp = 0;
    this._pendingMessageExtractionCount = 0;
    this._isProcessingMessageExtractionQueue = false;
    this._messageExtractionQueueTimeout = null;
    this._lastAriseAnimationAt = 0;
    this._pendingAriseShadow = null;
    this._ariseDrainTimeout = null;

    this._widgetComponents = buildWidgetComponents(this);
    this._setupDiscordMediaErrorSuppression();

    // Get user ID for storage isolation
    this.userId = await this.getUserId();

    // Initialize IndexedDB storage
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

      // Initialize UnifiedSaveManager (IndexedDB) for settings
      if (this.saveManager) {
        try {
          await this.saveManager.init();
          this.debugLog('START', 'UnifiedSaveManager initialized (IndexedDB)');
        } catch (error) {
          this.debugError('START', 'Failed to initialize UnifiedSaveManager', error);
          this.saveManager = null; // Fallback to BdApi.Data
        }
      }

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

      // Ensure personalityKey exists on all records for indexed personality queries.
      try {
        const personalityMigration = await this.storageManager.ensurePersonalityKeyMigration(false);
        if (personalityMigration?.migrated) {
          this.debugLog('MIGRATION', 'Personality key migration completed', {
            scanned: personalityMigration.scanned || 0,
            updated: personalityMigration.updated || 0,
            errors: personalityMigration.errors || 0,
            batches: personalityMigration.batches || 0,
          });
        }
      } catch (error) {
        this.debugError('MIGRATION', 'Personality key migration failed', error);
      }

      // Verify storage is working by checking count
      const initialCount = await this.storageManager.getTotalCount();
      // Check for old shadows in settings (should be empty after migration)
      const oldShadowsInSettings = (this.settings.shadows || []).length;

      // Clear shadows from settings if they exist (they're in IndexedDB now)
      if (oldShadowsInSettings > 0) {
        this.debugLog(
          'STORAGE',
          'Clearing old shadows from settings after IndexedDB initialization',
          {
            oldCount: oldShadowsInSettings,
            indexedDBCount: initialCount,
          }
        );
        this.settings.shadows = [];
        this.saveSettings(); // Save without shadows array
      }

      this.debugLog('STORAGE', `IndexedDB initialized successfully`, {
        indexedDBShadows: initialCount,
        oldShadowsInSettings: oldShadowsInSettings,
        userId: this.userId,
        dbName: this.storageManager?.dbName || 'unknown',
        migrationCompleted: migrationResult?.migrated > 0,
      });

      if (initialCount > 0) {
        this.debugLog('STORAGE', 'IndexedDB initialized with shadows', {
          shadowCount: initialCount,
        });

        // Trigger background recalculation using direct power calculation (faster)
        this.getTotalShadowPower(true) // Force full recalculation on startup
          .then((power) => {
            if (power > 0) {
              this.debugLog('STORAGE', 'Recalculated total power after IndexedDB init', {
                totalPower: power,
                shadowCount: initialCount,
              });
            }
          })
          .catch((error) => {
            this.debugError(
              'STORAGE',
              'Failed to recalculate total power after IndexedDB init',
              error
            );
          });
      }

      // Warn if there's a mismatch (old data in settings but not in IndexedDB)
      if (oldShadowsInSettings > 0 && initialCount === 0 && !migrationResult?.migrated) {
        this.debugLog(
          'STORAGE',
          'WARNING: Old shadows found in settings but not in IndexedDB - migration may be needed',
          {
            oldShadowsInSettings,
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

    await this.loadSettings();

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

    // Run all data migrations (versioned, sequential, idempotent)
    try {
      await this.runDataMigrations();
    } catch (error) {
      this.debugError('MIGRATION', 'Data migration runner failed', error);
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
    const compressionTimeoutId = setTimeout(() => {
      this._retryTimeouts.delete(compressionTimeoutId);
      if (this._isStopped) return;
      this.processShadowCompression();
    }, 600000); // 10 minutes after start
    this._retryTimeouts.add(compressionTimeoutId);

    // REMOVED: No automatic army trimming — user controls army size manually
    // Emergency essence conversion disabled to prevent shadow loss on restart
    // const emergencyTimeoutId = setTimeout(() => {
    //   this._retryTimeouts.delete(emergencyTimeoutId);
    //   if (this._isStopped) return;
    //   this.processEmergencyCleanup();
    // }, 900000); // 15 minutes after start
    // this._retryTimeouts.add(emergencyTimeoutId);

    // Then process every hour
    this.naturalGrowthInterval = setInterval(() => {
      this.processNaturalGrowthForAllShadows();
      this.processShadowCompression(); // Compress weak shadows (tiered system)
      // Automatic essence conversion disabled - use manual conversion button instead
      // this.processShadowEssenceConversion(); // Regular cleanup: Convert weakest shadows to essence
    }, 60 * 60 * 1000); // 1 hour

    // Shadow rank widget for member list display (chatbox button still disabled)
    const widgetStartupTimeoutId = setTimeout(() => {
      this._retryTimeouts.delete(widgetStartupTimeoutId);
      if (this._isStopped) return;
      this.injectShadowRankWidget();
    }, 100);
    this._retryTimeouts.add(widgetStartupTimeoutId);

    // Update widget every 30 seconds (only if data changed)
    this.widgetUpdateInterval = setInterval(() => {
      if (!this._widgetDirty) return; // PERF: Skip IDB query when nothing changed
      this._widgetDirty = false;
      this.updateShadowRankWidget();
    }, 30000);

    // Chatbox button disabled - no removal needed

    // Listen for Dungeons essence awards (C2 fix - no more direct mutation)
    if (typeof BdApi?.Events?.on === 'function') {
      this._dungeonEssenceListener = (data) => {
        const amount = data?.amount || 0;
        if (amount > 0 && this.settings?.shadowEssence) {
          this.settings.shadowEssence.essence = (this.settings.shadowEssence.essence || 0) + amount;
          this.saveSettings();
        }
      };
      BdApi.Events.on('Dungeons:awardEssence', this._dungeonEssenceListener);

      // Listen for batch extraction complete (C11 fix - immediate widget refresh)
      this._batchExtractionListener = async (data) => {
        if (data?.extracted > 0 && typeof this.updateShadowRankWidget === 'function') {
          // Clear debounce and force immediate refresh
          if (this._postExtractionDebounceTimer) {
            clearTimeout(this._postExtractionDebounceTimer);
            this._postExtractionDebounceTimer = null;
          }
          try {
            await this.updateShadowRankWidget();
          } catch (err) {
            this.debugError?.('WIDGET', 'Batch extraction widget refresh failed', err);
          }
        }
      };
      BdApi.Events.on('ShadowArmy:batchExtractionComplete', this._batchExtractionListener);
    }
  }

  /**
   * Suppress BetterDiscord discord_media module errors
   * BetterDiscord core issue with Discord 0.0.370+, not a plugin issue
   */
  _setupDiscordMediaErrorSuppression() {
    if (typeof window === 'undefined' || this._discordMediaErrorHandlerAdded) return;
    this._discordMediaErrorHandlerAdded = true;

    this._discordMediaUnhandledRejectionHandler = (event) => {
      if (this._isStopped) return;
      const error = event.reason;
      const errorMessage = error?.message || error?.toString() || '';
      const errorStack = error?.stack || '';
      if (
        errorMessage.includes("Cannot find module 'discord_media'") ||
        errorMessage.includes('discord_media') ||
        errorStack.includes('discord_media') ||
        errorStack.includes('nativeModules.js')
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', this._discordMediaUnhandledRejectionHandler);
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

    // Flush any pending debounced save immediately
    if (this._saveSettingsTimer) {
      clearTimeout(this._saveSettingsTimer);
      this._saveSettingsTimer = null;
    }
    if (this._settingsDirty) {
      this._settingsDirty = false;
      this._saveSettingsImmediate();
    }

    // Cleanup ARISE animation system (merged from ShadowAriseAnimation plugin)
    this.cleanupAriseAnimationSystem();

    this.removeMessageListener();
    this.soloPlugin = null;
    this.detachShadowArmySettingsPanelHandlers();
    this.removeCSS();
    this.removeWidgetCSS();
    // Cleanup all CSS (including any dungeon CSS)
    this.cleanupAllCSS();
    // Cleanup combat caches
    this.clearCombatCache();
    // Chatbox button disabled - no removal needed
    this.closeShadowArmyModal();

    // Remove global error suppression handler if installed
    if (this._discordMediaUnhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this._discordMediaUnhandledRejectionHandler);
      this._discordMediaUnhandledRejectionHandler = null;
      this._discordMediaErrorHandlerAdded = false;
    }

    // Clear all tracked retry timeouts
    this._retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._retryTimeouts.clear();
    this._messageExtractionQueueTimeout = null;
    this._ariseDrainTimeout = null;
    this._pendingMessageExtractionCount = 0;
    this._isProcessingMessageExtractionQueue = false;
    this._pendingAriseShadow = null;
    this._lastAriseAnimationAt = 0;

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

    // Clear modal auto-refresh interval
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }

    // Clear post-extraction debounce timer
    if (this._postExtractionDebounceTimer) {
      clearTimeout(this._postExtractionDebounceTimer);
      this._postExtractionDebounceTimer = null;
    }

    // Clear member list observer health check
    if (this._memberListHealthCheck) {
      clearInterval(this._memberListHealthCheck);
      this._memberListHealthCheck = null;
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
    if (this.memberListAttributeObserver) {
      this.memberListAttributeObserver.disconnect();
      this.memberListAttributeObserver = null;
    }

    // Remove shadow rank widget (React unmount + DOM)
    this.removeShadowRankWidget();
    this._widgetComponents = null;

    // Clear Solo Leveling data cache
    this._soloDataCache = null;
    this._soloDataCacheTime = 0;

    // Cleanup cross-plugin event listeners (C2/C11 fixes)
    if (typeof BdApi?.Events?.off === 'function') {
      if (this._dungeonEssenceListener) {
        BdApi.Events.off('Dungeons:awardEssence', this._dungeonEssenceListener);
        this._dungeonEssenceListener = null;
      }
      if (this._batchExtractionListener) {
        BdApi.Events.off('ShadowArmy:batchExtractionComplete', this._batchExtractionListener);
        this._batchExtractionListener = null;
      }
    }

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
      // Re-setup member list watcher on channel/guild change.
      // The previous observer may be watching a stale (disconnected) DOM node
      // since Discord re-renders the entire layout on navigation.
      const timeoutId = setTimeout(() => {
        this._retryTimeouts.delete(timeoutId);
        this.setupMemberListWatcher();
      }, 200);
      this._retryTimeouts.add(timeoutId);
    };

    // Listen to browser navigation events
    window.addEventListener('popstate', handleUrlChange);

    // Override pushState and replaceState to detect programmatic navigation.
    // IMPORTANT: Chain safely with any existing wrappers from other plugins.
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const pushStateWrapper = function (...args) {
      originalPushState.apply(history, args);
      handleUrlChange();
    };

    const replaceStateWrapper = function (...args) {
      originalReplaceState.apply(history, args);
      handleUrlChange();
    };

    history.pushState = pushStateWrapper;
    history.replaceState = replaceStateWrapper;

    // Setup member list watcher for widget persistence
    this.setupMemberListWatcher();

    // Store cleanup functions
    this._urlChangeCleanup = () => {
      window.removeEventListener('popstate', handleUrlChange);
      pushStateWrapper &&
        history.pushState === pushStateWrapper &&
        (history.pushState = originalPushState);
      replaceStateWrapper &&
        history.replaceState === replaceStateWrapper &&
        (history.replaceState = originalReplaceState);
    };
  }

  /**
   * Setup MutationObserver to watch for member list changes
   * Re-injects widget when member list is re-rendered (channel/guild switch)
   */
  getCurrentChannelRouteInfo() {
    if (typeof window === 'undefined') return null;

    const pathname = window.location?.pathname || '';
    const threadMatch = pathname.match(/^\/channels\/(\d+)\/(\d+)\/threads\/(\d+)$/);
    if (threadMatch) {
      return {
        routeType: 'thread',
        serverId: threadMatch[1],
        parentChannelId: threadMatch[2],
        rawChannelId: threadMatch[3],
      };
    }

    const serverMatch = pathname.match(/^\/channels\/(\d+)\/(\d+)$/);
    if (serverMatch) {
      return {
        routeType: 'server',
        serverId: serverMatch[1],
        rawChannelId: serverMatch[2],
      };
    }

    return null;
  }

  getChannelStoreModule() {
    let ChannelStore = this.webpackModules?.ChannelStore;
    if (!ChannelStore?.getChannel) {
      ChannelStore = BdApi.Webpack.getModule(
        (m) =>
          m && typeof m.getChannel === 'function' && (m.getChannelId || m.getLastSelectedChannelId)
      );
      if (ChannelStore) this.webpackModules.ChannelStore = ChannelStore;
    }
    return ChannelStore || null;
  }

  _findMainChatContainer() {
    const selectors = [
      'main[class*="chatContent"]',
      'section[class*="chatContent"][role="main"]',
      'div[class*="chatContent"]:not([role="complementary"])',
      'div[class*="chat_"]:not([class*="chatLayerWrapper"])',
    ];
    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container) return container;
    }
    return null;
  }

  _findMessageInputArea(mainChat) {
    if (!mainChat) return null;
    return (
      mainChat.querySelector('[class*="channelTextArea"]') ||
      mainChat.querySelector('[class*="textArea"]')?.parentElement ||
      mainChat.querySelector('[class*="slateTextArea"]')?.parentElement ||
      null
    );
  }

  _isWritableEditor(editor) {
    if (!editor) return false;
    const blockedByAria = editor.getAttribute('aria-disabled') === 'true';
    const blockedByFlags =
      editor.hasAttribute('disabled') ||
      editor.hasAttribute('readonly') ||
      editor.getAttribute('contenteditable') === 'false';
    return !(blockedByAria || blockedByFlags);
  }

  hasWritableMessageInputInMainChat() {
    const mainChat = this._findMainChatContainer();
    const inputArea = this._findMessageInputArea(mainChat);
    if (!inputArea) return false;
    if (inputArea.matches?.('[aria-disabled="true"]') || inputArea.closest('[aria-disabled="true"]')) {
      return false;
    }

    const editorCandidates = [
      '[role="textbox"]',
      'textarea',
      '[contenteditable="true"]',
      '[class*="slateTextArea"]',
    ];
    const editor = editorCandidates
      .map((selector) => inputArea.querySelector(selector))
      .find(Boolean);

    return this._isWritableEditor(editor);
  }

  hasViewAndSendPermissions(channel) {
    if (!channel) return this.hasWritableMessageInputInMainChat();

    let PermissionStore = this.webpackModules?.PermissionStore;
    if (!PermissionStore?.can) {
      PermissionStore = BdApi.Webpack.getModule(
        (m) =>
          m &&
          typeof m.can === 'function' &&
          (typeof m.canAccessChannel === 'function' || typeof m.computePermissions === 'function')
      );
      if (PermissionStore) this.webpackModules.PermissionStore = PermissionStore;
    }

    let Permissions = this.webpackModules?.Permissions;
    if (!Permissions || Permissions.VIEW_CHANNEL == null || Permissions.SEND_MESSAGES == null) {
      Permissions = BdApi.Webpack.getModule(
        (m) =>
          m &&
          Object.prototype.hasOwnProperty.call(m, 'VIEW_CHANNEL') &&
          Object.prototype.hasOwnProperty.call(m, 'SEND_MESSAGES')
      );
      if (Permissions) this.webpackModules.Permissions = Permissions;
    }

    if (
      PermissionStore?.can &&
      Permissions?.VIEW_CHANNEL != null &&
      Permissions?.SEND_MESSAGES != null
    ) {
      const canView = !!PermissionStore.can(Permissions.VIEW_CHANNEL, channel);
      const canSend = !!PermissionStore.can(Permissions.SEND_MESSAGES, channel);
      return canView && canSend;
    }

    return this.hasWritableMessageInputInMainChat();
  }

  canInjectWidgetInCurrentView() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;

    const routeInfo = this.getCurrentChannelRouteInfo();
    if (!routeInfo || routeInfo.routeType !== 'server') return false; // excludes DMs and malformed routes
    if ((window.location?.pathname || '').includes('/threads/')) return false;

    const ChannelStore = this.getChannelStoreModule();
    const channel = ChannelStore?.getChannel
      ? ChannelStore.getChannel(routeInfo.rawChannelId)
      : null;
    if (channel) {
      const channelType = Number(channel.type);
      // Allow only guild text and announcement channels.
      // Excludes forum (15), thread variants (10/11/12), voice (2), stage (13), etc.
      if (channelType !== 0 && channelType !== 5) return false;
      return this.hasViewAndSendPermissions(channel);
    }

    // Fallback when ChannelStore lookup fails: require a writable composer in main chat.
    return this.hasWritableMessageInputInMainChat();
  }

  getMemberListElements() {
    if (typeof document === 'undefined') return null;

    const allCandidates = document.querySelectorAll('[class^="membersWrap_"], [class*="membersWrap"]');
    const membersWrap = Array.from(allCandidates).find((candidate) => {
      if (!candidate?.isConnected) return false;
      if (candidate.closest('[id^="chat-messages-"]')) return false;
      // Accept the element if it's connected and not display:none.
      // Don't reject based on getBoundingClientRect — during Discord's toggle animation,
      // the element may briefly have zero dimensions while being rendered.
      const style = candidate.style;
      if (style?.display === 'none') return false;
      // PERF: Use offsetParent instead of getComputedStyle — avoids forced style recalculation
      // offsetParent is null when element is display:none (except for fixed/body, which membersWrap isn't)
      if (candidate.offsetParent === null) return false;
      return true;
    });

    if (!membersWrap) return null;

    const membersList =
      membersWrap.querySelector(':scope > [class^="members_"]') ||
      membersWrap.querySelector(':scope > [class*="members"]') ||
      membersWrap.querySelector('[class^="members_"]') ||
      membersWrap.querySelector('[class*="members"]');

    if (!membersList || membersList.closest('[id^="chat-messages-"]')) return null;

    const membersContent =
      membersList.querySelector(':scope > [class^="content_"]') ||
      membersList.querySelector(':scope > [class*="content"]') ||
      membersList.querySelector('[class^="content_"]') ||
      membersList.querySelector('[class*="content"]');

    return { membersWrap, membersList, membersContent };
  }

  isWidgetInValidMemberList(widget) {
    if (!widget || typeof widget.closest !== 'function') return false;
    if (widget.closest('[id^="chat-messages-"]')) return false;
    return !!widget.closest('[class^="membersWrap_"], [class*="membersWrap"]');
  }

  setupMemberListWatcher() {
    // debug stripped
    // RE-ENABLED: Watch for member list changes to maintain widget
    // Guard clause: Disconnect existing observer if any
    if (this.memberListObserver) {
      this.memberListObserver.disconnect();
    }
    if (this.memberListAttributeObserver) {
      this.memberListAttributeObserver.disconnect();
    }

    if (!this.canInjectWidgetInCurrentView()) {
      document.getElementById('shadow-army-widget')?.remove();
      const retryId = setTimeout(() => {
        if (!this._isStopped) this.setupMemberListWatcher();
      }, 1500);
      this._retryTimeouts?.add?.(retryId);
      return;
    }

    const memberRoot = this.getMemberListElements()?.membersWrap || null;

    // CRITICAL: membersWrap is a SIBLING of chatContent, not a child.
    // Both sit inside a shared flex container. We must observe that common parent
    // so we can see when membersWrap is added/removed/toggled.
    const chatContent =
      document.querySelector('main[class*="chatContent"]') ||
      document.querySelector('section[class*="chatContent"][role="main"]') ||
      document.querySelector('div[class*="chatContent"]:not([role="complementary"])') ||
      document.querySelector('div[class*="chat_"]:not([class*="chatLayerWrapper"])');

    // Find the common flex parent that holds both chatContent and membersWrap.
    // If memberRoot exists, its parentElement IS the flex container.
    // If not, chatContent's parentElement is also the flex container.
    const observeRoot =
      memberRoot?.parentElement ||
      chatContent?.parentElement ||
      null;

    if (!observeRoot) {
      // debug stripped
      const retryId = setTimeout(() => {
        if (!this._isStopped) this.setupMemberListWatcher();
      }, 1200);
      this._retryTimeouts?.add?.(retryId);
      return;
    }

    // Single observer on the common flex parent catches:
    // - childList: membersWrap being added/removed from DOM (React mount/unmount)
    // - attributes: class/style changes on membersWrap or its children (visibility toggles)
    this._lastMemberListWatchCheck = 0;
    this._memberListRetryCount = 0;
    // Track whether the member list was absent on the previous check.
    // When it transitions from absent → present, we ALWAYS reset retries.
    let wasMemberListAbsent = false;

    const onMemberListMutated = (mutations) => {
      if (this._isStopped) return;
      if (document.hidden) return;
      const now = Date.now();
      if (now - this._lastMemberListWatchCheck < 150) return;

      // PERF: Skip mutations that only affect the chat area (not the member list)
      // The observer watches the flex parent of both chat + member list with subtree: true,
      // so every chat message DOM mutation fires this callback unnecessarily.
      let hasMemberListMutation = false;
      for (let i = 0; i < mutations.length; i++) {
        const target = mutations[i].target;
        if (target?.classList) {
          const cn = target.className;
          if (typeof cn === 'string' && (cn.includes('membersWrap') || cn.includes('members_'))) {
            hasMemberListMutation = true;
            break;
          }
        }
        if (!hasMemberListMutation && target?.closest?.('[class*="membersWrap"]')) {
          hasMemberListMutation = true;
          break;
        }
      }
      if (!hasMemberListMutation) return;

      this._lastMemberListWatchCheck = now;
      if (!this.canInjectWidgetInCurrentView()) {
        document.getElementById('shadow-army-widget')?.remove();
        return;
      }

      const memberElements = this.getMemberListElements();
      if (!memberElements?.membersList) {
        document.getElementById('shadow-army-widget')?.remove();
        wasMemberListAbsent = true;
        // Member list not visible yet — schedule retries for Discord's toggle animation.
        // ALWAYS reset retry counter when we detect absence, so toggling ON gets fresh retries.
        if (this._memberListRetryCount >= 5) {
          this._memberListRetryCount = 0;
        }
        if (this._memberListRetryCount < 5) {
          this._memberListRetryCount++;
          const retryId = setTimeout(() => {
            this._retryTimeouts?.delete?.(retryId);
            if (this._isStopped) return;
            onMemberListMutated();
          }, 300);
          this._retryTimeouts?.add?.(retryId);
        }
        return;
      }

      // Member list is present — reset retry counter
      this._memberListRetryCount = 0;

      // If transitioning from absent → present, give Discord a beat to finish rendering
      if (wasMemberListAbsent) {
        // debug stripped
        wasMemberListAbsent = false;
        // Extra delay to let Discord finish mount/animation before injecting widget
        this.widgetReinjectionTimeout && clearTimeout(this.widgetReinjectionTimeout);
        this.widgetReinjectionTimeout = setTimeout(() => {
          if (this._isStopped) return;
          this.injectShadowRankWidget();
        }, 250);
        return;
      }

      const widget = document.getElementById('shadow-army-widget');
      if (widget && this.isWidgetInValidMemberList(widget)) return;
      widget && widget.remove();

      // Fast debounce re-injection (prevent multiple calls)
      this.widgetReinjectionTimeout && clearTimeout(this.widgetReinjectionTimeout);
      this.widgetReinjectionTimeout = setTimeout(() => {
        if (this._isStopped) return;
        this.injectShadowRankWidget();
      }, 150);
    };

    this.memberListObserver = new MutationObserver(onMemberListMutated);

    // Observe the common parent for both childList (mount/unmount) and attributes (visibility).
    this.memberListObserver.observe(observeRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    });

    // Periodic observer health check — if the observed root becomes disconnected
    // (e.g., Discord re-renders the layout), re-establish the observer.
    if (this._memberListHealthCheck) clearInterval(this._memberListHealthCheck);
    this._memberListHealthCheck = setInterval(() => {
      if (this._isStopped) {
        clearInterval(this._memberListHealthCheck);
        this._memberListHealthCheck = null;
        return;
      }
      // If the observed root is no longer in the DOM, the observer is dead — rebuild it
      if (!observeRoot.isConnected) {
        // debug stripped
        clearInterval(this._memberListHealthCheck);
        this._memberListHealthCheck = null;
        this.setupMemberListWatcher();
      }
    }, 3000);

    // Immediate pass in case member list is already mounted when watcher starts.
    this.injectShadowRankWidget();
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
   * Load settings from all 3 tiers, picking the newest valid candidate.
   * Tiers: (1) IndexedDB via UnifiedSaveManager, (2) BdApi.Data, (3) File backup
   * Uses _metadata.lastSave timestamp to pick newest; tie-breaks by tier priority.
   * Falls back to defaults if no valid candidates found.
   */
  async loadSettings() {
    try {
      this.debugLog('LOAD_SETTINGS', 'Attempting to load settings from all tiers...');

      const getSavedTimestamp = (data) => {
        const iso = data?._metadata?.lastSave;
        const ts = iso ? Date.parse(iso) : NaN;
        return Number.isFinite(ts) ? ts : 0;
      };

      const candidates = [];

      // Tier 3: File backup (survives BD reinstall)
      try {
        const fileSaved = this.readFileBackup();
        if (fileSaved && typeof fileSaved === 'object') {
          candidates.push({ source: 'file', data: fileSaved, ts: getSavedTimestamp(fileSaved) });
        }
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'File backup load failed', error);
      }

      // Tier 1: IndexedDB (survives BD reinstall)
      if (this.saveManager) {
        try {
          const idbSaved = await this.saveManager.load('settings');
          if (idbSaved && typeof idbSaved === 'object') {
            candidates.push({ source: 'indexeddb', data: idbSaved, ts: getSavedTimestamp(idbSaved) });
          }
        } catch (error) {
          this.debugError('LOAD_SETTINGS', 'IndexedDB load failed', error);
        }
      }

      // Tier 2: BdApi.Data (wiped on BD reinstall)
      try {
        const storageKey = this.userId ? `settings_${this.userId}` : 'settings';
        const bdSaved = BdApi.Data.load('ShadowArmy', storageKey);
        if (bdSaved && typeof bdSaved === 'object') {
          candidates.push({ source: 'bdapi', data: bdSaved, ts: getSavedTimestamp(bdSaved) });
        }
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'BdApi.Data load failed', error);
      }

      // Pick newest; tie-break by storage priority
      const sourcePriority = { indexeddb: 3, file: 2, bdapi: 1 };
      const best = candidates.reduce(
        (acc, cur) => {
          const hasNewer = cur.ts > acc.ts;
          const isTie = cur.ts === acc.ts;
          const hasHigherPriority = (sourcePriority[cur.source] ?? 0) >= (sourcePriority[acc.source] ?? 0);
          return hasNewer || (isTie && hasHigherPriority) ? cur : acc;
        },
        { source: null, data: null, ts: 0 }
      );

      if (best.data) {
        this.debugLog('LOAD_SETTINGS', `Selected settings candidate`, {
          source: best.source,
          ts: best.ts ? new Date(best.ts).toISOString() : 'none',
          candidateCount: candidates.length,
          sources: candidates.map((c) => `${c.source}(${c.ts})`).join(', '),
        });
        this.settings = { ...this.defaultSettings, ...best.data };
      } else {
        this.settings = { ...this.defaultSettings };
      }

      // ── Post-load validation & backfill ──
      // CRITICAL: Shadows are stored in IndexedDB, not in settings
      if (!Array.isArray(this.settings.shadows)) {
        this.settings.shadows = [];
      } else if (this.settings.shadows.length > 0 && this.storageManager) {
        this.debugLog('LOAD_SETTINGS', 'Clearing old shadows from settings (should be in IndexedDB)', {
          shadowsInSettings: this.settings.shadows.length,
        });
        this.settings.shadows = [];
      }
      if (!this.settings.extractionConfig) {
        this.settings.extractionConfig = { ...this.defaultSettings.extractionConfig };
      } else {
        this.settings.extractionConfig = {
          ...this.defaultSettings.extractionConfig,
          ...this.settings.extractionConfig,
        };
      }
      if (!this.settings.specialArise) {
        this.settings.specialArise = { ...this.defaultSettings.specialArise };
      }
      if (!this.settings.dungeonExtractionAttempts) {
        this.settings.dungeonExtractionAttempts = {};
      }
      if (!this.settings.ariseAnimation) {
        this.settings.ariseAnimation = { ...this.defaultSettings.ariseAnimation };
      } else {
        this.settings.ariseAnimation = {
          ...this.defaultSettings.ariseAnimation,
          ...this.settings.ariseAnimation,
        };
      }
      if (this.settings.cachedTotalPower === undefined) {
        this.settings.cachedTotalPower = 0;
        this.settings.cachedTotalPowerTimestamp = 0;
      }

      // Sync debug mode with settings (after loading)
      this.debug.enabled = this.settings.debugMode === true;
    } catch (error) {
      this.debugError('SETTINGS', 'Error loading settings', error);
      this.settings = { ...this.defaultSettings };
      this.debug.enabled = this.settings.debugMode === true;
    }
  }

  // ── FILE BACKUP (Tier 3) ─────────────────────────────────────────────────
  // Stored OUTSIDE BetterDiscord folder so it survives BD reinstall/repair
  // Location: /Library/Application Support/discord/SoloLevelingBackups/ShadowArmy.json

  _getFileBackupPath() {
    try {
      const pathModule = require('path');
      const appSupport = pathModule.resolve(BdApi.Plugins.folder, '..', '..'); // Application Support
      const backupDir = pathModule.join(appSupport, 'discord', 'SoloLevelingBackups');
      require('fs').mkdirSync(backupDir, { recursive: true });
      return pathModule.join(backupDir, 'ShadowArmy.json');
    } catch { return null; }
  }

  readFileBackup() {
    const filePath = this._getFileBackupPath();
    if (!filePath) return null;
    try {
      const fs = require('fs');
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      this.debugError('LOAD_SETTINGS_FILE', error);
      return null;
    }
  }

  writeFileBackup(data) {
    const filePath = this._getFileBackupPath();
    if (!filePath) return false;
    try {
      const fs = require('fs');
      fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', (err) => {
        if (err) this.debugError('SAVE_SETTINGS_FILE', err);
        else this.debugLog('SAVE_SETTINGS', 'Saved file backup', { path: filePath });
      });
      return true;
    } catch (error) {
      this.debugError('SAVE_SETTINGS_FILE', error);
      return false;
    }
  }

  /**
   * Save current settings to localStorage
   * Operations:
   * 1. Sync debug mode from this.debug.enabled to settings.debugMode
   * 2. Exclude shadows array (shadows are stored in IndexedDB, not settings)
   * 3. Serialize settings object to JSON
   * 4. Save to all 3 tiers: IndexedDB, BdApi.Data, file backup
   * 5. Handle errors gracefully with debug logging (debugError method in SECTION 4)
   *
   * CRITICAL: Shadows are stored in IndexedDB via storageManager, NOT in settings.
   * This prevents UI blocking and allows for thousands of shadows.
   */
  /**
   * Debounced save — coalesces rapid saveSettings() calls into one write.
   * All 17+ call sites hit this; actual I/O happens after 3s of quiet.
   * Use saveSettingsImmediate() for critical paths (stop/beforeunload).
   */
  saveSettings() {
    this._settingsDirty = true;
    if (this._saveSettingsTimer) return;
    this._saveSettingsTimer = setTimeout(() => {
      this._saveSettingsTimer = null;
      if (this._settingsDirty) {
        this._settingsDirty = false;
        this._saveSettingsImmediate();
      }
    }, 3000);
  }

  async _saveSettingsImmediate() {
    try {
      // Sync debug mode from debug.enabled to settings
      if (this.settings.debugMode !== this.debug.enabled) {
        this.settings.debugMode = this.debug.enabled;
      }

      // CRITICAL: Exclude shadows from settings - shadows are in IndexedDB only
      // Create a clean settings object without shadows array
      const settingsToSave = { ...this.settings };
      // Remove shadows array if it exists (should be empty after migration anyway)
      if (settingsToSave.shadows && Array.isArray(settingsToSave.shadows)) {
        delete settingsToSave.shadows;
      }
      // Remove transient snapshot cache if it leaked into settings (should be instance-level only)
      delete settingsToSave._snapshotCache;
      delete settingsToSave._snapshotTimestamp;

      // Add metadata timestamp for newest-wins load strategy across all 3 tiers
      settingsToSave._metadata = { lastSave: new Date().toISOString(), version: '3.5.0' };

      // Tier 1: Save to IndexedDB (crash-resistant, survives BD reinstall)
      if (this.saveManager) {
        try {
          await this.saveManager.save('settings', settingsToSave, true); // true = create backup
          this.debugLog('SAVE_SETTINGS', 'Saved to IndexedDB');
        } catch (error) {
          this.debugError('SAVE_SETTINGS', 'IndexedDB save failed', error);
        }
      }

      // Tier 2: Save to BdApi.Data (fast, inspectable, wiped on BD reinstall)
      try {
        // Use user-specific storage key
        const storageKey = this.userId ? `settings_${this.userId}` : 'settings';
        BdApi.Data.save('ShadowArmy', storageKey, settingsToSave);
        this.debugLog('SAVE_SETTINGS', 'Saved to BdApi.Data');
      } catch (error) {
        this.debugError('SETTINGS', 'Error saving settings to BdApi.Data', error);
      }

      // Tier 3: File backup outside BD folder (survives BD reinstall)
      this.writeFileBackup(settingsToSave);
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
    // Check cache first (with TTL)
    const now = Date.now();
    if (
      this._soloDataCache &&
      this._soloDataCacheTime &&
      now - this._soloDataCacheTime < this._soloDataCacheTTL
    ) {
      return this._soloDataCache;
    }

    // Guard clause: Re-integrate if plugin not loaded
    if (!this.soloPlugin) {
      this.integrateWithSoloLeveling();
    }
    if (!this.soloPlugin) {
      this._soloDataCache = null;
      this._soloDataCacheTime = 0;
      return null;
    }

    const instance = this.soloPlugin.instance || this.soloPlugin;
    if (!instance || !instance.settings) {
      this._soloDataCache = null;
      this._soloDataCacheTime = 0;
      return null;
    }

    const soloData = {
      rank: instance.settings.rank || 'E',
      level: instance.settings.level || 1,
      stats: instance.settings.stats || {},
      intelligence: instance.settings.stats?.intelligence || 0,
    };

    // Cache the result
    this._soloDataCache = soloData;
    this._soloDataCacheTime = now;

    return soloData;
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

    // Avoid duplicate wrapping during hot reload/restart.
    if (
      this._messageProcessWrapper &&
      instance.processMessageSent === this._messageProcessWrapper
    ) {
      this.debugLog('MESSAGE_LISTENER', 'processMessageSent already wrapped by ShadowArmy');
      return;
    }

    const currentProcessMessage = instance.processMessageSent;
    if (typeof currentProcessMessage !== 'function') {
      this.debugLog(
        'MESSAGE_LISTENER',
        'processMessageSent is not callable, message extraction disabled'
      );
      return;
    }

    // Store current function so we preserve any wrappers from other plugins.
    this.originalProcessMessage = currentProcessMessage;

    // Wrap processMessageSent to add extraction logic
    // NOTE: processMessageSent is SYNCHRONOUS in SoloLevelingStats, not async
    const self = this;
    const wrappedProcessMessage = function (messageText) {
      // Call original function first (synchronous)
      const result = currentProcessMessage.call(this, messageText);

      // Queue extraction after message processing to prevent burst spam
      self.debugLog('MESSAGE_LISTENER', 'Message received, attempting extraction', {
        messageLength: messageText?.length || 0,
        messagePreview: messageText?.substring(0, 30) || 'N/A',
      });
      self.queueMessageExtraction(messageText);

      return result;
    };
    wrappedProcessMessage.__shadowArmyWrapped = true;
    wrappedProcessMessage.__shadowArmyPrevious = currentProcessMessage;

    this._messageProcessWrapper = wrappedProcessMessage;
    instance.processMessageSent = wrappedProcessMessage;

    this.debugLog('MESSAGE_LISTENER', 'Message listener setup complete', {
      hasOriginalFunction: !!this.originalProcessMessage,
      hasInstance: !!instance,
      hasProcessMessageSent: !!instance.processMessageSent,
    });
  }

  getMessageQueueInitialDelayMs() {
    const cfg = this.settings?.extractionConfig || this.defaultSettings.extractionConfig;
    const value = Number(cfg?.messageQueueInitialDelayMs);
    return Number.isFinite(value) ? Math.max(50, value) : 120;
  }

  getMessageQueueIntervalMs() {
    const cfg = this.settings?.extractionConfig || this.defaultSettings.extractionConfig;
    const value = Number(cfg?.messageQueueIntervalMs);
    return Number.isFinite(value) ? Math.max(150, value) : 450;
  }

  getMessageQueueMaxPending() {
    const cfg = this.settings?.extractionConfig || this.defaultSettings.extractionConfig;
    const fallback = Number(cfg?.maxExtractionsPerMinute) || 20;
    const value = Number(cfg?.messageQueueMaxPending);
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : Math.max(1, fallback);
  }

  queueMessageExtraction(messageText = '') {
    if (this._isStopped) return;

    const maxPending = this.getMessageQueueMaxPending();
    if ((this._pendingMessageExtractionCount || 0) >= maxPending) {
      this.debugLog('MESSAGE_QUEUE', 'Message extraction queue full, dropping event', {
        maxPending,
      });
      return;
    }

    this._pendingMessageExtractionCount = (this._pendingMessageExtractionCount || 0) + 1;
    this.debugLog('MESSAGE_QUEUE', 'Queued message extraction', {
      pendingQueue: this._pendingMessageExtractionCount,
      messageLength: messageText?.length || 0,
    });

    // First queued message waits a tiny bit so SoloLevelingStats can finalize sync updates
    const initialDelay = this.getMessageQueueInitialDelayMs();
    this.scheduleMessageQueueDrain(initialDelay);
  }

  scheduleMessageQueueDrain(delayMs = 0) {
    if (this._isStopped) return;
    if (this._isProcessingMessageExtractionQueue) return;
    if (this._messageExtractionQueueTimeout) return;
    if ((this._pendingMessageExtractionCount || 0) <= 0) return;

    const safeDelay = Math.max(0, Number(delayMs) || 0);
    const queueTimeoutId = setTimeout(() => {
      this._retryTimeouts?.delete(queueTimeoutId);
      this._messageExtractionQueueTimeout = null;
      this.drainMessageExtractionQueue();
    }, safeDelay);

    this._messageExtractionQueueTimeout = queueTimeoutId;
    this._retryTimeouts?.add(queueTimeoutId);
  }

  drainMessageExtractionQueue() {
    if (this._isStopped) return;
    if (this._isProcessingMessageExtractionQueue) return;

    const pendingCount = this._pendingMessageExtractionCount || 0;
    if (pendingCount <= 0) return;

    this._isProcessingMessageExtractionQueue = true;
    this._pendingMessageExtractionCount = pendingCount - 1;

    this.attemptShadowExtraction()
      .then((shadow) => {
        if (shadow) {
          // Get identifier for logging (accept both id and i for compressed shadows)
          const shadowId = this.getCacheKey(shadow);
          this.debugLog('MESSAGE_EXTRACTION', 'SUCCESS: Shadow extracted from message', {
            rank: shadow.rank,
            role: shadow.role,
            id: shadowId,
            pendingQueue: this._pendingMessageExtractionCount || 0,
          });
        } else {
          this.debugLog('MESSAGE_EXTRACTION', 'No shadow extracted (returned null)');
        }
      })
      .catch((error) => {
        this.debugError('MESSAGE_EXTRACTION', 'Error during message extraction', error);
      })
      .finally(() => {
        this._isProcessingMessageExtractionQueue = false;
        if (this._isStopped) return;

        if ((this._pendingMessageExtractionCount || 0) > 0) {
          this.scheduleMessageQueueDrain(this.getMessageQueueIntervalMs());
        }
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
      try {
        this.messageUnsubscribe();
      } catch (error) {
        this.debugError('MESSAGE_LISTENER', 'Error unsubscribing message listener', error);
      }
      this.messageUnsubscribe = null;
    }
    // Guard clause: Restore original function if exists
    if (this.soloPlugin && this.originalProcessMessage) {
      const instance = this.soloPlugin.instance || this.soloPlugin;
      if (
        instance &&
        instance.processMessageSent &&
        (!this._messageProcessWrapper || instance.processMessageSent === this._messageProcessWrapper)
      ) {
        instance.processMessageSent = this.originalProcessMessage;
      }
    }
    this.originalProcessMessage = null;
    this._messageProcessWrapper = null;

    if (this._messageExtractionQueueTimeout) {
      clearTimeout(this._messageExtractionQueueTimeout);
      this._retryTimeouts?.delete(this._messageExtractionQueueTimeout);
      this._messageExtractionQueueTimeout = null;
    }
    this._pendingMessageExtractionCount = 0;
    this._isProcessingMessageExtractionQueue = false;
  }

  /**
   * Message-based extraction (humanoid shadows only, no magic beasts)
   * Operations:
   * 1. Get user stats from SoloLevelingStats
   * 2. Check rate limiting (max extractions per minute)
   * 3. Determine target rank (same rank or +1)
   * 4. Calculate extraction chance preview for diagnostics
   * 5. Attempt extraction with retries (up to 3 attempts)
   * 6. Only extracts humanoid shadows (no magic beasts from messages)
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

    // Determine target rank (can extract same rank or 1 rank above)
    const rankIndex = this.shadowRanks.indexOf(rank);
    const availableRanks = this.shadowRanks.slice(
      0,
      Math.min(rankIndex + 2, this.shadowRanks.length)
    );
    const targetRank = availableRanks[Math.floor(Math.random() * availableRanks.length)];

    // Preflight chance preview for diagnostics only (actual success/failure is handled by retries).
    const targetRankMultiplier = this.rankStatMultipliers[targetRank] || 1.0;
    const targetBaselineStats = this.getRankBaselineStats(targetRank, targetRankMultiplier);
    const estimatedTargetStrength = this.calculateShadowStrength(targetBaselineStats, 1);
    const extractionChancePreview = this.calculateExtractionChance(
      rank,
      stats,
      targetRank,
      estimatedTargetStrength,
      intelligence,
      perception,
      strength,
      false
    );

    this.debugLog('MESSAGE_EXTRACTION', 'Message extraction preflight', {
      extractionChancePreview: (extractionChancePreview * 100).toFixed(2) + '%',
      intelligence,
      perception,
      strength,
      rank,
      targetRank,
      estimatedTargetStrength,
    });

    // Record extraction attempt timestamp before retry extraction begins
    this._extractionTimestamps.push(now);

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

  _getAvailableDungeonBeastRoles(rank, beastFamilies = null) {
    let availableBeastRoles = Object.keys(this.shadowRoles).filter(
      (key) => this.shadowRoles[key].isMagicBeast
    );

    if (beastFamilies && beastFamilies.length > 0) {
      availableBeastRoles = availableBeastRoles.filter((key) => {
        const beast = this.shadowRoles[key];
        return beastFamilies.includes(beast.family);
      });
    }

    const rankIndex = this.shadowRanks.indexOf(rank);
    availableBeastRoles = availableBeastRoles.filter((key) => {
      const beast = this.shadowRoles[key];
      if (!beast.minRank) return true;
      const minRankIndex = this.shadowRanks.indexOf(beast.minRank);
      return rankIndex >= minRankIndex;
    });

    if (availableBeastRoles.length === 0) {
      availableBeastRoles = Object.keys(this.shadowRoles).filter(
        (key) => this.shadowRoles[key].isMagicBeast && !this.shadowRoles[key].minRank
      );
    }

    return availableBeastRoles;
  }

  async _persistShadowToSettingsFallback(shadow, attemptNum, reasonLabel) {
    this.settings.shadows || (this.settings.shadows = []);
    this.settings.shadows.push(shadow);
    this.saveSettings();

    const now = Date.now();
    this.settings.totalShadowsExtracted++;
    this.settings.lastExtractionTime = now;
    await this.grantShadowXP(2, 'extraction');
    this.updateUI();

    this.debugLog('EXTRACTION_RETRIES', `Attempt ${attemptNum} - ${reasonLabel}`, {
      attemptNum,
      shadowId: this.getCacheKey(shadow),
      shadowRank: shadow.rank,
      shadowRole: shadow.role,
    });

    return shadow;
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
    maxAttempts = 3,
    showAnimation = true, // Show animation by default (messages and bosses), skip for mobs
    guaranteedExtraction = false, // Dungeon mobs below user rank: skip RNG roll, always arise
    sameRankBoost = false // Same-rank dungeon mobs: boosted chance (high but not guaranteed)
  ) {
    // Stats extracted but not used in current extraction logic (reserved for future use)

    const _intelligence = userStats.intelligence || 0;

    const _perception = userStats.perception || 0;

    const _strength = userStats.strength || 0;

    // Hot-reload safety: avoid crashing if older instances lack newer helpers.
    const getShadowKey = (shadow) =>
      typeof this.getCacheKey === 'function'
        ? this.getCacheKey(shadow)
        : shadow?.id || shadow?.i || null;

    // RANK VALIDATION: Ensure target rank is not too high
    const userRankIndex = this.shadowRanks.indexOf(userRank);
    const targetRankIndex = this.shadowRanks.indexOf(targetRank);
    const rankDiff = targetRankIndex - userRankIndex;

    // High rank gap: exponentially harder but never impossible (Solo Leveling lore:
    // Sung Jin-Woo arose the Ant King and Beru despite massive power gaps)
    // The exponential penalty in calculateExtractionChance handles the difficulty scaling.

    // Generate shadow first (with target stats if provided)
    let shadow;
    if (targetStats && targetStrength != null) {
      // Use provided stats for dungeon mobs
      // MAGIC BEASTS: 100% from dungeons (filtered by biome), 0% from messages!
      let roleKey;
      if (fromDungeon) {
        const availableBeastRoles = this._getAvailableDungeonBeastRoles(targetRank, beastFamilies);
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
        targetStrength || (targetStats ? this.calculateShadowPower(targetStats, 1) : 0);

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
        growthVarianceSeed: Math.random(), // Unique growth pattern (0-1, creates 0.8-1.2x variance)
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

      // Tier 1: Guaranteed extraction — user outranks mob (skip RNG entirely)
      if (guaranteedExtraction) {
        this.debugLog('EXTRACTION_RETRIES', `Attempt ${attemptNum} - Guaranteed extraction (user outranks mob)`, {
          attemptNum, targetRank, guaranteedExtraction: true,
        });
        // Fall through to extraction succeeded block
      } else {
        // Calculate base extraction chance from stats
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

        // Tier 2: Same-rank boost — high chance but not guaranteed
        // Applies a floor of 85% (the mob is your equal, you should usually arise it)
        const effectiveChance = sameRankBoost
          ? Math.max(0.85, extractionChance)
          : extractionChance;

        // Roll for extraction
        const roll = Math.random();

        this.debugLog('EXTRACTION_RETRIES', `Attempt ${attemptNum} - Extraction roll`, {
          attemptNum,
          baseChance: (extractionChance * 100).toFixed(2) + '%',
          effectiveChance: (effectiveChance * 100).toFixed(2) + '%',
          sameRankBoost,
          roll: (roll * 100).toFixed(2) + '%',
          success: roll < effectiveChance,
        });

        // Guard clause: Early return on failure
        if (roll >= effectiveChance) {
          this.debugLog(
            'EXTRACTION_RETRIES',
            `Attempt ${attemptNum} - Roll failed${sameRankBoost ? ' (same-rank boosted)' : ''}, trying next attempt`,
            {
              attemptNum,
              sameRankBoost,
            }
          );
          continue; // Failed extraction roll, try next attempt
        }
      }

      // Extraction succeeded
      {
        this.debugLog(
          'EXTRACTION_RETRIES',
          `Attempt ${attemptNum} - Roll succeeded, attempting to save shadow`,
          {
            attemptNum,
            shadowExists: !!shadow,
            shadowId: getShadowKey(shadow),
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
        const shadowId = getShadowKey(shadow);

        if (this.storageManager) {
          try {
            // Ensure shadow has strength calculated before saving
            if (!shadow.strength || shadow.strength === 0) {
              const decompressed = this.getShadowData(shadow);
              const effective = this.getShadowEffectiveStats(decompressed);
              if (effective) {
                shadow.strength = this.calculateShadowPower(effective, 1);
                this.debugLog('EXTRACTION', 'Calculated missing strength before save', {
                  shadowId,
                  calculatedStrength: shadow.strength,
                });
              }
            }

            const shadowToSave = this.prepareShadowForSave(shadow);
            await this.storageManager.saveShadow(shadowToSave);
            this._invalidateSnapshot(); // New shadow extracted — snapshot stale

            // INCREMENTAL CACHE: Update total power cache by adding this shadow's power
            await this.incrementTotalPower(shadowToSave);

            this.debugLog('EXTRACTION', 'Shadow saved to IndexedDB', {
              shadowId,
              rank: shadow.rank,
              role: shadow.role,
              strength: shadow.strength,
              shadowToSaveStrength: shadowToSave.strength,
            });

            // Verify it was saved by checking count (with null check)
            let newCount = 0;
            if (this.storageManager && typeof this.storageManager.getTotalCount === 'function') {
              try {
                newCount = await this.storageManager.getTotalCount();
              } catch (countError) {
                this.debugError('EXTRACTION', 'Failed to get total count after save', countError);
                // Continue without count - shadow was saved successfully
              }
            }

            this.debugLog('EXTRACTION', 'Shadow saved successfully', {
              totalCount: newCount,
              shadowId: getShadowKey(shadow),
              shadowRank: shadow.rank,
              shadowRole: shadow.role,
            });

            // Emit event for other plugins (event-based sync)
            // Emit both BdApi.Events AND DOM event for maximum compatibility
            const eventData = {
              shadowId: getShadowKey(shadow),
              shadowCount: newCount,
              shadowRank: shadow.rank,
              shadowRole: shadow.role,
              timestamp: Date.now(),
            };

            // Emit via BdApi.Events (primary method)
            if (typeof BdApi?.Events?.emit === 'function') {
              try {
                BdApi.Events.emit('ShadowArmy:shadowExtracted', eventData);
              } catch (error) {
                this.debugError('EXTRACTION', 'Failed to emit BdApi event', error);
              }
            }

            // ALWAYS emit DOM event for plugins that listen to DOM events (like SoloLevelingStats)
            // This ensures SoloLevelingStats progress bar updates immediately
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
              try {
                const domEvent = new CustomEvent('shadowExtracted', {
                  detail: eventData,
                  bubbles: true,
                });
                window.dispatchEvent(domEvent);
                // Also dispatch on document for compatibility
                document.dispatchEvent(domEvent);
              } catch (error) {
                this.debugError('EXTRACTION', 'Failed to emit DOM event', error);
              }
            }

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

            // PERF: Mark widget dirty + debounce update (500ms) to coalesce burst extractions
            this._widgetDirty = true;
            if (this._postExtractionDebounceTimer) clearTimeout(this._postExtractionDebounceTimer);
            this._postExtractionDebounceTimer = setTimeout(async () => {
              this._postExtractionDebounceTimer = null;
              if (this._isStopped) return;
              if (typeof this.updateShadowRankWidget === 'function') {
                try {
                  this._widgetDirty = false;
                  await this.updateShadowRankWidget();
                } catch (error) {
                  this.debugError('WIDGET', 'Failed to update widget after extraction', error);
                }
              }
            }, 500);

            // Shadow extraction completed - logged above in EXTRACTION_RETRIES completion log

            // Emit shadowExtracted event for Dungeons plugin verification
            try {
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

            // Show extraction animation (only for messages and bosses, not mobs)
            if (showAnimation) {
              this.showExtractionAnimation(shadow);
            }

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

            // Invalidate shadow power cache for this specific shadow (individual cache)
            if (this._shadowPowerCache) {
              this.invalidateShadowPowerCache(shadowToSave);
            }

            // Trigger immediate update for SoloLevelingStats progress bar
            // Use a small delay to ensure shadow is saved first
            const invalidateTimeoutId = setTimeout(() => {
              this._retryTimeouts?.delete(invalidateTimeoutId);
              if (this._isStopped) return;
              try {
                this._armyStatsCache = null;
                this._armyStatsCacheTime = null;
                this.debugLog(
                  'TOTAL_POWER_UPDATE',
                  'Invalidated full stats cache after extraction (power already updated incrementally)'
                );
              } catch (error) {
                this.debugError(
                  'TOTAL_POWER_UPDATE',
                  'Failed to recalculate after extraction',
                  error
                );
              }
            }, 100);
            this._retryTimeouts?.add(invalidateTimeoutId);

            this.debugLog(
              'EXTRACTION_RETRIES',
              `Attempt ${attemptNum} - Shadow extraction completed successfully`,
              {
                attemptNum,
                shadowId: this.getCacheKey(shadow),
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
            return this._persistShadowToSettingsFallback(
              shadow,
              attemptNum,
              'Fallback to localStorage succeeded'
            );
          }
        } else {
          // Fallback to localStorage
          this.debugLog(
            'EXTRACTION_RETRIES',
            `Attempt ${attemptNum} - No storageManager, using localStorage fallback`,
            {
              attemptNum,
              shadowId: this.getCacheKey(shadow),
            }
          );
          return this._persistShadowToSettingsFallback(
            shadow,
            attemptNum,
            'localStorage fallback succeeded'
          );
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

    // Rank-based extraction tier (Solo Leveling lore):
    //   - User outranks mob  → guaranteed ARISE (Shadow Monarch dominates weaker enemies)
    //   - Same rank           → high chance but can still fail (worthy opponent, small resistance)
    //   - Mob outranks user   → normal RNG extraction (uses full calculateExtractionChance system)
    //   - Bosses              → always normal RNG with 3 retries (dramatic tension)
    const userRankIdx = this.shadowRanks.indexOf(userRank);
    const mobRankIdx = this.shadowRanks.indexOf(mobRank);
    const rankDiff = mobRankIdx - userRankIdx; // negative = user higher, 0 = same, positive = mob higher

    let dungeonAutoArise = false; // Default: use RNG
    let maxAttempts = 1;

    if (isBoss) {
      // Bosses always use chance-based extraction with 3 retries
      dungeonAutoArise = false;
      maxAttempts = 3;
    } else if (rankDiff < 0) {
      // User outranks mob → guaranteed extraction
      dungeonAutoArise = true;
      maxAttempts = 1;
    } else if (rankDiff === 0) {
      // Same rank → high chance via "same-rank" mode (handled in attemptExtractionWithRetries)
      // Not guaranteed, but boosted. Give 2 attempts for a fair shot.
      dungeonAutoArise = false;
      maxAttempts = 2;
    } else {
      // Mob outranks user → normal RNG extraction, 1 attempt (hard to arise stronger enemies)
      dungeonAutoArise = false;
      maxAttempts = 1;
    }

    this.debugLog('DUNGEON_EXTRACTION', `Rank comparison: User[${userRank}] vs Mob[${mobRank}]`, {
      userRankIdx, mobRankIdx, rankDiff, dungeonAutoArise, maxAttempts, isBoss,
      tier: dungeonAutoArise ? 'GUARANTEED' : rankDiff === 0 ? 'SAME_RANK_BOOSTED' : rankDiff > 0 ? 'HIGHER_MOB_RNG' : 'BOSS_RNG',
    });

    // Attempt extraction with tier-appropriate settings
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
      maxAttempts,
      isBoss, // showAnimation: true for bosses (ARISE), false for mobs (silent)
      dungeonAutoArise, // guaranteedExtraction: only true when user outranks mob
      rankDiff === 0 && !isBoss // sameRankBoost: true for same-rank dungeon mobs
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
   * Streaming bulk extraction for dungeon corpse piles.
   * Processes corpses in bounded chunks and persists successes in tiny IDB write batches.
   * Peak memory stays flat regardless of pile size.
   *
   * Why tiny write batches? Chromium keeps the entire IDB write buffer in memory
   * until transaction commit. Large `put` batches can still spike memory even when
   * corpse processing is chunked.
   *
   * @param {Array} corpsePile - Array of corpse objects from dungeon (can be thousands)
   * @param {string} userRank - User's current rank
   * @param {number} userLevel - User's current level
   * @param {Object} userStats - User's stats
   * @param {Array} beastFamilies - Biome beast families
   * @returns {Promise<{extracted: number, attempted: number}>}
   */
  async bulkDungeonExtraction(corpsePile, userRank, userLevel, userStats, beastFamilies = []) {
    if (!corpsePile || corpsePile.length === 0) {
      return { extracted: 0, attempted: 0 };
    }

    const total = corpsePile.length;
    const tuning = (() => {
      // Adaptive profile: as corpse volume rises, shrink chunk sizes and yield more
      // aggressively to keep memory pressure stable.
      if (total >= 20000) {
        return { corpseChunkSize: 12, writeChunkSize: 4, chunkYieldMs: 3, profile: 'extreme_safe' };
      }
      if (total >= 10000) {
        return { corpseChunkSize: 18, writeChunkSize: 6, chunkYieldMs: 2, profile: 'high_safe' };
      }
      if (total >= 5000) {
        return { corpseChunkSize: 25, writeChunkSize: 8, chunkYieldMs: 1, profile: 'balanced' };
      }
      return { corpseChunkSize: 35, writeChunkSize: 10, chunkYieldMs: 0, profile: 'fast' };
    })();
    const CORPSE_CHUNK_SIZE = tuning.corpseChunkSize;
    const WRITE_CHUNK_SIZE = tuning.writeChunkSize;
    const CHUNK_YIELD_MS = tuning.chunkYieldMs;
    let totalExtracted = 0;
    let totalAttempted = 0;
    let totalPowerDelta = 0;
    const rankCounts = {}; // For summary toast

    // Pre-compute constants once
    const userRankIdx = this.shadowRanks.indexOf(userRank);
    const intelligence = userStats?.intelligence || 0;
    const perception = userStats?.perception || 0;
    const strength = userStats?.strength || 0;

    console.log(
      `[ShadowArmy] ⚔️ ARISE STREAM: Starting extraction of ${total} corpses ` +
      `(profile=${tuning.profile}, corpseChunk=${CORPSE_CHUNK_SIZE}, writeChunk=${WRITE_CHUNK_SIZE}, yield=${CHUNK_YIELD_MS}ms)`
    );

    // ── STREAMING PIPELINE: Process corpses in bounded chunks ──
    for (let i = 0; i < total; i += CORPSE_CHUNK_SIZE) {
      const chunk = corpsePile.slice(i, Math.min(i + CORPSE_CHUNK_SIZE, total));
      const chunkShadows = []; // Only lives for this iteration — GC'd after yield

      // ── RNG + shadow generation for this chunk (pure JS, no IDB) ──
      for (const corpse of chunk) {
        totalAttempted++;

        const mobRank = corpse.rank || 'E';
        const mobRankIdx = this.shadowRanks.indexOf(mobRank);
        const rankDiff = mobRankIdx - userRankIdx;
        const isBoss = !!corpse.isBoss;

        // Boss attempt limit check (in-memory)
        if (isBoss) {
          const canExtract = this.canExtractFromBoss(corpse.id);
          if (!canExtract.allowed) continue;
        }

        // Extraction tier
        let guaranteedExtraction = false;
        let maxAttempts = 1;
        let sameRankBoost = false;

        if (isBoss) {
          maxAttempts = 3;
        } else if (rankDiff < 0) {
          guaranteedExtraction = true;
        } else if (rankDiff === 0) {
          maxAttempts = 2;
          sameRankBoost = true;
        }

        // Generate shadow (pure JS)
        let shadow;
        if (corpse.baseStats && corpse.strength != null) {
          const availableBeastRoles = this._getAvailableDungeonBeastRoles(mobRank, beastFamilies);
          const roleKey = availableBeastRoles[Math.floor(Math.random() * availableBeastRoles.length)];
          const role = this.shadowRoles[roleKey];
          const calculatedStrength = corpse.strength || (corpse.baseStats ? this.calculateShadowPower(corpse.baseStats, 1) : 0);

          shadow = {
            id: `shadow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            rank: mobRank,
            role: roleKey,
            roleName: role.name,
            strength: calculatedStrength,
            extractedAt: Date.now(),
            level: 1,
            xp: 0,
            baseStats: corpse.baseStats,
            growthStats: { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 },
            naturalGrowthStats: { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 },
            totalCombatTime: 0,
            lastNaturalGrowth: Date.now(),
            ownerLevelAtExtraction: userLevel,
            growthVarianceSeed: Math.random(),
          };
        } else {
          shadow = this.generateShadow(mobRank, userLevel, userStats);
        }

        if (!shadow) continue;

        // RNG extraction roll
        let extracted = false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (guaranteedExtraction) { extracted = true; break; }
          const extractionChance = this.calculateExtractionChance(
            userRank, userStats, mobRank,
            shadow.strength || corpse.strength,
            intelligence, perception, strength, true
          );
          const effectiveChance = sameRankBoost ? Math.max(0.85, extractionChance) : extractionChance;
          if (Math.random() < effectiveChance) { extracted = true; break; }
        }

        if (!extracted) continue;

        // Ensure strength
        if (!shadow.strength || shadow.strength === 0) {
          const decompressed = this.getShadowData(shadow);
          const effective = this.getShadowEffectiveStats(decompressed);
          if (effective) shadow.strength = this.calculateShadowPower(effective, 1);
        }

        // Prepare + track
        const shadowToSave = this.prepareShadowForSave(shadow);
        chunkShadows.push(shadowToSave);
        totalPowerDelta += (shadowToSave.strength || shadowToSave.s || 0);
        const r = shadowToSave.rank || shadowToSave.r || '?';
        rankCounts[r] = (rankCounts[r] || 0) + 1;

        if (isBoss) this.recordBossExtractionAttempt(corpse.id, true);
      }

      // ── Persist this chunk's successes in tiny IDB write batches ──
      if (chunkShadows.length > 0 && this.storageManager) {
        try {
          let savedCount = 0;
          if (typeof this.storageManager.saveShadowsChunked === 'function') {
            savedCount = await this.storageManager.saveShadowsChunked(
              chunkShadows,
              WRITE_CHUNK_SIZE
            );
          } else {
            savedCount = await this.storageManager.saveShadowsBatch(chunkShadows);
          }

          totalExtracted += Number.isFinite(savedCount) ? savedCount : chunkShadows.length;
        } catch (e) {
          this.debugError(
            'BULK_EXTRACTION',
            `Chunk ${Math.floor(i / CORPSE_CHUNK_SIZE) + 1} save failed`,
            e
          );
        }
      }

      // ── Yield to event loop — V8 GCs this chunk's shadow objects + IDB write buffers ──
      if (i + CORPSE_CHUNK_SIZE < total) {
        await new Promise(r => setTimeout(r, CHUNK_YIELD_MS));
      }
    }
    // chunkShadows from each iteration is now out of scope and GC-eligible

    console.log(`[ShadowArmy] ⚔️ ARISE STREAM COMPLETE: ${totalExtracted}/${totalAttempted} extracted from ${total} corpses`);

    // ── Post-extraction bookkeeping (ONE of each, uses only counters not shadow objects) ──
    if (totalExtracted > 0) {
      try {
        this._invalidateSnapshot();

        // Power cache
        if (totalPowerDelta > 0) {
          try {
            await this._applyTotalPowerDelta({ strength: totalPowerDelta }, 'increment');
          } catch (e) {
            this.debugError('BULK_EXTRACTION', 'Failed to update power cache', e);
          }
        }

        // Counters + XP
        this.settings.totalShadowsExtracted = (this.settings.totalShadowsExtracted || 0) + totalExtracted;
        this.settings.lastExtractionTime = Date.now();
        await this.grantShadowXP(2 * totalExtracted, 'extraction');
        this.saveSettings();

        // Invalidate caches
        this._armyStatsCache = null;
        this._armyStatsCacheTime = null;
        this._shadowPowerCache = null; // Full invalidation — too many shadows to invalidate individually

        // ONE batch event
        const eventData = {
          shadowCount: totalExtracted,
          rankCounts,
          timestamp: Date.now(),
          source: 'dungeon_bulk',
        };
        if (typeof BdApi?.Events?.emit === 'function') {
          BdApi.Events.emit('ShadowArmy:batchExtractionComplete', eventData);
        }
        if (typeof window?.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('shadowExtracted', { detail: eventData, bubbles: true }));
          document.dispatchEvent(new CustomEvent('shadowExtracted', { detail: eventData, bubbles: true }));
        }

        // ONE summary toast
        if (BdApi?.showToast) {
          const rankSummary = Object.entries(rankCounts).map(([r, c]) => `${c}x ${r}`).join(', ');
          BdApi.showToast(`⚔️ ARISE: ${totalExtracted} shadows extracted (${rankSummary})`, { type: 'success', timeout: 4000 });
        }

        // Debounced widget update
        this._widgetDirty = true;
        if (this._postExtractionDebounceTimer) clearTimeout(this._postExtractionDebounceTimer);
        this._postExtractionDebounceTimer = setTimeout(async () => {
          this._postExtractionDebounceTimer = null;
          if (this._isStopped) return;
          if (typeof this.updateShadowRankWidget === 'function') {
            try {
              this._widgetDirty = false;
              await this.updateShadowRankWidget();
            } catch (e) {
              this.debugError('WIDGET', 'Failed to update widget after bulk extraction', e);
            }
          }
        }, 500);

        this.updateUI();
      } catch (error) {
        this.debugError('BULK_EXTRACTION', 'Post-extraction bookkeeping failed', error);
      }
    }

    return { extracted: totalExtracted, attempted: totalAttempted };
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
        const availableBeastRoles = this._getAvailableDungeonBeastRoles(shadowRank, beastFamilies);
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
    const baseStrength = this.calculateShadowPower(baseStats, 1); // use internal stats for power

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
    // Backward-compatibility shim:
    // Older call sites used (intelligence, perception, strength, rank).
    const usingLegacySignature =
      typeof userRank === 'number' &&
      typeof userStats === 'number' &&
      typeof targetRank === 'number' &&
      typeof targetStrength === 'string';
    if (usingLegacySignature) {
      intelligence = userRank;
      perception = userStats;
      strength = targetRank;
      const legacyRank = targetStrength; // string rank was passed as 4th arg
      userRank = legacyRank;
      targetRank = legacyRank;
      targetStrength = 0;
      userStats = {
        strength: Number.isFinite(strength) ? strength : 0,
        agility: 0,
        intelligence: Number.isFinite(intelligence) ? intelligence : 0,
        vitality: 0,
        perception: Number.isFinite(perception) ? perception : 0,
      };
    }

    // Defensive normalization for cross-plugin integration and future updates.
    const numericOrZero = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const safeUserStats =
      userStats && typeof userStats === 'object'
        ? {
            strength: numericOrZero(userStats.strength),
            agility: numericOrZero(userStats.agility),
            intelligence: numericOrZero(userStats.intelligence),
            vitality: numericOrZero(userStats.vitality),
            perception: numericOrZero(userStats.perception),
          }
        : { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };
    const safeIntelligence = numericOrZero(intelligence || safeUserStats.intelligence);
    const safePerception = numericOrZero(perception || safeUserStats.perception);
    const safeStrength = numericOrZero(strength || safeUserStats.strength);
    const safeTargetStrength = numericOrZero(targetStrength);

    const safeUserRank = this.shadowRanks.includes(userRank) ? userRank : 'E';
    const safeTargetRank = this.shadowRanks.includes(targetRank) ? targetRank : safeUserRank;

    const userRankIndex = this.shadowRanks.indexOf(safeUserRank);
    const targetRankIndex = this.shadowRanks.indexOf(safeTargetRank);

    // Rank difference: exponentially harder but never truly impossible.
    // Solo Leveling lore: Sung Jin-Woo arose shadows far above his rank (Igris, Beru).
    const rankDiff = targetRankIndex - userRankIndex;
    if (rankDiff > 1) {
      this.debugLog(
        'EXTRACTION_RANK_CHECK',
        `Extracting [${safeTargetRank}] shadow is extremely difficult (User: ${safeUserRank}, gap: +${rankDiff})`
      );
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    // Base chance from Intelligence
    const baseChance = Math.max(
      cfg.minBaseChance || 0.01,
      safeIntelligence * (cfg.chancePerInt || 0.01)
    );

    // Stats multiplier
    const totalStats = this.calculateUserStrength(safeUserStats);
    const statsMultiplier =
      1.0 +
      (safeIntelligence * 0.01 + // INT: +1% per point
        safePerception * 0.005 + // PER: +0.5% per point
        safeStrength * 0.003 + // STR: +0.3% per point
        (totalStats / 1000) * 0.01); // Total power bonus

    // Rank probability multiplier (lower ranks easier)
    const rankMultiplier = this.rankProbabilityMultipliers[safeTargetRank] || 1.0;

    // Rank difference penalty (exponential decay — very hard but not impossible)
    // Same rank: 1.0 | +1: 0.5 | +2: 0.05 | +3: 0.005 | +4: 0.0005 | +5: 0.00005
    // Each rank above the first applies a 10x penalty (not 2x), creating an exponential cliff.
    let rankPenalty = 1.0;
    if (rankDiff > 0) {
      rankPenalty = 0.5; // First rank above = 50%
      if (rankDiff > 1) {
        rankPenalty *= Math.pow(0.1, rankDiff - 1); // Each additional rank = 10x harder
      }
    }

    // Target strength resistance (improved - uses actual target strength if provided)
    // Use dictionary pattern for resistance calculation
    const userStrength = this.calculateUserStrength(safeUserStats);
    const resistanceCalculators = {
      strengthBased: () => {
        const strengthRatio = Math.min(1.0, safeTargetStrength / Math.max(1, userStrength));
        return Math.min(0.9, strengthRatio * 0.7); // Max 70% resistance from strength difference
      },
      rankBased: () => {
        return Math.min(0.9, (targetRankIndex + 1) / ((userRankIndex + 1) * 2));
      },
    };

    const targetResistance =
      safeTargetStrength > 0
        ? resistanceCalculators.strengthBased()
        : resistanceCalculators.rankBased();

    // Calculate raw chance
    const rawChance =
      baseChance * statsMultiplier * rankMultiplier * rankPenalty * (1 - targetResistance);
    if (!Number.isFinite(rawChance)) return 0;

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
    if (this._isStopped) return;

    // Use integrated ARISE animation if enabled
    if (this.settings?.ariseAnimation?.enabled) {
      this.queueAriseAnimation(shadow);
      return;
    }

    // Fallback: simple inline ARISE animation (minimal, in case ARISE animation disabled or fails)
    // Use BdApi.DOM utilities if available for better integration
    const animation = document.createElement('div');
    animation.className = 'shadow-army-extraction-animation';
    const content = document.createElement('div');
    content.className = 'shadow-extraction-content';

    const title = document.createElement('div');
    title.className = 'shadow-extraction-title';
    title.textContent = 'ARISE';

    const info = document.createElement('div');
    info.className = 'shadow-extraction-info';

    const rank = document.createElement('div');
    rank.className = 'shadow-rank';
    rank.textContent = shadow.rank || '';

    const role = document.createElement('div');
    role.className = 'shadow-role';
    role.textContent = shadow.roleName || shadow.role || '';

    info.appendChild(rank);
    info.appendChild(role);
    content.appendChild(title);
    content.appendChild(info);
    animation.appendChild(content);

    // Use BdApi.DOM utilities if available, otherwise fallback to manual append
    if (BdApi && BdApi.DOM && typeof BdApi.DOM.append === 'function') {
      BdApi.DOM.append(document.body, animation);
    } else {
      document.body.appendChild(animation);
    }

    const fadeOutId = setTimeout(() => {
      this._retryTimeouts?.delete(fadeOutId);
      animation.classList.add('fade-out');
      const removeId = setTimeout(() => {
        this._retryTimeouts?.delete(removeId);
        if (BdApi && BdApi.DOM && typeof BdApi.DOM.remove === 'function') {
          BdApi.DOM.remove(animation);
        } else {
          animation.remove();
        }
      }, 500);
      this._retryTimeouts?.add(removeId);
    }, 2000);
    this._retryTimeouts?.add(fadeOutId);
  }

  getAriseAnimationMinGapMs() {
    const ariseConfig = this.settings?.ariseAnimation || this.defaultSettings.ariseAnimation;
    const value = Number(ariseConfig?.minGapMs);
    return Number.isFinite(value) ? Math.max(250, value) : 900;
  }

  queueAriseAnimation(shadow) {
    if (!shadow) return;
    if (this._isStopped) return;

    const minGapMs = this.getAriseAnimationMinGapMs();
    const elapsed = Date.now() - (this._lastAriseAnimationAt || 0);

    if (!this._ariseDrainTimeout && elapsed >= minGapMs) {
      this.triggerAriseNow(shadow);
      return;
    }

    // Coalesce burst events: keep latest shadow data while waiting for cooldown
    this._pendingAriseShadow = shadow;
    this.schedulePendingAriseAnimation();
  }

  schedulePendingAriseAnimation() {
    if (this._isStopped) return;
    if (!this._pendingAriseShadow) return;
    if (this._ariseDrainTimeout) return;

    const minGapMs = this.getAriseAnimationMinGapMs();
    const elapsed = Date.now() - (this._lastAriseAnimationAt || 0);
    const waitMs = Math.max(0, minGapMs - elapsed);

    const queueTimeoutId = setTimeout(() => {
      this._retryTimeouts?.delete(queueTimeoutId);
      this._ariseDrainTimeout = null;
      if (this._isStopped) return;

      const nextShadow = this._pendingAriseShadow;
      this._pendingAriseShadow = null;
      if (nextShadow) {
        this.triggerAriseNow(nextShadow);
      }
    }, waitMs);

    this._ariseDrainTimeout = queueTimeoutId;
    this._retryTimeouts?.add(queueTimeoutId);
  }

  triggerAriseNow(shadow) {
    if (!shadow) return;
    try {
      this.triggerArise(shadow);
      this._lastAriseAnimationAt = Date.now();
    } catch (error) {
      this.debugError('ANIMATION', 'Error triggering ARISE animation', error);
    }
  }

  // ============================================================================
  // 3.8.1 SHADOW QUERY & MANAGEMENT
  // ============================================================================

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
      let shadows = await this.storageManager.getShadows({}, 0, Infinity);

      // HYBRID COMPRESSION: Decompress all shadows transparently
      // This ensures all operations (XP, level-ups, stats) work correctly
      // regardless of compression state in storage
      // Guard clause: Only map if shadows exist
      if (shadows && shadows.length > 0) {
        shadows = shadows.map((s) => this.getShadowData(s));
      }

      // Update snapshot cache — cross-plugin consumers read this via getShadowSnapshot()
      this._updateSnapshot(shadows);

      return shadows;
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('STORAGE', 'Failed to get all shadows from IndexedDB', error);
      return this.settings.shadows || [];
    }
  }

  /**
   * Returns cached shadow snapshot if <2s old, null otherwise.
   * Cross-plugin consumers call this FIRST before falling back to getAllShadows().
   * Eliminates redundant IDB reads — one authoritative source of truth.
   * @returns {Array|null} Cached shadow array or null if stale/missing
   */
  getShadowSnapshot() {
    if (this._snapshotCache && Date.now() - this._snapshotTimestamp < 2000) {
      return this._snapshotCache;
    }
    return null;
  }

  /**
   * Update snapshot cache after a fresh IDB read.
   * @param {Array} shadows - Fresh shadow array from getAllShadows()
   * @private
   */
  _updateSnapshot(shadows) {
    this._snapshotCache = shadows;
    this._snapshotTimestamp = Date.now();
  }

  /**
   * Invalidate snapshot cache — call after ANY shadow mutation.
   * @private
   */
  _invalidateSnapshot() {
    this._snapshotCache = null;
    this._snapshotTimestamp = 0;
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
          shadows = await this.storageManager.getShadows({}, 0, Infinity);
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
   * Calculate shadow power from effective stats (PUBLIC API)
   * Delegates to calculateShadowStrength for single source of truth.
   * @param {Object} effectiveStats - Effective stats object
   * @param {number} multiplier - Multiplier (default 1)
   * @returns {number} - Total power value
   */
  calculateShadowPower(effectiveStats, multiplier = 1) {
    return this.calculateShadowStrength(effectiveStats, multiplier);
  }

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
    if (!this.getCacheKey(shadow)) {
      this.debugLog('POWER_CALC', 'Invalid shadow object', {
        hasShadow: !!shadow,
        hasId: !!(shadow && shadow.id),
        hasI: !!(shadow && shadow.i),
      });
      return 0;
    }

    // Get identifier for cache key (use id or i)
    const shadowId = this.getCacheKey(shadow);
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
   * Get a stable cache key for a shadow object.
   * Prefers full id, falls back to compressed i field.
   * @param {Object} shadow - Shadow object
   * @returns {string|null} Cache key or null if invalid
   */
  getCacheKey(shadow) {
    if (!shadow) return null;
    return shadow.id || shadow.i || null;
  }

  /**
   * Invalidate power cache for specific shadow (handles compression state changes)
   * @param {Object} shadow - Shadow object to invalidate
   */
  invalidateShadowPowerCache(shadow) {
    if (!shadow || !this._shadowPowerCache) return;
    const keys = this.getAllCacheKeys
      ? this.getAllCacheKeys(shadow)
      : [this.getCacheKey(shadow)].filter(Boolean);
    keys.forEach((key) => {
      const powerCacheKey = `power_${key}`;
      if (this._shadowPowerCache.has(powerCacheKey)) {
        this._shadowPowerCache.delete(powerCacheKey);
        this.debugLog('CACHE', 'Invalidated power cache', { key: powerCacheKey });
      }
    });
  }

  /**
   * Stable cache key for aggregated army stats.
   * Derived from the total-power cache token so we never return stale aggregation
   * when the total-power cache is invalidated or updated.
   */
  getArmyStatsCacheKey() {
    const ts = this.settings?.cachedTotalPowerTimestamp || 0;
    const count = this.settings?.cachedTotalPowerShadowCount || 0;
    const version = this.settings?.cachedTotalPowerVersion || 0;
    return `${ts}_${count}_${version}`;
  }

  /**
   * Create an empty aggregated army stats object.
   * Centralized to keep `getAggregatedArmyStats()` smaller and consistent.
   */
  createEmptyArmyStats() {
    return {
      totalShadows: 0,
      totalPower: 0,
      totalStats: { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 },
      byRank: {},
      byRole: {},
      avgLevel: 0,
    };
  }

  // ============================================================================
  // 3.9.5 DUNGEON COMBAT OPTIMIZATION HELPERS
  // ============================================================================

  /**
   * Combat Performance Manager - Optimizes combat calculations for millions of shadows
   * Provides batching, throttling, caching, and aggregation for CPU/memory efficiency
   */

  _getShadowPowerValue(shadow) {
    let decompressed = shadow;
    if (this.getShadowData && typeof this.getShadowData === 'function') {
      decompressed = this.getShadowData(shadow) || shadow;
    }

    const effective = this.getShadowEffectiveStats(decompressed);
    if (effective) {
      const power = this.calculateShadowPower(effective, 1);
      if (power > 0) return power;
    }

    if (decompressed?.strength > 0) {
      return decompressed.strength;
    }

    return 0;
  }

  _accumulateShadowPower(shadow, totals) {
    try {
      const power = this._getShadowPowerValue(shadow);
      if (power > 0) {
        totals.totalPower += power;
        totals.processedCount += 1;
      }
    } catch (shadowError) {
      this.debugLog('POWER', 'Failed to calculate power for shadow', {
        shadowId: this.getCacheKey(shadow),
        error: shadowError?.message,
      });
    }
  }

  _persistTotalPowerCache(totalPower, currentCount) {
    this.settings.cachedTotalPower = totalPower;
    this.settings.cachedTotalPowerShadowCount = currentCount;
    this.settings.cachedTotalPowerTimestamp = Date.now();
    this.settings.cachedTotalPowerVersion = (this.settings.cachedTotalPowerVersion || 0) + 1;
    this.saveSettings();
  }

  async _applyTotalPowerDelta(shadow, direction) {
    const shadowPower = this._getShadowPowerValue(shadow);
    if (!(shadowPower > 0)) {
      return null;
    }

    const currentPower = this.settings.cachedTotalPower || 0;
    const newPower =
      direction === 'decrement'
        ? Math.max(0, currentPower - shadowPower)
        : currentPower + shadowPower;
    const currentCount = (await this.storageManager?.getTotalCount()) || 0;

    this.settings.cachedTotalPower = newPower;
    this.settings.cachedTotalPowerShadowCount = currentCount;
    this.settings.cachedTotalPowerTimestamp = Date.now();
    this.saveSettings();

    return { shadowPower, currentPower, newPower, currentCount };
  }

  /**
   * Calculate total shadow power directly (simple, fast, reliable)
   * Uses incremental cache: adds/subtracts power when shadows change
   * Operations:
   * 1. Check if cache is valid (shadow count matches)
   * 2. If valid, return cached power
   * 3. If invalid, recalculate from all shadows
   * 4. Cache result for future use
   * @param {boolean} forceRecalculate - Force full recalculation
   * @returns {Promise<number>} - Total shadow power
   */
  async getTotalShadowPower(forceRecalculate = false) {
    // Fast path: Check incremental cache first
    if (!forceRecalculate && this.storageManager && this.settings.cachedTotalPowerTimestamp) {
      const currentCount = (await this.storageManager.getTotalCount()) || 0;
      const cachedCount = this.settings.cachedTotalPowerShadowCount || 0;

      // Cache is valid if shadow count matches (including 0-shadows case)
      if (currentCount === cachedCount) {
        const cachedPower = this.settings.cachedTotalPower || 0;
        this.debugLog('POWER', 'Using incremental cache', {
          cachedPower,
          shadowCount: currentCount,
        });
        return cachedPower;
      }
    }

    // Full recalculation: Get all shadows and sum their power
    this.debugLog('POWER', 'Recalculating total power from all shadows', {
      forceRecalculate,
      cachedPower: this.settings.cachedTotalPower,
      cachedCount: this.settings.cachedTotalPowerShadowCount || 0,
    });

    const totals = { totalPower: 0, processedCount: 0 };

    if (this.storageManager) {
      try {
        // getAll() fast path loads everything in one native IDB call — no need to paginate
        const allShadows = await this.storageManager.getShadows({}, 0, Infinity);

        for (const shadow of allShadows) {
          this._accumulateShadowPower(shadow, totals);
        }

        // Update incremental cache
        const currentCount = (await this.storageManager.getTotalCount()) || 0;
        this._persistTotalPowerCache(totals.totalPower, currentCount);

        this.debugLog('POWER', 'Total power calculated', {
          totalPower: totals.totalPower,
          processedShadows: totals.processedCount,
          totalShadows: currentCount,
          cacheUpdated: true,
        });

        return totals.totalPower;
      } catch (error) {
        this.debugError('POWER', 'Failed to calculate total power', error);
        return this.settings.cachedTotalPower || 0; // Return cached value on error
      }
    }

    return 0;
  }

  /**
   * Increment total power cache when shadow is added
   * @param {Object} shadow - Shadow object
   * @returns {Promise<number>} - New total power
   */
  async incrementTotalPower(shadow) {
    try {
      const result = await this._applyTotalPowerDelta(shadow, 'increment');
      if (result) {
        this.debugLog('POWER', 'Incremented total power cache', {
          shadowPower: result.shadowPower,
          previousPower: result.currentPower,
          newPower: result.newPower,
          shadowCount: result.currentCount,
        });

        return result.newPower;
      }
    } catch (error) {
      this.debugError('POWER', 'Failed to increment total power', error);
    }

    // SAFETY: Do NOT force full recalculation here — getTotalShadowPower(true)
    // triggers a full getShadows() IDB cursor scan loading ALL shadows into memory.
    // During batch extraction (corpse pile ARISE), multiple concurrent calls would
    // each spawn a full-table scan → OOM crash. Instead, return cached value and
    // let the next natural power recalc (widget refresh, combat tick) fix the cache.
    return this.settings.cachedTotalPower || 0;
  }

  async getAllShadowsForAggregation() {
    let allShadows = [];
    let totalCount = 0;

    if (!this.storageManager) {
      this.debugLog('COMBAT', 'No storage manager available - returning empty array', {
        hasStorageManager: false,
      });
      return { allShadows, totalCount };
    }

    try {
      // Ensure storage manager is initialized
      if (!this.storageManager?.db) {
        this.debugLog('COMBAT', 'IndexedDB not initialized, initializing now...');
        await this.storageManager.init();
      }

      // FAST PATH: Use snapshot cache if fresh (avoids IDB read entirely)
      const snapshot = this.getShadowSnapshot();
      if (snapshot && snapshot.length > 0) {
        this.debugLog('COMBAT', 'Using snapshot cache for aggregation', {
          snapshotSize: snapshot.length,
        });
        return { allShadows: snapshot, totalCount: snapshot.length };
      }

      // Verify IndexedDB is working by checking count first
      totalCount = await this.storageManager.getTotalCount();

      // CRITICAL: Only use IndexedDB - no fallback to old settings.shadows
      if (totalCount > 0) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, Infinity);

          // CRITICAL DIAGNOSTIC: If IndexedDB has shadows but getShadows returned empty
          if (!allShadows || allShadows.length === 0) {
            this.debugError(
              'COMBAT',
              'CRITICAL: IndexedDB has shadows but getShadows returned empty!',
              {
                totalCount,
                returnedCount: allShadows?.length || 0,
                hasStorageManager: !!this.storageManager,
                dbInitialized: !!this.storageManager?.db,
                dbName: this.storageManager?.dbName || 'unknown',
                storeName: this.storageManager?.storeName || 'unknown',
                possibleCauses: [
                  'IndexedDB transaction failed silently',
                  'Shadows filtered out by getShadows logic',
                  'IndexedDB cursor not iterating correctly',
                  'Database corruption or migration issue',
                ],
              }
            );

            // Try to get a single shadow directly to verify IndexedDB access
            try {
              const testShadows = await this.storageManager.getShadows({}, 0, 1);
              this.debugLog('COMBAT', 'Direct test query result', {
                testShadowCount: testShadows?.length || 0,
                firstShadow: testShadows?.[0]
                  ? { id: testShadows[0].id || testShadows[0].i, rank: testShadows[0].rank }
                  : null,
              });
            } catch (testError) {
              this.debugError('COMBAT', 'Direct test query also failed', testError);
            }
          } else {
            this.debugLog('COMBAT', 'Retrieved shadows from IndexedDB', {
              shadowCount: allShadows.length,
              totalCount,
              hasStorageManager: !!this.storageManager,
              dbInitialized: !!this.storageManager?.db,
            });
          }
        } catch (getShadowsError) {
          this.debugError('COMBAT', 'getShadows() threw an error', {
            error: getShadowsError,
            message: getShadowsError?.message,
            stack: getShadowsError?.stack,
            totalCount,
          });
          allShadows = []; // Set to empty on error
        }
      } else {
        // IndexedDB is empty - shadows should be in IndexedDB, not settings
        this.debugLog('COMBAT', 'IndexedDB is empty - no shadows found', {
          totalCount,
          dbName: this.storageManager?.dbName || 'unknown',
        });
        allShadows = []; // Empty array - no fallback to old storage
      }
    } catch (storageError) {
      this.debugError('COMBAT', 'Failed to get shadows from IndexedDB', storageError);
      // CRITICAL: No fallback to old settings.shadows - shadows are in IndexedDB only
      allShadows = []; // Empty array - no fallback to old storage
      totalCount = 0;
      this.debugLog('COMBAT', 'Using empty array (no fallback to old storage)', {
        error: storageError?.message || 'Unknown error',
      });
    }

    return { allShadows: allShadows || [], totalCount: totalCount || 0 };
  }

  logShadowAggregationSamples(allShadows) {
    // Debug: Log shadow retrieval success with detailed info
    this.debugLog('COMBAT', 'Retrieved shadows for aggregation', {
      shadowCount: allShadows.length,
      firstShadowSample: allShadows[0]
        ? {
            id: allShadows[0].id || allShadows[0].i,
            rank: allShadows[0].rank,
            hasStrength: !!allShadows[0].strength,
            strength: allShadows[0].strength,
            hasBaseStats: !!allShadows[0].baseStats,
            baseStats: allShadows[0].baseStats,
            isCompressed: !!(allShadows[0]._c === 1 || allShadows[0]._c === 2),
          }
        : null,
    });

    // CRITICAL DEBUG: Log if we have shadows but they might have issues
    if (allShadows.length > 0) {
      const sampleShadow = allShadows[0];
      let decompressed = sampleShadow;
      if (this.getShadowData && typeof this.getShadowData === 'function') {
        decompressed = this.getShadowData(sampleShadow) || sampleShadow;
      }
      const effective = this.getShadowEffectiveStats(decompressed);
      const power = this.calculateShadowPower(effective, 1);

      this.debugLog('COMBAT', 'Sample shadow power calculation', {
        shadowId: sampleShadow.id || sampleShadow.i,
        hasGetShadowData: !!this.getShadowData,
        hasDecompressed: !!decompressed,
        hasEffective: !!effective,
        effectiveStats: effective,
        calculatedPower: power,
        storedStrength: sampleShadow.strength,
        decompressedStrength: decompressed?.strength,
        hasBaseStats: !!decompressed?.baseStats,
        baseStats: decompressed?.baseStats,
      });
    }
  }

  aggregateShadowsForArmyStats(allShadows) {
    // Use reduce for functional aggregation
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];

    return allShadows.reduce(
      (acc, shadow) => {
        // Decompress if needed - use getShadowData if available, otherwise use shadow directly
        let decompressed = shadow;
        if (this.getShadowData && typeof this.getShadowData === 'function') {
          decompressed = this.getShadowData(shadow);
        }

        // If getShadowData returned null/undefined, use original shadow
        if (!decompressed) {
          decompressed = shadow;
        }

        // Guard clause: Skip if shadow is still invalid
        if (!decompressed || (!decompressed.id && !decompressed.i)) {
          const shadowId = this.getCacheKey(shadow);
          this.debugLog('COMBAT', 'Invalid shadow data, skipping', {
            shadowId,
            hasGetShadowData: !!this.getShadowData,
          });
          return acc; // Skip invalid shadow
        }

        // CRITICAL: Always use effective stats (baseStats + growthStats + naturalGrowthStats)
        // This ensures accuracy by including ALL stat sources: base, level-up growth, and natural growth
        const effective = this.getShadowEffectiveStats(decompressed);

        // Guard clause: Skip shadow if we can't calculate effective stats
        // This should rarely happen, but ensures data integrity
        if (!effective) {
          this.debugLog('COMBAT', 'Cannot calculate effective stats, skipping shadow', {
            shadowId: this.getCacheKey(decompressed),
            hasBaseStats: !!decompressed.baseStats,
            hasGrowthStats: !!decompressed.growthStats,
            hasNaturalGrowthStats: !!decompressed.naturalGrowthStats,
          });
          return acc; // Skip invalid shadow
        }

        // CRITICAL: Check if effective stats are all zeros (invalid shadow data)
        const totalEffectiveStats = statKeys.reduce((sum, key) => sum + (effective[key] || 0), 0);
        if (totalEffectiveStats === 0) {
          // Shadow has no stats - this is a data integrity issue
          // Try to use stored strength as fallback
          const fallbackStrength = decompressed.strength || shadow.strength || 0;
          if (fallbackStrength > 0) {
            // Use stored strength as power
            this.debugLog(
              'COMBAT',
              'Using stored strength as fallback (effective stats are all 0)',
              {
                shadowId: this.getCacheKey(decompressed),
                storedStrength: fallbackStrength,
                effectiveStats: effective,
                baseStats: decompressed.baseStats,
              }
            );
            const power = fallbackStrength;
            acc.totalShadows++;
            acc.totalPower += power;
            acc.totalLevel += decompressed.level || 1;
            // Estimate stats from strength (rough approximation)
            statKeys.forEach((stat) => {
              acc.totalStats[stat] += Math.floor(power / 5); // Distribute evenly
            });
            return acc;
          }

          // No valid stats or strength - skip this shadow
          this.debugLog('COMBAT', 'Skipping shadow with no valid stats or strength', {
            shadowId: this.getCacheKey(decompressed),
            effectiveStats: effective,
            storedStrength: fallbackStrength,
            baseStats: decompressed.baseStats,
            rank: decompressed?.rank,
          });
          return acc; // Skip invalid shadow
        }

        // CRITICAL: Always calculate power from effective stats for accuracy
        // Effective stats = baseStats + growthStats + naturalGrowthStats
        // This ensures we include ALL stat sources, not just baseStats or stored strength
        const power = this.calculateShadowPower(effective, 1);

        // Debug log if power is 0 (shouldn't happen with valid effective stats)
        // Only log first few to avoid spam
        if (power === 0 && acc.totalShadows < 3) {
          this.debugLog('COMBAT', 'Power is 0 despite having effective stats', {
            shadowId: this.getCacheKey(decompressed),
            effectiveStats: effective,
            totalEffectiveStats,
            baseStats: decompressed.baseStats,
            growthStats: decompressed.growthStats,
            naturalGrowthStats: decompressed.naturalGrowthStats,
            rank: decompressed?.rank,
            level: decompressed?.level,
            calculatedPower: power,
          });
        }

        // Aggregate totals using effective stats (includes ALL stat sources)
        acc.totalShadows++;
        acc.totalPower += power; // Power calculated from effective stats
        acc.totalLevel += decompressed.level || 1;

        // CRITICAL: Always aggregate stats from effective stats (baseStats + growthStats + naturalGrowthStats)
        // This ensures we include ALL stat sources for accurate total stats
        statKeys.forEach((stat) => {
          acc.totalStats[stat] += effective[stat] || 0;
        });

        // Group by rank using effective stats
        const rank = decompressed.rank || 'E';
        if (!acc.byRank[rank]) {
          acc.byRank[rank] = {
            count: 0,
            totalPower: 0,
            totalStats: statKeys.reduce((s, k) => ({ ...s, [k]: 0 }), {}),
          };
        }
        acc.byRank[rank].count++;
        acc.byRank[rank].totalPower += power; // Power from effective stats
        statKeys.forEach((stat) => {
          acc.byRank[rank].totalStats[stat] += effective[stat] || 0;
        });

        // Group by role using effective stats
        const role = decompressed.role || decompressed.roleName || 'Unknown';
        if (!acc.byRole[role]) {
          acc.byRole[role] = {
            count: 0,
            totalPower: 0,
            totalStats: statKeys.reduce((s, k) => ({ ...s, [k]: 0 }), {}),
          };
        }
        acc.byRole[role].count++;
        acc.byRole[role].totalPower += power; // Power from effective stats
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
  }

  async finalizeAggregatedArmyStats({ aggregatedData, allShadowsLength }) {
    // Calculate averages
    const avgLevel =
      aggregatedData.totalShadows > 0
        ? Math.floor(aggregatedData.totalLevel / aggregatedData.totalShadows)
        : 0;

    // CRITICAL FIX: Use direct power calculation instead of aggregation loop
    // This is more reliable and uses the incremental cache
    // Store values before async call to avoid race condition warning
    const totalShadowsCount = aggregatedData.totalShadows;
    const fallbackPower = aggregatedData.totalPower; // Store fallback from reduce loop

    // Calculate direct power first, then use it to override aggregated power
    let finalPower = fallbackPower; // Initialize with fallback
    if (totalShadowsCount > 0) {
      try {
        const directPower = await this.getTotalShadowPower(false); // Use cache if valid
        // Always use direct power (it's more accurate and uses incremental cache)
        finalPower = directPower > 0 ? directPower : fallbackPower;
        this.debugLog('GET_AGGREGATED_ARMY_STATS', 'Using direct power calculation', {
          directPower,
          totalShadows: totalShadowsCount,
          finalPower,
        });
      } catch (powerError) {
        this.debugError(
          'GET_AGGREGATED_ARMY_STATS',
          'Failed to get direct power, using aggregated',
          powerError
        );
        // Use fallback power (already stored)
        finalPower = fallbackPower;
      }
    }

    // Create final result object with updated power (immutable - avoids race condition)
    const aggregated = {
      ...aggregatedData,
      avgLevel,
      totalPower: finalPower,
    };

    // VALIDATION: Ensure totalPower is a valid number
    if (typeof aggregated.totalPower !== 'number' || isNaN(aggregated.totalPower)) {
      this.debugError('GET_AGGREGATED_ARMY_STATS', 'Invalid totalPower calculated', {
        totalPower: aggregated.totalPower,
        totalShadows: aggregated.totalShadows,
        shadowCount: allShadowsLength,
      });
      // Create new object with corrected power (immutable update)
      return { aggregated: { ...aggregated, totalPower: 0 }, shouldCache: false };
    }

    // CRITICAL DIAGNOSTIC: Log detailed aggregation results
    const avgPower =
      aggregated.totalShadows > 0 ? Math.floor(aggregated.totalPower / aggregated.totalShadows) : 0;

    this.debugLog('GET_AGGREGATED_ARMY_STATS', 'Army stats aggregated successfully', {
      totalShadows: aggregated.totalShadows,
      totalPower: aggregated.totalPower,
      shadowCount: allShadowsLength,
      avgPower,
      avgLevel: aggregated.avgLevel,
      byRankCounts: Object.keys(aggregated.byRank).map((rank) => ({
        rank,
        count: aggregated.byRank[rank].count,
        power: aggregated.byRank[rank].totalPower,
      })),
      totalStatsSum: Object.values(aggregated.totalStats).reduce((sum, val) => sum + (val || 0), 0),
    });

    // CRITICAL WARNING: If we have shadows but totalPower is 0, something is wrong
    if (aggregated.totalShadows > 0 && aggregated.totalPower === 0) {
      this.debugError('GET_AGGREGATED_ARMY_STATS', 'WARNING: Shadows exist but totalPower is 0!', {
        totalShadows: aggregated.totalShadows,
        shadowCount: allShadowsLength,
        totalStats: aggregated.totalStats,
        byRank: aggregated.byRank,
        possibleCauses: [
          'Shadows have no baseStats',
          'Effective stats calculation is returning all zeros',
          'Power calculation is failing',
          'Shadows are compressed incorrectly',
        ],
      });
    }

    return { aggregated, shouldCache: true };
  }

  /**
   * Calculate aggregated army stats directly (no cache)
   * Operations:
   * 1. Get all shadows from IndexedDB
   * 2. Group by rank and role
   * 3. Calculate aggregated stats per group
   * 4. Use direct power calculation for totalPower
   * @returns {Promise<Object>} - Aggregated army stats { totalShadows, totalPower, totalStats, byRank, byRole, avgLevel }
   */
  async getAggregatedArmyStats() {
    // Fast path: short TTL cache keyed to total-power cache token
    const cacheTtlMs = 1500;
    const now = Date.now();
    const currentCacheKey = this.getArmyStatsCacheKey();
    if (
      this._armyStatsCache &&
      this._armyStatsCacheTime &&
      this._armyStatsCacheKey === currentCacheKey &&
      now - this._armyStatsCacheTime < cacheTtlMs
    ) {
      return this._armyStatsCache;
    }

    try {
      const { allShadows, totalCount } = await this.getAllShadowsForAggregation();

      // Guard clause: Return empty stats if no shadows
      if (!allShadows || allShadows.length === 0) {
        this.debugLog('COMBAT', 'No shadows found in storage', {
          hasStorageManager: !!this.storageManager,
          dbInitialized: !!this.storageManager?.db,
          settingsShadowsCount: (this.settings.shadows || []).length,
          storageManagerDbName: this.storageManager?.dbName,
        });

        // Preserve the existing diagnostic log (but avoid a second IndexedDB count call)
        if (this.storageManager) {
          this.debugLog('COMBAT', 'IndexedDB total count check', {
            totalCount,
            dbName: this.storageManager?.dbName || 'unknown',
          });
        }

        const emptyStats = this.createEmptyArmyStats();

        // CRITICAL FIX: Don't cache empty results if IndexedDB shows shadows exist
        // This prevents caching 0 when shadows are being loaded/migrated
        if (totalCount > 0) {
          this.debugLog(
            'COMBAT',
            'IndexedDB has shadows but getShadows returned empty - not caching empty result',
            {
              totalCount,
              reason: 'Possible timing issue during migration or initialization',
            }
          );
          return emptyStats;
        }

        return emptyStats;
      }

      this.logShadowAggregationSamples(allShadows);

      const aggregatedData = this.aggregateShadowsForArmyStats(allShadows);
      const { aggregated, shouldCache } = await this.finalizeAggregatedArmyStats({
        aggregatedData,
        allShadowsLength: allShadows.length,
      });

      if (
        shouldCache &&
        (this.settings.cachedTotalPowerShadowCount || 0) === aggregated.totalShadows
      ) {
        this._armyStatsCache = aggregated;
        this._armyStatsCacheTime = Date.now();
        this._armyStatsCacheKey = this.getArmyStatsCacheKey();
      }

      return aggregated;
    } catch (error) {
      this.debugError('COMBAT', 'Failed to aggregate army stats', error);

      // Don't cache empty stats on error - return previous cache if available
      // This prevents progress bar from showing 0 when there's a temporary error
      if (this._armyStatsCache && this._armyStatsCache.totalPower > 0) {
        this.debugLog('COMBAT', 'Returning previous cache due to error', {
          previousTotalPower: this._armyStatsCache.totalPower,
          previousTotalShadows: this._armyStatsCache.totalShadows,
        });
        return this._armyStatsCache;
      }

      // Only return empty stats if we have no previous cache
      return this.createEmptyArmyStats();
    }
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
      // CRITICAL: Only use IndexedDB - no fallback to old settings.shadows
      // If storageManager is not available, skip aggregated buffs (generals already processed)
      this.debugLog(
        'BUFFS',
        'storageManager not available, skipping aggregated buffs (generals already processed)'
      );
      // No fallback code - aggregated buffs skipped if storageManager unavailable
      // Only generals (top 7) will provide buffs in this case
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
   * 3. Otherwise, all shadows receive XP from messages (shared experience)
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
      // All shadows receive XP from messages (shared experience)
      shadowsToGrant = await this.getAllShadows();
    }

    // Guard clause: Return early if no shadows to grant XP to
    if (!shadowsToGrant.length) return;

    const MAX_LEVEL = 9999; // Safety cap to prevent infinite level-up loops
    const perShadow = baseAmount;

    // Process all shadows in-memory first (CPU-only, no I/O)
    const updatedShadows = [];
    for (const shadow of shadowsToGrant) {
      shadow.xp = (shadow.xp || 0) + perShadow;
      let level = shadow.level || 1;

      // Level up loop in case of big XP grants (with safety cap)
      const shadowRank = shadow.rank || 'E';
      let leveledUp = false;
      while (shadow.xp >= this.getShadowXpForNextLevel(level, shadowRank) && level < MAX_LEVEL) {
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
          this.debugLog(
            'RANK_UP',
            `AUTO RANK-UP: ${shadow.name || 'Shadow'} promoted ${rankUpResult.oldRank} -> ${
              rankUpResult.newRank
            }!`
          );
        }
      }

      // Invalidate individual shadow power cache before saving (prevents stale cache)
      this.invalidateShadowPowerCache(shadow);
      updatedShadows.push(this.prepareShadowForSave(shadow));
    }

    // Single batched IDB write for all shadows (was: sequential await per shadow)
    if (this.storageManager && updatedShadows.length > 0) {
      try {
        if (this.storageManager.updateShadowsBatch) {
          await this.storageManager.updateShadowsBatch(updatedShadows);
        } else {
          // Fallback: parallel writes if batch not available
          await Promise.all(updatedShadows.map((s) => this.storageManager.saveShadow(s)));
        }
        this._invalidateSnapshot(); // XP/level/rank changed — snapshot stale
      } catch (error) {
        this.debugError('STORAGE', 'Failed to batch-save shadow XP updates to IndexedDB', error);
      }
    }

    // When shadow XP/level changes, we need to recalculate that shadow's power and update cache
    // Invalidate incremental cache to force full recalculation
    this.settings.cachedTotalPowerShadowCount = 0; // Invalidate incremental cache
    this.clearShadowPowerCache(); // Clear individual shadow power cache

    // Trigger background recalculation (don't wait - async update)
    // This will recalculate total power with fresh shadow power values
    this.getTotalShadowPower(true).catch(() => {}); // Force full recalculation

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
    const effective = statKeys.reduce((stats, stat) => {
      stats[stat] = (base[stat] || 0) + (growth[stat] || 0) + (naturalGrowth[stat] || 0);
      return stats;
    }, {});

    // CRITICAL FIX: Ensure shadows have minimum stats if all are 0
    // This prevents shadows from doing 0 damage in combat
    const totalStats = statKeys.reduce((sum, stat) => sum + (effective[stat] || 0), 0);
    if (totalStats === 0 && shadow.level) {
      // Fallback: Use level and rank to calculate minimum stats
      const shadowLevel = shadow.level || 1;
      const rankMultiplier = this.rankStatMultipliers[shadow.rank] || 1.0;
      const minStatValue = Math.max(1, Math.floor(shadowLevel * 5 * rankMultiplier));

      statKeys.forEach((stat) => {
        effective[stat] = minStatValue;
      });

      this.debugLog('STATS', 'Shadow had 0 stats, applied fallback minimum stats', {
        shadowId: shadow.id,
        level: shadowLevel,
        rank: shadow.rank,
        minStatValue,
      });
    }

    return effective;
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

    // Ceiling: Monarch+ and Shadow Monarch are player-exclusive ranks
    if (nextRank === 'Monarch+' || nextRank === 'Shadow Monarch') {
      return { success: false };
    }

    // Get shadow's effective stats
    const effectiveStats = this.getShadowEffectiveStats(shadow);

    // Get baseline for next rank
    const nextRankMultiplier = this.rankStatMultipliers[nextRank] || 1.0;
    const baselineForNextRank = this.getRankBaselineStats(nextRank, nextRankMultiplier);

    // Compare total stats against 80% of next rank's total baseline
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const totalBaseline = statKeys.reduce((sum, stat) => sum + (baselineForNextRank[stat] || 0), 0);
    const totalEffective = statKeys.reduce((sum, stat) => sum + (effectiveStats[stat] || 0), 0);

    // Guard clause: Check if shadow qualifies (80% of next rank's total baseline stats)
    if (totalEffective >= totalBaseline * 0.8) {
      // PERFORM RANK-UP
      shadow.rank = nextRank;

      // Reset level to 1 for new rank (fresh start at new tier)
      shadow.level = 1;
      shadow.xp = 0;

      // Recalculate strength with new rank
      const newEffectiveStats = this.getShadowEffectiveStats(shadow);
      shadow.strength = this.calculateShadowStrength(newEffectiveStats, 1);

      // Invalidate individual shadow power cache before saving (prevents stale cache)
      this.invalidateShadowPowerCache(shadow);

      // When shadow rank changes, we need to recalculate that shadow's power and update cache
      // Invalidate incremental cache to force full recalculation
      this.settings.cachedTotalPowerShadowCount = 0; // Invalidate incremental cache
      this.clearShadowPowerCache(); // Clear individual shadow power cache

      // Trigger background recalculation (don't wait - async update)
      // This will recalculate total power with fresh shadow power values
      this.getTotalShadowPower(true).catch(() => {}); // Force full recalculation

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

  async _loadShadowsForMigration() {
    let allShadows = [];

    if (this.storageManager) {
      try {
        allShadows = await this.storageManager.getShadows({}, 0, Infinity);
      } catch (error) {
        this.debugError('MIGRATION', 'Error getting shadows from IndexedDB', error);
      }
    }

    if (this.settings.shadows && this.settings.shadows.length > 0) {
      const localStorageShadows = this.settings.shadows.filter(
        (s) => !allShadows.find((dbShadow) => dbShadow.id === s.id)
      );
      allShadows = allShadows.concat(localStorageShadows);
    }

    return allShadows;
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

      const allShadows = await this._loadShadowsForMigration();
      this.debugLog('MIGRATION', `Found ${allShadows.length} shadows to fix`);

      // Guard clause: Return early if no shadows to fix
      if (allShadows.length === 0) {
        this.debugLog('MIGRATION', 'No shadows to fix');
        BdApi.Data.save('ShadowArmy', migrationKey, true);
        return;
      }

      let fixed = 0;
      const batchSize = 50;

      for (let i = 0; i < allShadows.length; i += batchSize) {
        if (this._isStopped) {
          this.debugLog('MIGRATION', 'Base stats migration aborted (plugin stopped)');
          return;
        }
        const batch = allShadows.slice(i, i + batchSize);

        for (const shadow of batch) {
          if (this._isStopped) {
            this.debugLog('MIGRATION', 'Base stats migration aborted (plugin stopped)');
            return;
          }
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

  // ── VERSIONED DATA MIGRATION RUNNER ──────────────────────────────────────
  // Each migration has a version number and runs once (tracked via BdApi.Data).
  // To add a new migration: append an entry to the MIGRATIONS array below.
  // The runner executes all migrations whose version > current, in order.

  /**
   * Run all pending data migrations sequentially.
   * Migrations are idempotent and tracked by version number.
   */
  async runDataMigrations() {
    const MIGRATIONS = [
      { version: 3, key: 'shadowArmy_recalculated_v3', run: () => this.recalculateAllShadows() },
      { version: 4, key: 'shadowArmy_baseStats_v4', run: () => this.fixShadowBaseStatsToRankBaselines() },
      { version: 5, key: 'shadowArmy_backfill_v5', run: () => this.backfillMissingFields() },
    ];

    for (const migration of MIGRATIONS) {
      if (BdApi.Data.load('ShadowArmy', migration.key)) continue; // Already done
      try {
        this.debugLog('MIGRATION', `Running migration v${migration.version}: ${migration.key}`);
        await migration.run();
        // Mark complete (individual migrations also mark themselves, but belt-and-suspenders)
        BdApi.Data.save('ShadowArmy', migration.key, { completedAt: new Date().toISOString() });
        this.debugLog('MIGRATION', `Migration v${migration.version} complete`);
      } catch (error) {
        this.debugError('MIGRATION', `Migration v${migration.version} failed: ${migration.key}`, error);
        // Don't block subsequent migrations — each is independent
      }
    }
  }

  /**
   * v5 Migration: Backfill missing/invalid fields on all shadows in IDB.
   *
   * Fixes:
   * - growthVarianceSeed: 0 or missing → random 0-1 (fixes ultra-decompression 20% penalty)
   * - naturalGrowthStats: missing → zeroed object
   * - growthStats: missing → zeroed object
   * - totalCombatTime: missing → 0
   * - lastNaturalGrowth: missing → extractedAt or Date.now()
   * - role: missing → 'knight'
   * - level: missing/0 → 1
   * - xp: missing → 0
   * - strength: 0 or missing → recalculated
   */
  async backfillMissingFields() {
    if (!this.storageManager) return;

    const allShadows = await this._loadShadowsForMigration();
    if (allShadows.length === 0) return;

    const zeroStats = { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };
    let updated = 0;

    for (const shadow of allShadows) {
      // Skip compressed shadows — they get backfilled on decompression
      if (shadow._c) continue;

      let dirty = false;

      // growthVarianceSeed: 0 is falsy but wrong (causes 0.8x permanent penalty)
      if (!shadow.growthVarianceSeed || shadow.growthVarianceSeed === 0) {
        shadow.growthVarianceSeed = Math.random();
        dirty = true;
      }

      if (!shadow.naturalGrowthStats || typeof shadow.naturalGrowthStats !== 'object') {
        shadow.naturalGrowthStats = { ...zeroStats };
        dirty = true;
      }

      if (!shadow.growthStats || typeof shadow.growthStats !== 'object') {
        shadow.growthStats = { ...zeroStats };
        dirty = true;
      }

      if (shadow.totalCombatTime === undefined || shadow.totalCombatTime === null) {
        shadow.totalCombatTime = 0;
        dirty = true;
      }

      if (!shadow.lastNaturalGrowth) {
        shadow.lastNaturalGrowth = shadow.extractedAt || Date.now();
        dirty = true;
      }

      if (!shadow.role) {
        shadow.role = 'knight';
        dirty = true;
      }

      if (!shadow.level || shadow.level < 1) {
        shadow.level = 1;
        dirty = true;
      }

      if (shadow.xp === undefined || shadow.xp === null) {
        shadow.xp = 0;
        dirty = true;
      }

      // Recalculate strength if missing/zero
      if ((!shadow.strength || shadow.strength === 0) && shadow.baseStats) {
        const effective = this.getShadowEffectiveStats?.(shadow);
        if (effective) {
          shadow.strength = this.calculateShadowStrength?.(effective, 1) || 0;
          dirty = true;
        }
      }

      if (dirty) {
        try {
          await this.storageManager.saveShadow(shadow);
          updated++;
        } catch (error) {
          this.debugError('MIGRATION', `Failed to backfill shadow ${shadow.id}`, error);
        }
      }
    }

    this.debugLog('MIGRATION', `v5 backfill complete`, {
      total: allShadows.length,
      updated,
      skippedCompressed: allShadows.filter((s) => s._c).length,
    });
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

      const allShadows = await this._loadShadowsForMigration();
      this.debugLog('MIGRATION', `Found ${allShadows.length} shadows in migration scan`);

      // Guard clause: Return early if no shadows to recalculate
      if (allShadows.length === 0) {
        this.debugLog('MIGRATION', 'No shadows to recalculate');
        BdApi.Data.save('ShadowArmy', migrationKey, true);
        return;
      }

      let recalculated = 0;
      const batchSize = 50;

      for (let i = 0; i < allShadows.length; i += batchSize) {
        if (this._isStopped) {
          this.debugLog('MIGRATION', 'Recalculate migration aborted (plugin stopped)');
          return;
        }
        const batch = allShadows.slice(i, i + batchSize);

        for (const shadow of batch) {
          if (this._isStopped) {
            this.debugLog('MIGRATION', 'Recalculate migration aborted (plugin stopped)');
            return;
          }
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
    // Note: BetterDiscord doesn't guarantee plugin load order, so we retry if CriticalHit isn't ready
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 500; // 500ms between retries

    const attemptLoad = () => {
      if (this._isStopped) return false;
      try {
        const criticalHitPlugin = BdApi.Plugins.get('CriticalHit');
        if (criticalHitPlugin) {
          const instance = criticalHitPlugin.instance || criticalHitPlugin;
          if (instance && typeof instance.loadLocalFont === 'function') {
            // Ensure font name matches CriticalHit's expected format
            // CriticalHit maps "Speedy Space Goat Oddity" to "SpeedySpaceGoatOddity"
            const loaded = instance.loadLocalFont(fontName);
            if (loaded) {
              // Verify font was actually loaded by checking for style element
              // Check immediately and after a short delay to allow DOM to update
              if (document.getElementById(fontStyleId)) {
                this.debugLog('FONT_LOADER', 'Font loaded via CriticalHit plugin', {
                  fontName,
                  fontStyleId,
                });
                return true;
              }

              // If not found immediately, check again after delay
              const verifyTimeoutId = setTimeout(() => {
                this._retryTimeouts?.delete(verifyTimeoutId);
                if (this._isStopped) return;
                if (document.getElementById(fontStyleId)) {
                  this.debugLog(
                    'FONT_LOADER',
                    'Font loaded via CriticalHit plugin (verified after delay)',
                    {
                      fontName,
                      fontStyleId,
                    }
                  );
                } else {
                  this.debugLog(
                    'FONT_LOADER',
                    'CriticalHit.loadLocalFont returned true but font style not found after delay',
                    {
                      fontName,
                      fontStyleId,
                    }
                  );
                }
              }, 100);
              this._retryTimeouts?.add(verifyTimeoutId);
              return true; // Return true optimistically - font should be loading
            }

            // Try alternative font name formats if first attempt fails
            const alternativeNames = [
              'Speedy Space Goat Oddity',
              'SpeedySpaceGoatOddity',
              'speedy space goat oddity',
            ];
            for (const altName of alternativeNames) {
              if (altName !== fontName && instance.loadLocalFont(altName)) {
                // Verify font was actually loaded
                const altStyleId = `cha-font-${altName.replace(/\s+/g, '-').toLowerCase()}`;
                if (document.getElementById(altStyleId) || document.getElementById(fontStyleId)) {
                  this.debugLog(
                    'FONT_LOADER',
                    'Font loaded via CriticalHit with alternative name',
                    {
                      originalName: fontName,
                      loadedName: altName,
                    }
                  );
                  return true;
                }
                // If not found immediately, return true optimistically
                return true;
              }
            }
          } else if (retryCount < maxRetries) {
            // CriticalHit plugin exists but loadLocalFont not ready yet - retry
            retryCount++;
            this.debugLog('FONT_LOADER', 'CriticalHit not ready, retrying...', {
              fontName,
              retryCount,
              maxRetries,
            });
            const retryTimeoutId = setTimeout(() => {
              this._retryTimeouts?.delete(retryTimeoutId);
              if (this._isStopped) return;
              attemptLoad();
            }, retryDelay);
            this._retryTimeouts?.add(retryTimeoutId);
            return false;
          }
        } else if (retryCount < maxRetries) {
          // CriticalHit plugin not found yet - retry
          retryCount++;
          this.debugLog('FONT_LOADER', 'CriticalHit plugin not found, retrying...', {
            fontName,
            retryCount,
            maxRetries,
          });
          const retryTimeoutId = setTimeout(() => {
            this._retryTimeouts?.delete(retryTimeoutId);
            if (this._isStopped) return;
            attemptLoad();
          }, retryDelay);
          this._retryTimeouts?.add(retryTimeoutId);
          return false;
        }
      } catch (error) {
        this.debugError('FONT_LOADER', 'Error loading font via CriticalHit', {
          fontName,
          error: error?.message,
          retryCount,
        });
      }
      return false;
    };

    const loaded = attemptLoad();
    if (loaded) {
      return true;
    }

    // Font not loaded yet - it may be loaded by CriticalHit later
    // CSS will use fallback font until then
    this.debugLog('FONT_LOADER', 'Font not yet loaded, will use fallback until available', {
      fontName,
      fontStyleId,
      retryCount,
      note: 'If CriticalHit plugin is enabled, it will load this font automatically. Font may load after CriticalHit initializes.',
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
        border: 2px solid #8a2be2;
        border-radius: 12px;
        padding: 20px 30px;
        text-align: center;
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.6);
      }

      .shadow-extraction-title {
        font-family: 'Speedy Space Goat Oddity', 'Orbitron', sans-serif !important;
        font-size: 32px;
        font-weight: 700;
        color: #9370db;
        text-shadow: 0 0 10px rgba(138, 43, 226, 0.8);
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
          text-shadow: 0 0 10px rgba(138, 43, 226, 0.8);
        }
        to {
          text-shadow: 0 0 20px rgba(138, 43, 226, 1), 0 0 30px rgba(138, 43, 226, 0.6);
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
        }', 'Orbitron', system-ui, sans-serif !important;
        font-weight: 700;
        font-size: 42px;
        line-height: 1.12;
        letter-spacing: 0.12em;
        text-transform: none; /* Preserve "ARiSe" casing */
        color: #ffffff;
        text-shadow:
          0 0 6px rgba(138, 43, 226, 0.9),
          0 0 14px rgba(138, 43, 226, 0.7),
          0 0 28px rgba(138, 43, 226, 0.5),
          0 0 42px rgba(75, 0, 130, 0.4);
        animation: sa-arise-glow 0.7s ease-in-out infinite alternate;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }

      .sa-arise-text .sa-small-s {
        font-size: 0.8em !important; /* Reduce S moderately */
        display: inline-block !important;
      }

      .sa-arise-text .sa-small-r {
        font-size: 0.72em !important; /* Make R much smaller */
        display: inline-block !important;
      }

      .sa-arise-text .sa-mid-i {
        font-size: 0.9em !important; /* Reduce i moderately */
        display: inline-block !important;
      }

      .sa-arise-text .sa-mid-e {
        font-size: 1em !important; /* Increase e a bit more */
        display: inline-block !important;
      }

      .sa-arise-meta {
        margin-top: calc(28px + (var(--sa-scale, 1) - 1) * 20px);
        font-family: 'Orbitron', system-ui, sans-serif;
        font-size: 16px;
        font-weight: 900;
        line-height: 1.25;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        background: linear-gradient(180deg, #d8b4fe 0%, #7e22ce 58%, #09060d 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        -webkit-text-fill-color: transparent;
        -webkit-text-stroke: 1px rgba(147, 51, 234, 0.9);
        text-shadow:
          0 0 4px rgba(147, 51, 234, 0.9),
          0 0 10px rgba(147, 51, 234, 0.65),
          0 0 18px rgba(45, 15, 65, 0.45);
      }

      .sa-arise-particle {
        position: absolute;
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: radial-gradient(circle, #9333ea 0%, rgba(75, 0, 130, 0) 70%);
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
            drop-shadow(0 0 8px rgba(138, 43, 226, 0.8))
            drop-shadow(0 0 16px rgba(75, 0, 130, 0.6));
        }
        to {
          filter:
            drop-shadow(0 0 14px rgba(138, 43, 226, 1))
            drop-shadow(0 0 30px rgba(147, 51, 234, 0.8));
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
        background: #1e1e2e;
        border-radius: 8px;
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
        border-top: 1px solid rgba(138, 43, 226, 0.4);
        padding-top: 6px;
      }

      .shadow-list-item {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 4px 0;
        border-bottom: 1px solid rgba(138, 43, 226, 0.15);
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
      PermissionStore: null,
      Permissions: null,
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
      const byProps = BdApi.Webpack.Filters?.byProps;
      const storeQueries = byProps
        ? [
            ['UserStore', byProps('getCurrentUser', 'getUser')],
            ['ChannelStore', byProps('getChannel', 'getChannelId')],
          ]
        : [
            ['UserStore', (m) => m && typeof m.getCurrentUser === 'function'],
            ['ChannelStore', (m) => m && typeof m.getChannel === 'function'],
          ];

      storeQueries.forEach(([key, filter]) => {
        this.webpackModules[key] = BdApi.Webpack.getModule(filter);
      });

      const { UserStore, ChannelStore } = this.webpackModules;
      this.webpackModuleAccess = Boolean(UserStore && ChannelStore);

      this.debugLog('ARISE_ANIMATION', 'Webpack module access initialized', {
        hasUserStore: Boolean(UserStore),
        hasChannelStore: Boolean(ChannelStore),
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
            const containerRefTimeoutId = setTimeout(() => {
              pluginInstance._retryTimeouts?.delete(containerRefTimeoutId);
              if (pluginInstance._isStopped) return;
              const domContainer = document.querySelector('.sa-animation-container');
              if (domContainer) {
                pluginInstance.animationContainer = domContainer;
                pluginInstance.debugLog(
                  'ARISE_ANIMATION',
                  'Animation container injected successfully'
                );
              }
            }, 100);
            pluginInstance._retryTimeouts?.add(containerRefTimeoutId);
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
      const reactFallbackTimeoutId = setTimeout(() => {
        this._retryTimeouts?.delete(reactFallbackTimeoutId);
        if (this._isStopped) return;
        if (!this.animationContainer) {
          // React injection failed, use DOM fallback
          this.createContainerDOM();
        }
      }, 200);
      this._retryTimeouts?.add(reactFallbackTimeoutId);
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
    const fontName = ariseSettings.animationFont || 'Speedy Space Goat Oddity';

    // Ensure font is loaded before creating animation
    if (!document.getElementById(`cha-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`)) {
      // Font not loaded yet - try to load it now
      this.loadAriseAnimationFont();
    }

    // Debug: Verify font is loaded before creating animation
    if (this.debug.enabled && document.fonts && document.fonts.check) {
      const fontLoaded = document.fonts.check(`16px '${fontName}'`);
      this.debugLog('ARISE_ANIMATION', 'Font verification check', {
        fontName,
        fontLoaded,
        note: fontLoaded
          ? 'Font is loaded and ready'
          : 'Font may not be loaded - will use fallback',
      });
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'sa-arise-wrapper';
    wrapper.style.setProperty('--sa-duration', `${durationMs}ms`);
    const scale = ariseSettings.scale || 1;
    wrapper.style.setProperty('--sa-scale', String(scale));

    const title = document.createElement('div');
    title.className = 'sa-arise-text';
    // Apply font directly as inline style (guarantees correct font even if CSS hasn't loaded yet)
    title.style.fontFamily = `'${fontName}', 'Orbitron', system-ui, sans-serif`;
    // Text should be "ARiSe" with much smaller R and moderately smaller i/S/e
    title.innerHTML =
      'A<span class="sa-small-r">R</span><span class="sa-mid-i">i</span><span class="sa-small-s">S</span><span class="sa-mid-e">e</span>';
    wrapper.appendChild(title);

    // Debug: Log animation trigger with font info
    this.debugLog('ARISE_ANIMATION', 'Triggering ARISE animation', {
      shadowRank: shadow?.rank,
      shadowRole: shadow?.roleName || shadow?.role,
      fontName,
      duration: durationMs,
      scale,
      showRankAndRole: ariseSettings.showRankAndRole,
    });

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

    // Debug: Verify font is actually applied after element is in DOM
    if (this.debug.enabled) {
      // Wait for element to be rendered, then check computed font
      const fontVerifyTimeoutId = setTimeout(() => {
        this._retryTimeouts?.delete(fontVerifyTimeoutId);
        if (this._isStopped) return;
        const computedStyle = window.getComputedStyle(title);
        const appliedFont = computedStyle.fontFamily;
        const fontLoaded = document.fonts?.check(`16px '${fontName}'`);

        this.debugLog('ARISE_ANIMATION', 'Font verification after render', {
          fontName,
          appliedFontFamily: appliedFont,
          fontLoaded,
          matchesExpected: appliedFont.includes(fontName),
          note: appliedFont.includes(fontName)
            ? 'Font is correctly applied to ARISE animation'
            : `Font may not be applied - using fallback. Expected: '${fontName}', Got: ${appliedFont}`,
        });
      }, 100);
      this._retryTimeouts?.add(fontVerifyTimeoutId);
    }

    const wrapperRemoveId = setTimeout(() => {
      this._retryTimeouts?.delete(wrapperRemoveId);
      wrapper.remove();
    }, durationMs + 200);
    this._retryTimeouts?.add(wrapperRemoveId);
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

  // ============================================================================
  // 3.15 HYBRID COMPRESSION SYSTEM - Top 100 Full, Rest Compressed
  // ============================================================================

  normalizePersonalityValue(value) {
    return normalizeShadowPersonalityValue(value);
  }

  derivePersonalityFromRole(role) {
    return deriveShadowPersonalityFromRole(role);
  }

  getShadowPersonalityKey(shadow) {
    if (!shadow || typeof shadow !== 'object') return '';

    // Prefer storage manager normalization when available (single source of truth).
    if (this.storageManager?.getNormalizedPersonalityKey) {
      return this.storageManager.getNormalizedPersonalityKey(shadow);
    }

    const explicitKey = this.normalizePersonalityValue(shadow.personalityKey || shadow.pk);
    if (explicitKey) return explicitKey;

    const explicitPersonality = this.normalizePersonalityValue(shadow.personality);
    if (explicitPersonality) return explicitPersonality;

    return this.derivePersonalityFromRole(shadow.role || shadow.ro || '');
  }

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
      i: shadow.id, // Full original ID preserved
      r: shadow.rank,
      ro: shadow.role,
      pk: this.getShadowPersonalityKey(shadow),
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
      ol: shadow.ownerLevelAtExtraction || 1,

      // IDB index fields — full-name properties so compressed shadows
      // remain visible to IndexedDB secondary indexes (rank, role, etc.)
      rank: shadow.rank,
      role: shadow.role,
      level: shadow.level || 1,
      strength: shadow.strength || 0,
      extractedAt: shadow.extractedAt,
    };
  }

  /**
   * Ultra-compress shadow data (95% memory reduction)
   * Used for shadows beyond top 1,000 (cold data)
   *
   * Format: { _c: 2, i, r, ro, pk, p, l, e, s, gt, nt, vs, ol }
   * - i: Full original shadow ID
   * - r: Rank, ro: Role, pk: PersonalityKey
   * - p: Power (strength / 10), l: Level
   * - e: Days since epoch, s: Total stats / 100
   * - gt: Total growthStats sum, nt: Total naturalGrowthStats sum
   * - vs: growthVarianceSeed, ol: ownerLevelAtExtraction
   */
  compressShadowUltra(shadow) {
    // Guard clause: Return null if no shadow or no ID
    if (!shadow || !shadow.id) return null;

    // Get effective stats for accurate compression
    const effectiveStats = this.getShadowEffectiveStats(shadow);
    // Use reduce for functional pattern to calculate total stats
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const totalStats = statKeys.reduce((sum, stat) => sum + (effectiveStats[stat] || 0), 0);

    // Preserve growth totals as scaled sums (prevents permanent data loss)
    const growthStatKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const totalGrowth = growthStatKeys.reduce(
      (sum, stat) => sum + (shadow.growthStats?.[stat] || 0),
      0
    );
    const totalNatGrowth = growthStatKeys.reduce(
      (sum, stat) => sum + (shadow.naturalGrowthStats?.[stat] || 0),
      0
    );

    return {
      _c: 2, // Ultra-compression marker
      i: shadow.id, // Full original ID preserved
      r: shadow.rank || 'E',
      ro: shadow.role || 'unknown', // Preserve role for personality derivation
      pk: this.getShadowPersonalityKey(shadow),
      p: Math.round((shadow.strength || 0) / 10), // Power (÷10 for less rounding loss)
      l: shadow.level || 1,
      e: Math.floor((shadow.extractedAt || Date.now()) / 86400000), // Days since epoch
      s: Math.floor(totalStats / 100), // Total stats (scaled)
      gt: Math.round(totalGrowth), // Total growth stats sum (preserved)
      nt: Math.round(totalNatGrowth), // Total natural growth stats sum (preserved)
      vs: Math.round((shadow.growthVarianceSeed || Math.random()) * 100) / 100, // Variance seed
      ol: shadow.ownerLevelAtExtraction || 1,

      // IDB index fields — full-name properties so ultra-compressed shadows
      // remain visible to IndexedDB secondary indexes (rank, role, etc.)
      rank: shadow.rank || 'E',
      role: shadow.role || 'unknown',
      level: shadow.level || 1,
      strength: shadow.strength || 0,
      extractedAt: shadow.extractedAt || Date.now(),
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
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];

    // Reconstruct growth totals from preserved sums (distribute evenly across stats)
    const totalGrowth = compressed.gt || 0;
    const totalNatGrowth = compressed.nt || 0;
    const perStatGrowth = Math.floor(totalGrowth / 5);
    const perStatNatGrowth = Math.floor(totalNatGrowth / 5);

    // Base stats = total stats scaled back minus growth contributions
    const totalEffective = compressed.s * 100;
    const perStatBase = Math.max(0, Math.floor((totalEffective - totalGrowth - totalNatGrowth) / 5));

    const baseStats = statKeys.reduce((stats, stat) => {
      stats[stat] = perStatBase;
      return stats;
    }, {});

    const growthStats = statKeys.reduce((stats, stat) => {
      stats[stat] = perStatGrowth;
      return stats;
    }, {});

    const naturalGrowthStats = statKeys.reduce((stats, stat) => {
      stats[stat] = perStatNatGrowth;
      return stats;
    }, {});

    const role = compressed.ro || 'unknown';
    return {
      id: compressed.i, // Preserved original ID
      rank: compressed.r,
      role,
      roleName: this.shadowRoles?.[role]?.name || role,
      personalityKey: this.normalizePersonalityValue(compressed.pk),
      personality: this.normalizePersonalityValue(compressed.pk),
      level: compressed.l,
      xp: 0, // Not stored
      strength: compressed.p * 10, // Reconstruct power (÷10 scale)
      baseStats,
      growthStats,
      naturalGrowthStats,
      totalCombatTime: 0, // Not stored in ultra
      extractedAt: compressed.e * 86400000, // Reconstruct timestamp
      growthVarianceSeed: compressed.vs || Math.random(), // Preserved since v3.4; re-randomize for legacy
      ownerLevelAtExtraction: compressed.ol || 1,
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
      id: compressed.i, // Preserved original ID
      rank: compressed.r,
      role: compressed.ro,
      roleName: this.shadowRoles[compressed.ro]?.name || compressed.ro,
      personalityKey:
        this.normalizePersonalityValue(compressed.pk) ||
        this.derivePersonalityFromRole(compressed.ro),
      personality:
        this.normalizePersonalityValue(compressed.pk) ||
        this.derivePersonalityFromRole(compressed.ro),
      level: compressed.l,
      xp: compressed.x,
      baseStats,
      growthStats,
      naturalGrowthStats,
      totalCombatTime: compressed.c,
      extractedAt: compressed.e,
      growthVarianceSeed: compressed.s || Math.random(), // Re-randomize if legacy 0
      ownerLevelAtExtraction: compressed.ol || 1,
      lastNaturalGrowth: compressed.e,
      strength: 0, // Will be calculated
      _compressed: true, // Mark as decompressed
    };
  }

  _invalidateShadowStateCaches(oldShadow) {
    if (!oldShadow) return;

    this.storageManager?.invalidateCache?.(oldShadow);
    this.invalidateShadowPowerCache(oldShadow);

    const oldId = this.getCacheKey(oldShadow);
    const oldI = oldShadow.i;
    if (!this._shadowPersonalityCache) return;
    oldId && this._shadowPersonalityCache.delete(`personality_${oldId}`);
    oldI && oldI !== oldId && this._shadowPersonalityCache.delete(`personality_${oldI}`);
  }

  async _deleteShadowsByIds(shadowIds, scope = 'ESSENCE') {
    if (!Array.isArray(shadowIds) || shadowIds.length === 0) return true;
    if (!this.storageManager?.deleteShadowsBatch) return false;

    try {
      await this.storageManager.deleteShadowsBatch(shadowIds);
      this.clearShadowPowerCache();
      this._invalidateSnapshot(); // Shadows deleted — snapshot stale
      return true;
    } catch (error) {
      this.debugError(scope, 'Batch delete error', error);
      return false;
    }
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

      // Get all shadows via getAll() fast path
      let allShadows = [];
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, Infinity);
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
            this._invalidateShadowStateCaches(oldShadow);
          }
          return ultraCompressedShadow;
        })
        .filter((shadow) => shadow !== null && this.getCacheKey(shadow));

      let coldUpdated = 0;
      if (coldToUpdate.length > 0 && this.storageManager?.updateShadowsBatch) {
        try {
          coldUpdated = await this.storageManager.updateShadowsBatch(coldToUpdate);
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
            this._invalidateShadowStateCaches(oldShadow);
          }

          return compressedShadow;
        })
        .filter((shadow) => shadow !== null && this.getCacheKey(shadow));

      let warmUpdated = 0;
      if (warmToCompress.length > 0 && this.storageManager?.updateShadowsBatch) {
        try {
          warmUpdated = await this.storageManager.updateShadowsBatch(warmToCompress);
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
            this._invalidateShadowStateCaches(oldShadow);
          }
          return decompressed;
        })
        .filter((shadow) => shadow !== null && this.getCacheKey(shadow));

      let elitesUpdated = 0;
      if (elitesToDecompress.length > 0 && this.storageManager?.updateShadowsBatch) {
        try {
          elitesUpdated = await this.storageManager.updateShadowsBatch(elitesToDecompress);
        } catch (error) {
          // debugError method is in SECTION 4
          this.debugError('COMPRESSION', 'Decompression: Batch update error', error);
        }
      }
      counters.decompressed = elitesUpdated;

      // Consolidated cache invalidation — once after all tiers, not per-tier
      // This prevents partial invalidation if one tier fails
      if (coldUpdated > 0 || warmUpdated > 0 || elitesUpdated > 0) {
        this.clearShadowPowerCache();
        this.settings.cachedTotalPowerShadowCount = 0; // Force recalculation
      }

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

      // Get all shadows via getAll() fast path
      let allShadows = [];
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, Infinity);
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
        .map(({ shadow }) => this.getCacheKey(shadow))
        .filter(Boolean);

      if (shadowIdsToDelete.length > 0) {
        await this._deleteShadowsByIds(shadowIdsToDelete, 'ESSENCE');
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
        BdApi.showToast(`Converted ${toConvert.length} weak shadows to ${totalEssence} essence.`, {
          type: 'info',
          timeout: 5000,
        });
      }

      // Update UI if modal is open
      if (this.shadowArmyModal && document.body.contains(this.shadowArmyModal)) {
        this.closeShadowArmyModal();
        const reopenUiTimeoutId = setTimeout(() => {
          this._retryTimeouts?.delete(reopenUiTimeoutId);
          if (this._isStopped) return;
          this.openShadowArmyUI();
        }, 100);
        this._retryTimeouts?.add(reopenUiTimeoutId);
      }
    } catch (error) {
      // debugError method is in SECTION 4
      this.debugError('ESSENCE', 'Error processing conversion', error);
    }
  }

  /**
   * Cached React component getter for Essence Conversion Modal.
   * Returns a functional component rendered via React.createElement.
   */
  get _EssenceConversionModal() {
    if (this.__EssenceConversionModalCached) return this.__EssenceConversionModalCached;
    const pluginRef = this;
    const React = BdApi.React;
    const { useState, useEffect, useCallback } = React;
    const ce = React.createElement;

    const RANKS = ['E','D','C','B','A','S','SS','SSS','SSS+','NH','Monarch','Monarch+','Shadow Monarch'];

    const EssenceConversionModal = ({ onClose }) => {
      const config = pluginRef.settings.shadowEssence || pluginRef.defaultSettings.shadowEssence;
      const [rank, setRank] = useState('E');
      const [quantity, setQuantity] = useState(1);
      const [currentEssence, setCurrentEssence] = useState(config.essence || 0);
      const [converting, setConverting] = useState(false);
      const [result, setResult] = useState(null);

      // Escape key + overlay click close
      useEffect(() => {
        const handleKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
      }, [onClose]);

      // Preview calculation
      const essencePerShadow = config.essencePerShadow?.[rank] || 1;
      const totalEssence = essencePerShadow * (quantity || 0);

      const handleConvert = useCallback(async () => {
        if (!quantity || quantity <= 0) {
          setResult({ success: false, error: 'Please enter a valid quantity' });
          return;
        }
        setConverting(true);
        setResult({ success: false, error: null, message: 'Converting shadows...' });
        try {
          const convResult = await pluginRef.convertShadowsToEssence(rank, quantity);
          if (convResult.success) {
            const newConfig = pluginRef.settings.shadowEssence || pluginRef.defaultSettings.shadowEssence;
            setCurrentEssence(newConfig.essence || 0);
            setResult({
              success: true,
              message: `Successfully converted ${convResult.converted} shadow${convResult.converted !== 1 ? 's' : ''} to ${convResult.totalEssence.toLocaleString()} essence! New total: ${convResult.newTotal.toLocaleString()} essence`,
            });
            // Auto-close after 2 seconds and refresh army modal if open
            const closeId = setTimeout(() => {
              pluginRef._retryTimeouts?.delete(closeId);
              if (pluginRef._isStopped) return;
              onClose();
              if (pluginRef.shadowArmyModal && document.body.contains(pluginRef.shadowArmyModal)) {
                pluginRef.closeShadowArmyModal();
                const reopenId = setTimeout(() => {
                  pluginRef._retryTimeouts?.delete(reopenId);
                  if (pluginRef._isStopped) return;
                  pluginRef.openShadowArmyUI();
                }, 100);
                pluginRef._retryTimeouts?.add(reopenId);
              }
            }, 2000);
            pluginRef._retryTimeouts?.add(closeId);
          } else {
            setResult({ success: false, error: pluginRef.escapeHtml(convResult.error || 'Failed to convert shadows') });
            setConverting(false);
          }
        } catch (error) {
          setResult({ success: false, error: pluginRef.escapeHtml(error.message) });
          setConverting(false);
        }
      }, [rank, quantity, onClose]);

      // Overlay click
      const handleOverlayClick = useCallback((e) => {
        if (e.target === e.currentTarget) onClose();
      }, [onClose]);

      return ce('div', {
        id: 'shadow-essence-convert-modal',
        onClick: handleOverlayClick,
        style: {
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      },
        ce('div', {
          style: {
            background: '#2f3136', borderRadius: '8px', padding: '24px',
            minWidth: '400px', maxWidth: '500px',
            border: '1px solid rgba(138, 43, 226, 0.5)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          },
        },
          // Title
          ce('h2', { style: { color: '#8a2be2', margin: '0 0 16px 0', fontSize: '20px' } }, 'Convert Shadows to Essence'),
          // Current essence info
          ce('div', { style: { marginBottom: '16px', padding: '12px', background: 'rgba(138, 43, 226, 0.1)', borderRadius: '4px', fontSize: '12px' } },
            ce('div', { style: { color: '#9370db', fontWeight: 'bold', marginBottom: '4px' } }, `Current Essence: ${currentEssence.toLocaleString()}`),
            ce('div', { style: { opacity: 0.8 } }, 'Select rank and quantity of shadows to convert')
          ),
          // Rank select
          ce('label', { style: { display: 'block', marginBottom: '12px' } },
            ce('span', { style: { display: 'block', marginBottom: '6px', color: '#dcddde', fontSize: '13px', fontWeight: '600' } }, 'Rank:'),
            ce('select', {
              value: rank,
              onChange: (e) => setRank(e.target.value),
              style: { width: '100%', padding: '8px', background: '#202225', border: '1px solid rgba(138, 43, 226, 0.3)', borderRadius: '4px', color: '#dcddde', fontSize: '13px' },
            }, RANKS.map((r) => ce('option', { key: r, value: r }, r)))
          ),
          // Quantity input
          ce('label', { style: { display: 'block', marginBottom: '16px' } },
            ce('span', { style: { display: 'block', marginBottom: '6px', color: '#dcddde', fontSize: '13px', fontWeight: '600' } }, 'Quantity:'),
            ce('input', {
              type: 'number', min: 1, value: quantity,
              onChange: (e) => setQuantity(parseInt(e.target.value) || 0),
              style: { width: '100%', padding: '8px', background: '#202225', border: '1px solid rgba(138, 43, 226, 0.3)', borderRadius: '4px', color: '#dcddde', fontSize: '13px' },
            })
          ),
          // Preview (show when quantity > 0)
          quantity > 0 ? ce('div', { style: { marginBottom: '16px', padding: '12px', background: 'rgba(138, 43, 226, 0.1)', borderRadius: '4px', fontSize: '12px', color: '#9370db' } },
            ce('div', { style: { fontWeight: 'bold', marginBottom: '4px' } }, 'Preview:'),
            ce('div', null,
              ce('span', null, `Converting `),
              ce('strong', null, quantity),
              ce('span', null, ` ${rank}-rank shadow${quantity !== 1 ? 's' : ''}`),
              ce('br'),
              ce('span', null, 'Essence per shadow: '),
              ce('strong', null, essencePerShadow),
              ce('br'),
              ce('span', null, 'Total essence: '),
              ce('strong', null, totalEssence.toLocaleString())
            )
          ) : null,
          // Buttons
          ce('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
            ce('button', {
              onClick: onClose,
              style: { padding: '8px 16px', background: '#4f545c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
            }, 'Cancel'),
            ce('button', {
              onClick: handleConvert,
              disabled: converting,
              style: { padding: '8px 16px', background: '#8a2be2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
            }, converting ? 'Converting...' : 'Convert')
          ),
          // Result
          result ? ce('div', { style: { marginTop: '12px', fontSize: '12px' } },
            result.message && !result.error ? ce('span', { style: { color: result.success ? '#34d399' : '#9370db' } }, result.message) : null,
            result.error ? ce('span', { style: { color: '#ef4444' } }, `Error: ${result.error}`) : null
          ) : null
        )
      );
    };

    this.__EssenceConversionModalCached = EssenceConversionModal;
    return EssenceConversionModal;
  }

  /**
   * Show manual essence conversion modal (React 18 createRoot)
   * Allows user to select rank and quantity of shadows to convert
   */
  showEssenceConversionModal() {
    // Remove existing modal if present
    if (this._essenceConversionRoot) {
      try { this._essenceConversionRoot.unmount(); } catch (_) {}
      this._essenceConversionRoot = null;
    }
    document.getElementById('shadow-essence-convert-modal-root')?.remove();

    const container = document.createElement('div');
    container.id = 'shadow-essence-convert-modal-root';
    container.style.display = 'contents';
    document.body.appendChild(container);

    const createRoot = this._getCreateRoot();
    if (!createRoot) {
      // Fallback: remove container if createRoot unavailable
      container.remove();
      this.debugError('UI', 'createRoot not available for essence conversion modal');
      return;
    }

    const root = createRoot(container);
    this._essenceConversionRoot = root;

    const onClose = () => {
      if (this._essenceConversionRoot) {
        try { this._essenceConversionRoot.unmount(); } catch (_) {}
        this._essenceConversionRoot = null;
      }
      document.getElementById('shadow-essence-convert-modal-root')?.remove();
    };

    const React = BdApi.React;
    root.render(React.createElement(this._EssenceConversionModal, { onClose }));
  }

  /**
   * Manually convert shadows to essence by rank and quantity
   * @param {string} rank - Rank of shadows to convert
   * @param {number} quantity - Number of shadows to convert
   * @returns {Promise<Object>} Conversion result
   */
  async convertShadowsToEssence(rank, quantity) {
    try {
      const config = this.settings.shadowEssence || this.defaultSettings.shadowEssence;

      // Get all shadows
      let allShadows = [];
      if (this.storageManager) {
        try {
          allShadows = await this.storageManager.getShadows({}, 0, Infinity);
        } catch (error) {
          this.debugError('ESSENCE', 'Error getting shadows', error);
          return { success: false, error: 'Failed to load shadows' };
        }
      } else {
        allShadows = this.settings.shadows || [];
      }

      // Filter shadows by rank
      const shadowsOfRank = allShadows.filter((s) => (s.rank || 'E') === rank);

      if (shadowsOfRank.length === 0) {
        return { success: false, error: `No ${rank}-rank shadows found` };
      }

      if (shadowsOfRank.length < quantity) {
        return {
          success: false,
          error: `Only ${shadowsOfRank.length} ${rank}-rank shadow${
            shadowsOfRank.length !== 1 ? 's' : ''
          } available (requested ${quantity})`,
        };
      }

      // Guard clause: Don't convert if would go below minimum
      const remaining = allShadows.length - quantity;
      if (remaining < (config.minShadowsToKeep || 20)) {
        return {
          success: false,
          error: `Cannot convert: Would drop below minimum of ${
            config.minShadowsToKeep || 20
          } shadows`,
        };
      }

      // Calculate power for shadows of this rank to select weakest ones
      const shadowsWithPower = this.processShadowsWithPower(shadowsOfRank, true).map(
        ({ shadow, decompressed, power }) => ({
          shadow: decompressed,
          power,
        })
      );

      // Sort by power (weakest first)
      shadowsWithPower.sort((a, b) => a.power - b.power);

      // Select weakest X shadows
      const toConvert = shadowsWithPower.slice(0, quantity);

      // Delete shadows
      const shadowIdsToDelete = toConvert
        .map(({ shadow }) => this.getCacheKey(shadow))
        .filter(Boolean);

      if (shadowIdsToDelete.length > 0 && this.storageManager?.deleteShadowsBatch) {
        const deleted = await this._deleteShadowsByIds(shadowIdsToDelete, 'ESSENCE');
        if (!deleted) {
          return { success: false, error: 'Failed to delete shadows' };
        }
      } else if (shadowIdsToDelete.length > 0) {
        // Fallback: delete individually
        for (const id of shadowIdsToDelete) {
          try {
            if (this.storageManager?.deleteShadow) {
              await this.storageManager.deleteShadow(id);
              this._invalidateSnapshot(); // Individual shadow deleted — snapshot stale
            } else {
              // Remove from localStorage
              this.settings.shadows = (this.settings.shadows || []).filter(
                (s) => (s.id || s.i) !== id
              );
            }
          } catch (error) {
            this.debugError('ESSENCE', `Error deleting shadow ${id}`, error);
          }
        }
        this.saveSettings();
      }

      // Calculate essence
      const essencePerShadow = config.essencePerShadow[rank] || 1;
      const totalEssence = essencePerShadow * quantity;

      // Update essence total
      if (!this.settings.shadowEssence) {
        this.settings.shadowEssence = { ...config };
      }
      const oldEssence = this.settings.shadowEssence.essence || 0;
      this.settings.shadowEssence.essence = oldEssence + totalEssence;
      this.settings.shadowEssence.lastConversionTime = Date.now();
      this.saveSettings();

      // Invalidate caches
      this.cachedBuffs = null;
      this.cachedBuffsTime = null;

      // Show notification
      if (BdApi.showToast) {
        BdApi.showToast(
          `Converted ${quantity} ${rank}-rank shadow${
            quantity !== 1 ? 's' : ''
          } to ${totalEssence.toLocaleString()} essence!`,
          {
            type: 'info',
            timeout: 5000,
          }
        );
      }

      return {
        success: true,
        converted: quantity,
        totalEssence,
        newTotal: this.settings.shadowEssence.essence,
      };
    } catch (error) {
      this.debugError('ESSENCE', 'Error in manual conversion', error);
      return { success: false, error: error.message };
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

    const decompressors = {
      1: this.decompressShadow,
      2: this.decompressShadowUltra,
    };

    const decompressor = decompressors[shadow._c];
    return typeof decompressor === 'function' ? decompressor.call(this, shadow) : shadow;
  }

  /**
   * Prepare shadow for saving to IndexedDB
   * Removes compression markers and ensures clean save
   * Compression system will re-compress weak shadows on next hourly run
   */
  prepareShadowForSave(shadow) {
    if (!shadow) return null;

    // If already stored in compressed form, keep it as-is (compression pipeline expects _c objects)
    if (shadow._c === 1 || shadow._c === 2) {
      const personalityKey = this.getShadowPersonalityKey(shadow);
      if (shadow.pk === personalityKey) {
        return shadow;
      }
      return {
        ...shadow,
        pk: personalityKey,
      };
    }

    // Avoid `delete` in hot paths (can degrade object shape performance in V8).
    // Omit UI-only decompression markers via destructuring instead.
    const {
      _compressed: _ignoredCompressed,
      _ultraCompressed: _ignoredUltra,
      ...shadowToSave
    } = shadow;

    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const defaultStats = statKeys.reduce((stats, key) => {
      stats[key] = 0;
      return stats;
    }, {});

    shadowToSave.baseStats = shadowToSave.baseStats || { ...defaultStats };
    shadowToSave.growthStats = shadowToSave.growthStats || { ...defaultStats };
    shadowToSave.naturalGrowthStats = shadowToSave.naturalGrowthStats || { ...defaultStats };
    shadowToSave.personalityKey = this.getShadowPersonalityKey(shadowToSave);
    if (!shadowToSave.personality && shadowToSave.personalityKey) {
      shadowToSave.personality = shadowToSave.personalityKey;
    }

    // Ensure strength is populated before saving (helps widgets/aggregation and avoids 0-power saves)
    if (
      (!shadowToSave.strength || shadowToSave.strength === 0) &&
      typeof this.calculateShadowPower === 'function'
    ) {
      const decompressed = this.getShadowData ? this.getShadowData(shadowToSave) : shadowToSave;
      const effective =
        typeof this.getShadowEffectiveStats === 'function'
          ? this.getShadowEffectiveStats(decompressed)
          : null;

      if (effective) {
        shadowToSave.strength = this.calculateShadowPower(effective, 1);
      } else if (decompressed?.baseStats) {
        shadowToSave.strength = this.calculateShadowPower(decompressed.baseStats, 1);
      }
    }

    return shadowToSave;
  }

  // ============================================================================
  // 3.14 UI METHODS - Chat Button & Modal (Disabled Features)
  // ============================================================================

  /**
   * Inject CSS for shadow rank widget (using BdApi.DOM for persistence)
   */
  injectWidgetCSS() {
    // RE-ENABLED: Widget CSS needed for member list display
    const cssContent = `
      #shadow-army-widget {
        background: linear-gradient(135deg, rgba(20, 10, 30, 0.95), rgba(10, 10, 20, 0.95)) !important;
        border: 1px solid rgba(138, 43, 226, 0.4) !important;
        border-radius: 8px !important;
        padding: 12px !important;
        margin: 8px !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 20px rgba(138, 43, 226, 0.15) !important;
        cursor: pointer !important;
        transition: all 0.3s ease !important;
      }

      #shadow-army-widget:hover {
        border-color: rgba(138, 43, 226, 0.6) !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 24px rgba(138, 43, 226, 0.25) !important;
      }

      #shadow-army-widget .widget-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        margin-bottom: 8px !important;
      }

      #shadow-army-widget .widget-title {
        color: #8a2be2 !important;
        font-size: 12px !important;
        font-weight: bold !important;
        text-shadow: 0 0 8px rgba(138, 43, 226, 0.8) !important;
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
        border-top: 1px solid rgba(138, 43, 226, 0.2) !important;
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
    if (this._isStopped) return;
    if (!this.canInjectWidgetInCurrentView()) {
      this.removeShadowRankWidget();
      return;
    }

    // If widget already exists and is valid, just force-update the React tree
    const existingWidget = document.getElementById('shadow-army-widget');
    if (existingWidget && this.isWidgetInValidMemberList(existingWidget)) {
      this._widgetForceUpdate?.();
      return;
    }
    // Stale widget — clean up before reinserting
    existingWidget && this.removeShadowRankWidget();

    const memberElements = this.getMemberListElements();
    const membersList = memberElements?.membersList || null;
    if (!membersList) return;

    try {
      // Spacer div to push widget below the channel header
      const spacer = document.createElement('div');
      spacer.id = 'shadow-army-widget-spacer';
      spacer.style.cssText = 'height: 16px; flex-shrink: 0;';

      const widget = document.createElement('div');
      widget.id = 'shadow-army-widget';
      widget.addEventListener('click', () => this.openShadowArmyUI());

      // Insert spacer + widget at top of member list
      const membersContent = memberElements?.membersContent || null;
      if (membersContent?.firstChild) {
        membersContent.insertBefore(widget, membersContent.firstChild);
        membersContent.insertBefore(spacer, widget);
      } else if (membersList.firstChild) {
        membersList.insertBefore(widget, membersList.firstChild);
        membersList.insertBefore(spacer, widget);
      } else {
        membersList.appendChild(spacer);
        membersList.appendChild(widget);
      }

      // Mount React component into widget container
      const createRoot = this._getCreateRoot();
      if (createRoot) {
        const root = createRoot(widget);
        this._widgetReactRoot = root;
        const { ShadowArmyWidget } = this._widgetComponents;
        root.render(BdApi.React.createElement(ShadowArmyWidget));
        this.debugLog('WIDGET', 'Widget mounted (React)');
      } else {
        this.debugError('WIDGET', 'createRoot unavailable — widget will not render');
      }
    } catch (error) {
      this.debugError('WIDGET', 'Error injecting shadow rank widget', error);
    }
  }

  /**
   * Update shadow rank widget content — triggers React forceUpdate
   */
  updateShadowRankWidget() {
    if (this._isStopped) return;
    if (!document.getElementById('shadow-army-widget')) return;
    if (!this.canInjectWidgetInCurrentView()) {
      this.removeShadowRankWidget();
      return;
    }
    this._widgetForceUpdate?.();
  }

  /**
   * Remove shadow rank widget (React unmount + DOM removal)
   */
  removeShadowRankWidget() {
    if (this._widgetReactRoot) {
      this._widgetReactRoot.unmount();
      this._widgetReactRoot = null;
    }
    this._widgetForceUpdate = null;
    const spacer = document.getElementById('shadow-army-widget-spacer');
    if (spacer) spacer.remove();
    const widget = document.getElementById('shadow-army-widget');
    if (widget) widget.remove();
    this.removeWidgetCSS();
  }

  /**
   * Resolve React 18 createRoot across BdApi versions and Webpack exports.
   * Returns a bound createRoot function, or null when unavailable.
   */
  _getCreateRoot() {
    if (_ReactUtils?.getCreateRoot) return _ReactUtils.getCreateRoot();
    // Minimal inline fallback
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  }

  /**
   * Format combat time dynamically (seconds, minutes, or hours)
   * Internal calculations stay in hours, display adapts to magnitude
   */
  formatCombatHours(hours) {
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

    // Shadow Monarch excluded — player's exclusive title, not a shadow rank
    const ranks = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SSS+', 'NH', 'Monarch', 'Monarch+'];
    const rankColors = {
      E: '#999',
      D: '#a0a0a0',
      C: '#22c55e',
      B: '#3b82f6',
      A: '#8a2be2',
      S: '#f59e0b',
      SS: '#ef4444',
      SSS: '#ec4899',
      'SSS+': '#f50057',
      NH: '#e040fb',
      Monarch: '#ff4500',
      'Monarch+': '#ff6b2b',
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

  computeShadowArmyUiData(shadows) {
    const safeShadows = Array.isArray(shadows) ? shadows : [];

    // Calculate generals (top 7 strongest)
    const withPower = safeShadows.map((shadow) => {
      const power = this.calculateShadowPowerCached(shadow);
      const shadowId = this.getCacheKey(shadow);
      return { shadow, power, id: shadowId };
    });
    const sortedByPower = [...withPower].sort((a, b) => (b.power || 0) - (a.power || 0));
    const generals = sortedByPower.slice(0, 7).map((x) => x.shadow);

    // Calculate total army power
    const totalArmyPower = withPower.reduce((sum, { power }) => sum + (power || 0), 0);

    // Calculate role/class distribution with average stats
    const statKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    const roleStats = safeShadows.reduce((stats, shadow) => {
      const role = shadow?.role || shadow?.roleName || 'Unknown';
      if (!stats[role]) {
        stats[role] = {
          count: 0,
          totalStats: statKeys.reduce((acc, key) => {
            acc[key] = 0;
            return acc;
          }, {}),
          totalLevel: 0,
          isMagicBeast: this.shadowRoles?.[role]?.isMagicBeast || false,
        };
      }

      stats[role].count++;
      const effective = this.getShadowEffectiveStats(shadow);
      statKeys.reduce((totalStats, key) => {
        totalStats[key] += effective?.[key] || 0;
        return totalStats;
      }, stats[role].totalStats);
      stats[role].totalLevel += shadow?.level || 1;
      return stats;
    }, {});

    const roleStatsWithAverages = Object.entries(roleStats).reduce((acc, [role, data]) => {
      const count = data.count || 1;
      acc[role] = {
        ...data,
        avgStats: statKeys.reduce((avgStats, key) => {
          avgStats[key] = Math.floor((data.totalStats?.[key] || 0) / count);
          return avgStats;
        }, {}),
        avgLevel: Math.floor((data.totalLevel || 0) / count),
      };
      acc[role].avgPower = Math.floor(
        statKeys.reduce((sum, key) => sum + (acc[role].avgStats?.[key] || 0), 0) / statKeys.length
      );
      return acc;
    }, {});

    // Sort roles by count (descending)
    const sortedRoles = Object.entries(roleStatsWithAverages).sort(
      (a, b) => (b?.[1]?.count || 0) - (a?.[1]?.count || 0)
    );

    return { generals, totalArmyPower, sortedRoles };
  }

  getShadowArmyGeneralCardHtml(shadow, index) {
    const safeShadow = shadow || {};
    const generalRank = (index || 0) + 1;
    // Sanitize ID: extract only the last valid shadow ID segment if corrupted/concatenated
    const rawId = String(safeShadow.id || safeShadow.i || '');
    const shadowId = rawId.length > 40 ? rawId.slice(-30) : rawId;
    const shortId = rawId.slice(-8);

    const effectiveStats = this.getShadowEffectiveStats(safeShadow);
    // Force numeric level — IDB data may have string-concatenated values
    const level = Number.isFinite(safeShadow.level) ? safeShadow.level : (parseInt(safeShadow.level, 10) || 1);

    const totalPower =
      typeof this.calculateShadowStrength === 'function'
        ? this.calculateShadowStrength(effectiveStats, level)
        : typeof this.calculateShadowPower === 'function'
        ? this.calculateShadowPower(effectiveStats, 1)
        : 0;

    // Force numeric xp
    const xp = Number.isFinite(safeShadow.xp) ? safeShadow.xp : (parseInt(safeShadow.xp, 10) || 0);
    const xpNeeded = this.getShadowXpForNextLevel(level, safeShadow.rank);
    const xpProgress =
      xpNeeded > 0 ? Math.max(0, Math.min(100, (xp / xpNeeded) * 100)) : 0;

    const combatTime = this.formatCombatHours(safeShadow.totalCombatTime || 0);

    const role = safeShadow.role || safeShadow.roleName || 'Unknown';
    const isMagicBeast = this.shadowRoles?.[role]?.isMagicBeast || false;
    const roleColor = isMagicBeast ? '#f59e0b' : '#fff';

    return `
                  <div class="sa-general-card" data-shadow-id="${shortId}" style="
                    background: rgba(251, 191, 36, 0.15);
                    border: 2px solid #fbbf24;
                    border-radius: 8px;
                    padding: 14px;
                    margin-bottom: 12px;
                    box-shadow: 0 0 15px rgba(251, 191, 36, 0.3);
                    overflow: hidden;
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
                        flex-shrink: 0;
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
                      ">
                        <div style="font-size: 10px;">#${generalRank}</div>
                      </div>

                      <div style="flex: 1; min-width: 0; overflow: hidden;">
                        <!-- Header -->
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
                          <span style="color: #8a2be2; font-weight: bold; font-size: 14px; flex-shrink: 0;">[${
                            safeShadow.rank || 'E'
                          }]</span>
                          <span style="color: ${roleColor}; font-size: 14px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${role}</span>
                          <span style="color: #34d399; margin-left: auto; font-size: 14px; font-weight: bold; flex-shrink: 0;">${Math.floor(
                            totalPower || 0
                          ).toLocaleString()}</span>
                        </div>

                        <!-- Level & XP Bar -->
                        <div style="margin-bottom: 8px;">
                          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #999; margin-bottom: 2px;">
                            <span>Level ${level}</span>
                            <span>${xp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP</span>
                          </div>
                          <div style="background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="background: linear-gradient(90deg, #fbbf24, #f59e0b); width: ${xpProgress}%; height: 100%; transition: width 0.3s;"></div>
                          </div>
                        </div>

                        <!-- Stats Grid -->
                        <div style="background: rgba(0, 0, 0, 0.3); border-radius: 6px; padding: 8px; margin-bottom: 8px;">
                          <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;">
                            <div style="text-align: center;">
                              <div style="color: #ef4444; font-size: 9px; font-weight: 600; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">STR</div>
                              <div style="color: #fff; font-size: 16px; font-weight: bold; line-height: 1.2;">${(
                                effectiveStats.strength || 0
                              ).toLocaleString()}</div>
                            </div>
                            <div style="text-align: center;">
                              <div style="color: #22c55e; font-size: 9px; font-weight: 600; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">AGI</div>
                              <div style="color: #fff; font-size: 16px; font-weight: bold; line-height: 1.2;">${(
                                effectiveStats.agility || 0
                              ).toLocaleString()}</div>
                            </div>
                            <div style="text-align: center;">
                              <div style="color: #3b82f6; font-size: 9px; font-weight: 600; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">INT</div>
                              <div style="color: #fff; font-size: 16px; font-weight: bold; line-height: 1.2;">${(
                                effectiveStats.intelligence || 0
                              ).toLocaleString()}</div>
                            </div>
                            <div style="text-align: center;">
                              <div style="color: #a855f7; font-size: 9px; font-weight: 600; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">VIT</div>
                              <div style="color: #fff; font-size: 16px; font-weight: bold; line-height: 1.2;">${(
                                effectiveStats.vitality || 0
                              ).toLocaleString()}</div>
                            </div>
                            <div style="text-align: center;">
                              <div style="color: #fbbf24; font-size: 9px; font-weight: 600; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">PER</div>
                              <div style="color: #fff; font-size: 16px; font-weight: bold; line-height: 1.2;">${(
                                effectiveStats.perception || 0
                              ).toLocaleString()}</div>
                            </div>
                          </div>
                        </div>

                        <!-- Combat Info -->
                        <div style="display: flex; gap: 12px; font-size: 11px;">
                          <div style="color: #34d399;">${combatTime} Combat</div>
                          <div style="color: #8a2be2;">Level ${level}</div>
                          <div style="color: #fbbf24; margin-left: auto;">ID: ${shortId}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
  }

  getShadowArmyGeneralsHtml(generals) {
    const safeGenerals = Array.isArray(generals) ? generals : [];
    return safeGenerals
      .map((shadow, index) => this.getShadowArmyGeneralCardHtml(shadow, index))
      .join('');
  }

  /**
   * Cached React component getter for the Shadow Army Generals Modal.
   * Uses React.createElement (no JSX) with hooks for state & auto-refresh.
   */
  get _ShadowArmyModal() {
    if (this.__ShadowArmyModalCached) return this.__ShadowArmyModalCached;
    const pluginRef = this;
    const React = BdApi.React;
    const { useState, useEffect, useCallback, useRef } = React;
    const ce = React.createElement;

    const RANKS_SA = ['E','D','C','B','A','S','SS','SSS','SSS+','NH','Monarch','Monarch+'];
    const RANK_COLORS_SA = {
      E: '#999', D: '#a0a0a0', C: '#22c55e', B: '#3b82f6', A: '#8a2be2',
      S: '#f59e0b', SS: '#ef4444', SSS: '#ec4899', 'SSS+': '#f50057',
      NH: '#e040fb', Monarch: '#ff4500', 'Monarch+': '#ff6b2b',
    };

    // ---- Sub-component: Stat Card ----
    const StatCard = ({ value, label, color }) =>
      ce('div', { style: { textAlign: 'center' } },
        ce('div', { style: { color, fontSize: '20px', fontWeight: 'bold' } }, value),
        ce('div', { style: { color: '#999', fontSize: '11px' } }, label)
      );

    // ---- Sub-component: Rank Distribution Cell ----
    const RankCell = ({ rank, count, total }) => {
      const color = RANK_COLORS_SA[rank] || '#999';
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
      return ce('div', { style: { textAlign: 'center', padding: '6px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px', border: `1px solid ${color}40` } },
        ce('div', { style: { color, fontSize: '14px', fontWeight: 'bold' } }, rank),
        ce('div', { style: { color: '#fff', fontSize: '16px', fontWeight: 'bold', margin: '2px 0' } }, count),
        ce('div', { style: { color: '#888', fontSize: '9px' } }, `${pct}%`)
      );
    };

    // ---- Sub-component: Role Distribution Card ----
    const RoleCard = ({ role, data }) =>
      ce('div', { style: { background: 'rgba(138, 43, 226, 0.1)', borderRadius: '6px', padding: '8px' } },
        ce('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
          ce('span', { style: { color: data.isMagicBeast ? '#f59e0b' : '#8a2be2', fontSize: '12px', fontWeight: 'bold' } }, role),
          ce('span', { style: { color: '#34d399', fontSize: '11px', fontWeight: 'bold' } }, data.count)
        ),
        ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', fontSize: '9px', color: '#999' } },
          ce('div', null, 'Lvl: ', ce('span', { style: { color: '#34d399' } }, data.avgLevel)),
          ce('div', null, 'Pwr: ', ce('span', { style: { color: '#8a2be2' } }, data.avgPower)),
          ce('div', null, 'STR: ', ce('span', { style: { color: '#ef4444' } }, data.avgStats?.strength ?? 0))
        )
      );

    // ---- Sub-component: General Card ----
    const GeneralCard = ({ shadow, index }) => {
      const safeShadow = shadow || {};
      const generalRank = (index || 0) + 1;
      const rawId = String(safeShadow.id || safeShadow.i || '');
      const shortId = rawId.slice(-8);

      const effectiveStats = pluginRef.getShadowEffectiveStats(safeShadow);
      const level = Number.isFinite(safeShadow.level) ? safeShadow.level : (parseInt(safeShadow.level, 10) || 1);

      const totalPower =
        typeof pluginRef.calculateShadowStrength === 'function'
          ? pluginRef.calculateShadowStrength(effectiveStats, level)
          : typeof pluginRef.calculateShadowPower === 'function'
          ? pluginRef.calculateShadowPower(effectiveStats, 1)
          : 0;

      const xp = Number.isFinite(safeShadow.xp) ? safeShadow.xp : (parseInt(safeShadow.xp, 10) || 0);
      const xpNeeded = pluginRef.getShadowXpForNextLevel(level, safeShadow.rank);
      const xpProgress = xpNeeded > 0 ? Math.max(0, Math.min(100, (xp / xpNeeded) * 100)) : 0;
      const combatTime = pluginRef.formatCombatHours(safeShadow.totalCombatTime || 0);
      const role = safeShadow.role || safeShadow.roleName || 'Unknown';
      const isMagicBeast = pluginRef.shadowRoles?.[role]?.isMagicBeast || false;
      const roleColor = isMagicBeast ? '#f59e0b' : '#fff';

      const statEntries = [
        { label: 'STR', color: '#ef4444', value: effectiveStats.strength || 0 },
        { label: 'AGI', color: '#22c55e', value: effectiveStats.agility || 0 },
        { label: 'INT', color: '#3b82f6', value: effectiveStats.intelligence || 0 },
        { label: 'VIT', color: '#a855f7', value: effectiveStats.vitality || 0 },
        { label: 'PER', color: '#fbbf24', value: effectiveStats.perception || 0 },
      ];

      return ce('div', {
        className: 'sa-general-card',
        'data-shadow-id': shortId,
        style: {
          background: 'rgba(251, 191, 36, 0.15)', border: '2px solid #fbbf24',
          borderRadius: '8px', padding: '14px', marginBottom: '12px',
          boxShadow: '0 0 15px rgba(251, 191, 36, 0.3)', overflow: 'hidden',
        },
      },
        ce('div', { style: { display: 'flex', gap: '12px' } },
          // Rank badge
          ce('div', {
            style: {
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#000',
              fontSize: '20px', fontWeight: 'bold', padding: '8px', borderRadius: '8px',
              width: '48px', height: '48px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            },
          }, ce('div', { style: { fontSize: '10px' } }, `#${generalRank}`)),
          // Details
          ce('div', { style: { flex: 1, minWidth: 0, overflow: 'hidden' } },
            // Header
            ce('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' } },
              ce('span', { style: { color: '#8a2be2', fontWeight: 'bold', fontSize: '14px', flexShrink: 0 } }, `[${safeShadow.rank || 'E'}]`),
              ce('span', { style: { color: roleColor, fontSize: '14px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, role),
              ce('span', { style: { color: '#34d399', marginLeft: 'auto', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 } }, Math.floor(totalPower || 0).toLocaleString())
            ),
            // Level & XP bar
            ce('div', { style: { marginBottom: '8px' } },
              ce('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999', marginBottom: '2px' } },
                ce('span', null, `Level ${level}`),
                ce('span', null, `${xp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`)
              ),
              ce('div', { style: { background: 'rgba(0,0,0,0.3)', height: '6px', borderRadius: '3px', overflow: 'hidden' } },
                ce('div', { style: { background: 'linear-gradient(90deg, #fbbf24, #f59e0b)', width: `${xpProgress}%`, height: '100%', transition: 'width 0.3s' } })
              )
            ),
            // Stats grid
            ce('div', { style: { background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', padding: '8px', marginBottom: '8px' } },
              ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' } },
                statEntries.map((stat) =>
                  ce('div', { key: stat.label, style: { textAlign: 'center' } },
                    ce('div', { style: { color: stat.color, fontSize: '9px', fontWeight: '600', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' } }, stat.label),
                    ce('div', { style: { color: '#fff', fontSize: '16px', fontWeight: 'bold', lineHeight: '1.2' } }, (stat.value).toLocaleString())
                  )
                )
              )
            ),
            // Combat info
            ce('div', { style: { display: 'flex', gap: '12px', fontSize: '11px' } },
              ce('div', { style: { color: '#34d399' } }, `${combatTime} Combat`),
              ce('div', { style: { color: '#8a2be2' } }, `Level ${level}`),
              ce('div', { style: { color: '#fbbf24', marginLeft: 'auto' } }, `ID: ${shortId}`)
            )
          )
        )
      );
    };

    // ---- Main Modal Component ----
    const ShadowArmyModal = ({ initialShadows, onClose }) => {
      const [shadows, setShadows] = useState(initialShadows || []);
      const refreshInFlightRef = useRef(false);

      // Escape key handler
      useEffect(() => {
        const handleKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
      }, [onClose]);

      // Auto-refresh interval (replaces manual setInterval)
      useEffect(() => {
        const intervalId = setInterval(async () => {
          if (document.hidden) return;
          if (refreshInFlightRef.current) return;
          if (!pluginRef._widgetDirty) return;

          try {
            refreshInFlightRef.current = true;
            pluginRef._widgetDirty = false;
            if (pluginRef.storageManager?.getShadows) {
              const freshShadows = await pluginRef.storageManager.getShadows({}, 0, Infinity);
              if (freshShadows && freshShadows.length > 0) {
                setShadows(freshShadows.map((s) => pluginRef.getShadowData(s)));
              }
            }
          } catch (error) {
            pluginRef.debugError('UI', 'Error refreshing UI', error);
          } finally {
            refreshInFlightRef.current = false;
          }
        }, 15000);
        return () => clearInterval(intervalId);
      }, []);

      // Overlay click
      const handleOverlayClick = useCallback((e) => {
        if (e.target === e.currentTarget) onClose();
      }, [onClose]);

      // Empty state
      if (!shadows || shadows.length === 0) {
        return ce('div', {
          className: 'shadow-army-modal',
          onClick: handleOverlayClick,
          style: {
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0, 0, 0, 0.85)', zIndex: 10002,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(5px)',
          },
        },
          ce('div', { style: { width: '90%', maxWidth: '900px', background: '#1e1e2e', border: '2px solid #8a2be2', borderRadius: '12px', padding: '20px' } },
            ce('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
              ce('h2', { style: { color: '#8a2be2', margin: 0 } }, 'Shadow Army Command'),
              ce('button', { onClick: onClose, style: { background: 'transparent', border: 'none', color: '#999', fontSize: '24px', cursor: 'pointer', padding: 0, width: '30px', height: '30px' } }, '\u00d7')
            ),
            ce('div', { style: { textAlign: 'center', padding: '40px', color: '#999' } }, 'No shadows in army yet. Extract shadows from dungeons!')
          )
        );
      }

      // Compute derived data
      const compressionStats = shadows.reduce(
        (stats, shadow) => {
          if (shadow._compressed || shadow._ultraCompressed) { stats.compressed++; } else { stats.elite++; }
          return stats;
        },
        { compressed: 0, elite: 0 }
      );
      const { compressed: compressedCount, elite: eliteCount } = compressionStats;
      const { generals, totalArmyPower, sortedRoles } = pluginRef.computeShadowArmyUiData(shadows);
      const totalCombatTime = pluginRef.formatCombatHours(
        shadows.reduce((sum, shadow) => sum + (shadow.totalCombatTime || 0), 0)
      );
      const essenceTotal = (pluginRef.settings.shadowEssence?.essence || 0).toLocaleString();

      // Rank distribution data
      const rankCounts = shadows.reduce((counts, shadow) => {
        const r = shadow.rank || 'E';
        counts[r] = (counts[r] || 0) + 1;
        return counts;
      }, {});

      return ce('div', {
        className: 'shadow-army-modal',
        onClick: handleOverlayClick,
        style: {
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0, 0, 0, 0.85)', zIndex: 10002,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(5px)',
        },
      },
        ce('div', {
          style: {
            width: '90%', maxWidth: '900px', maxHeight: '80vh',
            background: '#1e1e2e', border: '2px solid #8a2be2', borderRadius: '12px',
            padding: '20px', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          },
        },
          // Header
          ce('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
            ce('h2', { style: { color: '#8a2be2', margin: 0 } }, 'Shadow Army Command'),
            ce('button', {
              onClick: onClose,
              style: { background: 'transparent', border: 'none', color: '#999', fontSize: '24px', cursor: 'pointer', padding: 0, width: '30px', height: '30px' },
            }, '\u00d7')
          ),

          // Army Overview
          ce('div', {
            style: {
              background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(168, 85, 247, 0.1))',
              border: '1px solid #8a2be2', borderRadius: '8px', padding: '12px', marginBottom: '16px',
            },
          },
            // 6-stat grid
            ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', marginBottom: '12px' } },
              ce(StatCard, { value: shadows.length, label: 'Total Shadows', color: '#8a2be2' }),
              ce(StatCard, { value: eliteCount, label: 'Elite Force', color: '#34d399' }),
              ce(StatCard, { value: compressedCount, label: 'Legion', color: '#64748b' }),
              ce(StatCard, { value: totalCombatTime, label: 'Total Combat', color: '#ef4444' }),
              ce(StatCard, { value: totalArmyPower.toLocaleString(), label: 'Total Power', color: '#fbbf24' }),
              ce(StatCard, { value: essenceTotal, label: 'Essence', color: '#9370db' })
            ),

            // Rank Distribution
            ce('div', { style: { background: 'rgba(20, 20, 40, 0.6)', border: '1px solid rgba(138, 43, 226, 0.3)', borderRadius: '8px', padding: '12px', marginBottom: '12px' } },
              ce('div', { style: { color: '#8a2be2', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' } }, 'Shadow Rank Distribution'),
              ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' } },
                RANKS_SA.map((rank) => ce(RankCell, { key: rank, rank, count: rankCounts[rank] || 0, total: shadows.length }))
              )
            ),

            // Role Distribution
            ce('div', { style: { background: 'rgba(20, 20, 40, 0.6)', border: '1px solid rgba(138, 43, 226, 0.3)', borderRadius: '8px', padding: '12px' } },
              ce('div', { style: { color: '#8a2be2', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' } }, 'Army Composition by Role/Class'),
              ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' } },
                sortedRoles.map(([role, data]) => ce(RoleCard, { key: role, role, data }))
              )
            )
          ),

          // Generals Section
          ce('div', { style: { marginBottom: '12px' } },
            ce('h3', { style: { color: '#fbbf24', fontSize: '16px', marginBottom: '12px', textAlign: 'center', textShadow: '0 0 10px rgba(251, 191, 36, 0.5)' } }, 'Shadow Generals')
          ),

          // Generals List
          ce('div', { style: { maxHeight: '35vh', overflowY: 'auto' } },
            generals.length === 0
              ? ce('div', { style: { textAlign: 'center', padding: '40px', color: '#999' } }, 'No shadows in army yet. Extract shadows from dungeons!')
              : generals.map((shadow, i) => ce(GeneralCard, { key: pluginRef.getCacheKey(shadow) || i, shadow, index: i }))
          )
        )
      );
    };

    this.__ShadowArmyModalCached = ShadowArmyModal;
    return ShadowArmyModal;
  }

  /**
   * Open Shadow Army Generals Modal (React 18 createRoot).
   * Renders the _ShadowArmyModal component into a portal container on document.body.
   */
  async openShadowArmyUI() {
    // Guard clause: Toggle modal if already open
    if (this._armyModalOpen) {
      this.closeShadowArmyModal();
      return;
    }
    this._armyModalOpen = true;

    try {
      // Get all shadows from IndexedDB or localStorage
      let shadows = [];
      if (this.storageManager?.getShadows) {
        try {
          shadows = await this.storageManager.getShadows({}, 0, Infinity);
        } catch (err) {
          this.debugError('UI', 'Could not get shadows from IndexedDB', err);
          shadows = this.settings.shadows || [];
        }
      } else {
        shadows = this.settings.shadows || [];
      }

      // Decompress for UI display
      shadows = shadows.map((s) => this.getShadowData(s));

      const container = document.createElement('div');
      container.id = 'shadow-army-modal-root';
      container.style.display = 'contents';
      document.body.appendChild(container);

      // Backward-compat: set shadowArmyModal for checks elsewhere in the codebase
      this.shadowArmyModal = container;

      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        container.remove();
        this._armyModalOpen = false;
        this.shadowArmyModal = null;
        this.debugError('UI', 'createRoot not available for shadow army modal');
        return;
      }

      const root = createRoot(container);
      this._armyModalRoot = root;

      const React = BdApi.React;
      root.render(React.createElement(this._ShadowArmyModal, {
        pluginInstance: this,
        initialShadows: shadows,
        onClose: () => this.closeShadowArmyModal(),
      }));
    } catch (error) {
      this.debugError('UI', 'Failed to open UI', error);
      this._armyModalOpen = false;
    }
  }

  /**
   * Close ShadowArmy UI modal (React 18 unmount).
   * Cleans up React root and DOM container to prevent memory leaks.
   */
  closeShadowArmyModal() {
    this._armyModalOpen = false;

    // Unmount React root
    if (this._armyModalRoot) {
      try { this._armyModalRoot.unmount(); } catch (_) {}
      this._armyModalRoot = null;
    }

    // Remove DOM container
    document.getElementById('shadow-army-modal-root')?.remove();

    // Clear backward-compat reference
    this.shadowArmyModal = null;

    // Cleanup: Remove any orphaned modals (lag protection)
    try {
      Array.from(document.querySelectorAll('.shadow-army-modal')).forEach((modal) => {
        if (modal?.parentNode) modal.parentNode.removeChild(modal);
      });
    } catch (error) {
      this.debugError('UI', 'Error during modal cleanup', error);
    }
  }

  // ============================================================================
  // 3.16 SETTINGS PANEL UI
  // ============================================================================

  escapeHtml(value) {
    const str = value === null || value === undefined ? '' : String(value);
    return str.replace(/[&<>"']/g, (ch) => {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return map[ch] || ch;
    });
  }

  detachShadowArmySettingsPanelHandlers() {
    const root = this._shadowArmySettingsPanelRoot;
    const handlers = this._shadowArmySettingsPanelHandlers;
    if (root && handlers) {
      try {
        root.removeEventListener('click', handlers.click);
        root.removeEventListener('change', handlers.change);
      } catch (error) {
        this.debugError('SETTINGS_PANEL', 'Error detaching settings panel handlers', error);
      }
    }
    this._shadowArmySettingsPanelRoot = null;
    this._shadowArmySettingsPanelHandlers = null;
  }

  /**
   * Generate settings panel HTML for BetterDiscord settings UI
   * Operations:
   * 1. Get total shadow count and generals count for stats
   * 2. Render storage diagnostic button
   * 3. Render debug mode toggle
   * 4. Return DOM container with delegated click/change handlers
   */
  getSettingsPanel() {
    // CRITICAL: BetterDiscord settings panels MUST be synchronous.
    // Keep UI rendering synchronous; async work happens inside delegated handlers.
    const shadowsForDisplay = this.settings.shadows || [];
    const localCacheCount = shadowsForDisplay.length;
    const cachedIndexedDbCount =
      typeof this.settings?.cachedTotalPowerShadowCount === 'number'
        ? this.settings.cachedTotalPowerShadowCount
        : null;

    // Compute strength and sort to determine generals count for stats display
    const shadowsWithPower =
      localCacheCount > 0
        ? shadowsForDisplay.map((shadow) => {
            const effective = this.getShadowEffectiveStats(shadow);
            const strength = this.calculateShadowStrength(effective, 1);
            return { shadow, strength };
          })
        : [];

    shadowsWithPower.sort((a, b) => b.strength - a.strength);

    const storageInfo = this.storageManager
      ? '<div style="color: #34d399; font-size: 11px; margin-top: 4px;">Primary storage: IndexedDB</div>'
      : '<div style="color: #facc15; font-size: 11px; margin-top: 4px;">Primary storage: localStorage</div>';

    const generalsCount = Math.min(7, shadowsWithPower.length);

    const indexedDbCountLabel =
      cachedIndexedDbCount === null
        ? 'Unknown (click diagnostic)'
        : cachedIndexedDbCount.toLocaleString();

    const html = `
      <div class="shadow-army-settings">
        <h2>Shadow Army</h2>
        ${storageInfo}

        <div class="shadow-army-stats">
          <div>Local cache (settings): ${localCacheCount.toLocaleString()}</div>
          <div>Cached IndexedDB count: ${indexedDbCountLabel}</div>
          <div>Total Extracted: ${(this.settings.totalShadowsExtracted || 0).toLocaleString()}</div>
          <div style="color: #8a2be2; font-weight: bold;">Generals: ${generalsCount} / 7 (Auto-selected strongest)</div>
          <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">Generals provide full buffs • Other shadows provide diminishing returns</div>
        </div>

        <div style="margin-top: 12px; padding: 8px; background: rgba(138, 43, 226, 0.1); border-radius: 4px;">
          <button type="button" data-sa-action="diagnostic" style="padding: 6px 12px; background: #8a2be2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
            Check Actual Storage (Diagnostic)
          </button>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">Click to check IndexedDB for actual shadow count</div>
          <div id="shadow-army-diagnostic-result" style="margin-top: 8px; font-size: 11px; color: #9370db;"></div>
        </div>

        <div class="shadow-army-config" style="margin-top: 16px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
            <input type="checkbox" id="sa-debug-mode" ${
              this.settings?.debugMode === true ? 'checked' : ''
            }>
            <span>Debug Mode (Console logs for font verification & animation)</span>
          </label>
          <div style="margin-top: 8px; padding: 8px; background: rgba(138, 43, 226, 0.1); border-radius: 4px; font-size: 11px; color: rgba(255, 255, 255, 0.7);">
            <strong style="color: #8a2be2;">Debug Mode:</strong> Enable to see detailed console logs for:
            <ul style="margin: 4px 0; padding-left: 20px;">
              <li>Font loading status (FONT_LOADER)</li>
              <li>Font verification when ARISE animation triggers</li>
              <li>Computed font-family after render</li>
              <li>Animation container creation</li>
              <li>Webpack/React injection status</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;

    // Ensure we don't keep old panels alive via stored references
    this.detachShadowArmySettingsPanelHandlers();

    const clickHandlers = {
      diagnostic: async () => {
        const resultDiv = container.querySelector('#shadow-army-diagnostic-result');
        if (!resultDiv) return;
        resultDiv.textContent = 'Checking storage...';

        try {
          const diagnostic =
            typeof this.diagnoseStorage === 'function' ? await this.diagnoseStorage() : null;
          if (!diagnostic) {
            resultDiv.textContent = 'Diagnostic not available.';
            return;
          }

          const safe = (v) => this.escapeHtml(v);
          const statusColor =
            diagnostic.counts.indexedDB > 0
              ? '#34d399'
              : diagnostic.errors.length > 0
              ? '#ef4444'
              : '#facc15';

          const errorHtml =
            diagnostic.errors.length > 0
              ? `<div style="margin-top: 8px; padding: 6px; background: rgba(239, 68, 68, 0.1); border-radius: 4px; font-size: 10px; color: #ef4444;">
                   <strong>Errors:</strong><br>
                   ${diagnostic.errors.map((e) => safe(`- ${e}`)).join('<br>')}
                 </div>`
              : '';

          const sampleHtml = diagnostic.sampleShadow
            ? `<div style="margin-top: 8px; padding: 6px; background: rgba(52, 211, 153, 0.1); border-radius: 4px; font-size: 10px;">
                 <strong>Sample Shadow Found:</strong><br>
                 ID: ${safe(diagnostic.sampleShadow.id)}<br>
                 Rank: ${safe(diagnostic.sampleShadow.rank)}, Role: ${safe(
                diagnostic.sampleShadow.role
              )}<br>
                 Strength: ${safe(diagnostic.sampleShadow.strength)}
               </div>`
            : '';

          const noteHtml =
            diagnostic.counts.indexedDB > 0 && diagnostic.counts.localStorage === 0
              ? `<div style="margin-top: 8px; padding: 6px; background: rgba(138, 43, 226, 0.2); border-radius: 4px; font-size: 10px; color: #9370db;">
                   <strong>Note:</strong> Shadows are in IndexedDB (${safe(
                     diagnostic.counts.indexedDB
                   )}) but not in local settings cache. IndexedDB is the primary storage.
                 </div>`
              : '';

          resultDiv.innerHTML = `
            <div style="background: rgba(138, 43, 226, 0.15); padding: 12px; border-radius: 4px; margin-top: 8px; border: 1px solid rgba(138, 43, 226, 0.3);">
              <div style="font-weight: bold; margin-bottom: 8px; color: #9370db;">Storage Diagnostic Results:</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                <div>Local cache:</div>
                <div style="font-weight: bold;">${safe(
                  diagnostic.counts.localStorage
                )} shadows</div>
                <div>IndexedDB:</div>
                <div style="font-weight: bold; color: ${statusColor};">${safe(
            diagnostic.counts.indexedDB
          )} shadows</div>
                <div>Storage Manager:</div>
                <div style="font-weight: bold;">${safe(
                  diagnostic.storageManager.exists ? 'Exists' : 'Missing'
                )}</div>
                <div>DB Initialized:</div>
                <div style="font-weight: bold;">${safe(
                  diagnostic.storageManager.initialized ? 'Yes' : 'No'
                )}</div>
                <div>DB Connection:</div>
                <div style="font-weight: bold;">${safe(
                  diagnostic.storageManager.dbOpen ? 'Open' : 'Closed'
                )}</div>
                <div>Database Name:</div>
                <div style="font-weight: bold; font-size: 10px;">${safe(
                  diagnostic.storageManager.dbName
                )}</div>
                <div>User ID:</div>
                <div style="font-weight: bold; font-size: 10px;">${safe(diagnostic.userId)}</div>
              </div>
              ${sampleHtml}
              ${errorHtml}
              ${noteHtml}
            </div>
          `;
        } catch (error) {
          resultDiv.textContent = `Error: ${error?.message || String(error)}`;
        }
      },
    };

    const clickHandler = (e) => {
      if (this._isStopped) return;
      const btn = e.target?.closest?.('[data-sa-action]');
      const action = btn?.getAttribute?.('data-sa-action');
      if (!action || !clickHandlers[action]) return;
      e.preventDefault?.();
      clickHandlers[action]();
    };

    const changeHandlers = {
      'sa-debug-mode': (target) => {
        this.settings.debugMode = !!target.checked;
        this.debug.enabled = !!target.checked;
        this.saveSettings();
      },
    };

    const changeHandler = (e) => {
      if (this._isStopped) return;
      const target = e?.target;
      const handler = target?.id ? changeHandlers[target.id] : null;
      if (!handler) return;
      handler(target);
    };

    container.addEventListener('click', clickHandler);
    container.addEventListener('change', changeHandler);

    this._shadowArmySettingsPanelRoot = container;
    this._shadowArmySettingsPanelHandlers = { click: clickHandler, change: changeHandler };

    return container;
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
      diagnostic.storageManager.dbName = this.storageManager?.dbName || 'unknown';
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
