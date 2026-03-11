/**
 * @name SkillTree
 * @author BlueFlashX1
 * @description Solo Leveling lore-appropriate skill tree system with upgradeable passive abilities
 * @version 3.0.0
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
 * VERSION HISTORY
 * ============================================================================
 *
 * @changelog v3.0.0 (2026-02-17)
 * - Migrated modal rendering from innerHTML to React (BdApi.React + createRoot)
 * - Component factory: buildSkillTreeComponents() with closure access to plugin
 * - useReducer force-update bridge for imperative plugin logic -> React re-renders
 * - Reset dialog now a React sub-component inside modal
 * - Removed ~320 lines of dead innerHTML + event delegation code
 * - Zero visual regressions (all existing CSS classes preserved)
 *
 * @changelog v2.0.1 (2025-12-03)
 * - Code structure improvements (section headers, better organization)
 * - Console log cleanup (removed verbose debug logs)
 * - Performance optimizations
 *
 * ============================================================================
 * TABLE OF CONTENTS
 * ============================================================================
 * §1  Loader + React Component Factory
 * §2  Lifecycle (start/stop) + watchers
 * §3  Settings + SP/bonus calculations
 * §4  Active Skills system
 * §5  Unlock/upgrade planning + UI rendering
 */

const { buildSkillTreeComponents } = require("./components");
const { ActiveSkillMethods } = require("./active-skill-methods");
const { createSkillTreeData } = require("./data");
const { SkillTreeUpgradeMethods } = require("./skill-upgrade-methods");
const { injectSkillTreeCss } = require("./styles");
const { SkillTreeUiMethods } = require("./ui-methods");
const { _PluginUtils, _ReactUtils, _SLUtils } = require("./shared-utils");
const { createToast } = require("../shared/toast");
const { getCreateRoot: _sharedGetCreateRoot } = require("../shared/react-dom");

