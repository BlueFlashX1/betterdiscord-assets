/**
 * @name CriticalHitAnimation
 * @author BlueFlashX1
 * @description Animated "CRITICAL HIT!" notification with subtle screen shake when crits land
 * @version 1.0.0
 */

module.exports = class CriticalHitAnimation {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      animationDuration: 1500, // 1.5 seconds (shorter than level up)
      floatDistance: 100, // pixels to float up
      fontSize: 36, // Slightly smaller than level up
      screenShake: true, // Enable subtle screen shake
      shakeIntensity: 3, // pixels (subtle)
      shakeDuration: 250, // milliseconds
      cooldown: 500, // Minimum ms between animations (anti-spam)
      showCombo: true, // Show combo counter for rapid crits
      maxCombo: 5, // Maximum combo to display
    };

    this.settings = this.defaultSettings;
    this.animationContainer = null;
    this.activeAnimations = new Set();
    this.patcher = null;
    this.userCombos = new Map(); // Track combos per user: Map<userId, {comboCount, lastCritTime, timeout}>
    this.animatedMessages = new Set(); // Track which messages have been animated (prevent duplicates)
    this.pendingAnimations = new Map(); // Track pending animations with timeouts
  }

  start() {
    this.loadSettings();
    this.injectCSS();
    this.hookIntoCriticalHit();
    this.debugLog('Plugin started');
  }

  stop() {
    this.unhookFromCriticalHit();
    this.removeAllAnimations();
    this.removeCSS();
    this.debugLog('Plugin stopped');
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load('CriticalHitAnimation', 'settings');
      if (saved) {
        this.settings = { ...this.defaultSettings, ...saved };
        this.debugLog('Settings loaded', this.settings);
      }
    } catch (error) {
      this.debugError('Failed to load settings', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('CriticalHitAnimation', 'settings', this.settings);
      this.debugLog('Settings saved');
    } catch (error) {
      this.debugError('Failed to save settings', error);
    }
  }

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h3 style="color: #ef4444; margin-bottom: 10px;">Critical Hit Animation Settings</h3>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.enabled ? 'checked' : ''} id="cha-enabled">
          <span style="margin-left: 10px;">Enable Critical Hit Animation</span>
        </label>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.screenShake ? 'checked' : ''} id="cha-shake">
          <span style="margin-left: 10px;">Enable Screen Shake</span>
        </label>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.showCombo ? 'checked' : ''} id="cha-combo">
          <span style="margin-left: 10px;">Show Combo Counter</span>
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Animation Duration (ms):</span>
          <input type="number" id="cha-duration" value="${this.settings.animationDuration}" min="500" max="3000" step="100" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Shake Intensity (px):</span>
          <input type="number" id="cha-shake-intensity" value="${this.settings.shakeIntensity}" min="0" max="10" step="1" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Cooldown (ms):</span>
          <input type="number" id="cha-cooldown" value="${this.settings.cooldown}" min="100" max="2000" step="100" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Font Size (px):</span>
          <input type="number" id="cha-fontsize" value="${this.settings.fontSize}" min="24" max="72" step="4" style="width: 100%; padding: 5px;">
        </label>
      </div>
    `;

    // Event listeners
    panel.querySelector('#cha-enabled').addEventListener('change', (e) => {
      this.settings.enabled = e.target.checked;
      this.saveSettings();
    });

    panel.querySelector('#cha-shake').addEventListener('change', (e) => {
      this.settings.screenShake = e.target.checked;
      this.saveSettings();
    });

    panel.querySelector('#cha-combo').addEventListener('change', (e) => {
      this.settings.showCombo = e.target.checked;
      this.saveSettings();
    });

    panel.querySelector('#cha-duration').addEventListener('change', (e) => {
      this.settings.animationDuration = parseInt(e.target.value);
      this.saveSettings();
    });

    panel.querySelector('#cha-shake-intensity').addEventListener('change', (e) => {
      this.settings.shakeIntensity = parseInt(e.target.value);
      this.saveSettings();
    });

    panel.querySelector('#cha-cooldown').addEventListener('change', (e) => {
      this.settings.cooldown = parseInt(e.target.value);
      this.saveSettings();
    });

    panel.querySelector('#cha-fontsize').addEventListener('change', (e) => {
      this.settings.fontSize = parseInt(e.target.value);
      this.saveSettings();
    });

    return panel;
  }

  injectCSS() {
    const styleId = 'critical-hit-animation-css';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .cha-animation-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999998; /* Below level up animation */
      }

      .cha-critical-hit-text {
        position: absolute;
        font-family: 'Press Start 2P', monospace;
        font-weight: bold;
        text-transform: uppercase;
        white-space: nowrap;
        user-select: none;
        pointer-events: none;
        animation: cha-float-up var(--cha-duration, 1.5s) ease-out forwards;
      }

      @keyframes cha-float-up {
        0% {
          opacity: 0;
          transform: translateY(0) scale(0.5);
        }
        10% {
          opacity: 1;
          transform: translateY(0) scale(1.2);
        }
        20% {
          transform: translateY(0) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateY(var(--cha-float-distance, -100px)) scale(0.8);
        }
      }

      @keyframes cha-glow-pulse {
        0%, 100% {
          filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.8))
                  drop-shadow(0 0 20px rgba(249, 115, 22, 0.6))
                  drop-shadow(0 0 30px rgba(239, 68, 68, 0.4));
        }
        50% {
          filter: drop-shadow(0 0 20px rgba(239, 68, 68, 1))
                  drop-shadow(0 0 40px rgba(249, 115, 22, 0.8))
                  drop-shadow(0 0 60px rgba(239, 68, 68, 0.6));
        }
      }

      .cha-critical-hit-text {
        animation: cha-float-up var(--cha-duration, 1.5s) ease-out forwards,
                   cha-glow-pulse 0.5s ease-in-out infinite;
        background: linear-gradient(135deg, #ef4444 0%, #ef4444 50%, #f97316 50%, #ffffff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-shadow: 0 0 20px rgba(239, 68, 68, 0.8),
                     0 0 40px rgba(249, 115, 22, 0.6);
      }

      .cha-combo-text {
        font-size: 0.7em;
        margin-top: 10px;
        opacity: 0.9;
      }

      @keyframes cha-screen-shake {
        0%, 100% { transform: translate(0, 0); }
        25% { transform: translate(-2px, -2px); }
        50% { transform: translate(2px, 2px); }
        75% { transform: translate(-2px, 2px); }
      }

      .cha-screen-shake {
        animation: cha-screen-shake var(--cha-shake-duration, 250ms) ease-out;
      }
    `;
    document.head.appendChild(style);
    this.debugLog('CSS injected');
  }

  removeCSS() {
    const style = document.getElementById('critical-hit-animation-css');
    if (style) style.remove();
  }

  getAnimationContainer() {
    if (!this.animationContainer) {
      this.animationContainer = document.createElement('div');
      this.animationContainer.className = 'cha-animation-container';
      document.body.appendChild(this.animationContainer);
      this.debugLog('Animation container created');
    }
    return this.animationContainer;
  }

  getMessageAreaPosition() {
    // Try to find the message input area or chat container
    const chatInput = document.querySelector('[class*="channelTextArea"]');
    const messageList = document.querySelector('[class*="messagesWrapper"]');
    const chatContainer = document.querySelector('[class*="chat"]');

    let targetElement = chatInput || messageList || chatContainer;

    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    // Fallback: center of screen, slightly lower than level up
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2 + 50, // 50px lower than level up
    };
  }

  getMessageId(messageElement) {
    // Try to get message ID from various attributes
    const messageId = messageElement.getAttribute('id') ||
                      messageElement.getAttribute('data-message-id') ||
                      messageElement.querySelector('[class*="message"]')?.getAttribute('id') ||
                      messageElement.closest('[class*="message"]')?.getAttribute('id');

    // Extract Discord ID if present (17-19 digits)
    if (messageId) {
      const match = messageId.match(/\d{17,19}/);
      if (match) return match[0];
      return messageId; // Return as-is if no Discord ID found
    }

    // Fallback: use element reference
    return `element-${messageElement.offsetTop}-${messageElement.offsetLeft}`;
  }

  getUserId(messageElement) {
    // Try to extract user ID from message element
    try {
      // Method 1: Try React props (Discord stores message data in React)
      const reactKey = Object.keys(messageElement).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      
      if (reactKey) {
        let fiber = messageElement[reactKey];
        for (let i = 0; i < 15 && fiber; i++) {
          // Try to get author ID from message props
          const authorId =
            fiber.memoizedProps?.message?.author?.id ||
            fiber.memoizedState?.message?.author?.id ||
            fiber.memoizedProps?.message?.authorId ||
            fiber.memoizedProps?.author?.id;
          
          if (authorId && /^\d{17,19}$/.test(authorId)) {
            return authorId;
          }
          
          fiber = fiber.return;
        }
      }

      // Method 2: Try to find author element and extract ID
      const authorElement = messageElement.querySelector('[class*="author"]') ||
                           messageElement.querySelector('[class*="username"]');
      
      if (authorElement) {
        const authorId = authorElement.getAttribute('data-user-id') ||
                        authorElement.getAttribute('data-author-id') ||
                        authorElement.getAttribute('id');
        
        if (authorId) {
          const match = authorId.match(/\d{17,19}/);
          if (match) return match[0];
        }
      }

      // Method 3: Try to get from message ID (sometimes includes user ID)
      const messageId = this.getMessageId(messageElement);
      if (messageId && messageId.length > 19) {
        // Might be composite ID with user ID
        const matches = messageId.match(/\d{17,19}/g);
        if (matches && matches.length > 1) {
          return matches[1]; // Second match might be user ID
        }
      }
    } catch (error) {
      this.debugError('GET_USER_ID', error);
    }

    // Fallback: return null if can't determine user
    return null;
  }

  getUserCombo(userId) {
    if (!userId) {
      // Fallback to global combo if user ID not available
      return { comboCount: 0, lastCritTime: 0, timeout: null };
    }

    if (!this.userCombos.has(userId)) {
      this.userCombos.set(userId, {
        comboCount: 0,
        lastCritTime: 0,
        timeout: null,
      });
    }

    return this.userCombos.get(userId);
  }

  updateUserCombo(userId, comboCount, lastCritTime) {
    if (!userId) return;

    const userCombo = this.getUserCombo(userId);
    userCombo.comboCount = comboCount;
    userCombo.lastCritTime = lastCritTime;

    // Clear existing timeout
    if (userCombo.timeout) {
      clearTimeout(userCombo.timeout);
    }

    // Reset combo after 10 seconds of no crits from this user
    userCombo.timeout = setTimeout(() => {
      if (this.userCombos.has(userId)) {
        this.userCombos.get(userId).comboCount = 0;
      }
    }, 10000);

    this.userCombos.set(userId, userCombo);
  }

  showCriticalHitAnimation(messageElement = null, comboCount = 1) {
    if (!this.settings.enabled) {
      this.debugLog('Animation disabled, skipping');
      return;
    }

    // Get user ID from message element
    const userId = messageElement ? this.getUserId(messageElement) : null;
    const userCombo = this.getUserCombo(userId);

    // Prevent duplicate animations for the same message
    if (messageElement) {
      const messageId = this.getMessageId(messageElement);

      // Check if we've already animated this message
      if (this.animatedMessages.has(messageId)) {
        this.debugLog('Message already animated, skipping duplicate', { messageId, userId });
        return;
      }

      // Check if there's a pending animation for this message
      if (this.pendingAnimations.has(messageId)) {
        this.debugLog('Animation already pending for this message', { messageId, userId });
        return;
      }

      // Mark as pending
      this.pendingAnimations.set(messageId, Date.now());
    }

    // Anti-spam: Check cooldown per user
    const now = Date.now();
    const timeSinceLastCrit = now - userCombo.lastCritTime;

    if (timeSinceLastCrit < this.settings.cooldown && comboCount === 1) {
      // Within cooldown - increment combo instead
      const newCombo = Math.min(userCombo.comboCount + 1, this.settings.maxCombo);
      this.updateUserCombo(userId, newCombo, now);
      this.showComboAnimation(userId, newCombo);
      if (messageElement) {
        const messageId = this.getMessageId(messageElement);
        this.pendingAnimations.delete(messageId);
      }
      return;
    }

    // Reset combo if enough time has passed (10 seconds for typing)
    let newCombo = 1;
    if (timeSinceLastCrit <= 10000) {
      newCombo = Math.min(userCombo.comboCount + 1, this.settings.maxCombo);
    } else {
      newCombo = 1; // Reset combo after 10 seconds
    }

    this.updateUserCombo(userId, newCombo, now);

    // Mark message as animated
    if (messageElement) {
      const messageId = this.getMessageId(messageElement);
      this.animatedMessages.add(messageId);
      this.pendingAnimations.delete(messageId);

      // Clean up old entries (keep last 100)
      if (this.animatedMessages.size > 100) {
        const entries = Array.from(this.animatedMessages);
        this.animatedMessages = new Set(entries.slice(-50));
      }
    }

    try {
      const position = this.getMessageAreaPosition();
      const container = this.getAnimationContainer();

      // Apply screen shake if enabled
      if (this.settings.screenShake && this.settings.shakeIntensity > 0) {
        this.applyScreenShake();
      }

      // Create main text element
      const textElement = document.createElement('div');
      textElement.className = 'cha-critical-hit-text';
      
      // Use the combo we just calculated
      const currentCombo = newCombo;
      
      // Show combo if applicable
      const displayText = currentCombo > 1 && this.settings.showCombo
        ? `CRITICAL HIT! x${currentCombo}`
        : 'CRITICAL HIT!';
      
      textElement.innerHTML = displayText;

      textElement.style.left = `${position.x}px`;
      textElement.style.top = `${position.y}px`;
      textElement.style.fontSize = `${this.settings.fontSize}px`;
      textElement.style.setProperty('--cha-float-distance', `-${this.settings.floatDistance}px`);
      textElement.style.setProperty('--cha-duration', `${this.settings.animationDuration}ms`);

      // Transform to center the text
      textElement.style.transform = 'translate(-50%, -50%)';
      textElement.style.textAlign = 'center';

      container.appendChild(textElement);

      // Track animation
      const animationId = `cha-${Date.now()}`;
      this.activeAnimations.add(animationId);

      // Clean up after animation
      setTimeout(() => {
        textElement.remove();
        this.activeAnimations.delete(animationId);

        // Remove container if no active animations
        if (this.activeAnimations.size === 0 && this.animationContainer) {
          this.animationContainer.remove();
          this.animationContainer = null;
        }
      }, this.settings.animationDuration);

      this.debugLog('Critical hit animation shown', {
        userId: userId || 'unknown',
        comboCount: currentCombo,
        position,
        animationId,
      });
    } catch (error) {
      this.debugError('Failed to show critical hit animation', error);
    }
  }

  showComboAnimation(userId, comboCount) {
    // Update existing animation with combo count for this user
    const container = this.getAnimationContainer();
    if (!container) return;

    const existingText = container.querySelector('.cha-critical-hit-text');
    if (existingText && comboCount > 1) {
      existingText.innerHTML = `CRITICAL HIT! x${comboCount}`;
      // Reset animation to show combo
      existingText.style.animation = 'none';
      setTimeout(() => {
        existingText.style.animation = '';
      }, 10);
    }
  }

  applyScreenShake() {
    const shakeDuration = this.settings.shakeDuration;
    const shakeIntensity = this.settings.shakeIntensity;

    // Apply shake to body or main Discord container
    const discordContainer = document.querySelector('[class*="app"]') || document.body;

    // Create shake keyframes dynamically based on intensity
    const shakeStyle = document.createElement('style');
    shakeStyle.id = 'cha-shake-style';
    shakeStyle.textContent = `
      @keyframes cha-screen-shake-${shakeIntensity} {
        0%, 100% { transform: translate(0, 0); }
        25% { transform: translate(-${shakeIntensity}px, -${shakeIntensity}px); }
        50% { transform: translate(${shakeIntensity}px, ${shakeIntensity}px); }
        75% { transform: translate(-${shakeIntensity}px, ${shakeIntensity}px); }
      }
      .cha-screen-shake-active {
        animation: cha-screen-shake-${shakeIntensity} ${shakeDuration}ms ease-out;
      }
    `;

    // Remove old shake style if exists
    const oldShakeStyle = document.getElementById('cha-shake-style');
    if (oldShakeStyle) oldShakeStyle.remove();

    document.head.appendChild(shakeStyle);
    discordContainer.classList.add('cha-screen-shake-active');

    // Remove shake class after animation
    setTimeout(() => {
      discordContainer.classList.remove('cha-screen-shake-active');
      shakeStyle.remove();
    }, shakeDuration);
  }

  hookIntoCriticalHit() {
    try {
      const critPlugin = BdApi.Plugins.get('CriticalHit');
      if (!critPlugin) {
        this.debugLog('CriticalHit plugin not found, will retry...');
        // Retry after a delay
        setTimeout(() => this.hookIntoCriticalHit(), 2000);
        return;
      }

      const instance = critPlugin.instance || critPlugin;
      if (!instance) {
        this.debugLog('CriticalHit instance not found, will retry...');
        setTimeout(() => this.hookIntoCriticalHit(), 2000);
        return;
      }

      // Patch applyCritStyleWithSettings method to detect crits
      if (instance.applyCritStyleWithSettings) {
        this.patcher = BdApi.Patcher.after(
          'CriticalHitAnimation',
          instance,
          'applyCritStyleWithSettings',
          (_, args) => {
            // args[0] is messageElement, args[1] is critSettings
            const messageElement = args[0];
            if (!messageElement) return;

            // Verify crit was actually applied and message is in DOM
            const checkCritApplied = () => {
              // Check if message is still in DOM and has crit class
              if (!document.contains(messageElement)) {
                return false;
              }

              // Verify crit class is present
              if (!messageElement.classList.contains('bd-crit-hit')) {
                return false;
              }

              // Check if message is fully rendered (has content)
              const content = messageElement.querySelector('[class*="messageContent"]') ||
                            messageElement.querySelector('[class*="content"]') ||
                            messageElement;

              if (!content || !content.textContent?.trim()) {
                return false; // Message not fully rendered yet
              }

              return true;
            };

            // Delay to ensure message is fully processed and not during typing
            setTimeout(() => {
              if (checkCritApplied()) {
                // Additional delay to ensure it's not a premature detection
                setTimeout(() => {
                  if (checkCritApplied()) {
                    this.showCriticalHitAnimation(messageElement);
                  }
                }, 100); // 100ms delay to ensure crit is confirmed
              }
            }, 150); // Initial delay to ensure styling is applied
          }
        );
        this.debugLog('Hooked into CriticalHit.applyCritStyleWithSettings');
      } else {
        this.debugLog('applyCritStyleWithSettings method not found, will retry...');
        setTimeout(() => this.hookIntoCriticalHit(), 2000);
      }

      // Also patch applyCritStyle method (fallback)
      if (instance.applyCritStyle) {
        BdApi.Patcher.after(
          'CriticalHitAnimation',
          instance,
          'applyCritStyle',
          (_, args) => {
            const messageElement = args[0];
            if (!messageElement) return;

            const checkCritApplied = () => {
              if (!document.contains(messageElement)) return false;
              if (!messageElement.classList.contains('bd-crit-hit')) return false;

              const content = messageElement.querySelector('[class*="messageContent"]') ||
                            messageElement.querySelector('[class*="content"]') ||
                            messageElement;

              if (!content || !content.textContent?.trim()) return false;
              return true;
            };

            setTimeout(() => {
              if (checkCritApplied()) {
                setTimeout(() => {
                  if (checkCritApplied()) {
                    this.showCriticalHitAnimation(messageElement);
                  }
                }, 100);
              }
            }, 150);
          }
        );
        this.debugLog('Hooked into CriticalHit.applyCritStyle');
      }
    } catch (error) {
      this.debugError('Failed to hook into CriticalHit', error);
      // Retry after delay
      setTimeout(() => this.hookIntoCriticalHit(), 2000);
    }
  }

  unhookFromCriticalHit() {
    if (this.patcher) {
      BdApi.Patcher.unpatchAll('CriticalHitAnimation');
      this.patcher = null;
      this.debugLog('Unhooked from CriticalHit');
    }
  }

  removeAllAnimations() {
    if (this.animationContainer) {
      this.animationContainer.remove();
      this.animationContainer = null;
    }
    this.activeAnimations.clear();
    
    // Clear all user combos and timeouts
    this.userCombos.forEach((userCombo) => {
      if (userCombo.timeout) {
        clearTimeout(userCombo.timeout);
      }
    });
    this.userCombos.clear();
    
    // Clear pending animations
    this.pendingAnimations.forEach((timestamp, messageId) => {
      // Clear old pending animations (older than 5 seconds)
      if (Date.now() - timestamp > 5000) {
        this.pendingAnimations.delete(messageId);
      }
    });
  }

  debugLog(operation, message, data = null) {
    if (typeof message === 'object' && data === null) {
      data = message;
      message = operation;
      operation = 'GENERAL';
    }
    console.log(`[CriticalHitAnimation] ${operation}:`, message, data || '');
  }

  debugError(operation, error, data = null) {
    console.error(`[CriticalHitAnimation] ERROR [${operation}]:`, error, data || '');
  }
};
