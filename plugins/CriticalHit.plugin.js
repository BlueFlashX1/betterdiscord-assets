/**
 * @name CriticalHit
 * @author BlueFlashX1
 * @description Critical hit system with visual effects and animations
 * @version 3.2.0
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 *
 * Font Credit:
 * <div>Icons made from <a href="https://www.onlinewebfonts.com/icon">svg icons</a>is licensed by CC BY 4.0</div>
 * Font: "Friend or Foe BB" from OnlineWebFonts.com
 *
 * ============================================================================
 * PLUGIN INTEROPERABILITY
 * ============================================================================
 *
 * This plugin provides data and functionality for other BetterDiscord plugins:
 *
 * - SoloLevelingStats: Provides message history, combo data, and font loading
 *   - SoloLevelingStats reads: BdApi.Data.load('CriticalHitAnimation', 'userCombo')
 *   - SoloLevelingStats reads: Message history for critical hit tracking
 *   - SoloLevelingStats uses: getFontsFolderPath() for font loading
 *   - SoloLevelingStats writes: BdApi.Data.save('SoloLevelingStats', 'agilityBonus', ...)
 *   - SoloLevelingStats writes: BdApi.Data.save('SoloLevelingStats', 'luckBonus', ...)
 *
 * The plugin is designed to be standalone but provides optional integration points
 * for plugins that want to enhance their functionality with critical hit data.
 *
 * ============================================================================
 *
 * @changelog v3.2.0 (2025-12-06) - ADVANCED BETTERDISCORD INTEGRATION
 * ADVANCED FEATURES:
 * - Added MessageStore access for receiving messages (complements sendMessage patch)
 * - Enhanced React fiber traversal with better error handling
 * - Improved webpack module management and cleanup
 * - Better compatibility with multiple React fiber key patterns
 *
 * RELIABILITY:
 * - More reliable message detection (MessageStore patches)
 * - Better error handling in React fiber traversal (prevents crashes)
 * - Enhanced error recovery in fiber traversal
 * - Graceful fallbacks if webpack unavailable
 *
 * @changelog v3.1.0 (2025-12-06)
 * - NEW FEATURES: Added Friend or Foe BB font for Solo Leveling theme
 * - NEW FEATURES: Added Metal Mania font for animation text
 * - NEW FEATURES: Added screen flash effect option
 * - NEW FEATURES: Added useLocalFonts setting for font management
 * - PERFORMANCE: Optimized batch processing (reduced batch size, increased delay)
 * - PERFORMANCE: Added observer throttling to prevent excessive firing
 * - IMPROVEMENT: Enhanced React fiber traversal for message ID extraction
 * - IMPROVEMENT: Improved message ID validation (excludes channel IDs)
 * - IMPROVEMENT: Better content hash calculation (supports null author)
 * - FIX: Comprehensive error fixes and quest popup auto-close
 * - REFACTOR: Reorganized helper functions to Section 2, removed duplicates
 * - REFACTOR: Continued optimization with functional programming patterns
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
      critFont: "'Friend or Foe BB', sans-serif", // Font for message gradient text (Solo Leveling theme - Friend or Foe BB)
      animationFont: 'Metal Mania', // Font name for floating animation text (Critical Hit animation - Metal Mania)
      useLocalFonts: true, // Use local font files (Friend or Foe BB requires local files, auto-enabled)
      critAnimation: true, // Add a subtle animation
      critGlow: true, // Add a glow effect
      // Filter settings
      filterReplies: true, // Don't apply crits to reply messages
      filterSystemMessages: true, // Don't apply crits to system messages (joins, leaves, etc.)
      filterBotMessages: false, // Don't apply crit to bot messages (optional)
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
      screenFlash: true, // Enable screen flash effect
      cooldown: 500,
      showCombo: true,
      maxCombo: 999,
      ownUserId: null,
      // Debug settings
      debugMode: true, // Debug logging (can be toggled in settings) - ENABLED FOR DEBUGGING
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
    this.currentGuildId = null; // Track current guild ID (for accuracy across guilds)
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

    // Webpack modules (for advanced Discord integration)
    this.webpackModules = {
      MessageStore: null,
      UserStore: null,
      MessageActions: null,
    };
    this.messageStorePatch = null; // Track MessageStore patch for cleanup
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
      enabled: true, // ENABLED FOR DEBUGGING - Will be synced with settings in loadSettings()
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

    // Performance optimization: Message processing batching
    this._pendingNodes = new Set(); // Queue of nodes waiting to be processed
    this._processingBatch = false; // Flag to prevent concurrent batch processing
    this._batchProcessingTimeout = null; // Timeout for delayed batch processing
    this._maxBatchSize = 10; // Maximum nodes to process per batch (reduced from 50 to prevent blocking)
    this._batchDelayMs = 50; // Delay before processing batch (increased from 16ms to reduce CPU usage)
    this._observerThrottleTimeout = null; // Throttle observer callback to prevent excessive firing
    this._lastObserverCall = 0; // Track last observer call time
    this._observerThrottleMs = 100; // Minimum 100ms between observer processing

    // Performance optimization: Observer limits
    this._maxStyleObservers = 50; // Maximum gradient monitoring observers
    this._observerCleanupInterval = null; // Interval to clean up old observers

    // Performance optimization: History save throttling
    this._saveHistoryThrottle = null; // Timeout for throttled saves
    this._saveHistoryPending = false; // Flag for pending save
    this._lastSaveTime = 0; // Last save timestamp
    this._minSaveInterval = 1000; // Minimum 1 second between saves
    this._maxSaveInterval = 5000; // Maximum 5 seconds between saves (force save)
    this._pendingCritSaves = 0; // Count of pending crit saves

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
   * Alias for extractPureDiscordId() for backward compatibility
   * @param {string} id - ID that may contain Discord ID
   * @returns {string|null} Pure Discord ID or null
   */
  extractDiscordId(id) {
    return this.extractPureDiscordId(id);
  }

  /**
   * Validates an ID and ensures it's not a channel ID
   * @param {string} id - ID to validate
   * @param {string|null} currentChannelId - Current channel ID to exclude
   * @returns {boolean} True if ID is valid and not a channel ID
   */
  isValidMessageId(id, currentChannelId) {
    return id && (!currentChannelId || id !== currentChannelId);
  }

  /**
   * Unified content hash calculation (replaces getContentHash and calculateContentHashForRestoration)
   * @param {string|null} author - Author username (can be null for content-only hash)
   * @param {string} content - Message content
   * @param {string|number|null} timestamp - Optional timestamp
   * @returns {string|null} Content hash or null if invalid input
   */
  calculateContentHash(author, content, timestamp = null) {
    if (!content) return null;
    // Allow null author for content-only hashes
    const authorPart = author || 'unknown';
    const hashContent = `${authorPart}:${content.substring(0, 100)}:${timestamp || ''}`;
    const hash = Array.from(hashContent).reduce((acc, char) => {
      const charCode = char.charCodeAt(0);
      acc = (acc << 5) - acc + charCode;
      return acc & acc;
    }, 0);
    return `hash_${Math.abs(hash)}`;
  }

  /**
   * Alias for calculateContentHash() for backward compatibility
   * @param {string} content - Message content
   * @param {string} author - Author username (optional)
   * @param {string|number|null} timestamp - Optional timestamp
   * @returns {string|null} Content hash or null
   */
  createContentHash(content, author = null, timestamp = null) {
    return this.calculateContentHash(author, content, timestamp);
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
    if (!element) return null;

    try {
      // FUNCTIONAL: Use .find() instead of manual loop
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
   * Enhanced with better error handling and multiple traversal strategies
   * @param {Object} fiber - React fiber to start from
   * @param {Function} getter - Function to extract value from fiber
   * @param {number} maxDepth - Maximum traversal depth
   * @returns {any} Found value or null
   */
  traverseFiber(fiber, getter, maxDepth = 50) {
    if (!fiber) return null;

    try {
      // FUNCTIONAL: Fiber traversal (while loop for tree traversal)
      let depth = 0;
      while (fiber && depth < maxDepth) {
        try {
          const value = getter(fiber);
          if (value !== null && value !== undefined) return value;
        } catch (getterError) {
          // Continue traversal even if getter throws
          this.debugError('TRAVERSE_FIBER_GETTER', getterError, { depth });
        }

        // Try multiple traversal paths for better compatibility
        fiber = fiber.return || fiber._owner || fiber.return;
        depth++;
      }
    } catch (error) {
      this.debugError('TRAVERSE_FIBER', error, { maxDepth });
    }

    return null;
  }

  // ============================================================================
  // MESSAGE ID & AUTHOR EXTRACTION
  // ============================================================================

  /**
   * Extracts message ID from a message element using multiple methods
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {Object} [debugContext]
   * @returns {string|null} messageId
   */
  getMessageIdFromElement(messageElement, debugContext = {}) {
    let messageId = null;
    let extractionMethod = null;
    const currentChannelId = this.currentChannelId || null;

    // Method 1: React fiber traversal (MOST RELIABLE - gets actual message ID from React props)
    try {
      const fiber = this.getReactFiber(messageElement);

      if (fiber) {
        let currentFiber = fiber;
        for (let i = 0; i < 100 && currentFiber; i++) {
          // Try message object first (most reliable)
          const messageObj =
            currentFiber.memoizedProps?.message ||
            currentFiber.memoizedState?.message ||
            currentFiber.memoizedProps?.messageProps?.message ||
            currentFiber.memoizedProps?.messageProps ||
            currentFiber.stateNode?.props?.message ||
            currentFiber.stateNode?.message;

          if (messageObj?.id) {
            const msgIdStr = String(messageObj.id).trim();
            if (
              this.isValidDiscordId(msgIdStr) &&
              this.isValidMessageId(msgIdStr, currentChannelId)
            ) {
              messageId = msgIdStr;
              extractionMethod = 'react_fiber_message_obj';
              break;
            }
          }

          // Try direct message ID from various props
          const msgId =
            currentFiber.memoizedProps?.message?.id ||
            currentFiber.memoizedState?.message?.id ||
            currentFiber.memoizedProps?.messageId ||
            currentFiber.memoizedProps?.id ||
            currentFiber.memoizedState?.id ||
            currentFiber.stateNode?.props?.message?.id ||
            currentFiber.stateNode?.props?.id ||
            currentFiber.stateNode?.id;

          if (msgId) {
            const idStr = String(msgId).trim();
            if (this.isValidDiscordId(idStr) && this.isValidMessageId(idStr, currentChannelId)) {
              messageId = idStr;
              extractionMethod = 'react_fiber_message_id';
              break;
            }
            const extracted = this.extractPureDiscordId(idStr);
            if (extracted && this.isValidMessageId(extracted, currentChannelId)) {
              messageId = extracted;
              extractionMethod = 'react_fiber_extracted';
              break;
            }
          }
          currentFiber = currentFiber.return;
        }
      }
    } catch (e) {
      // Silently continue to other methods
    }

    // Method 2: data-message-id attribute (more specific than data-list-item-id)
    if (!messageId) {
      const dataMsgId =
        messageElement.getAttribute('data-message-id') ||
        messageElement.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
        messageElement.closest('[data-message-id]')?.getAttribute('data-message-id');
      if (dataMsgId) {
        const idStr = String(dataMsgId).trim();
        if (this.isValidDiscordId(idStr) && this.isValidMessageId(idStr, currentChannelId)) {
          messageId = idStr;
          extractionMethod = 'data-message-id';
        } else {
          const extracted = this.extractPureDiscordId(idStr);
          if (extracted && this.isValidMessageId(extracted, currentChannelId)) {
            messageId = extracted;
            extractionMethod = 'data-message-id_extracted';
          }
        }
      }
    }

    // Method 3: data-list-item-id attribute (WARNING: Can be channel ID, so validate!)
    if (!messageId) {
      const listItemId =
        messageElement.getAttribute('data-list-item-id') ||
        messageElement.closest('[data-list-item-id]')?.getAttribute('data-list-item-id');

      if (listItemId) {
        const idStr = String(listItemId).trim();
        const extractedId = this.isValidDiscordId(idStr) ? idStr : this.extractPureDiscordId(idStr);
        if (extractedId && this.isValidMessageId(extractedId, currentChannelId)) {
          messageId = extractedId;
          extractionMethod = this.isValidDiscordId(idStr)
            ? 'data-list-item-id_pure'
            : 'data-list-item-id_extracted';
        }
      }
    }

    // Method 4: Check for id attribute - extract pure message ID from composite formats
    // Be careful - id attributes often contain channel IDs, so prioritize message ID
    if (!messageId) {
      const idAttr =
        messageElement.getAttribute('id') || messageElement.closest('[id]')?.getAttribute('id');
      if (idAttr) {
        const idStr = String(idAttr).trim();
        const extractedId = this.isValidDiscordId(idStr) ? idStr : this.extractPureDiscordId(idStr);
        if (extractedId && this.isValidMessageId(extractedId, currentChannelId)) {
          messageId = extractedId;
          extractionMethod = this.isValidDiscordId(idStr) ? 'id_attr_pure' : 'id_attr_extracted';
        }
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
          ? this.calculateContentHash(author, content, timestamp)
          : this.calculateContentHash(null, content, null);
        extractionMethod = author ? 'content_hash' : 'content_only_hash';
      }
    }

    // Validate message ID format and warn if suspicious
    if (messageId) {
      const isValidFormat = this.isValidDiscordId(messageId);
      const isContentHash =
        extractionMethod === 'content_hash' || extractionMethod === 'content_only_hash';

      // Content hashes are expected to be short - don't mark them as suspicious
      // Only mark as suspicious if it's NOT a content hash AND length is wrong
      const isSuspicious = !isContentHash && (messageId.length < 17 || messageId.length > 19);

      // Log suspicious/problematic IDs, but only log content hashes in verbose mode
      // Content hashes are expected fallbacks and don't need normal logging
      const shouldLog =
        debugContext?.verbose ||
        (debugContext && (isSuspicious || (!isContentHash && !isValidFormat))); // Only log non-hash invalid IDs
      if (shouldLog) {
        this.debugLog('GET_MESSAGE_ID', 'Message ID extracted', {
          messageId: messageId,
          messageIdLength: messageId.length,
          method: extractionMethod,
          isPureDiscordId: isValidFormat,
          isSuspicious: isSuspicious,
          isContentHash: isContentHash,
          phase: debugContext.phase,
          elementId: messageElement.getAttribute('id'),
          dataMessageId: messageElement.getAttribute('data-message-id'),
        });
      }

      // Warn only for truly suspicious cases (not content hashes, which are intentional fallbacks)
      // Only warn if debug mode is enabled to reduce console noise
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
   * Extracts author/user ID from a message element
   * Uses React fiber traversal, DOM attributes, and element queries as fallbacks
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {string|null} Author ID or null if not found
   */
  getAuthorId(messageElement) {
    try {
      // Method 1: Try React props (Discord stores message data in React)
      const fiber = this.getReactFiber(messageElement);

      if (fiber) {
        // Use traverseFiber with a getter function to find author ID
        const authorId = this.traverseFiber(
          fiber,
          (f) =>
            f.memoizedProps?.message?.author?.id ||
            f.memoizedState?.message?.author?.id ||
            f.memoizedProps?.message?.authorId ||
            f.memoizedProps?.author?.id ||
            f.memoizedState?.author?.id ||
            f.memoizedProps?.messageAuthor?.id ||
            f.memoizedProps?.user?.id ||
            f.memoizedState?.user?.id,
          30
        );

        if (authorId && this.isValidDiscordId(authorId)) {
          return String(authorId).trim();
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

  // ============================================================================
  // MESSAGE ID & AUTHOR EXTRACTION (Aliases & Wrappers)
  // ============================================================================

  /**
   * Extracts message ID from a message element
   * Alias for getMessageIdFromElement() for consistency
   * @param {HTMLElement} element - The message DOM element
   * @param {Object} [debugContext] - Optional debug context
   * @returns {string|null} Message ID or null if not found
   */
  getMessageIdentifier(element, debugContext = {}) {
    // Use the comprehensive getMessageIdFromElement() method
    return this.getMessageIdFromElement(element, debugContext);
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

  // ============================================================================
  // STYLE HELPERS
  // ============================================================================

  /**
   * Default properties to exclude from header elements
   * @type {Array<string>}
   */
  get DEFAULT_EXCLUDED_PROPERTIES() {
    return [
      'background',
      'background-image',
      '-webkit-background-clip',
      'background-clip',
      '-webkit-text-fill-color',
      'color',
    ];
  }

  /**
   * Creates gradient style object for text gradient effect
   * @param {string} gradientColors - Gradient color string
   * @returns {Object} Style object with gradient properties
   */
  createGradientStyles(gradientColors) {
    return {
      'background-image': gradientColors,
      background: gradientColors,
      '-webkit-background-clip': 'text',
      'background-clip': 'text',
      '-webkit-text-fill-color': 'transparent',
      color: 'transparent',
      display: 'inline-block',
    };
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
  excludeHeaderElements(messageElement, properties = null) {
    if (!messageElement) return;
    const propsToExclude = properties || this.DEFAULT_EXCLUDED_PROPERTIES;
    const usernameElements = messageElement.querySelectorAll(
      '[class*="username"], [class*="timestamp"], [class*="author"]'
    );
    usernameElements.forEach((el) => {
      propsToExclude.forEach((prop) => {
        el.style.setProperty(prop, 'unset', 'important');
      });
    });
  }

  /**
   * Verifies if gradient styles are properly applied
   * @param {HTMLElement} content - Content element to check
   * @returns {boolean} True if gradient is properly applied
   */
  verifyGradientStyles(content) {
    if (!content) return false;
    const computed = window.getComputedStyle(content);
    const hasGradient = computed?.backgroundImage?.includes('gradient');
    const hasClip =
      computed?.webkitBackgroundClip === 'text' || computed?.backgroundClip === 'text';
    return hasGradient && hasClip;
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

    // Apply gradient styles using helper
    const gradientStyles = this.createGradientStyles(gradientColors);
    this.applyStyles(content, gradientStyles);

    // Force reflow to ensure styles are computed
    void content.offsetHeight;

    // Verify and reapply if needed
    if (!this.verifyGradientStyles(content)) {
      this.applyStyles(content, gradientStyles);
      void content.offsetHeight;
    }

    this.excludeHeaderElements(messageElement);
    return this.verifyGradientStyles(content);
  }

  // ============================================================================
  // MESSAGE HISTORY & DOM HELPERS
  // ============================================================================

  /**
   * Header-related class name patterns to identify header elements
   * @type {Array<string>}
   */
  get HEADER_CLASS_PATTERNS() {
    return [
      'header',
      'username',
      'timestamp',
      'author',
      'topSection',
      'messageHeader',
      'messageGroup',
      'messageGroupWrapper',
    ];
  }

  /**
   * CSS selectors for header elements
   * @type {Array<string>}
   */
  get HEADER_SELECTORS() {
    return this.HEADER_CLASS_PATTERNS.map((pattern) => `[class*="${pattern}"]`);
  }

  /**
   * Checks if a message ID exists in CriticalHit plugin's message history
   * @param {string} messageId - The message ID to check
   * @returns {boolean} True if message is in history
   */
  isMessageInHistory(messageId) {
    if (!messageId) return false;
    try {
      const history = BdApi.Data.load('CriticalHit', 'messageHistory');
      if (!Array.isArray(history)) return false;
      return history.some((entry) => String(entry.messageId) === String(messageId));
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if an element is in a header/username/timestamp area
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if element is in header area
   */
  isInHeaderArea(element) {
    if (!element) return true;

    // Check element's own classes first (fastest check)
    const classes = Array.from(element.classList || []);
    const hasHeaderClass = classes.some((c) =>
      this.HEADER_CLASS_PATTERNS.some((pattern) => c.includes(pattern))
    );

    if (hasHeaderClass) {
      this.debug?.enabled &&
        this.debugLog('IS_IN_HEADER_AREA', 'Element has header class', {
          elementTag: element.tagName,
          classes: classes,
        });
      return true;
    }

    // Check if element contains username/timestamp/author elements as children
    const hasUsernameChild = element.querySelector('[class*="username"]') !== null;
    const hasTimestampChild = element.querySelector('[class*="timestamp"]') !== null;
    const hasAuthorChild = element.querySelector('[class*="author"]') !== null;

    if (hasUsernameChild || hasTimestampChild || hasAuthorChild) {
      this.debug?.enabled &&
        this.debugLog('IS_IN_HEADER_AREA', 'Element contains username/timestamp/author child', {
          elementTag: element.tagName,
          hasUsernameChild,
          hasTimestampChild,
          hasAuthorChild,
        });
      return true;
    }

    // Check parent chain using selectors
    const headerParent = this.HEADER_SELECTORS.map((selector) => element.closest(selector)).find(
      (parent) => parent !== null
    );

    if (headerParent) {
      this.debug?.enabled &&
        this.debugLog('IS_IN_HEADER_AREA', 'Element is in header area', {
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
        this.debugLog('IS_IN_HEADER_AREA', 'Element text looks like timestamp/username', {
          elementTag: element.tagName,
          text: text,
        });
      return true;
    }

    return false;
  }

  /**
   * CSS selectors for message content elements (in priority order)
   * @type {Array<string>}
   */
  get MESSAGE_CONTENT_SELECTORS() {
    return ['[class*="messageContent"]', '[class*="markup"]', '[class*="textContainer"]'];
  }

  /**
   * Finds the message content element (excluding header/username/timestamp areas)
   * @param {HTMLElement} messageElement - Parent message element
   * @returns {HTMLElement|null} Content element or null if not found
   */
  findMessageContentElement(messageElement) {
    if (!messageElement) return null;

    // FUNCTIONAL: Try selectors in priority order
    const matchingElement = this.MESSAGE_CONTENT_SELECTORS.map((selector) =>
      messageElement.querySelector(selector)
    ).find((element) => element && !this.isInHeaderArea(element));

    if (matchingElement) return matchingElement;

    // FUNCTIONAL: Last resort - find divs with content
    return (
      Array.from(messageElement.querySelectorAll('div')).find(
        (div) => !this.isInHeaderArea(div) && div.textContent?.trim().length > 0
      ) || null
    );
  }

  /**
   * Extracts author/user ID from a message element
   * Uses React fiber traversal, DOM attributes, and element queries as fallbacks
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {string|null} Author ID or null if not found
   */

  /**
   * Verifies if gradient styling is properly applied to a content element
   * Checks both inline styles and computed styles for gradient background and text clip
   * @param {HTMLElement} contentElement - The content DOM element to check
   * @returns {Object} Object with hasGradient, hasWebkitClip, hasGradientInStyle, and isValid flags
   */
  verifyGradientApplied(contentElement) {
    if (!contentElement) {
      return {
        hasGradient: false,
        hasWebkitClip: false,
        hasGradientInStyle: false,
        isValid: false,
      };
    }

    const computedStyles = window.getComputedStyle(contentElement);
    const hasGradientInStyle = contentElement?.style?.backgroundImage?.includes('gradient');
    const hasGradientInComputed = computedStyles?.backgroundImage?.includes('gradient');
    const hasWebkitClip =
      computedStyles?.webkitBackgroundClip === 'text' || computedStyles?.backgroundClip === 'text';

    // Use verifyGradientStyles for consistency (returns boolean)
    const isValid = this.verifyGradientStyles(contentElement);

    return {
      hasGradient: hasGradientInComputed,
      hasWebkitClip: hasWebkitClip,
      hasGradientInStyle: hasGradientInStyle,
      isValid: isValid,
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

    // CRITICAL FIX: Only use real Discord IDs for querying, not hash IDs
    // If messageId is a hash, use fallback element instead
    if (messageId.startsWith('hash_')) {
      this.debugLog('REQUERY_MESSAGE_ELEMENT', 'Skipping requery for hash ID, using fallback', {
        messageId,
      });
      return fallbackElement;
    }

    // Try direct query first (fastest)
    const directMatch = document.querySelector(`[data-message-id="${messageId}"]`);
    if (directMatch) return directMatch;

    // Fallback: Search all message elements, but only match exact Discord IDs
    const foundElement = Array.from(document.querySelectorAll('[class*="message"]')).find((el) => {
      const id = this.getMessageIdentifier(el);
      // Only match if it's a real Discord ID and matches exactly
      if (this.isValidDiscordId(id) && id === messageId) {
        return true;
      }
      // Also check data attributes directly
      const dataId = el.getAttribute('data-message-id');
      if (dataId === messageId) {
        return true;
      }
      return false;
    });

    return foundElement || fallbackElement;
  }

  // ============================================================================
  // CHANNEL RESTORATION HELPERS
  // ============================================================================

  /**
   * Regex pattern for extracting channel ID from Discord URL
   * Matches: /channels/{guildId}/{channelId} or /channels/@me/{channelId}
   * @type {RegExp}
   */
  get CHANNEL_URL_PATTERN() {
    return /channels\/\d+\/(\d+)/;
  }

  /**
   * Regex pattern for extracting guild and channel IDs from Discord URL
   * Matches: /channels/{guildId}/{channelId}
   * @type {RegExp}
   */
  get GUILD_CHANNEL_URL_PATTERN() {
    return /channels\/(\d+)\/(\d+)/;
  }

  /**
   * Selectors for finding message elements in DOM
   * @type {Array<string>}
   */
  get MESSAGE_SELECTORS() {
    return ['[class*="message"]', '[data-list-item-id]', '[data-message-id]'];
  }

  /**
   * Extracts channel ID from Discord URL
   * @param {string} url - URL to extract from (defaults to current location)
   * @returns {string|null} Channel ID or null if not found
   */
  extractChannelIdFromURL(url = null) {
    try {
      const targetUrl = url || window.location.href;
      const urlMatch = targetUrl.match(this.CHANNEL_URL_PATTERN);
      return urlMatch?.[1] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extracts guild ID from Discord URL
   * @param {string} url - URL to extract from (defaults to current location)
   * @returns {string|null} Guild ID or null if not found (e.g., in DMs)
   */
  extractGuildIdFromURL(url = null) {
    try {
      const targetUrl = url || window.location.href;
      const urlMatch = targetUrl.match(this.GUILD_CHANNEL_URL_PATTERN);
      // DMs use /channels/@me/{channelId} - no guild ID
      return urlMatch?.[1] && urlMatch[1] !== '@me' ? urlMatch[1] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Gets the current Discord channel ID from URL or DOM
   * @returns {string|null} Channel ID or null if not found
   */
  _getCurrentChannelId() {
    try {
      // Method 1: Extract from URL (most reliable)
      const channelIdFromURL = this.extractChannelIdFromURL();
      if (channelIdFromURL) return channelIdFromURL;

      // Method 2: Extract from message elements in DOM
      const messageElement = document.querySelector('[class*="message"]');
      const channelIdAttr = messageElement?.getAttribute('data-channel-id');
      return channelIdAttr || null;
    } catch (error) {
      this.debugError('GET_CURRENT_CHANNEL_ID', error);
      return null;
    }
  }

  /**
   * Gets the current Discord guild ID from URL
   * @returns {string|null} Guild ID or null if not found (e.g., in DMs)
   */
  _getCurrentGuildId() {
    try {
      return this.extractGuildIdFromURL();
    } catch (error) {
      this.debugError('GET_CURRENT_GUILD_ID', error);
      return null;
    }
  }

  /**
   * Extracts channel ID from message container (fallback method)
   * @param {HTMLElement|null} container - Message container element
   * @returns {string|null} Channel ID or null
   */
  _extractChannelIdFromContainer(container) {
    if (!container) return null;
    const firstMessage = container.querySelector('[class*="message"]');
    return (
      firstMessage?.getAttribute('data-channel-id') ||
      firstMessage?.closest('[data-channel-id]')?.getAttribute('data-channel-id') ||
      null
    );
  }

  /**
   * Gets message ID from element using multiple methods
   * @param {HTMLElement} element - Element to extract ID from
   * @returns {string|null} Message ID or null
   */
  _getMessageIdFromElement(element) {
    return (
      this.getMessageIdentifier(element) ||
      element.getAttribute('data-message-id') ||
      element.getAttribute('data-list-item-id') ||
      null
    );
  }

  /**
   * Finds all message elements in the current DOM
   * Used for restoration of crit styles when channel loads
   * @returns {Array<HTMLElement>} Array of unique message elements
   */
  _findMessagesInDOM() {
    try {
      const allMessages = [];
      const seenIds = new Set();

      // FUNCTIONAL: Use flatMap to flatten all selectors into single array
      const elements = this.MESSAGE_SELECTORS.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector))
      );

      // FUNCTIONAL: Use forEach to process elements
      elements.forEach((el) => {
        const msgId = this._getMessageIdFromElement(el);

        if (msgId && !seenIds.has(msgId)) {
          seenIds.add(msgId);
          allMessages.push(el);
        } else if (!msgId && !allMessages.includes(el)) {
          // Include elements without IDs but avoid duplicates
          allMessages.push(el);
        }
      });

      // Remove duplicates by element reference
      return Array.from(new Set(allMessages));
    } catch (error) {
      this.debugError('FIND_MESSAGES_IN_DOM', error);
      return [];
    }
  }

  /**
   * Delay before re-initializing observer after channel change (ms)
   * @type {number}
   */
  get CHANNEL_CHANGE_DELAY() {
    return 500;
  }

  /**
   * Handles channel navigation changes
   * Saves history, clears session tracking, and re-initializes observer
   * @param {boolean} verbose - Whether to log verbose debug info
   */
  _handleChannelChange(verbose = false) {
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

    setTimeout(() => {
      this.startObserving();
    }, this.CHANNEL_CHANGE_DELAY);
  }

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
        // Only log in verbose mode - channel changes are frequent
        this.debug?.verbose && console.log('CriticalHit: Channel changed, re-initializing...');
        this._handleChannelChange();
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

    const handleNavigation = () => this._handleChannelChange(true);

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
  // Handles critical hit animation creation, positioning, and duplicate detection

  // ----------------------------------------------------------------------------
  // Animation Constants
  // ----------------------------------------------------------------------------

  /**
   * Position tolerance for duplicate detection (pixels)
   * @type {number}
   */
  get ANIMATION_POSITION_TOLERANCE() {
    return 100;
  }

  /**
   * Time tolerance for duplicate detection (milliseconds)
   * @type {number}
   */
  get ANIMATION_TIME_TOLERANCE() {
    return 1000;
  }

  /**
   * Padding from window edges for animation spawn (pixels)
   * @type {number}
   */
  get ANIMATION_SPAWN_PADDING() {
    return 150;
  }

  /**
   * Maximum horizontal offset variation for spawn position (pixels)
   * @type {number}
   */
  get ANIMATION_HORIZONTAL_VARIATION() {
    return 300;
  }

  /**
   * Maximum vertical offset variation for spawn position (pixels)
   * @type {number}
   */
  get ANIMATION_VERTICAL_VARIATION() {
    return 200;
  }

  /**
   * Base font size for animation text (rem)
   * @type {number}
   */
  get ANIMATION_BASE_FONT_SIZE() {
    return 3.5;
  }

  /**
   * Maximum combo level for size scaling
   * @type {number}
   */
  get ANIMATION_MAX_COMBO_SCALE() {
    return 5;
  }

  /**
   * Size increase per combo level
   * @type {number}
   */
  get ANIMATION_COMBO_SIZE_INCREMENT() {
    return 0.07;
  }

  // ----------------------------------------------------------------------------
  // Duplicate Detection
  // ----------------------------------------------------------------------------

  /**
   * Calculates the center position of an element from its bounding rect
   * @param {DOMRect} rect - Element's bounding rectangle
   * @returns {Object} Center position with x and y coordinates
   */
  _getElementCenterPosition(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  /**
   * Calculates Manhattan distance between two positions
   * @param {Object} pos1 - First position with x and y
   * @param {Object} pos2 - Second position with x and y
   * @returns {number} Manhattan distance
   */
  _calculatePositionDistance(pos1, pos2) {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
  }

  /**
   * Checks if an active animation matches position and time criteria
   * @param {HTMLElement} activeEl - Active animation element
   * @param {Object} targetPosition - Target position to check against
   * @param {number} currentTime - Current timestamp
   * @returns {boolean} True if matches duplicate criteria
   */
  _isAnimationDuplicate(activeEl, targetPosition, currentTime) {
    if (!activeEl.parentNode) return false;

    try {
      const activeRect = activeEl.getBoundingClientRect();
      const activePosition = this._getElementCenterPosition(activeRect);
      const positionDiff = this._calculatePositionDistance(activePosition, targetPosition);
      const timeDiff = currentTime - (activeEl._chaCreatedTime || 0);

      return (
        positionDiff < this.ANIMATION_POSITION_TOLERANCE && timeDiff < this.ANIMATION_TIME_TOLERANCE
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks for duplicate animations already in the DOM
   * Prevents multiple animations for the same message
   * @param {HTMLElement} container - Animation container element
   * @param {string} messageId - The message ID
   * @param {Object} position - Position object with x and y coordinates
   * @returns {boolean} True if duplicate found
   */
  hasDuplicateInDOM(container, messageId, position) {
    if (!container || !position) return false;

    // Method 1: Check by message ID (fastest)
    if (messageId) {
      const existingCount = container.querySelectorAll(
        `[data-cha-message-id="${messageId}"]`
      ).length;
      if (existingCount > 0) return true;
    }

    // Method 2: Position-based check for null messageId
    const now = Date.now();
    return Array.from(this.activeAnimations).some((activeEl) =>
      this._isAnimationDuplicate(activeEl, position, now)
    );
  }

  // ----------------------------------------------------------------------------
  // Position Calculation
  // ----------------------------------------------------------------------------

  /**
   * Gets default center position for fallback
   * @returns {Object} Center position of window
   */
  _getDefaultCenterPosition() {
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
  }

  /**
   * Validates position object structure
   * @param {Object} position - Position to validate
   * @returns {boolean} True if valid position object
   */
  _isValidPosition(position) {
    return (
      position &&
      typeof position.x === 'number' &&
      typeof position.y === 'number' &&
      !isNaN(position.x) &&
      !isNaN(position.y)
    );
  }

  /**
   * Clamps a value between min and max bounds
   * @param {number} value - Value to clamp
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} Clamped value
   */
  _clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Gets a random spawn position within reasonable window bounds
   * Keeps animation visible but adds dynamic variation
   * @param {Object} basePosition - Base position object with x and y
   * @returns {Object} Random position within window bounds
   */
  getRandomSpawnPosition(basePosition) {
    if (!this._isValidPosition(basePosition)) {
      return this._getDefaultCenterPosition();
    }

    const padding = this.ANIMATION_SPAWN_PADDING;
    const randomOffsetX = (Math.random() - 0.5) * this.ANIMATION_HORIZONTAL_VARIATION;
    const randomOffsetY = (Math.random() - 0.5) * this.ANIMATION_VERTICAL_VARIATION;

    const x = this._clampValue(
      basePosition.x + randomOffsetX,
      padding,
      window.innerWidth - padding
    );
    const y = this._clampValue(
      basePosition.y + randomOffsetY,
      padding,
      window.innerHeight - padding
    );

    return { x, y };
  }

  // ----------------------------------------------------------------------------
  // Combo Calculation
  // ----------------------------------------------------------------------------

  /**
   * Calculates combo size multiplier based on combo count
   * @param {number} combo - Combo count
   * @returns {number} Size multiplier
   */
  calculateComboSize(combo) {
    if (!combo || combo <= 1) return 1.0;
    const cappedCombo = Math.min(combo, this.ANIMATION_MAX_COMBO_SCALE);
    return 1.0 + (cappedCombo - 1) * this.ANIMATION_COMBO_SIZE_INCREMENT;
  }

  /**
   * Formats combo text for display
   * @param {number} combo - Combo count
   * @returns {string} Formatted combo text (e.g., " X2")
   */
  formatComboText(combo) {
    return combo > 1 ? ` X${combo}` : '';
  }

  // ----------------------------------------------------------------------------
  // Animation Element Creation
  // ----------------------------------------------------------------------------

  /**
   * Creates the base animation text element with class and attributes
   * @param {string} messageId - Message ID for duplicate detection
   * @returns {HTMLElement} Base text element
   */
  _createBaseAnimationElement(messageId) {
    const textElement = document.createElement('div');
    textElement.className = 'cha-critical-hit-text';

    if (messageId) {
      textElement.setAttribute('data-cha-message-id', messageId);
    }

    // Store creation time for duplicate detection
    textElement._chaCreatedTime = Date.now();

    return textElement;
  }

  /**
   * Sets text content for animation element
   * @param {HTMLElement} element - Animation element
   * @param {number} combo - Combo count
   */
  _setAnimationText(element, combo) {
    const showCombo = this.settings?.showCombo !== false;
    const comboText = showCombo && combo > 1 ? this.formatComboText(combo) : '';
    element.textContent = `CRITICAL HIT!${comboText}`;
  }

  /**
   * Applies font size styling based on combo
   * @param {HTMLElement} element - Animation element
   * @param {number} combo - Combo count
   */
  _applyComboFontSize(element, combo) {
    if (combo > 1) {
      const comboSize = this.calculateComboSize(combo);
      const fontSize = `${this.ANIMATION_BASE_FONT_SIZE * comboSize}rem`;
      this.applyStyles(element, { 'font-size': fontSize });
    }
  }

  /**
   * Applies position styling to animation element
   * @param {HTMLElement} element - Animation element
   * @param {Object} position - Position object with x and y
   */
  _applyAnimationPosition(element, position) {
    if (!this._isValidPosition(position)) return;

    const spawnPosition = this.getRandomSpawnPosition(position);
    this.applyStyles(element, {
      position: 'absolute',
      left: `${spawnPosition.x}px`,
      top: `${spawnPosition.y}px`,
      transform: 'translate(-50%, -50%)',
    });
  }

  /**
   * Creates and configures the critical hit animation element
   * Centralizes animation element creation for consistency
   * @param {string} messageId - Message ID
   * @param {number} combo - Combo count
   * @param {Object} position - Position object with x and y
   * @returns {HTMLElement} Configured animation element
   */
  createAnimationElement(messageId, combo, position) {
    const textElement = this._createBaseAnimationElement(messageId);
    this._setAnimationText(textElement, combo);
    this._applyComboFontSize(textElement, combo);
    this._applyAnimationPosition(textElement, position);

    return textElement;
  }
  // ============================================================================

  // ============================================================================
  // MESSAGE HISTORY MANAGEMENT
  // ============================================================================
  // Handles message history storage, trimming, saving, loading, and restoration

  // ----------------------------------------------------------------------------
  // History Trimming
  // ----------------------------------------------------------------------------

  /**
   * Smart history trimming with crit prioritization
   * Prioritizes keeping crits over non-crits, enforces per-channel limits
   */
  _trimHistoryIfNeeded() {
    // Early return if within limits
    if (this.messageHistory.length <= this.maxHistorySize) {
      this._trimPerChannelHistory();
      return;
    }

    // Separate and prioritize crits
    const crits = this.messageHistory.filter((entry) => entry.isCrit);
    const nonCrits = this.messageHistory.filter((entry) => !entry.isCrit);
    const critsToKeep = crits.slice(-Math.min(crits.length, this.maxCritHistory));
    const remainingSlots = this.maxHistorySize - critsToKeep.length;
    const nonCritsToKeep = nonCrits.slice(-Math.max(0, remainingSlots));

    // Combine and sort chronologically
    this.messageHistory = [...critsToKeep, ...nonCritsToKeep]
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-this.maxHistorySize);

    // Invalidate cache
    this._cachedCritHistory = null;
    this._trimPerChannelHistory();
  }

  /**
   * Groups message history entries by channel ID
   * @returns {Object} Object mapping channel IDs to arrays of {entry, index}
   */
  _groupHistoryByChannel() {
    return this.messageHistory.reduce((acc, entry, index) => {
      const channelId = entry.channelId || 'unknown';
      acc[channelId] = acc[channelId] || [];
      acc[channelId].push({ entry, index });
      return acc;
    }, {});
  }

  /**
   * Trims history per channel to prevent one channel from dominating
   */
  _trimPerChannelHistory() {
    const channelMessages = this._groupHistoryByChannel();

    // Find and trim channels exceeding limit
    Object.entries(channelMessages)
      .filter(([, messages]) => messages.length > this.maxHistoryPerChannel)
      .forEach(([, messages]) => {
        const excess = messages.length - this.maxHistoryPerChannel;
        const toRemove = messages
          .sort((a, b) => (a.entry.timestamp || 0) - (b.entry.timestamp || 0))
          .slice(0, excess)
          .sort((a, b) => b.index - a.index);

        // Remove from history (reverse order to maintain indices)
        toRemove.forEach(({ index }) => this.messageHistory.splice(index, 1));
      });

    // Invalidate cache
    this._cachedCritHistory = null;
  }

  // ----------------------------------------------------------------------------
  // History Saving & Loading
  // ----------------------------------------------------------------------------

  /**
   * Counts crits by channel from crit history
   * @param {Array} critHistory - Array of crit history entries
   * @returns {Object} Object mapping channel IDs to crit counts
   */
  _countCritsByChannel(critHistory) {
    return critHistory.reduce((acc, entry) => {
      const channelId = entry.channelId || 'unknown';
      acc[channelId] = (acc[channelId] || 0) + 1;
      return acc;
    }, {});
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
      const startTime = (() => {
        try {
          return typeof window !== 'undefined' && window.performance && window.performance.now
            ? window.performance.now()
            : Date.now();
        } catch {
          return Date.now();
        }
      })();
      this.debugLog('LOAD_MESSAGE_HISTORY', 'CRITICAL: Loading message history from storage');
      const saved = BdApi.Data.load('CriticalHit', 'messageHistory');

      if (Array.isArray(saved)) {
        this.messageHistory = saved;
        // Invalidate cache and compute crit history once
        this._cachedCritHistory = null;
        const critHistory = this.getCritHistory();
        const critCount = critHistory.length;
        const critsByChannel = this._countCritsByChannel(critHistory);
        const endTime = (() => {
          try {
            return typeof window !== 'undefined' && window.performance && window.performance.now
              ? window.performance.now()
              : Date.now();
          } catch {
            return Date.now();
          }
        })();
        const loadTime = endTime - startTime;

        this.debugLog('LOAD_MESSAGE_HISTORY', 'SUCCESS: Message history loaded successfully', {
          messageCount: this.messageHistory.length,
          critCount: critCount,
          critsByChannel: critsByChannel,
          loadTimeMs: loadTime.toFixed(2),
          // Use cached getCritHistory method
          sampleCritIds: this.getCritHistory()
            .slice(0, 5)
            .map((e) => ({ messageId: e.messageId, channelId: e.channelId })),
        });
        console.log(
          `CriticalHit: Loaded ${
            this.messageHistory.length
          } messages (${critCount} crits) from history in ${loadTime.toFixed(2)}ms`
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

  // ----------------------------------------------------------------------------
  // Pending Crits Queue Management
  // ----------------------------------------------------------------------------

  /**
   * Maximum age for hash ID entries in pending queue (milliseconds)
   * @type {number}
   */
  get PENDING_HASH_ID_MAX_AGE() {
    return 5000;
  }

  /**
   * Maximum age for regular ID entries in pending queue (milliseconds)
   * @type {number}
   */
  get PENDING_REGULAR_ID_MAX_AGE() {
    return 3000;
  }

  /**
   * Percentage of queue to remove when at max capacity
   * @type {number}
   */
  get PENDING_QUEUE_TRIM_PERCENTAGE() {
    return 0.3;
  }

  /**
   * Cleans up expired entries from pending crits queue
   * @param {number} maxAge - Maximum age in milliseconds
   */
  _cleanupExpiredPendingCrits(maxAge) {
    const now = Date.now();
    Array.from(this.pendingCrits.entries()).forEach(([pendingId, pendingData]) => {
      if (now - pendingData.timestamp > maxAge) {
        this.pendingCrits.delete(pendingId);
      }
    });
  }

  /**
   * Trims pending crits queue when at capacity
   */
  _trimPendingCritsQueue() {
    if (this.pendingCrits.size < this.maxPendingCrits) return;

    const sortedEntries = Array.from(this.pendingCrits.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    const toRemove = Math.floor(this.maxPendingCrits * this.PENDING_QUEUE_TRIM_PERCENTAGE);
    sortedEntries.slice(0, toRemove).forEach(([id]) => this.pendingCrits.delete(id));
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

  // ----------------------------------------------------------------------------
  // History Entry Management
  // ----------------------------------------------------------------------------

  /**
   * Finds history entry by direct ID match
   * @param {string} messageId - Message ID to match
   * @param {string} channelId - Channel ID to match
   * @returns {number} Index of entry or -1 if not found
   */
  _findHistoryEntryById(messageId, channelId) {
    return this.messageHistory.findIndex(
      (entry) => entry.messageId === messageId && entry.channelId === channelId
    );
  }

  /**
   * Finds history entry by content hash matching
   * @param {string} channelId - Channel ID to match
   * @param {string} guildId - Guild ID to match
   * @param {string} contentHash - Content hash to match
   * @returns {number} Index of entry or -1 if not found
   */
  _findHistoryEntryByContentHash(channelId, guildId, contentHash) {
    return this.messageHistory.findIndex((entry) => {
      // Match by channel and guild ID
      if (entry.channelId !== channelId) return false;
      if ((entry.guildId || 'dm') !== guildId) return false;
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
    // Try ID match first (channel + message ID is sufficient)
    // Use normalized messageId parameter (history entries have normalized IDs)
    let existingIndex = this._findHistoryEntryById(messageId, channelId);

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
      const guildId = messageData.guildId || this.currentGuildId || 'dm';
      existingIndex = this._findHistoryEntryByContentHash(channelId, guildId, contentHash);

      if (existingIndex >= 0) {
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
    }

    return existingIndex;
  }

  /**
   * Creates a history entry object from message data
   * @param {Object} messageData - Message data
   * @param {string} messageId - Normalized message ID
   * @param {string} authorId - Normalized author ID
   * @param {string} channelId - Normalized channel ID
   * @param {boolean} isCrit - Whether message is a crit
   * @returns {Object} History entry object
   */
  _createHistoryEntry(messageData, messageId, authorId, channelId, isCrit) {
    return {
      messageId: messageId || null,
      authorId: authorId || null,
      channelId: channelId || null,
      guildId: this.currentGuildId || 'dm',
      timestamp: messageData.timestamp || Date.now(),
      isCrit: isCrit,
      critSettings: isCrit
        ? {
            color: this.settings.critColor,
            gradient: this.settings.critGradient !== false,
            font: this.settings.critFont,
            animation: this.settings.critAnimation,
            glow: this.settings.critGlow,
          }
        : null,
      messageContent: messageData.messageContent || null,
      author: messageData.author || null,
    };
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

      // Only log non-crit additions in verbose mode; always log crits
      const shouldLogHistory = isCrit || this.debug?.verbose;
      shouldLogHistory &&
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
              ? this.isValidDiscordId(messageId)
                ? 'Discord ID'
                : 'Other'
              : 'null',
            authorIdFormat: authorId
              ? this.isValidDiscordId(authorId)
                ? 'Discord ID'
                : 'Other'
              : 'null',
          }
        );

      // Add message to history with all essential info
      // Channel ID + Message ID is sufficient for uniqueness
      // Guild ID stored for future use but not required for lookups
      const historyEntry = {
        messageId: messageId || null, // Normalized message ID (Discord ID format preferred)
        authorId: authorId || null, // Normalized author/user ID (Discord ID format)
        channelId: channelId || null, // Normalized channel ID
        guildId: this.currentGuildId || 'dm', // Guild ID stored for reference (optional)
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
        this.debug?.verbose &&
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
        this.debug?.verbose &&
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

  // ----------------------------------------------------------------------------
  // History Retrieval
  // ----------------------------------------------------------------------------

  /**
   * Gets all message history entries for a specific channel
   * @param {string} channelId - The channel ID to filter by
   * @returns {Array} Array of message history entries
   */
  getChannelHistory(channelId) {
    if (!channelId) return [];
    return this.messageHistory.filter((entry) => entry.channelId === channelId);
  }

  /**
   * Gets all crit messages from history, optionally filtered by channel
   * Uses caching to avoid repeated filter operations
   * @param {string|null} channelId - Optional channel ID to filter by
   * @returns {Array} Array of crit message entries
   */
  getCritHistory(channelId = null) {
    const now = Date.now();
    const cacheKey = channelId || 'all';

    // Return cached result if valid
    const isCacheValid =
      this._cachedCritHistory &&
      this._cachedCritHistoryTimestamp &&
      now - this._cachedCritHistoryTimestamp < this._cachedCritHistoryMaxAge &&
      this._cachedCritHistory.channelId === cacheKey;

    if (isCacheValid) return this._cachedCritHistory.data;

    // Filter crits: only crit messages, optionally filtered by channel
    const crits = this.messageHistory.filter(
      (entry) => entry.isCrit && (!channelId || entry.channelId === channelId)
    );

    // Cache result
    this._cachedCritHistory = { data: crits, channelId: cacheKey };
    this._cachedCritHistoryTimestamp = now;

    return crits;
  }

  // ----------------------------------------------------------------------------
  // Crit Restoration
  // ----------------------------------------------------------------------------

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

      // Only log in verbose mode - summary logs below provide enough info
      this.debug?.verbose &&
        this.debugLog('RESTORE_CHANNEL_CRITS', 'SUCCESS: Found crits to restore from history', {
          critCount: channelCrits.length,
          attempt: retryCount + 1,
          channelId: channelId,
          sampleCritIds: channelCrits.slice(0, 5).map((e) => e.messageId),
          allCritIds: channelCrits.map((e) => e.messageId),
        });
      // Only log in verbose mode - this appears during restoration
      this.debug?.verbose &&
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

      // Find all messages in DOM
      const uniqueMessages = this._findMessagesInDOM();

      // Only log in verbose mode - this appears during restoration
      this.debug?.verbose &&
        this.debugLog('RESTORE_CHANNEL_CRITS', 'Found messages in channel', {
          messageCount: uniqueMessages.length,
          expectedCrits: channelCrits.length,
          expectedIds: Array.from(critMessageIds).slice(0, 10), // First 10 for debugging
        });

      uniqueMessages.forEach((msgElement) => {
        try {
          // Skip if already has crit styling (efficient check - avoids unnecessary processing)
          if (msgElement?.classList?.contains('bd-crit-hit')) {
            skippedAlreadyStyled++;
            // Mark as processed to skip future checks
            const msgId = this.getMessageIdentifier(msgElement);
            msgId && this.processedMessages.add(msgId);
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
            if (success) {
              restoredCount++;
              // Mark as processed to skip future checks (efficiency)
              this.processedMessages.add(normalizedMsgId);
            }
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

      // Only show detailed summary if restoration failed or in verbose mode
      // Successful restorations are less verbose
      const shouldShowDetailedSummary = restoredCount < channelCrits.length || this.debug?.verbose;

      if (shouldShowDetailedSummary) {
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
            ...(this.debug?.verbose && {
              skippedAlreadyStyled,
              noIdFound,
              idMismatch,
              foundIdsCount: foundIds.size,
              expectedIdsCount: critMessageIds.size,
            }),
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
      } else if (restoredCount > 0) {
        // Brief success log for successful restorations
        console.log(
          `CriticalHit: Restored ${restoredCount} of ${channelCrits.length} crits for channel ${channelId}`
        );
      }

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

    // Only log in verbose mode - this appears for every restored crit with gradient
    this.debug?.verbose &&
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
        if (!this.verifyGradientStyles(content)) {
          // Use applyStyles helper instead of individual setProperty calls
          const gradientStyles = this.createGradientStyles(gradientColors);
          this.applyStyles(content, gradientStyles);
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
    this.applyStyles(content, {
      'font-family': this.settings.critFont || "'Friend or Foe BB', sans-serif",
      'font-weight': 'bold',
      'font-size': '1.15em', // Slightly bigger for Friend or Foe BB
      'letter-spacing': '1px',
      '-webkit-text-stroke': 'none',
      'text-stroke': 'none',
      'font-synthesis': 'none',
      'font-variant': 'normal',
      'font-style': 'normal',
    });
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
        this.applyStyles(content, {
          'text-shadow':
            '0 0 3px rgba(139, 92, 246, 0.5), 0 0 6px rgba(124, 58, 237, 0.4), 0 0 9px rgba(109, 40, 217, 0.3), 0 0 12px rgba(91, 33, 182, 0.2)',
        }),
      solid: () => {
        const color = critSettings.color || this.settings.critColor;
        this.applyStyles(content, {
          'text-shadow': `0 0 2px ${color}, 0 0 3px ${color}`,
        });
      },
      none: () => this.applyStyles(content, { 'text-shadow': 'none' }),
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
        const hasGradient = retryComputed?.backgroundImage?.includes('gradient');
        const hasWebkitClip =
          retryComputed?.webkitBackgroundClip === 'text' ||
          retryComputed?.backgroundClip === 'text';

        if (!hasGradient || !hasWebkitClip) {
          // Reapply gradient if missing
          this.applyGradientStyles(retryContent, messageElement, gradientColors);
          return false; // Still needs monitoring
        }
        return true; // Gradient is applied correctly
      }
      return true; // Element disconnected or no crit class
    };

    // Always set up observer for restoration (even if gradient appears applied initially)
    // Discord's DOM updates may remove it later
    const restorationRetryObserver = new MutationObserver(() => {
      // Check and restore gradient on any mutation
      checkAndRestoreGradient();
    });

    restorationRetryObserver.observe(retryContent, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      childList: true, // Also watch for child changes
      subtree: true, // Watch subtree for nested changes
    });

    restorationRetryObserver.observe(messageElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // Initial check
    checkAndRestoreGradient();

    // Keep observer active longer for restoration (Discord may update DOM multiple times)
    setTimeout(() => {
      restorationRetryObserver.disconnect();
    }, 5000); // Increased from 2000ms to 5000ms for better persistence
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
      // Only log in verbose mode - this appears for every restored crit
      this.debug?.verbose &&
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
          // Apply gradient with retry mechanism for restoration
          const hasGradientInComputed = this.applyGradientStylesWithSettings(
            content,
            messageElement
          );
          if (!hasGradientInComputed && content) {
            this.setupGradientRetryObserver(content);
          }
          // CRITICAL: Set up restoration retry observer to ensure gradient persists
          // This handles cases where Discord's DOM updates remove the gradient
          // Use double RAF to ensure DOM is stable before setting up observer
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.setupGradientRestorationRetryObserver(messageElement, content, useGradient);
            });
          });
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
      // Only log in verbose mode - this appears for every restored crit
      this.debug?.verbose &&
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
  // Handles cleanup of processed messages, history trimming, and periodic maintenance

  // ----------------------------------------------------------------------------
  // Cleanup Constants
  // ----------------------------------------------------------------------------

  /**
   * Periodic cleanup interval in milliseconds (30 minutes)
   * @type {number}
   */
  get PERIODIC_CLEANUP_INTERVAL_MS() {
    return 30 * 60 * 1000;
  }

  /**
   * Default history retention days
   * @type {number}
   */
  get DEFAULT_HISTORY_RETENTION_DAYS() {
    return 30;
  }

  /**
   * Message container cache TTL in milliseconds (5 seconds)
   * @type {number}
   */
  get MESSAGE_CONTAINER_CACHE_TTL_MS() {
    return 5000;
  }

  // ----------------------------------------------------------------------------
  // Processed Messages Cleanup
  // ----------------------------------------------------------------------------

  /**
   * Calculates excess messages to remove for LRU cleanup
   * @returns {number} Number of messages to remove
   */
  _calculateExcessProcessedMessages() {
    return this.processedMessages.size > this.maxProcessedMessages
      ? this.processedMessages.size - this.maxProcessedMessages
      : 0;
  }

  /**
   * Removes oldest processed messages from Set and order array
   * @param {number} excess - Number of messages to remove
   */
  _removeOldestProcessedMessages(excess) {
    const toRemove = this.processedMessagesOrder.slice(0, excess);
    toRemove.forEach((messageId) => {
      this.processedMessages.delete(messageId);
    });
    this.processedMessagesOrder = this.processedMessagesOrder.slice(excess);
  }

  /**
   * Clean up processedMessages Set when it exceeds max size (LRU-style)
   * Removes oldest entries to prevent unbounded growth
   */
  cleanupProcessedMessages() {
    const excess = this._calculateExcessProcessedMessages();
    if (excess === 0) return;

    this.debugLog('CLEANUP_PROCESSED', `Cleaning up ${excess} old processed messages`, {
      before: this.processedMessages.size,
      after: this.maxProcessedMessages,
    });

    this._removeOldestProcessedMessages(excess);
  }

  /**
   * Clears session tracking data (preserves history for restoration)
   * Used when switching channels or restarting
   */
  clearSessionTracking() {
    this.critMessages.clear();
    this.processedMessages.clear();
    this.processedMessagesOrder = [];
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

  // ----------------------------------------------------------------------------
  // Periodic Cleanup
  // ----------------------------------------------------------------------------

  /**
   * Executes periodic cleanup tasks
   */
  _executePeriodicCleanup() {
    try {
      this.debugLog('PERIODIC_CLEANUP', 'Running periodic history cleanup');
      const retentionDays =
        this.settings.historyRetentionDays || this.DEFAULT_HISTORY_RETENTION_DAYS;
      this.settings.autoCleanupHistory && this.cleanupOldHistory(retentionDays);
      this.cleanupProcessedMessages();
    } catch (error) {
      this.debugError('PERIODIC_CLEANUP', error);
    }
  }

  /**
   * Start periodic history cleanup (runs every 30 minutes)
   */
  startPeriodicCleanup() {
    // Clear any existing interval
    this.historyCleanupInterval && clearInterval(this.historyCleanupInterval);

    // Run cleanup at configured interval
    this.historyCleanupInterval = setInterval(
      () => this._executePeriodicCleanup(),
      this.PERIODIC_CLEANUP_INTERVAL_MS
    );

    this.debugLog('PERIODIC_CLEANUP', 'Started periodic cleanup interval', {
      intervalMinutes: this.PERIODIC_CLEANUP_INTERVAL_MS / (60 * 1000),
    });
  }

  // ----------------------------------------------------------------------------
  // History Cleanup
  // ----------------------------------------------------------------------------

  /**
   * Calculates cutoff timestamp for history cleanup
   * @param {number} daysToKeep - Number of days to keep
   * @returns {number} Cutoff timestamp in milliseconds
   */
  _calculateHistoryCutoffTime(daysToKeep) {
    return Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  }

  /**
   * Filters history entries by cutoff time
   * @param {number} cutoffTime - Cutoff timestamp
   * @returns {Array} Filtered history entries
   */
  _filterHistoryByCutoff(cutoffTime) {
    return this.messageHistory.filter((entry) => entry.timestamp > cutoffTime);
  }

  /**
   * Calculates cleanup statistics
   * @param {number} initialLength - Initial history length
   * @param {number} initialCrits - Initial crit count
   * @returns {Object} Cleanup stats
   */
  _calculateCleanupStats(initialLength, initialCrits) {
    const removed = initialLength - this.messageHistory.length;
    const removedCrits = initialCrits - this.getCritHistory().length;
    return { removed, removedCrits };
  }

  /**
   * Removes history entries older than specified days
   * @param {number} daysToKeep - Number of days to keep (default: 30)
   */
  cleanupOldHistory(daysToKeep = this.DEFAULT_HISTORY_RETENTION_DAYS) {
    const cutoffTime = this._calculateHistoryCutoffTime(daysToKeep);
    const initialLength = this.messageHistory.length;
    const initialCrits = this.messageHistory.filter((e) => e.isCrit).length;

    this.messageHistory = this._filterHistoryByCutoff(cutoffTime);
    this._cachedCritHistory = null;

    const { removed, removedCrits } = this._calculateCleanupStats(initialLength, initialCrits);

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
      this.updateStats();
    }
  }

  // ----------------------------------------------------------------------------
  // Statistics Management
  // ----------------------------------------------------------------------------

  /**
   * Calculates crit rate from history
   * @param {number} totalCrits - Total crit count
   * @param {number} totalMessages - Total message count
   * @returns {number} Crit rate percentage
   */
  _calculateCritRate(totalCrits, totalMessages) {
    return totalMessages > 0 ? (totalCrits / totalMessages) * 100 : 0;
  }

  /**
   * Updates statistics from message history
   */
  updateStats() {
    const totalCrits = this.getCritHistory().length;
    const totalMessages = this.messageHistory.length;
    const critRate = this._calculateCritRate(totalCrits, totalMessages);

    this.stats = {
      totalCrits,
      totalMessages,
      critRate,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Gets current statistics with additional history info
   * @returns {Object} Current stats object
   */
  getStats() {
    return {
      ...this.stats,
      historySize: this.messageHistory.length,
      critsInHistory: this.messageHistory.filter((e) => e.isCrit).length,
    };
  }

  // ============================================================================
  // OBSERVER & MESSAGE PROCESSING
  // ============================================================================
  // Handles DOM observation, message processing, and batch operations

  // ----------------------------------------------------------------------------
  // Observer Constants
  // ----------------------------------------------------------------------------

  /**
   * Retry delay for observer setup in milliseconds
   * @type {number}
   */
  get OBSERVER_RETRY_DELAY_MS() {
    return 500;
  }

  /**
   * Load observer timeout in milliseconds (5 seconds)
   * @type {number}
   */
  get LOAD_OBSERVER_TIMEOUT_MS() {
    return 5000;
  }

  /**
   * Observer error retry delay in milliseconds
   * @type {number}
   */
  get OBSERVER_ERROR_RETRY_DELAY_MS() {
    return 1000;
  }

  // ----------------------------------------------------------------------------
  // Message Container Discovery
  // ----------------------------------------------------------------------------

  /**
   * Checks if cached message container is still valid
   * @returns {boolean} True if cache is valid
   */
  _isMessageContainerCacheValid() {
    const now = Date.now();
    return (
      this._cachedMessageContainer &&
      this._cachedMessageContainerTimestamp &&
      now - this._cachedMessageContainerTimestamp < this.MESSAGE_CONTAINER_CACHE_TTL_MS &&
      this._cachedMessageContainer.isConnected
    );
  }

  /**
   * Gets message container selectors for discovery
   * @returns {Array<string>} Array of CSS selectors
   */
  _getMessageContainerSelectors() {
    return [
      '[class*="messagesWrapper"]',
      '[class*="messageContainer"]',
      '[class*="scrollerInner"]',
      '[class*="scroller"]',
      '[class*="listItem"]',
    ];
  }

  /**
   * Verifies element is a message container
   * @param {HTMLElement} element - Element to verify
   * @returns {boolean} True if element is a message container
   */
  _isMessageContainer(element) {
    if (!element) return false;
    const hasMessages = element.querySelector('[class*="message"]') !== null;
    return hasMessages || element.matches('[class*="scroller"]');
  }

  /**
   * Finds message container using fallback methods
   * @returns {HTMLElement|null} Message container or null
   */
  _findMessageContainerFallback() {
    const msgEl = document.querySelector('[class*="message"]');
    if (!msgEl) return null;

    const container = msgEl.closest('[class*="scroller"]') || msgEl.parentElement?.parentElement;
    if (container) {
      const now = Date.now();
      this._cachedMessageContainer = container;
      this._cachedMessageContainerTimestamp = now;
      return container;
    }
    return null;
  }

  /**
   * Finds message container with caching
   * @returns {HTMLElement|null} Message container or null
   */
  _findMessageContainer() {
    // Check cache first
    if (this._isMessageContainerCacheValid()) {
      return this._cachedMessageContainer;
    }

    // Try selectors
    const selectors = this._getMessageContainerSelectors();
    const foundElement = selectors
      .map((selector) => document.querySelector(selector))
      .find((element) => this._isMessageContainer(element));

    if (foundElement) {
      const now = Date.now();
      this._cachedMessageContainer = foundElement;
      this._cachedMessageContainerTimestamp = now;
      return foundElement;
    }

    // Fallback method
    return this._findMessageContainerFallback();
  }

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

    const messageContainer = this._findMessageContainer();

    if (!messageContainer) {
      this.debug?.verbose &&
        this.debugLog('START_OBSERVING', 'Message container not found - retrying', {
          retryDelayMs: this.OBSERVER_RETRY_DELAY_MS,
        });
      setTimeout(() => this.startObserving(), this.OBSERVER_RETRY_DELAY_MS);
      return;
    }

    // Get channel/guild IDs and update tracking
    const channelId =
      this._getCurrentChannelId() || this._extractChannelIdFromContainer(messageContainer);
    const guildId = this._getCurrentGuildId();

    // Update channel/guild IDs if changed (event-driven, no polling)
    const channelChanged = channelId !== this.currentChannelId;
    channelChanged &&
      (this.currentChannelId && this._throttledSaveHistory(false),
      (this.currentChannelId = channelId),
      (this.currentGuildId = guildId),
      (this._cachedMessageContainer = null),
      (this._cachedMessageContainerTimestamp = 0));

    // Clear session tracking (preserve history for restoration)
    this.clearSessionTracking();

    // Wait for channel to load, then restore crits (event-driven via MutationObserver)
    this.isLoadingChannel = true;
    this.observerStartTime = Date.now();

    // Use MutationObserver to detect when messages are loaded (no polling)
    const loadObserver = new MutationObserver(() => {
      const messageCount = document.querySelectorAll('[class*="message"]').length;
      messageCount > 0 &&
        ((this.isLoadingChannel = false),
        (this.channelLoadTime = Date.now()),
        loadObserver.disconnect(),
        // Restore crits after DOM is ready (event-driven, not polling)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            channelId && this.restoreChannelCrits(channelId);
          });
        }));
    });

    messageContainer && loadObserver.observe(messageContainer, { childList: true, subtree: true });
    setTimeout(() => loadObserver.disconnect(), this.LOAD_OBSERVER_TIMEOUT_MS);

    // Ensure _pendingNodes is initialized before creating observer
    if (!this._pendingNodes) {
      this._pendingNodes = new Set();
    }

    // Create mutation observer to watch for new messages
    this.messageObserver = new MutationObserver((mutations) => {
      // Process each mutation directly
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            // Element node - process directly using double requestAnimationFrame
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                this.processNode(node);
                // Also check if this is a message that needs crit restoration
                this.checkForRestoration(node);
              });
            });
          }
        });
      });
    });

    // Start observing - watch direct children AND subtree for messages
    try {
      this.messageObserver.observe(messageContainer, {
        childList: true,
        subtree: true, // Need subtree: true to catch nested messages
      });

      // Only log in verbose mode to reduce console noise
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
      setTimeout(() => this.startObserving(), this.OBSERVER_ERROR_RETRY_DELAY_MS);
      return;
    }

    // Don't check existing messages - only new ones!
    // This prevents applying crits to old messages

    // Re-observe when channel changes (listen for navigation events)
    this.setupChannelChangeListener();
  }

  /**
   * Initialize webpack modules for advanced Discord integration
   * Enhances message tracking with MessageStore access
   */
  initializeWebpackModules() {
    try {
      // Try to get MessageStore (for receiving messages)
      this.webpackModules.MessageStore = BdApi.Webpack.getModule(
        (m) => m && (m.getMessage || m.getMessages || m.receiveMessage)
      );

      // UserStore already accessed in getCurrentUserId(), but store reference
      if (!this.webpackModules.UserStore) {
        this.webpackModules.UserStore = BdApi.Webpack.getModule((m) => m && m.getCurrentUser);
      }

      // MessageActions already accessed in setupMessageSendHook(), but store reference
      if (!this.webpackModules.MessageActions) {
        this.webpackModules.MessageActions = BdApi.Webpack.getModule(
          (m) => m && m.sendMessage && (m.receiveMessage || m.editMessage)
        );
      }

      this.debugLog('WEBPACK_INIT', 'Webpack modules initialized', {
        hasMessageStore: !!this.webpackModules.MessageStore,
        hasUserStore: !!this.webpackModules.UserStore,
        hasMessageActions: !!this.webpackModules.MessageActions,
      });
    } catch (error) {
      this.debugError('WEBPACK_INIT', error);
    }
  }

  /**
   * Set up message receive hook (patches MessageStore.receiveMessage)
   * Provides more reliable message detection than DOM observation
   */
  setupMessageReceiveHook() {
    try {
      if (!this.webpackModules.MessageStore) {
        this.debugLog('MESSAGE_RECEIVE_HOOK', 'MessageStore not available, using DOM fallback');
        return;
      }

      // Patch MessageStore.receiveMessage to detect received messages
      if (this.webpackModules.MessageStore.receiveMessage) {
        const pluginInstance = this;
        BdApi.Patcher.after(
          'CriticalHit',
          this.webpackModules.MessageStore,
          'receiveMessage',
          (thisObject, args, returnValue) => {
            try {
              // Process received message (more reliable than DOM)
              if (returnValue && returnValue.id) {
                // Check if this is our own message (for crit detection)
                const currentUserId =
                  pluginInstance.currentUserId || pluginInstance.settings?.ownUserId;
                if (returnValue.author && returnValue.author.id === currentUserId) {
                  // This is our sent message - process for crit check
                  // Wait for DOM to be ready, then process
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      const messageElement = document.querySelector(
                        `[data-message-id="${returnValue.id}"]`
                      );
                      if (messageElement) {
                        pluginInstance.processNode(messageElement);
                      }
                    });
                  });
                }
              }
            } catch (error) {
              pluginInstance.debugError('MESSAGE_RECEIVE_HOOK', error);
            }
          }
        );
        this.messageStorePatch = true;
        this.debugLog('MESSAGE_RECEIVE_HOOK', 'MessageStore receive hook installed');
      }
    } catch (error) {
      this.debugError('MESSAGE_RECEIVE_HOOK', error);
    }
  }

  /**
   * Sets up a hook to capture sent messages using BetterDiscord's Patcher API
   * This provides a more reliable way to detect sent messages than MutationObserver alone
   */
  setupMessageSendHook() {
    try {
      // Try multiple methods to find MessageActions module
      // Method 1: Standard search
      let MessageActions = BdApi.Webpack.getModule(
        (m) => m.sendMessage && (m.receiveMessage || m.editMessage)
      );

      // Method 2: Alternative search patterns
      if (!MessageActions) {
        MessageActions = BdApi.Webpack.getModule((m) => {
          return (
            m.sendMessage &&
            typeof m.sendMessage === 'function' &&
            (m.receiveMessage || m.editMessage || m.deleteMessage || m.updateMessage)
          );
        });
      }

      // Method 3: Search by function signature (sendMessage with specific properties)
      if (!MessageActions) {
        MessageActions = BdApi.Webpack.getModule((m) => {
          if (!m.sendMessage || typeof m.sendMessage !== 'function') return false;
          // Check if it's likely MessageActions by looking for other message-related functions
          const messageFunctions = [
            'sendMessage',
            'editMessage',
            'deleteMessage',
            'receiveMessage',
          ];
          const foundFunctions = messageFunctions.filter(
            (fn) => m[fn] && typeof m[fn] === 'function'
          );
          return foundFunctions.length >= 2; // At least 2 message functions
        });
      }

      // Method 4: Get all modules and search manually
      if (!MessageActions) {
        const allModules = BdApi.Webpack.getAllModules();
        MessageActions = allModules.find((m) => {
          return (
            m.sendMessage &&
            typeof m.sendMessage === 'function' &&
            (m.receiveMessage || m.editMessage || m.deleteMessage)
          );
        });
      }

      if (!MessageActions) {
        this.debugLog('MESSAGE_SEND_HOOK', 'MessageActions module not found - retrying...');

        // Retry after a delay (Discord might not be fully loaded)
        setTimeout(() => this.setupMessageSendHook(), 1000);
        return;
      }

      // Store plugin instance reference for use in callback
      const pluginInstance = this;

      // Patch sendMessage to capture sent messages
      BdApi.Patcher.after(
        'CriticalHit',
        MessageActions,
        'sendMessage',
        (thisObject, args, returnValue) => {
          try {
            // Discord's sendMessage can have different argument structures
            // Try multiple formats: [channelId, message] or {channelId, content} or just message object
            let channelId = null;
            let message = null;
            let messageContent = '';

            if (args && args.length >= 2) {
              // Format: [channelId, message]
              channelId = args[0];
              message = args[1];
            } else if (args && args.length === 1 && typeof args[0] === 'object') {
              // Format: [{channelId, content, ...}]
              message = args[0];
              channelId = message.channelId || message.channel_id;
            }

            // Extract message content from various possible fields
            messageContent =
              message?.content || message?.body || message?.text || message?.message?.content || '';

            // Get author ID - ensure we have it
            if (!pluginInstance.currentUserId && !pluginInstance.settings?.ownUserId) {
              pluginInstance.getCurrentUserId();
            }
            const authorId = pluginInstance.currentUserId || pluginInstance.settings?.ownUserId;

            // Process regardless of channel match for now (we'll filter in processNode)
            // This helps us debug if the hook is even firing
            if (messageContent) {
              // Wait a bit for Discord to add the message to DOM, then process it
              // Use multiple attempts with increasing delays to catch the message
              let attempts = 0;
              const maxAttempts = 5;
              const findAndProcessMessage = () => {
                attempts++;
                // Find the message element in DOM by content and author
                const messageElements = Array.from(document.querySelectorAll('[class*="message"]'));
                const sentMessage = messageElements.find((el) => {
                  if (!el || !el.isConnected) return false;
                  const content = el.textContent || '';
                  const id = pluginInstance.getMessageIdentifier(el);
                  const author = pluginInstance.getAuthorId(el);
                  // Match by content and author (most reliable)
                  const contentMatch = content.includes(messageContent.substring(0, 50));
                  const authorMatch = author === authorId;
                  const notProcessed = !pluginInstance.processedMessages.has(id);

                  return contentMatch && authorMatch && notProcessed;
                });

                if (sentMessage) {
                  // Only process if channel matches (safety check)
                  const messageChannelId = pluginInstance._getCurrentChannelId();
                  if (
                    channelId === messageChannelId ||
                    channelId === pluginInstance.currentChannelId
                  ) {
                    // Process the message for crit check using double requestAnimationFrame
                    // This ensures DOM is fully ready before processing
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        pluginInstance.processNode(sentMessage);
                      });
                    });
                  }
                } else if (attempts < maxAttempts) {
                  // Retry with increasing delay
                  setTimeout(findAndProcessMessage, 100 * attempts);
                }
              };

              // Start searching after initial delay
              setTimeout(findAndProcessMessage, 200);
            }
          } catch (error) {
            pluginInstance.debugError('MESSAGE_SEND_HOOK', error, { phase: 'hook_callback' });
          }
        }
      );

      this.debugLog('MESSAGE_SEND_HOOK', 'Message send hook set up successfully');
    } catch (error) {
      this.debugError('MESSAGE_SEND_HOOK', error, { phase: 'setup' });
    }
  }

  /**
   * Processes observer mutations with throttling
   * Separated from observer callback to allow throttling
   * @param {Array<MutationRecord>} mutations - Mutation records from observer
   */
  _processObserverMutations(mutations) {
    // CRITICAL: Defensive check - Ensure _pendingNodes exists
    if (!this._pendingNodes || typeof this._pendingNodes.add !== 'function') {
      this._pendingNodes = new Set();
    }

    // Collect all nodes to process
    const nodesToProcess = [];
    try {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node && node.nodeType === 1) {
            // Element node - add to batch
            // CRITICAL: Only add if it looks like a message container to reduce processing
            // Quick check to avoid processing every DOM element
            const hasMessageClass =
              node.classList && Array.from(node.classList).some((c) => c.includes('message'));
            const hasMessageChild = node.querySelector('[class*="message"]');

            if (hasMessageClass || hasMessageChild) {
              nodesToProcess.push(node);
            }
          }
        });
      });

      // Batch process nodes to reduce lag (only if we have nodes and _pendingNodes is valid)
      if (
        nodesToProcess.length > 0 &&
        this._pendingNodes &&
        typeof this._pendingNodes.add === 'function'
      ) {
        this.batchProcessNodes(nodesToProcess);
      }
    } catch (err) {
      // Silently handle errors in observer callback to prevent breaking Discord
      // Reinitialize _pendingNodes if it got corrupted
      if (!this._pendingNodes || typeof this._pendingNodes.add !== 'function') {
        this._pendingNodes = new Set();
      }
    }
  }

  /**
   * Batches node processing to reduce lag from rapid DOM mutations
   * Uses requestAnimationFrame for smooth processing
   * @param {Array<Node>} nodes - Array of nodes to process
   */
  batchProcessNodes(nodes) {
    // CRITICAL: Initialize _pendingNodes if not already initialized (defensive programming)
    // This can happen if observer fires before constructor completes or during hot reload
    if (!this._pendingNodes || typeof this._pendingNodes.add !== 'function') {
      this._pendingNodes = new Set();
    }

    // Validate inputs before processing
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return; // Nothing to process
    }

    // Add nodes to pending queue (only if _pendingNodes is valid)
    // CRITICAL: Double-check _pendingNodes is still valid before forEach loop
    if (!this._pendingNodes || typeof this._pendingNodes.add !== 'function') {
      this._pendingNodes = new Set();
    }

    // Only proceed if _pendingNodes is definitely valid
    if (this._pendingNodes && typeof this._pendingNodes.add === 'function') {
      nodes.forEach((node) => {
        // CRITICAL: Re-check _pendingNodes inside loop in case it gets corrupted during iteration
        if (!this._pendingNodes || typeof this._pendingNodes.add !== 'function') {
          this._pendingNodes = new Set();
          return; // Skip this node if Set was corrupted
        }

        if (node && node.nodeType === 1) {
          // Only process element nodes
          try {
            this._pendingNodes.add(node);
          } catch (err) {
            // Silently ignore errors adding nodes (Set might be corrupted)
            // Reinitialize if corrupted
            if (!this._pendingNodes || typeof this._pendingNodes.add !== 'function') {
              this._pendingNodes = new Set();
            }
          }
        }
      });
    }

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
    // Defensive check: Initialize _pendingNodes if not already initialized
    if (!this._pendingNodes) {
      this._pendingNodes = new Set();
    }
    if (this._pendingNodes.size === 0) {
      this._processingBatch = false;
      return;
    }

    this._processingBatch = true;

    // Defensive check: Ensure _pendingNodes exists before processing
    if (!this._pendingNodes) {
      this._pendingNodes = new Set();
      this._processingBatch = false;
      return;
    }

    // Take up to maxBatchSize nodes
    const nodesToProcess = Array.from(this._pendingNodes).slice(0, this._maxBatchSize);
    nodesToProcess.forEach((node) => {
      if (this._pendingNodes) {
        this._pendingNodes.delete(node);
      }
    });

    // Process nodes asynchronously to prevent blocking main thread
    // Use setTimeout instead of requestAnimationFrame to allow other tasks to run
    setTimeout(() => {
      // Process nodes one at a time with small delays to prevent blocking
      let index = 0;
      const processNext = () => {
        if (index < nodesToProcess.length) {
          const node = nodesToProcess[index];
          try {
            this.processNode(node);
            this.checkForRestoration(node);
          } catch (error) {
            this.debugError('BATCH_PROCESS', error, { nodeType: node?.nodeType });
          }
          index++;
          // Process next node after small delay to prevent blocking
          if (index < nodesToProcess.length) {
            setTimeout(processNext, 5); // 5ms delay between nodes
          } else {
            // All nodes processed, continue with remaining batch
            if (this._pendingNodes.size > 0) {
              this._batchProcessingTimeout = setTimeout(() => {
                this._processBatch();
              }, this._batchDelayMs);
            } else {
              this._processingBatch = false;
            }
          }
        }
      };
      processNext();
    }, 0); // Start immediately but allow other tasks to run first
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
      let messageId = messageElement ? this.getMessageIdentifier(messageElement) : null;

      // CRITICAL FIX: Reject channel IDs - if messageId matches currentChannelId, it's wrong!
      if (messageId && messageId === this.currentChannelId) {
        messageId = null; // Reject it, will use content hash fallback
      }

      // Only log in verbose mode to reduce console spam during startup
      this.debug?.verbose &&
        this.debugLog('PROCESS_NODE', 'processNode detected message', {
          messageId: messageId,
          alreadyProcessed: messageId ? this.processedMessages.has(messageId) : false,
          isLoadingChannel: this.isLoadingChannel,
        });

      // CRITICAL FIX: Process messages even if messageId is null (new messages might not have ID yet)
      // Also process if messageId exists and hasn't been processed
      // But skip if messageId exists and is already processed (to avoid duplicates)
      const shouldProcess =
        messageElement &&
        (!messageId || // No ID yet - process it (will get ID later)
          !this.processedMessages.has(messageId)); // Has ID and not processed

      if (shouldProcess) {
        // Skip if channel is still loading (but use shorter delay for better responsiveness)
        if (this.isLoadingChannel) {
          // Only log in verbose mode - this is expected behavior during channel load
          this.debug?.verbose && this.debugLog('PROCESS_NODE', 'Skipping - channel loading');
          return;
        }

        // FIXED: Process ALL messages regardless of scroll position
        // The scroll check was too restrictive and blocked messages when not scrolled to bottom
        // Instead, use a simple timing check to avoid processing during initial channel load
        const timeSinceChannelLoad = Date.now() - (this.channelLoadTime || 0);
        const timeSinceObserverStart = Date.now() - (this.observerStartTime || 0);

        // CRITICAL: For new messages (sent after observer started), process immediately
        // Only delay if channel was just loaded (initial load)
        const isNewMessage = timeSinceObserverStart > 2000; // Observer has been running for 2+ seconds

        if (isNewMessage || timeSinceChannelLoad > 500) {
          // Reduced from 1000-2000ms for faster processing

          // Process immediately (no scroll position check)
          // CRITICAL: Don't mark as processed yet - let checkForCrit do it after validation
          // This allows checkForCrit to validate the messageId and reject channel IDs

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.checkForCrit(messageElement);
            });
          });
        } else {
          // Retry after delay if channel just loaded
          setTimeout(() => {
            if (messageElement?.isConnected && !this.processedMessages.has(messageId)) {
              this.checkForCrit(messageElement);
            }
          }, 500 - timeSinceChannelLoad);
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
  // Determines which messages should be excluded from crit detection

  // ----------------------------------------------------------------------------
  // Filter Constants
  // ----------------------------------------------------------------------------

  /**
   * Reply detection selectors
   * @type {Array<string>}
   */
  get REPLY_SELECTORS() {
    return [
      '[class*="reply"]',
      '[class*="repliedMessage"]',
      '[class*="messageReference"]',
      '[class*="repliedText"]',
      '[class*="replyMessage"]',
    ];
  }

  /**
   * System message detection selectors
   * @type {Array<string>}
   */
  get SYSTEM_MESSAGE_SELECTORS() {
    return [
      '[class*="systemMessage"]',
      '[class*="systemText"]',
      '[class*="joinMessage"]',
      '[class*="leaveMessage"]',
      '[class*="pinnedMessage"]',
      '[class*="boostMessage"]',
    ];
  }

  /**
   * Bot detection selectors
   * @type {Array<string>}
   */
  get BOT_SELECTORS() {
    return ['[class*="botTag"]', '[class*="bot"]', '[class*="botText"]'];
  }

  /**
   * Maximum depth for React fiber traversal in reply detection
   * @type {number}
   */
  get MAX_REPLY_FIBER_DEPTH() {
    return 10;
  }

  // ----------------------------------------------------------------------------
  // Filter Helpers
  // ----------------------------------------------------------------------------

  /**
   * Checks if element has reply-related classes
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if has reply classes
   */
  _hasReplyClasses(element) {
    const classes = Array.from(element.classList || []);
    return classes.some(
      (c) => c.toLowerCase().includes('reply') || c.toLowerCase().includes('replied')
    );
  }

  /**
   * Checks React fiber for reply message reference
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if reply reference found
   */
  _checkReactFiberForReply(element) {
    try {
      const reactKey = Object.keys(element).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      if (!reactKey) return false;

      let fiber = element[reactKey];
      let depth = 0;
      while (fiber && depth < this.MAX_REPLY_FIBER_DEPTH) {
        if (
          fiber.memoizedProps?.message?.messageReference ||
          fiber.memoizedState?.message?.messageReference
        ) {
          return true;
        }
        fiber = fiber.return;
        depth++;
      }
    } catch (e) {
      // React access failed
    }
    return false;
  }

  /**
   * Checks if element has system-related classes
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if has system classes
   */
  _hasSystemClasses(element) {
    const classes = Array.from(element.classList || []);
    return classes.some((c) => c.includes('system') || c.includes('join') || c.includes('leave'));
  }

  /**
   * Checks if author element has bot classes
   * @param {HTMLElement} authorElement - Author element to check
   * @returns {boolean} True if bot classes found
   */
  _hasBotAuthorClasses(authorElement) {
    if (!authorElement) return false;
    const authorClasses = Array.from(authorElement.classList || []);
    return authorClasses.some((c) => c.includes('bot'));
  }

  /**
   * Determines if a message should be filtered based on settings
   * Checks for replies, system messages, bot messages, and empty messages
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message should be filtered
   */
  shouldFilterMessage(messageElement) {
    if (!messageElement) return false;

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
    if (!messageElement) return false;

    // Method 1: Check for reply indicator elements
    if (this.REPLY_SELECTORS.some((selector) => messageElement.querySelector(selector))) {
      return true;
    }

    // Method 2: Check for reply wrapper/container
    if (
      messageElement.closest('[class*="reply"]') !== null ||
      messageElement.closest('[class*="repliedMessage"]') !== null
    ) {
      return true;
    }

    // Method 3: Check class names on the message element itself
    if (this._hasReplyClasses(messageElement)) {
      return true;
    }

    // Method 4: Check for React props (Discord stores reply data in React)
    return this._checkReactFiberForReply(messageElement);
  }

  /**
   * Checks if a message is a system message (join, leave, etc.)
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is a system message
   */
  isSystemMessage(messageElement) {
    if (!messageElement) return false;

    // Check for system message selectors
    if (
      this.SYSTEM_MESSAGE_SELECTORS.some(
        (selector) => messageElement.querySelector(selector) || messageElement.matches(selector)
      )
    ) {
      return true;
    }

    // Check if message has system message classes
    return this._hasSystemClasses(messageElement);
  }

  /**
   * Checks if a message is from a bot user
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is from a bot
   */
  isBotMessage(messageElement) {
    if (!messageElement) return false;

    // Check for bot indicators
    const botIndicator = this.BOT_SELECTORS.some((selector) =>
      messageElement.querySelector(selector)
    );
    if (botIndicator) return true;

    // Check author/username area
    const authorElement =
      messageElement.querySelector('[class*="username"]') ||
      messageElement.querySelector('[class*="author"]');

    return this._hasBotAuthorClasses(authorElement);
  }

  /**
   * Checks if message has text content
   * @param {HTMLElement} messageElement - Element to check
   * @returns {boolean} True if has text
   */
  _hasTextContent(messageElement) {
    const textContent = messageElement.textContent?.trim() || '';
    if (textContent.length > 0) return true;

    const contentElement =
      messageElement.querySelector('[class*="messageContent"]') ||
      messageElement.querySelector('[class*="content"]');
    return (contentElement?.textContent?.trim().length || 0) > 0;
  }

  /**
   * Checks if message has embeds or attachments
   * @param {HTMLElement} messageElement - Element to check
   * @returns {boolean} True if has embeds/attachments
   */
  _hasEmbedsOrAttachments(messageElement) {
    const hasEmbed = messageElement.querySelector('[class*="embed"]') !== null;
    const hasAttachment = messageElement.querySelector('[class*="attachment"]') !== null;
    return hasEmbed || hasAttachment;
  }

  /**
   * Checks if a message is empty (only embeds/attachments, no text)
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is empty
   */
  isEmptyMessage(messageElement) {
    if (!messageElement) return false;

    // If no text but has embeds/attachments, it's an empty message
    return !this._hasTextContent(messageElement) && this._hasEmbedsOrAttachments(messageElement);
  }

  // ============================================================================
  // MESSAGE RESTORATION HELPERS
  // ============================================================================
  // Handles restoration of crit styling from history and pending queue

  // ----------------------------------------------------------------------------
  // Restoration Constants
  // ----------------------------------------------------------------------------

  /**
   * Restoration check throttle interval in milliseconds
   * @type {number}
   */
  get RESTORATION_CHECK_THROTTLE_MS() {
    return 200;
  }

  /**
   * Restoration observer timeout in milliseconds (5 seconds)
   * @type {number}
   */
  get RESTORATION_OBSERVER_TIMEOUT_MS() {
    return 5000;
  }

  /**
   * Maximum throttle map size before cleanup
   * @type {number}
   */
  get MAX_THROTTLE_MAP_SIZE() {
    return 500;
  }

  /**
   * Throttle entry max age in milliseconds
   * @type {number}
   */
  get THROTTLE_ENTRY_MAX_AGE_MS() {
    return 1000;
  }

  // ----------------------------------------------------------------------------
  // Message ID Matching
  // ----------------------------------------------------------------------------

  /**
   * Checks if an entry ID matches the target message ID
   * @param {string} entryId - Entry message ID
   * @param {string} normalizedMsgId - Normalized target message ID
   * @param {string} pureMessageId - Pure Discord ID
   * @returns {boolean} True if matches
   */
  _matchesMessageId(entryId, normalizedMsgId, pureMessageId) {
    if (!entryId || entryId.startsWith('hash_')) return false;
    const normalizedEntryId = this.normalizeId(entryId);
    return (
      normalizedEntryId === normalizedMsgId ||
      normalizedEntryId === pureMessageId ||
      (pureMessageId && this.extractPureDiscordId(normalizedEntryId) === pureMessageId)
    );
  }

  /**
   * Matches a message to a crit entry from history using multiple strategies
   * @param {string} normalizedMsgId - Normalized message ID
   * @param {string} pureMessageId - Pure Discord ID
   * @param {Array} channelCrits - Channel crit history
   * @returns {Object|null} Matched entry or null
   */
  matchCritToMessage(normalizedMsgId, pureMessageId, channelCrits) {
    if (!this.isValidDiscordId(normalizedMsgId) || !channelCrits?.length) return null;

    // Use dictionary pattern for matching strategies
    const matchingStrategies = {
      exact: () =>
        channelCrits.find((entry) => {
          const entryId = this.normalizeId(entry.messageId);
          return this._matchesMessageId(entryId, normalizedMsgId, pureMessageId);
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
      // Only log in verbose mode - this appears for every restored crit
      this.debug?.verbose &&
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

  // ----------------------------------------------------------------------------
  // Restoration Throttling
  // ----------------------------------------------------------------------------

  /**
   * Cleans up old throttle entries
   * @param {number} now - Current timestamp
   */
  _cleanupThrottleEntries(now) {
    if (this._restorationCheckThrottle.size <= this.MAX_THROTTLE_MAP_SIZE) return;

    Array.from(this._restorationCheckThrottle.entries())
      .filter(([, checkTime]) => now - checkTime > this.THROTTLE_ENTRY_MAX_AGE_MS)
      .forEach(([id]) => this._restorationCheckThrottle.delete(id));
  }

  /**
   * Checks if restoration should be throttled for a message ID
   * @param {string} normalizedId - Normalized message ID
   * @returns {boolean} True if should skip (throttled)
   */
  shouldThrottleRestorationCheck(normalizedId) {
    if (!normalizedId || normalizedId.startsWith('hash_')) return false;

    const lastCheck = this._restorationCheckThrottle.get(normalizedId);
    const now = Date.now();

    if (lastCheck && now - lastCheck < this.RESTORATION_CHECK_THROTTLE_MS) {
      return true;
    }

    this._restorationCheckThrottle.set(normalizedId, now);
    this._cleanupThrottleEntries(now);

    return false;
  }

  // ----------------------------------------------------------------------------
  // Content Hash Matching
  // ----------------------------------------------------------------------------

  /**
   * Calculates content hash for a message for matching
   * @deprecated Use calculateContentHash() instead
   */
  calculateContentHashForRestoration(author, messageContent, timestamp) {
    return this.calculateContentHash(author, messageContent, timestamp);
  }

  /**
   * Creates a simple hash from content string (for content-based matching)
   * @param {string} content - Content string to hash
   * @returns {string} Hash string
   */
  _createSimpleContentHash(content) {
    const hash = Array.from(content).reduce((hash, char) => {
      const charCode = char.charCodeAt(0);
      hash = (hash << 5) - hash + charCode;
      return hash & hash;
    }, 0);
    return `hash_${Math.abs(hash)}`;
  }

  /**
   * Checks if entry matches by content hash
   * @param {Object} entry - History entry
   * @param {string} contentHash - Target content hash
   * @returns {boolean} True if matches
   */
  _matchesByContentHash(entry, contentHash) {
    if (!entry.messageContent || !entry.author) return false;
    const entryContent = entry.messageContent.substring(0, 100);
    const entryHashContent = `${entry.author}:${entryContent}:${entry.timestamp || ''}`;
    const entryHash = this._createSimpleContentHash(entryHashContent);
    return entryHash === contentHash;
  }

  // ----------------------------------------------------------------------------
  // History Entry Matching
  // ----------------------------------------------------------------------------

  /**
   * Creates history entry from pending crit
   * @param {string} normalizedMsgId - Normalized message ID
   * @param {Object} pendingCrit - Pending crit data
   * @returns {Object} History entry object
   */
  _createHistoryEntryFromPending(normalizedMsgId, pendingCrit) {
    return {
      messageId: normalizedMsgId,
      channelId: this.currentChannelId,
      isCrit: true,
      critSettings: pendingCrit.critSettings,
      messageContent: pendingCrit.messageContent,
      author: pendingCrit.author,
    };
  }

  /**
   * Finds entry by exact ID match
   * @param {Array} channelCrits - Channel crit history
   * @param {string} normalizedMsgId - Normalized message ID
   * @param {string} pureMessageId - Pure Discord ID
   * @returns {Object|null} Matched entry or null
   */
  _findEntryByExactId(channelCrits, normalizedMsgId, pureMessageId) {
    return channelCrits.find((entry) => {
      const entryId = String(entry.messageId).trim();
      if (entryId.startsWith('hash_')) return false;
      return entryId === normalizedMsgId || entryId === pureMessageId;
    });
  }

  /**
   * Finds entry by pure ID match
   * @param {Array} channelCrits - Channel crit history
   * @param {string} normalizedMsgId - Normalized message ID
   * @param {string} pureMessageId - Pure Discord ID
   * @returns {Object|null} Matched entry or null
   */
  _findEntryByPureId(channelCrits, normalizedMsgId, pureMessageId) {
    return channelCrits.find((entry) => {
      const entryId = String(entry.messageId).trim();
      if (entryId.startsWith('hash_')) return false;
      const entryPureId = this.isValidDiscordId(entryId)
        ? entryId
        : entryId.match(/\d{17,19}/)?.[0];
      return (
        (pureMessageId && entryPureId && entryPureId === pureMessageId) ||
        normalizedMsgId.includes(entryId) ||
        entryId.includes(normalizedMsgId)
      );
    });
  }

  /**
   * Finds entry by content hash match
   * @param {Array} channelCrits - Channel crit history
   * @param {string} contentHash - Content hash to match
   * @returns {Object|null} Matched entry or null
   */
  _findEntryByContentHash(channelCrits, contentHash) {
    return channelCrits.find((entry) => {
      const entryId = String(entry.messageId).trim();
      if (entryId.startsWith('hash_')) return false;
      return this._matchesByContentHash(entry, contentHash);
    });
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
      return this._createHistoryEntryFromPending(normalizedMsgId, pendingCrit);
    }

    // Try exact match
    let historyEntry = this._findEntryByExactId(channelCrits, normalizedMsgId, pureMessageId);

    // Try matching pure IDs
    if (!historyEntry) {
      historyEntry = this._findEntryByPureId(channelCrits, normalizedMsgId, pureMessageId);
    }

    // Try content-based matching
    if (!historyEntry && contentHash && messageContent && author) {
      historyEntry = this._findEntryByContentHash(channelCrits, contentHash);

      if (historyEntry) {
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

          const restorationObserver = new MutationObserver((mutations) => {
            const now = Date.now();
            // Throttle: Skip if checked recently
            if (now - lastRestorationCheck < this.RESTORATION_CHECK_THROTTLE_MS) return;
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

          // Cleanup observer after timeout
          setTimeout(() => {
            restorationObserver.disconnect();
          }, this.RESTORATION_OBSERVER_TIMEOUT_MS);
        }
      } else {
        // Only log non-matches if verbose (reduces spam)
        this.debug.verbose &&
          this.debugLog('CHECK_FOR_RESTORATION', 'No matching crit found in history', {
            channelId: this.currentChannelId,
          });
      }
    } else {
      // Only log this warning in verbose mode - it's normal for some elements to not have message IDs yet
      this.debug?.verbose &&
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
  // Handles crit detection, queued messages, and crit processing

  // ----------------------------------------------------------------------------
  // Crit Detection Constants
  // ----------------------------------------------------------------------------

  /**
   * Hash modulo divisor for crit roll calculation
   * @type {number}
   */
  get CRIT_ROLL_DIVISOR() {
    return 10000;
  }

  /**
   * Crit roll scale factor (converts hash to 0-100 range)
   * @type {number}
   */
  get CRIT_ROLL_SCALE() {
    return 100;
  }

  /**
   * Gradient verification delay in milliseconds
   * @type {number}
   */
  get GRADIENT_VERIFICATION_DELAY_MS() {
    return 100;
  }

  // ----------------------------------------------------------------------------
  // Queued Message Handling
  // ----------------------------------------------------------------------------

  /**
   * Creates crit settings object from current settings
   * @returns {Object} Crit settings object
   */
  _createCritSettings() {
    return {
      gradient: this.settings.critGradient !== false,
      color: this.settings.critColor,
      font: this.settings.critFont,
      glow: this.settings.critGlow,
      animation: this.settings.animationEnabled !== false,
    };
  }

  /**
   * Calculates crit roll from seed string
   * @param {string} seed - Seed string for deterministic randomness
   * @returns {number} Roll value (0-100)
   */
  _calculateRollFromSeed(seed) {
    const hash = this.simpleHash(seed);
    return (hash % this.CRIT_ROLL_DIVISOR) / this.CRIT_ROLL_SCALE;
  }

  /**
   * Handles queued messages with hash IDs (messages without Discord IDs yet)
   * Detects if they would be crits and adds them to pending queue
   * @param {string} messageId - The hash message ID
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message was handled (should return early)
   */
  handleQueuedMessage(messageId, messageElement) {
    if (!messageId?.startsWith('hash_')) return false;

    const content = this.findMessageContentElement(messageElement);
    const author = this.getAuthorId(messageElement);
    const channelId = this._getCurrentChannelId();

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
    const seed = `${contentHash}:${channelId}:${author}`;
    const critRoll = this._calculateRollFromSeed(seed);
    const critChance = this.getEffectiveCritChance();
    const wouldBeCrit = critRoll <= critChance;

    if (wouldBeCrit) {
      const critSettings = this._createCritSettings();
      const guildId = this.currentGuildId || 'dm';

      this.pendingCrits.set(contentHash, {
        critSettings,
        timestamp: Date.now(),
        channelId,
        guildId,
        messageContent: contentText,
        author,
        contentHash,
        isHashId: true,
      });

      return true;
    }

    this.debugLog('CHECK_FOR_CRIT', 'Skipping hash ID (likely unsent/pending message)', {
      messageId,
      note: 'Hash IDs are created for messages without Discord IDs - crits are stored in pending queue and will be applied when real ID is assigned',
    });
    return true;
  }

  // ----------------------------------------------------------------------------
  // Crit Roll Calculation
  // ----------------------------------------------------------------------------

  /**
   * Creates seed string for crit roll calculation
   * @param {string} messageId - Message ID
   * @param {string} author - Author ID
   * @param {string} contentHash - Optional content hash
   * @returns {string} Seed string
   */
  _createCritRollSeed(messageId, author, contentHash = null) {
    if (contentHash) {
      return `${contentHash}:${this.currentChannelId}:${author}`;
    }
    return `${messageId}:${this.currentChannelId}:${author}`;
  }

  /**
   * Calculates deterministic crit roll for a message
   * @param {string} messageId - The message ID
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {number} Roll value (0-100)
   */
  calculateCritRoll(messageId, messageElement) {
    if (!messageId) return Math.random() * 100;

    const author = this.getAuthorId(messageElement) || '';

    // Try content-based seed first (matches queued message detection)
    const content = this.findMessageContentElement(messageElement);
    const contentText = content?.textContent?.trim();

    if (content && author && contentText) {
      const contentHash = this.calculateContentHash(author, contentText);
      const seed = this._createCritRollSeed(messageId, author, contentHash);
      return this._calculateRollFromSeed(seed);
    }

    // Fallback to message ID
    const seed = this._createCritRollSeed(messageId, author);
    return this._calculateRollFromSeed(seed);
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
      try {
        this.applyCritStyle(messageElement);

        // FIX: Find the actual message element that has the class (must match what applyCritStyle uses)
        let elementWithClass = messageElement;
        const isContentElement =
          messageElement?.classList?.contains('messageContent') ||
          messageElement?.classList?.contains('markup') ||
          messageElement?.id?.includes('message-content');

        if (isContentElement) {
          // Find parent message wrapper using the SAME logic as applyCritStyle
          // This ensures we check the same element that got the class
          let candidate = messageElement.parentElement;
          while (candidate && candidate !== document.body) {
            const hasMessageClass =
              candidate.classList &&
              Array.from(candidate.classList).some(
                (cls) =>
                  cls.includes('message') &&
                  !cls.includes('messageContent') &&
                  !cls.includes('markup')
              );
            const hasDataMessageId = candidate.hasAttribute('data-message-id');

            if ((hasMessageClass || hasDataMessageId) && candidate !== messageElement) {
              elementWithClass = candidate;
              break;
            }
            candidate = candidate.parentElement;
          }

          // Fallback: try closest with more specific selector (same as applyCritStyle)
          if (elementWithClass === messageElement) {
            elementWithClass =
              messageElement.closest('[class*="messageListItem"]') ||
              messageElement.closest('[class*="messageGroup"]') ||
              messageElement.closest('[data-message-id]');

            if (elementWithClass === messageElement) {
              elementWithClass = null;
            }
          }

          if (!elementWithClass) {
            elementWithClass = messageElement; // Final fallback
          }
        }
      } catch (error) {
        throw error; // Re-throw to be caught by outer try-catch
      }
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

                // CRITICAL FIX: Add delay before gradient verification
                setTimeout(() => {
                  const gradientCheck = this.verifyGradientApplied(contentElement);
                  const hasGradient = gradientCheck.hasGradient || gradientCheck.hasGradientInStyle;
                  const hasWebkitClip = gradientCheck.hasWebkitClip;

                  if (hasGradient && hasWebkitClip) {
                    this.onCritHit(currentElement);
                  }
                }, this.GRADIENT_VERIFICATION_DELAY_MS);
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
    // Only log non-crit messages in verbose debug mode to reduce console noise
    this.debug?.verbose &&
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
      let messageId = this.getMessageIdentifier(messageElement, {
        phase: 'check_for_crit',
        verbose: true,
      }); // Validate message ID is correct (not channel ID)

      // Only warn about invalid message IDs if it's NOT a content hash (content hashes are intentional fallbacks)
      const isContentHash = messageId && messageId.startsWith('hash_');
      if (
        messageId &&
        !isContentHash &&
        (!this.isValidDiscordId(messageId) || messageId.length < 17)
      ) {
        this.debugLog('CHECK_FOR_CRIT', 'WARNING: Invalid message ID extracted', {
          messageId,
          length: messageId?.length,
          elementId: messageElement.getAttribute('id'),
          note: 'This might be a channel ID instead of message ID',
        });
      }

      this.debug?.verbose &&
        this.debugLog('CHECK_FOR_CRIT', 'Message detected for crit check', {
          messageId: messageId || 'unknown',
          hasElement: !!messageElement,
          elementValid: !!messageElement?.offsetParent,
          processedCount: this.processedMessages.size,
        });

      // CRITICAL FIX: Reject channel IDs - if messageId matches currentChannelId, it's wrong!
      if (messageId && messageId === this.currentChannelId) {
        this.debugLog('CHECK_FOR_CRIT', 'WARNING: Rejected channel ID as message ID', {
          rejectedId: messageId,
          currentChannelId: this.currentChannelId,
        });
        // Try to get real message ID from React fiber
        messageId = null; // Will retry with React fiber traversal
      }

      // Atomically check and mark as processed - return early if no ID or already processed
      // BUT: Allow processing if messageId is null (new messages might not have ID yet)
      // We'll get the ID during processing
      if (!messageId) {
        // Try one more time with React fiber traversal (might not have been ready before)
        const retryMessageId = this.getMessageIdentifier(messageElement, {
          phase: 'check_for_crit_retry',
          verbose: true,
        });

        if (retryMessageId && retryMessageId !== this.currentChannelId) {
          messageId = retryMessageId;
        } else {
          // Still no valid ID - use content hash as fallback but still process
          const content = messageElement.textContent?.trim() || '';
          const author = this.getAuthorId(messageElement);
          if (content) {
            messageId = author
              ? this.calculateContentHash(author, content)
              : this.calculateContentHash(null, content);
            this.debugLog('CHECK_FOR_CRIT', 'Using content hash as message ID fallback', {
              messageId,
              contentPreview: content.substring(0, 50),
            });
          } else {
            this.debugLog('CHECK_FOR_CRIT', 'Cannot process message without content or ID');
            return;
          }
        }
      }

      // Define isValidDiscordId and isHashId at the top so they're available throughout the method
      // CRITICAL FIX: Check if messageId exists before calling .startsWith()
      if (!messageId) {
        this.debugLog('CHECK_FOR_CRIT', 'Cannot process message without ID', {
          hasElement: !!messageElement,
          elementValid: !!messageElement?.offsetParent,
        });
        return;
      }

      const isValidDiscordId = this.isValidDiscordId(messageId);
      const isHashId = messageId.startsWith('hash_'); // Handle queued messages (hash IDs) - detect crits but don't apply styling yet
      if (isHashId && this.handleQueuedMessage(messageId, messageElement)) {
        return;
      }

      // Check history FIRST before marking as processed
      // This ensures we use the saved determination if message was already processed
      let historyEntry = null;
      if (messageId) {
        // Include guild ID in history lookup for accuracy across guilds
        const guildId = this.currentGuildId || 'dm';
        historyEntry = this.messageHistory.find(
          (e) =>
            e.messageId === messageId &&
            e.channelId === this.currentChannelId &&
            (e.guildId || 'dm') === guildId
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
              const author = this.getAuthorId(messageElement) || '';
              const seed = `${contentHash}:${this.currentChannelId}:${author}`;
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
            Array.from(this.animatedMessages.entries()).find(([msgId, animData]) => {
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
            });
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
            }
          }

          // Don't mark as processed again - already in history
          // But mark in processedMessages to skip future checks (efficiency)
          messageId && this.processedMessages.add(messageId);
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
        // But mark in processedMessages to skip future checks (efficiency)
        // CRITICAL: Only mark if it's not a channel ID
        if (messageId && messageId !== this.currentChannelId) {
          this.processedMessages.add(messageId);
        }
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
      const isCrit = roll <= effectiveCritChance;

      this.debug?.verbose &&
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
  // Handles application of crit styling (gradient, font, glow, animation)

  // ----------------------------------------------------------------------------
  // Styling Constants
  // ----------------------------------------------------------------------------

  /**
   * Default gradient colors for crit styling
   * @type {string}
   */
  get DEFAULT_GRADIENT_COLORS() {
    return 'linear-gradient(to right, #8b5cf6 0%, #7c3aed 15%, #6d28d9 30%, #4c1d95 45%, #312e81 60%, #1e1b4b 75%, #0f0f23 85%, #000000 95%, #000000 100%)';
  }

  /**
   * Content selectors for finding message content
   * @type {Array<string>}
   */
  get CONTENT_SELECTORS() {
    return ['[class*="messageContent"]', '[class*="markup"]', '[class*="textContainer"]'];
  }

  /**
   * Text element selectors for finding specific text elements
   * @type {Array<string>}
   */
  get TEXT_ELEMENT_SELECTORS() {
    return ['span', 'div', 'p'];
  }

  // ----------------------------------------------------------------------------
  // Content Element Discovery
  // ----------------------------------------------------------------------------

  /**
   * Checks if element is already a content element
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if is content element
   */
  _isContentElement(element) {
    if (!element?.classList) return false;
    return (
      element.classList.contains('messageContent') ||
      element.classList.contains('markup') ||
      element.id?.includes('message-content')
    );
  }

  /**
   * Finds all message content elements in message
   * @param {HTMLElement} messageElement - Message element
   * @returns {Array<HTMLElement>} Array of content elements
   */
  _findAllMessageContents(messageElement) {
    return Array.from(messageElement.querySelectorAll('[class*="messageContent"]'));
  }

  /**
   * Finds text elements within content that are not in header
   * @param {HTMLElement} content - Content element
   * @returns {HTMLElement|null} Best text element or null
   */
  _findTextElementInContent(content) {
    const allTextElements = content.querySelectorAll(this.TEXT_ELEMENT_SELECTORS.join(', '));
    return Array.from(allTextElements).reduce((best, textEl) => {
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
    }, null);
  }

  /**
   * Checks if parent has username/timestamp elements
   * @param {HTMLElement} content - Content element
   * @returns {boolean} True if parent has header elements
   */
  _parentHasHeaderElements(content) {
    const parent = content.parentElement;
    if (!parent) return false;

    const hasUsernameInParent =
      parent.querySelector('[class*="username"]') !== null ||
      parent.querySelector('[class*="timestamp"]') !== null ||
      parent.querySelector('[class*="author"]') !== null;

    if (hasUsernameInParent) return true;

    const siblings = Array.from(parent.children);
    return siblings.some((sib) => {
      const classes = Array.from(sib.classList || []);
      return classes.some(
        (c) => c.includes('username') || c.includes('timestamp') || c.includes('author')
      );
    });
  }

  /**
   * Finds the message content element for styling, avoiding header areas
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {HTMLElement|null} The content element or null if not found
   */
  findMessageContentForStyling(messageElement) {
    if (!messageElement) return null;

    // If messageElement is already a content element, use it directly
    if (this._isContentElement(messageElement) && !this.isInHeaderArea(messageElement)) {
      this.debugLog('APPLY_CRIT_STYLE', 'Using provided element as content', {
        elementTag: messageElement.tagName,
        classes: Array.from(messageElement.classList || []),
      });
      return messageElement;
    }

    // Try content selectors in order
    for (const selector of this.CONTENT_SELECTORS) {
      const elements = messageElement.querySelectorAll(selector);
      const found = Array.from(elements).find((el) => !this.isInHeaderArea(el));
      if (found) {
        this.debugLog('APPLY_CRIT_STYLE', `Found content via ${selector}`, {
          elementTag: found.tagName,
          classes: Array.from(found.classList || []),
        });

        // Check if parent has header elements - if so, find more specific text element
        if (this._parentHasHeaderElements(found)) {
          const textElement = this._findTextElementInContent(found);
          if (textElement) return textElement;

          const markupElement = found.querySelector('[class*="markup"]');
          if (markupElement && !this.isInHeaderArea(markupElement)) {
            return markupElement;
          }
        }

        return found;
      }
    }

    this.debugLog('APPLY_CRIT_STYLE', 'Could not find content element - skipping');
    return null;
  }

  // ----------------------------------------------------------------------------
  // Style Application Helpers
  // ----------------------------------------------------------------------------

  /**
   * Applies gradient styles to content element (used in applyCritStyle)
   * @param {HTMLElement} content - The content element
   * @param {HTMLElement} messageElement - The parent message element
   */
  applyGradientToContentForStyling(content, messageElement) {
    content.classList.add('bd-crit-text-content');
    this.applyGradientStyles(content, messageElement, this.DEFAULT_GRADIENT_COLORS);
  }

  /**
   * Applies solid color styles to content element (used in applyCritStyle)
   * @param {HTMLElement} content - The content element
   * @param {HTMLElement} messageElement - The parent message element
   */
  applySolidColorToContentForStyling(content, messageElement) {
    content.classList.add('bd-crit-text-content');
    // Use applyStyles helper instead of individual setProperty calls
    this.applyStyles(content, {
      color: this.settings.critColor,
      background: 'none',
      '-webkit-background-clip': 'unset',
      'background-clip': 'unset',
      '-webkit-text-fill-color': 'unset',
    });

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
        this.applyStyles(content, {
          'text-shadow':
            '0 0 3px rgba(139, 92, 246, 0.5), 0 0 6px rgba(124, 58, 237, 0.4), 0 0 9px rgba(109, 40, 217, 0.3), 0 0 12px rgba(91, 33, 182, 0.2)',
        });
      } else {
        this.applyStyles(content, {
          'text-shadow': `0 0 2px ${this.settings.critColor}, 0 0 3px ${this.settings.critColor}`,
        });
      }
    } else {
      this.applyStyles(content, { 'text-shadow': 'none' });
    }
  }

  applyCritStyle(messageElement) {
    try {
      this.debugLog('APPLY_CRIT_STYLE', 'Applying crit style to message');

      // FIX: If we received a content element instead of message wrapper, find the parent message element
      let actualMessageElement = messageElement;
      const isContentElement =
        messageElement?.classList?.contains('messageContent') ||
        messageElement?.classList?.contains('markup') ||
        messageElement?.id?.includes('message-content');

      if (isContentElement) {
        // Find parent message wrapper - must be a DIFFERENT element (not the same one)
        let candidate = messageElement.parentElement;
        while (candidate && candidate !== document.body) {
          // Check if this candidate is a message wrapper (has message classes but NOT content classes)
          const hasMessageClass =
            candidate.classList &&
            Array.from(candidate.classList).some(
              (cls) =>
                cls.includes('message') &&
                !cls.includes('messageContent') &&
                !cls.includes('markup')
            );
          const hasDataMessageId = candidate.hasAttribute('data-message-id');

          if ((hasMessageClass || hasDataMessageId) && candidate !== messageElement) {
            actualMessageElement = candidate;
            break;
          }
          candidate = candidate.parentElement;
        }

        // Fallback: try closest with more specific selector
        if (actualMessageElement === messageElement) {
          actualMessageElement =
            messageElement.closest('[class*="messageListItem"]') ||
            messageElement.closest('[class*="messageGroup"]') ||
            messageElement.closest('[data-message-id]');

          // Ensure it's different from the original
          if (actualMessageElement === messageElement) {
            actualMessageElement = null;
          }
        }

        if (!actualMessageElement || actualMessageElement === messageElement) {
          // If we can't find a different parent, use the content element itself but find content differently
          actualMessageElement = messageElement;
          // We'll handle this case in findMessageContentForStyling by using the element itself
        }
      }

      this.debugLog('APPLY_CRIT_STYLE', 'Finding message content element', {
        messageElementClasses: Array.from(actualMessageElement.classList || []),
      });

      // Find message content using helper function (now using the correct message element)
      const content = this.findMessageContentForStyling(actualMessageElement);

      if (!content) {
        return;
      }

      // Apply critical hit styling to the entire message content container
      try {
        this.debug?.verbose &&
          this.debugLog('APPLY_CRIT_STYLE', 'Applying crit style', {
            useGradient: this.settings.critGradient !== false,
            critColor: this.settings.critColor,
          });

        // Apply styles to the entire content container (sentence-level, not letter-level)
        {
          // Apply gradient or solid color (use actualMessageElement, not the original parameter)
          const useGradient = this.settings.critGradient !== false;
          if (useGradient) {
            this.applyGradientToContentForStyling(content, actualMessageElement);
          } else {
            this.applySolidColorToContentForStyling(content, actualMessageElement);
          }

          // Apply font and glow styles
          this.applyFontStyles(content);
          this.applyGlowToContentForStyling(content, useGradient);

          // Add animation if enabled
          this.settings?.critAnimation && (content.style.animation = 'critPulse 0.5s ease-in-out');
        }

        // Add a class for easier identification (use actualMessageElement, not the original parameter)
        actualMessageElement.classList.add('bd-crit-hit');

        // Verify gradient was actually applied and get computed styles
        const useGradient = this.settings.critGradient !== false;

        // Force a reflow to ensure styles are computed
        void content.offsetHeight;

        const gradientCheck = this.verifyGradientApplied(content);
        const hasGradientInStyle = gradientCheck.hasGradientInStyle;
        const hasGradientInComputed = gradientCheck.hasGradient;
        const _hasWebkitClip = gradientCheck.hasWebkitClip; // Available for debugging if needed
        const computedStyles = content ? window.getComputedStyle(content) : null;

        // If gradient didn't apply correctly, retry with MutationObserver to catch DOM changes
        if (content && useGradient && !hasGradientInComputed) {
          this.debugLog('APPLY_CRIT_STYLE', 'WARNING: Gradient not applied correctly, will retry', {
            hasGradientInStyle,
            hasGradientInComputed,
            computedBackgroundImage: computedStyles?.backgroundImage,
          });

          // Retry after a short delay to catch DOM updates
          // Use multiple retries with increasing delays to handle rapid messages
          const retryGradient = (attempt = 1, maxAttempts = 5) => {
            setTimeout(() => {
              if (content && actualMessageElement?.classList?.contains('bd-crit-hit')) {
                const retryComputed = window.getComputedStyle(content);
                const retryHasGradient = retryComputed?.backgroundImage?.includes('gradient');

                if (!retryHasGradient && useGradient && attempt <= maxAttempts) {
                  // Force reapply gradient with stronger styles
                  const gradientStyles = this.createGradientStyles(this.DEFAULT_GRADIENT_COLORS);
                  this.applyStyles(content, gradientStyles);

                  // Force reflow
                  void content.offsetHeight;

                  // Retry again if still not applied
                  if (attempt < maxAttempts) {
                    retryGradient(attempt + 1, maxAttempts);
                  }
                }
              }
            }, 50 * attempt); // Increasing delay: 50ms, 100ms, 150ms, 200ms, 250ms
          };
          retryGradient();
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
  // FONT LOADING HELPERS
  // ============================================================================
  // Handles loading fonts from local files and Google Fonts

  // ----------------------------------------------------------------------------
  // Font Loading Constants
  // ----------------------------------------------------------------------------

  /**
   * Default font name for crit messages
   * @type {string}
   */
  get DEFAULT_CRIT_FONT() {
    return 'Friend or Foe BB';
  }

  /**
   * Default animation font name
   * @type {string}
   */
  get DEFAULT_ANIMATION_FONT() {
    return 'Metal Mania';
  }

  /**
   * Font verification delay in milliseconds
   * @type {number}
   */
  get FONT_VERIFICATION_DELAY_MS() {
    return 100;
  }

  /**
   * Font verification size for checking
   * @type {string}
   */
  get FONT_VERIFICATION_SIZE() {
    return '16px';
  }

  /**
   * Font name to filename mapping
   * @type {Object<string, string>}
   */
  get FONT_FILENAME_MAP() {
    return {
      'friend or foe': 'FriendorFoeBB',
      'friend or foe bb': 'FriendorFoeBB',
      'metal mania': 'MetalMania',
      'speedy space goat': 'SpeedySpaceGoatOddity',
      'speedy goat': 'SpeedySpaceGoatOddity',
    };
  }

  /**
   * Fonts that require local files (not on Google Fonts)
   * @type {Array<string>}
   */
  get LOCAL_ONLY_FONTS() {
    return ['friend or foe', 'friend or foe bb', 'metal mania', 'speedy space goat', 'speedy goat'];
  }

  // ----------------------------------------------------------------------------
  // Font Path Discovery
  // ----------------------------------------------------------------------------

  /**
   * Gets plugins folder from BdApi
   * @returns {string|null} Plugins folder path or null
   */
  _getPluginsFolderFromBdApi() {
    if (typeof BdApi !== 'undefined' && BdApi.Plugins?.folder) {
      const pluginsFolder = BdApi.Plugins.folder;
      return pluginsFolder.endsWith('/') ? pluginsFolder : `${pluginsFolder}/`;
    }
    return null;
  }

  /**
   * Gets plugins folder from script src
   * @returns {string|null} Plugins folder path or null
   */
  _getPluginsFolderFromScript() {
    try {
      const scripts = Array.from(document.getElementsByTagName('script'));
      const pluginScript = scripts.find(
        (script) => script.src && script.src.includes('CriticalHit.plugin.js')
      );

      if (pluginScript?.src) {
        // eslint-disable-next-line no-undef
        const URLConstructor = typeof URL !== 'undefined' ? URL : null;
        const scriptUrl = URLConstructor
          ? new URLConstructor(pluginScript.src)
          : { pathname: pluginScript.src };
        const scriptPath = scriptUrl.pathname;
        return scriptPath.substring(0, scriptPath.lastIndexOf('/'));
      }
    } catch (error) {
      // Script parsing failed
    }
    return null;
  }

  /**
   * Gets the path to the fonts folder for local font loading
   * @returns {string} Path to fonts folder
   */
  getFontsFolderPath() {
    try {
      const pluginsFolder = this._getPluginsFolderFromBdApi() || this._getPluginsFolderFromScript();
      if (pluginsFolder) {
        return `${pluginsFolder}CriticalHit/fonts/`;
      }
    } catch (error) {
      this.debugError('FONT_LOADER', error, { phase: 'get_fonts_path' });
    }

    return './CriticalHit/fonts/';
  }

  // ----------------------------------------------------------------------------
  // Font Name Helpers
  // ----------------------------------------------------------------------------

  /**
   * Normalizes font name for use in IDs
   * @param {string} fontName - Font name
   * @returns {string} Normalized font name
   */
  _normalizeFontNameForId(fontName) {
    return fontName.replace(/\s+/g, '-').toLowerCase();
  }

  /**
   * Gets font file name from font name
   * @param {string} fontName - Font name
   * @returns {string} Font file name
   */
  _getFontFileName(fontName) {
    if (fontName.toLowerCase().includes('friend or foe')) return 'FriendorFoeBB';
    if (fontName.toLowerCase().includes('metal mania')) return 'MetalMania';
    if (
      fontName.toLowerCase().includes('speedy space goat') ||
      fontName.toLowerCase().includes('speedy goat')
    ) {
      return 'SpeedySpaceGoatOddity';
    }
    return fontName.replace(/\s+/g, '');
  }

  /**
   * Creates font family CSS string
   * @param {string} fontName - Font name
   * @returns {string} Font family CSS
   */
  _createFontFamily(fontName) {
    return `'${fontName}', sans-serif`;
  }

  /**
   * Gets font style element ID
   * @param {string} fontName - Font name
   * @returns {string} Style element ID
   */
  _getFontStyleId(fontName) {
    return `cha-font-${this._normalizeFontNameForId(fontName)}`;
  }

  /**
   * Creates @font-face CSS rule
   * @param {string} fontName - Font name
   * @param {string} fontsPath - Fonts folder path
   * @param {string} fontFileName - Font file name
   * @returns {string} CSS text
   */
  _createFontFaceCSS(fontName, fontsPath, fontFileName) {
    return `
      @font-face {
        font-family: '${fontName}';
        src: url('${fontsPath}${fontFileName}.woff2') format('woff2'),
             url('${fontsPath}${fontFileName}.woff') format('woff'),
             url('${fontsPath}${fontFileName}.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }
    `;
  }

  /**
   * Verifies font is loaded
   * @param {string} fontName - Font name
   * @param {string} fontsPath - Fonts folder path
   */
  _verifyFontLoaded(fontName, fontsPath) {
    if (document.fonts?.check) {
      // Use Font Loading API to wait for fonts to load before verifying
      document.fonts.ready
        .then(() => {
          // Additional delay to ensure font is fully loaded
          return new Promise((resolve) => {
            setTimeout(resolve, 500);
          });
        })
        .then(() => {
          const fontLoaded = document.fonts.check(`16px '${fontName}'`);
          if (!fontLoaded) {
            this.debugLog('FONT_LOADER', `Font '${fontName}' may not have loaded correctly`, {
              fontName,
              fontsPath,
              note: 'Check that font files exist in fonts/ folder',
            });
          }
        })
        .catch(() => {
          // Silently ignore font loading errors (font may still work)
        });
    }
  }

  /**
   * Extracts font name from font string
   * @param {string} fontString - Font string (may include quotes, fallbacks)
   * @returns {string} Extracted font name
   */
  _extractFontName(fontString) {
    if (!fontString) return null;
    return fontString.replace(/'/g, '').replace(/"/g, '').split(',')[0].trim();
  }

  /**
   * Checks if font name matches pattern
   * @param {string} fontName - Font name
   * @param {string} pattern - Pattern to match
   * @returns {boolean} True if matches
   */
  _matchesFontPattern(fontName, pattern) {
    return fontName.toLowerCase().includes(pattern.toLowerCase());
  }

  /**
   * Checks if font requires local files
   * @param {string} fontName - Font name
   * @returns {boolean} True if requires local files
   */
  _requiresLocalFont(fontName) {
    const lowerName = fontName.toLowerCase();
    return (
      this._matchesFontPattern(lowerName, 'metal mania') ||
      this._matchesFontPattern(lowerName, 'vampire wars') ||
      this._matchesFontPattern(lowerName, 'speedy space goat') ||
      this._matchesFontPattern(lowerName, 'speedy goat')
    );
  }

  /**
   * Checks if font is Nova Flat
   * @param {string} fontName - Font name
   * @returns {boolean} True if Nova Flat
   */
  _isNovaFlat(fontName) {
    return this._matchesFontPattern(fontName, 'nova flat');
  }

  /**
   * Tries to load local font with warning
   * @param {string} fontName - Font name
   * @param {string} warningMessage - Warning message
   * @returns {boolean} True if loaded
   */
  _tryLoadLocalFontWithWarning(fontName, warningMessage) {
    if (this.settings.useLocalFonts) {
      const loaded = this.loadLocalFont(fontName);
      if (loaded) return true;
    }
    this.debugLog('FONT_LOADER', warningMessage, { fontName });
    return this.loadGoogleFont(fontName);
  }

  /**
   * Helper: Loads font from local files with multiple format support
   * Supports woff2, woff, and ttf formats with automatic fallback
   * @param {string} fontName - Name of the font (e.g., 'Nova Flat', 'Impact')
   * @param {string} fontFamily - CSS font-family name (can include fallbacks)
   * @returns {boolean} True if font was loaded successfully
   */
  loadLocalFont(fontName, fontFamily = null) {
    if (!fontFamily) {
      fontFamily = `'${fontName}', sans-serif`;
    }

    try {
      // Check if font is already loaded
      const existingStyle = document.getElementById(
        `cha-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`
      );
      if (existingStyle) {
        return true; // Font already loaded
      }

      const fontsPath = this.getFontsFolderPath();
      // Handle special font name cases - map display names to file names
      let fontFileName = fontName.replace(/\s+/g, ''); // Remove spaces for filename
      if (fontName.toLowerCase().includes('friend or foe')) {
        fontFileName = 'FriendorFoeBB'; // Exact filename match
      } else if (fontName.toLowerCase().includes('metal mania')) {
        fontFileName = 'MetalMania'; // Exact filename match
      } else if (fontName.toLowerCase().includes('speedy space goat')) {
        fontFileName = 'SpeedySpaceGoatOddity'; // Exact filename match (for Shadow Arise plugin)
      }

      // Create @font-face with multiple format support
      const fontStyle = document.createElement('style');
      fontStyle.id = `cha-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
      fontStyle.textContent = `
        @font-face {
          font-family: '${fontName}';
          src: url('${fontsPath}${fontFileName}.woff2') format('woff2'),
               url('${fontsPath}${fontFileName}.woff') format('woff'),
               url('${fontsPath}${fontFileName}.ttf') format('truetype');
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `;

      document.head.appendChild(fontStyle);

      // Verify font loaded (non-blocking, delayed check)
      // Use Font Loading API to wait for fonts to load before verifying
      if (document.fonts && document.fonts.check) {
        // Wait for fonts to be ready, then verify after additional delay
        document.fonts.ready
          .then(() => {
            // Additional delay to ensure font is fully loaded
            setTimeout(() => {
              // Check if font is loaded
              const fontLoaded = document.fonts.check(`16px '${fontName}'`);
              if (!fontLoaded) {
                // Only warn if font still not loaded after waiting
                this.debugLog('FONT_LOADER', `Font '${fontName}' may not have loaded correctly`, {
                  fontName,
                  fontsPath,
                  note: 'Check that font files exist in fonts/ folder',
                });
              }
            }, 500);
          })
          .catch(() => {
            // Silently ignore font loading errors (font may still work)
          });
      }

      return true;
    } catch (error) {
      this.debugError('FONT_LOADER', error, {
        phase: 'load_local_font',
        fontName,
        fontFamily,
      });
      return false;
    }
  }

  // ----------------------------------------------------------------------------
  // Google Fonts Loading
  // ----------------------------------------------------------------------------

  /**
   * Gets Google Fonts link ID
   * @param {string} fontName - Font name
   * @returns {string} Link element ID
   */
  _getGoogleFontLinkId(fontName) {
    return `cha-google-font-${this._normalizeFontNameForId(fontName)}`;
  }

  /**
   * Converts font name to Google Fonts URL format
   * @param {string} fontName - Font name
   * @returns {string} URL-formatted font name
   */
  _convertToGoogleFontsUrl(fontName) {
    return fontName.replace(/\s+/g, '+');
  }

  /**
   * Helper: Loads font from Google Fonts (fallback method)
   * @param {string} fontName - Name of the font (e.g., 'Nova Flat')
   * @returns {boolean} True if font link was created
   */
  loadGoogleFont(fontName) {
    if (!fontName) return false;

    try {
      const fontId = this._getGoogleFontLinkId(fontName);
      if (document.getElementById(fontId)) {
        return true;
      }

      const fontLink = document.createElement('link');
      fontLink.id = fontId;
      fontLink.rel = 'stylesheet';
      fontLink.href = `https://fonts.googleapis.com/css2?family=${this._convertToGoogleFontsUrl(
        fontName
      )}&display=swap`;
      document.head.appendChild(fontLink);
      return true;
    } catch (error) {
      this.debugError('FONT_LOADER', error, { phase: 'load_google_font', fontName });
      return false;
    }
  }

  /**
   * Helper: Loads message font (critFont) - Friend or Foe BB for critical hit message text
   * Uses local files for Friend or Foe BB, Google Fonts for fallback
   * @param {string} fontName - Name of the font to load (default: Friend or Foe BB)
   * @returns {boolean} True if font was loaded
   */
  loadCritFont(fontName = null) {
    const fontToLoad =
      fontName ||
      this.settings.critFont?.replace(/'/g, '').replace(/"/g, '').split(',')[0].trim() ||
      'Friend or Foe BB';
    // Message fonts: Friend or Foe BB (Solo Leveling theme) uses local files
    // Nova Flat uses Google Fonts for fallback
    const isFriendOrFoe =
      fontToLoad.toLowerCase().includes('friend or foe') ||
      fontToLoad.toLowerCase() === 'friend or foe bb';
    const isVampireWars =
      fontToLoad.toLowerCase().includes('vampire wars') ||
      fontToLoad.toLowerCase() === 'vampire wars';
    const isNovaFlat =
      fontToLoad.toLowerCase().includes('nova flat') || fontToLoad.toLowerCase() === 'nova flat';
    const isSpeedyGoat =
      fontToLoad.toLowerCase().includes('speedy space goat') ||
      fontToLoad.toLowerCase().includes('speedy goat');

    // Friend or Foe BB is not on Google Fonts, so try local first
    if (isFriendOrFoe) {
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      // If local fails and useLocalFonts is false, warn user
      this.debugLog(
        'FONT_LOADER',
        'Friend or Foe BB requires local font files. Enable useLocalFonts and ensure font is in fonts/ folder.',
        {
          fontName: fontToLoad,
        }
      );
      // Try Google anyway (will fail gracefully)
      return this.loadGoogleFont(fontToLoad);
    }

    if (isVampireWars) {
      // Vampire Wars is not on Google Fonts, so try local first
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      // If local fails, try Google anyway (will fail gracefully)
      return this.loadGoogleFont(fontToLoad);
    }

    if (isSpeedyGoat) {
      // Speedy Space Goat Oddity is not on Google Fonts, so try local first
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      // If local fails, warn user
      this.debugLog(
        'FONT_LOADER',
        'Speedy Space Goat Oddity requires local font files. Enable useLocalFonts and ensure font is in fonts/ folder.',
        {
          fontName: fontToLoad,
        }
      );
      // Try Google anyway (will fail gracefully)
      return this.loadGoogleFont(fontToLoad);
    }

    // For Nova Flat and other Google Fonts, use Google Fonts
    if (isNovaFlat) {
      return this.loadGoogleFont(fontToLoad);
    }

    // For other fonts, try Google first, fallback to local
    return this.loadFont(fontToLoad, true);
  }

  // ============================================================================
  // CSS INJECTION METHODS
  // ============================================================================
  // Handles injection of CSS styles for animations, crit messages, and settings panel

  // ----------------------------------------------------------------------------
  // CSS Injection Constants
  // ----------------------------------------------------------------------------

  /**
   * CSS style element IDs
   * @type {Object<string, string>}
   */
  get CSS_STYLE_IDS() {
    return {
      animation: 'cha-styles',
      crit: 'bd-crit-hit-styles',
      settings: 'bd-crit-hit-settings-styles',
      novaFlat: 'bd-crit-hit-nova-flat-font',
    };
  }

  /**
   * Google Fonts base URL
   * @type {string}
   */
  get GOOGLE_FONTS_BASE_URL() {
    return 'https://fonts.googleapis.com/css2';
  }

  /**
   * Font check throttle interval in milliseconds
   * @type {number}
   */
  get FONT_CHECK_THROTTLE_MS() {
    return 200;
  }

  /**
   * Gradient verification timeout in milliseconds
   * @type {number}
   */
  get GRADIENT_VERIFICATION_TIMEOUT_MS() {
    return 2000;
  }

  /**
   * Reduced throttle for verified messages in milliseconds
   * @type {number}
   */
  get VERIFIED_MESSAGE_THROTTLE_MS() {
    return 50;
  }

  /**
   * Throttle cleanup cutoff time in milliseconds
   * @type {number}
   */
  get THROTTLE_CLEANUP_CUTOFF_MS() {
    return 5000;
  }

  /**
   * Maximum throttle map size before cleanup
   * @type {number}
   */
  get MAX_THROTTLE_MAP_SIZE() {
    return 1000;
  }

  /**
   * Animation cooldown in milliseconds
   * @type {number}
   */
  get ANIMATION_COOLDOWN_MS() {
    return 100;
  }

  /**
   * Combo timeout in milliseconds (15 seconds)
   * @type {number}
   */
  get COMBO_TIMEOUT_MS() {
    return 15000;
  }

  /**
   * Combo reset timeout in milliseconds (5 seconds)
   * @type {number}
   */
  get COMBO_RESET_TIMEOUT_MS() {
    return 5000;
  }

  /**
   * Position tolerance for duplicate detection in pixels
   * @type {number}
   */
  get POSITION_TOLERANCE() {
    return 50;
  }

  /**
   * Time tolerance for duplicate detection in milliseconds
   * @type {number}
   */
  get TIME_TOLERANCE_MS() {
    return 2000;
  }

  /**
   * Element position tolerance for fallback lookup in pixels
   * @type {number}
   */
  get ELEMENT_POSITION_TOLERANCE() {
    return 100;
  }

  /**
   * Fade out duration for existing animations in milliseconds
   * @type {number}
   */
  get FADE_OUT_DURATION_MS() {
    return 300;
  }

  /**
   * Cleanup delay buffer in milliseconds
   * @type {number}
   */
  get CLEANUP_DELAY_BUFFER_MS() {
    return 100;
  }

  /**
   * Maximum gradient verification attempts
   * @type {number}
   */
  get MAX_GRADIENT_VERIFICATION_ATTEMPTS() {
    return 3;
  }

  /**
   * Gradient verification retry delay in milliseconds
   * @type {number}
   */
  get GRADIENT_VERIFICATION_RETRY_DELAY_MS() {
    return 500;
  }

  // ----------------------------------------------------------------------------
  // Animation CSS Injection
  // ----------------------------------------------------------------------------

  /**
   * Removes old CSS style element by ID
   * @param {string} styleId - Style element ID
   */
  _removeOldStyle(styleId) {
    const oldStyle = document.getElementById(styleId);
    oldStyle && oldStyle.remove();
  }

  /**
   * Injects CSS styles for animations, screen shake, and combo display
   * Includes keyframe animations for float, fade, and shake effects
   */
  injectAnimationCSS() {
    const critFontName = this._extractFontName(this.settings.critFont) || this.DEFAULT_CRIT_FONT;
    this.loadCritFont(critFontName);

    const animationFontName = this.settings.animationFont || this.DEFAULT_ANIMATION_FONT;
    if (animationFontName !== critFontName) {
      this.loadCritAnimationFont(animationFontName);
    }

    this.loadGoogleFont('Nova Flat');

    if (this._matchesFontPattern(critFontName, 'friend or foe')) {
      this.settings.useLocalFonts = true;
    }

    this._removeOldStyle(this.CSS_STYLE_IDS.animation);

    // Extract font name for animation CSS (animation font only - message font is handled in injectCritCSS)
    const animFont = `'${animationFontName}', sans-serif`;

    const style = document.createElement('style');
    style.id = 'cha-styles';
    style.textContent = `
      @keyframes chaFloatUp {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) translateY(0) scale(1);
        }
        1% {
          opacity: 0.3;
          transform: translate(-50%, -50%) translateY(0) scale(1);
        }
        2% {
          opacity: 0.7;
          transform: translate(-50%, -50%) translateY(0) scale(1);
        }
        3% {
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
        font-family: ${animFont} !important;
        font-size: 3.5rem !important;
        font-weight: 900 !important;
        letter-spacing: 0.1em !important;
        /* Red to orange to yellow gradient for animation */
        background: linear-gradient(135deg,
          #ff0000 0%,
          #ff6600 50%,
          #ffff00 100%) !important;
        -webkit-background-clip: text !important;
        background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        color: #ff8800 !important;
        /* Reduced glow strength - gradient is hard to see with strong glow */
        filter: drop-shadow(0 0 3px rgba(255, 102, 0, 0.3))
                drop-shadow(0 0 6px rgba(255, 68, 68, 0.2)) !important;
        display: inline-block !important;
        /* Reduced text shadow for better gradient visibility */
        text-shadow:
          0 0 4px rgba(255, 136, 0, 0.4),
          0 0 8px rgba(255, 102, 0, 0.25) !important;
        /* Animation defined in CSS class - includes rotation for dynamic effect */
        animation: chaFloatUp var(--cha-duration, 4000ms) ease-out forwards;
        visibility: visible !important;
        min-width: 1px !important;
        min-height: 1px !important;
        will-change: transform, opacity !important;
        transform-origin: center center !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ----------------------------------------------------------------------------
  // Crit CSS Injection
  // ----------------------------------------------------------------------------

  /**
   * Creates Nova Flat font link element
   */
  _createNovaFlatFontLink() {
    if (document.getElementById(this.CSS_STYLE_IDS.novaFlat)) return;

    const fontLink = document.createElement('link');
    fontLink.id = this.CSS_STYLE_IDS.novaFlat;
    fontLink.rel = 'stylesheet';
    fontLink.href = `${this.GOOGLE_FONTS_BASE_URL}?family=Nova+Flat&display=swap`;
    document.head.appendChild(fontLink);
  }

  /**
   * Checks if element should have font applied (not in header)
   * @param {HTMLElement} el - Element to check
   * @returns {boolean} True if should apply font
   */
  _shouldApplyFontToElement(el) {
    return (
      !el.closest('[class*="username"]') &&
      !el.closest('[class*="timestamp"]') &&
      !el.closest('[class*="author"]') &&
      !el.closest('[class*="header"]')
    );
  }

  /**
   * Applies crit font to element and its content
   * @param {HTMLElement} element - Element to apply font to
   */
  _applyCritFontToElement(element) {
    const messageFont = this.settings.critFont || `'${this.DEFAULT_CRIT_FONT}', sans-serif`;
    element.style.setProperty('font-family', messageFont, 'important');

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
      element.querySelectorAll(selector).forEach((el) => {
        if (this._shouldApplyFontToElement(el)) {
          el.style.setProperty('font-family', messageFont, 'important');
        }
      });
    });
  }

  /**
   * Checks if font needs to be applied to crit message
   * @param {HTMLElement} node - Crit message node
   * @returns {boolean} True if font needs to be applied
   */
  _needsFontApplication(node) {
    if (!node.classList?.contains('bd-crit-hit')) return false;

    const computedStyle = window.getComputedStyle(node);
    const fontFamily = computedStyle.fontFamily;
    const expectedFont = this.settings.critFont || this.DEFAULT_CRIT_FONT;
    const normalizedExpected = expectedFont.replace(/'/g, '').replace(/"/g, '');

    return (
      !fontFamily?.includes(this.DEFAULT_CRIT_FONT) && !fontFamily?.includes(normalizedExpected)
    );
  }

  /**
   * Injects CSS styles for crit messages (gradient, animation, glow)
   * Pre-loads Nova Flat font and sets up MutationObserver for font enforcement
   */
  injectCritCSS() {
    if (this.settings?.cssEnabled !== true) return;
    if (document.getElementById(this.CSS_STYLE_IDS.crit)) return;

    const critFontName = this._extractFontName(this.settings.critFont) || this.DEFAULT_CRIT_FONT;
    this.loadCritFont(critFontName);
    this._createNovaFlatFontLink();

    // Force Friend or Foe BB (critFont) on all existing crit hit messages
    // Event-based font enforcement - replaced periodic setInterval with MutationObserver
    const applyCritFont = (element) => {
      // Apply to message itself (use critFont setting for message text - Friend or Foe BB)
      const messageFont = this.settings.critFont || "'Friend or Foe BB', sans-serif";
      element.style.setProperty('font-family', messageFont, 'important');

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
            el.style.setProperty('font-family', messageFont, 'important');
          }
        });
      });
    };

    // Apply to existing crit messages immediately
    const existingCritMessages = document.querySelectorAll('.bd-crit-hit');
    existingCritMessages.forEach((msg) => applyCritFont(msg));

    // Use MutationObserver to watch for new crit messages and font changes
    if (!this.novaFlatObserver) {
      let lastFontCheckTime = 0;

      this.novaFlatObserver = new MutationObserver((mutations) => {
        const now = Date.now();
        if (now - lastFontCheckTime < this.FONT_CHECK_THROTTLE_MS) return;
        lastFontCheckTime = now;

        const nodesToCheck = new Set();
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.classList?.contains('bd-crit-hit')) {
                  nodesToCheck.add(node);
                }
                node.querySelectorAll?.('.bd-crit-hit').forEach((msg) => nodesToCheck.add(msg));
              }
            });
          }
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const critMessage = mutation.target.closest?.('.bd-crit-hit');
            critMessage && nodesToCheck.add(critMessage);
          }
        });

        if (nodesToCheck.size > 0) {
          requestAnimationFrame(() => {
            nodesToCheck.forEach((node) => {
              if (node.isConnected && this._needsFontApplication(node)) {
                this._applyCritFontToElement(node);
              }
            });
          });
        }
      });

      this.novaFlatObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }

    // Define messageFont for CSS template literal
    const messageFont = this.settings.critFont || "'Friend or Foe BB', sans-serif";

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

            /* Apply critFont to ALL elements within crit hit messages (for message text) */
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
                font-family: ${messageFont} !important;
            }

            /* Critical Hit Gradient - ONLY apply to specific text content, NOT username/timestamp */
            /* Reddish with darker purple at 50% - matches inline styles applied by plugin */
            /* FIXED: CSS fallback ensures gradient persists even if Discord removes inline styles */
            .bd-crit-hit .bd-crit-text-content {
                background-image: linear-gradient(to bottom, #dc2626 0%, #4c1d95 50%, #7c2d12 100%) !important;
                background: linear-gradient(to bottom, #dc2626 0%, #4c1d95 50%, #7c2d12 100%) !important;
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
                font-family: ${messageFont} !important; /* critFont setting - for message gradient text */
                font-weight: bold !important; /* Bold for more impact */
                font-size: 1.15em !important; /* Slightly bigger for Friend or Foe BB */
                font-synthesis: none !important; /* Prevent font synthesis */
                font-variant: normal !important; /* Override any font variants */
                font-style: normal !important; /* Override italic/oblique */
                letter-spacing: 1px !important; /* Slight spacing */
                -webkit-text-stroke: none !important; /* Remove stroke for cleaner gradient */
                text-stroke: none !important;
                display: inline-block !important; /* Ensure gradient works */
            }

            /* Apply Friend or Foe BB font to all text within crit hit messages */
            .bd-crit-hit .bd-crit-text-content,
            .bd-crit-hit [class*='messageContent'],
            .bd-crit-hit [class*='markup'],
            .bd-crit-hit [class*='textContainer'] {
                font-family: ${messageFont} !important;
            }

            /* Override font on all child elements to ensure consistency - use critFont setting */
            /* CRITICAL: Force consistent 1.15em font size on all child elements within crit text */
            /* This prevents random font size changes from inheritance or Discord's CSS */
            .bd-crit-hit .bd-crit-text-content *,
            .bd-crit-hit .bd-crit-text-content span,
            .bd-crit-hit .bd-crit-text-content div,
            .bd-crit-hit .bd-crit-text-content p,
            .bd-crit-hit .bd-crit-text-content a,
            .bd-crit-hit .bd-crit-text-content strong,
            .bd-crit-hit .bd-crit-text-content em,
            .bd-crit-hit .bd-crit-text-content code {
                font-family: ${messageFont} !important;
                font-weight: inherit !important;
                font-size: 1.15em !important; /* Force consistent size - no inheritance variations */
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
                font-family: ${messageFont} !important; /* Use critFont setting */
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

            }
        `;

    document.head.appendChild(style);
  }

  // ----------------------------------------------------------------------------
  // Settings CSS Injection
  // ----------------------------------------------------------------------------

  /**
   * Injects CSS styles for the settings panel UI
   */
  injectSettingsCSS() {
    if (document.getElementById(this.CSS_STYLE_IDS.settings)) return;

    const style = document.createElement('style');
    style.id = this.CSS_STYLE_IDS.settings;
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
  // Handles visual effects when crits are detected (animations, particle bursts)

  // ----------------------------------------------------------------------------
  // Visual Effects Constants
  // ----------------------------------------------------------------------------

  /**
   * Particle burst particle count
   * @type {number}
   */
  get PARTICLE_COUNT() {
    return 15;
  }

  /**
   * Particle colors array
   * @type {Array<string>}
   */
  get PARTICLE_COLORS() {
    return [
      'rgba(138, 43, 226, 0.9)', // Blue Violet
      'rgba(139, 92, 246, 0.9)', // Violet
      'rgba(167, 139, 250, 0.9)', // Light Purple
      'rgba(196, 181, 253, 0.9)', // Lavender
      'rgba(255, 255, 255, 0.9)', // White
    ];
  }

  /**
   * Particle animation base distance
   * @type {number}
   */
  get PARTICLE_BASE_DISTANCE() {
    return 50;
  }

  /**
   * Particle animation distance variation
   * @type {number}
   */
  get PARTICLE_DISTANCE_VARIATION() {
    return 30;
  }

  /**
   * Particle animation base duration in seconds
   * @type {number}
   */
  get PARTICLE_BASE_DURATION() {
    return 0.6;
  }

  /**
   * Particle animation duration variation in seconds
   * @type {number}
   */
  get PARTICLE_DURATION_VARIATION() {
    return 0.4;
  }

  /**
   * Particle container cleanup delay in milliseconds
   * @type {number}
   */
  get PARTICLE_CLEANUP_DELAY_MS() {
    return 1200;
  }

  /**
   * Particle size in pixels
   * @type {number}
   */
  get PARTICLE_SIZE() {
    return 4;
  }

  /**
   * Particle container z-index
   * @type {number}
   */
  get PARTICLE_Z_INDEX() {
    return 9999;
  }

  // ----------------------------------------------------------------------------
  // Throttle Management
  // ----------------------------------------------------------------------------

  /**
   * Cleans up old throttle entries
   * @param {number} now - Current timestamp
   */
  _cleanupOnCritHitThrottle(now) {
    if (this._onCritHitThrottle.size <= this.MAX_THROTTLE_MAP_SIZE) return;

    const cutoffTime = now - this.THROTTLE_CLEANUP_CUTOFF_MS;
    Array.from(this._onCritHitThrottle.entries())
      .filter(([, callTime]) => callTime < cutoffTime)
      .forEach(([msgId]) => this._onCritHitThrottle.delete(msgId));
  }

  /**
   * Checks if message should be throttled
   * @param {string} messageId - Message ID
   * @param {boolean} isValidDiscordId - Whether message has valid Discord ID
   * @param {number} now - Current timestamp
   * @param {HTMLElement} messageElement - Message element for retry
   * @returns {boolean} True if should throttle
   */
  _shouldThrottleOnCritHit(messageId, isValidDiscordId, now, messageElement) {
    const lastCallTime = this._onCritHitThrottle.get(messageId);
    const throttleMs = isValidDiscordId
      ? this.VERIFIED_MESSAGE_THROTTLE_MS
      : this._onCritHitThrottleMs;

    if (lastCallTime && now - lastCallTime < throttleMs) {
      if (isValidDiscordId && messageElement) {
        // Delay slightly for verified messages instead of skipping
        const retryDelay = throttleMs - (now - lastCallTime);
        setTimeout(() => {
          if (messageElement?.isConnected) {
            this.onCritHit(messageElement);
          }
        }, retryDelay);
      }
      return true;
    }

    this._onCritHitThrottle.set(messageId, now);
    return false;
  }

  // ----------------------------------------------------------------------------
  // Gradient Verification
  // ----------------------------------------------------------------------------

  /**
   * Verifies gradient is applied and triggers animation
   * @param {HTMLElement} messageElement - Message element
   * @param {string} messageId - Message ID
   * @param {Function} proceedCallback - Callback to proceed with animation
   * @returns {boolean} True if gradient verified immediately
   */
  _verifyGradientAndTrigger(messageElement, messageId, proceedCallback) {
    let lastVerificationTime = 0;

    const verify = () => {
      const now = Date.now();
      if (now - lastVerificationTime < this.GRADIENT_VERIFICATION_DELAY_MS) return false;
      lastVerificationTime = now;

      const currentElement = this.requeryMessageElement(messageId, messageElement);
      if (!currentElement?.isConnected || !currentElement.classList?.contains('bd-crit-hit')) {
        return false;
      }

      const contentElement = this.findMessageContentElement(currentElement);
      if (!contentElement) return false;

      const gradientCheck = this.verifyGradientApplied(contentElement);
      return gradientCheck.hasGradient && gradientCheck.hasWebkitClip;
    };

    if (verify()) {
      proceedCallback();
      return true;
    }

    // Set up MutationObserver
    const parentContainer = messageElement?.parentElement || document.body;
    const observer = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          const target = m.target;
          return (
            target.classList?.contains('bd-crit-hit') ||
            target.querySelector?.('[class*="message"]')?.classList?.contains('bd-crit-hit')
          );
        }
        if (m.type === 'attributes' && m.attributeName === 'style') return true;
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
        requestAnimationFrame(() => {
          if (verify()) {
            observer.disconnect();
            proceedCallback();
          }
        });
      }
    });

    observer.observe(parentContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    const contentElement = this.findMessageContentElement(messageElement);
    contentElement &&
      observer.observe(contentElement, { attributes: true, attributeFilter: ['style', 'class'] });

    setTimeout(() => {
      observer.disconnect();
      proceedCallback();
    }, this.GRADIENT_VERIFICATION_TIMEOUT_MS);

    return false;
  }

  /**
   * Called when a crit is detected - triggers visual effects
   * CriticalHitAnimation plugin hooks into this method for animations
   * Verifies gradient is applied before triggering animation for robust synchronization
   * @param {HTMLElement} messageElement - The message DOM element
   */
  onCritHit(messageElement) {
    if (!messageElement?.isConnected) {
      this.debugLog('ON_CRIT_HIT', 'Message element invalid, skipping animation trigger');
      return;
    }

    const messageId = this.getMessageIdentifier(messageElement);
    if (!messageId) {
      this.debugLog('ON_CRIT_HIT', 'Cannot process without message ID');
      return;
    }

    const isValidDiscordId = /^\d{17,19}$/.test(messageId);

    // Early deduplication
    if (this.animatedMessages.has(messageId)) {
      if (isValidDiscordId) {
        this.animatedMessages.delete(messageId);
      } else {
        return;
      }
    }

    // Throttle check
    const now = Date.now();
    if (this._shouldThrottleOnCritHit(messageId, isValidDiscordId, now, messageElement)) {
      return;
    }

    this._cleanupOnCritHitThrottle(now);

    if (this._processingAnimations.has(messageId)) {
      return;
    }

    this._processingAnimations.add(messageId);

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
            // Particle burst effect removed - using improved animation instead

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

  // ----------------------------------------------------------------------------
  // Particle Burst Effect
  // ----------------------------------------------------------------------------

  /**
   * Gets element center position
   * @param {HTMLElement} element - Element to get position for
   * @returns {Object|null} Position object with x and y or null
   */
  _getElementCenterPosition(element) {
    try {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Creates particle container element
   * @param {number} centerX - Center X coordinate
   * @param {number} centerY - Center Y coordinate
   * @returns {HTMLElement} Particle container element
   */
  _createParticleContainer(centerX, centerY) {
    const container = document.createElement('div');
    container.className = 'bd-crit-particle-burst';
    container.style.cssText = `position: fixed; left: ${centerX}px; top: ${centerY}px; width: 0; height: 0; pointer-events: none; z-index: ${this.PARTICLE_Z_INDEX};`;
    document.body.appendChild(container);
    return container;
  }

  /**
   * Creates a single particle element
   * @param {number} index - Particle index
   * @param {number} totalCount - Total particle count
   * @returns {HTMLElement} Particle element
   */
  _createParticle(index, totalCount) {
    const particle = document.createElement('div');
    const angle = (Math.PI * 2 * index) / totalCount;
    const distance = this.PARTICLE_BASE_DISTANCE + Math.random() * this.PARTICLE_DISTANCE_VARIATION;
    const duration = this.PARTICLE_BASE_DURATION + Math.random() * this.PARTICLE_DURATION_VARIATION;
    const color = this.PARTICLE_COLORS[Math.floor(Math.random() * this.PARTICLE_COLORS.length)];

    particle.style.cssText = `position: absolute; width: ${this.PARTICLE_SIZE}px; height: ${this.PARTICLE_SIZE}px; border-radius: 50%; background: ${color}; box-shadow: 0 0 6px ${color}, 0 0 12px ${color}; left: 0; top: 0; opacity: 1;`;

    const endX = Math.cos(angle) * distance;
    const endY = Math.sin(angle) * distance;

    particle.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${endX}px, ${endY}px) scale(0)`, opacity: 0 },
      ],
      { duration: duration * 1000, easing: 'ease-out', fill: 'forwards' }
    );

    return particle;
  }

  /**
   * Creates a particle burst effect at the message location
   * @param {HTMLElement} messageElement - The message DOM element
   */
  createParticleBurst(messageElement) {
    try {
      const messageId = this.getMessageIdentifier(messageElement) || 'unknown';
      this.debug?.verbose &&
        this.debugLog('CREATE_PARTICLE_BURST', 'Starting particle burst creation', {
          hasMessageElement: !!messageElement,
          messageId,
        });

      const position = this._getElementCenterPosition(messageElement);
      if (!position) return;

      const container = this._createParticleContainer(position.x, position.y);

      Array.from({ length: this.PARTICLE_COUNT }, (_, i) => {
        try {
          container.appendChild(this._createParticle(i, this.PARTICLE_COUNT));
        } catch (error) {
          this.debugError('CREATE_PARTICLE_BURST', error, {
            phase: 'create_particle',
            particleIndex: i,
          });
        }
      });

      setTimeout(() => {
        try {
          container.parentNode && container.parentNode.removeChild(container);
        } catch (error) {
          this.debugError('CREATE_PARTICLE_BURST', error, { phase: 'cleanup' });
        }
      }, this.PARTICLE_CLEANUP_DELAY_MS);
    } catch (error) {
      this.debugError('CREATE_PARTICLE_BURST', error);
    }
  }

  // ----------------------------------------------------------------------------
  // Crit Removal
  // ----------------------------------------------------------------------------

  /**
   * Removes all style properties from element
   * @param {HTMLElement} element - Element to clear styles from
   */
  _clearAllStyles(element) {
    const styleProps = [
      'color',
      'fontFamily',
      'fontWeight',
      'textShadow',
      'animation',
      'background',
      'backgroundImage',
      'webkitBackgroundClip',
      'backgroundClip',
      'webkitTextFillColor',
      'display',
    ];
    styleProps.forEach((prop) => {
      element.style[prop] = '';
    });
  }

  /**
   * Removes all crit styling from all messages (for testing/debugging)
   */
  removeAllCrits() {
    document.querySelectorAll('.bd-crit-hit').forEach((msg) => {
      const content =
        msg.querySelector('.bd-crit-text-content') ||
        msg.querySelector('[class*="messageContent"]') ||
        msg.querySelector('[class*="content"]') ||
        msg;
      if (content) {
        content.classList.remove('bd-crit-text-content');
        this._clearAllStyles(content);
      }
      msg.classList.remove('bd-crit-hit');
    });

    this.critMessages.clear();

    const style = document.getElementById(this.CSS_STYLE_IDS.crit);
    style && style.remove();

    this._forceNovaInterval &&
      (clearInterval(this._forceNovaInterval), (this._forceNovaInterval = null));
    this._displayUpdateInterval &&
      (clearInterval(this._displayUpdateInterval), (this._displayUpdateInterval = null));
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
    this.updateStats();
    this.injectSettingsCSS();

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
                              } catch (e) {
                                // Silently ignore - bonuses are optional
                              }

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
                                value="${this._this._escapeHTML(this.settings.critColor)}"
                                class="crit-color-picker"
                            />
                            <div class="crit-color-preview" style="background-color: ${this._escapeHTML(
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
                            value="${this._escapeHTML(this.settings.critFont)}"
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

                <div class="crit-font-credit" style="margin-top: 32px; padding: 16px; background: rgba(138, 43, 226, 0.05); border-radius: 8px; border-top: 1px solid rgba(138, 43, 226, 0.2); text-align: center; font-size: 12px; color: rgba(255, 255, 255, 0.6);">
                    <div>Icons made from <a href="https://www.onlinewebfonts.com/icon" target="_blank" rel="noopener noreferrer" style="color: #8b5cf6; text-decoration: none;">svg icons</a> is licensed by CC BY 4.0</div>
                    <div style="margin-top: 4px; opacity: 0.8;">Font: "Friend or Foe BB" from OnlineWebFonts.com</div>
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
  // Handles settings updates and crit chance calculations

  // ----------------------------------------------------------------------------
  // Crit Chance Constants
  // ----------------------------------------------------------------------------

  /**
   * Maximum effective crit chance percentage
   * @type {number}
   */
  get MAX_EFFECTIVE_CRIT_CHANCE() {
    return 50;
  }

  /**
   * Maximum base crit chance percentage
   * @type {number}
   */
  get MAX_BASE_CRIT_CHANCE() {
    return 30;
  }

  /**
   * Default crit chance percentage
   * @type {number}
   */
  get DEFAULT_CRIT_CHANCE() {
    return 10;
  }

  /**
   * Bonus to percentage conversion multiplier
   * @type {number}
   */
  get BONUS_TO_PERCENT() {
    return 100;
  }

  // ----------------------------------------------------------------------------
  // Bonus Loading Helpers
  // ----------------------------------------------------------------------------

  /**
   * Loads agility bonus from SoloLevelingStats
   * @returns {number} Agility bonus percentage
   */
  _loadAgilityBonus() {
    try {
      const agilityData = BdApi.Data.load('SoloLevelingStats', 'agilityBonus');
      return (agilityData?.bonus ?? 0) * this.BONUS_TO_PERCENT;
    } catch (error) {
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load agility bonus', { error: error.message });
      return 0;
    }
  }

  /**
   * Loads luck bonus from SoloLevelingStats
   * @returns {number} Luck bonus percentage
   */
  _loadLuckBonus() {
    try {
      const luckData = BdApi.Data.load('SoloLevelingStats', 'luckBonus');
      const luckBonusPercent = (luckData?.bonus ?? 0) * this.BONUS_TO_PERCENT;
      if (luckBonusPercent > 0) {
        this.debugLog('GET_EFFECTIVE_CRIT', 'Luck buffs applied to crit chance', {
          luckBonusPercent: luckBonusPercent.toFixed(1),
          luckBuffs: luckData?.luckBuffs ?? [],
          luckStat: luckData?.luck ?? 0,
        });
      }
      return luckBonusPercent;
    } catch (error) {
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load luck bonus', { error: error.message });
      return 0;
    }
  }

  /**
   * Loads skill tree bonus from SkillTree plugin
   * @returns {number} Skill tree crit bonus percentage
   */
  _loadSkillTreeBonus() {
    try {
      const skillBonuses = BdApi.Data.load('SkillTree', 'bonuses');
      if (skillBonuses?.critBonus > 0) {
        const skillCritBonusPercent = skillBonuses.critBonus * this.BONUS_TO_PERCENT;
        this.debugLog('GET_EFFECTIVE_CRIT', 'Skill tree crit bonus applied', {
          skillCritBonusPercent: skillCritBonusPercent.toFixed(1),
        });
        return skillCritBonusPercent;
      }
    } catch (error) {
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load skill tree bonuses', {
        error: error.message,
      });
    }
    return 0;
  }

  /**
   * Gets individual bonuses for display
   * @returns {Object} Object with agility and luck bonuses
   */
  _getIndividualBonuses() {
    return {
      agility: this._loadAgilityBonus(),
      luck: this._loadLuckBonus(),
    };
  }

  /**
   * Creates crit chance toast message
   * @param {number} effectiveCrit - Effective crit chance
   * @returns {string} Toast message
   */
  _createCritChanceToastMessage(effectiveCrit) {
    const totalBonus = effectiveCrit - this.settings.critChance;
    if (totalBonus <= 0) {
      return `Crit chance set to ${this.settings.critChance}%`;
    }

    const bonuses = this._getIndividualBonuses();
    const bonusParts = [];
    if (bonuses.agility > 0) bonusParts.push(`+${bonuses.agility.toFixed(1)}% AGI`);
    if (bonuses.luck > 0) bonusParts.push(`+${bonuses.luck.toFixed(1)}% LUK`);
    return `Crit: ${this.settings.critChance}% base (${bonusParts.join(
      ' + '
    )}) = ${effectiveCrit.toFixed(1)}%`;
  }

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
    let baseChance = this.settings.critChance || this.DEFAULT_CRIT_CHANCE;
    baseChance += this._loadAgilityBonus();
    baseChance += this._loadLuckBonus();
    baseChance += this._loadSkillTreeBonus();
    return Math.min(this.MAX_EFFECTIVE_CRIT_CHANCE, Math.max(0, baseChance));
  }

  updateCritChance(value) {
    this.settings.critChance = Math.max(
      0,
      Math.min(this.MAX_BASE_CRIT_CHANCE, parseFloat(value) || 0)
    );
    this.saveSettings();

    const labelValue = document.querySelector('.crit-label-value');
    if (labelValue) {
      labelValue.textContent = `${this.settings.critChance}%`;
    }

    const effectiveCrit = this.getEffectiveCritChance();
    try {
      if (BdApi?.showToast) {
        BdApi.showToast(this._createCritChanceToastMessage(effectiveCrit), {
          type: 'info',
          timeout: this.TOAST_TIMEOUT_MS,
        });
      }
    } catch (error) {
      this.debug?.enabled && console.log('CriticalHit: Toast failed', error);
    }
  }

  /**
   * Updates crit color setting
   * @param {string} value - New crit color value
   */
  updateCritColor(value) {
    this.settings.critColor = value;
    this.saveSettings();
    this.updateExistingCrits();
  }

  /**
   * Updates crit font setting
   * @param {string} value - New crit font value
   */
  updateCritFont(value) {
    this.settings.critFont = value;
    this.saveSettings();
    this.updateExistingCrits();
  }

  /**
   * Updates crit animation setting
   * @param {boolean} value - New crit animation value
   */
  updateCritAnimation(value) {
    this.settings.critAnimation = value;
    this.saveSettings();
    this.updateExistingCrits();
  }

  /**
   * Updates crit gradient setting
   * @param {boolean} value - New crit gradient value
   */
  updateCritGradient(value) {
    this.settings.critGradient = value;
    this.saveSettings();
    this.updateExistingCrits();
  }

  /**
   * Updates crit glow setting
   * @param {boolean} value - New crit glow value
   */
  updateCritGlow(value) {
    this.settings.critGlow = value;
    this.saveSettings();
    this.updateExistingCrits();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Crit Styling & Application
  // ──────────────────────────────────────────────────────────────────────────────

  // ----------------------------------------------------------------------------
  // Existing Crits Update
  // ----------------------------------------------------------------------------

  /**
   * Applies styles to content element based on settings
   * @param {HTMLElement} content - Content element
   * @param {HTMLElement} msg - Message element
   */
  _applyStylesToContent(content, msg) {
    content.classList.add('bd-crit-text-content');

    const useGradient = this.settings.critGradient !== false;
    if (useGradient) {
      const gradientStyles = this.createGradientStyles(this.DEFAULT_GRADIENT_COLORS);
      this.applyStyles(content, gradientStyles);
      this.excludeHeaderElements(msg);
      this.applyGlowToContentForStyling(content, true);
    } else {
      this.applySolidColorStyles(content, msg, this.settings.critColor);
      this.applyGlowToContentForStyling(content, false);
    }

    this.applyFontStyles(content);
    this.applyStyles(content, {
      animation: this.settings.critAnimation ? 'critPulse 0.5s ease-in-out' : 'none',
    });
  }

  /**
   * Updates existing crits with new settings
   */
  updateExistingCrits() {
    const critMessages = document.querySelectorAll('.bd-crit-hit');
    this.debugLog('UPDATE_EXISTING_CRITS', 'Updating existing crits', {
      critCount: critMessages.length,
    });

    critMessages.forEach((msg) => {
      const content = this.findMessageContentForStyling(msg);
      if (!content) {
        this.debugLog('UPDATE_EXISTING_CRITS', 'No content element found - skipping this message');
        return;
      }

      this._applyStylesToContent(content, msg);
    });
  }

  // ============================================================================
  // TEST & UTILITY METHODS
  // ============================================================================
  // Testing and utility functions

  /**
   * Message selector for test crit
   * @type {string}
   */
  get TEST_MESSAGE_SELECTOR() {
    return '[class*="message"]:not([class*="messageContent"]):not([class*="messageGroup"])';
  }

  /**
   * Toast timeout in milliseconds
   * @type {number}
   */
  get TOAST_TIMEOUT_MS() {
    return 2000;
  }

  /**
   * Shows toast message with error handling
   * @param {string} message - Toast message
   * @param {Object} options - Toast options
   */
  _showToast(message, options = {}) {
    try {
      BdApi?.showToast?.(message, { timeout: this.TOAST_TIMEOUT_MS, ...options });
    } catch (error) {
      this.debug?.enabled && console.log('CriticalHit: Toast failed', error);
    }
  }

  /**
   * Tests crit by applying to most recent message
   */
  testCrit() {
    const messages = document.querySelectorAll(this.TEST_MESSAGE_SELECTOR);
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage) {
      this._showToast('No messages found to test', { type: 'error' });
      return;
    }

    if (this.critMessages.has(lastMessage)) {
      this._showToast('Message already has crit!', { type: 'info' });
      return;
    }

    this.applyCritStyle(lastMessage);
    this.critMessages.add(lastMessage);
    this._showToast('Test Critical Hit Applied!', { type: 'success' });
  }

  // ============================================================================
  // USER IDENTIFICATION
  // ============================================================================
  // Handles user identification and message ownership checks

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
  // Handles React fiber traversal for extracting message data
  // Note: getReactFiber, traverseFiber, getMessageId, getUserId are defined earlier

  /**
   * Maximum fiber traversal depth for timestamp extraction
   * @type {number}
   */
  get MAX_TIMESTAMP_FIBER_DEPTH() {
    return 30;
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
  // CRITICAL HIT HANDLING
  // ============================================================================
  // Handles critical hit events, combo management, and animation triggering

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
          // Max attempts reached, proceed anyway but log warning
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
    if (this.isMessageInHistory(messageId)) {
      const messageTime = this.getMessageTimestamp(messageElement);
      if (Date.now() - (messageTime || 0) > this.COMBO_TIMEOUT_MS) {
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

      // Cleanup old entries to prevent memory leaks
      if (this._comboUpdatedMessages.size > this.MAX_THROTTLE_MAP_SIZE) {
        this._comboUpdatedMessages.clear();
      }
      if (this._comboUpdatedContentHashes.size > this.MAX_THROTTLE_MAP_SIZE) {
        this._comboUpdatedContentHashes.clear();
      }

      // Synchronous combo update (atomic in single-threaded JavaScript)
      const userCombo = this.getUserCombo(userIdForCombo);
      const comboNow = Date.now();
      const timeSinceLastCrit = comboNow - userCombo.lastCritTime;

      combo = 1;
      if (timeSinceLastCrit <= 15000) {
        // Check message history (15 second timeout)
        combo = userCombo.comboCount + 1;
      } else {
        // Combo expired (>15s), reset to 1
        combo = 1;
      }

      // Update combo immediately (before async animation and before cooldown check)
      // This is synchronous, so it's atomic - no race conditions possible
      this.updateUserCombo(userIdForCombo, combo, comboNow);
      storedCombo = combo; // Use updated combo for animation display
    }

    // Cooldown check (AFTER combo update so combo always increments)
    const now = Date.now();
    if (now - this.lastAnimationTime < this.ANIMATION_COOLDOWN_MS) {
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
  // Handles displaying the "CRITICAL HIT!" animation with combo count

  // ----------------------------------------------------------------------------
  // Animation Deduplication Helpers
  // ----------------------------------------------------------------------------

  /**
   * Checks if animation should be allowed based on existing data
   * @param {string} messageId - Message ID
   * @param {HTMLElement} messageElement - Message element
   * @param {Object} existingData - Existing animation data
   * @returns {boolean} True if animation should proceed
   */
  _shouldAllowAnimation(messageId, messageElement, existingData) {
    const content = this.findMessageContentElement(messageElement);
    const author = this.getAuthorId(messageElement);
    const contentText = content?.textContent?.trim();
    const contentHash = this.calculateContentHash(author, contentText);

    if (existingData?.contentHash && contentHash === existingData.contentHash) {
      const timeSinceAnimated = Date.now() - existingData.timestamp;
      const originalElementStillConnected = document.querySelector(
        `[data-message-id="${messageId}"]`
      )?.isConnected;
      const isValidDiscordId = /^\d{17,19}$/.test(messageId);

      if (isValidDiscordId) {
        return true;
      }

      return (
        timeSinceAnimated > this.TIME_TOLERANCE_MS ||
        (!originalElementStillConnected && timeSinceAnimated > this.TIME_TOLERANCE_MS / 2)
      );
    }

    return messageElement?.isConnected;
  }

  /**
   * Gets combo count for animation display
   * @param {HTMLElement} messageElement - Message element
   * @param {number|null} comboOverride - Optional combo override
   * @returns {number} Combo count
   */
  _getComboForAnimation(messageElement, comboOverride) {
    if (comboOverride !== null && comboOverride !== undefined) {
      return comboOverride;
    }

    const userId = this.getUserId(messageElement) || 'unknown';
    const userCombo = this.getUserCombo(userId);
    return userCombo.comboCount || 1;
  }

  /**
   * Displays the "CRITICAL HIT!" animation with combo count
   * Handles duplicate detection, positioning, and cleanup
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {string} messageId - The message ID
   * @param {number|null} comboOverride - Optional combo count override
   */
  showAnimation(messageElement, messageId, comboOverride = null) {
    if (messageId && this.animatedMessages.has(messageId)) {
      const existingData = this.animatedMessages.get(messageId);
      if (!this._shouldAllowAnimation(messageId, messageElement, existingData)) {
        return;
      }
      this.animatedMessages.delete(messageId);
    }

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

    // Create animation element
    const textElement = this.createAnimationElement(messageId, combo, position);
    container.appendChild(textElement);
    this.activeAnimations.add(textElement);

    // Apply screen shake if enabled - delay to sync with animation becoming visible
    // Animation fades in quickly: 0% (invisible) → 3% (fully visible) = 120ms for 4000ms duration
    // Delay shake to trigger when animation becomes fully visible (3% = 120ms)
    if (this.settings?.screenShake) {
      const animationDuration = this.settings.animationDuration || 4000;
      const shakeDelay = animationDuration * 0.03; // 3% = when animation becomes fully visible (120ms)
      setTimeout(() => {
        this.applyScreenShake();
      }, shakeDelay);
    }

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
  // Handles user combo tracking and persistence

  /**
   * Gets or creates user combo object
   * @param {string} userId - User ID
   * @returns {Object} User combo object
   */
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
  /**
   * Saves user combo to storage
   * @param {string} userId - User ID
   * @param {number} comboCount - Combo count
   * @param {number} lastCritTime - Last crit time
   */
  _saveUserComboToStorage(userId, comboCount, lastCritTime) {
    try {
      BdApi.Data.save('CriticalHitAnimation', 'userCombo', {
        userId,
        comboCount,
        lastCritTime,
      });
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Resets user combo after timeout
   * @param {string} key - User key
   */
  _resetUserComboAfterTimeout(key) {
    if (this.userCombos.has(key)) {
      const comboObj = this.userCombos.get(key);
      comboObj.comboCount = 0;
      comboObj.lastCritTime = 0;
      this._saveUserComboToStorage(key, 0, 0);
    }
  }

  /**
   * Updates combo count for a user and sets timeout to reset combo
   * Persists combo to storage and handles combo expiration
   * @param {string} userId - The user ID
   * @param {number} comboCount - The new combo count
   * @param {number} lastCritTime - Timestamp of the crit
   */
  updateUserCombo(userId, comboCount, lastCritTime) {
    const key = userId || 'unknown';
    const combo = this.getUserCombo(key);
    combo.comboCount = comboCount;
    combo.lastCritTime = lastCritTime;

    this._saveUserComboToStorage(key, comboCount, lastCritTime);

    if (combo.timeout) clearTimeout(combo.timeout);
    combo.timeout = setTimeout(
      () => this._resetUserComboAfterTimeout(key),
      this.COMBO_RESET_TIMEOUT_MS
    );
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
  // Handles screen shake effect when crits occur

  // ----------------------------------------------------------------------------
  // Screen Shake Constants
  // ----------------------------------------------------------------------------

  /**
   * Screen shake CSS class name
   * @type {string}
   */
  get SCREEN_SHAKE_CLASS() {
    return 'cha-screen-shake-active';
  }

  /**
   * Screen shake keyframe animation name
   * @type {string}
   */
  get SCREEN_SHAKE_KEYFRAME() {
    return 'chaShake';
  }

  /**
   * Discord app container selector
   * @type {string}
   */
  get DISCORD_APP_SELECTOR() {
    return '[class*="app"]';
  }

  /**
   * Creates screen shake CSS keyframes
   * @param {number} intensity - Shake intensity in pixels
   * @param {number} duration - Shake duration in milliseconds
   * @returns {string} CSS text
   */
  _createScreenShakeCSS(intensity, duration) {
    return `
      @keyframes ${this.SCREEN_SHAKE_KEYFRAME} {
        0%, 100% { transform: translate(0, 0); }
        25% { transform: translate(-${intensity}px, ${intensity}px); }
        50% { transform: translate(${intensity}px, -${intensity}px); }
        75% { transform: translate(-${intensity}px, -${intensity}px); }
      }
      .${this.SCREEN_SHAKE_CLASS} {
        animation: ${this.SCREEN_SHAKE_KEYFRAME} ${duration}ms ease-in-out;
      }
    `;
  }

  /**
   * Applies screen shake effect to the entire page
   * Uses CSS animation based on settings (intensity and duration)
   */
  applyScreenShake() {
    const discordContainer = document.querySelector(this.DISCORD_APP_SELECTOR) || document.body;
    if (!discordContainer) return;

    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = this._createScreenShakeCSS(
      this.settings.shakeIntensity,
      this.settings.shakeDuration
    );
    document.head.appendChild(shakeStyle);
    discordContainer.classList.add(this.SCREEN_SHAKE_CLASS);

    setTimeout(() => {
      discordContainer.classList.remove(this.SCREEN_SHAKE_CLASS);
      shakeStyle.remove();
    }, this.settings.shakeDuration);
  }

  // ============================================================================
  // GLOW PULSE EFFECT
  // ============================================================================

  /**
   * Helper: Loads font with smart source selection
   * Nova Flat always uses Google Fonts, other fonts use local files if enabled
   * @param {string} fontName - Name of the font to load
   * @param {boolean} forceGoogle - Force Google Fonts (for Nova Flat)
   * @returns {boolean} True if font was loaded
   */
  loadFont(fontName, forceGoogle = false) {
    if (!fontName) return false;

    // Nova Flat always uses Google Fonts (not available as local file typically)
    const isNovaFlat =
      fontName.toLowerCase().includes('nova flat') || fontName.toLowerCase() === 'nova flat';

    if (isNovaFlat || forceGoogle) {
      return this.loadGoogleFont(fontName);
    }

    // For other fonts, try local files first if enabled
    if (this.settings.useLocalFonts) {
      const loaded = this.loadLocalFont(fontName);
      if (loaded) {
        return true;
      }
      // Fallback to Google Fonts if local load failed
      this.debugLog('FONT_LOADER', 'Local font load failed, falling back to Google Fonts', {
        fontName,
      });
    }

    // Load from Google Fonts as fallback
    return this.loadGoogleFont(fontName);
  }

  /**
   * Helper: Loads animation font for Critical Hit floating text animation (Metal Mania)
   * Uses local files if enabled (for stylized fonts like Metal Mania), otherwise Google Fonts
   * NOTE: This is separate from Shadow Arise animation (which uses Speedy Space Goat Oddity)
   * @param {string} fontName - Name of the font to load (default: Metal Mania)
   * @returns {boolean} True if font was loaded
   */
  loadCritAnimationFont(fontName = null) {
    const fontToLoad = fontName || this.settings.animationFont || 'Metal Mania';

    // Check for fonts that require local files (not on Google Fonts)
    const isMetalMania =
      fontToLoad.toLowerCase().includes('metal mania') ||
      fontToLoad.toLowerCase() === 'metal mania';
    const isVampireWars =
      fontToLoad.toLowerCase().includes('vampire wars') ||
      fontToLoad.toLowerCase() === 'vampire wars';
    const isSpeedyGoat =
      fontToLoad.toLowerCase().includes('speedy space goat') ||
      fontToLoad.toLowerCase().includes('speedy goat');

    if (isMetalMania) {
      // Metal Mania is not on Google Fonts, so try local first (Critical Hit animation font)
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      // If local fails, warn user
      this.debugLog(
        'FONT_LOADER',
        'Metal Mania requires local font files. Enable useLocalFonts and ensure font is in fonts/ folder.',
        {
          fontName: fontToLoad,
        }
      );
      // Try Google anyway (will fail gracefully)
      return this.loadGoogleFont(fontToLoad);
    }

    if (isVampireWars) {
      // Try local files first (Vampire Wars needs to be downloaded)
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      // If local fails and useLocalFonts is false, warn user
      this.debugLog(
        'FONT_LOADER',
        'Vampire Wars requires local font files. Enable useLocalFonts and add font to fonts/ folder.',
        {
          fontName: fontToLoad,
        }
      );
      // Try Google anyway (will fail gracefully)
      return this.loadGoogleFont(fontToLoad);
    }

    if (isSpeedyGoat) {
      // Speedy Space Goat Oddity is not on Google Fonts (used by Shadow Arise plugin, not Critical Hit)
      // Keep this for compatibility, but Critical Hit should use Metal Mania
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      // If local fails, warn user
      this.debugLog(
        'FONT_LOADER',
        'Speedy Space Goat Oddity requires local font files. Enable useLocalFonts and ensure font is in fonts/ folder.',
        {
          fontName: fontToLoad,
        }
      );
      // Try Google anyway (will fail gracefully)
      return this.loadGoogleFont(fontToLoad);
    }

    // For other fonts, use smart loading (local if enabled, otherwise Google)
    return this.loadFont(fontToLoad, false);
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

      // Get current user ID before setting up hooks
      this.getCurrentUserId();

      // Initialize webpack modules for advanced integration
      this.initializeWebpackModules();

      // Hook into message send to capture sent messages immediately
      this.setupMessageSendHook();

      // Set up message receive hook (patches MessageStore.receiveMessage) - enhanced tracking
      this.setupMessageReceiveHook();

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

      // CRITICAL: Clear observer throttle timeout to prevent memory leaks
      if (this._observerThrottleTimeout) {
        clearTimeout(this._observerThrottleTimeout);
        this._observerThrottleTimeout = null;
      }

      // Clear batch processing timeout
      if (this._batchProcessingTimeout) {
        clearTimeout(this._batchProcessingTimeout);
        this._batchProcessingTimeout = null;
      }

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
      this._batchProcessingTimeout = null;
      this._pendingNodes && this._pendingNodes.clear();
      this._processingBatch = false;

      // CRITICAL: Clear observer throttle timeout to prevent memory leaks
      if (this._observerThrottleTimeout) {
        clearTimeout(this._observerThrottleTimeout);
        this._observerThrottleTimeout = null;
      }

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

      // Unpatch all BetterDiscord patches (including message send hook and receive hook)
      try {
        BdApi.Patcher.unpatchAll('CriticalHit');
      } catch (error) {
        this.debugError('PLUGIN_STOP', error, { phase: 'unpatch' });
      }

      // Clear webpack module references
      if (this.webpackModules) {
        this.webpackModules.MessageStore = null;
        this.webpackModules.UserStore = null;
        this.webpackModules.MessageActions = null;
      }
      this.messageStorePatch = null;

      // Clear tracking data (with null checks)
      this.clearSessionTracking();
      this.pendingCrits && this.pendingCrits.clear();
      this.animatedMessages && this.animatedMessages.clear();
      this.activeAnimations && this.activeAnimations.clear();

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

      // Sync debug.enabled with settings.debugMode (force enable for debugging)
      this.debug.enabled = true; // FORCE ENABLED FOR DEBUGGING
      this.settings.debugMode = true; // Also force enable in settings

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
      // Fallback to defaults on error (but still force enable debug)
      this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
      this.settings.debugMode = true; // Force enable even on error
      this.debug.enabled = true; // Force enable even on error
    }
  }

  /**
   * Saves settings to BetterDiscord storage
   * Syncs debug.enabled with settings.debugMode before saving
   */
  saveSettings() {
    try {
      // FORCE ENABLE DEBUG MODE FOR DEBUGGING
      this.settings.debugMode = true;
      this.debug.enabled = true;

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

    // Glow pulse
    const glowPulseCheckbox = container.querySelector('#glow-pulse');
    if (glowPulseCheckbox) {
      glowPulseCheckbox.addEventListener('change', (e) => {
        this.settings.glowPulse = e.target.checked;
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
