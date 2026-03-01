# Dungeons Plugin — Full Audit Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 25 issues (4 critical, 7 high, 9 medium, 5 low) identified by the comprehensive Dungeons pipeline audit.

**Architecture:** Single-file plugin (`plugins/Dungeons.plugin.js`, ~14,800 LOC). All fixes are surgical edits — no new files, no structural refactors. Issues span combat pipeline races, memory leaks, logic flaws, and hot-path performance.

**Tech Stack:** BetterDiscord plugin (vanilla JS, no build step). No test framework — verification is `node -c` syntax check + `archlint scan`.

---

## Pre-Flight

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Create branch**
```bash
git checkout main && git pull
git checkout -b fix/dungeons-audit-2026-03-01
```

**Step 2: Checkpoint current state**
```bash
node -c plugins/Dungeons.plugin.js
```

---

## Batch 1 — CRITICAL Fixes (4 issues)

### Task 1: LOGIC-1 — Fix `userMana` race condition across concurrent dungeons

**Problem:** `Promise.all` runs dungeon ticks concurrently. `attemptAutoResurrection` (line ~10996) does `this.settings.userMana -= manaCost` — a non-atomic read-modify-write. Two concurrent dungeons can both read mana=500, both deduct 50, each writes 450 → one deduction lost.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Add per-tick mana budget pre-allocation in `_combatLoopTick`**

Before the `Promise.all` block (after line ~1609 where `_tickAllocationLock = false`), add:

```javascript
    // BUGFIX LOGIC-1: Pre-snapshot mana to prevent race conditions during Promise.all.
    // Each dungeon gets an equal slice of the available mana pool for resurrections.
    // This prevents concurrent dungeons from both reading the same mana balance and
    // double-spending (non-atomic read-modify-write on this.settings.userMana).
    this._tickManaPool = this.settings.userMana || 0;
    this._tickManaBudgetPerDungeon = Math.floor(this._tickManaPool / Math.max(1, activeDungeonCount));
    this._tickManaSpent = 0; // Total mana consumed this tick (accumulated atomically post-Promise.all)
```

**Step 2: Add mana reconciliation after `Promise.all`**

After the `await Promise.all(dungeonPromises);` line (~1633), add:

```javascript
    // BUGFIX LOGIC-1: Reconcile mana after parallel dungeon processing.
    // Each dungeon tracked its own spend via dungeon._tickManaUsed (set in attemptAutoResurrection).
    // Deduct the actual total from the real mana pool in one atomic operation.
    if (dungeonPromises.length > 1) {
      let totalManaUsed = 0;
      for (const [, dungeon] of this.activeDungeons.entries()) {
        if (dungeon._tickManaUsed > 0) {
          totalManaUsed += dungeon._tickManaUsed;
          dungeon._tickManaUsed = 0;
        }
      }
      if (totalManaUsed > 0) {
        this.settings.userMana = Math.max(0, this._tickManaPool - totalManaUsed);
      }
    }
```

**Step 3: Modify `attemptAutoResurrection` to use per-dungeon budget**

In the resurrection function (around line ~10993-10996), replace the direct mana deduction with budget-aware logic:

Find (around line ~10993):
```javascript
    // Store mana before consumption for verification
    const manaBefore = this.settings.userMana;

    // Consume mana from local settings
    this.settings.userMana -= manaCost;
```

Replace with:
```javascript
    // BUGFIX LOGIC-1: Use per-dungeon mana budget during parallel ticks to prevent race conditions.
    // When multiple dungeons run via Promise.all, each dungeon tracks its own spend via dungeon._tickManaUsed.
    // The actual this.settings.userMana deduction happens atomically after Promise.all completes.
    const manaBefore = this.settings.userMana;
    const budgetAvailable = this._tickManaBudgetPerDungeon !== undefined
      ? this._tickManaBudgetPerDungeon - (dungeon._tickManaUsed || 0)
      : this.settings.userMana;

    if (budgetAvailable < manaCost) {
      return false; // Exceeded this dungeon's mana budget for this tick
    }

    if (this._tickManaBudgetPerDungeon !== undefined) {
      // Parallel mode: track per-dungeon spend, defer actual deduction to post-Promise.all
      dungeon._tickManaUsed = (dungeon._tickManaUsed || 0) + manaCost;
    } else {
      // Single-dungeon mode: deduct directly (no race possible)
      this.settings.userMana -= manaCost;
    }
```

