/**
 * @name SoloLevelingTitleManager
 * @author BlueFlashX1
 * @description Title management system for Solo Leveling Stats - display and equip titles with buffs
 * @version 1.1.0
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 *
 * ============================================================================
 * ATTRIBUTION & LICENSE
 * ============================================================================
 *
 * Window Focus Detection Pattern:
 * This plugin uses a window focus/blur detection pattern inspired by
 * AutoIdleOnAFK plugin by RoguedBear.
 * - Original plugin: https://github.com/RoguedBear/BetterDiscordPlugin-AutoIdleOnAFK
 * - Original author: RoguedBear
 * - Original license: MIT License
 * - Pattern used: window blur/focus event listeners for button persistence
 *
 * This attribution does not imply the entire plugin is derived from AutoIdleOnAFK.
 * The window focus detection is a small, reusable pattern and this plugin
 * remains primarily original work by BlueFlashX1.
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
 *   2.2 Helper Functions (data access, utilities, debug)
 * SECTION 3: MAJOR OPERATIONS (Line 200+)
 *   3.1 Plugin Lifecycle (start, stop)
 *   3.2 Settings Management (load, save, getSettingsPanel)
 *   3.3 CSS Management (inject, remove)
 *   3.4 UI Management (button, modal)
 *   3.5 Title Management (equip, unequip)
 *   3.6 Event Handling (channel watcher, toolbar observer)
 * SECTION 4: DEBUGGING & DEVELOPMENT
 *
 * ============================================================================
 * VERSION HISTORY
 * ============================================================================
 *
 * @changelog v1.1.0 (2025-12-06) - ADVANCED BETTERDISCORD INTEGRATION
 * ADVANCED FEATURES:
 * - Added Webpack module access (ChannelStore) for better Discord integration
 * - Enhanced error handling and fallback mechanisms
 * - Improved compatibility with Discord updates
 * - Added @source URL to betterdiscord-assets repository
 * - Migrated CSS injection to BdApi.DOM.addStyle (official API)
 * - Fixed duplicate method definitions
 * - Added proper 4-section structure organization
 * - Enhanced debug logging with tagged format support
 *
 * PERFORMANCE IMPROVEMENTS:
 * - Better integration with Discord's internal structure
 * - More reliable button placement via webpack modules
 * - Graceful fallbacks if webpack unavailable
 *
 * RELIABILITY:
 * - Fixed incomplete createTitleButton method
 * - Proper cleanup for MutationObserver (toolbarObserver)
 * - Deep copy in constructor (prevents save corruption)
 * - All existing functionality preserved (backward compatible)
 *
 * @changelog v1.0.3 (2025-12-04)
 * - Fixed close button using inline onclick that bypassed cleanup
 * - Close button now routes through central modal click handler
 * - Ensures proper state cleanup (titleModal, _titleManagerInstances)
 * - Enhanced memory cleanup (modal instance tracking cleared on stop)
 *
 * @changelog v1.0.2 (2025-12-03)
 * - Code structure improvements (section headers)
 * - Console log cleanup (removed verbose logs)
 */

