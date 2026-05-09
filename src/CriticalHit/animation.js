/**
 * CriticalHit — Animation methods.
 * Floating text, combo display, screen shake, duplicate detection,
 * position calculation, animation container, user combo management.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');
const dc = require('../shared/discord-classes');

module.exports = {
  _getElementCenterPosition(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  },

  _calculatePositionDistance(pos1, pos2) {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
  },

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
   * Checks for duplicate animations already in the DOM.
   * Method 1: by message ID (fastest). Method 2: position-based for null messageId.
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

  _getDefaultCenterPosition() {
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
  },

  _isValidPosition(position) {
    return (
      position &&
      typeof position.x === 'number' &&
      typeof position.y === 'number' &&
      !isNaN(position.x) &&
      !isNaN(position.y)
    );
  },

  _clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

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

  calculateComboSize(combo) {
    if (!combo || combo <= 1) return 1.0;
    const cappedCombo = Math.min(combo, C.ANIMATION_MAX_COMBO_SCALE);
    return 1.0 + (cappedCombo - 1) * C.ANIMATION_COMBO_SIZE_INCREMENT;
  },

  formatComboText(combo) {
    return combo > 1 ? ` X${combo}` : '';
  },

  /**
   * Creates the base animation element.
   * critFont (Friend or Foe BB) is used here; animationFont (Speedy Space Goat Oddity)
   * is reserved for the Arise animation.
   */
  _createBaseAnimationElement(messageId) {
    const textElement = document.createElement('div');
    textElement.className = 'cha-critical-hit-text';

    const critFont = this.settings?.critFont || C.DEFAULT_CRIT_FONT;
    textElement.style.fontFamily = critFont;

    if (messageId) {
      textElement.setAttribute('data-cha-message-id', messageId);
    }

    textElement._chaCreatedTime = Date.now();

    return textElement;
  },

  _setAnimationText(element, combo, displayCombo = combo) {
    const showCombo = this.settings?.showCombo !== false;
    const safeDisplayCombo = Math.max(1, Math.floor(Number(displayCombo) || 1));
    const comboText = showCombo && safeDisplayCombo > 1 ? this.formatComboText(safeDisplayCombo) : '';
    element.textContent = `CRITICAL HIT!${comboText}`;
  },

  _getComboCountUpDuration(targetCombo) {
    const safeTarget = Math.max(1, Math.floor(Number(targetCombo) || 1));
    // Slow combo count-up to ~1/3 speed (about 3x longer) so players can read the chain.
    return Math.min(1140, 360 + (Math.min(40, safeTarget) - 1) * 27);
  },

  _cancelComboCountUp(element) {
    if (!element?._chaComboCountRaf) return;
    cancelAnimationFrame(element._chaComboCountRaf);
    element._chaComboCountRaf = null;
  },

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

  _applyComboFontSize(element, combo) {
    if (combo > 1) {
      const comboSize = this.calculateComboSize(combo);
      const fontSize = `${C.ANIMATION_BASE_FONT_SIZE * comboSize}rem`;
      this.applyStyles(element, { 'font-size': fontSize });
    }
  },

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

  createAnimationElement(messageId, combo, position) {
    const textElement = this._createBaseAnimationElement(messageId);
    const showCombo = this.settings?.showCombo !== false;
    const shouldCountUp = showCombo && combo > 1;
    this._setAnimationText(textElement, combo, shouldCountUp ? 1 : combo);
    this._applyComboFontSize(textElement, combo);
    this._applyAnimationPosition(textElement, position);

    return textElement;
  },

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

    if (!messageElement?.classList || !messageElement.isConnected) {
      this._clearAnimationTracking(messageId);
      return;
    }

    if (!messageElement?.classList?.contains('bd-crit-hit')) {
      requestAnimationFrame(() => {
        if (!messageElement.classList?.contains('bd-crit-hit')) {
          this._clearAnimationTracking(messageId);
          return;
        }
        this.showAnimation(messageElement, messageId, comboOverride);
      });
      return;
    }

    // Use comboOverride if provided (prevents race conditions during spam).
    // CRITICAL: If comboOverride is null/undefined, use current combo WITHOUT incrementing —
    // combo should already be updated by handleCriticalHit before calling showAnimation.
    let combo = comboOverride;
    if (combo === null || combo === undefined) {
      const userId = this.getUserId(messageElement) || 'unknown';
      const userCombo = this.getUserCombo(userId);
      combo = userCombo.comboCount || 1;
    }

    const position = this.getMessageAreaPosition();
    const container = this.getAnimationContainer();
    if (!container) { return; }

    if (this.hasDuplicateInDOM(container, messageId, position)) {
      return;
    }

    this.fadeOutExistingAnimations();

    const textElement = this.createAnimationElement(messageId, combo, position);
    container.appendChild(textElement);
    this.activeAnimations.add(textElement);
    combo > 1 && this._animateComboCountUp(textElement, combo);
    this._scheduleCritVisualRecheck(messageElement, messageId);

    // Delay shake to sync with animation visibility: 3% of duration = when text is fully visible.
    if (this.settings?.screenShake) {
      const animationDuration = this.settings.animationDuration || 4000;
      const shakeDelay = animationDuration * 0.03; // 3% visibility threshold
      this._setTrackedTimeout(() => this.applyScreenShake(), shakeDelay);
    }

    this.scheduleCleanup(textElement, messageId, container);
  },

  /**
   * Fades out existing animations when a new critical hit fires.
   * Checks both activeAnimations Set and DOM container for completeness.
   */
  fadeOutExistingAnimations() {
    const container = this.getAnimationContainer();
    if (!container) return;

    const existingElements = container.querySelectorAll('.cha-critical-hit-text');

    if (!existingElements.length) return;

    const fadeOutDuration = 300;

    existingElements.forEach((existingEl) => {
      if (!existingEl.parentNode) {
        this._cancelComboCountUp(existingEl);
        this.activeAnimations.delete(existingEl);
        return;
      }

      try {
        this._cancelComboCountUp(existingEl);

        if (existingEl._chaCleanupTimeout) {
          clearTimeout(existingEl._chaCleanupTimeout);
          existingEl._chaCleanupTimeout = null;
        }

        existingEl.style.animation = 'none';
        existingEl.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
        existingEl.style.opacity = '0';

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
   * Schedules cleanup after animation completes.
   * Waits full animation duration; only removes element, does not clear animation styles.
   */
  scheduleCleanup(textElement, messageId, container) {
    const cleanupDelay = this.settings.animationDuration + 100;

    const cleanupTimeout = this._setTrackedTimeout(() => {
      try {
        if (!textElement.parentNode) {
          this._cancelComboCountUp(textElement);
          this.activeAnimations.delete(textElement);
          return;
        }

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

  getUserCombo(userId) {
    const key = userId || 'unknown';
    if (!this.userCombos.has(key)) {
      this.userCombos.set(key, { comboCount: 0, lastCritTime: 0, timeout: null });
    }
    return this.userCombos.get(key);
  },

  _resetUserComboAfterTimeout(key) {
    if (this.userCombos.has(key)) {
      const comboObj = this.userCombos.get(key);
      comboObj.comboCount = 0;
      comboObj.lastCritTime = 0;
    }
  },

  updateUserCombo(userId, comboCount, lastCritTime) {
    const key = userId || 'unknown';
    const combo = this.getUserCombo(key);
    combo.comboCount = comboCount;
    combo.lastCritTime = lastCritTime;

    this._clearTrackedTimeout(combo.timeout);
    combo.timeout = null;
    combo.timeout = this._setTrackedTimeout(
      () => this._resetUserComboAfterTimeout(key),
      C.COMBO_RESET_TIMEOUT_MS
    );
  },

  /**
   * Gets or creates the animation container (fixed, full-viewport, pointer-events: none).
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

  getMessageAreaPosition() {
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

  applyScreenShake() {
    const discordContainer = document.querySelector(C.DISCORD_APP_SELECTOR) || document.body;
    if (!discordContainer) return;

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