Also update the mana verification block immediately after (lines ~10999-11009) to handle both paths:

```javascript
    // Ensure mana doesn't go negative (safety check)
    if (this._tickManaBudgetPerDungeon === undefined && this.settings.userMana < 0) {
      this.errorLog(
        `CRITICAL: Mana went negative! Resetting to 0. Before: ${manaBefore}, Cost: ${manaCost}`
      );
      this.settings.userMana = 0;
    }
```

**Step 4: Also fix the batched resurrection path at line ~6305-6318**

The batched resurrection in `_applyAccumulatedShadowAndUserDamage` (lines ~6305-6318) has the same issue. It reads `let manaPool = this.settings.userMana || 0` and then does `manaPool -= cost` in a loop, finally writing back `this.settings.userMana = Math.max(0, manaPool)`.

Find (around line ~6305):
```javascript
      this.syncManaFromStats();
      let manaPool = this.settings.userMana || 0;
```

Replace with:
```javascript
      this.syncManaFromStats();
      // BUGFIX LOGIC-1: Use per-dungeon budget in parallel mode
      let manaPool = this._tickManaBudgetPerDungeon !== undefined
        ? this._tickManaBudgetPerDungeon - (dungeon._tickManaUsed || 0)
        : (this.settings.userMana || 0);
```

And find where `manaPool` is written back to `this.settings.userMana` after the resurrection loop (should be around line ~6330-6340). Replace the direct write-back with:

```javascript
      // BUGFIX LOGIC-1: Track spend per-dungeon in parallel mode
      const totalSpent = startingManaPool - manaPool;
      if (this._tickManaBudgetPerDungeon !== undefined) {
        dungeon._tickManaUsed = (dungeon._tickManaUsed || 0) + totalSpent;
      } else {
        this.settings.userMana = Math.max(0, manaPool);
      }
```

(Where `startingManaPool` should be captured at the start of the loop as `const startingManaPool = manaPool;`.)

**Step 5: Syntax check**
```bash
node -c plugins/Dungeons.plugin.js
```

**Step 6: Commit**
```bash
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): prevent userMana race condition in parallel dungeon ticks (LOGIC-1)"
```

---

### Task 2: INTEGRITY-1 — Verify `deadShadows` pruning is not overwritten

**Problem (claimed):** Audit flagged that `maybePruneDungeonShadowState` prunes `deadShadows` in-place, then `processBossAttacks` writes its local reference back, potentially overwriting pruned state.

**Verification needed:** `_getDungeonShadowCombatContext` (line 6246) calls `maybePruneDungeonShadowState` with the same Set reference returned by `this.deadShadows.get(channelKey)`. Since pruning mutates in-place (line 9624: `deadShadows.delete(shadowId)`), the returned reference IS the pruned Set. The write-back at line 10283 (`this.deadShadows.set(channelKey, deadShadows)`) writes the same object — this should be a no-op.

**Step 1: Read `processShadowAttacks` to check if it creates a NEW Set**

Check lines ~8663-9374. Search for `this.deadShadows.set(` or `new Set(` inside that function. If `processShadowAttacks` creates a fresh Set and stores it in `this.deadShadows`, then when `processBossAttacks` later calls `_getDungeonShadowCombatContext`, it would get the NEW Set, not the old one — and pruning + write-back would be correct.

**Step 2: If verified as false positive, add a defensive comment**

At line 10283, add:
```javascript
      // NOTE: deadShadows is the same Set reference from _getDungeonShadowCombatContext (mutated in-place).
      // Write-back is a no-op but kept for consistency with processMobAttacks.
      this.deadShadows.set(channelKey, deadShadows);
```

**Step 3: If verified as REAL issue, fix by removing redundant write-back**

Remove line 10283 (`this.deadShadows.set(channelKey, deadShadows);`) from `processBossAttacks`.
Also remove the equivalent line from `processMobAttacks` (around line ~10615).
The Set is mutated in-place throughout — write-backs are unnecessary and could mask future bugs.

**Step 4: Syntax check**
```bash
node -c plugins/Dungeons.plugin.js
```

**Step 5: Commit**
```bash
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): clarify deadShadows Set reference lifecycle (INTEGRITY-1)"
```

---

### Task 3: INTEGRITY-2 — Prevent ghost combatants from extracted shadows

