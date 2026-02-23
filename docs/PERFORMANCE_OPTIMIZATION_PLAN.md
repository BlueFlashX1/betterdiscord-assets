# BetterDiscord Plugin Suite — Performance Optimization Plan

> **Generated**: Feb 23, 2026
> **Scope**: All 20 plugins audited for memory leaks, CSS thrashing, cross-plugin conflicts, and performance
> **Goal**: Identical functionality, dramatically better performance

---

## Overall Health Scorecard

| Plugin | Lines | Leaks | CSS | Conflicts | Perf | Grade |
|--------|-------|-------|-----|-----------|------|-------|
| ShadowArmy | 11,784 | A+ | A | None | A | **A+** |
| HSLWheelBridge | 283 | A | N/A | None | A | **A** |
| ChatNavArrows | 482 | A | A | Low | A | **A** |
| Dungeons | 14,738 | A | A | None | B+ | **A-** |
| SystemWindow | 613 | A | A | None | B+ | **A-** |
| ShadowStep | 1,429 | A | A | None | B+ | **B+** |
| Stealth | 909 | A | A | Low | B | **B+** |
| ShadowExchange | 1,882 | B+ | B+ | Low | B | **B** |
| TitleManager | 1,700 | A | A | Low | B- | **B** |
| ShadowRecon | 1,693 | A | A | Low | B- | **B** |
| LevelProgressBar | 1,971 | B | A | Low | B- | **B-** |
| SoloLevelingToasts | 1,720 | C | B | None | B- | **C+** |
| ShadowSenses | 3,462 | B | A | Med | C | **C+** |
| SkillTree | 3,426 | C | C | Low | C | **C** |
| SoloLevelingStats | 11,054 | C | A | Med | C | **C** |
| CriticalHit | 8,664 | C | D | Med | D | **C-** |
| RulersAuthority | 2,331 | D | D | Med | D | **D+** |
| CSSPicker | 1,305 | B | A | None | F | **D** |
| HSLDockAutoHide | 1,401 | B | D | High | C | **D+** |
| UserPanelDockMover | 385 | B | A | Critical | B | **D+** |

---

## Phase 1: CRITICAL — Memory Leak Stoppers (Day 1)

These fixes prevent resource accumulation on every plugin reload.

### 1.1 SkillTree: history.pushState/replaceState Leak
**File**: `SkillTree.plugin.js` ~L3288-3298
**Problem**: Wrapped with local var, never restored in stop(). Stacks wrappers on each reload.
**Fix**: Store as `this._originalPushState`/`this._originalReplaceState`, restore in stop().

### 1.2 SoloLevelingStats: Activity Tracking Listeners
**File**: `SoloLevelingStats.plugin.js` ~L5487-5488
**Problem**: `mousemove` and `keydown` listeners added but NOT removed in stop().
**Fix**: Store handler refs, removeEventListener in stop().

### 1.3 RulersAuthority: 8 Hover Timers Not Cleared
**File**: `RulersAuthority.plugin.js` ~L267-274, L365-367
**Problem**: All 8 hover/anim timers initialized but zero clearTimeout calls in stop().
**Fix**: Loop all timer names, clearTimeout + null each in stop().

### 1.4 SoloLevelingToasts: Event Listener Leak on Toast DOM
**File**: `SoloLevelingToasts.plugin.js` ~L1268-1275, L1389
**Problem**: Click handler added on toast, but removeToast() uses `.remove()` without removeEventListener.
**Fix**: Store handler ref on element, removeEventListener before .remove().

### 1.5 CriticalHit: Untracked RAF/Idle Callbacks
**File**: `CriticalHit.plugin.js` ~L3784, L4862
**Problem**: requestIdleCallback and RAF not tracked. Fire after stop().
**Fix**: Track IDs in Sets, cancelAnimationFrame/cancelIdleCallback all in stop().

### 1.6 SoloLevelingStats: Retry Timeout Accumulation
**File**: `SoloLevelingStats.plugin.js` ~L3162, L3355, L3989, L9236, L9249
**Problem**: Multiple retry timeouts set without clearing previous ones.
**Fix**: Always clearTimeout(this._xyzRetryTimeout) before setting new one.

---

## Phase 2: CRITICAL — Performance Killers (Day 1-2)

### 2.1 CSSPicker: DOM Query Explosion on Mousemove
**File**: `CSSPicker.plugin.js` ~L569-645
**Problem**: findMatchingCssRules iterates ALL stylesheets per element per mousemove. 100+ DOM queries per hover frame.
**Fix**: Cache stylesheet rules on activation, debounce to 100ms, limit to 500 rules, skip CORS sheets.

### 2.2 CriticalHit: Per-Message CSS Full Rebuild
**File**: `CriticalHit.plugin.js` ~L2808-2841, L2874-2896
**Problem**: Every crit does removeStyle + addStyle with ALL rules joined. O(n) rebuilds.
**Fix**: Per-message style IDs — addStyle once per message, track in Set, cleanup all in stop().

### 2.3 SoloLevelingStats: 1-Second Polling Intervals
**File**: `SoloLevelingStats.plugin.js` ~L5446, L5621
**Problem**: Activity + channel tracking both poll at 1s.
**Fix**: Increase both to 5000ms.

