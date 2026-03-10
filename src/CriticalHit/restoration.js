/**
 * CriticalHit — Message restoration helpers.
 * Handles restoration of crit styling from history and pending queue.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');

module.exports = {
  // ----------------------------------------------------------------------------
  // Core Restoration
  // ----------------------------------------------------------------------------

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
    this.diagLog('STYLE_RESTORED', 'Restored crit style from history', {
      messageId: normalizedMsgId,
      mode:
        historyEntry?.critSettings?.gradient !== undefined
          ? historyEntry.critSettings.gradient
            ? 'gradient'
            : 'solid'
          : this.settings?.critGradient !== false
          ? 'gradient'
          : 'solid',
      color: historyEntry?.critSettings?.color || this.settings?.critColor || null,
    });
  },

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
  },

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
  },

  // ----------------------------------------------------------------------------
  // Restoration Throttling
  // ----------------------------------------------------------------------------

  /**
   * Cleans up old throttle entries
   * @param {number} now - Current timestamp
   */
  _cleanupThrottleEntries(now) {
    if (this._restorationCheckThrottle.size <= C.MAX_THROTTLE_MAP_SIZE) return;

    Array.from(this._restorationCheckThrottle.entries())
      .filter(([, checkTime]) => now - checkTime > C.THROTTLE_ENTRY_MAX_AGE_MS)
      .forEach(([id]) => this._restorationCheckThrottle.delete(id));
  },

  /**
   * Checks if restoration should be throttled for a message ID
   * @param {string} normalizedId - Normalized message ID
   * @returns {boolean} True if should skip (throttled)
   */
  shouldThrottleRestorationCheck(normalizedId) {
    if (!normalizedId || normalizedId.startsWith('hash_')) return false;

    const lastCheck = this._restorationCheckThrottle.get(normalizedId);
    const now = Date.now();

    if (lastCheck && now - lastCheck < C.RESTORATION_CHECK_THROTTLE_MS) {
      return true;
    }

    this._restorationCheckThrottle.set(normalizedId, now);
    this._cleanupThrottleEntries(now);

    return false;
  },

  // ----------------------------------------------------------------------------
  // Content Hash Matching
  // ----------------------------------------------------------------------------

  /**
   * Creates a simple hash from content string (for content-based matching)
   * @param {string} content - Content string to hash
   * @returns {string} Hash string
   */
  _createSimpleContentHash(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash |= 0;
    }
    return `hash_${Math.abs(hash)}`;
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  // ----------------------------------------------------------------------------
  // Visual State Checks
  // ----------------------------------------------------------------------------

  /**
   * Determines whether a crit message needs restoration.
   * v3.4.0: Per-message CSS handles styling — only check class + CSS rule presence.
   * @param {HTMLElement} messageElement - Message wrapper element
   * @param {Object|null} critSettings - Saved crit settings (optional)
   * @returns {boolean} True when restoration should run
   */
  shouldRestoreCritVisuals(messageElement, critSettings = null) {
    if (!messageElement) return false;

    const messageId = this.getMessageIdentifier(messageElement);

    // Check if bd-crit-hit class is present (needed for animation positioning)
    if (!messageElement.classList?.contains('bd-crit-hit')) {
      return true;
    }

    // Check if per-message CSS rule exists for this message
    if (messageId && !messageId.startsWith('hash_') && !this.critCSSRules.has(messageId)) {
      return true;
    }

    return false;
  },

  _hasCritEvidenceForMessage(messageElement, messageId) {
    if (!messageElement) return false;

    const channelId = this.currentChannelId || this._getCurrentChannelId?.();
    if (!channelId) return false;

    const extractedMessageId =
      this.normalizeId(messageId) ||
      this.extractPureDiscordId(messageId) ||
      this.normalizeId(this.getMessageIdentifier(messageElement));
    const normalizedMessageId = extractedMessageId || null;
    const pureMessageId = this.extractPureDiscordId(normalizedMessageId) || normalizedMessageId;

    if (
      normalizedMessageId &&
      (this.pendingCrits.has(normalizedMessageId) ||
        this.pendingCrits.has(pureMessageId) ||
        this._processingCrits.has(normalizedMessageId))
    ) {
      return true;
    }

    const channelCrits = this.getCritHistory(channelId);
    if (normalizedMessageId) {
      const hasIdMatch = channelCrits.some((entry) => {
        const entryId = this.normalizeId(entry.messageId) || this.extractPureDiscordId(entry.messageId);
        return !!entryId && (entryId === normalizedMessageId || entryId === pureMessageId);
      });
      if (hasIdMatch) return true;
    }

    const content = this.findMessageContentElement(messageElement);
    const authorId = this.getAuthorId(messageElement);
    const authorName =
      messageElement.querySelector?.('[id^="message-username-"]')?.textContent?.trim() ||
      messageElement.querySelector?.('[class*="username"]')?.textContent?.trim() ||
      messageElement.querySelector?.('[class*="author"]')?.textContent?.trim() ||
      null;
    const contentText = content?.textContent?.trim();
    if (!contentText) return false;

    const contentHashes = new Set();
    const addHash = (authorValue, contentValue) => {
      const hash = this.calculateContentHash(authorValue, contentValue);
      hash && contentHashes.add(hash);
    };

    [authorId, authorName, null].forEach((authorValue) => addHash(authorValue, contentText));
    const compactContentText = contentText.slice(0, 200);
    compactContentText !== contentText &&
      [authorId, authorName, null].forEach((authorValue) => addHash(authorValue, compactContentText));

    for (const hash of contentHashes) {
      if (this.pendingCrits.has(hash)) return true;
    }

    return channelCrits.some((entry) => {
      if (!entry?.messageContent) return false;

      const entryContent = String(entry.messageContent).trim();
      if (!entryContent) return false;

      const entryAuthors = [entry.authorId, entry.author, null];

      // Compare both full content and trimmed 200-char variant since history stores a truncated preview.
      for (const entryAuthor of entryAuthors) {
        const entryHash = this.calculateContentHash(entryAuthor, entryContent);
        if (entryHash && contentHashes.has(entryHash)) return true;
      }

      // Last-resort textual match when IDs are unstable but author+content are clearly the same.
      const sameContent =
        entryContent === contentText ||
        entryContent === compactContentText ||
        compactContentText === entryContent;
      const authorMatches =
        (entry.authorId && authorId && String(entry.authorId) === String(authorId)) ||
        (entry.author && authorName && String(entry.author).trim() === String(authorName).trim());

      return sameContent && authorMatches;
    });
  },

  _isKnownCritMessageId(messageId) {
    const normalizedId = this.normalizeId(messageId) || this.extractPureDiscordId(messageId);
    if (!normalizedId) return false;
    const pureId = this.extractPureDiscordId(normalizedId) || normalizedId;

    // Use O(1) history map lookup instead of O(N) history scan
    const entry = (normalizedId && this._historyMap.get(normalizedId)) ||
                  (pureId && this._historyMap.get(pureId));
    return !!(entry && entry.isCrit);
  },

  _hasActiveCritStyling(messageElement) {
    if (!messageElement) return false;

    const critElement = messageElement.classList?.contains('bd-crit-hit')
      ? messageElement
      : messageElement.querySelector?.('.bd-crit-hit');
    if (!critElement) return false;
    if (critElement.dataset?.bdCritLocked === '1') return true;

    const content = this.getCritContentElement(critElement);
    if (!content) return false;

    if (content.classList?.contains('bd-crit-text-content')) return true;

    const inlineGradient =
      content.style?.backgroundImage?.includes('gradient') ||
      content.style?.background?.includes('gradient');
    const transparentFill =
      content.style?.webkitTextFillColor === 'transparent' ||
      content.style?.getPropertyValue?.('-webkit-text-fill-color') === 'transparent';

    return !!(inlineGradient || transparentFill);
  },

  _scheduleCritVisualRecheck(messageElement, messageId) {
    // Dedup: Cancel any pending rechecks for this message before scheduling new ones
    if (!this._pendingRechecks) this._pendingRechecks = new Map();
    const existingTimers = this._pendingRechecks.get(messageId);
    if (existingTimers) {
      existingTimers.forEach(id => clearTimeout(id));
    }

    const timers = [];
    const recheckDelays = [120, 420, 900];
    const totalRechecks = recheckDelays.length;
    let completedRechecks = 0;
    recheckDelays.forEach((delayMs) => {
      const timerId = this._setTrackedTimeout(() => {
        completedRechecks++;
        // Clean up Map entry after last timer fires to prevent unbounded growth
        if (completedRechecks >= totalRechecks && this._pendingRechecks) {
          this._pendingRechecks.delete(messageId);
        }

        if (this._isStopped) return;

        const requeried = (messageId && this.requeryMessageElement(messageId, messageElement)) || messageElement;
        if (!requeried?.isConnected) return;

        const critTarget = requeried.classList?.contains('bd-crit-hit')
          ? requeried
          : requeried.querySelector?.('.bd-crit-hit') || requeried;

        if (!critTarget?.isConnected) return;
        if (!this.shouldRestoreCritVisuals(critTarget)) return;

        const normalizedMessageId = this.normalizeId(messageId) || this.extractPureDiscordId(messageId);
        const channelCrits = this.getCritHistory(this.currentChannelId);
        const historyEntry = normalizedMessageId
          ? channelCrits.find((entry) => {
              const entryId =
                this.normalizeId(entry.messageId) || this.extractPureDiscordId(entry.messageId);
              return !!entryId && entryId === normalizedMessageId;
            })
          : null;

        if (historyEntry?.critSettings) {
          this.applyCritStyleWithSettings(critTarget, historyEntry.critSettings);
          return;
        }

        this.applyCritStyle(critTarget);
      }, delayMs);
      timers.push(timerId);
    });
    this._pendingRechecks.set(messageId, timers);
  },

  // ----------------------------------------------------------------------------
  // Main Restoration Check
  // ----------------------------------------------------------------------------

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

    if (messageElement) {
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
          const needsRestore = this.shouldRestoreCritVisuals(
            messageElement,
            historyEntry.critSettings
          );
          if (needsRestore) {
            this.performCritRestoration(historyEntry, normalizedMsgId, messageElement);
          }
        } else if (!historyEntry && isValidDiscordId) {
          // For messages that already have crit class or are pending crit,
          // allow the MutationObserver path to catch the animation trigger.
          // Only skip if message is definitely not a crit candidate.
          const pendingHint =
            this.pendingCrits.has(normalizedMsgId) ||
            this.pendingCrits.has(pureMessageId) ||
            (!!contentHash && this.pendingCrits.has(contentHash));
          const hasCritClass = messageElement.classList?.contains('bd-crit-hit');

          if (!pendingHint && !hasCritClass) {
            // Not pending and no crit class — skip observer setup
            return;
          }

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

          const restorationObserver = this._trackTransientObserver(
            new MutationObserver((mutations) => {
              const now = Date.now();
              // Throttle: Skip if checked recently
              if (now - lastRestorationCheck < C.RESTORATION_CHECK_THROTTLE_MS) return;
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
                    this._disconnectTransientObserver(restorationObserver);
                  }
                });
              }
            })
          );

          restorationObserver.observe(parentContainer, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
          });

          // Cleanup observer after timeout
          this._setTrackedTimeout(
            () => this._disconnectTransientObserver(restorationObserver),
            C.RESTORATION_OBSERVER_TIMEOUT_MS
          );
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
  },
};
