/**
 * @name LevelProgressBar
 * @author BlueFlashX1
 * @description Real-time progress bar showing your level, XP, and rank
 * @version 1.5.0
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

// Load SoloLevelingUtils shared module
let SLUtils;
try {
  const fs = require('fs');
  const path = require('path');
  const utilsPath = path.join(BdApi.Plugins.folder, 'SoloLevelingUtils.js');
  if (fs.existsSync(utilsPath)) {
    const code = fs.readFileSync(utilsPath, 'utf8');
    // Use new Function() instead of eval() — same scope isolation as other plugins
    (new Function(code))();
    SLUtils = window.SoloLevelingUtils;
  }
} catch (error) {
  console.warn('[LevelProgressBar] Failed to load SoloLevelingUtils:', error);
}

// Load UnifiedSaveManager for crash-resistant IndexedDB storage
let UnifiedSaveManager;
try {
  if (typeof window !== 'undefined' && typeof window.UnifiedSaveManager === 'function') {
    UnifiedSaveManager = window.UnifiedSaveManager;
  } else {
  const path = require('path');
  const fs = require('fs');
  const pluginFolder =
    (BdApi?.Plugins?.folder && typeof BdApi.Plugins.folder === 'string'
      ? BdApi.Plugins.folder
      : null) ||
    (typeof __dirname === 'string' ? __dirname : null);
  if (pluginFolder) {
    const managerFile = path.join(pluginFolder, 'UnifiedSaveManager.js');
    if (fs.existsSync(managerFile)) {
      const managerCode = fs.readFileSync(managerFile, 'utf8');
      const moduleSandbox = { exports: {} };
      const exportsSandbox = moduleSandbox.exports;
      const loader = new Function(
        'window',
        'module',
        'exports',
        `${managerCode}\nreturn module.exports || (typeof UnifiedSaveManager !== 'undefined' ? UnifiedSaveManager : null) || window?.UnifiedSaveManager || null;`
      );
      const maybeLoaded = loader(
        typeof window !== 'undefined' ? window : undefined,
        moduleSandbox,
        exportsSandbox
      );
      UnifiedSaveManager =
        maybeLoaded || (typeof window !== 'undefined' ? window.UnifiedSaveManager : null) || null;
      if (UnifiedSaveManager && typeof window !== 'undefined') {
        window.UnifiedSaveManager = UnifiedSaveManager;
      }
    } else {
      UnifiedSaveManager = typeof window !== 'undefined' ? window.UnifiedSaveManager || null : null;
    }
  } else {
    UnifiedSaveManager = typeof window !== 'undefined' ? window.UnifiedSaveManager || null : null;
  }
  }
} catch (error) {
  console.warn('[LevelProgressBar] Failed to load UnifiedSaveManager:', error);
  UnifiedSaveManager = window.UnifiedSaveManager || null;
}

module.exports = class LevelProgressBar {
  // ============================================================================
  // SECTION 1: IMPORTS & DEPENDENCIES
  // ============================================================================
  // SoloLevelingUtils loaded above for shared utilities

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
    if (SLUtils) {
      const result = SLUtils.initWebpackModules();
      this.webpackModules.UserStore = result.UserStore;
      this.webpackModules.ChannelStore = result.ChannelStore;
      this.webpackModuleAccess = result.ok;
      this.debugLog('WEBPACK_INIT', 'Webpack modules initialized (shared)', {
        hasUserStore: !!result.UserStore,
        hasChannelStore: !!result.ChannelStore,
        webpackModuleAccess: result.ok,
      });
    } else {
      try {
        this.webpackModules.UserStore = BdApi.Webpack.getModule((m) => m && m.getCurrentUser);
        this.webpackModules.ChannelStore = BdApi.Webpack.getModule(
          (m) => m && (m.getChannel || m.getChannelId)
        );
        this.webpackModuleAccess = !!(
          this.webpackModules.UserStore || this.webpackModules.ChannelStore
        );
      } catch (error) {
        this.debugError('WEBPACK_INIT', error);
        this.webpackModuleAccess = false;
      }
    }
  }

  /**
   * Try to inject progress bar via React injection (preferred method)
   * Falls back to DOM injection if React injection fails
   */
  tryReactInjection() {
    const pluginInstance = this;

    if (SLUtils) {
      const ok = SLUtils.tryReactInjection({
        patcherId: 'LevelProgressBar',
        elementId: 'lpb-progress-container',
        render: (React) =>
          React.createElement(
            'div',
            {
              id: 'lpb-progress-container',
              className: `lpb-progress-container ${pluginInstance.settings.position}`,
            },
            pluginInstance.renderProgressBarReactElement(React)
          ),
        onMount: (domEl) => {
          pluginInstance.progressBar = domEl;
          pluginInstance.initializeProgressBar();
        },
        debugLog: (...a) => pluginInstance.debugLog(...a),
        debugError: (...a) => pluginInstance.debugError(...a),
      });

      if (ok) this.reactInjectionActive = true;
      return ok;
    }

    // Fallback: inline implementation if SLUtils unavailable
    try {
      let MainContent = BdApi.Webpack.getByStrings('baseLayer', { defaultExport: false });
      if (!MainContent) {
        MainContent = BdApi.Webpack.getByStrings('appMount', { defaultExport: false });
      }
      if (!MainContent) {
        this.debugLog('REACT_INJECTION', 'Main content component not found, using DOM fallback');
        return false;
      }

      const React = BdApi.React;
      BdApi.Patcher.after('LevelProgressBar', MainContent, 'Z', (_this, _args, returnValue) => {
        try {
          const bodyPath = BdApi.Utils.findInTree(
            returnValue,
            (prop) =>
              prop && prop.props &&
              (prop.props.className?.includes('app') || prop.props.id === 'app-mount' || prop.type === 'body'),
            { walkable: ['props', 'children'] }
          );
          if (!bodyPath?.props) return returnValue;

          const already = BdApi.Utils.findInTree(
            returnValue,
            (prop) => prop?.props?.id === 'lpb-progress-container',
            { walkable: ['props', 'children'] }
          );
          if (already || pluginInstance.progressBar) return returnValue;

          const el = React.createElement('div', {
            id: 'lpb-progress-container',
            className: `lpb-progress-container ${pluginInstance.settings.position}`,
          }, pluginInstance.renderProgressBarReactElement(React));

          if (Array.isArray(bodyPath.props.children)) bodyPath.props.children.unshift(el);
          else if (bodyPath.props.children) bodyPath.props.children = [el, bodyPath.props.children];
          else bodyPath.props.children = el;

          pluginInstance.reactInjectionActive = true;
          pluginInstance._setTrackedTimeout(() => {
            const dom = document.getElementById('lpb-progress-container');
            if (dom) { pluginInstance.progressBar = dom; pluginInstance.initializeProgressBar(); }
          }, 100);
        } catch (error) {
          pluginInstance.debugError('REACT_INJECTION', error);
        }
        return returnValue;
      });

      this.reactInjectionActive = true;
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

    // Deep copy to prevent defaultSettings corruption
    this.settings = SLUtils
      ? SLUtils.mergeSettings(this.defaultSettings, {})
      : JSON.parse(JSON.stringify(this.defaultSettings));
    this.progressBar = null;
    this.updateInterval = null;
    this.lastLevel = 0;
    this.lastXP = 0;
    this.lastXPRequired = 0;
    this.eventUnsubscribers = [];
    this.fallbackInterval = null;
    this._isStopped = true;
    // Shared tracked-timeout manager
    this._timeouts = SLUtils ? SLUtils.createTrackedTimeouts() : null;
    this._trackedTimeouts = this._timeouts ? null : new Set();
    this._updateRafId = null;
    this._updateQueued = false;
    this._lastMilestoneMask = null;
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
      soloLevelingDataTTL: 100,
      soloPluginInstance: null,
      soloPluginInstanceTime: 0,
      soloPluginInstanceTTL: 5000,
      domElements: new Map(),
      domElementsTime: 0,
      domElementsTTL: 2000,
    };

    // Shared DOM cache (used by getCachedElement)
    this._domCache = SLUtils ? SLUtils.createDOMCache(2000) : null;

    // Shared debug logger
    this._debug = SLUtils
      ? SLUtils.createDebugLogger('LevelProgressBar', () => this.settings?.debugMode)
      : null;

    // Initialize UnifiedSaveManager for crash-resistant IndexedDB storage
    this.saveManager = null;
    if (UnifiedSaveManager) {
      this.saveManager = new UnifiedSaveManager('LevelProgressBar');
    }
  }

  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================

  /**
   * 3.1 PLUGIN LIFECYCLE
   */
  async start() {
    this._isStopped = false;
    this.debugLog('START', 'Plugin starting');
    this.initializeWebpackModules();

    // Initialize IndexedDB save manager
    if (this.saveManager) {
      try {
        await this.saveManager.init();
        this.debugLog('START', 'UnifiedSaveManager initialized (IndexedDB)');
      } catch (error) {
        this.debugError('START', error);
        this.saveManager = null;
      }
    }

    await this.loadSettings();
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
    if (this._timeouts) this._timeouts.clearAll();
    else this._clearTrackedTimeouts();
    if (this._updateRafId) {
      cancelAnimationFrame(this._updateRafId);
      this._updateRafId = null;
      this._updateQueued = false;
    }
    this.detachLevelProgressBarSettingsPanelHandlers?.();

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
  // ── FILE BACKUP (Tier 3) ─────────────────────────────────────────────────
  // Stored OUTSIDE BetterDiscord folder so it survives BD reinstall/repair
  // Location: /Library/Application Support/discord/SoloLevelingBackups/LevelProgressBar.json

  _getFileBackupPath() {
    try {
      const pathModule = require('path');
      const appSupport = pathModule.resolve(BdApi.Plugins.folder, '..', '..'); // Application Support
      const backupDir = pathModule.join(appSupport, 'discord', 'SoloLevelingBackups');
      require('fs').mkdirSync(backupDir, { recursive: true });
      return pathModule.join(backupDir, 'LevelProgressBar.json');
    } catch { return null; }
  }

  readFileBackup() {
    const filePath = this._getFileBackupPath();
    if (!filePath) return null;
    try {
      const fs = require('fs');
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      this.debugError('LOAD_SETTINGS_FILE', error);
      return null;
    }
  }

  writeFileBackup(data) {
    const filePath = this._getFileBackupPath();
    if (!filePath) return false;
    try {
      const fs = require('fs');
      fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', (err) => {
        if (err) this.debugError('SAVE_SETTINGS_FILE', err);
        else this.debugLog('SAVE_SETTINGS', 'Saved file backup', { path: filePath });
      });
      return true;
    } catch (error) {
      this.debugError('SAVE_SETTINGS_FILE', error);
      return false;
    }
  }

  /**
   * Load settings from all 3 tiers, picking the newest valid candidate.
   * Tiers: (1) IndexedDB via UnifiedSaveManager, (2) BdApi.Data, (3) File backup
   * Uses _metadata.lastSave timestamp to pick newest; tie-breaks by tier priority.
   */
  async loadSettings() {
    try {
      this.debugLog('LOAD_SETTINGS', 'Attempting to load settings from all tiers...');

      const getSavedTimestamp = (data) => {
        const iso = data?._metadata?.lastSave;
        const ts = iso ? Date.parse(iso) : NaN;
        return Number.isFinite(ts) ? ts : 0;
      };

      const candidates = [];

      // Tier 3: File backup (survives BD reinstall)
      try {
        const fileSaved = this.readFileBackup();
        if (fileSaved && typeof fileSaved === 'object') {
          candidates.push({ source: 'file', data: fileSaved, ts: getSavedTimestamp(fileSaved) });
        }
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'File backup load failed', error);
      }

      // Tier 1: IndexedDB (survives BD reinstall)
      if (this.saveManager) {
        try {
          const idbSaved = await this.saveManager.load('settings');
          if (idbSaved && typeof idbSaved === 'object') {
            candidates.push({ source: 'indexeddb', data: idbSaved, ts: getSavedTimestamp(idbSaved) });
          }
        } catch (error) {
          this.debugError('LOAD_SETTINGS', 'IndexedDB load failed', error);
        }
      }

      // Tier 2: BdApi.Data (wiped on BD reinstall)
      try {
        const bdSaved = BdApi.Data.load('LevelProgressBar', 'settings');
        if (bdSaved && typeof bdSaved === 'object') {
          candidates.push({ source: 'bdapi', data: bdSaved, ts: getSavedTimestamp(bdSaved) });
        }
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'BdApi.Data load failed', error);
      }

      // Pick newest; tie-break by storage priority
      const sourcePriority = { indexeddb: 3, file: 2, bdapi: 1 };
      const best = candidates.reduce(
        (acc, cur) => {
          const hasNewer = cur.ts > acc.ts;
          const isTie = cur.ts === acc.ts;
          const hasHigherPriority = (sourcePriority[cur.source] ?? 0) >= (sourcePriority[acc.source] ?? 0);
          return hasNewer || (isTie && hasHigherPriority) ? cur : acc;
        },
        { source: null, data: null, ts: 0 }
      );

      if (best.data) {
        this.debugLog('LOAD_SETTINGS', `Selected settings candidate`, {
          source: best.source,
          ts: best.ts ? new Date(best.ts).toISOString() : 'none',
          candidateCount: candidates.length,
        });
        this.settings = SLUtils
          ? SLUtils.mergeSettings(this.defaultSettings, best.data)
          : JSON.parse(JSON.stringify({ ...this.defaultSettings, ...best.data }));
      } else {
        this.debugLog('LOAD_SETTINGS', 'No saved settings found, using defaults');
      }
    } catch (error) {
      this.debugError('LOAD_SETTINGS', error);
    }
  }

  async saveSettings() {
    try {
      const cleanSettings = JSON.parse(JSON.stringify(this.settings));
      cleanSettings._metadata = { lastSave: new Date().toISOString(), version: '1.5.0' };

      // Tier 1: IndexedDB (crash-resistant, survives BD reinstall)
      if (this.saveManager) {
        try {
          await this.saveManager.save('settings', cleanSettings, true);
          this.debugLog('SAVE_SETTINGS', 'Saved to IndexedDB');
        } catch (error) {
          this.debugError('SAVE_SETTINGS', error);
        }
      }

      // Tier 2: BdApi.Data (fast, inspectable)
      try {
        BdApi.Data.save('LevelProgressBar', 'settings', cleanSettings);
        this.debugLog('SAVE_SETTINGS', 'Saved to BdApi.Data');
      } catch (error) {
        this.debugError('SAVE_SETTINGS', error);
      }

      // Tier 3: File backup outside BD folder (survives BD reinstall)
      this.writeFileBackup(cleanSettings);
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
      <div style="background: #1e1e2e; border-radius: 8px; padding: 20px;">
        <h3 style="color: #8a2be2; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Level Progress Bar</h3>
        <label style="display: flex; align-items: center; cursor: pointer; padding: 10px 12px; background: #2a2a3e; border-radius: 6px; border: 1px solid #3a3a4e;">
          <input type="checkbox" ${this.settings.debugMode ? 'checked' : ''} data-lpb-setting="debugMode"
            style="accent-color: #8a2be2; width: 16px; height: 16px; margin: 0;">
          <span style="margin-left: 10px; color: #e0e0e0; font-size: 14px;">Debug Mode</span>
        </label>
        <p style="font-size: 12px; color: #6a6a8a; margin: 8px 0 0 0;">
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
        border-bottom: 2px solid rgba(138, 43, 226, 0.5);
        padding: 19px 20px 19px 80px;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        box-shadow: 0 2px 10px rgba(138, 43, 226, 0.3);
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
        border-top: 2px solid rgba(138, 43, 226, 0.5);
        box-shadow: 0 -2px 10px rgba(138, 43, 226, 0.3);
      }

      .lpb-progress-bar.compact {
        padding: 11px 15px 11px 80px;
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
        font-family: 'Orbitron', sans-serif;
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
        border: 1px solid rgba(138, 43, 226, 0.55);
        color: #a78bfa;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        box-shadow: 0 10px 30px rgba(138, 43, 226, 0.25);
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
        background: linear-gradient(90deg, #8a2be2 0%, #7b27cc 50%, #6c22b6 100%);
        border-radius: inherit;
        transform-origin: left center;
        transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
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
          box-shadow: 0 0 10px rgba(138, 43, 226, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
        }
        50% {
          box-shadow: 0 0 20px rgba(138, 43, 226, 0.8), inset 0 0 30px rgba(167, 139, 250, 0.6);
          transform: scaleY(1.1);
        }
        100% {
          box-shadow: 0 0 10px rgba(138, 43, 226, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
          transform: scaleY(1);
        }
      }

      /* Subtle glow effect on hover */
      .lpb-progress-fill:hover {
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.7), inset 0 0 25px rgba(167, 139, 250, 0.4);
      }

      /* Sparkle particles */
      .lpb-progress-track .lpb-sparkle {
        position: absolute;
        width: 4px;
        height: 4px;
        background: rgba(138, 43, 226, 0.9);
        border-radius: 50%;
        pointer-events: none;
        animation: lpb-sparkle-float 2s infinite;
        box-shadow: 0 0 8px rgba(138, 43, 226, 0.9);
        top: 50%;
        transform: translateY(-50%);
      }

      /* Milestone markers */
      .lpb-progress-track .lpb-milestone {
        position: absolute;
        top: -10px;
        width: 2px;
        height: 32px;
        background: rgba(138, 43, 226, 0.6);
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
        background: rgba(138, 43, 226, 0.9);
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(138, 43, 226, 0.8);
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

    const addStyleSafely = () => {
      if (!BdApi.DOM?.addStyle) return false;
      try {
        BdApi.DOM.addStyle(styleId, cssContent);
        return true;
      } catch (_error) {
        return false;
      }
    };

    const injectedViaBdApi = addStyleSafely();
    if (!injectedViaBdApi) {
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = cssContent;
      document.head.appendChild(styleElement);
    }

    this.debugLog(
      'INJECT_CSS',
      `CSS injected successfully via ${injectedViaBdApi ? 'BdApi.DOM' : 'manual method'}`
    );
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
    const target = container || this.progressBar;
    if (this._domCache) return this._domCache.get(selector, target);

    // Fallback: inline implementation
    const now = Date.now();
    const cache = this._cache.domElements;
    if (
      !cache.get(selector) || !target || !target.contains(cache.get(selector)) ||
      now - this._cache.domElementsTime > this._cache.domElementsTTL
    ) {
      if (!target) return null;
      const el = target.querySelector(selector);
      if (el) { cache.set(selector, el); this._cache.domElementsTime = now; }
      else cache.delete(selector);
      return el;
    }
    return cache.get(selector);
  }

  invalidateDOMCache() {
    if (this._domCache) { this._domCache.invalidate(); return; }
    this._cache.domElements = new Map();
    this._cache.domElementsTime = 0;
  }

  _setTrackedTimeout(callback, delayMs) {
    if (this._timeouts) return this._timeouts.set(callback, delayMs);

    const wrapped = () => {
      this._trackedTimeouts.delete(timeoutId);
      !this._isStopped && callback();
    };
    const timeoutId = setTimeout(wrapped, delayMs);
    this._trackedTimeouts.add(timeoutId);
    return timeoutId;
  }

  _clearTrackedTimeouts() {
    if (this._timeouts) { this._timeouts.clearAll(); return; }
    this._trackedTimeouts.forEach((id) => clearTimeout(id));
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
    if (SLUtils) {
      return SLUtils.getOrCreateOverlay(
        'lpb-levelup-overlay',
        `lpb-levelup-overlay ${this.settings.position}`
      );
    }
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
    document.getElementById('lpb-levelup-overlay')?.remove();
  }

  /**
   * 3.7 VISUAL EFFECTS & UPDATES
   */

  /**
   * Refresh progress text with current data
   */
  async refreshProgressText() {
    if (!this.progressBar) return;

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

      const text = `Rank: ${rank} Lv.${level} ${xp}/${xpRequired} XP`;
      progressText.textContent = text;

      this.debugLog('UPDATE_TEXT', 'Progress text updated', {
        rank,
        level,
        xp,
        xpRequired,
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
      // Still attach DOM CustomEvent listeners (works even if instance.on is unavailable)
      this.subscribeToDomEvents();
      return false;
    }

    // Always attach DOM CustomEvent listeners as a redundant path
    // (prevents “bar not responding” if instance subscription is flaky)
    this.subscribeToDomEvents();

    // Subscribe to instance events using shared handlers
    const events = ['xpChanged', 'levelChanged', 'rankChanged', 'statsChanged'];
    for (const event of events) {
      const unsub = instance.on(event, (data) => this._handleEvent(event, data));
      this.eventUnsubscribers.push(unsub);
    }

    // Log successful subscription (always log, not just debug)
    console.log(
      '[LevelProgressBar]  Event-based updates enabled - progress bar will update in real-time'
    );

    this.debugLog('SUBSCRIBE_EVENTS', 'Successfully subscribed to events', {
      listenersCount: this.eventUnsubscribers.length,
    });

    // Initial update
    this.queueProgressBarUpdate();

    return true;
  }

  /**
   * Shared event handler used by both instance.on() and DOM CustomEvent listeners.
   * Centralises cache invalidation and level-change detection.
   */
  _handleEvent(eventName, data) {
    // Invalidate data cache for every event
    this._cache.soloLevelingData = null;
    this._cache.soloLevelingDataTime = 0;

    if (eventName === 'levelChanged') {
      if (data && typeof data.newLevel === 'number' && data.newLevel !== this.lastLevel) {
        this.lastLevel = null;
        this.lastXP = null;
        this.lastXPRequired = null;
      }
      this.queueProgressBarUpdate();
      return;
    }

    // xpChanged, rankChanged, statsChanged — just refresh the bar
    this.queueProgressBarUpdate();
  }

  subscribeToDomEvents() {
    // Don't subscribe twice (use same storage as regular event unsubs)
    if (this._domEventSubscribed) return;
    this._domEventSubscribed = true;

    const events = ['xpChanged', 'levelChanged', 'rankChanged', 'statsChanged'];
    const handlers = {};

    for (const event of events) {
      const handler = (domEvent) => this._handleEvent(event, domEvent?.detail);
      handlers[event] = handler;
      document.addEventListener(`SoloLevelingStats:${event}`, handler);
    }

    this.eventUnsubscribers.push(() => {
      for (const event of events) {
        document.removeEventListener(`SoloLevelingStats:${event}`, handlers[event]);
      }
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
  }

  stopUpdating() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      this.debugLog('STOP_UPDATE', 'Update interval stopped');
    }
  }

  /**
   * 2.2 HELPER FUNCTIONS
   */

  debugLog(operation, message, data = null) {
    if (this._debug) { this._debug.log(operation, message, data); return; }
    // Fallback
    if (!this.settings?.debugMode) return;
    console.log(`[LevelProgressBar] ${operation}:`, message, data || '');
  }

  debugError(operation, error, data = null) {
    if (this._debug) { this._debug.error(operation, error, data ? { context: data } : {}); return; }
    console.error(`[LevelProgressBar] ERROR [${operation}]:`, error, data || '');
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
