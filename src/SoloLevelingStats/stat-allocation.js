module.exports = {
  _queueStatAllocation(statName, oldValue, newValue, effectText, perceptionBuff = null) {
    // Add to queue
    this._statAllocationQueue.push({
      statName,
      oldValue,
      newValue,
      effectText,
      perceptionBuff,
      timestamp: Date.now(),
    });
  
    // Clear existing timeout
    if (this._statAllocationTimeout) {
      clearTimeout(this._statAllocationTimeout);
    }
  
    // Set new timeout to show aggregated notification
    this._statAllocationTimeout = setTimeout(() => {
      this._showAggregatedStatNotification();
    }, this._statAllocationDebounceDelay);
  },

  _showAggregatedStatNotification() {
    if (this._statAllocationQueue.length === 0) return;
  
    // Group allocations by stat
    const statGroups = {};
    this._statAllocationQueue.forEach((allocation) => {
      const statName = allocation.statName;
      if (!statGroups[statName]) {
        statGroups[statName] = {
          count: 0,
          oldValue: allocation.oldValue,
          newValue: allocation.newValue,
          effectText: allocation.effectText,
        };
      }
      statGroups[statName].count++;
      statGroups[statName].newValue = allocation.newValue; // Update to latest value
    });
  
    // Build notification message
    const statLines = Object.entries(statGroups).map(([statName, data]) => {
      const statDisplayName = statName.charAt(0).toUpperCase() + statName.slice(1);
      if (data.count === 1) {
        return `+1 ${statDisplayName} (${data.oldValue} → ${data.newValue})`;
      } else {
        return `+${data.count} ${statDisplayName} (${data.oldValue} → ${data.newValue})`;
      }
    });
  
    // Calculate total bonuses gained from allocations
    const bonusLines = [];
  
    // Calculate bonuses for each stat type
    Object.entries(statGroups).forEach(([statName, data]) => {
      if (statName === 'perception') {
        const profile = this.getPerceptionBurstProfile();
        bonusLines.push(
          `Perception: ${Math.round(profile.burstChance * 100)}% chain chance, up to x${profile.maxHits} hits`
        );
      } else if (data.effectText && statName !== 'perception') {
        // Calculate total bonus from allocated points
        let totalBonus = 0;
        const statBonusMap = {
          strength: (count) => count * 2, // +2% XP per point (before diminishing returns)
          agility: (count) => count * 2, // +2% crit chance per point
          intelligence: (count) => count * 3, // +3% long-message bonus baseline (higher tiers handled in XP calc)
          vitality: (count) => count * 5, // +5% quest rewards per point
        };
  
        if (statBonusMap[statName]) {
          totalBonus = statBonusMap[statName](data.count);
          const statDisplayName = statName.charAt(0).toUpperCase() + statName.slice(1);
          bonusLines.push(`${statDisplayName}: +${totalBonus}% total bonus`);
        }
      }
    });
  
    const message =
      statLines.join('\n') +
      (bonusLines.length > 0 ? '\n\nTotal Bonuses:\n' + bonusLines.join('\n') : '');
  
    // Show aggregated notification
    this.showNotification(message, 'success', 6000);
  
    // Clear queue
    this._statAllocationQueue = [];
    this._statAllocationTimeout = null;
  },

  applyStatMutationEffects({
    emitPayload = null,
    invalidateKeys = ['stats', 'perception'],
    saveImmediately = true,
    refreshUI = true,
    recomputeHpMana = true,
  } = {}) {
    invalidateKeys?.length && this.invalidatePerformanceCache(invalidateKeys);
    recomputeHpMana && this.recomputeHPManaFromStats();
    saveImmediately && this.saveSettings(true);
    refreshUI && this.updateChatUI();
  
    if (emitPayload) {
      this.emit('statsChanged', {
        stats: { ...this.settings.stats },
        ...emitPayload,
      });
    }
  },

  allocateStatPoint(statName) {
    // Normalize stat name (handle case variations)
    if (!statName) {
      this.debugError('ALLOCATE_STAT', new Error('No stat name provided'), {
        statName,
        type: typeof statName,
      });
      this.debugError('INVALID_STAT', new Error('Invalid stat name!'));
      this.showNotification('Invalid stat name!', 'error', 2000);
      return false;
    }
  
    // Convert to string and normalize
    statName = String(statName).toLowerCase().trim();
  
    // Map common variations
    const statMap = {
      str: 'strength',
      agi: 'agility',
      int: 'intelligence',
      vit: 'vitality',
      luk: 'perception',
      luck: 'perception', // Migration: map old 'luck' to 'perception'
      per: 'perception',
    };
  
    if (statMap[statName]) {
      statName = statMap[statName];
    }
  
    this.debugLog('ALLOCATE_STAT', 'Attempting allocation', {
      originalStatName: statName,
      normalizedStatName: statName,
      unallocatedPoints: this.settings.unallocatedStatPoints,
      availableStats: Object.keys(this.settings.stats),
      statExists: statName in this.settings.stats,
      statValue: this.settings.stats[statName],
      statsObject: this.settings.stats,
    });
  
    if (this.settings.unallocatedStatPoints <= 0) {
      this.showNotification('No stat points available!', 'error', 2000);
      return false;
    }
  
    if (!(statName in this.settings.stats)) {
      this.debugError('ALLOCATE_STAT', new Error(`Invalid stat name: ${statName}`), {
        providedName: statName,
        availableStats: Object.keys(this.settings.stats),
        statsObject: this.settings.stats,
      });
      this.debugError('INVALID_STAT', new Error('Invalid stat name!'));
      this.showNotification(`Invalid stat name: ${statName}!`, 'error', 2000);
      return false;
    }
  
    const oldValue = this.settings.stats[statName];
    this.settings.stats[statName]++;
    this.settings.unallocatedStatPoints--;
    const newValue = this.settings.stats[statName];
  
    // Special handling for Perception (PER): controls crit burst-hit profile
    if (statName === 'perception') {
      const profile = this.getPerceptionBurstProfile();
  
      this.debugLog('ALLOCATE_STAT_PERCEPTION', 'Perception burst profile updated', {
        perceptionStat: this.settings.stats.perception,
        burstChance: `${(profile.burstChance * 100).toFixed(1)}%`,
        maxHits: profile.maxHits,
        jackpotChance: `${(profile.jackpotChance * 100).toFixed(2)}%`,
      });
  
      const perEffect = `Crit burst chance ${(profile.burstChance * 100).toFixed(
        0
      )}%, max x${profile.maxHits}`;
      this._queueStatAllocation(statName, oldValue, this.settings.stats[statName], perEffect, null);
  
      this.applyStatMutationEffects({
        emitPayload: {
          statChanged: statName,
          oldValue,
          newValue,
        },
      });
  
      // Save immediately — stat allocation is player-visible progress
      this.saveSettings(true);
  
      this.debugLog(
        'ALLOCATE_STAT',
        `${statName.charAt(0).toUpperCase() + statName.slice(1)} stat point allocated with buff`,
        {
          statName,
          oldValue,
          newValue: this.settings.stats[statName],
          burstChance: profile.burstChance,
          maxHits: profile.maxHits,
          remainingPoints: this.settings.unallocatedStatPoints,
        }
      );
  
      return true;
    }
  
    // Calculate new effect strength for feedback (for non-PER stats)
    const statEffects = {
      strength: `+${(this.settings.stats[statName] * 2).toFixed(0)}% XP bonus (diminishing after 20)`,
      agility: `+${(this.settings.stats[statName] * 2).toFixed(0)}% crit chance (up to cap)`,
      intelligence: 'Tiered long-message XP bonus (3/7/12% per point, diminishing after 15)',
      vitality: `+${(this.settings.stats[statName] * 5).toFixed(0)}% quest rewards`,
      perception: `Increases critical burst hit chains (xN)`,
    };
  
    const effectText = statEffects[statName] || 'Effect applied';
  
    // Queue notification for aggregation (prevents spam)
    this._queueStatAllocation(
      statName,
      oldValue,
      this.settings.stats[statName],
      effectText,
      null // No perception buff for non-perception stats
    );
  
    this.applyStatMutationEffects({
      emitPayload: {
        statChanged: statName,
        oldValue,
        newValue,
      },
    });
  
    // Save immediately — stat allocation is player-visible progress
    this.saveSettings(true);
  
    // Debug log
    this.debugLog('ALLOCATE_STAT', 'Stat point allocated successfully', {
      statName,
      oldValue,
      newValue: this.settings.stats[statName],
      remainingPoints: this.settings.unallocatedStatPoints,
      effect: effectText,
    });
  
    return true;
  },

  applyRetroactiveNaturalStatGrowth() {
    try {
      // Check if we've already applied retroactive growth
      if (this.settings._retroactiveStatGrowthApplied) {
        return; // Already applied
      }
  
      const messagesSent = this.settings.activity?.messagesSent || 0;
      const level = this.settings.level || 1;
      const _charactersTyped = this.settings.activity?.charactersTyped || 0;
  
      // Calculate expected natural stat growth based on activity.
      // Retroactive grant is intentionally conservative to avoid stat inflation on older saves.
      const baseGrowthPer100Messages = 0.08;
      const levelMultiplier = 1 + Math.min(2.5, (level - 1) * 0.002);
      const messageBasedGrowth = Math.floor(
        (messagesSent / 100) * baseGrowthPer100Messages * levelMultiplier
      );
  
      // Also grant a light level-based base growth.
      const levelBasedGrowth = Math.floor((level - 1) * 0.03);
  
      // Total retroactive growth to distribute
      const totalGrowth = messageBasedGrowth + levelBasedGrowth;
  
      if (totalGrowth > 0) {
        const statNames = this.STAT_KEYS;
        let statsAdded = 0;
  
        // Distribute growth evenly across all stats
        const growthPerStat = Math.floor(totalGrowth / statNames.length);
        const remainder = totalGrowth % statNames.length;
  
        statNames.forEach((statName, index) => {
          const _currentStat = this.settings.stats[statName] || 0;
          // Add base growth per stat
          let growthToAdd = growthPerStat;
          // Add remainder to first stats
          if (index < remainder) {
            growthToAdd += 1;
          }
  
          if (growthToAdd > 0) {
            this.settings.stats[statName] += growthToAdd;
            statsAdded += growthToAdd;
  
            // PER no longer generates random stacked buffs during growth.
          }
        });
  
        if (statsAdded > 0) {
          // Mark as applied
          this.settings._retroactiveStatGrowthApplied = true;
  
          // Save immediately
          this.saveSettings(true);
  
          this.debugLog('RETROACTIVE_STAT_GROWTH', 'Applied retroactive natural stat growth', {
            messagesSent,
            level,
            totalGrowth,
            statsAdded,
            newStats: { ...this.settings.stats },
          });
  
          // Retroactive growth is silent — logged to debug only.
        }
      }
    } catch (error) {
      this.debugError('RETROACTIVE_STAT_GROWTH', error);
    }
  },

  processNaturalStatGrowth() {
    try {
      const statNames = this.STAT_KEYS;
      let statsGrown = [];
  
      // Get user level and rank for bonus growth
      const userLevel = this.settings.level || 1;
      const userRank = this.settings.rank || 'E';
      const rankIndex = this.settings.ranks?.indexOf(userRank) || 0;
  
      // Level-based bonus: +0.002% per level (caps at +2% at level 1000)
      const levelBonus = Math.min(0.02, userLevel * 0.00002);
  
      // Rank-based bonus: +0.1% per rank tier (E=0%, ..., Shadow Monarch~1.2%)
      const rankBonus = Math.min(0.012, rankIndex * 0.001);
  
      statNames.forEach((statName) => {
        const currentStat = this.settings.stats[statName] || 0;
  
        // Balanced growth chance formula (sublinear scaling to avoid runaway loops):
        // Base: 0.12%
        // Stat scaling: sqrt(stat)-based, capped contribution
        // Level/rank add small additive boosts
        const baseChance = 0.0012;
        const statScaling = Math.min(0.018, Math.sqrt(currentStat) * 0.00045);
  
        // Total growth chance with bonuses
        const growthChance = Math.min(0.05, baseChance + statScaling + levelBonus + rankBonus); // Cap at 5% max
  
        // Roll for natural growth
        const roll = Math.random();
        if (roll < growthChance) {
          // Natural stat growth!
          const oldValue = currentStat;
  
          // Small chance for multi-point procs at very high stats.
          let growthAmount = 1;
          if (currentStat >= 500 && Math.random() < 0.005) {
            growthAmount = 3;
          } else if (currentStat >= 250 && Math.random() < 0.02) {
            growthAmount = 2;
          }
  
          this.settings.stats[statName] += growthAmount;
  
          // PER no longer generates random stacked buffs during growth.
  
          statsGrown.push({
            stat: statName,
            oldValue,
            newValue: this.settings.stats[statName],
            growthAmount,
            chance: (growthChance * 100).toFixed(2) + '%',
          });
  
          this.debugLog('NATURAL_STAT_GROWTH', `Natural ${statName} growth!`, {
            statName,
            oldValue,
            newValue: this.settings.stats[statName],
            growthAmount,
            growthChance: (growthChance * 100).toFixed(2) + '%',
            levelBonus: (levelBonus * 100).toFixed(2) + '%',
            rankBonus: (rankBonus * 100).toFixed(2) + '%',
            roll: roll.toFixed(4),
          });
        }
      });
  
      // If any stats grew, save and update UI
      if (statsGrown.length > 0) {
        this.applyStatMutationEffects({
          emitPayload: {
            statsGrown,
          },
        });
  
        // Debounced save — natural growth happens per-message so we coalesce
        this.saveSettings();
      }
    } catch (error) {
      this.debugError('NATURAL_STAT_GROWTH', error);
    }
  }
};
