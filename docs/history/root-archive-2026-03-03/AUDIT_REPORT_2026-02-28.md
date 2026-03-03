# BetterDiscord Plugin Suite — Full Audit Report

**Date:** February 28, 2026
**Scope:** 20 plugins, ~73,783 lines of code
**Tools:** 6 parallel audit agents + archlint static analysis (600 smells scanned)
**Categories:** Dead Code, Duplicate Patterns, Performance, Logic Soundness, Event Leaks

---

## Executive Summary

| Severity | Count | Removable LOC |
|----------|-------|---------------|
| CRITICAL | 4 | ~25 |
| HIGH | 8 | ~580 |
| MEDIUM | 12 | ~350 |
| LOW | 18 | ~200 |
| **Total** | **42 findings** | **~1,155 lines** |

> **Revision (post-Antigravity review):** C2 (Dungeons HP bar) downgraded from CRITICAL to HIGH.
> The `updateBossHPBar()` method already has a fast-path (lines 12416-12443) that uses targeted
> `textContent` updates for numeric-only changes. The innerHTML rebuild (lines 12543-12611)
> only fires on structural changes (button states, dungeon name/rank/type). The `_bossBarCache`
> diffing means ~99% of combat ticks hit the fast path. Still HIGH for the ~70 lines of inline
> styles in the structural rebuild template.

**Dead symbols confirmed:** 54 genuinely dead methods (filtered from 135 archlint flags — 81 were BD lifecycle false positives)
**Cross-plugin extraction opportunities:** 8 patterns, ~480-560 LOC saveable via shared helpers
**Clean plugins (no issues):** ChatNavArrows, ShadowStep, SystemWindow, SoloLevelingToasts

---

## CRITICAL Findings (Fix Immediately)

### C1. ShadowArmy: `processNaturalGrowthForAllShadows()` is a no-op stub still called at startup

**File:** ShadowArmy.plugin.js, lines 7512-7516
**Impact:** `startNaturalGrowthInterval()` (line 2619) sets up a recurring timer that calls an empty function body. Wasted timer + misleading code path.
**Fix:** Either implement the growth logic or remove the stub AND the interval that calls it.

### ~~C2~~ → H8. Dungeons: `updateBossHPBar()` innerHTML structural rebuild has ~70 lines of inline styles

**File:** Dungeons.plugin.js, lines 12543-12611
**Impact:** ~~Rebuilds DOM via innerHTML every combat tick~~ **CORRECTED:** The method already has a fast-path (lines 12416-12443) using targeted `textContent`/CSS-variable updates. The innerHTML rebuild only fires on structural changes (name/rank/type/participation state transitions). However, the structural rebuild template (lines 12543-12611) contains ~70 lines of inline `style="..."` strings that should be CSS classes.
**Fix:** Move inline styles to CSS classes in the injected stylesheet. Keep existing fast-path unchanged — it's already optimal.
**Severity:** Downgraded from CRITICAL to HIGH (post-Antigravity review).

### C3. ShadowArmy: Settings panel built with innerHTML

**File:** ShadowArmy.plugin.js, lines 11352-11582
**Impact:** ~230 lines of innerHTML template string. Fragile, no XSS protection, inconsistent with the React settings pattern used by other plugins.
**Fix:** Migrate to React `getSettingsPanel()` pattern (see CriticalHit, SkillTree as reference implementations).

### C4. SkillTree: `this._toast` wrong context in React callback

**File:** SkillTree.plugin.js, line 306
**Impact:** `this._toast(result.reason, "error", 2500)` inside a React `useCallback` — `this` is wrong context (will be undefined or window). TypeError waiting to happen when any skill activation fails.
**Fix:** Change to `pluginInstance._toast(result.reason, "error", 2500)` — the closure variable `pluginInstance` is already in scope.

### C5. ShadowSenses: `SensesEngine.clear()` leaks Dispatcher subscriptions

**File:** ShadowSenses.plugin.js, lines 1577-1606
**Impact:** `clear()` nullifies handler references and creates a new empty `_subscribedEventHandlers` Map WITHOUT calling `Dispatcher.unsubscribe()` first. If called directly (not via `stop()`), dangling event subscriptions remain on the Dispatcher.
**Fix:** Iterate `_subscribedEventHandlers` and call `Dispatcher.unsubscribe()` for each before clearing.

---

## HIGH Findings

### H1. Dungeons: Monster stat validation — 150 lines of repeated clamping

**File:** Dungeons.plugin.js, lines 14126-14272
**Impact:** 5 stat blocks with identical min/max clamping logic repeated for each.
**Fix:** Extract `clampStat(value, min, max)` helper, reduce to ~30 lines.

### H2. Dungeons: Inline CacheManager class defined inside constructor

**File:** Dungeons.plugin.js, lines 1057-1091
**Impact:** Class definition re-created on every plugin instantiation. Should be module-scoped.
**Fix:** Move `CacheManager` class outside the constructor.

### H3. Dungeons: Constructor is ~360 lines of property initialization

