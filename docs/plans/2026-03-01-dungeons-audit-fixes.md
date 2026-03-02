# Dungeons Plugin — Full Audit Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 23 verified issues (3 critical, 7 high, 8 medium, 5 low) identified by the Dungeons pipeline audit. (2 findings from the original 25 were verified as false positives and removed: LOGIC-7 simulation shadow interval is correct at 3s, INTEGRITY-9 `completed` pre-set is intentional.)

**Architecture:** Single-file plugin (`plugins/Dungeons.plugin.js`, ~14,900 LOC). All fixes are surgical edits — no new files, no structural refactors. Issues span combat pipeline races, memory leaks, logic flaws, and hot-path performance.

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

### Task 1: LOGIC-1 — Fix `userMana` race condition across concurrent dungeons [CRITICAL]

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

**Step 4: Skip `pushManaToStats` during parallel mode**

At line ~11014, `attemptAutoResurrection` calls `this.pushManaToStats(false)` which syncs `this.settings.userMana` to SoloLevelingStats. During parallel mode, `userMana` hasn't been updated yet (spend is tracked per-dungeon), so this would push a stale value.

Replace line ~11014:
```javascript
    this.pushManaToStats(false);
```

With:
```javascript
    // BUGFIX LOGIC-1: Skip mana sync during parallel mode — userMana is reconciled post-Promise.all
    if (this._tickManaBudgetPerDungeon === undefined) {
      this.pushManaToStats(false);
    }
```

Then add a `pushManaToStats(false)` call after the mana reconciliation block in `_combatLoopTick` (after the `totalManaUsed` deduction):

```javascript
    // Sync reconciled mana to SoloLevelingStats (deferred from parallel mode)
    if (totalManaUsed > 0) {
      this.pushManaToStats(false);
    }
```

**Step 5: Also fix the batched resurrection path if it exists**

> **Note:** The original audit claimed `_applyAccumulatedShadowAndUserDamage` (line ~6305) has its own `manaPool` loop. Verify this by searching for `manaPool` or `userMana -=` inside the function. If it has a separate mana deduction loop, apply the same budget pattern. If `attemptAutoResurrection` (line 8837) is the only mana deduction call site (as grep suggests), this step can be skipped.

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

### Task 2: INTEGRITY-1 — Clarify `deadShadows` Set reference lifecycle (verified false positive)

**Problem (claimed):** Audit flagged that `maybePruneDungeonShadowState` prunes `deadShadows` in-place, then `processBossAttacks` writes its local reference back, potentially overwriting pruned state.

**Verification result: FALSE POSITIVE.** `_getDungeonShadowCombatContext` (line 6249) returns the SAME Set reference via `this.deadShadows.get(channelKey) || new Set()`. Pruning at line 9624 (`.delete(shadowId)`) mutates in-place. The write-back at line 10283 stores the same object back → no-op. The `|| new Set()` fallback path IS correctly handled by the write-back (initializes the Map entry for channels that had no dead shadows yet).

**Step 1: Add defensive comments (do NOT remove the write-backs)**

At line 10283 (`processBossAttacks`), replace:
```javascript
      this.deadShadows.set(channelKey, deadShadows);
```
With:
```javascript
      // deadShadows is the same Set reference from _getDungeonShadowCombatContext (mutated in-place).
      // Write-back is a no-op for existing entries but correctly initializes the Map entry
      // when deadShadows was created via the `|| new Set()` fallback (first combat tick).
      this.deadShadows.set(channelKey, deadShadows);
```

