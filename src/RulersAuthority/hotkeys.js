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
  // Inline fallback when BetterDiscordPluginUtils is not available
  if (!hotkey || !e) return false;
  const parts = hotkey.toLowerCase().replace(/\s+/g, "").split("+").filter(Boolean);
  const mods = new Set(parts.filter(p => ["ctrl","shift","alt","meta","cmd","command"].includes(p)));
  const key = parts.find(p => !mods.has(p)) || "";
  if (!key) return false;
  return (
    e.key.toLowerCase() === key &&
    !!e.ctrlKey === mods.has("ctrl") &&
    !!e.shiftKey === mods.has("shift") &&
    !!e.altKey === mods.has("alt") &&
    !!e.metaKey === (mods.has("meta") || mods.has("cmd") || mods.has("command"))
  );
}
