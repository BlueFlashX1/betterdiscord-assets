/**
 * @name LevelUpAnimation
 * @author BlueFlashX1
 * @description Floating "LEVEL UP!" animation when you level up in Solo Leveling Stats
 * @version 1.0.0
 */

module.exports = class LevelUpAnimation {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      animationDuration: 3000, // 3 seconds
      floatDistance: 150, // pixels to float up
      particleCount: 30,
      glowIntensity: 1.5,
      fontSize: 48,
    };

    this.settings = this.defaultSettings;
    this.animationContainer = null;
    this.activeAnimations = new Set();
    this.patcher = null;
  }

  start() {
    this.loadSettings();
    this.injectCSS();
    this.hookIntoSoloLeveling();
    this.debugLog('Plugin started');
  }

  stop() {
    this.unhookIntoSoloLeveling();
    this.removeAllAnimations();
    this.removeCSS();
    this.debugLog('Plugin stopped');
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load('LevelUpAnimation', 'settings');
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
      BdApi.Data.save('LevelUpAnimation', 'settings', this.settings);
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
        <h3 style="color: #8b5cf6; margin-bottom: 10px;">Level Up Animation Settings</h3>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.enabled ? 'checked' : ''} id="lu-enabled">
          <span style="margin-left: 10px;">Enable Level Up Animation</span>
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Animation Duration (ms):</span>
          <input type="number" id="lu-duration" value="${this.settings.animationDuration}" min="1000" max="10000" step="500" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Float Distance (px):</span>
          <input type="number" id="lu-distance" value="${this.settings.floatDistance}" min="50" max="500" step="10" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Particle Count:</span>
          <input type="number" id="lu-particles" value="${this.settings.particleCount}" min="10" max="100" step="5" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Font Size (px):</span>
          <input type="number" id="lu-fontsize" value="${this.settings.fontSize}" min="24" max="96" step="4" style="width: 100%; padding: 5px;">
        </label>
      </div>
    `;

    // Event listeners
    panel.querySelector('#lu-enabled').addEventListener('change', (e) => {
      this.settings.enabled = e.target.checked;
      this.saveSettings();
    });

    panel.querySelector('#lu-duration').addEventListener('change', (e) => {
      this.settings.animationDuration = parseInt(e.target.value);
      this.saveSettings();
    });

    panel.querySelector('#lu-distance').addEventListener('change', (e) => {
      this.settings.floatDistance = parseInt(e.target.value);
      this.saveSettings();
    });

    panel.querySelector('#lu-particles').addEventListener('change', (e) => {
      this.settings.particleCount = parseInt(e.target.value);
      this.saveSettings();
    });

    panel.querySelector('#lu-fontsize').addEventListener('change', (e) => {
      this.settings.fontSize = parseInt(e.target.value);
      this.saveSettings();
    });

    return panel;
  }

  injectCSS() {
    const styleId = 'level-up-animation-css';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .lu-animation-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999999;
      }

      .lu-level-up-text {
        position: absolute;
        font-family: 'Press Start 2P', monospace;
        font-weight: bold;
        text-transform: uppercase;
        white-space: nowrap;
        user-select: none;
        pointer-events: none;
        animation: lu-float-up 3s ease-out forwards;
      }

      @keyframes lu-float-up {
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
          transform: translateY(var(--lu-float-distance, -150px)) scale(0.8);
        }
      }

      @keyframes lu-glow-pulse {
        0%, 100% {
          filter: drop-shadow(0 0 10px rgba(139, 92, 246, 0.8))
                  drop-shadow(0 0 20px rgba(139, 92, 246, 0.6))
                  drop-shadow(0 0 30px rgba(139, 92, 246, 0.4));
        }
        50% {
          filter: drop-shadow(0 0 20px rgba(139, 92, 246, 1))
                  drop-shadow(0 0 40px rgba(139, 92, 246, 0.8))
                  drop-shadow(0 0 60px rgba(139, 92, 246, 0.6));
        }
      }

      .lu-level-up-text {
        animation: lu-float-up var(--lu-duration, 3s) ease-out forwards,
                   lu-glow-pulse 0.5s ease-in-out infinite;
        background: linear-gradient(135deg, #8b5cf6 0%, #8b5cf6 50%, #ffffff 50%, #ffffff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-shadow: 0 0 20px rgba(139, 92, 246, 0.8),
                     0 0 40px rgba(255, 255, 255, 0.6);
      }

      .lu-particle {
        position: absolute;
        width: 4px;
        height: 4px;
        background: radial-gradient(circle, #8b5cf6 0%, rgba(139, 92, 246, 0) 70%);
        border-radius: 50%;
        pointer-events: none;
        animation: lu-particle-fade var(--lu-duration, 3s) ease-out forwards;
      }

      @keyframes lu-particle-fade {
        0% {
          opacity: 1;
          transform: translate(0, 0) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(var(--lu-particle-x, 0), var(--lu-particle-y, -100px)) scale(0);
        }
      }
    `;
    document.head.appendChild(style);
    this.debugLog('CSS injected');
  }

  removeCSS() {
    const style = document.getElementById('level-up-animation-css');
    if (style) style.remove();
  }

  getAnimationContainer() {
    if (!this.animationContainer) {
      this.animationContainer = document.createElement('div');
      this.animationContainer.className = 'lu-animation-container';
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

    // Fallback: center of screen
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
  }

  createParticles(startX, startY, count) {
    const container = this.getAnimationContainer();
    const particles = [];

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'lu-particle';

      // Random direction and distance
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const distance = 50 + Math.random() * 100;
      const particleX = Math.cos(angle) * distance;
      const particleY = Math.sin(angle) * distance - 50; // Float up

      particle.style.left = `${startX}px`;
      particle.style.top = `${startY}px`;
      particle.style.setProperty('--lu-particle-x', `${particleX}px`);
      particle.style.setProperty('--lu-particle-y', `${particleY}px`);
      particle.style.setProperty('--lu-duration', `${this.settings.animationDuration}ms`);

      container.appendChild(particle);
      particles.push(particle);
    }

    return particles;
  }

  showLevelUpAnimation(newLevel, oldLevel) {
    if (!this.settings.enabled) {
      this.debugLog('Animation disabled, skipping');
      return;
    }

    try {
      const position = this.getMessageAreaPosition();
      const container = this.getAnimationContainer();

      // Create main text element
      const textElement = document.createElement('div');
      textElement.className = 'lu-level-up-text';
      textElement.textContent = 'LEVEL UP!';
      textElement.style.left = `${position.x}px`;
      textElement.style.top = `${position.y}px`;
      textElement.style.fontSize = `${this.settings.fontSize}px`;
      textElement.style.setProperty('--lu-float-distance', `-${this.settings.floatDistance}px`);
      textElement.style.setProperty('--lu-duration', `${this.settings.animationDuration}ms`);

      // Transform to center the text
      textElement.style.transform = 'translate(-50%, -50%)';
      textElement.style.textAlign = 'center';

      container.appendChild(textElement);

      // Create particles
      const particles = this.createParticles(position.x, position.y, this.settings.particleCount);

      // Track animation
      const animationId = `lu-${Date.now()}`;
      this.activeAnimations.add(animationId);

      // Clean up after animation
      setTimeout(() => {
        textElement.remove();
        particles.forEach((p) => p.remove());
        this.activeAnimations.delete(animationId);

        // Remove container if no active animations
        if (this.activeAnimations.size === 0 && this.animationContainer) {
          this.animationContainer.remove();
          this.animationContainer = null;
        }
      }, this.settings.animationDuration);

      this.debugLog('Level up animation shown', {
        newLevel,
        oldLevel,
        position,
        animationId,
      });
    } catch (error) {
      this.debugError('Failed to show level up animation', error);
    }
  }

  hookIntoSoloLeveling() {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) {
        this.debugLog('SoloLevelingStats plugin not found, will retry...');
        // Retry after a delay
        setTimeout(() => this.hookIntoSoloLeveling(), 2000);
        return;
      }

      const instance = soloPlugin.instance || soloPlugin;
      if (!instance) {
        this.debugLog('SoloLevelingStats instance not found, will retry...');
        setTimeout(() => this.hookIntoSoloLeveling(), 2000);
        return;
      }

      // Patch showLevelUpNotification method
      if (instance.showLevelUpNotification) {
        this.patcher = BdApi.Patcher.after(
          'LevelUpAnimation',
          instance,
          'showLevelUpNotification',
          (_, args) => {
            const [newLevel, oldLevel] = args;
            this.showLevelUpAnimation(newLevel, oldLevel);
          }
        );
        this.debugLog('Hooked into SoloLevelingStats.showLevelUpNotification');
      } else {
        this.debugLog('showLevelUpNotification method not found, will retry...');
        setTimeout(() => this.hookIntoSoloLeveling(), 2000);
      }
    } catch (error) {
      this.debugError('Failed to hook into SoloLevelingStats', error);
      // Retry after delay
      setTimeout(() => this.hookIntoSoloLeveling(), 2000);
    }
  }

  unhookIntoSoloLeveling() {
    if (this.patcher) {
      BdApi.Patcher.unpatchAll('LevelUpAnimation');
      this.patcher = null;
      this.debugLog('Unhooked from SoloLevelingStats');
    }
  }

  removeAllAnimations() {
    if (this.animationContainer) {
      this.animationContainer.remove();
      this.animationContainer = null;
    }
    this.activeAnimations.clear();
  }

  debugLog(operation, message, data = null) {
    if (typeof message === 'object' && data === null) {
      data = message;
      message = operation;
      operation = 'GENERAL';
    }
    console.log(`[LevelUpAnimation] ${operation}:`, message, data || '');
  }

  debugError(operation, error, data = null) {
    console.error(`[LevelUpAnimation] ERROR [${operation}]:`, error, data || '');
  }
};
