// ═══════════════════════════════════════════════════════════════════════════
// Hotkey Utilities — delegates to shared/hotkeys with PluginUtils override
// ═══════════════════════════════════════════════════════════════════════════

const { isEditableTarget: _sharedIsEditableTarget, parseHotkey, matchesHotkey: _sharedMatchesHotkey } = require("../shared/hotkeys");

let _pluginUtilsRef = null;

/**
 * Inject the BetterDiscordPluginUtils reference.
 * Called once from index.js after _bdLoad.
 */
export function setPluginUtils(utils) {
  _pluginUtilsRef = utils;
}

export function isEditableTarget(t) {
  if (_pluginUtilsRef?.isEditableTarget) return _pluginUtilsRef.isEditableTarget(t);
  return _sharedIsEditableTarget(t);
}

export function matchesHotkey(e, hotkey) {
  if (_pluginUtilsRef?.matchesHotkey) return _pluginUtilsRef.matchesHotkey(e, hotkey);
  return _sharedMatchesHotkey(e, hotkey);
}
