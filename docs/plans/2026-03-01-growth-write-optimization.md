# Growth Write Optimization — Change A + Change B

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate two remaining inefficiencies in the dungeon completion post-process: (A) fix cache coherence by using single-transaction `updateShadowsBatch` for growth writes, and (B) skip redundant `prepareShadowForSave` on the fast path where shadows already went through full prep in `grantShadowXP`.

**Architecture:** Both changes target `_runDeferredDungeonXpPostProcess` in `Dungeons.plugin.js` (lines 8111-8151). No ShadowArmy changes needed. ~15 LOC changed total. The fast path (`postXpShadows` present) and fallback path (IDB fetch) are already branched at line 8060 — we track which path was taken via a boolean and use it to gate behavior downstream.

**Context:**
- `postXpShadows` on the fast path are post-persist objects from `grantShadowXP` that already went through `prepareShadowForSave` inside ShadowArmy's `processXpBatch` → `saveShadowsBatch` pipeline.
- After `applyNaturalGrowth` and `attemptAutoRankUp` mutate them in-place (both recalculate `strength`), no re-prep is needed.
- The IDB fallback path returns raw compressed records via `_fetchDungeonShadowsByIds` → `getShadowsByIds` (may have `_c: 1` or `_c: 2`) — these MUST still go through `prepareShadowForSave`.
- `updateShadowsBatch` does everything `saveShadowsBatch` does (single `readwrite` txn, `ensurePersonalityKey`, `store.put`) PLUS updates `recentCache` via `updateCache`. Currently the growth block prefers `saveShadowsChunked` (multiple txns, no cache update) — this is suboptimal for the typical 5-50 shadow case.

**File:** `plugins/Dungeons.plugin.js`

---

## Task 1: Create branch

**Step 1: Create feature branch from main**

```bash
cd ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets
git checkout main
git checkout -b perf/growth-write-optimization
```

**Step 2: Verify branch**

```bash
git branch --show-current
```

Expected: `perf/growth-write-optimization`

---

## Task 2: Add `usingPostXpCache` tracking boolean (Change B prerequisite)

**Files:**
- Modify: `plugins/Dungeons.plugin.js:8058-8084`

**What:** Add a `const usingPostXpCache` boolean at the branching point so downstream code knows which path built `updatedMap`.

**Step 1: Add the boolean**

At line 8058, change:

```javascript
      let updatedMap = new Map();

      if (Array.isArray(postXpShadows) && postXpShadows.length > 0) {
```

to:

```javascript
      let updatedMap = new Map();
      const usingPostXpCache = Array.isArray(postXpShadows) && postXpShadows.length > 0;

      if (usingPostXpCache) {
```

**Step 2: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "refactor(dungeons): extract usingPostXpCache boolean for path tracking"
```

---

## Task 3: Skip redundant `prepareShadowForSave` on fast path (Change B)

**Files:**
- Modify: `plugins/Dungeons.plugin.js:8136-8139`

**What:** On the fast path (`usingPostXpCache === true`), `postXpShadows` already went through `prepareShadowForSave` in `grantShadowXP`. After `applyNaturalGrowth` and `attemptAutoRankUp` mutate in-place (recalculating `strength`), no re-prep is needed. On the fallback path, raw IDB records may be compressed and MUST go through prep.

**Step 1: Gate the prep call**

At lines 8136-8139, change:

```javascript
          const prepared = this.shadowArmy.prepareShadowForSave
            ? this.shadowArmy.prepareShadowForSave(shadow)
            : shadow;
          prepared && growthUpdates.push(prepared);
```

to:

```javascript
          // Fast path: postXpShadows already prepped by grantShadowXP pipeline;
          // applyNaturalGrowth + attemptAutoRankUp mutate in-place and recalculate strength.
          // Fallback path: raw IDB records may be compressed — must go through full prep.
          const prepared = usingPostXpCache
            ? shadow
            : (this.shadowArmy.prepareShadowForSave?.(shadow) ?? shadow);
          prepared && growthUpdates.push(prepared);
```

**Step 2: Syntax check**

```bash
node -c plugins/Dungeons.plugin.js
```

Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add plugins/Dungeons.plugin.js
git commit -m "perf(dungeons): skip redundant prepareShadowForSave on postXpShadows fast path"
```

---

## Task 4: Swap write method priority for cache coherence (Change A)

**Files:**
- Modify: `plugins/Dungeons.plugin.js:8142-8151`

**What:** Swap the growth write block to prefer `updateShadowsBatch` (single txn + cache update) for ≤50 shadows. Fall back to `saveShadowsChunked` for >50 (chunked multi-txn, yields between chunks to avoid blocking). Keep `Promise.all` as last resort.

Typical dungeon completion involves 5-50 shadows. `updateShadowsBatch` opens one `readwrite` transaction (vs. multiple from `saveShadowsChunked`) and updates `recentCache` so subsequent reads hit cache instead of stale pre-growth data.

**Step 1: Replace the write block**

At lines 8142-8151, change:

```javascript
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
```

to:

```javascript
        if (growthUpdates.length > 0 && shadowStorage) {
          // Prefer single-transaction updateShadowsBatch for typical dungeon sizes (≤50).
          // Updates recentCache (fixes cache coherence) and avoids multi-txn overhead.
          // Fall back to chunked writes for large batches to avoid blocking IDB.
          if (growthUpdates.length <= 50 && typeof shadowStorage.updateShadowsBatch === 'function') {
            await shadowStorage.updateShadowsBatch(growthUpdates);
          } else if (typeof shadowStorage.saveShadowsChunked === 'function') {
            await shadowStorage.saveShadowsChunked(growthUpdates, 10);
          } else {
            await Promise.all(growthUpdates.map((shadow) => shadowStorage.saveShadow(shadow)));
          }
          growthSaved = growthUpdates.length;
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
git commit -m "perf(dungeons): prefer updateShadowsBatch for growth writes — single txn + cache coherence"
```

---

## Task 5: Squash merge to main, sync, and verify

**Step 1: Squash merge**

```bash
git checkout main
git merge --squash perf/growth-write-optimization
git commit -m "perf(dungeons): optimize growth writes — cache coherence + skip redundant prep

Change A: Prefer updateShadowsBatch (single IDB transaction + recentCache update)
for ≤50 shadows. Fixes stale-cache coherence issue where saveShadowsChunked wrote
to IDB but left pre-growth data in recentCache. Falls back to chunked writes for
>50 shadows.

Change B: Skip prepareShadowForSave on postXpShadows fast path. These shadows
already went through full prep in grantShadowXP's pipeline. applyNaturalGrowth
and attemptAutoRankUp mutate in-place and recalculate strength. IDB fallback
path still runs full prep (raw compressed records need it)."
```

**Step 2: Delete feature branch**

```bash
git branch -D perf/growth-write-optimization
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
3. `git diff HEAD~1 -- plugins/Dungeons.plugin.js` — should show ~15 lines changed:
   - `usingPostXpCache` boolean added
   - `prepareShadowForSave` gated by `usingPostXpCache`
   - Write block reordered: `updateShadowsBatch` (≤50) → `saveShadowsChunked` → `Promise.all`
4. Manual test in Discord: complete a dungeon, verify no errors in console
