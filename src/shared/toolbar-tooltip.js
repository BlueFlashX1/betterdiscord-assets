/**
 * Shared toolbar tooltip utility for header icon plugins.
 *
 * Provides a themed tooltip (matching .sl-toolbar-tip CSS) that floats below
 * toolbar icons (matching Discord's native tooltip position) without the ugly
 * native browser title tooltip.
 *
 * Usage:
 *   const { showToolbarTooltip, hideToolbarTooltip, removeToolbarTooltip, ensureTooltipCSS } = require('../shared/toolbar-tooltip');
 *
 *   // In icon creation:
 *   ensureTooltipCSS();
 *   icon.addEventListener('mouseenter', () => showToolbarTooltip(icon, 'sl-toolbar-tip-em', 'Equipment Manager'));
 *   icon.addEventListener('mouseleave', () => hideToolbarTooltip('sl-toolbar-tip-em'));
 *
 *   // In stop():
 *   removeToolbarTooltip('sl-toolbar-tip-em');
 */

const SHARED_CSS_ID = "sl-toolbar-tip-shared";

const TOOLTIP_CSS = `
  /* ── Shared Toolbar Tooltip ────────────────────────────────────────── */
  .sl-toolbar-tip {
    position: fixed;
    transform: translateX(-50%);
    padding: 8px 12px;
    background: rgb(10, 10, 15);
    border: 1px solid rgba(138, 43, 226, 0.4);
    border-radius: 2px;
    box-shadow: 0 2px 12px rgba(138, 43, 226, 0.25), 0 0 20px rgba(138, 43, 226, 0.08);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.3px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.1s ease;
    z-index: 999999;
  }
  .sl-toolbar-tip--visible {
    opacity: 1;
  }
  .sl-toolbar-tip::after {
    content: '';
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-bottom-color: rgba(138, 43, 226, 0.4);
  }
`;

/**
 * Inject the shared tooltip CSS if not already present.
 * Safe to call multiple times — guards against double-injection.
 */
function ensureTooltipCSS() {
  if (document.getElementById(SHARED_CSS_ID)) return;
  try {
    BdApi.DOM.addStyle(SHARED_CSS_ID, TOOLTIP_CSS);
  } catch (_) {
    // Fallback for environments where BdApi.DOM is unavailable
    const style = document.createElement("style");
    style.id = SHARED_CSS_ID;
    style.textContent = TOOLTIP_CSS;
    (document.head || document.documentElement).appendChild(style);
  }
}

/**
 * Show a themed toolbar tooltip above an icon element.
 *
 * Matches ShadowExchange's _showToolbarTooltip exactly, including the
 * cached-height optimisation to avoid repeated offsetHeight reflows.
 *
 * @param {HTMLElement} icon      - The toolbar icon element
 * @param {string}      tooltipId - Unique DOM ID for this tooltip (e.g. "sl-toolbar-tip-iv")
 * @param {string}      label     - Text to display
 */
function showToolbarTooltip(icon, tooltipId, label) {
  let tip = document.getElementById(tooltipId);
  if (!tip) {
    tip = document.createElement("div");
    tip.id = tooltipId;
    tip.className = "sl-toolbar-tip";
    (document.body || document.documentElement).appendChild(tip);
  }

  const rect = icon.getBoundingClientRect();
  tip.textContent = label;

  // PERF: Cache tooltip height after first render to avoid repeated offsetHeight reflows.
  // Invalidate on content change (label as proxy).
  if (!tip._cachedHeight || tip._lastLabel !== label) {
    tip._cachedHeight = tip.offsetHeight;
    tip._lastLabel = label;
  }

  tip.style.top = `${rect.bottom + 8}px`;
  tip.style.left = `${rect.left + rect.width / 2}px`;
  tip.classList.add("sl-toolbar-tip--visible");
}

/**
 * Hide a toolbar tooltip (fade out via CSS transition).
 * The element remains in the DOM for reuse.
 *
 * @param {string} tooltipId - The tooltip's DOM ID
 */
function hideToolbarTooltip(tooltipId) {
  const tip = document.getElementById(tooltipId);
  if (tip) tip.classList.remove("sl-toolbar-tip--visible");
}

/**
 * Completely remove a toolbar tooltip from the DOM.
 * Call this in stop() to clean up after a plugin is disabled.
 *
 * @param {string} tooltipId - The tooltip's DOM ID
 */
function removeToolbarTooltip(tooltipId) {
  const tip = document.getElementById(tooltipId);
  if (tip) tip.remove();
}

module.exports = {
  showToolbarTooltip,
  hideToolbarTooltip,
  removeToolbarTooltip,
  ensureTooltipCSS,
};
