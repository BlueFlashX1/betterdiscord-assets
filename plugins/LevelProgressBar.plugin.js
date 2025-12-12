/**
 * @name LevelProgressBar
 * @author BlueFlashX1
 * @description Real-time progress bar showing your level, XP, rank, and Shadow Army power
 * @version 1.4.0
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 *
 * ============================================================================
 * FILE STRUCTURE & NAVIGATION
 * ============================================================================
 *
 * This file follows a 4-section structure for easy navigation:
 *
 * SECTION 1: IMPORTS & DEPENDENCIES (Line 75)
 * SECTION 2: CONFIGURATION & HELPERS (Line 79)
 *   2.1 Constructor & Settings
 *   2.2 Helper Functions
 * SECTION 3: MAJOR OPERATIONS (Line 120+)
 *   3.1 Plugin Lifecycle (start, stop)
 *   3.2 Settings Management (load, save, getSettingsPanel)
 *   3.3 CSS Management (inject, remove)
 *   3.4 Progress Bar Management (create, remove, update)
 *   3.5 Event System (subscribe, unsubscribe)
 *   3.6 Visual Effects (sparkles, milestones)
 * SECTION 4: DEBUGGING & DEVELOPMENT
 *
 * ============================================================================
 * VERSION HISTORY
 * ============================================================================
 *
 * @changelog v1.4.0 (2025-12-06) - ADVANCED BETTERDISCORD INTEGRATION
 * ADVANCED FEATURES:
 * - Added Webpack module access (UserStore, ChannelStore) for better Discord integration
 * - Implemented React injection for progress bar UI (prevents disappearing on Discord updates)
 * - Enhanced error handling and fallback mechanisms
 * - Improved compatibility with Discord updates
 * - Added @source URL to betterdiscord-assets repository
 *
 * PERFORMANCE IMPROVEMENTS:
 * - Better UI integration with Discord's React tree
 * - More reliable DOM updates via React injection
 * - Progress bar persists through Discord UI updates (React injection)
 * - Graceful fallbacks if webpack/React unavailable
 *
 * RELIABILITY:
 * - More stable UI positioning (React injection prevents removal)
 * - Better error handling in React fiber traversal
 * - All existing functionality preserved (backward compatible)
 *
 * KEY BENEFIT:
 * - React injection solves the critical issue of progress bar disappearing when Discord
 *   updates its UI. The progress bar now persists automatically through Discord updates.
 *
 * @changelog v1.3.0 (2025-12-05) - FUNCTIONAL PROGRAMMING OPTIMIZATION
 * CRITICAL FIXES:
 * - Deep copy in constructor (prevents save corruption)
 * - Deep merge in loadSettings (prevents nested object sharing)
 *
 * FUNCTIONAL OPTIMIZATIONS:
 * - For-loop → Array.from() (sparkle creation)
 * - If-else → classList.toggle() (compact mode)
 * - If-else → .filter().forEach() (milestone markers)
 * - Event listeners → functional mapper (7 listeners → 1 forEach)
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
 * - 10+ if-else optimized (functional style)
 * - Clean, maintainable code
 *
 * @changelog v1.2.0 (2025-12-04) - REMOVED SHADOW ARMY CLICKER
 * - Removed Shadow Army click handler (use Shadow Army widget instead)
 * - Shadow power display is now read-only
 * - Removed hover/active styles and cursor pointer
 * - Cleaner UI integration with Shadow Army widget system
 *
 * @changelog v1.1.0 (2025-12-04) - SHADOW POWER & ALIGNMENT
 * - Added Shadow Army total power display
 * - Fixed height/padding to prevent cutoff at top
 * - Improved alignment with Discord UI elements
 * - Reduced top margin to prevent overlap with search box
 * - Better visual integration with Discord theme
 *
 * @changelog v1.0.2 (Previous)
 * - Event-driven updates for performance
 * - Removed polling in favor of event listeners
 * - Better integration with SoloLevelingStats plugin
 */