**File:** Dungeons.plugin.js, lines 925-1286
**Impact:** Cognitive complexity, hard to maintain.
**Fix:** Group into `_initTimers()`, `_initCaches()`, `_initState()` sub-methods.

### H4. ShadowSenses: Dead ShadowPicker code (~80 lines)

**File:** ShadowSenses.plugin.js
**Impact:** `openShadowPicker()` + `ShadowPicker` React component + associated CSS never used.
**Fix:** Remove entirely.

### H5. ShadowSenses: Version mismatch `@version 1.1.5` vs `PLUGIN_VERSION = "1.1.4"`

**File:** ShadowSenses.plugin.js
**Fix:** Sync to the correct version.

### H6. HSLDockAutoHide + UserPanelDockMover: ~140 lines identical CSS

**Files:** HSLDockAutoHide.plugin.js (lines 1322-1459) + UserPanelDockMover.plugin.js (lines 110-280)
**Impact:** The entire `.sl-userpanel-docked` CSS ruleset is duplicated nearly identically.
**Fix:** Conditional injection — UserPanelDockMover skips CSS when HSLDockAutoHide is active.

### H7. RulersAuthority: Hover handler complexity 70 — 4 identical reveal/hide blocks

**File:** RulersAuthority.plugin.js, line 649
**Impact:** ~100 lines that could be ~25 lines with a shared reveal/hide helper.
**Fix:** Extract `_handleRevealZone(zone, cursor)` helper.

---

## MEDIUM Findings

### M1. CriticalHit: 11 confirmed dead methods (~250 lines)

`setupRestorationRetryObserver` (~70 LOC), `matchCritToMessage` (~75 LOC), `attachCriticalHitSettingsPanelHandlers` (no-op), 6x legacy `updateCrit*` methods, `testCrit`, `setupSettingsDisplayObserver`. Plus 5 unused constructor properties (`_cachedMessageSelectors`, `_cachedMessageSelectorsTimestamp`, `_cachedMessageSelectorsMaxAge`, `_cachedMessages`, `_displayUpdateInterval`).

### M2. SoloLevelingStats: Unused CSS keyframes + `_timestamp` var

Unused `shimmer` and `sparkle` keyframes (lines 9731-9741). Unused `_timestamp` in `debugLog` (line 11024). `debugConsole` nearly duplicates `debugLog`. `createToggle` has unused `_onChangeUnused` parameter.

### M3. ShadowSenses: `_addUtilityFeedEntry` is no-op `return;` but called 3 times

3 call sites construct full objects then pass them to a function that immediately returns. Wasted allocations.

### M4. ShadowSenses: `_subscribeEvent` silently blocks multiple handlers per event

Only the first handler registered per event name is kept. No warning logged. Could cause subtle bugs.

### M5. ShadowRecon: `injectMemberCounterBanner` — deprecated feature, dead code (~50 lines)

Setting defaults to `false`, `start()` explicitly calls `removeMemberCounterBanner()`. The inject, update, CSS rule, and `MEMBER_BANNER_ID` constant are all unreachable.

### M6. ShadowRecon: `refreshGuildIconHints` — unbounded DOM query every 15s

`querySelectorAll('[data-list-item-id*="guild"]')` rewrites `title` attributes every cycle even when unchanged. Cache last-written values to skip no-op writes.

### M7. TitleManager: `getToolbarContainer` — 95 lines of dead DOM-scraping

Pre-React toolbar injection strategy. `isValidToolbarContainer()` also dead (only called from this method). Superseded by `SLUtils.registerToolbarButton()`.

### M8. Stealth: `_patchStatusSetters` — dead method (23 lines)

Fully implemented but never called. Proto intercept (`_patchProtoStatusUpdate`) is the active path.

### M9. HSLDockAutoHide: 3 dead DockEngine methods (~30 lines)

`isTypingInMessageComposer`, `isComposerFocused`, `isCursorWithinDockX` — all superseded by newer methods.

### M10. CSSPicker: 3 dead utility functions (~70 lines)

`getChildrenDetails`, `getTablistChildHints`, `getAncestry` — superseded by compact variants.

### M11. RulersAuthority: 4 identical CSS push rule blocks

Lines 1714-1752, ~40 lines that could be a single parameterized rule.

### M12. SoloLevelingStats: CSS block ~1,700 lines injected as single string

Consider splitting into logical sections or external file for maintainability.

---

## LOW Findings

### L1-L3. LevelProgressBar: 3 dead methods

`updateProgressBarPosition` (line 1242), `getOrCreateLevelUpOverlay` (line 1699), `refreshProgressText` (line 1729).

### L4-L5. ShadowExchange: `debugLog` + `debugError` both dead

Lines 972-978. Never called; plugin uses raw `console.error()` directly.

### L6. ShadowExchange: `isShadowMarked` — dead but documented API

Line 997. Keep or remove based on whether the public API contract matters.

### L7. ShadowExchange: `renameWaypoint` — vestigial stub

Line 1194. UI was never wired up.

### L8. ShadowRecon: `_getCreateRoot` dead (never uses React)

