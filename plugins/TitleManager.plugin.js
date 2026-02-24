/**
 * @name SoloLevelingTitleManager
 * @author BlueFlashX1
 * @description Title management system for Solo Leveling Stats - display and equip titles with buffs
 * @version 2.0.0
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
 * @changelog v2.0.0 (2026-02-17) - REACT MODAL MIGRATION
 * - Migrated title selection modal from innerHTML + event delegation to React components
 * - Added buildTitleComponents() factory with TitleModal + TitleCard components
 * - Uses BdApi.ReactDOM.createRoot() with webpack fallbacks (_getCreateRoot)
 * - useReducer force-update bridge for imperative → React state sync
 * - Equip/unequip now trigger React diffed update (no full modal rebuild)
 * - Deleted: renderTitlesGrid, refreshModalSmooth, createTitleButtonIconSvg, escapeHtml
 * - Zero visual regression — all existing CSS class names preserved
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

// ============================================================================
// REACT COMPONENT FACTORY (v2.0.0 — replaces innerHTML modal rendering)
// ============================================================================
function buildTitleComponents(pluginInstance) {
  const React = BdApi.React;
  const ce = React.createElement;

  const SORT_OPTIONS = [
    { value: 'xpBonus', label: 'XP Gain (Highest)' },
    { value: 'critBonus', label: 'Crit Chance (Highest)' },
    { value: 'strBonus', label: 'Strength % (Highest)' },
    { value: 'agiBonus', label: 'Agility % (Highest)' },
    { value: 'intBonus', label: 'Intelligence % (Highest)' },
    { value: 'vitBonus', label: 'Vitality % (Highest)' },
    { value: 'perBonus', label: 'Perception % (Highest)' },
  ];

  // ── TitleCard ──
  function TitleCard({ title, isActive, bonus, onEquip }) {
    const buffs = pluginInstance.formatTitleBonusLines(bonus);
    return ce('div', { className: `tm-title-card ${isActive ? 'active' : ''}`.trim() },
      ce('div', { className: 'tm-title-icon' }, ''),
      ce('div', { className: 'tm-title-name' }, title),
      buffs.length > 0 ? ce('div', { className: 'tm-title-bonus' }, buffs.join(', ')) : null,
      isActive
        ? ce('div', { className: 'tm-title-status' }, 'Equipped')
        : ce('button', { className: 'tm-equip-btn', onClick: () => onEquip(title) }, 'Equip')
    );
  }

  // ── TitleModal ──
  function TitleModal({ onClose }) {
    const [sortBy, setSortBy] = React.useState(pluginInstance.settings.sortBy || 'xpBonus');
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

    // Expose forceUpdate
    React.useEffect(() => {
      pluginInstance._modalForceUpdate = forceUpdate;
      return () => { pluginInstance._modalForceUpdate = null; };
    }, [forceUpdate]);

    // Escape key
    React.useEffect(() => {
      const handler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
      document.addEventListener('keydown', handler, true);
      return () => document.removeEventListener('keydown', handler, true);
    }, [onClose]);

    const soloData = pluginInstance.getSoloLevelingData();
    const isTitleAllowed = (t) => !pluginInstance._unwantedTitles.has(t);
    const titles = React.useMemo(() => {
      const raw = (soloData?.titles || []).filter(isTitleAllowed);
      pluginInstance.getSortedTitles({ titles: raw, sortBy });
      return raw;
    }, [soloData?.titles?.length, sortBy]);

    const activeTitle = soloData?.activeTitle && isTitleAllowed(soloData.activeTitle) ? soloData.activeTitle : null;

    const handleSortChange = React.useCallback((e) => {
      const val = e.target.value;
      setSortBy(val);
      pluginInstance.settings.sortBy = val;
      pluginInstance.saveSettings();
    }, []);

    const handleEquip = React.useCallback((title) => {
      pluginInstance.equipTitle(title);
    }, []);

    const handleUnequip = React.useCallback(() => {
      pluginInstance.unequipTitle();
    }, []);

    const handleOverlayClick = React.useCallback((e) => {
      if (e.target.className === 'tm-title-modal') onClose();
    }, [onClose]);

    // Active title section
    let activeTitleSection;
    if (activeTitle) {
      const bonus = pluginInstance.getTitleBonus(activeTitle);
      const buffs = pluginInstance.formatTitleBonusLines(bonus);
      activeTitleSection = ce('div', { className: 'tm-active-title' },
        ce('div', { className: 'tm-active-label' }, 'Active Title:'),
        ce('div', { className: 'tm-active-name' }, activeTitle),
        buffs.length > 0 ? ce('div', { className: 'tm-active-bonus' }, buffs.join(', ')) : null,
        ce('button', { className: 'tm-unequip-btn', onClick: handleUnequip }, 'Unequip')
      );
    } else {
      activeTitleSection = ce('div', { className: 'tm-no-title' },
        ce('div', { className: 'tm-no-title-text' }, 'No title equipped')
      );
    }

    // Titles grid
    let gridContent;
    if (titles.length === 0) {
      gridContent = ce('div', { className: 'tm-empty-state' },
        ce('div', { className: 'tm-empty-icon' }, ''),
        ce('div', { className: 'tm-empty-text' }, 'No titles unlocked yet'),
        ce('div', { className: 'tm-empty-hint' }, 'Complete achievements to earn titles')
      );
    } else {
      gridContent = ce('div', { className: 'tm-titles-grid' },
        titles.map((title) => ce(TitleCard, {
          key: title,
          title,
          isActive: title === activeTitle,
          bonus: pluginInstance.getTitleBonus(title),
          onEquip: handleEquip,
        }))
      );
    }

    return ce('div', { className: 'tm-title-modal', onClick: handleOverlayClick },
      ce('div', { className: 'tm-modal-content' },
        ce('div', { className: 'tm-modal-header' },
          ce('h2', null, 'Titles'),
          ce('button', { className: 'tm-close-button', onClick: onClose }, '\u00D7')
        ),
        ce('div', { className: 'tm-filter-bar' },
          ce('label', { className: 'tm-filter-label' }, 'Sort by:'),
          ce('select', { id: 'tm-sort-select', className: 'tm-sort-dropdown', value: sortBy, onChange: handleSortChange },
            SORT_OPTIONS.map((opt) => ce('option', { key: opt.value, value: opt.value }, opt.label))
          )
        ),
        ce('div', { className: 'tm-modal-body' },
          activeTitleSection,
          ce('div', { className: 'tm-titles-section' },
            ce('h3', { className: 'tm-section-title' }, `Available Titles (${titles.length})`),
            gridContent
          )
        )
      )
    );
  }

  return { TitleModal, TitleCard };
}

let _ReactUtils;
try { _ReactUtils = require('./BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }

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
      'Monarch of Beast',
      'Monarch of Beasts',
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

  _clearTrackedTimeout(timeoutId) {
    if (!Number.isFinite(timeoutId)) return;
    clearTimeout(timeoutId);
    this._retryTimeouts.delete(timeoutId);
  }

  /**
   * Load SoloLevelingUtils shared library (toolbar registry, React injection, etc.)
   */
  _loadSLUtils() {
    this._SLUtils = null;
    try {
      if (typeof window !== 'undefined' && window.SoloLevelingUtils) {
        this._SLUtils = window.SoloLevelingUtils;
        return;
      }
      const path = require('path');
      const pluginsDir = BdApi.Plugins?.folder || path.join(BdApi.getPath?.() || '', 'plugins');
      const utilsPath = path.join(pluginsDir, 'SoloLevelingUtils.js');
      delete require.cache[require.resolve?.(utilsPath)];
      this._SLUtils = require(utilsPath);
      if (!window.SoloLevelingUtils) window.SoloLevelingUtils = this._SLUtils;
    } catch (error) {
      console.error('[TitleManager] Failed to load SoloLevelingUtils:', error);
      this._SLUtils = null;
    }
  }

  /** React 18 createRoot with shared utility + fallback */
  _getCreateRoot() {
    if (_ReactUtils?.getCreateRoot) return _ReactUtils.getCreateRoot();
    // Minimal inline fallback
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
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
            viewBox: '0 0 24 24',
            width: '20',
            height: '20',
            fill: 'currentColor',
            style: { display: 'block', margin: 'auto' },
          },
          React.createElement('path', {
            d: 'M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z',
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

    const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
    if (!soloPlugin) {
      this._cache.soloPluginInstance = null;
      this._cache.soloPluginInstanceTime = 0;
      return null;
    }

    const instance = soloPlugin.instance || soloPlugin;
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
    this._cache.titleBonuses[titleName] = result;
    this._cache.titleBonusesTime[titleName] = now;
    return result;
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

    const percentRules = [
      ['xp', 'XP'],
      ['critChance', 'Crit'],
      ['strengthPercent', 'STR'],
      ['agilityPercent', 'AGI'],
      ['intelligencePercent', 'INT'],
      ['vitalityPercent', 'VIT'],
      ['perceptionPercent', 'PER'],
    ];
    percentRules.forEach(([key, label]) => this._appendPercentBonusLine(lines, bonus, key, label));

    const rawRules = [
      ['strength', 'strengthPercent', 'STR'],
      ['agility', 'agilityPercent', 'AGI'],
      ['intelligence', 'intelligencePercent', 'INT'],
      ['vitality', 'vitalityPercent', 'VIT'],
      ['perception', 'perceptionPercent', 'PER'],
    ];
    rawRules.forEach(([rawKey, percentKey, label]) =>
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
      perBonus: (bonus) => bonus?.perceptionPercent || bonus?.perception || 0,
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
    // Count native Discord buttons (class*="button") plus our own custom buttons
    const nativeButtons = toolbar.querySelectorAll?.('[class*="button"], [aria-label]');
    // Lowered threshold — Discord may show 2-3 buttons in some contexts (e.g., DMs, threads)
    return !!nativeButtons && nativeButtons.length >= 2;
  }

  getToolbarContainer() {
    const now = Date.now();
    const cached = this._toolbarCache?.element;
    const cacheFresh =
      cached && this._toolbarCache.time && now - this._toolbarCache.time < this._toolbarCache.ttl;
    if (cacheFresh && this.isValidToolbarContainer(cached)) {
      return cached;
    }

    // Find Discord's button row in the chat text area
    const buttonRow = (() => {
      const textArea =
        document.querySelector('[class*="channelTextArea"]') ||
        document.querySelector('[class*="slateTextArea"]') ||
        document.querySelector('textarea[placeholder*="Message"]');

      if (!textArea) return null;

      // Strategy 1: Look for a "buttons" (plural) container class — Discord often uses this
      const innerArea =
        textArea.querySelector('[class*="inner"]') ||
        textArea.querySelector('[class*="buttons"]') ||
        textArea;
      const scope =
        textArea.closest('[class*="channelTextArea"]') || textArea.parentElement?.parentElement;
      if (scope) {
        const buttonsContainer = scope.querySelector('[class*="buttons"]');
        if (buttonsContainer && buttonsContainer.children.length >= 2) return buttonsContainer;
      }

      // Strategy 2: Walk up from textArea and find a narrow container, then look for buttons
      const container =
        textArea.closest('[class*="channelTextArea"]') ||
        textArea.closest('[class*="inner"]') ||
        textArea.parentElement?.parentElement?.parentElement;

      if (container) {
        // Look for button row — check for aria-label buttons (Discord sets these)
        const ariaButtons = container.querySelectorAll('[aria-label]');
        if (ariaButtons.length >= 2) {
          const parent = ariaButtons[0]?.parentElement;
          if (parent && parent.children.length >= 2) return parent;
        }

        // Check for elements with "button" in class name
        const buttons = container.querySelectorAll('[class*="button"]');
        if (buttons.length >= 2) return buttons[0]?.parentElement;

        // Check for named button containers
        const buttonContainer =
          container.querySelector('[class*="buttons"]') ||
          container.querySelector('[class*="buttonContainer"]') ||
          container.querySelector('[class*="actionButtons"]');
        if (buttonContainer) return buttonContainer;
      }

      // Strategy 3: Broader search — find emoji/gif/sticker/attach buttons by aria-label
      const chatArea = document.querySelector('[class*="chat-"]') || document;
      const knownButton = chatArea.querySelector(
        '[aria-label*="emoji" i], [aria-label*="gif" i], ' +
        '[aria-label*="sticker" i], [aria-label*="attach" i], ' +
        '[class*="emojiButton"], [class*="attachButton"]'
      );
      if (knownButton?.parentElement) return knownButton.parentElement;

      // Strategy 4: Fallback — look for a row of buttons near emoji/gif/attach elements
      const el = Array.from(chatArea.querySelectorAll('[class*="button"]')).find((el) => {
        const siblings = Array.from(el.parentElement?.children || []);
        return (
          siblings.length >= 2 &&
          siblings.some(
            (s) =>
              s.querySelector('[class*="emoji"]') ||
              s.querySelector('[class*="gif"]') ||
              s.querySelector('[class*="attach"]') ||
              s.querySelector('[class*="sticker"]')
          )
        );
      });
      return el?.parentElement || null;
    })();

    const toolbar = buttonRow || null;
    this._toolbarCache.element = toolbar;
    this._toolbarCache.time = now;
    return this.isValidToolbarContainer(toolbar) ? toolbar : null;
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
    this._loadSLUtils();
    this._components = buildTitleComponents(this);
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
      console.error('[TitleManager] SLUtils not available — toolbar button inactive');
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
      console.error('[TitleManager] Failed to unregister toolbar button:', error);
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

    const cssContent = `
      /* Main Button - Matching Discord native toolbar buttons (GIF, Stickers, Emoji) */
      .tm-title-button-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0 0 0 4px;
        box-sizing: border-box;
      }
      .tm-title-button {
        background: transparent;
        border: 1px solid rgba(138, 43, 226, 1);
        border-radius: 2px;
        width: 32px;
        height: 32px;
        cursor: pointer;
        color: var(--interactive-normal, #b9bbbe);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease, background-color 0.15s ease;
        margin: 0;
        flex-shrink: 0;
        padding: 0;
        box-sizing: border-box;
      }

      .tm-title-button svg {
        width: 20px;
        height: 20px;
        transition: color 0.15s ease;
        display: block;
      }

      .tm-title-button:hover {
        color: var(--interactive-hover, #dcddde);
        background: rgba(138, 43, 226, 0.15);
        border-color: rgba(138, 43, 226, 0.85);
      }

      .tm-title-button:active {
        color: var(--interactive-active, #fff);
        background: rgba(138, 43, 226, 0.25);
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
        border-radius: 2px;
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
        border-radius: 2px;
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
        border-radius: 2px;
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
        border-radius: 2px;
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
        border-radius: 2px;
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
        border-radius: 2px;
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
        border-radius: 2px;
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
        border-radius: 2px;
        display: inline-block;
      }

      .tm-equip-btn {
        width: 100%;
        padding: 8px;
        background: linear-gradient(135deg, #8a2be2 0%, #8a2be2 100%);
        border: 2px solid rgba(138, 43, 226, 0.8);
        border-radius: 2px;
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
            result && this._modalForceUpdate?.();
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
    // Use event-based URL change detection (more efficient than polling)
    let lastUrl = window.location.href;

    const handleUrlChange = () => {
      // FUNCTIONAL: Guard clause (keep for early return)
      if (this._isStopped) return;

      const currentUrl = window.location.href;
      // FUNCTIONAL: Short-circuit for URL change (no if-else)
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // React patcher handles button persistence on channel switch — no manual re-creation needed.
      }
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
        if (this._isStopped || document.hidden) return;
        // React patcher handles button persistence — no manual re-creation needed.
      })
    );

    // Store cleanup function
    this._windowFocusCleanup = () => {
      window.removeEventListener('blur', this._boundHandleBlur);
      window.removeEventListener('focus', this._boundHandleFocus);
      document.removeEventListener('visibilitychange', this._boundHandleVisibilityChange);
    };
  }

  // NOTE: startPeriodicButtonCheck() and stopPeriodicButtonCheck() removed in v1.3.0.
  // React patcher handles button persistence natively.

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
    // React patcher handles button persistence — no manual re-creation needed.
  }

  openTitleModal() {
    // If already open, just force-update the React tree
    if (this._modalReactRoot) {
      this._modalForceUpdate?.();
      return;
    }

    const createRoot = this._getCreateRoot();
    if (!createRoot) {
      console.error('[TitleManager] createRoot unavailable — cannot open modal');
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
