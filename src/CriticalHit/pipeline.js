/**
 * CriticalHit — Crit detection & application pipeline.
 * processNode entry point, crit roll calculation, queued message handling,
 * crit/non-crit processing, and the main checkForCrit logic.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');

// Hoisted once — avoids closure recreation on every processNode call
const _scheduleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 16));

module.exports = {

  // --------------------------------------------------------------------------
  // FluxDispatcher MESSAGE_CREATE Handler (v3.6.0)
  // --------------------------------------------------------------------------

  /**
   * Handles MESSAGE_CREATE from FluxDispatcher.
   * Filters for own messages in current channel, rolls crit deterministically,
   * injects per-message CSS immediately (before DOM renders), and queues animation.
   * @param {Object} payload - Dispatcher payload { message, channelId, ... }
   */
  _onMessageCreate(payload) {
    try {
      if (this._isStopped) return;

      const msg = payload?.message;
      if (!msg?.id || !msg?.author?.id || !msg?.channel_id) return;

      // OWN MESSAGES ONLY — same filter as checkForCrit's USER-ONLY guard
      const ownId = this.currentUserId || this.settings?.ownUserId;
      if (!ownId || msg.author.id !== ownId) return;

      // Current channel only — don't process messages from background channels
      const currentChannel = this._getCurrentChannelId?.() || this.currentChannelId;
      if (msg.channel_id !== currentChannel) return;

      // Already processed (e.g., observer beat us to it)
      if (this.processedMessages.has(msg.id)) return;

      // Deterministic crit roll using real snowflake ID
      const seed = `${msg.id}:${msg.channel_id}:${msg.author.id}`;
      const hash = this.simpleHash(seed);
      const roll = (hash % C.CRIT_ROLL_DIVISOR) / C.CRIT_ROLL_SCALE;
      const effectiveCritChance = this.getEffectiveCritChance();
      const isCrit = roll <= effectiveCritChance;

      const messageContent = msg.content || '';
      const author = msg.author.username || '';
      const authorId = msg.author.id;
      const channelId = msg.channel_id;
      const guildId = this.currentGuildId || 'dm';

      if (isCrit) {
        // CRITICAL: Do NOT mark as processed, save to history, or increment stats here.
        // The observer's pendingAnimations path will handle all of that AFTER triggering
        // the animation. If we do it here, the observer can't match the pending animation
        // (wrapper elements lack data-message-id), falls to processNode() which skips
        // (already in processedMessages), or checkForCrit() finds it in history and
        // restores WITHOUT animation.

        const critSettings = this._createCritSettings();

        // Inject per-message CSS IMMEDIATELY — before DOM element exists.
        // CSS targets [data-message-id="..."] which Discord sets on the element.
        // When the element renders, it instantly picks up the styling.
        this.injectCritCSS();
        this.injectCritMessageCSS(msg.id, critSettings);

        // Queue animation — MutationObserver will trigger it when element appears.
        // Include ALL data needed for deferred stats/history/processedMessages.
        this._pendingAnimations.set(msg.id, {
          critSettings,
          timestamp: Date.now(),
          channelId,
          guildId,
          authorId,
          messageContent: messageContent.substring(0, 200),
          author,
        });

        // Trim old pending animations (safety cap)
        if (this._pendingAnimations.size > 50) {
          const now = Date.now();
          for (const [id, entry] of this._pendingAnimations) {
            if (now - entry.timestamp > 10000) this._pendingAnimations.delete(id);
          }
        }

        this.diagLog('DISPATCHER_CRIT', 'Crit via FluxDispatcher', {
          messageId: msg.id,
          roll,
          effectiveCritChance,
        });
      } else {
        // Non-crit: mark as processed immediately (no observer handling needed)
        this.processedMessages.add(msg.id);
        this.stats.totalMessages++;

        this.addToHistory({
          messageId: msg.id,
          authorId,
          channelId,
          guildId,
          timestamp: Date.now(),
          isCrit: false,
          messageContent: messageContent.substring(0, 200),
          author,
        });
      }
    } catch (error) {
      this.debugError('DISPATCHER_MESSAGE_CREATE', error, {
        hasPayload: !!payload,
        hasMessage: !!payload?.message,
      });
    }
  },

  // --------------------------------------------------------------------------
  // DOM Node Processing
  // --------------------------------------------------------------------------

  /**
   * Processes a DOM node to detect and handle new messages
   * Checks for crit status and applies styling if needed
   * @param {Node} node - DOM node to process
   */
  processNode(node) {
    if (this._isStopped) return;
    _scheduleCallback(() => {
    try {
      if (this._isStopped) return;
      // Only process nodes that were just added (not existing messages)
      // Check if this node was just added by checking if it's in the viewport
      // and wasn't there before the observer started

      // More flexible message detection
      let messageElement = null;

      // OPTIMIZED: Direct matching for message classes
      if (node.classList) {
        const isMsg = node.classList.contains('message-2C84CH') || // Common Discord message class
                      node.classList.contains('message-36f9Yy') ||
                      Array.from(node.classList).some(c => c.includes('message') && !c.includes('Content') && !c.includes('Group'));

        if (isMsg && node.offsetParent !== null) {
          messageElement = node;
        }
      }

      // Check for message in children if node itself isn't a message
      if (!messageElement && node.querySelectorAll) {
        // PERF: Only search depth 1-2 for messages to avoid heavy recursion
        messageElement = node.querySelector(':scope > [class*="message"]:not([class*="Content"]):not([class*="Group"])') ||
                         node.querySelector(':scope > * > [class*="message"]:not([class*="Content"]):not([class*="Group"])');
      }



        // Get message ID *inside* callback (heavy operation)
        // Get message ID to check against processedMessages (which now uses IDs, not element references)
        let messageId = messageElement ? this.getMessageIdentifier(messageElement) : null;

        // Reject likely channel IDs unless message metadata strongly supports this candidate
        if (this.shouldRejectChannelMatchedMessageId(messageElement, messageId)) {
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

          // AGE GATE: Skip crit rolling for old messages (e.g., jump-to-message, scroll-back).
          // Discord snowflake IDs encode timestamps: (id >> 22) + 1420070400000.
          // Messages older than 5 minutes only get restoration (via checkForRestoration),
          // not new crit rolls. This prevents flooding the main thread when hundreds
          // of old messages load at once during a jump.
          if (messageId && this.isValidDiscordId(messageId)) {
            const DISCORD_EPOCH = 1420070400000;
            const MESSAGE_AGE_GATE_MS = 5 * 60 * 1000; // 5 minutes
            const messageTimestamp = Number(BigInt(messageId) >> 22n) + DISCORD_EPOCH;
            if (Date.now() - messageTimestamp > MESSAGE_AGE_GATE_MS) {
              this.processedMessages.add(messageId);
              return; // Old message — skip crit roll, restoration handles it
            }
          }

          this.checkForCrit(messageElement);
        }
    } catch (error) {
      this.debugError('PROCESS_NODE', error, {
        nodeType: node?.nodeType,
        hasClassList: !!node?.classList,
      });
    }
    }, { timeout: 1000 });
  },

  // --------------------------------------------------------------------------
  // Crit Settings & Roll Helpers
  // --------------------------------------------------------------------------

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
  },

  /**
   * Calculates crit roll from seed string
   * @param {string} seed - Seed string for deterministic randomness
   * @returns {number} Roll value (0-100)
   */
  _calculateRollFromSeed(seed) {
    const hash = this.simpleHash(seed);
    return (hash % C.CRIT_ROLL_DIVISOR) / C.CRIT_ROLL_SCALE;
  },

  // handleQueuedMessage removed in v3.6.0 — FluxDispatcher provides real IDs instantly

  // --------------------------------------------------------------------------
  // Crit Roll Calculation
  // --------------------------------------------------------------------------

  /**
   * Creates seed string for crit roll calculation
   * @param {string} messageId - Message ID
   * @param {string} author - Author ID
   * @returns {string} Seed string
   */
  _createCritRollSeed(messageId, author) {
    return `${messageId}:${this.currentChannelId}:${author}`;
  },

  /**
   * Calculates deterministic crit roll for a message
   * @param {string} messageId - The message ID
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {number} Roll value (0-100)
   */
  calculateCritRoll(messageId, messageElement) {
    if (!messageId) return Math.random() * 100;
    const author = this.getAuthorId(messageElement) || '';
    const seed = this._createCritRollSeed(messageId, author);
    return this._calculateRollFromSeed(seed);
  },

  // --------------------------------------------------------------------------
  // Crit Processing
  // --------------------------------------------------------------------------

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
    // GUARD: If message exists in persisted crit history, it's old — restore style only, no animation.
    // This catches messages that bypassed _historyMap (ID format mismatch or missing entry)
    // but ARE in the persisted getCritHistory() array.
    if (messageId && isValidDiscordId) {
      const channelCrits = this.getCritHistory(this.currentChannelId);
      const existingEntry = channelCrits?.find(entry => entry.messageId === messageId);
      if (existingEntry) {
        this.applyCritStyleWithSettings(messageElement, existingEntry.critSettings);
        this.critMessages.add(messageElement);
        this.processedMessages.add(messageId);
        this._processingCrits.delete(messageId);
        return;
      }
    }

    this.stats.totalCrits++;
    this.updateStats();

    // Check if currently processing
    if (messageId && this._processingCrits.has(messageId)) {
      return;
    }

    messageId && this._processingCrits.add(messageId);

    const effectiveCritChance = this.getEffectiveCritChance();
    this.diagLog('CRIT_DETECTED', 'Critical hit detected', {
      messageId,
      roll,
      effectiveCritChance,
      totalCrits: this.stats.totalCrits,
    });

    try {
      try {
        this.applyCritStyle(messageElement, { animate: true });

        // FIX: Find the actual message element that has the class (must match what applyCritStyle uses)
        let elementWithClass = messageElement;
        const isContentElement = this._isContentElement(messageElement);

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


      // Direct animation trigger — bypass the onCritHit/handleCriticalHit gate chain.
      // Crit styling was already applied above; just need to show the floating text.
      {
        const animTarget = messageElement;
        const animId = messageId;
        const animUserId = this.getUserId(messageElement) || authorId || this.getAuthorId(messageElement);
        const isOwnCritSource = !!(animUserId && this.isOwnMessage(messageElement, animUserId));

        if (isOwnCritSource) {
          const animCombo = this._syncBurstComboForMessage({
            messageId: animId,
            messageElement,
            userId: animUserId,
          });
          this._markComboUpdated(animId);

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              try {
                let currentElement = (isValidDiscordId && animId)
                  ? (this.requeryMessageElement(animId, animTarget) || animTarget)
                  : animTarget;

                // bd-crit-hit may be on currentElement itself or a child wrapper (applyCritStyle walks up to parent)
                const hasCritOnSelf = currentElement?.classList?.contains('bd-crit-hit');
                const critChild = !hasCritOnSelf && currentElement?.isConnected ? currentElement.querySelector?.('.bd-crit-hit') : null;
                const animElement = hasCritOnSelf ? currentElement : critChild;


                // If element is connected and styled (on self or child), animate immediately
                if (animElement?.isConnected) {
                  this.showAnimation(animElement, animId, animCombo);
                } else if (!currentElement?.isConnected || !animElement) {
                  // Element was disconnected (Discord replaced it during hash→real ID transition)
                  // or styling was lost. Retry after a short delay to find the replacement element.
                  this._setTrackedTimeout(() => {
                    try {
                      // Try to find replacement by message ID first
                      let retryElement = animId ? this.requeryMessageElement(animId) : null;

                      // If not found by original ID, search by content hash
                      if (!retryElement?.isConnected) {
                        const contentAuthor = authorId || 'unknown';
                        const contentText = this.findMessageContentElement(animTarget)?.textContent?.trim()
                          || animTarget?.textContent?.trim();
                        if (contentText) {
                          const contentHash = this.calculateContentHash(contentAuthor, contentText);
                          // Search recent messages in DOM for matching content
                          const container = this._cachedMessageContainer || document;
                          const candidates = container.querySelectorAll?.('[class*="message"]') || [];
                          for (const el of candidates) {
                            if (!el?.isConnected || !el.offsetParent) continue;
                            const elContent = this.findMessageContentElement(el);
                            const elText = elContent?.textContent?.trim();
                            const elAuthor = this.getAuthorId(el);
                            if (elText && elAuthor) {
                              const elHash = this.calculateContentHash(elAuthor, elText);
                              if (elHash === contentHash) {
                                retryElement = el;
                                break;
                              }
                            }
                          }
                        }
                      }

                      if (retryElement?.isConnected) {
                        // Re-apply crit styling to the replacement element
                        // applyCritStyle may apply bd-crit-hit to a child wrapper element,
                        // not necessarily retryElement itself (e.g. LI vs inner DIV)
                        this.applyCritStyle(retryElement);
                        this.critMessages.add(retryElement);

                        // Find the element that actually got bd-crit-hit (could be retryElement or a descendant)
                        const critTarget = retryElement.classList.contains('bd-crit-hit')
                          ? retryElement
                          : retryElement.querySelector('.bd-crit-hit');

                        if (critTarget?.isConnected) {
                          this.showAnimation(critTarget, animId, animCombo);
                        }
                      }
                    } catch (retryError) {
                      this.debugError('PROCESS_NEW_CRIT', retryError, { phase: 'direct_animation_retry' });
                    }
                  }, 150);
                }
              } catch (error) {
                this.debugError('PROCESS_NEW_CRIT', error, { phase: 'direct_animation' });
              }
            });
          });
        }
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
  },

  /**
   * Processes a non-crit message - saves to history
   * @param {string} messageId - The message ID
   * @param {string} authorId - The author ID
   * @param {string} messageContent - The message content
   * @param {string} author - The author username
   */
  processNonCrit(messageId, authorId, messageContent, author) {
    // Clean up any stale per-message CSS (e.g., from optimistic processing that rolled crit
    // but real message didn't)
    if (messageId) {
      this.removeCritMessageCSS(messageId);
    }

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
  },

  // --------------------------------------------------------------------------
  // Main Crit Detection Logic
  // --------------------------------------------------------------------------

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
        return;
      }

      // Get message identifier EARLY to use for tracking
      // Use verbose debug context to ensure we get the correct message ID
      let messageId = this.getMessageIdentifier(messageElement, {
        phase: 'check_for_crit',
        verbose: true,
      }); // Validate message ID is correct (not channel ID)

      // Reject likely channel IDs unless message metadata strongly supports this candidate
      if (this.shouldRejectChannelMatchedMessageId(messageElement, messageId)) {
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

        if (
          retryMessageId &&
          !this.shouldRejectChannelMatchedMessageId(messageElement, retryMessageId)
        ) {
          messageId = retryMessageId;
        } else {
          // Still no valid ID - use content hash as fallback but still process
          const content = messageElement.textContent?.trim() || '';
          const author = this.getAuthorId(messageElement);
          if (content) {
            messageId = author
              ? this.calculateContentHash(author, content)
              : this.calculateContentHash(null, content);
          } else {
            return;
          }
        }
      }

      // Define isValidDiscordId at the top so it's available throughout the method
      if (!messageId) return;

      const isValidDiscordId = this.isValidDiscordId(messageId);

      // Check history FIRST before marking as processed
      // This ensures we use the saved determination if message was already processed
      let historyEntry = null;
      if (messageId) {
        // O(1) MAP LOOKUP - Replaces O(N) this.messageHistory.find()
        historyEntry = this._historyMap.get(messageId);

        // Verify entry matches current channel/guild context if needed
        // (Usually messageId is globally unique in Discord, but we double-check for safety)
        if (historyEntry) {
          const guildId = this.currentGuildId || 'dm';
          const contextMatch = historyEntry.channelId === this.currentChannelId &&
                               (historyEntry.guildId || 'dm') === guildId;
          if (!contextMatch) historyEntry = null;
        }

        // Hash ID → real ID reconciliation removed in v3.6.0 — FluxDispatcher provides real IDs instantly.
        // pendingCrits is still populated by addToHistory() for restoration use.
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
          // Fix infinite loop: Check ONLY for the class. The inline style check was too aggressive
          // and caused re-application when DOM structure didn't match perfectly, triggering
          // a MutationObserver loop.
          // v3.4.0: Only check for bd-crit-hit class (bd-crit-text-content was removed)
          // Also check if per-message CSS is missing (may have been cleaned up)
          const msgIdForRestore = this.getMessageIdentifier(messageElement);
          const cssNeedsRestore = msgIdForRestore && !this.critCSSRules.has(msgIdForRestore);
          const needsRestore = !messageElement.classList.contains('bd-crit-hit') || cssNeedsRestore;

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

          // NO animation for restored crits — only newly sent messages trigger animation.
          // Styling is restored above; animation is exclusively handled by processNewCrit().

          // Don't mark as processed again - already in history
          // But mark in processedMessages to skip future checks (efficiency)
          messageId && this.processedMessages.add(messageId);
          return;
        }
        // It's NOT a crit - clean up any stale per-message CSS rules
        if (messageId) {
          this.removeCritMessageCSS(messageId);
        }

        // Remove crit class only when there is no crit evidence.
        // This prevents transient re-processing from stripping visuals on real crits.
        const hasCritEvidence = this._hasCritEvidenceForMessage(messageElement, messageId);
        const knownCritId = this._isKnownCritMessageId(messageId);
        const critElement = messageElement?.classList?.contains('bd-crit-hit')
          ? messageElement
          : messageElement?.querySelector?.('.bd-crit-hit');
        const hasCritLock = critElement?.dataset?.bdCritLocked === '1';
        const hasActiveStyling = this._hasActiveCritStyling(messageElement);
        const hasCritTextClass = !!(
          messageElement?.classList?.contains('bd-crit-text-content') ||
          messageElement?.querySelector?.('.bd-crit-text-content')
        );
        const normalizedMessageId = this.normalizeId(messageId) || this.extractPureDiscordId(messageId);
        const pureMessageId = this.extractPureDiscordId(normalizedMessageId) || normalizedMessageId;
        const hasStableDiscordMessageId = !!(
          pureMessageId &&
          !String(pureMessageId).startsWith('hash_') &&
          this.isValidDiscordId(pureMessageId)
        );
        // Be conservative: never strip crit class from real Discord messages.
        // This avoids visual loss when Discord re-renders faster than history reconciliation.
        if (
          critElement?.classList?.contains('bd-crit-hit') &&
          !hasCritEvidence &&
          !knownCritId &&
          !hasCritLock &&
          !hasActiveStyling &&
          !hasCritTextClass &&
          !hasStableDiscordMessageId
        ) {
          this.diagLog(
            'STRIP_CLASS',
            'Removing bd-crit-hit (message evaluated as non-crit with no retention evidence)',
            {
              messageId,
              hasCritEvidence,
              knownCritId,
              hasCritLock,
              hasActiveStyling,
              hasCritTextClass,
              hasStableDiscordMessageId,
            },
            'warn'
          );
          critElement.classList.remove('bd-crit-hit');
          // Remove from critMessages if present
          this.critMessages.delete(critElement);
        } else if (critElement?.classList?.contains('bd-crit-hit')) {
          this.diagLog('STRIP_GUARDED', 'Retained bd-crit-hit due guardrail', {
            messageId,
            hasCritEvidence,
            knownCritId,
            hasCritLock,
            hasActiveStyling,
            hasCritTextClass,
            hasStableDiscordMessageId,
          });
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
        if (!this.shouldRejectChannelMatchedMessageId(messageElement, messageId)) {
          this.processedMessages.add(messageId);
        }
        return;
      }

      // Content-hash dedup removed in v3.6.0 — FluxDispatcher handles own messages once;
      // observer fallback relies on processedMessages ID check (above) for dedup.
      if (!this.markAsProcessed(messageId)) return;

      // Guard clauses: early returns for invalid states
      if (this.isLoadingChannel) return;
      if (this.shouldFilterMessage(messageElement)) return;

      // USER-ONLY: Only roll crits on your own messages — no styling other people's messages.
      // The crit system is personal (Solo Leveling: only the Monarch sees the System).
      // This also reduces DOM mutations and MutationObserver overhead significantly.
      {
        const msgAuthorId = this.getAuthorId(messageElement);
        if (msgAuthorId && !this.isOwnMessage(messageElement, msgAuthorId)) {
          // Not our message — skip crit roll entirely, mark as processed
          messageId && this.processedMessages.add(messageId);
          return;
        }
      }

      // Verify it's actually a message (has some text content)
      const hasText =
        messageElement.textContent?.trim().length > 0 ||
        messageElement.querySelector('[class*="content"]')?.textContent?.trim().length > 0 ||
        messageElement.querySelector('[class*="text"]')?.textContent?.trim().length > 0;

      if (!hasText) return;

      // Calculate crit roll using helper function
      const effectiveCritChance = this.getEffectiveCritChance();
      const roll = this.calculateCritRoll(messageId, messageElement);
      const isCrit = roll <= effectiveCritChance;

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
  },
};
