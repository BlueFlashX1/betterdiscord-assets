const C = require('./constants');

/**
 * achievements — unlock evaluation and the titles that come with them.
 * Object.assign'd onto the SoloLevelingStats prototype.
 *
 * Entry points: checkAchievements(), checkAchievementCondition(achievement),
 * unlockAchievement(achievement), revalidateUnlockedAchievements(),
 * cleanupUnwantedTitles().
 *
 * Definitions live in achievement-definitions.js (76 array entries but only 75
 * distinct ids); this file only
 * evaluates them. Conditions are declarative `{ type, value }` pairs, so
 * adding an achievement should never require editing this file — if it does,
 * add the condition TYPE here and keep the data over there.
 *
 * ACHIEVEMENTS GATE RANK. getRankRequirements (progression-read-model) needs
 * BOTH a level and an achievement count, up to 35 for Shadow Monarch. That
 * makes this file part of the progression path, not decoration: an achievement
 * that can never unlock permanently caps rank.
 *
 * That is a live constraint, not hypothetical — 26 achievements are gated on
 * levels above 560, and levelling FREEZES once Shadow Monarch is held. The
 * ceiling is only reachable because the level requirement (2000) sits above
 * all of them. Anything that lowers a level threshold has to be checked
 * against this file's gates.
 *
 * revalidateUnlockedAchievements exists because unlock state can drift from
 * reality across migrations and restores — it re-derives rather than trusting
 * the stored list. cleanupUnwantedTitles prunes titles whose achievement no
 * longer qualifies, so a corrupt restore cannot leave a permanent title
 * awarded for something never earned.
 *
 * Any store reads here must stay bounded (ShadowArmy is ~281k records); count
 * queries and capped reads only, never a full scan for a threshold check.
 */

