# Dungeons Combat Hot Path & Multi-Dungeon Optimization

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate performance bottlenecks in the Dungeons combat loop AND fix multi-dungeon scaling issues (orphan state, allocation races, tick spikes).

**Architecture:** Fixes 1-3 target hot-path methods called from `_combatLoopTick` (1000ms interval). Fixes 4-6 address multi-dungeon lifecycle issues found via code audit. No API changes, no behavioral changes — purely internal efficiency and correctness. ~55 LOC changed total.

**Context:**
- Combat loop fires every 1s via `_combatLoopTick`, calling `processBossAttacks`, `processMobAttacks`, and `processShadowAttacks` each tick.
- Typical combat has 1-10 active dungeons, each with 5-50 shadows vs. 10-500 mobs.
- All fixes were verified against the actual code — not assumptions. See verification notes in each task.
- Multi-dungeon audit revealed orphan Map entries, allocation race conditions, and tick spikes at 10+ concurrent dungeons.

**File:** `plugins/Dungeons.plugin.js`

---

## Task 1: Create branch

**Step 1: Create feature branch from main**

```bash
cd ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets
git checkout main
git checkout -b perf/combat-hot-path-optimization
```

**Step 2: Verify branch**

```bash
git branch --show-current
```

Expected: `perf/combat-hot-path-optimization`

---

## Task 2: Replace rAF spin-loop with calculated setTimeout (Fix 1)

**Files:**
- Modify: `plugins/Dungeons.plugin.js:13478-13507`

**What:** `processHPBarUpdateQueue` uses `requestAnimationFrame` to retry throttled HP bar updates. When an entry is still within its 250ms throttle window, it re-queues and calls `requestAnimationFrame` again — creating a 60fps polling loop that wastes ~15 frames per queued update. During active combat with multiple dungeons, this burns CPU continuously.

**Why it's safe:** `queueHPBarUpdate` (line 13448) already handles immediate updates synchronously when throttle has passed (lines 13460-13463). The rAF path only fires for entries that are still within the 250ms window. Replacing rAF with a `setTimeout` for the remaining throttle time preserves identical behavior — the update fires at the same moment — but eliminates all wasted intermediate frames.

**Verified:** 18 call sites for `queueHPBarUpdate` across the file. None depend on rAF timing. The throttle is 250ms (line 13457/13490). The `updateBossHPBar` call inside `processHPBarUpdateQueue` is the same one called directly by `queueHPBarUpdate`.

**Step 1: Replace processHPBarUpdateQueue**

At lines 13478-13507, change:

```javascript
  processHPBarUpdateQueue() {
    if (!this._hpBarUpdateQueue || this._hpBarUpdateQueue.size === 0) {
      this._hpBarUpdateScheduled = false;
      return;
    }

    const now = Date.now();
    const queued = this._hpBarUpdateQueue;
    this._hpBarUpdateQueue = new Set();

    for (const channelKey of queued) {
      const lastUpdate = this._lastHPBarUpdate[channelKey] || 0;
      if (now - lastUpdate >= 250) {
        // Throttle passed, update now
        this._lastHPBarUpdate[channelKey] = now;
        this.updateBossHPBar(channelKey);
      } else {
        // Still throttled, re-queue
        this._hpBarUpdateQueue.add(channelKey);
      }
    }

    // Schedule next batch if queue not empty
    if (this._hpBarUpdateQueue.size > 0) {
      requestAnimationFrame(() => {
        this.processHPBarUpdateQueue();
      });
    } else {
      this._hpBarUpdateScheduled = false;
    }
  }
```

to:

```javascript
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
  }
```

**Step 2: Also update initial scheduling in queueHPBarUpdate**

At lines 13467-13472, change:

```javascript
    // Schedule batch update if not already scheduled
    if (!this._hpBarUpdateScheduled && this._hpBarUpdateQueue.size > 0) {
      this._hpBarUpdateScheduled = true;
      requestAnimationFrame(() => {
        this.processHPBarUpdateQueue();
      });
    }
```

to:

