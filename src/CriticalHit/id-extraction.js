/**
 * CriticalHit — Message ID extraction, validation, and React fiber utilities.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const dc = require('../shared/discord-classes');

module.exports = {
  /**
   * Normalizes an ID to string and trims whitespace
   * @param {string|number|null|undefined} id - ID to normalize
   * @returns {string|null} Normalized ID or null
   */
  normalizeId(id) {
    return id ? String(id).trim() : null;
  },

  /**
   * Validates if a string is a valid Discord ID (17-19 digits)
   * @param {string|null|undefined} id - ID to validate
   * @returns {boolean} True if valid Discord ID
   */
  isValidDiscordId(id) {
    return id ? /^\d{17,19}$/.test(String(id).trim()) : false;
  },

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
  },

  /**
   * Validates an ID and ensures it's not a channel ID
   * @param {string} id - ID to validate
   * @param {string|null} currentChannelId - Current channel ID to exclude
   * @returns {boolean} True if ID is valid and not a channel ID
   */
  isValidMessageId(id, currentChannelId) {
    return id && (!currentChannelId || id !== currentChannelId);
  },

  /**
   * Checks whether a message ID has strong evidence from DOM/react message metadata
   * @param {HTMLElement} messageElement - Message element to inspect
   * @param {string} messageId - Candidate message ID
   * @returns {boolean} True if message ID is strongly supported by message metadata
   */
  hasStrongMessageIdEvidence(messageElement, messageId) {
    if (!messageElement || !messageId) return false;

    const normalizedMessageId = this.normalizeId(messageId);
    if (!normalizedMessageId) return false;

    const domMessageIdCandidates = [
      messageElement.getAttribute('data-message-id'),
      messageElement.querySelector('[data-message-id]')?.getAttribute('data-message-id'),
      messageElement.closest('[data-message-id]')?.getAttribute('data-message-id'),
    ]
      .map((id) => this.extractPureDiscordId(id))
      .filter(Boolean);

    if (domMessageIdCandidates.includes(normalizedMessageId)) {
      return true;
    }

    try {
      let currentFiber = this.getReactFiber(messageElement);
      for (let i = 0; i < 60 && currentFiber; i++) {
        const fiberMessageId = this._extractFiberMessageId(currentFiber);

        const extractedFiberId = this.extractPureDiscordId(fiberMessageId);
        if (extractedFiberId && extractedFiberId === normalizedMessageId) {
          return true;
        }

        currentFiber = currentFiber.return;
      }
    } catch (error) {
      // Silently ignore and fallback to false
    }

    return false;
  },

  /**
   * Determines whether a message ID equal to current channel ID should be rejected.
   * @param {HTMLElement} messageElement - Message element being processed
   * @param {string|null} messageId - Candidate message ID
   * @returns {boolean} True if candidate should be rejected as likely channel ID
   */
  shouldRejectChannelMatchedMessageId(messageElement, messageId) {
    if (!messageId || !this.currentChannelId) return false;
    if (messageId !== this.currentChannelId) return false;

    return !this.hasStrongMessageIdEvidence(messageElement, messageId);
  },

  /**
   * Unified content hash calculation
   * @param {string|null} author - Author username (can be null for content-only hash)
   * @param {string} content - Message content
   * @param {string|number|null} timestamp - Optional timestamp
   * @returns {string|null} Content hash or null if invalid input
   */
  calculateContentHash(author, content, timestamp = null) {
    if (!content) return null;
    const authorPart = author || 'unknown';
    const hashContent = `${authorPart}:${content.substring(0, 100)}:${timestamp || ''}`;
    let hash = 0;
    for (let i = 0; i < hashContent.length; i++) {
      hash = (hash << 5) - hash + hashContent.charCodeAt(i);
      hash |= 0;
    }
    return `hash_${Math.abs(hash)}`;
  },

  /**
   * Gets React fiber instance from a DOM element
   * @param {HTMLElement} element - DOM element
   * @returns {Object|null} React fiber or null if not found
   */
  getReactFiber(element) {
    if (!element) return null;

    try {
      const reactKey = Object.keys(element).find(
        (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
      );
      return reactKey ? element[reactKey] : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Traverse React fiber tree to find a value
   * @param {Object} fiber - React fiber to start from
   * @param {Function} getter - Function to extract value from fiber
   * @param {number} maxDepth - Maximum traversal depth
   * @returns {any} Found value or null
   */
  traverseFiber(fiber, getter, maxDepth = 50) {
    if (!fiber) return null;

    try {
      let depth = 0;
      while (fiber && depth < maxDepth) {
        try {
          const value = getter(fiber);
          if (value !== null && value !== undefined) return value;
        } catch (getterError) {
          this.debugError('TRAVERSE_FIBER_GETTER', getterError, { depth });
        }

        fiber = fiber.return || fiber._owner;
        depth++;
      }
    } catch (error) {
      this.debugError('TRAVERSE_FIBER', error, { maxDepth });
    }

    return null;
  },

  /**
   * Extract message ID candidate from a React fiber node.
   * @param {Object|null} currentFiber - React fiber node
   * @returns {string|number|null}
   */
  _extractFiberMessageId(currentFiber) {
    return (
      currentFiber?.memoizedProps?.message?.id ||
      currentFiber?.memoizedState?.message?.id ||
      currentFiber?.memoizedProps?.messageId ||
      currentFiber?.memoizedProps?.id ||
      currentFiber?.memoizedState?.id ||
      currentFiber?.stateNode?.props?.message?.id ||
      currentFiber?.stateNode?.props?.id ||
      currentFiber?.stateNode?.id ||
      null
    );
  },

  _resolveCandidateMessageId(rawValue, channelId, pureMethod, extractedMethod = null) {
    if (rawValue === null || rawValue === undefined) return null;
    const idStr = String(rawValue).trim();
    if (!idStr) return null;

    if (this.isValidDiscordId(idStr) && this.isValidMessageId(idStr, channelId)) {
      return { messageId: idStr, extractionMethod: pureMethod };
    }

    const extracted = this.extractPureDiscordId(idStr);
    if (extracted && this.isValidMessageId(extracted, channelId)) {
      return {
        messageId: extracted,
        extractionMethod: extractedMethod || `${pureMethod}_extracted`,
      };
    }

    return null;
  },

  /**
   * Extracts message ID from a message element using multiple methods
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {Object} [debugContext]
   * @returns {string|null} messageId
   */
  getMessageIdFromElement(messageElement, debugContext = {}) {
    // PERF: Check WeakMap cache first
    if (messageElement && this._msgIdCache?.has(messageElement)) {
      return this._msgIdCache.get(messageElement);
    }
    let messageId = null;
    let extractionMethod = null;
    const currentChannelId = this.currentChannelId || null;

    // Method 1: data-message-id attribute (FASTEST)
    const dataMsgId =
      messageElement.getAttribute('data-message-id') ||
      messageElement.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
      messageElement.closest('[data-message-id]')?.getAttribute('data-message-id');

    if (dataMsgId) {
      const resolved = this._resolveCandidateMessageId(
        dataMsgId,
        currentChannelId,
        'data-message-id',
        'data-message-id_extracted'
      );
      if (resolved) {
        messageId = resolved.messageId;
        extractionMethod = resolved.extractionMethod;
      }
    }

    // Method 2: data-list-item-id attribute
    if (!messageId) {
      const listItemId =
        messageElement.getAttribute('data-list-item-id') ||
        messageElement.closest('[data-list-item-id]')?.getAttribute('data-list-item-id');

      if (listItemId) {
        const resolved = this._resolveCandidateMessageId(
          listItemId,
          currentChannelId,
          'data-list-item-id_pure',
          'data-list-item-id_extracted'
        );
        if (resolved) {
          messageId = resolved.messageId;
          extractionMethod = resolved.extractionMethod;
        }
      }
    }

    // Method 3: React fiber traversal (fallback)
    if (!messageId) {
      try {
        const fiber = this.getReactFiber(messageElement);
        if (fiber) {
          let currentFiber = fiber;
          for (let i = 0; i < 15 && currentFiber; i++) {
            const messageObj =
              currentFiber.memoizedProps?.message ||
              currentFiber.memoizedState?.message ||
              currentFiber.memoizedProps?.messageProps?.message ||
              currentFiber.memoizedProps?.messageProps ||
              currentFiber.stateNode?.props?.message ||
              currentFiber.stateNode?.message;

            if (messageObj?.id) {
              const resolvedFromMessageObj = this._resolveCandidateMessageId(
                messageObj.id,
                currentChannelId,
                'react_fiber_message_obj',
                'react_fiber_message_obj_extracted'
              );
              if (resolvedFromMessageObj) {
                messageId = resolvedFromMessageObj.messageId;
                extractionMethod = resolvedFromMessageObj.extractionMethod;
                break;
              }
            }

            const msgId = this._extractFiberMessageId(currentFiber);
            if (msgId) {
              const resolvedFromFiber = this._resolveCandidateMessageId(
                msgId,
                currentChannelId,
                'react_fiber_message_id',
                'react_fiber_extracted'
              );
              if (resolvedFromFiber) {
                messageId = resolvedFromFiber.messageId;
                extractionMethod = resolvedFromFiber.extractionMethod;
                break;
              }
            }
            currentFiber = currentFiber.return;
          }
        }
      } catch (error) {
        this.debugError('GET_MESSAGE_ID', 'Error while traversing React fiber tree', error);
      }
    }

    // Method 4: id attribute
    if (!messageId) {
      const idAttr =
        messageElement.getAttribute('id') || messageElement.closest('[id]')?.getAttribute('id');
      if (idAttr) {
        const resolved = this._resolveCandidateMessageId(
          idAttr,
          currentChannelId,
          'id_attr_pure',
          'id_attr_extracted'
        );
        if (resolved) {
          messageId = resolved.messageId;
          extractionMethod = resolved.extractionMethod;
        }
      }
    }

    // Normalize to string and trim, then validate
    if (messageId) {
      messageId = String(messageId).trim();
      if (!this.isValidDiscordId(messageId)) {
        const extracted = this.extractPureDiscordId(messageId);
        messageId = extracted || null;
        extractionMethod = extracted
          ? extractionMethod
            ? `${extractionMethod}_extracted`
            : 'regex_extracted'
          : null;
      }
    }

    // Method 5: Fallback - content hash
    if (!messageId) {
      const content = messageElement.textContent?.trim() || '';
      const author =
        dc.query(messageElement, 'username')?.textContent?.trim() ||
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

    // Validate message ID format
    if (messageId) {
      const isValidFormat = this.isValidDiscordId(messageId);
      const isContentHash =
        extractionMethod === 'content_hash' || extractionMethod === 'content_only_hash';
      const isSuspicious = !isContentHash && (messageId.length < 17 || messageId.length > 19);

      const shouldLog =
        debugContext?.verbose ||
        (debugContext && (isSuspicious || (!isContentHash && !isValidFormat)));
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

      if (isSuspicious) {
        this.debugLog('GET_MESSAGE_ID', 'WARNING: Suspicious message ID extracted', {
          messageId,
          length: messageId.length,
          method: extractionMethod,
          elementId: messageElement.getAttribute('id'),
        });
      }
    }

    // PERF: Cache result in WeakMap
    if (messageElement && messageId) {
      this._msgIdCache?.set(messageElement, messageId);
    }
    return messageId;
  },

  /**
   * Extracts author/user ID from a message element
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {string|null} Author ID or null if not found
   */
  getAuthorId(messageElement) {
    try {
      const fiber = this.getReactFiber(messageElement);

      if (fiber) {
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

      const authorElement =
        messageElement.querySelector('[class*="author"]') ||
        dc.query(messageElement, 'username') ||
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
  },

  /**
   * Extracts message ID from a message element (alias for getMessageIdFromElement)
   * @param {HTMLElement} element - The message DOM element
   * @param {Object} [debugContext] - Optional debug context
   * @returns {string|null} Message ID or null if not found
   */
  getMessageIdentifier(element, debugContext = {}) {
    return this.getMessageIdFromElement(element, debugContext);
  },

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
  },

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
  },

  /**
   * Gets the current user's Discord ID from Webpack modules
   * Stores it in settings for persistence
   */
  getCurrentUserId() {
    try {
      const UserStore = this.webpackModules.UserStore || BdApi.Webpack.getStore('UserStore');
      const user = UserStore?.getCurrentUser();
      if (user?.id) {
        this.currentUserId = user.id;
        this.settings.ownUserId = user.id;
        this.saveSettings();
      }
    } catch (_) {}
  },

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
  },
};
