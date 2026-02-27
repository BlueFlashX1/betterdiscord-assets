/**
 * @name ScrollSpyTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

module.exports = class ScrollSpyTest {
  constructor() {
    this.pluginId = 'ScrollSpyTest';
    this.version = '1.0.0';
    this._controller = new AbortController();
    this._throttleTimer = null;

    // --- CONFIGURATION ---
    this.throttleMs = 100; // Minimum ms between scroll processing
    // Target Discord's main chat scroller
    this.scrollContainerSelector = '[class*="scroller_"][class*="auto_"]';

    // Bind handler
    this.onScroll = this.onScroll.bind(this);
  }

  start() {
    this.attachScrollListeners();
    BdApi.UI.showToast(this.pluginId + ' Scroll Spy Active', {
      type: 'success',
    });
  }

  stop() {
    this._controller.abort();
    clearTimeout(this._throttleTimer);
    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  // =========================================================================
  // SCROLL LISTENER SETUP
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
  // SCROLL PROCESSOR
  // Calculates scroll position metrics and dispatches to handlers.
  // =========================================================================
  processScroll(container) {
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // How far scrolled as a percentage (0 = top, 1 = bottom)
    const scrollPercent = scrollTop / (scrollHeight - clientHeight);

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

  // =========================================================================
  // VISIBILITY CHECK UTILITY
  // Determines if an element is currently visible within a scroll container.
  // Useful for triggering animations or lazy-loading when elements scroll
  // into view.
  // =========================================================================
  isElementVisible(element, container) {
    const elemRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    return (
      elemRect.top < containerRect.bottom && elemRect.bottom > containerRect.top
    );
  }

  // =========================================================================
  // SCROLL-TO UTILITY
  // Smoothly scrolls a container to a target position.
  // =========================================================================
  scrollTo(container, targetTop, smooth = true) {
    container.scrollTo({
      top: targetTop,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }

  scrollToBottom(container, smooth = true) {
    this.scrollTo(container, container.scrollHeight, smooth);
  }
};
