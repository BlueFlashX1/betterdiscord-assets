/**
 * Shared settings load/save helpers.
 * Replaces the duplicated `{ ...DEFAULTS, ...(BdApi.Data.load(...) || {}) }` pattern
 * found in 14/16 plugins.
 *
 * Usage:
 *   import { loadSettings, saveSettings } from "../shared/settings";
 *   this.settings = loadSettings("MyPlugin", DEFAULT_SETTINGS);
 *   saveSettings("MyPlugin", this.settings);
 */

/**
 * Load settings from BdApi.Data, merged with defaults.
 * @param {string} pluginId - Plugin name/id for BdApi.Data
 * @param {object} defaults - Default settings object
 * @param {string} [key="settings"] - Data key
 * @returns {object} Merged settings
 */
function loadSettings(pluginId, defaults, key = "settings") {
  try {
    return { ...defaults, ...(BdApi.Data.load(pluginId, key) || {}) };
  } catch (_) {
    return { ...defaults };
  }
}

/**
 * Save settings to BdApi.Data.
 * @param {string} pluginId - Plugin name/id for BdApi.Data
 * @param {object} settings - Settings object to save
 * @param {string} [key="settings"] - Data key
 */
function saveSettings(pluginId, settings, key = "settings") {
  try {
    BdApi.Data.save(pluginId, key, settings);
  } catch (_) {
    // ignore save failures
  }
}

module.exports = { loadSettings, saveSettings };