module.exports = class SkillTree {
  // ============================================================================
  // §1 CONSTRUCTOR & INITIALIZATION
  // ============================================================================
  constructor() {
    const data = createSkillTreeData();
    this.defaultSettings = data.defaultSettings;
    this.skillTree = data.skillTree;
    this.activeSkillDefs = data.activeSkillDefs;
    this.activeSkillOrder = data.activeSkillOrder;

    this._retryTimeouts = new Set();
    this._isStopped = true;
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
    this._modalContainer = null;
    this._modalReactRoot = null;
    this._modalForceUpdate = null;
    this._components = null;

    // CRITICAL FIX: Deep copy to prevent defaultSettings corruption
    this.settings = structuredClone(this.defaultSettings);
    this.skillTreeButton = null;
    this.levelCheckInterval = null; // Deprecated - using events instead
    this.eventUnsubscribers = []; // Store unsubscribe functions for event listeners
    this._urlChangeCleanup = null; // Cleanup function for URL change watcher
    this._windowFocusCleanup = null; // Cleanup function for window focus watcher
    // _composerObserver removed — React patcher handles button persistence
    this._manaRegenInterval = null; // Mana regeneration interval
    this._activeSkillTimers = {};   // Expiry timers for active skills { skillId: timeoutId }

    // Performance caches
    this._cache = {
      soloLevelingData: null,
      soloLevelingDataTime: 0,
      soloLevelingDataTTL: 100, // 100ms - data changes frequently
      soloPluginInstance: null, // Cache plugin instance to avoid repeated lookups
      soloPluginInstanceTime: 0,
      soloPluginInstanceTTL: 5000, // 5s - plugin instance doesn't change often
      skillBonuses: null, // Cache calculated skill bonuses
      skillBonusesTime: 0,
      skillBonusesTTL: 500, // 500ms - bonuses change when skills are upgraded
    };
  }

  // ============================================================================
  // §2 LIFECYCLE METHODS (start/stop)
  // ============================================================================

  start() {
    this._toast = _PluginUtils?.createToastHelper?.("skillTree") || createToast();
    if (!this._isStopped) this.stop();
    // Reset stopped flag to allow watchers to recreate
    this._isStopped = false;

    this.loadSettings();
    this._loadSLUtils();

    // Init React components factory (v3.0.0)
    this._components = buildSkillTreeComponents(this);

    // Calculate and save spent SP based on existing skill upgrades
    // This ensures accurate SP calculations if skills were already upgraded
    this.initializeSpentSP();

    this.injectCSS();

    // Register toolbar button via SLUtils React patcher (React-only, no DOM fallback).
    if (this._SLUtils?.registerToolbarButton) {
      this._SLUtils.registerToolbarButton({
        id: 'st-skill-tree-button-wrapper',
        priority: 20, // After TitleManager (10)
        renderReact: (React, _channel) => this._renderSkillTreeButtonReact(React),
        cleanup: () => {
          this.skillTreeButton = null;
        },
      });
    } else {
      console.error('[SkillTree] SLUtils not available — toolbar button inactive');
    }
    this.saveSkillBonuses();

    // Watch for channel changes and recreate button
    this.setupChannelWatcher();

    // Watch for window focus/visibility changes (user coming back from another window)
    this.setupWindowFocusWatcher();

    // Watch for level ups from SoloLevelingStats (event-based, will retry if not ready)
    this.setupLevelUpWatcher();

    // Recalculate SP on startup based on current level
    this.recalculateSPFromLevel();

    // Start fallback polling only if event subscription isn't available.
    this.startLevelPolling();

    // Active skills: restore timers for skills that were active before reload
    this.restoreActiveSkillTimers();
    this.saveActiveBuffs();

    // Start mana regeneration
    this.startManaRegen();
  }

  _setTrackedTimeout(callback, delayMs) {
    const wrappedCallback = () => {
      this._retryTimeouts.delete(timeoutId);
      if (this._isStopped) return;
      callback();
    };
    const timeoutId = setTimeout(wrappedCallback, delayMs);
    this._retryTimeouts.add(timeoutId);
    return timeoutId;
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
    // Use top-level _SLUtils (loaded during module evaluation via require)
    this._SLUtils = _SLUtils || window.SoloLevelingUtils || null;
  }

  /**
   * Get React 18 createRoot with webpack fallbacks (same pattern as ShadowExchange)
   */
  _getCreateRoot() {
    if (_ReactUtils?.getCreateRoot) return _ReactUtils.getCreateRoot();
    return _sharedGetCreateRoot();
  }

  /**
   * Render SkillTree button as a React element (for SLUtils Tier 1 React toolbar patcher).
   * Returns a React element that will be injected into ChatButtonsGroup.type children.
   * @param {Object} React - BdApi.React
   * @returns {ReactElement}
   */
  _renderSkillTreeButtonReact(React) {
    if (this._isStopped) return null;

    const pluginInstance = this;
    const sp = this.settings?.skillPoints ?? 0;

    // SVG path for dataflow icon
    const svgPath = 'M12 4V15.2C12 16.8802 12 17.7202 12.327 18.362C12.6146 18.9265 13.0735 19.3854 13.638 19.673C14.2798 20 15.1198 20 16.8 20H17M17 20C17 21.1046 17.8954 22 19 22C20.1046 22 21 21.1046 21 20C21 18.8954 20.1046 18 19 18C17.8954 18 17 18.8954 17 20ZM7 4L17 4M7 4C7 5.10457 6.10457 6 5 6C3.89543 6 3 5.10457 3 4C3 2.89543 3.89543 2 5 2C6.10457 2 7 2.89543 7 4ZM17 4C17 5.10457 17.8954 6 19 6C20.1046 6 21 5.10457 21 4C21 2.89543 20.1046 2 19 2C17.8954 2 17 2.89543 17 4ZM12 12H17M17 12C17 13.1046 17.8954 14 19 14C20.1046 14 21 13.1046 21 12C21 10.8954 20.1046 10 19 10C17.8954 10 17 10.8954 17 12Z';

    return React.createElement(
      'div',
      {
        id: 'st-skill-tree-button-wrapper',
        className: 'st-skill-tree-button-wrapper',
        style: { display: 'flex', alignItems: 'center' },
      },
      React.createElement(
        'button',
        {
          className: 'st-skill-tree-button',
          title: `Skill Tree (${sp} SP)`,
          onClick: () => pluginInstance.showSkillTreeModal(),
          ref: (el) => {
            if (el && el !== pluginInstance.skillTreeButton) {
              pluginInstance.skillTreeButton = el;
            }
          },
        },
        React.createElement(
          'svg',
          {
            width: '20',
            height: '20',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '2',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            style: { display: 'block', margin: 'auto' },
          },
          React.createElement('path', { d: svgPath })
        )
      )
    );
  }

  startLevelPolling() {
    // Only poll when we have no event-based subscriber yet.
    if (this.eventUnsubscribers.length > 0) return;
    if (this.levelCheckInterval) return;
    this.levelCheckInterval = setInterval(() => {
      if (this._isStopped || document.hidden) return;
      this.checkForLevelUp();
      this.recalculateSPFromLevel();
    }, 15000);
  }

  stopLevelPolling() {
    if (!this.levelCheckInterval) return;
    clearInterval(this.levelCheckInterval);
    this.levelCheckInterval = null;
  }

  // ============================================================================
  // §3 EVENT HANDLING & WATCHERS
  // ============================================================================
  setupLevelUpWatcher() {
    // Return early if plugin is stopped to prevent recreating watchers
    if (this._isStopped) {
      return;
    }
    if (this.eventUnsubscribers.length > 0) {
      return;
    }

    // Subscribe to SoloLevelingStats levelChanged events for real-time updates
    const instance = this._SLUtils?.getPluginInstance?.('SoloLevelingStats');
    if (!instance) {
      // Retry after a delay - SoloLevelingStats might still be loading or disabled
      this._setTrackedTimeout(() => this.setupLevelUpWatcher(), 2000);
      return;
    }
    if (!instance || typeof instance.on !== 'function') {
      // Retry after a delay - Event system might not be ready yet
      this._setTrackedTimeout(() => this.setupLevelUpWatcher(), 2000);
      return;
    }

    // Subscribe to level changed events
    const unsubscribeLevel = instance.on('levelChanged', (data) => {
      // Invalidate cache since level changed
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;

      const lastLevel = this.settings.lastLevel || 1;
      if (data.newLevel > lastLevel) {
        const levelsGained = data.newLevel - lastLevel;
        this.awardSPForLevelUp(levelsGained);
        this.settings.lastLevel = data.newLevel;
        this.saveSettings();
      }
    });
    this.eventUnsubscribers.push(unsubscribeLevel);
    this.stopLevelPolling();

    // Initial check on startup
    this.checkForLevelUp();
  }

  stop() {
    // Set stopped flag to prevent recreating watchers
    this._isStopped = true;

    // Unregister from shared SLUtils toolbar registry (if registered)
    try {
      this._SLUtils?.unregisterToolbarButton?.('st-skill-tree-button-wrapper');
    } catch (error) {
      console.error('[SkillTree] Failed to unregister toolbar button:', error);
    }

    // Unsubscribe from events
    this.unsubscribeFromEvents();

    // Clear intervals
    this.stopLevelPolling();
    this.stopManaRegen();

    // Clear active skill expiry timers
    Object.values(this._activeSkillTimers).forEach((tid) => clearTimeout(tid));
    this._activeSkillTimers = {};

    // Clear all tracked retry timeouts
    this._retryTimeouts.forEach((timeoutId) => this._clearTrackedTimeout(timeoutId));
    this._retryTimeouts.clear();

    // Cleanup URL change watcher with guaranteed execution
    if (this._urlChangeCleanup) {
      try {
        this._urlChangeCleanup();
      } catch (e) {
        console.error('[SkillTree] Error during URL change watcher cleanup:', e);
      } finally {
        this._urlChangeCleanup = null;
      }
    }

    // Cleanup window focus watcher
    if (this._windowFocusCleanup) {
      try {
        this._windowFocusCleanup();
      } catch (e) {
        console.error('[SkillTree] Error during window focus watcher cleanup:', e);
      } finally {
        this._windowFocusCleanup = null;
      }
    }

    // Remove UI elements
    if (this.skillTreeButton) {
      this.skillTreeButton.remove();
      this.skillTreeButton = null;
    }

    // Clear all caches
    this._cache.soloLevelingData = null;
    this._cache.soloLevelingDataTime = 0;
    this._cache.soloPluginInstance = null;
    this._cache.soloPluginInstanceTime = 0;
    this._cache.skillBonuses = null;
    this._cache.skillBonusesTime = 0;

    // No toolbar observer or composer observer to clean up — React patcher
    // handles button lifecycle via SLUtils.unregisterToolbarButton().

    // React modal cleanup (v3.0.0)
    this.closeSkillTreeModal();

    this.detachSkillTreeSettingsPanelHandlers();

    // Remove CSS using BdApi (with fallback for compatibility)
    if (BdApi.DOM && BdApi.DOM.removeStyle) {
      BdApi.DOM.removeStyle('skilltree-css');
    } else {
      // Fallback: direct DOM removal if BdApi method unavailable
      const styleElement = document.getElementById('skilltree-css');
      if (styleElement) {
        styleElement.remove();
      }
    }
  }

  detachSkillTreeSettingsPanelHandlers() {
    const root = this._settingsPanelRoot;
    const handlers = this._settingsPanelHandlers;
    if (root && handlers) {
      root.removeEventListener('change', handlers.onChange);
      root.removeEventListener('click', handlers.onClick);
    }
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
  }

  // ============================================================================
  // §4 LEVEL-UP & SP MANAGEMENT
  // ============================================================================
  checkForLevelUp() {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.level) return;

      const currentLevel = soloData.level;
      const lastLevel = this.settings.lastLevel || 1;

      if (currentLevel > lastLevel) {
        // Level up detected!
        const levelsGained = currentLevel - lastLevel;
        this.awardSPForLevelUp(levelsGained);
        this.settings.lastLevel = currentLevel;
        this.saveSettings();
      }
    } catch (error) {
      console.error('SkillTree: Error checking level up', error);
    }
  }

  /**
   * Calculate total SP that should be earned based on level
   * Fixed gain: 1 SP per level (no diminishing returns)
   * @param {number} level - Current level
   * @returns {number} - Total SP earned
   */
  calculateSPForLevel(level) {
    // 1 SP per level (level 1 = 0 SP, level 2 = 1 SP, level 3 = 2 SP, etc.)
    return Math.max(0, level - 1);
  }

  /**
   * Award SP when leveling up (fixed 1 SP per level)
   * @param {number} levelsGained - Number of levels gained
   */
  awardSPForLevelUp(levelsGained) {
    const spEarned = levelsGained; // 1 SP per level
    this.settings.skillPoints += spEarned;
    this.settings.totalEarnedSP += spEarned;
    this.saveSettings();

    // FUNCTIONAL: Show notification (optional chaining, no if-else)
    BdApi?.showToast?.(`Level Up! +${spEarned} Skill Point${spEarned > 1 ? 's' : ''}`, {
      type: 'success',
      timeout: 3000,
    });
  }

  /**
   * Debug logging helper (checks debugMode setting)
   */
  debugLog(...args) {
    if (this.settings?.debugMode) {
      console.log('[SkillTree]', ...args);
    }
  }

  /**
   * Recalculate SP based on current level (for reset or initial setup)
   * Always syncs level and ensures SP matches current level
   */
  recalculateSPFromLevel() {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.level) return;

      const currentLevel = soloData.level;
      const expectedSP = this.calculateSPForLevel(currentLevel);
      const lastLevel = this.settings.lastLevel || 1;

      // Always update last level to current level (keep in sync)
      if (currentLevel !== lastLevel) {
        this.settings.lastLevel = currentLevel;

        // If level increased, award SP for the level difference
        if (currentLevel > lastLevel) {
          const levelsGained = currentLevel - lastLevel;
          this.awardSPForLevelUp(levelsGained);
        }
      }

      // Always ensure totalEarnedSP matches expected SP for current level
      if (this.settings.totalEarnedSP < expectedSP) {
        this.settings.totalEarnedSP = expectedSP;
      }

      // SP calculation: totalEarnedSP - spentSP = availableSP
      // Always recalculate spent SP to ensure accuracy
      const spentSP = this.getTotalSpentSP();
      const currentAvailable = this.settings.skillPoints;
      const expectedAvailable = Math.max(0, expectedSP - spentSP); // Prevent negative SP

      // If spentSP exceeds expectedSP, there's a calculation error - reset skills
      if (spentSP > expectedSP) {
        this.debugLog(
          `SP calculation error: spent ${spentSP} but only earned ${expectedSP}. Resetting skills...`
        );
        // CRITICAL FIX: Instead of just capping, reset all skills to fix data corruption
        // This prevents infinite loops and ensures data integrity
        this.settings.skillLevels = {};
        this.settings.unlockedSkills = [];
        this.settings.totalSpentSP = 0;
        this.settings.skillPoints = expectedSP;
        this.settings.totalEarnedSP = expectedSP;
        this.saveSettings();
        this.saveSkillBonuses(); // Clear skill bonuses

        this.debugLog(`Reset all skills due to calculation error. Available SP: ${expectedSP}`);

        // Show toast notification
        BdApi?.showToast?.(
          `Skills reset due to calculation error. You have ${expectedSP} SP for level ${currentLevel}`,
          { type: 'warning', timeout: 5000 }
        );

        return; // Exit early after fixing
      }

      // Ensure available SP matches expected (always accurate)
      if (currentAvailable !== expectedAvailable) {
        this.settings.skillPoints = expectedAvailable;
      }
      // Single save if SP changed or level changed
      if (currentAvailable !== expectedAvailable || currentLevel !== lastLevel) {
        this.saveSettings();
      }
    } catch (error) {
      console.error('SkillTree: Error recalculating SP', error);
    }
  }

  /**
   * Reset all skills and recalculate SP based on current level
   * Useful when skills were unlocked ahead of level
   */
  resetSkills() {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.level) {
        BdApi?.showToast?.('Cannot reset: SoloLevelingStats not available', {
          type: 'error',
          timeout: 3000,
        });
        return false;
      }

      // Calculate correct SP for current level
      const currentLevel = soloData.level;
      const expectedSP = this.calculateSPForLevel(currentLevel);

      // Reset all skills
      this.settings.skillLevels = {};
      this.settings.unlockedSkills = [];
      this.settings.totalSpentSP = 0; // Reset spent SP
      this.settings.skillPoints = expectedSP;
      this.settings.totalEarnedSP = expectedSP;
      this.settings.lastLevel = currentLevel;

      this.saveSettings();
      this.saveSkillBonuses();

      BdApi?.showToast?.(`Skills Reset! You have ${expectedSP} SP for level ${currentLevel}`, {
        type: 'success',
        timeout: 4000,
      });

      // Refresh modal if open (React v3.0.0: uses forceUpdate)
      if (this._modalForceUpdate) {
        this._modalForceUpdate();
      }

      return true;
    } catch (error) {
      console.error('SkillTree: Error resetting skills', error);
      return false;
    }
  }

  // ============================================================================
  // §5 SETTINGS MANAGEMENT
  // ============================================================================
  loadSettings() {
    try {
      const saved = BdApi.Data.load('SkillTree', 'settings');
      // FUNCTIONAL: Short-circuit merge and migration (no if-else)
      saved &&
        ((this.settings = { ...this.defaultSettings, ...saved }),
        this.settings.unlockedSkills?.length > 0 &&
          ((this.settings.skillLevels = this.settings.skillLevels || {}),
          this.settings.unlockedSkills.forEach(
            (skillId) =>
              (this.settings.skillLevels[skillId] = this.settings.skillLevels[skillId] || 1)
          ),
          (this.settings.unlockedSkills = []),
          this.saveSettings()));

      // v2.5 skill ID rename migration (lore-accurate names)
      const renameMap = {
        shadow_storage: 'shadow_preservation',
        basic_combat: 'daggers_dance',
        dagger_throw: 'dagger_rush',
        instant_dungeon: 'gate_creation',
        mana_sense: 'kandiarus_blessing',
        domain_expansion: 'monarchs_domain',
        absolute_ruler: 'rulers_domain',
        void_mastery: 'shadow_realm',
        dimension_ruler: 'gate_ruler',
        omnipotent_presence: 'dragons_fear',
        eternal_shadow: 'ashborns_will',
        true_monarch: 'shadow_sovereign',
      };
      if (this.settings.skillLevels) {
        let migrated = false;
        for (const [oldId, newId] of Object.entries(renameMap)) {
          if (this.settings.skillLevels[oldId] !== undefined) {
            this.settings.skillLevels[newId] = this.settings.skillLevels[oldId];
            delete this.settings.skillLevels[oldId];
            migrated = true;
          }
        }
        if (migrated) this.saveSettings();
      }
    } catch (error) {
      console.error('SkillTree: Error loading settings', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('SkillTree', 'settings', this.settings);
      this.saveSkillBonuses(); // Update bonuses in shared storage
      this.saveActiveBuffs();  // Update active buff effects in shared storage
    } catch (error) {
      console.error('SkillTree: Error saving settings', error);
    }
  }

  // ============================================================================
  // §6 SKILL BONUS CALCULATION
  // ============================================================================
  /**
   * Save skill bonuses to shared storage for SoloLevelingStats to read
   */
  saveSkillBonuses() {
    try {
      const bonuses = this.calculateSkillBonuses();
      BdApi.Data.save('SkillTree', 'bonuses', bonuses);
    } catch (error) {
      console.error('SkillTree: Error saving bonuses', error);
    }
  }

  /**
   * Save active skill buff effects to shared storage for SoloLevelingStats to read
   * SLS reads this via BdApi.Data.load('SkillTree', 'activeBuffs')
   */
  saveActiveBuffs() {
    try {
      const effects = this.getActiveBuffEffects();
      BdApi.Data.save('SkillTree', 'activeBuffs', effects);
    } catch (error) {
      console.error('SkillTree: Error saving active buffs', error);
    }
  }

  /**
   * Calculate total bonuses from all unlocked and upgraded skills
   * @returns {Object} - Object with xpBonus, critBonus, longMsgBonus, questBonus, allStatBonus
   */
  calculateSkillBonuses() {
    // Check cache first
    const now = Date.now();
    if (
      this._cache.skillBonuses &&
      this._cache.skillBonusesTime &&
      now - this._cache.skillBonusesTime < this._cache.skillBonusesTTL
    ) {
      return this._cache.skillBonuses;
    }

    const bonuses = {
      xpBonus: 0,
      critBonus: 0,
      longMsgBonus: 0,
      questBonus: 0,
      allStatBonus: 0,
    };

    // Calculate bonuses from all skills at their current levels
    Object.values(this.skillTree).forEach((tier) => {
      if (!tier.skills) return;

      tier.skills.forEach((skill) => {
        const effect = this.getSkillEffect(skill, tier);
        if (effect) {
          if (effect.xpBonus) bonuses.xpBonus += effect.xpBonus;
          if (effect.critBonus) bonuses.critBonus += effect.critBonus;
          if (effect.longMsgBonus) bonuses.longMsgBonus += effect.longMsgBonus;
          if (effect.questBonus) bonuses.questBonus += effect.questBonus;
          if (effect.allStatBonus) bonuses.allStatBonus += effect.allStatBonus;
        }
      });
    });

    // Cache the result
    this._cache.skillBonuses = bonuses;
    this._cache.skillBonusesTime = now;

    return bonuses;
  }

  // Active-skill methods are mixed in from active-skill-methods.js

  // ============================================================================
  // §8 DATA ACCESS METHODS
  // ============================================================================
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
      const instance = this._getSoloLevelingInstance(now);
      if (!instance) {
        this._cache.soloLevelingData = null;
        this._cache.soloLevelingDataTime = now;
        this._cache.soloPluginInstance = null;
        this._cache.soloPluginInstanceTime = 0;
        return null;
      }

      const result = {
        stats: instance.settings?.stats || {},
        level: instance.settings?.level || 1,
        totalXP: instance.settings?.totalXP || 0,
        userMana: instance.settings?.userMana,
        userMaxMana: instance.settings?.userMaxMana,
      };

      // Cache the result
      this._cache.soloLevelingData = result;
      this._cache.soloLevelingDataTime = now;

      return result;
    } catch (error) {
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = now;
      return null;
    }
  }

  /**
   * Initialize spent SP on startup based on existing skill upgrades
   * This ensures accurate SP calculations if skills were already upgraded
   * Operations:
   * 1. Calculate total spent SP from existing skill levels
   * 2. Save it to settings
   * 3. Recalculate available SP to ensure accuracy
   */
  initializeSpentSP() {
    try {
      // Calculate spent SP from existing skill levels
      const spentSP = this.getTotalSpentSP();

      // Recalculate available SP based on earned SP and spent SP
      const soloData = this.getSoloLevelingData();
      if (soloData && soloData.level) {
        const expectedSP = this.calculateSPForLevel(soloData.level);
        const expectedAvailable = expectedSP - spentSP;

        // Ensure totalEarnedSP matches expected SP
        if (this.settings.totalEarnedSP < expectedSP) {
          this.settings.totalEarnedSP = expectedSP;
        }

        // Update available SP to match expected (ensures accuracy)
        if (this.settings.skillPoints !== expectedAvailable) {
          this.settings.skillPoints = expectedAvailable;
          this.saveSettings();
        }
      }

      // If we have spent SP but it wasn't saved, save it now
      if (spentSP > 0 && this.settings.totalSpentSP !== spentSP) {
        this.settings.totalSpentSP = spentSP;
        this.saveSettings();
      }
    } catch (error) {
      console.error('SkillTree: Error initializing spent SP', error);
    }
  }

  /**
   * Calculate total SP spent on skills
   * Updates the in-memory totalSpentSP in settings
   * @returns {number} - Total SP spent
   */
  getTotalSpentSP() {
    let totalSpent = 0;

    Object.values(this.skillTree).forEach((tier) => {
      if (!tier.skills) return;

      tier.skills.forEach((skill) => {
        const skillLevel = this.getSkillLevel(skill.id);
        if (skillLevel > 0) {
          // Calculate SP spent: unlock cost + upgrade costs
          totalSpent += this.getSkillUnlockCost(skill, tier);
          totalSpent += this.getSkillUpgradeCost(skill, tier, skillLevel);
        }
      });
    });

    // Update in-memory value; callers decide when to persist to avoid excess writes.
    this.settings.totalSpentSP = totalSpent;

    return totalSpent;
  }

  // Skill-upgrade methods are mixed in from skill-upgrade-methods.js

  /**
   * Unsubscribe from all SoloLevelingStats events
   */
  unsubscribeFromEvents() {
    this.eventUnsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        console.error('SkillTree: Error unsubscribing from events', error);
      }
    });
    this.eventUnsubscribers = [];
  }

  // ... (rest of the UI methods remain the same, but need to be updated to show skill levels and upgrade costs)
  // §11 UI RENDERING (modal, toolbar button, CSS theme)

  injectCSS() {
    injectSkillTreeCss();
  }

  // UI helpers/watchers are mixed in from ui-methods.js

  // ============================================================================
  // §12 DEBUGGING & DEVELOPMENT
  // ============================================================================

  getSettingsPanel() {
    this.detachSkillTreeSettingsPanelHandlers();
    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.style.background = '#1e1e2e';
    panel.style.borderRadius = '8px';
    panel.innerHTML = `
      <div>
        <h3 style="color: #8a2be2; margin-bottom: 20px;">Skill Tree Settings</h3>

        <label style="display: flex; align-items: center; margin-bottom: 15px;">
          <input type="checkbox" ${this.settings.debugMode ? 'checked' : ''} id="st-debug">
          <span style="margin-left: 10px;">Debug Mode (Show console logs)</span>
        </label>

        <div style="margin-top: 15px; padding: 10px; background: #1a0e2e; border-radius: 0; border-left: 3px solid #8a2be2;">
          <div style="color: #8a2be2; font-weight: bold; margin-bottom: 5px;">Debug Information</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            Enable Debug Mode to see detailed console logs for:
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>Level up detection and SP rewards</li>
              <li>Skill unlock/upgrade operations</li>
              <li>Settings load/save operations</li>
              <li>Button creation and retries</li>
              <li>Event system and watchers</li>
              <li>Error tracking and debugging</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    const onChange = (event) => {
      const target = event.target;

      if (target?.id === 'st-debug') {
        this.settings.debugMode = target.checked;
        this.saveSettings();
        this.debugLog('SETTINGS', 'Debug mode toggled', { enabled: target.checked });
      }
    };

    panel.addEventListener('change', onChange);
    this._settingsPanelRoot = panel;
    this._settingsPanelHandlers = { onChange };

    return panel;
  }

};

Object.assign(
  module.exports.prototype,
  ActiveSkillMethods,
  SkillTreeUpgradeMethods,
  SkillTreeUiMethods
);
