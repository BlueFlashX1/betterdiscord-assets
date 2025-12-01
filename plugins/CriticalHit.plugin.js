/**
 * @name CriticalHit
 * @author Matthew
 * @description Messages have a chance to land a critical hit with special purple-black gradient styling and font!
 * @version 1.0.0
 */

module.exports = class CriticalHit {
  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================
    constructor() {
        this.defaultSettings = {
            enabled: true,
      critChance: 10, // 10% base chance by default (can be buffed by Agility stat up to 90%)
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
      // Debug settings
      debugMode: false, // Debug logging (can be toggled in settings)
        };

        this.settings = this.defaultSettings;
        this.messageObserver = null;
        this.urlObserver = null;
        this.critMessages = new Set(); // Track which messages are crits (in current session)
        this.processedMessages = new Set(); // Track all processed messages (crit or not) - uses message IDs
        this.messageHistory = []; // Full history of all processed messages with crit info
        this.originalPushState = null;
        this.originalReplaceState = null;
        this.observerStartTime = Date.now(); // Track when observer started
        this.channelLoadTime = Date.now(); // Track when channel finished loading
        this.isLoadingChannel = false; // Flag to prevent processing during channel load
        this.currentChannelId = null; // Track current channel ID
        this.maxHistorySize = 10000; // Maximum number of messages to store in history

    // Debug system (OPTIMIZED: Default disabled, throttling for frequent ops)
    this.debug = {
      enabled: this.settings.debugMode !== undefined ? this.settings.debugMode : false, // Use setting or default to false
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
  }

  // ============================================================================
  // DEBUG UTILITIES
  // ============================================================================

  debugLog(operation, message, data = null) {
    if (!this.debug.enabled) return;

    // OPTIMIZED: Throttle frequent operations to reduce CPU/memory usage
    const frequentOps = new Set([
      'GET_MESSAGE_ID',
      'CHECK_FOR_RESTORATION',
      'RESTORE_CHANNEL_CRITS',
      'CHECK_FOR_CRIT',
      'PROCESS_NODE',
      'MUTATION_OBSERVER',
    ]);

    if (frequentOps.has(operation)) {
      const now = Date.now();
      const lastLogTimes = this.debug.lastLogTimes || {};
      const throttleInterval = 10000; // 10 seconds for frequent ops

      if (lastLogTimes[operation] && now - lastLogTimes[operation] < throttleInterval) {
        // Skip logging but track count
        this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
        return;
      }

      // Initialize lastLogTimes if needed
      if (!this.debug.lastLogTimes) this.debug.lastLogTimes = {};
      this.debug.lastLogTimes[operation] = now;
    }

    const timestamp = new Date().toISOString();
    console.warn(`[CriticalHit:${operation}] ${message}`, data || '');

    // Track operation counts
    this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
  }

  // Error logging helper
  debugError(operation, error, context = {}) {
    this.debug.errorCount++;
    this.debug.lastError = {
      operation,
      error: error.message || error,
      stack: error.stack,
      context,
      timestamp: Date.now(),
    };

    const timestamp = new Date().toISOString();
    console.error(`[CriticalHit:ERROR:${operation}]`, {
      message: error.message || error,
      stack: error.stack,
      context,
      timestamp,
    });

    // Also log to debug file
    console.warn(`[CriticalHit:ERROR:${operation}] ${error.message || error}`, context);
    }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

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

        // Log summary of stored crits by channel
        const critsByChannel = {};
        this.getCritHistory().forEach((entry) => {
          const channelId = entry.channelId || 'unknown';
          critsByChannel[channelId] = (critsByChannel[channelId] || 0) + 1;
        });
        this.debugLog('START', 'Stored crits by channel', critsByChannel);

        // Auto-cleanup old history if enabled
        if (this.settings.autoCleanupHistory) {
          this.cleanupOldHistory(this.settings.historyRetentionDays || 30);
        }
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

      const effectiveCritChance = this.getEffectiveCritChance();

      // Get individual bonuses for display
      let agilityBonus = 0;
      let luckBonus = 0;
      try {
        const agilityData = BdApi.Data.load('SoloLevelingStats', 'agilityBonus');
        if (agilityData && agilityData.bonus) {
          agilityBonus = agilityData.bonus * 100;
        }
        const luckData = BdApi.Data.load('SoloLevelingStats', 'luckBonus');
        if (luckData && luckData.bonus) {
          luckBonus = luckData.bonus * 100;
        }
      } catch (e) {}

      const totalBonus = agilityBonus + luckBonus;
      const bonusText = totalBonus > 0
        ? `(${effectiveCritChance.toFixed(1)}% effective with ${agilityBonus > 0 ? `+${agilityBonus.toFixed(1)}% AGI` : ''}${agilityBonus > 0 && luckBonus > 0 ? ' + ' : ''}${luckBonus > 0 ? `+${luckBonus.toFixed(1)}% LUK` : ''})`
        : '';

      console.log(`CriticalHit: Started with ${this.settings.critChance}% base crit chance ${bonusText}!`);
      console.log(`CriticalHit: Loaded ${this.messageHistory.length} messages from history`);

      // Show toast notification (if available)
        try {
        if (BdApi && typeof BdApi.showToast === 'function') {
          let toastMessage = `CriticalHit enabled! ${this.settings.critChance}% crit chance`;
          if (totalBonus > 0) {
            const bonuses = [];
            if (agilityBonus > 0) bonuses.push(`+${agilityBonus.toFixed(1)}% AGI`);
            if (luckBonus > 0) bonuses.push(`+${luckBonus.toFixed(1)}% LUK`);
            toastMessage = `CriticalHit enabled! ${this.settings.critChance}% base (${bonuses.join(' + ')}) = ${effectiveCritChance.toFixed(1)}%`;
          }
          BdApi.showToast(toastMessage, {
            type: 'success',
            timeout: 3000,
            });
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

    stop() {
        // Stop observing
        if (this.messageObserver) {
            this.messageObserver.disconnect();
            this.messageObserver = null;
        }

        if (this.urlObserver) {
            this.urlObserver.disconnect();
            this.urlObserver = null;
        }

        // Restore original history methods
        if (this.originalPushState) {
            history.pushState = this.originalPushState;
        }
        if (this.originalReplaceState) {
            history.replaceState = this.originalReplaceState;
        }

        // Save message history before stopping
        this.saveMessageHistory();

        // Remove all crit styling
        this.removeAllCrits();

    console.log('CriticalHit: Stopped');
    }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

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
                this.settings = { ...this.defaultSettings, ...saved };
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
        this.debugLog('LOAD_SETTINGS', 'No saved settings found, using defaults');
            }
        } catch (error) {
      this.debugError('LOAD_SETTINGS', error, { phase: 'load_settings' });
      console.error('CriticalHit: Error loading settings', error);
            this.settings = { ...this.defaultSettings };
        }
    }

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

    getCurrentChannelId() {
        // Try to get channel ID from URL
        const urlMatch = window.location.href.match(/channels\/\d+\/(\d+)/);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }
        // Fallback: use URL as identifier
        return window.location.href;
    }

  // ============================================================================
  // MESSAGE IDENTIFICATION & DETECTION
  // ============================================================================

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
          let fiber = messageElement[reactKey];
          // Walk up the fiber tree to find message data (increased depth to 50)
          for (let i = 0; i < 50 && fiber; i++) {
            // FIRST: Try to get the message object itself, then extract ID
            const messageObj = fiber.memoizedProps?.message ||
                             fiber.memoizedState?.message ||
                             fiber.memoizedProps?.messageProps?.message ||
                             fiber.child?.memoizedProps?.message ||
                             fiber.child?.memoizedState?.message;

            // If we found a message object, get its ID directly (most reliable)
            if (messageObj && messageObj.id) {
              const msgIdStr = String(messageObj.id).trim();
              // Validate it's a proper Discord message ID (17-19 digits)
              if (/^\d{17,19}$/.test(msgIdStr)) {
                messageId = msgIdStr;
                extractionMethod = 'react_message_object';
                break;
              }
            }

            // FALLBACK: Try direct ID access
            const msgId = fiber.memoizedProps?.message?.id ||
                         fiber.memoizedState?.message?.id ||
                         fiber.memoizedProps?.messageId ||
                         fiber.child?.memoizedProps?.message?.id ||
                         fiber.child?.memoizedState?.message?.id;

            if (msgId) {
              const idStr = String(msgId).trim();
              // Validate it's a proper Discord message ID (17-19 digits)
              if (/^\d{17,19}$/.test(idStr)) {
                messageId = idStr;
                extractionMethod = 'react_props';
                break;
              }
              // If it's a composite format, extract the message ID part
              const matches = idStr.match(/\d{17,19}/g);
              if (matches && matches.length > 0) {
                // Take the LAST match (message ID usually comes after channel ID)
                messageId = matches[matches.length - 1];
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
        // Check if it's already a pure Discord message ID
        if (/^\d{17,19}$/.test(idStr)) {
          messageId = idStr;
          extractionMethod = 'data-list-item-id_pure';
        } else {
          // Extract all Discord IDs and take the longest one (usually the message ID)
          const matches = idStr.match(/\d{17,19}/g);
          if (matches && matches.length > 0) {
            // If multiple IDs found, take the longest one (message IDs are usually longer)
            // Or take the last one (message ID usually comes after channel ID)
            messageId = matches.length > 1 ? matches[matches.length - 1] : matches[0];
            extractionMethod = 'data-list-item-id_extracted';
          }
        }
      }
    }

    // Method 3: Check for id attribute - extract pure message ID from composite formats
    // Be careful - id attributes often contain channel IDs, so prioritize message ID
    if (!messageId) {
      const idAttr =
        messageElement.getAttribute('id') ||
        messageElement.closest('[id]')?.getAttribute('id');
      if (idAttr) {
        const idStr = String(idAttr).trim();
        // Check if it's a pure Discord message ID
        if (/^\d{17,19}$/.test(idStr)) {
          messageId = idStr;
          extractionMethod = 'id_attr_pure';
        } else {
          // Extract all Discord IDs and take the longest/last one (message ID)
          const matches = idStr.match(/\d{17,19}/g);
          if (matches && matches.length > 0) {
            // If multiple IDs found, take the longest one (message IDs are usually longer)
            // Or take the last one (message ID usually comes after channel ID)
            messageId = matches.length > 1 ? matches[matches.length - 1] : matches[0];
            extractionMethod = 'id_attr_extracted';
          }
        }
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
        if (/^\d{17,19}$/.test(idStr)) {
          messageId = idStr;
          extractionMethod = 'data-message-id';
        } else {
          // Extract all Discord IDs and take the last one
          const matches = idStr.match(/\d{17,19}/g);
          if (matches && matches.length > 0) {
            messageId = matches[matches.length - 1];
            extractionMethod = 'data-message-id_extracted';
          }
        }
      }
    }

    // Normalize to string and trim, then validate
    if (messageId) {
      messageId = String(messageId).trim();
      // Verify it's a valid Discord message ID format
      if (!/^\d{17,19}$/.test(messageId)) {
        // If not valid, try to extract from it
        const matches = messageId.match(/\d{17,19}/g);
        if (matches && matches.length > 0) {
          // Take the last match (message ID usually comes after channel ID)
          messageId = matches[matches.length - 1];
          extractionMethod = extractionMethod ? `${extractionMethod}_extracted` : 'regex_extracted';
        } else {
          messageId = null; // Invalid format, continue to fallback
        }
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

            if (content && author) {
        // Use first 100 chars of content + author + timestamp for stability
        const hashContent = `${author}:${content.substring(0, 100)}:${timestamp}`;
                // Create a simple hash
        let hash = 0;
        for (let i = 0; i < hashContent.length; i++) {
          const char = hashContent.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        messageId = `hash_${Math.abs(hash)}`;
        extractionMethod = 'content_hash';
            } else if (content) {
        // Last resort: just content hash
        let hash = 0;
        for (let i = 0; i < content.length && i < 100; i++) {
          const char = content.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash;
        }
        messageId = `hash_${Math.abs(hash)}`;
        extractionMethod = 'content_only_hash';
      }
    }

    // Validate message ID format and warn if suspicious
    if (messageId) {
      const isValidFormat = /^\d{17,19}$/.test(messageId);
      const isSuspicious = messageId.length < 17 || messageId.length > 19;

      // Always log suspicious IDs or when verbose debugging is enabled
      if (debugContext && (isSuspicious || debugContext.verbose || !isValidFormat)) {
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
      if (isSuspicious && this.debug.enabled) {
        console.warn('[CriticalHit] ⚠️ Suspicious message ID extracted:', {
          messageId,
          length: messageId.length,
          method: extractionMethod,
          elementId: messageElement.getAttribute('id'),
        });
      }
    }

        return messageId;
    }

  // Extract author/user ID from message element
  getAuthorId(messageElement) {
    try {
      // Method 1: Try React props (Discord stores message data in React)
      const reactKey = Object.keys(messageElement).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );

      if (reactKey) {
        let fiber = messageElement[reactKey];
        for (let i = 0; i < 30 && fiber; i++) {
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
      const authorElement = messageElement.querySelector('[class*="author"]') ||
                           messageElement.querySelector('[class*="username"]') ||
                           messageElement.querySelector('[class*="messageAuthor"]');

      if (authorElement) {
        const authorId = authorElement.getAttribute('data-user-id') ||
                        authorElement.getAttribute('data-author-id') ||
                        authorElement.getAttribute('id') ||
                        authorElement.getAttribute('href')?.match(/users\/(\d{17,19})/)?.[1];

        if (authorId) {
          const match = authorId.match(/\d{17,19}/);
          if (match && /^\d{17,19}$/.test(match[0])) {
            return match[0];
          }
        }
      }

      // Method 3: Try to find any element with user ID attribute in the message
      const allElements = messageElement.querySelectorAll('[data-user-id], [data-author-id], [href*="/users/"]');
      for (const el of allElements) {
        const id = el.getAttribute('data-user-id') ||
                   el.getAttribute('data-author-id') ||
                   el.getAttribute('href')?.match(/users\/(\d{17,19})/)?.[1];
        if (id && /^\d{17,19}$/.test(id)) {
          return String(id).trim();
        }
      }
    } catch (error) {
      this.debugError('GET_AUTHOR_ID', error);
    }

    return null;
  }

  // ============================================================================
  // MESSAGE HISTORY MANAGEMENT
  // ============================================================================

    saveMessageHistory() {
        try {
      // Count crits before saving
      const critCount = this.messageHistory.filter((e) => e.isCrit).length;
      const critsByChannel = {};
      this.messageHistory
        .filter((e) => e.isCrit)
        .forEach((entry) => {
          const channelId = entry.channelId || 'unknown';
          critsByChannel[channelId] = (critsByChannel[channelId] || 0) + 1;
        });

      this.debugLog('SAVE_MESSAGE_HISTORY', '🔄 CRITICAL: Saving message history to storage', {
        historySize: this.messageHistory.length,
        critCount: critCount,
        critsByChannel: critsByChannel,
        maxSize: this.maxHistorySize,
      });

            // Limit history size to prevent storage bloat
            if (this.messageHistory.length > this.maxHistorySize) {
                // Keep only the most recent messages
        const oldSize = this.messageHistory.length;
        const oldCritCount = this.messageHistory.filter((e) => e.isCrit).length;
                this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
        const newCritCount = this.messageHistory.filter((e) => e.isCrit).length;
        this.debugLog('SAVE_MESSAGE_HISTORY', '⚠️ History trimmed', {
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
      const verifyCritCount = verifyLoad ? verifyLoad.filter((e) => e.isCrit).length : 0;

      this.debugLog('SAVE_MESSAGE_HISTORY', '✅ CRITICAL: Message history saved successfully', {
        messageCount: this.messageHistory.length,
        critCount: critCount,
        verifyLoadSuccess: Array.isArray(verifyLoad),
        verifyMessageCount: verifyLoad ? verifyLoad.length : 0,
        verifyCritCount: verifyCritCount,
        saveVerified: verifyCritCount === critCount,
      });
      console.log(
        `CriticalHit: ✅ Saved ${this.messageHistory.length} messages (${critCount} crits) to history`
      );
        } catch (error) {
      this.debugError('SAVE_MESSAGE_HISTORY', error, {
        historySize: this.messageHistory.length,
        critCount: this.messageHistory.filter((e) => e.isCrit).length,
        phase: 'save_history',
      });
        }
    }

    loadMessageHistory() {
        try {
      this.debugLog('LOAD_MESSAGE_HISTORY', '🔄 CRITICAL: Loading message history from storage');
      const saved = BdApi.Data.load('CriticalHit', 'messageHistory');

            if (Array.isArray(saved)) {
                this.messageHistory = saved;
        const critCount = this.messageHistory.filter((e) => e.isCrit).length;
        const critsByChannel = {};
        this.messageHistory
          .filter((e) => e.isCrit)
          .forEach((entry) => {
            const channelId = entry.channelId || 'unknown';
            critsByChannel[channelId] = (critsByChannel[channelId] || 0) + 1;
          });

        this.debugLog('LOAD_MESSAGE_HISTORY', '✅ CRITICAL: Message history loaded successfully', {
          messageCount: this.messageHistory.length,
          critCount: critCount,
          critsByChannel: critsByChannel,
          sampleCritIds: this.messageHistory
            .filter((e) => e.isCrit)
            .slice(0, 5)
            .map((e) => ({ messageId: e.messageId, channelId: e.channelId })),
        });
        console.log(
          `CriticalHit: ✅ Loaded ${this.messageHistory.length} messages (${critCount} crits) from history`
        );
            } else {
                this.messageHistory = [];
        this.debugLog(
          'LOAD_MESSAGE_HISTORY',
          '⚠️ No saved history found, initializing empty array',
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
        isCrit ? '🔥 CRITICAL: Adding CRIT message to history' : 'Adding message to history',
        {
        messageId: messageId,
          authorId: authorId,
          channelId: channelId,
          isCrit: isCrit,
        useGradient: this.settings.critGradient !== false,
          hasMessageContent: !!messageData.messageContent,
          hasAuthor: !!messageData.author,
          hasAuthorId: !!authorId,
          messageIdFormat: messageId ? (/^\d{17,19}$/.test(messageId) ? 'Discord ID' : 'Other') : 'null',
          authorIdFormat: authorId ? (/^\d{17,19}$/.test(authorId) ? 'Discord ID' : 'Other') : 'null',
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

        // Check if message already exists in history (update if exists)
        const existingIndex = this.messageHistory.findIndex(
        (entry) =>
          entry.messageId === messageData.messageId && entry.channelId === messageData.channelId
        );

        if (existingIndex >= 0) {
            // Update existing entry
        const wasCrit = this.messageHistory[existingIndex].isCrit;
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
            this.messageHistory.push(historyEntry);
        this.debugLog('ADD_TO_HISTORY', 'Added new history entry', {
          index: this.messageHistory.length - 1,
          isCrit: isCrit,
          messageId: messageData.messageId,
          authorId: messageData.authorId,
        });
        }

      // Auto-save immediately on crit, periodically for non-crits
      if (isCrit) {
        this.debugLog('ADD_TO_HISTORY', '🔥 CRITICAL: Triggering immediate save for crit message', {
          messageId: messageData.messageId,
          channelId: messageData.channelId,
        });
        this.saveMessageHistory(); // Save immediately when crit happens
      } else if (this.messageHistory.length % 20 === 0) {
        this.saveMessageHistory(); // Save every 20 non-crit messages
      }

      const finalCritCount = this.messageHistory.filter((e) => e.isCrit).length;
      this.debugLog(
        'ADD_TO_HISTORY',
        isCrit ? '✅ CRITICAL: Crit message added to history' : 'Message added to history',
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

    getChannelHistory(channelId) {
        // Get all messages for a specific channel
    return this.messageHistory.filter((entry) => entry.channelId === channelId);
    }

    getCritHistory(channelId = null) {
        // Get all crit messages, optionally filtered by channel
    let crits = this.messageHistory.filter((entry) => entry.isCrit);
        if (channelId) {
      crits = crits.filter((entry) => entry.channelId === channelId);
        }
        return crits;
    }

  restoreChannelCrits(channelId, retryCount = 0) {
    try {
      this.debugLog('RESTORE_CHANNEL_CRITS', '🔄 CRITICAL: Starting restoration process', {
        channelId,
        retryCount,
        currentChannelId: this.currentChannelId,
        historySize: this.messageHistory.length,
        totalCritsInHistory: this.getCritHistory().length,
      });

        // Restore crits for this channel from history
        if (!channelId) {
        this.debugLog('RESTORE_CHANNEL_CRITS', '⚠️ ERROR: No channel ID provided for restoration');
            return;
        }

        const channelCrits = this.getCritHistory(channelId);
        if (channelCrits.length === 0) {
        this.debugLog('RESTORE_CHANNEL_CRITS', '⚠️ No crits found in history for this channel', {
          channelId,
          totalCritsInHistory: this.getCritHistory().length,
          allChannelIds: [...new Set(this.messageHistory.map((e) => e.channelId))],
        });
            return;
        }

      this.debugLog('RESTORE_CHANNEL_CRITS', '✅ Found crits to restore from history', {
        critCount: channelCrits.length,
        attempt: retryCount + 1,
        channelId: channelId,
        sampleCritIds: channelCrits.slice(0, 5).map((e) => e.messageId),
        allCritIds: channelCrits.map((e) => e.messageId),
      });
      // OPTIMIZED: Only log restoration attempts if verbose or first attempt
      if (retryCount === 0 || this.debug.verbose) {
      console.log(
          `CriticalHit: 🔄 Restoring ${channelCrits.length} crits for channel ${channelId} (attempt ${
          retryCount + 1
        })`
      );
      }

      // Create a Set of message IDs that should have crits (normalize to strings)
      const critMessageIds = new Set(channelCrits.map((entry) => String(entry.messageId).trim()));
      let restoredCount = 0;
      let skippedAlreadyStyled = 0;
      let noIdFound = 0;
      let idMismatch = 0;
      const foundIds = new Set();

      // Find all messages in current channel - use more specific selector
      // Try multiple selectors to catch all message containers
      const selectors = [
        '[class*="message"]:not([class*="messageContent"]):not([class*="messageGroup"])',
        '[class*="messageListItem"]',
        '[class*="message"]',
      ];

      let allMessages = [];
      for (const selector of selectors) {
        const messages = document.querySelectorAll(selector);
        if (messages.length > 0) {
          allMessages = Array.from(messages);
          break;
        }
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
          if (msgElement.classList.contains('bd-crit-hit')) {
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
                let fiber = msgElement[reactKey];
                for (let i = 0; i < 20 && fiber; i++) {
                  if (fiber.memoizedProps?.message?.id) {
                    msgId = String(fiber.memoizedProps.message.id);
                    break;
                  }
                  if (fiber.memoizedState?.message?.id) {
                    msgId = String(fiber.memoizedState.message.id);
                    break;
                  }
                  fiber = fiber.return;
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
            if (altId && !foundIds.has(String(altId))) {
              foundIds.add(String(altId));
            }
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
          let matchedEntry = null;
          for (const entry of channelCrits) {
            const entryId = String(entry.messageId).trim();
            const entryPureId = /^\d{17,19}$/.test(entryId)
              ? entryId
              : entryId.match(/\d{17,19}/)?.[0];

            // Exact match
            if (entryId === normalizedMsgId || entryId === pureMessageId) {
              matchedEntry = entry;
              break;
            }

            // Pure ID match (if we extracted a pure ID)
            if (pureMessageId !== normalizedMsgId && entryPureId && entryPureId === pureMessageId) {
              matchedEntry = entry;
              break;
            }

            // Partial match (for composite formats)
            if (
              normalizedMsgId.includes(entryId) ||
              entryId.includes(normalizedMsgId) ||
              (pureMessageId &&
                entryPureId &&
                (pureMessageId.includes(entryPureId) || entryPureId.includes(pureMessageId)))
            ) {
              matchedEntry = entry;
              break;
            }
          }

          if (matchedEntry && matchedEntry.critSettings) {
                    // Restore crit with original settings
            // OPTIMIZED: Only log restoration attempts if verbose or first attempt
            if (retryCount === 0 || this.debug.verbose) {
              this.debugLog('RESTORE_CHANNEL_CRITS', '🔄 Attempting to restore crit for message', {
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
                      this.processedMessages.add(normalizedMsgId);
                    }
              restoredCount++;

            // Verify restoration
            const verifyStyled = msgElement.classList.contains('bd-crit-hit');
            this.debugLog(
              'RESTORE_CHANNEL_CRITS',
              verifyStyled
                ? '✅ CRITICAL: Successfully restored crit for message'
                : '⚠️ WARNING: Restoration may have failed',
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
            // OPTIMIZED: Only log mismatches if verbose (reduces spam)
            if ((/^\d{17,19}$/.test(normalizedMsgId) || /^\d{17,19}$/.test(pureMessageId)) && this.debug.verbose) {
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
          ? '✅ CRITICAL: Restoration completed successfully'
          : missingCount > 10
          ? '⚠️ Restoration summary (many messages not visible - scroll to restore)'
          : '⚠️ Restoration summary (incomplete)',
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
      // OPTIMIZED: Reduced max retries from 5 to 3 to prevent excessive retry spam
      if (restoredCount < channelCrits.length && retryCount < 3) {
        const nextRetry = retryCount + 1;
        // OPTIMIZED: Only log retries if verbose (reduces spam)
        if (this.debug.verbose) {
        this.debugLog('RESTORE_CHANNEL_CRITS', 'Not all crits restored, will retry', {
          restored: restoredCount,
          total: channelCrits.length,
            nextRetry: nextRetry,
            missingCount: channelCrits.length - restoredCount,
        });
        }
        // Wait a bit for more messages to load, then retry
        // Use shorter delays for first few retries
        const delay = retryCount < 2 ? 500 : 1000;
        setTimeout(() => {
          if (this.currentChannelId === channelId) {
            this.restoreChannelCrits(channelId, nextRetry);
          }
        }, delay);
      } else if (restoredCount < channelCrits.length && retryCount >= 3) {
        // Final warning after max retries
        // Note: Messages not currently visible in the viewport cannot be restored
        // This is expected - Discord only loads visible messages into the DOM
        this.debugLog(
          'RESTORE_CHANNEL_CRITS',
          '⚠️ Max retries reached - some crits may not be restored (messages may be outside viewport)',
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

      // OPTIMIZED: Removed automatic retry after delay - prevents excessive retry spam
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

    applyCritStyleWithSettings(messageElement, critSettings) {
    try {
      const msgId = this.getMessageIdentifier(messageElement);
      this.debugLog(
        'APPLY_CRIT_STYLE_WITH_SETTINGS',
        '🔄 CRITICAL: Restoring crit style from saved settings',
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
      // Find ONLY the message text content container - exclude username, timestamp, etc.
      // Apply gradient to the entire message text container as one unit

      this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Finding message content element', {
        messageElementClasses: Array.from(messageElement.classList || []),
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
          this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Element is in header area', {
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
          this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Element has header class', {
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
      const messageContent = messageElement.querySelector('[class*="messageContent"]');
      if (messageContent) {
        if (!isInHeaderArea(messageContent)) {
          content = messageContent;
          this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Found messageContent', {
            elementTag: content.tagName,
            classes: Array.from(content.classList || []),
          });
        } else {
          this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'messageContent rejected (in header)');
        }
      }

      // Try markup (Discord's text container) - but exclude if it's in header
        if (!content) {
        const markup = messageElement.querySelector('[class*="markup"]');
        if (markup) {
          if (!isInHeaderArea(markup)) {
            content = markup;
            this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Found markup', {
              elementTag: content.tagName,
              classes: Array.from(content.classList || []),
            });
          } else {
            this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'markup rejected (in header)');
                }
            }
        }

      // Try textContainer
        if (!content) {
        const textContainer = messageElement.querySelector('[class*="textContainer"]');
        if (textContainer) {
          if (!isInHeaderArea(textContainer)) {
            content = textContainer;
            this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Found textContainer', {
              elementTag: content.tagName,
              classes: Array.from(content.classList || []),
            });
          } else {
            this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'textContainer rejected (in header)');
          }
        }
      }

      // Last resort: find divs that are NOT in header areas
      if (!content) {
        const allDivs = messageElement.querySelectorAll('div');
        for (const div of allDivs) {
          if (!isInHeaderArea(div) && div.textContent && div.textContent.trim().length > 0) {
            content = div;
            this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Found div fallback', {
              elementTag: content.tagName,
              classes: Array.from(content.classList || []),
            });
            break;
          }
        }
      }

      if (!content) {
        this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'No content element found - skipping');
        return;
      }

      this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Final content element selected', {
        tagName: content.tagName,
        classes: Array.from(content.classList || []),
        textPreview: content.textContent?.substring(0, 50),
      });

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

        this.debugLog('APPLY_CRIT_STYLE_WITH_SETTINGS', 'Gradient applied for restoration', {
          gradient: gradientColors,
        });
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
      if (critSettings.glow !== false && this.settings.critGlow) {
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

      if (critSettings.animation !== false && this.settings.critAnimation) {
        content.style.animation = 'critPulse 0.5s ease-in-out';
        }
        }

      messageElement.classList.add('bd-crit-hit');
        this.injectCritCSS();

      // Re-get message ID for final verification (in case it wasn't available earlier)
      const finalMsgId = this.getMessageIdentifier(messageElement) || msgId;
      this.debugLog(
        'APPLY_CRIT_STYLE_WITH_SETTINGS',
        '✅ CRITICAL: Crit style restored successfully from saved settings',
        {
          messageId: finalMsgId,
          channelId: this.currentChannelId,
          useGradient,
          elementHasClass: messageElement.classList.contains('bd-crit-hit'),
          contentHasClass: content.classList.contains('bd-crit-text-content'),
          finalStyles: {
            background: content.style.background,
            webkitBackgroundClip: content.style.webkitBackgroundClip,
            webkitTextFillColor: content.style.webkitTextFillColor,
            textShadow: content.style.textShadow,
          },
        }
      );
    } catch (error) {
      this.debugError('APPLY_CRIT_STYLE_WITH_SETTINGS', error, {
        hasMessageElement: !!messageElement,
        hasCritSettings: !!critSettings,
      });
    }
    }

    cleanupOldHistory(daysToKeep = 30) {
        // Remove history entries older than specified days
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
        const initialLength = this.messageHistory.length;
    const initialCrits = this.messageHistory.filter((e) => e.isCrit).length;

    this.messageHistory = this.messageHistory.filter((entry) => entry.timestamp > cutoffTime);
        const removed = initialLength - this.messageHistory.length;
    const removedCrits = initialCrits - this.messageHistory.filter((e) => e.isCrit).length;

        if (removed > 0) {
      this.debugLog('CLEANUP_HISTORY', 'Cleaned up old history entries', {
        removed,
        removedCrits,
        remaining: this.messageHistory.length,
        daysToKeep,
      });
      console.log(`CriticalHit: Cleaned up ${removed} old history entries (${removedCrits} crits)`);
            this.saveMessageHistory();
      this.updateStats(); // Recalculate stats after cleanup
        }
    }

  updateStats() {
    // Calculate stats from message history
    const totalCrits = this.messageHistory.filter((e) => e.isCrit).length;
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

            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    // Verify it's actually a message container by checking for message children
                    const hasMessages = element.querySelector('[class*="message"]') !== null;
                    if (hasMessages || selector.includes('scroller')) {
                        return element;
                    }
                }
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
            if (this.currentChannelId) {
                this.saveMessageHistory(); // Save any pending history entries
            }
            this.currentChannelId = channelId;
        }

        // Clear session-based tracking (but keep history storage)
        this.critMessages.clear();
        this.processedMessages.clear();

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
        console.log(
          `CriticalHit: Channel loaded (${messageCount} messages), ready to process new messages`
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
                                 node.textContent?.trim().length > 0;
                if (hasContent) {
                    messageElement = node;
                }
            }
        }

        // Check for message in children if node itself isn't a message
        if (!messageElement) {
            // Look for message containers in children
            const potentialMessages = node.querySelectorAll('[class*="message"]');
            for (const msg of potentialMessages) {
                if (msg.classList) {
                    const classes = Array.from(msg.classList);
            const isNotContent = !classes.some(
              (c) =>
                        c.includes('messageContent') ||
                        c.includes('messageGroup') ||
                        c.includes('messageText')
                    );
                    if (isNotContent && msg.offsetParent !== null) {
                        messageElement = msg;
                        break;
                    }
                }
            }
        }

        // Get message ID to check against processedMessages (which now uses IDs, not element references)
        const messageId = messageElement ? this.getMessageIdentifier(messageElement) : null;

        this.debugLog('PROCESS_NODE', 'processNode detected message', {
          messageId: messageId,
          alreadyProcessed: messageId ? this.processedMessages.has(messageId) : false,
          isLoadingChannel: this.isLoadingChannel
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
                    // Small delay to ensure message is fully rendered
                    setTimeout(() => {
                        this.checkForCrit(messageElement);
                    }, 150);
                }
            } else {
                // If we can't determine scroll position, check timing
                const timeSinceChannelLoad = Date.now() - this.channelLoadTime;
                if (timeSinceChannelLoad > 2000) {
                    // Only process if channel has been loaded for a while
                    setTimeout(() => {
                        this.checkForCrit(messageElement);
                    }, 150);
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

    isNewlyAdded(element) {
        // Check if element was added after observer started
        // MutationObserver only fires for newly added nodes, so if we're here, it's likely new
        // But we can also check if it's in the visible viewport near the bottom
        return true; // MutationObserver only fires for new nodes anyway
    }

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
        console.log('CriticalHit: Channel changed, re-initializing...');
                // Save current session data before switching
                if (this.currentChannelId) {
                    this.saveMessageHistory();
                }
                // Clear processed messages when channel changes
                this.processedMessages.clear();
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
        const critCount = this.messageHistory.filter((e) => e.isCrit).length;
        this.debugLog(
          'CHANNEL_CHANGE',
          '🔄 CRITICAL: Channel changing - saving history before navigation',
          {
            channelId: this.currentChannelId,
            historySize: this.messageHistory.length,
            critCount: critCount,
            critsInChannel: this.getCritHistory(this.currentChannelId).length,
          }
        );
                this.saveMessageHistory();
        this.debugLog('CHANNEL_CHANGE', '✅ History saved before navigation', {
          channelId: this.currentChannelId,
          historySize: this.messageHistory.length,
        });
            }
      // Clear processed messages when navigating (but keep history!)
      const oldProcessedCount = this.processedMessages.size;
      const oldCritCount = this.critMessages.size;
            this.processedMessages.clear();
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

  shouldFilterMessage(messageElement) {
    // Check if message should be filtered based on settings

    // Filter replies
    if (this.settings.filterReplies) {
      if (this.isReplyMessage(messageElement)) {
        return true;
      }
    }

    // Filter system messages
    if (this.settings.filterSystemMessages) {
      if (this.isSystemMessage(messageElement)) {
        return true;
      }
    }

    // Filter bot messages
    if (this.settings.filterBotMessages) {
      if (this.isBotMessage(messageElement)) {
        return true;
      }
    }

    // Filter empty messages (only embeds/attachments)
    if (this.settings.filterEmptyMessages) {
      if (this.isEmptyMessage(messageElement)) {
        return true;
      }
    }

    return false;
  }

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

    for (const selector of replySelectors) {
      if (messageElement.querySelector(selector)) {
        return true;
      }
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
        let fiber = messageElement[reactKey];
        // Walk up the fiber tree to find message data
        for (let i = 0; i < 10 && fiber; i++) {
          if (fiber.memoizedProps?.message?.messageReference) {
            return true; // Has a message reference = it's a reply
          }
          if (fiber.memoizedState?.message?.messageReference) {
            return true;
          }
          fiber = fiber.return;
        }
      }
    } catch (e) {
      // React access failed, continue
    }

    return false;
  }

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

    for (const selector of systemIndicators) {
      if (messageElement.querySelector(selector) || messageElement.matches(selector)) {
        return true;
      }
    }

    // Check if message has system message classes
    const classes = Array.from(messageElement.classList || []);
    if (classes.some((c) => c.includes('system') || c.includes('join') || c.includes('leave'))) {
      return true;
    }

    return false;
  }

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

  checkForRestoration(node) {
    // Check if a newly added node is a message that should have a crit restored
    if (!this.currentChannelId || this.isLoadingChannel) {
      return;
    }

    // Check if node is a message element
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

    if (messageElement && !messageElement.classList.contains('bd-crit-hit')) {
      // Get message ID using improved extraction (only log if verbose)
      let msgId = this.getMessageIdentifier(messageElement);

      if (msgId) {
        // Check if this message should have a crit
        const channelCrits = this.getCritHistory(this.currentChannelId);
        const normalizedMsgId = String(msgId).trim();

        // Extract pure Discord message ID if in composite format
        let pureMessageId = normalizedMsgId;
        if (!/^\d{17,19}$/.test(normalizedMsgId)) {
          const match = normalizedMsgId.match(/\d{17,19}/);
          if (match) {
            pureMessageId = match[0];
          }
        }

        // OPTIMIZED: Only log restoration checks if verbose (happens frequently)
        if (this.debug.verbose) {
          this.debugLog('CHECK_FOR_RESTORATION', '🔄 Checking if message needs restoration', {
            msgId: normalizedMsgId,
            pureMessageId: pureMessageId !== normalizedMsgId ? pureMessageId : undefined,
            channelId: this.currentChannelId,
            channelCritCount: channelCrits.length,
          });
        }

        // Try exact match first, then pure ID match, then partial match
        let historyEntry = channelCrits.find((entry) => {
          const entryId = String(entry.messageId).trim();
          return entryId === normalizedMsgId || entryId === pureMessageId;
        });
        if (!historyEntry) {
          // Try matching pure IDs
          historyEntry = channelCrits.find((entry) => {
            const entryId = String(entry.messageId).trim();
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

        if (historyEntry && historyEntry.critSettings) {
          this.debugLog('CHECK_FOR_RESTORATION', '✅ Found matching crit in history, restoring', {
            msgId: normalizedMsgId,
            channelId: this.currentChannelId,
            hasCritSettings: !!historyEntry.critSettings,
            critSettings: historyEntry.critSettings,
          });

          // Small delay to ensure element is fully rendered
          setTimeout(() => {
            if (messageElement && !messageElement.classList.contains('bd-crit-hit')) {
          // Restore the crit
          this.applyCritStyleWithSettings(messageElement, historyEntry.critSettings);
          this.critMessages.add(messageElement);
          // Mark as processed using message ID (not element reference)
          if (normalizedMsgId) {
            this.processedMessages.add(normalizedMsgId);
          }
              this.debugLog(
                'CHECK_FOR_RESTORATION',
                '✅ CRITICAL: Restored crit for newly added message',
                {
                  msgId: normalizedMsgId,
                  channelId: this.currentChannelId,
                  elementHasClass: messageElement.classList.contains('bd-crit-hit'),
                }
              );
            } else {
              this.debugLog(
                'CHECK_FOR_RESTORATION',
                '⚠️ Skipped restoration (element invalid or already styled)',
                {
                  msgId: normalizedMsgId,
                  elementExists: !!messageElement,
                  alreadyStyled: messageElement?.classList.contains('bd-crit-hit'),
                }
              );
            }
          }, 100);
        } else {
          // OPTIMIZED: Only log non-matches if verbose (reduces spam)
          if (this.debug.verbose) {
            this.debugLog('CHECK_FOR_RESTORATION', 'No matching crit found in history', {
              msgId: normalizedMsgId,
              channelId: this.currentChannelId,
            });
          }
        }
      } else {
        this.debugLog(
          'CHECK_FOR_RESTORATION',
          '⚠️ Could not get message ID for restoration check',
          {
            channelId: this.currentChannelId,
          }
        );
      }
    }
  }

    checkExistingMessages() {
        // This method is no longer used - we only check NEW messages
        // to prevent applying crits to old messages
        // Keeping it for potential future use but not calling it
    }

  // ============================================================================
  // CRIT DETECTION & APPLICATION
  // ============================================================================

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
          verbose: true
        });

        // Validate message ID is correct (not channel ID)
        if (messageId && (!/^\d{17,19}$/.test(messageId) || messageId.length < 17)) {
          this.debugLog('CHECK_FOR_CRIT', 'WARNING: Invalid message ID extracted', {
            messageId,
            length: messageId?.length,
            elementId: messageElement.getAttribute('id'),
            note: 'This might be a channel ID instead of message ID'
          });
        }

        this.debugLog('CHECK_FOR_CRIT', 'Message detected for crit check', {
          messageId: messageId || 'unknown',
          hasElement: !!messageElement,
          elementValid: !!messageElement?.offsetParent,
          processedCount: this.processedMessages.size
        });

        // Skip if already processed (using message ID instead of element reference)
        if (messageId && this.processedMessages.has(messageId)) {
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
        // Mark as processed but don't apply crit (using message ID)
        if (messageId) {
          this.processedMessages.add(messageId);
        }
        this.debugLog('CHECK_FOR_CRIT', 'Message filtered out', { messageId });
            return;
        }

        // Verify it's actually a message (has some text content)
      const hasText =
        messageElement.textContent?.trim().length > 0 ||
                       messageElement.querySelector('[class*="content"]')?.textContent?.trim().length > 0 ||
                       messageElement.querySelector('[class*="text"]')?.textContent?.trim().length > 0;

        if (!hasText) {
            // Mark as processed even without text to avoid re-checking (using message ID)
            if (messageId) {
              this.processedMessages.add(messageId);
            }
        this.debugLog('CHECK_FOR_CRIT', 'Message has no text content', { messageId });
            return; // Not a real message
        }

      // Calculate effective crit chance (base + agility bonus, capped at 90%)
      const effectiveCritChance = this.getEffectiveCritChance();
        const roll = Math.random() * 100;

      this.debugLog('CHECK_FOR_CRIT', 'Checking for crit', {
        messageId,
        roll,
        baseCritChance: this.settings.critChance,
        effectiveCritChance,
        isCrit: roll <= effectiveCritChance,
      });

      this.debugLog('CHECK_FOR_CRIT', 'Checking for crit', {
        messageId,
        roll,
        baseCritChance: this.settings.critChance,
        effectiveCritChance: effectiveCritChance,
        isCrit: roll <= effectiveCritChance,
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

      if (roll <= effectiveCritChance) {
            // CRITICAL HIT!
        this.stats.totalCrits++;
        this.updateStats(); // Recalculate crit rate

        this.debugLog('CHECK_FOR_CRIT', '🔥🔥🔥 CRITICAL HIT DETECTED! 🔥🔥🔥', {
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
          this.debugLog('CHECK_FOR_CRIT', '🔄 Step 1: Applying crit style to message', {
            messageId: messageId,
            hasMessageElement: !!messageElement,
          });
            this.applyCritStyle(messageElement);
            this.critMessages.add(messageElement);
            // Mark as processed using message ID (not element reference)
            if (messageId) {
              this.processedMessages.add(messageId);
            }
          this.debugLog('CHECK_FOR_CRIT', '✅ Step 1 Complete: Crit style applied', {
            messageId: messageId,
            elementHasClass: messageElement.classList.contains('bd-crit-hit'),
            critMessagesSize: this.critMessages.size,
          });

          // Store in history with full info and save immediately
            if (messageId && this.currentChannelId) {
            try {
              this.debugLog('CHECK_FOR_CRIT', '🔄 Step 2: Saving crit to history', {
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

              // Force immediate save for crits
              this.debugLog('CHECK_FOR_CRIT', '🔄 Step 3: Triggering immediate storage save', {
                messageId: messageId,
                channelId: this.currentChannelId,
              });
              this.saveMessageHistory();

              // Verify it was saved
              const verifyLoad = BdApi.Data.load('CriticalHit', 'messageHistory');
              const verifyEntry = verifyLoad?.find(
                (e) =>
                  e.messageId === messageId && e.channelId === this.currentChannelId && e.isCrit
              );

              this.debugLog(
                'CHECK_FOR_CRIT',
                verifyEntry
                  ? '✅ CRITICAL: Crit saved and verified in storage'
                  : '⚠️ WARNING: Crit save verification failed',
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
              '⚠️ WARNING: Cannot save crit - missing messageId or channelId',
              {
                hasMessageId: !!messageId,
                hasChannelId: !!this.currentChannelId,
                messageId: messageId,
                channelId: this.currentChannelId,
              }
            );
            }

            // Optional: Play a sound or show notification
          try {
            this.onCritHit(messageElement);
          } catch (error) {
            this.debugError('CHECK_FOR_CRIT', error, { phase: 'on_crit_hit' });
          }
        } catch (error) {
          this.debugError('CHECK_FOR_CRIT', error, {
            phase: 'apply_crit',
            messageId: messageId,
            channelId: this.currentChannelId,
          });
        }
        } else {
            // Mark as processed even if not a crit (using message ID)
            if (messageId) {
              this.processedMessages.add(messageId);
            }

            // Store in history (non-crit) for tracking
            if (messageId && this.currentChannelId) {
          try {
                this.addToHistory({
                    messageId: messageId,
                    authorId: authorId, // Store author ID for filtering
                    channelId: this.currentChannelId,
                    timestamp: Date.now(),
                    isCrit: false,
                    messageContent: messageContent.substring(0, 200),
              author: author, // Author username for display
                });
          } catch (error) {
            this.debugError('CHECK_FOR_CRIT', error, { phase: 'save_non_crit_history' });
          }
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

    applyCritStyle(messageElement) {
    try {
      this.debugLog('APPLY_CRIT_STYLE', 'Applying crit style to message');

      // Find ONLY the message text content container - exclude username, timestamp, etc.
      // Apply gradient to the entire message text container as one unit

      this.debugLog('APPLY_CRIT_STYLE', 'Finding message content element', {
        messageElementClasses: Array.from(messageElement.classList || []),
      });

      // Helper function to check if element is in header/username/timestamp area
      const isInHeaderArea = (element) => {
        if (!element) return true;

        // Check if element contains username/timestamp elements as children
        const hasUsernameChild = element.querySelector('[class*="username"]') !== null;
        const hasTimestampChild = element.querySelector('[class*="timestamp"]') !== null;
        const hasAuthorChild = element.querySelector('[class*="author"]') !== null;

        if (hasUsernameChild || hasTimestampChild || hasAuthorChild) {
          this.debugLog('APPLY_CRIT_STYLE', 'Element contains username/timestamp/author child', {
            elementTag: element.tagName,
            hasUsernameChild,
            hasTimestampChild,
            hasAuthorChild,
            classes: Array.from(element.classList || []),
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
          this.debugLog('APPLY_CRIT_STYLE', 'Element is in header area', {
            elementTag: element.tagName,
            headerParentClasses: Array.from(headerParent.classList || []),
            headerParentTag: headerParent.tagName,
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
          this.debugLog('APPLY_CRIT_STYLE', 'Element has header class', {
            elementTag: element.tagName,
            classes: classes,
          });
          return true;
        }

        // Check if element's text content looks like a username or timestamp
        const text = element.textContent?.trim() || '';
        if (text.match(/^\d{1,2}:\d{2}$/) || text.length < 3) {
          // Looks like a timestamp or very short text (likely username)
          this.debugLog('APPLY_CRIT_STYLE', 'Element text looks like timestamp/username', {
            elementTag: element.tagName,
            text: text,
          });
          return true;
        }

        return false;
      };

      // Find message content - but ONLY if it's NOT in the header area
      let content = null;

      // Try messageContent first (most specific) - but exclude if it's in header area
      // Also check ALL messageContent elements and pick the one NOT in header
      const allMessageContents = messageElement.querySelectorAll('[class*="messageContent"]');
      this.debugLog('APPLY_CRIT_STYLE', 'Found messageContent elements', {
        count: allMessageContents.length,
      });

      for (const msgContent of allMessageContents) {
        if (!isInHeaderArea(msgContent)) {
          content = msgContent;
          this.debugLog('APPLY_CRIT_STYLE', 'Found messageContent (not in header)', {
            elementTag: content.tagName,
            classes: Array.from(content.classList || []),
            textPreview: content.textContent?.substring(0, 50),
          });
                    break;
        } else {
          this.debugLog('APPLY_CRIT_STYLE', 'messageContent rejected (in header)', {
            elementTag: msgContent.tagName,
            classes: Array.from(msgContent.classList || []),
          });
            }
        }

      // Try markup (Discord's text container) - but exclude if it's in header
      if (!content) {
        const markup = messageElement.querySelector('[class*="markup"]');
        if (markup) {
          if (!isInHeaderArea(markup)) {
            content = markup;
            this.debugLog('APPLY_CRIT_STYLE', 'Found markup', {
              elementTag: content.tagName,
              classes: Array.from(content.classList || []),
            });
          } else {
            this.debugLog('APPLY_CRIT_STYLE', 'markup rejected (in header)');
          }
        }
      }

      // Try textContainer
        if (!content) {
        const textContainer = messageElement.querySelector('[class*="textContainer"]');
        if (textContainer) {
          if (!isInHeaderArea(textContainer)) {
            content = textContainer;
            this.debugLog('APPLY_CRIT_STYLE', 'Found textContainer', {
              elementTag: content.tagName,
              classes: Array.from(content.classList || []),
            });
          } else {
            this.debugLog('APPLY_CRIT_STYLE', 'textContainer rejected (in header)');
        }
        }
      }

      // Last resort: find divs that are NOT in header areas
      if (!content) {
        const allDivs = messageElement.querySelectorAll('div');
        for (const div of allDivs) {
          if (!isInHeaderArea(div) && div.textContent && div.textContent.trim().length > 0) {
            content = div;
            this.debugLog('APPLY_CRIT_STYLE', 'Found div fallback', {
              elementTag: content.tagName,
              classes: Array.from(content.classList || []),
            });
            break;
          }
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

            for (const textEl of allTextElements) {
              // Skip if it's empty or just whitespace
              if (!textEl.textContent || textEl.textContent.trim().length === 0) continue;

              // Skip if it's in header area
              if (isInHeaderArea(textEl)) {
                this.debugLog('APPLY_CRIT_STYLE', 'Text element rejected (in header)', {
                  elementTag: textEl.tagName,
                  textPreview: textEl.textContent?.substring(0, 30),
                });
                continue;
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
                continue;
              }

              // Skip if it's a timestamp pattern
              if (textEl.textContent.trim().match(/^\d{1,2}:\d{2}$/)) {
                continue;
              }

              // Found a good text element - prefer spans over divs, and deeper elements
              if (
                !foundTextElement ||
                (textEl.tagName === 'SPAN' && foundTextElement.tagName !== 'SPAN') ||
                (textEl.children.length === 0 && foundTextElement.children.length > 0)
              ) {
                foundTextElement = textEl;
                this.debugLog(
                  'APPLY_CRIT_STYLE',
                  'Found specific text element within messageContent',
                  {
                    elementTag: foundTextElement.tagName,
                    classes: Array.from(foundTextElement.classList || []),
                    textPreview: foundTextElement.textContent?.substring(0, 50),
                    hasChildren: foundTextElement.children.length > 0,
                  }
                );
              }
            }

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
        if (this.settings.critAnimation) {
          content.style.animation = 'critPulse 0.5s ease-in-out';
          }
        }

        // Add a class for easier identification
        messageElement.classList.add('bd-crit-hit');

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

    injectCritCSS() {
        // Check if CSS is already injected
    if (document.getElementById('bd-crit-hit-styles')) {
            return;
        }

    // Pre-load Nova Flat font
    if (!document.getElementById('bd-crit-hit-nova-flat-font')) {
        const fontLink = document.createElement('link');
        fontLink.id = 'bd-crit-hit-nova-flat-font';
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Nova+Flat&display=swap';
        document.head.appendChild(fontLink);
    }

    // Force Nova Flat on all existing crit hit messages
    const forceNovaFlat = () => {
      const critMessages = document.querySelectorAll('.bd-crit-hit');
      critMessages.forEach((msg) => {
        // Apply to message itself
        msg.style.setProperty('font-family', "'Nova Flat', sans-serif", 'important');

        // Find all possible content elements
        const contentSelectors = [
          '[class*="messageContent"]',
          '[class*="markup"]',
          '[class*="textContainer"]',
          '[class*="content"]',
          '[class*="text"]',
          'span',
          'div',
          'p'
        ];

        contentSelectors.forEach((selector) => {
          const elements = msg.querySelectorAll(selector);
          elements.forEach((el) => {
            // Skip username/timestamp elements
            if (!el.closest('[class*="username"]') &&
                !el.closest('[class*="timestamp"]') &&
                !el.closest('[class*="author"]') &&
                !el.closest('[class*="header"]')) {
              el.style.setProperty('font-family', "'Nova Flat', sans-serif", 'important');
            }
          });
        });
      });
    };

    // Run immediately and set up observer to keep enforcing it
    forceNovaFlat();
    setInterval(forceNovaFlat, 1000); // Check every second to prevent reverts

    const style = document.createElement('style');
    style.id = 'bd-crit-hit-styles';
        style.textContent = `
            /* Import Nova Flat font for critical hits - gradient text font */
            @import url('https://fonts.googleapis.com/css2?family=Nova+Flat&display=swap');

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
            /* Red to Orange to Yellow gradient for fiery effect */
            .bd-crit-hit .bd-crit-text-content {
                background: linear-gradient(135deg, #ff4444 0%, #ff8800 25%, #ffaa00 50%, #ffcc00 75%, #ffff00 100%) !important;
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

    injectSettingsCSS() {
        // Check if settings CSS is already injected
    if (document.getElementById('bd-crit-hit-settings-styles')) {
            return;
        }

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

    onCritHit(messageElement) {
        // This method is called when a crit is detected
        // CriticalHitAnimation plugin hooks into this method to trigger animations
        // Particle burst effect (optional)
        try {
          this.createParticleBurst(messageElement);
        } catch (error) {
          this.debugError('ON_CRIT_HIT', error, { phase: 'particle_burst' });
        }

        // Optional: Show a toast notification
        // BdApi.showToast("💥 CRITICAL HIT!", { type: "info", timeout: 2000 });
    }

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

      for (let i = 0; i < particleCount; i++) {
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

    removeAllCrits() {
        // Remove all crit styling
    const critMessages = document.querySelectorAll('.bd-crit-hit');
        critMessages.forEach((msg) => {
      const content =
        msg.querySelector('[class*="messageContent"]') ||
                           msg.querySelector('[class*="content"]') ||
                           msg;
            if (content) {
        content.style.color = '';
        content.style.fontFamily = '';
        content.style.fontWeight = '';
        content.style.textShadow = '';
        content.style.animation = '';
            }
      msg.classList.remove('bd-crit-hit');
        });

        this.critMessages.clear();

        // Remove injected CSS
    const style = document.getElementById('bd-crit-hit-styles');
        if (style) {
            style.remove();
        }
    }

  // ============================================================================
  // SETTINGS PANEL UI
  // ============================================================================

    getSettingsPanel() {
        // Store reference to plugin instance for callbacks
        const plugin = this;

    // Update stats before showing panel
    this.updateStats();

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
                                const agilityData = BdApi.Data.load('SoloLevelingStats', 'agilityBonus');
                                if (agilityData && agilityData.bonus) {
                                  agilityBonus = agilityData.bonus * 100;
                                }
                                const luckData = BdApi.Data.load('SoloLevelingStats', 'luckBonus');
                                if (luckData && luckData.bonus) {
                                  luckBonus = luckData.bonus * 100;
                                }
                              } catch (e) {}

                              if (totalBonus > 0) {
                                const bonuses = [];
                                if (agilityBonus > 0) bonuses.push(`+${agilityBonus.toFixed(1)}% AGI`);
                                if (luckBonus > 0) bonuses.push(`+${luckBonus.toFixed(1)}% LUK`);
                                return `<span class="crit-agility-bonus" style="color: #8b5cf6; font-size: 0.9em; margin-left: 8px;">${bonuses.join(' + ')} = ${effectiveCrit.toFixed(1)}%</span>`;
                              }
                              return `<span class="crit-agility-bonus" style="color: #666; font-size: 0.9em; margin-left: 8px;">(Effective: ${effectiveCrit.toFixed(1)}%, max 90%)</span>`;
                            })()}
                        </label>
                        <div class="crit-form-description" style="margin-top: 8px;">
                            Base crit chance is fixed at 10%. Increase Agility stat to boost crit chance (capped at 90%).
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
                                value="${this.settings.critColor}"
                                class="crit-color-picker"
                            />
                            <div class="crit-color-preview" style="background-color: ${
                              this.settings.critColor
                            }"></div>
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
                            value="${this.settings.critFont}"
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
                        <h3 style="font-size: 16px; margin: 0;">History & Debug</h3>
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

                    <div class="crit-form-item crit-checkbox-group">
                        <label class="crit-checkbox-label">
                            <input
                                type="checkbox"
                                id="debug-mode"
                                ${this.settings.debugMode ? 'checked' : ''}
                                class="crit-checkbox"
                            />
                            <span class="crit-checkbox-custom"></span>
                            <span class="crit-checkbox-text">
                                Enable Debug Mode
                            </span>
                        </label>
                        <div class="crit-form-description">
                            Show detailed debug logs in console (useful for troubleshooting)
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
        const agilityData = BdApi.Data.load('SoloLevelingStats', 'agilityBonus');
        if (agilityData && agilityData.bonus) {
          agilityBonus = agilityData.bonus * 100;
        }
        const luckData = BdApi.Data.load('SoloLevelingStats', 'luckBonus');
        if (luckData && luckData.bonus) {
          luckBonus = luckData.bonus * 100;
        }
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
          bonusSpan.textContent = `(Effective: ${effectiveCrit.toFixed(1)}%, max 90%)`;
          bonusSpan.style.color = '#666';
        }
      }
    };

    // Update display periodically to reflect stat changes
    setInterval(() => {
      updateCritDisplay();
    }, 2000);

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

    retentionSlider.addEventListener('input', (e) => {
      retentionInput.value = e.target.value;
      plugin.settings.historyRetentionDays = parseInt(e.target.value);
      plugin.saveSettings();
      container.querySelector('.crit-label-value').textContent = `${e.target.value}`;
    });

    retentionInput.addEventListener('change', (e) => {
      retentionSlider.value = e.target.value;
      plugin.settings.historyRetentionDays = parseInt(e.target.value);
      plugin.saveSettings();
      container.querySelector('.crit-label-value').textContent = `${e.target.value}`;
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
      console.log(`CriticalHit: Debug mode ${e.target.checked ? 'enabled' : 'disabled'}`);
    });

        return container;
    }

  // ============================================================================
  // SETTINGS UPDATE METHODS
  // ============================================================================

  // Get effective crit chance (base + agility bonus + luck buffs, capped at 90%)
  getEffectiveCritChance() {
    let baseChance = this.settings.critChance || 10;

    // Get agility bonus from SoloLevelingStats
    try {
      const agilityData = BdApi.Data.load('SoloLevelingStats', 'agilityBonus');
      if (agilityData && agilityData.bonus) {
        // Agility bonus is stored as a decimal (e.g., 0.15 for 15%)
        const agilityBonusPercent = agilityData.bonus * 100;
        baseChance += agilityBonusPercent;
      }
    } catch (error) {
      // If SoloLevelingStats isn't available, just use base chance
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load agility bonus', { error: error.message });
    }

    // Get Luck buffs from SoloLevelingStats (stacked random buffs)
    try {
      const luckData = BdApi.Data.load('SoloLevelingStats', 'luckBonus');
      if (luckData && luckData.bonus) {
        // Luck bonus is stored as a decimal (e.g., 0.15 for 15%)
        const luckBonusPercent = luckData.bonus * 100;
        baseChance += luckBonusPercent;

        this.debugLog('GET_EFFECTIVE_CRIT', 'Luck buffs applied to crit chance', {
          luckBonusPercent: luckBonusPercent.toFixed(1),
          luckBuffs: luckData.luckBuffs || [],
          luckStat: luckData.luck || 0,
        });
      }
    } catch (error) {
      // If SoloLevelingStats isn't available, just use base chance
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load luck bonus', { error: error.message });
    }

    // Get skill tree crit bonus
    try {
      const skillBonuses = BdApi.Data.load('SkillTree', 'bonuses');
      if (skillBonuses && skillBonuses.critBonus > 0) {
        // Skill tree crit bonus is stored as decimal (e.g., 0.05 for 5%)
        const skillCritBonusPercent = skillBonuses.critBonus * 100;
        baseChance += skillCritBonusPercent;

        this.debugLog('GET_EFFECTIVE_CRIT', 'Skill tree crit bonus applied', {
          skillCritBonusPercent: skillCritBonusPercent.toFixed(1),
        });
      }
    } catch (error) {
      // SkillTree not available
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load skill tree bonuses', { error: error.message });
    }

    // Cap at 90% maximum
    return Math.min(90, Math.max(0, baseChance));
  }

    updateCritChance(value) {
    // Cap base crit chance at 90% (agility can't push it higher since we cap effective at 90%)
    this.settings.critChance = Math.max(0, Math.min(90, parseFloat(value) || 0));
        this.saveSettings();
        // Update label value in settings panel if it exists
    const labelValue = document.querySelector('.crit-label-value');
        if (labelValue) {
            labelValue.textContent = `${this.settings.critChance}%`;
        }
    const effectiveCrit = this.getEffectiveCritChance();
        try {
      if (BdApi && typeof BdApi.showToast === 'function') {
        const totalBonus = effectiveCrit - this.settings.critChance;

        // Get individual bonuses for toast
        let agilityBonus = 0;
        let luckBonus = 0;
        try {
          const agilityData = BdApi.Data.load('SoloLevelingStats', 'agilityBonus');
          if (agilityData && agilityData.bonus) {
            agilityBonus = agilityData.bonus * 100;
          }
          const luckData = BdApi.Data.load('SoloLevelingStats', 'luckBonus');
          if (luckData && luckData.bonus) {
            luckBonus = luckData.bonus * 100;
          }
        } catch (e) {}

        let toastMessage = `Crit chance set to ${this.settings.critChance}%`;
        if (totalBonus > 0) {
          const bonuses = [];
          if (agilityBonus > 0) bonuses.push(`+${agilityBonus.toFixed(1)}% AGI`);
          if (luckBonus > 0) bonuses.push(`+${luckBonus.toFixed(1)}% LUK`);
          toastMessage = `Crit: ${this.settings.critChance}% base (${bonuses.join(' + ')}) = ${effectiveCrit.toFixed(1)}%`;
        }

        BdApi.showToast(toastMessage, {
          type: 'info',
          timeout: 2000,
        });
      }
        } catch (error) {
      console.log('CriticalHit: Toast failed', error);
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
        for (const div of allDivs) {
          if (!isInHeaderArea(div) && div.textContent && div.textContent.trim().length > 0) {
            content = div;
            this.debugLog('UPDATE_EXISTING_CRITS', 'Found div fallback', {
              elementTag: content.tagName,
              classes: Array.from(content.classList || []),
            });
            break;
          }
        }
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
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (!this.critMessages.has(lastMessage)) {
                this.applyCritStyle(lastMessage);
                this.critMessages.add(lastMessage);
                try {
          if (BdApi && typeof BdApi.showToast === 'function') {
            BdApi.showToast('💥 Test Critical Hit Applied!', { type: 'success', timeout: 2000 });
          }
                } catch (error) {
          console.log('CriticalHit: Test crit applied (toast failed)', error);
                }
            } else {
                try {
          if (BdApi && typeof BdApi.showToast === 'function') {
            BdApi.showToast('Message already has crit!', { type: 'info', timeout: 2000 });
          }
                } catch (error) {
          console.log('CriticalHit: Message already has crit');
                }
            }
        } else {
            try {
        if (BdApi && typeof BdApi.showToast === 'function') {
          BdApi.showToast('No messages found to test', { type: 'error', timeout: 2000 });
        }
            } catch (error) {
        console.log('CriticalHit: No messages found to test');
            }
        }
    }
};
