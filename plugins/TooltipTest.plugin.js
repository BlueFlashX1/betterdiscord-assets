/**
 * @name TooltipTest
 * @author Matthew Thompson
 * @description A new BetterDiscord plugin
 * @version 1.0.0
 */

module.exports = class TooltipTest {
  constructor() {
    this.pluginId = 'TooltipTest';
    this.version = '1.0.0';
    this._cssId = this.pluginId + '-css';
    this._controller = new AbortController();
    this._activeTooltip = null;

    // Bind handlers
    this.onMouseEnter = this.onMouseEnter.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);
  }

  start() {
    this.injectCSS();

    // Use mouseenter/mouseleave (NOT mouseover/mouseout) to avoid
    // false triggers when moving between child elements.
    // Reference: https://javascript.info/mousemove-mouseover-mouseout-mouseenter-mouseleave
    //
    // We delegate from document using capture phase so we can catch
    // mouseenter on any element with [data-tooltip].
    document.addEventListener('mouseover', this.onMouseEnter, {
      signal: this._controller.signal,
    });
    document.addEventListener('mouseout', this.onMouseLeave, {
      signal: this._controller.signal,
    });

    BdApi.UI.showToast(this.pluginId + ' Tooltip Engine Active', {
      type: 'success',
    });
  }

  stop() {
    this._controller.abort();
    this.removeTooltip();
    BdApi.DOM.removeStyle(this._cssId);
    BdApi.UI.showToast(this.pluginId + ' Stopped', { type: 'info' });
  }

  injectCSS() {
    const css = `
      .${this.pluginId}-tooltip {
        position: fixed;
        z-index: 99999;
        padding: 8px 12px;
        background: var(--background-floating, #18191c);
        color: var(--text-normal, #dcddde);
        border-radius: 5px;
        font-size: 14px;
        box-shadow: var(--elevation-high, 0 8px 16px rgba(0,0,0,0.24));
        pointer-events: none;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        max-width: 300px;
        word-wrap: break-word;
      }
      .${this.pluginId}-tooltip.visible {
        opacity: 1;
        transform: translateY(0);
      }
    `;
    BdApi.DOM.addStyle(this._cssId, css);
  }

  // =========================================================================
  // MOUSE ENTER HANDLER
  // Uses event.target.closest() to find the nearest [data-tooltip] ancestor.
  // Reference: https://javascript.info/event-delegation#the-behavior-pattern
  // =========================================================================
  onMouseEnter(event) {
    const target = event.target.closest('[data-tooltip]');
    if (!target) return;

    this.removeTooltip();

    const text = target.dataset.tooltip;
    if (!text) return;

    const tooltip = document.createElement('div');
    tooltip.className = this.pluginId + '-tooltip';
    tooltip.textContent = text;
    document.body.appendChild(tooltip);

    // Position using getBoundingClientRect for accuracy
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    // Default: show above the element, centered
    let left = rect.left + (rect.width - tooltipRect.width) / 2;
    let top = rect.top - tooltipRect.height - 8;

    // If tooltip goes above viewport, show below instead
    if (top < 4) {
      top = rect.bottom + 8;
    }

    // Clamp horizontal position to viewport
    left = Math.max(
      4,
      Math.min(left, window.innerWidth - tooltipRect.width - 4),
    );

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';

    // Trigger animation on next frame
    requestAnimationFrame(() => tooltip.classList.add('visible'));

    this._activeTooltip = tooltip;
    this._activeTarget = target;
  }

  onMouseLeave(event) {
    const target = event.target.closest('[data-tooltip]');
    if (!target || target !== this._activeTarget) return;

    // Check if we're moving to a child of the same target
    if (target.contains(event.relatedTarget)) return;

    this.removeTooltip();
  }

  removeTooltip() {
    if (this._activeTooltip) {
      this._activeTooltip.remove();
      this._activeTooltip = null;
      this._activeTarget = null;
    }
  }
};
