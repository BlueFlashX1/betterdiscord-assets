function buildPortalTransitionCSS() {
  return `
@keyframes ss-mist-css-overlay {
  0% { opacity: 0; }
  14% { opacity: 0.98; }
  56% { opacity: 1; }
  74% { opacity: 0.82; }
  100% { opacity: 0; }
}

@keyframes ss-mist-css-plume {
  0% {
    opacity: 0;
    transform: translate3d(-2%, 4%, 0) scale(1.12) rotate(-3deg);
  }
  22% {
    opacity: 0.9;
    transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
  }
  62% {
    opacity: 0.74;
    transform: translate3d(3%, -2%, 0) scale(1.08) rotate(2deg);
  }
  100% {
    opacity: 0;
    transform: translate3d(6%, -4%, 0) scale(1.18) rotate(4deg);
  }
}

@keyframes ss-mist-css-abyss {
  0% {
    opacity: 0;
    transform: translate3d(2%, -2%, 0) scale(1.05);
  }
  20% {
    opacity: 0.93;
    transform: translate3d(0, 0, 0) scale(1);
  }
  68% {
    opacity: 0.78;
    transform: translate3d(-2%, 1%, 0) scale(1.08);
  }
  100% {
    opacity: 0.12;
    transform: translate3d(-3%, 2%, 0) scale(1.14);
  }
}

@keyframes ss-mist-css-mist {
  0% {
    opacity: 0;
    transform: translate3d(-2%, 3%, 0) scale(calc(var(--ss-ms, 1) * 0.72)) rotate(calc(var(--ss-mr, 0deg) * -0.2));
  }
  26% {
    opacity: 0.86;
    transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
  }
  68% {
    opacity: 0.64;
    transform: translate3d(calc(var(--ss-mx, 0px) * 0.44), calc(var(--ss-my, 0px) * 0.44), 0) scale(calc(var(--ss-ms, 1) * 1.06)) rotate(calc(var(--ss-mr, 0deg) * 0.5));
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--ss-mx, 0px), var(--ss-my, 0px), 0) scale(calc(var(--ss-ms, 1) * 1.2)) rotate(var(--ss-mr, 0deg));
  }
}

@keyframes ss-mist-css-shard {
  0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(0.3); opacity: 0; }
  22% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); opacity: 0.72; }
  100% {
    transform: translate3d(var(--ss-shard-x, 0px), var(--ss-shard-y, -80px), 0) rotate(var(--ss-shard-r, 0deg)) scale(0.2);
    opacity: 0;
  }
}

.ss-transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  pointer-events: none;
  overflow: hidden;
  opacity: 0;
  background: transparent;
  will-change: opacity;
}

.ss-transition-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  opacity: 1;
}

.ss-transition-plume,
.ss-transition-abyss,
.ss-mist,
.ss-shard {
  position: absolute;
  pointer-events: none;
}

.ss-transition-plume {
  inset: -18%;
  opacity: 0;
  transform: translate3d(-2%, 4%, 0) scale(1.12) rotate(-3deg);
  background:
    radial-gradient(65% 48% at 24% 38%, rgba(88, 88, 100, 0.32) 0%, rgba(38, 38, 48, 0.22) 48%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(70% 58% at 74% 62%, rgba(66, 66, 78, 0.3) 0%, rgba(24, 24, 32, 0.2) 52%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(85% 70% at 52% 50%, rgba(0, 0, 0, 0.88) 18%, rgba(0, 0, 0, 0) 100%);
  filter: blur(20px) saturate(0.8);
  will-change: transform, opacity;
}

.ss-transition-abyss {
  inset: -22%;
  opacity: 0;
  transform: translate3d(2%, -2%, 0) scale(1.05);
  background: radial-gradient(95% 84% at 42% 46%, rgba(0, 0, 0, 0.96) 22%, rgba(0, 0, 0, 0.78) 58%, rgba(0, 0, 0, 0.2) 78%, rgba(0, 0, 0, 0) 100%);
  filter: blur(12px);
  will-change: transform, opacity;
}

.ss-mist {
  inset: -30%;
  background:
    radial-gradient(50% 42% at 24% 36%, rgba(84, 84, 96, 0.36) 0%, rgba(34, 34, 44, 0.26) 46%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(56% 46% at 74% 58%, rgba(72, 72, 84, 0.34) 0%, rgba(28, 28, 38, 0.24) 48%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(60% 50% at 52% 52%, rgba(14, 14, 18, 0.72) 0%, rgba(0, 0, 0, 0) 100%);
  filter: blur(30px) saturate(0.78);
  opacity: 0;
  transform: translate3d(-2%, 3%, 0) scale(calc(var(--ss-ms, 1) * 0.72)) rotate(calc(var(--ss-mr, 0deg) * -0.2));
  will-change: transform, opacity;
}

.ss-shard {
  border-radius: 999px;
  transform-origin: center;
  background: linear-gradient(180deg, rgba(204, 188, 166, 0.78) 0%, rgba(96, 72, 54, 0.54) 52%, rgba(16, 10, 8, 0) 100%);
  box-shadow: 0 0 6px rgba(110, 82, 56, 0.28);
  opacity: 0;
  will-change: transform, opacity;
}

.ss-transition-overlay--waapi .ss-transition-plume,
.ss-transition-overlay--waapi .ss-transition-abyss,
.ss-transition-overlay--waapi .ss-mist,
.ss-transition-overlay--waapi .ss-shard {
  animation: none !important;
}

.ss-transition-overlay--css {
  background: radial-gradient(120% 95% at 50% 50%, rgba(8, 8, 12, 0.7) 30%, rgba(0, 0, 0, 0.88) 100%);
  animation: ss-mist-css-overlay var(--ss-total-duration, 1000ms) cubic-bezier(.2,.58,.2,1) forwards;
}

.ss-transition-overlay--css .ss-transition-plume {
  animation: ss-mist-css-plume calc(var(--ss-total-duration, 1000ms) + 120ms) cubic-bezier(.22,.61,.36,1) forwards;
}

.ss-transition-overlay--css .ss-transition-abyss {
  animation: ss-mist-css-abyss calc(var(--ss-total-duration, 1000ms) + 80ms) ease-out forwards;
}

.ss-transition-overlay--css .ss-mist {
  animation: ss-mist-css-mist calc(var(--ss-total-duration, 1000ms) + 180ms) cubic-bezier(.22,.61,.36,1) forwards;
  animation-delay: var(--ss-mist-delay, 0ms);
}

.ss-transition-overlay--css .ss-shard {
  animation: ss-mist-css-shard 900ms cubic-bezier(.22,.61,.36,1) forwards;
  animation-delay: var(--ss-delay, 0ms);
}

.ss-transition-overlay--reduced {
  background: rgba(0, 0, 0, 0.65);
}

.ss-transition-overlay--reduced .ss-transition-plume,
.ss-transition-overlay--reduced .ss-transition-abyss,
.ss-transition-overlay--reduced .ss-mist,
.ss-transition-overlay--reduced .ss-shard {
  display: none;
}
`;
}

