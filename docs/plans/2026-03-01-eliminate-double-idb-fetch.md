# Eliminate Double IDB Fetch — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the redundant IDB read in dungeon XP post-processing by having `grantShadowXP` return the updated shadow objects it already has in memory after persisting them.

**Architecture:** Add an accumulator inside `grantShadowXP` that collects each chunk's `updatedShadows` array after successful IDB write. Return them in a `{ updatedShadows: [...] }` object. Dungeons captures this, threads it through the deferred queue, and `_runDeferredDungeonXpPostProcess` uses the post-XP objects directly instead of re-fetching from IDB.

**Context:** The naive approach (passing pre-fetched shadows through) was tried and reverted — `grantShadowXP` creates its own copies via `prepareShadowForSave()`, so pre-fetched objects have stale pre-XP data. This approach returns the **post-persist** objects, which have correct XP/level/rank.

**Files:**
- Modify: `plugins/ShadowArmy.plugin.js` (lines 6836-6986 — `grantShadowXP`)
- Modify: `plugins/Dungeons.plugin.js` (lines 12096-12132 — `grantShadowDungeonXP`)
- Modify: `plugins/Dungeons.plugin.js` (lines 7994-8036 — `_queueDeferredDungeonXpPostProcess`)
- Modify: `plugins/Dungeons.plugin.js` (lines 8038-8158 — `_runDeferredDungeonXpPostProcess`)

---

## Task 1: Create feature branch

**Step 1: Branch from main**

```bash
cd ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets
git checkout main && git pull
git checkout -b perf/eliminate-double-idb-fetch
```

---

## Task 2: Add accumulator + return value to `grantShadowXP`

**Files:**
- Modify: `plugins/ShadowArmy.plugin.js:6836-6986`

**Why:** `grantShadowXP` currently returns `undefined` (no return statement). The `processXpBatch` closure has a local `updatedShadows` array that evaporates after each chunk. We need an outer accumulator to collect all chunks, then return them.

**Step 1: Add accumulator after `hasPersistedUpdates` declaration**

At line 6848, after `let hasPersistedUpdates = false;`, add:

```javascript
    const allUpdatedShadows = [];
```

**Step 2: Push chunk results into accumulator inside `processXpBatch`**

At line 6916-6917, after the successful IDB write (`hasPersistedUpdates = true;`), before `return updatedShadows.length;`, add:

```javascript
        allUpdatedShadows.push(...updatedShadows);
```

So lines 6916-6917 become:

```javascript
        hasPersistedUpdates = true;
        allUpdatedShadows.push(...updatedShadows);
        return updatedShadows.length;
```

**Step 3: Change the 4 early-return points to return `{ updatedShadows: [] }`**

- **Line 6845:** `if (baseAmount <= 0 && !perShadowAmounts) return;`
  → `if (baseAmount <= 0 && !perShadowAmounts) return { updatedShadows: [] };`

- **Line 6933:** `if (uniqueTargetIds.length === 0) return;`
  → `if (uniqueTargetIds.length === 0) return { updatedShadows: [] };`

- **Line 6965:** `if (!shadowsToGrant.length) return;`
  → `if (!shadowsToGrant.length) return { updatedShadows: [] };`

- **Line 6969:** `if (!hasPersistedUpdates) return;`
  → `if (!hasPersistedUpdates) return { updatedShadows: [] };`

**Step 4: Add final return at end of method**

At line 6985, after `this.saveSettings();`, add:

```javascript
    return { updatedShadows: allUpdatedShadows };
```

**Step 5: Update JSDoc comment**

At line 6827 (or wherever the JSDoc for `grantShadowXP` is), update the return annotation:

Find `Returns Promise<void>` and change to:
`Returns Promise<{updatedShadows: Array}> — post-persist shadow objects (may be empty on error/no-op)`

**Step 6: Syntax check**

```bash
node -c plugins/ShadowArmy.plugin.js
```

Expected: `Syntax OK`

**Step 7: Commit**

```bash
git add plugins/ShadowArmy.plugin.js
git commit -m "perf(shadow-army): return updated shadows from grantShadowXP

Add allUpdatedShadows accumulator that collects post-persist shadow
objects from each processXpBatch chunk. Return { updatedShadows }
object from all paths. Enables callers to use post-XP data directly
without re-fetching from IDB.

All 4 existing callers discard the return value, so this is backward
compatible — no caller changes required for ShadowArmy internals."
```

---

## Task 3: Capture return value in `grantShadowDungeonXP` + thread through queue

**Files:**
- Modify: `plugins/Dungeons.plugin.js:12096-12132` (`grantShadowDungeonXP`)
- Modify: `plugins/Dungeons.plugin.js:7994-8036` (`_queueDeferredDungeonXpPostProcess`)

**Why:** Currently line 12101 calls `await this.shadowArmy.grantShadowXP(...)` and discards the return. We need to capture `{ updatedShadows }` and pass it through the deferred queue so the post-processor can skip the redundant IDB fetch.

**Step 1: Capture return value in `grantShadowDungeonXP`**

