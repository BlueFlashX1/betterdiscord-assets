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

const _parsedHotkeyCache = new Map();

function _parseHotkey(hotkey) {
  let parsed = _parsedHotkeyCache.get(hotkey);
  if (parsed) return parsed;
  const parts = hotkey.toLowerCase().replace(/\s+/g, "").split("+").filter(Boolean);
  const mods = new Set(parts.filter(p => ["ctrl","shift","alt","meta","cmd","command"].includes(p)));
  const key = parts.find(p => !mods.has(p)) || "";
  parsed = { key, ctrl: mods.has("ctrl"), shift: mods.has("shift"), alt: mods.has("alt"), meta: mods.has("meta") || mods.has("cmd") || mods.has("command") };
  _parsedHotkeyCache.set(hotkey, parsed);
  return parsed;
}

export function matchesHotkey(e, hotkey) {
  if (_pluginUtilsRef?.matchesHotkey) return _pluginUtilsRef.matchesHotkey(e, hotkey);
  if (!hotkey || !e) return false;
  const { key, ctrl, shift, alt, meta } = _parseHotkey(hotkey);
  if (!key) return false;
  return (
    e.key.toLowerCase() === key &&
    !!e.ctrlKey === ctrl &&
    !!e.shiftKey === shift &&
    !!e.altKey === alt &&
    !!e.metaKey === meta
  );
}
