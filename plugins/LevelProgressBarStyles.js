'use strict';

/**
 * Shared CSS builder for LevelProgressBar.
 * Kept in a sidecar module so LevelProgressBar.plugin.js stays focused on logic.
 */
module.exports = function getLevelProgressBarCSS() {
  return `
      .lpb-progress-container {
        position: fixed;
        left: 0;
        right: 0;
        z-index: 999997;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      .lpb-progress-container.top {
        top: 0;
      }

      .lpb-progress-container.bottom {
        bottom: 0;
      }

      .lpb-progress-bar {
        width: 100%;
        background: rgba(10, 10, 15, 0.95);
        border-bottom: 2px solid rgba(138, 43, 226, 0.5);
        padding: 19px 20px 19px 80px;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        box-shadow: 0 2px 10px rgba(138, 43, 226, 0.3);
        backdrop-filter: blur(10px);
      }

      .lpb-progress-bar-content {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0;
        flex-shrink: 0;
      }

      .lpb-progress-container.bottom .lpb-progress-bar {
        border-bottom: none;
        border-top: 2px solid rgba(138, 43, 226, 0.5);
        box-shadow: 0 -2px 10px rgba(138, 43, 226, 0.3);
      }

      .lpb-progress-bar.compact {
        padding: 11px 15px 11px 80px;
      }

      .lpb-progress-text {
        font-size: 14px;
        font-weight: 600;
        color: #a78bfa;
        text-shadow: 0 0 8px rgba(167, 139, 250, 0.6);
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: 'Orbitron', sans-serif;
        flex-shrink: 0;
        line-height: 1;
      }

      .lpb-recon-text {
        color: #bfdbfe;
        font-size: 13px;
        font-weight: 600;
        text-shadow: 0 0 6px rgba(191, 219, 254, 0.45);
        white-space: nowrap;
        line-height: 1;
        font-family: 'Orbitron', sans-serif;
        margin-left: auto;
        margin-right: 110px;
        max-width: min(42vw, 520px);
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: right;
        display: none;
      }

      .lpb-recon-text.is-visible {
        display: block;
      }

      .lpb-progress-bar.compact .lpb-recon-text {
        font-size: 12px;
        margin-right: 102px;
      }

      .lpb-progress-track {
        width: auto;
        flex: 1 1 auto;
        min-width: 180px;
        max-width: 980px;
        height: 12px;
        background: rgba(20, 20, 30, 0.8);
        border-radius: 999px;
        overflow: hidden;
        position: relative;
        border: none !important;
        box-shadow: none !important;
        filter: none !important;
        align-self: center;
        flex-shrink: 0;
      }

      /* Consolidated level-up animation (owned by LevelProgressBar) */
      .lpb-levelup-overlay {
        position: fixed;
        left: 0;
        right: 0;
        pointer-events: none;
        z-index: 999998;
      }

      .lpb-levelup-overlay.top {
        top: 0;
      }

      .lpb-levelup-overlay.bottom {
        bottom: 0;
      }

      .lpb-levelup-banner {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 16px;
        border-radius: 10px;
        background: rgba(10, 10, 15, 0.92);
        border: 1px solid rgba(138, 43, 226, 0.55);
        color: #a78bfa;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        box-shadow: 0 10px 30px rgba(138, 43, 226, 0.25);
        text-shadow: 0 0 10px rgba(167, 139, 250, 0.6);
        animation: lpb-levelup-pop 1200ms ease-out forwards;
        will-change: transform, opacity;
      }

      .lpb-levelup-overlay.top .lpb-levelup-banner {
        top: 38px;
      }

      .lpb-levelup-overlay.bottom .lpb-levelup-banner {
        bottom: 38px;
      }

      @keyframes lpb-levelup-pop {
        0% {
          opacity: 0;
          transform: translateX(-50%) translateY(0) scale(0.75);
        }
        15% {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1.05);
        }
        100% {
          opacity: 0;
          transform: translateX(-50%) translateY(-14px) scale(1);
        }
      }

      /* XP glow animation - pulse handled by lpb-xp-pulse keyframes below */

      @keyframes lpb-xp-glow {
        /* Reserved for future glow effects */
      }

      .lpb-compact .lpb-progress-track {
        height: 8px;
      }

      .lpb-progress-fill {
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, #8a2be2 0%, #7b27cc 50%, #6c22b6 100%);
        border-radius: inherit;
        transform-origin: left center;
        transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
        will-change: transform;
      }

      /* Shimmer animation overlay */
      .lpb-progress-fill::before {
        content: '';
        position: absolute;
        top: 0;
        left: -140%;
        width: 140%;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.45) 50%,
          transparent 100%
        );
        animation: lpb-shimmer 2s infinite;
        display: block !important;
        mix-blend-mode: screen;
      }

      /* Optional shimmer toggle + reduced motion support */
      .lpb-progress-bar.lpb-no-shimmer .lpb-progress-fill::before {
        animation: none !important;
        display: none !important;
      }

      @media (prefers-reduced-motion: reduce) {
        .lpb-progress-fill {
          transition: none !important;
        }
        .lpb-progress-fill::before {
          /* Respect reduced-motion for movement-heavy effects, but keep shimmer available
             (user preference may still want shimmer). Slow it down instead of disabling. */
          animation-duration: 4s !important;
          opacity: 0.25;
        }
        .lpb-levelup-banner {
          animation: none !important;
          opacity: 0;
        }
      }

      /* XP gain pulse animation */
      .lpb-progress-fill.lpb-xp-gain {
        animation: lpb-xp-pulse 0.6s ease-out;
      }

      @keyframes lpb-xp-pulse {
        0% {
          box-shadow: 0 0 10px rgba(138, 43, 226, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
        }
        50% {
          box-shadow: 0 0 20px rgba(138, 43, 226, 0.8), inset 0 0 30px rgba(167, 139, 250, 0.6);
          /* No transform here — scaleY would override the inline scaleX
             that controls fill width, making the bar flash to 100%. */
        }
        100% {
          box-shadow: 0 0 10px rgba(138, 43, 226, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
        }
      }

      /* Subtle glow effect on hover */
      .lpb-progress-fill:hover {
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.7), inset 0 0 25px rgba(167, 139, 250, 0.4);
      }

      /* Sparkle particles */
      .lpb-progress-track .lpb-sparkle {
        position: absolute;
        width: 4px;
        height: 4px;
        background: rgba(138, 43, 226, 0.9);
        border-radius: 50%;
        pointer-events: none;
        animation: lpb-sparkle-float 2s infinite;
        box-shadow: 0 0 8px rgba(138, 43, 226, 0.9);
        top: 50%;
        transform: translateY(-50%);
      }

      /* Milestone markers */
      .lpb-progress-track .lpb-milestone {
        position: absolute;
        top: -10px;
        width: 2px;
        height: 32px;
        background: rgba(138, 43, 226, 0.6);
        pointer-events: none;
        z-index: 1;
      }

      .lpb-progress-track .lpb-milestone::after {
        content: '';
        position: absolute;
        top: -5px;
        left: -4px;
        width: 10px;
        height: 10px;
        background: rgba(138, 43, 226, 0.9);
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(138, 43, 226, 0.8);
        animation: lpb-milestone-pulse 2s infinite;
      }

      @keyframes lpb-sparkle {
        0%, 100% { opacity: 0; }
        50% { opacity: 1; }
      }

      @keyframes lpb-sparkle-float {
        0% {
          opacity: 0;
          transform: translateY(-50%) scale(0);
        }
        50% {
          opacity: 1;
          transform: translateY(-60%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateY(-70%) scale(0);
        }
      }

      @keyframes lpb-milestone-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 0.9;
        }
        50% {
          transform: scale(1.3);
          opacity: 1;
        }
      }

      @keyframes lpb-shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(300%);
        }
      }

      .lpb-xp-text {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.8);
        white-space: nowrap;
        font-family: 'Press Start 2P', monospace;
      }

      .lpb-compact .lpb-xp-text {
        font-size: 9px;
      }
  `;
};