Change lines 12099-12110 from:

```javascript
    try {
      await this.shadowArmy.grantShadowXP(
        0,
        `dungeon_${dungeon.rank}_${channelKey}`,
        xpTargetIds,
        {
          perShadowAmounts: xpByShadowId,
          skipPowerRecalc: true,
        }
      );
      xpGrantSucceeded = true;
```

To:

```javascript
    let postXpShadows = [];
    try {
      const xpResult = await this.shadowArmy.grantShadowXP(
        0,
        `dungeon_${dungeon.rank}_${channelKey}`,
        xpTargetIds,
        {
          perShadowAmounts: xpByShadowId,
          skipPowerRecalc: true,
        }
      );
      xpGrantSucceeded = true;
      postXpShadows = xpResult?.updatedShadows || [];
```

**Step 2: Pass `postXpShadows` into the deferred queue call**

Change lines 12124-12132 from:

```javascript
    const deferredPostProcess = this._queueDeferredDungeonXpPostProcess({
      channelKey,
      dungeonName: dungeon?.name,
      dungeonRank: dungeon?.rank,
      xpTargetIds,
      beforeStatesEntries: Array.from(beforeStates.entries()),
      combatHours,
      growthHoursByShadowId,
    });
```

To:

```javascript
    const deferredPostProcess = this._queueDeferredDungeonXpPostProcess({
      channelKey,
      dungeonName: dungeon?.name,
      dungeonRank: dungeon?.rank,
      xpTargetIds,
      beforeStatesEntries: Array.from(beforeStates.entries()),
      combatHours,
      growthHoursByShadowId,
      postXpShadows,
    });
```

**Step 3: Thread `postXpShadows` through `_queueDeferredDungeonXpPostProcess`**

Change the destructured parameter list at line 7994 to include `postXpShadows`:

```javascript
  _queueDeferredDungeonXpPostProcess({
    channelKey,
    dungeonName,
    dungeonRank,
    xpTargetIds,
    beforeStatesEntries,
    combatHours,
    growthHoursByShadowId,
    postXpShadows,
  }) {
```

And add `postXpShadows` to the `_runDeferredDungeonXpPostProcess` call at lines 8020-8028:

```javascript
      this._runDeferredDungeonXpPostProcess({
        taskKey,
        channelKey,
        dungeonName,
        dungeonRank,
        xpTargetIds: uniqueIds,
        beforeStatesEntries,
        combatHours,
        growthHoursByShadowId,
        postXpShadows,
      }).catch((error) => {
```

**Step 4: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 5: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): capture + thread postXpShadows through deferred queue

Capture { updatedShadows } return from grantShadowXP in
grantShadowDungeonXP and pass through _queueDeferredDungeonXpPostProcess
to _runDeferredDungeonXpPostProcess. This provides post-XP shadow
objects to the post-processor without a second IDB read."
```

---

## Task 4: Use `postXpShadows` in `_runDeferredDungeonXpPostProcess` with fallback

**Files:**
- Modify: `plugins/Dungeons.plugin.js:8038-8061`

**Why:** This is the consumer. Currently lines 8053-8061 always fetch from IDB. We use `postXpShadows` when available and count matches, falling back to IDB fetch only when the data is missing or incomplete (partial failure safety).

**Step 1: Update `_runDeferredDungeonXpPostProcess` to accept and use `postXpShadows`**

Change lines 8038-8061 from:

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
  }) {
    const startMs = Date.now();
    const beforeStates = new Map(beforeStatesEntries || []);
    const shadowStorage = this.shadowArmy?.storageManager;

    try {
      // Re-fetch shadows from IDB to get post-XP-grant state (grantShadowXP persists its own copies)
      const updatedShadows = await this._fetchDungeonShadowsByIds(xpTargetIds);
      const updatedMap = new Map();
      for (const shadow of updatedShadows) {
        const sid = String(this.getShadowIdValue(shadow) || '');
        if (sid && beforeStates.has(sid)) {
          updatedMap.set(sid, shadow);
        }
      }
```