**Problem:** `shadowAllocations` is built from `_allocationSortedShadowsCache` (60s TTL). A shadow extracted from ShadowArmy between cache refreshes stays in combat for up to 60s — consuming mana for resurrections, accumulating contributions, but receiving 0 XP because it no longer exists in IDB.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Add extraction event listener in `start()` or wherever ShadowArmy cross-plugin hooks are set up**

Search for where `this.shadowArmy` is acquired (likely in `start()` or an init method). After acquiring the ShadowArmy reference, register a listener:

```javascript
    // BUGFIX INTEGRITY-2: Immediately invalidate shadow cache when ShadowArmy extracts a shadow.
    // Prevents ghost combatants: extracted shadows staying in combat allocations for up to 60s.
    if (this.shadowArmy && !this._shadowExtractionListener) {
      this._shadowExtractionListener = (extractedShadowId) => {
        this.invalidateShadowsCache();
        // Also remove the extracted shadow from all active dungeon allocations immediately
        if (extractedShadowId) {
          for (const [channelKey, allocation] of this.shadowAllocations.entries()) {
            if (!Array.isArray(allocation)) continue;
            const idx = allocation.findIndex(s => this.getShadowIdValue(s) === extractedShadowId);
            if (idx !== -1) {
              allocation.splice(idx, 1);
              this.debugLog(`Removed extracted shadow ${extractedShadowId} from dungeon ${channelKey}`);
            }
          }
        }
      };
      // Hook into ShadowArmy's extraction event if it exposes one
      if (this.shadowArmy.on) {
        this.shadowArmy.on('shadowExtracted', this._shadowExtractionListener);
      }
    }
```

**Step 2: If ShadowArmy doesn't expose events, add a polling guard in `processShadowAttacks`**

As a fallback, at the start of shadow iteration (inside the shadow loop), add a lightweight check:

```javascript
        // BUGFIX INTEGRITY-2: Skip shadows that no longer exist in the allocation cache.
        // If _allocationSortedShadowsCache was invalidated, the shadow may have been extracted.
        if (this._allocationDirty && !this.allocationCache) {
          // Cache was invalidated — force re-allocation before continuing
          break;
        }
```

**Step 3: Clean up listener in `stop()`**

```javascript
    if (this._shadowExtractionListener && this.shadowArmy?.off) {
      this.shadowArmy.off('shadowExtracted', this._shadowExtractionListener);
      this._shadowExtractionListener = null;
    }
```

