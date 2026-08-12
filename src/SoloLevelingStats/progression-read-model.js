/**
 * progression-read-model — DERIVED progression values. Object.assign'd onto
 * the SoloLevelingStats prototype.
 *
 * This file computes; it does not persist. Nothing here should write settings —
 * saving lives in settings-store.js, and mixing the two is how a read path
 * ends up overwriting real progress with a derived default.
 *
 * Entry points: getCurrentLevel(), getRankRequirements(), getUnifiedBuffSummary(),
 * and the small formatters the UI uses.
 *
 * LEVEL IS DERIVED, NOT STORED. getCurrentLevel accumulates
 * getXPRequiredForLevel(n) (calculation-bonuses.js) against totalXP until it
 * runs out. Consequences: totalXP is the source of truth, level is a view of
 * it, and anything that mutates level directly will be silently overwritten on
 * the next read.
 *
 * RANK requires BOTH a level threshold and an achievement count — see
 * getRankRequirements. The level-2000 Shadow Monarch ceiling is intentional
 * (an aspirational prestige cap) and must not be "fixed" downward: 26
 * achievements are gated above level 560, and _routeShadowMonarchXp
 * (xp-processing.js) FREEZES levelling once the rank is held, so a lower
 * threshold permanently strands all of them. Pace the endgame through XP
 * rewards instead.
 */
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
    //
    // The level-2000 Shadow Monarch ceiling is INTENTIONAL — an aspirational
    // prestige cap, not a pacing target. Do not compress these to "make the
    // endgame reachable": the level milestones in achievement-definitions.js
    // run to 2000 and _routeShadowMonarchXp freezes leveling once the rank is
    // held, so lowering the SM threshold strands every achievement gated above
    // the new value. Pace the endgame through XP REWARDS (see rankScaledXP in
    // Dungeons/resurrection-completion.js) rather than through these numbers.
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
    // Check cache first.
    // PERF: build the cache key by reading stat values directly from
    // this.settings.stats with a `|| 0` default. The previous
    // normalizeStatBlock(...) + map(...).join(...) approach allocated a
    // defaulted stat object on every call (cache hit OR miss) just to
    // produce a comparable string. Direct read + string concat eliminates
    // that allocation; cache hits become substantially cheaper.
    const now = Date.now();
    const statKeys = this.getStatKeys();
    const stats = this.settings.stats || null;
    // Compute SM Regalia piece count BEFORE the cache-hit guard so equip/unequip
    // invalidates the cache. Gated on SM rank to avoid calling EquipmentManager otherwise.
    let _smPiecesForKey = 0;
    if (this.settings.rank === 'Shadow Monarch') {
      try {
        _smPiecesForKey = Number(window.EquipmentManager?.getEquippedSetPieceCount?.('shadow_monarch_regalia')) || 0;
      } catch (_) {}
    }

    let cacheKey = '';
    for (let i = 0; i < statKeys.length; i++) {
      cacheKey += (stats?.[statKeys[i]] || 0) + '_';
    }
    cacheKey += (this.settings.achievements?.activeTitle || '') + '_sm' + _smPiecesForKey;
  
    if (
      this._cache.totalEffectiveStats &&
      this._cache.totalEffectiveStatsKey === cacheKey &&
      this._cache.totalEffectiveStatsTime &&
      now - this._cache.totalEffectiveStatsTime < this._cache.totalEffectiveStatsTTL
    ) {
      return this._cache.totalEffectiveStats;
    }
  
    // CRITICAL: Ensure stats object exists and has all required properties.
    // If stats are missing or reset, initialize with defaults to prevent
    // all-zero stats. Previously called this.saveSettings() directly from
    // this read path, which is fragile: it can race the startup save guard
    // and trigger an IDB write during a hot getter. Mark settings dirty
    // instead so the 30s periodic save persists the initialization on its
    // next tick — the in-memory state is correct immediately.
    if (!this.settings.stats || typeof this.settings.stats !== 'object') {
      this.settings.stats = this.createEmptyStatBlock();
      this._settingsDirty = true;
      this.debugLog('STATS', 'Stats object was missing, initialized with defaults (deferred save)');
    }
  
    // Ensure all stat properties exist (migration safety)
    const baseStats = this.normalizeStatBlock(this.settings.stats, 0);
  
    const titleBonus = this.getActiveTitleBonus();
    const shadowBuffs = this.getEffectiveShadowArmyBuffs();
    const equipBonuses = this.getEquipmentBonuses();

    // Apply title + shadow bonuses multiplicatively per stat using shared helper.
    // Equipment bonuses are flat additions applied to base stats before multipliers.
    // Combat stats (attack, defense, critChance, critDamage) are flat additions only —
    // title and shadow multipliers are designed for base stats and must not apply here.
    const baseCombatKeys = new Set(['attack', 'defense', 'critChance', 'critDamage']);

    // SHADOW MONARCH PERK (H1 — Shadow Monarch's Regalia): on TOP of the set's high fixed
    // stats (it's the strongest gear in the game), this perk layers extra power that scales
    // with the player's OWN base stats and grows over time as those grow
    // (mob defeats -> Kandiaru's Favor). Each equipped regalia piece contributes; the
    // full 10-piece set scales hardest. Computed here (not the cached equipment path) so
    // it stays fresh as base stats climb. Treated as a flat base-stat addition, like other
    // equipment, so it then benefits from title/shadow multipliers below.
    const smSetBonus = {};
    if (this.settings.rank === 'Shadow Monarch') {
      // Reuse _smPiecesForKey computed above for the cache key — avoids a second EquipmentManager call.
      const smPieces = _smPiecesForKey;
      if (smPieces > 0) {
        const coreKeys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
        const totalBase = coreKeys.reduce((s, k) => s + (Number(baseStats[k]) || 0), 0);
        // Buffed 2026-08-10: the old formula (setMultiplier = pieces/10 * base/5000)
        // gave almost nothing until ~5000 base stats, so the terminal Lv2000 reward
        // felt weak. Now the full set GUARANTEES a strong floor (+100% all stats) AND
        // keeps scaling — uncapped — as base stats climb, so it grows with the player.
        // Effective (full set): +100% + (totalBase / 2000)*100% all stats, before the
        // title/shadow multipliers applied below. Per-piece proportional via setFraction.
        const SM_REGALIA_BASE = 1.0;      // +100% at full 10-piece set, before scaling
        const SM_REGALIA_DIVISOR = 1000;  // additional fraction per point of total base stats, uncapped (grows twice as fast)
        const setFraction = smPieces / 10;
        const setMultiplier = setFraction * (SM_REGALIA_BASE + totalBase / SM_REGALIA_DIVISOR);
        if (setMultiplier > 0) {
          for (const k of coreKeys) {
            smSetBonus[k] = Math.floor((Number(baseStats[k]) || 0) * setMultiplier);
          }
        }
      }
    }

    const result = this.createEmptyStatBlock();
    for (const key of statKeys) {
      const withEquip = baseStats[key] + (Number(equipBonuses[key]) || 0) + (Number(smSetBonus[key]) || 0);
      if (baseCombatKeys.has(key)) {
        // Combat stats: flat addition only, no title/shadow multipliers
        result[key] = withEquip;
      } else {
        // Base stats: apply title and shadow multipliers
        const { titlePercent, shadowPercent } = this.getBuffPercents(key, titleBonus, shadowBuffs);
        const withTitle = Math.round(withEquip * (1 + titlePercent));
        result[key] = Math.round(withTitle * (1 + shadowPercent));
      }
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
