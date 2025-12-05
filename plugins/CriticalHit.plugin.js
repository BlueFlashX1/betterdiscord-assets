/**
 * @name CriticalHit
 * @author BlueFlashX1
 * @description Critical hit system with visual effects and animations
 * @version 3.0.0
 *
 * @changelog v3.0.0 (2025-12-05)
 * - MAJOR REFACTOR: Organized into 4-section structure
 * - Section 1: Imports & Dependencies
 * - Section 2: Configuration & Helpers
 * - Section 3: Major Operations
 * - Section 4: Debugging & Development
 * - Ongoing optimization: Replacing for-loops and if-statements with functional alternatives
 * - Deep copy fixes for settings (prevents save corruption)
 *
 * @changelog v2.0.2 (2025-12-04)
 * - Reduced message history limit: 10,000 → 2,000 messages
 * - Memory optimization (~80% reduction in history storage)
 * - Improves renderer process memory footprint
 *
 * @changelog v2.0.1 (2025-12-04)
 * - Removed excessive console logging (spam reduction)
 * - "Saved X messages to history" now only shows in debug mode
 * - "Channel loaded" now only shows in debug mode
 * - "Restoring X crits" now only shows in debug mode
 * - Console clean for normal users, full logging available via debug mode
 */

// ============================================
// SECTION 1: IMPORTS & DEPENDENCIES
// ============================================
// No external imports (BetterDiscord plugin)

// ============================================
// SECTION 2: CONFIGURATION & HELPERS
// ============================================
// (Configuration constants and helper methods organized below in class)

// ============================================
// SECTION 3: MAJOR OPERATIONS
// ============================================
// (Core plugin logic organized below in class)

// ============================================
// SECTION 4: DEBUGGING & DEVELOPMENT
// ============================================
// (Debug system organized below in class)

