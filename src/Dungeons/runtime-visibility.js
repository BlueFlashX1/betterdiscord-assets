const { _PluginUtils } = require('./bootstrap-runtime');
const C = require('./constants');
const Dungeons = { RANK_MULTIPLIERS: C.RANK_MULTIPLIERS };

module.exports = {
  isActiveDungeon(channelKey) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return false;

    // FIX: Completed/failed/mid-completion dungeons are NOT active
    if (dungeon.completed || dungeon.failed || dungeon._completing) return false;

    // Active if user is participating
    if (dungeon.userParticipating) return true;

    // Active if user is watching (current channel matches dungeon channel)
    if (this.currentChannelKey === channelKey) return true;

    return false;
  },

  startHPBarRestoration() {
    if (this._hpBarRestoreInterval) return;

    this._hpBarRestoreInterval = setInterval(() => {
      // PERF: Stop interval entirely when no dungeons are active (restarts on dungeon creation)
      if (!this.activeDungeons || this.activeDungeons.size === 0) {
        this.stopHPBarRestoration();
        return;
      }
      // PERFORMANCE: Skip HP bar restoration when window is hidden
      if (!this.isWindowVisible()) {
        return; // Don't update UI when window is not visible
      }

      // Ensure CSS is present before attempting DOM restoration.
      this.ensureBossHpBarCssInjected?.();

      // Only restore for active dungeons in the current channel
      const currentChannelInfo = this.getChannelInfo() || this.getChannelInfoFromLocation();
      if (!currentChannelInfo) return;

      this.activeDungeons.forEach((dungeon, channelKey) => {
        // Only restore if this is the current channel and dungeon is active
        const isCurrentChannel =
          currentChannelInfo.channelId === dungeon.channelId &&
          currentChannelInfo.guildId === dungeon.guildId;

        if (
          !isCurrentChannel ||
          !dungeon ||
          dungeon.completed ||
          dungeon.failed ||
          dungeon._completing ||
          !dungeon.boss || dungeon.boss.hp <= 0
        ) {
          return;
        }

        const existingBar = this.bossHPBars.get(channelKey);
        const container = existingBar?.closest('.dungeon-boss-hp-container');
        const barInDOM = existingBar && existingBar.isConnected;
        const containerInDOM = container && container.isConnected;

        // Restore if bar is missing or not in DOM
        if (!existingBar || !barInDOM || !containerInDOM) {
          // Don't restore if settings layer is open
          if (this.isSettingsLayerOpen()) return;

          // Restore the HP bar
          this.updateBossHPBar(channelKey);
        }
      });
    }, 2000); // Check every 2 seconds

    this._intervals.add(this._hpBarRestoreInterval);
  },

  stopHPBarRestoration() {
    if (this._hpBarRestoreInterval) {
      clearInterval(this._hpBarRestoreInterval);
      this._intervals.delete(this._hpBarRestoreInterval);
      this._hpBarRestoreInterval = null;
    }
  },

  startVisibilityTracking() {
    if (this._visibilityChangeHandler) return;

    this._isWindowVisible = !document.hidden;

    // PERF: Only use visibilitychange — blur/focus fire on every window switch,
    // DevTools click, popout interaction, etc. causing excessive handler churn.
    // visibilitychange fires ONLY on actual tab/window visibility changes.
    this._visibilityChangeHandler = () => {
      const wasVisible = this._isWindowVisible;
      this._isWindowVisible = !document.hidden;

      // Skip if no actual transition (guards against duplicate events)
      if (this._isWindowVisible === wasVisible) return;

      // PERF: Debounce rapid transitions (e.g. Discord reconnect flicker)
      // — coalesce hidden→visible→hidden within 500ms into a single transition
      if (this._visibilityDebounceTimer) {
        clearTimeout(this._visibilityDebounceTimer);
        this._visibilityDebounceTimer = null;
      }

      if (!this._isWindowVisible) {
        // Hidden → pause immediately (save CPU right away)
        this.debugLog('PERF', 'Discord window hidden - pausing dungeon processing');
        this.pauseAllDungeonProcessing();
      } else {
        // Visible → debounce resume by 500ms to avoid rapid hidden→visible→hidden churn
        this._visibilityDebounceTimer = setTimeout(() => {
          this._visibilityDebounceTimer = null;
          if (!document.hidden) {
            if (this._windowHiddenTime && this._pausedIntervals.size > 0) {
              this.debugLog('PERF', 'Discord window visible - simulating elapsed time and resuming');
            }
            this.resumeDungeonProcessingWithSimulation();
          }
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', this._visibilityChangeHandler);

    this._listeners.set('visibility_doc', { target: document, event: 'visibilitychange', handler: this._visibilityChangeHandler });
  },

  stopVisibilityTracking() {
    if (this._visibilityDebounceTimer) {
      clearTimeout(this._visibilityDebounceTimer);
      this._visibilityDebounceTimer = null;
    }
    if (this._visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
      this._visibilityChangeHandler = null;
      // Remove from centralized listener tracking
      this._listeners.delete('visibility_doc');
    }
    this._isWindowVisible = true; // Reset to visible state
  },

  isWindowVisible() {
    // Always check current state in case event handler missed something
    this._isWindowVisible = !document.hidden;
    return this._isWindowVisible;
  },

  pauseAllDungeonProcessing() {
    this._pausedIntervals.clear();

    // Pause all active dungeons
    this.activeDungeons.forEach((dungeon, channelKey) => {
      if (dungeon.completed || dungeon.failed) return;

      const pausedState = {
        shadow: this.shadowAttackIntervals.has(channelKey),
        boss: this.bossAttackTimers.has(channelKey),
        mob: this.mobAttackTimers.has(channelKey),
        lastShadowTime: this._lastShadowAttackTime.get(channelKey) || Date.now(),
        lastBossTime: this._lastBossAttackTime.get(channelKey) || Date.now(),
        lastMobTime: this._lastMobAttackTime.get(channelKey) || Date.now(),
      };

      this.stopShadowAttacks(channelKey);
      this.stopBossAttacks(channelKey);
      this.stopMobAttacks(channelKey);

      // Store state for resumption
      this._pausedIntervals.set(channelKey, pausedState);
    });

    const pausedCount = this._pausedIntervals.size;
    this._windowHiddenTime = pausedCount > 0 ? Date.now() : null;
    this.debugLog('PERF', `Paused ${pausedCount} dungeon(s)`);
  },

  async resumeDungeonProcessingWithSimulation() {
    if (!this._windowHiddenTime) {
      // No pause time recorded, just resume normally
      this.resumeAllDungeonProcessing();
      return;
    }
    if (this._pausedIntervals.size === 0) {
      // Nothing was paused, so skip simulation/logging noise.
      this.resumeAllDungeonProcessing();
      this._windowHiddenTime = null;
      return;
    }

    const elapsedTime = Date.now() - this._windowHiddenTime;
    this.debugLog('PERF', `Simulating ${Math.floor(elapsedTime / 1000)}s of dungeon combat`);

    // Simulate combat for each paused dungeon (ONE-TIME batch calculation per dungeon)
    // Each dungeon uses its own ranks, boss stats, mob stats, and shadow allocations
    for (const [channelKey, pausedState] of this._pausedIntervals.entries()) {
      const dungeon = this._getActiveDungeon(channelKey);
      if (!dungeon) continue;
      if (!dungeon.shadowsDeployed) continue;
      const hadAnyCombatTimer =
        Boolean(pausedState?.shadow) || Boolean(pausedState?.boss) || Boolean(pausedState?.mob);
      if (!hadAnyCombatTimer) continue;

      try {
        // ONE-TIME simulation: Calculates and applies all results for elapsed time
        // Uses dungeon-specific: boss.rank, boss stats, mob ranks, shadow ranks, etc.
        await this.simulateDungeonCombat(channelKey, elapsedTime, pausedState);
      } catch (error) {
        this.errorLog('CRITICAL', 'Error simulating dungeon combat', { channelKey, error });
      }
    }

    // Resume normal processing
    this.resumeAllDungeonProcessing();
    this._windowHiddenTime = null;
    this._pausedIntervals.clear();
  },

  async simulateShadowAttacks(channelKey, cycles) {
    const dungeon = this._getActiveDungeon(channelKey);
    if (!dungeon) return;

    const shadowHP = dungeon.shadowHP || (dungeon.shadowHP = new Map());
    const deadShadows = this.deadShadows.get(channelKey) || new Set();
    const assignedShadows = this.shadowAllocations.get(channelKey) || [];

    // Get alive shadows
    const aliveShadows = this.getCombatReadyShadows(assignedShadows, deadShadows, shadowHP);

    if (aliveShadows.length === 0) return;
    const { weights: contributionWeights, totalWeight: contributionTotalWeight } =
      this._buildShadowContributionWeights(aliveShadows);

    const bossStats = {
      strength: dungeon.boss.strength,
      agility: dungeon.boss.agility,
      intelligence: dungeon.boss.intelligence,
      vitality: dungeon.boss.vitality,
    };

    // Calculate average shadow damage per cycle
    let totalBossDamage = 0;

    // Sample a few shadows to calculate average damage (for performance)
    const sampleSize = Math.min(10, aliveShadows.length);
    for (let i = 0; i < sampleSize; i++) {
      const shadow = aliveShadows[i];
      const shadowDamage = this.calculateShadowDamage(shadow, bossStats, dungeon.boss.rank);
      totalBossDamage += shadowDamage;
    }

    // Average damage per shadow
    const avgBossDamagePerShadow = totalBossDamage / sampleSize;
    const avgMobDamagePerShadow = avgBossDamagePerShadow * 0.7; // Mobs take 70% of boss damage

    // Calculate total damage over cycles using the same boss-vs-mobs split logic as live combat.
    let aliveMobCount = 0;
    if (dungeon.mobs?.activeMobs) {
      for (const mob of dungeon.mobs.activeMobs) {
        mob && mob.hp > 0 && aliveMobCount++;
      }
    }
    const hasMobs = aliveMobCount > 0;
    const bossUnlocked = this.isBossGateUnlocked(dungeon);
    const bossAlive = (dungeon.boss?.hp || 0) > 0 && bossUnlocked;
    const bossShare =
      bossAlive && hasMobs
        ? this.getShadowBossTargetChance({ dungeon, aliveMobs: aliveMobCount, bossUnlocked })
        : bossAlive
        ? 1
        : 0;
    const mobShare = hasMobs ? 1 - bossShare : 0;

    const shadowsPerCycle = Math.floor(aliveShadows.length * 0.5); // ~50% of shadows attack per cycle
    const totalBossDamageOverTime = Math.floor(
      avgBossDamagePerShadow * shadowsPerCycle * cycles * bossShare
    );
    const totalMobDamageOverTime = Math.floor(
      avgMobDamagePerShadow * shadowsPerCycle * cycles * mobShare
    );

    // Apply boss damage
    if (totalBossDamageOverTime > 0) {
      this._distributeWeightedShadowContribution(
        dungeon,
        contributionWeights,
        contributionTotalWeight,
        'bossDamage',
        totalBossDamageOverTime
      );
      dungeon.boss.hp = Math.max(0, dungeon.boss.hp - totalBossDamageOverTime);
      if (dungeon.boss.hp <= 0) {
        // Mark completed + remove HP bar before completeDungeon
        // (same pattern as applyDamageToBoss — prevents restore interval re-injection)
        dungeon.completed = true;
        this.removeBossHPBar(channelKey);
        document
          .querySelectorAll(`.dungeon-boss-hp-container[data-channel-key="${channelKey}"]`)
          .forEach((el) => el.remove());
        this.completeDungeon(channelKey, 'boss');
        return;
      }
    }

    // Apply mob damage (distribute across alive mobs)
    if (totalMobDamageOverTime > 0 && dungeon.mobs?.activeMobs) {
      let aliveCount = 0;
      for (const mob of dungeon.mobs.activeMobs) {
        mob && mob.hp > 0 && aliveCount++;
      }

      if (aliveCount > 0) {
        const damagePerMob = Math.floor(totalMobDamageOverTime / aliveCount);
        const nextActiveMobs = [];
        let simulatedMobKills = 0;
        for (const mob of dungeon.mobs.activeMobs) {
          if (!mob || mob.hp <= 0) continue;
          mob.hp = Math.max(0, mob.hp - damagePerMob);
          if (mob.hp > 0) nextActiveMobs.push(mob);
          else {
            this._onMobKilled(channelKey, dungeon, mob.rank);
            this._addToCorpsePile(channelKey, mob, false);
            simulatedMobKills++;
          }
        }
        dungeon.mobs.activeMobs = nextActiveMobs;
        if (simulatedMobKills > 0) {
          this._distributeWeightedShadowContribution(
            dungeon,
            contributionWeights,
            contributionTotalWeight,
            'mobsKilled',
            simulatedMobKills
          );
        }
      }
    }
    this._pruneShadowMobContributionLedger(dungeon);

    // Update analytics
    if (!dungeon.combatAnalytics) dungeon.combatAnalytics = {};
    dungeon.combatAnalytics.totalBossDamage =
      (dungeon.combatAnalytics.totalBossDamage || 0) + totalBossDamageOverTime;
    dungeon.combatAnalytics.totalMobDamage =
      (dungeon.combatAnalytics.totalMobDamage || 0) + totalMobDamageOverTime;

    // shadowHP is updated in-place (avoid full-object cloning)
  },

  async simulateBossAttacks(channelKey, cycles) {
    const dungeon = this._getActiveDungeon(channelKey);
    if (!dungeon || dungeon.boss.hp <= 0) return;
    const bossRole = this.ensureMonsterRole(dungeon.boss);
    const bossUnlocked = this.isBossGateUnlocked(dungeon);
    if (!bossUnlocked) return;

    const shadowHP = dungeon.shadowHP || (dungeon.shadowHP = new Map());
    const deadShadows = this.deadShadows.get(channelKey) || new Set();
    const assignedShadows = this.shadowAllocations.get(channelKey) || [];

    const aliveShadows = this.getCombatReadyShadows(assignedShadows, deadShadows, shadowHP);

    const bossStats = {
      strength: dungeon.boss.strength,
      agility: dungeon.boss.agility,
      intelligence: dungeon.boss.intelligence,
      vitality: dungeon.boss.vitality,
    };

    const maxTargetsPerAttack = Dungeons.RANK_MULTIPLIERS[dungeon.boss?.rank] || 1;

    // Calculate average damage per attack
    let totalShadowDamage = 0;
    let totalUserDamage = 0;

    if (aliveShadows.length > 0) {
      // Boss attacks shadows — PERF-7: sample median shadow for representative stats
      const sampleShadow = aliveShadows[Math.floor(aliveShadows.length / 2)];
      const shadowStats = this.buildShadowStats(sampleShadow);
      const shadowRank = sampleShadow.rank || 'E';
      const shadowRole =
        sampleShadow.role ||
        sampleShadow.roleName ||
        sampleShadow.ro ||
        this.normalizeShadowRoleKey(sampleShadow.type);
      const avgShadowDamage = this.calculateBossDamageToShadow(
        bossStats,
        shadowStats,
        dungeon.boss.rank,
        shadowRank,
        bossRole,
        shadowRole,
        dungeon.boss.beastFamily
      );

      // Calculate total shadow damage (boss attacks multiple shadows per attack)
      const targetsPerAttack = Math.min(maxTargetsPerAttack, aliveShadows.length);
      totalShadowDamage = Math.floor(avgShadowDamage * targetsPerAttack * cycles);
    } else if (dungeon.userParticipating) {
      // All shadows dead, boss attacks user
      const userStats = this.getUserEffectiveStats();
      const userRank = this.soloLevelingStats?.settings?.rank || 'E';
      const avgUserDamage = this.calculateBossDamageToUser(
        bossStats,
        userStats,
        dungeon.boss.rank,
        userRank,
        bossRole,
        dungeon.boss.beastFamily
      );
      totalUserDamage = Math.floor(avgUserDamage * cycles);
    }

    // Apply shadow damage (distribute across alive shadows)
    if (totalShadowDamage > 0 && aliveShadows.length > 0) {
      const damagePerShadow = Math.floor(totalShadowDamage / aliveShadows.length);
      aliveShadows.forEach((shadow) => {
        const shadowId = this.getShadowIdValue(shadow);
        const hpData = shadowId ? shadowHP.get(shadowId) : null;
        if (hpData) {
          hpData.hp = Math.max(0, hpData.hp - damagePerShadow);
          shadowHP.set(shadowId, hpData);
          // Shadow death handled - will be resurrected when window becomes visible
        }
      });
    }

    // shadowHP is updated in-place (avoid full-object cloning)

    // Apply user damage
    if (totalUserDamage > 0 && dungeon.userParticipating) {
      const adjustedUserDamage = this.applyStatusAdjustedIncomingDamage(
        channelKey,
        'user',
        'user',
        totalUserDamage,
        Date.now()
      );
      this.syncHPFromStats();
      this.settings.userHP = Math.max(0, this.settings.userHP - adjustedUserDamage);
      this.pushHPToStats(true);
      this.startRegeneration(); // PERF: restart regen if it was paused
      if (Number(this.settings.userHP) > 0) {
        this.applyEnemyCombatStatusEffects({
          channelKey,
          attacker: dungeon.boss,
          attackerType: 'boss',
          attacksInSpan: cycles,
          targetType: 'user',
          targetId: 'user',
          now: Date.now(),
        });
      }

      if (this.settings.userHP <= 0) {
        await this.handleUserDefeat(channelKey);
      }
    }

    // shadowHP is updated in-place (avoid full-object cloning)
    dungeon.boss.lastAttackTime = Date.now();

    // saveSettings() is handled once at simulateDungeonCombat() level.
  },

  async simulateMobAttacks(channelKey, cycles) {
    const dungeon = this._getActiveDungeon(channelKey);
    if (!dungeon || !dungeon.mobs?.activeMobs) return;

    const shadowHP = dungeon.shadowHP || (dungeon.shadowHP = new Map());
    const deadShadows = this.deadShadows.get(channelKey) || new Set();
    const assignedShadows = this.shadowAllocations.get(channelKey) || [];

    const aliveShadows = this.getCombatReadyShadows(assignedShadows, deadShadows, shadowHP);

    // Count alive mobs and sample a few for average damage calculation (no full array allocation)
    let aliveMobCount = 0;
    const sampleMobs = [];
    for (const mob of dungeon.mobs.activeMobs) {
      if (!mob || mob.hp <= 0) continue;
      aliveMobCount++;
      sampleMobs.length < 10 && sampleMobs.push(mob);
    }
    if (aliveMobCount === 0) return;

    // Calculate average mob damage (sample a few mobs)
    const sampleSize = sampleMobs.length;

    let totalShadowDamage = 0;
    let totalUserDamage = 0;

    if (aliveShadows.length > 0) {
      // Mobs attack shadows — PERF-7: sample median shadow for representative stats
      const sampleShadow = aliveShadows[Math.floor(aliveShadows.length / 2)];
      const shadowStats = this.buildShadowStats(sampleShadow);
      const shadowRank = sampleShadow.rank || 'E';

      for (const mob of sampleMobs) {
        const mobRole = this.ensureMonsterRole(mob);
        const mobStats = {
          strength: mob.strength,
          agility: mob.agility,
          intelligence: mob.intelligence,
          vitality: mob.vitality,
        };
        const shadowRole =
          sampleShadow.role ||
          sampleShadow.roleName ||
          sampleShadow.ro ||
          this.normalizeShadowRoleKey(sampleShadow.type);
        const avgShadowDamage = this.calculateMobDamageToShadow(
          mobStats,
          shadowStats,
          mob.rank,
          shadowRank,
          mobRole,
          shadowRole,
          mob.beastFamily
        );
        totalShadowDamage += avgShadowDamage;
      }

      const avgShadowDamagePerMob = totalShadowDamage / sampleSize;
      totalShadowDamage = Math.floor(avgShadowDamagePerMob * aliveMobCount * cycles);
    } else if (dungeon.userParticipating) {
      // All shadows dead, mobs attack user
      const userStats = this.getUserEffectiveStats();
      const userRank = this.soloLevelingStats?.settings?.rank || 'E';

      for (const mob of sampleMobs) {
        const mobRole = this.ensureMonsterRole(mob);
        const mobStats = {
          strength: mob.strength,
          agility: mob.agility,
          intelligence: mob.intelligence,
          vitality: mob.vitality,
        };
        const avgUserDamage = this.calculateMobDamageToUser(
          mobStats,
          userStats,
          mob.rank,
          userRank,
          mobRole,
          mob.beastFamily
        );
        totalUserDamage += avgUserDamage;
      }

      const avgUserDamagePerMob = totalUserDamage / sampleSize;
      totalUserDamage = Math.floor(avgUserDamagePerMob * aliveMobCount * cycles);
    }

    // Apply shadow damage (distribute across alive shadows)
    if (totalShadowDamage > 0 && aliveShadows.length > 0) {
      const damagePerShadow = Math.floor(totalShadowDamage / aliveShadows.length);
      aliveShadows.forEach((shadow) => {
        const shadowId = this.getShadowIdValue(shadow);
        const hpData = shadowId ? shadowHP.get(shadowId) : null;
        if (hpData) {
          hpData.hp = Math.max(0, hpData.hp - damagePerShadow);
          shadowHP.set(shadowId, hpData);
        }
      });
    }

    // Apply user damage
    if (totalUserDamage > 0 && dungeon.userParticipating) {
      const adjustedUserDamage = this.applyStatusAdjustedIncomingDamage(
        channelKey,
        'user',
        'user',
        totalUserDamage,
        Date.now()
      );
      this.syncHPFromStats();
      this.settings.userHP = Math.max(0, this.settings.userHP - adjustedUserDamage);
      this.pushHPToStats(true);
      this.startRegeneration(); // PERF: restart regen if it was paused
      const representativeMob = sampleMobs[0] || null;
      if (representativeMob && Number(this.settings.userHP) > 0) {
        this.applyEnemyCombatStatusEffects({
          channelKey,
          attacker: representativeMob,
          attackerType: 'mob',
          attacksInSpan: aliveMobCount * cycles,
          targetType: 'user',
          targetId: 'user',
          now: Date.now(),
        });
      }

      if (this.settings.userHP <= 0) {
        await this.handleUserDefeat(channelKey);
      }
    }

    // shadowHP is updated in-place (avoid full-object cloning)
    // Update mob lastAttackTime for all mobs
    if (dungeon.mobs?.activeMobs) {
      const now = Date.now();
      dungeon.mobs.activeMobs.forEach((mob) => {
        if (mob && mob.hp > 0) {
          mob.lastAttackTime = now;
        }
      });
    }
  },

  resumeAllDungeonProcessing() {
    this.activeDungeons.forEach((dungeon, channelKey) => {
      if (!dungeon || dungeon.completed || dungeon.failed || dungeon._completing) {
        this.shadowAttackIntervals.has(channelKey) && this.stopShadowAttacks(channelKey);
        this.bossAttackTimers.has(channelKey) && this.stopBossAttacks(channelKey);
        this.mobAttackTimers.has(channelKey) && this.stopMobAttacks(channelKey);
        return;
      }
      if (!dungeon.shadowsDeployed) {
        this.shadowAttackIntervals.has(channelKey) && this.stopShadowAttacks(channelKey);
        this.bossAttackTimers.has(channelKey) && this.stopBossAttacks(channelKey);
        this.mobAttackTimers.has(channelKey) && this.stopMobAttacks(channelKey);
        return;
      }

      // Resume intervals if they were running before
      const pausedState = this._pausedIntervals.get(channelKey);
      if (pausedState) {
        if (pausedState.shadow) this.startShadowAttacks(channelKey);
        if (pausedState.boss) this.startBossAttacks(channelKey);
        if (pausedState.mob) this.startMobAttacks(channelKey);
      }

      // Visibility/channel transitions can leave spawn metadata stale.
      // Rehydrate deployed dungeons so combat always has valid mob targets.
      dungeon.shadowsDeployed && this.ensureDeployedSpawnPipeline(channelKey, 'resume_visibility');
    });

    this._pausedIntervals.clear();
  },

  async simulateDungeonCombat(channelKey, elapsedTime, pausedState) {
    const dungeon = this._getActiveDungeon(channelKey);
    if (!dungeon || !dungeon.shadowsDeployed || dungeon.boss.hp <= 0) return;

    // CRITICAL: Sync HP/Mana before simulation
    this.syncHPAndManaFromStats();

    // Calculate how many attack cycles would have occurred
    const shadowInterval = 3000; // 3 seconds
    const bossInterval = 1000; // 1 second
    const mobInterval = 1000; // 1 second

    // Calculate how many attack cycles would have occurred during elapsed time
    // These are used for batch damage calculations, NOT actual combat loops
    const shadowCycles = Math.floor(elapsedTime / shadowInterval);
    const bossCycles = Math.floor(elapsedTime / bossInterval);
    const mobCycles = Math.floor(elapsedTime / mobInterval);

    // ONE-TIME batch calculations (each function calculates and applies all damage at once):
    // - Uses dungeon-specific boss.rank, boss stats, mob ranks, shadow ranks
    // - Calculates total damage over all cycles, then applies in one batch
    // - NOT running actual combat loops - pure math calculation

    // Simulate shadow attacks (damage to boss and mobs) - ONE batch calculation
    if (shadowCycles > 0) {
      await this.simulateShadowAttacks(channelKey, shadowCycles);
      const postShadowDungeon = this._getActiveDungeon(channelKey);
      if (!postShadowDungeon || postShadowDungeon.completed || postShadowDungeon.failed) return;
    }

    // Simulate boss attacks (damage to shadows and user) - ONE batch calculation
    if (bossCycles > 0) {
      await this.simulateBossAttacks(channelKey, bossCycles);
    }

    // Simulate mob attacks (damage to shadows and user) - ONE batch calculation
    if (mobCycles > 0) {
      await this.simulateMobAttacks(channelKey, mobCycles);
    }

    // Update last attack times to current time
    this._lastShadowAttackTime.set(channelKey, Date.now());
    this._lastBossAttackTime.set(channelKey, Date.now());
    this._lastMobAttackTime.set(channelKey, Date.now());

    // Save settings after all simulations
    this.saveSettings();

    // Update boss HP bar if window is visible
    if (this.isWindowVisible()) {
      this.updateBossHPBar(channelKey);
    }

    this.debugLog(
      'PERF',
      `Simulated ${shadowCycles} shadow, ${bossCycles} boss, ${mobCycles} mob cycles for ${channelKey} (${Math.floor(
        elapsedTime / 1000
      )}s elapsed)`
    );
  },

  queueHPBarUpdate(channelKey) {
    if (!this._hpBarUpdateQueue) this._hpBarUpdateQueue = new Set();
    if (!this._lastHPBarUpdate) this._lastHPBarUpdate = {};

    const now = Date.now();
    const lastUpdate = this._lastHPBarUpdate[channelKey] || 0;

    // REDUCED THROTTLE: Max 4 updates per second (250ms) for responsive UI
    // Was 1 second (too laggy), now 250ms (smooth real-time feel)
    if (now - lastUpdate < 250) {
      // Queue for later
      this._hpBarUpdateQueue.add(channelKey);
    } else {
      // Update immediately
      this._lastHPBarUpdate[channelKey] = now;
      this.updateBossHPBar(channelKey);
    }

    // Schedule batch update if not already scheduled
    if (!this._hpBarUpdateScheduled && this._hpBarUpdateQueue.size > 0) {
      this._hpBarUpdateScheduled = true;
      this._hpBarUpdateTimer = this._setTrackedTimeout(() => {
        this._hpBarUpdateTimer = null;
        this.processHPBarUpdateQueue();
      }, 250);
    }
  },

  processHPBarUpdateQueue() {
    if (!this._hpBarUpdateQueue || this._hpBarUpdateQueue.size === 0) {
      this._hpBarUpdateScheduled = false;
      return;
    }

    const now = Date.now();
    const queued = this._hpBarUpdateQueue;
    this._hpBarUpdateQueue = new Set();
    let earliestRetry = Infinity;

    for (const channelKey of queued) {
      const lastUpdate = this._lastHPBarUpdate[channelKey] || 0;
      const elapsed = now - lastUpdate;
      if (elapsed >= 250) {
        this._lastHPBarUpdate[channelKey] = now;
        this.updateBossHPBar(channelKey);
      } else {
        this._hpBarUpdateQueue.add(channelKey);
        const remaining = 250 - elapsed;
        if (remaining < earliestRetry) earliestRetry = remaining;
      }
    }

    // Sleep until earliest throttled entry is ready (was: 60fps rAF spin-loop)
    if (this._hpBarUpdateQueue.size > 0) {
      this._hpBarUpdateTimer = this._setTrackedTimeout(() => {
        this._hpBarUpdateTimer = null;
        this.processHPBarUpdateQueue();
      }, earliestRetry);
    } else {
      this._hpBarUpdateScheduled = false;
    }
  },

  setupChannelWatcher() {
    let lastChannelKey = null;
    let checkScheduled = false;
    let lastIndicatorRefreshAt = 0;

    const checkChannel = () => {
      const channelInfo = this.getChannelInfo() || this.getChannelInfoFromLocation();
      if (!channelInfo) return;

      const currentChannelKey = `${channelInfo.guildId}_${channelInfo.channelId}`;

      // If channel changed, update all boss HP bars and indicators
      if (currentChannelKey !== lastChannelKey) {
        const prevChannelKey = lastChannelKey;
        lastChannelKey = currentChannelKey;
        this.currentChannelKey = currentChannelKey; // Update tracking

        // Validate active dungeon status when channel changes
        this.validateActiveDungeonStatus();

        // Remove all existing boss HP bars first (clean slate)
        this.removeAllBossHPBars();
        this._bossBarCache?.clear?.();

        // Ensure boss HP bar CSS exists before recreating in the new channel.
        this.ensureBossHpBarCssInjected?.();

        // Update indicators when channel changes
        this.updateAllIndicators();

        // Restart attack intervals only when a dungeon's active/background status changes
        this.activeDungeons.forEach((dungeon, channelKey) => {
          if (!dungeon || dungeon.completed || dungeon.failed) return;
          if (!dungeon.shadowsDeployed) {
            this.shadowAttackIntervals.has(channelKey) && this.stopShadowAttacks(channelKey);
            this.bossAttackTimers.has(channelKey) && this.stopBossAttacks(channelKey);
            this.mobAttackTimers.has(channelKey) && this.stopMobAttacks(channelKey);
            return;
          }
          const wasActive = dungeon.userParticipating || prevChannelKey === channelKey;
          const isNowActive = dungeon.userParticipating || currentChannelKey === channelKey;
          if (wasActive === isNowActive) return;

          this.shadowAttackIntervals.has(channelKey) &&
            (this.stopShadowAttacks(channelKey), this.startShadowAttacks(channelKey));
          this.bossAttackTimers.has(channelKey) &&
            (this.stopBossAttacks(channelKey), this.startBossAttacks(channelKey));
          this.mobAttackTimers.has(channelKey) &&
            (this.stopMobAttacks(channelKey), this.startMobAttacks(channelKey));
        });

        // Channel transitions can leave spawn metadata stale while the dungeon still appears "deployed".
        // Force a lightweight spawn-pipeline health check for all deployed dungeons.
        this.activeDungeons.forEach((dungeon, channelKey) => {
          if (!dungeon || dungeon.completed || dungeon.failed || !dungeon.shadowsDeployed) return;
          this.ensureDeployedSpawnPipeline(channelKey, 'channel_switch');
        });

        // Only update HP bars for dungeons in the current channel
        this.activeDungeons.forEach((dungeon, channelKey) => {
          const isCurrentChannel =
            dungeon?.channelId === channelInfo.channelId &&
            dungeon?.guildId === channelInfo.guildId;
          isCurrentChannel && this.updateBossHPBar(channelKey);
        });

        // Force an immediate HP bar refresh for the current channel (bypasses throttling).
        const currentDungeon = this.activeDungeons.get(currentChannelKey);
        if (currentDungeon) {
          this._hpBarUpdateQueue || (this._hpBarUpdateQueue = new Set());
          this._hpBarUpdateQueue.add(currentChannelKey);
          this.processHPBarUpdateQueue?.();
        }
      }

      // Keep indicators resilient against Discord sidebar rerenders even without channel changes.
      // Throttled to avoid unnecessary DOM churn.
      const now = Date.now();
      if (
        this.activeDungeons &&
        this.activeDungeons.size > 0 &&
        now - lastIndicatorRefreshAt >= 2000
      ) {
        this.updateAllIndicators();
        lastIndicatorRefreshAt = now;
      }
    };

    const scheduleCheckChannel = () => {
      if (checkScheduled) return;
      checkScheduled = true;
      this._setTrackedTimeout(() => {
        checkScheduled = false;
        checkChannel();
      }, 150);
    };

    // Check immediately
    checkChannel();

    // PERF(P5-1): Use shared NavigationBus instead of independent pushState wrapper
    if (_PluginUtils?.NavigationBus) {
      this._navBusUnsub = _PluginUtils.NavigationBus.subscribe(() => scheduleCheckChannel());
    }

    // Header MutationObserver removed — redundant with pushState/replaceState wrappers,
    // popstate listener, and fallback interval below. Reduces DOM listener overhead.
    this.channelWatcher = {};

    // PERF: Fallback polling extended to 15s — pushState/replaceState wrappers + popstate handle main path
    this.channelWatcherInterval = setInterval(() => {
      if (!this.isWindowVisible()) return; // PERF(P5-3): Skip when hidden
      if (!this.activeDungeons || this.activeDungeons.size === 0) return;
      scheduleCheckChannel();
    }, 15000);
    this._intervals.add(this.channelWatcherInterval);
  },

  stopChannelWatcher() {
    this.channelWatcher = null;
    if (this.channelWatcherInterval) {
      clearInterval(this.channelWatcherInterval);
      this.channelWatcherInterval = null;
    }

    // PERF(P5-1): Unsubscribe from shared NavigationBus
    if (this._navBusUnsub) {
      this._navBusUnsub();
      this._navBusUnsub = null;
    }
  },

  updateAllIndicators() {
    this.activeDungeons.forEach((dungeon, channelKey) => {
      if (dungeon.completed || dungeon.failed) return;
      const cached = this.dungeonIndicators.get(channelKey);

      // Fast path: cached element still connected and has the attribute → skip DOM work
      if (cached?.isConnected && cached.hasAttribute('data-dungeon-active')) return;

      // Element disconnected or attribute stripped by React re-render → re-apply
      const channelInfo = { channelId: dungeon.channelId, guildId: dungeon.guildId };
      this.removeDungeonIndicator(channelKey);
      this.showDungeonIndicator(channelKey, channelInfo);
    });
  }
};
