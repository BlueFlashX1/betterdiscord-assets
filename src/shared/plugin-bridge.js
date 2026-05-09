/**
 * Cross-plugin communication utilities.
 * Replaces the 10+ inline BdApi.Plugins.get() patterns scattered across
 * ShadowExchange, ShadowStep, ShadowRecon, Dungeons, SkillTree, etc.
 *
 * Usage:
 *   const { getPluginInstance, getSkillTreeLevel, getSoloLevelingData } = require("../shared/plugin-bridge");
 *
 *   const sa = getPluginInstance("ShadowArmy");   // null if disabled or missing
 *   const level = getSkillTreeLevel("stealth");   // 0 if unavailable
 *   const data = getSoloLevelingData();           // null if unavailable
 */

/**
 * Get a plugin instance safely. Returns null if plugin is not found or not enabled.
 * @param {string} pluginName
 * @returns {object|null}
 */
function getPluginInstance(pluginName) {
  try {
    if (!BdApi.Plugins.isEnabled(pluginName)) return null;
    const plugin = BdApi.Plugins.get(pluginName);
    return plugin?.instance || null;
  } catch (_) {
    return null;
  }
}

/**
 * Get a SkillTree skill level safely. Returns 0 if SkillTree is unavailable.
 * @param {string} skillId
 * @returns {number}
 */
function getSkillTreeLevel(skillId) {
  try {
    const instance = getPluginInstance('SkillTree');
    if (!instance || typeof instance.getSkillLevel !== 'function') return 0;
    return Number(instance.getSkillLevel(skillId)) || 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Get SoloLevelingStats data safely. Returns null if unavailable.
 * @returns {object|null}
 */
function getSoloLevelingData() {
  try {
    const instance = getPluginInstance('SoloLevelingStats');
    if (!instance) return null;
    if (typeof instance.getPublicAPI === 'function') {
      return instance.getPublicAPI() || null;
    }
    return instance.settings || null;
  } catch (_) {
    return null;
  }
}

module.exports = { getPluginInstance, getSkillTreeLevel, getSoloLevelingData };