**Step 4: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): prevent ghost combatants from extracted shadows (INTEGRITY-2)"
```

---

### Task 4: LOGIC-5 / INTEGRITY-3 — Fix `cleanupDefeatedBoss` deleting wrong dungeon

**Problem:** `cleanupDefeatedBoss` (line ~11856) runs 5 minutes after boss defeat. Does `this.activeDungeons.delete(channelKey)` unconditionally. If a new dungeon started in the same channel, the NEW dungeon gets deleted. The user sees an HP bar but combat silently stops.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Store dungeon ID in `defeatedBosses` data**

Find where `defeatedBosses` entries are created (search for `this.defeatedBosses.set(`). The boss data stored should include the dungeon ID. If it doesn't already include `dungeonId`, add it:

```javascript
    this.defeatedBosses.set(channelKey, {
      ...bossData,
      dungeonId: dungeon.id, // BUGFIX LOGIC-5: Track which dungeon this boss belonged to
      timestamp: Date.now(),
    });
```

**Step 2: Add identity check in `cleanupDefeatedBoss`**

At line ~11856, replace:
```javascript
    this.activeDungeons.delete(channelKey);
```

With:
```javascript
    // BUGFIX LOGIC-5: Only delete if the active dungeon is the SAME one that was defeated.
    // A new dungeon may have started in this channel during the 5-minute ARISE window.
    const bossData = this.defeatedBosses.get(channelKey);
    const currentDungeon = this.activeDungeons.get(channelKey);
    if (currentDungeon && bossData?.dungeonId && currentDungeon.id !== bossData.dungeonId) {
      // Different dungeon — do NOT delete it
      this.debugLog(`cleanupDefeatedBoss: skipping delete — new dungeon ${currentDungeon.id} started in ${channelKey}`);
    } else {
      this.activeDungeons.delete(channelKey);
    }
```

**Step 3: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): prevent cleanupDefeatedBoss from deleting wrong dungeon (LOGIC-5)"
```

---

## Batch 2 — HIGH Fixes (7 issues)

### Task 5: LOGIC-4 — Fix `attackMobs` cooldown field name mismatch

**Problem:** `attackMobs` shadow path (line ~10696) reads `combatData.cooldown`, but `initializeShadowCombatData` (line ~9545) sets `attackInterval`, not `cooldown`. Since `cooldown` is `undefined`, `timeSinceLastAttack < undefined` → `false`, so ALL shadows attack EVERY tick.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Fix the field reference at line ~10696**

Replace:
```javascript
        if (timeSinceLastAttack < combatData.cooldown) {
```

With:
```javascript
        if (timeSinceLastAttack < (combatData.attackInterval || combatData.cooldown || 2000)) {
```

**Step 2: Fix the cooldown update at line ~10741**

Replace:
```javascript
        combatData.cooldown = Math.max(800, Math.min(5000, combatData.cooldown * cooldownVariance));
```

With:
```javascript
        combatData.attackInterval = Math.max(800, Math.min(5000, (combatData.attackInterval || 2000) * cooldownVariance));
```

**Step 3: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): fix attackMobs cooldown field name mismatch — shadows were attacking every tick (LOGIC-4)"
```

---

### Task 6: PERF-1 + PERF-2 — Fix `attackMobs` hot-path performance

**Problem 1 (PERF-1):** `batchApplyDamage` fallback at line ~10680 uses O(N) `.find()` per target when `targetIndex` is not provided. The `attackMobs` path doesn't pass a `targetIndex`.

**Problem 2 (PERF-2):** `_cleanupDungeonActiveMobs` (line ~10767) is called inside the per-shadow loop — O(N) array compaction per shadow kill. Should be called once after the loop.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Move `_cleanupDungeonActiveMobs` out of the per-shadow loop**

Move line ~10767 (`this._cleanupDungeonActiveMobs(dungeon);`) to AFTER the `for (const shadow of assignedShadows)` loop ends (around line ~10777), and gate it:

```javascript
      // PERF-2: Moved cleanup OUTSIDE the per-shadow loop. Was O(N) per kill × up to 500 shadows.
      // Now runs once after all shadow attacks, same as the main processShadowAttacks path.
      if (dungeon.mobs?.activeMobs?.some(m => m && m.hp <= 0)) {
        this._cleanupDungeonActiveMobs(dungeon);
      }
      this._pruneShadowMobContributionLedger(dungeon);
```

Delete the original line ~10767 (`this._cleanupDungeonActiveMobs(dungeon);`).
Also delete the original line ~10778 (`this._pruneShadowMobContributionLedger(dungeon);`) since it's now integrated above.

**Step 2: Move `extractionEvents` cleanup out of the per-shadow loop (PERF-3)**

Move lines ~10770-10776 (the `if (this.extractionEvents...)` block) to after the shadow loop as well:

```javascript
      // PERF-3: Moved cache cleanup OUTSIDE the per-shadow loop. Was allocating Array.from() per shadow iteration.
      if (this.extractionEvents && this.extractionEvents.size > 1000) {
        const entries = Array.from(this.extractionEvents.entries());
        this.extractionEvents.clear();
        entries.slice(-500).forEach(([k, v]) => this.extractionEvents.set(k, v));
      }
```

**Step 3: Build a mob index Map before the shadow loop for O(1) lookups**

Before the shadow loop (after `aliveMobs` is built at line ~10682), add:

```javascript
      // PERF-1: Build O(1) mob lookup index. Without this, batchApplyDamage falls back to
      // O(N) .find() per damage application — O(N×M) with 3,000 mobs.
      const mobIndex = new Map();
      for (const mob of aliveMobs) {
        const key = this.getEnemyKey(mob, 'mob');
        if (key) mobIndex.set(key, mob);
      }
```

Then pass `mobIndex` to any `batchApplyDamage` calls in this path (if applicable), or use it for direct lookups in the damage application section.

**Step 4: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): fix O(N²) attackMobs path — cleanup + mob lookup hoisted out of loop (PERF-1, PERF-2, PERF-3)"
```

---

### Task 7: LOGIC-3 — Fix stale timer IDs in `_timeouts` Set

**Problem:** `completeDungeon` (lines ~11165-11168) cancels `_dungeonSaveTimers` via `clearTimeout` but doesn't remove the timer ID from `this._timeouts`. The tracking Set accumulates stale cleared timer IDs.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Add `_timeouts.delete` to the cancellation block**

