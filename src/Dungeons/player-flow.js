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
      const attackResult = this._resolveUserBossDamage(dungeon, {
        messageElement,
      });
      if (attackResult.damage > 0) {
        await this.applyDamageToBoss(
          channelKey,
          attackResult.damage,
          'user',
          null,
          attackResult.isCritical
        );
      }
    } else {
      // Attack mobs
      await this.attackMobs(channelKey, 'user');
    }
  },

  _getBossCombatStats(dungeon) {
    return {
      strength: dungeon?.boss?.strength || 0,
      agility: dungeon?.boss?.agility || 0,
      intelligence: dungeon?.boss?.intelligence || 0,
      vitality: dungeon?.boss?.vitality || 0,
      perception: dungeon?.boss?.perception || 0,
    };
  },

  _resolveUserBossDamage(dungeon, options = {}) {
    const {
      messageElement = null,
      skillMultiplier = 1,
      passiveDamageBonusKey = null,
      executeThreshold = 0,
      executeMultiplier = 1,
      forceCritical = false,
    } = options || {};

    const bossStats = this._getBossCombatStats(dungeon);
    const breakdown =
      typeof this.calculateUserDamageBreakdown === 'function'
        ? this.calculateUserDamageBreakdown(bossStats, dungeon.boss.rank)
        : {
            damage: this.calculateUserDamage(bossStats, dungeon.boss.rank),
            dodged: false,
            wasCrit: false,
            critMultiplier: 1,
          };

    let damage = Math.max(0, Number(breakdown.damage) || 0);
    const critDamageBonus = this.getUserCritDamageBonus?.() || 0;
    // forceCritical: lore-accurate — Mutilation's every hit is a guaranteed critical
    let isCritical = forceCritical || Boolean(breakdown.wasCrit);

    if (isCritical && critDamageBonus > 0) {
      const critMult = forceCritical ? 2.0 : (breakdown.critMultiplier || 1);
      damage = this.applyEnhancedCritMultiplier(damage, critMult, critDamageBonus);
    }

    const pluginCrit = Boolean(messageElement && this.checkCriticalHit(messageElement));
    const passiveCrit = !forceCritical && !pluginCrit && !isCritical && Boolean(this.rollSkillTreeCombatCrit?.());

    if (pluginCrit || passiveCrit) {
      isCritical = true;
      damage = this.applyEnhancedCritMultiplier(damage, 2.0, critDamageBonus);
    }

    const skillDamageMultiplier = Math.max(0.1, Number(skillMultiplier) || 1);
    if (skillDamageMultiplier !== 1 && damage > 0) {
      damage = Math.max(1, Math.floor(damage * skillDamageMultiplier));
    }

    if (passiveDamageBonusKey === 'daggerThrowDamageBonus' && damage > 0) {
      const throwBonus = this.getUserDaggerThrowDamageBonus?.() || 0;
      if (throwBonus > 0) {
        damage = Math.max(1, Math.floor(damage * (1 + throwBonus)));
      }
    }

    const threshold = Math.max(0, Number(executeThreshold) || 0);
    const finisherMultiplier = Math.max(1, Number(executeMultiplier) || 1);
    const bossHpRatio =
      Number(dungeon?.boss?.maxHp) > 0 ? Number(dungeon.boss.hp) / Number(dungeon.boss.maxHp) : 1;
    if (damage > 0 && threshold > 0 && bossHpRatio <= threshold && finisherMultiplier > 1) {
      damage = Math.max(1, Math.floor(damage * finisherMultiplier));
    }

    return {
      damage,
      isCritical,
      dodged: Boolean(breakdown.dodged),
      breakdown,
      pluginCrit,
      passiveCrit,
    };
  },

  _notifyBossGateLocked(dungeon) {
    if (!dungeon) return;
    const now = Date.now();
    const lastNoticeAt = dungeon._bossGateNoticeAt || 0;
    if (now - lastNoticeAt <= 15000) return;

    dungeon._bossGateNoticeAt = now;
    const requiredKills = Number.isFinite(dungeon?.bossGate?.requiredMobKills)
      ? dungeon.bossGate.requiredMobKills
      : 25;
    const currentKills = Number.isFinite(dungeon?.mobs?.killed) ? dungeon.mobs.killed : 0;
    const remainingKills = Math.max(0, requiredKills - currentKills);
    this.showToast(`Boss sealed: clear ${remainingKills} more mobs to break the gate.`, 'info');
  },

  async castDungeonCombatSkill(channelKey, skillId) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) {
      this.showToast('No active dungeon here.', 'error');
      return false;
    }
    if (!dungeon.userParticipating) {
      this.showToast('Join the dungeon before using combat skills.', 'info');
      return false;
    }
    if (!dungeon.shadowsDeployed) {
      this.showToast('Deploy shadows before using combat skills.', 'info');
      return false;
    }
    if (dungeon.completed || dungeon.failed) {
      this.showToast('The dungeon is over — no enemies remain.', 'info');
      return false;
    }

    const skillTree = this.getSkillTreeInstance?.();
    if (!skillTree || typeof skillTree.useDungeonCombatSkill !== 'function') {
      this.showToast('SkillTree combat skills are unavailable right now.', 'error');
      return false;
    }

    const snapshot =
      typeof skillTree.getDungeonCombatSkillRuntimeSnapshot === 'function'
        ? skillTree.getDungeonCombatSkillRuntimeSnapshot(skillId)
        : null;
    if (!snapshot?.def) {
      this.showToast('Unknown combat skill.', 'error');
      return false;
    }
    if (!snapshot.unlocked) {
      this.showToast(`${snapshot.def.name} is not unlocked yet.`, 'info');
      return false;
    }

    const bossAlive = Number(dungeon?.boss?.hp || 0) > 0;
    const liveMobs = this._countLiveMobs?.(dungeon) || 0;

    // Boss is targetable only when gate has been unlocked (3-min timer + mob kills)
    const bossTargetable = bossAlive && Boolean(
      dungeon.bossGate?.unlockedAt &&
      Number.isFinite(dungeon.bossGate.unlockedAt) &&
      dungeon.bossGate.unlockedAt > 0
    );

    // No enemies at all — nothing to target
    if (!bossAlive && liveMobs <= 0) {
      this.showToast('No enemies to target right now.', 'info');
      return false;
    }

    const castResult = skillTree.useDungeonCombatSkill(skillId);
    if (!castResult?.success) {
      const reason = castResult?.reason || 'Combat skill failed.';
      const toastType = /mana|unknown/i.test(reason) ? 'error' : 'info';
      this.showToast(reason, toastType);
      this.queueHPBarUpdate(channelKey);
      return false;
    }
    this.syncManaFromStats?.();

    const def = castResult.def || snapshot.def;
    const combatEffect = def.combatEffect || 'damage';
    const passiveLevel = Math.max(1, this.getSkillTreeInstance?.()?.getSkillLevel?.(def.unlock?.passiveSkill) || 1);

    // ── Boss debuff resistance ────────────────────────────────────────
    // Two competing forces:
    //   1. Boss rank advantage → MORE resistance (15% duration / 10% effect per rank above)
    //   2. Player total power → LESS resistance (penetration scales with combined stats)
    // Neither force can fully cancel the other — boss always has SOME resistance,
    // but a powerful player always punches through SOME of it.
    // Hard caps: boss resist 80% max, player penetration 60% max.
    const userRank = this.soloLevelingStats?.settings?.rank || 'E';
    const userRankIdx = this.getRankIndexValue(userRank);
    const bossRankIdx = bossTargetable ? this.getRankIndexValue(dungeon.boss?.rank || 'E') : 0;
    const bossRankDiff = Math.max(0, bossRankIdx - userRankIdx);

    // Player debuff penetration — stronger player = more penetration through boss resistance
    // Total stats (str+agi+int+vit) scale penetration: ~0% at 0 stats, ~60% cap at high stats
    // Curve: diminishing returns via sqrt so early stat gains matter most
    let playerPenetration = 0;
    if (bossTargetable) {
      const pStats = typeof this.getUserEffectiveStats === 'function' ? this.getUserEffectiveStats() : {};
      const totalPower = (Number(pStats.strength) || 0) + (Number(pStats.agility) || 0) +
        (Number(pStats.intelligence) || 0) + (Number(pStats.vitality) || 0);
      // sqrt curve: 100 stats → ~20%, 400 stats → ~40%, 900+ stats → ~60% cap
      playerPenetration = Math.min(0.60, Math.sqrt(totalPower) / 50);
    }

    // Base resistance from rank difference, then reduced by player penetration
    const rawDurationResist = Math.min(0.80, bossRankDiff * 0.15);
    const rawEffectResist = Math.min(0.80, bossRankDiff * 0.10);
    const effectiveDurationResist = rawDurationResist * (1 - playerPenetration);
    const effectiveEffectResist = rawEffectResist * (1 - playerPenetration);

    const bossDebuffResist = bossTargetable ? {
      durationMult: Math.max(0.20, 1 - effectiveDurationResist),
      effectMult: Math.max(0.20, 1 - effectiveEffectResist),
      resistPct: Math.round(effectiveDurationResist * 100),
      penetrationPct: Math.round(playerPenetration * 100),
    } : { durationMult: 1, effectMult: 1, resistPct: 0, penetrationPct: 0 };

    // ── Debuff: Ruler's Authority Force ──────────────────────────────
    if (combatEffect === 'debuff' && def.debuff) {
      const db = def.debuff;
      const baseDuration = db.disableAttacksDurationMs || 5000;
      const fullDuration = db.durationScaling === 'double_per_level'
        ? baseDuration * Math.pow(2, passiveLevel - 1)
        : baseDuration;
      const fullResistReduction = (db.damageResistReduction || 0) + (db.resistReductionPerLevel || 0) * (passiveLevel - 1);
      const mobPercent = Math.min(1, (db.mobTargetPercent || 0) + (db.mobTargetPercentPerLevel || 0) * (passiveLevel - 1));

      // Mobs get full duration; boss gets resistance-reduced duration + effect
      const mobDuration = fullDuration;
      const bossDuration = Math.floor(fullDuration * bossDebuffResist.durationMult);
      const bossResistReduction = fullResistReduction * bossDebuffResist.effectMult;

      if (!dungeon.activeDebuffs) dungeon.activeDebuffs = {};
      dungeon.activeDebuffs.rulers_force = {
        expiresAt: Date.now() + mobDuration,
        resistReduction: Math.min(0.9, bossTargetable ? bossResistReduction : fullResistReduction),
        mobDisablePercent: mobPercent,
        disableAttacksDurationMs: bossTargetable ? bossDuration : mobDuration,
      };

      this.syncManaFromStats?.();
      this.queueHPBarUpdate(channelKey);
      const mobPct = Math.round(mobPercent * 100);
      const parts = [];
      if (bossTargetable) {
        const bossDurationSec = (bossDuration / 1000).toFixed(1);
        const bossResistPct = Math.round(bossResistReduction * 100);
        let bossMsg = `Boss stunned ${bossDurationSec}s, -${bossResistPct}% resist`;
        if (bossDebuffResist.resistPct > 0) bossMsg += ` (${bossDebuffResist.resistPct}% resisted)`;
        parts.push(bossMsg);
      }
      parts.push(`${mobPct}% mobs disabled`);
      this.showToast(`${def.name}: ${parts.join(', ')}.`, 'success');
      return true;
    }

    // ── Shadow Buff: Domain Expansion ────────────────────────────────
    if (combatEffect === 'shadow_buff' && def.shadowBuff) {
      const sb = def.shadowBuff;
      const duration = (sb.durationMs || 30000) + (sb.durationPerLevel || 0) * (passiveLevel - 1);
      const multiplier = (sb.allStatMultiplier || 1.25) + (sb.allStatMultiplierPerLevel || 0) * (passiveLevel - 1);

      if (!dungeon.activeBuffs) dungeon.activeBuffs = {};
      dungeon.activeBuffs.domain = {
        expiresAt: Date.now() + duration,
        statMultiplier: multiplier,
      };

      this.syncManaFromStats?.();
      this.queueHPBarUpdate(channelKey);
      const durationSec = (duration / 1000).toFixed(0);
      const buffPct = Math.round((multiplier - 1) * 100);
      this.showToast(
        `${def.name}: All shadows +${buffPct}% stats for ${durationSec}s!`,
        'success'
      );
      return true;
    }

    // ── Fear: Dragon's Fear ────────────────────────────────────────────
    if (combatEffect === 'fear' && def.fear) {
      const fr = def.fear;
      const mobDuration = (fr.baseDurationMs || 8000) + (fr.durationPerLevel || 0) * (passiveLevel - 1);

      if (!dungeon.activeDebuffs) dungeon.activeDebuffs = {};

      // Mob fear: full paralysis for duration
      dungeon.activeDebuffs.dragons_fear_mobs = {
        expiresAt: Date.now() + mobDuration,
      };

      // Boss fear: base multiplier (0.4x) THEN boss rank resistance on top
      const bossToastParts = [];
      if (bossTargetable) {
        const bossDuration = Math.floor(
          mobDuration * (fr.bossDurationMultiplier || 0.4) * bossDebuffResist.durationMult
        );

        if (bossDuration > 500) {
          dungeon.activeDebuffs.dragons_fear_boss = {
            expiresAt: Date.now() + bossDuration,
          };
          let msg = `Boss paralyzed ${(bossDuration / 1000).toFixed(1)}s`;
          if (bossDebuffResist.resistPct > 0) msg += ` (${bossDebuffResist.resistPct}% resisted)`;
          bossToastParts.push(msg);
        } else {
          bossToastParts.push('Boss resisted');
        }
      }

      this.syncManaFromStats?.();
      this.queueHPBarUpdate(channelKey);
      const mobSec = (mobDuration / 1000).toFixed(1);
      const suffix = bossToastParts.length ? ` ${bossToastParts.join('. ')}.` : '';
      this.showToast(
        `${def.name}: All mobs paralyzed ${mobSec}s!${suffix}`,
        'success'
      );
      return true;
    }

    // ── Bloodlust: AoE fear + boss stat reduction ────────────────────
    if (combatEffect === 'bloodlust' && def.bloodlust) {
      const bl = def.bloodlust;
      const mobDuration = (bl.baseDurationMs || 60000) + (bl.durationPerLevel || 0) * (passiveLevel - 1);

      if (!dungeon.activeDebuffs) dungeon.activeDebuffs = {};

      // Mob fear: full paralysis for duration
      dungeon.activeDebuffs.bloodlust_mobs = {
        expiresAt: Date.now() + mobDuration,
      };

      const toastParts = [`All mobs paralyzed ${(mobDuration / 1000).toFixed(0)}s`];

      // Boss effects only if boss is targetable (gate unlocked) — reduced by boss resistance
      if (bossTargetable) {
        const fullParalysisDuration = Math.floor(mobDuration * (bl.bossDurationMultiplier || 0.5));
        const bossParalysisDuration = Math.floor(fullParalysisDuration * bossDebuffResist.durationMult);
        const fullReduction = Math.min(0.80, (bl.bossStatReduction || 0.50) + (bl.bossStatReductionPerLevel || 0) * (passiveLevel - 1));
        const bossReduction = fullReduction * bossDebuffResist.effectMult;

        dungeon.activeDebuffs.bloodlust_boss = {
          expiresAt: Date.now() + bossParalysisDuration,
        };
        dungeon.activeDebuffs.bloodlust_stats = {
          expiresAt: Date.now() + Math.floor(mobDuration * bossDebuffResist.durationMult),
          statReduction: bossReduction,
        };

        const paralysisSec = (bossParalysisDuration / 1000).toFixed(0);
        const reductionPct = Math.round(bossReduction * 100);
        let bossMsg = `Boss stunned ${paralysisSec}s, -${reductionPct}% stats`;
        if (bossDebuffResist.resistPct > 0) bossMsg += ` (${bossDebuffResist.resistPct}% resisted)`;
        toastParts.push(bossMsg);
      }

      this.syncManaFromStats?.();
      this.queueHPBarUpdate(channelKey);
      this.showToast(`${def.name}: ${toastParts.join('! ')}!`, 'success');
      return true;
    }

    // ── Speed Boost (Sprint): attack cooldown reduction ─────────────
    if (combatEffect === 'speed_boost' && def.speedBoost) {
      const sb = def.speedBoost;
      const duration = (sb.durationMs || 180000) + (sb.durationPerLevel || 0) * (passiveLevel - 1);
      const reduction = Math.min(0.50,
        (sb.attackCooldownReduction || 0.20) + (sb.attackCooldownReductionPerLevel || 0) * (passiveLevel - 1)
      );

      if (!dungeon.activeBuffs) dungeon.activeBuffs = {};
      dungeon.activeBuffs.sprint = {
        expiresAt: Date.now() + duration,
        cooldownReduction: reduction,
      };

      this.syncManaFromStats?.();
      this.queueHPBarUpdate(channelKey);
      const durationMin = (duration / 60000).toFixed(1);
      const reductionPct = Math.round(reduction * 100);
      this.showToast(
        `${def.name}: Shadows attack ${reductionPct}% faster for ${durationMin}m!`,
        'success'
      );
      return true;
    }

    // ── Default: Direct damage ───────────────────────────────────────
    // Target boss if gate unlocked (bossTargetable computed above), otherwise cleave mobs
    if (bossTargetable) {
      const attackResult = this._resolveUserBossDamage(dungeon, {
        skillMultiplier: def.damageMultiplier || 1,
        passiveDamageBonusKey: def.passiveDamageBonusKey || null,
        executeThreshold: def.executeThreshold || 0,
        executeMultiplier: def.executeMultiplier || 1,
        forceCritical: Boolean(def.forceCritical),
      });

      if (attackResult.damage <= 0) {
        this.syncManaFromStats?.();
        this.showToast(`${def.name} was evaded.`, 'info');
        this.queueHPBarUpdate(channelKey);
        return false;
      }

      await this.applyDamageToBoss(channelKey, attackResult.damage, 'user', null, attackResult.isCritical);
      this.syncManaFromStats?.();
      this.queueHPBarUpdate(channelKey);

      const critText = attackResult.isCritical ? ' Critical hit!' : '';
      this.showToast(
        `${def.name} dealt ${attackResult.damage.toLocaleString()} damage.${critText}`,
        attackResult.isCritical ? 'success' : 'info'
      );
      return true;
    }

    // ── Mob targeting: skill hits live mobs when boss isn't targetable ──
    let aliveMobs = (dungeon.mobs?.activeMobs || []).filter((m) => m && m.hp > 0);
    if (!aliveMobs.length) {
      this.syncManaFromStats?.();
      this.showToast('No enemies to target.', 'info');
      this.queueHPBarUpdate(channelKey);
      return false;
    }

    // Single-target skills (e.g. Mutilation) focus the strongest mob
    const isSingleTarget = def.targeting === 'single';
    if (isSingleTarget) {
      aliveMobs.sort((a, b) => (b.maxHp || 0) - (a.maxHp || 0));
      aliveMobs = [aliveMobs[0]];
    }

    const skillMultiplier = Math.max(0.1, Number(def.damageMultiplier) || 1);
    const forceCrit = Boolean(def.forceCritical);
    let totalDamage = 0;
    let mobsHit = 0;
    let mobsKilled = 0;
    let anyCrit = false;

    for (const mob of aliveMobs) {
      // Rank-based targeting: mobs at or below player rank take full damage,
      // mobs above player rank take reduced damage per rank tier above
      const mobRankIdx = this.getRankIndexValue(mob.rank || 'E');
      const rankAbove = Math.max(0, mobRankIdx - userRankIdx);
      const rankPenalty = Math.min(0.9, rankAbove * 0.25);

      const mobStats = {
        strength: mob.strength || 0,
        agility: mob.agility || 0,
        intelligence: mob.intelligence || 0,
        vitality: mob.vitality || 0,
      };

      const breakdown =
        typeof this.calculateUserDamageBreakdown === 'function'
          ? this.calculateUserDamageBreakdown(mobStats, mob.rank)
          : { damage: this.calculateUserDamage(mobStats, mob.rank), dodged: false, wasCrit: false, critMultiplier: 1 };

      let damage = Math.max(0, Number(breakdown.damage) || 0);
      // forceCritical: lore-accurate — Mutilation's every hit is a critical strike
      let isCritical = forceCrit || Boolean(breakdown.wasCrit);

      if (isCritical) {
        const critDmgBonus = this.getUserCritDamageBonus?.() || 0;
        const critMult = forceCrit ? 2.0 : (breakdown.critMultiplier || 1);
        damage = this.applyEnhancedCritMultiplier(damage, critMult, critDmgBonus);
        anyCrit = true;
      }

      // Apply skill multiplier
      damage = Math.max(1, Math.floor(damage * skillMultiplier));

      // Apply passive damage bonus (e.g. dagger throw)
      if (def.passiveDamageBonusKey === 'daggerThrowDamageBonus' && damage > 0) {
        const throwBonus = this.getUserDaggerThrowDamageBonus?.() || 0;
        if (throwBonus > 0) damage = Math.max(1, Math.floor(damage * (1 + throwBonus)));
      }

      // Execute threshold works on mobs too (based on mob HP %)
      const threshold = Math.max(0, Number(def.executeThreshold) || 0);
      const finMult = Math.max(1, Number(def.executeMultiplier) || 1);
      if (threshold > 0 && finMult > 1 && mob.maxHp > 0 && (mob.hp / mob.maxHp) <= threshold) {
        damage = Math.max(1, Math.floor(damage * finMult));
      }

      // Rank penalty for mobs above player
      if (rankPenalty > 0) damage = Math.max(1, Math.floor(damage * (1 - rankPenalty)));

      // Apply status-adjusted damage
      const mobId = this.getEnemyKey(mob, 'mob');
      const adjDamage = this.applyStatusAdjustedIncomingDamage(channelKey, 'mob', mobId, damage, Date.now());
      mob.hp = Math.max(0, mob.hp - adjDamage);
      totalDamage += adjDamage;
      mobsHit++;

      if (mob.hp <= 0) {
        this._onMobKilled(channelKey, dungeon, mob.rank);
        this._addToCorpsePile(channelKey, mob, false);
        mobsKilled++;
      }
    }

    // Clean up dead mobs
    dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter((m) => m && m.hp > 0);

    this.syncManaFromStats?.();
    this.queueHPBarUpdate(channelKey);

    const critText = anyCrit ? ' Critical!' : '';
    const killText = mobsKilled > 0 ? ` ${mobsKilled} slain.` : '';
    const verb = isSingleTarget ? 'shredded' : 'cleaved';
    this.showToast(
      `${def.name} ${verb} ${mobsHit} mob${mobsHit !== 1 ? 's' : ''} for ${totalDamage.toLocaleString()} damage.${killText}${critText}`,
      anyCrit ? 'success' : 'info'
    );
    return true;
  },

  // ── Combat buff/debuff helpers ──────────────────────────────────────
  _getActiveDebuff(dungeon, key) {
    const debuff = dungeon?.activeDebuffs?.[key];
    if (!debuff) return null;
    if (Date.now() > debuff.expiresAt) {
      delete dungeon.activeDebuffs[key];
      return null;
    }
    return debuff;
  },

  _getActiveBuff(dungeon, key) {
    const buff = dungeon?.activeBuffs?.[key];
    if (!buff) return null;
    if (Date.now() > buff.expiresAt) {
      delete dungeon.activeBuffs[key];
      return null;
    }
    return buff;
  },

  _getDomainShadowMultiplier(dungeon) {
    const buff = this._getActiveBuff(dungeon, 'domain');
    return buff ? buff.statMultiplier : 1;
  },

  _getRulersForceResistReduction(dungeon) {
    const debuff = this._getActiveDebuff(dungeon, 'rulers_force');
    return debuff ? debuff.resistReduction : 0;
  },

  _isBossStunned(dungeon) {
    return !!this._getActiveDebuff(dungeon, 'rulers_force');
  },

  _getBloodlustStatReduction(dungeon) {
    const debuff = this._getActiveDebuff(dungeon, 'bloodlust_stats');
    return debuff?.statReduction || 0;
  },

  _getSprintCooldownReduction(dungeon) {
    const buff = this._getActiveBuff(dungeon, 'sprint');
    return buff ? buff.cooldownReduction : 0;
  },
};