module.exports = {
  // KNOWN DATA BUG — `shadow_sovereign` is defined TWICE in
  // achievement-definitions.js: ~line 428 as the Level-2000 + 35-achievement
  // capstone, and ~line 579 as a Level-1500 + 18k-messages award, with
  // different titleBonus payloads.
  //
  // Because this loop walks the WHOLE array and skips ids already unlocked,
  // the easier Lv-1500 entry fires first and claims the id. From that point the
  // Lv-2000 capstone is permanently skipped: it can never be earned, and the
  // player keeps the Lv-1500 variant's weaker bonus. The Shadow Monarch rank
  // itself still gates on level 2000 + 35 achievements and is unaffected — it
  // is only the matching capstone ACHIEVEMENT that is short-circuited.
  //
  // Not fixed here because it is a save-migration decision: renaming the
  // Lv-1500 entry's id leaves `shadow_sovereign` already in existing unlocked
  // arrays (still wrongly satisfying the capstone) and re-fires a toast for the
  // renamed one. A correct fix renames it AND rewrites stale unlock records
  // whose level is below 2000.
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
    const unwantedTitles = this.UNWANTED_TITLES_SET;

    let cleaned = false;

    // Remove from unlocked titles
    if (this.settings.achievements?.titles) {
      const beforeCount = this.settings.achievements.titles.length;
      this.settings.achievements.titles = this.settings.achievements.titles.filter(
        (t) => !unwantedTitles.has(t)
      );
      if (this.settings.achievements.titles.length !== beforeCount) {
        cleaned = true;
      }
    }

    if (
      this.settings.achievements?.activeTitle &&
      unwantedTitles.has(this.settings.achievements.activeTitle)
    ) {
      this.settings.achievements.activeTitle = null;
      cleaned = true;
    }
  
    // Remove from unlocked achievements if they exist
    if (this.settings.achievements?.unlocked) {
      const achievements = this.getAchievementDefinitions();
      const unwantedIds = achievements
        .filter((a) => unwantedTitles.has(a.title))
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
    // Filter out unwanted titles (O(1) Set lookup)
    const unwantedTitles = this.UNWANTED_TITLES_SET;
  
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
    if (unwantedTitles.has(title)) {
      return false;
    }

    // Also remove unwanted titles from unlocked titles list
    this.settings.achievements.titles = this.settings.achievements.titles.filter(
      (t) => !unwantedTitles.has(t)
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
  
    // Filter out unwanted titles (O(1) Set lookup; fires on every XP award)
    const unwantedTitles = this.UNWANTED_TITLES_SET;
    if (
      !this.settings.achievements.activeTitle ||
      unwantedTitles.has(this.settings.achievements.activeTitle)
    ) {
      // If active title is unwanted, unequip it
      if (
        this.settings.achievements.activeTitle &&
        unwantedTitles.has(this.settings.achievements.activeTitle)
      ) {
        this.settings.achievements.activeTitle = null;
        this.saveSettings(true);
      }
      const result = { ...C.DEFAULT_TITLE_BONUS };
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
  
    const bonus = achievement?.titleBonus || C.DEFAULT_TITLE_BONUS;
    // Return the raw titleBonus object directly (same as TitleManager)
    // This ensures both plugins see the exact same data structure
    // The display code handles both old format (raw) and new format (percentages)
    const result = {
      ...C.DEFAULT_TITLE_BONUS,
      ...bonus,
      // Ensure defaults for common properties to avoid undefined issues
      xp: this.normalizeNumber(bonus.xp, 0),
      critChance: this.normalizeNumber(bonus.critChance, 0),
      // Old format (raw numbers) - for backward compatibility
      strength: this.normalizeNumber(bonus.strength, 0),
      agility: this.normalizeNumber(bonus.agility, 0),
      intelligence: this.normalizeNumber(bonus.intelligence, 0),
      vitality: this.normalizeNumber(bonus.vitality, 0),
      perception: this.normalizeNumber(bonus.perception, 0),
      // New format (percentages) - primary format
      strengthPercent: this.normalizeNumber(bonus.strengthPercent, 0),
      agilityPercent: this.normalizeNumber(bonus.agilityPercent, 0),
      intelligencePercent: this.normalizeNumber(bonus.intelligencePercent, 0),
      vitalityPercent: this.normalizeNumber(bonus.vitalityPercent, 0),
      perceptionPercent: this.normalizeNumber(bonus.perceptionPercent, 0),
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

  // Last-known power fallback for when ShadowArmy's aggregate APIs are absent/erroring.
  // Checked before any scan — stale cache beats scanning the full IDB store. Both fields
  // are kept fresh on every successful commit via _commitShadowPower.
  _getCachedPowerFallback(shadowArmy) {
    const armyCached = shadowArmy?.settings?.cachedTotalPower;
    if (armyCached !== undefined) {
      return { found: true, power: armyCached, source: 'ShadowArmy' };
    }
    const raw = this.settings.cachedShadowPower;
    if (raw !== undefined) {
      const power = Number(String(raw).replace(/,/g, '')) || 0;
      return { found: true, power, source: 'SoloLevelingStats' };
    }
    return { found: false, power: 0 };
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
  
          // Diagnostic: IDB has data but aggregation returned 0 shadows -> reconcile.
          // This is a real mismatch (not honest-zero — honest-zero is armyStats.totalShadows
          // === 0 with a raw count of 0 too, handled above at the commit-result guard).
          if (totalPower === 0 && armyStats?.totalShadows === 0 && shadowArmy.storageManager) {
            try {
              const count = await shadowArmy.storageManager.getTotalCount();
              if (count > 0) {
                const cached = this._getCachedPowerFallback(shadowArmy);
                if (cached.found) {
                  this.debugLog('UPDATE_SHADOW_POWER', 'Aggregation/index mismatch — using last cached power', cached);
                  this._commitShadowPower(cached.power, shadowArmy);
                  return;
                }
                // No cached value has ever been recorded (fresh install) — one bounded
                // scan as the true last resort. Capped, so large armies may under-count;
                // logged so that's visible rather than silent.
                this.debugError('UPDATE_SHADOW_POWER', 'No cached power available; running capped diagnostic scan (10000 cap, may undercount)');
                // KEYSET PAGE (2026-07-30): one getAll instead of 10,000
                // per-record cursor callbacks. Safe — unfiltered, offset 0, and
                // the rows are only summed by _sumShadowPower, so order is
                // unobservable.
                const direct = shadowArmy.storageManager.getShadowsByKeyPage
                  ? (await shadowArmy.storageManager.getShadowsByKeyPage(null, 10000))?.shadows || []
                  : await shadowArmy.storageManager.getShadows({}, 0, 10000);
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
  
      // --- FALLBACK: aggregate APIs absent/erroring. Try last cached power before any
      // scan — stale beats a 281k-row scan, and the primary path refreshes it whenever
      // ShadowArmy answers. ---
      const cachedFallback = this._getCachedPowerFallback(shadowArmy);
      if (cachedFallback.found) {
        this.debugLog('UPDATE_SHADOW_POWER', 'Aggregate APIs unavailable — using last cached power', cachedFallback);
        this._commitShadowPower(cachedFallback.power, shadowArmy);
        return;
      }

      // No cached value has ever been recorded (fresh install edge case) — one bounded
      // scan as the true last resort. Capped, so large armies may under-count; logged
      // so that's visible rather than silent.
      if (shadowArmy.storageManager?.getShadows) {
        try {
          if (!shadowArmy.storageManager.db) await shadowArmy.storageManager.init();
          this.debugError('UPDATE_SHADOW_POWER', 'No cached power available; running capped last-resort scan (10000 cap, may undercount on large armies)');
          // KEYSET PAGE (2026-07-30): see the sibling call above — summed only,
          // so primary-key order is fine and this costs one callback not 10,000.
          const shadows = shadowArmy.storageManager.getShadowsByKeyPage
            ? (await shadowArmy.storageManager.getShadowsByKeyPage(null, 10000))?.shadows || []
            : await shadowArmy.storageManager.getShadows({}, 0, 10000);
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
