/**
 * UnifiedSaveManager - IndexedDB-based save system for BetterDiscord plugins
 *
 * Provides crash-resistant persistent storage with automatic backups
 * Replaces BdApi.Data which can be cleared during crashes
 *
 * Usage:
 * const saveManager = new UnifiedSaveManager('SoloLevelingStats');
 * await saveManager.init();
 * await saveManager.save('settings', data);
 * const data = await saveManager.load('settings');
 */

class UnifiedSaveManager {
  static SCHEMA_VERSION = 1;

  constructor(pluginName, userId = null) {
    this.pluginName = pluginName;
    this.userId = userId || this.getUserId();
    this.dbName = `UnifiedSaves_${this.userId}`;
    this.dbVersion = UnifiedSaveManager.SCHEMA_VERSION;
    this.storeName = 'pluginData';
    this.backupStoreName = 'backups';
    this.db = null;
  }

  /**
   * Get Discord user ID for database isolation
   */
  getUserId() {
    try {
      // Try to get user ID from Discord's global state
      const user =
        window.Discord?.user ||
        window.webpackChunkdiscord_app
          ?.find?.((m) => m?.exports?.default?.getCurrentUser)
          ?.exports?.default?.getCurrentUser?.();
      return user?.id || 'default';
    } catch (error) {
      return 'default';
    }
  }

  /**
   * Initialize IndexedDB database
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(this.dbName, UnifiedSaveManager.SCHEMA_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create main data store
        if (!db.objectStoreNames.contains(this.storeName)) {
          const mainStore = db.createObjectStore(this.storeName, { keyPath: 'key' });
          mainStore.createIndex('plugin', 'plugin', { unique: false });
          mainStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create backup store
        if (!db.objectStoreNames.contains(this.backupStoreName)) {
          const backupStore = db.createObjectStore(this.backupStoreName, {
            keyPath: 'id',
            autoIncrement: true,
          });
          backupStore.createIndex('plugin', 'plugin', { unique: false });
          backupStore.createIndex('dataKey', 'dataKey', { unique: false });
          backupStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onblocked = () => {
        console.warn(`[${this.pluginName}] Database upgrade blocked by other tabs`);
        reject(new Error('Database upgrade blocked'));
      };
    });
  }

  /**
   * Save data with automatic backup
   * @param {string} key - Data key (e.g., 'settings')
   * @param {any} data - Data to save
   * @param {boolean} createBackup - Whether to create backup (default: true)
   */
  async save(key, data, createBackup = true) {
    if (!this.db) await this.init();

    const fullKey = `${this.pluginName}_${key}`;
    const timestamp = Date.now();

    // Sanitize data (remove non-serializable values)
    const sanitized = this.sanitizeData(data);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName, this.backupStoreName], 'readwrite');

      // Save main data
      const mainStore = transaction.objectStore(this.storeName);
      const mainRequest = mainStore.put({
        key: fullKey,
        plugin: this.pluginName,
        dataKey: key,
        data: sanitized,
        timestamp: timestamp,
      });

      // Create backup if requested
      if (createBackup) {
        const backupStore = transaction.objectStore(this.backupStoreName);
        const backupRequest = backupStore.add({
          plugin: this.pluginName,
          dataKey: key,
          data: sanitized,
          timestamp: timestamp,
        });

        backupRequest.onsuccess = () => {
          // Clean up old backups (keep last 10 per plugin+key)
          this.cleanupOldBackups(key).catch(console.error);
        };
      }

      mainRequest.onsuccess = () => resolve({ success: true, timestamp });
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Load data (tries main, falls back to latest backup)
   * @param {string} key - Data key
   * @param {boolean} useBackupIfMainMissing - Use backup if main is missing (default: true)
   */
  async load(key, useBackupIfMainMissing = true) {
    if (!this.db) await this.init();

    const fullKey = `${this.pluginName}_${key}`;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName, this.backupStoreName], 'readonly');

      // Try main store first
      const mainStore = transaction.objectStore(this.storeName);
      const mainRequest = mainStore.get(fullKey);

      mainRequest.onsuccess = () => {
        if (mainRequest.result) {
          resolve(mainRequest.result.data);
        } else if (useBackupIfMainMissing) {
          // Try backup store
          const backupStore = transaction.objectStore(this.backupStoreName);
          const index = backupStore.index('plugin');
          const range = IDBKeyRange.only(this.pluginName);
          const backupRequest = index.openCursor(range, 'prev'); // Get latest first

          let latestBackup = null;
          backupRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              if (cursor.value.dataKey === key) {
                latestBackup = cursor.value.data;
                resolve(latestBackup);
                return;
              }
              cursor.continue();
            } else {
              // No backup found
              resolve(null);
            }
          };
          backupRequest.onerror = () => reject(backupRequest.error);
        } else {
          resolve(null);
        }
      };

      mainRequest.onerror = () => reject(mainRequest.error);
    });
  }

  /**
   * Get all backups for a key
   * @param {string} key - Data key
   * @param {number} limit - Maximum number of backups to return
   */
  async getBackups(key, limit = 10) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.backupStoreName], 'readonly');
      const backupStore = transaction.objectStore(this.backupStoreName);
      const index = backupStore.index('plugin');
      const range = IDBKeyRange.only(this.pluginName);
      const request = index.openCursor(range, 'prev');

      const backups = [];
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.dataKey === key) {
            backups.push({
              id: cursor.value.id,
              timestamp: cursor.value.timestamp,
              data: cursor.value.data,
            });
            if (backups.length >= limit) {
              resolve(backups);
              return;
            }
          }
          cursor.continue();
        } else {
          resolve(backups);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clean up old backups (keep last 10 per plugin+key)
   */
  async cleanupOldBackups(key) {
    if (!this.db) await this.init();

    const backups = await this.getBackups(key, 20); // Get more than we need
    if (backups.length <= 10) return; // Keep last 10

    // Delete oldest backups
    const toDelete = backups.slice(10);
    const transaction = this.db.transaction([this.backupStoreName], 'readwrite');
    const backupStore = transaction.objectStore(this.backupStoreName);

    return Promise.all(
      toDelete.map((backup) => {
        return new Promise((resolve, reject) => {
          const request = backupStore.delete(backup.id);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      })
    );
  }

  /**
   * Sanitize data for IndexedDB storage
   * Removes non-serializable values (Promises, Functions, etc.)
   */
  sanitizeData(data) {
    return JSON.parse(
      JSON.stringify(data, (key, value) => {
        // Skip Promise values
        if (value instanceof Promise) {
          return undefined;
        }
        // Skip Function values
        if (typeof value === 'function') {
          return undefined;
        }
        // Skip DOM elements
        const hasHTMLElement =
          typeof window !== 'undefined' && typeof window.HTMLElement === 'function';
        if (hasHTMLElement && value instanceof window.HTMLElement) {
          return undefined;
        }
        // Skip Sets (convert to Array)
        if (value instanceof Set) {
          return Array.from(value);
        }
        // Skip Maps (convert to Object)
        if (value instanceof Map) {
          return Object.fromEntries(value);
        }
        return value;
      })
    );
  }

  /**
   * Delete data
   * @param {string} key - Data key
   */
  async delete(key) {
    if (!this.db) await this.init();

    const fullKey = `${this.pluginName}_${key}`;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(fullKey);
      request.onsuccess = () => resolve({ success: true });
      request.onerror = () => reject(request.error);
    });
  }

}

// Export for use in plugins
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnifiedSaveManager;
}

// Also expose globally for eval() loading
if (typeof window !== 'undefined') {
  window.UnifiedSaveManager = UnifiedSaveManager;
}