Add the same comment at line ~10618 (`processMobAttacks`).

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "docs(dungeons): clarify deadShadows Set reference lifecycle — verified false positive (INTEGRITY-1)"
```

---

### Task 3: INTEGRITY-2 — Prevent ghost combatants from extracted shadows [CRITICAL]

**Problem:** `shadowAllocations` is built from `_allocationSortedShadowsCache` (60s TTL). A shadow extracted from ShadowArmy between cache refreshes stays in combat for up to 60s — consuming mana for resurrections, accumulating contributions, but receiving 0 XP because it no longer exists in IDB.

**File:** `plugins/Dungeons.plugin.js`

> **IMPORTANT:** ShadowArmy plugins do NOT have `.on()` / `.off()` EventEmitter methods — they are plain BetterDiscord plugin classes. Do NOT use EventEmitter patterns.

**Step 1: Hook into existing extraction listener**

Search for `_shadowExtractedListener` in the file — Dungeons already registers a cross-plugin extraction listener in `loadPluginReferences()`. Extend that listener to also invalidate allocation state:

```javascript
    // BUGFIX INTEGRITY-2: When a shadow is extracted, immediately invalidate allocation caches
    // to prevent the extracted shadow from staying in combat allocations for up to 60s.
    this._markAllocationDirty('shadow-extracted');
    this._allocationShadowSetDirty = true;
    if (typeof this.invalidateShadowsCache === 'function') {
      this.invalidateShadowsCache();
    }
```

If `_shadowExtractedListener` doesn't exist, create one by hooking into the ShadowArmy plugin via `BdApi.Patcher` or by checking for extraction events via the existing plugin reference pattern:

```javascript
    // In loadPluginReferences() after acquiring shadowArmy reference:
    // Poll-based fallback: reduce allocation cache TTL so ghost combatants are purged faster
    this.allocationCacheTTL = 15000; // Reduced from 60s to 15s to limit ghost combatant window
```

**Step 2: Also remove extracted shadow from active allocations immediately**

Add a helper that can be called from the extraction listener:

```javascript
    _removeExtractedShadowFromAllocations(extractedShadowId) {
      if (!extractedShadowId) return;
      for (const [channelKey, allocation] of this.shadowAllocations.entries()) {
        if (!Array.isArray(allocation)) continue;
        const idx = allocation.findIndex(s => this.getShadowIdValue(s) === extractedShadowId);
        if (idx !== -1) {
          allocation.splice(idx, 1);
          this.debugLog(`Removed extracted shadow ${extractedShadowId} from dungeon ${channelKey}`);
        }
      }
    }
```

**Step 3: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): prevent ghost combatants from extracted shadows (INTEGRITY-2)"
```

---

### Task 4: LOGIC-5 / INTEGRITY-3 — Fix `cleanupDefeatedBoss` deleting wrong dungeon [HIGH]

**Problem:** `cleanupDefeatedBoss` (line ~11856) does `this.activeDungeons.delete(channelKey)` unconditionally. If a new dungeon started in the same channel, the NEW dungeon gets deleted. The primary timer at line 11616 is only 3 seconds (not 5 minutes as originally reported), making the race window very narrow. However, `cleanupExpiredDungeons` (line 13801) also calls `cleanupDefeatedBoss` on a periodic sweep — this path can run much later, where the collision risk is real.

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

### Task 5: LOGIC-4 — Fix `attackMobs` cooldown field name mismatch [CRITICAL — upgraded from HIGH]

**Problem:** `attackMobs` shadow path (line ~10696) reads `combatData.cooldown`, but `initializeShadowCombatData` (line 9545) returns an object with `attackInterval` (line 9547) — there is NO `cooldown` field. Since `combatData.cooldown` is `undefined`, `timeSinceLastAttack < undefined` evaluates to `false` (NaN comparison), so ALL shadows attack EVERY tick through this path.

**Impact:** Shadows deal 3-5× intended damage through the `attackMobs` path, breaking combat balance. This is the most impactful bug in the entire audit.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Fix the field reference at line ~10696**

Replace:
```javascript
        if (timeSinceLastAttack < combatData.cooldown) {
```

With:
```javascript
        // BUGFIX LOGIC-4: Was reading nonexistent `cooldown` field (always undefined).
        // `initializeShadowCombatData` sets `attackInterval`, not `cooldown`.
        if (timeSinceLastAttack < (combatData.attackInterval || 2000)) {
```

> **Note:** No `|| combatData.cooldown` fallback — there is no valid `cooldown` field on the combat data object. Using `attackInterval` everywhere is cleaner.

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

