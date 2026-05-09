/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

function openIndexedDbDatabase({ dbName, dbVersion, onUpgrade, onBlocked }) {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(dbName, dbVersion);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => onUpgrade?.(event);
    request.onblocked = () => {
      onBlocked?.();
      reject(new Error('Database upgrade blocked'));
    };
  });
}

const _dungeonsStartupWarn = (...args) => {
  try {
    // Opt-in startup warnings only (avoids noisy console output in normal runtime).
    if (typeof window !== 'undefined' && window.__DUNGEONS_DEBUG_STARTUP__) {
      console.warn(...args);
    }
  } catch (_) {
    // ignore
  }
};

const UnifiedSaveManager = (() => {
  try {
    if (typeof window !== 'undefined' && typeof window.UnifiedSaveManager === 'function') {
      return window.UnifiedSaveManager;
    }
    // BD require() only handles Node built-ins; use _bdLoad for local shared modules
    const _USM = _bdLoad("UnifiedSaveManager.js") || (typeof window !== 'undefined' ? window.UnifiedSaveManager : null) || null;
    if (_USM && typeof window !== 'undefined' && !window.UnifiedSaveManager) window.UnifiedSaveManager = _USM;
    return _USM;
  } catch (error) {
    _dungeonsStartupWarn('[Dungeons] Failed to load UnifiedSaveManager:', error);
    return typeof window !== 'undefined' ? window.UnifiedSaveManager || null : null;
  }
})();

module.exports = {
  _bdLoad,
  _PluginUtils,
  _dungeonsStartupWarn,
  UnifiedSaveManager,
  openIndexedDbDatabase,
};
