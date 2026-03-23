function getFallbackLevelProgressBarCss() {
  return `
      /* ── Font Override ───────────────────────────────────────────── */
      .lpb-progress-bar,
      .lpb-progress-bar * {
        font-family: 'Friend or Foe BB', sans-serif !important;
      }

      .lpb-progress-container {
        position: fixed;
        left: 0;
        right: 0;
        z-index: 999997;
        pointer-events: none;
      }
      .lpb-progress-container.top { top: 0; }
      .lpb-progress-container.bottom { bottom: 0; }
      .lpb-progress-bar {
        width: 100%;
        background: rgba(10, 10, 15, 0.95);
        border-bottom: 2px solid rgba(138, 43, 226, 0.5);
        padding: 12px 20px 12px 80px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .lpb-progress-track {
        flex: 1 1 auto;
        min-width: 180px;
        height: 12px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(20, 20, 30, 0.8);
      }
      .lpb-progress-fill {
        width: 100%;
        height: 100%;
        transform-origin: left center;
        background: linear-gradient(90deg, #8a2be2 0%, #7b27cc 50%, #6c22b6 100%);
      }
    `;
}

module.exports = { getFallbackLevelProgressBarCss };