Replace lines ~11165-11168:
```javascript
    if (this._dungeonSaveTimers?.has(channelKey)) {
      clearTimeout(this._dungeonSaveTimers.get(channelKey));
      this._dungeonSaveTimers.delete(channelKey);
    }
```

With:
```javascript
    // BUGFIX LOGIC-3: Also remove from _timeouts tracking Set to prevent stale ID accumulation
    if (this._dungeonSaveTimers?.has(channelKey)) {
      const timerId = this._dungeonSaveTimers.get(channelKey);
      this._timeouts.delete(timerId);
      clearTimeout(timerId);
      this._dungeonSaveTimers.delete(channelKey);
    }
```

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): remove cancelled timer IDs from _timeouts tracking Set (LOGIC-3)"
```

---

### Task 8: LEAK-1 + LEAK-2 — Prune unbounded per-session collections

**Problem 1 (LEAK-1):** `_debugLogOnceKeys` Set grows unbounded. Never pruned during a running session.

**Problem 2 (LEAK-2):** `dungeon._lastResurrectionAttempt` object grows per shadow death, never pruned during active dungeon.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Add size cap to `debugLogOnce`**

At line ~1201, after `this._debugLogOnceKeys || (this._debugLogOnceKeys = new Set());`, add:

```javascript
    // LEAK-1: Prevent unbounded growth in multi-hour sessions
    if (this._debugLogOnceKeys.size > 5000) {
      this._debugLogOnceKeys.clear();
    }
```

**Step 2: Add periodic pruning of `_lastResurrectionAttempt`**

In `maybePruneDungeonShadowState` (around line ~9592, after the throttle check passes), add:

```javascript
    // LEAK-2: Prune stale resurrection attempt timestamps (only keep assigned shadows)
    if (dungeon._lastResurrectionAttempt) {
      for (const shadowId of Object.keys(dungeon._lastResurrectionAttempt)) {
        if (!assignedIds.has(shadowId)) {
          delete dungeon._lastResurrectionAttempt[shadowId];
        }
      }
    }
```

(Place this after `assignedIds` is built at line ~9598 but within the pruning block.)

**Step 3: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): add size caps to _debugLogOnceKeys and _lastResurrectionAttempt (LEAK-1, LEAK-2)"
```

---

### Task 9: INTEGRITY-8 — Prevent double-counted mob kills in `attackMobs`

**Problem:** In `attackMobs`, `aliveMobs` is computed once before the shadow loop. A shadow kills a mob (hp=0), but subsequent shadows pick from the original `aliveMobs` array and re-select the dead mob. `if (targetMob.hp <= 0)` triggers again → `_onMobKilled` called twice.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Skip already-dead mobs in the target selection**

At line ~10702, the code already has:
```javascript
        if (!targetMob || targetMob.hp <= 0) continue;
```

This should catch mobs that died earlier in the loop. However, the issue is that `targetMob.hp` was set to 0 at line ~10728 by a previous shadow, but the `continue` at 10702 will skip it. Let me verify — actually, line 10702 IS the fix. The mob's `hp` field is mutated in-place at line 10728, so subsequent shadows should see `hp <= 0` and skip.

The real double-count issue is: `_onMobKilled` is called (line 10745) every time a shadow finds `targetMob.hp <= 0` after its attack. But if the mob was ALREADY at 0 HP before this shadow attacked, the shadow deals 0 damage (`Math.max(0, 0 - damage) = 0`), and the `if (targetMob.hp <= 0)` check at line 10744 triggers again.

Fix: Add a check that the mob was ALIVE before this shadow's attack:

Replace line ~10744:
```javascript
        if (targetMob.hp <= 0) {
```

With:
```javascript
        // BUGFIX INTEGRITY-8: Only count kill if THIS shadow's attack was the killing blow.
        // Without this, multiple shadows attacking the same 0-HP mob each call _onMobKilled.
        if (targetMob.hp <= 0 && targetMobHpBefore > 0) {
```

(`targetMobHpBefore` is already captured at line ~10727.)

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): prevent double-counted mob kills in attackMobs shadow path (INTEGRITY-8)"
```

---

## Batch 3 — MEDIUM Fixes (9 issues)

### Task 10: LOGIC-7 — Fix simulation shadow interval mismatch

**Problem:** `simulateDungeonCombat` (line ~13425) uses `shadowInterval = 3000` (3s) but the live combat loop drives shadows at 1s intervals. Background simulation under-estimates shadow damage by 3×.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Fix the interval at line ~13425**

Replace:
```javascript
    const shadowInterval = 3000; // 3 seconds
