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

const PASSIVE_BONUS_TUNING = {
  xpBonus: { softCap: 0.8, hardCap: 2.2, taperScale: 0.55 },
  critBonus: { softCap: 0.12, hardCap: 0.35, taperScale: 0.1 },
  critDamageBonus: { softCap: 0.55, hardCap: 1.75, taperScale: 0.28 },
  longMsgBonus: { softCap: 0.25, hardCap: 0.9, taperScale: 0.24 },
  questBonus: { softCap: 0.2, hardCap: 0.65, taperScale: 0.22 },
  allStatBonus: { softCap: 0.1, hardCap: 0.35, taperScale: 0.16 },
  attackCooldownReduction: { softCap: 0.18, hardCap: 0.35, taperScale: 0.08 },
  daggerThrowDamageBonus: { softCap: 0.45, hardCap: 1.2, taperScale: 0.18 },
  hpRegenBonus: { softCap: 0.4, hardCap: 1.1, taperScale: 0.25 },
  manaRegenBonus: { softCap: 0.4, hardCap: 1.1, taperScale: 0.25 },
  debuffDurationReduction: { softCap: 0.45, hardCap: 0.75, taperScale: 0.12 },
  debuffResistChance: { softCap: 0.22, hardCap: 0.45, taperScale: 0.09 },
  debuffCleanseChance: { softCap: 0.22, hardCap: 0.5, taperScale: 0.1 },
};

const PASSIVE_BONUS_KEYS = Object.freeze([
  'xpBonus',
  'critBonus',
  'critDamageBonus',
  'longMsgBonus',
  'questBonus',
  'allStatBonus',
  'attackCooldownReduction',
  'daggerThrowDamageBonus',
  'hpRegenBonus',
  'manaRegenBonus',
  'debuffDurationReduction',
  'debuffResistChance',
  'debuffCleanseChance',
  'flatMana',
  'manaCostReduction',
]);

const STATIC_PASSIVE_BONUS_KEYS = Object.freeze([
  'tenacityThreshold',
  'tenacityDamageReduction',
  'ariseChanceOverride',
  'shadowGrowthMultiplier',
]);

const { RANK_ORDER: SOLO_RANK_ORDER } = require('../shared/rank-utils');

const KANDIARU_RANK_EFFECTS = Object.freeze({
  E: { xpBonus: 0.03, naturalGrowthMultiplier: 1.08 },
  D: { xpBonus: 0.05, naturalGrowthMultiplier: 1.14 },
  C: { xpBonus: 0.07, naturalGrowthMultiplier: 1.2 },
  B: { xpBonus: 0.09, naturalGrowthMultiplier: 1.26 },
  A: { xpBonus: 0.11, naturalGrowthMultiplier: 1.32 },
  S: { xpBonus: 0.13, naturalGrowthMultiplier: 1.38 },
  SS: { xpBonus: 0.15, naturalGrowthMultiplier: 1.44 },
  SSS: { xpBonus: 0.17, naturalGrowthMultiplier: 1.5 },
  'SSS+': { xpBonus: 0.18, naturalGrowthMultiplier: 1.55 },
  NH: { xpBonus: 0.19, naturalGrowthMultiplier: 1.6 },
  Monarch: { xpBonus: 0.2, naturalGrowthMultiplier: 1.65 },
  'Monarch+': { xpBonus: 0.22, naturalGrowthMultiplier: 1.72 },
  'Shadow Monarch': { xpBonus: 0.22, naturalGrowthMultiplier: 1.72 },
});

// SP curve tuned so full passive maxing is achievable by roughly level 2000.
// f(x) = round((Q*x^2 + L*x) / D), where x = level - 1.
// Constraints:
// - level 1 -> 0 SP
// - level 2000 -> 36229 SP (current total max cost)
const SP_CURVE = Object.freeze({
  quadraticNumerator: 5705,
  linearNumerator: 659962,
  denominator: 665667,
});

