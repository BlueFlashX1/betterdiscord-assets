/**
 * @name MutationScannerTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

module.exports = class MutationScannerTest {
  constructor() {
    this.pluginId = 'MutationScannerTest';
    this.version = '1.0.0';
    this._observer = null;
    this._debounceTimer = null;
    this._cssId = this.pluginId + '-css';

    // --- CONFIGURATION ---
    this.debounceMs = 150; // Prevents lag from rapid DOM changes
    this.targetSelector = '#app-mount'; // Root observation target
    this.watchSelectors = [
      '[class*="message_"]', // Chat messages
      '[class*="membersWrap_"]', // Members list
      '[class*="channelTextArea"]', // Chat input area
    ];
  }

  start() {
    this.startObserver();
    BdApi.UI.showToast(this.pluginId + ' Mutation Scanner Active', {
      type: 'success',
    });
  }

  stop() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    clearTimeout(this._debounceTimer);
    BdApi.DOM.removeStyle(this._cssId);
    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  // =========================================================================
  // MUTATION OBSERVER ENGINE
  // Reference: https://javascript.info/mutation-observer
  //
  // Key insight from the tutorial: MutationObserver batches mutations into
  // microtask callbacks. If Discord rebuilds a large section of DOM, we
  // could receive hundreds of MutationRecords at once. We MUST debounce
  // or we will freeze the client.
  // =========================================================================
  startObserver() {
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
  // MUTATION PROCESSOR
  // Iterates over batched MutationRecords and checks if any addedNodes
  // match our target selectors. This is the safe, performant pattern.
  // =========================================================================
  processMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;

      for (const node of mutation.addedNodes) {
        // Skip text nodes
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        for (const selector of this.watchSelectors) {
          // Check if the added node itself matches
          if (node.matches && node.matches(selector)) {
            this.onTargetFound(node, selector);
          }
          // Check if any descendant of the added node matches
          if (node.querySelectorAll) {
            const matches = node.querySelectorAll(selector);
            matches.forEach((match) => this.onTargetFound(match, selector));
          }
        }
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
