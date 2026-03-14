const dc = require('../shared/discord-classes');

module.exports = {
  _getChannelHeaderToolbar() {
    const selectors = [
      '[aria-label="Channel header"] [class*="toolbar_"]',
      '[class*="titleWrapper_"] [class*="toolbar_"]',
      'header [class*="toolbar_"]',
    ];
    for (const selector of selectors) {
      const toolbar = document.querySelector(selector);
      if (toolbar) return toolbar;
    }
    return null;
  },

  _createHeaderStatsButton() {
    if (this._headerStatsButton?.isConnected) return this._headerStatsButton;
  
    const button = document.createElement('button');
    button.id = 'sls-header-stats-button';
    button.className = 'sls-header-stats-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Solo Leveling Stats');
    button.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 18h3v-6H4v6zm6 0h3V6h-3v12zm6 0h4V10h-4v8z" fill="currentColor"></path>
      </svg>
    `;
  
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleHeaderStatsPopup();
    });
  
    this._headerStatsButton = button;
    return button;
  },

  ensureHeaderStatsButton() {
    if (!this._isRunning || !this._isGuildTextChannel()) {
      this.removeHeaderStatsButton();
      return false;
    }
  
    const toolbar = this._getChannelHeaderToolbar();
    if (!toolbar) {
      // Header can remount during transitions; close popup to avoid orphan position.
      this.closeHeaderStatsPopup();
      return false;
    }
  
    const button = this._createHeaderStatsButton();
    if (button.parentElement !== toolbar) {
      toolbar.appendChild(button);
    }
    return true;
  },

  removeHeaderStatsButton() {
    this.closeHeaderStatsPopup();
    if (this._headerStatsButton?.isConnected) {
      this._headerStatsButton.remove();
    }
    this._headerStatsButton = null;
  },

  toggleHeaderStatsPopup() {
    if (this._headerStatsPopup?.isConnected) {
      this.closeHeaderStatsPopup();
    } else {
      this.openHeaderStatsPopup();
    }
  },

  openHeaderStatsPopup() {
    if (this._headerStatsPopup?.isConnected) return;
    if (!this.ensureHeaderStatsButton()) return;
    if (!this._headerStatsButton?.isConnected) return;
  
    const popup = document.createElement('div');
    popup.id = 'sls-header-stats-popup';
    popup.className = 'sls-header-stats-popup';
    document.body.appendChild(popup);
  
    try {
      const { StatsPopup } = this._chatUIComponents || {};
      const root = BdApi.ReactDOM.createRoot(popup);
      root.render(BdApi.React.createElement(StatsPopup, { onClose: () => this.closeHeaderStatsPopup() }));
      this._headerStatsPopupRoot = root;
      this._headerStatsPopup = popup;
    } catch (error) {
      this.debugError('HEADER_POPUP', error, { phase: 'render' });
      popup.remove();
      return;
    }
  
    this._headerStatsPopupDocClickHandler = (event) => {
      const target = event.target;
      if (!target) return;
      const clickedPopup = this._headerStatsPopup?.contains?.(target);
      const clickedButton = this._headerStatsButton?.contains?.(target);
      if (!clickedPopup && !clickedButton) {
        this.closeHeaderStatsPopup();
      }
    };
    this._headerStatsPopupResizeHandler = () => this.queueHeaderStatsPopupPosition();
    this._headerStatsPopupScrollHandler = () => this.queueHeaderStatsPopupPosition();
  
    document.addEventListener('mousedown', this._headerStatsPopupDocClickHandler, true);
    window.addEventListener('resize', this._headerStatsPopupResizeHandler, { passive: true });
    window.addEventListener('scroll', this._headerStatsPopupScrollHandler, this._headerStatsPopupScrollListenerOptions);
  
    this.positionHeaderStatsPopup();
  },

  closeHeaderStatsPopup() {
    if (this._headerStatsPopupPositionRaf) {
      cancelAnimationFrame(this._headerStatsPopupPositionRaf);
      this._headerStatsPopupPositionRaf = null;
    }
    if (this._headerStatsPopupDocClickHandler) {
      document.removeEventListener('mousedown', this._headerStatsPopupDocClickHandler, true);
      this._headerStatsPopupDocClickHandler = null;
    }
    if (this._headerStatsPopupResizeHandler) {
      window.removeEventListener('resize', this._headerStatsPopupResizeHandler);
      this._headerStatsPopupResizeHandler = null;
    }
    if (this._headerStatsPopupScrollHandler) {
      window.removeEventListener('scroll', this._headerStatsPopupScrollHandler, this._headerStatsPopupScrollListenerOptions);
      this._headerStatsPopupScrollHandler = null;
    }
  
    if (this._headerStatsPopupRoot) {
      try {
        this._headerStatsPopupRoot.unmount();
      } catch (error) {
        this.debugError('HEADER_POPUP', error, { phase: 'unmount' });
      }
      this._headerStatsPopupRoot = null;
    }
  
    if (this._headerStatsPopup?.isConnected) {
      this._headerStatsPopup.remove();
    }
    this._headerStatsPopup = null;
  },

  queueHeaderStatsPopupPosition() {
    if (this._headerStatsPopupPositionRaf) return;
    if (typeof requestAnimationFrame !== 'function') {
      this.positionHeaderStatsPopup();
      return;
    }
    this._headerStatsPopupPositionRaf = requestAnimationFrame(() => {
      this._headerStatsPopupPositionRaf = null;
      if (!this._isRunning) return;
      this.positionHeaderStatsPopup();
    });
  },

  positionHeaderStatsPopup() {
    const popup = this._headerStatsPopup;
    const button = this._headerStatsButton;
    if (!popup || !button || !popup.isConnected || !button.isConnected) return;
  
    const buttonRect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    const desiredWidth = Math.max(340, Math.min(520, viewportWidth - 24));
    const maxHeight = Math.max(260, viewportHeight - 90);
  
    popup.style.width = `${desiredWidth}px`;
    popup.style.maxHeight = `${maxHeight}px`;
  
    const margin = 12;
    let left = buttonRect.right - desiredWidth;
    left = Math.max(margin, Math.min(left, viewportWidth - desiredWidth - margin));
  
    let top = buttonRect.bottom + 10;
    if (top > viewportHeight - margin - 180) {
      top = Math.max(margin, buttonRect.top - Math.min(maxHeight, 560) - 10);
    }
  
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(margin, top)}px`;
  },

  ensureChatUIUpdateInterval(onlyWhenDirty = false) {
    if (this.chatUIUpdateInterval) return;
  
    this.chatUIUpdateInterval = setInterval(() => {
      if (document.hidden) return; // PERF: Skip when window not visible
  
      // Self-heal: detect stale or missing panel and re-create
      if (this._isGuildTextChannel()) {
        const panelInDOM = document.getElementById('sls-chat-ui');
        if (!panelInDOM) {
          // Panel disappeared — stale ref or React unmounted it
          if (this.chatUIPanel) {
            this.debugLog('CHAT_UI_WATCHDOG', 'Panel reference exists but DOM element missing — clearing stale ref');
            this.chatUIPanel = null;
          }
          this.debugLog('CHAT_UI_WATCHDOG', 'Panel missing from DOM — triggering re-creation');
          clearInterval(this.chatUIUpdateInterval);
          this.chatUIUpdateInterval = null;
          this.createChatUI();
          return;
        }
      }
  
      this.ensureHeaderStatsButton();
      this.queueHeaderStatsPopupPosition();
  
      if (onlyWhenDirty && !this._chatUIDirty) return;
      this._chatUIDirty = false;
      this.updateChatUI();
    }, 2000);
  },

  createChatUI() {
    // Prevent concurrent creation from observer/channel-switch race
    if (this._isCreatingUI) {
      this.debugLog('CREATE_CHAT_UI', 'Skipping — already creating UI');
      return;
    }
    this._isCreatingUI = true;
    try {
      // Only inject chat UI in guild text channels (not threads/forums/VC/DMs)
      if (!this._isGuildTextChannel()) {
        this.debugLog('CREATE_CHAT_UI', 'Skipping — not a guild text channel');
        this._isCreatingUI = false;
        this.removeChatUI();
        return;
      }
  
      this.debugLog('CREATE_CHAT_UI', 'Starting chat UI creation');
  
      this.removeChatUI();
  
      this.injectChatUICSS();
  
      // Keep the strip composer-anchored. Top-level React injection can place it away from
      // the message box in certain Discord layouts, so we intentionally use DOM insertion.
      this.debugLog('CREATE_CHAT_UI', 'Using DOM injection path');
  
      const tryCreateUI = () => {
        try {
          if (!this._canShowChatUIInCurrentView()) return false;
  
          // Find writable input area scoped to primary chat content only
          const messageInputArea = this._getMessageInputAreaInPrimaryChat();
          if (!messageInputArea) return false;
  
          if (document.getElementById('sls-chat-ui')) {
            return true;
          }
  
          // Guard: unmount any orphaned React root from a previous DOM fallback
          // (its container may have been removed by Discord re-render)
          if (this._chatUIRoot) {
            try { this._chatUIRoot.unmount(); } catch (_) {}
            this._chatUIRoot = null;
          }
  
          // Create the UI panel container
          const uiPanel = document.createElement('div');
          uiPanel.id = 'sls-chat-ui';
          uiPanel.className = 'sls-chat-strip-panel';
  
          // Insert before the message input area
          messageInputArea.parentElement.insertBefore(uiPanel, messageInputArea);
  
          // Render React component tree into panel (v3.0.0)
          try {
            const { StatsPanel } = this._chatUIComponents;
            const root = BdApi.ReactDOM.createRoot(uiPanel);
            root.render(BdApi.React.createElement(StatsPanel));
            this._chatUIRoot = root;
          } catch (renderError) {
            this.debugError('RENDER_CHAT_UI', renderError);
            uiPanel.remove();
            return false;
          }
  
          this.chatUIPanel = uiPanel;
          this.debugLog('CREATE_CHAT_UI', 'Panel mounted in DOM via DOM fallback');
          this.ensureChatUIUpdateInterval(true);
          this.ensureHeaderStatsButton();
          return true;
        } catch (uiError) {
          this.debugError('TRY_CREATE_UI', uiError);
          return false;
        }
      };
  
      if (!tryCreateUI()) {
        // Retry after a delay if Discord hasn't loaded yet
        this.chatUICreationRetryInterval = setInterval(() => {
          if (tryCreateUI()) {
            clearInterval(this.chatUICreationRetryInterval);
            this.chatUICreationRetryInterval = null;
            if (this.chatUICreationRetryTimeout) {
              clearTimeout(this.chatUICreationRetryTimeout);
              this.chatUICreationRetryTimeout = null;
            }
          }
        }, 1000);
  
        // Stop retrying after 10 seconds
        this.chatUICreationRetryTimeout = setTimeout(() => {
          if (this.chatUICreationRetryInterval) {
            clearInterval(this.chatUICreationRetryInterval);
            this.chatUICreationRetryInterval = null;
          }
          this.chatUICreationRetryTimeout = null;
        }, 10000);
      }
  
      // Watch for DOM changes (channel switches, etc.)
      if (!this.chatUIObserver) {
        this.chatUIObserver = new MutationObserver(() => {
          if (document.hidden) return;
          if (!this._canShowChatUIInCurrentView()) {
            this.removeChatUI();
            return;
          }
          // Self-heal: detect stale reference (DOM removed by React re-render)
          if (this.chatUIPanel && !this.chatUIPanel.isConnected) {
            this.debugLog('CHAT_UI_OBSERVER', 'Stale chatUIPanel detected — DOM disconnected, clearing');
            this.chatUIPanel = null;
          }
          if (document.getElementById('sls-chat-ui')) return;
          if (this._chatUiObserverDebounceTimeout) return;
          this._chatUiObserverDebounceTimeout = setTimeout(() => {
            this._chatUiObserverDebounceTimeout = null;
            tryCreateUI();
          }, 150);
        });
  
        // PERF(P5-7): Narrowed selector — '[class*="chat"]' was too broad (matches any
        // element with "chat" in any class), risking a wide-scope subtree observer
        const cc = dc.sel.chatContent;
        const chatContainer =
          document.querySelector(`main${cc}`) ||
          document.querySelector(`section${cc}`) ||
          document.querySelector('main[class*="chatContent-"]') ||
          document.querySelector(`div${dc.sel.messagesWrapper}`) ||
          document.querySelector(`div${dc.sel.chat}:not(${dc.sel.chatLayerWrapper})`) ||
          null;
  
        // IMPORTANT: Never observe document.body; Discord mutates it constantly and can peg CPU.
        if (!chatContainer) {
          this._chatUiObserverRetryTimeout ||= setTimeout(() => {
            this._chatUiObserverRetryTimeout = null;
            this.chatUIObserver && this.createChatUI();
          }, 1500);
          this._isCreatingUI = false;
          return;
        }
  
        this.chatUIObserver.observe(chatContainer, {
          childList: true,
          subtree: true,
        });
      }
      this._isCreatingUI = false;
    } catch (error) {
      this._isCreatingUI = false;
      this.debugError('CREATE_CHAT_UI', error);
      // Retry after delay
      if (!this._createChatUIErrorRetryTimeout) {
        this._createChatUIErrorRetryTimeout = setTimeout(() => {
          this._createChatUIErrorRetryTimeout = null;
          try {
            this.createChatUI();
          } catch (retryError) {
            this.debugError('CREATE_CHAT_UI_RETRY', retryError);
          }
        }, 3000);
      }
    }
  },

  removeChatUI() {
    this.debugLog('REMOVE_CHAT_UI', 'removeChatUI() called', {
      hadPanel: !!this.chatUIPanel,
      panelConnected: this.chatUIPanel?.isConnected ?? null,
      hadRoot: !!this._chatUIRoot,
      hadObserver: !!this.chatUIObserver,
      inGuildText: this._isGuildTextChannel(),
      caller: new Error().stack?.split('\n')[2]?.trim() || 'unknown',
    });
    // Clear creation mutex (prevent stale lock)
    this._isCreatingUI = false;
    // Unmount React root if using createRoot fallback (v3.0.0)
    if (this._chatUIRoot) {
      try {
        this._chatUIRoot.unmount();
      } catch (error) {
        this.debugError('REMOVE_CHAT_UI', error);
      }
      this._chatUIRoot = null;
    }
    // If React injection is active, the UI will be removed when patch is removed
    // But we should also try to remove DOM element if it exists
    if (this.chatUIPanel) {
      this.chatUIPanel.remove();
      this.chatUIPanel = null;
    }
    if (this.chatUIUpdateInterval) {
      clearInterval(this.chatUIUpdateInterval);
      this.chatUIUpdateInterval = null;
    }
    if (this._createChatUIStartupRetryTimeout) {
      clearTimeout(this._createChatUIStartupRetryTimeout);
      this._createChatUIStartupRetryTimeout = null;
    }
    if (this._createChatUIErrorRetryTimeout) {
      clearTimeout(this._createChatUIErrorRetryTimeout);
      this._createChatUIErrorRetryTimeout = null;
    }
    if (this._chatUiObserverRetryTimeout) {
      clearTimeout(this._chatUiObserverRetryTimeout);
      this._chatUiObserverRetryTimeout = null;
    }
    if (this._chatUiObserverDebounceTimeout) {
      clearTimeout(this._chatUiObserverDebounceTimeout);
      this._chatUiObserverDebounceTimeout = null;
    }
    if (this.chatUICreationRetryInterval) {
      clearInterval(this.chatUICreationRetryInterval);
      this.chatUICreationRetryInterval = null;
    }
    if (this.chatUICreationRetryTimeout) {
      clearTimeout(this.chatUICreationRetryTimeout);
      this.chatUICreationRetryTimeout = null;
    }
    if (this.chatUIObserver) {
      this.chatUIObserver.disconnect();
      this.chatUIObserver = null;
    }
  
    this.removeHeaderStatsButton();
    this._chatUIForceUpdates?.clear?.();
    this._chatUIForceUpdate = null;
  
    this._lastChatUIUpdateAt = 0;
    if (this._chatUIUpdateThrottleTimer) {
      clearTimeout(this._chatUIUpdateThrottleTimer);
      this._chatUIUpdateThrottleTimer = null;
    }
  
    // Remove injected CSS so it doesn't persist after disable
    document.getElementById(this._constants?.CHAT_UI_STYLE_ID || 'sls-chat-ui-styles')?.remove();
  },

  updateChatUI() {
    // v3.0.0: React components own their own rendering.
    // Just trigger a re-render via the forceUpdate bridge.
    if (!this._isRunning) return;
    this._chatUIDirty = false;
  
    // Self-throttle to avoid redundant work when multiple events trigger updates
    const now = Date.now();
    const lastUpdateAt = this._lastChatUIUpdateAt || 0;
    const throttleMs = 150;
    const elapsed = now - lastUpdateAt;
    if (elapsed < throttleMs) {
      const waitMs = Math.max(0, throttleMs - elapsed);
      if (!this._chatUIUpdateThrottleTimer) {
        this._chatUIUpdateThrottleTimer = setTimeout(() => {
          this._chatUIUpdateThrottleTimer = null;
          if (!this._isRunning) return;
          this._lastChatUIUpdateAt = Date.now();
          this._triggerUIForceUpdates();
        }, waitMs);
      }
      return;
    }
    this._lastChatUIUpdateAt = now;
  
    // Trigger React re-render via forceUpdate bridge(s)
    this._triggerUIForceUpdates();
  }
};
