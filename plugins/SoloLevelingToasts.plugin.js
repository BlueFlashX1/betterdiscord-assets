/**
 * @name SoloLevelingToasts
 * @author BlueFlashX1
 * @description Custom toast notifications for Solo Leveling Stats with purple gradient, glow, and particle effects
 * @version 1.0.3
 */

module.exports = class SoloLevelingToasts {
  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================
  constructor() {
    this.defaultSettings = {
      enabled: true,
      showParticles: true,
      particleCount: 20,
      animationDuration: 200, // Faster slide-in animation (reduced from 500ms)
      defaultTimeout: 4000, // 4 seconds (middle of 3-5 range)
      position: 'top-right', // top-right, top-left, bottom-right, bottom-left
      maxToasts: 5, // Maximum number of toasts visible at once
    };

    this.settings = this.defaultSettings;
    this.toastContainer = null;
    this.activeToasts = [];
    this.patcher = null;
    this.lastToastTime = 0;
    this.toastCooldown = 50; // Reduced from 300ms to 50ms for faster response
    this.pendingToasts = new Map(); // Debounce similar toasts
    this.messageGroups = new Map(); // Group similar messages with counts
    this.groupWindow = 1000; // Reduced from 2000ms to 1000ms for faster grouping
    this.debugMode = false; // Set to true only for debugging

    // Pre-created DOM elements for faster rendering
    this.toastTemplate = null;
    this.particleTemplate = null;
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================
  /**
   * Initialize plugin on start
   * Operations:
   * 1. Load saved settings from storage
   * 2. Inject CSS styles for toast notifications
   * 3. Create toast container element
   * 4. Hook into SoloLevelingStats plugin for notifications
   */
  start() {
    this.loadSettings();
    this.injectCSS();
    this.createToastContainer();
    this.hookIntoSoloLeveling();
    this.debugLog('Plugin started');
  }

  /**
   * Cleanup plugin on stop
   * Operations:
   * 1. Unhook from SoloLevelingStats plugin
   * 2. Remove all active toasts from DOM
   * 3. Remove toast container element
   * 4. Remove injected CSS styles
   * 5. Clear pending toast timeouts
   */
  stop() {
    this.unhookIntoSoloLeveling();
    this.removeAllToasts();
    this.removeToastContainer();
    this.removeCSS();
    // Clear pending toasts
    this.pendingToasts.forEach((timeoutId) => clearTimeout(timeoutId));
    this.pendingToasts.clear();
    // Clear message groups
    this.messageGroups.forEach((group) => {
      // Handle sentinel timeoutId (true = RAF pending, don't clear)
      if (group.timeoutId && group.timeoutId !== true) {
        clearTimeout(group.timeoutId);
      }
    });
    this.messageGroups.clear();
    this.debugLog('Plugin stopped');
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================
  /**
   * Load settings from BetterDiscord storage
   * Operations:
   * 1. Attempt to load saved settings
   * 2. Merge with default settings if found
   * 3. Fall back to defaults on error
   */
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

  /**
   * Save current settings to BetterDiscord storage
   * Operations:
   * 1. Serialize settings object
   * 2. Save to persistent storage
   * 3. Handle save errors gracefully
   */
  saveSettings() {
    try {
      BdApi.Data.save('SoloLevelingToasts', 'settings', this.settings);
      this.debugLog('Settings saved');
    } catch (error) {
      this.debugError('Failed to save settings', error);
    }
  }

  /**
   * Generate settings panel UI for BetterDiscord settings
   * Operations:
   * 1. Create DOM structure for settings panel
   * 2. Bind event listeners to settings controls
   * 3. Return panel element for BetterDiscord to display
   */
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
          <input type="checkbox" ${
            this.settings.showParticles ? 'checked' : ''
          } id="toast-particles">
          <span style="margin-left: 10px;">Show Particle Effects</span>
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Particle Count:</span>
          <input type="number" id="toast-particle-count" value="${
            this.settings.particleCount
          }" min="5" max="50" step="5" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Default Timeout (ms):</span>
          <input type="number" id="toast-timeout" value="${
            this.settings.defaultTimeout
          }" min="3000" max="5000" step="500" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Position:</span>
          <select id="toast-position" style="width: 100%; padding: 5px;">
            <option value="top-right" ${
              this.settings.position === 'top-right' ? 'selected' : ''
            }>Top Right</option>
            <option value="top-left" ${
              this.settings.position === 'top-left' ? 'selected' : ''
            }>Top Left</option>
            <option value="bottom-right" ${
              this.settings.position === 'bottom-right' ? 'selected' : ''
            }>Bottom Right</option>
            <option value="bottom-left" ${
              this.settings.position === 'bottom-left' ? 'selected' : ''
            }>Bottom Left</option>
          </select>
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Max Toasts:</span>
          <input type="number" id="toast-max" value="${
            this.settings.maxToasts
          }" min="1" max="10" step="1" style="width: 100%; padding: 5px;">
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

  // ============================================================================
  // CSS MANAGEMENT
  // ============================================================================
  /**
   * Inject CSS styles for toast notifications
   * Operations:
   * 1. Check if styles already injected (prevent duplicates)
   * 2. Create style element with toast animations
   * 3. Define styles for container, toast, particles, progress bar
   * 4. Append to document head
   */
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
        min-width: 280px;
        max-width: 360px;
        padding: 14px 18px;
        background: rgba(10, 10, 15, 0.95);
        border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4),
                    0 0 40px rgba(139, 92, 246, 0.2);
        pointer-events: auto;
        cursor: pointer;
        overflow: hidden;
        animation: sl-toast-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        will-change: transform, opacity;
        transform: translateZ(0); /* Force GPU acceleration */
        backface-visibility: hidden; /* Optimize rendering */
      }

      @keyframes sl-toast-slide-in {
        0% {
          opacity: 0;
          transform: translateX(100%) scale(0.9);
        }
        50% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }

      .sl-toast-container.top-left .sl-toast {
        animation-name: sl-toast-slide-in-left;
      }

      @keyframes sl-toast-slide-in-left {
        0% {
          opacity: 0;
          transform: translateX(-100%) scale(0.9);
        }
        50% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }

      .sl-toast-container.bottom-right .sl-toast,
      .sl-toast-container.bottom-left .sl-toast {
        animation-name: sl-toast-slide-in-bottom;
      }

      @keyframes sl-toast-slide-in-bottom {
        0% {
          opacity: 0;
          transform: translateY(100%) scale(0.9);
        }
        50% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
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
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 6px;
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 30%, #6d28d9 60%, #000000 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-shadow: 0 0 3px rgba(139, 92, 246, 0.5),
                     0 0 6px rgba(124, 58, 237, 0.4),
                     0 0 9px rgba(109, 40, 217, 0.3);
        text-transform: uppercase;
        letter-spacing: 1px;
        line-height: 1.3;
      }

      .sl-toast-message {
        color: rgba(255, 255, 255, 0.9);
        font-size: 13px;
        line-height: 1.4;
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

      @keyframes sl-toast-fade-out {
        from {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateX(0) scale(0.9);
        }
      }

      .sl-toast.fading-out {
        animation: sl-toast-fade-out 0.5s cubic-bezier(0.4, 0, 1, 1) forwards !important;
        pointer-events: none;
      }

      /* Improved toast ordering with staggered fade */
      .sl-toast-container .sl-toast {
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
      }

      .sl-toast-container.top-right .sl-toast.fading-out,
      .sl-toast-container.bottom-right .sl-toast.fading-out {
        transform: translateX(100%) scale(0.9);
        margin-bottom: 0 !important;
        height: 0 !important;
        padding: 0 !important;
        overflow: hidden;
      }

      .sl-toast-container.top-left .sl-toast.fading-out,
      .sl-toast-container.bottom-left .sl-toast.fading-out {
        transform: translateX(-100%) scale(0.9);
        margin-bottom: 0 !important;
        height: 0 !important;
        padding: 0 !important;
        overflow: hidden;
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

  // ============================================================================
  // TOAST CONTAINER MANAGEMENT
  // ============================================================================
  /**
   * Create toast container element for displaying notifications
   * Operations:
   * 1. Check if container already exists
   * 2. Create container div with position class
   * 3. Append to document body
   * 4. Store reference for future use
   */
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

  /**
   * Remove toast container from DOM
   * Operations:
   * 1. Remove container element
   * 2. Clear container reference
   */
  removeToastContainer() {
    if (this.toastContainer) {
      this.toastContainer.remove();
      this.toastContainer = null;
    }
  }

  /**
   * Update container position class when settings change
   * Operations:
   * 1. Update className with new position
   * 2. CSS handles repositioning automatically
   */
  updateContainerPosition() {
    if (this.toastContainer) {
      this.toastContainer.className = `sl-toast-container ${this.settings.position}`;
    }
  }

  // ============================================================================
  // MESSAGE FORMATTING & PROCESSING
  // ============================================================================
  /**
   * Format numbers in messages for display
   * Operations:
   * 1. Format large numbers (4+ digits) with toLocaleString (e.g., 1234 → 1,234)
   * 2. Format percentages with toFixed(1) for consistent display
   * 3. Format stat changes (e.g., "10 → 15") with proper number formatting
   * 4. Return formatted message string
   */
  formatNumbersInMessage(message) {
    if (!message || typeof message !== 'string') return message;

    // Format large numbers (XP, stat points, etc.) - match patterns like "1234" or "+1234"
    message = message.replace(/([+\-]?)(\d{4,})/g, (match, sign, num) => {
      const number = parseInt(num, 10);
      if (!isNaN(number)) {
        return sign + number.toLocaleString();
      }
      return match;
    });

    // Format percentages - ensure consistent decimal places
    message = message.replace(/(\d+\.\d+)\s*%/g, (match, num) => {
      const number = parseFloat(num);
      if (!isNaN(number)) {
        // Round to 1 decimal place for percentages
        return `${number.toFixed(1)}%`;
      }
      return match;
    });

    // Format stat changes like "10 → 15" to be more compact
    message = message.replace(/(\d+)\s*→\s*(\d+)/g, (match, oldVal, newVal) => {
      const oldNum = parseInt(oldVal, 10);
      const newNum = parseInt(newVal, 10);
      if (!isNaN(oldNum) && !isNaN(newNum)) {
        return `${oldNum.toLocaleString()} → ${newNum.toLocaleString()}`;
      }
      return match;
    });

    return message;
  }

  /**
   * Summarize and condense notification messages for brief display
   * Operations:
   * 1. Remove excessive emojis (keep max 1-2)
   * 2. Condense common patterns (LEVEL UP, Quest Complete, etc.)
   * 3. Shorten stat names and level notation
   * 4. Remove redundant whitespace
   * 5. Truncate messages over 120 characters
   * 6. Return summarized message
   */
  summarizeMessage(message) {
    if (!message || typeof message !== 'string') return message;

    // Remove excessive emojis (keep max 1-2) - emojis already removed
    let summarized = message;

    // Condense common patterns
    summarized = summarized
      // Level up messages
      .replace(/LEVEL UP!?\s*/gi, '')
      .replace(/Level\s*(\d+)\s*→\s*(\d+)/gi, 'Lv.$1→$2')
      // Stat changes
      .replace(/(Strength|Agility|Intelligence|Vitality|Perception|Luck):\s*/gi, '$1: ')
      .replace(/\+\s*(\d+)\s*([A-Z]+)\s*\(/gi, '+$1 $2 (')
      // Quest completion
      .replace(/QUEST COMPLETE!?\s*/gi, 'Quest: ')
      .replace(/\[QUEST COMPLETE\]\s*/gi, '')
      // Achievement
      .replace(/ACHIEVEMENT UNLOCKED!?\s*/gi, 'Achievement: ')
      .replace(/\s*Retroactive Natural Growth Applied!?\s*/gi, 'Retro Growth')
      .replace(/\s*Natural Growth!?\s*/gi, 'Natural Growth')
      // Rank promotion
      .replace(/Rank Promotion!?\s*/gi, 'Rank: ')
      .replace(/([A-Z])\s*→\s*([A-Z])/g, '$1→$2')
      // Remove redundant text
      .replace(/\n{2,}/g, '\n')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Limit message length - truncate if too long
    if (summarized.length > 120) {
      summarized = summarized.substring(0, 117) + '...';
    }

    return summarized;
  }

  /**
   * Detect toast type based on message content and type parameter
   * Operations:
   * 1. Convert message to lowercase for matching
   * 2. Check for level-up keywords
   * 3. Check for achievement keywords
   * 4. Check for quest keywords
   * 5. Check for error type
   * 6. Return appropriate CSS class name
   */
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

  // ============================================================================
  // PARTICLE EFFECTS
  // ============================================================================
  /**
   * Create particle effects around toast notification
   * Operations:
   * 1. Get toast element bounding rect for center position
   * 2. Generate particles in circular pattern
   * 3. Calculate random direction and distance for each particle
   * 4. Apply CSS custom properties for animation
   * 5. Append particles to document body
   * 6. Auto-remove particles after animation duration
   */
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

  // ============================================================================
  // MESSAGE GROUPING & SPAM HANDLING
  // ============================================================================
  /**
   * Generate a grouping key for similar messages
   * Operations:
   * 1. Extract message text (handle objects)
   * 2. Normalize message (remove numbers, emojis, whitespace)
   * 3. Create key from normalized message + type
   * 4. Return key for grouping
   */
  getMessageGroupKey(message, type) {
    let messageText = message;
    if (message && typeof message === 'object' && message.message) {
      messageText = message.message;
    } else if (message && typeof message === 'object' && message.text) {
      messageText = message.text;
    }
    if (typeof messageText !== 'string') {
      messageText = String(messageText);
    }

    // Normalize: remove numbers, extra whitespace (emojis already removed)
    const normalized = messageText
      .replace(/\d+/g, 'N')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .substring(0, 100);

    return `${normalized}_${type}`;
  }

  /**
   * Combine multiple similar messages into one notification
   * Operations:
   * 1. Extract key information from messages
   * 2. Count occurrences
   * 3. Combine numbers/values if applicable
   * 4. Create summary message
   */
  combineMessages(messages) {
    if (messages.length === 1) {
      return messages[0].message;
    }

    const firstMsg = messages[0].message;
    const count = messages.length;

    // Try to extract and combine numbers
    const numbers = [];
    messages.forEach((msg) => {
      const matches = msg.message.match(/(\+?\d+(?:,\d{3})*(?:\.\d+)?)/g);
      if (matches) {
        numbers.push(...matches.map((m) => m.replace(/,/g, '')));
      }
    });

    // Detect message type and format accordingly
    const msgLower = firstMsg.toLowerCase();

    if (msgLower.includes('quest') || msgLower.includes('complete')) {
      const totalXP = numbers
        .filter((n) => !isNaN(parseInt(n)))
        .reduce((sum, n) => sum + parseInt(n), 0);
      return `Quest Complete x${count}${totalXP > 0 ? `\n+${totalXP.toLocaleString()} XP` : ''}`;
    }

    if (msgLower.includes('achievement') || msgLower.includes('unlocked')) {
      return `Achievements Unlocked x${count}`;
    }

    if (
      msgLower.includes('stat') ||
      msgLower.includes('strength') ||
      msgLower.includes('agility') ||
      msgLower.includes('intelligence') ||
      msgLower.includes('vitality') ||
      msgLower.includes('perception')
    ) {
      const statMatches = firstMsg.match(/(\w+):\s*(\d+)\s*→\s*(\d+)/i);
      if (statMatches) {
        const statName = statMatches[1];
        const finalValue = statMatches[3];
        return `${statName}: +${count} → ${finalValue}`;
      }
      return `Stat Increases x${count}`;
    }

    if (msgLower.includes('xp') || msgLower.includes('experience')) {
      const totalXP = numbers
        .filter((n) => !isNaN(parseInt(n)))
        .reduce((sum, n) => sum + parseInt(n), 0);
      if (totalXP > 0) {
        return `XP Gained x${count}\n+${totalXP.toLocaleString()} XP`;
      }
      return `XP Events x${count}`;
    }

    if (msgLower.includes('level')) {
      const levelMatches = firstMsg.match(/Lv\.?(\d+)/i);
      if (levelMatches) {
        return `Level Up x${count}\nLv.${levelMatches[1]}`;
      }
      return `Level Events x${count}`;
    }

    // Generic grouping
    return `${firstMsg.substring(0, 50)}... x${count}`;
  }

  // ============================================================================
  // TOAST DISPLAY
  // ============================================================================
  /**
   * Show toast notification with cooldown, debouncing, and message grouping
   * Operations:
   * 1. Generate grouping key for message
   * 2. Check if similar message exists in grouping window
   * 3. Add to group or create new group
   * 4. Schedule grouped message display
   * 5. Handle cooldown for rapid messages
   */
  showToast(message, type = 'info', timeout = null) {
    const groupKey = this.getMessageGroupKey(message, type);
    const now = Date.now();

    // Check if we have an existing group for this message
    if (this.messageGroups.has(groupKey)) {
      const group = this.messageGroups.get(groupKey);

      // Add to existing group
      group.messages.push({
        message:
          typeof message === 'string'
            ? message
            : message.message || message.text || String(message),
        timestamp: now,
      });
      group.count++;
      group.lastSeen = now;

      // Reset timeout - wait for more messages (reduced window)
      // Handle sentinel timeoutId (true = RAF pending, don't clear)
      if (group.timeoutId && group.timeoutId !== true) {
        clearTimeout(group.timeoutId);
      }

      // Update existing toast if visible (immediate update)
      const existingToast = this.findToastByKey(groupKey);
      if (existingToast) {
        this.updateToastCount(existingToast, group.count);
        // Reset fade-out timer
        this.resetToastFadeOut(existingToast, timeout || this.settings.defaultTimeout);
        // Don't schedule new toast - we're updating existing one
        return;
      }

      // If RAF is pending (sentinel timeoutId), don't schedule another timeout
      // The RAF callback will handle showing the toast
      if (group.timeoutId === true) {
        return;
      }

      // Faster grouping window - show after 200ms instead of full window
      const fastGroupDelay = Math.min(200, this.groupWindow);
      group.timeoutId = setTimeout(() => {
        // Check if RAF already showed this group before showing via timeout
        if (group.shown === true) {
          this.messageGroups.delete(groupKey);
          return;
        }
        group.shown = true;
        this.messageGroups.delete(groupKey);
        const combinedMessage = this.combineMessages(group.messages);
        this._showToastInternal(combinedMessage, type, timeout);
      }, fastGroupDelay);

      return;
    }

    // Create new group
    const group = {
      messages: [
        {
          message:
            typeof message === 'string'
              ? message
              : message.message || message.text || String(message),
          timestamp: now,
        },
      ],
      count: 1,
      lastSeen: now,
      timeoutId: null,
      shown: false,
    };

    // Set group immediately so subsequent messages can join
    this.messageGroups.set(groupKey, group);

    // Mark RAF as pending with sentinel timeoutId so subsequent messages know not to schedule timeout
    group.timeoutId = true;

    // Show immediately for new messages (no grouping delay for first message)
    // Use requestAnimationFrame for instant, smooth display
    requestAnimationFrame(() => {
      const currentGroup = this.messageGroups.get(groupKey);
      if (currentGroup && !currentGroup.shown) {
        currentGroup.shown = true;
        // Clear sentinel timeoutId since RAF is executing
        currentGroup.timeoutId = null;
        const combinedMessage = this.combineMessages(currentGroup.messages);
        this._showToastInternal(combinedMessage, type, timeout);

        // Schedule deletion after group window to allow combining
        setTimeout(() => {
          if (this.messageGroups.get(groupKey) === currentGroup) {
            this.messageGroups.delete(groupKey);
          }
        }, this.groupWindow);
      } else if (currentGroup) {
        // RAF executed but group was already shown, clear sentinel
        currentGroup.timeoutId = null;
      }
    });
  }

  /**
   * Find existing toast by grouping key
   * Operations:
   * 1. Check active toasts for matching content
   * 2. Return toast element if found
   */
  findToastByKey(groupKey) {
    // Extract normalized message from key
    const normalized = groupKey.split('_')[0];
    for (const toast of this.activeToasts) {
      const toastText = toast.textContent
        .toLowerCase()
        .replace(/\d+/g, 'N')
        .replace(/\s+/g, ' ')
        .trim();
      if (toastText.includes(normalized.substring(0, 30))) {
        return toast;
      }
    }
    return null;
  }

  /**
   * Update toast with new count
   * Operations:
   * 1. Find count indicator in toast
   * 2. Update count display
   * 3. Refresh toast appearance
   */
  updateToastCount(toast, count) {
    if (!toast) return;

    const titleEl = toast.querySelector('.sl-toast-title');
    const messageEl = toast.querySelector('.sl-toast-message');

    if (titleEl) {
      // Update title to show count
      let titleText = titleEl.textContent;
      const countMatch = titleText.match(/x(\d+)/);
      if (countMatch) {
        titleText = titleText.replace(/x\d+/, `x${count}`);
      } else {
        titleText = `${titleText} x${count}`;
      }
      titleEl.textContent = titleText;
    }

    // Reset fade-out animation
    toast.classList.remove('fading-out');
    toast.style.animation = '';
  }

  /**
   * Reset toast fade-out timer
   * Operations:
   * 1. Remove fading-out class
   * 2. Clear existing fade-out timeout
   * 3. Schedule new fade-out
   */
  resetToastFadeOut(toast, timeout) {
    if (!toast) return;

    // Remove fade-out class and reset animation
    toast.classList.remove('fading-out');
    toast.style.animation = '';
    toast.style.pointerEvents = '';

    // Clear any existing fade-out timeout (stored in data attribute)
    const existingTimeout = toast.dataset.fadeTimeout;
    if (existingTimeout) {
      clearTimeout(parseInt(existingTimeout));
    }

    // Schedule new fade-out
    // Start fade 500ms before timeout ends (to match animation duration)
    const fadeAnimationDuration = 500; // Match CSS animation duration
    const fadeOutDelay = Math.max(0, timeout - fadeAnimationDuration);
    const timeoutId = setTimeout(() => {
      this.startFadeOut(toast);
      // Remove after animation completes (500ms)
      setTimeout(() => {
        this.removeToast(toast, false); // Don't use fast removal, let animation complete
      }, fadeAnimationDuration);
    }, fadeOutDelay);

    toast.dataset.fadeTimeout = timeoutId.toString();
  }

  /**
   * Internal method to create and display toast notification
   * Operations:
   * 1. Check if plugin is enabled
   * 2. Limit number of visible toasts (remove oldest if needed)
   * 3. Detect toast type for styling
   * 4. Format numbers and summarize message
   * 5. Create toast DOM element with title and message
   * 6. Add progress bar animation
   * 7. Add click handler for dismissal
   * 8. Create particle effects
   * 9. Schedule auto-dismiss after timeout
   */
  _showToastInternal(message, type = 'info', timeout = null) {
    this.lastToastTime = Date.now();

    this.debugLog('SHOW_TOAST', 'Toast request received', {
      message: message?.substring(0, 100),
      type,
      timeout,
      enabled: this.settings.enabled,
      activeToasts: this.activeToasts.length,
    });

    if (!this.settings.enabled) {
      this.debugLog('SHOW_TOAST', 'Plugin disabled, using fallback toast');
      if (BdApi && typeof BdApi.showToast === 'function') {
        BdApi.showToast(message, { type, timeout: timeout || this.settings.defaultTimeout });
      }
      return;
    }

    try {
      // Limit number of toasts
      if (this.activeToasts.length >= this.settings.maxToasts) {
        const oldestToast = this.activeToasts.shift();
        if (oldestToast && oldestToast.parentElement) {
          oldestToast.remove();
          const index = this.activeToasts.indexOf(oldestToast);
          if (index > -1) {
            this.activeToasts.splice(index, 1);
          }
        }
      }

      const toastType = this.detectToastType(message, type);
      const toastTimeout = timeout || this.settings.defaultTimeout;

      // Process message: format numbers and summarize
      let processedMessage = message;
      if (typeof processedMessage === 'string') {
        processedMessage = this.formatNumbersInMessage(processedMessage);
        processedMessage = this.summarizeMessage(processedMessage);
      }

      // Create toast element (optimized DOM creation)
      const toast = document.createElement('div');
      toast.className = `sl-toast ${toastType}`;
      toast.style.setProperty('--sl-toast-timeout', `${toastTimeout}ms`);

      // Extract title and message
      const lines = processedMessage.split('\n');
      const title = lines[0] || 'Notification';
      const body = lines.slice(1).join('\n') || '';

      // Use textContent for title (faster than innerHTML for text-only)
      const titleEl = document.createElement('div');
      titleEl.className = 'sl-toast-title';
      titleEl.textContent = title;
      toast.appendChild(titleEl);

      // Add body if exists
      if (body) {
        const bodyEl = document.createElement('div');
        bodyEl.className = 'sl-toast-message';
        bodyEl.textContent = body;
        toast.appendChild(bodyEl);
      }

      // Add progress bar animation
      const progressBar = document.createElement('div');
      progressBar.style.position = 'absolute';
      progressBar.style.top = '0';
      progressBar.style.left = '0';
      progressBar.style.right = '0';
      progressBar.style.height = '2px';
      progressBar.style.background =
        'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.8), transparent)';
      progressBar.style.animation = `sl-toast-progress ${toastTimeout}ms linear forwards`;
      toast.appendChild(progressBar);

      // Click to dismiss - start fade out immediately
      toast.addEventListener('click', () => {
        // Clear any existing fade-out timeout
        const existingTimeout = toast.dataset.fadeTimeout;
        if (existingTimeout) {
          clearTimeout(parseInt(existingTimeout));
          toast.dataset.fadeTimeout = '';
        }
        this.startFadeOut(toast);
        // Remove from DOM after fade animation completes (500ms)
        setTimeout(() => {
          this.removeToast(toast, false); // Don't use fast removal, let animation complete
        }, 500);
      });

      // Use requestAnimationFrame for instant, smooth DOM insertion
      requestAnimationFrame(() => {
        this.toastContainer.appendChild(toast);
        this.activeToasts.push(toast);

        // Create particles immediately (reduced delay for faster effect)
        requestAnimationFrame(() => {
          this.createParticles(toast, this.settings.particleCount);
        });
      });

      // Auto-dismiss - start fade out before timeout ends
      const fadeAnimationDuration = 500; // Match CSS animation duration
      const fadeOutDelay = Math.max(0, toastTimeout - fadeAnimationDuration);
      const timeoutId = setTimeout(() => {
        this.startFadeOut(toast);
        // Remove from DOM after fade animation completes
        setTimeout(() => {
          this.removeToast(toast, false); // Don't use fast removal, let animation complete
        }, fadeAnimationDuration);
      }, fadeOutDelay);

      // Store timeout ID for potential reset
      toast.dataset.fadeTimeout = timeoutId.toString();

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

  /**
   * Start smooth fade-out animation for toast
   * Operations:
   * 1. Clear any existing animations
   * 2. Add fading-out class to trigger CSS animation
   * 3. Disable pointer events during fade
   */
  startFadeOut(toast) {
    if (!toast || !toast.parentElement) {
      return;
    }

    // Clear any existing fade-out timeout
    const existingTimeout = toast.dataset.fadeTimeout;
    if (existingTimeout) {
      clearTimeout(parseInt(existingTimeout));
      toast.dataset.fadeTimeout = '';
    }

    // Remove any existing animation styles to ensure clean start
    toast.style.animation = '';

    // Force reflow to ensure class change is applied
    void toast.offsetHeight;

    // Add fading-out class to trigger CSS animation
    toast.classList.add('fading-out');

    // Ensure pointer events are disabled
    toast.style.pointerEvents = 'none';

    this.debugLog('START_FADE_OUT', 'Fade out started', {
      activeToasts: this.activeToasts.length,
    });
  }

  /**
   * Remove toast notification from display
   * Operations:
   * 1. Validate toast element exists
   * 2. Fast removal (no animation) for performance if requested
   * 3. Remove from DOM
   * 4. Remove from active toasts array
   */
  removeToast(toast, fast = false) {
    if (!toast || !toast.parentElement) {
      this.debugLog('REMOVE_TOAST', 'Toast already removed or invalid', {
        toastExists: !!toast,
        hasParent: !!toast?.parentElement,
      });
      return;
    }

    this.debugLog('REMOVE_TOAST', 'Removing toast', {
      activeToasts: this.activeToasts.length,
      fast,
    });

    // Remove from DOM
    toast.remove();
    const index = this.activeToasts.indexOf(toast);
    if (index > -1) {
      this.activeToasts.splice(index, 1);
    }

    this.debugLog('REMOVE_TOAST', 'Toast removed', {
      remainingToasts: this.activeToasts.length,
    });
  }

  /**
   * Remove all active toasts immediately
   * Operations:
   * 1. Remove each toast from DOM
   * 2. Clear active toasts array
   */
  removeAllToasts() {
    this.activeToasts.forEach((toast) => {
      toast.remove();
    });
    this.activeToasts = [];
  }

  /**
   * Escape HTML to prevent XSS attacks
   * Operations:
   * 1. Create temporary div element
   * 2. Set text content (browser escapes HTML)
   * 3. Return innerHTML (safe HTML string)
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================================
  // SOLO LEVELING INTEGRATION
  // ============================================================================
  /**
   * Hook into SoloLevelingStats plugin to intercept notifications
   * Operations:
   * 1. Get SoloLevelingStats plugin instance
   * 2. Retry if plugin not loaded yet (with 2s delay)
   * 3. Patch showNotification method using BdApi.Patcher
   * 4. Extract message text from object if needed
   * 5. Filter out natural growth notifications (too frequent/spammy)
   * 6. Call showToast for filtered notifications
   * 7. Store patcher reference for cleanup
   */
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

            // Extract message text from object if needed
            let messageText = message;
            if (message && typeof message === 'object' && message.message) {
              messageText = message.message;
            } else if (message && typeof message === 'object' && message.text) {
              messageText = message.text;
            }

            // Filter out natural growth notifications
            if (messageText && typeof messageText === 'string') {
              const msgClean = messageText.replace(/\s+/g, ' ').trim();
              const msgLower = msgClean.toLowerCase();

              const hasNatural = msgLower.includes('natural');
              const hasGrowth = msgLower.includes('growth');

              const isNaturalGrowth =
                (hasNatural && hasGrowth) ||
                msgLower.includes('natural stat growth') ||
                msgLower.includes('retroactive natural growth') ||
                msgLower.includes('natural strength growth') ||
                msgLower.includes('natural agility growth') ||
                msgLower.includes('natural intelligence growth') ||
                msgLower.includes('natural vitality growth') ||
                msgLower.includes('natural luck growth');

              if (isNaturalGrowth) {
                this.debugLog('HOOK_INTERCEPT', 'Skipping natural growth notification', {
                  originalMessage: messageText?.substring(0, 100),
                });
                return;
              }
            }

            this.debugLog('HOOK_INTERCEPT', 'Intercepted showNotification call', {
              message: message?.substring(0, 100),
              type,
              timeout,
            });
            this.showToast(message, type, timeout);
          }
        );
        this.debugLog(
          'HOOK_SUCCESS',
          'Successfully hooked into SoloLevelingStats.showNotification',
          {
            hasPatcher: !!this.patcher,
          }
        );
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

  /**
   * Unhook from SoloLevelingStats plugin
   * Operations:
   * 1. Remove all patches created by this plugin
   * 2. Clear patcher reference
   */
  unhookIntoSoloLeveling() {
    if (this.patcher) {
      BdApi.Patcher.unpatchAll('SoloLevelingToasts');
      this.patcher = null;
      this.debugLog('Unhooked from SoloLevelingStats');
    }
  }

  // ============================================================================
  // DEBUG UTILITIES
  // ============================================================================
  /**
   * Log debug information to console (only if debug mode enabled)
   * Operations:
   * 1. Check if debug mode is enabled
   * 2. Normalize parameters (handle object messages)
   * 3. Format log message with plugin prefix
   * 4. Output to console
   */
  debugLog(operation, message, data = null) {
    if (!this.debugMode) return;

    if (typeof message === 'object' && data === null) {
      data = message;
      message = operation;
      operation = 'GENERAL';
    }
    const logMessage = data !== null && data !== undefined ? `${message}` : message;
    const logData = data !== null && data !== undefined ? data : '';
    console.log(`[SoloLevelingToasts] ${operation}:`, logMessage, logData);
  }

  /**
   * Log error information to console
   * Operations:
   * 1. Format error message with plugin prefix
   * 2. Output to console.error
   * 3. Include optional context data
   */
  debugError(operation, error, data = null) {
    console.error(`[SoloLevelingToasts] ERROR [${operation}]:`, error, data || '');
  }
};