Line 255. Plugin builds UI via `document.createElement()`.

### L9. Dungeons: Dead `global.gc()` call

Lines 14482-14492. No-op in browser context.

### L10. Dungeons: `stop()` is ~260 lines handling 15+ subsystems

Maintenance burden. Consider grouping cleanup into subsystem-specific helpers.

### L11. ShadowSenses: Dead DeploymentManager methods

`isDeployed`, `getDeployedShadowIds`, `isMonitored`, `validateDeployments`.

### L12. CriticalHit: Unused constructor properties (5 properties)

`_cachedMessageSelectors`, `_cachedMessageSelectorsTimestamp`, `_cachedMessageSelectorsMaxAge`, `_cachedMessages`, `_displayUpdateInterval`.

### L13. HSLDockAutoHide: Debug log reports stale 850ms, actual interval is 1500ms

Line 199. Cosmetic but misleading.

### L14. UserPanelDockMover: `_pollSlowed` never resets on element change

Lines 313-317. Panel could stay un-docked for up to 10s during React re-renders.

### L15. CSSPicker: Overlapping selector extraction logic

`getAttributeSelectorCandidates` vs `getStableSelectorSet` — redundant attribute reads.

### L16. Stealth: Ungated `console.log` in production

Lines 763, 769. Not behind `this.settings.debugMode`.

### L17. ShadowRecon: Dead CSS for member banner still injected

Line 1541. ~15 lines of CSS that never match any DOM element.

### L18. RulersAuthority: `_panelElCache` never declared in constructor

Implicit property creation.

---

## Cross-Plugin Extraction Opportunities

| ID | Pattern | Plugins | Est. Savings |
|----|---------|---------|--------------|
| P0 | `_bdLoad` boilerplate | 17 plugins | ~51 LOC |
| P1 | Settings save/load (`BdApi.Data`) | 18 plugins | ~100-120 LOC |
| P2 | Webpack store lookups (UserStore, ChannelStore, etc.) | 14 plugins | ~80-100 LOC |
| P3 | FluxDispatcher acquisition | 3 plugins | ~80 LOC |
| P4 | IDB boilerplate | 2 plugins (Dungeons, ShadowArmy) | ~60-80 LOC |
| P5 | Timer management (`_setTrackedTimeout`) | 6 plugins | ~40 LOC |
| P6 | MutationObserver message container | 2 plugins | ~30 LOC |
| P7 | Inline fallbacks (`_ttl`, `isEditableTarget`, toast) | 3 plugins | ~32 LOC |
| P8 | `_getCreateRoot` React helper | 7 plugins | ~21 LOC |

**Total extractable:** ~480-560 lines into shared `_PluginUtils` or `BetterDiscordReactUtils`

---

## archlint Static Analysis Summary

| Metric | Count |
|--------|-------|
| Architecture Grade | Critical (score 0.0, density 272.67) |
| Total Smells | 600 |
| HIGH severity | 9 (all CodeClone) |
| MEDIUM severity | 591 |
| Dead Symbols (raw) | 135 |
| Dead Symbols (genuine, after filtering) | 54 |
| Code Clones | 28 |
| Deep Nesting (>4) | 24 |
| High Cognitive Complexity (>15) | 186 |
| High Cyclomatic Complexity (>10) | 161 |

**Worst complexity hotspots:**
- `ShadowArmy.bulkDungeonExtraction` — cyclomatic 105
- `ShadowPortalCore.draw` — cognitive 103
- `SensesEngine._onMessageCreate` — cognitive 98
- `RulersAuthority.<anonymous>` at line 649 — cognitive 70

---

## Clean Plugins (No Issues)

These plugins passed all checks with zero findings:

| Plugin | Lines | Notes |
|--------|-------|-------|
| ChatNavArrows | 696 | Clean RAF-coalesced scroll, proper cleanup |
| ShadowStep | 1,423 | Good ShadowPortalCore integration, all refs cleaned |
| SystemWindow | 683 | data-sw-self caching, NavBus + poll fallback |
| SoloLevelingToasts | 2,024 | All toast upgrade work verified complete |

---

## Recommended Priority Order

1. **C4** (SkillTree `this._toast`) — 1-line fix, prevents runtime TypeError
2. **C5** (ShadowSenses Dispatcher leak) — add unsubscribe loop before clear
3. **C1** (ShadowArmy no-op growth) — remove stub + its timer
4. **C3** (ShadowArmy innerHTML settings) — React migration, high effort
5. **H5** (ShadowSenses version mismatch) — 1-line fix
6. **H8** (Dungeons HP bar inline styles → CSS classes) — was C2, downgraded after review
7. **M1** (CriticalHit dead methods) — ~250 LOC removal
8. **M7** (TitleManager dead toolbar) — ~95 LOC removal
9. **H6** (CSS duplication) — conditional injection pattern
10. **P1-P2** (shared helpers extraction) — biggest cross-plugin maintenance win
11. Remaining dead code sweeps (M5, M8-M10, L1-L18)
