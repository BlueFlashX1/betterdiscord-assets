module.exports = {
  _ensureMessageProcessTimeoutSet() {
    if (!this._messageProcessTimeouts) {
      this._messageProcessTimeouts = new Set();
    }
    return this._messageProcessTimeouts;
  },

  _scheduleTrackedMessageTimeout(callback, delayMs) {
    const timeoutSet = this._ensureMessageProcessTimeoutSet();
    const timeoutId = setTimeout(() => {
      timeoutSet.delete(timeoutId);
      callback();
    }, delayMs);
    timeoutSet.add(timeoutId);
    return timeoutId;
  },

  _readMessageInputValue(messageInput, lastInputValue = '') {
    if (!messageInput) return '';

    if (messageInput.tagName === 'TEXTAREA') {
      return messageInput.value || '';
    }

    if (messageInput.contentEditable === 'true') {
      return (
        messageInput.textContent ||
        messageInput.querySelector('[class*="textValue"]')?.textContent ||
        ''
      );
    }

    return messageInput.value || messageInput.textContent || lastInputValue || '';
  },

  _extractSendTextFromInput(messageInput, lastInputValue = '') {
    try {
      const textContent = messageInput?.textContent?.trim();
      return textContent || String(lastInputValue || '').trim();
    } catch (_) {
      return String(lastInputValue || '').trim();
    }
  },

  _normalizeLongInputText(messageInput, messageText) {
    if (!messageInput || messageText.length <= 2000) return messageText;

    this.debugLog('INPUT_DETECTION', 'Message too long, likely capturing wrong content', {
      length: messageText.length,
      preview: messageText.substring(0, 100),
    });

    const textNodes = [];
    const walker = document.createTreeWalker(messageInput, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim();
      if (text && text.length > 0 && text.length < 2000) {
        textNodes.push(text);
      }
    }

    if (textNodes.length > 0) {
      const normalized = textNodes.join(' ').trim();
      return normalized.length > 2000 ? normalized.substring(0, 2000) : normalized;
    }

    return messageText.substring(0, 2000);
  },

  _scheduleWebpackSendFallback(messageText) {
    const hash = this.hashString(messageText.substring(0, 2000));
    this._pendingSendFallback = { at: Date.now(), hash };

    this._scheduleTrackedMessageTimeout(() => {
      if (!this._isRunning) return;
      const pending = this._pendingSendFallback;
      if (!pending || pending.hash !== hash) return;

      this._pendingSendFallback = null;
      this.processMessageSent(messageText, this.buildMessageContextFromView(messageText));
    }, 350);
  },

  _scheduleInputSendProcessing(messageText, messageInput, onProcessed) {
    this._scheduleTrackedMessageTimeout(() => {
      if (!this._isRunning) return;
      this.processMessageSent(messageText, this.buildMessageContextFromView(messageText));
      onProcessed?.();
    }, 100);

    this._scheduleTrackedMessageTimeout(() => {
      if (!this._isRunning) return;
      const currentValue =
        messageInput?.tagName === 'TEXTAREA' ? messageInput.value || '' : messageInput?.textContent || '';
      if (!currentValue || currentValue.trim().length === 0) {
        this.debugLog('INPUT_DETECTION', 'Input cleared, message confirmed sent');
      } else {
        this.debugLog('INPUT_DETECTION', 'Input still has content, may be editing');
      }
    }, 500);
  },

  _extractMutationMessageElement(node) {
    const className = node?.className || '';
    const isMessageNode = typeof className === 'string' && className.includes('message');
    return isMessageNode ? node : node?.closest?.('[class*="message"]') || null;
  },

  _hasExplicitYouIndicator(messageElement) {
    const usernameElement =
      messageElement.querySelector('[class*="username"]') ||
      messageElement.querySelector('[class*="author"]');
    if (!usernameElement) return false;

    const usernameText = usernameElement.textContent?.trim().toLowerCase() || '';
    return usernameText === 'you' || usernameText.startsWith('you ');
  },

  _extractMutationMessageText(messageElement) {
    return (
      messageElement.textContent?.trim() ||
      messageElement.querySelector('[class*="messageContent"]')?.textContent?.trim() ||
      messageElement.querySelector('[class*="textValue"]')?.textContent?.trim() ||
      ''
    );
  },

  _trackMutationNodeAddedAt(node, messageElement) {
    if (!this._domNodeAddedTime) {
      this._domNodeAddedTime = new WeakMap();
    }
    this._domNodeAddedTime.set(node, Date.now());
    if (messageElement && messageElement !== node) {
      this._domNodeAddedTime.set(messageElement, Date.now());
    }
  },

  _shouldSkipMutationMessageById(messageId) {
    if (this.webpackModuleAccess && messageId && this.processedMessageIds.has(messageId)) {
      return true;
    }

    if (!messageId || this.processedMessageIds.has(messageId)) {
      this.debugLog('MUTATION_OBSERVER', 'Message already processed or no ID', {
        messageId,
        hasId: Boolean(messageId),
      });
      return true;
    }
    return false;
  },

  _resolveMutationMessageConfirmation(messageElement, currentUserId, messageId) {
    const hasReactProps = this.doesMessageFiberMatchAuthorId(messageElement, currentUserId);
    const hasExplicitYou = this._hasExplicitYouIndicator(messageElement);
    if (hasReactProps || hasExplicitYou) {
      return {
        isConfirmed: true,
        hasReactProps,
      };
    }

    this.debugLog('MUTATION_OBSERVER', 'Skipping: Insufficient confirmation for MutationObserver detection', {
      hasReactProps,
      hasExplicitYou,
      messageId,
    });
    return {
      isConfirmed: false,
      hasReactProps,
    };
  },

  _resolveMutationMessageTimestamp(messageElement, messageId) {
    const messageTimestamp = this.getMessageTimestamp(messageElement);
    const isNewMessage = messageTimestamp && messageTimestamp >= (this.pluginStartTime || 0);
    if (!isNewMessage && messageTimestamp) {
      this.debugLog('MUTATION_OBSERVER', 'Skipping old message from chat history', {
        messageId,
        messageTimestamp,
        pluginStartTime: this.pluginStartTime,
        age: Date.now() - messageTimestamp,
      });
      return {
        shouldProcess: false,
        messageTimestamp,
        isNewMessage,
      };
    }

    return {
      shouldProcess: true,
      messageTimestamp,
      isNewMessage,
    };
  },

  _scheduleMutationMessageSend({
    messageText,
    messageElement,
    messageId,
    hasReactProps,
    isNewMessage,
    messageTimestamp,
  }) {
    this.debugLog('MUTATION_OBSERVER', 'Processing own message (confirmed)', {
      messageId,
      length: messageText.length,
      preview: messageText.substring(0, 50),
      confirmationMethod: hasReactProps ? 'React props' : 'Explicit You',
      isNewMessage,
      messageTimestamp,
    });
    this._scheduleTrackedMessageTimeout(() => {
      if (!this._isRunning) return;
      const context = this.buildMessageContextFromView(messageText, messageElement);
      this.processMessageSent(messageText, context);
    }, 100);
  },

  _processMutationNode(node, currentUserId) {
    if (!node?.isConnected) return;

    const messageElement = this._extractMutationMessageElement(node);
    this._trackMutationNodeAddedAt(node, messageElement);
    if (!messageElement) return;

    const isOwnMessage = this.isOwnMessage(messageElement, currentUserId);
    this.debugLog('MUTATION_OBSERVER', 'Message element detected', {
      hasMessageElement: Boolean(messageElement),
      isOwnMessage,
      hasCurrentUserId: Boolean(currentUserId),
    });
    if (!isOwnMessage) return;

    const messageId = this.getMessageId(messageElement);
    this.debugLog('MUTATION_OBSERVER', 'Own message detected via MutationObserver', {
      messageId,
      alreadyProcessed: messageId ? this.processedMessageIds.has(messageId) : false,
      elementClasses: messageElement.classList?.toString() || '',
      usingWebpack: this.webpackModuleAccess,
    });
    if (this._shouldSkipMutationMessageById(messageId)) return;

    const confirmation = this._resolveMutationMessageConfirmation(
      messageElement,
      currentUserId,
      messageId
    );
    if (!confirmation.isConfirmed) return;

    const messageTiming = this._resolveMutationMessageTimestamp(messageElement, messageId);
    if (!messageTiming.shouldProcess) return;

    this.addProcessedMessageId(messageId);
    this.lastMessageId = messageId;
    this.lastMessageElement = messageElement;

    const messageText = this._extractMutationMessageText(messageElement);
    if (messageText.length <= 0 || this.isSystemMessage(messageElement)) {
      this.debugLog('MUTATION_OBSERVER', 'Message skipped', {
        reason: messageText.length === 0 ? 'empty' : 'system_message',
      });
      return;
    }

    this._scheduleMutationMessageSend({
      messageText,
      messageElement,
      messageId,
      hasReactProps: confirmation.hasReactProps,
      isNewMessage: messageTiming.isNewMessage,
      messageTimestamp: messageTiming.messageTimestamp,
    });
  },

  _queueMutationNodes(mutations) {
    if (!this._pendingMutationNodes) this._pendingMutationNodes = [];

    for (let i = 0; i < mutations.length; i++) {
      const addedNodes = mutations[i].addedNodes;
      for (let j = 0; j < addedNodes.length; j++) {
        const candidate = addedNodes[j];
        if (candidate.nodeType === 1) {
          this._pendingMutationNodes.push(candidate);
        }
      }
    }
  },

  _scheduleMutationProcessing(currentUserId) {
    if (this._mutationDebounceTimer) return;

    this._mutationDebounceTimer = setTimeout(() => {
      this._mutationDebounceTimer = null;
      const nodes = this._pendingMutationNodes;
      this._pendingMutationNodes = [];
      if (!nodes.length || !this._isRunning) return;

      requestAnimationFrame(() => {
        for (let i = 0; i < nodes.length; i++) {
          this._processMutationNode(nodes[i], currentUserId);
        }
        this.trackChannelVisit();
      });
    }, 100);
  },

  setupMessageObserver({ messageContainer, currentUserId }) {
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }

    if (this._mutationDebounceTimer) {
      clearTimeout(this._mutationDebounceTimer);
      this._mutationDebounceTimer = null;
    }
    this._pendingMutationNodes = [];

    this.messageObserver = new MutationObserver((mutations) => {
      this._queueMutationNodes(mutations);
      this._scheduleMutationProcessing(currentUserId);
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

      retryCount = 0;
      this.debugLog('SETUP_INPUT', 'Found message input, setting up monitoring');
      let lastInputValue = '';

      const handleInput = () => {
        lastInputValue = this._readMessageInputValue(messageInput, lastInputValue);
      };

      const handleKeyDown = (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;

        let messageText = this._extractSendTextFromInput(messageInput, lastInputValue);
        if (!messageText) return;

        if (this.webpackModuleAccess && this.messageStorePatch) {
          this._scheduleWebpackSendFallback(messageText);
          return;
        }

        messageText = this._normalizeLongInputText(messageInput, messageText);
        if (messageText.length <= 0 || messageText.length > 2000) return;

        this.debugLog('INPUT_DETECTION', 'Enter key pressed, message detected', {
          length: messageText.length,
          preview: messageText.substring(0, 50),
        });
        this.debugLog('INPUT_DETECTION', 'Processing message immediately');
        this._scheduleInputSendProcessing(messageText, messageInput, () => {
          lastInputValue = '';
        });
      };

      const handlePaste = () => {
        this._scheduleTrackedMessageTimeout(() => {
          if (!this._isRunning) return;
          handleInput();
        }, 50);
      };

      messageInput.addEventListener('input', handleInput, true);
      messageInput.addEventListener('keydown', handleKeyDown, true);
      messageInput.addEventListener('paste', handlePaste, true);

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
      if (!this._startObservingRetryTimeout) {
        this._startObservingRetryTimeout = setTimeout(() => {
          this._startObservingRetryTimeout = null;
          this.startObserving();
        }, 1000);
      }
      return;
    }

    this._messageContainerEl = messageContainer;
    this.processedMessageIds = this.processedMessageIds || new Set();

    const currentUserId = this.getCurrentUserIdForMessageDetection();
    if (this.webpackModuleAccess) {
      this.debugLog('START_OBSERVING', 'Using webpack patches, DOM observer as fallback only');
    }

    this.setupMessageObserver({ messageContainer, currentUserId });
    this.setupInputMonitoringForMessageSending({ maxRetries: 10 });
  },
};
