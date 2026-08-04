/**
 * combat-shadow-execution — the shadow army's attack tick. One mixin (index.js).
 *
 * Entry point: `processShadowAttacks(channelKey, cyclesMultiplier,
 * isWindowVisible, tickBudget)`, called from corpse-tick-pipeline's combat tick.
 *
 * THE ROTATION (the thing to understand before editing):
 * Per tick this processes only TICK_BUDGET shadows (default 500) starting at a
 * per-dungeon cursor, NOT the whole roster. Each shadow is therefore visited
 * once per `ceil(N / TICK_BUDGET)` ticks, and when its turn comes it is credited
 * the REAL elapsed time since its last visit. That is what keeps per-tick CPU
 * flat as the army grows — cost scales with TICK_BUDGET, never with N.
 *
 * WHY `scaleFactor` EXISTS (do not "simplify" it back to 1):
 * getCappedAttackElapsedMs hard-caps credited time at 5 minutes to bound the
 * attack LOOP — that clamp is what stopped measured 350-465ms spike ticks when a
 * backgrounded client refocused. But the true revisit gap grows with roster
 * size and passes 5 minutes at ~50,000 deployed shadows, so above that the
 * clamp was silently discarding the difference and army DPS flat-lined:
 * every shadow past ~50k contributed nothing. `scaleFactor` is
 * rawRevisitSpan / revisitSpan, which reproduces the discarded attacks
 * ARITHMETICALLY — same numbers, no extra iterations, clamp still intact.
 * Below 50k it is exactly 1 and behaviour is unchanged.
 *
 * This is NOT the old reservoir-sampling scaleFactor that was removed: that one
 * was O(N) per tick because it resampled the whole roster to build a sample.
 * The rotation already visits each shadow exactly once per cycle; this only
 * corrects the clock.
 *
 * Damage itself is delegated to combat-role-damage (the single formula) and
 * applied via combat-boss-mob.applyDamageToBoss, which owns resistance and the
 * per-tick cap. Aggregate boss damage for the whole slice is summed here and
 * applied in ONE call — so the cap bounds the slice, not each shadow.
 */
const C = require('./constants');

