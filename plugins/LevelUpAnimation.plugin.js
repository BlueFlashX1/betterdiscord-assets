/**
 * @name LevelUpAnimation
 * @author BlueFlashX1
 * @description Epic "LEVEL UP!" animation with particles when you level up
 * @version 1.2.0
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 * @tested Discord Desktop Stable (as of 2025-12-08). If Discord updates
 *         change the React render key currently patched below (`Z`), update
 *         the target method in tryReactInjection to match the new property.
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
 *   3.6 Plugin Integration (hook, unhook)
 * SECTION 4: DEBUGGING & DEVELOPMENT
 *
 * ============================================================================
 * VERSION HISTORY
 * ============================================================================
 *
 * @changelog v1.2.0 (2025-12-06) - ADVANCED BETTERDISCORD INTEGRATION
 * ADVANCED FEATURES:
 * - Added Webpack module access (UserStore, ChannelStore) for better Discord integration
 * - Implemented React injection for animation container (better positioning and stability)
 * - Enhanced error handling and fallback mechanisms
 * - Improved compatibility with Discord updates
 * - Added @source URL to betterdiscord-assets repository
 *
 * PERFORMANCE IMPROVEMENTS:
 * - Better UI integration with Discord's React tree
 * - More reliable positioning via React injection
 * - Animation container persists through Discord UI updates
 * - Graceful fallbacks if webpack/React unavailable
 *
 * RELIABILITY:
 * - More stable animation positioning (React injection prevents removal)
 * - Better error handling in React fiber traversal
 * - Enhanced position calculation using webpack modules
 * - All existing functionality preserved (backward compatible)
 *
 * KEY BENEFIT:
 * - React injection ensures animation container stays in DOM even when Discord updates its UI.
 *   This prevents animations from failing to display during Discord updates.
 *
 * @changelog v1.1.0 (2025-12-05) - FUNCTIONAL PROGRAMMING OPTIMIZATION
 * CRITICAL FIXES:
 * - Deep copy in constructor (prevents save corruption)
 * - Deep merge in loadSettings (prevents nested object sharing)
 *
 * FUNCTIONAL OPTIMIZATIONS:
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
      glowIntensity: 1.5,
      fontSize: 48,
      levelUpFont: "'Friend or Foe BB', sans-serif", // Font for LEVEL UP animation text
      useLocalFonts: true, // Use local font files (Friend or Foe BB requires local files)
    };

    // CRITICAL FIX: Deep copy to prevent defaultSettings corruption
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.animationContainer = null;
    this.activeAnimations = new Set();
    this.patcher = null;

    // Webpack modules (for advanced Discord integration)
    this.webpackModules = {
      UserStore: null,
      ChannelStore: null,
    };
    this.webpackModuleAccess = false; // Track if webpack modules are available
    this.reactInjectionActive = false; // Track if React injection is active
  }

  /**
   * 2.2 WEBPACK MODULE HELPERS
   */

  /**
   * Initialize webpack modules for advanced Discord integration
   * Falls back gracefully if modules are unavailable
   */
  initializeWebpackModules() {
    try {
      // Try to get UserStore
      this.webpackModules.UserStore = BdApi.Webpack.getModule((m) => m && m.getCurrentUser);

      // Try to get ChannelStore
      this.webpackModules.ChannelStore = BdApi.Webpack.getModule(
        (m) => m && (m.getChannel || m.getChannelId)
      );

      // Check if we have webpack access
      this.webpackModuleAccess = !!(
        this.webpackModules.UserStore || this.webpackModules.ChannelStore
      );

      this.debugLog('WEBPACK_INIT', 'Webpack modules initialized', {
        hasUserStore: !!this.webpackModules.UserStore,
        hasChannelStore: !!this.webpackModules.ChannelStore,
        webpackModuleAccess: this.webpackModuleAccess,
      });
    } catch (error) {
      this.debugError('WEBPACK_INIT', error);
      this.webpackModuleAccess = false;
    }
  }

  /**
   * Try to inject animation container via React injection (preferred method)
   * Falls back to DOM injection if React injection fails
   */
  tryReactInjection() {
    try {
      // Find Discord's main content area React component
      // Try multiple search patterns for better compatibility
      let MainContent = BdApi.Webpack.getByStrings('baseLayer', {
        defaultExport: false,
      });

      // Alternative: Search for app content wrapper
      if (!MainContent) {
        MainContent = BdApi.Webpack.getByStrings('appMount', {
          defaultExport: false,
        });
      }

      if (!MainContent) {
        this.debugLog('REACT_INJECTION', 'Main content component not found, using DOM fallback');
        return false;
      }

      const pluginInstance = this;
      const React = BdApi.React;
      const targetMethod = 'Z';
      const hasTargetMethod = typeof MainContent?.[targetMethod] === 'function';

      if (!hasTargetMethod) {
        this.debugError(
          'REACT_INJECTION',
          new Error(
            `MainContent.${targetMethod} is missing. Discord likely changed the render key; update tryReactInjection target.`
          )
        );
        return false;
      }

      // Patch the React component to inject our animation container
      try {
        BdApi.Patcher.after(
          'LevelUpAnimation',
          MainContent,
          targetMethod,
          (thisObject, args, returnValue) => {
            try {
              // Find body element in React tree
              const bodyPath = BdApi.Utils.findInTree(
                returnValue,
                (prop) =>
                  prop &&
                  prop.props &&
                  (prop.props.className?.includes('app') ||
                    prop.props.id === 'app-mount' ||
                    prop.type === 'body'),
                { walkable: ['props', 'children'] }
              );

              if (bodyPath && bodyPath.props) {
                // Check if animation container already injected
                const hasContainer = BdApi.Utils.findInTree(
                  returnValue,
                  (prop) => prop && prop.props && prop.props.className === 'lu-animation-container',
                  { walkable: ['props', 'children'] }
                );
              // Set up DOM reference after injection with retry
              const waitForContainer = (retries = 10) => {
                const domElement = document.querySelector('.lu-animation-container');
                if (domElement) {
                  pluginInstance.animationContainer = domElement;
                } else if (retries > 0) {
                  setTimeout(() => waitForContainer(retries - 1), 100);
                } else {
                  pluginInstance.debugError('REACT_INJECTION',
                    new Error('Container not found after injection'));
                }
              };
              setTimeout(waitForContainer, 100);

                  // Inject at the beginning of body children
                  if (Array.isArray(bodyPath.props.children)) {
                    bodyPath.props.children.unshift(containerElement);
                  } else if (bodyPath.props.children) {
                    bodyPath.props.children = [containerElement, bodyPath.props.children];
                  } else {
                    bodyPath.props.children = containerElement;
                  }

                  pluginInstance.reactInjectionActive = true;
                  pluginInstance.debugLog(
                    'REACT_INJECTION',
                    'Animation container injected via React'
                  );

                  // Set up DOM reference after injection
                  setTimeout(() => {
                    const domElement = document.querySelector('.lu-animation-container');
                    if (domElement) {
                      pluginInstance.animationContainer = domElement;
                    }
                  }, 100);
                }
              }
            } catch (error) {
              pluginInstance.debugError('REACT_INJECTION', error);
              return returnValue; // Return original on error
            }
            return returnValue;
          }
        );
      } catch (patchError) {
        this.debugError('REACT_INJECTION', patchError);
        return false;
      }

      const patchApplied = BdApi.Patcher.isPatched('LevelUpAnimation', MainContent, targetMethod);
      if (!patchApplied) {
        this.debugError(
          'REACT_INJECTION',
          new Error(
            `Patch not applied to MainContent.${targetMethod}. Discord update may have changed the render key; update tryReactInjection target.`
          )
        );
        return false;
      }

      this.reactInjectionActive = true;
      this.debugLog('REACT_INJECTION', 'React injection patch installed');
      return true;
    } catch (error) {
      this.debugError('REACT_INJECTION', error);
      return false;
    }
  }

  /**
   * 2.3 HELPER FUNCTIONS
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
    this.loadLevelUpFont(); // Load font before injecting CSS
    this.injectCSS();

    // ============================================================================
    // WEBPACK MODULE ACCESS: Initialize Discord module access
    // ============================================================================
    this.initializeWebpackModules();

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

    // Cleanup webpack patches and React injection
    if (this.reactInjectionActive) {
      try {
        BdApi.Patcher.unpatchAll('LevelUpAnimation');
        this.reactInjectionActive = false;
        this.debugLog('STOP', 'Webpack patches and React injection removed');
      } catch (error) {
        this.debugError('STOP', error, { phase: 'unpatch' });
      }
    }

    // Clear webpack module references
    this.webpackModules = {
      UserStore: null,
      ChannelStore: null,
    };
    this.webpackModuleAccess = false;

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
   * Load font for Level Up animation (Friend or Foe BB)
   * Uses local files if enabled, otherwise Google Fonts fallback
   */
  loadLevelUpFont() {
    const fontToLoad =
      this.settings.levelUpFont?.replace(/'/g, '').replace(/"/g, '').split(',')[0].trim() ||
      'Friend or Foe BB';

    const isFriendOrFoe =
      fontToLoad.toLowerCase().includes('friend or foe') ||
      fontToLoad.toLowerCase() === 'friend or foe bb';

    if (isFriendOrFoe && this.settings.useLocalFonts) {
      const loaded = this.loadLocalFont(fontToLoad);
      if (loaded) return true;
    }

    // Fallback to Google Fonts (will fail gracefully for Friend or Foe BB)
    return this.loadGoogleFont(fontToLoad);
  }

  /**
   * Get the fonts folder path for Level Up Animation plugin
   */
  getFontsFolderPath() {
    try {
      const pluginPath = BdApi.Plugins.folder.replace(/\\/g, '/');
      if (pluginPath) {
        const normalizedPath = pluginPath.endsWith('/') ? pluginPath : `${pluginPath}/`;
        return `${normalizedPath}LevelUpAnimation/fonts/`;
      }
    } catch (e) {
      this.debugError('Failed to get plugin path', e);
    }
    return './LevelUpAnimation/fonts/';
  }

  /**
   * Load local font file for Level Up animation
   */
  loadLocalFont(fontName, fontFamily = null) {
    if (!fontFamily) {
      fontFamily = `'${fontName}', sans-serif`;
    }

    try {
      const existingStyle = document.getElementById(
        `lu-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`
      );
      if (existingStyle) {
        return true; // Font already loaded
      }

      const fontsPath = this.getFontsFolderPath();
      let fontFileName = fontName.replace(/\s+/g, '');
      if (fontName.toLowerCase().includes('friend or foe')) {
        fontFileName = 'FriendorFoeBB';
      }

      const fontStyle = document.createElement('style');
      fontStyle.id = `lu-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
      fontStyle.textContent = `
        @font-face {
          font-family: '${fontName}';
          src: url('${fontsPath}${fontFileName}.woff2') format('woff2'),
               url('${fontsPath}${fontFileName}.woff') format('woff'),
               url('${fontsPath}${fontFileName}.ttf') format('truetype');
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `;
      document.head.appendChild(fontStyle);
      this.debugLog('Local font loaded', { fontName, fontFileName });
      return true;
    } catch (error) {
      this.debugError('Failed to load local font', error);
      return false;
    }
  }

  /**
   * Load font from Google Fonts (fallback)
   */
  loadGoogleFont(fontName) {
    try {
      const fontId = `lu-google-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
      if (document.getElementById(fontId)) {
        return true;
      }

      const fontLink = document.createElement('link');
      fontLink.id = fontId;
      fontLink.rel = 'stylesheet';
      const fontUrlName = fontName.replace(/\s+/g, '+');
      fontLink.href = `https://fonts.googleapis.com/css2?family=${fontUrlName}&display=swap`;
      document.head.appendChild(fontLink);
      return true;
    } catch (error) {
      this.debugError('Failed to load Google font', error);
      return false;
    }
  }

  /**
   * Inject CSS styles for level up animations
   * Operations:
   * 1. Check if styles already injected (prevent duplicates)
   * 2. Create style element with animation keyframes
   * 3. Append to document head
   * 4. Define animations: float-up, glow-pulse
   */
  injectCSS() {
    const styleId = 'level-up-animation-css';
    const levelUpFont = this.settings.levelUpFont || "'Friend or Foe BB', sans-serif";
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
        font-family: ${levelUpFont};
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
        /* Font smoothing for better rendering */
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
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
   * 1. Try React injection first (preferred method)
   * 2. Fall back to DOM injection if React injection fails
   * 3. Check if container already exists
   * 4. Create new container div if needed
   * 5. Append to document body (DOM fallback)
   * 6. Return container reference
   */
  getAnimationContainer() {
    if (this.animationContainer?.isConnected) return this.animationContainer;

    const existing = document.querySelector('.lu-animation-container');
    if (existing) {
      this.animationContainer = existing;
      return this.animationContainer;
    }

    const injectedElement = this.tryReactInjection()
      ? document.querySelector('.lu-animation-container')
      : null;
    if (injectedElement) {
      this.animationContainer = injectedElement;
      this.debugLog('INIT', 'Animation container created via React injection');
      return this.animationContainer;
    }

    const container = document.createElement('div');
    container.className = 'lu-animation-container';
    (document.body || document.documentElement).appendChild(container);
    this.animationContainer = container;
    this.debugLog('INIT', 'Animation container created via DOM fallback');
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
   * Enhanced with webpack module access for better positioning
   * Operations:
   * 1. Try to get current channel from ChannelStore (webpack)
   * 2. Search for Discord chat elements (input, messages, container)
   * 3. Calculate center position of found element
   * 4. Fall back to screen center if no element found
   * 5. Return x, y coordinates for animation placement
   */
  getMessageAreaPosition() {
    // Method 1: Try webpack ChannelStore for channel info (if available)
    if (this.webpackModuleAccess && this.webpackModules.ChannelStore) {
      try {
        const channelId = this.webpackModules.ChannelStore.getChannelId?.();
        if (channelId) {
          this.debugLog('POSITION', 'Got channel ID from ChannelStore', { channelId });
        }
      } catch (error) {
        this.debugError('POSITION', error, { phase: 'webpack_channel' });
      }
    }

    // Method 2: Try to find the message input area or chat container (DOM)
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
   * 3.6 ANIMATION DISPLAY
   */
  /**
   * Display level up animation with text
   * Operations:
   * 1. Check if animation is enabled
   * 2. Calculate optimal display position
   * 3. Create "LEVEL UP!" text element with styling
   * 4. Position text at calculated coordinates
   * 5. Track animation for cleanup
   * 6. Schedule automatic cleanup after duration
   * 7. Remove container if no animations remain
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

      // Track animation
      const animationId = `lu-${Date.now()}`;
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
