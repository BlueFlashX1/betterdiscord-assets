/**
 * CriticalHit — Message history management methods.
 * History storage, trimming, saving, loading, crit restoration,
 * cleanup, LRU management, and statistics.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');

module.exports = {
  // --------------------------------------------------------------------------
  // History Trimming
  // --------------------------------------------------------------------------

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

    // Invalidate cache and rebuild map
    this._cachedCritHistory = null;
    this._rebuildHistoryMap();
    this._trimPerChannelHistory();
  },

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
  },

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

    // Invalidate cache and rebuild map
    this._cachedCritHistory = null;
    this._rebuildHistoryMap();
  },

  /**
   * Rebuilds the O(1) history map from the current messageHistory array
   */
  _rebuildHistoryMap() {
    this._historyMap.clear();
    this.messageHistory.forEach((entry) => {
      if (entry.messageId) {
        this._historyMap.set(entry.messageId, entry);
      }
    });
  },

  // --------------------------------------------------------------------------
  // History Saving & Loading
  // --------------------------------------------------------------------------

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
  },

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
      this._saveHistoryThrottle = this._setTrackedTimeout(() => {
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
  },

  /**
   * Saves message history to BetterDiscord storage
   * Includes all processed messages with crit status and settings
   * OPTIMIZED: Use _throttledSaveHistory() instead of calling this directly
   */
  saveMessageHistory() {
    try {
      const critHistory = this.getCritHistory();
      const critCount = critHistory.length;
      const critsByChannel = this._countCritsByChannel(critHistory);

      this.debugLog('SAVE_MESSAGE_HISTORY', 'CRITICAL: Saving message history to storage', {
        historySize: this.messageHistory.length,
        critCount: critCount,
        critsByChannel: critsByChannel,
        maxSize: this.maxHistorySize,
      });

      // OPTIMIZED: Smart history trimming with crit prioritization
      this._trimHistoryIfNeeded();

      // OPTIMIZED: Strip bloat fields before saving to prevent config growth
      // messageContent and author are never needed for restoration or stats
      const leanHistory = this.messageHistory.map((entry) => {
        if (!entry.messageContent && !entry.author) return entry; // Already lean
        const { messageContent, author, ...lean } = entry;
        return lean;
      });

      // Save lean history to BetterDiscord Data storage
      // Note: BdApi.Data.save() is synchronous and can block, but we've throttled calls
      BdApi.Data.save('CriticalHit', 'messageHistory', leanHistory);

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
  },

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
        // Migration: strip bloat fields (messageContent, author) from legacy entries
        // and enforce current maxHistorySize to prevent oversized configs from persisting
        let migrated = false;
        this.messageHistory = saved.map((entry) => {
          if (entry.messageContent || entry.author) {
            migrated = true;
            const { messageContent, author, ...lean } = entry;
            return lean;
          }
          return entry;
        });

        // Enforce max history size on load (handles configs saved with old higher limits)
        if (this.messageHistory.length > this.maxHistorySize) {
          this._trimHistoryIfNeeded();
          migrated = true;
        }

        // If migration occurred, save the cleaned history immediately
        if (migrated) {
          BdApi.Data.save('CriticalHit', 'messageHistory', this.messageHistory);
        }

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

        // Populate O(1) history map
      this._historyMap.clear();
      if (Array.isArray(this.messageHistory)) {
        this.messageHistory.forEach((entry) => {
          if (entry.messageId) {
            this._historyMap.set(entry.messageId, entry);
          }
        });
      }

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
        this.debugLog(
          'LOAD_MESSAGE_HISTORY',
          `Loaded ${
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
  },

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
  },

  // --------------------------------------------------------------------------
  // Pending Crits Queue Management
  // --------------------------------------------------------------------------

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
    const maxAge = isHashId ? C.PENDING_HASH_ID_MAX_AGE : C.PENDING_REGULAR_ID_MAX_AGE;
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
  },

  // --------------------------------------------------------------------------
  // History Entry Management
  // --------------------------------------------------------------------------

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
  },

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
  },

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
  },

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

      // Add message to history with LEAN schema — only fields needed for restoration + stats
      // Stripped: messageContent, author (never used for restoration or stats, caused 80%+ config bloat)
      const historyEntry = {
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
      };
      if (isCrit) {
        this.diagLog('HISTORY_CRIT_SETTINGS', 'Persisting crit settings to history', {
          messageId: historyEntry.messageId,
          color: historyEntry.critSettings?.color || null,
          gradient: historyEntry.critSettings?.gradient,
          font: historyEntry.critSettings?.font || null,
        });
      }

      // Invalidate crit history cache before adding to history
      // This ensures restoration checks immediately see the new crit
      if (isCrit) {
        this._cachedCritHistory = null;
        this._cachedCritHistoryTimestamp = null;
      }

      // Check if message already exists in history (update if exists)
      const isValidId = this.isValidDiscordId(messageId);
      const isHashId = messageId?.startsWith('hash_');

      // Add to pending queue immediately for crits to handle race condition
      // This allows restoration to find crits even before they're added to history
      isCrit &&
        this.updatePendingCritsQueue(messageId, isHashId, historyEntry, messageData, channelId);

      // Find existing entry by ID or content hash
      const existingIndex = this.findExistingHistoryEntry(
        messageId,
        channelId,
        isValidId,
        isHashId,
        messageData
      );

      if (existingIndex >= 0) {
        // Update existing entry
        const existingEntry = this.messageHistory[existingIndex];
        const wasCrit = existingEntry.isCrit;
        const existingId = existingEntry.messageId;
        const existingIsHashId = String(existingId).startsWith('hash_'); // If updating from hash ID to valid Discord ID, this is a message being sent
        // Keep the crit status but update with the real Discord ID
        existingIsHashId &&
          isValidId &&
          wasCrit &&
          isCrit &&
          this.debugLog('ADD_TO_HISTORY', 'Updating hash ID to Discord ID for sent message', {
            oldId: existingId,
            newId: messageData.messageId,
            wasCrit,
            nowCrit: isCrit,
          });

        // Safety: deterministic crit outcome should never downgrade from crit->non-crit.
        // Prevent transient re-processing from stripping already-applied crit styling.
        const shouldPreserveCrit = wasCrit && !isCrit;
        this.messageHistory[existingIndex] = shouldPreserveCrit
          ? {
              ...historyEntry,
              isCrit: true,
              critSettings: existingEntry.critSettings || historyEntry.critSettings,
            }
          : historyEntry;
        if (historyEntry.messageId) {
          this._historyMap.set(historyEntry.messageId, this.messageHistory[existingIndex]);
        }
        this.debug?.verbose &&
          this.debugLog('ADD_TO_HISTORY', 'Updated existing history entry', {
            index: existingIndex,
            wasCrit: wasCrit,
            nowCrit: this.messageHistory[existingIndex].isCrit,
            messageId: messageData.messageId,
            authorId: messageData.authorId,
            preservedCrit: shouldPreserveCrit,
          });
      } else {
        // Add new entry
        const isHashIdNew = messageData.messageId?.startsWith('hash_');

        // Only add to history if message has valid Discord ID (actually sent)
        // Hash IDs are for unsent/pending messages that might be "undone" - don't add to history
        if (isHashIdNew) {
          this.debugLog('ADD_TO_HISTORY', 'Skipping hash ID (unsent/pending message)', {
            messageId: messageData.messageId,
            isCrit,
            note: 'Hash IDs are created for messages without Discord IDs - these are likely unsent/pending messages that should not be stored in history',
          });
          return; // Don't add hash IDs to history
        }

        this.messageHistory.push(historyEntry);
        if (historyEntry.messageId) {
          this._historyMap.set(historyEntry.messageId, historyEntry);
        }

        // OPTIMIZED: Smart history trimming with crit prioritization
        this._trimHistoryIfNeeded();

        // Invalidate caches when history is modified
        isCrit && (this._cachedCritHistory = null);
        // Invalidate stats cache since history changed
        this._cache.stats = null;
        this._cache.statsTime = 0;
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
  },

  // --------------------------------------------------------------------------
  // History Retrieval
  // --------------------------------------------------------------------------

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

    // Filter crits: only crit messages, optionally filtered by channel.
    // USER-ONLY: never restore crits from other users (prevents stale foreign reapply).
    let ownUserId = this.currentUserId || this.settings?.ownUserId || null;
    if (!ownUserId && typeof this.getCurrentUserId === 'function') {
      this.getCurrentUserId();
      ownUserId = this.currentUserId || this.settings?.ownUserId || null;
    }
    const crits = this.messageHistory.filter((entry) => {
      if (!entry?.isCrit) return false;
      if (channelId && entry.channelId !== channelId) return false;
      if (!ownUserId) return true;
      return !!entry.authorId && String(entry.authorId) === String(ownUserId);
    });

    // Cache result
    this._cachedCritHistory = { data: crits, channelId: cacheKey };
    this._cachedCritHistoryTimestamp = now;

    return crits;
  },

  // --------------------------------------------------------------------------
  // Crit Restoration
  // --------------------------------------------------------------------------

  /**
   * Restores critical hit styles for messages in the current channel
   * OPTIMIZED: Uses O(1) targeted lookup via data-message-id rather than scanning all DOM nodes.
   * @param {string} channelId - The channel ID to restore
   * @param {number} retryCount - Retry attempt number
   */
  restoreChannelCrits(channelId, retryCount = 0) {
    if (this._isStopped) return;

    // Normalize channel ID and validate
    const targetChannelId = channelId || this.currentChannelId || this._getCurrentChannelId();
    if (!targetChannelId) {
      this.debugLog('RESTORE_CHANNEL_CRITS', 'ERROR: No channel ID resolved for restoration');
      return;
    }

    // Filter history for current channel - usually a small number (< 50)
    const channelCrits = this.getCritHistory(targetChannelId);
    if (!channelCrits.length) return;

    this.debugLog('RESTORE_CHANNEL_CRITS', `Restoring ${channelCrits.length} crits (Targeted Lookup)`, {
      channelId: targetChannelId,
      retryCount,
    });

    // Process in chunks to ensure zero frame drops, even if history is large
    const CHUNK_SIZE = 50;

    const processChunk = (startIndex) => {
      if (this._isStopped) return;
      // Abort if channel changed since starting (unless it's a specific channelId request)
      if (channelId && this.currentChannelId !== targetChannelId) return;

      const limit = Math.min(channelCrits.length, startIndex + CHUNK_SIZE);
      let restoredInChunk = 0;

      for (let i = startIndex; i < limit; i++) {
        const crit = channelCrits[i];
        if (!crit || !crit.messageId) continue;

        // O(1) TARGETED LOOKUP
        // Query directly for the message element by its ID
        const normalizedId = this.normalizeId(crit.messageId);
        const messageElement = document.querySelector(`[data-message-id="${normalizedId}"]`);

        if (messageElement) {
          // Bypass repeated ID extraction by passing known ID
          this.restoreSingleCrit(messageElement, crit, normalizedId, retryCount);
          restoredInChunk++;
        }
      }

      if (limit < channelCrits.length) {
        requestIdleCallback(() => processChunk(limit), { timeout: 1000 });
      } else {
        this.debugLog('RESTORE_COMPLETE', 'Targeted restoration complete', { total: channelCrits.length });
      }
    };

    // Schedule async processing
    requestIdleCallback(() => processChunk(0), { timeout: 1000 });
  },

  // --------------------------------------------------------------------------
  // Cleanup & Memory Management
  // --------------------------------------------------------------------------

  /**
   * Calculates excess messages to remove for LRU cleanup
   * @returns {number} Number of messages to remove
   */
  _calculateExcessProcessedMessages() {
    return this.processedMessages.size > this.maxProcessedMessages
      ? this.processedMessages.size - this.maxProcessedMessages
      : 0;
  },

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
  },

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
  },

  /**
   * Clears session tracking data (preserves history for restoration)
   * Used when switching channels or restarting
   */
  clearSessionTracking() {
    this.critMessages.clear();
    this.processedMessages.clear();
    this.processedMessagesOrder = [];
  },

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
  },

  // --------------------------------------------------------------------------
  // Periodic Cleanup
  // --------------------------------------------------------------------------

  /**
   * Executes periodic cleanup tasks
   */
  _executePeriodicCleanup() {
    try {
      this.debugLog('PERIODIC_CLEANUP', 'Running periodic history cleanup');
      const retentionDays =
        this.settings.historyRetentionDays || C.DEFAULT_HISTORY_RETENTION_DAYS;
      this.settings.autoCleanupHistory && this.cleanupOldHistory(retentionDays);
      this.cleanupProcessedMessages();
    } catch (error) {
      this.debugError('PERIODIC_CLEANUP', error);
    }
  },

  /**
   * Start periodic history cleanup (runs every 30 minutes)
   */
  startPeriodicCleanup() {
    // Clear any existing interval
    this.historyCleanupInterval &&
      (this._trackedIntervals.delete(this.historyCleanupInterval),
      clearInterval(this.historyCleanupInterval),
      (this.historyCleanupInterval = null));

    // Run cleanup at configured interval
    this.historyCleanupInterval = this._setTrackedInterval(
      () => this._executePeriodicCleanup(),
      C.PERIODIC_CLEANUP_INTERVAL_MS
    );

    this.debugLog('PERIODIC_CLEANUP', 'Started periodic cleanup interval', {
      intervalMinutes: C.PERIODIC_CLEANUP_INTERVAL_MS / (60 * 1000),
    });
  },

  // --------------------------------------------------------------------------
  // History Cleanup
  // --------------------------------------------------------------------------

  /**
   * Calculates cutoff timestamp for history cleanup
   * @param {number} daysToKeep - Number of days to keep
   * @returns {number} Cutoff timestamp in milliseconds
   */
  _calculateHistoryCutoffTime(daysToKeep) {
    return Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  },

  /**
   * Filters history entries by cutoff time
   * @param {number} cutoffTime - Cutoff timestamp
   * @returns {Array} Filtered history entries
   */
  _filterHistoryByCutoff(cutoffTime) {
    return this.messageHistory.filter((entry) => entry.timestamp > cutoffTime);
  },

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
  },

  /**
   * Removes history entries older than specified days
   * @param {number} daysToKeep - Number of days to keep (default: 30)
   */
  cleanupOldHistory(daysToKeep = C.DEFAULT_HISTORY_RETENTION_DAYS) {
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
      this.debugLog(
        'CLEANUP_HISTORY',
        `Cleaned up ${removed} old history entries (${removedCrits} crits)`
      );
      this._throttledSaveHistory(false);
      this.updateStats();
    }
  },

  // --------------------------------------------------------------------------
  // Statistics Management
  // --------------------------------------------------------------------------

  /**
   * Calculates crit rate from history
   * @param {number} totalCrits - Total crit count
   * @param {number} totalMessages - Total message count
   * @returns {number} Crit rate percentage
   */
  _calculateCritRate(totalCrits, totalMessages) {
    return totalMessages > 0 ? (totalCrits / totalMessages) * 100 : 0;
  },

  /**
   * Updates statistics from message history
   */
  updateStats() {
    // Check cache first
    const now = Date.now();
    if (
      this._cache.stats &&
      this._cache.statsTime &&
      now - this._cache.statsTime < this._cache.statsTTL
    ) {
      // Update stats object with cached values
      this.stats = { ...this._cache.stats };
      return;
    }

    const totalCrits = this.getCritHistory().length;
    const totalMessages = this.messageHistory.length;
    const critRate = this._calculateCritRate(totalCrits, totalMessages);

    const stats = {
      totalCrits,
      totalMessages,
      critRate,
      lastUpdated: now,
    };

    // Update stats and cache
    this.stats = stats;
    this._cache.stats = stats;
    this._cache.statsTime = now;
  },
};
