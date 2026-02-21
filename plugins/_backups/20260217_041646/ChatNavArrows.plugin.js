/**
 * @name ChatNavArrows
 * @description Replaces the "Jump to Present" bar with a compact down-arrow button, and adds an up-arrow button to jump to the first message in the channel.
 * @version 1.1.0
 * @author Solo Leveling Theme Dev
 */

module.exports = class ChatNavArrows {
  constructor() {
    this.observer = null;
    this.scrollListeners = new Map();
    this.styleEl = null;
  }

  start() {
    this.injectStyles();
    this.patchAll();
    this.observer = new MutationObserver(() => this.patchAll());
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
    // Remove scroll listeners
    this.scrollListeners.forEach((handler, scroller) => {
      scroller.removeEventListener("scroll", handler);
    });
    this.scrollListeners.clear();
    // Restore hidden bars
    document.querySelectorAll('div[class^="jumpToPresentBar_"]').forEach(bar => {
      bar.style.display = "";
    });
    // Remove injected buttons
    document.querySelectorAll(".sl-chat-nav-arrow").forEach(el => el.remove());
  }

  injectStyles() {
    if (this.styleEl) return;
    this.styleEl = document.createElement("style");
    this.styleEl.id = "sl-chat-nav-arrows-css";
    this.styleEl.textContent = `
      /* Hide native jump-to-present bars globally */
      div[class^="jumpToPresentBar_"] {
        display: none !important;
      }

      .sl-chat-nav-arrow {
        position: absolute;
        z-index: 3;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(8, 10, 20, 0.92);
        border: 1px solid rgba(138, 43, 226, 0.45);
        color: #b48cff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease,
                    box-shadow 0.15s ease, transform 0.15s ease,
                    opacity 0.2s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        right: 24px;
        pointer-events: auto;
        opacity: 0;
        pointer-events: none;
      }
      .sl-chat-nav-arrow.sl-visible {
        opacity: 1;
        pointer-events: auto;
      }
      .sl-chat-nav-arrow:hover {
        background: rgba(138, 43, 226, 0.2);
        border-color: #8a2be2;
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.35);
        transform: scale(1.1);
      }
      .sl-chat-nav-arrow:active {
        transform: scale(0.95);
      }
      .sl-chat-nav-arrow svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }
      .sl-chat-nav-down {
        bottom: 24px;
      }
      .sl-chat-nav-up {
        bottom: 68px;
      }
    `;
    document.head.appendChild(this.styleEl);
  }

  patchAll() {
    const wrappers = document.querySelectorAll('div[class^="messagesWrapper_"]');
    wrappers.forEach(wrapper => this.ensureArrows(wrapper));
  }

  ensureArrows(wrapper) {
    // Don't double-inject
    if (wrapper.querySelector(".sl-chat-nav-down")) return;

    const scroller = wrapper.querySelector('div[class^="scroller_"]');
    if (!scroller) return;

    wrapper.style.position = "relative";

    // Create down arrow — scrolls to bottom (present)
    const downBtn = this.createArrowButton("down", () => {
      // Try Discord's native jump button first (handles loading newer messages)
      const nativeBar = wrapper.querySelector('div[class^="jumpToPresentBar_"]');
      const nativeBtn = nativeBar ? nativeBar.querySelector("button") : null;
      if (nativeBtn) {
        // Temporarily unhide so click registers
        nativeBar.style.display = "";
        nativeBtn.click();
        // Re-hide after a tick
        requestAnimationFrame(() => { nativeBar.style.display = "none"; });
      } else {
        // Fallback: just scroll to bottom
        scroller.scrollTop = scroller.scrollHeight;
      }
    });

    // Create up arrow — scrolls to top (first loaded message)
    const upBtn = this.createArrowButton("up", () => {
      scroller.scrollTop = 0;
    });

    wrapper.appendChild(downBtn);
    wrapper.appendChild(upBtn);

    // Scroll listener to show/hide arrows based on position
    const THRESHOLD = 100; // px from edge to trigger
    const updateVisibility = () => {
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const atBottom = scrollHeight - scrollTop - clientHeight < THRESHOLD;
      const atTop = scrollTop < THRESHOLD;

      // Show down arrow when NOT at bottom
      downBtn.classList.toggle("sl-visible", !atBottom);
      // Show up arrow when NOT at top
      upBtn.classList.toggle("sl-visible", !atTop);
    };

    scroller.addEventListener("scroll", updateVisibility, { passive: true });
    this.scrollListeners.set(scroller, updateVisibility);

    // Initial check
    updateVisibility();
  }

  createArrowButton(direction, onClick) {
    const btn = document.createElement("div");
    btn.className = `sl-chat-nav-arrow sl-chat-nav-${direction}`;
    btn.title = direction === "down" ? "Jump to Present" : "Jump to Top";

    const svgPath = direction === "down"
      ? "M12 16l-6-6h12l-6 6z"   // down triangle
      : "M12 8l-6 6h12l-6-6z";   // up triangle

    btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${svgPath}"/></svg>`;
    btn.addEventListener("click", onClick);
    return btn;
  }
};
