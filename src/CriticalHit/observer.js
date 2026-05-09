/**
 * CriticalHit — Observer & message processing setup.
 * MutationObserver setup, message container discovery, webpack module init,
 * and message send hook.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');
const dc = require('../shared/discord-classes');

module.exports = {

  // Message Container Discovery

  _isMessageContainerCacheValid() {
    const now = Date.now();
    return (
      this._cachedMessageContainer &&
      this._cachedMessageContainerTimestamp &&
      now - this._cachedMessageContainerTimestamp < C.MESSAGE_CONTAINER_CACHE_TTL_MS &&
      this._cachedMessageContainer.isConnected
    );
  },

  _getMessageContainerSelectors() {
    return [
      `main${dc.sel.chatContent} ${dc.sel.messagesWrapper}`,
      `section${dc.sel.chatContent} ${dc.sel.messagesWrapper}`,
      `${dc.sel.chatContent} ${dc.sel.messagesWrapper}`,
      dc.sel.messagesWrapper,
      'ol[role="list"][aria-label^="Messages in"]',
      '[id^="chat-messages-"]',
      dc.sel.messageList,
      dc.sel.messageContainer,
      dc.sel.scrollerInner,
      dc.sel.scroller,
    ];
  },

  _isMessageContainer(element) {
    if (!element) return false;
    const hasMessages = dc.query(element, 'message') !== null;
    const hasMessageList = element.querySelector('ol[role="list"][aria-label^="Messages in"]');
    const hasChatMessageAnchor = element.querySelector('[id^="chat-messages-"]');
    const isMessageList =
      element.matches('ol[role="list"][aria-label^="Messages in"]') ||
      element.matches('[id^="chat-messages-"]');
    return hasMessages || !!hasMessageList || !!hasChatMessageAnchor || isMessageList;
  },

  _findMessageContainerFallback() {
    const msgEl = document.querySelector(dc.sel.message);
    if (!msgEl) return null;

    const container = msgEl.closest(dc.sel.scroller) || msgEl.parentElement?.parentElement;
    if (container) {
      const now = Date.now();
      this._cachedMessageContainer = container;
      this._cachedMessageContainerTimestamp = now;
      return container;
    }
    return null;
  },

  _findMessageContainer() {
    if (this._isMessageContainerCacheValid()) {
      return this._cachedMessageContainer;
    }

    // Score candidates to avoid binding observer to unrelated scrollers.
    const selectors = this._getMessageContainerSelectors();
    const candidates = [];
    const seen = new Set();

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (!element || seen.has(element) || !this._isMessageContainer(element)) return;
        seen.add(element);
        candidates.push(element);
      });
    });

    const foundElement =
      candidates
        .map((element) => {
          const messageCount = dc.queryAll(element, 'message').length;
          const inChatContent = !!element.closest(
            `main${dc.sel.chatContent}, section${dc.sel.chatContent}`
          );
          const hasMessagesList =
            element.matches('ol[role="list"][aria-label^="Messages in"]') ||
            !!element.querySelector('ol[role="list"][aria-label^="Messages in"]');
          const hasChatAnchor =
            element.matches('[id^="chat-messages-"]') ||
            !!element.querySelector('[id^="chat-messages-"]');
          const score =
            (inChatContent ? 1000 : 0) +
            (hasMessagesList ? 500 : 0) +
            (hasChatAnchor ? 300 : 0) +
            messageCount;
          return { element, score };
        })
        .sort((a, b) => b.score - a.score)[0]
        ?.element || null;

    if (foundElement) {
      const now = Date.now();
      this._cachedMessageContainer = foundElement;
      this._cachedMessageContainerTimestamp = now;
      return foundElement;
    }

    return this._findMessageContainerFallback();
  },

  // Observer Setup

  startObserving() {
    if (this._isStopped) return;
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }

    const messageContainer = this._findMessageContainer();

    if (!messageContainer) {
      this.debug?.verbose &&
        this.debugLog('START_OBSERVING', 'Message container not found - retrying', {
          retryDelayMs: C.OBSERVER_RETRY_DELAY_MS,
        });
      this._setTrackedTimeout(() => this.startObserving(), C.OBSERVER_RETRY_DELAY_MS);
      return;
    }

    const channelId =
      this._getCurrentChannelId() || this._extractChannelIdFromContainer(messageContainer);
    const guildId = this._getCurrentGuildId();

    const channelChanged = channelId !== this.currentChannelId;
    channelChanged &&
      (this.currentChannelId && this._throttledSaveHistory(false),
      (this.currentChannelId = channelId),
      (this.currentGuildId = guildId),
      (this._cachedMessageContainer = null),
      (this._cachedMessageContainerTimestamp = 0),
      // Invalidate channel/guild caches
      (this._cache.currentChannelId = null),
      (this._cache.currentChannelIdTime = 0),
      (this._cache.currentGuildId = null),
      (this._cache.currentGuildIdTime = 0),
      (this._cache.urlChannelId = null),
      (this._cache.urlChannelIdTime = 0),
      (this._cache.urlGuildId = null),
      (this._cache.urlGuildIdTime = 0));

    this.clearSessionTracking();

    this.isLoadingChannel = true;
    this.observerStartTime = Date.now();
    let channelMarkedLoaded = false;

    const markChannelLoaded = (reason = 'observer') => {
      if (channelMarkedLoaded || this._isStopped) return;
      channelMarkedLoaded = true;
      this.isLoadingChannel = false;
      this.channelLoadTime = Date.now();
      this._disconnectTransientObserver(loadObserver);

      this.debug?.verbose &&
        this.debugLog('START_OBSERVING', 'Channel load complete', {
          reason,
          channelId,
        });

      // PERF: Single RAF (was double RAF = 32ms delay for no benefit)
      requestAnimationFrame(() => {
        channelId && this.restoreChannelCrits(channelId);
      });
    };

    const loadObserver = this._trackTransientObserver(
      new MutationObserver((mutations) => {
        // PERF: Check added nodes directly instead of querySelectorAll on every mutation.
        // querySelectorAll('[class*="message"]') was firing 50-100x/sec during channel load.
        for (let i = 0; i < mutations.length; i++) {
          const added = mutations[i].addedNodes;
          for (let j = 0; j < added.length; j++) {
            const n = added[j];
            if (n.nodeType === 1) {
              const cn = n.className;
              if ((typeof cn === 'string' && cn.includes('message')) ||
                  dc.query(n, 'message')) {
                markChannelLoaded('mutation');
                return; // Found messages — stop checking
              }
            }
          }
        }
      })
    );

    messageContainer && loadObserver.observe(messageContainer, { childList: true, subtree: true });
    const initialMessageCount = messageContainer ? dc.queryAll(messageContainer, 'message')?.length ?? 0 : 0;
    if (initialMessageCount > 0) {
      markChannelLoaded('initial');
    } else {
      this._setTrackedTimeout(() => {
        if (!channelMarkedLoaded) {
          // Fallback safety: never block crit processing indefinitely if load observer misses.
          markChannelLoaded('timeout');
        }
      }, C.LOAD_OBSERVER_TIMEOUT_MS);
    }

    this.messageObserver = new MutationObserver((mutations) => {
      // PERF: Prune disconnected DOM refs from critMessages every 100 additions
      if (this.critMessages.size > 100) this.pruneCritMessages();

      // PERF: Batch all added nodes from the mutation batch, process in single RAF chain
      const addedElements = [];
      for (let i = 0; i < mutations.length; i++) {
        const added = mutations[i].addedNodes;
        for (let j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) addedElements.push(added[j]);
        }
      }
      if (addedElements.length === 0) return;

      // PERF: Single RAF (was double RAF = unnecessary 32ms delay)
      requestAnimationFrame(() => {
        // PERF: Deduplicate processing by message element.
        // Multiple child nodes in the same message may be added at once.
        const uniqueMessageElements = new Set();
        for (let k = 0; k < addedElements.length; k++) {
           // PERF: Single upward walk instead of 3x closest() calls per node
           let messageElement = null;
           let el = addedElements[k];
           while (el && el !== messageContainer) {
             const cn = el.className;
             if (typeof cn === 'string') {
               if ((cn.includes('message-') && !cn.includes('Content') && !cn.includes('Group')) ||
                   cn.includes('messageListItem')) {
                 messageElement = el;
                 break;
               }
             }
             if (el.hasAttribute?.('data-message-id')) {
               messageElement = el;
               break;
             }
             el = el.parentElement;
           }

          if (messageElement && messageElement.isConnected && !messageElement.classList.contains('messageContent')) {
            uniqueMessageElements.add(messageElement);
          } else if (addedElements[k].nodeType === 1 && addedElements[k].isConnected) {
            // Fallback for nodes that might be messages themselves
            const fallbackCn = addedElements[k].className;
            const isMsg = typeof fallbackCn === 'string' &&
                          ((fallbackCn.includes('message-') && !fallbackCn.includes('Content')) ||
                           fallbackCn.includes('messageListItem'));
            if (isMsg) uniqueMessageElements.add(addedElements[k]);
          }
        }

        uniqueMessageElements.forEach((messageElement) => {
            // BUGFIX: wrapper elements (li.messageListItem) don't have data-message-id directly —
          // it's on a child div. Check both the element and its children.
          const pendingMsgId = messageElement.getAttribute?.('data-message-id') ||
            messageElement.querySelector?.('[data-message-id]')?.getAttribute('data-message-id');
          // Always clean up pending animation entry to prevent stale buildup,
          // then only process if message hasn't been handled yet
          const pendingAnim = pendingMsgId ? this._pendingAnimations?.get(pendingMsgId) : null;
          if (pendingMsgId) this._pendingAnimations?.delete(pendingMsgId);
          if (pendingAnim && !this.processedMessages.has(pendingMsgId)) {
            // CRITICAL: Stats/history/processedMessages intentionally deferred from _onMessageCreate
            // so this observer path can find the element and trigger animation properly.
            this.processedMessages.add(pendingMsgId);
            this.stats.totalMessages++;
            this.stats.totalCrits++;
            this.updateStats();
            this.addToHistory({
              messageId: pendingMsgId,
              authorId: pendingAnim.authorId,
              channelId: pendingAnim.channelId,
              guildId: pendingAnim.guildId,
              timestamp: Date.now(),
              isCrit: true,
              critSettings: pendingAnim.critSettings,
              messageContent: pendingAnim.messageContent || '',
              author: pendingAnim.author || '',
            });

            messageElement.classList.add('bd-crit-hit');
            messageElement.setAttribute('data-bd-crit-locked', '1');
            this.critMessages.add(messageElement);

            // Trigger animation (combo + floating text)
            const userId = this.getUserId(messageElement) || pendingAnim.authorId || this.currentUserId;
            const combo = this._syncBurstComboForMessage({
              messageId: pendingMsgId,
              messageElement,
              userId,
            });
            this._markComboUpdated(pendingMsgId);

            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (messageElement.isConnected) {
                  this.showAnimation(messageElement, pendingMsgId, combo);
                }
              });
            });
          } else {
            this.processNode(messageElement);
          }
          this.checkForRestoration(messageElement);
        });
      });
    });

    try {
      this.messageObserver.observe(messageContainer, {
        childList: true,
        subtree: true,
      });

      this.debug?.verbose &&
        this.debugLog('START_OBSERVING', 'Observer started successfully', {
          container: messageContainer.tagName,
          subtree: true,
        });
    } catch (error) {
      this.debugError('START_OBSERVING', error, {
        hasObserver: !!this.messageObserver,
        hasContainer: !!messageContainer,
      });
      this._setTrackedTimeout(() => this.startObserving(), C.OBSERVER_ERROR_RETRY_DELAY_MS);
      return;
    }

    this.setupChannelChangeListener();
  },

  // Webpack Module Initialization

  initializeWebpackModules() {
    try {
      const { Webpack } = BdApi;

      // getStore() is the modern, reliable API for Flux stores
      this.webpackModules.MessageStore = Webpack.getStore('MessageStore');
      if (!this.webpackModules.UserStore) {
        this.webpackModules.UserStore = Webpack.getStore('UserStore');
      }
      if (!this.webpackModules.SelectedChannelStore) {
        this.webpackModules.SelectedChannelStore = Webpack.getStore('SelectedChannelStore');
      }
      if (!this.webpackModules.SelectedGuildStore) {
        this.webpackModules.SelectedGuildStore = Webpack.getStore('SelectedGuildStore');
      }

      // MessageActions is NOT a store — getModule is correct here
      if (!this.webpackModules.MessageActions) {
        this.webpackModules.MessageActions = Webpack.getModule(
          (m) => m && m.sendMessage && (m.receiveMessage || m.editMessage)
        );
      }

      this.debugLog('WEBPACK_INIT', 'Webpack modules initialized', {
        hasMessageStore: !!this.webpackModules.MessageStore,
        hasUserStore: !!this.webpackModules.UserStore,
        hasMessageActions: !!this.webpackModules.MessageActions,
        hasSelectedChannelStore: !!this.webpackModules.SelectedChannelStore,
        hasSelectedGuildStore: !!this.webpackModules.SelectedGuildStore,
      });
    } catch (error) {
      this.debugError('WEBPACK_INIT', error);
    }
  },

  // Message send hook removed in v3.6.0 — replaced by FluxDispatcher MESSAGE_CREATE
};
