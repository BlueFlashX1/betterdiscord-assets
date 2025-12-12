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
 * - Fixed multiplied regeneration bug (multiple dungeons causing stacked regeneration)
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

/**
 * MobBossStorageManager - IndexedDB storage manager for Mobs and Bosses
 * Handles persistent storage of mob and boss data for caching and migration
 */
class MobBossStorageManager {
  constructor(userId) {
    this.userId = userId || 'default';
    this.dbName = `MobBossDB_${this.userId}`;
    this.dbVersion = 1;
    this.mobStoreName = 'mobs';
    this.bossStoreName = 'bosses';
    this.db = null;
    this._pendingMobs = new Map();
    this._pendingTimers = new Map();
    this._flushIntervalMs = 5000; // Debounce writes to reduce IndexedDB churn
    this._flushThreshold = 300; // Flush immediately when large batches accumulate
    this._lastBossSaveFraction = new Map(); // Throttle boss saves on HP delta
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

        // Create mobs object store
        if (!db.objectStoreNames.contains(this.mobStoreName)) {
          const mobStore = db.createObjectStore(this.mobStoreName, { keyPath: 'id' });
          mobStore.createIndex('dungeonKey', 'dungeonKey', { unique: false });
          mobStore.createIndex('extracted', 'extracted', { unique: false });
          mobStore.createIndex('rank', 'rank', { unique: false });
          mobStore.createIndex('beastType', 'beastType', { unique: false });
          mobStore.createIndex('spawnedAt', 'spawnedAt', { unique: false });
        }

        // Create bosses object store
        if (!db.objectStoreNames.contains(this.bossStoreName)) {
          const bossStore = db.createObjectStore(this.bossStoreName, { keyPath: 'id' });
          bossStore.createIndex('dungeonKey', 'dungeonKey', { unique: true });
          bossStore.createIndex('rank', 'rank', { unique: false });
          bossStore.createIndex('spawnedAt', 'spawnedAt', { unique: false });
        }
      };

