/**
 * @name HSLWheelBridge
 * @description Makes horizontal wheel gestures work on rotated Horizontal Server List by mapping deltaX/Shift+wheel into scrollTop.
 * @version 1.1.0
 * @author Solo Leveling Theme Dev
 */

module.exports = class HSLWheelBridge {
  start() {
    this.selector =
      "nav[aria-label='Servers sidebar'] ul[role='tree'] > div[class^='itemsContainer_'] > div[class^='stack_'][class*='scroller_'][class*='scrollerBase_']";
    this.onWheel = this.onWheel.bind(this);
    this.observe = this.observe.bind(this);

    this.attachToScroller();
    this.observer = new MutationObserver(this.observe);
    this.observer.observe(document.body, { childList: true, subtree: true });

    BdApi.UI.showToast('HSLWheelBridge active', { type: 'success', timeout: 2000 });
  }

  stop() {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
    this.detachFromScroller();
    BdApi.UI.showToast('HSLWheelBridge stopped', { type: 'info', timeout: 2000 });
  }

  observe() {
    const scroller = document.querySelector(this.selector);
    if (scroller !== this.scroller) this.attachToScroller();
  }

  attachToScroller() {
    this.detachFromScroller();
    const scroller = document.querySelector(this.selector);
    if (!scroller) return;
    scroller.addEventListener('wheel', this.onWheel, { passive: false });
    this.scroller = scroller;
  }

  detachFromScroller() {
    if (!this.scroller) return;
    this.scroller.removeEventListener('wheel', this.onWheel);
    this.scroller = null;
  }

  onWheel(event) {
    if (!this.scroller) return;

    const hasHorizontalGesture = Math.abs(event.deltaX) > 0.01;
    const shiftWheel = event.shiftKey && Math.abs(event.deltaY) > 0.01;

    // Block pure vertical scrolls on the dock — they shouldn't do anything.
    if (!hasHorizontalGesture && !shiftWheel) {
      if (Math.abs(event.deltaY) > 0.01) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    const delta = hasHorizontalGesture ? event.deltaX : event.deltaY;
    this.scroller.scrollTop += delta;
    event.preventDefault();
    event.stopPropagation();
  }
};

