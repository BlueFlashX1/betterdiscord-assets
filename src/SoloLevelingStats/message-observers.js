const { acquireDispatcher, pollForDispatcher } = require('../shared/dispatcher');

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

  // ── FluxDispatcher MESSAGE_CREATE — own-message XP detection ─────────────────
  //
  // PERF (2026-07-14): this REPLACES a per-message MutationObserver that ran a
  // 20-deep React-fiber ownership walk (isOwnMessage) on EVERY message from
  // EVERY author just to find the current user's own posts — the busy-server
  // lag. MESSAGE_CREATE hands over `author.id` directly, so a single
  // `author.id === me` compare rejects everyone else's traffic with zero DOM
  // work. Own messages are funneled through the SAME processMessageSent() path
  // the input handler uses; its content-hash + 2s dedup already prevents
  // double-counting across the two paths, so this third trigger is safe.
  //
  // The input handler (keydown Enter) stays as the instant-feedback path (it
  // fires before the server round-trip); MESSAGE_CREATE is the reliable
  // fallback that also catches sends the input handler misses (slash commands,
  // click-to-send, paste flows) — the exact role the observer used to play,
  // now cheap.

  setupMessageDispatcher() {
    if (this._msgDispatcher || this._msgDispatcherPoll) return;
    try {
      const d = acquireDispatcher();
      if (d) {
        this._msgDispatcher = d;
        this._subscribeMessageDispatcher();
        return;
      }
      this._msgDispatcherPoll = pollForDispatcher({
        onAcquired: (dd) => {
          this._msgDispatcherPoll = null;
          if (!this._isRunning) return;
          this._msgDispatcher = dd;
          this._subscribeMessageDispatcher();
        },
        onTimeout: () => {
          this._msgDispatcherPoll = null;
          this.debugLog('MESSAGE_DISPATCHER', 'FluxDispatcher unavailable after 30s — own-message XP will rely on the input handler only');
        },
        onPoll: () => { if (!this._isRunning) this._msgDispatcherPoll?.cancel?.(); },
      });
    } catch (error) {
      this.debugError('MESSAGE_DISPATCHER', error);
    }
  },

  _subscribeMessageDispatcher() {
    if (!this._msgDispatcher || this._msgCreateHandler) return;
    this._msgCreateHandler = (payload) => this._onMessageCreate(payload);
    try {
      this._msgDispatcher.subscribe('MESSAGE_CREATE', this._msgCreateHandler);
      this.debugLog('MESSAGE_DISPATCHER', 'Subscribed to MESSAGE_CREATE for own-message XP');
    } catch (error) {
      this._msgCreateHandler = null;
      this.debugError('MESSAGE_DISPATCHER', error);
    }
  },

  teardownMessageDispatcher() {
    if (this._msgDispatcher && this._msgCreateHandler) {
      try { this._msgDispatcher.unsubscribe('MESSAGE_CREATE', this._msgCreateHandler); } catch (_) {}
    }
    this._msgCreateHandler = null;
    this._msgDispatcher = null;
    if (this._msgDispatcherPoll) {
      try { this._msgDispatcherPoll.cancel?.(); } catch (_) {}
      this._msgDispatcherPoll = null;
    }
  },

  _onMessageCreate(payload) {
    try {
      if (!this._isRunning) return;
      const msg = payload && payload.message;
      if (!msg || !msg.id || !msg.channel_id || !msg.author || !msg.author.id) return;

      // ORDER (perf): free property-read rejects first — bots and system
      // message types are dropped before ANY resolution work.
      if (msg.author.bot) return;
      if (msg.type !== 0 && msg.type !== 19) return;

      // OWN messages only — one property compare rejects all other traffic.
      // This is the whole performance win. this.currentUserId is a cached
      // property set at startup (zero cost per message); the heavier
      // getCurrentUserIdForMessageDetection() resolver (5s cache, but a
      // querySelector + fiber-walk fallback when the store lookup fails) only
      // runs while the cached id is still unresolved. Persisted ownUserId is
      // the last resort (the documented currentUserId-null failure mode).
      const me = this.currentUserId
        || this.getCurrentUserIdForMessageDetection()
        || this.settings?.ownUserId;
      if (!me || msg.author.id !== me) return;

      // Match the old observer's scope: the channel currently in view.
      // buildMessageContextFromView reads the active view, and the input
      // handler already covers the rare send-then-immediately-switch case.
      const viewed = this._getViewedChannelId();
      if (viewed && msg.channel_id !== viewed) return;

      // Real text only (empty awards no XP).
      const text = typeof msg.content === 'string' ? msg.content.trim() : '';
      if (!text) return;

      // Realtime guard against a late-delivered dispatch predating start.
      const ts = this._msgTimestampMs(msg.timestamp);
      if (ts && this.pluginStartTime && ts < this.pluginStartTime) return;

      // Cheap id dedup (the authoritative anti-double-count vs the input
      // handler is processMessageSent's content-hash + 2s window).
      this.processedMessageIds = this.processedMessageIds || new Set();
      if (this.processedMessageIds.has(msg.id)) return;
      if (typeof this.addProcessedMessageId === 'function') this.addProcessedMessageId(msg.id);
      else this.processedMessageIds.add(msg.id);
      this.lastMessageId = msg.id;

      this.processMessageSent(text, this.buildMessageContextFromView(text));
      this.trackChannelVisit?.();
    } catch (error) {
      this.debugError('MESSAGE_CREATE', error);
    }
  },

  _msgTimestampMs(ts) {
    if (ts == null) return null;
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'object' && typeof ts.valueOf === 'function') {
      const v = ts.valueOf();
      return typeof v === 'number' ? v : null;
    }
    const t = new Date(ts).getTime();
    return Number.isNaN(t) ? null : t;
  },

  // PERF (2026-07-15): store ref memoized — this runs per own-message and the
  // getStore lookup is a module-registry scan, not guaranteed cached by BD.
  // Flux stores are stable for the app lifetime; retry only while null.
  _getViewedChannelId() {
    try {
      let store = this._selectedChannelStoreRef;
      if (!store) {
        store = BdApi.Webpack.getStore?.('SelectedChannelStore');
        if (store && typeof store.getChannelId === 'function') {
          this._selectedChannelStoreRef = store;
        } else {
          return null;
        }
      }
      return store.getChannelId();
    } catch (_) {}
    return null;
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
            'Message input not found after max retries, will rely on FluxDispatcher'
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
    this.processedMessageIds = this.processedMessageIds || new Set();

    // Own-message XP is now FluxDispatcher-driven — no DOM message container
    // required. Subscribe once (idempotent); the subscription is channel-
    // agnostic and persists across channel switches.
    this.setupMessageDispatcher();

    // Keep _messageContainerEl current for channel-context.js consumers (cheap
    // single lookup; no longer gates message detection).
    const messageContainer = this.getMessageContainerElementForObserving();
    if (messageContainer) this._messageContainerEl = messageContainer;

    // Input monitoring stays as the instant-feedback path; it has its own retry.
    this.setupInputMonitoringForMessageSending({ maxRetries: 10 });
  },
};