module.exports = {
  async processShadowAttacks(channelKey, cyclesMultiplier = 1, isWindowVisible = null, tickBudget = 500) {
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
            try {
              await this.preSplitShadowArmy();
              didReallocate = true;
            } finally {
              this._tickAllocationLock = false;
            }
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
              try {
                await this.preSplitShadowArmy();
                this.syncDungeonDifficultyScale(dungeon, channelKey, { scaleExistingMobs: true });
              } finally {
                this._tickAllocationLock = false;
              }
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
          if (shadowHP.has(shadowId)) continue; // already initialized -- skip Map write entirely

          try {
            this.initializeShadowHPSync(shadow, shadowHP);

            !dungeon.shadowCombatData.has(shadowId) &&
              dungeon.shadowCombatData.set(shadowId, this.initializeShadowCombatData(shadow));
          } catch (error) {
            this.errorLog('SHADOW_INIT', `Failed to initialize shadow ${shadowId}`, error);
          }
        }

        // Resurrect dead shadows each tick (breaks early when mana runs out); skip when hidden
        if (isWindowVisible) {
          // Map (not plain object): repeated delete-on-object forces V8 dictionary
          // mode on a combat-tick structure. Same pattern as _shadowLastProcessed.
          if (!(dungeon._lastResurrectionAttempt instanceof Map)) dungeon._lastResurrectionAttempt = new Map();
          const nowResurrection = Date.now();

          for (const shadow of assignedShadows) {
            const shadowId = this.getShadowIdValue(shadow);
            if (!shadowId) continue;
            if (!deadShadows.has(shadowId)) continue; // PERF: skip alive shadows without Map lookup
            const hpData = shadowHP.get(shadowId);
            if (!hpData || hpData.hp > 0) continue;

            const lastAttempt = dungeon._lastResurrectionAttempt.get(shadowId) || 0;
            if (nowResurrection - lastAttempt < 2000) continue;

            dungeon._lastResurrectionAttempt.set(shadowId, nowResurrection);
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
              dungeon._lastResurrectionAttempt.delete(shadowId);
            } else {
              // Mana ran out — stop trying, remaining dead shadows wait for regen
              break;
            }
          }
        }

        const bossStats = {
          strength: Number(dungeon.boss.strength) || 0,
          agility: Number(dungeon.boss.agility) || 0,
          intelligence: Number(dungeon.boss.intelligence) || 0,
          vitality: Number(dungeon.boss.vitality) || 0,
          perception: Number(dungeon.boss.perception) || 0,
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

        // Use the real per-dungeon tick interval so revisitSpan and catch-up cap are accurate
        // on background->foreground transitions (was hardcoded 3000 regardless of actual rate).
        const activeInterval = (this._shadowActiveIntervalMs && this._shadowActiveIntervalMs.get(channelKey)) || 3000;

        // PERF + PRECISION (Item C, 2026-06-08): Rotating-subset hybrid.
        //
        // OLD approach: reservoir-sample TICK_BUDGET shadows from the whole army each tick,
        // then multiply damage by scaleFactor (up to 200×) to approximate the rest.
        // Problem: (a) iterates EVERY assigned shadow to build the sample — O(N) per tick;
        //          (b) scaleFactor is an approximation; imprecise at large N.
        //
        // NEW approach: per-dungeon rotation cursor advances TICK_BUDGET positions each tick.
        // Each shadow is processed exactly once per rotation cycle (ceil(N/B) ticks).
        // Each processed shadow uses its REAL elapsed time since it was last processed.
        // getCappedAttackElapsedMs clamps elapsed to max(totalTimeSpan*2, cooldown*4).
        // If we pass totalTimeSpan=ONE_TICK the cap eats the rotation period for large armies
        // (50k army → 100-tick revisit → ~300s elapsed → clamped to ~8s → ~4 attacks instead of ~150).
        // FIX: compute revisitSpan = ceil(N/B) × tickInterval and pass it as the span arg so
        // getCappedAttackElapsedMs allows the full inter-visit elapsed through uncapped.
        //
        // DPS equivalence (corrected):
        //   revisitSpan ≈ elapsed since last visit. getCappedAttackElapsedMs clamps to
        //   max(revisitSpan*2, cooldown*4) ≥ revisitSpan, so timeSinceLastAttack passes through.
        //   attacks = floor(elapsed / cooldown) = exact attacks over the real inter-visit window.
        //   Summed over a full rotation cycle: Σ attacks = Σ floor(revisitSpan / cooldown)
        //   = N × floor(revisitSpan / cooldown) = total real attacks with no over/under-count.
        //   For N ≤ TICK_BUDGET: revisitSpan = 1 tick — identical to the old per-tick sim.
        //
        // TICK_BUDGET: tunable const. 500 = processes 500 shadows per tick regardless of army size.
        // At 50k army this is 1% per tick, full rotation in ~100 ticks.
        // Per-dungeon shadow-sim cap, now supplied by the combat loop's global
        // budget divided across active dungeons (was a hardcoded 500 per
        // dungeon, so N dungeons ran N×500). Falls back to 500 for direct callers.
        const TICK_BUDGET = Number.isFinite(tickBudget) && tickBudget > 0 ? Math.floor(tickBudget) : 500;

        // revisitSpan: the real wall-clock interval between a shadow's successive visits.
        // At a 50k army with TICK_BUDGET=500 each shadow is visited once every 100 ticks.
        // Each tick fires every ~3s (activeInterval), so revisitSpan ≈ 100 × 3000 = 300 000ms.
        // This is passed as the `totalTimeSpan` arg to calculateAttacksInTimeSpan and
        // getPostAttackTimestamp so getCappedAttackElapsedMs's maxCatchUp = max(revisitSpan*2,
        // cooldown*4) ≥ revisitSpan, allowing the full elapsed window through without truncation.
        // Capped at 5 min to prevent a pathological burst after a long idle.
        const previewAssignedLen = assignedShadows.length; // snapshot before cursor scan
        const rotationTicks = previewAssignedLen > 0
          ? Math.ceil(previewAssignedLen / TICK_BUDGET)
          : 1;
        // rawRevisitSpan is the TRUE inter-visit gap; revisitSpan is what the
        // attack loop is allowed to iterate. They diverge once the roster passes
        // ~(cap / activeInterval) * TICK_BUDGET shadows (~50k at 3s / 500), and
        // the difference is made up arithmetically via scaleFactor below.
        const rawRevisitSpan = rotationTicks * cyclesMultiplier * activeInterval;
        const revisitSpan = Math.min(
          rawRevisitSpan,
          5 * 60 * 1000  // 5-minute safety cap
        );

        // Init per-dungeon rotation cursor and last-processed map on first use.
        if (!Number.isFinite(dungeon._rotationCursor)) dungeon._rotationCursor = 0;
        if (!(dungeon._shadowLastProcessed instanceof Map)) dungeon._shadowLastProcessed = new Map();
        const shadowLastProcessed = dungeon._shadowLastProcessed;

        const { exchangeMarkedIds, sensesDeployedIds } = this._getCachedExclusionSets();

        // Build the slice to process this tick: TICK_BUDGET shadows starting at cursor.
        // We scan assignedShadows starting at cursor, collect up to TICK_BUDGET combat-ready ones,
        // then advance the cursor past what we scanned (wrap-around included).
        const totalAssigned = assignedShadows.length;
        let aliveShadowCount = 0;
        const combatReadyShadows = [];

        if (totalAssigned > 0) {
          // Single scan to count alive (needed for critical-HP warning) + collect the slice.
          // To keep this O(TICK_BUDGET) on hot path, we do two lightweight passes:
          //   pass 1: collect TICK_BUDGET from cursor (wrap), record alive count along the way
          //   note: alive count is approximate (only covers what we scanned), cached on dungeon
          let scanned = 0;
          let cursorStart = dungeon._rotationCursor % totalAssigned;
          let scanPos = cursorStart;
          let collected = 0;

          while (scanned < totalAssigned && collected < TICK_BUDGET) {
            const shadow = assignedShadows[scanPos];
            scanPos = (scanPos + 1) % totalAssigned;
            scanned++;

            const shadowId = this.getShadowIdValue(shadow);
            if (!shadowId) continue;
            const shadowKey = String(shadowId);

            const isDead = deadShadows.has(shadowId) || deadShadows.has(shadowKey);
            if (isDead) continue;
            const hpData = shadowHP.get(shadowId) || shadowHP.get(shadowKey);
            if (!hpData || hpData.hp <= 0) continue;
            aliveShadowCount++;

            if (exchangeMarkedIds.has(shadowKey) || sensesDeployedIds.has(shadowKey)) continue;

            combatReadyShadows.push(shadow);
            collected++;
          }

          // Advance cursor by how many positions we scanned (not just collected).
          dungeon._rotationCursor = (cursorStart + scanned) % totalAssigned;

          // Update alive-count cache every tick.
          // Full scan: exact count. Partial scan (N > TICK_BUDGET): scale window sample to full population.
          // This ensures deaths (which never call back here) still register within one rotation cycle.
          if (scanned >= totalAssigned) {
            dungeon._cachedAliveCount = aliveShadowCount;
          } else {
            // Scaled estimate: alive fraction in scanned window projected to full army.
            dungeon._cachedAliveCount = scanned > 0
              ? Math.round(aliveShadowCount / scanned * totalAssigned)
              : (dungeon._cachedAliveCount != null ? dungeon._cachedAliveCount : 0);
          }
        }

        if (dungeon._cachedAliveCount != null && dungeon._cachedAliveCount < assignedShadows.length * 0.25 && !dungeon.criticalHPWarningShown) {
          dungeon.criticalHPWarningShown = true;
          this.debugLog(
            `CRITICAL: Only ${dungeon._cachedAliveCount}/${
              assignedShadows.length
            } shadows alive (${Math.floor((dungeon._cachedAliveCount / assignedShadows.length) * 100)}%)!`
          );
        }

        const maxShadowsToProcess = combatReadyShadows.length;

        // ROTATION CATCH-UP (2026-08-03). Each shadow is credited at most
        // revisitSpan of elapsed time, but its true inter-visit gap is
        // rawRevisitSpan. Below ~50k deployed shadows these are equal and this
        // is exactly 1 — the existing behaviour, unchanged.
        //
        // Above that the 5-minute clamp truncated the difference and threw it
        // away: at 200k deployed each shadow was credited 5 of every 20 minutes,
        // so army DPS flat-lined near 50k and every shadow past it was
        // decorative. Raising the deploy ceiling alone could not have fixed
        // that — the damage was being discarded downstream of the roster size.
        //
        // The clamp itself stays. It bounds the attack LOOP, which is what
        // caused the measured 350-465ms refocus spike ticks. Damage is arithmetic, so
        // multiplying the result reproduces the discarded attacks without
        // iterating them: same numbers, same fixed 500-shadow-per-tick cost.
        //
        // This is NOT the old reservoir-sampling scaleFactor. That was expensive
        // because it walked every assigned shadow each tick to build a sample;
        // the rotation already visits each shadow exactly once per cycle, and
        // this only corrects the clock.
        const catchUpScale = revisitSpan > 0 ? rawRevisitSpan / revisitSpan : 1;
        const scaleFactor = this.settings?.rotationCatchUpScaling === false
          ? 1
          : this.clampNumber(catchUpScale, 1, C.ROTATION_CATCHUP_SCALE_MAX || 64);

        // ARMY POWER (2026-07-14): a deliberate, tunable flat multiplier on all
        // shadow damage (boss AND mobs) so the shadow horde hits hard — the
        // "sheer size overwhelms" fantasy. Applied cleanly here, NOT by
        // restoring the old double-role/behaviour inflation bug. Default 2.0
        // (~restores the pre-fix striker power and then some); tune via
        // settings.shadowDamageScalar.
        const shadowDamageScalar = this.clampNumber(
          Number.isFinite(this.settings?.shadowDamageScalar) ? this.settings.shadowDamageScalar : 2.0,
          0.1,
          20
        );

        // TRACE: Log combat state every 10th tick
        if (this._combatTickCount % 10 === 0) {
          this.settings.debug && console.log(`[Dungeons] COMBAT_TRACE: assigned=${assignedShadows.length}, slice=${maxShadowsToProcess}, cursor=${dungeon._rotationCursor}, mobs=${aliveMobs.length}, bossHP=${dungeon.boss.hp}, scale=${scaleFactor.toFixed(2)}, cycles=${cyclesMultiplier}`);
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

        // Rank-stratified mob targets: group by rank for accurate per-rank damage calc instead of a single averaged entity.
        // PERF: pooled across ticks. Previously a fresh Map + fresh
        // mobsInGroup arrays were allocated every tick — with 5000 mobs
        // in 1-2 rank groups that's 2× ~5000-element arrays created and
        // GC'd every 2s, triggering minor GC and adding 3-8ms latency
        // at high mob counts. Now the Map + group objects + inner
        // arrays persist on `dungeon._pooledMobRankGroups` and get
        // reset in place at the start of each tick (count→0, sums→0,
        // mobsInGroup.length=0). Mirrors the existing
        // `dungeon._pooledMobDamageMap` pattern a few lines below.
        if (!(dungeon._pooledMobRankGroups instanceof Map)) dungeon._pooledMobRankGroups = new Map();
        const mobRankGroups = dungeon._pooledMobRankGroups;
        // Reset all existing group buckets (keep object identity so the
        // inner arrays can be reused; this is the GC-saving lever).
        for (const group of mobRankGroups.values()) {
          group.count = 0;
          group._sumStr = 0;
          group._sumAgi = 0;
          group._sumInt = 0;
          group._sumVit = 0;
          group._sumPer = 0;
          group.representative = null;
          group.fraction = 0;
          if (Array.isArray(group.mobsInGroup)) group.mobsInGroup.length = 0;
          else group.mobsInGroup = [];
        }
        if (hasMobs) {
          for (let m = 0; m < aliveMobs.length; m++) {
            const mob = aliveMobs[m];
            if (!mob || mob.hp <= 0) continue;
            const rank = mob.rank || dungeon.rank || 'E';
            let group = mobRankGroups.get(rank);
            if (!group) {
              group = {
                count: 0,
                _sumStr: 0,
                _sumAgi: 0,
                _sumInt: 0,
                _sumVit: 0,
                _sumPer: 0,
                representative: null,
                fraction: 0,
                mobsInGroup: [],
              };
              mobRankGroups.set(rank, group);
            }
            group.count++;
            group._sumStr += (Number.isFinite(mob.strength) ? mob.strength : 0);
            group._sumAgi += (Number.isFinite(mob.agility) ? mob.agility : 0);
            group._sumInt += (Number.isFinite(mob.intelligence) ? mob.intelligence : 0);
            group._sumVit += (Number.isFinite(mob.vitality) ? mob.vitality : 0);
            group._sumPer += (Number.isFinite(mob.perception) ? mob.perception : 0);
            group.mobsInGroup.push(mob);
          }
          // Finalize: compute average stats per rank group → representative mob target.
          // Skip groups with count===0 (rank disappeared between ticks).
          let totalMobCount = 0;
          for (const [rank, group] of mobRankGroups) {
            if (group.count === 0) continue;
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
          }
          // Second pass: assign fractions (also skipping count===0).
          for (const [, group] of mobRankGroups) {
            if (group.count === 0) continue;
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

        // Process the rotating slice: each shadow uses its REAL elapsed time since
        // it was last processed by this loop (shadowLastProcessed map). This ensures
        // exact cumulative damage without any scaleFactor approximation.
        for (
          let i = 0;
          i < combatReadyShadows.length && i < maxShadowsToProcess;
          i++
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

          // Use real elapsed time since this shadow was last visited by the rotation.
          // First visit defaults to revisitSpan ago (one full inter-visit window worth of backlog).
          const lastProcessedAt = shadowLastProcessed.get(String(shadowId)) || (now - revisitSpan);
          const timeSinceLastAttack = Math.max(0, now - lastProcessedAt);
          let effectiveCooldown = this.getEffectiveAttackCooldownMs(
            finalCombatData.attackInterval || finalCombatData.cooldown || 2000,
            activeInterval
          );

          const sprintReduction = this._getSprintCooldownReduction(dungeon);
          if (sprintReduction > 0) {
            effectiveCooldown = Math.max(800, Math.floor(effectiveCooldown * (1 - sprintReduction)));
          }

          // Pass revisitSpan so getCappedAttackElapsedMs allows the full inter-visit
          // elapsed through: maxCatchUp = max(revisitSpan*2, cooldown*4) ≥ revisitSpan.
          const attacksInSpan = this.calculateAttacksInTimeSpan(
            timeSinceLastAttack,
            effectiveCooldown,
            revisitSpan
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

          // SOVEREIGN DOCTRINE: species-GM-on-field frontline bonuses (1/1 when unled).
          const leadershipMult = this._getShadowLeadershipMult
            ? this._getShadowLeadershipMult(dungeon, shadow, assignedShadows)
            : { mob: 1, boss: 1 };

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
              : this.calculateShadowDamage(shadow, bossStats, dungeon.boss.rank, false);
            const roleBossMultiplier = this.getRoleCombatOutgoingDamageMultiplier({
              shadow,
              combatData: finalCombatData,
              targetType: 'boss',
              bossHpFraction,
              roleCombatContext,
            });
            const perHitBoss = Math.max(1, Math.floor(perHitBossRaw * roleBossMultiplier * shadowDamageScalar * leadershipMult.boss));
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
                : this.calculateShadowDamage(shadow, rankGroup.representative, rankGroup.representative.rank, false);
              const roleMobMultiplier = this.getRoleCombatOutgoingDamageMultiplier({
                shadow,
                combatData: finalCombatData,
                targetType: 'mob',
                bossHpFraction,
                roleCombatContext,
              });
              const perHitMob = Math.max(1, Math.floor(perHitMobRaw * roleMobMultiplier * shadowDamageScalar * leadershipMult.mob));
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
                const damageToApply = Math.min(remainingDamage, Math.ceil(effectiveHP));
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
            revisitSpan,
            attacksInSpan
          );

          // Record when this shadow was last processed by the rotation cursor.
          // Used next visit to compute exact elapsed time for attack calculation.
          shadowLastProcessed.set(String(shadowId), now);

          // PERF: calculateShadowAttackInterval only changes on rank/stat change.
          // Recompute at most every 10 ticks (≈30s) instead of every tick.
          // combatDataToUpdate.attackInterval is set at init by initializeShadowCombatData
          // and remains valid until a rank or allocation change triggers re-init.
          if (this._combatTickCount % 10 === 0) {
            if (this.shadowArmy?.calculateShadowAttackInterval) {
              combatDataToUpdate.attackInterval = this.shadowArmy.calculateShadowAttackInterval(shadow, 2000);
            } else {
              const cooldownVariance = this._varianceNarrow();
              combatDataToUpdate.attackInterval = Math.max(
                800,
                Math.floor((combatDataToUpdate.attackInterval || combatDataToUpdate.cooldown || 2000) * cooldownVariance)
              );
            }
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

        // Apply aggregated boss damage once (was per-shadow).
        // COMMANDER'S PRESENCE (2026-07-14): fighting alongside the army
        // (userParticipating — set by joining + attacking via chat) amplifies
        // the whole army's boss damage. Without this the player was cosmetic
        // once shadows were deployed; now joining is a real, tunable buff on
        // top of the player's own per-message hit. Deploy-and-idle gets 1.0.
        if (aggregatedBossDamage > 0) {
          const participationBonus = dungeon.userParticipating
            ? this.clampNumber(
                Number.isFinite(this.settings?.userParticipationDamageBonus)
                  ? this.settings.userParticipationDamageBonus
                  : 0.25,
                0,
                2
              )
            : 0;
          const finalBossDamage = Math.max(
            1,
            Math.floor(aggregatedBossDamage * (1 + participationBonus))
          );
          await this.applyDamageToBoss(channelKey, finalBossDamage, 'shadow', null);
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
    // PERF: 60s TTL (2026-07-29, AAPerfSentinel v2 finding). The 10s TTL +
    // ShadowArmy's 2s-fresh snapshot meant this fell through to a FULL
    // 281k-record cursor walk + full decompress every ~10s for the entire
    // duration of any active dungeon (~3.7M IDB callbacks per 2.5min,
    // measured). Correctness is carried by the EXPLICIT invalidations
    // (extraction/rank-up/army-change → invalidateShadowsCache()); the TTL
    // is only a safety net, and 60s matches the staleness class already
    // accepted for combat allocation (registry: 45-60s deliberate tradeoff).
    if (useCache && this._shadowsCache) {
      const now = Date.now();
      if (now - this._shadowsCache.timestamp < 60000) {
        return this._shadowsCache.shadows;
      }
    }

    if (!this.shadowArmy) return [];

    // CROSS-PLUGIN SNAPSHOT: Check ShadowArmy's shared snapshot before hitting IDB.
    // If ShadowArmy already has a fresh snapshot (<2s old), use it directly —
    // avoids redundant IDB cursor + decompression that other consumers already triggered.
    // SHARED SNAPSHOT, 60s WINDOW (2026-07-30). This only tried
    // getShadowSnapshot(), whose TTL is 2 SECONDS — so it almost always
    // returned null and execution fell through to the branch below, which
    // loads and decompresses Dungeons' OWN copy of all 281k shadows. The
    // result was two full decompressed armies resident at once
    // (ShadowArmy._snapshotCache + Dungeons._shadowsCache), ~250MB each,
    // which is the entire reason heap plateaus near 500MB.
    //
    // getShadowSnapshotForDeploy() exists for precisely this case and is
    // documented as such: same array, 60s TTL. That matches the 60s TTL this
    // cache already applies to its own copy, so it is the SAME staleness
    // class — not a new tradeoff. Preferring the 2s snapshot first keeps the
    // freshest data when it happens to be available.
    const snapshot =
      this.shadowArmy.getShadowSnapshot?.() ||
      this.shadowArmy.getShadowSnapshotForDeploy?.();
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
      // Get shadows from IndexedDB only (no fallback to old storage).
      // PERF (2026-07-13, ledger open item): getShadows({}, 0, Infinity) is
      // the documented FULL-WALK TRAP at 281k-shadow scale — the filtered
      // path opens an open-ended cursor with per-record filter + sort. The
      // wave-3 replacement getAllShadowsRaw() streams the store in indexed
      // batches with no wasted sort. Same result set; this branch only runs
      // when ShadowArmy's snapshot cache is cold (e.g. first combat tick
      // after a restart) — exactly when the stall was worst.
      const shadows = typeof this.shadowArmy.storageManager.getAllShadowsRaw === 'function'
        ? await this.shadowArmy.storageManager.getAllShadowsRaw()
        : await this.shadowArmy.storageManager.getShadows({}, 0, Infinity);
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
      // Tag CRITICAL so the log bypasses the 30s throttle (per Tier 1A
      // semantics). Then return the cached shadows if we have one — a
      // transient IDB hiccup (transaction abort, brief lock) shouldn't
      // wipe out the entire shadow army for one combat tick. Empty
      // array only when there's literally no cached snapshot available
      // (first-load failure), preserving the original behaviour for
      // that one case.
      this.errorLog('CRITICAL', 'Error getting all shadows', error);
      const cached = this._shadowsCache?.shadows;
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
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