module.exports = class CriticalHit {
  // ============================================
  // SECTION 2: CONFIGURATION & HELPERS
  // ============================================

  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================
  constructor() {
    // ============================================================================
    // DEFAULT SETTINGS (Merged from CriticalHit + CriticalHitAnimation)
    // ============================================================================
    this.defaultSettings = {
      enabled: true,
      critChance: 10, // Base crit chance (can be buffed by Agility/Luck/Skill Tree up to 30% max)
      critColor: '#ff0000', // Brilliant red (kept for compatibility, but gradient is used)
      critGradient: true, // Use purple-black gradient with pink glow
      critFont: "'Nova Flat', sans-serif", // Nova Flat - gradient text font
      critAnimation: true, // Add a subtle animation
      critGlow: true, // Add a glow effect
      // Filter settings
      filterReplies: true, // Don't apply crits to reply messages
      filterSystemMessages: true, // Don't apply crits to system messages (joins, leaves, etc.)
      filterBotMessages: false, // Don't apply crits to bot messages (optional)
      filterEmptyMessages: true, // Don't apply crits to messages with only embeds/attachments
      // History settings
      historyRetentionDays: 30, // Keep history for 30 days
      autoCleanupHistory: true, // Automatically clean up old history
      maxHistorySize: 2000, // Maximum total messages (memory optimization)
      maxCritHistory: 1000, // Maximum crit messages to keep (prioritized over non-crits)
      maxHistoryPerChannel: 500, // Maximum messages per channel (prevents one channel from dominating)
      // Animation settings (from CriticalHitAnimation)
      animationEnabled: true, // Enable animated "CRITICAL HIT!" notifications
      cssEnabled: true, // Enable CSS injection for crit styling (independent from animations)
      animationDuration: 4000, // 4 seconds - balanced visibility without being intrusive
      floatDistance: 150, // Increased for more visible float
      fontSize: 36,
      screenShake: true,
      shakeIntensity: 3,
      shakeDuration: 250,
      cooldown: 500,
      showCombo: true,
      maxCombo: 999,
      ownUserId: null,
      // Debug settings
      debugMode: false, // Debug logging (can be toggled in settings)
    };

    // CRITICAL FIX: Deep copy to prevent defaultSettings modification
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.messageObserver = null;
    this.urlObserver = null;
    this.styleObservers = new Map(); // Track MutationObservers for individual messages to catch DOM replacements
    this.critMessages = new Set(); // Track which messages are crits (in current session)
    this.processedMessages = new Set(); // Track all processed messages (crit or not) - uses message IDs
    this.processedMessagesOrder = []; // Track insertion order for LRU cleanup
    this.maxProcessedMessages = 5000; // Maximum processed messages to keep in memory
    this.messageHistory = []; // Full history of all processed messages with crit info
    // Pending crits queue to handle race condition
    this.pendingCrits = new Map(); // Map<messageId, {critSettings, timestamp, channelId}>
    this.maxPendingCrits = 100;
    // Cache crit history to avoid repeated filter operations
    this._cachedCritHistory = null;
    this._cachedCritHistoryTimestamp = 0;
    this._cachedCritHistoryMaxAge = 1000; // 1 second cache validity
    // Throttle restoration checks to prevent spam
    this._restorationCheckThrottle = new Map(); // Map<messageId, lastCheckTime>
    this._restorationCheckThrottleMs = 100; // Minimum 100ms between checks for same message
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.observerStartTime = Date.now(); // Track when observer started
    this.channelLoadTime = Date.now(); // Track when channel finished loading
    this.isLoadingChannel = false; // Flag to prevent processing during channel load
    this.currentChannelId = null; // Track current channel ID
    // OPTIMIZED: Smart history limits with crit prioritization (configurable via settings)
    // Initialize from settings, fallback to defaults if not set
    this.maxHistorySize = this.settings.maxHistorySize ?? 2000;
    this.maxCritHistory = this.settings.maxCritHistory ?? 1000;
    this.maxHistoryPerChannel = this.settings.maxHistoryPerChannel ?? 500;
    this.historyCleanupInterval = null; // Interval for periodic history cleanup
    this._forceNovaInterval = null; // Interval for Nova Flat font enforcement (legacy, now using MutationObserver)
    this._displayUpdateInterval = null; // Interval for settings panel display updates
    this.novaFlatObserver = null; // MutationObserver for Nova Flat font enforcement
    // Cache DOM queries
    this._cachedMessageSelectors = null;
    this._cachedMessageSelectorsTimestamp = 0;
    this._cachedMessageSelectorsMaxAge = 2000; // 2 seconds cache validity
    // Processing locks to prevent duplicate calls during spam
    this._processingCrits = new Set(); // Track message IDs currently being processed for crit styling
    this._processingAnimations = new Set(); // Track message IDs currently being processed for animation
    this._onCritHitThrottle = new Map(); // Map<messageId, lastCallTime> - throttle onCritHit calls
    this._onCritHitThrottleMs = 200; // Minimum 200ms between onCritHit calls for same message
    this._comboUpdatedMessages = new Set(); // Track message IDs that have already had combo updated (prevents duplicate increments)
    this._comboUpdatedContentHashes = new Set(); // Track content hashes that have already had combo updated (prevents duplicate increments when message ID changes)

    // Debug system (default disabled, throttling for frequent ops)
    // Note: debug.enabled is updated in loadSettings() after settings are loaded
    this.debug = {
      enabled: false, // Will be set from settings in loadSettings()
      errorCount: 0,
      lastError: null,
      operationCounts: {},
      lastLogTimes: {}, // Track last log time for throttling
    };

    // Stats tracking
    this.stats = {
      totalCrits: 0,
      totalMessages: 0,
      critRate: 0,
      lastUpdated: Date.now(),
    };

    // ============================================================================
    // ANIMATION STATE (from CriticalHitAnimation)
    // ============================================================================
    this.animationContainer = null;
    this.activeAnimations = new Set();
    this.userCombos = new Map();
    this.animatedMessages = new Map(); // Stores { position, timestamp, messageId } for duplicate detection
    this.currentUserId = null;
    this.pluginStartTime = Date.now();
    this.lastAnimationTime = 0;
    this._comboUpdateLock = new Set(); // Tracks users with in-progress combo updates

    // Cached DOM queries (animation)
    this._cachedChatInput = null;
    this._cachedMessageList = null;
    this._cachedMessages = null;
    this._cacheTimestamp = 0;
    this._cacheMaxAge = 5000; // 5 seconds cache validity
  }

  // ============================================================================
  // HELPER FUNCTIONS - EXTRACTED FROM LONG FUNCTIONS
  // ============================================================================

  // ============================================================================
  // ID NORMALIZATION & VALIDATION HELPERS
  // ============================================================================

  /**
   * Normalizes an ID to string and trims whitespace
   * @param {string|number|null|undefined} id - ID to normalize
   * @returns {string|null} Normalized ID or null
   */
  normalizeId(id) {
    return id ? String(id).trim() : null;
  }

  /**
   * Validates if a string is a valid Discord ID (17-19 digits)
   * @param {string|null|undefined} id - ID to validate
   * @returns {boolean} True if valid Discord ID
   */
  isValidDiscordId(id) {
    return id ? /^\d{17,19}$/.test(String(id).trim()) : false;
  }

  /**
   * Extracts pure Discord ID from composite formats
   * @param {string} id - ID that may contain Discord ID
   * @returns {string|null} Pure Discord ID or null
   */
  extractPureDiscordId(id) {
    if (!id) return null;
    const normalized = String(id).trim();
    if (/^\d{17,19}$/.test(normalized)) return normalized;
    const match = normalized.match(/\d{17,19}/);
    return match ? match[0] : null;
  }

  /**
   * Unified content hash calculation (replaces getContentHash and calculateContentHashForRestoration)
   * @param {string} author - Author username
   * @param {string} content - Message content
   * @param {string|number|null} timestamp - Optional timestamp
   * @returns {string|null} Content hash or null if invalid input
   */
  calculateContentHash(author, content, timestamp = null) {
    if (!author || !content) return null;
    const hashContent = `${author}:${content.substring(0, 100)}:${timestamp || ''}`;
    const hash = Array.from(hashContent).reduce((acc, char) => {
      const charCode = char.charCodeAt(0);
      acc = (acc << 5) - acc + charCode;
      return acc & acc;
    }, 0);
    return `hash_${Math.abs(hash)}`;
  }

  /**
   * Applies multiple style properties to an element in batch
   * @param {HTMLElement} element - Element to style
   * @param {Object} styles - Object with CSS property names and values
   * @param {boolean} important - Whether to use !important flag
   */
  applyStyles(element, styles, important = true) {
    if (!element) return;
    const flag = important ? 'important' : '';
    Object.entries(styles).forEach(([prop, value]) => {
      element.style.setProperty(prop, value, flag);
    });
  }

  /**
   * Excludes username/timestamp elements from styling
   * @param {HTMLElement} messageElement - Parent message element
   * @param {Array<string>} properties - CSS properties to unset
   */
  excludeHeaderElements(
    messageElement,
    properties = [
      'background',
      'background-image',
      '-webkit-background-clip',
      'background-clip',
      '-webkit-text-fill-color',
      'color',
    ]
  ) {
    if (!messageElement) return;
    const usernameElements = messageElement.querySelectorAll(
      '[class*="username"], [class*="timestamp"], [class*="author"]'
    );
    usernameElements.forEach((el) => {
      properties.forEach((prop) => {
        el.style.setProperty(prop, 'unset', 'important');
      });
    });
  }

  /**
   * Applies gradient styles to content element (unified helper)
   * @param {HTMLElement} content - Content element
   * @param {HTMLElement} messageElement - Parent message element
   * @param {string} gradientColors - Gradient color string
   * @returns {boolean} True if gradient was applied successfully
   */
  applyGradientStyles(
    content,
    messageElement,
    gradientColors = 'linear-gradient(to bottom, #8b5cf6 0%, #6d28d9 50%, #000000 100%)'
  ) {
    if (!content) return false;

    this.applyStyles(content, {
      'background-image': gradientColors,
      background: gradientColors,
      '-webkit-background-clip': 'text',
      'background-clip': 'text',
      '-webkit-text-fill-color': 'transparent',
      color: 'transparent',
      display: 'inline-block',
    });

    void content.offsetHeight;

    // Verify and reapply if needed
    const computed = window.getComputedStyle(content);
    const hasGradient = computed?.backgroundImage?.includes('gradient');
    const hasClip =
      computed?.webkitBackgroundClip === 'text' || computed?.backgroundClip === 'text';

    if (!hasGradient || !hasClip) {
      this.applyStyles(content, {
        'background-image': gradientColors,
        background: gradientColors,
        '-webkit-background-clip': 'text',
        'background-clip': 'text',
        '-webkit-text-fill-color': 'transparent',
        color: 'transparent',
        display: 'inline-block',
      });
      void content.offsetHeight;
    }

    this.excludeHeaderElements(messageElement);
    return hasGradient;
  }

  // ============================================================================
  // MESSAGE HISTORY HELPERS (from addToHistory)
  // ============================================================================

  /**
   * Checks if a message ID exists in CriticalHit plugin's message history
   * @param {string} messageId - The message ID to check
   * @returns {boolean} True if message is in history
   */
  isMessageInHistory(messageId) {
    try {
      const history = BdApi.Data.load('CriticalHit', 'messageHistory');
      if (!Array.isArray(history)) return false;
      return history.some((entry) => String(entry.messageId) === String(messageId));
    } catch (error) {
      return false;
    }
  }

  /**
   * Attempts to extract a Discord message ID from a given message element.
   * Falls back to a stable content hash if no message ID can be found.
   *
   * @param {HTMLElement} messageElement
   * @param {Object} [debugContext]
   * @returns {string|null} messageId
   */
  getMessageIdFromElement(messageElement, debugContext = {}) {
    let messageId = null;
    let extractionMethod = null;

    // Method 2: data-list-item-id attribute
    const listItemId =
      messageElement.getAttribute('data-list-item-id') ||
      messageElement.closest('[data-list-item-id]')?.getAttribute('data-list-item-id');

    if (listItemId) {
      const idStr = String(listItemId).trim();
      messageId = this.isValidDiscordId(idStr) ? idStr : this.extractDiscordId(idStr);
      extractionMethod = this.isValidDiscordId(idStr)
        ? 'data-list-item-id_pure'
        : messageId
        ? 'data-list-item-id_extracted'
        : null;
    }

    // Method 3: Check for id attribute - extract pure message ID from composite formats
    // Be careful - id attributes often contain channel IDs, so prioritize message ID
    if (!messageId) {
      const idAttr =
        messageElement.getAttribute('id') || messageElement.closest('[id]')?.getAttribute('id');
      if (idAttr) {
        const idStr = String(idAttr).trim();
        messageId = this.isValidDiscordId(idStr) ? idStr : this.extractDiscordId(idStr);
        extractionMethod = this.isValidDiscordId(idStr)
          ? 'id_attr_pure'
          : messageId
          ? 'id_attr_extracted'
          : null;
      }
    }

    // Method 4: Check data-message-id attribute (more specific than id attribute)
    if (!messageId) {
      const dataMsgId =
        messageElement.getAttribute('data-message-id') ||
        messageElement.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
        messageElement.closest('[data-message-id]')?.getAttribute('data-message-id');
      if (dataMsgId) {
        const idStr = String(dataMsgId).trim();
        messageId = this.isValidDiscordId(idStr) ? idStr : this.extractDiscordId(idStr);
        extractionMethod = this.isValidDiscordId(idStr)
          ? 'data-message-id'
          : messageId
          ? 'data-message-id_extracted'
          : null;
      }
    }

    // Normalize to string and trim, then validate
    if (messageId) {
      messageId = String(messageId).trim();
      if (!this.isValidDiscordId(messageId)) {
        const extracted = this.extractDiscordId(messageId);
        messageId = extracted || null;
        extractionMethod = extracted
          ? extractionMethod
            ? `${extractionMethod}_extracted`
            : 'regex_extracted'
          : null;
      }
    }

    // Method 5: Fallback - create stable hash from content + author + timestamp
    // Only use this if we absolutely cannot get a Discord message ID
    if (!messageId) {
      const content = messageElement.textContent?.trim() || '';
      const author =
        messageElement.querySelector('[class*="username"]')?.textContent?.trim() ||
        messageElement.querySelector('[class*="author"]')?.textContent?.trim() ||
        '';
      const timestamp = messageElement.querySelector('time')?.getAttribute('datetime') || '';

      if (content) {
        messageId = author
          ? this.createContentHash(content, author, timestamp)
          : this.createContentHash(content);
        extractionMethod = author ? 'content_hash' : 'content_only_hash';
      }
    }

    // Validate message ID format and warn if suspicious
    if (messageId) {
      const isValidFormat = this.isValidDiscordId(messageId);
      const isSuspicious = messageId.length < 17 || messageId.length > 19;

      // Always log suspicious IDs or when verbose debugging is enabled
      if (debugContext?.verbose || (debugContext && (isSuspicious || !isValidFormat))) {
        this.debugLog('GET_MESSAGE_ID', 'Message ID extracted', {
          messageId: messageId,
          messageIdLength: messageId.length,
          method: extractionMethod,
          isPureDiscordId: isValidFormat,
          isSuspicious: isSuspicious,
          phase: debugContext.phase,
          elementId: messageElement.getAttribute('id'),
          dataMessageId: messageElement.getAttribute('data-message-id'),
        });
      }

      // Warn if we got a suspiciously short ID (might be channel ID)
      if (isSuspicious && this.debug?.enabled) {
        console.warn('[CriticalHit] WARNING: Suspicious message ID extracted:', {
          messageId,
          length: messageId.length,
          method: extractionMethod,
          elementId: messageElement.getAttribute('id'),
        });
      }
    }

    return messageId;
  }

  /**
   * Checks if an element is in a header/username/timestamp area
   */
  isInHeaderArea(element) {
    if (!element) return true;

    // Check parent chain
    const headerParent =
      element.closest('[class*="header"]') ||
      element.closest('[class*="username"]') ||
      element.closest('[class*="timestamp"]') ||
      element.closest('[class*="author"]') ||
      element.closest('[class*="topSection"]') ||
      element.closest('[class*="messageHeader"]') ||
      element.closest('[class*="messageGroup"]') ||
      element.closest('[class*="messageGroupWrapper"]');

    if (headerParent) return true;

    // Check element's own classes
    const classes = Array.from(element.classList || []);
    return classes.some(
      (c) =>
        c.includes('header') ||
        c.includes('username') ||
        c.includes('timestamp') ||
        c.includes('author') ||
        c.includes('topSection') ||
        c.includes('messageHeader') ||
        c.includes('messageGroup')
    );
  }

  /**
   * Finds the message content element (excluding header/username/timestamp areas)
   */
  findMessageContentElement(messageElement) {
    const selectors = [
      '[class*="messageContent"]',
      '[class*="markup"]',
      '[class*="textContainer"]',
    ];

    // FUNCTIONAL: Try selectors (.find() instead of for-loop)
    const matchingElement = selectors
      .map((selector) => messageElement.querySelector(selector))
      .find((element) => element && !this.isInHeaderArea(element));

    if (matchingElement) return matchingElement;

    // FUNCTIONAL: Last resort - find divs (.find() instead of for-loop)
    return (
      Array.from(messageElement.querySelectorAll('div')).find(
        (div) => !this.isInHeaderArea(div) && div.textContent && div.textContent.trim().length > 0
      ) || null
    );
  }

  /**
   * Extracts author/user ID from a message element
   * Uses React fiber traversal, DOM attributes, and element queries as fallbacks
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {string|null} Author ID or null if not found
   */
  getAuthorId(messageElement) {
    try {
      // Method 1: Try React props (Discord stores message data in React)
      const reactKey = Object.keys(messageElement).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );

      if (reactKey) {
        // FUNCTIONAL: Fiber traversal (while loop for tree traversal)
        let fiber = messageElement[reactKey];
        let depth = 0;
        while (fiber && depth < 30) {
          depth++;
          // Try to get author ID from message props
          const authorId =
            fiber.memoizedProps?.message?.author?.id ||
            fiber.memoizedState?.message?.author?.id ||
            fiber.memoizedProps?.message?.authorId ||
            fiber.memoizedProps?.author?.id ||
            fiber.memoizedState?.author?.id ||
            fiber.memoizedProps?.messageAuthor?.id ||
            fiber.memoizedProps?.user?.id ||
            fiber.memoizedState?.user?.id;

          if (authorId && /^\d{17,19}$/.test(authorId)) {
            return String(authorId).trim();
          }

          fiber = fiber.return;
        }
      }

      // Method 2: Try to find author element and extract ID
      const authorElement =
        messageElement.querySelector('[class*="author"]') ||
        messageElement.querySelector('[class*="username"]') ||
        messageElement.querySelector('[class*="messageAuthor"]');

      if (authorElement) {
        const authorId =
          authorElement.getAttribute('data-user-id') ||
          authorElement.getAttribute('data-author-id') ||
          authorElement.getAttribute('id') ||
          authorElement.getAttribute('href')?.match(/users\/(\d{17,19})/)?.[1];

        if (authorId) {
          const match = authorId.match(/\d{17,19}/);
          if (match?.[0] && /^\d{17,19}$/.test(match[0])) {
            return match[0];
          }
        }
      }

      // Method 3: Try to find any element with user ID attribute in the message
      const allElements = messageElement.querySelectorAll(
        '[data-user-id], [data-author-id], [href*="/users/"]'
      );
      const foundElement = Array.from(allElements).find((el) => {
        const id =
          el.getAttribute('data-user-id') ||
          el.getAttribute('data-author-id') ||
          el.getAttribute('href')?.match(/users\/(\d{17,19})/)?.[1];
        return id && /^\d{17,19}$/.test(id);
      });
      if (foundElement) {
        const id =
          foundElement.getAttribute('data-user-id') ||
          foundElement.getAttribute('data-author-id') ||
          foundElement.getAttribute('href')?.match(/users\/(\d{17,19})/)?.[1];
        return String(id).trim();
      }
    } catch (error) {
      this.debugError('GET_AUTHOR_ID', error);
    }

    return null;
  }

  /**
   * Verifies if gradient styling is properly applied to a content element
   * Checks both inline styles and computed styles for gradient background and text clip
   * @param {HTMLElement} contentElement - The content DOM element to check
   * @returns {Object} Object with hasGradient, hasWebkitClip, and hasGradientInStyle flags
   */
  verifyGradientApplied(contentElement) {
    if (!contentElement) {
      return { hasGradient: false, hasWebkitClip: false, hasGradientInStyle: false };
    }

    const computedStyles = window.getComputedStyle(contentElement);
    const hasGradientInStyle = contentElement?.style?.backgroundImage?.includes('gradient');
    const hasGradientInComputed = computedStyles?.backgroundImage?.includes('gradient');
    const hasWebkitClip =
      computedStyles?.webkitBackgroundClip === 'text' || computedStyles?.backgroundClip === 'text';

    return {
      hasGradient: hasGradientInComputed,
      hasWebkitClip: hasWebkitClip,
      hasGradientInStyle: hasGradientInStyle,
    };
  }

  /**
   * Re-queries a message element from the DOM by message ID
   * Used when Discord replaces DOM elements to get fresh references
   * @param {string} messageId - The message ID to search for
   * @param {HTMLElement} fallbackElement - Optional fallback element if not found
   * @returns {HTMLElement|null} The found message element or null
   */
  requeryMessageElement(messageId, fallbackElement = null) {
    if (!messageId) return fallbackElement;

    // Try direct query first (fastest)
    const directMatch = document.querySelector(`[data-message-id="${messageId}"]`);
    if (directMatch) return directMatch;

    // Fallback: Search all message elements
    const foundElement = Array.from(document.querySelectorAll('[class*="message"]')).find((el) => {
      const id = this.getMessageIdentifier(el);
      return id === messageId || String(id).includes(messageId);
    });

    return foundElement || fallbackElement;
  }

  // ============================================================================
  // CHANNEL RESTORATION HELPERS
  // ============================================================================

  /**
   * Sets up listeners for channel navigation changes
   * Restores crit styling when switching channels
   */
  setupChannelChangeListener() {
    // Listen for channel changes by watching URL changes
    this.urlObserver?.disconnect();

    let lastUrl = window.location.href;
    this.urlObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Channel changed, re-initialize observer
        this.debug?.enabled && console.log('CriticalHit: Channel changed, re-initializing...');
        // OPTIMIZED: Save current session data before switching (throttled)
        this.currentChannelId && this._throttledSaveHistory(false);
        // Clear processed messages when channel changes
        this.processedMessages.clear();
        this.processedMessagesOrder = [];
        this.critMessages.clear();
        setTimeout(() => {
          this.startObserving();
        }, 500);
      }
    });

    // Observe document for URL changes
    this.urlObserver.observe(document, {
      childList: true,
      subtree: true,
    });

    // Also listen for Discord's navigation events
    if (!this.originalPushState) {
      this.originalPushState = history.pushState;
      this.originalReplaceState = history.replaceState;
    }

    const handleNavigation = () => {
      // Save current session data before navigating
      if (this.currentChannelId) {
        // Use cached getCritHistory method
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
      this.processedMessages.clear();
      this.processedMessagesOrder = [];
      this.critMessages.clear();
      this.debugLog('CHANNEL_CHANGE', 'Cleared session tracking (history preserved)', {
        oldProcessedCount,
        oldCritCount,
        historySize: this.messageHistory.length,
      });
      setTimeout(() => {
        this.startObserving();
      }, 500);
    };

    history.pushState = (...args) => {
      this.originalPushState.apply(history, args);
      handleNavigation();
    };

    history.replaceState = (...args) => {
      this.originalReplaceState.apply(history, args);
      handleNavigation();
    };
  }

  // ============================================================================
  // ANIMATION HELPERS
  // ============================================================================

  /**
   * Checks for duplicate animations already in the DOM
   * Prevents multiple animations for the same message
   * @param {HTMLElement} container - Animation container element
   * @param {string} messageId - The message ID
   * @param {Object} position - Position object with x and y coordinates
   * @returns {boolean} True if duplicate found
   */
  hasDuplicateInDOM(container, messageId, position) {
    if (
      messageId &&
      container.querySelectorAll(`[data-cha-message-id="${messageId}"]`).length > 0
    ) {
      return true;
    }

    // Position-based check for null messageId
    const positionTolerance = 100;
    const timeTolerance = 1000;
    const now = Date.now();

    return Array.from(this.activeAnimations).some((activeEl) => {
      if (!activeEl.parentNode) return false;

      try {
        const activeRect = activeEl.getBoundingClientRect();
        const activePosition = {
          x: activeRect.left + activeRect.width / 2,
          y: activeRect.top + activeRect.height / 2,
        };
        const positionDiff =
          Math.abs(activePosition.x - position.x) + Math.abs(activePosition.y - position.y);
        const timeDiff = now - (activeEl._chaCreatedTime || 0);

        return positionDiff < positionTolerance && timeDiff < timeTolerance;
      } catch (error) {
        return false;
      }
    });
  }

  /**
   * Create animation text element
   */
  createAnimationElement(messageId, combo, position) {
    const textElement = document.createElement('div');
    textElement.className = 'cha-critical-hit-text';

    messageId && textElement.setAttribute('data-cha-message-id', messageId);

    // Ensure combo is a valid number
    const comboValue = typeof combo === 'number' && combo > 0 ? combo : 1;
    const comboText =
      comboValue > 1 && this.settings.showCombo ? `CRITICAL HIT! x${comboValue}` : 'CRITICAL HIT!';

    textElement.innerHTML = comboText; // Set only positioning and layout styles - let CSS class handle animation and opacity
    textElement.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      font-size: ${this.settings.fontSize}px;
      font-weight: bold;
      text-align: center;
      pointer-events: none;
      z-index: 999999;
      white-space: nowrap;
    `;

    // Set CSS variables for dynamic animation values (like LevelUpAnimation)
    // Use negative value for float distance (moves up)
    textElement.style.setProperty('--cha-float-distance', `-${this.settings.floatDistance}px`);
    textElement.style.setProperty('--cha-duration', `${this.settings.animationDuration}ms`);

    textElement._chaCreatedTime = Date.now();
    textElement._chaPosition = { x: position.x, y: position.y };

    // Ensure gradient is visible
    requestAnimationFrame(() => {
      const computedStyle = window.getComputedStyle(textElement);
      const textFillColor = computedStyle.webkitTextFillColor || computedStyle.color;
      const hasGradient = computedStyle.background?.includes('gradient');

      if (
        (textFillColor === 'transparent' || textFillColor === 'rgba(0, 0, 0, 0)') &&
        !hasGradient
      ) {
        textElement.style.setProperty('-webkit-text-fill-color', '#ff8800', 'important');
        textElement.style.setProperty('color', '#ff8800', 'important');
      }
    });

    return textElement;
  }

  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================
  // Core plugin logic: message processing, crit detection, styling, restoration
  // ============================================================================

  // ============================================================================
  // MESSAGE HISTORY MANAGEMENT
  // ============================================================================

  /**
   * Smart history trimming with crit prioritization
   * - Prioritizes keeping crits over non-crits
   * - Enforces per-channel limits
   * - Respects total history limit
   */
  _trimHistoryIfNeeded() {
    const oldSize = this.messageHistory.length;
    if (oldSize <= this.maxHistorySize) {
      // Check per-channel limits
      this._trimPerChannelHistory();
      return;
    }

    const oldCritCount = this.getCritHistory().length;

    // Separate crits and non-crits
    const crits = this.messageHistory.filter((entry) => entry.isCrit);
    const nonCrits = this.messageHistory.filter((entry) => !entry.isCrit);

    // Prioritize crits: keep up to maxCritHistory
    const critsToKeep = crits.slice(-Math.min(crits.length, this.maxCritHistory));

    // Calculate remaining slots for non-crits
    const remainingSlots = this.maxHistorySize - critsToKeep.length;
    const nonCritsToKeep = nonCrits.slice(-Math.max(0, remainingSlots));

    // Combine: crits first (oldest to newest), then non-crits (oldest to newest)
    // This maintains chronological order while prioritizing crits
    const combined = [...critsToKeep, ...nonCritsToKeep];

    // Sort by timestamp to maintain chronological order
    combined.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Keep only the most recent messages within limit
    this.messageHistory = combined.slice(-this.maxHistorySize);

    // Invalidate cache after history modification
    this._cachedCritHistory = null;
    const newCritCount = this.getCritHistory().length;
    const critsLost = oldCritCount - newCritCount;

    if (oldSize !== this.messageHistory.length) {
      this.debugLog('TRIM_HISTORY', 'History trimmed with crit prioritization', {
        oldSize,
        newSize: this.messageHistory.length,
        oldCritCount,
        newCritCount,
        critsLost,
        nonCritsRemoved: oldSize - this.messageHistory.length - critsLost,
        maxHistorySize: this.maxHistorySize,
        maxCritHistory: this.maxCritHistory,
      });
    }

    // Also trim per-channel history
    this._trimPerChannelHistory();
  }

  /**
   * Trims history per channel to prevent one channel from dominating
   */
  _trimPerChannelHistory() {
    const channelCounts = {};
    const channelMessages = {};

    // Group messages by channel
    this.messageHistory.forEach((entry, index) => {
      const channelId = entry.channelId || 'unknown';
      if (!channelCounts[channelId]) {
        channelCounts[channelId] = 0;
        channelMessages[channelId] = [];
      }
      channelCounts[channelId]++;
      channelMessages[channelId].push({ entry, index });
    });

    // Find channels exceeding limit
    const channelsToTrim = Object.keys(channelCounts).filter(
      (channelId) => channelCounts[channelId] > this.maxHistoryPerChannel
    );

    if (channelsToTrim.length === 0) return;

    // For each channel exceeding limit, remove oldest messages
    channelsToTrim.forEach((channelId) => {
      const messages = channelMessages[channelId];
      const excess = messages.length - this.maxHistoryPerChannel;

      // Sort by timestamp (oldest first) and remove excess
      messages.sort((a, b) => (a.entry.timestamp || 0) - (b.entry.timestamp || 0));
      const toRemove = messages.slice(0, excess);

      // Remove from history (in reverse order to maintain indices)
      toRemove
        .sort((a, b) => b.index - a.index)
        .forEach(({ index }) => {
          this.messageHistory.splice(index, 1);
        });

      this.debugLog('TRIM_PER_CHANNEL', 'Trimmed channel history', {
        channelId,
        before: messages.length,
        after: this.maxHistoryPerChannel,
        removed: excess,
        maxPerChannel: this.maxHistoryPerChannel,
      });
    });

    // Invalidate cache after modification
    this._cachedCritHistory = null;
  }

  /**
   * Throttled save history - prevents lag from frequent saves
   * @param {boolean} isCrit - Whether this save was triggered by a crit
   */
  _throttledSaveHistory(isCrit = false) {
    const now = Date.now();
    const timeSinceLastSave = now - this._lastSaveTime;

    // If save is already pending, just increment counter
    if (this._saveHistoryPending) {
      if (isCrit) this._pendingCritSaves++;
      return;
    }

    // Force immediate save if too much time has passed (prevent data loss)
    const shouldForceSave = timeSinceLastSave >= this._maxSaveInterval;

    // Throttle: Wait minimum interval unless forcing
    if (!shouldForceSave && timeSinceLastSave < this._minSaveInterval) {
      this._saveHistoryPending = true;
      this._saveHistoryThrottle = setTimeout(() => {
        this._saveHistoryPending = false;
        this._pendingCritSaves = 0;
        this.saveMessageHistory();
        this._lastSaveTime = Date.now();
      }, this._minSaveInterval - timeSinceLastSave);
      return;
    }

    // Save immediately (either forced or enough time passed)
    this._saveHistoryPending = false;
    this._pendingCritSaves = 0;
    this.saveMessageHistory();
    this._lastSaveTime = now;
  }

  /**
   * Saves message history to BetterDiscord storage
   * Includes all processed messages with crit status and settings
   * OPTIMIZED: Use _throttledSaveHistory() instead of calling this directly
   */
  saveMessageHistory() {
    try {
      // Use cached crit history or compute once
      const critHistory = this.getCritHistory();
      const critCount = critHistory.length;
      // FUNCTIONAL: Count crits by channel (.forEach() instead of for-loop)
      const critsByChannel = {};
      critHistory.forEach((entry) => {
        const channelId = entry.channelId || 'unknown';
        critsByChannel[channelId] = (critsByChannel[channelId] || 0) + 1;
      });

      this.debugLog('SAVE_MESSAGE_HISTORY', 'CRITICAL: Saving message history to storage', {
        historySize: this.messageHistory.length,
        critCount: critCount,
        critsByChannel: critsByChannel,
        maxSize: this.maxHistorySize,
      });

      // OPTIMIZED: Smart history trimming with crit prioritization
      this._trimHistoryIfNeeded();

      // OPTIMIZED: Save to BetterDiscord Data storage
      // Note: BdApi.Data.save() is synchronous and can block, but we've throttled calls
      BdApi.Data.save('CriticalHit', 'messageHistory', this.messageHistory);

      // OPTIMIZED: Skip verification in production (reduces lag from extra load)
      // Only verify if debug mode enabled
      if (this.debug?.enabled) {
        const verifyLoad = BdApi.Data.load('CriticalHit', 'messageHistory');
        const verifyCritCount =
          verifyLoad && Array.isArray(verifyLoad) ? verifyLoad.filter((e) => e.isCrit).length : 0;

        this.debugLog('SAVE_MESSAGE_HISTORY', 'SUCCESS: Message history saved successfully', {
          messageCount: this.messageHistory.length,
          critCount: critCount,
          verifyLoadSuccess: Array.isArray(verifyLoad),
          verifyMessageCount: verifyLoad ? verifyLoad.length : 0,
          verifyCritCount: verifyCritCount,
          saveVerified: verifyCritCount === critCount,
        });
      } else {
        this.debugLog('SAVE_MESSAGE_HISTORY', 'SUCCESS: Message history saved successfully', {
          messageCount: this.messageHistory.length,
          critCount: critCount,
          pendingCritSaves: this._pendingCritSaves,
        });
      }
      // Removed spammy console.log - use debugLog instead (only shows when debug mode enabled)
      this.debugLog(
        'SAVE_MESSAGE_HISTORY_SUMMARY',
        `Saved ${this.messageHistory.length} messages (${critCount} crits) to history`
      );
    } catch (error) {
      this.debugError('SAVE_MESSAGE_HISTORY', error, {
        historySize: this.messageHistory.length,
        critCount: this.getCritHistory().length,
        phase: 'save_history',
      });
    }
  }

  /**
   * Loads message history from BetterDiscord storage
   * Restores crit messages and their settings for persistence across sessions
   */
  loadMessageHistory() {
    try {
      this.debugLog('LOAD_MESSAGE_HISTORY', 'CRITICAL: Loading message history from storage');
      const saved = BdApi.Data.load('CriticalHit', 'messageHistory');

      if (Array.isArray(saved)) {
        this.messageHistory = saved;
        // Invalidate cache and compute crit history once
        this._cachedCritHistory = null;
        const critHistory = this.getCritHistory();
        const critCount = critHistory.length;
        const critsByChannel = critHistory.reduce((acc, entry) => {
          const channelId = entry.channelId || 'unknown';
          acc[channelId] = (acc[channelId] || 0) + 1;
          return acc;
        }, {});

        this.debugLog('LOAD_MESSAGE_HISTORY', 'SUCCESS: Message history loaded successfully', {
          messageCount: this.messageHistory.length,
          critCount: critCount,
          critsByChannel: critsByChannel,
          // Use cached getCritHistory method
          sampleCritIds: this.getCritHistory()
            .slice(0, 5)
            .map((e) => ({ messageId: e.messageId, channelId: e.channelId })),
        });
        console.log(
          `CriticalHit: Loaded ${this.messageHistory.length} messages (${critCount} crits) from history`
        );
      } else {
        this.messageHistory = [];
        this.debugLog(
          'LOAD_MESSAGE_HISTORY',
          'WARNING: No saved history found, initializing empty array',
          {
            savedType: typeof saved,
            savedValue: saved,
          }
        );
      }
    } catch (error) {
      this.debugError('LOAD_MESSAGE_HISTORY', error, { phase: 'load_history' });
      this.messageHistory = [];
    }
  }

  /**
   * Normalizes message data IDs to Discord format (17-19 digit numbers)
   * Extracts Discord IDs from composite formats and validates them
   * @param {Object} messageData - Raw message data
   * @returns {Object} Normalized IDs: { messageId, authorId, channelId }
   */
  normalizeMessageData(messageData) {
    // Use helper functions for normalization
    let messageId = this.normalizeId(messageData.messageId);
    messageId = messageId
      ? this.isValidDiscordId(messageId)
        ? messageId
        : this.extractPureDiscordId(messageId)
      : null;

    let authorId = this.normalizeId(messageData.authorId);
    authorId = authorId
      ? this.isValidDiscordId(authorId)
        ? authorId
        : this.extractPureDiscordId(authorId)
      : null;

    const channelId = this.normalizeId(messageData.channelId);

    return { messageId, authorId, channelId };
  }

  /**
   * Updates the pending crits queue with a new crit entry
   * Handles queue size limits, expiration cleanup, and content-based matching
   * @param {string} messageId - Normalized message ID
   * @param {boolean} isHashId - Whether this is a hash ID (temporary)
   * @param {Object} historyEntry - The history entry being added
   * @param {Object} messageData - Original message data
   * @param {string} channelId - Normalized channel ID
   */
  updatePendingCritsQueue(messageId, isHashId, historyEntry, messageData, channelId) {
    if (!historyEntry?.critSettings || !messageId || !messageData?.messageContent) return;

    const now = Date.now();

    // Clean up old pending crits (older than 5 seconds for queued messages) and limit size
    if (this.pendingCrits.size >= this.maxPendingCrits) {
      // Remove oldest entries first
      const sortedEntries = Array.from(this.pendingCrits.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );
      // FUNCTIONAL: Remove oldest entries (.slice() + .forEach() instead of for-loop)
      const toRemove = Math.floor(this.maxPendingCrits * 0.3);
      sortedEntries.slice(0, toRemove).forEach(([id]) => this.pendingCrits.delete(id));
    }

    // FUNCTIONAL: Remove expired entries (.forEach() + short-circuit instead of for-loop)
    const maxAge = isHashId ? 5000 : 3000;
    Array.from(this.pendingCrits.entries()).forEach(([pendingId, pendingData]) => {
      now - pendingData.timestamp > maxAge && this.pendingCrits.delete(pendingId);
    });

    // Create content hash for matching queued messages when they get real IDs
    const contentHash = this.calculateContentHash(
      messageData.author,
      messageData.messageContent,
      messageData.timestamp
    );

    // Add new crit with both message ID and content hash for matching
    const pendingEntry = {
      critSettings: historyEntry.critSettings,
      timestamp: now,
      channelId: channelId,
      messageContent: messageData.messageContent,
      author: messageData.author,
      contentHash: contentHash, // For matching when ID changes from hash to real
      isHashId: isHashId, // Track if this was originally a hash ID
    };

    // Store by message ID (works for both hash IDs and real IDs)
    this.pendingCrits.set(messageId, pendingEntry);

    // Also store by content hash if available (for matching when ID changes)
    contentHash && isHashId && this.pendingCrits.set(contentHash, pendingEntry);
  }

  /**
   * Finds an existing history entry by ID or content hash
   * Handles both direct ID matching and content-based matching for reprocessed messages
   * @param {string} messageId - Normalized message ID
   * @param {string} channelId - Channel ID
   * @param {boolean} isValidDiscordId - Whether messageId is a valid Discord ID
   * @param {boolean} isHashId - Whether messageId is a hash ID
   * @param {Object} messageData - Original message data for content matching
   * @returns {number} Index of existing entry, or -1 if not found
   */
  findExistingHistoryEntry(messageId, channelId, isValidDiscordId, isHashId, messageData) {
    // Try ID match first
    let existingIndex = this.messageHistory.findIndex(
      (entry) => entry.messageId === messageData.messageId && entry.channelId === channelId
    );

    // If no ID match and we have content, try content-based matching
    // This handles cases where message was "undone" and retyped with different ID
    if (
      existingIndex < 0 &&
      !isHashId &&
      isValidDiscordId &&
      messageData.messageContent &&
      messageData.author
    ) {
      const contentHash = this.calculateContentHash(
        messageData.author,
        messageData.messageContent,
        messageData.timestamp
      );
      existingIndex = this.messageHistory.findIndex((entry) => {
        if (entry.channelId !== channelId) return false;
        // Skip hash IDs in history
        if (String(entry.messageId).startsWith('hash_')) return false;
        // Match by content hash
        return (
          entry.messageContent &&
          entry.author &&
          this.calculateContentHash(entry.author, entry.messageContent, entry.timestamp) ===
            contentHash
        );
      });

      existingIndex >= 0 &&
        this.debugLog(
          'ADD_TO_HISTORY',
          'Found existing entry by content hash (reprocessed message)',
          {
            oldId: this.messageHistory[existingIndex].messageId,
            newId: messageData.messageId,
            contentHash,
          }
        );
    }

    return existingIndex;
  }

  /**
   * Adds a message to history with crit status and settings
   * Handles duplicate detection, content-based matching for reprocessed messages
   * @param {Object} messageData - Message data including ID, author, channel, crit status
   */
  addToHistory(messageData) {
    try {
      const isCrit = messageData.isCrit || false;

      // Normalize all IDs to Discord format
      const { messageId, authorId, channelId } = this.normalizeMessageData(messageData);

      this.debugLog(
        'ADD_TO_HISTORY',
        isCrit ? 'CRITICAL: Adding CRIT message to history' : 'Adding message to history',
        {
          messageId: messageId,
          authorId: authorId,
          channelId: channelId,
          isCrit: isCrit,
          useGradient: this.settings.critGradient !== false,
          hasMessageContent: !!messageData.messageContent,
          hasAuthor: !!messageData.author,
          hasAuthorId: !!authorId,
          messageIdFormat: messageId
            ? /^\d{17,19}$/.test(messageId)
              ? 'Discord ID'
              : 'Other'
            : 'null',
          authorIdFormat: authorId
            ? /^\d{17,19}$/.test(authorId)
              ? 'Discord ID'
              : 'Other'
            : 'null',
        }
      );

      // Add message to history with all essential info
      const historyEntry = {
        messageId: messageId || null, // Normalized message ID (Discord ID format preferred)
        authorId: authorId || null, // Normalized author/user ID (Discord ID format)
        channelId: channelId || null, // Normalized channel ID
        timestamp: messageData.timestamp || Date.now(),
        isCrit: isCrit,
        critSettings: isCrit
          ? {
              color: this.settings.critColor,
              gradient: this.settings.critGradient !== false, // Store gradient preference
              font: this.settings.critFont,
              animation: this.settings.critAnimation,
              glow: this.settings.critGlow,
            }
          : null,
        messageContent: messageData.messageContent || null,
        author: messageData.author || null, // Author username (for display)
      };

      // Invalidate crit history cache before adding to history
      // This ensures restoration checks immediately see the new crit
      if (isCrit) {
        this._cachedCritHistory = null;
        this._cachedCritHistoryTimestamp = null;
      }

      // Check if message already exists in history (update if exists)
      const isValidDiscordId = this.isValidDiscordId(messageId);
      const isHashId = messageId?.startsWith('hash_');

      // Add to pending queue immediately for crits to handle race condition
      // This allows restoration to find crits even before they're added to history
      isCrit &&
        this.updatePendingCritsQueue(messageId, isHashId, historyEntry, messageData, channelId);

      // Find existing entry by ID or content hash
      const existingIndex = this.findExistingHistoryEntry(
        messageId,
        channelId,
        isValidDiscordId,
        isHashId,
        messageData
      );

      if (existingIndex >= 0) {
        // Update existing entry
        const wasCrit = this.messageHistory[existingIndex].isCrit;
        const existingId = this.messageHistory[existingIndex].messageId;
        const existingIsHashId = String(existingId).startsWith('hash_'); // If updating from hash ID to valid Discord ID, this is a message being sent
        // Keep the crit status but update with the real Discord ID
        existingIsHashId &&
          isValidDiscordId &&
          wasCrit &&
          isCrit &&
          this.debugLog('ADD_TO_HISTORY', 'Updating hash ID to Discord ID for sent message', {
            oldId: existingId,
            newId: messageData.messageId,
            wasCrit,
            nowCrit: isCrit,
          });

        this.messageHistory[existingIndex] = historyEntry;
        this.debugLog('ADD_TO_HISTORY', 'Updated existing history entry', {
          index: existingIndex,
          wasCrit: wasCrit,
          nowCrit: isCrit,
          messageId: messageData.messageId,
          authorId: messageData.authorId,
        });
      } else {
        // Add new entry
        const isHashId = messageData.messageId?.startsWith('hash_');

        // Only add to history if message has valid Discord ID (actually sent)
        // Hash IDs are for unsent/pending messages that might be "undone" - don't add to history
        if (isHashId) {
          this.debugLog('ADD_TO_HISTORY', 'Skipping hash ID (unsent/pending message)', {
            messageId: messageData.messageId,
            isCrit,
            note: 'Hash IDs are created for messages without Discord IDs - these are likely unsent/pending messages that should not be stored in history',
          });
          return; // Don't add hash IDs to history
        }

        this.messageHistory.push(historyEntry);

        // OPTIMIZED: Smart history trimming with crit prioritization
        this._trimHistoryIfNeeded();

        // Invalidate cache when history is modified
        isCrit && (this._cachedCritHistory = null);
        this.debugLog('ADD_TO_HISTORY', 'Added new history entry', {
          index: this.messageHistory.length - 1,
          isCrit: isCrit,
          messageId: messageData.messageId,
          authorId: messageData.authorId,
        });
      }

      // OPTIMIZED: Throttled auto-save to prevent lag
      // Save immediately on crit (but throttled), periodically for non-crits
      if (isCrit) {
        this.debugLog('ADD_TO_HISTORY', 'CRITICAL: Queueing save for crit message', {
          messageId: messageData.messageId,
          channelId: messageData.channelId,
        });
        this._pendingCritSaves++;
        this._throttledSaveHistory(true); // Queue save (throttled)
      } else if (this.messageHistory.length % 20 === 0) {
        this._throttledSaveHistory(false); // Queue save for non-crits (throttled)
      }

      // Use cached getCritHistory method
      const finalCritCount = this.getCritHistory().length;
      this.debugLog(
        'ADD_TO_HISTORY',
        isCrit ? 'SUCCESS: Crit message added to history' : 'Message added to history',
        {
          historySize: this.messageHistory.length,
          totalCritCount: finalCritCount,
          isCrit: historyEntry.isCrit,
          hasCritSettings: !!historyEntry.critSettings,
          messageId: messageData.messageId,
          authorId: messageData.authorId,
          channelId: messageData.channelId,
        }
      );
    } catch (error) {
      this.debugError('ADD_TO_HISTORY', error, {
        messageId: messageData?.messageId,
        channelId: messageData?.channelId,
        isCrit: messageData?.isCrit,
      });
    }
  }

  /**
   * Gets all message history entries for a specific channel
   * @param {string} channelId - The channel ID to filter by
   * @returns {Array} Array of message history entries
   */
  getChannelHistory(channelId) {
    // Get all messages for a specific channel
    return this.messageHistory.filter((entry) => entry.channelId === channelId);
  }

  /**
   * Gets all crit messages from history, optionally filtered by channel
   * Uses caching to avoid repeated filter operations
   * @param {string|null} channelId - Optional channel ID to filter by
   * @returns {Array} Array of crit message entries
   */
  getCritHistory(channelId = null) {
    // Cache crit history to avoid repeated filter operations
    const now = Date.now();
    const cacheKey = channelId || 'all';

    // Check if cache is valid
    if (
      this._cachedCritHistory &&
      this._cachedCritHistoryTimestamp &&
      now - this._cachedCritHistoryTimestamp < this._cachedCritHistoryMaxAge &&
      this._cachedCritHistory.channelId === cacheKey
    )
      return this._cachedCritHistory.data;

    // Compute crit history
    // Use for...of loop for better performance
    // FUNCTIONAL: Filter crits (.filter() instead of for-loop with nested if)
    const crits = this.messageHistory.filter(
      (entry) => entry.isCrit && (!channelId || entry.channelId === channelId)
    );

    // Cache the result
    this._cachedCritHistory = { data: crits, channelId: cacheKey };
    this._cachedCritHistoryTimestamp = now;

    return crits;
  }

  /**
   * Sets up a MutationObserver to retry restoration when new messages are added
   * @param {string} channelId - The channel ID being restored
   * @param {number} nextRetry - Next retry attempt number
   */
  setupRestorationRetryObserver(channelId, nextRetry) {
    // OPTIMIZED: Use cached container or fallback
    const messageContainer =
      this._cachedMessageContainer ||
      document.querySelector('[class*="messagesWrapper"]') ||
      document.body;
    const restoreObserver = new MutationObserver((mutations) => {
      const hasNewMessages = mutations.some(
        (m) =>
          m.type === 'childList' &&
          m.addedNodes.length > 0 &&
          Array.from(m.addedNodes).some(
            (node) =>
              node.nodeType === Node.ELEMENT_NODE &&
              node.querySelector?.('[class*="message"]') !== null
          )
      );

      if (hasNewMessages && this.currentChannelId === channelId) {
        restoreObserver.disconnect();
        this.restoreChannelCrits(channelId, nextRetry);
      }
    });

    restoreObserver.observe(messageContainer, {
      childList: true,
      subtree: true,
    });

    // Fallback: Cleanup observer after timeout if no messages load
    setTimeout(
      () => {
        restoreObserver.disconnect();
      },
      nextRetry < 2 ? 2000 : 3000
    );
  }

  /**
   * Restores crit styling for all crit messages in a channel
   * Called when switching channels or on page load
   * @param {string} channelId - The channel ID to restore crits for
   * @param {number} retryCount - Internal retry counter for failed restorations
   */
  restoreChannelCrits(channelId, retryCount = 0) {
    try {
      this.debugLog('RESTORE_CHANNEL_CRITS', 'CRITICAL: Starting restoration process', {
        channelId,
        retryCount,
        currentChannelId: this.currentChannelId,
        historySize: this.messageHistory.length,
        totalCritsInHistory: this.getCritHistory().length,
      });

      // Restore crits for this channel from history
      if (!channelId) {
        this.debugLog('RESTORE_CHANNEL_CRITS', 'ERROR: No channel ID provided for restoration');
        return;
      }

      const channelCrits = this.getCritHistory(channelId);
      if (!channelCrits.length) {
        this.debugLog(
          'RESTORE_CHANNEL_CRITS',
          'WARNING: No crits found in history for this channel',
          {
            channelId,
            totalCritsInHistory: this.getCritHistory().length,
            allChannelIds: [...new Set(this.messageHistory.map((e) => e.channelId))],
          }
        );
        return;
      }

      this.debugLog('RESTORE_CHANNEL_CRITS', 'SUCCESS: Found crits to restore from history', {
        critCount: channelCrits.length,
        attempt: retryCount + 1,
        channelId: channelId,
        sampleCritIds: channelCrits.slice(0, 5).map((e) => e.messageId),
        allCritIds: channelCrits.map((e) => e.messageId),
      });
      // Removed spammy console.log - use debugLog instead (only shows when debug mode enabled)
      this.debugLog(
        'RESTORE_CHANNEL_CRITS_START',
        `Restoring ${channelCrits.length} crits for channel ${channelId} (attempt ${
          retryCount + 1
        })`
      );

      // Create a Set of message IDs that should have crits (normalize to strings)
      const critMessageIds = new Set(
        channelCrits.map((entry) => this.normalizeId(entry.messageId)).filter(Boolean)
      );
      let restoredCount = 0;
      let skippedAlreadyStyled = 0;
      let noIdFound = 0;
      let idMismatch = 0;
      const foundIds = new Set();

      // Find all messages in DOM (uses caching)
      const uniqueMessages = this.findMessagesInDOM();

      this.debugLog('RESTORE_CHANNEL_CRITS', 'Found messages in channel', {
        messageCount: uniqueMessages.length,
        expectedCrits: channelCrits.length,
        expectedIds: Array.from(critMessageIds).slice(0, 10), // First 10 for debugging
      });

      uniqueMessages.forEach((msgElement) => {
        try {
          // Skip if already has crit styling
          if (msgElement?.classList?.contains('bd-crit-hit')) {
            skippedAlreadyStyled++;
            return;
          }

          // Try multiple methods to get message ID (don't log every extraction - too verbose)
          let msgId = this.getMessageIdentifier(msgElement);

          // If no ID found, try alternative methods
          if (!msgId) {
            // Try React fiber
            try {
              const reactKey = Object.keys(msgElement).find(
                (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
              );
              if (reactKey) {
                // FUNCTIONAL: Fiber traversal (while loop)
                let fiber = msgElement[reactKey];
                let depth = 0;
                while (fiber && depth < 20 && !msgId) {
                  msgId = fiber.memoizedProps?.message?.id || fiber.memoizedState?.message?.id;
                  msgId && (msgId = String(msgId));
                  fiber = fiber.return;
                  depth++;
                }
              }
            } catch (e) {
              // React access failed, continue
            }
          }

          if (!msgId) {
            noIdFound++;
            // Try alternative ID methods for debugging
            const altId =
              msgElement.getAttribute('data-list-item-id') ||
              msgElement.getAttribute('id') ||
              msgElement.closest('[data-list-item-id]')?.getAttribute('data-list-item-id');
            altId && !foundIds.has(String(altId)) && foundIds.add(String(altId));
            return;
          }

          foundIds.add(msgId);
          const normalizedMsgId = this.normalizeId(msgId);
          const pureMessageId = this.extractPureDiscordId(normalizedMsgId) || normalizedMsgId;

          // Match message to crit entry
          const matchedEntry = this.matchCritToMessage(
            normalizedMsgId,
            pureMessageId,
            channelCrits
          );

          if (matchedEntry?.critSettings) {
            // Restore crit using helper function
            const success = this.restoreSingleCrit(
              msgElement,
              matchedEntry,
              normalizedMsgId,
              retryCount
            );
            if (success) restoredCount++;
          } else {
            idMismatch++;
            // Only log mismatch if we have a pure Discord ID (not hash) to reduce noise
            // Hash IDs are expected to not match most of the time
            // Only log mismatches if verbose (reduces spam)
            if (
              (this.isValidDiscordId(normalizedMsgId) || this.isValidDiscordId(pureMessageId)) &&
              this.debug.verbose
            ) {
              this.debugLog('RESTORE_CHANNEL_CRITS', 'No matching entry found for message', {
                msgId: normalizedMsgId,
                pureMessageId: pureMessageId !== normalizedMsgId ? pureMessageId : undefined,
                foundMatchedEntry: !!matchedEntry,
                hasCritSettings: !!matchedEntry?.critSettings,
                expectedIdsSample: Array.from(critMessageIds).slice(0, 3),
              });
            }
          }
        } catch (error) {
          this.debugError('RESTORE_CHANNEL_CRITS', error, { phase: 'restore_single_message' });
        }
      });

      // Enhanced debugging
      const successRate =
        channelCrits.length > 0 ? ((restoredCount / channelCrits.length) * 100).toFixed(1) : 0;
      const missingCount = channelCrits.length - restoredCount;

      // Only show detailed missing IDs if there are few missing (likely a real issue)
      // If many are missing, they're probably just not visible
      const showMissingDetails = missingCount <= 5;

      this.debugLog(
        'RESTORE_CHANNEL_CRITS',
        restoredCount === channelCrits.length
          ? 'SUCCESS: Restoration completed successfully'
          : missingCount > 10
          ? 'WARNING: Restoration summary (many messages not visible - scroll to restore)'
          : 'WARNING: Restoration summary (incomplete)',
        {
          restored: restoredCount,
          total: channelCrits.length,
          successRate: `${successRate}%`,
          skippedAlreadyStyled,
          noIdFound,
          idMismatch,
          foundIdsCount: foundIds.size,
          expectedIdsCount: critMessageIds.size,
          ...(showMissingDetails && {
            sampleFoundIds: Array.from(foundIds).slice(0, 5),
            sampleExpectedIds: Array.from(critMessageIds).slice(0, 5),
            missingIds: Array.from(critMessageIds)
              .filter((id) => !foundIds.has(id))
              .slice(0, 5),
          }),
          ...(missingCount > 10 && {
            note: 'Many messages not found - likely scrolled out of view. Scroll to them to restore crits.',
          }),
        }
      );

      // If we didn't restore all crits and haven't retried too many times, try again
      // Reduced max retries to prevent excessive attempts
      // Reduced max retries from 5 to 3 to prevent excessive retry spam
      if (restoredCount < channelCrits.length && retryCount < 3) {
        const nextRetry = retryCount + 1;
        // Only log retries if verbose (reduces spam)
        this.debug.verbose &&
          this.debugLog('RESTORE_CHANNEL_CRITS', 'Not all crits restored, will retry', {
            restored: restoredCount,
            total: channelCrits.length,
            nextRetry: nextRetry,
            missingCount: channelCrits.length - restoredCount,
          });
        // Set up MutationObserver to retry when new messages are added
        this.setupRestorationRetryObserver(channelId, nextRetry);
      } else if (restoredCount < channelCrits.length && retryCount >= 3) {
        // Final warning after max retries
        // Note: Messages not currently visible in the viewport cannot be restored
        // This is expected - Discord only loads visible messages into the DOM
        this.debugLog(
          'RESTORE_CHANNEL_CRITS',
          'WARNING: Max retries reached - some crits may not be restored (messages may be outside viewport)',
          {
            restored: restoredCount,
            total: channelCrits.length,
            missingCount: channelCrits.length - restoredCount,
            retryCount,
            note: 'Messages not currently visible cannot be restored. Scroll to them to restore crits.',
          }
        );
      } else if (restoredCount > 0) {
        this.debugLog('RESTORE_CHANNEL_CRITS', 'Restoration completed', {
          restored: restoredCount,
          total: channelCrits.length,
        });
        console.log(
          `CriticalHit: Restored ${restoredCount} of ${channelCrits.length} crits for channel ${channelId}`
        );
      }

      // Removed automatic retry after delay - prevents excessive retry spam
      // Messages outside viewport will be restored when user scrolls to them (via checkForRestoration)
      // if (retryCount === 0 && restoredCount < channelCrits.length) {
      //   setTimeout(() => {
      //     if (this.currentChannelId === channelId) {
      //       this.restoreChannelCrits(channelId, 6);
      //     }
      //   }, 5000);
      // }
    } catch (error) {
      this.debugError('RESTORE_CHANNEL_CRITS', error, {
        channelId,
        retryCount,
      });
    }
  }

  /**
   * Applies gradient styles to a content element with retry logic
   * @param {HTMLElement} content - The content element to style
   * @param {HTMLElement} messageElement - The parent message element
   * @returns {boolean} True if gradient was applied successfully
   */
  applyGradientStylesWithSettings(content, messageElement) {
    const gradientColors = 'linear-gradient(to bottom, #8b5cf6 0%, #6d28d9 50%, #000000 100%)';
    const applied = this.applyGradientStyles(content, messageElement, gradientColors);

    this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Gradient applied for restoration', {
      gradient: gradientColors,
      applied,
    });

    return applied;
  }

  /**
   * Sets up a MutationObserver to retry gradient application if it fails
   * @param {HTMLElement} content - The content element
   */
  setupGradientRetryObserver(content) {
    const gradientColors = 'linear-gradient(to bottom, #8b5cf6 0%, #6d28d9 50%, #000000 100%)';
    const gradientRetryObserver = new MutationObserver((mutations) => {
      const hasStyleMutation = mutations.some(
        (m) =>
          m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')
      );

      if (hasStyleMutation) {
        const retryComputed = window.getComputedStyle(content);
        if (!retryComputed?.backgroundImage?.includes('gradient')) {
          content.style.setProperty('background-image', gradientColors, 'important');
          content.style.setProperty('background', gradientColors, 'important');
          content.style.setProperty('-webkit-background-clip', 'text', 'important');
          content.style.setProperty('background-clip', 'text', 'important');
          content.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
          content.style.setProperty('color', 'transparent', 'important');
        } else {
          gradientRetryObserver.disconnect();
        }
      }
    });

    gradientRetryObserver.observe(content, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    setTimeout(() => {
      gradientRetryObserver.disconnect();
    }, 2000);
  }

  /**
   * Applies solid color styles to a content element
   * @param {HTMLElement} content - The content element to style
   * @param {HTMLElement} messageElement - The parent message element
   * @param {string} color - The color to apply
   */
  applySolidColorStyles(content, messageElement, color) {
    this.applyStyles(content, {
      color: color,
      background: 'none',
      '-webkit-background-clip': 'unset',
      'background-clip': 'unset',
      '-webkit-text-fill-color': 'unset',
    });

    this.excludeHeaderElements(messageElement, ['color']);

    this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Solid color applied for restoration', {
      color,
    });
  }

  /**
   * Applies font styles to a content element
   * @param {HTMLElement} content - The content element to style
   */
  applyFontStyles(content) {
    content.style.setProperty('font-family', "'Nova Flat', sans-serif", 'important');
    content.style.setProperty('font-weight', 'bold', 'important');
    content.style.setProperty('font-size', '1.6em', 'important');
    content.style.setProperty('letter-spacing', '1px', 'important');
    content.style.setProperty('-webkit-text-stroke', 'none', 'important');
    content.style.setProperty('text-stroke', 'none', 'important');
    content.style.setProperty('font-synthesis', 'none', 'important');
    content.style.setProperty('font-variant', 'normal', 'important');
    content.style.setProperty('font-style', 'normal', 'important');
  }

  /**
   * Applies glow/text-shadow effect to a content element
   * @param {HTMLElement} content - The content element to style
   * @param {Object} critSettings - Crit settings object
   * @param {boolean} useGradient - Whether gradient is being used
   */
  applyGlowEffect(content, critSettings, useGradient) {
    // Use dictionary pattern for glow effect selection
    const glowEffects = {
      gradient: () =>
        content.style.setProperty(
          'text-shadow',
          '0 0 3px rgba(139, 92, 246, 0.5), 0 0 6px rgba(124, 58, 237, 0.4), 0 0 9px rgba(109, 40, 217, 0.3), 0 0 12px rgba(91, 33, 182, 0.2)',
          'important'
        ),
      solid: () => {
        const color = critSettings.color || this.settings.critColor;
        content.style.setProperty('text-shadow', `0 0 2px ${color}, 0 0 3px ${color}`, 'important');
      },
      none: () => content.style.setProperty('text-shadow', 'none', 'important'),
    };

    // Determine which effect to apply
    const shouldApplyGlow = critSettings.glow !== false && this.settings?.critGlow;
    const effectType = shouldApplyGlow ? (useGradient ? 'gradient' : 'solid') : 'none';

    (glowEffects[effectType] || glowEffects.none)();
  }

  /**
   * Sets up gradient monitoring with MutationObserver for persistence
   * @param {HTMLElement} messageElement - The message element
   * @param {HTMLElement} content - The content element
   * @param {string} messageId - The message ID
   * @param {boolean} useGradient - Whether gradient is being used
   */
  setupGradientMonitoring(messageElement, content, messageId, useGradient) {
    if (!content || !useGradient || !messageId) return;

    // Clean up existing observer
    this.styleObservers.has(messageId) && this.styleObservers.get(messageId).disconnect();

    const gradientColors = 'linear-gradient(to bottom, #8b5cf6 0%, #6d28d9 50%, #000000 100%)';
    const checkGradient = () => {
      const currentMessageElement = this.requeryMessageElement(messageId);
      if (
        !currentMessageElement ||
        !currentMessageElement.isConnected ||
        !currentMessageElement.classList.contains('bd-crit-hit')
      ) {
        return;
      }

      const currentContent = this.findMessageContentElement(currentMessageElement);
      if (currentContent) {
        const currentComputed = window.getComputedStyle(currentContent);
        const hasGradient = currentComputed?.backgroundImage?.includes('gradient');

        if (!hasGradient && useGradient) {
          currentContent.classList.add('bd-crit-text-content');
          this.applyGradientStyles(currentContent, currentMessageElement, gradientColors);
        }
      }
    };

    const parentContainer = messageElement?.parentElement || document.body;
    const styleObserver = new MutationObserver((mutations) => {
      const hasStyleMutation = mutations.some(
        (m) =>
          m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')
      );
      const hasChildMutation = mutations.some((m) => m.type === 'childList');

      if (hasStyleMutation || hasChildMutation) {
        requestAnimationFrame(() => {
          requestAnimationFrame(checkGradient);
        });
      }
    });

    styleObserver.observe(parentContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    content &&
      styleObserver.observe(content, {
        attributes: true,
        attributeFilter: ['style', 'class'],
        subtree: false,
      });

    this.styleObservers.set(messageId, styleObserver);
  }

  /**
   * Sets up gradient restoration retry observer for failed gradients
   * @param {HTMLElement} messageElement - The message element
   * @param {HTMLElement} content - The content element
   * @param {boolean} useGradient - Whether gradient is being used
   */
  setupGradientRestorationRetryObserver(messageElement, content, useGradient) {
    if (!messageElement?.isConnected || !useGradient) return;

    const retryContent = this.findMessageContentElement(messageElement);
    if (!retryContent) return;

    const gradientColors = 'linear-gradient(to bottom, #8b5cf6 0%, #6d28d9 50%, #000000 100%)';
    const checkAndRestoreGradient = () => {
      if (messageElement?.classList?.contains('bd-crit-hit') && messageElement?.isConnected) {
        const retryComputed = window.getComputedStyle(retryContent);
        if (!retryComputed?.backgroundImage?.includes('gradient')) {
          this.applyGradientStyles(retryContent, messageElement, gradientColors);
          return false;
        }
        return true;
      }
      return true;
    };

    if (!checkAndRestoreGradient()) {
      const restorationRetryObserver = new MutationObserver((mutations) => {
        const hasStyleMutation = mutations.some(
          (m) =>
            m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')
        );

        if (hasStyleMutation && checkAndRestoreGradient()) {
          restorationRetryObserver.disconnect();
        }
      });

      restorationRetryObserver.observe(retryContent, {
        attributes: true,
        attributeFilter: ['style', 'class'],
      });

      restorationRetryObserver.observe(messageElement, {
        attributes: true,
        attributeFilter: ['class'],
      });

      setTimeout(() => {
        restorationRetryObserver.disconnect();
      }, 2000);
    }
  }

  /**
   * Applies crit styling to a message element using saved crit settings
   * Handles gradient, font, animation, and glow effects with persistence monitoring
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {Object} critSettings - Saved crit settings (gradient, font, etc.)
   */
  applyCritStyleWithSettings(messageElement, critSettings) {
    try {
      const msgId = this.getMessageIdentifier(messageElement);
      this.debugLog(
        'APPLY_CRIT_STYLE_WITH_SETTINGS',
        'CRITICAL: Restoring crit style from saved settings',
        {
          messageId: msgId,
          channelId: this.currentChannelId,
          hasColor: !!critSettings.color,
          hasFont: !!critSettings.font,
          hasGlow: critSettings.glow,
          hasGradient: critSettings.gradient,
          hasAnimation: critSettings.animation,
          critSettings: critSettings,
        }
      );

      // Apply crit style with specific settings (for restoration)
      // Find message content element
      const content = this.findMessageContentElement(messageElement);
      if (!content) {
        this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'No content element found - skipping');
        return;
      }

      // Apply gradient or solid color based on current settings
      // Check if saved settings had gradient, otherwise use current setting
      const useGradient =
        critSettings.gradient !== undefined
          ? critSettings.gradient
          : this.settings.critGradient !== false;

      // Apply styles to the entire content container (sentence-level, not letter-level)
      {
        // Add a specific class to this element so CSS only targets it (not username/timestamp)
        content.classList.add('bd-crit-text-content');

        if (useGradient) {
          const hasGradientInComputed = this.applyGradientStylesWithSettings(
            content,
            messageElement
          );
          if (!hasGradientInComputed && content) {
            this.setupGradientRetryObserver(content);
          }
        } else {
          const color = critSettings.color || this.settings.critColor;
          this.applySolidColorStyles(content, messageElement, color);
        }

        // Apply font and glow styles
        this.applyFontStyles(content);
        this.applyGlowEffect(content, critSettings, useGradient);

        critSettings.animation !== false &&
          this.settings?.critAnimation &&
          (content.style.animation = 'critPulse 0.5s ease-in-out');
      }

      messageElement.classList.add('bd-crit-hit');
      this.injectCritCSS();

      // Re-get message ID for final verification (in case it wasn't available earlier)
      const finalMsgId = this.getMessageIdentifier(messageElement) || msgId;

      // Final verification of computed styles after restoration
      const finalComputedStyles = content ? window.getComputedStyle(content) : null;
      const finalHasGradient = finalComputedStyles?.backgroundImage?.includes('gradient');
      const finalHasWebkitClip =
        finalComputedStyles?.webkitBackgroundClip === 'text' ||
        finalComputedStyles?.backgroundClip === 'text';
      this.debugLog(
        'APPLY_CRIT_STYLE_WITH_SETTINGS',
        'SUCCESS: Crit style restored successfully from saved settings',
        {
          messageId: finalMsgId,
          channelId: this.currentChannelId,
          useGradient,
          elementHasClass: messageElement.classList.contains('bd-crit-hit'),
          contentHasClass: content.classList.contains('bd-crit-text-content'),
          finalHasGradient,
          finalHasWebkitClip,
          finalStyles: {
            background: content.style.background,
            webkitBackgroundClip: content.style.webkitBackgroundClip,
            webkitTextFillColor: content.style.webkitTextFillColor,
            textShadow: content.style.textShadow,
            computedBackgroundImage: finalComputedStyles?.backgroundImage,
          },
        }
      );

      // Set up gradient monitoring for persistence
      this.setupGradientMonitoring(messageElement, content, finalMsgId, useGradient);

      // If gradient still didn't apply, schedule another retry
      if (content && useGradient && !finalHasGradient) {
        this.debugLog(
          'APPLY_CRIT_STYLE_WITH_SETTINGS',
          'WARNING: Gradient still not applied after restoration, scheduling retry',
          {
            finalHasGradient,
            computedBackgroundImage: finalComputedStyles?.backgroundImage,
          }
        );
        this.setupGradientRestorationRetryObserver(messageElement, content, useGradient);
      }
    } catch (error) {
      this.debugError('APPLY_CRIT_STYLE_WITH_SETTINGS', error, {
        hasMessageElement: !!messageElement,
        hasCritSettings: !!critSettings,
      });
    }
  }

  // ============================================================================
  // CLEANUP & MEMORY MANAGEMENT
  // ============================================================================

  // ──────────────────────────────────────────────────────────────────────────────
  // History Management
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * Clean up processedMessages Set when it exceeds max size (LRU-style)
   * Removes oldest entries to prevent unbounded growth
   */
  cleanupProcessedMessages() {
    if (this.processedMessages.size <= this.maxProcessedMessages) {
      return; // No cleanup needed
    }

    const excess = this.processedMessages.size - this.maxProcessedMessages;
    const toRemove = this.processedMessagesOrder.slice(0, excess);

    this.debugLog('CLEANUP_PROCESSED', `Cleaning up ${excess} old processed messages`, {
      before: this.processedMessages.size,
      after: this.maxProcessedMessages,
    });

    toRemove.forEach((messageId) => {
      this.processedMessages.delete(messageId);
    });

    this.processedMessagesOrder = this.processedMessagesOrder.slice(excess);
  }

  /**
   * Generate content hash for matching reprocessed messages
   * @deprecated Use calculateContentHash() instead
   */
  getContentHash(author, content, timestamp) {
    return this.calculateContentHash(author, content, timestamp);
  }

  /**
   * Atomically check and add message ID to processedMessages (fixes race condition)
   * Returns true if message was added (not already present), false if already processed
   */
  markAsProcessed(messageId) {
    if (!messageId) return false;

    // Atomic check-and-add: if already present, return false immediately
    if (this.processedMessages.has(messageId)) {
      return false;
    }

    // Add to Set and track order for LRU cleanup
    this.processedMessages.add(messageId);
    this.processedMessagesOrder.push(messageId);

    // Cleanup if needed
    this.processedMessages.size > this.maxProcessedMessages && this.cleanupProcessedMessages();

    return true;
  }

  /**
   * Start periodic history cleanup (runs every 30 minutes)
   */
  startPeriodicCleanup() {
    // Clear any existing interval
    this.historyCleanupInterval && clearInterval(this.historyCleanupInterval);

    // Run cleanup every 30 minutes (1800000 ms)
    this.historyCleanupInterval = setInterval(() => {
      try {
        this.debugLog('PERIODIC_CLEANUP', 'Running periodic history cleanup');
        this.settings.autoCleanupHistory &&
          this.cleanupOldHistory(this.settings.historyRetentionDays || 30);
        // Also cleanup processedMessages
        this.cleanupProcessedMessages();
      } catch (error) {
        this.debugError('PERIODIC_CLEANUP', error);
      }
    }, 30 * 60 * 1000); // 30 minutes

    this.debugLog('PERIODIC_CLEANUP', 'Started periodic cleanup interval (30 minutes)');
  }

  cleanupOldHistory(daysToKeep = 30) {
    // Remove history entries older than specified days
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const initialLength = this.messageHistory.length;
    const initialCrits = this.messageHistory.filter((e) => e.isCrit).length;

    this.messageHistory = this.messageHistory.filter((entry) => entry.timestamp > cutoffTime);
    // Invalidate cache after history modification
    this._cachedCritHistory = null;
    const removed = initialLength - this.messageHistory.length;
    const removedCrits = initialCrits - this.getCritHistory().length;

    if (removed > 0) {
      this.debugLog('CLEANUP_HISTORY', 'Cleaned up old history entries', {
        removed,
        removedCrits,
        remaining: this.messageHistory.length,
        daysToKeep,
      });
      this.debug?.enabled &&
        console.log(
          `CriticalHit: Cleaned up ${removed} old history entries (${removedCrits} crits)`
        );
      this._throttledSaveHistory(false);
      this.updateStats(); // Recalculate stats after cleanup
    }
  }

  updateStats() {
    // Calculate stats from message history
    // Use cached getCritHistory method
    const totalCrits = this.getCritHistory().length;
    const totalMessages = this.messageHistory.length;
    const critRate = totalMessages > 0 ? (totalCrits / totalMessages) * 100 : 0;

    this.stats = {
      totalCrits,
      totalMessages,
      critRate,
      lastUpdated: Date.now(),
    };
  }

  getStats() {
    // Get current stats
    return {
      ...this.stats,
      historySize: this.messageHistory.length,
      critsInHistory: this.messageHistory.filter((e) => e.isCrit).length,
    };
  }

  // ============================================================================
  // OBSERVER & MESSAGE PROCESSING
  // ============================================================================

  // ──────────────────────────────────────────────────────────────────────────────
  // Observers & Listeners
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * Starts MutationObserver to watch for new messages in the DOM
   * Sets up channel change listeners and processes existing messages
   */
  startObserving() {
    // Stop existing observer if any
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }

    // OPTIMIZED: Find the message container with caching
    // Cache container lookup to avoid repeated DOM queries
    const findMessageContainer = () => {
      // Check cache first (invalidated on channel change)
      const now = Date.now();
      if (
        this._cachedMessageContainer &&
        this._cachedMessageContainerTimestamp &&
        now - this._cachedMessageContainerTimestamp < 5000 && // 5 second cache
        this._cachedMessageContainer.isConnected
      ) {
        return this._cachedMessageContainer;
      }

      // Try common Discord message container selectors
      const selectors = [
        '[class*="messagesWrapper"]',
        '[class*="messageContainer"]',
        '[class*="scrollerInner"]',
        '[class*="scroller"]',
        '[class*="listItem"]',
      ];

      const foundElement = selectors
        .map((selector) => document.querySelector(selector))
        .find((element) => {
          if (!element) return false;
          // Verify it's actually a message container by checking for message children
          const hasMessages = element.querySelector('[class*="message"]') !== null;
          return hasMessages || element.matches('[class*="scroller"]');
        });

      if (foundElement) {
        // Cache the result
        this._cachedMessageContainer = foundElement;
        this._cachedMessageContainerTimestamp = now;
        return foundElement;
      }

      // Last resort: find any element with messages
      const msgEl = document.querySelector('[class*="message"]');
      if (msgEl) {
        const container =
          msgEl.closest('[class*="scroller"]') || msgEl.parentElement?.parentElement;
        if (container) {
          this._cachedMessageContainer = container;
          this._cachedMessageContainerTimestamp = now;
          return container;
        }
      }
      return null;
    };

    const messageContainer = findMessageContainer();

    if (!messageContainer) {
      // Wait a bit and try again (Discord might not be fully loaded or channel changed)
      setTimeout(() => this.startObserving(), 500);
      return;
    }

    // Get current channel ID
    const channelId = this.getCurrentChannelId();
    if (channelId && channelId !== this.currentChannelId) {
      // Channel changed - save current session data before clearing
      this.currentChannelId && this._throttledSaveHistory(false); // Save any pending history entries (throttled)
      this.currentChannelId = channelId;
      // OPTIMIZED: Invalidate container cache on channel change
      this._cachedMessageContainer = null;
      this._cachedMessageContainerTimestamp = 0;
    }

    // Clear session-based tracking (but keep history storage)
    this.critMessages.clear();
    this.processedMessages.clear();
    this.processedMessagesOrder = [];

    // Mark that we're loading a channel - don't process messages yet
    this.isLoadingChannel = true;
    this.observerStartTime = Date.now();

    // Wait for channel to finish loading before processing messages
    // Try multiple times to ensure all messages are loaded
    let loadAttempts = 0;
    const maxLoadAttempts = 5;

    const tryLoadChannel = () => {
      loadAttempts++;
      this.channelLoadTime = Date.now();

      // Check if messages are actually loaded
      const messageCount = document.querySelectorAll('[class*="message"]').length;

      if (messageCount > 0 || loadAttempts >= maxLoadAttempts) {
        this.isLoadingChannel = false;
        // Removed spammy console.log - use debugLog instead (only shows when debug mode enabled)
        this.debugLog(
          'CHANNEL_LOADED',
          `Channel loaded (${messageCount} messages), ready to process new messages`
        );

        // Restore crits for this channel from history
        // Wait a bit for messages to fully load, then restore
        setTimeout(() => {
          this.restoreChannelCrits(channelId);
        }, 500);

        // Also restore after a longer delay for lazy-loaded messages
        setTimeout(() => {
          this.currentChannelId === channelId && this.restoreChannelCrits(channelId, 3);
        }, 3000);
      } else {
        // Wait a bit more and try again
        setTimeout(tryLoadChannel, 500);
      }
    };

    // Start loading check after initial delay
    setTimeout(tryLoadChannel, 1000);

    // Create mutation observer to watch for new messages
    // OPTIMIZED: Batch processing to reduce lag
    this.messageObserver = new MutationObserver((mutations) => {
      // Collect all nodes to process
      const nodesToProcess = [];
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            // Element node - add to batch
            nodesToProcess.push(node);
          }
        });
      });

      // Batch process nodes to reduce lag
      if (nodesToProcess.length > 0) {
        this.batchProcessNodes(nodesToProcess);
      }
    });

    // Start observing
    this.messageObserver.observe(messageContainer, {
      childList: true,
      subtree: true,
    });

    // Don't check existing messages - only new ones!
    // This prevents applying crits to old messages

    // Re-observe when channel changes (listen for navigation events)
    this.setupChannelChangeListener();
  }

  /**
   * Batches node processing to reduce lag from rapid DOM mutations
   * Uses requestAnimationFrame for smooth processing
   * @param {Array<Node>} nodes - Array of nodes to process
   */
  batchProcessNodes(nodes) {
    // Add nodes to pending queue
    nodes.forEach((node) => this._pendingNodes.add(node));

    // If already processing a batch, don't start another
    if (this._processingBatch) return;

    // Clear any existing timeout
    this._batchProcessingTimeout && clearTimeout(this._batchProcessingTimeout);

    // Process batch on next frame
    this._batchProcessingTimeout = setTimeout(() => {
      this._processBatch();
    }, this._batchDelayMs);
  }

  /**
   * Processes a batch of pending nodes
   * Limits batch size to prevent lag spikes
   */
  _processBatch() {
    if (this._pendingNodes.size === 0) {
      this._processingBatch = false;
      return;
    }

    this._processingBatch = true;

    // Take up to maxBatchSize nodes
    const nodesToProcess = Array.from(this._pendingNodes).slice(0, this._maxBatchSize);
    nodesToProcess.forEach((node) => this._pendingNodes.delete(node));

    // Process nodes using requestAnimationFrame for smooth execution
    requestAnimationFrame(() => {
      nodesToProcess.forEach((node) => {
        try {
          this.processNode(node);
          this.checkForRestoration(node);
        } catch (error) {
          this.debugError('BATCH_PROCESS', error, { nodeType: node?.nodeType });
        }
      });

      // Continue processing remaining nodes
      if (this._pendingNodes.size > 0) {
        this._batchProcessingTimeout = setTimeout(() => {
          this._processBatch();
        }, this._batchDelayMs);
      } else {
        this._processingBatch = false;
      }
    });
  }

  /**
   * Processes a DOM node to detect and handle new messages
   * Checks for crit status and applies styling if needed
   * @param {Node} node - DOM node to process
   */
  processNode(node) {
    try {
      // Only process nodes that were just added (not existing messages)
      // Check if this node was just added by checking if it's in the viewport
      // and wasn't there before the observer started

      // More flexible message detection
      let messageElement = null;

      // Check if node itself is a message container (not content)
      if (node.classList) {
        const classes = Array.from(node.classList);
        const hasMessageClass = classes.some((c) => c.includes('message'));
        const isNotContent = !classes.some(
          (c) =>
            c.includes('messageContent') ||
            c.includes('messageGroup') ||
            c.includes('messageText') ||
            c.includes('markup')
        );

        if (hasMessageClass && isNotContent && node.offsetParent !== null) {
          // Check if it has message-like structure
          const hasContent =
            node.querySelector('[class*="content"]') ||
            node.querySelector('[class*="text"]') ||
            (node.textContent?.trim().length ?? 0) > 0;
          hasContent && (messageElement = node);
        }
      }

      // Check for message in children if node itself isn't a message
      if (!messageElement) {
        // Look for message containers in children
        const potentialMessages = node.querySelectorAll('[class*="message"]');
        messageElement = Array.from(potentialMessages).find((msg) => {
          if (msg.classList) {
            const classes = Array.from(msg.classList);
            const isNotContent = !classes.some(
              (c) =>
                c.includes('messageContent') ||
                c.includes('messageGroup') ||
                c.includes('messageText')
            );
            return isNotContent && msg.offsetParent !== null;
          }
          return false;
        });
      }

      // Get message ID to check against processedMessages (which now uses IDs, not element references)
      const messageId = messageElement ? this.getMessageIdentifier(messageElement) : null;

      this.debugLog('PROCESS_NODE', 'processNode detected message', {
        messageId: messageId,
        alreadyProcessed: messageId ? this.processedMessages.has(messageId) : false,
        isLoadingChannel: this.isLoadingChannel,
      });

      if (messageElement && messageId && !this.processedMessages.has(messageId)) {
        // Skip if channel is still loading
        if (this.isLoadingChannel) {
          this.debugLog('PROCESS_NODE', 'Skipping - channel loading');
          return;
        }

        // Additional check: only process if message is near the bottom of the scroll
        // (new messages appear at bottom, old ones are at top)
        const container = messageElement.closest('[class*="scroller"]');
        if (container) {
          const scrollTop = container.scrollTop;
          const scrollHeight = container.scrollHeight;
          const clientHeight = container.clientHeight;
          const scrollBottom = scrollHeight - scrollTop - clientHeight;

          // Only process if we're near the bottom (within 300px) - indicates new message
          // AND channel has finished loading
          const timeSinceChannelLoad = Date.now() - this.channelLoadTime;
          if (scrollBottom < 300 && timeSinceChannelLoad > 1000) {
            // Use requestAnimationFrame for better timing (replaces setTimeout)
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                this.checkForCrit(messageElement);
              });
            });
          }
        } else {
          // If we can't determine scroll position, check timing
          const timeSinceChannelLoad = Date.now() - this.channelLoadTime;
          if (timeSinceChannelLoad > 2000) {
            // Use requestAnimationFrame for better timing (replaces setTimeout)
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                this.checkForCrit(messageElement);
              });
            });
          }
        }
      }
    } catch (error) {
      this.debugError('PROCESS_NODE', error, {
        nodeType: node?.nodeType,
        hasClassList: !!node?.classList,
      });
    }
  }

  // ============================================================================
  // MESSAGE FILTERING
  // ============================================================================

  /**
   * Determines if a message should be filtered based on settings
   * Checks for replies, system messages, bot messages, and empty messages
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message should be filtered
   */
  shouldFilterMessage(messageElement) {
    // Check if message should be filtered based on settings

    // Filter replies, system messages, bots, and empty messages
    return (
      (this.settings?.filterReplies && this.isReplyMessage(messageElement)) ||
      (this.settings?.filterSystemMessages && this.isSystemMessage(messageElement)) ||
      (this.settings?.filterBotMessages && this.isBotMessage(messageElement)) ||
      (this.settings?.filterEmptyMessages && this.isEmptyMessage(messageElement))
    );
  }

  /**
   * Checks if a message is a reply to another message
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is a reply
   */
  isReplyMessage(messageElement) {
    // Check if message is a reply to another message
    // Discord reply messages have specific classes/attributes

    // Method 1: Check for reply indicator elements
    const replySelectors = [
      '[class*="reply"]',
      '[class*="repliedMessage"]',
      '[class*="messageReference"]',
      '[class*="repliedText"]',
      '[class*="replyMessage"]',
    ];

    // FUNCTIONAL: Check for reply (.some() instead of for-loop)
    if (replySelectors.some((selector) => messageElement.querySelector(selector))) {
      return true;
    }

    // Method 2: Check for reply wrapper/container
    const hasReplyWrapper =
      messageElement.closest('[class*="reply"]') !== null ||
      messageElement.closest('[class*="repliedMessage"]') !== null;

    if (hasReplyWrapper) return true;

    // Method 3: Check class names on the message element itself
    const classes = Array.from(messageElement.classList || []);
    if (
      classes.some((c) => c.toLowerCase().includes('reply') || c.toLowerCase().includes('replied'))
    ) {
      return true;
    }

    // Method 4: Check for React props (Discord stores reply data in React)
    try {
      const reactKey = Object.keys(messageElement).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      if (reactKey) {
        // FUNCTIONAL: Fiber traversal (while loop)
        let fiber = messageElement[reactKey];
        let depth = 0;
        while (fiber && depth < 10) {
          if (
            fiber.memoizedProps?.message?.messageReference ||
            fiber.memoizedState?.message?.messageReference
          )
            return true;
          fiber = fiber.return;
          depth++;
        }
      }
    } catch (e) {
      // React access failed, continue
    }

    return false;
  }

  /**
   * Checks if a message is a system message (join, leave, etc.)
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is a system message
   */
  isSystemMessage(messageElement) {
    // Check if message is a system message (join, leave, pin, etc.)
    const systemIndicators = [
      '[class*="systemMessage"]',
      '[class*="systemText"]',
      '[class*="joinMessage"]',
      '[class*="leaveMessage"]',
      '[class*="pinnedMessage"]',
      '[class*="boostMessage"]',
    ];

    // FUNCTIONAL: Check for system message (.some() instead of for-loop)
    if (
      systemIndicators.some(
        (selector) => messageElement.querySelector(selector) || messageElement.matches(selector)
      )
    ) {
      return true;
    }

    // Check if message has system message classes
    const classes = Array.from(messageElement.classList || []);
    if (classes.some((c) => c.includes('system') || c.includes('join') || c.includes('leave'))) {
      return true;
    }

    return false;
  }

  /**
   * Checks if a message is from a bot user
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is from a bot
   */
  isBotMessage(messageElement) {
    // Check if message is from a bot
    const botIndicator =
      messageElement.querySelector('[class*="botTag"]') ||
      messageElement.querySelector('[class*="bot"]') ||
      messageElement.querySelector('[class*="botText"]');

    // Also check author/username area
    const authorElement =
      messageElement.querySelector('[class*="username"]') ||
      messageElement.querySelector('[class*="author"]');

    if (authorElement) {
      const authorClasses = Array.from(authorElement.classList || []);
      if (authorClasses.some((c) => c.includes('bot'))) {
        return true;
      }
    }

    return botIndicator !== null;
  }

  /**
   * Checks if a message is empty (only embeds/attachments, no text)
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is empty
   */
  isEmptyMessage(messageElement) {
    // Check if message has no text content (only embeds/attachments)
    const textContent = messageElement.textContent?.trim() || '';
    const hasText = textContent.length > 0;

    // Check for content elements
    const contentElement =
      messageElement.querySelector('[class*="messageContent"]') ||
      messageElement.querySelector('[class*="content"]');
    const hasContentText = contentElement?.textContent?.trim().length > 0;

    // If no text but has embeds/attachments, it's an empty message
    if (!hasText && !hasContentText) {
      const hasEmbed = messageElement.querySelector('[class*="embed"]') !== null;
      const hasAttachment = messageElement.querySelector('[class*="attachment"]') !== null;
      return hasEmbed || hasAttachment;
    }

    return false;
  }

  // ============================================================================
  // MESSAGE RESTORATION HELPERS
  // ============================================================================

  /**
   * Matches a message to a crit entry from history using multiple strategies
   * @param {string} normalizedMsgId - Normalized message ID
   * @param {string} pureMessageId - Pure Discord ID
   * @param {Array} channelCrits - Channel crit history
   * @returns {Object|null} Matched entry or null
   */
  matchCritToMessage(normalizedMsgId, pureMessageId, channelCrits) {
    if (!this.isValidDiscordId(normalizedMsgId)) return null;

    // Use dictionary pattern for matching strategies
    const matchingStrategies = {
      exact: () =>
        channelCrits.find((entry) => {
          const entryId = this.normalizeId(entry.messageId);
          if (!entryId || entryId.startsWith('hash_')) return false;
          return entryId === normalizedMsgId || entryId === pureMessageId;
        }),
      pure: () =>
        channelCrits.find((entry) => {
          const entryId = this.normalizeId(entry.messageId);
          if (!entryId || entryId.startsWith('hash_')) return false;
          const entryPureId = this.extractPureDiscordId(entryId) || entryId;
          return pureMessageId && entryPureId && entryPureId === pureMessageId;
        }),
    };

    return matchingStrategies.exact() || matchingStrategies.pure();
  }

  /**
   * Performs crit restoration on a message element
   * @param {Object} historyEntry - History entry with crit settings
   * @param {string} normalizedMsgId - Normalized message ID
   * @param {HTMLElement} messageElement - Message DOM element
   */
  performCritRestoration(historyEntry, normalizedMsgId, messageElement) {
    if (!historyEntry?.critSettings || !messageElement) return;
    this.applyCritStyleWithSettings(messageElement, historyEntry.critSettings);
    this.debugLog('PERFORM_CRIT_RESTORATION', 'Crit restored from history', {
      messageId: normalizedMsgId,
    });
  }

  /**
   * Restores a single crit message with retry logic
   * @param {HTMLElement} msgElement - Message element
   * @param {Object} matchedEntry - Matched history entry
   * @param {string} normalizedMsgId - Normalized message ID
   * @param {number} retryCount - Retry attempt number
   * @returns {boolean} True if restoration was successful
   */
  restoreSingleCrit(msgElement, matchedEntry, normalizedMsgId, retryCount) {
    if (!matchedEntry?.critSettings || !msgElement) return false;

    try {
      this.applyCritStyleWithSettings(msgElement, matchedEntry.critSettings);
      this.debugLog('RESTORE_SINGLE_CRIT', 'Crit restored successfully', {
        messageId: normalizedMsgId,
        retryCount,
      });
      return true;
    } catch (error) {
      this.debugError('RESTORE_SINGLE_CRIT', error, {
        messageId: normalizedMsgId,
        retryCount,
      });
      return false;
    }
  }

  /**
   * Finds message element in a node for restoration checking
   * @param {Node} node - DOM node to check
   * @returns {HTMLElement|null} Message element or null
   */
  findMessageElementForRestoration(node) {
    let messageElement = null;
    if (node.classList) {
      const classes = Array.from(node.classList);
      if (
        classes.some((c) => c.includes('message')) &&
        !classes.some((c) => c.includes('messageContent') || c.includes('messageGroup'))
      ) {
        messageElement = node;
      }
    }
    if (!messageElement) {
      messageElement = node.querySelector(
        '[class*="message"]:not([class*="messageContent"]):not([class*="messageGroup"])'
      );
    }
    return messageElement;
  }

  /**
   * Checks if restoration should be throttled for a message ID
   * @param {string} normalizedId - Normalized message ID
   * @returns {boolean} True if should skip (throttled)
   */
  shouldThrottleRestorationCheck(normalizedId) {
    // Guard clause: hash IDs don't need throttling
    if (normalizedId.startsWith('hash_')) return false;

    const lastCheck = this._restorationCheckThrottle.get(normalizedId);
    const now = Date.now();

    // Use logical operator for throttling check
    if (lastCheck && now - lastCheck < this._restorationCheckThrottleMs) {
      return true;
    }

    this._restorationCheckThrottle.set(normalizedId, now);

    // Clean up old throttle entries using functional approach
    this._restorationCheckThrottle.size > 500 &&
      Array.from(this._restorationCheckThrottle.entries())
        .filter(([id, checkTime]) => now - checkTime > 1000)
        .forEach(([id]) => this._restorationCheckThrottle.delete(id));

    return false;
  }

  /**
   * Calculates content hash for a message for matching
   * @deprecated Use calculateContentHash() instead
   */
  calculateContentHashForRestoration(author, messageContent, timestamp) {
    return this.calculateContentHash(author, messageContent, timestamp);
  }

  /**
   * Finds history entry for restoration by matching multiple strategies
   * @param {string} normalizedMsgId - Normalized message ID
   * @param {string} pureMessageId - Pure Discord ID
   * @param {Array} channelCrits - Channel crit history
   * @param {string} contentHash - Content hash for matching
   * @param {string} messageContent - Message content
   * @param {string} author - Author username
   * @returns {Object|null} History entry or null
   */
  findHistoryEntryForRestoration(
    normalizedMsgId,
    pureMessageId,
    channelCrits,
    contentHash,
    messageContent,
    author
  ) {
    if (!this.isValidDiscordId(normalizedMsgId)) return null;

    // Check pending queue first
    const pendingCrit =
      this.pendingCrits.get(normalizedMsgId) || this.pendingCrits.get(pureMessageId);
    if (pendingCrit?.channelId === this.currentChannelId) {
      return {
        messageId: normalizedMsgId,
        channelId: this.currentChannelId,
        isCrit: true,
        critSettings: pendingCrit.critSettings,
        messageContent: pendingCrit.messageContent,
        author: pendingCrit.author,
      };
    }

    // Try exact match
    let historyEntry = channelCrits.find((entry) => {
      const entryId = String(entry.messageId).trim();
      if (entryId.startsWith('hash_')) return false;
      return entryId === normalizedMsgId || entryId === pureMessageId;
    });

    // Try matching pure IDs
    if (!historyEntry) {
      historyEntry = channelCrits.find((entry) => {
        const entryId = String(entry.messageId).trim();
        if (entryId.startsWith('hash_')) return false;
        const entryPureId = /^\d{17,19}$/.test(entryId) ? entryId : entryId.match(/\d{17,19}/)?.[0];
        return (
          (pureMessageId && entryPureId && entryPureId === pureMessageId) ||
          normalizedMsgId.includes(entryId) ||
          entryId.includes(normalizedMsgId)
        );
      });
    }

    // Try content-based matching
    if (!historyEntry && contentHash && messageContent && author) {
      historyEntry = channelCrits.find((entry) => {
        const entryId = String(entry.messageId).trim();
        if (entryId.startsWith('hash_')) return false;
        if (entry.messageContent && entry.author) {
          const entryContent = entry.messageContent.substring(0, 100);
          const entryAuthor = entry.author;
          const entryHashContent = `${entryAuthor}:${entryContent}:${entry.timestamp || ''}`;
          const entryHash = Array.from(entryHashContent).reduce((hash, char) => {
            const charCode = char.charCodeAt(0);
            hash = (hash << 5) - hash + charCode;
            return hash & hash;
          }, 0);
          const entryContentHash = `hash_${Math.abs(entryHash)}`;
          return entryContentHash === contentHash;
        }
        return false;
      });

      historyEntry &&
        this.debugLog(
          'CHECK_FOR_RESTORATION',
          'Found match by content hash (reprocessed message)',
          {
            msgId: normalizedMsgId,
            matchedId: historyEntry.messageId,
            contentHash,
          }
        );
    }

    return historyEntry;
  }

  /**
   * Checks if a message needs crit styling restoration from history
   * Handles race conditions with pending crits queue and throttling
   * @param {Node} node - DOM node to check
   */
  checkForRestoration(node) {
    // Check if a newly added node is a message that should have a crit restored
    if (!this.currentChannelId || this.isLoadingChannel) return;

    // Find message element and throttle
    const messageElement = this.findMessageElementForRestoration(node);
    if (messageElement) {
      const msgId = this.getMessageIdentifier(messageElement);
      if (msgId && this.shouldThrottleRestorationCheck(String(msgId).trim())) {
        return;
      }
    }

    // Invalidate cache before checking to ensure we see latest history
    // This fixes race condition where restoration checks happen before crit is added
    this._cachedCritHistory = null;
    this._cachedCritHistoryTimestamp = null;

    // messageElement already found above for throttling, reuse it

    if (messageElement && !messageElement?.classList?.contains('bd-crit-hit')) {
      // Get message ID using improved extraction (only log if verbose)
      let msgId = this.getMessageIdentifier(messageElement);

      if (msgId) {
        // Check if this message should have a crit
        const channelCrits = this.getCritHistory(this.currentChannelId);
        const normalizedMsgId = String(msgId).trim();

        // Skip hash IDs (unsent/pending messages) - they shouldn't be restored
        if (normalizedMsgId.startsWith('hash_')) {
          return; // Don't restore hash IDs
        }

        // Extract pure Discord message ID if in composite format
        const pureMessageId = this.extractPureDiscordId(normalizedMsgId) || normalizedMsgId;

        // Calculate content hash for matching
        const messageContent = messageElement.textContent?.trim() || '';
        const author =
          messageElement.querySelector('[class*="username"]')?.textContent?.trim() ||
          messageElement.querySelector('[class*="author"]')?.textContent?.trim() ||
          '';
        const timestamp = messageElement.querySelector('time')?.getAttribute('datetime') || '';
        const contentHash = this.calculateContentHash(author, messageContent, timestamp);

        this.debug.verbose &&
          this.debugLog('CHECK_FOR_RESTORATION', 'Checking if message needs restoration', {
            msgId: normalizedMsgId,
            pureMessageId: pureMessageId !== normalizedMsgId ? pureMessageId : undefined,
            channelId: this.currentChannelId,
            channelCritCount: channelCrits.length,
          });

        // Find history entry using helper function
        const historyEntry = this.findHistoryEntryForRestoration(
          normalizedMsgId,
          pureMessageId,
          channelCrits,
          contentHash,
          messageContent,
          author
        );

        const isValidDiscordId = this.isValidDiscordId(normalizedMsgId);

        if (historyEntry?.critSettings) {
          this.performCritRestoration(historyEntry, normalizedMsgId, messageElement);
        } else if (!historyEntry && isValidDiscordId) {
          // Use MutationObserver instead of polling setTimeout
          // Watch for when message gets crit class (indicating crit was detected) or when element is replaced
          const checkForCrit = () => {
            // Re-query element in case Discord replaced it
            const retryElement = this.requeryMessageElement(normalizedMsgId);

            if (!retryElement || !retryElement.isConnected) return false;

            // Check pending queue first (fastest path)
            // Try multiple matching strategies:
            // 1. Direct message ID match (real ID)
            // 2. Pure message ID match (without normalization)
            // 3. Content hash match (for queued messages that got real IDs)
            let pendingCrit =
              this.pendingCrits.get(normalizedMsgId) || this.pendingCrits.get(pureMessageId);

            // If not found by ID, try content-based matching (for queued messages)
            if (!pendingCrit && retryElement) {
              const content = this.findMessageContentElement(retryElement);
              const author = this.getAuthorId(retryElement);
              content &&
                author &&
                (pendingCrit = this.pendingCrits.get(
                  this.calculateContentHash(author, content.textContent?.trim() || '')
                ));
            }

            if (pendingCrit?.channelId === this.currentChannelId) {
              // Found in pending queue!
              const pendingEntry = {
                messageId: normalizedMsgId,
                channelId: this.currentChannelId,
                isCrit: true,
                critSettings: pendingCrit.critSettings,
                messageContent: pendingCrit.messageContent,
                author: pendingCrit.author,
              };
              this.performCritRestoration(pendingEntry, normalizedMsgId, messageElement);
              return true;
            }

            // Check if element now has crit class (crit was detected)
            if (retryElement?.classList?.contains('bd-crit-hit')) {
              // Invalidate cache and check history
              this._cachedCritHistory = null;
              this._cachedCritHistoryTimestamp = null;
              const retryChannelCrits = this.getCritHistory(this.currentChannelId);

              const retryHistoryEntry = retryChannelCrits.find((entry) => {
                const entryId = this.normalizeId(entry.messageId);
                if (!entryId || entryId.startsWith('hash_')) return false;
                return entryId === normalizedMsgId || entryId === pureMessageId;
              });

              if (retryHistoryEntry?.critSettings) {
                this.performCritRestoration(retryHistoryEntry, normalizedMsgId, messageElement);
                return true;
              }
            }

            return false;
          };

          // Initial check
          if (checkForCrit()) {
            return; // Already found, no need to observe
          }

          // OPTIMIZED: Set up MutationObserver with throttling
          const parentContainer = messageElement?.parentElement || document.body;
          let lastRestorationCheck = 0;
          const restorationThrottle = 200; // Only check every 200ms

          const restorationObserver = new MutationObserver((mutations) => {
            const now = Date.now();
            // Throttle: Skip if checked recently
            if (now - lastRestorationCheck < restorationThrottle) return;
            lastRestorationCheck = now;

            const hasRelevantMutation = mutations.some((m) => {
              // Check for class changes (crit class added)
              if (m.type === 'attributes' && m.attributeName === 'class') {
                const target = m.target;
                if (
                  target.classList?.contains('bd-crit-hit') ||
                  target.querySelector?.('[class*="message"]')?.classList?.contains('bd-crit-hit')
                ) {
                  return true;
                }
              }
              // Check for child additions (element replaced)
              if (m.type === 'childList' && m.addedNodes.length) {
                return Array.from(m.addedNodes).some((node) => {
                  if (node.nodeType !== Node.ELEMENT_NODE) return false;
                  const id = this.getMessageIdentifier(node);
                  return id === normalizedMsgId || String(id).includes(normalizedMsgId);
                });
              }
              return false;
            });

            if (hasRelevantMutation) {
              // Use requestAnimationFrame to batch checks
              requestAnimationFrame(() => {
                if (checkForCrit()) {
                  restorationObserver.disconnect();
                }
              });
            }
          });

          restorationObserver.observe(parentContainer, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
          });

          // Cleanup observer after 5 seconds (max wait time)
          setTimeout(() => {
            restorationObserver.disconnect();
          }, 5000);
        }
      } else {
        // Only log non-matches if verbose (reduces spam)
        this.debug.verbose &&
          this.debugLog('CHECK_FOR_RESTORATION', 'No matching crit found in history', {
            channelId: this.currentChannelId,
          });
      }
    } else {
      this.debugLog(
        'CHECK_FOR_RESTORATION',
        'WARNING: Could not get message ID for restoration check',
        {
          channelId: this.currentChannelId,
        }
      );
    }
  }

  // ============================================================================
  // CRIT DETECTION & APPLICATION
  // ============================================================================

  /**
   * Handles queued messages with hash IDs (messages without Discord IDs yet)
   * Detects if they would be crits and adds them to pending queue
   * @param {string} messageId - The hash message ID
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message was handled (should return early)
   */
  handleQueuedMessage(messageId, messageElement) {
    if (!messageId.startsWith('hash_')) return false;

    const content = this.findMessageContentElement(messageElement);
    const author = this.getAuthorId(messageElement);
    const channelId = this.getCurrentChannelId();

    if (!content || !author || !channelId) {
      this.debugLog('CHECK_FOR_CRIT', 'Skipping hash ID (missing data)', { messageId });
      return true;
    }

    const contentText = content.textContent?.trim() || '';
    if (!contentText) {
      this.debugLog('CHECK_FOR_CRIT', 'Skipping hash ID (no content)', { messageId });
      return true;
    }

    // Use deterministic randomness based on content (same seed as real IDs will use)
    const contentHash = this.calculateContentHash(author, contentText);
    const seed = `${contentHash}:${channelId}`;
    const hash = this.simpleHash(seed);
    const critRoll = (hash % 10000) / 100;
    const critChance = this.getEffectiveCritChance();
    const wouldBeCrit = critRoll <= critChance;

    if (wouldBeCrit) {
      const critSettings = {
        gradient: this.settings.critGradient !== false,
        color: this.settings.critColor,
        font: this.settings.critFont,
        glow: this.settings.critGlow,
        animation: this.settings.animationEnabled !== false,
      };

      this.pendingCrits.set(contentHash, {
        critSettings: critSettings,
        timestamp: Date.now(),
        channelId: channelId,
        messageContent: contentText,
        author: author,
        contentHash: contentHash,
        isHashId: true,
      });

      return true; // Handled, return early
    }

    this.debugLog('CHECK_FOR_CRIT', 'Skipping hash ID (likely unsent/pending message)', {
      messageId,
      note: 'Hash IDs are created for messages without Discord IDs - crits are stored in pending queue and will be applied when real ID is assigned',
    });
    return true;
  }

  /**
   * Calculates deterministic crit roll for a message
   * @param {string} messageId - The message ID
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {number} Roll value (0-100)
   */
  calculateCritRoll(messageId, messageElement) {
    if (!messageId) return Math.random() * 100;

    // Try content-based seed first (matches queued message detection)
    const content = this.findMessageContentElement(messageElement);
    const author = this.getAuthorId(messageElement);
    const contentText = content?.textContent?.trim();

    if (content && author && contentText) {
      const contentHash = this.calculateContentHash(author, contentText);
      const seed = `${contentHash}:${this.currentChannelId}`;
      const hash = this.simpleHash(seed);
      return (hash % 10000) / 100;
    }

    // Fallback to message ID
    const hash = this.simpleHash(messageId + this.currentChannelId);
    return (hash % 10000) / 100;
  }

  /**
   * Processes a new crit detection - applies styling, saves to history, triggers animation
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {string} messageId - The message ID
   * @param {string} authorId - The author ID
   * @param {string} messageContent - The message content
   * @param {string} author - The author username
   * @param {number} roll - The crit roll value
   * @param {boolean} isValidDiscordId - Whether message has valid Discord ID
   */
  processNewCrit(
    messageElement,
    messageId,
    authorId,
    messageContent,
    author,
    roll,
    isValidDiscordId
  ) {
    this.stats.totalCrits++;
    this.updateStats();

    // Check if currently processing
    if (messageId && this._processingCrits.has(messageId)) {
      return;
    }

    messageId && this._processingCrits.add(messageId);

    const effectiveCritChance = this.getEffectiveCritChance();
    this.debugLog('CHECK_FOR_CRIT', 'CRITICAL HIT DETECTED!', {
      messageId: messageId,
      authorId: authorId,
      channelId: this.currentChannelId,
      messagePreview: messageContent.substring(0, 50),
      author: author,
      roll: roll,
      baseCritChance: this.settings.critChance,
      effectiveCritChance: effectiveCritChance,
      totalCrits: this.stats.totalCrits,
      critRate: this.stats.critRate.toFixed(2) + '%',
    });

    try {
      this.applyCritStyle(messageElement);
      this.critMessages.add(messageElement);

      // Trigger animation only for verified messages
      if (isValidDiscordId && messageId) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const currentElement = this.requeryMessageElement(messageId, messageElement);
            if (currentElement?.isConnected) {
              const contentElement = this.findMessageContentElement(currentElement);
              if (contentElement) {
                void contentElement.offsetHeight;
                const gradientCheck = this.verifyGradientApplied(contentElement);
                if (gradientCheck.hasGradient && gradientCheck.hasWebkitClip) {
                  this.onCritHit(currentElement);
                }
              }
            }
          });
        });
      }

      // Save to history using short-circuit
      messageId &&
        this.currentChannelId &&
        this.addToHistory({
          messageId: messageId,
          authorId: authorId,
          channelId: this.currentChannelId,
          timestamp: Date.now(),
          isCrit: true,
          messageContent: messageContent.substring(0, 200),
          author: author,
        });

      messageId && this._processingCrits.delete(messageId);
    } catch (error) {
      this.debugError('CHECK_FOR_CRIT', error, {
        phase: 'apply_crit',
        messageId: messageId,
      });
      messageId && this._processingCrits.delete(messageId);
    }
  }

  /**
   * Processes a non-crit message - saves to history
   * @param {string} messageId - The message ID
   * @param {string} authorId - The author ID
   * @param {string} messageContent - The message content
   * @param {string} author - The author username
   */
  processNonCrit(messageId, authorId, messageContent, author) {
    this.debugLog('CHECK_FOR_CRIT', 'Non-crit message detected', {
      messageId,
      authorId,
    });

    if (messageId && this.currentChannelId) {
      try {
        this.addToHistory({
          messageId: messageId,
          authorId: authorId,
          channelId: this.currentChannelId,
          timestamp: Date.now(),
          isCrit: false,
          messageContent: messageContent.substring(0, 200),
          author: author,
        });
      } catch (error) {
        this.debugError('CHECK_FOR_CRIT', error, { phase: 'save_non_crit_history' });
      }
    }
  }

  /**
   * Main crit detection logic: determines if a message should be a crit
   * Uses deterministic randomness based on message/channel ID for consistency
   * Applies styling and adds to history if crit is detected
   * @param {HTMLElement} messageElement - The message DOM element
   */
  checkForCrit(messageElement) {
    try {
      // Verify element is still valid FIRST
      if (!messageElement || !messageElement.offsetParent) {
        this.debugLog('CHECK_FOR_CRIT', 'Message element invalid, skipping');
        return;
      }

      // Get message identifier EARLY to use for tracking
      // Use verbose debug context to ensure we get the correct message ID
      const messageId = this.getMessageIdentifier(messageElement, {
        phase: 'check_for_crit',
        verbose: true,
      }); // Validate message ID is correct (not channel ID)
      if (messageId && (!this.isValidDiscordId(messageId) || messageId.length < 17)) {
        this.debugLog('CHECK_FOR_CRIT', 'WARNING: Invalid message ID extracted', {
          messageId,
          length: messageId?.length,
          elementId: messageElement.getAttribute('id'),
          note: 'This might be a channel ID instead of message ID',
        });
      }

      this.debugLog('CHECK_FOR_CRIT', 'Message detected for crit check', {
        messageId: messageId || 'unknown',
        hasElement: !!messageElement,
        elementValid: !!messageElement?.offsetParent,
        processedCount: this.processedMessages.size,
      });

      // Atomically check and mark as processed - return early if no ID or already processed
      if (!messageId) {
        this.debugLog('CHECK_FOR_CRIT', 'Cannot process message without valid ID');
        return;
      }

      // Define isValidDiscordId and isHashId at the top so they're available throughout the method
      const isValidDiscordId = this.isValidDiscordId(messageId);
      const isHashId = messageId.startsWith('hash_'); // Handle queued messages (hash IDs) - detect crits but don't apply styling yet
      if (isHashId && this.handleQueuedMessage(messageId, messageElement)) {
        return;
      }

      // Check history FIRST before marking as processed
      // This ensures we use the saved determination if message was already processed
      let historyEntry = null;
      if (messageId) {
        historyEntry = this.messageHistory.find(
          (e) => e.messageId === messageId && e.channelId === this.currentChannelId
        );

        // If not found in history, check pending queue by content hash
        // This handles queued messages that were detected as crits with hash IDs
        // but now have real IDs after Discord finished processing
        if (!historyEntry && isValidDiscordId) {
          const content = this.findMessageContentElement(messageElement);
          const author = this.getAuthorId(messageElement);
          const contentText = content?.textContent?.trim();
          if (content && author && contentText) {
            const contentHash = this.calculateContentHash(author, contentText);
            const pendingCrit = this.pendingCrits.get(contentHash);

            if (pendingCrit?.channelId === this.currentChannelId && pendingCrit?.isHashId) {
              // Found a queued message that was detected as crit!
              // BUT: Verify it's actually a crit using the real ID's deterministic roll
              // This prevents mismatches where queued detection was wrong
              const effectiveCritChance = this.getEffectiveCritChance();
              const seed = `${contentHash}:${this.currentChannelId}`;
              const hash = this.simpleHash(seed);
              const realRoll = (hash % 10000) / 100;
              const isActuallyCrit = realRoll <= effectiveCritChance;
              // Only use pending crit if verification confirms it's actually a crit
              if (isActuallyCrit) {
                // Create a history entry from pending crit
                historyEntry = {
                  messageId: messageId,
                  channelId: this.currentChannelId,
                  isCrit: true,
                  critSettings: pendingCrit.critSettings,
                  messageContent: pendingCrit.messageContent,
                  author: pendingCrit.author,
                };

                // Move from pending queue to history (update with real ID)
                this.pendingCrits.delete(contentHash);
                this.pendingCrits.set(messageId, {
                  ...pendingCrit,
                  isHashId: false, // Now has real ID
                });

                // Add to history immediately so it persists through reprocessing
                // This ensures the crit is saved even if Discord reprocesses the message
                const historyData = {
                  messageId: messageId,
                  channelId: this.currentChannelId,
                  isCrit: true,
                  critSettings: pendingCrit.critSettings,
                  messageContent: pendingCrit.messageContent,
                  author: pendingCrit.author,
                  timestamp: Date.now(),
                };

                // Add to history using the same method as regular crit detection
                const existingIndex = this.messageHistory.findIndex(
                  (e) => e.messageId === messageId && e.channelId === this.currentChannelId
                );

                // Use dictionary pattern for history update
                const historyHandlers = {
                  update: () => (this.messageHistory[existingIndex] = historyData),
                  add: () => this.messageHistory.push(historyData),
                };

                const handler = existingIndex >= 0 ? historyHandlers.update : historyHandlers.add;
                handler();

                // Save immediately for queued messages (they're already confirmed crits)
                this._throttledSaveHistory(false);

                // Trigger animation now that message is verified (has real Discord ID)
                // This ensures animations only trigger when messages are verified, not during queue
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    const verifiedElement = this.requeryMessageElement(messageId, messageElement);
                    if (verifiedElement?.isConnected) {
                      try {
                        this.onCritHit(verifiedElement);
                      } catch (error) {
                        this.debugError('CHECK_FOR_CRIT', error, {
                          phase: 'queued_verified_animation',
                        });
                      }
                    }
                  });
                });
              } else {
                // Queued detection was wrong - remove from pending queue
                this.pendingCrits.delete(contentHash);
                // Continue processing as non-crit (will reset combo below)
                historyEntry = null;
              }
            }
          }
        }
      }
      // If message is in history, use saved determination and skip reprocessing
      if (historyEntry) {
        // Message already processed - use saved determination
        const isCrit = historyEntry.isCrit || false;
        this.debugLog('CHECK_FOR_CRIT', 'Message already in history, using saved determination', {
          messageId,
          isCrit,
          wasProcessed: true,
        });

        if (isCrit) {
          // It's a crit - restore style with saved settings and trigger animation
          // Always restore gradient even if class is present (Discord might have removed it)
          const needsRestore =
            !messageElement.classList.contains('bd-crit-hit') ||
            !this.findMessageContentElement(messageElement)?.style?.backgroundImage?.includes(
              'gradient'
            );

          if (needsRestore) {
            // Use saved critSettings for proper gradient restoration
            // Use dictionary pattern for style application
            const styleHandlers = {
              withSettings: () =>
                this.applyCritStyleWithSettings(messageElement, historyEntry.critSettings),
              default: () => this.applyCritStyle(messageElement),
            };

            const handler = historyEntry.critSettings
              ? styleHandlers.withSettings
              : styleHandlers.default;
            handler();
            this.critMessages.add(messageElement);
          }

          // Only trigger animation if not already animated (prevent double animation)
          // Check by message ID first, then content hash with time check
          const content = this.findMessageContentElement(messageElement);
          const author = this.getAuthorId(messageElement);
          const contentText = content?.textContent?.trim();
          const contentHash = this.calculateContentHash(author, contentText);

          // Check if this message was already animated
          let alreadyAnimated = false;

          // Check by message ID first (fastest check)
          if (messageId && this.animatedMessages.has(messageId)) {
            const existingData = this.animatedMessages.get(messageId);
            const timeSinceAnimated = Date.now() - existingData.timestamp;

            // For verified messages, always allow animation (they're confirmed crits)
            // For non-verified messages, use stricter 2-second window
            if (isValidDiscordId) {
              // Verified message - always allow animation (don't set alreadyAnimated)
              // Remove old entry to allow new animation
              this.animatedMessages.delete(messageId);
            } else if (timeSinceAnimated < 2000) {
              // Non-verified message - use 2-second window
              alreadyAnimated = true;
            }
          }

          // Also check by content hash (handles element replacement scenarios)
          if (!alreadyAnimated && contentHash) {
            const matchedEntry = Array.from(this.animatedMessages.entries()).find(
              ([msgId, animData]) => {
                if (animData?.contentHash === contentHash) {
                  const timeSinceAnimated = Date.now() - animData.timestamp;

                  // For verified messages, always allow animation (they're confirmed crits)
                  // For non-verified messages, use stricter 2-second window
                  if (isValidDiscordId) {
                    // Verified message - always allow animation (remove old entry)
                    this.animatedMessages.delete(msgId); // Don't set alreadyAnimated - allow the animation
                    return true; // Found matching content hash, processed it
                  } else if (timeSinceAnimated < 2000) {
                    // Non-verified message - use 2-second window
                    // Same content animated recently - skip
                    alreadyAnimated = true;
                    return true;
                  }
                  // Content matches but enough time passed - allow retry
                }
                return false;
              }
            );
          }

          // Don't trigger animation from restoration - animations should only trigger when verified
          // If message is in history, it was already animated when first verified
          // This prevents double animations and ensures combo resets are accurate
          if (!alreadyAnimated) {
            // Only trigger animation if message is verified (has real Discord ID)
            // This ensures animations only trigger once when confirmed, not during queue phase
            if (isValidDiscordId && messageId) {
              // Trigger animation for verified crits restored from history
              try {
                this.onCritHit(messageElement);
              } catch (error) {
                this.debugError('CHECK_FOR_CRIT', error, { phase: 'restore_animation' });
              }
            } else {
            }
          }

          // Don't mark as processed again - already in history
          return;
        }
        // It's NOT a crit - ensure crit class is removed if present
        if (messageElement?.classList?.contains('bd-crit-hit')) {
          messageElement.classList.remove('bd-crit-hit');
          // Remove from critMessages if present
          this.critMessages.delete(messageElement);
        }

        // Reset combo for non-crit messages (even if in history)
        // This handles queued messages that were incorrectly detected as crits
        const authorId = this.getAuthorId(messageElement);
        if (authorId && this.isOwnMessage(messageElement, authorId)) {
          // Reset combo immediately for non-crit messages
          const userId = this.getUserId(messageElement) || authorId;
          if (this.isValidDiscordId(userId)) {
            this.updateUserCombo(userId, 0, 0);
          }
        }

        // Don't mark as processed again - already in history
        return;
      }

      // Message not in history - check if already processed (to prevent duplicate processing)
      if (!this.markAsProcessed(messageId)) {
        this.debugLog('CHECK_FOR_CRIT', 'Message already processed (by ID)', { messageId });
        return;
      }

      // Guard clauses: early returns for invalid states
      if (this.isLoadingChannel) {
        this.debugLog('CHECK_FOR_CRIT', 'Channel still loading, skipping');
        return;
      }

      if (this.shouldFilterMessage(messageElement)) {
        // Already marked as processed by markAsProcessed above
        this.debugLog('CHECK_FOR_CRIT', 'Message filtered out', { messageId });
        return;
      }

      // Verify it's actually a message (has some text content)
      const hasText =
        messageElement.textContent?.trim().length > 0 ||
        messageElement.querySelector('[class*="content"]')?.textContent?.trim().length > 0 ||
        messageElement.querySelector('[class*="text"]')?.textContent?.trim().length > 0;

      if (!hasText) {
        // Already marked as processed by markAsProcessed above
        this.debugLog('CHECK_FOR_CRIT', 'Message has no text content', { messageId });
        return; // Not a real message
      }

      // Calculate crit roll using helper function
      const effectiveCritChance = this.getEffectiveCritChance();
      const roll = this.calculateCritRoll(messageId, messageElement);

      this.debugLog('CHECK_FOR_CRIT', 'Checking for crit', {
        messageId,
        roll: roll.toFixed(2),
        baseCritChance: this.settings.critChance,
        effectiveCritChance,
        isCrit: roll <= effectiveCritChance,
        deterministic: !!messageId,
      });

      // Get message info
      const messageContent = messageElement.textContent?.trim() || '';
      const author =
        messageElement.querySelector('[class*="username"]')?.textContent?.trim() ||
        messageElement.querySelector('[class*="author"]')?.textContent?.trim() ||
        '';

      // Extract author ID (user ID) from message element
      const authorId = this.getAuthorId(messageElement);

      // Update stats
      this.stats.totalMessages++;

      const isCrit = roll <= effectiveCritChance;

      // Already marked as processed by markAsProcessed above (atomic check-and-add)

      if (isCrit) {
        // Process new crit using helper function
        this.processNewCrit(
          messageElement,
          messageId,
          authorId,
          messageContent,
          author,
          roll,
          isValidDiscordId
        );
      } else {
        // Process non-crit using helper function
        this.processNonCrit(messageId, authorId, messageContent, author);
      }
    } catch (error) {
      this.debugError('CHECK_FOR_CRIT', error, {
        hasMessageElement: !!messageElement,
        elementValid: !!messageElement?.offsetParent,
      });
    }
  }

  // ============================================================================
  // CRIT STYLING
  // ============================================================================

  /**
   * Applies crit styling (gradient, font, animation) to a message element
   * Finds the message content element and applies styles with persistence monitoring
   * @param {HTMLElement} messageElement - The message DOM element
   */
  /**
   * Checks if an element is in the header/username/timestamp area
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if element is in header area
   */
  isInHeaderArea(element) {
    if (!element) return true;

    // Check element's own classes first
    const classes = Array.from(element.classList || []);
    const hasHeaderClass = classes.some(
      (c) =>
        c.includes('header') ||
        c.includes('username') ||
        c.includes('timestamp') ||
        c.includes('author') ||
        c.includes('topSection') ||
        c.includes('messageHeader') ||
        c.includes('messageGroup')
    );

    if (hasHeaderClass) {
      this.debug?.enabled &&
        this.debugLog('APPLY_CRIT_STYLE', 'Element has header class', {
          elementTag: element.tagName,
          classes: classes,
        });
      return true;
    }

    // Check if element contains username/timestamp elements as children
    const hasUsernameChild = element.querySelector('[class*="username"]') !== null;
    const hasTimestampChild = element.querySelector('[class*="timestamp"]') !== null;
    const hasAuthorChild = element.querySelector('[class*="author"]') !== null;

    if (hasUsernameChild || hasTimestampChild || hasAuthorChild) {
      this.debug?.enabled &&
        this.debugLog('APPLY_CRIT_STYLE', 'Element contains username/timestamp/author child', {
          elementTag: element.tagName,
          hasUsernameChild,
          hasTimestampChild,
          hasAuthorChild,
          classes: classes,
        });
      return true;
    }

    // Check parent chain
    const headerParent =
      element.closest('[class*="header"]') ||
      element.closest('[class*="username"]') ||
      element.closest('[class*="timestamp"]') ||
      element.closest('[class*="author"]') ||
      element.closest('[class*="topSection"]') ||
      element.closest('[class*="messageHeader"]') ||
      element.closest('[class*="messageGroup"]') ||
      element.closest('[class*="messageGroupWrapper"]');

    if (headerParent) {
      this.debug?.enabled &&
        this.debugLog('APPLY_CRIT_STYLE', 'Element is in header area', {
          elementTag: element.tagName,
          headerParentClasses: Array.from(headerParent.classList || []),
          headerParentTag: headerParent.tagName,
        });
      return true;
    }

    // Check if element's text content looks like a username or timestamp
    const text = element.textContent?.trim() || '';
    if (text.match(/^\d{1,2}:\d{2}$/) || text.length < 3) {
      this.debug?.enabled &&
        this.debugLog('APPLY_CRIT_STYLE', 'Element text looks like timestamp/username', {
          elementTag: element.tagName,
          text: text,
        });
      return true;
    }

    return false;
  }

  /**
   * Finds the message content element for styling, avoiding header areas
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {HTMLElement|null} The content element or null if not found
   */
  findMessageContentForStyling(messageElement) {
    // Find message content - simplified selection with fewer fallbacks
    let content = null;

    // Find message content using .find() instead of for-loop
    const allMessageContents = Array.from(
      messageElement.querySelectorAll('[class*="messageContent"]')
    );
    content = allMessageContents.find((msgContent) => !this.isInHeaderArea(msgContent));

    content &&
      this.debugLog('APPLY_CRIT_STYLE', 'Found messageContent (not in header)', {
        elementTag: content.tagName,
        classes: Array.from(content.classList || []),
        textPreview: content.textContent?.substring(0, 50),
      });

    // Fallback to markup if messageContent not found
    if (!content) {
      const markup = messageElement.querySelector('[class*="markup"]');
      if (markup && !this.isInHeaderArea(markup)) {
        content = markup;
        this.debugLog('APPLY_CRIT_STYLE', 'Found markup', {
          elementTag: content.tagName,
          classes: Array.from(content.classList || []),
        });
      }
    }

    // Last fallback: textContainer
    if (!content) {
      const textContainer = messageElement.querySelector('[class*="textContainer"]');
      if (textContainer && !this.isInHeaderArea(textContainer)) {
        content = textContainer;
        this.debugLog('APPLY_CRIT_STYLE', 'Found textContainer', {
          elementTag: content.tagName,
          classes: Array.from(content.classList || []),
        });
      }
    }

    if (!content) {
      this.debugLog('APPLY_CRIT_STYLE', 'Could not find content element - skipping');
      return null;
    }

    // Final check: make sure content doesn't have username/timestamp as siblings
    const parent = content.parentElement;
    if (parent) {
      const hasUsernameInParent =
        parent.querySelector('[class*="username"]') !== null ||
        parent.querySelector('[class*="timestamp"]') !== null ||
        parent.querySelector('[class*="author"]') !== null;

      const siblings = Array.from(parent.children);
      const hasUsernameSibling = siblings.some((sib) => {
        const classes = Array.from(sib.classList || []);
        return classes.some(
          (c) => c.includes('username') || c.includes('timestamp') || c.includes('author')
        );
      });

      if (hasUsernameInParent || hasUsernameSibling) {
        // Find more specific text elements within content
        const allTextElements = content.querySelectorAll('span, div, p');
        let foundTextElement = null;

        foundTextElement = Array.from(allTextElements).reduce((best, textEl) => {
          if (!textEl.textContent || textEl.textContent.trim().length === 0) return best;
          if (this.isInHeaderArea(textEl)) return best;
          if (
            textEl.querySelector('[class*="username"]') ||
            textEl.querySelector('[class*="timestamp"]')
          ) {
            return best;
          }
          if (textEl.textContent.trim().match(/^\d{1,2}:\d{2}$/)) return best;

          if (
            !best ||
            (textEl.tagName === 'SPAN' && best.tagName !== 'SPAN') ||
            (textEl.children.length === 0 && best.children.length > 0)
          ) {
            return textEl;
          }
          return best;
        }, foundTextElement);

        if (foundTextElement) {
          content = foundTextElement;
        } else {
          const markupElement = content.querySelector('[class*="markup"]');
          if (markupElement && !this.isInHeaderArea(markupElement)) {
            content = markupElement;
          }
        }
      }
    }

    return content;
  }

  /**
   * Applies gradient styles to content element (used in applyCritStyle)
   * @param {HTMLElement} content - The content element
   * @param {HTMLElement} messageElement - The parent message element
   */
  applyGradientToContentForStyling(content, messageElement) {
    const gradientColors =
      'linear-gradient(to right, #8b5cf6 0%, #7c3aed 15%, #6d28d9 30%, #4c1d95 45%, #312e81 60%, #1e1b4b 75%, #0f0f23 85%, #000000 95%, #000000 100%)';

    content.classList.add('bd-crit-text-content');
    this.applyGradientStyles(content, messageElement, gradientColors);
  }

  /**
   * Applies solid color styles to content element (used in applyCritStyle)
   * @param {HTMLElement} content - The content element
   * @param {HTMLElement} messageElement - The parent message element
   */
  applySolidColorToContentForStyling(content, messageElement) {
    content.classList.add('bd-crit-text-content');
    content.style.setProperty('color', this.settings.critColor, 'important');
    content.style.setProperty('background', 'none', 'important');
    content.style.setProperty('-webkit-background-clip', 'unset', 'important');
    content.style.setProperty('background-clip', 'unset', 'important');
    content.style.setProperty('-webkit-text-fill-color', 'unset', 'important');

    this.excludeHeaderElements(messageElement, ['color']);
  }

  /**
   * Applies glow effect to content element (used in applyCritStyle)
   * @param {HTMLElement} content - The content element
   * @param {boolean} useGradient - Whether gradient is being used
   */
  applyGlowToContentForStyling(content, useGradient) {
    if (this.settings.critGlow) {
      if (useGradient) {
        content.style.setProperty(
          'text-shadow',
          '0 0 3px rgba(139, 92, 246, 0.5), 0 0 6px rgba(124, 58, 237, 0.4), 0 0 9px rgba(109, 40, 217, 0.3), 0 0 12px rgba(91, 33, 182, 0.2)',
          'important'
        );
      } else {
        content.style.setProperty(
          'text-shadow',
          `0 0 2px ${this.settings.critColor}, 0 0 3px ${this.settings.critColor}`,
          'important'
        );
      }
    } else {
      content.style.setProperty('text-shadow', 'none', 'important');
    }
  }

  applyCritStyle(messageElement) {
    try {
      this.debugLog('APPLY_CRIT_STYLE', 'Applying crit style to message');

      this.debugLog('APPLY_CRIT_STYLE', 'Finding message content element', {
        messageElementClasses: Array.from(messageElement.classList || []),
      });

      // Find message content using helper function
      const content = this.findMessageContentForStyling(messageElement);
      if (!content) {
        return;
      }

      // Apply critical hit styling to the entire message content container
      try {
        this.debugLog('APPLY_CRIT_STYLE', 'Applying crit style', {
          useGradient: this.settings.critGradient !== false,
          critColor: this.settings.critColor,
        });

        // Apply styles to the entire content container (sentence-level, not letter-level)
        {
          // Apply gradient or solid color
          const useGradient = this.settings.critGradient !== false;
          if (useGradient) {
            this.applyGradientToContentForStyling(content, messageElement);
          } else {
            this.applySolidColorToContentForStyling(content, messageElement);
          }

          // Apply font and glow styles
          this.applyFontStyles(content);
          this.applyGlowToContentForStyling(content, useGradient);

          // Add animation if enabled
          this.settings?.critAnimation && (content.style.animation = 'critPulse 0.5s ease-in-out');
        }

        // Add a class for easier identification
        messageElement.classList.add('bd-crit-hit');

        // Verify gradient was actually applied and get computed styles
        const useGradient = this.settings.critGradient !== false;
        const gradientCheck = this.verifyGradientApplied(content);
        const hasGradientInStyle = gradientCheck.hasGradientInStyle;
        const hasGradientInComputed = gradientCheck.hasGradient;
        const hasWebkitClip = gradientCheck.hasWebkitClip;
        const computedStyles = content ? window.getComputedStyle(content) : null; // If gradient didn't apply correctly, retry with MutationObserver to catch DOM changes
        if (content && useGradient && !hasGradientInComputed) {
          this.debugLog('APPLY_CRIT_STYLE', 'WARNING: Gradient not applied correctly, will retry', {
            hasGradientInStyle,
            hasGradientInComputed,
            computedBackgroundImage: computedStyles?.backgroundImage,
          });

          // Retry after a short delay to catch DOM updates
          setTimeout(() => {
            if (content && messageElement?.classList?.contains('bd-crit-hit')) {
              const retryComputed = window.getComputedStyle(content);
              const retryHasGradient = retryComputed?.backgroundImage?.includes('gradient');

              if (!retryHasGradient && useGradient) {
                // Force reapply gradient
                const gradientColors =
                  'linear-gradient(to right, #8b5cf6 0%, #7c3aed 15%, #6d28d9 30%, #4c1d95 45%, #312e81 60%, #1e1b4b 75%, #0f0f23 85%, #000000 95%, #000000 100%)';
                this.applyGradientStyles(content, messageElement, gradientColors);
              }
            }
          }, 100);
        }

        // Add CSS animation if not already added
        this.injectCritCSS();

        this.debugLog('APPLY_CRIT_STYLE', 'Crit style applied successfully', {
          useGradient: this.settings.critGradient !== false,
          elementTag: content?.tagName,
        });
      } catch (error) {
        this.debugError('APPLY_CRIT_STYLE', error, { phase: 'apply_styles' });
      }
    } catch (error) {
      this.debugError('APPLY_CRIT_STYLE', error, {
        hasMessageElement: !!messageElement,
      });
    }
  }

  // ============================================================================
  // CSS INJECTION
  // ============================================================================

  /**
   * Injects CSS styles for crit messages (gradient, animation, glow)
   * Pre-loads Nova Flat font and sets up MutationObserver for font enforcement
   */
  injectCritCSS() {
    // Early return if CSS injection is disabled
    // CSS injection is controlled independently from animation runtime
    if (this.settings?.cssEnabled !== true) return;

    // Check if CSS is already injected
    if (document.getElementById('bd-crit-hit-styles')) return;

    // Pre-load Nova Flat font
    if (!document.getElementById('bd-crit-hit-nova-flat-font')) {
      const fontLink = document.createElement('link');
      fontLink.id = 'bd-crit-hit-nova-flat-font';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Nova+Flat&display=swap';
      document.head.appendChild(fontLink);
    }

    // Force Nova Flat on all existing crit hit messages
    // Event-based font enforcement - replaced periodic setInterval with MutationObserver
    const applyNovaFlatFont = (element) => {
      // Apply to message itself
      element.style.setProperty('font-family', "'Nova Flat', sans-serif", 'important');

      // Find all possible content elements
      const contentSelectors = [
        '[class*="messageContent"]',
        '[class*="markup"]',
        '[class*="textContainer"]',
        '[class*="content"]',
        '[class*="text"]',
        'span',
        'div',
        'p',
      ];

      contentSelectors.forEach((selector) => {
        const elements = element.querySelectorAll(selector);
        elements.forEach((el) => {
          // Skip username/timestamp elements
          if (
            !el.closest('[class*="username"]') &&
            !el.closest('[class*="timestamp"]') &&
            !el.closest('[class*="author"]') &&
            !el.closest('[class*="header"]')
          ) {
            el.style.setProperty('font-family', "'Nova Flat', sans-serif", 'important');
          }
        });
      });
    };

    // Apply to existing crit messages immediately
    const existingCritMessages = document.querySelectorAll('.bd-crit-hit');
    existingCritMessages.forEach((msg) => applyNovaFlatFont(msg));

    // Use MutationObserver to watch for new crit messages and font changes
    // OPTIMIZED: Throttle font checks to reduce CPU usage
    if (!this.novaFlatObserver) {
      let lastFontCheckTime = 0;
      const fontCheckThrottle = 200; // Only check fonts every 200ms

      this.novaFlatObserver = new MutationObserver((mutations) => {
        const now = Date.now();
        // Throttle: Skip if checked recently
        if (now - lastFontCheckTime < fontCheckThrottle) return;
        lastFontCheckTime = now;

        // Batch process mutations
        const nodesToCheck = new Set();
        mutations.forEach((mutation) => {
          // Handle new nodes added
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Check if the added node is a crit message
                if (node.classList?.contains('bd-crit-hit')) {
                  nodesToCheck.add(node);
                }
                // Check for crit messages within the added node
                const critMessages = node.querySelectorAll?.('.bd-crit-hit');
                critMessages?.forEach((msg) => nodesToCheck.add(msg));
              }
            });
          }
          // Handle attribute changes (font-family changes)
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const target = mutation.target;
            // Check if this is a crit message or within one
            const critMessage = target.closest?.('.bd-crit-hit');
            if (critMessage) {
              nodesToCheck.add(critMessage);
            }
          }
        });

        // Apply fonts in batch using requestAnimationFrame
        if (nodesToCheck.size > 0) {
          requestAnimationFrame(() => {
            nodesToCheck.forEach((node) => {
              if (node.isConnected) {
                // Only check font if node is actually a crit message
                if (node.classList?.contains('bd-crit-hit')) {
                  const computedStyle = window.getComputedStyle(node);
                  const fontFamily = computedStyle.fontFamily;
                  if (!fontFamily?.includes('Nova Flat')) {
                    applyNovaFlatFont(node);
                  }
                }
              }
            });
          });
        }
      });

      // Observe the entire document for new crit messages and font changes
      this.novaFlatObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }

    const style = document.createElement('style');
    style.id = 'bd-crit-hit-styles';
    style.textContent = `
            /* Import Nova Flat font for critical hits - gradient text font */
            @import url('https://fonts.googleapis.com/css2?family=Nova+Flat&display=swap');

            @keyframes critShake {
              0%, 100% { transform: translateX(0); }
              10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
              20%, 40%, 60%, 80% { transform: translateX(2px); }
            }

            @keyframes critPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
            }

            .bd-crit-hit {
                position: relative;
            }

            /* Apply Nova Flat font to ALL elements within crit hit messages */
            .bd-crit-hit,
            .bd-crit-hit *,
            .bd-crit-hit [class*='messageContent'],
            .bd-crit-hit [class*='markup'],
            .bd-crit-hit [class*='textContainer'],
            .bd-crit-hit [class*='content'],
            .bd-crit-hit [class*='text'],
            .bd-crit-hit span,
            .bd-crit-hit div,
            .bd-crit-hit p {
                font-family: 'Nova Flat', sans-serif !important;
            }

            /* Critical Hit Gradient - ONLY apply to specific text content, NOT username/timestamp */
            /* Purple to black gradient - matches inline styles applied by plugin */
            /* FIXED: CSS fallback ensures gradient persists even if Discord removes inline styles */
            .bd-crit-hit .bd-crit-text-content {
                background-image: linear-gradient(to bottom, #8b5cf6 0%, #6d28d9 50%, #000000 100%) !important;
                background: linear-gradient(to bottom, #8b5cf6 0%, #6d28d9 50%, #000000 100%) !important;
                -webkit-background-clip: text !important;
                background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                color: transparent !important;
                display: inline-block !important; /* Required for background-clip to work */
            }

            /* Explicitly exclude username/timestamp from gradient */
            .bd-crit-hit [class*='username'],
            .bd-crit-hit [class*='timestamp'],
            .bd-crit-hit [class*='author'],
            .bd-crit-hit [class*='header'] {
                background: unset !important;
                background-image: unset !important;
                -webkit-background-clip: unset !important;
                background-clip: unset !important;
                -webkit-text-fill-color: unset !important;
                color: unset !important;
            }

            /* Critical Hit Glow & Font - ONLY apply to specific text content, NOT username/timestamp */
            .bd-crit-hit .bd-crit-text-content {
                text-shadow: 0 0 5px rgba(139, 92, 246, 0.8),
                             0 0 10px rgba(124, 58, 237, 0.7),
                             0 0 15px rgba(109, 40, 217, 0.6),
                             0 0 20px rgba(91, 33, 182, 0.5) !important;
                font-family: 'Nova Flat', sans-serif !important; /* Nova Flat - gradient text font */
                font-weight: bold !important; /* Bold for more impact */
                font-size: 1.6em !important; /* Larger for more impact */
                font-synthesis: none !important; /* Prevent font synthesis */
                font-variant: normal !important; /* Override any font variants */
                font-style: normal !important; /* Override italic/oblique */
                letter-spacing: 1px !important; /* Slight spacing */
                -webkit-text-stroke: none !important; /* Remove stroke for cleaner gradient */
                text-stroke: none !important;
                display: inline-block !important; /* Ensure gradient works */
            }

            /* Apply Nova Flat font to all text within crit hit messages */
            .bd-crit-hit .bd-crit-text-content,
            .bd-crit-hit [class*='messageContent'],
            .bd-crit-hit [class*='markup'],
            .bd-crit-hit [class*='textContainer'] {
                font-family: 'Nova Flat', sans-serif !important;
            }

            /* Override font on all child elements to ensure consistency - use Nova Flat directly */
            .bd-crit-hit .bd-crit-text-content *,
            .bd-crit-hit * {
                font-family: 'Nova Flat', sans-serif !important;
                font-weight: inherit !important;
                font-size: inherit !important;
                font-stretch: inherit !important;
                font-synthesis: none !important;
                font-variant: normal !important;
                font-style: normal !important;
                letter-spacing: inherit !important;
                text-transform: inherit !important;
                -webkit-text-stroke: inherit !important;
                text-stroke: inherit !important;
            }

            /* Explicitly reset glow/text effects on username/timestamp - but keep Nova Flat font */
            .bd-crit-hit [class*='username'],
            .bd-crit-hit [class*='timestamp'],
            .bd-crit-hit [class*='author'],
            .bd-crit-hit [class*='header'] {
                text-shadow: unset !important;
                font-family: 'Nova Flat', sans-serif !important; /* Still use Nova Flat */
                font-weight: unset !important;
                font-size: unset !important;
                font-stretch: unset !important;
                font-synthesis: unset !important;
                font-variant: unset !important;
                font-style: unset !important;
                letter-spacing: unset !important;
                text-transform: unset !important;
                -webkit-text-stroke: unset !important;
                text-stroke: unset !important;
            }

            .bd-crit-hit::before {
                content: "⚡";
                position: absolute;
                left: -20px;
                color: #ff0000;
                font-size: 1.2em;
                animation: critPulse 1s infinite;
            }
        `;

    document.head.appendChild(style);
  }

  /**
   * Injects CSS styles for the settings panel UI
   */
  injectSettingsCSS() {
    // Check if settings CSS is already injected
    if (document.getElementById('bd-crit-hit-settings-styles')) return;

    const style = document.createElement('style');
    style.id = 'bd-crit-hit-settings-styles';
    style.textContent = `
            .bd-crit-hit-settings {
                padding: 0;
                color: var(--text-normal);
            }

            .crit-settings-header {
                padding: 20px 24px;
                background: linear-gradient(135deg, rgba(255, 0, 0, 0.1) 0%, rgba(255, 100, 0, 0.05) 100%);
                border-bottom: 2px solid rgba(255, 0, 0, 0.2);
                margin-bottom: 24px;
            }

            .crit-settings-title {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 8px;
            }

            .crit-settings-title h3 {
                margin: 0;
                font-size: 20px;
                font-weight: 600;
                color: var(--text-normal);
                font-family: 'Nova Flat', sans-serif !important;
            }

            .crit-settings-subtitle {
                color: var(--text-muted);
                font-size: 13px;
                margin-left: 36px;
            }

            .crit-settings-content {
                padding: 0 24px 24px;
            }

            .crit-form-group {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .crit-form-item {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .crit-label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                font-size: 14px;
                color: var(--text-normal);
                margin-bottom: 4px;
            }

            .crit-label-value {
                margin-left: auto;
                color: var(--text-brand);
                font-weight: 700;
                font-size: 16px;
            }

            .crit-input-wrapper {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .crit-slider {
                flex: 1;
                height: 6px;
                border-radius: 3px;
                background: var(--background-modifier-accent);
                outline: none;
                -webkit-appearance: none;
                cursor: pointer;
            }

            .crit-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: var(--text-brand);
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                transition: all 0.2s ease;
            }

            .crit-slider::-webkit-slider-thumb:hover {
                transform: scale(1.1);
                box-shadow: 0 0 8px var(--text-brand);
            }

            .crit-slider::-moz-range-thumb {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: var(--text-brand);
                cursor: pointer;
                border: none;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }

            .crit-number-input {
                width: 70px;
                padding: 8px 12px;
                background: var(--input-background);
                border: 1px solid var(--input-border);
                border-radius: 4px;
                color: var(--text-normal);
                font-size: 14px;
                text-align: center;
                transition: all 0.2s ease;
            }

            .crit-number-input:focus {
                outline: none;
                border-color: var(--text-brand);
                box-shadow: 0 0 0 2px rgba(255, 0, 0, 0.1);
            }

            .crit-color-wrapper {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .crit-color-picker {
                width: 50px;
                height: 40px;
                border: 2px solid var(--input-border);
                border-radius: 6px;
                cursor: pointer;
                overflow: hidden;
                -webkit-appearance: none;
                padding: 0;
            }

            .crit-color-picker::-webkit-color-swatch-wrapper {
                padding: 0;
            }

            .crit-color-picker::-webkit-color-swatch {
                border: none;
                border-radius: 4px;
            }

            .crit-color-preview {
                flex: 1;
                height: 40px;
                border-radius: 6px;
                border: 2px solid var(--input-border);
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
            }

            .crit-text-input {
                width: 100%;
                padding: 10px 14px;
                background: var(--input-background);
                border: 1px solid var(--input-border);
                border-radius: 6px;
                color: var(--text-normal);
                font-size: 14px;
                font-family: 'Nova Flat', sans-serif !important;
                transition: all 0.2s ease;
            }

            .crit-text-input:focus {
                outline: none;
                border-color: var(--text-brand);
                box-shadow: 0 0 0 2px rgba(255, 0, 0, 0.1);
            }

            .crit-checkbox-group {
                margin-top: 4px;
            }

            .crit-checkbox-label {
                display: flex;
                align-items: center;
                gap: 12px;
                cursor: pointer;
                padding: 12px;
                border-radius: 6px;
                background: var(--background-modifier-hover);
                transition: all 0.2s ease;
            }

            .crit-checkbox-label:hover {
                background: var(--background-modifier-active);
            }

            .crit-checkbox {
                display: none;
            }

            .crit-checkbox-custom {
                width: 20px;
                height: 20px;
                border: 2px solid var(--input-border);
                border-radius: 4px;
                background: var(--input-background);
                position: relative;
                transition: all 0.2s ease;
                flex-shrink: 0;
            }

            .crit-checkbox:checked + .crit-checkbox-custom {
                background: var(--text-brand);
                border-color: var(--text-brand);
            }

            .crit-checkbox:checked + .crit-checkbox-custom::after {
                content: "✓";
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: white;
                font-size: 14px;
                font-weight: bold;
            }

            .crit-checkbox-text {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                font-weight: 500;
                color: var(--text-normal);
            }

            .crit-form-description {
                font-size: 12px;
                color: var(--text-muted);
                margin-top: 4px;
                line-height: 1.4;
            }

            .crit-actions {
                margin-top: 24px;
                padding-top: 24px;
                border-top: 1px solid var(--background-modifier-accent);
            }

            .crit-test-btn {
                width: 100%;
                padding: 14px 20px;
                background: linear-gradient(135deg, #ff0000 0%, #ff4444 100%);
                border: none;
                border-radius: 8px;
                color: white;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 2px 8px rgba(255, 0, 0, 0.3);
            }

            .crit-test-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(255, 0, 0, 0.4);
            }

            .crit-test-btn:active {
                transform: translateY(0);
            }
        `;

    document.head.appendChild(style);
  }

  // ============================================================================
  // VISUAL EFFECTS
  // ============================================================================

  // ──────────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * Called when a crit is detected - triggers visual effects
   * CriticalHitAnimation plugin hooks into this method for animations
   * Verifies gradient is applied before triggering animation for robust synchronization
   * @param {HTMLElement} messageElement - The message DOM element
   */
  onCritHit(messageElement) {
    if (!messageElement || !messageElement.isConnected) {
      this.debugLog('ON_CRIT_HIT', 'Message element invalid, skipping animation trigger');
      return;
    }

    const messageId = this.getMessageIdentifier(messageElement);
    if (!messageId) {
      this.debugLog('ON_CRIT_HIT', 'Cannot process without message ID');
      return;
    }

    // Early deduplication: Check if already animated or currently processing
    // For verified messages, always allow (remove old entry if exists)
    // For non-verified messages, use deduplication to prevent spam
    const isValidDiscordId = messageId ? /^\d{17,19}$/.test(messageId) : false;

    if (this.animatedMessages.has(messageId)) {
      if (isValidDiscordId) {
        // Verified message - always allow animation (remove old entry)
        this.animatedMessages.delete(messageId); // Continue processing - don't return
      } else {
        // Non-verified message - use deduplication        return;
      }
    }

    // Throttle: Prevent rapid duplicate calls during spam
    // BUT: For verified messages, skip throttling entirely (they're confirmed crits)
    // For non-verified messages, use throttle to prevent spam
    const now = Date.now();
    if (!isValidDiscordId) {
      const lastCallTime = this._onCritHitThrottle.get(messageId);

      if (lastCallTime && now - lastCallTime < this._onCritHitThrottleMs) {
        return;
      }
      this._onCritHitThrottle.set(messageId, now);
    }
    // Verified messages skip throttling - they're confirmed crits and should always animate

    // Cleanup old throttle entries (older than 5 seconds) to prevent memory leaks
    if (this._onCritHitThrottle.size > 1000) {
      const cutoffTime = now - 5000; // 5 seconds
      Array.from(this._onCritHitThrottle.entries())
        .filter(([msgId, callTime]) => callTime < cutoffTime)
        .forEach(([msgId]) => this._onCritHitThrottle.delete(msgId));
    }

    // Check if currently processing animation for this message
    if (this._processingAnimations.has(messageId)) {
      return;
    }

    // Mark as processing animation
    this._processingAnimations.add(messageId);

    // OPTIMIZED: Use MutationObserver with throttling instead of polling setTimeout
    // Verify gradient is applied before triggering animation
    let lastVerificationTime = 0;
    const verificationThrottle = 50; // Only verify every 50ms

    const verifyGradientAndTrigger = () => {
      const now = Date.now();
      // Throttle verification checks
      if (now - lastVerificationTime < verificationThrottle) return false;
      lastVerificationTime = now;

      // Re-get messageId in case element was replaced
      const currentMessageId = this.getMessageIdentifier(messageElement) || messageId;
      if (!messageId) {
        this.debugLog('ON_CRIT_HIT', 'Cannot verify gradient without message ID');
        return false;
      }

      // Re-query element in case it was replaced
      const currentElement = this.requeryMessageElement(messageId, messageElement);

      if (!currentElement || !currentElement.isConnected) {
        return false; // Element not ready
      }

      // Check if crit class is present
      const hasCritClass = currentElement.classList?.contains('bd-crit-hit');
      if (!hasCritClass) {
        return false; // Crit class not present yet
      }

      // Verify gradient is applied to content element
      const contentElement = this.findMessageContentElement(currentElement);
      if (!contentElement) {
        return false; // Content element not found
      }

      const gradientCheck = this.verifyGradientApplied(contentElement);
      return gradientCheck.hasGradient && gradientCheck.hasWebkitClip; // Ready if both are present
    };

    // Initial check
    if (!verifyGradientAndTrigger()) {
      // Set up MutationObserver to watch for element connection, crit class, and gradient
      const parentContainer = messageElement?.parentElement || document.body;
      const gradientVerificationObserver = new MutationObserver((mutations) => {
        const hasRelevantMutation = mutations.some((m) => {
          // Check for class changes (crit class added)
          if (m.type === 'attributes' && m.attributeName === 'class') {
            const target = m.target;
            if (
              target.classList?.contains('bd-crit-hit') ||
              target.querySelector?.('[class*="message"]')?.classList?.contains('bd-crit-hit')
            ) {
              return true;
            }
          }
          // Check for style changes (gradient applied)
          if (m.type === 'attributes' && m.attributeName === 'style') return true;
          // Check for child additions (element replaced)
          if (m.type === 'childList' && m.addedNodes.length) {
            return Array.from(m.addedNodes).some((node) => {
              if (node.nodeType !== Node.ELEMENT_NODE) return false;
              const id = this.getMessageIdentifier(node);
              return id === messageId || String(id).includes(messageId);
            });
          }
          return false;
        });

        if (hasRelevantMutation) {
          // Use requestAnimationFrame to batch checks
          requestAnimationFrame(() => {
            if (verifyGradientAndTrigger()) {
              gradientVerificationObserver.disconnect();
              // Gradient verified, proceed to trigger animation
              proceedWithAnimation();
            }
          });
        }
      });

      gradientVerificationObserver.observe(parentContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });

      // Also observe content element directly if available
      const contentElement = this.findMessageContentElement(messageElement);
      contentElement &&
        gradientVerificationObserver.observe(contentElement, {
          attributes: true,
          attributeFilter: ['style', 'class'],
        });

      // Cleanup observer after 2 seconds (max wait time)
      setTimeout(() => {
        gradientVerificationObserver.disconnect();
        // If still not ready after timeout, trigger anyway
        proceedWithAnimation();
      }, 2000);

      return; // Wait for MutationObserver
    }

    // Define proceedWithAnimation function
    const proceedWithAnimation = () => {
      // Gradient verified (or max attempts reached), trigger animation
      // Use double RAF to ensure DOM is stable
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Re-query element one more time before triggering
          const finalElement = this.requeryMessageElement(messageId, messageElement);

          if (
            finalElement &&
            finalElement.isConnected &&
            finalElement.classList?.contains('bd-crit-hit')
          ) {
            // Particle burst effect (optional)
            try {
              this.createParticleBurst(finalElement);
            } catch (error) {
              this.debugError('ON_CRIT_HIT', error, { phase: 'particle_burst' });
            }

            // Double-check: Ensure not already animated (race condition protection)
            const finalMessageId = this.getMessageIdentifier(finalElement) || messageId;
            if (this.animatedMessages.has(finalMessageId)) {
              this._processingAnimations.delete(finalMessageId);
              return;
            }

            // Direct call to animation handler (replaces hook-based approach)
            if (
              this.settings.animationEnabled !== false &&
              typeof this.handleCriticalHit === 'function'
            ) {
              try {
                this.handleCriticalHit(finalElement);
              } catch (error) {
                this.debugError('ON_CRIT_HIT', error, { phase: 'animation_handler' });
                // Remove processing lock on error
                this._processingAnimations.delete(finalMessageId);
              }
            } else {
              // Remove processing lock if animation disabled or handler missing
              this._processingAnimations.delete(finalMessageId);
            }
          } else {
            // Element not valid, remove processing lock
            this._processingAnimations.delete(messageId);
          }
        });
      });
    };

    // Gradient already verified, proceed immediately
    proceedWithAnimation();
  }

  /**
   * Creates a particle burst effect at the message location
   * @param {HTMLElement} messageElement - The message DOM element
   */
  createParticleBurst(messageElement) {
    try {
      this.debugLog('CREATE_PARTICLE_BURST', 'Starting particle burst creation', {
        hasMessageElement: !!messageElement,
        messageId: messageElement?.getAttribute?.('data-message-id') || 'unknown',
      });

      const rect = messageElement.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      this.debugLog('CREATE_PARTICLE_BURST', 'Message element bounds calculated', {
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        centerX,
        centerY,
      });

      // Create particle container
      const particleContainer = document.createElement('div');
      particleContainer.style.position = 'fixed';
      particleContainer.style.left = `${centerX}px`;
      particleContainer.style.top = `${centerY}px`;
      particleContainer.style.width = '0';
      particleContainer.style.height = '0';
      particleContainer.style.pointerEvents = 'none';
      particleContainer.style.zIndex = '9999';
      particleContainer.className = 'bd-crit-particle-burst';

      this.debugLog('CREATE_PARTICLE_BURST', 'Particle container created', {
        className: particleContainer.className,
        position: particleContainer.style.position,
        zIndex: particleContainer.style.zIndex,
      });

      document.body.appendChild(particleContainer);
      this.debugLog('CREATE_PARTICLE_BURST', 'Particle container appended to body');

      // Create 15 particles
      const particleCount = 15;
      const colors = [
        'rgba(138, 43, 226, 0.9)', // Blue Violet
        'rgba(139, 92, 246, 0.9)', // Violet
        'rgba(167, 139, 250, 0.9)', // Light Purple
        'rgba(196, 181, 253, 0.9)', // Lavender
        'rgba(255, 255, 255, 0.9)', // White
      ];

      let particlesCreated = 0;
      let particlesAnimated = 0;

      Array.from({ length: particleCount }, (_, i) => i).forEach((i) => {
        try {
          const particle = document.createElement('div');
          const angle = (Math.PI * 2 * i) / particleCount;
          const distance = 50 + Math.random() * 30;
          const duration = 0.6 + Math.random() * 0.4;
          const color = colors[Math.floor(Math.random() * colors.length)];

          particle.style.position = 'absolute';
          particle.style.width = '4px';
          particle.style.height = '4px';
          particle.style.borderRadius = '50%';
          particle.style.background = color;
          particle.style.boxShadow = `0 0 6px ${color}, 0 0 12px ${color}`;
          particle.style.left = '0';
          particle.style.top = '0';
          particle.style.opacity = '1';

          // Animate particle
          const endX = Math.cos(angle) * distance;
          const endY = Math.sin(angle) * distance;

          const animation = particle.animate(
            [
              {
                transform: `translate(0, 0) scale(1)`,
                opacity: 1,
              },
              {
                transform: `translate(${endX}px, ${endY}px) scale(0)`,
                opacity: 0,
              },
            ],
            {
              duration: duration * 1000,
              easing: 'ease-out',
              fill: 'forwards',
            }
          );

          animation.addEventListener('finish', () => {
            particlesAnimated++;
            this.debugLog('CREATE_PARTICLE_BURST', `Particle ${i} animation finished`, {
              particlesAnimated,
              totalParticles: particleCount,
            });
          });

          particleContainer.appendChild(particle);
          particlesCreated++;
        } catch (error) {
          this.debugError('CREATE_PARTICLE_BURST', error, {
            phase: 'create_particle',
            particleIndex: i,
          });
        }
      });

      this.debugLog('CREATE_PARTICLE_BURST', 'All particles created', {
        particlesCreated,
        expectedCount: particleCount,
      });

      // Remove container after animation
      setTimeout(() => {
        try {
          particleContainer.parentNode &&
            particleContainer.parentNode.removeChild(particleContainer);
        } catch (error) {
          this.debugError('CREATE_PARTICLE_BURST', error, { phase: 'cleanup' });
        }
      }, 1200);

      this.debugLog('CREATE_PARTICLE_BURST', 'Particle burst created', {
        particleCount,
        centerX,
        centerY,
      });
    } catch (error) {
      this.debugError('CREATE_PARTICLE_BURST', error);
    }
  }

  /**
   * Removes all crit styling from all messages (for testing/debugging)
   */
  removeAllCrits() {
    // Remove all crit styling
    const critMessages = document.querySelectorAll('.bd-crit-hit');
    critMessages.forEach((msg) => {
      const content =
        msg.querySelector('.bd-crit-text-content') ||
        msg.querySelector('[class*="messageContent"]') ||
        msg.querySelector('[class*="content"]') ||
        msg;
      if (content) {
        content.classList.remove('bd-crit-text-content');
        content.style.color = '';
        content.style.fontFamily = '';
        content.style.fontWeight = '';
        content.style.textShadow = '';
        content.style.animation = '';
        content.style.background = '';
        content.style.backgroundImage = '';
        content.style.webkitBackgroundClip = '';
        content.style.backgroundClip = '';
        content.style.webkitTextFillColor = '';
        content.style.display = '';
      }
      msg.classList.remove('bd-crit-hit');
    });

    this.critMessages.clear();

    // Remove injected CSS
    const style = document.getElementById('bd-crit-hit-styles');
    style && style.remove();

    // Clean up Nova Flat interval (legacy, should not be used but safety check)
    if (this._forceNovaInterval) {
      clearInterval(this._forceNovaInterval);
      this._forceNovaInterval = null;
    }

    // Clean up display update interval
    if (this._displayUpdateInterval) {
      clearInterval(this._displayUpdateInterval);
      this._displayUpdateInterval = null;
    }
  }

  // ============================================================================
  // SETTINGS PANEL UI
  // ============================================================================

  /**
   * Creates and returns the settings panel UI element
   * Includes controls for crit chance, styling, filters, and stats display
   * @returns {HTMLElement} Settings panel DOM element
   */
  getSettingsPanel() {
    // Store reference to plugin instance for callbacks
    const plugin = this;

    // Update stats before showing panel
    this.updateStats();

    // HTML escape helper to prevent XSS
    const escapeHTML = (str) => {
      if (str == null) return '';
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    };

    // Inject settings panel CSS
    this.injectSettingsCSS();

    // Create container
    const container = document.createElement('div');
    container.className = 'bd-crit-hit-settings';
    container.innerHTML = `
            <div class="crit-settings-header">
                <div class="crit-settings-title">
                    <h3>Critical Hit Settings</h3>
                </div>
                <div class="crit-settings-subtitle">Customize your critical hit experience</div>
                <div class="crit-stats-display" style="margin-top: 16px; padding: 12px; background: rgba(138, 43, 226, 0.1); border-radius: 8px; border: 1px solid rgba(138, 43, 226, 0.2);">
                    <div style="display: flex; gap: 24px; font-size: 13px;">
                        <div>
                            <span style="opacity: 0.7;">Total Crits:</span>
                            <strong style="color: #ba55d3; margin-left: 8px;">${
                              this.stats.totalCrits
                            }</strong>
                        </div>
                        <div>
                            <span style="opacity: 0.7;">Crit Rate:</span>
                            <strong style="color: #ba55d3; margin-left: 8px;">${this.stats.critRate.toFixed(
                              2
                            )}%</strong>
                        </div>
                        <div>
                            <span style="opacity: 0.7;">History:</span>
                            <strong style="color: #ba55d3; margin-left: 8px;">${
                              this.messageHistory.length
                            } messages</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div class="crit-settings-content">
                <div class="crit-form-group">
                    <div class="crit-form-item">
                        <label class="crit-label">
                            Critical Hit Chance
                            <span class="crit-label-value">${this.settings.critChance}%</span>
                            ${(() => {
                              const effectiveCrit = this.getEffectiveCritChance();
                              const totalBonus = effectiveCrit - this.settings.critChance;

                              // Get individual bonuses for display
                              let agilityBonus = 0;
                              let luckBonus = 0;
                              try {
                                agilityBonus =
                                  (BdApi.Data.load('SoloLevelingStats', 'agilityBonus')?.bonus ??
                                    0) * 100;
                                luckBonus =
                                  (BdApi.Data.load('SoloLevelingStats', 'luckBonus')?.bonus ?? 0) *
                                  100;
                              } catch (e) {}

                              if (totalBonus > 0) {
                                const bonuses = [];
                                if (agilityBonus > 0)
                                  bonuses.push(`+${agilityBonus.toFixed(1)}% AGI`);
                                if (luckBonus > 0) bonuses.push(`+${luckBonus.toFixed(1)}% LUK`);
                                return `<span class="crit-agility-bonus" style="color: #8b5cf6; font-size: 0.9em; margin-left: 8px;">${bonuses.join(
                                  ' + '
                                )} = ${effectiveCrit.toFixed(1)}%</span>`;
                              }
                              return `<span class="crit-agility-bonus" style="color: #666; font-size: 0.9em; margin-left: 8px;">(Effective: ${effectiveCrit.toFixed(
                                1
                              )}%, max 30%)</span>`;
                            })()}
                        </label>
                        <div class="crit-form-description" style="margin-top: 8px;">
                            Base crit chance is 10% by default. Increase Agility/Luck stats to boost crit chance (capped at 30% to prevent spam).
                        </div>
                    </div>

                    <div class="crit-form-item">
                        <label class="crit-label">
                            Critical Hit Color
                        </label>
                        <div class="crit-color-wrapper">
                            <input
                                type="color"
                                id="crit-color"
                                value="${escapeHTML(this.settings.critColor)}"
                                class="crit-color-picker"
                            />
                            <div class="crit-color-preview" style="background-color: ${escapeHTML(
                              this.settings.critColor
                            )}"></div>
                        </div>
                        <div class="crit-form-description">
                            Choose the color for critical hit messages
                        </div>
                    </div>

                    <div class="crit-form-item">
                        <label class="crit-label">
                            Critical Hit Font
                        </label>
                        <input
                            type="text"
                            id="crit-font"
                            value="${escapeHTML(this.settings.critFont)}"
                            placeholder="'Press Start 2P', monospace"
                            class="crit-text-input"
                        />
                        <div class="crit-form-description">
                            Font family for critical hit messages (Solo Leveling-style futuristic font)
                        </div>
                    </div>

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="crit-animation"
                                ${this.settings.critAnimation ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Enable Animation
                            </span>
                        </label>
                    </div>

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="crit-gradient"
                                ${this.settings.critGradient !== false ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Enable Gradient (Purple-Black)
                            </span>
                        </label>
                        <div class="crit-form-description">
                            Use a purple-to-black gradient instead of solid color
                        </div>
                    </div>

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="crit-glow"
                                ${this.settings.critGlow ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Enable Glow Effect
                            </span>
                        </label>
                    </div>
                </div>

                <div class="crit-form-group" style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--background-modifier-accent);">
                    <div class="crit-settings-title" style="margin-bottom: 16px;">
                        <h3 style="font-size: 16px; margin: 0;">Message Filters</h3>
                    </div>
                    <div class="crit-form-description" style="margin-bottom: 16px;">
                        Choose which message types should be excluded from critical hits
                    </div>

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="filter-replies"
                                ${this.settings.filterReplies ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Filter Reply Messages
                            </span>
                        </label>
                        <div class="crit-form-description">
                            Don't apply crits to messages that are replies to other messages
                        </div>
                    </div>

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="filter-system"
                                ${this.settings.filterSystemMessages ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Filter System Messages
                            </span>
                        </label>
                        <div class="crit-form-description">
                            Don't apply crits to system messages (joins, leaves, pins, etc.)
                        </div>
                    </div>

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="filter-bots"
                                ${this.settings.filterBotMessages ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Filter Bot Messages
                            </span>
                        </label>
                        <div class="crit-form-description">
                            Don't apply crits to messages from bots
                        </div>
                    </div>

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="filter-empty"
                                ${this.settings.filterEmptyMessages ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Filter Empty Messages
                            </span>
                        </label>
                        <div class="crit-form-description">
                            Don't apply crits to messages with only embeds/attachments (no text)
                        </div>
                    </div>
                </div>

                <div class="crit-form-group" style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--background-modifier-accent);">
                    <div class="crit-settings-title" style="margin-bottom: 16px;">
                        <h3 style="font-size: 16px; margin: 0;">History & Storage</h3>
                    </div>

                    <div class="crit-form-item">
                        <label class="crit-label">
                            History Retention (Days)
                            <span class="crit-label-value">${
                              this.settings.historyRetentionDays || 30
                            }</span>
                        </label>
                        <div class="crit-input-wrapper">
                            <input
                                type="range"
                                id="history-retention-slider"
                                min="1"
                                max="90"
                                value="${this.settings.historyRetentionDays || 30}"
                                class="crit-slider"
                            />
                            <input
                                type="number"
                                id="history-retention"
                                min="1"
                                max="90"
                                value="${this.settings.historyRetentionDays || 30}"
                                class="crit-number-input"
                            />
                        </div>
                        <div class="crit-form-description">
                            How long to keep message history (older entries are automatically cleaned up)
                        </div>
                    </div>

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="auto-cleanup-history"
                                ${this.settings.autoCleanupHistory !== false ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Auto-Cleanup Old History
                            </span>
                        </label>
                        <div class="crit-form-description">
                            Automatically remove history entries older than retention period
                        </div>
                    </div>
                </div>

                <div class="crit-form-group" style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--background-modifier-accent);">
                    <div class="crit-settings-title" style="margin-bottom: 16px;">
                        <h3 style="font-size: 16px; margin: 0;">Animation Settings</h3>
                    </div>
                    <div class="crit-form-description" style="margin-bottom: 16px;">
                        Customize the "CRITICAL HIT!" floating animation
                    </div>

                    <div class="crit-form-item">
                        <label class="crit-label">
                            Animation Duration
                            <span class="crit-label-value">${(
                              this.settings.animationDuration / 1000
                            ).toFixed(1)}s</span>
                        </label>
                        <div class="crit-input-wrapper">
                            <input
                                type="range"
                                id="animation-duration-slider"
                                min="1000"
                                max="10000"
                                step="500"
                                value="${this.settings.animationDuration}"
                                class="crit-slider"
                            />
                            <input
                                type="number"
                                id="animation-duration"
                                min="1000"
                                max="10000"
                                step="500"
                                value="${this.settings.animationDuration}"
                                class="crit-number-input"
                            />
                        </div>
                        <div class="crit-form-description">
                            How long the animation stays visible (1-10 seconds)
                        </div>
                    </div>

                    <div class="crit-form-item">
                        <label class="crit-label">
                            Float Distance
                            <span class="crit-label-value">${this.settings.floatDistance}px</span>
                        </label>
                        <div class="crit-input-wrapper">
                            <input
                                type="range"
                                id="float-distance-slider"
                                min="50"
                                max="300"
                                step="10"
                                value="${this.settings.floatDistance}"
                                class="crit-slider"
                            />
                            <input
                                type="number"
                                id="float-distance"
                                min="50"
                                max="300"
                                step="10"
                                value="${this.settings.floatDistance}"
                                class="crit-number-input"
                            />
                        </div>
                        <div class="crit-form-description">
                            How far the animation floats upward
                        </div>
                    </div>

                    <div class="crit-form-item">
                        <label class="crit-label">
                            Animation Font Size
                            <span class="crit-label-value">${this.settings.fontSize}px</span>
                        </label>
                        <div class="crit-input-wrapper">
                            <input
                                type="range"
                                id="animation-fontsize-slider"
                                min="24"
                                max="72"
                                step="2"
                                value="${this.settings.fontSize}"
                                class="crit-slider"
                            />
                            <input
                                type="number"
                                id="animation-fontsize"
                                min="24"
                                max="72"
                                step="2"
                                value="${this.settings.fontSize}"
                                class="crit-number-input"
                            />
                        </div>
                        <div class="crit-form-description">
                            Size of the animation text
                        </div>
                    </div>

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="screen-shake"
                                ${this.settings.screenShake ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Enable Screen Shake
                            </span>
                        </label>
                        <div class="crit-form-description">
                            Shake the screen when a critical hit occurs
                        </div>
                    </div>

                    <div class="crit-form-item">
                        <label class="crit-label">
                            Shake Intensity
                            <span class="crit-label-value">${this.settings.shakeIntensity}px</span>
                        </label>
                        <div class="crit-input-wrapper">
                            <input
                                type="range"
                                id="shake-intensity-slider"
                                min="1"
                                max="10"
                                step="1"
                                value="${this.settings.shakeIntensity}"
                                class="crit-slider"
                            />
                            <input
                                type="number"
                                id="shake-intensity"
                                min="1"
                                max="10"
                                step="1"
                                value="${this.settings.shakeIntensity}"
                                class="crit-number-input"
                            />
                        </div>
                        <div class="crit-form-description">
                            Intensity of the screen shake effect
                        </div>
                    </div>

                    <div class="crit-form-item">
                        <label class="crit-label">
                            Shake Duration
                            <span class="crit-label-value">${this.settings.shakeDuration}ms</span>
                        </label>
                        <div class="crit-input-wrapper">
                            <input
                                type="range"
                                id="shake-duration-slider"
                                min="100"
                                max="500"
                                step="50"
                                value="${this.settings.shakeDuration}"
                                class="crit-slider"
                            />
                            <input
                                type="number"
                                id="shake-duration"
                                min="100"
                                max="500"
                                step="50"
                                value="${this.settings.shakeDuration}"
                                class="crit-number-input"
                            />
                        </div>
                        <div class="crit-form-description">
                            How long the screen shake lasts
                        </div>
                    </div>

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="show-combo"
                                ${this.settings.showCombo ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Show Combo Counter
                            </span>
                        </label>
                        <div class="crit-form-description">
                            Display combo count in the animation (e.g., "CRITICAL HIT! x5")
                        </div>
                    </div>

                    <div class="crit-form-item">
                        <label class="crit-label">
                            Max Combo Display
                            <span class="crit-label-value">${this.settings.maxCombo}</span>
                        </label>
                        <div class="crit-input-wrapper">
                            <input
                                type="range"
                                id="max-combo-slider"
                                min="10"
                                max="999"
                                step="10"
                                value="${this.settings.maxCombo}"
                                class="crit-slider"
                            />
                            <input
                                type="number"
                                id="max-combo"
                                min="10"
                                max="999"
                                step="10"
                                value="${this.settings.maxCombo}"
                                class="crit-number-input"
                            />
                        </div>
                        <div class="crit-form-description">
                            Maximum combo count to display
                        </div>
                    </div>
                </div>

                <div class="crit-form-group" style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--background-modifier-accent);">
                    <div class="crit-settings-title" style="margin-bottom: 16px;">
                        <h3 style="font-size: 16px; margin: 0;">Debug & Troubleshooting</h3>
                    </div>

                    <div class="crit-form-item crit-checkbox-group" style="background: ${
                      this.settings.debugMode
                        ? 'rgba(255, 165, 0, 0.1)'
                        : 'var(--background-modifier-hover)'
                    }; border: 1px solid ${
      this.settings.debugMode ? 'rgba(255, 165, 0, 0.3)' : 'transparent'
    };">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="debug-mode"
                                ${this.settings.debugMode ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text" style="font-weight: ${
                              this.settings.debugMode ? '600' : '500'
                            }; color: ${
      this.settings.debugMode ? 'var(--text-brand)' : 'var(--text-normal)'
    };">
                                Enable Debug Mode
                            </span>
                        </label>
                        <div class="crit-form-description" style="margin-top: 8px; padding-left: 30px;">
                            Show detailed debug logs in console (useful for troubleshooting).
                            <strong style="color: ${
                              this.settings.debugMode ? 'var(--text-brand)' : 'var(--text-muted)'
                            };">
                                ${
                                  this.settings.debugMode
                                    ? 'WARNING: Currently enabled - check console for logs'
                                    : 'Currently disabled - no console spam'
                                }
                            </strong>
                        </div>
                    </div>
                </div>

                <div class="crit-actions">
                    <button id="test-crit-btn" class="crit-test-btn">
                        Test Critical Hit
                    </button>
                </div>
            </div>
        `;

    // Set up display update observer
    this.setupSettingsDisplayObserver(container);

    // Attach all event listeners using helper methods
    this.attachBasicSettingsListeners(container);
    this.attachFilterListeners(container);
    this.attachHistoryListeners(container);
    this.attachAnimationListeners(container);
    this.attachDebugListeners(container);

    return container;
  }

  // ============================================================================
  // SETTINGS UPDATE METHODS
  // ============================================================================

  // Get effective crit chance (base + agility bonus + luck buffs, capped at 30%)
  // Simple hash function for deterministic random number generation
  simpleHash(str) {
    const hash = Array.from(str).reduce((hash, char) => {
      const charCode = char.charCodeAt(0);
      hash = (hash << 5) - hash + charCode;
      return hash & hash; // Convert to 32bit integer
    }, 0);
    return Math.abs(hash);
  }

  getEffectiveCritChance() {
    let baseChance = this.settings.critChance || 6;

    // Get agility bonus from SoloLevelingStats
    try {
      const agilityData = BdApi.Data.load('SoloLevelingStats', 'agilityBonus');
      const agilityBonusPercent = (agilityData?.bonus ?? 0) * 100;
      if (agilityBonusPercent > 0) {
        baseChance += agilityBonusPercent;
      }
    } catch (error) {
      // If SoloLevelingStats isn't available, just use base chance
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load agility bonus', { error: error.message });
    }

    // Get Luck buffs from SoloLevelingStats (stacked random buffs)
    try {
      const luckData = BdApi.Data.load('SoloLevelingStats', 'luckBonus');
      const luckBonusPercent = (luckData?.bonus ?? 0) * 100;
      if (luckBonusPercent > 0) {
        baseChance += luckBonusPercent;

        this.debugLog('GET_EFFECTIVE_CRIT', 'Luck buffs applied to crit chance', {
          luckBonusPercent: luckBonusPercent.toFixed(1),
          luckBuffs: luckData?.luckBuffs ?? [],
          luckStat: luckData?.luck ?? 0,
        });
      }
    } catch (error) {
      // If SoloLevelingStats isn't available, just use base chance
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load luck bonus', { error: error.message });
    }

    // Get skill tree crit bonus
    try {
      const skillBonuses = BdApi.Data.load('SkillTree', 'bonuses');
      if (skillBonuses?.critBonus > 0) {
        // Skill tree crit bonus is stored as decimal (e.g., 0.05 for 5%)
        const skillCritBonusPercent = skillBonuses.critBonus * 100;
        baseChance += skillCritBonusPercent;

        this.debugLog('GET_EFFECTIVE_CRIT', 'Skill tree crit bonus applied', {
          skillCritBonusPercent: skillCritBonusPercent.toFixed(1),
        });
      }
    } catch (error) {
      // SkillTree not available
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load skill tree bonuses', {
        error: error.message,
      });
    }

    // Cap at 30% maximum to prevent spam in group chats
    return Math.min(30, Math.max(0, baseChance));
  }

  updateCritChance(value) {
    // Cap base crit chance at 30% (effective chance is also capped at 30% to prevent spam)
    this.settings.critChance = Math.max(0, Math.min(30, parseFloat(value) || 0));
    this.saveSettings();
    // Update label value in settings panel if it exists
    const labelValue = document.querySelector('.crit-label-value');
    if (labelValue) {
      labelValue.textContent = `${this.settings.critChance}%`;
    }
    const effectiveCrit = this.getEffectiveCritChance();
    try {
      if (BdApi?.showToast) {
        const totalBonus = effectiveCrit - this.settings.critChance;

        // Get individual bonuses for toast
        let agilityBonus = 0;
        let luckBonus = 0;
        try {
          agilityBonus = (BdApi.Data.load('SoloLevelingStats', 'agilityBonus')?.bonus ?? 0) * 100;
          luckBonus = (BdApi.Data.load('SoloLevelingStats', 'luckBonus')?.bonus ?? 0) * 100;
        } catch (e) {}

        let toastMessage = `Crit chance set to ${this.settings.critChance}%`;
        if (totalBonus > 0) {
          const bonuses = [];
          if (agilityBonus > 0) bonuses.push(`+${agilityBonus.toFixed(1)}% AGI`);
          if (luckBonus > 0) bonuses.push(`+${luckBonus.toFixed(1)}% LUK`);
          toastMessage = `Crit: ${this.settings.critChance}% base (${bonuses.join(
            ' + '
          )}) = ${effectiveCrit.toFixed(1)}%`;
        }

        BdApi.showToast(toastMessage, {
          type: 'info',
          timeout: 2000,
        });
      }
    } catch (error) {
      this.debug?.enabled && console.log('CriticalHit: Toast failed', error);
    }
  }

  updateCritColor(value) {
    this.settings.critColor = value;
    this.saveSettings();
    // Update existing crits
    this.updateExistingCrits();
  }

  updateCritFont(value) {
    this.settings.critFont = value;
    this.saveSettings();
    // Update existing crits
    this.updateExistingCrits();
  }

  updateCritAnimation(value) {
    this.settings.critAnimation = value;
    this.saveSettings();
    this.updateExistingCrits();
  }

  updateCritGradient(value) {
    this.settings.critGradient = value;
    this.saveSettings();
    this.updateExistingCrits();
  }

  updateCritGlow(value) {
    this.settings.critGlow = value;
    this.saveSettings();
    this.updateExistingCrits();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Crit Styling & Application
  // ──────────────────────────────────────────────────────────────────────────────

  updateExistingCrits() {
    const critMessages = document.querySelectorAll('.bd-crit-hit');
    this.debugLog('UPDATE_EXISTING_CRITS', 'Updating existing crits', {
      critCount: critMessages.length,
    });

    critMessages.forEach((msg) => {
      // Find ONLY the message text content container - exclude username, timestamp, etc.
      // Apply gradient to the entire message text container as one unit

      this.debugLog('UPDATE_EXISTING_CRITS', 'Processing crit message', {
        messageClasses: Array.from(msg.classList || []),
      });

      // Helper function to check if element is in header/username/timestamp area
      const isInHeaderArea = (element) => {
        if (!element) return true;

        // Check parent chain
        const headerParent =
          element.closest('[class*="header"]') ||
          element.closest('[class*="username"]') ||
          element.closest('[class*="timestamp"]') ||
          element.closest('[class*="author"]') ||
          element.closest('[class*="topSection"]') ||
          element.closest('[class*="messageHeader"]') ||
          element.closest('[class*="messageGroup"]') ||
          element.closest('[class*="messageGroupWrapper"]');

        if (headerParent) {
          this.debugLog('UPDATE_EXISTING_CRITS', 'Element is in header area', {
            elementTag: element.tagName,
            headerParentClasses: Array.from(headerParent.classList || []),
          });
          return true;
        }

        // Check element's own classes
        const classes = Array.from(element.classList || []);
        const hasHeaderClass = classes.some(
          (c) =>
            c.includes('header') ||
            c.includes('username') ||
            c.includes('timestamp') ||
            c.includes('author') ||
            c.includes('topSection') ||
            c.includes('messageHeader') ||
            c.includes('messageGroup')
        );

        if (hasHeaderClass) {
          this.debugLog('UPDATE_EXISTING_CRITS', 'Element has header class', {
            elementTag: element.tagName,
            classes: classes,
          });
          return true;
        }

        return false;
      };

      // Find message content - but ONLY if it's NOT in the header area
      let content = null;

      // Try messageContent first (most specific)
      const messageContent = msg.querySelector('[class*="messageContent"]');
      if (messageContent) {
        if (!isInHeaderArea(messageContent)) {
          content = messageContent;
          this.debugLog('UPDATE_EXISTING_CRITS', 'Found messageContent', {
            elementTag: content.tagName,
            classes: Array.from(content.classList || []),
          });
        } else {
          this.debugLog('UPDATE_EXISTING_CRITS', 'messageContent rejected (in header)');
        }
      }

      // Try markup (Discord's text container) - but exclude if it's in header
      if (!content) {
        const markup = msg.querySelector('[class*="markup"]');
        if (markup) {
          if (!isInHeaderArea(markup)) {
            content = markup;
            this.debugLog('UPDATE_EXISTING_CRITS', 'Found markup', {
              elementTag: content.tagName,
              classes: Array.from(content.classList || []),
            });
          } else {
            this.debugLog('UPDATE_EXISTING_CRITS', 'markup rejected (in header)');
          }
        }
      }

      // Try textContainer
      if (!content) {
        const textContainer = msg.querySelector('[class*="textContainer"]');
        if (textContainer) {
          if (!isInHeaderArea(textContainer)) {
            content = textContainer;
            this.debugLog('UPDATE_EXISTING_CRITS', 'Found textContainer', {
              elementTag: content.tagName,
              classes: Array.from(content.classList || []),
            });
          } else {
            this.debugLog('UPDATE_EXISTING_CRITS', 'textContainer rejected (in header)');
          }
        }
      }

      // Last resort: find divs that are NOT in header areas
      if (!content) {
        const allDivs = msg.querySelectorAll('div');
        content = Array.from(allDivs).find((div) => {
          if (!isInHeaderArea(div) && div.textContent?.trim().length > 0) {
            this.debugLog('UPDATE_EXISTING_CRITS', 'Found div fallback', {
              elementTag: div.tagName,
              classes: Array.from(div.classList || []),
            });
            return true;
          }
          return false;
        });
      }

      if (!content) {
        this.debugLog('UPDATE_EXISTING_CRITS', 'No content element found - skipping this message');
        return;
      }

      this.debugLog('UPDATE_EXISTING_CRITS', 'Final content element selected', {
        tagName: content.tagName,
        classes: Array.from(content.classList || []),
        textPreview: content.textContent?.substring(0, 50),
      });

      if (content) {
        // Add a specific class to this element so CSS only targets it (not username/timestamp)
        content.classList.add('bd-crit-text-content');

        // Apply styles to the entire content container (sentence-level, not letter-level)
        {
          // Apply gradient or solid color based on settings
          if (this.settings.critGradient !== false) {
            // Purple to black gradient - simplified 3-color gradient
            const gradientColors =
              'linear-gradient(to right, #8b5cf6 0%, #7c3aed 15%, #6d28d9 30%, #4c1d95 45%, #312e81 60%, #1e1b4b 75%, #0f0f23 85%, #000000 95%, #000000 100%)';

            // Apply gradient to text using background-clip
            content.style.setProperty('background-image', gradientColors, 'important');
            content.style.setProperty('background', gradientColors, 'important');
            content.style.setProperty('-webkit-background-clip', 'text', 'important');
            content.style.setProperty('background-clip', 'text', 'important');
            content.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
            content.style.setProperty('color', 'transparent', 'important');
            content.style.setProperty('display', 'inline-block', 'important');

            // Explicitly exclude username/timestamp elements from gradient
            const usernameElements = msg.querySelectorAll(
              '[class*="username"], [class*="timestamp"], [class*="author"]'
            );
            usernameElements.forEach((el) => {
              el.style.setProperty('background', 'unset', 'important');
              el.style.setProperty('background-image', 'unset', 'important');
              el.style.setProperty('-webkit-background-clip', 'unset', 'important');
              el.style.setProperty('background-clip', 'unset', 'important');
              el.style.setProperty('-webkit-text-fill-color', 'unset', 'important');
              el.style.setProperty('color', 'unset', 'important');
            });

            // Apply glow effect for gradient
            if (this.settings.critGlow) {
              content.style.setProperty(
                'text-shadow',
                '0 0 3px rgba(139, 92, 246, 0.5), 0 0 6px rgba(124, 58, 237, 0.4), 0 0 9px rgba(109, 40, 217, 0.3), 0 0 12px rgba(91, 33, 182, 0.2)',
                'important'
              );
            } else {
              content.style.setProperty('text-shadow', 'none', 'important');
            }
          } else {
            // Solid color fallback
            content.style.setProperty('color', this.settings.critColor, 'important');
            content.style.setProperty('background', 'none', 'important');
            content.style.setProperty('-webkit-background-clip', 'unset', 'important');
            content.style.setProperty('background-clip', 'unset', 'important');
            content.style.setProperty('-webkit-text-fill-color', 'unset', 'important');
            content.style.setProperty(
              'text-shadow',
              this.settings.critGlow
                ? `0 0 2px ${this.settings.critColor}, 0 0 3px ${this.settings.critColor}`
                : 'none',
              'important'
            );

            // Explicitly exclude username/timestamp elements from color
            const usernameElements = msg.querySelectorAll(
              '[class*="username"], [class*="timestamp"], [class*="author"]'
            );
            usernameElements.forEach((el) => {
              el.style.setProperty('color', 'unset', 'important');
            });
          }

          // Apply font styles with !important to override ALL CSS including Discord's - Force Nova Flat
          content.style.setProperty('font-family', "'Nova Flat', sans-serif", 'important'); // Force Nova Flat
          content.style.setProperty('font-weight', 'bold', 'important'); // Bold for more impact
          content.style.setProperty('font-size', '1.6em', 'important'); // Larger for more impact
          content.style.setProperty('letter-spacing', '1px', 'important'); // Slight spacing
          content.style.setProperty('-webkit-text-stroke', 'none', 'important'); // Remove stroke for cleaner gradient
          content.style.setProperty('text-stroke', 'none', 'important'); // Remove stroke for cleaner gradient
          content.style.setProperty('font-synthesis', 'none', 'important');
          content.style.setProperty('font-variant', 'normal', 'important');
          content.style.setProperty('font-style', 'normal', 'important');
          content.style.setProperty(
            'animation',
            this.settings.critAnimation ? 'critPulse 0.5s ease-in-out' : 'none',
            'important'
          );
        }
      }
    });
  }

  // ============================================================================
  // TEST & UTILITY METHODS
  // ============================================================================

  testCrit() {
    // Find the most recent message and force a crit
    const messages = document.querySelectorAll(
      '[class*="message"]:not([class*="messageContent"]):not([class*="messageGroup"])'
    );
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && !this.critMessages.has(lastMessage)) {
      this.applyCritStyle(lastMessage);
      this.critMessages.add(lastMessage);
      try {
        BdApi?.showToast?.('Test Critical Hit Applied!', { type: 'success', timeout: 2000 });
      } catch (error) {
        this.debug?.enabled && console.log('CriticalHit: Test crit applied (toast failed)', error);
      }
    } else if (lastMessage) {
      try {
        BdApi?.showToast?.('Message already has crit!', { type: 'info', timeout: 2000 });
      } catch (error) {
        this.debug?.enabled && console.log('CriticalHit: Message already has crit');
      }
    } else if (!lastMessage) {
      try {
        BdApi?.showToast?.('No messages found to test', { type: 'error', timeout: 2000 });
      } catch (error) {
        this.debug?.enabled && console.log('CriticalHit: No messages found to test');
      }
    }
  }

  // ============================================================================
  // ANIMATION FEATURES (Merged from CriticalHitAnimation)
  // ============================================================================
  // Note: Constructor and state are merged into main constructor above
  // Hook registration removed - using direct method calls instead
  // Animation initialization is handled in main start() method
  // Settings management is handled in main loadSettings() and saveSettings() methods

  // ============================================================================
  // USER IDENTIFICATION
  // ============================================================================

  /**
   * Gets the current user's Discord ID from Webpack modules
   * Stores it in settings for persistence
   */
  getCurrentUserId() {
    try {
      const UserStore = BdApi.Webpack.getModule((m) => m.getCurrentUser);
      if (UserStore) {
        const user = UserStore.getCurrentUser();
        if (user?.id) {
          this.currentUserId = user.id;
          this.settings.ownUserId = user.id;
          this.saveSettings();
        }
      }
    } catch (error) {
      // Silently fail - user ID not critical for functionality
    }
  }

  /**
   * Checks if a message belongs to the current user
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {string} userId - The user ID to check
   * @returns {boolean} True if message belongs to current user
   */
  isOwnMessage(messageElement, userId) {
    if (this.settings?.ownUserId && userId === this.settings.ownUserId) return true;
    if (this.currentUserId && userId === this.currentUserId) return true;

    this.currentUserId ?? this.getCurrentUserId();

    return userId === this.currentUserId;
  }

  // ============================================================================
  // REACT FIBER UTILITIES
  // ============================================================================

  /**
   * Gets React fiber instance from a DOM element
   * Used to access React component data (message ID, author ID, etc.)
   * @param {HTMLElement} element - DOM element
   * @returns {Object|null} React fiber or null if not found
   */
  getReactFiber(element) {
    try {
      const reactKey = Object.keys(element).find(
        (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
      );
      return reactKey ? element[reactKey] : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Traverse React fiber tree to find a value
   * @param {Object} fiber - React fiber to start from
   * @param {Function} getter - Function to extract value from fiber
   * @param {number} maxDepth - Maximum traversal depth
   * @returns {any} Found value or null
   */
  traverseFiber(fiber, getter, maxDepth = 50) {
    if (!fiber) return null;

    // FUNCTIONAL: Fiber traversal (while loop for tree traversal)
    let depth = 0;
    while (fiber && depth < maxDepth) {
      const value = getter(fiber);
      if (value !== null && value !== undefined) return value;
      fiber = fiber.return;
      depth++;
    }

    return null;
  }

  /**
   * Extracts message ID from a message element
   * Wrapper around getMessageIdentifier() for backward compatibility
   * @param {HTMLElement} element - The message DOM element
   * @returns {string|null} Message ID or null if not found
   */
  getMessageId(element) {
    // Use the comprehensive getMessageIdentifier() method
    return this.getMessageIdentifier(element);
  }

  /**
   * Extracts user/author ID from a message element using React fiber traversal
   * @param {HTMLElement} element - The message DOM element
   * @returns {string|null} User ID or null if not found
   */
  getUserId(element) {
    try {
      const fiber = this.getReactFiber(element);
      if (fiber) {
        const authorId = this.traverseFiber(
          fiber,
          (f) => f.memoizedProps?.message?.author?.id || f.memoizedState?.message?.author?.id,
          30
        );
        if (authorId && this.isValidDiscordId(authorId)) {
          return String(authorId).trim();
        }
      }
    } catch (error) {
      // Silently fail - React fiber access may fail on some elements
    }
    return null;
  }

  /**
   * Extracts message timestamp from a message element using React fiber traversal
   * @param {HTMLElement} element - The message DOM element
   * @returns {number} Timestamp in milliseconds, or 0 if not found
   */
  getMessageTimestamp(element) {
    try {
      const fiber = this.getReactFiber(element);
      if (fiber) {
        const timestamp = this.traverseFiber(
          fiber,
          (f) => f.memoizedProps?.message?.timestamp || f.memoizedState?.message?.timestamp,
          30
        );
        if (timestamp)
          return timestamp instanceof Date
            ? timestamp.getTime()
            : typeof timestamp === 'string'
            ? new Date(timestamp).getTime()
            : typeof timestamp === 'number'
            ? timestamp
            : 0;
      }
    } catch (error) {
      // Silently fail - React fiber access may fail on some elements
    }
    return 0;
  }

  // ============================================================================
  // MESSAGE HISTORY & VALIDATION
  // ============================================================================

  // ============================================================================
  // HOOK REGISTRATION & CRITICAL HIT DETECTION
  // ============================================================================

  /**
   * Hooks into CriticalHit plugin's onCritHit method and checkForCrit hook
   * Sets up patches to detect crits and reset combos for non-crit messages
   */
  // Hook registration removed - using direct method calls instead
  // Animation is triggered directly from onCritHit() method
  // Combo resets are handled directly in checkForCrit() method

  // ============================================================================
  // CRITICAL HIT HANDLING
  // ============================================================================

  /**
   * Main handler for critical hit events
   * Validates message, updates combo count, checks cooldown, and triggers animation
   * @param {HTMLElement} messageElement - The message DOM element that crit
   */
  handleCriticalHit(messageElement) {
    if (!messageElement) return;

    // Get message ID and validate
    const messageId = this.getMessageId(messageElement);
    if (!this.isValidDiscordId(messageId)) return;

    // Verify gradient is applied before proceeding with animation
    // This ensures synchronization between CriticalHit and CriticalHitAnimation
    const verifyGradientSync = (element, attempt = 0, maxAttempts = 5) => {
      if (!element || !element.isConnected) {
        if (attempt < maxAttempts) {
          setTimeout(() => {
            const reQueried = messageId ? this.requeryMessageElement(messageId) : null;
            if (reQueried) verifyGradientSync(reQueried, attempt + 1, maxAttempts);
          }, 50 * (attempt + 1));
        }
        return false;
      }

      const hasCritClass = element.classList?.contains('bd-crit-hit');
      if (!hasCritClass) {
        attempt < maxAttempts &&
          setTimeout(
            () => verifyGradientSync(element, attempt + 1, maxAttempts),
            50 * (attempt + 1)
          );
        return false;
      }

      // Check for gradient in content element
      const contentSelectors = [
        '[class*="messageContent"]',
        '[class*="markup"]',
        '[class*="textContainer"]',
      ];
      const contentElement =
        contentSelectors
          .map((selector) => element.querySelector(selector))
          .find(
            (found) =>
              found &&
              !found.closest('[class*="username"]') &&
              !found.closest('[class*="timestamp"]')
          ) || null;

      if (contentElement) {
        const gradientCheck = this.verifyGradientApplied(contentElement);
        const hasGradient = gradientCheck.hasGradient;
        const hasWebkitClip = gradientCheck.hasWebkitClip;
        if (!hasGradient || !hasWebkitClip) {
          if (attempt < maxAttempts) {
            // Force reflow and retry
            void contentElement.offsetHeight;
            setTimeout(
              () => verifyGradientSync(element, attempt + 1, maxAttempts),
              50 * (attempt + 1)
            );
            return false;
          }
          // Max attempts reached, proceed anyway but log warning          }
        }
      }

      return true;
    };

    // Verify gradient synchronization before proceeding
    if (!verifyGradientSync(messageElement)) {
      // Will retry asynchronously, return early
      return;
    }

    // Get element position for duplicate detection (cache early)
    let elementRect;
    try {
      elementRect = messageElement.getBoundingClientRect();
    } catch (e) {
      return; // Element not accessible
    }

    const elementPosition = {
      x: elementRect.left + elementRect.width / 2,
      y: elementRect.top + elementRect.height / 2,
    };
    const elementTimestamp = Date.now();

    // Verify message has crit class and is in DOM
    const hasCritClass = messageElement.classList?.contains('bd-crit-hit');
    const isInDOM = messageElement.isConnected;
    if (!hasCritClass || !isInDOM) return;

    // Get content hash for deduplication
    const content = this.findMessageContentElement(messageElement);
    const author = this.getAuthorId(messageElement);
    let contentHash = null;
    const contentText = content?.textContent?.trim();
    contentHash = this.calculateContentHash(author, contentText);

    // Position-based duplicate detection (handles element replacement scenarios)
    if (this.isDuplicateByPosition(messageId, elementPosition, elementTimestamp)) {
      return;
    }

    // Atomic check-and-add to prevent race conditions (with content hash for deduplication)
    if (!this.addToAnimatedMessages(messageId, elementPosition, elementTimestamp, contentHash)) {
      return; // Already animated
    }

    // Validate user FIRST (before updating combo)
    const userId = this.getUserId(messageElement);
    if (!this.isValidDiscordId(userId) || !this.isOwnMessage(messageElement, userId)) {
      this.animatedMessages.delete(messageId);
      this._processingAnimations.delete(messageId);
      return;
    }

    // Check message age (skip old restored messages)
    // Check message history (5 second timeout)
    if (this.isMessageInHistory(messageId)) {
      const messageTime = this.getMessageTimestamp(messageElement);
      if (Date.now() - (messageTime || 0) > 5000) {
        this.animatedMessages.delete(messageId);
        this._processingAnimations.delete(messageId);
        return;
      }
    }

    // Update combo synchronously to prevent race conditions during spam
    // IMPORTANT: Update combo BEFORE cooldown check so combo always increments correctly
    // even if cooldown blocks the animation
    // CRITICAL: Only update combo ONCE per message ID to prevent duplicate increments
    const userIdForCombo = userId || 'unknown';

    // Check if combo was already updated for this message ID OR content hash
    // This prevents the same verified message from incrementing combo multiple times
    // Content hash check prevents duplicate increments when Discord replaces elements (message ID changes)
    // BUT: We still allow animation even if combo was already updated
    let combo = null; // Will be set if combo needs updating
    let storedCombo = null; // Will be set for showAnimation

    // Check both message ID and content hash for deduplication
    const alreadyUpdatedById = this._comboUpdatedMessages.has(messageId);
    const alreadyUpdatedByHash = contentHash && this._comboUpdatedContentHashes.has(contentHash);

    if (alreadyUpdatedById || alreadyUpdatedByHash) {
      // Combo already updated for this message (by ID or content hash) - skip combo update but still allow animation
      // Get current combo for display purposes
      const userCombo = this.getUserCombo(userIdForCombo);
      storedCombo = userCombo.comboCount; // Use current combo for animation display
    } else {
      // Mark this message as having combo updated (both by ID and content hash if available)
      this._comboUpdatedMessages.add(messageId);
      contentHash && this._comboUpdatedContentHashes.add(contentHash);

      // Cleanup old entries (older than 10 seconds) to prevent memory leaks
      if (this._comboUpdatedMessages.size > 1000) {
        // Simple cleanup: clear all entries older than 10 seconds
        // Since we don't track timestamps, just clear if set gets too large
        // This is safe because messages won't be reprocessed after 10 seconds
        this._comboUpdatedMessages.clear();
      }
      if (this._comboUpdatedContentHashes.size > 1000) {
        // Cleanup content hash set as well
        this._comboUpdatedContentHashes.clear();
      }

      // Synchronous combo update (atomic in single-threaded JavaScript)
      const userCombo = this.getUserCombo(userIdForCombo);
      const comboNow = Date.now();
      const timeSinceLastCrit = comboNow - userCombo.lastCritTime;

      // Capture previous combo before updating
      const previousCombo = userCombo.comboCount;

      combo = 1;
      if (timeSinceLastCrit <= 5000) {
        // Check message history (5 second timeout)
        combo = userCombo.comboCount + 1;
      } else {
        // Combo expired (>5s), reset to 1
        combo = 1;
      }

      // Update combo immediately (before async animation and before cooldown check)
      // This is synchronous, so it's atomic - no race conditions possible
      this.updateUserCombo(userIdForCombo, combo, comboNow);
      storedCombo = combo; // Use updated combo for animation display
    }

    // Cooldown check (AFTER combo update so combo always increments)
    const now = Date.now();
    if (now - this.lastAnimationTime < 100) {
      // Combo was already updated, but skip animation due to cooldown
      this.animatedMessages.delete(messageId);
      this._processingAnimations.delete(messageId);
      return;
    }
    this.lastAnimationTime = now;

    // Store position for fallback lookup
    const storedPosition = { ...elementPosition };

    // Use double RAF for DOM stability with fallback recovery
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Try to use original element first
        let targetElement = messageElement;
        let targetMessageId = messageId;

        // Check if original element is still valid
        const isOriginalValid = this.isElementValidForAnimation(messageElement, messageId);

        if (!isOriginalValid) {
          // Try to find element by position (fallback for replaced elements)
          targetElement = this.findElementByPosition(storedPosition, messageId);
          if (targetElement) {
            targetMessageId = this.getMessageId(targetElement) || messageId;
          } else {
            // Last resort: try to find any crit element at this position
            targetElement = this.findCritElementByPosition(storedPosition);
            if (targetElement) {
              targetMessageId = this.getMessageId(targetElement);
              // Update animatedMessages with new messageId if found
              if (targetMessageId && targetMessageId !== messageId) {
                const existingData = this.animatedMessages.get(messageId);
                if (existingData) {
                  this.animatedMessages.delete(messageId);
                  this.animatedMessages.set(targetMessageId, {
                    ...existingData,
                    messageId: targetMessageId,
                  });
                }
              }
            }
          }
        }

        // Final check: ensure we have a valid element
        if (!targetElement || !this.isElementValidForAnimation(targetElement, targetMessageId)) {
          this.markMessageAsRemoved(messageId);
          return;
        }
        // Pass stored combo to showAnimation (already updated synchronously above)
        // CRITICAL: Ensure storedCombo is passed correctly - it should be a number, not null
        if (storedCombo === null || storedCombo === undefined) {
          // Fallback: get current combo if storedCombo wasn't set
          const userId = this.getUserId(targetElement) || userIdForCombo;
          const userCombo = this.getUserCombo(userId);
          storedCombo = userCombo.comboCount;
        }

        this.showAnimation(targetElement, targetMessageId, storedCombo);
      });
    });
  }

  /**
   * Checks if element is valid for animation (more lenient than strict stability)
   * Allows animation if element is in DOM and has crit class, even if messageId changed slightly
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {string} expectedMessageId - Expected message ID for validation
   * @returns {boolean} True if element is valid for animation
   */
  isElementValidForAnimation(messageElement, expectedMessageId) {
    if (!messageElement?.classList) return false;

    const stillInDOM = messageElement.isConnected;
    const stillHasCritClass = messageElement.classList.contains('bd-crit-hit');

    // Must be in DOM and have crit class
    if (!stillInDOM || !stillHasCritClass) return false;

    // If we have an expected messageId, check it (but be lenient)
    if (expectedMessageId) {
      const currentMessageId = this.getMessageId(messageElement);
      // Allow if messageId matches OR if current is null (element might be transitioning)
      return !currentMessageId || currentMessageId === expectedMessageId;
    }

    return true;
  }

  /**
   * Gets all message elements from the DOM (cached query)
   * Filters out content-only elements to get actual message containers
   * @returns {HTMLElement[]} Array of message elements
   */
  getCachedMessages() {
    try {
      const allMessages = Array.from(document.querySelectorAll('[class*="message"]'));
      // Filter to get actual message containers, not content elements
      const filteredMessages = allMessages.filter((msg) => {
        if (!msg.classList || !msg.offsetParent) return false;
        const classes = Array.from(msg.classList);
        // Exclude content-only elements
        const isNotContent = !classes.some(
          (c) =>
            c.includes('messageContent') || c.includes('messageGroup') || c.includes('messageText')
        );
        return isNotContent && msg.isConnected;
      });
      return filteredMessages;
    } catch (error) {
      this.debugError('GET_CACHED_MESSAGES', error);
      return [];
    }
  }

  /**
   * Gets the position of an element (center point)
   * @param {HTMLElement} element - The element to get position for
   * @returns {Object|null} Position object with x and y coordinates, or null if element not accessible
   */
  getElementPosition(element) {
    try {
      if (!element || !element.getBoundingClientRect) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      const position = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      return position;
    } catch (error) {
      return null;
    }
  }

  /**
   * Finds a message element by its position (fallback when original element is replaced)
   * Used when Discord replaces message elements but position remains the same
   * @param {Object} position - Position object with x and y coordinates
   * @param {string} originalMessageId - Original message ID for exact matching
   * @returns {HTMLElement|null} Found element or null
   */
  findElementByPosition(position, originalMessageId) {
    const tolerance = 100; // pixels
    const allMessages = this.getCachedMessages();

    return (
      allMessages.find((msg) => {
        try {
          if (!msg.classList?.contains('bd-crit-hit')) return false;

          const msgPosition = this.getElementPosition(msg);
          if (!msgPosition) return false;

          const positionDiff =
            Math.abs(msgPosition.x - position.x) + Math.abs(msgPosition.y - position.y);

          if (positionDiff < tolerance) {
            const msgId = this.getMessageId(msg);
            return !originalMessageId || msgId === originalMessageId || !msgId;
          }
          return false;
        } catch (error) {
          return false;
        }
      }) || null
    );
  }

  /**
   * Finds any crit element at a given position (last resort fallback)
   * Used when message ID is unknown but position is known
   * @param {Object} position - Position object with x and y coordinates
   * @returns {HTMLElement|null} Found element or null
   */
  findCritElementByPosition(position) {
    const tolerance = 100;
    const allMessages = this.getCachedMessages();

    return (
      allMessages.find((msg) => {
        try {
          if (!msg.classList?.contains('bd-crit-hit') || !msg.isConnected) return false;

          const msgPosition = this.getElementPosition(msg);
          if (!msgPosition) return false;

          const positionDiff =
            Math.abs(msgPosition.x - position.x) + Math.abs(msgPosition.y - position.y);

          return positionDiff < tolerance;
        } catch (error) {
          return false;
        }
      }) || null
    );
  }

  /**
   * Marks a message as removed but keeps entry for duplicate detection
   * Prevents duplicate animations when messages are reprocessed
   * @param {string} messageId - The message ID to mark as removed
   */
  markMessageAsRemoved(messageId) {
    const existingData = this.animatedMessages.get(messageId);
    if (existingData?.constructor === Object) {
      existingData.removed = true;
      existingData.removedAt = Date.now();
    }
  }

  /**
   * Checks if an animation is a duplicate based on position and timestamp
   * Handles cases where same logical message gets new messageId after element replacement
   * @param {string} messageId - The message ID
   * @param {Object} elementPosition - Position object with x and y coordinates
   * @param {number} elementTimestamp - Timestamp of the message
   * @returns {boolean} True if duplicate detected
   */
  isDuplicateByPosition(messageId, elementPosition, elementTimestamp) {
    const positionTolerance = 50; // pixels
    const timeTolerance = 2000; // ms
    const currentTime = Date.now();

    return Array.from(this.animatedMessages.entries()).some(([trackedMessageId, trackedData]) => {
      if (!trackedData || typeof trackedData !== 'object' || !trackedData.position) return false;

      // Clean up old entries
      const timeSinceTracked = currentTime - trackedData.timestamp;
      if (timeSinceTracked > timeTolerance) {
        this.animatedMessages.delete(trackedMessageId);
        return false;
      }

      // Check position and timing
      const positionDiff =
        Math.abs(trackedData.position.x - elementPosition.x) +
        Math.abs(trackedData.position.y - elementPosition.y);
      const timeDiff = elementTimestamp - trackedData.timestamp;

      return positionDiff < positionTolerance && timeDiff < timeTolerance;
    });
  }

  /**
   * Atomically add message to animatedMessages set
   * Returns true if added, false if already exists
   */
  addToAnimatedMessages(messageId, elementPosition, elementTimestamp, contentHash = null) {
    // Early return if already animated (atomic check)
    if (this.animatedMessages.has(messageId)) {
      const existing = this.animatedMessages.get(messageId);
      // If same content hash, it's a duplicate
      if (contentHash && existing?.contentHash === contentHash) {
        return false;
      }
    }

    const sizeBefore = this.animatedMessages.size;
    this.animatedMessages.set(messageId, {
      position: elementPosition,
      timestamp: elementTimestamp,
      messageId: messageId,
      contentHash: contentHash, // Store content hash for deduplication
    });

    // Remove from processing lock when successfully added
    this._processingAnimations.delete(messageId);

    return this.animatedMessages.size > sizeBefore;
  }

  // ============================================================================
  // ANIMATION DISPLAY
  // ============================================================================

  /**
   * Displays the "CRITICAL HIT!" animation with combo count
   * Handles duplicate detection, positioning, and cleanup
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {string} messageId - The message ID
   * @param {number|null} comboOverride - Optional combo count override
   */
  showAnimation(messageElement, messageId, comboOverride = null) {
    // Enhanced deduplication: Check by message ID AND content hash
    // This prevents double animations when messages are undone and sent again
    if (messageId && this.animatedMessages.has(messageId)) {
      const existingData = this.animatedMessages.get(messageId);

      // Get content hash for this message to check if it's the same logical message
      const content = this.findMessageContentElement(messageElement);
      const author = this.getAuthorId(messageElement);
      let contentHash = null;
      const contentText = content?.textContent?.trim();
      contentHash = this.calculateContentHash(author, contentText);

      // Check if this is the same logical message (same content hash)
      // BUT allow animation if element was replaced (Discord reprocessed it)
      if (existingData && existingData.contentHash && contentHash === existingData.contentHash) {
        // Check if the original element is still connected
        // If not, Discord replaced it and we should allow the animation
        const timeSinceAnimated = Date.now() - existingData.timestamp;
        const originalElementStillConnected = document.querySelector(
          `[data-message-id="${messageId}"]`
        )?.isConnected;

        // Check if this is a verified message (has real Discord ID)
        // For verified messages, be more lenient with deduplication
        const isValidDiscordId = messageId ? /^\d{17,19}$/.test(messageId) : false;

        // For verified messages, always allow animation (they're confirmed crits)
        // For non-verified messages, use stricter time-based deduplication
        if (isValidDiscordId) {
          // Verified message - always allow animation (remove old entry to allow new one)
          this.animatedMessages.delete(messageId);
        } else if (
          timeSinceAnimated > 2000 ||
          (!originalElementStillConnected && timeSinceAnimated > 1000)
        ) {
          // Enough time passed or element replaced with enough time - allow animation
          // Remove old entry to allow new animation
          this.animatedMessages.delete(messageId);
        } else {
          // Same logical message with same element - skip animation          return;
        }
      }

      // Different content or no content hash - check if element was replaced
      if (existingData && messageElement?.isConnected) {
        // Element was replaced AND content is different - allow retry for new message        // Remove old entry to allow new animation
        this.animatedMessages.delete(messageId);
      } else {
        // Duplicate call with same element, skip        return;
      }
    } // Check animation runtime setting (not overall plugin enabled state)
    if (this.settings?.animationEnabled === false) return;

    // Final safety check - be lenient, just need crit class and DOM presence
    if (!messageElement?.classList || !messageElement.isConnected) {
      if (messageId) {
        this.animatedMessages.delete(messageId);
        this._processingAnimations.delete(messageId);
      }
      return;
    }

    // Check for crit class - if missing, try one more time after brief delay
    if (!messageElement?.classList?.contains('bd-crit-hit')) {
      // Give it one more frame to get the class
      requestAnimationFrame(() => {
        if (!messageElement.classList?.contains('bd-crit-hit')) {
          if (messageId) {
            this.animatedMessages.delete(messageId);
            this._processingAnimations.delete(messageId);
          }
          return;
        }
        // Retry with the same element (pass comboOverride)
        this.showAnimation(messageElement, messageId, comboOverride);
      });
      return;
    }

    // Use comboOverride if provided (prevents race conditions during spam)
    // CRITICAL: If comboOverride is null/undefined, use current combo WITHOUT incrementing
    // The combo should already be updated by handleCriticalHit before calling showAnimation
    let combo = comboOverride;
    if (combo === null || combo === undefined) {
      // Fallback: use current combo WITHOUT incrementing (combo should already be updated)
      // This should only happen if showAnimation is called from restoration or other paths
      const userId = this.getUserId(messageElement) || 'unknown';
      const userCombo = this.getUserCombo(userId);

      // Use current combo count (don't increment - it should already be updated)
      combo = userCombo.comboCount || 1;
    }

    // Get position and container
    const position = this.getMessageAreaPosition();
    const container = this.getAnimationContainer();
    if (!container) return;

    // Check for duplicate animations in DOM
    if (this.hasDuplicateInDOM(container, messageId, position)) {
      return;
    }

    // Fade out existing animations before starting new one
    this.fadeOutExistingAnimations();

    // Apply screen shake if enabled
    this.settings?.screenShake && this.applyScreenShake();

    // Create animation element
    const textElement = this.createAnimationElement(messageId, combo, position);
    container.appendChild(textElement);
    this.activeAnimations.add(textElement);
    // Cleanup after animation completes
    this.scheduleCleanup(textElement, messageId, container);
  }

  /**
   * Fades out existing animations smoothly when a new critical hit occurs
   * Checks both activeAnimations Set and DOM container for existing animations
   * Prevents multiple overlapping animations
   */
  fadeOutExistingAnimations() {
    const container = this.getAnimationContainer();
    if (!container) return;

    // Find all existing animation elements in DOM (more reliable than just Set)
    const existingElements = container.querySelectorAll('.cha-critical-hit-text');

    if (!existingElements.length) return;

    const fadeOutDuration = 300; // 300ms fade out

    existingElements.forEach((existingEl) => {
      if (!existingEl.parentNode) {
        this.activeAnimations.delete(existingEl);
        return;
      }

      try {
        // Clear cleanup timeout if exists
        if (existingEl._chaCleanupTimeout) {
          clearTimeout(existingEl._chaCleanupTimeout);
          existingEl._chaCleanupTimeout = null;
        }

        // Stop the current animation - only clear animation property
        existingEl.style.animation = 'none';

        // Apply smooth fade-out transition (only opacity, keep other styles)
        existingEl.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
        existingEl.style.opacity = '0';

        // Remove element after fade completes - only remove, don't clear other styles
        setTimeout(() => {
          try {
            existingEl.parentNode && existingEl.remove();
            this.activeAnimations.delete(existingEl);
          } catch (e) {
            this.activeAnimations.delete(existingEl);
          }
        }, fadeOutDuration);
      } catch (e) {
        // If fade fails, just remove immediately
        try {
          existingEl.parentNode && existingEl.remove();
          this.activeAnimations.delete(existingEl);
        } catch (error2) {
          this.activeAnimations.delete(existingEl);
        }
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Validation
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * Schedule cleanup after animation completes
   * Waits full animation duration - only removes element, doesn't clear animation styles
   */
  scheduleCleanup(textElement, messageId, container) {
    const cleanupDelay = this.settings.animationDuration + 100;

    // Wait for full animation duration - don't interfere with animation
    const cleanupTimeout = setTimeout(() => {
      try {
        if (!textElement.parentNode) {
          this.activeAnimations.delete(textElement);
          return;
        }

        // Handle duplicate elements with same messageId
        if (messageId) {
          const allElements = container.querySelectorAll(`[data-cha-message-id="${messageId}"]`);
          allElements.length > 1 &&
            allElements.forEach((el) => {
              try {
                if (el.parentNode) {
                  el.remove();
                }
                this.activeAnimations.delete(el);
              } catch (e) {
                this.activeAnimations.delete(el);
              }
            });
          return;
        }

        // Only remove element - don't clear animation styles
        // Animation has completed, CSS fade-out is done, just remove from DOM
        textElement.parentNode && textElement.remove();
        this.activeAnimations.delete(textElement);
      } catch (e) {
        this.activeAnimations.delete(textElement);
      }
    }, cleanupDelay);

    textElement._chaCleanupTimeout = cleanupTimeout;
  }

  // ============================================================================
  // USER COMBO MANAGEMENT
  // ============================================================================

  getUserCombo(userId) {
    const key = userId || 'unknown';
    if (!this.userCombos.has(key)) {
      this.userCombos.set(key, { comboCount: 0, lastCritTime: 0, timeout: null });
    }
    return this.userCombos.get(key);
  }

  /**
   * Updates combo count for a user and sets timeout to reset combo
   * Persists combo to storage and handles combo expiration (5 second timeout)
   * @param {string} userId - The user ID
   * @param {number} comboCount - The new combo count
   * @param {number} lastCritTime - Timestamp of the crit
   */
  updateUserCombo(userId, comboCount, lastCritTime) {
    const key = userId || 'unknown';
    const combo = this.getUserCombo(key);
    const previousCombo = combo.comboCount;
    combo.comboCount = comboCount;
    combo.lastCritTime = lastCritTime; // Save for SoloLevelingStats
    try {
      BdApi.Data.save('CriticalHitAnimation', 'userCombo', {
        userId: key,
        comboCount: comboCount,
        lastCritTime: lastCritTime,
      });
    } catch (error) {
      // Silently fail - data save not critical
    }

    // Reset combo after 5 seconds of no crits
    if (combo.timeout) clearTimeout(combo.timeout);
    combo.timeout = setTimeout(() => {
      if (this.userCombos.has(key)) {
        const comboObj = this.userCombos.get(key);
        const hadCombo = comboObj.comboCount; // Reset both comboCount and lastCritTime
        comboObj.comboCount = 0;
        comboObj.lastCritTime = 0; // Reset lastCritTime so next crit calculates timeSince correctly

        try {
          BdApi.Data.save('CriticalHitAnimation', 'userCombo', {
            userId: key,
            comboCount: 0,
            lastCritTime: 0,
          });
        } catch (error) {
          // Silently fail - data save not critical
        }
      }
    }, 5000); // Changed from 10000 to 5000 (5 seconds)
  }

  // ============================================================================
  // DOM UTILITIES
  // ============================================================================

  /**
   * Gets or creates the animation container element
   * Container is positioned fixed and holds all animation elements
   * @returns {HTMLElement} Animation container element
   */
  getAnimationContainer() {
    if (!this.animationContainer || !document.contains(this.animationContainer)) {
      this.animationContainer = document.createElement('div');
      this.animationContainer.style.cssText =
        'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 999999;';
      document.body.appendChild(this.animationContainer);
    }
    return this.animationContainer;
  }

  /**
   * Gets the position of the message area for animation positioning
   * @returns {Object} Position object with x and y coordinates
   */
  getMessageAreaPosition() {
    // Use cached selectors if available
    if (!this._cachedChatInput || !document.contains(this._cachedChatInput)) {
      this._cachedChatInput = document.querySelector('[class*="channelTextArea"]');
    }
    if (!this._cachedMessageList || !document.contains(this._cachedMessageList)) {
      this._cachedMessageList = document.querySelector('[class*="messagesWrapper"]');
    }

    const target = this._cachedChatInput || this._cachedMessageList;
    if (target) {
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    return { x: window.innerWidth / 2, y: window.innerHeight / 2 + 50 };
  }

  // ============================================================================
  // SCREEN SHAKE EFFECT
  // ============================================================================

  /**
   * Applies screen shake effect to the entire page
   * Uses CSS animation based on settings (intensity and duration)
   */
  applyScreenShake() {
    const discordContainer = document.querySelector('[class*="app"]') || document.body;
    if (!discordContainer) return;

    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
      @keyframes chaShake {
        0%, 100% { transform: translate(0, 0); }
        25% { transform: translate(-${this.settings.shakeIntensity}px, ${this.settings.shakeIntensity}px); }
        50% { transform: translate(${this.settings.shakeIntensity}px, -${this.settings.shakeIntensity}px); }
        75% { transform: translate(-${this.settings.shakeIntensity}px, -${this.settings.shakeIntensity}px); }
      }
      .cha-screen-shake-active {
        animation: chaShake ${this.settings.shakeDuration}ms ease-in-out;
      }
    `;
    document.head.appendChild(shakeStyle);
    discordContainer.classList.add('cha-screen-shake-active');

    setTimeout(() => {
      discordContainer.classList.remove('cha-screen-shake-active');
      shakeStyle.remove();
    }, this.settings.shakeDuration);
  }

  // ============================================================================
  // CSS INJECTION & STYLING
  // ============================================================================

  /**
   * Injects CSS styles for animations, screen shake, and combo display
   * Includes keyframe animations for float, fade, and shake effects
   */
  /**
   * Injects CSS styles for animations, screen shake, and combo display
   * Includes keyframe animations for float, fade, and shake effects
   * Renamed from injectCSS to injectAnimationCSS for clarity
   */
  injectAnimationCSS() {
    // Inject Nova Flat font
    if (!document.getElementById('cha-nova-flat-font')) {
      const fontLink = document.createElement('link');
      fontLink.id = 'cha-nova-flat-font';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Nova+Flat&display=swap';
      document.head.appendChild(fontLink);
    }

    // Remove old styles
    const oldStyle = document.getElementById('cha-styles');
    if (oldStyle) oldStyle.remove();

    const style = document.createElement('style');
    style.id = 'cha-styles';
    style.textContent = `
      @keyframes chaFloatUp {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) translateY(0) scale(0.8);
        }
        2% {
          opacity: 1;
          transform: translate(-50%, -50%) translateY(0) scale(1.1);
        }
        4% {
          opacity: 1;
          transform: translate(-50%, -50%) translateY(0) scale(1);
        }
        20% {
          opacity: 1;
          transform: translate(-50%, -50%) translateY(calc(var(--cha-float-distance, -150px) * 0.3)) scale(1);
        }
        50% {
          opacity: 1;
          transform: translate(-50%, -50%) translateY(calc(var(--cha-float-distance, -150px) * 0.6)) scale(1);
        }
        80% {
          opacity: 0.8;
          transform: translate(-50%, -50%) translateY(calc(var(--cha-float-distance, -150px) * 0.9)) scale(0.95);
        }
        95% {
          opacity: 0.4;
          transform: translate(-50%, -50%) translateY(calc(var(--cha-float-distance, -150px) * 0.98)) scale(0.9);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) translateY(var(--cha-float-distance, -150px)) scale(0.85);
        }
      }
      .cha-critical-hit-text {
        font-family: 'Nova Flat', sans-serif !important;
        /* Refined gradient: deep red to bright gold */
        background: linear-gradient(135deg,
          #ff4444 0%,
          #ff6600 25%,
          #ff8800 50%,
          #ffaa00 75%,
          #ffcc00 100%) !important;
        -webkit-background-clip: text !important;
        background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        color: #ff8800 !important;
        /* Subtle glow - reduced but present */
        filter: drop-shadow(0 0 3px rgba(255, 102, 0, 0.4))
                drop-shadow(0 0 6px rgba(255, 68, 68, 0.3)) !important;
        display: inline-block !important;
        /* Minimal text shadow for subtle glow */
        text-shadow:
          0 0 4px rgba(255, 136, 0, 0.5),
          0 0 8px rgba(255, 102, 0, 0.3) !important;
        /* Animation defined in CSS class - no inline opacity conflicts */
        animation: chaFloatUp var(--cha-duration, 4000ms) ease-out forwards;
        visibility: visible !important;
        min-width: 1px !important;
        min-height: 1px !important;
        will-change: transform, opacity !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================================
  // BETTERDISCORD PLUGIN LIFECYCLE METHODS
  // ============================================================================
  // Required by BetterDiscord: start() and stop() methods
  // ============================================================================

  /**
   * BetterDiscord plugin start method
   * Called when plugin is enabled or Discord starts
   * Initializes the plugin: loads history, injects CSS, starts observers
   */
  start() {
    try {
      // Load settings first (before any debug logging)
      this.loadSettings();

      this.debugLog('PLUGIN_START', 'Starting CriticalHit plugin', {
        version: '3.0.0',
        settings: {
          enabled: this.settings.enabled,
          critChance: this.settings.critChance,
          critGradient: this.settings.critGradient,
          debugMode: this.settings.debugMode,
        },
      });

      // Load message history from storage
      this.loadMessageHistory();

      // Inject CSS styles (crit, settings, animation)
      this.injectCritCSS();
      this.injectSettingsCSS();
      this.injectAnimationCSS();

      // Start observing for new messages
      this.startObserving();

      // Set up channel change listener
      this.setupChannelChangeListener();

      // Start periodic cleanup if enabled
      if (this.settings.autoCleanupHistory) {
        this.startPeriodicCleanup();
      }

      this.debugLog('PLUGIN_START', 'SUCCESS: CriticalHit plugin started successfully');
    } catch (error) {
      this.debugError('PLUGIN_START', error, { phase: 'initialization' });
      console.error('CriticalHit: Failed to start plugin', error);
    }
  }

  /**
   * BetterDiscord plugin stop method
   * Called when plugin is disabled or Discord closes
   * Cleans up: saves history, stops observers, removes CSS
   */
  stop() {
    try {
      this.debugLog('PLUGIN_STOP', 'Stopping CriticalHit plugin', {
        historySize: this.messageHistory.length,
        critCount: this.getCritHistory().length,
      });

      // OPTIMIZED: Force immediate save before stopping (bypass throttle)
      // Clear any pending throttled save
      this._saveHistoryThrottle && clearTimeout(this._saveHistoryThrottle);
      this._saveHistoryPending = false;
      // Save immediately (no throttle on stop - critical for data persistence)
      this.saveMessageHistory();

      // Stop all observers
      if (this.messageObserver) {
        this.messageObserver.disconnect();
        this.messageObserver = null;
      }

      if (this.urlObserver) {
        this.urlObserver.disconnect();
        this.urlObserver = null;
      }

      // Stop all style observers
      // Clean up all observers
      this.styleObservers.forEach((observer) => observer.disconnect());
      this.styleObservers.clear();

      // Clean up batch processing
      this._batchProcessingTimeout && clearTimeout(this._batchProcessingTimeout);
      this._pendingNodes.clear();
      this._processingBatch = false;

      // Clean up observer cleanup interval
      this._observerCleanupInterval && clearInterval(this._observerCleanupInterval);

      // Clean up save history throttle
      this._saveHistoryThrottle && clearTimeout(this._saveHistoryThrottle);
      this._saveHistoryPending = false;
      this.styleObservers.clear();

      // Stop periodic cleanup
      if (this.historyCleanupInterval) {
        clearInterval(this.historyCleanupInterval);
        this.historyCleanupInterval = null;
      }

      // Clean up intervals
      if (this._forceNovaInterval) {
        clearInterval(this._forceNovaInterval);
        this._forceNovaInterval = null;
      }

      if (this._displayUpdateInterval) {
        clearInterval(this._displayUpdateInterval);
        this._displayUpdateInterval = null;
      }

      // Remove injected CSS
      const critStyle = document.getElementById('bd-crit-hit-styles');
      critStyle && critStyle.remove();

      const settingsStyle = document.getElementById('bd-crit-hit-settings-styles');
      settingsStyle && settingsStyle.remove();

      const animationStyle = document.getElementById('bd-crit-hit-animation-styles');
      animationStyle && animationStyle.remove();

      const fontLink = document.getElementById('bd-crit-hit-nova-flat-font');
      fontLink && fontLink.remove();

      // Clear tracking data
      this.critMessages.clear();
      this.processedMessages.clear();
      this.processedMessagesOrder = [];
      this.pendingCrits.clear();
      this.animatedMessages.clear();
      this.activeAnimations.clear();

      this.debugLog('PLUGIN_STOP', 'SUCCESS: CriticalHit plugin stopped successfully');
    } catch (error) {
      this.debugError('PLUGIN_STOP', error, { phase: 'cleanup' });
      console.error('CriticalHit: Error during plugin stop', error);
    }
  }

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT
  // ============================================================================
  // Moved to end of file for better organization
  // ============================================================================

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  /**
   * Loads settings from BetterDiscord storage
   * Syncs debug.enabled with settings.debugMode
   */
  loadSettings() {
    try {
      const saved = BdApi.Data.load('CriticalHit', 'settings');
      if (saved && typeof saved === 'object') {
        // Merge saved settings with defaults (preserve defaults for new settings)
        this.settings = { ...this.defaultSettings, ...saved };
      } else {
        // No saved settings, use defaults
        this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
      }

      // Sync debug.enabled with settings.debugMode
      this.debug.enabled = this.settings.debugMode === true;

      // OPTIMIZED: Update history limits from settings
      this.maxHistorySize = this.settings.maxHistorySize ?? 2000;
      this.maxCritHistory = this.settings.maxCritHistory ?? 1000;
      this.maxHistoryPerChannel = this.settings.maxHistoryPerChannel ?? 500;

      this.debugLog('LOAD_SETTINGS', 'Settings loaded', {
        debugMode: this.settings.debugMode,
        debugEnabled: this.debug.enabled,
        maxHistorySize: this.maxHistorySize,
        maxCritHistory: this.maxCritHistory,
        maxHistoryPerChannel: this.maxHistoryPerChannel,
      });
    } catch (error) {
      this.debugError('LOAD_SETTINGS', error);
      // Fallback to defaults on error
      this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
      this.debug.enabled = false;
    }
  }

  /**
   * Saves settings to BetterDiscord storage
   * Syncs debug.enabled with settings.debugMode before saving
   */
  saveSettings() {
    try {
      // Sync debug.enabled with settings.debugMode before saving
      this.debug.enabled = this.settings.debugMode === true;

      BdApi.Data.save('CriticalHit', 'settings', this.settings);

      this.debugLog('SAVE_SETTINGS', 'Settings saved', {
        debugMode: this.settings.debugMode,
        debugEnabled: this.debug.enabled,
      });
    } catch (error) {
      this.debugError('SAVE_SETTINGS', error);
    }
  }

  /**
   * Updates debug mode setting and syncs debug.enabled
   * @param {boolean} enabled - Whether to enable debug mode
   */
  updateDebugMode(enabled) {
    this.settings.debugMode = enabled === true;
    this.debug.enabled = enabled === true;
    this.saveSettings();

    this.debugLog('UPDATE_DEBUG_MODE', `Debug mode ${enabled ? 'enabled' : 'disabled'}`, {
      debugMode: this.settings.debugMode,
      debugEnabled: this.debug.enabled,
    });

    // Show toast notification
    try {
      if (BdApi?.showToast) {
        BdApi.showToast(`Debug mode ${enabled ? 'enabled' : 'disabled'}`, {
          type: enabled ? 'warning' : 'info',
          timeout: 2000,
        });
      }
    } catch (error) {
      // Toast failed, continue
    }
  }

  // ============================================================================
  // DEBUG LOGGING SYSTEM
  // ============================================================================

  /**
   * Debug logging helper - only logs when debug mode is enabled
   * Includes throttling for frequent operations to prevent console spam
   * @param {string} operation - Operation name (e.g., 'CHECK_FOR_CRIT')
   * @param {string} message - Log message
   * @param {Object|null} data - Optional data object to log
   */
  debugLog(operation, message, data = null) {
    // Guard clause: early return if debug disabled
    if (!this.debug?.enabled) return;

    // Throttle frequent operations (Set for O(1) lookup)
    const frequentOps = new Set([
      'GET_MESSAGE_ID',
      'CHECK_FOR_RESTORATION',
      'RESTORE_CHANNEL_CRITS',
      'CHECK_FOR_CRIT',
      'PROCESS_NODE',
      'MUTATION_OBSERVER',
    ]);

    // Throttling logic (short-circuit)
    frequentOps.has(operation) &&
      (() => {
        const now = Date.now();
        const lastLogTimes = this.debug.lastLogTimes || {};
        const throttleInterval = 10000;

        // Skip if throttled (short-circuit return)
        lastLogTimes[operation] &&
          now - lastLogTimes[operation] < throttleInterval &&
          ((this.debug.operationCounts[operation] =
            (this.debug.operationCounts[operation] || 0) + 1),
          true) &&
          (() => {
            return;
          })();

        // Initialize and update (short-circuit)
        !this.debug.lastLogTimes && (this.debug.lastLogTimes = {});
        this.debug.lastLogTimes[operation] = now;
      })();

    const timestamp = new Date().toISOString();
    console.warn(`[CriticalHit:${operation}] ${message}`, data || '');

    // Track operation counts
    this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
  }

  /**
   * Error logging helper - always logs errors, but tracks them when debug enabled
   * @param {string} operation - Operation name where error occurred
   * @param {Error|string} error - Error object or error message
   * @param {Object} context - Optional context data
   */
  debugError(operation, error, context = {}) {
    // Track errors with short-circuit (no if-else)
    this.debug?.enabled &&
      (this.debug.errorCount++,
      (this.debug.lastError = {
        operation,
        error: error.message || error,
        stack: error.stack,
        context,
        timestamp: Date.now(),
      }));

    const timestamp = new Date().toISOString();
    console.error(`[CriticalHit:ERROR:${operation}]`, {
      message: error.message || error,
      stack: error.stack,
      context,
      timestamp,
    });
  }

  // ============================================================================
  // SETTINGS PANEL EVENT LISTENERS
  // ============================================================================

  /**
   * Attaches event listeners for basic settings (crit chance, color, font, etc.)
   * @param {HTMLElement} container - Settings panel container
   */
  attachBasicSettingsListeners(container) {
    // Crit chance slider and input
    const critChanceSlider = container.querySelector('#crit-chance-slider');
    const critChanceInput = container.querySelector('#crit-chance');
    if (critChanceSlider && critChanceInput) {
      const updateCritChance = (value) => {
        const numValue = parseFloat(value) || 0;
        critChanceSlider.value = numValue;
        critChanceInput.value = numValue;
        this.updateCritChance(numValue);
      };
      critChanceSlider.addEventListener('input', (e) => updateCritChance(e.target.value));
      critChanceInput.addEventListener('change', (e) => updateCritChance(e.target.value));
    }

    // Crit color picker
    const critColorPicker = container.querySelector('#crit-color');
    if (critColorPicker) {
      critColorPicker.addEventListener('change', (e) => {
        this.updateCritColor(e.target.value);
      });
    }

    // Crit font selector
    const critFontSelect = container.querySelector('#crit-font');
    if (critFontSelect) {
      critFontSelect.addEventListener('change', (e) => {
        this.updateCritFont(e.target.value);
      });
    }

    // Crit gradient toggle
    const critGradientCheckbox = container.querySelector('#crit-gradient');
    if (critGradientCheckbox) {
      critGradientCheckbox.addEventListener('change', (e) => {
        this.updateCritGradient(e.target.checked);
      });
    }

    // Crit glow toggle
    const critGlowCheckbox = container.querySelector('#crit-glow');
    if (critGlowCheckbox) {
      critGlowCheckbox.addEventListener('change', (e) => {
        this.updateCritGlow(e.target.checked);
      });
    }

    // Crit animation toggle
    const critAnimationCheckbox = container.querySelector('#crit-animation');
    if (critAnimationCheckbox) {
      critAnimationCheckbox.addEventListener('change', (e) => {
        this.updateCritAnimation(e.target.checked);
      });
    }

    // Test crit button
    const testCritBtn = container.querySelector('#test-crit-btn');
    if (testCritBtn) {
      testCritBtn.addEventListener('click', () => {
        this.testCrit();
      });
    }
  }

  /**
   * Attaches event listeners for filter settings
   * @param {HTMLElement} container - Settings panel container
   */
  attachFilterListeners(container) {
    const filterReplies = container.querySelector('#filter-replies');
    const filterSystem = container.querySelector('#filter-system');
    const filterBots = container.querySelector('#filter-bots');
    const filterEmpty = container.querySelector('#filter-empty');

    if (filterReplies) {
      filterReplies.addEventListener('change', (e) => {
        this.settings.filterReplies = e.target.checked;
        this.saveSettings();
      });
    }

    if (filterSystem) {
      filterSystem.addEventListener('change', (e) => {
        this.settings.filterSystemMessages = e.target.checked;
        this.saveSettings();
      });
    }

    if (filterBots) {
      filterBots.addEventListener('change', (e) => {
        this.settings.filterBotMessages = e.target.checked;
        this.saveSettings();
      });
    }

    if (filterEmpty) {
      filterEmpty.addEventListener('change', (e) => {
        this.settings.filterEmptyMessages = e.target.checked;
        this.saveSettings();
      });
    }
  }

  /**
   * Attaches event listeners for history settings
   * @param {HTMLElement} container - Settings panel container
   */
  attachHistoryListeners(container) {
    const historyRetentionSlider = container.querySelector('#history-retention-slider');
    const historyRetentionInput = container.querySelector('#history-retention');
    const autoCleanupCheckbox = container.querySelector('#auto-cleanup-history');

    if (historyRetentionSlider && historyRetentionInput) {
      const updateRetention = (value) => {
        const numValue = Math.max(1, Math.min(90, parseInt(value) || 30));
        historyRetentionSlider.value = numValue;
        historyRetentionInput.value = numValue;
        this.settings.historyRetentionDays = numValue;
        this.saveSettings();
      };
      historyRetentionSlider.addEventListener('input', (e) => updateRetention(e.target.value));
      historyRetentionInput.addEventListener('change', (e) => updateRetention(e.target.value));
    }

    if (autoCleanupCheckbox) {
      autoCleanupCheckbox.addEventListener('change', (e) => {
        this.settings.autoCleanupHistory = e.target.checked;
        this.saveSettings();
        if (e.target.checked) {
          this.startPeriodicCleanup();
        } else {
          if (this.historyCleanupInterval) {
            clearInterval(this.historyCleanupInterval);
            this.historyCleanupInterval = null;
          }
        }
      });
    }
  }

  /**
   * Attaches event listeners for animation settings
   * @param {HTMLElement} container - Settings panel container
   */
  attachAnimationListeners(container) {
    // Animation duration
    const animationDurationSlider = container.querySelector('#animation-duration-slider');
    const animationDurationInput = container.querySelector('#animation-duration');
    if (animationDurationSlider && animationDurationInput) {
      const updateDuration = (value) => {
        const numValue = Math.max(1000, Math.min(10000, parseInt(value) || 4000));
        animationDurationSlider.value = numValue;
        animationDurationInput.value = numValue;
        this.settings.animationDuration = numValue;
        this.saveSettings();
      };
      animationDurationSlider.addEventListener('input', (e) => updateDuration(e.target.value));
      animationDurationInput.addEventListener('change', (e) => updateDuration(e.target.value));
    }

    // Float distance
    const floatDistanceSlider = container.querySelector('#float-distance-slider');
    const floatDistanceInput = container.querySelector('#float-distance');
    if (floatDistanceSlider && floatDistanceInput) {
      const updateFloatDistance = (value) => {
        const numValue = Math.max(50, Math.min(300, parseInt(value) || 150));
        floatDistanceSlider.value = numValue;
        floatDistanceInput.value = numValue;
        this.settings.floatDistance = numValue;
        this.saveSettings();
      };
      floatDistanceSlider.addEventListener('input', (e) => updateFloatDistance(e.target.value));
      floatDistanceInput.addEventListener('change', (e) => updateFloatDistance(e.target.value));
    }

    // Font size
    const fontSizeSlider = container.querySelector('#animation-fontsize-slider');
    const fontSizeInput = container.querySelector('#animation-fontsize');
    if (fontSizeSlider && fontSizeInput) {
      const updateFontSize = (value) => {
        const numValue = Math.max(24, Math.min(72, parseInt(value) || 36));
        fontSizeSlider.value = numValue;
        fontSizeInput.value = numValue;
        this.settings.fontSize = numValue;
        this.saveSettings();
      };
      fontSizeSlider.addEventListener('input', (e) => updateFontSize(e.target.value));
      fontSizeInput.addEventListener('change', (e) => updateFontSize(e.target.value));
    }

    // Screen shake
    const screenShakeCheckbox = container.querySelector('#screen-shake');
    if (screenShakeCheckbox) {
      screenShakeCheckbox.addEventListener('change', (e) => {
        this.settings.screenShake = e.target.checked;
        this.saveSettings();
      });
    }

    // Shake intensity
    const shakeIntensitySlider = container.querySelector('#shake-intensity-slider');
    const shakeIntensityInput = container.querySelector('#shake-intensity');
    if (shakeIntensitySlider && shakeIntensityInput) {
      const updateShakeIntensity = (value) => {
        const numValue = Math.max(1, Math.min(10, parseInt(value) || 3));
        shakeIntensitySlider.value = numValue;
        shakeIntensityInput.value = numValue;
        this.settings.shakeIntensity = numValue;
        this.saveSettings();
      };
      shakeIntensitySlider.addEventListener('input', (e) => updateShakeIntensity(e.target.value));
      shakeIntensityInput.addEventListener('change', (e) => updateShakeIntensity(e.target.value));
    }

    // Shake duration
    const shakeDurationSlider = container.querySelector('#shake-duration-slider');
    const shakeDurationInput = container.querySelector('#shake-duration');
    if (shakeDurationSlider && shakeDurationInput) {
      const updateShakeDuration = (value) => {
        const numValue = Math.max(100, Math.min(500, parseInt(value) || 250));
        shakeDurationSlider.value = numValue;
        shakeDurationInput.value = numValue;
        this.settings.shakeDuration = numValue;
        this.saveSettings();
      };
      shakeDurationSlider.addEventListener('input', (e) => updateShakeDuration(e.target.value));
      shakeDurationInput.addEventListener('change', (e) => updateShakeDuration(e.target.value));
    }

    // Show combo
    const showComboCheckbox = container.querySelector('#show-combo');
    if (showComboCheckbox) {
      showComboCheckbox.addEventListener('change', (e) => {
        this.settings.showCombo = e.target.checked;
        this.saveSettings();
      });
    }

    // Max combo
    const maxComboSlider = container.querySelector('#max-combo-slider');
    const maxComboInput = container.querySelector('#max-combo');
    if (maxComboSlider && maxComboInput) {
      const updateMaxCombo = (value) => {
        const numValue = Math.max(10, Math.min(999, parseInt(value) || 999));
        maxComboSlider.value = numValue;
        maxComboInput.value = numValue;
        this.settings.maxCombo = numValue;
        this.saveSettings();
      };
      maxComboSlider.addEventListener('input', (e) => updateMaxCombo(e.target.value));
      maxComboInput.addEventListener('change', (e) => updateMaxCombo(e.target.value));
    }
  }

  /**
   * Attaches event listeners for debug mode toggle
   * @param {HTMLElement} container - Settings panel container
   */
  attachDebugListeners(container) {
    const debugCheckbox = container.querySelector('#debug-mode');
    if (debugCheckbox) {
      debugCheckbox.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        this.updateDebugMode(enabled);

        // Update UI to reflect change
        const checkboxGroup = debugCheckbox.closest('.crit-checkbox-group');
        if (checkboxGroup) {
          checkboxGroup.style.background = enabled
            ? 'rgba(255, 165, 0, 0.1)'
            : 'var(--background-modifier-hover)';
          checkboxGroup.style.border = enabled ? '1px solid rgba(255, 165, 0, 0.3)' : 'transparent';

          const checkboxText = checkboxGroup.querySelector('.crit-checkbox-text');
          if (checkboxText) {
            checkboxText.style.fontWeight = enabled ? '600' : '500';
            checkboxText.style.color = enabled ? 'var(--text-brand)' : 'var(--text-normal)';
          }

          const description = checkboxGroup.querySelector('.crit-form-description strong');
          if (description) {
            description.textContent = enabled
              ? 'WARNING: Currently enabled - check console for logs'
              : 'Currently disabled - no console spam';
            description.style.color = enabled ? 'var(--text-brand)' : 'var(--text-muted)';
          }
        }
      });
    }
  }

  /**
   * Sets up MutationObserver to update settings panel display
   * @param {HTMLElement} container - Settings panel container
   */
  setupSettingsDisplayObserver(container) {
    // This can be used to update display values when settings change externally
    // Currently not needed, but kept for future use
  }
};
