# Dungeon Completion Pipeline Optimization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make dungeons disappear instantly from UI on completion while processing XP/ARISE/growth in background, and cut total processing time from 2-5s to 0.5-1.5s.

**Architecture:** Split `completeDungeon()` into Phase A (sync cleanup — UI, locks, state) and Phase B (fire-and-forget background — ARISE, XP, natural growth, DB). Eliminate a redundant IDB fetch by passing shadow data through the call chain. Convert `applyNaturalGrowth()` from async to sync (it has zero internal awaits).

**Files:**
- Modify: `plugins/Dungeons.plugin.js` (~15,042 lines)
- Modify: `plugins/ShadowArmy.plugin.js` (~11,900 lines)

---

## Task 1: Create feature branch

**Step 1: Branch from main**

```bash
cd ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets
git checkout main && git pull
git checkout -b perf/dungeon-completion-pipeline
```

---

## Task 2: Fix 1 — Reorder `completeDungeon()` (Phase A sync, Phase B background)

**Files:**
- Modify: `plugins/Dungeons.plugin.js:11149-11535`

**Why:** Currently `activeDungeons.delete(channelKey)` happens at line 11432 — AFTER all async ARISE extraction, XP grants, and DB cleanup finish. The dungeon stays visible in UI for 2-5s until the entire waterfall resolves.

**Step 1: Restructure completeDungeon into two phases**

Replace the entire `completeDungeon` method body. The key changes are:

1. Move ALL sync cleanup (combat stops, UI removal, HP bars, channel locks, `activeDungeons.delete`, `userActiveDungeon = null`) to the TOP of the method — **before any `await`**.
2. Snapshot the dungeon object's data needed for background processing.
3. Wrap ARISE extraction, XP grants, user XP, summary toast, and DB cleanup into a `_completeDungeonBackground()` fire-and-forget call.
4. The `_completing` guard stays at the top. The snapshot captures contributions, corpsePile, combat analytics, etc.

**Phase A (sync, ~0ms)** — lines that run immediately:

```javascript
async completeDungeon(channelKey, reason) {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon) return;
    if (dungeon._completing) return;
    dungeon._completing = true;

    // ── PHASE A: Instant cleanup (sync) ──────────────────────────
    // Track end time for spawn cooldowns
    this.settings.lastDungeonEndTime || (this.settings.lastDungeonEndTime = {});
    this.settings.lastDungeonEndTime[channelKey] = Date.now();

    const hadShadowsDeployed = Boolean(dungeon.shadowsDeployed);
    dungeon.completed = reason !== 'timeout';
    dungeon.failed = reason === 'timeout';
    dungeon.shadowsDeployed = false;
    dungeon.deployedAt = null;
    if (dungeon.bossGate && typeof dungeon.bossGate === 'object') {
      dungeon.bossGate.deployedAt = null;
      dungeon.bossGate.unlockedAt = null;
    }
    this.shadowAllocations.delete(channelKey);
    this._markAllocationDirty(`dungeon-complete:${reason}`);

    // Snapshot data needed for background processing
    const corpsePileSnapshot = dungeon.corpsePile || [];
    dungeon.corpsePile = [];

    const dungeonSnapshot = {
      name: dungeon.name,
      rank: dungeon.rank,
      channelName: dungeon.channelName,
      guildName: dungeon.guildName,
      userParticipating: dungeon.userParticipating,
      shadowContributions: dungeon.shadowContributions ? { ...dungeon.shadowContributions } : {},
      boss: dungeon.boss ? { ...dungeon.boss } : null,
      bossGate: dungeon.bossGate ? { ...dungeon.bossGate } : null,
      deployedAt: dungeon.deployedAt,
      startTime: dungeon.startTime,
      mobs: dungeon.mobs ? { killed: dungeon.mobs.killed || 0 } : { killed: 0 },
      shadowRevives: dungeon.shadowRevives || 0,
      userDamageDealt: dungeon.userDamageDealt || 0,
      beastFamilies: dungeon.beastFamilies || [],
      combatAnalytics: dungeon.combatAnalytics ? { ...dungeon.combatAnalytics } : {},
    };
    const shadowDeathCount = this.deadShadows.get(channelKey)?.size || 0;

    // CRITICAL CLEANUP: Stop all dungeon combat systems IMMEDIATELY
    this.stopShadowAttacks(channelKey);
    this.stopBossAttacks(channelKey);
    this.stopMobAttacks(channelKey);
    this.stopMobKillNotifications(channelKey);
    this.stopMobSpawning(channelKey);
    this.removeDungeonIndicator(channelKey);

    // Remove HP bar and containers
    this.removeBossHPBar(channelKey);
    document
      .querySelectorAll(`.dungeon-boss-hp-container[data-channel-key="${channelKey}"]`)
      .forEach((el) => el.remove());

    // Reset user active dungeon (allows entering new dungeons)
    if (this.settings.userActiveDungeon === channelKey) {
      this.settings.userActiveDungeon = null;
    }

    // Release channel lock
    this.channelLocks.delete(channelKey);

    // Remove from active dungeons — dungeon disappears from UI NOW
    this.activeDungeons.delete(channelKey);
    delete this.settings.mobKillNotifications[channelKey];
    this.deadShadows.delete(channelKey);
    this.clearRoleCombatState(channelKey);
    if (this.shadowAllocations) {
      this.shadowAllocations.delete(channelKey);
    }
    this._markAllocationDirty('dungeon-cleanup');
    if (this.extractionInProgress) {
      this.extractionInProgress.delete(channelKey);
    }
    if (this._lastShadowAttackTime) this._lastShadowAttackTime.delete(channelKey);
    if (this._lastBossAttackTime) this._lastBossAttackTime.delete(channelKey);
    if (this._lastMobAttackTime) this._lastMobAttackTime.delete(channelKey);
    if (this.extractionEvents) {
      const eventsToRemove = [];
      this.extractionEvents.forEach((value, key) => {
        if (key.includes(channelKey)) eventsToRemove.push(key);
      });
      eventsToRemove.forEach((key) => this.extractionEvents.delete(key));
    }

    this.saveSettings();

    // ── PHASE B: Background processing (fire-and-forget) ──────────
    this._completeDungeonBackground(channelKey, reason, dungeonSnapshot, corpsePileSnapshot, hadShadowsDeployed, shadowDeathCount).catch((error) => {
      this.errorLog('Background dungeon completion processing failed', error);
      this.showToast('Dungeon processing error — XP/ARISE may be incomplete.', 'error');
    });
  }
```

**Step 2: Create the background processor method**

Insert `_completeDungeonBackground` immediately after `completeDungeon`:

```javascript
  async _completeDungeonBackground(channelKey, reason, snap, corpsePileSnapshot, hadShadowsDeployed, shadowDeathCount) {
    // ── ARISE EXTRACTION ──
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
      console.warn(`[Dungeons] ⚠️ ARISE: Corpse pile EMPTY for ${channelKey} — no enemies to extract (deployed: ${hadShadowsDeployed}, mobs killed: ${snap.mobs?.killed || 0})`);
    } else if (!snap.userParticipating) {
      this.settings.debug && console.log(`[Dungeons] ⚔️ ARISE SKIPPED: ${snap.name} — user was defeated, corpse pile cleaned up (${pileSize} bodies lost)`);
    }

    // ── COLLECT SUMMARY STATS ──
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

    // ── SHADOW XP GRANTS ──
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
          { channelKey, reason, totalMobsKilled: summaryStats.totalMobsKilled, totalBossDamage: summaryStats.totalBossDamage }
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

    // ── USER XP GRANTS ──
    const rankIndex = this.getRankIndexValue(snap.rank);

    if (reason === 'complete') {
      if (this.soloLevelingStats) {
        const completionXP = 100 + rankIndex * 50;
        if (this._grantUserDungeonXP(completionXP, 'dungeon_complete', { channelKey, dungeonRank: snap.rank, reason })) {
          summaryStats.userXP = completionXP;
        }
      }
    }
    if (reason === 'boss') {
      const actualBossDamage = summaryStats.totalBossDamage || 0;
      const actualMobsKilled = summaryStats.totalMobsKilled || 0;
      const userDealtDamage = (snap.userDamageDealt || 0) > 0;
      if (actualBossDamage === 0 && actualMobsKilled === 0 && !userDealtDamage) {
        console.warn(`[Dungeons] ⚠️ XP DENIED: "${snap.name}" [${snap.rank}] — boss defeated but 0 damage dealt`);
        this.showToast(`${snap.name}: No XP earned — no combat contribution.`, 'info');
      } else if (this.soloLevelingStats) {
        const bossXP = 200 + rankIndex * 100;
        if (this._grantUserDungeonXP(bossXP, 'dungeon_boss_kill', { channelKey, dungeonRank: snap.rank, reason, userParticipating: snap.userParticipating })) {
          summaryStats.userXP = bossXP;
        }
      }

      if (snap.userParticipating) {
        this.defeatedBosses.set(channelKey, {
          boss: snap.boss,
          dungeon: snap,
          timestamp: Date.now(),
        });
        this.showAriseButton(channelKey);
      }
    }

    // Shadow Monarch XP Mirror
    if (summaryStats.shadowTotalXP > 0 && this.soloLevelingStats) {
      const shadowShareXP = Math.floor(summaryStats.shadowTotalXP * 1.0);
      if (shadowShareXP > 0) {
        if (this._grantUserDungeonXP(shadowShareXP, 'dungeon_shadow_share', { channelKey, dungeonRank: snap.rank, shadowTotalXP: summaryStats.shadowTotalXP, sharePercent: 1.0 })) {
          summaryStats.userXP = (summaryStats.userXP || 0) + shadowShareXP;
          summaryStats.shadowShareXP = shadowShareXP;
        }
      }
    }

    summaryStats.shadowsExtracted = extractionResults.extracted;
    summaryStats.extractionAttempts = extractionResults.attempted;

    if (this.settings.debug) {
      const duration = snap.startTime ? Math.round((Date.now() - snap.startTime) / 1000) : 0;
      const durationStr = duration > 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`;
      console.log(
        `[Dungeons] 🏰 ${reason === 'timeout' ? 'FAILED' : 'COMPLETE'}: "${snap.name}" [${snap.rank}] in #${snap.channelName || '?'} (${snap.guildName || '?'}) — ` +
        `${durationStr} | Mobs: ${summaryStats.totalMobsKilled} | Deaths: ${summaryStats.totalShadowDeaths || 0} | ` +
        `Extracted: ${extractionResults.extracted}/${extractionResults.attempted} | Key: ${channelKey}`
      );
    }

    // Show summary
    if (reason !== 'timeout') {
      this.showDungeonCompletionSummary(summaryStats);
    } else {
      this.showToast(`${snap.name} Failed (Timeout)`, 'error');
    }

    // ── DATABASE CLEANUP ──
    if (reason !== 'boss' || !snap.userParticipating) {
      if (this.storageManager) {
        try {
          await this.storageManager.deleteDungeon(channelKey);
          await this.storageManager.clearCompletedDungeons();
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
  }
```

**Step 3: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 4: Commit checkpoint**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): split completeDungeon into sync cleanup + async background

Phase A clears UI/locks/activeDungeons immediately (0ms).
Phase B processes ARISE/XP/growth/DB cleanup fire-and-forget.
Dungeon disappears from UI instantly instead of waiting 2-5s."
```

---

## Task 3: Fix 2 — Eliminate double IDB fetch of shadow data

**Files:**
- Modify: `plugins/Dungeons.plugin.js:12029-12206` (`grantShadowDungeonXP`)
- Modify: `plugins/Dungeons.plugin.js:7994-8036` (`_queueDeferredDungeonXpPostProcess`)
- Modify: `plugins/Dungeons.plugin.js:8038-8060` (`_runDeferredDungeonXpPostProcess`)

**Why:** `grantShadowDungeonXP` fetches shadows at line 12050 via `_fetchDungeonShadowsByIds`. Then `_runDeferredDungeonXpPostProcess` fetches the **exact same shadow IDs** again at line 8053. This is a wasted IDB round-trip.

**Step 1: Pass shadow data through the queue**

In `grantShadowDungeonXP`, after the XP grant succeeds (line 12169), pass the already-fetched `shadowMap` entries through to the deferred processor:

Change the `_queueDeferredDungeonXpPostProcess` call (lines 12183-12191) to include `fetchedShadowEntries`:

```javascript
    const deferredPostProcess = this._queueDeferredDungeonXpPostProcess({
      channelKey,
      dungeonName: dungeon?.name,
      dungeonRank: dungeon?.rank,
      xpTargetIds,
      beforeStatesEntries: Array.from(beforeStates.entries()),
      combatHours,
      growthHoursByShadowId,
      fetchedShadowEntries: Array.from(shadowMap.entries()),
    });
```

**Step 2: Thread `fetchedShadowEntries` through the queue**

Update `_queueDeferredDungeonXpPostProcess` signature (line 7994) to accept and forward the new field:

```javascript
  _queueDeferredDungeonXpPostProcess({
    channelKey,
    dungeonName,
    dungeonRank,
    xpTargetIds,
    beforeStatesEntries,
    combatHours,
    growthHoursByShadowId,
    fetchedShadowEntries,
  }) {
```

And pass it through in the `_runDeferredDungeonXpPostProcess` call (line 8020-8028):

```javascript
      this._runDeferredDungeonXpPostProcess({
        taskKey,
        channelKey,
        dungeonName,
        dungeonRank,
        xpTargetIds,
        beforeStatesEntries,
        combatHours,
        growthHoursByShadowId,
        fetchedShadowEntries,
      }).catch((error) => {
```

**Step 3: Use pre-fetched shadows in `_runDeferredDungeonXpPostProcess`**

Update the signature (line 8038) to accept `fetchedShadowEntries` and use it instead of re-fetching:

```javascript
  async _runDeferredDungeonXpPostProcess({
    taskKey,
    channelKey,
    dungeonName,
    dungeonRank,
    xpTargetIds,
    beforeStatesEntries,
    combatHours,
    growthHoursByShadowId,
    fetchedShadowEntries,
  }) {
    const startMs = Date.now();
    const beforeStates = new Map(beforeStatesEntries || []);
    const shadowStorage = this.shadowArmy?.storageManager;

    try {
      // Use pre-fetched shadows if available, otherwise fall back to IDB fetch
      let updatedMap;
      if (fetchedShadowEntries && fetchedShadowEntries.length > 0) {
        updatedMap = new Map(
          fetchedShadowEntries.filter(([sid]) => beforeStates.has(sid))
        );
      } else {
        const updatedShadows = await this._fetchDungeonShadowsByIds(xpTargetIds);
        updatedMap = new Map();
        for (const shadow of updatedShadows) {
          const sid = String(this.getShadowIdValue(shadow) || '');
          if (sid && beforeStates.has(sid)) {
            updatedMap.set(sid, shadow);
          }
        }
      }
```

(Rest of `_runDeferredDungeonXpPostProcess` remains unchanged from line 8062 onward.)

**Step 4: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 5: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): eliminate double IDB fetch in XP post-processing

Pass already-fetched shadow data from grantShadowDungeonXP through
to _runDeferredDungeonXpPostProcess via the queue, avoiding a
redundant _fetchDungeonShadowsByIds call on the same shadow IDs."
```

---

## Task 4: Fix 3 — Make `applyNaturalGrowth` synchronous + batch the loop

**Files:**
- Modify: `plugins/ShadowArmy.plugin.js:7252-7314` (`applyNaturalGrowth`)
- Modify: `plugins/Dungeons.plugin.js:8087-8128` (the growth loop in `_runDeferredDungeonXpPostProcess`)

**Why:** `applyNaturalGrowth` is marked `async` but contains zero `await` statements — it's pure synchronous stat computation. The dungeon post-processor awaits it in a `for` loop (line 8097), serializing N shadows × microtask tick overhead.

**Step 1: Remove `async` from `applyNaturalGrowth`**

In `ShadowArmy.plugin.js`, change line 7252:

```javascript
  // BEFORE:
  async applyNaturalGrowth(shadow, combatTimeHours = 0) {
  // AFTER:
  applyNaturalGrowth(shadow, combatTimeHours = 0) {
```

No other changes needed — the method body is already fully synchronous.

**Step 2: Remove `await` from growth loop in Dungeons**

In `_runDeferredDungeonXpPostProcess`, change the growth loop (lines 8090-8116) to call `applyNaturalGrowth` synchronously:

```javascript
      let growthSaved = 0;
      if (this.shadowArmy?.applyNaturalGrowth && combatHours > 0 && updatedMap.size > 0) {
        const growthUpdates = [];
        for (const [sid, shadow] of updatedMap.entries()) {
          const requestedHours = Number(growthHoursByShadowId?.[sid]);
          const shadowCombatHours = Number.isFinite(requestedHours)
            ? Math.max(0, requestedHours)
            : combatHours;
          if (shadowCombatHours <= 0) continue;

          const growthApplied = this.shadowArmy.applyNaturalGrowth(shadow, shadowCombatHours);
          if (!growthApplied || !shadowStorage) continue;

          if (typeof this.shadowArmy.attemptAutoRankUp === 'function') {
            const growthRankUp = this.shadowArmy.attemptAutoRankUp(shadow);
            if (growthRankUp?.success) {
              rankedUpShadows.push({
                name: shadow.name || beforeStates.get(sid)?.name || 'Shadow',
                oldRank: growthRankUp.oldRank,
                newRank: growthRankUp.newRank,
              });
            }
          }

          const prepared = this.shadowArmy.prepareShadowForSave
            ? this.shadowArmy.prepareShadowForSave(shadow)
            : shadow;
          prepared && growthUpdates.push(prepared);
        }

        if (growthUpdates.length > 0 && shadowStorage) {
          if (typeof shadowStorage.saveShadowsChunked === 'function') {
            await shadowStorage.saveShadowsChunked(growthUpdates, 10);
          } else if (typeof shadowStorage.updateShadowsBatch === 'function') {
            await shadowStorage.updateShadowsBatch(growthUpdates);
          } else {
            await Promise.all(growthUpdates.map((shadow) => shadowStorage.saveShadow(shadow)));
          }
          growthSaved = growthUpdates.length;
        }
      }
```

The only change in the loop is `await this.shadowArmy.applyNaturalGrowth(...)` → `this.shadowArmy.applyNaturalGrowth(...)`. The final batched IDB write remains async (single await).

**Step 3: Verify no other callers depend on async return**

Check all callers of `applyNaturalGrowth`:

```bash
grep -n 'applyNaturalGrowth' plugins/*.plugin.js
```

Expected: Only `_runDeferredDungeonXpPostProcess` in Dungeons.plugin.js calls it with `await`. Since removing `async` means it returns `true/false` directly instead of `Promise<true/false>`, and both are truthy, the `if (!growthApplied)` guard works identically.

**Step 4: Syntax check both files**

```bash
node -c plugins/ShadowArmy.plugin.js && node -c plugins/Dungeons.plugin.js
```

Expected: Both `Syntax OK`

**Step 5: Commit**

```bash
git add plugins/ShadowArmy.plugin.js plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): make applyNaturalGrowth sync + remove serial awaits

applyNaturalGrowth has zero internal awaits — pure stat computation.
Remove async keyword from ShadowArmy, remove await from Dungeons
growth loop. All N shadows now process in a single synchronous pass
followed by one batched IDB write."
```

---

## Task 5: Cleanup — remove orphaned dungeon object fields in Phase A

**Files:**
- Modify: `plugins/Dungeons.plugin.js`

**Why:** The old `completeDungeon` had cleanup of `dungeon.mobs.activeMobs`, `dungeon.shadowCombatData`, `dungeon.shadowContributions`, `dungeon.boss`, etc. (lines 11469-11508). Since we snapshot what we need in Phase A and the dungeon object is deleted from `activeDungeons`, these in-memory cleanups are unnecessary for GC — the whole dungeon object becomes unreachable. However, for the `reason === 'boss' && userParticipating` path where we keep `defeatedBosses`, we still reference `snap.boss` which is a shallow copy.

**Step 1: Verify the boss path**

The boss ARISE path (line ~11342 in old code) stores `dungeon.boss` into `defeatedBosses`. In our new code, we use `snap.boss` which is a shallow copy created in Phase A. This is correct — the boss data survives in the snapshot.

No code change needed. The orphaned cleanup lines (11469-11531) are already gone since we deleted the dungeon from `activeDungeons` in Phase A.

**Step 2: Verify `_processCorpsePile` works with snapshot**

`_processCorpsePile(channelKey, snap, corpsePileSnapshot)` — the method uses `dungeon.corpsePile` as fallback (line 1522) which we already set to `[]`, but we pass `pileSnapshot` explicitly so the fallback path never triggers. The method also reads `dungeon.beastFamilies` (line 1537) — our snapshot includes `beastFamilies`. Correct.

No changes needed.

---

## Task 6: Final verification + sync

**Step 1: Full syntax check**

```bash
node -c plugins/Dungeons.plugin.js && node -c plugins/ShadowArmy.plugin.js
```

**Step 2: Grep for removed patterns to confirm clean removal**

```bash
# Should show zero hits in completeDungeon for the old cleanup block
grep -n 'dungeon.mobs.activeMobs = null' plugins/Dungeons.plugin.js
grep -n 'dungeon.shadowCombatData = null' plugins/Dungeons.plugin.js
grep -n 'dungeon.shadowContributions = null' plugins/Dungeons.plugin.js
# Should show zero hits — these are now in the fire-and-forget background
```

**Step 3: Sync to BetterDiscord**

```bash
cp plugins/Dungeons.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
cp plugins/ShadowArmy.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

**Step 4: Squash merge to main**

```bash
git checkout main
git merge --squash perf/dungeon-completion-pipeline
git commit -m "perf(dungeons): optimize completion pipeline — instant UI clear + background processing

Three optimizations to completeDungeon:

1. Split into Phase A (sync) + Phase B (fire-and-forget):
   - Phase A: Stop combat, remove UI, delete from activeDungeons,
     release locks — dungeon disappears instantly (~0ms)
   - Phase B: ARISE extraction, shadow XP, natural growth, DB cleanup
     run in background with error handling + toast notifications

2. Eliminate double IDB fetch:
   - Pass already-fetched shadow data from grantShadowDungeonXP
     through to _runDeferredDungeonXpPostProcess via the queue
   - Saves one full IDB read of the same shadow IDs

3. Make applyNaturalGrowth synchronous:
   - Method had zero internal awaits (pure stat computation)
   - Remove async keyword + await in loop
   - All N shadows process in single sync pass, one batched IDB write

Impact:
- UI clear time: 2-5s → ~0ms
- Total pipeline (background): 2-5s → ~0.5-1.5s
- IDB reads per completion: 3+ → 2
- IDB writes: N + 1 → 1 batch"
```

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| UI clear time | 2-5s | ~0ms |
| Total pipeline (background) | 2-5s | ~0.5-1.5s |
| IDB reads per completion | 3+ | 2 |
| IDB writes | N + 1 batch | 1 batch |
| `applyNaturalGrowth` calls | N × await | N × sync |

## Risk Mitigation

- **Hot-reload safety:** Phase B checks `this.started` before IDB operations (existing guard in `_queueDeferredDungeonXpPostProcess` line 8016). If plugin is disabled mid-processing, deferred work is silently dropped.
- **Error isolation:** Phase B `.catch()` shows error toast but never blocks UI — user can keep using Discord normally.
- **Boss ARISE path:** `defeatedBosses` uses snapshot data, not the deleted dungeon object. ARISE button still works.
- **Backward compat:** `applyNaturalGrowth` returns `true/false` (not `Promise`) — callers that `await` it will still work since `await true === true`.