function buildCSS() {
  return `
${buildPortalTransitionCSS()}

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
  font-family: var(--font-primary), 'gg sans', 'Helvetica Neue', sans-serif;
}

/* ─── Shadow Senses Widget ──────────────────────────────────────────────── */

.shadow-senses-widget {
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(138, 43, 226, 0.05));
  border: 1px solid #8a2be2;
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
  border-color: #a78bfa;
}

.shadow-senses-widget-label {
  color: #a78bfa;
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
  border: 1px solid #8a2be2;
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
  color: rgba(196, 181, 253, 0.5);
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
  color: rgba(196, 181, 253, 0.5);
  font-size: 13px;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.shadow-senses-tab:hover {
  color: rgba(196, 181, 253, 0.7);
}

.shadow-senses-tab.active {
  color: #8a2be2;
  border-bottom-color: #8a2be2;
}

/* ─── Feed Card ─────────────────────────────────────────────────────────── */

.shadow-senses-feed-card {
  background: rgba(30, 22, 50, 0.55);
  border: 1px solid rgba(167, 139, 250, 0.18);
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0 0 8px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(167, 139, 250, 0.08), 0 1px 2px rgba(0, 0, 0, 0.4);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.shadow-senses-feed-card:hover {
  background: rgba(40, 28, 65, 0.7);
  border-color: rgba(167, 139, 250, 0.4);
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
  /* The single narrow !important here is justified — defeats any plugin
     descendant rule that might creep in. NOT a wildcard. */
  font-family: var(--font-primary), 'gg sans', sans-serif !important;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.45;
  color: #e8e3f5;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  margin: 2px 0 0;
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
  color: #a78bfa;
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
  border: 1px solid #8a2be2;
  color: #a78bfa;
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
  box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.06), 0 0 14px rgba(138, 43, 226, 0.12);
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
  border: 1px solid rgba(167, 139, 250, 0.55);
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
  color: rgba(196, 181, 253, 0.55) !important;
  font-size: 13px !important;
  padding: 36px 24px !important;
  text-align: center !important;
  font-style: italic !important;
  letter-spacing: 0.02em !important;
  /* Override the global Persona-5 chunky font (line ~206) for empty states —
     it makes the prompt text hard to read at small sizes on dark bg. */
  font-family: var(--font-primary), 'gg sans', system-ui, sans-serif !important;
  font-weight: 400 !important;
}

/* ─── Igris Report Modal — opaque fill ────────────────────────────────── */
/* The body content carries its own background, but the modal's outer
   frame (header with title, footer with action buttons) is transparent
   by default and lets Discord UI bleed through. Scope-target only
   modals that contain the marker class so other BD/Discord modals
   are unaffected. */

[role="dialog"]:has(.shadowsenses-igris-report-modal) {
  background-color: #0d0d18 !important;
}
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
/* Footer flex-gap so Cancel/Understood don't touch — ` + button` failed
   because Discord wraps each button in its own div. Apply to any
   flex/grid footer container that holds the buttons. */
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
  color: rgba(196, 181, 253, 0.7) !important;
  font-size: 18px !important;
  padding: 4px 8px !important;
}

#shadow-senses-header-popup .shadow-senses-close-btn:hover {
  color: #fff !important;
  background: rgba(138, 43, 226, 0.15) !important;
}

#shadow-senses-header-popup .shadow-senses-tab {
  color: rgba(196, 181, 253, 0.6) !important;
  border-bottom: 2px solid transparent !important;
  padding: 10px 16px !important;
}

#shadow-senses-header-popup .shadow-senses-tab:hover {
  color: rgba(196, 181, 253, 0.9) !important;
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
  color: rgba(196, 181, 253, 0.6) !important;
  text-align: center !important;
  padding: 32px 20px !important;
}

#shadow-senses-header-popup .shadow-senses-footer {
  color: rgba(196, 181, 253, 0.55) !important;
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
