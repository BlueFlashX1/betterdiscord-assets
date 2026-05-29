function getFallbackLevelProgressBarCss() {
  return `
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
        background: rgba(10, 10, 16, 0.97);
        padding: 12px 20px 12px 80px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .lpb-progress-track {
        flex: 1 1 auto;
        min-width: 180px;
        height: 12px;
        border-radius: 2px;
        overflow: hidden;
        background: rgba(10, 10, 16, 0.98);
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
