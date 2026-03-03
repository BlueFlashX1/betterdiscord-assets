/**
 * @name AnimateTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

/**
 * TABLE OF CONTENTS
 * 1) Lifecycle
 * 2) Animation Core
 * 3) Timing Functions
 */

module.exports = class AnimateTest {
  constructor() {
    this.pluginId = 'AnimateTest';
    this.version = '1.0.0';
    this._activeAnimations = new Set();
  }

  // =========================================================================
  // 1) LIFECYCLE
  // =========================================================================
  start() {
    BdApi.UI.showToast(this.pluginId + ' Animation Engine Active', {
      type: 'success',
    });

    // --- AI HYDRATION ZONE: Demo animation on start ---
    // Example: animate a progress bar or XP counter
    // this.animate({
    //   duration: 1000,
    //   timing: this.timings.easeInOut,
    //   draw: (progress) => { element.style.width = progress * 100 + '%'; }
    // });
    // ---------------------------------------------------
  }

  stop() {
    // Cancel all running animations
    for (const id of this._activeAnimations) {
      cancelAnimationFrame(id);
    }
    this._activeAnimations.clear();
    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  // =========================================================================
  // 2) STRUCTURED ANIMATION ENGINE
  // Reference: https://javascript.info/js-animation#structured-animation
  //
  // animate({ duration, timing, draw })
  //   - duration: total time in ms (e.g. 1000)
  //   - timing(timeFraction): maps elapsed fraction [0..1] to progress [0..1]
  //   - draw(progress): applies the animation at the given progress
  //
  // Returns a cancel() function to stop the animation early
  // =========================================================================
  animate({ duration, timing, draw }) {
    if (typeof timing !== 'function' || typeof draw !== 'function') {
      return () => {};
    }

    const safeDuration = Math.max(1, Number(duration) || 1);
    const start = performance.now();
    let rafId = null;

    const animationStep = (time) => {
      if (rafId !== null) {
        this._activeAnimations.delete(rafId);
      }

      let timeFraction = (time - start) / safeDuration;
      if (timeFraction > 1) timeFraction = 1;

      // Apply timing function to get the actual animation progress
      const progress = timing(timeFraction);
      draw(progress);

      if (timeFraction < 1) {
        rafId = requestAnimationFrame(animationStep);
        this._activeAnimations.add(rafId);
      }
    };

    rafId = requestAnimationFrame(animationStep);
    this._activeAnimations.add(rafId);

    // Return a cancel handle
    return () => {
      if (rafId === null) return;
      cancelAnimationFrame(rafId);
      this._activeAnimations.delete(rafId);
      rafId = null;
    };
  }

  // =========================================================================
  // 3) TIMING FUNCTIONS
  // Reference: https://javascript.info/js-animation#timing-functions
  //
  // Each function takes timeFraction [0..1] and returns progress [0..1].
  // They control the animation curve (acceleration/deceleration).
  // =========================================================================
  get timings() {
    return {
      // Linear: constant speed
      linear: (t) => t,

      // Ease-in: starts slow, accelerates (power of 2)
      easeIn: (t) => t * t,

      // Ease-out: starts fast, decelerates
      easeOut: (t) => 1 - Math.pow(1 - t, 2),

      // Ease-in-out: slow start, fast middle, slow end
      easeInOut: (t) => {
        if (t < 0.5) return 2 * t * t;
        return 1 - Math.pow(-2 * t + 2, 2) / 2;
      },

      // Bounce: bounces at the end
      bounce: (t) => {
        for (let a = 0, b = 1; ; a += b, b /= 2) {
          if (t >= (7 - 4 * a) / 11) {
            return -Math.pow((11 - 6 * a - 11 * t) / 4, 2) + Math.pow(b, 2);
          }
        }
      },

      // Elastic: springy overshoot
      elastic: (t) => {
        return (
          Math.pow(2, 10 * (t - 1)) * Math.cos(((20 * Math.PI * 1.5) / 3) * t)
        );
      },

      // Back: slight overshoot then settle
      back: (t, overshoot = 1.5) => {
        return t * t * ((overshoot + 1) * t - overshoot);
      },
    };
  }

};