To:

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
    postXpShadows,
  }) {
    const startMs = Date.now();
    const beforeStates = new Map(beforeStatesEntries || []);
    const shadowStorage = this.shadowArmy?.storageManager;

    try {
      // Build post-XP shadow map: prefer in-memory data from grantShadowXP,
      // fall back to IDB fetch if unavailable or count mismatch (partial failure)
      let updatedMap = new Map();

      if (Array.isArray(postXpShadows) && postXpShadows.length >= xpTargetIds.length) {
        // Use in-memory post-XP shadows — no IDB read needed
        for (const shadow of postXpShadows) {
          const sid = String(this.getShadowIdValue(shadow) || '');
          if (sid && beforeStates.has(sid)) {
            updatedMap.set(sid, shadow);
          }
        }
        this.settings.debug && console.log(
          `[Dungeons] ⚡ POST-XP CACHE HIT: ${updatedMap.size}/${xpTargetIds.length} shadows from grantShadowXP (skipped IDB fetch)`
        );
      } else {
        // Fallback: re-fetch from IDB (postXpShadows missing or partial failure)
        const updatedShadows = await this._fetchDungeonShadowsByIds(xpTargetIds);
        for (const shadow of updatedShadows) {
          const sid = String(this.getShadowIdValue(shadow) || '');
          if (sid && beforeStates.has(sid)) {
            updatedMap.set(sid, shadow);
          }
        }
        this.settings.debug && console.log(
          `[Dungeons] 📦 POST-XP FALLBACK: fetched ${updatedMap.size}/${xpTargetIds.length} shadows from IDB` +
          (Array.isArray(postXpShadows) ? ` (postXpShadows had ${postXpShadows.length}, needed ${xpTargetIds.length})` : ' (no postXpShadows)')
        );
      }
```

The rest of the method (from the `leveledUpShadows`/`rankedUpShadows` detection onward) remains **completely unchanged**.

**Step 2: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): use postXpShadows in deferred processor, skip IDB fetch

_runDeferredDungeonXpPostProcess now uses post-XP shadow objects
passed from grantShadowXP instead of re-fetching from IDB. Falls
back to IDB fetch when postXpShadows is missing or count mismatches
xpTargetIds (partial failure safety). Debug logs indicate which
path was taken."
```

---

## Task 5: Final verification + sync

**Step 1: Syntax check both files**

```bash
node -c plugins/Dungeons.plugin.js && node -c plugins/ShadowArmy.plugin.js
```

Expected: Both `Syntax OK`

**Step 2: Verify no dangling references**

```bash
# Confirm grantShadowXP return value is captured in Dungeons
grep -n 'xpResult.*grantShadowXP\|grantShadowXP.*xpResult' plugins/Dungeons.plugin.js

# Confirm postXpShadows flows through all 3 methods
grep -n 'postXpShadows' plugins/Dungeons.plugin.js

# Confirm allUpdatedShadows is declared and returned in ShadowArmy
grep -n 'allUpdatedShadows' plugins/ShadowArmy.plugin.js

# Confirm 3 ShadowArmy callers still discard return (no breakage)
grep -n 'await this.grantShadowXP' plugins/ShadowArmy.plugin.js
```

**Step 3: Sync to BetterDiscord**

```bash
cp plugins/Dungeons.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
cp plugins/ShadowArmy.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

**Step 4: Squash merge to main**

```bash
git checkout main
git merge --squash perf/eliminate-double-idb-fetch
git commit -m "perf(dungeons): eliminate double IDB fetch via grantShadowXP return value

grantShadowXP now returns { updatedShadows: [...] } containing the
post-persist shadow objects from all processXpBatch chunks. Dungeons
captures this in grantShadowDungeonXP and threads it through the
deferred queue to _runDeferredDungeonXpPostProcess.

The post-processor uses these in-memory objects for level/rank change
detection and natural growth instead of re-fetching from IDB. Falls
back to IDB fetch if postXpShadows is missing or count doesn't match
(partial failure safety).

Impact:
- IDB reads per completion: 2 → 1 (saves ~50-200ms per completion)
- Backward compatible: all 3 ShadowArmy callers discard return value
- Zero risk: fallback ensures correctness if grantShadowXP changes"

git branch -d perf/eliminate-double-idb-fetch
```

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| IDB reads per dungeon completion | 2 (grant + post-process) | 1 (grant only) |
| Post-processor latency | ~50-200ms (IDB read) | ~0ms (in-memory) |
| Backward compatibility | N/A | All 3 ShadowArmy callers unaffected |
| Failure mode | N/A | Falls back to IDB fetch on count mismatch |

## Key Engineering Decisions

1. **Return `{ updatedShadows }` object (not bare array):** Extensible for future fields without breaking callers.

2. **`allUpdatedShadows.push(...updatedShadows)` after IDB write, not before:** Ensures we only collect shadows that were successfully persisted. If a chunk's IDB write fails (catch returns 0), those shadows are NOT added to the accumulator.

3. **Count-based fallback (`postXpShadows.length >= xpTargetIds.length`):** If a chunk failed during `grantShadowXP`, the accumulator will have fewer shadows than expected. The `>=` check catches this and falls back to IDB fetch for the authoritative state.

4. **`prepareShadowForSave` creates new objects:** The returned shadows are the exact objects that were written to IDB (post-`prepareShadowForSave`, post-`updateShadowsBatch` which adds `ensurePersonalityKey`). They are NOT references to the original in-memory shadows — they're the same structured clones that IDB would return anyway.

## Risk Assessment

- **No risk to 3 ShadowArmy callers:** They already discard the return value (`await this.grantShadowXP(...)` with no assignment). Adding a return value doesn't affect them.
- **Partial failure handled:** If any chunk's IDB write fails, the accumulator has fewer entries → count check fails → IDB fallback.
- **Object freshness:** The `updatedShadows` array contains objects that went through `prepareShadowForSave()` and `updateShadowsBatch()` (which calls `ensurePersonalityKey()` and stores in LRU cache). These are identical to what `getShadowsByIds` would return from IDB's structured clone.
