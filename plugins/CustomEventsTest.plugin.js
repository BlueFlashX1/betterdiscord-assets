/**
 * @name CustomEventsTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

module.exports = class CustomEventsTest {
  constructor() {
    this.pluginId = 'CustomEventsTest';
    this.version = '1.0.0';
    this._controller = new AbortController();
    this._eventPrefix = this.pluginId + ':';
  }

  start() {
    this.registerListeners();
    BdApi.UI.showToast(this.pluginId + ' Event Bus Active', {
      type: 'success',
    });

    // Example: emit an event that other plugins or internal code can listen for
    this.emit('ready', { timestamp: Date.now() });
  }

  stop() {
    this._controller.abort();
    this.emit('shutdown', { timestamp: Date.now() });
    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  // =========================================================================
  // EVENT BUS: EMIT
  // Reference: https://javascript.info/dispatch-events
  //
  // Uses CustomEvent with { bubbles: true } so any ancestor can catch it.
  // The 'detail' property carries arbitrary payload data without conflicting
  // with native event properties.
  // =========================================================================
  emit(eventName, data = {}) {
    const fullName = this._eventPrefix + eventName;
    const event = new CustomEvent(fullName, {
      bubbles: true,
      cancelable: true,
      detail: {
        source: this.pluginId,
        ...data,
      },
    });
    document.dispatchEvent(event);
  }

  // =========================================================================
  // EVENT BUS: LISTEN
  // Register internal listeners for your own events.
  // Other plugins can also listen: document.addEventListener('PluginName:eventName', ...)
  // =========================================================================
  registerListeners() {
    // Listen for our own events
    this.on('ready', (detail) => {
      console.log('[' + this.pluginId + '] Ready at', detail.timestamp);
    });

    // --- AI HYDRATION ZONE ---
    // Register cross-plugin listeners here.
    // Example: Listen for another plugin's events:
    // document.addEventListener('ShadowArmy:combat-start', (e) => {
    //   console.log('Combat started!', e.detail);
    // }, { signal: this._controller.signal });
    // -------------------------
  }

  // Convenience wrapper for listening to namespaced events
  on(eventName, handler) {
    const fullName = this._eventPrefix + eventName;
    document.addEventListener(
      fullName,
      (e) => {
        handler(e.detail, e);
      },
      { signal: this._controller.signal },
    );
  }

  // =========================================================================
  // CROSS-PLUGIN COMMUNICATION
  // Any plugin can emit events that others consume. This creates a
  // loosely-coupled plugin ecosystem.
  //
  // Plugin A: this.emit('xp-gained', { amount: 50, source: 'dungeon' });
  // Plugin B: document.addEventListener('PluginA:xp-gained', (e) => { ... });
  // =========================================================================
};
