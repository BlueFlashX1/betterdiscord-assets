# Performance Conventions & Subagent Briefing Pack

> Canonical playbook for performance work on this suite. Derived from the 2026-07 audit
> campaign (tiers 1–5, lag-spike wave, CPU-budget waves 1–2) + BetterDiscord community canon.
> **Dispatch convention:** point subagents at this file + `memory/CURRENT.md` instead of
> re-embedding context. Audit archives live in `memory/scratch/cpu-audit-*.md`.

## 1. The one principle

Discord's UI is a single main thread. Every finding reduces to `small cost × huge frequency`.
The three frequencies that matter: **messages received** (hundreds/hr in busy servers),
**messages sent**, and **timers that fire forever**. Break the multiplication — don't just
speed up the work; prove the work doesn't need to happen at that frequency.

## 2. Hard rules (violations are bugs, not style)

| # | Rule | Canonical example |
|---|------|-------------------|
| R1 | **Never full-scan the ShadowArmy IDB store** (281k+ records ≈ 45–50s). Bounded reads only: `index('rank').getAll(rank, count)`, keyset pagination (`getShadowsByKeyPage`), chunked `getShadowsByIds`. Grep ALL call sites incl. internal re-verification paths before declaring a scan fixed. | `ShadowArmy/storage.js:getShadowsByRankLimited`; DKB `bd-idb-bounded-queries-at-scale` |
| R2 | **Army-wide XP goes through the pending-shared-XP accumulator** (`progression.js:shareShadowXP` → `flushPendingSharedXp`, 10-min timer + stop-flush). Never per-event grants with null shadowIds. | `ShadowArmy/progression.js:19-93` |
| R3 | **Hot-path check ordering: cheapest, most-likely-to-reject first.** Own-message / monitored-user Set lookups come BEFORE any DOM query, fiber walk, or allocation. Cache negative results (WeakSet of not-own elements) when the answer is immutable. | `CriticalHit/pipeline.js:checkForCrit`; `SLS/message-observers.js` |
| R4 | **`BdApi.Data.save` is synchronous localStorage.** Defer off hot paths, coalesce (SLS: 20s debounce + 30s dirty-gated net), flush on stop. Never READ (e.g. backup scans) on the write path — cache reads in memory. | `SLS/settings-store.js`, `persistence-backups.js` |
| R5 | **Webpack modules resolve ONCE, cached** — at `start()` or in a memoized shared acquirer. `{searchExports:true}` only inside a one-time cached resolution. **No optional chaining inside Webpack filter functions.** Dispatcher via `shared/dispatcher.acquireDispatcher()`; stores via `BdApi.Webpack.getStore("X")` cached on the instance. | `Stealth/index.js:816`, `shared/dispatcher.js` |
| R6 | **Observers: shared hubs, narrow scope, throttled, `document.hidden`-gated.** New cross-plugin singletons live on `window.__SL_*` (esbuild bundles `shared/` per plugin — module scope is NOT shared; refcount on the global). Deliberate deviation from community "patch render instead": Patcher-on-render rots with hashed internals; keep aria/role-anchored observers. | `shared/header-toolbar.js`, DKB `bd-esbuild-shared-singletons` |
| R7 | **Timers:** every interval needs (a) a `document.hidden` gate unless its work is required while hidden, (b) a self-stop or dirty-flag when idle, (c) an absolute catch-up ceiling if it processes elapsed time (5-min precedent). | `Dungeons/combat-shadow-support.js:getCappedAttackElapsedMs` |
| R8 | **IDB partial tolerance:** per-item `request.onerror` must `preventDefault()`+`stopPropagation()` or one bad record aborts the whole transaction. `onabort` handlers ARE the rejection path — never remove. No `push(...spread)` with potentially >65k elements. | `ShadowArmy/storage.js` batch methods |
| R9 | **React:** memoize components in frequently-refreshing containers; hoist ref callbacks that close over nothing; keyed remount semantics must be verified before memoizing. | `ShadowSenses/components.js:FeedCard` |
| R10 | **Fonts/CSS:** never `var(--font-primary)` (theme-poisoned); every `addStyle` has a symmetric `removeStyle`; shared-by-ID CSS refcounts on `window.__SL_*`. | DKB `bd-css-var-font-primary-poisoned` |