module.exports = class SkillTree {
  constructor() {
    const data = createSkillTreeData();
    this.defaultSettings = data.defaultSettings;
    this.innatePassives = data.innatePassives || [];
    this.hiddenBlessings = data.hiddenBlessings || [];
    this.skillTree = data.skillTree;
    this.activeSkillDefs = data.activeSkillDefs;
    this.activeSkillOrder = data.activeSkillOrder;
    this.dungeonCombatSkillDefs = data.dungeonCombatSkillDefs || {};
    this.dungeonCombatSkillOrder = data.dungeonCombatSkillOrder || [];

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
    this._activeSkillTimers = {}; // Expiry timers for active skills { skillId: timeoutId }
    this._activeSkillSustainIntervals = {}; // Sustain mana drain intervals { skillId: intervalId }

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
      hiddenBlessingBonuses: null,
      hiddenBlessingBonusesTime: 0,
      hiddenBlessingBonusesTTL: 500,
    };
  }

  start() {
    this._toast = _PluginUtils?.createToastHelper?.("skillTree") || createToast();
    if (!this._isStopped) this.stop();
    // Restart-safe: clear any stale delayed retries before re-initializing watchers.
    this._retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._retryTimeouts.clear();
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
    this.saveHiddenBlessingBonuses();

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

    this.startManaRegen();

    // Broadcast current skill levels so plugins that started before us
    // (e.g. RulersAuthority, HSLDockAutoHide) can activate their gated resources.
    this._broadcastCurrentSkillLevels();
  }

  _broadcastCurrentSkillLevels() {
    const levels = this.settings?.skillLevels;
    if (!levels) return;
    for (const [skillId, level] of Object.entries(levels)) {
      if ((level || 0) >= 1) {
        try {
          document.dispatchEvent(
            new CustomEvent('SkillTree:skillLevelChanged', {
              detail: { skillId, level },
            })
          );
        } catch (_) { /* ignore dispatch errors */ }
      }
    }
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
        this.awardSPForLevelUp(levelsGained, lastLevel);
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

    this.unsubscribeFromEvents();

    // Clear intervals
    this.stopLevelPolling();
    this.stopManaRegen();

    // Clear active skill expiry timers
    Object.values(this._activeSkillTimers).forEach((tid) => clearTimeout(tid));
    this._activeSkillTimers = {};
    Object.values(this._activeSkillSustainIntervals).forEach((iid) => clearInterval(iid));
    this._activeSkillSustainIntervals = {};

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

  checkForLevelUp() {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.level) return;

      const currentLevel = soloData.level;
      const lastLevel = this.settings.lastLevel || 1;

      if (currentLevel > lastLevel) {
        // Level up detected!
        const levelsGained = currentLevel - lastLevel;
        this.awardSPForLevelUp(levelsGained, lastLevel);
        this.settings.lastLevel = currentLevel;
        this.saveSettings();
      }
    } catch (error) {
      console.error('SkillTree: Error checking level up', error);
    }
  }

  /**
   * Calculate total SP that should be earned based on level.
   * Uses a quadratic growth curve tuned for endgame completion pacing.
   * @param {number} level - Current level
   * @returns {number} - Total SP earned
   */
  calculateSPForLevel(level) {
    const x = Math.max(0, Number(level || 0) - 1);
    const num = SP_CURVE.quadraticNumerator * x * x + SP_CURVE.linearNumerator * x;
    return Math.max(0, Math.round(num / SP_CURVE.denominator));
  }

  /**
   * Award SP when leveling up using the progression curve delta.
   * @param {number} levelsGained - Number of levels gained
   * @param {number} fromLevel - Previous level before gains
   */
  awardSPForLevelUp(levelsGained, fromLevel = this.settings.lastLevel || 1) {
    const safeLevelsGained = Math.max(0, Number(levelsGained) || 0);
    const safeFromLevel = Math.max(1, Number(fromLevel) || 1);
    const toLevel = safeFromLevel + safeLevelsGained;
    const spEarned = Math.max(0, this.calculateSPForLevel(toLevel) - this.calculateSPForLevel(safeFromLevel));
    if (spEarned <= 0) return;

    this.settings.skillPoints += spEarned;
    this.settings.totalEarnedSP += spEarned;
    this.saveSettings();

    // FUNCTIONAL: Show notification (optional chaining, no if-else)
    BdApi?.UI?.showToast?.(`Level Up! +${spEarned} Skill Point${spEarned > 1 ? 's' : ''}`, {
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
      if (!soloData || (soloData.level || 0) <= 1) {
        if (typeof this.debugLog === 'function') this.debugLog('SP_RECALC', 'Skipping SP recalculation — SoloLevelingStats data unavailable or stale');
        return;
      }

      const currentLevel = soloData.level;
      const expectedSP = this.calculateSPForLevel(currentLevel);
      const lastLevel = this.settings.lastLevel || 1;

      // Always update last level to current level (keep in sync)
      if (currentLevel !== lastLevel) {
        // If level increased, award SP for the level difference
        if (currentLevel > lastLevel) {
          const levelsGained = currentLevel - lastLevel;
          this.awardSPForLevelUp(levelsGained, lastLevel);
        }
        this.settings.lastLevel = currentLevel;
      }

      // Always ensure totalEarnedSP matches expected SP for current level.
      if (this.settings.totalEarnedSP !== expectedSP) {
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
        BdApi?.UI?.showToast?.(
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
        BdApi?.UI?.showToast?.('Cannot reset: SoloLevelingStats not available', {
          type: 'error',
          timeout: 3000,
        });
        return false;
      }

      // Calculate correct SP for current level
      const currentLevel = soloData.level;
      const expectedSP = this.calculateSPForLevel(currentLevel);

      // Deactivate all running active skills before reset
      const activeStates = this.settings.activeSkillStates || {};
      Object.keys(activeStates).forEach((skillId) => {
        if (activeStates[skillId]?.active) {
          try {
            this._deactivateSkill(skillId, 'skill_reset');
          } catch (_) { /* ignore deactivation errors during reset */ }
        }
      });
      this.settings.activeSkillStates = {};

      // Collect previously unlocked skills to broadcast level changes.
      // NOTE: unlockedSkills is emptied by the start() migration (line ~729) which
      // moves entries into skillLevels. So after any restart, unlockedSkills is [].
      // We must read from skillLevels (authoritative source) instead.
      const previouslyUnlocked = Object.keys(this.settings.skillLevels || {}).filter(
        (id) => (this.settings.skillLevels[id] || 0) >= 1
      );

      // Reset all skills
      this.settings.skillLevels = {};
      this.settings.unlockedSkills = [];
      this.settings.totalSpentSP = 0; // Reset spent SP
      this.settings.skillPoints = expectedSP;
      this.settings.totalEarnedSP = expectedSP;
      this.settings.lastLevel = currentLevel;

      // Clear skill bonus cache so bonuses recompute to zero
      this._cache.skillBonuses = null;
      this._cache.skillBonusesTime = 0;

      this.saveSettings();
      this.saveSkillBonuses();

      // Broadcast level=0 for all previously unlocked skills so listeners can react
      // (e.g. Stealth locks itself, ShadowArmy tears down extraction resources)
      previouslyUnlocked.forEach((skillId) => {
        try {
          document.dispatchEvent(
            new CustomEvent('SkillTree:skillLevelChanged', {
              detail: { skillId, level: 0 },
            })
          );
        } catch (_) { /* ignore dispatch errors */ }
      });

      BdApi?.UI?.showToast?.(`Skills Reset! You have ${expectedSP} SP for level ${currentLevel}`, {
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

      // Unified lore/canon ID migration for passives + active skills.
      const skillIdRenameMap = {
        // Legacy title-based IDs (pre-v2.5)
        shadow_storage: 'shadow_preservation',
        shadow_preservation: 'shadow_preservation',
        basic_combat: 'advanced_dagger_techniques',
        dagger_throw: 'dagger_throw',
        instant_dungeon: 'vital_points_targeting',
        mana_sense: 'blessing_of_kandiaru',
        domain_expansion: 'domain_of_the_monarch',
        absolute_ruler: 'black_heart_awakened',
        void_mastery: 'shadow_senses',
        dimension_ruler: 'shadow_exchange',
        omnipotent_presence: 'dragons_fear',
        eternal_shadow: 'ashborns_will',
        true_monarch: 'eternal_shadow_monarch',
        // Previous internal IDs (v2.5-v3.0)
        daggers_dance: 'advanced_dagger_techniques',
        advanced_dagger_arts: 'advanced_dagger_techniques',
        kandiarus_blessing: 'blessing_of_kandiaru',
        indomitable_spirit: 'tenacity',
        gate_creation: 'vital_points_targeting',
        dagger_rush: 'dagger_throw',
        ruler_authority: 'rulers_authority',
        monarchs_domain: 'domain_of_the_monarch',
        shadow_army: 'shadow_army_expansion',
        monarch_power: 'black_heart_awakened',
        shadow_monarch: 'black_heart_awakened',
        shadow_monarch_awakening: 'black_heart_awakened',
        arise: 'shadow_extraction',
        ashborn_legacy: 'ashborns_will',
        ashborn_inheritance: 'ashborns_will',
        rulers_domain: 'black_heart_awakened',
        shadow_realm: 'shadow_senses',
        shadow_storage_dominion: 'shadow_senses',
        monarchs_vessel_completion: 'black_heart_awakened',
        commander_of_shadows: 'shadow_army_expansion',
        gate_ruler: 'shadow_exchange',
        shadow_sovereign: 'eternal_shadow_monarch',
      };
      const activeSkillIdRenameMap = {
        stealth_active: 'stealth_technique',
        mutilate: 'mutilation',
      };

      let migrated = false;

      if (this.settings.skillLevels && typeof this.settings.skillLevels === 'object') {
        const nextSkillLevels = {};
        Object.entries(this.settings.skillLevels).forEach(([skillId, rawLevel]) => {
          const targetId = skillIdRenameMap[skillId] || skillId;
          const level = Number(rawLevel) || 0;
          nextSkillLevels[targetId] = Math.max(Number(nextSkillLevels[targetId] || 0), level);
          if (targetId !== skillId) migrated = true;
        });
        this.settings.skillLevels = nextSkillLevels;
      }

      const maxLevelBySkillId = new Map();
      Object.values(this.skillTree).forEach((tier) => {
        const tierMaxLevel = Number(tier?.maxLevel || 0);
        (tier?.skills || []).forEach((skill) => {
          if (!skill?.id) return;
          maxLevelBySkillId.set(skill.id, tierMaxLevel);
        });
      });

      if (this.settings.skillLevels && typeof this.settings.skillLevels === 'object') {
        const normalizedSkillLevels = {};
        Object.entries(this.settings.skillLevels).forEach(([skillId, rawLevel]) => {
          const maxLevel = maxLevelBySkillId.get(skillId);
          if (!maxLevel) {
            migrated = true;
            return;
          }

          const numericLevel = Math.max(0, Number(rawLevel) || 0);
          const clampedLevel = Math.min(maxLevel, numericLevel);
          if (clampedLevel !== numericLevel) migrated = true;
          if (clampedLevel > 0) {
            normalizedSkillLevels[skillId] = clampedLevel;
          }
        });
        this.settings.skillLevels = normalizedSkillLevels;
      }

      if (Array.isArray(this.settings.unlockedSkills) && this.settings.unlockedSkills.length > 0) {
        const migratedUnlocked = [
          ...new Set(this.settings.unlockedSkills.map((skillId) => skillIdRenameMap[skillId] || skillId)),
        ];
        const filteredUnlocked = migratedUnlocked.filter((skillId) => maxLevelBySkillId.has(skillId));
        if (
          filteredUnlocked.length !== this.settings.unlockedSkills.length ||
          filteredUnlocked.some((skillId, index) => skillId !== this.settings.unlockedSkills[index])
        ) {
          migrated = true;
        }
        this.settings.unlockedSkills = filteredUnlocked;
      }

      if (this.settings.activeSkillStates && typeof this.settings.activeSkillStates === 'object') {
        const nextActiveStates = {};
        Object.entries(this.settings.activeSkillStates).forEach(([skillId, state]) => {
          const targetId = activeSkillIdRenameMap[skillId] || skillId;
          if (targetId !== skillId) migrated = true;
          if (!this.activeSkillDefs[targetId]) {
            migrated = true;
            return;
          }

          if (!nextActiveStates[targetId]) {
            nextActiveStates[targetId] = state;
            return;
          }

          const existing = nextActiveStates[targetId] || {};
          const existingScore = Math.max(
            Number(existing.cooldownUntil || 0),
            Number(existing.expiresAt || 0),
            Number(existing.chargesLeft || 0)
          );
          const candidateScore = Math.max(
            Number(state?.cooldownUntil || 0),
            Number(state?.expiresAt || 0),
            Number(state?.chargesLeft || 0)
          );
          if (candidateScore > existingScore) {
            nextActiveStates[targetId] = state;
          }
        });
        this.settings.activeSkillStates = nextActiveStates;
      }

      if (this.settings.combatSkillStates && typeof this.settings.combatSkillStates === 'object') {
        const nextCombatStates = {};
        Object.entries(this.settings.combatSkillStates).forEach(([skillId, state]) => {
          if (!this.dungeonCombatSkillDefs[skillId]) {
            migrated = true;
            return;
          }
          nextCombatStates[skillId] = state;
        });
        this.settings.combatSkillStates = nextCombatStates;
      }

      if (migrated) this.saveSettings();
    } catch (error) {
      console.error('SkillTree: Error loading settings', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('SkillTree', 'settings', this.settings);
      this.saveSkillBonuses(); // Update bonuses in shared storage
      this.saveHiddenBlessingBonuses(); // Update hidden blessing effects in shared storage
      this.saveActiveBuffs();  // Update active buff effects in shared storage
    } catch (error) {
      console.error('SkillTree: Error saving settings', error);
    }
  }

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

  saveHiddenBlessingBonuses() {
    try {
      const blessings = this.getHiddenBlessingBonuses();
      BdApi.Data.save('SkillTree', 'hiddenBlessings', blessings);
    } catch (error) {
      console.error('SkillTree: Error saving hidden blessing bonuses', error);
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

  _applyPassiveBonusCurve(statKey, rawValue) {
    const value = Math.max(0, Number(rawValue) || 0);
    const tuning = PASSIVE_BONUS_TUNING[statKey];
    if (!tuning) return value;

    const softCap = Math.max(0, Number(tuning.softCap || 0));
    const hardCap = Math.max(softCap, Number(tuning.hardCap || softCap));
    const taperScale = Math.max(0.0001, Number(tuning.taperScale || 0.1));

    if (value <= softCap) return value;
    if (hardCap <= softCap) return Math.min(value, hardCap);

    const overflow = value - softCap;
    const capSpan = hardCap - softCap;
    const taperedOverflow = capSpan * (1 - Math.exp(-overflow / taperScale));
    return Math.min(hardCap, softCap + taperedOverflow);
  }

  _getRankProgress(rank) {
    const index = SOLO_RANK_ORDER.indexOf(rank);
    if (index <= 0) return 0;
    return index / Math.max(1, SOLO_RANK_ORDER.length - 1);
  }

  _getKandiaruRankEffects(rank) {
    return KANDIARU_RANK_EFFECTS[rank] || KANDIARU_RANK_EFFECTS.E;
  }

  getInnatePassiveBonuses() {
    const soloData = this.getSoloLevelingData() || {};
    const level = Math.max(1, Number(soloData.level || 1));
    const levelProgress = Math.min(1, Math.max(0, (level - 1) / 1999));
    const rankProgress = this._getRankProgress(soloData.rank || '');
    const progression = Math.min(1, 0.08 + levelProgress * 0.72 + rankProgress * 0.2);

    return {
      debuffDurationReduction: Math.min(0.7, 0.12 + progression * 0.5),
      debuffResistChance: Math.min(0.42, 0.04 + progression * 0.3),
      debuffCleanseChance: Math.min(0.4, 0.08 + progression * 0.32),
      tenacityThreshold: 0.3,
      tenacityDamageReduction: 0.5,
    };
  }

  getInnatePassiveEffect(passiveId) {
    const innateBonuses = this.getInnatePassiveBonuses();
    switch (passiveId) {
      case 'detoxification':
        return {
          debuffDurationReduction: innateBonuses.debuffDurationReduction,
          debuffResistChance: innateBonuses.debuffResistChance,
          debuffCleanseChance: innateBonuses.debuffCleanseChance,
        };
      case 'tenacity':
        return {
          tenacityThreshold: innateBonuses.tenacityThreshold,
          tenacityDamageReduction: innateBonuses.tenacityDamageReduction,
        };
      default:
        return null;
    }
  }

  getInnatePassives() {
    return (this.innatePassives || []).map((passive) => ({
      ...passive,
      effect: this.getInnatePassiveEffect(passive.id),
    }));
  }

  getHiddenBlessingBonuses() {
    const now = Date.now();
    if (
      this._cache.hiddenBlessingBonuses &&
      this._cache.hiddenBlessingBonusesTime &&
      now - this._cache.hiddenBlessingBonusesTime < this._cache.hiddenBlessingBonusesTTL
    ) {
      return this._cache.hiddenBlessingBonuses;
    }

    const soloData = this.getSoloLevelingData() || {};
    const sourceRank = KANDIARU_RANK_EFFECTS[soloData.rank] ? soloData.rank : 'E';
    const rankEffects = this._getKandiaruRankEffects(sourceRank);
    const bonuses = {
      sourceRank,
      xpBonus: Number(rankEffects.xpBonus || 0),
      naturalGrowthMultiplier: Number(rankEffects.naturalGrowthMultiplier || 1),
    };

    this._cache.hiddenBlessingBonuses = bonuses;
    this._cache.hiddenBlessingBonusesTime = now;
    return bonuses;
  }

  getHiddenBlessingEffect(blessingId) {
    switch (blessingId) {
      case 'blessing_of_kandiaru':
        return this.getHiddenBlessingBonuses();
      default:
        return null;
    }
  }

  getHiddenBlessings() {
    return (this.hiddenBlessings || []).map((blessing) => ({
      ...blessing,
      effect: this.getHiddenBlessingEffect(blessing.id),
    }));
  }

  /**
   * Get shadow army count from ShadowArmy plugin (synchronous, snapshot-based).
   * @returns {number} Shadow count (0 if unavailable)
   */
  _getShadowArmyCount() {
    try {
      const plugin = BdApi.Plugins.get('ShadowArmy');
      const instance = plugin?.instance || null;
      if (!instance) return 0;
      // Prefer synchronous snapshot (2s TTL cache in ShadowArmy)
      const snapshot = instance.getShadowSnapshot?.();
      if (Array.isArray(snapshot)) return snapshot.length;
      // Fallback: check settings-based count
      return instance.settings?.shadowCount || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate army-scaled bonuses for Shadow Army Expansion.
   * Bonuses scale with sqrt(shadowCount) for natural diminishing returns.
   * @returns {Object} Bonus object with xpBonus and allStatBonus
   */
  _getShadowArmyScaledBonuses() {
    const count = this._getShadowArmyCount();
    if (count <= 0) return {};
    // sqrt scaling: 100 shadows → 0.05 allStat/xp, 400 → 0.10, 900 → 0.15
    const sqrtCount = Math.sqrt(count);
    return {
      xpBonus: 0.005 * sqrtCount,
      allStatBonus: 0.005 * sqrtCount,
    };
  }

  /**
   * Calculate total bonuses from all unlocked and upgraded skills.
   * Includes both general progression buffs and Detoxification's anti-debuff profile.
   * @returns {Object} Passive bonus bundle shared across plugins.
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

    const bonuses = PASSIVE_BONUS_KEYS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
    STATIC_PASSIVE_BONUS_KEYS.forEach((key) => {
      bonuses[key] = 0;
    });
    const rawBonuses = PASSIVE_BONUS_KEYS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});

    // Calculate bonuses from all skills at their current levels
    Object.values(this.skillTree).forEach((tier) => {
      if (!tier.skills) return;

      tier.skills.forEach((skill) => {
        const effect = this.getSkillEffect(skill, tier);
        if (effect) {
          PASSIVE_BONUS_KEYS.forEach((statKey) => {
            if (effect[statKey]) rawBonuses[statKey] += effect[statKey];
          });
        }
      });
    });

    const innateBonuses = this.getInnatePassiveBonuses();
    PASSIVE_BONUS_KEYS.forEach((statKey) => {
      if (innateBonuses[statKey]) rawBonuses[statKey] += innateBonuses[statKey];
    });

    // Shadow Army Expansion: army-scaled bonuses (binary unlock, scales with shadow count)
    if (this.getSkillLevel('shadow_army_expansion') >= 1) {
      const armyBonuses = this._getShadowArmyScaledBonuses();
      PASSIVE_BONUS_KEYS.forEach((statKey) => {
        if (armyBonuses[statKey]) rawBonuses[statKey] += armyBonuses[statKey];
      });
    }

    PASSIVE_BONUS_KEYS.forEach((statKey) => {
      bonuses[statKey] = this._applyPassiveBonusCurve(statKey, rawBonuses[statKey]);
    });
    // Static keys: use highest value from innate bonuses OR skill effects (override, not additive)
    const skillStaticValues = {};
    Object.values(this.skillTree).forEach((tier) => {
      if (!tier.skills) return;
      tier.skills.forEach((skill) => {
        const effect = this.getSkillEffect(skill, tier);
        if (!effect) return;
        STATIC_PASSIVE_BONUS_KEYS.forEach((statKey) => {
          if (effect[statKey] != null) {
            skillStaticValues[statKey] = Math.max(skillStaticValues[statKey] || 0, Number(effect[statKey]));
          }
        });
      });
    });
    STATIC_PASSIVE_BONUS_KEYS.forEach((statKey) => {
      const innateVal = Number(innateBonuses[statKey] || 0);
      const skillVal = Number(skillStaticValues[statKey] || 0);
      bonuses[statKey] = Math.max(innateVal, skillVal);
    });

    // Cache the result
    this._cache.skillBonuses = bonuses;
    this._cache.skillBonusesTime = now;

    return bonuses;
  }

  // Active-skill methods are mixed in from active-skill-methods.js

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
        rank: instance.settings?.rank || 'E',
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
  injectCSS() {
    injectSkillTreeCss();
  }

  // UI helpers/watchers are mixed in from ui-methods.js

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