```javascript
    // Schedule batch update if not already scheduled
    if (!this._hpBarUpdateScheduled && this._hpBarUpdateQueue.size > 0) {
      this._hpBarUpdateScheduled = true;
      this._hpBarUpdateTimer = this._setTrackedTimeout(() => {
        this._hpBarUpdateTimer = null;
        this.processHPBarUpdateQueue();
      }, 250);
    }
```

> **Note:** Uses a fixed 250ms timeout instead of per-channel remaining calculation. The queue may contain entries for multiple channels with different throttle states. `processHPBarUpdateQueue` handles per-channel timing internally via `earliestRetry`. This is still vastly better than rAF (16ms × 15 frames = 240ms of wasted polling vs. one 250ms sleep).

**Step 3: Add timer cleanup in stop()**

Find the cleanup section in `stop()` where other HP bar properties are cleaned up, and add:

```javascript
      if (this._hpBarUpdateTimer) {
        this._timeouts.delete(this._hpBarUpdateTimer);
        clearTimeout(this._hpBarUpdateTimer);
        this._hpBarUpdateTimer = null;
      }
```

> **Note:** Uses the existing tracked timeout cleanup pattern (`this._timeouts.delete` + `clearTimeout`). There is no `_clearTrackedTimeout` method — the tracked timeout system uses `_setTrackedTimeout` to register and manual delete + clearTimeout to cancel.

**Step 4: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 5: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): replace rAF spin-loop with calculated setTimeout in HP bar queue

processHPBarUpdateQueue was using requestAnimationFrame to retry throttled
entries, creating a 60fps polling loop that wasted ~15 frames per queued
update during active combat. Now calculates exact remaining throttle time
and uses setTimeout to wake precisely when the entry is ready."
```

---

## Task 3: Remove redundant saveSettings from combat methods (Fix 2)

**Files:**
- Modify: `plugins/Dungeons.plugin.js:10268` and `plugins/Dungeons.plugin.js:10608`

**What:** Both `processBossAttacks` (line 10268) and `processMobAttacks` (line 10608) call `this.saveSettings()` at the end of every tick. These are pure function-entry overhead.

**Why it's safe:**
- `saveSettings()` uses a 3s debounce with a **no-op guard** (line 2613: `if (this._saveSettingsTimer) return;`). With combat ticking at 1s and the debounce at 3s, these calls just enter the function, set `_saveSettingsDirty = true`, hit the guard, and return. At most one write fires per 3s regardless of call frequency.
- Settings persistence during combat is already covered by:
  - `attackMobs` (calls `saveSettings()` every 5th cycle at line 10777)
  - `_debounceDungeonSave` (2s debounce, calls `saveSettings()` at line 10884, invoked via `applyDamageToBoss` at line 10867)
  - `stop()` immediate flush on shutdown (line 2102: `this.saveSettings(true)`)
- `this.deadShadows` (set at lines 10267 and 10603) is a runtime `Map()` initialized at line 1117 — it is NOT in `this.settings`, so `saveSettings()` doesn't persist it.
- `dungeon.boss.lastAttackTime` is on the dungeon object which is persisted by `_debounceDungeonSave` → `storageManager.saveDungeon()`, not by `saveSettings()`.

**Verified:** Read `saveSettings()` (lines 2601-2623), `_saveSettingsImmediate()` (lines 2625-2679), and `_debounceDungeonSave()` (lines 10873-10887). Removing these calls eliminates ~10 function calls/second during multi-dungeon combat.

**Step 1: Remove saveSettings from processBossAttacks**

At line 10268, delete:

```javascript
      this.saveSettings();
```

**Step 2: Remove saveSettings from processMobAttacks**

At line 10608, delete:

```javascript
      this.saveSettings();
```

**Step 3: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 4: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): remove redundant saveSettings from combat tick methods

processBossAttacks and processMobAttacks called saveSettings() every tick
(1s interval). saveSettings() uses a 3s debounce with a no-op guard
(if timer exists, return immediately). These calls are pure function-entry
overhead — at most one write fires per 3s regardless of call frequency.

Settings persistence during combat is already covered by:
- attackMobs (saveSettings every 5th cycle, line 10777)
- _debounceDungeonSave (2s debounce via applyDamageToBoss, line 10867)
- stop() immediate flush on shutdown (line 2102)"
```

