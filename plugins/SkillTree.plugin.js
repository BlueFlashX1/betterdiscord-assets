/**
 * @name SkillTree
 * @author BlueFlashX1
 * @description Solo Leveling lore-appropriate skill tree system with upgradeable passive abilities
 * @version 2.0.1
 *
 * @changelog v2.0.1 (2025-12-03)
 * - Code structure improvements (section headers, better organization)
 * - Console log cleanup (removed verbose debug logs)
 * - Performance optimizations
 */

module.exports = class SkillTree {
  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================
  constructor() {
    this.defaultSettings = {
      enabled: true,
      debugMode: false, // Debug mode toggle
      visibleTiers: ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'tier6'], // All 6 tiers visible by default
      currentTierPage: 'tier1', // Current tier page being viewed
      skillPoints: 0, // Skill points separate from stat points
      unlockedSkills: [], // Array of unlocked skill IDs (legacy support)
      skillLevels: {}, // Object mapping skill ID to level (e.g., { 'shadow_extraction': 5 })
      lastLevel: 1, // Track last level to detect level ups
      totalEarnedSP: 0, // Total SP earned from level ups (for reset calculation)
    };

    // Track all retry timeouts for proper cleanup
    this._retryTimeouts = new Set();
    this._isStopped = false;

    // Solo Leveling Lore-Appropriate Skill Tree
    // Skills are organized by tiers: Tier 1 (Low), Tier 2 (Mid), Tier 3 (High), Tier 4 (Master)
    // Higher tiers have higher costs but better growth rates
    this.skillTree = {
      // ===== TIER 1: BASIC SKILLS (Level 1-50) =====
      // Low cost, slow growth, accessible early game
      tier1: {
        name: 'Basic Abilities',
        tier: 1,
        maxLevel: 10,
        baseCost: 1, // Base SP cost to unlock
        upgradeCostMultiplier: 1.5, // Each upgrade costs baseCost * (level * multiplier)
        growthRate: 1.0, // Growth multiplier (lower = slower growth)
        skills: [
          {
            id: 'shadow_extraction',
            name: 'Shadow Extraction Mastery',
            desc: 'Mastery over extracting shadows from defeated enemies. Each level increases XP gain.',
            lore: 'The passive ability to extract shadows and turn them into your army.',
            requirement: { level: 5 },
            baseEffect: { xpBonus: 0.02 }, // +2% per level
            perLevelEffect: { xpBonus: 0.02 }, // +2% per level upgrade
          },
          {
            id: 'shadow_storage',
            name: 'Shadow Storage Capacity',
            desc: 'Increased capacity for storing extracted shadows. Increases long message XP.',
            lore: 'Passively store your shadow army for later use.',
            requirement: { level: 8 },
            baseEffect: { longMsgBonus: 0.03 }, // +3% per level
            perLevelEffect: { longMsgBonus: 0.03 },
          },
          {
            id: 'basic_combat',
            name: 'Combat Proficiency',
            desc: 'Fundamental combat knowledge. Increases crit chance.',
            lore: 'Passive mastery of combat basics.',
            requirement: { level: 10, strength: 5 },
            baseEffect: { critBonus: 0.01 }, // +1% per level
            perLevelEffect: { critBonus: 0.01 },
          },
          {
            id: 'mana_sense',
            name: 'Mana Sensitivity',
            desc: 'Heightened sensitivity to mana flow. Increases XP from all sources.',
            lore: 'Passively feel the flow of mana around you.',
            requirement: { level: 15, intelligence: 5 },
            baseEffect: { xpBonus: 0.015 }, // +1.5% per level
            perLevelEffect: { xpBonus: 0.015 },
          },
        ],
      },
      // ===== TIER 2: INTERMEDIATE SKILLS (Level 50-150) =====
      // Medium cost, medium growth, mid-game progression
      tier2: {
        name: 'Intermediate Abilities',
        tier: 2,
        maxLevel: 15,
        baseCost: 3,
        upgradeCostMultiplier: 2.0,
        growthRate: 1.5, // 50% faster growth than Tier 1
        skills: [
          {
            id: 'shadow_exchange',
            name: 'Shadow Exchange Efficiency',
            desc: 'Efficient conversion of shadows into power. Significantly increases XP gain.',
            lore: 'Passively trade shadows for power boosts.',
            requirement: { level: 50, skills: ['shadow_extraction'] },
            baseEffect: { xpBonus: 0.05 }, // +5% per level
            perLevelEffect: { xpBonus: 0.05 },
          },
          {
            id: 'arise',
            name: 'Shadow Command Mastery',
            desc: 'Mastery over commanding your shadow army. Increases all stat bonuses.',
            lore: 'Passive command over shadows that brings them to life.',
            requirement: { level: 60, skills: ['shadow_storage'] },
            baseEffect: { allStatBonus: 0.02 }, // +2% per level
            perLevelEffect: { allStatBonus: 0.02 },
          },
          {
            id: 'instant_dungeon',
            name: 'Dungeon Mastery',
            desc: 'Mastery over creating training grounds. Increases quest rewards.',
            lore: 'Passively generate dungeons for training and grinding.',
            requirement: { level: 75, intelligence: 15 },
            baseEffect: { questBonus: 0.04 }, // +4% per level
            perLevelEffect: { questBonus: 0.04 },
          },
          {
            id: 'dagger_throw',
            name: 'Dagger Mastery',
            desc: 'Mastery over throwing daggers. Increases crit chance significantly.',
            lore: "Passive mastery of Jin-Woo's signature combat technique.",
            requirement: { level: 80, agility: 15 },
            baseEffect: { critBonus: 0.02 }, // +2% per level
            perLevelEffect: { critBonus: 0.02 },
          },
          {
            id: 'stealth',
            name: 'Shadow Stealth',
            desc: 'Passive ability to move unseen through shadows. Increases XP and crit chance.',
            lore: 'Become one with the shadows.',
            requirement: { level: 90, agility: 20 },
            baseEffect: { xpBonus: 0.03, critBonus: 0.015 }, // +3% XP, +1.5% crit per level
            perLevelEffect: { xpBonus: 0.03, critBonus: 0.015 },
          },
        ],
      },
      // ===== TIER 3: ADVANCED SKILLS (Level 150-500) =====
      // High cost, high growth, late-game power
      tier3: {
        name: 'Advanced Abilities',
        tier: 3,
        maxLevel: 20,
        baseCost: 5,
        upgradeCostMultiplier: 2.5,
        growthRate: 2.0, // 2x faster growth than Tier 1
        skills: [
          {
            id: 'domain_expansion',
            name: 'Domain Mastery',
            desc: 'Mastery over expanding your domain of influence. Massive XP and stat bonuses.',
            lore: 'Passively create a domain where you are absolute ruler.',
            requirement: { level: 150, intelligence: 30, skills: ['instant_dungeon'] },
            baseEffect: { xpBonus: 0.08, allStatBonus: 0.03 }, // +8% XP, +3% stats per level
            perLevelEffect: { xpBonus: 0.08, allStatBonus: 0.03 },
          },
          {
            id: 'ruler_authority',
            name: "Ruler's Presence",
            desc: 'Passive aura of absolute authority. Increases all bonuses.',
            lore: 'The passive power to rule over all.',
            requirement: { level: 200, skills: ['arise'] },
            baseEffect: { xpBonus: 0.06, allStatBonus: 0.04, critBonus: 0.02 }, // +6% XP, +4% stats, +2% crit per level
            perLevelEffect: { xpBonus: 0.06, allStatBonus: 0.04, critBonus: 0.02 },
          },
          {
            id: 'shadow_army',
            name: 'Shadow Legion Mastery',
            desc: 'Mastery over commanding a legion of shadows. Massive XP and quest bonuses.',
            lore: 'Passively build an army of shadows to fight for you.',
            requirement: { level: 250, skills: ['shadow_exchange', 'arise'] },
            baseEffect: { xpBonus: 0.1, questBonus: 0.06 }, // +10% XP, +6% quest per level
            perLevelEffect: { xpBonus: 0.1, questBonus: 0.06 },
          },
          {
            id: 'monarch_power',
            name: "Monarch's Aura",
            desc: 'Passive aura of monarch-level power. Extreme bonuses.',
            lore: 'The power of a Monarch passively flows through you.',
            requirement: { level: 300, strength: 50, agility: 50 },
            baseEffect: { xpBonus: 0.12, critBonus: 0.03, allStatBonus: 0.05 }, // +12% XP, +3% crit, +5% stats per level
            perLevelEffect: { xpBonus: 0.12, critBonus: 0.03, allStatBonus: 0.05 },
          },
        ],
      },
      // ===== TIER 4: MASTER SKILLS (Level 500-1000) =====
      // Very high cost, very high growth, end-game mastery
      tier4: {
        name: 'Master Abilities',
        tier: 4,
        maxLevel: 25,
        baseCost: 10,
        upgradeCostMultiplier: 3.0,
        growthRate: 3.0, // 3x faster growth than Tier 1
        skills: [
          {
            id: 'shadow_monarch',
            name: "Shadow Monarch's Presence",
            desc: 'Passive presence of the Shadow Monarch. Ultimate power over shadows.',
            lore: 'The ultimate form - passive ruler of all shadows.',
            requirement: { level: 500, skills: ['monarch_power', 'shadow_army'] },
            baseEffect: { xpBonus: 0.15, allStatBonus: 0.08, critBonus: 0.04 }, // +15% XP, +8% stats, +4% crit per level
            perLevelEffect: { xpBonus: 0.15, allStatBonus: 0.08, critBonus: 0.04 },
          },
          {
            id: 'ashborn_legacy',
            name: "Ashborn's Legacy",
            desc: "Passive inheritance of the first Shadow Monarch's power. Transcendent bonuses.",
            lore: 'The legacy of Ashborn passively flows through you.',
            requirement: { level: 750, skills: ['shadow_monarch'] },
            baseEffect: { xpBonus: 0.2, allStatBonus: 0.1, critBonus: 0.05, questBonus: 0.08 }, // +20% XP, +10% stats, +5% crit, +8% quest per level
            perLevelEffect: { xpBonus: 0.2, allStatBonus: 0.1, critBonus: 0.05, questBonus: 0.08 },
          },
        ],
      },
      // ===== TIER 5: TRANSCENDENT SKILLS (Level 1000-1500) =====
      // Extremely high cost, extremely high growth, transcendent power
      tier5: {
        name: 'Transcendent Abilities',
        tier: 5,
        maxLevel: 30,
        baseCost: 15,
        upgradeCostMultiplier: 3.5,
        growthRate: 4.0, // 4x faster growth than Tier 1
        skills: [
          {
            id: 'absolute_ruler',
            name: 'Absolute Authority',
            desc: 'Passive authority over all existence. Maximum power.',
            lore: 'The ultimate passive authority - rule over everything.',
            requirement: { level: 1000, skills: ['ashborn_legacy'] },
            baseEffect: {
              xpBonus: 0.25,
              allStatBonus: 0.12,
              critBonus: 0.06,
              questBonus: 0.1,
              longMsgBonus: 0.15,
            }, // +25% XP, +12% stats, +6% crit, +10% quest, +15% long msg per level
            perLevelEffect: {
              xpBonus: 0.25,
              allStatBonus: 0.12,
              critBonus: 0.06,
              questBonus: 0.1,
              longMsgBonus: 0.15,
            },
          },
          {
            id: 'void_mastery',
            name: 'Void Mastery',
            desc: 'Mastery over the void itself. Transcendent XP and stat bonuses.',
            lore: 'Passive control over the void between dimensions.',
            requirement: { level: 1200, skills: ['absolute_ruler'] },
            baseEffect: { xpBonus: 0.3, allStatBonus: 0.15, critBonus: 0.08 }, // +30% XP, +15% stats, +8% crit per level
            perLevelEffect: { xpBonus: 0.3, allStatBonus: 0.15, critBonus: 0.08 },
          },
          {
            id: 'dimension_ruler',
            name: "Dimension Ruler's Aura",
            desc: 'Passive aura that rules across all dimensions. Massive bonuses.',
            lore: 'Your presence passively affects all dimensions.',
            requirement: { level: 1400, skills: ['void_mastery'] },
            baseEffect: { xpBonus: 0.35, allStatBonus: 0.18, critBonus: 0.1, questBonus: 0.12 }, // +35% XP, +18% stats, +10% crit, +12% quest per level
            perLevelEffect: { xpBonus: 0.35, allStatBonus: 0.18, critBonus: 0.1, questBonus: 0.12 },
          },
        ],
      },
      // ===== TIER 6: ULTIMATE SKILLS (Level 1500-2000) =====
      // Maximum cost, maximum growth, ultimate power
      tier6: {
        name: 'Ultimate Abilities',
        tier: 6,
        maxLevel: 35,
        baseCost: 25,
        upgradeCostMultiplier: 4.0,
        growthRate: 5.0, // 5x faster growth than Tier 1
        skills: [
          {
            id: 'omnipotent_presence',
            name: 'Omnipotent Presence',
            desc: 'Passive presence that transcends all limitations. Ultimate bonuses.',
            lore: 'Your very existence passively defies all known limits.',
            requirement: { level: 1500, skills: ['dimension_ruler'] },
            baseEffect: {
              xpBonus: 0.4,
              allStatBonus: 0.2,
              critBonus: 0.12,
              questBonus: 0.15,
              longMsgBonus: 0.2,
            }, // +40% XP, +20% stats, +12% crit, +15% quest, +20% long msg per level
            perLevelEffect: {
              xpBonus: 0.4,
              allStatBonus: 0.2,
              critBonus: 0.12,
              questBonus: 0.15,
              longMsgBonus: 0.2,
            },
          },
          {
            id: 'eternal_shadow',
            name: "Eternal Shadow's Embrace",
            desc: 'Passive embrace of eternal shadow power. Transcendent bonuses.',
            lore: 'The eternal shadow itself passively flows through you.',
            requirement: { level: 1750, skills: ['omnipotent_presence'] },
            baseEffect: { xpBonus: 0.45, allStatBonus: 0.25, critBonus: 0.15, questBonus: 0.18 }, // +45% XP, +25% stats, +15% crit, +18% quest per level
            perLevelEffect: {
              xpBonus: 0.45,
              allStatBonus: 0.25,
              critBonus: 0.15,
              questBonus: 0.18,
            },
          },
          {
            id: 'true_monarch',
            name: "True Monarch's Dominion",
            desc: 'Passive dominion over all reality. Maximum possible power.',
            lore: "The true monarch's passive dominion extends over all existence.",
            requirement: { level: 2000, skills: ['eternal_shadow'] },
            baseEffect: {
              xpBonus: 0.5,
              allStatBonus: 0.3,
              critBonus: 0.18,
              questBonus: 0.2,
              longMsgBonus: 0.25,
            }, // +50% XP, +30% stats, +18% crit, +20% quest, +25% long msg per level
            perLevelEffect: {
              xpBonus: 0.5,
              allStatBonus: 0.3,
              critBonus: 0.18,
              questBonus: 0.2,
              longMsgBonus: 0.25,
            },
          },
        ],
      },
    };

    this.settings = this.defaultSettings;
    this.skillTreeModal = null;
    this.skillTreeButton = null;
    this.levelCheckInterval = null; // Deprecated - using events instead
    this.eventUnsubscribers = []; // Store unsubscribe functions for event listeners
    this._urlChangeCleanup = null; // Cleanup function for URL change watcher
    this._retryTimeout1 = null; // Timeout ID for first retry
    this._retryTimeout2 = null; // Timeout ID for second retry
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================
  start() {
    // Reset stopped flag to allow watchers to recreate
    this._isStopped = false;

    this.loadSettings();
    this.injectCSS();
    this.createSkillTreeButton();
    this.saveSkillBonuses();

    // FUNCTIONAL: Retry button creation (short-circuit, no if-else)
    this._retryTimeout1 = setTimeout(() => {
      this._retryTimeouts.delete(this._retryTimeout1);
      (!this.skillTreeButton || !document.body.contains(this.skillTreeButton)) &&
        this.createSkillTreeButton();
      this._retryTimeout1 = null;
    }, 2000);
    this._retryTimeouts.add(this._retryTimeout1);

    // FUNCTIONAL: Additional retry (short-circuit, no if-else)
    this._retryTimeout2 = setTimeout(() => {
      this._retryTimeouts.delete(this._retryTimeout2);
      (!this.skillTreeButton || !document.body.contains(this.skillTreeButton)) &&
        this.createSkillTreeButton();
      this._retryTimeout2 = null;
    }, 5000);
    this._retryTimeouts.add(this._retryTimeout2);

    // Watch for channel changes and recreate button
    this.setupChannelWatcher();

    // Watch for level ups from SoloLevelingStats (event-based, will retry if not ready)
    this.setupLevelUpWatcher();

    // Recalculate SP on startup based on current level
    this.recalculateSPFromLevel();

    // Set global instance for button handlers
    window.skillTreeInstance = this;
  }

  // ============================================================================
  // EVENT HANDLING & WATCHERS
  // ============================================================================
  setupLevelUpWatcher() {
    // Return early if plugin is stopped to prevent recreating watchers
    if (this._isStopped) {
      return;
    }

    // Subscribe to SoloLevelingStats levelChanged events for real-time updates
    const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
    if (!soloPlugin) {
      // Retry after a delay - SoloLevelingStats might still be loading
      const timeoutId = setTimeout(() => {
        this._retryTimeouts.delete(timeoutId);
        this.setupLevelUpWatcher();
      }, 2000);
      this._retryTimeouts.add(timeoutId);
      return;
    }

    const instance = soloPlugin.instance || soloPlugin;
    if (!instance || typeof instance.on !== 'function') {
      // Retry after a delay - Event system might not be ready yet
      const timeoutId = setTimeout(() => {
        this._retryTimeouts.delete(timeoutId);
        this.setupLevelUpWatcher();
      }, 2000);
      this._retryTimeouts.add(timeoutId);
      return;
    }

    // Subscribe to level changed events
    const unsubscribeLevel = instance.on('levelChanged', (data) => {
      // FUNCTIONAL: Short-circuit for level up (no if-else)
      data.newLevel > (this.settings.lastLevel || 1) &&
        (() => {
          const levelsGained = data.newLevel - (this.settings.lastLevel || 1);
          this.awardSPForLevelUp(levelsGained);
          this.settings.lastLevel = data.newLevel;
          this.saveSettings();
        })();
    });
    this.eventUnsubscribers.push(unsubscribeLevel);

    // Initial check on startup
    this.checkForLevelUp();
  }

  stop() {
    // Set stopped flag to prevent recreating watchers
    this._isStopped = true;

    // Unsubscribe from events
    this.unsubscribeFromEvents();

    // Clear intervals
    if (this.levelCheckInterval) {
      clearInterval(this.levelCheckInterval);
      this.levelCheckInterval = null;
    }

    // Clear all tracked retry timeouts
    this._retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._retryTimeouts.clear();

    // Clear legacy retry timeouts (for backwards compatibility)
    if (this._retryTimeout1) {
      clearTimeout(this._retryTimeout1);
      this._retryTimeout1 = null;
    }
    if (this._retryTimeout2) {
      clearTimeout(this._retryTimeout2);
      this._retryTimeout2 = null;
    }

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

    // Remove UI elements
    if (this.skillTreeButton) {
      this.skillTreeButton.remove();
      this.skillTreeButton = null;
    }

    // Disconnect toolbar observer
    if (this.toolbarObserver) {
      this.toolbarObserver.disconnect();
      this.toolbarObserver = null;
    }

    if (this.skillTreeModal) {
      this.skillTreeModal.remove();
      this.skillTreeModal = null;
    }

    // Clear global instance
    if (window.skillTreeInstance === this) {
      window.skillTreeInstance = null;
    }

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

  // ============================================================================
  // LEVEL UP & SP MANAGEMENT
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
   * Recalculate SP based on current level (for reset or initial setup)
   */
  recalculateSPFromLevel() {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.level) return;

      const currentLevel = soloData.level;
      const expectedSP = this.calculateSPForLevel(currentLevel);

      // Update last level to current level
      this.settings.lastLevel = currentLevel;

      // Only update totalEarnedSP if it's less than expected (first time setup)
      if (this.settings.totalEarnedSP < expectedSP) {
        const difference = expectedSP - this.settings.totalEarnedSP;
        this.settings.totalEarnedSP = expectedSP;
        // Add difference to available SP only if not already spent
        // SP calculation: totalEarnedSP - spentSP = availableSP
        const spentSP = this.getTotalSpentSP();
        const currentAvailable = this.settings.skillPoints;
        const expectedAvailable = expectedSP - spentSP;

        if (currentAvailable < expectedAvailable) {
          this.settings.skillPoints = expectedAvailable;
        }
      }

      this.saveSettings();
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
      this.settings.skillPoints = expectedSP;
      this.settings.totalEarnedSP = expectedSP;
      this.settings.lastLevel = currentLevel;

      this.saveSettings();
      this.saveSkillBonuses();

      BdApi?.showToast?.(`Skills Reset! You have ${expectedSP} SP for level ${currentLevel}`, {
        type: 'success',
        timeout: 4000,
      });

      // Refresh modal if open
      if (this.skillTreeModal) {
        this.showSkillTreeModal();
      }

      return true;
    } catch (error) {
      console.error('SkillTree: Error resetting skills', error);
      return false;
    }
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
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
    } catch (error) {
      console.error('SkillTree: Error loading settings', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('SkillTree', 'settings', this.settings);
      this.saveSkillBonuses(); // Update bonuses in shared storage
    } catch (error) {
      console.error('SkillTree: Error saving settings', error);
    }
  }

  // ============================================================================
  // SKILL BONUS CALCULATION
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
   * Calculate total bonuses from all unlocked and upgraded skills
   * @returns {Object} - Object with xpBonus, critBonus, longMsgBonus, questBonus, allStatBonus
   */
  calculateSkillBonuses() {
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

    return bonuses;
  }

  // ============================================================================
  // DATA ACCESS METHODS
  // ============================================================================
  /**
   * Get SoloLevelingStats data
   * @returns {Object|null} - SoloLevelingStats data or null if unavailable
   */
  getSoloLevelingData() {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) return null;
      const instance = soloPlugin.instance || soloPlugin;
      return {
        stats: instance.settings?.stats || {},
        level: instance.settings?.level || 1,
        totalXP: instance.settings?.totalXP || 0,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate total SP spent on skills
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

    return totalSpent;
  }

  // ============================================================================
  // SKILL DATA ACCESS METHODS
  // ============================================================================
  /**
   * Get skill level (0 = not unlocked)
   * @param {string} skillId - Skill ID
   * @returns {number} - Skill level (0 if not unlocked)
   */
  getSkillLevel(skillId) {
    return this.settings.skillLevels[skillId] || 0;
  }

  /**
   * Get skill unlock cost
   * @param {Object} skill - Skill definition
   * @param {Object} tier - Tier definition
   * @returns {number} - Unlock cost in SP
   */
  getSkillUnlockCost(skill, tier) {
    return tier.baseCost || 1;
  }

  /**
   * Get total upgrade cost for a skill up to a certain level
   * @param {Object} skill - Skill definition
   * @param {Object} tier - Tier definition
   * @param {number} targetLevel - Target level
   * @returns {number} - Total upgrade cost
   */
  getSkillUpgradeCost(skill, tier, targetLevel) {
    if (targetLevel <= 1) return 0;

    let totalCost = 0;
    const baseCost = tier.baseCost || 1;
    const multiplier = tier.upgradeCostMultiplier || 1.5;

    // Cost for level 2, 3, 4, etc.
    for (let level = 2; level <= targetLevel; level++) {
      totalCost += Math.ceil(baseCost * (level - 1) * multiplier);
    }

    return totalCost;
  }

  /**
   * Get cost to upgrade skill to next level
   * @param {Object} skill - Skill definition
   * @param {Object} tier - Tier definition
   * @returns {number|null} - Cost in SP, or null if max level
   */
  getNextUpgradeCost(skill, tier) {
    const currentLevel = this.getSkillLevel(skill.id);
    if (currentLevel === 0) {
      // Unlock cost
      return tier.baseCost || 1;
    }

    const maxLevel = tier.maxLevel || 10;
    if (currentLevel >= maxLevel) {
      return null; // Already max level
    }

    const baseCost = tier.baseCost || 1;
    const multiplier = tier.upgradeCostMultiplier || 1.5;
    return Math.ceil(baseCost * currentLevel * multiplier);
  }

  /**
   * Get skill effect at current level
   * @param {Object} skill - Skill definition
   * @param {Object} tier - Tier definition
   * @returns {Object|null} - Effect object or null if not unlocked
   */
  getSkillEffect(skill, tier) {
    const level = this.getSkillLevel(skill.id);
    if (level === 0) return null;

    const effect = {};
    const growthRate = tier.growthRate || 1.0;

    // Calculate effect: baseEffect applies once, then perLevelEffect scales with level and growth rate
    // For level 1: baseEffect only
    // For level 2+: baseEffect + (perLevelEffect * (level - 1) * growthRate)
    Object.keys(skill.baseEffect || {}).forEach((key) => {
      const baseValue = skill.baseEffect[key] || 0;
      const perLevelValue =
        skill.perLevelEffect && skill.perLevelEffect[key] ? skill.perLevelEffect[key] : 0;
      // Level 1 gets base effect, each additional level adds perLevelEffect scaled by growth rate
      effect[key] = baseValue + perLevelValue * (level - 1) * growthRate;
    });

    return effect;
  }

  // ============================================================================
  // SKILL UPGRADE METHODS
  // ============================================================================
  /**
   * Find skill and tier by skill ID
   * @param {string} skillId - Skill ID to find
   * @returns {Object|null} - Object with skill and tier, or null if not found
   */
  findSkillAndTier(skillId) {
    try {
      for (const tierKey in this.skillTree) {
        const tierData = this.skillTree[tierKey];
        if (!tierData?.skills) continue;

        const foundSkill = tierData.skills.find((s) => s.id === skillId);
        if (foundSkill) {
          return { skill: foundSkill, tier: tierData };
        }
      }
      return null;
    } catch (error) {
      console.error('SkillTree: Error finding skill', error);
      return null;
    }
  }

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

  /**
   * Check if skill can be unlocked/upgraded
   * @param {Object} skill - Skill definition
   * @param {Object} tier - Tier definition
   * @returns {boolean} - True if skill can be upgraded
   */
  canUnlockSkill(skill, tier) {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData) return false;

      const currentLevel = this.getSkillLevel(skill.id);
      const maxLevel = tier.maxLevel || 10;

      // Early returns for invalid states
      if (currentLevel >= maxLevel) return false;

      const cost = this.getNextUpgradeCost(skill, tier);
      if (!cost || this.settings.skillPoints < cost) return false;

      // Check level requirement
      if (skill.requirement?.level && soloData.level < skill.requirement.level) {
        return false;
      }

      // Check stat requirements
      const stats = soloData.stats || {};
      const requirement = skill.requirement || {};

      if (requirement.strength && (stats.strength || 0) < requirement.strength) return false;
      if (requirement.agility && (stats.agility || 0) < requirement.agility) return false;
      if (requirement.intelligence && (stats.intelligence || 0) < requirement.intelligence)
        return false;
      if (requirement.vitality && (stats.vitality || 0) < requirement.vitality) return false;

      // Support both perception and luck (migration)
      const perception = stats.perception || stats.luck || 0;
      if (requirement.perception && perception < requirement.perception) return false;
      if (requirement.luck && perception < requirement.luck) return false;

      // Check prerequisite skills
      if (requirement.skills && Array.isArray(requirement.skills)) {
        const hasAllPrereqs = requirement.skills.every(
          (prereqId) => this.getSkillLevel(prereqId) > 0
        );
        if (!hasAllPrereqs) return false;
      }

      return true;
    } catch (error) {
      console.error('SkillTree: Error checking if skill can be unlocked', error);
      return false;
    }
  }

  /**
   * Unlock or upgrade a skill
   * @param {string} skillId - Skill ID to unlock/upgrade
   * @returns {boolean} - True if successful
   */
  unlockOrUpgradeSkill(skillId) {
    try {
      const result = this.findSkillAndTier(skillId);
      if (!result) {
        console.error('SkillTree: Skill not found:', skillId);
        return false;
      }

      const { skill, tier } = result;

      if (!this.canUnlockSkill(skill, tier)) {
        return false;
      }

      const cost = this.getNextUpgradeCost(skill, tier);
      if (!cost) return false;

      // Deduct SP and upgrade skill
      this.settings.skillPoints -= cost;
      const currentLevel = this.getSkillLevel(skillId);
      this.settings.skillLevels[skillId] = (currentLevel || 0) + 1;

      // Legacy support: add to unlockedSkills if not already there
      if (!this.settings.unlockedSkills) {
        this.settings.unlockedSkills = [];
      }
      if (!this.settings.unlockedSkills.includes(skillId)) {
        this.settings.unlockedSkills.push(skillId);
      }

      this.saveSettings();
      this.updateButtonText();

      // Show notification
      const newLevel = this.getSkillLevel(skillId);
      if (BdApi?.showToast) {
        const message =
          currentLevel === 0
            ? `Skill Unlocked: ${skill.name}`
            : `${skill.name} upgraded to Level ${newLevel}!`;

        BdApi.showToast(message, {
          type: 'success',
          timeout: 3000,
        });
      }

      return true;
    } catch (error) {
      console.error('SkillTree: Error unlocking/upgrading skill', error);
      return false;
    }
  }

  /**
   * Max upgrade a skill (use all remaining SP)
   * @param {string} skillId - Skill ID to max upgrade
   * @returns {boolean} - True if successful
   */
  maxUpgradeSkill(skillId) {
    try {
      const result = this.findSkillAndTier(skillId);
      if (!result) {
        console.error('SkillTree: Skill not found:', skillId);
        return false;
      }

      const { skill, tier } = result;
      const currentLevel = this.getSkillLevel(skillId);
      const maxLevel = tier.maxLevel || 10;

      // Early returns
      if (currentLevel >= maxLevel) return false;

      // Check requirements
      if (!this.canUnlockSkill(skill, tier)) {
        return false;
      }

      // Calculate how many levels we can afford
      let levelsUpgraded = 0;
      let totalCost = 0;
      let targetLevel = currentLevel;
      let remainingSP = this.settings.skillPoints;

      while (targetLevel < maxLevel && remainingSP > 0) {
        // Calculate cost for next level
        const nextCost =
          targetLevel === 0
            ? tier.baseCost || 1 // Unlock cost
            : Math.ceil((tier.baseCost || 1) * targetLevel * (tier.upgradeCostMultiplier || 1.5)); // Upgrade cost

        if (!nextCost || remainingSP < nextCost) {
          break; // Can't afford next upgrade
        }

        totalCost += nextCost;
        remainingSP -= nextCost;
        targetLevel++;
        levelsUpgraded++;
      }

      if (levelsUpgraded === 0) {
        return false; // Can't afford any upgrades
      }

      // Apply upgrades
      this.settings.skillPoints -= totalCost;
      this.settings.skillLevels[skillId] = targetLevel;

      // Legacy support
      if (!this.settings.unlockedSkills) {
        this.settings.unlockedSkills = [];
      }
      if (!this.settings.unlockedSkills.includes(skillId)) {
        this.settings.unlockedSkills.push(skillId);
      }

      this.saveSettings();
      this.updateButtonText();

      // Show notification
      if (BdApi?.showToast) {
        const message =
          currentLevel === 0
            ? `Skill Unlocked: ${skill.name} (Level ${targetLevel})`
            : `${skill.name} upgraded ${levelsUpgraded} level(s) to Level ${targetLevel}!`;

        BdApi.showToast(message, {
          type: 'success',
          timeout: 3000,
        });
      }

      return true;
    } catch (error) {
      console.error('SkillTree: Error max upgrading skill', error);
      return false;
    }
  }

  // ... (rest of the UI methods remain the same, but need to be updated to show skill levels and upgrade costs)
  // For brevity, I'll include the key UI methods that need updating

  injectCSS() {
    const css = `
      /* Main Button - Matching TitleManager style */
      .st-skill-tree-button {
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        color: var(--interactive-normal, #b9bbbe);
        padding: 6px;
        margin: 0 2px;
        box-sizing: border-box;
      }
      .st-skill-tree-button:hover {
        background: var(--background-modifier-hover, rgba(79, 84, 92, 0.16));
        color: var(--interactive-hover, #dcddde);
        transform: scale(1.1);
      }
      .st-skill-tree-button:active {
        transform: scale(0.95);
      }
      .st-skill-tree-button svg {
        width: 20px;
        height: 20px;
        display: block;
      }

      /* Modal Container */
      .skilltree-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f0f1e 100%);
        border-radius: 16px;
        padding: 0;
        max-width: 900px;
        width: 90vw;
        max-height: 85vh;
        overflow: hidden;
        z-index: 10001;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8),
                    0 0 100px rgba(102, 126, 234, 0.3),
                    inset 0 0 100px rgba(118, 75, 162, 0.1);
        border: 2px solid rgba(102, 126, 234, 0.3);
        animation: modalFadeIn 0.3s ease-out;
      }
      @keyframes modalFadeIn {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      /* Modal Content */
      .skilltree-modal-content {
        padding: 30px;
        overflow-y: auto;
        max-height: calc(85vh - 60px);
        background: linear-gradient(180deg, rgba(26, 26, 46, 0.95) 0%, rgba(15, 15, 30, 0.98) 100%);
      }

      /* Header */
      .skilltree-header {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
        padding: 25px 30px;
        border-bottom: 2px solid rgba(102, 126, 234, 0.3);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        position: relative;
        overflow: hidden;
      }
      .skilltree-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        animation: shimmer 3s infinite;
      }
      @keyframes shimmer {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      .skilltree-header h2 {
        margin: 0 0 12px 0;
        color: #fff;
        font-size: 28px;
        font-weight: 800;
        text-shadow: 0 2px 10px rgba(102, 126, 234, 0.8),
                     0 0 20px rgba(118, 75, 162, 0.6);
        letter-spacing: 1px;
        background: linear-gradient(135deg, #fff 0%, #e0e7ff 50%, #c7d2fe 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .skilltree-header-info {
        display: flex;
        gap: 20px;
        align-items: center;
        flex-wrap: wrap;
      }
      .skilltree-stat {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: rgba(102, 126, 234, 0.15);
        border: 1px solid rgba(102, 126, 234, 0.3);
        border-radius: 8px;
        color: #e0e7ff;
        font-size: 14px;
        font-weight: 600;
      }

      .skilltree-reset-btn {
        padding: 10px 20px;
        background: linear-gradient(135deg, rgba(255, 68, 68, 0.8) 0%, rgba(220, 38, 38, 0.8) 100%);
        border: 2px solid rgba(255, 68, 68, 1);
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: 0 0 15px rgba(255, 68, 68, 0.3);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .skilltree-reset-btn:hover {
        background: linear-gradient(135deg, rgba(255, 68, 68, 1) 0%, rgba(220, 38, 38, 1) 100%);
        border-color: rgba(255, 100, 100, 1);
        box-shadow: 0 0 25px rgba(255, 68, 68, 0.6);
        transform: translateY(-2px);
      }

      .skilltree-reset-btn:active {
        transform: translateY(0);
        box-shadow: 0 0 15px rgba(255, 68, 68, 0.4);
        backdrop-filter: blur(10px);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      }
      .skilltree-stat-value {
        color: #fbbf24;
        font-weight: 700;
        text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
      }

      /* Close Button */
      .skilltree-close-btn {
        position: absolute;
        top: 15px;
        right: 15px;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 18px;
        font-weight: 700;
        box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
        transition: all 0.2s;
        z-index: 10;
      }
      .skilltree-close-btn:hover {
        transform: scale(1.1) rotate(90deg);
        box-shadow: 0 6px 20px rgba(239, 68, 68, 0.6);
      }

      /* Tier Section */
      /* Tier Navigation Bar */
      .skilltree-tier-nav {
        display: flex;
        gap: 8px;
        padding: 16px 20px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%);
        border-bottom: 2px solid rgba(139, 92, 246, 0.2);
        backdrop-filter: blur(10px);
        overflow-x: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(139, 92, 246, 0.5) transparent;
      }

      .skilltree-tier-nav::-webkit-scrollbar {
        height: 6px;
      }

      .skilltree-tier-nav::-webkit-scrollbar-track {
        background: transparent;
      }

      .skilltree-tier-nav::-webkit-scrollbar-thumb {
        background: rgba(139, 92, 246, 0.5);
        border-radius: 3px;
      }

      .skilltree-tier-nav-btn {
        padding: 10px 20px;
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.6) 100%);
        border: 2px solid rgba(139, 92, 246, 0.5);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.2);
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .skilltree-tier-nav-btn:hover {
        border-color: rgba(139, 92, 246, 0.8);
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(139, 92, 246, 0.2) 100%);
        box-shadow: 0 0 25px rgba(139, 92, 246, 0.5);
        transform: translateY(-2px);
        color: #fff;
      }

      .skilltree-tier-nav-btn:active {
        transform: translateY(0);
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
      }

      .skilltree-tier-nav-btn.active {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.5) 0%, rgba(139, 92, 246, 0.4) 100%);
        border-color: #8b5cf6;
        box-shadow: 0 0 30px rgba(139, 92, 246, 0.7);
        color: #fff;
        font-weight: 700;
      }

      .skilltree-tier {
        margin: 35px 0;
        padding: 25px;
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
        border-radius: 12px;
        border: 1px solid rgba(102, 126, 234, 0.2);
        scroll-margin-top: 20px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
        position: relative;
        overflow: hidden;
      }
      .skilltree-tier::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 50%, #667eea 100%);
        background-size: 200% 100%;
        animation: gradientShift 3s ease infinite;
      }
      .skilltree-tier-header {
        color: #fff;
        margin: 0 0 20px 0;
        font-size: 22px;
        font-weight: 700;
        padding-bottom: 12px;
        border-bottom: 2px solid rgba(102, 126, 234, 0.4);
        text-shadow: 0 2px 8px rgba(102, 126, 234, 0.6);
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .skilltree-tier-badge {
        display: inline-block;
        padding: 4px 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        font-size: 12px;
        font-weight: 700;
        color: white;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
      }

      /* Skill Card */
      .skilltree-skill {
        background: linear-gradient(135deg, rgba(30, 30, 50, 0.8) 0%, rgba(20, 20, 35, 0.9) 100%);
        border-radius: 10px;
        padding: 18px;
        margin: 12px 0;
        border: 1px solid rgba(102, 126, 234, 0.2);
        border-left: 4px solid #667eea;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
      }
      .skilltree-skill::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.1), transparent);
        transition: left 0.5s;
      }
      .skilltree-skill:hover {
        transform: translateX(5px);
        border-color: rgba(102, 126, 234, 0.5);
        box-shadow: 0 6px 25px rgba(102, 126, 234, 0.3),
                    0 0 30px rgba(118, 75, 162, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }
      .skilltree-skill:hover::before {
        left: 100%;
      }
      .skilltree-skill.unlocked {
        border-left-color: #10b981;
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(30, 30, 50, 0.8) 100%);
      }
      .skilltree-skill.max-level {
        border-left-color: #fbbf24;
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(30, 30, 50, 0.8) 100%);
        box-shadow: 0 4px 20px rgba(251, 191, 36, 0.2),
                    0 0 30px rgba(251, 191, 36, 0.1);
      }
      .skilltree-skill-name {
        font-weight: 700;
        color: #fff;
        margin-bottom: 6px;
        font-size: 16px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        letter-spacing: 0.3px;
      }
      .skilltree-skill-desc {
        color: #cbd5e1;
        font-size: 13px;
        margin-bottom: 10px;
        line-height: 1.5;
      }
      .skilltree-skill-lore {
        color: #a78bfa;
        font-size: 11px;
        font-style: italic;
        margin-top: 6px;
        padding-left: 12px;
        border-left: 2px solid rgba(167, 139, 250, 0.3);
      }
      .skilltree-skill-level {
        color: #10b981;
        font-size: 12px;
        margin-bottom: 6px;
        font-weight: 600;
        text-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
      }
      .skilltree-skill-effects {
        color: #34d399;
        font-size: 11px;
        margin-top: 8px;
        padding: 8px;
        background: rgba(16, 185, 129, 0.1);
        border-radius: 6px;
        border: 1px solid rgba(16, 185, 129, 0.2);
      }
      .skilltree-skill-cost {
        color: #fbbf24;
        font-size: 12px;
        font-weight: 600;
        margin-top: 8px;
        text-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
      }
      .skilltree-skill-max {
        color: #fbbf24;
        font-size: 12px;
        font-weight: 700;
        margin-top: 8px;
        text-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .skilltree-btn-group {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      .skilltree-upgrade-btn {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        flex: 1;
      }
      .skilltree-upgrade-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(16, 185, 129, 0.6),
                    inset 0 1px 0 rgba(255, 255, 255, 0.3);
        background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
      }
      .skilltree-upgrade-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      .skilltree-upgrade-btn:disabled {
        background: linear-gradient(135deg, #475569 0%, #334155 100%);
        cursor: not-allowed;
        opacity: 0.5;
        box-shadow: none;
      }
      .skilltree-max-btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .skilltree-max-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6),
                    inset 0 1px 0 rgba(255, 255, 255, 0.3);
        background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
      }
      .skilltree-max-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      .skilltree-max-btn:disabled {
        background: linear-gradient(135deg, #475569 0%, #334155 100%);
        cursor: not-allowed;
        opacity: 0.5;
        box-shadow: none;
      }

      /* Scrollbar */
      .skilltree-modal-content::-webkit-scrollbar {
        width: 10px;
      }
      .skilltree-modal-content::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.3);
        border-radius: 5px;
      }
      .skilltree-modal-content::-webkit-scrollbar-thumb {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 5px;
        border: 2px solid rgba(0, 0, 0, 0.3);
      }
      .skilltree-modal-content::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
      }
    `;

    // Remove existing style if it exists
    const existingStyle = document.getElementById('skilltree-css');
    if (existingStyle) {
      existingStyle.remove();
    }

    // Use BdApi.DOM for persistent CSS injection (v1.8.0+)
    const styleId = 'skilltree-css';
    try {
      BdApi.DOM.addStyle(styleId, css);
    } catch (error) {
      // Fallback to manual injection
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  /**
   * Create skill tree button in Discord UI (matching TitleManager style and position)
   */
  createSkillTreeButton() {
    // Remove any existing buttons first
    const existingButtons = document.querySelectorAll('.st-skill-tree-button');
    existingButtons.forEach((btn) => btn.remove());
    this.skillTreeButton = null;

    // Find Discord's button row - same method as TitleManager
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
      setTimeout(() => this.createSkillTreeButton(), 1000);
      return;
    }

    // Create button with skill tree/layers icon
    const button = document.createElement('button');
    button.className = 'st-skill-tree-button';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7L12 12L22 7L12 2Z"></path>
        <path d="M2 17L12 22L22 17"></path>
        <path d="M2 12L12 17L22 12"></path>
      </svg>
    `;
    button.title = `Skill Tree (${this.settings.skillPoints} SP)`;
    button.addEventListener('click', () => this.showSkillTreeModal());

    // Insert button after title button (or before apps button if no title button)
    const titleBtn = toolbar.querySelector('.tm-title-button');
    const appsButton = Array.from(toolbar.children).find(
      (el) =>
        el.querySelector('[class*="apps"]') ||
        el.getAttribute('aria-label')?.toLowerCase().includes('app')
    );

    if (titleBtn) {
      toolbar.insertBefore(button, titleBtn.nextSibling);
    } else if (appsButton) {
      toolbar.insertBefore(button, appsButton);
    } else {
      toolbar.appendChild(button);
    }

    this.skillTreeButton = button;
    this.updateButtonText();

    // Watch for toolbar changes and reposition if needed
    this.observeToolbar(toolbar);
  }

  /**
   * Observe toolbar for changes and reposition button if needed
   * @param {HTMLElement} toolbar - Toolbar element to observe
   */
  observeToolbar(toolbar) {
    if (this.toolbarObserver) {
      this.toolbarObserver.disconnect();
    }

    this.toolbarObserver = new MutationObserver(() => {
      if (this.skillTreeButton && !toolbar.contains(this.skillTreeButton)) {
        // Button was removed, recreate it
        this.createSkillTreeButton();
      }
    });

    this.toolbarObserver.observe(toolbar, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Update button text with current SP count
   */
  updateButtonText() {
    if (this.skillTreeButton) {
      // Update tooltip with current SP count
      this.skillTreeButton.title = `Skill Tree (${this.settings.skillPoints} SP)`;
    }
  }

  /**
   * Show skill tree modal with scroll position preservation
   */
  showSkillTreeModal() {
    // Save scroll position before refresh
    let scrollPosition = 0;
    if (this.skillTreeModal) {
      const content = this.skillTreeModal.querySelector('.skilltree-modal-content');
      if (content) {
        scrollPosition = content.scrollTop;
      }
      this.skillTreeModal.remove();
    }

    // Create modal
    this.skillTreeModal = document.createElement('div');
    this.skillTreeModal.className = 'skilltree-modal';
    this.skillTreeModal.innerHTML = this.renderSkillTree();

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'skilltree-close-btn';
    closeBtn.onclick = () => {
      if (this.skillTreeModal) {
        this.skillTreeModal.remove();
        this.skillTreeModal = null;
      }
    };
    this.skillTreeModal.appendChild(closeBtn);

    document.body.appendChild(this.skillTreeModal);

    // Restore scroll position
    if (scrollPosition > 0) {
      const content = this.skillTreeModal.querySelector('.skilltree-modal-content');
      if (content) {
        content.scrollTop = scrollPosition;
      }
    }

    // Attach event listeners to upgrade buttons
    this.skillTreeModal.querySelectorAll('.skilltree-upgrade-btn').forEach((btn) => {
      btn.onclick = (e) => {
        const skillId = e.target.getAttribute('data-skill-id');
        if (skillId && this.unlockOrUpgradeSkill(skillId)) {
          this.showSkillTreeModal(); // Refresh modal (scroll position will be preserved)
        }
      };
    });

    // Attach event listeners to max buttons
    this.skillTreeModal.querySelectorAll('.skilltree-max-btn').forEach((btn) => {
      btn.onclick = (e) => {
        const skillId = e.target.getAttribute('data-skill-id');
        if (skillId && this.maxUpgradeSkill(skillId)) {
          this.showSkillTreeModal(); // Refresh modal (scroll position will be preserved)
        }
      };
    });

    // FUNCTIONAL: Attach tier navigation button event listeners (PAGE SWITCH - no scroll)
    this.skillTreeModal.querySelectorAll('.skilltree-tier-nav-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tierKey = e.target.getAttribute('data-tier');
        this.settings.currentTierPage = tierKey;
        this.saveSettings();
        this.showSkillTreeModal(); // Refresh modal to show new tier page
      });
    });

    // FUNCTIONAL: Attach reset button event listener
    const resetBtn = this.skillTreeModal.querySelector('#st-reset-modal-btn');
    resetBtn?.addEventListener('click', () => {
      const confirmed = confirm(
        '⚠️ RESET ALL SKILLS?\n\n' +
          'This will:\n' +
          '• Reset ALL unlocked skills\n' +
          '• Recalculate SP based on your current level\n' +
          '• Cannot be undone!\n\n' +
          'Continue?'
      );
      confirmed && this.resetSkills();
    });
  }

  /**
   * Render skill tree HTML
   * @returns {string} - HTML string for skill tree modal
   */
  renderSkillTree() {
    const soloData = this.getSoloLevelingData();
    const visibleTiers = this.settings.visibleTiers || [
      'tier1',
      'tier2',
      'tier3',
      'tier4',
      'tier5',
      'tier6',
    ];
    const currentTier = this.settings.currentTierPage || 'tier1';

    let html = `
      <div class="skilltree-header">
        <h2>Solo Leveling Skill Tree</h2>
        <div class="skilltree-header-info">
          <div class="skilltree-stat">
            <span>Available SP:</span>
            <span class="skilltree-stat-value">${this.settings.skillPoints}</span>
        </div>
          ${
            soloData
              ? `
          <div class="skilltree-stat">
            <span>Level:</span>
            <span class="skilltree-stat-value">${soloData.level}</span>
      </div>
          `
              : ''
          }
          <button class="skilltree-reset-btn" id="st-reset-modal-btn">
            Reset Skills
          </button>
        </div>
      </div>
      
      <div class="skilltree-tier-nav">
        ${visibleTiers
          .map(
            (tierKey) => `
          <button class="skilltree-tier-nav-btn ${
            tierKey === currentTier ? 'active' : ''
          }" data-tier="${tierKey}">
            Tier ${tierKey.replace('tier', '')}
          </button>
        `
          )
          .join('')}
      </div>
      
      <div class="skilltree-modal-content">
    `;

    // FUNCTIONAL: Render ONLY the current tier page
    const tierEntry = Object.entries(this.skillTree).find(([key]) => key === currentTier);
    if (tierEntry) {
      const [tierKey, tier] = tierEntry;
      if (tier.skills) {
        html += `<div class="skilltree-tier" id="st-${tierKey}">`;
        html += `<div class="skilltree-tier-header">
        <span>${tier.name}</span>
        <span class="skilltree-tier-badge">Tier ${tier.tier}</span>
      </div>`;

        tier.skills.forEach((skill) => {
          const level = this.getSkillLevel(skill.id);
          const maxLevel = tier.maxLevel || 10;
          const canUpgrade = this.canUnlockSkill(skill, tier);
          const nextCost = this.getNextUpgradeCost(skill, tier);
          const effect = this.getSkillEffect(skill, tier);

          // Check if max upgrade is possible - reuse canUnlockSkill validation
          // to ensure stat requirements and prerequisites are checked
          const canMaxUpgrade = level < maxLevel && this.canUnlockSkill(skill, tier);

          html += `<div class="skilltree-skill ${level > 0 ? 'unlocked' : ''} ${
            level >= maxLevel ? 'max-level' : ''
          }">`;
          html += `<div class="skilltree-skill-name">${skill.name}</div>`;
          html += `<div class="skilltree-skill-desc">${skill.desc}</div>`;
          if (skill.lore) {
            html += `<div class="skilltree-skill-lore">${skill.lore}</div>`;
          }

          if (level > 0) {
            html += `<div class="skilltree-skill-level">Level ${level}/${maxLevel}</div>`;
            if (effect) {
              const effectText = [];
              if (effect.xpBonus) effectText.push(`+${(effect.xpBonus * 100).toFixed(1)}% XP`);
              if (effect.critBonus)
                effectText.push(`+${(effect.critBonus * 100).toFixed(1)}% Crit`);
              if (effect.longMsgBonus)
                effectText.push(`+${(effect.longMsgBonus * 100).toFixed(1)}% Long Msg`);
              if (effect.questBonus)
                effectText.push(`+${(effect.questBonus * 100).toFixed(1)}% Quest`);
              if (effect.allStatBonus)
                effectText.push(`+${(effect.allStatBonus * 100).toFixed(1)}% All Stats`);
              html += `<div class="skilltree-skill-effects">Current Effects: ${effectText.join(
                ' • '
              )}</div>`;
            }
          }

          if (level < maxLevel) {
            html += `<div class="skilltree-skill-cost">Cost: ${nextCost || 'N/A'} SP</div>`;
            html += `<div class="skilltree-btn-group">`;
            html += `<button class="skilltree-upgrade-btn" ${
              !canUpgrade ? 'disabled' : ''
            } data-skill-id="${skill.id}">${level === 0 ? 'Unlock' : 'Upgrade'}</button>`;
            html += `<button class="skilltree-max-btn" ${
              !canMaxUpgrade ? 'disabled' : ''
            } data-skill-id="${skill.id}">Max</button>`;
            html += `</div>`;
          } else {
            html += `<div class="skilltree-skill-max">MAX LEVEL</div>`;
          }

          html += `</div>`;
        });

        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  }

  setupChannelWatcher() {
    // Use event-based URL change detection (no polling)
    let lastUrl = window.location.href;

    // Watch for URL changes via popstate and pushState/replaceState
    const handleUrlChange = () => {
      // Return early if plugin is stopped
      if (this._isStopped) return;

      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Small delay to ensure DOM is ready
        const timeoutId = setTimeout(() => {
          this._retryTimeouts.delete(timeoutId);
          if (!this.skillTreeButton || !document.contains(this.skillTreeButton)) {
            this.createSkillTreeButton();
          }
        }, 500);
        this._retryTimeouts.add(timeoutId);
      }
    };

    // Listen to browser back/forward navigation
    const popstateHandler = () => handleUrlChange();
    window.addEventListener('popstate', popstateHandler);

    // Setup MutationObserver to detect DOM changes that indicate navigation
    // (Discord's SPA updates the title and main content when navigating)
    const observer = new MutationObserver(() => {
      handleUrlChange();
    });

    // Observe title changes as a proxy for navigation
    const titleElement = document.querySelector('title');
    if (titleElement) {
      observer.observe(titleElement, { childList: true, subtree: true, characterData: true });
    }

    // Also observe the main app container for structural changes
    const appContainer = document.querySelector('#app-mount');
    if (appContainer) {
      observer.observe(appContainer, { childList: true, subtree: false });
    }

    // Fallback: Poll for URL changes every 500ms
    // This ensures we catch navigation even if observers miss it
    const pollInterval = setInterval(() => {
      handleUrlChange();
    }, 500);

    // Store cleanup function with try/finally to guarantee restoration
    this._urlChangeCleanup = () => {
      try {
        // Remove popstate listener
        window.removeEventListener('popstate', popstateHandler);
      } catch (e) {
        console.error('[SkillTree] Error removing popstate listener:', e);
      }

      try {
        // Disconnect mutation observer
        observer.disconnect();
      } catch (e) {
        console.error('[SkillTree] Error disconnecting observer:', e);
      }

      try {
        // Clear polling interval
        clearInterval(pollInterval);
      } catch (e) {
        console.error('[SkillTree] Error clearing poll interval:', e);
      }
    };
  }

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT
  // ============================================================================

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.innerHTML = `
      <div>
        <h3 style="color: #8b5cf6; margin-bottom: 20px;">Skill Tree Settings</h3>

        <div style="margin-bottom: 20px; padding: 15px; background: rgba(139, 92, 246, 0.1); border-radius: 8px; border-left: 3px solid #8b5cf6;">
          <div style="color: #8b5cf6; font-weight: bold; margin-bottom: 10px;">Visible Tiers (Toggle to Show/Hide)</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <label style="display: flex; align-items: center;">
              <input type="checkbox" ${
                this.settings.visibleTiers?.includes('tier1') !== false ? 'checked' : ''
              } data-tier="tier1">
              <span style="margin-left: 10px;">Tier 1: Basic</span>
            </label>
            <label style="display: flex; align-items: center;">
              <input type="checkbox" ${
                this.settings.visibleTiers?.includes('tier2') !== false ? 'checked' : ''
              } data-tier="tier2">
              <span style="margin-left: 10px;">Tier 2: Intermediate</span>
            </label>
            <label style="display: flex; align-items: center;">
              <input type="checkbox" ${
                this.settings.visibleTiers?.includes('tier3') !== false ? 'checked' : ''
              } data-tier="tier3">
              <span style="margin-left: 10px;">Tier 3: Advanced</span>
            </label>
            <label style="display: flex; align-items: center;">
              <input type="checkbox" ${
                this.settings.visibleTiers?.includes('tier4') !== false ? 'checked' : ''
              } data-tier="tier4">
              <span style="margin-left: 10px;">Tier 4: Master</span>
            </label>
            <label style="display: flex; align-items: center;">
              <input type="checkbox" ${
                this.settings.visibleTiers?.includes('tier5') !== false ? 'checked' : ''
              } data-tier="tier5">
              <span style="margin-left: 10px;">Tier 5: Transcendent</span>
            </label>
            <label style="display: flex; align-items: center;">
              <input type="checkbox" ${
                this.settings.visibleTiers?.includes('tier6') !== false ? 'checked' : ''
              } data-tier="tier6">
              <span style="margin-left: 10px;">Tier 6: Ultimate</span>
            </label>
          </div>
        </div>

        <button id="st-reset-skills" style="
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, rgba(255, 68, 68, 0.8) 0%, rgba(220, 38, 38, 0.8) 100%);
          border: 2px solid rgba(255, 68, 68, 1);
          border-radius: 8px;
          color: white;
          font-weight: bold;
          cursor: pointer;
          margin-bottom: 20px;
          transition: all 0.3s ease;
        ">
          Reset All Skills & Recalculate SP
        </button>

        <label style="display: flex; align-items: center; margin-bottom: 15px;">
          <input type="checkbox" ${this.settings.debugMode ? 'checked' : ''} id="st-debug">
          <span style="margin-left: 10px;">Debug Mode (Show console logs)</span>
        </label>

        <div style="margin-top: 15px; padding: 10px; background: rgba(139, 92, 246, 0.1); border-radius: 8px; border-left: 3px solid #8b5cf6;">
          <div style="color: #8b5cf6; font-weight: bold; margin-bottom: 5px;">Debug Information</div>
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

    // Event listeners
    const tierCheckboxes = panel.querySelectorAll('[data-tier]');
    tierCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const tier = e.target.getAttribute('data-tier');
        this.settings.visibleTiers = this.settings.visibleTiers || [
          'tier1',
          'tier2',
          'tier3',
          'tier4',
          'tier5',
          'tier6',
        ];

        if (e.target.checked) {
          !this.settings.visibleTiers.includes(tier) && this.settings.visibleTiers.push(tier);
        } else {
          this.settings.visibleTiers = this.settings.visibleTiers.filter((t) => t !== tier);
        }

        this.saveSettings();

        // Refresh modal if open (SMOOTH - no blink)
        if (this.skillTreeModal) {
          const modalContent = this.skillTreeModal.querySelector('.skilltree-modal-content');
          modalContent && (modalContent.style.opacity = '0.5');
          setTimeout(() => {
            this.showSkillTreeModal();
            const newModalContent = this.skillTreeModal?.querySelector('.skilltree-modal-content');
            newModalContent && (newModalContent.style.opacity = '1');
          }, 150);
        }
      });
    });

    const resetButton = panel.querySelector('#st-reset-skills');
    resetButton?.addEventListener('click', () => {
      const confirmed = confirm(
        'Are you sure you want to reset ALL skills?\n\n' +
          'This will:\n' +
          '• Reset all unlocked skills\n' +
          '• Recalculate SP based on your current level\n' +
          '• Cannot be undone!'
      );
      confirmed && this.resetSkills();
    });

    const debugCheckbox = panel.querySelector('#st-debug');
    debugCheckbox?.addEventListener('change', (e) => {
      this.settings.debugMode = e.target.checked;
      this.saveSettings();
      this.debugLog('SETTINGS', 'Debug mode toggled', { enabled: e.target.checked });
    });

    return panel;
  }
};
