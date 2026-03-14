/**
 * CriticalHit — Message filtering methods.
 * Determines which messages should be excluded from crit detection.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');
const dc = require('../shared/discord-classes');

module.exports = {
  isInHeaderArea(element) {
    if (!element) return true;

    const classes = Array.from(element.classList || []);
    if (classes.some((c) => C.HEADER_CLASS_PATTERNS.some((pattern) => c.includes(pattern)))) {
      return true;
    }

    if (
      dc.query(element, 'username') ||
      dc.query(element, 'timestamp') ||
      element.querySelector(dc.sel.author)
    ) {
      return true;
    }

    if (C.HEADER_SELECTORS.some((selector) => element.closest(selector))) {
      return true;
    }

    const text = element.textContent?.trim() || '';
    if (text.match(/^\d{1,2}:\d{2}$/) || text.length < 3) {
      return true;
    }

    return false;
  },

  _hasReplyClasses(element) {
    const classes = Array.from(element.classList || []);
    return classes.some(
      (c) => c.toLowerCase().includes('reply') || c.toLowerCase().includes('replied')
    );
  },

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

  _hasSystemClasses(element) {
    const classes = Array.from(element.classList || []);
    return classes.some((c) => c.includes('system') || c.includes('join') || c.includes('leave'));
  },

  _hasBotAuthorClasses(authorElement) {
    if (!authorElement) return false;
    const authorClasses = Array.from(authorElement.classList || []);
    return authorClasses.some((c) => c.includes('bot'));
  },

  shouldFilterMessage(messageElement) {
    if (!messageElement) return false;

    return (
      (this.settings?.filterReplies && this.isReplyMessage(messageElement)) ||
      (this.settings?.filterSystemMessages && this.isSystemMessage(messageElement)) ||
      (this.settings?.filterBotMessages && this.isBotMessage(messageElement)) ||
      (this.settings?.filterEmptyMessages && this.isEmptyMessage(messageElement))
    );
  },

  isReplyMessage(messageElement) {
    if (!messageElement) return false;

    if (C.REPLY_SELECTORS.some((selector) => messageElement.querySelector(selector))) {
      return true;
    }

    if (
      messageElement.closest('[class*="reply"]') !== null ||
      messageElement.closest(dc.sel.repliedMessage) !== null
    ) {
      return true;
    }

    if (this._hasReplyClasses(messageElement)) {
      return true;
    }

    return this._checkReactFiberForReply(messageElement);
  },

  isSystemMessage(messageElement) {
    if (!messageElement) return false;

    if (
      C.SYSTEM_MESSAGE_SELECTORS.some(
        (selector) => messageElement.querySelector(selector) || messageElement.matches(selector)
      )
    ) {
      return true;
    }

    return this._hasSystemClasses(messageElement);
  },

  isBotMessage(messageElement) {
    if (!messageElement) return false;

    const botIndicator = C.BOT_SELECTORS.some((selector) =>
      messageElement.querySelector(selector)
    );
    if (botIndicator) return true;

    const authorElement =
      dc.query(messageElement, 'username') ||
      messageElement.querySelector(dc.sel.author);

    return this._hasBotAuthorClasses(authorElement);
  },

  _hasTextContent(messageElement) {
    const textContent = messageElement.textContent?.trim() || '';
    if (textContent.length > 0) return true;

    const contentElement =
      dc.query(messageElement, 'messageContent') ||
      dc.query(messageElement, 'content');
    return (contentElement?.textContent?.trim().length || 0) > 0;
  },

  _hasEmbedsOrAttachments(messageElement) {
    const hasEmbed = messageElement.querySelector(dc.sel.embed) !== null;
    const hasAttachment = messageElement.querySelector(dc.sel.attachment) !== null;
    return hasEmbed || hasAttachment;
  },

  isEmptyMessage(messageElement) {
    if (!messageElement) return false;

    return !this._hasTextContent(messageElement) && this._hasEmbedsOrAttachments(messageElement);
  },
};