---

## Task 4: Guard mob cleanup behind deadMobsThisTick check (Fix 3)

**Files:**
- Modify: `plugins/Dungeons.plugin.js:9344-9345`

**What:** In `processShadowAttacks`, `_cleanupDungeonActiveMobs` and `_pruneShadowMobContributionLedger` are called unconditionally every tick. Both scan the entire `activeMobs` array (potentially 500-3000 entries). When no mobs died this tick (`deadMobsThisTick.length === 0`), there's nothing to compact and nothing to prune — both scans are wasted work.

**Why it's safe:**
- `_cleanupDungeonActiveMobs` (line 5701) does swap-remove compaction on dead mobs (hp <= 0). If no mobs died, there are no dead mobs to compact — the function scans the whole array and does nothing.
- `_pruneShadowMobContributionLedger` (line 6132) builds a Set of live mob IDs, then deletes ledger entries for mobs no longer alive. If no mobs died, the ledger hasn't changed — the prune is a no-op scan.
- **IMPORTANT:** This guard ONLY applies to the call site in `processShadowAttacks` (lines 9344-9345). The other call sites are NOT guarded:
  - Line 10753 (`_cleanupDungeonActiveMobs` in attackMobs block) — different context, may have its own dead mobs from mob-on-mob or boss damage. Leave unchanged.
  - Line 10764 (`_pruneShadowMobContributionLedger` in attackMobs block) — same, leave unchanged.
  - Line 13100 (`_pruneShadowMobContributionLedger` in simulateCombat) — batch simulation cleanup. Leave unchanged.

**Verified:** `deadMobsThisTick` is populated at lines 9318-9333 (pushed inside `attackResults.killed.forEach`). The guard at line 9335 (`if (deadMobsThisTick.length > 0)`) already exists for logging and corpse pile — we extend it to cover cleanup too.

**Step 1: Wrap cleanup calls in deadMobsThisTick guard**

At lines 9344-9345, change:

```javascript
        this._cleanupDungeonActiveMobs(dungeon);
        this._pruneShadowMobContributionLedger(dungeon);
```

to:

```javascript
        // Only compact activeMobs and prune ledger when mobs actually died this tick.
        // Both functions scan the entire activeMobs array — skip when nothing changed.
        if (deadMobsThisTick.length > 0) {
          this._cleanupDungeonActiveMobs(dungeon);
          this._pruneShadowMobContributionLedger(dungeon);
        }
```

**Step 2: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): skip mob cleanup scans when no mobs died this tick

