/**
 * CriticalHit — Observer & message processing setup.
 * MutationObserver setup, message container discovery, webpack module init,
 * and message send hook.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');
const dc = require('../shared/discord-classes');
const { isVoiceChannelChat } = require('../shared/channel-context');

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

  startObserving(retryCount = 0) {
    if (this._isStopped) return;
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }

    // VC gate (2026-07-30): voice/stage channels have no message container by
    // design — retrying 20×500ms then logging an error was pure waste, and
    // worse, the give-up left the channel-change listener DEAD (see re-arm
    // fix below). Skip silently but KEEP the subscription alive so the next
    // real channel re-triggers observation.
    // HARDENED 2026-07-30: originally called isVoiceChannelChat(), whose
    // paths 3-4 (voice-connect cross-check, document-wide DOM marker scan)
    // can FALSE-POSITIVE when the stores haven't resolved yet — which is
    // exactly the situation at startup, when this runs. A false positive
    // here silently disables crit detection for the whole session. Use only
    // the authoritative URL + ChannelStore type check: skip when we are
    // CERTAIN it's voice/stage, retry normally in every ambiguous case.
    // Burning 20 retries in a real VC is cheap; missing crits is not.
    try {
      const m = String(window.location?.pathname || '').match(/^\/channels\/(?:@me|\d+)\/(\d+)/);
      if (m) {
        const ch = BdApi?.Webpack?.getStore?.('ChannelStore')?.getChannel?.(m[1]);
        const t = Number(ch?.type);
        if (t === 2 || t === 13) {
          this.setupChannelChangeListener();
          return;
        }
      }
    } catch (_) { /* ambiguous — fall through and observe normally */ }

    const messageContainer = this._findMessageContainer();

    if (!messageContainer) {
      // PERF (R7): bounded retry — a channel/context that never produces a message
      // container (e.g. torn-down UI, unsupported channel type) must not retry forever.
      if (retryCount >= C.OBSERVER_MAX_RETRIES) {
        this.debugError('START_OBSERVING', 'Message container not found after max retries — giving up until next explicit startObserving() call', {
          retries: retryCount,
        });
        // RE-ARM FIX (2026-07-30): _handleChannelChange tears down the
        // channel-change listener BEFORE scheduling this retry chain, and
        // the listener was only reinstalled on SUCCESS — so any give-up
        // left channel-change detection dead for the rest of the session.
        this.setupChannelChangeListener();
        return;
      }
      this.debug?.verbose &&
        this.debugLog('START_OBSERVING', 'Message container not found - retrying', {
          retryDelayMs: C.OBSERVER_RETRY_DELAY_MS,
          retryCount,
        });
      this._setTrackedTimeout(() => this.startObserving(retryCount + 1), C.OBSERVER_RETRY_DELAY_MS);
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
      // PERF (2026-07-13): settings.enabled was previously read only for a debug log —
      // the toggle did nothing. Gate all observer work on it.
      if (this.settings?.enabled === false) return;

      // PERF: Prune disconnected DOM refs from critMessages every 100 additions
      if (this.critMessages.size > 100) this.pruneCritMessages();

      // ID-SWAP CONSUMER (2026-07-13): Discord renders an OWN message
      // optimistically, then React swaps the real snowflake into
      // data-message-id IN PLACE. That is an ATTRIBUTE mutation and produces
      // no childList mutation, so the queued crit animation could previously
      // only be claimed by the two timed attempts in _onMessageCreate (a
      // double-rAF and a single 400ms timer). When the swap landed after those
      // — slow ack, slow render — the pending entry was stranded forever:
      // the message still turned crit-coloured (the injected CSS matches
      // [data-message-id]) but the CRITICAL HIT! text and the combo never
      // fired. Claiming the entry on the id-swap itself closes that race for
      // good, independent of timing.
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type !== 'attributes' || m.attributeName !== 'data-message-id') continue;
        const el = m.target;
        const swappedId = el?.getAttribute?.('data-message-id');
        if (!swappedId || !this._pendingAnimations?.has(swappedId)) continue;
        const messageEl = el.closest?.('li[class*="messageListItem"]') || el;
        this._critTrace(swappedId, 'idswap:found');
        this._consumePendingCritAnimation(swappedId, messageEl);
      }

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
          if (pendingMsgId) this._consumePendingCritAnimation(pendingMsgId, messageElement);
          // PERF (2026-07-13): processNode() call removed for non-pending nodes.
          // FluxDispatcher (_onMessageCreate) is the sole crit-roll path — it already
          // filters to own messages in the current channel and queues _pendingAnimations.
          // The observer's only jobs now: apply pending crit animations (above) and
          // restore styling on own historical crits (below). This eliminates the
          // per-message getMessageIdentifier + react-fiber getAuthorId walk that ran
          // for EVERY author's messages in busy channels.
          this.checkForRestoration(messageElement);
        });
      });
    });

    try {
      this.messageObserver.observe(messageContainer, {
        childList: true,
        subtree: true,
        // Watch ONLY data-message-id: React swaps the real snowflake onto the
        // optimistically-rendered own message in place, with no childList
        // mutation. attributeFilter keeps this cheap — no other attribute
        // change wakes the callback. See the id-swap consumer above.
        attributes: true,
        attributeFilter: ['data-message-id'],
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
      // PERF (R7): bounded retry — same cap as the container-not-found path above.
      if (retryCount >= C.OBSERVER_MAX_RETRIES) {
        this.debugError('START_OBSERVING', 'observe() kept throwing after max retries — giving up until next explicit startObserving() call', {
          retries: retryCount,
        });
        // RE-ARM FIX (2026-07-30): same as the container-not-found give-up —
        // keep channel-change detection alive after abandoning this channel.
        this.setupChannelChangeListener();
        return;
      }
      this._setTrackedTimeout(() => this.startObserving(retryCount + 1), C.OBSERVER_ERROR_RETRY_DELAY_MS);
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

  /**
   * Consume a queued pending-crit entry for a mounted message element:
   * stats + history + style lock + combo + animation. Shared by BOTH
   * consumers — the MutationObserver (element mounts AFTER the dispatch)
   * and the dispatcher's immediate-consume (Discord rendered the own
   * message optimistically BEFORE MESSAGE_CREATE fired, so no childList
   * mutation will ever come for it). processedMessages guarantees exactly
   * one consumer wins. Returns true if this call consumed the entry.
   */
  _consumePendingCritAnimation(messageId, messageElement) {
    if (!messageId || !this._pendingAnimations) return false;
    // Always remove the entry (stale-buildup cleanup), even when the guards
    // below decline to process it.
    const pendingAnim = this._pendingAnimations.get(messageId);
    if (pendingAnim) this._pendingAnimations.delete(messageId);
    if (!pendingAnim) {
      this._critTrace(messageId, 'consume:no-pending');
      return false;
    }
    if (this.processedMessages.has(messageId)) {
      this._critTrace(messageId, 'consume:already-processed');
      return false;
    }
    if (!messageElement || !messageElement.isConnected) {
      // Element vanished between lookup and consume — requeue so the other
      // consumer path can still claim it before the trim cap expires it.
      this._critTrace(messageId, 'consume:not-connected');
      this._pendingAnimations.set(messageId, pendingAnim);
      return false;
    }
    this._critTrace(messageId, 'consume:OK');

    // CRITICAL: Stats/history/processedMessages intentionally deferred from
    // _onMessageCreate so a consumer with the element in hand can trigger
    // the animation properly. markAsProcessed funnels through LRU
    // bookkeeping (direct .add bypassed eviction — old memory fix).
    this.markAsProcessed(messageId);
    this.stats.totalMessages++;
    this.stats.totalCrits++;
    this.updateStats();
    this.addToHistory({
      messageId,
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
      messageId,
      messageElement,
      userId,
    });
    this._markComboUpdated(messageId);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (messageElement.isConnected) {
          this.showAnimation(messageElement, messageId, combo);
        }
      });
    });
    return true;
  },
};
