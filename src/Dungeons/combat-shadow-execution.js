const C = require('./constants');

module.exports = {
  async processShadowAttacks(channelKey, cyclesMultiplier = 1, isWindowVisible = null, shadowBudget = 250) {
    try {
      // PERF: Use hoisted visibility when available
      if (isWindowVisible === null) isWindowVisible = this.isWindowVisible();
      if (!isWindowVisible) {
        cyclesMultiplier = Math.max(1, Math.floor(cyclesMultiplier * 0.25)); // 75% reduction when hidden
      }

      // Validate active dungeon status periodically (deterministic cadence avoids RNG jitter).
      if (isWindowVisible && this._combatTickCount % 10 === 0) {
        this.validateActiveDungeonStatus();
      }

      const dungeon = this._getActiveDungeon(channelKey);
      if (!dungeon) {
        this.stopShadowAttacks(channelKey);
        // If this was the active dungeon, clear active status
        if (this.settings.userActiveDungeon === channelKey) {
          this.settings.userActiveDungeon = null;
          this.saveSettings();
        }
        return;
      }

      if (dungeon.boss.hp <= 0 && dungeon.mobs?.activeMobs?.length === 0) {
        // Demon Castle non-boss floors use sentinel bosses (hp:0) — don't stop combat
        // while mobs are still spawning (remaining > 0).
        if (!dungeon._isDemonCastle || (dungeon.mobs?.remaining || 0) <= 0) {
          this.stopShadowAttacks(channelKey);
          return;
        }
      }

      if (!this.shadowArmy) {
        this.settings.debug && console.log(`[Dungeons] COMBAT_TRACE: processShadowAttacks — SKIP, no shadowArmy ref`);
        return;
      }

      try {
        if (!dungeon.shadowCombatData || !(dungeon.shadowCombatData instanceof Map)) {
          dungeon.shadowCombatData = new Map();
        }
        if (!dungeon.shadowHP || !(dungeon.shadowHP instanceof Map)) {
          dungeon.shadowHP = new Map();
          if (!dungeon.shadowAttacks || typeof dungeon.shadowAttacks !== 'object') {
            dungeon.shadowAttacks = {};
            this.debugLog?.('SHADOW_ATTACKS', 'shadowAttacks reinitialized (was null/invalid)', {
              channelKey,
            });
          }
        }

        // PERF: preSplitShadowArmy (IDB read + sort) called at most once per tick
        const hasAllocation =
          this.shadowAllocations.has(channelKey) &&
          this.shadowAllocations.get(channelKey)?.length > 0;
        const hardExpired = this._isAllocationHardExpired();
        const deployRebalancePending =
          dungeon?._deployPendingFullAllocation === true ||
          this._deployRebalanceInFlight?.has?.(channelKey);

        let didReallocate = false;
        if ((hardExpired || this._allocationDirty || !hasAllocation) && !this._tickAllocationLock) {
          if (deployRebalancePending) {
            // Keep combat loop responsive while async deploy rebalance computes full split.
            !hasAllocation && this.ensureDeployedSpawnPipeline(channelKey, 'combat_waiting_for_rebalance');
          } else {
            this._markAllocationDirty(hardExpired ? 'combat-hard-refresh' : 'combat-missing-allocation');
            this._tickAllocationLock = true;
            await this.preSplitShadowArmy();
            didReallocate = true;
          }
        }

        const assignedShadows = this.shadowAllocations.get(channelKey);
        if (!assignedShadows || assignedShadows.length === 0) {
          this.settings.debug && console.log(`[Dungeons] COMBAT_TRACE: processShadowAttacks — NO shadows for ${channelKey}`);
          return;
        }

        this.syncDungeonDifficultyScale(dungeon, channelKey);

        // Reinforcement: if this dungeon is underpowered, reallocate stronger shadows.
        // PERF: Skip if we already reallocated above (max 1 preSplit per tick).
        if (!didReallocate && !deployRebalancePending) {
          const nowRebalance = Date.now();
          const lastRebalance = this._lastRebalanceAt.get(channelKey) || 0;
          const rebalanceAllowed = nowRebalance - lastRebalance >= this._rebalanceCooldownMs;

          if (rebalanceAllowed) {
            const dungeonRankIndex = this.getRankIndexValue(dungeon.rank);
            const avgAssignedRankIndex =
              assignedShadows.reduce((sum, s) => sum + this.getRankIndexValue(s?.rank || 'E'), 0) /
              Math.max(1, assignedShadows.length);
            const expected = dungeon?.boss?.expectedShadowCount || 1;
            const isBossAlive = (dungeon?.boss?.hp || 0) > 0;
            const bossFraction =
              dungeon?.boss?.maxHp && dungeon?.boss?.hp >= 0 ? dungeon.boss.hp / dungeon.boss.maxHp : 0;
            const needsRebalance =
              assignedShadows.length < Math.max(1, Math.floor(expected * 0.75)) ||
              avgAssignedRankIndex < dungeonRankIndex - 0.9 ||
              (isBossAlive && bossFraction > 0.6 && assignedShadows.length < expected);

            if (needsRebalance && !this._tickAllocationLock) {
              this._lastRebalanceAt.set(channelKey, nowRebalance);
              this._markAllocationDirty('combat-rebalance');
              this._tickAllocationLock = true;
              await this.preSplitShadowArmy();
              this.syncDungeonDifficultyScale(dungeon, channelKey, { scaleExistingMobs: true });
            }
          }
        }

        const deadShadows = this.deadShadows.get(channelKey) || new Set();
        const shadowHP = dungeon.shadowHP || (dungeon.shadowHP = new Map());
        this.maybePruneDungeonShadowState({ dungeon, channelKey, assignedShadows, deadShadows });

        // Each shadow has individual cooldowns and behaviors for chaotic combat
        if (!dungeon.shadowCombatData || !(dungeon.shadowCombatData instanceof Map)) {
          dungeon.shadowCombatData = new Map();
        }

        // Init ALL assigned shadows (not just combat-ready) — getCombatReadyShadows filters later
        for (const shadow of assignedShadows) {
          const shadowId = this.getShadowIdValue(shadow);
          if (!shadowId) continue;
          if (deadShadows.has(shadowId)) continue;
          if (!isWindowVisible && shadowHP.has(shadowId)) continue;

          try {
            this.initializeShadowHPSync(shadow, shadowHP);

            !dungeon.shadowCombatData.has(shadowId) &&
              dungeon.shadowCombatData.set(shadowId, this.initializeShadowCombatData(shadow, dungeon));
          } catch (error) {
            this.errorLog('SHADOW_INIT', `Failed to initialize shadow ${shadowId}`, error);
          }
        }

        // Resurrect dead shadows each tick (breaks early when mana runs out); skip when hidden
        if (isWindowVisible) {
          if (!dungeon._lastResurrectionAttempt) dungeon._lastResurrectionAttempt = {};
          const nowResurrection = Date.now();

          for (const shadow of assignedShadows) {
            const shadowId = this.getShadowIdValue(shadow);
            if (!shadowId) continue;
            const hpData = shadowHP.get(shadowId);
            if (!hpData || hpData.hp > 0) continue;

            const lastAttempt = dungeon._lastResurrectionAttempt[shadowId] || 0;
            if (nowResurrection - lastAttempt < 2000) continue;

            dungeon._lastResurrectionAttempt[shadowId] = nowResurrection;
            const resurrected = await this.attemptAutoResurrection(shadow, channelKey);
            if (resurrected) {
              if (!hpData.maxHp || hpData.maxHp <= 0) {
                const recalculated = this.initializeShadowHPSync(shadow, shadowHP);
                hpData.maxHp = recalculated?.maxHp || 100;
              }
              hpData.hp = hpData.maxHp;
              shadowHP.set(shadowId, { ...hpData });
              deadShadows.delete(shadowId);
              if (dungeon._cachedAliveCount != null) dungeon._cachedAliveCount++;
              delete dungeon._lastResurrectionAttempt[shadowId];
            } else {
              // Mana ran out — stop trying, remaining dead shadows wait for regen
              break;
            }
          }
        }

        const bossStats = {
          strength: dungeon.boss.strength,
          agility: dungeon.boss.agility,
          intelligence: dungeon.boss.intelligence,
          vitality: dungeon.boss.vitality,
          perception: dungeon.boss.perception,
        };

        // Scale mob visibility with dungeon capacity — shadows must SEE mobs to kill them.
        // Old: hard cap at 400 mobs meant 50k-mob SSS dungeons were unkillable.
        // New: scale with dungeon capacity, capped at 5000 visible to keep iteration bounded.
        const dungeonMobCap = Number(dungeon.mobs?.mobCapacity) || 200;
        const scaledMobCap = Math.max(200, Math.min(5000, Math.floor(dungeonMobCap * 0.1)));
        const maxMobsToProcess = isWindowVisible
          ? Math.max(120, scaledMobCap)
          : Math.max(80, Math.floor(scaledMobCap * 0.2));
        const aliveMobs = [];
        for (const m of dungeon.mobs.activeMobs) {
          if (aliveMobs.length >= maxMobsToProcess) break;
          m && m.hp > 0 && aliveMobs.push(m);
        }
        const bossAlive = dungeon.boss.hp > 0;
        const combatSnapshot = this.buildDungeonCombatSnapshot({ dungeon, aliveMobs, bossAlive });

        if (!dungeon.combatAnalytics) {
          dungeon.combatAnalytics = {
            totalBossDamage: 0,
            totalMobDamage: 0,
            shadowsAttackedBoss: 0,
            shadowsAttackedMobs: 0,
            mobsKilledThisWave: 0,
          };
        }
        const analytics = dungeon.combatAnalytics;
        const now = Date.now();

        const activeInterval = 3000;
        const totalTimeSpan = cyclesMultiplier * activeInterval;

        // PERF: Sample representative subset of shadows and scale damage up
        const visibleTargetBudget = aliveMobs.length > 0
          ? Math.max(80, Math.min(shadowBudget, aliveMobs.length * 2))
          : Math.max(100, Math.min(shadowBudget, 160));
        const backgroundTargetBudget = Math.max(20, Math.min(80, Math.floor(assignedShadows.length * 0.25)));
        const sampleCap = isWindowVisible ? visibleTargetBudget : backgroundTargetBudget;

        const { exchangeMarkedIds, sensesDeployedIds } = this._getCachedExclusionSets();
        const combatReadyShadows = [];
        let aliveShadowCount = 0;
        let combatReadyCount = 0;
        for (const shadow of assignedShadows) {
          const shadowId = this.getShadowIdValue(shadow);
          if (!shadowId) continue;

          const shadowKey = String(shadowId);
          const isDead = deadShadows.has(shadowId) || deadShadows.has(shadowKey);
          if (isDead) continue;

          const hpData = shadowHP.get(shadowId) || shadowHP.get(shadowKey);
          if (!hpData || hpData.hp <= 0) continue;
          aliveShadowCount++;

          if (exchangeMarkedIds.has(shadowKey) || sensesDeployedIds.has(shadowKey)) continue;

          // Reservoir sampling keeps memory bounded while preserving representative coverage.
          combatReadyCount++;
          if (combatReadyShadows.length < sampleCap) {
            combatReadyShadows.push(shadow);
          } else {
            const pickIndex = Math.floor(Math.random() * combatReadyCount);
            if (pickIndex < sampleCap) combatReadyShadows[pickIndex] = shadow;
          }
        }
        dungeon._cachedAliveCount = aliveShadowCount;

        // Shadow deployment status tracked internally (debug logs removed for performance)
        if (aliveShadowCount < assignedShadows.length * 0.25 && !dungeon.criticalHPWarningShown) {
          dungeon.criticalHPWarningShown = true;
          this.debugLog(
            `CRITICAL: Only ${aliveShadowCount}/${
              assignedShadows.length
            } shadows alive (${Math.floor((aliveShadowCount / assignedShadows.length) * 100)}%)!`
          );
        }

        const maxShadowsToProcess = combatReadyShadows.length;
        const stride = 1;
        const totalPowerAll =
          Number.isFinite(dungeon?.shadowAllocation?.totalPower) &&
          dungeon.shadowAllocation.totalPower > 0
            ? dungeon.shadowAllocation.totalPower
            : null;
        let sampledPower = 0;
        for (
          let i = 0, processed = 0;
          i < combatReadyShadows.length && processed < maxShadowsToProcess;
          i += stride, processed++
        ) {
          sampledPower += this.getShadowCombatScore(combatReadyShadows[i]);
        }
        const countScale =
          maxShadowsToProcess > 0
            ? Math.max(1, combatReadyCount / maxShadowsToProcess)
            : 1;
        const powerScale =
          totalPowerAll && sampledPower > 0 ? totalPowerAll / sampledPower : countScale;
        // Scale factor cap raised — 25 was silently discarding 43%+ of army damage at 11k shadows.
        // New cap of 200 handles armies up to ~50k with 250-sample budget.
        const scaleFactor = this.clampNumber(powerScale, 0.25, 200);

        // TRACE: Log combat state every 10th tick
        if (this._combatTickCount % 10 === 0) {
          this.settings.debug && console.log(`[Dungeons] COMBAT_TRACE: assigned=${assignedShadows.length}, ready=${combatReadyCount}, sample=${maxShadowsToProcess}, mobs=${aliveMobs.length}, bossHP=${dungeon.boss.hp}, scale=${scaleFactor.toFixed(2)}, cycles=${cyclesMultiplier}`);
        }

        const bossUnlocked = this.ensureBossEngagementUnlocked(dungeon, channelKey);
        const bossAliveNow = dungeon.boss.hp > 0 && bossUnlocked;
        const hasMobs = aliveMobs.length > 0;
        const bossChance = hasMobs
          ? this.getShadowBossTargetChance({ dungeon, aliveMobs, bossUnlocked })
          : bossAliveNow
          ? 1.0
          : 0;
        const bossHpFraction =
          dungeon?.boss?.maxHp && dungeon?.boss?.maxHp > 0
            ? dungeon.boss.hp / dungeon.boss.maxHp
            : 1;
        const roleCombatContext = this.getRoleCombatTickContext(channelKey);
        const rolePressure = this.buildRolePressureBucket();
        const domainMultiplier = this._getDomainShadowMultiplier(dungeon);

        // Rank-stratified mob targets: group by rank for accurate per-rank damage calc instead of a single averaged entity
        const mobRankGroups = new Map(); // rank -> { count, representative, mobsInGroup }
        if (hasMobs) {
          for (let m = 0; m < aliveMobs.length; m++) {
            const mob = aliveMobs[m];
            if (!mob || mob.hp <= 0) continue;
            const rank = mob.rank || dungeon.rank || 'E';
            const existing = mobRankGroups.get(rank);
            if (existing) {
              existing.count++;
              // Running average: accumulate then divide at the end
              existing._sumStr += (Number.isFinite(mob.strength) ? mob.strength : 0);
              existing._sumAgi += (Number.isFinite(mob.agility) ? mob.agility : 0);
              existing._sumInt += (Number.isFinite(mob.intelligence) ? mob.intelligence : 0);
              existing._sumVit += (Number.isFinite(mob.vitality) ? mob.vitality : 0);
              existing._sumPer += (Number.isFinite(mob.perception) ? mob.perception : 0);
              existing.mobsInGroup.push(mob);
            } else {
              mobRankGroups.set(rank, {
                count: 1,
                _sumStr: Number.isFinite(mob.strength) ? mob.strength : 0,
                _sumAgi: Number.isFinite(mob.agility) ? mob.agility : 0,
                _sumInt: Number.isFinite(mob.intelligence) ? mob.intelligence : 0,
                _sumVit: Number.isFinite(mob.vitality) ? mob.vitality : 0,
                _sumPer: Number.isFinite(mob.perception) ? mob.perception : 0,
                representative: null, // computed below
                mobsInGroup: [mob],
              });
            }
          }
          // Finalize: compute average stats per rank group → representative mob target
          let totalMobCount = 0;
          for (const [rank, group] of mobRankGroups) {
            const n = group.count;
            totalMobCount += n;
            group.representative = {
              type: 'mob',
              rank,
              strength: Math.max(1, Math.floor(group._sumStr / n) || 10),
              agility: Math.max(0, Math.floor(group._sumAgi / n)),
              intelligence: Math.max(0, Math.floor(group._sumInt / n)),
              vitality: Math.max(0, Math.floor(group._sumVit / n)),
              perception: Math.max(0, Math.floor(group._sumPer / n)),
            };
            // Fraction of total mobs this rank group represents (for proportional attack split)
            group.fraction = 0; // assigned after totalMobCount is known
          }
          // Second pass: assign fractions
          for (const [, group] of mobRankGroups) {
            group.fraction = totalMobCount > 0 ? group.count / totalMobCount : 0;
          }
        }

        let aggregatedBossDamage = 0;
        // Reuse pooled map to avoid per-tick allocation + GC
        if (!(dungeon._pooledMobDamageMap instanceof Map)) dungeon._pooledMobDamageMap = new Map();
        const mobDamageMap = dungeon._pooledMobDamageMap;
        mobDamageMap.clear();
        // Ensure contributions object exists once before loop
        if (!dungeon.shadowContributions || typeof dungeon.shadowContributions !== 'object') {
          dungeon.shadowContributions = {};
        }
        if (!dungeon.mobs) {
          dungeon.mobs = { killed: 0, remaining: 0, activeMobs: [], total: 0 };
        }

        for (
          let i = 0, processed = 0;
          i < combatReadyShadows.length && processed < maxShadowsToProcess;
          i += stride, processed++
        ) {
          const shadow = combatReadyShadows[i];
          const shadowId = this.getShadowIdValue(shadow);
          if (!shadowId) continue;

          const shadowHPData = shadowHP.get(shadowId);
          if (!shadowHPData || shadowHPData.hp <= 0) continue;

          let combatData = dungeon.shadowCombatData.get(shadowId);
          if (!combatData) {
            combatData = {
              lastAttackTime: Date.now() - 2000, // Allow immediate attack
              attackInterval: 2000,
              personality: 'balanced',
              behavior: 'balanced',
              attackCount: 0,
              damageDealt: 0,
              comboHits: 0,
              lastTargetType: null,
            };
            dungeon.shadowCombatData.set(shadowId, combatData);
          }

          const finalCombatData = combatData;

          const timeSinceLastAttack = Math.max(0, now - (finalCombatData.lastAttackTime || 0));
          let effectiveCooldown = this.getEffectiveAttackCooldownMs(
            finalCombatData.attackInterval || finalCombatData.cooldown || 2000,
            activeInterval
          );

          const sprintReduction = this._getSprintCooldownReduction(dungeon);
          if (sprintReduction > 0) {
            effectiveCooldown = Math.max(800, Math.floor(effectiveCooldown * (1 - sprintReduction)));
          }

          const attacksInSpan = this.calculateAttacksInTimeSpan(
            timeSinceLastAttack,
            effectiveCooldown,
            totalTimeSpan
          );

          if (attacksInSpan <= 0) continue;
          this._addRolePressureSample(rolePressure, shadow, finalCombatData, attacksInSpan, scaleFactor);

          let totalBossDamage = 0;
          let totalMobDamage = 0;

          // Target split
          const half = Math.floor(attacksInSpan * bossChance);
          const bossAttacks =
            bossAliveNow && hasMobs
              ? half + (attacksInSpan % 2 && Math.random() < bossChance ? 1 : 0)
              : bossAliveNow
              ? attacksInSpan
              : 0;
          const mobAttacks = hasMobs ? Math.max(0, attacksInSpan - bossAttacks) : 0;

          // One random variance factor per shadow per tick (keeps chaos without per-hit RNG cost).
          const shadowVariance = this._varianceNarrow();

          // Combo: perception-scaled multiplier for consecutive hits on same target type
          const dominantTarget = bossAttacks >= mobAttacks ? 'boss' : 'mob';
          if (finalCombatData.lastTargetType === dominantTarget) {
            finalCombatData.comboHits = (finalCombatData.comboHits || 0) + attacksInSpan;
          } else {
            finalCombatData.comboHits = attacksInSpan;
            finalCombatData.lastTargetType = dominantTarget;
          }
          const shadowPerception =
            Number.isFinite(finalCombatData?.effectiveStats?.perception)
              ? finalCombatData.effectiveStats.perception
              : (this.getShadowEffectiveStatsCached(shadow) || {}).perception || 0;
          const comboMultiplier = Math.min(2.0, 1 + (finalCombatData.comboHits || 0) * shadowPerception * 0.002);

          if (bossAliveNow && bossAttacks > 0) {
            const perHitBossRaw = this.shadowArmy?.calculateShadowDamage
              ? this.shadowArmy.calculateShadowDamage(shadow, {
                  type: 'boss',
                  rank: dungeon.boss.rank,
                  strength: bossStats.strength,
                  agility: bossStats.agility,
                  intelligence: bossStats.intelligence,
                  vitality: bossStats.vitality,
                  perception: bossStats.perception,
                })
              : this.applyBehaviorModifier(
                  finalCombatData.behavior || 'balanced',
                  this.calculateShadowDamage(shadow, bossStats, dungeon.boss.rank)
                );
            const roleBossMultiplier = this.getRoleCombatOutgoingDamageMultiplier({
              shadow,
              combatData: finalCombatData,
              targetType: 'boss',
              bossHpFraction,
              roleCombatContext,
            });
            const perHitBoss = Math.max(1, Math.floor(perHitBossRaw * roleBossMultiplier));
            totalBossDamage = Math.floor(bossAttacks * perHitBoss * shadowVariance * scaleFactor * comboMultiplier * domainMultiplier);
            // Shadow vs boss damage reduction — mirrors boss→shadow 0.6x
            const shadowBossReduction = C.SHADOW_VS_BOSS_DAMAGE_MULT || 0.35;
            totalBossDamage = Math.max(1, Math.floor(totalBossDamage * shadowBossReduction));
            totalBossDamage > 0 && analytics.shadowsAttackedBoss++;
          }

          if (hasMobs && mobAttacks > 0 && mobRankGroups.size > 0) {
            let mobDamageApplied = false;
            for (const [, rankGroup] of mobRankGroups) {
              const groupAttacks = Math.max(0, Math.round(mobAttacks * rankGroup.fraction));
              if (groupAttacks <= 0) continue;

              const perHitMobRaw = this.shadowArmy?.calculateShadowDamage
                ? this.shadowArmy.calculateShadowDamage(shadow, rankGroup.representative)
                : this.applyBehaviorModifier(
                    finalCombatData.behavior || 'balanced',
                    this.calculateShadowDamage(shadow, rankGroup.representative, rankGroup.representative.rank)
                  );
              const roleMobMultiplier = this.getRoleCombatOutgoingDamageMultiplier({
                shadow,
                combatData: finalCombatData,
                targetType: 'mob',
                bossHpFraction,
                roleCombatContext,
              });
              const perHitMob = Math.max(1, Math.floor(perHitMobRaw * roleMobMultiplier));
              const unscaledDamage = Math.floor(groupAttacks * perHitMob * shadowVariance * comboMultiplier * domainMultiplier);
              if (unscaledDamage <= 0) continue;

              const totalScaledDamage = Math.floor(unscaledDamage * scaleFactor);
              let remainingDamage = totalScaledDamage;
              const groupMobs = rankGroup.mobsInGroup;
              const groupLen = groupMobs.length;

              if (rankGroup._rrIdx == null) rankGroup._rrIdx = 0;

              // --- FAMILY/ROLE-SPECIFIC AOE ---
              // Each shadow type has a unique ability: dragon breath, swarm rush, fireball, etc.
              // Lookup by role key → C.SHADOW_AOE[role] for proc chance, targets, damage, boss-hit.
              const aoeTable = C.SHADOW_AOE;
              if (aoeTable && groupLen > 1) {
                const shadowRole = this.normalizeShadowRoleKey?.(
                  shadow?.role || shadow?.roleName || shadow?.ro || ''
                ) || '';
                const aoeAbility = aoeTable[shadowRole] || aoeTable._default;

                if (aoeAbility && Math.random() < aoeAbility.chance) {
                  const aoeTargets = aoeAbility.targets || 2;
                  const aoeDmgFrac = aoeAbility.dmgFrac || 0.35;
                  const cleaveDmg = Math.max(1, Math.floor(perHitMob * aoeDmgFrac * shadowVariance * scaleFactor));

                  // Hit nearby mobs
                  for (let aoeIdx = 0; aoeIdx < aoeTargets && aoeIdx < groupLen; aoeIdx++) {
                    const cleaveOffset = (rankGroup._rrIdx + aoeIdx + 1) % groupLen;
                    const cleaveMob = groupMobs[cleaveOffset];
                    if (!cleaveMob || cleaveMob.hp <= 0) continue;
                    const cleaveKey = this.getEnemyKey(cleaveMob, 'mob');
                    if (!cleaveKey) continue;
                    const cleaveAccum = mobDamageMap.get(cleaveKey) || 0;
                    const cleaveEffHP = cleaveMob.hp - cleaveAccum;
                    if (cleaveEffHP <= 0) continue;
                    const toApply = Math.min(cleaveDmg, cleaveEffHP + 1);
                    mobDamageMap.set(cleaveKey, cleaveAccum + toApply);
                    this._recordShadowMobDamageContribution(dungeon, cleaveKey, shadowId, toApply);
                    totalMobDamage += toApply;
                  }

                  // Boss-hitting AOEs (dragon breath, hellfire, titan slam, etc.)
                  if (aoeAbility.hitBoss && bossAliveNow && dungeon.boss.hp > 0) {
                    const bossDmgReduction = C.SHADOW_VS_BOSS_DAMAGE_MULT || 0.35;
                    const aoeBossDmg = Math.max(1, Math.floor(cleaveDmg * bossDmgReduction));
                    totalBossDamage += aoeBossDmg;
                  }
                }
              }

              // Spread damage across enough mobs to be realistic — scale with both scaleFactor and group size.
              const maxIter = Math.min(groupLen, Math.max(Math.ceil(scaleFactor) * 2, Math.floor(groupLen * 0.1), 30));
              let iter = 0;
              let fullLoopWithoutHit = false;

              while (remainingDamage > 0 && iter < maxIter && !fullLoopWithoutHit) {
                iter++;
                // Round-robin: advance to next mob in group
                const idx = rankGroup._rrIdx % groupLen;
                rankGroup._rrIdx = (rankGroup._rrIdx + 1) % groupLen;
                const mob = groupMobs[idx];
                if (!mob || mob.hp <= 0) {
                  if (iter >= groupLen) fullLoopWithoutHit = true;
                  continue;
                }
                const mobId = this.getEnemyKey(mob, 'mob');
                if (!mobId) continue;

                const accumulatedDmg = mobDamageMap.get(mobId) || 0;
                const effectiveHP = mob.hp - accumulatedDmg;
                if (effectiveHP <= 0) {
                  if (iter >= groupLen) fullLoopWithoutHit = true;
                  continue;
                }

                // Apply at most enough damage to kill this mob
                const damageToApply = Math.min(remainingDamage, effectiveHP + 1);
                mobDamageMap.set(mobId, accumulatedDmg + damageToApply);
                this._recordShadowMobDamageContribution(dungeon, mobId, shadowId, damageToApply);
                remainingDamage -= damageToApply;
                totalMobDamage += damageToApply;
              }

              // Dump any remaining (all mobs in group dead) on last mob for extraction tracking
              if (remainingDamage > 0 && groupLen > 0) {
                const fallback = groupMobs[rankGroup._rrIdx % groupLen];
                const fallbackId = this.getEnemyKey(fallback, 'mob');
                if (fallbackId) {
                  mobDamageMap.set(fallbackId, (mobDamageMap.get(fallbackId) || 0) + remainingDamage);
                  this._recordShadowMobDamageContribution(dungeon, fallbackId, shadowId, remainingDamage);
                  totalMobDamage += remainingDamage;
                }
              }

              mobDamageApplied = true;
            }
            if (mobDamageApplied) analytics.shadowsAttackedMobs++;
          }

          this.applyShadowCombatStatusEffects({
            channelKey,
            shadow,
            combatData: finalCombatData,
            attacksInSpan,
            bossAttacks,
            mobAttacks,
            aliveMobs,
            bossAlive: bossAliveNow,
            now,
          });

          if (totalBossDamage > 0) {
            aggregatedBossDamage += totalBossDamage;
            analytics.totalBossDamage += totalBossDamage;
            this._addShadowContribution(dungeon, shadowId, 'bossDamage', totalBossDamage);
          }

          analytics.totalMobDamage += totalMobDamage;

          if (!dungeon.shadowCombatData || !(dungeon.shadowCombatData instanceof Map)) {
            dungeon.shadowCombatData = new Map();
          }

          const combatDataToUpdate = dungeon.shadowCombatData.get(shadowId);
          if (!combatDataToUpdate) {
            // Reinitialize combat data defensively to avoid crash
            if (shadow) {
               dungeon.shadowCombatData.set(shadowId, this.initializeShadowCombatData(shadow));
            }
            continue;
          }
          combatDataToUpdate.attackCount += attacksInSpan;
          combatDataToUpdate.damageDealt += totalBossDamage + totalMobDamage;

          combatDataToUpdate.lastAttackTime = this.getPostAttackTimestamp(
            now,
            timeSinceLastAttack,
            effectiveCooldown,
            totalTimeSpan,
            attacksInSpan
          );

          if (this.shadowArmy?.calculateShadowAttackInterval) {
            const newInterval = this.shadowArmy.calculateShadowAttackInterval(shadow, 2000);
            combatDataToUpdate.attackInterval = newInterval;
          } else {
            const cooldownVariance = this._varianceNarrow();
            combatDataToUpdate.attackInterval = Math.max(
              800,
              Math.floor((combatDataToUpdate.attackInterval || combatDataToUpdate.cooldown || 2000) * cooldownVariance)
            );
          }
        }

        if (this.isRoleCombatModelEnabled()) {
          const updatedRoleState = this.updateRoleCombatStateFromPressure(channelKey, rolePressure);
          if (updatedRoleState && this.settings.debug && this._combatTickCount % 20 === 0) {
            console.log(
              `[Dungeons] ROLE_COMBAT: key=${channelKey}, mark=${updatedRoleState.mark.toFixed(2)}, guard=${updatedRoleState.guard.toFixed(3)}, weaken=${updatedRoleState.weaken.toFixed(3)}`
            );
          }
        }

        // Apply aggregated boss damage once (was per-shadow)
        if (aggregatedBossDamage > 0) {
          await this.applyDamageToBoss(channelKey, aggregatedBossDamage, 'shadow', null);
        }

        const deadMobsThisTick = [];
        if (mobDamageMap.size > 0) {
          const statusApplyTs = Date.now();
          this.batchApplyDamage(
            mobDamageMap,
            aliveMobs,
            (mob, damage) => {
              const mobId = this.getEnemyKey(mob, 'mob');
              const adjustedDamage = this.applyStatusAdjustedIncomingDamage(
                channelKey,
                'mob',
                mobId,
                damage,
                statusApplyTs
              );
              this.applyDamageToEntityHp(mob, adjustedDamage);
            },
            combatSnapshot.mobById
          );

          mobDamageMap.forEach((_damage, mobId) => {
            const mob = combatSnapshot.mobById.get(mobId);
            if (!mob || mob.hp > 0) return; // Only process dead mobs
            analytics.mobsKilledThisWave++;
            const killAttributed = this._applyMobKillContributionsFromLedger(dungeon, mobId, 1);
            if (!killAttributed) {
              const fallbackAttributed = this._applyFallbackMobKillContribution(
                dungeon,
                this.shadowAllocations.get(channelKey) || dungeon.shadowAllocation?.shadows || [],
                null,
                1
              );
              if (!fallbackAttributed) {
                this._logMobContributionMiss(channelKey, mobId, { phase: 'processShadowAttacks' });
              }
            }
            this._onMobKilled(channelKey, dungeon, mob.rank);
            deadMobsThisTick.push(mob);
          });
          if (deadMobsThisTick.length > 0) {
            this.settings.debug && console.log(`[Dungeons] COMBAT_TRACE: Fast-path — ${deadMobsThisTick.length} mobs killed (dmgMap=${mobDamageMap.size})`);
          }
          for (const mob of deadMobsThisTick) {
            this._addToCorpsePile(channelKey, mob, false);
          }
        }

        // Only compact + prune when mobs died — both scan activeMobs, skip when nothing changed
        if (deadMobsThisTick.length > 0) {
          this._cleanupDungeonActiveMobs(dungeon);
          this._pruneShadowMobContributionLedger(dungeon);
        }

        this.queueHPBarUpdate(channelKey);

        this.deadShadows.set(channelKey, deadShadows);
      } catch (error) {
        this.errorLog('Error processing shadow attacks', error);
      }
    } catch (error) {
      this.errorLog('CRITICAL', 'Fatal error in processShadowAttacks', { channelKey, error });
    }
  },

  async getAllShadows(useCache = true) {
    // PERF: 10s TTL — shadow data only changes on extraction/rank-up/growth,
    // all of which call invalidateShadowsCache() explicitly. Old 1s TTL caused
    // redundant IDB reads and was the root cause of ~5s cold-cache first-deploy.
    if (useCache && this._shadowsCache) {
      const now = Date.now();
      if (now - this._shadowsCache.timestamp < 10000) {
        return this._shadowsCache.shadows;
      }
    }

    if (!this.shadowArmy) return [];

    // CROSS-PLUGIN SNAPSHOT: Check ShadowArmy's shared snapshot before hitting IDB.
    // If ShadowArmy already has a fresh snapshot (<2s old), use it directly —
    // avoids redundant IDB cursor + decompression that other consumers already triggered.
    const snapshot = this.shadowArmy.getShadowSnapshot?.();
    if (snapshot) {
      // Normalize identifiers on snapshot (ShadowArmy's snapshot is already decompressed)
      snapshot.forEach((s) => { if (s && !s.id) s.id = s.i; });
      this._shadowsCache = { shadows: snapshot, timestamp: Date.now() };
      return snapshot;
    }

    // CRITICAL: Only use IndexedDB storageManager - no fallback to old settings.shadows
    if (!this.shadowArmy.storageManager) {
      // Return cached value immediately instead of blocking for 2.5s
      return this._shadowsCache?.shadows ?? [];
    }

    try {
      // Get shadows from IndexedDB only (no fallback to old storage)
      const shadows = await this.shadowArmy.storageManager.getShadows({}, 0, Infinity);
      if (!shadows || !Array.isArray(shadows)) {
        this.debugLog('GET_ALL_SHADOWS', 'No shadows returned from storageManager');
        return [];
      }

      // HYBRID COMPRESSION SUPPORT: Decompress compressed shadows transparently
      // This ensures combat calculations work correctly regardless of compression
      let decompressed = shadows;
      if (shadows.length > 0 && this.shadowArmy.getShadowData) {
        decompressed = shadows.map((s) => this.shadowArmy.getShadowData(s));
      }

      // Normalize identifiers: ensure every shadow has `id` (some compressed forms use `i` only).
      // This prevents downstream HP init and dead-shadow checks from failing.
      decompressed.forEach((s) => {
        if (!s) return;
        s.id || (s.id = s.i);
      });

      this._shadowsCache = { shadows: decompressed, timestamp: Date.now() };
      return decompressed;
    } catch (error) {
      this.errorLog('Error getting all shadows', error);
      return [];
    }
  },

  invalidateShadowsCache() {
    this._shadowsCache = null;
    this._deployStarterPoolCache = null;
    this._deployStarterPoolCacheTime = null;
    this._deployStarterPoolCacheRank = null;
    this._markAllocationDirty('invalidate-shadows-cache', { shadowSetChanged: true });
  },

  async _preWarmShadowCache() {
    if (!this.started || !this.shadowArmy) return;

    try {
      const shadowCount = await this.getShadowCount();
      // Large armies: pre-warm only deploy starter pool to avoid an expensive full-army scan/sort at startup.
      if (shadowCount > 25000) {
        const starterPoolCount = await this._warmDeployStarterPool({
          targetCount: this._deployStarterShadowCap || 240,
          sampleLimit: Math.max(1000, Math.floor((this._deployStarterShadowCap || 240) * 6)),
        });
        if (starterPoolCount > 0) {
          this.settings.debug &&
            console.log(
              `[Dungeons] 🔥 PRE-WARM: Starter deploy pool ready — ${starterPoolCount} sampled shadows (shadowCount=${shadowCount.toLocaleString()})`
            );
        }
        return;
      }

      const allShadows = await this.getAllShadows(false); // force fresh read, populates _shadowsCache
      if (!this.started || !Array.isArray(allShadows) || allShadows.length === 0) return;

      // Build sorted cache (same logic as preSplitShadowArmy lines 8272-8286)
      // This is the primary source _buildDeployStarterAllocation checks first (60s TTL).
      if (!this._allocationSortedShadowsCache || this._allocationSortedShadowsCache.length === 0) {
        const sortedCache = await this._buildSortedShadowCache(allShadows, { yieldEvery: 2500 });
        if (!sortedCache) return;
        const normalized = sortedCache.sorted;

        // Only write if still empty (another path may have populated it during our async work)
        if (!this._allocationSortedShadowsCache || this._allocationSortedShadowsCache.length === 0) {
          this._allocationSortedShadowsCache = normalized;
          this._allocationSortedShadowsCacheTime = Date.now();
          this._allocationScoreCache = sortedCache.scoreCache;
          this._allocationShadowSetDirty = false;
        }

        this.settings.debug && console.log(
          `[Dungeons] 🔥 PRE-WARM: Shadow cache ready — ${normalized.length} shadows sorted for instant deploy`
        );
      }
    } catch (error) {
      // Non-fatal: first deploy falls back to cold-cache path (current behavior)
      this.debugLog('PRE_WARM', 'Shadow cache pre-warm failed (non-fatal)', { error: error?.message });
    }
  },

};