_cleanupDungeonActiveMobs and _pruneShadowMobContributionLedger scanned
the entire activeMobs array (up to 3000 entries) every shadow-attack tick.
When deadMobsThisTick is empty, both scans are no-ops. Guard skips ~6000
iterations per tick in the common case where shadows don't kill anything.
Only guards the processShadowAttacks call site — other call sites in
attackMobs and simulateCombat remain unconditional."
```

---

## Task 5: Clean up orphan per-channel Map entries in completeDungeon (Fix 4)

**Files:**
- Modify: `plugins/Dungeons.plugin.js` — `completeDungeon` method (lines ~11120-11145)

**What:** `completeDungeon` cleans up most per-channel state (activeDungeons, deadShadows, shadowAllocations, timer Maps, etc.) but misses ~10 Maps that accumulate entries keyed by `channelKey`. Over a long session with many dungeons completed, these orphan entries pile up. The most dangerous is `_dungeonSaveTimers` — a pending 2s timer can fire AFTER the dungeon is deleted, calling `storageManager.saveDungeon()` on a stale dungeon object captured in the timer closure.

**Why it's safe:** All of these Maps are per-channel runtime state with no cross-dungeon dependencies. Deleting the channelKey entry after the dungeon is gone is the correct lifecycle.

**Verified:** Enumerated every `new Map()` in `_initTimers`, `_initCaches`, `_initState`, and `_initUI`. Cross-referenced each against the cleanup block in `completeDungeon` (lines 11120-11145). The 10 Maps below have `.set(channelKey, ...)` call sites but zero `.delete(channelKey)` in the completion path.

**Step 1: Add cleanup calls to completeDungeon**

After line 11135 (after the `_lastMobAttackTime` cleanup block), add:

```javascript
    // Clean up orphan per-channel Map entries (multi-dungeon leak prevention)
    this._mobSpawnNextAt?.delete(channelKey);
    this._mobSpawnQueueNextAt?.delete(channelKey);
    this._spawnPipelineGuardAt?.delete(channelKey);
    this._mobContributionMissLogState?.delete(channelKey);
    this._lastRebalanceAt?.delete(channelKey);
    this._deployRebalanceInFlight?.delete(channelKey);
    this._allocationSummary?.delete(channelKey);
    this._mobCleanupCache?.delete(channelKey);
    delete this._lastHPBarUpdate?.[channelKey];
    delete this._mobCapWarningShown?.[channelKey];

    // Cancel pending dungeon save timer (prevents ghost saves on stale dungeon objects)
    if (this._dungeonSaveTimers?.has(channelKey)) {
      clearTimeout(this._dungeonSaveTimers.get(channelKey));
      this._dungeonSaveTimers.delete(channelKey);
    }
```

**Step 2: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): clean up orphan per-channel Map entries on dungeon completion

completeDungeon missed ~10 per-channel Maps that accumulate entries over
a session. Most critically, _dungeonSaveTimers could fire a ghost save
on a stale dungeon object after completion. Also clears orphan entries
from _mobSpawnNextAt, _spawnPipelineGuardAt, _lastRebalanceAt,
_mobCleanupCache, _lastHPBarUpdate, _mobCapWarningShown, and others."
```

---

## Task 6: Add per-tick allocation lock to prevent redundant preSplitShadowArmy calls (Fix 5)

**Files:**
- Modify: `plugins/Dungeons.plugin.js` — `_combatLoopTick` (line ~1607) and `processShadowAttacks` (lines ~8721, ~8762)

**What:** `_combatLoopTick` calls `preSplitShadowArmy()` once at line 1605 (correct). But `processShadowAttacks` has two additional call sites (lines 8727 and 8765) that can fire from inside `Promise.all` parallel dungeon processing. Since dungeons interleave at `await` points, multiple dungeons can call `preSplitShadowArmy` on the same tick — each performing an IDB read + sort + full reallocation.

The allocation cache guard at line 8068 usually prevents redundant work, but the rebalance path at line 8764 sets `_allocationDirty = true` first, bypassing the guard.

**Why it's safe:** `preSplitShadowArmy` is idempotent — calling it once or ten times produces the same result. The lock just prevents redundant work within a single tick.

**Verified:** Read `_combatLoopTick` (lines 1579-1649), `_processDungeonCombatTick` (lines 1656-1760), and `processShadowAttacks` (lines 8653-9358). Confirmed `Promise.all` at line 1627 creates the interleaving window.

**Step 1: Initialize lock in _combatLoopTick**

At line ~1607 (after `preSplitShadowArmy` call, before `Promise.all`), add:

```javascript
    // Per-tick lock: prevent parallel dungeons from calling preSplitShadowArmy redundantly
    this._tickAllocationLock = false;
```

**Step 2: Guard preSplitShadowArmy calls in processShadowAttacks**

At line ~8721, change:

```javascript
        if (cacheExpired || !hasAllocation) {
          if (deployRebalancePending) {
```

to:

```javascript
        if ((cacheExpired || !hasAllocation) && !this._tickAllocationLock) {
          if (deployRebalancePending) {
```

And wrap the `preSplitShadowArmy` call at line ~8727:

```javascript
            this._markAllocationDirty(cacheExpired ? 'combat-cache-expired' : 'combat-missing-allocation');
            this._tickAllocationLock = true;
            await this.preSplitShadowArmy();
```

