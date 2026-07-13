function getShadowStepCss(pluginVersion) {
  return `
/* ═══════════════════════════════════════════════════════════════
   ShadowStep v${pluginVersion} — Shadow Anchor Teleportation
   ═══════════════════════════════════════════════════════════════ */

/* ── Transition Animation ────────────────────────────────────── */

/* Portal transition CSS (overlay/canvas/shard) moved to
   ShadowPortalCore/transition-css.js — injected ONCE via the portal-core
   consumer refcount instead of duplicated per-plugin (2026-07-13). */

/* ── Panel Overlay ───────────────────────────────────────────── */

.ss-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 100001;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ss-fade-in 150ms ease;
}

@keyframes ss-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.ss-panel-container {
  background: rgba(10, 10, 16, 0.97);
  border: 1px solid rgba(138, 43, 226, 0.4);
  border-radius: 2px;
  width: 420px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(138, 43, 226, 0.15);
  overflow: hidden;
}

/* ── Panel Header ────────────────────────────────────────────── */

.ss-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(138, 43, 226, 0.2);
}

.ss-panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #8a2be2;
  letter-spacing: 0.5px;
}

.ss-panel-close {
  background: none;
  border: none;
  color: rgba(181, 186, 193, 0.5);
  font-size: 20px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 2px;
  transition: color 0.15s ease, background 0.15s ease;
}
.ss-panel-close:hover { color: #fff; background: rgba(138, 43, 226, 0.2); }

/* ── Search ──────────────────────────────────────────────────── */

.ss-panel-search {
  margin: 10px 16px 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(138, 43, 226, 0.2);
  border-radius: 2px;
  color: #dcddde;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s ease;
}
.ss-panel-search:focus {
  border-color: rgba(138, 43, 226, 0.5);
}
.ss-panel-search::placeholder { color: rgba(181, 186, 193, 0.35); }

/* ── Sort Controls ───────────────────────────────────────────── */

.ss-panel-sort {
  display: flex;
  gap: 4px;
  padding: 6px 16px;
}

.ss-sort-btn {
  background: none;
  border: 1px solid transparent;
  color: rgba(181, 186, 193, 0.45);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.ss-sort-btn:hover { color: rgba(181, 186, 193, 0.75); }
.ss-sort-active {
  color: #8a2be2;
  border-color: rgba(138, 43, 226, 0.3);
  background: rgba(138, 43, 226, 0.08);
}

/* ── Anchor List ─────────────────────────────────────────────── */

.ss-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
  min-height: 80px;
  max-height: 45vh;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

.ss-panel-list::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
.ss-panel-list::-webkit-scrollbar-track { background: transparent !important; }
.ss-panel-list::-webkit-scrollbar-thumb {
  background: transparent !important;
  border: none !important;
}

.ss-panel-empty {
  text-align: center;
  color: rgba(181, 186, 193, 0.35);
  padding: 24px 16px;
  font-size: 13px;
  line-height: 1.5;
}

.ss-anchor-group {
  margin-bottom: 8px;
}

.ss-anchor-group:last-child {
  margin-bottom: 0;
}

.ss-anchor-group-header {
  color: #b5bac1;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 6px 10px 4px;
}

/* ── Anchor Card ─────────────────────────────────────────────── */

.ss-anchor-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.15s ease;
  margin-bottom: 2px;
}
.ss-anchor-card:hover {
  background: rgba(138, 43, 226, 0.12);
}
.ss-anchor-card:active {
  background: rgba(138, 43, 226, 0.2);
}

.ss-anchor-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.25), rgba(75, 0, 130, 0.4));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.ss-anchor-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.ss-anchor-name {
  color: #dcddde;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-anchor-server {
  color: rgba(181, 186, 193, 0.45);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-anchor-rename-input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(138, 43, 226, 0.4);
  border-radius: 2px;
  color: #dcddde;
  font-size: 13px;
  padding: 2px 6px;
  outline: none;
  width: 100%;
}

.ss-anchor-remove {
  background: none;
  border: none;
  color: rgba(181, 186, 193, 0.3);
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 2px;
  transition: color 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
  opacity: 0;
}
.ss-anchor-card:hover .ss-anchor-remove { opacity: 1; }
.ss-anchor-remove:hover {
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

/* ── Panel Footer ────────────────────────────────────────────── */

.ss-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid rgba(138, 43, 226, 0.2);
  color: rgba(181, 186, 193, 0.45);
  font-size: 11px;
}

.ss-panel-hint { color: rgba(181, 186, 193, 0.3); }
`;
}

module.exports = { getShadowStepCss };
