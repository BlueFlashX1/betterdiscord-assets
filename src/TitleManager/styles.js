function getTitleManagerCss() {
  return `
      /* ── Font Override ───────────────────────────────────────────── */
      .tm-title-modal,
      .tm-title-modal *,
      .tm-modal-content,
      .tm-modal-content * {
        font-family: 'Friend or Foe BB', sans-serif !important;
      }

      /* Main Button - Matching Discord native toolbar buttons (GIF, Stickers, Emoji) */
      .tm-title-button-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0 0 0 4px;
        box-sizing: border-box;
      }
      .tm-title-button {
        background: transparent;
        border: 1px solid rgba(138, 43, 226, 1);
        border-radius: 2px;
        width: 32px;
        height: 32px;
        cursor: pointer;
        color: var(--interactive-normal, #b9bbbe);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease, background-color 0.15s ease;
        margin: 0;
        flex-shrink: 0;
        padding: 0;
        box-sizing: border-box;
      }

      .tm-title-button svg {
        width: 20px;
        height: 20px;
        transition: color 0.15s ease;
        display: block;
      }

      .tm-title-button:hover {
        color: var(--interactive-hover, #dcddde);
        background: rgba(138, 43, 226, 0.15);
        border-color: rgba(138, 43, 226, 0.85);
      }

      .tm-title-button:active {
        color: var(--interactive-active, #fff);
        background: rgba(138, 43, 226, 0.25);
        border-color: rgba(138, 43, 226, 1);
      }

      .tm-title-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
      }

      .tm-modal-content {
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.85) 100%);
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 2px;
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 0 30px rgba(138, 43, 226, 0.5);
      }

      .tm-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 2px solid rgba(138, 43, 226, 0.3);
      }

      .tm-modal-header h2 {
        margin: 0;
        color: #8a2be2;
        font-family: 'Orbitron', sans-serif;
        font-size: 24px;
      }

      /* Filter Bar Styling */
      .tm-filter-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        background: linear-gradient(135deg, #12091e 0%, #0e0716 100%);
        border-bottom: 2px solid rgba(138, 43, 226, 0.2);
      }

      .tm-filter-label {
        color: #8a2be2;
        font-weight: bold;
        font-size: 14px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }

      .tm-sort-dropdown {
        flex: 1;
        padding: 10px 16px;
        background: #0d0d14;
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 2px;
        color: #e8dcff;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.2);
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a2be2' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 36px;
      }

      .tm-sort-dropdown:hover {
        border-color: rgba(138, 43, 226, 0.8);
        background-color: #1a0e2e;
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.4);
        transform: translateY(-1px);
      }

      .tm-sort-dropdown:focus {
        border-color: #8a2be2;
        box-shadow: 0 0 25px rgba(138, 43, 226, 0.6);
        background-color: #0d0d14;
      }

      .tm-sort-dropdown option {
        background: #0d0d14;
        color: #e8dcff;
        padding: 10px;
        font-size: 14px;
      }

      .tm-sort-dropdown option:checked {
        background: linear-gradient(135deg, #2a1548, #1a0e2e);
        color: #d4b8ff;
      }

      .tm-sort-dropdown option:hover {
        background: #1a0e2e;
      }

      .tm-close-button {
        background: transparent;
        border: none;
        color: #8a2be2;
        font-size: 32px;
        cursor: pointer;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 2px;
        transition: all 0.2s ease;
      }

      .tm-close-button:hover {
        background: rgba(138, 43, 226, 0.2);
    }

      .tm-modal-body {
        padding: 20px;
      }

      .tm-active-title {
        background: rgba(0, 255, 136, 0.1);
        border: 2px solid rgba(0, 255, 136, 0.5);
        border-radius: 2px;
        padding: 20px;
        margin-bottom: 20px;
        text-align: center;
      }

      .tm-active-label {
        color: rgba(0, 255, 136, 0.8);
        font-size: 14px;
        margin-bottom: 8px;
      }

      .tm-active-name {
        color: #00ff88;
        font-size: 24px;
        font-weight: bold;
        font-family: 'Orbitron', sans-serif;
        margin-bottom: 8px;
      }

      .tm-active-bonus {
        color: rgba(0, 255, 136, 0.8);
        font-size: 16px;
        margin-bottom: 15px;
      }

      .tm-unequip-btn {
        padding: 8px 20px;
        background: rgba(255, 68, 68, 0.8);
        border: 2px solid rgba(255, 68, 68, 1);
        border-radius: 2px;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .tm-unequip-btn:hover {
        background: rgba(255, 68, 68, 1);
        box-shadow: 0 0 10px rgba(255, 68, 68, 0.6);
      }

      .tm-no-title {
        background: rgba(138, 43, 226, 0.1);
        border: 2px dashed rgba(138, 43, 226, 0.3);
        border-radius: 2px;
        padding: 30px;
        margin-bottom: 20px;
        text-align: center;
      }

      .tm-no-title-text {
        color: rgba(255, 255, 255, 0.6);
        font-size: 16px;
      }

      .tm-titles-section {
        margin-top: 20px;
      }

      .tm-section-title {
        color: #8a2be2;
        font-family: 'Orbitron', sans-serif;
        font-size: 18px;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid rgba(138, 43, 226, 0.3);
      }

      .tm-empty-state {
        text-align: center;
        padding: 40px;
        color: rgba(255, 255, 255, 0.5);
      }

      .tm-empty-icon {
        font-size: 48px;
        margin-bottom: 15px;
      }

      .tm-empty-text {
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 8px;
      }

      .tm-empty-hint {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.4);
      }

      .tm-titles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 15px;
      }

      .tm-title-card {
        background: rgba(0, 0, 0, 0.6);
        border: 2px solid rgba(138, 43, 226, 0.3);
        border-radius: 2px;
        padding: 20px;
        text-align: center;
        transition: all 0.3s ease;
      }

      .tm-title-card.active {
        border-color: rgba(0, 255, 136, 0.6);
        background: rgba(0, 255, 136, 0.1);
      }

      .tm-title-card:hover:not(.active) {
        border-color: rgba(138, 43, 226, 0.8);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.4);
        transform: translateY(-2px);
      }

      .tm-title-icon {
        font-size: 32px;
        margin-bottom: 10px;
      }

      .tm-title-name {
        font-weight: bold;
        color: #8a2be2;
        font-size: 16px;
        margin-bottom: 8px;
        font-family: 'Orbitron', sans-serif;
      }

      .tm-title-card.active .tm-title-name {
        color: #00ff88;
      }

      .tm-title-bonus {
        color: rgba(0, 255, 136, 0.8);
        font-size: 14px;
        margin-bottom: 12px;
      }

      .tm-title-status {
        color: #00ff88;
        font-size: 12px;
        font-weight: bold;
        padding: 6px 12px;
        background: rgba(0, 255, 136, 0.2);
        border-radius: 2px;
        display: inline-block;
      }

      .tm-equip-btn {
        width: 100%;
        padding: 8px;
        background: linear-gradient(135deg, #8a2be2 0%, #8a2be2 100%);
        border: 2px solid rgba(138, 43, 226, 0.8);
        border-radius: 2px;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 0 8px rgba(138, 43, 226, 0.4);
      }

      .tm-equip-btn:hover {
        background: linear-gradient(135deg, #8a2be2 0%, #4b0082 100%);
        border-color: rgba(138, 43, 226, 1);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.8);
        transform: translateY(-1px);
      }

      /* Shadow-theme harmonization (scoped to TitleManager classes only) */
      .tm-title-modal {
        --tm-primary-rgb: var(--sl-color-primary-rgb, 138, 43, 226);
        --tm-primary: rgb(var(--tm-primary-rgb));
        --tm-surface: rgba(8, 10, 20, 0.96);
        --tm-surface-soft: rgba(12, 15, 30, 0.92);
        --tm-text: rgba(236, 233, 255, 0.94);
        --tm-text-muted: rgba(236, 233, 255, 0.68);
        --tm-active-rgb: 0, 255, 136;
      }

      .tm-title-button {
        border-color: rgba(var(--sl-color-primary-rgb, 138, 43, 226), 0.9);
      }

      .tm-title-button:hover {
        background: rgba(var(--sl-color-primary-rgb, 138, 43, 226), 0.14);
        border-color: rgba(var(--sl-color-primary-rgb, 138, 43, 226), 1);
      }

      .tm-modal-content {
        background: linear-gradient(145deg, var(--tm-surface) 0%, var(--tm-surface-soft) 100%);
        border-color: rgba(var(--tm-primary-rgb), 0.45);
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.55), 0 0 28px rgba(var(--tm-primary-rgb), 0.24);
      }

      .tm-modal-header,
      .tm-filter-bar,
      .tm-no-title,
      .tm-title-card,
      .tm-sort-dropdown {
        border-color: rgba(var(--tm-primary-rgb), 0.35);
      }

      .tm-modal-header h2,
      .tm-section-title,
      .tm-title-name,
      .tm-close-button,
      .tm-filter-label {
        color: var(--tm-primary);
      }

      .tm-sort-dropdown,
      .tm-sort-dropdown option,
      .tm-title-bonus,
      .tm-empty-state,
      .tm-no-title-text {
        color: var(--tm-text);
      }

      .tm-title-card.active,
      .tm-active-title {
        border-color: rgba(var(--tm-active-rgb), 0.52);
        background: rgba(var(--tm-active-rgb), 0.1);
      }

      .tm-title-card.active .tm-title-name,
      .tm-title-status,
      .tm-active-name,
      .tm-active-bonus,
      .tm-active-label {
        color: rgba(var(--tm-active-rgb), 0.96);
      }
    `;
}

module.exports = {
  getTitleManagerCss,
};