      request.onblocked = () => {
        reject(new Error('Database upgrade blocked'));
      };
    });
  }

  /**
   * Save mob to database (cached for migration)
   */
  async saveMob(mob, dungeonKey) {
    if (!this.db) await this.init();

    const mobData = {
      ...mob,
      dungeonKey,
      cachedAt: Date.now(),
      extracted: false, // Will be set to true when migrated to ShadowArmy
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.mobStoreName], 'readwrite');
      const store = transaction.objectStore(this.mobStoreName);
      const request = store.put(mobData);
      request.onsuccess = () => resolve({ success: true, id: mobData.id });
      request.onerror = () => reject(request.error);
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
          console.error('[MobBossStorageManager] Failed to flush mobs', error);
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
        console.warn('[MobBossStorageManager] Flush completed with errors', {
          dungeonKey,
          saved: result.saved,
          errors: result.errors,
          reason,
        });
      }
      return result;
    } catch (error) {
      console.error('[MobBossStorageManager] Failed to flush mobs', { dungeonKey, reason }, error);
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
    if (!this.db) await this.init();

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

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.bossStoreName], 'readwrite');
      const store = transaction.objectStore(this.bossStoreName);
      const request = store.put(bossData);
      request.onsuccess = () => {
        this._lastBossSaveFraction.set(bossData.id, fraction);
        resolve({ success: true, id: bossData.id });
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get mobs by dungeon key
   */
  async getMobsByDungeon(dungeonKey, includeExtracted = false) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.mobStoreName], 'readonly');
      const store = transaction.objectStore(this.mobStoreName);
      const index = store.index('dungeonKey');
      const request = index.getAll(dungeonKey);

      request.onsuccess = () => {
        let mobs = request.result || [];
        if (!includeExtracted) {
          mobs = mobs.filter((m) => !m.extracted);
        }
        resolve(mobs);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get boss by dungeon key
   */
  async getBossByDungeon(dungeonKey) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.bossStoreName], 'readonly');
      const store = transaction.objectStore(this.bossStoreName);
      const index = store.index('dungeonKey');
      const request = index.get(dungeonKey);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Mark mob as extracted (migrated to ShadowArmy)
   */
  async markMobExtracted(mobId) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.mobStoreName], 'readwrite');
      const store = transaction.objectStore(this.mobStoreName);
      const request = store.get(mobId);

      request.onsuccess = () => {
        const mob = request.result;
        if (mob) {
          mob.extracted = true;
          mob.extractedAt = Date.now();
          const updateRequest = store.put(mob);
          updateRequest.onsuccess = () => resolve({ success: true });
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve({ success: false, reason: 'Mob not found' });
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get extracted mobs ready for migration
   */
  async getExtractedMobs(dungeonKey = null) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.mobStoreName], 'readonly');
      const store = transaction.objectStore(this.mobStoreName);
      const index = store.index('extracted');
      const request = index.getAll(true);

      request.onsuccess = () => {
        let mobs = request.result || [];
        if (dungeonKey) {
          mobs = mobs.filter((m) => m.dungeonKey === dungeonKey);
        }
        resolve(mobs);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clean up old extracted mobs (older than 24 hours)
   */
  async cleanupOldExtractedMobs() {
    if (!this.db) await this.init();
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.mobStoreName], 'readwrite');
      const store = transaction.objectStore(this.mobStoreName);
      const request = store.openCursor();
      let deleted = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const mob = cursor.value;
          if (mob.extracted && mob.extractedAt && mob.extractedAt < cutoffTime) {
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
   * Delete mobs by dungeon key (cleanup when dungeon completes)
   */
  async deleteMobsByDungeon(dungeonKey) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.mobStoreName], 'readwrite');
      const store = transaction.objectStore(this.mobStoreName);
      const index = store.index('dungeonKey');
      const request = index.openCursor(IDBKeyRange.only(dungeonKey));
      let deleted = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          resolve({ deleted });
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// ================================================================================
// MAIN PLUGIN CLASS
// ================================================================================
// Load UnifiedSaveManager for crash-resistant IndexedDB storage
let UnifiedSaveManager;
try {
  const fs = require('fs');
  const path = require('path');
  const saveManagerPath = path.join(BdApi.Plugins.folder, 'UnifiedSaveManager.js');
  if (fs.existsSync(saveManagerPath)) {
    const saveManagerCode = fs.readFileSync(saveManagerPath, 'utf8');
    eval(saveManagerCode);
    UnifiedSaveManager = window.UnifiedSaveManager || eval('UnifiedSaveManager');
  }
} catch (error) {
  console.warn('[Dungeons] Failed to load UnifiedSaveManager:', error);
}

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
      mobMaxActiveCap: 600, // Hard limit on simultaneously active mobs per dungeon
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

    // IMPORTANT: avoid sharing references between defaults and live settings.
    // Hot paths mutate `this.settings`; if it aliases `defaultSettings`, defaults get corrupted.
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.messageObserver = null;
    this.shadowAttackIntervals = new Map();
    this.mobKillNotificationTimers = new Map();
    this.mobSpawnTimers = new Map();
    this._mobSpawnNextAt = new Map(); // channelKey -> next spawn timestamp (global scheduler)
    this._mobSpawnQueueNextAt = new Map(); // channelKey -> next queue flush timestamp
    this._mobSpawnLoopInterval = null;
    this._mobSpawnLoopInFlight = false;
    this._mobSpawnLoopTickMs = 300; // Handles spawn waves + queue flush (lightweight)
    this.bossAttackTimers = new Map(); // Boss attack timers per dungeon
    this.mobAttackTimers = new Map(); // Mob attack timers per dungeon
    this.dungeonTimeouts = new Map(); // Legacy: per-dungeon completion timers (no longer scheduled)
    this.dungeonIndicators = new Map();
    this.bossHPBars = new Map();
    this._bossBarCache = new Map(); // Cache last boss bar render payload per channel
    this._mobCleanupCache = new Map(); // Throttled alive-mob counts per channel
    this._bossBarLayoutFrame = null;
    this._bossBarLayoutThrottle = new Map(); // Throttle HP bar layout adjustments (100-150ms)
    this._rankStatsCache = new Map(); // Cache rank-based stat calculations
    this._bossBaseStatsCache = new Map(); // Cache boss base stat rolls per rank for session
    this._shadowEffectiveStatsCache = new Map(); // TTL cache for shadow effective stats
    this._personalityCache = new Map(); // TTL cache for personality lookups
    this._memberWidthCache = new Map(); // Short-lived cache for member list width
    this._containerCache = new Map(); // Cache for progress/header containers (short TTL)
    this._mobSpawnQueue = new Map(); // Micro-queue for batched mob spawning (250-500ms)
    // Legacy: used by older spawn-queue implementation (now centralized in global spawn loop)
    this.userHPBar = null;
    this.dungeonButton = null;
    this.dungeonModal = null;
    this.toolbarCheckInterval = null;
    this._dungeonButtonRetryCount = 0;
    this.lastUserAttackTime = 0;
    this.storageManager = null;
    this.mobBossStorageManager = null; // Dedicated storage for mobs and bosses
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
    this._shadowStatsCache = new Map(); // Shadow stats cache (500ms TTL)
    this._mobGenerationCache = new Map(); // Mob generation cache (prevents crashes from excessive generation)
    this._mobCacheTTL = 60000; // 60 seconds cache TTL for mob generation

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

    // PERFORMANCE: global combat loop (replaces per-dungeon intervals)
    this._combatLoopInterval = null;
    this._combatLoopInFlight = false;
    this._combatLoopTickMs = 500;
    this._shadowActiveIntervalMs = new Map(); // channelKey -> active interval ms
    this._shadowBackgroundIntervalMs = new Map(); // channelKey -> background interval ms
    this._bossBackgroundIntervalMs = new Map(); // channelKey -> background interval ms
    this._mobBackgroundIntervalMs = new Map(); // channelKey -> background interval ms

    // Performance optimization: Track window visibility for background processing
    this._isWindowVisible = !document.hidden; // Track if Discord window is visible
    this._visibilityChangeHandler = null; // Visibility change event handler
    this._windowHiddenTime = null; // Timestamp when window became hidden (for simulation)
    this._pausedIntervals = new Map(); // Track paused intervals: { channelKey: { shadow, boss, mob } }

    // Initialize UnifiedSaveManager for crash-resistant IndexedDB storage
    this.saveManager = null;
    if (UnifiedSaveManager) {
      this.saveManager = new UnifiedSaveManager('Dungeons');
    }

    // Plugin running state
    this.started = false;

    // Fallback toast system
    this.fallbackToastContainer = null;
    this.fallbackToasts = [];

    // Track observer start time to ignore old messages
    this.observerStartTime = Date.now();
    this.processedMessageIds = new Set(); // Track processed message IDs to avoid duplicates

    // CSS Management System - Track injected styles for cleanup
    this._injectedStyles = new Set();

    // Additional performance caches
    this._cache = {
      pluginInstances: {}, // Cache plugin instances by name
      pluginInstancesTime: {},
      pluginInstancesTTL: 5000, // 5s - plugin instances don't change often
      userEffectiveStats: null,
      userEffectiveStatsTime: 0,
      userEffectiveStatsTTL: 500, // 500ms - stats change when stats are allocated
    };
    this._guildChannelCache = new Map(); // guildId -> {ts, channels}
    this._guildChannelCacheTTL = 30000; // 30s
    this.extractionRetryLimit = 3; // Max attempts per boss (mobs use single-attempt immediate extraction)
    this.extractionProcessors = new Map(); // channelKey -> interval for continuous processing
    this.shadowArmyCountCache = new Map(); // Track shadow count to detect new extractions

    // Throttle mob capacity warnings to prevent console spam
    this._mobCapWarningShown = {}; // Track per-dungeon warnings (30s throttle)

    // HP bar restoration interval (restores HP bars removed by DOM changes)
    this._hpBarRestoreInterval = null;

    // Event-based extraction verification
    this.extractionEvents = new Map(); // Track extraction attempts by mobId
    this.setupExtractionEventListener();

    // Extraction tracking (now uses MobBossStorageManager database instead of BdAPI)
    this.extractionInProgress = new Set(); // Track channels currently processing extractions

    // Deferred extraction global worker (prevents parallel heavy extraction bursts)
    this._deferredExtractionQueue = [];
    this._deferredExtractionQueued = new Set();
    this._deferredExtractionResolvers = new Map(); // channelKey -> {resolve,reject}
    this._deferredExtractionWorkerInterval = null;
    this._deferredExtractionWorkerInFlight = false;

    // Baseline stats system: exponential scaling by rank
    // Used to ensure shadows scale properly with rank progression
    this.baselineStats = {
      E: { strength: 10, agility: 10, intelligence: 10, vitality: 10, perception: 10 },
      D: { strength: 25, agility: 25, intelligence: 25, vitality: 25, perception: 25 },
      C: { strength: 50, agility: 50, intelligence: 50, vitality: 50, perception: 50 },
      B: { strength: 100, agility: 100, intelligence: 100, vitality: 100, perception: 100 },
      A: { strength: 200, agility: 200, intelligence: 200, vitality: 200, perception: 200 },
      S: { strength: 400, agility: 400, intelligence: 400, vitality: 400, perception: 400 },
      SS: { strength: 800, agility: 800, intelligence: 800, vitality: 800, perception: 800 },
      SSS: { strength: 1600, agility: 1600, intelligence: 1600, vitality: 1600, perception: 1600 },
      Monarch: {
        strength: 3200,
        agility: 3200,
        intelligence: 3200,
        vitality: 3200,
        perception: 3200,
      },
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

  _setTrackedTimeout(callback, delayMs) {
    const timeoutId = setTimeout(() => {
      this._timeouts.delete(timeoutId);
      callback();
    }, delayMs);
    this._timeouts.add(timeoutId);
    return timeoutId;
  }

  _ensureCombatLoop() {
    if (this._combatLoopInterval) return;
    const tick = () => {
      if (!this.started) return;
      if (this._combatLoopInFlight) return;
      if (
        this.shadowAttackIntervals.size === 0 &&
        this.bossAttackTimers.size === 0 &&
        this.mobAttackTimers.size === 0
      ) {
        return;
      }

      this._combatLoopInFlight = true;
      Promise.resolve()
        .then(() => this._combatLoopTick())
        .catch((error) => this.errorLog('CRITICAL', 'Combat loop tick error', error))
        .finally(() => {
          this._combatLoopInFlight = false;
        });
    };

    this._combatLoopInterval = setInterval(tick, this._combatLoopTickMs);
    this._intervals.add(this._combatLoopInterval);
  }

  _stopCombatLoop() {
    if (!this._combatLoopInterval) return;
    clearInterval(this._combatLoopInterval);
    this._intervals.delete(this._combatLoopInterval);
    this._combatLoopInterval = null;
    this._combatLoopInFlight = false;
  }

  _ensureDeferredExtractionWorker() {
    if (this._deferredExtractionWorkerInterval) return;
    const tick = () => {
      if (!this.started) return;
      if (this._deferredExtractionWorkerInFlight) return;
      if (!this._deferredExtractionQueue || this._deferredExtractionQueue.length === 0) return;

      // Don't run heavy extraction while the window is hidden (no user benefit; avoids spikes)
      if (!this.isWindowVisible()) return;

      this._deferredExtractionWorkerInFlight = true;
      Promise.resolve()
        .then(() => this._deferredExtractionWorkerTick())
        .catch((error) => this.errorLog('CRITICAL', 'Deferred extraction worker error', error))
        .finally(() => {
          this._deferredExtractionWorkerInFlight = false;
        });
    };

    this._deferredExtractionWorkerInterval = setInterval(tick, 600);
    this._intervals.add(this._deferredExtractionWorkerInterval);
  }

  _stopDeferredExtractionWorker() {
    if (!this._deferredExtractionWorkerInterval) return;
    clearInterval(this._deferredExtractionWorkerInterval);
    this._intervals.delete(this._deferredExtractionWorkerInterval);
    this._deferredExtractionWorkerInterval = null;
    this._deferredExtractionWorkerInFlight = false;
  }

  _sleep(ms) {
    return new Promise((resolve) => {
      this._setTrackedTimeout(resolve, ms);
    });
  }

  queueDeferredExtractions(channelKey) {
    if (!channelKey) return Promise.resolve({ extracted: 0, attempted: 0, paused: false });

    if (!this._deferredExtractionQueue) this._deferredExtractionQueue = [];
    if (!this._deferredExtractionQueued) this._deferredExtractionQueued = new Set();
    if (!this._deferredExtractionResolvers) this._deferredExtractionResolvers = new Map();

    if (this._deferredExtractionQueued.has(channelKey)) {
      const existing = this._deferredExtractionResolvers.get(channelKey);
      return existing
        ? new Promise((resolve, reject) => {
            // Chain additional waiters
            const prevResolve = existing.resolve;
            const prevReject = existing.reject;
            existing.resolve = (value) => {
              try {
                prevResolve(value);
              } finally {
                resolve(value);
              }
            };
            existing.reject = (error) => {
              try {
                prevReject(error);
              } finally {
                reject(error);
              }
            };
          })
        : Promise.resolve({ extracted: 0, attempted: 0, paused: false });
    }

    this._deferredExtractionQueued.add(channelKey);
    this._deferredExtractionQueue.push(channelKey);
    this._ensureDeferredExtractionWorker();

    return new Promise((resolve, reject) => {
      this._deferredExtractionResolvers.set(channelKey, { resolve, reject });
    });
  }

  async _deferredExtractionWorkerTick() {
    // Skip if the user is currently in any active dungeon (keeps gameplay smooth)
    if (this.settings?.userActiveDungeon) return;

    const channelKey = this._deferredExtractionQueue.shift();
    if (!channelKey) return;
    this._deferredExtractionQueued.delete(channelKey);

    const resolver = this._deferredExtractionResolvers.get(channelKey);
    this._deferredExtractionResolvers.delete(channelKey);

    try {
      const results = await this.processDeferredExtractions(channelKey);

      // If we paused due to user entering another dungeon, requeue (low priority)
      if (results?.paused) {
        this._setTrackedTimeout(() => {
          this.queueDeferredExtractions(channelKey).catch(() => {});
        }, 3000);
      }

      resolver?.resolve(results);
    } catch (error) {
      resolver?.reject(error);
    } finally {
      // Auto-stop worker if queue empty
      (!this._deferredExtractionQueue || this._deferredExtractionQueue.length === 0) &&
        this._stopDeferredExtractionWorker();
    }
  }

  _ensureMobSpawnLoop() {
    if (this._mobSpawnLoopInterval) return;

    const tick = () => {
      if (!this.started) return;
      if (this._mobSpawnLoopInFlight) return;

      const hasWork =
        (this._mobSpawnNextAt && this._mobSpawnNextAt.size > 0) ||
        (this._mobSpawnQueueNextAt && this._mobSpawnQueueNextAt.size > 0);
      if (!hasWork) return;

      // Spawning + queue flush are pure QoL; don't do work while window hidden
      if (!this.isWindowVisible()) return;

      this._mobSpawnLoopInFlight = true;
      Promise.resolve()
        .then(() => this._mobSpawnLoopTick())
        .catch((error) => this.errorLog('CRITICAL', 'Mob spawn loop tick error', error))
        .finally(() => {
          this._mobSpawnLoopInFlight = false;
        });
    };

    this._mobSpawnLoopInterval = setInterval(tick, this._mobSpawnLoopTickMs || 300);
    this._intervals.add(this._mobSpawnLoopInterval);
  }

  _stopMobSpawnLoop() {
    if (!this._mobSpawnLoopInterval) return;
    clearInterval(this._mobSpawnLoopInterval);
    this._intervals.delete(this._mobSpawnLoopInterval);
    this._mobSpawnLoopInterval = null;
    this._mobSpawnLoopInFlight = false;
  }

  _computeNextMobSpawnDelayMs() {
    // Matches prior behavior: base 6s with ±33% variance (4-8s)
    const baseInterval = 6000;
    const variance = baseInterval * 0.33;
    return baseInterval - variance + Math.random() * variance * 2;
  }

  async _mobSpawnLoopTick() {
    const now = Date.now();
    const MAX_QUEUE_FLUSH_PER_TICK = 3;
    const MAX_SPAWN_WAVES_PER_TICK = 2;

    // Flush queued mobs (batch append) when ready
    if (this._mobSpawnQueueNextAt && this._mobSpawnQueueNextAt.size > 0) {
      let flushes = 0;
      for (const [channelKey, nextAt] of this._mobSpawnQueueNextAt.entries()) {
        if (flushes >= MAX_QUEUE_FLUSH_PER_TICK) break;
        if (now < nextAt) continue;
        this.processMobSpawnQueue(channelKey);
        this._mobSpawnQueueNextAt.delete(channelKey);
        flushes++;
      }
    }

    // Trigger spawn waves when due
    if (this._mobSpawnNextAt && this._mobSpawnNextAt.size > 0) {
      let spawns = 0;
      for (const [channelKey, nextAt] of this._mobSpawnNextAt.entries()) {
        if (spawns >= MAX_SPAWN_WAVES_PER_TICK) break;
        if (now < nextAt) continue;

        const dungeon = this.activeDungeons.get(channelKey);
        if (!dungeon || dungeon.completed || dungeon.failed) {
          this._mobSpawnNextAt.delete(channelKey);
          this._mobSpawnQueueNextAt?.delete?.(channelKey);
          this._mobSpawnQueue?.delete?.(channelKey);
          continue;
        }

        this.spawnMobs(channelKey);
        this._mobSpawnNextAt.set(channelKey, now + this._computeNextMobSpawnDelayMs());
        spawns++;
      }
    }

    const hasWork =
      (this._mobSpawnNextAt && this._mobSpawnNextAt.size > 0) ||
      (this._mobSpawnQueueNextAt && this._mobSpawnQueueNextAt.size > 0);
    !hasWork && this._stopMobSpawnLoop();
  }

  async _combatLoopTick() {
    const now = Date.now();

    // If window is hidden, visibility tracking will pause processing; do nothing here.
    if (!this.isWindowVisible()) return;

    for (const [channelKey, dungeon] of this.activeDungeons.entries()) {
      if (!dungeon || dungeon.completed || dungeon.failed) {
        this.shadowAttackIntervals.has(channelKey) && this.stopShadowAttacks(channelKey);
        this.bossAttackTimers.has(channelKey) && this.stopBossAttacks(channelKey);
        this.mobAttackTimers.has(channelKey) && this.stopMobAttacks(channelKey);
        continue;
      }

      const isActive = this.isActiveDungeon(channelKey);

      // Shadow attacks
      if (this.shadowAttackIntervals.has(channelKey)) {
        const activeInterval = this._shadowActiveIntervalMs.get(channelKey) || 3000;
        const backgroundInterval = this._shadowBackgroundIntervalMs.get(channelKey) || 15000;
        const intervalTime = isActive ? activeInterval : backgroundInterval;
        const lastTime = this._lastShadowAttackTime.get(channelKey) || now;
        const elapsed = now - lastTime;

        if (elapsed >= intervalTime) {
          const cyclesToProcess = isActive ? 1 : Math.max(1, Math.floor(elapsed / activeInterval));
          await this.processShadowAttacks(channelKey, cyclesToProcess);
          this._lastShadowAttackTime.set(channelKey, now);
          isActive && this.queueHPBarUpdate(channelKey);
        }
      }

      // Boss attacks
      if (this.bossAttackTimers.has(channelKey) && dungeon.boss?.hp > 0) {
        const activeInterval = 1000;
        const backgroundInterval = this._bossBackgroundIntervalMs.get(channelKey) || 15000;
        const intervalTime = isActive ? activeInterval : backgroundInterval;
        const lastTime = this._lastBossAttackTime.get(channelKey) || now;
        const elapsed = now - lastTime;

        if (elapsed >= intervalTime) {
          const cyclesToProcess = isActive ? 1 : Math.max(1, Math.floor(elapsed / activeInterval));
          await this.processBossAttacks(channelKey, cyclesToProcess);
          this._lastBossAttackTime.set(channelKey, now);
        }
      }

      // Mob attacks
      if (this.mobAttackTimers.has(channelKey)) {
        const activeInterval = 1000;
        const backgroundInterval = this._mobBackgroundIntervalMs.get(channelKey) || 15000;
        const intervalTime = isActive ? activeInterval : backgroundInterval;
        const lastTime = this._lastMobAttackTime.get(channelKey) || now;
        const elapsed = now - lastTime;

        if (elapsed >= intervalTime) {
          const cyclesToProcess = isActive ? 1 : Math.max(1, Math.floor(elapsed / activeInterval));
          await this.processMobAttacks(channelKey, cyclesToProcess);
          this._lastMobAttackTime.set(channelKey, now);
        }
      }
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
    this._recalculateManaTimeout = this._setTrackedTimeout(async () => {
      await this.recalculateUserMana();
    }, 2000);

    // Retry loading plugin references (especially for toasts plugin)
    this._retryTimeouts.push(
      this._setTrackedTimeout(() => {
        if (!this.toasts) {
          this.loadPluginReferences();
        }
      }, 1000)
    );

    this._retryTimeouts.push(
      this._setTrackedTimeout(() => {
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
    // Current channel tracking is handled by setupChannelWatcher (event-based + fallback interval)

    // Start window visibility tracking for performance optimization
    this.startVisibilityTracking();

    // Start HP bar restoration loop (checks every 2 seconds for missing HP bars)
    this.startHPBarRestoration();

    // Initialize UnifiedSaveManager (IndexedDB)
    if (this.saveManager) {
      try {
        await this.saveManager.init();
        this.debugLog('START', 'UnifiedSaveManager initialized (IndexedDB)');
      } catch (error) {
        this.errorLog('START', 'Failed to initialize UnifiedSaveManager', error);
        this.saveManager = null; // Fallback to BdApi.Data
      }
    }

    // Load settings (will use IndexedDB if available, fallback to BdApi.Data)
    await this.loadSettings();

    // Start HP/Mana regeneration loop (every 1 second)
    this.startRegeneration();

    // Periodic validation (every 10 seconds) to catch edge cases
    // PERFORMANCE: Skip validation when window is hidden
    this._statusValidationInterval = setInterval(() => {
      if (this.isWindowVisible()) {
        this.validateActiveDungeonStatus();
      }
    }, 10000);
    this._intervals.add(this._statusValidationInterval);

    // GARBAGE COLLECTION: Periodic cleanup every 5 minutes
    this.gcInterval = setInterval(() => {
      this.triggerGarbageCollection('periodic');
    }, 300000); // 5 minutes
    this._intervals.add(this.gcInterval);
  }

  async stop() {
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
    this._stopCombatLoop();
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

    // Stop HP bar restoration
    this.stopHPBarRestoration();

    // Stop window visibility tracking
    this.stopVisibilityTracking();

    // Clear all caches
    if (this._cache) {
      this._cache.pluginInstances = {};
      this._cache.pluginInstancesTime = {};
      this._cache.userEffectiveStats = null;
      this._cache.userEffectiveStatsTime = 0;
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
    if (this.shadowArmyCountCache) {
      this.shadowArmyCountCache.clear();
    }

    // Clear mob capacity warning tracking
    if (this._mobCapWarningShown) {
      this._mobCapWarningShown = {};
    }

    // Clear all caches
    this.invalidateShadowCountCache();
    this.invalidateShadowsCache();
    if (this._shadowStatsCache) {
      this._shadowStatsCache.clear();
    }
    if (this._bossBaseStatsCache) this._bossBaseStatsCache.clear();
    if (this._personalityCache) this._personalityCache.clear();
    if (this._memberWidthCache) this._memberWidthCache.clear();
    if (this._containerCache) this._containerCache.clear();
    if (this._mobSpawnQueue) this._mobSpawnQueue.clear();
    if (this.cache) {
      this.cache.clear();
    }
    if (this.extractionEvents) {
      this.extractionEvents.clear();
    }
    if (this._mobGenerationCache) {
      this._mobGenerationCache.clear();
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
    this.removeDungeonButton();
    this.closeDungeonModal();
    this.stopPanelWatcher();
    this.stopChannelWatcher();
    this.currentChannelKey = null;

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

    // Flush any pending mob writes before fully stopping
    if (this.mobBossStorageManager?.flushAll) {
      try {
        await this.mobBossStorageManager.flushAll('plugin-stop');
      } catch (error) {
        this.errorLog('Failed to flush pending mobs on stop', error);
      }
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

      // Initialize MobBossStorageManager for dedicated mob/boss database
      this.mobBossStorageManager = new MobBossStorageManager(userId);
      await this.mobBossStorageManager.init();
      this.debugLog('MobBossStorageManager initialized successfully');
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
      // Try to load settings - IndexedDB first (crash-resistant), then BdApi.Data
      let saved = null;

      // Try IndexedDB first (crash-resistant)
      if (this.saveManager) {
        try {
          saved = await this.saveManager.load('settings');
          if (saved) {
            this.debugLog('LOAD_SETTINGS', 'Loaded from IndexedDB');
          }
        } catch (error) {
          this.errorLog('LOAD_SETTINGS', 'IndexedDB load failed', error);
        }
      }

      // Fallback to BdApi.Data
      if (!saved) {
        try {
          saved = BdApi.Data.load('Dungeons', 'settings');
          if (saved) {
            this.debugLog('LOAD_SETTINGS', 'Loaded from BdApi.Data (fallback)');
            // Migrate to IndexedDB
            if (this.saveManager) {
              try {
                await this.saveManager.save('settings', saved);
                this.debugLog('LOAD_SETTINGS', 'Migrated to IndexedDB');
              } catch (migrateError) {
                this.errorLog('LOAD_SETTINGS', 'Migration to IndexedDB failed', migrateError);
              }
            }
          }
        } catch (error) {
          this.errorLog('LOAD_SETTINGS', 'BdApi.Data load failed', error);
        }
      }

      // Try IndexedDB backup if main failed
      if (!saved && this.saveManager) {
        try {
          const backups = await this.saveManager.getBackups('settings', 1);
          if (backups.length > 0) {
            saved = backups[0].data;
            this.debugLog('LOAD_SETTINGS', 'Loaded from IndexedDB backup');
            // Restore backup to main
            try {
              await this.saveManager.save('settings', saved);
              this.debugLog('LOAD_SETTINGS', 'Restored backup to main');
            } catch (restoreError) {
              this.errorLog('LOAD_SETTINGS', 'Failed to restore backup', restoreError);
            }
          }
        } catch (error) {
          this.errorLog('LOAD_SETTINGS', 'IndexedDB backup load failed', error);
        }
      }

      // Try BdApi.Data backup as last resort
      if (!saved) {
        try {
          saved = BdApi.Data.load('Dungeons', 'settings_backup');
          if (saved) {
            this.debugLog('LOAD_SETTINGS', 'Loaded from BdApi.Data backup');
            // Migrate to IndexedDB
            if (this.saveManager) {
              try {
                await this.saveManager.save('settings', saved);
                this.debugLog('LOAD_SETTINGS', 'Migrated backup to IndexedDB');
              } catch (migrateError) {
                this.errorLog('LOAD_SETTINGS', 'Migration failed', migrateError);
              }
            }
          }
        } catch (error) {
          this.errorLog('LOAD_SETTINGS', 'BdApi.Data backup load failed', error);
        }
      }

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

  async saveSettings() {
    try {
      const now = Date.now();
      const shouldLog =
        this.settings?.debugMode && (!this._lastSaveLogTime || now - this._lastSaveLogTime > 30000);

      // Save to IndexedDB first (crash-resistant, primary storage)
      if (this.saveManager) {
        try {
          await this.saveManager.save('settings', this.settings, true); // true = create backup
          if (shouldLog) {
            this.debugLog('SAVE_SETTINGS', 'Saved to IndexedDB', {
              timestamp: new Date().toISOString(),
            });
          }
        } catch (error) {
          this.errorLog('SAVE_SETTINGS', 'IndexedDB save failed', error);
        }
      }

      // Also save to BdApi.Data (backup/legacy support)
      let saveSuccess = false;
      let lastError = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          BdApi.Data.save('Dungeons', 'settings', this.settings);
          saveSuccess = true;
          if (shouldLog) {
            this.debugLog('SAVE_SETTINGS', 'Saved to BdApi.Data', {
              attempt: attempt + 1,
              timestamp: new Date().toISOString(),
            });
          }
          break;
        } catch (error) {
          lastError = error;
          // No delay between retries - avoid blocking UI thread
        }
      }

      if (!saveSuccess) {
        // Don't throw - IndexedDB save might have succeeded
        this.errorLog('SAVE_SETTINGS', 'BdApi.Data save failed after 3 attempts', lastError);
      }

      // CRITICAL: Always replace backup after successful primary save (maximum persistence)
      try {
        BdApi.Data.save('Dungeons', 'settings_backup', this.settings);
        if (shouldLog) {
          this.debugLog('SAVE_SETTINGS', 'BdApi.Data backup saved');
        }
      } catch (backupError) {
        // Log backup failure but don't fail entire save
        this.errorLog('SAVE_SETTINGS_BACKUP', 'BdApi.Data backup save failed', backupError);
      }

      if (shouldLog) {
        this._lastSaveLogTime = now;
      }
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
      // CRITICAL: Only use IndexedDB storageManager - no fallback to old settings.shadows
      if (!this.shadowArmy?.storageManager) {
        this.debugLog('GET_SHADOW_COUNT', 'ShadowArmy storageManager not available yet');
        return 0;
      }

      const shadows = await this.shadowArmy.storageManager.getShadows({}, 0, 10000);
      if (!shadows || !Array.isArray(shadows)) {
        this.debugLog('GET_SHADOW_COUNT', 'No shadows returned from storageManager');
        return 0;
      }

      const count = shadows.length;

      // Cache in both systems (centralized + legacy)
      this.cache.set('shadowCount', count, 5000);
      this._shadowCountCache = { count, timestamp: now };
      return count;
    } catch (error) {
      this.debugLog('GET_SHADOW_COUNT', 'Failed to get shadow count from IndexedDB', error);
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
    // Check cache first
    const now = Date.now();
    const cacheKey = `${pluginName}_${instanceProperty || 'none'}`;
    if (
      this._cache.pluginInstances[cacheKey] &&
      this._cache.pluginInstancesTime[cacheKey] &&
      now - this._cache.pluginInstancesTime[cacheKey] < this._cache.pluginInstancesTTL
    ) {
      return this._cache.pluginInstances[cacheKey];
    }

    const plugin = BdApi.Plugins.get(pluginName);
    if (!plugin?.instance) {
      this.debugLog(`Plugin ${pluginName} not available`);
      this._cache.pluginInstances[cacheKey] = null;
      this._cache.pluginInstancesTime[cacheKey] = now;
      return null;
    }

    // Validate instance has required methods/properties
    // CRITICAL: For storageManager, don't fail validation if it's not initialized yet
    // ShadowArmy initializes storageManager asynchronously in start()
    if (instanceProperty) {
      if (instanceProperty === 'storageManager') {
        // For storageManager, only validate plugin exists, not the property
        // It will be initialized asynchronously and accessed with optional chaining
        this._cache.pluginInstances[cacheKey] = plugin.instance;
        this._cache.pluginInstancesTime[cacheKey] = now;
        return plugin.instance;
      } else if (!plugin.instance[instanceProperty]) {
        this.debugLog(`Plugin ${pluginName} missing ${instanceProperty}`);
        this._cache.pluginInstances[cacheKey] = null;
        this._cache.pluginInstancesTime[cacheKey] = now;
        return null;
      }
    }

    // Cache the result
    this._cache.pluginInstances[cacheKey] = plugin.instance;
    this._cache.pluginInstancesTime[cacheKey] = now;

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
            // Invalidate stats cache when stats change
            this._cache.userEffectiveStats = null;
            this._cache.userEffectiveStatsTime = 0;
          };
          this._onStatsChangedUnsubscribe = this.soloLevelingStats.on('statsChanged', callback);
        }
      } else {
        this.debugLog('SoloLevelingStats plugin not available');
      }

      // Load ShadowArmy plugin with validation
      // Note: storageManager may not be initialized yet (async initialization)
      // We'll use optional chaining when accessing it
      const shadowPlugin = this.validatePluginReference('ShadowArmy', 'storageManager');
      if (shadowPlugin) {
        this.shadowArmy = shadowPlugin;
        // Check if storageManager is available (may be null if not initialized yet)
        if (shadowPlugin.storageManager) {
          this.debugLog('ShadowArmy plugin loaded successfully with storageManager');
        } else {
          this.debugLog(
            'ShadowArmy plugin loaded (storageManager will be available after initialization)'
          );
        }

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
        // ShadowArmy validation: Check plugin exists, storageManager may be initialized later
        if (!this.shadowArmy) {
          this.shadowArmy = this.validatePluginReference('ShadowArmy', 'storageManager');
        }
        // Note: storageManager is accessed with optional chaining (?.) throughout code
        // It may not be available immediately but will be initialized asynchronously
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
      const cached = this._guildChannelCache?.get(guildId);
      if (cached && Date.now() - cached.ts < this._guildChannelCacheTTL) {
        return cached.channels;
      }

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

        this._guildChannelCache?.set(guildId, { ts: Date.now(), channels: guildTextChannels });
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
          let fiber = channelElement[reactKey];
          for (let i = 0; i < 20 && fiber; i++) {
            const channel = fiber.memoizedProps?.channel;
            if (channel) return { guildId: channel.guild_id || 'DM', channelId: channel.id };
            fiber = fiber.return;
          }
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
      const scrollers = document.querySelectorAll('[class*="scroller"]');
      let scrollerWithMessages = null;
      for (const scroller of scrollers) {
        if (scroller.querySelector('[class*="message"]') !== null) {
          scrollerWithMessages = scroller;
          break;
        }
      }
      if (scrollerWithMessages) return scrollerWithMessages;

      // Last resort: Use document.body to catch all DOM changes
      return document.body;
    };

    const messageContainer = findMessageContainer();

    if (messageContainer) {
      // Only instantiate and assign observer after finding a valid container
      this.messageObserver = new MutationObserver((mutations) => {
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

      // Track observer for cleanup
      this._observers.add(this.messageObserver);
      this.messageObserver.observe(messageContainer, { childList: true, subtree: true });
    } else {
      this.errorLog('Message container not found! Observer not started.');

      // Retry after delay if container not found (timing issue)
      // Track timeout ID and check plugin running state instead of observer
      const retryId = this._setTrackedTimeout(() => {
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
        let fiber = messageElement[reactKey];
        for (let i = 0; i < 20 && fiber; i++) {
          const timestamp = fiber.memoizedProps?.message?.timestamp;
          if (timestamp) return new Date(timestamp).getTime();
          fiber = fiber.return;
        }
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
        this._setTrackedTimeout(() => {
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

    // Calculate boss stats based on rank (used for combat calculations)
    const bossBaseStats = this.calculateBossBaseStats(rankIndex);
    const bossStrength = bossBaseStats.strength;
    const bossAgility = bossBaseStats.agility;
    const bossIntelligence = bossBaseStats.intelligence;
    const bossVitality = bossBaseStats.vitality;
    const bossPerception = bossBaseStats.perception;

    // CRITICAL: Calculate boss HP using vitality stat for consistency with user/shadow HP formula
    // Formula: 100 + VIT × 10 + rankIndex × 50 (same as user HP)
    // Then scale by biome multiplier and shadow count for balance
    const baseBossHPFromVitality = 100 + bossVitality * 10 + rankIndex * 50;

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

    // Scale HP: Base vitality-based HP + shadow count scaling (rank-weighted)
    // Shadow scaling: +HP per shadow based on biome, amplified by rank
    // Lower ranks get softer scaling; higher ranks get stronger scaling
    const hpPerShadowBase = biomeHPMultipliers[dungeonType] || 5000;
    const rankScale = Math.max(0.6, 0.6 + rankIndex * 0.12); // E softer, higher ranks stronger
    const hpPerShadow = Math.floor(hpPerShadowBase * rankScale);
    const shadowScaledHP = baseBossHPFromVitality + expectedShadowCount * hpPerShadow;
    const finalBossHP = Math.floor(shadowScaledHP);

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
        // Per-dungeon mob capacity: Scales directly with target mob count
        // Capacity is 15% of targetCount to allow proper spawning for large dungeons
        // Examples: 2k target = 300 cap, 20k target = 3k cap, 50k target = 7.5k cap
        // Formula: 15% of targetCount, with minimum 200 and maximum 10,000 for safety
        mobCapacity: Math.floor(
          Math.max(
            200, // Minimum capacity (prevents too low for any dungeon)
            Math.min(
              10000, // Maximum capacity (prevents excessive mobs causing lag)
              Math.floor(totalMobCount * 0.15) // 15% of target count (scales with dungeon size)
            )
          )
        ),
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
        perception: bossPerception,

        // SHADOW-COMPATIBLE STATS (for extraction)
        baseStats: {
          strength: bossStrength,
          agility: bossAgility,
          intelligence: bossIntelligence,
          vitality: bossVitality,
          perception: bossPerception,
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

    // CRITICAL: Save boss to dedicated database (indexed for migration)
    if (this.mobBossStorageManager) {
      try {
        await this.mobBossStorageManager.saveBoss(dungeon.boss, channelKey);
        this.debugLog('BOSS_STORAGE', 'Boss cached to database', {
          dungeonKey: channelKey,
          bossId: dungeon.boss.id,
          rank: dungeon.boss.rank,
        });
      } catch (error) {
        this.errorLog('Failed to cache boss to database', error);
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
    // Extraction: Mobs stored in BdAPI for deferred processing after dungeon completion

    // Automatic completion is handled by the global cleanup loop (`cleanupExpiredDungeons`)
    // This avoids per-dungeon long-lived timers that can accumulate.

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
    // Clear any legacy per-dungeon timer (from older versions/hot reloads)
    if (this.mobSpawnTimers.has(channelKey)) {
      const legacy = this.mobSpawnTimers.get(channelKey);
      legacy && clearTimeout(legacy);
      this.mobSpawnTimers.delete(channelKey);
    }

    if (this._mobSpawnNextAt.has(channelKey)) return;

    // NATURAL SPAWNING: Gradual, organic mob waves with high variance
    // Creates dynamic, unpredictable spawn patterns without overwhelming
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed) return;

    // Start first spawn immediately (no delay), then schedule via global loop
    this.spawnMobs(channelKey);
    this._mobSpawnNextAt.set(channelKey, Date.now() + this._computeNextMobSpawnDelayMs());
    this._ensureMobSpawnLoop();

    // Natural spawning handles capacity organically
    // No need for capacity monitoring with gradual spawn system
  }

  /**
   * Stop mob spawning for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  stopMobSpawning(channelKey) {
    // Clear any legacy per-dungeon timer (from older versions/hot reloads)
    const timer = this.mobSpawnTimers.get(channelKey);
    timer && clearTimeout(timer);
    this.mobSpawnTimers.delete(channelKey);

    this._mobSpawnNextAt.delete(channelKey);
    this._mobSpawnQueueNextAt.delete(channelKey);

    // Process any remaining queued mobs before stopping
    if (this._mobSpawnQueue.has(channelKey)) {
      this.processMobSpawnQueue(channelKey);
    }
  }

  /**
   * Stop all mob spawning timers
   */
  stopAllMobSpawning() {
    // Legacy timer cleanup (should be empty)
    this.mobSpawnTimers.forEach((timer) => clearTimeout(timer));
    this.mobSpawnTimers.clear();

    this._mobSpawnNextAt && this._mobSpawnNextAt.clear();
    this._mobSpawnQueueNextAt && this._mobSpawnQueueNextAt.clear();
    this._stopMobSpawnLoop?.();
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

  /**
   * Process queued mobs in batches (250-500ms intervals)
   * This smooths DOM updates and reduces GC churn
   * @param {string} channelKey - Channel key for the dungeon
   */
  processMobSpawnQueue(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed) {
      this._mobSpawnQueue.delete(channelKey);
      return;
    }

    const queuedMobs = this._mobSpawnQueue.get(channelKey);
    if (!queuedMobs || queuedMobs.length === 0) {
      this._mobSpawnQueue.delete(channelKey);
      return;
    }

    // Batch append to activeMobs array (more efficient than individual pushes)
    dungeon.mobs.activeMobs.push(...queuedMobs);
    dungeon.mobs.remaining += queuedMobs.length;
    dungeon.mobs.total += queuedMobs.length;

    // CRITICAL: Save mobs to dedicated database (cached for migration)
    if (this.mobBossStorageManager && queuedMobs.length > 0) {
      this.mobBossStorageManager.enqueueMobs(queuedMobs, channelKey).catch((error) => {
        this.errorLog('Failed to queue mobs for caching', error);
      });
    }

    // Clear the queue
    this._mobSpawnQueue.delete(channelKey);
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
      let _aliveMobs = 0;
      for (const mob of dungeon.mobs.activeMobs) {
        mob?.hp > 0 && _aliveMobs++;
      }

      // PER-DUNGEON CAPACITY: Use dungeon's own capacity instead of global cap
      // Each dungeon has its own capacity based on rank and biome
      const mobCap = dungeon.mobs.mobCapacity || this.settings.mobMaxActiveCap || 600;
      if (_aliveMobs >= mobCap) {
        // Throttle warning to prevent console spam (log once per 30 seconds per dungeon)
        if (!this._mobCapWarningShown[channelKey]) {
          this.debugLog('MOB_CAP', 'Active mobs at cap, skipping spawn', {
            channelKey,
            mobCap,
            dungeonCapacity: dungeon.mobs.mobCapacity,
            alive: _aliveMobs,
            rank: dungeon.rank,
            biome: dungeon.type,
          });
          this._mobCapWarningShown[channelKey] = true;

          // Reset warning after 30 seconds
          this._setTrackedTimeout(() => {
            if (this._mobCapWarningShown) {
              delete this._mobCapWarningShown[channelKey];
            }
          }, 30000);
        }
        return;
      }

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
      const plannedSpawn = Math.floor(baseSpawnCount - variance + Math.random() * variance * 2);

      // Respect remaining capacity
      const capacityRemaining = Math.max(0, mobCap - _aliveMobs);
      const actualSpawnCount = Math.min(capacityRemaining, plannedSpawn);

      if (actualSpawnCount <= 0) {
        // Throttle warning to prevent console spam (log once per 30 seconds per dungeon)
        if (!this._mobCapWarningShown[channelKey]) {
          this.debugLog('MOB_CAP', 'No capacity remaining for new spawns', {
            channelKey,
            mobCap,
            alive: _aliveMobs,
            plannedSpawn,
          });
          this._mobCapWarningShown[channelKey] = true;

          // Reset warning after 30 seconds
          this._setTrackedTimeout(() => {
            if (this._mobCapWarningShown) {
              delete this._mobCapWarningShown[channelKey];
            }
          }, 30000);
        }
        return;
      }

      // CRITICAL: Check cache first to prevent excessive generation (prevents crashes)
      const cacheKey = `${channelKey}_${dungeon.rank}_${actualSpawnCount}`;
      const cached = this._mobGenerationCache.get(cacheKey);
      const now = Date.now();

      let newMobs;
      if (cached && now - cached.timestamp < this._mobCacheTTL) {
        // Use cached mobs (reuse generation to prevent crashes)
        const spawnedAt = Date.now();
        newMobs = new Array(cached.mobs.length);
        for (let i = 0; i < cached.mobs.length; i++) {
          const mob = cached.mobs[i];
          newMobs[i] = {
            ...mob,
            id: `mob_${spawnedAt}_${Math.random().toString(36).slice(2, 11)}`, // New unique ID
            spawnedAt, // Update spawn time
          };
        }
        this.debugLog('MOB_CACHE', `Using cached mob generation for ${actualSpawnCount} mobs`, {
          cacheKey,
          cachedAt: cached.timestamp,
        });
      } else {
        // Generate new mobs and cache them
        // BATCH MOB GENERATION with INDIVIDUAL VARIANCE
        // PERF: avoid Array.from allocation/closure in a hot path.
        newMobs = new Array(actualSpawnCount);
        for (let i = 0; i < actualSpawnCount; i++) {
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

          // BASE STATS scaled by rank (using centralized calculation)
          const mobBaseStats = this.calculateMobBaseStats(mobRankIndex);
          const baseStrength = mobBaseStats.strength;
          const baseAgility = mobBaseStats.agility;
          const baseIntelligence = mobBaseStats.intelligence;
          const baseVitality = mobBaseStats.vitality;

          // INDIVIDUAL STATS with variance (each mob is unique)
          const mobStrength = Math.floor(baseStrength * strengthVariance);
          const mobAgility = Math.floor(baseAgility * agilityVariance);
          const mobIntelligence = Math.floor(baseIntelligence * intelligenceVariance);
          const mobVitality = Math.floor(baseVitality * vitalityVariance);

          // CRITICAL: Calculate mob HP using vitality stat for consistency
          // Mobs use different formula than user/shadow HP for balance (they're tougher enemies)
          // Formula: 200 + VIT × 15 + rankIndex × 100
          // This ensures mob HP scales with vitality stat (includes variance)
          const baseHP = 200 + mobVitality * 15 + mobRankIndex * 100;
          const hpVariance = 0.7 + Math.random() * 0.3; // 70-100% HP variance (was 80-120%)
          const mobHP = Math.floor(baseHP * hpVariance);

          // Ensure minimum HP of 1 (mobs must be able to take damage and die)
          const finalMobHP = Math.max(1, mobHP);

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
          newMobs[i] = {
            // Core mob identity
            id: `mob_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
            rank: mobRank,

            // MAGIC BEAST IDENTITY (for shadow extraction)
            beastType: magicBeastType.type, // 'ant', 'dragon', 'naga', etc.
            beastName: magicBeastType.name, // 'Ant', 'Dragon', 'Naga', etc.
            beastFamily: magicBeastType.family, // 'insect', 'dragon', 'reptile', etc.
            isMagicBeast: true, // All dungeon mobs are magic beasts

            // Combat stats (current HP)
            // HP calculated from vitality: 200 + VIT × 15 + rankIndex × 100 (with variance)
            hp: finalMobHP,
            maxHp: finalMobHP,
            lastAttackTime: 0,
            attackCooldown: cooldownVariance,

            // SHADOW-COMPATIBLE STATS (directly transferable to shadow.baseStats)
            baseStats: {
              strength: mobStrength,
              agility: mobAgility,
              intelligence: mobIntelligence,
              vitality: mobVitality,
              perception: Math.floor(50 + mobRankIndex * 20 * (0.85 + Math.random() * 0.3)), // Perception stat
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
        }

        // Cache generated mobs (template for future spawns to prevent crashes)
        const mobTemplates = new Array(newMobs.length);
        for (let i = 0; i < newMobs.length; i++) {
          const m = newMobs[i];
          mobTemplates[i] = {
            ...m,
            id: undefined, // Remove ID for template
            spawnedAt: undefined, // Remove timestamp for template
          };
        }
        this._mobGenerationCache.set(cacheKey, { mobs: mobTemplates, timestamp: now });

        // Limit cache size to prevent memory issues
        if (this._mobGenerationCache.size > 50) {
          const firstKey = this._mobGenerationCache.keys().next().value;
          this._mobGenerationCache.delete(firstKey);
        }
      }

      // PERFORMANCE: Queue mobs for batched spawning (250-500ms) to smooth DOM updates and reduce GC churn
      if (!this._mobSpawnQueue.has(channelKey)) {
        this._mobSpawnQueue.set(channelKey, []);
      }
      this._mobSpawnQueue.get(channelKey).push(...newMobs);

      // Schedule batch processing via global spawn loop (no per-dungeon timers)
      if (!this._mobSpawnQueueNextAt.has(channelKey)) {
        const batchDelay = 250 + Math.random() * 250; // 250-500ms random delay
        this._mobSpawnQueueNextAt.set(channelKey, Date.now() + batchDelay);
        this._ensureMobSpawnLoop();
      }

      if (!dungeon.spawnWaveCount) dungeon.spawnWaveCount = 0;
      dungeon.spawnWaveCount++;
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
        `Active dungeon ${channelKey} no longer exists or is completed/failed. Clearing active status.`
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
            `Active dungeon ${channelKey} not found in active dungeons. Clearing active status.`
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
      // Immediately update UI to show fresh values (handled by SoloLevelingStats)
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

    // CRITICAL: Ensure shadow HP is initialized before starting combat
    // This prevents false "all shadows defeated" messages
    const assignedShadows = dungeon.shadowAllocation?.shadows || [];
    if (
      assignedShadows.length > 0 &&
      (!dungeon.shadowHP || Object.keys(dungeon.shadowHP).length === 0)
    ) {
      // Shadows not initialized yet - initialize them now
      const shadowHP = {};
      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      const shadowsToInitialize = [];
      for (const shadow of assignedShadows) {
        const shadowId = shadow?.id || shadow?.i;
        if (!shadow || !shadowId) continue;
        deadShadows.has(shadowId) || shadowsToInitialize.push(shadow);
      }

      await Promise.all(
        shadowsToInitialize.map(async (shadow) => {
          try {
            const hpData = await this.initializeShadowHP(shadow, shadowHP);
            if (!hpData || !hpData.hp || hpData.hp <= 0) {
              this.errorLog(
                'SHADOW_HP',
                `HP initialization failed for shadow ${shadow.id} on join`,
                {
                  hpData,
                  shadowId: shadow.id,
                }
              );
            }
          } catch (error) {
            this.errorLog('SHADOW_INIT', `Failed to initialize shadow ${shadow.id} on join`, error);
          }
        })
      );

      dungeon.shadowHP = shadowHP;
    }

    // CRITICAL: Initialize boss and mob attack times to prevent one-shot on join
    // If lastAttackTime is 0 or undefined, set it to now to prevent calculating huge time spans
    const now = Date.now();
    if (!dungeon.boss.lastAttackTime || dungeon.boss.lastAttackTime === 0) {
      dungeon.boss.lastAttackTime = now;
    }
    // Initialize mob attack times
    if (dungeon.mobs?.activeMobs) {
      dungeon.mobs.activeMobs.forEach((mob) => {
        if (!mob.lastAttackTime || mob.lastAttackTime === 0) {
          mob.lastAttackTime = now;
        }
      });
    }

    // Restart intervals with active frequency when user joins
    this.stopShadowAttacks(channelKey);
    this.stopBossAttacks(channelKey);
    this.stopMobAttacks(channelKey);
    this.startShadowAttacks(channelKey);
    this.startBossAttacks(channelKey);
    this.startMobAttacks(channelKey);

    // Extraction: Mobs stored in BdAPI for deferred processing after dungeon completion

    this.updateBossHPBar(channelKey);
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
          `CRITICAL HIT! User damage: ${Math.floor(userDamage / 2)} -> ${userDamage} (2x)`
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
    this.saveSettings();
  }

  /**
   * Calculate base boss stats based on rank.
   * Bosses are intentionally stronger than mobs of the same rank.
   * Multiplier: 1.3–1.7× mob baseline to keep bosses 30–70% stronger.
   * @param {number} rankIndex - Index of rank in dungeonRanks array
   * @returns {Object} Base boss stats { strength, agility, intelligence, vitality, perception }
   */
  calculateBossBaseStats(rankIndex) {
    // PERFORMANCE: Cache boss stats per rank for session (keeps one random roll per rank)
    const cacheKey = `boss_${rankIndex}`;
    if (this._bossBaseStatsCache.has(cacheKey)) {
      return this._bossBaseStatsCache.get(cacheKey);
    }

    const mobBase = this.calculateMobBaseStats(rankIndex);
    const multiplier = 1.3 + Math.random() * 0.4; // 1.3–1.7x

    // Derive boss stats from mob baseline so scaling stays consistent
    const strength = Math.floor(mobBase.strength * multiplier);
    const agility = Math.floor(mobBase.agility * multiplier);
    const intelligence = Math.floor(mobBase.intelligence * multiplier);
    const vitality = Math.floor(mobBase.vitality * multiplier);

    // Perception derived from average of primary stats with the same multiplier, scaled down
    const avgCore = (mobBase.strength + mobBase.agility + mobBase.intelligence) / 3;
    const perception = Math.floor(avgCore * multiplier * 0.5);

    const stats = { strength, agility, intelligence, vitality, perception };
    this._bossBaseStatsCache.set(cacheKey, stats);
    return stats;
  }

  /**
   * Calculate base mob stats based on rank
   * @param {number} rankIndex - Index of rank in dungeonRanks array
   * @returns {Object} Base mob stats { strength, agility, intelligence, vitality }
   */
  calculateMobBaseStats(rankIndex) {
    // PERFORMANCE: Cache rank-based calculations to avoid recomputation in hot paths
    const cacheKey = `mob_${rankIndex}`;
    if (this._rankStatsCache.has(cacheKey)) {
      return this._rankStatsCache.get(cacheKey);
    }

    const stats = {
      strength: 100 + rankIndex * 50, // E: 100, S: 350
      agility: 80 + rankIndex * 40, // E: 80, S: 280
      intelligence: 60 + rankIndex * 30, // E: 60, S: 210
      vitality: 150 + rankIndex * 100, // E: 150, S: 650
    };

    this._rankStatsCache.set(cacheKey, stats);
    return stats;
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
      this.debugLog('Regeneration system active', {
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

      // Debug: Log HP regeneration (first 3 times only, debug mode only)
      if (!this._hpRegenCount) this._hpRegenCount = 0;
      if (this._hpRegenCount < 3 && this.settings.userHP !== oldHP) {
        this.debugLog(
          `HP Regen: +${hpRegen}/sec (${(totalRate * 100).toFixed(2)}% rate) | ${oldHP} -> ${
            this.settings.userHP
          } / ${this.settings.userMaxHP}`
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

      // Debug: Log Mana regeneration (first 3 times only, debug mode only)
      if (!this._manaRegenCount) this._manaRegenCount = 0;
      if (this._manaRegenCount < 3 && this.settings.userMana !== oldMana) {
        this.debugLog(
          `Mana Regen: +${manaRegen}/sec (${(totalRate * 100).toFixed(2)}% rate) | ${oldMana} -> ${
            this.settings.userMana
          } / ${this.settings.userMaxMana}`
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

    // Check if shadows are actually all dead BEFORE clearing them
    let shadowsWereAlive = false;
    if (dungeon) {
      const allShadows = await this.getAllShadows();
      const shadowHP = dungeon.shadowHP || {};
      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      for (const s of allShadows) {
        if (!s || !s.id) continue;
        if (deadShadows.has(s.id)) continue;
        if (shadowHP[s.id]?.hp > 0) {
          shadowsWereAlive = true;
          break;
        }
      }
    }

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

    // SHADOWS PERSIST: Keep shadows fighting even when user is defeated
    // Only stop shadow attacks for the current dungeon, but keep them alive
    // Shadows continue fighting in background dungeons
    if (channelKey) {
      this.stopShadowAttacks(channelKey);
    }

    // DO NOT clear shadow HP - shadows persist and continue fighting
    // Shadows can still fight even if user is defeated

    // Only show "All shadows defeated" if shadows were actually alive before defeat
    if (shadowsWereAlive) {
      this.showToast('All shadows defeated. Rejoin when HP regenerates.', 'info');
    }

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
    // Check cache first
    const now = Date.now();
    if (
      this._cache.userEffectiveStats &&
      this._cache.userEffectiveStatsTime &&
      now - this._cache.userEffectiveStatsTime < this._cache.userEffectiveStatsTTL
    ) {
      return this._cache.userEffectiveStats;
    }

    const result =
      this.soloLevelingStats?.getTotalEffectiveStats?.() ||
      this.soloLevelingStats?.settings?.stats ||
      this.getUserStats()?.stats ||
      {};

    // Cache the result
    this._cache.userEffectiveStats = result;
    this._cache.userEffectiveStatsTime = now;

    return result;
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
        // 50% chance to attack mobs, 50% chance to attack boss
        const targetRoll = Math.random();
        return targetRoll < 0.5
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
    if (this._shadowStatsCache && this._shadowStatsCache.has(cacheKey)) {
      const cached = this._shadowStatsCache.get(cacheKey);
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
      perception: shadow.perception || 0,
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
            perception: effectiveStats.perception || stats.perception,
          };
        }
      } catch (error) {
        this.errorLog('SHADOW_STATS', 'Error getting effective stats from ShadowArmy', error);
        // Fall through to fallback calculation
      }
    }

    // Fallback: calculate effective stats manually if ShadowArmy not available
    // CRITICAL: Include ALL stat sources (baseStats + growthStats + naturalGrowthStats)
    if (!this.shadowArmy || typeof this.shadowArmy.getShadowEffectiveStats !== 'function') {
      const baseStats = shadow.baseStats || {};
      const growthStats = shadow.growthStats || {};
      const naturalGrowthStats = shadow.naturalGrowthStats || {};
      stats = {
        strength:
          (baseStats.strength || 0) +
            (growthStats.strength || 0) +
            (naturalGrowthStats.strength || 0) || stats.strength,
        agility:
          (baseStats.agility || 0) +
            (growthStats.agility || 0) +
            (naturalGrowthStats.agility || 0) || stats.agility,
        intelligence:
          (baseStats.intelligence || 0) +
            (growthStats.intelligence || 0) +
            (naturalGrowthStats.intelligence || 0) || stats.intelligence,
        vitality:
          (baseStats.vitality || 0) +
            (growthStats.vitality || 0) +
            (naturalGrowthStats.vitality || 0) || stats.vitality,
        perception:
          (baseStats.perception || 0) +
            (growthStats.perception || 0) +
            (naturalGrowthStats.perception || 0) || stats.perception,
      };
    }

    // Cache result
    if (this._shadowStatsCache) {
      this._shadowStatsCache.set(cacheKey, { stats, timestamp: now });
    }

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

      let appropriateShadows = [];
      for (const s of allShadows) {
        const shadowRankIndex = shadowRanks.indexOf(s.rank);
        const rankDiff = Math.abs(shadowRankIndex - dungeonRankIndex);
        rankDiff <= 2 && appropriateShadows.push(s);
      }

      // Use personality index for fast filtering if available and need more shadows
      if (this.shadowArmy && appropriateShadows.length < assignedCount) {
        try {
          // Try to get aggressive/berserker shadows using personality index
          const preferredPersonalities = ['aggressive', 'berserker', 'assassin'];
          for (const personality of preferredPersonalities) {
            if (this.shadowArmy.getShadowsByPersonality) {
              // PERFORMANCE: Cache personality lookups briefly (1.5s) to reduce repeated calls
              const pCacheKey = `personality_${personality}`;
              const now = Date.now();
              let personalityShadows = null;
              const cached = this._personalityCache.get(pCacheKey);
              if (cached && now - cached.timestamp < 1500) {
                personalityShadows = cached.value;
              } else {
                personalityShadows = await this.shadowArmy.getShadowsByPersonality(personality);
                this._personalityCache.set(pCacheKey, {
                  value: personalityShadows,
                  timestamp: now,
                });
              }

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
          this.errorLog('ALLOCATION', 'Failed to use personality index, using fallback', error);
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
      const wasShadowHPEmpty =
        !dungeon.shadowHP ||
        (typeof dungeon.shadowHP === 'object' && Object.keys(dungeon.shadowHP).length === 0);
      const shadowHP = dungeon.shadowHP || {};
      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      const shadowsToInitialize = [];
      for (const shadow of assignedShadows) {
        const shadowId = shadow?.id || shadow?.i;
        if (!shadow || !shadowId) continue;
        deadShadows.has(shadowId) || shadowsToInitialize.push(shadow);
      }

      await Promise.all(
        shadowsToInitialize.map(async (shadow) => {
          try {
            // Initialize HP using helper function
            const hpData = await this.initializeShadowHP(shadow, shadowHP);

            // Validate HP was set correctly
            if (!hpData || !hpData.hp || hpData.hp <= 0) {
              const shadowId = shadow?.id || shadow?.i;
              this.errorLog('SHADOW_HP', `HP initialization failed for shadow ${shadowId}`, {
                hpData,
                shadowId,
              });
            }
          } catch (error) {
            this.errorLog(
              'SHADOW_INIT',
              `Failed to initialize shadow ${shadow?.id || shadow?.i} before combat`,
              error
            );
          }
        })
      );

      // Deployment verification: on first init for a dungeon, ensure all assigned shadows start at full HP.
      // (We do NOT refill to full HP on subsequent passes to avoid erasing combat damage.)
      if (wasShadowHPEmpty) {
        for (const shadow of assignedShadows) {
          const shadowId = shadow?.id || shadow?.i;
          if (!shadowId) continue;
          const hpData = shadowHP[shadowId];
          if (!hpData || typeof hpData.maxHp !== 'number' || hpData.maxHp <= 0) continue;
          typeof hpData.hp === 'number' && hpData.hp < hpData.maxHp && (hpData.hp = hpData.maxHp);
        }
      }

      // Save initialized HP to dungeon
      dungeon.shadowHP = shadowHP;
    }

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
    let backgroundInterval = 15000 + Math.random() * 5000; // 15-20s
    const isWindowVisible = this.isWindowVisible();
    if (!isWindowVisible) {
      // Window hidden - use much longer intervals (60-120s) to prevent crashes
      backgroundInterval = 60000 + Math.random() * 60000; // 60-120s (much slower)
    }
    // Initialize last processing time
    this._lastShadowAttackTime.set(channelKey, Date.now());

    // Store cadence for global combat loop
    this._shadowActiveIntervalMs.set(channelKey, activeInterval);
    this._shadowBackgroundIntervalMs.set(channelKey, backgroundInterval);
    this.shadowAttackIntervals.set(channelKey, true);
    this._ensureCombatLoop();
  }

  /**
   * Stop shadow attacks for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  stopShadowAttacks(channelKey) {
    this.shadowAttackIntervals.delete(channelKey);
    this._shadowActiveIntervalMs.delete(channelKey);
    this._shadowBackgroundIntervalMs.delete(channelKey);
  }

  /**
   * Stop all shadow attack intervals
   */
  stopAllShadowAttacks() {
    this.shadowAttackIntervals.clear();
    this._shadowActiveIntervalMs.clear();
    this._shadowBackgroundIntervalMs.clear();
  }

  startBossAttacks(channelKey) {
    if (this.bossAttackTimers.has(channelKey)) return;

    // PERFORMANCE: Different intervals for active vs background dungeons
    const isWindowVisible = this.isWindowVisible();

    // Active: 1s, Background: 15-20s (randomized for variance)
    // If window is hidden, use much longer intervals to prevent crashes
    let backgroundInterval = 15000 + Math.random() * 5000; // 15-20s
    if (!isWindowVisible) {
      // Window hidden - use much longer intervals (60-120s) to prevent crashes
      backgroundInterval = 60000 + Math.random() * 60000; // 60-120s (much slower)
    }
    // Initialize last processing time
    this._lastBossAttackTime.set(channelKey, Date.now());

    this._bossBackgroundIntervalMs.set(channelKey, backgroundInterval);
    this.bossAttackTimers.set(channelKey, true);
    this._ensureCombatLoop();
  }

  /**
   * Stop boss attacks for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  stopBossAttacks(channelKey) {
    this.bossAttackTimers.delete(channelKey);
    this._bossBackgroundIntervalMs.delete(channelKey);
  }

  /**
   * Stop all boss attack timers
   */
  stopAllBossAttacks() {
    this.bossAttackTimers.clear();
    this._bossBackgroundIntervalMs.clear();
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
    const isWindowVisible = this.isWindowVisible();

    // Active: 1s, Background: 15-20s (randomized for variance)
    // If window is hidden, use much longer intervals to prevent crashes
    let backgroundInterval = 15000 + Math.random() * 5000; // 15-20s
    if (!isWindowVisible) {
      // Window hidden - use much longer intervals (60-120s) to prevent crashes
      backgroundInterval = 60000 + Math.random() * 60000; // 60-120s (much slower)
    }
    // Initialize last processing time
    this._lastMobAttackTime.set(channelKey, Date.now());

    this._mobBackgroundIntervalMs.set(channelKey, backgroundInterval);
    this.mobAttackTimers.set(channelKey, true);
    this._ensureCombatLoop();
  }

  /**
   * Stop mob attacks for a dungeon
   * @param {string} channelKey - Channel key for the dungeon
   */
  stopMobAttacks(channelKey) {
    this.mobAttackTimers.delete(channelKey);
    this._mobBackgroundIntervalMs.delete(channelKey);
  }

  /**
   * Stop all mob attack timers
   */
  stopAllMobAttacks() {
    this.mobAttackTimers.clear();
    this._mobBackgroundIntervalMs.clear();
  }

  // ============================================================================
  // COMBAT SYSTEM - Shadow Attacks (Dynamic & Chaotic)
  // ============================================================================
  async processShadowAttacks(channelKey, cyclesMultiplier = 1) {
    try {
      // PERFORMANCE: Aggressively reduce processing when window is hidden
      const isWindowVisible = this.isWindowVisible();
      if (!isWindowVisible) {
        // Window hidden - reduce cycles multiplier significantly (75% reduction)
        cyclesMultiplier = Math.max(1, Math.floor(cyclesMultiplier * 0.25)); // Process 75% less
      }

      // CRITICAL: Sync HP/Mana from Stats plugin FIRST (get freshest values)
      // This ensures we're using the latest HP/Mana including regeneration
      // PERFORMANCE: Skip sync when window is hidden (less frequent updates)
      if (isWindowVisible) {
        this.syncHPAndManaFromStats();
      }

      // Validate active dungeon status periodically
      // PERFORMANCE: Skip validation when window is hidden
      if (isWindowVisible && Math.random() < 0.1) {
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
        // PERFORMANCE: Skip expensive initialization when window is hidden
        const shadowsToInitialize = [];
        for (const shadow of assignedShadows) {
          if (!shadow || !shadow.id) continue;
          if (deadShadows.has(shadow.id)) continue;
          if (!isWindowVisible && shadowHP[shadow.id]) continue;
          shadowsToInitialize.push(shadow);
        }

        await Promise.all(
          shadowsToInitialize.map(async (shadow) => {
            try {
              // Initialize HP using helper function
              const hpData = await this.initializeShadowHP(shadow, shadowHP);

              // Validate HP was set correctly
              if (!hpData || !hpData.hp || hpData.hp <= 0) {
                this.errorLog('SHADOW_HP', `HP initialization failed for shadow ${shadow.id}`, {
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
              this.errorLog('SHADOW_INIT', `Failed to initialize shadow ${shadow.id}`, error);
            }
          })
        );
        // Atomic update: create new object reference to prevent race conditions
        // eslint-disable-next-line require-atomic-updates
        dungeon.shadowHP = { ...shadowHP };

        // PERIODIC RESURRECTION CHECK: Attempt to resurrect shadows at 0 HP if mana is available
        // Shadows stay in dungeon at 0 HP until mana regenerates or dungeon ends
        // Shadows are stored in DB and persist - they only leave dungeon when it completes/ends
        // PERFORMANCE: Skip resurrection checks when window is hidden (check less frequently)
        if (isWindowVisible) {
          // Attempt resurrection for shadows at 0 HP (if mana is available)
          // This runs every shadow attack cycle (every 3 seconds) to check for mana availability
          for (const shadow of assignedShadows) {
            if (!shadow || !shadow.id) continue;
            const hpData = shadowHP[shadow.id];
            if (hpData && hpData.hp <= 0) {
              const resurrected = await this.attemptAutoResurrection(shadow, channelKey);
              if (resurrected) {
                // Resurrection successful - restore HP to FULL maxHp
                // CRITICAL: Ensure maxHp is valid, recalculate if missing
                if (!hpData.maxHp || hpData.maxHp <= 0) {
                  // Recalculate maxHp if missing or invalid
                  const recalculatedHP = await this.initializeShadowHP(shadow, shadowHP);
                  hpData.maxHp = recalculatedHP.maxHp;
                }
                hpData.hp = hpData.maxHp; // FULL HP restoration
                // Create new object reference to prevent race condition
                // eslint-disable-next-line require-atomic-updates
                shadowHP[shadow.id] = { ...hpData };
                deadShadows.delete(shadow.id);
              }
              // If resurrection failed (no mana), shadow stays at 0 HP but remains in dungeon
              // Shadow will be checked again in next cycle when mana regenerates
            }
          }
        }
        // Update shadowHP object reference after resurrection attempts
        // eslint-disable-next-line require-atomic-updates
        dungeon.shadowHP = { ...shadowHP };

        // Count alive shadows for combat readiness check
        let aliveShadowCount = 0;
        for (const s of assignedShadows) {
          if (!s || !s.id) continue;
          if (deadShadows.has(s.id)) continue;
          shadowHP[s.id]?.hp > 0 && aliveShadowCount++;
        }

        // Shadow deployment status tracked internally (debug logs removed for performance)

        // Log combat readiness (ONCE per critical threshold to prevent spam)
        if (aliveShadowCount < assignedShadows.length * 0.25 && !dungeon.criticalHPWarningShown) {
          dungeon.criticalHPWarningShown = true;
          this.debugLog(
            `CRITICAL: Only ${aliveShadowCount}/${
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

        // PERFORMANCE: Limit mobs processed based on window visibility
        // Reuse isWindowVisible from function start
        const maxMobsToProcess = isWindowVisible ? 3000 : 500; // Much fewer mobs when hidden
        const aliveMobs = [];
        for (const m of dungeon.mobs.activeMobs) {
          if (aliveMobs.length >= maxMobsToProcess) break;
          m && m.hp > 0 && aliveMobs.push(m);
        }
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
        const combatReadyShadows = this.getCombatReadyShadows(
          assignedShadows,
          deadShadows,
          shadowHP
        );

        // PERFORMANCE: Limit shadow processing when window is hidden
        // Reuse isWindowVisible from function start
        const maxShadowsToProcess = isWindowVisible
          ? combatReadyShadows.length
          : Math.min(10, Math.floor(combatReadyShadows.length * 0.2)); // Only process 20% or max 10 shadows when hidden

        for (let i = 0; i < maxShadowsToProcess; i++) {
          const shadow = combatReadyShadows[i];
          // Guard clause: Ensure shadow exists and has valid ID
          if (!shadow || !shadow.id) {
            continue; // Skip invalid shadow
          }

          const shadowHPData = shadowHP[shadow.id];
          // Double-check HP (should already be filtered by getCombatReadyShadows, but safety check)
          if (!shadowHPData || shadowHPData.hp <= 0) {
            // Shadow at 0 HP - skip combat but DON'T add to deadShadows
            // Shadow remains in dungeon and will be checked for resurrection periodically
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
              this.errorLog(
                'SHADOW_ATTACKS',
                'Shadow became invalid before boss damage application',
                {
                  totalBossDamage,
                }
              );
            } else {
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
            // Use batch damage application helper
            const mobDamageResult = this.batchApplyDamage(
              mobDamageMap,
              aliveMobs,
              (mob, damage) => {
                mob.hp = Math.max(0, mob.hp - damage);
              }
            );

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

        // EXTRACTION: Dead mobs stored for deferred extraction after dungeon completion
        // Extraction data stored in BdAPI to prevent crashes during combat
        // Mobs will be extracted after dungeon ends (boss defeated or timeout)

        const nextActiveMobs = [];
        for (const m of dungeon.mobs.activeMobs) {
          m && m.hp > 0 && nextActiveMobs.push(m);
        }
        dungeon.mobs.activeMobs = nextActiveMobs;
        if (dungeon.mobs.activeMobs.length > 3000) {
          dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.slice(500);
        }

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
    } catch (error) {
      this.errorLog('CRITICAL', 'Fatal error in processShadowAttacks', { channelKey, error });
      // Don't throw - let combat continue
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

    // CRITICAL: Only use IndexedDB storageManager - no fallback to old settings.shadows
    // Shadow data is stored in IndexedDB, not in settings
    if (!this.shadowArmy.storageManager) {
      this.debugLog('GET_ALL_SHADOWS', 'ShadowArmy storageManager not available yet');
      return [];
    }

    try {
      // Get shadows from IndexedDB only (no fallback to old storage)
      const shadows = await this.shadowArmy.storageManager.getShadows({}, 0, 10000);
      if (!shadows || !Array.isArray(shadows)) {
        this.debugLog('GET_ALL_SHADOWS', 'No shadows returned from storageManager');
        return [];
      }

      // HYBRID COMPRESSION SUPPORT: Decompress compressed shadows transparently
      // This ensures combat calculations work correctly regardless of compression
      let decompressed = shadows;
      if (shadows.length > 0 && this.shadowArmy.getShadowData) {
        decompressed = shadows.map((s) => this.shadowArmy.getShadowData(s));
      }

      // Normalize identifiers: ensure every shadow has `id` (some compressed forms use `i` only).
      // This prevents downstream HP init and dead-shadow checks from failing.
      decompressed.forEach((s) => {
        if (!s) return;
        s.id || (s.id = s.i);
      });

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

    const aliveMobs = [];
    for (const m of dungeon.mobs.activeMobs) {
      m && m.hp > 0 && aliveMobs.push(m);
      if (aliveMobs.length >= 3000) break; // prevent unbounded allocations in background paths
    }

    return {
      dungeon,
      bossAlive: dungeon.boss.hp > 0,
      aliveMobs,
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
    // CRITICAL: Cap timeSinceLastAttack to prevent one-shot when joining
    // If timeSinceLastAttack is huge (dungeon running for hours), cap it to reasonable value
    const maxTimeSinceLastAttack = totalTimeSpan * 2; // Max 2x the time span
    const cappedTimeSinceLastAttack = Math.min(
      Math.max(0, timeSinceLastAttack),
      maxTimeSinceLastAttack
    );

    const effectiveCooldown = Math.max(attackInterval, 800); // Min 800ms cooldown

    // If timeSinceLastAttack is 0 or negative (just joined), process 1 attack
    if (cappedTimeSinceLastAttack <= 0) {
      return 1; // Process at least 1 attack if cooldown is ready
    }

    // Calculate how many attacks fit in the remaining time
    const remainingTime = totalTimeSpan - cappedTimeSinceLastAttack;
    if (remainingTime <= 0) {
      return 0; // No time remaining
    }

    // Calculate attacks based on remaining time and cooldown
    return Math.max(1, Math.floor(remainingTime / effectiveCooldown)); // At least 1 attack per cycle
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
    const shadowId = shadow?.id || shadow?.i;
    if (!shadow || !shadowId) {
      this.errorLog('SHADOW_HP', 'Cannot initialize HP: shadow identifier is missing', { shadow });
      return null;
    }

    const existingHP = shadowHP[shadowId];
    const needsInit =
      !existingHP ||
      typeof existingHP.hp !== 'number' ||
      isNaN(existingHP.hp) ||
      existingHP.hp instanceof Promise;

    if (!needsInit) {
      return existingHP;
    }

    try {
      // CRITICAL: Always use effective stats (baseStats + growthStats + naturalGrowthStats) for HP calculation
      // This ensures accuracy by including ALL stat sources: base, level-up growth, and natural growth
      // Effective stats = baseStats + growthStats + naturalGrowthStats
      const effectiveStats = this.getShadowEffectiveStatsCached(shadow);

      // Get vitality from effective stats (includes ALL stat sources)
      let shadowVitality = null;

      if (
        effectiveStats &&
        typeof effectiveStats.vitality === 'number' &&
        !isNaN(effectiveStats.vitality)
      ) {
        shadowVitality = effectiveStats.vitality;
      } else {
        // Fallback: Calculate manually if effective stats unavailable
        const baseStats = shadow.baseStats || {};
        const growthStats = shadow.growthStats || {};
        const naturalGrowthStats = shadow.naturalGrowthStats || {};
        shadowVitality =
          (baseStats.vitality || 0) +
          (growthStats.vitality || 0) +
          (naturalGrowthStats.vitality || 0);

        this.debugLog('SHADOW_HP', 'Calculated vitality manually (fallback)', {
          shadowId,
          calculatedVitality: shadowVitality,
          baseVitality: baseStats.vitality || 0,
          growthVitality: growthStats.vitality || 0,
          naturalGrowthVitality: naturalGrowthStats.vitality || 0,
        });
      }

      // Final fallback: Use strength if vitality is still 0 or invalid
      if (
        shadowVitality === null ||
        shadowVitality === 0 ||
        typeof shadowVitality !== 'number' ||
        isNaN(shadowVitality)
      ) {
        if (typeof shadow.strength === 'number' && !isNaN(shadow.strength) && shadow.strength > 0) {
          shadowVitality = shadow.strength;
          this.debugLog(
            'SHADOW_HP',
            `Vitality was 0/invalid, using strength as fallback for shadow ${shadowId}`,
            {
              strength: shadow.strength,
            }
          );
        } else {
          // Absolute minimum fallback
          shadowVitality = 50;
          this.debugLog(
            'SHADOW_HP',
            `No valid vitality found, using default 50 for shadow ${shadowId}`,
            {
              shadowVitality: shadow.vitality,
              shadowStrength: shadow.strength,
            }
          );
        }
      }

      // Ensure vitality is non-negative (0 is valid, but negative is not)
      if (shadowVitality < 0) {
        shadowVitality = 0;
      }

      // CRITICAL: Calculate HP using effective stats vitality (includes ALL stat sources)
      // Formula: 100 + VIT × 10 + rankIndex × 50 (same as user HP)
      // Then multiply by 0.10 (10%) so shadows have 10% of user HP
      // Effective stats vitality = baseStats.vitality + growthStats.vitality + naturalGrowthStats.vitality
      const shadowRank = shadow.rank || 'E';
      const baseHP = await this.calculateHP(shadowVitality, shadowRank);

      // Shadows have 10% of the calculated HP (10% of user HP formula result)
      // This ensures shadows can die (HP can reach 0) while still being durable enough to fight
      const maxHP = Math.floor(baseHP * 0.1);

      // CRITICAL: Ensure HP is at least 1 (shadows must be able to take damage and die)
      // If calculated HP is 0, shadows would be immediately dead, which breaks combat
      const finalMaxHP = Math.max(1, maxHP);

      // Validate HP was calculated correctly
      if (typeof finalMaxHP !== 'number' || isNaN(finalMaxHP) || finalMaxHP <= 0) {
        const effectiveStatsForLog = this.getShadowEffectiveStatsCached(shadow);
        this.errorLog('SHADOW_HP', `Invalid HP calculated for shadow ${shadowId}`, {
          baseHP,
          maxHP,
          finalMaxHP,
          shadowVitality,
          rank: shadowRank,
          formula: '(100 + VIT × 10 + rankIndex × 50) × 0.10',
          effectiveStats: effectiveStatsForLog,
          baseStats: shadow.baseStats,
          growthStats: shadow.growthStats,
          naturalGrowthStats: shadow.naturalGrowthStats,
        });
        // Set minimum HP to prevent shadow from being immediately dead
        // Use formula with minimum VIT (50) as fallback, then 10%
        const rankIndex = this.settings.dungeonRanks.indexOf(shadowRank);
        const minBaseHP = 100 + 50 * 10 + rankIndex * 50; // Formula with VIT=50
        const minHP = Math.max(1, Math.floor(minBaseHP * 0.1)); // 10% of minimum, at least 1
        // Atomic update: create new object to prevent race conditions
        const hpData = { hp: minHP, maxHp: minHP };
        // eslint-disable-next-line require-atomic-updates
        shadowHP[shadowId] = hpData;
        return hpData;
      }

      // HP successfully calculated from effective stats vitality using formula: (100 + VIT × 10 + rankIndex × 50) × 0.10
      // Effective stats vitality includes: baseStats.vitality + growthStats.vitality + naturalGrowthStats.vitality
      // Shadows CAN die (HP can reach 0) - this is handled in combat damage logic
      // Atomic update: create new object to prevent race conditions
      const hpData = { hp: finalMaxHP, maxHp: finalMaxHP };
      // eslint-disable-next-line require-atomic-updates
      shadowHP[shadowId] = hpData;
      return hpData;
    } catch (error) {
      this.errorLog('SHADOW_HP', `Failed to initialize HP for shadow ${shadowId}`, error);
      // Set minimum HP to prevent shadow from being immediately dead
      const minHP = 100;
      shadowHP[shadowId] = { hp: minHP, maxHp: minHP };
      return shadowHP[shadowId];
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
    const combatReady = [];
    for (const shadow of assignedShadows) {
      if (!shadow || !shadow.id) continue;
      if (deadShadows.has(shadow.id)) continue;
      const hpData = shadowHP[shadow.id];
      hpData && hpData.hp > 0 && combatReady.push(shadow);
    }
    return combatReady;
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
    // Apply minimal reduction (10%) - user takes most of the damage when shadows are dead
    // This ensures proper damage scaling based on boss stats
    return Math.max(1, Math.floor(rawDamage * 0.9));
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
    // Apply minimal reduction (15%) - mobs are slightly weaker but still deal proper damage
    // This ensures proper damage scaling based on mob stats
    return Math.max(1, Math.floor(rawDamage * 0.85));
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
   * CRITICAL: Always use effective stats (baseStats + growthStats + naturalGrowthStats) for accuracy
   * @param {Object} shadow - Shadow object
   * @returns {Object} Shadow stats object
   */
  buildShadowStats(shadow) {
    // CRITICAL: Use effective stats (includes ALL stat sources: baseStats + growthStats + naturalGrowthStats)
    const effectiveStats = this.getShadowEffectiveStatsCached(shadow);

    if (effectiveStats) {
      return {
        strength: effectiveStats.strength || 0,
        agility: effectiveStats.agility || 0,
        intelligence: effectiveStats.intelligence || 0,
        vitality: effectiveStats.vitality || 0,
      };
    }

    // Fallback: Calculate manually if effective stats unavailable
    const baseStats = shadow.baseStats || {};
    const growthStats = shadow.growthStats || {};
    const naturalGrowthStats = shadow.naturalGrowthStats || {};

    return {
      strength:
        (baseStats.strength || 0) +
          (growthStats.strength || 0) +
          (naturalGrowthStats.strength || 0) ||
        shadow.strength ||
        0,
      agility:
        (baseStats.agility || 0) + (growthStats.agility || 0) + (naturalGrowthStats.agility || 0) ||
        0,
      intelligence:
        (baseStats.intelligence || 0) +
          (growthStats.intelligence || 0) +
          (naturalGrowthStats.intelligence || 0) || 0,
      vitality:
        (baseStats.vitality || 0) +
          (growthStats.vitality || 0) +
          (naturalGrowthStats.vitality || 0) ||
        shadow.strength ||
        50,
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
    // CRITICAL: Cap timeSinceLastAttack to prevent one-shot when joining
    // If timeSinceLastAttack is huge (dungeon running for hours), cap it to reasonable value
    const activeInterval = 1000; // 1 second base interval
    const totalTimeSpan = cyclesMultiplier * activeInterval;
    const maxTimeSinceLastAttack = totalTimeSpan * 2; // Max 2x the time span
    const cappedTimeSinceLastAttack = Math.min(
      Math.max(0, timeSinceLastAttack),
      maxTimeSinceLastAttack
    );

    // If cyclesMultiplier > 1, calculate based on time span
    if (cyclesMultiplier > 1) {
      // Calculate how many attacks fit in the time span
      const attacksInSpan = Math.floor(totalTimeSpan / attackCooldown);
      return Math.max(1, Math.min(attacksInSpan, cyclesMultiplier)); // At least 1, max cyclesMultiplier
    }

    // Single cycle: if cooldown is ready, process 1 attack
    return cappedTimeSinceLastAttack >= attackCooldown ? 1 : 0;
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
    try {
      // PERFORMANCE: Aggressively reduce processing when window is hidden
      const isWindowVisible = this.isWindowVisible();
      if (!isWindowVisible) {
        // Window hidden - reduce cycles multiplier significantly (75% reduction)
        cyclesMultiplier = Math.max(1, Math.floor(cyclesMultiplier * 0.25)); // Process 75% less
      }

      // CRITICAL: Sync HP/Mana from Stats plugin FIRST (get freshest values)
      // This ensures we're using the latest HP/Mana including regeneration
      // PERFORMANCE: Skip sync when window is hidden (less frequent updates)
      if (isWindowVisible) {
        this.syncHPAndManaFromStats();
      }

      const dungeon = this.activeDungeons.get(channelKey);
      if (
        !dungeon ||
        !dungeon.boss ||
        dungeon.boss.hp <= 0 ||
        dungeon.completed ||
        dungeon.failed
      ) {
        this.stopBossAttacks(channelKey);
        return;
      }

      const now = Date.now();
      const activeInterval = 1000; // Boss attacks every 1 second
      const totalTimeSpan = cyclesMultiplier * activeInterval;

      // OPTIMIZATION: Calculate attacks using helper function
      // CRITICAL: Initialize lastAttackTime if not set (prevents one-shot on join)
      if (!dungeon.boss.lastAttackTime || dungeon.boss.lastAttackTime === 0) {
        dungeon.boss.lastAttackTime = now;
      }
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
      let aliveShadows = this.getCombatReadyShadows(allShadows, deadShadows, shadowHP);

      // BATCH PROCESSING: Calculate all attacks in one calculation with variance
      let totalUserDamage = 0;
      const shadowDamageMap = new Map(); // Track damage per shadow
      const rankMultipliers = { E: 1, D: 2, C: 3, B: 5, A: 8, S: 12 };
      const maxTargetsPerAttack = rankMultipliers[dungeon.boss?.rank] || 1;
      const _totalShadowsKilled = 0; // Tracked via deadShadows Set

      for (let _i = 0; _i < attacksInSpan; _i++) {
        // Refresh alive shadows list (some may have died)
        aliveShadows = this.getCombatReadyShadows(allShadows, deadShadows, shadowHP);

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
      }

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
            if (resurrected) {
              // Resurrection successful - restore HP to FULL maxHp
              // CRITICAL: Ensure maxHp is valid, recalculate if missing
              if (!shadowHPData.maxHp || shadowHPData.maxHp <= 0) {
                // Recalculate maxHp if missing or invalid
                const recalculatedHP = await this.initializeShadowHP(targetShadow, shadowHP);
                shadowHPData.maxHp = recalculatedHP.maxHp;
              }
              shadowHPData.hp = shadowHPData.maxHp; // FULL HP restoration
              // Create new object reference to prevent race condition
              // eslint-disable-next-line require-atomic-updates
              shadowHP[shadowId] = { ...shadowHPData };
              deadShadows.delete(shadowId); // Remove from deadShadows if it was there
            } else {
              // Resurrection failed (no mana) - shadow stays at 0 HP but remains in dungeon
              // DO NOT add to deadShadows - shadow will be checked for resurrection periodically
              // Shadow remains in dungeon until mana is available or dungeon ends
            }
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
    } catch (error) {
      this.errorLog('CRITICAL', 'Fatal error in processBossAttacks', { channelKey, error });
      // Don't throw - let combat continue
    }
  }

  async processMobAttacks(channelKey, cyclesMultiplier = 1) {
    try {
      // PERFORMANCE: Aggressively reduce processing when window is hidden
      const isWindowVisible = this.isWindowVisible();
      if (!isWindowVisible) {
        // Window hidden - reduce cycles multiplier significantly (75% reduction)
        cyclesMultiplier = Math.max(1, Math.floor(cyclesMultiplier * 0.25)); // Process 75% less
      }

      // CRITICAL: Sync HP/Mana from Stats plugin FIRST (get freshest values)
      // This ensures we're using the latest HP/Mana including regeneration
      // PERFORMANCE: Skip sync when window is hidden (less frequent updates)
      if (isWindowVisible) {
        this.syncHPAndManaFromStats();
      }

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
      let aliveShadows = this.getCombatReadyShadows(allShadows, deadShadows, shadowHP);

      // BATCH PROCESSING: Calculate all mob attacks in one calculation with variance
      const shadowDamageMap = new Map(); // Track damage per shadow
      let totalUserDamage = 0;

      // PRIORITY SYSTEM: Mobs attack shadows FIRST, only attack user if ALL shadows are dead
      // Guard clause: Check again in case dungeon.mobs became null between checks
      if (!dungeon.mobs || !dungeon.mobs.activeMobs || dungeon.mobs.activeMobs.length === 0) {
        return;
      }

      for (const mob of dungeon.mobs.activeMobs) {
        if (!mob || mob.hp <= 0) continue;

        // Calculate how many attacks this mob would make in the time span
        // CRITICAL: Initialize lastAttackTime if not set (prevents one-shot on join)
        if (!mob.lastAttackTime || mob.lastAttackTime === 0) {
          mob.lastAttackTime = now;
        }
        const timeSinceLastAttack = now - mob.lastAttackTime;
        const attacksInSpan = this.calculateAttacksInSpan(
          timeSinceLastAttack,
          mob.attackCooldown,
          cyclesMultiplier
        );

        if (attacksInSpan <= 0) continue;

        // Apply mob stat variance (±10% per mob)
        const mobStatVariance = 0.9 + Math.random() * 0.2;
        const mobStats = {
          strength: Math.floor(mob.strength * mobStatVariance),
          agility: Math.floor(mob.agility * mobStatVariance),
          intelligence: Math.floor(mob.intelligence * mobStatVariance),
          vitality: Math.floor(mob.vitality * mobStatVariance),
        };

        // Process batch attacks
        for (let _j = 0; _j < attacksInSpan; _j++) {
          // Refresh alive shadows list (some may have died)
          aliveShadows = this.getCombatReadyShadows(allShadows, deadShadows, shadowHP);

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
              if (!shadowHPData || shadowHPData.hp <= 0) continue;

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
              continue;
            }
          }

          if (!dungeon.userParticipating) continue;

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
        }

        // Update mob attack time
        mob.lastAttackTime = now + totalTimeSpan;
      }

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
            if (resurrected) {
              // Resurrection successful - restore HP to FULL maxHp
              // CRITICAL: Ensure maxHp is valid, recalculate if missing
              if (!shadowHPData.maxHp || shadowHPData.maxHp <= 0) {
                // Recalculate maxHp if missing or invalid
                const recalculatedHP = await this.initializeShadowHP(targetShadow, shadowHP);
                shadowHPData.maxHp = recalculatedHP.maxHp;
              }
              shadowHPData.hp = shadowHPData.maxHp; // FULL HP restoration
              // Create new object reference to prevent race condition
              // eslint-disable-next-line require-atomic-updates
              shadowHP[shadowId] = { ...shadowHPData };
              deadShadows.delete(shadowId); // Remove from deadShadows if it was there
            } else {
              // Resurrection failed (no mana) - shadow stays at 0 HP but remains in dungeon
              // DO NOT add to deadShadows - shadow will be checked for resurrection periodically
              // Shadow remains in dungeon until mana is available or dungeon ends
            }
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
      dungeon.shadowHP = { ...shadowHP };
      this.deadShadows.set(channelKey, deadShadows);

      // REAL-TIME UPDATE: Update boss HP bar after boss attacks complete
      this.updateBossHPBar(channelKey);

      this.saveSettings();
    } catch (error) {
      this.errorLog('CRITICAL', 'Fatal error in processMobAttacks', { channelKey, error });
      // Don't throw - let combat continue
    }
  }

  async attackMobs(channelKey, source) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (
      !dungeon ||
      !dungeon.mobs ||
      !dungeon.mobs.activeMobs ||
      dungeon.mobs.activeMobs.length === 0
    )
      return;

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
              }
            }

            dungeon.userParticipating && this.extractImmediately(channelKey, mob);
          }
        });

      this.updateBossHPBar(channelKey);
      // Extraction data stored in BdAPI to prevent crashes during combat
      // Mobs will be extracted after dungeon ends (boss defeated or timeout)

      // AGGRESSIVE CLEANUP: Remove dead mobs (extraction data already stored)
      // Keep only alive mobs
      // Keep only alive mobs (dead mobs are already processed for extraction)
      const nextActiveMobs = [];
      for (const m of dungeon.mobs.activeMobs) {
        m && m.hp > 0 && nextActiveMobs.push(m);
      }
      dungeon.mobs.activeMobs = nextActiveMobs;
      return;
    }

    if (source === 'shadows') {
      // Shadows attack mobs (CHAOTIC: individual timings, random targets)
      const allShadows = await this.getAllShadows();
      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      const shadowHP = dungeon.shadowHP || {};
      const now = Date.now();

      // Filter alive mobs and shadows
      const aliveMobs = [];
      for (const m of dungeon.mobs.activeMobs) {
        m && m.hp > 0 && aliveMobs.push(m);
      }
      if (aliveMobs.length === 0) return;

      for (const shadow of allShadows) {
        if (!shadow || !shadow.id) continue;
        if (deadShadows.has(shadow.id)) continue;
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

          // Only if user is actively participating
          if (dungeon.userParticipating) {
            this.extractImmediately(channelKey, targetMob);
          }
        }

        const nextActiveMobs = [];
        for (const m of dungeon.mobs.activeMobs) {
          m && m.hp > 0 && nextActiveMobs.push(m);
        }
        dungeon.mobs.activeMobs = nextActiveMobs;

        if (dungeon.mobs.activeMobs.length > 3000) {
          dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.slice(500);
        }
        // No queue cleanup needed - database handles storage

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
          `User dealt ${dungeon.userDamageDealt.toLocaleString()} total damage in ${
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
          `[Event] Shadow extracted: ${shadowData?.name || 'Unknown'} (${
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
    // DEFERRED EXTRACTION: Mobs are already stored in MobBossStorageManager database
    // When mob dies, it's marked for extraction and processed after dungeon completion
    // This prevents crashes during intense combat by deferring extraction processing
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || !dungeon.userParticipating) return;

    // Mobs are already cached in database when spawned
    // No need to store again - extraction will use database records
    // This is a no-op now since mobs are stored in database during spawnMobs()
  }

  /**
   * Process deferred extractions after dungeon completion
   * Processes all stored mob extractions from MobBossStorageManager database in batches
   * Non-blocking: Yields to event loop between batches to prevent interference with active dungeons
   * Returns immediately with promise that resolves when complete
   */
  async processDeferredExtractions(channelKey) {
    // Prevent concurrent extraction processing for same channel
    if (this.extractionInProgress.has(channelKey)) {
      this.debugLog('EXTRACTION', `Extraction already in progress for ${channelKey}, skipping`);
      return { extracted: 0, attempted: 0, paused: false };
    }

    // Get mobs from database (not yet extracted)
    if (!this.mobBossStorageManager) {
      return { extracted: 0, attempted: 0, paused: false };
    }

    const mobsToExtract = await this.mobBossStorageManager.getMobsByDungeon(channelKey, false);

    if (mobsToExtract.length === 0) return { extracted: 0, attempted: 0, paused: false };

    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || !this.shadowArmy || !this.soloLevelingStats) {
      // Dungeon/user data unavailable - mobs remain in database for later processing
      return { extracted: 0, attempted: 0, paused: false };
    }

    // Mark extraction as in progress
    this.extractionInProgress.add(channelKey);

    try {
      // Get user data (snapshot at start)
      const userStats = this.soloLevelingStats.settings?.stats || {};
      const userRank = this.soloLevelingStats.settings?.rank || 'E';
      const userLevel = this.soloLevelingStats.settings?.level || 1;

      let extractedCount = 0;
      let attemptedCount = 0;
      let paused = false;

      // Process in batches of 20 for performance (no chunk allocations)
      const BATCH_SIZE = 20;
      const total = mobsToExtract.length;

      // Process sequentially with delays to yield to event loop
      // This prevents blocking and allows new dungeons to start smoothly
      for (let start = 0; start < total; start += BATCH_SIZE) {
        // Check if user started a new active dungeon (safety check)
        const currentActiveDungeon = this.settings.userActiveDungeon;
        if (currentActiveDungeon && currentActiveDungeon !== channelKey) {
          // User is in a different dungeon now - pause extraction processing
          this.debugLog(
            'EXTRACTION',
            `User started new dungeon ${currentActiveDungeon}, pausing extraction for ${channelKey}`
          );
          // Don't clear pending extractions - will process later when user is idle
          paused = true;
          break;
        }

        const end = Math.min(start + BATCH_SIZE, total);
        const chunk = mobsToExtract.slice(start, end);

        await Promise.all(
          chunk.map(async (mob) => {
            attemptedCount++;
            try {
              const mobId = `dungeon_${channelKey}_mob_${mob.id}_${Date.now()}`;
              const mobRank = mob.rank || dungeon.rank;
              const mobStats = mob.baseStats || {};
              const mobStrength = mob.strength || mobStats.strength || 10;

              const extractionResult = await this.shadowArmy.attemptDungeonExtraction(
                mobId,
                userRank,
                userLevel,
                userStats,
                mobRank,
                mobStats,
                mobStrength,
                dungeon.beastFamilies,
                false // isBoss=false: Mobs get 1 attempt
              );

              // CRITICAL: Mark mob as extracted in database (migration to ShadowArmy successful)
              if (extractionResult && extractionResult.success && this.mobBossStorageManager) {
                try {
                  await this.mobBossStorageManager.markMobExtracted(mob.id);
                  this.debugLog('MOB_MIGRATION', 'Mob successfully migrated to ShadowArmy', {
                    mobId: mob.id,
                    shadowId: extractionResult.shadowId,
                  });
                } catch (error) {
                  this.errorLog('Failed to mark mob as extracted', error);
                }
              }

              extractedCount++;
              return { success: true };
            } catch (error) {
              return { success: false };
            }
          })
        );

        // Yield to event loop between batches (allows new dungeons to start)
        // Small delay prevents blocking while still processing efficiently
        if (end < total) await this._sleep(50);
      }

      // Mobs are marked as extracted in database (no need to clear - they're already marked)
      // Cleanup old extracted mobs periodically (handled by cleanupOldExtractedMobs)

      return { extracted: extractedCount, attempted: attemptedCount, paused };
    } finally {
      // Always clear in-progress flag
      this.extractionInProgress.delete(channelKey);
    }
  }

  /**
   * Start continuous extraction processor (LEGACY - No longer needed)
   * Mobs are now stored in database and processed after dungeon completion
   * This method is kept for backward compatibility but does nothing
   */
  startContinuousExtraction(channelKey) {
    // No-op: Mobs are stored in database and processed after dungeon completion
    // No continuous processing needed
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
    // Legacy interval cleanup (should be empty, but keep for safety)
    if (this.extractionProcessors) {
      this.extractionProcessors.forEach((processor) => clearInterval(processor));
      this.extractionProcessors.clear();
    }

    // Global deferred extraction worker cleanup
    this._stopDeferredExtractionWorker?.();
    this._deferredExtractionQueue && (this._deferredExtractionQueue.length = 0);
    this._deferredExtractionQueued?.clear?.();
    this._deferredExtractionResolvers?.forEach?.(({ reject }) => {
      try {
        reject(new Error('Extraction cancelled: plugin stopped'));
      } catch (e) {
        // ignore
      }
    });
    this._deferredExtractionResolvers?.clear?.();
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
  // processExtractionQueue removed - no longer needed (mobs use database storage)

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
      perception: mob.perception || 50,
    };
    const mobStrength = mobStats.strength;

    // Use unique extraction ID per mob (1 attempt only, no daily limit)
    const mobId = `dungeon_${channelKey}_mob_${mob.id}_${Date.now()}`;

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
            `Low mana: cannot resurrect shadows. Mana: ${this.settings.userMana}/${this.settings.userMaxMana} (${percent}%)`
          );
          this.showToast(`No mana: shadow resurrections paused until mana regenerates.`, 'warning');
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
          `${dungeon.successfulResurrections} shadows resurrected. Mana: ${manaAfter}/${this.settings.userMaxMana} (${percent}%)`
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

        // Auto-cleanup is handled by the global cleanup loop (avoids per-boss long-lived timers)

        // ARISE available (silent)
      } else {
        // User didn't participate, no extraction chance (silent)
      }
    }

    // PROCESS DEFERRED EXTRACTIONS: Extract all stored mobs after dungeon completion
    // This prevents crashes during combat by deferring extraction processing
    // Non-blocking: Processes in background, doesn't delay dungeon completion
    if (
      dungeon.userParticipating &&
      (reason === 'boss' || reason === 'complete' || reason === 'timeout')
    ) {
      // Process extractions asynchronously (don't await - allows new dungeons to start)
      // Extraction will complete in background and update summary if still relevant
      this.queueDeferredExtractions(channelKey)
        .then((results) => {
          // Update summary if extraction completed quickly (within 2 seconds)
          // Otherwise, extraction continues in background without blocking
          summaryStats.shadowsExtracted = results.extracted;
          summaryStats.extractionAttempts = results.attempted;

          // Show extraction summary if significant results
          if (results.attempted > 0) {
            this._setTrackedTimeout(() => {
              this.showToast(
                `Extracted ${results.extracted} shadows from ${results.attempted} mobs`,
                'info'
              );
            }, 500); // Small delay to not interfere with completion summary
          }
        })
        .catch((error) => {
          this.errorLog('Failed to process deferred extractions', error);
        });

      // Set initial values for summary (will be updated if extraction completes quickly)
    }

    // SHOW SINGLE AGGREGATE SUMMARY NOTIFICATION
    if (reason !== 'timeout') {
      this.showDungeonCompletionSummary(summaryStats);
    } else {
      this.showToast(`${dungeon.name} Failed (Timeout)`, 'error');
    }
    // Note: Extraction summary will be shown separately when processing completes

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

      // Clear extraction in-progress flag
      if (this.extractionInProgress) {
        this.extractionInProgress.delete(channelKey);
      }

      // Clean up mobs from database when dungeon completes
      if (this.mobBossStorageManager) {
        try {
          await this.mobBossStorageManager.deleteMobsByDungeon(channelKey);
        } catch (error) {
          this.errorLog('Failed to cleanup mobs from database', error);
        }
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
   * Includes: user XP, shadow XP, level-ups, rank-ups, mobs killed, deaths/revives, extractions
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

    // Extraction summary (if extractions were processed)
    if (stats.shadowsExtracted !== undefined && stats.extractionAttempts > 0) {
      lines.push(
        `Extracted: ${stats.shadowsExtracted} shadows from ${stats.extractionAttempts} mobs`
      );
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
      perception: bossData.boss.perception || 50, // Default perception if not present
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
        this._setTrackedTimeout(() => this.cleanupDefeatedBoss(channelKey), 3000);
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
          if (growthApplied && this.shadowArmy?.storageManager) {
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
    try {
      // PERFORMANCE: Skip expensive DOM updates when window is hidden
      if (!this.isWindowVisible()) {
        return; // Don't update UI when window is not visible
      }

      // CRITICAL: SYNC FROM STATS PLUGIN FIRST (get freshest HP/Mana)
      // Ensures HP bar shows accurate participation status
      this.syncHPAndManaFromStats();

      // Do not render when user/settings layers are open to prevent overlap
      if (this.isSettingsLayerOpen()) {
        this.removeBossHPBar(channelKey);
        this.showChannelHeaderComments(channelKey);
        return;
      }

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
        this.queueHPBarUpdate(channelKey);
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
      // This ensures it shows correctly after guild/channel switches and console opens
      const existingBar = this.bossHPBars.get(channelKey);
      if (existingBar) {
        // Check if bar or its container is still in DOM
        const barInDOM = document.body.contains(existingBar);
        const container = existingBar.closest('.dungeon-boss-hp-container');
        const containerInDOM = container && document.body.contains(container);

        if (!barInDOM || !containerInDOM) {
          // Bar or container removed from DOM - force recreate
          this.bossHPBars.delete(channelKey);
          // Also clean up any orphaned containers
          if (container && !containerInDOM) {
            try {
              container.remove();
            } catch (e) {
              // Ignore errors
            }
          }
        }
      }

      // Hide comments in channel header to make room
      this.hideChannelHeaderComments(channelKey);

      const hpPercent = (dungeon.boss.hp / dungeon.boss.maxHp) * 100;
      let hpBar = this.bossHPBars.get(channelKey);

      if (!hpBar) {
        // PREFERRED: Use channel header (user preference)
        const channelHeader = this.findChannelHeader();
        if (channelHeader) {
          // Use header parent as container
          const headerContainer = channelHeader.parentElement || channelHeader;
          // Verify container is still in DOM before using
          if (document.body.contains(headerContainer)) {
            this.createBossHPBarInContainer(headerContainer, channelKey);
            hpBar = this.bossHPBars.get(channelKey);
          }
        }

        // If header method failed, try fallback
        if (!hpBar) {
          const channelContainer = this.findChannelContainer();
          if (channelContainer && document.body.contains(channelContainer)) {
            this.createBossHPBarInContainer(channelContainer, channelKey);
            hpBar = this.bossHPBars.get(channelKey);
          }
        }

        // If still no HP bar, retry after delay
        if (!hpBar) {
          this.queueHPBarUpdate(channelKey);
          return;
        }
      } else {
        // HP bar exists - verify it's in the correct container and still in DOM
        const container = hpBar.closest('.dungeon-boss-hp-container');
        if (!container || !document.body.contains(container)) {
          // Container missing or removed - recreate
          this.bossHPBars.delete(channelKey);
          // Retry creation
          const channelHeader = this.findChannelHeader();
          if (channelHeader) {
            const headerContainer = channelHeader.parentElement || channelHeader;
            if (document.body.contains(headerContainer)) {
              this.createBossHPBarInContainer(headerContainer, channelKey);
              hpBar = this.bossHPBars.get(channelKey);
            }
          }
          if (!hpBar) {
            const channelContainer = this.findChannelContainer();
            if (channelContainer && document.body.contains(channelContainer)) {
              this.createBossHPBarInContainer(channelContainer, channelKey);
              hpBar = this.bossHPBars.get(channelKey);
            }
          }
        }
      }

      // REAL-TIME: Get fresh mob counts (throttled cleanup)
      const now = Date.now();
      let aliveMobs = 0;
      const totalMobs = dungeon.mobs?.targetCount || 0;
      const _killedMobs = dungeon.mobs?.killed || 0; // Used in display calculation

      const lastCleanup = this._mobCleanupCache.get(channelKey);
      const shouldCleanup = !lastCleanup || now - lastCleanup.time > 500;
      if (shouldCleanup) {
        aliveMobs = dungeon.mobs?.activeMobs?.filter((m) => m && m.hp > 0).length || 0;
        if (dungeon.mobs?.activeMobs) {
          dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m && m.hp > 0);
        }
        this._mobCleanupCache.set(channelKey, { time: now, alive: aliveMobs });
      } else {
        aliveMobs = lastCleanup.alive || 0;
      }

      // REAL-TIME: Get current boss HP (ensure it's up-to-date)
      const currentBossHP = dungeon.boss?.hp || 0;
      const currentBossMaxHP = dungeon.boss?.maxHp || 0;

      // Boss bar diffing: skip rebuild if payload unchanged; still update fill/text
      const payloadKey = JSON.stringify({
        hp: Math.floor(currentBossHP),
        maxHp: Math.floor(currentBossMaxHP),
        hpPercent: Math.floor(hpPercent * 10) / 10,
        aliveMobs,
        totalMobs,
        participating: dungeon.userParticipating,
        type: dungeon.type,
        rank: dungeon.rank,
        name: dungeon.name,
      });

      if (hpBar && this._bossBarCache.get(channelKey) === payloadKey) {
        const fillEl = hpBar.querySelector('.hp-bar-fill');
        const textEl = hpBar.querySelector('.hp-bar-text');
        if (fillEl) fillEl.style.width = `${hpPercent}%`;
        if (textEl) textEl.textContent = `${Math.floor(hpPercent)}%`;
        this.scheduleBossBarLayout(hpBar.parentElement);
        return;
      }

      this._bossBarCache.set(channelKey, payloadKey);

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

      // Re-apply layout in case member list visibility changed
      this.scheduleBossBarLayout(hpBar.parentElement);

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
    } catch (error) {
      this.errorLog('CRITICAL', 'Error updating boss HP bar', { channelKey, error });
      // Don't throw - just log and continue
    }
  }

  /**
   * Find channel header element using multiple strategies
   * @returns {HTMLElement|null} Channel header element or null
   */
  findChannelHeader() {
    // PERFORMANCE: Cache container detection results (2s TTL) to avoid repeated DOM queries
    const cacheKey = 'channelHeader';
    const now = Date.now();
    const cached = this._containerCache.get(cacheKey);
    if (cached && now - cached.timestamp < 2000) {
      // Verify cached element still exists in DOM
      if (cached.value && document.body.contains(cached.value)) {
        return cached.value;
      }
    }

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

    // Cache result
    if (header) {
      this._containerCache.set(cacheKey, { value: header, timestamp: now });
    }

    return header;
  }

  /**
   * Find channel container (main chat area) - more stable than header
   * @returns {HTMLElement|null} Channel container element or null
   */
  findChannelContainer() {
    // PERFORMANCE: Cache container detection results (2s TTL) to avoid repeated DOM queries
    const cacheKey = 'channelContainer';
    const now = Date.now();
    const cached = this._containerCache.get(cacheKey);
    if (cached && now - cached.timestamp < 2000) {
      // Verify cached element still exists in DOM
      if (cached.value && document.body.contains(cached.value)) {
        return cached.value;
      }
    }

    // Strategy 1: Look for main chat container by aria-label
    let container =
      document.querySelector('main[aria-label*="Chat"]') ||
      document.querySelector('[class*="chat"][class*="container"]') ||
      document.querySelector('[class*="chatContainer"]');

    // Strategy 2: Find by structure - look for message list container
    if (!container) {
      const messageList =
        document.querySelector('[class*="messageList"]') ||
        document.querySelector('[class*="messages"]');
      if (messageList) {
        container = messageList.closest('[class*="container"]') || messageList.parentElement;
      }
    }

    // Strategy 3: Find by channel content area
    if (!container) {
      container =
        document.querySelector('[class*="channel"] [class*="content"]') ||
        document.querySelector('[class*="chat"] [class*="content"]');
    }

    // Cache result
    if (container) {
      this._containerCache.set(cacheKey, { value: container, timestamp: now });
    }

    return container;
  }

  /**
   * Create boss HP bar in a container (channel header or container fallback)
   * @param {HTMLElement} container - Container element to attach to
   * @param {string} channelKey - Channel key for the dungeon
   */
  createBossHPBarInContainer(container, channelKey) {
    if (!container) {
      this.errorLog('Cannot create boss HP bar: container is null', { channelKey });
      return;
    }

    // Verify container is still in DOM before proceeding
    if (!document.body.contains(container)) {
      this.debugLog('HP_BAR_CREATE', 'Container not in DOM, will retry', { channelKey });
      this.queueHPBarUpdate(channelKey);
      return;
    }

    try {
      // Clean up any existing containers first to prevent duplicates
      // Only clean up containers that are not in the DOM or are empty
      document.querySelectorAll('.dungeon-boss-hp-container').forEach((el) => {
        try {
          const hasBar = el.querySelector('.dungeon-boss-hp-bar');
          const inDOM = document.body.contains(el);
          // Remove if empty or not in DOM (orphaned)
          if ((!hasBar || !inDOM) && el.getAttribute('data-channel-key') === channelKey) {
            el.remove();
          }
        } catch {
          // Ignore errors during cleanup
        }
      });

      // Look for existing container for this specific channel
      let bossHpContainer = container.querySelector(
        '.dungeon-boss-hp-container[data-channel-key="' + channelKey + '"]'
      );

      // If found existing container for different channel, remove it first
      const otherContainers = container.querySelectorAll('.dungeon-boss-hp-container');
      otherContainers.forEach((el) => {
        const elChannelKey = el.getAttribute('data-channel-key');
        if (elChannelKey && elChannelKey !== channelKey) {
          // Remove container for different channel
          try {
            el.remove();
          } catch (e) {
            // Ignore errors
          }
        }
      });

      if (!bossHpContainer) {
        // Create container
        bossHpContainer = document.createElement('div');
        bossHpContainer.className = 'dungeon-boss-hp-container';
        bossHpContainer.setAttribute('data-channel-key', channelKey);
        bossHpContainer.style.zIndex = '99';

        // Verify container is still in DOM before inserting
        if (!document.body.contains(container)) {
          this.debugLog('HP_BAR_CREATE', 'Container removed from DOM during creation, will retry', {
            channelKey,
          });
          this.queueHPBarUpdate(channelKey);
          return;
        }

        // Insert at the top of container (before first child) for channel header
        if (container.firstChild) {
          container.insertBefore(bossHpContainer, container.firstChild);
        } else {
          container.appendChild(bossHpContainer);
        }
      } else {
        // Clear existing content
        bossHpContainer.innerHTML = '';
      }

      // Create HP bar element
      const hpBar = document.createElement('div');
      hpBar.className = 'dungeon-boss-hp-bar';
      hpBar.setAttribute('data-dungeon-boss-hp-bar', channelKey);

      // Add HP bar to container
      bossHpContainer.appendChild(hpBar);

      // Adjust layout based on member list visibility/width
      this.scheduleBossBarLayout(bossHpContainer);

      this.bossHPBars.set(channelKey, hpBar);
    } catch (error) {
      this.errorLog('CRITICAL', 'Error creating boss HP bar in container', { channelKey, error });
      // Don't throw - just log and continue
    }
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

  isElementVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0
    );
  }

  isSettingsLayerOpen() {
    return Boolean(
      document.querySelector("[class*='standardSidebarView']") ||
        document.querySelector("[class*='userSettings']") ||
        document.querySelector("[class*='settingsContainer']")
    );
  }

  adjustBossBarLayout(container) {
    if (!container) return;

    // Member list detection: adjust width/margin so bar doesn't sit under member list
    // Cache member list width briefly to avoid repeated reflows
    const memberWrap =
      document.querySelector("[class*='membersWrap']") ||
      document.querySelector("[class*='membersWrap-']");
    const memberVisible = this.isElementVisible(memberWrap);

    let memberWidth = 0;
    const cacheKey = 'memberWidth';
    const now = Date.now();
    const cached = this._memberWidthCache.get(cacheKey);
    if (cached && now - cached.timestamp < 400) {
      memberWidth = cached.width;
    } else if (memberVisible && memberWrap) {
      memberWidth = memberWrap.getBoundingClientRect().width || memberWrap.offsetWidth || 0;
      this._memberWidthCache.set(cacheKey, { width: memberWidth, timestamp: now });
    }

    if (memberVisible && memberWidth > 0) {
      container.style.maxWidth = `calc(100% - ${memberWidth}px)`;
      container.style.marginRight = `${memberWidth}px`;
      container.style.alignSelf = 'flex-start';
    } else {
      container.style.maxWidth = '100%';
      container.style.marginRight = '0';
      container.style.alignSelf = 'stretch';
    }
  }

  scheduleBossBarLayout(container) {
    if (!container) return;

    // PERFORMANCE: Throttle layout adjustments to 100-150ms to reduce layout thrash
    const containerId = container.getAttribute('data-channel-key') || 'default';
    const now = Date.now();
    const lastLayout = this._bossBarLayoutThrottle.get(containerId) || 0;
    const throttleDelay = 120; // 120ms throttle (between 100-150ms)

    if (now - lastLayout < throttleDelay) {
      // Skip this layout adjustment - too soon
      return;
    }

    if (this._bossBarLayoutFrame) {
      cancelAnimationFrame(this._bossBarLayoutFrame);
    }
    this._bossBarLayoutFrame = requestAnimationFrame(() => {
      this.adjustBossBarLayout(container);
      this._bossBarLayoutThrottle.set(containerId, Date.now());
      this._bossBarLayoutFrame = null;
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
            const isNowActive = this.isActiveDungeon(channelKey);

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

            // Restore HP bar if switching back to active dungeon channel
            if (isNowActive && dungeon && dungeon.boss.hp > 0) {
              // Small delay to ensure DOM is ready after channel switch
              setTimeout(() => {
                this.updateBossHPBar(channelKey);
              }, 100);
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
   * Start HP bar restoration loop to restore HP bars removed by DOM changes
   * Checks every 2 seconds and restores HP bars for active dungeons in current channel
   */
  startHPBarRestoration() {
    if (this._hpBarRestoreInterval) return;

    this._hpBarRestoreInterval = setInterval(() => {
      // PERFORMANCE: Skip HP bar restoration when window is hidden
      if (!this.isWindowVisible()) {
        return; // Don't update UI when window is not visible
      }

      // Only restore for active dungeons in the current channel
      const currentChannelInfo = this.getChannelInfo();
      if (!currentChannelInfo) return;

      this.activeDungeons.forEach((dungeon, channelKey) => {
        // Only restore if this is the current channel and dungeon is active
        const isCurrentChannel =
          currentChannelInfo.channelId === dungeon.channelId &&
          currentChannelInfo.guildId === dungeon.guildId;

        if (
          !isCurrentChannel ||
          !dungeon ||
          dungeon.completed ||
          dungeon.failed ||
          dungeon.boss.hp <= 0
        ) {
          return;
        }

        // Check if HP bar exists and is in DOM
        const existingBar = this.bossHPBars.get(channelKey);
        const container = existingBar?.closest('.dungeon-boss-hp-container');
        const barInDOM = existingBar && document.body.contains(existingBar);
        const containerInDOM = container && document.body.contains(container);

        // Restore if bar is missing or not in DOM
        if (!existingBar || !barInDOM || !containerInDOM) {
          // Don't restore if settings layer is open
          if (this.isSettingsLayerOpen()) return;

          // Restore the HP bar
          this.updateBossHPBar(channelKey);
        }
      });
    }, 2000); // Check every 2 seconds

    this._intervals.add(this._hpBarRestoreInterval);
  }

  stopHPBarRestoration() {
    if (this._hpBarRestoreInterval) {
      clearInterval(this._hpBarRestoreInterval);
      this._intervals.delete(this._hpBarRestoreInterval);
      this._hpBarRestoreInterval = null;
    }
  }

  /**
   * Start window visibility tracking for performance optimization
   * Reduces processing frequency when Discord window is hidden/backgrounded
   */
  startVisibilityTracking() {
    if (this._visibilityChangeHandler) return;

    // Initialize visibility state
    this._isWindowVisible = !document.hidden;

    // Listen for visibility changes
    this._visibilityChangeHandler = () => {
      const wasVisible = this._isWindowVisible;
      this._isWindowVisible = !document.hidden;

      if (!this._isWindowVisible && wasVisible) {
        // Window just became hidden - pause all dungeon processing
        this.debugLog('PERF', 'Discord window hidden - pausing dungeon processing');
        this.pauseAllDungeonProcessing();
      } else if (this._isWindowVisible && !wasVisible) {
        // Window just became visible - simulate elapsed time and resume
        this.debugLog('PERF', 'Discord window visible - simulating elapsed time and resuming');
        this.resumeDungeonProcessingWithSimulation();
      }
    };

    // Use both visibilitychange and focus/blur for better compatibility
    document.addEventListener('visibilitychange', this._visibilityChangeHandler);
    window.addEventListener('blur', this._visibilityChangeHandler);
    window.addEventListener('focus', this._visibilityChangeHandler);
  }

  stopVisibilityTracking() {
    if (this._visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
      window.removeEventListener('blur', this._visibilityChangeHandler);
      window.removeEventListener('focus', this._visibilityChangeHandler);
      this._visibilityChangeHandler = null;
    }
    this._isWindowVisible = true; // Reset to visible state
  }

  /**
   * Check if window is currently visible
   * @returns {boolean} True if window is visible
   */
  isWindowVisible() {
    // Always check current state in case event handler missed something
    this._isWindowVisible = !document.hidden;
    return this._isWindowVisible;
  }

  /**
   * Pause all dungeon processing when window is hidden
   * Stores interval states so they can be resumed later
   */
  pauseAllDungeonProcessing() {
    this._windowHiddenTime = Date.now();
    this._pausedIntervals.clear();

    // Pause all active dungeons
    this.activeDungeons.forEach((dungeon, channelKey) => {
      if (dungeon.completed || dungeon.failed) return;

      const pausedState = {
        shadow: this.shadowAttackIntervals.has(channelKey),
        boss: this.bossAttackTimers.has(channelKey),
        mob: this.mobAttackTimers.has(channelKey),
        lastShadowTime: this._lastShadowAttackTime.get(channelKey) || Date.now(),
        lastBossTime: this._lastBossAttackTime.get(channelKey) || Date.now(),
        lastMobTime: this._lastMobAttackTime.get(channelKey) || Date.now(),
      };

      // Stop all intervals
      this.stopShadowAttacks(channelKey);
      this.stopBossAttacks(channelKey);
      this.stopMobAttacks(channelKey);

      // Store state for resumption
      this._pausedIntervals.set(channelKey, pausedState);
    });

    this.debugLog('PERF', `Paused ${this._pausedIntervals.size} dungeon(s)`);
  }

  /**
   * Resume dungeon processing and simulate elapsed time
   * Calculates what would have happened while window was hidden
   *
   * IMPORTANT: This is a ONE-TIME batch calculation per dungeon, NOT running actual combat cycles.
   * - Each dungeon is processed independently with its own ranks, stats, and factors
   * - Calculates total damage/kills that would have occurred during elapsed time
   * - Applies results instantly in one batch operation
   * - Uses same damage formulas as real combat, just batched for performance
   */
  async resumeDungeonProcessingWithSimulation() {
    if (!this._windowHiddenTime) {
      // No pause time recorded, just resume normally
      this.resumeAllDungeonProcessing();
      return;
    }

    const elapsedTime = Date.now() - this._windowHiddenTime;
    this.debugLog('PERF', `Simulating ${Math.floor(elapsedTime / 1000)}s of dungeon combat`);

    // Simulate combat for each paused dungeon (ONE-TIME batch calculation per dungeon)
    // Each dungeon uses its own ranks, boss stats, mob stats, and shadow allocations
    for (const [channelKey, pausedState] of this._pausedIntervals.entries()) {
      const dungeon = this.activeDungeons.get(channelKey);
      if (!dungeon || dungeon.completed || dungeon.failed) continue;

      try {
        // ONE-TIME simulation: Calculates and applies all results for elapsed time
        // Uses dungeon-specific: boss.rank, boss stats, mob ranks, shadow ranks, etc.
        await this.simulateDungeonCombat(channelKey, elapsedTime, pausedState);
      } catch (error) {
        this.errorLog('CRITICAL', 'Error simulating dungeon combat', { channelKey, error });
      }
    }

    // Resume normal processing
    this.resumeAllDungeonProcessing();
    this._windowHiddenTime = null;
    this._pausedIntervals.clear();
  }

  /**
   * Simulate shadow attacks for elapsed cycles
   * Calculates average damage and applies it in batches
   */
  async simulateShadowAttacks(channelKey, cycles) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed) return;

    const shadowHP = dungeon.shadowHP || {};
    const deadShadows = this.deadShadows.get(channelKey) || new Set();
    const assignedShadows = this.shadowAllocations.get(channelKey) || [];

    // Get alive shadows
    const aliveShadows = this.getCombatReadyShadows(assignedShadows, deadShadows, shadowHP);

    if (aliveShadows.length === 0) return;

    const bossStats = {
      strength: dungeon.boss.strength,
      agility: dungeon.boss.agility,
      intelligence: dungeon.boss.intelligence,
      vitality: dungeon.boss.vitality,
    };

    // Calculate average shadow damage per cycle
    let totalBossDamage = 0;

    // Sample a few shadows to calculate average damage (for performance)
    const sampleSize = Math.min(10, aliveShadows.length);
    for (let i = 0; i < sampleSize; i++) {
      const shadow = aliveShadows[i];
      const shadowDamage = this.calculateShadowDamage(shadow, bossStats, dungeon.boss.rank);
      totalBossDamage += shadowDamage;
    }

    // Average damage per shadow
    const avgBossDamagePerShadow = totalBossDamage / sampleSize;
    const avgMobDamagePerShadow = avgBossDamagePerShadow * 0.7; // Mobs take 70% of boss damage

    // Calculate total damage over cycles (70% to mobs, 30% to boss)
    const shadowsPerCycle = Math.floor(aliveShadows.length * 0.5); // ~50% of shadows attack per cycle
    const totalBossDamageOverTime = Math.floor(
      ((avgBossDamagePerShadow * shadowsPerCycle * cycles * 0.3) / sampleSize) * aliveShadows.length
    );
    const totalMobDamageOverTime = Math.floor(
      ((avgMobDamagePerShadow * shadowsPerCycle * cycles * 0.7) / sampleSize) * aliveShadows.length
    );

    // Apply boss damage
    if (totalBossDamageOverTime > 0) {
      dungeon.boss.hp = Math.max(0, dungeon.boss.hp - totalBossDamageOverTime);
    }

    // Apply mob damage (distribute across alive mobs)
    if (totalMobDamageOverTime > 0 && dungeon.mobs?.activeMobs) {
      let aliveCount = 0;
      for (const mob of dungeon.mobs.activeMobs) {
        mob && mob.hp > 0 && aliveCount++;
      }

      if (aliveCount > 0) {
        const damagePerMob = Math.floor(totalMobDamageOverTime / aliveCount);
        const nextActiveMobs = [];
        for (const mob of dungeon.mobs.activeMobs) {
          if (!mob || mob.hp <= 0) continue;
          mob.hp = Math.max(0, mob.hp - damagePerMob);
          if (mob.hp > 0) nextActiveMobs.push(mob);
          else dungeon.mobs.killed = (dungeon.mobs.killed || 0) + 1;
        }
        dungeon.mobs.activeMobs = nextActiveMobs;
      }
    }

    // Update analytics
    if (!dungeon.combatAnalytics) dungeon.combatAnalytics = {};
    dungeon.combatAnalytics.totalBossDamage =
      (dungeon.combatAnalytics.totalBossDamage || 0) + totalBossDamageOverTime;
    dungeon.combatAnalytics.totalMobDamage =
      (dungeon.combatAnalytics.totalMobDamage || 0) + totalMobDamageOverTime;

    // Update shadowHP object
    dungeon.shadowHP = { ...shadowHP };
  }

  /**
   * Simulate boss attacks for elapsed cycles
   * Calculates damage to shadows and user
   */
  async simulateBossAttacks(channelKey, cycles) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed || dungeon.boss.hp <= 0) return;

    const shadowHP = dungeon.shadowHP || {};
    const deadShadows = this.deadShadows.get(channelKey) || new Set();
    const assignedShadows = this.shadowAllocations.get(channelKey) || [];

    const aliveShadows = this.getCombatReadyShadows(assignedShadows, deadShadows, shadowHP);

    const bossStats = {
      strength: dungeon.boss.strength,
      agility: dungeon.boss.agility,
      intelligence: dungeon.boss.intelligence,
      vitality: dungeon.boss.vitality,
    };

    const rankMultipliers = { E: 1, D: 2, C: 3, B: 5, A: 8, S: 12 };
    const maxTargetsPerAttack = rankMultipliers[dungeon.boss?.rank] || 1;

    // Calculate average damage per attack
    let totalShadowDamage = 0;
    let totalUserDamage = 0;

    if (aliveShadows.length > 0) {
      // Boss attacks shadows
      const sampleShadow = aliveShadows[0];
      const shadowStats = this.buildShadowStats(sampleShadow);
      const shadowRank = sampleShadow.rank || 'E';
      const avgShadowDamage = this.calculateBossDamageToShadow(
        bossStats,
        shadowStats,
        dungeon.boss.rank,
        shadowRank
      );

      // Calculate total shadow damage (boss attacks multiple shadows per attack)
      const targetsPerAttack = Math.min(maxTargetsPerAttack, aliveShadows.length);
      totalShadowDamage = Math.floor(avgShadowDamage * targetsPerAttack * cycles);
    } else if (dungeon.userParticipating) {
      // All shadows dead, boss attacks user
      const userStats = this.getUserEffectiveStats();
      const userRank = this.soloLevelingStats?.settings?.rank || 'E';
      const avgUserDamage = this.calculateBossDamageToUser(
        bossStats,
        userStats,
        dungeon.boss.rank,
        userRank
      );
      totalUserDamage = Math.floor(avgUserDamage * cycles);
    }

    // Apply shadow damage (distribute across alive shadows)
    if (totalShadowDamage > 0 && aliveShadows.length > 0) {
      const damagePerShadow = Math.floor(totalShadowDamage / aliveShadows.length);
      aliveShadows.forEach((shadow) => {
        const hpData = shadowHP[shadow.id];
        if (hpData) {
          hpData.hp = Math.max(0, hpData.hp - damagePerShadow);
          shadowHP[shadow.id] = hpData;
          // Shadow death handled - will be resurrected when window becomes visible
        }
      });
    }

    // Update shadowHP object
    dungeon.shadowHP = { ...shadowHP };

    // Apply user damage
    if (totalUserDamage > 0 && dungeon.userParticipating) {
      this.syncHPFromStats();
      this.settings.userHP = Math.max(0, this.settings.userHP - totalUserDamage);
      this.pushHPToStats(true);

      if (this.settings.userHP <= 0) {
        await this.handleUserDefeat(channelKey);
      }
    }

    // Update shadowHP and boss attack time
    dungeon.shadowHP = { ...shadowHP };
    dungeon.boss.lastAttackTime = Date.now();

    // Save settings after simulation
    this.saveSettings();
  }

  /**
   * Simulate mob attacks for elapsed cycles
   * Calculates damage to shadows and user
   */
  async simulateMobAttacks(channelKey, cycles) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed || !dungeon.mobs?.activeMobs) return;

    const shadowHP = dungeon.shadowHP || {};
    const deadShadows = this.deadShadows.get(channelKey) || new Set();
    const assignedShadows = this.shadowAllocations.get(channelKey) || [];

    const aliveShadows = this.getCombatReadyShadows(assignedShadows, deadShadows, shadowHP);

    // Count alive mobs and sample a few for average damage calculation (no full array allocation)
    let aliveMobCount = 0;
    const sampleMobs = [];
    for (const mob of dungeon.mobs.activeMobs) {
      if (!mob || mob.hp <= 0) continue;
      aliveMobCount++;
      sampleMobs.length < 10 && sampleMobs.push(mob);
    }
    if (aliveMobCount === 0) return;

    // Calculate average mob damage (sample a few mobs)
    const sampleSize = sampleMobs.length;

    let totalShadowDamage = 0;
    let totalUserDamage = 0;

    if (aliveShadows.length > 0) {
      // Mobs attack shadows
      const sampleShadow = aliveShadows[0];
      const shadowStats = this.buildShadowStats(sampleShadow);
      const shadowRank = sampleShadow.rank || 'E';

      for (const mob of sampleMobs) {
        const mobStats = {
          strength: mob.strength,
          agility: mob.agility,
          intelligence: mob.intelligence,
          vitality: mob.vitality,
        };
        const avgShadowDamage = this.calculateMobDamageToShadow(
          mobStats,
          shadowStats,
          mob.rank,
          shadowRank
        );
        totalShadowDamage += avgShadowDamage;
      }

      const avgShadowDamagePerMob = totalShadowDamage / sampleSize;
      totalShadowDamage = Math.floor(avgShadowDamagePerMob * aliveMobCount * cycles);
    } else if (dungeon.userParticipating) {
      // All shadows dead, mobs attack user
      const userStats = this.getUserEffectiveStats();
      const userRank = this.soloLevelingStats?.settings?.rank || 'E';

      for (const mob of sampleMobs) {
        const mobStats = {
          strength: mob.strength,
          agility: mob.agility,
          intelligence: mob.intelligence,
          vitality: mob.vitality,
        };
        const avgUserDamage = this.calculateMobDamageToUser(
          mobStats,
          userStats,
          mob.rank,
          userRank
        );
        totalUserDamage += avgUserDamage;
      }

      const avgUserDamagePerMob = totalUserDamage / sampleSize;
      totalUserDamage = Math.floor(avgUserDamagePerMob * aliveMobCount * cycles);
    }

    // Apply shadow damage (distribute across alive shadows)
    if (totalShadowDamage > 0 && aliveShadows.length > 0) {
      const damagePerShadow = Math.floor(totalShadowDamage / aliveShadows.length);
      aliveShadows.forEach((shadow) => {
        const hpData = shadowHP[shadow.id];
        if (hpData) {
          hpData.hp = Math.max(0, hpData.hp - damagePerShadow);
          shadowHP[shadow.id] = hpData;
        }
      });
    }

    // Apply user damage
    if (totalUserDamage > 0 && dungeon.userParticipating) {
      this.syncHPFromStats();
      this.settings.userHP = Math.max(0, this.settings.userHP - totalUserDamage);
      this.pushHPToStats(true);

      if (this.settings.userHP <= 0) {
        await this.handleUserDefeat(channelKey);
      }
    }

    // Update shadowHP and mob attack times
    dungeon.shadowHP = { ...shadowHP };
    // Update mob lastAttackTime for all mobs
    if (dungeon.mobs?.activeMobs) {
      const now = Date.now();
      dungeon.mobs.activeMobs.forEach((mob) => {
        if (mob.hp > 0) {
          mob.lastAttackTime = now;
        }
      });
    }
  }

  /**
   * Resume all dungeon processing (normal resume without simulation)
   */
  resumeAllDungeonProcessing() {
    this.activeDungeons.forEach((dungeon, channelKey) => {
      if (dungeon.completed || dungeon.failed) return;

      // Resume intervals if they were running before
      const pausedState = this._pausedIntervals.get(channelKey);
      if (pausedState) {
        if (pausedState.shadow) this.startShadowAttacks(channelKey);
        if (pausedState.boss) this.startBossAttacks(channelKey);
        if (pausedState.mob) this.startMobAttacks(channelKey);
      }
    });

    this._pausedIntervals.clear();
  }

  /**
   * Simulate dungeon combat for elapsed time
   * ONE-TIME batch calculation - NOT running actual combat cycles
   *
   * Calculates total damage/kills that would have occurred during elapsed time,
   * then applies all results instantly in one batch operation.
   *
   * Uses dungeon-specific factors:
   * - dungeon.boss.rank (for rank multipliers)
   * - dungeon.boss.stats (strength, agility, intelligence, vitality)
   * - mob.rank (for each mob in dungeon.mobs.activeMobs)
   * - shadow ranks (from assignedShadows)
   * - All damage calculations use proper rank-based formulas
   *
   * @param {string} channelKey - Channel key for the dungeon
   * @param {number} elapsedTime - Time elapsed in milliseconds
   * @param {Object} pausedState - State when paused
   */
  async simulateDungeonCombat(channelKey, elapsedTime, pausedState) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed || dungeon.boss.hp <= 0) return;

    // CRITICAL: Sync HP/Mana before simulation
    this.syncHPAndManaFromStats();

    // Calculate how many attack cycles would have occurred
    const shadowInterval = 3000; // 3 seconds
    const bossInterval = 1000; // 1 second
    const mobInterval = 1000; // 1 second

    // Calculate how many attack cycles would have occurred during elapsed time
    // These are used for batch damage calculations, NOT actual combat loops
    const shadowCycles = Math.floor(elapsedTime / shadowInterval);
    const bossCycles = Math.floor(elapsedTime / bossInterval);
    const mobCycles = Math.floor(elapsedTime / mobInterval);

    // ONE-TIME batch calculations (each function calculates and applies all damage at once):
    // - Uses dungeon-specific boss.rank, boss stats, mob ranks, shadow ranks
    // - Calculates total damage over all cycles, then applies in one batch
    // - NOT running actual combat loops - pure math calculation

    // Simulate shadow attacks (damage to boss and mobs) - ONE batch calculation
    if (shadowCycles > 0) {
      await this.simulateShadowAttacks(channelKey, shadowCycles);
    }

    // Simulate boss attacks (damage to shadows and user) - ONE batch calculation
    if (bossCycles > 0) {
      await this.simulateBossAttacks(channelKey, bossCycles);
    }

    // Simulate mob attacks (damage to shadows and user) - ONE batch calculation
    if (mobCycles > 0) {
      await this.simulateMobAttacks(channelKey, mobCycles);
    }

    // Update last attack times to current time
    this._lastShadowAttackTime.set(channelKey, Date.now());
    this._lastBossAttackTime.set(channelKey, Date.now());
    this._lastMobAttackTime.set(channelKey, Date.now());

    // Save settings after all simulations
    this.saveSettings();

    // Update boss HP bar if window is visible
    if (this.isWindowVisible()) {
      this.updateBossHPBar(channelKey);
    }

    this.debugLog(
      'PERF',
      `Simulated ${shadowCycles} shadow, ${bossCycles} boss, ${mobCycles} mob cycles for ${channelKey} (${Math.floor(
        elapsedTime / 1000
      )}s elapsed)`
    );
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
    const queued = this._hpBarUpdateQueue;
    this._hpBarUpdateQueue = new Set();

    for (const channelKey of queued) {
      const lastUpdate = this._lastHPBarUpdate[channelKey] || 0;
      if (now - lastUpdate >= 250) {
        // Throttle passed, update now
        this._lastHPBarUpdate[channelKey] = now;
        this.updateBossHPBar(channelKey);
      } else {
        // Still throttled, re-queue
        this._hpBarUpdateQueue.add(channelKey);
      }
    }

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
        const prevChannelKey = lastChannelKey;
        lastChannelKey = currentChannelKey;
        this.currentChannelKey = currentChannelKey; // Update tracking

        // Validate active dungeon status when channel changes
        this.validateActiveDungeonStatus();

        // Remove all existing boss HP bars first (clean slate)
        this.removeAllBossHPBars();

        // Update indicators when channel changes
        this.updateAllIndicators();

        // Restart attack intervals only when a dungeon's active/background status changes
        this.activeDungeons.forEach((dungeon, channelKey) => {
          if (!dungeon || dungeon.completed || dungeon.failed) return;
          const wasActive = dungeon.userParticipating || prevChannelKey === channelKey;
          const isNowActive = dungeon.userParticipating || currentChannelKey === channelKey;
          if (wasActive === isNowActive) return;

          this.shadowAttackIntervals.has(channelKey) &&
            (this.stopShadowAttacks(channelKey), this.startShadowAttacks(channelKey));
          this.bossAttackTimers.has(channelKey) &&
            (this.stopBossAttacks(channelKey), this.startBossAttacks(channelKey));
          this.mobAttackTimers.has(channelKey) &&
            (this.stopMobAttacks(channelKey), this.startMobAttacks(channelKey));
        });

        // Only update HP bars for dungeons in the current channel
        this.activeDungeons.forEach((dungeon, channelKey) => {
          const isCurrentChannel =
            dungeon?.channelId === channelInfo.channelId &&
            dungeon?.guildId === channelInfo.guildId;
          isCurrentChannel && this.updateBossHPBar(channelKey);
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
        this._setTrackedTimeout(() => {
          checkChannel();
          // Recreate button when channel changes (Discord may recreate toolbar)
          if (!this.dungeonButton) {
            this.createDungeonButton();
          }
        }, 100);
      }
    });

    urlObserver.observe(document, { childList: true, subtree: true });
    this._observers.add(urlObserver);

    // Also listen to popstate for browser navigation
    this._popstateHandler = () => {
      this._setTrackedTimeout(() => {
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
        this._observers.add(headerObserver);

        // Store in channelWatcher for cleanup
        if (this.channelWatcher) {
          this.channelWatcher.headerObserver = headerObserver;
        }
      } else {
        // Track retry timeout and check plugin running state
        const retryId = this._setTrackedTimeout(() => {
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
    this.channelWatcherInterval = setInterval(checkChannel, 2500);
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

    // Cleanup defeated bosses that were not extracted (ARISE) after 5 minutes.
    // Centralized here to avoid per-boss long-lived timers.
    if (this.defeatedBosses && this.defeatedBosses.size > 0) {
      const expiredBossKeys = [];
      for (const [channelKey, bossData] of this.defeatedBosses.entries()) {
        const ts = bossData?.timestamp || 0;
        now - ts >= 5 * 60 * 1000 && expiredBossKeys.push(channelKey);
      }

      // Cap cleanup per tick to avoid spikes if many expire at once.
      const MAX_BOSS_CLEANUPS_PER_TICK = 3;
      expiredBossKeys.slice(0, MAX_BOSS_CLEANUPS_PER_TICK).forEach((channelKey) => {
        this.cleanupDefeatedBoss(channelKey);
      });
    }
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

          // VALIDATE: Ensure boss stats match dungeon rank (fixes any corrupted data)
          if (dungeon.boss && dungeon.rank) {
            const rankIndex = this.settings.dungeonRanks.indexOf(dungeon.rank);
            if (rankIndex >= 0) {
              // Expected boss stats based on rank (using centralized calculation)
              const expectedBossStats = this.calculateBossBaseStats(rankIndex);
              const {
                strength: expStr,
                agility: expAgi,
                intelligence: expInt,
                vitality: expVit,
                perception: expPerception,
              } = expectedBossStats;

              // Bosses should be ~30-70% stronger than mobs of same rank
              const mobBase = this.calculateMobBaseStats(rankIndex);
              const range = (base) => ({
                min: Math.floor(base * 1.25), // slightly below 1.3x to allow variance
                max: Math.ceil(base * 1.75), // slightly above 1.7x to allow variance
              });

              const strRange = range(mobBase.strength);
              const agiRange = range(mobBase.agility);
              const intRange = range(mobBase.intelligence);
              const vitRange = range(mobBase.vitality);
              const perceptionBase =
                ((mobBase.strength + mobBase.agility + mobBase.intelligence) / 3) * 0.5;
              const perceptionRange = range(perceptionBase);

              const clampStat = (val, r) => Math.max(r.min, Math.min(r.max, val));

              // Strength
              if (
                !dungeon.boss.strength ||
                dungeon.boss.strength < strRange.min ||
                dungeon.boss.strength > strRange.max
              ) {
                dungeon.boss.strength = clampStat(expStr, strRange);
                if (dungeon.boss.baseStats) dungeon.boss.baseStats.strength = dungeon.boss.strength;
              }
              // Agility
              if (
                !dungeon.boss.agility ||
                dungeon.boss.agility < agiRange.min ||
                dungeon.boss.agility > agiRange.max
              ) {
                dungeon.boss.agility = clampStat(expAgi, agiRange);
                if (dungeon.boss.baseStats) dungeon.boss.baseStats.agility = dungeon.boss.agility;
              }
              // Intelligence
              if (
                !dungeon.boss.intelligence ||
                dungeon.boss.intelligence < intRange.min ||
                dungeon.boss.intelligence > intRange.max
              ) {
                dungeon.boss.intelligence = clampStat(expInt, intRange);
                if (dungeon.boss.baseStats)
                  dungeon.boss.baseStats.intelligence = dungeon.boss.intelligence;
              }
              // Vitality
              if (
                !dungeon.boss.vitality ||
                dungeon.boss.vitality < vitRange.min ||
                dungeon.boss.vitality > vitRange.max
              ) {
                dungeon.boss.vitality = clampStat(expVit, vitRange);
                if (dungeon.boss.baseStats) dungeon.boss.baseStats.vitality = dungeon.boss.vitality;
              }
              // Perception
              if (
                !dungeon.boss.perception ||
                dungeon.boss.perception < perceptionRange.min ||
                dungeon.boss.perception > perceptionRange.max
              ) {
                dungeon.boss.perception = clampStat(expPerception, perceptionRange);
                if (dungeon.boss.baseStats)
                  dungeon.boss.baseStats.perception = dungeon.boss.perception;
              }
            }
          }

          // VALIDATE: Ensure mob stats match their rank (fixes any corrupted data)
          if (dungeon.mobs && dungeon.mobs.activeMobs && Array.isArray(dungeon.mobs.activeMobs)) {
            dungeon.mobs.activeMobs.forEach((mob) => {
              if (mob.rank) {
                const mobRankIndex = this.settings.dungeonRanks.indexOf(mob.rank);
                if (mobRankIndex >= 0) {
                  // Expected mob stats based on rank (base values, before variance)
                  // Using centralized calculation
                  const expectedMobStats = this.calculateMobBaseStats(mobRankIndex);
                  const expectedBaseStrength = expectedMobStats.strength;
                  const expectedBaseAgility = expectedMobStats.agility;
                  const expectedBaseIntelligence = expectedMobStats.intelligence;
                  const expectedBaseVitality = expectedMobStats.vitality;

                  // Validate stats are within reasonable range (85-115% of base for variance)
                  const minStrength = expectedBaseStrength * 0.85;
                  const maxStrength = expectedBaseStrength * 1.15;
                  const minAgility = expectedBaseAgility * 0.85;
                  const maxAgility = expectedBaseAgility * 1.15;
                  const minIntelligence = expectedBaseIntelligence * 0.85;
                  const maxIntelligence = expectedBaseIntelligence * 1.15;
                  const minVitality = expectedBaseVitality * 0.85;
                  const maxVitality = expectedBaseVitality * 1.15;

                  // Correct stats if they're way off (outside variance range)
                  if (!mob.strength || mob.strength < minStrength || mob.strength > maxStrength) {
                    const variance = 0.85 + Math.random() * 0.3;
                    mob.strength = Math.floor(expectedBaseStrength * variance);
                    if (mob.baseStats) mob.baseStats.strength = mob.strength;
                  }
                  if (!mob.agility || mob.agility < minAgility || mob.agility > maxAgility) {
                    const variance = 0.85 + Math.random() * 0.3;
                    mob.agility = Math.floor(expectedBaseAgility * variance);
                    if (mob.baseStats) mob.baseStats.agility = mob.agility;
                  }
                  if (
                    !mob.intelligence ||
                    mob.intelligence < minIntelligence ||
                    mob.intelligence > maxIntelligence
                  ) {
                    const variance = 0.85 + Math.random() * 0.3;
                    mob.intelligence = Math.floor(expectedBaseIntelligence * variance);
                    if (mob.baseStats) mob.baseStats.intelligence = mob.intelligence;
                  }
                  if (!mob.vitality || mob.vitality < minVitality || mob.vitality > maxVitality) {
                    const variance = 0.85 + Math.random() * 0.3;
                    mob.vitality = Math.floor(expectedBaseVitality * variance);
                    if (mob.baseStats) mob.baseStats.vitality = mob.vitality;

                    // Recalculate HP based on corrected vitality
                    const baseHP = 200 + mob.vitality * 15 + mobRankIndex * 100;
                    const hpVariance = 0.7 + Math.random() * 0.3;
                    const newHP = Math.max(1, Math.floor(baseHP * hpVariance));
                    mob.maxHp = newHP;
                    // Preserve current HP ratio if mob is alive
                    if (mob.hp > 0 && mob.maxHp) {
                      const hpRatio = mob.hp / mob.maxHp;
                      mob.hp = Math.max(1, Math.floor(newHP * hpRatio));
                    } else {
                      mob.hp = newHP;
                    }
                  }
                }
              }
            });
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
        this.debugLog(`Restored ${this.activeDungeons.size} active dungeons`);
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
  async triggerGarbageCollection(trigger = 'manual') {
    this.debugLog(`Triggering garbage collection (${trigger})`);

    // Clean up old extracted mobs from database (24+ hours old)
    if (this.mobBossStorageManager) {
      try {
        const cleanupResult = await this.mobBossStorageManager.cleanupOldExtractedMobs();
        if (cleanupResult.deleted > 0) {
          this.debugLog(`Cleaned up ${cleanupResult.deleted} old extracted mobs from database`);
        }
      } catch (error) {
        this.errorLog('Failed to cleanup old extracted mobs', error);
      }
    }

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
    // PERFORMANCE: Skip toast notifications when window is hidden (except critical errors)
    if (!this.isWindowVisible() && type !== 'error') {
      return; // Don't show non-critical toasts when window is hidden
    }
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
      if (this.errorLog) {
        this.errorLog('CSS', 'Invalid CSS injection parameters', {
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
      if (this.errorLog) {
        this.errorLog('CSS', `Failed to inject CSS: ${styleId}`, error);
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
      if (this.errorLog) {
        this.errorLog('CSS', `Failed to remove CSS: ${styleId}`, error);
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
      if (this.errorLog) {
        this.errorLog('CSS', 'Failed to detect theme variables', error);
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
      [class*='layer']:has([class*='standardSidebarView']) .dungeon-boss-hp-container,
      /* When any layer above base layer */
      [class*='layer'][class*='baseLayer'] ~ [class*='layer'] .dungeon-boss-hp-container,
      /* When settings layer exists */
      body:has([class*='userSettings']) .dungeon-boss-hp-container,
      body:has([class*='settingsContainer']) .dungeon-boss-hp-container,
      body:has([class*='standardSidebarView']) .dungeon-boss-hp-container {
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
