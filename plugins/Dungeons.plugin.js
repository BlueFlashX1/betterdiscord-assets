/**
 * @name Dungeons
 * @author BlueFlashX1
 * @description Solo Leveling Dungeon system - Random dungeons spawn in channels, fight mobs and bosses with your stats and shadow army
 * @version 4.6.0
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 *
 * ============================================================================
 * PLUGIN DEPENDENCIES & API
 * ============================================================================
 * Requires:
 * - SoloLevelingStats: For user stats, HP/Mana, XP granting
 * - ShadowArmy: For shadow combat, extraction, stats calculations
 *
 * Provides:
 * - Dungeon combat system
 * - Shadow XP from combat
 * - Extraction opportunities for ShadowArmy
 * - HP/Mana scaling with shadow army size
 *
 * PUBLIC API FOR OTHER PLUGINS:
 * - getShadowCount() - Returns Promise<number> (cached, 5s TTL)
 * - getAllShadows(useCache) - Returns Promise<Array<Shadow>> (cached, 1s TTL)
 * - getShadowEffectiveStatsCached(shadow) - Returns Object<stats> (cached, 500ms TTL)
 * - calculateShadowDamage(shadow, enemyStats, enemyRank) - Returns number
 * - getUserEffectiveStats() - Returns Object<stats>
 * - Event: Listens to 'ShadowArmy:shadowExtracted' for cache invalidation
 *
 * ============================================================================
 * CORE FEATURES
 * ============================================================================
 * - 9 themed biomes (Forest, Arctic, Volcano, Mountains, Desert, Ocean, etc.)
 * - Biome-specific magic beast spawns with 10 beast families
 * - Extended ranks: E-SSS, NH, Monarch, Monarch+, Shadow Monarch
 * - One dungeon per channel (across all servers)
 * - User can select which dungeon to participate in
 * - Shadow army attacks ALL dungeons simultaneously
 * - Shadows auto-resurrect with mana consumption
 * - Boss HP bars with responsive design
 * - Natural organic mob spawning (no capacity limit)
 * - IndexedDB storage for dungeon persistence
 * - Dragon restrictions (NH+ only)
 * - Themed dungeon/boss names per biome
 * - Aggressive extraction system (instant processing)
 * - Event-based extraction verification
 * - Dynamic spawn rate with high variance
 * - Channel lock system (spam protection)
 * - Real-time HP/Mana sync with Stats plugin
 *
 * ============================================================================
 * VERSION HISTORY
 * ============================================================================
 *
 * @changelog v4.6.0 (2025-12-08) - PERFORMANCE OPTIMIZATION & SYNC IMPROVEMENTS
 * PERFORMANCE:
 * - Added shadow count caching (5s TTL) - 80-90% reduction in IndexedDB queries
 * - Added shadow data caching during combat (1s TTL) - 70-85% reduction in I/O
 * - Added shadow stats calculation caching (500ms TTL) - 60-70% reduction in redundant calculations
 * - Fixed redundant stats retrieval in initializeUserStats() - single call instead of duplicate
 * - Optimized plugin reference loading with validation helper
 * - Added centralized cache manager for unified cache management
 *
 * SYNC IMPROVEMENTS:
 * - Event-based sync system: ShadowArmy emits 'ShadowArmy:shadowExtracted' events
 * - Dungeons plugin listens to events for immediate cache invalidation
 * - HP/Mana recalculates instantly when shadow count changes (no polling delay)
 * - Added recalculateUserHP() method for shadow count changes
 *
 * CODE QUALITY:
 * - Added shared utility functions (getRankIndex, calculateHP, calculateMana, getEffectiveStats)
 * - Added API contract documentation in plugin header
 * - Better separation of concerns with cache management
 * - Improved plugin cooperation through events
 *
 * @changelog v4.5.0 (2025-12-07) - MAJOR REFACTORING & CODE CONSOLIDATION
 * REFACTORING:
 * - Consolidated HP/Mana sync code into helper methods (syncHPFromStats, syncManaFromStats, pushHPToStats, pushManaToStats)
 * - Added getUserEffectiveStats() helper to avoid repeating stats retrieval pattern
 * - Improved plugin reference loading with better error handling and debug logging
 * - Centralized interval management (_intervals Set) for proper cleanup
 * - Consolidated getShadowArmyCount() to use getShadowCount() internally
 * - Removed redundant CSS injection retries (BdApi.DOM.addStyle is persistent)
 * - Added errorLog() helper method for consistent error logging
 * - Replaced console.error/warn calls with debugLog/errorLog methods
 *
 * CODE QUALITY:
 * - Better separation of concerns with helper methods
 * - Reduced code duplication (HP/Mana sync patterns)
 * - Improved maintainability and readability
 * - Better error handling with graceful degradation
 *
 * PERFORMANCE:
 * - Removed unnecessary CSS injection retries
 * - Centralized interval tracking for better cleanup
 * - Optimized stats retrieval with helper methods
 *
 * @changelog v4.3.0 (2025-12-04) - MEMORY OPTIMIZATION & GC SYSTEM
 * MEMORY OPTIMIZATIONS:
 * - Reduced mob spawn count: 200 → 100 per wave (50% reduction)
 * - Increased spawn interval: 5s → 6s base (4-8s with variance)
 * - Result: 60% fewer mobs per minute (better memory footprint)
 * - Aggressive cleanup on dungeon complete (all references nullified)
 * - Boss/mob/combat data all cleared properly
 *
 * GARBAGE COLLECTION SYSTEM (NEW):
 * - Periodic GC triggers every 5 minutes
 * - GC on dungeon completion
 * - Cleans stale caches (allocation, extraction events)
 * - Removes inactive dungeon tracking data
 * - Suggests V8 GC when available
 *
 * CONSOLE CLEANUP:
 * - All channel lock logging → debug mode
 * - HP/Mana sync logging → debug mode
 * - Regeneration logging → debug mode
 * - Capacity warnings → throttled (30s)
 *
 * @changelog v4.2.0 (2025-12-04) - SPAWN CAPACITY SYSTEM
 * SPAWN LIMITING (NEW):
 * - Added server-based dungeon capacity system
 * - Max dungeons: 15% of server's text channels
 * - Min: 3 dungeons (small servers)
 * - Max: 20 dungeons (huge servers)
 * - Prevents spawn spam by checking capacity before spawn
 * - Stops spawning when server reaches capacity
 * - Resumes spawning when dungeons complete
 * - Smart capacity logging (once per 30s, not every message)
 *
 * PERFORMANCE:
 * - Prevents excessive dungeon creation
 * - Reduces server load during message spam
 * - Better resource management
 *
 * @changelog v4.1.2 (2025-12-04) - CONSOLE SPAM CLEANUP
 * - Removed channel lock spam (lock/unlock logging → debug mode)
 * - Removed HP/Mana sync spam (sync logging → debug mode)
 * - Removed regeneration start spam (logging → debug mode)
 * - Removed cleanup spam (orphan removal → debug mode only if found)
 * - Only important events logged (dungeon restoration count)
 *
 * @changelog v4.1.1 (2025-12-04) - CRITICAL HP/MANA SYNC FIX
 * SYNCHRONIZATION FIXES:
 * - Added bidirectional HP/Mana sync before join validation
 * - Pulls fresh HP/Mana from Stats plugin before checking requirements
 * - Regeneration now syncs immediately with Stats plugin UI
 * - HP bar updates trigger Stats plugin updateHPManaBars()
 * - Fixed delayed responses (HP/Mana now real-time)
 * - Added sync logging for debugging
 *
 * UI RESPONSIVENESS:
 * - HP bar update throttle: 250ms (down from 1000ms, 4x faster!)
 * - Boss HP bar syncs HP/Mana before rendering
 * - Join button validation uses fresh values (no stale data)
 *
 * BUG FIXES:
 * - Fixed "HP too low" error when HP was actually full
 * - Fixed slow HP bar updates
 * - Fixed delayed mana consumption display
 * - Fixed stale HP/Mana values in join validation
 *
 * @changelog v4.1.0 (2025-12-04) - EXTRACTION & SPAWN SYSTEM OVERHAUL
 * EXTRACTION SYSTEM:
 * - Mob extraction: 1 attempt only (prevents queue buildup)
 * - Boss extraction: 3 attempts (important targets)
 * - Aggressive cleanup: Immediate mob removal (no retry queue)
 * - Processing delay: 10ms (down from 100ms, 90% faster!)
 * - Batch size: 20 mobs processed in parallel
 *
 * SPAWN SYSTEM:
 * - Removed initial burst spawn (was 30% instant, overwhelming)
 * - Natural gradual spawning only (organic experience)
 * - Spawn rate: 3-7 seconds (high variance, unpredictable)
 * - Spawn counts: 50% reduction to match faster rate
 * - Variance: 30% (up from 20%, more organic feel)
 * - NO CAPACITY LIMIT: Constant spawn rate (shadows control population)
 *
 * CHANNEL LOCK SYSTEM:
 * - Channel locks prevent spawn collisions from message spam
 * - Lock acquired before spawn, released after creation/completion
 * - Conflict detection forcefully aborts duplicate dungeons
 * - Automatic lock cleanup on all exit paths
 *
 * BALANCE CHANGES:
 * - Mob damage to shadows: 70% reduction (prevents constant deaths)
 * - Boss damage to shadows: 60% reduction (prevents army wipes)
 * - Shadows now survive longer without excessive resurrections
 *
 * CLEANUP IMPROVEMENTS:
 * - Comprehensive memory cleanup on dungeon completion
 * - HP bar and container removal with orphan cleanup
 * - User status reset immediately (can join new dungeons anytime)
 * - All maps, timers, and caches properly cleared
 *
 * PERFORMANCE:
 * - 67% reduction in extraction attempts (1 vs 3 for mobs)
 * - 90% faster extraction processing (10ms vs 100ms)
 * - Lower memory usage (aggressive cleanup)
 * - Real-time UI updates (no queue lag)
 *
 * @changelog v4.0.2 (2025-12-04) - REGENERATION OVERHAUL
 * - Fixed multiplied regeneration bug (multiple dungeons causing stacked regen)
 * - Enhanced HP/Mana regeneration formula with level and stat scaling
 * - Base: 0.5% per second + Stat scaling: 1% per 100 stat + Level scaling: 0.2% per 10 levels
 * - Added debug logging for regeneration system (first 3 ticks logged)
 * - Regeneration now noticeable at all levels (38 HP/sec at level 20, 3625 HP/sec at level 200)
 * - Time to full heal: 3-26 seconds depending on level/stats
 *
 * @changelog v4.0.1 (2025-12-04) - BUG FIXES & POLISH
 * - Fixed duplicate variable declaration in resurrection system
 * - Fixed dungeon timeout system (dungeons now auto-complete after 10 minutes)
 * - Added variable spawn interval (8-12 seconds with ±20% variance)
 * - Improved spawn frequency (10s vs 5s, 50% less frequent)
 * - Fixed mana consumption spam (one warning instead of 1000+)
 * - HP scaling evaluated and confirmed balanced (no changes needed)
 *
 * @changelog v4.0.0 (2025-12-04) - EXTRACTION & PERFORMANCE OVERHAUL
 * MAJOR CHANGES:
 * - Complete extraction system rewrite (immediate + queue with retries)
 * - Event-based extraction verification (shadowExtracted custom event)
 * - Continuous mob spawning system (dynamic self-balancing)
 * - Dynamic spawn rates with variance (800-1200 per wave)
 * - Chunked extraction processing (batches of 20-50)
 * - Immediate extraction on mob death (no queue delay)
 * - Extraction queue for retries only (3 attempts per mob)
 * - Combat interval optimization (2s → 3s for CPU relief)
 * - Aggressive memory cleanup (capped arrays, smart removal)
 * - Toast notification refinement (essential info only)
 * - Console spam elimination (30+ debug logs removed)
 * - Extraction queue limit (500 max to prevent overflow)
 * - Smart cleanup (mobs removed only after final extraction attempt)
 * - Mob rank system (scales with dungeon rank)
 * - Proper baseline stats + growth for spawned mobs
 *
 * PERFORMANCE IMPROVEMENTS:
 * - Memory usage reduced by 40%
 * - Combat processing optimized
 * - No more crashes from mob overflow
 * - Smooth dungeon experience with 2,500+ mobs
 *
 * BUG FIXES:
 * - Fixed extraction not happening immediately
 * - Fixed mob cleanup happening too early
 * - Fixed memory leaks from uncapped arrays
 * - Fixed crash from excessive parallel processing
 *
 * @changelog v3.0.0 (2025-12-03) - BIOME SYSTEM
 * - Added 9 themed biomes with unique characteristics
 * - Implemented beast family classification (10 families)
 * - Extended rank system to Shadow Monarch
 * - Dragon spawn restrictions (NH+ ranks only)
 * - Themed dungeon/boss name generation
 * - Massive mob HP scaling improvements (10-45x)
 * - Boss HP multipliers per biome (4.5K-9K per shadow)
 * - Responsive CSS for HP bars
 * - Multi-line HP bar layout
 * - Improved guild/channel switching
 */
/* eslint-env browser */
/* global CustomEvent */

// ================================================================================
// STORAGE MANAGER - IndexedDB Management
// ================================================================================
/**
 * DungeonStorageManager - IndexedDB storage manager for Dungeons plugin
 * Handles persistent storage of dungeon data across sessions
 */