```

With:
```javascript
    const shadowInterval = 1000; // 1 second — matches live _combatLoopTick interval (line 1243)
```

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): fix simulation shadow interval from 3s to 1s to match live combat (LOGIC-7)"
```

---

### Task 11: LOGIC-8 — Fix `calculateAttacksInTimeSpan` always returning ≥1

**Problem:** Line ~9663: `return Math.max(1, Math.floor(remainingTime / effectiveCooldown))` — the `Math.max(1, ...)` means a shadow that just attacked will always get at least one attack per cycle, making cooldowns unenforceable.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Remove the `Math.max(1, ...)` guard**

Replace line ~9663:
```javascript
    return Math.max(1, Math.floor(remainingTime / effectiveCooldown)); // At least 1 attack per cycle
```

With:
```javascript
    // BUGFIX LOGIC-8: Removed Math.max(1,...) — was making cooldowns unenforceable.
    // A shadow that just attacked should get 0 attacks if remainingTime < cooldown.
    return Math.floor(remainingTime / effectiveCooldown);
```

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): enforce attack cooldowns in calculateAttacksInTimeSpan (LOGIC-8)"
```

---

### Task 12: LOGIC-9 — Recover stranded dungeons with `_completing = true`

**Problem:** If `completeDungeon` throws mid-Phase A after setting `_completing = true` (line ~11053), the dungeon is permanently stranded — never combat-processed, never cleaned up, never timed out. No recovery path.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Wrap Phase A in try-catch and unset `_completing` on failure**

Replace lines ~11052-11053:
```javascript
    if (dungeon._completing) return; // Prevent concurrent completion
    dungeon._completing = true;
```

With:
```javascript
    if (dungeon._completing) return; // Prevent concurrent completion
    dungeon._completing = true;
    // BUGFIX LOGIC-9: Phase A wrapped in try-catch below. If it throws, _completing is unset
    // to prevent permanently stranding the dungeon.
```

Wrap all of Phase A (from the line after `dungeon._completing = true` down to the `_completeDungeonBackground` call at line ~11183) in a try-catch:

```javascript
    try {
      // ... existing Phase A code ...
    } catch (phaseAError) {
      // BUGFIX LOGIC-9: Unset _completing so the dungeon isn't permanently stranded
      dungeon._completing = false;
      this.errorLog('CRITICAL', 'Phase A of completeDungeon failed — dungeon may be in inconsistent state', {
        channelKey, reason, error: phaseAError
      });
      return;
    }
```

**Step 2: Add recovery in `cleanupExpiredDungeons`**

In `cleanupExpiredDungeons` (around line ~13764), add a check for stranded `_completing` dungeons:

```javascript
      // BUGFIX LOGIC-9: Recover dungeons stranded with _completing=true for >30s
      if (dungeon._completing) {
        const strandedAge = now - (dungeon._completingStartedAt || now);
        if (strandedAge > 30000) {
          dungeon._completing = false; // Reset flag
          expiredChannels.push(channelKey); // Force cleanup via timeout path
        }
        return; // Skip normal idle processing while _completing
      }
```

Also add timestamp tracking at line ~11053:
```javascript
    dungeon._completing = true;
    dungeon._completingStartedAt = Date.now();
```

**Step 3: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): recover stranded _completing dungeons via timeout and try-catch (LOGIC-9)"
```

---

### Task 13: PERF-4 — Cache `buildShadowStats` in overflow redistribution

**Problem:** `processMobAttacks` overflow redistribution (lines ~10535-10546) calls `buildShadowStats(target)` per-hit. Shadow stats don't change within a tick.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Add a stats cache before the redistribution loop**

Before the redistribution loop (around line ~10521), add:

```javascript
          // PERF-4: Cache shadow stats for redistribution — stats don't change within a tick
          const _redistributionStatsCache = new Map();
```

Then replace line ~10535:
```javascript
                const shadowStats = this.buildShadowStats(target);
```

