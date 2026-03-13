/**
 * CriticalHit — Message filtering methods.
 * Determines which messages should be excluded from crit detection.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');
const dc = require('../shared/discord-classes');

module.exports = {
  /**
   * Checks if an element is in a header/username/timestamp area
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if element is in header area
   */
  isInHeaderArea(element) {
    if (!element) return true;

    // Check element's own classes first (fastest check)
    const classes = Array.from(element.classList || []);
    if (classes.some((c) => C.HEADER_CLASS_PATTERNS.some((pattern) => c.includes(pattern)))) {
      return true;
    }

    // Check if element contains username/timestamp/author elements as children
    if (
      dc.query(element, 'username') ||
      dc.query(element, 'timestamp') ||
      element.querySelector('[class*="author"]')
    ) {
      return true;
    }

    // Check parent chain using selectors
    if (C.HEADER_SELECTORS.some((selector) => element.closest(selector))) {
      return true;
    }

    // Check if element's text content looks like a username or timestamp
    const text = element.textContent?.trim() || '';
    if (text.match(/^\d{1,2}:\d{2}$/) || text.length < 3) {
      return true;
    }

    return false;
  },

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
  },

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
      while (fiber && depth < C.MAX_REPLY_FIBER_DEPTH) {
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
  },

  /**
   * Checks if element has system-related classes
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if has system classes
   */
  _hasSystemClasses(element) {
    const classes = Array.from(element.classList || []);
    return classes.some((c) => c.includes('system') || c.includes('join') || c.includes('leave'));
  },

  /**
   * Checks if author element has bot classes
   * @param {HTMLElement} authorElement - Author element to check
   * @returns {boolean} True if bot classes found
   */
  _hasBotAuthorClasses(authorElement) {
    if (!authorElement) return false;
    const authorClasses = Array.from(authorElement.classList || []);
    return authorClasses.some((c) => c.includes('bot'));
  },

  /**
   * Determines if a message should be filtered based on settings
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
  },

  /**
   * Checks if a message is a reply to another message
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is a reply
   */
  isReplyMessage(messageElement) {
    if (!messageElement) return false;

    // Method 1: Check for reply indicator elements
    if (C.REPLY_SELECTORS.some((selector) => messageElement.querySelector(selector))) {
      return true;
    }

    // Method 2: Check for reply wrapper/container
    if (
      messageElement.closest('[class*="reply"]') !== null ||
      messageElement.closest(dc.sel.repliedMessage) !== null
    ) {
      return true;
    }

    // Method 3: Check class names on the message element itself
    if (this._hasReplyClasses(messageElement)) {
      return true;
    }

    // Method 4: Check for React props (Discord stores reply data in React)
    return this._checkReactFiberForReply(messageElement);
  },

  /**
   * Checks if a message is a system message (join, leave, etc.)
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is a system message
   */
  isSystemMessage(messageElement) {
    if (!messageElement) return false;

    // Check for system message selectors
    if (
      C.SYSTEM_MESSAGE_SELECTORS.some(
        (selector) => messageElement.querySelector(selector) || messageElement.matches(selector)
      )
    ) {
      return true;
    }

    // Check if message has system message classes
    return this._hasSystemClasses(messageElement);
  },

  /**
   * Checks if a message is from a bot user
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is from a bot
   */
  isBotMessage(messageElement) {
    if (!messageElement) return false;

    // Check for bot indicators
    const botIndicator = C.BOT_SELECTORS.some((selector) =>
      messageElement.querySelector(selector)
    );
    if (botIndicator) return true;

    // Check author/username area
    const authorElement =
      dc.query(messageElement, 'username') ||
      messageElement.querySelector('[class*="author"]');

    return this._hasBotAuthorClasses(authorElement);
  },

  /**
   * Checks if message has text content
   * @param {HTMLElement} messageElement - Element to check
   * @returns {boolean} True if has text
   */
  _hasTextContent(messageElement) {
    const textContent = messageElement.textContent?.trim() || '';
    if (textContent.length > 0) return true;

    const contentElement =
      dc.query(messageElement, 'messageContent') ||
      dc.query(messageElement, 'content');
    return (contentElement?.textContent?.trim().length || 0) > 0;
  },

  /**
   * Checks if message has embeds or attachments
   * @param {HTMLElement} messageElement - Element to check
   * @returns {boolean} True if has embeds/attachments
   */
  _hasEmbedsOrAttachments(messageElement) {
    const hasEmbed = messageElement.querySelector('[class*="embed"]') !== null;
    const hasAttachment = messageElement.querySelector('[class*="attachment"]') !== null;
    return hasEmbed || hasAttachment;
  },

  /**
   * Checks if a message is empty (only embeds/attachments, no text)
   * @param {HTMLElement} messageElement - The message DOM element
   * @returns {boolean} True if message is empty
   */
  isEmptyMessage(messageElement) {
    if (!messageElement) return false;

    // If no text but has embeds/attachments, it's an empty message
    return !this._hasTextContent(messageElement) && this._hasEmbedsOrAttachments(messageElement);
  },
};
