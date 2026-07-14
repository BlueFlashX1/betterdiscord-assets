/**
 * Shared portal-transition CSS — injected ONCE by the portal-core consumer
 * refcount (_portalCoreAcquire adds it, the last _portalCoreRelease removes
 * it). Previously this block was duplicated verbatim into BOTH ShadowStep's
 * and ShadowExchange's permanent style tags, doubling the rule set the style
 * engine matched against 24/7 (perf-audit 2026-07-13).
 *
 * Also stripped in that audit: the .ss-transition-plume / .ss-transition-abyss
 * / .ss-mist rules and their three keyframes. No code path ever created those
 * elements — the overlay builder (ShadowPortalCore/index.js ~684-770) creates
 * only .ss-transition-overlay, .ss-portal-css*, .ss-transition-canvas, and
 * .ss-shard. Restore from git history if a CSS-fallback mist effect is ever
 * reintroduced.
 */

const PORTAL_TRANSITION_STYLE_ID = "sl-portal-transition-css";

const PORTAL_TRANSITION_CSS = `
@keyframes ss-mist-css-overlay {
  0% { opacity: 0; }
  14% { opacity: 0.98; }
  56% { opacity: 1; }
  74% { opacity: 0.82; }
  100% { opacity: 0; }
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

/* Stacking inside the overlay (bottom -> top):
 *   1 canvas       — darkness blackout + aperture punch + ring/mist decoration
 *   2 portal image — portal_shadowv2.png, the hero visual
 *   3 shards       — cinders, always in front
 * The canvas MUST stay below the portal image: it paints a full-screen black
 * fill, so anything beneath it is invisible during the dark phase. Before this,
 * the image was appended first (and so buried under the blackout) while the
 * canvas's own ring/mist drew on top of the black — which is why the generated
 * decoration read as the main visual and the PNG barely showed. */
.ss-transition-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  opacity: 1;
  z-index: 1;
}

.ss-shard {
  position: absolute;
  pointer-events: none;
  border-radius: 999px;
  transform-origin: center;
  background: linear-gradient(180deg, rgba(204, 188, 166, 0.78) 0%, rgba(96, 72, 54, 0.54) 52%, rgba(16, 10, 8, 0) 100%);
  box-shadow: 0 0 6px rgba(110, 82, 56, 0.28);
  opacity: 0;
  will-change: transform, opacity;
  z-index: 3;
}

.ss-transition-overlay--waapi .ss-shard {
  animation: none !important;
}

.ss-transition-overlay--css {
  background: radial-gradient(120% 95% at 50% 50%, rgba(8, 8, 12, 0.7) 30%, rgba(0, 0, 0, 0.88) 100%);
  animation: ss-mist-css-overlay var(--ss-total-duration, 1000ms) cubic-bezier(.2,.58,.2,1) forwards;
}

.ss-transition-overlay--css .ss-shard {
  animation: ss-mist-css-shard 900ms cubic-bezier(.22,.61,.36,1) forwards;
  animation-delay: var(--ss-delay, 0ms);
}

.ss-transition-overlay--reduced {
  background: rgba(0, 0, 0, 0.65);
}

.ss-transition-overlay--reduced .ss-shard {
  display: none;
}
`;

module.exports = { PORTAL_TRANSITION_STYLE_ID, PORTAL_TRANSITION_CSS };