With:
```javascript
                let shadowStats = _redistributionStatsCache.get(target.id);
                if (!shadowStats) {
                  shadowStats = this.buildShadowStats(target);
                  _redistributionStatsCache.set(target.id, shadowStats);
                }
```

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): cache buildShadowStats in mob overflow redistribution (PERF-4)"
```

---

### Task 14: PERF-5 — Fix `isWindowVisible` cache bypass

**Problem:** `isWindowVisible()` (line ~12930) unconditionally overwrites `this._isWindowVisible = !document.hidden` on every call, ignoring the event-driven cache. Also called redundantly in `processBossAttacks` (line ~10089) and `processMobAttacks` (line ~10293) despite already receiving it as a parameter.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Fix `isWindowVisible()` to use its cache**

Replace lines ~12928-12932:
```javascript
  isWindowVisible() {
    // Always check current state in case event handler missed something
    this._isWindowVisible = !document.hidden;
    return this._isWindowVisible;
  }
```

With:
```javascript
  isWindowVisible() {
    // PERF-5: Use event-driven cache. Fallback to document.hidden only if cache is unset.
    if (this._isWindowVisible === undefined) {
      this._isWindowVisible = !document.hidden;
    }
    return this._isWindowVisible;
  }
```

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): use event-driven visibility cache instead of reading document.hidden every call (PERF-5)"
```

---

### Task 15: LEAK-4 + LEAK-5 — Clean up stale DOM refs and missing Map cleanups

**Problem 1 (LEAK-4):** `hiddenComments` Map retains stale DOM element references after React re-renders.
**Problem 2 (LEAK-5):** `_ariseButtonRefs` not cleaned in `completeDungeon` for non-ARISE completions.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Add `_ariseButtonRefs` cleanup to `completeDungeon` Phase A**

After line ~11161 (`delete this._mobCapWarningShown?.[channelKey];`), add:

```javascript
    // LEAK-5: Clean up ARISE button ref for non-ARISE completions (timeout, complete)
    this._ariseButtonRefs?.delete(channelKey);
    // LEAK-6: Clean up boss bar layout throttle entry
    this._bossBarLayoutThrottle?.delete(channelKey);
```

**Step 2: Add stale DOM ref cleanup in `showChannelHeaderComments`**

At line ~12627, after the `if (element && element.parentNode)` check, add an else to clean up stale entries:

```javascript
    hidden.forEach(({ element, originalDisplay, originalVisibility }) => {
      if (element && element.parentNode) {
        element.style.display = originalDisplay || '';
        if (originalVisibility) {
          element.style.visibility = originalVisibility;
        }
      }
      // LEAK-4: If element is detached, it will be cleaned up when the Map entry is deleted below
    });
    this.hiddenComments.delete(channelKey); // Always clean up after restoring
```

**Step 3: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): clean up _ariseButtonRefs, _bossBarLayoutThrottle, and stale hiddenComments (LEAK-4, LEAK-5, LEAK-6)"
```

---

### Task 16: INTEGRITY-7 — Prevent `_arisedBossIds` collision

**Problem:** `_arisedBossIds` accumulates permanently across the session. If dungeon IDs aren't truly unique (e.g., derived from channelKey rather than UUID), a new boss in the same channel could be blocked from ARISE.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Clean up `_arisedBossIds` entry when `cleanupDefeatedBoss` runs**

In `cleanupDefeatedBoss`, after the `this.defeatedBosses.delete(channelKey)` line (~11858), add:

```javascript
    // INTEGRITY-7: Remove ARISE block for this channel's boss to prevent collisions with future dungeon runs.
    // Keep bossId entries that belong to OTHER channels (multi-dungeon support).
    const bossData = this.defeatedBosses.get(channelKey);
    if (bossData?.bossId && this._arisedBossIds) {
      this._arisedBossIds.delete(bossData.bossId);
    }
```

(Note: Must capture bossId BEFORE `this.defeatedBosses.delete(channelKey)`. Reorder so the bossId capture comes first.)

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): prune _arisedBossIds on boss cleanup to prevent ARISE collision (INTEGRITY-7)"
```

---

## Batch 4 — LOW Fixes (5 issues)

### Task 17: PERF-6 — Fix orphaned `requestAnimationFrame` in `scheduleBossBarLayout`

**Problem:** `_bossBarLayoutFrame` (line ~12753) is overwritten per call. Multiple channels triggering layout before the frame fires orphan previous rAFs with no cancellation. Also no cleanup in `stop()`.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Already handled — `cancelAnimationFrame` exists at line ~12754**

Looking at line 12753-12754: `cancelAnimationFrame(this._bossBarLayoutFrame)` is already called before setting a new one. This handles the single-ID overwrite correctly. The frame is cancelled before being replaced.

Add cleanup in `stop()` (around the HP bar cleanup section):