## 3. Verification discipline (what made round 1 safe)

- **Verify the finding in code before fixing** (pre-edit-verify). Audits can cite stale lines.
- **Dead code:** `grep -rn '\bname\b'` — refs==1 (definition only) = dead; refs>=2 = LIVE.
  "Unused export" / "only called in own file" is NOT dead (30/30 false-positive incident).
- **Behavior contracts:** game balance, XP totals, and faithful per-event delivery for
  monitored users are invariants. Coalescing/reordering must be provably outcome-identical.
- **Builds:** `node scripts/build-plugin.js <Name>` per touched plugin; `--all` after
  `shared/` edits (bundled per-plugin). Green build ≠ correct — esbuild bundles broken refs.
- **Runtime evidence beats static review:** BD debug log is at
  `~/Library/Application Support/BetterDiscord/data/stable/debug.log`; frequency-profile it
  (`grep | cut | uniq -c`) before and after. Probe pattern for un-DevTools-able questions:
  temp plugin writing JSON to `BdApi.Plugins.folder` (NOT ~/Documents — Discord lacks TCC
  write there; `__filename` is a bare basename, don't realpath it).

## 4. Do-not-refix registry (fixed or refuted — re-reporting is a defect)

Fixed 2026-07: SLS backup-cache + 20s save coalescing + not-own WeakSet/batch-dedup/fiber
early-exit + chatUIObserver narrowed; CriticalHit own-check-first + O(1) restoration map +
hash caching; Dungeons index-scoped GC + hidden gates + 5-min catch-up ceiling; ShadowArmy
XP coalescing (message+quest) + cacheKey-primary buff caches + keyset promotion pagination +
essence pre-check/cooldown + batch preventDefault; ShadowSenses deploy bounded query +
FeedCard memo (+ presence pre-filter, VC-detector short-circuit, RA dedup — wave 2, verify
landed); ItemVault spend-fail dedup; dispatcher harmonization; getAggregatedPower removed.

Refuted (do NOT touch): SoloLevelingToasts messageGroups (eviction exists); SystemWindow
visibilitychange (correct as-is); ShadowPortalCore breathing tweens; ShadowArmy storage
onabort handlers; CSSPicker ESM/CJS mix; plugin-bridge cache; toolbar-tooltip fallback;
Dungeons usedIds sentinel; EquipmentManager bonus cache; SoloLevelingTheme hashed classes.

Parked (small, grab-bag for a future round): Dungeons mobs `extracted` never set true (GC
branch no-op); CriticalHit content-hash restoration fallback unreachable under LEAN schema;
SoloLevelingToasts debug-payload built before debugLog gate; debug-logging signature
unification (6+ variants); ShadowAwayBridge stale committed runtime.js (NEEDS USER DECISION);
Dungeons header-widget loop never self-stops (near-zero cost).

## 5. Dispatch template (copy for each subagent)

```
Repo: /Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets
(branch perf/all-plugins-audit). Scope: ONLY <dirs/files>.
Read docs/PERF-CONVENTIONS.md (hard rules R1-R10, verification discipline, do-not-refix
registry) and <audit file> first — your work unit is <findings>.
Purpose: <1 sentence>.
Do, after verifying each in code: <numbered items with file:line>.
Constraints: work-claim memory/current_tasks/<slug>.md before first edit, delete when done,
abort on overlap. Edit src/ only — never plugins/*.plugin.js (generated). If Edit/Write
declines with "User answered in terminal", fall back to Bash+python exact-string replacement
(user-authorized for this repo): assert single-match before replacing, re-read after.
No commits.
Done when: <observable conditions incl. build green>.
Return ≤N tokens: per-item ✅/❌ + file:line, key verification evidence, build result.
```

Risk grading for triage: **LOW** = mechanically safe, auto-apply. **MED** = apply with stated
verification. **HIGH** = touches game feel/balance/data — surface to the user first.
