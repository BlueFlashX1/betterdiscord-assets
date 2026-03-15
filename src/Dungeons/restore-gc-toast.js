module.exports = {
  async restoreActiveDungeons() {
    if (!this.storageManager) return;
    // Guard against double-restore during rapid reload cycles
    if (this._restoringDungeons) return;
    this._restoringDungeons = true;

    // CRITICAL: Clean up any orphaned HP bars from previous session FIRST
    // This prevents lingering HP bars from old dungeons
    const orphans = document.querySelectorAll('.dungeon-boss-hp-bar, .dungeon-boss-hp-container');
    if (orphans.length > 0) {
      orphans.forEach((el) => el.remove());
      this.debugLog(`Cleaned up ${orphans.length} orphaned HP bars from previous session`);
    }

    try {
      const savedDungeons = await this.storageManager.getAllDungeons();

      // Validate userActiveDungeon exists in restored dungeons
      if (this.settings.userActiveDungeon) {
        const activeDungeonExists = savedDungeons.some(
          (d) => d.channelKey === this.settings.userActiveDungeon && !d.completed && !d.failed
        );
        if (!activeDungeonExists) {
          // Clear invalid reference
          this.settings.userActiveDungeon = null;
          this.saveSettings();
          this.debugLog('Cleared stale userActiveDungeon reference on restore');
        }
      }

      // GUARD: If plugin was stopped while awaiting IDB read, bail out.
      if (!this.started) {
        this.debugLog?.('restoreActiveDungeons aborted — plugin stopped during IDB read');
        return;
      }

      savedDungeons.forEach((dungeon) => {
        const elapsed = Date.now() - dungeon.startTime;
        if (elapsed < this.settings.dungeonDuration && !dungeon.completed && !dungeon.failed) {
          // Ensure activeMobs array exists
          if (!dungeon.mobs?.activeMobs) {
            dungeon.mobs.activeMobs = [];
          }
          // Ensure shadowHP exists as a Map (convert from plain object if loaded from JSON)
          if (!dungeon.shadowHP) {
            dungeon.shadowHP = new Map();
          } else if (!(dungeon.shadowHP instanceof Map)) {
            const loaded = dungeon.shadowHP;
            dungeon.shadowHP = new Map(Object.entries(loaded));
          }

          // Ensure shadowCombatData exists as a Map (convert from plain object if loaded from JSON)
          if (!dungeon.shadowCombatData) {
            dungeon.shadowCombatData = new Map();
          } else if (!(dungeon.shadowCombatData instanceof Map)) {
            const loaded = dungeon.shadowCombatData;
            dungeon.shadowCombatData = new Map(Object.entries(loaded));
          }

          // MIGRATION: Legacy dungeons may lack biome/beastFamilies fields.
          // Without this, deploy can fail before mob spawning starts.
          if (!Array.isArray(dungeon.beastFamilies) || dungeon.beastFamilies.length === 0) {
            if (Array.isArray(dungeon.biome?.beastFamilies) && dungeon.biome.beastFamilies.length > 0) {
              dungeon.beastFamilies = [...new Set(dungeon.biome.beastFamilies.filter(Boolean))];
            } else {
              dungeon.beastFamilies = this.getDefaultBeastFamilies();
            }
          }
          if (!dungeon.biome || typeof dungeon.biome !== 'object') {
            dungeon.biome = {
              name: dungeon.type || 'Recovered Biome',
              description: 'Recovered legacy dungeon metadata',
              mobMultiplier: 1,
              beastFamilies: [...dungeon.beastFamilies],
            };
          } else if (!Array.isArray(dungeon.biome.beastFamilies) || dungeon.biome.beastFamilies.length === 0) {
            dungeon.biome.beastFamilies = [...dungeon.beastFamilies];
          }

          // VALIDATE: Ensure boss stats match dungeon rank (fixes any corrupted data)
          if (dungeon.boss && dungeon.rank) {
            this.ensureMonsterRole(dungeon.boss);
            const rankIndex = this.findRankIndex(dungeon.rank);
            if (rankIndex >= 0) {
              // Expected boss stats based on rank (using centralized calculation)
              const expectedBossStats = this.calculateBossBaseStats(rankIndex);
              const {
                strength: expStr,
                agility: expAgi,
                intelligence: expInt,
                vitality: expVit,
                perception: expPerception,
              } = expectedBossStats;

              // Boss stats = mobBase × (2.2–3.0 boss multiplier) × species weight
              // Validate against the full range including species amplification
              const bossSpeciesW = C.BEAST_STAT_WEIGHTS?.[dungeon.boss.beastType] || { strength: 1.0, agility: 1.0, intelligence: 1.0, vitality: 1.0 };
              const range = (bossStatValue, speciesW) => ({
                min: Math.floor(bossStatValue * Math.min(speciesW, 1.0) * 0.8),
                max: Math.ceil(bossStatValue * Math.max(speciesW, 1.0) * 1.2),
              });

              const strRange = range(expStr, bossSpeciesW.strength);
              const agiRange = range(expAgi, bossSpeciesW.agility);
              const intRange = range(expInt, bossSpeciesW.intelligence);
              const vitRange = range(expVit, bossSpeciesW.vitality);
              const perceptionBase =
                ((expStr + expAgi + expInt) / 3) * 0.5;
              const perceptionRange = { min: Math.floor(perceptionBase * 0.5), max: Math.ceil(perceptionBase * 2.0) };

              // Strength
              if (
                !dungeon.boss.strength ||
                dungeon.boss.strength < strRange.min ||
                dungeon.boss.strength > strRange.max
              ) {
                dungeon.boss.strength = this._clampStat(expStr, strRange.min, strRange.max, 'boss.strength');
                if (dungeon.boss.baseStats) dungeon.boss.baseStats.strength = dungeon.boss.strength;
              }
              // Agility
              if (
                !dungeon.boss.agility ||
                dungeon.boss.agility < agiRange.min ||
                dungeon.boss.agility > agiRange.max
              ) {
                dungeon.boss.agility = this._clampStat(expAgi, agiRange.min, agiRange.max, 'boss.agility');
                if (dungeon.boss.baseStats) dungeon.boss.baseStats.agility = dungeon.boss.agility;
              }
              // Intelligence
              if (
                !dungeon.boss.intelligence ||
                dungeon.boss.intelligence < intRange.min ||
                dungeon.boss.intelligence > intRange.max
              ) {
                dungeon.boss.intelligence = this._clampStat(expInt, intRange.min, intRange.max, 'boss.intelligence');
                if (dungeon.boss.baseStats)
                  dungeon.boss.baseStats.intelligence = dungeon.boss.intelligence;
              }
              // Vitality
              if (
                !dungeon.boss.vitality ||
                dungeon.boss.vitality < vitRange.min ||
                dungeon.boss.vitality > vitRange.max
              ) {
                dungeon.boss.vitality = this._clampStat(expVit, vitRange.min, vitRange.max, 'boss.vitality');
                if (dungeon.boss.baseStats) dungeon.boss.baseStats.vitality = dungeon.boss.vitality;
              }
              // Perception
              if (
                !dungeon.boss.perception ||
                dungeon.boss.perception < perceptionRange.min ||
                dungeon.boss.perception > perceptionRange.max
              ) {
                dungeon.boss.perception = this._clampStat(expPerception, perceptionRange.min, perceptionRange.max, 'boss.perception');
                if (dungeon.boss.baseStats)
                  dungeon.boss.baseStats.perception = dungeon.boss.perception;
              }

              // RECALCULATE BOSS HP: Use unweighted base vitality for HP formula.
              // Bosses created before the fix used species-weighted vitality (e.g. golem 1.9×),
              // inflating HP by up to 90%. Recalculate and scale current HP proportionally.
              const rankBonus = this._bossHPBonusTable?.[rankIndex] || 0;
              const staticBossHpMult = this.getStaticBossHpMultiplier(rankIndex);
              const armyMult = C.BOSS_HP_ARMY_MULTIPLIER || 8;
              const correctMaxHP = Math.max(
                1,
                Math.floor((100 + expVit * 10 + rankBonus) * staticBossHpMult * armyMult)
              );
              if (dungeon.boss.maxHp && dungeon.boss.maxHp > correctMaxHP * 1.15) {
                // Boss HP was inflated — scale down proportionally
                const hpRatio = dungeon.boss.hp / dungeon.boss.maxHp;
                dungeon.boss.maxHp = correctMaxHP;
                dungeon.boss.hp = Math.max(1, Math.floor(correctMaxHP * hpRatio));
              }
            }
          }

          // VALIDATE: Ensure mob stats match their rank (fixes any corrupted data)
          if (dungeon.mobs && dungeon.mobs.activeMobs && Array.isArray(dungeon.mobs.activeMobs)) {
            dungeon.mobs.activeMobs.forEach((mob) => {
              this.ensureMonsterRole(mob);
              if (mob.rank) {
                const mobRankIndex = this.findRankIndex(mob.rank);
                if (mobRankIndex >= 0) {
                  // Expected mob stats = rank base × species weight × variance (85-115%)
                  const expectedMobStats = this.calculateMobBaseStats(mobRankIndex);
                  const mobSpeciesW = C.BEAST_STAT_WEIGHTS?.[mob.beastType] || { strength: 1.0, agility: 1.0, intelligence: 1.0, vitality: 1.0 };
                  // Also account for elite/champion tier multipliers (up to 1.7×)
                  const tierMult = mob.mobTier === 'champion' ? 1.7 : mob.mobTier === 'elite' ? 1.35 : 1.0;
                  const expectedBaseStrength = expectedMobStats.strength * mobSpeciesW.strength * tierMult;
                  const expectedBaseAgility = expectedMobStats.agility * mobSpeciesW.agility * tierMult;
                  const expectedBaseIntelligence = expectedMobStats.intelligence * mobSpeciesW.intelligence * tierMult;
                  const expectedBaseVitality = expectedMobStats.vitality * mobSpeciesW.vitality * tierMult;

                  // Validate stats are within reasonable range (75-125% to allow individual variance)
                  const minStrength = expectedBaseStrength * 0.75;
                  const maxStrength = expectedBaseStrength * 1.25;
                  const minAgility = expectedBaseAgility * 0.75;
                  const maxAgility = expectedBaseAgility * 1.25;
                  const minIntelligence = expectedBaseIntelligence * 0.75;
                  const maxIntelligence = expectedBaseIntelligence * 1.25;
                  const minVitality = expectedBaseVitality * 0.75;
                  const maxVitality = expectedBaseVitality * 1.25;

                  // Correct stats if they're way off (outside variance range)
                  if (!mob.strength || mob.strength < minStrength || mob.strength > maxStrength) {
                    const variance = this._varianceWide();
                    mob.strength = Math.floor(expectedBaseStrength * variance);
                    if (mob.baseStats) mob.baseStats.strength = mob.strength;
                  }
                  if (!mob.agility || mob.agility < minAgility || mob.agility > maxAgility) {
                    const variance = this._varianceWide();
                    mob.agility = Math.floor(expectedBaseAgility * variance);
                    if (mob.baseStats) mob.baseStats.agility = mob.agility;
                  }
                  if (
                    !mob.intelligence ||
                    mob.intelligence < minIntelligence ||
                    mob.intelligence > maxIntelligence
                  ) {
                    const variance = this._varianceWide();
                    mob.intelligence = Math.floor(expectedBaseIntelligence * variance);
                    if (mob.baseStats) mob.baseStats.intelligence = mob.intelligence;
                  }
                  if (!mob.vitality || mob.vitality < minVitality || mob.vitality > maxVitality) {
                    const variance = this._varianceWide();
                    mob.vitality = Math.floor(expectedBaseVitality * variance);
                    if (mob.baseStats) mob.baseStats.vitality = mob.vitality;

                    // Recalculate HP based on corrected vitality
                    const baseHP = 200 + mob.vitality * 15 + mobRankIndex * 100;
                    const hpVariance = 0.7 + Math.random() * 0.3;
                    const newHP = Math.max(1, Math.floor(baseHP * hpVariance));
                    const prevMaxHp = mob.maxHp || newHP;
                    mob.maxHp = newHP;
                    // Preserve current HP ratio if mob is alive
                    if (mob.hp > 0 && prevMaxHp) {
                      const hpRatio = mob.hp / prevMaxHp;
                      mob.hp = Math.max(1, Math.floor(newHP * hpRatio));
                    } else {
                      mob.hp = newHP;
                    }
                  }
                }
              }
            });
          }

          // Clear runtime-only flags that should never persist across restarts
          delete dungeon._completing;

          // Ensure dungeon-run XP batching metadata exists and is sane after restore.
          dungeon._xpBatchKey = this._resolveDungeonXPBatchKey(dungeon.channelKey, dungeon);
          dungeon.pendingUserMobXP = Number.isFinite(Number(dungeon.pendingUserMobXP))
            ? Math.max(0, Math.floor(Number(dungeon.pendingUserMobXP)))
            : 0;
          dungeon.pendingUserMobKills = Number.isFinite(Number(dungeon.pendingUserMobKills))
            ? Math.max(0, Math.floor(Number(dungeon.pendingUserMobKills)))
            : 0;
          if (dungeon.pendingUserMobXP > 0) {
            this._pendingDungeonMobXPByBatch?.set(dungeon._xpBatchKey, dungeon.pendingUserMobXP);
          }
          if (dungeon.pendingUserMobKills > 0) {
            this._pendingDungeonMobKillsByBatch?.set(dungeon._xpBatchKey, dungeon.pendingUserMobKills);
          }

          // MIGRATION: Force bossGate to code defaults (saved settings may have stale values)
          if (!dungeon.bossGate || typeof dungeon.bossGate !== 'object') {
            dungeon.bossGate = {
              enabled: this.settings?.bossGateEnabled !== false,
              minDurationMs: this.defaultSettings.bossGateMinDurationMs,
              requiredMobKills: this.defaultSettings.bossGateRequiredMobKills,
              deployedAt: null,
              unlockedAt: null,
            };
          } else {
            dungeon.bossGate.minDurationMs = this.defaultSettings.bossGateMinDurationMs;
            dungeon.bossGate.requiredMobKills = this.defaultSettings.bossGateRequiredMobKills;
          }
          if (dungeon.shadowsDeployed) {
            // Preserve existing deployedAt when present; otherwise self-heal so boss never unlocks immediately on restore.
            if (!Number.isFinite(dungeon.bossGate.deployedAt) || dungeon.bossGate.deployedAt <= 0) {
              dungeon.bossGate.deployedAt = Date.now();
              dungeon.bossGate.unlockedAt = null;
            }
            dungeon.deployedAt = dungeon.bossGate.deployedAt;
          } else {
            dungeon.deployedAt = null;
            dungeon.bossGate.deployedAt = null;
            dungeon.bossGate.unlockedAt = null;
          }

          // MIGRATION: Sync mobCapacity with current formula (handles 15%→100% change)
          if (dungeon.mobs?.targetCount && dungeon.mobs.mobCapacity) {
            const correctCap = Math.floor(Math.max(200, Math.min(2000, dungeon.mobs.targetCount)));
            if (dungeon.mobs.mobCapacity < correctCap) {
              dungeon.mobs.mobCapacity = correctCap;
            }
          }

          this.activeDungeons.set(dungeon.channelKey, dungeon);
          this.startHPBarRestoration(); // PERF: restart if auto-stopped (idempotent)
          const channelInfo = { channelId: dungeon.channelId, guildId: dungeon.guildId };
          this.showDungeonIndicator(dungeon.channelKey, channelInfo);
          // Combat intervals are started AFTER shadow allocation below
          return;
        }

        // Expired or completed/failed - clean up completely
        this.debugLog(
          `[Dungeons] Cleaning up expired/old dungeon: ${dungeon.name} [${dungeon.rank}]`
        );

        // Remove HP bar if it exists
        this.removeBossHPBar(dungeon.channelKey);

        // Remove any HP bar containers
        document
          .querySelectorAll(`.dungeon-boss-hp-container[data-channel-key="${dungeon.channelKey}"]`)
          .forEach((el) => el.remove());

        // Release channel lock if held
        this.channelLocks.delete(dungeon.channelKey);
        this.shadowAllocations.delete(dungeon.channelKey);
        this._discardPendingDungeonMobXP(this._resolveDungeonXPBatchKey(dungeon.channelKey, dungeon));
        this._markAllocationDirty('restore-cleanup-stale-dungeon');

        this.storageManager.deleteDungeon(dungeon.channelKey);

        // Clear from memory if somehow still present
        this.activeDungeons.delete(dungeon.channelKey);
      });

      // GUARD: If plugin was stopped during the forEach, don't start combat loops.
      if (!this.started) {
        this.debugLog?.('restoreActiveDungeons aborted — plugin stopped during dungeon hydration');
        return;
      }

      // Restore dungeons — only start combat for dungeons where shadows were deployed
      if (this.activeDungeons.size > 0) {
        this.settings.debug && console.log(`[Dungeons] INIT_TRACE: restoreActiveDungeons — ${this.activeDungeons.size} dungeons restored`);
        this.debugLog(`Restored ${this.activeDungeons.size} active dungeons`);

        // Allocate shadows only across deployed dungeons
        const deployedCount = [...this.activeDungeons.values()].filter(d => d.shadowsDeployed).length;
        if (deployedCount > 0) {
          this._markAllocationDirty('restore-active-dungeons');
          await this.preSplitShadowArmy();
        }

        for (const [channelKey] of this.activeDungeons) {
          const dg = this.activeDungeons.get(channelKey);

          // HP bar + kill notifications always active
          this.startMobKillNotifications(channelKey);
          this.updateBossHPBar(channelKey);

          // Re-apply dungeon channel indicator (lost on hot-reload / React re-render)
          if (dg?.channelId) {
            this.showDungeonIndicator(channelKey, { channelId: dg.channelId, guildId: dg.guildId });
          }

          // Only restart mob spawning + combat if shadows were deployed before reload
          if (dg?.shadowsDeployed) {
            if (this.settings.debug) {
              const allocCount = (this.shadowAllocations.get(channelKey) || []).length;
              console.log(
                `[Dungeons] 🏰 RESTORE: "${dg.name}" [${dg.rank}] in #${dg.channelName || '?'} (${dg.guildName || '?'}) — ` +
                `Shadows: ${allocCount} | Boss HP: ${dg.boss?.hp?.toLocaleString()}/${dg.boss?.maxHp?.toLocaleString()} | ` +
                `Mobs killed: ${dg.mobs?.killed || 0}/${dg.mobs?.targetCount?.toLocaleString() || '?'} | Key: ${channelKey}`
              );
            }
            this.startMobSpawning(channelKey);
            this.ensureDeployedSpawnPipeline(channelKey, 'restore_deployed');
            await this.startShadowAttacks(channelKey);
            this.startBossAttacks(channelKey);
            this.startMobAttacks(channelKey);
          } else {
            this.settings.debug && console.log(
              `[Dungeons] 🏰 RESTORE (idle): "${dg?.name}" [${dg?.rank}] in #${dg?.channelName || '?'} (${dg?.guildName || '?'}) — ` +
              `Boss HP: ${dg?.boss?.hp?.toLocaleString()}/${dg?.boss?.maxHp?.toLocaleString()} | Key: ${channelKey}`
            );
          }
        }
      }
    } catch (error) {
      this.errorLog('Failed to restore dungeons', error);
    } finally {
      this._restoringDungeons = false;
    }
  },

  async triggerGarbageCollection(trigger = 'manual') {
    this.debugLog(`Triggering garbage collection (${trigger})`);

    // Run dungeon store archival cleanup in periodic/manual GC instead of hot completion path.
    if (this.storageManager) {
      try {
        await this.storageManager.clearCompletedDungeons();
      } catch (error) {
        this.errorLog('Failed to cleanup completed dungeons', error);
      }
    }

    // Clean up old extracted mobs from database (24+ hours old)
    if (this.mobBossStorageManager) {
      try {
        const cleanupResult = await this.mobBossStorageManager.cleanupOldExtractedMobs();
        if (cleanupResult.deleted > 0) {
          this.debugLog(`Cleaned up ${cleanupResult.deleted} old extracted mobs from database`);
        }
      } catch (error) {
        this.errorLog('Failed to cleanup old extracted mobs', error);
      }
    }

    // Clean up stale caches
    const now = Date.now();

    // Clear expired allocation cache
    if (this.allocationCacheTime && now - this.allocationCacheTime > this._allocationHardRefreshTTL) {
      this.allocationCache = null;
      this.allocationCacheTime = null;
      this.debugLog('Cleared expired allocation cache');
    }

    // Periodic cache cleanup — evict entries older than 30 seconds
    const cacheCleanupTime = now;
    if (this._personalityCache?.size > 0) {
      for (const [key, val] of this._personalityCache) {
        if (cacheCleanupTime - (val?.timestamp || 0) > 30000) this._personalityCache.delete(key);
      }
    }
    if (this._memberWidthCache?.size > 0) {
      for (const [key, val] of this._memberWidthCache) {
        if (cacheCleanupTime - (val?.timestamp || 0) > 30000) this._memberWidthCache.delete(key);
      }
    }
    if (this._containerCache?.size > 0) {
      for (const [key, val] of this._containerCache) {
        if (cacheCleanupTime - (val?.timestamp || 0) > 30000) this._containerCache.delete(key);
      }
    }

    // Clean up extraction events (keep only recent 500)
    if (this.extractionEvents && this.extractionEvents.size > 500) {
      const entries = Array.from(this.extractionEvents.entries());
      this.extractionEvents.clear();
      entries.slice(-500).forEach(([k, v]) => this.extractionEvents.set(k, v));
      this.debugLog(`Trimmed extraction events: ${entries.length} → 500`);
    }

    // Clean up shadow army count cache
    if (this.shadowArmyCountCache && this.shadowArmyCountCache.size > 100) {
      this.shadowArmyCountCache.clear();
      this.debugLog('Cleared shadow army count cache');
    }

    // Clean up last attack time maps (remove old entries)
    [this._lastShadowAttackTime, this._lastBossAttackTime, this._lastMobAttackTime].forEach(
      (map) => {
        if (map && map.size > 50) {
          // Keep only entries for active dungeons
          const activeDungeonKeys = new Set(this.activeDungeons.keys());
          map.forEach((value, key) => {
            if (!activeDungeonKeys.has(key)) {
              map.delete(key);
            }
          });
        }
      }
    );
    if (this._roleCombatStates && this._roleCombatStates.size > 0) {
      const activeDungeonKeys = new Set(this.activeDungeons.keys());
      this._roleCombatStates.forEach((_value, key) => {
        if (!activeDungeonKeys.has(key)) this._roleCombatStates.delete(key);
      });
    }

  },

  showToast(message, type = 'info') {
    // PERFORMANCE: Skip toast notifications when window is hidden (except critical errors)
    if (!this.isWindowVisible() && type !== 'error') {
      return;
    }
    // Try to reload plugin reference if not available
    if (!this.toasts) {
      const toastsInstance = this._getPluginSafe('SoloLevelingToasts');
      if (toastsInstance) {
        this.toasts = toastsInstance;
      }
    }

    if (this.toasts?.showToast) {
      try {
        return this.toasts.showToast(message, type, null, {
          callerId: 'dungeons',
          maxPerMinute: 15,
        });
      } catch (error) {
        this.errorLog('Error showing toast via engine:', error);
      }
    }
    // Fallback to BdApi native toast
    BdApi.UI.showToast(message, { type: type === 'level-up' ? 'info' : type });
  }
};
