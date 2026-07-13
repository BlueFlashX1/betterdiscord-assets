function getShadowExchangeCss() {
  return `
      /* Portal transition CSS moved to ShadowPortalCore/transition-css.js —
         injected once via the portal-core consumer refcount (2026-07-13). */

      /* ── Font Override ───────────────────────────────────────────── */
      .se-panel-overlay,
      .se-panel-overlay *,
      .se-panel-container,
      .se-panel-container * {
        font-family: 'Friend or Foe BB', sans-serif !important;
      }

      /* ── Swirl Icon (anchored in channel-header toolbar) ───────── */
      .se-swirl-icon {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        margin: 0 2px;
        width: 24px;
        height: 24px;
        border-radius: 2px;
        border: none;
        background: transparent;
        cursor: pointer;
        opacity: 0.85;
        transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
        pointer-events: auto;
      }
      .se-swirl-icon--hidden {
        display: none !important;
      }
      .se-swirl-icon:hover {
        opacity: 1;
        background: rgba(138, 43, 226, 0.15);
      }
      .se-swirl-icon:hover svg {
        filter: drop-shadow(0 0 4px rgba(200, 170, 255, 0.7));
      }

      /* ── Panel Overlay ─────────────────────────────────────────────── */
      .se-panel-overlay {
        position: fixed;
        inset: 0;
        /* PERF (2026-07-13): backdrop-filter: blur(5px) removed — it re-blurred
           everything behind the overlay on every repaint for as long as the
           panel stayed open (user-bounded, not transition-bounded). A slightly
           deeper wash reads near-identically at a fraction of the cost. */
        background: rgba(0, 0, 0, 0.92);
        z-index: 100001;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: se-fade-in 0.25s ease;
      }
      @keyframes se-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* ── Panel Container ───────────────────────────────────────────── */
      .se-panel-container {
        width: 650px;
        max-height: 82vh;
        background: rgba(10, 10, 16, 0.98);
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 2px;
        box-shadow: 0 0 40px rgba(138, 43, 226, 0.2), 0 8px 32px rgba(0, 0, 0, 0.6);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: se-slide-up 0.3s ease;
      }
      @keyframes se-slide-up {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      /* ── Header ────────────────────────────────────────────────────── */
      .se-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(138, 43, 226, 0.25);
        background: rgba(0, 0, 0, 0.2);
      }
      .se-panel-title {
        font-size: 16px;
        font-weight: 700;
        color: #8a2be2;
        margin: 0;
        letter-spacing: 0.5px;
      }
      .se-header-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .se-mark-btn {
        background: linear-gradient(135deg, #7c3aed, #8a2be2);
        color: #fff;
        border: none;
        border-radius: 2px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: box-shadow 0.2s ease, transform 0.15s ease;
      }
      .se-mark-btn:hover {
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.5);
        transform: scale(1.03);
      }
      .se-close-btn {
        background: none;
        border: none;
        color: #999;
        font-size: 22px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        transition: color 0.15s ease;
      }
      .se-close-btn:hover {
        color: #fff;
      }

      /* ── Controls ──────────────────────────────────────────────────── */
      .se-panel-controls {
        display: flex;
        gap: 8px;
        padding: 10px 18px;
        border-bottom: 1px solid rgba(138, 43, 226, 0.12);
      }
      .se-sort-select, .se-search-input {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-radius: 2px;
        color: #dcddde;
        padding: 6px 10px;
        font-size: 12px;
        outline: none;
        transition: border-color 0.2s ease;
      }
      .se-sort-select:focus, .se-search-input:focus {
        border-color: rgba(138, 43, 226, 0.5);
      }
      .se-search-input {
        flex: 1;
      }
      .se-sort-select {
        width: 140px;
      }
      .se-sort-select option {
        background: rgba(10, 10, 16, 0.98);
        color: #dcddde;
      }

      /* ── Waypoint List ─────────────────────────────────────────────── */
      .se-waypoint-list {
        flex: 1;
        overflow-y: auto;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 120px;
        max-height: 55vh;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      .se-waypoint-list::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }
      .se-waypoint-list::-webkit-scrollbar-track {
        background: transparent !important;
      }
      .se-waypoint-list::-webkit-scrollbar-thumb {
        background: transparent !important;
        border: none !important;
      }

      /* ── Empty State ───────────────────────────────────────────────── */
      .se-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: #b5bac1;
      }
      .se-empty-icon {
        font-size: 32px;
        margin-bottom: 10px;
        opacity: 0.5;
      }
      .se-empty-text {
        font-size: 14px;
        font-weight: 600;
        color: #b5bac1;
      }
      .se-empty-hint {
        font-size: 12px;
        margin-top: 4px;
        color: #b5bac1;
      }

      /* ── Waypoint Card ─────────────────────────────────────────────── */
      .se-waypoint-card {
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(138, 43, 226, 0.12);
        border-left: 3px solid #808080;
        border-radius: 2px;
        padding: 10px 14px;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .se-waypoint-card:hover {
        background: rgba(138, 43, 226, 0.06);
        border-color: rgba(138, 43, 226, 0.25);
      }

      .se-card-top {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .se-shadow-rank {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 2px;
        font-size: 10px;
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.3px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.4);
        flex-shrink: 0;
      }
      .se-shadow-name {
        font-size: 13px;
        font-weight: 600;
        color: #8a2be2;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .se-card-remove {
        background: none;
        border: none;
        color: #b5bac1;
        font-size: 12px;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 2px;
        transition: color 0.15s ease, background 0.15s ease;
        flex-shrink: 0;
      }
      .se-card-remove:hover {
        color: #e74c3c;
        background: rgba(231, 76, 60, 0.1);
      }

      .se-card-body {
        margin-bottom: 8px;
      }
      .se-location-label {
        font-size: 13px;
        color: #dcddde;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .se-location-meta {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .se-type-badge {
        background: rgba(138, 43, 226, 0.15);
        color: #8a2be2;
        padding: 1px 6px;
        border-radius: 2px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.3px;
      }
      .se-visit-count {
        font-size: 11px;
        color: #b5bac1;
      }
      .se-created-time {
        font-size: 10px;
        color: #b5bac1;
        margin-left: auto;
      }

      /* ── Message Preview ──────────────────────────────────────── */
      .se-message-preview {
        background: rgba(0, 0, 0, 0.2);
        border-left: 2px solid rgba(138, 43, 226, 0.3);
        border-radius: 0 2px 2px 0;
        padding: 5px 8px;
        margin: 4px 0 6px 0;
        font-size: 12px;
        color: #b5bac1;
        max-height: 48px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        line-height: 1.4;
      }
      .se-msg-author {
        color: #8a2be2;
        font-weight: 600;
        margin-right: 4px;
      }
      .se-msg-text {
        color: #b5bac1;
      }

      .se-card-footer {
        display: flex;
        justify-content: flex-end;
      }
      .se-teleport-btn {
        background: linear-gradient(135deg, #6d28d9, #8a2be2);
        color: #fff;
        border: none;
        border-radius: 2px;
        padding: 5px 16px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: box-shadow 0.2s ease, transform 0.15s ease;
        letter-spacing: 0.3px;
      }
      .se-teleport-btn:hover {
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.45);
        transform: scale(1.04);
      }

      /* ── Footer ────────────────────────────────────────────────────── */
      .se-panel-footer {
        display: flex;
        justify-content: space-between;
        padding: 10px 18px;
        border-top: 1px solid rgba(138, 43, 226, 0.12);
        font-size: 11px;
        color: #b5bac1;
      }
    `;
}

module.exports = {
  getShadowExchangeCss,
};