**Problem:** In `attackMobs`, `aliveMobs` is computed once before the shadow loop. When a shadow kills a mob (hp→0 at line 10728), subsequent shadows can still randomly select the same mob from `aliveMobs`. Line 10702 (`if (!targetMob || targetMob.hp <= 0) continue;`) skips these dead mobs — but there's a race: if two shadows attack the same mob in the same tick, and both read `hp > 0` before either writes, both will apply damage. The second shadow's kill triggers `_onMobKilled` again.

The fix is simple: check that `targetMobHpBefore > 0` (already captured at line 10727) before counting the kill.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Add killing-blow check**

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

> **Note:** `targetMobHpBefore` is already captured at line 10727: `const targetMobHpBefore = targetMob.hp;`

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "fix(dungeons): prevent double-counted mob kills in attackMobs shadow path (INTEGRITY-8)"
```

---

## Batch 3 — MEDIUM Fixes (8 issues)

### ~~Task 10: LOGIC-7~~ — REMOVED (False Positive)

> **Verified against source code:** The 3s shadow interval in `simulateDungeonCombat` (line 13425) is **correct**. While `_combatLoopTick` fires every 1s, `processShadowAttacks` only fires when `elapsed >= intervalTime` (line 1709), and `_shadowActiveIntervalMs` defaults to **3000ms** (line 1695: `const activeInterval = this._shadowActiveIntervalMs.get(channelKey) || 3000`). Shadows attack every 3s in live combat. The simulation matches.
>
> **Do NOT change this value.** Changing it to 1s would make the simulation OVER-estimate shadow damage by 3×.

---

### Task 11: LOGIC-8 — Fix `calculateAttacksInTimeSpan` always returning ≥1

**Problem:** Line 9663: `return Math.max(1, Math.floor(remainingTime / effectiveCooldown))` — the `Math.max(1, ...)` forces at least 1 attack even when `remainingTime < effectiveCooldown`, making cooldowns unenforceable for the recurring case.

> **Note:** The first-attack case is ALREADY handled by lines 9651-9654: `if (cappedTimeSinceLastAttack <= 0) return 1;`. So removing `Math.max(1,...)` will NOT break initial attacks.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Remove the `Math.max(1, ...)` guard**

Replace line ~9663:
```javascript
    return Math.max(1, Math.floor(remainingTime / effectiveCooldown)); // At least 1 attack per cycle
```

With:
```javascript
    // BUGFIX LOGIC-8: Removed Math.max(1,...) — forces ≥1 attack even when remainingTime < cooldown.
    // First-attack case is already handled above (lines 9651-9654: return 1 when timeSinceLastAttack ≤ 0).
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

### Task 14: PERF-5 — Remove redundant `isWindowVisible()` calls in combat methods

**Problem:** `processBossAttacks` (line 10089) and `processMobAttacks` (line 10293) call `this.isWindowVisible()` despite already receiving `isWindowVisible` as a parameter from `_processDungeonCombatTick`. These are redundant function calls in the hot loop.

> **Note:** Do NOT modify `isWindowVisible()` itself. `document.hidden` is a simple boolean property read (essentially free). The `visibilitychange` event handler can miss edge cases (iframe focus, tab switching without visibility change). The current "always check" approach is a correct safety net.

**File:** `plugins/Dungeons.plugin.js`

**Step 1: Remove redundant `isWindowVisible()` calls in `processBossAttacks` and `processMobAttacks`**

Both methods already have `isWindowVisible` as a parameter (with a `null` default + self-check). The self-check line `if (isWindowVisible === null) isWindowVisible = this.isWindowVisible();` at lines 10089 and 10293 is correct — it handles standalone calls. The issue is any OTHER `this.isWindowVisible()` calls within these methods that duplicate the parameter.

Search for any redundant calls beyond the parameter check. If the only call is the parameter check, this task is complete — the parameter pattern is already the optimization.

