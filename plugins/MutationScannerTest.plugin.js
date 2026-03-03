/**
 * @name MutationScannerTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

/**
 * TABLE OF CONTENTS
 * 1) Lifecycle
 * 2) Mutation Observer Engine
 * 3) Mutation Processing
 */

module.exports = class MutationScannerTest {
  constructor() {
    this.pluginId = 'MutationScannerTest';
    this.version = '1.0.0';
    this._observer = null;
    this._debounceTimer = null;
    this._cssId = this.pluginId + '-css';
    this._isRunning = false;

    // --- CONFIGURATION ---
    this.debounceMs = 150; // Prevents lag from rapid DOM changes
    this.targetSelector = '#app-mount'; // Root observation target
    this.watchSelectors = [
      '[class*="message_"]', // Chat messages
      '[class*="membersWrap_"]', // Members list
      '[class*="channelTextArea"]', // Chat input area
    ];
  }

  // =========================================================================
  // 1) LIFECYCLE
  // =========================================================================
  start() {
    // Restart-safe lifecycle: clear previous observer/timers before reattach.
    this.stop({ silent: true });

    this.startObserver();
    this._isRunning = true;
    BdApi.UI.showToast(this.pluginId + ' Mutation Scanner Active', {
      type: 'success',
    });
  }

  stop({ silent = false } = {}) {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
    this._isRunning = false;
    BdApi.DOM.removeStyle(this._cssId);
    if (!silent) {
      BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
    }
  }

  // =========================================================================
  // 2) MUTATION OBSERVER ENGINE
  // Reference: https://javascript.info/mutation-observer
  //
  // Key insight from the tutorial: MutationObserver batches mutations into
  // microtask callbacks. If Discord rebuilds a large section of DOM, we
  // could receive hundreds of MutationRecords at once. We MUST debounce
  // or we will freeze the client.
  // =========================================================================
  startObserver() {
    if (this._observer) {
      this._observer.disconnect();
    }
    this._observer = new MutationObserver((mutations) => {
      // Debounce: collapse rapid-fire mutations into a single processing pass
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this.processMutations(mutations);
      }, this.debounceMs);
    });

    const target = document.querySelector(this.targetSelector) || document.body;
    this._observer.observe(target, {
      childList: true, // Watch for added/removed child nodes
      subtree: true, // Watch ALL descendants, not just direct children
      attributes: false, // Ignore attribute changes (too noisy in Discord)
    });
  }

  // =========================================================================
  // 3) MUTATION PROCESSOR
  // Iterates over batched MutationRecords and checks if any addedNodes
  // match our target selectors. This is the safe, performant pattern.
  // =========================================================================
  _getCombinedWatchSelector() {
    const joined = this.watchSelectors.join(',');
    if (joined === this._combinedWatchSelectorRaw) return this._combinedWatchSelector;
    this._combinedWatchSelectorRaw = joined;
    this._combinedWatchSelector = joined || null;
    return this._combinedWatchSelector;
  }

  _resolveMatchedSelector(element) {
    for (const selector of this.watchSelectors) {
      if (element.matches && element.matches(selector)) return selector;
    }
    return null;
  }

  _notifyIfMatch(element, seen) {
    if (seen.has(element)) return;
    const selector = this._resolveMatchedSelector(element);
    if (!selector) return;
    seen.add(element);
    this.onTargetFound(element, selector);
  }

  _processAddedElement(node, combinedSelector, seen) {
    if (node.matches && node.matches(combinedSelector)) {
      this._notifyIfMatch(node, seen);
    }

    if (!node.querySelectorAll) return;
    const matches = node.querySelectorAll(combinedSelector);
    for (const match of matches) {
      this._notifyIfMatch(match, seen);
    }
  }

  processMutations(mutations) {
    if (!this._isRunning) return;
    const combinedSelector = this._getCombinedWatchSelector();
    if (!combinedSelector) return;

    const seen = new WeakSet();

    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;

      for (const node of mutation.addedNodes) {
        // Skip text nodes
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        this._processAddedElement(node, combinedSelector, seen);
      }
    }
  }

  // =========================================================================
  // TARGET HANDLER
  // Called when a watched selector appears in the DOM.
  // =========================================================================
  onTargetFound(element, matchedSelector) {
    // --- AI HYDRATION ZONE ---
    // This fires when Discord renders a matching element.
    // Examples:
    //   - Inject custom CSS classes onto message containers
    //   - Append React portals into newly rendered panels
    //   - Trigger animations when the members list appears
    //
    // console.log('[' + this.pluginId + '] Found:', matchedSelector, element);
    // -------------------------
  }
};
