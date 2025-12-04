/**
 * @name Dungeons
 * @author BlueFlashX1
 * @description Solo Leveling Dungeon system - Random dungeons spawn in channels, fight mobs and bosses with your stats and shadow army
 * @version 3.0.0
 *
 * Features:
 * - 9 themed biomes (Forest, Arctic, Volcano, Mountains, etc.)
 * - Biome-specific magic beast spawns
 * - Extended ranks: E-SSS, NH, Monarch, Monarch+, Shadow Monarch
 * - One dungeon per channel (across all servers)
 * - User can select which dungeon to participate in
 * - Shadow army attacks ALL dungeons simultaneously
 * - Shadows auto-resurrect with mana consumption
 * - Boss HP bars with responsive design
 * - Massive mob counts (2,000-150,000)
 * - IndexedDB storage for dungeon persistence
 * - Dragon restrictions (NH+ only)
 * - Themed dungeon/boss names per biome
 *
 * @changelog v3.0.0 (2025-12-03)
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

          console.log('[DungeonStorageManager] Database upgraded to v2 with new indices');
        }
      };

      request.onblocked = () => {
        console.warn('DungeonStorageManager: Database upgrade blocked by other tabs');
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
    const sanitized = JSON.parse(JSON.stringify(dungeon, (key, value) => {
      // Skip Promise values
      if (value instanceof Promise) {
        console.warn(`[DungeonStorage] Skipping Promise value for key: ${key}`);
        return undefined;
      }
      // Skip function values
      if (typeof value === 'function') {
        return undefined;
      }
      return value;
    }));

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
      spawnChance: 10, // 10% chance per message
      dungeonDuration: 600000, // 10 minutes
      shadowAttackInterval: 3000,
      userAttackCooldown: 2000,
      mobKillNotificationInterval: 30000,
      mobSpawnInterval: 500, // Spawn new mobs every 0.5 seconds (ultra fast for epic battles)
      mobSpawnCount: 500, // Spawn 500 mobs at a time (1,000 mobs/sec generation rate)
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

    // Plugin references
    this.soloLevelingStats = null;
    this.shadowArmy = null;
    this.toasts = null;
    this.deadShadows = new Map(); // Track dead shadows per dungeon
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

    // Plugin running state
    this.started = false;

    // Fallback toast system
    this.fallbackToastContainer = null;
    this.fallbackToasts = [];

    // Track observer start time to ignore old messages
    this.observerStartTime = Date.now();
    this.processedMessageIds = new Set(); // Track processed message IDs to avoid duplicates

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
  // PLUGIN LIFECYCLE - Start & Stop
  // ============================================================================
  async start() {
    // Set plugin running state
    this.started = true;

    // Reset observer start time when plugin starts
    this.observerStartTime = Date.now();
    this.loadSettings();

    // Inject CSS immediately
    this.injectCSS();

    // Retry CSS injection after delays to ensure it's loaded
    setTimeout(() => this.injectCSS(), 1000);
    setTimeout(() => this.injectCSS(), 3000);
    setTimeout(() => this.injectCSS(), 5000);

    this.loadPluginReferences();
    await this.initStorage();

    // Recalculate mana pool on startup (in case shadow army grew while plugin was off)
    setTimeout(async () => {
      await this.recalculateUserMana();
    }, 2000);

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
    this.setupChannelWatcher();

    // Start HP/Mana regeneration loop (every 1 second)
    this.startRegeneration();
  }

  stop() {
    // Set plugin stopped state
    this.started = false;

    // Stop HP/Mana regeneration
    this.stopRegeneration();

    this.stopMessageObserver();
    this.stopAllShadowAttacks();
    this.stopAllBossAttacks();
    this.stopAllMobAttacks();
    this.stopAllDungeonCleanup();
    this.removeAllIndicators();
    this.removeAllBossHPBars();

    // Clean up fallback toast container
    if (this.fallbackToastContainer && this.fallbackToastContainer.parentNode) {
      this.fallbackToastContainer.parentNode.removeChild(this.fallbackToastContainer);
      this.fallbackToastContainer = null;
    }
    this.fallbackToasts = [];
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

    // Remove injected CSS
    this.removeCSS();

    this.saveSettings();

    // Remove popstate listener
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
      this._popstateHandler = null;
    }

    // Remove statsChanged listener to prevent memory leak
    if (this._onStatsChangedUnsubscribe && typeof this._onStatsChangedUnsubscribe === 'function') {
      this._onStatsChangedUnsubscribe();
      this._onStatsChangedUnsubscribe = null;
    }

    // Clear all retry timeouts
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
      console.log('Dungeons: IndexedDB storage initialized (v2 schema)');

      // Log database statistics
      const stats = await this.storageManager.getDungeonStats();
      console.log(
        `[Dungeons DB] Stats: ${stats.total} total (${stats.active} active, ${stats.completed} completed, ${stats.failed} failed) | ${stats.totalMobsKilled} mobs killed | Avg shadows: ${stats.averageShadowsAssigned}`
      );
    } catch (error) {
      console.error('Dungeons: Failed to initialize storage', error);
    }
  }

  /**
   * Get database statistics (useful for debugging and monitoring)
   */
  async getDatabaseStats() {
    if (!this.storageManager) {
      console.log('[Dungeons] Storage manager not initialized');
      return null;
    }

    try {
      const stats = await this.storageManager.getDungeonStats();
      console.log('[Dungeons] Database Statistics:', stats);

      // Pretty print stats
      console.log(`Total dungeons: ${stats.total}`);
      console.log(
        `Active: ${stats.active} | Completed: ${stats.completed} | Failed: ${stats.failed}`
      );
      console.log(`Total mobs killed: ${stats.totalMobsKilled}`);
      console.log(`Average shadows assigned: ${stats.averageShadowsAssigned}`);
      console.log('By rank:', stats.byRank);
      console.log('By type:', stats.byType);

      return stats;
    } catch (error) {
      console.error('[Dungeons] Error getting database stats:', error);
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
      console.warn('Dungeons: Failed to get user ID', error);
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
      console.error('Dungeons: Failed to load settings', error);
      this.settings = { ...this.defaultSettings };
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('Dungeons', 'settings', this.settings);
    } catch (error) {
      console.error('Dungeons: Failed to save settings', error);
    }
  }

  // ============================================================================
  // USER STATS & RESOURCES - HP/Mana Scaling
  // ============================================================================
  async initializeUserStats() {
    // Calculate user HP from TOTAL EFFECTIVE VITALITY (including buffs) + SHADOW ARMY SIZE
    if (!this.settings.userMaxHP || this.settings.userMaxHP === null) {
      const totalStats =
        this.soloLevelingStats?.getTotalEffectiveStats?.() ||
        this.soloLevelingStats?.settings?.stats ||
        {};
      const vitality = totalStats.vitality || 0;
      const rank = this.soloLevelingStats?.settings?.rank || 'E';

      // Get shadow army size for HP scaling
      const shadowCount = this.shadowArmy ? await this.getShadowCount() : 0;

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
      const totalStats =
        this.soloLevelingStats?.getTotalEffectiveStats?.() ||
        this.soloLevelingStats?.settings?.stats ||
        {};
      const intelligence = totalStats.intelligence || 0;

      // Get shadow army size for mana scaling
      const shadowCount = this.shadowArmy ? await this.getShadowCount() : 0;

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
   * Get current shadow count
   */
  async getShadowCount() {
    try {
      if (this.shadowArmy?.storageManager) {
        const shadows = await this.shadowArmy.storageManager.getShadows({}, 0, 10000);
        return shadows.length;
      }
    } catch (error) {
      console.error('[Dungeons] Failed to get shadow count:', error);
    }
    return 0;
  }

  // ============================================================================
  // PLUGIN INTEGRATION - External Plugin References
  // ============================================================================
  async loadPluginReferences() {
    try {
      // Load SoloLevelingStats plugin
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (soloPlugin?.instance) {
        this.soloLevelingStats = soloPlugin.instance;
        // Initialize user stats after loading plugin reference
        await this.initializeUserStats();

        // Subscribe to stats changes to update HP/Mana bars
        if (typeof this.soloLevelingStats.on === 'function') {
          const callback = () => {
            this.updateUserHPBar();
          };
          this._onStatsChangedUnsubscribe = this.soloLevelingStats.on('statsChanged', callback);
        }
      }

      // Load ShadowArmy plugin
      const shadowPlugin = BdApi.Plugins.get('ShadowArmy');
      if (shadowPlugin?.instance) {
        this.shadowArmy = shadowPlugin.instance;
      }

      // Load SoloLevelingToasts plugin (with detailed checking)
      const toastsPlugin = BdApi.Plugins.get('SoloLevelingToasts');
      if (toastsPlugin) {
        if (toastsPlugin.instance) {
          // Check if the instance has the showToast method
          if (typeof toastsPlugin.instance.showToast === 'function') {
            this.toasts = toastsPlugin.instance;
          } else {
            console.warn(
              '[Dungeons] WARNING: SoloLevelingToasts plugin instance found but showToast method missing'
            );
          }
        } else {
          console.warn(
            `[Dungeons] WARNING: SoloLevelingToasts plugin exists but instance not ready (enabled: ${toastsPlugin.enabled})`
          );
        }
      } else {
        console.warn(
          '[Dungeons] WARNING: SoloLevelingToasts plugin not found - will use fallback notifications'
        );
      }
    } catch (error) {
      console.error('[Dungeons] Error loading plugin references:', error);
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
      console.error('[Dungeons] Error getting guild channels:', e);
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
      console.error('[Dungeons] Error getting random channel:', e);
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
            if (fiber.memoizedProps?.channel?.id) {
              return {
                guildId: fiber.memoizedProps.channel.guild_id || 'DM',
                channelId: fiber.memoizedProps.channel.id,
              };
            }
            fiber = fiber.return;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Dungeons: Error getting channel info', error);
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

      for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container) {
          return container;
        }
      }

      // Fallback: Find scroller that contains actual message elements
      const scrollers = document.querySelectorAll('[class*="scroller"]');
      for (const scroller of scrollers) {
        const hasMessages = scroller.querySelector('[class*="message"]') !== null;
        if (hasMessages) {
          return scroller;
        }
      }

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

      this.messageObserver.observe(messageContainer, { childList: true, subtree: true });
    } else {
      console.error('[Dungeons] Message container not found! Observer not started.');

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
      console.error('Dungeons: Error handling message', error);
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
          if (timestamp) {
            return new Date(timestamp).getTime();
          }
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
        let fiber = messageElement[reactKey];
        for (let i = 0; i < 20 && fiber; i++) {
          const msgId = fiber.memoizedProps?.message?.id;
          if (msgId) return String(msgId);
          fiber = fiber.return;
        }
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
  async checkDungeonSpawn(channelKey, channelInfo) {
    // IMPORTANT: Only one dungeon per channel ID (prevents duplicates)
    if (this.activeDungeons.has(channelKey)) {
      return;
    }

    const lastSpawn = this.settings.lastSpawnTime[channelKey] || 0;
    const timeSinceLastSpawn = Date.now() - lastSpawn;
    const dungeonDuration = this.settings.dungeonDuration || 300000;

    if (timeSinceLastSpawn < dungeonDuration) return;

    const spawnChance = this.settings.spawnChance || 10;
    const roll = Math.random() * 100;

    if (roll > spawnChance) return;

    // ALLOW MULTIPLE DUNGEONS: Can spawn in different channels simultaneously
    const dungeonRank = this.calculateDungeonRank();
    await this.createDungeon(channelKey, channelInfo, dungeonRank);
  }

  calculateDungeonRank() {
    let userRank = 'E';
    if (this.soloLevelingStats?.settings) {
      userRank = this.soloLevelingStats.settings.rank || 'E';
    }
    const rankIndex = this.settings.dungeonRanks.indexOf(userRank);
    const maxRankIndex = this.settings.dungeonRanks.length - 1;
    const weights = [];
    for (let i = 0; i <= maxRankIndex; i++) {
      if (i <= rankIndex) {
        weights.push(10 - (rankIndex - i));
      } else {
        weights.push(Math.max(1, 5 - (i - rankIndex)));
      }
    }
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) return this.settings.dungeonRanks[i];
    }
    return this.settings.dungeonRanks[0];
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
    this.settings.lastSpawnTime[channelKey] = Date.now();
    this.settings.mobKillNotifications[channelKey] = { count: 0, lastNotification: Date.now() };

    // Save to IndexedDB
    if (this.storageManager) {
      try {
        await this.storageManager.saveDungeon(dungeon);
      } catch (error) {
        console.error('[Dungeons] Failed to save dungeon', error);
      }
    }

    this.saveSettings();
    this.showDungeonIndicator(channelKey, channelInfo);
    // Simple spawn notification
    this.showToast(`${dungeonName} [${rank}] Spawned!`, 'info');

    // INITIAL BURST SPAWN: Fill 30% of mob cap immediately for epic battles
    // This ensures rapid action without performance hit
    const initialBurstSize = Math.min(5000, Math.floor(totalMobCount * 0.3));

    // Validate mobSpawnCount (prevent corrupted settings)
    const validMobSpawnCount = Math.max(50, this.settings.mobSpawnCount || 500);
    const burstWaves = Math.ceil(initialBurstSize / validMobSpawnCount);

    console.log(
      `[Dungeons] ⚡ [${rank}] ${dungeonName}: BURST SPAWN ${initialBurstSize}/${totalMobCount} mobs (${Math.floor(initialBurstSize/totalMobCount*100)}%)`
    );

    // Spawn initial burst synchronously
    let burstMobsSpawned = 0;
    for (let i = 0; i < burstWaves; i++) {
      const beforeCount = dungeon.mobs.total;
      this.spawnMobs(channelKey);
      burstMobsSpawned += (dungeon.mobs.total - beforeCount);
    }

    console.log(
      `[Dungeons] ✅ [${rank}] ${dungeonName}: Burst complete! Spawned ${burstMobsSpawned} mobs. Current: ${dungeon.mobs.total}/${totalMobCount}`
    );

    // Save dungeon after initial burst
    if (this.storageManager) {
      try {
        await this.storageManager.saveDungeon(dungeon);
      } catch (error) {
        console.error('[Dungeons] Failed to save dungeon after burst', error);
      }
    }

    // Pre-split shadow army for optimal performance
    await this.preSplitShadowArmy();

    // Shadows attack automatically (Solo Leveling lore: shadows sweep dungeons independently)
    this.startShadowAttacks(channelKey);
    this.startMobKillNotifications(channelKey);
    this.startMobSpawning(channelKey); // Continue spawning remaining mobs over time
    this.startBossAttacks(channelKey);
    this.startMobAttacks(channelKey);

    console.log(
      `[Dungeons] ${dungeonName} [${dungeonType}] spawned (${rank} rank, ${totalMobCount} mobs, boss HP: ${finalBossHP}), ${expectedShadowCount} shadows expected`
    );
  }

  // ============================================================================
  // CONTINUOUS MOB SPAWNING
  // ============================================================================
  startMobSpawning(channelKey) {
    if (this.mobSpawnTimers.has(channelKey)) return;

    // Start spawn timer for this specific dungeon
    const timer = setInterval(() => {
      this.spawnMobs(channelKey);
    }, this.settings.mobSpawnInterval);
    this.mobSpawnTimers.set(channelKey, timer);

    // Start capacity monitor for this dungeon (checks every 5 seconds)
    this.startCapacityMonitor(channelKey);
  }

  /**
   * Monitor dungeon capacity and ensure it reaches max
   * Runs every 5 seconds to verify spawning is progressing
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
        console.warn(
          `[Dungeons] ⚠️ [${channelKey.slice(-8)}] ${dungeon.name}: SPAWN STALLED! Stuck at ${current}/${target} (${percent}%) for 10+ seconds`
        );
        // Force a spawn attempt
        this.spawnMobs(channelKey);
      }

      // Update tracking
      dungeon.lastCapacityCheck = now;
      dungeon.lastCapacityCount = current;

      // Stop monitoring when at max
      if (current >= target) {
        console.log(
          `[Dungeons] 🎯 [${channelKey.slice(-8)}] ${dungeon.name}: Capacity monitor verified MAX (${current}/${target})`
        );
        this.stopCapacityMonitor(channelKey);
      }
    }, 5000); // Check every 5 seconds

    this.capacityMonitors.set(channelKey, monitor);
  }

  stopCapacityMonitor(channelKey) {
    const monitor = this.capacityMonitors?.get(channelKey);
    if (monitor) {
      clearInterval(monitor);
      this.capacityMonitors.delete(channelKey);
    }
  }

  stopAllCapacityMonitors() {
    if (this.capacityMonitors) {
      this.capacityMonitors.forEach((monitor) => clearInterval(monitor));
      this.capacityMonitors.clear();
    }
  }

  stopMobSpawning(channelKey) {
    const timer = this.mobSpawnTimers.get(channelKey);
    if (timer) {
      clearInterval(timer);
      this.mobSpawnTimers.delete(channelKey);
    }
  }

  stopAllMobSpawning() {
    this.mobSpawnTimers.forEach((timer) => clearInterval(timer));
    this.mobSpawnTimers.clear();
    this.stopAllCapacityMonitors();
  }

  /**
   * Select appropriate magic beast type based on biome families and rank
   * Returns beast type data compatible with Shadow Army extraction
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
    let availableBeasts = Object.values(magicBeastTypes).filter(beast =>
      allowedFamilies.includes(beast.family)
    );

    // Filter by rank restrictions
    const mobRankIndex = allRanks.indexOf(mobRank);
    availableBeasts = availableBeasts.filter(beast => {
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

    // PER-DUNGEON CAPACITY CHECK: Each dungeon tracked by channelKey
    // This ensures each dungeon independently spawns to its max capacity
    const currentTotal = dungeon.mobs.total;
    const targetCount = dungeon.mobs.targetCount;
    const capacityPercent = currentTotal / targetCount;

    // Only spawn if boss alive AND haven't reached THIS dungeon's target
    if (dungeon.boss.hp > 0 && currentTotal < targetCount) {
      const dungeonRankIndex = this.settings.dungeonRanks.indexOf(dungeon.rank);

      // DYNAMIC SPAWN RATE per dungeon based on ITS capacity
      let spawnCount;

      if (capacityPercent < 0.9) {
        // Phase 1: RAPID FILL (0-90% capacity)
        spawnCount = this.settings.mobSpawnCount; // 500 mobs (1000 mobs/sec)
      } else {
        // Phase 2: NORMAL REPLENISHMENT (90-100% capacity)
        spawnCount = 50; // 50 mobs every 0.5s = 100 mobs/sec
      }

      // Calculate remaining for THIS dungeon
      const remainingToSpawn = targetCount - currentTotal;
      const actualSpawnCount = Math.min(spawnCount, remainingToSpawn);

      // CRITICAL DEBUG: Log final batches
      if (remainingToSpawn <= 100 && remainingToSpawn > 0) {
        console.log(
          `[Dungeons] 🎯 [${channelKey}] ${dungeon.name}: FINAL BATCH - Spawning ${actualSpawnCount} of ${remainingToSpawn} remaining to reach ${targetCount}`
        );
      }

      // BATCH MOB GENERATION with INDIVIDUAL VARIANCE
      // Pre-allocate array for performance
      const newMobs = new Array(actualSpawnCount);

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
        // NERFED: Reduced multipliers for faster mob kills (50% HP reduction)
        const baseHP = 250 + mobVitality * 8 + mobRankIndex * 200; // Was: 500 + vit*20 + rank*500
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
        newMobs[i] = {
          // Core mob identity
          id: `mob_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
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
      }

      // Batch append to activeMobs array (more efficient than individual pushes)
      dungeon.mobs.activeMobs.push(...newMobs);
      dungeon.mobs.remaining += actualSpawnCount;
      dungeon.mobs.total += actualSpawnCount;

      // CRITICAL DEBUG: Per-dungeon capacity tracking and milestones
      const newCapacityPercent = dungeon.mobs.total / dungeon.mobs.targetCount;

      // Log 90% threshold transition (spawn rate change) - PER DUNGEON
      if (capacityPercent < 0.9 && newCapacityPercent >= 0.9) {
        console.log(
          `[Dungeons] 🔥 [${channelKey.slice(-8)}] ${dungeon.name}: 90% CAPACITY (${dungeon.mobs.total}/${targetCount}). Spawn: 1000→100 mobs/sec`
        );
      }

      // Log every 10% milestone - PER DUNGEON (not spamming)
      const oldMilestone = Math.floor(capacityPercent * 10);
      const newMilestone = Math.floor(newCapacityPercent * 10);
      if (newMilestone > oldMilestone && newMilestone <= 9) {
        console.log(
          `[Dungeons] 📊 [${channelKey.slice(-8)}] ${dungeon.name}: ${newMilestone * 10}% (${dungeon.mobs.total}/${targetCount})`
        );
      }

      // CRITICAL: Stop spawning when reached THIS dungeon's target
      if (dungeon.mobs.total >= targetCount) {
        this.stopMobSpawning(channelKey);
        const actual = dungeon.mobs.total;
        if (actual > targetCount) {
          console.warn(
            `[Dungeons] ⚠️ [${channelKey.slice(-8)}] ${dungeon.name}: OVER CAPACITY! ${actual}/${targetCount} (+${actual - targetCount} extra)`
          );
        } else {
          console.log(
            `[Dungeons] ✅ [${channelKey.slice(-8)}] ${dungeon.name}: MAX CAPACITY (${actual}/${targetCount}). Spawning STOPPED for THIS dungeon.`
          );
        }
      } else if (dungeon.mobs.total === targetCount - 1) {
        // One away from max - log for debugging
        console.log(
          `[Dungeons] 🎯 [${channelKey.slice(-8)}] ${dungeon.name}: ONE MORE to max! (${dungeon.mobs.total}/${targetCount})`
        );
      }

      // Update storage
      if (this.storageManager) {
        this.storageManager.saveDungeon(dungeon).catch(console.error);
      }
    }
  }

  // ============================================================================
  // USER PARTICIPATION & SELECTION
  // ============================================================================
  async selectDungeon(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) {
      this.showToast('Dungeon not found', 'error');
      return;
    }

    // Check if user has HP to join
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
    if (this.settings.userActiveDungeon && this.settings.userActiveDungeon !== channelKey) {
      const prevDungeon = this.activeDungeons.get(this.settings.userActiveDungeon);
      if (prevDungeon && !prevDungeon.completed && !prevDungeon.failed) {
        this.showToast(
          `Already in ${prevDungeon.name}!\nYou must complete, be defeated, or leave your current dungeon first.`,
          'error'
        );
        return; // BLOCKED - can't join multiple dungeons
      }
      // Previous dungeon is completed/failed, can join new one
      if (prevDungeon) {
        prevDungeon.userParticipating = false;
      }
    }

    dungeon.userParticipating = true;
    this.settings.userActiveDungeon = channelKey;

    // Restart shadow attacks when user rejoins
    this.startShadowAttacks(channelKey);

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
      if (messageElement) {
        // Check if message has critical hit class
        const hasCritClass = messageElement.classList?.contains('bd-crit-hit') ||
                           messageElement.querySelector?.('.bd-crit-hit') !== null;
        if (hasCritClass) {
          isCritical = true;
          // CRITICAL HIT MULTIPLIER: 2x damage!
          userDamage = Math.floor(userDamage * 2.0);
          console.log(`[Dungeons] 🔥 CRITICAL HIT! User damage: ${Math.floor(userDamage / 2)} → ${userDamage} (2x)`);
        }
      }

      await this.applyDamageToBoss(channelKey, userDamage, 'user', null, isCritical);
    } else {
      // Attack mobs
      await this.attackMobs(channelKey, 'user');
    }
  }

  // ============================================================================
  // STAT-BASED COMBAT CALCULATIONS
  // ============================================================================
  /**
   * Calculate HP from vitality stat
   */
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
  async recalculateUserMana() {
    if (!this.soloLevelingStats) return;

    const totalStats =
      this.soloLevelingStats?.getTotalEffectiveStats?.() ||
      this.soloLevelingStats?.settings?.stats ||
      {};
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
      console.log(
        `[Dungeons] Mana pool increased: ${oldMaxMana} -> ${this.settings.userMaxMana} (+${manaIncrease} from shadow army growth)`
      );
    }

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
    if (this.regenInterval) return; // Already running

    // Start HP/Mana regeneration interval (logging removed)
    this.regenInterval = setInterval(() => {
      this.regenerateHPAndMana();
    }, 1000); // Regenerate every 1 second
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
   * Regenerate HP and Mana based on user stats
   * HP regen: Based on vitality (1% of max HP per second per 100 vitality)
   * Mana regen: Based on intelligence (1% of max mana per second per 100 intelligence)
   *
   * This function runs every 1 second via setInterval in startRegeneration()
   */
  regenerateHPAndMana() {
    if (!this.soloLevelingStats) return;

    // Get total effective stats (including buffs)
    const totalStats =
      this.soloLevelingStats?.getTotalEffectiveStats?.() ||
      this.soloLevelingStats?.settings?.stats ||
      {};
    const vitality = totalStats.vitality || 0;
    const intelligence = totalStats.intelligence || 0;

    // VALIDATION: Ensure HP/Mana values are valid numbers
    let needsInit = false;

    if (typeof this.settings.userHP !== 'number' || isNaN(this.settings.userHP)) {
      this.settings.userHP = this.settings.userMaxHP || 100;
      needsInit = true;
    }
    if (typeof this.settings.userMana !== 'number' || isNaN(this.settings.userMana)) {
      this.settings.userMana = this.settings.userMaxMana || 100;
      needsInit = true;
    }
    if (typeof this.settings.userMaxHP !== 'number' || isNaN(this.settings.userMaxHP) || this.settings.userMaxHP <= 0) {
      this.settings.userMaxHP = 100;
      needsInit = true;
    }
    if (typeof this.settings.userMaxMana !== 'number' || isNaN(this.settings.userMaxMana) || this.settings.userMaxMana <= 0) {
      this.settings.userMaxMana = 100;
      needsInit = true;
    }

    if (needsInit) {
      console.warn(`[Dungeons] HP/Mana values initialized: HP=${this.settings.userHP}/${this.settings.userMaxHP}, Mana=${this.settings.userMana}/${this.settings.userMaxMana}`);
    }

    // HP regeneration: 1% of max HP per second per 100 vitality
    // Formula: (vitality / 100) * 0.01 * maxHP per second
    let hpChanged = false;
    let manaChanged = false;

    // DETECTION: Check if regeneration is needed
    const needsHPRegen = this.settings.userHP < this.settings.userMaxHP;
    const needsManaRegen = this.settings.userMana < this.settings.userMaxMana;

    // HP REGENERATION: Execute if HP is below max
    if (needsHPRegen) {
      const hpRegenRate = (vitality / 100) * 0.01; // 1% per 100 vitality
      const hpRegen = Math.max(1, Math.floor(this.settings.userMaxHP * hpRegenRate));
      const oldHP = this.settings.userHP;
      this.settings.userHP = Math.min(this.settings.userMaxHP, this.settings.userHP + hpRegen);

      // Sync with SoloLevelingStats if available
      if (this.soloLevelingStats?.settings) {
        this.soloLevelingStats.settings.userHP = this.settings.userHP;
        this.soloLevelingStats.settings.userMaxHP = this.settings.userMaxHP;
        hpChanged = this.settings.userHP !== oldHP;
      }

      // Track regeneration state (logging removed - visible in UI)
      if (!this._hpRegenActive) {
        this._hpRegenActive = true;
      }

      // Reset flag when HP becomes full
      if (this.settings.userHP >= this.settings.userMaxHP && this._hpRegenActive) {
        this._hpRegenActive = false;
      }
    } else {
      // HP is already full - reset regen active flag
      this._hpRegenActive = false;
    }

    // MANA REGENERATION: Execute if Mana is below max
    if (needsManaRegen) {
    // Mana regeneration: 1% of max mana per second per 100 intelligence
    // Formula: (intelligence / 100) * 0.01 * maxMana per second
      const manaRegenRate = (intelligence / 100) * 0.01; // 1% per 100 intelligence
      const manaRegen = Math.max(1, Math.floor(this.settings.userMaxMana * manaRegenRate));
      const oldMana = this.settings.userMana;
      this.settings.userMana = Math.min(
        this.settings.userMaxMana,
        this.settings.userMana + manaRegen
      );

      // Sync with SoloLevelingStats if available
      if (this.soloLevelingStats?.settings) {
        this.soloLevelingStats.settings.userMana = this.settings.userMana;
        this.soloLevelingStats.settings.userMaxMana = this.settings.userMaxMana;
        manaChanged = this.settings.userMana !== oldMana;
      }

      // Track regeneration state (logging removed - visible in UI)
      if (!this._manaRegenActive) {
        this._manaRegenActive = true;
      }

      // Reset flag when Mana becomes full
      if (this.settings.userMana >= this.settings.userMaxMana && this._manaRegenActive) {
        this._manaRegenActive = false;
      }
    } else {
      // Mana is already full - reset regen active flag
      this._manaRegenActive = false;
    }

    // REAL-TIME UI UPDATE: Update HP/Mana bars in SoloLevelingStats
    // This happens GLOBALLY (not just during dungeons)
    if ((hpChanged || manaChanged) && this.soloLevelingStats) {
      // Call the verified function name from SoloLevelingStats.plugin.js (line 4940)
      if (typeof this.soloLevelingStats.updateHPManaBars === 'function') {
        this.soloLevelingStats.updateHPManaBars();
      } else if (typeof this.soloLevelingStats.updateUI === 'function') {
        this.soloLevelingStats.updateUI();
      }

      // Save settings periodically (every 10 regeneration cycles = 10 seconds)
      // This reduces I/O while ensuring data persists
      if (!this._regenCycleCount) this._regenCycleCount = 0;
      this._regenCycleCount++;
      if (this._regenCycleCount >= 10) {
        this.saveSettings();
        if (typeof this.soloLevelingStats.saveSettings === 'function') {
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
    const dungeon = this.activeDungeons.get(channelKey);

    this.showToast('You were defeated!', 'error');

    // Remove user from current dungeon participation
    if (dungeon) {
      dungeon.userParticipating = false;
    }

    // Clear active dungeon
    this.settings.userActiveDungeon = null;

    // Stop all shadow attacks in ALL dungeons (shadows die when user dies)
    this.stopAllShadowAttacks();

    // Clear shadow HP from ALL dungeons (shadows disappear when user dies)
    this.activeDungeons.forEach((dungeon) => {
      dungeon.shadowHP = {};
    });

    // Clear all dead shadows tracking
    this.deadShadows.clear();

    // Show message that user can rejoin if they have HP
    this.showToast(
      'Shadow armies have been defeated. Rejoin the dungeon when you have HP to continue.',
      'info'
    );

    this.updateUserHPBar();
    this.saveSettings();
  }

  /**
   * Get user stats (total effective stats including all buffs)
   * This is the main method other plugins should use to get user stats
   */
  getUserStats() {
    if (!this.soloLevelingStats) return null;

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

    if (rankDiff > 0) {
      damage *= 1 + rankDiff * 0.3; // 30% bonus per rank above
    } else if (rankDiff < 0) {
      damage *= Math.max(0.4, 1 + rankDiff * 0.2); // 20% penalty per rank below
    }

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
   * Calculate shadow damage to enemy
   * Uses EFFECTIVE STATS (base + growth stats)
   */
  calculateShadowDamage(shadow, enemyStats, enemyRank) {
    if (!shadow) return 0;

    // Get effective stats (base + growth) from ShadowArmy plugin
    let shadowStats = {
      strength: shadow.strength || 0,
      agility: shadow.agility || 0,
      intelligence: shadow.intelligence || 0,
      vitality: shadow.vitality || 0,
      luck: shadow.luck || 0,
    };

    // If ShadowArmy plugin is available, use its method to get effective stats
    if (this.shadowArmy?.getShadowEffectiveStats) {
      const effectiveStats = this.shadowArmy.getShadowEffectiveStats(shadow);
      shadowStats = {
        strength: effectiveStats.strength || shadowStats.strength,
        agility: effectiveStats.agility || shadowStats.agility,
        intelligence: effectiveStats.intelligence || shadowStats.intelligence,
        vitality: effectiveStats.vitality || shadowStats.vitality,
        luck: effectiveStats.luck || shadowStats.luck,
      };
    } else {
      // Fallback: calculate effective stats manually
      const baseStats = shadow.baseStats || {};
      const growthStats = shadow.growthStats || {};
      shadowStats = {
        strength: (baseStats.strength || 0) + (growthStats.strength || 0),
        agility: (baseStats.agility || 0) + (growthStats.agility || 0),
        intelligence: (baseStats.intelligence || 0) + (growthStats.intelligence || 0),
        vitality: (baseStats.vitality || 0) + (growthStats.vitality || 0),
        luck: (baseStats.luck || 0) + (growthStats.luck || 0),
      };
    }

    const shadowRank = shadow.rank || 'E';

    let damage = this.calculateDamage(shadowStats, enemyStats, shadowRank, enemyRank);

    // Role bonuses
    if (shadow.role === 'Tank') damage *= 0.8;
    else if (shadow.role === 'Assassin') damage *= 1.3;
    else if (shadow.role === 'Mage') damage *= 1.2;

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
  async preSplitShadowArmy() {
    // Check cache validity (1 minute TTL)
    if (this.allocationCache && this.allocationCacheTime &&
        (Date.now() - this.allocationCacheTime < this.allocationCacheTTL)) {
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

    // Pre-allocate shadows to each dungeon
    dungeonWeights.forEach((dw) => {
      const shadowPortion = (dw.weight / totalWeight) * allShadows.length;
      const assignedCount = Math.max(1, Math.floor(shadowPortion));

      // Filter appropriate shadows (within ±2 ranks of dungeon)
      const dungeonRankIndex = this.settings.dungeonRanks.indexOf(dw.dungeon.rank);
      const shadowRanks = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'Monarch'];

      const appropriateShadows = allShadows.filter((s) => {
        const shadowRankIndex = shadowRanks.indexOf(s.rank);
        const rankDiff = Math.abs(shadowRankIndex - dungeonRankIndex);
        return rankDiff <= 2;
      });

      const shadowPool = appropriateShadows.length >= assignedCount ? appropriateShadows : allShadows;
      const assigned = shadowPool.slice(0, assignedCount);

      // Cache assignment for this dungeon
      this.shadowAllocations.set(dw.channelKey, assigned);
    });

    // Update cache
    this.allocationCache = allShadows;
    this.allocationCacheTime = Date.now();
  }

  async startShadowAttacks(channelKey) {
    if (this.shadowAttackIntervals.has(channelKey)) return;
    // Increased interval from 3s to 2s for more frequent processing (chaotic system checks more often)
    const interval = setInterval(async () => {
      await this.processShadowAttacks(channelKey);
      // Update boss HP bar after each attack wave (for real-time updates)
      this.updateBossHPBar(channelKey);
    }, 2000); // Process every 2 seconds (not all shadows attack each time due to individual cooldowns)
    this.shadowAttackIntervals.set(channelKey, interval);
  }

  stopShadowAttacks(channelKey) {
    const interval = this.shadowAttackIntervals.get(channelKey);
    if (interval) {
      clearInterval(interval);
      this.shadowAttackIntervals.delete(channelKey);
    }
  }

  stopAllShadowAttacks() {
    this.shadowAttackIntervals.forEach((interval) => clearInterval(interval));
    this.shadowAttackIntervals.clear();
  }

  startBossAttacks(channelKey) {
    if (this.bossAttackTimers.has(channelKey)) return;
    const timer = setInterval(async () => {
      await this.processBossAttacks(channelKey);
    }, 1000); // Check every second
    this.bossAttackTimers.set(channelKey, timer);
  }

  stopBossAttacks(channelKey) {
    const timer = this.bossAttackTimers.get(channelKey);
    if (timer) {
      clearInterval(timer);
      this.bossAttackTimers.delete(channelKey);
    }
  }

  stopAllBossAttacks() {
    this.bossAttackTimers.forEach((timer) => clearInterval(timer));
    this.bossAttackTimers.clear();
  }

  startMobAttacks(channelKey) {
    if (this.mobAttackTimers.has(channelKey)) return;
    const timer = setInterval(async () => {
      await this.processMobAttacks(channelKey);
    }, 1000); // Check every second
    this.mobAttackTimers.set(channelKey, timer);
  }

  stopMobAttacks(channelKey) {
    const timer = this.mobAttackTimers.get(channelKey);
    if (timer) {
      clearInterval(timer);
      this.mobAttackTimers.delete(channelKey);
    }
  }

  stopAllMobAttacks() {
    this.mobAttackTimers.forEach((timer) => clearInterval(timer));
    this.mobAttackTimers.clear();
  }

  // ============================================================================
  // COMBAT SYSTEM - Shadow Attacks (Dynamic & Chaotic)
  // ============================================================================
  async processShadowAttacks(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed) {
      this.stopShadowAttacks(channelKey);
      return;
    }

    // Stop attacking if boss is already dead (0 HP)
    if (dungeon.boss.hp <= 0 && dungeon.mobs.activeMobs.length === 0) {
      console.log('[Dungeons] Boss and mobs defeated, stopping shadow attacks');
      this.stopShadowAttacks(channelKey);
      return;
    }

    if (!this.shadowArmy) {
      console.log('[Dungeons] Shadow Army plugin not found');
      return;
    }

    try {
      // OPTIMIZATION: Use pre-split shadow allocations (cached)
      // Refresh cache if stale or missing
      if (!this.allocationCache || !this.allocationCacheTime ||
          (Date.now() - this.allocationCacheTime >= this.allocationCacheTTL)) {
        await this.preSplitShadowArmy();
      }

      // Get pre-allocated shadows for this dungeon
      const assignedShadows = this.shadowAllocations.get(channelKey);
      if (!assignedShadows || assignedShadows.length === 0) {
        // No shadows allocated to this dungeon (might be cleared or no shadows available)
        return;
      }

      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      const shadowHP = dungeon.shadowHP || {}; // Object, not Map

      // Initialize shadow combat data if not exists
      // Each shadow has individual cooldowns and behaviors for chaotic combat
      if (!dungeon.shadowCombatData) {
        dungeon.shadowCombatData = {};
      }

      for (const shadow of assignedShadows) {
        // Initialize HP OR fix corrupted HP (Promise/NaN values)
        const existingHP = shadowHP[shadow.id];
        const needsInit = !existingHP ||
                          typeof existingHP.hp !== 'number' ||
                          isNaN(existingHP.hp) ||
                          existingHP.hp instanceof Promise;

        if (needsInit && !deadShadows.has(shadow.id)) {
          // Get effective stats (base + growth) for accurate HP calculation
          let shadowVitality = shadow.vitality || shadow.strength || 50;

          // Use ShadowArmy's getShadowEffectiveStats if available
          if (this.shadowArmy?.getShadowEffectiveStats) {
            const effectiveStats = this.shadowArmy.getShadowEffectiveStats(shadow);
            shadowVitality = effectiveStats.vitality || shadowVitality;
          } else {
            // Fallback: calculate effective stats manually
            const baseStats = shadow.baseStats || {};
            const growthStats = shadow.growthStats || {};
            shadowVitality =
              (baseStats.vitality || 0) + (growthStats.vitality || 0) || shadowVitality;
          }

          const maxHP = await this.calculateHP(shadowVitality, shadow.rank || 'E');
          shadowHP[shadow.id] = { hp: maxHP, maxHp: maxHP };

          // Log fix if this was a corrupted value
          if (existingHP && existingHP.hp instanceof Promise) {
            console.log(`[Dungeons] FIXED: Shadow ${shadow.name} had Promise HP → Initialized to ${maxHP}`);
          }
        }

        // Initialize individual combat data for dynamic behavior
        if (!dungeon.shadowCombatData[shadow.id]) {
          // Assign random behavior pattern
          const behaviors = ['aggressive', 'balanced', 'tactical'];
          const behavior = behaviors[Math.floor(Math.random() * behaviors.length)];

          // Cooldowns vary by behavior (ms)
          const cooldownRanges = {
            aggressive: [800, 1500], // Fast, reckless
            balanced: [1500, 2500], // Standard
            tactical: [2000, 3500], // Slower, strategic
          };

          const [minCd, maxCd] = cooldownRanges[behavior];
          const cooldown = minCd + Math.random() * (maxCd - minCd);

          dungeon.shadowCombatData[shadow.id] = {
            lastAttackTime: Date.now() - Math.random() * cooldown, // Stagger initial attacks
            cooldown: cooldown,
            behavior: behavior,
            attackCount: 0,
            damageDealt: 0,
          };
        }
      }
      dungeon.shadowHP = shadowHP;

      // Count alive shadows for combat readiness check
      const aliveShadowCount = assignedShadows.filter(
        (s) => !deadShadows.has(s.id) && shadowHP[s.id]?.hp > 0
      ).length;

      // Log combat readiness (ONCE per critical threshold to prevent spam)
      if (aliveShadowCount < assignedShadows.length * 0.25 && !dungeon.criticalHPWarningShown) {
        dungeon.criticalHPWarningShown = true;
        console.warn(
          `[Dungeons] ⚠️ CRITICAL: Only ${aliveShadowCount}/${assignedShadows.length} shadows alive (${Math.floor(aliveShadowCount / assignedShadows.length * 100)}%)!`
        );
      }

      // Prepare target stats
        const bossStats = {
          strength: dungeon.boss.strength,
          agility: dungeon.boss.agility,
          intelligence: dungeon.boss.intelligence,
          vitality: dungeon.boss.vitality,
        };

      // Get alive mobs for dynamic targeting
      const aliveMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0);
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

      // DYNAMIC CHAOTIC COMBAT: Each shadow independently chooses target (80% mobs, 20% boss)
      for (const shadow of assignedShadows) {
          if (deadShadows.has(shadow.id)) continue;
          const shadowHPData = shadowHP[shadow.id];
          if (!shadowHPData || shadowHPData.hp <= 0) {
            deadShadows.add(shadow.id);
            continue;
          }

        const combatData = dungeon.shadowCombatData[shadow.id];
        if (!combatData) continue;

        // Check if shadow is ready to attack (individual cooldown)
        const timeSinceLastAttack = now - combatData.lastAttackTime;
        if (timeSinceLastAttack < combatData.cooldown) {
          continue; // Not ready yet, skip this shadow
        }

        // RANDOM TARGET SELECTION: 80% mobs, 20% boss (if both available)
        // Aggressive boss targeting for faster dungeon clears
        let targetType = null;
        let targetEnemy = null;

        if (bossAlive && aliveMobs.length > 0) {
          // Both available: random choice (80% mob, 20% boss)
          const targetRoll = Math.random();
          if (targetRoll < 0.80) {
            targetType = 'mob';
            targetEnemy = aliveMobs[Math.floor(Math.random() * aliveMobs.length)];
      } else {
            targetType = 'boss';
            targetEnemy = dungeon.boss;
          }
        } else if (bossAlive) {
          // Only boss available
          targetType = 'boss';
          targetEnemy = dungeon.boss;
        } else if (aliveMobs.length > 0) {
          // Only mobs available
          targetType = 'mob';
          targetEnemy = aliveMobs[Math.floor(Math.random() * aliveMobs.length)];
        } else {
          // No targets
          continue;
        }

        // Calculate damage based on target
        let shadowDamage;
        if (targetType === 'boss') {
          shadowDamage = this.calculateShadowDamage(shadow, bossStats, dungeon.boss.rank);
        } else {
          const mobStats = {
            strength: targetEnemy.strength,
            agility: targetEnemy.agility,
            intelligence: targetEnemy.intelligence,
            vitality: targetEnemy.vitality,
          };
          shadowDamage = this.calculateShadowDamage(shadow, mobStats, targetEnemy.rank);
        }

        // Add damage variance (±20%) for chaos
        const variance = 0.8 + Math.random() * 0.4; // 80% to 120%
        shadowDamage = Math.floor(shadowDamage * variance);

        // Behavior modifiers
        const behaviorMultipliers = {
          aggressive: 1.3,
          balanced: 1.0,
          tactical: 0.85,
        };
        shadowDamage = Math.floor(shadowDamage * behaviorMultipliers[combatData.behavior]);

        // Apply damage to target
        if (targetType === 'boss') {
          await this.applyDamageToBoss(channelKey, shadowDamage, 'shadow', shadow.id);
          analytics.totalBossDamage += shadowDamage;
          analytics.shadowsAttackedBoss++;
        } else {
          targetEnemy.hp = Math.max(0, targetEnemy.hp - shadowDamage);
          analytics.totalMobDamage += shadowDamage;
          analytics.shadowsAttackedMobs++;

          // Track contribution if mob killed
          if (targetEnemy.hp <= 0) {
            analytics.mobsKilledThisWave++;
            dungeon.mobs.killed += 1;
            dungeon.mobs.remaining = Math.max(0, dungeon.mobs.remaining - 1);

            if (!dungeon.shadowContributions[shadow.id]) {
              dungeon.shadowContributions[shadow.id] = { mobsKilled: 0, bossDamage: 0 };
            }
            dungeon.shadowContributions[shadow.id].mobsKilled += 1;

            if (!this.settings.mobKillNotifications[channelKey]) {
              this.settings.mobKillNotifications[channelKey] = {
                count: 0,
                lastNotification: Date.now(),
              };
            }
            this.settings.mobKillNotifications[channelKey].count += 1;

            // Grant user XP from mob kills (even if not participating - shadows cleared it!)
            if (this.soloLevelingStats) {
              const mobRankIndex = this.settings.dungeonRanks.indexOf(targetEnemy.rank);
              const baseMobXP = 10 + mobRankIndex * 5;

              // Reduced XP if not participating (30% XP)
              const mobXP = dungeon.userParticipating ? baseMobXP : Math.floor(baseMobXP * 0.3);

              if (typeof this.soloLevelingStats.addXP === 'function') {
                this.soloLevelingStats.addXP(mobXP);
              }
            }

            // EXTRACTION CHANCE: Attempt shadow extraction from dead mob
            // Only if user is actively participating in this dungeon
            if (dungeon.userParticipating && this.shadowArmy?.attemptDungeonExtraction) {
              this.attemptMobExtraction(channelKey, targetEnemy).catch(console.error);
            }
          }
        }

        // Update combat data
        combatData.attackCount++;
        combatData.damageDealt += shadowDamage;
        combatData.lastAttackTime = now;

        // Vary cooldown for next attack
        const cooldownVariance = 0.9 + Math.random() * 0.2;
        combatData.cooldown = combatData.cooldown * cooldownVariance;

        dungeon.shadowAttacks[shadow.id] = now;
      }

      // Remove dead mobs from activeMobs array
      dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0);

      // Attack logs removed - check dungeon completion summary for stats

      // Process boss attacks on shadows
      await this.processBossAttacks(channelKey);

      // Process mob attacks on shadows
      await this.processMobAttacks(channelKey);

      this.deadShadows.set(channelKey, deadShadows);
    } catch (error) {
      console.error('Dungeons: Error processing shadow attacks', error);
    }
  }

  async getAllShadows() {
    if (!this.shadowArmy) return [];
    try {
      if (this.shadowArmy.storageManager) {
        return (await this.shadowArmy.storageManager.getShadows({}, 0, 10000)) || [];
      }
      if (this.shadowArmy.settings?.shadows) {
        return this.shadowArmy.settings.shadows || [];
      }
      return [];
    } catch (error) {
      console.error('Dungeons: Error getting all shadows', error);
      return [];
    }
  }

  /**
   * Get baseline stats for a given rank (exponential scaling)
   * Used for shadow rank-up calculations
   */
  getBaselineStats(rank) {
    return this.baselineStats[rank] || this.baselineStats['E'];
  }


  // ============================================================================
  // BOSS & MOB ATTACKS
  // ============================================================================
  async processBossAttacks(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.boss.hp <= 0 || dungeon.completed || dungeon.failed) {
      this.stopBossAttacks(channelKey);
      return;
    }

    const now = Date.now();
    if (now - dungeon.boss.lastAttackTime < dungeon.boss.attackCooldown) return;

    // Regenerate HP and Mana based on stats (runs every second)
    this.regenerateHPAndMana();

    dungeon.boss.lastAttackTime = now;
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
    const aliveShadows = allShadows.filter((s) => !deadShadows.has(s.id) && shadowHP[s.id]?.hp > 0);

    // PRIORITY SYSTEM: Boss attacks shadows FIRST, only attacks user if ALL shadows are dead
    if (aliveShadows.length > 0) {
      // Boss AOE Attack: Attack multiple shadows based on boss rank
      // Higher rank bosses = more targets per attack (powerful AOE)
      const rankMultipliers = {
        E: 1, // 1 shadow
        D: 2, // 2 shadows
        C: 3, // 3 shadows
        B: 5, // 5 shadows
        A: 8, // 8 shadows
        S: 12, // 12 shadows
      };

      const maxTargets = rankMultipliers[dungeon.boss.rank] || 1;
      const actualTargets = Math.min(maxTargets, aliveShadows.length);

      // Shuffle and pick random targets for AOE attack
      const shuffled = [...aliveShadows].sort(() => Math.random() - 0.5);
      const targets = shuffled.slice(0, actualTargets);

      let shadowsKilled = 0;
      let totalDamageToShadows = 0;

      for (const targetShadow of targets) {
        const shadowHPData = shadowHP[targetShadow.id];
        if (!shadowHPData) continue;

      const shadowStats = {
          strength: targetShadow.strength || 0,
          agility: targetShadow.agility || 0,
          intelligence: targetShadow.intelligence || 0,
          vitality: targetShadow.vitality || targetShadow.strength || 50,
        };
        const shadowRank = targetShadow.rank || 'E';

        let bossDamage = this.calculateEnemyDamage(
        bossStats,
        shadowStats,
        dungeon.boss.rank,
        shadowRank
      );

        // Add damage variance (±25%) for chaotic combat
        const variance = 0.75 + Math.random() * 0.5; // 75% to 125%
        bossDamage = Math.floor(bossDamage * variance);

        totalDamageToShadows += bossDamage;
      shadowHPData.hp = Math.max(0, shadowHPData.hp - bossDamage);
        shadowHP[targetShadow.id] = shadowHPData;

      if (shadowHPData.hp <= 0) {
          // Shadow died - attempt automatic resurrection
          const resurrected = await this.attemptAutoResurrection(targetShadow, channelKey);
          if (resurrected) {
            // Resurrection successful - restore HP
            shadowHPData.hp = shadowHPData.maxHp;
            // eslint-disable-next-line require-atomic-updates
            shadowHP[targetShadow.id] = shadowHPData;
          } else {
            // Resurrection failed (not enough mana or priority)
            deadShadows.add(targetShadow.id);
            shadowsKilled++;
          }
        }
      }

      // Log boss attack results
      const remainingAlive = aliveShadows.length - shadowsKilled;

      // Only log AOE if shadows were killed or massive damage
      if (actualTargets > 1 && (shadowsKilled > 0 || totalDamageToShadows > 5000)) {
        console.log(
          `[Dungeons] Boss AOE attacked ${actualTargets} shadows${shadowsKilled > 0 ? `, killed ${shadowsKilled}!` : ` for ${Math.floor(totalDamageToShadows)} damage`}`
        );
      }

      if (shadowsKilled > 0) {
        console.log(
          `[Dungeons] Boss killed ${shadowsKilled} shadow(s)! ${remainingAlive} shadows remaining`
        );

        // Only show toast for critical situations
        if (remainingAlive === 0) {
          this.showToast(`ALL shadows defeated! You're next!`, 'error');
        } else if (remainingAlive <= 5) {
          this.showToast(`Only ${remainingAlive} shadows left!`, 'error');
        }
        // Remove toast for routine kills (5+ shadows) - reduces spam
      }
    } else if (dungeon.userParticipating) {
      // ALL shadows are dead, now attack user (with reduced damage)
      const userStats = this.getUserStats()?.stats || this.soloLevelingStats?.settings?.stats || {};
      const userRank = this.soloLevelingStats?.settings?.rank || 'E';

      // Calculate boss damage to user (50% reduced when no shadows)
      const rawBossDamage = this.calculateEnemyDamage(
        bossStats,
        userStats,
        dungeon.boss.rank,
        userRank
      );

      // Reduce damage by 50% (shadow army absorbed most of the impact)
      const bossDamage = Math.floor(rawBossDamage * 0.5);

      this.settings.userHP = Math.max(0, this.settings.userHP - bossDamage);
      this.updateUserHPBar();
      this.showToast(
        `Boss attacked you for ${bossDamage} damage! (No shadows to protect you)`,
        'error'
      );

      if (this.settings.userHP <= 0) {
        await this.handleUserDefeat(channelKey);
      }
    }

    dungeon.shadowHP = shadowHP;
    this.deadShadows.set(channelKey, deadShadows);
    this.saveSettings();
  }

  async processMobAttacks(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.mobs.activeMobs.length === 0 || dungeon.completed || dungeon.failed) {
      this.stopMobAttacks(channelKey);
      return;
    }

    // Regenerate HP and Mana based on stats (runs every second)
    this.regenerateHPAndMana();

    const now = Date.now();
    const allShadows = await this.getAllShadows();
    const shadowHP = dungeon.shadowHP || {}; // Object, not Map
    const deadShadows = this.deadShadows.get(channelKey) || new Set();

    // Check if any shadows are alive
    const aliveShadows = allShadows.filter((s) => !deadShadows.has(s.id) && shadowHP[s.id]?.hp > 0);

    // PRIORITY SYSTEM: Mobs attack shadows FIRST, only attack user if ALL shadows are dead
    for (const mob of dungeon.mobs.activeMobs) {
      if (mob.hp <= 0) continue;
      if (now - mob.lastAttackTime < mob.attackCooldown) continue;

      mob.lastAttackTime = now;
      const mobStats = {
        strength: mob.strength,
        agility: mob.agility,
        intelligence: mob.intelligence,
        vitality: mob.vitality,
      };

      if (aliveShadows.length > 0) {
        // Attack shadows (pick random target)
      const targetShadow = aliveShadows[Math.floor(Math.random() * aliveShadows.length)];
      const shadowHPData = shadowHP[targetShadow.id];
      if (!shadowHPData) continue;

      const shadowStats = {
        strength: targetShadow.strength || 0,
        agility: targetShadow.agility || 0,
        intelligence: targetShadow.intelligence || 0,
        vitality: targetShadow.vitality || targetShadow.strength || 50,
      };

        let mobDamage = this.calculateEnemyDamage(
        mobStats,
        shadowStats,
        mob.rank,
        targetShadow.rank || 'E'
      );

        // Add damage variance (±20%) for chaotic combat
        const variance = 0.8 + Math.random() * 0.4; // 80% to 120%
        mobDamage = Math.floor(mobDamage * variance);

      shadowHPData.hp = Math.max(0, shadowHPData.hp - mobDamage);
      shadowHP[targetShadow.id] = shadowHPData;

      if (shadowHPData.hp <= 0) {
          // Shadow died - attempt automatic resurrection
          const resurrected = await this.attemptAutoResurrection(targetShadow, channelKey);
          if (resurrected) {
            // Resurrection successful - restore HP
            shadowHPData.hp = shadowHPData.maxHp;
            // eslint-disable-next-line require-atomic-updates
            shadowHP[targetShadow.id] = shadowHPData;
          } else {
            // Resurrection failed (not enough mana or priority)
        deadShadows.add(targetShadow.id);
            // Remove from alive shadows array for next mob
            const index = aliveShadows.indexOf(targetShadow);
            if (index > -1) aliveShadows.splice(index, 1);

            // Removed spam log: Mob killed shadow (happens too frequently)
          }
        }
      } else if (dungeon.userParticipating) {
        // ALL shadows are dead, now attack user (with reduced damage)
        const userStats =
          this.getUserStats()?.stats || this.soloLevelingStats?.settings?.stats || {};
      const userRank = this.soloLevelingStats?.settings?.rank || 'E';

        // Calculate mob damage to user (60% reduced when no shadows)
        const rawMobDamage = this.calculateEnemyDamage(mobStats, userStats, mob.rank, userRank);

        // Reduce damage by 60% (mobs are weaker than bosses)
        const mobDamage = Math.floor(rawMobDamage * 0.4);

        this.settings.userHP = Math.max(0, this.settings.userHP - mobDamage);
        this.updateUserHPBar();

        if (this.settings.userHP <= 0) {
          await this.handleUserDefeat(channelKey);
          break; // Stop processing if user defeated
        }
      }
    }

    dungeon.shadowHP = shadowHP;
    this.deadShadows.set(channelKey, deadShadows);
    this.saveSettings();
  }

  async attackMobs(channelKey, source) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.mobs.activeMobs.length === 0) return;

    if (source === 'user') {
      // User attacks mobs
      for (const mob of dungeon.mobs.activeMobs) {
        if (mob.hp <= 0) continue;

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
            const mobRankIndex = this.settings.dungeonRanks.indexOf(mob.rank);
            const mobXP = 10 + mobRankIndex * 5; // E: 10, D: 15, C: 20, B: 25, A: 30, S: 35

            if (typeof this.soloLevelingStats.addXP === 'function') {
              this.soloLevelingStats.addXP(mobXP);
              console.log(`[Dungeons] +${mobXP} XP from ${mob.rank} mob kill`);
            }
          }

          // EXTRACTION CHANCE: Attempt shadow extraction from dead mob
          // Only if user is actively participating (works even if dungeon completed/failed)
          if (dungeon.userParticipating) {
            this.attemptMobExtraction(channelKey, mob).catch(console.error);
          }
        }
      }

      // Remove dead mobs
      dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0);
    } else if (source === 'shadows') {
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

      for (const shadow of allShadows) {
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

            // Track shadow contribution for XP
            if (!dungeon.shadowContributions[shadow.id]) {
              dungeon.shadowContributions[shadow.id] = { mobsKilled: 0, bossDamage: 0 };
            }
            dungeon.shadowContributions[shadow.id].mobsKilled += 1;

            if (!this.settings.mobKillNotifications[channelKey]) {
              this.settings.mobKillNotifications[channelKey] = {
                count: 0,
                lastNotification: Date.now(),
              };
            }
            this.settings.mobKillNotifications[channelKey].count += 1;

          // Grant XP to user from mob kill (if participating)
          if (dungeon.userParticipating && this.soloLevelingStats) {
            const mobRankIndex = this.settings.dungeonRanks.indexOf(targetMob.rank);
            const mobXP = 10 + mobRankIndex * 5; // E: 10, D: 15, C: 20, B: 25, A: 30, S: 35

            if (typeof this.soloLevelingStats.addXP === 'function') {
              this.soloLevelingStats.addXP(mobXP);
            }
          }

          // EXTRACTION CHANCE: Attempt shadow extraction from dead mob
          // Only if user is actively participating (works even if dungeon completed/failed)
          if (dungeon.userParticipating) {
            this.attemptMobExtraction(channelKey, targetMob).catch(console.error);
          }
          }
      }

      // Log shadow attack summary on mobs (only when shadows actually attacked)
      if (shadowsAttacked > 0) {
        const aliveMobCount = dungeon.mobs.activeMobs.filter((m) => m.hp > 0).length;

        if (totalMobsKilled > 0) {
          console.log(
            `[Dungeons] ${shadowsAttacked} shadows attacked (chaotic timing), dealt ${Math.floor(
              totalDamageToMobs
            )} damage, killed ${totalMobsKilled} mobs! ${aliveMobCount} mobs remaining`
          );
        } else {
          console.log(
            `[Dungeons] ${shadowsAttacked} shadows attacked (chaotic timing), dealt ${Math.floor(
              totalDamageToMobs
            )} damage to mobs`
          );
        }
      }

      // Remove dead mobs
      dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0);
    }

    // Update storage
    if (this.storageManager) {
      this.storageManager.saveDungeon(dungeon).catch(console.error);
    }
    this.saveSettings();
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
        const critText = dungeon.userCriticalHits > 0 ? ` (${dungeon.userCriticalHits} crits!)` : '';
        console.log(
          `[Dungeons] 💥 User dealt ${dungeon.userDamageDealt.toLocaleString()} total damage in ${dungeon.userAttackCount} attacks${critText}`
        );
      }
    }

    this.updateBossHPBar(channelKey);

    if (dungeon.boss.hp <= 0) {
      await this.completeDungeon(channelKey, 'boss');
    }

    // Update storage
    if (this.storageManager) {
      this.storageManager.saveDungeon(dungeon).catch(console.error);
    }
    this.saveSettings();
  }

  // ============================================================================
  // MOB EXTRACTION SYSTEM
  // ============================================================================
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
      // Call ShadowArmy's attemptDungeonExtraction
      const result = await this.shadowArmy.attemptDungeonExtraction(
        mobId,
        userRank,
        userLevel,
        userStats,
        mobRank,
        mobStats,
        mobStrength,
        dungeon.beastFamilies // Pass biome families for themed extraction
      );

      if (result.success && result.shadow) {
        // SUCCESS! Shadow extracted from mob
        if (!dungeon.mobExtractions) dungeon.mobExtractions = 0;
        dungeon.mobExtractions++;

        // Show ARISE animation for mob extraction
        const mobData = { name: mobName, rank: mobRank };
        this.showAriseSuccessAnimation(result.shadow, mobData);

        // Log major extraction milestones only (reduced spam)
        if (dungeon.mobExtractions % 50 === 0 ||
            dungeon.mobExtractions === 25 ||
            dungeon.mobExtractions === 100 ||
            dungeon.mobExtractions === 250 ||
            dungeon.mobExtractions === 500) {
          console.log(
            `[Dungeons] 🌟 ${dungeon.mobExtractions} shadows extracted from mobs!`
          );
        }

        // Recalculate mana pool after new shadow extracted
        await this.recalculateUserMana();
      }
    } catch (error) {
      console.error('[Dungeons] Mob extraction error:', error);
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
      E: 6,        // Was 10 (-40%)
      D: 12,       // Was 20 (-40%)
      C: 24,       // Was 40 (-40%)
      B: 48,       // Was 80 (-40%)
      A: 96,       // Was 160 (-40%)
      S: 192,      // Was 320 (-40%)
      SS: 384,     // Was 640 (-40%)
      SSS: 768,    // Was 1280 (-40%)
      'SSS+': 1536,   // Was 2560 (-40%)
      NH: 3072,    // Was 5120 (-40%)
      Monarch: 6144,      // Was 10240 (-40%)
      'Monarch+': 12288,  // Was 20480 (-40%)
      'Shadow Monarch': 24576,  // Was 40960 (-40%)
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
      console.error(`[Dungeons] Invalid resurrection cost for rank ${shadowRank}: ${manaCost}`);
      return false;
    }

    // CRITICAL: SYNC MANA FROM SoloLevelingStats FIRST (get freshest value!)
    // Regeneration updates SoloLevelingStats, so read from there first
    if (this.soloLevelingStats?.settings) {
      if (typeof this.soloLevelingStats.settings.userMana === 'number' &&
          !isNaN(this.soloLevelingStats.settings.userMana)) {
        this.settings.userMana = this.soloLevelingStats.settings.userMana;
        this.settings.userMaxMana = this.soloLevelingStats.settings.userMaxMana;
      }
    }

    // Validate current mana is a valid number
    if (typeof this.settings.userMana !== 'number' || isNaN(this.settings.userMana)) {
      console.error(`[Dungeons] Invalid userMana value: ${this.settings.userMana}`);
      this.settings.userMana = this.settings.userMaxMana || 0;
    }

    // AGGRESSIVE: Check if user has enough mana (using FRESHEST value)
    if (this.settings.userMana < manaCost) {
      // Track failed attempts for this dungeon
      const dungeon = this.activeDungeons.get(channelKey);
      if (dungeon) {
        if (!dungeon.failedResurrections) dungeon.failedResurrections = 0;
        dungeon.failedResurrections++;

        // Show warning toast every 50 failed resurrections (not just once)
        if (dungeon.failedResurrections % 50 === 1) {
          const percent = Math.floor((this.settings.userMana / this.settings.userMaxMana) * 100);
          console.warn(
            `[Dungeons] ⚠️ LOW MANA: ${dungeon.failedResurrections} resurrection failures. Mana: ${this.settings.userMana}/${this.settings.userMaxMana} (${percent}%)`
          );
      this.showToast(
            `Low mana! ${dungeon.failedResurrections} shadows couldn't be resurrected.\nMana: ${this.settings.userMana}/${this.settings.userMaxMana} (${percent}%)`,
        'error'
      );
        }
      }

      return false;
    }

    // Store mana before consumption for verification
    const manaBefore = this.settings.userMana;

    // Consume mana from local settings
    this.settings.userMana -= manaCost;

    // Ensure mana doesn't go negative (safety check)
    if (this.settings.userMana < 0) {
      console.error(`[Dungeons] CRITICAL: Mana went negative! Resetting to 0. Before: ${manaBefore}, Cost: ${manaCost}`);
      this.settings.userMana = 0;
    }

    // Verify mana was actually deducted
    const manaAfter = this.settings.userMana;
    const actualDeduction = manaBefore - manaAfter;
    if (actualDeduction !== manaCost) {
      console.warn(`[Dungeons] Mana deduction mismatch! Expected: ${manaCost}, Actual: ${actualDeduction}`);
    }

    // CRITICAL: Sync mana with SoloLevelingStats plugin (for UI display)
    if (this.soloLevelingStats?.settings) {
      this.soloLevelingStats.settings.userMana = this.settings.userMana;
      this.soloLevelingStats.settings.userMaxMana = this.settings.userMaxMana;

      // Trigger REAL-TIME UI update (verified function name)
      if (typeof this.soloLevelingStats.updateHPManaBars === 'function') {
        this.soloLevelingStats.updateHPManaBars();
      } else if (typeof this.soloLevelingStats.updateUI === 'function') {
        this.soloLevelingStats.updateUI();
      }
    }

    // Track resurrection
    const dungeon = this.activeDungeons.get(channelKey);
    if (dungeon) {
      dungeon.shadowRevives = (dungeon.shadowRevives || 0) + 1;

      // Track successful resurrections
      if (!dungeon.successfulResurrections) dungeon.successfulResurrections = 0;
      dungeon.successfulResurrections++;

      // Log major resurrection milestones only (reduced spam)
      if (dungeon.successfulResurrections % 100 === 0 ||
          dungeon.successfulResurrections === 50 ||
          dungeon.successfulResurrections === 200 ||
          dungeon.successfulResurrections === 500) {
        const percent = Math.floor((manaAfter / this.settings.userMaxMana) * 100);
        console.log(
          `[Dungeons] ✅ ${dungeon.successfulResurrections} shadows resurrected. Mana: ${manaAfter}/${this.settings.userMaxMana} (${percent}%)`
        );
      }
    }

    // Save settings to persist mana change
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

    this.stopShadowAttacks(channelKey);
    this.stopBossAttacks(channelKey);
    this.stopMobAttacks(channelKey);
    this.stopMobKillNotifications(channelKey);
    this.stopMobSpawning(channelKey);
    this.removeDungeonIndicator(channelKey);
    this.removeBossHPBar(channelKey);

    if (this.settings.userActiveDungeon === channelKey) {
      this.settings.userActiveDungeon = null;
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
    } else if (reason === 'boss') {
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

        console.log(`[Dungeons] ARISE available for ${dungeon.boss.name} (user is participating)`);
      } else {
        // User didn't participate, no extraction chance
        console.log(`[Dungeons] Boss defeated but user not participating - no ARISE chance`);
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
      // Boss defeated and user participated: keep for ARISE button (3 attempts)
      console.log(
        `[Dungeons] Boss defeated, keeping dungeon ${channelKey} for ARISE (will cleanup in 5 minutes or after extraction)`
      );
    } else {
      // Immediate cleanup for:
      // - Non-boss completions
      // - Timeouts
      // - Boss defeats where user didn't participate (no ARISE chance)
      if (reason === 'boss' && !dungeon.userParticipating) {
        console.log(
          `[Dungeons] Boss defeated but user not participating - cleaning up immediately (no ARISE chance)`
        );
      }

      // COMPREHENSIVE DATABASE CLEANUP
      // Delete dungeon and all associated mob data from IndexedDB
      if (this.storageManager) {
        try {
          // Delete dungeon (includes all mob data)
          await this.storageManager.deleteDungeon(channelKey);

          // Clear completed dungeons log
          await this.storageManager.clearCompletedDungeons();

          console.log(`[Dungeons] Database cleanup complete for ${channelKey}: dungeon and ${dungeon.mobs.total} mobs removed`);
        } catch (error) {
          console.error('Dungeons: Failed to delete dungeon from storage', error);
        }
      }

      // Memory cleanup
      this.activeDungeons.delete(channelKey);
      delete this.settings.mobKillNotifications[channelKey];
      this.deadShadows.delete(channelKey);

      // Clear mob references (help garbage collector)
      if (dungeon.mobs?.activeMobs) {
        dungeon.mobs.activeMobs.length = 0; // Clear array
        dungeon.mobs.activeMobs = null;
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
    // SINGLE ESSENTIAL NOTIFICATION: Status + Key Stats Only
    const lines = [];
    const status = stats.userParticipated ? 'CLEARED!' : 'SHADOWS CLEARED';
    lines.push(`${stats.dungeonName} [${stats.dungeonRank}] ${status}`);

    // Essential combat stats
    if (stats.totalMobsKilled > 0) {
      lines.push(`Killed: ${stats.totalMobsKilled.toLocaleString()} mobs`);
    }

    if (stats.mobExtractions > 0) {
      lines.push(`Extracted: ${stats.mobExtractions} shadows`);
    }

    // Total gains (simple)
    if (stats.userXP > 0 || stats.shadowTotalXP > 0) {
      const gains = [];
      if (stats.userXP > 0) gains.push(`You: +${stats.userXP} XP`);
      if (stats.shadowTotalXP > 0) gains.push(`Shadows: +${stats.shadowTotalXP.toLocaleString()} XP`);
      lines.push(gains.join(' | '));
    }

    // Show single toast with essential info
    this.showToast(lines.join('\n'), 'success');

    // BATCH 2.5: Damage Analytics (NEW!)
    if (stats.totalBossDamage > 0 || stats.totalMobDamage > 0) {
      setTimeout(() => {
        const batch25Lines = [];
        batch25Lines.push(`Damage Analytics`);

        if (stats.totalBossDamage > 0) {
          batch25Lines.push(`Boss Damage: ${stats.totalBossDamage.toLocaleString()}`);
        }

        if (stats.totalMobDamage > 0) {
          batch25Lines.push(`Mob Damage: ${stats.totalMobDamage.toLocaleString()}`);
        }

        const totalDamage = stats.totalBossDamage + stats.totalMobDamage;
        if (totalDamage > 0) {
          batch25Lines.push(`Total Damage: ${totalDamage.toLocaleString()}`);
        }

        if (batch25Lines.length > 1) {
          this.showToast(batch25Lines.join('\n'), 'info');
        }
      }, 750);
    }

    // BATCH 3: Shadow Level-Ups
    if (stats.shadowsLeveledUp && stats.shadowsLeveledUp.length > 0) {
      setTimeout(() => {
        const batch3Lines = [];
        batch3Lines.push(`Level-Ups (${stats.shadowsLeveledUp.length} shadows)`);

        if (stats.shadowsLeveledUp.length <= 5) {
          // Show all if 5 or fewer
          stats.shadowsLeveledUp.forEach(({ name, rank, levelBefore, levelAfter }) => {
            batch3Lines.push(`  ${name} [${rank}]: Lv ${levelBefore} -> ${levelAfter}`);
          });
        } else {
          // Show top 3 for many level-ups
          const topLevelUps = stats.shadowsLeveledUp.slice(0, 3);
          topLevelUps.forEach(({ name, rank, levelBefore, levelAfter }) => {
            batch3Lines.push(`  ${name} [${rank}]: Lv ${levelBefore} -> ${levelAfter}`);
          });
          batch3Lines.push(`  ...and ${stats.shadowsLeveledUp.length - 3} more!`);
        }

        this.showToast(batch3Lines.join('\n'), 'info');
      }, 1000);
    }

    // Rank-ups happen automatically (logged individually during XP grant)
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
    const beastFamilies = bossData.dungeon.beastFamilies || null;

    // Show extraction attempt message
    this.showToast(`Attempting shadow extraction from ${bossData.boss.name}...`, 'info');

    try {
      // Call ShadowArmy's attemptDungeonExtraction with complete mob data
      // The mob's stats will be transferred directly to shadow.baseStats
      const result = await this.shadowArmy.attemptDungeonExtraction(
        bossId,
        userRank,
        userLevel,
        userStats,
        mobRank,
        mobStats,
        mobStrength,
        bossData.dungeon.beastFamilies // Pass biome families for themed extraction
      );

      if (result.success && result.shadow) {
        // SUCCESS! Show big ARISE animation
        this.showAriseSuccessAnimation(result.shadow, bossData.boss);
        this.showToast(
          `ARISE! Shadow "${result.shadow.name}" extracted! (${result.attemptsRemaining} attempts remaining)`,
          'success'
        );

        // Recalculate mana pool after new shadow extracted
        await this.recalculateUserMana();
      } else if (result.error) {
        // Max attempts reached or other error
        this.showAriseFailAnimation(bossData.boss, result.error);
        this.showToast(`${result.error}`, 'error');
      } else {
        // Extraction failed (bad RNG)
        this.showAriseFailAnimation(bossData.boss, 'Extraction failed');
        this.showToast(
          `Extraction failed. (${result.attemptsRemaining} attempts remaining)`,
          'error'
        );
      }

      // If no attempts remaining or success, cleanup the arise button
      if (result.attemptsRemaining === 0) {
        // All attempts used - cleanup arise button
        setTimeout(() => this.cleanupDefeatedBoss(channelKey), 3000);
      } else if (result.success) {
        // Extraction succeeded - cleanup arise button immediately
        setTimeout(() => this.cleanupDefeatedBoss(channelKey), 3000);
      }
      // If failed but has attempts remaining, keep arise button visible
    } catch (error) {
      console.error('Dungeons: Failed to extract shadow', error);
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

    overlay.innerHTML = `
      <div style="text-align: center; animation: arise-rise 1s ease-out;">
        <div style="font-size: 80px; margin-bottom: 20px; animation: arise-glow 1.5s ease-in-out infinite; font-weight: bold;">↑</div>
        <div style="font-size: 48px; font-weight: bold; color: #a78bfa; margin-bottom: 12px; text-shadow: 0 0 20px #8b5cf6;">
          ARISE
        </div>
        <div style="font-size: 32px; color: white; margin-bottom: 8px;">
          ${shadow.name}
        </div>
        <div style="font-size: 20px; color: #a78bfa; margin-bottom: 4px;">
          ${shadow.rank} Rank ${shadow.role}
        </div>
        <div style="font-size: 16px; color: #888;">
          Extracted from ${enemy.name} [${enemy.rank}]
        </div>
      </div>
    `;

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

    overlay.innerHTML = `
      <div style="text-align: center; animation: arise-shake 0.5s ease;">
        <div style="font-size: 80px; margin-bottom: 20px; filter: grayscale(100%); font-weight: bold;">✕</div>
        <div style="font-size: 48px; font-weight: bold; color: #ef4444; margin-bottom: 12px; text-shadow: 0 0 20px #dc2626;">
          EXTRACTION FAILED
        </div>
        <div style="font-size: 24px; color: white; margin-bottom: 8px;">
          ${boss.name}
        </div>
        <div style="font-size: 16px; color: #888;">
          ${reason}
        </div>
      </div>
    `;

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
      console.log('[Dungeons] ARISE button removed');
    }

    // Delete from IndexedDB
    if (this.storageManager) {
      try {
        await this.storageManager.deleteDungeon(channelKey);
        await this.storageManager.clearCompletedDungeons();
      } catch (error) {
        console.error('Dungeons: Failed to delete dungeon from storage', error);
      }
    }

    // Clean up dungeon data (this does NOT affect ShadowArmy extraction attempts)
    // ShadowArmy tracks extraction attempts separately by bossId in its own plugin
    this.activeDungeons.delete(channelKey);
    this.defeatedBosses.delete(channelKey);
    delete this.settings.mobKillNotifications[channelKey];
    this.deadShadows.delete(channelKey);
    this.saveSettings();

    console.log(
      '[Dungeons] Dungeon cleanup complete - ARISE attempts preserved in ShadowArmy plugin'
    );
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

    for (const [shadowId, contribution] of Object.entries(contributions)) {
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
          console.log(
            `[Dungeons] AUTO RANK-UP: Shadow ${shadow.name} promoted ${rankBefore} -> ${rankAfter}!`
          );
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
  // BOSS HP BAR (IN CHANNEL HEADER)
  // ============================================================================
  updateBossHPBar(channelKey) {
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

    // Calculate mob stats
    const aliveMobs = dungeon.mobs.activeMobs?.filter((m) => m.hp > 0).length || 0;
    const totalMobs = dungeon.mobs.targetCount || 0;
    const killedMobs = dungeon.mobs.killed || 0;

    // Participation indicator
    const participationBadge = dungeon.userParticipating
      ? '<span style="color: #10b981; font-weight: 700;">FIGHTING</span>'
      : '<span style="color: #8b5cf6; font-weight: 700;">WATCHING</span>';

    // JOIN button (only show if NOT participating)
    const joinButtonHTML = !dungeon.userParticipating ? `
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
    ` : '';

    // LEAVE button (only show if IS participating)
    const leaveButtonHTML = dungeon.userParticipating ? `
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
    ` : '';

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
              dungeon.boss.hp
            ).toLocaleString()}</span>
            <span style="color: #64748b;">/</span>
            <span style="color: #fbbf24;">${dungeon.boss.maxHp.toLocaleString()}</span>
          </div>
          <div>
            <span style="color: #94a3b8;">Mobs:</span>
            <span style="color: #34d399; font-weight: 700;">${aliveMobs.toLocaleString()}</span>
            <span style="color: #64748b;">/</span>
            <span style="color: #94a3b8;">${totalMobs.toLocaleString()}</span>
            <span style="color: #64748b; font-size: 10px;">(${killedMobs.toLocaleString()} killed)</span>
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

        // Check if already in another dungeon
        if (this.settings.userActiveDungeon && this.settings.userActiveDungeon !== channelKey) {
          const activeDungeon = this.activeDungeons.get(this.settings.userActiveDungeon);
          this.showToast(
            `Already in ${activeDungeon?.name || 'another dungeon'}!\nComplete it first.`,
            'error'
          );
          return;
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
   * Find channel header using robust selectors
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

  createDungeonButton() {
    // DISABLED: Dungeon UI button removed from chat toolbar
    // Use channel indicators (fortress icon) and boss HP bar (JOIN/LEAVE) instead
    return;
    // Re-entrance guard: prevent infinite loops during button creation
    if (this._creatingDungeonButton) {
      return;
    }
    this._creatingDungeonButton = true;

    try {
      // Remove existing button first to avoid duplicates
      const existingDungeonBtn = document.querySelector('.dungeons-plugin-button');
      if (existingDungeonBtn) existingDungeonBtn.remove();
      this.dungeonButton = null;

      const toolbar = this.findToolbar();
      if (!toolbar) {
        // Retry with exponential backoff
        const retryCount = (this._dungeonButtonRetryCount || 0) + 1;
        this._dungeonButtonRetryCount = retryCount;
        const delay = Math.min(1000 * retryCount, 5000);
        setTimeout(() => {
          this._creatingDungeonButton = false;
          this.createDungeonButton();
        }, delay);
        return;
      }
      this._dungeonButtonRetryCount = 0;

      // Create Dungeons button with proper SVG (dungeon entrance/castle gate icon)
      const button = document.createElement('button');
      button.className = 'dungeons-plugin-button';
      button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 6h16M4 6v12M20 6v12M8 6v12M16 6v12"></path>
        <path d="M6 10h4M14 10h4"></path>
        <path d="M12 2v4"></path>
        <circle cx="10" cy="14" r="1" fill="currentColor"></circle>
        <circle cx="14" cy="14" r="1" fill="currentColor"></circle>
      </svg>
    `;
      button.title = 'Dungeons';
      button.setAttribute('aria-label', 'Dungeons');
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // Modal removed - use dungeon indicators to join dungeons
        const activeCount = this.activeDungeons.size;
        if (activeCount === 0) {
          this.showToast('No active dungeons.\nDungeons spawn randomly as you chat (10% chance per message).', 'info');
        } else {
          this.showToast(`${activeCount} active dungeon(s).\nCheck channels with 🏰 icon and click to JOIN.`, 'info');
        }
      });

      const skillTreeBtn = toolbar.querySelector('.st-skill-tree-button');
      const titleBtn = toolbar.querySelector('.tm-title-button');
      const shadowArmyBtn = toolbar.querySelector('.shadow-army-button');
      const appsButton = Array.from(toolbar.children).find(
        (el) =>
          el.querySelector('[class*="apps"]') ||
          el.getAttribute('aria-label')?.toLowerCase().includes('app')
      );

      // Insert Dungeons button after ShadowArmy button (if exists), or after Skill Tree
      let inserted = false;

      if (shadowArmyBtn && shadowArmyBtn.parentElement === toolbar) {
        // Insert after ShadowArmy button
        toolbar.insertBefore(button, shadowArmyBtn.nextSibling);
        inserted = true;
      } else if (skillTreeBtn && skillTreeBtn.parentElement === toolbar) {
        // Insert after Skill Tree button
        toolbar.insertBefore(button, skillTreeBtn.nextSibling);
        inserted = true;
      } else if (titleBtn && titleBtn.parentElement === toolbar) {
        // Insert after Title button
        toolbar.insertBefore(button, titleBtn.nextSibling);
        inserted = true;
      } else if (appsButton && appsButton.parentElement === toolbar) {
        // Insert before apps button
        toolbar.insertBefore(button, appsButton);
        inserted = true;
      }

      // Fallback: append to end if couldn't find reference buttons
      if (!inserted) {
        toolbar.appendChild(button);
      }

      // Store reference
      this.dungeonButton = button;

      // Ensure button is visible
      button.style.display = 'flex';

      // Observe toolbar for changes
      this.observeToolbar(toolbar);
    } finally {
      // Always clear the creation flag
      this._creatingDungeonButton = false;
    }
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
      // Clear any pending timeout to debounce rapid changes
      if (this._recreateTimeout) {
        clearTimeout(this._recreateTimeout);
      }

      // Use instance variable so timeout persists
      this._recreateTimeout = setTimeout(() => {
        const dungeonBtnExists = this.dungeonButton && toolbar.contains(this.dungeonButton);
        if (!dungeonBtnExists && !this._creatingDungeonButton && this.started) {
          console.log('[Dungeons] Button missing, recreating...');
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

      const escapeHtml = (str) => {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };

      if (currentDungeons.length === 0) {
        listHTML +=
          '<div style="text-align: center; padding: 40px; color: #999;">No active dungeons</div>';
      } else {
        currentDungeons.forEach((dungeon) => {
          const isActive = this.settings.userActiveDungeon === dungeon.channelKey;
          const elapsed = Date.now() - dungeon.startTime;
          const remaining = Math.max(0, this.settings.dungeonDuration - elapsed);
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
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
          const timeStr = minutes + ':' + seconds.toString().padStart(2, '0');

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
            escapeHtml(dungeon.name) +
            '</div>';
          listHTML +=
            '<div style="color: #999; font-size: 12px; margin-bottom: 2px;">Rank: ' +
            dungeon.rank +
            ' [' +
            (dungeon.type || 'Normal') +
            '] • Channel: ' +
            escapeHtml(channelName) +
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
            escapeHtml(bossName) +
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
        return;
      }
      renderDungeonList();
    }, 1000);

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

  setupChannelWatcher() {
    let lastChannelKey = null;

    const checkChannel = () => {
      const channelInfo = this.getChannelInfo();
      if (!channelInfo) return;

      const currentChannelKey = `${channelInfo.guildId}_${channelInfo.channelId}`;

      // If channel changed, update all boss HP bars and indicators
      if (currentChannelKey !== lastChannelKey) {
        lastChannelKey = currentChannelKey;

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
    const count = notification.count;
    notification.count = 0;
    notification.lastNotification = Date.now();
    this.showToast(`Killed ${count} mob${count !== 1 ? 's' : ''} in ${dungeon.name}`, 'info');
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
    try {
      const savedDungeons = await this.storageManager.getAllDungeons();
      for (const dungeon of savedDungeons) {
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
        } else {
          // Expired, delete it
          await this.storageManager.deleteDungeon(dungeon.channelKey);
        }
      }
    } catch (error) {
      console.error('Dungeons: Failed to restore dungeons', error);
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
        console.error('[Dungeons] Error showing toast via plugin:', error);
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

    try {
      // Remove via BdApi
      BdApi.clearCSS(styleId);
    } catch (error) {
      // Fallback: manual removal
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
    }
  }

  injectCSS() {
    const styleId = 'dungeons-plugin-styles';

    // Remove existing style if present to force refresh
    this.removeCSS();

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

    // Inject CSS using both methods for maximum compatibility
    try {
      // Method 1: BetterDiscord's native CSS injection
      BdApi.injectCSS(styleId, cssContent);
    } catch (error) {
      // Method 2: Fallback to manual injection
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = cssContent;
    document.head.appendChild(style);
    }
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
