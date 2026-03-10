// ═══════════════════════════════════════════════════════════════════════════
// Hotkey Utilities (from BetterDiscordPluginUtils)
// ═══════════════════════════════════════════════════════════════════════════

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
  if (!t) return false;
  const tag = t.tagName?.toLowerCase?.() || "";
  return tag === "input" || tag === "textarea" || tag === "select" || !!t.isContentEditable;
}

export function matchesHotkey(e, hotkey) {
  if (_pluginUtilsRef?.matchesHotkey) return _pluginUtilsRef.matchesHotkey(e, hotkey);
  return false;
}