### 2.4 RulersAuthority: CSS Rebuilt on Every Panel Change
**File**: `RulersAuthority.plugin.js` ~L1620, L2117
**Problem**: buildCSS() called on every push/pull/resize.
**Fix**: Cache built CSS, key by panel state. Only rebuild when state changes. Better: CSS custom properties for dynamic values.

### 2.5 ShadowSenses: Webpack Filter Fix
**File**: `ShadowSenses.plugin.js` ~L2709
**Problem**: `m?.dispatch && m?.subscribe` — optional chaining breaks BdApi.
**Fix**: Use `Webpack.Stores?.UserStore?._dispatcher` pattern (no optional chaining in filter fns).

---

## Phase 3: HIGH — CSS Deconfliction (Day 2-3)

### 3.1 HSLDockAutoHide: !important Reduction
~50 !important rules + global body classes. Scope under single body attribute, replace !important with higher specificity.

### 3.2 CriticalHit: !important Reduction
30+ !important per crit rule. Use scoped `[data-crit-id]` attribute selectors instead.

### 3.3 UserPanelDockMover: Decouple from HSLDockAutoHide
Monkey-patches HSLDockAutoHide.isPointerOnDockHitTarget() directly. Replace with proper API (registerHitTestExtension).

---

## Phase 4: HIGH — Observer Consolidation (Day 3-4)

### 4.1 Narrow MutationObserver Targets

| Plugin | Current | Recommended |
|--------|---------|-------------|
| SoloLevelingStats | msg container + subtree | msg container, childList only |
| CriticalHit | msg container + subtree | msg list ol, childList only |
| ShadowExchange | app-mount + subtree | channel header toolbar |
| ShadowRecon | app-mount + subtree | guild list sidebar |
| RulersAuthority | DM list + subtree | DM list, childList only |

### 4.2 CriticalHit: Eliminate Double RAF
Double `requestAnimationFrame` wrapping = 32ms delay per message. Use single RAF.

---

## Phase 5: MODERATE — Performance Tuning (Day 4-5)

### 5.1 ShadowSenses: O(n*m) Purge → Binary Search
Two separate O(n*m) passes every 10min. Use binary search (feeds are chronological).

### 5.2 ShadowSenses: Cache _getMembersWrap()
querySelectorAll + offsetParent on every widget reinject. Cache result, invalidate on guild change.

### 5.3 LevelProgressBar: Throttle RAF Updates
Every frame (16ms). Throttle to every 3rd frame (50ms).

### 5.4 TitleManager: Fix O(n^2) Sort
getTitleBonus() called per comparison. Pre-cache bonuses in Map before sort.

### 5.5 ShadowRecon: Reduce Guild Icon Refresh
4s interval too aggressive. Change to 15s or event-driven.

### 5.6 SkillTree: Memoize CSS for Modal
CSS rebuilt on every modal open. Build once, cache.

### 5.7 Dungeons: Gate console.log Behind Debug
Direct console.log bypasses debug check in 3+ places.

### 5.8 useMemo Dependency Fixes
ShadowStep + TitleManager use `.length` instead of array reference.

### 5.9 Use BdApi.Patcher for window.fetch/history
Dungeons (fetch), SoloLevelingStats + CriticalHit (history) — manual monkey-patch.

---

## Implementation Priority

| # | Fix | Plugin(s) | Impact | Time |
|---|-----|-----------|--------|------|
| 1 | history.pushState restore | SkillTree | CRITICAL | 5m |
| 2 | Activity listener cleanup | SoloLevelingStats | CRITICAL | 10m |
| 3 | Hover timer cleanup | RulersAuthority | CRITICAL | 5m |
| 4 | Toast event listener cleanup | SoloLevelingToasts | CRITICAL | 10m |
| 5 | Webpack filter fix | ShadowSenses | CRITICAL | 5m |
| 6 | Cache stylesheet rules | CSSPicker | CRIT PERF | 30m |
| 7 | Per-message CSS dedup | CriticalHit | HIGH PERF | 45m |
| 8 | Track RAF/idle callbacks | CriticalHit | HIGH | 20m |
| 9 | Increase poll intervals | SoloLevelingStats | HIGH PERF | 5m |
| 10 | CSS caching | RulersAuthority | HIGH PERF | 30m |
| 11 | Narrow observer targets | Multiple | HIGH PERF | 60m |
| 12 | Eliminate double RAF | CriticalHit | HIGH PERF | 15m |
| 13 | Retry timeout guards | SoloLevelingStats | HIGH | 15m |
| 14 | !important reduction | HSLDockAutoHide | MEDIUM | 60m |
| 15 | Decouple dock mover | UserPanelDockMover | MEDIUM | 45m |
| 16 | Purge optimization | ShadowSenses | MEDIUM | 20m |
| 17 | Cache getMembersWrap | ShadowSenses | MEDIUM | 10m |
| 18 | Sort optimization | TitleManager | MEDIUM | 10m |
| 19 | Reduce refresh interval | ShadowRecon | MEDIUM | 5m |
| 20 | Memoize modal CSS | SkillTree | MEDIUM | 15m |
| 21 | Throttle RAF | LevelProgressBar | MEDIUM | 10m |
| 22 | Debug-gate console.log | Multiple | LOW | 30m |
| 23 | BdApi.Patcher for patches | Multiple | LOW | 30m |
| 24 | useMemo dep fixes | ShadowStep, TitleManager | LOW | 10m |
| 25 | Data versioning | SoloLevelingStats | LOW | 20m |

**Total estimated effort**: ~9-10 hours across all phases
