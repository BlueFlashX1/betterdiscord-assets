/**
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
 * - Migrated title selection modal from innerHTML + event delegation to React components
 * - Added buildTitleComponents() factory with TitleModal + TitleCard components
 * - Uses BdApi.ReactDOM.createRoot() with webpack fallbacks (_getCreateRoot)
 * - useReducer force-update bridge for imperative → React state sync
 * - Equip/unequip now trigger React diffed update (no full modal rebuild)
 * - Deleted: renderTitlesGrid, refreshModalSmooth, createTitleButtonIconSvg, escapeHtml
 * - Zero visual regression — all existing CSS class names preserved
 *
 * ADVANCED FEATURES:
 * - Added Webpack module access (ChannelStore) for better Discord integration
 * - Enhanced error handling and fallback mechanisms
 * - Improved compatibility with Discord updates
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
 * - Fixed close button using inline onclick that bypassed cleanup
 * - Close button now routes through central modal click handler
 * - Ensures proper state cleanup (titleModal, _titleManagerInstances)
 * - Enhanced memory cleanup (modal instance tracking cleared on stop)
 *
 * - Code structure improvements (section headers)
 * - Console log cleanup (removed verbose logs)
 */

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
function _bdLoad(fileName) {
  if (!fileName) return null;
  try {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), 'utf8');
    const moduleObj = { exports: {} };
    const factory = new Function(
      'module',
      'exports',
      'require',
      'BdApi',
      `${source}\nreturn module.exports || exports || null;`
    );
    const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
    const candidate = loaded || moduleObj.exports;
    if (typeof candidate === 'function') return candidate;
    if (candidate && typeof candidate === 'object' && Object.keys(candidate).length > 0) return candidate;
  } catch (_) {}
  return null;
}

const PERCENT_BONUS_RULES = [
  ['xp', 'XP'], ['critChance', 'Crit'], ['strengthPercent', 'STR'],
  ['agilityPercent', 'AGI'], ['intelligencePercent', 'INT'],
  ['vitalityPercent', 'VIT'], ['perceptionPercent', 'PER'],
];
const RAW_BONUS_RULES = [
  ['strength', 'strengthPercent', 'STR'], ['agility', 'agilityPercent', 'AGI'],
  ['intelligence', 'intelligencePercent', 'INT'], ['vitality', 'vitalityPercent', 'VIT'],
  ['perception', 'perceptionPercent', 'PER'],
];

const SORT_VALUE_PICKERS = {
  xpBonus: (bonus) => bonus?.xp || 0,
  critBonus: (bonus) => bonus?.critChance || 0,
  strBonus: (bonus) => bonus?.strengthPercent || 0,
  agiBonus: (bonus) => bonus?.agilityPercent || 0,
  intBonus: (bonus) => bonus?.intelligencePercent || 0,
  vitBonus: (bonus) => bonus?.vitalityPercent || 0,
  perBonus: (bonus) => bonus?.perceptionPercent || bonus?.perception || 0,
};

const SORT_LABELS = {
  xpBonus: 'XP Gain',
  critBonus: 'Crit Chance',
  strBonus: 'Strength %',
  agiBonus: 'Agility %',
  intBonus: 'Intelligence %',
  vitBonus: 'Vitality %',
  perBonus: 'Perception %',
};
const { buildTitleComponents } = require("./components");
const { getTitleManagerCss } = require("./styles");