```javascript
    if (this._bossBarLayoutFrame) {
      cancelAnimationFrame(this._bossBarLayoutFrame);
      this._bossBarLayoutFrame = null;
    }
```

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): cancel orphaned rAF in stop() for scheduleBossBarLayout (PERF-6)"
```

---

### Task 18: PERF-7 — Improve simulation boss damage sampling

**Problem:** `simulateBossAttacks` (line ~13177) uses `aliveShadows[0]` — always the highest-rank shadow (sorted by combat score desc). Boss damage to this shadow is the minimum possible. Background simulation systematically under-estimates damage.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Sample from the middle of the array instead of index 0**

Replace line ~13177:
```javascript
      const sampleShadow = aliveShadows[0];
```

With:
```javascript
      // PERF-7: Sample from array midpoint for more representative damage estimate.
      // Index 0 is always highest-rank (best defense) — biases damage low.
      const sampleShadow = aliveShadows[Math.floor(aliveShadows.length / 2)];
```

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): sample median shadow for boss simulation instead of top-rank (PERF-7)"
```

---

### Task 19: PERF-8 — Replace `document.body.contains` with `isConnected`

**Problem:** `findChannelHeader` (line ~12391) and `findChannelContainer` (line ~12427) use `document.body.contains(cached.value)` which forces DOM traversal. `element.isConnected` is O(1).

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Replace both occurrences**

Replace line ~12391:
```javascript
      if (cached.value && document.body.contains(cached.value)) {
```
With:
```javascript
      if (cached.value?.isConnected) {
```

Replace line ~12427:
```javascript
      if (cached.value && document.body.contains(cached.value)) {
```
With:
```javascript
      if (cached.value?.isConnected) {
```

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): replace document.body.contains with isConnected for O(1) DOM checks (PERF-8)"
```

---

### Task 20: INTEGRITY-9 — Remove dual-write to `dungeon.completed`

**Problem:** `applyDamageToBoss` (line ~10863) sets `dungeon.completed = true` before calling `completeDungeon` (line ~10869), which re-sets it at line ~11062. Fragile under future changes.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Remove the pre-set in `applyDamageToBoss`**

Delete or comment out line ~10863:
```javascript
      dungeon.completed = true;
```

The canonical write happens in `completeDungeon` at line ~11062 (`dungeon.completed = reason !== 'timeout'`).

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): remove premature dungeon.completed write in applyDamageToBoss (INTEGRITY-9)"
```

---

### Task 21: LEAK-8 — Fix `_hpBarRestoreInterval` cleanup race

**Problem:** If `stop()` clears `_intervals` entries before `stopHPBarRestoration()` is called, the interval is cleared by `stop()` but `_hpBarRestoreInterval` isn't nulled. Subsequent calls to `startHPBarRestoration()` return early permanently.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Null `_hpBarRestoreInterval` in `stop()` cleanup**

In the `stop()` method, after clearing `_intervals` (search for `this._intervals.forEach` or `clearInterval`), add:

```javascript
    this._hpBarRestoreInterval = null; // LEAK-8: Prevent stale guard blocking restart
```

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): null _hpBarRestoreInterval in stop() to prevent restart blocking (LEAK-8)"
```

---

## Post-Flight

### Task 22: Final verification + sync

**Step 1: Full syntax check**
```bash
node -c plugins/Dungeons.plugin.js
```

**Step 2: Sync to BetterDiscord plugins folder**
```bash
cp plugins/Dungeons.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

**Step 3: Run archlint**
```bash
archlint scan 2>&1 | head -50
```

---

## Summary

| Batch | Issues | Commits | Risk |
|-------|--------|---------|------|
| 1 | LOGIC-1, INTEGRITY-1, INTEGRITY-2, LOGIC-5 | 4 | CRITICAL — races, ghost combatants, wrong deletion |
| 2 | LOGIC-4, PERF-1/2/3, LOGIC-3, LEAK-1/2, INTEGRITY-8 | 5 | HIGH — broken cooldowns, O(N²), leaks |
| 3 | LOGIC-7/8/9, PERF-4/5, LEAK-4/5/6, INTEGRITY-7 | 7 | MEDIUM — simulation bugs, cache bypass, stale refs |
| 4 | PERF-6/7/8, INTEGRITY-9, LEAK-8 | 5 | LOW — cleanup, sampling bias, dual-write |
| **Total** | **25 issues** | **21 commits** | |
