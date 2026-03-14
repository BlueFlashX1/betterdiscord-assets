/**
 * Tracked timer utilities for clean timeout/interval management.
 * Replaces the identical tracked-timeout pattern duplicated in
 * LevelProgressBar and SoloLevelingToasts.
 *
 * Usage:
 *   const { createTrackedTimers } = require("../shared/tracked-timers");
 *   const timers = createTrackedTimers();
 *
 *   timers.setTimeout(() => doSomething(), 1000);
 *   timers.setInterval(() => poll(), 5000);
 *   // In stop():
 *   timers.clearAll();  // cleans up everything
 */

/**
 * Create tracked timer utilities. All created timeouts and intervals
 * are tracked and can be bulk-cleared via clearAll().
 * @returns {{ setTimeout: Function, clearTimeout: Function, setInterval: Function, clearInterval: Function, clearAll: Function }}
 */
function createTrackedTimers() {
  const timeoutIds = new Set();
  const intervalIds = new Set();

  return {
    setTimeout(fn, delay) {
      const id = setTimeout(() => {
        timeoutIds.delete(id);
        fn();
      }, delay);
      timeoutIds.add(id);
      return id;
    },
    clearTimeout(id) {
      clearTimeout(id);
      timeoutIds.delete(id);
    },
    setInterval(fn, delay) {
      const id = setInterval(fn, delay);
      intervalIds.add(id);
      return id;
    },
    clearInterval(id) {
      clearInterval(id);
      intervalIds.delete(id);
    },
    clearAll() {
      timeoutIds.forEach(id => clearTimeout(id));
      timeoutIds.clear();
      intervalIds.forEach(id => clearInterval(id));
      intervalIds.clear();
    }
  };
}

module.exports = { createTrackedTimers };
