/**
 * @name SkillTree
 * @author Matthew
 * @description Skill tree system with unlockable passive abilities for Solo Leveling Stats
 * @version 1.0.0
 */

module.exports = class SkillTree {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      skillPoints: 0, // Skill points separate from stat points
      unlockedSkills: [], // Array of unlocked skill IDs
      lastLevel: 1, // Track last level to detect level ups
      totalEarnedSP: 0, // Total SP earned from level ups (for reset calculation)
    };

    // Skill definitions - passive abilities that enhance stats
    this.skillTree = {
      strength: {
        name: 'Strength Branch',
        skills: [
          {
            id: 'str_1',
            name: 'Power Strike',
            desc: '+8% XP per message',
            cost: 1,
            requirement: { strength: 3 },
            effect: { xpBonus: 0.08 },
          },
          {
            id: 'str_2',
            name: 'Mighty Blow',
            desc: '+15% XP per message',
            cost: 2,
            requirement: { strength: 6, skills: ['str_1'] },
            effect: { xpBonus: 0.15 },
          },
          {
            id: 'str_3',
            name: 'Devastating Force',
            desc: '+22% XP per message',
            cost: 3,
            requirement: { strength: 10, skills: ['str_2'] },
            effect: { xpBonus: 0.22 },
          },
          {
            id: 'str_4',
            name: 'Armor Break',
            desc: '+12% XP from long messages',
            cost: 2,
            requirement: { strength: 8, skills: ['str_2'] },
            effect: { longMsgBonus: 0.12 },
          },
          {
            id: 'str_5',
            name: 'Berserker Rage',
            desc: '+18% XP per message, +6% crit chance',
            cost: 4,
            requirement: { strength: 15, skills: ['str_3', 'str_4'] },
            effect: { xpBonus: 0.18, critBonus: 0.06 },
          },
        ],
      },
      agility: {
        name: 'Agility Branch',
        skills: [
          {
            id: 'agi_1',
            name: 'Quick Reflexes',
            desc: '+4% crit chance',
            cost: 1,
            requirement: { agility: 3 },
            effect: { critBonus: 0.04 },
          },
          {
            id: 'agi_2',
            name: 'Lightning Speed',
            desc: '+8% crit chance',
            cost: 2,
            requirement: { agility: 6, skills: ['agi_1'] },
            effect: { critBonus: 0.08 },
          },
          {
            id: 'agi_3',
            name: 'Blinding Speed',
            desc: '+12% crit chance',
            cost: 3,
            requirement: { agility: 10, skills: ['agi_2'] },
            effect: { critBonus: 0.12 },
          },
          {
            id: 'agi_4',
            name: 'Shadow Step',
            desc: '+10% XP per message',
            cost: 2,
            requirement: { agility: 8, skills: ['agi_2'] },
            effect: { xpBonus: 0.10 },
          },
          {
            id: 'agi_5',
            name: 'Transcendent Speed',
            desc: '+16% crit chance, +8% XP',
            cost: 4,
            requirement: { agility: 15, skills: ['agi_3', 'agi_4'] },
            effect: { critBonus: 0.16, xpBonus: 0.08 },
          },
        ],
      },
      intelligence: {
        name: 'Intelligence Branch',
        skills: [
          {
            id: 'int_1',
            name: 'Mental Clarity',
            desc: '+12% long message XP',
            cost: 1,
            requirement: { intelligence: 3 },
            effect: { longMsgBonus: 0.12 },
          },
          {
            id: 'int_2',
            name: 'Genius Mind',
            desc: '+20% long message XP',
            cost: 2,
            requirement: { intelligence: 6, skills: ['int_1'] },
            effect: { longMsgBonus: 0.20 },
          },
          {
            id: 'int_3',
            name: 'Master Strategist',
            desc: '+28% long message XP',
            cost: 3,
            requirement: { intelligence: 10, skills: ['int_2'] },
            effect: { longMsgBonus: 0.28 },
          },
          {
            id: 'int_4',
            name: 'Tactical Analysis',
            desc: '+10% quest rewards',
            cost: 2,
            requirement: { intelligence: 8, skills: ['int_2'] },
            effect: { questBonus: 0.10 },
          },
          {
            id: 'int_5',
            name: 'Omniscient Mind',
            desc: '+35% long message XP, +15% quest rewards',
            cost: 4,
            requirement: { intelligence: 15, skills: ['int_3', 'int_4'] },
            effect: { longMsgBonus: 0.35, questBonus: 0.15 },
          },
        ],
      },
      vitality: {
        name: 'Vitality Branch',
        skills: [
          {
            id: 'vit_1',
            name: 'Robust Health',
            desc: '+8% quest rewards',
            cost: 1,
            requirement: { vitality: 3 },
            effect: { questBonus: 0.08 },
          },
          {
            id: 'vit_2',
            name: 'Iron Will',
            desc: '+15% quest rewards',
            cost: 2,
            requirement: { vitality: 6, skills: ['vit_1'] },
            effect: { questBonus: 0.15 },
          },
          {
            id: 'vit_3',
            name: 'Immortal Body',
            desc: '+22% quest rewards',
            cost: 3,
            requirement: { vitality: 10, skills: ['vit_2'] },
            effect: { questBonus: 0.22 },
          },
          {
            id: 'vit_4',
            name: 'Regeneration',
            desc: '+6% XP per message',
            cost: 2,
            requirement: { vitality: 8, skills: ['vit_2'] },
            effect: { xpBonus: 0.06 },
          },
          {
            id: 'vit_5',
            name: 'Eternal Vitality',
            desc: '+28% quest rewards, +12% XP',
            cost: 4,
            requirement: { vitality: 15, skills: ['vit_3', 'vit_4'] },
            effect: { questBonus: 0.28, xpBonus: 0.12 },
          },
        ],
      },
      luck: {
        name: 'Luck Branch',
        skills: [
          {
            id: 'luk_1',
            name: 'Lucky Break',
            desc: '+4% to all stat bonuses',
            cost: 1,
            requirement: { luck: 3 },
            effect: { allStatBonus: 0.04 },
          },
          {
            id: 'luk_2',
            name: 'Fortune\'s Favor',
            desc: '+8% to all stat bonuses',
            cost: 2,
            requirement: { luck: 6, skills: ['luk_1'] },
            effect: { allStatBonus: 0.08 },
          },
          {
            id: 'luk_3',
            name: 'Divine Luck',
            desc: '+12% to all stat bonuses',
            cost: 3,
            requirement: { luck: 10, skills: ['luk_2'] },
            effect: { allStatBonus: 0.12 },
          },
          {
            id: 'luk_4',
            name: 'Serendipity',
            desc: '+5% crit chance',
            cost: 2,
            requirement: { luck: 8, skills: ['luk_2'] },
            effect: { critBonus: 0.05 },
          },
          {
            id: 'luk_5',
            name: 'Fate\'s Blessing',
            desc: '+16% to all stat bonuses, +8% crit chance',
            cost: 4,
            requirement: { luck: 15, skills: ['luk_3', 'luk_4'] },
            effect: { allStatBonus: 0.16, critBonus: 0.08 },
          },
        ],
      },
    };

    this.settings = this.defaultSettings;
    this.skillTreeModal = null;
    this.skillTreeButton = null;
    this.urlCheckInterval = null;
    this.levelCheckInterval = null; // Deprecated - using events instead
    this.eventUnsubscribers = []; // Store unsubscribe functions for event listeners
  }

  start() {
    this.loadSettings();
    this.injectCSS();
    this.createSkillTreeButton();
    this.saveSkillBonuses();

    // Watch for channel changes and recreate button
    this.setupChannelWatcher();

    // Watch for level ups from SoloLevelingStats (event-based, no polling)
    this.setupLevelUpWatcher();

    // Recalculate SP on startup based on current level
    this.recalculateSPFromLevel();

    console.log('SkillTree: Plugin started');
  }

  setupLevelUpWatcher() {
    // Subscribe to SoloLevelingStats levelChanged events for real-time updates
    const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
    if (!soloPlugin) {
      console.warn('SkillTree: SoloLevelingStats plugin not found, using fallback polling');
      // Fallback to polling if events not available
      this.levelCheckInterval = setInterval(() => {
        this.checkForLevelUp();
      }, 2000);
      return;
    }

    const instance = soloPlugin.instance || soloPlugin;
    if (!instance || typeof instance.on !== 'function') {
      console.warn('SkillTree: Event system not available, using fallback polling');
      // Fallback to polling if events not available
      this.levelCheckInterval = setInterval(() => {
        this.checkForLevelUp();
      }, 2000);
      return;
    }

    // Subscribe to level changed events
    const unsubscribeLevel = instance.on('levelChanged', (data) => {
      // data contains: { oldLevel, newLevel, ... }
      if (data.newLevel > (this.settings.lastLevel || 1)) {
        const levelsGained = data.newLevel - (this.settings.lastLevel || 1);
        this.awardSPForLevelUp(levelsGained);
        this.settings.lastLevel = data.newLevel;
        this.saveSettings();
      }
    });
    this.eventUnsubscribers.push(unsubscribeLevel);

    console.log('SkillTree: ✅ Event-based level up detection enabled - no polling needed');

    // Initial check on startup
    this.checkForLevelUp();
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
        this.awardSPForLevelUp(levelsGained);
        this.settings.lastLevel = currentLevel;
        this.saveSettings();
      }
    } catch (error) {
      console.error('SkillTree: Error checking level up', error);
    }
  }

  // Calculate total SP that should be earned based on level
  calculateSPForLevel(level) {
    // 1 SP per level (level 1 = 0 SP, level 2 = 1 SP, level 3 = 2 SP, etc.)
    return Math.max(0, level - 1);
  }

  // Award SP when leveling up
  awardSPForLevelUp(levelsGained) {
    const spEarned = levelsGained; // 1 SP per level
    this.settings.skillPoints += spEarned;
    this.settings.totalEarnedSP += spEarned;
    this.saveSettings();

    // Show notification
    if (BdApi && typeof BdApi.showToast === 'function') {
      BdApi.showToast(`Level Up! +${spEarned} Skill Point${spEarned > 1 ? 's' : ''}`, {
        type: 'success',
        timeout: 3000
      });
    }
  }

  // Recalculate SP based on current level (for reset or initial setup)
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

  // Get total SP spent on unlocked skills
  getTotalSpentSP() {
    let totalSpent = 0;
    Object.values(this.skillTree).forEach((branch) => {
      branch.skills.forEach((skill) => {
        if (this.settings.unlockedSkills.includes(skill.id)) {
          totalSpent += skill.cost;
        }
      });
    });
    return totalSpent;
  }

  // Reset skill tree - refunds all SP and unlocks
  resetSkillTree() {
    const spentSP = this.getTotalSpentSP();
    this.settings.unlockedSkills = [];

    // Recalculate SP based on current level
    this.recalculateSPFromLevel();

    // Set available SP to total earned minus spent (which is now 0)
    const soloData = this.getSoloLevelingData();
    if (soloData && soloData.level) {
      const expectedSP = this.calculateSPForLevel(soloData.level);
      this.settings.totalEarnedSP = expectedSP;
      this.settings.skillPoints = expectedSP; // All SP available since nothing is spent
    }

    this.saveSettings();
    this.saveSkillBonuses(); // Update bonuses (all cleared)

    if (BdApi && typeof BdApi.showToast === 'function') {
      BdApi.showToast('Skill Tree Reset! All SP refunded.', {
        type: 'info',
        timeout: 3000
      });
    }

    return true;
  }

  setupChannelWatcher() {
    // Watch for URL changes (channel navigation)
    let lastUrl = location.href;
    this.urlCheckInterval = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Recreate button after channel change
        setTimeout(() => {
          if (!this.skillTreeButton || !document.contains(this.skillTreeButton)) {
            this.createSkillTreeButton();
          }
        }, 500);
      }
    }, 1000);
  }

  stop() {
    this.removeSkillTreeButton();
    this.closeSkillTreeModal();
    this.removeCSS();

    // Unsubscribe from events
    this.unsubscribeFromEvents();

    if (this.urlCheckInterval) {
      clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }
    if (this.levelCheckInterval) {
      clearInterval(this.levelCheckInterval);
      this.levelCheckInterval = null;
    }
    console.log('SkillTree: Plugin stopped');
  }

  /**
   * Unsubscribe from all SoloLevelingStats events
   */
  unsubscribeFromEvents() {
    this.eventUnsubscribers.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.error('SkillTree: Error unsubscribing from events', error);
      }
    });
    this.eventUnsubscribers = [];
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load('SkillTree', 'settings');
      if (saved) {
        this.settings = { ...this.defaultSettings, ...saved };
      }
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

  // Save skill bonuses to shared storage for SoloLevelingStats to read
  saveSkillBonuses() {
    try {
      const bonuses = this.calculateSkillBonuses();
      BdApi.Data.save('SkillTree', 'bonuses', bonuses);
    } catch (error) {
      console.error('SkillTree: Error saving bonuses', error);
    }
  }

  calculateSkillBonuses() {
    const bonuses = {
      xpBonus: 0,
      critBonus: 0,
      longMsgBonus: 0,
      questBonus: 0,
      allStatBonus: 0,
    };

    // Calculate bonuses from unlocked skills
    Object.values(this.skillTree).forEach((branch) => {
      branch.skills.forEach((skill) => {
        if (this.settings.unlockedSkills.includes(skill.id)) {
          if (skill.effect.xpBonus) bonuses.xpBonus += skill.effect.xpBonus;
          if (skill.effect.critBonus) bonuses.critBonus += skill.effect.critBonus;
          if (skill.effect.longMsgBonus) bonuses.longMsgBonus += skill.effect.longMsgBonus;
          if (skill.effect.questBonus) bonuses.questBonus += skill.effect.questBonus;
          if (skill.effect.allStatBonus) bonuses.allStatBonus += skill.effect.allStatBonus;
        }
      });
    });

    return bonuses;
  }

  // Get SoloLevelingStats data
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

  // Check if skill can be unlocked
  canUnlockSkill(skill) {
    const soloData = this.getSoloLevelingData();
    if (!soloData) return false;

    // Check if already unlocked
    if (this.settings.unlockedSkills.includes(skill.id)) return false;

    // Check skill points
    if (this.settings.skillPoints < skill.cost) return false;

    // Check stat requirements
    if (skill.requirement.strength && soloData.stats.strength < skill.requirement.strength) return false;
    if (skill.requirement.agility && soloData.stats.agility < skill.requirement.agility) return false;
    if (skill.requirement.intelligence && soloData.stats.intelligence < skill.requirement.intelligence) return false;
    if (skill.requirement.vitality && soloData.stats.vitality < skill.requirement.vitality) return false;
    if (skill.requirement.luck && soloData.stats.luck < skill.requirement.luck) return false;

    // Check prerequisite skills
    if (skill.requirement.skills) {
      for (const prereqId of skill.requirement.skills) {
        if (!this.settings.unlockedSkills.includes(prereqId)) return false;
      }
    }

    return true;
  }

    unlockSkill(skillId) {
    // Find skill in tree
    let skill = null;
    for (const branch of Object.values(this.skillTree)) {
      const found = branch.skills.find((s) => s.id === skillId);
      if (found) {
        skill = found;
        break;
      }
    }

    if (!skill) return false;

    if (!this.canUnlockSkill(skill)) return false;

    // Unlock skill (deduct SP)
    this.settings.skillPoints -= skill.cost;
    this.settings.unlockedSkills.push(skillId);
    this.saveSettings();

    // Recalculate to ensure SP is correct
    this.recalculateSPFromLevel();

    // Show notification
    if (BdApi && typeof BdApi.showToast === 'function') {
      BdApi.showToast(`Skill Unlocked: ${skill.name}`, { type: 'success', timeout: 3000 });
    }

    return true;
  }

  createSkillTreeButton() {
    // Remove any existing buttons first (prevent duplicates)
    const existingButtons = document.querySelectorAll('.st-skill-tree-button');
    existingButtons.forEach(btn => btn.remove());
    this.skillTreeButton = null;

    // Find Discord's button row - look for the container with keyboard, gift, GIF, emoji icons
    const findToolbar = () => {
      // Method 1: Find by looking for common Discord button classes
      const buttonRow =
        // Look for container with multiple buttons (Discord's toolbar)
        Array.from(document.querySelectorAll('[class*="button"]')).find(el => {
          const siblings = Array.from(el.parentElement?.children || []);
          // Check if this container has multiple button-like elements (Discord's toolbar)
          return siblings.length >= 4 && siblings.some(s => s.querySelector('[class*="emoji"]') || s.querySelector('[class*="gif"]') || s.querySelector('[class*="attach"]'));
        })?.parentElement ||
        // Method 2: Find by text area and traverse up
        (() => {
          const textArea = document.querySelector('[class*="channelTextArea"]') ||
                           document.querySelector('[class*="slateTextArea"]') ||
                           document.querySelector('textarea[placeholder*="Message"]');
          if (!textArea) return null;

          // Go up to find the input container, then find button row
          let container = textArea.closest('[class*="container"]') ||
                          textArea.closest('[class*="wrapper"]') ||
                          textArea.parentElement?.parentElement?.parentElement;

          // Look for the row that contains multiple buttons
          const buttons = container?.querySelectorAll('[class*="button"]');
          if (buttons && buttons.length >= 4) {
            return buttons[0]?.parentElement;
          }

          return container?.querySelector('[class*="buttons"]') ||
                 container?.querySelector('[class*="buttonContainer"]');
        })();

      return buttonRow;
    };

    const toolbar = findToolbar();
    if (!toolbar) {
      // Retry after delay if toolbar not loaded yet
      setTimeout(() => this.createSkillTreeButton(), 1000);
      return;
    }

    // Create skill tree button with SVG icon
    const button = document.createElement('button');
    button.className = 'st-skill-tree-button';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
    `;
    button.title = 'Skill Tree';
    button.addEventListener('click', () => this.openSkillTreeModal());

    // Insert button at the end of toolbar (after Discord's buttons, before apps button if exists)
    const appsButton = Array.from(toolbar.children).find(el =>
      el.querySelector('[class*="apps"]') ||
      el.getAttribute('aria-label')?.toLowerCase().includes('app')
    );

    if (appsButton) {
      toolbar.insertBefore(button, appsButton);
    } else {
      toolbar.appendChild(button);
    }
    this.skillTreeButton = button;

    // Watch for toolbar changes and reposition if needed
    this.observeToolbar(toolbar);
  }

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

  removeSkillTreeButton() {
    if (this.skillTreeButton) {
      this.skillTreeButton.remove();
      this.skillTreeButton = null;
    }
    if (this.toolbarObserver) {
      this.toolbarObserver.disconnect();
      this.toolbarObserver = null;
    }
  }

  openSkillTreeModal() {
    if (this.skillTreeModal) {
      this.closeSkillTreeModal();
      return;
    }

    const soloData = this.getSoloLevelingData();
    const modal = document.createElement('div');
    modal.className = 'st-skill-tree-modal';
    modal.innerHTML = `
      <div class="st-modal-content">
        <div class="st-modal-header">
          <h2>⚡ Skill Tree</h2>
          <button class="st-close-button" onclick="this.closest('.st-skill-tree-modal').remove()">×</button>
        </div>
        <div class="st-modal-body">
          <div class="st-skill-points">
            <span class="st-label">Skill Points:</span>
            <span class="st-value">${this.settings.skillPoints}</span>
            <span class="st-sp-info">(Total Earned: ${this.settings.totalEarnedSP || 0}, Spent: ${this.getTotalSpentSP()})</span>
            <button class="st-reset-btn" id="st-reset-btn" style="margin-left: auto; padding: 6px 12px; background: rgba(255, 68, 68, 0.8); border: 1px solid rgba(255, 68, 68, 1); border-radius: 6px; color: white; cursor: pointer; font-size: 12px;">Reset Tree</button>
          </div>
          ${Object.entries(this.skillTree)
            .map(
              ([branchKey, branch]) => `
            <div class="st-branch">
              <h3 class="st-branch-title">${branch.name}</h3>
              <div class="st-skills-grid">
                ${branch.skills
                  .map((skill) => {
                    const isUnlocked = this.settings.unlockedSkills.includes(skill.id);
                    const canUnlock = this.canUnlockSkill(skill);
                    const soloData = this.getSoloLevelingData();
                    const hasStatReq =
                      !skill.requirement.strength ||
                      (soloData && soloData.stats.strength >= skill.requirement.strength) ||
                      !skill.requirement.agility ||
                      (soloData && soloData.stats.agility >= skill.requirement.agility) ||
                      !skill.requirement.intelligence ||
                      (soloData && soloData.stats.intelligence >= skill.requirement.intelligence) ||
                      !skill.requirement.vitality ||
                      (soloData && soloData.stats.vitality >= skill.requirement.vitality) ||
                      !skill.requirement.luck ||
                      (soloData && soloData.stats.luck >= skill.requirement.luck);

                    return `
                      <div class="st-skill ${isUnlocked ? 'unlocked' : ''} ${canUnlock ? 'can-unlock' : ''}"
                           data-skill-id="${skill.id}">
                        <div class="st-skill-icon">${isUnlocked ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"></path></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>'}</div>
                        <div class="st-skill-name">${this.escapeHtml(skill.name)}</div>
                        <div class="st-skill-desc">${this.escapeHtml(skill.desc)}</div>
                        <div class="st-skill-cost">Cost: ${skill.cost} SP</div>
                        ${!isUnlocked && !hasStatReq ? `<div class="st-skill-req">Requires: ${this.escapeHtml(this.getRequirementText(skill))}</div>` : ''}
                        ${!isUnlocked && canUnlock ? `<button class="st-unlock-btn" data-skill-id="${this.escapeHtml(skill.id)}">Unlock</button>` : ''}
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    // Store instance reference (namespaced for security)
    if (!window._skillTreeInstances) window._skillTreeInstances = new WeakMap();
    window._skillTreeInstances.set(modal, this);

    // Add event listeners for buttons (secure, no inline onclick)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeSkillTreeModal();
        return;
      }

      // Handle unlock button clicks
      if (e.target.classList.contains('st-unlock-btn')) {
        const skillId = e.target.getAttribute('data-skill-id');
        if (skillId) {
          this.unlockSkill(skillId);
          this.refreshModal();
        }
      }

      // Handle reset button
      if (e.target.id === 'st-reset-btn' || e.target.closest('#st-reset-btn')) {
        this.resetSkillTree();
        this.refreshModal();
      }
    });

    document.body.appendChild(modal);
    this.skillTreeModal = modal;
  }

  // HTML escaping utility for XSS prevention
  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getRequirementText(skill) {
    const reqs = [];
    if (skill.requirement.strength) reqs.push(`STR ${skill.requirement.strength}`);
    if (skill.requirement.agility) reqs.push(`AGI ${skill.requirement.agility}`);
    if (skill.requirement.intelligence) reqs.push(`INT ${skill.requirement.intelligence}`);
    if (skill.requirement.vitality) reqs.push(`VIT ${skill.requirement.vitality}`);
    if (skill.requirement.luck) reqs.push(`LUK ${skill.requirement.luck}`);
    return reqs.join(', ');
  }

  refreshModal() {
    this.closeSkillTreeModal();
    setTimeout(() => this.openSkillTreeModal(), 100);
  }

  closeSkillTreeModal() {
    if (this.skillTreeModal) {
      if (window._skillTreeInstances) {
        window._skillTreeInstances.delete(this.skillTreeModal);
      }
      this.skillTreeModal.remove();
      this.skillTreeModal = null;
    }
  }

  injectCSS() {
    const styleId = 'skill-tree-css';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .st-skill-tree-button {
        background: transparent;
        border: none;
        border-radius: 4px;
        width: 40px;
        height: 40px;
        cursor: pointer;
        color: var(--interactive-normal, #b9bbbe);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        margin-left: 8px;
        flex-shrink: 0;
        padding: 0;
      }

      .st-skill-tree-button svg {
        width: 20px;
        height: 20px;
        transition: all 0.2s ease;
      }

      .st-skill-tree-button:hover {
        background: var(--background-modifier-hover, rgba(4, 4, 5, 0.6));
        color: var(--interactive-hover, #dcddde);
      }

      .st-skill-tree-button:hover svg {
        transform: scale(1.1);
      }

      .st-skill-tree-modal {
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

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .st-modal-content {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 2px solid rgba(139, 92, 246, 0.5);
        border-radius: 16px;
        width: 90%;
        max-width: 1200px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 0 30px rgba(139, 92, 246, 0.5);
      }

      .st-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 2px solid rgba(139, 92, 246, 0.3);
      }

      .st-modal-header h2 {
        margin: 0;
        color: #8b5cf6;
        font-family: 'Orbitron', sans-serif;
        font-size: 24px;
      }

      .st-close-button {
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

      .st-close-button:hover {
        background: rgba(139, 92, 246, 0.2);
      }

      .st-modal-body {
        padding: 20px;
      }

      .st-skill-points {
        background: rgba(139, 92, 246, 0.2);
        border: 2px solid rgba(139, 92, 246, 0.5);
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .st-skill-points .st-label {
        font-weight: bold;
        color: #8b5cf6;
        font-size: 18px;
      }

      .st-skill-points .st-value {
        color: white;
        font-size: 24px;
        font-weight: bold;
      }

      .st-skill-points .st-sp-info {
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        margin-left: 10px;
      }

      .st-branch {
        margin-bottom: 30px;
      }

      .st-branch-title {
        color: #8b5cf6;
        font-family: 'Orbitron', sans-serif;
        font-size: 20px;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid rgba(139, 92, 246, 0.3);
      }

      .st-skills-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 15px;
      }

      .st-skill {
        background: rgba(20, 20, 30, 0.8);
        border: 2px solid rgba(139, 92, 246, 0.3);
        border-radius: 12px;
        padding: 15px;
        transition: all 0.3s ease;
        position: relative;
      }

      .st-skill.unlocked {
        border-color: rgba(0, 255, 136, 0.6);
        background: rgba(0, 255, 136, 0.1);
      }

      .st-skill.can-unlock {
        border-color: rgba(139, 92, 246, 0.8);
        cursor: pointer;
      }

      .st-skill.can-unlock:hover {
        border-color: rgba(139, 92, 246, 1);
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
        transform: translateY(-2px);
      }

      .st-skill-icon {
        font-size: 32px;
        text-align: center;
        margin-bottom: 10px;
      }

      .st-skill-name {
        font-weight: bold;
        color: #8b5cf6;
        font-size: 16px;
        margin-bottom: 5px;
        text-align: center;
      }

      .st-skill-desc {
        color: rgba(255, 255, 255, 0.8);
        font-size: 14px;
        margin-bottom: 10px;
        text-align: center;
      }

      .st-skill-cost {
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        text-align: center;
        margin-bottom: 5px;
      }

      .st-skill-req {
        color: rgba(255, 200, 0, 0.8);
        font-size: 11px;
        text-align: center;
        margin-top: 5px;
      }

      .st-unlock-btn {
        width: 100%;
        margin-top: 10px;
        padding: 8px;
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        border: none;
        border-radius: 6px;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .st-unlock-btn:hover {
        background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
        box-shadow: 0 0 10px rgba(139, 92, 246, 0.6);
      }
    `;

    document.head.appendChild(style);
  }

  removeCSS() {
    const style = document.getElementById('skill-tree-css');
    if (style) style.remove();
  }

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.innerHTML = `
      <div>
        <h3 style="color: #8b5cf6;">Skill Tree Settings</h3>
        <label style="display: flex; align-items: center; margin-bottom: 10px;">
          <input type="checkbox" ${this.settings.enabled ? 'checked' : ''} id="st-enabled">
          <span style="margin-left: 10px;">Enable Skill Tree</span>
        </label>
        <div style="margin-top: 20px;">
          <p>Skill Points: <strong>${this.settings.skillPoints}</strong></p>
          <p>Unlocked Skills: <strong>${this.settings.unlockedSkills.length}</strong></p>
        </div>
      </div>
    `;

    panel.querySelector('#st-enabled').addEventListener('change', (e) => {
      this.settings.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        this.createSkillTreeButton();
      } else {
        this.removeSkillTreeButton();
        this.closeSkillTreeModal();
      }
    });

    return panel;
  }
};
