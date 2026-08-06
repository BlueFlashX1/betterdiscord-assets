/**
 * xp-processing — turns a Discord message into XP, levels and stat growth.
 * Object.assign'd onto the SoloLevelingStats prototype. Runs PER MESSAGE, so
 * everything here is written for that budget (note the hoisted tables below —
 * they used to be reallocated on every message).
 *
 * ── FLOW ─────────────────────────────────────────────────────────────────
 *   message
 *     -> _resolveMessageProcessingContext        channel/thread context
 *     -> dedup gate: _buildRecentMessageHash + _isRecentMessageDuplicate
 *          (normalised text hash in a rolling window — stops copy-paste and
 *           edit-spam farming; _pruneRecentMessages keeps the map bounded)
 *     -> XP assembly in calculation-bonuses.js (quality/type/time/streak,
 *          then the soft+hard governors)
 *     -> level reduction multiplier: 1/(1+(level-10)*0.01), floor 0.6x
 *     -> apply to totalXP  ... unless _routeShadowMonarchXp intercepts
 *
 * ── THE SHADOW MONARCH INTERCEPT (read before touching rank thresholds) ──
 * _routeShadowMonarchXp fires when settings.rank === 'Shadow Monarch'. It
 * deliberately does NOT touch settings.xp / settings.totalXP — because level
 * is DERIVED from totalXP (progression-read-model), adding to it would keep
 * levelling past the cap. Instead XP is converted into architect favour and
 * minted into base stats.
 *
 * Consequence, and it is not local: once the rank is held, LEVEL FREEZES
 * PERMANENTLY. That is why the level-2000 Shadow Monarch threshold cannot
 * simply be lowered — 26 achievements are gated on levels above 560, and they
 * would become permanently unreachable the moment the rank was granted
 * earlier. Pace the endgame through XP rewards, not through that threshold.
 *
 * ── OTHER INVARIANTS ─────────────────────────────────────────────────────
 *  - Per-message XP SHRINKS with level while the caps in calculation-bonuses
 *    RISE with it. Both halves are needed to reason about pacing.
 *  - The dedup map is bounded by pruning, not by size — an unbounded map here
 *    is a leak that grows with chat volume.
 *  - Stat bonuses flatten above their thresholds (strength 20, intelligence
 *    15); stats keep growing, their XP contribution does not.
 */
// PERF: hoist the intelligence-tier bonus table once at module load.
// Previously allocated 1 array + 3 object literals on every message via
// _getIntelligenceTierBonus → _collectXpBonusState → awardXP → processMessageSent.
const INT_TIER_BONUSES = Object.freeze([
  Object.freeze({ threshold: 400, bonus: 12 }),
  Object.freeze({ threshold: 200, bonus: 7 }),
  Object.freeze({ threshold: 100, bonus: 3 }),
]);

