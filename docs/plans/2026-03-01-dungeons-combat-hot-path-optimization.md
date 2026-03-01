# Dungeons Combat Hot Path Optimization

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate three performance bottlenecks in the Dungeons combat loop that waste CPU cycles on every tick during active combat.

**Architecture:** All three fixes target hot-path methods called from `_combatLoopTick` (1000ms interval). No API changes, no behavioral changes — purely internal efficiency. ~20 LOC changed total.

**Context:**
- Combat loop fires every 1s via `_combatLoopTick`, calling `processBossAttacks`, `processMobAttacks`, and `processShadowAttacks` each tick.
- Typical combat has 1-10 active dungeons, each with 5-50 shadows vs. 10-500 mobs.
- All three fixes were verified against the actual code — not assumptions. See verification notes in each task.

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
      const remaining = 250 - (now - lastUpdate);
      this._hpBarUpdateTimer = this._setTrackedTimeout(() => {
        this._hpBarUpdateTimer = null;
        this.processHPBarUpdateQueue();
      }, remaining > 0 ? remaining : 0);
    }
```

**Step 3: Add timer cleanup in stop()**

Find the cleanup section in `stop()` where other HP bar properties are cleaned up, and add:

```javascript
      if (this._hpBarUpdateTimer) {
        this._clearTrackedTimeout(this._hpBarUpdateTimer);
        this._hpBarUpdateTimer = null;
      }
```

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

**What:** Both `processBossAttacks` (line 10268) and `processMobAttacks` (line 10608) call `this.saveSettings()` at the end of every tick. This is redundant because `_debounceDungeonSave` (line 10873, called elsewhere in the combat loop) already calls `saveSettings()` on a 2s debounce.

**Why it's safe:**
- `saveSettings()` uses a 3s debounce with NO timer reset (line 2601: `if (this._saveSettingsTimer) return;`). Subsequent calls within the 3s window are no-ops. So removing these calls changes nothing if `_debounceDungeonSave` fires within 3s — which it does (2s debounce).
- `this.deadShadows` (set at lines 10267 and 10603) is a runtime `Map()` initialized at line 1117 — it is NOT in `this.settings`, so `saveSettings()` doesn't persist it.
- HP/Mana changes from `_applyAccumulatedShadowAndUserDamage` trigger `pushHPToStats`/`pushManaToStats` which call `updateChatUI()` (fixed earlier today) — these don't go through `saveSettings()`.
- `dungeon.boss.lastAttackTime` (line 10266) is on the dungeon object which is persisted by `_debounceDungeonSave` → `storageManager.saveDungeon()`, not by `saveSettings()`.

**Verified:** Read `saveSettings()` (lines 2601-2623), `_saveSettingsImmediate()` (lines 2625-2679), and `_debounceDungeonSave()` (lines 10873-10887). The debounce is NOT timer-reset — subsequent calls are no-ops. But removing the calls eliminates the overhead of entering `saveSettings()`, marking dirty, and checking the timer — ~10 function calls/second during multi-dungeon combat.

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
(1s interval per dungeon). This is redundant: _debounceDungeonSave (2s)
already calls saveSettings(). The saveSettings debounce is a no-op guard
(not timer-reset), so these calls just add function call overhead.
deadShadows is a runtime Map not in settings. Boss/mob state is persisted
by _debounceDungeonSave → storageManager.saveDungeon()."
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

## Task 5: Squash merge to main, sync, and verify

**Step 1: Squash merge**

```bash
git checkout main
git merge --squash perf/combat-hot-path-optimization
git commit -m "perf(dungeons): optimize combat hot path — rAF loop, redundant saves, mob scan guard

Fix 1: Replace requestAnimationFrame spin-loop in processHPBarUpdateQueue
with calculated setTimeout. Was burning ~15 wasted frames per queued update
at 60fps during combat. Now sleeps until exact throttle expiry.

Fix 2: Remove redundant saveSettings() from processBossAttacks and
processMobAttacks. _debounceDungeonSave (2s) already calls saveSettings().
The saveSettings debounce is a no-op guard, so these just added function
call overhead (~10 calls/s during multi-dungeon combat).

Fix 3: Guard _cleanupDungeonActiveMobs and _pruneShadowMobContributionLedger
behind deadMobsThisTick.length > 0 in processShadowAttacks. Both scan
entire activeMobs array (up to 3000 entries) — skip when nothing died."
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
3. `git diff HEAD~1 -- plugins/Dungeons.plugin.js` — should show ~20 lines changed:
   - `processHPBarUpdateQueue` rewritten: `requestAnimationFrame` → `setTimeout(remaining)`
   - `queueHPBarUpdate` scheduling: `requestAnimationFrame` → `setTimeout(remaining)`
   - `_hpBarUpdateTimer` cleanup added to `stop()`
   - `saveSettings()` removed from `processBossAttacks` (line ~10268)
   - `saveSettings()` removed from `processMobAttacks` (line ~10608)
   - `_cleanupDungeonActiveMobs` + `_pruneShadowMobContributionLedger` wrapped in `deadMobsThisTick.length > 0` guard
4. Manual test in Discord: complete a dungeon, verify no errors in console, HP bars still update smoothly
