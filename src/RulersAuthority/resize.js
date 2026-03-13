// ═══════════════════════════════════════════════════════════════════════════
// Resize Handle System (CollapsibleUI pattern)
// ═══════════════════════════════════════════════════════════════════════════
//
// Resize handles are ::before pseudo-elements on the panel itself.
// mousedown on the panel edge -> track mousemove -> mouseup commits width.
// CSS for handles is in styles.js buildCSS().

import { PANEL_DEFS, RA_RESIZE_MIN_WIDTH, RA_SETTINGS_OPEN_CLASS } from "./constants";

function isResizeEdgeHit(panelName, rect, clientX) {
  const isLeftEdge = panelName !== "sidebar" && clientX <= rect.left + 12;
  const isRightEdge = panelName === "sidebar" && clientX >= rect.right - 12;
  return isLeftEdge || isRightEdge;
}

function shouldSkipPanelResizeStart(panelName) {
  return panelName === "sidebar" && document.body.classList.contains(RA_SETTINGS_OPEN_CLASS);
}

function tryStartPanelDrag(ctx, event, target, panelName) {
  if (ctx.isPanelGated?.(panelName)) return false;
  if (shouldSkipPanelResizeStart(panelName)) return false;
  const panelEl = ctx._findPanelElement(panelName);
  if (!panelEl) return false;
  const clickedPanel = target === panelEl || target.parentElement === panelEl;
  if (!clickedPanel) return false;
  const rect = panelEl.getBoundingClientRect();
  if (!isResizeEdgeHit(panelName, rect, event.clientX)) return false;

  event.preventDefault();
  ctx._dragging = panelEl;
  ctx._dragPanel = panelName;
  panelEl.style.setProperty("transition", "none", "important");
  ctx.debugLog("Resize", `Started dragging ${panelName}`);
  return true;
}

function handleResizeMouseDown(ctx, event) {
  if (event.button !== 0) return;
  const target = event.target;
  for (const panelName of Object.keys(PANEL_DEFS)) {
    if (tryStartPanelDrag(ctx, event, target, panelName)) return;
  }
}

/**
 * Sets up mousedown/mousemove/mouseup handlers for panel resize dragging.
 * @param {RulersAuthority} ctx - plugin instance
 */
export function setupResizeHandlers(ctx) {
  if (!ctx._controller) return;
  const signal = ctx._controller.signal;

  // ── mousedown: detect drag start (on document for full coverage) ──
  document.addEventListener("mousedown", (e) => {
    handleResizeMouseDown(ctx, e);
  }, { passive: false, signal });

  // ── mousemove: update width while dragging (RAF-throttled for perf) ──
  let _resizeRafId = null;
  document.addEventListener("mousemove", (e) => {
    if (!ctx._dragging || !ctx._dragPanel) return;
    if (_resizeRafId) return; // Already scheduled

    _resizeRafId = requestAnimationFrame(() => {
      _resizeRafId = null;
      if (!ctx._dragging || !ctx._dragPanel) return;

      const rect = ctx._dragging.getBoundingClientRect();
      let width;

      if (ctx._dragPanel === "sidebar") {
        width = e.clientX - rect.left;
      } else {
        width = rect.right - e.clientX;
      }

      width = Math.max(RA_RESIZE_MIN_WIDTH, Math.min(width, window.innerWidth * 0.6));

      ctx._dragging.style.setProperty("width", `${width}px`, "important");
      ctx._dragging.style.setProperty("max-width", `${width}px`, "important");
      ctx._dragging.style.setProperty("min-width", `${width}px`, "important");
    });
  }, { passive: true, signal });

  // ── mouseup: commit width and restore transitions (on document for full coverage) ──
  document.addEventListener("mouseup", (e) => {
    if (!ctx._dragging || !ctx._dragPanel) return;
    if (e.button !== 0) return; // Only commit on left-click release

    const panelName = ctx._dragPanel;
    const dragged = ctx._dragging;

    // Commit dragged width
    ctx.settings.panels[panelName].width = parseInt(dragged.style.width, 10) || ctx.settings.defaultWidths[panelName];

    // Remove inline overrides, let CSS vars take over
    dragged.style.removeProperty("width");
    dragged.style.removeProperty("max-width");
    dragged.style.removeProperty("min-width");

    ctx.saveSettings();
    ctx.updateCSSVars();

    // Restore transitions after a tick
    setTimeout(() => {
      dragged.style.removeProperty("transition");
    }, ctx.settings.transitionSpeed);

    ctx._dragging = null;
    ctx._dragPanel = null;
    ctx.debugLog("Resize", `Committed ${panelName} width: ${ctx.settings.panels[panelName].width}px`);
  }, { passive: true, signal });
}

/**
 * Remove all inline resize styles from panel elements.
 * @param {RulersAuthority} ctx - plugin instance
 */
export function removeAllResizeStyles(ctx) {
  for (const panelName of Object.keys(PANEL_DEFS)) {
    const el = ctx._findPanelElement(panelName);
    if (el) {
      el.style.removeProperty("width");
      el.style.removeProperty("max-width");
      el.style.removeProperty("min-width");
      el.style.removeProperty("transition");
    }
  }
}
