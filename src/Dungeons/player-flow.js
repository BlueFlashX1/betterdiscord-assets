module.exports = {
  validateActiveDungeonStatus() {
    if (!this.settings.userActiveDungeon) {
      return true; // No active dungeon, status is valid
    }

    const channelKey = this.settings.userActiveDungeon;
    const dungeon = this.activeDungeons.get(channelKey);

    // Check if dungeon exists and is still active
    if (!dungeon || dungeon.completed || dungeon.failed) {
      // Dungeon doesn't exist or is completed/failed - clear active status
      this.debugLog(
        `Active dungeon ${channelKey} no longer exists or is completed/failed. Clearing active status.`
      );

      // Clear active dungeon reference
      this.settings.userActiveDungeon = null;

      // NOTE: Do NOT delete corpse pile here — _processCorpsePile runs async after
      // completeDungeon sets completed=true, so deleting here would race and nuke it.
      // Corpse pile is cleaned up by _processCorpsePile itself after extraction.

      // Save settings
      this.saveSettings();

      return false; // Status was invalid, now cleared
    }

    // Also check by channel ID and identifier for extra safety
    const channelInfo = this.getChannelInfo();
    if (channelInfo) {
      const currentChannelKey = `${channelInfo.guildId}_${channelInfo.channelId}`;

      // If user is in a different channel, verify the active dungeon still exists
      if (currentChannelKey !== channelKey) {
        // User is in different channel - verify active dungeon still exists
        if (!dungeon) {
          // Active dungeon doesn't exist - clear status
          this.debugLog(
            `Active dungeon ${channelKey} not found in active dungeons. Clearing active status.`
          );
          this.settings.userActiveDungeon = null;
          this.saveSettings();
          return false;
        }
      }
    }

    return true; // Status is valid
  },

  async selectDungeon(channelKey) {
    // Validate active dungeon status first (clear invalid references)
    this.validateActiveDungeonStatus();

    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) {
      this.showToast('No active dungeon here — it may have already been cleared.', 'error');
      return;
    }

    if (dungeon.completed || dungeon.failed || dungeon._completing) {
      this.showToast('This dungeon has already been cleared.', 'info');
      return;
    }

    if (dungeon.userParticipating) {
      this.showToast('Already in this dungeon!', 'info');
      return;
    }

    // MUTEX: Block join while deploy is in-flight to prevent state interleaving.
    // deployShadows() yields at 3 await points; joining mid-deploy can persist
    // partial state (shadowsDeployed=true, no mobs) and corrupt the combat pipeline.
    if (dungeon._deploying) {
      this.showToast('Deploy in progress — wait for shadows to finish deploying.', 'info');
      return;
    }

    // SYNC HP/MANA FROM STATS PLUGIN
    const { hpSynced, manaSynced } = this.syncHPAndManaFromStats();
    if (hpSynced || manaSynced) {
      this.debugLog(
        `HP/Mana synced: ${this.settings.userHP}/${this.settings.userMaxHP} HP, ${this.settings.userMana}/${this.settings.userMaxMana} Mana`
      );
    }

    if (this.settings.userHP <= 0) {
      this.showToast('You need HP to join a dungeon! Wait for HP to regenerate.', 'error');
      return;
    }

    // ENFORCE ONE DUNGEON AT A TIME
    if (this.settings.userActiveDungeon && this.settings.userActiveDungeon !== channelKey) {
      const prevDungeon = this.activeDungeons.get(this.settings.userActiveDungeon);
      const shouldClearPrev = !prevDungeon || prevDungeon.completed || prevDungeon.failed;
      if (shouldClearPrev) {
        this.settings.userActiveDungeon = null;
        this.saveSettings();
      }
      const isPrevActive = prevDungeon && !prevDungeon.completed && !prevDungeon.failed;
      if (isPrevActive) {
        this.showToast(`Already in ${prevDungeon.name}! Complete it first.`, 'error');
        return;
      }
      if (prevDungeon) {
        prevDungeon.userParticipating = false;
      }
    }

    // JOIN is lightweight — just mark participation. No shadow allocation, no combat start.
    // All combat systems are handled by deployShadows().
    dungeon.userParticipating = true;
    dungeon.userJoined = true; // Permanent flag — never flipped back. Used for ARISE eligibility.
    this.settings.userActiveDungeon = channelKey;

    // Force cache bust so HP bar re-renders with updated button states
    this._bossBarCache?.delete?.(channelKey);
    this.queueHPBarUpdate(channelKey);
    this.showToast(`Joined ${dungeon.name}!`, 'info');
    this.saveSettings();
    // Persist userParticipating to IDB so it survives hot-reload
    if (this.storageManager) {
      this.storageManager.saveDungeon(dungeon).catch((err) =>
        this.errorLog('Failed to save dungeon after join', err)
      );
    }
  },

  leaveDungeon(channelKey, opts = {}) {
    const { silent = false } = opts;
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) {
      if (!silent) this.showToast('No active dungeon here.', 'error');
      return false;
    }

    if (!dungeon.userParticipating) {
      if (!silent) this.showToast('You are not joined in this dungeon.', 'info');
      return false;
    }

    dungeon.userParticipating = false;
    if (this.settings.userActiveDungeon === channelKey) {
      this.settings.userActiveDungeon = null;
    }

    this._bossBarCache?.delete?.(channelKey);
    this.queueHPBarUpdate(channelKey);
    if (!silent) {
      this.showToast(`Left ${dungeon.name}. You can now join other dungeons.`, 'info');
    }
    this.saveSettings();

    if (this.storageManager) {
      this.storageManager.saveDungeon(dungeon).catch((err) =>
        this.errorLog('Failed to save dungeon after leave', err)
      );
    }
    return true;
  },

  async deployShadows(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) {
      // FIX: More descriptive — distinguish "never existed" from "already cleared"
      this.showToast('No active dungeon here — it may have already been cleared.', 'error');
      return;
    }
    if (dungeon.completed || dungeon.failed || dungeon._completing) {
      // FIX: Catch completed/failed/mid-completion dungeons that haven't been cleaned from Map yet
      this.showToast('This dungeon has already been cleared.', 'info');
      return;
    }
    if (dungeon.shadowsDeployed) {
      this.showToast('Shadows already deployed here!', 'info');
      return;
    }
    // MUTEX: Prevent concurrent deploy + join race condition.
    // deployShadows() has 3 await points where selectDungeon() can interleave,
    // causing partial state persistence (shadowsDeployed=true but no mobs/combat).
    if (dungeon._deploying) {
      this.showToast('Deploy in progress — please wait.', 'info');
      return;
    }
    dungeon._deploying = true;

    // Validate active dungeon status first (clear invalid references)
    this.validateActiveDungeonStatus();

    // DEPLOY ≠ JOIN: Deploying shadows is autonomous — your army fights without you.
    // You can deploy shadows to MULTIPLE dungeons simultaneously.
    // Joining (selectDungeon) is the one-at-a-time restriction.
    // preSplitShadowArmy() handles distributing your finite shadow army across all deployed dungeons.

    // SYNC HP/MANA FROM STATS PLUGIN
    const { hpSynced, manaSynced } = this.syncHPAndManaFromStats();
    if (hpSynced || manaSynced) {
      this.debugLog(
        `HP/Mana synced: ${this.settings.userHP}/${this.settings.userMaxHP} HP, ${this.settings.userMana}/${this.settings.userMaxMana} Mana`
      );
    }

    // Check if user has HP
    if (this.settings.userHP <= 0) {
      dungeon._deploying = false;
      this.showToast('You need HP to deploy shadows! Wait for HP to regenerate.', 'error');
      return;
    }

    // Mark deployed (shadows fight autonomously — user can optionally JOIN separately)
    // Wrapped in try-catch: if getBossGateRuntimeConfig() or any state-setting throws,
    // we must roll back shadowsDeployed to prevent irrecoverable limbo (deployed flag
    // set but no allocation/combat ever starts, and re-deploy is blocked by L5152 guard).
    try {
      dungeon.shadowsDeployed = true;
      const bossGateConfig = this.getBossGateRuntimeConfig();
      if (!dungeon.bossGate || typeof dungeon.bossGate !== 'object') {
        dungeon.bossGate = {
          enabled: bossGateConfig.enabled,
          minDurationMs: bossGateConfig.minDurationMs,
          requiredMobKills: bossGateConfig.requiredMobKills,
          deployedAt: null,
          unlockedAt: null,
        };
      } else {
        // Refresh runtime gate values on deploy so stale persisted dungeon payloads
        // can't bypass intended gate timing.
        dungeon.bossGate.enabled = bossGateConfig.enabled;
        dungeon.bossGate.minDurationMs = bossGateConfig.minDurationMs;
        dungeon.bossGate.requiredMobKills = bossGateConfig.requiredMobKills;
      }
      const deployedAt = Date.now();
      dungeon.deployedAt = deployedAt;
      dungeon.bossGate.deployedAt = deployedAt;
      dungeon.bossGate.unlockedAt = null;
      this._markAllocationDirty('deploy-shadows');
    } catch (stateError) {
      // Rollback — prevent irrecoverable limbo state
      dungeon._deploying = false;
      dungeon.shadowsDeployed = false;
      dungeon.deployedAt = null;
      if (dungeon.bossGate && typeof dungeon.bossGate === 'object') {
        dungeon.bossGate.deployedAt = null;
        dungeon.bossGate.unlockedAt = null;
      }
      this.errorLog('DEPLOY', 'Failed to initialize deploy state — rolled back', { channelKey, error: stateError });
      this.showToast('Deploy failed to initialize. Try again.', 'error');
      return;
    }
    const deployStartedAt = Date.now();
    let starterAllocationCount = 0;

    // Fast-start deploy: apply a small provisional allocation first so mobs/attacks can begin immediately.
    // Full rank-tiered split is reconciled asynchronously right after combat starts.
    try {
      const starterShadows = this._buildDeployStarterAllocation(channelKey, dungeon);
      starterAllocationCount = this._applyDeployStarterAllocation(channelKey, dungeon, starterShadows);
    } catch (error) {
      this.errorLog('DEPLOY', 'Failed to build starter allocation', { channelKey, error });
    }

    // COLD-CACHE RECOVERY: If starter allocation got 0 shadows because all caches were cold
    // (first deploy after plugin start, or long idle period), warm the cache via async IDB read
    // and retry the allocation once before giving up.
    if (starterAllocationCount === 0) {
      this.debugLog('DEPLOY', 'Starter allocation returned 0 — attempting recovery warmup', { channelKey });
      try {
        const warmedPoolCount = await this._warmDeployStarterPool(
          {
            dungeonRank: dungeon.rank,
            targetCount: this._deployStarterShadowCap || 240,
            sampleLimit: Math.max(400, Math.floor((this._deployStarterShadowCap || 240) * 4)),
          }
        );
        // Race guard: recall may have fired during async IDB read
        if (!dungeon.shadowsDeployed) {
          dungeon._deploying = false;
          this.debugLog('DEPLOY', 'Aborted — recalled during cache warm', { channelKey });
          return;
        }

        if (warmedPoolCount > 0) {
          this.debugLog('DEPLOY', `Starter pool warmed: ${warmedPoolCount} shadows available — retrying allocation`, { channelKey });
          const retryShadows = this._buildDeployStarterAllocation(channelKey, dungeon);
          starterAllocationCount = this._applyDeployStarterAllocation(channelKey, dungeon, retryShadows);
        }

        // If reuse of a generic startup pool still yielded 0, force a rank-targeted refresh.
        if (starterAllocationCount === 0) {
          const refreshedPoolCount = await this._warmDeployStarterPool({
            dungeonRank: dungeon.rank,
            targetCount: this._deployStarterShadowCap || 240,
            sampleLimit: Math.max(1200, Math.floor((this._deployStarterShadowCap || 240) * 8)),
            forceRefresh: true,
          });
          if (refreshedPoolCount > 0) {
            this.debugLog('DEPLOY', `Starter pool force-refreshed: ${refreshedPoolCount} shadows — retrying allocation`, { channelKey });
            const retryShadows = this._buildDeployStarterAllocation(channelKey, dungeon);
            starterAllocationCount = this._applyDeployStarterAllocation(channelKey, dungeon, retryShadows);
          }
        }

        // Last-resort compatibility path: force full IDB read only if lightweight warm still failed.
        if (starterAllocationCount === 0) {
          const allShadows = await this.getAllShadows(false); // force fresh full read
          if (Array.isArray(allShadows) && allShadows.length > 0) {
            this.debugLog('DEPLOY', `Full cache warmed: ${allShadows.length} shadows found — retrying allocation`, { channelKey });
            const retryShadows = this._buildDeployStarterAllocation(channelKey, dungeon);
            starterAllocationCount = this._applyDeployStarterAllocation(channelKey, dungeon, retryShadows);
          }
        }
      } catch (error) {
        this.errorLog('DEPLOY', 'Cold-cache recovery failed', { channelKey, error });
      }
    }

    let { assignedShadows } = this._getAssignedShadowsForDungeon(channelKey, dungeon);

    // Consistency fallback: if starter allocation is still empty, force one synchronous full split.
    // This is heavier than starter allocation but avoids flaky "deploy with zero shadows" outcomes.
    if (assignedShadows.length === 0 && starterAllocationCount === 0) {
      try {
        this._markAllocationDirty('deploy-starter-empty-force-full-split');
        await this.preSplitShadowArmy(true);
        ({ assignedShadows } = this._getAssignedShadowsForDungeon(channelKey, dungeon));
        if (assignedShadows.length > 0) {
          this.debugLog('DEPLOY', 'Recovered deploy allocation via forced full split', {
            channelKey,
            assigned: assignedShadows.length,
          });
        }
      } catch (error) {
        this.errorLog('DEPLOY', 'Forced full split failed after empty starter allocation', { channelKey, error });
      }
    }

    // GUARDRAIL: If 0 shadows were allocated, abort deploy entirely.
    // Without shadows, combat is meaningless — boss gate will unlock after 180s but
    // nothing attacks the boss, leading to phantom defeats and unearned XP.
    if (assignedShadows.length === 0 && starterAllocationCount === 0) {
      dungeon._deploying = false;
      dungeon.shadowsDeployed = false;
      dungeon.deployedAt = null;
      if (dungeon.bossGate) {
        dungeon.bossGate.deployedAt = null;
        dungeon.bossGate.unlockedAt = null;
      }
      dungeon.shadowAllocation = null;
      this.shadowAllocations.delete(channelKey);
      this._markAllocationDirty('deploy-aborted-no-shadows');
      this.errorLog('DEPLOY', 'Deploy aborted: 0 shadows available for starter allocation', {
        channelKey,
        dungeonName: dungeon.name,
        dungeonRank: dungeon.rank,
      });
      this.showToast('No shadows available to deploy! Extract more shadows first.', 'error');
      return;
    }

    const deployMode = starterAllocationCount > 0 ? 'fast-start' : 'async-full-split';

    if (this.settings.debug) {
      const gateSummary = dungeon.bossGate?.enabled === false
        ? 'disabled'
        : `${Math.floor((dungeon.bossGate?.minDurationMs || 0) / 1000)}s + ${dungeon.bossGate?.requiredMobKills || 0} kills`;
      console.log(
        `[Dungeons] ⚔️ DEPLOY: "${dungeon.name}" [${dungeon.rank}] in #${dungeon.channelName || '?'} (${dungeon.guildName || '?'}) — ` +
        `${assignedShadows.length} shadows deployed | Boss: ${dungeon.boss?.name} [${dungeon.boss?.rank}] HP: ${dungeon.boss?.hp?.toLocaleString()} | ` +
        `Gate: ${gateSummary} | Mode: ${deployMode} | ` +
        `Alloc: ${Date.now() - deployStartedAt}ms | Key: ${channelKey}`
      );
    }

    // Initialize boss and mob attack times to prevent one-shot burst
    const now = Date.now();
    if (!dungeon.boss.lastAttackTime || dungeon.boss.lastAttackTime === 0) {
      dungeon.boss.lastAttackTime = now;
    }
    if (dungeon.mobs?.activeMobs) {
      dungeon.mobs.activeMobs.forEach((mob) => {
        if (mob && (!mob.lastAttackTime || mob.lastAttackTime === 0)) {
          mob.lastAttackTime = now;
        }
      });
    }

    // Start mob spawning + all combat systems together
    this.startMobSpawning(channelKey);

    // Deploy responsiveness: flush first queued spawn wave immediately so shadows have targets now.
    if (this._mobSpawnQueue?.has?.(channelKey)) {
      const queuedRemaining = this.processMobSpawnQueue(channelKey);
      if (queuedRemaining > 0) {
        this._mobSpawnQueueNextAt?.set?.(channelKey, Date.now() + 500);
      } else {
        this._mobSpawnQueueNextAt?.delete?.(channelKey);
      }
    }
    this.ensureDeployedSpawnPipeline(channelKey, 'deploy_initial');
    const liveMobsAfterDeployStart = this._countLiveMobs(dungeon);
    if (liveMobsAfterDeployStart <= 0) {
      // Hard guard: if no mobs are visible after initial deploy spawn/flush, force one more pipeline heal.
      this.ensureDeployedSpawnPipeline(channelKey, 'deploy_initial_hard_guard');
    }
    this._setTrackedTimeout(() => {
      try {
        const guardDungeon = this._getActiveDungeon(channelKey);
        if (!guardDungeon || !guardDungeon.shadowsDeployed || guardDungeon.boss?.hp <= 0) return;
        this.ensureDeployedSpawnPipeline(channelKey, 'deploy_watchdog');
      } catch (error) {
        this.errorLog('MOB_SPAWN_GUARD', 'Deploy watchdog failed', error);
      }
    }, 1000);

    await this.startShadowAttacks(channelKey, { allowBlockingReallocation: false });
    // Race guard: recall may have fired during shadow attack init
    if (!dungeon.shadowsDeployed) {
      dungeon._deploying = false;
      this.debugLog('DEPLOY', 'Aborted mid-deploy — recalled during shadow attack init', { channelKey });
      return;
    }
    this.startBossAttacks(channelKey);
    this.startMobAttacks(channelKey);

    // Deploy responsiveness: run one immediate shadow attack pass only when starter allocation exists.
    if (assignedShadows.length > 0) {
      await this.processShadowAttacks(channelKey, 1, this.isWindowVisible(), 250);
    }

    // Race guard: recall may have fired during immediate attack pass
    if (!dungeon.shadowsDeployed) {
      dungeon._deploying = false;
      this.debugLog('DEPLOY', 'Aborted mid-deploy — recalled during attack pass', { channelKey });
      return;
    }

    dungeon._deployPendingFullAllocation = true;
    this._scheduleDeployRebalance(channelKey, deployStartedAt);

    this.showToast(`Shadows deployed to ${dungeon.name}!`, 'success');
    dungeon._deploying = false; // MUTEX RELEASE: deploy pipeline complete
    this.saveSettings();

    // CRITICAL: Persist dungeon state to IDB immediately — shadowsDeployed must survive hot-reload.
    // Without this, a reload before the first combat save cycle would lose the deployed flag.
    if (this.storageManager) {
      this.storageManager.saveDungeon(dungeon).catch((err) =>
        this.errorLog('Failed to save dungeon after deploy', err)
      );
    }

    // Update HP bar after modal closes so header re-render isn't gated by transient overlay state.
    this.queueHPBarUpdate(channelKey);
    this._setTrackedTimeout(() => this.queueHPBarUpdate(channelKey), 34);
  },

  async recallShadows(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) {
      this.showToast('No active dungeon here.', 'error');
      return;
    }
    if (!dungeon.shadowsDeployed) {
      this.showToast('No shadows deployed to recall.', 'info');
      return;
    }
    if (dungeon.completed || dungeon.failed || dungeon._completing) {
      this.showToast('This dungeon has already been cleared.', 'info');
      return;
    }

    // Clear deploy mutex (recall can be called during or after deploy)
    dungeon._deploying = false;

    // Stop all combat systems
    this.stopShadowAttacks(channelKey);
    this.stopBossAttacks(channelKey);
    this.stopMobAttacks(channelKey);
    this.stopMobSpawning(channelKey);

    // Reset deployment state
    dungeon.shadowsDeployed = false;
    dungeon.userParticipating = false;
    dungeon.deployedAt = null;
    if (dungeon.bossGate) {
      dungeon.bossGate.deployedAt = null;
      dungeon.bossGate.unlockedAt = null;
    }

    // Clear shadow allocations for this dungeon
    this.shadowAllocations.delete(channelKey);
    this._markAllocationDirty('recall-shadows');

    // Start idle timer for expiry (3-minute countdown)
    dungeon._idleSince = Date.now();

    // Clear active dungeon reference if this was the active one
    if (this.settings.userActiveDungeon === channelKey) {
      this.settings.userActiveDungeon = null;
    }

    this.settings.debug && console.log(
      `[Dungeons] RECALL: "${dungeon.name}" [${dungeon.rank}] — all shadows recalled from #${dungeon.channelName || '?'}`
    );
    this.showToast(`Shadows recalled from ${dungeon.name}!`, 'info');
    this.saveSettings();

    // Persist to IDB so recall survives hot-reload
    if (this.storageManager) {
      this.storageManager.saveDungeon(dungeon).catch((err) =>
        this.errorLog('Failed to save dungeon after recall', err)
      );
    }

    // Update UI — bust cache so HP bar re-renders with deploy button restored
    this._bossBarCache?.delete?.(channelKey);
    this.queueHPBarUpdate(channelKey);
  },

  async processUserAttack(channelKey, messageElement = null) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;

    // User must explicitly deploy (DEPLOY SHADOWS button) AND join (JOIN button)
    // before messages trigger attacks. No auto-deploy or auto-join on message.
    if (!dungeon.shadowsDeployed || !dungeon.userParticipating) return;

    // Calculate base damage using TOTAL EFFECTIVE STATS (includes all buffs)
    // Boss can only be engaged after gate requirements are met.
    const bossUnlocked = this.ensureBossEngagementUnlocked(dungeon, channelKey);
    if (dungeon.boss.hp > 0 && bossUnlocked) {
      const bossStats = {
        strength: dungeon.boss.strength,
        agility: dungeon.boss.agility,
        intelligence: dungeon.boss.intelligence,
        vitality: dungeon.boss.vitality,
      };
      let userDamage = this.calculateUserDamage(bossStats, dungeon.boss.rank);

      // CHECK FOR CRITICAL HIT (integrates with CriticalHitMerged plugin)
      let isCritical = false;
      if (this.checkCriticalHit(messageElement)) {
        isCritical = true;
        // CRITICAL HIT MULTIPLIER: 2x damage!
        userDamage = Math.floor(userDamage * 2.0);
        this.debugLog(
          `CRITICAL HIT! User damage: ${Math.floor(userDamage / 2)} -> ${userDamage} (2x)`
        );
      }

      await this.applyDamageToBoss(channelKey, userDamage, 'user', null, isCritical);
    } else {
      // Attack mobs
      await this.attackMobs(channelKey, 'user');
    }
  }
};
