module.exports = {
  runMessageProcessingStage(stageFn) {
    try {
      stageFn();
    } catch (error) {
      this.debugError('MESSAGE_STAGE', error);
    }
  },

  processMessageSent(messageText, messageContext = null) {
    if (!this._isRunning || typeof messageText !== 'string' || messageText.length === 0) return;
  
    try {
      const resolvedContext =
        messageContext && typeof messageContext === 'object'
          ? messageContext
          : this.buildMessageContextFromView(messageText);
  
      const now = Date.now();
      const recentWindowMs = 2000;
      const channelScope = resolvedContext?.channelId || this.getCurrentChannelId() || 'global';
      const hashKey = `msg_${channelScope}_${this.hashString(messageText.substring(0, 2000))}`;
  
      // Defensive: ensure Map semantics even if an older version left a Set here
      (!this.recentMessages || typeof this.recentMessages.get !== 'function') &&
        (this.recentMessages = new Map());
  
      // Prune old entries (keep window bounded)
      if (this.recentMessages.size > 100) {
        for (const [k, ts] of this.recentMessages.entries()) {
          now - ts > recentWindowMs && this.recentMessages.delete(k);
        }
      }
  
      const lastProcessedAt = this.recentMessages.get(hashKey);
      if (lastProcessedAt && now - lastProcessedAt < recentWindowMs) return;
      this.recentMessages.set(hashKey, now);
  
      const messageLength = Math.min(messageText.length, 2000);
  
      this.runMessageProcessingStage(() => {
        this.settings.activity.messagesSent++;
        this.settings.activity.charactersTyped += messageLength;
      });
      this.runMessageProcessingStage(() => this.trackChannelVisit());
      this.runMessageProcessingStage(() => this.awardXP(messageText, messageLength, resolvedContext));
      this.runMessageProcessingStage(() => {
        this.updateQuestProgress('messageMaster', 1);
        this.updateQuestProgress('characterChampion', messageLength);
        this.updateQuestProgress('perfectStreak', 1);
      });
      this.runMessageProcessingStage(() => this.processNaturalStatGrowth());
      this.runMessageProcessingStage(() => this.checkAchievements());
  
      // XP gain already triggers immediate save, this is only a periodic quest-progress flush.
      if (Date.now() - this.lastSaveTime > 5000) {
        this.runMessageProcessingStage(() => this.saveSettings());
      }
    } catch (error) {
      this.debugError('PROCESS_MESSAGE', error);
    }
  },

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  },

  handleChannelChange(lastChannelId) {
    try {
      const channelInfo = this.getCurrentChannelInfo();
  
      if (!channelInfo) {
        this.debugLog('HANDLE_CHANNEL_CHANGE', 'No channel info after change', {
          currentUrl: window.location.href,
        });
        return lastChannelId;
      }
  
      const { channelId, channelType, serverId, isDM } = channelInfo;
  
      // Only track if channel actually changed
      if (channelId !== lastChannelId) {
        // Invalidate chat container cache on channel switch (DOM likely changed)
        this._cachedChatContainer = null;
        this._cachedChatContainerTs = 0;
  
        // Reduced verbosity - only log if verbose mode enabled (frequent operation)
        this.debugLog('HANDLE_CHANNEL_CHANGE', 'Channel changed detected', {
          oldChannelId: lastChannelId,
          newChannelId: channelId,
          channelType,
          serverId: serverId || 'N/A (DM)',
          isDM,
        });
  
        // Track the new channel visit
        this.trackChannelVisit();
  
        // Re-evaluate chat UI visibility for new channel
        if (this._isGuildTextChannel()) {
          // Self-heal stale reference on channel switch
          if (this.chatUIPanel && !this.chatUIPanel.isConnected) {
            this.debugLog('CHANNEL_CHANGE', 'Stale chatUIPanel on channel switch — clearing');
            this.chatUIPanel = null;
          }
          // Guild text channel — ensure UI is present
          if (!document.getElementById('sls-chat-ui')) {
            this.createChatUI();
          }
        } else {
          // Non-guild-text channel — remove UI
          this.removeChatUI();
        }
  
        // Update last channel ID
        return channelId;
      } else {
        this.debugLog('HANDLE_CHANNEL_CHANGE', 'Same channel, no change', {
          channelId,
        });
      }
    } catch (error) {
      this.debugError('HANDLE_CHANNEL_CHANGE', error, {
        currentUrl: window.location.href,
      });
    }
  
    return lastChannelId;
  },

  startAutoSave() {
    // Avoid duplicate timers/listeners on reloads
    if (this._autoSaveHandlers) return;
  
    // Also save on page unload (before Discord closes)
    const beforeUnloadHandler = () => {
      this.saveSettings(true);
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
  
    // Save on visibility change (when tab loses focus)
    const visibilityChangeHandler = () => document.hidden && this.saveSettings(true);
    document.addEventListener('visibilitychange', visibilityChangeHandler);
  
    this._autoSaveHandlers = {
      beforeUnloadHandler,
      visibilityChangeHandler,
    };
  },

  addXP(amount, options = {}) {
    try {
      const rawAmount = Number(amount);
      const xpAmount = Number.isFinite(rawAmount) ? Math.floor(rawAmount) : 0;
      if (xpAmount <= 0) return 0;
  
      const source =
        typeof options.source === 'string' && options.source.trim().length > 0
          ? options.source.trim()
          : 'external';
      const shareShadowXP = Boolean(options.shareShadowXP);
      const saveImmediately = Boolean(options.saveImmediately);
  
      this.ensureValidTotalXP(`ADD_XP:${source}`);
  
      const oldLevel = this.settings.level || 1;
      const oldTotalXP = this.settings.totalXP || 0;
      this.settings.xp = (this.settings.xp || 0) + xpAmount;
      this.settings.totalXP = oldTotalXP + xpAmount;
  
      // Invalidate level cache since XP changed.
      this.invalidatePerformanceCache(['currentLevel']);
  
      // Normalize current XP bucket using canonical level resolver.
      const newLevelInfo = this.getCurrentLevel();
      if (this.settings.level !== newLevelInfo.level) {
        this.settings.level = newLevelInfo.level;
        this.settings.xp = newLevelInfo.xp;
      } else {
        this.settings.xp = newLevelInfo.xp;
      }
  
      // Emit XP changed event for real-time progress updates.
      this.emitXPChanged();
  
      // Keep level/rank progression behavior aligned with awardXP().
      this.checkLevelUp(oldLevel);
      if ((this.settings.level || 1) === oldLevel) {
        this.checkRankPromotion();
      }
  
      if (saveImmediately) {
        this.saveSettings(true);
      } else {
        setTimeout(() => {
          try {
            this.saveSettings();
          } catch (error) {
            this.debugError('ADD_XP', error, { phase: 'save_after_add_xp', source });
          }
        }, 0);
      }
  
      if (shareShadowXP) {
        try {
          this.shareShadowXP(xpAmount, source);
        } catch (error) {
          this.debugError('ADD_XP', error, { phase: 'shadow_xp_share', source });
        }
      }
  
      this.debugLog('ADD_XP', 'External XP added', {
        source,
        xpAmount,
        oldTotalXP,
        newTotalXP: this.settings.totalXP,
        oldLevel,
        newLevel: this.settings.level,
      });
  
      return xpAmount;
    } catch (error) {
      this.debugError('ADD_XP', error, { amount, options });
      return 0;
    }
  },

  awardXP(messageText, messageLength, messageContext = null) {
    try {
      this.debugLog('AWARD_XP', 'Calculating XP', { messageLength });
  
      // Get current level for calculations
      const levelInfo = this.getCurrentLevel();
      const currentLevel = levelInfo.level;
  
      const baseXP = this.calculateBaseXpForMessage({ messageText, messageLength, messageContext });
      const antiAbuseMeta = this._lastAntiAbuseMeta;
      if (antiAbuseMeta?.antiAbuse) {
        const shouldLogAntiAbuse =
          antiAbuseMeta.antiAbuse.multiplier < 1 || antiAbuseMeta.interactionBonus > 0;
        shouldLogAntiAbuse &&
          this.debugLog('ANTI_ABUSE', 'Applied anti-abuse scoring', {
            multiplier: antiAbuseMeta.antiAbuse.multiplier,
            rapidMultiplier: antiAbuseMeta.antiAbuse.rapidMultiplier,
            repeatMultiplier: antiAbuseMeta.antiAbuse.repeatMultiplier,
            repeatCount: antiAbuseMeta.antiAbuse.repeatCount,
            deltaMs: antiAbuseMeta.antiAbuse.deltaMs,
            interactionBonus: antiAbuseMeta.interactionBonus,
            scaledInteractionBonus: antiAbuseMeta.scaledInteractionBonus,
            preDecayBaseXP: antiAbuseMeta.preDecayBaseXP,
            postDecayBaseXP: antiAbuseMeta.postDecayBaseXP,
            source: antiAbuseMeta.antiAbuse.source,
          });
      }
  
      // ===== ACTIVE SKILL BUFFS (SkillTree temporary activated abilities) =====
      const activeBuffs = this.getActiveSkillBuffs();
  
      // ===== PERCENTAGE BONUSES (Additive, Not Multiplicative) =====
      let totalPercentageBonus = 0; // Track all percentage bonuses additively
  
      // ===== SKILL TREE BONUSES (Additive Percentage - Permanent Buffs) =====
      // Skill Tree bonuses are ADDITIVE percentage bonuses (like title bonuses)
      // They're permanent buffs that add to the percentage pool
      // Reset stat multiplier for this calculation
      this._skillTreeStatMultiplier = null;
  
      const skillBonuses = this.getSkillTreeBonuses();
      // XP bonus: Additive percentage (adds to percentage pool)
      skillBonuses?.xpBonus > 0 && (totalPercentageBonus += skillBonuses.xpBonus * 100);
      // Long message bonus: Additive percentage (adds to percentage pool)
      messageLength > 200 &&
        skillBonuses?.longMsgBonus > 0 &&
        (totalPercentageBonus += skillBonuses.longMsgBonus * 100);
      // All stat bonus: Multiplies stat-based bonuses (strength, intelligence)
      skillBonuses?.allStatBonus > 0 &&
        (this._skillTreeStatMultiplier = 1 + skillBonuses.allStatBonus);
  
      // Active buff: Ruler's Authority allStatMultiplier (stacks multiplicatively with passive)
      if (activeBuffs?.allStatMultiplier > 1.0) {
        this._skillTreeStatMultiplier = (this._skillTreeStatMultiplier || 1.0) * activeBuffs.allStatMultiplier;
      }
  
      // Title bonus will be applied multiplicatively after percentage bonuses
      // (stored for later application)
  
      // ===== STAT BONUSES (Additive with Diminishing Returns) =====
  
      // Strength: +2% per point, with diminishing returns after 20 points
      const strengthStat = this.settings.stats.strength || 0;
      let strengthBonus = 0;
      if (strengthStat > 0) {
        if (strengthStat <= 20) {
          strengthBonus = strengthStat * 2; // 2% per point up to 20
        } else {
          // Diminishing returns: 40% base + (stat - 20) * 0.5%
          strengthBonus = 40 + (strengthStat - 20) * 0.5;
        }
        // Apply Skill Tree allStatBonus multiplier if available
        if (this._skillTreeStatMultiplier) {
          strengthBonus *= this._skillTreeStatMultiplier;
        }
        totalPercentageBonus += strengthBonus;
      }
  
      // Intelligence: TIERED SYSTEM for messages (Mana/Magic efficiency)
      // TIER 1 (100-200 chars): +3% per INT point
      // TIER 2 (200-400 chars): +7% per INT point
      // TIER 3 (400+ chars):    +12% per INT point
  
      const intelligenceStat = this.settings.stats.intelligence || 0;
  
      // FUNCTIONAL: Determine tier bonus (lookup map, no if-else chain)
      const intTierBonuses = {
        tier3: { threshold: 400, bonus: 12 }, // Very long messages
        tier2: { threshold: 200, bonus: 7 }, // Long messages
        tier1: { threshold: 100, bonus: 3 }, // Medium messages
      };
  
      // FUNCTIONAL: Find applicable tier (no if-else)
      const applicableTier = Object.values(intTierBonuses).find(
        (tier) => messageLength >= tier.threshold
      );
  
      // FUNCTIONAL: Calculate intelligence bonus (short-circuit)
      applicableTier &&
        intelligenceStat > 0 &&
        (() => {
          const bonusPerPoint = applicableTier.bonus;
          let intelligenceBonus = 0;
  
          // Diminishing returns after 15 points (same scaling for all tiers)
          intelligenceStat <= 15
            ? (intelligenceBonus = intelligenceStat * bonusPerPoint)
            : (intelligenceBonus =
                15 * bonusPerPoint + (intelligenceStat - 15) * (bonusPerPoint / 5));
  
          // Apply Skill Tree allStatBonus multiplier if available
          this._skillTreeStatMultiplier && (intelligenceBonus *= this._skillTreeStatMultiplier);
  
          totalPercentageBonus += intelligenceBonus;
  
          this.debugLog('INT_TIER_BONUS', 'Intelligence tier bonus applied', {
            messageLength,
            tier: applicableTier.threshold,
            bonusPerPoint,
            intelligenceStat,
            intelligenceBonus: intelligenceBonus.toFixed(1) + '%',
          });
        })();
  
      // ===== APPLY PERCENTAGE BONUSES (Additive) =====
      // Cap additive pool to prevent unbounded growth stacking.
      const cappedPercentageBonus = Math.min(totalPercentageBonus, 220);
      let xp = Math.round(baseXP * (1 + cappedPercentageBonus / 100));
  
      // ===== TITLE BONUS (Multiplicative - Single Equipped Title) =====
      // Titles are MULTIPLICATIVE since you can only equip one title at a time
      // This makes title choice meaningful and powerful
      const titleBonus = this.getActiveTitleBonus();
      const titleXpCap = this.getTitleXpCapForLevel(currentLevel);
      const appliedTitleXpBonus = Math.min(Math.max(0, titleBonus.xp || 0), titleXpCap);
      if (appliedTitleXpBonus > 0) {
        xp = Math.round(xp * (1 + appliedTitleXpBonus));
      }
  
      // ===== ACTIVE SKILL: Sprint XP Multiplier (Multiplicative) =====
      if (activeBuffs?.xpMultiplier > 1.0) {
        xp = Math.round(xp * activeBuffs.xpMultiplier);
      }
  
      // ===== MILESTONE BONUSES (Multiplicative - Catch-up mechanism) =====
      // At certain level milestones, multiply XP to help balance diminishing returns
      // These are MULTIPLICATIVE since they're milestone rewards
      // Slightly nerfed but still impactful
      const milestoneMultipliers = {
        25: 1.06,
        50: 1.1,
        75: 1.14,
        100: 1.18,
        150: 1.22,
        200: 1.27,
        300: 1.33,
        400: 1.38,
        500: 1.43,
        700: 1.48,
        1000: 1.54,
        1500: 1.6,
        2000: 1.68,
      };
  
      // Apply highest milestone multiplier reached (using .reduce() for cleaner code)
      // Cache milestone multiplier based on level
      let milestoneMultiplier = 1.0;
      if (
        this._cache.milestoneMultiplierLevel === currentLevel &&
        this._cache.milestoneMultiplier !== null
      ) {
        milestoneMultiplier = this._cache.milestoneMultiplier;
      } else {
        milestoneMultiplier = Object.entries(milestoneMultipliers).reduce(
          (highest, [milestone, multiplier]) => {
            return currentLevel >= parseInt(milestone) ? multiplier : highest;
          },
          1.0
        );
        // Cache the result
        this._cache.milestoneMultiplier = milestoneMultiplier;
        this._cache.milestoneMultiplierLevel = currentLevel;
      }
  
      if (milestoneMultiplier > 1.0) {
        xp = Math.round(xp * milestoneMultiplier);
      }
  
      // ===== LEVEL-BASED DIMINISHING RETURNS (Balanced) =====
      // At higher levels, XP gains are reduced to prevent rapid leveling.
      // Floor: 60% preserves forward motion without runaway acceleration.
      if (currentLevel > 10) {
        const rawMultiplier = 1 / (1 + (currentLevel - 10) * 0.01);
        const levelReductionMultiplier = Math.max(rawMultiplier, 0.6); // Floor at 60%
        xp = Math.round(xp * levelReductionMultiplier);
  
        // Minimum XP floor: Always award at least 10 XP per message (ensures visible progress)
        const minXP = 10;
        xp = Math.max(xp, minXP);
      }
  
      // ===== CRITICAL HIT BONUS (Multiplicative, but capped) =====
      // Active skill: Mutilate — guaranteed crit (charge-based)
      let activeSkillForcedCrit = false;
      if (activeBuffs?.guaranteedCrit) {
        const consumed = this.consumeActiveSkillCharge('mutilate');
        if (consumed) activeSkillForcedCrit = true;
      }
  
      let critBonus = this.checkCriticalHitBonus();
      // SkillTree passive + active crit chance support (only if base crit didn't already trigger).
      const passiveSkillCritChance = Math.min(
        0.35,
        Math.max(0, Number(skillBonuses?.critBonus || 0))
      );
      const activeSkillCritChance = Math.min(
        0.5,
        Math.max(0, Number(activeBuffs?.critChanceBonus || 0))
      );
      const supplementalCritChance = Math.min(
        0.85,
        passiveSkillCritChance + activeSkillCritChance
      );
  
      if (critBonus <= 0 && supplementalCritChance > 0) {
        const roll = Math.random();
        if (roll < supplementalCritChance) {
          // Skill-triggered crit: use base crit multiplier from agility.
          const agilityStat = this.settings.stats?.agility || 0;
          critBonus = Math.min(1.2, 0.2 + Math.min(0.75, agilityStat * 0.006));
        }
      }
  
      // Active skill: Mutilate — force crit if guaranteed
      if (activeSkillForcedCrit && critBonus <= 0) {
        const agilityStat = this.settings.stats?.agility || 0;
        critBonus = Math.min(1.2, 0.2 + Math.min(0.75, agilityStat * 0.006));
      }
  
      if (critBonus > 0) {
        const baseXPBeforeCrit = xp;
        let critMultiplier = critBonus;
        let isMegaCrit = false;
        let comboFlatBonusXP = 0;
  
        // Check for Dagger Throw Master mega crit (special case - high but capped burst)
        const activeTitle = this.settings.achievements?.activeTitle;
        if (activeTitle === 'Dagger Throw Master') {
          const agilityStat = this.settings.stats?.agility || 0;
          const megaCritChance = Math.min(0.2, agilityStat * 0.001);
          const roll = Math.random();
  
          if (roll < megaCritChance) {
            critMultiplier = 149; // 150x total
            isMegaCrit = true;
            this.showNotification(
              ` MEGA CRITICAL HIT! \n` +
                `Dagger Throw Master activated!\n` +
                `150x XP Multiplier!`,
              'success',
              8000
            );
            this.debugLog('AWARD_XP_MEGA_CRIT', 'Mega crit activated!', {
              agilityStat,
              megaCritChance: (megaCritChance * 100).toFixed(1) + '%',
              roll: roll.toFixed(4),
              multiplier: '150x',
            });
          }
        }
  
        // Apply crit multiplier (only multiplicative bonus remaining)
        xp = Math.round(xp * (1 + critMultiplier));
  
        // PER burst chain grants additional flat XP with strict cap.
        // Keeps higher combos rewarding while preventing easy over-leveling.
        const critBurstInfo = this._cache?.lastAppliedCritBurst || null;
        if (!isMegaCrit && critBurstInfo?.burstHits > 1) {
          const effectiveBurstHits = Math.min(20, Number(critBurstInfo.effectiveBurstHits || 1));
          const extraRatio = Math.min(
            0.18,
            Math.log2(effectiveBurstHits + 1) * 0.02 +
              (Math.min(12, effectiveBurstHits) - 1) * 0.006
          );
          const cappedFlatBonus = Math.max(4, Math.round(baseXPBeforeCrit * 0.18));
          comboFlatBonusXP = Math.min(
            cappedFlatBonus,
            Math.max(2, Math.round(baseXPBeforeCrit * extraRatio))
          );
          xp += comboFlatBonusXP;
        }
  
        // Track crit for achievements
        if (!this.settings.activity.critsLanded) {
          this.settings.activity.critsLanded = 0;
        }
        this.settings.activity.critsLanded++;
  
        this.debugLog(
          'AWARD_XP_CRIT',
          isMegaCrit ? 'MEGA CRITICAL HIT!' : 'Critical hit bonus applied',
          {
            critBonus: (critBonus * 100).toFixed(0) + '%',
            baseXPBeforeCrit,
            critBonusXP: xp - baseXPBeforeCrit,
            comboFlatBonusXP,
            burstHits: this._cache?.lastAppliedCritBurst?.burstHits || 1,
            finalXP: xp,
            totalCrits: this.settings.activity.critsLanded,
            isMegaCrit,
          }
        );
      }
  
      // ===== RANK BONUS (Multiplicative, but final) =====
      // Rank multiplier applied last (this is the only remaining multiplicative bonus)
      const rankMultiplier = this.getRankMultiplier();
      xp = Math.round(xp * rankMultiplier);
  
      // ===== ACTIVE SKILL: Domain Expansion Global Multiplier (final layer) =====
      if (activeBuffs?.globalMultiplier > 1.0) {
        xp = Math.round(xp * activeBuffs.globalMultiplier);
      }
  
      // Final XP governor: soft-cap + hard-cap compression based on level.
      xp = this.applyXpGovernors(xp, currentLevel);
  
      // Final rounding
      xp = Math.round(xp);
  
      // Calculate skill tree multiplier for logging (if any)
      const skillTreeMultiplier = this._skillTreeStatMultiplier || 1.0;
  
      this.debugLog('AWARD_XP', 'XP calculated', {
        baseXP,
        totalPercentageBonus: totalPercentageBonus.toFixed(1) + '%',
        cappedPercentageBonus: cappedPercentageBonus.toFixed(1) + '%',
        titleXpApplied: `${(appliedTitleXpBonus * 100).toFixed(1)}% (cap ${(titleXpCap * 100).toFixed(0)}%)`,
        skillTreeMultiplier:
          skillTreeMultiplier > 1.0 ? `${((skillTreeMultiplier - 1) * 100).toFixed(1)}%` : 'None',
        milestoneMultiplier:
          milestoneMultiplier > 1.0 ? `${((milestoneMultiplier - 1) * 100).toFixed(0)}%` : 'None',
        levelReduction:
          currentLevel > 10
            ? (Math.max(1 / (1 + (currentLevel - 10) * 0.01), 0.6) * 100).toFixed(1) + '%'
            : 'N/A',
        rankMultiplier: `${((this.getRankMultiplier() - 1) * 100).toFixed(0)}%`,
        finalXP: xp,
        messageLength,
        currentLevel,
      });
  
      // CRITICAL: Ensure totalXP is initialized (prevent progress bar from breaking)
      this.ensureValidTotalXP('AWARD_XP');
  
      // Add XP
      const oldLevel = this.settings.level;
      const oldTotalXP = this.settings.totalXP;
      this.settings.xp += xp;
      this.settings.totalXP += xp;
  
      // Invalidate level cache since XP changed
      this.invalidatePerformanceCache(['currentLevel']);
  
      // Update level based on new total XP
      const newLevelInfo = this.getCurrentLevel();
      if (this.settings.level !== newLevelInfo.level) {
        this.settings.level = newLevelInfo.level;
        this.settings.xp = newLevelInfo.xp;
      } else {
        this.settings.xp = newLevelInfo.xp;
      }
  
      this.debugLog('AWARD_XP', 'XP added', {
        xpAwarded: xp,
        oldTotalXP,
        newTotalXP: this.settings.totalXP,
        oldLevel,
        newLevel: this.settings.level,
        currentXP: this.settings.xp,
        xpRequired: newLevelInfo.xpRequired,
      });
  
      // Emit XP changed event for real-time progress bar updates (triggers updateChatUI internally)
      this.emitXPChanged();
  
      // Save on XP gain (debounced — coalesces rapid XP grants)
      // Use setTimeout to avoid blocking the main thread
      setTimeout(() => {
        try {
          this.saveSettings();
          this.debugLog('AWARD_XP', 'Settings saved after XP gain');
        } catch (error) {
          this.debugError('AWARD_XP', error, { phase: 'save_after_xp' });
        }
      }, 0);
  
      // Check for level up and rank promotion
      try {
        this.checkLevelUp(oldLevel);
        if ((this.settings.level || 1) === oldLevel) {
          this.checkRankPromotion();
        }
        this.debugLog('AWARD_XP', 'Level and rank checks completed');
      } catch (error) {
        this.debugError('AWARD_XP', error, { phase: 'level_rank_check' });
      }
  
      // Share XP with shadow army (asynchronous, doesn't block UI)
      try {
        this.shareShadowXP(xp, 'message');
      } catch (error) {
        this.debugError('AWARD_XP', error, { phase: 'shadow_xp_share' });
      }
    } catch (error) {
      this.debugError('AWARD_XP', error, {
        messageLength,
        messagePreview: messageText?.substring(0, 30),
      });
    }
  }
};