At line ~8762, change:

```javascript
            if (needsRebalance) {
              this._lastRebalanceAt.set(channelKey, nowRebalance);
              this._markAllocationDirty('combat-rebalance');
              await this.preSplitShadowArmy();
```

to:

```javascript
            if (needsRebalance && !this._tickAllocationLock) {
              this._lastRebalanceAt.set(channelKey, nowRebalance);
              this._markAllocationDirty('combat-rebalance');
              this._tickAllocationLock = true;
              await this.preSplitShadowArmy();
```

**Step 3: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 4: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): add per-tick allocation lock to prevent redundant preSplitShadowArmy

With N dungeons processed via Promise.all, multiple processShadowAttacks
calls could interleave at await points and each call preSplitShadowArmy
(IDB read + sort + reallocation). The _tickAllocationLock ensures at most
one preSplitShadowArmy call per combat tick, even during parallel processing."
```

---

## Task 7: Stagger periodic work across dungeons to prevent tick spikes (Fix 6)

**Files:**
- Modify: `plugins/Dungeons.plugin.js` — `_processDungeonCombatTick` (lines ~1663, ~1676, ~1702)

**What:** `_combatTickCount` is a single global counter incremented once per tick. All dungeons use `this._combatTickCount % N === 0` for periodic work (stuck-deploy detection every 5 ticks, DOM integrity check every 5 ticks, combat trace logging every 10 ticks, alive-count recompute every 10 ticks, status log every 30 ticks). Since all dungeons check the same counter, they ALL do their periodic work on the same tick, creating "spike ticks" every 5s.

**Why it's safe:** Staggering changes WHEN each dungeon does periodic work, not WHETHER it does it. The offset is deterministic (based on dungeon index within the tick), so each dungeon still gets the same frequency of periodic checks.

**Verified:** Read `_combatLoopTick` (lines 1579-1649) and `_processDungeonCombatTick` (lines 1656-1760). The `_combatTickCount` counter at line 1581 is used at lines 1631, 1663, 1676, 1702, 8842.

**Step 1: Pass dungeon index to _processDungeonCombatTick**

At lines 1612-1623, change:

```javascript
    const dungeonPromises = [];
    for (const [channelKey, dungeon] of this.activeDungeons.entries()) {
      if (!dungeon || dungeon.completed || dungeon.failed) {
        this.shadowAttackIntervals.has(channelKey) && this.stopShadowAttacks(channelKey);
        this.bossAttackTimers.has(channelKey) && this.stopBossAttacks(channelKey);
        this.mobAttackTimers.has(channelKey) && this.stopMobAttacks(channelKey);
        continue;
      }

      dungeonPromises.push(this._processDungeonCombatTick(
        channelKey, dungeon, now, isWindowVisible, perDungeonShadowBudget, perDungeonMobBudget
      ));
    }
```

to:

```javascript
    const dungeonPromises = [];
    let dungeonIndex = 0;
    for (const [channelKey, dungeon] of this.activeDungeons.entries()) {
      if (!dungeon || dungeon.completed || dungeon.failed) {
        this.shadowAttackIntervals.has(channelKey) && this.stopShadowAttacks(channelKey);
        this.bossAttackTimers.has(channelKey) && this.stopBossAttacks(channelKey);
        this.mobAttackTimers.has(channelKey) && this.stopMobAttacks(channelKey);
        continue;
      }

      dungeonPromises.push(this._processDungeonCombatTick(
        channelKey, dungeon, now, isWindowVisible, perDungeonShadowBudget, perDungeonMobBudget, dungeonIndex
      ));
      dungeonIndex++;
    }
