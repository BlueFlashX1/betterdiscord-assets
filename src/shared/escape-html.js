/**
 * HTML-escape for innerHTML string building.
 * Consolidates 5 per-plugin copies (EquipmentManager, ItemVault, TitleManager,
 * Dungeons ui-header-widget/ui-bossbar) — ponytail audit 2026-07-29.
 * Superset variant: escapes the apostrophe too (the strictest of the five
 * originals); &#39; renders identically to ' in every HTML context.
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = { escapeHtml };
