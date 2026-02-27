/**
 * @name AnimateTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

module.exports = class AnimateTest {
  constructor() {
    this.pluginId = 'AnimateTest';
    this.version = '1.0.0';
    this._activeAnimations = new Set();
  }

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
  // STRUCTURED ANIMATION ENGINE
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
    const start = performance.now();
    let rafId;

    const animationStep = (time) => {
      let timeFraction = (time - start) / duration;
      if (timeFraction > 1) timeFraction = 1;

      // Apply timing function to get the actual animation progress
      const progress = timing(timeFraction);
      draw(progress);

      if (timeFraction < 1) {
        rafId = requestAnimationFrame(animationStep);
        this._activeAnimations.add(rafId);
      } else {
        this._activeAnimations.delete(rafId);
      }
    };

    rafId = requestAnimationFrame(animationStep);
    this._activeAnimations.add(rafId);

    // Return a cancel handle
    return () => {
      cancelAnimationFrame(rafId);
      this._activeAnimations.delete(rafId);
    };
  }

  // =========================================================================
  // TIMING FUNCTIONS
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

  // =========================================================================
  // CONVENIENCE METHODS
  // =========================================================================

  // Fade an element in (0 -> 1 opacity)
  fadeIn(element, duration = 300) {
    element.style.opacity = 0;
    element.style.display = '';
    return this.animate({
      duration,
      timing: this.timings.easeOut,
      draw: (progress) => {
        element.style.opacity = progress;
      },
    });
  }

  // Fade an element out (1 -> 0 opacity)
  fadeOut(element, duration = 300) {
    return this.animate({
      duration,
      timing: this.timings.easeIn,
      draw: (progress) => {
        element.style.opacity = 1 - progress;
      },
    });
  }

  // Slide an element's width from 0 to its natural width
  slideIn(element, duration = 400) {
    const targetWidth = element.scrollWidth;
    element.style.overflow = 'hidden';
    return this.animate({
      duration,
      timing: this.timings.easeOut,
      draw: (progress) => {
        element.style.width = progress * targetWidth + 'px';
      },
    });
  }
};