**Step 2: Syntax check + commit**
```bash
node -c plugins/Dungeons.plugin.js
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): remove redundant isWindowVisible() calls in combat methods (PERF-5)"
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

### ~~Task 20: INTEGRITY-9~~ — REMOVED (Intentional Design)

> **Verified against source code:** The `dungeon.completed = true` at line 10863 is **intentional**. The comment at lines 10860-10862 explains:
> ```
> // Remove HP bar and mark completed before completeDungeon.
> // completeDungeon is synchronous (Phase A), but marking completed early
> // ensures the restore interval sees it immediately.
> ```
> The `_hpBarRestoreInterval` runs asynchronously and checks `dungeon.completed` to decide whether to restore the HP bar. Without the pre-set, the restore interval could re-inject the HP bar between `removeBossHPBar` (line 10864) and `completeDungeon` (line 10869). The dual-write is a **timing defense against a real race**, not a bug.
>
> **Do NOT remove this line.**

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

### Task 22: Squash merge to main

**Step 1: Squash merge**
```bash
git checkout main
git merge --squash fix/dungeons-audit-2026-03-01
git commit -m "fix(dungeons): comprehensive audit fixes — races, cooldowns, leaks, cleanup

CRITICAL:
- LOGIC-1: userMana race condition in parallel dungeon ticks (budget + reconciliation)
- LOGIC-4: attackMobs cooldown field name mismatch (shadows attacked every tick)
- INTEGRITY-2: ghost combatants from extracted shadows (allocation cache invalidation)

HIGH:
- LOGIC-5: cleanupDefeatedBoss could delete wrong dungeon (ID check added)
- PERF-1/2/3: O(N²) attackMobs path — cleanup + mob lookup hoisted out of loop
- LOGIC-3: cancelled _dungeonSaveTimers left stale IDs in _timeouts
- LEAK-1/2: unbounded _debugLogOnceKeys and _lastResurrectionAttempt
- INTEGRITY-8: double-counted mob kills (killing-blow check)

MEDIUM:
- LOGIC-8: calculateAttacksInTimeSpan Math.max(1,...) broke cooldowns
- LOGIC-9: _completing=true stranded dungeons on Phase A exception
- PERF-4: buildShadowStats per-hit in overflow redistribution
- PERF-5: redundant isWindowVisible() calls in combat methods
- LEAK-4/5: stale hiddenComments refs, _ariseButtonRefs not cleaned
- INTEGRITY-7: _arisedBossIds pruning on boss cleanup

LOW: rAF cleanup, simulation sampling, isConnected, _hpBarRestoreInterval

2 findings removed as false positives:
- LOGIC-7: simulation shadow interval IS 3s (matches live combat)
- INTEGRITY-9: dungeon.completed pre-set is intentional timing defense"
```

**Step 2: Delete feature branch**
```bash
git branch -D fix/dungeons-audit-2026-03-01
```

### Task 23: Final verification + sync

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

**Step 4: Manual test**
- Start 2+ dungeons simultaneously
- Verify shadows respect cooldowns (no burst-fire every tick)
- Complete a dungeon, verify no console errors
- Let an ARISE window expire, verify no ghost dungeon deletion

---

## Summary

| Batch | Issues | Tasks | Risk |
|-------|--------|-------|------|
| 1 | LOGIC-1, INTEGRITY-1 (FP), INTEGRITY-2, LOGIC-5 | 4 | CRITICAL — mana race, ghost combatants, wrong deletion |
| 2 | LOGIC-4 (↑CRIT), PERF-1/2/3, LOGIC-3, LEAK-1/2, INTEGRITY-8 | 5 | CRITICAL+HIGH — broken cooldowns, O(N²), leaks |
| 3 | ~~LOGIC-7 (FP)~~, LOGIC-8, LOGIC-9, PERF-4/5, LEAK-4/5/6, INTEGRITY-7 | 6 | MEDIUM — cooldown math, cache, stale refs |
| 4 | PERF-6/7/8, ~~INTEGRITY-9 (FP)~~, LEAK-8 | 3 | LOW — cleanup, sampling |
| Post | Squash merge + verify | 2 | — |
| **Total** | **23 issues (2 FPs removed)** | **20 tasks** | |
