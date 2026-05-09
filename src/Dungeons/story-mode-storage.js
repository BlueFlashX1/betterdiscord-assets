const { openIndexedDbDatabase } = require('./bootstrap-runtime');

class StoryModeStorage {
  constructor(userId) {
    this.userId = userId || 'default';
    this.dbName = `StoryModeDB_${this.userId}`;
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    if (this.db !== null) {
      return this.db;
    }

    this.db = await openIndexedDbDatabase({
      dbName: this.dbName,
      dbVersion: this.dbVersion,
      onUpgrade: (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('permits')) {
          db.createObjectStore('permits', { keyPath: 'id' });
        }
      },
    });

    return this.db;
  }

  _withStore(storeName, mode, callback) {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('StoryModeStorage: DB not initialized')); return; }
      const tx = this.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = callback(store);
      if (request && typeof request.onsuccess !== 'undefined') {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } else {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }
    });
  }

  async loadProgress(storyId) {
    if (!this.db) await this.init();
    const result = await this._withStore('progress', 'readonly', (store) => store.get(storyId));
    return result || null;
  }

  async saveProgress(storyId, state) {
    if (!this.db) await this.init();
    return this._withStore('progress', 'readwrite', (store) =>
      store.put({ id: storyId, ...state, _savedAt: Date.now() })
    );
  }

  async loadPermits(storyId) {
    if (!this.db) await this.init();
    const result = await this._withStore('permits', 'readonly', (store) => store.get(storyId));
    return result || { count: 0 };
  }

  async savePermits(storyId, count) {
    if (!this.db) await this.init();
    return this._withStore('permits', 'readwrite', (store) =>
      store.put({ id: storyId, count, _savedAt: Date.now() })
    );
  }
}

module.exports = { StoryModeStorage };
