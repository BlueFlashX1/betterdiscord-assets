const dc = require("../shared/discord-classes");

module.exports = {
  startMessageObserver() {
    if (this.messageObserver) {
      return;
    }

    // IMPORTANT: Never fall back to document.body — causes massive mutation volume and pegs CPU
    const findMessageContainer = () => {
      const selectors = [
        'div[data-list-id="chat-messages"]',
        `main${dc.sel.chatContent} > div${dc.sel.messagesWrapper}`,
        `div${dc.sel.messagesWrapper}`,
        `div${dc.sel.scrollerInner}`,
        `ol${dc.sel.scrollerInner}`,
        dc.sel.messagesWrapper,
        `${dc.sel.chat} > ${dc.sel.content}`,
        dc.sel.messages,
        dc.sel.messageList,
      ];

      for (const sel of selectors) {
        const element = document.querySelector(sel);
        if (element) {
          const hasMessages = element.querySelector(`[data-list-item-id^="chat-messages"], [role="article"], ${dc.sel.message}`) !== null;
          const hasMessageId =
            element.querySelector('[data-list-item-id^="chat-messages"]') !== null;
          if (
            hasMessages ||
            hasMessageId ||
            sel.includes('messagesWrapper') ||
            sel.includes('scrollerInner')
          ) {
            return element;
          }
        }
      }

      const scrollers = document.querySelectorAll(dc.sel.scroller);
      let scrollerWithMessages = null;
      for (const scroller of scrollers) {
        const hasMessage = scroller.querySelector(`[data-list-item-id^="chat-messages"], [role="article"], ${dc.sel.message}`) !== null;
        const hasMessageId =
          scroller.querySelector('[data-list-item-id^="chat-messages"]') !== null;
        if (hasMessage || hasMessageId) {
          scrollerWithMessages = scroller;
          break;
        }
      }
      if (scrollerWithMessages) return scrollerWithMessages;

      return null;
    };

    const messageContainer = findMessageContainer();

    if (messageContainer) {
      this.debugLog('MESSAGE_OBSERVER', 'Container found, attaching observer');

      this._messageObserverRetryCount = 0;
      if (this._messageObserverRetryTimeoutId) {
        clearTimeout(this._messageObserverRetryTimeoutId);
        this._timeouts?.delete?.(this._messageObserverRetryTimeoutId);
        this._messageObserverRetryTimeoutId = null;
      }

      this.messageObserver = new MutationObserver((mutations) => {
        if (!this.started || !this.settings?.enabled) return;
        if (document.hidden) return;

        // PERF: Queue only real message list items; skip expensive DOM queries per mutation
        let addedMessageCount = 0;
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (!node || node.nodeType !== 1) return;

            const listItemId = node.getAttribute?.('data-list-item-id');
            const isChatMessageItem = listItemId && listItemId.startsWith('chat-messages');
            const messageElement =
              (isChatMessageItem && (node.closest?.('[data-list-item-id]') || node)) ||
              node.closest?.('[data-list-item-id^="chat-messages"]');

            if (!messageElement) return;
            this._pendingMessageElements || (this._pendingMessageElements = new Set());
            this._pendingMessageElements.add(messageElement);
            addedMessageCount++;
          });
        });

        if (addedMessageCount > 0) this._scheduleMessageFlush();
      });

      this._observers.add(this.messageObserver);
      this._messageContainerRef = messageContainer;
      // PERF: attributes/characterData false — we only care about added/removed nodes
      this.messageObserver.observe(messageContainer, { childList: true, subtree: true, attributes: false, characterData: false });

      // Reattach if React replaces the container
      if (this._messageContainerReattachId) {
        clearInterval(this._messageContainerReattachId);
        this._intervals?.delete?.(this._messageContainerReattachId);
      }
      // PERF: Use isConnected (O(1) native) instead of contains() (DOM traversal)
      this._messageContainerReattachId = setInterval(() => {
        if (document.hidden) return; // PERF(P5-3): Skip health check when hidden
        if (!this.messageObserver || !this._messageContainerRef) return;
        if (!this._messageContainerRef.isConnected) {
          this.debugLog('MESSAGE_OBSERVER', 'Container removed from DOM, reattaching');
          this.stopMessageObserver();
          this.startMessageObserver();
        }
      }, 3000);
      this._intervals?.add?.(this._messageContainerReattachId);
    } else {
      if (this._messageObserverRetryTimeoutId) return;

      this._messageObserverRetryCount = (this._messageObserverRetryCount || 0) + 1;
      const attempt = this._messageObserverRetryCount;
      const retryDelayMs = Math.min(
        30000,
        Math.floor(2000 * Math.pow(1.35, Math.max(0, attempt - 1)))
      );

      this.debugLogOnce(
        'MESSAGE_OBSERVER:NO_CONTAINER',
        'MESSAGE_OBSERVER',
        'No message container yet',
        {
          attempt,
          retryDelayMs,
        }
      );

      this._messageObserverRetryTimeoutId = this._setTrackedTimeout(() => {
        this._messageObserverRetryTimeoutId = null;
        if (this.started) this.startMessageObserver();
      }, retryDelayMs);
    }
  },

  _scheduleMessageFlush() {
    if (this._messageFlushTimeout) return;
    this._messageFlushTimeout = this._setTrackedTimeout(() => {
      this._messageFlushTimeout = null;
      this._flushMessageQueue();
    }, 100);
  },

  _flushMessageQueue() {
    if (this._messageProcessingInFlight) return;
    const pending = this._pendingMessageElements;
    if (!pending || pending.size === 0) return;
    if (!this.started || !this.settings?.enabled) return;

    this._messageProcessingInFlight = true;
    const run = async () => {
      const MAX_PER_FLUSH = 10;
      let processed = 0;
      for (const el of pending) {
        pending.delete(el);
        processed++;
        try {
          // PERF: Sequential — prevents async runaway under message storms
          await this.handleMessage(el);
        } catch (error) {
          this.errorLog('MESSAGE_OBSERVER', 'Failed processing message element', error);
        }
        if (processed >= MAX_PER_FLUSH) break;
      }
    };

    run()
      .catch((error) => this.errorLog('MESSAGE_OBSERVER', 'Message queue flush failed', error))
      .finally(() => {
        this._messageProcessingInFlight = false;
        pending.size > 0 && this._scheduleMessageFlush();
      });
  },

  stopMessageObserver() {
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this._observers?.delete?.(this.messageObserver);
      this.messageObserver = null;
    }
    if (this._messageObserverRetryTimeoutId) {
      clearTimeout(this._messageObserverRetryTimeoutId);
      this._timeouts?.delete?.(this._messageObserverRetryTimeoutId);
      this._messageObserverRetryTimeoutId = null;
    }
    if (this._messageContainerReattachId) {
      clearInterval(this._messageContainerReattachId);
      this._intervals?.delete?.(this._messageContainerReattachId);
      this._messageContainerReattachId = null;
    }
    this._messageObserverRetryCount = 0;
    this._messageContainerRef = null;
    if (this._messageFlushTimeout) {
      clearTimeout(this._messageFlushTimeout);
      this._timeouts.delete(this._messageFlushTimeout);
      this._messageFlushTimeout = null;
    }
    this._pendingMessageElements?.clear?.();
    if (this.processedMessageIds) this.processedMessageIds.clear();
  },

  async handleMessage(messageElement) {
    if (!this.settings.enabled) return;

    try {
      const messageTimestamp = this.getMessageTimestamp(messageElement);
      if (messageTimestamp && messageTimestamp < this.observerStartTime) return;

      const messageId = this.getMessageId(messageElement);
      if (messageId && this.processedMessageIds.has(messageId)) return;
      if (messageId) {
        this.processedMessageIds.add(messageId);
        // Bound set size to prevent unbounded growth
        if (this.processedMessageIds.size > 1000) {
          const firstId = this.processedMessageIds.values().next().value;
          this.processedMessageIds.delete(firstId);
        }
      }

      const isUserMsg = this.isUserMessage(messageElement);
      if (!isUserMsg) return;

      const channelInfo = this.getChannelInfo() || this.getChannelInfoFromLocation();
      if (!channelInfo) return;

      const now = Date.now();
      const userChannelKey = `${channelInfo.guildId}_${channelInfo.channelId}`;

      const isGuild = Boolean(channelInfo.guildId) && channelInfo.guildId !== 'DM';
      if (isGuild) {
        const globalCooldownRaw = Number(this.settings?.globalSpawnCooldown);
        const globalCooldownDefault = Number(this.defaultSettings?.globalSpawnCooldown) || 60000;
        const globalCooldown = Number.isFinite(globalCooldownRaw) && globalCooldownRaw >= 0
          ? globalCooldownRaw
          : globalCooldownDefault;
        const inGlobalCooldown = this._lastGlobalSpawnTime &&
          (now - this._lastGlobalSpawnTime) < globalCooldown;

        // Fast gate: skip expensive channel discovery while global spawn cooldown is active.
        if (!inGlobalCooldown) {
          // Pick a spawn channel in the same guild to distribute dungeons
          const spawnTarget = this.pickSpawnChannel(channelInfo);
          const channelKey = spawnTarget.channelKey || userChannelKey;
          const spawnChannelInfo = spawnTarget.channelInfo || channelInfo;
          this.checkDungeonSpawn(channelKey, spawnChannelInfo, { messageId }).catch((err) => {
            this.errorLog('checkDungeonSpawn failed', err);
          });
        }
      }

      if (this.settings.userActiveDungeon === userChannelKey) {
        const userSlowMultiplier = this.getEntityAttackSlowMultiplier(
          userChannelKey,
          'user',
          'user',
          now
        );
        const effectiveUserAttackCooldown = this.getEffectiveUserAttackCooldownMs(
          (this.settings.userAttackCooldown || 2000) * userSlowMultiplier,
          this.settings.userAttackCooldown || 2000
        );
        if (now - this.lastUserAttackTime >= effectiveUserAttackCooldown) {
          await this.processUserAttack(userChannelKey, messageElement);
          this.lastUserAttackTime = now;
        }
      }
    } catch (error) {
      this.errorLog('Error handling message', error);
    }
  },

  getMessageTimestamp(messageElement) {
    try {
      const timeElement = messageElement.querySelector('time');
      if (timeElement) {
        const datetime = timeElement.getAttribute('datetime');
        if (datetime) {
          return new Date(datetime).getTime();
        }
      }

      const timestamp = messageElement.getAttribute('data-timestamp');
      if (timestamp) {
        return parseInt(timestamp);
      }

      const reactKey = Object.keys(messageElement).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      if (reactKey) {
        let fiber = messageElement[reactKey];
        for (let i = 0; i < 20 && fiber; i++) {
          const timestamp = fiber.memoizedProps?.message?.timestamp;
          if (timestamp) return new Date(timestamp).getTime();
          fiber = fiber.return;
        }
      }
    } catch (e) { /* swallow */ }
    return null;
  },

  getMessageId(messageElement) {
    try {
      const listItemId =
        messageElement.getAttribute('data-list-item-id') ||
        messageElement.closest('[data-list-item-id]')?.getAttribute('data-list-item-id');
      if (listItemId) return listItemId;

      const id = messageElement.getAttribute('id');
      if (id) return id;

      const reactKey = Object.keys(messageElement).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      if (reactKey) {
        const result = Array.from({ length: 20 }).reduce(
          (acc) => {
            if (acc.found || !acc.fiber) return acc;
            const msgId = acc.fiber.memoizedProps?.message?.id;
            return msgId
              ? { fiber: null, found: String(msgId) }
              : { fiber: acc.fiber.return, found: null };
          },
          { fiber: messageElement[reactKey], found: null }
        );
        if (result.found) return result.found;
      }
    } catch (e) { /* swallow */ }
    return null;
  },

  isUserMessage(messageElement) {
    // STRICT: Only messages with a visible author element count as user messages.
    // System messages (joins, boosts, pins, etc.) lack author headings and must NOT spawn dungeons.
    const authorElement =
      messageElement.querySelector('span[role="heading"]') ||
      messageElement.querySelector(dc.sel.author) ||
      dc.query(messageElement, "username") ||
      dc.query(messageElement, "headerText");

    if (!authorElement) return false;

    const botBadge =
      messageElement.querySelector('svg[aria-label*="bot" i]') ||
      dc.query(messageElement, "botTag") ||
      dc.query(messageElement, "bot");
    if (botBadge) return false;

    if (dc.query(messageElement, "systemMessage") ||
        messageElement.closest(dc.sel.systemMessage)) return false;

    return true;
  }
};
