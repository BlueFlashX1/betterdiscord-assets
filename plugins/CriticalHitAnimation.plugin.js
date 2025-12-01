/**
 * @name CriticalHitAnimation
 * @author BlueFlashX1
 * @description Animated "CRITICAL HIT!" notification with screen shake when crits land
 * @version 2.0.0
 */

module.exports = class CriticalHitAnimation {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      animationDuration: 1500,
      floatDistance: 100,
      fontSize: 36,
      screenShake: true,
      shakeIntensity: 3,
      shakeDuration: 250,
      cooldown: 500,
      showCombo: true,
      maxCombo: 999, // Unlimited (high cap for display purposes)
      ownUserId: null,
    };

    this.settings = this.defaultSettings;
    this.animationContainer = null;
    this.activeAnimations = new Set();
    this.userCombos = new Map();
    this.animatedMessages = new Set();
    this.currentUserId = null;
    this.pluginStartTime = Date.now();
    this.lastAnimationTime = 0; // Track last animation time for cooldown
  }

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
    if (this.animationContainer) {
      this.animationContainer.remove();
      this.animationContainer = null;
    }
    this.activeAnimations.clear();
    this.userCombos.clear();
  }

  loadSettings() {
    const saved = BdApi.Data.load('CriticalHitAnimation', 'settings');
    if (saved) {
      this.settings = Object.assign({}, this.defaultSettings, saved);
      this.currentUserId = this.settings.ownUserId;
    }
  }

  saveSettings() {
    BdApi.Data.save('CriticalHitAnimation', 'settings', this.settings);
  }

  getCurrentUserId() {
    try {
      const UserStore = BdApi.Webpack.getModule(m => m.getCurrentUser);
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

  hookIntoCriticalHit() {
    const critPlugin = BdApi.Plugins.get('CriticalHit');
    if (!critPlugin) {
      setTimeout(() => this.hookIntoCriticalHit(), 2000);
      return;
    }

    const instance = critPlugin.instance || critPlugin;
    if (!instance || !instance.onCritHit) {
      setTimeout(() => this.hookIntoCriticalHit(), 2000);
      return;
    }

    // Hook into checkForCrit to detect non-crit messages and reset combo
    if (instance.checkForCrit) {
      BdApi.Patcher.after('CriticalHitAnimation', instance, 'checkForCrit', (_, args, returnValue) => {
        const messageElement = args[0];
        if (!messageElement) return;

        // Check if own message
        const userId = this.getUserId(messageElement);
        if (!userId || !/^\d{17,19}$/.test(userId)) return;
        if (!this.isOwnMessage(messageElement, userId)) return;

        // Wait a bit for crit class to be applied (if it's a crit)
        setTimeout(() => {
          // If message doesn't have crit class, reset combo
          if (!messageElement.classList || !messageElement.classList.contains('bd-crit-hit')) {
            const key = userId || 'unknown';
            if (this.userCombos.has(key)) {
              this.userCombos.get(key).comboCount = 0;
              // Clear timeout since combo is reset
              if (this.userCombos.get(key).timeout) {
                clearTimeout(this.userCombos.get(key).timeout);
                this.userCombos.get(key).timeout = null;
              }
            }
          }
        }, 200); // Wait 200ms for crit class to be applied
      });
    }

    BdApi.Patcher.after('CriticalHitAnimation', instance, 'onCritHit', (_, args) => {
      const messageElement = args[0];
      if (!messageElement) return;

      // CRITICAL: Verify message actually has the crit class
      if (!messageElement.classList || !messageElement.classList.contains('bd-crit-hit')) {
        return; // Not a critical hit, skip
      }

      const messageId = this.getMessageId(messageElement);
      // Validate message ID is a proper Discord ID (17-19 digits)
      if (!messageId || !/^\d{17,19}$/.test(messageId)) return;

      // Skip if already animated (prevent duplicates)
      if (this.animatedMessages.has(messageId)) return;

      // Cooldown: Prevent rapid duplicate animations (minimum 100ms between animations)
      const now = Date.now();
      if (now - this.lastAnimationTime < 100) {
        return; // Too soon, skip
      }

      // Check if own message
      const userId = this.getUserId(messageElement);
      // Validate user ID is a proper Discord ID (17-19 digits)
      if (!userId || !/^\d{17,19}$/.test(userId)) return;

      if (!this.isOwnMessage(messageElement, userId)) return;

      // Check if message is old (in history) vs new (not in history)
      const isInHistory = this.isMessageInHistory(messageId);

      if (isInHistory) {
        // Message is in history - check if it's recent (just saved) or old (restored)
        const messageTime = this.getMessageTimestamp(messageElement);
        const timeDiff = Date.now() - (messageTime || 0);

        if (timeDiff > 10000) {
          // Old message (> 10 seconds) - skip entirely (it's a restoration)
          return;
        }
        // Recent message (within 10 seconds) - it was just saved to history, allow animation
      } else {
        // New message (not in history) - proceed with animation
      }

      // Mark as animated and show animation
      this.animatedMessages.add(messageId);
      this.lastAnimationTime = Date.now(); // Update cooldown timer
      setTimeout(() => {
        // Double-check crit class is still present before animating
        if (messageElement.classList && messageElement.classList.contains('bd-crit-hit')) {
          this.showAnimation(messageElement);
        }
      }, 50);
    });
  }

  isOwnMessage(messageElement, userId) {
    if (this.settings.ownUserId && userId === this.settings.ownUserId) return true;
    if (this.currentUserId && userId === this.currentUserId) return true;

    // Try to detect from message element
    if (!this.currentUserId) {
      this.getCurrentUserId();
    }

    return userId === this.currentUserId;
  }

  isMessageInHistory(messageId) {
    try {
      const history = BdApi.Data.load('CriticalHit', 'messageHistory');
      if (!Array.isArray(history)) return false;
      return history.some(entry => String(entry.messageId) === String(messageId));
    } catch (e) {
      return false;
    }
  }

  getMessageId(element) {
    try {
      const reactKey = Object.keys(element).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (reactKey) {
        let fiber = element[reactKey];
        for (let i = 0; i < 50 && fiber; i++) {
          const messageObj = fiber.memoizedProps?.message || fiber.memoizedState?.message;
          if (messageObj?.id) {
            const id = String(messageObj.id).trim();
            // Validate it's a proper Discord message ID (17-19 digits)
            if (/^\d{17,19}$/.test(id)) return id;
          }
          fiber = fiber.return;
        }
      }

      const dataId = element.getAttribute('data-message-id');
      if (dataId) {
        const match = dataId.match(/^\d{17,19}$/); // Only match if entire string is valid ID
        if (match) return match[0];
        // If composite format, extract last valid ID
        const allMatches = dataId.match(/\d{17,19}/g);
        if (allMatches && allMatches.length > 0) {
          return allMatches[allMatches.length - 1]; // Take last match (usually message ID)
        }
      }
    } catch (e) {}
    return null;
  }

  getUserId(element) {
    try {
      const reactKey = Object.keys(element).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (reactKey) {
        let fiber = element[reactKey];
        for (let i = 0; i < 30 && fiber; i++) {
          const authorId = fiber.memoizedProps?.message?.author?.id || fiber.memoizedState?.message?.author?.id;
          // Validate it's a proper Discord user ID (17-19 digits)
          if (authorId && /^\d{17,19}$/.test(String(authorId).trim())) {
            return String(authorId).trim();
          }
          fiber = fiber.return;
        }
      }
    } catch (e) {}
    return null;
  }

  getMessageTimestamp(element) {
    try {
      const reactKey = Object.keys(element).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (reactKey) {
        let fiber = element[reactKey];
        for (let i = 0; i < 30 && fiber; i++) {
          const timestamp = fiber.memoizedProps?.message?.timestamp || fiber.memoizedState?.message?.timestamp;
          if (timestamp) {
            if (timestamp instanceof Date) return timestamp.getTime();
            if (typeof timestamp === 'string') return new Date(timestamp).getTime();
            if (typeof timestamp === 'number') return timestamp;
          }
          fiber = fiber.return;
        }
      }
    } catch (e) {}
    return 0;
  }

  showAnimation(messageElement) {
    if (!this.settings.enabled) return;

    // Final safety check: verify message still has crit class
    if (!messageElement || !messageElement.classList || !messageElement.classList.contains('bd-crit-hit')) {
      return; // Not a critical hit, don't animate
    }

    const userId = this.getUserId(messageElement) || 'unknown';
    const userCombo = this.getUserCombo(userId);
    const now = Date.now();
    const timeSinceLastCrit = now - userCombo.lastCritTime;

    let combo = 1;
    if (timeSinceLastCrit <= 10000) {
      // Unlimited combo - just increment, no cap
      combo = userCombo.comboCount + 1;
    }

    this.updateUserCombo(userId, combo, now);

    const position = this.getMessageAreaPosition();
    const container = this.getAnimationContainer();

    if (!container) return;

    if (this.settings.screenShake) {
      this.applyScreenShake();
    }

    const textElement = document.createElement('div');
    textElement.className = 'cha-critical-hit-text';
    textElement.innerHTML = combo > 1 && this.settings.showCombo ? `CRITICAL HIT! x${combo}` : 'CRITICAL HIT!';
    // Apply positioning and animation via inline styles, but let CSS class handle font and gradient
    textElement.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      font-size: ${this.settings.fontSize}px;
      font-weight: bold;
      transform: translate(-50%, -50%);
      text-align: center;
      pointer-events: none;
      z-index: 999999;
      animation: chaFloatUp ${this.settings.animationDuration}ms ease-out forwards;
      color: transparent !important;
    `;

    container.appendChild(textElement);

    setTimeout(() => {
      textElement.remove();
      this.activeAnimations.delete(textElement);
    }, this.settings.animationDuration);
  }

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

    // Save combo data for SoloLevelingStats to read
    try {
      BdApi.Data.save('CriticalHitAnimation', 'userCombo', {
        userId: key,
        comboCount: comboCount,
        lastCritTime: lastCritTime,
      });
    } catch (error) {
      // Silently fail if save doesn't work
    }

    // Reset combo after 10 seconds of NO crits (non-crit messages don't affect combo)
    // This timeout is reset every time a crit happens, so combo only resets if 10 seconds pass without crits
    if (combo.timeout) clearTimeout(combo.timeout);
    combo.timeout = setTimeout(() => {
      if (this.userCombos.has(key)) {
        this.userCombos.get(key).comboCount = 0;
        // Clear saved combo data when reset
        try {
          BdApi.Data.save('CriticalHitAnimation', 'userCombo', {
            userId: key,
            comboCount: 0,
            lastCritTime: 0,
          });
        } catch (error) {
          // Silently fail
        }
      }
    }, 10000);
  }

  getAnimationContainer() {
    if (!this.animationContainer || !document.contains(this.animationContainer)) {
      this.animationContainer = document.createElement('div');
      this.animationContainer.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 999999;';
      document.body.appendChild(this.animationContainer);
    }
    return this.animationContainer;
  }

  getMessageAreaPosition() {
    const chatInput = document.querySelector('[class*="channelTextArea"]');
    const messageList = document.querySelector('[class*="messagesWrapper"]');
    const target = chatInput || messageList;

    if (target) {
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    return { x: window.innerWidth / 2, y: window.innerHeight / 2 + 50 };
  }

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

  injectCSS() {
    // Inject Nova Flat font if not already loaded
    if (!document.getElementById('cha-nova-flat-font')) {
      const fontLink = document.createElement('link');
      fontLink.id = 'cha-nova-flat-font';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Nova+Flat&display=swap';
      document.head.appendChild(fontLink);
    }

    // Remove old styles if they exist
    const oldStyle = document.getElementById('cha-styles');
    if (oldStyle) oldStyle.remove();

    const style = document.createElement('style');
    style.id = 'cha-styles';
    style.textContent = `
      @keyframes chaFloatUp {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        50% {
          opacity: 1;
          transform: translate(-50%, calc(-50% - ${this.settings.floatDistance}px)) scale(1.1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, calc(-50% - ${this.settings.floatDistance * 1.5}px)) scale(0.9);
        }
      }
      .cha-critical-hit-text {
        font-family: 'Nova Flat', sans-serif !important;
        background: linear-gradient(135deg, #ff4444 0%, #ff8800 25%, #ffaa00 50%, #ffcc00 75%, #ffff00 100%) !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        background-clip: text !important;
        color: transparent !important;
        filter: drop-shadow(0 0 8px rgba(255, 68, 68, 0.8)) drop-shadow(0 0 16px rgba(255, 136, 0, 0.6)) !important;
        display: inline-block !important;
      }
    `;
    document.head.appendChild(style);
  }

  getSettingsPanel() {
    return BdApi.React.createElement('div', { style: { padding: '20px' } },
      BdApi.React.createElement('h2', null, 'Critical Hit Animation Settings'),
      BdApi.React.createElement('label', { style: { display: 'block', marginTop: '10px' } },
        BdApi.React.createElement('input', {
          type: 'checkbox',
          checked: this.settings.enabled,
          onChange: (e) => {
            this.settings.enabled = e.target.checked;
            this.saveSettings();
          }
        }),
        ' Enable animations'
      ),
      BdApi.React.createElement('label', { style: { display: 'block', marginTop: '10px' } },
        'Animation Duration (ms): ',
        BdApi.React.createElement('input', {
          type: 'number',
          value: this.settings.animationDuration,
          onChange: (e) => {
            this.settings.animationDuration = parseInt(e.target.value) || 1500;
            this.saveSettings();
          }
        })
      ),
      BdApi.React.createElement('label', { style: { display: 'block', marginTop: '10px' } },
        BdApi.React.createElement('input', {
          type: 'checkbox',
          checked: this.settings.screenShake,
          onChange: (e) => {
            this.settings.screenShake = e.target.checked;
            this.saveSettings();
          }
        }),
        ' Screen shake'
      ),
      BdApi.React.createElement('label', { style: { display: 'block', marginTop: '10px' } },
        BdApi.React.createElement('input', {
          type: 'checkbox',
          checked: this.settings.showCombo,
          onChange: (e) => {
            this.settings.showCombo = e.target.checked;
            this.saveSettings();
          }
        }),
        ' Show combo counter'
      )
    );
  }
};
