/**
 * CriticalHit — Message restoration helpers.
 * Handles restoration of crit styling from history and pending queue.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');
const dc = require('../shared/discord-classes');
const { prefixedContentHash } = require('./hash');

module.exports = {
  // Core Restoration

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

  findMessageElementForRestoration(node) {
    let messageElement = null;
    if (node.className && typeof node.className === 'string') {
      if (
        node.className.includes('message') &&
        !node.className.includes('messageContent') &&
        !node.className.includes('messageGroup')
      ) {
        messageElement = node;
      }
    }
    if (!messageElement) {
      messageElement = node.querySelector(
        `${dc.sel.message}:not(${dc.sel.messageContent}):not([class*="messageGroup"])`
      );
    }
    return messageElement;
  },

  // Restoration Throttling

  _cleanupThrottleEntries(now) {
    if (this._restorationCheckThrottle.size <= C.MAX_THROTTLE_MAP_SIZE) return;

    Array.from(this._restorationCheckThrottle.entries())
      .filter(([, checkTime]) => now - checkTime > C.THROTTLE_ENTRY_MAX_AGE_MS)
      .forEach(([id]) => this._restorationCheckThrottle.delete(id));
  },

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

  // Content Hash Matching

  _createSimpleContentHash(content) {
    // Delegates to the shared prefixedContentHash util in ./hash.js —
    // previously duplicated across crit-engine.js, restoration.js,
    // id-extraction.js.
    return prefixedContentHash(content);
  },

  _matchesByContentHash(entry, contentHash) {
    if (!entry.messageContent || !entry.author) return false;
    // PERF: cache the computed hash on the entry so repeat calls (multiple
    // checkForRestoration invocations scanning the same history array) don't
    // re-hash the same entry's content every time. Entries are replaced
    // wholesale, never mutated in place, when their content changes (see
    // addToHistory in history.js), so a cached hash never goes stale.
    if (entry._contentHash === undefined) {
      const entryContent = entry.messageContent.substring(0, 100);
      const entryHashContent = `${entry.author}:${entryContent}:${entry.timestamp || ''}`;
      entry._contentHash = this._createSimpleContentHash(entryHashContent);
    }
    return entry._contentHash === contentHash;
  },

  // History Entry Matching

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
   * PERF: O(1) _historyMap lookup instead of O(N) Array.find scans over
   * channelCrits (replaces the former _findEntryByExactId/_findEntryByPureId
   * pair) — same pattern _isKnownCritMessageId already documents/uses.
   * channelCrits was only ever channel-scoped (+ isCrit-filtered) as a
   * byproduct of getCritHistory(); replicate that scoping explicitly here
   * since _historyMap itself is global across channels. Every entry ever
   * written to _historyMap already carries a normalized/pure messageId
   * (see normalizeMessageData in history.js), so the two direct-key lookups
   * below cover what the old fuzzy substring match handled in practice.
   */
  _findEntryByHistoryMap(normalizedMsgId, pureMessageId) {
    const entry =
      this._historyMap.get(normalizedMsgId) ||
      (pureMessageId && pureMessageId !== normalizedMsgId
        ? this._historyMap.get(pureMessageId)
        : undefined);

    if (!entry || !entry.isCrit) return undefined;
    if (entry.channelId !== this.currentChannelId) return undefined;
    if (String(entry.messageId).trim().startsWith('hash_')) return undefined;

    return entry;
  },

  _findEntryByContentHash(channelCrits, contentHash) {
    return channelCrits.find((entry) => {
      const entryId = String(entry.messageId).trim();
      if (entryId.startsWith('hash_')) return false;
      return this._matchesByContentHash(entry, contentHash);
    });
  },

  /**
   * PERF: ID-based lookups (pendingCrits Map + O(1) _historyMap) are tried
   * first and are cheap. textContent extraction + calculateContentHash are
   * only computed below, in the fallback branch, once those have missed —
   * this used to run unconditionally on every checkForRestoration call
   * regardless of whether the ID lookup already found the entry.
   * Returns { entry, contentHash } — contentHash is surfaced so the caller
   * can reuse it for the pendingCrits hash-hint check without re-hashing.
   */
  findHistoryEntryForRestoration(
    normalizedMsgId,
    pureMessageId,
    channelCrits,
    messageElement
  ) {
    if (!this.isValidDiscordId(normalizedMsgId)) return { entry: null, contentHash: null };

    const pendingCrit =
      this.pendingCrits.get(normalizedMsgId) || this.pendingCrits.get(pureMessageId);
    if (pendingCrit?.channelId === this.currentChannelId) {
      return {
        entry: this._createHistoryEntryFromPending(normalizedMsgId, pendingCrit),
        contentHash: null,
      };
    }

    const idEntry = this._findEntryByHistoryMap(normalizedMsgId, pureMessageId);
    if (idEntry) return { entry: idEntry, contentHash: null };

    const messageContent = messageElement?.textContent?.trim() || '';
    const author =
      dc.query(messageElement, 'username')?.textContent?.trim() ||
      messageElement?.querySelector?.(dc.sel.author)?.textContent?.trim() ||
      '';
    const timestamp = messageElement?.querySelector?.('time')?.getAttribute('datetime') || '';
    const contentHash = this.calculateContentHash(author, messageContent, timestamp);

    let hashEntry = null;
    if (contentHash && messageContent && author) {
      hashEntry = this._findEntryByContentHash(channelCrits, contentHash);

      if (hashEntry) {
        this.debugLog(
          'CHECK_FOR_RESTORATION',
          'Found match by content hash (reprocessed message)',
          {
            msgId: normalizedMsgId,
            matchedId: hashEntry.messageId,
            contentHash,
          }
        );
      }
    }

    return { entry: hashEntry, contentHash };
  },

  // Visual State Checks

  /** v3.4.0: Per-message CSS handles styling — only check class + CSS rule presence. */
  shouldRestoreCritVisuals(messageElement, critSettings = null) {
    if (!messageElement) return false;

    const messageId = this.getMessageIdentifier(messageElement);

    if (!messageElement.classList?.contains('bd-crit-hit')) {
      return true;
    }

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
      messageElement.querySelector?.(dc.sel.username)?.textContent?.trim() ||
      messageElement.querySelector?.(dc.sel.author)?.textContent?.trim() ||
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

  // Main Restoration Check

  checkForRestoration(node) {
    if (!this.currentChannelId || this.isLoadingChannel) return;

    const messageElement = this.findMessageElementForRestoration(node);
    if (messageElement) {
      const msgId = this.getMessageIdentifier(messageElement);
      if (msgId && this.shouldThrottleRestorationCheck(String(msgId).trim())) {
        return;
      }
    }

    // BUG FIX: previously this unconditionally invalidated the
    // _cachedCritHistory + timestamp on EVERY checkForRestoration call.
    // checkForRestoration fires per observer tick per message node,
    // so the cache below in getCritHistory (which has its own 5s TTL)
    // was being wiped before every single read. Net result: a TTL
    // cache that never served a single hit.
    //
    // The original comment cited "race where restoration checks before
    // crit is saved" as the rationale — but that case is now handled
    // by history.js:421 where addToHistory invalidates the timestamp
    // EXACTLY when a new crit is saved. There's no longer a need to
    // pre-invalidate here, so the cache can do its job.

    if (messageElement) {
      let msgId = this.getMessageIdentifier(messageElement);

      if (msgId) {
        const channelCrits = this.getCritHistory(this.currentChannelId);
        const normalizedMsgId = String(msgId).trim();

        if (normalizedMsgId.startsWith('hash_')) return;

        const pureMessageId = this.extractPureDiscordId(normalizedMsgId) || normalizedMsgId;

        this.debug?.verbose &&
          this.debugLog('CHECK_FOR_RESTORATION', 'Checking if message needs restoration', {
            msgId: normalizedMsgId,
            pureMessageId: pureMessageId !== normalizedMsgId ? pureMessageId : undefined,
            channelId: this.currentChannelId,
            channelCritCount: channelCrits.length,
          });

        // PERF: textContent extraction + calculateContentHash are deferred
        // inside findHistoryEntryForRestoration — only paid for when the
        // O(1) ID-based lookups miss (finding #2, cpu-audit-crit-syswin-2026-07-11.md).
        const { entry: historyEntry, contentHash } = this.findHistoryEntryForRestoration(
          normalizedMsgId,
          pureMessageId,
          channelCrits,
          messageElement
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
          const pendingHint =
            this.pendingCrits.has(normalizedMsgId) ||
            this.pendingCrits.has(pureMessageId) ||
            (!!contentHash && this.pendingCrits.has(contentHash));
          const hasCritClass = messageElement.classList?.contains('bd-crit-hit');

          if (!pendingHint && !hasCritClass) return;

          const checkForCrit = () => {
            const retryElement = this.requeryMessageElement(normalizedMsgId);

            if (!retryElement || !retryElement.isConnected) return false;

            let pendingCrit =
              this.pendingCrits.get(normalizedMsgId) || this.pendingCrits.get(pureMessageId);

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

            if (retryElement?.classList?.contains('bd-crit-hit')) {
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

          if (checkForCrit()) return;

          // PERF: Never observe document.body with subtree — too expensive
          const parentContainer = messageElement?.parentElement;
          if (!parentContainer || parentContainer === document.body) return;

          // PERF: Cap concurrent restoration observers to avoid unbounded growth.
          // The cap (5) is enforced by `_activeRestorationObservers`. Two
          // previous bugs:
          //   (a) Counter could go NEGATIVE because both the success branch
          //       (checkForCrit returned true) and the safety timeout would
          //       independently decrement. After ~5 of those races the cap
          //       check `>= 5` failed forever and restoration died silently.
          //   (b) Counter could LEAK if `observe()` threw between increment
          //       and the safety setTimeout being scheduled.
          // Fix: capture a `restorationResolved` boolean closed over by all
          // three exit paths (success, timeout, observe-throw) and skip the
          // decrement if already done. observer.observe() is wrapped so a
          // throw still releases the counter slot.
          if (!this._activeRestorationObservers) this._activeRestorationObservers = 0;
          if (this._activeRestorationObservers >= 5) return;
          this._activeRestorationObservers++;
          let restorationResolved = false;
          const releaseRestorationSlot = () => {
            if (restorationResolved) return;
            restorationResolved = true;
            this._activeRestorationObservers--;
          };

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
                    dc.query(target, 'message')?.classList?.contains('bd-crit-hit')
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
                    releaseRestorationSlot();
                    this._disconnectTransientObserver(restorationObserver);
                  }
                });
              }
            })
          );

          try {
            restorationObserver.observe(parentContainer, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['class'],
            });
          } catch (_) {
            // observe() can throw if parentContainer was GC'd or detached
            // between the null-check above and now. Release the counter
            // slot so future observers aren't blocked by a phantom +1.
            releaseRestorationSlot();
            this._disconnectTransientObserver(restorationObserver);
            return;
          }

          this._setTrackedTimeout(
            () => {
              releaseRestorationSlot();
              this._disconnectTransientObserver(restorationObserver);
            },
            C.RESTORATION_OBSERVER_TIMEOUT_MS
          );
        }
      } else {
        this.debug?.verbose &&
          this.debugLog('CHECK_FOR_RESTORATION', 'No matching crit found in history', {
            channelId: this.currentChannelId,
          });
      }
    } else {
      this.debug?.verbose &&
        this.debugLog(
          'CHECK_FOR_RESTORATION',
          'WARNING: Could not get message ID for restoration check',
          { channelId: this.currentChannelId }
        );
    }
  },
};
