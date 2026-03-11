module.exports = {
  getCurrentUserIdFromStore() {
    try {
      if (this.webpackModules.UserStore) {
        const user = this.webpackModules.UserStore.getCurrentUser();
        if (user && user.id) {
          this.currentUserId = user.id;
          this.settings.ownUserId = user.id;
          this.debugLog('USER_STORE', 'Current user ID retrieved', { userId: user.id });
          return user.id;
        }
      }
    } catch (error) {
      this.debugError('USER_STORE', error);
    }
    return null;
  },

  processMessageFromStore(message) {
    try {
      this.processedMessageIds = this.processedMessageIds || new Set();
  
      // Skip if message is too old (before plugin start)
      if (message.timestamp && message.timestamp < this.pluginStartTime) {
        return;
      }
  
      // Skip if already processed
      if (this.processedMessageIds.has(message.id)) {
        return;
      }
  
      // Get current user ID
      const currentUserId = this.getCurrentUserIdFromStore() || this.settings.ownUserId;
      if (!currentUserId) {
        // Fallback to React fiber if store unavailable
        this.getCurrentUserIdFromStore();
        return;
      }
  
      // Check if this is our own message
      if (message.author && message.author.id === currentUserId) {
        // Mark as processed
        this.addProcessedMessageId(message.id);
  
        // Keep context for crit detection (avoid expensive DOM scans)
        this.lastMessageId = message.id;
        this.lastMessageElement = null;
  
        // Process message for XP/quest tracking
        const messageText = message.content || '';
        const messageLength = messageText.length;
  
        // Clear pending input fallback if this store message matches
        const pending = this._pendingSendFallback;
        if (pending && typeof pending.hash === 'number') {
          const hash = this.hashString(messageText.substring(0, 2000));
          hash === pending.hash &&
            Date.now() - pending.at < 2000 &&
            (this._pendingSendFallback = null);
        }
  
        this.debugLog('MESSAGE_STORE', 'Processing message from store', {
          messageId: message.id,
          messageLength,
          channelId: message.channel_id,
        });
  
        if (!messageText.length) return;
  
        const messageContext = this.buildMessageContextFromStore(message, messageText);
        this.processMessageSent(messageText, messageContext);
      }
    } catch (error) {
      this.debugError('MESSAGE_STORE_PROCESS', error);
    }
  },

  addProcessedMessageId(messageId) {
    if (!messageId) return;
    this.processedMessageIds = this.processedMessageIds || new Set();
    this.processedMessageIds.add(messageId);
  
    // Cap growth to avoid unbounded memory usage over long sessions
    const MAX_PROCESSED_MESSAGE_IDS = 5000;
    if (this.processedMessageIds.size <= MAX_PROCESSED_MESSAGE_IDS) return;
  
    const keepCount = Math.floor(MAX_PROCESSED_MESSAGE_IDS * 0.6);
    const trimmed = Array.from(this.processedMessageIds).slice(-keepCount);
    this.processedMessageIds = new Set(trimmed);
  },

  tryReactInjection() {
    try {
      // Check if webpack modules are available
      if (!this.webpackModuleAccess) {
        this.debugLog('REACT_INJECTION', 'Webpack modules not available, skipping React injection');
        return false;
      }
  
      const pluginInstance = this;
  
      // Prefer SLUtils shared implementation (deduplicates MainContent.Z lookup)
      if (this._SLUtils?.tryReactInjection) {
        const { StatsPanel } = pluginInstance._chatUIComponents;
        const success = this._SLUtils.tryReactInjection({
          patcherId: 'SoloLevelingStats',
          elementId: 'sls-chat-ui',
          guard: () => pluginInstance._canShowChatUIInCurrentView(),
          render: (React) => {
            return React.createElement('div', {
              id: 'sls-chat-ui',
              className: 'sls-chat-strip-panel',
            }, React.createElement(StatsPanel));
          },
          onMount: (domEl) => {
            pluginInstance.chatUIPanel = domEl;
            pluginInstance.ensureChatUIUpdateInterval(true);
            pluginInstance.ensureHeaderStatsButton();
          },
          debugLog: this.debugLog.bind(this),
          debugError: this.debugError.bind(this),
        });
  
        if (success) {
          this.reactInjectionActive = true;
          return true;
        }
        // SLUtils failed (MainContent not found), fall through to return false
        return false;
      }
  
      // Fallback: inline implementation (SLUtils not loaded)
      // Multi-strategy MainContent finder (resilient to Discord renames)
      const _mcStrings = ['baseLayer', 'appMount', 'app-mount', 'notAppAsidePanel', 'applicationStore'];
      let MainContent = null, _mcKey = 'Z';
      if (typeof BdApi.Webpack.getWithKey === 'function') {
        for (const s of _mcStrings) {
          try { const r = BdApi.Webpack.getWithKey(m => typeof m === 'function' && m.toString().includes(s)); if (r && r[0]) { MainContent = r[0]; _mcKey = r[1]; break; } } catch (_) {}
        }
      }
      if (!MainContent) {
        for (const s of _mcStrings) {
          try { const mod = BdApi.Webpack.getByStrings(s, { defaultExport: false }); if (mod) { for (const k of ['Z','ZP','default']) { if (typeof mod[k] === 'function') { MainContent = mod; _mcKey = k; break; } } if (!MainContent) { const k = Object.keys(mod).find(k => typeof mod[k] === 'function'); if (k) { MainContent = mod; _mcKey = k; } } if (MainContent) break; } } catch (_) {}
        }
      }
      if (!MainContent) {
        this.debugLog('REACT_INJECTION', 'Main content component not found (all strategies exhausted), using DOM fallback');
        return false;
      }
  
      const React = BdApi.React;
  
      BdApi.Patcher.after(
        'SoloLevelingStats',
        MainContent,
        _mcKey,
        (thisObject, args, returnValue) => {
          try {
            if (!pluginInstance._canShowChatUIInCurrentView()) {
              return returnValue;
            }
  
            // PERF: Skip expensive findInTree walks when chat UI already exists in DOM.
            // The chatUIObserver handles re-injection if React unmounts the element.
            if (pluginInstance.chatUIPanel) {
              // Self-heal: detect stale reference (DOM removed by React re-render)
              if (!pluginInstance.chatUIPanel.isConnected) {
                pluginInstance.debugLog('REACT_INJECTION', 'Stale chatUIPanel detected — DOM disconnected, clearing for re-injection');
                pluginInstance.chatUIPanel = null;
                // Fall through to re-inject below
              } else {
                return returnValue;
              }
            }
  
            const bodyPath = BdApi.Utils.findInTree(
              returnValue,
              (prop) =>
                prop &&
                prop.props &&
                (prop.props.className?.includes('app') ||
                  prop.props.id === 'app-mount' ||
                  prop.type === 'body'),
              { walkable: ['props', 'children'] }
            );
  
            if (bodyPath && bodyPath.props) {
              const hasChatUI = BdApi.Utils.findInTree(
                returnValue,
                (prop) => prop && prop.props && prop.props.id === 'sls-chat-ui',
                { walkable: ['props', 'children'] }
              );
  
              if (!hasChatUI && !pluginInstance.chatUIPanel) {
                const { StatsPanel } = pluginInstance._chatUIComponents;
                const chatUIElement = React.createElement('div', {
                  id: 'sls-chat-ui',
                  className: 'sls-chat-strip-panel',
                }, React.createElement(StatsPanel));
  
                if (Array.isArray(bodyPath.props.children)) {
                  bodyPath.props.children.unshift(chatUIElement);
                } else if (bodyPath.props.children) {
                  bodyPath.props.children = [chatUIElement, bodyPath.props.children];
                } else {
                  bodyPath.props.children = chatUIElement;
                }
  
                pluginInstance.reactInjectionActive = true;
                pluginInstance.debugLog('REACT_INJECTION', 'Chat UI injected via React components (inline fallback)');
  
                setTimeout(() => {
                  const domElement = document.getElementById('sls-chat-ui');
                  if (domElement) {
                    pluginInstance.chatUIPanel = domElement;
                    pluginInstance.ensureChatUIUpdateInterval(true);
                    pluginInstance.ensureHeaderStatsButton();
                  }
                }, 100);
              }
            }
          } catch (error) {
            pluginInstance.debugError('REACT_INJECTION', error);
            return returnValue;
          }
        }
      );
  
      this.reactInjectionActive = true;
      this.debugLog('REACT_INJECTION', 'React injection setup complete (inline fallback)');
      return true;
    } catch (error) {
      this.debugError('REACT_INJECTION', error, { phase: 'setup' });
      return false;
    }
  }
};
