module.exports = {
  runMessageProcessingStage(stageFn) {
    try {
      stageFn();
    } catch (error) {
      this.debugError('MESSAGE_STAGE', error);
    }
  },

  _resolveMessageProcessingContext(messageText, messageContext) {
    if (messageContext && typeof messageContext === 'object') {
      return messageContext;
    }
    return this.buildMessageContextFromView(messageText);
  },

  _ensureRecentMessagesMap() {
    if (!this.recentMessages || typeof this.recentMessages.get !== 'function') {
      this.recentMessages = new Map();
    }
    return this.recentMessages;
  },

  _pruneRecentMessages(now, recentWindowMs) {
    if (!this.recentMessages || this.recentMessages.size <= 100) return;
    for (const [key, timestamp] of this.recentMessages.entries()) {
      if (now - timestamp > recentWindowMs) {
        this.recentMessages.delete(key);
      }
    }
  },

  _buildRecentMessageHash(messageText, resolvedContext) {
    const channelScope = resolvedContext?.channelId || this.getCurrentChannelId() || 'global';
    const messageHash = this.hashString(messageText.substring(0, 2000));
    return `msg_${channelScope}_${messageHash}`;
  },

  _isRecentMessageDuplicate(hashKey, now, recentWindowMs) {
    const lastProcessedAt = this.recentMessages.get(hashKey);
    return Boolean(lastProcessedAt && now - lastProcessedAt < recentWindowMs);
  },

  _recordRecentMessage(hashKey, now) {
    this.recentMessages.set(hashKey, now);
  },

  _runMessageProcessingStages(messageText, messageLength, resolvedContext) {
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
  },

  _maybeFlushPeriodicMessageSave() {
    if (Date.now() - this.lastSaveTime > 5000) {
      this.runMessageProcessingStage(() => this.saveSettings());
    }
  },

  processMessageSent(messageText, messageContext = null) {
    if (!this._isRunning || typeof messageText !== 'string' || messageText.length === 0) return;
  
    try {
      const now = Date.now();
      const recentWindowMs = 2000;
      const resolvedContext = this._resolveMessageProcessingContext(messageText, messageContext);
      const hashKey = this._buildRecentMessageHash(messageText, resolvedContext);

      this._ensureRecentMessagesMap();
      this._pruneRecentMessages(now, recentWindowMs);
      if (this._isRecentMessageDuplicate(hashKey, now, recentWindowMs)) return;
      this._recordRecentMessage(hashKey, now);
  
      const messageLength = Math.min(messageText.length, 2000);
      this._runMessageProcessingStages(messageText, messageLength, resolvedContext);
      this._maybeFlushPeriodicMessageSave();
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

  _normalizeAddXpRequest(amount, options = {}) {
    const rawAmount = Number(amount);
    const xpAmount = Number.isFinite(rawAmount) ? Math.floor(rawAmount) : 0;
    const source =
      typeof options.source === 'string' && options.source.trim().length > 0
        ? options.source.trim()
        : 'external';

    return {
      xpAmount,
      source,
      shareShadowXP: Boolean(options.shareShadowXP),
      saveImmediately: Boolean(options.saveImmediately),
    };
  },

  _applyExternalXpToState(xpAmount, source) {
    this.ensureValidTotalXP(`ADD_XP:${source}`);

    const oldLevel = this.settings.level || 1;
    const oldTotalXP = this.settings.totalXP || 0;
    this.settings.xp = (this.settings.xp || 0) + xpAmount;
    this.settings.totalXP = oldTotalXP + xpAmount;

    this.invalidatePerformanceCache(['currentLevel']);

    const newLevelInfo = this.getCurrentLevel();
    this.settings.level = newLevelInfo.level;
    this.settings.xp = newLevelInfo.xp;

    return {
      oldLevel,
      oldTotalXP,
    };
  },

  _runAddXpProgressChecks(oldLevel) {
    this.checkLevelUp(oldLevel);
    if ((this.settings.level || 1) === oldLevel) {
      this.checkRankPromotion();
    }
  },

  _persistAddXp(saveImmediately) {
    if (saveImmediately) {
      this.saveSettings(true);
      return;
    }
    this.saveSettings();
  },

  _shareAddXpWithShadowArmy(xpAmount, source, shareShadowXP) {
    if (!shareShadowXP) return;
    try {
      this.shareShadowXP(xpAmount, source);
    } catch (error) {
      this.debugError('ADD_XP', error, { phase: 'shadow_xp_share', source });
    }
  },

  addXP(amount, options = {}) {
    try {
      const normalized = this._normalizeAddXpRequest(amount, options);
      if (normalized.xpAmount <= 0) return 0;

      const stateResult = this._applyExternalXpToState(normalized.xpAmount, normalized.source);
      this.emitXPChanged();
      this._runAddXpProgressChecks(stateResult.oldLevel);
      this._persistAddXp(normalized.saveImmediately);
      this._shareAddXpWithShadowArmy(
        normalized.xpAmount,
        normalized.source,
        normalized.shareShadowXP
      );

      this.debugLog('ADD_XP', 'External XP added', {
        source: normalized.source,
        xpAmount: normalized.xpAmount,
        oldTotalXP: stateResult.oldTotalXP,
        newTotalXP: this.settings.totalXP,
        oldLevel: stateResult.oldLevel,
        newLevel: this.settings.level,
      });

      return normalized.xpAmount;
    } catch (error) {
      this.debugError('ADD_XP', error, { amount, options });
      return 0;
    }
  },

  _logAntiAbuseMeta(antiAbuseMeta) {
    if (!antiAbuseMeta?.antiAbuse) return;
    const shouldLogAntiAbuse =
      antiAbuseMeta.antiAbuse.multiplier < 1 || antiAbuseMeta.interactionBonus > 0;
    if (!shouldLogAntiAbuse) return;

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
  },

  _getStrengthBonusPercent(strengthStat, skillTreeStatMultiplier) {
    if (strengthStat <= 0) return 0;
    let strengthBonus = 0;
    if (strengthStat <= 20) {
      strengthBonus = strengthStat * 2;
    } else {
      strengthBonus = 40 + (strengthStat - 20) * 0.5;
    }
    if (skillTreeStatMultiplier) {
      strengthBonus *= skillTreeStatMultiplier;
    }
    return strengthBonus;
  },

  _getIntelligenceTierBonus(messageLength) {
    const intTierBonuses = [
      { threshold: 400, bonus: 12 },
      { threshold: 200, bonus: 7 },
      { threshold: 100, bonus: 3 },
    ];
    for (let i = 0; i < intTierBonuses.length; i++) {
      const tier = intTierBonuses[i];
      if (messageLength >= tier.threshold) return tier;
    }
    return null;
  },

  _getIntelligenceBonusPercent(messageLength, intelligenceStat, skillTreeStatMultiplier) {
    if (intelligenceStat <= 0) return 0;

    const applicableTier = this._getIntelligenceTierBonus(messageLength);
    if (!applicableTier) return 0;

    const bonusPerPoint = applicableTier.bonus;
    const intelligenceBonus =
      intelligenceStat <= 15
        ? intelligenceStat * bonusPerPoint
        : 15 * bonusPerPoint + (intelligenceStat - 15) * (bonusPerPoint / 5);

    const adjustedBonus = skillTreeStatMultiplier
      ? intelligenceBonus * skillTreeStatMultiplier
      : intelligenceBonus;

    this.debugLog('INT_TIER_BONUS', 'Intelligence tier bonus applied', {
      messageLength,
      tier: applicableTier.threshold,
      bonusPerPoint,
      intelligenceStat,
      intelligenceBonus: adjustedBonus.toFixed(1) + '%',
    });

    return adjustedBonus;
  },

  _collectXpBonusState(messageLength) {
    const activeBuffs = this.getActiveSkillBuffs();
    const skillBonuses = this.getSkillTreeBonuses();

    let totalPercentageBonus = 0;
    this._skillTreeStatMultiplier = null;
    if (skillBonuses?.xpBonus > 0) {
      totalPercentageBonus += skillBonuses.xpBonus * 100;
    }
    if (messageLength > 200 && skillBonuses?.longMsgBonus > 0) {
      totalPercentageBonus += skillBonuses.longMsgBonus * 100;
    }
    if (skillBonuses?.allStatBonus > 0) {
      this._skillTreeStatMultiplier = 1 + skillBonuses.allStatBonus;
    }
    if (activeBuffs?.allStatMultiplier > 1.0) {
      this._skillTreeStatMultiplier =
        (this._skillTreeStatMultiplier || 1.0) * activeBuffs.allStatMultiplier;
    }

    const strengthStat = this.settings.stats.strength || 0;
    totalPercentageBonus += this._getStrengthBonusPercent(
      strengthStat,
      this._skillTreeStatMultiplier
    );

    const intelligenceStat = this.settings.stats.intelligence || 0;
    totalPercentageBonus += this._getIntelligenceBonusPercent(
      messageLength,
      intelligenceStat,
      this._skillTreeStatMultiplier
    );

    return {
      activeBuffs,
      skillBonuses,
      totalPercentageBonus,
    };
  },

  _getMilestoneMultiplier(currentLevel) {
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

    if (
      this._cache.milestoneMultiplierLevel === currentLevel &&
      this._cache.milestoneMultiplier !== null
    ) {
      return this._cache.milestoneMultiplier;
    }

    const milestoneMultiplier = Object.entries(milestoneMultipliers).reduce(
      (highest, [milestone, multiplier]) => (currentLevel >= parseInt(milestone, 10) ? multiplier : highest),
      1.0
    );
    this._cache.milestoneMultiplier = milestoneMultiplier;
    this._cache.milestoneMultiplierLevel = currentLevel;
    return milestoneMultiplier;
  },

  _applyNonCritXpLayers(baseXP, totalPercentageBonus, currentLevel, activeBuffs) {
    const cappedPercentageBonus = Math.min(totalPercentageBonus, 220);
    let xp = Math.round(baseXP * (1 + cappedPercentageBonus / 100));

    const titleBonus = this.getActiveTitleBonus();
    const titleXpCap = this.getTitleXpCapForLevel(currentLevel);
    const appliedTitleXpBonus = Math.min(Math.max(0, titleBonus.xp || 0), titleXpCap);
    if (appliedTitleXpBonus > 0) {
      xp = Math.round(xp * (1 + appliedTitleXpBonus));
    }

    if (activeBuffs?.xpMultiplier > 1.0) {
      xp = Math.round(xp * activeBuffs.xpMultiplier);
    }

    const milestoneMultiplier = this._getMilestoneMultiplier(currentLevel);
    if (milestoneMultiplier > 1.0) {
      xp = Math.round(xp * milestoneMultiplier);
    }

    let levelReductionMultiplier = null;
    if (currentLevel > 10) {
      const rawMultiplier = 1 / (1 + (currentLevel - 10) * 0.01);
      levelReductionMultiplier = Math.max(rawMultiplier, 0.6);
      xp = Math.round(xp * levelReductionMultiplier);
      xp = Math.max(xp, 10);
    }

    return {
      xp,
      cappedPercentageBonus,
      appliedTitleXpBonus,
      titleXpCap,
      milestoneMultiplier,
      levelReductionMultiplier,
    };
  },

  _resolveCritBonusForAward(skillBonuses, activeBuffs) {
    let activeSkillForcedCrit = false;
    if (activeBuffs?.guaranteedCrit) {
      const consumed = this.consumeActiveSkillCharge('mutilate');
      if (consumed) activeSkillForcedCrit = true;
    }

    let critBonus = this.checkCriticalHitBonus();
    const passiveSkillCritChance = Math.min(0.35, Math.max(0, Number(skillBonuses?.critBonus || 0)));
    const activeSkillCritChance = Math.min(
      0.5,
      Math.max(0, Number(activeBuffs?.critChanceBonus || 0))
    );
    const supplementalCritChance = Math.min(0.85, passiveSkillCritChance + activeSkillCritChance);

    if (critBonus <= 0 && supplementalCritChance > 0 && Math.random() < supplementalCritChance) {
      const agilityStat = this.settings.stats?.agility || 0;
      critBonus = Math.min(1.2, 0.2 + Math.min(0.75, agilityStat * 0.006));
    }

    if (activeSkillForcedCrit && critBonus <= 0) {
      const agilityStat = this.settings.stats?.agility || 0;
      critBonus = Math.min(1.2, 0.2 + Math.min(0.75, agilityStat * 0.006));
    }

    return critBonus;
  },

  _applyCriticalHitXpLayer(xp, critBonus) {
    if (critBonus <= 0) {
      return {
        xp,
        wasCrit: false,
      };
    }

    const baseXPBeforeCrit = xp;
    let critMultiplier = critBonus;
    let isMegaCrit = false;
    let comboFlatBonusXP = 0;

    const activeTitle = this.settings.achievements?.activeTitle;
    if (activeTitle === 'Dagger Throw Master') {
      const agilityStat = this.settings.stats?.agility || 0;
      const megaCritChance = Math.min(0.2, agilityStat * 0.001);
      const roll = Math.random();
      if (roll < megaCritChance) {
        critMultiplier = 149;
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

    xp = Math.round(xp * (1 + critMultiplier));

    const critBurstInfo = this._cache?.lastAppliedCritBurst || null;
    if (!isMegaCrit && critBurstInfo?.burstHits > 1) {
      const effectiveBurstHits = Math.min(20, Number(critBurstInfo.effectiveBurstHits || 1));
      const extraRatio = Math.min(
        0.18,
        Math.log2(effectiveBurstHits + 1) * 0.02 + (Math.min(12, effectiveBurstHits) - 1) * 0.006
      );
      const cappedFlatBonus = Math.max(4, Math.round(baseXPBeforeCrit * 0.18));
      comboFlatBonusXP = Math.min(
        cappedFlatBonus,
        Math.max(2, Math.round(baseXPBeforeCrit * extraRatio))
      );
      xp += comboFlatBonusXP;
    }

    if (!this.settings.activity.critsLanded) {
      this.settings.activity.critsLanded = 0;
    }
    this.settings.activity.critsLanded++;

    this.debugLog('AWARD_XP_CRIT', isMegaCrit ? 'MEGA CRITICAL HIT!' : 'Critical hit bonus applied', {
      critBonus: (critBonus * 100).toFixed(0) + '%',
      baseXPBeforeCrit,
      critBonusXP: xp - baseXPBeforeCrit,
      comboFlatBonusXP,
      burstHits: this._cache?.lastAppliedCritBurst?.burstHits || 1,
      finalXP: xp,
      totalCrits: this.settings.activity.critsLanded,
      isMegaCrit,
    });

    return {
      xp,
      wasCrit: true,
    };
  },

  _applyFinalXpLayers(xp, currentLevel, activeBuffs) {
    const rankMultiplier = this.getRankMultiplier();
    xp = Math.round(xp * rankMultiplier);

    if (activeBuffs?.globalMultiplier > 1.0) {
      xp = Math.round(xp * activeBuffs.globalMultiplier);
    }

    xp = this.applyXpGovernors(xp, currentLevel);
    xp = Math.round(xp);

    return {
      xp,
      rankMultiplier,
    };
  },

  _applyAwardedXpToState(xp) {
    this.ensureValidTotalXP('AWARD_XP');

    const oldLevel = this.settings.level;
    const oldTotalXP = this.settings.totalXP;
    this.settings.xp += xp;
    this.settings.totalXP += xp;

    this.invalidatePerformanceCache(['currentLevel']);

    const newLevelInfo = this.getCurrentLevel();
    if (this.settings.level !== newLevelInfo.level) {
      this.settings.level = newLevelInfo.level;
      this.settings.xp = newLevelInfo.xp;
    } else {
      this.settings.xp = newLevelInfo.xp;
    }

    return {
      oldLevel,
      oldTotalXP,
      newLevelInfo,
    };
  },

  awardXP(messageText, messageLength, messageContext = null) {
    try {
      this.debugLog('AWARD_XP', 'Calculating XP', { messageLength });

      const currentLevel = this.getCurrentLevel().level;
      const baseXP = this.calculateBaseXpForMessage({ messageText, messageLength, messageContext });
      this._logAntiAbuseMeta(this._lastAntiAbuseMeta);

      const bonusState = this._collectXpBonusState(messageLength);
      const nonCritResult = this._applyNonCritXpLayers(
        baseXP,
        bonusState.totalPercentageBonus,
        currentLevel,
        bonusState.activeBuffs
      );
      const critBonus = this._resolveCritBonusForAward(
        bonusState.skillBonuses,
        bonusState.activeBuffs
      );
      const critResult = this._applyCriticalHitXpLayer(nonCritResult.xp, critBonus);
      const finalResult = this._applyFinalXpLayers(
        critResult.xp,
        currentLevel,
        bonusState.activeBuffs
      );
      const skillTreeMultiplier = this._skillTreeStatMultiplier || 1.0;

      this.debugLog('AWARD_XP', 'XP calculated', {
        baseXP,
        totalPercentageBonus: bonusState.totalPercentageBonus.toFixed(1) + '%',
        cappedPercentageBonus: nonCritResult.cappedPercentageBonus.toFixed(1) + '%',
        titleXpApplied: `${(nonCritResult.appliedTitleXpBonus * 100).toFixed(1)}% (cap ${(nonCritResult.titleXpCap * 100).toFixed(0)}%)`,
        skillTreeMultiplier:
          skillTreeMultiplier > 1.0 ? `${((skillTreeMultiplier - 1) * 100).toFixed(1)}%` : 'None',
        milestoneMultiplier:
          nonCritResult.milestoneMultiplier > 1.0
            ? `${((nonCritResult.milestoneMultiplier - 1) * 100).toFixed(0)}%`
            : 'None',
        levelReduction:
          nonCritResult.levelReductionMultiplier != null
            ? (nonCritResult.levelReductionMultiplier * 100).toFixed(1) + '%'
            : 'N/A',
        rankMultiplier: `${((finalResult.rankMultiplier - 1) * 100).toFixed(0)}%`,
        finalXP: finalResult.xp,
        messageLength,
        currentLevel,
      });

      const stateResult = this._applyAwardedXpToState(finalResult.xp);
      this.debugLog('AWARD_XP', 'XP added', {
        xpAwarded: finalResult.xp,
        oldTotalXP: stateResult.oldTotalXP,
        newTotalXP: this.settings.totalXP,
        oldLevel: stateResult.oldLevel,
        newLevel: this.settings.level,
        currentXP: this.settings.xp,
        xpRequired: stateResult.newLevelInfo.xpRequired,
      });

      this.emitXPChanged();
      this.saveSettings();
      this.debugLog('AWARD_XP', 'Settings save requested after XP gain');

      try {
        this.checkLevelUp(stateResult.oldLevel);
        if ((this.settings.level || 1) === stateResult.oldLevel) {
          this.checkRankPromotion();
        }
        this.debugLog('AWARD_XP', 'Level and rank checks completed');
      } catch (error) {
        this.debugError('AWARD_XP', error, { phase: 'level_rank_check' });
      }
  
      try {
        this.shareShadowXP(finalResult.xp, 'message');
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
