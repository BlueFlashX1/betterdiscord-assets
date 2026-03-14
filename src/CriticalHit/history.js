/**
 * CriticalHit — Message history management methods.
 * History storage, trimming, saving, loading, crit restoration,
 * cleanup, LRU management, and statistics.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');

module.exports = {
  /** Smart history trimming — keeps crits over non-crits, enforces per-channel limits. */
  _trimHistoryIfNeeded() {
    if (this.messageHistory.length <= this.maxHistorySize) {
      this._trimPerChannelHistory();
      return;
    }

    const crits = this.messageHistory.filter((entry) => entry.isCrit);
    const nonCrits = this.messageHistory.filter((entry) => !entry.isCrit);
    const critsToKeep = crits.slice(-Math.min(crits.length, this.maxCritHistory));
    const remainingSlots = this.maxHistorySize - critsToKeep.length;
    const nonCritsToKeep = nonCrits.slice(-Math.max(0, remainingSlots));

    this.messageHistory = [...critsToKeep, ...nonCritsToKeep]
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-this.maxHistorySize);

    this._cachedCritHistory = null;
    this._rebuildHistoryMap();
    this._trimPerChannelHistory();
  },

  _groupHistoryByChannel() {
    return this.messageHistory.reduce((acc, entry, index) => {
      const channelId = entry.channelId || 'unknown';
      acc[channelId] = acc[channelId] || [];
      acc[channelId].push({ entry, index });
      return acc;
    }, {});
  },

  _trimPerChannelHistory() {
    const channelMessages = this._groupHistoryByChannel();

    // Collect indices across all over-limit channels, splice in descending order
    // to prevent stale-index corruption
    const allIndicesToRemove = [];
    Object.entries(channelMessages)
      .filter(([, messages]) => messages.length > this.maxHistoryPerChannel)
      .forEach(([, messages]) => {
        const excess = messages.length - this.maxHistoryPerChannel;
        const toRemove = messages
          .sort((a, b) => (a.entry.timestamp || 0) - (b.entry.timestamp || 0))
          .slice(0, excess);
        toRemove.forEach(({ index }) => allIndicesToRemove.push(index));
      });

    allIndicesToRemove.sort((a, b) => b - a).forEach(i => this.messageHistory.splice(i, 1));

    this._cachedCritHistory = null;
    this._rebuildHistoryMap();
  },

  _rebuildHistoryMap() {
    this._historyMap.clear();
    this.messageHistory.forEach((entry) => {
      if (entry.messageId) {
        this._historyMap.set(entry.messageId, entry);
      }
    });
  },

  _countCritsByChannel(critHistory) {
    return critHistory.reduce((acc, entry) => {
      const channelId = entry.channelId || 'unknown';
      acc[channelId] = (acc[channelId] || 0) + 1;
      return acc;
    }, {});
  },

  _throttledSaveHistory(isCrit = false) {
    const now = Date.now();
    const timeSinceLastSave = now - this._lastSaveTime;

    if (this._saveHistoryPending) {
      if (isCrit) this._pendingCritSaves++;
      return;
    }

    const shouldForceSave = timeSinceLastSave >= this._maxSaveInterval;

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

    this._saveHistoryPending = false;
    this._pendingCritSaves = 0;
    this.saveMessageHistory();
    this._lastSaveTime = now;
  },

  /** Saves message history to storage. Prefer _throttledSaveHistory() over direct calls. */
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

      this._trimHistoryIfNeeded();

      // Strip messageContent/author before saving — never needed for restoration or stats
      const leanHistory = this.messageHistory.map((entry) => {
        if (!entry.messageContent && !entry.author) return entry;
        const { messageContent, author, ...lean } = entry;
        return lean;
      });

      BdApi.Data.save('CriticalHit', 'messageHistory', leanHistory);

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
        // Migration: strip legacy bloat fields and enforce current maxHistorySize
        let migrated = false;
        this.messageHistory = saved.map((entry) => {
          if (entry.messageContent || entry.author) {
            migrated = true;
            const { messageContent, author, ...lean } = entry;
            return lean;
          }
          return entry;
        });

        if (this.messageHistory.length > this.maxHistorySize) {
          this._trimHistoryIfNeeded();
          migrated = true;
        }

        if (migrated) {
          BdApi.Data.save('CriticalHit', 'messageHistory', this.messageHistory);
        }

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

  normalizeMessageData(messageData) {
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

  updatePendingCritsQueue(messageId, isHashId, historyEntry, messageData, channelId) {
    if (!historyEntry?.critSettings || !messageId || !messageData?.messageContent) return;

    const now = Date.now();

    if (this.pendingCrits.size >= this.maxPendingCrits) {
      const sortedEntries = Array.from(this.pendingCrits.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );
      const toRemove = Math.floor(this.maxPendingCrits * 0.3);
      sortedEntries.slice(0, toRemove).forEach(([id]) => this.pendingCrits.delete(id));
    }

    const maxAge = isHashId ? C.PENDING_HASH_ID_MAX_AGE : C.PENDING_REGULAR_ID_MAX_AGE;
    Array.from(this.pendingCrits.entries()).forEach(([pendingId, pendingData]) => {
      now - pendingData.timestamp > maxAge && this.pendingCrits.delete(pendingId);
    });

    const contentHash = this.calculateContentHash(
      messageData.author,
      messageData.messageContent,
      messageData.timestamp
    );

    const pendingEntry = {
      critSettings: historyEntry.critSettings,
      timestamp: now,
      channelId: channelId,
      messageContent: messageData.messageContent,
      author: messageData.author,
      contentHash: contentHash,
      isHashId: isHashId,
    };

    this.pendingCrits.set(messageId, pendingEntry);

    // Also index by content hash so hash→real ID transitions can match
    contentHash && isHashId && this.pendingCrits.set(contentHash, pendingEntry);
  },

  _findHistoryEntryById(messageId, channelId) {
    return this.messageHistory.findIndex(
      (entry) => entry.messageId === messageId && entry.channelId === channelId
    );
  },

  _findHistoryEntryByContentHash(channelId, guildId, contentHash) {
    return this.messageHistory.findIndex((entry) => {
      if (entry.channelId !== channelId) return false;
      if ((entry.guildId || 'dm') !== guildId) return false;
      if (String(entry.messageId).startsWith('hash_')) return false;
      return (
        entry.messageContent &&
        entry.author &&
        this.calculateContentHash(entry.author, entry.messageContent, entry.timestamp) ===
          contentHash
      );
    });
  },

  findExistingHistoryEntry(messageId, channelId, isValidDiscordId, isHashId, messageData) {
    let existingIndex = this._findHistoryEntryById(messageId, channelId);

    // Content-based fallback handles messages that were "undone" and retyped with a new ID
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

  addToHistory(messageData) {
    try {
      const isCrit = messageData.isCrit || false;

      const { messageId, authorId, channelId } = this.normalizeMessageData(messageData);

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

      // LEAN schema: messageContent/author stripped (never used for restoration/stats; caused 80%+ config bloat)
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

      if (isCrit) {
        this._cachedCritHistory = null;
        this._cachedCritHistoryTimestamp = null;
      }

      const isValidId = this.isValidDiscordId(messageId);
      const isHashId = messageId?.startsWith('hash_');

      isCrit &&
        this.updatePendingCritsQueue(messageId, isHashId, historyEntry, messageData, channelId);

      const existingIndex = this.findExistingHistoryEntry(
        messageId,
        channelId,
        isValidId,
        isHashId,
        messageData
      );

      if (existingIndex >= 0) {
        const existingEntry = this.messageHistory[existingIndex];
        const wasCrit = existingEntry.isCrit;
        const existingId = existingEntry.messageId;
        const existingIsHashId = String(existingId).startsWith('hash_');
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

        // INTEGRITY: Never downgrade crit→non-crit; deterministic outcomes must be stable.
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
        const isHashIdNew = messageData.messageId?.startsWith('hash_');

        // Hash IDs = unsent/pending messages; skip to avoid polluting history
        if (isHashIdNew) {
          this.debugLog('ADD_TO_HISTORY', 'Skipping hash ID (unsent/pending message)', {
            messageId: messageData.messageId,
            isCrit,
          });
          return;
        }

        this.messageHistory.push(historyEntry);
        if (historyEntry.messageId) {
          this._historyMap.set(historyEntry.messageId, historyEntry);
        }

        this._trimHistoryIfNeeded();

        isCrit && (this._cachedCritHistory = null);
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

  getCritHistory(channelId = null) {
    const now = Date.now();
    const cacheKey = channelId || 'all';

    const isCacheValid =
      this._cachedCritHistory &&
      this._cachedCritHistoryTimestamp &&
      now - this._cachedCritHistoryTimestamp < this._cachedCritHistoryMaxAge &&
      this._cachedCritHistory.channelId === cacheKey;

    if (isCacheValid) return this._cachedCritHistory.data;

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

    this._cachedCritHistory = { data: crits, channelId: cacheKey };
    this._cachedCritHistoryTimestamp = now;

    return crits;
  },

  /**
   * Restores crit styles for the current channel.
   * PERF: O(1) targeted lookup via data-message-id rather than scanning all DOM nodes.
   */
  restoreChannelCrits(channelId, retryCount = 0) {
    if (this._isStopped) return;

    const targetChannelId = channelId || this.currentChannelId || this._getCurrentChannelId();
    if (!targetChannelId) {
      this.debugLog('RESTORE_CHANNEL_CRITS', 'ERROR: No channel ID resolved for restoration');
      return;
    }

    const channelCrits = this.getCritHistory(targetChannelId);
    if (!channelCrits.length) return;

    this.debugLog('RESTORE_CHANNEL_CRITS', `Restoring ${channelCrits.length} crits (Targeted Lookup)`, {
      channelId: targetChannelId,
      retryCount,
    });

    const CHUNK_SIZE = 50; // Process in chunks to prevent frame drops on large history

    const processChunk = (startIndex) => {
      if (this._isStopped) return;
      // Abort if channel changed since starting (unless it's a specific channelId request)
      if (channelId && this.currentChannelId !== targetChannelId) return;

      const limit = Math.min(channelCrits.length, startIndex + CHUNK_SIZE);
      let restoredInChunk = 0;

      for (let i = startIndex; i < limit; i++) {
        const crit = channelCrits[i];
        if (!crit || !crit.messageId) continue;

        const normalizedId = this.normalizeId(crit.messageId);
        const messageElement = document.querySelector(`[data-message-id="${normalizedId}"]`);

        if (messageElement) {
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

    requestIdleCallback(() => processChunk(0), { timeout: 1000 });
  },

};
