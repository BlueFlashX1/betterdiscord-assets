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
      maxCombo: 5,
      ownUserId: null,
    };

    this.settings = this.defaultSettings;
    this.animationContainer = null;
    this.activeAnimations = new Set();
    this.userCombos = new Map();
    this.animatedMessages = new Set();
    this.currentUserId = null;
    this.pluginStartTime = Date.now();
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

    BdApi.Patcher.after('CriticalHitAnimation', instance, 'onCritHit', (_, args) => {
      const messageElement = args[0];
      if (!messageElement) return;

      const messageId = this.getMessageId(messageElement);
      if (!messageId || messageId.length < 17) return;

      // Skip if already animated
      if (this.animatedMessages.has(messageId)) return;

      // Check if own message
      const userId = this.getUserId(messageElement);
      if (!this.isOwnMessage(messageElement, userId)) return;

      // Check if new message (not in history)
      if (this.isMessageInHistory(messageId)) {
        // Check if recent (within 10 seconds) - allow animation
        const messageTime = this.getMessageTimestamp(messageElement);
        const timeDiff = Date.now() - (messageTime || 0);
        if (timeDiff > 10000) return; // Too old, skip
      }

      // Mark as animated and show animation
      this.animatedMessages.add(messageId);
      setTimeout(() => {
        this.showAnimation(messageElement);
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
            if (/^\d{17,19}$/.test(id)) return id;
          }
          fiber = fiber.return;
        }
      }

      const dataId = element.getAttribute('data-message-id');
      if (dataId) {
        const match = dataId.match(/\d{17,19}/);
        if (match) return match[0];
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
          if (authorId && /^\d{17,19}$/.test(authorId)) return authorId;
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

    const userId = this.getUserId(messageElement) || 'unknown';
    const userCombo = this.getUserCombo(userId);
    const now = Date.now();
    const timeSinceLastCrit = now - userCombo.lastCritTime;

    let combo = 1;
    if (timeSinceLastCrit <= 10000) {
      combo = Math.min(userCombo.comboCount + 1, this.settings.maxCombo);
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
    textElement.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      font-size: ${this.settings.fontSize}px;
      font-weight: bold;
      color: #ff4444;
      text-shadow: 0 0 10px rgba(255, 68, 68, 0.8), 0 0 20px rgba(255, 68, 68, 0.6);
      transform: translate(-50%, -50%);
      text-align: center;
      pointer-events: none;
      z-index: 999999;
      animation: chaFloatUp ${this.settings.animationDuration}ms ease-out forwards;
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

    if (combo.timeout) clearTimeout(combo.timeout);
    combo.timeout = setTimeout(() => {
      if (this.userCombos.has(key)) {
        this.userCombos.get(key).comboCount = 0;
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
