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

  _toast(message, type = "info", timeout = null) {
    if (this._toastEngine) {
      this._toastEngine.showToast(message, type, timeout, { callerId: "testPlugin" });
    } else {
      BdApi.UI.showToast(message, { type: type === "level-up" ? "info" : type });
    }
  }



  start() {
    // Toast engine discovery (unified toast system)
    this._toastEngine = (() => {
      try {
        const p = BdApi.Plugins.get("SoloLevelingToasts");
        return p?.instance?.toastEngineVersion >= 2 ? p.instance : null;
      } catch { return null; }
    })();
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

    this._toast(`${this.pluginId} v${this.version} active`, "success", 2200);

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

    this._toast(`${this.pluginId} stopped`, "info", 2200);
    this._toastEngine = null;
  }
};
