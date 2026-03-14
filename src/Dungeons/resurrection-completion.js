module.exports = {
  getResurrectionCost(shadowRank) {
    // Flat mana cost per shadow rank (from precomputed lookup table).
    // Higher user rank = steeper discount. At Monarch+ ranks, resurrection is nearly free.
    // E=0% → A=25% → S=40% → SS=55% → SSS=65% → NH=75% → Monarch=82% → Monarch+=88% → SM=92%
    const rankIndex = this.getRankIndexValue(shadowRank);
    const flatCost = this._flatResCostTable?.[rankIndex] ?? 10;

    const userRank = this.soloLevelingStats?.settings?.rank || 'E';
    const userRankIndex = this.getRankIndexValue(userRank);
    const maxRankIndex = (this.settings.dungeonRanks?.length || 12) - 1;
    // Exponential discount curve: ramps slowly at low ranks, aggressively at high ranks
    // ratio^0.6 × 0.92 → Monarch(10/12)^0.6 × 0.92 = 0.82 (82% off), SM = 0.92 (92% off)
    const ratio = maxRankIndex > 0 ? userRankIndex / maxRankIndex : 0;
    const discount = Math.pow(ratio, 0.6) * 0.92;

    return Math.max(1, Math.ceil(flatCost * (1 - discount)));
  },

  async attemptAutoResurrection(shadow, channelKey) {
    if (!shadow || !this.soloLevelingStats) return false;

    const shadowRank = shadow.rank || 'E';
    const manaCost = this.getResurrectionCost(shadowRank);

    // Validate mana cost calculation
    if (!manaCost || manaCost <= 0) {
      this.errorLog(`Invalid resurrection cost for rank ${shadowRank}: ${manaCost}`);
      return false;
    }

    // CRITICAL: SYNC MANA FROM SoloLevelingStats FIRST (get freshest value!)
    // Regeneration updates SoloLevelingStats, so read from there first
    this.syncManaFromStats();

    // Validate current mana is a valid number
    if (typeof this.settings.userMana !== 'number' || isNaN(this.settings.userMana)) {
      this.errorLog(`Invalid userMana value: ${this.settings.userMana}`);
      this.settings.userMana = this.settings.userMaxMana || 0;
    }

    // Get dungeon reference for resurrection tracking
    let dungeon = this.activeDungeons.get(channelKey);

    // BUGFIX LOGIC-1: In parallel mode, check per-dungeon budget instead of shared userMana.
    // This prevents two concurrent dungeons from both reading the same balance and double-spending.
    const budgetAvailable = this._tickManaBudgetPerDungeon !== undefined
      ? this._tickManaBudgetPerDungeon - (dungeon?._tickManaUsed || 0)
      : this.settings.userMana;

    if (budgetAvailable < manaCost) {
      // Track failed attempts for this dungeon
      if (dungeon) {
        if (!dungeon.failedResurrections) dungeon.failedResurrections = 0;
        dungeon.failedResurrections++;

        // Award shadow essence on failed resurrection (1 essence per failure)
        try {
          if (typeof BdApi?.Events?.emit === 'function') {
            BdApi.Events.emit('Dungeons:awardEssence', { amount: 1 });
          }
        } catch (essenceError) {
          this.debugLog?.(`Failed to award shadow essence: ${essenceError.message}`);
        }

        // ANTI-SPAM: Show warning ONCE when mana hits 0, not every 50 failures
        if (!dungeon.lowManaWarningShown && this.settings.userMana === 0) {
          dungeon.lowManaWarningShown = true; // Flag to prevent spam
          const percent = Math.floor((this.settings.userMana / this.settings.userMaxMana) * 100);
          this.debugLog(
            `Low mana: cannot resurrect shadows. Mana: ${this.settings.userMana}/${this.settings.userMaxMana} (${percent}%)`
          );
          this.showToast(`No mana: shadow resurrections paused until mana regenerates.`, 'warning');
        }
      }

      return false;
    }

    // RESET LOW MANA WARNING if mana is recovered
    if (dungeon && dungeon.lowManaWarningShown && this.settings.userMana >= manaCost) {
      dungeon.lowManaWarningShown = false; // Can show warning again if mana depletes
    }

    // BUGFIX LOGIC-1: Use per-dungeon mana budget during parallel ticks to prevent race conditions.
    // When multiple dungeons run via Promise.all, each dungeon tracks its own spend via dungeon._tickManaUsed.
    // The actual this.settings.userMana deduction happens atomically after Promise.all completes.
    const manaBefore = this.settings.userMana;

    if (this._tickManaBudgetPerDungeon !== undefined) {
      // Parallel mode: track per-dungeon spend, defer actual deduction to post-Promise.all
      dungeon._tickManaUsed = (dungeon._tickManaUsed || 0) + manaCost;
    } else {
      // Single-dungeon mode: deduct directly (no race possible)
      this.settings.userMana -= manaCost;
    }
    let manaAfter = this.settings.userMana;
    if (this._tickManaBudgetPerDungeon !== undefined) {
      // In parallel mode mana is reconciled after Promise.all; use projected post-spend value for logs.
      manaAfter = Math.max(0, manaBefore - manaCost);
    }

    // Ensure mana doesn't go negative (safety check — only in single-dungeon mode)
    if (this._tickManaBudgetPerDungeon === undefined && this.settings.userMana < 0) {
      this.errorLog(
        `CRITICAL: Mana went negative! Resetting to 0. Before: ${manaBefore}, Cost: ${manaCost}`
      );
      this.settings.userMana = 0;
    }

    // Verify mana was actually deducted (only meaningful in single-dungeon mode)
    if (this._tickManaBudgetPerDungeon === undefined) {
      manaAfter = this.settings.userMana;
      const actualDeduction = manaBefore - manaAfter;
      if (actualDeduction !== manaCost) {
        this.debugLog(`Mana deduction mismatch! Expected: ${manaCost}, Actual: ${actualDeduction}`);
      }
    }

    // BUGFIX LOGIC-1: Skip mana sync during parallel mode — userMana is reconciled post-Promise.all
    if (this._tickManaBudgetPerDungeon === undefined) {
      this.pushManaToStats(false);
    }
    this.startRegeneration(); // PERF: restart regen if it was paused

    // Track resurrection (reuse existing dungeon variable)
    if (dungeon) {
      dungeon.shadowRevives = (dungeon.shadowRevives || 0) + 1;

      if (!dungeon.successfulResurrections) dungeon.successfulResurrections = 0;
      dungeon.successfulResurrections++;

      // Log major resurrection milestones only
      if (
        dungeon.successfulResurrections % 100 === 0 ||
        dungeon.successfulResurrections === 50 ||
        dungeon.successfulResurrections === 200 ||
        dungeon.successfulResurrections === 500
      ) {
        const percent = Math.floor((manaAfter / this.settings.userMaxMana) * 100);
        this.settings.debug && console.log(
          `[Dungeons] ${dungeon.successfulResurrections} shadows resurrected. Mana: ${manaAfter}/${this.settings.userMaxMana} (${percent}%)`
        );
      }
    }

    // Combat-loop dirty flush handles persistence; avoids per-resurrection save churn.
    this.markCombatSettingsDirty('auto-resurrection');

    return true;
  },

  completeDungeon(channelKey, reason) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;

    if (dungeon._completing) return; // Prevent concurrent completion
    dungeon._completing = true;
    dungeon._completingStartedAt = Date.now(); // BUGFIX LOGIC-9: Timestamp for stranded dungeon recovery
    let hadShadowsDeployed = false;
    let corpsePileSnapshot = [];
    let dungeonSnapshot = null;
    let shadowDeathCount = 0;

    // PHASE A: Synchronous cleanup (dungeon disappears from UI immediately)
    try {

    // Track end time for spawn cooldowns
    this.settings.lastDungeonEndTime || (this.settings.lastDungeonEndTime = {});
    this.settings.lastDungeonEndTime[channelKey] = Date.now();

    hadShadowsDeployed = Boolean(dungeon.shadowsDeployed);
    dungeon.completed = reason !== 'timeout';
    dungeon.failed = reason === 'timeout';

    // Capture deploy timestamps BEFORE clearing (Phase B needs them for combat hours)
    const originalDeployedAt = dungeon.deployedAt;
    const originalBossGateDeployedAt = dungeon.bossGate?.deployedAt;

    dungeon.shadowsDeployed = false;
    dungeon.deployedAt = null;
    if (dungeon.bossGate && typeof dungeon.bossGate === 'object') {
      dungeon.bossGate.deployedAt = null;
      dungeon.bossGate.unlockedAt = null;
    }
    this.shadowAllocations.delete(channelKey);
    this._markAllocationDirty(`dungeon-complete:${reason}`);

    // Snapshot the corpse pile, then clear the dungeon's copy
    corpsePileSnapshot = dungeon.corpsePile || [];
    dungeon.corpsePile = [];

    // Build a lightweight snapshot with all data Phase B needs.
    // After Phase A deletes the dungeon from activeDungeons, the original object
    // becomes unreachable and will be GC'd — the snapshot keeps only shallow copies.
      dungeonSnapshot = {
        id: dungeon.id,
        name: dungeon.name,
        rank: dungeon.rank,
        _xpBatchKey: this._resolveDungeonXPBatchKey(channelKey, dungeon),
        channelName: dungeon.channelName,
        guildName: dungeon.guildName,
        userParticipating: dungeon.userParticipating,
        shadowContributions: { ...dungeon.shadowContributions },
        boss: dungeon.boss ? { ...dungeon.boss } : null,
      bossGate: dungeon.bossGate ? { ...dungeon.bossGate, deployedAt: originalBossGateDeployedAt } : null,
      deployedAt: originalDeployedAt,
        startTime: dungeon.startTime,
        mobs: { killed: dungeon.mobs?.killed || 0 },
        pendingUserMobXP: Number.isFinite(Number(dungeon.pendingUserMobXP))
          ? Math.max(0, Math.floor(Number(dungeon.pendingUserMobXP)))
          : 0,
        pendingUserMobKills: Number.isFinite(Number(dungeon.pendingUserMobKills))
          ? Math.max(0, Math.floor(Number(dungeon.pendingUserMobKills)))
          : 0,
        shadowRevives: dungeon.shadowRevives || 0,
        userDamageDealt: dungeon.userDamageDealt || 0,
        beastFamilies: dungeon.beastFamilies,
        combatAnalytics: dungeon.combatAnalytics ? { ...dungeon.combatAnalytics } : {},
      };

    // Capture shadow death count before we clear it
    shadowDeathCount = this.deadShadows.get(channelKey)?.size || 0;

    // Stop all combat systems
    this.stopShadowAttacks(channelKey);
    this.stopBossAttacks(channelKey);
    this.stopMobAttacks(channelKey);
    this.stopMobKillNotifications(channelKey);
    this.stopMobSpawning(channelKey);

    // Remove UI elements
    this.removeDungeonIndicator(channelKey);
    this.removeBossHPBar(channelKey);
    document
      .querySelectorAll(`.dungeon-boss-hp-container[data-channel-key="${channelKey}"]`)
      .forEach((el) => {
        el.remove();
      });

    // Reset user active dungeon status (allows entering new dungeons)
    if (this.settings.userActiveDungeon === channelKey) {
      this.settings.userActiveDungeon = null;
    }

    this.channelLocks.delete(channelKey);

    // KEY LINE: Dungeon disappears from UI
    this.activeDungeons.delete(channelKey);

    // Clean up all remaining per-channel runtime state.
    this._cleanupPerChannelRuntimeState(channelKey);

    this.saveSettings();
    } catch (phaseAError) {
      // BUGFIX LOGIC-9: Unset _completing so the dungeon isn't permanently stranded
      dungeon._completing = false;
      this.errorLog('CRITICAL', 'Phase A of completeDungeon failed — dungeon may be in inconsistent state', {
        channelKey, reason, error: phaseAError
      });
      return;
    }

    // PHASE B: Fire-and-forget background work (ARISE, XP, DB cleanup)
    this._completeDungeonBackground(
      channelKey, reason, dungeonSnapshot, corpsePileSnapshot,
      hadShadowsDeployed, shadowDeathCount
    ).catch((err) => {
      this.errorLog('Background dungeon completion failed', err);
      try { this.showToast('Dungeon processing error — XP/ARISE may be incomplete.', 'error'); } catch (_) {}
    });
  },

  _cleanupPerChannelRuntimeState(channelKey) {
    if (this.settings.mobKillNotifications) delete this.settings.mobKillNotifications[channelKey];
    this.deadShadows?.delete?.(channelKey);
    this.clearRoleCombatState(channelKey);
    this.clearCombatStatusState?.(channelKey);
    this.extractionInProgress?.delete?.(channelKey);
    this._lastShadowAttackTime?.delete?.(channelKey);
    this._lastBossAttackTime?.delete?.(channelKey);
    this._lastMobAttackTime?.delete?.(channelKey);

    // Clean up orphan per-channel Map entries (multi-dungeon leak prevention)
    this._ariseButtonRefs?.delete?.(channelKey);
    this._bossBarLayoutThrottle?.delete?.(channelKey);
    this._mobSpawnNextAt?.delete?.(channelKey);
    this._mobSpawnQueueNextAt?.delete?.(channelKey);
    this._spawnPipelineGuardAt?.delete?.(channelKey);
    this._mobContributionMissLogState?.delete?.(channelKey);
    this._lastRebalanceAt?.delete?.(channelKey);
    this._deployRebalanceInFlight?.delete?.(channelKey);
    this._allocationSummary?.delete?.(channelKey);
    this._mobCleanupCache?.delete?.(channelKey);
    delete this._lastHPBarUpdate?.[channelKey];
    delete this._mobCapWarningShown?.[channelKey];

    // Cancel pending dungeon save timer (prevents ghost saves on stale dungeon objects)
    // and remove from timeout tracking to prevent stale ID accumulation.
    if (this._dungeonSaveTimers?.has?.(channelKey)) {
      const timerId = this._dungeonSaveTimers.get(channelKey);
      this._timeouts?.delete?.(timerId);
      clearTimeout(timerId);
      this._dungeonSaveTimers.delete(channelKey);
    }

    if (this.extractionEvents) {
      const eventsToRemove = [];
      this.extractionEvents.forEach((_, key) => {
        key.includes(channelKey) && eventsToRemove.push(key);
      });
      eventsToRemove.forEach((key) => this.extractionEvents.delete(key));
    }
  },

  async _completeDungeonBackground(channelKey, reason, snap, corpsePileSnapshot, hadShadowsDeployed, shadowDeathCount) {
    if (!this.started) return; // Plugin disabled before Phase B could run
    const backgroundStartedAt = Date.now();
    const phaseTimings = {};
    const markPhase = (phaseKey, startedAt) => {
      phaseTimings[phaseKey] = Date.now() - startedAt;
    };

    // Collect summary stats
    const combatAnalytics = snap.combatAnalytics || {};
    const summaryStats = {
      dungeonName: snap.name,
      dungeonRank: snap.rank,
      userParticipated: snap.userParticipating,
      userXP: 0,
      shadowTotalXP: 0,
      shadowsLeveledUp: [],
      shadowsRankedUp: [],
      totalMobsKilled: snap.mobs.killed || 0,
      shadowDeaths: shadowDeathCount,
      shadowRevives: snap.shadowRevives || 0,
      reason: reason,
      totalBossDamage: combatAnalytics.totalBossDamage || 0,
      totalMobDamage: combatAnalytics.totalMobDamage || 0,
      shadowsAttackedBoss: combatAnalytics.shadowsAttackedBoss || 0,
      shadowsAttackedMobs: combatAnalytics.shadowsAttackedMobs || 0,
    };

    // Batched mob-kill XP grant
    let phaseStartAt = Date.now();
    const xpBatchKey = this._resolveDungeonXPBatchKey(channelKey, snap);
    const { pendingXP: pendingMobXP, pendingKills: pendingMobKills } =
      this._consumePendingDungeonMobXP(xpBatchKey, snap);
    if (pendingMobXP > 0) {
      if (
        this._grantUserDungeonXP(pendingMobXP, 'dungeon_mob_kill_batch', {
          channelKey,
          dungeonRank: snap.rank,
          reason,
          pendingMobKills,
        })
      ) {
        summaryStats.userXP += pendingMobXP;
      }
    }
    summaryStats.mobKillXP = pendingMobXP;
    summaryStats.mobKillsAwarded = pendingMobKills;
    markPhase('userMobBatchXpMs', phaseStartAt);

    // User XP calculation + early boss ARISE UI
    phaseStartAt = Date.now();
    const rankIndex = this.getRankIndexValue(snap.rank);

    if (reason === 'complete') {
      if (this.soloLevelingStats) {
        const completionXP = 100 + rankIndex * 50;
        if (
          this._grantUserDungeonXP(completionXP, 'dungeon_complete', {
            channelKey,
            dungeonRank: snap.rank,
            reason,
          })
        ) {
          summaryStats.userXP += completionXP;
        }
      }
    }
    if (reason === 'boss') {
      const actualBossDamage = summaryStats.totalBossDamage || 0;
      const actualMobsKilled = summaryStats.totalMobsKilled || 0;
      const userDealtDamage = (snap.userDamageDealt || 0) > 0;
      if (actualBossDamage === 0 && actualMobsKilled === 0 && !userDealtDamage) {
        this.debugLog(
          'XP',
          `XP denied: "${snap.name}" [${snap.rank}] boss defeated with no user/shadow contribution`
        );
        this.showToast(`${snap.name}: No XP earned — no combat contribution.`, 'info');
      } else if (this.soloLevelingStats) {
        const bossXP = 200 + rankIndex * 100;
        if (
          this._grantUserDungeonXP(bossXP, 'dungeon_boss_kill', {
            channelKey,
            dungeonRank: snap.rank,
            reason,
            userParticipating: snap.userParticipating,
          })
        ) {
          summaryStats.userXP += bossXP;
        }
      }

      // Boss ARISE button (only if user participated) — show early for responsiveness
      if (snap.userParticipating) {
        this.defeatedBosses.set(channelKey, {
          boss: snap.boss,
          dungeon: snap,
          dungeonId: snap.id || snap.dungeonId, // BUGFIX LOGIC-5: Track which dungeon this boss belonged to
          timestamp: Date.now(),
        });
        this.showAriseButton(channelKey);
      }
    }
    markPhase('userBaseXpAndBossUiMs', phaseStartAt);

    // Yield before heavy post-processing to keep UI responsive
    await this._yieldToEventLoop(0);

    // ARISE Extraction (mob corpses)
    phaseStartAt = Date.now();
    let extractionResults = { extracted: 0, attempted: 0 };
    const pileSize = corpsePileSnapshot.length;
    if (
      snap.userParticipating &&
      (reason === 'boss' || reason === 'complete' || reason === 'timeout') &&
      pileSize > 0
    ) {
      this.settings.debug && console.log(`[Dungeons] ⚔️ ARISE TRIGGERED: "${snap.name}" [${snap.rank}] in #${snap.channelName || '?'} (${snap.guildName || '?'}) — ${reason}, ${pileSize} bodies awaiting extraction`);
      try {
        extractionResults = await this._processCorpsePile(channelKey, snap, corpsePileSnapshot);
        if (extractionResults.attempted > 0) {
          this.showToast(
            `ARISE: ${extractionResults.extracted} shadows from ${extractionResults.attempted} fallen enemies`,
            'info'
          );
        }
      } catch (error) {
        this.errorLog('Failed to process corpse pile extraction', error);
      }
    } else if (snap.userParticipating && pileSize === 0 && hadShadowsDeployed) {
      this.debugLog(
        'ARISE',
        `Corpse pile EMPTY for ${channelKey} — no enemies to extract (deployed: ${hadShadowsDeployed}, mobs killed: ${snap.mobs?.killed || 0})`
      );
    } else if (!snap.userParticipating) {
      this.settings.debug && console.log(`[Dungeons] ⚔️ ARISE SKIPPED: ${snap.name} — user was defeated, corpse pile cleaned up (${pileSize} bodies lost)`);
    }
    markPhase('corpseExtractionMs', phaseStartAt);

    // Shadow XP grants
    phaseStartAt = Date.now();
    if (reason === 'boss' || reason === 'complete') {
      const contributionEntries = Object.values(snap.shadowContributions || {}).filter((entry) => {
        const mobsKilled = Number(entry?.mobsKilled) || 0;
        const bossDamage = Number(entry?.bossDamage) || 0;
        return mobsKilled > 0 || bossDamage > 0;
      });
      if (
        hadShadowsDeployed &&
        (summaryStats.totalMobsKilled > 0 || summaryStats.totalBossDamage > 0) &&
        contributionEntries.length === 0
      ) {
        this.errorLog(
          true,
          'SHADOW_CONTRIBUTIONS_EMPTY: Expected shadow contribution records but found none at completion',
          {
            channelKey,
            reason,
            totalMobsKilled: summaryStats.totalMobsKilled,
            totalBossDamage: summaryStats.totalBossDamage,
          }
        );
      }

      const shadowResults = await this.grantShadowDungeonXP(channelKey, snap);
      if (shadowResults) {
        summaryStats.shadowTotalXP = shadowResults.totalXP;
        summaryStats.shadowsLeveledUp = shadowResults.leveledUp;
        summaryStats.shadowsRankedUp = shadowResults.rankedUp;
        if (shadowResults.deferredPostProcess) {
          this.showToast('Shadow XP growth processing in background...', 'info');
        }
      }
    }
    markPhase('shadowXpGrantMs', phaseStartAt);

    // Shadow XP mirror to user
    phaseStartAt = Date.now();
    if (summaryStats.shadowTotalXP > 0 && this.soloLevelingStats) {
      const shadowSharePercent = 1.0;
      const shadowShareXP = Math.floor(summaryStats.shadowTotalXP * shadowSharePercent);
      if (shadowShareXP > 0) {
        if (
          this._grantUserDungeonXP(shadowShareXP, 'dungeon_shadow_share', {
            channelKey,
            dungeonRank: snap.rank,
            shadowTotalXP: summaryStats.shadowTotalXP,
            sharePercent: shadowSharePercent,
          })
        ) {
          summaryStats.userXP = (summaryStats.userXP || 0) + shadowShareXP;
          summaryStats.shadowShareXP = shadowShareXP;
        }
      }
    }
    markPhase('shadowShareUserXpMs', phaseStartAt);

    // Attach extraction results to summary
    summaryStats.shadowsExtracted = extractionResults.extracted;
    summaryStats.extractionAttempts = extractionResults.attempted;

    // Debug logging
    if (this.settings.debug) {
      const duration = snap.startTime ? Math.round((Date.now() - snap.startTime) / 1000) : 0;
      const durationStr = duration > 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`;
      console.log(
        `[Dungeons] 🏰 ${reason === 'timeout' ? 'FAILED' : 'COMPLETE'}: "${snap.name}" [${snap.rank}] in #${snap.channelName || '?'} (${snap.guildName || '?'}) — ` +
        `${durationStr} | Mobs: ${summaryStats.totalMobsKilled} | Deaths: ${summaryStats.totalShadowDeaths || 0} | ` +
        `Extracted: ${extractionResults.extracted}/${extractionResults.attempted} | Key: ${channelKey} | ` +
        `timings=${JSON.stringify({ ...phaseTimings, totalBackgroundMs: Date.now() - backgroundStartedAt })}`
      );
    }

    // Summary toast
    if (reason !== 'timeout') {
      this.showDungeonCompletionSummary(summaryStats);
    } else {
      this.showToast(`${snap.name} Failed (Timeout)`, 'error');
    }

    // DB cleanup (skip for boss ARISE path — kept for extraction UI)
    if (reason !== 'boss' || !snap.userParticipating) {
      if (this.storageManager) {
        try {
          await this.storageManager.deleteDungeon(channelKey);
        } catch (error) {
          this.errorLog('Failed to delete dungeon from storage', error);
        }
      }

      if (this.mobBossStorageManager) {
        try {
          await this.mobBossStorageManager.deleteMobsByDungeon(channelKey);
        } catch (error) {
          this.errorLog('Failed to cleanup mobs from database', error);
        }
      }
    }
  },

  showDungeonCompletionSummary(stats) {
    // ESSENTIAL INFO ONLY: Status + Key Stats
    const lines = [];
    const status = stats.userParticipated ? 'CLEARED!' : 'SHADOWS CLEARED';
    lines.push(`${stats.dungeonName} [${stats.dungeonRank}] ${status}`);

    // Combat summary (compact)
    if (stats.totalMobsKilled > 0) {
      lines.push(`Killed: ${stats.totalMobsKilled.toLocaleString()} mobs`);
    }

    // Extraction summary (if extractions were processed)
    if (stats.shadowsExtracted !== undefined && stats.extractionAttempts > 0) {
      lines.push(
        `Extracted: ${stats.shadowsExtracted} shadows from ${stats.extractionAttempts} mobs`
      );
    }

    // XP gains (compact, combined)
    if (stats.userXP > 0 || stats.shadowTotalXP > 0) {
      const gains = [];
      if (stats.userXP > 0) gains.push(`You: +${stats.userXP} XP`);
      if (stats.shadowTotalXP > 0)
        gains.push(`Shadows: +${stats.shadowTotalXP.toLocaleString()} XP`);
      lines.push(gains.join(' | '));
    }

    // Show single toast (no damage stats, no extraction spam)
    this.showToast(lines.join('\n'), 'success');

    // Shadow Level-Ups (only if significant - 3+ shadows)
    if (stats.shadowsLeveledUp && stats.shadowsLeveledUp.length >= 3) {
      this._setTrackedTimeout(() => {
        if (!this.started) return;
        const levelUpLine = `${stats.shadowsLeveledUp.length} shadows leveled up!`;
        this.showToast(levelUpLine, 'info');
      }, 750);
    }
  }
};