class DungeonStorageManager {
  constructor(userId) {
    this.userId = userId || 'default';
    this.dbName = `DungeonsDB_${this.userId}`;
    this.dbVersion = 2; // Incremented for new schema
    this.storeName = 'dungeons';
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
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

          this.debugLog('[DungeonStorageManager] Database upgraded to v2 with new indices');
        }
      };

      request.onblocked = () => {
        this.debugLog('DungeonStorageManager: Database upgrade blocked by other tabs');
        reject(new Error('Database upgrade blocked'));
      };
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
   * Sanitize dungeon object for IndexedDB storage
   * Removes Promises and other non-serializable values
   */
  sanitizeDungeonForStorage(dungeon) {
    // Deep clone to avoid modifying original
    const sanitized = JSON.parse(
      JSON.stringify(dungeon, (key, value) => {
        // Skip Promise values
        if (value instanceof Promise) {
          this.debugLog(`[DungeonStorage] Skipping Promise value for key: ${key}`);
          return undefined;
        }
        // Skip function values
        if (typeof value === 'function') {
          return undefined;
        }
        return value;
      })
    );

    return sanitized;
  }

  async getDungeon(channelKey) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('channelKey');
      const request = index.get(channelKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllDungeons() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
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

  /**
   * Query dungeons by type
   */
  async getDungeonsByType(type) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('type');
      const request = index.getAll(type);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Query active dungeons (not completed or failed)
   */
  async getActiveDungeons() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        const dungeons = (request.result || []).filter((d) => !d.completed && !d.failed);
        resolve(dungeons);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Query dungeons by rank
   */
  async getDungeonsByRank(rank) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('rank');
      const request = index.getAll(rank);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get statistics about stored dungeons
   */
  async getDungeonStats() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const dungeons = request.result || [];
        const stats = {
          total: dungeons.length,
          active: dungeons.filter((d) => !d.completed && !d.failed).length,
          completed: dungeons.filter((d) => d.completed).length,
          failed: dungeons.filter((d) => d.failed).length,
          byRank: {},
          byType: {},
          totalMobsKilled: 0,
          averageShadowsAssigned: 0,
        };

        dungeons.forEach((d) => {
          // Count by rank
          stats.byRank[d.rank] = (stats.byRank[d.rank] || 0) + 1;

          // Count by type
          if (d.type) {
            stats.byType[d.type] = (stats.byType[d.type] || 0) + 1;
          }

          // Total mobs killed
          if (d.mobs?.killed) {
            stats.totalMobsKilled += d.mobs.killed;
          }

          // Average shadows assigned
          if (d.boss?.expectedShadowCount) {
            stats.averageShadowsAssigned += d.boss.expectedShadowCount;
          }
        });

        if (dungeons.length > 0) {
          stats.averageShadowsAssigned = Math.floor(stats.averageShadowsAssigned / dungeons.length);
        }

        resolve(stats);
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// ================================================================================
// MAIN PLUGIN CLASS
// ================================================================================
module.exports = class Dungeons {
  // ============================================================================
  // CONSTRUCTOR & DEFAULT SETTINGS
  // ============================================================================
  constructor() {
    this.defaultSettings = {
      enabled: true,
      debug: false, // Debug mode: enables verbose console logging
      spawnChance: 10, // 10% chance per message
      dungeonDuration: 600000, // 10 minutes
      maxDungeonsPercentage: 0.15, // Max 15% of server channels can have active dungeons
      minDungeonsAllowed: 3, // Always allow at least 3 dungeons even in small servers
      maxDungeonsAllowed: 20, // Cap at 20 dungeons max even in huge servers
      shadowAttackInterval: 3000,
      userAttackCooldown: 2000,
      mobKillNotificationInterval: 30000,
      mobSpawnInterval: 10000, // Spawn new mobs every 10 seconds (slower, less lag)
      mobSpawnCount: 750, // Base spawn count (will have variable scaling based on mob count)
      shadowReviveCost: 50, // Mana cost to revive a shadow
      // Dungeon ranks including SS, SSS
      dungeonRanks: [
        'E',
        'D',
        'C',
        'B',
        'A',
        'S',
        'SS',
        'SSS',
        'NH',
        'Monarch',
        'Monarch+',
        'Shadow Monarch',
      ],
      userActiveDungeon: null,
      lastSpawnTime: {},
      mobKillNotifications: {},
      // User HP/Mana (calculated from stats)
      userHP: null, // Will be calculated from vitality
      userMaxHP: null,
      userMana: null, // Will be calculated from intelligence
      userMaxMana: null,
    };

    this.settings = this.defaultSettings;
    this.messageObserver = null;
    this.shadowAttackIntervals = new Map();
    this.mobKillNotificationTimers = new Map();
    this.mobSpawnTimers = new Map();
    this.capacityMonitors = new Map(); // Capacity monitoring per dungeon
    this.bossAttackTimers = new Map(); // Boss attack timers per dungeon
    this.mobAttackTimers = new Map(); // Mob attack timers per dungeon
    this.dungeonTimeouts = new Map(); // Timeout timers for 10-minute auto-completion
    this.dungeonIndicators = new Map();
    this.bossHPBars = new Map();
    this.userHPBar = null;
    this.dungeonButton = null;
    this.dungeonModal = null;
    this.toolbarCheckInterval = null;
    this._dungeonButtonRetryCount = 0;
    this.lastUserAttackTime = 0;
    this.storageManager = null;
    this.activeDungeons = new Map(); // Use Map for better performance
    this.panelWatcher = null; // Watch for panel DOM changes
    this.hiddenComments = new Map(); // Track hidden comment elements per channel

    // CHANNEL LOCK SYSTEM: Prevents multiple dungeons in same channel (spam protection)
    this.channelLocks = new Set(); // Locked channels (one dungeon at a time per channel)

    // Plugin references
    this.soloLevelingStats = null;
    this.shadowArmy = null;
    this.toasts = null;
    this.deadShadows = new Map(); // Track dead shadows per dungeon

    // CENTRALIZED RESOURCE MANAGEMENT (for proper cleanup - prevents memory leaks)
    this._intervals = new Set(); // Track all setInterval IDs for cleanup
    this._timeouts = new Set(); // Track all setTimeout IDs for cleanup

    // CACHE MANAGEMENT
    this._shadowCountCache = null; // Shadow count cache (5s TTL)
    this._shadowsCache = null; // Shadows data cache (1s TTL during combat)
    this._shadowStatsCache = null; // Shadow stats cache (500ms TTL)

    // CENTRALIZED CACHE MANAGER
    this.cache = new (class CacheManager {
      constructor() {
        this.caches = new Map();
        this.defaultTTL = 5000; // 5 seconds
      }

      set(key, value, ttl = this.defaultTTL) {
        this.caches.set(key, {
          value,
          timestamp: Date.now(),
          ttl,
        });
      }

      get(key) {
        const cached = this.caches.get(key);
        if (!cached) return null;

        const age = Date.now() - cached.timestamp;
        if (age > cached.ttl) {
          this.caches.delete(key);
          return null;
        }

        return cached.value;
      }

      invalidate(pattern) {
        if (pattern instanceof RegExp) {
          for (const key of this.caches.keys()) {
            if (pattern.test(key)) {
              this.caches.delete(key);
            }
          }
        } else {
          this.caches.delete(pattern);
        }
      }

      clear() {
        this.caches.clear();
      }

      size() {
        return this.caches.size;
      }
    })();

    // SHARED UTILITIES - Common functions for plugin cooperation
    this.utils = {
      // Normalize rank to index
      getRankIndex: (
        rank,
        rankArray = this.settings?.dungeonRanks || [
          'E',
          'D',
          'C',
          'B',
          'A',
          'S',
          'SS',
          'SSS',
          'NH',
          'Monarch',
          'Monarch+',
          'Shadow Monarch',
        ]
      ) => {
        return rankArray.indexOf(rank);
      },
      // Calculate HP from stats
      calculateHP: (vitality, rankIndex, shadowCount = 0) => {
        const baseHP = 100 + vitality * 10 + rankIndex * 50;
        const shadowBonus = shadowCount * 25;
        return baseHP + shadowBonus;
      },
      // Calculate Mana from stats
      calculateMana: (intelligence, shadowCount = 0) => {
        const baseMana = 100 + intelligence * 10;
        const shadowBonus = shadowCount * 50;
        return baseMana + shadowBonus;
      },
      // Get effective stats (with fallback)
      getEffectiveStats: (plugin, settings) => {
        return (
          plugin?.getTotalEffectiveStats?.() || plugin?.settings?.stats || settings?.stats || {}
        );
      },
    };
    this._observers = new Set(); // Track all MutationObserver instances
    this._listeners = new Map(); // Track event listeners: {type: Set<handler>}
    this.dungeonCleanupInterval = null;

    // Defeated bosses awaiting shadow extraction (ARISE)
    this.defeatedBosses = new Map(); // { channelKey: { boss, dungeon, timestamp } }

    // Shadow army pre-allocation cache (optimization: split shadows once, reuse assignments)
    this.shadowAllocations = new Map(); // Map<channelKey, assignedShadows[]>
    this.allocationCache = null; // Cache of all shadows
    this.allocationCacheTime = null; // When cache was created
    this.allocationCacheTTL = 60000; // 1 minute TTL

    // Retry timeout IDs for cleanup
    this._retryTimeouts = [];

    // HP/Mana regeneration timer
    this.regenInterval = null;

    // Performance optimization: Track current channel for active dungeon detection
    this.currentChannelKey = null; // Current channel user is viewing
    this.currentChannelUpdateInterval = null; // Update current channel every 2 seconds

    // Performance optimization: Throttled DOM updates
    this._hpBarUpdateQueue = new Set(); // Queue of channelKeys needing HP bar updates
    this._hpBarUpdateScheduled = false; // Flag to prevent duplicate scheduling
    this._lastHPBarUpdate = {}; // Track last update time per channelKey (throttle to 1s)

    // Performance optimization: Track last processing time for batch processing
    this._lastShadowAttackTime = new Map(); // channelKey -> last processing timestamp
    this._lastBossAttackTime = new Map(); // channelKey -> last processing timestamp
    this._lastMobAttackTime = new Map(); // channelKey -> last processing timestamp

    // Plugin running state
    this.started = false;

    // Fallback toast system
    this.fallbackToastContainer = null;
    this.fallbackToasts = [];

    // Track observer start time to ignore old messages
    this.observerStartTime = Date.now();
    this.processedMessageIds = new Set(); // Track processed message IDs to avoid duplicates

    // Extraction queue system (LEGACY - cleanup only, not used for mobs)
    this.extractionQueue = new Map(); // channelKey -> Array (legacy cleanup, mobs use immediate extraction only)

    // CSS Management System - Track injected styles for cleanup
    this._injectedStyles = new Set();
    this.extractionRetryLimit = 3; // Max attempts per boss (mobs use single-attempt immediate extraction)
    this.extractionProcessors = new Map(); // channelKey -> interval for continuous processing
    this.shadowArmyCountCache = new Map(); // Track shadow count to detect new extractions

    // Event-based extraction verification
    this.extractionEvents = new Map(); // Track extraction attempts by mobId
    this.setupExtractionEventListener();

    // Immediate extraction system (batch accumulator)
    this.immediateBatch = new Map(); // channelKey -> Array of mobs for immediate extraction
    this.immediateTimers = new Map(); // channelKey -> debounce timer

    // Baseline stats system: exponential scaling by rank
    // Used to ensure shadows scale properly with rank progression
    this.baselineStats = {
      E: { strength: 10, agility: 10, intelligence: 10, vitality: 10, luck: 10 },
      D: { strength: 25, agility: 25, intelligence: 25, vitality: 25, luck: 25 },
      C: { strength: 50, agility: 50, intelligence: 50, vitality: 50, luck: 50 },
      B: { strength: 100, agility: 100, intelligence: 100, vitality: 100, luck: 100 },
      A: { strength: 200, agility: 200, intelligence: 200, vitality: 200, luck: 200 },
      S: { strength: 400, agility: 400, intelligence: 400, vitality: 400, luck: 400 },
      SS: { strength: 800, agility: 800, intelligence: 800, vitality: 800, luck: 800 },
      SSS: { strength: 1600, agility: 1600, intelligence: 1600, vitality: 1600, luck: 1600 },
      Monarch: { strength: 3200, agility: 3200, intelligence: 3200, vitality: 3200, luck: 3200 },
    };
  }

  // ============================================================================
  // DEBUG LOGGING
  // ============================================================================
  /**
   * Debug log - Only logs when debug mode is enabled
   * Use for verbose/spam logs (burst spawns, capacity monitors, etc.)
   */
  debugLog(...args) {
    if (this.settings.debug) {
      // Legacy direct console log kept for compatibility; controlled by infoLog/debugLog
      // Prefer debugLog/infoLog instead of direct console usage.
      console.log('[Dungeons]', ...args);
    }
  }

  /**
   * Info log - Silent unless debug mode or forced
   * Use for important events only to avoid console spam
   * @param {boolean} force - Set true to log even when debug is off
   * @param {...any} args - Message args
   */
  infoLog(force = false, ...args) {
    if (force || this.settings.debug) {
      // Legacy direct console log kept for compatibility; controlled by infoLog/debugLog
      console.log('[Dungeons]', ...args);
    }
  }

  /**
   * Error log - Minimal console usage; still logs errors
   * Use for errors that need attention; respects debug to reduce noise
   * @param {boolean} force - Set true to always log (default true)
   * @param {...any} args - Message args
   */
  errorLog(force = true, ...args) {
    if (force || this.settings.debug) {
      // Legacy direct console error; controlled by errorLog/debugLog
      console.error('[Dungeons]', ...args);
    }
  }

  // ============================================================================
  // PLUGIN LIFECYCLE - Start & Stop
  // ============================================================================
  async start() {
    // Set plugin running state
    this.started = true;

    // Reset observer start time when plugin starts
    this.observerStartTime = Date.now();
    this.loadSettings();

    // Inject CSS using BdApi.DOM.addStyle (official API, persistent)
    this.injectCSS();

    this.loadPluginReferences();
    await this.initStorage();

    // Recalculate mana pool on startup (in case shadow army grew while plugin was off)
    this._recalculateManaTimeout = setTimeout(async () => {
      await this.recalculateUserMana();
    }, 2000);
    this._timeouts.add(this._recalculateManaTimeout);

    // Retry loading plugin references (especially for toasts plugin)
    this._retryTimeouts.push(
      setTimeout(() => {
        if (!this.toasts) {
          this.loadPluginReferences();
        }
      }, 1000)
    );

    this._retryTimeouts.push(
      setTimeout(() => {
        if (!this.toasts) {
          this.loadPluginReferences();
        }
      }, 3000)
    );

    // Dungeon chat UI button DISABLED
    // Use dungeon indicators (fortress icon) on channels to join dungeons
    // UI no longer needed - join via boss HP bar JOIN button

    this.startMessageObserver();
    this.startDungeonCleanupLoop();
    await this.restoreActiveDungeons();

    // Validate active dungeon status after restoration
    this.validateActiveDungeonStatus();

    this.setupChannelWatcher();
    this.startCurrentChannelTracking();

    // Start HP/Mana regeneration loop (every 1 second)
    this.startRegeneration();

    // Periodic validation (every 10 seconds) to catch edge cases
    this._statusValidationInterval = setInterval(() => {
      this.validateActiveDungeonStatus();
    }, 10000);
    this._intervals.add(this._statusValidationInterval);

    // GARBAGE COLLECTION: Periodic cleanup every 5 minutes
    this.gcInterval = setInterval(() => {
      this.triggerGarbageCollection('periodic');
    }, 300000); // 5 minutes
    this._intervals.add(this.gcInterval);
  }

  stop() {
    // Set plugin stopped state
    this.started = false;

    // Stop HP/Mana regeneration
    this.stopRegeneration();

    if (this._statusValidationInterval) {
      clearInterval(this._statusValidationInterval);
      this._intervals.delete(this._statusValidationInterval);
      this._statusValidationInterval = null;
    }

    if (this._recalculateManaTimeout) {
      clearTimeout(this._recalculateManaTimeout);
      this._timeouts.delete(this._recalculateManaTimeout);
      this._recalculateManaTimeout = null;
    }

    this.stopMessageObserver();
    this.stopAllShadowAttacks();
    this.stopAllBossAttacks();
    this.stopAllMobAttacks();
    this.stopAllDungeonCleanup();
    this.stopAllExtractionProcessors();
    this.removeAllIndicators();
    this.removeAllBossHPBars();

    // Clear all dungeon timeout timers
    if (this.dungeonTimeouts) {
      this.dungeonTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this.dungeonTimeouts.clear();
    }

    // RELEASE ALL CHANNEL LOCKS: Plugin stopping - free all channels
    if (this.channelLocks) {
      this.debugLog(`Releasing ${this.channelLocks.size} channel locks on plugin stop`);
      this.channelLocks.clear();
    }

    // Stop all tracked intervals (centralized cleanup)
    this._intervals.forEach((intervalId) => clearInterval(intervalId));
    this._intervals.clear();

    // Stop plugin validation interval
    if (this._pluginValidationInterval) {
      clearInterval(this._pluginValidationInterval);
      this._pluginValidationInterval = null;
    }

    // Stop garbage collection interval (also tracked in _intervals, but clear reference)
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }

    // Clean up fallback toast container
    if (this.fallbackToastContainer && this.fallbackToastContainer.parentNode) {
      this.fallbackToastContainer.parentNode.removeChild(this.fallbackToastContainer);
      this.fallbackToastContainer = null;
    }
    this.fallbackToasts = [];

    // Clear extraction systems
    if (this.extractionQueue) {
      this.extractionQueue.clear();
    }
    if (this.shadowArmyCountCache) {
      this.shadowArmyCountCache.clear();
    }

    // Clear all caches
    this.invalidateShadowCountCache();
    this.invalidateShadowsCache();
    if (this._shadowStatsCache) {
      this._shadowStatsCache = null;
    }
    if (this.cache) {
      this.cache.clear();
    }
    if (this.extractionEvents) {
      this.extractionEvents.clear();
    }
    if (this.immediateBatch) {
      this.immediateBatch.clear();
    }
    if (this.immediateTimers) {
      this.immediateTimers.forEach((timer) => clearTimeout(timer));
      this.immediateTimers.clear();
    }

    // Remove shadow extraction event listeners
    if (this._shadowExtractedListener) {
      if (typeof BdApi?.Events?.off === 'function') {
        BdApi.Events.off('ShadowArmy:shadowExtracted', this._shadowExtractedListener);
      }
      if (typeof document.removeEventListener === 'function') {
        document.removeEventListener('shadowExtracted', this._shadowExtractedListener);
      }
      this._shadowExtractedListener = null;
    }

    // Remove shadow extraction event listener (legacy)
    if (this._shadowExtractedHandler) {
      document.removeEventListener('shadowExtracted', this._shadowExtractedHandler);
      this._shadowExtractedHandler = null;
    }
    // Clear dead shadows tracking
    if (this.deadShadows) {
      this.deadShadows.clear();
    }
    // Clear defeated bosses tracking
    if (this.defeatedBosses) {
      this.defeatedBosses.clear();
    }
    // Clear shadow allocations cache
    if (this.shadowAllocations) {
      this.shadowAllocations.clear();
    }
    this.allocationCache = null; // Clear allocation cache
    this.allocationCacheTime = null;

    // Clear last attack time trackers
    if (this._lastShadowAttackTime) {
      this._lastShadowAttackTime.clear();
    }
    if (this._lastBossAttackTime) {
      this._lastBossAttackTime.clear();
    }
    if (this._lastMobAttackTime) {
      this._lastMobAttackTime.clear();
    }

    // Restore all hidden comments
    this.hiddenComments.forEach((_, channelKey) => {
      this.showChannelHeaderComments(channelKey);
    });
    this.hiddenComments.clear();
    this.removeUserHPBar();
    this.removeDungeonButton();
    this.closeDungeonModal();
    this.stopPanelWatcher();
    this.stopChannelWatcher();
    this.stopCurrentChannelTracking();

    // Clear HP bar update queue
    if (this._hpBarUpdateQueue) {
      this._hpBarUpdateQueue.clear();
    }
    this._hpBarUpdateScheduled = false;
    this._lastHPBarUpdate = {};

    // Clear processing time tracking
    if (this._lastShadowAttackTime) this._lastShadowAttackTime.clear();
    if (this._lastBossAttackTime) this._lastBossAttackTime.clear();
    if (this._lastMobAttackTime) this._lastMobAttackTime.clear();

    // Remove injected CSS (cleanup all tracked styles)
    this.cleanupAllCSS();

    this.saveSettings();

    // CENTRALIZED CLEANUP: Remove all tracked resources to prevent memory leaks
    // Remove all event listeners
    this._listeners.forEach((handlers, eventType) => {
      handlers.forEach((handler) => {
        if (eventType === 'popstate') {
          window.removeEventListener(eventType, handler);
        } else {
          document.removeEventListener(eventType, handler);
        }
      });
    });
    this._listeners.clear();

    // Disconnect all observers
    this._observers.forEach((observer) => observer.disconnect());
    this._observers.clear();

    // Clear all timeouts
    this._timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._timeouts.clear();

    // Legacy cleanup (for compatibility)
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
      this._popstateHandler = null;
    }
    if (this._onStatsChangedUnsubscribe && typeof this._onStatsChangedUnsubscribe === 'function') {
      this._onStatsChangedUnsubscribe();
      this._onStatsChangedUnsubscribe = null;
    }
    if (this._shadowExtractedHandler) {
      document.removeEventListener('shadowExtracted', this._shadowExtractedHandler);
      this._shadowExtractedHandler = null;
    }
    if (this._retryTimeouts) {
      this._retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this._retryTimeouts = [];
    }
  }

  // ============================================================================
  // DATABASE INITIALIZATION & STORAGE
  // ============================================================================
  async initStorage() {
    try {
      const userId = await this.getUserId();
      this.storageManager = new DungeonStorageManager(userId);
      await this.storageManager.init();
      // Silent database initialization (no console spam)
    } catch (error) {
      this.errorLog('Failed to initialize storage', error);
    }
  }

  /**
   * Get database statistics (useful for debugging and monitoring)
   */
  async getDatabaseStats() {
    if (!this.storageManager) {
      return null;
    }

    try {
      const stats = await this.storageManager.getDungeonStats();
      // Silent stats retrieval (available for debugging if needed)
      return stats;
    } catch (error) {
      this.errorLog('Error getting database stats', error);
      return null;
    }
  }

  async getUserId() {
    try {
      if (window.Discord && window.Discord.user && window.Discord.user.id) {
        return window.Discord.user.id;
      }
      const UserStore =
        BdApi.Webpack?.getStore?.('UserStore') ||
        BdApi.Webpack?.getModule?.((m) => m?.getCurrentUser);
      if (UserStore && UserStore.getCurrentUser) {
        const user = UserStore.getCurrentUser();
        if (user && user.id) return user.id;
      }
    } catch (error) {
      this.debugLog('Failed to get user ID', error);
    }
    return 'default';
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================
  async loadSettings() {
    try {
      const saved = BdApi.Data.load('Dungeons', 'settings');
      if (saved) {
        this.settings = { ...this.defaultSettings, ...saved };
        // Initialize user HP/Mana from stats if not set
        await this.initializeUserStats();
      } else {
        await this.initializeUserStats();
      }
    } catch (error) {
      this.errorLog('Failed to load settings', error);
      this.settings = { ...this.defaultSettings };
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('Dungeons', 'settings', this.settings);
    } catch (error) {
      this.errorLog('Failed to save settings', error);
    }
  }

  // ============================================================================
  // USER STATS & RESOURCES - HP/Mana Scaling
  // ============================================================================
  async initializeUserStats() {
    // Get stats ONCE at the start (avoid redundant calls)
    const totalStats = this.getUserEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const intelligence = totalStats.intelligence || 0;
    const rank = this.soloLevelingStats?.settings?.rank || 'E';

    // Get shadow count ONCE (cached for 5 seconds)
    const shadowCount = this.shadowArmy ? await this.getShadowCount() : 0;

    // Calculate user HP from TOTAL EFFECTIVE VITALITY (including buffs) + SHADOW ARMY SIZE
    if (!this.settings.userMaxHP || this.settings.userMaxHP === null) {
      // ENHANCED HP FORMULA: Scales with VIT + Shadow Army Size
      // Base: 100 + VIT × 10 + rankIndex × 50 (original)
      // Shadow Army Bonus: shadowCount × 25 (NEW!)
      // You need more HP to survive while commanding a larger army!
      const rankIndex = this.settings.dungeonRanks.indexOf(rank);
      const baseHP = 100 + vitality * 10 + rankIndex * 50;
      const shadowArmyBonus = shadowCount * 25;
      this.settings.userMaxHP = baseHP + shadowArmyBonus;

      if (!this.settings.userHP || this.settings.userHP === null) {
        this.settings.userHP = this.settings.userMaxHP;
      }
    }

    // Calculate user mana from TOTAL EFFECTIVE INTELLIGENCE (including buffs) + SHADOW ARMY SIZE
    if (!this.settings.userMaxMana || this.settings.userMaxMana === null) {
      // ENHANCED MANA FORMULA: Scales with INT + Shadow Army Size
      // Base: 100 + INT × 10 (original)
      // Shadow Army Bonus: shadowCount × 50 (NEW!)
      // This ensures you can resurrect your shadows!
      const baseMana = 100 + intelligence * 10;
      const shadowArmyBonus = shadowCount * 50;
      this.settings.userMaxMana = baseMana + shadowArmyBonus;

      if (!this.settings.userMana || this.settings.userMana === null) {
        this.settings.userMana = this.settings.userMaxMana;
      }
    }
  }

  /**
   * Get current shadow count with caching
   * Cache TTL: 5 seconds to balance performance and accuracy
   * Uses centralized cache manager
   */
  async getShadowCount() {
    // Check centralized cache first
    const cached = this.cache.get('shadowCount');
    if (cached !== null) {
      return cached;
    }

    // Check legacy cache (for backwards compatibility during transition)
    const now = Date.now();
    if (this._shadowCountCache && now - this._shadowCountCache.timestamp < 5000) {
      return this._shadowCountCache.count;
    }

    try {
      if (this.shadowArmy?.storageManager) {
        const shadows = await this.shadowArmy.storageManager.getShadows({}, 0, 10000);
        const count = shadows.length;

        // Cache in both systems (centralized + legacy)
        this.cache.set('shadowCount', count, 5000);
        this._shadowCountCache = { count, timestamp: now };
        return count;
      }
    } catch (error) {
      this.debugLog('Failed to get shadow count', error);
    }
    return 0;
  }

  /**
   * Invalidate shadow count cache
   * Called when shadow count changes (e.g., after extraction)
   */
  invalidateShadowCountCache() {
    this._shadowCountCache = null;
  }

  // ============================================================================
  // ============================================================================
  // PLUGIN INTEGRATION - External Plugin References (Optimized with BdApi)
  // ============================================================================

  /**
   * Validate plugin reference with required method/property check
   * @param {string} pluginName - Name of the plugin
   * @param {string} instanceProperty - Required property/method on instance
   * @returns {Object|null} Plugin instance or null if invalid
   */
  validatePluginReference(pluginName, instanceProperty) {
    const plugin = BdApi.Plugins.get(pluginName);
    if (!plugin?.instance) {
      this.debugLog(`Plugin ${pluginName} not available`);
      return null;
    }

    // Validate instance has required methods/properties
    if (instanceProperty && !plugin.instance[instanceProperty]) {
      this.debugLog(`Plugin ${pluginName} missing ${instanceProperty}`);
      return null;
    }

    return plugin.instance;
  }

  /**
   * Load plugin references using BdApi.Plugins.get (official API)
   * Operations:
   * 1. Load SoloLevelingStats plugin and subscribe to events
   * 2. Load ShadowArmy plugin for shadow army integration
   * 3. Load SoloLevelingToasts plugin for notifications (with fallback)
   * 4. Initialize user stats after loading
   * 5. Set up periodic validation (every 30 seconds)
   */
  async loadPluginReferences() {
    try {
      // Load SoloLevelingStats plugin with validation
      const soloPlugin = this.validatePluginReference('SoloLevelingStats', 'settings');
      if (soloPlugin) {
        this.soloLevelingStats = soloPlugin;
        // Initialize user stats after loading plugin reference
        await this.initializeUserStats();

        // Subscribe to stats changes to update HP/Mana bars
        if (typeof this.soloLevelingStats.on === 'function') {
          const callback = () => {
            this.updateUserHPBar();
          };
          this._onStatsChangedUnsubscribe = this.soloLevelingStats.on('statsChanged', callback);
        }
      } else {
        this.debugLog('SoloLevelingStats plugin not available');
      }

      // Load ShadowArmy plugin with validation
      const shadowPlugin = this.validatePluginReference('ShadowArmy', 'storageManager');
      if (shadowPlugin) {
        this.shadowArmy = shadowPlugin;
        this.debugLog('ShadowArmy plugin loaded successfully');

        // Listen for shadow extraction events (event-based sync)
        this._shadowExtractedListener = (data) => {
          // Invalidate shadow count cache
          this.invalidateShadowCountCache();
          // Invalidate shadows cache
          this.invalidateShadowsCache();

          // Recalculate HP/Mana if needed
          this.recalculateUserHP();
          this.recalculateUserMana();
        };

        // Use BdApi.Events if available, otherwise fallback to DOM events
        if (typeof BdApi?.Events?.on === 'function') {
          BdApi.Events.on('ShadowArmy:shadowExtracted', this._shadowExtractedListener);
          this.debugLog('Subscribed to ShadowArmy:shadowExtracted events');
        } else if (typeof document.addEventListener === 'function') {
          // Fallback to DOM events
          document.addEventListener('shadowExtracted', this._shadowExtractedListener);
          this.debugLog('Subscribed to shadowExtracted DOM events (fallback)');
        }
      } else {
        this.debugLog('ShadowArmy plugin not available');
      }

      // Set up periodic plugin validation (every 30 seconds)
      if (this._pluginValidationInterval) {
        clearInterval(this._pluginValidationInterval);
      }
      this._pluginValidationInterval = setInterval(() => {
        if (!this.soloLevelingStats?.settings) {
          this.soloLevelingStats = this.validatePluginReference('SoloLevelingStats', 'settings');
        }
        if (!this.shadowArmy?.storageManager) {
          this.shadowArmy = this.validatePluginReference('ShadowArmy', 'storageManager');
        }
      }, 30000);
      this._intervals.add(this._pluginValidationInterval);

      // Load SoloLevelingToasts plugin (with fallback support)
      const toastsPlugin = BdApi.Plugins.get('SoloLevelingToasts');
      if (toastsPlugin?.instance && typeof toastsPlugin.instance.showToast === 'function') {
        this.toasts = toastsPlugin.instance;
        this.debugLog('SoloLevelingToasts plugin loaded successfully');
      } else {
        // Fallback toast system will be used (no warning needed - graceful degradation)
        this.debugLog('SoloLevelingToasts plugin not available, using fallback notifications');
      }
    } catch (error) {
      this.debugLog('Error loading plugin references', error);
      // Don't throw - plugin can still function without integrations
    }
  }

  // ============================================================================
  // CHANNEL DETECTION (IMPROVED)
  // ============================================================================
  /**
   * Get all text channels for a guild
   */
  getAllGuildChannels(guildId) {
    try {
      const ChannelStore =
        BdApi.Webpack?.getStore?.('ChannelStore') ||
        BdApi.Webpack?.getModule?.((m) => m?.getChannel);

      if (ChannelStore) {
        // Try multiple methods to get channels
        let allChannels = [];

        // Method 1: getChannels()
        if (ChannelStore.getChannels) {
          const channelsObj = ChannelStore.getChannels();
          const values = Object.values(channelsObj || {});
          allChannels = values.filter(
            (ch) => ch && (ch.id || ch.guild_id || ch.guildId) && typeof ch.type !== 'undefined'
          );
        }

        // Method 2: Try GuildChannelStore if ChannelStore path failed
        if (!allChannels.length) {
          const GuildChannelStore = BdApi.Webpack?.getStore?.('GuildChannelStore');
          if (GuildChannelStore?.getChannels) {
            const guildChannels = GuildChannelStore.getChannels(guildId);
            if (guildChannels) {
              // GuildChannelStore returns: { SELECTABLE: [{channel: {...}, comparator: N}], VOCAL: [...], ... }
              // Extract channel objects from SELECTABLE array (text channels)
              const selectableChannels = guildChannels.SELECTABLE || [];
              allChannels = selectableChannels
                .map((item) => item.channel)
                .filter((ch) => ch != null);
            }
          }
        }

        // Method 3: Try getting guild and its channels
        if (!allChannels.length) {
          const GuildStore = BdApi.Webpack?.getStore?.('GuildStore');
          if (GuildStore?.getGuild) {
            GuildStore.getGuild(guildId);
          }
        }

        // Filter for text channels (type 0) in this guild
        // Try multiple property names (guild_id vs guildId, etc.)
        const guildTextChannels = allChannels.filter((channel) => {
          const channelGuildId = channel.guild_id || channel.guildId;
          const channelType = channel.type;
          const matchesGuild = channelGuildId === guildId;
          const isTextChannel = channelType === 0 || channelType === '0';
          return matchesGuild && isTextChannel;
        });

        // Channel filtering complete (logging disabled for performance)

        return guildTextChannels;
      }
    } catch (e) {
      this.errorLog('Error getting guild channels', e);
    }
    return [];
  }

  /**
   * Get a random channel from the current guild
   */
  getRandomGuildChannel() {
    try {
      const currentInfo = this.getChannelInfo();
      if (!currentInfo || !currentInfo.guildId) {
        return null;
      }

      const channels = this.getAllGuildChannels(currentInfo.guildId);
      if (channels.length === 0) {
        return null;
      }

      // Pick a random channel
      const randomIndex = Math.floor(Math.random() * channels.length);
      const randomChannel = channels[randomIndex];

      return {
        guildId: currentInfo.guildId,
        channelId: randomChannel.id,
        channelName: randomChannel.name,
      };
    } catch (e) {
      this.errorLog('Error getting random channel', e);
      return null;
    }
  }

  getChannelInfo() {
    try {
      // Method 1: URL parsing
      const pathMatch = window.location.pathname.match(/channels\/(\d+)\/(\d+)/);
      if (pathMatch) {
        return { guildId: pathMatch[1], channelId: pathMatch[2] };
      }

      // Method 2: Try BetterDiscord Webpack stores
      try {
        const ChannelStore =
          BdApi.Webpack?.getStore?.('ChannelStore') ||
          BdApi.Webpack?.getModule?.((m) => m?.getChannel);
        if (ChannelStore) {
          const selectedChannelId = ChannelStore.getChannelId?.();
          const selectedChannel = ChannelStore.getChannel?.(selectedChannelId);
          if (selectedChannel) {
            return {
              guildId: selectedChannel.guild_id || 'DM',
              channelId: selectedChannel.id,
            };
          }
        }

        const GuildStore =
          BdApi.Webpack?.getStore?.('GuildStore') || BdApi.Webpack?.getModule?.((m) => m?.getGuild);
        if (GuildStore && ChannelStore) {
          const selectedChannelId = ChannelStore.getChannelId?.();
          const selectedChannel = ChannelStore.getChannel?.(selectedChannelId);
          if (selectedChannel) {
            const guildId = selectedChannel.guild_id || 'DM';
            return { guildId, channelId: selectedChannel.id };
          }
        }
      } catch (e) {
        // Fall through to React fiber method
      }

      // Method 3: React fiber traversal
      const channelElement = document.querySelector('[class*="channel"]');
      if (channelElement) {
        const reactKey = Object.keys(channelElement).find(
          (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
        );
        if (reactKey) {
          const result = Array.from({ length: 20 }).reduce(
            (acc) => {
              if (acc.found || !acc.fiber) return acc;
              const channel = acc.fiber.memoizedProps?.channel;
              return channel
                ? {
                    fiber: null,
                    found: { guildId: channel.guild_id || 'DM', channelId: channel.id },
                  }
                : { fiber: acc.fiber.return, found: null };
            },
            { fiber: channelElement[reactKey], found: null }
          );
          if (result.found) return result.found;
        }
      }

      return null;
    } catch (error) {
      this.errorLog('Error getting channel info', error);
      return null;
    }
  }

  // ============================================================================
  // DUNGEON NAMES GENERATOR
  // ============================================================================
  generateDungeonName(rank, biome) {
    // Biome-specific dungeon names
    const biomeNames = {
      Forest: ['Verdant Grove', 'Twilight Woods', 'Ancient Forest', 'Insect Hive', 'Beast Den'],
      Arctic: ['Frozen Tundra', 'Ice Cavern', 'Glacial Peak', 'Frost Realm', 'Blizzard Valley'],
      Cavern: ['Dark Depths', 'Underground Maze', 'Spider Nest', 'Stone Abyss', 'Cursed Mines'],
      Swamp: ['Murky Marshland', 'Serpent Bog', 'Dead Waters', 'Toxic Fen', 'Ghoul Swamp'],
      Mountains: ['Sky Peak', 'Titan Ridge', 'Giant Pass', 'Cloud Fortress', 'Stone Citadel'],
      Volcano: ['Infernal Crater', 'Demon Forge', 'Magma Chamber', 'Hellfire Pit', 'Ash Realm'],
      'Ancient Ruins': [
        'Lost Temple',
        'Mystic Shrine',
        'Elven Sanctuary',
        'Forgotten Palace',
        'Ruined City',
      ],
      'Dark Abyss': ['Void Chasm', 'Shadow Realm', 'Demon Gate', 'Nightmare Pit', 'Chaos Rift'],
      'Tribal Grounds': [
        'Savage Camp',
        'Orc Stronghold',
        'Ogre Lair',
        'War Grounds',
        'Tribal Ruins',
      ],
    };

    const names = biomeNames[biome] || ['Ancient Dungeon'];
    const name = names[Math.floor(Math.random() * names.length)];
    return `[${rank}] ${name}`;
  }

  generateBossName(rank, biome) {
    // Biome-specific boss names
    const biomeBosses = {
      Forest: ['Beast King', 'Insect Queen', 'Spider Matriarch', 'Alpha Wolf', 'Ancient Treant'],
      Arctic: ['Frost Giant', 'Yeti Lord', 'Ice Wyrm', 'Blizzard King', 'Frozen Tyrant'],
      Cavern: [
        'Stone Guardian',
        'Ghoul Patriarch',
        'Spider Queen',
        'Underground Horror',
        'Golem Lord',
      ],
      Swamp: ['Serpent King', 'Naga Empress', 'Swamp Horror', 'Ghoul Master', 'Venom Lord'],
      Mountains: ['Titan King', 'Giant Chieftain', 'Sky Lord', 'Wyvern Sovereign', 'Mountain God'],
      Volcano: ['Demon Lord', 'Infernal Tyrant', 'Lava Dragon', 'Hell King', 'Flame Emperor'],
      'Ancient Ruins': [
        'Elven Patriarch',
        'Golem Keeper',
        'Ancient Guardian',
        'Lost King',
        'Ruin Master',
      ],
      'Dark Abyss': [
        'Void Dragon',
        'Demon Emperor',
        'Chaos Incarnate',
        'Abyss Lord',
        'Shadow King',
      ],
      'Tribal Grounds': [
        'Orc Warlord',
        'Ogre Chieftain',
        'Savage King',
        'War Beast',
        'Tribal Lord',
      ],
    };

    const bosses = biomeBosses[biome] || ['Ancient Boss'];
    return bosses[Math.floor(Math.random() * bosses.length)];
  }

  // ============================================================================
  // MESSAGE OBSERVER
  // ============================================================================
  startMessageObserver() {
    if (this.messageObserver) {
      return;
    }

    // Find message container first - use document.body as fallback to catch all DOM changes
    const findMessageContainer = () => {
      // Try specific message container selectors first
      const selectors = [
        '[class*="messagesWrapper"]',
        '[class*="chat"]',
        '[class*="messages"]',
        '[class*="messageList"]',
      ];

      const selectorContainer = selectors
        .map((sel) => document.querySelector(sel))
        .find((el) => Boolean(el));
      if (selectorContainer) return selectorContainer;

      // Fallback: Find scroller that contains actual message elements
      const scrollerWithMessages = Array.from(
        document.querySelectorAll('[class*="scroller"]')
      ).find((scroller) => scroller.querySelector('[class*="message"]') !== null);
      if (scrollerWithMessages) return scrollerWithMessages;

      // Last resort: Use document.body to catch all DOM changes
      return document.body;
    };

    const messageContainer = findMessageContainer();

    if (messageContainer) {
      // Only instantiate and assign observer after finding a valid container
      this.messageObserver = new MutationObserver((mutations) => {
        // Track observer for cleanup
        this._observers.add(this.messageObserver);
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            // Skip text nodes and non-element nodes
            if (node.nodeType !== 1) return;

            // Optimized message detection: Try most reliable methods first, early return when found
            let messageElement = null;

            // Strategy 1: Check for data-list-item-id (most reliable, fastest check)
            const listItemId = node.getAttribute?.('data-list-item-id');
            if (listItemId && listItemId.startsWith('chat-messages')) {
              messageElement = node.closest?.('[data-list-item-id]') || node;
            }

            // Strategy 2: Check if node itself is a message element (fast class check)
            if (!messageElement) {
              const nodeClassName = typeof node.className === 'string' ? node.className : '';
              if (node.classList?.contains('message') || nodeClassName.includes('message')) {
                messageElement = node;
              }
            }

            // Strategy 3: Check if node contains a message element (single querySelector)
            if (!messageElement) {
              const messageInNode = node.querySelector?.('[class*="message"]');
              if (messageInNode) {
                messageElement = messageInNode;
              }
            }

            // Strategy 4: Check parent chain for message container (only if needed)
            if (!messageElement && node.parentElement) {
              const closestListItem = node.closest?.('[data-list-item-id]');
              if (
                closestListItem &&
                closestListItem.getAttribute('data-list-item-id')?.startsWith('chat-messages')
              ) {
                messageElement = closestListItem;
              } else {
                const closestWithAuthor = node.closest?.('[class*="author"]');
                if (closestWithAuthor) {
                  messageElement =
                    closestWithAuthor.closest?.('[class*="message"]') ||
                    closestWithAuthor.parentElement;
                }
              }
            }

            if (messageElement) {
              this.handleMessage(messageElement);
            }
          });
        });
      });

      this.messageObserver.observe(messageContainer, { childList: true, subtree: true });
    } else {
      this.errorLog('Message container not found! Observer not started.');

      // Retry after delay if container not found (timing issue)
      // Track timeout ID and check plugin running state instead of observer
      const retryId = setTimeout(() => {
        if (this.started) {
          this.startMessageObserver();
        }
      }, 2000);
      this._retryTimeouts.push(retryId);
    }
  }

  stopMessageObserver() {
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }
  }

  async handleMessage(messageElement) {
    if (!this.settings.enabled) return;

    try {
      // Check if message is old (before observer started) - skip old messages
      const messageTimestamp = this.getMessageTimestamp(messageElement);
      if (messageTimestamp && messageTimestamp < this.observerStartTime) {
        return;
      }

      // Check for duplicate processing using message ID
      const messageId = this.getMessageId(messageElement);
      if (messageId && this.processedMessageIds.has(messageId)) {
        return;
      }
      if (messageId) {
        this.processedMessageIds.add(messageId);
        // Limit set size to prevent memory leak
        if (this.processedMessageIds.size > 1000) {
          const firstId = this.processedMessageIds.values().next().value;
          this.processedMessageIds.delete(firstId);
        }
      }

      const isUserMsg = this.isUserMessage(messageElement);
      if (!isUserMsg) return;

      const channelInfo = this.getChannelInfo();
      if (!channelInfo) return;

      // Get a random channel from the guild for dungeon spawn
      const randomChannelInfo = this.getRandomGuildChannel();
      if (randomChannelInfo) {
        const randomChannelKey = `${randomChannelInfo.guildId}_${randomChannelInfo.channelId}`;
        await this.checkDungeonSpawn(randomChannelKey, randomChannelInfo);
      } else {
        // Fallback to current channel if random selection fails
        const channelKey = `${channelInfo.guildId}_${channelInfo.channelId}`;
        await this.checkDungeonSpawn(channelKey, channelInfo);
      }

      // Still check current channel for user attacks
      const channelKey = `${channelInfo.guildId}_${channelInfo.channelId}`;
      if (this.settings.userActiveDungeon === channelKey) {
        const now = Date.now();
        if (now - this.lastUserAttackTime >= this.settings.userAttackCooldown) {
          // Pass messageElement for critical hit detection
          await this.processUserAttack(channelKey, messageElement);
          this.lastUserAttackTime = now;
        }
      }
    } catch (error) {
      this.errorLog('Error handling message', error);
    }
  }

  /**
   * Get message timestamp from element
   */
  getMessageTimestamp(messageElement) {
    try {
      // Try to get timestamp from time element
      const timeElement = messageElement.querySelector('time');
      if (timeElement) {
        const datetime = timeElement.getAttribute('datetime');
        if (datetime) {
          return new Date(datetime).getTime();
        }
      }

      // Try to get from data attribute
      const timestamp = messageElement.getAttribute('data-timestamp');
      if (timestamp) {
        return parseInt(timestamp);
      }

      // Try React fiber
      const reactKey = Object.keys(messageElement).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      if (reactKey) {
        const result = Array.from({ length: 20 }).reduce(
          (acc) => {
            if (acc.found || !acc.fiber) return acc;
            const timestamp = acc.fiber.memoizedProps?.message?.timestamp;
            return timestamp
              ? { fiber: null, found: new Date(timestamp).getTime() }
              : { fiber: acc.fiber.return, found: null };
          },
          { fiber: messageElement[reactKey], found: null }
        );
        if (result.found) return result.found;
      }
    } catch (e) {
      // Ignore errors
    }
    return null;
  }

  /**
   * Get message ID from element
   */
  getMessageId(messageElement) {
    try {
      // Try data-list-item-id
      const listItemId =
        messageElement.getAttribute('data-list-item-id') ||
        messageElement.closest('[data-list-item-id]')?.getAttribute('data-list-item-id');
      if (listItemId) return listItemId;

      // Try id attribute
      const id = messageElement.getAttribute('id');
      if (id) return id;

      // Try React fiber
      const reactKey = Object.keys(messageElement).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      if (reactKey) {
        const result = Array.from({ length: 20 }).reduce(
          (acc) => {
            if (acc.found || !acc.fiber) return acc;
            const msgId = acc.fiber.memoizedProps?.message?.id;
            return msgId
              ? { fiber: null, found: String(msgId) }
              : { fiber: acc.fiber.return, found: null };
          },
          { fiber: messageElement[reactKey], found: null }
        );
        if (result.found) return result.found;
      }
    } catch (e) {
      // Ignore errors
    }
    return null;
  }

  isUserMessage(messageElement) {
    const authorElement =
      messageElement.querySelector('[class*="author"]') ||
      messageElement.querySelector('[class*="username"]') ||
      messageElement.querySelector('[class*="headerText"]');

    if (!authorElement) {
      // Fallback: Check if message has text content (might be a valid message without author element visible)
      const hasContent = messageElement.textContent && messageElement.textContent.trim().length > 0;
      if (hasContent) {
        return true; // Accept messages with content even without author element
      }
      return false;
    }

    const botBadge =
      messageElement.querySelector('[class*="botTag"]') ||
      messageElement.querySelector('[class*="bot"]');

    return !botBadge;
  }

  // ============================================================================
  // DUNGEON SPAWNING
  // ============================================================================
  /**
   * Get server member count for dynamic spawn rate calculation
   */
  getServerMemberCount(guildId) {
    if (!guildId || guildId === 'DM') return null;

    try {
      const GuildStore =
        BdApi.Webpack?.getStore?.('GuildStore') || BdApi.Webpack?.getModule?.((m) => m?.getGuild);

      if (GuildStore?.getGuild) {
        const guild = GuildStore.getGuild(guildId);
        if (guild) {
          // Try multiple property names for member count
          return guild.memberCount || guild.members?.size || guild.approximateMemberCount || null;
        }
      }
    } catch (error) {
      this.debugLog('Error getting server member count:', error);
    }

    return null;
  }

  /**
   * Get total channel count for a server (for dungeon capacity calculation)
   */
  getServerChannelCount(guildId) {
    if (!guildId || guildId === 'DM') return null;

    try {
      const ChannelStore =
        BdApi.Webpack?.getStore?.('ChannelStore') ||
        BdApi.Webpack?.getModule?.((m) => m?.getGuildChannels);

      if (ChannelStore) {
        // Method 1: getGuildChannels
        if (typeof ChannelStore.getGuildChannels === 'function') {
          const channels = ChannelStore.getGuildChannels(guildId);
          if (channels) {
            // Count only text channels (not voice, announcements, etc)
            const textChannels = Object.values(channels).filter(
              (c) => c.type === 0 || c.type === 'GUILD_TEXT'
            );
            return textChannels.length;
          }
        }

        // Method 2: getAllChannels and filter by guild
        if (typeof ChannelStore.getAllChannels === 'function') {
          const allChannels = ChannelStore.getAllChannels();
          if (allChannels) {
            const guildChannels = Object.values(allChannels).filter(
              (c) => c.guild_id === guildId && (c.type === 0 || c.type === 'GUILD_TEXT')
            );
            return guildChannels.length;
          }
        }
      }
    } catch (error) {
      this.debugLog('Error getting server channel count:', error);
    }

    return null;
  }

  /**
   * Get max dungeons allowed for this server based on channel count
   */
  getMaxDungeonsForServer(guildId) {
    const channelCount = this.getServerChannelCount(guildId);

    // Fallback if we can't get channel count
    if (!channelCount) {
      return this.settings.minDungeonsAllowed || 3;
    }

    // Calculate max: 15% of channels (configurable)
    const percentage = this.settings.maxDungeonsPercentage || 0.15;
    const calculated = Math.floor(channelCount * percentage);

    // Apply min/max bounds
    const min = this.settings.minDungeonsAllowed || 3;
    const max = this.settings.maxDungeonsAllowed || 20;

    return Math.max(min, Math.min(max, calculated));
  }

  /**
   * Get count of active dungeons in a specific server
   */
  getActiveDungeonCountForServer(guildId) {
    let count = 0;
    this.activeDungeons.forEach((dungeon) => {
      if (dungeon.guildId === guildId && !dungeon.completed && !dungeon.failed) {
        count++;
      }
    });
    return count;
  }

  /**
   * Check if server has reached dungeon capacity
   */
  isServerAtCapacity(guildId) {
    const maxDungeons = this.getMaxDungeonsForServer(guildId);
    const activeDungeons = this.getActiveDungeonCountForServer(guildId);
    return activeDungeons >= maxDungeons;
  }

  /**
   * Calculate dynamic spawn chance based on server member count
   * Lower member count = Higher spawn rate (more active per person)
   * Higher member count = Lower spawn rate (less active per person)
   *
   * Formula: Base spawn chance * (1 / sqrt(memberCount / 10))
   * This creates a smooth curve that decreases as member count increases
   *
   * Examples:
   * - 10 members: 10% * (1 / sqrt(1)) = 10% (base rate)
   * - 100 members: 10% * (1 / sqrt(10)) = 3.16% (reduced)
   * - 1000 members: 10% * (1 / sqrt(100)) = 1% (much reduced)
   * - 10000 members: 10% * (1 / sqrt(1000)) = 0.32% (very reduced)
   */
  calculateDynamicSpawnChance(baseSpawnChance, guildId) {
    const memberCount = this.getServerMemberCount(guildId);

    // If member count unavailable or DM, use base spawn chance
    if (!memberCount || memberCount < 1) {
      return baseSpawnChance;
    }

    // Normalize member count (divide by 10 for smoother curve)
    const normalizedMembers = memberCount / 10;

    // Calculate dynamic multiplier using square root curve
    // This creates a smooth decrease: 1 member = 1.0x, 10 members = 0.32x, 100 members = 0.1x
    const multiplier = 1 / Math.sqrt(normalizedMembers);

    // Calculate dynamic spawn chance
    const dynamicChance = baseSpawnChance * multiplier;

    // Clamp between reasonable bounds (0.1% minimum, base chance maximum)
    // Prevents impossible spawns and spam
    const minChance = 0.1;
    const maxChance = baseSpawnChance;

    return Math.max(minChance, Math.min(maxChance, dynamicChance));
  }

  async checkDungeonSpawn(channelKey, channelInfo) {
    // CHANNEL LOCK PROTECTION: Check if channel is already occupied
    // Prevents spam-spawned dungeons from colliding in same channel
    if (this.channelLocks.has(channelKey)) {
      // Channel is locked by another dungeon spawn in progress
      return;
    }

    // IMPORTANT: Only one dungeon per channel ID (prevents duplicates)
    if (this.activeDungeons.has(channelKey)) {
      return;
    }

    // SERVER CAPACITY CHECK: Prevent too many dungeons from spawning in one server
    // Stops spawn spam by limiting based on server channel count
    if (this.isServerAtCapacity(channelInfo.guildId)) {
      const maxDungeons = this.getMaxDungeonsForServer(channelInfo.guildId);
      const activeDungeons = this.getActiveDungeonCountForServer(channelInfo.guildId);
      const channelCount = this.getServerChannelCount(channelInfo.guildId) || '?';

      // Log once per server when capacity reached (not every message)
      if (!this._capacityWarningShown) {
        this._capacityWarningShown = {};
      }
      if (!this._capacityWarningShown[channelInfo.guildId]) {
        this.debugLog(
          `Server at capacity: ${activeDungeons}/${maxDungeons} dungeons active (${channelCount} channels total)`
        );
        this._capacityWarningShown[channelInfo.guildId] = true;

        // Reset warning after 30 seconds so we can warn again if still spamming
        setTimeout(() => {
          if (this._capacityWarningShown) {
            delete this._capacityWarningShown[channelInfo.guildId];
          }
        }, 30000);
      }
      return; // Server at capacity - reject spawn
    }

    const lastSpawn = this.settings.lastSpawnTime[channelKey] || 0;
    const timeSinceLastSpawn = Date.now() - lastSpawn;
    const dungeonDuration = this.settings.dungeonDuration || 300000;

    if (timeSinceLastSpawn < dungeonDuration) return;

    // Calculate dynamic spawn chance based on server member count
    const baseSpawnChance = this.settings.spawnChance || 10;
    const dynamicSpawnChance = this.calculateDynamicSpawnChance(
      baseSpawnChance,
      channelInfo.guildId
    );

    const roll = Math.random() * 100;

    if (roll > dynamicSpawnChance) {
      return;
    }

    // LOCK CHANNEL IMMEDIATELY: Prevents race conditions from message spam
    // Lock is acquired BEFORE dungeon creation starts
    this.channelLocks.add(channelKey);

    try {
      // ALLOW MULTIPLE DUNGEONS: Can spawn in different channels simultaneously
      const dungeonRank = this.calculateDungeonRank();
      await this.createDungeon(channelKey, channelInfo, dungeonRank);
    } catch (error) {
      // CRITICAL: Release lock on error to prevent permanent lock
      this.errorLog(`Error creating dungeon in ${channelKey}:`, error);
      this.channelLocks.delete(channelKey);
    }
  }

  /**
   * Calculate dungeon rank using weighted random selection (functional approach)
   * @returns {string} Selected dungeon rank
   */
  calculateDungeonRank() {
    const userRank = this.soloLevelingStats?.settings?.rank || 'E';
    const rankIndex = this.settings.dungeonRanks.indexOf(userRank);
    const maxRankIndex = this.settings.dungeonRanks.length - 1;

    // Functional: Generate weights using Array.from and map
    const weights = Array.from({ length: maxRankIndex + 1 }, (_, i) =>
      i <= rankIndex ? 10 - (rankIndex - i) : Math.max(1, 5 - (i - rankIndex))
    );

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    // Functional: Use findIndex instead of for-loop
    const selectedIndex = weights.findIndex((weight) => {
      random -= weight;
      return random <= 0;
    });

    return this.settings.dungeonRanks[selectedIndex >= 0 ? selectedIndex : 0];
  }

  /**
   * Create a new dungeon instance
   *
   * Dungeon Object Schema (IndexedDB v2):
   * - id: string (channelKey)
   * - channelKey: string
   * - channelId: string
   * - guildId: string
   * - rank: string (E/D/C/B/A/S/SS/SSS/Monarch)
   * - type: string (Normal/Elite/Boss Rush/Horde/Fortress)
   * - name: string (generated dungeon name)
   * - channelName: string
   * - startTime: number (timestamp)
   * - completed: boolean
   * - failed: boolean
   * - userParticipating: boolean | null
   * - mobs: {
   *     total: number,
   *     remaining: number,
   *     killed: number,
   *     targetCount: number (300-5000 based on rank/type),
   *     spawnRate: number,
   *     activeMobs: Array<MobObject>
   *   }
   * - boss: {
   *     name: string,
   *     hp: number (dynamically scaled),
   *     maxHp: number,
   *     rank: string,
   *     strength/agility/intelligence/vitality: number,
   *     lastAttackTime: number,
   *     attackCooldown: number,
   *     expectedShadowCount: number (for HP scaling)
   *   }
   * - shadowAttacks: Object<shadowId, timestamp>
   * - shadowContributions: Object<shadowId, {mobsKilled, bossDamage}>
   * - shadowHP: Object<shadowId, {hp, maxHp}>
   */
  async createDungeon(channelKey, channelInfo, rank) {
    // FINAL SAFETY CHECK: Forcefully reject if channel already has active dungeon
    // This catches any race conditions that passed the initial checks
    if (this.activeDungeons.has(channelKey)) {
      // Removed spammy log - conflict detection is working silently
      this.debugLog(
        `CONFLICT DETECTED: Channel ${channelKey} already has active dungeon - forcing abort`
      );
      this.channelLocks.delete(channelKey); // Release lock
      return; // Abort dungeon creation
    }

    const rankIndex = this.settings.dungeonRanks.indexOf(rank);
    // THEMED BIOME DUNGEONS - Each biome spawns specific magic beast families
    // Biomes reflect natural habitats for magic beasts
    const dungeonBiomes = [
      {
        name: 'Forest',
        description: 'Dense woodland teeming with insects and beasts',
        mobMultiplier: 2.5, // Horde of insects
        beastFamilies: ['insect', 'beast'], // Ants, spiders, centipedes, bears, wolves
      },
      {
        name: 'Arctic',
        description: 'Frozen wasteland of ice and snow',
        mobMultiplier: 1.2, // Fewer but tankier
        beastFamilies: ['ice', 'beast'], // Yetis, bears, wolves
      },
      {
        name: 'Cavern',
        description: 'Underground tunnels filled with horrors',
        mobMultiplier: 2.0, // Many creatures
        beastFamilies: ['insect', 'undead', 'construct'], // Spiders, centipedes, ghouls, golems
      },
      {
        name: 'Swamp',
        description: 'Murky marshland of serpents and undead',
        mobMultiplier: 1.8, // Dense population
        beastFamilies: ['reptile', 'undead'], // Serpents, nagas, ghouls
      },
      {
        name: 'Mountains',
        description: 'Rocky peaks inhabited by giants and wyverns',
        mobMultiplier: 0.8, // Fewer but stronger
        beastFamilies: ['giant', 'dragon'], // Giants, titans, wyverns, dragons (NH+)
      },
      {
        name: 'Volcano',
        description: 'Molten hellscape of demons and dragons',
        mobMultiplier: 1.0, // Balanced
        beastFamilies: ['demon', 'dragon'], // Demons, ogres, dragons (NH+)
      },
      {
        name: 'Ancient Ruins',
        description: 'Mystical ruins guarded by constructs and elves',
        mobMultiplier: 1.2, // Moderate
        beastFamilies: ['construct', 'ancient', 'undead'], // Golems, elves, ghouls
      },
      {
        name: 'Dark Abyss',
        description: 'Void realm of demons and horrors',
        mobMultiplier: 1.5, // Many dark creatures
        beastFamilies: ['demon', 'undead', 'dragon'], // Demons, ghouls, dragons (NH+)
      },
      {
        name: 'Tribal Grounds',
        description: 'Savage lands of orcs and ogres',
        mobMultiplier: 2.0, // Large tribes
        beastFamilies: ['humanoid-beast', 'giant'], // Orcs, ogres, giants
      },
    ];

    const dungeonBiome = dungeonBiomes[Math.floor(Math.random() * dungeonBiomes.length)];
    const dungeonType = dungeonBiome.name;

    // Generate themed names based on biome
    const dungeonName = this.generateDungeonName(rank, dungeonType);
    const bossName = this.generateBossName(rank, dungeonType);

    // MASSIVELY INCREASED MOB COUNTS
    // E: 2,000 | D: 5,000 | C: 8,000 | B: 12,000 | A: 17,000 | S: 23,000 | SS: 30,000 | SSS: 40,000 | NH: 50,000 | Monarch+: 80,000
    const baseMobCount = 2000 + rankIndex * 3000;
    const biomeMultiplier = dungeonBiome.mobMultiplier || 1.0;
    const totalMobCount = Math.floor(
      Math.min(150000, Math.max(2000, baseMobCount * biomeMultiplier))
    );

    // Calculate expected shadow allocation for this dungeon
    // Get current shadow army size
    const allShadows = await this.getAllShadows();
    const totalShadowCount = allShadows.length;

    // Calculate this dungeon's weight relative to other active dungeons
    const activeDungeonsList = Array.from(this.activeDungeons.values()).filter(
      (d) => !d.completed && !d.failed
    );

    // Weight system: E=1, D=2, C=3, B=4, A=5, S=6, etc.
    const thisWeight = rankIndex + 1;
    const existingTotalWeight = activeDungeonsList.reduce((sum, d) => {
      const dRankIndex = this.settings.dungeonRanks.indexOf(d.rank);
      return sum + (dRankIndex + 1);
    }, 0);
    const newTotalWeight = existingTotalWeight + thisWeight;

    // Calculate expected shadows for this dungeon
    const expectedShadowPortion = (thisWeight / newTotalWeight) * totalShadowCount;
    const expectedShadowCount = Math.max(1, Math.floor(expectedShadowPortion));

    // Scale boss HP based on rank, type, AND expected shadow count
    // Base: 500 + rank × 500
    // Shadow scaling: +150 HP per shadow (increased from 50 for durability)
    // Type modifiers: Elite/Boss Rush have more HP, Horde has less
    const baseBossHP = 500 + rankIndex * 500;

    // Biome-based HP multipliers (MASSIVELY INCREASED for chaotic shadow attacks)
    // Ensures bosses survive extended battles with dynamic shadow attacks
    // Average shadow damage: ~1,000-2,000 per hit with variance
    // Target: Boss survives 15-30 seconds of combat (multiple attack waves)
    const biomeHPMultipliers = {
      Forest: 4500, // Many mobs, weaker boss
      Arctic: 6000, // Ice tank bosses
      Cavern: 5500, // Underground horrors
      Swamp: 5000, // Murky predators
      Mountains: 7000, // Giant/titan bosses
      Volcano: 8000, // Demon lords, dragons
      'Ancient Ruins': 6500, // Ancient guardians
      'Dark Abyss': 9000, // Void horrors, dragons
      'Tribal Grounds': 5500, // Orc/ogre chieftains
    };

    const hpPerShadow = biomeHPMultipliers[dungeonType] || 5000;
    const shadowScaledHP = baseBossHP + expectedShadowCount * hpPerShadow;
    const finalBossHP = Math.floor(shadowScaledHP);

    // Calculate boss stats based on rank
    const bossStrength = 50 + rankIndex * 25;
    const bossAgility = 30 + rankIndex * 15;
    const bossIntelligence = 40 + rankIndex * 20;
    const bossVitality = 60 + rankIndex * 30;
    const bossLuck = 50 + rankIndex * 30; // Bosses have higher luck

    // BOSS MAGIC BEAST TYPE (biome-appropriate)
    const bossBeastType = this.selectMagicBeastType(
      dungeonBiome.beastFamilies,
      rank,
      this.settings.dungeonRanks
    );

    const dungeon = {
      id: channelKey,
      channelKey,
      rank,
      name: dungeonName,
      type: dungeonType, // Biome name (Forest, Arctic, etc.)
      biome: dungeonBiome, // Store complete biome data
      beastFamilies: dungeonBiome.beastFamilies, // Allowed beast families for this biome
      channelName: channelInfo.channelName || `Channel ${channelInfo.channelId}`, // Store channel name
      mobs: {
        total: 0,
        remaining: 0,
        killed: 0,
        targetCount: totalMobCount, // Target mob count for this dungeon
        spawnRate: 2 + rankIndex,
        activeMobs: [], // Array of mob objects with HP and stats
      },
      boss: {
        name: bossName,
        hp: finalBossHP,
        maxHp: finalBossHP,
        rank,

        // MAGIC BEAST IDENTITY (for shadow extraction)
        beastType: bossBeastType.type,
        beastName: bossBeastType.name,
        beastFamily: bossBeastType.family,
        isMagicBeast: true,

        // Combat stats (for compatibility)
        strength: bossStrength,
        agility: bossAgility,
        intelligence: bossIntelligence,
        vitality: bossVitality,
        luck: bossLuck,

        // SHADOW-COMPATIBLE STATS (for extraction)
        baseStats: {
          strength: bossStrength,
          agility: bossAgility,
          intelligence: bossIntelligence,
          vitality: bossVitality,
          luck: bossLuck,
        },

        lastAttackTime: 0,
        attackCooldown: 4000, // Boss attacks every 4 seconds
        expectedShadowCount: expectedShadowCount, // Track expected shadow force

        // Description for display
        description: `${rank}-rank ${bossBeastType.name} Boss from ${dungeonBiome.name}`,
      },
      startTime: Date.now(),
      channelId: channelInfo.channelId,
      guildId: channelInfo.guildId,
      userParticipating: null,
      shadowAttacks: {},
      shadowContributions: {}, // Track XP contributions: { shadowId: { mobsKilled: 0, bossDamage: 0 } }
      shadowHP: {}, // Track shadow HP: { shadowId: { hp, maxHp } } - Object for serialization
      shadowRevives: 0, // Track total revives for summary
      completed: false,
      failed: false,
    };

    this.activeDungeons.set(channelKey, dungeon);

    // RELEASE CHANNEL LOCK: Dungeon successfully created and now in activeDungeons
    // Lock is no longer needed - activeDungeons check will prevent new spawns
    this.channelLocks.delete(channelKey);

    this.settings.lastSpawnTime[channelKey] = Date.now();
    this.saveSettings(); // Ensure lastSpawnTime is persisted
    this.settings.mobKillNotifications[channelKey] = { count: 0, lastNotification: Date.now() };

    // Save to IndexedDB
    if (this.storageManager) {
      try {
        await this.storageManager.saveDungeon(dungeon);
      } catch (error) {
        this.errorLog('Failed to save dungeon', error);
      }
    }

    this.saveSettings();
    this.showDungeonIndicator(channelKey, channelInfo);
    // Simple spawn notification
    this.showToast(`${dungeonName} [${rank}] Spawned!`, 'info');

    // NATURAL SPAWNING ONLY: Mobs spawn gradually over time with variance
    // No initial burst - creates organic, non-overwhelming experience
    // Spawn system will begin immediately and continue with 4-8 second intervals

    // Pre-split shadow army for optimal performance
    // Force reallocation to include this new dungeon (bypass cache for dynamic deployment)
    await this.preSplitShadowArmy(true);

    // Shadows attack automatically (Solo Leveling lore: shadows sweep dungeons independently)
    this.startShadowAttacks(channelKey);
    this.startMobKillNotifications(channelKey);
    this.startMobSpawning(channelKey); // Continue spawning remaining mobs over time
    this.startBossAttacks(channelKey);
    this.startMobAttacks(channelKey);
    this.startContinuousExtraction(channelKey); // Continuous extraction processor

    // Set timeout for automatic dungeon completion (10 minutes)
    const timeoutId = setTimeout(() => {
      this.completeDungeon(channelKey, 'timeout');
    }, this.settings.dungeonDuration);
    this.dungeonTimeouts.set(channelKey, timeoutId);

    // Silent dungeon spawn (no console spam)
  }

  // ============================================================================
  // CONTINUOUS MOB SPAWNING
  // ============================================================================

  /**
   * Start continuous mob spawning for a dungeon
   * Uses natural, organic spawn patterns with high variance
   * @param {string} channelKey - Channel key for the dungeon
   */
  startMobSpawning(channelKey) {
    if (this.mobSpawnTimers.has(channelKey)) return;

    // NATURAL SPAWNING: Gradual, organic mob waves with high variance
    // Creates dynamic, unpredictable spawn patterns without overwhelming
    const scheduleNextSpawn = () => {
      const dungeon = this.activeDungeons.get(channelKey);
      if (!dungeon || dungeon.completed || dungeon.failed) {
        this.stopMobSpawning(channelKey);
        return;
      }

      // Spawn mobs naturally
      this.spawnMobs(channelKey);

      // MEMORY OPTIMIZED SPAWNING: Slower, smaller waves
      // Base: 6 seconds, Variance: ±33% (4-8 seconds)
      // Reduces memory footprint while maintaining organic feel
      const baseInterval = 6000; // 6 seconds (memory optimized)
      const variance = baseInterval * 0.33; // ±2000ms (33% variance)
      const nextInterval = baseInterval - variance + Math.random() * variance * 2;
      // Result: 4000-8000ms (4-8 seconds, organic with lower frequency!)

      // Schedule next spawn
      const timeoutId = setTimeout(scheduleNextSpawn, nextInterval);
      this.mobSpawnTimers.set(channelKey, timeoutId);
    };

    // Start first spawn immediately (no delay)
    scheduleNextSpawn();

    // Natural spawning handles capacity organically
    // No need for capacity monitoring with gradual spawn system
  }

  // ============================================================================
  // CAPACITY MONITORING
  // ============================================================================

  /**
   * Monitor dungeon capacity and ensure it reaches max
   * Runs every 5 seconds to verify spawning is progressing
   * @param {string} channelKey - Channel key for the dungeon
   */
  startCapacityMonitor(channelKey) {
    if (this.capacityMonitors?.has(channelKey)) return;
    if (!this.capacityMonitors) this.capacityMonitors = new Map();

    const monitor = setInterval(() => {
      const dungeon = this.activeDungeons.get(channelKey);
      if (!dungeon || dungeon.completed || dungeon.failed) {
        this.stopCapacityMonitor(channelKey);
        return;
      }

      const current = dungeon.mobs.total;
      const target = dungeon.mobs.targetCount;
      const percent = Math.floor((current / target) * 100);

      // Check if spawning has stalled
      const lastCheck = dungeon.lastCapacityCheck || 0;
      const lastCount = dungeon.lastCapacityCount || 0;
      const now = Date.now();

      // If count hasn't changed in 10 seconds and not at max, something is wrong
      if (now - lastCheck > 10000 && current === lastCount && current < target) {
        this.debugLog(
          `⚠️ [${channelKey.slice(-8)}] ${
            dungeon.name
          }: SPAWN STALLED at ${current}/${target} (${percent}%) for 10+ seconds`
        );
        // Force a spawn attempt
        this.spawnMobs(channelKey);
      }

      // Update tracking
      dungeon.lastCapacityCheck = now;
      dungeon.lastCapacityCount = current;

      // Stop monitoring when at max
      if (current >= target) {
        // Capacity monitor (silent)
        this.stopCapacityMonitor(channelKey);
      }
    }, 5000); // Check every 5 seconds

    this.capacityMonitors.set(channelKey, monitor);
  }

  /**
   * Stop capacity monitor for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  stopCapacityMonitor(channelKey) {
    const monitor = this.capacityMonitors?.get(channelKey);
    if (monitor) {
      clearInterval(monitor);
      this.capacityMonitors.delete(channelKey);
    }
  }

  /**
   * Stop all capacity monitors
   */
  stopAllCapacityMonitors() {
    if (this.capacityMonitors) {
      this.capacityMonitors.forEach((monitor) => clearInterval(monitor));
      this.capacityMonitors.clear();
    }
  }

  /**
   * Stop mob spawning for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  stopMobSpawning(channelKey) {
    const timer = this.mobSpawnTimers.get(channelKey);
    if (timer) {
      clearTimeout(timer); // Changed from clearInterval to clearTimeout
      this.mobSpawnTimers.delete(channelKey);
    }
  }

  /**
   * Stop all mob spawning timers
   */
  stopAllMobSpawning() {
    this.mobSpawnTimers.forEach((timer) => clearTimeout(timer)); // Changed from clearInterval
    this.mobSpawnTimers.clear();
    this.stopAllCapacityMonitors();
  }

  // ============================================================================
  // BEAST TYPE SELECTION HELPERS
  // ============================================================================

  /**
   * Select appropriate magic beast type based on biome families and rank
   * Returns beast type data compatible with Shadow Army extraction
   * @param {Array} allowedFamilies - Allowed beast families for this biome
   * @param {string} mobRank - Mob rank
   * @param {Array} allRanks - All available ranks
   * @returns {Object} Beast type object with type, name, family, minRank
   */
  selectMagicBeastType(allowedFamilies, mobRank, allRanks) {
    // Magic beast type definitions (matches Shadow Army shadowRoles)
    const magicBeastTypes = {
      // Insect family
      ant: { type: 'ant', name: 'Ant', family: 'insect', minRank: null },
      spider: { type: 'spider', name: 'Spider', family: 'insect', minRank: null },
      centipede: { type: 'centipede', name: 'Centipede', family: 'insect', minRank: null },

      // Beast family
      bear: { type: 'bear', name: 'Bear', family: 'beast', minRank: null },
      wolf: { type: 'wolf', name: 'Wolf', family: 'beast', minRank: null },

      // Reptile family
      naga: { type: 'naga', name: 'Naga', family: 'reptile', minRank: null },
      serpent: { type: 'serpent', name: 'Serpent', family: 'reptile', minRank: null },

      // Ice family
      yeti: { type: 'yeti', name: 'Yeti', family: 'ice', minRank: null },

      // Dragon family (NH+ only)
      dragon: { type: 'dragon', name: 'Dragon', family: 'dragon', minRank: 'NH' },
      wyvern: { type: 'wyvern', name: 'Wyvern', family: 'dragon', minRank: 'A' },

      // Giant family
      giant: { type: 'giant', name: 'Giant', family: 'giant', minRank: null },
      titan: { type: 'titan', name: 'Titan', family: 'giant', minRank: 'S' },

      // Demon family
      demon: { type: 'demon', name: 'Demon', family: 'demon', minRank: null },
      ogre: { type: 'ogre', name: 'Ogre', family: 'demon', minRank: null },

      // Undead family
      ghoul: { type: 'ghoul', name: 'Ghoul', family: 'undead', minRank: null },

      // Construct family
      golem: { type: 'golem', name: 'Golem', family: 'construct', minRank: null },

      // Ancient family
      elf: { type: 'elf', name: 'Elf', family: 'ancient', minRank: null },

      // Humanoid-beast family (orcs, etc.)
      orc: { type: 'orc', name: 'Orc', family: 'humanoid-beast', minRank: null },
    };

    // Filter beasts by allowed families
    let availableBeasts = Object.values(magicBeastTypes).filter((beast) =>
      allowedFamilies.includes(beast.family)
    );

    // Filter by rank restrictions
    const mobRankIndex = allRanks.indexOf(mobRank);
    availableBeasts = availableBeasts.filter((beast) => {
      if (!beast.minRank) return true; // No restriction
      const minRankIndex = allRanks.indexOf(beast.minRank);
      return mobRankIndex >= minRankIndex; // Only if mob rank meets minimum
    });

    // Fallback: if no beasts available, return a generic beast
    if (availableBeasts.length === 0) {
      return { type: 'beast', name: 'Beast', family: 'beast', minRank: null };
    }

    // Randomly select from available beasts
    return availableBeasts[Math.floor(Math.random() * availableBeasts.length)];
  }

  spawnMobs(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed) {
      this.stopMobSpawning(channelKey);
      return;
    }

    // CONTINUOUS SPAWN: Dynamic rate based on current mob count (prevents infinite growth)
    if (dungeon.boss.hp > 0) {
      const dungeonRankIndex = this.settings.dungeonRanks.indexOf(dungeon.rank);

      // DYNAMIC SPAWN RATE WITH VARIANCE: Self-balancing with randomness
      // NO HARD CAPS - uses soft scaling that gradually slows down
      const _aliveMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0).length;

      let baseSpawnCount;
      let variancePercent;

      // MEMORY OPTIMIZED: Smaller waves reduce memory footprint
      // Shadows naturally control mob population through combat
      // Balanced for multiple simultaneous dungeons
      baseSpawnCount = 100; // Reduced from 200 (50% reduction for memory)
      variancePercent = 0.3; // 70-130 per wave (maintains organic variance)

      // Apply variance (e.g., 100 ±30% = 70-130)
      // Variance creates organic, unpredictable spawn waves
      const variance = baseSpawnCount * variancePercent;
      const actualSpawnCount = Math.floor(baseSpawnCount - variance + Math.random() * variance * 2);

      // Result: Memory-optimized spawning, natural stabilization around 1000-1500
      // Balanced for multiple dungeons (4-8s) - smooth, memory-efficient experience
      // Shadows control population - no artificial caps needed

      // Spawn wave (silent unless debug mode)

      // BATCH MOB GENERATION with INDIVIDUAL VARIANCE (functional approach)
      // Generate mobs using Array.from instead of for-loop
      const newMobs = Array.from({ length: actualSpawnCount }, () => {
        // Mob rank: dungeon rank ± 1 (can be 1 rank weaker, same, or 1 rank stronger)
        // Example: A rank dungeon → B, A, or S rank mobs
        const rankVariation = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
        const mobRankIndex = Math.max(
          0,
          Math.min(this.settings.dungeonRanks.length - 1, dungeonRankIndex + rankVariation)
        );
        const mobRank = this.settings.dungeonRanks[mobRankIndex];

        // INDIVIDUAL MOB VARIANCE: Each mob is unique (85-115% stat variance)
        // This creates diversity: some mobs are weak, some are strong, some are fast, some are tanks
        const strengthVariance = 0.85 + Math.random() * 0.3; // 85-115%
        const agilityVariance = 0.85 + Math.random() * 0.3; // 85-115%
        const intelligenceVariance = 0.85 + Math.random() * 0.3; // 85-115%
        const vitalityVariance = 0.85 + Math.random() * 0.3; // 85-115%

        // BASE STATS scaled by rank
        const baseStrength = 100 + mobRankIndex * 50; // E: 100, S: 350
        const baseAgility = 80 + mobRankIndex * 40; // E: 80, S: 280
        const baseIntelligence = 60 + mobRankIndex * 30; // E: 60, S: 210
        const baseVitality = 150 + mobRankIndex * 100; // E: 150, S: 650

        // INDIVIDUAL STATS with variance (each mob is unique)
        const mobStrength = Math.floor(baseStrength * strengthVariance);
        const mobAgility = Math.floor(baseAgility * agilityVariance);
        const mobIntelligence = Math.floor(baseIntelligence * intelligenceVariance);
        const mobVitality = Math.floor(baseVitality * vitalityVariance);

        // HP scaled by vitality with additional variance
        // Mobs use different formula than user/shadow HP for balance
        // Formula: 200 + VIT × 15 + rankIndex × 100 (mobs are tougher enemies)
        const baseHP = 200 + mobVitality * 15 + mobRankIndex * 100;
        const hpVariance = 0.7 + Math.random() * 0.3; // 70-100% HP variance (was 80-120%)
        const mobHP = Math.floor(baseHP * hpVariance);

        // Attack cooldown variance (some mobs attack faster than others)
        const cooldownVariance = 2000 + Math.random() * 2000; // 2-4 seconds

        // MAGIC BEAST TYPE SELECTION (biome-based)
        // Select magic beast type from dungeon's allowed beast families
        const magicBeastType = this.selectMagicBeastType(
          dungeon.beastFamilies,
          mobRank,
          this.settings.dungeonRanks
        );

        // SHADOW ARMY COMPATIBLE STRUCTURE
        // Mobs store full stats compatible with shadow extraction system
        // When extracted, these stats transfer directly to shadow baseStats
        return {
          // Core mob identity
          id: `mob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          rank: mobRank,

          // MAGIC BEAST IDENTITY (for shadow extraction)
          beastType: magicBeastType.type, // 'ant', 'dragon', 'naga', etc.
          beastName: magicBeastType.name, // 'Ant', 'Dragon', 'Naga', etc.
          beastFamily: magicBeastType.family, // 'insect', 'dragon', 'reptile', etc.
          isMagicBeast: true, // All dungeon mobs are magic beasts

          // Combat stats (current HP)
          hp: mobHP,
          maxHp: mobHP,
          lastAttackTime: 0,
          attackCooldown: cooldownVariance,

          // SHADOW-COMPATIBLE STATS (directly transferable to shadow.baseStats)
          baseStats: {
            strength: mobStrength,
            agility: mobAgility,
            intelligence: mobIntelligence,
            vitality: mobVitality,
            luck: Math.floor(50 + mobRankIndex * 20 * (0.85 + Math.random() * 0.3)), // Luck stat
          },

          // Calculated strength value (used for extraction chance)
          strength: mobStrength, // Kept for backward compatibility with combat calculations

          // Individual variance modifiers (preserved during extraction)
          traits: {
            strengthMod: strengthVariance,
            agilityMod: agilityVariance,
            intelligenceMod: intelligenceVariance,
            vitalityMod: vitalityVariance,
            hpMod: hpVariance,
          },

          // Extraction metadata (used when converting to shadow)
          extractionData: {
            dungeonRank: dungeon.rank,
            dungeonType: dungeon.type,
            biome: dungeon.biome.name,
            beastFamilies: dungeon.beastFamilies,
            spawnedAt: Date.now(),
          },

          // Magic beast description (for display/debugging)
          description: `${mobRank}-rank ${magicBeastType.name} from ${dungeon.biome.name}`,
        };
      });

      // Batch append to activeMobs array (more efficient than individual pushes)
      dungeon.mobs.activeMobs.push(...newMobs);
      dungeon.mobs.remaining += actualSpawnCount;
      dungeon.mobs.total += actualSpawnCount;

      // NO CAPACITY CHECKS: Spawning continues until boss is defeated
      // This creates endless waves of enemies (more epic!)

      // Periodic logging every 50 waves (not spamming)
      if (!dungeon.spawnWaveCount) dungeon.spawnWaveCount = 0;
      dungeon.spawnWaveCount++;

      if (dungeon.spawnWaveCount % 50 === 0) {
        this.debugLog(
          `🌊 [${channelKey.slice(-8)}] ${dungeon.name}: Wave #${dungeon.spawnWaveCount} (${
            dungeon.mobs.total
          } total spawned)`
        );
      }
    } else {
      // Boss is dead, stop spawning
      this.stopMobSpawning(channelKey);
    }
  }

  // ============================================================================
  // USER PARTICIPATION & SELECTION
  // ============================================================================
  /**
   * Validate active dungeon status - check if dungeon still exists
   * If dungeon doesn't exist, force user out of active dungeon status
   * This prevents "already in dungeon" errors when dungeon was completed/failed/deleted
   */
  validateActiveDungeonStatus() {
    if (!this.settings.userActiveDungeon) {
      return true; // No active dungeon, status is valid
    }

    const channelKey = this.settings.userActiveDungeon;
    const dungeon = this.activeDungeons.get(channelKey);

    // Check if dungeon exists and is still active
    if (!dungeon || dungeon.completed || dungeon.failed) {
      // Dungeon doesn't exist or is completed/failed - clear active status
      this.debugLog(
        `⚠️ Active dungeon ${channelKey} no longer exists or is completed/failed. Clearing active status.`
      );

      // Clear active dungeon reference
      this.settings.userActiveDungeon = null;

      // Stop extraction if running
      this.stopContinuousExtraction(channelKey);

      // Save settings
      this.saveSettings();

      return false; // Status was invalid, now cleared
    }

    // Also check by channel ID and identifier for extra safety
    const channelInfo = this.getChannelInfo();
    if (channelInfo) {
      const currentChannelKey = `${channelInfo.guildId}_${channelInfo.channelId}`;

      // If user is in a different channel, verify the active dungeon still exists
      if (currentChannelKey !== channelKey) {
        // User is in different channel - verify active dungeon still exists
        if (!dungeon) {
          // Active dungeon doesn't exist - clear status
          this.debugLog(
            `⚠️ Active dungeon ${channelKey} not found in active dungeons. Clearing active status.`
          );
          this.settings.userActiveDungeon = null;
          this.saveSettings();
          return false;
        }
      }
    }

    return true; // Status is valid
  }

  /**
   * Find dungeon by channel ID and identifier
   * Returns dungeon if found, null otherwise
   */
  findDungeonByChannel(guildId, channelId) {
    if (!guildId || !channelId) return null;

    const targetChannelKey = `${guildId}_${channelId}`;

    // Check active dungeons (functional approach, lookup + find)
    return (
      Array.from(this.activeDungeons.entries()).find(
        ([key, d]) =>
          key === targetChannelKey || (d.channelId === channelId && d.guildId === guildId)
      )?.[1] || null
    );
  }

  async selectDungeon(channelKey) {
    // Validate active dungeon status first (clear invalid references)
    this.validateActiveDungeonStatus();

    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) {
      this.showToast('Dungeon not found', 'error');
      return;
    }

    // CRITICAL: SYNC HP/MANA FROM STATS PLUGIN IMMEDIATELY BEFORE VALIDATION
    // Ensures we have the freshest HP/Mana values (regeneration happens in Stats plugin)
    const { hpSynced, manaSynced } = this.syncHPAndManaFromStats();
    if (hpSynced || manaSynced) {
      // Immediately update UI to show fresh values
      this.updateUserHPBar();
      this.debugLog(
        `HP/Mana synced: ${this.settings.userHP}/${this.settings.userMaxHP} HP, ${this.settings.userMana}/${this.settings.userMaxMana} Mana`
      );
    }

    // Check if user has HP to join (using FRESH values)
    if (this.settings.userHP <= 0) {
      this.showToast('You need HP to join a dungeon! Wait for HP to regenerate.', 'error');
      return;
    }

    // Check if dungeon is still open
    if (dungeon.completed || dungeon.failed) {
      this.showToast('This dungeon is no longer active', 'error');
      return;
    }

    // ENFORCE ONE DUNGEON AT A TIME: Prevent joining if already in another dungeon
    // Validate again after clearing invalid references
    if (this.settings.userActiveDungeon && this.settings.userActiveDungeon !== channelKey) {
      const prevDungeon = this.activeDungeons.get(this.settings.userActiveDungeon);
      const shouldClearPrev = !prevDungeon || prevDungeon.completed || prevDungeon.failed;
      if (shouldClearPrev) {
        this.settings.userActiveDungeon = null;
        this.saveSettings();
      }
      const isPrevActive = prevDungeon && !prevDungeon.completed && !prevDungeon.failed;
      if (isPrevActive) {
        this.showToast(`Already in ${prevDungeon.name}! Complete it first.`, 'error');
        return; // BLOCKED - can't join multiple dungeons
      }
      // Previous dungeon is completed/failed, can join new one
      if (prevDungeon) {
        prevDungeon.userParticipating = false;
      }
    }

    dungeon.userParticipating = true;
    this.settings.userActiveDungeon = channelKey;

    // Restart intervals with active frequency when user joins
    this.stopShadowAttacks(channelKey);
    this.stopBossAttacks(channelKey);
    this.stopMobAttacks(channelKey);
    this.startShadowAttacks(channelKey);
    this.startBossAttacks(channelKey);
    this.startMobAttacks(channelKey);

    // Start extraction processing (only for participating dungeons)
    this.startContinuousExtraction(channelKey);

    this.updateBossHPBar(channelKey);
    this.updateUserHPBar();
    this.showToast(`Joined ${dungeon.name}!`, 'info');
    this.saveSettings();
    this.closeDungeonModal();
  }

  async processUserAttack(channelKey, messageElement = null) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;

    if (!dungeon.userParticipating) {
      await this.selectDungeon(channelKey);
    }

    // Calculate base damage using TOTAL EFFECTIVE STATS (includes all buffs)
    // Attack boss if alive
    if (dungeon.boss.hp > 0) {
      const bossStats = {
        strength: dungeon.boss.strength,
        agility: dungeon.boss.agility,
        intelligence: dungeon.boss.intelligence,
        vitality: dungeon.boss.vitality,
      };
      let userDamage = this.calculateUserDamage(bossStats, dungeon.boss.rank);

      // CHECK FOR CRITICAL HIT (integrates with CriticalHitMerged plugin)
      let isCritical = false;
      if (this.checkCriticalHit(messageElement)) {
        isCritical = true;
        // CRITICAL HIT MULTIPLIER: 2x damage!
        userDamage = Math.floor(userDamage * 2.0);
        this.debugLog(
          `🔥 CRITICAL HIT! User damage: ${Math.floor(userDamage / 2)} → ${userDamage} (2x)`
        );
      }

      await this.applyDamageToBoss(channelKey, userDamage, 'user', null, isCritical);
    } else {
      // Attack mobs
      await this.attackMobs(channelKey, 'user');
    }
  }

  // ============================================================================
  // HP/MANA SYNC HELPERS (Consolidated from redundant code)
  // ============================================================================

  /**
   * Sync HP from SoloLevelingStats plugin (pull latest values)
   * @returns {boolean} True if HP was synced
   */
  syncHPFromStats() {
    if (!this.soloLevelingStats?.settings) return false;
    if (
      typeof this.soloLevelingStats.settings.userHP === 'number' &&
      !isNaN(this.soloLevelingStats.settings.userHP)
    ) {
      this.settings.userHP = this.soloLevelingStats.settings.userHP;
      this.settings.userMaxHP = this.soloLevelingStats.settings.userMaxHP;
      return true;
    }
    return false;
  }

  /**
   * Sync Mana from SoloLevelingStats plugin (pull latest values)
   * @returns {boolean} True if Mana was synced
   */
  syncManaFromStats() {
    if (!this.soloLevelingStats?.settings) return false;
    if (
      typeof this.soloLevelingStats.settings.userMana === 'number' &&
      !isNaN(this.soloLevelingStats.settings.userMana)
    ) {
      this.settings.userMana = this.soloLevelingStats.settings.userMana;
      this.settings.userMaxMana = this.soloLevelingStats.settings.userMaxMana;
      return true;
    }
    return false;
  }

  /**
   * Sync both HP and Mana from SoloLevelingStats plugin
   * @returns {Object} { hpSynced, manaSynced }
   */
  syncHPAndManaFromStats() {
    return {
      hpSynced: this.syncHPFromStats(),
      manaSynced: this.syncManaFromStats(),
    };
  }

  /**
   * Push HP changes to SoloLevelingStats plugin and update UI
   * @param {boolean} saveImmediately - Whether to save settings immediately
   */
  pushHPToStats(saveImmediately = false) {
    if (!this.soloLevelingStats?.settings) return;
    this.soloLevelingStats.settings.userHP = this.settings.userHP;
    this.soloLevelingStats.settings.userMaxHP = this.settings.userMaxHP;

    // Update UI immediately
    if (typeof this.soloLevelingStats.updateHPManaBars === 'function') {
      this.soloLevelingStats.updateHPManaBars();
    }

    // Save if requested
    if (saveImmediately && typeof this.soloLevelingStats.saveSettings === 'function') {
      this.soloLevelingStats.saveSettings();
    }
  }

  /**
   * Push Mana changes to SoloLevelingStats plugin and update UI
   * @param {boolean} saveImmediately - Whether to save settings immediately
   */
  pushManaToStats(saveImmediately = false) {
    if (!this.soloLevelingStats?.settings) return;
    this.soloLevelingStats.settings.userMana = this.settings.userMana;
    this.soloLevelingStats.settings.userMaxMana = this.settings.userMaxMana;

    // Update UI immediately (prefer updateHPManaBars, fallback to updateUI)
    const uiUpdater = [
      this.soloLevelingStats.updateHPManaBars,
      this.soloLevelingStats.updateUI,
    ].find((fn) => typeof fn === 'function');
    uiUpdater?.call(this.soloLevelingStats);

    // Save if requested
    if (saveImmediately && typeof this.soloLevelingStats.saveSettings === 'function') {
      this.soloLevelingStats.saveSettings();
    }
  }

  /**
   * Update Stats plugin UI (HP/Mana bars)
   * Tries updateHPManaBars first, falls back to updateUI
   */
  updateStatsUI() {
    if (!this.soloLevelingStats) return;
    const uiUpdater = [
      this.soloLevelingStats.updateHPManaBars,
      this.soloLevelingStats.updateUI,
    ].find((fn) => typeof fn === 'function');
    uiUpdater?.call(this.soloLevelingStats);
  }

  // ============================================================================
  // STAT-BASED COMBAT CALCULATIONS
  // ============================================================================
  /**
   * Calculate HP from vitality stat and rank
   * Uses TOTAL EFFECTIVE STATS if SoloLevelingStats is available
   */
  async calculateHP(vitality, rank = 'E', includeShadowBonus = false) {
    const rankIndex = this.settings.dungeonRanks.indexOf(rank);
    const baseHP = 100 + vitality * 10 + rankIndex * 50;

    if (includeShadowBonus) {
      const shadowCount = await this.getShadowCount();
      const shadowArmyBonus = shadowCount * 25; // 25 HP per shadow
      return baseHP + shadowArmyBonus;
    }

    return baseHP;
  }

  /**
   * Calculate max mana from intelligence stat + shadow army size
   * Uses TOTAL EFFECTIVE STATS if SoloLevelingStats is available
   * Scales with shadow army to afford resurrections!
   */
  async calculateMana(intelligence, shadowCount = 0) {
    const baseMana = 100 + intelligence * 10;
    const shadowArmyBonus = shadowCount * 50; // 50 mana per shadow
    return baseMana + shadowArmyBonus;
  }

  /**
   * Recalculate user mana pool based on current stats and shadow count
   * Called when shadow army size changes
   */
  /**
   * Recalculate user HP pool based on current stats and shadow count
   * Called when shadow army size changes
   */
  async recalculateUserHP() {
    if (!this.soloLevelingStats) return;

    // CRITICAL: Sync HP from Stats plugin first (get latest value)
    this.syncHPFromStats();

    const totalStats = this.getUserEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const rank = this.soloLevelingStats.settings?.rank || 'E';
    await this.getShadowCount(); // Cache shadow count for HP calculation

    const _rankIndex = this.settings.dungeonRanks.indexOf(rank); // Used in calculateHP internally
    const oldMaxHP = this.settings.userMaxHP || 0;
    this.settings.userMaxHP = await this.calculateHP(vitality, rank, true);

    // If max HP increased, increase current HP proportionally
    if (this.settings.userMaxHP > oldMaxHP) {
      const hpIncrease = this.settings.userMaxHP - oldMaxHP;
      this.settings.userHP = Math.min(
        this.settings.userMaxHP,
        (this.settings.userHP || 0) + hpIncrease
      );
    }

    // CRITICAL: Push HP to Stats plugin and update UI in real-time
    this.pushHPToStats(true); // Save immediately
    this.updateStatsUI(); // Real-time UI update
    this.updateUserHPBar();
  }

  async recalculateUserMana() {
    if (!this.soloLevelingStats) return;

    // CRITICAL: Sync mana from Stats plugin first (get latest value)
    this.syncManaFromStats();

    const totalStats = this.getUserEffectiveStats();
    const intelligence = totalStats.intelligence || 0;
    const shadowCount = await this.getShadowCount();

    const oldMaxMana = this.settings.userMaxMana || 0;
    this.settings.userMaxMana = await this.calculateMana(intelligence, shadowCount);

    // If max mana increased, increase current mana proportionally
    if (this.settings.userMaxMana > oldMaxMana) {
      const manaIncrease = this.settings.userMaxMana - oldMaxMana;
      this.settings.userMana = Math.min(
        this.settings.userMaxMana,
        this.settings.userMana + manaIncrease
      );
      // Mana pool updated silently
    }

    // CRITICAL: Push Mana to Stats plugin and update UI in real-time
    this.pushManaToStats(true); // Save immediately
    this.updateStatsUI(); // Real-time UI update
    this.updateUserHPBar();
    this.saveSettings();
  }

  /**
   * Calculate mob strength from stats and rank
   * Uses ShadowArmy's method if available, otherwise calculates directly
   */
  calculateMobStrength(mobStats, mobRank) {
    if (this.shadowArmy?.calculateShadowStrength) {
      // Use ShadowArmy's calculation method
      return this.shadowArmy.calculateShadowStrength(mobStats, 1);
    }

    // Fallback calculation: sum of stats weighted by rank
    const rankIndex = this.settings.dungeonRanks.indexOf(mobRank);
    const rankMultiplier = 1.0 + rankIndex * 0.5; // E=1.0, D=1.5, SSS=4.5, etc.
    const totalStats = Object.values(mobStats).reduce((sum, val) => sum + (val || 0), 0);
    return totalStats * rankMultiplier;
  }

  // ============================================================================
  // HP/MANA REGENERATION SYSTEM
  // ============================================================================
  /**
   * Start HP/Mana regeneration interval (runs every 1 second)
   */
  startRegeneration() {
    if (this.regenInterval) {
      this.debugLog('⏰ Regeneration interval already running');
      return; // Already running
    }

    this.debugLog('⏰ Starting HP/Mana regeneration interval (every 1 second)');
    // Start HP/Mana regeneration interval
    this.regenInterval = setInterval(() => {
      this.regenerateHPAndMana();
    }, 1000); // Regenerate every 1 second
    this._intervals.add(this.regenInterval);
  }

  /**
   * Stop HP/Mana regeneration interval
   */
  stopRegeneration() {
    if (this.regenInterval) {
      clearInterval(this.regenInterval);
      this.regenInterval = null;
      // Stopped (logging removed)
    }
  }

  /**
   * Regenerate HP and Mana based on user stats and level
   *
   * HP Regeneration Formula:
   * - Base: 0.5% of max HP per second (minimum)
   * - Stat Scaling: (vitality / 50) * 0.5% additional (1% per 100 vitality)
   * - Level Scaling: (level / 10) * 0.2% additional
   *
   * Mana Regeneration Formula:
   * - Base: 0.5% of max mana per second (minimum)
   * - Stat Scaling: (intelligence / 50) * 0.5% additional (1% per 100 intelligence)
   * - Level Scaling: (level / 10) * 0.2% additional
   *
   * This function runs every 1 second via setInterval in startRegeneration()
   */
  regenerateHPAndMana() {
    if (!this.soloLevelingStats) {
      this.debugLog('Regeneration skipped: SoloLevelingStats plugin not available');
      return;
    }

    // CRITICAL: SYNC FROM STATS PLUGIN FIRST (pull latest values before regenerating)
    // SoloLevelingStats may have its own regeneration or HP changes we need to respect
    this.syncHPAndManaFromStats();

    // Get total effective stats (including buffs) and level
    const totalStats = this.getUserEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const intelligence = totalStats.intelligence || 0;
    const level = this.soloLevelingStats?.settings?.level || 1;

    // Debug logging (first run only)
    if (!this._regenDebugShown) {
      this.debugLog('🔄 Regeneration system active', {
        level,
        vitality,
        intelligence,
        currentHP: this.settings.userHP,
        maxHP: this.settings.userMaxHP,
        currentMana: this.settings.userMana,
        maxMana: this.settings.userMaxMana,
      });
      this._regenDebugShown = true;
    }

    // VALIDATION: Ensure HP/Mana values are valid numbers
    if (typeof this.settings.userHP !== 'number' || isNaN(this.settings.userHP)) {
      this.settings.userHP = this.settings.userMaxHP || 100;
    }
    if (typeof this.settings.userMana !== 'number' || isNaN(this.settings.userMana)) {
      this.settings.userMana = this.settings.userMaxMana || 100;
      const _needsInit = true; // Flag for initialization (used implicitly)
    }
    if (
      typeof this.settings.userMaxHP !== 'number' ||
      isNaN(this.settings.userMaxHP) ||
      this.settings.userMaxHP <= 0
    ) {
      this.settings.userMaxHP = 100;
      const _needsInit = true; // Flag for initialization (used implicitly)
    }
    if (
      typeof this.settings.userMaxMana !== 'number' ||
      isNaN(this.settings.userMaxMana) ||
      this.settings.userMaxMana <= 0
    ) {
      this.settings.userMaxMana = 100;
      const _needsInit = true;
    }

    // HP/Mana initialized silently if needed

    // HP regeneration: 1% of max HP per second per 100 vitality
    // Formula: (vitality / 100) * 0.01 * maxHP per second
    let hpChanged = false;
    let manaChanged = false;

    // DETECTION: Check if regeneration is needed
    const needsHPRegen = this.settings.userHP < this.settings.userMaxHP;
    const needsManaRegen = this.settings.userMana < this.settings.userMaxMana;

    // Stop regeneration if both HP and Mana are at max
    if (!needsHPRegen && !needsManaRegen) {
      // Both are full - no need to continue regeneration interval
      // Keep interval running for future regeneration needs (user might take damage)
      return;
    }

    // HP REGENERATION: Execute if HP is below max
    if (needsHPRegen) {
      // Enhanced regeneration formula with level and stat scaling
      const baseRate = 0.005; // 0.5% base regeneration
      const statRate = (vitality / 50) * 0.005; // 0.5% per 50 vitality (1% per 100)
      const levelRate = (level / 10) * 0.002; // 0.2% per 10 levels
      const totalRate = baseRate + statRate + levelRate;

      const hpRegen = Math.max(1, Math.floor(this.settings.userMaxHP * totalRate));
      const oldHP = this.settings.userHP;
      this.settings.userHP = Math.min(this.settings.userMaxHP, this.settings.userHP + hpRegen);

      // Debug: Log HP regeneration (first 3 times only)
      if (!this._hpRegenCount) this._hpRegenCount = 0;
      if (this._hpRegenCount < 3 && this.settings.userHP !== oldHP) {
        console.log(
          `[Dungeons] ❤️ HP Regen: +${hpRegen}/sec (${(totalRate * 100).toFixed(
            2
          )}% rate) | ${oldHP} → ${this.settings.userHP} / ${this.settings.userMaxHP}`
        );
        this._hpRegenCount++;
      }

      hpChanged = this.settings.userHP !== oldHP;

      // BIDIRECTIONAL SYNC: Push HP changes to SoloLevelingStats immediately
      if (hpChanged) {
        this.pushHPToStats(false); // Don't save immediately, will batch save later
      }

      // Track regeneration state (logging removed - visible in UI)
      if (!this._hpRegenActive) {
        this._hpRegenActive = true;
      }

      // Reset flag when HP becomes full
      if (this.settings.userHP >= this.settings.userMaxHP && this._hpRegenActive) {
        this._hpRegenActive = false;
      }

      // Save Dungeons settings after HP regeneration
      if (hpChanged) {
        this.saveSettings();
      }
    } else {
      // HP is already full - reset regen active flag
      this._hpRegenActive = false;
    }

    // MANA REGENERATION: Execute if Mana is below max
    if (needsManaRegen) {
      // Enhanced regeneration formula with level and stat scaling
      const baseRate = 0.005; // 0.5% base regeneration
      const statRate = (intelligence / 50) * 0.005; // 0.5% per 50 intelligence (1% per 100)
      const levelRate = (level / 10) * 0.002; // 0.2% per 10 levels
      const totalRate = baseRate + statRate + levelRate;

      const manaRegen = Math.max(1, Math.floor(this.settings.userMaxMana * totalRate));
      const oldMana = this.settings.userMana;
      this.settings.userMana = Math.min(
        this.settings.userMaxMana,
        this.settings.userMana + manaRegen
      );

      // Debug: Log Mana regeneration (first 3 times only)
      if (!this._manaRegenCount) this._manaRegenCount = 0;
      if (this._manaRegenCount < 3 && this.settings.userMana !== oldMana) {
        console.log(
          `[Dungeons] 💙 Mana Regen: +${manaRegen}/sec (${(totalRate * 100).toFixed(
            2
          )}% rate) | ${oldMana} → ${this.settings.userMana} / ${this.settings.userMaxMana}`
        );
        this._manaRegenCount++;
      }

      manaChanged = this.settings.userMana !== oldMana;

      // BIDIRECTIONAL SYNC: Push Mana changes to SoloLevelingStats immediately
      if (manaChanged) {
        this.pushManaToStats(true); // Save immediately for real-time updates
        this.updateStatsUI(); // Real-time UI update
      }

      // Track regeneration state (logging removed - visible in UI)
      if (!this._manaRegenActive) {
        this._manaRegenActive = true;
      }

      // Reset flag when Mana becomes full
      if (this.settings.userMana >= this.settings.userMaxMana && this._manaRegenActive) {
        this._manaRegenActive = false;
      }

      // Save Dungeons settings after Mana regeneration
      if (manaChanged) {
        this.saveSettings();
      }
    } else {
      // Mana is already full - reset regen active flag
      this._manaRegenActive = false;
    }

    // REAL-TIME UI UPDATE: Already handled above in pushHPToStats/pushManaToStats
    // UI is updated immediately when HP/Mana change (no need to update again here)
    if (hpChanged || manaChanged) {
      // Settings already saved above in pushHPToStats/pushManaToStats with saveImmediately=true
      // Additional periodic save not needed, but keeping for safety
      if (!this._regenCycleCount) this._regenCycleCount = 0;
      this._regenCycleCount++;
      if (this._regenCycleCount >= 10) {
        this.saveSettings();
        if (typeof this.soloLevelingStats?.saveSettings === 'function') {
          this.soloLevelingStats.saveSettings();
        }
        this._regenCycleCount = 0;
      }
    }
  }

  /**
   * Handle user defeat - remove from dungeon and stop shadow attacks
   */
  async handleUserDefeat(channelKey) {
    // CRITICAL: Sync HP from Stats plugin to get the absolute latest value
    // This prevents false defeat notifications due to stale HP values
    this.syncHPFromStats();

    // VALIDATION: Double-check HP is actually 0 before showing defeat
    if (this.settings.userHP > 0) {
      this.debugLog('DEFEAT_CHECK', 'Defeat triggered but HP > 0, ignoring', {
        userHP: this.settings.userHP,
        userMaxHP: this.settings.userMaxHP,
        channelKey,
      });
      return; // HP is not 0, don't process defeat
    }

    const dungeon = this.activeDungeons.get(channelKey);

    this.showToast('You were defeated!', 'error');

    // Remove user from current dungeon participation
    if (dungeon) {
      dungeon.userParticipating = false;
    }

    // Clear active dungeon
    this.settings.userActiveDungeon = null;

    // RELEASE CHANNEL LOCK: User defeated - free the channel
    if (this.channelLocks.has(channelKey)) {
      this.channelLocks.delete(channelKey);
    }

    // Stop all shadow attacks in ALL dungeons (shadows die when user dies)
    this.stopAllShadowAttacks();

    // Clear shadow HP from ALL dungeons (shadows disappear when user dies)
    this.activeDungeons.forEach((dungeon) => {
      dungeon.shadowHP = {};
    });

    // Clear all dead shadows tracking
    this.deadShadows.clear();

    // Show message that user can rejoin if they have HP
    this.showToast('All shadows defeated. Rejoin when HP regenerates.', 'info');

    this.updateUserHPBar();
    this.saveSettings();
  }

  /**
   * Get user stats (total effective stats including all buffs)
   * This is the main method other plugins should use to get user stats
   * @returns {Object|null} User stats object or null if plugin unavailable
   */
  getUserStats() {
    if (!this.soloLevelingStats?.settings) return null;

    return {
      stats:
        this.soloLevelingStats.getTotalEffectiveStats?.() ||
        this.soloLevelingStats.settings.stats ||
        {},
      rank: this.soloLevelingStats.settings.rank || 'E',
      level: this.soloLevelingStats.settings.level || 1,
      hp: this.soloLevelingStats.settings.userHP,
      maxHP: this.soloLevelingStats.settings.userMaxHP,
      mana: this.soloLevelingStats.settings.userMana,
      maxMana: this.soloLevelingStats.settings.userMaxMana,
    };
  }

  /**
   * Get user effective stats (with fallback pattern)
   * Helper method to avoid repeating the same pattern throughout codebase
   * @returns {Object} Stats object (never null, returns empty object if unavailable)
   */
  getUserEffectiveStats() {
    return (
      this.soloLevelingStats?.getTotalEffectiveStats?.() ||
      this.soloLevelingStats?.settings?.stats ||
      this.getUserStats()?.stats ||
      {}
    );
  }

  // ============================================================================
  // SHADOW COMBAT HELPERS
  // ============================================================================
  /**
   * Select target for a shadow using ShadowArmy selector when available, otherwise fallback.
   * @param {Object} shadow
   * @param {Object} dungeon
   * @param {Array} aliveMobs
   * @param {boolean} bossAlive
   * @returns {{targetType: 'boss'|'mob'|null, targetEnemy: Object|null}}
   */
  selectShadowTarget(shadow, dungeon, aliveMobs, bossAlive) {
    let targetType = null;
    let targetEnemy = null;
    const availableTargets = [];

    if (bossAlive) {
      availableTargets.push({
        id: 'boss',
        type: 'boss',
        hp: dungeon.boss.hp,
        rank: dungeon.boss.rank,
      });
    }
    aliveMobs.forEach((mob) => {
      availableTargets.push({
        id: mob.id || mob.name,
        type: 'mob',
        hp: mob.hp,
        rank: mob.rank,
      });
    });

    if (this.shadowArmy?.selectTargetForShadow && availableTargets.length > 0) {
      const selectedTarget = this.shadowArmy.selectTargetForShadow(shadow, availableTargets);
      if (selectedTarget) {
        if (selectedTarget.id === 'boss' && bossAlive) {
          return { targetType: 'boss', targetEnemy: dungeon.boss };
        }
        const mob = aliveMobs.find((m) => (m.id || m.name) === selectedTarget.id);
        if (mob) return { targetType: 'mob', targetEnemy: mob };
      }
    }

    if (!targetEnemy) {
      if (bossAlive && aliveMobs.length > 0) {
        const targetRoll = Math.random();
        return targetRoll < 0.7
          ? {
              targetType: 'mob',
              targetEnemy: aliveMobs[Math.floor(Math.random() * aliveMobs.length)],
            }
          : { targetType: 'boss', targetEnemy: dungeon.boss };
      }
      if (bossAlive) return { targetType: 'boss', targetEnemy: dungeon.boss };
      if (aliveMobs.length > 0) {
        return {
          targetType: 'mob',
          targetEnemy: aliveMobs[Math.floor(Math.random() * aliveMobs.length)],
        };
      }
    }

    return { targetType, targetEnemy };
  }

  /**
   * Build mob stats with ±10% variance.
   */
  buildMobStatsWithVariance(mob) {
    const mobVariance = 0.9 + Math.random() * 0.2;
    return {
      strength: Math.floor(mob.strength * mobVariance),
      agility: Math.floor(mob.agility * mobVariance),
      intelligence: Math.floor(mob.intelligence * mobVariance),
      vitality: Math.floor(mob.vitality * mobVariance),
    };
  }

  /**
   * Apply ±20% damage variance.
   */
  applyDamageVariance(baseDamage) {
    const damageVariance = 0.8 + Math.random() * 0.4; // 80% to 120%
    return Math.floor(baseDamage * damageVariance);
  }

  /**
   * Apply behavior multiplier when personality damage is not available.
   */
  applyBehaviorModifier(behavior, attackDamage) {
    const behaviorMultipliers = {
      aggressive: 1.3,
      balanced: 1.0,
      tactical: 0.85,
    };
    return Math.floor(attackDamage * (behaviorMultipliers[behavior] || 1.0));
  }

  /**
   * Calculate damage dealt by attacker to defender
   * Uses stat interactions: strength (physical), intelligence (magic), agility (crit)
   */
  calculateDamage(attackerStats, defenderStats, attackerRank, defenderRank) {
    const attackerStrength = attackerStats.strength || 0;
    const attackerAgility = attackerStats.agility || 0;
    const attackerIntelligence = attackerStats.intelligence || 0;

    // Base physical damage from strength (increased multiplier)
    let damage = 15 + attackerStrength * 3;

    // Magic damage from intelligence (increased)
    damage += attackerIntelligence * 2;

    // Rank multiplier (increased advantage)
    const attackerRankIndex = this.settings.dungeonRanks.indexOf(attackerRank);
    const defenderRankIndex = this.settings.dungeonRanks.indexOf(defenderRank);
    const rankDiff = attackerRankIndex - defenderRankIndex;

    const rankMultiplier =
      rankDiff > 0 ? 1 + rankDiff * 0.3 : rankDiff < 0 ? Math.max(0.4, 1 + rankDiff * 0.2) : 1;
    damage *= rankMultiplier;

    // Critical hit chance from agility (better scaling)
    const critChance = Math.min(40, attackerAgility * 0.3); // Max 40% crit, 0.3% per agility
    if (Math.random() * 100 < critChance) {
      damage *= 2.5; // Critical hit! (increased from 2x to 2.5x)
    }

    // Defense reduction from defender's stats (reduced effectiveness)
    const defenderStrength = defenderStats.strength || 0;
    const defenderVitality = defenderStats.vitality || 0;
    const defense = defenderStrength * 0.25 + defenderVitality * 0.15; // Reduced from 0.5 and 0.3

    // Defense reduces damage by a percentage (not flat reduction)
    const defenseReduction = Math.min(0.7, defense / (defense + 100)); // Max 70% reduction
    damage = damage * (1 - defenseReduction);

    return Math.max(1, Math.floor(damage));
  }

  /**
   * Calculate user damage to enemy
   * Uses TOTAL EFFECTIVE STATS (including title buffs and shadow buffs)
   */
  calculateUserDamage(enemyStats, enemyRank) {
    if (!this.soloLevelingStats?.settings) {
      return this.calculateDamage(
        { strength: 10, agility: 5, intelligence: 5 },
        enemyStats,
        'E',
        enemyRank
      );
    }

    // Use TOTAL EFFECTIVE STATS (base + title buffs + shadow buffs)
    const userStats =
      this.soloLevelingStats.getTotalEffectiveStats?.() ||
      this.soloLevelingStats.settings.stats ||
      {};
    const userRank = this.soloLevelingStats.settings.rank || 'E';

    return this.calculateDamage(userStats, enemyStats, userRank, enemyRank);
  }

  /**
   * Get shadow effective stats with caching (during combat)
   * Cache TTL: 500ms to balance performance and accuracy
   * @param {Object} shadow - Shadow object
   * @returns {Object} Effective stats object
   */
  getShadowEffectiveStatsCached(shadow) {
    if (!shadow || !shadow.id) return null;

    const cacheKey = `shadow_${shadow.id}`;
    const now = Date.now();

    // Check cache (500ms TTL during combat)
    if (this._shadowStatsCache && this._shadowStatsCache[cacheKey]) {
      const cached = this._shadowStatsCache[cacheKey];
      if (now - cached.timestamp < 500) {
        return cached.stats;
      }
    }

    // Calculate stats - use ShadowArmy's method if available, otherwise fallback
    let stats = {
      strength: shadow.strength || 0,
      agility: shadow.agility || 0,
      intelligence: shadow.intelligence || 0,
      vitality: shadow.vitality || 0,
      luck: shadow.luck || 0,
    };

    // Try to get effective stats from ShadowArmy plugin (NOT recursive call!)
    if (this.shadowArmy && typeof this.shadowArmy.getShadowEffectiveStats === 'function') {
      try {
        const effectiveStats = this.shadowArmy.getShadowEffectiveStats(shadow);
        if (effectiveStats) {
          stats = {
            strength: effectiveStats.strength || stats.strength,
            agility: effectiveStats.agility || stats.agility,
            intelligence: effectiveStats.intelligence || stats.intelligence,
            vitality: effectiveStats.vitality || stats.vitality,
            luck: effectiveStats.luck || stats.luck,
          };
        }
      } catch (error) {
        this.debugError('SHADOW_STATS', 'Error getting effective stats from ShadowArmy', error);
        // Fall through to fallback calculation
      }
    }

    // Fallback: calculate effective stats manually if ShadowArmy not available
    if (!this.shadowArmy || typeof this.shadowArmy.getShadowEffectiveStats !== 'function') {
      const baseStats = shadow.baseStats || {};
      const growthStats = shadow.growthStats || {};
      stats = {
        strength: (baseStats.strength || 0) + (growthStats.strength || 0) || stats.strength,
        agility: (baseStats.agility || 0) + (growthStats.agility || 0) || stats.agility,
        intelligence:
          (baseStats.intelligence || 0) + (growthStats.intelligence || 0) || stats.intelligence,
        vitality: (baseStats.vitality || 0) + (growthStats.vitality || 0) || stats.vitality,
        luck: (baseStats.luck || 0) + (growthStats.luck || 0) || stats.luck,
      };
    }

    // Cache result
    if (!this._shadowStatsCache) this._shadowStatsCache = {};
    this._shadowStatsCache[cacheKey] = { stats, timestamp: now };

    return stats;
  }

  /**
   * Calculate shadow damage to enemy
   * Uses EFFECTIVE STATS (base + growth stats) from ShadowArmy plugin if available
   * @param {Object} shadow - Shadow object
   * @param {Object} enemyStats - Enemy stats object
   * @param {string} enemyRank - Enemy rank
   * @returns {number} Calculated damage
   */
  calculateShadowDamage(shadow, enemyStats, enemyRank) {
    if (!shadow) return 0;

    // Get effective stats (cached during combat)
    const shadowStats = this.getShadowEffectiveStatsCached(shadow);

    const shadowRank = shadow.rank || 'E';

    let damage = this.calculateDamage(shadowStats, enemyStats, shadowRank, enemyRank);

    // Apply role-based damage multiplier
    damage = this.applyRoleDamageMultiplier(shadow.role, damage);

    return Math.max(1, Math.floor(damage));
  }

  /**
   * Calculate enemy (boss/mob) damage to target
   */
  calculateEnemyDamage(enemyStats, targetStats, enemyRank, targetRank) {
    return this.calculateDamage(enemyStats, targetStats, enemyRank, targetRank);
  }

  // ============================================================================
  // SHADOW ARMY ATTACKS WITH DEATH SYSTEM
  // ============================================================================

  /**
   * Pre-split shadow army across active dungeons (OPTIMIZATION)
   * Called once when dungeon state changes, cached for reuse
   * Eliminates recalculating splits on every attack tick (3s interval)
   */
  async preSplitShadowArmy(forceRecalculate = false) {
    // Check cache validity (1 minute TTL) - unless forced
    if (
      !forceRecalculate &&
      this.allocationCache &&
      this.allocationCacheTime &&
      Date.now() - this.allocationCacheTime < this.allocationCacheTTL
    ) {
      return; // Cache still valid
    }

    const allShadows = await this.getAllShadows();
    if (!allShadows || allShadows.length === 0) {
      this.shadowAllocations.clear();
      return;
    }

    // Get active dungeons
    const activeDungeonsList = Array.from(this.activeDungeons.values()).filter(
      (d) => !d.completed && !d.failed && d.boss.hp > 0
    );

    if (activeDungeonsList.length === 0) {
      this.shadowAllocations.clear();
      return;
    }

    // Calculate weights for each dungeon (higher rank = more shadows)
    const dungeonWeights = activeDungeonsList.map((d) => {
      const rankIndex = this.settings.dungeonRanks.indexOf(d.rank);
      return { dungeon: d, weight: rankIndex + 1, channelKey: d.channelKey };
    });

    const totalWeight = dungeonWeights.reduce((sum, dw) => sum + dw.weight, 0);

    // Pre-allocate shadows to each dungeon (async for personality index queries)
    for (const dw of dungeonWeights) {
      const shadowPortion = (dw.weight / totalWeight) * allShadows.length;
      const assignedCount = Math.max(1, Math.floor(shadowPortion));

      // Filter appropriate shadows (within ±2 ranks of dungeon)
      const dungeonRankIndex = this.settings.dungeonRanks.indexOf(dw.dungeon.rank);
      const shadowRanks = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'Monarch'];

      let appropriateShadows = allShadows.filter((s) => {
        const shadowRankIndex = shadowRanks.indexOf(s.rank);
        const rankDiff = Math.abs(shadowRankIndex - dungeonRankIndex);
        return rankDiff <= 2;
      });

      // Use personality index for fast filtering if available and need more shadows
      if (this.shadowArmy && appropriateShadows.length < assignedCount) {
        try {
          // Try to get aggressive/berserker shadows using personality index
          const preferredPersonalities = ['aggressive', 'berserker', 'assassin'];
          for (const personality of preferredPersonalities) {
            if (this.shadowArmy.getShadowsByPersonality) {
              const personalityShadows = await this.shadowArmy.getShadowsByPersonality(personality);
              const filtered = personalityShadows.filter((s) => {
                const shadowRankIndex = shadowRanks.indexOf(s.rank);
                const rankDiff = Math.abs(shadowRankIndex - dungeonRankIndex);
                const existingIds = new Set(
                  appropriateShadows.map((existing) => existing.id || existing.i)
                );
                return rankDiff <= 2 && !existingIds.has(s.id || s.i);
              });
              appropriateShadows = [...appropriateShadows, ...filtered];
              if (appropriateShadows.length >= assignedCount) break;
            }
          }
        } catch (error) {
          this.debugError('ALLOCATION', 'Failed to use personality index, using fallback', error);
        }
      }

      const shadowPool =
        appropriateShadows.length >= assignedCount ? appropriateShadows : allShadows;
      const assigned = shadowPool.slice(0, assignedCount);

      // Cache assignment for this dungeon
      this.shadowAllocations.set(dw.channelKey, assigned);
    }

    // Update cache
    this.allocationCache = allShadows;
    this.allocationCacheTime = Date.now();
  }

  // ============================================================================
  // SHADOW ATTACK SYSTEM
  // ============================================================================

  /**
   * Start shadow attacks for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  async startShadowAttacks(channelKey) {
    if (this.shadowAttackIntervals.has(channelKey)) return;

    // PERFORMANCE: Different intervals for active vs background dungeons
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;

    // CRITICAL: Initialize shadow HP BEFORE starting combat
    // This ensures all shadows have HP initialized before they start attacking
    const assignedShadows = dungeon.shadowAllocation?.shadows || [];
    if (assignedShadows.length > 0) {
      const shadowHP = dungeon.shadowHP || {};
      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      const shadowsToInitialize = assignedShadows.filter((shadow) => !deadShadows.has(shadow.id));

      await Promise.all(
        shadowsToInitialize.map(async (shadow) => {
          try {
            // Initialize HP using helper function
            const hpData = await this.initializeShadowHP(shadow, shadowHP);

            // Validate HP was set correctly
            if (!hpData || !hpData.hp || hpData.hp <= 0) {
              this.debugError('SHADOW_HP', `HP initialization failed for shadow ${shadow.id}`, {
                hpData,
                shadowId: shadow.id,
              });
            }
          } catch (error) {
            this.debugError(
              'SHADOW_INIT',
              `Failed to initialize shadow ${shadow.id} before combat`,
              error
            );
          }
        })
      );

      // Save initialized HP to dungeon
      dungeon.shadowHP = shadowHP;
    }

    const isActiveDungeon = this.isActiveDungeon(channelKey);

    // PERSONALITY-BASED INTERVALS: Use average personality interval for active dungeons
    // Active: Dynamic based on shadow personalities (average ~2000ms), Background: 15-20s
    let activeInterval = 3000; // Default fallback
    if (this.shadowArmy && dungeon) {
      // Calculate average attack interval from assigned shadows
      const assignedShadows = this.shadowAllocations.get(channelKey) || [];
      if (assignedShadows.length > 0) {
        const intervals = assignedShadows
          .map((shadow) => {
            if (this.shadowArmy.calculateShadowAttackInterval) {
              return this.shadowArmy.calculateShadowAttackInterval(shadow, 2000);
            }
            return 2000; // Default
          })
          .filter((i) => i > 0);
        if (intervals.length > 0) {
          // Use average interval (rounded to nearest 100ms for performance)
          activeInterval =
            Math.round(intervals.reduce((sum, i) => sum + i, 0) / intervals.length / 100) * 100;
          activeInterval = Math.max(1000, Math.min(5000, activeInterval)); // Clamp 1-5s
        }
      }
    }
    const backgroundInterval = 15000 + Math.random() * 5000; // 15-20s
    const intervalTime = isActiveDungeon ? activeInterval : backgroundInterval;

    // Initialize last processing time
    this._lastShadowAttackTime.set(channelKey, Date.now());

    const interval = setInterval(async () => {
      // Only process if dungeon is still active
      const currentDungeon = this.activeDungeons.get(channelKey);
      if (!currentDungeon || currentDungeon.completed || currentDungeon.failed) {
        this.stopShadowAttacks(channelKey);
        return;
      }

      const now = Date.now();
      const lastTime = this._lastShadowAttackTime.get(channelKey) || now;
      const elapsed = now - lastTime;

      // Calculate cycles to process (for background dungeons)
      const currentIsActive = this.isActiveDungeon(channelKey);
      const cyclesToProcess = currentIsActive
        ? 1
        : Math.max(1, Math.floor(elapsed / activeInterval));

      // Single batch calculation - processes cyclesToProcess worth of time in one go
      await this.processShadowAttacks(channelKey, cyclesToProcess);

      // Update last processing time
      this._lastShadowAttackTime.set(channelKey, now);

      // Only update HP bar for active dungeons (throttled)
      if (currentIsActive) {
        this.queueHPBarUpdate(channelKey);
      }
    }, intervalTime);

    this.shadowAttackIntervals.set(channelKey, interval);
  }

  /**
   * Stop shadow attacks for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  stopShadowAttacks(channelKey) {
    const interval = this.shadowAttackIntervals.get(channelKey);
    if (interval) {
      clearInterval(interval);
      this.shadowAttackIntervals.delete(channelKey);
    }
  }

  /**
   * Stop all shadow attack intervals
   */
  stopAllShadowAttacks() {
    this.shadowAttackIntervals.forEach((interval) => clearInterval(interval));
    this.shadowAttackIntervals.clear();
  }

  startBossAttacks(channelKey) {
    if (this.bossAttackTimers.has(channelKey)) return;

    // PERFORMANCE: Different intervals for active vs background dungeons
    const isActiveDungeon = this.isActiveDungeon(channelKey);

    // Active: 1s, Background: 15-20s (randomized for variance)
    const activeInterval = 1000;
    const backgroundInterval = 15000 + Math.random() * 5000; // 15-20s
    const intervalTime = isActiveDungeon ? activeInterval : backgroundInterval;

    // Initialize last processing time
    this._lastBossAttackTime.set(channelKey, Date.now());

    const timer = setInterval(async () => {
      // Only process if dungeon is still active
      const dungeon = this.activeDungeons.get(channelKey);
      if (!dungeon || dungeon.completed || dungeon.failed || dungeon.boss.hp <= 0) {
        this.stopBossAttacks(channelKey);
        return;
      }

      const now = Date.now();
      const lastTime = this._lastBossAttackTime.get(channelKey) || now;
      const elapsed = now - lastTime;

      // Calculate cycles to process (for background dungeons)
      const currentIsActive = this.isActiveDungeon(channelKey);
      const cyclesToProcess = currentIsActive
        ? 1
        : Math.max(1, Math.floor(elapsed / activeInterval));

      // Single batch calculation - processes cyclesToProcess worth of time in one go
      await this.processBossAttacks(channelKey, cyclesToProcess);

      // Update last processing time
      this._lastBossAttackTime.set(channelKey, now);
    }, intervalTime);

    this.bossAttackTimers.set(channelKey, timer);
  }

  /**
   * Stop boss attacks for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  stopBossAttacks(channelKey) {
    const timer = this.bossAttackTimers.get(channelKey);
    if (timer) {
      clearInterval(timer);
      this.bossAttackTimers.delete(channelKey);
    }
  }

  /**
   * Stop all boss attack timers
   */
  stopAllBossAttacks() {
    this.bossAttackTimers.forEach((timer) => clearInterval(timer));
    this.bossAttackTimers.clear();
  }

  // ============================================================================
  // MOB ATTACK SYSTEM
  // ============================================================================

  /**
   * Start mob attacks for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  startMobAttacks(channelKey) {
    if (this.mobAttackTimers.has(channelKey)) return;

    // PERFORMANCE: Different intervals for active vs background dungeons
    const isActiveDungeon = this.isActiveDungeon(channelKey);

    // Active: 1s, Background: 15-20s (randomized for variance)
    const activeInterval = 1000;
    const backgroundInterval = 15000 + Math.random() * 5000; // 15-20s
    const intervalTime = isActiveDungeon ? activeInterval : backgroundInterval;

    // Initialize last processing time
    this._lastMobAttackTime.set(channelKey, Date.now());

    const timer = setInterval(async () => {
      // Only process if dungeon is still active
      const dungeon = this.activeDungeons.get(channelKey);
      if (!dungeon || dungeon.completed || dungeon.failed) {
        this.stopMobAttacks(channelKey);
        return;
      }

      const now = Date.now();
      const lastTime = this._lastMobAttackTime.get(channelKey) || now;
      const elapsed = now - lastTime;

      // Calculate cycles to process (for background dungeons)
      const currentIsActive = this.isActiveDungeon(channelKey);
      const cyclesToProcess = currentIsActive
        ? 1
        : Math.max(1, Math.floor(elapsed / activeInterval));

      // Single batch calculation - processes cyclesToProcess worth of time in one go
      await this.processMobAttacks(channelKey, cyclesToProcess);

      // Update last processing time
      this._lastMobAttackTime.set(channelKey, now);
    }, intervalTime);

    this.mobAttackTimers.set(channelKey, timer);
  }

  /**
   * Stop mob attacks for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  stopMobAttacks(channelKey) {
    const timer = this.mobAttackTimers.get(channelKey);
    if (timer) {
      clearInterval(timer);
      this.mobAttackTimers.delete(channelKey);
    }
  }

  /**
   * Stop all mob attack timers
   */
  stopAllMobAttacks() {
    this.mobAttackTimers.forEach((timer) => clearInterval(timer));
    this.mobAttackTimers.clear();
  }

  // ============================================================================
  // COMBAT SYSTEM - Shadow Attacks (Dynamic & Chaotic)
  // ============================================================================
  async processShadowAttacks(channelKey, cyclesMultiplier = 1) {
    // CRITICAL: Sync HP/Mana from Stats plugin FIRST (get freshest values)
    // This ensures we're using the latest HP/Mana including regeneration
    this.syncHPAndManaFromStats();

    // Validate active dungeon status periodically
    if (Math.random() < 0.1) {
      // 10% chance to validate (reduces overhead)
      this.validateActiveDungeonStatus();
    }

    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed) {
      this.stopShadowAttacks(channelKey);
      // If this was the active dungeon, clear active status
      if (this.settings.userActiveDungeon === channelKey) {
        this.settings.userActiveDungeon = null;
        this.saveSettings();
      }
      return;
    }

    // Stop attacking if boss is already dead (0 HP)
    if (dungeon.boss.hp <= 0 && dungeon.mobs.activeMobs.length === 0) {
      this.stopShadowAttacks(channelKey);
      return;
    }

    if (!this.shadowArmy) {
      return;
    }

    try {
      // OPTIMIZATION: Use pre-split shadow allocations (cached)
      // DYNAMIC DEPLOYMENT: Reallocate shadows if cache expired OR if this dungeon has no shadows
      // This ensures shadows are deployed even when dungeons spawn midway
      const hasAllocation =
        this.shadowAllocations.has(channelKey) &&
        this.shadowAllocations.get(channelKey)?.length > 0;
      const cacheExpired =
        !this.allocationCache ||
        !this.allocationCacheTime ||
        Date.now() - this.allocationCacheTime >= this.allocationCacheTTL;

      if (cacheExpired || !hasAllocation) {
        // Force reallocation to ensure this dungeon gets shadows dynamically
        await this.preSplitShadowArmy(true);
      }

      // Get pre-allocated shadows for this dungeon
      const assignedShadows = this.shadowAllocations.get(channelKey);
      if (!assignedShadows || assignedShadows.length === 0) {
        // No shadows allocated to this dungeon (might be cleared or no shadows available)
        // No shadows allocated - skip processing
        return;
      }

      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      const shadowHP = dungeon.shadowHP || {}; // Object, not Map

      // Initialize shadow combat data if not exists
      // Each shadow has individual cooldowns and behaviors for chaotic combat
      if (!dungeon.shadowCombatData) {
        dungeon.shadowCombatData = {};
      }

      // OPTIMIZATION: Batch initialize shadow HP and combat data using helper functions
      // CRITICAL: Initialize ALL assigned shadows (not just combat-ready ones)
      // getCombatReadyShadows filters out shadows without HP, which prevents initialization
      const shadowsToInitialize = assignedShadows.filter((shadow) => !deadShadows.has(shadow.id));

      await Promise.all(
        shadowsToInitialize.map(async (shadow) => {
          try {
            // Initialize HP using helper function
            const hpData = await this.initializeShadowHP(shadow, shadowHP);

            // Validate HP was set correctly
            if (!hpData || !hpData.hp || hpData.hp <= 0) {
              this.debugError('SHADOW_HP', `HP initialization failed for shadow ${shadow.id}`, {
                hpData,
                shadowId: shadow.id,
              });
            }

            // Initialize combat data using helper function
            if (!dungeon.shadowCombatData[shadow.id]) {
              dungeon.shadowCombatData[shadow.id] = this.initializeShadowCombatData(
                shadow,
                dungeon
              );
            }
          } catch (error) {
            this.debugError('SHADOW_INIT', `Failed to initialize shadow ${shadow.id}`, error);
          }
        })
      );
      // Atomic update: create new object reference to prevent race conditions
      // eslint-disable-next-line require-atomic-updates
      dungeon.shadowHP = { ...shadowHP };

      // Count alive shadows for combat readiness check
      const aliveShadowCount = assignedShadows.filter(
        (s) => !deadShadows.has(s.id) && shadowHP[s.id]?.hp > 0
      ).length;

      // Shadow deployment status tracked internally (debug logs removed for performance)

      // Log combat readiness (ONCE per critical threshold to prevent spam)
      if (aliveShadowCount < assignedShadows.length * 0.25 && !dungeon.criticalHPWarningShown) {
        dungeon.criticalHPWarningShown = true;
        this.debugLog(
          `⚠️ CRITICAL: Only ${aliveShadowCount}/${
            assignedShadows.length
          } shadows alive (${Math.floor((aliveShadowCount / assignedShadows.length) * 100)}%)!`
        );
      }

      // Prepare target stats
      const bossStats = {
        strength: dungeon.boss.strength,
        agility: dungeon.boss.agility,
        intelligence: dungeon.boss.intelligence,
        vitality: dungeon.boss.vitality,
      };

      // PERFORMANCE: Limit to first 3000 alive mobs (maximum efficiency with memory cap)
      const aliveMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0).slice(0, 3000); // Process up to 3000 mobs per cycle
      const bossAlive = dungeon.boss.hp > 0;

      // Combat tracking (for completion analytics)
      if (!dungeon.combatAnalytics) {
        dungeon.combatAnalytics = {
          totalBossDamage: 0,
          totalMobDamage: 0,
          shadowsAttackedBoss: 0,
          shadowsAttackedMobs: 0,
          mobsKilledThisWave: 0,
        };
      }
      const analytics = dungeon.combatAnalytics;
      const now = Date.now();

      // BATCH PROCESSING: Calculate attacks for cyclesToProcess cycles in one calculation
      // For background dungeons, this processes 15-20 cycles worth of attacks at once
      const activeInterval = 3000; // Shadow attacks happen every 3 seconds
      const totalTimeSpan = cyclesMultiplier * activeInterval; // Total time being processed

      // DYNAMIC CHAOTIC COMBAT: Each shadow independently chooses target (70% mobs, 30% boss)
      // OPTIMIZATION: Use getCombatReadyShadows helper for attack loop (after initialization)
      const combatReadyShadows = this.getCombatReadyShadows(assignedShadows, deadShadows, shadowHP);

      for (const shadow of combatReadyShadows) {
        // Guard clause: Ensure shadow exists and has valid ID
        if (!shadow || !shadow.id) {
          continue; // Skip invalid shadow
        }

        const shadowHPData = shadowHP[shadow.id];
        // Double-check HP (should already be filtered by getCombatReadyShadows, but safety check)
        if (!shadowHPData || shadowHPData.hp <= 0) {
          deadShadows.add(shadow.id);
          continue; // Skip this shadow, continue to next
        }

        const combatData = dungeon.shadowCombatData[shadow.id];
        if (!combatData) {
          // Initialize combat data if missing
          dungeon.shadowCombatData[shadow.id] = {
            lastAttackTime: Date.now() - 2000, // Allow immediate attack
            attackInterval: 2000,
            personality: 'balanced',
            attackCount: 0,
            damageDealt: 0,
          };
          // Continue with initialized data
        }

        const finalCombatData = dungeon.shadowCombatData[shadow.id];

        // Calculate how many attacks this shadow would make in the time span
        // Account for individual attack interval (personality-based)
        const timeSinceLastAttack = now - finalCombatData.lastAttackTime;
        // Use personality-based interval if available, otherwise fallback to cooldown
        const effectiveInterval =
          finalCombatData.attackInterval || finalCombatData.cooldown || 2000;
        const effectiveCooldown = Math.max(effectiveInterval, 800); // Min 800ms cooldown

        // Calculate attacks: if shadow is on cooldown (negative timeSinceLastAttack),
        // wait until cooldown expires, then calculate remaining attacks
        let attacksInSpan = 0;
        if (timeSinceLastAttack < 0) {
          // Shadow is on cooldown (lastAttackTime is in the future)
          // Calculate how much time remains in cooldown
          const remainingCooldown = Math.abs(timeSinceLastAttack);
          if (remainingCooldown < totalTimeSpan) {
            // Cooldown expires during this time span, calculate remaining attacks
            const availableTime = totalTimeSpan - remainingCooldown;
            attacksInSpan = Math.max(0, Math.floor(availableTime / effectiveCooldown));
          }
          // If remainingCooldown >= totalTimeSpan, shadow is still on cooldown for entire span
        } else {
          // Shadow is ready (or overdue), calculate attacks for the full time span
          // Add any overdue time to the time span for more attacks
          attacksInSpan = Math.max(
            0,
            Math.floor((totalTimeSpan + timeSinceLastAttack) / effectiveCooldown)
          );
        }

        if (attacksInSpan <= 0) {
          continue; // Shadow not ready yet, continue to next shadow
        }

        // Process batch attacks with variance applied to each virtual attack
        let totalBossDamage = 0;
        let totalMobDamage = 0;
        const _mobsKilled = 0; // Tracked in analytics.mobsKilledThisWave
        const mobDamageMap = new Map(); // Track damage per mob for variance

        for (let attackIndex = 0; attackIndex < attacksInSpan; attackIndex++) {
          // PERSONALITY-BASED TARGET SELECTION: Use ShadowArmy's smart targeting
          // Prepare available targets for personality-based selection
          const availableTargets = [];
          if (bossAlive) {
            availableTargets.push({
              id: 'boss',
              type: 'boss',
              hp: dungeon.boss.hp,
              rank: dungeon.boss.rank,
            });
          }
          aliveMobs.forEach((mob) => {
            availableTargets.push({
              id: mob.id || mob.name,
              type: 'mob',
              hp: mob.hp,
              rank: mob.rank,
            });
          });

          const { targetType, targetEnemy } = this.selectShadowTarget(
            shadow,
            dungeon,
            aliveMobs,
            bossAlive
          );
          if (!targetEnemy) {
            // No targets available - skip this attack iteration
            continue;
          }

          // Create comprehensive combat data using ShadowArmy's stored info
          // Includes shadow personality, attack interval, and target data (boss/mob)
          let combatData = null;
          if (this.shadowArmy?.createCombatData) {
            const targetForCombat =
              targetType === 'boss'
                ? { ...dungeon.boss, type: 'boss', id: 'boss' }
                : { ...targetEnemy, type: 'mob' };
            combatData = this.shadowArmy.createCombatData(shadow, targetForCombat, dungeon);
          }

          // Calculate base damage using ShadowArmy's stored combat data if available
          let baseDamage;
          if (this.shadowArmy?.calculateShadowDamage && combatData) {
            // Use ShadowArmy's damage calculation with stored personality
            baseDamage = this.shadowArmy.calculateShadowDamage(shadow, {
              type: targetType,
              rank: targetEnemy.rank,
              strength: targetType === 'boss' ? bossStats.strength : targetEnemy.strength,
            });
          } else {
            // Fallback to Dungeons calculation
            if (targetType === 'boss') {
              baseDamage = this.calculateShadowDamage(shadow, bossStats, dungeon.boss.rank);
            } else {
              const mobStats = this.buildMobStatsWithVariance(targetEnemy);
              baseDamage = this.calculateShadowDamage(shadow, mobStats, targetEnemy.rank);
            }
          }

          // Apply damage variance (±20%) for each attack
          let attackDamage = this.applyDamageVariance(baseDamage);

          // Personality-based damage modifiers (use ShadowArmy if available)
          if (this.shadowArmy?.calculateShadowDamage && targetEnemy) {
            // Use ShadowArmy's personality-based damage calculation
            const personalityDamage = this.shadowArmy.calculateShadowDamage(shadow, {
              type: targetType,
              rank: targetEnemy.rank,
              strength: targetType === 'boss' ? bossStats.strength : targetEnemy.strength,
            });
            attackDamage = personalityDamage || attackDamage; // Use personality damage if available
          } else {
            // Fallback behavior modifier (if available)
            attackDamage = finalCombatData.behavior
              ? this.applyBehaviorModifier(finalCombatData.behavior, attackDamage)
              : attackDamage;
          }

          // Accumulate damage
          if (targetType === 'boss') {
            totalBossDamage += attackDamage;
            analytics.shadowsAttackedBoss++;
          } else {
            const mobId = targetEnemy.id || targetEnemy.name;
            const currentDamage = mobDamageMap.get(mobId) || 0;
            mobDamageMap.set(mobId, currentDamage + attackDamage);
            analytics.shadowsAttackedMobs++;
          }
        }

        // Apply accumulated damage
        if (totalBossDamage > 0) {
          // Guard clause: Ensure shadow still exists
          if (!shadow || !shadow.id) {
            this.debugError(
              'SHADOW_ATTACKS',
              'Shadow became invalid before boss damage application',
              {
                totalBossDamage,
              }
            );
          } else {
            this.debugLog(
              'SHADOW_ATTACKS',
              `Shadow ${shadow.id} dealt ${totalBossDamage} damage to boss`,
              {
                shadowId: shadow.id,
                bossHP: dungeon.boss.hp,
                damage: totalBossDamage,
              }
            );
            await this.applyDamageToBoss(channelKey, totalBossDamage, 'shadow', shadow.id);
            analytics.totalBossDamage += totalBossDamage;

            // Initialize shadow contribution if needed (lookup pattern)
            if (!dungeon.shadowContributions || typeof dungeon.shadowContributions !== 'object') {
              dungeon.shadowContributions = {};
            }
            if (!dungeon.shadowContributions[shadow.id]) {
              dungeon.shadowContributions[shadow.id] = {
                mobsKilled: 0,
                bossDamage: 0,
              };
            }
            dungeon.shadowContributions[shadow.id].bossDamage += totalBossDamage;
          }
        }

        // OPTIMIZATION: Apply mob damage using batch helper function
        if (mobDamageMap.size > 0) {
          this.debugLog(
            'SHADOW_ATTACKS',
            `Shadow ${shadow.id} attacking ${mobDamageMap.size} mobs`,
            {
              shadowId: shadow.id,
              mobsTargeted: Array.from(mobDamageMap.keys()),
            }
          );

          // Use batch damage application helper
          const mobDamageResult = this.batchApplyDamage(mobDamageMap, aliveMobs, (mob, damage) => {
            mob.hp = Math.max(0, mob.hp - damage);
          });

          totalMobDamage += mobDamageResult.totalDamage;
          const _mobsKilled = mobDamageResult.targetsKilled; // Tracked in analytics

          // Process killed mobs (XP, extraction, notifications)
          Array.from(mobDamageMap.keys()).forEach((mobId) => {
            const mob = aliveMobs.find((m) => (m.id || m.name) === mobId);
            if (!mob || mob.hp > 0) return; // Only process dead mobs

            // Guard clause: Ensure shadow still exists and is valid
            if (!shadow || !shadow.id) {
              return; // Skip this mob kill processing
            }

            analytics.mobsKilledThisWave++;
            dungeon.mobs.killed += 1;
            dungeon.mobs.remaining = Math.max(0, dungeon.mobs.remaining - 1);

            // Initialize shadow contribution if needed (lookup pattern)
            // Use nullish coalescing to handle both null and undefined
            if (!dungeon.shadowContributions || typeof dungeon.shadowContributions !== 'object') {
              dungeon.shadowContributions = {};
            }
            // Ensure shadow contribution object exists before accessing
            if (!dungeon.shadowContributions[shadow.id]) {
              dungeon.shadowContributions[shadow.id] = {
                mobsKilled: 0,
                bossDamage: 0,
              };
            }
            dungeon.shadowContributions[shadow.id].mobsKilled += 1;

            // Initialize notification tracking if needed (lookup pattern)
            if (!this.settings.mobKillNotifications) {
              this.settings.mobKillNotifications = {};
            }
            this.settings.mobKillNotifications[channelKey] = this.settings.mobKillNotifications[
              channelKey
            ] || {
              count: 0,
              lastNotification: Date.now(),
            };
            this.settings.mobKillNotifications[channelKey].count += 1;

            // Grant user XP from mob kills
            this.soloLevelingStats?.addXP?.(
              this.calculateMobXP(mob.rank, dungeon.userParticipating)
            );

            // IMMEDIATE EXTRACTION: Extract right away (only if participating)
            dungeon.userParticipating && this.extractImmediately(channelKey, mob);
          });
        }

        analytics.totalMobDamage += totalMobDamage;

        // Update combat data (use finalCombatData since we may have initialized it)
        const combatDataToUpdate = dungeon.shadowCombatData[shadow.id];
        combatDataToUpdate.attackCount += attacksInSpan;
        combatDataToUpdate.damageDealt += totalBossDamage + totalMobDamage;

        // Calculate actual time spent based on attacks (functional approach)
        // Each attack takes effectiveCooldown time, with variance
        let actualTimeSpent = 0;
        if (timeSinceLastAttack < 0) {
          // Shadow was on cooldown, add remaining cooldown time
          actualTimeSpent = Math.abs(timeSinceLastAttack);
        }
        // Add time for each attack
        actualTimeSpent += Array.from({ length: attacksInSpan }, () => {
          const cooldownVariance = 0.9 + Math.random() * 0.2; // ±10%
          return effectiveCooldown * cooldownVariance;
        }).reduce((sum, time) => sum + time, 0);
        // Cap at totalTimeSpan to prevent time travel
        // Set lastAttackTime to current time + actual time spent (but don't exceed totalTimeSpan)
        combatDataToUpdate.lastAttackTime = now + Math.min(actualTimeSpent, totalTimeSpan);

        // Update attack interval for next batch (recalculate personality-based interval)
        if (this.shadowArmy?.calculateShadowAttackInterval) {
          // Recalculate personality-based interval (may vary slightly)
          const newInterval = this.shadowArmy.calculateShadowAttackInterval(shadow, 2000);
          combatData.attackInterval = newInterval;
        } else {
          // Fallback: Vary cooldown for next batch
          const cooldownVariance = 0.9 + Math.random() * 0.2;
          combatData.cooldown = Math.max(
            800,
            Math.floor((combatData.cooldown || 2000) * cooldownVariance)
          );
        }

        dungeon.shadowAttacks[shadow.id] = now + totalTimeSpan;
      }

      // EXTRACTION: Dead mobs already processed by extractImmediately() calls above
      // No queue system needed - single attempt only for performance (prevents queue buildup)
      // processImmediateBatch() handles all extraction attempts and cleanup

      // AGGRESSIVE CLEANUP: Remove dead mobs (extraction already attempted via immediate system)
      // Keep only alive mobs (dead mobs processed and removed by processImmediateBatch)
      if (!dungeon.userParticipating) {
        // Not participating: clean up all dead mobs immediately
        dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0);
      }
      // If participating: processImmediateBatch() handles cleanup, so just keep alive mobs here
      dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0);

      // AGGRESSIVE MEMORY OPTIMIZATION: Remove oldest if exceeding capacity
      if (dungeon.mobs.activeMobs.length > 3000) {
        dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.slice(500);
      }

      // Attack logs removed - check dungeon completion summary for stats

      // Process boss attacks on shadows (with cycles multiplier)
      await this.processBossAttacks(channelKey, cyclesMultiplier);

      // Process mob attacks on shadows (with cycles multiplier)
      await this.processMobAttacks(channelKey, cyclesMultiplier);

      // REAL-TIME UPDATE: Update boss HP bar after all combat processing
      // This ensures HP and mob counts are displayed correctly in real-time
      this.updateBossHPBar(channelKey);

      this.deadShadows.set(channelKey, deadShadows);
    } catch (error) {
      this.errorLog('Error processing shadow attacks', error);
    }
  }

  /**
   * Get all shadows with caching during combat
   * Cache TTL: 1 second during active combat to reduce I/O
   * @param {boolean} useCache - Whether to use cache (default: true)
   * @returns {Promise<Array>} Array of shadow objects
   */
  async getAllShadows(useCache = true) {
    // Use cache during active combat (1 second TTL)
    if (useCache && this._shadowsCache) {
      const now = Date.now();
      if (now - this._shadowsCache.timestamp < 1000) {
        return this._shadowsCache.shadows;
      }
    }

    if (!this.shadowArmy) return [];
    try {
      const shadows =
        (await this.shadowArmy.storageManager?.getShadows?.({}, 0, 10000)) ||
        this.shadowArmy.settings?.shadows ||
        [];

      // HYBRID COMPRESSION SUPPORT: Decompress compressed shadows transparently
      // This ensures combat calculations work correctly regardless of compression
      let decompressed = shadows;
      if (shadows.length > 0 && this.shadowArmy.getShadowData) {
        decompressed = shadows.map((s) => this.shadowArmy.getShadowData(s));
      }

      // Cache result
      this._shadowsCache = { shadows: decompressed, timestamp: Date.now() };
      return decompressed;
    } catch (error) {
      this.errorLog('Error getting all shadows', error);
      return [];
    }
  }

  /**
   * Invalidate shadows cache
   * Called when shadows change (e.g., after extraction, level up, etc.)
   */
  invalidateShadowsCache() {
    this._shadowsCache = null;
  }

  /**
   * Get baseline stats for a given rank (exponential scaling)
   * Used for shadow rank-up calculations
   */
  getBaselineStats(rank) {
    return this.baselineStats[rank] || this.baselineStats['E'];
  }

  // ============================================================================
  // COMBAT DATA HELPER FUNCTIONS (Performance Optimization)
  // ============================================================================

  /**
   * Initialize shadow combat data using ShadowArmy's stored data (batch optimized)
   * @param {Object} shadow - Shadow object
   * @param {Object} dungeon - Dungeon object
   * @returns {Object} - Initialized combat data
   */
  initializeShadowCombatData(shadow, dungeon) {
    // Get shadow personality from ShadowArmy (uses stored data if available)
    let personality = 'balanced';
    let attackInterval = 2000; // Base interval
    let effectiveStats = null;

    if (this.shadowArmy) {
      // Get personality (now uses stored data from ShadowArmy)
      if (this.shadowArmy.getShadowPersonality) {
        const personalityObj = this.shadowArmy.getShadowPersonality(shadow);
        personality = shadow.personality || personalityObj.name?.toLowerCase() || 'balanced';
      }

      // Get base attack interval (now uses stored data from ShadowArmy)
      if (this.shadowArmy.calculateShadowAttackInterval) {
        // This will use stored baseAttackInterval if available
        attackInterval = this.shadowArmy.calculateShadowAttackInterval(shadow, 2000);
      }

      // Get effective stats (cached)
      if (this.shadowArmy.getShadowEffectiveStats) {
        effectiveStats = this.shadowArmy.getShadowEffectiveStats(shadow);
      }
    }

    // Create comprehensive combat data using ShadowArmy's stored info
    return {
      lastAttackTime: Date.now() - Math.random() * attackInterval, // Stagger initial attacks
      attackInterval, // Individual interval (from stored baseAttackInterval)
      personality, // Stored personality from ShadowArmy
      effectiveStats: effectiveStats || {
        strength: shadow.strength || 0,
        agility: shadow.agility || 0,
        intelligence: shadow.intelligence || 0,
        vitality: shadow.vitality || 0,
      },
      attackCount: 0,
      damageDealt: 0,
      // Store shadow ID for reference
      shadowId: shadow.id || shadow.i,
    };
  }

  /**
   * Validate and prepare dungeon combat state (fast validation)
   * @param {string} channelKey - Channel key
   * @returns {Object|null} - Validated dungeon state or null
   */
  validateDungeonCombatState(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed) {
      return null;
    }

    // Validate boss state
    if (!dungeon.boss || dungeon.boss.hp <= 0) {
      return null;
    }

    // Validate mobs state
    if (!dungeon.mobs || !dungeon.mobs.activeMobs) {
      return null;
    }

    // Initialize combat data structures if missing
    if (!dungeon.shadowCombatData) {
      dungeon.shadowCombatData = {};
    }
    if (!dungeon.shadowHP) {
      dungeon.shadowHP = {};
    }

    return {
      dungeon,
      bossAlive: dungeon.boss.hp > 0,
      aliveMobs: dungeon.mobs.activeMobs.filter((m) => m.hp > 0),
      deadShadows: this.deadShadows.get(channelKey) || new Set(),
    };
  }

  /**
   * Calculate attacks in time span (reusable helper)
   * @param {number} timeSinceLastAttack - Time since last attack (ms)
   * @param {number} attackInterval - Attack interval (ms)
   * @param {number} totalTimeSpan - Total time span to calculate for (ms)
   * @returns {number} - Number of attacks in span
   */
  calculateAttacksInTimeSpan(timeSinceLastAttack, attackInterval, totalTimeSpan) {
    const effectiveCooldown = Math.max(attackInterval, 800); // Min 800ms cooldown
    return Math.max(0, Math.floor((totalTimeSpan - timeSinceLastAttack) / effectiveCooldown));
  }

  /**
   * Batch calculate shadow damage for multiple attacks (optimized)
   * @param {Object} shadow - Shadow object
   * @param {Object} target - Target object (boss or mob)
   * @param {string} targetType - 'boss' or 'mob'
   * @param {Object} dungeon - Dungeon object
   * @param {number} attackCount - Number of attacks to calculate
   * @returns {Array<number>} - Array of damage values with variance
   */
  batchCalculateShadowDamage(shadow, target, targetType, dungeon, attackCount) {
    // Get base damage once (cached)
    let baseDamage = 0;
    const targetStats =
      targetType === 'boss'
        ? {
            strength: dungeon.boss.strength,
            agility: dungeon.boss.agility,
            intelligence: dungeon.boss.intelligence,
            vitality: dungeon.boss.vitality,
          }
        : this.buildMobStatsWithVariance(target);

    // Use ShadowArmy's damage calculation if available
    if (this.shadowArmy?.calculateShadowDamage) {
      baseDamage = this.shadowArmy.calculateShadowDamage(shadow, {
        type: targetType,
        rank: target.rank,
        strength: targetStats.strength,
      });
    } else {
      // Fallback to Dungeons calculation
      baseDamage = this.calculateShadowDamage(shadow, targetStats, target.rank);
    }

    // Batch apply variance for all attacks
    const damages = [];
    for (let i = 0; i < attackCount; i++) {
      let attackDamage = this.applyDamageVariance(baseDamage);

      // Personality-based damage modifiers
      if (this.shadowArmy?.calculateShadowDamage) {
        const personalityDamage = this.shadowArmy.calculateShadowDamage(shadow, {
          type: targetType,
          rank: target.rank,
          strength: targetStats.strength,
        });
        attackDamage = personalityDamage || attackDamage;
      }

      damages.push(Math.max(1, Math.floor(attackDamage)));
    }

    return damages;
  }

  /**
   * Batch apply damage to targets (optimized accumulation)
   * @param {Map<string, number>} damageMap - Map of target ID to damage
   * @param {Array} targets - Array of target objects
   * @param {Function} applyDamageCallback - Callback to apply damage (target, damage) => void
   * @returns {Object} - Summary of damage applied
   */
  batchApplyDamage(damageMap, targets, applyDamageCallback) {
    let totalDamage = 0;
    let targetsKilled = 0;

    damageMap.forEach((damage, targetId) => {
      const target = targets.find((t) => (t.id || t.name) === targetId);
      if (!target || target.hp <= 0) return;

      const oldHP = target.hp;
      applyDamageCallback(target, damage);
      totalDamage += damage;

      // Track kills
      if (oldHP > 0 && target.hp <= 0) {
        targetsKilled++;
      }
    });

    return { totalDamage, targetsKilled };
  }

  /**
   * Prepare available targets for combat (cached preparation)
   * @param {Object} dungeon - Dungeon object
   * @param {boolean} bossAlive - Whether boss is alive
   * @param {Array} aliveMobs - Array of alive mobs
   * @returns {Array} - Array of available targets
   */
  prepareAvailableTargets(dungeon, bossAlive, aliveMobs) {
    const availableTargets = [];

    if (bossAlive) {
      availableTargets.push({
        id: 'boss',
        type: 'boss',
        hp: dungeon.boss.hp,
        rank: dungeon.boss.rank,
      });
    }

    aliveMobs.forEach((mob) => {
      availableTargets.push({
        id: mob.id || mob.name,
        type: 'mob',
        hp: mob.hp,
        rank: mob.rank,
      });
    });

    return availableTargets;
  }

  /**
   * Initialize shadow HP if missing or corrupted (batch optimized)
   * @param {Object} shadow - Shadow object
   * @param {Object} shadowHP - Shadow HP object
   * @returns {Promise<Object>} - Updated shadow HP data
   */
  async initializeShadowHP(shadow, shadowHP) {
    if (!shadow || !shadow.id) {
      this.debugError('SHADOW_HP', 'Cannot initialize HP: shadow or shadow.id is missing', {
        shadow,
      });
      return null;
    }

    const existingHP = shadowHP[shadow.id];
    const needsInit =
      !existingHP ||
      typeof existingHP.hp !== 'number' ||
      isNaN(existingHP.hp) ||
      existingHP.hp instanceof Promise;

    if (!needsInit) {
      return existingHP;
    }

    try {
      // PRIORITY ORDER: VIT (vitality) is primary source for HP calculation
      // 1. Direct shadow.vitality (VIT) - highest priority
      // 2. Effective stats vitality (from ShadowArmy calculations)
      // 3. Base stats + growth stats vitality
      // 4. Fallback to strength only if no vitality found anywhere
      // 5. Default 50 only if all else fails

      let shadowVitality = null;

      // Step 1: Check direct shadow.vitality (VIT) - use even if 0 (valid value)
      if (typeof shadow.vitality === 'number' && !isNaN(shadow.vitality)) {
        shadowVitality = shadow.vitality;
      }

      // Step 2: Check effective stats (cached) if VIT not found directly
      if (shadowVitality === null) {
        const effectiveStats = this.getShadowEffectiveStatsCached(shadow);
        if (
          effectiveStats &&
          typeof effectiveStats.vitality === 'number' &&
          !isNaN(effectiveStats.vitality)
        ) {
          shadowVitality = effectiveStats.vitality;
        }
      }

      // Step 3: Check baseStats + growthStats if still not found
      if (shadowVitality === null) {
        const baseStats = shadow.baseStats || {};
        const growthStats = shadow.growthStats || {};
        const calculatedVitality = (baseStats.vitality || 0) + (growthStats.vitality || 0);
        if (
          calculatedVitality > 0 ||
          typeof baseStats.vitality === 'number' ||
          typeof growthStats.vitality === 'number'
        ) {
          shadowVitality = calculatedVitality;
        }
      }

      // Step 4: Fallback to strength only if no vitality found anywhere
      if (shadowVitality === null) {
        if (typeof shadow.strength === 'number' && !isNaN(shadow.strength) && shadow.strength > 0) {
          shadowVitality = shadow.strength;
          this.debugLog(
            'SHADOW_HP',
            `No VIT found for shadow ${shadow.id}, using strength as fallback`,
            {
              strength: shadow.strength,
            }
          );
        }
      }

      // Step 5: Default minimum if all else fails
      if (shadowVitality === null || typeof shadowVitality !== 'number' || isNaN(shadowVitality)) {
        shadowVitality = 50; // Default fallback
        this.debugLog('SHADOW_HP', `No valid VIT found for shadow ${shadow.id}, using default 50`, {
          shadowVitality: shadow.vitality,
          shadowStrength: shadow.strength,
        });
      }

      // Ensure vitality is non-negative (0 is valid, but negative is not)
      if (shadowVitality < 0) {
        shadowVitality = 0;
      }

      // Calculate HP using the same formula as user HP: 100 + VIT × 10 + rankIndex × 50
      // Then multiply by 0.10 (10%) so shadows have 10% of user HP
      const shadowRank = shadow.rank || 'E';
      const baseHP = await this.calculateHP(shadowVitality, shadowRank);

      // Shadows have 10% of the calculated HP (10% of user HP formula result)
      const maxHP = Math.floor(baseHP * 0.1);

      // Validate HP was calculated correctly
      if (typeof maxHP !== 'number' || isNaN(maxHP) || maxHP <= 0) {
        this.debugError('SHADOW_HP', `Invalid HP calculated for shadow ${shadow.id}`, {
          baseHP,
          maxHP,
          shadowVitality,
          rank: shadowRank,
          formula: '(100 + VIT × 10 + rankIndex × 50) × 0.10',
        });
        // Set minimum HP to prevent shadow from being immediately dead
        // Use formula with minimum VIT (50) as fallback, then 10%
        const rankIndex = this.settings.dungeonRanks.indexOf(shadowRank);
        const minBaseHP = 100 + 50 * 10 + rankIndex * 50; // Formula with VIT=50
        const minHP = Math.floor(minBaseHP * 0.1); // 10% of minimum
        // Atomic update: create new object to prevent race conditions
        const hpData = { hp: minHP, maxHp: minHP };
        // eslint-disable-next-line require-atomic-updates
        shadowHP[shadow.id] = hpData;
        return hpData;
      }

      // HP successfully calculated from VIT using formula: (100 + VIT × 10 + rankIndex × 50) × 0.10
      // Atomic update: create new object to prevent race conditions
      const hpData = { hp: maxHP, maxHp: maxHP };
      // eslint-disable-next-line require-atomic-updates
      shadowHP[shadow.id] = hpData;
      return hpData;
    } catch (error) {
      this.debugError('SHADOW_HP', `Failed to initialize HP for shadow ${shadow.id}`, error);
      // Set minimum HP to prevent shadow from being immediately dead
      const minHP = 100;
      shadowHP[shadow.id] = { hp: minHP, maxHp: minHP };
      return shadowHP[shadow.id];
    }
  }

  /**
   * Get combat-ready shadows for dungeon (filtered and validated)
   * @param {Array} assignedShadows - Assigned shadows
   * @param {Set} deadShadows - Set of dead shadow IDs
   * @param {Object} shadowHP - Shadow HP object
   * @returns {Array} - Array of combat-ready shadows
   */
  getCombatReadyShadows(assignedShadows, deadShadows, shadowHP) {
    return assignedShadows.filter((shadow) => {
      if (deadShadows.has(shadow.id)) return false;
      const hpData = shadowHP[shadow.id];
      return hpData && hpData.hp > 0;
    });
  }

  // ============================================================================
  // DAMAGE CALCULATION HELPERS
  // ============================================================================

  /**
   * Apply boss damage variance (±25% per attack)
   * @param {number} baseDamage - Base damage before variance
   * @returns {number} Damage with variance applied
   */
  applyBossDamageVariance(baseDamage) {
    const variance = 0.75 + Math.random() * 0.5; // 75% to 125%
    return Math.floor(baseDamage * variance);
  }

  /**
   * Apply mob damage variance (±20% per attack)
   * @param {number} baseDamage - Base damage before variance
   * @returns {number} Damage with variance applied
   */
  applyMobDamageVariance(baseDamage) {
    const variance = 0.8 + Math.random() * 0.4; // 80% to 120%
    return Math.floor(baseDamage * variance);
  }

  /**
   * Calculate boss damage to user (with 50% reduction - shadows absorbed impact)
   * @param {Object} bossStats - Boss stats object
   * @param {Object} userStats - User stats object
   * @param {string} bossRank - Boss rank
   * @param {string} userRank - User rank
   * @returns {number} Final damage to user
   */
  calculateBossDamageToUser(bossStats, userStats, bossRank, userRank) {
    let rawDamage = this.calculateEnemyDamage(bossStats, userStats, bossRank, userRank);
    rawDamage = this.applyBossDamageVariance(rawDamage);
    return Math.floor(rawDamage * 0.5); // 50% reduction (shadows absorbed most)
  }

  /**
   * Calculate mob damage to user (with 60% reduction - mobs are weaker)
   * @param {Object} mobStats - Mob stats object
   * @param {Object} userStats - User stats object
   * @param {string} mobRank - Mob rank
   * @param {string} userRank - User rank
   * @returns {number} Final damage to user
   */
  calculateMobDamageToUser(mobStats, userStats, mobRank, userRank) {
    let rawDamage = this.calculateEnemyDamage(mobStats, userStats, mobRank, userRank);
    rawDamage = this.applyMobDamageVariance(rawDamage);
    return Math.floor(rawDamage * 0.4); // 60% reduction (mobs are weaker)
  }

  /**
   * Calculate boss damage to shadow (with 40% reduction for reasonable pace)
   * Reduced from 60% to ensure shadows die at reasonable rate for mana drain
   * @param {Object} bossStats - Boss stats object
   * @param {Object} shadowStats - Shadow stats object
   * @param {string} bossRank - Boss rank
   * @param {string} shadowRank - Shadow rank
   * @returns {number} Final damage to shadow
   */
  calculateBossDamageToShadow(bossStats, shadowStats, bossRank, shadowRank) {
    let damage = this.calculateEnemyDamage(bossStats, shadowStats, bossRank, shadowRank);
    damage = Math.floor(damage * 0.6); // 40% damage reduction (was 60%)
    return this.applyBossDamageVariance(damage);
  }

  /**
   * Calculate mob damage to shadow (with 50% reduction for reasonable pace)
   * Reduced from 70% to ensure shadows die at reasonable rate for mana drain
   * @param {Object} mobStats - Mob stats object
   * @param {Object} shadowStats - Shadow stats object
   * @param {string} mobRank - Mob rank
   * @param {string} shadowRank - Shadow rank
   * @returns {number} Final damage to shadow
   */
  calculateMobDamageToShadow(mobStats, shadowStats, mobRank, shadowRank) {
    let damage = this.calculateEnemyDamage(mobStats, shadowStats, mobRank, shadowRank);
    damage = Math.floor(damage * 0.5); // 50% damage reduction (was 70%)
    return this.applyMobDamageVariance(damage);
  }

  /**
   * Build shadow stats object from shadow data
   * @param {Object} shadow - Shadow object
   * @returns {Object} Shadow stats object
   */
  buildShadowStats(shadow) {
    return {
      strength: shadow.strength || 0,
      agility: shadow.agility || 0,
      intelligence: shadow.intelligence || 0,
      vitality: shadow.vitality || shadow.strength || 50,
    };
  }

  /**
   * Check if message element has critical hit class (CriticalHit plugin integration)
   * @param {HTMLElement} messageElement - Message DOM element
   * @returns {boolean} True if critical hit detected
   */
  checkCriticalHit(messageElement) {
    if (!messageElement) return false;
    return (
      messageElement.classList?.contains('bd-crit-hit') ||
      messageElement.querySelector?.('.bd-crit-hit') !== null
    );
  }

  /**
   * Calculate XP for mob kill based on rank
   * @param {string} mobRank - Mob rank
   * @param {boolean} userParticipating - Whether user is participating
   * @returns {number} XP amount
   */
  calculateMobXP(mobRank, userParticipating = true) {
    const rankIndex = this.settings.dungeonRanks.indexOf(mobRank);
    const baseXP = 10 + rankIndex * 5;
    return userParticipating ? baseXP : Math.floor(baseXP * 0.3);
  }

  /**
   * Calculate attacks in time span based on cooldown
   * @param {number} timeSinceLastAttack - Time since last attack in ms
   * @param {number} attackCooldown - Attack cooldown in ms
   * @param {number} cyclesMultiplier - Cycles multiplier for batch processing
   * @returns {number} Number of attacks in span
   */
  calculateAttacksInSpan(timeSinceLastAttack, attackCooldown, cyclesMultiplier = 1) {
    if (cyclesMultiplier > 1) return cyclesMultiplier;
    return timeSinceLastAttack >= attackCooldown ? 1 : 0;
  }

  /**
   * Apply role-based damage multiplier
   * @param {string} role - Shadow role (Tank, Assassin, Mage, etc.)
   * @param {number} damage - Base damage
   * @returns {number} Damage with role multiplier applied
   */
  applyRoleDamageMultiplier(role, damage) {
    const roleMultipliers = {
      Tank: 0.8,
      Assassin: 1.3,
      Mage: 1.2,
      // Default: 1.0 (no multiplier)
    };
    return damage * (roleMultipliers[role] || 1.0);
  }

  // ============================================================================
  // BOSS & MOB ATTACKS
  // ============================================================================
  async processBossAttacks(channelKey, cyclesMultiplier = 1) {
    // CRITICAL: Sync HP/Mana from Stats plugin FIRST (get freshest values)
    // This ensures we're using the latest HP/Mana including regeneration
    this.syncHPAndManaFromStats();

    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || !dungeon.boss || dungeon.boss.hp <= 0 || dungeon.completed || dungeon.failed) {
      this.stopBossAttacks(channelKey);
      return;
    }

    const now = Date.now();
    const activeInterval = 1000; // Boss attacks every 1 second
    const totalTimeSpan = cyclesMultiplier * activeInterval;

    // OPTIMIZATION: Calculate attacks using helper function
    const timeSinceLastAttack = now - dungeon.boss.lastAttackTime;
    const attacksInSpan = this.calculateAttacksInTimeSpan(
      timeSinceLastAttack,
      dungeon.boss.attackCooldown || activeInterval,
      totalTimeSpan
    );

    if (attacksInSpan <= 0) return;

    const bossStats = {
      strength: dungeon.boss.strength,
      agility: dungeon.boss.agility,
      intelligence: dungeon.boss.intelligence,
      vitality: dungeon.boss.vitality,
    };

    // Get shadows first to check if any are alive
    const allShadows = await this.getAllShadows();
    const shadowHP = dungeon.shadowHP || {}; // Object, not Map
    const deadShadows = this.deadShadows.get(channelKey) || new Set();

    // Check if any shadows are alive
    let aliveShadows = allShadows.filter((s) => !deadShadows.has(s.id) && shadowHP[s.id]?.hp > 0);

    // BATCH PROCESSING: Calculate all attacks in one calculation with variance
    let totalUserDamage = 0;
    const shadowDamageMap = new Map(); // Track damage per shadow
    const rankMultipliers = { E: 1, D: 2, C: 3, B: 5, A: 8, S: 12 };
    const maxTargetsPerAttack = rankMultipliers[dungeon.boss?.rank] || 1;
    const _totalShadowsKilled = 0; // Tracked via deadShadows Set

    Array.from({ length: attacksInSpan }).forEach(() => {
      // Refresh alive shadows list (some may have died)
      aliveShadows = allShadows.filter((s) => !deadShadows.has(s.id) && shadowHP[s.id]?.hp > 0);

      // PRIORITY SYSTEM: Boss attacks shadows FIRST, only attacks user if ALL shadows are dead
      if (aliveShadows.length > 0) {
        // Boss AOE Attack: Attack multiple shadows based on boss rank
        const actualTargets = Math.min(maxTargetsPerAttack, aliveShadows.length);
        const shuffled = [...aliveShadows].sort(() => Math.random() - 0.5);
        const targets = shuffled.slice(0, actualTargets);

        targets
          .map((targetShadow) => ({
            targetShadow,
            hpData: shadowHP[targetShadow.id],
          }))
          .filter(({ hpData }) => hpData && hpData.hp > 0)
          .forEach(({ targetShadow }) => {
            const shadowStats = this.buildShadowStats(targetShadow);
            const shadowRank = targetShadow.rank || 'E';

            // Calculate boss damage to shadow (with 40% reduction and variance)
            const bossDamage = this.calculateBossDamageToShadow(
              bossStats,
              shadowStats,
              dungeon.boss.rank,
              shadowRank
            );

            // Accumulate damage per shadow
            const currentDamage = shadowDamageMap.get(targetShadow.id) || 0;
            shadowDamageMap.set(targetShadow.id, currentDamage + bossDamage);
          });
        return;
      }

      if (!dungeon.userParticipating) return;

      // ALL shadows are dead, calculate user damage
      const userStats = this.getUserEffectiveStats();
      const userRank = this.soloLevelingStats?.settings?.rank || 'E';

      const attackDamage = this.calculateBossDamageToUser(
        bossStats,
        userStats,
        dungeon.boss.rank,
        userRank
      );
      totalUserDamage += attackDamage;
    });

    // REAL-TIME UPDATE: Update boss HP bar after calculating all damage
    this.updateBossHPBar(channelKey);

    // Apply accumulated shadow damage (functional approach)
    Array.from(shadowDamageMap.entries())
      .filter(([shadowId]) => {
        const targetShadow = allShadows.find((s) => s.id === shadowId);
        const shadowHPData = shadowHP[shadowId];
        return targetShadow && shadowHPData;
      })
      .forEach(async ([shadowId, damage]) => {
        const targetShadow = allShadows.find((s) => s.id === shadowId);
        const shadowHPData = shadowHP[shadowId];
        const oldHP = shadowHPData.hp;
        shadowHPData.hp = Math.max(0, shadowHPData.hp - damage);
        shadowHP[shadowId] = shadowHPData;

        if (oldHP > 0 && shadowHPData.hp <= 0) {
          const resurrected = await this.attemptAutoResurrection(targetShadow, channelKey);
          const handlers = {
            resurrect: () => {
              shadowHPData.hp = shadowHPData.maxHp;
              shadowHP[shadowId] = shadowHPData;
            },
            dead: () => {
              deadShadows.add(shadowId);
              // Tracked via deadShadows Set size
            },
          };
          (resurrected ? handlers.resurrect : handlers.dead)();
        }
      });

    // Apply user damage
    if (totalUserDamage > 0) {
      // CRITICAL: Sync HP from Stats plugin before applying damage (get latest regen)
      this.syncHPFromStats();

      this.settings.userHP = Math.max(0, this.settings.userHP - totalUserDamage);

      // CRITICAL: Push HP to Stats plugin and update UI immediately
      this.pushHPToStats(true); // Save immediately for persistence
      this.updateStatsUI(); // Real-time UI update

      if (dungeon.userParticipating) {
        this.showToast(`Boss attacked you for ${totalUserDamage} damage!`, 'error');
      }

      // Check defeat AFTER syncing and updating (use fresh value)
      if (this.settings.userHP <= 0) {
        await this.handleUserDefeat(channelKey);
      }
    }

    // Atomic update: create new object reference to prevent race conditions
    // eslint-disable-next-line require-atomic-updates
    dungeon.boss.lastAttackTime = now + totalTimeSpan;
    // eslint-disable-next-line require-atomic-updates
    dungeon.shadowHP = { ...shadowHP };
    this.deadShadows.set(channelKey, deadShadows);
    this.saveSettings();
  }

  async processMobAttacks(channelKey, cyclesMultiplier = 1) {
    // CRITICAL: Sync HP/Mana from Stats plugin FIRST (get freshest values)
    // This ensures we're using the latest HP/Mana including regeneration
    this.syncHPAndManaFromStats();

    const dungeon = this.activeDungeons.get(channelKey);
    if (
      !dungeon ||
      !dungeon.mobs ||
      !dungeon.mobs.activeMobs ||
      dungeon.mobs.activeMobs.length === 0 ||
      dungeon.completed ||
      dungeon.failed
    ) {
      this.stopMobAttacks(channelKey);
      return;
    }

    const now = Date.now();
    const activeInterval = 1000; // Mob attacks every 1 second
    const totalTimeSpan = cyclesMultiplier * activeInterval;

    const allShadows = await this.getAllShadows();
    const shadowHP = dungeon.shadowHP || {}; // Object, not Map
    const deadShadows = this.deadShadows.get(channelKey) || new Set();

    // Check if any shadows are alive
    let aliveShadows = allShadows.filter((s) => !deadShadows.has(s.id) && shadowHP[s.id]?.hp > 0);

    // BATCH PROCESSING: Calculate all mob attacks in one calculation with variance
    const shadowDamageMap = new Map(); // Track damage per shadow
    let totalUserDamage = 0;

    // PRIORITY SYSTEM: Mobs attack shadows FIRST, only attack user if ALL shadows are dead
    dungeon.mobs.activeMobs
      .filter((mob) => mob.hp > 0)
      .forEach((mob) => {
        // Calculate how many attacks this mob would make in the time span
        const timeSinceLastAttack = now - mob.lastAttackTime;
        const attacksInSpan = this.calculateAttacksInSpan(
          timeSinceLastAttack,
          mob.attackCooldown,
          cyclesMultiplier
        );

        if (attacksInSpan <= 0) return;

        // Apply mob stat variance (±10% per mob)
        const mobStatVariance = 0.9 + Math.random() * 0.2;
        const mobStats = {
          strength: Math.floor(mob.strength * mobStatVariance),
          agility: Math.floor(mob.agility * mobStatVariance),
          intelligence: Math.floor(mob.intelligence * mobStatVariance),
          vitality: Math.floor(mob.vitality * mobStatVariance),
        };

        // Process batch attacks
        Array.from({ length: attacksInSpan }).forEach(() => {
          // Refresh alive shadows list (some may have died)
          aliveShadows = allShadows.filter((s) => !deadShadows.has(s.id) && shadowHP[s.id]?.hp > 0);

          if (aliveShadows.length > 0) {
            // PERSONALITY-BASED MOB TARGETING: Use ShadowArmy's smart mob targeting
            let targetShadow = null;
            let mobDamage = 0;

            if (this.shadowArmy?.processMobAttackOnShadow) {
              // Use ShadowArmy's personality-based mob attack system
              const attackResult = this.shadowArmy.processMobAttackOnShadow(mob, aliveShadows);
              if (attackResult.targetShadow) {
                targetShadow = aliveShadows.find((s) => s.id === attackResult.targetShadow);
                mobDamage = attackResult.damage;

                // Apply dungeon damage reduction (50% reduction for reasonable pace)
                mobDamage = Math.floor(mobDamage * 0.5);
              }
            }

            // Fallback: Random target selection if personality system not available
            if (!targetShadow) {
              targetShadow = aliveShadows[Math.floor(Math.random() * aliveShadows.length)];
              const shadowHPData = shadowHP[targetShadow.id];
              if (!shadowHPData || shadowHPData.hp <= 0) return;

              const shadowStats = this.buildShadowStats(targetShadow);

              // Calculate mob damage to shadow (with 50% reduction and variance)
              mobDamage = this.calculateMobDamageToShadow(
                mobStats,
                shadowStats,
                mob.rank,
                targetShadow.rank || 'E'
              );
            }

            if (targetShadow && mobDamage > 0) {
              const shadowHPData = shadowHP[targetShadow.id];
              if (shadowHPData && shadowHPData.hp > 0) {
                // Accumulate damage per shadow
                const currentDamage = shadowDamageMap.get(targetShadow.id) || 0;
                shadowDamageMap.set(targetShadow.id, currentDamage + mobDamage);
              }
              return;
            }
          }

          if (!dungeon.userParticipating) return;

          // ALL shadows are dead, calculate user damage
          const userStats = this.getUserEffectiveStats();
          const userRank = this.soloLevelingStats?.settings?.rank || 'E';

          const attackDamage = this.calculateMobDamageToUser(
            mobStats,
            userStats,
            mob.rank,
            userRank
          );
          totalUserDamage += attackDamage;
        });

        // Update mob attack time
        mob.lastAttackTime = now + totalTimeSpan;
      });

    // Apply accumulated shadow damage (functional approach)
    Array.from(shadowDamageMap.entries())
      .filter(([shadowId]) => {
        const targetShadow = allShadows.find((s) => s.id === shadowId);
        const shadowHPData = shadowHP[shadowId];
        return targetShadow && shadowHPData;
      })
      .forEach(async ([shadowId, damage]) => {
        const targetShadow = allShadows.find((s) => s.id === shadowId);
        const shadowHPData = shadowHP[shadowId];
        const oldHP = shadowHPData.hp;
        shadowHPData.hp = Math.max(0, shadowHPData.hp - damage);
        shadowHP[shadowId] = shadowHPData;

        if (oldHP > 0 && shadowHPData.hp <= 0) {
          const resurrected = await this.attemptAutoResurrection(targetShadow, channelKey);
          const handlers = {
            resurrect: () => {
              shadowHPData.hp = shadowHPData.maxHp;
              shadowHP[shadowId] = shadowHPData;
            },
            dead: () => deadShadows.add(shadowId),
          };
          (resurrected ? handlers.resurrect : handlers.dead)();
        }
      });

    // Apply user damage
    if (totalUserDamage > 0) {
      // CRITICAL: Sync HP from Stats plugin before applying damage (get latest regen)
      this.syncHPFromStats();

      this.settings.userHP = Math.max(0, this.settings.userHP - totalUserDamage);

      // CRITICAL: Push HP to Stats plugin and update UI immediately
      this.pushHPToStats(true); // Save immediately for persistence
      this.updateStatsUI(); // Real-time UI update

      // Check defeat AFTER syncing and updating (use fresh value)
      if (this.settings.userHP <= 0) {
        await this.handleUserDefeat(channelKey);
      }
    }

    // Atomic update: create new object reference to prevent race conditions
    // eslint-disable-next-line require-atomic-updates
    dungeon.shadowHP = { ...shadowHP };
    this.deadShadows.set(channelKey, deadShadows);

    // REAL-TIME UPDATE: Update boss HP bar after boss attacks complete
    this.updateBossHPBar(channelKey);

    this.saveSettings();
  }

  async attackMobs(channelKey, source) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.mobs.activeMobs.length === 0) return;

    if (source === 'user') {
      // User attacks mobs
      dungeon.mobs.activeMobs
        .filter((mob) => mob.hp > 0)
        .forEach((mob) => {
          const mobStats = {
            strength: mob.strength,
            agility: mob.agility,
            intelligence: mob.intelligence,
            vitality: mob.vitality,
          };

          const userDamage = this.calculateUserDamage(mobStats, mob.rank);
          mob.hp = Math.max(0, mob.hp - userDamage);

          if (mob.hp <= 0) {
            dungeon.mobs.killed += 1;
            dungeon.mobs.remaining = Math.max(0, dungeon.mobs.remaining - 1);
            if (!this.settings.mobKillNotifications[channelKey]) {
              this.settings.mobKillNotifications[channelKey] = {
                count: 0,
                lastNotification: Date.now(),
              };
            }
            this.settings.mobKillNotifications[channelKey].count += 1;

            // Grant XP to user from mob kill (if participating)
            if (dungeon.userParticipating && this.soloLevelingStats) {
              const mobXP = this.calculateMobXP(mob.rank, dungeon.userParticipating);

              if (typeof this.soloLevelingStats.addXP === 'function') {
                this.soloLevelingStats.addXP(mobXP);
                this.debugLog(`+${mobXP} XP from ${mob.rank} mob kill`);
              }
            }

            // IMMEDIATE EXTRACTION: Extract right away (don't wait!)
            // Only if user is actively participating
            dungeon.userParticipating && this.extractImmediately(channelKey, mob);
          }
        });

      // REAL-TIME UPDATE: Update boss HP bar after user mob attacks (shows updated mob counts)
      this.updateBossHPBar(channelKey);

      // EXTRACTION: Dead mobs already processed by extractImmediately() calls above
      // No queue system needed - single attempt only for performance (prevents queue buildup)
      // processImmediateBatch() handles all extraction attempts and cleanup

      // AGGRESSIVE CLEANUP: Remove dead mobs (extraction already attempted via immediate system)
      // Keep only alive mobs (dead mobs processed and removed by processImmediateBatch)
      if (!dungeon.userParticipating) {
        // Not participating: clean up all dead mobs immediately
        dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0);
      }
      // If participating: processImmediateBatch() handles cleanup, so just keep alive mobs here
      dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0);
      return;
    }

    if (source === 'shadows') {
      // Shadows attack mobs (CHAOTIC: individual timings, random targets)
      const allShadows = await this.getAllShadows();
      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      const shadowHP = dungeon.shadowHP || {};
      const now = Date.now();

      let totalMobsKilled = 0;
      let totalDamageToMobs = 0;
      let shadowsAttacked = 0;

      // Filter alive mobs and shadows
      const aliveMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0);
      if (aliveMobs.length === 0) return;

      for (const shadow of allShadows.filter((shadow) => !deadShadows.has(shadow.id))) {
        const shadowHPData = shadowHP[shadow.id];
        if (!shadowHPData || shadowHPData.hp <= 0) continue;

        const combatData = dungeon.shadowCombatData?.[shadow.id];
        if (!combatData) continue;

        // Check individual shadow cooldown (chaotic timing)
        const timeSinceLastAttack = now - combatData.lastAttackTime;
        if (timeSinceLastAttack < combatData.cooldown) {
          continue; // Not ready yet
        }

        // Pick random mob target (dynamic target selection)
        const targetMob = aliveMobs[Math.floor(Math.random() * aliveMobs.length)];
        if (!targetMob || targetMob.hp <= 0) continue;

        const mobStats = {
          strength: targetMob.strength,
          agility: targetMob.agility,
          intelligence: targetMob.intelligence,
          vitality: targetMob.vitality,
        };

        // Calculate damage with variance
        let shadowDamage = this.calculateShadowDamage(shadow, mobStats, targetMob.rank);

        // Add damage variance (±20%)
        const variance = 0.8 + Math.random() * 0.4;
        shadowDamage = Math.floor(shadowDamage * variance);

        // Behavior modifiers
        const behaviorMultipliers = {
          aggressive: 1.3,
          balanced: 1.0,
          tactical: 0.85,
        };
        shadowDamage = Math.floor(shadowDamage * behaviorMultipliers[combatData.behavior]);

        totalDamageToMobs += shadowDamage;
        shadowsAttacked++;
        targetMob.hp = Math.max(0, targetMob.hp - shadowDamage);

        // Update combat data
        combatData.lastAttackTime = now;
        combatData.attackCount++;
        combatData.damageDealt += shadowDamage;

        // Vary cooldown for next attack (keeps combat rhythm dynamic)
        const cooldownVariance = 0.9 + Math.random() * 0.2;
        combatData.cooldown = combatData.cooldown * cooldownVariance;

        // Check if mob died from this attack
        if (targetMob.hp <= 0) {
          totalMobsKilled++;
          dungeon.mobs.killed += 1;
          dungeon.mobs.remaining = Math.max(0, dungeon.mobs.remaining - 1);

          // Track shadow contribution for XP (with guard clauses)
          if (shadow && shadow.id) {
            if (!dungeon.shadowContributions || typeof dungeon.shadowContributions !== 'object') {
              dungeon.shadowContributions = {};
            }
            if (!dungeon.shadowContributions[shadow.id]) {
              dungeon.shadowContributions[shadow.id] = { mobsKilled: 0, bossDamage: 0 };
            }
            dungeon.shadowContributions[shadow.id].mobsKilled += 1;
          }

          if (!this.settings.mobKillNotifications[channelKey]) {
            this.settings.mobKillNotifications[channelKey] = {
              count: 0,
              lastNotification: Date.now(),
            };
          }
          this.settings.mobKillNotifications[channelKey].count += 1;

          // Grant XP to user from mob kill (if participating)
          if (dungeon.userParticipating && this.soloLevelingStats) {
            const mobXP = this.calculateMobXP(targetMob.rank, dungeon.userParticipating);

            if (typeof this.soloLevelingStats.addXP === 'function') {
              this.soloLevelingStats.addXP(mobXP);
            }
          }

          // IMMEDIATE EXTRACTION: Extract right away (don't wait!)
          // Only if user is actively participating
          if (dungeon.userParticipating) {
            this.extractImmediately(channelKey, targetMob);
          }
        }

        // Log shadow attack summary on mobs (only when shadows actually attacked)
        if (shadowsAttacked > 0) {
          const aliveMobCount = dungeon.mobs.activeMobs.filter((m) => m.hp > 0).length;

          if (totalMobsKilled > 0) {
            this.debugLog(
              `${shadowsAttacked} shadows attacked (chaotic timing), dealt ${Math.floor(
                totalDamageToMobs
              )} damage, killed ${totalMobsKilled} mobs! ${aliveMobCount} mobs remaining`
            );
          } else {
            this.debugLog(
              `${shadowsAttacked} shadows attacked (chaotic timing), dealt ${Math.floor(
                totalDamageToMobs
              )} damage to mobs`
            );
          }
        }

        // EXTRACTION: Dead mobs already processed by extractImmediately() calls above
        // No queue system needed - single attempt only for performance (prevents queue buildup)
        // processImmediateBatch() handles all extraction attempts and cleanup

        // AGGRESSIVE CLEANUP: Remove dead mobs (extraction already attempted)
        dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0);

        // AGGRESSIVE MEMORY OPTIMIZATION: Remove oldest mobs if exceeding capacity
        if (dungeon.mobs.activeMobs.length > 3000) {
          // Remove oldest 500 mobs (not just trim to 3000)
          // This creates headroom for new spawns
          dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.slice(500);
        }

        // EXTRACTION QUEUE CLEANUP: Clear any stale queue entries (legacy cleanup)
        // Note: Queue system is no longer used for mobs (single attempt only)
        // This cleanup prevents memory leaks from any residual queue entries
        const extractionQueue = this.extractionQueue.get(channelKey);
        if (extractionQueue && extractionQueue.length > 0) {
          // Clear all queue entries (mobs use immediate extraction only)
          this.extractionQueue.set(channelKey, []);
        }

        // EXTRACTION EVENTS CACHE CLEANUP: Prevent cache bloat
        if (this.extractionEvents && this.extractionEvents.size > 1000) {
          const entries = Array.from(this.extractionEvents.entries());
          this.extractionEvents.clear();
          // Keep only last 500 events
          entries.slice(-500).forEach(([k, v]) => this.extractionEvents.set(k, v));
        }
      }

      // PERFORMANCE: Only save to storage every 5 attack cycles (not every 2 seconds)
      if (!this._saveCycleCount) this._saveCycleCount = 0;
      this._saveCycleCount++;

      if (this._saveCycleCount >= 5 && this.storageManager) {
        this.storageManager
          .saveDungeon(dungeon)
          .catch((err) => this.errorLog('Failed to save dungeon', err));
        this.saveSettings();
        this._saveCycleCount = 0;
      }
    }
  }

  async applyDamageToBoss(channelKey, damage, source, shadowId = null, isCritical = false) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;

    dungeon.boss.hp = Math.max(0, dungeon.boss.hp - damage);

    // Track shadow contribution for XP
    if (source === 'shadow' && shadowId) {
      if (!dungeon.shadowContributions[shadowId]) {
        dungeon.shadowContributions[shadowId] = { mobsKilled: 0, bossDamage: 0 };
      }
      dungeon.shadowContributions[shadowId].bossDamage += damage;
    }

    // Track user damage with critical hits
    if (source === 'user') {
      if (!dungeon.userDamageDealt) dungeon.userDamageDealt = 0;
      if (!dungeon.userCriticalHits) dungeon.userCriticalHits = 0;

      dungeon.userDamageDealt += damage;
      if (isCritical) {
        dungeon.userCriticalHits++;
      }

      // Log user damage (every 10 attacks to avoid spam)
      if (!dungeon.userAttackCount) dungeon.userAttackCount = 0;
      dungeon.userAttackCount++;
      if (dungeon.userAttackCount % 10 === 0) {
        const critText =
          dungeon.userCriticalHits > 0 ? ` (${dungeon.userCriticalHits} crits!)` : '';
        this.debugLog(
          `💥 User dealt ${dungeon.userDamageDealt.toLocaleString()} total damage in ${
            dungeon.userAttackCount
          } attacks${critText}`
        );
      }
    }

    this.updateBossHPBar(channelKey);

    if (dungeon.boss.hp <= 0) {
      await this.completeDungeon(channelKey, 'boss');
    }

    // Update storage
    if (this.storageManager) {
      this.storageManager
        .saveDungeon(dungeon)
        .catch((err) => this.errorLog('Failed to save dungeon', err));
    }
    this.saveSettings();
  }

  // ============================================================================
  // EXTRACTION SYSTEM HELPERS
  // ============================================================================

  /**
   * Format time remaining in MM:SS format
   * @param {number} milliseconds - Time in milliseconds
   * @returns {string} Formatted time string (MM:SS)
   */
  formatTimeRemaining(milliseconds) {
    const remaining = Math.max(0, milliseconds);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped HTML string
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ============================================================================
  // MOB EXTRACTION SYSTEM - QUEUE & VERIFICATION
  // ============================================================================

  /**
   * Setup event listener for Shadow Army extractions
   * Listens for custom 'shadowExtracted' events from Shadow Army plugin
   */
  setupExtractionEventListener() {
    // Store handler reference for cleanup
    this._shadowExtractedHandler = (event) => {
      const { shadowId, shadowData, mobId, success } = event.detail || {};

      if (success && mobId) {
        // Mark mob extraction as verified in queue
        this.extractionEvents.set(mobId, {
          success: true,
          shadowId: shadowId,
          timestamp: Date.now(),
        });

        this.debugLog(
          `✅ [Event] Shadow extracted: ${shadowData?.name || 'Unknown'} (${
            shadowData?.rank || '?'
          }-rank)`
        );
      }
    };

    // Listen for custom extraction events from Shadow Army
    document.addEventListener('shadowExtracted', this._shadowExtractedHandler);
    // Track listener for cleanup
    if (!this._listeners.has('shadowExtracted')) {
      this._listeners.set('shadowExtracted', new Set());
    }
    this._listeners.get('shadowExtracted').add(this._shadowExtractedHandler);
  }

  /**
   * Extract mob immediately (batched for efficiency)
   * Accumulates mobs for 10ms then processes in batches of 20
   * Success → Shadow extracted, mob removed immediately
   * Failure → Mob removed immediately (no retry, single attempt only)
   */
  extractImmediately(channelKey, mob) {
    // AGGRESSIVE EXTRACTION: Process immediately on mob death (no delay!)
    // Initialize immediate batch if needed
    if (!this.immediateBatch) {
      this.immediateBatch = new Map();
    }
    if (!this.immediateBatch.has(channelKey)) {
      this.immediateBatch.set(channelKey, []);
    }

    const batch = this.immediateBatch.get(channelKey);

    // Check for duplicate
    const alreadyBatched = batch.some((m) => m.id === mob.id);
    if (alreadyBatched) return;

    // Add to immediate batch
    batch.push(mob);

    // AGGRESSIVE: Process immediately (no debounce) for instant extraction
    // Batch extraction is still used for efficiency (20 mobs at a time)
    if (!this.immediateTimers) {
      this.immediateTimers = new Map();
    }

    if (this.immediateTimers.has(channelKey)) {
      clearTimeout(this.immediateTimers.get(channelKey));
    }

    const timer = setTimeout(() => {
      this.immediateTimers.delete(channelKey);
      this.processImmediateBatch(channelKey);
    }, 10); // 10ms only (minimal delay for batching, instant feel)

    this.immediateTimers.set(channelKey, timer);
  }

  /**
   * Process immediate batch (AGGRESSIVE EXTRACTION)
   * Strategy: Batch extraction (20 mobs at once) with immediate cleanup
   *
   * MOB EXTRACTION: 1 attempt only (fast, prevents queue buildup)
   * - Success → Shadow extracted, mob removed immediately
   * - Failure → Mob removed immediately (no retry for mobs, thousands more coming!)
   *
   * This is MUCH BETTER than retry queue for mobs because:
   * 1. Instant extraction attempt (10ms vs 100ms delay)
   * 2. Instant cleanup on failure (no queue buildup)
   * 3. Better performance (less memory, faster UI updates)
   * 4. Still batch-efficient (20 mobs processed together)
   */
  async processImmediateBatch(channelKey) {
    const batch = this.immediateBatch.get(channelKey);
    if (!batch || batch.length === 0) return;

    // Clear batch immediately
    this.immediateBatch.set(channelKey, []);

    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || !dungeon.userParticipating) return;

    // Process in chunks of 20 (fast, small batches) - functional approach
    const BATCH_SIZE = 20;
    const processedMobIds = new Set();

    // Create chunks using Array.from and process sequentially
    const chunks = Array.from({ length: Math.ceil(batch.length / BATCH_SIZE) }, (_, i) =>
      batch.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
    );

    // Process chunks sequentially (await each chunk) without for-loop
    await chunks.reduce(async (prev, chunk) => {
      await prev;
      const chunkResults = await Promise.all(
        chunk.map(async (mob) => {
          try {
            await this.attemptMobExtraction(channelKey, mob);
            // SUCCESS: Shadow extracted!
            return { mob, success: true };
          } catch (error) {
            // FAILED: No retry for mobs (1 attempt only with new system)
            return { mob, success: false };
          }
        })
      );

      // AGGRESSIVE CLEANUP: Remove ALL processed mobs immediately (success or failure)
      chunkResults.forEach((result) => processedMobIds.add(result.mob.id));
      return null;
    }, Promise.resolve());

    // AGGRESSIVE CLEANUP: Immediately remove ALL processed mobs (no retry queue for mobs)
    if (processedMobIds.size > 0) {
      dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => !processedMobIds.has(m.id));
    }
  }

  /**
   * Start continuous extraction processor (LEGACY CLEANUP ONLY)
   *
   * Runs every 500ms to clear stale queue entries (prevents memory leaks)
   * NOTE: Mobs use immediate extraction only (single attempt, no retry queue)
   * All mob extraction happens via extractImmediately() → processImmediateBatch()
   */
  startContinuousExtraction(channelKey) {
    if (this.extractionProcessors && this.extractionProcessors.has(channelKey)) return;
    if (!this.extractionProcessors) this.extractionProcessors = new Map();

    // PERFORMANCE: Only extract when user is participating
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || !dungeon.userParticipating) {
      // Background dungeon - no extraction processing
      return;
    }

    // Legacy cleanup: Clear stale queue entries every 500ms (mobs use immediate extraction only)
    const processor = setInterval(async () => {
      const currentDungeon = this.activeDungeons.get(channelKey);
      // Stop if dungeon completed or user no longer participating
      if (
        !currentDungeon ||
        currentDungeon.completed ||
        currentDungeon.failed ||
        !currentDungeon.userParticipating
      ) {
        this.stopContinuousExtraction(channelKey);
        return;
      }

      // Cleanup: Clear any stale queue entries (mobs use immediate extraction, no queue)
      await this.processExtractionQueue(channelKey);
    }, 500); // Periodic cleanup to prevent memory leaks

    this.extractionProcessors.set(channelKey, processor);
  }

  /**
   * Stop continuous extraction processor
   */
  stopContinuousExtraction(channelKey) {
    if (!this.extractionProcessors) return;
    const processor = this.extractionProcessors.get(channelKey);
    if (processor) {
      clearInterval(processor);
      this.extractionProcessors.delete(channelKey);
    }
  }

  /**
   * Stop all extraction processors
   */
  stopAllExtractionProcessors() {
    if (!this.extractionProcessors) return;
    this.extractionProcessors.forEach((processor, channelKey) => {
      clearInterval(processor);
    });
    this.extractionProcessors.clear();
  }

  /**
   * Queue dead mob for extraction (LEGACY - NO-OP for mobs)
   *
   * NO-OP: Mobs use immediate extraction only (single attempt, no retry queue)
   * This function immediately removes the mob since extraction was already attempted
   * via extractImmediately() → processImmediateBatch().
   *
   * Single-attempt semantics:
   * - Extraction attempted once via extractImmediately() on mob death
   * - Failed mobs are immediately removed (no retry, prevents queue buildup)
   */
  queueMobForExtraction(channelKey, mob) {
    // NO-OP: Mobs use immediate extraction only (single attempt)
    // Immediately remove mob from activeMobs (extraction already attempted via extractImmediately)
    const dungeon = this.activeDungeons.get(channelKey);
    if (dungeon) {
      dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m.id !== mob.id);
    }
  }

  /**
   * Process extraction queue (LEGACY CLEANUP ONLY)
   *
   * NO-OP for mobs: Mobs use immediate extraction only (single attempt, no retry queue)
   * This function only clears stale queue entries to prevent memory leaks.
   *
   * Single-attempt semantics (mobs):
   * - All mob extraction happens via extractImmediately() → processImmediateBatch()
   * - Failed mobs are immediately removed (no retry, thousands more mobs coming)
   * - This cleanup is for any residual queue entries from legacy code
   */
  async processExtractionQueue(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || !dungeon.userParticipating) return;

    const queue = this.extractionQueue.get(channelKey);
    if (!queue || queue.length === 0) return;

    // LEGACY CLEANUP: Clear all queue entries (mobs use immediate extraction only)
    // This prevents memory leaks from any residual queue entries
    this.extractionQueue.set(channelKey, []);
  }

  /**
   * Get current Shadow Army count (for verification)
   * Consolidated method - uses getShadowCount() internally for consistency
   * @returns {Promise<number>} Total shadow count
   */
  async getShadowArmyCount() {
    return this.getShadowCount();
  }

  /**
   * Attempt shadow extraction from killed mob
   * 1 extraction chance per mob (no retry limit like bosses)
   * Works even if dungeon is completed/failed, as long as user was participating
   */
  async attemptMobExtraction(channelKey, mob) {
    const dungeon = this.activeDungeons.get(channelKey);
    // Allow extraction even if dungeon completed/failed, just check user WAS participating
    if (!dungeon || !dungeon.userParticipating) return;

    if (!this.shadowArmy || !this.soloLevelingStats) return;

    // Get user data
    const userStats = this.soloLevelingStats.settings?.stats || {};
    const userRank = this.soloLevelingStats.settings?.rank || 'E';
    const userLevel = this.soloLevelingStats.settings?.level || 1;

    // Mob data
    const mobRank = mob.rank || 'E';
    const mobStats = mob.baseStats || {
      strength: mob.strength || 50,
      agility: mob.agility || 50,
      intelligence: mob.intelligence || 50,
      vitality: mob.vitality || 50,
      luck: mob.luck || 50,
    };
    const mobStrength = mobStats.strength;

    // Use unique extraction ID per mob (1 attempt only, no daily limit)
    const mobId = `dungeon_${channelKey}_mob_${mob.id}_${Date.now()}`;

    // Mob display name
    const mobName = `${mobRank}-rank ${mob.beastName || 'Beast'}`;

    try {
      // Call ShadowArmy's attemptDungeonExtraction with isBoss=false (1 attempt only for performance)
      const result = await this.shadowArmy.attemptDungeonExtraction(
        mobId,
        userRank,
        userLevel,
        userStats,
        mobRank,
        mobStats,
        mobStrength,
        dungeon.beastFamilies, // Pass biome families for themed extraction
        false // isBoss=false: Regular mobs get 1 attempt only (prevents queue buildup)
      );

      if (result.success && result.shadow) {
        // SUCCESS! Shadow extracted from mob
        if (!dungeon.mobExtractions) dungeon.mobExtractions = 0;
        dungeon.mobExtractions++;

        // EMIT EVENT: Notify that extraction succeeded (for verification)

        const extractionEvent = new CustomEvent('shadowExtracted', {
          detail: {
            mobId: mobId,
            shadowId: result.shadow.id,
            shadowData: result.shadow,
            success: true,
            channelKey: channelKey,
            timestamp: Date.now(),
          },
        });
        document.dispatchEvent(extractionEvent);

        // SILENT EXTRACTION: Mobs extract silently in background (no animation, no toasts)
        // Only bosses show extraction animation - mobs are silent for performance

        // Recalculate mana pool after new shadow extracted
        await this.recalculateUserMana();
      }
    } catch (error) {
      this.errorLog('Mob extraction error', error);
    }
  }

  // ============================================================================
  // SHADOW REVIVE SYSTEM
  // ============================================================================
  // ============================================================================
  // RESURRECTION SYSTEM - Auto-Resurrection with Rank-Based Costs
  // ============================================================================
  /**
   * Calculate mana cost for resurrecting a shadow based on rank
   * Higher rank shadows cost more mana to resurrect
   */
  getResurrectionCost(shadowRank) {
    // NERFED: Reduced by ~40% for more sustainable resurrections
    // Still exponential growth but more manageable for large shadow armies
    const rankCosts = {
      E: 6, // Was 10 (-40%)
      D: 12, // Was 20 (-40%)
      C: 24, // Was 40 (-40%)
      B: 48, // Was 80 (-40%)
      A: 96, // Was 160 (-40%)
      S: 192, // Was 320 (-40%)
      SS: 384, // Was 640 (-40%)
      SSS: 768, // Was 1280 (-40%)
      'SSS+': 1536, // Was 2560 (-40%)
      NH: 3072, // Was 5120 (-40%)
      Monarch: 6144, // Was 10240 (-40%)
      'Monarch+': 12288, // Was 20480 (-40%)
      'Shadow Monarch': 24576, // Was 40960 (-40%)
    };

    return rankCosts[shadowRank] || 30; // Default 30 if rank not found
  }

  // getResurrectionPriority() removed - not needed for current auto-resurrection system
  // Resurrection happens immediately on death, no priority queue needed

  /**
   * Attempt automatic resurrection when shadow dies
   * Higher rank shadows have priority and cost more mana
   * Returns true if resurrected, false if not enough mana or low priority
   */
  async attemptAutoResurrection(shadow, channelKey) {
    if (!shadow || !this.soloLevelingStats) return false;

    const shadowRank = shadow.rank || 'E';
    const manaCost = this.getResurrectionCost(shadowRank);

    // Validate mana cost calculation
    if (!manaCost || manaCost <= 0) {
      this.errorLog(`Invalid resurrection cost for rank ${shadowRank}: ${manaCost}`);
      return false;
    }

    // CRITICAL: SYNC MANA FROM SoloLevelingStats FIRST (get freshest value!)
    // Regeneration updates SoloLevelingStats, so read from there first
    this.syncManaFromStats();

    // Validate current mana is a valid number
    if (typeof this.settings.userMana !== 'number' || isNaN(this.settings.userMana)) {
      this.errorLog(`Invalid userMana value: ${this.settings.userMana}`);
      this.settings.userMana = this.settings.userMaxMana || 0;
    }

    // Get dungeon reference for resurrection tracking
    let dungeon = this.activeDungeons.get(channelKey);

    // AGGRESSIVE: Check if user has enough mana (using FRESHEST value)
    if (this.settings.userMana < manaCost) {
      // Track failed attempts for this dungeon
      if (dungeon) {
        if (!dungeon.failedResurrections) dungeon.failedResurrections = 0;
        dungeon.failedResurrections++;

        // ANTI-SPAM: Show warning ONCE when mana hits 0, not every 50 failures
        if (!dungeon.lowManaWarningShown && this.settings.userMana === 0) {
          dungeon.lowManaWarningShown = true; // Flag to prevent spam
          const percent = Math.floor((this.settings.userMana / this.settings.userMaxMana) * 100);
          this.debugLog(
            `⚠️ LOW MANA: Cannot resurrect shadows! Mana: ${this.settings.userMana}/${this.settings.userMaxMana} (${percent}%)`
          );
          this.showToast(
            `⚠️ NO MANA: Shadow resurrections paused until mana regenerates!`,
            'warning'
          );
        }
      }

      return false;
    }

    // RESET LOW MANA WARNING if mana is recovered
    if (dungeon && dungeon.lowManaWarningShown && this.settings.userMana >= manaCost) {
      dungeon.lowManaWarningShown = false; // Can show warning again if mana depletes
    }

    // Store mana before consumption for verification
    const manaBefore = this.settings.userMana;

    // Consume mana from local settings
    this.settings.userMana -= manaCost;

    // Ensure mana doesn't go negative (safety check)
    if (this.settings.userMana < 0) {
      this.errorLog(
        `CRITICAL: Mana went negative! Resetting to 0. Before: ${manaBefore}, Cost: ${manaCost}`
      );
      this.settings.userMana = 0;
    }

    // Verify mana was actually deducted
    const manaAfter = this.settings.userMana;
    const actualDeduction = manaBefore - manaAfter;
    if (actualDeduction !== manaCost) {
      this.debugLog(`Mana deduction mismatch! Expected: ${manaCost}, Actual: ${actualDeduction}`);
    }

    // CRITICAL: Sync mana with SoloLevelingStats plugin (INSTANTANEOUS)
    if (this.soloLevelingStats?.settings) {
      this.soloLevelingStats.settings.userMana = this.settings.userMana;
      this.soloLevelingStats.settings.userMaxMana = this.settings.userMaxMana;

      // Trigger REAL-TIME UI update (immediate visual feedback)
      const uiUpdater = [
        this.soloLevelingStats.updateHPManaBars,
        this.soloLevelingStats.updateUI,
      ].find((fn) => typeof fn === 'function');
      uiUpdater?.call(this.soloLevelingStats);

      // INSTANT persistence: Save Stats plugin settings immediately
      if (typeof this.soloLevelingStats.saveSettings === 'function') {
        this.soloLevelingStats.saveSettings();
      }
    }

    // Track resurrection (reuse existing dungeon variable)
    if (dungeon) {
      dungeon.shadowRevives = (dungeon.shadowRevives || 0) + 1;

      // Track successful resurrections
      if (!dungeon.successfulResurrections) dungeon.successfulResurrections = 0;
      dungeon.successfulResurrections++;

      // Log major resurrection milestones only (reduced spam)
      if (
        dungeon.successfulResurrections % 100 === 0 ||
        dungeon.successfulResurrections === 50 ||
        dungeon.successfulResurrections === 200 ||
        dungeon.successfulResurrections === 500
      ) {
        const percent = Math.floor((manaAfter / this.settings.userMaxMana) * 100);
        this.infoLog(
          `✅ ${dungeon.successfulResurrections} shadows resurrected. Mana: ${manaAfter}/${this.settings.userMaxMana} (${percent}%)`
        );
      }
    }

    // Save Dungeons settings to persist mana change
    this.saveSettings();

    return true;
  }

  // Manual mass-revive function removed - superseded by automatic resurrection system
  // Automatic resurrection happens when shadows die (see attemptAutoResurrection)

  // ============================================================================
  // DUNGEON COMPLETION
  // ============================================================================
  async completeDungeon(channelKey, reason) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;

    dungeon.completed = reason !== 'timeout';
    dungeon.failed = reason === 'timeout';

    // COLLECT SUMMARY STATS BEFORE ANY NOTIFICATIONS
    const combatAnalytics = dungeon.combatAnalytics || {};
    const summaryStats = {
      dungeonName: dungeon.name,
      dungeonRank: dungeon.rank,
      userParticipated: dungeon.userParticipating,
      userXP: 0,
      shadowTotalXP: 0,
      shadowsLeveledUp: [],
      shadowsRankedUp: [],
      totalMobsKilled: dungeon.mobs.killed || 0,
      shadowDeaths: this.deadShadows.get(channelKey)?.size || 0,
      shadowRevives: dungeon.shadowRevives || 0,
      reason: reason,
      // Combat analytics (NEW!)
      totalBossDamage: combatAnalytics.totalBossDamage || 0,
      totalMobDamage: combatAnalytics.totalMobDamage || 0,
      shadowsAttackedBoss: combatAnalytics.shadowsAttackedBoss || 0,
      shadowsAttackedMobs: combatAnalytics.shadowsAttackedMobs || 0,
    };

    // Grant XP to shadows based on their contributions (collects level-up and rank-up data)
    if (reason === 'boss' || reason === 'complete') {
      const shadowResults = await this.grantShadowDungeonXP(channelKey, dungeon);
      if (shadowResults) {
        summaryStats.shadowTotalXP = shadowResults.totalXP;
        summaryStats.shadowsLeveledUp = shadowResults.leveledUp;
        summaryStats.shadowsRankedUp = shadowResults.rankedUp;
      }
    }

    // CRITICAL CLEANUP: Stop all dungeon systems
    this.stopShadowAttacks(channelKey);
    this.stopBossAttacks(channelKey);
    this.stopMobAttacks(channelKey);
    this.stopMobKillNotifications(channelKey);
    this.stopMobSpawning(channelKey);
    this.removeDungeonIndicator(channelKey);

    // CRITICAL: Remove HP bar and container
    this.removeBossHPBar(channelKey);

    // SAFETY: Remove any orphaned HP bar containers for this channel
    document
      .querySelectorAll(`.dungeon-boss-hp-container[data-channel-key="${channelKey}"]`)
      .forEach((el) => {
        el.remove();
      });

    // Clear dungeon timeout timer
    if (this.dungeonTimeouts.has(channelKey)) {
      clearTimeout(this.dungeonTimeouts.get(channelKey));
      this.dungeonTimeouts.delete(channelKey);
    }

    // CRITICAL: Reset user active dungeon status (allows entering new dungeons)
    if (this.settings.userActiveDungeon === channelKey) {
      this.settings.userActiveDungeon = null;
      this.saveSettings(); // Persist immediately
    }

    // RELEASE CHANNEL LOCK: Dungeon is completing/ending - free the channel
    // Allows new dungeons to spawn in this channel after cooldown
    if (this.channelLocks.has(channelKey)) {
      this.channelLocks.delete(channelKey);
    }

    // Calculate user XP based on reason and participation
    const rankIndex = this.settings.dungeonRanks.indexOf(dungeon.rank);

    if (reason === 'complete') {
      // Grant bonus XP for completion (if participating)
      if (dungeon.userParticipating && this.soloLevelingStats) {
        const completionXP = 100 + rankIndex * 50; // E: 100, D: 150, C: 200, B: 250, A: 300, S: 350
        if (typeof this.soloLevelingStats.addXP === 'function') {
          this.soloLevelingStats.addXP(completionXP);
          summaryStats.userXP = completionXP;
        }
      }
    }
    if (reason === 'boss') {
      // Grant XP for boss kill (even if not participating - shadows cleared it for you!)
      if (this.soloLevelingStats) {
        if (dungeon.userParticipating) {
          // Full XP if actively participating
          const bossXP = 200 + rankIndex * 100; // E: 200, D: 300, C: 400, B: 500, A: 600, S: 700
          if (typeof this.soloLevelingStats.addXP === 'function') {
            this.soloLevelingStats.addXP(bossXP);
            summaryStats.userXP = bossXP;
          }
        } else {
          // Reduced XP if shadows cleared it without you (50% boss XP + 30% mob XP)
          const bossXP = Math.floor((200 + rankIndex * 100) * 0.5);
          const mobXP = Math.floor((10 + rankIndex * 5) * 0.3 * summaryStats.totalMobsKilled);
          const shadowVictoryXP = bossXP + mobXP;
          if (typeof this.soloLevelingStats.addXP === 'function') {
            this.soloLevelingStats.addXP(shadowVictoryXP);
            summaryStats.userXP = shadowVictoryXP;
          }
        }
      }

      // Only allow ARISE extraction if user is actively participating
      if (dungeon.userParticipating) {
        // Store defeated boss for shadow extraction (ARISE)
        this.defeatedBosses.set(channelKey, {
          boss: dungeon.boss,
          dungeon: dungeon,
          timestamp: Date.now(),
        });

        // Show ARISE button (3 extraction chances)
        this.showAriseButton(channelKey);

        // Auto-cleanup after 5 minutes if not extracted
        setTimeout(() => {
          if (this.defeatedBosses.has(channelKey)) {
            this.cleanupDefeatedBoss(channelKey);
          }
        }, 5 * 60 * 1000);

        // ARISE available (silent)
      } else {
        // User didn't participate, no extraction chance (silent)
      }
    }

    // SHOW SINGLE AGGREGATE SUMMARY NOTIFICATION
    if (reason !== 'timeout') {
      this.showDungeonCompletionSummary(summaryStats);
    } else {
      this.showToast(`${dungeon.name} Failed (Timeout)`, 'error');
    }

    // Cleanup logic based on participation and reason
    if (reason === 'boss' && dungeon.userParticipating) {
      // Boss defeated and user participated: keep for ARISE button (3 attempts) (silent)
    } else {
      // Immediate cleanup for:
      // - Non-boss completions
      // - Timeouts
      // - Boss defeats where user didn't participate (no ARISE chance)
      if (reason === 'boss' && !dungeon.userParticipating) {
        // Boss defeated but user not participating - cleaning up immediately (silent)
      }

      // COMPREHENSIVE DATABASE CLEANUP
      // Delete dungeon and all associated mob data from IndexedDB
      if (this.storageManager) {
        try {
          // Delete dungeon (includes all mob data)
          await this.storageManager.deleteDungeon(channelKey);

          // Clear completed dungeons log
          await this.storageManager.clearCompletedDungeons();

          // Database cleanup complete (silent)
        } catch (error) {
          this.errorLog('Failed to delete dungeon from storage', error);
        }
      }

      // COMPREHENSIVE MEMORY CLEANUP
      this.activeDungeons.delete(channelKey);
      delete this.settings.mobKillNotifications[channelKey];
      this.deadShadows.delete(channelKey);

      // Clear shadow allocations for this dungeon
      if (this.shadowAllocations) {
        this.shadowAllocations.delete(channelKey);
      }

      // Clear extraction queue for this channel
      if (this.extractionQueue) {
        this.extractionQueue.delete(channelKey);
      }

      // Clear immediate batch for this channel
      if (this.immediateBatch) {
        this.immediateBatch.delete(channelKey);
      }

      // Clear immediate timers for this channel
      if (this.immediateTimers?.has(channelKey)) {
        clearTimeout(this.immediateTimers.get(channelKey));
        this.immediateTimers.delete(channelKey);
      }

      // Clear last attack times
      if (this._lastShadowAttackTime) {
        this._lastShadowAttackTime.delete(channelKey);
      }
      if (this._lastBossAttackTime) {
        this._lastBossAttackTime.delete(channelKey);
      }
      if (this._lastMobAttackTime) {
        this._lastMobAttackTime.delete(channelKey);
      }

      // Clear mob references (help garbage collector)
      if (dungeon.mobs?.activeMobs) {
        dungeon.mobs.activeMobs.length = 0; // Clear array
        dungeon.mobs.activeMobs = null;
      }

      // Clear shadow combat data
      if (dungeon.shadowCombatData) {
        dungeon.shadowCombatData = null;
      }

      // Clear shadow contributions
      if (dungeon.shadowContributions) {
        dungeon.shadowContributions = null;
      }

      // Clear shadow HP tracking
      if (dungeon.shadowHP) {
        dungeon.shadowHP = null;
      }

      // AGGRESSIVE MEMORY CLEANUP: Clear all dungeon references
      if (dungeon.boss) {
        dungeon.boss.baseStats = null;
        dungeon.boss = null;
      }
      if (dungeon.combatAnalytics) {
        dungeon.combatAnalytics = null;
      }
      if (dungeon.shadowAttacks) {
        dungeon.shadowAttacks = null;
      }
      if (dungeon.mobs) {
        if (dungeon.mobs.activeMobs) {
          dungeon.mobs.activeMobs = null;
        }
        dungeon.mobs = null;
      }

      // Clear extraction events for this channel
      if (this.extractionEvents) {
        const eventsToRemove = [];
        this.extractionEvents.forEach((value, key) => {
          if (key.includes(channelKey)) {
            eventsToRemove.push(key);
          }
        });
        eventsToRemove.forEach((key) => this.extractionEvents.delete(key));
      }

      // Force garbage collection hint (if available)
      // eslint-disable-next-line no-undef
      if (typeof global !== 'undefined' && typeof global.gc === 'function') {
        try {
          // eslint-disable-next-line no-undef
          global.gc();
          this.debugLog('Forced garbage collection after dungeon cleanup');
        } catch (e) {
          // GC not available, that's okay
        }
      }
    }

    this.saveSettings();
  }

  // ============================================================================
  // NOTIFICATION SYSTEM - Batched Toast Notifications
  // ============================================================================
  /**
   * Show comprehensive dungeon completion summary (aggregate toast)
   * Includes: user XP, shadow XP, level-ups, rank-ups, mobs killed, deaths/revives
   */
  showDungeonCompletionSummary(stats) {
    // ESSENTIAL INFO ONLY: Status + Key Stats
    const lines = [];
    const status = stats.userParticipated ? 'CLEARED!' : 'SHADOWS CLEARED';
    lines.push(`${stats.dungeonName} [${stats.dungeonRank}] ${status}`);

    // Combat summary (compact)
    if (stats.totalMobsKilled > 0) {
      lines.push(`Killed: ${stats.totalMobsKilled.toLocaleString()} mobs`);
    }

    // XP gains (compact, combined)
    if (stats.userXP > 0 || stats.shadowTotalXP > 0) {
      const gains = [];
      if (stats.userXP > 0) gains.push(`You: +${stats.userXP} XP`);
      if (stats.shadowTotalXP > 0)
        gains.push(`Shadows: +${stats.shadowTotalXP.toLocaleString()} XP`);
      lines.push(gains.join(' | '));
    }

    // Show single toast (no damage stats, no extraction spam)
    this.showToast(lines.join('\n'), 'success');

    // Shadow Level-Ups (only if significant - 3+ shadows)
    if (stats.shadowsLeveledUp && stats.shadowsLeveledUp.length >= 3) {
      setTimeout(() => {
        const levelUpLine = `${stats.shadowsLeveledUp.length} shadows leveled up!`;
        this.showToast(levelUpLine, 'info');
      }, 750);
    }
  }

  // ============================================================================
  // ARISE EXTRACTION SYSTEM - Boss Shadow Extraction
  // ============================================================================
  /**
   * Show ARISE button for shadow extraction from defeated boss
   * Button appears in channel header and allows user to attempt extraction
   *
   * @param {string} channelKey - Channel key where boss was defeated
   */
  showAriseButton(channelKey) {
    const bossData = this.defeatedBosses.get(channelKey);
    if (!bossData) return;

    const channelHeader = this.findChannelHeader();
    if (!channelHeader) return;

    // Remove ALL existing ARISE buttons (prevent duplicates)
    document.querySelectorAll(`[data-arise-button="${channelKey}"]`).forEach((btn) => btn.remove());
    document.querySelectorAll('.dungeon-arise-button').forEach((btn) => {
      if (btn.getAttribute('data-arise-button') === channelKey) btn.remove();
    });

    // Create ARISE button
    const ariseBtn = document.createElement('button');
    ariseBtn.className = 'dungeon-arise-button';
    ariseBtn.setAttribute('data-arise-button', channelKey);
    ariseBtn.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 20px; font-weight: bold;">↑</span>
        <div>
          <div style="font-weight: bold;">ARISE</div>
          <div style="font-size: 11px; opacity: 0.8;">${bossData.boss.name}</div>
        </div>
      </div>
    `;
    ariseBtn.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
      color: white;
      border: 2px solid #a78bfa;
      border-radius: 8px;
      padding: 12px 20px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
      transition: all 0.3s ease;
      animation: pulse-glow 2s ease-in-out infinite;
      margin-left: 12px;
    `;

    ariseBtn.addEventListener('click', () => this.attemptBossExtraction(channelKey));
    ariseBtn.addEventListener('mouseenter', () => {
      ariseBtn.style.transform = 'scale(1.05)';
      ariseBtn.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.6)';
    });
    ariseBtn.addEventListener('mouseleave', () => {
      ariseBtn.style.transform = 'scale(1)';
      ariseBtn.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
    });

    channelHeader.appendChild(ariseBtn);
  }

  /**
   * Attempt to extract shadow from defeated boss using ShadowArmy plugin
   * Implements Solo Leveling lore: max 3 extraction attempts per boss per day
   *
   * @param {string} channelKey - Channel key where boss was defeated
   */
  async attemptBossExtraction(channelKey) {
    const bossData = this.defeatedBosses.get(channelKey);
    if (!bossData) {
      this.showToast('Boss corpse has degraded. Extraction no longer possible.', 'error');
      return;
    }

    // Check if ShadowArmy plugin is available
    if (!this.shadowArmy) {
      this.showToast('Shadow Army plugin not found. Cannot extract shadow.', 'error');
      return;
    }

    // Get user data from SoloLevelingStats
    if (!this.soloLevelingStats) {
      this.showToast('Solo Leveling Stats plugin not found. Cannot extract shadow.', 'error');
      return;
    }

    const userStats = this.soloLevelingStats.settings?.stats || {};
    const userRank = this.soloLevelingStats.settings?.rank || 'E';
    const userLevel = this.soloLevelingStats.settings?.level || 1;

    // Generate unique boss ID for attempt tracking
    const bossId = `dungeon_${bossData.dungeon.id}_boss_${bossData.boss.name
      .toLowerCase()
      .replace(/\s+/g, '_')}`;

    // SHADOW-COMPATIBLE BOSS STATS
    // Use baseStats structure if available (for mobs), otherwise construct from boss properties
    const mobStats = bossData.boss.baseStats || {
      strength: bossData.boss.strength,
      agility: bossData.boss.agility,
      intelligence: bossData.boss.intelligence,
      vitality: bossData.boss.vitality,
      luck: bossData.boss.luck || 50, // Default luck if not present
    };
    const mobStrength = mobStats.strength;
    const mobRank = bossData.boss.rank || bossData.dungeon.rank;

    // Pass biome information for beast family selection
    const _beastFamilies = bossData.dungeon.beastFamilies || null;

    // Show extraction attempt message
    this.showToast(`Attempting shadow extraction from ${bossData.boss.name}...`, 'info');

    try {
      // Call ShadowArmy's attemptDungeonExtraction with isBoss=true (3 attempts for bosses)
      // The mob's stats will be transferred directly to shadow.baseStats
      const result = await this.shadowArmy.attemptDungeonExtraction(
        bossId,
        userRank,
        userLevel,
        userStats,
        mobRank,
        mobStats,
        mobStrength,
        bossData.dungeon.beastFamilies, // Pass biome families for themed extraction
        true // isBoss=true: Bosses get 3 extraction attempts (worth retrying)
      );

      const extractionStatus =
        result.success && result.shadow ? 'success' : result.error ? 'error' : 'fail';
      const extractionHandlers = {
        success: async () => {
          this.showAriseSuccessAnimation(result.shadow, bossData.boss);
          this.showToast(`ARISE! \"${result.shadow.name}\" extracted!`, 'success');
          await this.recalculateUserMana();
        },
        error: () => {
          this.showAriseFailAnimation(bossData.boss, result.error);
          this.showToast(`${result.error}`, 'error');
        },
        fail: () => {
          this.showAriseFailAnimation(bossData.boss, 'Extraction failed');
          this.showToast(`Extraction failed. (${result.attemptsRemaining} left)`, 'error');
        },
      };
      await (extractionHandlers[extractionStatus] || extractionHandlers.fail)();

      // If no attempts remaining or success, cleanup the arise button
      if (result.attemptsRemaining === 0 || result.success) {
        setTimeout(() => this.cleanupDefeatedBoss(channelKey), 3000);
      }
      // If failed but has attempts remaining, keep arise button visible
    } catch (error) {
      this.errorLog('Failed to extract shadow', error);
      this.showToast('Extraction failed due to an error', 'error');
      this.showAriseFailAnimation(bossData.boss, 'System error');
    }
  }

  /**
   * Show big ARISE success animation when shadow extraction succeeds
   *
   * @param {Object} shadow - Extracted shadow
   * @param {Object} enemy - Defeated boss or mob
   */
  showAriseSuccessAnimation(shadow, enemy) {
    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.className = 'arise-animation-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      animation: arise-fade-in 0.5s ease;
    `;

    const container = document.createElement('div');
    container.style.cssText = 'text-align: center; animation: arise-rise 1s ease-out;';

    const arrow = document.createElement('div');
    arrow.style.cssText =
      'font-size: 80px; margin-bottom: 20px; animation: arise-glow 1.5s ease-in-out infinite; font-weight: bold;';
    arrow.textContent = '↑';

    const title = document.createElement('div');
    title.style.cssText =
      'font-size: 48px; font-weight: bold; color: #a78bfa; margin-bottom: 12px; text-shadow: 0 0 20px #8b5cf6;';
    title.textContent = 'ARISE';

    const shadowName = document.createElement('div');
    shadowName.style.cssText = 'font-size: 32px; color: white; margin-bottom: 8px;';
    shadowName.textContent = shadow?.name ?? '';

    const shadowRank = document.createElement('div');
    shadowRank.style.cssText = 'font-size: 20px; color: #a78bfa; margin-bottom: 4px;';
    shadowRank.textContent = `${shadow?.rank ?? ''} Rank ${shadow?.role ?? ''}`.trim();

    const extractedInfo = document.createElement('div');
    extractedInfo.style.cssText = 'font-size: 16px; color: #888;';
    extractedInfo.textContent = `Extracted from ${enemy?.name ?? ''} [${enemy?.rank ?? ''}]`.trim();

    container.appendChild(arrow);
    container.appendChild(title);
    container.appendChild(shadowName);
    container.appendChild(shadowRank);
    container.appendChild(extractedInfo);
    overlay.appendChild(container);

    document.body.appendChild(overlay);

    // Auto-remove after 2.5 seconds (quicker for mobs)
    setTimeout(() => {
      overlay.style.animation = 'arise-fade-out 0.5s ease';
      setTimeout(() => overlay.remove(), 500);
    }, 2500);
  }

  /**
   * Show ARISE fail animation when shadow extraction fails
   *
   * @param {Object} boss - Defeated boss
   * @param {string} reason - Failure reason
   */
  showAriseFailAnimation(boss, reason) {
    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.className = 'arise-fail-animation-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      animation: arise-fade-in 0.5s ease;
    `;

    const failContainer = document.createElement('div');
    failContainer.style.cssText = 'text-align: center; animation: arise-shake 0.5s ease;';

    const failIcon = document.createElement('div');
    failIcon.style.cssText =
      'font-size: 80px; margin-bottom: 20px; filter: grayscale(100%); font-weight: bold;';
    failIcon.textContent = '✕';

    const failTitle = document.createElement('div');
    failTitle.style.cssText =
      'font-size: 48px; font-weight: bold; color: #ef4444; margin-bottom: 12px; text-shadow: 0 0 20px #dc2626;';
    failTitle.textContent = 'EXTRACTION FAILED';

    const bossName = document.createElement('div');
    bossName.style.cssText = 'font-size: 24px; color: white; margin-bottom: 8px;';
    bossName.textContent = boss?.name ?? '';

    const failReason = document.createElement('div');
    failReason.style.cssText = 'font-size: 16px; color: #888;';
    failReason.textContent = reason ?? '';

    failContainer.appendChild(failIcon);
    failContainer.appendChild(failTitle);
    failContainer.appendChild(bossName);
    failContainer.appendChild(failReason);
    overlay.appendChild(failContainer);

    document.body.appendChild(overlay);

    // Auto-remove after 2 seconds
    setTimeout(() => {
      overlay.style.animation = 'arise-fade-out 0.5s ease';
      setTimeout(() => overlay.remove(), 500);
    }, 2000);
  }

  /**
   * Cleanup defeated boss data and remove ARISE button
   *
   * @param {string} channelKey - Channel key
   */
  async cleanupDefeatedBoss(channelKey) {
    // Remove ARISE button
    const ariseBtn = document.querySelector(`[data-arise-button="${channelKey}"]`);
    if (ariseBtn) {
      ariseBtn.remove();
      // ARISE button removed (silent)
    }

    // Delete from IndexedDB
    if (this.storageManager) {
      try {
        await this.storageManager.deleteDungeon(channelKey);
        await this.storageManager.clearCompletedDungeons();
      } catch (error) {
        this.errorLog('Failed to delete dungeon from storage', error);
      }
    }

    // Clean up dungeon data (this does NOT affect ShadowArmy extraction attempts)
    // ShadowArmy tracks extraction attempts separately by bossId in its own plugin
    this.activeDungeons.delete(channelKey);
    this.defeatedBosses.delete(channelKey);
    delete this.settings.mobKillNotifications[channelKey];
    this.deadShadows.delete(channelKey);
    this.saveSettings();

    // Dungeon cleanup complete (silent)
  }

  /**
   * Grant XP to shadows based on their dungeon contributions
   * XP is calculated based on:
   * - Dungeon rank (higher rank = more base XP)
   * - Shadow rank (higher rank shadows get more XP per contribution)
   * - Mobs killed (each mob kill = base XP)
   * - Boss damage dealt (damage / boss max HP = contribution percentage)
   *
   * Operations:
   * 1. Get dungeon rank multiplier
   * 2. Calculate base XP reward for dungeon completion
   * 3. For each shadow with contributions:
   *    - Calculate mob kill XP (mobsKilled * baseMobXP)
   *    - Calculate boss damage XP (bossDamage / bossMaxHP * baseBossXP)
   *    - Scale by shadow rank (higher ranks get more XP)
   *    - Grant XP to shadow
   * 4. Show toast notification for shadows that leveled up
   */
  async grantShadowDungeonXP(channelKey, dungeon) {
    if (!this.shadowArmy) return null;

    const contributions = dungeon.shadowContributions || {};
    if (Object.keys(contributions).length === 0) return null;

    // Get dungeon rank multiplier (higher rank = more XP)
    const dungeonRankIndex = this.settings.dungeonRanks.indexOf(dungeon.rank);
    const dungeonRankMultiplier = 1.0 + dungeonRankIndex * 0.5; // E=1.0, D=1.5, SSS=4.5, etc.

    // Base XP rewards
    const baseMobXP = 10; // Base XP per mob kill
    const baseBossXP = 100; // Base XP for full boss kill

    // Get all shadows to calculate XP
    const allShadows = await this.getAllShadows();
    const shadowMap = new Map(allShadows.map((s) => [s.id, s]));

    let totalXPGranted = 0;
    const leveledUpShadows = [];
    const rankedUpShadows = [];

    // Process shadow contributions (functional approach)
    for (const [shadowId, contribution] of Object.entries(contributions).filter(([shadowId]) =>
      shadowMap.has(shadowId)
    )) {
      const shadow = shadowMap.get(shadowId);
      if (!shadow) continue;

      // Get shadow rank multiplier (higher rank shadows get more XP)
      const shadowRank = shadow.rank || 'E';
      const shadowRanks = this.shadowArmy.shadowRanks || [
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
      const shadowRankIndex = shadowRanks.indexOf(shadowRank);
      const shadowRankMultiplier = 1.0 + shadowRankIndex * 0.3; // E=1.0, D=1.3, SSS=2.4, etc.

      // Calculate mob kill XP
      const mobKillXP = contribution.mobsKilled * baseMobXP;

      // Calculate boss damage XP (proportional to damage dealt)
      const bossMaxHP = dungeon.boss.maxHp || dungeon.boss.hp || 1000;
      const bossDamagePercent = Math.min(1.0, contribution.bossDamage / bossMaxHP);
      const bossDamageXP = bossDamagePercent * baseBossXP;

      // Total XP = (mob kills + boss damage) * dungeon rank * shadow rank
      const totalXP = Math.round(
        (mobKillXP + bossDamageXP) * dungeonRankMultiplier * shadowRankMultiplier
      );

      if (totalXP > 0) {
        // Get shadow's current level and rank before granting XP
        const levelBefore = shadow.level || 1;
        const rankBefore = shadow.rank;

        // Grant XP using ShadowArmy's method (grant to specific shadow)
        // This will also trigger automatic rank-up if shadow qualifies
        await this.shadowArmy.grantShadowXP(totalXP, `dungeon_${dungeon.rank}_${channelKey}`, [
          shadowId,
        ]);

        // Grant combat time for natural growth
        // Calculate combat time based on dungeon duration
        const dungeonDuration = Date.now() - dungeon.startTime;
        const combatHours = dungeonDuration / (1000 * 60 * 60);

        if (this.shadowArmy.applyNaturalGrowth && combatHours > 0) {
          const growthApplied = await this.shadowArmy.applyNaturalGrowth(shadow, combatHours);

          // Save shadow with updated combat time to IndexedDB
          if (growthApplied && this.shadowArmy.storageManager) {
            await this.shadowArmy.storageManager.saveShadow(shadow);
          }
        }

        // Check if shadow leveled up
        const levelAfter = shadow.level || 1;
        if (levelAfter > levelBefore) {
          leveledUpShadows.push({
            shadow,
            levelBefore,
            levelAfter,
            name: shadow.name || 'Shadow',
            rank: shadow.rank,
          });
        }

        // Check if shadow ranked up (automatic)
        const rankAfter = shadow.rank;
        if (rankAfter !== rankBefore) {
          rankedUpShadows.push({
            name: shadow.name || 'Shadow',
            oldRank: rankBefore,
            newRank: rankAfter,
          });
          // Auto rank-up (silent)
        }

        totalXPGranted += totalXP;
      }
    }

    // Return stats instead of showing notifications
    return {
      totalXP: totalXPGranted,
      leveledUp: leveledUpShadows,
      rankedUp: rankedUpShadows,
    };
  }

  // ============================================================================
  // VISUAL INDICATORS (BETTER SVG ICON)
  // ============================================================================
  showDungeonIndicator(channelKey, channelInfo) {
    const channelSelector = `[data-list-item-id="channels___${channelInfo.channelId}"]`;
    const channelElement = document.querySelector(channelSelector);
    if (!channelElement) return;

    const indicator = document.createElement('div');
    indicator.className = 'dungeon-indicator';
    indicator.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 6h16M4 6v12M20 6v12M8 6v12M16 6v12"></path>
        <path d="M6 10h4M14 10h4"></path>
        <path d="M12 2v4"></path>
        <circle cx="10" cy="14" r="1" fill="#8b5cf6"></circle>
        <circle cx="14" cy="14" r="1" fill="#8b5cf6"></circle>
      </svg>
    `;
    indicator.title = 'Active Dungeon in this Channel';
    indicator.style.cssText = `
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      animation: dungeonPulse 2s infinite;
      z-index: 10;
      cursor: default;
      pointer-events: none;
    `;

    if (getComputedStyle(channelElement).position === 'static') {
      channelElement.style.position = 'relative';
    }

    // Indicator is NOT clickable - use JOIN button in boss HP bar instead
    // pointer-events: none prevents any interaction

    channelElement.appendChild(indicator);
    this.dungeonIndicators.set(channelKey, indicator);
  }

  removeDungeonIndicator(channelKey) {
    const indicator = this.dungeonIndicators.get(channelKey);
    if (indicator?.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
    this.dungeonIndicators.delete(channelKey);
  }

  removeAllIndicators() {
    this.dungeonIndicators.forEach((indicator) => {
      if (indicator?.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    });
    this.dungeonIndicators.clear();
  }

  // ============================================================================
  // UI HELPERS - Channel Header & DOM Manipulation
  // ============================================================================

  updateBossHPBar(channelKey) {
    // CRITICAL: SYNC FROM STATS PLUGIN FIRST (get freshest HP/Mana)
    // Ensures HP bar shows accurate participation status
    this.syncHPAndManaFromStats();

    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.boss.hp <= 0) {
      this.removeBossHPBar(channelKey);
      this.showChannelHeaderComments(channelKey);
      return;
    }

    // Get current channel info to check if this is the active channel
    const currentChannelInfo = this.getChannelInfo();
    if (!currentChannelInfo) {
      // Retry after delay
      setTimeout(() => this.updateBossHPBar(channelKey), 500);
      return;
    }

    const isCurrentChannel =
      currentChannelInfo.channelId === dungeon.channelId &&
      currentChannelInfo.guildId === dungeon.guildId;

    if (!isCurrentChannel) {
      // Not the current channel, remove HP bar if it exists (if already created)
      const existingBar = this.bossHPBars.get(channelKey);
      if (existingBar) {
        this.removeBossHPBar(channelKey);
        this.showChannelHeaderComments(channelKey);
      }
      return;
    }

    // Force recreate boss HP bar when returning to dungeon channel
    // This ensures it shows correctly after guild/channel switches
    const existingBar = this.bossHPBars.get(channelKey);
    if (existingBar && !document.body.contains(existingBar)) {
      // Bar exists but not in DOM - force recreate
      this.bossHPBars.delete(channelKey);
    }

    // Hide comments in channel header to make room
    this.hideChannelHeaderComments(channelKey);

    const hpPercent = (dungeon.boss.hp / dungeon.boss.maxHp) * 100;
    let hpBar = this.bossHPBars.get(channelKey);

    if (!hpBar) {
      // Find channel header using robust selectors
      const channelHeader = this.findChannelHeader();
      if (!channelHeader) {
        // Retry after delay if header not found
        setTimeout(() => this.updateBossHPBar(channelKey), 500);
        return;
      }

      hpBar = document.createElement('div');
      hpBar.className = 'dungeon-boss-hp-bar';
      hpBar.setAttribute('data-dungeon-boss-hp-bar', channelKey);

      // Force HP bar visibility with inline styles
      hpBar.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        gap: 6px !important;
        padding: 12px 14px !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 auto !important;
        background: rgba(30, 30, 45, 0.85) !important;
        border: 1px solid rgba(139, 92, 246, 0.4) !important;
        border-radius: 8px !important;
        backdrop-filter: blur(6px) !important;
        box-shadow: 0 2px 8px rgba(139, 92, 246, 0.15) !important;
        visibility: visible !important;
        opacity: 1 !important;
        box-sizing: border-box !important;
        overflow: visible !important;
      `;

      // CRITICAL FIX: Create dedicated container that sits BELOW the header
      // Clean up any existing containers first to prevent duplicates
      document.querySelectorAll('.dungeon-boss-hp-container').forEach((el) => {
        if (!el.querySelector('.dungeon-boss-hp-bar')) {
          // Empty container, remove it
          el.remove();
        }
      });

      let bossHpContainer = channelHeader.querySelector('.dungeon-boss-hp-container');

      if (!bossHpContainer) {
        // Create container that sits below channel header
        bossHpContainer = document.createElement('div');
        bossHpContainer.className = 'dungeon-boss-hp-container';
        bossHpContainer.setAttribute('data-channel-key', channelKey);

        // FORCE MAXIMUM VISIBILITY with inline styles (CSS-independent!)
        bossHpContainer.style.cssText = `
          display: block !important;
          position: relative !important;
          width: 100% !important;
          max-width: 100% !important;
          min-height: 70px !important;
          padding: 12px 16px !important;
          margin: 0 !important;
          background: linear-gradient(180deg, #14141e 0%, #0f0f19 100%) !important;
          border-top: 1px solid rgba(139, 92, 246, 0.3) !important;
          border-bottom: 3px solid #8b5cf6 !important;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5), inset 0 2px 4px rgba(139, 92, 246, 0.2) !important;
          z-index: 999999 !important;
          backdrop-filter: blur(10px) !important;
          visibility: visible !important;
          opacity: 1 !important;
          overflow: hidden !important;
          pointer-events: auto !important;
          box-sizing: border-box !important;
        `;

        // Insert after the channel header (as a sibling)
        if (channelHeader.parentElement) {
          channelHeader.parentElement.insertBefore(bossHpContainer, channelHeader.nextSibling);
        } else {
          // Fallback: append to channel header itself
          channelHeader.appendChild(bossHpContainer);
        }
      } else {
        // Clear existing content
        bossHpContainer.innerHTML = '';
      }

      // Now add the HP bar to this dedicated container
      bossHpContainer.appendChild(hpBar);

      this.bossHPBars.set(channelKey, hpBar);
    }

    // REAL-TIME: Get fresh mob counts every update (reflects current combat state)
    // Filter out dead mobs (hp <= 0) to show accurate alive count
    const aliveMobs = dungeon.mobs?.activeMobs?.filter((m) => m && m.hp > 0).length || 0;
    const totalMobs = dungeon.mobs?.targetCount || 0;
    const _killedMobs = dungeon.mobs?.killed || 0; // Used in display calculation

    // Ensure mob count is accurate by cleaning dead mobs from array
    if (dungeon.mobs?.activeMobs) {
      dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m && m.hp > 0);
    }

    // REAL-TIME: Get current boss HP (ensure it's up-to-date)
    const currentBossHP = dungeon.boss?.hp || 0;
    const currentBossMaxHP = dungeon.boss?.maxHp || 0;

    // Participation indicator
    const participationBadge = dungeon.userParticipating
      ? '<span style="color: #10b981; font-weight: 700;">FIGHTING</span>'
      : '<span style="color: #8b5cf6; font-weight: 700;">WATCHING</span>';

    // JOIN button (only show if NOT participating)
    const joinButtonHTML = !dungeon.userParticipating
      ? `
      <button class="dungeon-join-btn" data-channel-key="${channelKey}" style="
        padding: 4px 12px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
      " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.6)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 6px rgba(16, 185, 129, 0.4)';">
        JOIN
      </button>
    `
      : '';

    // LEAVE button (only show if IS participating)
    const leaveButtonHTML = dungeon.userParticipating
      ? `
      <button class="dungeon-leave-btn" data-channel-key="${channelKey}" style="
        padding: 4px 12px;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);
      " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px rgba(239, 68, 68, 0.6)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 6px rgba(239, 68, 68, 0.4)';">
        LEAVE
      </button>
    `
      : '';

    // Multi-line layout to show all info without truncation
    hpBar.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
            <div style="color: #a78bfa; font-weight: 700; font-size: 13px; text-shadow: 0 0 8px rgba(139, 92, 246, 0.8); white-space: nowrap;">
              ${participationBadge} | ${dungeon.name} [${dungeon.rank}]
        </div>
            ${joinButtonHTML}
            ${leaveButtonHTML}
          </div>
          <div style="color: #e879f9; font-size: 11px; font-weight: 600; flex-shrink: 0;">
            ${dungeon.type}
        </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: #c4b5fd;">
          <div>
            <span style="color: #94a3b8;">Boss:</span>
            <span style="color: #f87171; font-weight: 700;">${Math.floor(
              currentBossHP
            ).toLocaleString()}</span>
            <span style="color: #64748b;">/</span>
            <span style="color: #fbbf24;">${currentBossMaxHP.toLocaleString()}</span>
          </div>
          <div>
            <span style="color: #94a3b8;">Mobs:</span>
            <span style="color: #34d399; font-weight: 700;">${aliveMobs.toLocaleString()}</span>
            <span style="color: #64748b;">/</span>
            <span style="color: #94a3b8;">${totalMobs.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div class="hp-bar-container" style="
        height: 14px !important;
        width: 100% !important;
        max-width: 100% !important;
        background: linear-gradient(180deg, rgba(15, 15, 25, 0.9), rgba(20, 20, 30, 0.95)) !important;
        border-radius: 8px !important;
        overflow: hidden !important;
        position: relative !important;
        border: 1px solid rgba(139, 92, 246, 0.5) !important;
        box-sizing: border-box !important;
        margin-top: 4px !important;
      ">
        <div class="hp-bar-fill" style="
          width: ${hpPercent}%;
          height: 100% !important;
          background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 40%, #ec4899 80%, #f97316 100%) !important;
          border-radius: 8px !important;
          transition: width 0.5s ease !important;
        "></div>
        <div class="hp-bar-text" style="
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          color: white !important;
          font-size: 10px !important;
          font-weight: 800 !important;
          text-shadow: 0 0 6px rgba(0, 0, 0, 1) !important;
        ">${Math.floor(hpPercent)}%</div>
      </div>
    `;

    // Add JOIN button click handler
    const joinBtn = hpBar.querySelector('.dungeon-join-btn');
    if (joinBtn) {
      joinBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        // Validate active dungeon status first (clear invalid references)
        this.validateActiveDungeonStatus();

        // Check if already in another dungeon
        if (this.settings.userActiveDungeon && this.settings.userActiveDungeon !== channelKey) {
          const activeDungeon = this.activeDungeons.get(this.settings.userActiveDungeon);
          // If previous dungeon doesn't exist or is completed/failed, clear the reference
          if (!activeDungeon || activeDungeon.completed || activeDungeon.failed) {
            this.settings.userActiveDungeon = null;
            this.saveSettings();
          } else {
            // Previous dungeon is still active
            this.showToast(`Already in ${activeDungeon.name}!\nComplete it first.`, 'error');
            return;
          }
        }

        // Join this dungeon
        await this.selectDungeon(channelKey);
      });
    }

    // Add LEAVE button click handler
    const leaveBtn = hpBar.querySelector('.dungeon-leave-btn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        // Leave the dungeon
        dungeon.userParticipating = false;
        this.settings.userActiveDungeon = null;
        this.saveSettings();

        // Update HP bar to show WATCHING + JOIN button
        this.updateBossHPBar(channelKey);

        this.showToast(`Left ${dungeon.name}. You can now join other dungeons.`, 'info');
      });
    }
  }

  /**
   * Find channel header element using multiple strategies
   * @returns {HTMLElement|null} Channel header element or null
   */
  findChannelHeader() {
    // Strategy 1: Use aria-label (most stable)
    let header =
      document.querySelector('section[aria-label="Channel header"]') ||
      document.querySelector('section[aria-label*="Channel header"]');

    // Strategy 2: Use semantic class fragments
    if (!header) {
      header =
        document.querySelector('[class*="title"][class*="container"]') ||
        document.querySelector('[class*="channelHeader"]');
    }

    return header;
  }

  /**
   * Hide comments in channel header to make room for boss HP bar
   */
  hideChannelHeaderComments(channelKey) {
    if (this.hiddenComments.has(channelKey)) return; // Already hidden

    // Find comment-related elements in channel header
    const channelHeader = this.findChannelHeader();
    if (!channelHeader) return;

    // Look for comment buttons/elements using multiple strategies
    const allButtons = channelHeader.querySelectorAll('button[class*="button"]');
    const commentElements = [];

    allButtons.forEach((button) => {
      const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
      const className = (button.className || '').toLowerCase();
      const textContent = (button.textContent || '').toLowerCase();

      // Check if it's a comment/thread related button
      const isCommentButton =
        ariaLabel.includes('comment') ||
        ariaLabel.includes('thread') ||
        ariaLabel.includes('reply') ||
        className.includes('comment') ||
        className.includes('thread') ||
        className.includes('reply') ||
        textContent.includes('comment') ||
        textContent.includes('thread');

      // Also check for buttons with SVG icons that might be comment buttons
      const hasIcon = button.querySelector('svg');
      const isInToolbar = button.closest('[class*="toolbar"]');

      if (isCommentButton || (hasIcon && isInToolbar && ariaLabel)) {
        commentElements.push(button);
      }
    });

    // Also look for comment-related elements by class
    const classBasedElements = [
      ...channelHeader.querySelectorAll('[class*="comment"]'),
      ...channelHeader.querySelectorAll('[class*="thread"]'),
      ...channelHeader.querySelectorAll('[class*="reply"]'),
    ].filter((el) => {
      // Make sure it's actually visible and in the toolbar area
      const style = window.getComputedStyle(el);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        (el.closest('[class*="toolbar"]') || el.closest('[class*="upperContainer"]'))
      );
    });

    // Combine and deduplicate
    const allCommentElements = [...new Set([...commentElements, ...classBasedElements])];

    const hidden = [];
    allCommentElements.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        hidden.push({
          element: el,
          originalDisplay: el.style.display || '',
          originalVisibility: el.style.visibility || '',
        });
        el.style.display = 'none';
      }
    });

    if (hidden.length > 0) {
      this.hiddenComments.set(channelKey, hidden);
    }
  }

  /**
   * Show comments in channel header again
   */
  showChannelHeaderComments(channelKey) {
    const hidden = this.hiddenComments.get(channelKey);
    if (!hidden) return;

    hidden.forEach(({ element, originalDisplay, originalVisibility }) => {
      if (element && element.parentNode) {
        element.style.display = originalDisplay || '';
        if (originalVisibility) {
          element.style.visibility = originalVisibility;
        }
      }
    });

    this.hiddenComments.delete(channelKey);
  }

  removeBossHPBar(channelKey) {
    const hpBar = this.bossHPBars.get(channelKey);
    if (hpBar?.parentNode) {
      const container = hpBar.parentNode;
      hpBar.parentNode.removeChild(hpBar);

      // If container is now empty, remove it too
      if (
        container.classList.contains('dungeon-boss-hp-container') &&
        container.children.length === 0
      ) {
        container.parentNode?.removeChild(container);
      }
    }
    this.bossHPBars.delete(channelKey);
    // Restore comments when boss HP bar is removed
    this.showChannelHeaderComments(channelKey);
  }

  removeAllBossHPBars() {
    this.bossHPBars.forEach((hpBar) => {
      if (hpBar?.parentNode) {
        const container = hpBar.parentNode;
        hpBar.parentNode.removeChild(hpBar);

        // If container is now empty, remove it too
        if (
          container.classList.contains('dungeon-boss-hp-container') &&
          container.children.length === 0
        ) {
          container.parentNode?.removeChild(container);
        }
      }
    });
    this.bossHPBars.clear();

    // Also remove any orphaned containers
    document.querySelectorAll('.dungeon-boss-hp-container').forEach((container) => {
      if (container.children.length === 0) {
        container.remove();
      }
    });
  }

  // ============================================================================
  // USER HP/MANA BARS
  // ============================================================================
  // ============================================================================
  // USER HP/MANA BARS - Legacy Code Removed
  // ============================================================================
  // User HP/Mana bars are now displayed by SoloLevelingStats plugin in chat UI header
  // All HP bar creation, positioning, and update code has been removed
  // HP/Mana calculations (calculateHP, calculateMana) are still used by resurrection system

  updateUserHPBar() {
    // Stub for compatibility - SoloLevelingStats handles HP/Mana display
    return;
  }

  removeUserHPBar() {
    // Stub for compatibility - SoloLevelingStats handles HP/Mana display
    return;
  }

  // ============================================================================
  // DUNGEON SELECTION UI (CHAT BUTTON)
  // ============================================================================
  findToolbar() {
    // Method 1: Look for existing TitleManager or SkillTree buttons to find toolbar
    const _titleBtn = document.querySelector('.tm-title-button');
    const skillTreeBtn = document.querySelector('.st-skill-tree-button');
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

  createDungeonButton() {
    // DISABLED: Dungeon UI button removed from chat toolbar
    // Use channel indicators (fortress icon) and boss HP bar (JOIN/LEAVE) instead
    return;
  }

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
      // Track observer for cleanup
      this._observers.add(this.toolbarObserver);
      // Clear any pending timeout to debounce rapid changes
      if (this._recreateTimeout) {
        clearTimeout(this._recreateTimeout);
      }

      // Use instance variable so timeout persists
      this._recreateTimeout = setTimeout(() => {
        const dungeonBtnExists = this.dungeonButton && toolbar.contains(this.dungeonButton);
        if (!dungeonBtnExists && !this._creatingDungeonButton && this.started) {
          this.debugLog('Button missing, recreating...');
          this.createDungeonButton();
        }
        this._recreateTimeout = null;
      }, 100);
    });

    this.toolbarObserver.observe(toolbar, { childList: true, subtree: true });
  }

  removeDungeonButton() {
    if (this.dungeonButton) {
      this.dungeonButton.remove();
      this.dungeonButton = null;
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

  openDungeonModal() {
    if (this.dungeonModal) {
      this.closeDungeonModal();
      return;
    }

    const dungeons = Array.from(this.activeDungeons.values());

    if (dungeons.length === 0) {
      this.showToast('No active dungeons', 'info');
      return;
    }

    // Create modal similar to TitleManager/SkillTree style
    const modal = document.createElement('div');
    modal.className = 'dungeons-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(5px);
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      width: 90%;
      max-width: 700px;
      max-height: 90vh;
      background: #1e1e1e;
      border: 2px solid #8b5cf6;
      border-radius: 12px;
      padding: 20px;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    `;

    // Function to render dungeon list with real-time updates
    const renderDungeonList = () => {
      const currentDungeons = Array.from(this.activeDungeons.values());

      let headerHTML =
        '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">';
      headerHTML +=
        '<h2 style="color: #8b5cf6; margin: 0;">Active Dungeons (' +
        currentDungeons.length +
        ')</h2>';
      headerHTML +=
        '<button id="close-dungeon-modal" style="background: transparent; border: none; color: #999; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">×</button>';
      headerHTML += '</div>';

      let listHTML = '<div id="dungeon-list">';

      // Use helper method for HTML escaping

      if (currentDungeons.length === 0) {
        listHTML +=
          '<div style="text-align: center; padding: 40px; color: #999;">No active dungeons</div>';
      } else {
        currentDungeons.forEach((dungeon) => {
          const isActive = this.settings.userActiveDungeon === dungeon.channelKey;
          const elapsed = Date.now() - dungeon.startTime;
          const remaining = Math.max(0, this.settings.dungeonDuration - elapsed);
          const timeStr = this.formatTimeRemaining(remaining);
          const mobsKilled = dungeon.mobs?.killed || 0;
          const activeMobs = dungeon.mobs?.activeMobs || [];
          const deadCount = this.deadShadows.get(dungeon.channelKey)?.size || 0;
          const bossHP = dungeon.boss?.hp || 0;
          const bossMaxHP = dungeon.boss?.maxHp || 1;
          const bossHPPercent = Math.floor((bossHP / bossMaxHP) * 100);
          const channelName = dungeon.channelName || dungeon.channelKey;
          const bossName = dungeon.boss?.name || 'Unknown';

          const bgColor = isActive ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)';
          const borderColor = isActive ? '#8b5cf6' : '#444';

          listHTML +=
            '<div style="background: ' +
            bgColor +
            '; border: 2px solid ' +
            borderColor +
            '; border-radius: 8px; padding: 15px; margin-bottom: 12px;">';
          listHTML +=
            '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">';
          listHTML += '<div style="flex: 1;">';
          listHTML +=
            '<div style="color: #8b5cf6; font-weight: bold; font-size: 16px; margin-bottom: 4px;">' +
            this.escapeHtml(dungeon.name) +
            '</div>';
          listHTML +=
            '<div style="color: #999; font-size: 12px; margin-bottom: 2px;">Rank: ' +
            dungeon.rank +
            ' [' +
            (dungeon.type || 'Normal') +
            '] • Channel: ' +
            this.escapeHtml(channelName) +
            '</div>';
          listHTML +=
            '<div style="color: #f59e0b; font-size: 11px;">Time: ' + timeStr + ' remaining</div>';
          listHTML +=
            '<div style="color: #888; font-size: 10px;">Mobs: ' +
            mobsKilled +
            '/' +
            (dungeon.mobs?.targetCount || 0) +
            ' killed</div>';
          listHTML += '</div>';
          if (isActive) {
            listHTML +=
              '<div style="color: #8b5cf6; font-size: 12px; font-weight: bold;">ACTIVE</div>';
          }
          listHTML += '</div>';
          listHTML += '<div style="margin-bottom: 8px;">';
          listHTML +=
            '<div style="color: #ec4899; font-size: 11px; margin-bottom: 4px;">Boss: ' +
            this.escapeHtml(bossName) +
            ' (' +
            Math.floor(bossHP) +
            '/' +
            Math.floor(bossMaxHP) +
            ' HP)</div>';
          listHTML +=
            '<div style="background: #1a1a1a; border-radius: 4px; height: 12px; overflow: hidden; position: relative;">';
          listHTML +=
            '<div style="background: linear-gradient(90deg, #8b5cf6 0%, #ec4899 100%); height: 100%; width: ' +
            bossHPPercent +
            '%; transition: width 0.3s ease;"></div>';
          listHTML +=
            '<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; color: white; font-size: 9px; font-weight: bold; text-shadow: 0 0 3px rgba(0,0,0,0.9);">' +
            bossHPPercent +
            '%</div>';
          listHTML += '</div>';
          listHTML += '</div>';
          listHTML +=
            '<div style="color: #999; font-size: 11px; margin-bottom: 8px;">Mobs: ' +
            activeMobs.length +
            ' alive • ' +
            mobsKilled +
            ' killed';
          if (deadCount > 0) {
            listHTML += ' | ' + deadCount + ' dead shadows';
          }
          listHTML += '</div>';
          if (!isActive) {
            listHTML +=
              '<button class="join-dungeon-btn" data-channel-key="' +
              dungeon.channelKey +
              '" style="width: 100%; padding: 8px; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; transition: background 0.2s;">Join Dungeon</button>';
          }
          listHTML += '</div>';
        });
      }

      listHTML += '</div>';
      modalContent.innerHTML = headerHTML + listHTML;
    };

    // Initial render
    renderDungeonList();

    // Append modal content to modal
    modal.appendChild(modalContent);

    // Update every second for real-time timer and HP updates
    const updateInterval = setInterval(() => {
      if (!this.dungeonModal || !document.body.contains(modal)) {
        clearInterval(updateInterval);
        this._intervals.delete(updateInterval);
        return;
      }
      renderDungeonList();
    }, 1000);
    this._intervals.add(updateInterval);

    document.body.appendChild(modal);
    this.dungeonModal = modal;

    // Use event delegation for all buttons (handles dynamic re-rendering)
    modalContent.addEventListener('click', (e) => {
      // Close button
      if (e.target.id === 'close-dungeon-modal') {
        clearInterval(updateInterval);
        this.closeDungeonModal();
        return;
      }

      // Join buttons
      if (e.target.classList.contains('join-dungeon-btn')) {
        const channelKey = e.target.getAttribute('data-channel-key');
        this.selectDungeon(channelKey);
      }
    });

    // Add hover effects to join buttons
    modalContent.addEventListener('mouseover', (e) => {
      if (e.target.classList.contains('join-dungeon-btn')) {
        e.target.style.background = '#7c3aed';
      }
    });
    modalContent.addEventListener('mouseout', (e) => {
      if (e.target.classList.contains('join-dungeon-btn')) {
        e.target.style.background = '#8b5cf6';
      }
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        clearInterval(updateInterval);
        this.closeDungeonModal();
      }
    });
  }

  closeDungeonModal() {
    if (this.dungeonModal) {
      this.dungeonModal.remove();
      this.dungeonModal = null;
    }
  }

  // ============================================================================
  // PERFORMANCE OPTIMIZATION: Active/Background Dungeon System
  // ============================================================================
  /**
   * Check if a dungeon is "active" (user participating OR watching)
   * Active dungeons process at full speed, background dungeons process slower
   */
  isActiveDungeon(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return false;

    // Active if user is participating
    if (dungeon.userParticipating) return true;

    // Active if user is watching (current channel matches dungeon channel)
    if (this.currentChannelKey === channelKey) return true;

    return false;
  }

  /**
   * Start tracking current channel for active dungeon detection
   */
  startCurrentChannelTracking() {
    if (this.currentChannelUpdateInterval) return;

    const updateCurrentChannel = () => {
      const channelInfo = this.getChannelInfo();
      if (channelInfo) {
        const newChannelKey = `${channelInfo.guildId}_${channelInfo.channelId}`;
        if (newChannelKey !== this.currentChannelKey) {
          this.currentChannelKey = newChannelKey;

          // Restart intervals with correct frequency when channel changes
          this.activeDungeons.forEach((dungeon, channelKey) => {
            const _wasActive = this.isActiveDungeon(channelKey);
            // Restart intervals to apply correct frequency
            if (this.shadowAttackIntervals.has(channelKey)) {
              this.stopShadowAttacks(channelKey);
              this.startShadowAttacks(channelKey);
            }
            if (this.bossAttackTimers.has(channelKey)) {
              this.stopBossAttacks(channelKey);
              this.startBossAttacks(channelKey);
            }
            if (this.mobAttackTimers.has(channelKey)) {
              this.stopMobAttacks(channelKey);
              this.startMobAttacks(channelKey);
            }
          });
        }
      }
    };

    // Update every 2 seconds
    this.currentChannelUpdateInterval = setInterval(updateCurrentChannel, 2000);
    this._intervals.add(this.currentChannelUpdateInterval);
    updateCurrentChannel(); // Initial update
  }

  stopCurrentChannelTracking() {
    if (this.currentChannelUpdateInterval) {
      clearInterval(this.currentChannelUpdateInterval);
      this.currentChannelUpdateInterval = null;
    }
    this.currentChannelKey = null;
  }

  /**
   * Queue HP bar update (throttled to max 1 per second per channel)
   */
  queueHPBarUpdate(channelKey) {
    if (!this._hpBarUpdateQueue) this._hpBarUpdateQueue = new Set();
    if (!this._lastHPBarUpdate) this._lastHPBarUpdate = {};

    const now = Date.now();
    const lastUpdate = this._lastHPBarUpdate[channelKey] || 0;

    // REDUCED THROTTLE: Max 4 updates per second (250ms) for responsive UI
    // Was 1 second (too laggy), now 250ms (smooth real-time feel)
    if (now - lastUpdate < 250) {
      // Queue for later
      this._hpBarUpdateQueue.add(channelKey);
    } else {
      // Update immediately
      this._lastHPBarUpdate[channelKey] = now;
      this.updateBossHPBar(channelKey);
    }

    // Schedule batch update if not already scheduled
    if (!this._hpBarUpdateScheduled && this._hpBarUpdateQueue.size > 0) {
      this._hpBarUpdateScheduled = true;
      requestAnimationFrame(() => {
        this.processHPBarUpdateQueue();
      });
    }
  }

  /**
   * Process queued HP bar updates (throttled)
   */
  processHPBarUpdateQueue() {
    if (!this._hpBarUpdateQueue || this._hpBarUpdateQueue.size === 0) {
      this._hpBarUpdateScheduled = false;
      return;
    }

    const now = Date.now();
    const toUpdate = Array.from(this._hpBarUpdateQueue);
    this._hpBarUpdateQueue.clear();

    toUpdate.forEach((channelKey) => {
      const lastUpdate = this._lastHPBarUpdate[channelKey] || 0;
      if (now - lastUpdate >= 1000) {
        // Throttle passed, update now
        this._lastHPBarUpdate[channelKey] = now;
        this.updateBossHPBar(channelKey);
      } else {
        // Still throttled, re-queue
        this._hpBarUpdateQueue.add(channelKey);
      }
    });

    // Schedule next batch if queue not empty
    if (this._hpBarUpdateQueue.size > 0) {
      requestAnimationFrame(() => {
        this.processHPBarUpdateQueue();
      });
    } else {
      this._hpBarUpdateScheduled = false;
    }
  }

  setupChannelWatcher() {
    let lastChannelKey = null;

    const checkChannel = () => {
      const channelInfo = this.getChannelInfo();
      if (!channelInfo) return;

      const currentChannelKey = `${channelInfo.guildId}_${channelInfo.channelId}`;

      // If channel changed, update all boss HP bars and indicators
      if (currentChannelKey !== lastChannelKey) {
        lastChannelKey = currentChannelKey;
        this.currentChannelKey = currentChannelKey; // Update tracking

        // Validate active dungeon status when channel changes
        this.validateActiveDungeonStatus();

        // Remove all existing boss HP bars first (clean slate)
        this.removeAllBossHPBars();

        // Update indicators when channel changes
        this.updateAllIndicators();
        this.updateUserHPBar();

        // Update boss HP bars for all active dungeons
        this.activeDungeons.forEach((dungeon, channelKey) => {
          this.updateBossHPBar(channelKey);
        });
      }
    };

    // Check immediately
    checkChannel();

    // Watch for URL changes
    let lastUrl = window.location.href;
    const urlObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(() => {
          checkChannel();
          // Recreate button when channel changes (Discord may recreate toolbar)
          if (!this.dungeonButton) {
            this.createDungeonButton();
          }
        }, 100);
      }
    });

    urlObserver.observe(document, { childList: true, subtree: true });

    // Also listen to popstate for browser navigation
    this._popstateHandler = () => {
      setTimeout(() => {
        checkChannel();
        // Recreate button when navigating
        if (!this.dungeonButton) {
          this.createDungeonButton();
        }
      }, 100);
    };
    window.addEventListener('popstate', this._popstateHandler);
    // Track listener for cleanup
    if (!this._listeners.has('popstate')) {
      this._listeners.set('popstate', new Set());
    }
    this._listeners.get('popstate').add(this._popstateHandler);

    // Start observing channel header when available
    const startHeaderObserver = () => {
      const header = this.findChannelHeader();
      if (header) {
        // Only instantiate observer after finding header
        const headerObserver = new MutationObserver(() => {
          checkChannel();
        });
        headerObserver.observe(header, { childList: true, subtree: true });

        // Store in channelWatcher for cleanup
        if (this.channelWatcher) {
          this.channelWatcher.headerObserver = headerObserver;
        }
      } else {
        // Track retry timeout and check plugin running state
        const retryId = setTimeout(() => {
          if (this.started) {
            startHeaderObserver();
          }
        }, 1000);
        this._retryTimeouts.push(retryId);
      }
    };
    // Initialize channelWatcher with urlObserver (headerObserver added later when header found)
    this.channelWatcher = { urlObserver, headerObserver: null };

    startHeaderObserver();

    // Also use interval as fallback for more responsive channel detection
    this.channelWatcherInterval = setInterval(checkChannel, 500);
    this._intervals.add(this.channelWatcherInterval);
  }

  stopChannelWatcher() {
    if (this.channelWatcher) {
      if (this.channelWatcher.urlObserver) {
        this.channelWatcher.urlObserver.disconnect();
      }
      if (this.channelWatcher.headerObserver) {
        this.channelWatcher.headerObserver.disconnect();
      }
      this.channelWatcher = null;
    }
    if (this.channelWatcherInterval) {
      clearInterval(this.channelWatcherInterval);
      this.channelWatcherInterval = null;
    }
  }

  /**
   * Update all dungeon indicators when channel changes
   */
  updateAllIndicators() {
    this.activeDungeons.forEach((dungeon, channelKey) => {
      const channelInfo = { channelId: dungeon.channelId, guildId: dungeon.guildId };
      this.removeDungeonIndicator(channelKey);
      this.showDungeonIndicator(channelKey, channelInfo);
    });
  }

  // ============================================================================
  // MOB KILL NOTIFICATIONS
  // ============================================================================
  startMobKillNotifications(channelKey) {
    if (this.mobKillNotificationTimers.has(channelKey)) return;
    const timer = setInterval(() => {
      this.showMobKillSummary(channelKey);
    }, this.settings.mobKillNotificationInterval);
    this.mobKillNotificationTimers.set(channelKey, timer);
  }

  stopMobKillNotifications(channelKey) {
    const timer = this.mobKillNotificationTimers.get(channelKey);
    if (timer) {
      clearInterval(timer);
      this.mobKillNotificationTimers.delete(channelKey);
    }
  }

  stopAllDungeonCleanup() {
    this.mobKillNotificationTimers.forEach((timer) => clearInterval(timer));
    this.mobKillNotificationTimers.clear();
    this.stopAllMobSpawning();
    if (this.dungeonCleanupInterval) {
      clearInterval(this.dungeonCleanupInterval);
      this.dungeonCleanupInterval = null;
    }
  }

  showMobKillSummary(channelKey) {
    const notification = this.settings.mobKillNotifications[channelKey];
    if (!notification || notification.count === 0) return;
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;
    const _count = notification.count; // Used in notification display
    notification.count = 0;
    notification.lastNotification = Date.now();
    // Silent mob kills (no toast spam - count shown in completion summary)
    this.saveSettings();
  }

  // ============================================================================
  // CLEANUP LOOP
  // ============================================================================
  startDungeonCleanupLoop() {
    if (this.dungeonCleanupInterval) return;
    this.dungeonCleanupInterval = setInterval(() => {
      this.cleanupExpiredDungeons();
    }, 60000);
    this._intervals.add(this.dungeonCleanupInterval);
  }

  cleanupExpiredDungeons() {
    const now = Date.now();
    const expiredChannels = [];
    this.activeDungeons.forEach((dungeon, channelKey) => {
      const elapsed = now - dungeon.startTime;
      if (elapsed >= this.settings.dungeonDuration) {
        expiredChannels.push(channelKey);
      }
    });
    expiredChannels.forEach((channelKey) => {
      this.completeDungeon(channelKey, 'timeout');
    });
  }

  // ============================================================================
  // RESTORE ACTIVE DUNGEONS
  // ============================================================================
  async restoreActiveDungeons() {
    if (!this.storageManager) return;

    // CRITICAL: Clean up any orphaned HP bars from previous session FIRST
    // This prevents lingering HP bars from old dungeons
    const orphans = document.querySelectorAll('.dungeon-boss-hp-bar, .dungeon-boss-hp-container');
    if (orphans.length > 0) {
      orphans.forEach((el) => el.remove());
      this.debugLog(`Cleaned up ${orphans.length} orphaned HP bars from previous session`);
    }

    try {
      const savedDungeons = await this.storageManager.getAllDungeons();

      // Validate userActiveDungeon exists in restored dungeons
      if (this.settings.userActiveDungeon) {
        const activeDungeonExists = savedDungeons.some(
          (d) => d.channelKey === this.settings.userActiveDungeon && !d.completed && !d.failed
        );
        if (!activeDungeonExists) {
          // Clear invalid reference
          this.settings.userActiveDungeon = null;
          this.saveSettings();
          this.debugLog('Cleared stale userActiveDungeon reference on restore');
        }
      }

      savedDungeons.forEach((dungeon) => {
        const elapsed = Date.now() - dungeon.startTime;
        if (elapsed < this.settings.dungeonDuration && !dungeon.completed && !dungeon.failed) {
          // Ensure activeMobs array exists
          if (!dungeon.mobs.activeMobs) {
            dungeon.mobs.activeMobs = [];
          }
          // Ensure shadowHP object exists
          if (!dungeon.shadowHP) {
            dungeon.shadowHP = {};
          }
          // Convert shadowHP from Map to Object if needed (for compatibility)
          if (dungeon.shadowHP instanceof Map) {
            const shadowHPObj = {};
            dungeon.shadowHP.forEach((value, key) => {
              shadowHPObj[key] = value;
            });
            dungeon.shadowHP = shadowHPObj;
          }

          this.activeDungeons.set(dungeon.channelKey, dungeon);
          const channelInfo = { channelId: dungeon.channelId, guildId: dungeon.guildId };
          this.showDungeonIndicator(dungeon.channelKey, channelInfo);
          this.startShadowAttacks(dungeon.channelKey);
          this.startBossAttacks(dungeon.channelKey);
          this.startMobAttacks(dungeon.channelKey);
          this.startMobKillNotifications(dungeon.channelKey);
          this.startMobSpawning(dungeon.channelKey);

          // Always show boss HP bar (whether participating or watching)
          this.updateBossHPBar(dungeon.channelKey);

          // Only show user HP bar if participating
          if (dungeon.userParticipating) {
            this.updateUserHPBar();
          }
          return;
        }

        // Expired or completed/failed - clean up completely
        this.debugLog(
          `[Dungeons] Cleaning up expired/old dungeon: ${dungeon.name} [${dungeon.rank}]`
        );

        // Remove HP bar if it exists
        this.removeBossHPBar(dungeon.channelKey);

        // Remove any HP bar containers
        document
          .querySelectorAll(`.dungeon-boss-hp-container[data-channel-key="${dungeon.channelKey}"]`)
          .forEach((el) => el.remove());

        // Release channel lock if held
        if (this.channelLocks.has(dungeon.channelKey)) {
          this.channelLocks.delete(dungeon.channelKey);
        }

        // Delete from IndexedDB
        this.storageManager.deleteDungeon(dungeon.channelKey);

        // Clear from memory if somehow still present
        this.activeDungeons.delete(dungeon.channelKey);
      });

      // Only log if dungeons were actually restored
      if (this.activeDungeons.size > 0) {
        console.log(`[Dungeons] Restored ${this.activeDungeons.size} active dungeons`);
      }
    } catch (error) {
      this.errorLog('Failed to restore dungeons', error);
    }
  }

  // ============================================================================
  // GARBAGE COLLECTION & MEMORY MANAGEMENT
  // ============================================================================
  /**
   * Trigger garbage collection and memory cleanup
   * @param {string} trigger - What triggered the GC (periodic, dungeon_complete, manual)
   */
  triggerGarbageCollection(trigger = 'manual') {
    this.debugLog(`Triggering garbage collection (${trigger})`);

    // Clean up stale caches
    const now = Date.now();

    // Clear expired allocation cache
    if (this.allocationCacheTime && now - this.allocationCacheTime > this.allocationCacheTTL) {
      this.allocationCache = null;
      this.allocationCacheTime = null;
      this.debugLog('Cleared expired allocation cache');
    }

    // Clean up extraction events (keep only recent 500)
    if (this.extractionEvents && this.extractionEvents.size > 500) {
      const entries = Array.from(this.extractionEvents.entries());
      this.extractionEvents.clear();
      entries.slice(-500).forEach(([k, v]) => this.extractionEvents.set(k, v));
      this.debugLog(`Trimmed extraction events: ${entries.length} → 500`);
    }

    // Clean up shadow army count cache
    if (this.shadowArmyCountCache && this.shadowArmyCountCache.size > 100) {
      this.shadowArmyCountCache.clear();
      this.debugLog('Cleared shadow army count cache');
    }

    // Clean up last attack time maps (remove old entries)
    [this._lastShadowAttackTime, this._lastBossAttackTime, this._lastMobAttackTime].forEach(
      (map) => {
        if (map && map.size > 50) {
          // Keep only entries for active dungeons
          const activeDungeonKeys = new Set(this.activeDungeons.keys());
          map.forEach((value, key) => {
            if (!activeDungeonKeys.has(key)) {
              map.delete(key);
            }
          });
        }
      }
    );

    // Suggest garbage collection to V8 (if available)
    // eslint-disable-next-line no-undef
    if (typeof global !== 'undefined' && typeof global.gc === 'function') {
      try {
        // eslint-disable-next-line no-undef
        global.gc();
        this.debugLog('V8 garbage collection executed');
      } catch (e) {
        // GC not available (requires --expose-gc flag)
      }
    }
  }

  // ============================================================================
  // TOAST & CSS
  // ============================================================================
  showToast(message, type = 'info') {
    // Try to reload plugin reference if not available
    if (!this.toasts) {
      const toastsPlugin = BdApi.Plugins.get('SoloLevelingToasts');
      if (toastsPlugin?.instance) {
        this.toasts = toastsPlugin.instance;
      }
    }

    if (this.toasts?.showToast) {
      try {
        const result = this.toasts.showToast(message, type);
        return result;
      } catch (error) {
        this.errorLog('Error showing toast via plugin:', error);
        // Fall back to fallback toast
        this.showFallbackToast(message, type);
        return null;
      }
    } else {
      // Fallback: Create a visual notification
      this.showFallbackToast(message, type);
      return null;
    }
  }

  showFallbackToast(message, type = 'info') {
    // Initialize toast container if it doesn't exist
    if (!this.fallbackToastContainer) {
      this.fallbackToastContainer = document.createElement('div');
      this.fallbackToastContainer.id = 'dungeons-fallback-toast-container';
      this.fallbackToastContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10002;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: 350px;
      `;
      document.body.appendChild(this.fallbackToastContainer);
      this.fallbackToasts = [];
    }

    // Color mapping based on type
    const colors = {
      info: { bg: '#8b5cf6', border: '#7c3aed', glow: 'rgba(139, 92, 246, 0.4)' },
      success: { bg: '#10b981', border: '#059669', glow: 'rgba(16, 185, 129, 0.4)' },
      error: { bg: '#ef4444', border: '#dc2626', glow: 'rgba(239, 68, 68, 0.4)' },
      warning: { bg: '#f59e0b', border: '#d97706', glow: 'rgba(245, 158, 11, 0.4)' },
    };
    const color = colors[type] || colors.info;

    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'dungeons-fallback-toast';
    const toastId = `toast-${Date.now()}-${Math.random()}`;
    toast.id = toastId;

    toast.style.cssText = `
      background: linear-gradient(135deg, ${color.bg} 0%, ${color.border} 100%);
      border: 2px solid ${color.border};
      border-radius: 10px;
      padding: 14px 18px;
      color: white;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 4px 20px ${color.glow}, 0 2px 8px rgba(0, 0, 0, 0.3);
      animation: dungeonsToastSlideIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      word-wrap: break-word;
      pointer-events: auto;
      cursor: pointer;
      transition: transform 0.2s ease, opacity 0.2s ease;
      backdrop-filter: blur(10px);
    `;
    toast.textContent = message;

    // Add hover effect
    toast.addEventListener('mouseenter', () => {
      toast.style.transform = 'scale(1.02)';
      toast.style.boxShadow = `0 6px 24px ${color.glow}, 0 4px 12px rgba(0, 0, 0, 0.4)`;
    });
    toast.addEventListener('mouseleave', () => {
      toast.style.transform = 'scale(1)';
      toast.style.boxShadow = `0 4px 20px ${color.glow}, 0 2px 8px rgba(0, 0, 0, 0.3)`;
    });

    // Click to dismiss
    toast.addEventListener('click', () => {
      this.removeFallbackToast(toastId);
    });

    // Add animation styles if not already added
    if (!document.getElementById('dungeons-fallback-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'dungeons-fallback-toast-styles';
      style.textContent = `
        @keyframes dungeonsToastSlideIn {
          from {
            transform: translateX(120%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes dungeonsToastSlideOut {
          from {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
          to {
            transform: translateX(120%) scale(0.8);
            opacity: 0;
          }
        }
        .dungeons-fallback-toast:hover {
          transform: scale(1.02) !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Add to container
    this.fallbackToastContainer.appendChild(toast);
    this.fallbackToasts.push({ id: toastId, element: toast });

    // Limit to 5 toasts max
    if (this.fallbackToasts.length > 5) {
      const oldestToast = this.fallbackToasts.shift();
      this.removeFallbackToast(oldestToast.id);
    }

    // Auto-remove after 4 seconds
    setTimeout(() => {
      this.removeFallbackToast(toastId);
    }, 4000);
  }

  removeFallbackToast(toastId) {
    const toastIndex = this.fallbackToasts.findIndex((t) => t.id === toastId);
    if (toastIndex === -1) return;

    const toast = this.fallbackToasts[toastIndex].element;
    toast.style.animation = 'dungeonsToastSlideOut 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.fallbackToasts.splice(toastIndex, 1);
    }, 300);
  }

  removeCSS() {
    const styleId = 'dungeons-plugin-styles';
    this.removeCSSById(styleId);
  }

  // ============================================================================
  // CSS MANAGEMENT SYSTEM - Advanced Theme Integration & Style Management
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
      if (this.debugError) {
        this.debugError('CSS', 'Invalid CSS injection parameters', {
          styleId,
          hasContent: !!cssContent,
        });
      }
      return false;
    }

    try {
      // Check if style already exists
      const existingStyle = document.getElementById(styleId);
      if (existingStyle && !forceUpdate) {
        if (this.debugLog) {
          this.debugLog('CSS', `Style ${styleId} already exists, skipping injection`);
        }
        return true;
      }

      // Merge with theme variables if enabled
      let finalCSS = cssContent;
      if (useThemeVars) {
        finalCSS = this.mergeCSSWithThemeVars(cssContent);
      }

      // Add priority marker for conflict resolution
      const priorityCSS = `/* Priority: ${priority} */\n${finalCSS}`;

      // Use BdApi.DOM for persistent injection
      if (BdApi && BdApi.DOM && BdApi.DOM.addStyle) {
        BdApi.DOM.addStyle(styleId, priorityCSS);
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

      if (this.debugLog) {
        this.debugLog('CSS', `CSS injected/updated: ${styleId}`, { priority, useThemeVars });
      }
      return true;
    } catch (error) {
      if (this.debugError) {
        this.debugError('CSS', `Failed to inject CSS: ${styleId}`, error);
      }
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
      if (this.debugError) {
        this.debugError('CSS', 'Invalid CSS removal: missing styleId');
      }
      return false;
    }

    try {
      // Try BdApi.DOM.removeStyle first (official API)
      if (BdApi?.DOM?.removeStyle) {
        BdApi.DOM.removeStyle(styleId);
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

      if (this.debugLog) {
        this.debugLog('CSS', `CSS removed: ${styleId}`);
      }
      return true;
    } catch (error) {
      if (this.debugError) {
        this.debugError('CSS', `Failed to remove CSS: ${styleId}`, error);
      }
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
      if (this.debugError) {
        this.debugError('CSS', 'Failed to detect theme variables', error);
      }
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
    const styleId = 'dungeons-plugin-dungeon-styles';
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
    return this.removeCSSById('dungeons-plugin-dungeon-styles');
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
    if (this.debugLog) {
      this.debugLog('CSS', 'All injected CSS cleaned up');
    }
  }

  /**
   * Get list of all injected CSS styles
   * @returns {Array<string>} - Array of style IDs
   */
  getInjectedStyles() {
    return this._injectedStyles ? Array.from(this._injectedStyles) : [];
  }

  injectCSS() {
    const styleId = 'dungeons-plugin-styles';

    // Use advanced CSS injection with theme integration
    // Remove existing style if present to force refresh
    this.removeCSSById(styleId);

    // Use BetterDiscord's native CSS injection (more reliable)
    const cssContent = `
      @keyframes dungeonPulse {
        0%, 100% { opacity: 1; transform: translateY(-50%) scale(1); }
        50% { opacity: 0.7; transform: translateY(-50%) scale(1.1); }
      }

      /* ARISE Animation Keyframes */
      @keyframes pulse-glow {
        0%, 100% {
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
        }
        50% {
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.8);
        }
      }

      @keyframes arise-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes arise-fade-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }

      @keyframes arise-rise {
        from {
          transform: translateY(50px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      @keyframes arise-glow {
        0%, 100% {
          text-shadow: 0 0 20px #8b5cf6, 0 0 40px #8b5cf6;
        }
        50% {
          text-shadow: 0 0 30px #a78bfa, 0 0 60px #a78bfa;
        }
      }

      @keyframes arise-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
      }

      .dungeon-indicator { cursor: pointer; }
      .dungeons-plugin-button {
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
      .dungeons-plugin-button svg {
        width: 20px;
        height: 20px;
        transition: all 0.2s ease;
        display: block;
      }
      .dungeons-plugin-button:hover {
        background: var(--background-modifier-hover, rgba(4, 4, 5, 0.6));
        color: var(--interactive-hover, #dcddde);
      }
      .dungeons-plugin-button:hover svg {
        transform: scale(1.1);
      }

      /* Boss HP Bar Container (sits below channel header, no overlap!) */
      .dungeon-boss-hp-container {
        display: block !important;
        position: relative !important;
        width: 100% !important;
        max-width: 100% !important;
        padding: 12px 16px !important;
        margin: 0 !important;
        background: linear-gradient(180deg, rgba(20, 20, 30, 0.95) 0%, rgba(15, 15, 25, 0.98) 100%) !important;
        border-bottom: 2px solid rgba(139, 92, 246, 0.4) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(139, 92, 246, 0.1) !important;
        z-index: 100 !important;
        backdrop-filter: blur(8px) !important;
        visibility: visible !important;
        opacity: 1 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }

      /* Hide boss HP bar when settings/modals are open */
      /* When user settings open */
      [class*='layer']:has([class*='userSettings']) .dungeon-boss-hp-container,
      [class*='layer']:has([class*='settingsContainer']) .dungeon-boss-hp-container,
      /* When any layer above base layer */
      [class*='layer'][class*='baseLayer'] ~ [class*='layer'] .dungeon-boss-hp-container,
      /* When settings layer exists */
      body:has([class*='userSettings']) .dungeon-boss-hp-container,
      body:has([class*='settingsContainer']) .dungeon-boss-hp-container {
        display: none !important;
        visibility: hidden !important;
      }

      /* Only show in main chat view (not in settings) */
      .dungeon-boss-hp-container {
        pointer-events: auto !important;
      }

      /* Ensure it stays below settings layers */
      [class*='userSettings'],
      [class*='settingsContainer'] {
        z-index: 1000 !important;
      }

      /* Boss HP Bar in Channel Header */
      .dungeon-boss-hp-bar {
        display: flex !important;
        flex-direction: column !important;
        gap: 6px !important;
        padding: 12px 14px !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 auto !important;
        font-family: 'Nova Flat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        background: rgba(30, 30, 45, 0.85) !important;
        border: 1px solid rgba(139, 92, 246, 0.4) !important;
        border-radius: 8px !important;
        backdrop-filter: blur(6px) !important;
        box-shadow: 0 2px 8px rgba(139, 92, 246, 0.15) !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }

      .dungeon-boss-hp-bar .boss-info {
        color: #a78bfa !important;
        font-weight: 700 !important;
        font-size: 12px !important;
        text-shadow: 0 0 8px rgba(139, 92, 246, 0.8), 0 2px 4px rgba(0, 0, 0, 0.5) !important;
        line-height: 1.4 !important;
        width: 100% !important;
        max-width: 100% !important;
      }

      .dungeon-boss-hp-bar .hp-bar-container {
        height: 16px !important;
        width: 100% !important;
        max-width: 100% !important;
        background: linear-gradient(180deg, rgba(15, 15, 25, 0.9) 0%, rgba(20, 20, 30, 0.95) 100%) !important;
        border-radius: 8px !important;
        overflow: hidden !important;
        position: relative !important;
        border: 1px solid rgba(139, 92, 246, 0.5) !important;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3) !important;
        box-sizing: border-box !important;
      }

      .dungeon-boss-hp-bar .hp-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 40%, #ec4899 80%, #f97316 100%);
        border-radius: 8px;
        transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow:
          0 0 12px rgba(139, 92, 246, 0.6),
          inset 0 0 20px rgba(236, 72, 153, 0.4),
          0 2px 8px rgba(249, 115, 22, 0.3);
        animation: bossHpPulse 2s ease-in-out infinite;
      }

      @keyframes bossHpPulse {
        0%, 100% { box-shadow: 0 0 12px rgba(139, 92, 246, 0.6), inset 0 0 20px rgba(236, 72, 153, 0.4); }
        50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.8), inset 0 0 25px rgba(236, 72, 153, 0.6); }
      }

      .dungeon-boss-hp-bar .hp-bar-text {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 11px;
        font-weight: 800;
        text-shadow:
          0 0 6px rgba(0, 0, 0, 1),
          0 2px 4px rgba(0, 0, 0, 0.9),
          0 0 3px rgba(139, 92, 246, 0.5);
        pointer-events: none;
        letter-spacing: 0.8px;
      }

      /* User HP Bar */
      .dungeon-user-hp-bar {
        font-family: 'Nova Flat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
    `;

    // Inject CSS using BdApi.DOM.addStyle (official API, persistent across Discord updates)
    try {
      if (BdApi?.DOM?.addStyle) {
        BdApi.DOM.addStyle(styleId, cssContent);
      } else {
        // Fallback to manual injection (shouldn't happen in BetterDiscord)
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = cssContent;
        document.head.appendChild(style);
      }
    } catch (error) {
      this.debugLog('CSS', `Failed to inject CSS: ${styleId}`, error);
    }

    // Track injected style for cleanup
    if (!this._injectedStyles) {
      this._injectedStyles = new Set();
    }
    this._injectedStyles.add(styleId);
  }

  getSettingsPanel() {
    return BdApi.React.createElement(
      'div',
      { style: { padding: '20px' } },
      BdApi.React.createElement('h3', null, 'Dungeons Settings'),
      BdApi.React.createElement(
        'div',
        { style: { marginBottom: '15px' } },
        BdApi.React.createElement(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' } },
          BdApi.React.createElement('input', {
            type: 'checkbox',
            checked: this.settings.debug,
            onChange: (e) => {
              this.settings.debug = e.target.checked;
              this.saveSettings();
            },
          }),
          'Debug Mode (Verbose Console Logging)'
        )
      ),
      BdApi.React.createElement(
        'div',
        { style: { marginBottom: '15px' } },
        BdApi.React.createElement(
          'label',
          { style: { display: 'block', marginBottom: '5px' } },
          'Spawn Chance (% per message):'
        ),
        BdApi.React.createElement('input', {
          type: 'number',
          min: 0,
          max: 100,
          value: this.settings.spawnChance,
          onChange: (e) => {
            this.settings.spawnChance = parseFloat(e.target.value) || 10;
            this.saveSettings();
          },
          style: { width: '100px', padding: '5px' },
        })
      ),
      BdApi.React.createElement(
        'div',
        {
          style: { marginTop: '20px', padding: '10px', background: '#1a1a1a', borderRadius: '5px' },
        },
        BdApi.React.createElement('strong', null, 'Active Dungeons: '),
        this.activeDungeons.size
      )
    );
  }
};
