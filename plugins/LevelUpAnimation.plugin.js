/**
 * @name LevelUpAnimation
 * @author BlueFlashX1
 * @description Epic "LEVEL UP!" animation with particles when you level up
 * @version 1.1.0
 *
 * ============================================================================
 * FILE STRUCTURE & NAVIGATION
 * ============================================================================
 *
 * This file follows a 4-section structure for easy navigation:
 *
 * SECTION 1: IMPORTS & DEPENDENCIES (Line 55)
 * SECTION 2: CONFIGURATION & HELPERS (Line 59)
 *   2.1 Constructor & Settings
 *   2.2 Helper Functions (debug)
 * SECTION 3: MAJOR OPERATIONS (Line 90+)
 *   3.1 Plugin Lifecycle (start, stop)
 *   3.2 Settings Management (load, save, panel)
 *   3.3 CSS Management (inject, remove)
 *   3.4 Animation Display (show, position)
 *   3.5 Particle Effects (create)
 *   3.6 Plugin Integration (hook, unhook)
 * SECTION 4: DEBUGGING & DEVELOPMENT
 *
 * ============================================================================
 * VERSION HISTORY
 * ============================================================================
 *
 * @changelog v1.1.0 (2025-12-05) - FUNCTIONAL PROGRAMMING OPTIMIZATION
 * CRITICAL FIXES:
 * - Deep copy in constructor (prevents save corruption)
 * - Deep merge in loadSettings (prevents nested object sharing)
 *
 * FUNCTIONAL OPTIMIZATIONS:
 * - For-loop → Array.from() (particle creation)
 * - Event listeners → functional mapper (5 listeners → 1 forEach)
 * - debugLog → functional short-circuit (NO IF-ELSE!)
 *
 * NEW FEATURES:
 * - Debug mode toggle in settings panel
 * - Toggleable debug console logs
 * - 4-section structure for easy navigation
 *
 * RESULT:
 * - 2 critical bugs fixed
 * - 1 for-loop eliminated (100% reduction)
 * - Event listeners DRY
 * - Clean, maintainable code
 *
 * @changelog v1.0.1 (Previous)
 * - Initial release
 * - Integration with SoloLevelingStats
 */