```

**Step 2: Add dungeonIndex parameter and stagger periodic checks**

In `_processDungeonCombatTick` signature (line ~1656), add `dungeonIndex = 0` parameter:

```javascript
  async _processDungeonCombatTick(channelKey, dungeon, now, isWindowVisible, shadowBudget, mobBudget, dungeonIndex = 0) {
```

Then change the periodic check conditions:

```javascript
// Line ~1663 — stuck-deploy detection (was: % 5 === 0)
if (!dungeon._deploying && (this._combatTickCount + dungeonIndex) % 5 === 0 && dungeon.boss?.hp > 0) {

// Line ~1676 — DOM integrity check (was: % 5 === 0)
if (isActive && (this._combatTickCount + dungeonIndex) % 5 === 0) {

// Line ~1702 — combat trace logging (was: % 10 === 0)
if ((this._combatTickCount + dungeonIndex) % 10 === 0) {
```

**Step 3: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 4: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): stagger periodic work across dungeons to prevent tick spikes

_combatTickCount is a global counter. All dungeons using modulo checks
(% 5, % 10) for periodic work did it on the SAME tick, creating spike
ticks every 5s with 10+ concurrent dungeons. Now offsets by dungeonIndex
so work is spread evenly across ticks."
```

---

## Task 8: Squash merge to main, sync, and verify

**Step 1: Squash merge**

```bash
git checkout main
git merge --squash perf/combat-hot-path-optimization
git commit -m "perf(dungeons): optimize combat hot path + multi-dungeon scaling

Fix 1: Replace requestAnimationFrame spin-loop in processHPBarUpdateQueue
with calculated setTimeout. Was burning ~15 wasted frames per queued update
at 60fps during combat. Now sleeps until exact throttle expiry.

Fix 2: Remove redundant saveSettings() from processBossAttacks and
processMobAttacks. saveSettings() uses a 3s no-op guard — these calls
were pure function-entry overhead (~10 calls/s during multi-dungeon combat).

Fix 3: Guard _cleanupDungeonActiveMobs and _pruneShadowMobContributionLedger
behind deadMobsThisTick.length > 0 in processShadowAttacks. Both scan
entire activeMobs array (up to 3000 entries) — skip when nothing died.

Fix 4: Clean up ~10 orphan per-channel Map entries in completeDungeon.
Prevents _dungeonSaveTimers ghost saves on stale dungeon objects and
memory leaks over long sessions.

Fix 5: Add per-tick allocation lock to prevent redundant preSplitShadowArmy
calls during Promise.all parallel dungeon processing.

Fix 6: Stagger periodic work (stuck-deploy, DOM check, trace log) across
dungeons by offsetting _combatTickCount with dungeonIndex. Eliminates
spike ticks every 5s at 10+ concurrent dungeons."
```

**Step 2: Delete feature branch**

```bash
git branch -D perf/combat-hot-path-optimization
```

**Step 3: Sync to BetterDiscord plugins folder**

```bash
cp plugins/Dungeons.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

**Step 4: Final syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

---

## Verification

After all tasks complete:

1. `node -c plugins/Dungeons.plugin.js` — must pass
2. `git log --oneline -3` — should show squash merge commit on main
3. `git diff HEAD~1 -- plugins/Dungeons.plugin.js` — should show ~55 lines changed:
   - `processHPBarUpdateQueue` rewritten: `requestAnimationFrame` → `setTimeout(earliestRetry)`
   - `queueHPBarUpdate` scheduling: `requestAnimationFrame` → `setTimeout(250)`
   - `_hpBarUpdateTimer` cleanup added to `stop()`
   - `saveSettings()` removed from `processBossAttacks` (line ~10268)
   - `saveSettings()` removed from `processMobAttacks` (line ~10608)
   - `_cleanupDungeonActiveMobs` + `_pruneShadowMobContributionLedger` wrapped in `deadMobsThisTick.length > 0` guard
   - ~15 lines of orphan Map cleanup added to `completeDungeon`
   - `_tickAllocationLock` guard added in `_combatLoopTick` and `processShadowAttacks`
   - `dungeonIndex` parameter added to `_processDungeonCombatTick` with staggered modulo checks
4. Manual test in Discord:
   - Start 2+ dungeons simultaneously
   - Verify HP bars update smoothly
   - Complete a dungeon, verify no errors in console
   - Verify the completed dungeon's state is fully cleaned (no ghost saves in console)
