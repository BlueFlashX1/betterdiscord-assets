const STYLE_ID = "skilltree-css";

const SKILL_TREE_CSS = `
      /* Main Button - Matching Discord native toolbar buttons (GIF, Stickers, Emoji) */
      .st-skill-tree-button-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0 0 0 4px;
        box-sizing: border-box;
      }
      .st-skill-tree-button {
        width: 32px;
        height: 32px;
        background: transparent;
        border: 1px solid rgba(138, 43, 226, 1);
        border-radius: 2px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease, background-color 0.15s ease;
        color: var(--interactive-normal, #b9bbbe);
        padding: 0;
        margin: 0;
        box-sizing: border-box;
      }
      .st-skill-tree-button:hover {
        color: var(--interactive-hover, #dcddde);
        background: rgba(138, 43, 226, 0.15);
        border-color: rgba(138, 43, 226, 0.85);
      }
      .st-skill-tree-button:active {
        color: var(--interactive-active, #fff);
        background: rgba(138, 43, 226, 0.25);
        border-color: rgba(138, 43, 226, 1);
      }
      .st-skill-tree-button svg {
        width: 20px;
        height: 20px;
        display: block;
      }

      /* Modal Container */
      .skilltree-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(145deg, #0a0a10 0%, #0d0d14 50%, #08080e 100%);
        border-radius: 2px;
        padding: 0;
        max-width: 900px;
        width: 90vw;
        max-height: 85vh;
        overflow: hidden;
        z-index: 10001;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8),
                    0 0 100px rgba(138, 43, 226, 0.3),
                    inset 0 0 100px rgba(75, 0, 130, 0.1);
        border: 2px solid rgba(138, 43, 226, 0.3);
        animation: modalFadeIn 0.3s ease-out;
      }
      @keyframes modalFadeIn {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      /* Modal Content */
      .skilltree-modal-content {
        padding: 30px;
        padding-bottom: 80px;
        overflow-y: auto;
        max-height: calc(85vh - 200px);
        background: linear-gradient(180deg, #0a0a0f 0%, #08080d 100%);
      }

      /* Header */
      .skilltree-header {
        background: linear-gradient(135deg, #1a0e2e 0%, #140a24 100%);
        padding: 25px 30px;
        border-bottom: 2px solid rgba(138, 43, 226, 0.3);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        position: relative;
        overflow: hidden;
      }
      .skilltree-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        animation: shimmer 3s infinite;
      }
      @keyframes shimmer {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      .skilltree-header h2 {
        margin: 0 0 12px 0;
        color: #fff;
        font-size: 28px;
        font-weight: 800;
        text-shadow: 0 2px 10px rgba(138, 43, 226, 0.8),
                     0 0 20px rgba(75, 0, 130, 0.6);
        letter-spacing: 1px;
        background: linear-gradient(135deg, #fff 0%, #e8dcff 50%, #d4b8ff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .skilltree-header-info {
        display: flex;
        gap: 20px;
        align-items: center;
        flex-wrap: wrap;
      }
      .skilltree-stat {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: #1a0e2e;
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 2px;
        color: #e8dcff;
        font-size: 14px;
        font-weight: 600;
      }

      .skilltree-reset-btn {
        padding: 10px 20px;
        background: linear-gradient(135deg, #6b21a8 0%, #4c1d95 100%);
        border: 2px solid rgba(168, 85, 247, 0.85);
        border-radius: 2px;
        color: #f5f3ff;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.35);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .skilltree-reset-btn:hover {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border-color: rgba(196, 181, 253, 0.95);
        box-shadow: 0 0 25px rgba(138, 43, 226, 0.6);
        transform: translateY(-2px);
      }

      .skilltree-reset-btn:active {
        transform: translateY(0);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.45);
        backdrop-filter: blur(10px);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      }

      /* Custom Confirm Dialog */
      .st-confirm-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #000000cc;
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        animation: fadeIn 0.2s ease;
      }

      .st-confirm-dialog {
        background: linear-gradient(135deg, #0a0a10 0%, #08080d 100%);
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 2px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 0 40px rgba(138, 43, 226, 0.35);
        animation: bounceIn 0.3s ease;
      }

      .st-confirm-header {
        padding: 20px;
        border-bottom: 2px solid rgba(138, 43, 226, 0.35);
      }

      .st-confirm-header h3 {
        margin: 0;
        color: #a855f7;
        font-size: 22px;
        font-weight: bold;
        text-align: center;
      }

      .st-confirm-body {
        padding: 25px;
        color: rgba(236, 233, 255, 0.92);
        font-size: 15px;
        line-height: 1.6;
      }

      .st-confirm-body p {
        margin: 0 0 10px 0;
      }

      .st-confirm-body ul {
        margin: 10px 0;
        padding-left: 25px;
      }

      .st-confirm-body li {
        margin: 8px 0;
        color: rgba(236, 233, 255, 0.8);
      }

      .st-confirm-actions {
        display: flex;
        gap: 12px;
        padding: 20px;
        border-top: 2px solid rgba(138, 43, 226, 0.25);
      }

      .st-confirm-btn {
        flex: 1;
        padding: 12px 24px;
        border-radius: 2px;
        font-size: 15px;
        font-weight: bold;
        cursor: pointer;
        outline: none;
        transition: all 0.25s ease;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .st-confirm-cancel {
        background: linear-gradient(135deg, #0d0d14 0%, #0d0d14 100%);
        border: 2px solid rgba(138, 43, 226, 0.35);
        color: rgba(236, 233, 255, 0.9);
      }

      .st-confirm-cancel:hover {
        background: linear-gradient(135deg, #111118 0%, #111118 100%);
        border-color: rgba(168, 85, 247, 0.7);
        transform: translateY(-2px);
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.35);
      }

      .st-confirm-yes {
        background: linear-gradient(135deg, #7a26cc 0%, #4b0082 100%);
        border: 2px solid rgba(168, 85, 247, 0.9);
        color: white;
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.4);
      }

      .st-confirm-yes:hover {
        background: linear-gradient(135deg, rgba(168, 85, 247, 1) 0%, rgba(138, 43, 226, 1) 100%);
        border-color: rgba(168, 85, 247, 1);
        transform: translateY(-2px);
        box-shadow: 0 0 25px rgba(168, 85, 247, 0.55);
      }

      .st-confirm-btn:active {
        transform: translateY(0);
      }
      .skilltree-stat-value {
        color: #fbbf24;
        font-weight: 700;
        text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
      }

      /* Close Button */
      .skilltree-close-btn {
        position: absolute;
        top: 15px;
        right: 15px;
        background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
        color: #f5f3ff;
        border: 1px solid rgba(196, 181, 253, 0.75);
        border-radius: 2px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 18px;
        font-weight: 700;
        box-shadow: 0 4px 15px rgba(138, 43, 226, 0.42);
        transition: all 0.2s;
        z-index: 10;
      }
      .skilltree-close-btn:hover {
        transform: none;
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border-color: rgba(221, 214, 254, 0.95);
        box-shadow: 0 6px 20px rgba(138, 43, 226, 0.6);
      }

      /* Tier Section */
      /* Tier Navigation Bar */
      .skilltree-tier-nav {
        display: flex;
        gap: 8px;
        padding: 16px 20px;
        background: linear-gradient(135deg, #12091e 0%, #0e0716 100%);
        border-bottom: 2px solid rgba(138, 43, 226, 0.2);
        overflow-x: auto;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }

      .skilltree-tier-nav::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }

      .skilltree-tier-nav::-webkit-scrollbar-track {
        background: transparent !important;
      }

      .skilltree-tier-nav::-webkit-scrollbar-thumb {
        background: transparent !important;
        border: none !important;
      }

      .skilltree-tier-nav-btn {
        padding: 10px 20px;
        background: linear-gradient(135deg, #0d0d14 0%, #08080d 100%);
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 2px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.2);
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .skilltree-tier-nav-btn:hover {
        border-color: rgba(138, 43, 226, 0.8);
        background: linear-gradient(135deg, #2a1548 0%, #1e0f36 100%);
        box-shadow: 0 0 25px rgba(138, 43, 226, 0.5);
        transform: translateY(-2px);
        color: #fff;
      }

      .skilltree-tier-nav-btn:active {
        transform: translateY(0);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.3);
      }

      .skilltree-tier-nav-btn.active {
        background: linear-gradient(135deg, #3d1a66 0%, #2e1450 100%);
        border-color: #8a2be2;
        box-shadow: 0 0 30px rgba(138, 43, 226, 0.7);
        color: #fff;
        font-weight: 700;
      }

      .skilltree-tier {
        margin: 35px 0;
        padding: 25px;
        background: linear-gradient(135deg, #110a1e 0%, #0e0818 100%);
        border-radius: 2px;
        border: 1px solid rgba(138, 43, 226, 0.2);
        scroll-margin-top: 20px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
        position: relative;
        overflow: hidden;
      }
      .skilltree-tier::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #8a2be2 0%, #4b0082 50%, #8a2be2 100%);
        background-size: 200% 100%;
        animation: gradientShift 3s ease infinite;
      }
      .skilltree-tier-header {
        color: #fff;
        margin: 0 0 20px 0;
        font-size: 22px;
        font-weight: 700;
        padding-bottom: 12px;
        border-bottom: 2px solid rgba(138, 43, 226, 0.4);
        text-shadow: 0 2px 8px rgba(138, 43, 226, 0.6);
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .skilltree-tier-badge {
        display: inline-block;
        padding: 4px 12px;
        background: linear-gradient(135deg, #8a2be2 0%, #4b0082 100%);
        border-radius: 2px;
        font-size: 12px;
        font-weight: 700;
        color: white;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        box-shadow: 0 2px 8px rgba(138, 43, 226, 0.4);
      }

      /* Skill Card */
      .skilltree-skill {
        background: linear-gradient(135deg, #0a0a12 0%, #08080e 100%);
        border-radius: 2px;
        padding: 18px;
        margin: 12px 0;
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-left: 4px solid #8a2be2;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
      }
      .skilltree-skill::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(138, 43, 226, 0.1), transparent);
        transition: left 0.5s;
      }
      .skilltree-skill:hover {
        transform: translateX(5px);
        border-color: rgba(138, 43, 226, 0.5);
        box-shadow: 0 6px 25px rgba(138, 43, 226, 0.3),
                    0 0 30px rgba(75, 0, 130, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }
      .skilltree-skill:hover::before {
        left: 100%;
      }
      .skilltree-skill.unlocked {
        border-left-color: #00ff88;
        background: linear-gradient(135deg, #081a12 0%, #0a0a12 100%);
      }
      .skilltree-skill.max-level {
        border-left-color: #fbbf24;
        background: linear-gradient(135deg, #1a1508 0%, #0a0a12 100%);
        box-shadow: 0 4px 20px rgba(251, 191, 36, 0.2),
                    0 0 30px rgba(251, 191, 36, 0.1);
      }
      .skilltree-skill-name {
        font-weight: 700;
        color: #fff;
        margin-bottom: 6px;
        font-size: 16px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        letter-spacing: 0.3px;
      }
      .skilltree-skill-desc {
        color: #cbd5e1;
        font-size: 13px;
        margin-bottom: 10px;
        line-height: 1.5;
      }
      .skilltree-skill-lore {
        color: #a855f7;
        font-size: 11px;
        font-style: italic;
        margin-top: 6px;
        padding-left: 12px;
        border-left: 2px solid rgba(168, 85, 247, 0.3);
      }
      .skilltree-skill-level {
        color: #00ff88;
        font-size: 12px;
        margin-top: 10px;
        margin-bottom: 6px;
        font-weight: 600;
        text-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
      }
      .skilltree-skill-effects {
        color: #00ff88;
        font-size: 11px;
        margin-top: 8px;
        padding: 8px;
        background: #081a12;
        border-radius: 2px;
        border: 1px solid rgba(0, 255, 136, 0.25);
      }
      .skilltree-skill-cost {
        color: #fbbf24;
        font-size: 12px;
        font-weight: 600;
        margin-top: 8px;
        text-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
      }
      .skilltree-skill-max {
        color: #fbbf24;
        font-size: 12px;
        font-weight: 700;
        margin-top: 8px;
        text-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .skilltree-btn-group {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      .skilltree-upgrade-btn {
        background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
        color: white;
        border: none;
        border-radius: 2px;
        padding: 10px 20px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 4px 15px rgba(0, 255, 136, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        flex: 1;
      }
      .skilltree-upgrade-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 255, 136, 0.6),
                    inset 0 1px 0 rgba(255, 255, 255, 0.3);
        background: linear-gradient(135deg, #00ff88 0%, #00ff88 100%);
      }
      .skilltree-upgrade-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      .skilltree-upgrade-btn:disabled {
        background: linear-gradient(135deg, #475569 0%, #334155 100%);
        cursor: not-allowed;
        opacity: 0.5;
        box-shadow: none;
      }
      .skilltree-max-btn {
        background: linear-gradient(135deg, #8a2be2 0%, #4b0082 100%);
        color: white;
        border: none;
        border-radius: 2px;
        padding: 10px 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 4px 15px rgba(138, 43, 226, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .skilltree-max-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(138, 43, 226, 0.6),
                    inset 0 1px 0 rgba(255, 255, 255, 0.3);
        background: linear-gradient(135deg, #4b0082 0%, #8a2be2 100%);
      }
      .skilltree-max-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      .skilltree-max-btn:disabled {
        background: linear-gradient(135deg, #475569 0%, #334155 100%);
        cursor: not-allowed;
        opacity: 0.5;
        box-shadow: none;
      }

      /* Scrollbar - Hidden but scrollable */
      .skilltree-modal-content::-webkit-scrollbar {
        width: 0px;
        background: transparent;
      }
      .skilltree-modal-content {
        scrollbar-width: none;  /* Firefox */
        -ms-overflow-style: none;  /* IE 10+ */
      }

      /* ===== ACTIVE SKILLS SECTION ===== */
      .skilltree-active-section {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 2px solid rgba(138, 43, 226, 0.3);
      }
      .skilltree-active-section-header {
        font-size: 16px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.95);
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .skilltree-mana-bar-container {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
        padding: 10px 14px;
        background: #08080e;
        border-radius: 2px;
        border: 1px solid rgba(0, 100, 255, 0.3);
      }
      .skilltree-mana-bar-label {
        font-size: 13px;
        font-weight: 600;
        color: rgba(100, 180, 255, 0.9);
        white-space: nowrap;
      }
      .skilltree-mana-bar-track {
        flex: 1;
        height: 12px;
        background: #060608;
        border-radius: 2px;
        overflow: hidden;
        position: relative;
      }
      .skilltree-mana-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #1e64ff 0%, #64b4ff 100%);
        border-radius: 2px;
        transition: width 0.5s ease;
        box-shadow: 0 0 8px rgba(30, 100, 255, 0.5);
      }
      .skilltree-mana-bar-text {
        font-size: 12px;
        font-weight: 600;
        color: rgba(100, 180, 255, 0.9);
        white-space: nowrap;
        min-width: 65px;
        text-align: right;
      }

      /* Active Skill Card */
      .skilltree-active-skill {
        padding: 14px 16px;
        margin-bottom: 10px;
        background: linear-gradient(135deg, #0a0a12 0%, #0c0c14 100%);
        border: 1px solid rgba(138, 43, 226, 0.25);
        border-radius: 2px;
        transition: all 0.3s ease;
      }
      .skilltree-active-skill:hover {
        border-color: rgba(138, 43, 226, 0.5);
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.15);
      }
      .skilltree-active-skill.is-active {
        border-color: rgba(0, 255, 136, 0.6);
        box-shadow: 0 0 15px rgba(0, 255, 136, 0.15);
        background: linear-gradient(135deg, #081a12 0%, #0a0a12 100%);
      }
      .skilltree-active-skill.is-locked {
        opacity: 0.45;
        filter: grayscale(0.4);
      }
      .skilltree-active-skill-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      .skilltree-active-skill-name {
        font-size: 14px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.95);
      }
      .skilltree-active-skill-cost {
        font-size: 12px;
        font-weight: 600;
        color: rgba(100, 180, 255, 0.9);
      }
      .skilltree-active-skill-desc {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        margin-bottom: 6px;
        line-height: 1.3;
      }
      .skilltree-active-skill-lore {
        font-size: 11px;
        color: rgba(138, 43, 226, 0.7);
        font-style: italic;
        margin-bottom: 8px;
      }
      .skilltree-active-skill-info {
        display: flex;
        gap: 12px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 8px;
      }
      .skilltree-active-skill-info span {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .skilltree-active-skill-status {
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .skilltree-active-skill-status.active-text {
        color: #00ff88;
      }
      .skilltree-active-skill-status.cooldown-text {
        color: #ff4444;
      }

      /* Activate Button */
      .skilltree-activate-btn {
        width: 100%;
        padding: 8px 16px;
        border-radius: 2px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        border: 2px solid rgba(138, 43, 226, 0.6);
        background: linear-gradient(135deg, #6a1fb3 0%, #4b0082 100%);
        color: white;
        transition: all 0.3s ease;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .skilltree-activate-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #9a4de6 0%, #7a26cc 100%);
        border-color: rgba(168, 85, 247, 0.9);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.4);
        transform: translateY(-1px);
      }
      .skilltree-activate-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        background: #0d0d14;
        border-color: rgba(138, 43, 226, 0.2);
      }
      .skilltree-activate-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      .skilltree-active-skill-unlock-req {
        font-size: 11px;
        color: rgba(255, 68, 68, 0.8);
        font-style: italic;
      }

      /* Shadow-theme harmonization (kept scoped to SkillTree classes) */
      .skilltree-modal {
        --st-primary-rgb: var(--sl-color-primary-rgb, 138, 43, 226);
        --st-primary: rgb(var(--st-primary-rgb));
        --st-surface: rgba(8, 10, 20, 0.98);
        --st-surface-soft: rgba(12, 15, 30, 0.95);
        --st-text: rgba(236, 233, 255, 0.95);
        --st-text-muted: rgba(236, 233, 255, 0.72);
      }

      .skilltree-modal,
      .st-confirm-dialog {
        background: linear-gradient(145deg, var(--st-surface) 0%, var(--st-surface-soft) 100%);
        border-color: rgba(var(--st-primary-rgb), 0.42);
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.55), 0 0 28px rgba(var(--st-primary-rgb), 0.24);
      }

      .skilltree-header,
      .skilltree-tier-nav,
      .skilltree-tier,
      .skilltree-skill,
      .skilltree-active-skill,
      .skilltree-mana-bar-container {
        background: linear-gradient(145deg, rgba(12, 15, 30, 0.95) 0%, rgba(8, 10, 20, 0.95) 100%);
        border-color: rgba(var(--st-primary-rgb), 0.32);
      }

      .skilltree-header h2,
      .skilltree-tier-header,
      .skilltree-active-section-header {
        color: var(--st-text);
      }

      .skilltree-skill-desc,
      .skilltree-active-skill-desc,
      .skilltree-active-skill-info,
      .skilltree-active-skill-unlock-req {
        color: var(--st-text-muted);
      }

      .skilltree-tier-nav-btn,
      .skilltree-activate-btn,
      .skilltree-max-btn {
        border-color: rgba(var(--st-primary-rgb), 0.72);
      }

      .skilltree-tier-nav-btn.active {
        background: linear-gradient(135deg, rgba(var(--st-primary-rgb), 0.48) 0%, rgba(40, 22, 72, 0.92) 100%);
      }
    `;

function injectSkillTreeCss() {
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.remove();
  }

  try {
    BdApi.DOM.addStyle(STYLE_ID, SKILL_TREE_CSS);
  } catch (error) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = SKILL_TREE_CSS;
    document.head.appendChild(style);
  }
}

module.exports = { injectSkillTreeCss };
