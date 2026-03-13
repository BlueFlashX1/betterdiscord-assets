// Duplicated from index.js — kept in sync for rank requirement checks
const SOLO_RANK_ORDER = Object.freeze([
  'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SSS+', 'NH', 'Monarch', 'Monarch+', 'Shadow Monarch',
]);

const SkillTreeUpgradeMethods = {
  _syncUnlockedSkillState(skillId) {
    if (!Array.isArray(this.settings.unlockedSkills)) {
      this.settings.unlockedSkills = [];
    }
    if (!this.settings.unlockedSkills.includes(skillId)) {
      this.settings.unlockedSkills.push(skillId);
    }
  },

  _finalizeSkillUpgrade(skillId) {
    this.settings.totalSpentSP = this.getTotalSpentSP();
    this._syncUnlockedSkillState(skillId);

    // Skill upgrades immediately affect computed bonuses.
    this._cache.skillBonuses = null;
    this._cache.skillBonusesTime = 0;

    this.saveSettings();
    this.updateButtonText();

    // Broadcast skill level change so other plugins can react (e.g. defer resource init)
    const newLevel = this.getSkillLevel(skillId);
    try {
      document.dispatchEvent(
        new CustomEvent('SkillTree:skillLevelChanged', {
          detail: { skillId, level: newLevel },
        })
      );
    } catch (_) { /* ignore dispatch errors */ }
  },

  /**
   * Get skill level (0 = not unlocked)
   * @param {string} skillId - Skill ID
   * @returns {number} - Skill level (0 if not unlocked)
   */
  getSkillLevel(skillId) {
    return this.settings.skillLevels[skillId] || 0;
  },

  /**
   * Get skill unlock cost
   * @param {Object} skill - Skill definition
   * @param {Object} tier - Tier definition
   * @returns {number} - Unlock cost in SP
   */
  getSkillUnlockCost(skill, tier) {
    return tier.baseCost || 1;
  },

  /**
   * Get total upgrade cost for a skill up to a certain level
   * @param {Object} skill - Skill definition
   * @param {Object} tier - Tier definition
   * @param {number} targetLevel - Target level
   * @returns {number} - Total upgrade cost
   */
  getSkillUpgradeCost(skill, tier, targetLevel) {
    if (targetLevel <= 1) return 0;

    const baseCost = tier.baseCost || 1;
    const multiplier = tier.upgradeCostMultiplier || 1.5;

    // Avoid per-call allocations in a hot path (exact semantics retained via per-level ceil)
    let total = 0;
    for (let i = 1; i <= targetLevel - 1; i++) {
      total += Math.ceil(baseCost * i * multiplier);
    }
    return total;
  },

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

    const maxLevel = skill.unlockOnly ? 1 : (skill.maxLevel || tier.maxLevel || 10);
    if (currentLevel >= maxLevel) {
      return null; // Already max level
    }

    const baseCost = tier.baseCost || 1;
    const multiplier = tier.upgradeCostMultiplier || 1.5;
    return Math.ceil(baseCost * currentLevel * multiplier);
  },

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
  },

  /**
   * Find skill and tier by skill ID
   * @param {string} skillId - Skill ID to find
   * @returns {Object|null} - Object with skill and tier, or null if not found
   */
  findSkillAndTier(skillId) {
    try {
      // FUNCTIONAL: Find skill using Object.values().find() (no for-in loop)
      const result = Object.values(this.skillTree)
        .filter((tierData) => tierData?.skills)
        .map((tierData) => ({
          skill: tierData.skills.find((s) => s.id === skillId),
          tier: tierData,
        }))
        .find(({ skill }) => skill);

      return result || null;
    } catch (error) {
      console.error("SkillTree: Error finding skill", error);
      return null;
    }
  },

  _meetsMinimumRequirement(requiredValue, currentValue) {
    return !requiredValue || currentValue >= requiredValue;
  },

  _meetsStatRequirements(requirement, stats) {
    const perception = stats.perception || 0;
    const statRules = [
      ["strength", stats.strength || 0],
      ["agility", stats.agility || 0],
      ["intelligence", stats.intelligence || 0],
      ["vitality", stats.vitality || 0],
      ["perception", perception],
    ];

    return statRules.every(([key, value]) => this._meetsMinimumRequirement(requirement[key], value));
  },

  _hasRequiredSkills(requirementSkills) {
    if (!Array.isArray(requirementSkills)) return true;
    return requirementSkills.every((prereqId) => this.getSkillLevel(prereqId) > 0);
  },

  _meetsRankRequirement(requiredRank, currentRank) {
    if (!requiredRank) return true;
    const reqIdx = SOLO_RANK_ORDER.indexOf(requiredRank);
    const curIdx = SOLO_RANK_ORDER.indexOf(currentRank);
    if (reqIdx === -1 || curIdx === -1) return false;
    return curIdx >= reqIdx;
  },

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
      const maxLevel = skill.unlockOnly ? 1 : (skill.maxLevel || tier.maxLevel || 10);

      // Early returns for invalid states
      if (currentLevel >= maxLevel) return false;

      const cost = this.getNextUpgradeCost(skill, tier);
      if (!cost || this.settings.skillPoints < cost) return false;

      // Check level requirement
      const requirement = skill.requirement || {};
      if (!this._meetsMinimumRequirement(requirement.level, soloData.level)) {
        return false;
      }

      // Check stat requirements
      const stats = soloData.stats || {};
      if (!this._meetsStatRequirements(requirement, stats)) return false;

      // Check rank requirement
      if (!this._meetsRankRequirement(requirement.rank, soloData.rank)) return false;

      // Check prerequisite skills
      if (!this._hasRequiredSkills(requirement.skills)) return false;

      return true;
    } catch (error) {
      console.error("SkillTree: Error checking if skill can be unlocked", error);
      return false;
    }
  },

  /**
   * Unlock or upgrade a skill
   * @param {string} skillId - Skill ID to unlock/upgrade
   * @returns {boolean} - True if successful
   */
  unlockOrUpgradeSkill(skillId) {
    try {
      const result = this.findSkillAndTier(skillId);
      if (!result) {
        console.error("SkillTree: Skill not found:", skillId);
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

      this._finalizeSkillUpgrade(skillId);

      // Show notification
      const newLevel = this.getSkillLevel(skillId);
      const message =
        currentLevel === 0
          ? `Skill Unlocked: ${skill.name}`
          : `${skill.name} upgraded to Level ${newLevel}!`;
      this._toast(message, "success");

      return true;
    } catch (error) {
      console.error("SkillTree: Error unlocking/upgrading skill", error);
      return false;
    }
  },

  _buildMaxUpgradePlan(tier, currentLevel, availableSP, skill = null) {
    const maxLevel = (skill && skill.unlockOnly) ? 1 : (skill?.maxLevel || tier.maxLevel || 10);
    const baseCost = tier.baseCost || 1;
    const multiplier = tier.upgradeCostMultiplier || 1.5;

    let targetLevel = currentLevel;
    let totalCost = 0;
    let levelsUpgraded = 0;
    let remainingSP = availableSP;

    while (targetLevel < maxLevel && remainingSP > 0) {
      const nextCost =
        targetLevel === 0
          ? baseCost
          : Math.ceil(baseCost * targetLevel * multiplier);
      if (!nextCost || remainingSP < nextCost) break;

      totalCost += nextCost;
      remainingSP -= nextCost;
      targetLevel++;
      levelsUpgraded++;
    }

    return { maxLevel, targetLevel, levelsUpgraded, totalCost };
  },

  /**
   * Max upgrade a skill (use all remaining SP)
   * @param {string} skillId - Skill ID to max upgrade
   * @returns {boolean} - True if successful
   */
  maxUpgradeSkill(skillId) {
    try {
      const result = this.findSkillAndTier(skillId);
      if (!result) {
        console.error("SkillTree: Skill not found:", skillId);
        return false;
      }

      const { skill, tier } = result;
      const currentLevel = this.getSkillLevel(skillId);
      const plan = this._buildMaxUpgradePlan(tier, currentLevel, this.settings.skillPoints, skill);

      // Early returns
      if (currentLevel >= plan.maxLevel) return false;

      // Check requirements
      if (!this.canUnlockSkill(skill, tier)) {
        return false;
      }

      if (plan.levelsUpgraded === 0) {
        return false; // Can't afford any upgrades
      }

      // Apply upgrades
      this.settings.skillPoints -= plan.totalCost;
      this.settings.skillLevels[skillId] = plan.targetLevel;

      this._finalizeSkillUpgrade(skillId);

      // Show notification
      const message =
        currentLevel === 0
          ? `Skill Unlocked: ${skill.name} (Level ${plan.targetLevel})`
          : `${skill.name} upgraded ${plan.levelsUpgraded} level(s) to Level ${plan.targetLevel}!`;
      this._toast(message, "success");

      return true;
    } catch (error) {
      console.error("SkillTree: Error max upgrading skill", error);
      return false;
    }
  },
};

module.exports = { SkillTreeUpgradeMethods };
