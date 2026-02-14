/**
 * @name SoloLevelingTitleManager
 * @author BlueFlashX1
 * @description Title management system for Solo Leveling Stats - display and equip titles with buffs
 * @version 1.1.1
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

    // Settings panel binding (delegated) references for cleanup
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;

    // Toolbar cache (avoid repeated full-document scans)
    this._toolbarCache = {
      element: null,
      time: 0,
      ttl: 1500,
    };

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

    // Performance caches
    this._cache = {
      soloLevelingData: null,
      soloLevelingDataTime: 0,
      soloLevelingDataTTL: 100, // 100ms - data changes frequently
      soloPluginInstance: null, // Cache plugin instance to avoid repeated lookups
      soloPluginInstanceTime: 0,
      soloPluginInstanceTTL: 5000, // 5s - plugin instance doesn't change often
      achievementDefinitions: null, // Cache achievement definitions (large array)
      achievementDefinitionsTime: 0,
      achievementDefinitionsTTL: 2000, // 2s - definitions are static but expensive to fetch
      titleBonuses: {}, // Cache title bonuses by title name
      titleBonusesTime: {},
      titleBonusesTTL: 5000, // 5s - title bonuses are static
    };

    // Titles that should not be shown/used (kept as a Set to avoid repeated allocations)
    this._unwantedTitles = new Set([
      'Scribe',
      'Wordsmith',
      'Author',
      'Explorer',
      'Wanderer',
      'Apprentice',
      'Message Warrior',
    ]);
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
   * Stop-safe timeout helper (prevents work-after-stop + centralizes cleanup).
   * @param {() => void} callback - Work to run later
   * @param {number} delayMs - Delay in ms
   * @returns {number} timeoutId
   */
  _setTrackedTimeout(callback, delayMs) {
    const timeoutId = setTimeout(() => {
      this._retryTimeouts.delete(timeoutId);
      !this._isStopped && callback();
    }, delayMs);
    this._retryTimeouts.add(timeoutId);
    return timeoutId;
  }

  detachTitleManagerSettingsPanelHandlers() {
    const root = this._settingsPanelRoot;
    const handlers = this._settingsPanelHandlers;
    if (root && handlers) {
      root.removeEventListener('change', handlers.onChange);
    }
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
  }

  /**
   * Get SoloLevelingStats data
   * @returns {Object|null} - SoloLevelingStats data or null if unavailable
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

      const achievements = instance.settings?.achievements || {};

      const result = {
        titles: achievements.titles || [],
        activeTitle: achievements.activeTitle || null,
        achievements: achievements,
      };

      // Cache the result
      this._cache.soloLevelingData = result;
      this._cache.soloLevelingDataTime = now;

      return result;
    } catch (error) {
      this.debugError('DATA', 'Error getting SoloLevelingStats data', error);
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = now;
      return null;
    }
  }

  /**
   * Get title bonus info
   * @param {string} titleName - Title name
   * @returns {Object|null} - Title bonus object or null
   */
  getTitleBonus(titleName) {
    if (!titleName) return null;

    // Check cache first
    const now = Date.now();
    if (
      this._cache.titleBonuses[titleName] &&
      this._cache.titleBonusesTime[titleName] &&
      now - this._cache.titleBonusesTime[titleName] < this._cache.titleBonusesTTL
    ) {
      return this._cache.titleBonuses[titleName];
    }

    try {
      // Get or cache plugin instance
      let instance = null;
      if (
        this._cache.soloPluginInstance &&
        this._cache.soloPluginInstanceTime &&
        now - this._cache.soloPluginInstanceTime < this._cache.soloPluginInstanceTTL
      ) {
        instance = this._cache.soloPluginInstance;
      } else {
        const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
        if (!soloPlugin) {
          this._cache.titleBonuses[titleName] = null;
          this._cache.titleBonusesTime[titleName] = now;
          return null;
        }

        instance = soloPlugin.instance || soloPlugin;
        // Cache the instance
        this._cache.soloPluginInstance = instance;
        this._cache.soloPluginInstanceTime = now;
      }

      // Cache achievement definitions (expensive operation)
      let achievements = null;
      if (
        this._cache.achievementDefinitions &&
        this._cache.achievementDefinitionsTime &&
        now - this._cache.achievementDefinitionsTime < this._cache.achievementDefinitionsTTL
      ) {
        achievements = this._cache.achievementDefinitions;
      } else {
        if (instance.getAchievementDefinitions) {
          achievements = instance.getAchievementDefinitions();
          // Cache the definitions
          this._cache.achievementDefinitions = achievements;
          this._cache.achievementDefinitionsTime = now;
        } else {
          this._cache.titleBonuses[titleName] = null;
          this._cache.titleBonusesTime[titleName] = now;
          return null;
        }
      }

      // Find achievement with this title
      const achievement = achievements.find((a) => a.title === titleName);
      const result = achievement?.titleBonus || null;

      // Cache the result
      this._cache.titleBonuses[titleName] = result;
      this._cache.titleBonusesTime[titleName] = now;

      return result;
    } catch (error) {
      this._cache.titleBonuses[titleName] = null;
      this._cache.titleBonusesTime[titleName] = now;
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
   * Build formatted bonus lines for a title.
   * Centralized to avoid duplicated logic across equip toast + modal rendering.
   * @param {any} bonus
   * @returns {string[]} array of formatted bonus strings
   */
  formatTitleBonusLines(bonus) {
    if (!bonus) return [];
    const lines = [];

    bonus.xp > 0 && lines.push(`+${(bonus.xp * 100).toFixed(0)}% XP`);
    bonus.critChance > 0 && lines.push(`+${(bonus.critChance * 100).toFixed(0)}% Crit`);

    // Percent-based stat bonuses (new format)
    bonus.strengthPercent > 0 && lines.push(`+${(bonus.strengthPercent * 100).toFixed(0)}% STR`);
    bonus.agilityPercent > 0 && lines.push(`+${(bonus.agilityPercent * 100).toFixed(0)}% AGI`);
    bonus.intelligencePercent > 0 &&
      lines.push(`+${(bonus.intelligencePercent * 100).toFixed(0)}% INT`);
    bonus.vitalityPercent > 0 && lines.push(`+${(bonus.vitalityPercent * 100).toFixed(0)}% VIT`);
    bonus.perceptionPercent > 0 &&
      lines.push(`+${(bonus.perceptionPercent * 100).toFixed(0)}% PER`);

    // Raw-number stat bonuses (legacy format)
    bonus.strength > 0 && !bonus.strengthPercent && lines.push(`+${bonus.strength} STR`);
    bonus.agility > 0 && !bonus.agilityPercent && lines.push(`+${bonus.agility} AGI`);
    bonus.intelligence > 0 &&
      !bonus.intelligencePercent &&
      lines.push(`+${bonus.intelligence} INT`);
    bonus.vitality > 0 && !bonus.vitalityPercent && lines.push(`+${bonus.vitality} VIT`);
    bonus.luck > 0 && !bonus.perceptionPercent && lines.push(`+${bonus.luck} LUK`);

    return lines;
  }

  /**
   * Render (or re-render) the title cards grid using DOM nodes (avoids innerHTML churn).
   * @param {object} params
   * @param {HTMLElement} params.titlesGrid
   * @param {string[]} params.titles
   * @param {string|null} params.activeTitle
   */
  renderTitlesGrid({ titlesGrid, titles, activeTitle }) {
    if (!titlesGrid) return;
    titlesGrid.replaceChildren();

    const fragment = document.createDocumentFragment();
    titles.forEach((title) => {
      const isActive = title === activeTitle;
      const bonus = this.getTitleBonus(title);
      const buffs = this.formatTitleBonusLines(bonus);

      const card = document.createElement('div');
      card.className = `tm-title-card ${isActive ? 'active' : ''}`.trim();

      const icon = document.createElement('div');
      icon.className = 'tm-title-icon';
      icon.textContent = '';

      const name = document.createElement('div');
      name.className = 'tm-title-name';
      name.textContent = title;

      card.appendChild(icon);
      card.appendChild(name);

      if (buffs.length > 0) {
        const bonusEl = document.createElement('div');
        bonusEl.className = 'tm-title-bonus';
        bonusEl.textContent = buffs.join(', ');
        card.appendChild(bonusEl);
      }

      if (isActive) {
        const status = document.createElement('div');
        status.className = 'tm-title-status';
        status.textContent = 'Equipped';
        card.appendChild(status);
      } else {
        const btn = document.createElement('button');
        btn.className = 'tm-equip-btn';
        btn.dataset.title = title;
        btn.textContent = 'Equip';
        card.appendChild(btn);
      }

      fragment.appendChild(card);
    });

    titlesGrid.appendChild(fragment);
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

  /**
   * Sort titles by the selected metric while avoiding repeated `getTitleBonus()` calls
   * inside the comparator (precompute once per render).
   * @param {object} params
   * @param {string[]} params.titles
   * @param {string} params.sortBy
   * @returns {string[]} sorted titles (same array instance)
   */
  getSortedTitles({ titles, sortBy }) {
    const sortValuePickers = {
      xpBonus: (bonus) => bonus?.xp || 0,
      critBonus: (bonus) => bonus?.critChance || 0,
      strBonus: (bonus) => bonus?.strengthPercent || 0,
      agiBonus: (bonus) => bonus?.agilityPercent || 0,
      intBonus: (bonus) => bonus?.intelligencePercent || 0,
      vitBonus: (bonus) => bonus?.vitalityPercent || 0,
      perBonus: (bonus) => bonus?.perceptionPercent || 0,
    };
    const pickSortValue = sortValuePickers[sortBy] || sortValuePickers.xpBonus;

    const sortValues = titles.reduce((acc, title) => {
      acc[title] = pickSortValue(this.getTitleBonus(title));
      return acc;
    }, {});

    return titles.sort((a, b) => (sortValues[b] || 0) - (sortValues[a] || 0));
  }

  isValidToolbarContainer(toolbar) {
    if (!toolbar?.isConnected) return false;
    const buttons = toolbar.querySelectorAll?.('[class*="button"]');
    return !!buttons && buttons.length >= 4;
  }

  getToolbarContainer() {
    const now = Date.now();
    const cached = this._toolbarCache?.element;
    const cacheFresh =
      cached && this._toolbarCache.time && now - this._toolbarCache.time < this._toolbarCache.ttl;
    if (cacheFresh && this.isValidToolbarContainer(cached)) {
      return cached;
    }

    // Find Discord's button row - look for the container with keyboard, gift, GIF, emoji icons
    // (same logic as before, but cached).
    const buttonRow =
      Array.from(document.querySelectorAll('[class*="button"]')).find((el) => {
        const siblings = Array.from(el.parentElement?.children || []);
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
      (() => {
        const textArea =
          document.querySelector('[class*="channelTextArea"]') ||
          document.querySelector('[class*="slateTextArea"]') ||
          document.querySelector('textarea[placeholder*="Message"]');
        if (!textArea) return null;

        const container =
          textArea.closest('[class*="container"]') ||
          textArea.closest('[class*="wrapper"]') ||
          textArea.parentElement?.parentElement?.parentElement;

        const buttons = container?.querySelectorAll('[class*="button"]');
        if (buttons && buttons.length >= 4) {
          return buttons[0]?.parentElement;
        }

        return (
          container?.querySelector('[class*="buttons"]') ||
          container?.querySelector('[class*="buttonContainer"]')
        );
      })();

    const toolbar = buttonRow || null;
    this._toolbarCache.element = toolbar;
    this._toolbarCache.time = now;
    return this.isValidToolbarContainer(toolbar) ? toolbar : null;
  }

  createTitleButtonIconSvg() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute(
      'd',
      'M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z'
    );
    svg.appendChild(path);
    return svg;
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
    this._retryTimeout1 = this._setTrackedTimeout(() => {
      (!this.titleButton || !document.body.contains(this.titleButton)) && this.createTitleButton();
      this._retryTimeout1 = null;
    }, 2000);

    // FUNCTIONAL: Additional retry (short-circuit, no if-else)
    this._retryTimeout2 = this._setTrackedTimeout(() => {
      (!this.titleButton || !document.body.contains(this.titleButton)) && this.createTitleButton();
      this._retryTimeout2 = null;
    }, 5000);

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
      this.detachTitleManagerSettingsPanelHandlers();
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

      // Clear webpack module references
      this.webpackModules = {
        ChannelStore: null,
      };
      this.webpackModuleAccess = false;

      // Clear all caches
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;
      this._cache.soloPluginInstance = null;
      this._cache.soloPluginInstanceTime = 0;
      this._cache.achievementDefinitions = null;
      this._cache.achievementDefinitionsTime = 0;
      this._cache.titleBonuses = {};
      this._cache.titleBonusesTime = {};
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
    this.detachTitleManagerSettingsPanelHandlers();

    const panel = document.createElement('div');
    panel.style.cssText = `
      padding: 20px;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.85) 100%);
      border-radius: 12px;
      border: 2px solid rgba(138, 43, 226, 0.3);
      box-shadow: 0 0 30px rgba(138, 43, 226, 0.2);
    `;

    panel.innerHTML = `
      <div>
        <h3 style="
          color: #8a2be2;
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 1px;
          text-shadow: 0 0 10px rgba(138, 43, 226, 0.5);
        ">Title Manager Settings</h3>

        <div style="
          margin-bottom: 20px;
          padding: 15px;
          background: rgba(138, 43, 226, 0.1);
          border-radius: 8px;
          border-left: 3px solid #8a2be2;
        ">
          <div style="color: #8a2be2; font-weight: bold; margin-bottom: 10px;">Sort Preferences</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            Your default sort filter: <span style="color: #8a2be2; font-weight: bold;">${this.getSortLabel(
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
        ">
          <input type="checkbox" ${
            this.settings.debugMode ? 'checked' : ''
          } data-tm-setting="debugMode" style="
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
          background: rgba(138, 43, 226, 0.1);
          border-radius: 8px;
          border-left: 3px solid #8a2be2;
        ">
          <div style="color: #8a2be2; font-weight: bold; margin-bottom: 8px;">Debug Information</div>
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

    const onChange = (event) => {
      const target = event.target;
      const key = target?.getAttribute?.('data-tm-setting');
      if (!key) return;

      const nextValue = target.type === 'checkbox' ? target.checked : target.value;

      const handlers = {
        debugMode: (value) => {
          this.settings.debugMode = !!value;
          this.saveSettings();
          this.debugLog('SETTINGS', 'Debug mode toggled', { enabled: !!value });
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
    const styleId = 'title-manager-css';
    // FUNCTIONAL: Guard clause with short-circuit (early return)
    if (document.getElementById(styleId)) return;

    const cssContent = `
      /* Main Button - Matching Discord native toolbar buttons (GIF, Stickers, Emoji) */
      .tm-title-button-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 44px;
        padding: 13px 4px 0;
        box-sizing: border-box;
      }
      .tm-title-button {
        background: transparent;
        border: 1px solid rgba(138, 43, 226, 0.5);
        border-radius: 6px;
        width: 32px;
        height: 32px;
        cursor: pointer;
        color: var(--interactive-normal, #b9bbbe);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
        margin: 0;
        flex-shrink: 0;
        padding: 4px;
        box-sizing: border-box;
      }

      .tm-title-button svg {
        width: 24px;
        height: 24px;
        transition: color 0.15s ease;
        display: block;
      }

      .tm-title-button:hover {
        color: var(--interactive-hover, #dcddde);
        border-color: rgba(138, 43, 226, 0.8);
        background: rgba(138, 43, 226, 0.1);
      }

      .tm-title-button:active {
        color: var(--interactive-active, #fff);
        border-color: rgba(138, 43, 226, 1);
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
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.85) 100%);
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 16px;
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 0 30px rgba(138, 43, 226, 0.5);
      }

      .tm-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 2px solid rgba(138, 43, 226, 0.3);
      }

      .tm-modal-header h2 {
        margin: 0;
        color: #8a2be2;
        font-family: 'Orbitron', sans-serif;
        font-size: 24px;
      }

      /* Filter Bar Styling */
      .tm-filter-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        background: linear-gradient(135deg, #12091e 0%, #0e0716 100%);
        border-bottom: 2px solid rgba(138, 43, 226, 0.2);
      }

      .tm-filter-label {
        color: rgba(255, 255, 255, 0.9);
        font-weight: bold;
        font-size: 14px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: #8a2be2;
      }

      .tm-sort-dropdown {
        flex: 1;
        padding: 10px 16px;
        background: #0d0d14;
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 8px;
        color: #e8dcff;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.2);
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a2be2' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 36px;
      }

      .tm-sort-dropdown:hover {
        border-color: rgba(138, 43, 226, 0.8);
        background-color: #1a0e2e;
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.4);
        transform: translateY(-1px);
      }

      .tm-sort-dropdown:focus {
        border-color: #8a2be2;
        box-shadow: 0 0 25px rgba(138, 43, 226, 0.6);
        background-color: #0d0d14;
      }

      .tm-sort-dropdown option {
        background: #0d0d14;
        color: #e8dcff;
        padding: 10px;
        font-size: 14px;
      }

      .tm-sort-dropdown option:checked {
        background: linear-gradient(135deg, #2a1548, #1a0e2e);
        color: #d4b8ff;
      }

      .tm-sort-dropdown option:hover {
        background: #1a0e2e;
      }

      .tm-close-button {
        background: transparent;
        border: none;
        color: #8a2be2;
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
        background: rgba(138, 43, 226, 0.2);
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
        background: rgba(138, 43, 226, 0.1);
        border: 2px dashed rgba(138, 43, 226, 0.3);
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
        color: #8a2be2;
        font-family: 'Orbitron', sans-serif;
        font-size: 18px;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid rgba(138, 43, 226, 0.3);
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
        background: rgba(0, 0, 0, 0.6);
        border: 2px solid rgba(138, 43, 226, 0.3);
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
        border-color: rgba(138, 43, 226, 0.8);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.4);
        transform: translateY(-2px);
      }

      .tm-title-icon {
        font-size: 32px;
        margin-bottom: 10px;
      }

      .tm-title-name {
        font-weight: bold;
        color: #8a2be2;
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
        background: linear-gradient(135deg, #8a2be2 0%, #8a2be2 100%);
        border: 2px solid rgba(138, 43, 226, 0.8);
        border-radius: 6px;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 0 8px rgba(138, 43, 226, 0.4);
      }

      .tm-equip-btn:hover {
        background: linear-gradient(135deg, #8a2be2 0%, #4b0082 100%);
        border-color: rgba(138, 43, 226, 1);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.8);
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
    // Remove any existing buttons/wrappers first (prevent duplicates)
    const existingWrappers = document.querySelectorAll('.tm-title-button-wrapper');
    existingWrappers.forEach((w) => w.remove());
    const existingButtons = document.querySelectorAll('.tm-title-button');
    existingButtons.forEach((btn) => btn.remove());
    this.titleButton = null;

    const toolbar = this.getToolbarContainer();
    if (!toolbar) {
      // Return early if plugin is stopped
      if (this._isStopped) return;

      this._setTrackedTimeout(() => this.createTitleButton(), 1000);
      return;
    }

    // Create title button with SVG icon, wrapped to match Discord native buttons
    const wrapper = document.createElement('div');
    wrapper.className = 'tm-title-button-wrapper';

    const button = document.createElement('button');
    button.className = 'tm-title-button';
    button.replaceChildren(this.createTitleButtonIconSvg());
    button.title = 'Titles';
    button.addEventListener('click', () => this.openTitleModal());

    wrapper.appendChild(button);

    // Insert wrapper before skill tree button wrapper (or before apps button if no skill tree)
    const skillTreeWrapper = toolbar.querySelector('.st-skill-tree-button-wrapper');
    const skillTreeBtn = toolbar.querySelector('.st-skill-tree-button');
    const appsButton = Array.from(toolbar.children).find(
      (el) =>
        el.querySelector('[class*="apps"]') ||
        el.getAttribute('aria-label')?.toLowerCase().includes('app')
    );

    const insertRef = skillTreeWrapper || skillTreeBtn;
    if (insertRef) {
      toolbar.insertBefore(wrapper, insertRef);
    } else if (appsButton) {
      toolbar.insertBefore(wrapper, appsButton);
    } else {
      toolbar.appendChild(wrapper);
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

    // If observer is active, periodic polling is no longer needed.
    this.stopPeriodicButtonCheck();
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
      if (this._unwantedTitles.has(titleName)) {
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
                // Invalidate cache since title was equipped
                this._cache.soloLevelingData = null;
                this._cache.soloLevelingDataTime = 0;

                const bonus = this.getTitleBonus(titleName);
                const buffs = this.formatTitleBonusLines(bonus);
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

        // Invalidate cache since title was unequipped
        this._cache.soloLevelingData = null;
        this._cache.soloLevelingDataTime = 0;
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
            this._setTrackedTimeout(() => {
              // Check if button exists and is in DOM
              if (!this.titleButton || !document.body.contains(this.titleButton)) {
                this.createTitleButton();
              }
            }, delay * (index + 1));
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

      this._pushStateWrapper = function (...args) {
        this._originalPushState.apply(history, args);
        handleUrlChange();
      }.bind(this);
      history.pushState = this._pushStateWrapper;

      this._replaceStateWrapper = function (...args) {
        this._originalReplaceState.apply(history, args);
        handleUrlChange();
      }.bind(this);
      history.replaceState = this._replaceStateWrapper;
    } catch (error) {
      this.debugError('WATCHER', 'Failed to override history methods', error);
    }

    // Store idempotent and defensive cleanup function
    this._urlChangeCleanup = () => {
      window.removeEventListener('popstate', handleUrlChange);

      // FUNCTIONAL: Defensive restoration (short-circuit, no if-else)
      try {
        this._originalPushState &&
          this._pushStateWrapper &&
          history.pushState === this._pushStateWrapper &&
          (history.pushState = this._originalPushState);
      } catch (error) {
        this.debugError('WATCHER', 'Failed to restore history.pushState', error);
      }

      try {
        this._originalReplaceState &&
          this._replaceStateWrapper &&
          history.replaceState === this._replaceStateWrapper &&
          (history.replaceState = this._originalReplaceState);
      } catch (error) {
        this.debugError('WATCHER', 'Failed to restore history.replaceState', error);
      }

      // Null out stored originals after successful restore
      this._originalPushState = null;
      this._originalReplaceState = null;
      this._pushStateWrapper = null;
      this._replaceStateWrapper = null;
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
          this._setTrackedTimeout(() => {
            if (!this.titleButton || !document.body.contains(this.titleButton)) {
              this.debugLog('VISIBILITY', 'Button missing after visibility change, recreating...');
              this.createTitleButton();
            }
          }, 300);
        }
      })
    );

    // Periodic persistence check as fallback (only enabled when toolbar observer isn't active)
    this.startPeriodicButtonCheck();

    // Store cleanup function
    this._windowFocusCleanup = () => {
      window.removeEventListener('blur', this._boundHandleBlur);
      window.removeEventListener('focus', this._boundHandleFocus);
      document.removeEventListener('visibilitychange', this._boundHandleVisibilityChange);
      this.stopPeriodicButtonCheck();
    };
  }

  startPeriodicButtonCheck() {
    if (this._periodicCheckInterval) return;
    // If MutationObserver is active, it will handle persistence without polling.
    if (this.toolbarObserver) return;

    this._periodicCheckInterval = setInterval(() => {
      if (this._isStopped) return;
      if (!this.titleButton || !document.body.contains(this.titleButton)) {
        this.debugLog('PERIODIC_CHECK', 'Button missing, recreating...');
        this.createTitleButton();
      }
      // Once observer is active, stop polling.
      this.toolbarObserver && this.stopPeriodicButtonCheck();
    }, 15000);
  }

  stopPeriodicButtonCheck() {
    if (!this._periodicCheckInterval) return;
    clearInterval(this._periodicCheckInterval);
    this._periodicCheckInterval = null;
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
    this._setTrackedTimeout(() => {
      // Check if button still exists when user returns
      if (!this.titleButton || !document.body.contains(this.titleButton)) {
        this.debugLog('WINDOW_FOCUS', 'Button missing after window focus, recreating...');
        this.createTitleButton();
      }
    }, 300); // Quick check after focus (same as AutoIdleOnAFK pattern)
  }

  openTitleModal() {
    if (this.titleModal) {
      this.closeTitleModal();
      return;
    }

    const soloData = this.getSoloLevelingData();
    // Filter out unwanted titles
    const isTitleAllowed = (title) => !this._unwantedTitles.has(title);
    let titles = (soloData?.titles || []).filter(isTitleAllowed);

    // FUNCTIONAL: Sort by selected filter option (highest to lowest)
    const sortBy = this.settings.sortBy || 'xpBonus';
    this.getSortedTitles({ titles, sortBy });

    const activeTitle =
      soloData?.activeTitle && isTitleAllowed(soloData.activeTitle) ? soloData.activeTitle : null;

    const modal = document.createElement('div');
    modal.className = 'tm-title-modal';
    modal.innerHTML = `
      <div class="tm-modal-content">
        <div class="tm-modal-header">
          <h2>Titles</h2>
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
                const buffs = this.formatTitleBonusLines(bonus);
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
              <div class="tm-titles-grid"></div>
            `
            }
          </div>
        </div>
      </div>
    `;

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

    // Render titles grid via DOM nodes (avoids large innerHTML map/join)
    const titlesGrid = modal.querySelector('.tm-titles-grid');
    titles.length > 0 && titlesGrid && this.renderTitlesGrid({ titlesGrid, titles, activeTitle });

    // Handle sort filter change (delegated)
    const onModalChange = (e) => {
      if (e.target?.id !== 'tm-sort-select') return;
      this.settings.sortBy = e.target.value;
      this.saveSettings();

      const nextTitles = (soloData?.titles || []).filter(isTitleAllowed);
      this.getSortedTitles({ titles: nextTitles, sortBy: e.target.value });

      // Smooth transition
      titlesGrid && (titlesGrid.style.opacity = '0.5');
      this._setTrackedTimeout(() => {
        titlesGrid && this.renderTitlesGrid({ titlesGrid, titles: nextTitles, activeTitle });
        titlesGrid && (titlesGrid.style.opacity = '1');
      }, 150);
    };
    modal.addEventListener('change', onModalChange);
    this._titleModalHandlers = { onModalChange };

    document.body.appendChild(modal);
    this.titleModal = modal;

    this.debugLog('MODAL', 'Title modal opened');
  }

  refreshModal() {
    this.closeTitleModal();
    this._setTrackedTimeout(() => this.openTitleModal(), 100);
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

    this._setTrackedTimeout(() => {
      this.closeTitleModal();
      this.openTitleModal();

      // Restore scroll and fade in
      this._setTrackedTimeout(() => {
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
      this._titleModalHandlers?.onModalChange &&
        this.titleModal.removeEventListener('change', this._titleModalHandlers.onModalChange);
      this._titleModalHandlers = null;
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
