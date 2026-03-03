/**
 * @name ScrollSpyTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

/**
 * TABLE OF CONTENTS
 * 1) Lifecycle
 * 2) Scroll Listener Engine
 * 3) Scroll Processing
 */

module.exports = class ScrollSpyTest {
  constructor() {
    this.pluginId = 'ScrollSpyTest';
    this.version = '1.0.0';
    this._controller = null;
    this._throttleTimer = null;

    // --- CONFIGURATION ---
    this.throttleMs = 100; // Minimum ms between scroll processing
    // Target Discord's main chat scroller
    this.scrollContainerSelector = '[class*="scroller_"][class*="auto_"]';

    // Bind handler
    this.onScroll = this.onScroll.bind(this);
  }

  // =========================================================================
  // 1) LIFECYCLE
  // =========================================================================
  start() {
    if (this._controller && !this._controller.signal.aborted) {
      this._controller.abort();
    }
    this._controller = new AbortController();

    this.attachScrollListeners();
    BdApi.UI.showToast(this.pluginId + ' Scroll Spy Active', {
      type: 'success',
    });
  }

  stop() {
    if (this._controller && !this._controller.signal.aborted) {
      this._controller.abort();
    }
    this._controller = null;
    clearTimeout(this._throttleTimer);
    this._throttleTimer = null;
    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  // =========================================================================
  // 2) SCROLL LISTENER SETUP
  // Reference: https://javascript.info/onscroll
  //
  // Key insight: scroll events fire at EXTREMELY high frequency (60+ times/sec).
  // We MUST throttle or we will lag the entire Discord client.
  //
  // We attach to the document with { capture: true } so we can intercept
  // scroll events from Discord's internal scrollable containers which
  // don't bubble by default.
  // =========================================================================
  attachScrollListeners() {
    document.addEventListener('scroll', this.onScroll, {
      capture: true, // Capture phase to catch non-bubbling scroll events
      passive: true, // Never call preventDefault on scroll (performance)
      signal: this._controller.signal,
    });
  }

  onScroll(event) {
    // Only process scroll events from containers we care about
    const container = event.target;
    if (!container.matches || !container.matches(this.scrollContainerSelector))
      return;

    // Throttle: skip processing if we ran too recently
    if (this._throttleTimer) return;
    this._throttleTimer = setTimeout(() => {
      this._throttleTimer = null;
    }, this.throttleMs);

    this.processScroll(container);
  }

  // =========================================================================
  // 3) SCROLL PROCESSOR
  // Calculates scroll position metrics and dispatches to handlers.
  // =========================================================================
  processScroll(container) {
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const scrollRange = Math.max(0, scrollHeight - clientHeight);

    // How far scrolled as a percentage (0 = top, 1 = bottom)
    const scrollPercent = scrollRange === 0 ? 1 : scrollTop / scrollRange;

    // Distance from bottom in pixels
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Is the user near the bottom? (within 200px)
    const isNearBottom = distanceFromBottom < 200;

    // Is the user at the very top?
    const isAtTop = scrollTop < 10;

    // --- AI HYDRATION ZONE ---
    // React to scroll position here. Examples:
    //
    // Show/hide a "scroll to bottom" button:
    // if (!isNearBottom) this.showScrollButton();
    // else this.hideScrollButton();
    //
    // Lazy-load content when near bottom:
    // if (isNearBottom) this.loadMoreContent();
    //
    // Track read position:
    // console.log('[' + this.pluginId + '] Scroll:', Math.round(scrollPercent * 100) + '%');
    //
    // Trigger animations for elements entering viewport:
    // this.checkVisibleElements(container);
    // -------------------------
  }

};
