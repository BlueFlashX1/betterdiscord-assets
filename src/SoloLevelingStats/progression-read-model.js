module.exports = {
  getBuffPercents(statKey, titleBonus, shadowBuffs) {
    // Title: support both old format (raw numbers) and new format (percentages)
    const percentKey = `${statKey}Percent`;
    const rawKey = statKey === 'perception' ? (titleBonus.perception || 0) : (titleBonus[statKey] || 0);
    const titlePercent = titleBonus[percentKey] || (rawKey ? rawKey / 100 : 0);
  
    // Shadow: percentages (0.1 = 10%)
    let shadowPercent = 0;
    if (shadowBuffs) {
      shadowPercent = statKey === 'perception'
        ? (shadowBuffs.perception || 0)
        : (shadowBuffs[statKey] || 0);
    }
  
    return { titlePercent, shadowPercent };
  },

  formatSignedPercent(value, precision = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '+0%';
    return `${numeric >= 0 ? '+' : ''}${(numeric * 100).toFixed(precision)}%`;
  },

  formatMultiplierDelta(multiplier, precision = 1) {
    const numeric = Number(multiplier);
    if (!Number.isFinite(numeric)) return '+0%';
    return this.formatSignedPercent(numeric - 1, precision);
  },

  getUnifiedBuffSummary() {
    const groups = [];
  
    try {
      const titleBonus = this.getActiveTitleBonus();
      const activeTitle = this.settings?.achievements?.activeTitle || null;
      const titleEntries = [];
  
      (titleBonus.xp || 0) > 0 &&
        titleEntries.push({ label: 'XP', value: this.formatSignedPercent(titleBonus.xp, 0) });
      (titleBonus.critChance || 0) > 0 &&
        titleEntries.push({ label: 'Crit', value: this.formatSignedPercent(titleBonus.critChance, 0) });
  
      const statLabels = { strength: 'STR', agility: 'AGI', intelligence: 'INT', vitality: 'VIT', perception: 'PER' };
      this.STAT_KEYS.forEach((statKey) => {
        const { titlePercent } = this.getBuffPercents(statKey, titleBonus || {}, null);
        if (titlePercent > 0) {
          titleEntries.push({ label: statLabels[statKey], value: this.formatSignedPercent(titlePercent, 0) });
        }
      });
  
      if (titleEntries.length > 0) {
        groups.push({
          source: activeTitle ? `Title Manager — ${activeTitle}` : 'Title Manager',
          entries: titleEntries,
        });
      }
    } catch (_) {}
  
    try {
      const shadowBuffs = this.getEffectiveShadowArmyBuffs();
      const shadowEntries = [];
      const statLabels = { strength: 'STR', agility: 'AGI', intelligence: 'INT', vitality: 'VIT', perception: 'PER' };
  
      this.STAT_KEYS.forEach((statKey) => {
        const value = Number(shadowBuffs?.[statKey] || 0);
        if (value > 0) {
          shadowEntries.push({ label: statLabels[statKey], value: this.formatSignedPercent(value, 1) });
        }
      });
  
      if (shadowEntries.length > 0) {
        groups.push({ source: 'Shadow Army', entries: shadowEntries });
      }
    } catch (_) {}
  
    try {
      const hiddenBlessings = this.getHiddenBlessingBonuses?.() || null;
      const blessingEntries = [];
      if (hiddenBlessings) {
        Number(hiddenBlessings.xpBonus || 0) > 0 &&
          blessingEntries.push({ label: 'XP', value: this.formatSignedPercent(hiddenBlessings.xpBonus, 1) });
        Number(hiddenBlessings.naturalGrowthMultiplier || 1) > 1 &&
          blessingEntries.push({
            label: 'Natural Growth',
            value: this.formatMultiplierDelta(hiddenBlessings.naturalGrowthMultiplier, 1),
          });
      }
      if (blessingEntries.length > 0) {
        const rankSuffix = hiddenBlessings?.sourceRank ? ` (${hiddenBlessings.sourceRank})` : '';
        groups.push({
          source: `Hidden Blessings — Blessing of Kandiaru${rankSuffix}`,
          entries: blessingEntries,
        });
      }
    } catch (_) {}

    try {
      const bonuses = this.getSkillTreeBonuses() || null;
      const passiveEntries = [];
      if (bonuses) {
        Number(bonuses.xpBonus || 0) > 0 &&
          passiveEntries.push({ label: 'XP', value: this.formatSignedPercent(bonuses.xpBonus, 1) });
        Number(bonuses.critBonus || 0) > 0 &&
          passiveEntries.push({ label: 'Crit', value: this.formatSignedPercent(bonuses.critBonus, 1) });
        Number(bonuses.critDamageBonus || 0) > 0 &&
          passiveEntries.push({
            label: 'Crit Damage',
            value: this.formatSignedPercent(bonuses.critDamageBonus, 1),
          });
        Number(bonuses.questBonus || 0) > 0 &&
          passiveEntries.push({ label: 'Quest', value: this.formatSignedPercent(bonuses.questBonus, 1) });
        Number(bonuses.longMsgBonus || 0) > 0 &&
          passiveEntries.push({ label: 'Long Msg', value: this.formatSignedPercent(bonuses.longMsgBonus, 1) });
        Number(bonuses.allStatBonus || 0) > 0 &&
          passiveEntries.push({ label: 'All Stats', value: this.formatSignedPercent(bonuses.allStatBonus, 1) });
        Number(bonuses.attackCooldownReduction || 0) > 0 &&
          passiveEntries.push({
            label: 'Attack Cooldown',
            value: `-${(Number(bonuses.attackCooldownReduction) * 100).toFixed(1)}%`,
          });
        Number(bonuses.daggerThrowDamageBonus || 0) > 0 &&
          passiveEntries.push({
            label: 'Dagger Throw',
            value: this.formatSignedPercent(bonuses.daggerThrowDamageBonus, 1),
          });
        Number(bonuses.hpRegenBonus || 0) > 0 &&
          passiveEntries.push({ label: 'HP Regen', value: this.formatSignedPercent(bonuses.hpRegenBonus, 1) });
        Number(bonuses.manaRegenBonus || 0) > 0 &&
          passiveEntries.push({ label: 'Mana Regen', value: this.formatSignedPercent(bonuses.manaRegenBonus, 1) });
        Number(bonuses.debuffDurationReduction || 0) > 0 &&
          passiveEntries.push({
            label: 'Debuff Duration',
            value: `-${(Number(bonuses.debuffDurationReduction) * 100).toFixed(1)}%`,
          });
        Number(bonuses.debuffResistChance || 0) > 0 &&
          passiveEntries.push({
            label: 'Debuff Resist',
            value: this.formatSignedPercent(bonuses.debuffResistChance, 1),
          });
        Number(bonuses.debuffCleanseChance || 0) > 0 &&
          passiveEntries.push({
            label: 'Cleanse Chance',
            value: this.formatSignedPercent(bonuses.debuffCleanseChance, 1),
          });
        Number(bonuses.tenacityDamageReduction || 0) > 0 &&
          Number(bonuses.tenacityThreshold || 0) > 0 &&
          passiveEntries.push({
            label: 'Tenacity',
            value: `-${(Number(bonuses.tenacityDamageReduction) * 100).toFixed(0)}% damage <${Math.round(Number(bonuses.tenacityThreshold) * 100)}% HP`,
          });
      }
      if (passiveEntries.length > 0) {
        groups.push({ source: 'Skill Tree (Passive)', entries: passiveEntries });
      }
    } catch (_) {}
  
    try {
      const activeBuffs = this.getActiveSkillBuffs() || null;
      const activeEntries = [];
      if (activeBuffs) {
        Number(activeBuffs.xpMultiplier || 1) > 1 &&
          activeEntries.push({
            label: 'XP Multiplier',
            value: this.formatMultiplierDelta(activeBuffs.xpMultiplier, 1),
          });
        Number(activeBuffs.allStatMultiplier || 1) > 1 &&
          activeEntries.push({
            label: 'All Stats',
            value: this.formatMultiplierDelta(activeBuffs.allStatMultiplier, 1),
          });
        Number(activeBuffs.globalMultiplier || 1) > 1 &&
          activeEntries.push({
            label: 'Global Multiplier',
            value: this.formatMultiplierDelta(activeBuffs.globalMultiplier, 1),
          });
        Number(activeBuffs.critChanceBonus || 0) > 0 &&
          activeEntries.push({
            label: 'Crit Chance',
            value: this.formatSignedPercent(activeBuffs.critChanceBonus, 1),
          });
        activeBuffs.guaranteedCrit === true &&
          activeEntries.push({ label: 'Guaranteed Crit', value: 'Active' });
      }
      if (activeEntries.length > 0) {
        groups.push({ source: 'Skill Tree (Active)', entries: activeEntries });
      }
    } catch (_) {}
  
    try {
      const dungeons = this._SLUtils?.getPluginInstance?.('Dungeons');
      if (dungeons) {
        let channelKey = dungeons.currentChannelKey || dungeons.settings?.userActiveDungeon || null;
        if (!channelKey && dungeons.activeDungeons?.size === 1) {
          channelKey = dungeons.activeDungeons.keys().next().value || null;
        }
        if (!channelKey && typeof dungeons.getChannelInfo === 'function') {
          const info = dungeons.getChannelInfo();
          if (info?.guildId && info?.channelId) channelKey = `${info.guildId}_${info.channelId}`;
        }
  
        const roleEntries = [];
        const roleContext = channelKey && typeof dungeons.getRoleCombatTickContext === 'function'
          ? dungeons.getRoleCombatTickContext(channelKey)
          : null;
  
        if (roleContext?.enabled) {
          const bossBoost = Number(roleContext.bossMarkMultiplier || 1) - 1;
          const mobBoost = Number(roleContext.mobMarkMultiplier || 1) - 1;
          const incomingReduction = 1 - Number(roleContext.incomingDamageMultiplier || 1);
          bossBoost > 0 && roleEntries.push({ label: 'Boss Damage', value: this.formatSignedPercent(bossBoost, 1) });
          mobBoost > 0 && roleEntries.push({ label: 'Mob Damage', value: this.formatSignedPercent(mobBoost, 1) });
          incomingReduction > 0 &&
            roleEntries.push({ label: 'Damage Taken', value: this.formatSignedPercent(-incomingReduction, 1) });
        }
  
        if (roleEntries.length > 0) {
          const dungeonMeta = channelKey ? dungeons.activeDungeons?.get?.(channelKey) : null;
          const dungeonLabel =
            dungeonMeta?.name && dungeonMeta?.rank
              ? `${dungeonMeta.name} [${dungeonMeta.rank}]`
              : null;
          groups.push({
            source: dungeonLabel ? `Dungeons — ${dungeonLabel}` : 'Dungeons',
            entries: roleEntries,
          });
        }
      }
    } catch (_) {}
  
    return groups;
  },

  getCurrentLevel() {
    // Check cache first
    const now = Date.now();
    if (
      this._cache.currentLevel &&
      this._cache.currentLevelTime &&
      now - this._cache.currentLevelTime < this._cache.currentLevelTTL
    ) {
      return this._cache.currentLevel;
    }
  
    // CRITICAL: Ensure totalXP is valid (prevent progress bar from breaking)
    const totalXP =
      typeof this.settings.totalXP === 'number' &&
      !isNaN(this.settings.totalXP) &&
      this.settings.totalXP >= 0
        ? this.settings.totalXP
        : 0;
  
    let level = 1;
    let totalXPNeeded = 0;
    let xpForNextLevel = 0;
  
    // Safety: Prevent infinite loop (max level 10000)
    const maxLevel = 10000;
    let iterations = 0;
  
    // Calculate level based on total XP
    while (iterations < maxLevel) {
      xpForNextLevel = this.getXPRequiredForLevel(level);
      if (totalXPNeeded + xpForNextLevel > totalXP) {
        break;
      }
      totalXPNeeded += xpForNextLevel;
      level++;
      iterations++;
    }
  
    // Ensure xpForNextLevel is valid (at least 1)
    if (xpForNextLevel <= 0) {
      xpForNextLevel = this.getXPRequiredForLevel(level);
    }
  
    // Calculate current XP in level
    const currentXP = Math.max(0, totalXP - totalXPNeeded);
  
    const result = {
      level: level,
      xp: currentXP,
      xpRequired: xpForNextLevel,
      totalXPNeeded: totalXPNeeded,
    };
  
    // Cache the result
    this._cache.currentLevel = result;
    this._cache.currentLevelTime = now;
  
    return result;
  },

  getRankRequirements() {
    // Rank requirements: [level, achievements required, description]
    return {
      E: { level: 1, achievements: 0, name: 'E-Rank Hunter', next: 'D' },
      D: { level: 10, achievements: 2, name: 'D-Rank Hunter', next: 'C' },
      C: { level: 25, achievements: 5, name: 'C-Rank Hunter', next: 'B' },
      B: { level: 50, achievements: 10, name: 'B-Rank Hunter', next: 'A' },
      A: { level: 100, achievements: 15, name: 'A-Rank Hunter', next: 'S' },
      S: { level: 200, achievements: 20, name: 'S-Rank Hunter', next: 'SS' },
      SS: { level: 300, achievements: 22, name: 'SS-Rank Hunter', next: 'SSS' },
      SSS: { level: 400, achievements: 24, name: 'SSS-Rank Hunter', next: 'SSS+' },
      'SSS+': { level: 500, achievements: 26, name: 'SSS+-Rank Hunter', next: 'NH' },
      NH: { level: 700, achievements: 28, name: 'National Hunter', next: 'Monarch' },
      Monarch: { level: 1000, achievements: 30, name: 'Monarch', next: 'Monarch+' },
      'Monarch+': { level: 1500, achievements: 33, name: 'Monarch+', next: 'Shadow Monarch' },
      'Shadow Monarch': { level: 2000, achievements: 35, name: 'Shadow Monarch', next: null },
    };
  },

  getTotalEffectiveStats() {
    // Check cache first
    const now = Date.now();
    const statKeys = this.getStatKeys();
    const normalizedStatsForKey = this.normalizeStatBlock(this.settings.stats, 0);
    const cacheKey = `${statKeys.map((key) => normalizedStatsForKey[key]).join('_')}_${this.settings.achievements?.activeTitle || ''}`;
  
    if (
      this._cache.totalEffectiveStats &&
      this._cache.totalEffectiveStatsKey === cacheKey &&
      this._cache.totalEffectiveStatsTime &&
      now - this._cache.totalEffectiveStatsTime < this._cache.totalEffectiveStatsTTL
    ) {
      return this._cache.totalEffectiveStats;
    }
  
    // CRITICAL: Ensure stats object exists and has all required properties
    // If stats are missing or reset, initialize with defaults to prevent all-zero stats
    if (!this.settings.stats || typeof this.settings.stats !== 'object') {
      this.settings.stats = this.createEmptyStatBlock();
      this.saveSettings(); // Save initialized stats
      this.debugLog('STATS', 'Stats object was missing, initialized with defaults');
    }
  
    // Ensure all stat properties exist (migration safety)
    const baseStats = this.normalizeStatBlock(this.settings.stats, 0);
  
    const titleBonus = this.getActiveTitleBonus();
    const shadowBuffs = this.getEffectiveShadowArmyBuffs();
  
    // Apply title + shadow bonuses multiplicatively per stat using shared helper
    const result = this.createEmptyStatBlock();
    for (const key of statKeys) {
      const { titlePercent, shadowPercent } = this.getBuffPercents(key, titleBonus, shadowBuffs);
      const withTitle = Math.round(baseStats[key] * (1 + titlePercent));
      result[key] = Math.round(withTitle * (1 + shadowPercent));
    }
  
    // Cache the result
    this._cache.totalEffectiveStats = result;
    this._cache.totalEffectiveStatsKey = cacheKey;
    this._cache.totalEffectiveStatsTime = now;
  
    return result;
  },

  getTotalShadowPower() {
    // Return cached value immediately
    return this.cachedShadowPower;
  },

  clampPercentage(value) {
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  },

  formatPercentWidth(value) {
    return `${this.clampPercentage(value).toFixed(2)}%`;
  },

  getLevelProgressSnapshot({ allowFallback = false, logContext = null } = {}) {
    const levelInfo = this.getCurrentLevel();
    if (levelInfo && Number.isFinite(levelInfo.xpRequired) && levelInfo.xpRequired > 0) {
      return {
        valid: true,
        source: 'levelInfo',
        levelInfo,
        xp: levelInfo.xp,
        xpRequired: levelInfo.xpRequired,
        xpPercent: this.clampPercentage((levelInfo.xp / levelInfo.xpRequired) * 100),
      };
    }
  
    if (allowFallback) {
      const fallbackXP = this.settings.xp || 0;
      const fallbackXPRequired = this.getXPRequiredForLevel(this.settings.level || 1);
      if (fallbackXPRequired > 0) {
        const xpPercent = this.clampPercentage((fallbackXP / fallbackXPRequired) * 100);
        if (logContext) {
          this.debugLog(logContext, 'Using fallback XP calculation', {
            fallbackXP,
            fallbackXPRequired,
            xpPercent,
            level: this.settings.level,
          });
        }
        return {
          valid: true,
          source: 'fallback',
          levelInfo: levelInfo || null,
          xp: fallbackXP,
          xpRequired: fallbackXPRequired,
          xpPercent,
        };
      }
    }
  
    return {
      valid: false,
      source: 'invalid',
      levelInfo: levelInfo || null,
      xp: 0,
      xpRequired: 0,
      xpPercent: 0,
    };
  },

  getEventLevelInfoOrNull(logContext) {
    const snapshot = this.getLevelProgressSnapshot({ allowFallback: false });
    if (!snapshot.valid || !snapshot.levelInfo) {
      this.debugLog(logContext, 'Level info not available, skipping emit');
      return null;
    }
    return snapshot.levelInfo;
  },

  buildCoreProgressPayload(levelInfo) {
    return {
      xp: levelInfo.xp,
      xpRequired: levelInfo.xpRequired,
      totalXP: this.settings.totalXP,
      levelInfo,
    };
  }
};
