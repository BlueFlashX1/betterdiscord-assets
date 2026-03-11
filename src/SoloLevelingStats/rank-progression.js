module.exports = {
  getRankPromotionBonusTable() {
    return {
      D: 4,
      C: 6,
      B: 9,
      A: 13,
      S: 19,
      SS: 27,
      SSS: 38,
      'SSS+': 54,
      NH: 76,
      Monarch: 110,
      'Monarch+': 165,
      'Shadow Monarch': 280,
    };
  },

  getLegacyRankPromotionBonusTableForBackfill() {
    // Previous live values (pre-exponential rank tuning).
    return {
      D: 2,
      C: 3,
      B: 4,
      A: 5,
      S: 7,
      SS: 9,
      SSS: 11,
      'SSS+': 13,
      NH: 16,
      Monarch: 20,
      'Monarch+': 24,
      'Shadow Monarch': 30,
    };
  },

  calculateRankPromotionDampener(averageStat) {
    const safeAverage = Math.max(0, Number(averageStat) || 0);
    if (safeAverage >= 1200) return 0.5;
    if (safeAverage >= 800) return 0.62;
    if (safeAverage >= 500) return 0.75;
    if (safeAverage >= 300) return 0.88;
    return 1;
  },

  getPromotedRanksForRank(rank = this.settings?.rank) {
    const fallbackRanks =
      this.defaultSettings?.ranks || ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SSS+', 'NH', 'Monarch', 'Monarch+', 'Shadow Monarch'];
    const ranks =
      Array.isArray(this.settings?.ranks) && this.settings.ranks.length
        ? this.settings.ranks
        : fallbackRanks;
    const rankIndex = ranks.indexOf(rank);
    if (rankIndex <= 0) return [];
    return ranks.slice(1, rankIndex + 1);
  },

  async applyRankPromotionBonusBackfill() {
    try {
      if (this.settings?._rankBonusBackfillV2Applied) {
        return { applied: false, reason: 'already_applied' };
      }
  
      if (!this.settings?.stats || typeof this.settings.stats !== 'object') {
        return { applied: false, reason: 'missing_stats' };
      }
  
      const promotedRanks = this.getPromotedRanksForRank();
      if (!promotedRanks.length) {
        return { applied: false, reason: 'no_promotions' };
      }
  
      const currentTable = this.getRankPromotionBonusTable();
      const legacyTable = this.getLegacyRankPromotionBonusTableForBackfill();
      const deltaBase = promotedRanks.reduce((sum, rank) => {
        const currentValue = Number(currentTable[rank] || 0);
        const legacyValue = Number(legacyTable[rank] || 0);
        return sum + Math.max(0, currentValue - legacyValue);
      }, 0);
  
      if (deltaBase <= 0) {
        return { applied: false, reason: 'no_delta', promotedRanks, deltaBase };
      }
  
      const backupKey = `rankBonusBackfillV2_pre_${Date.now()}`;
      const snapshot = structuredClone(this.settings);
      try {
        BdApi.Data.save('SoloLevelingStats', backupKey, snapshot);
      } catch (error) {
        this.debugError('RANK_BACKFILL', error, { phase: 'backup_failed', backupKey });
        return { applied: false, reason: 'backup_failed', backupKey, error };
      }
  
      const statKeys = this.STAT_KEYS || ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
      const previousState = {
        stats: { ...this.settings.stats },
        userHP: this.settings.userHP,
        userMaxHP: this.settings.userMaxHP,
        userMana: this.settings.userMana,
        userMaxMana: this.settings.userMaxMana,
        markerApplied: this.settings._rankBonusBackfillV2Applied,
        markerAppliedAt: this.settings._rankBonusBackfillV2AppliedAt,
        markerBackupKey: this.settings._rankBonusBackfillV2BackupKey,
        markerMeta: this.settings._rankBonusBackfillV2Meta,
      };
  
      try {
        const statSum = statKeys.reduce((sum, key) => sum + (Number(this.settings.stats[key]) || 0), 0);
        const averageStat = statSum / statKeys.length;
        const dampener = this.calculateRankPromotionDampener(averageStat);
        const perStatDelta = Math.max(1, Math.round(deltaBase * dampener));
  
        statKeys.forEach((key) => {
          this.settings.stats[key] = (Number(this.settings.stats[key]) || 0) + perStatDelta;
        });
  
        this.settings._rankBonusBackfillV2Applied = true;
        this.settings._rankBonusBackfillV2AppliedAt = Date.now();
        this.settings._rankBonusBackfillV2BackupKey = backupKey;
        this.settings._rankBonusBackfillV2Meta = {
          promotedRanks,
          deltaBase,
          dampener,
          perStatDelta,
          rankAtApply: this.settings.rank,
        };
  
        this.recomputeHPManaFromStats();
        await this.saveSettings(true);
        this.updateChatUI();
  
        this.debugLog('RANK_BACKFILL', 'Rank promotion backfill applied', {
          rank: this.settings.rank,
          promotedRanks,
          deltaBase,
          dampener,
          perStatDelta,
          backupKey,
        });
  
        return {
          applied: true,
          rank: this.settings.rank,
          promotedRanks,
          deltaBase,
          dampener,
          perStatDelta,
          backupKey,
        };
      } catch (error) {
        this.settings.stats = { ...previousState.stats };
        this.settings.userHP = previousState.userHP;
        this.settings.userMaxHP = previousState.userMaxHP;
        this.settings.userMana = previousState.userMana;
        this.settings.userMaxMana = previousState.userMaxMana;
        this.settings._rankBonusBackfillV2Applied = previousState.markerApplied;
        this.settings._rankBonusBackfillV2AppliedAt = previousState.markerAppliedAt;
        this.settings._rankBonusBackfillV2BackupKey = previousState.markerBackupKey;
        this.settings._rankBonusBackfillV2Meta = previousState.markerMeta;
  
        try {
          await this.saveSettings(true);
        } catch (rollbackError) {
          this.debugError('RANK_BACKFILL', rollbackError, { phase: 'rollback_save_failed' });
        }
  
        this.debugError('RANK_BACKFILL', error, { phase: 'apply_failed' });
        return { applied: false, reason: 'apply_failed', backupKey, error };
      }
    } catch (error) {
      this.debugError('RANK_BACKFILL', error, { phase: 'unexpected' });
      return { applied: false, reason: 'unexpected_error', error };
    }
  },

  checkLevelUp(oldLevel) {
    try {
      // #region agent log
      // #endregion
  
      this.debugLog('CHECK_LEVEL_UP', 'Checking for level up', { oldLevel });
  
      const levelInfo = this.getCurrentLevel();
      const newLevel = levelInfo.level;
  
      if (newLevel > oldLevel) {
        // LEVEL UP!
        const levelsGained = newLevel - oldLevel;
  
        // #region agent log
        // #endregion
  
        this.settings.level = newLevel;
        this.settings.xp = levelInfo.xp;
        const _statPointsBefore = this.settings.unallocatedStatPoints;
        // Balanced stat point curve (front-loaded early, tapered late).
        // Prevents runaway high-level stat inflation while preserving progression.
        const statPointsPerLevel = this.getStatPointsForLevel(newLevel);
        this.settings.unallocatedStatPoints += levelsGained * statPointsPerLevel;
        const _statPointsAfter = this.settings.unallocatedStatPoints;
  
        // #region agent log
        // #endregion
  
        this.debugLog('CHECK_LEVEL_UP', 'Level up detected!', {
          oldLevel,
          newLevel,
          levelsGained,
          unallocatedPoints: this.settings.unallocatedStatPoints,
        });
  
        // Process natural stat growth for each level gained (handles skipped levels)
        // This ensures stats grow naturally even when multiple levels are gained at once
        try {
          const _statsBefore = { ...this.settings.stats };
          Array.from({ length: levelsGained }).forEach(() => {
            this.processNaturalStatGrowth();
          });
          const _statsAfter = { ...this.settings.stats };
  
          // #region agent log
          // #endregion
  
          this.debugLog('CHECK_LEVEL_UP', 'Natural stat growth processed for skipped levels', {
            levelsGained,
          });
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'natural_stat_growth_on_levelup' });
        }
  
        // Emit level changed event for real-time progress bar updates
        this.emitLevelChanged(oldLevel, newLevel);
  
        // Save immediately on level up (critical event)
        try {
          this.saveSettings(true);
          this.debugLog('CHECK_LEVEL_UP', 'Settings saved after level up');
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'save_after_levelup' });
        }
  
        // Debounce level up notification to prevent spam
        // If there's already a pending notification, update it with the latest level
        if (this.pendingLevelUp) {
          // Update pending notification with latest level
          this.pendingLevelUp.oldLevel = Math.min(this.pendingLevelUp.oldLevel, oldLevel);
          this.pendingLevelUp.newLevel = Math.max(this.pendingLevelUp.newLevel, newLevel);
          this.pendingLevelUp.levelsGained =
            this.pendingLevelUp.newLevel - this.pendingLevelUp.oldLevel;
          // #region agent log
          // #endregion
        } else {
          // Create new pending notification
          this.pendingLevelUp = {
            oldLevel,
            newLevel,
            levelsGained,
          };
          // #region agent log
          // #endregion
        }
  
        // Debounce without starvation: once scheduled, don't keep resetting the timer.
        // Rapid XP updates can otherwise prevent the notification from ever firing.
        if (!this.levelUpDebounceTimeout) {
          this.levelUpDebounceTimeout = setTimeout(() => {
            if (this.pendingLevelUp) {
              const {
                oldLevel: finalOldLevel,
                newLevel: finalNewLevel,
                levelsGained: _finalLevelsGained,
              } = this.pendingLevelUp;
              // #region agent log
              // #endregion
  
              // Calculate actual stat points gained
              const statPointsPerLevel = this.getStatPointsForLevel(finalNewLevel);
              const actualStatPointsGained = (finalNewLevel - finalOldLevel) * statPointsPerLevel;
  
              this.showLevelUpNotification(finalNewLevel, finalOldLevel, actualStatPointsGained);
              this.pendingLevelUp = null;
              this.levelUpDebounceTimeout = null;
            } else {
              this.levelUpDebounceTimeout = null;
            }
          }, this.levelUpDebounceDelay);
        }
  
        // Check for level achievements
        try {
          this.checkAchievements();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'check_achievements' });
        }
  
        // Check for rank promotion (after level up)
        try {
          this.checkRankPromotion();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'check_rank_promotion' });
        }
  
        // Update chat UI after level up
        try {
          this.updateChatUI();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'update_ui' });
        }
      } else {
        // Update current XP
        this.settings.xp = levelInfo.xp;
        // Emit XP changed event (level didn't change but XP did)
        this.emitXPChanged();
        // Update chat UI
        try {
          this.updateChatUI();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'update_ui_no_levelup' });
        }
      }
    } catch (error) {
      this.debugError('CHECK_LEVEL_UP', error, { oldLevel });
    }
  },

  checkRankPromotion() {
    try {
      this.debugLog('CHECK_RANK_PROMOTION', 'Checking for rank promotion', {
        currentRank: this.settings.rank,
        level: this.settings.level,
        achievements: this.settings.achievements.unlocked.length,
      });
  
      const rankRequirements = this.getRankRequirements();
      const currentRank = this.settings.rank;
      const currentReq = rankRequirements[currentRank];
  
      if (!currentReq || !currentReq.next) {
        this.debugLog('CHECK_RANK_PROMOTION', 'Already at max rank or invalid rank');
        return; // Already at max rank or invalid rank
      }
  
      const nextRank = currentReq.next;
      const nextReq = rankRequirements[nextRank];
  
      // Check if requirements are met
      const levelMet = this.settings.level >= nextReq.level;
      const achievementsMet = this.settings.achievements.unlocked.length >= nextReq.achievements;
  
      this.debugLog('CHECK_RANK_PROMOTION', 'Requirements check', {
        nextRank,
        levelMet,
        levelRequired: nextReq.level,
        currentLevel: this.settings.level,
        achievementsMet,
        achievementsRequired: nextReq.achievements,
        currentAchievements: this.settings.achievements.unlocked.length,
      });
  
      if (levelMet && achievementsMet) {
        // RANK PROMOTION!
        const oldRank = this.settings.rank;
        this.settings.rank = nextRank;
  
        this.debugLog('CHECK_RANK_PROMOTION', 'Rank promotion!', {
          oldRank,
          newRank: nextRank,
          level: this.settings.level,
          achievements: this.settings.achievements.unlocked.length,
        });
  
        // Grant rank promotion stat bonuses on an exponential-ish curve.
        // Late tiers (Monarch+) are intentionally dramatic; damping prevents runaway inflation.
        const rankPromotionBonuses = this.getRankPromotionBonusTable();
  
        const baseBonus = rankPromotionBonuses[nextRank] || 0;
        const statSum =
          (this.settings.stats.strength || 0) +
          (this.settings.stats.agility || 0) +
          (this.settings.stats.intelligence || 0) +
          (this.settings.stats.vitality || 0) +
          (this.settings.stats.perception || 0);
        const averageStat = statSum / 5;
        const dampener = this.calculateRankPromotionDampener(averageStat);
        const bonus = Math.max(1, Math.round(baseBonus * dampener));
        if (bonus > 0) {
          // Apply bonus to all stats
          this.settings.stats.strength = (this.settings.stats.strength || 0) + bonus;
          this.settings.stats.agility = (this.settings.stats.agility || 0) + bonus;
          this.settings.stats.intelligence = (this.settings.stats.intelligence || 0) + bonus;
          this.settings.stats.vitality = (this.settings.stats.vitality || 0) + bonus;
          this.settings.stats.perception = (this.settings.stats.perception || 0) + bonus;
  
          // Recalculate HP/Mana after stat bonus (vitality/intelligence increased)
          const vitality = this.settings.stats.vitality || 0;
          const intelligence = this.settings.stats.intelligence || 0;
          this.settings.userMaxHP = this.calculateHP(vitality, nextRank);
          this.settings.userMaxMana = this.calculateMana(intelligence);
  
          // Fully restore HP/Mana on rank promotion
          this.settings.userHP = this.settings.userMaxHP;
          this.settings.userMana = this.settings.userMaxMana;
        }
  
        // Emit rank changed event for real-time progress bar updates
        this.emitRankChanged(oldRank, nextRank);
  
        // Add to rank history
        if (!this.settings.rankHistory) {
          this.settings.rankHistory = [];
        }
        this.settings.rankHistory.push({
          rank: nextRank,
          level: this.settings.level,
          achievements: this.settings.achievements.unlocked.length,
          timestamp: Date.now(),
        });
        // Cap rank history to last 100 entries to prevent unbounded growth
        if (this.settings.rankHistory.length > 100) {
          this.settings.rankHistory = this.settings.rankHistory.slice(-100);
        }
  
        // Save immediately on rank promotion (critical event)
        try {
          this.saveSettings(true);
          this.debugLog('CHECK_RANK_PROMOTION', 'Settings saved after rank promotion');
        } catch (error) {
          this.debugError('CHECK_RANK_PROMOTION', error, { phase: 'save_after_promotion' });
        }
  
        // Show rank promotion notification
        try {
          this.showRankPromotionNotification(oldRank, nextRank, nextReq, bonus);
        } catch (error) {
          this.debugError('CHECK_RANK_PROMOTION', error, { phase: 'show_notification' });
        }
  
        // Update chat UI
        try {
          this.updateChatUI();
        } catch (error) {
          this.debugError('CHECK_RANK_PROMOTION', error, { phase: 'update_ui' });
        }
      }
    } catch (error) {
      this.debugError('CHECK_RANK_PROMOTION', error, {
        currentRank: this.settings.rank,
        level: this.settings.level,
      });
    }
  }
};
