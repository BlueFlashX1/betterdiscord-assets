const { _PluginUtils } = require("./shared-utils");
const dc = require('../shared/discord-classes');

const SkillTreeUiMethods = {
  _getComposerRoot() {
    const primaryChat = this._getPrimaryChatContainer();
    const roots = [
      ...(primaryChat?.querySelectorAll?.(dc.sel.channelTextArea) || []),
      ...document.querySelectorAll(dc.sel.channelTextArea),
    ];

    const uniqueRoots = Array.from(new Set(roots));
    for (const root of uniqueRoots) {
      if (!this._isElementVisible(root)) continue;
      const formRoot = root.closest("form") || root;
      const editor = formRoot.querySelector(
        `[role="textbox"], textarea, [contenteditable="true"], ${dc.sel.slateTextArea}`
      );
      if (!editor) continue;
      return formRoot;
    }

    return null;
  },

  _getPrimaryChatContainer() {
    const cc = dc.sel.chatContent;
    return (
      document.querySelector(`main${cc}`) ||
      document.querySelector(`section${cc}[role="main"]`) ||
      document.querySelector(`section${cc}:not([role="complementary"])`) ||
      document.querySelector(`div${cc}:not([role="complementary"])`)
    );
  },

  _isElementVisible(element) {
    if (!element || !element.isConnected) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    const rects = element.getClientRects?.();
    return !!(rects && rects.length > 0);
  },

  /**
   * Update button text with current SP count
   */
  updateButtonText() {
    if (this.skillTreeButton) {
      // Update tooltip with current SP count
      this.skillTreeButton.title = `Skill Tree (${this.settings.skillPoints} SP)`;
    }
  },

  /**
   * Show skill tree modal (React v3.0.0)
   * If already open, forces a re-render. Otherwise creates root and renders.
   */
  showSkillTreeModal() {
    this.recalculateSPFromLevel();
    this.checkForLevelUp();

    // If already mounted, just force re-render
    if (this._modalReactRoot && this._modalForceUpdate) {
      this._modalForceUpdate();
      return;
    }

    // Create container
    let container = document.getElementById("st-modal-root");
    if (!container) {
      container = document.createElement("div");
      container.id = "st-modal-root";
      container.style.display = "contents";
      document.body.appendChild(container);
    }
    this._modalContainer = container;

    const React = BdApi.React;
    const { SkillTreeModal } = this._components;
    const onClose = () => this.closeSkillTreeModal();
    const element = React.createElement(SkillTreeModal, { onClose });

    // React 18: createRoot
    const createRoot = this._getCreateRoot();
    if (createRoot) {
      const root = createRoot(container);
      this._modalReactRoot = root;
      root.render(element);
      return;
    }

    // React 17 fallback
    const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule((m) => m?.render && m?.unmountComponentAtNode);
    if (ReactDOM?.render) {
      ReactDOM.render(element, container);
      return;
    }

    console.error("[SkillTree] Neither createRoot nor ReactDOM.render available");
    container.remove();
    BdApi.UI?.showToast?.("SkillTree: React rendering unavailable", { type: "error" });
  },

  /**
   * Close and unmount skill tree modal (React v3.0.0)
   */
  closeSkillTreeModal() {
    if (this._modalReactRoot) {
      try {
        this._modalReactRoot.unmount();
      } catch (error) {
        console.error("[SkillTree] Failed to unmount modal React root:", error);
      }
      this._modalReactRoot = null;
    }

    const container = document.getElementById("st-modal-root");
    if (container) {
      try {
        const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule((m) => m?.unmountComponentAtNode);
        if (ReactDOM?.unmountComponentAtNode) ReactDOM.unmountComponentAtNode(container);
      } catch (error) {
        console.error("[SkillTree] Failed to unmount legacy modal container:", error);
      }
      container.remove();
    }
    this._modalContainer = null;
    this._modalForceUpdate = null;
  },

  /**
   * Setup channel watcher for URL changes (event-based, no polling)
   * Enhanced to persist buttons across guild/channel switches
   */
  setupChannelWatcher() {
    if (this._urlChangeCleanup) {
      try {
        this._urlChangeCleanup();
      } catch (_) {}
      this._urlChangeCleanup = null;
    }

    // Use event-based URL change detection (no polling)
    let lastUrl = window.location.href;

    // Watch for URL changes via popstate and pushState/replaceState
    const handleUrlChange = () => {
      // Return early if plugin is stopped
      if (this._isStopped) return;

      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // React patcher handles button persistence on channel switch.
        // Just update tooltip text if button ref exists.
        this._setTrackedTimeout(() => this.updateButtonText(), 300);
      }
    };

    // PERF(P5-1): Use shared NavigationBus instead of independent pushState wrapper
    if (_PluginUtils?.NavigationBus) {
      this._navBusUnsub = _PluginUtils.NavigationBus.subscribe(() => handleUrlChange());
    }

    // Store cleanup function
    this._urlChangeCleanup = () => {
      // PERF(P5-1): Unsubscribe from shared NavigationBus
      if (this._navBusUnsub) {
        this._navBusUnsub();
        this._navBusUnsub = null;
      }
    };
  },

  /**
   * Setup window focus/visibility watcher (detects when user returns from another window)
   * Pattern from AutoIdleOnAFK plugin - uses window blur/focus events for reliable detection
   */
  setupWindowFocusWatcher() {
    if (this._windowFocusCleanup) {
      try {
        this._windowFocusCleanup();
      } catch (_) {}
      this._windowFocusCleanup = null;
    }

    this._boundHandleBlur = this._handleWindowBlur.bind(this);
    this._boundHandleFocus = this._handleWindowFocus.bind(this);
    this._boundHandleVisibilityChange = () => {
      if (this._isStopped || document.hidden) return;
      // React patcher handles button persistence — just update tooltip
      this._setTrackedTimeout(() => this.updateButtonText(), 300);
    };

    window.addEventListener("blur", this._boundHandleBlur);
    window.addEventListener("focus", this._boundHandleFocus);
    document.addEventListener("visibilitychange", this._boundHandleVisibilityChange);

    // Store cleanup function
    this._windowFocusCleanup = () => {
      window.removeEventListener("blur", this._boundHandleBlur);
      window.removeEventListener("focus", this._boundHandleFocus);
      document.removeEventListener("visibilitychange", this._boundHandleVisibilityChange);
    };
  },

  _handleWindowBlur() {},
  _handleWindowFocus() {},
};

module.exports = { SkillTreeUiMethods };
