/**
 * CriticalHit — DOM utility methods.
 * Channel/guild extraction, content element finding, channel change handling.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');
const dc = require('../shared/discord-classes');

module.exports = {
  /**
   * Finds the message content element (excluding header/username/timestamp areas)
   * @param {HTMLElement} messageElement - Parent message element
   * @returns {HTMLElement|null} Content element or null if not found
   */
  findMessageContentElement(messageElement) {
    if (!messageElement) return null;

    // Try selectors in priority order
    for (let i = 0; i < C.MESSAGE_CONTENT_SELECTORS.length; i++) {
      const el = messageElement.querySelector(C.MESSAGE_CONTENT_SELECTORS[i]);
      if (el && !this.isInHeaderArea(el)) return el;
    }

    // Last resort - find divs with content
    const divs = messageElement.querySelectorAll('div');
    for (let i = 0; i < divs.length; i++) {
      if (!this.isInHeaderArea(divs[i]) && divs[i].textContent?.trim().length > 0) {
        return divs[i];
      }
    }
    return null;
  },

  /**
   * Re-queries a message element from the DOM by message ID
   * Used when Discord replaces DOM elements to get fresh references
   * @param {string} messageId - The message ID to search for
   * @param {HTMLElement} fallbackElement - Optional fallback element if not found
   * @returns {HTMLElement|null} The found message element or null
   */
  requeryMessageElement(messageId, fallbackElement = null) {
    if (!messageId) return fallbackElement;

    // CRITICAL FIX: Only use real Discord IDs for querying, not hash IDs
    if (messageId.startsWith('hash_')) {
      this.debugLog('REQUERY_MESSAGE_ELEMENT', 'Skipping requery for hash ID, using fallback', {
        messageId,
      });
      return fallbackElement;
    }

    // Try direct query first (fastest)
    const directMatch = document.querySelector(`[data-message-id="${messageId}"]`);
    if (directMatch) return directMatch;

    // Fallback: Search message elements scoped to container to reduce DOM scanning cost
    const container = this._cachedMessageContainer || this._findMessageContainer?.() || document;
    const candidates = container.querySelectorAll?.(dc.sel.message) || [];
    let foundElement = null;
    for (const el of candidates) {
      const id = this.getMessageIdentifier(el);
      if (this.isValidDiscordId(id) && id === messageId) {
        foundElement = el;
        break;
      }
      const dataId = el.getAttribute?.('data-message-id');
      if (dataId === messageId) {
        foundElement = el;
        break;
      }
    }

    return foundElement || fallbackElement;
  },

  /**
   * Extracts channel ID from Discord URL
   * @param {string} url - URL to extract from (defaults to current location)
   * @returns {string|null} Channel ID or null if not found
   */
  extractChannelIdFromURL(url = null) {
    // Check cache first (only if no explicit URL provided)
    if (url === null) {
      const now = Date.now();
      if (
        this._cache.urlChannelId !== null &&
        this._cache.urlChannelIdTime &&
        now - this._cache.urlChannelIdTime < this._cache.urlChannelIdTTL &&
        window.location.href === this._cache.urlChannelIdSource
      ) {
        return this._cache.urlChannelId;
      }
    }

    try {
      const targetUrl = url || window.location.href;
      const urlMatch = targetUrl.match(C.CHANNEL_URL_PATTERN);
      const parentChannelId = urlMatch?.[1] || null;
      const threadId = urlMatch?.[2] || null;
      const result = threadId || parentChannelId;

      // Cache result if no explicit URL provided
      if (url === null) {
        this._cache.urlChannelId = result;
        this._cache.urlChannelIdTime = Date.now();
        this._cache.urlChannelIdSource = window.location.href;
      }

      return result;
    } catch (error) {
      return null;
    }
  },

  /**
   * Extracts guild ID from Discord URL
   * @param {string} url - URL to extract from (defaults to current location)
   * @returns {string|null} Guild ID or null if not found (e.g., in DMs)
   */
  extractGuildIdFromURL(url = null) {
    // Check cache first (only if no explicit URL provided)
    if (url === null) {
      const now = Date.now();
      if (
        this._cache.urlGuildId !== null &&
        this._cache.urlGuildIdTime &&
        now - this._cache.urlGuildIdTime < this._cache.urlGuildIdTTL &&
        window.location.href === this._cache.urlGuildIdSource
      ) {
        return this._cache.urlGuildId;
      }
    }

    try {
      const targetUrl = url || window.location.href;
      const urlMatch = targetUrl.match(C.GUILD_CHANNEL_URL_PATTERN);
      // DMs use /channels/@me/{channelId} - no guild ID
      const result = urlMatch?.[1] && urlMatch[1] !== '@me' ? urlMatch[1] : null;

      // Cache result if no explicit URL provided
      if (url === null) {
        this._cache.urlGuildId = result;
        this._cache.urlGuildIdTime = Date.now();
        this._cache.urlGuildIdSource = window.location.href;
      }

      return result;
    } catch (error) {
      return null;
    }
  },

  /**
   * Gets the current Discord channel ID from URL or DOM
   * @returns {string|null} Channel ID or null if not found
   */
  _getCurrentChannelId() {
    // Check cache first
    const now = Date.now();
    if (
      this._cache.currentChannelId !== null &&
      this._cache.currentChannelIdTime &&
      now - this._cache.currentChannelIdTime < this._cache.currentChannelIdTTL
    ) {
      return this._cache.currentChannelId;
    }

    try {
      // Method 1: SelectedChannelStore (most reliable for thread/forum contexts)
      const selectedChannelStore = this.webpackModules.SelectedChannelStore;
      const selectedChannelIdCandidate =
        selectedChannelStore?.getChannelId?.() ||
        selectedChannelStore?.getCurrentlySelectedChannelId?.() ||
        selectedChannelStore?.getLastSelectedChannelId?.(this.currentGuildId);

      const selectedChannelId =
        this.extractPureDiscordId(selectedChannelIdCandidate) ||
        this.normalizeId(selectedChannelIdCandidate);

      if (this.isValidDiscordId(selectedChannelId)) {
        this._cache.currentChannelId = selectedChannelId;
        this._cache.currentChannelIdTime = now;
        return selectedChannelId;
      }

      // Method 2: Extract from URL (fallback)
      const channelIdFromURL = this.extractChannelIdFromURL();
      if (channelIdFromURL) {
        this._cache.currentChannelId = channelIdFromURL;
        this._cache.currentChannelIdTime = now;
        return channelIdFromURL;
      }

      // Method 3: Extract from message elements in DOM
      const messageElement = document.querySelector(dc.sel.message);
      const channelIdAttr = messageElement?.getAttribute('data-channel-id');
      const result = channelIdAttr || null;

      this._cache.currentChannelId = result;
      this._cache.currentChannelIdTime = now;

      return result;
    } catch (error) {
      this.debugError('GET_CURRENT_CHANNEL_ID', error);
      this._cache.currentChannelId = null;
      this._cache.currentChannelIdTime = now;
      return null;
    }
  },

  /**
   * Gets the current Discord guild ID from URL
   * @returns {string|null} Guild ID or null if not found (e.g., in DMs)
   */
  _getCurrentGuildId() {
    const now = Date.now();
    if (
      this._cache.currentGuildId !== null &&
      this._cache.currentGuildIdTime &&
      now - this._cache.currentGuildIdTime < this._cache.currentGuildIdTTL
    ) {
      return this._cache.currentGuildId;
    }

    try {
      const selectedGuildStore = this.webpackModules.SelectedGuildStore;
      const selectedGuildIdCandidate =
        selectedGuildStore?.getGuildId?.() ||
        selectedGuildStore?.getLastSelectedGuildId?.() ||
        selectedGuildStore?.getCurrentGuildId?.();

      const selectedGuildId =
        this.extractPureDiscordId(selectedGuildIdCandidate) ||
        this.normalizeId(selectedGuildIdCandidate);

      if (this.isValidDiscordId(selectedGuildId)) {
        this._cache.currentGuildId = selectedGuildId;
        this._cache.currentGuildIdTime = now;
        return selectedGuildId;
      }

      const guildIdFromURL = this.extractGuildIdFromURL();
      this._cache.currentGuildId = guildIdFromURL;
      this._cache.currentGuildIdTime = now;
      return guildIdFromURL;
    } catch (error) {
      this.debugError('GET_CURRENT_GUILD_ID', error);
      this._cache.currentGuildId = null;
      this._cache.currentGuildIdTime = now;
      return null;
    }
  },

  /**
   * Extracts channel ID from message container (fallback method)
   * @param {HTMLElement|null} container - Message container element
   * @returns {string|null} Channel ID or null
   */
  _extractChannelIdFromContainer(container) {
    if (!container) return null;
    const firstMessage = dc.query(container, 'message');
    return (
      firstMessage?.getAttribute('data-channel-id') ||
      firstMessage?.closest('[data-channel-id]')?.getAttribute('data-channel-id') ||
      null
    );
  },

  /**
   * Handles channel navigation changes
   * Saves history, clears session tracking, and re-initializes observer
   * @param {boolean} verbose - Whether to log verbose debug info
   */
  _handleChannelChange(verbose = false) {
    if (this._isStopped) return;

    // PERF: Immediately detach the NavBus listener so rapid channel clicks
    // during the 500ms CHANNEL_CHANGE_DELAY can't queue duplicate startObserving() calls.
    this.teardownChannelChangeListener();

    // Save current session data before navigating
    if (this.currentChannelId) {
      const critCount = this.getCritHistory().length;
      this.debugLog(
        'CHANNEL_CHANGE',
        'CRITICAL: Channel changing - saving history before navigation',
        {
          channelId: this.currentChannelId,
          historySize: this.messageHistory.length,
          critCount: critCount,
          critsInChannel: this.getCritHistory(this.currentChannelId).length,
        }
      );
      this._throttledSaveHistory(false);
      this.debugLog('CHANNEL_CHANGE', 'SUCCESS: History saved before navigation', {
        channelId: this.currentChannelId,
        historySize: this.messageHistory.length,
      });
    }

    // Clear processed messages when navigating (but keep history!)
    const oldProcessedCount = this.processedMessages.size;
    const oldCritCount = this.critMessages.size;
    this.clearSessionTracking();

    if (verbose || this.debug?.verbose) {
      this.debugLog('CHANNEL_CHANGE', 'Cleared session tracking (history preserved)', {
        oldProcessedCount,
        oldCritCount,
        historySize: this.messageHistory.length,
      });
    }

    this._setTrackedTimeout(() => this.startObserving(), C.CHANNEL_CHANGE_DELAY);
  },

  /**
   * Sets up listeners for channel navigation changes
   * Restores crit styling when switching channels
   */
  setupChannelChangeListener() {
    // PERF: Tear down any existing listener before setting up a new one.
    this.teardownChannelChangeListener();

    // IMPORTANT: Do not use a document-wide MutationObserver to detect URL changes.
    // Discord's DOM mutates constantly; observing `document` with subtree:true can peg CPU.
    // Use history navigation hooks + popstate instead.
    let lastUrl = window.location.href;
    let scheduled = false;

    const scheduleNavigationCheck = (verbose = false) => {
      if (scheduled) return;
      scheduled = true;
      this._setTrackedTimeout(() => {
        scheduled = false;
        const currentUrl = window.location.href;
        if (currentUrl === lastUrl) return;
        lastUrl = currentUrl;
        this.debug?.verbose &&
          this.debugLog('CHANNEL_CHANGE', 'Channel changed, re-initializing...');
        this._handleChannelChange(verbose);
      }, 150);
    };

    // PERF(P5-1): Use shared NavigationBus instead of independent pushState wrapper
    if (this._pluginUtils?.NavigationBus) {
      this._navBusUnsub = this._pluginUtils.NavigationBus.subscribe(() => scheduleNavigationCheck(true));
    }
  },

  /**
   * Tears down channel change listeners
   */
  teardownChannelChangeListener() {
    try {
      this.urlObserver?.disconnect();
    } catch (e) {
      // Ignore
    } finally {
      this.urlObserver = null;
    }

    // PERF(P5-1): Unsubscribe from shared NavigationBus
    if (this._navBusUnsub) {
      this._navBusUnsub();
      this._navBusUnsub = null;
    }
  },
};
