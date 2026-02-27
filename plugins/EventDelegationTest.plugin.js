/**
 * @name EventDelegationTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

module.exports = class EventDelegationTest {
  constructor() {
    this.pluginId = 'EventDelegationTest';
    this.version = '1.0.0';
    this._controller = new AbortController();

    // Bind the single root handler
    this.onRootClick = this.onRootClick.bind(this);
  }

  start() {
    // One listener on document catches ALL bubbling clicks
    // This is far more efficient than attaching listeners to individual elements
    // Reference: https://javascript.info/event-delegation
    document.addEventListener('click', this.onRootClick, {
      signal: this._controller.signal,
    });
    BdApi.UI.showToast(this.pluginId + ' Event Delegation Active', {
      type: 'success',
    });
  }

  stop() {
    this._controller.abort();
    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  // =========================================================================
  // SINGLE ROOT HANDLER
  // Catches every click in the document tree via event bubbling.
  // Uses event.target.closest() to safely walk up the DOM tree and find
  // the nearest matching element, even if the click was on a child node.
  // =========================================================================
  onRootClick(event) {
    // --- PATTERN 1: data-action attributes ---
    // Match elements with [data-action] attributes and dispatch to methods
    const actionEl = event.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      if (typeof this[action] === 'function') {
        this[action](actionEl, event);
        return;
      }
    }

    // --- PATTERN 2: CSS class-based delegation ---
    // Match elements by class name for structural interactions
    const menuItem = event.target.closest('.bd-delegated-menu-item');
    if (menuItem) {
      this.onMenuItemClick(menuItem, event);
      return;
    }

    // --- AI HYDRATION ZONE ---
    // Add more delegation patterns here using event.target.closest('selector')
    // -------------------------
  }

  // =========================================================================
  // ACTION HANDLERS
  // These methods are called automatically when a [data-action="methodName"]
  // element is clicked anywhere in the document.
  // =========================================================================

  // Example: <button data-action="save">Save</button>
  save(element, event) {
    BdApi.UI.showToast('Save action triggered', { type: 'success' });
  }

  // Example: <button data-action="reload">Reload</button>
  reload(element, event) {
    BdApi.UI.showToast('Reload action triggered', { type: 'info' });
  }

  onMenuItemClick(element, event) {
    // --- AI HYDRATION ZONE ---
    // Handle delegated menu item clicks
    // -------------------------
  }
};
