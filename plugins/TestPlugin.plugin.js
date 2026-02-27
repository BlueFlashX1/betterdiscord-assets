/**
 * @name TestPlugin
 * @author Matthew Thompson
 * @description Testing the AI generator
 * @version 1.0.0
 */

module.exports = class TestPlugin {
  constructor() {
    this.pluginId = 'TestPlugin';
    this.version = '1.0.0';
    this.instanceKey = `__${this.pluginId}Instance`;
  }

  start() {
    try {
      // Prevent duplicate instances
      const prev = window[this.instanceKey];
      if (prev && prev !== this && typeof prev.stop === 'function') prev.stop();
      window[this.instanceKey] = this;
    } catch (error) {
      console.warn(
        `[${this.pluginId}] Failed to register singleton instance:`,
        error,
      );
    }

    BdApi.UI.showToast(`${this.pluginId} v${this.version} active`, {
      type: 'success',
      timeout: 2200,
    });

    // --- AI HYDRATION ZONE ---
    // Inject styles, observers, or logic here
    // -------------------------
  }

  stop() {
    try {
      delete window[this.instanceKey];
    } catch (error) {
      console.warn(
        `[${this.pluginId}] Failed to clear singleton instance key:`,
        error,
      );
    }

    // --- AI DEHYDRATION ZONE ---
    // Remove styles and clear intervals here
    // ---------------------------

    BdApi.UI.showToast(`${this.pluginId} stopped`, {
      type: 'info',
      timeout: 2200,
    });
  }
};
