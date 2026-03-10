/**
 * Shared hotkey utilities with PluginUtils fallback.
 * Replaces the duplicated isEditableTarget, parseHotkey, matchesHotkey
 * patterns found in CSSPicker, ShadowStep, RulersAuthority.
 *
 * Usage:
 *   import { isEditableTarget, matchesHotkey } from "../shared/hotkeys";
 *   if (isEditableTarget(e.target)) return;
 *   if (matchesHotkey(e, "Ctrl+Shift+P")) { ... }
 */

/**
 * Check if the event target is an editable element (input, textarea, contentEditable).
 * @param {Element} target
 * @returns {boolean}
 */
function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase?.() || "";
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    !!target.isContentEditable
  );
}

/**
 * Parse a hotkey string like "Ctrl+Shift+P" into a normalized spec.
 * @param {string} hotkey
 * @returns {{ key: string, ctrl: boolean, shift: boolean, alt: boolean, meta: boolean }}
 */
function parseHotkey(hotkey) {
  const parts = String(hotkey || "")
    .split("+")
    .map((p) => p.trim().toLowerCase());
  return {
    key: parts.filter(
      (p) => p !== "ctrl" && p !== "shift" && p !== "alt" && p !== "meta" && p !== "cmd"
    )[0] || "",
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    meta: parts.includes("meta") || parts.includes("cmd"),
  };
}

/**
 * Check if a keyboard event matches a hotkey string.
 * @param {KeyboardEvent} event
 * @param {string} hotkey - e.g. "Ctrl+Shift+P"
 * @returns {boolean}
 */
function matchesHotkey(event, hotkey) {
  if (!event || !hotkey) return false;
  const spec = parseHotkey(hotkey);
  if (!spec.key) return false;
  return (
    event.key.toLowerCase() === spec.key &&
    event.ctrlKey === spec.ctrl &&
    event.shiftKey === spec.shift &&
    event.altKey === spec.alt &&
    event.metaKey === spec.meta
  );
}

module.exports = { isEditableTarget, parseHotkey, matchesHotkey };
