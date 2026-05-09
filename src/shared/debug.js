/**
 * Shared debug logging mixin/helper.
 * Replaces the duplicated debugLog/debugError pattern found in 8+ plugins.
 *
 * Usage (mixin pattern — add to plugin class):
 *   import { mixinDebug } from "../shared/debug";
 *
 *   class MyPlugin {
 *     constructor() {
 *       mixinDebug(this, "MyPlugin");
 *       this._debugMode = false;
 *     }
 *     start() {
 *       this.debugLog("START", "Plugin started");
 *       this.debugError("INIT", "Something failed", error);
 *     }
 *   }
 *
 * The mixin reads `this._debugMode` to gate output.
 */

/**
 * Add debugLog and debugError methods to a plugin instance.
 * @param {object} plugin - The plugin instance (must have `_debugMode` property)
 * @param {string} pluginName - Display name for log prefix
 */
function mixinDebug(plugin, pluginName) {
  /**
   * Log a debug message. Supports two call signatures:
   *   debugLog("message")
   *   debugLog("TAG", "message", data)
   */
  plugin.debugLog = function debugLog(tagOrMessage, messageOrData = null, data = null) {
    if (!this._debugMode) return;
    if (messageOrData === null) {
      console.log(`[${pluginName}]`, tagOrMessage);
    } else if (data === null) {
      console.log(`[${pluginName}][${tagOrMessage}]`, messageOrData);
    } else {
      console.log(`[${pluginName}][${tagOrMessage}]`, messageOrData, data);
    }
  };

  /**
   * Log a debug error. Same signatures as debugLog.
   */
  plugin.debugError = function debugError(tagOrMessage, messageOrError = null, error = null) {
    if (!this._debugMode) return;
    if (messageOrError === null) {
      console.error(`[${pluginName}]`, tagOrMessage);
    } else if (error === null) {
      console.error(`[${pluginName}][${tagOrMessage}]`, messageOrError);
    } else {
      console.error(`[${pluginName}][${tagOrMessage}]`, messageOrError, error);
    }
  };
}

module.exports = { mixinDebug };
