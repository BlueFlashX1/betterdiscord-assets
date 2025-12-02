/**
 * @name CriticalHitAnimation
 * @author BlueFlashXS
 * @description Animated "CRITICAL HIT!" notification with screen shake when crits land
 * @version 2.2.0
 */

module.exports = class CriticalHitAnimation {
  constructor() {
    // ============================================================================
    // SETTINGS & CONFIGURATION
    // ============================================================================
    this.defaultSettings = {
      enabled: true,
      animationDuration: 4000, // 4 seconds - balanced visibility without being intrusive
      floatDistance: 150, // Increased for more visible float
      fontSize: 36,
      screenShake: true,
      shakeIntensity: 3,
      shakeDuration: 250,
      cooldown: 500,
      showCombo: true,
      maxCombo: 999,
      ownUserId: null,
    };

    this.settings = this.defaultSettings;

    // ============================================================================
    // STATE MANAGEMENT
    // ============================================================================
    this.animationContainer = null;
    this.activeAnimations = new Set();
    this.userCombos = new Map();
    this.animatedMessages = new Map(); // Stores { position, timestamp, messageId } for duplicate detection
    this.currentUserId = null;
    this.pluginStartTime = Date.now();
    this.lastAnimationTime = 0;

    // Hook registration state
    this.hooksRegistered = false;
    this.hookRegistrationInProgress = false;
    this.patchCallbacks = new Map();

    // Cached DOM queries
    this._cachedChatInput = null;
    this._cachedMessageList = null;
  }

  // ============================================================================
  // PLUGIN LIFECYCLE
  // ============================================================================

  start() {
    console.warn('[CriticalHitAnimation] Starting...');
    this.loadSettings();
    this.injectCSS();

    setTimeout(() => {
      this.getCurrentUserId();
      this.hookIntoCriticalHit();
    }, 1000);

    console.warn('[CriticalHitAnimation] Started');
  }

  stop() {
    BdApi.Patcher.unpatchAll('CriticalHitAnimation');
    this.hooksRegistered = false;
    this.hookRegistrationInProgress = false;
    if (this.patchCallbacks) this.patchCallbacks.clear();

    if (this.animationContainer) {
      this.animationContainer.remove();
      this.animationContainer = null;
    }

    this.activeAnimations.clear();
    this.userCombos.clear();
    this.animatedMessages.clear();

    // Clear cached DOM queries
    this._cachedChatInput = null;
    this._cachedMessageList = null;
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  loadSettings() {
    const saved = BdApi.Data.load('CriticalHitAnimation', 'settings');
    if (saved) {
      this.settings = Object.assign({}, this.defaultSettings, saved);
      // Force animationDuration to 4000ms (4 seconds) - override any old saved value
      this.settings.animationDuration = 4000;
      this.currentUserId = this.settings.ownUserId;
    }
  }

  saveSettings() {
    BdApi.Data.save('CriticalHitAnimation', 'settings', this.settings);
  }

  // ============================================================================
  // USER IDENTIFICATION
  // ============================================================================

  getCurrentUserId() {
    try {
      const UserStore = BdApi.Webpack.getModule((m) => m.getCurrentUser);
      if (UserStore) {
        const user = UserStore.getCurrentUser();
        if (user?.id) {
          this.currentUserId = user.id;
          this.settings.ownUserId = user.id;
          this.saveSettings();
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  isOwnMessage(messageElement, userId) {
    if (this.settings.ownUserId && userId === this.settings.ownUserId) return true;
    if (this.currentUserId && userId === this.currentUserId) return true;

    if (!this.currentUserId) {
      this.getCurrentUserId();
    }

    return userId === this.currentUserId;
  }

  // ============================================================================
  // REACT FIBER UTILITIES (Consolidated)
  // ============================================================================

  /**
   * Get React fiber from element
   * @param {HTMLElement} element - DOM element
   * @returns {Object|null} React fiber or null
   */
  getReactFiber(element) {
    try {
      const reactKey = Object.keys(element).find(
        (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
      );
      return reactKey ? element[reactKey] : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Traverse React fiber tree to find a value
   * @param {Object} fiber - React fiber to start from
   * @param {Function} getter - Function to extract value from fiber
   * @param {number} maxDepth - Maximum traversal depth
   * @returns {any} Found value or null
   */
  traverseFiber(fiber, getter, maxDepth = 50) {
    if (!fiber) return null;

    for (let i = 0; i < maxDepth && fiber; i++) {
      const value = getter(fiber);
      if (value !== null && value !== undefined) return value;
      fiber = fiber.return;
    }

    return null;
  }

  getMessageId(element) {
    try {
      // Try React fiber first
      const fiber = this.getReactFiber(element);
      if (fiber) {
        const messageObj = this.traverseFiber(
          fiber,
          (f) => f.memoizedProps?.message || f.memoizedState?.message
        );
        if (messageObj?.id) {
          const id = String(messageObj.id).trim();
          if (/^\d{17,19}$/.test(id)) return id;
        }
      }

      // Fallback to data attribute
      const dataId = element.getAttribute('data-message-id');
      if (dataId) {
        const match = dataId.match(/^\d{17,19}$/);
        if (match) return match[0];

        const allMatches = dataId.match(/\d{17,19}/g);
        if (allMatches?.length > 0) {
          return allMatches[allMatches.length - 1];
        }
      }
    } catch (e) {}
    return null;
  }

  getUserId(element) {
    try {
      const fiber = this.getReactFiber(element);
      if (fiber) {
        const authorId = this.traverseFiber(
          fiber,
          (f) => f.memoizedProps?.message?.author?.id || f.memoizedState?.message?.author?.id,
          30
        );
        if (authorId && /^\d{17,19}$/.test(String(authorId).trim())) {
          return String(authorId).trim();
        }
      }
    } catch (e) {}
    return null;
  }

  getMessageTimestamp(element) {
    try {
      const fiber = this.getReactFiber(element);
      if (fiber) {
        const timestamp = this.traverseFiber(
          fiber,
          (f) => f.memoizedProps?.message?.timestamp || f.memoizedState?.message?.timestamp,
          30
        );
        if (timestamp) {
          if (timestamp instanceof Date) return timestamp.getTime();
          if (typeof timestamp === 'string') return new Date(timestamp).getTime();
          if (typeof timestamp === 'number') return timestamp;
        }
      }
    } catch (e) {}
    return 0;
  }

  // ============================================================================
  // MESSAGE HISTORY & VALIDATION
  // ============================================================================

  isMessageInHistory(messageId) {
    try {
      const history = BdApi.Data.load('CriticalHit', 'messageHistory');
      if (!Array.isArray(history)) return false;
      return history.some((entry) => String(entry.messageId) === String(messageId));
    } catch (e) {
      return false;
    }
  }

  /**
   * Validate Discord ID format (17-19 digits)
   */
  isValidDiscordId(id) {
    return id && /^\d{17,19}$/.test(String(id).trim());
  }

  // ============================================================================
  // HOOK REGISTRATION & CRITICAL HIT DETECTION
  // ============================================================================

  hookIntoCriticalHit() {
    // Prevent concurrent registrations
    if (this.hookRegistrationInProgress || this.hooksRegistered) {
      return;
    }

    this.hookRegistrationInProgress = true;

    // Clean up existing patches if any
    if (this.patchCallbacks?.size > 0) {
      BdApi.Patcher.unpatchAll('CriticalHitAnimation');
      this.patchCallbacks.clear();
    }

    const critPlugin = BdApi.Plugins.get('CriticalHit');
    if (!critPlugin) {
      this.hookRegistrationInProgress = false;
      setTimeout(() => this.hookIntoCriticalHit(), 2000);
      return;
    }

    const instance = critPlugin.instance || critPlugin;
    if (!instance?.onCritHit) {
      this.hookRegistrationInProgress = false;
      setTimeout(() => this.hookIntoCriticalHit(), 2000);
      return;
    }

    // Check if already patched
    const patchKey = `onCritHit-${instance.constructor?.name || 'unknown'}-${
      instance === critPlugin.instance ? 'instance' : 'direct'
    }`;
    if (this.patchCallbacks?.has(patchKey)) {
      this.hookRegistrationInProgress = false;
      return;
    }

    // Hook into checkForCrit to reset combo for non-crit messages
    if (instance.checkForCrit) {
      BdApi.Patcher.after('CriticalHitAnimation', instance, 'checkForCrit', (_, args) => {
        const messageElement = args[0];
        if (!messageElement) return;

        const userId = this.getUserId(messageElement);
        if (!this.isValidDiscordId(userId) || !this.isOwnMessage(messageElement, userId)) return;

        const messageId = this.getMessageId(messageElement);
        if (!this.isValidDiscordId(messageId)) return;

        // Wait for DOM update, then check if message is actually a crit
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!messageElement.classList?.contains('bd-crit-hit')) {
              const key = userId || 'unknown';
              const combo = this.userCombos.get(key);
              if (combo && !this.animatedMessages.has(messageId)) {
                combo.comboCount = 0;
                if (combo.timeout) {
                  clearTimeout(combo.timeout);
                  combo.timeout = null;
                }
              }
            }
          });
        });
      });
    }

    // Main hook: onCritHit callback
    this.patchCallbacks.set(patchKey, true);
    BdApi.Patcher.after('CriticalHitAnimation', instance, 'onCritHit', (_, args) => {
      this.handleCriticalHit(args[0]);
    });

    this.hooksRegistered = true;
    this.hookRegistrationInProgress = false;
  }

  // ============================================================================
  // CRITICAL HIT HANDLING
  // ============================================================================

  handleCriticalHit(messageElement) {
    if (!messageElement) return;

    // Get message ID and validate
    const messageId = this.getMessageId(messageElement);
    if (!this.isValidDiscordId(messageId)) return;

    // Get element position for duplicate detection (cache early)
    let elementRect;
    try {
      elementRect = messageElement.getBoundingClientRect();
    } catch (e) {
      return; // Element not accessible
    }

    const elementPosition = {
      x: elementRect.left + elementRect.width / 2,
      y: elementRect.top + elementRect.height / 2,
    };
    const elementTimestamp = Date.now();

    // Verify message has crit class and is in DOM
    const hasCritClass = messageElement.classList?.contains('bd-crit-hit');
    const isInDOM = messageElement.isConnected;
    if (!hasCritClass || !isInDOM) return;

    // Position-based duplicate detection (handles element replacement scenarios)
    if (this.isDuplicateByPosition(messageId, elementPosition, elementTimestamp)) {
      return;
    }

    // Atomic check-and-add to prevent race conditions
    if (!this.addToAnimatedMessages(messageId, elementPosition, elementTimestamp)) {
      return; // Already animated
    }

    // Cooldown check
    const now = Date.now();
    if (now - this.lastAnimationTime < 100) {
      this.animatedMessages.delete(messageId); // Remove if cooldown blocked
      return;
    }

    // Validate user
    const userId = this.getUserId(messageElement);
    if (!this.isValidDiscordId(userId) || !this.isOwnMessage(messageElement, userId)) {
      this.animatedMessages.delete(messageId);
      return;
    }

    // Check message age (skip old restored messages)
    if (this.isMessageInHistory(messageId)) {
      const messageTime = this.getMessageTimestamp(messageElement);
      if (Date.now() - (messageTime || 0) > 10000) {
        this.animatedMessages.delete(messageId);
        return;
      }
    }

    this.lastAnimationTime = now;

    // Store position for fallback lookup
    const storedPosition = { ...elementPosition };

    // Use double RAF for DOM stability with fallback recovery
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Try to use original element first
        let targetElement = messageElement;
        let targetMessageId = messageId;

        // Check if original element is still valid
        const isOriginalValid = this.isElementValidForAnimation(messageElement, messageId);

        if (!isOriginalValid) {
          // Try to find element by position (fallback for replaced elements)
          targetElement = this.findElementByPosition(storedPosition, messageId);
          if (targetElement) {
            targetMessageId = this.getMessageId(targetElement) || messageId;
          } else {
            // Last resort: try to find any crit element at this position
            targetElement = this.findCritElementByPosition(storedPosition);
            if (targetElement) {
              targetMessageId = this.getMessageId(targetElement);
              // Update animatedMessages with new messageId if found
              if (targetMessageId && targetMessageId !== messageId) {
                const existingData = this.animatedMessages.get(messageId);
                if (existingData) {
                  this.animatedMessages.delete(messageId);
                  this.animatedMessages.set(targetMessageId, {
                    ...existingData,
                    messageId: targetMessageId,
                  });
                }
              }
            }
          }
        }

        // Final check: ensure we have a valid element
        if (!targetElement || !this.isElementValidForAnimation(targetElement, targetMessageId)) {
          this.markMessageAsRemoved(messageId);
          return;
        }

        this.showAnimation(targetElement, targetMessageId);
      });
    });
  }

  /**
   * Check if element is valid for animation (more lenient than strict stability)
   * Allows animation if element is in DOM and has crit class, even if messageId changed slightly
   */
  isElementValidForAnimation(messageElement, expectedMessageId) {
    if (!messageElement?.classList) return false;

    const stillInDOM = messageElement.isConnected;
    const stillHasCritClass = messageElement.classList.contains('bd-crit-hit');

    // Must be in DOM and have crit class
    if (!stillInDOM || !stillHasCritClass) return false;

    // If we have an expected messageId, check it (but be lenient)
    if (expectedMessageId) {
      const currentMessageId = this.getMessageId(messageElement);
      // Allow if messageId matches OR if current is null (element might be transitioning)
      return !currentMessageId || currentMessageId === expectedMessageId;
    }

    return true;
  }

  /**
   * Find element by position (fallback when original element is replaced)
   */
  findElementByPosition(position, originalMessageId) {
    const tolerance = 100; // pixels
    const allMessages = document.querySelectorAll('[class*="message"]');

    for (const msg of allMessages) {
      try {
        if (!msg.classList?.contains('bd-crit-hit')) continue;

        const rect = msg.getBoundingClientRect();
        const msgPosition = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        const positionDiff =
          Math.abs(msgPosition.x - position.x) + Math.abs(msgPosition.y - position.y);

        if (positionDiff < tolerance) {
          const msgId = this.getMessageId(msg);
          // Prefer exact match, but accept any crit at this position
          if (!originalMessageId || msgId === originalMessageId || !msgId) {
            return msg;
          }
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  /**
   * Find any crit element at position (last resort fallback)
   */
  findCritElementByPosition(position) {
    const tolerance = 100;
    const allMessages = document.querySelectorAll('[class*="message"]');

    for (const msg of allMessages) {
      try {
        if (!msg.classList?.contains('bd-crit-hit') || !msg.isConnected) continue;

        const rect = msg.getBoundingClientRect();
        const msgPosition = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        const positionDiff =
          Math.abs(msgPosition.x - position.x) + Math.abs(msgPosition.y - position.y);

        if (positionDiff < tolerance) {
          return msg;
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  /**
   * Mark message as removed but keep entry for duplicate detection
   */
  markMessageAsRemoved(messageId) {
    const existingData = this.animatedMessages.get(messageId);
    if (existingData && typeof existingData === 'object') {
      existingData.removed = true;
      existingData.removedAt = Date.now();
    }
  }

  /**
   * Position-based duplicate detection
   * Handles cases where same logical message gets new messageId after element replacement
   */
  isDuplicateByPosition(messageId, elementPosition, elementTimestamp) {
    const positionTolerance = 50; // pixels
    const timeTolerance = 2000; // ms
    const currentTime = Date.now();

    for (const [trackedMessageId, trackedData] of this.animatedMessages.entries()) {
      if (!trackedData || typeof trackedData !== 'object' || !trackedData.position) continue;

      // Clean up old entries
      const timeSinceTracked = currentTime - trackedData.timestamp;
      if (timeSinceTracked > timeTolerance) {
        this.animatedMessages.delete(trackedMessageId);
        continue;
      }

      // Check position and timing
      const positionDiff =
        Math.abs(trackedData.position.x - elementPosition.x) +
        Math.abs(trackedData.position.y - elementPosition.y);
      const timeDiff = elementTimestamp - trackedData.timestamp;

      if (positionDiff < positionTolerance && timeDiff < timeTolerance) {
        return true; // Duplicate found
      }
    }

    return false;
  }

  /**
   * Atomically add message to animatedMessages set
   * Returns true if added, false if already exists
   */
  addToAnimatedMessages(messageId, elementPosition, elementTimestamp) {
    const sizeBefore = this.animatedMessages.size;
    this.animatedMessages.set(messageId, {
      position: elementPosition,
      timestamp: elementTimestamp,
      messageId: messageId,
    });
    return this.animatedMessages.size > sizeBefore;
  }

  // ============================================================================
  // ANIMATION DISPLAY
  // ============================================================================

  showAnimation(messageElement, messageId) {
    if (!this.settings.enabled) return;

    // Final safety check - be lenient, just need crit class and DOM presence
    if (!messageElement?.classList || !messageElement.isConnected) {
      if (messageId) this.animatedMessages.delete(messageId);
      return;
    }

    // Check for crit class - if missing, try one more time after brief delay
    if (!messageElement.classList.contains('bd-crit-hit')) {
      // Give it one more frame to get the class
      requestAnimationFrame(() => {
        if (!messageElement.classList?.contains('bd-crit-hit')) {
          if (messageId) this.animatedMessages.delete(messageId);
          return;
        }
        // Retry with the same element
        this.showAnimation(messageElement, messageId);
      });
      return;
    }

    // Get user combo
    const userId = this.getUserId(messageElement) || 'unknown';
    const userCombo = this.getUserCombo(userId);
    const now = Date.now();
    const timeSinceLastCrit = now - userCombo.lastCritTime;

    let combo = 1;
    if (timeSinceLastCrit <= 10000) {
      combo = userCombo.comboCount + 1;
    }

    this.updateUserCombo(userId, combo, now);

    // Get position and container
    const position = this.getMessageAreaPosition();
    const container = this.getAnimationContainer();
    if (!container) return;

    // Check for duplicate animations in DOM
    if (this.hasDuplicateInDOM(container, messageId, position)) {
      return;
    }

    // Fade out existing animations before starting new one
    this.fadeOutExistingAnimations();

    // Apply screen shake if enabled
    if (this.settings.screenShake) {
      this.applyScreenShake();
    }

    // Create animation element
    const textElement = this.createAnimationElement(messageId, combo, position);
    container.appendChild(textElement);
    this.activeAnimations.add(textElement);

    // Cleanup after animation completes
    this.scheduleCleanup(textElement, messageId, container);
  }

  /**
   * Fade out existing animations smoothly when new critical hit occurs
   * Checks both activeAnimations Set and DOM container for existing animations
   */
  fadeOutExistingAnimations() {
    const container = this.getAnimationContainer();
    if (!container) return;

    // Find all existing animation elements in DOM (more reliable than just Set)
    const existingElements = container.querySelectorAll('.cha-critical-hit-text');

    if (existingElements.length === 0) return;

    const fadeOutDuration = 300; // 300ms fade out

    for (const existingEl of existingElements) {
      if (!existingEl.parentNode) {
        this.activeAnimations.delete(existingEl);
        continue;
      }

      try {
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
        setTimeout(() => {
          try {
            if (existingEl.parentNode) {
              existingEl.remove();
            }
            this.activeAnimations.delete(existingEl);
          } catch (e) {
            this.activeAnimations.delete(existingEl);
          }
        }, fadeOutDuration);
      } catch (e) {
        // If fade fails, just remove immediately
        try {
          if (existingEl.parentNode) {
            existingEl.remove();
          }
          this.activeAnimations.delete(existingEl);
        } catch (e2) {
          this.activeAnimations.delete(existingEl);
        }
      }
    }
  }

  /**
   * Check for duplicate animations already in DOM
   */
  hasDuplicateInDOM(container, messageId, position) {
    if (messageId) {
      const existing = container.querySelectorAll(`[data-cha-message-id="${messageId}"]`);
      if (existing.length > 0) return true;
    }

    // Position-based check for null messageId
    const positionTolerance = 100;
    const timeTolerance = 1000;
    const now = Date.now();

    for (const activeEl of this.activeAnimations) {
      if (!activeEl.parentNode) continue;

      try {
        const activeRect = activeEl.getBoundingClientRect();
        const activePosition = {
          x: activeRect.left + activeRect.width / 2,
          y: activeRect.top + activeRect.height / 2,
        };
        const positionDiff =
          Math.abs(activePosition.x - position.x) + Math.abs(activePosition.y - position.y);
        const timeDiff = now - (activeEl._chaCreatedTime || 0);

        if (positionDiff < positionTolerance && timeDiff < timeTolerance) {
          return true;
        }
      } catch (e) {
        continue;
      }
    }

    return false;
  }

  /**
   * Create animation text element
   */
  createAnimationElement(messageId, combo, position) {
    const textElement = document.createElement('div');
    textElement.className = 'cha-critical-hit-text';

    if (messageId) {
      textElement.setAttribute('data-cha-message-id', messageId);
    }

    textElement.innerHTML =
      combo > 1 && this.settings.showCombo ? `CRITICAL HIT! x${combo}` : 'CRITICAL HIT!';

    // Set only positioning and layout styles - let CSS class handle animation and opacity
    textElement.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      font-size: ${this.settings.fontSize}px;
      font-weight: bold;
      text-align: center;
      pointer-events: none;
      z-index: 999999;
      white-space: nowrap;
    `;

    // Set CSS variables for dynamic animation values (like LevelUpAnimation)
    // Use negative value for float distance (moves up)
    textElement.style.setProperty('--cha-float-distance', `-${this.settings.floatDistance}px`);
    textElement.style.setProperty('--cha-duration', `${this.settings.animationDuration}ms`);

    textElement._chaCreatedTime = Date.now();
    textElement._chaPosition = { x: position.x, y: position.y };

    // Ensure gradient is visible
    requestAnimationFrame(() => {
      const computedStyle = window.getComputedStyle(textElement);
      const textFillColor = computedStyle.webkitTextFillColor || computedStyle.color;
      const hasGradient = computedStyle.background?.includes('gradient');

      if (
        (textFillColor === 'transparent' || textFillColor === 'rgba(0, 0, 0, 0)') &&
        !hasGradient
      ) {
        textElement.style.setProperty('-webkit-text-fill-color', '#ff8800', 'important');
        textElement.style.setProperty('color', '#ff8800', 'important');
      }
    });

    return textElement;
  }

  /**
   * Schedule cleanup after animation completes
   * Waits full animation duration - only removes element, doesn't clear animation styles
   */
  scheduleCleanup(textElement, messageId, container) {
    const cleanupDelay = this.settings.animationDuration + 100;

    // Wait for full animation duration - don't interfere with animation
    const cleanupTimeout = setTimeout(() => {
      try {
        if (!textElement.parentNode) {
          this.activeAnimations.delete(textElement);
          return;
        }

        // Handle duplicate elements with same messageId
        if (messageId) {
          const allElements = container.querySelectorAll(`[data-cha-message-id="${messageId}"]`);
          if (allElements.length > 1) {
            allElements.forEach((el) => {
              try {
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
        }

        // Only remove element - don't clear animation styles
        // Animation has completed, CSS fade-out is done, just remove from DOM
        if (textElement.parentNode) {
          textElement.remove();
        }
        this.activeAnimations.delete(textElement);
      } catch (e) {
        this.activeAnimations.delete(textElement);
      }
    }, cleanupDelay);

    textElement._chaCleanupTimeout = cleanupTimeout;
  }

  // ============================================================================
  // USER COMBO MANAGEMENT
  // ============================================================================

  getUserCombo(userId) {
    const key = userId || 'unknown';
    if (!this.userCombos.has(key)) {
      this.userCombos.set(key, { comboCount: 0, lastCritTime: 0, timeout: null });
    }
    return this.userCombos.get(key);
  }

  updateUserCombo(userId, comboCount, lastCritTime) {
    const key = userId || 'unknown';
    const combo = this.getUserCombo(key);
    combo.comboCount = comboCount;
    combo.lastCritTime = lastCritTime;

    // Save for SoloLevelingStats
    try {
      BdApi.Data.save('CriticalHitAnimation', 'userCombo', {
        userId: key,
        comboCount: comboCount,
        lastCritTime: lastCritTime,
      });
    } catch (error) {
      // Ignore
    }

    // Reset combo after 10 seconds of no crits
    if (combo.timeout) clearTimeout(combo.timeout);
    combo.timeout = setTimeout(() => {
      if (this.userCombos.has(key)) {
        this.userCombos.get(key).comboCount = 0;
        try {
          BdApi.Data.save('CriticalHitAnimation', 'userCombo', {
            userId: key,
            comboCount: 0,
            lastCritTime: 0,
          });
        } catch (error) {
          // Ignore
        }
      }
    }, 10000);
  }

  // ============================================================================
  // DOM UTILITIES
  // ============================================================================

  getAnimationContainer() {
    if (!this.animationContainer || !document.contains(this.animationContainer)) {
      this.animationContainer = document.createElement('div');
      this.animationContainer.style.cssText =
        'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 999999;';
      document.body.appendChild(this.animationContainer);
    }
    return this.animationContainer;
  }

  getMessageAreaPosition() {
    // Use cached selectors if available
    if (!this._cachedChatInput || !document.contains(this._cachedChatInput)) {
      this._cachedChatInput = document.querySelector('[class*="channelTextArea"]');
    }
    if (!this._cachedMessageList || !document.contains(this._cachedMessageList)) {
      this._cachedMessageList = document.querySelector('[class*="messagesWrapper"]');
    }

    const target = this._cachedChatInput || this._cachedMessageList;
    if (target) {
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    return { x: window.innerWidth / 2, y: window.innerHeight / 2 + 50 };
  }

  // ============================================================================
  // SCREEN SHAKE EFFECT
  // ============================================================================

  applyScreenShake() {
    const discordContainer = document.querySelector('[class*="app"]') || document.body;
    if (!discordContainer) return;

    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
      @keyframes chaShake {
        0%, 100% { transform: translate(0, 0); }
        25% { transform: translate(-${this.settings.shakeIntensity}px, ${this.settings.shakeIntensity}px); }
        50% { transform: translate(${this.settings.shakeIntensity}px, -${this.settings.shakeIntensity}px); }
        75% { transform: translate(-${this.settings.shakeIntensity}px, -${this.settings.shakeIntensity}px); }
      }
      .cha-screen-shake-active {
        animation: chaShake ${this.settings.shakeDuration}ms ease-in-out;
      }
    `;
    document.head.appendChild(shakeStyle);
    discordContainer.classList.add('cha-screen-shake-active');

    setTimeout(() => {
      discordContainer.classList.remove('cha-screen-shake-active');
      shakeStyle.remove();
    }, this.settings.shakeDuration);
  }

  // ============================================================================
  // CSS INJECTION & STYLING
  // ============================================================================

  injectCSS() {
    // Inject Nova Flat font
    if (!document.getElementById('cha-nova-flat-font')) {
      const fontLink = document.createElement('link');
      fontLink.id = 'cha-nova-flat-font';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Nova+Flat&display=swap';
      document.head.appendChild(fontLink);
    }

    // Remove old styles
    const oldStyle = document.getElementById('cha-styles');
    if (oldStyle) oldStyle.remove();

    const style = document.createElement('style');
    style.id = 'cha-styles';
    style.textContent = `
      @keyframes chaFloatUp {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) translateY(0) scale(0.8);
        }
        2% {
          opacity: 1;
          transform: translate(-50%, -50%) translateY(0) scale(1.1);
        }
        4% {
          opacity: 1;
          transform: translate(-50%, -50%) translateY(0) scale(1);
        }
        20% {
          opacity: 1;
          transform: translate(-50%, -50%) translateY(calc(var(--cha-float-distance, -150px) * 0.3)) scale(1);
        }
        50% {
          opacity: 1;
          transform: translate(-50%, -50%) translateY(calc(var(--cha-float-distance, -150px) * 0.6)) scale(1);
        }
        80% {
          opacity: 0.8;
          transform: translate(-50%, -50%) translateY(calc(var(--cha-float-distance, -150px) * 0.9)) scale(0.95);
        }
        95% {
          opacity: 0.4;
          transform: translate(-50%, -50%) translateY(calc(var(--cha-float-distance, -150px) * 0.98)) scale(0.9);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) translateY(var(--cha-float-distance, -150px)) scale(0.85);
        }
      }
      .cha-critical-hit-text {
        font-family: 'Nova Flat', sans-serif !important;
        /* Refined gradient: deep red to bright gold */
        background: linear-gradient(135deg,
          #ff4444 0%,
          #ff6600 25%,
          #ff8800 50%,
          #ffaa00 75%,
          #ffcc00 100%) !important;
        -webkit-background-clip: text !important;
        background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        color: #ff8800 !important;
        /* Subtle glow - reduced but present */
        filter: drop-shadow(0 0 3px rgba(255, 102, 0, 0.4))
                drop-shadow(0 0 6px rgba(255, 68, 68, 0.3)) !important;
        display: inline-block !important;
        /* Minimal text shadow for subtle glow */
        text-shadow:
          0 0 4px rgba(255, 136, 0, 0.5),
          0 0 8px rgba(255, 102, 0, 0.3) !important;
        /* Animation defined in CSS class - no inline opacity conflicts */
        animation: chaFloatUp var(--cha-duration, 4000ms) ease-out forwards;
        visibility: visible !important;
        min-width: 1px !important;
        min-height: 1px !important;
        will-change: transform, opacity !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================================
  // SETTINGS PANEL
  // ============================================================================

  getSettingsPanel() {
    return BdApi.React.createElement(
      'div',
      { style: { padding: '20px' } },
      BdApi.React.createElement('h2', null, 'Critical Hit Animation Settings'),
      BdApi.React.createElement(
        'label',
        { style: { display: 'block', marginTop: '10px' } },
        BdApi.React.createElement('input', {
          type: 'checkbox',
          checked: this.settings.enabled,
          onChange: (e) => {
            this.settings.enabled = e.target.checked;
            this.saveSettings();
          },
        }),
        ' Enable animations'
      ),
      BdApi.React.createElement(
        'label',
        { style: { display: 'block', marginTop: '10px' } },
        'Animation Duration (ms): ',
        BdApi.React.createElement('input', {
          type: 'number',
          value: this.settings.animationDuration,
          onChange: (e) => {
            this.settings.animationDuration = parseInt(e.target.value) || 1500;
            this.saveSettings();
          },
        })
      ),
      BdApi.React.createElement(
        'label',
        { style: { display: 'block', marginTop: '10px' } },
        BdApi.React.createElement('input', {
          type: 'checkbox',
          checked: this.settings.screenShake,
          onChange: (e) => {
            this.settings.screenShake = e.target.checked;
            this.saveSettings();
          },
        }),
        ' Screen shake'
      ),
      BdApi.React.createElement(
        'label',
        { style: { display: 'block', marginTop: '10px' } },
        BdApi.React.createElement('input', {
          type: 'checkbox',
          checked: this.settings.showCombo,
          onChange: (e) => {
            this.settings.showCombo = e.target.checked;
            this.saveSettings();
          },
        }),
        ' Show combo counter'
      )
    );
  }
};
