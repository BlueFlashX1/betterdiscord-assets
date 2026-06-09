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

// Short-TTL cache for getPluginInstance. BdApi.Plugins.isEnabled+get both
// iterate the plugin list; consumers often call this several times for the
// same provider in a single pass (e.g. ShadowSenses reads ShadowArmy +
// ShadowExchange + Dungeons per deployment eval). A 3s TTL collapses those
// repeats to one lookup. The window is short enough that a plugin
// enable/disable is reflected almost immediately. Per-bundle (esbuild) — that
// is fine, the redundant reads we target are all within a single plugin.
const _BRIDGE_TTL_MS = 3000;
const _instanceCache = new Map(); // pluginName -> { instance, ts }

/**
 * Get a plugin instance safely. Returns null if plugin is not found or not enabled.
 * Result is cached for ~3s to avoid repeated registry scans on hot paths.
 * @param {string} pluginName
 * @returns {object|null}
 */
function getPluginInstance(pluginName) {
  // Date.now() is fine here (runs in Discord's renderer, not a workflow).
  const now = Date.now();
  const cached = _instanceCache.get(pluginName);
  if (cached && (now - cached.ts) < _BRIDGE_TTL_MS) {
    const inst = cached.instance;
    // Never serve an instance that stopped after it was cached (provider
    // reload) — fall through to a fresh registry lookup instead.
    if (!inst || !(inst._stopped || inst._isStopped)) return inst;
  }
  let instance = null;
  try {
    if (BdApi.Plugins.isEnabled(pluginName)) {
      instance = BdApi.Plugins.get(pluginName)?.instance || null;
    }
  } catch (_) {
    instance = null;
  }
  _instanceCache.set(pluginName, { instance, ts: now });
  return instance;
}

/**
 * Drop a cached instance (or all of them) — call when you know a provider just
 * (re)started and you need a fresh lookup before the TTL would expire.
 * @param {string} [pluginName] omit to clear the whole cache
 */
function invalidatePluginInstance(pluginName) {
  if (pluginName) _instanceCache.delete(pluginName);
  else _instanceCache.clear();
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
    // Return a defensive snapshot, NOT the live settings object — consumers
    // must not be able to mutate SoloLevelingStats' state (and bypass its save
    // guards) via this read accessor. Copy the top level plus the nested stats.
    const s = instance.settings;
    if (!s) return null;
    return { ...s, stats: { ...(s.stats || {}) } };
  } catch (_) {
    return null;
  }
}

module.exports = { getPluginInstance, getSkillTreeLevel, getSoloLevelingData, invalidatePluginInstance };
