module.exports = {
  checkAchievements() {
    const achievements = this.getAchievementDefinitions();
    let newAchievements = [];
  
    // Build a Set for O(1) lookups (was O(n) .includes() per achievement — 3800 comparisons/msg)
    if (!this._unlockedAchievementSet || this._unlockedAchievementSetSize !== this.settings.achievements.unlocked.length) {
      this._unlockedAchievementSet = new Set(this.settings.achievements.unlocked);
      this._unlockedAchievementSetSize = this.settings.achievements.unlocked.length;
    }
  
    achievements.forEach((achievement) => {
      // Skip if already unlocked — O(1) Set.has vs O(n) Array.includes
      if (this._unlockedAchievementSet.has(achievement.id)) {
        return;
      }
  
      // Check if achievement is unlocked
      if (this.checkAchievementCondition(achievement)) {
        this.unlockAchievement(achievement);
        this._unlockedAchievementSet.add(achievement.id);
        this._unlockedAchievementSetSize = this.settings.achievements.unlocked.length;
        newAchievements.push(achievement);
      }
    });
  
    return newAchievements;
  },

  checkAchievementCondition(achievement) {
    const condition = achievement.condition;
  
    switch (condition.type) {
      case 'messages':
        return this.settings.activity.messagesSent >= condition.value;
      case 'characters':
        return this.settings.activity.charactersTyped >= condition.value;
      case 'level':
        return this.settings.level >= condition.value;
      case 'time':
        return this.settings.activity.timeActive >= condition.value;
      case 'channels':
        const channelsVisited = this.settings.activity?.channelsVisited;
        if (channelsVisited instanceof Set) {
          return channelsVisited.size >= condition.value;
        } else if (Array.isArray(channelsVisited)) {
          return channelsVisited.length >= condition.value;
        }
        return false;
      case 'achievements':
        return (this.settings.achievements?.unlocked?.length || 0) >= condition.value;
      case 'crits':
        return (this.settings.activity?.critsLanded || 0) >= condition.value;
      case 'stat':
        return this.settings.stats?.[condition.stat] >= condition.value;
      case 'compound':
        return (condition.conditions || []).every((c) =>
          this.checkAchievementCondition({ condition: c })
        );
      default:
        return false;
    }
  },

  unlockAchievement(achievement) {
    // Double-check: prevent duplicate unlocks
    if (this.settings.achievements.unlocked.includes(achievement.id)) {
      this.debugLog('ACHIEVEMENT', 'Achievement already unlocked, skipping', {
        achievementId: achievement.id,
        achievementName: achievement.name,
      });
      return; // Already unlocked, don't show notification again
    }
  
    // Add to unlocked list
    this.settings.achievements.unlocked.push(achievement.id);
  
    // Add title if provided
    if (achievement.title && !this.settings.achievements.titles.includes(achievement.title)) {
      this.settings.achievements.titles.push(achievement.title);
    }
  
    // Set as active title if no title is active
    if (!this.settings.achievements.activeTitle && achievement.title) {
      this.settings.achievements.activeTitle = achievement.title;
      // Invalidate title cache since active title changed
      this.invalidatePerformanceCache(['title']);
    }
  
    // Show notification
    const message =
      `[SYSTEM] Achievement unlocked: ${achievement.name}\n` +
      `${achievement.description}\n` +
      (achievement.title ? ` Title acquired: ${achievement.title}` : '');
  
    this.showNotification(message, 'success', 5000);
  
    this.debugLog('ACHIEVEMENT', 'Achievement unlocked', {
      achievementId: achievement.id,
      achievementName: achievement.name,
      title: achievement.title,
      totalUnlocked: this.settings.achievements.unlocked.length,
    });
  
    // Save immediately on achievement unlock (important event)
    this.saveSettings(true);
  },

  cleanupUnwantedTitles() {
    const unwantedTitles = this.UNWANTED_TITLES;
  
    let cleaned = false;
  
    // Remove from unlocked titles
    if (this.settings.achievements?.titles) {
      const beforeCount = this.settings.achievements.titles.length;
      this.settings.achievements.titles = this.settings.achievements.titles.filter(
        (t) => !unwantedTitles.includes(t)
      );
      if (this.settings.achievements.titles.length !== beforeCount) {
        cleaned = true;
      }
    }
  
    // Unequip if active
    if (
      this.settings.achievements?.activeTitle &&
      unwantedTitles.includes(this.settings.achievements.activeTitle)
    ) {
      this.settings.achievements.activeTitle = null;
      cleaned = true;
    }
  
    // Remove from unlocked achievements if they exist
    if (this.settings.achievements?.unlocked) {
      const achievements = this.getAchievementDefinitions();
      const unwantedIds = achievements
        .filter((a) => unwantedTitles.includes(a.title))
        .map((a) => a.id);
      if (unwantedIds.length > 0) {
        const beforeCount = this.settings.achievements.unlocked.length;
        this.settings.achievements.unlocked = this.settings.achievements.unlocked.filter(
          (id) => !unwantedIds.includes(id)
        );
        if (this.settings.achievements.unlocked.length !== beforeCount) {
          cleaned = true;
        }
      }
    }
  
    if (cleaned) {
      this.saveSettings(true);
      this.debugLog('CLEANUP', 'Removed unwanted titles from saved data', {
        removedTitles: unwantedTitles,
      });
    }
  },

  revalidateUnlockedAchievements() {
    const achievements = this.getAchievementDefinitions();
    const unlocked = this.settings.achievements?.unlocked || [];
    const titles = this.settings.achievements?.titles || [];
  
    if (unlocked.length === 0) return;
  
    const revokedIds = [];
    const revokedTitles = [];
  
    unlocked.forEach((id) => {
      const achievement = achievements.find((a) => a.id === id);
      if (!achievement) return; // unknown ID, leave it
  
      if (!this.checkAchievementCondition(achievement)) {
        revokedIds.push(id);
        if (achievement.title) {
          revokedTitles.push(achievement.title);
        }
      }
    });
  
    if (revokedIds.length === 0) return;
  
    // Remove revoked achievement IDs
    this.settings.achievements.unlocked = unlocked.filter(
      (id) => !revokedIds.includes(id)
    );
  
    // Remove revoked titles
    this.settings.achievements.titles = titles.filter(
      (t) => !revokedTitles.includes(t)
    );
  
    // Unequip active title if it was revoked
    if (
      this.settings.achievements?.activeTitle &&
      revokedTitles.includes(this.settings.achievements.activeTitle)
    ) {
      this.settings.achievements.activeTitle = null;
    }
  
    this.saveSettings(true);
    this.debugLog('REVALIDATE', 'Revoked achievements that no longer meet requirements', {
      revokedCount: revokedIds.length,
      revokedIds,
      revokedTitles,
    });
  },

  setActiveTitle(title) {
    // Filter out unwanted titles
    const unwantedTitles = this.UNWANTED_TITLES;
  
    // Allow null to unequip title
    if (title === null || title === '') {
      this.settings.achievements.activeTitle = null;
      this.saveSettings(true);
      if (this.updateChatUI) {
        this.updateChatUI();
      }
      return true;
    }
  
    // Block unwanted titles
    if (unwantedTitles.includes(title)) {
      return false;
    }
  
    // Also remove unwanted titles from unlocked titles list
    this.settings.achievements.titles = this.settings.achievements.titles.filter(
      (t) => !unwantedTitles.includes(t)
    );
  
    if (this.settings.achievements.titles.includes(title)) {
      this.settings.achievements.activeTitle = title;
      // Save immediately on title change
      this.saveSettings(true);
      if (this.updateChatUI) {
        this.updateChatUI();
      }
      return true;
    }
    return false;
  },

  getActiveTitleBonus() {
    // Check cache first
    const now = Date.now();
    const activeTitle = this.settings.achievements?.activeTitle || null;
    const cacheKey = activeTitle;
  
    if (
      this._cache.activeTitleBonus &&
      this._cache.activeTitleBonusKey === cacheKey &&
      this._cache.activeTitleBonusTime &&
      now - this._cache.activeTitleBonusTime < this._cache.activeTitleBonusTTL
    ) {
      return this._cache.activeTitleBonus;
    }
  
    // Filter out unwanted titles
    const unwantedTitles = this.UNWANTED_TITLES;
    if (
      !this.settings.achievements.activeTitle ||
      unwantedTitles.includes(this.settings.achievements.activeTitle)
    ) {
      // If active title is unwanted, unequip it
      if (
        this.settings.achievements.activeTitle &&
        unwantedTitles.includes(this.settings.achievements.activeTitle)
      ) {
        this.settings.achievements.activeTitle = null;
        this.saveSettings(true);
      }
      const result = {
        xp: 0,
        critChance: 0,
        // Old format (raw numbers) - for backward compatibility
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        perception: 0,
        // New format (percentages) - primary format
        strengthPercent: 0,
        agilityPercent: 0,
        intelligencePercent: 0,
        vitalityPercent: 0,
        perceptionPercent: 0,
      };
      // Cache the result
      this._cache.activeTitleBonus = result;
      this._cache.activeTitleBonusKey = null;
      this._cache.activeTitleBonusTime = now;
      return result;
    }
  
    const achievements = this.getAchievementDefinitions();
    const achievement = achievements.find(
      (a) => a.title === this.settings.achievements.activeTitle
    );
  
    const bonus = achievement?.titleBonus || { xp: 0 };
    // Return the raw titleBonus object directly (same as TitleManager)
    // This ensures both plugins see the exact same data structure
    // The display code handles both old format (raw) and new format (percentages)
    const result = {
      ...bonus,
      // Ensure defaults for common properties to avoid undefined issues
      xp: bonus.xp || 0,
      critChance: bonus.critChance || 0,
      // Old format (raw numbers) - for backward compatibility
      strength: bonus.strength || 0,
      agility: bonus.agility || 0,
      intelligence: bonus.intelligence || 0,
      vitality: bonus.vitality || 0,
      perception: bonus.perception || 0,
      // New format (percentages) - primary format
      strengthPercent: bonus.strengthPercent || 0,
      agilityPercent: bonus.agilityPercent || 0,
      intelligencePercent: bonus.intelligencePercent || 0,
      vitalityPercent: bonus.vitalityPercent || 0,
      perceptionPercent: bonus.perceptionPercent || 0,
    };
  
    this._cache.activeTitleBonus = result;
    this._cache.activeTitleBonusKey = cacheKey;
    this._cache.activeTitleBonusTime = now;
  
    return result;
  },

  _commitShadowPower(totalPower, shadowArmy) {
    this.cachedShadowPower = totalPower.toLocaleString();
    this.settings.cachedShadowPower = this.cachedShadowPower;
    this.saveSettings();
    if (shadowArmy?.settings) {
      shadowArmy.settings.cachedTotalPower = totalPower;
      shadowArmy.settings.cachedTotalPowerTimestamp = Date.now();
      shadowArmy.saveSettings();
    }
    this.updateShadowPowerDisplay();
  },

  _sumShadowPower(shadowArmy, shadows) {
    return shadows.reduce((sum, shadow) => {
      try {
        if (shadowArmy.calculateShadowPowerCached) {
          return sum + (shadowArmy.calculateShadowPowerCached(shadow) || 0);
        }
        const d = shadowArmy.getShadowData ? shadowArmy.getShadowData(shadow) : shadow;
        if (shadowArmy.getShadowEffectiveStats && shadowArmy.calculateShadowPower) {
          const eff = shadowArmy.getShadowEffectiveStats(d);
          if (eff) {
            const p = shadowArmy.calculateShadowPower(eff, 1);
            return sum + (p > 0 ? p : (d?.strength || 0));
          }
        }
        return sum + (d?.strength || 0);
      } catch (_) {
        return sum;
      }
    }, 0);
  },

  async updateShadowPower() {
    try {
      if (!this._isRunning) return;
  
      const shadowArmy = this._SLUtils?.getPluginInstance?.('ShadowArmy');
      if (!shadowArmy) {
        this.cachedShadowPower = '0';
        this.updateShadowPowerDisplay();
        return;
      }
  
      // --- FAST PATH: ShadowArmy's own persistent cache ---
      if (shadowArmy.settings?.cachedTotalPower !== undefined) {
        const cachedPower = shadowArmy.settings.cachedTotalPower || 0;
        const cacheAge = shadowArmy.settings.cachedTotalPowerTimestamp
          ? Date.now() - shadowArmy.settings.cachedTotalPowerTimestamp
          : Infinity;
        const isRecent = cacheAge < 300000; // 5 min
        const isRecentZero = cachedPower === 0 && cacheAge < 10000;
  
        if (isRecent && (cachedPower > 0 || isRecentZero)) {
          this.debugLog('UPDATE_SHADOW_POWER', 'Using ShadowArmy cached power', { cachedPower });
          this._commitShadowPower(cachedPower, shadowArmy);
          return;
        }
      }
  
      // --- PRIMARY: getAggregatedArmyStats + getTotalShadowPower ---
      if (typeof shadowArmy.getAggregatedArmyStats === 'function') {
        try {
          let totalPower = 0;
  
          // Direct calculation (preferred)
          if (typeof shadowArmy.getTotalShadowPower === 'function') {
            try {
              totalPower = await shadowArmy.getTotalShadowPower(false);
            } catch (_) {
              const stats = await shadowArmy.getAggregatedArmyStats();
              totalPower = stats?.totalPower ?? 0;
            }
          } else {
            const stats = await shadowArmy.getAggregatedArmyStats(true);
            totalPower = stats?.totalPower ?? 0;
          }
  
          const armyStats = await shadowArmy.getAggregatedArmyStats();
  
          // Diagnostic: IDB has data but aggregation returned 0 shadows -> manual calc
          if (totalPower === 0 && armyStats?.totalShadows === 0 && shadowArmy.storageManager) {
            try {
              const count = await shadowArmy.storageManager.getTotalCount();
              if (count > 0) {
                const direct = await shadowArmy.storageManager.getShadows({}, 0, 10000);
                if (direct?.length > 0) {
                  const manualPower = this._sumShadowPower(shadowArmy, direct);
                  if (manualPower > 0) {
                    this._commitShadowPower(manualPower, shadowArmy);
                    return;
                  }
                }
              }
            } catch (e) {
              this.debugError('UPDATE_SHADOW_POWER', 'Direct shadow retrieval failed', e);
            }
          }
  
          // Fallback: armyStats power if direct calc was 0
          if (!totalPower) totalPower = armyStats?.totalPower ?? 0;
  
          // Retry once if power=0 but shadows exist
          if (totalPower === 0 && armyStats?.totalShadows > 0) {
            const retry = await shadowArmy.getAggregatedArmyStats(true);
            if ((retry?.totalPower ?? 0) > 0) {
              this._commitShadowPower(retry.totalPower, shadowArmy);
              return;
            }
          }
  
          this.debugLog('UPDATE_SHADOW_POWER', 'Power calculation completed', {
            totalPower,
            totalShadows: armyStats?.totalShadows || 0,
          });
  
          // Commit result (guard against zeroing out when shadows exist)
          if (totalPower > 0 || (armyStats && armyStats.totalShadows === 0)) {
            this._commitShadowPower(totalPower, shadowArmy);
          } else {
            this.debugError('UPDATE_SHADOW_POWER', 'Power is 0 despite having shadows');
            this.updateShadowPowerDisplay();
          }
          return;
        } catch (error) {
          this.debugError('UPDATE_SHADOW_POWER', 'Primary method failed', error);
        }
      }
  
      // --- FALLBACK: manual storage manager enumeration ---
      if (shadowArmy.storageManager?.getShadows) {
        try {
          if (!shadowArmy.storageManager.db) await shadowArmy.storageManager.init();
          const shadows = await shadowArmy.storageManager.getShadows({}, 0, 1000000);
          if (shadows?.length > 0) {
            const totalPower = this._sumShadowPower(shadowArmy, shadows);
            this._commitShadowPower(totalPower, shadowArmy);
            return;
          }
        } catch (e) {
          this.debugError('UPDATE_SHADOW_POWER', 'Fallback storage enumeration failed', e);
        }
      }
  
      // No shadows
      this._commitShadowPower(0, shadowArmy);
    } catch (error) {
      this.debugError('UPDATE_SHADOW_POWER', error);
      this.cachedShadowPower = '0';
      this.updateShadowPowerDisplay();
    }
  },

  updateShadowPowerDisplay() {
    // v3.0.0: React LevelInfo component reads cachedShadowPower directly.
    // Just trigger a re-render via the forceUpdate bridge + emit event for LevelProgressBar.
    if (!this._isRunning) return;
  
    this.debugLog('UPDATE_SHADOW_POWER_DISPLAY', 'Triggering React re-render for shadow power', {
      cachedShadowPower: this.cachedShadowPower,
    });
  
    // Trigger React re-render — LevelInfo/Popup both read this.cachedShadowPower
    this._triggerUIForceUpdates();
  
    // Emit event for real-time updates in LevelProgressBar
    this.emit('shadowPowerChanged', {
      shadowPower: this.cachedShadowPower,
    });
  }
};
