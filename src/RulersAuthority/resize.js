// ═══════════════════════════════════════════════════════════════════════════
// Resize Handle System (CollapsibleUI pattern)
// ═══════════════════════════════════════════════════════════════════════════
//
// Resize handles are ::before pseudo-elements on the panel itself.
// mousedown on the panel edge -> track mousemove -> mouseup commits width.
// CSS for handles is in styles.js buildCSS().

import { PANEL_DEFS, RA_RESIZE_MIN_WIDTH, RA_SETTINGS_OPEN_CLASS } from "./constants";

/**
 * Sets up mousedown/mousemove/mouseup handlers for panel resize dragging.
 * @param {RulersAuthority} ctx - plugin instance
 */
export function setupResizeHandlers(ctx) {
  if (!ctx._controller) return;
  const signal = ctx._controller.signal;

  // ── mousedown: detect drag start (on document for full coverage) ──
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const target = e.target;

    // Check if target matches any panel's resize handle zone
    for (const panelName of Object.keys(PANEL_DEFS)) {
      if (panelName === "sidebar" && document.body.classList.contains(RA_SETTINGS_OPEN_CLASS)) continue;
      const panelEl = ctx._findPanelElement(panelName);
      if (!panelEl) continue;

      // The ::before pseudo-element click registers on the parent element
      if (target === panelEl || target.parentElement === panelEl) {
        const rect = panelEl.getBoundingClientRect();
        // Only trigger if click is near the resize edge (left edge for right panels, right edge for sidebar)
        const isLeftEdge = panelName !== "sidebar" && e.clientX <= rect.left + 12;
        const isRightEdge = panelName === "sidebar" && e.clientX >= rect.right - 12;

        if (isLeftEdge || isRightEdge) {
          e.preventDefault();
          ctx._dragging = panelEl;
          ctx._dragPanel = panelName;
          panelEl.style.setProperty("transition", "none", "important");
          ctx.debugLog("Resize", `Started dragging ${panelName}`);
        }
      }
    }
  }, { passive: false, signal });

  // ── mousemove: update width while dragging (on document for full coverage) ──
  document.addEventListener("mousemove", (e) => {
    if (!ctx._dragging || !ctx._dragPanel) return;

    const rect = ctx._dragging.getBoundingClientRect();
    let width;

    if (ctx._dragPanel === "sidebar") {
      // Sidebar: cursor X minus left edge
      width = e.clientX - rect.left;
    } else {
      // Right-side panels: right edge minus cursor X
      width = rect.right - e.clientX;
    }

    // Clamp: min 80px, max 60vw
    width = Math.max(RA_RESIZE_MIN_WIDTH, Math.min(width, window.innerWidth * 0.6));

    ctx._dragging.style.setProperty("width", `${width}px`, "important");
    ctx._dragging.style.setProperty("max-width", `${width}px`, "important");
    ctx._dragging.style.setProperty("min-width", `${width}px`, "important");
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
