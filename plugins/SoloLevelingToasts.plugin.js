/**
 * @name SoloLevelingToasts
 * @author BlueFlashX1
 * @description Custom toast notifications for Solo Leveling Stats with purple gradient, glow, and particle effects
 * @version 1.0.0
 */

module.exports = class SoloLevelingToasts {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      showParticles: true,
      particleCount: 20,
      animationDuration: 500, // Slide-in animation
      defaultTimeout: 5000, // 5 seconds
      position: 'top-right', // top-right, top-left, bottom-right, bottom-left
      maxToasts: 5, // Maximum number of toasts visible at once
    };

    this.settings = this.defaultSettings;
    this.toastContainer = null;
    this.activeToasts = [];
    this.patcher = null;
  }

  start() {
    this.loadSettings();
    this.injectCSS();
    this.createToastContainer();
    this.hookIntoSoloLeveling();
    this.debugLog('Plugin started');
  }

  stop() {
    this.unhookIntoSoloLeveling();
    this.removeAllToasts();
    this.removeToastContainer();
    this.removeCSS();
    this.debugLog('Plugin stopped');
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load('SoloLevelingToasts', 'settings');
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
      BdApi.Data.save('SoloLevelingToasts', 'settings', this.settings);
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
        <h3 style="color: #8b5cf6; margin-bottom: 10px;">Solo Leveling Toast Settings</h3>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.enabled ? 'checked' : ''} id="toast-enabled">
          <span style="margin-left: 10px;">Enable Custom Toasts</span>
        </label>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.showParticles ? 'checked' : ''} id="toast-particles">
          <span style="margin-left: 10px;">Show Particle Effects</span>
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Particle Count:</span>
          <input type="number" id="toast-particle-count" value="${this.settings.particleCount}" min="5" max="50" step="5" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Default Timeout (ms):</span>
          <input type="number" id="toast-timeout" value="${this.settings.defaultTimeout}" min="1000" max="10000" step="500" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Position:</span>
          <select id="toast-position" style="width: 100%; padding: 5px;">
            <option value="top-right" ${this.settings.position === 'top-right' ? 'selected' : ''}>Top Right</option>
            <option value="top-left" ${this.settings.position === 'top-left' ? 'selected' : ''}>Top Left</option>
            <option value="bottom-right" ${this.settings.position === 'bottom-right' ? 'selected' : ''}>Bottom Right</option>
            <option value="bottom-left" ${this.settings.position === 'bottom-left' ? 'selected' : ''}>Bottom Left</option>
          </select>
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Max Toasts:</span>
          <input type="number" id="toast-max" value="${this.settings.maxToasts}" min="1" max="10" step="1" style="width: 100%; padding: 5px;">
        </label>
      </div>
    `;

    // Event listeners
    panel.querySelector('#toast-enabled').addEventListener('change', (e) => {
      this.settings.enabled = e.target.checked;
      this.saveSettings();
    });

    panel.querySelector('#toast-particles').addEventListener('change', (e) => {
      this.settings.showParticles = e.target.checked;
      this.saveSettings();
    });

    panel.querySelector('#toast-particle-count').addEventListener('change', (e) => {
      this.settings.particleCount = parseInt(e.target.value);
      this.saveSettings();
    });

    panel.querySelector('#toast-timeout').addEventListener('change', (e) => {
      this.settings.defaultTimeout = parseInt(e.target.value);
      this.saveSettings();
    });

    panel.querySelector('#toast-position').addEventListener('change', (e) => {
      this.settings.position = e.target.value;
      this.saveSettings();
      this.updateContainerPosition();
    });

    panel.querySelector('#toast-max').addEventListener('change', (e) => {
      this.settings.maxToasts = parseInt(e.target.value);
      this.saveSettings();
    });

    return panel;
  }

  injectCSS() {
    const styleId = 'solo-leveling-toasts-css';
    if (document.getElementById(styleId)) {
      this.debugLog('INJECT_CSS', 'CSS already injected');
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .sl-toast-container {
        position: fixed;
        z-index: 999998;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      }

      .sl-toast-container.top-right {
        top: 20px;
        right: 20px;
        align-items: flex-end;
      }

      .sl-toast-container.top-left {
        top: 20px;
        left: 20px;
        align-items: flex-start;
      }

      .sl-toast-container.bottom-right {
        bottom: 20px;
        right: 20px;
        align-items: flex-end;
      }

      .sl-toast-container.bottom-left {
        bottom: 20px;
        left: 20px;
        align-items: flex-start;
      }

      .sl-toast {
        position: relative;
        min-width: 300px;
        max-width: 400px;
        padding: 16px 20px;
        background: rgba(10, 10, 15, 0.95);
        border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4),
                    0 0 40px rgba(139, 92, 246, 0.2);
        pointer-events: auto;
        cursor: pointer;
        overflow: hidden;
        animation: sl-toast-slide-in 0.5s ease-out forwards;
      }

      @keyframes sl-toast-slide-in {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .sl-toast-container.top-left .sl-toast {
        animation-name: sl-toast-slide-in-left;
      }

      @keyframes sl-toast-slide-in-left {
        from {
          opacity: 0;
          transform: translateX(-100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .sl-toast-container.bottom-right .sl-toast,
      .sl-toast-container.bottom-left .sl-toast {
        animation-name: sl-toast-slide-in-bottom;
      }

      @keyframes sl-toast-slide-in-bottom {
        from {
          opacity: 0;
          transform: translateY(100%);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .sl-toast.level-up {
        border-color: rgba(139, 92, 246, 0.5);
        box-shadow: 0 4px 20px rgba(139, 92, 246, 0.5),
                    0 0 40px rgba(139, 92, 246, 0.3);
      }

      .sl-toast.achievement {
        border-color: rgba(251, 191, 36, 0.5);
        box-shadow: 0 4px 20px rgba(251, 191, 36, 0.5),
                    0 0 40px rgba(251, 191, 36, 0.3);
      }

      .sl-toast.quest {
        border-color: rgba(34, 197, 94, 0.5);
        box-shadow: 0 4px 20px rgba(34, 197, 94, 0.5),
                    0 0 40px rgba(34, 197, 94, 0.3);
      }

      .sl-toast.error {
        border-color: rgba(239, 68, 68, 0.5);
        box-shadow: 0 4px 20px rgba(239, 68, 68, 0.5),
                    0 0 40px rgba(239, 68, 68, 0.3);
      }

      .sl-toast-title {
        font-family: 'Press Start 2P', monospace;
        font-size: 12px;
        font-weight: bold;
        margin-bottom: 8px;
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 30%, #6d28d9 60%, #000000 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-shadow: 0 0 3px rgba(139, 92, 246, 0.5),
                     0 0 6px rgba(124, 58, 237, 0.4),
                     0 0 9px rgba(109, 40, 217, 0.3);
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .sl-toast-message {
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .sl-toast-particle {
        position: absolute;
        width: 4px;
        height: 4px;
        background: radial-gradient(circle, #8b5cf6 0%, rgba(139, 92, 246, 0) 70%);
        border-radius: 50%;
        pointer-events: none;
        animation: sl-particle-fade 1.5s ease-out forwards;
      }

      @keyframes sl-particle-fade {
        0% {
          opacity: 1;
          transform: translate(0, 0) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(var(--sl-particle-x, 0), var(--sl-particle-y, -50px)) scale(0);
        }
      }

      .sl-toast::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.8), transparent);
        animation: sl-toast-progress linear forwards;
      }

      @keyframes sl-toast-progress {
        from {
          width: 100%;
        }
        to {
          width: 0%;
        }
      }
    `;
    document.head.appendChild(style);
    this.debugLog('INJECT_CSS', 'CSS injected successfully', {
      styleId,
      styleExists: !!document.getElementById(styleId),
    });
  }

  removeCSS() {
    const style = document.getElementById('solo-leveling-toasts-css');
    if (style) style.remove();
  }

  createToastContainer() {
    if (this.toastContainer) {
      this.debugLog('CREATE_CONTAINER', 'Container already exists');
      return;
    }

    this.toastContainer = document.createElement('div');
    this.toastContainer.className = `sl-toast-container ${this.settings.position}`;
    document.body.appendChild(this.toastContainer);
    this.debugLog('CREATE_CONTAINER', 'Toast container created', {
      position: this.settings.position,
      containerExists: !!this.toastContainer,
      parentExists: !!this.toastContainer.parentElement,
    });
  }

  removeToastContainer() {
    if (this.toastContainer) {
      this.toastContainer.remove();
      this.toastContainer = null;
    }
  }

  updateContainerPosition() {
    if (this.toastContainer) {
      this.toastContainer.className = `sl-toast-container ${this.settings.position}`;
    }
  }

  detectToastType(message, type) {
    const msg = message.toLowerCase();

    if (type === 'success' || msg.includes('level up') || msg.includes('level')) {
      return 'level-up';
    }
    if (msg.includes('achievement') || msg.includes('unlocked')) {
      return 'achievement';
    }
    if (msg.includes('quest') || msg.includes('complete')) {
      return 'quest';
    }
    if (type === 'error') {
      return 'error';
    }

    return 'info';
  }

  createParticles(toastElement, count) {
    if (!this.settings.showParticles) return;

    const rect = toastElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'sl-toast-particle';

      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const distance = 30 + Math.random() * 40;
      const particleX = Math.cos(angle) * distance;
      const particleY = Math.sin(angle) * distance - 20;

      particle.style.left = `${centerX}px`;
      particle.style.top = `${centerY}px`;
      particle.style.setProperty('--sl-particle-x', `${particleX}px`);
      particle.style.setProperty('--sl-particle-y', `${particleY}px`);

      document.body.appendChild(particle);

      setTimeout(() => {
        particle.remove();
      }, 1500);
    }
  }

  showToast(message, type = 'info', timeout = null) {
    this.debugLog('SHOW_TOAST', 'Toast request received', {
      message: message?.substring(0, 100),
      type,
      timeout,
      enabled: this.settings.enabled,
      activeToasts: this.activeToasts.length,
    });

    if (!this.settings.enabled) {
      this.debugLog('SHOW_TOAST', 'Plugin disabled, using fallback toast');
      // Fallback to default toast
      if (BdApi && typeof BdApi.showToast === 'function') {
        BdApi.showToast(message, { type, timeout: timeout || this.settings.defaultTimeout });
      }
      return;
    }

    try {
      // Limit number of toasts
      if (this.activeToasts.length >= this.settings.maxToasts) {
        const oldestToast = this.activeToasts.shift();
        this.debugLog('SHOW_TOAST', 'Max toasts reached, removing oldest', {
          maxToasts: this.settings.maxToasts,
        });
        this.removeToast(oldestToast);
      }

      const toastType = this.detectToastType(message, type);
      const toastTimeout = timeout || this.settings.defaultTimeout;

      this.debugLog('SHOW_TOAST', 'Creating toast', {
        toastType,
        toastTimeout,
        messageLength: message?.length,
      });

      const toast = document.createElement('div');
      toast.className = `sl-toast ${toastType}`;
      toast.style.setProperty('--sl-toast-timeout', `${toastTimeout}ms`);

      // Extract title and message
      const lines = message.split('\n');
      const title = lines[0] || 'Notification';
      const body = lines.slice(1).join('\n') || '';

      toast.innerHTML = `
        <div class="sl-toast-title">${this.escapeHtml(title)}</div>
        ${body ? `<div class="sl-toast-message">${this.escapeHtml(body)}</div>` : ''}
      `;

      // Add progress bar animation
      const progressBar = document.createElement('div');
      progressBar.style.position = 'absolute';
      progressBar.style.top = '0';
      progressBar.style.left = '0';
      progressBar.style.right = '0';
      progressBar.style.height = '2px';
      progressBar.style.background = 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.8), transparent)';
      progressBar.style.animation = `sl-toast-progress ${toastTimeout}ms linear forwards`;
      toast.appendChild(progressBar);

      // Click to dismiss
      toast.addEventListener('click', () => {
        this.removeToast(toast);
      });

      this.toastContainer.appendChild(toast);
      this.activeToasts.push(toast);

      // Create particles
      setTimeout(() => {
        this.createParticles(toast, this.settings.particleCount);
      }, 50);

      // Auto-dismiss
      setTimeout(() => {
        this.removeToast(toast);
      }, toastTimeout);

      this.debugLog('SHOW_TOAST', 'Toast created and displayed', {
        toastType,
        timeout: toastTimeout,
        activeToasts: this.activeToasts.length,
        containerExists: !!this.toastContainer,
      });
    } catch (error) {
      this.debugError('SHOW_TOAST', error, {
        message: message?.substring(0, 100),
        type,
        timeout,
      });
      // Fallback to default toast
      if (BdApi && typeof BdApi.showToast === 'function') {
        BdApi.showToast(message, { type, timeout: timeout || this.settings.defaultTimeout });
        this.debugLog('SHOW_TOAST', 'Fallback toast shown');
      }
    }
  }

  removeToast(toast) {
    if (!toast || !toast.parentElement) {
      this.debugLog('REMOVE_TOAST', 'Toast already removed or invalid', {
        toastExists: !!toast,
        hasParent: !!toast?.parentElement,
      });
      return;
    }

    this.debugLog('REMOVE_TOAST', 'Removing toast', {
      activeToasts: this.activeToasts.length,
    });

    toast.style.animation = 'sl-toast-slide-out 0.3s ease-in forwards';

    // Add slide-out animation
    if (!document.getElementById('sl-toast-slide-out-animation')) {
      const style = document.createElement('style');
      style.id = 'sl-toast-slide-out-animation';
      style.textContent = `
        @keyframes sl-toast-slide-out {
          to {
            opacity: 0;
            transform: translateX(100%) scale(0.8);
          }
        }
      `;
      document.head.appendChild(style);
    }

    setTimeout(() => {
      toast.remove();
      const index = this.activeToasts.indexOf(toast);
      if (index > -1) {
        this.activeToasts.splice(index, 1);
      }
      this.debugLog('REMOVE_TOAST', 'Toast removed', {
        remainingToasts: this.activeToasts.length,
      });
    }, 300);
  }

  removeAllToasts() {
    this.activeToasts.forEach((toast) => {
      toast.remove();
    });
    this.activeToasts = [];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  hookIntoSoloLeveling() {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) {
        this.debugLog('SoloLevelingStats plugin not found, will retry...');
        setTimeout(() => this.hookIntoSoloLeveling(), 2000);
        return;
      }

      const instance = soloPlugin.instance || soloPlugin;
      if (!instance) {
        this.debugLog('SoloLevelingStats instance not found, will retry...');
        setTimeout(() => this.hookIntoSoloLeveling(), 2000);
        return;
      }

      // Patch showNotification method
      if (instance.showNotification) {
        this.patcher = BdApi.Patcher.after(
          'SoloLevelingToasts',
          instance,
          'showNotification',
          (_, args) => {
            const [message, type, timeout] = args;
            this.debugLog('HOOK_INTERCEPT', 'Intercepted showNotification call', {
              message: message?.substring(0, 100),
              type,
              timeout,
            });
            this.showToast(message, type, timeout);
          }
        );
        this.debugLog('HOOK_SUCCESS', 'Successfully hooked into SoloLevelingStats.showNotification', {
          hasPatcher: !!this.patcher,
        });
      } else {
        this.debugLog('HOOK_RETRY', 'showNotification method not found, will retry...', {
          hasInstance: !!instance,
          instanceKeys: instance ? Object.keys(instance).slice(0, 10) : [],
        });
        setTimeout(() => this.hookIntoSoloLeveling(), 2000);
      }
    } catch (error) {
      this.debugError('Failed to hook into SoloLevelingStats', error);
      setTimeout(() => this.hookIntoSoloLeveling(), 2000);
    }
  }

  unhookIntoSoloLeveling() {
    if (this.patcher) {
      BdApi.Patcher.unpatchAll('SoloLevelingToasts');
      this.patcher = null;
      this.debugLog('Unhooked from SoloLevelingStats');
    }
  }

  debugLog(operation, message, data = null) {
    if (typeof message === 'object' && data === null) {
      data = message;
      message = operation;
      operation = 'GENERAL';
    }
    const logMessage = data !== null && data !== undefined ? `${message}` : message;
    const logData = data !== null && data !== undefined ? data : '';
    console.log(`[SoloLevelingToasts] ${operation}:`, logMessage, logData);
  }

  debugError(operation, error, data = null) {
    console.error(`[SoloLevelingToasts] ERROR [${operation}]:`, error, data || '');
  }
};
