const { openIndexedDbDatabase } = require('./bootstrap-runtime');

// ==== STORAGE MANAGER - IndexedDB Management ====
/**
 * DungeonStorageManager - IndexedDB storage manager for Dungeons plugin
 * Handles persistent storage of dungeon data across sessions
 */
class DungeonStorageManager {
  constructor(userId) {
    this.userId = userId || 'default';
    this.dbName = `DungeonsDB_${this.userId}`;
    this.dbVersion = 3; // Incremented for performance optimizations
    this.storeName = 'dungeons';
    this.archiveStoreName = 'dungeons_archive'; // Hot/cold data separation
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

          // V2 upgrade complete
        }

        // V3: Performance optimizations
        if (oldVersion < 3) {
          const transaction = event.target.transaction;

          // Create archive store for hot/cold data separation
          if (!db.objectStoreNames.contains(this.archiveStoreName)) {
            const archiveStore = db.createObjectStore(this.archiveStoreName, { keyPath: 'id' });
            archiveStore.createIndex('channelKey', 'channelKey', { unique: true });
            archiveStore.createIndex('rank', 'rank', { unique: false });
            archiveStore.createIndex('completedAt', 'completedAt', { unique: false });
          }

          const objectStore = transaction.objectStore(this.storeName);

          // Add compound indexes for common filtered queries
          if (!objectStore.indexNames.contains('status_rank')) {
            objectStore.createIndex('status_rank', ['completed', 'rank'], { unique: false });
          }
          if (!objectStore.indexNames.contains('active_rank')) {
            objectStore.createIndex('active_rank', ['failed', 'completed', 'rank'], {
              unique: false,
            });
          }
          if (!objectStore.indexNames.contains('type_rank')) {
            objectStore.createIndex('type_rank', ['type', 'rank'], { unique: false });
          }

          // V3 upgrade complete
        }
      },
      onBlocked: () => {
        // Database upgrade blocked by other tabs holding an old DB version.
        // Surface a toast so the user actually knows to close their other
        // Discord tabs — previously this was a silent no-op and the
        // dungeon DB never upgraded, breaking all persistence on the
        // affected tab.
        try {
          BdApi.UI?.showToast?.(
            'Dungeons: close other Discord tabs/windows to upgrade dungeon data.',
            { type: 'warning', timeout: 8000 }
          );
        } catch (_) {}
      },
    });

    return this.db;
  }

  async _withStore(mode, operation) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], mode);
      const store = transaction.objectStore(this.storeName);
      operation(store, transaction, resolve, reject);
    });
  }

  async _getAllFromStore() {
    return this._withStore('readonly', (store, _tx, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
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
      let request;
      try {
        request = store.put(sanitizedDungeon);
      } catch (error) {
        // store.put() throws SYNCHRONOUSLY on a non-cloneable value, which
        // aborts the whole transaction (2026-07 keyPath incident). Retry once
        // through the old JSON sanitizer rather than losing the save.
        try {
          request = store.put(this._jsonSanitizeFallback(sanitizedDungeon));
          console.warn('[Dungeons] structured clone rejected a dungeon value — used JSON fallback:', error?.name || error);
        } catch (fallbackError) {
          reject(fallbackError);
          return;
        }
      }
      request.onsuccess = () => resolve({ success: true });
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Sanitize dungeon object for IndexedDB storage.
   * Removes Promises and other non-serializable values; ensures object is safe for IndexedDB storage.
   */
  sanitizeDungeonForStorage(dungeon) {
    const MAX_ACTIVE_MOBS_TO_STORE = 250;

    // Pre-prune hot/huge fields before deep cloning.
    // This prevents CPU spikes / freezes from stringifying very large runtime state.
    const prunedDungeon = (() => {
      if (!dungeon || typeof dungeon !== 'object') return dungeon;

      const next = { ...dungeon };

      // Active mobs can be extremely large; store only a bounded slice.
      if (next.mobs && typeof next.mobs === 'object') {
        next.mobs = { ...next.mobs };
        if (
          Array.isArray(next.mobs.activeMobs) &&
          next.mobs.activeMobs.length > MAX_ACTIVE_MOBS_TO_STORE
        ) {
          next.mobs.activeMobs = next.mobs.activeMobs.slice(-MAX_ACTIVE_MOBS_TO_STORE);
        }
      }

      // Shadow allocations may contain full shadow objects (very large); recompute on restore.
      delete next.shadowAllocation;

      // Runtime-only flags — must not persist (would block completeDungeon on restore)
      delete next._completing;
      // Runtime-only pooled Map caches — not useful across sessions, cause TypeError on restore
      delete next._pooledMobDamageMap;

      // Cap corpse pile for IDB storage. DELIBERATELY DECOUPLED from the
      // in-memory cap in corpse-tick-pipeline.js (2026-08-06) — the previous
      // "keep both in sync" instruction was wrong, and raising both to 5000
      // caused a measured regression: _debounceDungeonSave went to avg 1502ms
      // across 167 saves (250s of blocking, worst 5506ms) because every
      // debounced save structured-clones the whole dungeon, corpse pile
      // included.
      //
      // The two caps answer different questions:
      //   in-memory (5000) — how many bodies a bulk ARISE can raise. Gameplay.
      //   persisted  (750) — how much survives an unexpected reload MID-run.
      // Corpses are consumed at completion, so the persisted copy only exists
      // to cover a crash. Losing the oldest (weakest — the tail is kept)
      // corpses in that rare case is far cheaper than a multi-second main
      // thread stall on every save of every dungeon.
      if (Array.isArray(next.corpsePile) && next.corpsePile.length > 750) {
        next.corpsePile = next.corpsePile.slice(-750);
      }

      // Convert Map fields to plain objects, CAPPED (2026-07-30, profiler:
      // saves averaged 517ms, worst 1306ms). activeMobs and corpsePile were
      // already capped; these two were not, and their live size is bounded
      // only by deploy allocation — uncapped (Infinity) at Shadow Monarch
      // rank, so thousands of entries at high rank/large army. Restore-side
      // is already safe: combat-shadow-execution treats a missing entry as
      // uninitialized and recreates it fresh.
      // Both maps MUST be filtered against ONE shared key set — slicing them
      // independently would desync HP from combat data for the same shadow.
      const MAX_SHADOW_STATE = 400;
      const hpIsMap = next.shadowHP instanceof Map;
      const cdIsMap = next.shadowCombatData instanceof Map;
      const hpKeys = hpIsMap ? [...next.shadowHP.keys()] : Object.keys(next.shadowHP || {});
      // Keep the most recently added entries (tail) — same policy as corpsePile.
      const keepIds = hpKeys.length > MAX_SHADOW_STATE
        ? new Set(hpKeys.slice(-MAX_SHADOW_STATE))
        : null;

      if (hpIsMap || next.shadowHP) {
        const shadowHPObj = {};
        const src = hpIsMap ? next.shadowHP : new Map(Object.entries(next.shadowHP || {}));
        src.forEach((value, key) => {
          if (!keepIds || keepIds.has(key)) shadowHPObj[key] = value;
        });
        next.shadowHP = shadowHPObj;
      }
      if (cdIsMap || next.shadowCombatData) {
        const combatObj = {};
        const src = cdIsMap ? next.shadowCombatData : new Map(Object.entries(next.shadowCombatData || {}));
        src.forEach((value, key) => {
          if (!keepIds || keepIds.has(key)) combatObj[key] = value;
        });
        next.shadowCombatData = combatObj;
      }

      // Runtime-only Maps that slip past the field deletes above — they are
      // never read back (restore recreates them via instanceof guards), so
      // drop them here instead of paying to serialize them.
      delete next._lastResurrectionAttempt;
      delete next._pooledMobRankGroups;
      delete next._shadowLastProcessed;

      // PACK shadowContributions to parallel arrays (2026-08-05). It is the
      // ONLY unbounded field left in this record — one {mobsKilled, bossDamage}
      // entry per shadow that ever landed a kill, growing toward allocation
      // size (100k+ at Shadow Monarch). It cannot be capped: completion reads
      // it for XP/growth attribution, so dropping entries eats earned XP after
      // a crash-restore. But its SHAPE was the cost — store.put() structured-
      // clones synchronously, and ~100k tiny objects clone ~4x slower than
      // three flat arrays (measured: full record 102ms -> ~25ms at 120k; with
      // contributions removed entirely the same record is 1ms, so this field
      // was effectively the whole payload of the measured 368ms-avg debounced
      // save). Lossless; restore-gc-toast.js unpacks the _packed shape, and
      // old saves (plain object) restore through the untouched legacy path.
      if (next.shadowContributions && typeof next.shadowContributions === 'object'
          && !next.shadowContributions._packed) {
        const src = next.shadowContributions;
        const ids = [], mobsKilled = [], bossDamage = [];
        for (const key of Object.keys(src)) {
          const e = src[key];
          if (!e) continue;
          ids.push(key);
          mobsKilled.push(Number(e.mobsKilled) || 0);
          bossDamage.push(Number(e.bossDamage) || 0);
        }
        next.shadowContributions = { _packed: 1, ids, mobsKilled, bossDamage };
      }

      return next;
    })();

    // No manual deep clone (2026-07-30). This used to be
    // JSON.parse(JSON.stringify(pruned, replacer)) — a full deep clone WITH a
    // per-value callback — and then store.put() performed IndexedDB's own
    // structured clone of the same object: TWO deep-clone passes per save.
    // The pre-prune above already shallow-copies every container it mutates,
    // so the original dungeon is not modified, and structured clone handles
    // Maps/Sets/Dates natively. saveDungeon() keeps a DataCloneError fallback
    // to the old JSON path, so an unforeseen non-cloneable value degrades to
    // the previous behaviour instead of throwing (a put() throw aborts the
    // transaction — see the 2026-07 keyPath incident).
    return prunedDungeon;
  }

  /** Last-resort JSON sanitize — only used if structured clone rejects a value. */
  _jsonSanitizeFallback(dungeon) {
    return JSON.parse(
      JSON.stringify(dungeon, (key, value) => {
        if (value instanceof Promise) return undefined;
        if (typeof value === 'function') return undefined;
        if (value instanceof Map) {
          const obj = {};
          value.forEach((v, k) => { obj[k] = v; });
          return obj;
        }
        return value;
      })
    );
  }

  async getAllDungeons() {
    return this._getAllFromStore();
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
      // FIX (2026-07-30): the previous index-scoped scans used
      // IDBKeyRange.only(true) — booleans are NOT valid IDB keys, so this
      // threw synchronously on every 5-min GC run since dbVersion 2 (the
      // recurring 'Failed to cleanup completed dungeons' error), and the
      // completed/failed indices were permanently EMPTY anyway (IDB never
      // indexes boolean values). Plain cursor + JS filter is correct AND
      // cheap: normal completion deletes records directly within ~30s, so
      // steady-state population ≈ concurrently-active dungeons only. The
      // dead indices (completed/failed/status_rank/active_rank) are flagged
      // for removal at the next dbVersion bump.
      let deleted = 0;
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const d = cursor.value;
        if (d && (d.completed === true || d.failed === true)) {
          const deleteRequest = cursor.delete();
          // R8: a bad record must not abort the whole cleanup transaction.
          deleteRequest.onerror = (delEvent) => {
            delEvent.preventDefault();
            delEvent.stopPropagation();
          };
          deleted++;
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => resolve({ deleted });
      transaction.onerror = () => reject(transaction.error);
    });
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }

}

/**
 * MobBossStorageManager - IndexedDB storage manager for Mobs and Bosses
 * Handles persistent storage of mob and boss data for caching and migration
 */
// 2026-07-30: mob persistence REMOVED (user decision, ponytail follow-up).
// The mobs/mobs_dead stores were write-only at runtime (nothing ever read
// them back), and the extracted-index GC had never worked (boolean keys are
// invalid in IDB). This manager now persists BOSSES only. Existing installs
// keep orphaned empty mobs stores (harmless); physically dropping them would
// need a dbVersion bump + deleteObjectStore — deliberately not done.
class MobBossStorageManager {
  constructor(userId) {
    this.userId = userId || 'default';
    this.dbName = `MobBossDB_${this.userId}`;
    this.dbVersion = 2; // Incremented for performance optimizations
    this.bossStoreName = 'bosses';
    this.db = null;
    this._lastBossSaveFraction = new Map(); // Throttle boss saves on HP delta
    this._logHandlers = {
      debug: null,
      warn: null,
      error: null,
    };
    this._warnOnceKeys = new Set();
  }

  setLogHandlers(handlers = {}) {
    if (!handlers || typeof handlers !== 'object') return;
    if (typeof handlers.debug === 'function') this._logHandlers.debug = handlers.debug;
    if (typeof handlers.warn === 'function') this._logHandlers.warn = handlers.warn;
    if (typeof handlers.error === 'function') this._logHandlers.error = handlers.error;
  }

  _logDebug(message, context = null) {
    const handler = this._logHandlers.debug;
    if (typeof handler === 'function') {
      handler(message, context);
    }
  }

  _logWarn(message, context = null, onceKey = null) {
    if (onceKey && this._warnOnceKeys.has(onceKey)) return;
    onceKey && this._warnOnceKeys.add(onceKey);

    const handler = this._logHandlers.warn;
    if (typeof handler === 'function') {
      handler(message, context);
      return;
    }
    console.warn(`[MobBossStorageManager] ${message}`, context || '');
  }

  _logError(message, context = null, error = null) {
    const handler = this._logHandlers.error;
    if (typeof handler === 'function') {
      handler(message, context, error);
      return;
    }
    console.error(`[MobBossStorageManager] ${message}`, context || '', error || '');
  }

  async init() {
    if (this.db) return this.db;

    this.db = await openIndexedDbDatabase({
      dbName: this.dbName,
      dbVersion: this.dbVersion,
      onUpgrade: (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // Create bosses object store (V1)
        if (!db.objectStoreNames.contains(this.bossStoreName)) {
          const bossStore = db.createObjectStore(this.bossStoreName, { keyPath: 'id' });
          bossStore.createIndex('dungeonKey', 'dungeonKey', { unique: true });
          bossStore.createIndex('rank', 'rank', { unique: false });
          bossStore.createIndex('spawnedAt', 'spawnedAt', { unique: false });
        }

      },
      onBlocked: () => {
        // See DungeonStorageManager.init above for rationale.
        try {
          BdApi.UI?.showToast?.(
            'Dungeons: close other Discord tabs/windows to upgrade mob/boss data.',
            { type: 'warning', timeout: 8000 }
          );
        } catch (_) {}
      },
    });

    return this.db;
  }

  async _withSingleStore(storeName, mode, operation) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);
      operation(store, transaction, resolve, reject);
    });
  }

  /**
   * Save boss to database
   */
  async saveBoss(boss, dungeonKey) {
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

    return this._withSingleStore(
      this.bossStoreName,
      'readwrite',
      (store, _tx, resolve, reject) => {
      const request = store.put(bossData);
      request.onsuccess = () => {
        this._lastBossSaveFraction.set(bossData.id, fraction);
        resolve({ success: true, id: bossData.id });
      };
      request.onerror = () => reject(request.error);
      }
    );
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }

}

module.exports = {
  DungeonStorageManager,
  MobBossStorageManager,
};
