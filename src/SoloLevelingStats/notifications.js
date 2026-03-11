module.exports = {
  showNotification(message, type = 'info', timeout = 3000) {
    try {
      // Prefer SoloLevelingToasts for animated notifications if available.
      // Fallback to BdApi.UI.showToast otherwise.
      const now = Date.now();
      const cacheTtlMs = 3000;
      if (!this._toastPluginCacheTime || now - this._toastPluginCacheTime > cacheTtlMs) {
        this._toastPluginCacheTime = now;
        this._toastPluginCache = this._SLUtils?.getPluginInstance?.('SoloLevelingToasts') || null;
      }
      const slToasts = this._toastPluginCache;
      if (slToasts?.showToast) {
        slToasts.showToast(message, type, timeout, { callerId: "soloLevelingStats" });
        return;
      }
      if (BdApi?.UI?.showToast) {
        BdApi.UI.showToast(message, {
          type: type === "level-up" ? "info" : type,
          timeout: timeout,
        });
      }
    } catch (error) {
      this.debugError('NOTIFICATION', error);
    }
  },

  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  showRankPromotionNotification(oldRank, newRank, rankInfo, statBonus = 0) {
    let message =
      `[SYSTEM] Rank Promotion!\n\n` +
      `Rank Up: ${oldRank} → ${newRank}\n` +
      `New Title: ${rankInfo.name}\n` +
      `Level: ${this.settings.level}\n` +
      `Achievements: ${this.settings.achievements.unlocked.length}\n`;
  
    if (statBonus > 0) {
      message += `BONUS: +${statBonus} to ALL stats!\n`;
    }
  
    message += `XP Multiplier: ${(this.getRankMultiplier() * 100).toFixed(0)}%`;
  
    this.showNotification(message, 'success', 6000);
  },

  showLevelUpNotification(newLevel, oldLevel, actualStatPointsGained = null) {
    // #region agent log
    // #endregion
  
    const levelsGained = newLevel - oldLevel;
  
    // Calculate actual stat points gained if not provided
    if (actualStatPointsGained === null) {
      const statPointsPerLevel = this.getStatPointsForLevel(newLevel);
      actualStatPointsGained = levelsGained * statPointsPerLevel;
    }
  
    const rankInfo = this.getRankRequirements()[this.settings.rank];
  
    // Get current HP/MaxHP (HP is fully restored on level up)
    const totalStats = this.getTotalEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const currentMaxHP = this.calculateHP(vitality, this.settings.rank);
  
    // Ensure HP is fully restored on level up
    this.settings.userMaxHP = currentMaxHP;
    this.settings.userHP = currentMaxHP;
    // Persist restored HP state in case Discord restarts before the next periodic save.
    this.saveSettings();
  
    // Build message with correct stats for multiple level ups
    let message = `[SYSTEM] Level up detected. HP fully restored.\n\n`;
  
    if (levelsGained > 1) {
      message += `LEVEL UP! ${levelsGained}x Level Up! You're now Level ${newLevel}!\n`;
      message += `(Level ${oldLevel} → Level ${newLevel})\n`;
    } else {
      message += `LEVEL UP! You're now Level ${newLevel}!\n`;
    }
  
    message += `Rank: ${this.settings.rank} - ${rankInfo.name}\n`;
    message += `HP: ${currentMaxHP}/${currentMaxHP} (Fully Restored!)\n`;
    message += `+${actualStatPointsGained} stat point(s)! Use settings to allocate stats`;
  
    // Use animated "level-up" toast style when SoloLevelingToasts is installed.
    this.showNotification(message, 'level-up', 5000);
  
    // Dedicated Level Up overlay animation (not a toast).
    // Triggers every time the player's level increases (queues if multiple happen quickly).
    this.enqueueLevelUpAnimation(oldLevel, newLevel);
  
    // Play level up sound/effect (optional)
  }
};
