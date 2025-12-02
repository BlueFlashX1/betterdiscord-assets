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
      debugMode: false, // Debug logging (can be toggled in settings)
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
    this._comboUpdateLock = new Set(); // Tracks users with in-progress combo updates

    // Hook registration state
    this.hooksRegistered = false;
    this.hookRegistrationInProgress = false;
    this.patchCallbacks = new Map();

    // Cached DOM queries
    this._cachedChatInput = null;
    this._cachedMessageList = null;
    this._cachedMessages = null;
    this._cacheTimestamp = 0;
    this._cacheMaxAge = 5000; // 5 seconds cache validity
  }

  // ============================================================================
  // PLUGIN LIFECYCLE
  // ============================================================================

  /**
   * Initializes the plugin: loads settings, injects CSS, gets user ID, and hooks into CriticalHit
   * Called when plugin is enabled/started
   */
  start() {
      this.loadSettings();
    if (this.settings.debugMode) {
      console.log('[CriticalHitAnimation] Starting...');
    }
      this.injectCSS();

      setTimeout(() => {
        this.getCurrentUserId();
      this.hookIntoCriticalHit();
      }, 1000);

    if (this.settings.debugMode) {
      console.log('[CriticalHitAnimation] Started');
    }
  }

  /**
   * Cleans up plugin resources: removes patches, clears animations, clears caches
   * Called when plugin is disabled/stopped
   */
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
    this._cachedMessages = null;
    this._cacheTimestamp = 0;
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  /**
   * Loads plugin settings from BetterDiscord storage
   * Merges saved settings with defaults
   */
  loadSettings() {
    const saved = BdApi.Data.load('CriticalHitAnimation', 'settings');
    if (saved) {
      this.settings = Object.assign({}, this.defaultSettings, saved);
      // Force animationDuration to 4000ms (4 seconds) - override any old saved value
      this.settings.animationDuration = 4000;
      this.currentUserId = this.settings.ownUserId;
    }
  }

  /**
   * Saves current plugin settings to BetterDiscord storage
   */
  saveSettings() {
    BdApi.Data.save('CriticalHitAnimation', 'settings', this.settings);
  }

  // ============================================================================
  // USER IDENTIFICATION
  // ============================================================================

  /**
   * Gets the current user's Discord ID from Webpack modules
   * Stores it in settings for persistence
   */
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
    } catch (error) {
      // Silently fail - user ID not critical for functionality
    }
  }

  /**
   * Checks if a message belongs to the current user
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {string} userId - The user ID to check
   * @returns {boolean} True if message belongs to current user
   */
  isOwnMessage(messageElement, userId) {
    if (this.settings.ownUserId && userId === this.settings.ownUserId) return true;
    if (this.currentUserId && userId === this.currentUserId) return true;

          if (!this.currentUserId) {
            this.getCurrentUserId();
    }

    return userId === this.currentUserId;
  }

  // ============================================================================
  // REACT FIBER UTILITIES
  // ============================================================================

  /**
   * Gets React fiber instance from a DOM element
   * Used to access React component data (message ID, author ID, etc.)
   * @param {HTMLElement} element - DOM element
   * @returns {Object|null} React fiber or null if not found
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

  /**
   * Extracts message ID from a message element using React fiber traversal
   * Falls back to data attributes if React fiber is unavailable
   * @param {HTMLElement} element - The message DOM element
   * @returns {string|null} Message ID or null if not found
   */
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
          if (this.isValidDiscordId(id)) return id;
        }
      }

      // Fallback to data attribute
      const dataId = element.getAttribute('data-message-id');
      if (dataId) {
        if (this.isValidDiscordId(dataId)) {
          return String(dataId).trim();
        }
        const allMatches = dataId.match(/\d{17,19}/g);
        if (allMatches?.length > 0) {
          return allMatches[allMatches.length - 1];
        }
      }
    } catch (error) {
      // Silently fail - React fiber access may fail on some elements
    }
    return null;
  }

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
  }

  /**
   * Extracts message timestamp from a message element using React fiber traversal
   * @param {HTMLElement} element - The message DOM element
   * @returns {number} Timestamp in milliseconds, or 0 if not found
   */
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
    } catch (error) {
      // Silently fail - React fiber access may fail on some elements
    }
    return 0;
  }

  // ============================================================================
  // MESSAGE HISTORY & VALIDATION
  // ============================================================================

  /**
   * Checks if a message ID exists in CriticalHit plugin's message history
   * @param {string} messageId - The message ID to check
   * @returns {boolean} True if message is in history
   */
  isMessageInHistory(messageId) {
    try {
      const history = BdApi.Data.load('CriticalHit', 'messageHistory');
      if (!Array.isArray(history)) return false;
      return history.some((entry) => String(entry.messageId) === String(messageId));
    } catch (error) {
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

  /**
   * Hooks into CriticalHit plugin's onCritHit method and checkForCrit hook
   * Sets up patches to detect crits and reset combos for non-crit messages
   */
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
    // Hook into checkForCrit to reset combo for non-crit messages
    if (instance.checkForCrit) {
      BdApi.Patcher.after('CriticalHitAnimation', instance, 'checkForCrit', (_, args) => {
        const messageElement = args[0];
        if (!messageElement) return;

        const userId = this.getUserId(messageElement);
        if (!this.isValidDiscordId(userId) || !this.isOwnMessage(messageElement, userId)) return;

        const messageId = this.getMessageId(messageElement);
        if (!this.isValidDiscordId(messageId)) return;

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:325',message:'checkForCrit hook: Entry',data:{messageId,userId,hasCritClass:messageElement.classList?.contains('bd-crit-hit')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion

        // Non-crit messages reset combo immediately (higher priority than timeout)
        setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Check if message is actually a crit (check class AND history)
              const hasCritClass = messageElement.classList?.contains('bd-crit-hit');
              const isInHistory = this.isMessageInHistory(messageId);
              const isAnimated = this.animatedMessages.has(messageId);

              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:335',message:'checkForCrit hook: Checking if non-crit',data:{messageId,userId,hasCritClass,isInHistory,isAnimated,willReset:!hasCritClass && !isInHistory && !isAnimated},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
              // #endregion

              // Reset combo if message is not a crit (regardless of history/animation state)
              if (!hasCritClass) {
                const key = userId || 'unknown';
                const combo = this.userCombos.get(key);
                if (combo) {
                  const hadCombo = combo.comboCount;

                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:340',message:'checkForCrit hook: Resetting combo for non-crit (HIGH PRIORITY)',data:{messageId,userId:key,hadCombo,hasCritClass,isInHistory,oldLastCritTime:combo.lastCritTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                  // #endregion

                  // Reset both comboCount and lastCritTime immediately
                  combo.comboCount = 0;
                  combo.lastCritTime = 0; // Reset timestamp so timeout doesn't interfere

                  // Clear timeout since we're resetting immediately
                  if (combo.timeout) {
                    clearTimeout(combo.timeout);
                    combo.timeout = null;
                  }

                  // Save reset state
                  try {
                    BdApi.Data.save('CriticalHitAnimation', 'userCombo', {
                      userId: key,
                      comboCount: 0,
                      lastCritTime: 0,
                    });
                  } catch (error) {
      // Silently fail - data save not critical
    }
                }
              }
            });
          });
        }, 100); // Short delay for higher priority
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

  /**
   * Main handler for critical hit events
   * Validates message, updates combo count, checks cooldown, and triggers animation
   * @param {HTMLElement} messageElement - The message DOM element that crit
   */
  handleCriticalHit(messageElement) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:358',message:'handleCriticalHit: Entry',data:{hasElement:!!messageElement,hasCritClass:messageElement?.classList?.contains('bd-crit-hit'),isConnected:messageElement?.isConnected},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!messageElement) return;

    // Get message ID and validate
    const messageId = this.getMessageId(messageElement);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:362',message:'handleCriticalHit: Got messageId',data:{messageId,isValid:this.isValidDiscordId(messageId),wasAnimated:this.animatedMessages.has(messageId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!this.isValidDiscordId(messageId)) return;

    // Verify gradient is applied before proceeding with animation
    // This ensures synchronization between CriticalHit and CriticalHitAnimation
    const verifyGradientSync = (element, attempt = 0, maxAttempts = 5) => {
      if (!element || !element.isConnected) {
        if (attempt < maxAttempts) {
          setTimeout(() => {
            const reQueried = messageId
              ? document.querySelector(`[data-message-id="${messageId}"]`)
              : null;
            if (reQueried) verifyGradientSync(reQueried, attempt + 1, maxAttempts);
          }, 50 * (attempt + 1));
        }
        return false;
      }

      const hasCritClass = element.classList?.contains('bd-crit-hit');
      if (!hasCritClass) {
        if (attempt < maxAttempts) {
          setTimeout(() => verifyGradientSync(element, attempt + 1, maxAttempts), 50 * (attempt + 1));
        }
        return false;
      }

      // Check for gradient in content element
      const contentSelectors = [
        '[class*="messageContent"]',
        '[class*="markup"]',
        '[class*="textContainer"]',
      ];
      let contentElement = null;
      for (const selector of contentSelectors) {
        const found = element.querySelector(selector);
        if (found && !found.closest('[class*="username"]') && !found.closest('[class*="timestamp"]')) {
          contentElement = found;
          break;
        }
      }

      if (contentElement) {
        const computedStyles = window.getComputedStyle(contentElement);
        const hasGradient = computedStyles?.backgroundImage?.includes('gradient');
        const hasWebkitClip =
          computedStyles?.webkitBackgroundClip === 'text' ||
          computedStyles?.backgroundClip === 'text';

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:459',message:'handleCriticalHit: Verifying gradient synchronization',data:{messageId,attempt,hasCritClass,hasGradient,hasWebkitClip,gradientSynced:hasGradient && hasWebkitClip},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'SYNC'})}).catch(()=>{});
        // #endregion

        if (!hasGradient || !hasWebkitClip) {
          if (attempt < maxAttempts) {
            // Force reflow and retry
            void contentElement.offsetHeight;
            setTimeout(() => verifyGradientSync(element, attempt + 1, maxAttempts), 50 * (attempt + 1));
            return false;
          } else {
            // Max attempts reached, proceed anyway but log warning
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:459',message:'handleCriticalHit: Gradient not fully synced after max attempts, proceeding anyway',data:{messageId,attempt,hasGradient,hasWebkitClip},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'SYNC'})}).catch(()=>{});
            // #endregion
          }
        }
      }

      return true;
    };

    // Verify gradient synchronization before proceeding
    if (!verifyGradientSync(messageElement)) {
      // Will retry asynchronously, return early
      return;
    }

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:380',message:'handleCriticalHit: Checking crit class and DOM',data:{messageId,hasCritClass,isInDOM,willReturn:!hasCritClass||!isInDOM},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!hasCritClass || !isInDOM) return;

    // Position-based duplicate detection (handles element replacement scenarios)
    if (this.isDuplicateByPosition(messageId, elementPosition, elementTimestamp)) {
      return;
    }

    // Atomic check-and-add to prevent race conditions
    if (!this.addToAnimatedMessages(messageId, elementPosition, elementTimestamp)) {
      return; // Already animated
    }

    // Validate user FIRST (before updating combo)
    const userId = this.getUserId(messageElement);
    if (!this.isValidDiscordId(userId) || !this.isOwnMessage(messageElement, userId)) {
      this.animatedMessages.delete(messageId);
      return;
    }

    // Check message age (skip old restored messages)
    // Check message history (5 second timeout)
    if (this.isMessageInHistory(messageId)) {
      const messageTime = this.getMessageTimestamp(messageElement);
      if (Date.now() - (messageTime || 0) > 5000) {
        this.animatedMessages.delete(messageId);
        return;
      }
    }

    // Update combo synchronously to prevent race conditions during spam
    // IMPORTANT: Update combo BEFORE cooldown check so combo always increments correctly
    // even if cooldown blocks the animation
    const userIdForCombo = userId || 'unknown';

    // Synchronous combo update (atomic in single-threaded JavaScript)
    const userCombo = this.getUserCombo(userIdForCombo);
    const comboNow = Date.now();
    const timeSinceLastCrit = comboNow - userCombo.lastCritTime;

    // Capture previous combo before updating
    const previousCombo = userCombo.comboCount;

    let combo = 1;
    if (timeSinceLastCrit <= 5000) {
      // Check message history (5 second timeout)
      combo = userCombo.comboCount + 1;
    } else {
      // Combo expired (>5s), reset to 1
      combo = 1;
    }

    // Update combo immediately (before async animation and before cooldown check)
    // This is synchronous, so it's atomic - no race conditions possible
    this.updateUserCombo(userIdForCombo, combo, comboNow);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:425',message:'handleCriticalHit: Updated combo immediately',data:{messageId,userId:userIdForCombo,combo,previousCombo,timeSinceLastCrit,willIncrement:timeSinceLastCrit<=5000},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion

    // Cooldown check (AFTER combo update so combo always increments)
    const now = Date.now();
    if (now - this.lastAnimationTime < 100) {
      // Combo was already updated, but skip animation due to cooldown
      this.animatedMessages.delete(messageId);
      return;
    }
    this.lastAnimationTime = now;

    // Store position for fallback lookup
    const storedPosition = { ...elementPosition };

    // Store combo for use in showAnimation
    const storedCombo = combo;

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

        // Pass stored combo to showAnimation (already updated synchronously above)
        this.showAnimation(targetElement, targetMessageId, storedCombo);
      });
    });
  }

  /**
   * Checks if element is valid for animation (more lenient than strict stability)
   * Allows animation if element is in DOM and has crit class, even if messageId changed slightly
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {string} expectedMessageId - Expected message ID for validation
   * @returns {boolean} True if element is valid for animation
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
   * Finds a message element by its position (fallback when original element is replaced)
   * Used when Discord replaces message elements but position remains the same
   * @param {Object} position - Position object with x and y coordinates
   * @param {string} originalMessageId - Original message ID for exact matching
   * @returns {HTMLElement|null} Found element or null
   */
  findElementByPosition(position, originalMessageId) {
    const tolerance = 100; // pixels
    const allMessages = this.getCachedMessages();

    for (const msg of allMessages) {
      try {
        if (!msg.classList?.contains('bd-crit-hit')) continue;

        const msgPosition = this.getElementPosition(msg);
        if (!msgPosition) continue;

        const positionDiff =
          Math.abs(msgPosition.x - position.x) + Math.abs(msgPosition.y - position.y);

        if (positionDiff < tolerance) {
          const msgId = this.getMessageId(msg);
          if (!originalMessageId || msgId === originalMessageId || !msgId) {
            return msg;
          }
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  /**
   * Finds any crit element at a given position (last resort fallback)
   * Used when message ID is unknown but position is known
   * @param {Object} position - Position object with x and y coordinates
   * @returns {HTMLElement|null} Found element or null
   */
  findCritElementByPosition(position) {
    const tolerance = 100;
    const allMessages = this.getCachedMessages();

    for (const msg of allMessages) {
      try {
        if (!msg.classList?.contains('bd-crit-hit') || !msg.isConnected) continue;

        const msgPosition = this.getElementPosition(msg);
        if (!msgPosition) continue;

        const positionDiff =
          Math.abs(msgPosition.x - position.x) + Math.abs(msgPosition.y - position.y);

        if (positionDiff < tolerance) {
          return msg;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  /**
   * Marks a message as removed but keeps entry for duplicate detection
   * Prevents duplicate animations when messages are reprocessed
   * @param {string} messageId - The message ID to mark as removed
   */
  markMessageAsRemoved(messageId) {
    const existingData = this.animatedMessages.get(messageId);
    if (existingData && typeof existingData === 'object') {
      existingData.removed = true;
      existingData.removedAt = Date.now();
    }
  }

  /**
   * Checks if an animation is a duplicate based on position and timestamp
   * Handles cases where same logical message gets new messageId after element replacement
   * @param {string} messageId - The message ID
   * @param {Object} elementPosition - Position object with x and y coordinates
   * @param {number} elementTimestamp - Timestamp of the message
   * @returns {boolean} True if duplicate detected
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

  /**
   * Displays the "CRITICAL HIT!" animation with combo count
   * Handles duplicate detection, positioning, and cleanup
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {string} messageId - The message ID
   * @param {number|null} comboOverride - Optional combo count override
   */
  showAnimation(messageElement, messageId, comboOverride = null) {
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
        // Retry with the same element (pass comboOverride)
        this.showAnimation(messageElement, messageId, comboOverride);
      });
            return;
    }

    // Use comboOverride if provided (prevents race conditions during spam)
    let combo = comboOverride;
    if (combo === null || combo === undefined) {
      // Fallback: calculate combo if not provided (shouldn't happen in normal flow)
      const userId = this.getUserId(messageElement) || 'unknown';
      const userCombo = this.getUserCombo(userId);
      const now = Date.now();
      const timeSinceLastCrit = now - userCombo.lastCritTime;

      combo = 1;
      if (timeSinceLastCrit <= 5000) {
        // Check message history (5 second timeout)
        combo = userCombo.comboCount + 1;
      }

      // Update combo if we had to calculate it
      this.updateUserCombo(userId, combo, now);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:680',message:'showAnimation: Calculated combo (fallback)',data:{messageId,userId,combo,timeSinceLastCrit},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
    }

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
   * Fades out existing animations smoothly when a new critical hit occurs
   * Checks both activeAnimations Set and DOM container for existing animations
   * Prevents multiple overlapping animations
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
        } catch (error2) {
          this.activeAnimations.delete(existingEl);
        }
      }
    }
  }

  /**
   * Checks for duplicate animations already in the DOM
   * Prevents multiple animations for the same message
   * @param {HTMLElement} container - Animation container element
   * @param {string} messageId - The message ID
   * @param {Object} position - Position object with x and y coordinates
   * @returns {boolean} True if duplicate found
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
    } catch (error) {
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

  /**
   * Updates combo count for a user and sets timeout to reset combo
   * Persists combo to storage and handles combo expiration (5 second timeout)
   * @param {string} userId - The user ID
   * @param {number} comboCount - The new combo count
   * @param {number} lastCritTime - Timestamp of the crit
   */
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
      // Silently fail - data save not critical
    }

    // Reset combo after 5 seconds of no crits
    if (combo.timeout) clearTimeout(combo.timeout);
    combo.timeout = setTimeout(() => {
      if (this.userCombos.has(key)) {
        const comboObj = this.userCombos.get(key);
        const hadCombo = comboObj.comboCount;

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b030fef3-bf2c-4bcb-b879-fe51f8a5dfa0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CriticalHitAnimation.plugin.js:1000',message:'updateUserCombo: Combo timeout - resetting to 0',data:{userId:key,hadCombo,oldLastCritTime:comboObj.lastCritTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
        // #endregion

        // Reset both comboCount and lastCritTime
        comboObj.comboCount = 0;
        comboObj.lastCritTime = 0; // Reset lastCritTime so next crit calculates timeSince correctly

        try {
          BdApi.Data.save('CriticalHitAnimation', 'userCombo', {
            userId: key,
            comboCount: 0,
            lastCritTime: 0,
            });
                  } catch (error) {
      // Silently fail - data save not critical
    }
      }
    }, 5000); // Changed from 10000 to 5000 (5 seconds)
  }

  // ============================================================================
  // DOM UTILITIES
  // ============================================================================

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
  }

  /**
   * Gets the position of the message area for animation positioning
   * @returns {Object} Position object with x and y coordinates
   */
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

  /**
   * Applies screen shake effect to the entire page
   * Uses CSS animation based on settings (intensity and duration)
   */
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

  /**
   * Injects CSS styles for animations, screen shake, and combo display
   * Includes keyframe animations for float, fade, and shake effects
   */
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

  /**
   * Creates and returns the settings panel UI element
   * Includes controls for animation duration, screen shake, combo display, etc.
   * @returns {HTMLElement} Settings panel DOM element
   */
  getSettingsPanel() {
    const plugin = this;
    const container = document.createElement('div');
    container.className = 'cha-settings-container';
    container.innerHTML = `
      <style>
        .cha-settings-container {
          padding: 20px;
          color: var(--text-normal);
        }
        .cha-settings-header {
          margin-bottom: 24px;
        }
        .cha-settings-title {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-normal);
          margin-bottom: 4px;
        }
        .cha-settings-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          opacity: 0.8;
        }
        .cha-form-group {
          margin-bottom: 32px;
        }
        .cha-form-item {
          margin-bottom: 20px;
        }
        .cha-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-normal);
          margin-bottom: 8px;
        }
        .cha-label-value {
          color: var(--text-brand);
          font-weight: 600;
          margin-left: 8px;
        }
        .cha-checkbox-group {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 6px;
          background: var(--background-modifier-hover);
          transition: background 0.2s;
        }
        .cha-checkbox-group:hover {
          background: var(--background-modifier-active);
        }
        .cha-checkbox {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: var(--text-brand);
        }
        .cha-checkbox-label {
          font-size: 14px;
          color: var(--text-normal);
          cursor: pointer;
          user-select: none;
        }
        .cha-input-wrapper {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .cha-slider {
          flex: 1;
          height: 6px;
          border-radius: 3px;
          background: var(--background-modifier-accent);
          outline: none;
          -webkit-appearance: none;
        }
        .cha-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--text-brand);
          cursor: pointer;
        }
        .cha-number-input {
          width: 80px;
          padding: 6px 10px;
          border: 1px solid var(--input-border);
          border-radius: 4px;
          background: var(--input-background);
          color: var(--text-normal);
          font-size: 14px;
        }
        .cha-description {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 6px;
          line-height: 1.4;
        }
        .cha-divider {
          height: 1px;
          background: var(--background-modifier-accent);
          margin: 24px 0;
        }
      </style>

      <div class="cha-settings-header">
        <div class="cha-settings-title">Critical Hit Animation</div>
        <div class="cha-settings-subtitle">Customize animation effects and behavior</div>
      </div>

      <div class="cha-form-group">
        <div class="cha-form-item">
          <label class="cha-checkbox-group">
            <input
              type="checkbox"
              id="cha-enabled"
              class="cha-checkbox"
              ${this.settings.enabled ? 'checked' : ''}
            />
            <span class="cha-checkbox-label">Enable Animations</span>
          </label>
          <div class="cha-description">
            Show animated "CRITICAL HIT!" text when critical hits occur
          </div>
        </div>

        <div class="cha-form-item">
          <label class="cha-label">
            Animation Duration
            <span class="cha-label-value">${(this.settings.animationDuration / 1000).toFixed(1)}s</span>
          </label>
          <div class="cha-input-wrapper">
            <input
              type="range"
              id="cha-duration-slider"
              class="cha-slider"
              min="1000"
              max="10000"
              step="500"
              value="${this.settings.animationDuration}"
            />
            <input
              type="number"
              id="cha-duration-input"
              class="cha-number-input"
              min="1000"
              max="10000"
              step="500"
              value="${this.settings.animationDuration}"
            />
          </div>
          <div class="cha-description">
            How long the animation stays visible (1-10 seconds)
          </div>
        </div>

        <div class="cha-form-item">
          <label class="cha-label">
            Float Distance
            <span class="cha-label-value">${this.settings.floatDistance}px</span>
          </label>
          <div class="cha-input-wrapper">
            <input
              type="range"
              id="cha-float-slider"
              class="cha-slider"
              min="50"
              max="300"
              step="10"
              value="${this.settings.floatDistance}"
            />
            <input
              type="number"
              id="cha-float-input"
              class="cha-number-input"
              min="50"
              max="300"
              step="10"
              value="${this.settings.floatDistance}"
            />
          </div>
          <div class="cha-description">
            How far the animation floats upward
          </div>
        </div>

        <div class="cha-form-item">
          <label class="cha-label">
            Font Size
            <span class="cha-label-value">${this.settings.fontSize}px</span>
          </label>
          <div class="cha-input-wrapper">
            <input
              type="range"
              id="cha-fontsize-slider"
              class="cha-slider"
              min="24"
              max="72"
              step="2"
              value="${this.settings.fontSize}"
            />
            <input
              type="number"
              id="cha-fontsize-input"
              class="cha-number-input"
              min="24"
              max="72"
              step="2"
              value="${this.settings.fontSize}"
            />
          </div>
          <div class="cha-description">
            Size of the animation text
          </div>
        </div>
      </div>

      <div class="cha-divider"></div>

      <div class="cha-form-group">
        <div class="cha-form-item">
          <label class="cha-checkbox-group">
            <input
              type="checkbox"
              id="cha-screenshake"
              class="cha-checkbox"
              ${this.settings.screenShake ? 'checked' : ''}
            />
            <span class="cha-checkbox-label">Screen Shake</span>
          </label>
          <div class="cha-description">
            Shake the screen when a critical hit occurs
          </div>
        </div>

        <div class="cha-form-item">
          <label class="cha-label">
            Shake Intensity
            <span class="cha-label-value">${this.settings.shakeIntensity}px</span>
          </label>
          <div class="cha-input-wrapper">
            <input
              type="range"
              id="cha-shake-intensity-slider"
              class="cha-slider"
              min="1"
              max="10"
              step="1"
              value="${this.settings.shakeIntensity}"
            />
            <input
              type="number"
              id="cha-shake-intensity-input"
              class="cha-number-input"
              min="1"
              max="10"
              step="1"
              value="${this.settings.shakeIntensity}"
            />
          </div>
          <div class="cha-description">
            Intensity of the screen shake effect
          </div>
        </div>

        <div class="cha-form-item">
          <label class="cha-label">
            Shake Duration
            <span class="cha-label-value">${this.settings.shakeDuration}ms</span>
          </label>
          <div class="cha-input-wrapper">
            <input
              type="range"
              id="cha-shake-duration-slider"
              class="cha-slider"
              min="100"
              max="500"
              step="50"
              value="${this.settings.shakeDuration}"
            />
            <input
              type="number"
              id="cha-shake-duration-input"
              class="cha-number-input"
              min="100"
              max="500"
              step="50"
              value="${this.settings.shakeDuration}"
            />
          </div>
          <div class="cha-description">
            How long the screen shake lasts
          </div>
        </div>
      </div>

      <div class="cha-divider"></div>

      <div class="cha-form-group">
        <div class="cha-form-item">
          <label class="cha-checkbox-group">
            <input
              type="checkbox"
              id="cha-show-combo"
              class="cha-checkbox"
              ${this.settings.showCombo ? 'checked' : ''}
            />
            <span class="cha-checkbox-label">Show Combo Counter</span>
          </label>
          <div class="cha-description">
            Display combo count in the animation (e.g., "CRITICAL HIT! x5")
          </div>
        </div>

        <div class="cha-form-item">
          <label class="cha-label">
            Max Combo Display
            <span class="cha-label-value">${this.settings.maxCombo}</span>
          </label>
          <div class="cha-input-wrapper">
            <input
              type="range"
              id="cha-maxcombo-slider"
              class="cha-slider"
              min="10"
              max="999"
              step="10"
              value="${this.settings.maxCombo}"
            />
            <input
              type="number"
              id="cha-maxcombo-input"
              class="cha-number-input"
              min="10"
              max="999"
              step="10"
              value="${this.settings.maxCombo}"
            />
          </div>
          <div class="cha-description">
            Maximum combo count to display
          </div>
        </div>
      </div>

      <div class="cha-divider"></div>

      <div class="cha-form-group">
        <div class="cha-form-item">
          <label class="cha-checkbox-group">
            <input
              type="checkbox"
              id="cha-debug-mode"
              class="cha-checkbox"
              ${this.settings.debugMode ? 'checked' : ''}
            />
            <span class="cha-checkbox-label">Debug Mode</span>
          </label>
          <div class="cha-description">
            Enable detailed debug logging in console (useful for troubleshooting)
          </div>
        </div>
      </div>
    `;

    // Event listeners
    const syncSliderInput = (sliderId, inputId, settingKey, min, max) => {
      const slider = container.querySelector(`#${sliderId}`);
      const input = container.querySelector(`#${inputId}`);

      slider.addEventListener('input', (e) => {
        const value = Math.max(min, Math.min(max, parseInt(e.target.value)));
        input.value = value;
        plugin.settings[settingKey] = value;
        plugin.saveSettings();
        // Update label value
        const label = slider.closest('.cha-form-item').querySelector('.cha-label-value');
        if (label) {
          if (settingKey === 'animationDuration') {
            label.textContent = `${(value / 1000).toFixed(1)}s`;
          } else if (settingKey === 'shakeDuration') {
            label.textContent = `${value}ms`;
          } else {
            label.textContent = `${value}${settingKey === 'fontSize' ? 'px' : settingKey === 'maxCombo' ? '' : 'px'}`;
          }
        }
      });

      input.addEventListener('change', (e) => {
        const value = Math.max(min, Math.min(max, parseInt(e.target.value) || min));
        slider.value = value;
        input.value = value;
        plugin.settings[settingKey] = value;
        plugin.saveSettings();
        // Update label value
        const label = input.closest('.cha-form-item').querySelector('.cha-label-value');
        if (label) {
          if (settingKey === 'animationDuration') {
            label.textContent = `${(value / 1000).toFixed(1)}s`;
          } else if (settingKey === 'shakeDuration') {
            label.textContent = `${value}ms`;
          } else {
            label.textContent = `${value}${settingKey === 'fontSize' ? 'px' : settingKey === 'maxCombo' ? '' : 'px'}`;
          }
        }
      });
    };

    container.querySelector('#cha-enabled').addEventListener('change', (e) => {
      plugin.settings.enabled = e.target.checked;
      plugin.saveSettings();
    });

    container.querySelector('#cha-screenshake').addEventListener('change', (e) => {
      plugin.settings.screenShake = e.target.checked;
      plugin.saveSettings();
    });

    container.querySelector('#cha-show-combo').addEventListener('change', (e) => {
      plugin.settings.showCombo = e.target.checked;
      plugin.saveSettings();
    });

    container.querySelector('#cha-debug-mode').addEventListener('change', (e) => {
      plugin.settings.debugMode = e.target.checked;
      plugin.saveSettings();
      console.log(`CriticalHitAnimation: Debug mode ${e.target.checked ? 'enabled' : 'disabled'}`);
    });

    syncSliderInput('cha-duration-slider', 'cha-duration-input', 'animationDuration', 1000, 10000);
    syncSliderInput('cha-float-slider', 'cha-float-input', 'floatDistance', 50, 300);
    syncSliderInput('cha-fontsize-slider', 'cha-fontsize-input', 'fontSize', 24, 72);
    syncSliderInput('cha-shake-intensity-slider', 'cha-shake-intensity-input', 'shakeIntensity', 1, 10);
    syncSliderInput('cha-shake-duration-slider', 'cha-shake-duration-input', 'shakeDuration', 100, 500);
    syncSliderInput('cha-maxcombo-slider', 'cha-maxcombo-input', 'maxCombo', 10, 999);

    return container;
  }
};