let _ReactUtils;
try { _ReactUtils = _bdLoad('BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }

let _SLUtils;
_SLUtils = _bdLoad("SoloLevelingUtils.js") || window.SoloLevelingUtils || null;
if (_SLUtils && !window.SoloLevelingUtils) window.SoloLevelingUtils = _SLUtils;

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

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
    this.settings = structuredClone(this.defaultSettings);
    this.titleButton = null;
    this.titleModal = null; // legacy ref — kept for backward compat checks
    // toolbarObserver removed — React patcher handles button persistence
    this._urlChangeCleanup = null; // Cleanup function for URL change watcher
    this._windowFocusCleanup = null; // Cleanup function for window focus watcher
    this._retryTimeout1 = null; // Timeout ID for first retry
    this._retryTimeout2 = null; // Timeout ID for second retry
    // _periodicCheckInterval removed — React patcher handles button persistence

    // React modal refs (v2.0.0)
    this._modalContainer = null;
    this._modalReactRoot = null;
    this._modalForceUpdate = null;
    this._components = null;

    // Track all retry timeouts for proper cleanup
    this._retryTimeouts = new Set();
    this._isStopped = false;

    // Settings panel binding (delegated) references for cleanup
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;

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
      titleBonuses: new Map(), // Cache title bonuses by title name (Map preserves insertion order for O(1) eviction)
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
      'Monarch of Beast',
      'Monarch of Beasts',
    ]);

    this._warnedMessages = new Set();
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

  warnOnce(key, message, detail = null) {
    if (this._warnedMessages.has(key)) return;
    this._warnedMessages.add(key);
    if (detail !== null) {
      console.warn(message, detail);
      return;
    }
    console.warn(message);
  }

  _clearTrackedTimeout(timeoutId) {
    if (typeof timeoutId !== 'number') return false;
    clearTimeout(timeoutId);
    this._retryTimeouts.delete(timeoutId);
    return true;
  }

  _unsubscribeNavigationBus() {
    if (!this._navBusUnsub) return;
    this._navBusUnsub();
    this._navBusUnsub = null;
  }

  /**
   * Load SoloLevelingUtils shared library (toolbar registry, React injection, etc.)
   */
  _loadSLUtils() {
    const fromWindow = typeof window !== 'undefined' ? window.SoloLevelingUtils : null;
    this._SLUtils = fromWindow || _SLUtils || null;
    return !!this._SLUtils;
  }

  /** React 18 createRoot with shared utility + fallback */
  _getCreateRoot() {
    const fromShared = typeof _ReactUtils?.getCreateRoot === 'function'
      ? _ReactUtils.getCreateRoot()
      : null;
    if (fromShared) return fromShared;

    const reactDom = BdApi.ReactDOM;
    if (typeof reactDom?.createRoot === 'function') {
      return (container) => reactDom.createRoot(container);
    }
    return null;
  }

  /**
   * Render Title button as a React element (for SLUtils React toolbar patcher — Tier 1).
   * @param {object} React - React instance from Discord's internals
   * @returns {React.Element|null}
   */
  _renderTitleButtonReact(React) {
    if (this._isStopped) return null;

    const pluginInstance = this;

    return React.createElement(
      'div',
      {
        id: 'tm-title-button-wrapper',
        className: 'tm-title-button-wrapper',
        style: { display: 'flex', alignItems: 'center' },
      },
      React.createElement(
        'button',
        {
          className: 'tm-title-button',
          title: 'Titles',
          onClick: () => pluginInstance.openTitleModal(),
          ref: (el) => {
            if (el) pluginInstance.titleButton = el;
          },
        },
        React.createElement(
          'svg',
          {
            className: 'tm-title-icon',
            viewBox: '0 0 512 512',
            width: '20',
            height: '20',
            fill: 'currentColor',
            style: { display: 'block', margin: 'auto' },
          },
          React.createElement('path', {
            d: 'M458.159,404.216c-18.93-33.65-49.934-71.764-100.409-93.431c-28.868,20.196-63.938,32.087-101.745,32.087c-37.828,0-72.898-11.89-101.767-32.087c-50.474,21.667-81.479,59.782-100.398,93.431C28.731,448.848,48.417,512,91.842,512c43.426,0,164.164,0,164.164,0s120.726,0,164.153,0C463.583,512,483.269,448.848,458.159,404.216z',
          }),
          React.createElement('path', {
            d: 'M256.005,300.641c74.144,0,134.231-60.108,134.231-134.242v-32.158C390.236,60.108,330.149,0,256.005,0c-74.155,0-134.252,60.108-134.252,134.242V166.4C121.753,240.533,181.851,300.641,256.005,300.641z',
          })
        )
      )
    );
  }

  _getSoloPluginInstanceCached(now = Date.now()) {
    if (
      this._cache.soloPluginInstance &&
      this._cache.soloPluginInstanceTime &&
      now - this._cache.soloPluginInstanceTime < this._cache.soloPluginInstanceTTL
    ) {
      return this._cache.soloPluginInstance;
    }

    const instance = this._SLUtils?.getPluginInstance?.('SoloLevelingStats');
    if (!instance) {
      this._cache.soloPluginInstance = null;
      this._cache.soloPluginInstanceTime = 0;
      return null;
    }

    this._cache.soloPluginInstance = instance;
    this._cache.soloPluginInstanceTime = now;
    return instance;
  }

  _getAchievementDefinitionsCached(instance, now = Date.now()) {
    if (
      this._cache.achievementDefinitions &&
      this._cache.achievementDefinitionsTime &&
      now - this._cache.achievementDefinitionsTime < this._cache.achievementDefinitionsTTL
    ) {
      return this._cache.achievementDefinitions;
    }

    if (!instance || typeof instance.getAchievementDefinitions !== 'function') {
      return null;
    }

    const achievements = instance.getAchievementDefinitions();
    this._cache.achievementDefinitions = achievements;
    this._cache.achievementDefinitionsTime = now;
    return achievements;
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
      const instance = this._getSoloPluginInstanceCached(now);
      if (!instance) {
        this._cache.soloLevelingData = null;
        this._cache.soloLevelingDataTime = now;
        return null;
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

  _cacheTitleBonusResult(titleName, result, now = Date.now()) {
    // Evict oldest entry if cache exceeds 50 titles (Map preserves insertion order → O(1))
    if (this._cache.titleBonuses.size >= 50) {
      const oldest = this._cache.titleBonuses.keys().next().value;
      this._cache.titleBonuses.delete(oldest);
    }
    this._cache.titleBonuses.set(titleName, { result, time: now });
    return result;
  }

  /**
   * Get title bonus info
   * @param {string} titleName - Title name
   * @returns {Object|null} - Title bonus object or null
   */
  getTitleBonus(titleName) {
    if (!titleName) return null;

    // Check cache first (Map-based: entry = { result, time })
    const now = Date.now();
    const cached = this._cache.titleBonuses.get(titleName);
    if (cached && now - cached.time < this._cache.titleBonusesTTL) {
      return cached.result;
    }

    try {
      const instance = this._getSoloPluginInstanceCached(now);
      if (!instance) {
        return this._cacheTitleBonusResult(titleName, null, now);
      }

      const achievements = this._getAchievementDefinitionsCached(instance, now);
      if (!achievements) {
        return this._cacheTitleBonusResult(titleName, null, now);
      }

      // Find achievement with this title
      const achievement = achievements.find((a) => a.title === titleName);
      const result = achievement?.titleBonus || null;

      return this._cacheTitleBonusResult(titleName, result, now);
    } catch (error) {
      return this._cacheTitleBonusResult(titleName, null, now);
    }
  }


  _appendPercentBonusLine(lines, bonus, key, label) {
    if (bonus[key] > 0) {
      lines.push(`+${(bonus[key] * 100).toFixed(0)}% ${label}`);
    }
  }

  _appendRawBonusLine(lines, bonus, rawKey, percentKey, label) {
    if (bonus[rawKey] > 0 && !bonus[percentKey]) {
      lines.push(`+${bonus[rawKey]} ${label}`);
    }
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
    PERCENT_BONUS_RULES.forEach(([key, label]) => this._appendPercentBonusLine(lines, bonus, key, label));
    RAW_BONUS_RULES.forEach(([rawKey, percentKey, label]) =>
      this._appendRawBonusLine(lines, bonus, rawKey, percentKey, label)
    );
    return lines;
  }


  /**
   * Get human-readable sort label
   * @param {string} sortBy - Sort key
   * @returns {string} - Human-readable label
   */
  getSortLabel(sortBy) {
    return SORT_LABELS[sortBy] || 'XP Gain';
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
    const pickSortValue = SORT_VALUE_PICKERS[sortBy] || SORT_VALUE_PICKERS.xpBonus;

    const bonusMap = {};
    const sortValues = {};
    for (const title of titles) {
      const bonus = this.getTitleBonus(title);
      bonusMap[title] = bonus;
      sortValues[title] = pickSortValue(bonus);
    }

    titles.sort((a, b) => (sortValues[b] || 0) - (sortValues[a] || 0));
    return { sorted: titles, bonusMap };
  }


  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================

  /**
   * 3.1 PLUGIN LIFECYCLE
   */

  start() {
    this._toast = _PluginUtils?.createToastHelper?.("titleManager") || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
    this._warnedMessages.clear();
    // Reset stopped flag to allow watchers to recreate
    this._isStopped = false;

    this.loadSettings();
    this._loadSLUtils();
    this._components = buildTitleComponents(BdApi, this);
    this.injectCSS();

    // ============================================================================
    // WEBPACK MODULE ACCESS: Initialize Discord module access
    // ============================================================================
    this.initializeWebpackModules();

    // Register toolbar button via SLUtils React patcher (React-only, no DOM fallback).
    if (this._SLUtils?.registerToolbarButton) {
      this._SLUtils.registerToolbarButton({
        id: 'tm-title-button-wrapper',
        priority: 10, // Before SkillTree (20)
        renderReact: (React, _channel) => this._renderTitleButtonReact(React),
        cleanup: () => {
          this.titleButton = null;
        },
      });
    } else {
      this.warnOnce('slutils-missing', '[TitleManager] SLUtils not available — toolbar button inactive');
    }

    // Watch for channel changes and recreate button
    this.setupChannelWatcher();

    // Watch for window focus/visibility changes (user coming back from another window)
    this.setupWindowFocusWatcher();

    this.debugLog('START', 'Plugin started');
  }

  stop() {
    // Set stopped flag to prevent recreating watchers
    this._isStopped = true;

    // Unregister from shared SLUtils toolbar registry (if registered)
    try {
      this._SLUtils?.unregisterToolbarButton?.('tm-title-button-wrapper');
    } catch (error) {
      this.warnOnce('toolbar-unregister-failed', '[TitleManager] Failed to unregister toolbar button', error);
    }

    try {
      this.removeTitleButton();
      this.closeTitleModal();
      this.detachTitleManagerSettingsPanelHandlers();
      this.removeCSS();

      // Clear all tracked retry timeouts
      this._retryTimeouts.forEach((timeoutId) => this._clearTrackedTimeout(timeoutId));
      this._retryTimeouts.clear();

      // FUNCTIONAL: Clear legacy timeouts (short-circuit)
      this._retryTimeout1 && (this._clearTrackedTimeout(this._retryTimeout1), (this._retryTimeout1 = null));
      this._retryTimeout2 && (this._clearTrackedTimeout(this._retryTimeout2), (this._retryTimeout2 = null));
    } finally {
      // FUNCTIONAL: Cleanup URL watcher (short-circuit)
      this._urlChangeCleanup && (this._urlChangeCleanup(), (this._urlChangeCleanup = null));
      // FUNCTIONAL: Cleanup window focus watcher (short-circuit)
      this._windowFocusCleanup && (this._windowFocusCleanup(), (this._windowFocusCleanup = null));
      // No periodic check interval to clear — React patcher handles persistence.

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
      this._cache.titleBonuses = new Map();
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
      saved && (this.settings = structuredClone({ ...this.defaultSettings, ...saved }));
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
      background: #1e1e2e;
      border-radius: 0;
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
          border-radius: 0;
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
          border-radius: 0;
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
          border-radius: 0;
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
    BdApi.DOM.addStyle(styleId, getTitleManagerCss());
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
      this.webpackModules.ChannelStore = BdApi.Webpack.getStore("ChannelStore");

      this.webpackModuleAccess = !!this.webpackModules.ChannelStore;

      this.debugLog('WEBPACK', 'Module access initialized', {
        hasChannelStore: !!this.webpackModules.ChannelStore,
        access: this.webpackModuleAccess,
      });
    } catch (error) {
      this.debugError('WEBPACK', `Initialization failed: ${error?.message || error}`, error);
      this.webpackModuleAccess = false;
    }
  }

  /**
   * 3.4 UI MANAGEMENT
   */

  // NOTE: createTitleButton(), observeToolbar(), removeTitleButton() removed in v1.3.0.
  // Toolbar button is now managed entirely via SLUtils React patcher.
  // See _renderTitleButtonReact() for the React implementation.

  removeTitleButton() {
    this.titleButton = null;
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
      const instance = this._SLUtils?.getPluginInstance?.('SoloLevelingStats');
      if (!instance) return false;

      if (this._unwantedTitles.has(titleName)) {
        this._toast('This title has been removed', "error", 2000);
        return false;
      }

      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.titles.includes(titleName)) {
        this._toast('Title not unlocked', "error", 2000);
        return false;
      }

      if (!instance.setActiveTitle) return false;

      const result = instance.setActiveTitle(titleName);
      if (result) {
        this._cache.soloLevelingData = null;
        this._cache.soloLevelingDataTime = 0;

        const bonus = this.getTitleBonus(titleName);
        const buffs = this.formatTitleBonusLines(bonus);
        const bonusText = buffs.length > 0 ? ` (${buffs.join(', ')})` : '';
        this._toast(`Title Equipped: ${titleName}${bonusText}`, "success", 3000);
        this._modalForceUpdate?.();
      }
      return result;
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
      const instance = this._SLUtils?.getPluginInstance?.('SoloLevelingStats');
      if (!instance) return false;

      // Use setActiveTitle with null to unequip
      if (instance.setActiveTitle) {
        // Try setting to null - if that doesn't work, set directly
        const result = instance.setActiveTitle(null);
        if (!result && instance.settings?.achievements) {
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
        this._toast('Title Unequipped', "info", 2000);
        this._modalForceUpdate?.();
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
    let previousUrl = window.location.href;
    const handleNavigation = () => {
      if (this._isStopped) return;
      const nextUrl = window.location.href;
      if (nextUrl === previousUrl) return;
      previousUrl = nextUrl;
      // React patcher handles button persistence on channel switch — no manual re-creation needed.
    };

    const navigationBus = _PluginUtils?.NavigationBus;
    if (navigationBus && typeof navigationBus.subscribe === 'function') {
      this._navBusUnsub = navigationBus.subscribe(handleNavigation);
    } else {
      this._navBusUnsub = null;
    }

    this._urlChangeCleanup = () => {
      this._unsubscribeNavigationBus();
    };
  }

  /**
   * Setup window focus/visibility watcher (detects when user returns from another window)
   * Pattern from AutoIdleOnAFK plugin - uses window blur/focus events for reliable detection
   */
  setupWindowFocusWatcher() {
    // All blur/focus/visibilitychange handlers were no-ops (React patcher handles
    // button persistence natively). Removed to eliminate 3 permanent global listeners.
    this._windowFocusCleanup = null;
  }

  // NOTE: startPeriodicButtonCheck() and stopPeriodicButtonCheck() removed in v1.3.0.
  // React patcher handles button persistence natively.

  openTitleModal() {
    // If already open, just force-update the React tree
    if (this._modalReactRoot) {
      this._modalForceUpdate?.();
      return;
    }

    const createRoot = this._getCreateRoot();
    if (!createRoot) {
      this.warnOnce('create-root-missing', '[TitleManager] createRoot unavailable — cannot open modal');
      this._toast?.('Title modal unavailable in current Discord runtime', 'error', 2500);
      return;
    }

    const container = document.createElement('div');
    container.id = 'tm-modal-root';
    container.style.display = 'contents';
    document.body.appendChild(container);

    const root = createRoot(container);
    this._modalContainer = container;
    this._modalReactRoot = root;

    const { TitleModal } = this._components;
    root.render(BdApi.React.createElement(TitleModal, { onClose: () => this.closeTitleModal() }));

    this.debugLog('MODAL', 'Title modal opened (React)');
  }

  closeTitleModal() {
    if (this._modalReactRoot) {
      this._modalReactRoot.unmount();
      this._modalReactRoot = null;
    }
    if (this._modalContainer) {
      this._modalContainer.remove();
      this._modalContainer = null;
    }
    this._modalForceUpdate = null;
    this.titleModal = null;
    this.debugLog('MODAL', 'Title modal closed');
  }

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT
  // ============================================================================
  // Debug logging helpers are in Section 2.2 (Helper Functions)
};
