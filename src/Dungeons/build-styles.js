/**
 * build-styles.js — Dynamic CSS builder for the Dungeons plugin.
 *
 * Replaces static styles.css import in css-management.js. Uses the shared
 * Discord class resolver (dc) to substitute resolved Webpack class selectors
 * for [class*="..."] wildcard selectors wherever possible, falling back
 * gracefully to wildcards when Webpack resolution fails.
 *
 * Usage:
 *   const { buildCSS } = require("./build-styles");
 *   const css = buildCSS();  // returns the full CSS string
 */

const dc = require("../shared/discord-classes");

/**
 * Returns the CSS string with Discord class selectors resolved.
 * Safe to call multiple times; dc.sel uses lazy memoisation internally.
 *
 * @returns {string}
 */
function buildCSS() {
  // ── Resolved selectors used in this file ──────────────────────────────────
  //
  // dc.sel.toolbar        → ".toolbar_abc123"   or  '[class*="toolbar_"]'
  // dc.sel.userSettings   → ".standardSidebarView_abc"  or  '[class*="userSettings_"]'
  //
  // Selectors NOT in the shared resolver (no stable Webpack module found):
  //   comment, reply          — still wildcard (toolbar child icons)
  //   layer / baseLayer       — Discord layer stack, still wildcard
  //
  // For the :has() combos we substitute dc.sel.userSettings for both
  //   [class*='userSettings'] and [class*='standardSidebarView'] since the
  //   resolver maps "userSettings" → standardSidebarView class.

  const sel = dc.sel;

  return `@keyframes dungeonPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

/* ARISE Animation Keyframes */
@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
  }
  50% {
    box-shadow: 0 6px 20px rgba(139, 92, 246, 0.8);
  }
}

@keyframes arise-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes arise-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes arise-rise {
  from {
    transform: translateY(50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes arise-glow {
  0%, 100% {
    text-shadow: 0 0 20px #8b5cf6, 0 0 40px #8b5cf6;
  }
  50% {
    text-shadow: 0 0 30px #a78bfa, 0 0 60px #a78bfa;
  }
}

@keyframes arise-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-10px); }
  75% { transform: translateX(10px); }
}

/* Hide comment/thread buttons when dungeon HP bar is active (CSS-based, survives re-renders) */
/* Use both resolved + wildcard toolbar selector for reliability */
.dungeon-boss-hp-container ~ ${sel.toolbar} [class*="comment"],
.dungeon-boss-hp-container ~ ${sel.toolbar} ${sel.thread},
.dungeon-boss-hp-container ~ ${sel.toolbar} [class*="reply"],
.dungeon-boss-hp-container ~ [class*="toolbar_"] [class*="comment"],
.dungeon-boss-hp-container ~ [class*="toolbar_"] ${sel.thread},
.dungeon-boss-hp-container ~ [class*="toolbar_"] [class*="reply"] {
  display: none !important;
}

.dungeon-indicator { cursor: pointer; }

/* CSS-based dungeon channel indicator — SVG icon inside channel name (survives React re-renders) */
[data-dungeon-active] ${sel.name} {
  display: flex !important;
  align-items: center !important;
  gap: 8px;
}
[data-dungeon-active] ${sel.name}::before {
  content: '';
  display: inline-block;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  /* SVG dungeon gate icon — two pillars with arch, no emoji */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Crect x='1' y='4' width='3' height='11' rx='0.5' fill='%238b5cf6'/%3E%3Crect x='12' y='4' width='3' height='11' rx='0.5' fill='%238b5cf6'/%3E%3Cpath d='M2.5 4 C2.5 1.5 8 0 8 0 C8 0 13.5 1.5 13.5 4' stroke='%238b5cf6' stroke-width='1.5' fill='none'/%3E%3Crect x='6' y='8' width='4' height='7' rx='0.5' fill='%237c3aed' opacity='0.7'/%3E%3Ccircle cx='8' cy='3' r='1.2' fill='%23a78bfa' opacity='0.9'/%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
  margin-right: 6px;
  animation: dungeonIconPulse 2.5s ease-in-out infinite;
}
@keyframes dungeonIconPulse {
  0%, 100% { opacity: 0.85; filter: drop-shadow(0 0 2px rgba(139, 92, 246, 0.6)); }
  50% { opacity: 1; filter: drop-shadow(0 0 5px rgba(139, 92, 246, 0.9)) drop-shadow(0 0 10px rgba(124, 58, 237, 0.4)); }
}
.dungeons-plugin-button {
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  color: var(--interactive-normal, #b9bbbe);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  margin: 0 2px;
  flex-shrink: 0;
  padding: 6px;
  box-sizing: border-box;
}
.dungeons-plugin-button svg {
  width: 20px;
  height: 20px;
  transition: all 0.2s ease;
  display: block;
}
.dungeons-plugin-button:hover {
  background: var(--background-modifier-hover, rgba(4, 4, 5, 0.6));
  color: var(--interactive-hover, #dcddde);
}
.dungeons-plugin-button:hover svg {
  transform: scale(1.1);
}

/* Dungeons Header Widget (quick dungeon switch/deploy panel) */
.dungeons-header-widget {
  appearance: none;
  width: 24px;
  height: 24px;
  margin: 0 6px 0 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--interactive-normal, #b5bac1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: color 0.15s ease, transform 0.15s ease;
}

.dungeons-header-widget:hover {
  color: var(--interactive-hover, #dcddde);
}

.dungeons-header-widget:active {
  transform: translateY(1px);
}

.dungeons-header-widget:focus-visible {
  outline: 2px solid rgba(114, 137, 218, 0.65);
  outline-offset: 2px;
  border-radius: 4px;
}

.dungeons-header-widget-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.dungeons-header-widget-icon svg {
  width: 20px;
  height: 20px;
}

.dungeons-header-widget-count {
  position: absolute;
  top: -3px;
  right: -5px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  background: #ed4245;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.12s ease, transform 0.12s ease;
  pointer-events: none;
}

.dungeons-header-widget-count.is-visible {
  opacity: 1;
  transform: scale(1);
}

.dungeons-header-popup {
  position: fixed;
  z-index: 10050;
  pointer-events: auto;
}

.dungeons-header-popup-surface {
  background: rgba(22, 22, 30, 0.97);
  border: 1px solid rgba(120, 120, 145, 0.35);
  border-radius: 10px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  backdrop-filter: blur(8px);
}

.dungeons-header-popup-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(120, 120, 145, 0.25);
}

.dungeons-header-popup-title {
  font-size: 13px;
  font-weight: 700;
  color: #f2f3f5;
}

.dungeon-widget-close-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: #b5bac1;
  font-size: 20px;
  line-height: 1;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  cursor: pointer;
}

.dungeon-widget-close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.dungeons-header-popup-content {
  max-height: min(65vh, 540px);
  overflow-y: auto;
}

.dungeons-header-popup-empty {
  padding: 14px 12px 16px;
  color: #b5bac1;
  font-size: 12px;
}

.dungeons-header-popup-row {
  padding: 10px 12px 12px;
  border-bottom: 1px solid rgba(120, 120, 145, 0.2);
}

.dungeons-header-popup-row:last-child {
  border-bottom: none;
}

.dungeons-header-popup-row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.dungeons-header-popup-row-name {
  font-size: 13px;
  font-weight: 700;
  color: #f2f3f5;
}

.dungeons-header-popup-row-rank {
  font-size: 11px;
  font-weight: 700;
  color: #ffd76f;
}

.dungeons-header-popup-row-meta {
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a3a6aa;
  font-size: 11px;
}

.dungeons-header-popup-row-stats {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: #d5d7db;
}

.dungeons-header-popup-state {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.dungeons-header-popup-state.is-deployed {
  background: rgba(67, 181, 129, 0.2);
  color: #5de89a;
}

.dungeons-header-popup-state.is-waiting {
  background: rgba(250, 166, 26, 0.2);
  color: #ffcc72;
}

.dungeons-header-popup-state.is-joined {
  background: rgba(88, 166, 255, 0.2);
  color: #8ec5ff;
}

.dungeons-header-popup-state.is-not-joined {
  background: rgba(170, 170, 190, 0.2);
  color: #d8dae0;
}

.dungeons-header-popup-row-actions {
  margin-top: 9px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dungeon-widget-action {
  appearance: none;
  border: 1px solid rgba(130, 130, 155, 0.35);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  color: #f2f3f5;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 6px 8px;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}

.dungeon-widget-action:hover {
  background: rgba(255, 255, 255, 0.11);
  border-color: rgba(170, 170, 200, 0.65);
}

.dungeon-widget-action.action-go {
  color: #8ec5ff;
}

.dungeon-widget-action.action-deploy {
  color: #5de89a;
}

.dungeon-widget-action.action-join {
  color: #ffdca0;
}

/* Boss HP Bar Container (sits below channel header, no overlap!) */
.dungeon-boss-hp-container {
  display: block !important;
  position: relative !important;
  width: 100% !important;
  max-width: 100% !important;
  padding: 12px 16px !important;
  margin: 0 !important;
  background: linear-gradient(180deg, rgba(20, 20, 30, 0.95) 0%, rgba(15, 15, 25, 0.98) 100%) !important;
  border-bottom: 2px solid rgba(139, 92, 246, 0.4) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(139, 92, 246, 0.1) !important;
  z-index: 100 !important;
  backdrop-filter: blur(8px) !important;
  visibility: visible !important;
  opacity: 1 !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

/* Hide boss HP bar when settings/modals are open */
/* When user settings open */
[class*='layer']:has(${sel.userSettings}) .dungeon-boss-hp-container,
[class*='layer']:has(${sel.settingsContainer}) .dungeon-boss-hp-container,
[class*='layer']:has(${sel.standardSidebarView}) .dungeon-boss-hp-container,
/* When any layer above base layer */
[class*='layer'][class*='baseLayer'] ~ [class*='layer'] .dungeon-boss-hp-container,
/* When settings layer exists */
body:has(${sel.userSettings}) .dungeon-boss-hp-container,
body:has(${sel.settingsContainer}) .dungeon-boss-hp-container,
body:has(${sel.standardSidebarView}) .dungeon-boss-hp-container {
  display: none !important;
  visibility: hidden !important;
}

/* Only show in main chat view (not in settings) */
.dungeon-boss-hp-container {
  pointer-events: auto !important;
}

/* Ensure it stays below settings layers */
${sel.userSettings},
${sel.settingsContainer} {
  z-index: 1000 !important;
}

/* Boss HP Bar in Channel Header */
.dungeon-boss-hp-bar {
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
  padding: 12px 14px !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 auto !important;
  font-family: 'Orbitron', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  background: rgba(30, 30, 45, 0.85) !important;
  border: 1px solid rgba(139, 92, 246, 0.4) !important;
  border-radius: 2px !important;
  backdrop-filter: blur(6px) !important;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.15) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}

.dungeon-boss-hp-bar .boss-info {
  color: #a78bfa !important;
  font-weight: 700 !important;
  font-size: 12px !important;
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.8), 0 2px 4px rgba(0, 0, 0, 0.5) !important;
  line-height: 1.4 !important;
  width: 100% !important;
  max-width: 100% !important;
}

/* Dungeon HP Bar Buttons */
.dungeon-deploy-btn {
  padding: 4px 12px !important;
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%) !important;
  color: white !important;
  border: none !important;
  border-radius: 2px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  cursor: pointer !important;
  transition: all 0.2s !important;
  box-shadow: 0 2px 6px rgba(139, 92, 246, 0.5) !important;
  text-shadow: 0 0 6px rgba(139, 92, 246, 0.8) !important;
  pointer-events: auto !important;
  display: inline-block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
.dungeon-deploy-btn:hover {
  transform: scale(1.05) !important;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.7) !important;
  text-shadow: 0 0 10px rgba(139, 92, 246, 1) !important;
}

.dungeon-join-btn {
  padding: 4px 12px !important;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
  color: white !important;
  border: none !important;
  border-radius: 2px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  cursor: pointer !important;
  transition: all 0.2s !important;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4) !important;
  pointer-events: auto !important;
  display: inline-block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
.dungeon-join-btn:hover {
  transform: scale(1.05) !important;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.6) !important;
}

.dungeon-leave-btn {
  padding: 4px 12px !important;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
  color: white !important;
  border: none !important;
  border-radius: 2px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  cursor: pointer !important;
  transition: all 0.2s !important;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4) !important;
  pointer-events: auto !important;
  display: inline-block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
.dungeon-leave-btn:hover {
  transform: scale(1.05) !important;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.6) !important;
}

.dungeon-recall-btn {
  padding: 4px 12px !important;
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%) !important;
  color: white !important;
  border: none !important;
  border-radius: 2px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  cursor: pointer !important;
  transition: all 0.2s !important;
  box-shadow: 0 2px 6px rgba(220, 38, 38, 0.5) !important;
  text-shadow: 0 0 6px rgba(239, 68, 68, 0.8) !important;
  pointer-events: auto !important;
  display: inline-block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
.dungeon-recall-btn:hover {
  transform: scale(1.05) !important;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.7) !important;
  text-shadow: 0 0 10px rgba(239, 68, 68, 1) !important;
}

.dungeon-arise-button:hover {
  transform: scale(1.05) !important;
  box-shadow: 0 6px 16px rgba(139, 92, 246, 0.6) !important;
}

/* Boss Bar Layout — structural classes extracted from inline styles */
.boss-bar-layout {
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
  width: 100% !important;
}

.boss-bar-header {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  width: 100% !important;
  gap: 12px !important;
}

.boss-bar-info {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  flex: 1 !important;
  min-width: 0 !important;
}

.boss-bar-name {
  color: #a78bfa !important;
  font-weight: 700 !important;
  font-size: 13px !important;
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.8) !important;
  white-space: nowrap !important;
}

.boss-bar-type {
  color: #d4a5ff !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  flex-shrink: 0 !important;
}

.boss-bar-stats {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
  font-size: 11px !important;
  color: #c4b5fd !important;
}

.boss-bar-combat-row {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex-wrap: wrap !important;
}

.boss-bar-combat-label {
  color: #94a3b8 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
}

.boss-bar-combat-actions {
  display: flex !important;
  gap: 8px !important;
  flex-wrap: wrap !important;
  align-items: center !important;
}

.dungeon-combat-skill-btn {
  padding: 5px 11px !important;
  border-radius: 4px !important;
  border: 1px solid rgba(138, 43, 226, 0.45) !important;
  background: linear-gradient(135deg, rgba(34, 12, 58, 0.96) 0%, rgba(67, 24, 116, 0.92) 100%) !important;
  color: #f5ebff !important;
  font-family: 'Orbitron', 'Segoe UI', sans-serif !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  letter-spacing: 0.06em !important;
  cursor: pointer !important;
  transition: all 0.18s ease !important;
  box-shadow:
    0 0 10px rgba(138, 43, 226, 0.24),
    inset 0 0 14px rgba(138, 43, 226, 0.12) !important;
  text-shadow: 0 0 6px rgba(138, 43, 226, 0.55) !important;
}

.dungeon-combat-skill-btn:hover:not([disabled]) {
  transform: translateY(-1px) !important;
  border-color: rgba(186, 85, 211, 0.8) !important;
  box-shadow:
    0 0 16px rgba(138, 43, 226, 0.42),
    inset 0 0 18px rgba(186, 85, 211, 0.18) !important;
}

.dungeon-combat-skill-btn.is-cooldown {
  background: linear-gradient(135deg, rgba(33, 16, 58, 0.95) 0%, rgba(52, 28, 92, 0.92) 100%) !important;
  color: #c4b5fd !important;
  border-color: rgba(124, 58, 237, 0.34) !important;
}

.dungeon-combat-skill-btn.is-starved {
  background: linear-gradient(135deg, rgba(44, 28, 12, 0.95) 0%, rgba(92, 57, 20, 0.9) 100%) !important;
  color: #fbbf24 !important;
  border-color: rgba(245, 158, 11, 0.5) !important;
  text-shadow: 0 0 6px rgba(245, 158, 11, 0.35) !important;
}

.dungeon-combat-skill-btn.is-blocked {
  background: linear-gradient(135deg, rgba(17, 24, 39, 0.96) 0%, rgba(30, 41, 59, 0.92) 100%) !important;
  color: #cbd5e1 !important;
  border-color: rgba(100, 116, 139, 0.4) !important;
  text-shadow: none !important;
}

.dungeon-combat-skill-btn[disabled] {
  opacity: 0.78 !important;
  cursor: not-allowed !important;
  transform: none !important;
}

.dungeon-active-effects-row {
  display: flex !important;
  gap: 4px !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  margin-top: 4px !important;
  row-gap: 3px !important;
}

.effect-row-separator {
  display: inline-block !important;
  width: 1px !important;
  height: 14px !important;
  background: rgba(255, 255, 255, 0.15) !important;
  margin: 0 2px !important;
  flex-shrink: 0 !important;
  align-self: center !important;
}

.dungeon-effect-badge {
  display: inline-flex !important;
  align-items: center !important;
  gap: 3px !important;
  padding: 1px 6px !important;
  border-radius: 10px !important;
  font-family: 'Orbitron', 'Segoe UI', sans-serif !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  letter-spacing: 0.04em !important;
  white-space: nowrap !important;
  line-height: 16px !important;
  min-height: 18px !important;
  animation: effectPulse 2s ease-in-out infinite !important;
}

.effect-badge-buff {
  background: linear-gradient(135deg, rgba(6, 78, 59, 0.92) 0%, rgba(16, 185, 129, 0.28) 100%) !important;
  color: #6ee7b7 !important;
  border: 1px solid rgba(52, 211, 153, 0.5) !important;
  text-shadow: 0 0 6px rgba(52, 211, 153, 0.45) !important;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.2) !important;
}

.effect-badge-debuff {
  background: linear-gradient(135deg, rgba(127, 29, 29, 0.92) 0%, rgba(239, 68, 68, 0.28) 100%) !important;
  color: #fca5a5 !important;
  border: 1px solid rgba(248, 113, 113, 0.5) !important;
  text-shadow: 0 0 6px rgba(248, 113, 113, 0.45) !important;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.2) !important;
}

/* Status Ailment: DOT effects (poison, bleed, burn, necrotic) — sickly green-purple */
.effect-badge-ailment-dot {
  background: linear-gradient(135deg, rgba(88, 28, 135, 0.92) 0%, rgba(168, 85, 247, 0.28) 100%) !important;
  color: #d8b4fe !important;
  border: 1px solid rgba(168, 85, 247, 0.5) !important;
  text-shadow: 0 0 6px rgba(168, 85, 247, 0.45) !important;
  box-shadow: 0 0 8px rgba(168, 85, 247, 0.2) !important;
}

/* Status Ailment: Damage amplification (armorBreak) — amber/orange */
.effect-badge-ailment-amp {
  background: linear-gradient(135deg, rgba(120, 53, 15, 0.92) 0%, rgba(245, 158, 11, 0.28) 100%) !important;
  color: #fcd34d !important;
  border: 1px solid rgba(245, 158, 11, 0.5) !important;
  text-shadow: 0 0 6px rgba(245, 158, 11, 0.45) !important;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.2) !important;
}

/* Status Ailment: Slow effects (slow, frostbite) — icy blue */
.effect-badge-ailment-slow {
  background: linear-gradient(135deg, rgba(12, 74, 110, 0.92) 0%, rgba(56, 189, 248, 0.28) 100%) !important;
  color: #7dd3fc !important;
  border: 1px solid rgba(56, 189, 248, 0.5) !important;
  text-shadow: 0 0 6px rgba(56, 189, 248, 0.45) !important;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.2) !important;
}

/* Status Ailment: Enrage (boss permanent buff) — angry crimson */
.effect-badge-ailment-enrage {
  background: linear-gradient(135deg, rgba(153, 27, 27, 0.95) 0%, rgba(239, 68, 68, 0.35) 100%) !important;
  color: #fecaca !important;
  border: 1px solid rgba(248, 113, 113, 0.6) !important;
  text-shadow: 0 0 8px rgba(239, 68, 68, 0.6) !important;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3) !important;
  animation: enragePulse 1.5s ease-in-out infinite !important;
}

/* Status Ailment: Mob summary counts — muted teal (informational, not alarming) */
.effect-badge-ailment-mob {
  background: linear-gradient(135deg, rgba(17, 94, 89, 0.88) 0%, rgba(20, 184, 166, 0.22) 100%) !important;
  color: #5eead4 !important;
  border: 1px solid rgba(45, 212, 191, 0.4) !important;
  text-shadow: 0 0 5px rgba(45, 212, 191, 0.35) !important;
  box-shadow: 0 0 6px rgba(20, 184, 166, 0.15) !important;
  font-size: 9px !important;
  line-height: 16px !important;
  min-height: 18px !important;
  opacity: 0.85 !important;
  animation: none !important;
}

/* Status Ailment: Self (debuffs on YOU) — dark red warning */
.effect-badge-ailment-self {
  background: linear-gradient(135deg, rgba(153, 27, 27, 0.92) 0%, rgba(220, 38, 38, 0.28) 100%) !important;
  color: #fca5a5 !important;
  border: 1px solid rgba(220, 38, 38, 0.6) !important;
  text-shadow: 0 0 6px rgba(220, 38, 38, 0.45) !important;
  box-shadow: 0 0 8px rgba(220, 38, 38, 0.25), inset 0 0 4px rgba(220, 38, 38, 0.1) !important;
}

/* ── Custom Dungeon Tooltips ── black bg + purple border, replaces native title */
[data-dungeon-tip] {
  position: relative !important;
}

[data-dungeon-tip]:hover::after {
  content: attr(data-dungeon-tip) !important;
  position: absolute !important;
  bottom: calc(100% + 8px) !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  padding: 6px 12px !important;
  background: rgba(8, 4, 16, 0.97) !important;
  border: 1.5px solid rgba(138, 43, 226, 0.75) !important;
  border-radius: 6px !important;
  color: #e2d4f0 !important;
  font-family: 'Orbitron', 'Segoe UI', sans-serif !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.03em !important;
  white-space: nowrap !important;
  z-index: 10000 !important;
  pointer-events: none !important;
  box-shadow:
    0 0 12px rgba(138, 43, 226, 0.35),
    0 4px 16px rgba(0, 0, 0, 0.7),
    inset 0 0 8px rgba(138, 43, 226, 0.08) !important;
  text-shadow: 0 0 4px rgba(138, 43, 226, 0.4) !important;
  animation: dungeonTipFadeIn 0.12s ease-out !important;
}

/* Tooltip arrow */
[data-dungeon-tip]:hover::before {
  content: '' !important;
  position: absolute !important;
  bottom: calc(100% + 2px) !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  border: 5px solid transparent !important;
  border-top-color: rgba(138, 43, 226, 0.75) !important;
  z-index: 10001 !important;
  pointer-events: none !important;
  animation: dungeonTipFadeIn 0.12s ease-out !important;
}

/* Hide tooltip when data-dungeon-tip is empty */
[data-dungeon-tip=""]:hover::after,
[data-dungeon-tip=""]:hover::before {
  display: none !important;
}

@keyframes dungeonTipFadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(3px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes effectPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.75; }
}

@keyframes enragePulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(1.03); }
}

/* Boss Gate Timer — sealed boss countdown */
.boss-gate-timer {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 6px 12px !important;
  margin: 4px 0 !important;
  background: linear-gradient(135deg, rgba(88, 28, 135, 0.35) 0%, rgba(30, 27, 75, 0.6) 100%) !important;
  border: 1px solid rgba(139, 92, 246, 0.4) !important;
  border-radius: 4px !important;
  font-family: 'Orbitron', 'Segoe UI', sans-serif !important;
  animation: gateTimerPulse 2.5s ease-in-out infinite !important;
}

.boss-gate-icon {
  font-size: 14px !important;
  filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.6)) !important;
}

.boss-gate-label {
  color: #c4b5fd !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.5) !important;
}

.boss-gate-countdown {
  color: #f9a8d4 !important;
  font-size: 13px !important;
  font-weight: 800 !important;
  letter-spacing: 0.1em !important;
  text-shadow: 0 0 6px rgba(236, 72, 153, 0.6) !important;
  font-variant-numeric: tabular-nums !important;
}

.boss-gate-separator {
  color: #64748b !important;
  font-size: 10px !important;
}

.boss-gate-kills {
  color: #94a3b8 !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em !important;
}

@keyframes gateTimerPulse {
  0%, 100% {
    border-color: rgba(139, 92, 246, 0.4);
    box-shadow: 0 0 8px rgba(139, 92, 246, 0.15);
  }
  50% {
    border-color: rgba(139, 92, 246, 0.7);
    box-shadow: 0 0 16px rgba(139, 92, 246, 0.3);
  }
}

.boss-bar-stat-label {
  color: #94a3b8 !important;
}

.boss-bar-stat-separator {
  color: #64748b !important;
}

.boss-hp-current {
  color: #f87171 !important;
  font-weight: 700 !important;
}

.boss-hp-max {
  color: #fbbf24 !important;
}

.mob-alive {
  color: #34d399 !important;
  font-weight: 700 !important;
}

.mob-total {
  color: #94a3b8 !important;
}

/* Participation badge states */
.boss-bar-badge-waiting {
  color: #8b5cf6 !important;
  font-weight: 700 !important;
}

.boss-bar-badge-fighting {
  color: #10b981 !important;
  font-weight: 700 !important;
}

.boss-bar-badge-deployed {
  color: #f59e0b !important;
  font-weight: 700 !important;
}

/* HP Bar — combined rules (inline styles extracted + CSS-only properties preserved) */
.dungeon-boss-hp-bar .hp-bar-container,
.hp-bar-container {
  height: 14px !important;
  width: 100% !important;
  max-width: 100% !important;
  background: linear-gradient(180deg, rgba(15, 15, 25, 0.9), rgba(20, 20, 30, 0.95)) !important;
  border-radius: 2px !important;
  overflow: hidden !important;
  position: relative !important;
  border: 1px solid rgba(139, 92, 246, 0.5) !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3) !important;
  box-sizing: border-box !important;
  margin-top: 4px !important;
}

.dungeon-boss-hp-bar .hp-bar-fill,
.hp-bar-fill {
  width: var(--boss-hp-percent, 0%) !important;
  height: 100% !important;
  background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 40%, #ec4899 80%, #f97316 100%) !important;
  border-radius: 2px !important;
  transition: width 0.5s ease !important;
  box-shadow:
    0 0 12px rgba(139, 92, 246, 0.6),
    inset 0 0 20px rgba(236, 72, 153, 0.4),
    0 2px 8px rgba(249, 115, 22, 0.3) !important;
  animation: bossHpPulse 2s ease-in-out infinite !important;
}

@keyframes bossHpPulse {
  0%, 100% { box-shadow: 0 0 12px rgba(139, 92, 246, 0.6), inset 0 0 20px rgba(236, 72, 153, 0.4); }
  50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.8), inset 0 0 25px rgba(236, 72, 153, 0.6); }
}

.dungeon-boss-hp-bar .hp-bar-text,
.hp-bar-text {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: white !important;
  font-size: 10px !important;
  font-weight: 800 !important;
  text-shadow:
    0 0 6px rgba(0, 0, 0, 1),
    0 2px 4px rgba(0, 0, 0, 0.9),
    0 0 3px rgba(139, 92, 246, 0.5) !important;
  pointer-events: none !important;
  letter-spacing: 0.8px !important;
}

/* User HP Bar */
.dungeon-user-hp-bar {
  font-family: 'Orbitron', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
`;
}

module.exports = { buildCSS };
