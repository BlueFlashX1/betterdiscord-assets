/**
 * @name ShadowArmy
 * @author BlueFlashX1
 * @description Solo Leveling Shadow Army system - Extract and collect shadows with ranks, roles, and abilities
 * @version 1.0.0
 */

module.exports = class ShadowArmy {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      shadows: [], // Array of shadow objects
      totalShadowsExtracted: 0,
      lastExtractionTime: null,
      favoriteShadowIds: [], // Up to 7 "general" shadows (favorites)
      favoriteLimit: 7,
      extractionConfig: {
        // Base extraction tuning
        minBaseChance: 0.001, // 0.1% minimum
        chancePerInt: 0.005, // +0.5% per INT
        maxExtractionsPerMinute: 20, // hard safety cap
        // Special ARISE event tuning
        specialBaseChance: 0.01, // 1% base
        specialIntMultiplier: 0.003, // +0.3% per INT
        specialLuckMultiplier: 0.002, // +0.2% per Luck (perception proxy)
        specialMaxChance: 0.3, // 30% hard cap
        specialMaxPerDay: 5, // limit special events per day
      },
      specialArise: {
        lastDate: null,
        countToday: 0,
      },
    };

    // Shadow ranks (matching Solo Leveling rank system)
    this.shadowRanks = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SSS+', 'NH', 'Monarch', 'Monarch+', 'Shadow Monarch'];

    // Shadow roles with their abilities and effects
    this.shadowRoles = {
      tank: {
        name: 'Tank',
        description: 'High defense, protects your messages',
        buffs: { vitality: 0.1, strength: 0.05 }, // +10% VIT, +5% STR per shadow
        effect: 'Message Protection', // Reduces message deletion chance
      },
      healer: {
        name: 'Healer',
        description: 'Restores HP and provides support',
        buffs: { vitality: 0.15, luck: 0.1 }, // +15% VIT, +10% LUK per shadow
        effect: 'HP Regeneration', // Restores HP over time
      },
      mage: {
        name: 'Mage',
        description: 'Powerful magic attacks, boosts XP',
        buffs: { intelligence: 0.15, agility: 0.05 }, // +15% INT, +5% AGI per shadow
        effect: 'XP Amplification', // Increases XP gain
      },
      assassin: {
        name: 'Assassin',
        description: 'High crit chance and stealth',
        buffs: { agility: 0.2, strength: 0.05 }, // +20% AGI, +5% STR per shadow
        effect: 'Crit Enhancement', // Increases crit chance
      },
      ranger: {
        name: 'Ranger',
        description: 'Long-range attacks, boosts collection',
        buffs: { agility: 0.1, intelligence: 0.1 }, // +10% AGI, +10% INT per shadow
        effect: 'Collection Boost', // Increases shadow extraction chance
      },
      knight: {
        name: 'Knight',
        description: 'Balanced warrior, all-around buffs',
        buffs: { strength: 0.1, agility: 0.1, vitality: 0.1 }, // +10% STR/AGI/VIT per shadow
        effect: 'Balanced Power', // General stat boost
      },
      berserker: {
        name: 'Berserker',
        description: 'High damage, low defense',
        buffs: { strength: 0.2, vitality: -0.05 }, // +20% STR, -5% VIT per shadow
        effect: 'Damage Boost', // Increases damage/XP multiplier
      },
      support: {
        name: 'Support',
        description: 'Buffs allies and provides utility',
        buffs: { luck: 0.15, intelligence: 0.1 }, // +15% LUK, +10% INT per shadow
        effect: 'Luck Amplification', // Increases luck-based bonuses
      },
    };

    // Stat weight templates per role (used to generate per-shadow stats)
    // Higher weight = that role favors that stat more
    this.shadowRoleStatWeights = {
      tank:        { strength: 0.8, agility: 0.4, intelligence: 0.2, vitality: 1.2, luck: 0.3 },
      healer:      { strength: 0.3, agility: 0.3, intelligence: 0.9, vitality: 1.1, luck: 0.8 },
      mage:        { strength: 0.2, agility: 0.5, intelligence: 1.3, vitality: 0.5, luck: 0.5 },
      assassin:    { strength: 0.7, agility: 1.4, intelligence: 0.4, vitality: 0.4, luck: 0.6 },
      ranger:      { strength: 0.5, agility: 1.0, intelligence: 0.9, vitality: 0.5, luck: 0.6 },
      knight:      { strength: 1.0, agility: 0.9, intelligence: 0.5, vitality: 1.0, luck: 0.4 },
      berserker:   { strength: 1.4, agility: 0.7, intelligence: 0.2, vitality: 0.6, luck: 0.3 },
      support:     { strength: 0.3, agility: 0.5, intelligence: 1.0, vitality: 0.7, luck: 1.1 },
    };

    this.settings = this.defaultSettings;
    this.soloPlugin = null;
  }

  start() {
    this.loadSettings();
    this.injectCSS();
    this.integrateWithSoloLeveling();
    this.setupMessageListener();
    console.log('ShadowArmy: Plugin started');
  }

  stop() {
    this.removeMessageListener();
    this.removeCSS();
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load('ShadowArmy', 'settings');
      if (saved) {
        this.settings = { ...this.defaultSettings, ...saved };
        // Ensure shadows array exists
        if (!Array.isArray(this.settings.shadows)) {
          this.settings.shadows = [];
        }
        // Ensure favorites array exists
        if (!Array.isArray(this.settings.favoriteShadowIds)) {
          this.settings.favoriteShadowIds = [];
        }
        if (typeof this.settings.favoriteLimit !== 'number') {
          this.settings.favoriteLimit = 7;
        }
        if (!this.settings.extractionConfig) {
          this.settings.extractionConfig = { ...this.defaultSettings.extractionConfig };
        } else {
          // Backfill any missing config keys
          this.settings.extractionConfig = {
            ...this.defaultSettings.extractionConfig,
            ...this.settings.extractionConfig,
          };
        }
        if (!this.settings.specialArise) {
          this.settings.specialArise = { ...this.defaultSettings.specialArise };
        }
      }
    } catch (error) {
      console.error('ShadowArmy: Error loading settings', error);
      this.settings = { ...this.defaultSettings };
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('ShadowArmy', 'settings', this.settings);
    } catch (error) {
      console.error('ShadowArmy: Error saving settings', error);
    }
  }

  integrateWithSoloLeveling() {
    // Get SoloLevelingStats plugin
    this.soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
    if (!this.soloPlugin) {
      console.warn('ShadowArmy: SoloLevelingStats plugin not found');
    }
  }

  getSoloLevelingData() {
    if (!this.soloPlugin) {
      this.integrateWithSoloLeveling();
    }
    if (!this.soloPlugin) return null;

    const instance = this.soloPlugin.instance || this.soloPlugin;
    if (!instance || !instance.settings) return null;

    return {
      rank: instance.settings.rank || 'E',
      level: instance.settings.level || 1,
      stats: instance.settings.stats || {},
      intelligence: instance.settings.stats?.intelligence || 0,
    };
  }

  setupMessageListener() {
    // Hook into SoloLevelingStats processMessageSent
    if (this.soloPlugin) {
      const instance = this.soloPlugin.instance || this.soloPlugin;
      if (instance) {
        // Patch processMessageSent to call shadow extraction
        this.originalProcessMessage = instance.processMessageSent;
        if (this.originalProcessMessage) {
          instance.processMessageSent = (messageText) => {
            const result = this.originalProcessMessage.call(instance, messageText);
            // Attempt shadow extraction after message is processed
            setTimeout(() => this.attemptShadowExtraction(), 100);
            return result;
          };
        }

        // Also listen to events if available
        if (typeof instance.on === 'function') {
          this.messageUnsubscribe = instance.on('messageSent', () => {
            this.attemptShadowExtraction();
          });
        }
      }
    }
  }

  removeMessageListener() {
    if (this.messageUnsubscribe) {
      this.messageUnsubscribe();
    }
    // Restore original function
    if (this.soloPlugin && this.originalProcessMessage) {
      const instance = this.soloPlugin.instance || this.soloPlugin;
      if (instance && instance.processMessageSent) {
        instance.processMessageSent = this.originalProcessMessage;
      }
    }
  }

  /**
   * Attempt to extract a shadow when sending a message
   * Chance based on Intelligence stat
   */
  attemptShadowExtraction() {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData) return;

      const intelligence = soloData.intelligence;
      const rank = soloData.rank;
      const level = soloData.level;
      const stats = soloData.stats;

      const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

      // Simple rate limiting: cap extractions per minute
      if (!this.extractionTimestamps) this.extractionTimestamps = [];
      const now = Date.now();
      this.extractionTimestamps = this.extractionTimestamps.filter(
        (t) => now - t < 60 * 1000
      );
      if (this.extractionTimestamps.length >= (cfg.maxExtractionsPerMinute || 20)) {
        return;
      }

      // Base extraction chance: Intelligence * chancePerInt per message
      // Minimum minBaseChance even with 0 INT
      const baseChance = Math.max(
        cfg.minBaseChance || 0.001,
        intelligence * (cfg.chancePerInt || 0.005)
      );

      // First roll: normal extraction
      const roll = Math.random();

      if (roll < baseChance) {
        this.handleExtractionBurst(rank, level, stats, false);
      }
      // Give a tiny amount of XP to favorite shadows per message regardless of extraction
      this.grantShadowXP(1, 'message');

      // Second independent roll: chance for special ARISE event
      // Perception is approximated by Luck stat from SoloLevelingStats
      const luck = soloData.stats?.luck || 0;
      const specialChanceRaw =
        (cfg.specialBaseChance || 0.01) +
        intelligence * (cfg.specialIntMultiplier || 0.003) +
        luck * (cfg.specialLuckMultiplier || 0.002);

      const specialChance = Math.min(
        cfg.specialMaxChance || 0.3,
        specialChanceRaw
      );

      if (specialChance > 0) {
        if (this.canTriggerSpecialArise() && Math.random() < specialChance) {
          this.handleExtractionBurst(rank, level, stats, true);
          this.markSpecialAriseUsed();
        }
      }
    } catch (error) {
      console.error('ShadowArmy: Error attempting extraction', error);
    }
  }

  /**
   * Handle one or multiple extractions (normal or special ARISE)
   */
  handleExtractionBurst(userRank, userLevel, userStats, isSpecial) {
    const now = Date.now();
    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    // Decide how many shadows to extract in this burst
    const count = isSpecial ? 3 + Math.floor(Math.random() * 5) : 1; // 3–7 for special, 1 for normal

    // For special events, temporarily bias rank upwards
    const rankIndex = this.shadowRanks.indexOf(userRank);
    const boostedRankIndex = isSpecial ? Math.min(rankIndex + 2, this.shadowRanks.length - 1) : rankIndex;

    for (let i = 0; i < count; i++) {
      const shadow = this.generateShadow(
        this.shadowRanks[boostedRankIndex] || userRank,
        userLevel,
        userStats
      );
      this.settings.shadows.push(shadow);
      this.settings.totalShadowsExtracted++;
      this.settings.lastExtractionTime = now;
      if (!this.extractionTimestamps) this.extractionTimestamps = [];
      this.extractionTimestamps.push(now);
      console.log('ShadowArmy: Shadow extracted!', shadow);
    }

    // New shadows start with 0 shadow XP; give them a small burst so they can level over time
    if (isSpecial) {
      this.grantShadowXP(10, 'special_arise');
    } else {
      this.grantShadowXP(2, 'extraction');
    }

    this.saveSettings();
    this.showExtractionAnimation(
      // Show the last one in the burst
      this.settings.shadows[this.settings.shadows.length - 1]
    );
    this.updateUI();
  }

  canTriggerSpecialArise() {
    const today = new Date().toDateString();
    if (!this.settings.specialArise) {
      this.settings.specialArise = { ...this.defaultSettings.specialArise };
    }
    if (this.settings.specialArise.lastDate !== today) {
      // New day, reset counter
      this.settings.specialArise.lastDate = today;
      this.settings.specialArise.countToday = 0;
    }
    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;
    return this.settings.specialArise.countToday < (cfg.specialMaxPerDay || 5);
  }

  markSpecialAriseUsed() {
    const today = new Date().toDateString();
    if (!this.settings.specialArise) {
      this.settings.specialArise = { ...this.defaultSettings.specialArise };
    }
    if (this.settings.specialArise.lastDate !== today) {
      this.settings.specialArise.lastDate = today;
      this.settings.specialArise.countToday = 0;
    }
    this.settings.specialArise.countToday += 1;
    this.saveSettings();
  }

  /**
   * Generate a shadow based on rank, level, and stats
   * Higher rank = better shadow quality
   */
  generateShadow(userRank, userLevel, userStats) {
    // Determine shadow rank based on user rank
    // Higher user rank = higher chance of better shadows
    const rankIndex = this.shadowRanks.indexOf(userRank);
    const shadowRank = this.determineShadowRank(rankIndex, userLevel);

    // Random role selection
    const roleKeys = Object.keys(this.shadowRoles);
    const roleKey = roleKeys[Math.floor(Math.random() * roleKeys.length)];
    const role = this.shadowRoles[roleKey];

    // Shadow stats & strength scale with user stats
    // Rank determines the proportional scaling
    const rankMultiplier = this.getRankMultiplier(shadowRank);
    const baseStats = this.generateShadowBaseStats(userStats, roleKey, rankMultiplier);
    const baseStrength = this.calculateShadowStrength(baseStats, 1); // use internal stats for power

    const shadow = {
      id: `shadow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      rank: shadowRank,
      role: roleKey,
      roleName: role.name,
      strength: baseStrength,
      extractedAt: Date.now(),
      level: 1, // Shadow's own level
      xp: 0, // Shadow XP for growth
      baseStats,
      growthStats: {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        luck: 0,
      },
      ownerLevelAtExtraction: userLevel,
    };

    return shadow;
  }

  /**
   * Determine shadow rank based on user rank and level
   * Higher rank = better shadows, but still chance for lower ranks
   */
  determineShadowRank(userRankIndex, userLevel) {
    // Base probabilities shift based on user rank
    // E rank: Mostly E, some D
    // S rank: Mostly A-S, some B-C
    // Monarch: Mostly S-SSS, some A

    const rankProbabilities = this.calculateRankProbabilities(userRankIndex);
    const roll = Math.random();
    let cumulative = 0;

    for (let i = 0; i < this.shadowRanks.length; i++) {
      cumulative += rankProbabilities[i];
      if (roll < cumulative) {
        return this.shadowRanks[i];
      }
    }

    // Fallback to user's rank
    return this.shadowRanks[Math.min(userRankIndex, this.shadowRanks.length - 1)];
  }

  /**
   * Calculate probability distribution for shadow ranks based on user rank
   */
  calculateRankProbabilities(userRankIndex) {
    const probabilities = new Array(this.shadowRanks.length).fill(0);

    // Higher user rank = better shadow distribution
    // E rank (0): 70% E, 20% D, 10% C
    // S rank (5): 5% C, 15% B, 30% A, 40% S, 10% SS
    // Monarch (10+): 10% A, 20% S, 30% SS, 25% SSS, 15% SSS+

    if (userRankIndex <= 0) {
      // E rank
      probabilities[0] = 0.7; // E
      probabilities[1] = 0.2; // D
      probabilities[2] = 0.1; // C
    } else if (userRankIndex <= 2) {
      // D-C rank
      probabilities[0] = 0.3; // E
      probabilities[1] = 0.4; // D
      probabilities[2] = 0.25; // C
      probabilities[3] = 0.05; // B
    } else if (userRankIndex <= 4) {
      // B-A rank
      probabilities[2] = 0.1; // C
      probabilities[3] = 0.3; // B
      probabilities[4] = 0.4; // A
      probabilities[5] = 0.2; // S
    } else if (userRankIndex <= 6) {
      // S-SS rank
      probabilities[3] = 0.05; // B
      probabilities[4] = 0.15; // A
      probabilities[5] = 0.4; // S
      probabilities[6] = 0.3; // SS
      probabilities[7] = 0.1; // SSS
    } else {
      // SSS+ and above
      probabilities[4] = 0.1; // A
      probabilities[5] = 0.2; // S
      probabilities[6] = 0.3; // SS
      probabilities[7] = 0.25; // SSS
      probabilities[8] = 0.15; // SSS+
    }

    return probabilities;
  }

  /**
   * Get rank multiplier for shadow strength scaling
   */
  getRankMultiplier(shadowRank) {
    const rankIndex = this.shadowRanks.indexOf(shadowRank);
    // E = 0.5x, D = 0.6x, C = 0.7x, B = 0.8x, A = 0.9x, S = 1.0x, etc.
    return 0.5 + (rankIndex * 0.05);
  }

  /**
   * Generate base stats for a new shadow based on user stats, role weights and rank multiplier
   */
  generateShadowBaseStats(userStats, roleKey, rankMultiplier) {
    const weights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;
    const stats = ['strength', 'agility', 'intelligence', 'vitality', 'luck'];

    // Sum of user stats to give even 0 builds some baseline
    const totalUserStats =
      (userStats.strength || 0) +
      (userStats.agility || 0) +
      (userStats.intelligence || 0) +
      (userStats.vitality || 0) +
      (userStats.luck || 0);

    const baseStats = {};

    stats.forEach((stat) => {
      const userStat = userStats[stat] || 0;
      const w = weights[stat] || 0.5;
      // Base formula: mix of that stat and overall power, scaled by role weight and rank
      const raw =
        (userStat * 0.7 + totalUserStats * 0.1 + 5) * w * rankMultiplier +
        Math.random() * 3; // small randomness
      baseStats[stat] = Math.max(1, Math.round(raw));
    });

    return baseStats;
  }

  /**
   * Calculate shadow strength based on shadow stats and optional multiplier
   */
  calculateShadowStrength(stats, multiplier = 1) {
    const totalStats =
      (stats.strength || 0) +
      (stats.agility || 0) +
      (stats.intelligence || 0) +
      (stats.vitality || 0) +
      (stats.luck || 0);

    // Base strength = total stats * multiplier
    return Math.floor(totalStats * multiplier);
  }

  /**
   * Show extraction animation
   */
  showExtractionAnimation(shadow) {
    try {
      // Prefer external ShadowAriseAnimation plugin, if present
      const saPlugin = BdApi.Plugins.get('ShadowAriseAnimation');
      const instance = saPlugin && (saPlugin.instance || saPlugin);
      if (instance && typeof instance.triggerArise === 'function') {
        instance.triggerArise(shadow);
        return;
      }
    } catch (error) {
      console.warn('ShadowArmy: Unable to use ShadowAriseAnimation plugin', error);
    }

    // Fallback: simple inline ARISE animation (minimal, in case plugin is missing)
    const animation = document.createElement('div');
    animation.className = 'shadow-army-extraction-animation';
    animation.innerHTML = `
      <div class="shadow-extraction-content">
        <div class="shadow-extraction-title">ARISE</div>
        <div class="shadow-extraction-info">
          <div class="shadow-rank">${shadow.rank || ''}</div>
          <div class="shadow-role">${shadow.roleName || shadow.role || ''}</div>
        </div>
      </div>
    `;

    document.body.appendChild(animation);

    setTimeout(() => {
      animation.classList.add('fade-out');
      setTimeout(() => animation.remove(), 500);
    }, 2000);
  }

  /**
   * Get total shadow count
   */
  getTotalShadowCount() {
    return this.settings.shadows.length;
  }

  /**
   * Get shadows by role
   */
  getShadowsByRole(role) {
    return this.settings.shadows.filter(s => s.role === role);
  }

  /**
   * Get shadows by rank
   */
  getShadowsByRank(rank) {
    return this.settings.shadows.filter(s => s.rank === rank);
  }

  /**
   * Get favorite/general shadows (up to favoriteLimit)
   */
  getFavoriteShadows() {
    if (!Array.isArray(this.settings.favoriteShadowIds)) {
      return [];
    }
    const idSet = new Set(this.settings.favoriteShadowIds);
    return this.settings.shadows.filter((shadow) => idSet.has(shadow.id));
  }

  /**
   * Toggle a shadow as favorite/general.
   * - Adds if not present (up to favoriteLimit)
   * - Removes if already favorite
   */
  toggleFavorite(shadowId) {
    if (!shadowId) return;
    if (!Array.isArray(this.settings.favoriteShadowIds)) {
      this.settings.favoriteShadowIds = [];
    }

    const idx = this.settings.favoriteShadowIds.indexOf(shadowId);
    if (idx !== -1) {
      // Remove from favorites
      this.settings.favoriteShadowIds.splice(idx, 1);
    } else {
      // Enforce favorite limit (7 generals by default)
      if (this.settings.favoriteShadowIds.length >= (this.settings.favoriteLimit || 7)) {
        // Remove the oldest favorite (FIFO) to make room
        this.settings.favoriteShadowIds.shift();
      }
      this.settings.favoriteShadowIds.push(shadowId);
    }

    this.saveSettings();
  }

  /**
   * Calculate total buffs from all shadows.
   * Favorites (generals) give full buffs, non-favorites give reduced aggregate buffs.
   */
  calculateTotalBuffs() {
    const buffs = {
      strength: 0,
      agility: 0,
      intelligence: 0,
      vitality: 0,
      luck: 0,
    };

    const favoriteIds = new Set(this.settings.favoriteShadowIds || []);

    this.settings.shadows.forEach((shadow) => {
      const role = this.shadowRoles[shadow.role];
      if (!role || !role.buffs) return;

      // Favorites (generals) apply full buffs, non-favorites apply a small fraction
      const isFavorite = favoriteIds.has(shadow.id);
      const scale = isFavorite ? 1 : 0.1; // 10% effect from non-favorites

      Object.keys(role.buffs).forEach((stat) => {
        const amount = role.buffs[stat] * scale;
        buffs[stat] = (buffs[stat] || 0) + amount;
      });
    });

    return buffs;
  }

  /**
   * Grant XP to shadows (mainly favorites) so they can grow over time.
   * Called from message events / dungeons.
   */
  grantShadowXP(baseAmount, reason = 'message') {
    if (!this.settings.shadows.length || baseAmount <= 0) return;

    const favorites = this.getFavoriteShadows();
    if (!favorites.length) return;

    const perShadow = baseAmount;

    favorites.forEach((shadow) => {
      shadow.xp = (shadow.xp || 0) + perShadow;
      let level = shadow.level || 1;

      // Level up loop in case of big XP grants
      while (shadow.xp >= this.getShadowXpForNextLevel(level)) {
        shadow.xp -= this.getShadowXpForNextLevel(level);
        level += 1;
        shadow.level = level;
        this.applyShadowLevelUpStats(shadow);
        // Recompute strength after level up
        const effectiveStats = this.getShadowEffectiveStats(shadow);
        shadow.strength = this.calculateShadowStrength(effectiveStats, 1);
      }
    });

    this.saveSettings();
  }

  getShadowXpForNextLevel(level) {
    // Simple curve: grows roughly quadratically
    return 25 + level * level * 5;
  }

  getShadowEffectiveStats(shadow) {
    const base = shadow.baseStats || {};
    const growth = shadow.growthStats || {};
    return {
      strength: (base.strength || 0) + (growth.strength || 0),
      agility: (base.agility || 0) + (growth.agility || 0),
      intelligence: (base.intelligence || 0) + (growth.intelligence || 0),
      vitality: (base.vitality || 0) + (growth.vitality || 0),
      luck: (base.luck || 0) + (growth.luck || 0),
    };
  }

  /**
   * Apply stat increases on shadow level up based on its role weights.
   */
  applyShadowLevelUpStats(shadow) {
    const roleKey = shadow.role;
    const weights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;
    if (!shadow.growthStats) {
      shadow.growthStats = { strength: 0, agility: 0, intelligence: 0, vitality: 0, luck: 0 };
    }

    const stats = ['strength', 'agility', 'intelligence', 'vitality', 'luck'];

    stats.forEach((stat) => {
      const w = weights[stat] || 0.5;
      // Primary stats (w >= 1.0) grow faster, secondary slightly, others small
      let delta;
      if (w >= 1.1) delta = 3;
      else if (w >= 0.8) delta = 2;
      else if (w > 0) delta = 1;
      else delta = 0;

      shadow.growthStats[stat] = (shadow.growthStats[stat] || 0) + delta;
    });
  }

  updateUI() {
    // Update shadow count display if it exists
    // This will be called by SoloLevelingStats or we can create our own UI
  }

  injectCSS() {
    const styleId = 'shadow-army-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .shadow-army-extraction-animation {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10000;
        pointer-events: none;
        animation: shadowExtract 2s ease-out;
      }

      .shadow-extraction-content {
        background: rgba(0, 0, 0, 0.9);
        border: 2px solid #8b5cf6;
        border-radius: 12px;
        padding: 20px 30px;
        text-align: center;
        box-shadow: 0 0 20px rgba(139, 92, 246, 0.6);
      }

      .shadow-extraction-title {
        font-size: 32px;
        font-weight: 700;
        color: #a78bfa;
        text-shadow: 0 0 10px rgba(139, 92, 246, 0.8);
        margin-bottom: 10px;
        animation: glow 1s ease-in-out infinite alternate;
      }

      .shadow-extraction-info {
        color: #d4a5ff;
        font-size: 16px;
      }

      .shadow-rank {
        font-weight: 700;
        margin-bottom: 5px;
      }

      .shadow-role {
        font-size: 14px;
        opacity: 0.8;
      }

      @keyframes shadowExtract {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.5);
        }
        20% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      @keyframes glow {
        from {
          text-shadow: 0 0 10px rgba(139, 92, 246, 0.8);
        }
        to {
          text-shadow: 0 0 20px rgba(139, 92, 246, 1), 0 0 30px rgba(139, 92, 246, 0.6);
        }
      }

      .shadow-army-extraction-animation.fade-out {
        animation: fadeOut 0.5s ease-out forwards;
      }

      @keyframes fadeOut {
        to {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8);
        }
      }

      .shadow-army-settings {
        padding: 10px;
        color: #d4a5ff;
      }

      .shadow-army-settings h2,
      .shadow-army-settings h3 {
        margin: 4px 0;
      }

      .shadow-army-stats > div,
      .shadow-army-config > div {
        margin: 2px 0;
      }

      .shadow-army-list {
        margin-top: 8px;
        max-height: 300px;
        overflow-y: auto;
        border-top: 1px solid rgba(139, 92, 246, 0.4);
        padding-top: 6px;
      }

      .shadow-list-item {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 4px 0;
        border-bottom: 1px solid rgba(139, 92, 246, 0.15);
      }

      .shadow-fav-toggle {
        border: none;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
        font-size: 16px;
        padding: 0 4px;
        transition: color 0.15s ease, transform 0.15s ease;
      }

      .shadow-fav-toggle:hover {
        color: #facc15;
        transform: scale(1.1);
      }

      .shadow-fav-active {
        color: #facc15;
      }

      .shadow-list-main {
        flex: 1;
      }

      .shadow-list-header {
        display: flex;
        gap: 8px;
        font-size: 12px;
      }

      .shadow-list-rank {
        font-weight: 700;
        color: #f97316;
      }

      .shadow-list-role {
        color: #a5b4fc;
      }

      .shadow-list-strength {
        color: #34d399;
      }

      .shadow-list-meta {
        font-size: 11px;
        opacity: 0.8;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .shadow-list-empty {
        font-size: 12px;
        opacity: 0.8;
      }
    `;

    document.head.appendChild(style);
  }

  removeCSS() {
    const style = document.getElementById('shadow-army-styles');
    if (style) style.remove();
  }

  getSettingsPanel() {
    const total = this.getTotalShadowCount();
    const favorites = this.getFavoriteShadows();
    const favoriteIds = new Set(this.settings.favoriteShadowIds || []);

    // Show up to first 50 shadows in a simple list for now
    const maxList = 50;
    const listItems = this.settings.shadows
      .slice(0, maxList)
      .map((shadow, index) => {
        const isFavorite = favoriteIds.has(shadow.id);
        const starClass = isFavorite ? 'shadow-fav-toggle shadow-fav-active' : 'shadow-fav-toggle';
        const extractedDate = new Date(shadow.extractedAt).toLocaleString();
        return `
          <div class="shadow-list-item">
            <button class="${starClass}"
              onclick="try { const p = BdApi.Plugins.get('ShadowArmy'); (p.instance || p).toggleFavorite('${shadow.id}'); } catch (e) { console.error(e); }">
              ★
            </button>
            <div class="shadow-list-main">
              <div class="shadow-list-header">
                <span class="shadow-list-rank">${shadow.rank}-Rank</span>
                <span class="shadow-list-role">${shadow.roleName || shadow.role}</span>
                <span class="shadow-list-strength">Power: ${shadow.strength}</span>
              </div>
              <div class="shadow-list-meta">
                <span>Shadow Lv. ${shadow.level || 1}</span>
                <span>Extracted: ${extractedDate}</span>
                <span>ID: ${shadow.id}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;

    return `
      <div class="shadow-army-settings">
        <h2>Shadow Army</h2>
        <div class="shadow-army-stats">
          <div>Total Shadows: ${total}</div>
          <div>Total Extracted: ${this.settings.totalShadowsExtracted}</div>
          <div>Favorite Generals: ${(this.settings.favoriteShadowIds || []).length} / ${
            this.settings.favoriteLimit || 7
          }</div>
        </div>
        <div class="shadow-army-config">
          <h3>Extraction Config (read-only for now)</h3>
          <div>Min Base Chance: ${(cfg.minBaseChance * 100).toFixed(2)}%</div>
          <div>Chance per INT: ${(cfg.chancePerInt * 100).toFixed(2)}% / INT</div>
          <div>Max Extractions / Minute: ${cfg.maxExtractionsPerMinute}</div>
          <div>Special ARISE Max Chance: ${(cfg.specialMaxChance * 100).toFixed(1)}%</div>
          <div>Special ARISE Max / Day: ${cfg.specialMaxPerDay}</div>
        </div>
        <div class="shadow-army-list">
          <h3>Shadows (first ${maxList})</h3>
          ${
            total === 0
              ? '<div class="shadow-list-empty">No shadows extracted yet. Send messages to begin extraction.</div>'
              : listItems
          }
        </div>
      </div>
    `;
  }
};
