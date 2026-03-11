module.exports = {
  setupMessageObserver({ messageContainer, currentUserId }) {
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }
    // Clean up debounce state from previous observer
    if (this._mutationDebounceTimer) {
      clearTimeout(this._mutationDebounceTimer);
      this._mutationDebounceTimer = null;
    }
    this._pendingMutationNodes = [];
  
    const self = this;
    this.messageObserver = new MutationObserver((mutations) => {
      // PERF: Buffer added nodes, debounce processing to avoid 8-12 sync DOM queries per node.
      // During channel load Discord adds 50-200 nodes; without batching this causes 400-2400 queries.
      if (!self._pendingMutationNodes) self._pendingMutationNodes = [];
  
      for (let i = 0; i < mutations.length; i++) {
        const added = mutations[i].addedNodes;
        for (let j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) self._pendingMutationNodes.push(added[j]);
        }
      }
  
      // Debounce: coalesce rapid mutation bursts into a single processing pass
      if (self._mutationDebounceTimer) return;
      self._mutationDebounceTimer = setTimeout(() => {
        self._mutationDebounceTimer = null;
        const nodes = self._pendingMutationNodes;
        self._pendingMutationNodes = [];
        if (!nodes.length || !self._isRunning) return;
  
        requestAnimationFrame(() => {
          for (let k = 0; k < nodes.length; k++) {
            const node = nodes[k];
            if (!node.isConnected) continue;
  
            // Avoid attaching ad-hoc properties to DOM nodes in hot paths.
            // Store metadata in a WeakMap so GC can collect nodes naturally.
            if (!self._domNodeAddedTime) {
              self._domNodeAddedTime = new WeakMap();
            }
            self._domNodeAddedTime.set(node, Date.now());
  
            // PERF: Cheap string check before expensive DOM traversal
            const cn = node.className || '';
            const isMessageNode = typeof cn === 'string' && cn.includes('message');
            const messageElement = isMessageNode
              ? node
              : (node.closest?.('[class*="message"]') || null);
  
            // Also mark message element with added time
            if (messageElement && messageElement !== node) {
              self._domNodeAddedTime.set(messageElement, Date.now());
            }
  
            if (!messageElement) continue;
  
            // Check if this is our own message
            const isOwnMessage = self.isOwnMessage(messageElement, currentUserId);
            self.debugLog('MUTATION_OBSERVER', 'Message element detected', {
              hasMessageElement: !!messageElement,
              isOwnMessage,
              hasCurrentUserId: !!currentUserId,
            });
  
            if (!isOwnMessage) continue;
  
            const messageId = self.getMessageId(messageElement);
            self.debugLog('MUTATION_OBSERVER', 'Own message detected via MutationObserver', {
              messageId,
              alreadyProcessed: messageId ? self.processedMessageIds.has(messageId) : false,
              elementClasses: messageElement.classList?.toString() || '',
              usingWebpack: self.webpackModuleAccess,
            });
  
            // Skip DOM processing if webpack patches are handling it (fallback mode)
            if (self.webpackModuleAccess && messageId && self.processedMessageIds.has(messageId)) {
              continue;
            }
  
            if (!messageId || self.processedMessageIds.has(messageId)) {
              self.debugLog('MUTATION_OBSERVER', 'Message already processed or no ID', {
                messageId,
                hasId: !!messageId,
              });
              continue;
            }
  
            // Double-check: Only process if we have strong confirmation
            const hasReactProps = self.doesMessageFiberMatchAuthorId(messageElement, currentUserId);
  
            const hasExplicitYou = (() => {
              const usernameElement =
                messageElement.querySelector('[class*="username"]') ||
                messageElement.querySelector('[class*="author"]');
              if (usernameElement) {
                const usernameText = usernameElement.textContent?.trim() || '';
                return (
                  usernameText.toLowerCase() === 'you' ||
                  usernameText.toLowerCase().startsWith('you ')
                );
              }
              return false;
            })();
  
            if (!hasReactProps && !hasExplicitYou) {
              self.debugLog(
                'MUTATION_OBSERVER',
                'Skipping: Insufficient confirmation for MutationObserver detection',
                {
                  hasReactProps,
                  hasExplicitYou,
                  messageId,
                }
              );
              continue;
            }
  
            // Check message timestamp to prevent processing old chat history
            const messageTimestamp = self.getMessageTimestamp(messageElement);
            const isNewMessage = messageTimestamp && messageTimestamp >= (self.pluginStartTime || 0);
            if (!isNewMessage && messageTimestamp) {
              self.debugLog('MUTATION_OBSERVER', 'Skipping old message from chat history', {
                messageId,
                messageTimestamp,
                pluginStartTime: self.pluginStartTime,
                age: Date.now() - messageTimestamp,
              });
              continue;
            }
  
            self.addProcessedMessageId(messageId);
            self.lastMessageId = messageId;
            self.lastMessageElement = messageElement;
  
            // Get message text
            const messageText =
              messageElement.textContent?.trim() ||
              messageElement.querySelector('[class*="messageContent"]')?.textContent?.trim() ||
              messageElement.querySelector('[class*="textValue"]')?.textContent?.trim() ||
              '';
  
            if (messageText.length > 0 && !self.isSystemMessage(messageElement)) {
              self.debugLog('MUTATION_OBSERVER', 'Processing own message (confirmed)', {
                messageId,
                length: messageText.length,
                preview: messageText.substring(0, 50),
                confirmationMethod: hasReactProps ? 'React props' : 'Explicit You',
                isNewMessage,
                messageTimestamp,
              });
              const timeoutId = setTimeout(() => {
                self._messageProcessTimeouts?.delete(timeoutId);
                if (!self._isRunning) return;
                const context = self.buildMessageContextFromView(messageText, messageElement);
                self.processMessageSent(messageText, context);
              }, 100);
              if (!self._messageProcessTimeouts) {
                self._messageProcessTimeouts = new Set();
              }
              self._messageProcessTimeouts.add(timeoutId);
            } else {
              self.debugLog('MUTATION_OBSERVER', 'Message skipped', {
                reason: messageText.length === 0 ? 'empty' : 'system_message',
              });
            }
          }
  
          // Track channel visits
          self.trackChannelVisit();
        });
      }, 100);
    });
  
    this.messageObserver.observe(messageContainer, {
      childList: true,
      subtree: true,
    });
  
    this.debugLog('SETUP_MESSAGE_DETECTION', 'MutationObserver set up for message detection');
  },

  setupInputMonitoringForMessageSending({ maxRetries = 10 } = {}) {
    if (this.messageInputHandler?.element?.isConnected) return;
  
    let retryCount = 0;
    const attemptSetup = () => {
      const messageInput = this.getMessageInputElement();
      if (!messageInput) {
        retryCount++;
        if (retryCount < maxRetries) {
          this.debugLog(
            'SETUP_INPUT',
            `Message input not found, retrying (${retryCount}/${maxRetries})`
          );
          if (!this._setupInputRetryTimeout) {
            this._setupInputRetryTimeout = setTimeout(() => {
              this._setupInputRetryTimeout = null;
              attemptSetup();
            }, 1000);
          }
        } else {
          this.debugLog(
            'SETUP_INPUT',
            'Message input not found after max retries, will rely on MutationObserver'
          );
        }
        return;
      }
  
      retryCount = 0; // Reset on success
      this.debugLog('SETUP_INPUT', 'Found message input, setting up monitoring');
  
      let lastInputValue = '';
      let inputTimeout = null;
  
      // PERF: Use textContent only — innerText forces full layout reflow on every keystroke.
      // textContent is sufficient for detecting message content; it just lacks line breaks
      // from <br> elements which don't matter for our send-detection logic.
      const handleInput = () => {
        let currentValue = '';
        if (messageInput.tagName === 'TEXTAREA') {
          currentValue = messageInput.value || '';
        } else if (messageInput.contentEditable === 'true') {
          currentValue =
            messageInput.textContent ||
            messageInput.querySelector('[class*="textValue"]')?.textContent ||
            '';
        } else {
          currentValue =
            messageInput.value || messageInput.textContent || '';
        }
        lastInputValue = currentValue;
  
        if (inputTimeout) clearTimeout(inputTimeout);
      };
  
      const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          // If webpack patches are enabled, prefer store-based processing.
          // BUT: some Discord builds don't provide full message objects at patch time.
          // Fallback: if store-based path doesn't confirm within a short window, process via input text.
          if (this.webpackModuleAccess && this.messageStorePatch) {
            let messageText = '';
            try {
              // PERF: Use textContent only (innerText forces layout reflow).
              // Enter key fires once so less critical, but consistent with handleInput.
              messageText =
                (messageInput.textContent && messageInput.textContent.trim()) ||
                lastInputValue.trim();
            } catch (e) {
              messageText = lastInputValue.trim();
            }
  
            if (!messageText) return;
  
            const hash = this.hashString(messageText.substring(0, 2000));
            this._pendingSendFallback = { at: Date.now(), hash };
  
            this._messageProcessTimeouts = this._messageProcessTimeouts || new Set();
            const fallbackTimeoutId = setTimeout(() => {
              this._messageProcessTimeouts?.delete(fallbackTimeoutId);
              if (!this._isRunning) return;
              const pending = this._pendingSendFallback;
              if (!pending || pending.hash !== hash) return;
  
              // No store confirmation observed -> award XP via input path
              this._pendingSendFallback = null;
              this.processMessageSent(messageText, this.buildMessageContextFromView(messageText));
            }, 350);
            this._messageProcessTimeouts.add(fallbackTimeoutId);
            return;
          }
  
          let messageText = '';
          try {
            messageText = (messageInput.textContent && messageInput.textContent.trim()) || lastInputValue.trim();
          } catch (e) {
            messageText = lastInputValue.trim();
          }
  
          if (messageText.length > 2000) {
            this.debugLog('INPUT_DETECTION', 'Message too long, likely capturing wrong content', {
              length: messageText.length,
              preview: messageText.substring(0, 100),
            });
            const textNodes = [];
            const walker = document.createTreeWalker(
              messageInput,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            let node;
            while ((node = walker.nextNode())) {
              const text = node.textContent?.trim();
              if (text && text.length > 0 && text.length < 2000) {
                textNodes.push(text);
              }
            }
            if (textNodes.length > 0) {
              messageText = textNodes.join(' ').trim();
              if (messageText.length > 2000) messageText = messageText.substring(0, 2000);
            } else {
              messageText = messageText.substring(0, 2000);
            }
          }
  
          if (messageText.length > 0 && messageText.length <= 2000) {
            this.debugLog('INPUT_DETECTION', 'Enter key pressed, message detected', {
              length: messageText.length,
              preview: messageText.substring(0, 50),
            });
  
            this.debugLog('INPUT_DETECTION', 'Processing message immediately');
            this._messageProcessTimeouts = this._messageProcessTimeouts || new Set();
  
            const processSendTimeoutId = setTimeout(() => {
              this._messageProcessTimeouts?.delete(processSendTimeoutId);
              if (!this._isRunning) return;
              this.processMessageSent(messageText, this.buildMessageContextFromView(messageText));
              lastInputValue = '';
            }, 100);
            this._messageProcessTimeouts.add(processSendTimeoutId);
  
            const confirmSendTimeoutId = setTimeout(() => {
              this._messageProcessTimeouts?.delete(confirmSendTimeoutId);
              if (!this._isRunning) return;
              let currentValue = '';
              if (messageInput.tagName === 'TEXTAREA') {
                currentValue = messageInput.value || '';
              } else {
                currentValue = messageInput.textContent || '';
              }
              if (!currentValue || currentValue.trim().length === 0) {
                this.debugLog('INPUT_DETECTION', 'Input cleared, message confirmed sent');
              } else {
                this.debugLog('INPUT_DETECTION', 'Input still has content, may be editing');
              }
            }, 500);
            this._messageProcessTimeouts.add(confirmSendTimeoutId);
          }
        }
      };
  
      messageInput.addEventListener('input', handleInput, true);
      messageInput.addEventListener('keydown', handleKeyDown, true);
  
      const handlePaste = () => {
        this._messageProcessTimeouts = this._messageProcessTimeouts || new Set();
        const pasteTimeoutId = setTimeout(() => {
          this._messageProcessTimeouts?.delete(pasteTimeoutId);
          if (!this._isRunning) return;
          handleInput();
        }, 50);
        this._messageProcessTimeouts.add(pasteTimeoutId);
      };
      messageInput.addEventListener('paste', handlePaste, true);
  
      // PERF: inputObserver removed entirely. It was observing the message input
      // with childList+subtree, which fires on EVERY character in contentEditable
      // (Discord modifies DOM tree structure per keystroke). The input/keydown event
      // listeners above already track all typing — the observer was pure overhead.
  
      this.messageInputHandler = {
        handleInput,
        handleKeyDown,
        handlePaste,
        observer: null,
        element: messageInput,
      };
      this.debugLog('SETUP_INPUT', 'Input monitoring set up successfully');
      this.inputMonitoringActive = true;
    };
  
    attemptSetup();
  },

  startObserving() {
    const messageContainer = this.getMessageContainerElementForObserving();
  
    if (!messageContainer) {
      // Wait and try again
      if (!this._startObservingRetryTimeout) {
        this._startObservingRetryTimeout = setTimeout(() => {
          this._startObservingRetryTimeout = null;
          this.startObserving();
        }, 1000);
      }
      return;
    }
  
    // Cache message container for later lookups (crit detection, etc.)
    this._messageContainerEl = messageContainer;
  
    // Track processed messages to avoid duplicates
    this.processedMessageIds = this.processedMessageIds || new Set();
  
    const currentUserId = this.getCurrentUserIdForMessageDetection();
  
    // Only use DOM observation if webpack modules are not available
    // Webpack patches handle message tracking more reliably
    if (this.webpackModuleAccess) {
      this.debugLog('START_OBSERVING', 'Using webpack patches, DOM observer as fallback only');
      // Still set up observer as fallback, but it will be less active
    }
  
    // Observer-based fallback (and for crit context)
    this.setupMessageObserver({ messageContainer, currentUserId });
  
    // Primary method: Detect message sends via input
    this.setupInputMonitoringForMessageSending({ maxRetries: 10 });
  }
};
