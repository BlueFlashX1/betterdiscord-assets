/**
 * @name TestPlugin
 * @author Matthew Thompson
 * @description Testing the AI generator
 * @version 1.0.0
 */

/**
 * TABLE OF CONTENTS
 * 1) Lifecycle
 * 2) Toast Utilities
 */

function _bdLoad(fileName) {
  if (!fileName) return null;
  try {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), 'utf8');
    const moduleObj = { exports: {} };
    const factory = new Function(
      'module',
      'exports',
      'require',
      'BdApi',
      `${source}\nreturn module.exports || exports || null;`
    );
    const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
    const candidate = loaded || moduleObj.exports;
    if (typeof candidate === 'function') return candidate;
    if (candidate && typeof candidate === 'object' && Object.keys(candidate).length > 0) return candidate;
  } catch (_) {}
  return null;
}

let _PluginUtils = null;
try { _PluginUtils = _bdLoad('BetterDiscordPluginUtils.js'); } catch (_) { _PluginUtils = null; }

module.exports = class TestPlugin {
  constructor() {
    this.pluginId = 'TestPlugin';
    this.version = '1.0.0';
    this.instanceKey = `__${this.pluginId}Instance`;
    this.debug = false;
    this._toastFn = null;
  }

  // =========================================================================
  // 2) TOAST UTILITIES
  // =========================================================================
  _toast(message, type = "info", timeout = null) {
    this._toastFn?.(message, type, timeout);
  }

  _logDebug(...args) {
    if (!this.debug) return;
    console.debug(`[${this.pluginId}]`, ...args);
  }

  // =========================================================================
  // 1) LIFECYCLE
  // =========================================================================
  start() {
    this._toastFn =
      _PluginUtils?.createToastHelper?.('testPlugin') ||
      ((message, type = 'info', timeout = null) => {
        BdApi.UI.showToast(message, {
          type: type === "level-up" ? "info" : type,
          timeout: timeout ?? 2500,
        });
      });
    try {
      // Prevent duplicate instances
      const prev = window[this.instanceKey];
      if (prev && prev !== this && typeof prev.stop === 'function') prev.stop();
      window[this.instanceKey] = this;
    } catch (error) {
      this._logDebug('Failed to register singleton instance', error);
    }

    this._toast(`${this.pluginId} v${this.version} active`, "success", 2200);

    // --- AI HYDRATION ZONE ---
    // Inject styles, observers, or logic here
    // -------------------------
  }

  stop() {
    try {
      delete window[this.instanceKey];
    } catch (error) {
      this._logDebug('Failed to clear singleton instance key', error);
    }

    // --- AI DEHYDRATION ZONE ---
    // Remove styles and clear intervals here
    // ---------------------------

    this._toast(`${this.pluginId} stopped`, "info", 2200);
    this._toastFn = null;
  }
};