// PERF: pre-sorted descending [level, multiplier] tuples for the
// milestone multiplier lookup. Hoisted to avoid the per-cache-miss
// object literal + Object.entries + reduce that the previous
// implementation allocated. Descending order lets the lookup early-exit
// on the first level threshold met.
const MILESTONE_MULTIPLIERS = Object.freeze([
  Object.freeze([2000, 1.68]),
  Object.freeze([1500, 1.60]),
  Object.freeze([1000, 1.54]),
  Object.freeze([700, 1.48]),
  Object.freeze([500, 1.43]),
  Object.freeze([400, 1.38]),
  Object.freeze([300, 1.33]),
  Object.freeze([200, 1.27]),
  Object.freeze([150, 1.22]),
  Object.freeze([100, 1.18]),
  Object.freeze([75, 1.14]),
  Object.freeze([50, 1.10]),
  Object.freeze([25, 1.06]),
]);

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
    const messageHash = this.hashString(this._normalizeForDedup(messageText).substring(0, 2000));
    return `msg_${channelScope}_${messageHash}`;
  },

  // The same message reaches processMessageSent from two triggers whose text
  // representation differs: the input handler reads the composer DOM (mentions
  // render as "@Name", channels "#name", custom emoji ":name:"), while the
  // FluxDispatcher path uses msg.content (raw markdown: "<@123>", "<#456>",
  // "<:name:789>"). Hashing raw text let the same message hash two different
  // ways, so the recent-message dedup missed it and awarded XP twice. Strip
  // Discord entity tokens in BOTH raw and rendered forms so the two triggers
  // converge on one dedup key. Over-stripping (e.g. a literal "@word") is
  // symmetric across both paths, so it can only cause a rare false-dedup
  // (one message's XP skipped) — never the double-count it prevents.
  _normalizeForDedup(text) {
    if (typeof text !== 'string' || text.length === 0) return '';
    return text
      .replace(/<a?:\w+:\d+>/g, '')          // raw custom emoji
      .replace(/<@[!&]?\d+>/g, '')            // raw user / role mention
      .replace(/<#\d+>/g, '')                 // raw channel link
      .replace(/<t:\d+(?::[a-zA-Z])?>/g, '')  // raw timestamp
      .replace(/@[^\s]+/g, '')                // rendered mention (@Name)
      .replace(/#[^\s]+/g, '')                // rendered channel (#name)
      .replace(/:\w+:/g, '')                  // rendered / custom emoji (:name:)
      .replace(/\s+/g, ' ')
      .trim();
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

  // SHADOW MONARCH PERK (Blessing of Kandiaru -> Kandiaru's Favor, player-exclusive):
  // at SM the player is level/rank capped, so XP no longer levels. All XP is routed
  // here and converted into base stat points (default 1 point per 1,000,000 XP, tunable
  // via settings.architectFavorRate). Returns true if the XP was consumed — the caller
  // must then SKIP the normal level/totalXP mutation. Deliberately does NOT touch
  // settings.xp or settings.totalXP: getCurrentLevel() derives level from totalXP, so
  // adding to it would keep leveling past the cap.
  _routeShadowMonarchXp(xpAmount) {
    if (this.settings?.rank !== 'Shadow Monarch') return false;
    const amt = Math.max(0, Math.floor(Number(xpAmount) || 0));
    if (amt <= 0) return true;
    const rate = Math.max(1, Math.floor(Number(this.settings.architectFavorRate) || 1000000));
    const pool = (Number(this.settings.architectFavorPool) || 0) + amt;
    const minted = Math.floor(pool / rate);
    this.settings.architectFavorPool = pool - minted * rate;
    this.settings.architectFavorConvertedXP =
      (Number(this.settings.architectFavorConvertedXP) || 0) + amt;
    if (minted > 0) this._allocateBalancedBaseStats(minted);
    return true;
  },

  // Auto-balance: feed each minted point to the current lowest BASE stat, re-evaluating
  // after every point so the stats converge then climb together as a block. Ties resolve
  // in the fixed order STR > AGI > INT > VIT > PER. Reuses allocateStatPoints so HP/mana/
  // crit recompute, caches invalidate, and the UI/save run through the proven path.
  _allocateBalancedBaseStats(points) {
    const stats = this.settings?.stats;
    const n = Math.max(0, Math.floor(Number(points) || 0));
    if (!stats || n <= 0) return;
    const keys = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
    // Grant exactly the minted points, then auto-spend exactly that many into the lowest
    // base stat (any pre-existing manually-saved points stay untouched).
    this.settings.unallocatedStatPoints =
      (Number(this.settings.unallocatedStatPoints) || 0) + n;
    for (let i = 0; i < n; i++) {
      if ((Number(this.settings.unallocatedStatPoints) || 0) <= 0) break;
      let lowest = keys[0];
      for (const k of keys) {
        if ((Number(stats[k]) || 0) < (Number(stats[lowest]) || 0)) lowest = k;
      }
      // Suppress per-iteration save and UI refresh — batch them after the loop.
      this.allocateStatPoints(lowest, 1, { saveImmediately: false, refreshUI: false });
    }
    // One coalesced save + UI update for all minted points.
    this.applyStatMutationEffects({ saveImmediately: true, refreshUI: true, recomputeHpMana: false });
  },

  _applyExternalXpToState(xpAmount, source) {
    this.ensureValidTotalXP(`ADD_XP:${source}`);

    const oldLevel = this.settings.level || 1;
    const oldTotalXP = this.settings.totalXP || 0;

    // Kandiaru's Favor: at Shadow Monarch, divert XP into base-stat conversion.
    if (this._routeShadowMonarchXp(xpAmount)) {
      return { oldLevel, oldTotalXP };
    }

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
    for (let i = 0; i < INT_TIER_BONUSES.length; i++) {
      const tier = INT_TIER_BONUSES[i];
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
    const hiddenBlessings = this.getHiddenBlessingBonuses?.();

    let totalPercentageBonus = 0;
    this._skillTreeStatMultiplier = null;
    if (skillBonuses?.xpBonus > 0) {
      totalPercentageBonus += skillBonuses.xpBonus * 100;
    }
    if (hiddenBlessings?.xpBonus > 0) {
      totalPercentageBonus += hiddenBlessings.xpBonus * 100;
    }
    if (skillBonuses?.allStatBonus > 0) {
      this._skillTreeStatMultiplier = 1 + skillBonuses.allStatBonus;
    }
    if (activeBuffs?.allStatMultiplier > 1.0) {
      this._skillTreeStatMultiplier =
        (this._skillTreeStatMultiplier || 1.0) * activeBuffs.allStatMultiplier;
    }

    const strengthStat = this.settings.stats?.strength || 0;
    totalPercentageBonus += this._getStrengthBonusPercent(
      strengthStat,
      this._skillTreeStatMultiplier
    );

    const intelligenceStat = this.settings.stats?.intelligence || 0;
    totalPercentageBonus += this._getIntelligenceBonusPercent(
      messageLength,
      intelligenceStat,
      this._skillTreeStatMultiplier
    );

    return {
      activeBuffs,
      hiddenBlessings,
      skillBonuses,
      totalPercentageBonus,
    };
  },

  _getMilestoneMultiplier(currentLevel) {
    if (
      this._cache.milestoneMultiplierLevel === currentLevel &&
      this._cache.milestoneMultiplier !== null
    ) {
      return this._cache.milestoneMultiplier;
    }

    // Descending scan with early exit: MILESTONE_MULTIPLIERS is pre-sorted
    // high-to-low, so the first threshold met is the correct answer.
    let multiplier = 1.0;
    for (let i = 0; i < MILESTONE_MULTIPLIERS.length; i++) {
      if (currentLevel >= MILESTONE_MULTIPLIERS[i][0]) {
        multiplier = MILESTONE_MULTIPLIERS[i][1];
        break;
      }
    }
    this._cache.milestoneMultiplier = multiplier;
    this._cache.milestoneMultiplierLevel = currentLevel;
    return multiplier;
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

    let levelReductionMultiplier = null;
    if (currentLevel > 10) {
      const rawMultiplier = 1 / (1 + (currentLevel - 10) * 0.01);
      levelReductionMultiplier = Math.max(rawMultiplier, 0.6);
    }

    // S4 (audit): combine milestone × reducer so a milestone bonus can
    // never produce a net multiplier below 1.0×. Previously milestone
    // 1.54× × reducer 0.6× = 0.924× — mathematically more than the
    // 0.6× sub-milestone rate, but the advertised "+54% milestone"
    // producing 0.924× net felt like a penalty. Floor the reducer at
    // 1/milestone when a milestone bonus is active so combined ≥ 1.0×.
    let effectiveReducer = levelReductionMultiplier;
    if (milestoneMultiplier > 1.0 && levelReductionMultiplier !== null) {
      effectiveReducer = Math.max(levelReductionMultiplier, 1.0 / milestoneMultiplier);
    }

    if (milestoneMultiplier > 1.0) {
      xp = Math.round(xp * milestoneMultiplier);
    }
    if (effectiveReducer !== null) {
      xp = Math.round(xp * effectiveReducer);
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
    const activeSkillForcedCrit = activeBuffs?.guaranteedCrit === true;

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

    // Kandiaru's Favor: at Shadow Monarch, divert message XP into base-stat conversion.
    if (this._routeShadowMonarchXp(xp)) {
      return { oldLevel, oldTotalXP, newLevelInfo: this.getCurrentLevel() };
    }

    this.settings.xp = (this.settings.xp || 0) + xp;
    this.settings.totalXP = (this.settings.totalXP || 0) + xp;

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
      // saveSettings() is NOT called here: checkLevelUp always saves (both level-up and no-level-up paths).
      this.debugLog('AWARD_XP', 'XP applied; checkLevelUp will persist');

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