module.exports = class LevelUpAnimation {
  // ============================================================================
  // SECTION 1: IMPORTS & DEPENDENCIES
  // ============================================================================
  // Reserved for future external library imports
  // Currently all functionality is self-contained

  // ============================================================================
  // SECTION 2: CONFIGURATION & HELPERS
  // ============================================================================

  /**
   * 2.1 CONSTRUCTOR & DEFAULT SETTINGS
   */
  constructor() {
    this.defaultSettings = {
      enabled: true,
      debugMode: false, // Toggle debug console logs
      animationDuration: 3000, // 3 seconds
      floatDistance: 150, // pixels to float up
      particleCount: 30,
      glowIntensity: 1.5,
      fontSize: 48,
    };

    // CRITICAL FIX: Deep copy to prevent defaultSettings corruption
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.animationContainer = null;
    this.activeAnimations = new Set();
    this.patcher = null;
  }

  /**
   * 2.2 HELPER FUNCTIONS
   */

  // Helper functions defined at end of file (debugLog, debugError)

  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================

  /**
   * 3.1 PLUGIN LIFECYCLE
   */
  /**
   * Initialize plugin on start
   * Operations:
   * 1. Load saved settings from storage
   * 2. Inject CSS styles for animations
   * 3. Hook into SoloLevelingStats plugin for level up events
   */
  start() {
    this.loadSettings();
    this.injectCSS();
    this.hookIntoSoloLeveling();
    this.debugLog('START', 'Plugin started');
  }

  /**
   * Cleanup plugin on stop
   * Operations:
   * 1. Unhook from SoloLevelingStats plugin
   * 2. Remove all active animations from DOM
   * 3. Remove injected CSS styles
   */
  stop() {
    this.unhookIntoSoloLeveling();
    this.removeAllAnimations();
    this.removeCSS();
    this.debugLog('STOP', 'Plugin stopped');
  }

  /**
   * 3.2 SETTINGS MANAGEMENT
   */
  /**
   * Load settings from BetterDiscord storage
   * Operations:
   * 1. Attempt to load saved settings
   * 2. Merge with default settings if found
   * 3. Fall back to defaults on error
   */
  loadSettings() {
    try {
      const saved = BdApi.Data.load('LevelUpAnimation', 'settings');
      if (saved) {
        // CRITICAL FIX: Deep merge to prevent nested object reference sharing
        const merged = { ...this.defaultSettings, ...saved };
        this.settings = JSON.parse(JSON.stringify(merged));
        this.debugLog('LOAD_SETTINGS', this.settings);
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
      BdApi.Data.save('LevelUpAnimation', 'settings', this.settings);
      this.debugLog('SAVE_SETTINGS', this.settings);
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
        <h3 style="color: #8b5cf6; margin-bottom: 10px;">Level Up Animation Settings</h3>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.enabled ? 'checked' : ''} id="lu-enabled">
          <span style="margin-left: 10px;">Enable Level Up Animation</span>
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Animation Duration (ms):</span>
          <input type="number" id="lu-duration" value="${
            this.settings.animationDuration
          }" min="1000" max="10000" step="500" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Float Distance (px):</span>
          <input type="number" id="lu-distance" value="${
            this.settings.floatDistance
          }" min="50" max="500" step="10" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Particle Count:</span>
          <input type="number" id="lu-particles" value="${
            this.settings.particleCount
          }" min="10" max="100" step="5" style="width: 100%; padding: 5px;">
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Font Size (px):</span>
          <input type="number" id="lu-fontsize" value="${
            this.settings.fontSize
          }" min="24" max="96" step="4" style="width: 100%; padding: 5px;">
        </label>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid rgba(139, 92, 246, 0.3);">
        <h4 style="color: #8b5cf6; margin-bottom: 10px;">Developer Options</h4>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.debugMode ? 'checked' : ''} id="lu-debug-mode">
          <span style="margin-left: 10px;">Debug Mode</span>
        </label>
        <p style="font-size: 12px; color: #888; margin-top: 5px;">
          Show detailed console logs for troubleshooting. Reload Discord after changing.
        </p>
      </div>
    `;

    // FUNCTIONAL: Event listener mapper (NO REPETITION!)
    const eventMap = {
      '#lu-enabled': {
        event: 'change',
        handler: (e) => {
          this.settings.enabled = e.target.checked;
          this.saveSettings();
        },
      },
      '#lu-duration': {
        event: 'change',
        handler: (e) => {
          this.settings.animationDuration = parseInt(e.target.value);
          this.saveSettings();
        },
      },
      '#lu-distance': {
        event: 'change',
        handler: (e) => {
          this.settings.floatDistance = parseInt(e.target.value);
          this.saveSettings();
        },
      },
      '#lu-particles': {
        event: 'change',
        handler: (e) => {
          this.settings.particleCount = parseInt(e.target.value);
          this.saveSettings();
        },
      },
      '#lu-fontsize': {
        event: 'change',
        handler: (e) => {
          this.settings.fontSize = parseInt(e.target.value);
          this.saveSettings();
        },
      },
      '#lu-debug-mode': {
        event: 'change',
        handler: (e) => {
          this.settings.debugMode = e.target.checked;
          this.saveSettings();
          console.log('[SETTINGS] Debug mode:', e.target.checked ? 'ENABLED' : 'DISABLED');
        },
      },
    };

    // Attach all event listeners functionally
    Object.entries(eventMap).forEach(([selector, { event, handler }]) => {
      panel.querySelector(selector)?.addEventListener(event, handler);
    });

    return panel;
  }

  /**
   * 3.3 CSS MANAGEMENT
   */
  /**
   * Inject CSS styles for level up animations
   * Operations:
   * 1. Check if styles already injected (prevent duplicates)
   * 2. Create style element with animation keyframes
   * 3. Append to document head
   * 4. Define animations: float-up, glow-pulse, particle-fade
   */
  injectCSS() {
    const styleId = 'level-up-animation-css';
    const cssContent = `
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
        animation: lu-float-up var(--lu-duration, 3s) ease-out forwards,
                   lu-glow-pulse 0.5s ease-in-out infinite;
        background: linear-gradient(135deg, #8b5cf6 0%, #8b5cf6 50%, #ffffff 50%, #ffffff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-shadow: 0 0 20px rgba(139, 92, 246, 0.8),
                     0 0 40px rgba(255, 255, 255, 0.6);
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

    // Use BdApi.DOM for persistent CSS injection (v1.8.0+)
    try {
      BdApi.DOM.addStyle(styleId, cssContent);
      this.debugLog('INIT', 'CSS injected via BdApi.DOM');
    } catch (error) {
      // Fallback to manual injection
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = cssContent;
      document.head.appendChild(style);
      this.debugLog('INIT', 'CSS injected via manual method');
    }
  }

  removeCSS() {
    const styleId = 'level-up-animation-css';
    try {
      BdApi.DOM.removeStyle(styleId);
    } catch (error) {
      // Fallback to manual removal
      const style = document.getElementById(styleId);
      if (style) style.remove();
    }
  }

  /**
   * 3.4 ANIMATION CONTAINER MANAGEMENT
   */
  /**
   * Get or create the animation container element
   * Operations:
   * 1. Check if container already exists
   * 2. Create new container div if needed
   * 3. Append to document body
   * 4. Return container reference
   */
  getAnimationContainer() {
    if (!this.animationContainer) {
      this.animationContainer = document.createElement('div');
      this.animationContainer.className = 'lu-animation-container';
      document.body.appendChild(this.animationContainer);
      this.debugLog('INIT', 'Animation container created');
    }
    return this.animationContainer;
  }

  /**
   * Remove all animations and cleanup container
   * Operations:
   * 1. Remove container element from DOM
   * 2. Clear container reference
   * 3. Clear active animations tracking set
   */
  removeAllAnimations() {
    if (this.animationContainer) {
      this.animationContainer.remove();
      this.animationContainer = null;
    }
    this.activeAnimations.clear();
  }

  /**
   * 3.5 POSITION CALCULATION
   */
  /**
   * Calculate optimal position for level up animation
   * Operations:
   * 1. Search for Discord chat elements (input, messages, container)
   * 2. Calculate center position of found element
   * 3. Fall back to screen center if no element found
   * 4. Return x, y coordinates for animation placement
   */
  getMessageAreaPosition() {
    // Try to find the message input area or chat container
    const chatInput = document.querySelector('[class*="channelTextArea"]');
    const messageList = document.querySelector('[class*="messagesWrapper"]');
    const chatContainer = document.querySelector('[class*="chat"]');

    const targetElement = chatInput || messageList || chatContainer;

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

  /**
   * 3.6 PARTICLE EFFECTS
   */
  /**
   * Create particle effects around animation center
   * Operations:
   * 1. Get animation container reference
   * 2. Generate particles in circular pattern around center
   * 3. Calculate random direction and distance for each particle
   * 4. Apply CSS custom properties for animation
   * 5. Append particles to container
   * 6. Return array of particle elements for cleanup
   */
  createParticles(startX, startY, count) {
    const container = this.getAnimationContainer();

    // FUNCTIONAL: Create particles using Array.from (NO FOR-LOOP!)
    return Array.from({ length: count }, (_, i) => {
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
      return particle;
    });
  }

  /**
   * 3.7 ANIMATION DISPLAY
   */
  /**
   * Display level up animation with text and particles
   * Operations:
   * 1. Check if animation is enabled
   * 2. Calculate optimal display position
   * 3. Create "LEVEL UP!" text element with styling
   * 4. Position text at calculated coordinates
   * 5. Create particle effects around text
   * 6. Track animation for cleanup
   * 7. Schedule automatic cleanup after duration
   * 8. Remove container if no animations remain
   */
  showLevelUpAnimation(newLevel, oldLevel) {
    if (!this.settings.enabled) {
      this.debugLog('ANIMATION', 'Animation disabled, skipping');
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

      this.debugLog('ANIMATION', {
        newLevel,
        oldLevel,
        position,
        animationId,
      });
    } catch (error) {
      this.debugError('Failed to show level up animation', error);
    }
  }

  /**
   * 3.8 PLUGIN INTEGRATION
   */
  /**
   * Hook into SoloLevelingStats plugin to intercept level up events
   * Operations:
   * 1. Get SoloLevelingStats plugin instance
   * 2. Retry if plugin not loaded yet (with 2s delay)
   * 3. Patch showLevelUpNotification method using BdApi.Patcher
   * 4. Call showLevelUpAnimation when level up occurs
   * 5. Store patcher reference for cleanup
   */
  hookIntoSoloLeveling() {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) {
        this.debugLog('HOOK', 'SoloLevelingStats plugin not found, will retry...');
        setTimeout(() => this.hookIntoSoloLeveling(), 2000);
        return;
      }

      const instance = soloPlugin.instance || soloPlugin;
      if (!instance) {
        this.debugLog('HOOK', 'SoloLevelingStats instance not found, will retry...');
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
        this.debugLog('HOOK', 'Hooked into SoloLevelingStats.showLevelUpNotification');
      } else {
        this.debugLog('HOOK', 'showLevelUpNotification method not found, will retry...');
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
      BdApi.Patcher.unpatchAll('LevelUpAnimation');
      this.patcher = null;
      this.debugLog('HOOK', 'Unhooked from SoloLevelingStats');
    }
  }

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT
  // ============================================================================
  /**
   * Log debug information to console
   * Operations:
   * 1. Normalize parameters (handle object messages)
   * 2. Format log message with plugin prefix
   * 3. Output to console
   */
  // FUNCTIONAL DEBUG CONSOLE (NO IF-ELSE!)
  // Only logs if debugMode is enabled, using short-circuit evaluation
  debugLog(operation, message, data = null) {
    const formatMessage = () => {
      const msg = typeof message === 'object' && data === null ? operation : message;
      const op = typeof message === 'object' && data === null ? 'GENERAL' : operation;
      const logData = typeof message === 'object' && data === null ? message : data;
      return { op, msg, logData };
    };

    const log = () => {
      const { op, msg, logData } = formatMessage();
      console.log(`[LevelUpAnimation] ${op}:`, msg, logData || '');
    };

    return this.settings.debugMode && log();
  }

  /**
   * Log error information to console
   * Operations:
   * 1. Format error message with plugin prefix
   * 2. Output to console.error
   * 3. Include optional context data
   */
  debugError(operation, error, data = null) {
    console.error(`[LevelUpAnimation] ERROR [${operation}]:`, error, data || '');
  }
};
