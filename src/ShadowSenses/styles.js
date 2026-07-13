function buildPortalTransitionCSS() {
  return `
/* Portal transition CSS (overlay/canvas/shard) moved to
   ShadowPortalCore/transition-css.js — injected ONCE via the portal-core
   consumer refcount instead of duplicated per-plugin (2026-07-13). */
`;
}

function buildCSS() {
  return `
${buildPortalTransitionCSS()}

/* ── SL-themed scrollbar for the header popup (overrides macOS default) ──── */
#shadow-senses-header-popup::-webkit-scrollbar {
  width: 9px;
}
#shadow-senses-header-popup::-webkit-scrollbar-track {
  background: rgba(8, 8, 13, 0.6);
}
#shadow-senses-header-popup::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(138, 43, 226, 0.6) 0%, rgba(138, 43, 226, 0.38) 100%);
  border: 1px solid rgba(138, 43, 226, 0.35);
  border-radius: 2px;
}
#shadow-senses-header-popup::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, rgba(186, 85, 211, 0.75) 0%, rgba(138, 43, 226, 0.5) 100%);
}

/* ── Font Override ───────────────────────────────────────────────────────── */

/* Brand font: scoped to the panel TITLE only.
   Previous version cascaded the chunky Persona-5 'Friend or Foe BB' onto
   every descendant via .shadow-senses-panel * { ... !important }. That
   wide-letter-form font extended each header span's glyph advance past
   the flex gap, smushing username/server/channel/timestamp together
   despite the gap rule. Defeating the cascade also lets future inline
   style props win without needing !important.
   Body content now inherits Discord's gg sans system font for legibility. */
.shadow-senses-panel-title,
.shadow-senses-widget-label,
.shadow-senses-brand-font {
  font-family: 'Friend or Foe BB', 'gg sans', sans-serif !important;
  letter-spacing: 0.02em;
}

.shadow-senses-panel,
.shadow-senses-widget,
#shadow-senses-header-popup,
.shadow-senses-feed-card,
.shadow-senses-deploy-row {
  font-family: 'gg sans', 'Helvetica Neue', system-ui, sans-serif;
}

/* ─── Shadow Senses Widget ──────────────────────────────────────────────── */

.shadow-senses-widget {
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(138, 43, 226, 0.05));
  border: 1px solid rgba(138, 43, 226, 0.4);
  border-radius: 2px;
  padding: 8px 10px;
  margin: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.shadow-senses-widget:hover {
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.25), rgba(138, 43, 226, 0.1));
  border-color: #8a2be2;
}

.shadow-senses-widget-label {
  color: #8a2be2;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.shadow-senses-widget-badge {
  background: #8a2be2;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 2px;
  min-width: 20px;
  text-align: center;
}

/* ─── Overlay ───────────────────────────────────────────────────────────── */

.shadow-senses-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(5px);
}

/* ─── Panel ─────────────────────────────────────────────────────────────── */

.shadow-senses-panel {
  background: rgba(10, 10, 16, 0.98);
  border: 1px solid rgba(138, 43, 226, 0.4);
  border-radius: 2px;
  width: 700px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(138, 43, 226, 0.3);
}

.shadow-senses-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(138, 43, 226, 0.3);
}

.shadow-senses-panel-title {
  color: #8a2be2;
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.shadow-senses-close-btn {
  background: transparent;
  border: none;
  color: rgba(181, 186, 193, 0.5);
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 2px;
  transition: color 0.15s ease;
}

.shadow-senses-close-btn:hover {
  color: #fff;
}

/* ─── Tabs ──────────────────────────────────────────────────────────────── */

.shadow-senses-tabs {
  display: flex;
  border-bottom: 1px solid rgba(138, 43, 226, 0.2);
  padding: 0 20px;
}

.shadow-senses-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(181, 186, 193, 0.5);
  font-size: 13px;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.shadow-senses-tab:hover {
  color: rgba(181, 186, 193, 0.7);
}

.shadow-senses-tab.active {
  color: #8a2be2;
  border-bottom-color: #8a2be2;
}

/* ─── Feed Card ─────────────────────────────────────────────────────────── */

.shadow-senses-feed-card {
  background: rgba(38, 28, 60, 0.85);
  border: 1px solid rgba(138, 43, 226, 0.32);
  border-radius: 2px;
  padding: 12px 14px;
  margin: 0 0 10px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(138, 43, 226, 0.12), 0 2px 6px rgba(0, 0, 0, 0.45);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

/* ID-scoped to win against any external !important rule that might
   set background on #app-mount div or similar generic selectors.
   Specificity (1,1,0) beats (1,0,1). */
#shadow-senses-header-popup .shadow-senses-feed-card {
  background: rgba(38, 28, 60, 0.85) !important;
  border: 1px solid rgba(138, 43, 226, 0.32) !important;
  border-radius: 2px !important;
  padding: 12px 14px !important;
  margin: 0 0 10px !important;
  box-shadow: inset 0 1px 0 rgba(138, 43, 226, 0.12), 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

#shadow-senses-header-popup .shadow-senses-feed-card:hover {
  background: rgba(52, 38, 80, 0.92) !important;
  border-color: rgba(138, 43, 226, 0.55) !important;
}

.shadow-senses-feed-card:hover {
  background: rgba(40, 28, 65, 0.7);
  border-color: rgba(138, 43, 226, 0.4);
  transform: translateX(1px);
}

.shadow-senses-feed-card-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  margin-bottom: 6px;
}

.shadow-senses-feed-content {
  font-family: 'gg sans', system-ui, sans-serif !important;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.45;
  color: #e8e3f5;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  margin: 2px 0 0;
}

/* ─── ID-scoped overrides — defeat SoloLevelingTheme global font rules ─────
   Two competing !important font-family rules ship from theme assets:
     1. SoloLeveling-ClearVision.theme.css :
          *:where(...) { font-family: 'Friend or Foe BB' !important }
        Specificity (0,0,0) due to :where() — easy to beat.
     2. SoloLevelingTheme.plugin.js :
          #app-mount div { font-family: 'Friend or Foe BB' !important }
        Specificity (1,0,1) + !important — this is the one that was
        keeping the message bodies in chunky bold Persona-5 despite the
        plain .shadow-senses-feed-content rule above (only 0,0,1,0).
   Prefixing with the popup ID raises specificity to (1,1,1) which beats
   (1,0,1). Same trick used for header bits + "First: ..." quote so the
   theme's div rule can't reach into the popup. */
#shadow-senses-header-popup .shadow-senses-feed-content,
#shadow-senses-header-popup .shadow-senses-feed-card-header,
#shadow-senses-header-popup .shadow-senses-feed-card-header *,
#shadow-senses-header-popup .shadow-senses-empty,
#shadow-senses-header-popup .shadow-senses-footer,
#shadow-senses-header-popup .shadow-senses-footer *,
#shadow-senses-header-popup .shadow-senses-tabs *,
#shadow-senses-header-popup .shadow-senses-deploy-row,
#shadow-senses-header-popup .shadow-senses-deploy-row *,
#shadow-senses-header-popup .shadow-senses-keyword-target,
#shadow-senses-header-popup .shadow-senses-keyword-target * {
  font-family: 'gg sans', 'Helvetica Neue', system-ui, sans-serif !important;
  font-weight: inherit !important;
  letter-spacing: normal !important;
}

/* The message body specifically wants 400 weight — defeating both theme
   font-family AND any inherited bold from the cascade. */
#shadow-senses-header-popup .shadow-senses-feed-content {
  font-weight: 400 !important;
}

/* ─── Deploy / Recall ───────────────────────────────────────────────────── */

.shadow-senses-deploy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(20, 20, 40, 0.4);
  border-radius: 2px;
  margin: 4px 0;
  border: 1px solid rgba(138, 43, 226, 0.1);
}

.shadow-senses-deploy-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ccc;
  font-size: 13px;
}

.shadow-senses-deploy-rank {
  font-weight: 700;
  font-size: 12px;
  min-width: 24px;
  text-align: center;
}

.shadow-senses-deploy-arrow {
  color: #666;
  font-size: 14px;
}

.shadow-senses-deploy-target {
  color: #8a2be2;
  font-weight: 600;
}

.shadow-senses-recall-btn {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid #ef4444;
  color: #ef4444;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.shadow-senses-recall-btn:hover {
  background: rgba(239, 68, 68, 0.3);
}

.shadow-senses-deploy-btn {
  background: rgba(138, 43, 226, 0.15);
  border: 1px solid rgba(138, 43, 226, 0.4);
  color: #8a2be2;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 2px;
  cursor: pointer;
  width: 100%;
  text-align: center;
  transition: background 0.15s ease;
}

.shadow-senses-deploy-btn:hover {
  background: rgba(138, 43, 226, 0.3);
}

/* ─── Keyword Alerts ───────────────────────────────────────────────────── */

.shadow-senses-keyword-target {
  background: linear-gradient(180deg, rgba(12, 9, 20, 0.92), rgba(8, 6, 14, 0.95));
  border: 1px solid rgba(138, 43, 226, 0.35);
  border-radius: 2px;
  padding: 10px 12px;
  margin: 6px 0;
  box-shadow: inset 0 0 0 1px rgba(138, 43, 226, 0.06), 0 0 14px rgba(138, 43, 226, 0.12);
}

.shadow-senses-keyword-target-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.shadow-senses-keyword-count {
  color: #d3b7ff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border: 1px solid rgba(138, 43, 226, 0.48);
  border-radius: 2px;
  background: rgba(138, 43, 226, 0.2);
  white-space: nowrap;
  text-shadow: 0 0 6px rgba(138, 43, 226, 0.45);
}

.shadow-senses-keyword-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 24px;
}

.shadow-senses-keyword-empty {
  color: #9f8fbd;
  font-size: 12px;
  font-style: italic;
}

.shadow-senses-keyword-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #f2e9ff;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(138, 43, 226, 0.55);
  border-radius: 2px;
  background: linear-gradient(180deg, rgba(138, 43, 226, 0.34), rgba(80, 28, 146, 0.28));
  padding: 2px 8px;
  box-shadow: 0 0 8px rgba(138, 43, 226, 0.24);
}

.shadow-senses-keyword-chip-remove {
  border: none;
  background: transparent;
  color: #d8b8ff;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  font-size: 14px;
}

.shadow-senses-keyword-chip-remove:hover {
  color: #fff;
}

.shadow-senses-keyword-input-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  margin-top: 9px;
}

.shadow-senses-keyword-input {
  width: 100%;
  padding: 7px 9px;
  border-radius: 2px;
  border: 1px solid rgba(138, 43, 226, 0.5);
  background: rgba(5, 4, 10, 0.9);
  color: #ede3ff;
  font-size: 12px;
  box-sizing: border-box;
  outline: none;
  box-shadow: inset 0 0 0 1px rgba(138, 43, 226, 0.14);
}

.shadow-senses-keyword-input:focus {
  border-color: rgba(186, 85, 211, 0.9);
  box-shadow: inset 0 0 0 1px rgba(186, 85, 211, 0.24), 0 0 0 1px rgba(138, 43, 226, 0.24);
}

.shadow-senses-keyword-input::placeholder {
  color: #9c8db7;
}

.shadow-senses-keyword-add-btn {
  width: auto;
  padding: 6px 10px;
}

.shadow-senses-keyword-clear-btn {
  padding: 6px 10px;
  background: rgba(138, 43, 226, 0.12);
  border: 1px solid rgba(186, 85, 211, 0.7);
  color: #c89cff;
}

.shadow-senses-keyword-clear-btn:hover {
  background: rgba(138, 43, 226, 0.28);
  color: #fff;
}

/* ─── Footer ────────────────────────────────────────────────────────────── */

.shadow-senses-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid rgba(138, 43, 226, 0.2);
  color: #666;
  font-size: 11px;
}

/* ─── Empty State ───────────────────────────────────────────────────────── */

.shadow-senses-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(181, 186, 193, 0.55) !important;
  font-size: 13px !important;
  padding: 36px 24px !important;
  text-align: center !important;
  font-style: italic !important;
  letter-spacing: 0.02em !important;
  /* Override the global Persona-5 chunky font (line ~206) for empty states —
     it makes the prompt text hard to read at small sizes on dark bg. */
  font-family: 'gg sans', system-ui, sans-serif !important;
  font-weight: 400 !important;
}

/* ─── Igris Report Modal — opaque fill ────────────────────────────────── */
/* The body content carries its own background, but the modal's outer
   frame (header with title, footer with action buttons) is transparent
   by default and lets Discord UI bleed through. Scope-target only
   modals that contain the marker class so other BD/Discord modals
   are unaffected.

   IMPORTANT — close-animation alignment. Discord runs its modal close
   animation (opacity 1 → 0, ~150ms) on the INNER modal-box element,
   not on the outer [role="dialog"] wrapper. If we paint the outer
   wrapper solid, the inner box fades to opacity 0 while the outer
   wrapper's solid fill stays visible until React unmounts the DOM —
   that's the 1-2 frame "afterimage" the user was seeing when clicking
   Understood. So we paint ONLY:
     1. The direct child (the modal-box itself, which fades)
     2. Inner header / footer / content (also fade with the box)
   The outer [role="dialog"] is left transparent so when the box
   fades, the entire fill leaves the screen at the same instant. */

[role="dialog"]:has(.shadowsenses-igris-report-modal) > * {
  background-color: #0d0d18 !important;
}
[role="dialog"]:has(.shadowsenses-igris-report-modal) [class*="header"],
[role="dialog"]:has(.shadowsenses-igris-report-modal) [class*="footer"],
[role="dialog"]:has(.shadowsenses-igris-report-modal) [class*="content"] {
  background-color: #0d0d18 !important;
}
/* IMPORTANT — undo the body fill INSIDE buttons. Discord wraps button
   labels in nested divs whose classes start with "contents-" (plural),
   which the [class*="content"] selector above accidentally matches.
   Higher specificity here neutralises the dark fill bleed onto labels. */
[role="dialog"]:has(.shadowsenses-igris-report-modal) button,
[role="dialog"]:has(.shadowsenses-igris-report-modal) button *,
[role="dialog"]:has(.shadowsenses-igris-report-modal) button [class*="content"] {
  background-color: transparent !important;
}
/* Footer flex-gap so Cancel/Understood don't touch — using button + button
   sibling combinator failed because Discord wraps each button in its own
   div. Apply to any flex/grid footer container that holds the buttons. */
[role="dialog"]:has(.shadowsenses-igris-report-modal) [class*="footer"] {
  gap: 12px !important;
  column-gap: 12px !important;
}

/* Buttons in the Igris modal — SoloLeveling purple aesthetic.
   Discord's default brand-colored button (Understood) gets the solid
   gradient treatment; any auxiliary buttons (Cancel etc.) get the
   subtle outline variant. */

[role="dialog"]:has(.shadowsenses-igris-report-modal) button {
  background: rgba(138, 43, 226, 0.14) !important;
  border: 1px solid rgba(138, 43, 226, 0.45) !important;
  color: #d6bcff !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em !important;
  border-radius: 0 !important;
  transition: background 120ms ease, border-color 120ms ease,
              box-shadow 120ms ease, transform 80ms ease !important;
}
[role="dialog"]:has(.shadowsenses-igris-report-modal) button:hover {
  background: rgba(138, 43, 226, 0.22) !important;
  border-color: rgba(138, 43, 226, 0.65) !important;
}

/* Primary confirm ("Understood") — Discord brand class is the canonical
   confirm marker. Override its blue with the Igris purple gradient.
   No inset shadow — keep the fill flat to match the user's preference. */
[role="dialog"]:has(.shadowsenses-igris-report-modal) button[class*="colorBrand"],
[role="dialog"]:has(.shadowsenses-igris-report-modal) button[class*="confirm"],
[role="dialog"]:has(.shadowsenses-igris-report-modal) button[type="submit"] {
  background: linear-gradient(120deg,
    rgba(138, 43, 226, 0.55),
    rgba(168, 80, 255, 0.7)) !important;
  border: 1px solid rgba(180, 110, 255, 0.85) !important;
  color: #ffffff !important;
  text-shadow: 0 0 6px rgba(168, 80, 255, 0.55) !important;
  box-shadow: 0 0 12px rgba(138, 43, 226, 0.45) !important;
  border-radius: 0 !important;
}
[role="dialog"]:has(.shadowsenses-igris-report-modal) button[class*="colorBrand"]:hover,
[role="dialog"]:has(.shadowsenses-igris-report-modal) button[class*="confirm"]:hover,
[role="dialog"]:has(.shadowsenses-igris-report-modal) button[type="submit"]:hover {
  background: linear-gradient(120deg,
    rgba(168, 80, 255, 0.7),
    rgba(196, 120, 255, 0.85)) !important;
  border-color: rgba(210, 140, 255, 1) !important;
  box-shadow: 0 0 18px rgba(168, 80, 255, 0.7) !important;
}
[role="dialog"]:has(.shadowsenses-igris-report-modal) button[class*="colorBrand"]:active,
[role="dialog"]:has(.shadowsenses-igris-report-modal) button[class*="confirm"]:active,
[role="dialog"]:has(.shadowsenses-igris-report-modal) button[type="submit"]:active {
  transform: translateY(1px) !important;
}

/* ─── Header-popup hardening — overrides Discord/theme button defaults ─────
   The header-anchored popup (#shadow-senses-header-popup) hosts the panel
   in embedded mode — no full-screen overlay wrapper. Discord's default
   <button> styling and SoloLevelingTheme can leak white pill backgrounds
   onto our close-btn / tab buttons; force the SL palette here with
   high specificity (#id .class) and !important. */

#shadow-senses-header-popup .shadow-senses-panel--embedded {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  width: 100% !important;
  max-width: none !important;
  max-height: none !important;
  box-shadow: none !important;
}

#shadow-senses-header-popup .shadow-senses-panel-title {
  color: #d4b0ff !important;
  font-weight: 700 !important;
}

#shadow-senses-header-popup .shadow-senses-close-btn,
#shadow-senses-header-popup .shadow-senses-tab,
#shadow-senses-header-popup .shadow-senses-deploy-btn,
#shadow-senses-header-popup .shadow-senses-recall-btn {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}

#shadow-senses-header-popup .shadow-senses-close-btn {
  color: rgba(181, 186, 193, 0.7) !important;
  font-size: 18px !important;
  padding: 4px 8px !important;
}

#shadow-senses-header-popup .shadow-senses-close-btn:hover {
  color: #fff !important;
  background: rgba(138, 43, 226, 0.15) !important;
}

#shadow-senses-header-popup .shadow-senses-tab {
  color: rgba(181, 186, 193, 0.6) !important;
  border-bottom: 2px solid transparent !important;
  padding: 10px 16px !important;
}

#shadow-senses-header-popup .shadow-senses-tab:hover {
  color: rgba(181, 186, 193, 0.9) !important;
  background: rgba(138, 43, 226, 0.08) !important;
}

#shadow-senses-header-popup .shadow-senses-tab.active {
  color: #d4b0ff !important;
  border-bottom-color: #8a2be2 !important;
  background: rgba(138, 43, 226, 0.12) !important;
}

#shadow-senses-header-popup .shadow-senses-tabs {
  border-bottom: 1px solid rgba(138, 43, 226, 0.25) !important;
  padding: 0 16px !important;
}

#shadow-senses-header-popup .shadow-senses-empty {
  color: rgba(181, 186, 193, 0.6) !important;
  text-align: center !important;
  padding: 32px 20px !important;
}

#shadow-senses-header-popup .shadow-senses-footer {
  color: rgba(181, 186, 193, 0.55) !important;
  border-top: 1px solid rgba(138, 43, 226, 0.2) !important;
  padding: 10px 16px !important;
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  gap: 12px !important;
  font-size: 11px !important;
}

#shadow-senses-header-popup .shadow-senses-footer span {
  white-space: nowrap !important;
}
`;
}

module.exports = { buildCSS };