module.exports = class LevelProgressBar {
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
   * Try to inject progress bar via React injection (preferred method)
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

      // Patch the React component to inject our progress bar
      BdApi.Patcher.after('LevelProgressBar', MainContent, 'Z', (thisObject, args, returnValue) => {
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
            // Check if progress bar already injected
            const hasProgressBar = BdApi.Utils.findInTree(
              returnValue,
              (prop) => prop && prop.props && prop.props.id === 'lpb-progress-container',
              { walkable: ['props', 'children'] }
            );

            if (!hasProgressBar && !pluginInstance.progressBar) {
              const progressBarElement = React.createElement(
                'div',
                {
                  id: 'lpb-progress-container',
                  className: `lpb-progress-container ${pluginInstance.settings.position}`,
                },
                pluginInstance.renderProgressBarReactElement(React)
              );

              // Inject at the beginning of body children
              if (Array.isArray(bodyPath.props.children)) {
                bodyPath.props.children.unshift(progressBarElement);
              } else if (bodyPath.props.children) {
                bodyPath.props.children = [progressBarElement, bodyPath.props.children];
              } else {
                bodyPath.props.children = progressBarElement;
              }

              pluginInstance.reactInjectionActive = true;
              pluginInstance.debugLog('REACT_INJECTION', 'Progress bar injected via React');

              // Set up DOM reference after injection
              pluginInstance._setTrackedTimeout(() => {
                const domElement = document.getElementById('lpb-progress-container');
                if (domElement) {
                  pluginInstance.progressBar = domElement;
                  pluginInstance.initializeProgressBar();
                }
              }, 100);
            }
          }
        } catch (error) {
          pluginInstance.debugError('REACT_INJECTION', error);
          return returnValue; // Return original on error
        }
        return returnValue;
      });

      this.reactInjectionActive = true;
      this.debugLog('REACT_INJECTION', 'React injection patch installed');
      return true;
    } catch (error) {
      this.debugError('REACT_INJECTION', error);
      return false;
    }
  }

  /**
   * Render progress bar HTML (used for both React injection and DOM fallback)
   */
  renderProgressBarHTML() {
    const bar = `
      <div class="lpb-progress-bar ${this.settings.compact ? 'compact' : ''}">
        <div class="lpb-progress-bar-content">
          <div class="lpb-progress-text" id="lpb-progress-text">Rank: E Lv.1 0/100 XP</div>
        </div>
        <div class="lpb-progress-track">
          <div class="lpb-progress-fill" id="lpb-progress-fill" style="transform: scaleX(0);"></div>
        </div>
        <div class="lpb-shadow-power" id="lpb-shadow-power">Shadow Army Power: 0</div>
      </div>
    `;
    return bar;
  }

  /**
   * Render progress bar as React elements (avoids HTML parsing).
   * Keeps IDs/classes identical to the DOM fallback so the rest of the plugin can query normally.
   */
  renderProgressBarReactElement(React) {
    const noShimmerClass =
      !this.settings.showShimmer || this.getPrefersReducedMotion() ? 'lpb-no-shimmer' : '';

    return React.createElement(
      'div',
      {
        className: `lpb-progress-bar ${
          this.settings.compact ? 'compact' : ''
        } ${noShimmerClass}`.trim(),
      },
      React.createElement(
        'div',
        { className: 'lpb-progress-bar-content' },
        React.createElement('div', {
          className: 'lpb-progress-text',
          id: 'lpb-progress-text',
          children: 'Rank: E Lv.1 0/100 XP',
        })
      ),
      React.createElement(
        'div',
        { className: 'lpb-progress-track' },
        React.createElement('div', {
          className: 'lpb-progress-fill',
          id: 'lpb-progress-fill',
          style: { transform: 'scaleX(0)' },
        })
      ),
      React.createElement('div', {
        className: 'lpb-shadow-power',
        id: 'lpb-shadow-power',
        children: 'Shadow Army Power: 0',
      })
    );
  }

  /**
   * Initialize progress bar after creation (common setup for both React and DOM)
   */
  initializeProgressBar() {
    if (!this.progressBar) return;

    // Initial update - force update even if data hasn't changed
    this.lastLevel = null;
    this.lastXP = null;
    this.lastXPRequired = null;
    this.updateProgressBar();

    // Start shadow power updates (event-driven preferred; polling only if needed)
    this.updateShadowPower().catch(console.error);

    // Initialize milestone markers
    this._setTrackedTimeout(() => {
      const progressTrack = this.getCachedElement('.lpb-progress-track');
      if (progressTrack) {
        if (BdApi.Plugins.isEnabled('SoloLevelingStats')) {
          const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
          if (soloPlugin) {
            const instance = soloPlugin.instance || soloPlugin;
            if (instance && instance.getCurrentLevel) {
              const levelInfo = instance.getCurrentLevel();
              const xpPercent = (levelInfo.xp / levelInfo.xpRequired) * 100;
              this.updateMilestoneMarkers(progressTrack, xpPercent);
            }
          }
        }
      }
    }, 100);
  }
  constructor() {
    this.defaultSettings = {
      enabled: true,
      debugMode: false, // Toggle debug console logs
      position: 'top', // top, bottom
      showLevel: true,
      showRank: true,
      showXP: true,
      compact: false, // Compact mode (smaller bar)
      integratedLevelUpAnimation: true, // Consolidated: show level-up animation from progress bar
      showShimmer: true, // Visual effect (can be disabled for performance)
      opacity: 1.0, // 100% opacity - fully opaque (fixed, no config needed)
      updateInterval: 5000, // Fallback polling interval (only used if events unavailable)
    };

    // CRITICAL FIX: Deep copy to prevent defaultSettings corruption
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.progressBar = null;
    this.updateInterval = null;
    this.lastLevel = 0;
    this.lastXP = 0;
    this.lastXPRequired = 0; // Track XP required to detect level changes
    this.eventUnsubscribers = []; // Store unsubscribe functions for event listeners
    this.fallbackInterval = null; // Fallback polling if events not available (disabled by default)
    this.cachedShadowPower = '0'; // Cache shadow power to avoid repeated queries
    this.shadowPowerUpdateInterval = null; // Interval for updating shadow power
    this._isStopped = true;
    this._trackedTimeouts = new Set();
    this._updateRafId = null;
    this._updateQueued = false;
    this._lastMilestoneMask = null;
    this._shadowPowerRefreshRafId = null;
    this._shadowPowerRefreshQueued = false;
    this._prefersReducedMotion = null;
    this.webpackModules = {
      UserStore: null,
      ChannelStore: null,
    };
    this.webpackModuleAccess = false;
    this.reactInjectionActive = false;

    // Performance caches
    this._cache = {
      soloLevelingData: null,
      soloLevelingDataTime: 0,
      soloLevelingDataTTL: 100, // 100ms - data changes frequently
      soloPluginInstance: null, // Cache plugin instance to avoid repeated lookups
      soloPluginInstanceTime: 0,
      soloPluginInstanceTTL: 5000, // 5s - plugin instance doesn't change often
      domElements: new Map(), // Cache DOM element references
      domElementsTime: 0,
      domElementsTTL: 2000, // 2s - DOM structure is relatively stable
    };
  }

  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================

  /**
   * 3.1 PLUGIN LIFECYCLE
   */
  start() {
    this._isStopped = false;
    this.debugLog('START', 'Plugin starting');
    this.initializeWebpackModules();
    this.loadSettings();
    this.injectCSS();
    this.createProgressBar();

    // Try to subscribe to events immediately, with retry if SoloLevelingStats not ready yet
    this.subscribeToEvents();

    // If subscription failed, retry after a short delay (SoloLevelingStats might still be loading)
    if (this.eventUnsubscribers.length === 0) {
      this._setTrackedTimeout(() => {
        this.subscribeToEvents();
        // If still no events after retry, use fallback polling
        if (this.eventUnsubscribers.length === 0) {
          this.debugLog('START', 'Events not available after retry, using fallback polling');
          this.startUpdating();
        }
      }, 1000);
    }

    this.debugLog('START', 'Plugin started successfully', {
      enabled: this.settings.enabled,
      position: this.settings.position,
      eventBased: this.eventUnsubscribers.length > 0,
      fallbackPolling: this.eventUnsubscribers.length === 0,
    });
  }

  stop() {
    this._isStopped = true;
    this.debugLog('STOP', 'Plugin stopping');
    this.unsubscribeFromEvents();
    this.stopUpdating();
    this._clearTrackedTimeouts();
    if (this._updateRafId) {
      cancelAnimationFrame(this._updateRafId);
      this._updateRafId = null;
      this._updateQueued = false;
    }
    this.detachLevelProgressBarSettingsPanelHandlers?.();
    if (this.shadowPowerUpdateInterval) {
      clearInterval(this.shadowPowerUpdateInterval);
      this.shadowPowerUpdateInterval = null;
    }
    if (this._shadowPowerRefreshRafId) {
      cancelAnimationFrame(this._shadowPowerRefreshRafId);
      this._shadowPowerRefreshRafId = null;
      this._shadowPowerRefreshQueued = false;
    }

    // Cleanup webpack patches and React injection
    if (this.reactInjectionActive) {
      try {
        BdApi.Patcher.unpatchAll('LevelProgressBar');
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

    this.removeProgressBar();
    this.removeCSS();

    // Clear all caches
    this._cache.soloLevelingData = null;
    this._cache.soloLevelingDataTime = 0;
    this._cache.soloPluginInstance = null;
    this._cache.soloPluginInstanceTime = 0;
    this._cache.domElements = new Map();
    this._cache.domElementsTime = 0;

    this.debugLog('STOP', 'Plugin stopped successfully');
  }

  /**
   * 3.2 SETTINGS MANAGEMENT
   */
  loadSettings() {
    try {
      const saved = BdApi.Data.load('LevelProgressBar', 'settings');
      if (saved) {
        // CRITICAL FIX: Deep merge to prevent nested object reference sharing
        const merged = { ...this.defaultSettings, ...saved };
        this.settings = JSON.parse(JSON.stringify(merged));
        this.debugLog('LOAD_SETTINGS', 'Settings loaded successfully', {
          enabled: this.settings.enabled,
          position: this.settings.position,
          showLevel: this.settings.showLevel,
          showRank: this.settings.showRank,
          showXP: this.settings.showXP,
          compact: this.settings.compact,
        });
      } else {
        this.debugLog('LOAD_SETTINGS', 'No saved settings, using defaults');
      }
    } catch (error) {
      this.debugError('LOAD_SETTINGS', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('LevelProgressBar', 'settings', this.settings);
      this.debugLog('SAVE_SETTINGS', 'Settings saved successfully');
    } catch (error) {
      this.debugError('SAVE_SETTINGS', error);
    }
  }

  detachLevelProgressBarSettingsPanelHandlers() {
    const root = this._settingsPanelRoot;
    const handlers = this._settingsPanelHandlers;
    if (root && handlers) {
      root.removeEventListener('change', handlers.onChange);
    }
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
  }

  getSettingsPanel() {
    this.detachLevelProgressBarSettingsPanelHandlers();

    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h3 style="color: #8b5cf6; margin-bottom: 10px;">Level Progress Bar Settings</h3>

        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${
            this.settings.enabled ? 'checked' : ''
          } data-lpb-setting="enabled">
          <span style="margin-left: 10px;">Enable Progress Bar</span>
        </label>

        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Position:</span>
          <select data-lpb-setting="position" style="width: 100%; padding: 5px;">
            <option value="top" ${this.settings.position === 'top' ? 'selected' : ''}>Top</option>
            <option value="bottom" ${
              this.settings.position === 'bottom' ? 'selected' : ''
            }>Bottom</option>
          </select>
        </label>

        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${
            this.settings.showLevel ? 'checked' : ''
          } data-lpb-setting="showLevel">
          <span style="margin-left: 10px;">Show Level</span>
        </label>

        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${
            this.settings.showRank ? 'checked' : ''
          } data-lpb-setting="showRank">
          <span style="margin-left: 10px;">Show Rank</span>
        </label>

        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.showXP ? 'checked' : ''} data-lpb-setting="showXP">
          <span style="margin-left: 10px;">Show XP</span>
        </label>

        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${
            this.settings.compact ? 'checked' : ''
          } data-lpb-setting="compact">
          <span style="margin-left: 10px;">Compact Mode</span>
        </label>

        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${
            this.settings.integratedLevelUpAnimation ? 'checked' : ''
          } data-lpb-setting="integratedLevelUpAnimation">
          <span style="margin-left: 10px;">Integrated Level Up Animation</span>
        </label>

        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${
            this.settings.showShimmer ? 'checked' : ''
          } data-lpb-setting="showShimmer">
          <span style="margin-left: 10px;">Shimmer Effect</span>
        </label>

        <!-- Opacity removed - fixed at 100% (1.0) for better visibility -->
        <hr style="margin: 20px 0; border: none; border-top: 1px solid rgba(139, 92, 246, 0.3);">
        <h4 style="color: #8b5cf6; margin-bottom: 10px;">Developer Options</h4>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${
            this.settings.debugMode ? 'checked' : ''
          } data-lpb-setting="debugMode">
          <span style="margin-left: 10px;">Debug Mode</span>
        </label>
        <p style="font-size: 12px; color: #888; margin-top: 5px;">
          Show detailed console logs for troubleshooting. Reload Discord after changing.
        </p>
      </div>
    `;

    const onChange = (event) => {
      const target = event.target;
      const key = target?.getAttribute?.('data-lpb-setting');
      if (!key) return;

      const nextValue = target.type === 'checkbox' ? target.checked : target.value;

      const handlers = {
        enabled: (value) => {
          this.settings.enabled = !!value;
          this.saveSettings();
          value
            ? (this.createProgressBar(),
              this.subscribeToEvents() || this.startUpdating(),
              this.queueProgressBarUpdate())
            : (this.unsubscribeFromEvents(),
              this.stopUpdating(),
              this.removeProgressBar(),
              this.removeLevelUpOverlay());
        },
        position: (value) => {
          this.settings.position = value;
          this.saveSettings();
          this.updateProgressBarPosition();
          this.queueProgressBarUpdate();
        },
        showLevel: (value) => {
          this.settings.showLevel = !!value;
          this.saveSettings();
          this.queueProgressBarUpdate();
        },
        showRank: (value) => {
          this.settings.showRank = !!value;
          this.saveSettings();
          this.queueProgressBarUpdate();
        },
        showXP: (value) => {
          this.settings.showXP = !!value;
          this.saveSettings();
          this.queueProgressBarUpdate();
        },
        compact: (value) => {
          this.settings.compact = !!value;
          this.saveSettings();
          this.queueProgressBarUpdate();
        },
        integratedLevelUpAnimation: (value) => {
          this.settings.integratedLevelUpAnimation = !!value;
          this.saveSettings();
        },
        showShimmer: (value) => {
          this.settings.showShimmer = !!value;
          this.saveSettings();
          this.queueProgressBarUpdate();
        },
        debugMode: (value) => {
          this.settings.debugMode = !!value;
          this.saveSettings();
          console.log('[LevelProgressBar] Debug mode:', value ? 'ENABLED' : 'DISABLED');
        },
      };

      (handlers[key] || (() => {}))(nextValue);
    };

    panel.addEventListener('change', onChange);
    this._settingsPanelRoot = panel;
    this._settingsPanelHandlers = { onChange };

    return panel;
  }

  /**
   * 3.3 CSS MANAGEMENT
   */

  injectCSS() {
    const styleId = 'level-progress-bar-css';
    const cssContent = `
      .lpb-progress-container {
        position: fixed;
        left: 0;
        right: 0;
        z-index: 999997;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      .lpb-progress-container.top {
        top: 0;
      }

      .lpb-progress-container.bottom {
        bottom: 0;
      }

      .lpb-progress-bar {
        width: 100%;
        background: rgba(10, 10, 15, 0.95);
        border-bottom: 2px solid rgba(139, 92, 246, 0.5);
        padding: 5px 20px 5px 80px;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        box-shadow: 0 2px 10px rgba(139, 92, 246, 0.3);
        backdrop-filter: blur(10px);
      }

      .lpb-progress-bar-content {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0;
        flex-shrink: 0;
      }

      .lpb-progress-container.bottom .lpb-progress-bar {
        border-bottom: none;
        border-top: 2px solid rgba(139, 92, 246, 0.5);
        box-shadow: 0 -2px 10px rgba(139, 92, 246, 0.3);
      }

      .lpb-progress-bar.compact {
        padding: 3px 15px 3px 80px;
      }

      .lpb-progress-text {
        font-size: 14px;
        font-weight: 600;
        color: #a78bfa;
        text-shadow: 0 0 8px rgba(167, 139, 250, 0.6);
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        flex-shrink: 0;
        line-height: 1;
      }

      .lpb-progress-track {
        width: 800px;
        height: 12px;
        background: rgba(20, 20, 30, 0.8);
        border-radius: 999px;
        overflow: hidden;
        position: relative;
        border: none !important;
        box-shadow: none !important;
        filter: none !important;
        align-self: center;
        flex-shrink: 0;
      }

      .lpb-shadow-power {
        font-size: 12px;
        font-weight: 600;
        color: #8b5cf6;
        text-shadow: 0 0 4px rgba(139, 92, 246, 0.6);
        white-space: nowrap;
        display: flex;
        align-items: center;
        margin-left: 12px;
        flex-shrink: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        padding: 6px 12px;
      }

      /* Consolidated level-up animation (owned by LevelProgressBar) */
      .lpb-levelup-overlay {
        position: fixed;
        left: 0;
        right: 0;
        pointer-events: none;
        z-index: 999998;
      }

      .lpb-levelup-overlay.top {
        top: 0;
      }

      .lpb-levelup-overlay.bottom {
        bottom: 0;
      }

      .lpb-levelup-banner {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 16px;
        border-radius: 10px;
        background: rgba(10, 10, 15, 0.92);
        border: 1px solid rgba(139, 92, 246, 0.55);
        color: #a78bfa;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        box-shadow: 0 10px 30px rgba(139, 92, 246, 0.25);
        text-shadow: 0 0 10px rgba(167, 139, 250, 0.6);
        animation: lpb-levelup-pop 1200ms ease-out forwards;
        will-change: transform, opacity;
      }

      .lpb-levelup-overlay.top .lpb-levelup-banner {
        top: 38px;
      }

      .lpb-levelup-overlay.bottom .lpb-levelup-banner {
        bottom: 38px;
      }

      @keyframes lpb-levelup-pop {
        0% {
          opacity: 0;
          transform: translateX(-50%) translateY(0) scale(0.75);
        }
        15% {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1.05);
        }
        100% {
          opacity: 0;
          transform: translateX(-50%) translateY(-14px) scale(1);
        }
      }

      /* XP glow animation disabled */
      .lpb-progress-fill.lpb-xp-gain {
        animation: none !important;
        box-shadow: none !important;
      }

      @keyframes lpb-xp-glow {
        /* Disabled - no glow animation */
      }

      .lpb-compact .lpb-progress-track {
        height: 8px;
      }

      .lpb-progress-fill {
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%);
        border-radius: inherit;
        transform-origin: left center;
        transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        box-shadow: 0 0 10px rgba(139, 92, 246, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
        will-change: transform;
      }

      /* Shimmer animation overlay */
      .lpb-progress-fill::before {
        content: '';
        position: absolute;
        top: 0;
        left: -140%;
        width: 140%;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.45) 50%,
          transparent 100%
        );
        animation: lpb-shimmer 2s infinite;
        display: block !important;
        mix-blend-mode: screen;
      }

      /* Optional shimmer toggle + reduced motion support */
      .lpb-progress-bar.lpb-no-shimmer .lpb-progress-fill::before {
        animation: none !important;
        display: none !important;
      }

      @media (prefers-reduced-motion: reduce) {
        .lpb-progress-fill {
          transition: none !important;
        }
        .lpb-progress-fill::before {
          /* Respect reduced-motion for movement-heavy effects, but keep shimmer available
             (user preference may still want shimmer). Slow it down instead of disabling. */
          animation-duration: 4s !important;
          opacity: 0.25;
        }
        .lpb-levelup-banner {
          animation: none !important;
          opacity: 0;
        }
      }

      /* XP gain pulse animation */
      .lpb-progress-fill.lpb-xp-gain {
        animation: lpb-xp-pulse 0.6s ease-out;
      }

      @keyframes lpb-xp-pulse {
        0% {
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
        }
        50% {
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.8), inset 0 0 30px rgba(167, 139, 250, 0.6);
          transform: scaleY(1.1);
        }
        100% {
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
          transform: scaleY(1);
        }
      }

      /* Subtle glow effect on hover */
      .lpb-progress-fill:hover {
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.7), inset 0 0 25px rgba(167, 139, 250, 0.4);
      }

      /* Sparkle particles */
      .lpb-progress-track .lpb-sparkle {
        position: absolute;
        width: 4px;
        height: 4px;
        background: rgba(186, 85, 211, 0.9);
        border-radius: 50%;
        pointer-events: none;
        animation: lpb-sparkle-float 2s infinite;
        box-shadow: 0 0 8px rgba(186, 85, 211, 0.9);
        top: 50%;
        transform: translateY(-50%);
      }

      /* Milestone markers */
      .lpb-progress-track .lpb-milestone {
        position: absolute;
        top: -10px;
        width: 2px;
        height: 32px;
        background: rgba(139, 92, 246, 0.6);
        pointer-events: none;
        z-index: 1;
      }

      .lpb-progress-track .lpb-milestone::after {
        content: '';
        position: absolute;
        top: -5px;
        left: -4px;
        width: 10px;
        height: 10px;
        background: rgba(139, 92, 246, 0.9);
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(139, 92, 246, 0.8);
        animation: lpb-milestone-pulse 2s infinite;
      }

      @keyframes lpb-sparkle {
        0%, 100% { opacity: 0; }
        50% { opacity: 1; }
      }

      @keyframes lpb-sparkle-float {
        0% {
          opacity: 0;
          transform: translateY(-50%) scale(0);
        }
        50% {
          opacity: 1;
          transform: translateY(-60%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateY(-70%) scale(0);
        }
      }

      @keyframes lpb-milestone-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 0.9;
        }
        50% {
          transform: scale(1.3);
          opacity: 1;
        }
      }

      @keyframes lpb-shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(300%);
        }
      }

      .lpb-xp-text {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.8);
        white-space: nowrap;
        font-family: 'Press Start 2P', monospace;
      }

      .lpb-compact .lpb-xp-text {
        font-size: 9px;
      }

    `;

    // Use BdApi.DOM for persistent CSS injection (v1.8.0+)
    try {
      BdApi.DOM.addStyle(styleId, cssContent);
      this.debugLog('INJECT_CSS', 'CSS injected successfully via BdApi.DOM');
    } catch (error) {
      // Fallback to manual injection
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = cssContent;
      document.head.appendChild(style);
      this.debugLog('INJECT_CSS', 'CSS injected successfully via manual method');
    }
  }

  removeCSS() {
    const styleId = 'level-progress-bar-css';
    try {
      BdApi.DOM.removeStyle(styleId);
    } catch (error) {
      // Fallback to manual removal
      const style = document.getElementById(styleId);
      if (style) style.remove();
    }
  }

  /**
   * 3.4 PROGRESS BAR MANAGEMENT
   */

  // Create progress bar element
  createProgressBar() {
    if (!this.settings.enabled) {
      this.debugLog('CREATE_BAR', 'Plugin disabled, skipping');
      return;
    }

    if (this.progressBar) {
      this.debugLog('CREATE_BAR', 'Progress bar already exists');
      return;
    }

    // Try React injection first (preferred method)
    if (this.tryReactInjection()) {
      // React injection successful, initialization handled in tryReactInjection
      this.debugLog('CREATE_BAR', 'Progress bar created via React injection');
      return;
    }

    // Fallback to DOM injection if React injection fails
    this.debugLog('CREATE_BAR', 'React injection failed, using DOM fallback');

    try {
      const container = document.createElement('div');
      container.id = 'lpb-progress-container';
      container.className = `lpb-progress-container ${this.settings.position}`;
      container.style.opacity = 1.0; // Fixed at 100% opacity

      // Use renderProgressBarHTML for consistency
      container.innerHTML = this.renderProgressBarHTML();

      document.body.appendChild(container);

      this.progressBar = container;
      this.debugLog('CREATE_BAR', 'Progress bar created successfully via DOM', {
        position: this.settings.position,
        compact: this.settings.compact,
        containerExists: !!this.progressBar,
        parentExists: !!this.progressBar.parentElement,
        showLevel: this.settings.showLevel,
        showRank: this.settings.showRank,
        showXP: this.settings.showXP,
      });

      // Initialize progress bar (common setup)
      this.initializeProgressBar();

      // Invalidate DOM cache since new elements were created
      this.invalidateDOMCache();
    } catch (error) {
      this.debugError('CREATE_BAR', error);
    }
  }

  removeProgressBar() {
    if (this.progressBar) {
      this.progressBar.remove();
      this.progressBar = null;
      this.debugLog('REMOVE_BAR', 'Progress bar removed');

      // Invalidate DOM cache since elements were removed
      this.invalidateDOMCache();
    }
    this.removeLevelUpOverlay();
  }

  /**
   * Update progress bar position
   */
  updateProgressBarPosition() {
    if (this.progressBar) {
      this.progressBar.className = `lpb-progress-container ${this.settings.position}`;
      this.debugLog('UPDATE_POSITION', 'Position updated', {
        position: this.settings.position,
      });
    }
    const overlay = document.getElementById('lpb-levelup-overlay');
    overlay && (overlay.className = `lpb-levelup-overlay ${this.settings.position}`);
  }

  /**
   * Get SoloLevelingStats instance and level info
   * @returns {Object|null} - Object with instance and levelInfo, or null if unavailable
   */
  getSoloLevelingData() {
    // Check cache first
    const now = Date.now();
    if (
      this._cache.soloLevelingData &&
      this._cache.soloLevelingDataTime &&
      now - this._cache.soloLevelingDataTime < this._cache.soloLevelingDataTTL
    ) {
      return this._cache.soloLevelingData;
    }

    try {
      // Check if plugin is enabled before accessing
      if (!BdApi.Plugins.isEnabled('SoloLevelingStats')) {
        this.debugLog('GET_SOLO_DATA', 'SoloLevelingStats plugin not enabled');
        this._cache.soloLevelingData = null;
        this._cache.soloLevelingDataTime = now;
        return null;
      }

      // Cache plugin instance to avoid repeated lookups
      let soloPlugin = null;
      let instance = null;

      if (
        this._cache.soloPluginInstance &&
        this._cache.soloPluginInstanceTime &&
        now - this._cache.soloPluginInstanceTime < this._cache.soloPluginInstanceTTL
      ) {
        instance = this._cache.soloPluginInstance;
      } else {
        soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
        if (!soloPlugin) {
          this.debugLog('GET_SOLO_DATA', 'SoloLevelingStats plugin not found');
          this._cache.soloLevelingData = null;
          this._cache.soloLevelingDataTime = now;
          this._cache.soloPluginInstance = null;
          this._cache.soloPluginInstanceTime = 0;
          return null;
        }

        instance = soloPlugin.instance || soloPlugin;
        // Cache the instance
        this._cache.soloPluginInstance = instance;
        this._cache.soloPluginInstanceTime = now;
      }

      if (!instance?.getCurrentLevel) {
        this.debugLog('GET_SOLO_DATA', 'Instance or method not found', {
          hasInstance: !!instance,
          hasMethod: !!(instance && instance.getCurrentLevel),
        });
        this._cache.soloLevelingData = null;
        this._cache.soloLevelingDataTime = now;
        return null;
      }

      // Get current level info (calculates level from totalXP)
      const levelInfo = instance.getCurrentLevel();
      if (!levelInfo) {
        this.debugLog('GET_SOLO_DATA', 'Level info not available');
        this._cache.soloLevelingData = null;
        this._cache.soloLevelingDataTime = now;
        return null;
      }

      // Get rank from settings (not from levelInfo)
      const rank = instance.settings?.rank || 'E';

      // Debug log to verify data
      this.debugLog('GET_SOLO_DATA', 'Retrieved SoloLevelingStats data', {
        level: levelInfo.level,
        xp: levelInfo.xp,
        xpRequired: levelInfo.xpRequired,
        rank: rank,
        totalXP: instance.settings?.totalXP,
      });

      const result = {
        instance,
        levelInfo,
        rank: rank,
      };

      // Cache the result
      this._cache.soloLevelingData = result;
      this._cache.soloLevelingDataTime = now;

      return result;
    } catch (error) {
      this.debugError('GET_SOLO_DATA', error);
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = now;
      return null;
    }
  }

  // ============================================================================
  // PROGRESS BAR UPDATE METHODS
  // ============================================================================

  /**
   * Get cached DOM element or query and cache it
   * @param {string} selector - CSS selector
   * @param {Element} container - Container to search in (default: this.progressBar)
   * @returns {Element|null} - Cached or queried element
   */
  getCachedElement(selector, container = null) {
    const now = Date.now();
    const cacheKey = selector;
    const targetContainer = container || this.progressBar;
    const cache = this._cache.domElements;

    // Refresh cache if invalid or older than TTL
    if (
      !cache.get(cacheKey) ||
      !targetContainer ||
      !targetContainer.contains(cache.get(cacheKey)) ||
      now - this._cache.domElementsTime > this._cache.domElementsTTL
    ) {
      if (!targetContainer) {
        return null;
      }
      const element = targetContainer.querySelector(selector);
      if (element) {
        cache.set(cacheKey, element);
        this._cache.domElementsTime = now;
      } else {
        cache.delete(cacheKey);
      }
      return element;
    }

    return cache.get(cacheKey);
  }

  /**
   * Invalidate DOM element cache
   */
  invalidateDOMCache() {
    this._cache.domElements = new Map();
    this._cache.domElementsTime = 0;
  }

  /**
   * Track timeouts so they can be cleared on stop() and avoid work-after-stop.
   */
  _setTrackedTimeout(callback, delayMs) {
    const wrapped = () => {
      this._trackedTimeouts.delete(timeoutId);
      !this._isStopped && callback();
    };

    const timeoutId = setTimeout(wrapped, delayMs);
    this._trackedTimeouts.add(timeoutId);
    return timeoutId;
  }

  _clearTrackedTimeouts() {
    this._trackedTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._trackedTimeouts.clear();
  }

  /**
   * Coalesce rapid update bursts (events + DOM) to once-per-frame.
   */
  queueProgressBarUpdate() {
    if (this._isStopped) return;
    if (this._updateQueued) return;
    this._updateQueued = true;
    this._updateRafId = requestAnimationFrame(() => {
      this._updateQueued = false;
      this._updateRafId = null;
      !this._isStopped && this.updateProgressBar();
    });
  }

  getPrefersReducedMotion() {
    if (typeof this._prefersReducedMotion === 'boolean') return this._prefersReducedMotion;
    try {
      this._prefersReducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')
        ?.matches;
    } catch (_) {
      this._prefersReducedMotion = false;
    }
    return this._prefersReducedMotion;
  }

  queueShadowPowerRefresh() {
    if (this._isStopped) return;
    if (this._shadowPowerRefreshQueued) return;
    this._shadowPowerRefreshQueued = true;
    this._shadowPowerRefreshRafId = requestAnimationFrame(() => {
      this._shadowPowerRefreshQueued = false;
      this._shadowPowerRefreshRafId = null;
      !this._isStopped && this.refreshProgressText();
    });
  }

  /**
   * Update progress bar with current data
   */
  updateProgressBar() {
    // Early returns for invalid states
    if (!this.progressBar || !this.settings.enabled) {
      this.debugLog('UPDATE_BAR', 'Skipping update', {
        hasBar: !!this.progressBar,
        enabled: this.settings.enabled,
      });
      return;
    }

    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData) {
        this.debugLog('UPDATE_BAR', 'SoloLevelingStats data not available', {
          hasBar: !!this.progressBar,
          enabled: this.settings.enabled,
        });
        return;
      }

      const { levelInfo, rank } = soloData;
      const currentLevel = levelInfo.level;
      const currentXP = levelInfo.xp;
      const xpRequired = levelInfo.xpRequired || 1; // Prevent division by zero
      const xpPercent = Math.min((currentXP / xpRequired) * 100, 100); // Cap at 100%

      // Skip update if data hasn't changed (but allow initial update)
      // CRITICAL: Always update if level changed, even if XP appears the same
      // This ensures progress bar updates correctly when leveling up
      if (
        this.lastLevel !== null &&
        this.lastXP !== null &&
        currentLevel === this.lastLevel &&
        currentXP === this.lastXP &&
        xpRequired === (this.lastXPRequired || 0)
      ) {
        return;
      }

      this.debugLog('UPDATE_BAR', 'Data changed, updating bar', {
        oldLevel: this.lastLevel,
        newLevel: currentLevel,
        oldXP: this.lastXP,
        newXP: currentXP,
      });

      this.lastLevel = currentLevel;
      this.lastXP = currentXP;
      this.lastXPRequired = xpRequired;

      // Update progress text (single line format matching SoloLevelingStats)
      this.updateProgressText(rank, currentLevel, currentXP, xpRequired);

      // Update progress fill animation
      const progressFill = this.getCachedElement('#lpb-progress-fill');
      if (progressFill) {
        progressFill.style.transform = `scaleX(${Math.max(0, Math.min(xpPercent / 100, 1))})`;
        // Add XP gain animation class temporarily
        progressFill.classList.add('lpb-xp-gain');
        this._setTrackedTimeout(() => {
          progressFill.classList.remove('lpb-xp-gain');
        }, 600);
      }

      // Update milestone markers
      const progressTrack = this.getCachedElement('.lpb-progress-track');
      if (progressTrack) {
        const milestones = [25, 50, 75];
        const mask = milestones.reduce(
          (acc, milestone, index) => (xpPercent >= milestone - 1 ? acc | (1 << index) : acc),
          0
        );
        if (mask !== this._lastMilestoneMask) {
          this._lastMilestoneMask = mask;
          this.updateMilestoneMarkers(progressTrack, xpPercent);
        }
      }

      // FUNCTIONAL: Update compact class using classList.toggle (NO IF-ELSE!)
      const bar = this.getCachedElement('.lpb-progress-bar');
      bar?.classList.toggle('compact', this.settings.compact);
      const shouldDisableShimmer = !this.settings.showShimmer || this.getPrefersReducedMotion();
      bar?.classList.toggle('lpb-no-shimmer', shouldDisableShimmer);

      this.debugLog('UPDATE_BAR', 'Progress bar updated successfully', {
        level: currentLevel,
        xp: currentXP,
        xpRequired,
        percent: Math.round(xpPercent),
        rank,
        showLevel: this.settings.showLevel,
        showRank: this.settings.showRank,
        showXP: this.settings.showXP,
      });
    } catch (error) {
      this.debugError('UPDATE_BAR', error, {
        hasBar: !!this.progressBar,
        enabled: this.settings.enabled,
      });
    }
  }

  getOrCreateLevelUpOverlay() {
    const existing = document.getElementById('lpb-levelup-overlay');
    if (existing) {
      existing.className = `lpb-levelup-overlay ${this.settings.position}`;
      return existing;
    }

    const overlay = document.createElement('div');
    overlay.id = 'lpb-levelup-overlay';
    overlay.className = `lpb-levelup-overlay ${this.settings.position}`;
    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  }

  removeLevelUpOverlay() {
    const overlay = document.getElementById('lpb-levelup-overlay');
    overlay?.remove();
  }

  showIntegratedLevelUpAnimation({ newLevel, oldLevel }) {
    if (this._isStopped) return;
    if (!this.settings.integratedLevelUpAnimation) return;

    const overlay = this.getOrCreateLevelUpOverlay();

    // Keep this lightweight: one banner node + one cleanup timeout
    const banner = document.createElement('div');
    banner.className = 'lpb-levelup-banner';
    banner.textContent = `Level Up: Lv.${newLevel}`;
    overlay.appendChild(banner);

    this._setTrackedTimeout(() => banner.remove(), 1300);

    this.debugLog('LEVEL_UP', 'Integrated animation shown', { newLevel, oldLevel });
  }

  /**
   * 3.7 VISUAL EFFECTS & UPDATES
   */

  // Get total shadow power from ShadowArmy plugin (synchronous, returns cached value)
  // Returns string: Total power of all shadows (formatted)
  getTotalShadowPower() {
    return this.cachedShadowPower;
  }

  /**
   * Update shadow power cache asynchronously
   */
  async updateShadowPower() {
    try {
      // Check if plugin is enabled before accessing
      if (!BdApi.Plugins.isEnabled('SoloLevelingStats')) {
        this.cachedShadowPower = '0';
        await this.refreshProgressText();
        return;
      }

      // Get shadow power from SoloLevelingStats plugin (it already calculates it correctly)
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin || !soloPlugin.instance) {
        this.cachedShadowPower = '0';
        await this.refreshProgressText();
        return;
      }

      const soloStats = soloPlugin.instance;

      // Use the cached shadow power from SoloLevelingStats (it updates it asynchronously)
      if (typeof soloStats.getTotalShadowPower === 'function') {
        const shadowPower = soloStats.getTotalShadowPower();
        if (shadowPower && shadowPower !== '0') {
          this.cachedShadowPower = shadowPower;
          await this.refreshProgressText();
          return;
        }
      }

      // If SoloLevelingStats hasn't calculated it yet, trigger an update and retry
      if (typeof soloStats.updateShadowPower === 'function') {
        await soloStats.updateShadowPower();
        // Retry getting the value after update
        if (typeof soloStats.getTotalShadowPower === 'function') {
          const shadowPower = soloStats.getTotalShadowPower();
          this.cachedShadowPower = shadowPower || '0';
          await this.refreshProgressText();
          return;
        }
      }

      this.cachedShadowPower = '0';
      await this.refreshProgressText();
    } catch (error) {
      this.debugError('UPDATE_SHADOW_POWER', error);
      this.cachedShadowPower = '0';
      await this.refreshProgressText();
    }
  }

  /**
   * Refresh progress text with current cached shadow power
   */
  async refreshProgressText() {
    if (!this.progressBar) return;

    // Update shadow power display (power only, no count)
    const shadowPowerEl = this.getCachedElement('#lpb-shadow-power');

    if (shadowPowerEl) {
      // Format: "Shadow Army Power: 1,234,567"
      const shadowPower = this.getTotalShadowPower();
      shadowPowerEl.textContent = `Shadow Army Power: ${shadowPower}`;
    }

    // Refresh main progress text
    const soloData = this.getSoloLevelingData();
    if (soloData) {
      const { levelInfo, rank } = soloData;
      const xp = levelInfo.xp;
      const xpRequired = levelInfo.xpRequired || 1;
      this.updateProgressText(rank, levelInfo.level, xp, xpRequired);
    }
  }

  /**
   * Update progress text with current rank, level, and XP
   * Format: "Rank: E Lv.1 0/100 XP"
   * Shadow power is displayed separately to the right of the progress bar
   * @param {string} rank - Current rank
   * @param {number} level - Current level
   * @param {number} xp - Current XP in level
   * @param {number} xpRequired - XP required for next level
   */
  updateProgressText(rank, level, xp, xpRequired) {
    try {
      const progressText = this.getCachedElement('#lpb-progress-text');
      if (!progressText) {
        this.debugLog('UPDATE_TEXT', 'Progress text element not found');
        return;
      }

      // Format: "Rank: E Lv.1 0/100 XP" (shadow power is separate element)
      const text = `Rank: ${rank} Lv.${level} ${xp}/${xpRequired} XP`;
      progressText.textContent = text;

      // Shadow power display is updated by refreshProgressText() only
      // DO NOT update shadow power here - it would overwrite the shadow count format

      this.debugLog('UPDATE_TEXT', 'Progress text updated', {
        rank,
        level,
        xp,
        xpRequired,
        shadowPower: this.getTotalShadowPower(),
        text,
      });
    } catch (error) {
      this.debugError('UPDATE_TEXT', error);
    }
  }

  /**
   * 3.5 EVENT SYSTEM
   */

  // Subscribe to SoloLevelingStats events for real-time updates
  // Returns true if subscription successful, false otherwise
  subscribeToEvents() {
    // Don't subscribe twice
    if (this.eventUnsubscribers.length > 0) {
      this.debugLog('SUBSCRIBE_EVENTS', 'Already subscribed to events');
      return true;
    }

    // Check if plugin is enabled before accessing
    if (!BdApi.Plugins.isEnabled('SoloLevelingStats')) {
      this.debugLog('SUBSCRIBE_EVENTS', 'SoloLevelingStats plugin not enabled');
      return false;
    }

    const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
    if (!soloPlugin) {
      this.debugLog('SUBSCRIBE_EVENTS', 'SoloLevelingStats plugin not found');
      return false;
    }

    const instance = soloPlugin.instance || soloPlugin;
    if (!instance || typeof instance.on !== 'function') {
      this.debugLog('SUBSCRIBE_EVENTS', 'Event system not available', {
        hasInstance: !!instance,
        hasOnMethod: !!(instance && typeof instance.on === 'function'),
      });
      // Without events, enable shadow power polling as a fallback.
      this.startShadowPowerPolling();
      // Still attach DOM CustomEvent listeners (works even if instance.on is unavailable)
      this.subscribeToDomEvents();
      return false;
    }

    // Always attach DOM CustomEvent listeners as a redundant path
    // (prevents “bar not responding” if instance subscription is flaky)
    this.subscribeToDomEvents();

    // Subscribe to XP changed events (fires on any XP change)
    const unsubscribeXP = instance.on('xpChanged', (data) => {
      this.debugLog('EVENT_XP_CHANGED', 'XP changed event received', data);
      // Invalidate cache since data changed
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;
      // Update immediately - no polling needed
      this.queueProgressBarUpdate();
    });
    this.eventUnsubscribers.push(unsubscribeXP);

    // Subscribe to level changed events
    const unsubscribeLevel = instance.on('levelChanged', (data) => {
      this.debugLog('EVENT_LEVEL_CHANGED', 'Level changed event received', data);
      // Invalidate cache since level changed
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;
      // CRITICAL: Force update by resetting cached values when level changes
      // This ensures progress bar updates correctly even if XP appears unchanged
      if (data && data.newLevel !== undefined && data.newLevel !== this.lastLevel) {
        this.lastLevel = null; // Force update
        this.lastXP = null; // Force update
        this.lastXPRequired = null; // Force update
      }
      // Update immediately - no polling needed
      this.queueProgressBarUpdate();

      // Consolidated: show level-up animation here (prevents duplicate work in updateProgressBar)
      if (
        this.settings.integratedLevelUpAnimation &&
        data &&
        typeof data.newLevel === 'number' &&
        typeof data.oldLevel === 'number' &&
        data.newLevel > data.oldLevel
      ) {
        this.showIntegratedLevelUpAnimation({ newLevel: data.newLevel, oldLevel: data.oldLevel });
      }
    });
    this.eventUnsubscribers.push(unsubscribeLevel);

    // Subscribe to rank changed events
    const unsubscribeRank = instance.on('rankChanged', (data) => {
      this.debugLog('EVENT_RANK_CHANGED', 'Rank changed event received', data);
      // Invalidate cache since rank changed
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;
      // Update immediately - no polling needed
      this.queueProgressBarUpdate();
    });
    this.eventUnsubscribers.push(unsubscribeRank);

    // Subscribe to stats changed events (when stats are allocated)
    const unsubscribeStats = instance.on('statsChanged', (data) => {
      this.debugLog('EVENT_STATS_CHANGED', 'Stats changed event received', data);
      // Invalidate cache since stats changed (might affect calculations)
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;
      // Update immediately to reflect any stat-based changes
      // Note: Stats don't directly affect progress bar, but update to ensure sync
      this.queueProgressBarUpdate();
    });
    this.eventUnsubscribers.push(unsubscribeStats);

    // Subscribe to shadow power changed events for real-time updates
    const unsubscribeShadowPower = instance.on('shadowPowerChanged', (data) => {
      this.debugLog('EVENT_SHADOW_POWER_CHANGED', 'Shadow power changed event received', data);
      try {
        // Update shadow power immediately (coalesced UI refresh)
        if (data && data.shadowPower) {
          this.cachedShadowPower = data.shadowPower;
          this.queueShadowPowerRefresh();
        } else {
          // Trigger update to get latest value
          this.updateShadowPower();
        }
      } catch (error) {
        this.debugError('EVENT_SHADOW_POWER_CHANGED', error);
      }
    });
    this.eventUnsubscribers.push(unsubscribeShadowPower);

    // If we successfully subscribed to shadow power events, disable polling.
    this.stopShadowPowerPolling();

    // Log successful subscription (always log, not just debug)
    console.log(
      '[LevelProgressBar]  Event-based updates enabled - progress bar will update in real-time'
    );

    this.debugLog('SUBSCRIBE_EVENTS', 'Successfully subscribed to events', {
      listenersCount: this.eventUnsubscribers.length,
    });

    // Initial update
    this.queueProgressBarUpdate();
    this.stopShadowPowerPolling();

    return true;
  }

  subscribeToDomEvents() {
    // Don't subscribe twice (use same storage as regular event unsubs)
    if (this._domEventSubscribed) return;
    this._domEventSubscribed = true;

    const onXp = () => {
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;
      this.queueProgressBarUpdate();
    };
    const onLevel = (event) => {
      const data = event?.detail;
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;
      if (data && typeof data.newLevel === 'number' && data.newLevel !== this.lastLevel) {
        this.lastLevel = null;
        this.lastXP = null;
        this.lastXPRequired = null;
      }
      this.queueProgressBarUpdate();
    };
    const onRank = () => {
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;
      this.queueProgressBarUpdate();
    };
    const onStats = () => {
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;
      this.queueProgressBarUpdate();
    };
    const onShadowPower = (event) => {
      const data = event?.detail;
      try {
        if (data && data.shadowPower) {
          this.cachedShadowPower = data.shadowPower;
          this.queueShadowPowerRefresh();
        } else {
          this.updateShadowPower();
        }
      } catch (error) {
        this.debugError('DOM_EVENT_SHADOW_POWER', error);
      }
    };

    document.addEventListener('SoloLevelingStats:xpChanged', onXp);
    document.addEventListener('SoloLevelingStats:levelChanged', onLevel);
    document.addEventListener('SoloLevelingStats:rankChanged', onRank);
    document.addEventListener('SoloLevelingStats:statsChanged', onStats);
    document.addEventListener('SoloLevelingStats:shadowPowerChanged', onShadowPower);

    this.eventUnsubscribers.push(() => {
      document.removeEventListener('SoloLevelingStats:xpChanged', onXp);
      document.removeEventListener('SoloLevelingStats:levelChanged', onLevel);
      document.removeEventListener('SoloLevelingStats:rankChanged', onRank);
      document.removeEventListener('SoloLevelingStats:statsChanged', onStats);
      document.removeEventListener('SoloLevelingStats:shadowPowerChanged', onShadowPower);
      this._domEventSubscribed = false;
    });
  }

  /**
   * Unsubscribe from all events
   */
  unsubscribeFromEvents() {
    this.eventUnsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        this.debugError('UNSUBSCRIBE_EVENTS', error);
      }
    });
    this.eventUnsubscribers = [];
    this.debugLog('UNSUBSCRIBE_EVENTS', 'Unsubscribed from all events');
  }

  /**
   * 3.6 FALLBACK POLLING
   */

  // Start fallback polling (only used if events unavailable)
  startUpdating() {
    if (this.updateInterval) {
      this.debugLog('START_UPDATE', 'Update interval already running');
      return;
    }

    // Only use polling as fallback - slower interval since events should handle most updates
    this.updateInterval = setInterval(() => {
      this.queueProgressBarUpdate();
    }, this.settings.updateInterval || 5000); // Default to 5 seconds for fallback

    this.debugLog('START_UPDATE', 'Fallback polling started', {
      interval: this.settings.updateInterval || 5000,
    });
    this.startShadowPowerPolling();
  }

  stopUpdating() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      this.debugLog('STOP_UPDATE', 'Update interval stopped');
    }
  }

  startShadowPowerPolling() {
    if (this.shadowPowerUpdateInterval) return;
    this.shadowPowerUpdateInterval = setInterval(() => {
      this.updateShadowPower().catch(() => {});
    }, 30000);
    this.debugLog('SHADOW_POWER_POLL', 'Shadow power polling enabled', { intervalMs: 30000 });
  }

  stopShadowPowerPolling() {
    if (!this.shadowPowerUpdateInterval) return;
    clearInterval(this.shadowPowerUpdateInterval);
    this.shadowPowerUpdateInterval = null;
    this.debugLog('SHADOW_POWER_POLL', 'Shadow power polling disabled');
  }

  /**
   * 2.2 HELPER FUNCTIONS
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
      console.log(`[LevelProgressBar] ${op}:`, msg, logData || '');
    };

    return this.settings.debugMode && log();
  }

  debugError(operation, error, data = null) {
    console.error(`[LevelProgressBar] ERROR [${operation}]:`, error, data || '');
  }

  createProgressSparkles(progressTrack, xpPercent) {
    // FUNCTIONAL: Create 3-5 sparkles using Array.from (NO FOR-LOOP!)
    const sparkleCount = 3 + Math.floor(Math.random() * 3);

    Array.from({ length: sparkleCount }, (_, i) => {
      const sparkle = document.createElement('div');
      sparkle.className = 'lpb-sparkle';
      sparkle.style.left = `${xpPercent}%`;
      sparkle.style.animationDelay = `${i * 0.2}s`;
      progressTrack.appendChild(sparkle);

      this._setTrackedTimeout(() => sparkle.remove(), 2000);
      return sparkle;
    });
  }

  updateMilestoneMarkers(progressTrack, xpPercent) {
    if (!progressTrack) return;

    // Remove existing markers
    const existingMarkers = progressTrack.querySelectorAll('.lpb-milestone');
    existingMarkers.forEach((m) => m.remove());

    // FUNCTIONAL: Add markers at 25%, 50%, 75% using filter (NO IF-ELSE!)
    const milestones = [25, 50, 75];
    milestones
      .filter((milestone) => xpPercent >= milestone - 1)
      .forEach((milestone) => {
        const marker = document.createElement('div');
        marker.className = 'lpb-milestone';
        marker.style.left = `${milestone}%`;
        progressTrack.appendChild(marker);
      });
  }

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT
  // ============================================================================

  /**
   * 4.1 DEBUG SYSTEM (FUNCTIONAL - NO IF-ELSE!)
   *
   * Debug logging system controlled by settings.debugMode
   * Uses short-circuit evaluation instead of if-else statements
   * OFF by default for clean console in production
   */

  // Note: debugLog and debugError are defined in Section 2.2 (Helper Functions)
  // This section is reserved for future debugging utilities
};
