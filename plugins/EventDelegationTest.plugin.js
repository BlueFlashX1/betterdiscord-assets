/**
 * @name EventDelegationTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

/**
 * TABLE OF CONTENTS
 * 1) Lifecycle
 * 2) Root Delegation Handler
 * 3) Action Handlers
 */

module.exports = class EventDelegationTest {
  constructor() {
    this.pluginId = 'EventDelegationTest';
    this.version = '1.0.0';
    this._controller = null;
    this._delegatedActions = new Set(['save', 'reload']);

    // Bind the single root handler
    this.onRootClick = this.onRootClick.bind(this);
  }

  // =========================================================================
  // 1) LIFECYCLE
  // =========================================================================
  start() {
    // Restart-safe: always use a fresh AbortController.
    if (this._controller && !this._controller.signal.aborted) {
      this._controller.abort();
    }
    this._controller = new AbortController();
    document.removeEventListener('click', this.onRootClick);

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
    document.removeEventListener('click', this.onRootClick);
    if (this._controller && !this._controller.signal.aborted) {
      this._controller.abort();
    }
    this._controller = null;
    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  // =========================================================================
  // 2) ROOT DELEGATION HANDLER
  // Catches every click in the document tree via event bubbling.
  // Uses event.target.closest() to safely walk up the DOM tree and find
  // the nearest matching element, even if the click was on a child node.
  // =========================================================================
  onRootClick(event) {
    const sourceNode = event.target;
    if (!(sourceNode instanceof Element)) return;

    // --- PATTERN 1: data-action attributes ---
    // Match elements with [data-action] attributes and dispatch to methods
    const actionEl = sourceNode.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      if (action && this._delegatedActions.has(action) && typeof this[action] === 'function') {
        this[action](actionEl, event);
        return;
      }
    }

    // --- PATTERN 2: CSS class-based delegation ---
    // Match elements by class name for structural interactions
    const menuItem = sourceNode.closest('.bd-delegated-menu-item');
    if (menuItem) {
      this.onMenuItemClick(menuItem, event);
      return;
    }

    // --- AI HYDRATION ZONE ---
    // Add more delegation patterns here using event.target.closest('selector')
    // -------------------------
  }

  // =========================================================================
  // 3) ACTION HANDLERS
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
