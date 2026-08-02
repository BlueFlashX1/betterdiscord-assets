/**
 * IndexedDB persistence for edit history.
 *
 * BdApi.Data is deliberately NOT used: it serialises the whole blob on every
 * write, and edit history grows without a natural ceiling. IndexedDB gives
 * point lookups by message id and a bounded prune pass.
 *
 * Schema — one record per EDITED MESSAGE (not per version):
 *   { messageId, channelId, authorId, versions: [{ content, at }], updatedAt }
 * `versions` holds superseded text oldest-first; the live text stays in
 * Discord's own store, so we never duplicate it here.
 *
 * Every read is bounded (point lookup by key, or an index cursor with a count
 * cap). No getAll() over the whole store — that pattern cost ~45s at 281k
 * records in ShadowArmy; see DKB bd-idb-bounded-queries-at-scale.
 */

const DB_NAME = "MessageEditHistory";
const DB_VERSION = 1;
const STORE = "edits";

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "messageId" });
        // updatedAt drives age-based pruning; channelId supports per-channel purge.
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("channelId", "channelId");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // A rejected promise must not be cached, or every later call fails with a
  // stale error even after the underlying problem clears.
  _dbPromise.catch(() => { _dbPromise = null; });

  return _dbPromise;
}

function runTransaction(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch (err) {
      reject(err);
      return;
    }
    const store = tx.objectStore(STORE);
    let result;
    try {
      result = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result && result.value !== undefined ? result.value : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/** Point lookup — O(1) by primary key. @returns {Promise<object|null>} */
function getRecord(messageId) {
  return runTransaction("readonly", (store) => {
    const box = { value: null };
    const req = store.get(messageId);
    req.onsuccess = () => { box.value = req.result || null; };
    return box;
  });
}

/**
 * Append a superseded version to a message's history, creating the record on
 * first edit. Read-modify-write inside ONE transaction so two edits landing
 * back-to-back cannot lose a version.
 *
 * @param {object} entry
 * @param {number} maxVersionsPerMessage - Oldest versions dropped past this cap.
 */
function appendVersion(entry, maxVersionsPerMessage) {
  const { messageId, channelId, authorId, previousContent, at } = entry;

  return runTransaction("readwrite", (store) => {
    const req = store.get(messageId);
    req.onsuccess = () => {
      const existing = req.result;
      const version = { content: previousContent, at };

      if (!existing) {
        store.put({
          messageId,
          channelId,
          authorId,
          versions: [version],
          updatedAt: at,
        });
        return;
      }

      const versions = existing.versions.concat(version);
      store.put({
        ...existing,
        // Keep the most recent N: the immediately-previous text is what
        // people actually look for, and a spam-edited message must not grow
        // this record without bound.
        versions: versions.length > maxVersionsPerMessage
          ? versions.slice(versions.length - maxVersionsPerMessage)
          : versions,
        updatedAt: at,
      });
    };
  });
}

/**
 * Delete records older than maxAgeMs, at most `limit` per pass.
 * Cursors the updatedAt index in ascending order and stops at the first
 * record newer than the cutoff — bounded work regardless of store size.
 *
 * @returns {Promise<number>} count deleted
 */
function pruneOlderThan(maxAgeMs, limit = 500) {
  const cutoff = Date.now() - maxAgeMs;

  return runTransaction("readwrite", (store) => {
    const box = { value: 0 };
    const range = IDBKeyRange.upperBound(cutoff);
    const req = store.index("updatedAt").openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || box.value >= limit) return;
      cursor.delete();
      box.value++;
      cursor.continue();
    };
    return box;
  });
}

/**
 * Load the message ids of the most recently edited records, newest first.
 * Used to seed the decorator's in-memory id Set at start so its hot path can
 * stay a pure Set lookup. Bounded by `limit` — never a full-store read.
 *
 * @returns {Promise<string[]>}
 */
function loadRecentIds(limit = 2000) {
  return runTransaction("readonly", (store) => {
    const box = { value: [] };
    const req = store.index("updatedAt").openKeyCursor(null, "prev");
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || box.value.length >= limit) return;
      box.value.push(cursor.primaryKey);
      cursor.continue();
    };
    return box;
  });
}

/** @returns {Promise<number>} total stored edited-message records. */
function countRecords() {
  return runTransaction("readonly", (store) => {
    const box = { value: 0 };
    const req = store.count();
    req.onsuccess = () => { box.value = req.result; };
    return box;
  });
}

function clearAll() {
  return runTransaction("readwrite", (store) => { store.clear(); });
}

function closeDb() {
  if (!_dbPromise) return;
  const pending = _dbPromise;
  _dbPromise = null;
  pending.then((db) => { try { db.close(); } catch (_) {} }).catch(() => {});
}

module.exports = {
  getRecord,
  appendVersion,
  loadRecentIds,
  pruneOlderThan,
  countRecords,
  clearAll,
  closeDb,
};