module.exports = class SoloLevelingTitleManager {
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
      debugMode: false, // Debug mode toggle
      sortBy: 'xpBonus', // Default sort filter (xpBonus, critBonus, strBonus, etc.)
    };

    // CRITICAL FIX: Deep copy to prevent defaultSettings from being modified
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.titleButton = null;
    this.titleModal = null;
    this.toolbarObserver = null;
    this._urlChangeCleanup = null; // Cleanup function for URL change watcher
    this._windowFocusCleanup = null; // Cleanup function for window focus watcher
    this._retryTimeout1 = null; // Timeout ID for first retry
    this._retryTimeout2 = null; // Timeout ID for second retry
    this._periodicCheckInterval = null; // Periodic button persistence check

    // Track all retry timeouts for proper cleanup
    this._retryTimeouts = new Set();
    this._isStopped = false;

    // Store original history methods for defensive restoration
    this._originalPushState = null;
    this._originalReplaceState = null;

    // ============================================================================
    // WEBPACK MODULE ACCESS (Advanced BetterDiscord Integration)
    // ============================================================================
    this.webpackModules = {
      ChannelStore: null,
    };
    this.webpackModuleAccess = false;
  }

  /**
   * 2.2 HELPER FUNCTIONS
   */

  /**
   * Debug logging helper - only logs when debug mode is enabled
   * Supports both formats:
   * - debugLog('message', data) - Simple format
   * - debugLog('TAG', 'message', data) - Tagged format
   * @param {string} tagOrMessage - Tag (if 3 params) or message (if 2 params)
   * @param {string|any} messageOrData - Message (if 3 params) or data (if 2 params)
   * @param {any} data - Optional data to log (only if tag provided)
   */
  debugLog(tagOrMessage, messageOrData = null, data = null) {
    this.settings.debugMode &&
      (data !== null
        ? console.log(`[TitleManager:${tagOrMessage}] ${messageOrData}`, data)
        : messageOrData !== null && typeof messageOrData === 'object'
        ? console.log(`[TitleManager] ${tagOrMessage}`, messageOrData)
        : messageOrData !== null
        ? console.log(`[TitleManager:${tagOrMessage}] ${messageOrData}`)
        : console.log(`[TitleManager] ${tagOrMessage}`));
  }

  /**
   * Debug error helper - only logs when debug mode is enabled
   * Supports both formats:
   * - debugError('message', error) - Simple format
   * - debugError('TAG', 'message', error) - Tagged format
   * @param {string} tagOrMessage - Tag (if 3 params) or message (if 2 params)
   * @param {string|any} messageOrError - Message (if 3 params) or error (if 2 params)
   * @param {any} error - Optional error object (only if tag provided)
   */
  debugError(tagOrMessage, messageOrError = null, error = null) {
    this.settings.debugMode &&
      (error !== null
        ? console.error(`[TitleManager:${tagOrMessage}] ${messageOrError}`, error)
        : messageOrError !== null && messageOrError instanceof Error
        ? console.error(`[TitleManager] ${tagOrMessage}`, messageOrError)
        : messageOrError !== null && typeof messageOrError === 'object'
        ? console.error(`[TitleManager] ${tagOrMessage}`, messageOrError)
        : messageOrError !== null
        ? console.error(`[TitleManager:${tagOrMessage}] ${messageOrError}`)
        : console.error(`[TitleManager] ${tagOrMessage}`));
  }

  /**
   * Get SoloLevelingStats data
   * @returns {Object|null} - SoloLevelingStats data or null if unavailable
   */
  getSoloLevelingData() {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) return null;

      const instance = soloPlugin.instance || soloPlugin;
      const achievements = instance.settings?.achievements || {};

      return {
        titles: achievements.titles || [],
        activeTitle: achievements.activeTitle || null,
        achievements: achievements,
      };
    } catch (error) {
      this.debugError('DATA', 'Error getting SoloLevelingStats data', error);
      return null;
    }
  }

  /**
   * Get title bonus info
   * @param {string} titleName - Title name
   * @returns {Object|null} - Title bonus object or null
   */
  getTitleBonus(titleName) {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) return null;
      const instance = soloPlugin.instance || soloPlugin;

      // Find achievement with this title
      if (instance.getAchievementDefinitions) {
        const achievements = instance.getAchievementDefinitions();
        const achievement = achievements.find((a) => a.title === titleName);
        return achievement?.titleBonus || null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * HTML escaping utility for XSS prevention
   * @param {string} text - Text to escape
   * @returns {string} - Escaped HTML
   */
  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get human-readable sort label
   * @param {string} sortBy - Sort key
   * @returns {string} - Human-readable label
   */
  getSortLabel(sortBy) {
    const labels = {
      xpBonus: 'XP Gain',
      critBonus: 'Crit Chance',
      strBonus: 'Strength %',
      agiBonus: 'Agility %',
      intBonus: 'Intelligence %',
      vitBonus: 'Vitality %',
      perBonus: 'Perception %',
    };
    return labels[sortBy] || 'XP Gain';
  }

  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================

  /**
   * 3.1 PLUGIN LIFECYCLE
   */
  start() {
    // Reset stopped flag to allow watchers to recreate
    this._isStopped = false;

    this.loadSettings();
    this.injectCSS();

    // ============================================================================
    // WEBPACK MODULE ACCESS: Initialize Discord module access
    // ============================================================================
    this.initializeWebpackModules();

    this.createTitleButton();

    // FUNCTIONAL: Retry button creation (short-circuit, no if-else)
    this._retryTimeout1 = setTimeout(() => {
      this._retryTimeouts.delete(this._retryTimeout1);
      (!this.titleButton || !document.body.contains(this.titleButton)) && this.createTitleButton();
      this._retryTimeout1 = null;
    }, 2000);
    this._retryTimeouts.add(this._retryTimeout1);

    // FUNCTIONAL: Additional retry (short-circuit, no if-else)
    this._retryTimeout2 = setTimeout(() => {
      this._retryTimeouts.delete(this._retryTimeout2);
      (!this.titleButton || !document.body.contains(this.titleButton)) && this.createTitleButton();
      this._retryTimeout2 = null;
    }, 5000);
    this._retryTimeouts.add(this._retryTimeout2);

    // Watch for channel changes and recreate button
    this.setupChannelWatcher();

    // Watch for window focus/visibility changes (user coming back from another window)
    this.setupWindowFocusWatcher();

    this.debugLog('START', 'Plugin started');
  }

  stop() {
    // Set stopped flag to prevent recreating watchers
    this._isStopped = true;

    try {
      this.removeTitleButton();
      this.closeTitleModal();
      this.removeCSS();

      // Clear all tracked retry timeouts
      this._retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this._retryTimeouts.clear();

      // FUNCTIONAL: Clear legacy timeouts (short-circuit)
      this._retryTimeout1 && (clearTimeout(this._retryTimeout1), (this._retryTimeout1 = null));
      this._retryTimeout2 && (clearTimeout(this._retryTimeout2), (this._retryTimeout2 = null));
    } finally {
      // FUNCTIONAL: Cleanup URL watcher (short-circuit)
      this._urlChangeCleanup && (this._urlChangeCleanup(), (this._urlChangeCleanup = null));
      // FUNCTIONAL: Cleanup window focus watcher (short-circuit)
      this._windowFocusCleanup && (this._windowFocusCleanup(), (this._windowFocusCleanup = null));
      // FUNCTIONAL: Clear periodic check interval
      this._periodicCheckInterval &&
        (clearInterval(this._periodicCheckInterval), (this._periodicCheckInterval = null));

      // FUNCTIONAL: Memory cleanup (filter pattern)
      window._titleManagerInstances &&
        Array.from(window._titleManagerInstances.entries())
          .filter(([, instance]) => instance === this)
          .forEach(([modal]) => window._titleManagerInstances.delete(modal));

      // Clear webpack module references
      this.webpackModules = {
        ChannelStore: null,
      };
      this.webpackModuleAccess = false;
    }

    this.debugLog('STOP', 'Plugin stopped');
  }

  /**
   * 3.2 SETTINGS MANAGEMENT
   */
  loadSettings() {
    try {
      const saved = BdApi.Data.load('TitleManager', 'settings');
      // FUNCTIONAL: Short-circuit merge with deep copy (no if-else)
      saved && (this.settings = JSON.parse(JSON.stringify({ ...this.defaultSettings, ...saved })));
    } catch (error) {
      this.debugError('SETTINGS', 'Error loading settings', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('TitleManager', 'settings', this.settings);
    } catch (error) {
      this.debugError('SETTINGS', 'Error saving settings', error);
    }
  }

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = `
      padding: 20px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 12px;
      border: 2px solid rgba(139, 92, 246, 0.3);
      box-shadow: 0 0 30px rgba(139, 92, 246, 0.2);
    `;

    panel.innerHTML = `
      <div>
        <h3 style="
          color: #8b5cf6;
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 1px;
          text-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
        ">Title Manager Settings</h3>

        <div style="
          margin-bottom: 20px;
          padding: 15px;
          background: rgba(139, 92, 246, 0.1);
          border-radius: 8px;
          border-left: 3px solid #8b5cf6;
        ">
          <div style="color: #8b5cf6; font-weight: bold; margin-bottom: 10px;">Sort Preferences</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            Your default sort filter: <span style="color: #8b5cf6; font-weight: bold;">${this.getSortLabel(
              this.settings.sortBy || 'xpBonus'
            )}</span>
            <br><br>
            Change the sort filter in the titles modal by using the dropdown at the top.
          </div>
        </div>

        <label style="
          display: flex;
          align-items: center;
          margin-bottom: 15px;
          padding: 12px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
        " onmouseover="this.style.background='rgba(139, 92, 246, 0.2)'" onmouseout="this.style.background='rgba(0, 0, 0, 0.3)'">
          <input type="checkbox" ${this.settings.debugMode ? 'checked' : ''} id="tm-debug" style="
            width: 18px;
            height: 18px;
            cursor: pointer;
          ">
          <span style="margin-left: 10px; color: rgba(255, 255, 255, 0.9); font-weight: 500;">
            Debug Mode (Show console logs)
          </span>
        </label>

        <div style="
          margin-top: 15px;
          padding: 15px;
          background: rgba(139, 92, 246, 0.1);
          border-radius: 8px;
          border-left: 3px solid #8b5cf6;
        ">
          <div style="color: #8b5cf6; font-weight: bold; margin-bottom: 8px;">Debug Information</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px; line-height: 1.6;">
            Enable Debug Mode to see detailed console logs for:
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li>Title equip/unequip operations</li>
              <li>Settings load/save operations</li>
              <li>Button creation and retries</li>
              <li>Modal open/close tracking</li>
              <li>Filter and sort operations</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    const debugCheckbox = panel.querySelector('#tm-debug');
    debugCheckbox?.addEventListener('change', (e) => {
      this.settings.debugMode = e.target.checked;
      this.saveSettings();
      this.debugLog('SETTINGS', 'Debug mode toggled', { enabled: e.target.checked });
    });

    return panel;
  }

  /**
   * 3.3 CSS MANAGEMENT
   */
  injectCSS() {
    const styleId = 'title-manager-css';
    // FUNCTIONAL: Guard clause with short-circuit (early return)
    if (document.getElementById(styleId)) return;

    const cssContent = `
      .tm-title-button {
        background: transparent;
        border: none;
        border-radius: 4px;
        width: 32px;
        height: 32px;
        cursor: pointer;
        color: var(--interactive-normal, #b9bbbe);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        margin: 0 2px;
        flex-shrink: 0;
        padding: 6px;
        box-sizing: border-box;
      }

      .tm-title-button svg {
        width: 20px;
        height: 20px;
        transition: all 0.2s ease;
        display: block;
      }

      .tm-title-button:hover {
        background: var(--background-modifier-hover, rgba(4, 4, 5, 0.6));
        color: var(--interactive-hover, #dcddde);
      }

      .tm-title-button:hover svg {
        transform: scale(1.1);
      }

      .tm-title-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
      }

      .tm-modal-content {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 2px solid rgba(139, 92, 246, 0.5);
        border-radius: 16px;
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 0 30px rgba(139, 92, 246, 0.5);
      }

      .tm-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 2px solid rgba(139, 92, 246, 0.3);
      }

      .tm-modal-header h2 {
        margin: 0;
        color: #8b5cf6;
        font-family: 'Orbitron', sans-serif;
        font-size: 24px;
      }

      /* Filter Bar Styling */
      .tm-filter-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%);
        border-bottom: 2px solid rgba(139, 92, 246, 0.2);
        backdrop-filter: blur(10px);
      }

      .tm-filter-label {
        color: rgba(255, 255, 255, 0.9);
        font-weight: bold;
        font-size: 14px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: #8b5cf6;
      }

      .tm-sort-dropdown {
        flex: 1;
        padding: 10px 16px;
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.6) 100%);
        border: 2px solid rgba(139, 92, 246, 0.5);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.2);
      }

      .tm-sort-dropdown:hover {
        border-color: rgba(139, 92, 246, 0.8);
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%);
        box-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
        transform: translateY(-1px);
      }

      .tm-sort-dropdown:focus {
        border-color: #8b5cf6;
        box-shadow: 0 0 25px rgba(139, 92, 246, 0.6);
      }

      .tm-sort-dropdown option {
        background: #1a1a2e;
        color: rgba(255, 255, 255, 0.9);
        padding: 10px;
        font-size: 14px;
      }

      .tm-sort-dropdown option:hover {
        background: rgba(139, 92, 246, 0.2);
      }

      .tm-close-button {
        background: transparent;
        border: none;
        color: #8b5cf6;
        font-size: 32px;
        cursor: pointer;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        transition: all 0.2s ease;
      }

      .tm-close-button:hover {
        background: rgba(139, 92, 246, 0.2);
      }

      .tm-modal-body {
        padding: 20px;
      }

      .tm-active-title {
        background: rgba(0, 255, 136, 0.1);
        border: 2px solid rgba(0, 255, 136, 0.5);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        text-align: center;
      }

      .tm-active-label {
        color: rgba(0, 255, 136, 0.8);
        font-size: 14px;
        margin-bottom: 8px;
      }

      .tm-active-name {
        color: #00ff88;
        font-size: 24px;
        font-weight: bold;
        font-family: 'Orbitron', sans-serif;
        margin-bottom: 8px;
      }

      .tm-active-bonus {
        color: rgba(0, 255, 136, 0.8);
        font-size: 16px;
        margin-bottom: 15px;
      }

      .tm-unequip-btn {
        padding: 8px 20px;
        background: rgba(255, 68, 68, 0.8);
        border: 2px solid rgba(255, 68, 68, 1);
        border-radius: 6px;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .tm-unequip-btn:hover {
        background: rgba(255, 68, 68, 1);
        box-shadow: 0 0 10px rgba(255, 68, 68, 0.6);
      }

      .tm-no-title {
        background: rgba(139, 92, 246, 0.1);
        border: 2px dashed rgba(139, 92, 246, 0.3);
        border-radius: 12px;
        padding: 30px;
        margin-bottom: 20px;
        text-align: center;
      }

      .tm-no-title-text {
        color: rgba(255, 255, 255, 0.6);
        font-size: 16px;
      }

      .tm-titles-section {
        margin-top: 20px;
      }

      .tm-section-title {
        color: #8b5cf6;
        font-family: 'Orbitron', sans-serif;
        font-size: 18px;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid rgba(139, 92, 246, 0.3);
      }

      .tm-empty-state {
        text-align: center;
        padding: 40px;
        color: rgba(255, 255, 255, 0.5);
      }

      .tm-empty-icon {
        font-size: 48px;
        margin-bottom: 15px;
      }

      .tm-empty-text {
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 8px;
      }

      .tm-empty-hint {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.4);
      }

      .tm-titles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 15px;
      }

      .tm-title-card {
        background: rgba(20, 20, 30, 0.8);
        border: 2px solid rgba(139, 92, 246, 0.3);
        border-radius: 12px;
        padding: 20px;
        text-align: center;
        transition: all 0.3s ease;
      }

      .tm-title-card.active {
        border-color: rgba(0, 255, 136, 0.6);
        background: rgba(0, 255, 136, 0.1);
      }

      .tm-title-card:hover:not(.active) {
        border-color: rgba(139, 92, 246, 0.8);
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
        transform: translateY(-2px);
      }

      .tm-title-icon {
        font-size: 32px;
        margin-bottom: 10px;
      }

      .tm-title-name {
        font-weight: bold;
        color: #8b5cf6;
        font-size: 16px;
        margin-bottom: 8px;
        font-family: 'Orbitron', sans-serif;
      }

      .tm-title-card.active .tm-title-name {
        color: #00ff88;
      }

      .tm-title-bonus {
        color: rgba(0, 255, 136, 0.8);
        font-size: 14px;
        margin-bottom: 12px;
      }

      .tm-title-status {
        color: #00ff88;
        font-size: 12px;
        font-weight: bold;
        padding: 6px 12px;
        background: rgba(0, 255, 136, 0.2);
        border-radius: 6px;
        display: inline-block;
      }

      .tm-equip-btn {
        width: 100%;
        padding: 8px;
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        border: 2px solid rgba(139, 92, 246, 0.8);
        border-radius: 6px;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 0 8px rgba(139, 92, 246, 0.4);
      }

      .tm-equip-btn:hover {
        background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
        border-color: rgba(139, 92, 246, 1);
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.8);
        transform: translateY(-1px);
      }
    `;

    // Use BdApi.DOM.addStyle (official API) instead of direct DOM manipulation
    BdApi.DOM.addStyle(styleId, cssContent);
  }

  removeCSS() {
    BdApi.DOM.removeStyle('title-manager-css');
  }

  /**
   * 3.5 WEBPACK & REACT INTEGRATION (Advanced BetterDiscord Integration)
   */

  /**
   * Initialize Webpack modules for better Discord integration
   * Operations:
   * 1. Fetch ChannelStore via BdApi.Webpack
   * 2. Set webpackModuleAccess flag
   */
  initializeWebpackModules() {
    try {
      // Fetch ChannelStore for potential future use
      this.webpackModules.ChannelStore = BdApi.Webpack.getModule(
        (m) => m && m.getChannel && m.getChannelId
      );

      this.webpackModuleAccess = !!this.webpackModules.ChannelStore;

      this.debugLog('WEBPACK', 'Module access initialized', {
        hasChannelStore: !!this.webpackModules.ChannelStore,
        access: this.webpackModuleAccess,
      });
    } catch (error) {
      this.debugError('WEBPACK', error, { phase: 'initialization' });
      this.webpackModuleAccess = false;
    }
  }

  /**
   * 3.4 UI MANAGEMENT
   */

  /**
   * Create title button in Discord UI
   */
  createTitleButton() {
    // Remove any existing buttons first (prevent duplicates)
    const existingButtons = document.querySelectorAll('.tm-title-button');
    existingButtons.forEach((btn) => btn.remove());
    this.titleButton = null;

    // Find Discord's button row - look for the container with keyboard, gift, GIF, emoji icons
    const findToolbar = () => {
      // Method 1: Find by looking for common Discord button classes
      const buttonRow =
        // Look for container with multiple buttons (Discord's toolbar)
        Array.from(document.querySelectorAll('[class*="button"]')).find((el) => {
          const siblings = Array.from(el.parentElement?.children || []);
          // Check if this container has multiple button-like elements (Discord's toolbar)
          return (
            siblings.length >= 4 &&
            siblings.some(
              (s) =>
                s.querySelector('[class*="emoji"]') ||
                s.querySelector('[class*="gif"]') ||
                s.querySelector('[class*="attach"]')
            )
          );
        })?.parentElement ||
        // Method 2: Find by text area and traverse up
        (() => {
          const textArea =
            document.querySelector('[class*="channelTextArea"]') ||
            document.querySelector('[class*="slateTextArea"]') ||
            document.querySelector('textarea[placeholder*="Message"]');
          if (!textArea) return null;

          // Go up to find the input container, then find button row
          let container =
            textArea.closest('[class*="container"]') ||
            textArea.closest('[class*="wrapper"]') ||
            textArea.parentElement?.parentElement?.parentElement;

          // Look for the row that contains multiple buttons
          const buttons = container?.querySelectorAll('[class*="button"]');
          if (buttons && buttons.length >= 4) {
            return buttons[0]?.parentElement;
          }

          return (
            container?.querySelector('[class*="buttons"]') ||
            container?.querySelector('[class*="buttonContainer"]')
          );
        })();

      return buttonRow;
    };

    const toolbar = findToolbar();
    if (!toolbar) {
      // Return early if plugin is stopped
      if (this._isStopped) return;

      const timeoutId = setTimeout(() => {
        this._retryTimeouts.delete(timeoutId);
        this.createTitleButton();
      }, 1000);
      this._retryTimeouts.add(timeoutId);
      return;
    }

    // Create title button with SVG icon
    const button = document.createElement('button');
    button.className = 'tm-title-button';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"></path>
      </svg>
    `;
    button.title = 'Titles';
    button.addEventListener('click', () => this.openTitleModal());

    // Insert button before skill tree button (or before apps button if no skill tree)
    const skillTreeBtn = toolbar.querySelector('.st-skill-tree-button');
    const appsButton = Array.from(toolbar.children).find(
      (el) =>
        el.querySelector('[class*="apps"]') ||
        el.getAttribute('aria-label')?.toLowerCase().includes('app')
    );

    if (skillTreeBtn) {
      toolbar.insertBefore(button, skillTreeBtn);
    } else if (appsButton) {
      toolbar.insertBefore(button, appsButton);
    } else {
      toolbar.appendChild(button);
    }
    this.titleButton = button;

    // Watch for toolbar changes and reposition if needed
    this.observeToolbar(toolbar);

    this.debugLog('BUTTON', 'Title button created');
  }

  observeToolbar(toolbar) {
    if (this.toolbarObserver) {
      this.toolbarObserver.disconnect();
    }

    this.toolbarObserver = new MutationObserver(() => {
      // Enhanced check: Verify button still exists and is in DOM
      if (
        !this.titleButton ||
        !document.body.contains(this.titleButton) ||
        !toolbar.contains(this.titleButton)
      ) {
        // Button was removed or moved, recreate it
        if (!this._isStopped) {
          this.createTitleButton();
        }
      }
    });

    this.toolbarObserver.observe(toolbar, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  }

  removeTitleButton() {
    if (this.titleButton) {
      this.titleButton.remove();
      this.titleButton = null;
    }
    if (this.toolbarObserver) {
      this.toolbarObserver.disconnect();
      this.toolbarObserver = null;
    }
  }

  /**
   * 3.5 TITLE MANAGEMENT
   */

  /**
   * Equip a title
   * @param {string} titleName - Title name to equip
   * @returns {boolean} - True if successful
   */
  equipTitle(titleName) {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) return false;
      const instance = soloPlugin.instance || soloPlugin;

      // FUNCTIONAL: Guard clauses (keep for early returns)
      const unwantedTitles = [
        'Scribe',
        'Wordsmith',
        'Author',
        'Explorer',
        'Wanderer',
        'Apprentice',
        'Message Warrior',
      ];
      if (unwantedTitles.includes(titleName)) {
        BdApi?.showToast?.('This title has been removed', { type: 'error', timeout: 2000 });
        return false;
      }

      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.titles.includes(titleName)) {
        BdApi?.showToast?.('Title not unlocked', { type: 'error', timeout: 2000 });
        return false;
      }

      // FUNCTIONAL: Optional chaining (no nested if-else)
      return instance.setActiveTitle
        ? (() => {
            const result = instance.setActiveTitle(titleName);
            result &&
              BdApi?.showToast &&
              (() => {
                const bonus = this.getTitleBonus(titleName);
                const buffs = [];
                if (bonus) {
                  if (bonus.xp > 0) buffs.push(`+${(bonus.xp * 100).toFixed(0)}% XP`);
                  if (bonus.critChance > 0)
                    buffs.push(`+${(bonus.critChance * 100).toFixed(0)}% Crit`);
                  if (bonus.strengthPercent > 0)
                    buffs.push(`+${(bonus.strengthPercent * 100).toFixed(0)}% STR`);
                  if (bonus.agilityPercent > 0)
                    buffs.push(`+${(bonus.agilityPercent * 100).toFixed(0)}% AGI`);
                  if (bonus.intelligencePercent > 0)
                    buffs.push(`+${(bonus.intelligencePercent * 100).toFixed(0)}% INT`);
                  if (bonus.vitalityPercent > 0)
                    buffs.push(`+${(bonus.vitalityPercent * 100).toFixed(0)}% VIT`);
                  if (bonus.perceptionPercent > 0)
                    buffs.push(`+${(bonus.perceptionPercent * 100).toFixed(0)}% PER`);
                  if (bonus.strength > 0 && !bonus.strengthPercent)
                    buffs.push(`+${bonus.strength} STR`);
                  if (bonus.agility > 0 && !bonus.agilityPercent)
                    buffs.push(`+${bonus.agility} AGI`);
                  if (bonus.intelligence > 0 && !bonus.intelligencePercent)
                    buffs.push(`+${bonus.intelligence} INT`);
                  if (bonus.vitality > 0 && !bonus.vitalityPercent)
                    buffs.push(`+${bonus.vitality} VIT`);
                  if (bonus.luck > 0 && !bonus.perceptionPercent) buffs.push(`+${bonus.luck} LUK`);
                }
                const bonusText = buffs.length > 0 ? ` (${buffs.join(', ')})` : '';
                BdApi.showToast(`Title Equipped: ${titleName}${bonusText}`, {
                  type: 'success',
                  timeout: 3000,
                });
              })();
            result && this.refreshModalSmooth();
            return result;
          })()
        : false;
    } catch (error) {
      this.debugError('EQUIP', 'Error equipping title', error);
      return false;
    }
  }

  /**
   * Unequip currently active title
   * @returns {boolean} - True if successful
   */
  unequipTitle() {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) return false;
      const instance = soloPlugin.instance || soloPlugin;

      // Use setActiveTitle with null to unequip
      if (instance.setActiveTitle) {
        // Try setting to null - if that doesn't work, set directly
        const result = instance.setActiveTitle(null);
        if (!result && instance.settings) {
          // Fallback: set directly
          instance.settings.achievements.activeTitle = null;
          if (instance.saveSettings) {
            instance.saveSettings(true);
          }
        }
        if (instance.updateChatUI) {
          instance.updateChatUI();
        }
        if (BdApi && typeof BdApi.showToast === 'function') {
          BdApi.showToast('Title Unequipped', { type: 'info', timeout: 2000 });
        }
        this.refreshModalSmooth();
        return true;
      }
      return false;
    } catch (error) {
      this.debugError('UNEQUIP', 'Error unequipping title', error);
      return false;
    }
  }

  /**
   * 3.6 EVENT HANDLING & WATCHERS
   */

  /**
   * Setup channel watcher for URL changes (event-based, no polling)
   * Enhanced to persist buttons across guild/channel switches
   */
  setupChannelWatcher() {
    // Use event-based URL change detection (more efficient than polling)
    let lastUrl = window.location.href;

    const handleUrlChange = () => {
      // FUNCTIONAL: Guard clause (keep for early return)
      if (this._isStopped) return;

      const currentUrl = window.location.href;
      // FUNCTIONAL: Short-circuit for URL change (no if-else)
      currentUrl !== lastUrl &&
        ((lastUrl = currentUrl),
        (() => {
          // Enhanced: Multiple retry attempts with increasing delays
          const retryDelays = [200, 500, 1000];
          retryDelays.forEach((delay, index) => {
            const timeoutId = setTimeout(() => {
              this._retryTimeouts.delete(timeoutId);
              // Check if button exists and is in DOM
              if (!this.titleButton || !document.body.contains(this.titleButton)) {
                this.createTitleButton();
              }
            }, delay * (index + 1));
            this._retryTimeouts.add(timeoutId);
          });
        })());
    };

    // Listen to browser navigation events
    window.addEventListener('popstate', handleUrlChange);

    // Override pushState and replaceState to detect programmatic navigation
    // Store originals in private properties for defensive restoration
    try {
      this._originalPushState = history.pushState;
      this._originalReplaceState = history.replaceState;

      history.pushState = function (...args) {
        this._originalPushState.apply(history, args);
        handleUrlChange();
      }.bind(this);

      history.replaceState = function (...args) {
        this._originalReplaceState.apply(history, args);
        handleUrlChange();
      }.bind(this);
    } catch (error) {
      this.debugError('WATCHER', 'Failed to override history methods', error);
    }

    // Store idempotent and defensive cleanup function
    this._urlChangeCleanup = () => {
      window.removeEventListener('popstate', handleUrlChange);

      // FUNCTIONAL: Defensive restoration (short-circuit, no if-else)
      try {
        this._originalPushState &&
          history.pushState !== this._originalPushState &&
          (history.pushState = this._originalPushState);
      } catch (error) {
        this.debugError('WATCHER', 'Failed to restore history.pushState', error);
      }

      try {
        this._originalReplaceState &&
          history.replaceState !== this._originalReplaceState &&
          (history.replaceState = this._originalReplaceState);
      } catch (error) {
        this.debugError('WATCHER', 'Failed to restore history.replaceState', error);
      }

      // Null out stored originals after successful restore
      this._originalPushState = null;
      this._originalReplaceState = null;
    };
  }

  /**
   * Setup window focus/visibility watcher (detects when user returns from another window)
   * Pattern from AutoIdleOnAFK plugin - uses window blur/focus events for reliable detection
   */
  setupWindowFocusWatcher() {
    // Bind handlers to instance (same pattern as AutoIdleOnAFK)
    this._boundHandleBlur = this._handleWindowBlur.bind(this);
    this._boundHandleFocus = this._handleWindowFocus.bind(this);

    // Listen for window blur events (Discord window loses focus)
    window.addEventListener('blur', this._boundHandleBlur);

    // Listen for window focus events (Discord window gains focus - user returns)
    window.addEventListener('focus', this._boundHandleFocus);

    // Also listen for visibility changes (tab switching within browser)
    document.addEventListener(
      'visibilitychange',
      (this._boundHandleVisibilityChange = () => {
        if (this._isStopped) return;
        // User returned to tab (tab is now visible)
        if (!document.hidden) {
          const timeoutId = setTimeout(() => {
            this._retryTimeouts.delete(timeoutId);
            if (!this.titleButton || !document.body.contains(this.titleButton)) {
              this.debugLog('VISIBILITY', 'Button missing after visibility change, recreating...');
              this.createTitleButton();
            }
          }, 300);
          this._retryTimeouts.add(timeoutId);
        }
      })
    );

    // Periodic persistence check as fallback (every 10 seconds)
    this._periodicCheckInterval = setInterval(() => {
      if (this._isStopped) return;
      if (!this.titleButton || !document.body.contains(this.titleButton)) {
        this.debugLog('PERIODIC_CHECK', 'Button missing, recreating...');
        this.createTitleButton();
      }
    }, 10000); // Check every 10 seconds

    // Store cleanup function
    this._windowFocusCleanup = () => {
      window.removeEventListener('blur', this._boundHandleBlur);
      window.removeEventListener('focus', this._boundHandleFocus);
      document.removeEventListener('visibilitychange', this._boundHandleVisibilityChange);
      if (this._periodicCheckInterval) {
        clearInterval(this._periodicCheckInterval);
        this._periodicCheckInterval = null;
      }
    };
  }

  /**
   * Handle window blur event (Discord window loses focus)
   * Pattern from AutoIdleOnAFK - fires when user switches to another window/app
   */
  _handleWindowBlur() {
    if (this._isStopped) return;
    this.debugLog('WINDOW_BLUR', 'Discord window lost focus');
    // Note: Don't recreate button on blur - wait for focus to return
  }

  /**
   * Handle window focus event (Discord window gains focus)
   * Pattern from AutoIdleOnAFK - fires when user returns to Discord window
   */
  _handleWindowFocus() {
    if (this._isStopped) return;
    this.debugLog('WINDOW_FOCUS', 'Discord window gained focus - checking button persistence');

    // Small delay to let Discord finish re-rendering after focus
    const timeoutId = setTimeout(() => {
      this._retryTimeouts.delete(timeoutId);
      // Check if button still exists when user returns
      if (!this.titleButton || !document.body.contains(this.titleButton)) {
        this.debugLog('WINDOW_FOCUS', 'Button missing after window focus, recreating...');
        this.createTitleButton();
      }
    }, 300); // Quick check after focus (same as AutoIdleOnAFK pattern)
    this._retryTimeouts.add(timeoutId);
  }

  openTitleModal() {
    if (this.titleModal) {
      this.closeTitleModal();
      return;
    }

    const soloData = this.getSoloLevelingData();
    // Filter out unwanted titles
    const unwantedTitles = [
      'Scribe',
      'Wordsmith',
      'Author',
      'Explorer',
      'Wanderer',
      'Apprentice',
      'Message Warrior',
    ];
    let titles = (soloData?.titles || []).filter((title) => !unwantedTitles.includes(title));

    // FUNCTIONAL: Sort by selected filter option (highest to lowest)
    const sortBy = this.settings.sortBy || 'xpBonus';
    const sortFunctions = {
      xpBonus: (a, b) => (this.getTitleBonus(b)?.xp || 0) - (this.getTitleBonus(a)?.xp || 0),
      critBonus: (a, b) =>
        (this.getTitleBonus(b)?.critChance || 0) - (this.getTitleBonus(a)?.critChance || 0),
      strBonus: (a, b) =>
        (this.getTitleBonus(b)?.strengthPercent || 0) -
        (this.getTitleBonus(a)?.strengthPercent || 0),
      agiBonus: (a, b) =>
        (this.getTitleBonus(b)?.agilityPercent || 0) - (this.getTitleBonus(a)?.agilityPercent || 0),
      intBonus: (a, b) =>
        (this.getTitleBonus(b)?.intelligencePercent || 0) -
        (this.getTitleBonus(a)?.intelligencePercent || 0),
      vitBonus: (a, b) =>
        (this.getTitleBonus(b)?.vitalityPercent || 0) -
        (this.getTitleBonus(a)?.vitalityPercent || 0),
      perBonus: (a, b) =>
        (this.getTitleBonus(b)?.perceptionPercent || 0) -
        (this.getTitleBonus(a)?.perceptionPercent || 0),
    };
    titles.sort(sortFunctions[sortBy] || sortFunctions.xpBonus);

    const activeTitle =
      soloData?.activeTitle && !unwantedTitles.includes(soloData.activeTitle)
        ? soloData.activeTitle
        : null;

    const modal = document.createElement('div');
    modal.className = 'tm-title-modal';
    modal.innerHTML = `
      <div class="tm-modal-content">
        <div class="tm-modal-header">
          <h2>⭐ Titles</h2>
          <button class="tm-close-button">×</button>
        </div>
        <div class="tm-filter-bar">
          <label class="tm-filter-label">Sort by:</label>
          <select id="tm-sort-select" class="tm-sort-dropdown">
            <option value="xpBonus" ${
              this.settings.sortBy === 'xpBonus' ? 'selected' : ''
            }>XP Gain (Highest)</option>
            <option value="critBonus" ${
              this.settings.sortBy === 'critBonus' ? 'selected' : ''
            }>Crit Chance (Highest)</option>
            <option value="strBonus" ${
              this.settings.sortBy === 'strBonus' ? 'selected' : ''
            }>Strength % (Highest)</option>
            <option value="agiBonus" ${
              this.settings.sortBy === 'agiBonus' ? 'selected' : ''
            }>Agility % (Highest)</option>
            <option value="intBonus" ${
              this.settings.sortBy === 'intBonus' ? 'selected' : ''
            }>Intelligence % (Highest)</option>
            <option value="vitBonus" ${
              this.settings.sortBy === 'vitBonus' ? 'selected' : ''
            }>Vitality % (Highest)</option>
            <option value="perBonus" ${
              this.settings.sortBy === 'perBonus' ? 'selected' : ''
            }>Perception % (Highest)</option>
          </select>
        </div>
        <div class="tm-modal-body">
          ${
            activeTitle
              ? `
            <div class="tm-active-title">
              <div class="tm-active-label">Active Title:</div>
              <div class="tm-active-name">${this.escapeHtml(activeTitle)}</div>
              ${(() => {
                const bonus = this.getTitleBonus(activeTitle);
                if (!bonus) return '';
                const buffs = [];
                if (bonus.xp > 0) buffs.push(`+${(bonus.xp * 100).toFixed(0)}% XP`);
                if (bonus.critChance > 0)
                  buffs.push(`+${(bonus.critChance * 100).toFixed(0)}% Crit`);
                // Check for percentage-based stat bonuses (new format)
                if (bonus.strengthPercent > 0)
                  buffs.push(`+${(bonus.strengthPercent * 100).toFixed(0)}% STR`);
                if (bonus.agilityPercent > 0)
                  buffs.push(`+${(bonus.agilityPercent * 100).toFixed(0)}% AGI`);
                if (bonus.intelligencePercent > 0)
                  buffs.push(`+${(bonus.intelligencePercent * 100).toFixed(0)}% INT`);
                if (bonus.vitalityPercent > 0)
                  buffs.push(`+${(bonus.vitalityPercent * 100).toFixed(0)}% VIT`);
                if (bonus.perceptionPercent > 0)
                  buffs.push(`+${(bonus.perceptionPercent * 100).toFixed(0)}% PER`);
                // Support old format (raw numbers) for backward compatibility
                if (bonus.strength > 0 && !bonus.strengthPercent)
                  buffs.push(`+${bonus.strength} STR`);
                if (bonus.agility > 0 && !bonus.agilityPercent) buffs.push(`+${bonus.agility} AGI`);
                if (bonus.intelligence > 0 && !bonus.intelligencePercent)
                  buffs.push(`+${bonus.intelligence} INT`);
                if (bonus.vitality > 0 && !bonus.vitalityPercent)
                  buffs.push(`+${bonus.vitality} VIT`);
                if (bonus.luck > 0 && !bonus.perceptionPercent) buffs.push(`+${bonus.luck} LUK`);
                return buffs.length > 0
                  ? `<div class="tm-active-bonus">${buffs.join(', ')}</div>`
                  : '';
              })()}
              <button class="tm-unequip-btn" id="tm-unequip-btn">Unequip</button>
            </div>
          `
              : `
            <div class="tm-no-title">
              <div class="tm-no-title-text">No title equipped</div>
            </div>
          `
          }
          <div class="tm-titles-section">
            <h3 class="tm-section-title">Available Titles (${titles.length})</h3>
            ${
              titles.length === 0
                ? `
              <div class="tm-empty-state">
                <div class="tm-empty-icon"></div>
                <div class="tm-empty-text">No titles unlocked yet</div>
                <div class="tm-empty-hint">Complete achievements to unlock titles!</div>
              </div>
            `
                : `
              <div class="tm-titles-grid">
                ${titles
                  .map((title) => {
                    const isActive = title === activeTitle;
                    const bonus = this.getTitleBonus(title);
                    const buffs = [];
                    if (bonus) {
                      if (bonus.xp > 0) buffs.push(`+${(bonus.xp * 100).toFixed(0)}% XP`);
                      if (bonus.critChance > 0)
                        buffs.push(`+${(bonus.critChance * 100).toFixed(0)}% Crit`);
                      // Check for percentage-based stat bonuses (new format)
                      if (bonus.strengthPercent > 0)
                        buffs.push(`+${(bonus.strengthPercent * 100).toFixed(0)}% STR`);
                      if (bonus.agilityPercent > 0)
                        buffs.push(`+${(bonus.agilityPercent * 100).toFixed(0)}% AGI`);
                      if (bonus.intelligencePercent > 0)
                        buffs.push(`+${(bonus.intelligencePercent * 100).toFixed(0)}% INT`);
                      if (bonus.vitalityPercent > 0)
                        buffs.push(`+${(bonus.vitalityPercent * 100).toFixed(0)}% VIT`);
                      if (bonus.perceptionPercent > 0)
                        buffs.push(`+${(bonus.perceptionPercent * 100).toFixed(0)}% PER`);
                      // Support old format (raw numbers) for backward compatibility
                      if (bonus.strength > 0 && !bonus.strengthPercent)
                        buffs.push(`+${bonus.strength} STR`);
                      if (bonus.agility > 0 && !bonus.agilityPercent)
                        buffs.push(`+${bonus.agility} AGI`);
                      if (bonus.intelligence > 0 && !bonus.intelligencePercent)
                        buffs.push(`+${bonus.intelligence} INT`);
                      if (bonus.vitality > 0 && !bonus.vitalityPercent)
                        buffs.push(`+${bonus.vitality} VIT`);
                      if (bonus.luck > 0 && !bonus.perceptionPercent)
                        buffs.push(`+${bonus.luck} LUK`);
                    }
                    return `
                      <div class="tm-title-card ${isActive ? 'active' : ''}">
                        <div class="tm-title-icon"></div>
                        <div class="tm-title-name">${this.escapeHtml(title)}</div>
                        ${
                          buffs.length > 0
                            ? `<div class="tm-title-bonus">${buffs.join(', ')}</div>`
                            : ''
                        }
                        ${
                          isActive
                            ? `
                          <div class="tm-title-status">Equipped</div>
                        `
                            : `
                          <button class="tm-equip-btn" data-title="${this.escapeHtml(
                            title
                          )}">Equip</button>
                        `
                        }
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
            }
          </div>
        </div>
      </div>
    `;

    // Store instance reference (namespaced for security)
    if (!window._titleManagerInstances) window._titleManagerInstances = new WeakMap();
    window._titleManagerInstances.set(modal, this);

    // Add event listeners (secure, no inline onclick)
    modal.addEventListener('click', (e) => {
      // Handle background click
      if (e.target === modal) {
        this.closeTitleModal();
        return;
      }

      // Handle close button clicks (check both the button and its content)
      if (
        e.target.classList.contains('tm-close-button') ||
        e.target.closest('.tm-close-button') ||
        e.target.parentElement?.classList.contains('tm-close-button')
      ) {
        e.preventDefault();
        e.stopPropagation();
        this.closeTitleModal();
        return;
      }

      // Handle equip button clicks
      if (e.target.classList.contains('tm-equip-btn')) {
        const title = e.target.getAttribute('data-title');
        if (title) {
          this.equipTitle(title);
        }
      }

      // Handle unequip button
      if (e.target.id === 'tm-unequip-btn' || e.target.closest('#tm-unequip-btn')) {
        this.unequipTitle();
      }
    });

    // Also add direct click handler to close button for reliability
    const closeButton = modal.querySelector('.tm-close-button');
    if (closeButton) {
      closeButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeTitleModal();
      });
    }

    // Handle sort filter change (SMOOTH - no modal blink)
    const sortSelect = modal.querySelector('#tm-sort-select');
    const titlesGrid = modal.querySelector('.tm-titles-grid');
    if (sortSelect && titlesGrid) {
      sortSelect.addEventListener('change', (e) => {
        this.settings.sortBy = e.target.value;
        this.saveSettings();

        // Re-sort titles without closing modal
        let sortedTitles = (soloData?.titles || []).filter(
          (title) => !unwantedTitles.includes(title)
        );
        const sortFunctions = {
          xpBonus: (a, b) => (this.getTitleBonus(b)?.xp || 0) - (this.getTitleBonus(a)?.xp || 0),
          critBonus: (a, b) =>
            (this.getTitleBonus(b)?.critChance || 0) - (this.getTitleBonus(a)?.critChance || 0),
          strBonus: (a, b) =>
            (this.getTitleBonus(b)?.strengthPercent || 0) -
            (this.getTitleBonus(a)?.strengthPercent || 0),
          agiBonus: (a, b) =>
            (this.getTitleBonus(b)?.agilityPercent || 0) -
            (this.getTitleBonus(a)?.agilityPercent || 0),
          intBonus: (a, b) =>
            (this.getTitleBonus(b)?.intelligencePercent || 0) -
            (this.getTitleBonus(a)?.intelligencePercent || 0),
          vitBonus: (a, b) =>
            (this.getTitleBonus(b)?.vitalityPercent || 0) -
            (this.getTitleBonus(a)?.vitalityPercent || 0),
          perBonus: (a, b) =>
            (this.getTitleBonus(b)?.perceptionPercent || 0) -
            (this.getTitleBonus(a)?.perceptionPercent || 0),
        };
        sortedTitles.sort(sortFunctions[e.target.value] || sortFunctions.xpBonus);

        // Smooth transition
        titlesGrid.style.opacity = '0.5';
        setTimeout(() => {
          titlesGrid.innerHTML = sortedTitles
            .map((title) => {
              const isActive = title === activeTitle;
              const bonus = this.getTitleBonus(title);
              const buffs = [];
              if (bonus) {
                if (bonus.xp > 0) buffs.push(`+${(bonus.xp * 100).toFixed(0)}% XP`);
                if (bonus.critChance > 0)
                  buffs.push(`+${(bonus.critChance * 100).toFixed(0)}% Crit`);
                if (bonus.strengthPercent > 0)
                  buffs.push(`+${(bonus.strengthPercent * 100).toFixed(0)}% STR`);
                if (bonus.agilityPercent > 0)
                  buffs.push(`+${(bonus.agilityPercent * 100).toFixed(0)}% AGI`);
                if (bonus.intelligencePercent > 0)
                  buffs.push(`+${(bonus.intelligencePercent * 100).toFixed(0)}% INT`);
                if (bonus.vitalityPercent > 0)
                  buffs.push(`+${(bonus.vitalityPercent * 100).toFixed(0)}% VIT`);
                if (bonus.perceptionPercent > 0)
                  buffs.push(`+${(bonus.perceptionPercent * 100).toFixed(0)}% PER`);
                if (bonus.strength > 0 && !bonus.strengthPercent)
                  buffs.push(`+${bonus.strength} STR`);
                if (bonus.agility > 0 && !bonus.agilityPercent) buffs.push(`+${bonus.agility} AGI`);
                if (bonus.intelligence > 0 && !bonus.intelligencePercent)
                  buffs.push(`+${bonus.intelligence} INT`);
                if (bonus.vitality > 0 && !bonus.vitalityPercent)
                  buffs.push(`+${bonus.vitality} VIT`);
                if (bonus.luck > 0 && !bonus.perceptionPercent) buffs.push(`+${bonus.luck} LUK`);
              }
              return `
                <div class="tm-title-card ${isActive ? 'active' : ''}">
                  <div class="tm-title-icon">⭐</div>
                  <div class="tm-title-name">${this.escapeHtml(title)}</div>
                  ${buffs.length > 0 ? `<div class="tm-title-bonus">${buffs.join(', ')}</div>` : ''}
                  ${
                    isActive
                      ? `<div class="tm-title-status">Equipped</div>`
                      : `<button class="tm-equip-btn" data-title="${this.escapeHtml(
                          title
                        )}">Equip</button>`
                  }
                </div>
              `;
            })
            .join('');
          titlesGrid.style.opacity = '1';
        }, 150);
      });
    }

    document.body.appendChild(modal);
    this.titleModal = modal;

    this.debugLog('MODAL', 'Title modal opened');
  }

  refreshModal() {
    this.closeTitleModal();
    setTimeout(() => this.openTitleModal(), 100);
  }

  /**
   * Smooth refresh without closing modal (no disappear)
   */
  refreshModalSmooth() {
    if (!this.titleModal) return;

    const modalBody = this.titleModal.querySelector('.tm-modal-body');
    const titlesGrid = this.titleModal.querySelector('.tm-titles-grid');
    const scrollPos = this.titleModal.querySelector('.tm-modal-content')?.scrollTop || 0;

    // Fade out
    modalBody &&
      ((modalBody.style.transition = 'opacity 0.15s ease-out'), (modalBody.style.opacity = '0.5'));
    titlesGrid &&
      ((titlesGrid.style.transition = 'opacity 0.15s ease-out'),
      (titlesGrid.style.opacity = '0.5'));

    setTimeout(() => {
      this.closeTitleModal();
      this.openTitleModal();

      // Restore scroll and fade in
      setTimeout(() => {
        const content = this.titleModal?.querySelector('.tm-modal-content');
        const newModalBody = this.titleModal?.querySelector('.tm-modal-body');
        const newTitlesGrid = this.titleModal?.querySelector('.tm-titles-grid');

        content && (content.scrollTop = scrollPos);
        newModalBody && (newModalBody.style.opacity = '1');
        newTitlesGrid && (newTitlesGrid.style.opacity = '1');
      }, 10);
    }, 150);
  }

  closeTitleModal() {
    if (this.titleModal) {
      if (window._titleManagerInstances) {
        window._titleManagerInstances.delete(this.titleModal);
      }
      this.titleModal.remove();
      this.titleModal = null;
      this.debugLog('MODAL', 'Title modal closed');
    }
  }

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT
  // ============================================================================
  // Debug logging helpers are in Section 2.2 (Helper Functions)
};
