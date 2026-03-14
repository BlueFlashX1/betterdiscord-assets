const C = require('./constants');
const Dungeons = { RANK_MULTIPLIERS: C.RANK_MULTIPLIERS };

module.exports = {
  _resolveShadowMapKey(shadowByIdMap, shadowId) {
    if (shadowId === null || shadowId === undefined) return null;
    if (shadowByIdMap?.has?.(shadowId)) return shadowId;

    const shadowIdString = String(shadowId);
    if (shadowByIdMap?.has?.(shadowIdString)) return shadowIdString;

    const numericId = Number(shadowIdString);
    if (Number.isFinite(numericId) && shadowByIdMap?.has?.(numericId)) return numericId;
    return null;
  },

  _getShadowHpDataByKey(shadowHP, shadowByIdMap, shadowId) {
    if (shadowId === null || shadowId === undefined) return null;
    const resolvedKey = this._resolveShadowMapKey(shadowByIdMap, shadowId) ?? shadowId;

    if (shadowHP?.has?.(resolvedKey)) return shadowHP.get(resolvedKey);
    const keyString = String(resolvedKey);
    if (shadowHP?.has?.(keyString)) return shadowHP.get(keyString);

    const numericId = Number(keyString);
    if (Number.isFinite(numericId) && shadowHP?.has?.(numericId)) return shadowHP.get(numericId);
    return null;
  },

  // Check boss HP thresholds and apply enrage stacks (family-scaled intensity)
  _checkBossEnrage(channelKey, dungeon, now = Date.now()) {
    if (!dungeon?.boss || dungeon.boss.hp <= 0) return;
    const maxHp = Number(dungeon.boss.maxHp) || Number(dungeon.boss.hp) || 1;
    const hpFraction = dungeon.boss.hp / maxHp;

    // Determine enrage intensity from boss family
    const bossFamily = dungeon.boss.beastFamily || null;
    const enrageIntensity = bossFamily
      ? ((C.BOSS_ENRAGE_INTENSITY || {})[bossFamily] || 'medium')
      : 'medium';
    if (enrageIntensity === 'none') return; // Constructs don't enrage

    // Intensity-scaled thresholds: high-rage bosses enrage earlier and harder
    // High: triggers at 60%/35% HP (earlier, more dangerous)
    // Medium: triggers at 50%/25% HP (standard)
    // Low: triggers at 40%/15% HP (later, less aggressive)
    const thresholds = enrageIntensity === 'high'
      ? { phase1: 0.60, phase2: 0.35 }
      : enrageIntensity === 'low'
        ? { phase1: 0.40, phase2: 0.15 }
        : { phase1: 0.50, phase2: 0.25 }; // medium (default)

    // Track which phases have already been applied (avoid re-applying)
    if (!dungeon.boss._enragePhases) dungeon.boss._enragePhases = { phase1: false, phase2: false };

    let stacksToApply = 0;

    // Phase 1 threshold
    if (hpFraction <= thresholds.phase1 && !dungeon.boss._enragePhases.phase1) {
      dungeon.boss._enragePhases.phase1 = true;
      stacksToApply += 1;
    }
    // Phase 2 threshold (accumulates with phase 1 if both trigger in one hit)
    if (hpFraction <= thresholds.phase2 && !dungeon.boss._enragePhases.phase2) {
      dungeon.boss._enragePhases.phase2 = true;
      stacksToApply += 1;
    }

    if (stacksToApply <= 0) return;

    // Apply enrage as a status effect on the boss itself
    this._applyCombatStatusToEntity?.({
      channelKey,
      targetType: 'boss',
      targetId: 'boss',
      effectName: 'enrage',
      stackDelta: stacksToApply,
      now,
    });
  },

  async processBossAttacks(channelKey, cyclesMultiplier = 1, isWindowVisible = null, prebuiltShadowByIdMap = null) {
    try {
      // PERFORMANCE: Use hoisted visibility from _combatLoopTick when available
      if (isWindowVisible === null) isWindowVisible = this.isWindowVisible();
      if (!isWindowVisible) {
        // Window hidden - reduce cycles multiplier significantly (75% reduction)
        cyclesMultiplier = Math.max(1, Math.floor(cyclesMultiplier * 0.25)); // Process 75% less
      }

      const dungeon = this._getActiveDungeon(channelKey);
      if (!dungeon || !dungeon.boss || dungeon.boss.hp <= 0) {
        this.stopBossAttacks(channelKey);
        return;
      }

      const now = Date.now();

      // Boss stunned by Ruler's Authority Force, Dragon's Fear, or Bloodlust — skip attacks
      if (this._getActiveDebuff(dungeon, 'rulers_force') || this._getActiveDebuff(dungeon, 'dragons_fear_boss') || this._getActiveDebuff(dungeon, 'bloodlust_boss')) {
        dungeon.boss.lastAttackTime = now;
        return;
      }

      const bossRole = this.ensureMonsterRole(dungeon.boss);
      const bossUnlocked = this.ensureBossEngagementUnlocked(dungeon, channelKey);
      if (!bossUnlocked) {
        // Keep cooldown state fresh so unlocking doesn't burst-apply stale attacks.
        dungeon.boss.lastAttackTime = now;
        return;
      }

      // === ENRAGE CHECK: Apply enrage stacks at HP thresholds (family-scaled intensity) ===
      this._checkBossEnrage(channelKey, dungeon, now);

      const activeInterval = 1000; // Boss attacks every 1 second
      const totalTimeSpan = cyclesMultiplier * activeInterval;
      const bossSlowMultiplier = this.getEntityAttackSlowMultiplier(
        channelKey,
        'boss',
        'boss',
        now
      );
      // Enrage speed boost: reduces effective cooldown
      const enrageSpeedMult = this.getEntityEnrageSpeedMultiplier?.(channelKey, 'boss', 'boss', now) || 1;
      const bossCooldown = this.getEffectiveAttackCooldownMs(
        (dungeon.boss.attackCooldown || activeInterval) * bossSlowMultiplier * enrageSpeedMult,
        activeInterval
      );

      // OPTIMIZATION: Calculate attacks using helper function
      // CRITICAL: Initialize lastAttackTime if not set (prevents one-shot on join)
      if (!dungeon.boss.lastAttackTime || dungeon.boss.lastAttackTime === 0) {
        dungeon.boss.lastAttackTime = now;
      }
      const timeSinceLastAttack = Math.max(0, now - dungeon.boss.lastAttackTime);
      const attacksInSpan = this.calculateAttacksInTimeSpan(
        timeSinceLastAttack,
        bossCooldown,
        totalTimeSpan
      );

      if (attacksInSpan <= 0) return;
      const roleCombatContext = this.getRoleCombatTickContext(channelKey);
      const incomingDamageMultiplier = this.getRoleCombatIncomingDamageMultiplier(
        channelKey,
        roleCombatContext
      );

      // Bloodlust debuff: reduce all boss stats while active
      const bloodlustReduction = this._getBloodlustStatReduction(dungeon);
      const statMult = bloodlustReduction > 0 ? (1 - bloodlustReduction) : 1;
      // Enrage damage boost: amplifies boss stats when enraged
      const enrageDamageMult = this.getEntityEnrageDamageMultiplier?.(channelKey, 'boss', 'boss', now) || 1;
      const combinedStatMult = statMult * enrageDamageMult;
      const bossStats = {
        strength: Math.floor(dungeon.boss.strength * combinedStatMult),
        agility: Math.floor(dungeon.boss.agility * statMult), // Agility not boosted by rage (raw power only)
        intelligence: Math.floor(dungeon.boss.intelligence * combinedStatMult),
        vitality: Math.floor(dungeon.boss.vitality * statMult), // Vitality unaffected
      };

      const { assignedShadows, shadowHP, deadShadows } = this._getDungeonShadowCombatContext(
        channelKey,
        dungeon
      );

      // Get alive shadows ONCE before the attack loop (not per-attack)
      const aliveShadows = this.getCombatReadyShadows(assignedShadows, deadShadows, shadowHP);

      // NUMPY-STYLE: O(1) shadow lookup Map — shared with _applyAccumulatedShadowAndUserDamage.
      // Uses pre-built map from _processDungeonCombatTick when available (avoids rebuilding per attack phase).
      const shadowByIdMap = prebuiltShadowByIdMap || new Map(
        assignedShadows.map((s) => [this.getShadowIdValue(s), s])
      );
      const resolveShadowMapKey = (shadowId) => this._resolveShadowMapKey(shadowByIdMap, shadowId);
      const getShadowHpData = (shadowId) =>
        this._getShadowHpDataByKey(shadowHP, shadowByIdMap, shadowId);

      // BATCH PROCESSING: Calculate all attacks in one calculation with variance
      let totalUserDamage = 0;
      const shadowDamageMap = new Map(); // Track damage per shadow
      const rankIndexForFallback =
        typeof this.getRankIndexValue === 'function'
          ? this.getRankIndexValue(dungeon.boss?.rank || 'E')
          : 0;
      const fallbackAoeTargets = Math.max(1, Math.ceil((rankIndexForFallback + 1) * 1.5));
      const maxTargetsPerAttack = Dungeons.RANK_MULTIPLIERS[dungeon.boss?.rank] || fallbackAoeTargets;

      if (aliveShadows.length > 0) {
        // ACCURATE AOE: Per-attack-round processing with intermediate death tracking.
        // Boss attacks N shadows per round (AOE). After each round, shadows that died
        // are removed from the target pool so they don't absorb subsequent attacks.
        // This prevents overkill: a shadow that dies in round 1 can't be hit in round 2.
        // Performance: O(attacksInSpan × targets) random picks + O(unique shadows hit) damage calcs.
        // For rank-S boss: ~5 attacks × 12 targets = 60 picks + ~30 unique calcs. Very fast.

        // Mutable alive set — shadows are removed when killed during this tick
        const aliveSet = new Set(
          aliveShadows
            .map((shadow) => this.getShadowIdValue(shadow))
            .filter((shadowId) => shadowId !== null && shadowId !== undefined)
            .map((shadowId) => String(shadowId))
        );
        // Cache: one damage calc per unique shadow (reuse across attack rounds)
        const damageCache = new Map(); // shadowId -> baseDamage

        for (let atk = 0; atk < attacksInSpan; atk++) {
          // How many targets this attack round can hit (capped by living shadows)
          const actualTargets = Math.min(maxTargetsPerAttack, aliveSet.size);
          if (actualTargets <= 0) break; // All shadows dead

          // Build alive array for this round (only living shadows)
          // For small target counts, pick from the full array and check aliveSet
          const roundHits = new Map(); // shadowId -> hitCount this round

          // Pick targets for this single attack round
          let picks = 0;
          let attempts = 0;
          const maxAttempts = actualTargets * 3; // prevent infinite loop on sparse alive set
          while (picks < actualTargets && attempts < maxAttempts) {
            attempts++;
            const target = aliveShadows[Math.floor(Math.random() * aliveShadows.length)];
            const targetId = this.getShadowIdValue(target);
            if (targetId === null || targetId === undefined) continue;
            const targetIdKey = String(targetId);
            if (!aliveSet.has(targetIdKey)) continue; // Skip dead shadows
            const hpData = getShadowHpData(targetId);
            if (!hpData || hpData.hp <= 0) {
              aliveSet.delete(targetIdKey);
              continue;
            }
            roundHits.set(targetId, (roundHits.get(targetId) || 0) + 1);
            picks++;
          }

          // Apply damage for this attack round immediately
          const roundVariance = this._varianceWide();
          for (const [shadowId, hits] of roundHits) {
            const resolvedShadowId = resolveShadowMapKey(shadowId) ?? shadowId;
            const target = shadowByIdMap.get(resolvedShadowId);
            if (!target) continue;

            // Cache damage calc (shadow stats don't change within a tick)
            let baseDamage = damageCache.get(resolvedShadowId);
            if (baseDamage == null) {
              const shadowStats = this.buildShadowStats(target);
              const shadowRank = target.rank || 'E';
              const shadowRole =
                target.role || target.roleName || target.ro || this.normalizeShadowRoleKey(target.type);
              baseDamage = this.calculateBossDamageToShadow(
                bossStats,
                shadowStats,
                dungeon.boss.rank,
                shadowRank,
                bossRole,
                shadowRole,
                dungeon.boss.beastFamily
              );
              damageCache.set(resolvedShadowId, baseDamage);
            }

            const roundDamage = Math.floor(baseDamage * hits * roundVariance * incomingDamageMultiplier);
            if (roundDamage <= 0) continue;

            // Apply damage immediately to track intermediate deaths
            const hpData = getShadowHpData(resolvedShadowId);
            if (!hpData || hpData.hp <= 0) {
              aliveSet.delete(String(resolvedShadowId));
              continue;
            }
            hpData.hp = Math.max(0, hpData.hp - roundDamage);
            shadowHP.set(resolvedShadowId, hpData);

            // Accumulate for death processing and resurrection
            shadowDamageMap.set(
              resolvedShadowId,
              (shadowDamageMap.get(resolvedShadowId) || 0) + roundDamage
            );

            // Shadow died this round — remove from future target pool
            if (hpData.hp <= 0) {
              aliveSet.delete(String(resolvedShadowId));
            }
          }
        }
      } else if (dungeon.userParticipating) {
        // ALL shadows dead — batch user damage across all attacks in one go
        const userStats = this.getUserEffectiveStats();
        const userRank = this.soloLevelingStats?.settings?.rank || 'E';

        const baseDamage = this.calculateBossDamageToUser(
          bossStats,
          userStats,
          dungeon.boss.rank,
          userRank,
          bossRole,
          dungeon.boss.beastFamily
        );
        // Same aggregation: N hits × base × smoothed variance
        const aggregateVariance = this._varianceWide();
        totalUserDamage = Math.floor(
          baseDamage * attacksInSpan * aggregateVariance * incomingDamageMultiplier
        );
      }

      // REAL-TIME UPDATE: Queue throttled HP bar update after calculating all damage
      this.queueHPBarUpdate(channelKey);

      await this._applyAccumulatedShadowAndUserDamage({
        shadowDamageMap,
        assignedShadows,
        shadowHP,
        deadShadows,
        channelKey,
        totalUserDamage,
        dungeon,
        userDamageToast: (damage) => `Boss attacked you for ${damage} damage!`,
        shadowByIdMap,
        damageAlreadyApplied: true, // Boss AOE applies damage per-round for accurate death tracking
      });

      if (dungeon.userParticipating && totalUserDamage > 0 && Number(this.settings?.userHP) > 0) {
        this.applyEnemyCombatStatusEffects({
          channelKey,
          attacker: dungeon.boss,
          attackerType: 'boss',
          attacksInSpan,
          targetType: 'user',
          targetId: 'user',
          now,
        });
      }

      // Advance cadence using elapsed/cooldown carryover (prevents stall/overfire loops).
      dungeon.boss.lastAttackTime = this.getPostAttackTimestamp(
        now,
        timeSinceLastAttack,
        bossCooldown,
        totalTimeSpan,
        attacksInSpan
      );
      // INTEGRITY-1 (verified FP): deadShadows is the same Set reference from _getDungeonShadowCombatContext
      // (mutated in-place). Write-back is a no-op for existing entries but correctly initializes
      // the Map entry when deadShadows was created via the `|| new Set()` fallback (first combat tick).
      this.deadShadows.set(channelKey, deadShadows);
    } catch (error) {
      this.errorLog('CRITICAL', 'Fatal error in processBossAttacks', { channelKey, error });
    }
  },

  async processMobAttacks(channelKey, cyclesMultiplier = 1, isWindowVisible = null, mobBudget = 500, prebuiltShadowByIdMap = null) {
    try {
      // PERFORMANCE: Use hoisted visibility from _combatLoopTick when available
      if (isWindowVisible === null) isWindowVisible = this.isWindowVisible();
      if (!isWindowVisible) {
        // Window hidden - reduce cycles multiplier significantly (75% reduction)
        cyclesMultiplier = Math.max(1, Math.floor(cyclesMultiplier * 0.25)); // Process 75% less
      }

      // NOTE: syncHPAndManaFromStats hoisted to _combatLoopTick (once per tick)

      const dungeon = this._getActiveDungeon(channelKey);
      if (!dungeon || !dungeon.mobs?.activeMobs?.length) {
        this.stopMobAttacks(channelKey);
        return;
      }

      const now = Date.now();
      const activeInterval = 1000; // Mob attacks every 1 second
      const totalTimeSpan = cyclesMultiplier * activeInterval;

      const { assignedShadows, shadowHP, deadShadows } = this._getDungeonShadowCombatContext(
        channelKey,
        dungeon
      );

      // Get alive shadows ONCE before all mob attack processing (not per-attack)
      const aliveShadows = this.getCombatReadyShadows(assignedShadows, deadShadows, shadowHP);

      // BATCH PROCESSING: Calculate all mob attacks in one calculation with variance
      const shadowDamageMap = new Map(); // Track damage per shadow
      let totalUserDamage = 0;

      // Guard clause: Check again in case dungeon.mobs became null between checks
      if (!dungeon.mobs || !dungeon.mobs.activeMobs || dungeon.mobs.activeMobs.length === 0) {
        return;
      }

      // NUMPY-STYLE: O(1) shadow lookup Map for damage application.
      // Uses pre-built map from _processDungeonCombatTick when available (avoids rebuilding per attack phase).
      const shadowByIdMap = prebuiltShadowByIdMap || new Map(
        assignedShadows.map((s) => [this.getShadowIdValue(s), s])
      );
      const resolveShadowMapKey = (shadowId) => this._resolveShadowMapKey(shadowByIdMap, shadowId);
      const getShadowHpData = (shadowId) =>
        this._getShadowHpDataByKey(shadowHP, shadowByIdMap, shadowId);

      // Pre-compute user stats once (not per-attack)
      const userStats = dungeon.userParticipating ? this.getUserEffectiveStats() : null;
      const userRank = dungeon.userParticipating ? (this.soloLevelingStats?.settings?.rank || 'E') : 'E';
      const roleCombatContext = this.getRoleCombatTickContext(channelKey);
      const incomingDamageMultiplier = this.getRoleCombatIncomingDamageMultiplier(
        channelKey,
        roleCombatContext
      );

      // NUMPY-STYLE MOB SAMPLING: Instead of iterating ALL 10,000+ mobs, sample a representative
      // subset and scale damage proportionally — same pattern as shadow sampling in processShadowAttacks.
      // Old worst case: 10,000 mobs × 15 attacks/mob = 150,000 inner loop iterations.
      // New: max 500 sampled mobs × 1 damage calc each = 500 iterations + O(1) scale factor.
      const allActiveMobs = dungeon.mobs.activeMobs;
      // T2-1: mobBudget is computed per-tick in _combatLoopTick as globalBudget / activeDungeonCount
      const maxMobsToSimulate = isWindowVisible ? mobBudget : Math.min(100, Math.floor(mobBudget * 0.2));

      // Phase 1: Count alive mobs and compute total attacks (lightweight scan — no damage calc)
      const mobAttackState = new Map(); // mob -> { timeSince, cooldown, attacks }
      let totalAliveMobs = 0;
      let totalAttacksAll = 0;
      for (let m = 0; m < allActiveMobs.length; m++) {
        const mob = allActiveMobs[m];
        if (!mob || mob.hp <= 0) continue;
        totalAliveMobs++;
        if (!mob.lastAttackTime || mob.lastAttackTime === 0) mob.lastAttackTime = now;
        const mobId = this.getEnemyKey(mob, 'mob');
        const slowMultiplier = this.getEntityAttackSlowMultiplier(
          channelKey,
          'mob',
          mobId,
          now
        );
        const timeSince = Math.max(0, now - mob.lastAttackTime);
        const cooldown = this.getEffectiveAttackCooldownMs(
          (mob.attackCooldown || activeInterval) * slowMultiplier,
          activeInterval
        );
        const attacks = this.calculateAttacksInSpan(timeSince, cooldown, cyclesMultiplier);
        mobAttackState.set(mob, { timeSince, cooldown, attacks });
        if (attacks > 0) totalAttacksAll += attacks;
      }

      // Ruler's Authority Force: disable a % of mobs while debuff active
      const rulersDebuff = this._getActiveDebuff(dungeon, 'rulers_force');
      if (rulersDebuff && rulersDebuff.mobDisablePercent > 0) {
        totalAttacksAll = Math.floor(totalAttacksAll * (1 - Math.min(1, rulersDebuff.mobDisablePercent)));
      }

      // Dragon's Fear or Bloodlust: ALL mobs paralyzed — zero attacks while active
      if (this._getActiveDebuff(dungeon, 'dragons_fear_mobs') || this._getActiveDebuff(dungeon, 'bloodlust_mobs')) {
        totalAttacksAll = 0;
      }

      // Phase 2: Stride-sample mobs for actual damage calculation
      const mobsToProcess = Math.min(totalAliveMobs, maxMobsToSimulate);
      const mobStride = mobsToProcess > 0 ? Math.max(1, Math.floor(totalAliveMobs / mobsToProcess)) : 1;
      const mobScaleFactor = totalAliveMobs > 0 && mobsToProcess > 0
        ? Math.min(25, totalAliveMobs / mobsToProcess)
        : 1;

      // Phase 3: VECTORIZED RANK/ROLE-GROUP BATCHING
      // Instead of per-mob per-hit damage calc, group sampled mobs by rank+role and compute
      // one representative damage per group, then scale by (hitCount × scaleFactor).
      // This preserves role personality while keeping the hot path bounded.
      if (aliveShadows.length > 0) {
        // Collect sampled mob attacks grouped by rank+role for vectorized damage calc
        const rankGroups = new Map(); // `${rank}|${role}` -> { rank, role, totalHits, representativeMob }
        let aliveIdx = 0;
        let sampled = 0;
        for (let m = 0; m < allActiveMobs.length && sampled < mobsToProcess; m++) {
          const mob = allActiveMobs[m];
          if (!mob || mob.hp <= 0) continue;
          aliveIdx++;
          if ((aliveIdx - 1) % mobStride !== 0) continue;
          sampled++;

          const attackState = mobAttackState.get(mob);
          const attacksInSpan = attackState?.attacks || 0;
          if (attacksInSpan <= 0) continue;

          const rank = mob.rank || 'E';
          const mobRole = this.ensureMonsterRole(mob);
          const groupKey = `${rank}|${mobRole}`;
          const existing = rankGroups.get(groupKey);
          if (existing) {
            existing.totalHits += attacksInSpan;
            existing.mobCount++;
          } else {
            rankGroups.set(groupKey, {
              rank,
              role: mobRole,
              totalHits: attacksInSpan,
              mobCount: 1,
              representativeMob: mob,
            });
          }

        }

        // One damage calculation per rank+role group × random shadow targets
        for (const group of rankGroups.values()) {
          const rank = group.rank;
          const mobRole = group.role;
          const mob = group.representativeMob;
          const scaledHits = Math.ceil(group.totalHits * mobScaleFactor);
          // PERFORMANCE: cap per-group hit simulation to avoid huge per-hit loops on mega swarms.
          // Damage is weighted back up via hitWeight to preserve expected output.
          const hitSimulationCap = isWindowVisible ? 1800 : 600;
          const simulatedHits = Math.max(1, Math.min(scaledHits, hitSimulationCap));
          const hitWeight = scaledHits > 0 ? scaledHits / simulatedHits : 1;

          // Apply stat variance at group level (representative mob stats with variance)
          const mobStatVariance = this._varianceNarrow();
          const mobStats = {
            strength: Math.floor(mob.strength * mobStatVariance),
            agility: Math.floor(mob.agility * mobStatVariance),
            intelligence: Math.floor(mob.intelligence * mobStatVariance),
            vitality: Math.floor(mob.vitality * mobStatVariance),
          };

          // Distribute hits across random shadow targets, accumulate per-shadow damage
          // Personality-based targeting (ShadowArmy) sampled once per rank group
          const useShadowArmyTargeting = !!this.shadowArmy?.processMobAttackOnShadow;
          const hitsPerTarget = new Map();

          for (let h = 0; h < simulatedHits; h++) {
            let targetId = null;

            if (useShadowArmyTargeting && h < group.totalHits) {
              // Use ShadowArmy personality targeting for sampled (non-scaled) hits
              const attackResult = this.shadowArmy.processMobAttackOnShadow(mob, aliveShadows);
              if (attackResult?.targetShadow) {
                targetId = resolveShadowMapKey(attackResult.targetShadow);
              }
            }

            if (!targetId) {
              // ACCURATE TARGETING: Skip shadows whose accumulated damage already exceeds HP.
              // Try up to 3 picks to find a shadow that's still "alive" after queued damage.
              for (let pick = 0; pick < 3; pick++) {
                const target = aliveShadows[Math.floor(Math.random() * aliveShadows.length)];
                if (!target) continue;
                const rawTargetId = this.getShadowIdValue(target);
                if (rawTargetId === null || rawTargetId === undefined) continue;
                const resolvedTargetId = resolveShadowMapKey(rawTargetId) ?? rawTargetId;
                const hpData = getShadowHpData(resolvedTargetId);
                if (!hpData || hpData.hp <= 0) continue;
                const accumulatedDmg = shadowDamageMap.get(resolvedTargetId) || 0;
                if (hpData.hp - accumulatedDmg > 0) {
                  targetId = resolvedTargetId;
                  break;
                }
              }
              // Fallback: if all tried shadows are "dead", pick any living one (avoid total miss)
              if (!targetId) {
                const target = aliveShadows[Math.floor(Math.random() * aliveShadows.length)];
                if (target) {
                  const rawTargetId = this.getShadowIdValue(target);
                  if (rawTargetId !== null && rawTargetId !== undefined) {
                    const resolvedTargetId = resolveShadowMapKey(rawTargetId) ?? rawTargetId;
                    const hpData = getShadowHpData(resolvedTargetId);
                    if (hpData && hpData.hp > 0) targetId = resolvedTargetId;
                  }
                }
              }
            }

            if (targetId) {
              hitsPerTarget.set(targetId, (hitsPerTarget.get(targetId) || 0) + 1);
            }
          }

          // VECTORIZED DAMAGE WITH OVERFLOW REDISTRIBUTION:
          // Calculate damage per unique shadow, but cap at effective HP remaining.
          // Excess damage (overkill) is redistributed as additional hits to other shadows.
          // This ensures scaled mob hits produce realistic shadow death counts.
          // PERF-4: Cache shadow stats for redistribution — stats don't change within a tick
          const _redistributionStatsCache = new Map();
          let overflowHits = 0;
          for (const [shadowId, hits] of hitsPerTarget) {
            const resolvedShadowId = resolveShadowMapKey(shadowId) ?? shadowId;
            const target = shadowByIdMap.get(resolvedShadowId);
            if (!target) continue;
            const hpData = getShadowHpData(resolvedShadowId);
            if (!hpData || hpData.hp <= 0) continue;

            let shadowStats = _redistributionStatsCache.get(resolvedShadowId);
            if (!shadowStats) {
              shadowStats = this.buildShadowStats(target);
              _redistributionStatsCache.set(resolvedShadowId, shadowStats);
            }
            const shadowRole =
              target.role || target.roleName || target.ro || this.normalizeShadowRoleKey(target.type);
            const baseDamage = this.calculateMobDamageToShadow(
              mobStats,
              shadowStats,
              rank,
              target.rank || 'E',
              mobRole,
              shadowRole,
              mob.beastFamily
            );
            const aggregateVariance = this._varianceWide();
            const rawDamage = Math.floor(
              baseDamage * hits * hitWeight * aggregateVariance * incomingDamageMultiplier
            );

            // Cap damage at shadow's effective HP to prevent overkill waste
            const accumulatedDmg = shadowDamageMap.get(resolvedShadowId) || 0;
            const effectiveHP = Math.max(0, hpData.hp - accumulatedDmg);
            if (effectiveHP <= 0) {
              // Shadow already "dead" from prior rank groups — all hits overflow
              overflowHits += hits;
              continue;
            }

            const cappedDamage = Math.min(rawDamage, effectiveHP + 1); // +1 to ensure kill
            shadowDamageMap.set(resolvedShadowId, accumulatedDmg + cappedDamage);

            // Convert excess damage back into overflow hits for redistribution
            if (rawDamage > cappedDamage && baseDamage > 0) {
              const excessDamage = rawDamage - cappedDamage;
              const effectiveDamagePerHit = Math.max(1, baseDamage * hitWeight);
              overflowHits += Math.floor(excessDamage / effectiveDamagePerHit);
            }
          }

          // REDISTRIBUTE overflow hits to other alive shadows (second pass)
          if (overflowHits > 0 && aliveShadows.length > 0) {
            const redistributionCap = Math.min(overflowHits, aliveShadows.length * 2); // limit iterations
            for (let r = 0; r < redistributionCap; r++) {
              // Find a shadow that's still alive after accumulated damage
              let found = false;
              for (let pick = 0; pick < 3; pick++) {
                const target = aliveShadows[Math.floor(Math.random() * aliveShadows.length)];
                if (!target) continue;
                const rawTargetId = this.getShadowIdValue(target);
                if (rawTargetId === null || rawTargetId === undefined) continue;
                const resolvedTargetId = resolveShadowMapKey(rawTargetId) ?? rawTargetId;
                const hpData = getShadowHpData(resolvedTargetId);
                if (!hpData || hpData.hp <= 0) continue;
                const accDmg = shadowDamageMap.get(resolvedTargetId) || 0;
                if (hpData.hp - accDmg <= 0) continue;

                // Apply one hit worth of damage
                let shadowStats = _redistributionStatsCache.get(resolvedTargetId);
                if (!shadowStats) {
                  shadowStats = this.buildShadowStats(target);
                  _redistributionStatsCache.set(resolvedTargetId, shadowStats);
                }
                const shadowRole =
                  target.role || target.roleName || target.ro || this.normalizeShadowRoleKey(target.type);
                const baseDmg = this.calculateMobDamageToShadow(
                  mobStats,
                  shadowStats,
                  rank,
                  target.rank || 'E',
                  mobRole,
                  shadowRole,
                  mob.beastFamily
                );
                const effectiveHP = hpData.hp - accDmg;
                const dmg = Math.min(
                  Math.floor(baseDmg * hitWeight * this._varianceWide() * incomingDamageMultiplier),
                  effectiveHP + 1
                );
                shadowDamageMap.set(resolvedTargetId, accDmg + dmg);
                found = true;
                break;
              }
              if (!found) break; // All shadows effectively dead
            }
          }
        }

      } else if (dungeon.userParticipating && userStats) {
        // ALL shadows dead — aggregate all mob damage to user in one batch.
        // Instead of per-mob per-hit: compute average mob damage once, multiply by totalAttacks × scale.
        if (totalAttacksAll > 0) {
          // Pick a representative mob for damage calc
          let representativeMob = null;
          for (const mob of allActiveMobs) {
            if (mob && mob.hp > 0) { representativeMob = mob; break; }
          }
          if (representativeMob) {
            const mobRole = this.ensureMonsterRole(representativeMob);
            const mobStatVariance = this._varianceNarrow();
            const mobStats = {
              strength: Math.floor(representativeMob.strength * mobStatVariance),
              agility: Math.floor(representativeMob.agility * mobStatVariance),
              intelligence: Math.floor(representativeMob.intelligence * mobStatVariance),
              vitality: Math.floor(representativeMob.vitality * mobStatVariance),
            };
            const baseDamage = this.calculateMobDamageToUser(
              mobStats,
              userStats,
              representativeMob.rank,
              userRank,
              mobRole,
              representativeMob.beastFamily
            );
            const aggregateVariance = this._varianceWide();
            totalUserDamage = Math.floor(
              baseDamage * totalAttacksAll * aggregateVariance * incomingDamageMultiplier
            );
          }
        }

      }

      // Advance cadence using elapsed/cooldown carryover.
      for (const mob of allActiveMobs) {
        if (!mob || mob.hp <= 0) continue;
        const attackState = mobAttackState.get(mob);
        if (!attackState || attackState.attacks <= 0) continue;
        mob.lastAttackTime = this.getPostAttackTimestamp(
          now,
          attackState.timeSince,
          attackState.cooldown,
          totalTimeSpan,
          attackState.attacks
        );
      }

      await this._applyAccumulatedShadowAndUserDamage({
        shadowDamageMap,
        assignedShadows,
        shadowHP,
        deadShadows,
        channelKey,
        totalUserDamage,
        dungeon,
        shadowByIdMap,
      });

      if (dungeon.userParticipating && totalUserDamage > 0 && Number(this.settings?.userHP) > 0) {
        let representativeMob = null;
        for (const mob of allActiveMobs) {
          if (mob && mob.hp > 0) {
            representativeMob = mob;
            break;
          }
        }
        if (representativeMob) {
          this.applyEnemyCombatStatusEffects({
            channelKey,
            attacker: representativeMob,
            attackerType: 'mob',
            attacksInSpan: totalAttacksAll,
            targetType: 'user',
            targetId: 'user',
            now,
          });
        }
      }

      // INTEGRITY-1 (verified FP): deadShadows is the same Set reference from _getDungeonShadowCombatContext
      // (mutated in-place). Write-back is a no-op for existing entries but correctly initializes
      // the Map entry when deadShadows was created via the `|| new Set()` fallback (first combat tick).
      this.deadShadows.set(channelKey, deadShadows);

      // REAL-TIME UPDATE: Queue throttled HP bar update after boss attacks complete
      this.queueHPBarUpdate(channelKey);

    } catch (error) {
      this.errorLog('CRITICAL', 'Fatal error in processMobAttacks', { channelKey, error });
    }
  },

  async attackMobs(channelKey, source) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || !dungeon.mobs?.activeMobs?.length) return;

    if (source === 'user') {
      // User attacks mobs
      dungeon.mobs.activeMobs
        .filter((mob) => mob && mob.hp > 0)
        .forEach((mob) => {
          const mobStats = {
            strength: mob.strength,
            agility: mob.agility,
            intelligence: mob.intelligence,
            vitality: mob.vitality,
          };

          const userDamage = this.calculateUserDamage(mobStats, mob.rank);
          const mobId = this.getEnemyKey(mob, 'mob');
          const adjustedUserDamage = this.applyStatusAdjustedIncomingDamage(
            channelKey,
            'mob',
            mobId,
            userDamage,
            Date.now()
          );
          mob.hp = Math.max(0, mob.hp - adjustedUserDamage);

          if (mob.hp <= 0) {
            this._onMobKilled(channelKey, dungeon, mob.rank);
            this._addToCorpsePile(channelKey, mob, false);
          }
        });

      this.queueHPBarUpdate(channelKey);
      // Extraction data stored in BdAPI to prevent crashes during combat
      // Mobs will be extracted after dungeon ends (boss defeated or timeout)

      // AGGRESSIVE CLEANUP: Remove dead mobs (extraction data already stored)
      // Keep only alive mobs (dead mobs are already processed for extraction)
      const nextActiveMobs = [];
      for (const m of dungeon.mobs.activeMobs) {
        m && m.hp > 0 && nextActiveMobs.push(m);
      }
      dungeon.mobs.activeMobs = nextActiveMobs;
      return;
    }

    if (source === 'shadows') {
      // Legacy compatibility path: delegate to the canonical shadow combat engine so
      // shadow-vs-mob behavior stays in one place and cannot drift over time.
      await this.processShadowAttacks(channelKey, 1, this.isWindowVisible(), 250);
      return;
    }
  },

  async applyDamageToBoss(channelKey, damage, source, shadowId = null, isCritical = false) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;
    const now = Date.now();
    const bossUnlocked = this.ensureBossEngagementUnlocked(dungeon, channelKey);
    if (!bossUnlocked) {
      dungeon.shadowsDeployed && this.ensureDeployedSpawnPipeline(channelKey, 'boss_damage_blocked');
      if (source === 'user') {
        this._notifyBossGateLocked?.(dungeon);
      }
      return;
    }

    if (source !== 'status') {
      damage = this.applyStatusAdjustedIncomingDamage(
        channelKey,
        'boss',
        'boss',
        damage,
        now
      );
    }

    // BOSS DURABILITY PIPELINE

    // 1) PHASE SHIELD — brief invulnerability at HP thresholds (75%, 50%, 25%)
    if (dungeon.boss._phaseShieldExpiresAt && now < dungeon.boss._phaseShieldExpiresAt) {
      return; // Boss is in phase shield — all damage absorbed
    }

    // 2) BOSS DAMAGE RESISTANCE — rank-scaled % reduction
    const bossResistance = (C.BOSS_DAMAGE_RESISTANCE || {})[dungeon.boss.rank] || 0;
    if (bossResistance > 0) {
      damage = Math.max(1, Math.floor(damage * (1 - bossResistance)));
    }

    // 3) PER-HIT DAMAGE CAP — no single hit exceeds X% of boss maxHP
    const capPct = C.BOSS_DAMAGE_CAP_PCT || 0.06;
    const maxDamagePerHit = Math.max(1, Math.floor((dungeon.boss.maxHp || 1) * capPct));
    damage = Math.min(damage, maxDamagePerHit);

    // 4) Ruler's Authority Force: resist reduction amplifies all incoming boss damage
    const resistReduction = this._getRulersForceResistReduction(dungeon);
    if (damage > 0 && resistReduction > 0) {
      damage = Math.floor(damage * (1 / (1 - resistReduction)));
    }

    const hpBefore = dungeon.boss.hp;
    dungeon.boss.hp = Math.max(0, dungeon.boss.hp - damage);

    // 5) PHASE SHIELD CHECK — trigger invulnerability on threshold crossing
    const thresholds = C.BOSS_PHASE_THRESHOLDS || [0.75, 0.50, 0.25];
    const shieldMs = C.BOSS_PHASE_SHIELD_MS || 2500;
    const maxHp = dungeon.boss.maxHp || 1;
    if (!dungeon.boss._phasesTriggered) dungeon.boss._phasesTriggered = [];
    for (const threshold of thresholds) {
      if (dungeon.boss._phasesTriggered.includes(threshold)) continue;
      const thresholdHp = maxHp * threshold;
      if (hpBefore > thresholdHp && dungeon.boss.hp <= thresholdHp && dungeon.boss.hp > 0) {
        dungeon.boss._phasesTriggered.push(threshold);
        dungeon.boss._phaseShieldExpiresAt = now + shieldMs;
        this.debugLog?.(`BOSS PHASE SHIELD triggered at ${Math.round(threshold * 100)}% HP — ${shieldMs}ms invulnerability`);
        break; // Only one phase per damage application
      }
    }

    // Track shadow contribution for XP
    if (source === 'shadow' && shadowId) {
      this._addShadowContribution(dungeon, shadowId, 'bossDamage', damage);
    }

    // Track user damage with critical hits
    if (source === 'user') {
      if (!dungeon.userDamageDealt) dungeon.userDamageDealt = 0;
      if (!dungeon.userCriticalHits) dungeon.userCriticalHits = 0;

      dungeon.userDamageDealt += damage;
      if (isCritical) {
        dungeon.userCriticalHits++;
      }

      // Log user damage (every 10 attacks to avoid spam)
      if (!dungeon.userAttackCount) dungeon.userAttackCount = 0;
      dungeon.userAttackCount++;
      if (dungeon.userAttackCount % 10 === 0) {
        const critText =
          dungeon.userCriticalHits > 0 ? ` (${dungeon.userCriticalHits} crits!)` : '';
        this.debugLog(
          `User dealt ${dungeon.userDamageDealt.toLocaleString()} total damage in ${
            dungeon.userAttackCount
          } attacks${critText}`
        );
      }
    }

    // Route through throttled queue (max 4/sec) instead of direct DOM write.
    // With 200+ shadows attacking, direct calls were 200+ DOM writes/sec.
    this.queueHPBarUpdate(channelKey);

    if (dungeon.boss.hp <= 0) {
      this.debugLog?.(`BOSS DEFEATED in ${dungeon.name} (${dungeon.rank}-rank) | Mobs killed: ${dungeon.mobs?.killed || 0} | User participating: ${dungeon.userParticipating} | Shadows deployed: ${dungeon.shadowsDeployed}`);

      // Remove HP bar and mark completed before completeDungeon.
      // completeDungeon is synchronous (Phase A), but marking completed early
      // ensures the restore interval sees it immediately.
      dungeon.completed = true;
      this.removeBossHPBar(channelKey);
      document
        .querySelectorAll(`.dungeon-boss-hp-container[data-channel-key="${channelKey}"]`)
        .forEach((el) => el.remove());

      this.completeDungeon(channelKey, 'boss');
      // Save immediately on boss death (important state change)
      if (this.storageManager) {
        this.storageManager
          .saveDungeon(dungeon)
          .catch((err) => this.errorLog('Failed to save dungeon', err));
      }
      this.markCombatSettingsDirty('boss-defeated');
      return;
    }

    // Debounce storage writes during combat (coalesce rapid damage events)
    this._debounceDungeonSave(channelKey, dungeon);
  },

  _debounceDungeonSave(channelKey, dungeon) {
    if (!this._dungeonSaveTimers) this._dungeonSaveTimers = new Map();
    if (this._dungeonSaveTimers.has(channelKey)) return; // Already scheduled

    const timerId = this._setTrackedTimeout(() => {
      this._dungeonSaveTimers.delete(channelKey);
      if (this.storageManager) {
        this.storageManager
          .saveDungeon(dungeon)
          .catch((err) => this.errorLog('Failed to save dungeon', err));
      }
      this.markCombatSettingsDirty('debounced-dungeon-save');
    }, 2000);
    this._dungeonSaveTimers.set(channelKey, timerId);
  }
};
