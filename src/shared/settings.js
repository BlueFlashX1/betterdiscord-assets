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
  } catch (err) {
    // Surface the failure — a silent fall-through to defaults can look like a
    // data wipe to the user with no trace of why.
    console.error(`[SL:settings] load failed for ${pluginId}/${key} — using defaults:`, err);
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
  } catch (err) {
    // 13 plugins delegate their primary save to this helper — a swallowed
    // failure here is an invisible data-loss bug. Surface it.
    console.error(`[SL:settings] save FAILED for ${pluginId}/${key}:`, err);
  }
}

module.exports = { loadSettings, saveSettings };
