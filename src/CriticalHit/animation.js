/**
 * CriticalHit — Animation methods.
 * Floating text, combo display, screen shake, duplicate detection,
 * position calculation, animation container, user combo management.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');
const dc = require('../shared/discord-classes');

module.exports = {
  // --------------------------------------------------------------------------
  // Duplicate Detection
  // --------------------------------------------------------------------------

  /**
   * Calculates the center position of an element from its bounding rect
   * @param {DOMRect} rect - Element's bounding rectangle
   * @returns {Object} Center position with x and y coordinates
   */
  _getElementCenterPosition(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  },

  /**
   * Calculates Manhattan distance between two positions
   * @param {Object} pos1 - First position with x and y
   * @param {Object} pos2 - Second position with x and y
   * @returns {number} Manhattan distance
   */
  _calculatePositionDistance(pos1, pos2) {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
  },

  /**
   * Checks if an active animation matches position and time criteria
   * @param {HTMLElement} activeEl - Active animation element
   * @param {Object} targetPosition - Target position to check against
   * @param {number} currentTime - Current timestamp
   * @returns {boolean} True if matches duplicate criteria
   */
  _isAnimationDuplicate(activeEl, targetPosition, currentTime) {
    if (!activeEl.parentNode) return false;

    try {
      const activeRect = activeEl.getBoundingClientRect();
      const activePosition = this._getElementCenterPosition(activeRect);
      const positionDiff = this._calculatePositionDistance(activePosition, targetPosition);
      const timeDiff = currentTime - (activeEl._chaCreatedTime || 0);

      return (
        positionDiff < C.ANIMATION_POSITION_TOLERANCE && timeDiff < C.ANIMATION_TIME_TOLERANCE
      );
    } catch (error) {
      return false;
    }
  },

  /**
   * Checks for duplicate animations already in the DOM
   * Prevents multiple animations for the same message
   * @param {HTMLElement} container - Animation container element
   * @param {string} messageId - The message ID
   * @param {Object} position - Position object with x and y coordinates
   * @returns {boolean} True if duplicate found
   */
  hasDuplicateInDOM(container, messageId, position) {
    if (!container || !position) return false;

    // Method 1: Check by message ID (fastest)
    if (messageId) {
      const existingCount = container.querySelectorAll(
        `[data-cha-message-id="${messageId}"]`
      ).length;
      if (existingCount > 0) return true;
    }

    // Method 2: Position-based check for null messageId
    const now = Date.now();
    return Array.from(this.activeAnimations).some((activeEl) =>
      this._isAnimationDuplicate(activeEl, position, now)
    );
  },

  // --------------------------------------------------------------------------
  // Position Calculation
  // --------------------------------------------------------------------------

  /**
   * Gets default center position for fallback
   * @returns {Object} Center position of window
   */
  _getDefaultCenterPosition() {
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
  },

  /**
   * Validates position object structure
   * @param {Object} position - Position to validate
   * @returns {boolean} True if valid position object
   */
  _isValidPosition(position) {
    return (
      position &&
      typeof position.x === 'number' &&
      typeof position.y === 'number' &&
      !isNaN(position.x) &&
      !isNaN(position.y)
    );
  },

  /**
   * Clamps a value between min and max bounds
   * @param {number} value - Value to clamp
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} Clamped value
   */
  _clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  /**
   * Gets a random spawn position within reasonable window bounds
   * Keeps animation visible but adds dynamic variation
   * @param {Object} basePosition - Base position object with x and y
   * @returns {Object} Random position within window bounds
   */
  getRandomSpawnPosition(basePosition) {
    if (!this._isValidPosition(basePosition)) {
      return this._getDefaultCenterPosition();
    }

    const padding = C.ANIMATION_SPAWN_PADDING;
    const randomOffsetX = (Math.random() - 0.5) * C.ANIMATION_HORIZONTAL_VARIATION;
    const randomOffsetY = (Math.random() - 0.5) * C.ANIMATION_VERTICAL_VARIATION;

    const x = this._clampValue(
      basePosition.x + randomOffsetX,
      padding,
      window.innerWidth - padding
    );
    const y = this._clampValue(
      basePosition.y + randomOffsetY,
      padding,
      window.innerHeight - padding
    );

    return { x, y };
  },

  // --------------------------------------------------------------------------
  // Combo Calculation
  // --------------------------------------------------------------------------

  /**
   * Calculates combo size multiplier based on combo count
   * @param {number} combo - Combo count
   * @returns {number} Size multiplier
   */
  calculateComboSize(combo) {
    if (!combo || combo <= 1) return 1.0;
    const cappedCombo = Math.min(combo, C.ANIMATION_MAX_COMBO_SCALE);
    return 1.0 + (cappedCombo - 1) * C.ANIMATION_COMBO_SIZE_INCREMENT;
  },

  /**
   * Formats combo text for display
   * @param {number} combo - Combo count
   * @returns {string} Formatted combo text (e.g., " X2")
   */
  formatComboText(combo) {
    return combo > 1 ? ` X${combo}` : '';
  },

  // --------------------------------------------------------------------------
  // Animation Element Creation
  // --------------------------------------------------------------------------

  /**
   * Creates the base animation text element with class and attributes
   * @param {string} messageId - Message ID for duplicate detection
   * @returns {HTMLElement} Base text element
   */
  _createBaseAnimationElement(messageId) {
    const textElement = document.createElement('div');
    textElement.className = 'cha-critical-hit-text';

    // Apply crit font to CRITICAL HIT! floating text (matches the styled message font)
    // animationFont (Speedy Space Goat Oddity) is reserved for the Arise animation, not this
    const critFont = this.settings?.critFont || C.DEFAULT_CRIT_FONT;
    textElement.style.fontFamily = critFont;

    if (messageId) {
      textElement.setAttribute('data-cha-message-id', messageId);
    }

    // Store creation time for duplicate detection
    textElement._chaCreatedTime = Date.now();

    return textElement;
  },

  /**
   * Sets text content for animation element
   * @param {HTMLElement} element - Animation element
   * @param {number} combo - Combo count
   * @param {number} displayCombo - Combo number currently displayed
   */
  _setAnimationText(element, combo, displayCombo = combo) {
    const showCombo = this.settings?.showCombo !== false;
    const safeDisplayCombo = Math.max(1, Math.floor(Number(displayCombo) || 1));
    const comboText = showCombo && safeDisplayCombo > 1 ? this.formatComboText(safeDisplayCombo) : '';
    element.textContent = `CRITICAL HIT!${comboText}`;
  },

  /**
   * Gets the combo count-up animation duration in milliseconds
   * @param {number} targetCombo - Target combo number
   * @returns {number} Duration in ms
   */
  _getComboCountUpDuration(targetCombo) {
    const safeTarget = Math.max(1, Math.floor(Number(targetCombo) || 1));
    // Slow combo count-up to ~1/3 speed (about 3x longer) so players can read the chain.
    return Math.min(1140, 360 + (Math.min(40, safeTarget) - 1) * 27);
  },

  /**
   * Cancels in-flight combo count-up animation for an element
   * @param {HTMLElement} element - Animation element
   */
  _cancelComboCountUp(element) {
    if (!element?._chaComboCountRaf) return;
    cancelAnimationFrame(element._chaComboCountRaf);
    element._chaComboCountRaf = null;
  },

  /**
   * Animates combo text quickly from X1 to target XN
   * @param {HTMLElement} element - Animation element
   * @param {number} targetCombo - Final combo number
   */
  _animateComboCountUp(element, targetCombo) {
    const showCombo = this.settings?.showCombo !== false;
    const safeTarget = Math.max(1, Math.floor(Number(targetCombo) || 1));

    if (!element?.isConnected || !showCombo || safeTarget <= 1) {
      this._setAnimationText(element, safeTarget, safeTarget);
      return;
    }

    if (typeof requestAnimationFrame !== 'function') {
      this._setAnimationText(element, safeTarget, safeTarget);
      return;
    }

    this._cancelComboCountUp(element);
    this._setAnimationText(element, safeTarget, 1);

    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duration = this._getComboCountUpDuration(safeTarget);

    const tick = (now) => {
      if (!element?.isConnected) {
        this._cancelComboCountUp(element);
        return;
      }

      const elapsed = Math.max(0, now - start);
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const displayCombo = Math.min(
        safeTarget,
        Math.max(1, Math.round(1 + (safeTarget - 1) * eased))
      );

      this._setAnimationText(element, safeTarget, displayCombo);

      if (progress >= 1) {
        element._chaComboCountRaf = null;
        this._setAnimationText(element, safeTarget, safeTarget);
        return;
      }

      element._chaComboCountRaf = requestAnimationFrame(tick);
    };

    element._chaComboCountRaf = requestAnimationFrame(tick);
  },

  /**
   * Applies font size styling based on combo
   * @param {HTMLElement} element - Animation element
   * @param {number} combo - Combo count
   */
  _applyComboFontSize(element, combo) {
    if (combo > 1) {
      const comboSize = this.calculateComboSize(combo);
      const fontSize = `${C.ANIMATION_BASE_FONT_SIZE * comboSize}rem`;
      this.applyStyles(element, { 'font-size': fontSize });
    }
  },

  /**
   * Applies position styling to animation element
   * @param {HTMLElement} element - Animation element
   * @param {Object} position - Position object with x and y
   */
  _applyAnimationPosition(element, position) {
    if (!this._isValidPosition(position)) return;

    const spawnPosition = this.getRandomSpawnPosition(position);
    this.applyStyles(element, {
      position: 'absolute',
      left: `${spawnPosition.x}px`,
      top: `${spawnPosition.y}px`,
      transform: 'translate(-50%, -50%)',
    });
  },

  /**
   * Creates and configures the critical hit animation element
   * Centralizes animation element creation for consistency
   * @param {string} messageId - Message ID
   * @param {number} combo - Combo count
   * @param {Object} position - Position object with x and y
   * @returns {HTMLElement} Configured animation element
   */
  createAnimationElement(messageId, combo, position) {
    const textElement = this._createBaseAnimationElement(messageId);
    const showCombo = this.settings?.showCombo !== false;
    const shouldCountUp = showCombo && combo > 1;
    this._setAnimationText(textElement, combo, shouldCountUp ? 1 : combo);
    this._applyComboFontSize(textElement, combo);
    this._applyAnimationPosition(textElement, position);

    return textElement;
  },

  // --------------------------------------------------------------------------
  // Animation Deduplication & Display
  // --------------------------------------------------------------------------

  /**
   * Checks if animation should be allowed based on existing data
   * @param {string} messageId - Message ID
   * @param {HTMLElement} messageElement - Message element
   * @param {Object} existingData - Existing animation data
   * @returns {boolean} True if animation should proceed
   */
  _shouldAllowAnimation(messageId, messageElement, existingData) {
    const content = this.findMessageContentElement(messageElement);
    const author = this.getAuthorId(messageElement);
    const contentText = content?.textContent?.trim();
    const contentHash = this.calculateContentHash(author, contentText);

    if (existingData?.contentHash && contentHash === existingData.contentHash) {
      const timeSinceAnimated = Date.now() - existingData.timestamp;
      const originalElementStillConnected = document.querySelector(
        `[data-message-id="${messageId}"]`
      )?.isConnected;
      const isValidDiscordId = /^\d{17,19}$/.test(messageId);

      if (isValidDiscordId) {
        return true;
      }

      return (
        timeSinceAnimated > C.TIME_TOLERANCE_MS ||
        (!originalElementStillConnected && timeSinceAnimated > C.TIME_TOLERANCE_MS / 2)
      );
    }

    return messageElement?.isConnected;
  },

  /**
   * Displays the "CRITICAL HIT!" animation with combo count
   * Handles duplicate detection, positioning, and cleanup
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {string} messageId - The message ID
   * @param {number|null} comboOverride - Optional combo count override
   */
  showAnimation(messageElement, messageId, comboOverride = null) {
    // HARD SAFETY NET: Never animate old messages (e.g., jump-to-message, scroll-back).
    // Only fresh messages (< 5 minutes) should get the "CRITICAL HIT!" animation.
    if (messageId && this.isValidDiscordId(messageId)) {
      const DISCORD_EPOCH = 1420070400000;
      const MESSAGE_AGE_GATE_MS = 5 * 60 * 1000;
      const messageTimestamp = Number(BigInt(messageId) >> 22n) + DISCORD_EPOCH;
      if (Date.now() - messageTimestamp > MESSAGE_AGE_GATE_MS) {
        return; // Old message — silent restore only, no animation
      }
    }

    if (messageId && this.animatedMessages.has(messageId)) {
      const existingData = this.animatedMessages.get(messageId);
      if (!this._shouldAllowAnimation(messageId, messageElement, existingData)) {
        return;
      }
      this.animatedMessages.delete(messageId);
    }

    if (this.settings?.animationEnabled === false) { return; }

    // Final safety check - be lenient, just need crit class and DOM presence
    if (!messageElement?.classList || !messageElement.isConnected) {
      this._clearAnimationTracking(messageId);
      return;
    }

    // Check for crit class - if missing, try one more time after brief delay
    if (!messageElement?.classList?.contains('bd-crit-hit')) {
      // Give it one more frame to get the class
      requestAnimationFrame(() => {
        if (!messageElement.classList?.contains('bd-crit-hit')) {
          this._clearAnimationTracking(messageId);
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
    }

    // Get position and container
    const position = this.getMessageAreaPosition();
    const container = this.getAnimationContainer();
    if (!container) { return; }

    // Check for duplicate animations in DOM
    if (this.hasDuplicateInDOM(container, messageId, position)) {
      return;
    }

    // Fade out existing animations before starting new one
    this.fadeOutExistingAnimations();

    // Create animation element
    const textElement = this.createAnimationElement(messageId, combo, position);
    container.appendChild(textElement);
    this.activeAnimations.add(textElement);
    combo > 1 && this._animateComboCountUp(textElement, combo);
    this._scheduleCritVisualRecheck(messageElement, messageId);

    // Apply screen shake if enabled - delay to sync with animation becoming visible
    // Animation fades in quickly: 0% (invisible) → 3% (fully visible) = 120ms for 4000ms duration
    // Delay shake to trigger when animation becomes fully visible (3% = 120ms)
    if (this.settings?.screenShake) {
      const animationDuration = this.settings.animationDuration || 4000;
      const shakeDelay = animationDuration * 0.03; // 3% = when animation becomes fully visible (120ms)
      this._setTrackedTimeout(() => this.applyScreenShake(), shakeDelay);
    }

    // Cleanup after animation completes
    this.scheduleCleanup(textElement, messageId, container);
  },

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
        this._cancelComboCountUp(existingEl);
        this.activeAnimations.delete(existingEl);
        return;
      }

      try {
        this._cancelComboCountUp(existingEl);

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
        this._setTrackedTimeout(() => {
          try {
            this._cancelComboCountUp(existingEl);
            existingEl.parentNode && existingEl.remove();
            this.activeAnimations.delete(existingEl);
          } catch (e) {
            this.activeAnimations.delete(existingEl);
          }
        }, fadeOutDuration);
      } catch (e) {
        // If fade fails, just remove immediately
        try {
          this._cancelComboCountUp(existingEl);
          existingEl.parentNode && existingEl.remove();
          this.activeAnimations.delete(existingEl);
        } catch (error2) {
          this.activeAnimations.delete(existingEl);
        }
      }
    });
  },

  /**
   * Schedule cleanup after animation completes
   * Waits full animation duration - only removes element, doesn't clear animation styles
   */
  scheduleCleanup(textElement, messageId, container) {
    const cleanupDelay = this.settings.animationDuration + 100;

    // Wait for full animation duration - don't interfere with animation
    const cleanupTimeout = this._setTrackedTimeout(() => {
      try {
        if (!textElement.parentNode) {
          this._cancelComboCountUp(textElement);
          this.activeAnimations.delete(textElement);
          return;
        }

        // Handle duplicate elements with same messageId
        if (messageId) {
          const allElements = container.querySelectorAll(`[data-cha-message-id="${messageId}"]`);
          allElements.length > 1 &&
            allElements.forEach((el) => {
              try {
                this._cancelComboCountUp(el);
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

        // Only remove element - don't clear animation styles
        // Animation has completed, CSS fade-out is done, just remove from DOM
        this._cancelComboCountUp(textElement);
        textElement.parentNode && textElement.remove();
        this.activeAnimations.delete(textElement);
      } catch (e) {
        this._cancelComboCountUp(textElement);
        this.activeAnimations.delete(textElement);
      }
    }, cleanupDelay);

    textElement._chaCleanupTimeout = cleanupTimeout;
  },

  // --------------------------------------------------------------------------
  // User Combo Management
  // --------------------------------------------------------------------------

  /**
   * Gets or creates user combo object
   * @param {string} userId - User ID
   * @returns {Object} User combo object
   */
  getUserCombo(userId) {
    const key = userId || 'unknown';
    if (!this.userCombos.has(key)) {
      this.userCombos.set(key, { comboCount: 0, lastCritTime: 0, timeout: null });
    }
    return this.userCombos.get(key);
  },

  /**
   * Saves user combo to storage
   * @param {string} userId - User ID
   * @param {number} comboCount - Combo count
   * @param {number} lastCritTime - Last crit time
   */
  _saveUserComboToStorage(_userId, _comboCount, _lastCritTime) {
    // Combo state is tracked in-memory via userCombos Map; no persistent storage needed.
  },

  /**
   * Resets user combo after timeout
   * @param {string} key - User key
   */
  _resetUserComboAfterTimeout(key) {
    if (this.userCombos.has(key)) {
      const comboObj = this.userCombos.get(key);
      comboObj.comboCount = 0;
      comboObj.lastCritTime = 0;
      this._saveUserComboToStorage(key, 0, 0);
    }
  },

  /**
   * Updates combo count for a user and sets timeout to reset combo
   * Persists combo to storage and handles combo expiration
   * @param {string} userId - The user ID
   * @param {number} comboCount - The new combo count
   * @param {number} lastCritTime - Timestamp of the crit
   */
  updateUserCombo(userId, comboCount, lastCritTime) {
    const key = userId || 'unknown';
    const combo = this.getUserCombo(key);
    combo.comboCount = comboCount;
    combo.lastCritTime = lastCritTime;

    this._saveUserComboToStorage(key, comboCount, lastCritTime);

    this._clearTrackedTimeout(combo.timeout);
    combo.timeout = null;
    combo.timeout = this._setTrackedTimeout(
      () => this._resetUserComboAfterTimeout(key),
      C.COMBO_RESET_TIMEOUT_MS
    );
  },

  // --------------------------------------------------------------------------
  // Animation Container & Position
  // --------------------------------------------------------------------------

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
  },

  /**
   * Gets the position of the message area for animation positioning
   * @returns {Object} Position object with x and y coordinates
   */
  getMessageAreaPosition() {
    // Use cached selectors if available
    if (!this._cachedChatInput || !document.contains(this._cachedChatInput)) {
      this._cachedChatInput = document.querySelector(dc.sel.channelTextArea);
    }
    if (!this._cachedMessageList || !document.contains(this._cachedMessageList)) {
      this._cachedMessageList = document.querySelector(dc.sel.messagesWrapper);
    }

    const target = this._cachedChatInput || this._cachedMessageList;
    if (target) {
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    return { x: window.innerWidth / 2, y: window.innerHeight / 2 + 50 };
  },

  // --------------------------------------------------------------------------
  // Screen Shake Effect
  // --------------------------------------------------------------------------

  /**
   * Creates screen shake CSS keyframes
   * @param {number} intensity - Shake intensity in pixels
   * @param {number} duration - Shake duration in milliseconds
   * @returns {string} CSS text
   */
  _createScreenShakeCSS(intensity, duration) {
    return `
      @keyframes ${C.SCREEN_SHAKE_KEYFRAME} {
        0%, 100% { transform: translate(0, 0); }
        25% { transform: translate(-${intensity}px, ${intensity}px); }
        50% { transform: translate(${intensity}px, -${intensity}px); }
        75% { transform: translate(-${intensity}px, -${intensity}px); }
      }
      .${C.SCREEN_SHAKE_CLASS} {
        animation: ${C.SCREEN_SHAKE_KEYFRAME} ${duration}ms ease-in-out;
      }
    `;
  },

  /**
   * Applies screen shake effect to the entire page
   * Uses CSS animation based on settings (intensity and duration)
   */
  applyScreenShake() {
    const discordContainer = document.querySelector(C.DISCORD_APP_SELECTOR) || document.body;
    if (!discordContainer) return;

    // Reuse a single <style> element for screen shake CSS
    if (!this._shakeStyleEl) {
      this._shakeStyleEl = document.createElement('style');
      this._shakeStyleEl.id = 'crit-hit-screen-shake';
      document.head.appendChild(this._shakeStyleEl);
    }
    this._shakeStyleEl.textContent = this._createScreenShakeCSS(
      this.settings.shakeIntensity,
      this.settings.shakeDuration
    );
    discordContainer.classList.add(C.SCREEN_SHAKE_CLASS);

    this._setTrackedTimeout(() => {
      discordContainer.classList.remove(C.SCREEN_SHAKE_CLASS);
    }, this.settings.shakeDuration);
  },
};
