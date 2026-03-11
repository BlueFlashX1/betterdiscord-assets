const C = require('./constants');
const Dungeons = { RANK_MULTIPLIERS: C.RANK_MULTIPLIERS };

module.exports = {
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
      const bossRole = this.ensureMonsterRole(dungeon.boss);
      const bossUnlocked = this.ensureBossEngagementUnlocked(dungeon, channelKey);
      if (!bossUnlocked) {
        // Keep cooldown state fresh so unlocking doesn't burst-apply stale attacks.
        dungeon.boss.lastAttackTime = now;
        return;
      }

      const activeInterval = 1000; // Boss attacks every 1 second
      const totalTimeSpan = cyclesMultiplier * activeInterval;

      // OPTIMIZATION: Calculate attacks using helper function
      // CRITICAL: Initialize lastAttackTime if not set (prevents one-shot on join)
      if (!dungeon.boss.lastAttackTime || dungeon.boss.lastAttackTime === 0) {
        dungeon.boss.lastAttackTime = now;
      }
      const timeSinceLastAttack = now - dungeon.boss.lastAttackTime;
      const attacksInSpan = this.calculateAttacksInTimeSpan(
        timeSinceLastAttack,
        dungeon.boss.attackCooldown || activeInterval,
        totalTimeSpan
      );

      if (attacksInSpan <= 0) return;
      const roleCombatContext = this.getRoleCombatTickContext(channelKey);
      const incomingDamageMultiplier = this.getRoleCombatIncomingDamageMultiplier(
        channelKey,
        roleCombatContext
      );

      const bossStats = {
        strength: dungeon.boss.strength,
        agility: dungeon.boss.agility,
        intelligence: dungeon.boss.intelligence,
        vitality: dungeon.boss.vitality,
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

      // BATCH PROCESSING: Calculate all attacks in one calculation with variance
      let totalUserDamage = 0;
      const shadowDamageMap = new Map(); // Track damage per shadow
      const maxTargetsPerAttack = Dungeons.RANK_MULTIPLIERS[dungeon.boss?.rank] || 1;

      if (aliveShadows.length > 0) {
        // ACCURATE AOE: Per-attack-round processing with intermediate death tracking.
        // Boss attacks N shadows per round (AOE). After each round, shadows that died
        // are removed from the target pool so they don't absorb subsequent attacks.
        // This prevents overkill: a shadow that dies in round 1 can't be hit in round 2.
        //
        // Performance: O(attacksInSpan × targets) random picks + O(unique shadows hit) damage calcs.
        // For rank-S boss: ~5 attacks × 12 targets = 60 picks + ~30 unique calcs. Very fast.

        // Mutable alive set — shadows are removed when killed during this tick
        const aliveSet = new Set(aliveShadows.map(s => s.id));
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
            if (!aliveSet.has(target.id)) continue; // Skip dead shadows
            const hpData = shadowHP.get(target.id);
            if (!hpData || hpData.hp <= 0) {
              aliveSet.delete(target.id);
              continue;
            }
            roundHits.set(target.id, (roundHits.get(target.id) || 0) + 1);
            picks++;
          }

          // Apply damage for this attack round immediately
          const roundVariance = this._varianceWide();
          for (const [shadowId, hits] of roundHits) {
            const target = shadowByIdMap.get(shadowId);
            if (!target) continue;

            // Cache damage calc (shadow stats don't change within a tick)
            let baseDamage = damageCache.get(shadowId);
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
              damageCache.set(shadowId, baseDamage);
            }

            const roundDamage = Math.floor(baseDamage * hits * roundVariance * incomingDamageMultiplier);
            if (roundDamage <= 0) continue;

            // Apply damage immediately to track intermediate deaths
            const hpData = shadowHP.get(shadowId);
            if (!hpData || hpData.hp <= 0) {
              aliveSet.delete(shadowId);
              continue;
            }
            hpData.hp = Math.max(0, hpData.hp - roundDamage);
            shadowHP.set(shadowId, hpData);

            // Accumulate for death processing and resurrection
            shadowDamageMap.set(shadowId, (shadowDamageMap.get(shadowId) || 0) + roundDamage);

            // Shadow died this round — remove from future target pool
            if (hpData.hp <= 0) {
              aliveSet.delete(shadowId);
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

      // Atomic update: create new object reference to prevent race conditions
      dungeon.boss.lastAttackTime = now + totalTimeSpan;
      // INTEGRITY-1 (verified FP): deadShadows is the same Set reference from _getDungeonShadowCombatContext
      // (mutated in-place). Write-back is a no-op for existing entries but correctly initializes
      // the Map entry when deadShadows was created via the `|| new Set()` fallback (first combat tick).
      this.deadShadows.set(channelKey, deadShadows);
    } catch (error) {
      this.errorLog('CRITICAL', 'Fatal error in processBossAttacks', { channelKey, error });
      // Don't throw - let combat continue
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

      // Check if any shadows are alive
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
      let totalAliveMobs = 0;
      let totalAttacksAll = 0;
      for (let m = 0; m < allActiveMobs.length; m++) {
        const mob = allActiveMobs[m];
        if (!mob || mob.hp <= 0) continue;
        totalAliveMobs++;
        if (!mob.lastAttackTime || mob.lastAttackTime === 0) mob.lastAttackTime = now;
        const timeSince = now - mob.lastAttackTime;
        const attacks = this.calculateAttacksInSpan(timeSince, mob.attackCooldown, cyclesMultiplier);
        if (attacks > 0) totalAttacksAll += attacks;
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

          const timeSince = now - mob.lastAttackTime;
          const attacksInSpan = this.calculateAttacksInSpan(timeSince, mob.attackCooldown, cyclesMultiplier);
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

          mob.lastAttackTime = now + totalTimeSpan;
        }

        // One damage calculation per rank+role group × random shadow targets
        for (const group of rankGroups.values()) {
          const rank = group.rank;
          const mobRole = group.role;
          const mob = group.representativeMob;
          const scaledHits = Math.ceil(group.totalHits * mobScaleFactor);

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

          for (let h = 0; h < scaledHits; h++) {
            let targetId = null;

            if (useShadowArmyTargeting && h < group.totalHits) {
              // Use ShadowArmy personality targeting for sampled (non-scaled) hits
              const attackResult = this.shadowArmy.processMobAttackOnShadow(mob, aliveShadows);
              if (attackResult?.targetShadow) {
                targetId = attackResult.targetShadow;
              }
            }

            if (!targetId) {
              // ACCURATE TARGETING: Skip shadows whose accumulated damage already exceeds HP.
              // Try up to 3 picks to find a shadow that's still "alive" after queued damage.
              for (let pick = 0; pick < 3; pick++) {
                const target = aliveShadows[Math.floor(Math.random() * aliveShadows.length)];
                if (!target) continue;
                const hpData = shadowHP.get(target.id);
                if (!hpData || hpData.hp <= 0) continue;
                const accumulatedDmg = shadowDamageMap.get(target.id) || 0;
                if (hpData.hp - accumulatedDmg > 0) {
                  targetId = target.id;
                  break;
                }
              }
              // Fallback: if all tried shadows are "dead", pick any living one (avoid total miss)
              if (!targetId) {
                const target = aliveShadows[Math.floor(Math.random() * aliveShadows.length)];
                if (target) {
                  const hpData = shadowHP.get(target.id);
                  if (hpData && hpData.hp > 0) targetId = target.id;
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
            const target = shadowByIdMap.get(shadowId);
            if (!target) continue;
            const hpData = shadowHP.get(shadowId);
            if (!hpData || hpData.hp <= 0) continue;

            let shadowStats = _redistributionStatsCache.get(shadowId);
            if (!shadowStats) {
              shadowStats = this.buildShadowStats(target);
              _redistributionStatsCache.set(shadowId, shadowStats);
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
              baseDamage * hits * aggregateVariance * incomingDamageMultiplier
            );

            // Cap damage at shadow's effective HP to prevent overkill waste
            const accumulatedDmg = shadowDamageMap.get(shadowId) || 0;
            const effectiveHP = Math.max(0, hpData.hp - accumulatedDmg);
            if (effectiveHP <= 0) {
              // Shadow already "dead" from prior rank groups — all hits overflow
              overflowHits += hits;
              continue;
            }

            const cappedDamage = Math.min(rawDamage, effectiveHP + 1); // +1 to ensure kill
            shadowDamageMap.set(shadowId, accumulatedDmg + cappedDamage);

            // Convert excess damage back into overflow hits for redistribution
            if (rawDamage > cappedDamage && baseDamage > 0) {
              const excessDamage = rawDamage - cappedDamage;
              overflowHits += Math.floor(excessDamage / baseDamage);
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
                const hpData = shadowHP.get(target.id);
                if (!hpData || hpData.hp <= 0) continue;
                const accDmg = shadowDamageMap.get(target.id) || 0;
                if (hpData.hp - accDmg <= 0) continue;

                // Apply one hit worth of damage
                let shadowStats = _redistributionStatsCache.get(target.id);
                if (!shadowStats) {
                  shadowStats = this.buildShadowStats(target);
                  _redistributionStatsCache.set(target.id, shadowStats);
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
                  Math.floor(baseDmg * this._varianceWide() * incomingDamageMultiplier),
                  effectiveHP + 1
                );
                shadowDamageMap.set(target.id, accDmg + dmg);
                found = true;
                break;
              }
              if (!found) break; // All shadows effectively dead
            }
          }
        }

        // Update lastAttackTime for non-sampled mobs too (they still "attacked")
        for (const mob of allActiveMobs) {
          if (mob && mob.hp > 0 && mob.lastAttackTime < now) {
            mob.lastAttackTime = now + totalTimeSpan;
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

        // Update all mob lastAttackTime
        for (const mob of allActiveMobs) {
          if (mob && mob.hp > 0) mob.lastAttackTime = now + totalTimeSpan;
        }
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

      // INTEGRITY-1 (verified FP): deadShadows is the same Set reference from _getDungeonShadowCombatContext
      // (mutated in-place). Write-back is a no-op for existing entries but correctly initializes
      // the Map entry when deadShadows was created via the `|| new Set()` fallback (first combat tick).
      this.deadShadows.set(channelKey, deadShadows);

      // REAL-TIME UPDATE: Queue throttled HP bar update after boss attacks complete
      this.queueHPBarUpdate(channelKey);

    } catch (error) {
      this.errorLog('CRITICAL', 'Fatal error in processMobAttacks', { channelKey, error });
      // Don't throw - let combat continue
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
          mob.hp = Math.max(0, mob.hp - userDamage);

          if (mob.hp <= 0) {
            this._onMobKilled(channelKey, dungeon, mob.rank);
            this._addToCorpsePile(channelKey, mob, false);
          }
        });

      this.queueHPBarUpdate(channelKey);
      // Extraction data stored in BdAPI to prevent crashes during combat
      // Mobs will be extracted after dungeon ends (boss defeated or timeout)

      // AGGRESSIVE CLEANUP: Remove dead mobs (extraction data already stored)
      // Keep only alive mobs
      // Keep only alive mobs (dead mobs are already processed for extraction)
      const nextActiveMobs = [];
      for (const m of dungeon.mobs.activeMobs) {
        m && m.hp > 0 && nextActiveMobs.push(m);
      }
      dungeon.mobs.activeMobs = nextActiveMobs;
      return;
    }

    if (source === 'shadows') {
      // Shadows attack mobs (CHAOTIC: individual timings, random targets)
      const assignedShadows =
        this.shadowAllocations.get(channelKey) || dungeon.shadowAllocation?.shadows || [];
      const deadShadows = this.deadShadows.get(channelKey) || new Set();
      const shadowHP = dungeon.shadowHP || (dungeon.shadowHP = new Map());
      const now = Date.now();

      // Filter alive mobs and shadows
      const aliveMobs = [];
      for (const m of dungeon.mobs.activeMobs) {
        m && m.hp > 0 && aliveMobs.push(m);
      }
      if (aliveMobs.length === 0) return;

      for (const shadow of assignedShadows) {
        const shadowId = this.getShadowIdValue(shadow);
        if (!shadowId) continue;
        if (deadShadows.has(shadowId)) continue;
        const shadowHPData = shadowHP.get(shadowId);
        if (!shadowHPData || shadowHPData.hp <= 0) continue;

        const combatData = dungeon.shadowCombatData?.get?.(shadowId);
        if (!combatData) continue;

        // Check individual shadow cooldown (chaotic timing)
        const timeSinceLastAttack = now - combatData.lastAttackTime;
        // BUGFIX LOGIC-4: Was reading nonexistent `cooldown` field (always undefined).
        // `initializeShadowCombatData` sets `attackInterval`, not `cooldown`.
        // undefined comparison always returned false, so ALL shadows attacked EVERY tick.
        if (timeSinceLastAttack < (combatData.attackInterval || 2000)) {
          continue; // Not ready yet
        }

        // Pick random mob target (dynamic target selection)
        const targetMob = aliveMobs[Math.floor(Math.random() * aliveMobs.length)];
        if (!targetMob || targetMob.hp <= 0) continue;

        const mobStats = {
          strength: targetMob.strength,
          agility: targetMob.agility,
          intelligence: targetMob.intelligence,
          vitality: targetMob.vitality,
        };

        // Calculate damage with variance
        let shadowDamage = this.calculateShadowDamage(shadow, mobStats, targetMob.rank);

        // Add damage variance (±20%)
        const variance = 0.8 + Math.random() * 0.4;
        shadowDamage = Math.floor(shadowDamage * variance);

        // Behavior modifiers
        const behaviorMultipliers = {
          aggressive: 1.3,
          balanced: 1.0,
          tactical: 0.85,
        };
        shadowDamage = Math.floor(shadowDamage * (behaviorMultipliers[combatData.behavior] || 1.0));

        const targetMobId = this.getEnemyKey(targetMob, 'mob');
        const targetMobHpBefore = targetMob.hp;
        targetMob.hp = Math.max(0, targetMob.hp - shadowDamage);
        const damageApplied = Math.max(0, targetMobHpBefore - targetMob.hp);
        if (damageApplied > 0 && targetMobId) {
          this._recordShadowMobDamageContribution(dungeon, targetMobId, shadowId, damageApplied);
        }

        // Update combat data
        combatData.lastAttackTime = now;
        combatData.attackCount++;
        combatData.damageDealt += shadowDamage;

        // Vary cooldown for next attack (keeps combat rhythm dynamic, clamped to prevent drift)
        const cooldownVariance = this._varianceNarrow();
        combatData.attackInterval = Math.max(800, Math.min(5000, (combatData.attackInterval || 2000) * cooldownVariance));

        // BUGFIX INTEGRITY-8: Only count kill if THIS shadow's attack was the killing blow.
        // Without this, multiple shadows attacking the same 0-HP mob each call _onMobKilled.
        if (targetMob.hp <= 0 && targetMobHpBefore > 0) {
          this._onMobKilled(channelKey, dungeon, targetMob.rank);

          // ARISE: Stash dead mob in corpse pile for post-dungeon extraction (lore-accurate)
          this._addToCorpsePile(channelKey, targetMob, false);

          let killAttributed = false;
          if (targetMobId) {
            killAttributed = this._applyMobKillContributionsFromLedger(dungeon, targetMobId, 1);
          }
          if (!killAttributed) {
            const fallbackAttributed = this._applyFallbackMobKillContribution(
              dungeon,
              assignedShadows,
              shadowId,
              1
            );
            if (!fallbackAttributed && targetMobId) {
              this._logMobContributionMiss(channelKey, targetMobId, { phase: 'attackMobs' });
            }
          }
        }

      }

      // PERF-2: Moved cleanup OUTSIDE the per-shadow loop. Was O(N) per kill × up to 500 shadows.
      // Now runs once after all shadow attacks, same as the main processShadowAttacks path.
      if (dungeon.mobs?.activeMobs?.some(m => m && m.hp <= 0)) {
        this._cleanupDungeonActiveMobs(dungeon);
      }
      this._pruneShadowMobContributionLedger(dungeon);

      // PERF-3: Moved extraction cache cleanup OUTSIDE the per-shadow loop.
      // Was allocating Array.from() per shadow iteration unnecessarily.
      if (this.extractionEvents && this.extractionEvents.size > 1000) {
        const entries = Array.from(this.extractionEvents.entries());
        this.extractionEvents.clear();
        entries.slice(-500).forEach(([k, v]) => this.extractionEvents.set(k, v));
      }

      // PERFORMANCE: Only save to storage every 5 attack cycles per dungeon.
      // BUGFIX: Was a global counter (this._saveCycleCount) shared across all dungeons,
      // causing 10x write amplification with 10 concurrent dungeons (counter hit 5 in 500ms).
      // Now per-dungeon so each dungeon saves exactly once per 5 of its own mob-attack cycles.
      if (!dungeon._saveCycleCount) dungeon._saveCycleCount = 0;
      dungeon._saveCycleCount++;

      if (dungeon._saveCycleCount >= 5 && this.storageManager) {
        this.storageManager
          .saveDungeon(dungeon)
          .catch((err) => this.errorLog('Failed to save dungeon', err));
        this.markCombatSettingsDirty('shadow-attack-cycle-save');
        dungeon._saveCycleCount = 0;
      }
    }
  },

  async applyDamageToBoss(channelKey, damage, source, shadowId = null, isCritical = false) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;
    const bossUnlocked = this.ensureBossEngagementUnlocked(dungeon, channelKey);
    if (!bossUnlocked) {
      dungeon.shadowsDeployed && this.ensureDeployedSpawnPipeline(channelKey, 'boss_damage_blocked');
      if (source === 'user') {
        const now = Date.now();
        const lastNoticeAt = dungeon._bossGateNoticeAt || 0;
        if (now - lastNoticeAt > 15000) {
          dungeon._bossGateNoticeAt = now;
          const requiredKills = Number.isFinite(dungeon?.bossGate?.requiredMobKills)
            ? dungeon.bossGate.requiredMobKills
            : 25;
          const currentKills = Number.isFinite(dungeon?.mobs?.killed) ? dungeon.mobs.killed : 0;
          const remainingKills = Math.max(0, requiredKills - currentKills);
          this.showToast(
            `Boss sealed: clear ${remainingKills} more mobs to break the gate.`,
            'info'
          );
        }
      }
      return;
    }

    dungeon.boss.hp = Math.max(0, dungeon.boss.hp - damage);

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
      this.settings.debug && console.log(`[Dungeons] 💀 BOSS DEFEATED in ${dungeon.name} (${dungeon.rank}-rank) | Mobs killed: ${dungeon.mobs?.killed || 0} | User participating: ${dungeon.userParticipating} | Shadows deployed: ${dungeon.shadowsDeployed}`);

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
