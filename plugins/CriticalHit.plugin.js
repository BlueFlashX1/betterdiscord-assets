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
    this.maxHistorySize = 2000; // Maximum number of messages to store in history (reduced for memory optimization)
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

  // ============================================
  // SECTION 4: DEBUGGING & DEVELOPMENT
  // ============================================

  // ============================================================================
  // DEBUG LOGGING SYSTEM
  // ============================================================================

  debugLog(operation, message, data = null) {
    // FUNCTIONAL: Guard clause (early return - good if-else usage)
    if (!this.debug?.enabled) return;

    // FUNCTIONAL: Throttle frequent operations (Set for O(1) lookup)
    const frequentOps = new Set([
      'GET_MESSAGE_ID',
      'CHECK_FOR_RESTORATION',
      'RESTORE_CHANNEL_CRITS',
      'CHECK_FOR_CRIT',
      'PROCESS_NODE',
      'MUTATION_OBSERVER',
    ]);

    // FUNCTIONAL: Throttling logic (short-circuit)
    frequentOps.has(operation) &&
      (() => {
        const now = Date.now();
        const lastLogTimes = this.debug.lastLogTimes || {};
        const throttleInterval = 10000;

        // FUNCTIONAL: Skip if throttled (short-circuit return)
        lastLogTimes[operation] &&
          now - lastLogTimes[operation] < throttleInterval &&
          ((this.debug.operationCounts[operation] =
            (this.debug.operationCounts[operation] || 0) + 1),
          true) &&
          (() => {
            return;
          })();

        // FUNCTIONAL: Initialize and update (short-circuit)
        !this.debug.lastLogTimes && (this.debug.lastLogTimes = {});
        this.debug.lastLogTimes[operation] = now;
      })();

    const timestamp = new Date().toISOString();
    console.warn(`[CriticalHit:${operation}] ${message}`, data || '');

    // Track operation counts
    this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
  }

  // Error logging helper
  debugError(operation, error, context = {}) {
    // FUNCTIONAL: Track errors with short-circuit (no if-else)
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

  // ============================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Initializes the plugin: loads settings, history, injects CSS, and starts observers
   * Called when plugin is enabled/started
   */
  start() {
    try {
      this.debugLog('START', 'Plugin starting...');

      // Load settings
      try {
        this.loadSettings();
        this.debugLog('START', 'Settings loaded', {
          critChance: this.settings.critChance,
          enabled: this.settings.enabled,
        });
      } catch (error) {
        this.debugError('START', error, { phase: 'load_settings' });
      }

      // Load message history from storage
      try {
        this.loadMessageHistory();
        this.updateStats(); // Calculate stats from loaded history
        this.debugLog('START', 'Message history loaded', {
          messageCount: this.messageHistory.length,
          critCount: this.getCritHistory().length,
          totalCrits: this.stats.totalCrits,
          critRate: this.stats.critRate.toFixed(2) + '%',
        });

        // FUNCTIONAL: Log crits by channel (.forEach instead of for-loop)
        const critsByChannel = {};
        this.getCritHistory().forEach((entry) => {
          const channelId = entry.channelId || 'unknown';
          critsByChannel[channelId] = (critsByChannel[channelId] || 0) + 1;
        });
        this.debugLog('START', 'Stored crits by channel', critsByChannel);

        // FUNCTIONAL: Auto-cleanup (short-circuit, no if-else)
        this.settings.autoCleanupHistory &&
          this.cleanupOldHistory(this.settings.historyRetentionDays || 30);
      } catch (error) {
        this.debugError('START', error, { phase: 'load_history' });
      }

      // Set current channel ID
      try {
        this.currentChannelId = this.getCurrentChannelId();
        this.debugLog('START', 'Current channel ID set', { channelId: this.currentChannelId });
      } catch (error) {
        this.debugError('START', error, { phase: 'get_channel_id' });
      }

      // Start observing messages
      try {
        this.startObserving();
        this.debugLog('START', 'Message observer started');
      } catch (error) {
        this.debugError('START', error, { phase: 'start_observing' });
      }

      // FUNCTIONAL: Inject CSS (short-circuit, no if-else)
      try {
        this.settings.cssEnabled !== false &&
          (this.injectCritCSS(), this.debugLog('START', 'Crit CSS injected'));
      } catch (error) {
        this.debugError('START', error, { phase: 'inject_css' });
      }

      // FUNCTIONAL: Initialize animations (short-circuit, no if-else)
      try {
        this.settings.animationEnabled !== false &&
          (this.injectAnimationCSS(),
          setTimeout(() => this.getCurrentUserId(), 1000),
          this.debugLog('START', 'Animation features initialized'));
      } catch (error) {
        this.debugError('START', error, { phase: 'init_animations' });
      }

      const effectiveCritChance = this.getEffectiveCritChance();

      // Get individual bonuses for display
      let agilityBonus = 0;
      let luckBonus = 0;
      try {
        agilityBonus = (BdApi.Data.load('SoloLevelingStats', 'agilityBonus')?.bonus ?? 0) * 100;
        luckBonus = (BdApi.Data.load('SoloLevelingStats', 'luckBonus')?.bonus ?? 0) * 100;
      } catch (e) {}

      const totalBonus = agilityBonus + luckBonus;
      const bonusText =
        totalBonus > 0
          ? `(${effectiveCritChance.toFixed(1)}% effective with ${
              agilityBonus > 0 ? `+${agilityBonus.toFixed(1)}% AGI` : ''
            }${agilityBonus > 0 && luckBonus > 0 ? ' + ' : ''}${
              luckBonus > 0 ? `+${luckBonus.toFixed(1)}% LUK` : ''
            })`
          : '';

      if (this.debug?.enabled) {
        console.log(
          `CriticalHit: Started with ${this.settings.critChance}% base crit chance ${bonusText}!`
        );
        console.log(`CriticalHit: Loaded ${this.messageHistory.length} messages from history`);
      }

      // Start periodic history cleanup (every 30 minutes)
      if (this.settings.autoCleanupHistory) {
        this.startPeriodicCleanup();
      }

      // Show toast notification (if available)
      try {
        if (BdApi?.showToast) {
          const bonuses = [
            agilityBonus > 0 && `+${agilityBonus.toFixed(1)}% AGI`,
            luckBonus > 0 && `+${luckBonus.toFixed(1)}% LUK`,
          ].filter(Boolean);

          const toastMessage = totalBonus > 0
            ? `CriticalHit enabled! ${this.settings.critChance}% base (${bonuses.join(' + ')}) = ${effectiveCritChance.toFixed(1)}%`
            : `CriticalHit enabled! ${this.settings.critChance}% crit chance`;

          BdApi.showToast(toastMessage, { type: 'success', timeout: 3000 });
          this.debugLog('START', 'Toast notification shown');
        } else {
          this.debugLog('START', 'Toast notification not available (BdApi.showToast not found)');
        }
      } catch (error) {
        this.debugError('START', error, { phase: 'show_toast' });
      }

      this.debugLog('START', 'Plugin started successfully');
    } catch (error) {
      this.debugError('START', error, { phase: 'initialization' });
    }
  }

  /**
   * Cleans up plugin resources: stops observers, clears intervals, removes styles
   * Called when plugin is disabled/stopped
   */
  stop() {
    // FUNCTIONAL: Stop observing (short-circuit cleanup)
    this.messageObserver && (this.messageObserver.disconnect(), (this.messageObserver = null));
    this.urlObserver && (this.urlObserver.disconnect(), (this.urlObserver = null));

    // FUNCTIONAL: Clean up style observers (.forEach instead of for-loop)
    this.styleObservers &&
      (this.styleObservers.forEach((observer) => observer.disconnect()),
      this.styleObservers.clear());

    // FUNCTIONAL: Clean up Nova Flat observer (short-circuit)
    this.novaFlatObserver && (this.novaFlatObserver.disconnect(), (this.novaFlatObserver = null));

    // FUNCTIONAL: Clean up Nova Flat interval (short-circuit)
    this._forceNovaInterval &&
      (clearInterval(this._forceNovaInterval), (this._forceNovaInterval = null));

    // FUNCTIONAL: Clean up display update interval (short-circuit)
    this._displayUpdateInterval &&
      (clearInterval(this._displayUpdateInterval), (this._displayUpdateInterval = null));

    // FUNCTIONAL: Clean up style observer intervals (.forEach instead of for-loop)
    this.styleObserverIntervals &&
      (this.styleObserverIntervals.forEach((id) => clearInterval(id)),
      this.styleObserverIntervals.clear());

    // FUNCTIONAL: Restore history methods (short-circuit)
    this.originalPushState && (history.pushState = this.originalPushState);
    this.originalReplaceState && (history.replaceState = this.originalReplaceState);

    // FUNCTIONAL: Stop periodic cleanup (short-circuit)
    this.historyCleanupInterval &&
      (clearInterval(this.historyCleanupInterval), (this.historyCleanupInterval = null));

    // Save message history before stopping
    this.saveMessageHistory();

    // FUNCTIONAL: Clean up animation resources (short-circuit)
    this.animationContainer && (this.animationContainer.remove(), (this.animationContainer = null));
    this.activeAnimations?.clear();
    this.userCombos?.clear();
    this.animatedMessages?.clear();

    // FUNCTIONAL: Clean up processing locks (optional chaining)
    this._processingCrits?.clear();
    this._processingAnimations?.clear();
    this._onCritHitThrottle?.clear();
    this._comboUpdatedMessages?.clear();
    this._comboUpdatedContentHashes?.clear();

    // FUNCTIONAL: Clear cached DOM queries (no if-else)
    this._cachedChatInput = null;
    this._cachedMessageList = null;
    this._cachedMessages = null;
    this._cacheTimestamp = 0;

    // Remove all crit styling
    this.removeAllCrits();

    // FUNCTIONAL: Debug log (short-circuit)
    this.debug?.enabled && console.log('[CriticalHit] Stopped');
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  /**
   * Loads plugin settings from BetterDiscord storage
   * Merges saved settings with defaults and migrates old font settings if needed
   */
  loadSettings() {
    try {
      this.debugLog('LOAD_SETTINGS', 'Attempting to load settings...');

      // Load saved settings or use defaults
      let saved = null;
      try {
        saved = BdApi.Data.load('CriticalHit', 'settings');
        this.debugLog('LOAD_SETTINGS', 'Settings load attempt', { success: !!saved });
      } catch (error) {
        this.debugError('LOAD_SETTINGS', error, { phase: 'data_load' });
      }

      if (saved && typeof saved === 'object') {
        try {
          // CRITICAL FIX: Deep copy (no shallow copy bugs)
          this.settings = JSON.parse(JSON.stringify({ ...this.defaultSettings, ...saved }));
          // Update debug.enabled after settings are loaded
          this.debug?.enabled = this.settings.debugMode === true;
          this.debugLog('LOAD_SETTINGS', 'Settings merged successfully');

          // Migrate old font to new pixel font if it's the old default
          if (
            this.settings.critFont === "Impact, 'Arial Black', sans-serif" ||
            this.settings.critFont === "Impact, 'Arial Black', sans" ||
            this.settings.critFont.includes('VT323') ||
            this.settings.critFont.includes('Silkscreen')
          ) {
            this.settings.critFont = this.defaultSettings.critFont;
            this.saveSettings(); // Save the migrated settings
          }
        } catch (error) {
          this.debugError('LOAD_SETTINGS', error, { phase: 'settings_merge' });
          throw error;
        }
      } else {
        // No saved settings, use defaults
        this.settings = { ...this.defaultSettings };
        // Update debug.enabled after settings are loaded
        this.debug?.enabled = this.settings.debugMode === true;
        this.debugLog('LOAD_SETTINGS', 'No saved settings found, using defaults');
      }
    } catch (error) {
      this.debugError('LOAD_SETTINGS', error, { phase: 'load_settings' });
      console.error('CriticalHit: Error loading settings', error);
      this.settings = { ...this.defaultSettings };
    }
  }

  /**
   * Saves current plugin settings to BetterDiscord storage
   */
  saveSettings() {
    try {
      this.debugLog('SAVE_SETTINGS', 'Saving settings...', {
        critChance: this.settings.critChance,
        enabled: this.settings.enabled,
      });
      BdApi.Data.save('CriticalHit', 'settings', this.settings);
      this.debugLog('SAVE_SETTINGS', 'Settings saved successfully');
    } catch (error) {
      this.debugError('SAVE_SETTINGS', error, { phase: 'save_settings' });
    }
  }

  /**
   * Gets the current Discord channel ID from the URL
   * @returns {string} Channel ID or URL as fallback
   */
  getCurrentChannelId() {
    // Try to get channel ID from URL
    const urlMatch = window.location.href.match(/channels\/\d+\/(\d+)/);
    return urlMatch?.[1] ?? window.location.href;
  }

  // ============================================================================
  // MESSAGE IDENTIFICATION & DETECTION
  // ============================================================================

  /**
   * Validates if a string is a valid Discord ID (17-19 digits)
   */
  isValidDiscordId(id) {
    return id && /^\d{17,19}$/.test(String(id).trim());
  }

  /**
   * Extracts Discord IDs from a string that may contain multiple IDs
   * Returns the last match (usually the message ID)
   */
  extractDiscordId(idStr) {
    if (!idStr) return null;
    const matches = String(idStr)
      .trim()
      .match(/\d{17,19}/g);
    return matches && matches.length > 0 ? matches[matches.length - 1] : null;
  }

  /**
   * Creates a content hash for fallback message identification
   */
  createContentHash(content, author = '', timestamp = '') {
    const hashContent = author
      ? `${author}:${content.substring(0, 100)}:${timestamp}`
      : content.substring(0, 100);

    const hash = Array.from(hashContent).reduce((hash, char) => {
      const charCode = char.charCodeAt(0);
      hash = (hash << 5) - hash + charCode;
      return hash & hash;
    }, 0);

    return `hash_${Math.abs(hash)}`;
  }

  /**
   * Extracts message ID from a message element using multiple fallback methods
   * Tries React fiber traversal, data attributes, and content-based hashing
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {Object} debugContext - Optional debug context for logging
   * @returns {string|null} Message ID or null if not found
   */
  getMessageIdentifier(messageElement, debugContext = null) {
    // Try multiple methods to get Discord's actual message ID
    // PRIORITY: Always try to get the pure Discord message ID (17-19 digit number)
    // This ensures consistency between saving and restoring

    let messageId = null;
    let extractionMethod = null;

    // Method 1: Try React props FIRST (most reliable for actual Discord message ID)
    // This gets the actual message ID from Discord's internal data structure
    try {
      const reactKey = Object.keys(messageElement).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      if (reactKey) {
        // FUNCTIONAL: Fiber traversal (while loop for tree traversal)
        let fiber = messageElement[reactKey];
        let depth = 0;
        while (fiber && depth < 50) {
          depth++;
          // FIRST: Try to get the message object itself, then extract ID
          const messageObj =
            fiber.memoizedProps?.message ||
            fiber.memoizedState?.message ||
            fiber.memoizedProps?.messageProps?.message ||
            fiber.child?.memoizedProps?.message ||
            fiber.child?.memoizedState?.message;

          // If we found a message object, get its ID directly (most reliable)
          if (messageObj?.id) {
            const msgIdStr = String(messageObj.id).trim();
            if (this.isValidDiscordId(msgIdStr)) {
              messageId = msgIdStr;
              extractionMethod = 'react_message_object';
              break;
            }
          }

          // FALLBACK: Try direct ID access
          const msgId =
            fiber.memoizedProps?.message?.id ||
            fiber.memoizedState?.message?.id ||
            fiber.memoizedProps?.messageId ||
            fiber.child?.memoizedProps?.message?.id ||
            fiber.child?.memoizedState?.message?.id;

          if (msgId) {
            const idStr = String(msgId).trim();
            if (this.isValidDiscordId(idStr)) {
              messageId = idStr;
              extractionMethod = 'react_props';
              break;
            }
            // If it's a composite format, extract the message ID part
            const extracted = this.extractDiscordId(idStr);
            if (extracted) {
              messageId = extracted;
              extractionMethod = 'react_props_extracted';
              break;
            }
          }
          fiber = fiber.return;
        }
      }
    } catch (e) {
      // React access failed, continue to fallback
      if (debugContext) {
        this.debugLog('GET_MESSAGE_ID', 'React access failed', { error: e.message });
      }
    }

    // Method 2: Check for data-list-item-id (Discord's message container ID)
    // Extract pure message ID from composite formats like "chat-messages___chat-messages-{channelId}-{messageId}"
    if (!messageId) {
      const listItemId =
        messageElement.getAttribute('data-list-item-id') ||
        messageElement.closest('[data-list-item-id]')?.getAttribute('data-list-item-id');

      if (listItemId) {
        const idStr = String(listItemId).trim();
        messageId = this.isValidDiscordId(idStr) ? idStr : this.extractDiscordId(idStr);
        extractionMethod = this.isValidDiscordId(idStr) ? 'data-list-item-id_pure' : (messageId ? 'data-list-item-id_extracted' : null);
      }
    }

    // Method 3: Check for id attribute - extract pure message ID from composite formats
    // Be careful - id attributes often contain channel IDs, so prioritize message ID
    if (!messageId) {
      const idAttr =
        messageElement.getAttribute('id') || messageElement.closest('[id]')?.getAttribute('id');
      if (idAttr) {
        const idStr = String(idAttr).trim();
        messageId = this.isValidDiscordId(idStr) ? idStr : this.extractDiscordId(idStr);
        extractionMethod = this.isValidDiscordId(idStr) ? 'id_attr_pure' : (messageId ? 'id_attr_extracted' : null);
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
        extractionMethod = this.isValidDiscordId(idStr) ? 'data-message-id' : (messageId ? 'data-message-id_extracted' : null);
      }
    }

    // Normalize to string and trim, then validate
    if (messageId) {
      messageId = String(messageId).trim();
      if (!this.isValidDiscordId(messageId)) {
        const extracted = this.extractDiscordId(messageId);
        messageId = extracted || null;
        extractionMethod = extracted ? (extractionMethod ? `${extractionMethod}_extracted` : 'regex_extracted') : null;
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
        messageId = author ? this.createContentHash(content, author, timestamp) : this.createContentHash(content);
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

  // ============================================================================
  // MESSAGE HISTORY MANAGEMENT
  // ============================================================================

  /**
   * Saves message history to BetterDiscord storage
   * Includes all processed messages with crit status and settings
   */
  saveMessageHistory() {
    try {
      // #region agent log
      // #endregion
      // Use cached crit history or compute once
      const critHistory = this.getCritHistory();
      const critCount = critHistory.length;
      // #region agent log
      // #endregion
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

      // Limit history size to prevent storage bloat
      if (this.messageHistory.length > this.maxHistorySize) {
        // Keep only the most recent messages
        const oldSize = this.messageHistory.length;
        const oldCritCount = critCount; // Use already computed critCount
        this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
        // Invalidate cache after history modification
        this._cachedCritHistory = null;
        const newCritHistory = this.getCritHistory();
        const newCritCount = newCritHistory.length;
        this.debugLog('SAVE_MESSAGE_HISTORY', 'WARNING: History trimmed', {
          oldSize,
          newSize: this.messageHistory.length,
          oldCritCount,
          newCritCount,
          critsLost: oldCritCount - newCritCount,
        });
      }

      // Save to BetterDiscord Data storage
      BdApi.Data.save('CriticalHit', 'messageHistory', this.messageHistory);

      // Verify save was successful
      const verifyLoad = BdApi.Data.load('CriticalHit', 'messageHistory');
      // Use cached crit count if available
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
   * Adds a message to history with crit status and settings
   * Handles duplicate detection, content-based matching for reprocessed messages
   * @param {Object} messageData - Message data including ID, author, channel, crit status
   */
  addToHistory(messageData) {
    try {
      const isCrit = messageData.isCrit || false;

      // Validate and normalize messageId (must be string, prefer Discord ID format)
      let messageId = messageData.messageId;
      if (messageId) {
        messageId = String(messageId).trim();
        // Extract Discord ID if it's embedded in a composite format
        if (!/^\d{17,19}$/.test(messageId)) {
          const match = messageId.match(/\d{17,19}/);
          if (match) {
            messageId = match[0]; // Use extracted Discord ID
          }
        }
      }

      // Validate and normalize authorId (must be string, Discord ID format)
      let authorId = messageData.authorId;
      if (authorId) {
        authorId = String(authorId).trim();
        // Ensure it's a valid Discord user ID format
        if (!/^\d{17,19}$/.test(authorId)) {
          const match = authorId.match(/\d{17,19}/);
          if (match) {
            authorId = match[0]; // Use extracted Discord ID
          } else {
            authorId = null; // Invalid format, don't store
          }
        }
      }

      // Validate channelId
      const channelId = messageData.channelId ? String(messageData.channelId).trim() : null;

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
      // Try ID match first, then content-based match for reprocessed messages
      // Use normalized messageId, not messageData.messageId
      const isValidDiscordId = messageId ? /^\d{17,19}$/.test(messageId) : false;
      const isHashId = messageId?.startsWith('hash_');

      // Add to pending queue immediately for crits to handle race condition
      // This allows restoration to find crits even before they're added to history
      // IMPORTANT: Also add hash IDs (queued messages) using content-based matching
      // When Discord finishes processing and assigns real ID, we can match by content
      if (isCrit && historyEntry?.critSettings && messageId && messageData?.messageContent) {
        // Handle spam - limit queue size and clean up aggressively
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
        const contentHash =
          messageData.author && messageData.messageContent
            ? this.getContentHash(
                messageData.author,
                messageData.messageContent,
                messageData.timestamp
              )
            : null;

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

      // #region agent log
      if (isCrit) {
      }
      // #endregion

      let existingIndex = this.messageHistory.findIndex(
        (entry) =>
          entry.messageId === messageData.messageId && entry.channelId === messageData.channelId
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
        const contentHash = this.getContentHash(
          messageData.author,
          messageData.messageContent,
          messageData.timestamp
        );
        existingIndex = this.messageHistory.findIndex((entry) => {
          if (entry.channelId !== messageData.channelId) return false;
          // Skip hash IDs in history
          if (String(entry.messageId).startsWith('hash_')) return false;
          // Match by content hash
          return entry.messageContent && entry.author &&
            this.getContentHash(entry.author, entry.messageContent, entry.timestamp) === contentHash;
        });

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

      if (existingIndex >= 0) {
        // Update existing entry
        const wasCrit = this.messageHistory[existingIndex].isCrit;
        const existingId = this.messageHistory[existingIndex].messageId;
        const existingIsHashId = String(existingId).startsWith('hash_');

        // #region agent log
        // #endregion

        // If updating from hash ID to valid Discord ID, this is a message being sent
        // Keep the crit status but update with the real Discord ID
        if (existingIsHashId && isValidDiscordId && wasCrit && isCrit) {
          this.debugLog('ADD_TO_HISTORY', 'Updating hash ID to Discord ID for sent message', {
            oldId: existingId,
            newId: messageData.messageId,
            wasCrit,
            nowCrit: isCrit,
          });
        }

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

        // FIFO QUEUE: If exceeds limit, remove oldest immediately
        if (this.messageHistory.length > this.maxHistorySize) {
          const removed = this.messageHistory.shift(); // Remove oldest
          this.debugLog('ADD_TO_HISTORY', 'Removed oldest message (FIFO queue)', {
            removedId: removed.messageId,
            currentSize: this.messageHistory.length,
            maxSize: this.maxHistorySize,
          });
        }

        // Invalidate cache when history is modified
        if (isCrit) {
          this._cachedCritHistory = null;
        }
        // #region agent log
        // #endregion
        this.debugLog('ADD_TO_HISTORY', 'Added new history entry', {
          index: this.messageHistory.length - 1,
          isCrit: isCrit,
          messageId: messageData.messageId,
          authorId: messageData.authorId,
        });
      }

      // Auto-save immediately on crit, periodically for non-crits
      // #region agent log
      // #endregion
      if (isCrit) {
        this.debugLog('ADD_TO_HISTORY', 'CRITICAL: Triggering immediate save for crit message', {
          messageId: messageData.messageId,
          channelId: messageData.channelId,
        });
        // #region agent log
        // #endregion
        this.saveMessageHistory(); // Save immediately when crit happens
      } else if (this.messageHistory.length % 20 === 0) {
        // #region agent log
        // #endregion
        this.saveMessageHistory(); // Save every 20 non-crit messages
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
    ) {
      return this._cachedCritHistory.data;
    }

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
      const critMessageIds = new Set(channelCrits.map((entry) => String(entry.messageId).trim()));
      let restoredCount = 0;
      let skippedAlreadyStyled = 0;
      let noIdFound = 0;
      let idMismatch = 0;
      const foundIds = new Set();

      // Cache DOM queries to avoid repeated querySelectorAll calls
      const now = Date.now();
      let allMessages = [];

      // Check cache validity
      if (
        this._cachedMessageSelectors &&
        this._cachedMessageSelectorsTimestamp &&
        now - this._cachedMessageSelectorsTimestamp < this._cachedMessageSelectorsMaxAge
      ) {
        allMessages = this._cachedMessageSelectors;
      } else {
        // Find all messages in current channel - use more specific selector
        // Try multiple selectors to catch all message containers
        const selectors = [
          '[class*="message"]:not([class*="messageContent"]):not([class*="messageGroup"])',
          '[class*="messageListItem"]',
          '[class*="message"]',
        ];

        selectors.find((selector) => {
          const messages = document.querySelectorAll(selector);
          const hasMessages = messages.length > 0;
          hasMessages && (allMessages = Array.from(messages));
          hasMessages && (this._cachedMessageSelectors = allMessages);
          hasMessages && (this._cachedMessageSelectorsTimestamp = now);
          return hasMessages;
        });
      }

      // Remove duplicates
      const uniqueMessages = [];
      const seenElements = new Set();
      allMessages.forEach((msg) => {
        if (!seenElements.has(msg)) {
          seenElements.add(msg);
          uniqueMessages.push(msg);
        }
      });

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
          const normalizedMsgId = String(msgId).trim();

          // Extract pure Discord message ID if msgId is in composite format
          // e.g., "chat-messages___chat-messages-{channelId}-{messageId}" -> extract {messageId}
          let pureMessageId = normalizedMsgId;
          if (!/^\d{17,19}$/.test(normalizedMsgId)) {
            // Try to extract pure ID from composite format
            const match = normalizedMsgId.match(/\d{17,19}/);
            if (match) {
              pureMessageId = match[0];
            }
          }

          // Check if this message ID matches any crit
          // Try exact match first, then try pure ID match, then partial match
          const matchedEntry = channelCrits.find((entry) => {
            const entryId = String(entry.messageId).trim();
            const entryPureId = /^\d{17,19}$/.test(entryId)
              ? entryId
              : entryId.match(/\d{17,19}/)?.[0];

            // Exact match
            if (entryId === normalizedMsgId || entryId === pureMessageId) {
              return true;
            }

            // Pure ID match (if we extracted a pure ID)
            if (pureMessageId !== normalizedMsgId && entryPureId && entryPureId === pureMessageId) {
              return true;
            }

            // Partial match (for composite formats)
            return (
              normalizedMsgId.includes(entryId) ||
              entryId.includes(normalizedMsgId) ||
              (pureMessageId &&
                entryPureId &&
                (pureMessageId.includes(entryPureId) || entryPureId.includes(pureMessageId)))
            );
          });

          if (matchedEntry?.critSettings) {
            // Restore crit with original settings
            // Only log restoration attempts if verbose or first attempt
            if (retryCount === 0 || this.debug?.verbose) {
              this.debugLog('RESTORE_CHANNEL_CRITS', 'Attempting to restore crit for message', {
                msgId: normalizedMsgId,
                matchedEntryId: matchedEntry.messageId,
                hasCritSettings: !!matchedEntry.critSettings,
                critSettings: matchedEntry.critSettings,
                elementExists: !!msgElement,
                elementAlreadyStyled: msgElement.classList.contains('bd-crit-hit'),
              });
            }

            this.applyCritStyleWithSettings(msgElement, matchedEntry.critSettings);
            this.critMessages.add(msgElement);
            // Mark as processed using message ID (not element reference)
            if (normalizedMsgId) {
              this.markAsProcessed(normalizedMsgId);
            }
            restoredCount++;

            // Verify restoration
            const verifyStyled = msgElement.classList.contains('bd-crit-hit');
            this.debugLog(
              'RESTORE_CHANNEL_CRITS',
              verifyStyled
                ? 'SUCCESS: Successfully restored crit for message'
                : 'WARNING: Restoration may have failed',
              {
                msgId: normalizedMsgId,
                restoredCount,
                total: channelCrits.length,
                elementHasClass: verifyStyled,
                critMessagesSize: this.critMessages.size,
              }
            );
          } else {
            idMismatch++;
            // Only log mismatch if we have a pure Discord ID (not hash) to reduce noise
            // Hash IDs are expected to not match most of the time
            // Only log mismatches if verbose (reduces spam)
            if (
              (/^\d{17,19}$/.test(normalizedMsgId) || /^\d{17,19}$/.test(pureMessageId)) &&
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
        if (this.debug.verbose) {
          this.debugLog('RESTORE_CHANNEL_CRITS', 'Not all crits restored, will retry', {
            restored: restoredCount,
            total: channelCrits.length,
            nextRetry: nextRetry,
            missingCount: channelCrits.length - restoredCount,
          });
        }
        // Use MutationObserver instead of setTimeout to watch for new messages being added
        // This is more efficient than polling and responds immediately when messages load
        const messageContainer =
          document.querySelector('[class*="messagesWrapper"]') || document.body;
        const restoreObserver = new MutationObserver((mutations) => {
          const hasNewMessages = mutations.some((m) =>
            m.type === 'childList' &&
            m.addedNodes.length > 0 &&
            Array.from(m.addedNodes).some(
              (node) => node.nodeType === Node.ELEMENT_NODE && node.querySelector?.('[class*="message"]') !== null
            )
          );

          if (hasNewMessages && this.currentChannelId === channelId) {
            // New messages added, retry restoration
            restoreObserver.disconnect();
            this.restoreChannelCrits(channelId, nextRetry);
          }
        });

        restoreObserver.observe(messageContainer, {
          childList: true,
          subtree: true,
        });

        // Fallback: Cleanup observer after 2 seconds if no messages load
        setTimeout(
          () => {
            restoreObserver.disconnect();
          },
          retryCount < 2 ? 2000 : 3000
        );
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
   * Applies crit styling to a message element using saved crit settings
   * Handles gradient, font, animation, and glow effects with persistence monitoring
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {Object} critSettings - Saved crit settings (gradient, font, etc.)
   */
  applyCritStyleWithSettings(messageElement, critSettings) {
    try {
      const msgId = this.getMessageIdentifier(messageElement);
      // #region agent log
      // #endregion
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
          // Purple to black gradient - simplified 3-color gradient
          const gradientColors =
            'linear-gradient(to bottom, #8b5cf6 0%, #6d28d9 50%, #000000 100%)';
          // Use setProperty with !important to ensure it applies
          content.style.setProperty('background-image', gradientColors, 'important');
          content.style.setProperty('background', gradientColors, 'important');
          content.style.setProperty('-webkit-background-clip', 'text', 'important');
          content.style.setProperty('background-clip', 'text', 'important');
          content.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
          content.style.setProperty('color', 'transparent', 'important');
          content.style.setProperty('display', 'inline-block', 'important');

          // Explicitly exclude username/timestamp elements from gradient
          const usernameElements = messageElement.querySelectorAll(
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

          // Verify gradient was actually applied and ensure CSS rendering
          // Force reflow to ensure styles are applied before checking
          void content.offsetHeight;

          const computedStyles = window.getComputedStyle(content);
          const hasGradientInStyle = content?.style?.backgroundImage?.includes('gradient');
          const hasGradientInComputed = computedStyles?.backgroundImage?.includes('gradient');
          const hasWebkitClip =
            computedStyles?.webkitBackgroundClip === 'text' ||
            computedStyles?.backgroundClip === 'text';

          // If gradient is in computed styles but inline style was lost, reapply
          // Discord sometimes removes inline styles even with !important
          if (hasGradientInComputed && (!hasGradientInStyle || !hasWebkitClip)) {
            // Reapply all gradient styles aggressively
            content.style.setProperty('background-image', gradientColors, 'important');
            content.style.setProperty('background', gradientColors, 'important');
            content.style.setProperty('-webkit-background-clip', 'text', 'important');
            content.style.setProperty('background-clip', 'text', 'important');
            content.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
            content.style.setProperty('color', 'transparent', 'important');
            content.style.setProperty('display', 'inline-block', 'important');

            // Force another reflow
            void content.offsetHeight;
          }

          // #region agent log
          // #endregion

          this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Gradient applied for restoration', {
            gradient: gradientColors,
            hasGradientInComputed,
            hasWebkitClip,
          });

          // If gradient didn't apply correctly, use MutationObserver to watch for style changes
          if (!hasGradientInComputed && content) {
            const gradientRetryObserver = new MutationObserver((mutations) => {
              const hasStyleMutation = mutations.some(
                (m) =>
                  m.type === 'attributes' &&
                  (m.attributeName === 'style' || m.attributeName === 'class')
              );

              if (hasStyleMutation) {
                const retryComputed = window.getComputedStyle(content);
                if (!retryComputed?.backgroundImage?.includes('gradient')) {
                  // Force reapply gradient
                  content.style.setProperty('background-image', gradientColors, 'important');
                  content.style.setProperty('background', gradientColors, 'important');
                  content.style.setProperty('-webkit-background-clip', 'text', 'important');
                  content.style.setProperty('background-clip', 'text', 'important');
                  content.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                  content.style.setProperty('color', 'transparent', 'important');
                } else {
                  // Gradient is now present, disconnect observer
                  gradientRetryObserver.disconnect();
                }
              }
            });

            gradientRetryObserver.observe(content, {
              attributes: true,
              attributeFilter: ['style', 'class'],
            });

            // Cleanup after 2 seconds
            setTimeout(() => {
              gradientRetryObserver.disconnect();
            }, 2000);
          }
        } else {
          // Use saved color or current setting
          const color = critSettings.color || this.settings.critColor;
          content.style.setProperty('color', color, 'important');
          content.style.setProperty('background', 'none', 'important');
          content.style.setProperty('-webkit-background-clip', 'unset', 'important');
          content.style.setProperty('background-clip', 'unset', 'important');
          content.style.setProperty('-webkit-text-fill-color', 'unset', 'important');

          // Explicitly exclude username/timestamp elements from color
          const usernameElements = messageElement.querySelectorAll(
            '[class*="username"], [class*="timestamp"], [class*="author"]'
          );
          usernameElements.forEach((el) => {
            el.style.setProperty('color', 'unset', 'important');
          });

          this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Solid color applied for restoration', {
            color,
          });
        }

        // Apply font styles with !important to override ALL CSS including Discord's - Force Nova Flat
        content.style.setProperty(
          'font-family',
          "'Nova Flat', sans-serif", // Force Nova Flat, ignore saved font
          'important'
        );
        content.style.setProperty('font-weight', 'bold', 'important'); // Bold for more impact
        content.style.setProperty('font-size', '1.6em', 'important'); // Larger for more impact
        content.style.setProperty('letter-spacing', '1px', 'important'); // Slight spacing
        content.style.setProperty('-webkit-text-stroke', 'none', 'important'); // Remove stroke for cleaner gradient
        content.style.setProperty('text-stroke', 'none', 'important'); // Remove stroke for cleaner gradient
        content.style.setProperty('font-synthesis', 'none', 'important'); // Prevent font synthesis
        content.style.setProperty('font-variant', 'normal', 'important'); // Override any font variants
        content.style.setProperty('font-style', 'normal', 'important'); // Override italic/oblique

        // Apply glow effect - Purple glow for purple-black gradient
        if (critSettings.glow !== false && this.settings?.critGlow) {
          if (useGradient) {
            // Purple glow that enhances the purple-black gradient
            content.style.setProperty(
              'text-shadow',
              '0 0 3px rgba(139, 92, 246, 0.5), 0 0 6px rgba(124, 58, 237, 0.4), 0 0 9px rgba(109, 40, 217, 0.3), 0 0 12px rgba(91, 33, 182, 0.2)',
              'important'
            );
          } else {
            const color = critSettings.color || this.settings.critColor;
            content.style.setProperty(
              'text-shadow',
              `0 0 2px ${color}, 0 0 3px ${color}`,
              'important'
            );
          }
        } else {
          content.style.setProperty('text-shadow', 'none', 'important');
        }

        critSettings.animation !== false && this.settings?.critAnimation &&
          (content.style.animation = 'critPulse 0.5s ease-in-out');
      }

      messageElement.classList.add('bd-crit-hit');
      // #region agent log
      // #endregion
      this.injectCritCSS();

      // Re-get message ID for final verification (in case it wasn't available earlier)
      const finalMsgId = this.getMessageIdentifier(messageElement) || msgId;

      // Final verification of computed styles after restoration
      const finalComputedStyles = content ? window.getComputedStyle(content) : null;
      const finalHasGradient = finalComputedStyles?.backgroundImage?.includes('gradient');
      const finalHasWebkitClip =
        finalComputedStyles?.webkitBackgroundClip === 'text' ||
        finalComputedStyles?.backgroundClip === 'text';

      // #region agent log
      // #endregion

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

      // Set up MutationObserver to watch for Discord replacing the content element
      // Discord often replaces DOM elements after we style them, causing gradients to disappear
      if (content && useGradient && finalMsgId) {
        // Clean up existing observer for this message if any
        if (this.styleObservers.has(finalMsgId)) {
          this.styleObservers.get(finalMsgId).disconnect();
        }

        // Event-based gradient check - only runs when mutations occur
        // Replaced periodic setInterval with MutationObserver for better performance
        const checkGradient = () => {
          // Re-query message element in case Discord replaced it
          const currentMessageElement =
            document.querySelector(`[data-message-id="${finalMsgId}"]`) ||
            Array.from(document.querySelectorAll('[class*="message"]')).find((el) => {
              const id = this.getMessageIdentifier(el);
              return id === finalMsgId || String(id).includes(finalMsgId);
            });

          if (
            !currentMessageElement ||
            !currentMessageElement.isConnected ||
            !currentMessageElement.classList.contains('bd-crit-hit')
          ) {
            return; // Message removed or no longer a crit
          }

          const currentContent = this.findMessageContentElement(currentMessageElement);

          if (currentContent) {
            const currentComputed = window.getComputedStyle(currentContent);
            const hasGradient = currentComputed?.backgroundImage?.includes('gradient');
            const hasWebkitClip =
              currentComputed?.webkitBackgroundClip === 'text' ||
              currentComputed?.backgroundClip === 'text';

            // #region agent log
            // #endregion

            if (!hasGradient && useGradient) {
              // Content element was replaced or gradient was removed - reapply
              const gradientColors =
                'linear-gradient(to bottom, #8b5cf6 0%, #6d28d9 50%, #000000 100%)';
              currentContent.style.setProperty('background-image', gradientColors, 'important');
              currentContent.style.setProperty('background', gradientColors, 'important');
              currentContent.style.setProperty('-webkit-background-clip', 'text', 'important');
              currentContent.style.setProperty('background-clip', 'text', 'important');
              currentContent.style.setProperty(
                '-webkit-text-fill-color',
                'transparent',
                'important'
              );
              currentContent.style.setProperty('color', 'transparent', 'important');
              currentContent.style.setProperty('display', 'inline-block', 'important');
              currentContent.classList.add('bd-crit-text-content');

              // Force reflow
              void currentContent.offsetHeight;

              // #region agent log
              // #endregion
            }
          }
        };

        // Event-based MutationObserver - removed periodic setInterval
        // Observe parent container AND content element for style attribute changes
        const parentContainer = messageElement?.parentElement || document.body;

        const styleObserver = new MutationObserver((mutations) => {
          // Event-based check - only runs when mutations occur
          const hasStyleMutation = mutations.some(
            (m) =>
              m.type === 'attributes' &&
              (m.attributeName === 'style' || m.attributeName === 'class')
          );
          const hasChildMutation = mutations.some((m) => m.type === 'childList');

          if (hasStyleMutation || hasChildMutation) {
            // Use requestAnimationFrame to batch checks and avoid excessive reflows
            requestAnimationFrame(() => {
              requestAnimationFrame(checkGradient);
            });
          }
        });

        // Observe parent for element replacements
        styleObserver.observe(parentContainer, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class'],
        });

        // Also observe content element directly for style changes
        if (content) {
          styleObserver.observe(content, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            subtree: false,
          });
        }

        // Store observer for cleanup
        this.styleObservers.set(finalMsgId, styleObserver);
      }

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

        // Use MutationObserver instead of setTimeout for restoration retry
        if (messageElement?.isConnected && useGradient) {
          const retryContent = this.findMessageContentElement(messageElement);
          if (retryContent) {
            const checkAndRestoreGradient = () => {
              if (messageElement?.classList?.contains('bd-crit-hit') && messageElement?.isConnected) {
                const retryComputed = window.getComputedStyle(retryContent);
                if (!retryComputed?.backgroundImage?.includes('gradient')) {
                  const gradientColors =
                    'linear-gradient(to bottom, #8b5cf6 0%, #6d28d9 50%, #000000 100%)';
                  retryContent.style.setProperty('background-image', gradientColors, 'important');
                  retryContent.style.setProperty('background', gradientColors, 'important');
                  retryContent.style.setProperty('-webkit-background-clip', 'text', 'important');
                  retryContent.style.setProperty('background-clip', 'text', 'important');
                  retryContent.style.setProperty(
                    '-webkit-text-fill-color',
                    'transparent',
                    'important'
                  );
                  retryContent.style.setProperty('color', 'transparent', 'important');
                  retryContent.style.setProperty('display', 'inline-block', 'important');
                  return false; // Still missing, keep observing
                }
                return true; // Gradient present
              }
              return true; // Not a crit, stop observing
            };

            // Initial check
            if (!checkAndRestoreGradient()) {
              // Set up MutationObserver to watch for style changes
              const restorationRetryObserver = new MutationObserver((mutations) => {
                const hasStyleMutation = mutations.some(
                  (m) =>
                    m.type === 'attributes' &&
                    (m.attributeName === 'style' || m.attributeName === 'class')
                );

                if (hasStyleMutation) {
                  if (checkAndRestoreGradient()) {
                    restorationRetryObserver.disconnect();
                  }
                }
              });

              restorationRetryObserver.observe(retryContent, {
                attributes: true,
                attributeFilter: ['style', 'class'],
              });

              // Also observe message element for class changes
              restorationRetryObserver.observe(messageElement, {
                attributes: true,
                attributeFilter: ['class'],
              });

              // Cleanup after 2 seconds
              setTimeout(() => {
                restorationRetryObserver.disconnect();
              }, 2000);
            }
          }
        }
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
   */
  getContentHash(author, content, timestamp) {
    const hashContent = `${author}:${content.substring(0, 100)}:${timestamp || ''}`;
    const hash = Array.from(hashContent).reduce((hash, char) => {
      const charCode = char.charCodeAt(0);
      hash = (hash << 5) - hash + charCode;
      return hash & hash;
    }, 0);
    return `hash_${Math.abs(hash)}`;
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
    if (this.processedMessages.size > this.maxProcessedMessages) {
      this.cleanupProcessedMessages();
    }

    return true;
  }

  /**
   * Start periodic history cleanup (runs every 30 minutes)
   */
  startPeriodicCleanup() {
    // Clear any existing interval
    if (this.historyCleanupInterval) {
      clearInterval(this.historyCleanupInterval);
    }

    // Run cleanup every 30 minutes (1800000 ms)
    this.historyCleanupInterval = setInterval(() => {
      try {
        this.debugLog('PERIODIC_CLEANUP', 'Running periodic history cleanup');
        if (this.settings.autoCleanupHistory) {
          this.cleanupOldHistory(this.settings.historyRetentionDays || 30);
        }
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
      if (this.debug?.enabled) {
        console.log(
          `CriticalHit: Cleaned up ${removed} old history entries (${removedCrits} crits)`
        );
      }
      this.saveMessageHistory();
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

    // Find the message container - try multiple selectors for compatibility
    const findMessageContainer = () => {
      // Try common Discord message container selectors
      const selectors = [
        '[class*="messagesWrapper"]',
        '[class*="messageContainer"]',
        '[class*="scrollerInner"]',
        '[class*="scroller"]',
        '[class*="listItem"]',
      ];

      const foundSelector = selectors.find((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          // Verify it's actually a message container by checking for message children
          const hasMessages = element.querySelector('[class*="message"]') !== null;
          if (hasMessages || selector.includes('scroller')) {
            return element;
          }
        }
        return false;
      });

      if (foundSelector) {
        const element = document.querySelector(foundSelector);
        if (element) return element;
      }

      // Last resort: find any element with messages
      const msgEl = document.querySelector('[class*="message"]');
      if (msgEl) {
        return msgEl.closest('[class*="scroller"]') || msgEl.parentElement?.parentElement;
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
      this.currentChannelId && this.saveMessageHistory(); // Save any pending history entries
      this.currentChannelId = channelId;
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
          if (this.currentChannelId === channelId) {
            this.restoreChannelCrits(channelId, 3);
          }
        }, 3000);
      } else {
        // Wait a bit more and try again
        setTimeout(tryLoadChannel, 500);
      }
    };

    // Start loading check after initial delay
    setTimeout(tryLoadChannel, 1000);

    // Create mutation observer to watch for new messages
    this.messageObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            // Element node
            this.processNode(node);
            // Also check if this is a message that needs crit restoration
            this.checkForRestoration(node);
          }
        });
      });
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

  /**
   * Checks if an element was newly added to the DOM
   * Used to avoid reprocessing existing messages
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if element is newly added
   */
  isNewlyAdded(element) {
    // Check if element was added after observer started
    // MutationObserver only fires for newly added nodes, so if we're here, it's likely new
    // But we can also check if it's in the visible viewport near the bottom
    return true; // MutationObserver only fires for new nodes anyway
  }

  /**
   * Sets up listeners for channel navigation changes
   * Restores crit styling when switching channels
   */
  setupChannelChangeListener() {
    // Listen for channel changes by watching URL changes
    if (this.urlObserver) {
      this.urlObserver.disconnect();
    }

    let lastUrl = window.location.href;
    this.urlObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Channel changed, re-initialize observer
        if (this.debug?.enabled) {
          console.log('CriticalHit: Channel changed, re-initializing...');
        }
        // Save current session data before switching
        if (this.currentChannelId) {
          this.saveMessageHistory();
        }
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
        this.saveMessageHistory();
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

    if (hasReplyWrapper) {
      return true;
    }

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
          ) {
            return true;
          }
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

  /**
   * Checks if a message needs crit styling restoration from history
   * Handles race conditions with pending crits queue and throttling
   * @param {Node} node - DOM node to check
   */
  checkForRestoration(node) {
    // Check if a newly added node is a message that should have a crit restored
    if (!this.currentChannelId || this.isLoadingChannel) {
      return;
    }

    // Throttle restoration checks to prevent spam
    // First check if node is a message element before throttling
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

    // If not, check children
    if (!messageElement) {
      messageElement = node.querySelector(
        '[class*="message"]:not([class*="messageContent"]):not([class*="messageGroup"])'
      );
    }

    // Only throttle if we have a message element with a valid ID
    if (messageElement) {
      const msgId = this.getMessageIdentifier(messageElement);
      if (msgId) {
        const normalizedId = String(msgId).trim();
        // Skip hash IDs for throttling (they're temporary)
        if (!normalizedId.startsWith('hash_')) {
          const lastCheck = this._restorationCheckThrottle.get(normalizedId);
          const now = Date.now();
          if (lastCheck && now - lastCheck < this._restorationCheckThrottleMs) return; // Skip if checked too recently
          this._restorationCheckThrottle.set(normalizedId, now);

          // FUNCTIONAL: Clean up old throttle entries (.forEach() + short-circuit)
          this._restorationCheckThrottle.size > 500 &&
            Array.from(this._restorationCheckThrottle.entries()).forEach(([id, checkTime]) => {
              now - checkTime > 1000 && this._restorationCheckThrottle.delete(id);
            });
        }
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
        let pureMessageId = normalizedMsgId;
        if (!/^\d{17,19}$/.test(normalizedMsgId)) {
          const match = normalizedMsgId.match(/\d{17,19}/);
          if (match) {
            pureMessageId = match[0];
          }
        }

        // Also try content-based matching for reprocessed messages
        // When a message is "undone" and retyped, it might get a new messageId
        // but same content - try to match by content hash as fallback
        const messageContent = messageElement.textContent?.trim() || '';
        const author =
          messageElement.querySelector('[class*="username"]')?.textContent?.trim() ||
          messageElement.querySelector('[class*="author"]')?.textContent?.trim() ||
          '';
        const timestamp = messageElement.querySelector('time')?.getAttribute('datetime') || '';
        let contentHash = null;
        if (messageContent && author) {
          const hashContent = `${author}:${messageContent.substring(0, 100)}:${timestamp}`;
          const hash = Array.from(hashContent).reduce((hash, char) => {
            const charCode = char.charCodeAt(0);
            hash = (hash << 5) - hash + charCode;
            return hash & hash;
          }, 0);
          contentHash = `hash_${Math.abs(hash)}`;
        }

        // Only log restoration checks if verbose (happens frequently)
        if (this.debug.verbose) {
          this.debugLog('CHECK_FOR_RESTORATION', 'Checking if message needs restoration', {
            msgId: normalizedMsgId,
            pureMessageId: pureMessageId !== normalizedMsgId ? pureMessageId : undefined,
            channelId: this.currentChannelId,
            channelCritCount: channelCrits.length,
          });
        }

        // Only match by valid Discord IDs, not hash IDs
        // Hash IDs are for unsent messages and should not be matched
        const isValidDiscordId = /^\d{17,19}$/.test(normalizedMsgId);
        let historyEntry = null;

        // Check pending queue first to handle race condition
        // Crits are added to pending queue immediately, before history
        if (isValidDiscordId) {
          const pendingCrit =
            this.pendingCrits.get(normalizedMsgId) || this.pendingCrits.get(pureMessageId);

          if (pendingCrit?.channelId === this.currentChannelId) {
            // Found in pending queue! Use it immediately
            historyEntry = {
              messageId: normalizedMsgId,
              channelId: this.currentChannelId,
              isCrit: true,
              critSettings: pendingCrit.critSettings,
              messageContent: pendingCrit.messageContent,
              author: pendingCrit.author,
            };

            // #region agent log
            // #endregion
          }
        }

        if (isValidDiscordId && !historyEntry) {
          // Try exact match first, then pure ID match, then partial match
          historyEntry = channelCrits.find((entry) => {
            const entryId = String(entry.messageId).trim();
            // Only match valid Discord IDs, skip hash IDs
            if (entryId.startsWith('hash_')) return false;
            return entryId === normalizedMsgId || entryId === pureMessageId;
          });
          if (!historyEntry) {
            // Try matching pure IDs
            historyEntry = channelCrits.find((entry) => {
              const entryId = String(entry.messageId).trim();
              // Skip hash IDs
              if (entryId.startsWith('hash_')) return false;
              const entryPureId = /^\d{17,19}$/.test(entryId)
                ? entryId
                : entryId.match(/\d{17,19}/)?.[0];
              return (
                (pureMessageId && entryPureId && entryPureId === pureMessageId) ||
                normalizedMsgId.includes(entryId) ||
                entryId.includes(normalizedMsgId)
              );
            });
          }

          // If no ID match found, try content-based matching for reprocessed messages
          // This handles cases where message was "undone" and retyped with different ID
          if (!historyEntry && contentHash && messageContent && author) {
            // Try to find by content hash (for messages that were reprocessed)
            historyEntry = channelCrits.find((entry) => {
              const entryId = String(entry.messageId).trim();
              // Skip hash IDs in history
              if (entryId.startsWith('hash_')) return false;
              // Match by content if available
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
        }

        // #region agent log
        // #endregion

        // If not found initially, retry after a delay to handle race condition
        // Discord reprocesses messages before checkForCrit finishes adding to history
        const performRestoration = (entryToRestore) => {
          if (!entryToRestore || !entryToRestore.critSettings) return;

          this.debugLog(
            'CHECK_FOR_RESTORATION',
            'SUCCESS: Found matching crit in history, restoring',
            {
              msgId: normalizedMsgId,
              channelId: this.currentChannelId,
              hasCritSettings: !!entryToRestore.critSettings,
              critSettings: entryToRestore.critSettings,
            }
          );

          // Use double RAF for DOM stability, then retry if element is replaced
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // #region agent log
              // #endregion

              // Re-query element right before restoration to handle Discord replacements
              // Discord often replaces elements, so the closure reference might be stale
              const currentMessageElement =
                document.querySelector(`[data-message-id="${normalizedMsgId}"]`) ||
                Array.from(document.querySelectorAll('[class*="message"]')).find((el) => {
                  const id = this.getMessageIdentifier(el);
                  return id === normalizedMsgId || String(id).includes(normalizedMsgId);
                }) ||
                messageElement; // Fallback to original if not found

              // Check if element is still valid and in DOM
              if (!currentMessageElement || !currentMessageElement.isConnected) {
                // Element was replaced - log and skip (will be caught by next mutation observer cycle)
                this.debugLog(
                  'CHECK_FOR_RESTORATION',
                  'Element replaced, skipping (will retry on next cycle)',
                  {
                    msgId: normalizedMsgId,
                    hadOriginalElement: !!messageElement,
                    foundCurrentElement: !!currentMessageElement,
                  }
                );
                return;
              }

              // Always restore gradient when we find a crit in history
              // Even if gradient appears present, Discord might replace the element or remove styles
              // Reapplying ensures it persists correctly
              const useGradient = entryToRestore.critSettings?.gradient !== false;
              const hasCritClass = currentMessageElement.classList.contains('bd-crit-hit');

              // Always restore - don't skip even if gradient appears present
              // Discord's DOM manipulation can cause stale element references or style removal
              const needsRestoration = true;

              // #region agent log
              // #endregion

              if (needsRestoration) {
                // Restore the crit
                // #region agent log
                // #endregion
                this.applyCritStyleWithSettings(currentMessageElement, entryToRestore.critSettings);
                this.critMessages.add(currentMessageElement);
                // Mark as processed using message ID (not element reference)
                if (normalizedMsgId) {
                  this.markAsProcessed(normalizedMsgId);
                }

                // Use MutationObserver instead of polling setTimeout
                // Watch for style changes on content element to detect gradient application/removal
                const verifyGradient = () => {
                  // Re-query element in case Discord replaced it
                  const retryElement =
                    document.querySelector(`[data-message-id="${normalizedMsgId}"]`) ||
                    Array.from(document.querySelectorAll('[class*="message"]')).find((el) => {
                      const id = this.getMessageIdentifier(el);
                      return id === normalizedMsgId || String(id).includes(normalizedMsgId);
                    });

                  if (!retryElement || !retryElement.isConnected) {
                    // #region agent log
                    // #endregion
                    return false;
                  }

                  const content = this.findMessageContentElement(retryElement);

                  if (!content) {
                    return false; // Content not found yet
                  }

                  if (useGradient) {
                    const computed = window.getComputedStyle(content);
                    const hasGradient = computed?.backgroundImage?.includes('gradient');
                    const hasWebkitClip =
                      computed?.webkitBackgroundClip === 'text' ||
                      computed?.backgroundClip === 'text';

                    // #region agent log
                    // #endregion

                    // If gradient is missing, reapply it
                    if (!hasGradient) {
                      this.applyCritStyleWithSettings(retryElement, entryToRestore.critSettings);
                      return false; // Still missing, keep observing
                    }
                    return true; // Gradient present
                  }

                  return true; // No gradient needed
                };

                // Initial check
                if (verifyGradient()) {
                  // Gradient already present, no need to observe
                } else {
                  // Set up MutationObserver to watch for style changes
                  const contentElement = this.findMessageContentElement(currentMessageElement);
                  if (contentElement) {
                    const gradientObserver = new MutationObserver((mutations) => {
                      const hasStyleMutation = mutations.some(
                        (m) =>
                          m.type === 'attributes' &&
                          (m.attributeName === 'style' || m.attributeName === 'class')
                      );

                      if (hasStyleMutation) {
                        if (verifyGradient()) {
                          gradientObserver.disconnect();
                        }
                      }
                    });

                    gradientObserver.observe(contentElement, {
                      attributes: true,
                      attributeFilter: ['style', 'class'],
                    });

                    // Also observe parent for element replacement
                    const parentContainer = currentMessageElement?.parentElement || document.body;
                    const parentObserver = new MutationObserver((mutations) => {
                      const hasChildMutation = mutations.some((m) => {
                        if (m.type === 'childList' && m.addedNodes.length > 0) {
                          return Array.from(m.addedNodes).some((node) => {
                            if (node.nodeType !== Node.ELEMENT_NODE) return false;
                            const id = this.getMessageIdentifier(node);
                            return id === normalizedMsgId || String(id).includes(normalizedMsgId);
                          });
                        }
                        return false;
                      });

                      if (hasChildMutation) {
                        if (verifyGradient()) {
                          parentObserver.disconnect();
                          gradientObserver.disconnect();
                        }
                      }
                    });

                    parentObserver.observe(parentContainer, {
                      childList: true,
                      subtree: true,
                    });

                    // Cleanup observers after 3 seconds
                    setTimeout(() => {
                      gradientObserver.disconnect();
                      parentObserver.disconnect();
                    }, 3000);
                  }
                }

                // Trigger animation with gradient verification
                // Use double RAF to ensure gradient is applied before animation
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    // Re-query element to ensure we have latest DOM reference
                    const restoredElement =
                      document.querySelector(`[data-message-id="${normalizedMsgId}"]`) ||
                      currentMessageElement;

                    if (!restoredElement || !restoredElement.isConnected) {
                      this.debugLog(
                        'CHECK_FOR_RESTORATION',
                        'Element disconnected before animation trigger'
                      );
                      return;
                    }

                    // Verify gradient is applied before triggering animation
                    const restoredContent = this.findMessageContentElement(restoredElement);
                    if (restoredContent) {
                      void restoredContent.offsetHeight; // Force reflow
                      const computedStyles = window.getComputedStyle(restoredContent);
                      const hasGradient = computedStyles?.backgroundImage?.includes('gradient');
                      const hasWebkitClip =
                        computedStyles?.webkitBackgroundClip === 'text' ||
                        computedStyles?.backgroundClip === 'text';

                      // #region agent log
                      // #endregion

                      if (!hasGradient || !hasWebkitClip) {
                        // Gradient not ready, use MutationObserver to watch for style changes
                        const contentElement = this.findMessageContentElement(restoredElement);
                        if (contentElement) {
                          const animationRetryObserver = new MutationObserver((mutations) => {
                            const hasStyleMutation = mutations.some(
                              (m) =>
                                m.type === 'attributes' &&
                                (m.attributeName === 'style' || m.attributeName === 'class')
                            );

                            if (hasStyleMutation) {
                              const retryElement =
                                document.querySelector(`[data-message-id="${normalizedMsgId}"]`) ||
                                restoredElement;
                              if (retryElement?.isConnected) {
                                const retryContent = this.findMessageContentElement(retryElement);
                                if (retryContent) {
                                  const retryComputed = window.getComputedStyle(retryContent);
                                  const retryHasGradient =
                                    retryComputed?.backgroundImage?.includes('gradient');
                                  const retryHasWebkitClip =
                                    retryComputed?.webkitBackgroundClip === 'text' ||
                                    retryComputed?.backgroundClip === 'text';

                                  if (retryHasGradient && retryHasWebkitClip) {
                                    // Only trigger animation if message is verified (has real Discord ID)
                                    const retryMessageId = this.getMessageId(retryElement);
                                    const isRetryVerified =
                                      retryMessageId && this.isValidDiscordId(retryMessageId);

                                    if (isRetryVerified) {
                                      try {
                                        this.onCritHit(retryElement);
                                      } catch (e) {
                                        this.debugError('CHECK_FOR_RESTORATION', e, {
                                          phase: 'trigger_animation_retry',
                                        });
                                      }
                                    }
                                    animationRetryObserver.disconnect();
                                  }
                                }
                              }
                            }
                          });

                          animationRetryObserver.observe(contentElement, {
                            attributes: true,
                            attributeFilter: ['style', 'class'],
                          });

                          // Cleanup after 1 second
                          setTimeout(() => {
                            animationRetryObserver.disconnect();
                          }, 1000);
                        }
                        return;
                      }
                    }

                    // Only trigger animation if message is verified (has real Discord ID)
                    // This ensures animations only trigger when messages are verified, not during queue
                    const restoredMessageId = this.getMessageId(restoredElement);
                    const isRestoredVerified =
                      restoredMessageId && this.isValidDiscordId(restoredMessageId);

                    if (isRestoredVerified) {
                      // #region agent log
                      // #endregion

                      try {
                        this.onCritHit(restoredElement);
                      } catch (e) {
                        this.debugError('CHECK_FOR_RESTORATION', e, { phase: 'trigger_animation' });
                      }
                    } else {
                      // #region agent log
                      // #endregion
                    }
                  });
                });

                // Set up monitoring after restoration to catch if Discord removes gradient later
                if (useGradient && normalizedMsgId) {
                  // Set up MutationObserver to watch for gradient removal
                  if (this.styleObservers.has(normalizedMsgId)) {
                    this.styleObservers.get(normalizedMsgId).disconnect();
                  }

                  const checkGradient = () => {
                    // Re-query element in case Discord replaced it
                    const monitoredElement =
                      document.querySelector(`[data-message-id="${normalizedMsgId}"]`) ||
                      Array.from(document.querySelectorAll('[class*="message"]')).find((el) => {
                        const id = this.getMessageIdentifier(el);
                        return id === normalizedMsgId || String(id).includes(normalizedMsgId);
                      });

                    if (
                      !monitoredElement ||
                      !monitoredElement.isConnected ||
                      !monitoredElement.classList.contains('bd-crit-hit')
                    ) {
                      return;
                    }

                    const currentContent = this.findMessageContentElement(monitoredElement);

                    if (currentContent && useGradient) {
                      const computed = window.getComputedStyle(currentContent);
                      const hasGradient = computed?.backgroundImage?.includes('gradient');

                      // #region agent log
                      // #endregion

                      if (!hasGradient) {
                        // Gradient disappeared! Reapply it
                        this.applyCritStyleWithSettings(
                          monitoredElement,
                          entryToRestore.critSettings
                        );
                      }
                    }
                  };

                  // Observe parent container instead of specific element to catch replacements
                  // If Discord replaces the entire message element, observing the parent will catch it
                  const parentContainer = currentMessageElement?.parentElement || document.body;

                  const styleObserver = new MutationObserver((mutations) => {
                    // Event-based check - only runs when mutations occur
                    // Check if style attribute changed or element was replaced
                    const hasStyleMutation = mutations.some(
                      (m) =>
                        m.type === 'attributes' &&
                        (m.attributeName === 'style' || m.attributeName === 'class')
                    );
                    const hasChildMutation = mutations.some((m) => m.type === 'childList');

                    if (hasStyleMutation || hasChildMutation) {
                      // Use requestAnimationFrame to batch checks and avoid excessive reflows
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

                  // Removed periodic setInterval - now using event-based checks only
                  // MutationObserver will trigger checkGradient when mutations occur

                  // Also observe content element directly for style attribute changes
                  const currentContentElement =
                    this.findMessageContentElement(currentMessageElement);

                  if (currentContentElement) {
                    styleObserver.observe(currentContentElement, {
                      attributes: true,
                      attributeFilter: ['style', 'class'],
                      subtree: false,
                    });
                  }

                  // Store observer for cleanup
                  this.styleObservers.set(normalizedMsgId, styleObserver);

                  // Clean up after 10 seconds
                  setTimeout(() => {
                    styleObserver.disconnect();
                    this.styleObservers.delete(normalizedMsgId);
                  }, 10000);
                }
              } else {
                // Even if gradient appears present, set up monitoring to catch if it disappears
                // Discord might remove it after our check, so we need persistent monitoring
                if (useGradient && normalizedMsgId) {
                  // Set up MutationObserver to watch for gradient removal
                  if (this.styleObservers.has(normalizedMsgId)) {
                    this.styleObservers.get(normalizedMsgId).disconnect();
                  }

                  const checkGradient = () => {
                    // Re-query element in case Discord replaced it
                    const currentMessageElement =
                      document.querySelector(`[data-message-id="${normalizedMsgId}"]`) ||
                      Array.from(document.querySelectorAll('[class*="message"]')).find((el) => {
                        const id = this.getMessageIdentifier(el);
                        return id === normalizedMsgId || String(id).includes(normalizedMsgId);
                      });

                    if (
                      !currentMessageElement ||
                      !currentMessageElement.isConnected ||
                      !currentMessageElement.classList.contains('bd-crit-hit')
                    ) {
                      return;
                    }

                    const currentContent =
                      currentMessageElement.querySelector('[class*="messageContent"]') ||
                      currentMessageElement.querySelector('[class*="markup"]') ||
                      currentMessageElement.querySelector('[class*="textContainer"]');

                    if (currentContent && useGradient) {
                      const computed = window.getComputedStyle(currentContent);
                      const hasGradient = computed?.backgroundImage?.includes('gradient');

                      // #region agent log
                      // #endregion

                      if (!hasGradient) {
                        // Gradient disappeared! Reapply it
                        this.applyCritStyleWithSettings(
                          currentMessageElement,
                          entryToRestore.critSettings
                        );
                      }
                    }
                  };

                  // Event-based MutationObserver - removed periodic setInterval
                  const styleObserver = new MutationObserver((mutations) => {
                    // Event-based check - only runs when mutations occur
                    const hasStyleMutation = mutations.some(
                      (m) =>
                        m.type === 'attributes' &&
                        (m.attributeName === 'style' || m.attributeName === 'class')
                    );
                    const hasChildMutation = mutations.some((m) => m.type === 'childList');

                    if (hasStyleMutation || hasChildMutation) {
                      // Use requestAnimationFrame to batch checks
                      requestAnimationFrame(() => {
                        requestAnimationFrame(checkGradient);
                      });
                    }
                  });

                  // Observe message element and parent for changes
                  const parentContainer = messageElement?.parentElement || document.body;

                  styleObserver.observe(parentContainer, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style', 'class'],
                  });

                  styleObserver.observe(messageElement, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style', 'class'],
                  });

                  // Store observer for cleanup
                  this.styleObservers.set(normalizedMsgId, styleObserver);

                  // Clean up after 10 seconds (message should be stable by then)
                  setTimeout(() => {
                    styleObserver.disconnect();
                    this.styleObservers.delete(normalizedMsgId);
                  }, 10000);
                }

                // #region agent log
                // #endregion
              }
            });
          });
        };

        if (historyEntry?.critSettings) {
          performRestoration(historyEntry);
        } else if (!historyEntry && isValidDiscordId) {
          // Use MutationObserver instead of polling setTimeout
          // Watch for when message gets crit class (indicating crit was detected) or when element is replaced
          const checkForCrit = () => {
            // Re-query element in case Discord replaced it
            const retryElement =
              document.querySelector(`[data-message-id="${normalizedMsgId}"]`) ||
              Array.from(document.querySelectorAll('[class*="message"]')).find((el) => {
                const id = this.getMessageIdentifier(el);
                return id === normalizedMsgId || String(id).includes(normalizedMsgId);
              });

            if (!retryElement || !retryElement.isConnected) {
              return false;
            }

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
              content && author && (pendingCrit = this.pendingCrits.get(this.getContentHash(author, content.textContent?.trim() || '')));
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

              // #region agent log
              // #endregion

              performRestoration(pendingEntry);
              return true;
            }

            // Check if element now has crit class (crit was detected)
            if (retryElement?.classList?.contains('bd-crit-hit')) {
              // Invalidate cache and check history
              this._cachedCritHistory = null;
              this._cachedCritHistoryTimestamp = null;
              const retryChannelCrits = this.getCritHistory(this.currentChannelId);

              const retryHistoryEntry = retryChannelCrits.find((entry) => {
                const entryId = String(entry.messageId).trim();
                if (entryId.startsWith('hash_')) return false;
                return entryId === normalizedMsgId || entryId === pureMessageId;
              });

              if (retryHistoryEntry?.critSettings) {
                // #region agent log
                // #endregion

                performRestoration(retryHistoryEntry);
                return true;
              }
            }

            return false;
          };

          // Initial check
          if (checkForCrit()) {
            return; // Already found, no need to observe
          }

          // Set up MutationObserver to watch for crit class addition or element replacement
          const parentContainer = messageElement?.parentElement || document.body;
          const restorationObserver = new MutationObserver((mutations) => {
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
              if (m.type === 'childList' && m.addedNodes.length > 0) {
                return Array.from(m.addedNodes).some((node) => {
                  if (node.nodeType !== Node.ELEMENT_NODE) return false;
                  const id = this.getMessageIdentifier(node);
                  return id === normalizedMsgId || String(id).includes(normalizedMsgId);
                });
              }
              return false;
            });

            if (hasRelevantMutation) {
              if (checkForCrit()) {
                restorationObserver.disconnect();
              }
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
        if (this.debug.verbose) {
          this.debugLog('CHECK_FOR_RESTORATION', 'No matching crit found in history', {
            channelId: this.currentChannelId,
          });
        }
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

  /**
   * Checks all existing messages in the DOM for crit restoration
   * Called on plugin start or channel change
   */
  checkExistingMessages() {
    // This method is no longer used - we only check NEW messages
    // to prevent applying crits to old messages
    // Keeping it for potential future use but not calling it
  }

  // ============================================================================
  // CRIT DETECTION & APPLICATION
  // ============================================================================

  /**
   * Main crit detection logic: determines if a message should be a crit
   * Uses deterministic randomness based on message/channel ID for consistency
   * Applies styling and adds to history if crit is detected
   * @param {HTMLElement} messageElement - The message DOM element
   */
  checkForCrit(messageElement) {
    try {
      // #region agent log
      // #endregion
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
      });
      // #region agent log
      // #endregion

      // Validate message ID is correct (not channel ID)
      if (messageId && (!/^\d{17,19}$/.test(messageId) || messageId.length < 17)) {
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
      const isValidDiscordId = /^\d{17,19}$/.test(messageId);
      const isHashId = messageId.startsWith('hash_');

      // #region agent log
      // #endregion

      // Handle queued messages (hash IDs) - detect crits but don't apply styling yet
      // When Discord finishes processing and assigns real ID, we'll check pending queue
      if (isHashId) {
        // Check if this queued message should be a crit (for pending queue)
        const content = this.findMessageContentElement(messageElement);
        const author = this.getAuthorId(messageElement);
        const channelId = this.getCurrentChannelId();

        if (content && author && channelId) {
          const contentText = content.textContent?.trim() || '';
          if (contentText) {
            // Use deterministic randomness based on content (same seed as real IDs will use)
            // This ensures queued messages and real IDs get the same crit determination
            // Use content-based seed: author + channel + content (same as what real ID will use)
            const contentHash = this.getContentHash(author, contentText);
            const seed = `${contentHash}:${channelId}`;
            const hash = this.simpleHash(seed);
            const critRoll = (hash % 10000) / 100; // Same range as real IDs (0-100)
            const critChance = this.getEffectiveCritChance();
            const wouldBeCrit = critRoll <= critChance;

            if (wouldBeCrit) {
              // This queued message would be a crit - add to pending queue
              // Use the contentHash we already calculated above
              const critSettings = {
                gradient: this.settings.critGradient !== false,
                color: this.settings.critColor,
                font: this.settings.critFont,
                glow: this.settings.critGlow,
                animation: this.settings.animationEnabled !== false,
              };

              // Add to pending queue with content hash for matching when real ID is assigned
              this.pendingCrits.set(contentHash, {
                critSettings: critSettings,
                timestamp: Date.now(),
                channelId: channelId,
                messageContent: contentText,
                author: author,
                contentHash: contentHash,
                isHashId: true, // Mark as originally queued
              });

              // #region agent log
              // #endregion
            }
          }
        }

        this.debugLog('CHECK_FOR_CRIT', 'Skipping hash ID (likely unsent/pending message)', {
          messageId,
          note: 'Hash IDs are created for messages without Discord IDs - crits are stored in pending queue and will be applied when real ID is assigned',
        });
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
            const contentHash = this.getContentHash(author, contentText);
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

                // #region agent log
                // #endregion

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

                  if (existingIndex >= 0) {
                    // Update existing entry
                    this.messageHistory[existingIndex] = historyData;
                  } else {
                    // Add new entry
                    this.messageHistory.push(historyData);
                  }

                  // Save immediately for queued messages (they're already confirmed crits)
                  this.saveMessageHistory();

                  // Trigger animation now that message is verified (has real Discord ID)
                  // This ensures animations only trigger when messages are verified, not during queue
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      const verifiedElement =
                        document.querySelector(`[data-message-id="${messageId}"]`) ||
                        messageElement;
                      if (verifiedElement?.isConnected) {
                        // #region agent log
                        // #endregion

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

                  // #region agent log
                  // #endregion

                  // Continue processing as non-crit (will reset combo below)
                  historyEntry = null;
                }
              }
            }
          }
        }
      }

      // If message is in history, use saved determination and skip reprocessing
      if (historyEntry) {
        // Message already processed - use saved determination
        const isCrit = historyEntry.isCrit || false;

        // #region agent log
        // #endregion

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
            if (historyEntry.critSettings) {
              this.applyCritStyleWithSettings(messageElement, historyEntry.critSettings);
            } else {
              this.applyCritStyle(messageElement);
            }
            this.critMessages.add(messageElement);

            // #region agent log
            // #endregion
          }

          // Only trigger animation if not already animated (prevent double animation)
          // Check by message ID first, then content hash with time check
          const content = this.findMessageContentElement(messageElement);
          const author = this.getAuthorId(messageElement);
          let contentHash = null;
          const contentText = content?.textContent?.trim();
          contentHash = (content && author && contentText) ? this.getContentHash(author, contentText) : null;

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

              // #region agent log
              // #endregion
            } else if (timeSinceAnimated < 2000) {
              // Non-verified message - use 2-second window
              alreadyAnimated = true;

              // #region agent log
              // #endregion
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
                    this.animatedMessages.delete(msgId);

                    // #region agent log
                    // #endregion
                    // Don't set alreadyAnimated - allow the animation
                    return true; // Found matching content hash, processed it
                  } else if (timeSinceAnimated < 2000) {
                    // Non-verified message - use 2-second window
                    // Same content animated recently - skip
                    alreadyAnimated = true;

                  // #region agent log
                  // #endregion
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
              // #region agent log
              // #endregion

              // Trigger animation for verified crits restored from history
              try {
                this.onCritHit(messageElement);
              } catch (error) {
                this.debugError('CHECK_FOR_CRIT', error, { phase: 'restore_animation' });
              }
            } else {
              // #region agent log
              // #endregion
            }
          }

          // Don't mark as processed again - already in history
          return;
        } else {
          // It's NOT a crit - ensure crit class is removed if present
          if (messageElement?.classList?.contains('bd-crit-hit')) {
            // #region agent log
            // #endregion
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

              // #region agent log
              // #endregion
            }
          }

          // Don't mark as processed again - already in history
          return;
        }
      }

      // Message not in history - check if already processed (to prevent duplicate processing)
      if (!this.markAsProcessed(messageId)) {
        // #region agent log
        // #endregion
        this.debugLog('CHECK_FOR_CRIT', 'Message already processed (by ID)', { messageId });
        return;
      }

      // Skip if channel is still loading
      if (this.isLoadingChannel) {
        this.debugLog('CHECK_FOR_CRIT', 'Channel still loading, skipping');
        return;
      }

      // Check if message should be filtered out
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

      // Calculate effective crit chance (base + agility bonus, capped at 30%)
      const effectiveCritChance = this.getEffectiveCritChance();

      // Use deterministic random based on content to ensure same message always gets same result
      // This prevents the same message from being crit on one check and non-crit on another
      // IMPORTANT: Use content-based seed to match queued message detection (hash IDs)
      let roll;
      if (messageId) {
        // Try content-based seed first (matches queued message detection)
        const content = this.findMessageContentElement(messageElement);
        const author = this.getAuthorId(messageElement);
        const contentText = content?.textContent?.trim();
        if (content && author && contentText) {
          // Use same seed as queued messages for consistency
          const contentHash = this.getContentHash(author, contentText);
          const seed = `${contentHash}:${this.currentChannelId}`;
          const hash = this.simpleHash(seed);
          roll = (hash % 10000) / 100; // Convert to 0-100 range
        } else {
          // Fallback to message ID if can't get content/author
          const hash = this.simpleHash(messageId + this.currentChannelId);
          roll = (hash % 10000) / 100;
        }
      } else {
        // Fallback to true random if no message ID (shouldn't happen)
        roll = Math.random() * 100;
      }

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
        // CRITICAL HIT!
        this.stats.totalCrits++;
        this.updateStats(); // Recalculate crit rate

        // Check if currently processing crit styling for this message (prevent duplicate during spam)
        if (messageId && this._processingCrits.has(messageId)) {
          // #region agent log
          // #endregion
          return; // Already processing, skip duplicate call
        }

        // Mark as processing crit styling
        if (messageId) {
          this._processingCrits.add(messageId);
        }

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
          // Apply crit style first
          this.debugLog('CHECK_FOR_CRIT', 'Step 1: Applying crit style to message', {
            messageId: messageId,
            hasMessageElement: !!messageElement,
          });
          // #region agent log
          // #endregion

          // Forcefully apply crit style
          this.applyCritStyle(messageElement);

          // Use MutationObserver instead of setTimeout polling to ensure gradient persists
          // Watch for style changes that might remove the gradient, especially after reprocessing
          const content = this.findMessageContentElement(messageElement);
          if (content && this.settings?.critGradient !== false) {
            const gradientColors =
              'linear-gradient(to right, #8b5cf6 0%, #7c3aed 15%, #6d28d9 30%, #4c1d95 45%, #312e81 60%, #1e1b4b 75%, #0f0f23 85%, #000000 95%, #000000 100%)';

            const ensureGradient = () => {
              // Re-query element in case Discord replaced it
              const currentElement =
                document.querySelector(`[data-message-id="${messageId}"]`) || messageElement;
              if (!currentElement?.isConnected) return false;

              const currentContent = this.findMessageContentElement(currentElement);
              if (!currentContent) return false;

              const computed = window.getComputedStyle(currentContent);
              const hasGradient = computed?.backgroundImage?.includes('gradient');

              if (!hasGradient && currentElement?.classList?.contains('bd-crit-hit')) {
                // Gradient was removed - reapply it
                currentContent.style.setProperty('background-image', gradientColors, 'important');
                currentContent.style.setProperty('background', gradientColors, 'important');
                currentContent.style.setProperty('-webkit-background-clip', 'text', 'important');
                currentContent.style.setProperty('background-clip', 'text', 'important');
                currentContent.style.setProperty(
                  '-webkit-text-fill-color',
                  'transparent',
                  'important'
                );
                currentContent.style.setProperty('color', 'transparent', 'important');
                currentContent.style.setProperty('display', 'inline-block', 'important');
                currentContent.classList.add('bd-crit-text-content');

                // #region agent log
                // #endregion

                return false; // Still missing, keep observing
              }
              return true; // Gradient present
            };

            // Initial check
            if (!ensureGradient()) {
              // Set up MutationObserver to watch for style changes
              const gradientPersistenceObserver = new MutationObserver((mutations) => {
                const hasStyleMutation = mutations.some(
                  (m) =>
                    m.type === 'attributes' &&
                    (m.attributeName === 'style' || m.attributeName === 'class')
                );
                const hasChildMutation = mutations.some((m) => m.type === 'childList');

                if (hasStyleMutation || hasChildMutation) {
                  if (ensureGradient()) {
                    gradientPersistenceObserver.disconnect();
                  }
                }
              });

              gradientPersistenceObserver.observe(content, {
                attributes: true,
                attributeFilter: ['style', 'class'],
              });

              // Also observe message element and parent for element replacement
              const parentContainer = messageElement?.parentElement || document.body;
              gradientPersistenceObserver.observe(parentContainer, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class'],
              });

              gradientPersistenceObserver.observe(messageElement, {
                attributes: true,
                attributeFilter: ['class'],
              });

              // Cleanup after 5 seconds (longer for queued messages that need time to process)
              setTimeout(() => {
                gradientPersistenceObserver.disconnect();
              }, 5000);
            }
          }

          // #region agent log
          // #endregion

          this.critMessages.add(messageElement);

          // Only trigger animation when message is verified (has real Discord ID)
          // This ensures animations only trigger once when confirmed, not during queue phase
          // This makes combo resets more accurate because we know for sure if it's a crit or not
          if (isValidDiscordId && messageId) {
            // Verify gradient before triggering animation
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const currentElement =
                  document.querySelector(`[data-message-id="${messageId}"]`) || messageElement;

                if (!currentElement || !currentElement.isConnected) return;

                const contentElement = this.findMessageContentElement(currentElement);
                if (contentElement) {
                  void contentElement.offsetHeight; // Force reflow
                  const computedStyles = window.getComputedStyle(contentElement);
                  const hasGradient = computedStyles?.backgroundImage?.includes('gradient');
                  const hasWebkitClip =
                    computedStyles?.webkitBackgroundClip === 'text' ||
                    computedStyles?.backgroundClip === 'text';

                  // #region agent log
                  // #endregion

                  if (hasGradient && hasWebkitClip) {
                    // Gradient is ready - trigger animation for verified crit
                    this.onCritHit(currentElement);
                  } else {
                    // Gradient not ready yet - retry once after brief delay
                    setTimeout(() => {
                      const retryElement =
                        document.querySelector(`[data-message-id="${messageId}"]`) ||
                        currentElement;
                      if (retryElement?.isConnected) {
                        const retryContent = this.findMessageContentElement(retryElement);
                        if (retryContent) {
                          const retryComputed = window.getComputedStyle(retryContent);
                          const retryHasGradient =
                            retryComputed?.backgroundImage?.includes('gradient');
                          const retryHasWebkitClip =
                            retryComputed?.webkitBackgroundClip === 'text' ||
                            retryComputed?.backgroundClip === 'text';
                          if (retryHasGradient && retryHasWebkitClip) {
                            this.onCritHit(retryElement);
                          }
                        }
                      }
                    }, 100);
                  }
                }
              });
            });
          } else {
            // #region agent log
            // #endregion
          }
          // Already marked as processed by markAsProcessed above
          this.debugLog('CHECK_FOR_CRIT', 'Step 1 Complete: Crit style applied', {
            messageId: messageId,
            elementHasClass: messageElement.classList.contains('bd-crit-hit'),
            critMessagesSize: this.critMessages.size,
          });

          // Remove processing lock after successful styling
          if (messageId) {
            this._processingCrits.delete(messageId);
          }

          // Store in history with full info and save immediately
          if (messageId && this.currentChannelId) {
            try {
              this.debugLog('CHECK_FOR_CRIT', 'Step 2: Saving crit to history', {
                messageId: messageId,
                authorId: authorId,
                channelId: this.currentChannelId,
                hasMessageContent: messageContent.length > 0,
                hasAuthor: author.length > 0,
              });

              this.addToHistory({
                messageId: messageId,
                authorId: authorId, // Store author ID for filtering
                channelId: this.currentChannelId,
                timestamp: Date.now(),
                isCrit: true,
                messageContent: messageContent.substring(0, 200), // Store first 200 chars
                author: author, // Author username for display
              });

              // NOTE: No need to save here - addToHistory() already saves immediately for crits (line 871)
              // Removing duplicate save to prevent double-saving the same message
              this.debugLog(
                'CHECK_FOR_CRIT',
                'Step 3: History saved by addToHistory (no duplicate save needed)',
                {
                  messageId: messageId,
                  channelId: this.currentChannelId,
                }
              );

              // Verify it was saved
              const verifyLoad = BdApi.Data.load('CriticalHit', 'messageHistory');
              const verifyEntry = verifyLoad?.find(
                (e) =>
                  e.messageId === messageId && e.channelId === this.currentChannelId && e.isCrit
              );

              this.debugLog(
                'CHECK_FOR_CRIT',
                verifyEntry
                  ? 'SUCCESS: Crit saved and verified in storage'
                  : 'WARNING: Crit save verification failed',
                {
                  messageId: messageId,
                  channelId: this.currentChannelId,
                  verifyLoadSuccess: Array.isArray(verifyLoad),
                  verifyEntryFound: !!verifyEntry,
                  verifyEntryIsCrit: verifyEntry?.isCrit,
                  verifyEntryHasSettings: !!verifyEntry?.critSettings,
                }
              );
            } catch (error) {
              this.debugError('CHECK_FOR_CRIT', error, {
                phase: 'save_crit_history',
                messageId: messageId,
                channelId: this.currentChannelId,
              });
            }
          } else {
            this.debugLog(
              'CHECK_FOR_CRIT',
              'WARNING: Cannot save crit - missing messageId or channelId',
              {
                hasMessageId: !!messageId,
                hasChannelId: !!this.currentChannelId,
                messageId: messageId,
                channelId: this.currentChannelId,
              }
            );
          }

          // Animation is already triggered above when message is verified (has real Discord ID)
          // No need to trigger again here - this prevents double animations
          // Animations only trigger when messages are verified, making combo resets more accurate
        } catch (error) {
          this.debugError('CHECK_FOR_CRIT', error, {
            phase: 'apply_crit',
            messageId: messageId,
            channelId: this.currentChannelId,
          });
          // Remove processing lock on error
          if (messageId) {
            this._processingCrits.delete(messageId);
          }
        }
      } else {
        // NOT A CRIT - Already marked as processed by markAsProcessed() at start
        this.debugLog('CHECK_FOR_CRIT', 'Non-crit message detected', {
          messageId,
          roll: roll.toFixed(2),
          effectiveCritChance,
          authorId,
        });

        // Store in history (non-crit) for tracking - CRITICAL to prevent false positives
        if (messageId && this.currentChannelId) {
          try {
            // #region agent log
            // #endregion
            this.addToHistory({
              messageId: messageId,
              authorId: authorId, // Store author ID for filtering
              channelId: this.currentChannelId,
              timestamp: Date.now(),
              isCrit: false, // EXPLICITLY mark as non-crit
              messageContent: messageContent.substring(0, 200),
              author: author, // Author username for display
            });

            // Removed duplicate saveMessageHistory call
            // addToHistory() already handles periodic saves (every 20 messages)
            // No need to save immediately for non-crit messages

            this.debugLog('CHECK_FOR_CRIT', 'SUCCESS: Non-crit saved to history', {
              messageId,
              channelId: this.currentChannelId,
            });
          } catch (error) {
            this.debugError('CHECK_FOR_CRIT', error, { phase: 'save_non_crit_history' });
          }
        } else {
          this.debugLog(
            'CHECK_FOR_CRIT',
            'WARNING: Cannot save non-crit - missing messageId or channelId',
            {
              hasMessageId: !!messageId,
              hasChannelId: !!this.currentChannelId,
            }
          );
        }
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
  applyCritStyle(messageElement) {
    try {
      this.debugLog('APPLY_CRIT_STYLE', 'Applying crit style to message');

      // Find ONLY the message text content container - exclude username, timestamp, etc.
      // Apply gradient to the entire message text container as one unit

      this.debugLog('APPLY_CRIT_STYLE', 'Finding message content element', {
        messageElementClasses: Array.from(messageElement.classList || []),
      });

      // Helper function to check if element is in header/username/timestamp area
      // Cache class list to avoid repeated Array.from() calls
      const isInHeaderArea = (element) => {
        if (!element) return true;

        // Check element's own classes first (fastest check)
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
          if (this.debug?.enabled) {
            this.debugLog('APPLY_CRIT_STYLE', 'Element has header class', {
              elementTag: element.tagName,
              classes: classes,
            });
          }
          return true;
        }

        // Check if element contains username/timestamp elements as children
        const hasUsernameChild = element.querySelector('[class*="username"]') !== null;
        const hasTimestampChild = element.querySelector('[class*="timestamp"]') !== null;
        const hasAuthorChild = element.querySelector('[class*="author"]') !== null;

        if (hasUsernameChild || hasTimestampChild || hasAuthorChild) {
          if (this.debug?.enabled) {
            this.debugLog('APPLY_CRIT_STYLE', 'Element contains username/timestamp/author child', {
              elementTag: element.tagName,
              hasUsernameChild,
              hasTimestampChild,
              hasAuthorChild,
              classes: classes,
            });
          }
          return true;
        }

        // Check parent chain (only if own classes didn't match)
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
          if (this.debug?.enabled) {
            this.debugLog('APPLY_CRIT_STYLE', 'Element is in header area', {
              elementTag: element.tagName,
              headerParentClasses: Array.from(headerParent.classList || []),
              headerParentTag: headerParent.tagName,
            });
          }
          return true;
        }

        // Check if element's text content looks like a username or timestamp
        const text = element.textContent?.trim() || '';
        if (text.match(/^\d{1,2}:\d{2}$/) || text.length < 3) {
          // Looks like a timestamp or very short text (likely username)
          if (this.debug?.enabled) {
            this.debugLog('APPLY_CRIT_STYLE', 'Element text looks like timestamp/username', {
              elementTag: element.tagName,
              text: text,
            });
          }
          return true;
        }

        return false;
      };

      // Find message content - simplified selection with fewer fallbacks
      // Priority: messageContent > markup > textContainer (skip div fallback for performance)
      let content = null;

      // FUNCTIONAL: Find message content (.find() instead of for-loop)
      const allMessageContents = Array.from(
        messageElement.querySelectorAll('[class*="messageContent"]')
      );
      content = allMessageContents.find((msgContent) => !isInHeaderArea(msgContent));

      content &&
        this.debugLog('APPLY_CRIT_STYLE', 'Found messageContent (not in header)', {
          elementTag: content.tagName,
          classes: Array.from(content.classList || []),
          textPreview: content.textContent?.substring(0, 50),
        });

      // Fallback to markup if messageContent not found
      if (!content) {
        const markup = messageElement.querySelector('[class*="markup"]');
        if (markup && !isInHeaderArea(markup)) {
          content = markup;
          this.debugLog('APPLY_CRIT_STYLE', 'Found markup', {
            elementTag: content.tagName,
            classes: Array.from(content.classList || []),
          });
        }
      }

      // Last fallback: textContainer (skip div scanning for performance)
      if (!content) {
        const textContainer = messageElement.querySelector('[class*="textContainer"]');
        if (textContainer && !isInHeaderArea(textContainer)) {
          content = textContainer;
          this.debugLog('APPLY_CRIT_STYLE', 'Found textContainer', {
            elementTag: content.tagName,
            classes: Array.from(content.classList || []),
          });
        }
      }

      if (!content) {
        this.debugLog('APPLY_CRIT_STYLE', 'Could not find content element - skipping');
        return;
      }

      // Final check: make sure content doesn't have username/timestamp as siblings
      if (content) {
        const parent = content.parentElement;
        if (parent) {
          // Check if parent contains username/timestamp elements (as siblings OR anywhere in parent tree)
          const hasUsernameInParent =
            parent.querySelector('[class*="username"]') !== null ||
            parent.querySelector('[class*="timestamp"]') !== null ||
            parent.querySelector('[class*="author"]') !== null;

          // Also check direct siblings
          const siblings = Array.from(parent.children);
          const hasUsernameSibling = siblings.some((sib) => {
            const classes = Array.from(sib.classList || []);
            return classes.some(
              (c) => c.includes('username') || c.includes('timestamp') || c.includes('author')
            );
          });

          if (hasUsernameInParent || hasUsernameSibling) {
            this.debugLog(
              'APPLY_CRIT_STYLE',
              'Content parent contains username/timestamp - finding more specific text elements',
              {
                parentTag: parent.tagName,
                parentClasses: Array.from(parent.classList || []),
                siblingCount: siblings.length,
                hasUsernameInParent,
                hasUsernameSibling,
              }
            );
            this.debugLog(
              'APPLY_CRIT_STYLE',
              'Content has username/timestamp sibling - finding more specific text elements',
              {
                parentTag: parent.tagName,
                parentClasses: Array.from(parent.classList || []),
                siblingCount: siblings.length,
              }
            );

            // CRITICAL: If content has username/timestamp siblings, we MUST find text elements within it
            // Don't style the container - style ONLY the actual text spans inside
            const allTextElements = content.querySelectorAll('span, div, p');
            let foundTextElement = null;

            this.debugLog('APPLY_CRIT_STYLE', 'Searching for text elements within messageContent', {
              totalElements: allTextElements.length,
            });

            foundTextElement = Array.from(allTextElements).reduce((best, textEl) => {
              // Skip if it's empty or just whitespace
              if (!textEl.textContent || textEl.textContent.trim().length === 0) return best;

              // Skip if it's in header area
              if (isInHeaderArea(textEl)) {
                this.debugLog('APPLY_CRIT_STYLE', 'Text element rejected (in header)', {
                  elementTag: textEl.tagName,
                  textPreview: textEl.textContent?.substring(0, 30),
                });
                return best;
              }

              // Skip if it contains username/timestamp
              if (
                textEl.querySelector('[class*="username"]') ||
                textEl.querySelector('[class*="timestamp"]')
              ) {
                this.debugLog(
                  'APPLY_CRIT_STYLE',
                  'Text element rejected (contains username/timestamp)',
                  {
                    elementTag: textEl.tagName,
                  }
                );
                return best;
              }

              // Skip if it's a timestamp pattern
              if (textEl.textContent.trim().match(/^\d{1,2}:\d{2}$/)) {
                return best;
              }

              // Found a good text element - prefer spans over divs, and deeper elements
              if (
                !best ||
                (textEl.tagName === 'SPAN' && best.tagName !== 'SPAN') ||
                (textEl.children.length === 0 && best.children.length > 0)
              ) {
                this.debugLog(
                  'APPLY_CRIT_STYLE',
                  'Found specific text element within messageContent',
                  {
                    elementTag: textEl.tagName,
                    classes: Array.from(textEl.classList || []),
                    textPreview: textEl.textContent?.substring(0, 50),
                    hasChildren: textEl.children.length > 0,
                  }
                );
                return textEl;
              }
              return best;
            }, foundTextElement);

            if (foundTextElement) {
              content = foundTextElement;
              this.debugLog(
                'APPLY_CRIT_STYLE',
                'Using specific text element instead of container',
                {
                  elementTag: content.tagName,
                  classes: Array.from(content.classList || []),
                  finalTextPreview: content.textContent?.substring(0, 50),
                }
              );
            } else {
              // Last resort: try to find markup class specifically
              const markupElement = content.querySelector('[class*="markup"]');
              if (markupElement && !isInHeaderArea(markupElement)) {
                content = markupElement;
                this.debugLog('APPLY_CRIT_STYLE', 'Using markup element as fallback', {
                  elementTag: content.tagName,
                  classes: Array.from(content.classList || []),
                });
              } else {
                this.debugLog(
                  'APPLY_CRIT_STYLE',
                  'WARNING: Could not find specific text element!',
                  {
                    originalContentTag: content.tagName,
                    originalContentClasses: Array.from(content.classList || []),
                    originalTextPreview: content.textContent?.substring(0, 50),
                  }
                );
              }
            }
          }
        }
      }

      this.debugLog('APPLY_CRIT_STYLE', 'Final content element selected', {
        tagName: content.tagName,
        classes: Array.from(content.classList || []),
        textPreview: content.textContent?.substring(0, 50),
        parentTag: content.parentElement?.tagName,
        parentClasses: Array.from(content.parentElement?.classList || []),
        hasUsernameSibling: content.parentElement?.querySelector('[class*="username"]') !== null,
        hasTimestampSibling: content.parentElement?.querySelector('[class*="timestamp"]') !== null,
      });

      // Apply critical hit styling to the entire message content container
      try {
        this.debugLog('APPLY_CRIT_STYLE', 'Applying crit style', {
          useGradient: this.settings.critGradient !== false,
          critColor: this.settings.critColor,
        });

        // Apply styles to the entire content container (sentence-level, not letter-level)
        {
          // Apply gradient or solid color
          if (this.settings.critGradient !== false) {
            // Purple to black gradient - flows left to right across sentence, darker at end
            const gradientColors =
              'linear-gradient(to right, #8b5cf6 0%, #7c3aed 15%, #6d28d9 30%, #4c1d95 45%, #312e81 60%, #1e1b4b 75%, #0f0f23 85%, #000000 95%, #000000 100%)';

            // Add a specific class to this element so CSS only targets it (not username/timestamp)
            content.classList.add('bd-crit-text-content');

            // Apply gradient to text using background-clip
            // Use setProperty with !important to ensure it applies and overrides theme
            content.style.setProperty('background-image', gradientColors, 'important');
            content.style.setProperty('background', gradientColors, 'important');
            content.style.setProperty('-webkit-background-clip', 'text', 'important');
            content.style.setProperty('background-clip', 'text', 'important');
            content.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
            content.style.setProperty('color', 'transparent', 'important');
            content.style.setProperty('display', 'inline-block', 'important');

            // Force reflow to ensure styles are applied before verification
            void content.offsetHeight;

            // Verify and reapply if Discord removed inline styles
            // Also ensure CSS class-based styling is active as fallback
            const verifyComputed = window.getComputedStyle(content);
            const verifyHasGradient = verifyComputed?.backgroundImage?.includes('gradient');
            const verifyHasClip =
              verifyComputed?.webkitBackgroundClip === 'text' ||
              verifyComputed?.backgroundClip === 'text';

            if (!verifyHasGradient || !verifyHasClip) {
              // Styles were removed, reapply more aggressively using individual setProperty calls
              // Using setProperty is safer than cssText concatenation which can create invalid CSS
              content.style.setProperty('background-image', gradientColors, 'important');
              content.style.setProperty('background', gradientColors, 'important');
              content.style.setProperty('-webkit-background-clip', 'text', 'important');
              content.style.setProperty('background-clip', 'text', 'important');
              content.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
              content.style.setProperty('color', 'transparent', 'important');
              content.style.setProperty('display', 'inline-block', 'important');
              void content.offsetHeight; // Force another reflow

              // #region agent log
              // #endregion
            }

            // Explicitly exclude username/timestamp elements from gradient
            // Find and reset any username/timestamp elements that might have been affected
            const usernameElements = messageElement.querySelectorAll(
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

            this.debugLog(
              'APPLY_CRIT_STYLE',
              'Excluded username/timestamp elements from gradient',
              {
                excludedCount: usernameElements.length,
              }
            );

            this.debugLog('APPLY_CRIT_STYLE', 'Gradient applied', {
              gradient: gradientColors,
              element: content.tagName,
            });
          } else {
            // Solid color fallback
            // Add a specific class to this element so CSS only targets it (not username/timestamp)
            content.classList.add('bd-crit-text-content');

            content.style.setProperty('color', this.settings.critColor, 'important');
            content.style.setProperty('background', 'none', 'important');
            content.style.setProperty('-webkit-background-clip', 'unset', 'important');
            content.style.setProperty('background-clip', 'unset', 'important');
            content.style.setProperty('-webkit-text-fill-color', 'unset', 'important');

            // Explicitly exclude username/timestamp elements from color
            const usernameElements = messageElement.querySelectorAll(
              '[class*="username"], [class*="timestamp"], [class*="author"]'
            );
            usernameElements.forEach((el) => {
              el.style.setProperty('color', 'unset', 'important');
            });

            this.debugLog('APPLY_CRIT_STYLE', 'Solid color applied', {
              color: this.settings.critColor,
              excludedCount: usernameElements.length,
            });
          }

          // Apply font styles with !important to override ALL CSS including Discord's
          content.style.setProperty('font-family', "'Nova Flat', sans-serif", 'important'); // Force Nova Flat
          content.style.setProperty('font-weight', 'bold', 'important'); // Bold for more impact
          content.style.setProperty('font-size', '1.6em', 'important'); // Larger for more impact
          content.style.setProperty('letter-spacing', '1px', 'important'); // Slight spacing
          content.style.setProperty('-webkit-text-stroke', 'none', 'important'); // Remove stroke for cleaner gradient
          content.style.setProperty('text-stroke', 'none', 'important');
          content.style.setProperty('font-synthesis', 'none', 'important'); // Prevent font synthesis
          content.style.setProperty('font-variant', 'normal', 'important'); // Override any font variants
          content.style.setProperty('font-style', 'normal', 'important'); // Override italic/oblique

          // Apply glow effect - Purple glow for purple-black gradient
          if (this.settings.critGlow) {
            if (this.settings.critGradient !== false) {
              // Purple glow that enhances the purple-black gradient
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

          // Add animation if enabled
          this.settings?.critAnimation && (content.style.animation = 'critPulse 0.5s ease-in-out');
        }

        // Add a class for easier identification
        messageElement.classList.add('bd-crit-hit');

        // Verify gradient was actually applied and get computed styles
        const useGradient = this.settings.critGradient !== false;
        const computedStyles = content ? window.getComputedStyle(content) : null;
        const hasGradientInStyle = content?.style?.backgroundImage?.includes('gradient');
        const hasGradientInComputed = computedStyles?.backgroundImage?.includes('gradient');
        const hasWebkitClip =
          computedStyles?.webkitBackgroundClip === 'text' ||
          computedStyles?.backgroundClip === 'text';

        // #region agent log
        // #endregion

        // If gradient didn't apply correctly, retry with MutationObserver to catch DOM changes
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
                content.style.setProperty('background-image', gradientColors, 'important');
                content.style.setProperty('background', gradientColors, 'important');
                content.style.setProperty('-webkit-background-clip', 'text', 'important');
                content.style.setProperty('background-clip', 'text', 'important');
                content.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                content.style.setProperty('color', 'transparent', 'important');

                // #region agent log
                // #endregion
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
    // This replaces the periodic setInterval check
    if (!this.novaFlatObserver) {
      this.novaFlatObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          // Handle new nodes added
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Check if the added node is a crit message
                if (node.classList?.contains('bd-crit-hit')) {
                  applyNovaFlatFont(node);
                }
                // Check for crit messages within the added node
                const critMessages = node.querySelectorAll?.('.bd-crit-hit');
                critMessages?.forEach((msg) => applyNovaFlatFont(msg));
              }
            });
          }
          // Handle attribute changes (font-family changes)
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const target = mutation.target;
            // Check if this is a crit message or within one
            const critMessage = target.closest?.('.bd-crit-hit');
            if (critMessage) {
              // Check if font-family was changed away from Nova Flat
              const computedStyle = window.getComputedStyle(target);
              const fontFamily = computedStyle.fontFamily;
              if (!fontFamily?.includes('Nova Flat')) {
                applyNovaFlatFont(critMessage);
              }
            }
          }
        });
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
        this.animatedMessages.delete(messageId);

        // #region agent log
        // #endregion
        // Continue processing - don't return
      } else {
        // Non-verified message - use deduplication
        // #region agent log
        // #endregion
        return;
      }
    }

    // Throttle: Prevent rapid duplicate calls during spam
    // BUT: For verified messages, skip throttling entirely (they're confirmed crits)
    // For non-verified messages, use throttle to prevent spam
    const now = Date.now();
    if (!isValidDiscordId) {
      const lastCallTime = this._onCritHitThrottle.get(messageId);

      if (lastCallTime && now - lastCallTime < this._onCritHitThrottleMs) {
        // #region agent log
        // #endregion
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
      // #region agent log
      // #endregion
      return;
    }

    // Mark as processing animation
    this._processingAnimations.add(messageId);

    // Use MutationObserver instead of polling setTimeout
    // Verify gradient is applied before triggering animation
    const verifyGradientAndTrigger = () => {
      // Re-get messageId in case element was replaced
      const currentMessageId = this.getMessageIdentifier(messageElement) || messageId;
      if (!messageId) {
        this.debugLog('ON_CRIT_HIT', 'Cannot verify gradient without message ID');
        return false;
      }

      // Re-query element in case it was replaced
      const currentElement =
        document.querySelector(`[data-message-id="${messageId}"]`) || messageElement;

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

      const computedStyles = window.getComputedStyle(contentElement);
      const hasGradient = computedStyles?.backgroundImage?.includes('gradient');
      const hasWebkitClip =
        computedStyles?.webkitBackgroundClip === 'text' ||
        computedStyles?.backgroundClip === 'text';

      // #region agent log
      // #endregion

      return hasGradient && hasWebkitClip; // Ready if both are present
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
          if (m.type === 'attributes' && m.attributeName === 'style') {
            return true;
          }
          // Check for child additions (element replaced)
          if (m.type === 'childList' && m.addedNodes.length > 0) {
            return Array.from(m.addedNodes).some((node) => {
              if (node.nodeType !== Node.ELEMENT_NODE) return false;
              const id = this.getMessageIdentifier(node);
              return id === messageId || String(id).includes(messageId);
            });
          }
          return false;
        });

        if (hasRelevantMutation) {
          if (verifyGradientAndTrigger()) {
            gradientVerificationObserver.disconnect();
            // Gradient verified, proceed to trigger animation
            proceedWithAnimation();
          }
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
      if (contentElement) {
        gradientVerificationObserver.observe(contentElement, {
          attributes: true,
          attributeFilter: ['style', 'class'],
        });
      }

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
          const finalElement =
            document.querySelector(`[data-message-id="${messageId}"]`) || messageElement;

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
              // #region agent log
              // #endregion
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

            // #region agent log
            // #endregion
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
      }

      this.debugLog('CREATE_PARTICLE_BURST', 'All particles created', {
        particlesCreated,
        expectedCount: particleCount,
      });

      // Remove container after animation
      setTimeout(() => {
        try {
          if (particleContainer.parentNode) {
            particleContainer.parentNode.removeChild(particleContainer);
          }
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
    if (style) {
      style.remove();
    }

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
                                agilityBonus = (BdApi.Data.load('SoloLevelingStats', 'agilityBonus')?.bonus ?? 0) * 100;
                                luckBonus = (BdApi.Data.load('SoloLevelingStats', 'luckBonus')?.bonus ?? 0) * 100;
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

    // Helper to update crit display with agility and luck bonuses
    const updateCritDisplay = () => {
      const effectiveCrit = plugin.getEffectiveCritChance();
      const totalBonus = effectiveCrit - parseFloat(plugin.settings.critChance);

      // Get individual bonuses
      let agilityBonus = 0;
      let luckBonus = 0;
      try {
        agilityBonus = (BdApi.Data.load('SoloLevelingStats', 'agilityBonus')?.bonus ?? 0) * 100;
        luckBonus = (BdApi.Data.load('SoloLevelingStats', 'luckBonus')?.bonus ?? 0) * 100;
      } catch (e) {}

      const bonusSpan = container.querySelector('.crit-agility-bonus');
      if (bonusSpan) {
        if (totalBonus > 0) {
          const bonuses = [];
          if (agilityBonus > 0) bonuses.push(`+${agilityBonus.toFixed(1)}% AGI`);
          if (luckBonus > 0) bonuses.push(`+${luckBonus.toFixed(1)}% LUK`);
          bonusSpan.textContent = `${bonuses.join(' + ')} = ${effectiveCrit.toFixed(1)}%`;
          bonusSpan.style.color = '#8b5cf6';
        } else {
          bonusSpan.textContent = `(Effective: ${effectiveCrit.toFixed(1)}%, max 30%)`;
          bonusSpan.style.color = '#666';
        }
      }
    };

    // Optimized display updates - only update when settings panel is visible
    // Since this reads from external data storage (BdApi.Data.load), we can't use MutationObserver
    // Instead, we optimize by only updating when the panel is visible
    // Clear any existing interval first
    if (plugin._displayUpdateInterval) {
      clearInterval(plugin._displayUpdateInterval);
      plugin._displayUpdateInterval = null;
    }

    // Use IntersectionObserver to detect when settings panel becomes visible
    if (window.IntersectionObserver && container) {
      const displayObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // Panel is visible, update display immediately
              updateCritDisplay();
              // Start periodic updates while visible
              if (plugin._displayUpdateInterval) {
                clearInterval(plugin._displayUpdateInterval);
              }
              plugin._displayUpdateInterval = setInterval(() => {
                // Early return if plugin is disabled
                if (!plugin.settings.enabled) {
                  if (plugin._displayUpdateInterval) {
                    clearInterval(plugin._displayUpdateInterval);
                    plugin._displayUpdateInterval = null;
                  }
                  return;
                }
                updateCritDisplay();
              }, 2000);
            } else {
              // Panel is hidden, stop periodic updates
              if (plugin._displayUpdateInterval) {
                clearInterval(plugin._displayUpdateInterval);
                plugin._displayUpdateInterval = null;
              }
            }
          });
        },
        { threshold: 0.1 }
      );

      displayObserver.observe(container);
    } else {
      // Fallback: Update periodically (reduced frequency from 2s to 5s)
      plugin._displayUpdateInterval = setInterval(() => {
        // Early return if plugin is disabled
        if (!plugin.settings.enabled) {
          if (plugin._displayUpdateInterval) {
            clearInterval(plugin._displayUpdateInterval);
            plugin._displayUpdateInterval = null;
          }
          return;
        }
        updateCritDisplay();
      }, 5000);
    }

    // Update immediately on load
    updateCritDisplay();

    container.querySelector('#crit-color').addEventListener('change', (e) => {
      plugin.updateCritColor(e.target.value);
      // Update color preview
      container.querySelector('.crit-color-preview').style.backgroundColor = e.target.value;
    });

    container.querySelector('#crit-font').addEventListener('change', (e) => {
      plugin.updateCritFont(e.target.value);
    });

    container.querySelector('#crit-animation').addEventListener('change', (e) => {
      plugin.updateCritAnimation(e.target.checked);
    });

    container.querySelector('#crit-gradient').addEventListener('change', (e) => {
      plugin.updateCritGradient(e.target.checked);
    });

    container.querySelector('#crit-glow').addEventListener('change', (e) => {
      plugin.updateCritGlow(e.target.checked);
    });

    container.querySelector('#test-crit-btn').addEventListener('click', () => {
      plugin.testCrit();
    });

    // Filter checkboxes
    container.querySelector('#filter-replies').addEventListener('change', (e) => {
      plugin.settings.filterReplies = e.target.checked;
      plugin.saveSettings();
    });

    container.querySelector('#filter-system').addEventListener('change', (e) => {
      plugin.settings.filterSystemMessages = e.target.checked;
      plugin.saveSettings();
    });

    container.querySelector('#filter-bots').addEventListener('change', (e) => {
      plugin.settings.filterBotMessages = e.target.checked;
      plugin.saveSettings();
    });

    container.querySelector('#filter-empty').addEventListener('change', (e) => {
      plugin.settings.filterEmptyMessages = e.target.checked;
      plugin.saveSettings();
    });

    // History retention settings
    const retentionInput = container.querySelector('#history-retention');
    const retentionSlider = container.querySelector('#history-retention-slider');
    const retentionLabel = retentionSlider
      .closest('.crit-form-item')
      .querySelector('.crit-label-value');

    retentionSlider.addEventListener('input', (e) => {
      retentionInput.value = e.target.value;
      plugin.settings.historyRetentionDays = parseInt(e.target.value);
      plugin.saveSettings();
      if (retentionLabel) retentionLabel.textContent = `${e.target.value}`;
    });

    retentionInput.addEventListener('change', (e) => {
      retentionSlider.value = e.target.value;
      plugin.settings.historyRetentionDays = parseInt(e.target.value);
      plugin.saveSettings();
      if (retentionLabel) retentionLabel.textContent = `${e.target.value}`;
    });

    // Auto-cleanup history
    container.querySelector('#auto-cleanup-history').addEventListener('change', (e) => {
      plugin.settings.autoCleanupHistory = e.target.checked;
      plugin.saveSettings();
      if (e.target.checked) {
        plugin.cleanupOldHistory(plugin.settings.historyRetentionDays || 30);
      }
    });

    // Debug mode toggle
    container.querySelector('#debug-mode').addEventListener('change', (e) => {
      plugin.settings.debugMode = e.target.checked;
      plugin.debug.enabled = e.target.checked;
      plugin.saveSettings();
      // Always log debug mode changes (useful for troubleshooting)
      console.log(`CriticalHit: Debug mode ${e.target.checked ? 'enabled' : 'disabled'}`);
    });

    // Animation settings
    const animationDurationInput = container.querySelector('#animation-duration');
    const animationDurationSlider = container.querySelector('#animation-duration-slider');

    animationDurationSlider.addEventListener('input', (e) => {
      animationDurationInput.value = e.target.value;
      plugin.settings.animationDuration = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[8];
      if (label) label.textContent = `${(parseInt(e.target.value) / 1000).toFixed(1)}s`;
    });

    animationDurationInput.addEventListener('change', (e) => {
      animationDurationSlider.value = e.target.value;
      plugin.settings.animationDuration = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[8];
      if (label) label.textContent = `${(parseInt(e.target.value) / 1000).toFixed(1)}s`;
    });

    const floatDistanceInput = container.querySelector('#float-distance');
    const floatDistanceSlider = container.querySelector('#float-distance-slider');

    floatDistanceSlider.addEventListener('input', (e) => {
      floatDistanceInput.value = e.target.value;
      plugin.settings.floatDistance = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[9];
      if (label) label.textContent = `${e.target.value}px`;
    });

    floatDistanceInput.addEventListener('change', (e) => {
      floatDistanceSlider.value = e.target.value;
      plugin.settings.floatDistance = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[9];
      if (label) label.textContent = `${e.target.value}px`;
    });

    const animationFontsizeInput = container.querySelector('#animation-fontsize');
    const animationFontsizeSlider = container.querySelector('#animation-fontsize-slider');

    animationFontsizeSlider.addEventListener('input', (e) => {
      animationFontsizeInput.value = e.target.value;
      plugin.settings.fontSize = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[10];
      if (label) label.textContent = `${e.target.value}px`;
    });

    animationFontsizeInput.addEventListener('change', (e) => {
      animationFontsizeSlider.value = e.target.value;
      plugin.settings.fontSize = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[10];
      if (label) label.textContent = `${e.target.value}px`;
    });

    container.querySelector('#screen-shake').addEventListener('change', (e) => {
      plugin.settings.screenShake = e.target.checked;
      plugin.saveSettings();
    });

    const shakeIntensityInput = container.querySelector('#shake-intensity');
    const shakeIntensitySlider = container.querySelector('#shake-intensity-slider');

    shakeIntensitySlider.addEventListener('input', (e) => {
      shakeIntensityInput.value = e.target.value;
      plugin.settings.shakeIntensity = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[11];
      if (label) label.textContent = `${e.target.value}px`;
    });

    shakeIntensityInput.addEventListener('change', (e) => {
      shakeIntensitySlider.value = e.target.value;
      plugin.settings.shakeIntensity = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[11];
      if (label) label.textContent = `${e.target.value}px`;
    });

    const shakeDurationInput = container.querySelector('#shake-duration');
    const shakeDurationSlider = container.querySelector('#shake-duration-slider');

    shakeDurationSlider.addEventListener('input', (e) => {
      shakeDurationInput.value = e.target.value;
      plugin.settings.shakeDuration = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[12];
      if (label) label.textContent = `${e.target.value}ms`;
    });

    shakeDurationInput.addEventListener('change', (e) => {
      shakeDurationSlider.value = e.target.value;
      plugin.settings.shakeDuration = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[12];
      if (label) label.textContent = `${e.target.value}ms`;
    });

    container.querySelector('#show-combo').addEventListener('change', (e) => {
      plugin.settings.showCombo = e.target.checked;
      plugin.saveSettings();
    });

    const maxComboInput = container.querySelector('#max-combo');
    const maxComboSlider = container.querySelector('#max-combo-slider');

    maxComboSlider.addEventListener('input', (e) => {
      maxComboInput.value = e.target.value;
      plugin.settings.maxCombo = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[13];
      if (label) label.textContent = `${e.target.value}`;
    });

    maxComboInput.addEventListener('change', (e) => {
      maxComboSlider.value = e.target.value;
      plugin.settings.maxCombo = parseInt(e.target.value);
      plugin.saveSettings();
      const label = container.querySelectorAll('.crit-label-value')[13];
      if (label) label.textContent = `${e.target.value}`;
    });

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
      if (this.debug?.enabled) {
        console.log('CriticalHit: Toast failed', error);
      }
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
          content.style.setProperty('text-stroke', 'none', 'important');
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
          if (this.debug?.enabled) {
            console.log('CriticalHit: Test crit applied (toast failed)', error);
          }
        }
      } else {
        try {
          BdApi?.showToast?.('Message already has crit!', { type: 'info', timeout: 2000 });
        } catch (error) {
          if (this.debug?.enabled) {
            console.log('CriticalHit: Message already has crit');
          }
        }
      }
    } else if (!lastMessage) {
      try {
        BdApi?.showToast?.('No messages found to test', { type: 'error', timeout: 2000 });
      } catch (error) {
        if (this.debug?.enabled) {
          console.log('CriticalHit: No messages found to test');
        }
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
   * Extracts message ID from a message element using React fiber traversal
   * Falls back to data attributes if React fiber is unavailable
   * @param {HTMLElement} element - The message DOM element
   * @returns {string|null} Message ID or null if not found
   */
  getMessageId(element) {
    try {
      // Try React fiber first
      const fiber = this.getReactFiber(element);
      if (fiber) {
        const messageObj = this.traverseFiber(
          fiber,
          (f) => f.memoizedProps?.message || f.memoizedState?.message
        );
        if (messageObj?.id) {
          const id = String(messageObj.id).trim();
          if (this.isValidDiscordId(id)) return id;
        }
      }

      // Fallback to data attribute
      const dataId = element.getAttribute('data-message-id');
      if (dataId) {
        if (this.isValidDiscordId(dataId)) {
          return String(dataId).trim();
        }
        const allMatches = dataId.match(/\d{17,19}/g);
        if (allMatches?.length > 0) {
          return allMatches[allMatches.length - 1];
        }
      }
    } catch (error) {
      // Silently fail - React fiber access may fail on some elements
    }
    return null;
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
        if (timestamp) {
          return timestamp instanceof Date ? timestamp.getTime() :
                 typeof timestamp === 'string' ? new Date(timestamp).getTime() :
                 typeof timestamp === 'number' ? timestamp : 0;
        }
      }
    } catch (error) {
      // Silently fail - React fiber access may fail on some elements
    }
    return 0;
  }

  // ============================================================================
  // MESSAGE HISTORY & VALIDATION
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
    // #region agent log
    // #endregion
    if (!messageElement) return;

    // Get message ID and validate
    const messageId = this.getMessageId(messageElement);
    // #region agent log
    // #endregion
    if (!this.isValidDiscordId(messageId)) return;

    // Verify gradient is applied before proceeding with animation
    // This ensures synchronization between CriticalHit and CriticalHitAnimation
    const verifyGradientSync = (element, attempt = 0, maxAttempts = 5) => {
      if (!element || !element.isConnected) {
        if (attempt < maxAttempts) {
          setTimeout(() => {
            const reQueried = messageId
              ? document.querySelector(`[data-message-id="${messageId}"]`)
              : null;
            if (reQueried) verifyGradientSync(reQueried, attempt + 1, maxAttempts);
          }, 50 * (attempt + 1));
        }
        return false;
      }

      const hasCritClass = element.classList?.contains('bd-crit-hit');
      if (!hasCritClass) {
        if (attempt < maxAttempts) {
          setTimeout(
            () => verifyGradientSync(element, attempt + 1, maxAttempts),
            50 * (attempt + 1)
          );
        }
        return false;
      }

      // Check for gradient in content element
      const contentSelectors = [
        '[class*="messageContent"]',
        '[class*="markup"]',
        '[class*="textContainer"]',
      ];
      const contentElement = contentSelectors
        .map((selector) => element.querySelector(selector))
        .find(
          (found) =>
            found && !found.closest('[class*="username"]') && !found.closest('[class*="timestamp"]')
        ) || null;

      if (contentElement) {
        const computedStyles = window.getComputedStyle(contentElement);
        const hasGradient = computedStyles?.backgroundImage?.includes('gradient');
        const hasWebkitClip =
          computedStyles?.webkitBackgroundClip === 'text' ||
          computedStyles?.backgroundClip === 'text';

        // #region agent log
        // #endregion

        if (!hasGradient || !hasWebkitClip) {
          if (attempt < maxAttempts) {
            // Force reflow and retry
            void contentElement.offsetHeight;
            setTimeout(
              () => verifyGradientSync(element, attempt + 1, maxAttempts),
              50 * (attempt + 1)
            );
            return false;
          } else {
            // Max attempts reached, proceed anyway but log warning
            // #region agent log
            // #endregion
          }
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
    // #region agent log
    // #endregion
    if (!hasCritClass || !isInDOM) return;

    // Get content hash for deduplication
    const content = this.findMessageContentElement(messageElement);
    const author = this.getAuthorId(messageElement);
    let contentHash = null;
    if (content && author) {
      const contentText = content.textContent?.trim() || '';
      if (contentText) {
        contentHash = this.getContentHash(author, contentText);
      }
    }

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

      // #region agent log
      // #endregion
    } else {
      // Mark this message as having combo updated (both by ID and content hash if available)
      this._comboUpdatedMessages.add(messageId);
      if (contentHash) {
        this._comboUpdatedContentHashes.add(contentHash);
      }

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

      // #region agent log
      // #endregion
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
          // #region agent log
          // #endregion
          this.markMessageAsRemoved(messageId);
          return;
        }

        // #region agent log
        // #endregion

        // Pass stored combo to showAnimation (already updated synchronously above)
        // CRITICAL: Ensure storedCombo is passed correctly - it should be a number, not null
        if (storedCombo === null || storedCombo === undefined) {
          // Fallback: get current combo if storedCombo wasn't set
          const userId = this.getUserId(targetElement) || userIdForCombo;
          const userCombo = this.getUserCombo(userId);
          storedCombo = userCombo.comboCount;

          // #region agent log
          // #endregion
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

      // #region agent log
      // #endregion

      return filteredMessages;
    } catch (error) {
      this.debugError('GET_CACHED_MESSAGES', error);
      // #region agent log
      // #endregion
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
        // #region agent log
        // #endregion
        return null;
      }
      const rect = element.getBoundingClientRect();
      const position = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      // #region agent log
      // #endregion

      return position;
    } catch (error) {
      // #region agent log
      // #endregion
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

    return allMessages.find((msg) => {
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
    }) || null;

    return null;
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
    if (existingData && typeof existingData === 'object') {
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
        // #region agent log
        // #endregion
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
      if (content && author) {
        const contentText = content.textContent?.trim() || '';
        if (contentText) {
          contentHash = this.getContentHash(author, contentText);
        }
      }

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

          // #region agent log
          // #endregion
        } else if (
          timeSinceAnimated > 2000 ||
          (!originalElementStillConnected && timeSinceAnimated > 1000)
        ) {
          // Enough time passed or element replaced with enough time - allow animation
          // Remove old entry to allow new animation
          this.animatedMessages.delete(messageId);

          // #region agent log
          // #endregion
        } else {
          // Same logical message with same element - skip animation
          // #region agent log
          // #endregion
          return;
        }
      }

      // Different content or no content hash - check if element was replaced
      if (existingData && messageElement?.isConnected) {
        // Element was replaced AND content is different - allow retry for new message
        // #region agent log
        // #endregion
        // Remove old entry to allow new animation
        this.animatedMessages.delete(messageId);
      } else {
        // Duplicate call with same element, skip
        // #region agent log
        // #endregion
        return;
      }
    }

    // #region agent log
    // #endregion

    // Check animation runtime setting (not overall plugin enabled state)
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

      // #region agent log
      // #endregion
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
    if (this.settings?.screenShake) {
      this.applyScreenShake();
    }

    // Create animation element
    const textElement = this.createAnimationElement(messageId, combo, position);
    container.appendChild(textElement);
    this.activeAnimations.add(textElement);

    // #region agent log
    // #endregion

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
            if (existingEl.parentNode) {
              existingEl.remove();
            }
            this.activeAnimations.delete(existingEl);
          } catch (e) {
            this.activeAnimations.delete(existingEl);
          }
        }, fadeOutDuration);
      } catch (e) {
        // If fade fails, just remove immediately
        try {
          if (existingEl.parentNode) {
            existingEl.remove();
          }
          this.activeAnimations.delete(existingEl);
        } catch (error2) {
          this.activeAnimations.delete(existingEl);
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Validation
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * Checks for duplicate animations already in the DOM
   * Prevents multiple animations for the same message
   * @param {HTMLElement} container - Animation container element
   * @param {string} messageId - The message ID
   * @param {Object} position - Position object with x and y coordinates
   * @returns {boolean} True if duplicate found
   */
  hasDuplicateInDOM(container, messageId, position) {
    if (messageId && container.querySelectorAll(`[data-cha-message-id="${messageId}"]`).length > 0) {
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
    // #region agent log
    // #endregion

    const textElement = document.createElement('div');
    textElement.className = 'cha-critical-hit-text';

    if (messageId) {
      textElement.setAttribute('data-cha-message-id', messageId);
    }

    // Ensure combo is a valid number
    const comboValue = typeof combo === 'number' && combo > 0 ? combo : 1;
    const comboText =
      comboValue > 1 && this.settings.showCombo ? `CRITICAL HIT! x${comboValue}` : 'CRITICAL HIT!';

    textElement.innerHTML = comboText;

    // #region agent log
    // #endregion

    // Set only positioning and layout styles - let CSS class handle animation and opacity
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
          if (allElements.length > 1) {
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
        }

        // Only remove element - don't clear animation styles
        // Animation has completed, CSS fade-out is done, just remove from DOM
        if (textElement.parentNode) {
          textElement.remove();
        }
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
    combo.lastCritTime = lastCritTime;

    // #region agent log
    // #endregion

    // Save for SoloLevelingStats
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
        const hadCombo = comboObj.comboCount;

        // #region agent log
        // #endregion

        // Reset both comboCount and lastCritTime
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
};
