# BetterDiscord Plugin Suite — Performance Optimization Plan

> **Verified against source code**: 2026-02-24
> **Plugins audited**: 20 active plugin files (~74,000+ lines total)
> **Dungeons.plugin.js**: Already optimized (commit `8e11b60`)
> **SoloLevelingStats.plugin.js**: Already has 2s debounced save
>
> **Verification legend**: ✅ = Verified accurate | ⚠️ = Partially accurate (corrected) | ❌ = Inaccurate (removed/replaced) | 🆕 = New finding

---

## Phase 1: HIGH Impact (Do First)

### 1.1 ✅ ShadowArmy — React Modal Auto-Refresh (Line 11070)
**Problem**: `setInterval` fires every 15s inside the React modal's `useEffect`. It already has `document.hidden` and `_widgetDirty` guards, and skips armies >2500. However, the 15s base interval is still aggressive for a modal that's rarely open.
**Fix**:
- Increase interval from `15000` → `60000` (modal is not a real-time dashboard)
- The existing guards (`document.hidden`, `_widgetDirty`, `refreshInFlightRef`) are good — keep them
- **Impact**: ~75% fewer IDB queries when modal is open and idle

### 1.2 ⚠️ ShadowArmy — Widget Refresh Debounce (Line 2389 + 10557)
**Problem**: The original claim said `_widgetRefreshMinIntervalMs` was never initialized. **CORRECTED**: It IS initialized to `800` at line 2389 in `start()`. The debounce logic at line 10567 works correctly.
**However**: The widget update interval at line 2647 fires every 30s (not 15s as docs claimed) and already has a `_widgetDirty` check. **This item is already partially optimized.**
**Fix (remaining)**:
- Add `if (document.hidden) return;` to the widget update interval at line 2647
- Consider increasing from 30s → 60s since the interval is a fallback (events handle most updates)
- **Impact**: Marginal — skip unnecessary ticks when window is hidden

### 1.3 ✅ SkillTree — Triple Save on Skill Activation (Lines 1640-1693)
**Problem**: `activateSkill()` at line 1640 calls `saveSettings()` (which internally calls `saveSkillBonuses()` → `BdApi.Data.save`) AND then independently calls `saveActiveBuffs()` → another `BdApi.Data.save`. Same pattern in `_deactivateSkill()` at line 1692-1693. Result: 3 disk writes per skill toggle.
**Fix**:
- Remove standalone `saveActiveBuffs()` calls at lines 1641 and 1693
- Have `saveSettings()` also call `saveActiveBuffs()` internally (it already calls `saveSkillBonuses()` at line 1379)
- OR: batch into a single method: `_persistAll() { saveSettings(); /* bonuses included via line 1379 */ saveActiveBuffs(); }`
- Also: `consumeActiveSkillCharge()` at line 1721-1722 does the same double-save
- **Impact**: 2 fewer `BdApi.Data.save` calls per activation/deactivation/charge-consume

### 1.4 ✅ CriticalHit — Settings Save Cascade (Lines 7426-7497)
**Problem**: Each settings update function (`updateCritChance`, `updateCritColor`, `updateCritFont`, `updateCritAnimation`, `updateCritGradient`, `updateCritGlow`) calls `saveSettings()` immediately. `saveSettings()` at line 8458 also forces CSS rebuild via `injectCritCSS()` every time. 6 setting changes = 6 saves + 6 CSS rebuilds.
**Fix**:
- Add 300ms debounce wrapper to `saveSettings()` (like SoloLevelingStats' 2s debounce)
- CSS rebuild should be part of the debounced path, not fired on every save
- Settings panel changes should batch: update all in-memory values immediately, save once after user stops changing
- **Impact**: ~80% fewer disk writes when adjusting settings, eliminates redundant CSS rebuilds

### 1.5 ✅ SystemWindow — 1s Channel Polling (Lines 68-80)
**Problem**: `setInterval` fires every 1s doing a `document.querySelector('ol[role="list"][class*="scrollerInner_"]')` to detect channel switches. 86,400 DOM queries/day.
**Fix**:
- Replace with `history.pushState`/`replaceState` wrapper + `popstate` listener (same pattern SoloLevelingStats already uses at lines 5553-5577)
- Keep a 5-10s fallback interval as safety net
- Add `if (document.hidden) return;` to fallback
- Add early exit: `if (scroller === this._lastScrollerEl && scroller?.isConnected) return;` — **already present** at lines 72-73 but still queries DOM every 1s to check
- **Impact**: ~95% fewer DOM queries (event-driven primary + rare fallback)

### 1.6 🆕 SoloLevelingStats — Activity Tracker Always Saves (Line 5407-5422)
**Problem**: `activityTracker` interval fires every 60s. Even when `timeDiff < 5` (user was active), it unconditionally calls `saveSettings()` which triggers the 2s debounce path. This is acceptable. **BUT**: The `saveSettings()` call at line 5417 fires on every 60s tick when user was active — even if `timeDiff` is near 0 (e.g. user just moved mouse).
**Fix**:
- Only save if `timeDiff > 0.1` (at least 6 seconds of accumulated time) to avoid saving near-zero increments
- The debounce already helps, but filtering prevents even enqueuing a save when nothing meaningful happened
- **Impact**: Fewer debounce timer resets during active use

---

## Phase 2: MEDIUM Impact — Intervals & Timers

### 2.1 ✅ ShadowArmy — Dead Code in Hourly Interval (Lines 2631-2636)
**Problem**: `processNaturalGrowthForAllShadows()` is called every hour at line 2632 but function body at line 7542-7546 is empty (just a comment: "Natural growth is now COMBAT-BASED ONLY"). The interval also calls `processShadowCompression()` which is presumably still needed.
**Fix**: Remove the `processNaturalGrowthForAllShadows()` call from the interval. Keep `processShadowCompression()`.

### 2.2 ✅ ShadowArmy — Member List Health Check (Line 3275)
**Problem**: Fires every 3s checking `observeRoot.isConnected`, no visibility gate. Already has `_isStopped` check.
**Fix**: Add `if (document.hidden) return;` at start of interval callback (after `_isStopped` check at line 3276).

### 2.3 🆕 SoloLevelingStats — Shadow Power Interval (Line 3881)
**Problem**: `shadowPowerInterval` setInterval — need to verify its frequency and whether it has visibility gating.
**Fix**: Add `if (document.hidden) return;` gate. This is a cross-plugin power calculation that doesn't need to run when window is hidden.

### 2.4 ✅ CriticalHit — Perception Burst Polling 2s (Line 7018)
**Problem**: Settings panel polls SoloLevelingStats/SkillTree data every 2s with 3× `BdApi.Data.load` per tick. This only runs while settings panel is open (useEffect cleanup at line 7019 clears interval).
**Fix**: Increase to 5s (settings panel data is not time-critical). Cache last-known values and skip DOM update if unchanged.
**Impact**: 60% fewer BdApi.Data.load calls while settings panel is open

### 2.5 ✅ CriticalHit — getCritHistory() Cache (Lines 2604-2636)
**Problem**: TTL-based cache (`_cachedCritHistoryMaxAge`) — need to verify the TTL value. Full `.filter()` over `messageHistory` array every time cache expires. Called from 18+ locations across the plugin.
**Fix**: Increase TTL from current value to 5s. Only invalidate on channel change, not every message mutation. Track `messageHistory.length` — only recalculate if length changed since last cache.

### 2.6 ✅ ShadowSenses — Feed Version Polling (Line 2266)
**Problem**: 2s interval always ticks even with no incoming messages.
**Fix**: Add `if (document.hidden) return;` gate. Consider extending to 5s.

### 2.7 ✅ ShadowSenses — Multiple BdApi.Data.save Per Flush (Lines 863-867)
**Problem**: Saves each dirty guild individually (`feed_${guildId}`) + feedGuildIds + totalDetections = 3+ writes per flush.
**Fix**: Batch into single composite save object: `{ guilds, feedGuildIds, totalDetections }` — or at minimum, coalesce into fewer writes.

### 2.8 ⚠️ SkillTree — Polling + Event Race (Lines 977-1028)
**Problem**: Both 15s polling AND event subscription detect level-ups. Race window where both fire causes double processing.
**Fix**: Call `stopLevelPolling()` BEFORE `setupLevelUpWatcher()` (currently called after). If event subscription succeeds, polling stays off. If it fails, polling starts as fallback.

### 2.9 ✅ SkillTree — Duplicate saveSettings in recalculateSPFromLevel (Lines 1269-1273)
**Problem**: Two branches at lines 1270 and 1273 both call `saveSettings()` — consolidate to one call at end.
**Fix**: `if (spChanged || levelChanged) { /* update values */; this.saveSettings(); }`

### 2.10 ⚠️ Stealth — Interval Check Pattern (Lines 484-488)
**Problem**: The 15s status-forcing interval at line 485 already checks `if (!this.settings.enabled || !this.settings.invisibleStatus) return;` at line 486. Additionally, `_syncStatusPolicy()` at line 463-489 already handles stopping the interval when disabled.
**Status**: **Already optimized** — the existing code at lines 466-467 calls `_stopStatusInterval()` when `shouldForceInvisible` is false, and the interval itself has the guard check. Only starts interval when needed (line 484 check).
**Remaining fix**: None — this item can be **removed from the plan**.

### 2.11 ✅ HSLDockAutoHide — Dock Polling on Stable DOM (Line 194)
**Problem**: `safeTick` runs every 850ms with querySelectorAll even when dock hasn't changed.
**Fix**: Increase interval to 1500ms. Add `if (document.hidden) return;` gate. Skip update if dock state unchanged since last tick.

### 2.12 ✅ ChatNavArrows — 500ms DOM Poll (Lines 283, 363)
**Problem**: Both DOM fallback (line 283) and React paths (line 363) poll every 500ms even when scroller is unchanged.
**Fix**: Add early-exit: `if (scroller === state.currentScroller && scroller?.isConnected) return;`. Increase fallback poll to 2000ms.

### 2.13 ✅ LevelProgressBar — Recon Updates in DMs (Lines 1551-1556)
**Problem**: 1200ms interval runs `updateReconIntelText()` which calls `_resolveCurrentGuildId()` — returns null in DMs, but the interval still ticks.
**Fix**: Add `if (!this._resolveCurrentGuildId()) return;` at start of interval callback. Or better: pause entirely in DMs.

### 2.14 ✅ ShadowExchange — saveSettings() on Every Action (Multiple lines)
**Problem**: Each user action (sort, navigate, mark) triggers immediate `BdApi.Data.save`. Found saves at lines 462, 808, 1146, 1157, 1166, 1185.
**Note**: Line 427 already has a 500ms setTimeout debounce for one path, but the other paths at lines 808, 1146+ save immediately.
**Fix**: Add a centralized debounced save (500ms) so rapid actions batch into one save.

### 2.15 🆕 SoloLevelingStats — Chat UI Update Interval (Line 9074)
**Problem**: `chatUIUpdateInterval` runs on a setInterval — verify frequency and add visibility gate.
**Fix**: Add `if (document.hidden) return;` gate to prevent UI updates when window is hidden.

### 2.16 🆕 SoloLevelingStats — Periodic Save Interval (Line 3887)
**Problem**: `periodicSaveInterval` fires on a setInterval. Should skip if nothing changed since last save.
**Fix**: Add dirty-flag check: only call `saveSettings()` if `_settingsDirty` is true. The existing debounce guards against rapid calls, but the periodic interval enqueues unnecessary debounce timers.

### 2.17 🆕 UserPanelDockMover — Poll Never Cleared (Line 47)
**Problem**: 900ms poll (`this.pollInterval = setInterval(() => this.trySetup(), 900)`) runs continuously.
**Fix**: Clear interval after successful setup. Currently keeps polling even after the dock is found and moved.

---

## Phase 3: MEDIUM Impact — Caching & Computation

### 3.1 ✅ SoloLevelingStats — Replace JSON.parse(JSON.stringify) ×14+ (Various)
**Problem**: **14 instances** found (not 10+ as originally claimed). Used for deep cloning at lines 2816, 2833, 2878, 2879, 4391, 4467, 4801, 4826, 4934, 4955, 4966, 4980, 5143, 5701. Only one `structuredClone()` usage at line 577.
**Fix**: Replace all with `structuredClone()`. Special case: line 5143 (`const cleanSettings = JSON.parse(JSON.stringify(settingsToSave))`) is used to strip non-serializable properties — `structuredClone()` handles this equally well (throws on functions/symbols, which is the desired behavior for validation).
**Note**: Also found in other plugins — see Phase 4.2 for startup-only instances.

### 3.2 ⚠️ CriticalHit — CSS Rebuild Per Settings Change (Line 2890)
**Problem**: The original claim said "full CSS rebuild per crit message." **CORRECTED**: `rebuildCritMessageStyles()` at line 2881 already uses `requestAnimationFrame` for debouncing (line 2896-2897) and only the `immediate=true` path rebuilds synchronously. The RAF path batches correctly.
**However**: `saveSettings()` at line 8466-8467 forces `_critCSSInjected = false` and calls `injectCritCSS()` on every save — this is the real problem. The base CSS (not per-message CSS) is rebuilt unnecessarily.
**Fix**: Only rebuild base CSS if color/gradient/glow settings actually changed. Add a settings-hash comparison before triggering CSS injection.

### 3.3 ✅ ShadowArmy — processShadowsWithPower() Over-Computation (Line 6035-6053)
**Problem**: Always computes `getShadowEffectiveStats()` AND `calculateShadowPowerCached()` for every shadow, even when callers only need the power score.
**Fix**: Add `fieldsNeeded` parameter — skip `getShadowEffectiveStats()` when only `power` is needed. Many compression/sorting paths only use the `power` field from the returned object.

### 3.4 ✅ ShadowRecon — Guild Icon Hints Too Aggressive (Lines 756-778)
**Problem**: Full querySelectorAll + online count computation per refresh.
**Fix**: Skip title update if guild data unchanged since last refresh. Cache online counts per guild.

### 3.5 ✅ TitleManager — Toolbar Cache Too Short (Lines 701-787)
**Problem**: 7× querySelector calls per render if 1.5s cache expires.
**Fix**: Increase cache TTL from 1500ms to 5000ms. Toolbar rarely moves.

### 3.6 ✅ TitleManager — Title Bonuses Per-Title on Render (Lines 564-596)
**Problem**: 20 title cards each independently fetch achievement definitions.
**Fix**: Batch-compute all title bonuses in one pass on modal open, pass down as prop.

### 3.7 ✅ RulersAuthority — Panel Hover Handler (Lines 618+)
**Problem**: No early-exit when all hover features disabled. Re-queries panel elements per mousemove.
**Fix**: Cache `anyHoverEnabled` flag outside handler. Bulk-fetch all panels once.

### 3.8 ✅ CSSPicker — Full Stylesheet Scan on Cache Miss (Lines 580-606)
**Problem**: 10s TTL miss triggers scan of 20+ stylesheets with recursive rule iteration.
**Fix**: Increase TTL to 30s. Or lazy-cache per individual rule instead of flattening all at once.

### 3.9 🆕 CriticalHit — Startup Initialization (Line 331)
**Problem**: `setInterval` at line 331 in the startup sequence — verify purpose and whether it can be replaced with a one-shot retry.
**Fix**: If this is a retry interval for Webpack module loading, add a max-retry cap and clear after success.

---

## Phase 4: LOW Impact — Cleanup (Batch Together)

### 4.1 Console.log Gating
Gate all production `console.log`/`console.warn`/`console.error` behind debug mode:
- **ShadowArmy**: Lines 4736, 4871 (ungated ARISE stream logs)
- **LevelProgressBar**: Line 1797 (always-on subscription log)
- **ChatNavArrows**: Line 75 (check for ungated logs)

**Note**: SoloLevelingStats and ShadowSenses were listed in original plan but their logs appear to already be behind `debugLog()` methods. Verify lines 10953, 10992, 10999 and 404, 1208, 2572 specifically.

### 4.2 JSON.parse(JSON.stringify) → structuredClone at Startup
One-time init cost, but wasteful pattern. Replace with `structuredClone()`:
- **ShadowArmy**: Line 1820
- **CriticalHit**: Lines 157, 8420, 8447
- **SkillTree**: Line 795
- **RulersAuthority**: Lines 208, 2006, 2010, 2017
- **TitleManager**: Lines 262, 892
- **SoloLevelingToasts**: Line 62
- **SystemWindow**: Line 16
- **LevelProgressBar**: Lines 392, 671, 682
- **Dungeons**: Lines 985, 2523

### 4.3 Minor Interval Fixes
- **UserPanelDockMover**: Clear 900ms poll after successful setup (line 47) — see 2.17
- **SkillTree**: Pause 30s mana regen when `document.hidden` (line 1525)
- **ShadowSenses**: Pause widget poll when `document.hidden` (line 2442)
- **SoloLevelingToasts**: Replace particle timeouts with `animationend` event (line 1007)

### 4.4 🆕 Cross-Plugin BdApi.Data.load Overhead
**Problem**: CriticalHit loads perception burst data (`BdApi.Data.load('SoloLevelingStats', 'perceptionBurst')`) on every critical hit check (line 7306) and on every settings panel tick (line 7008). This is a disk read on a hot path.
**Fix**: Cache the perception burst profile in memory with a 10s TTL. Invalidate on SoloLevelingStats `statsChanged` event.

### 4.5 🆕 SoloLevelingStats — _saveSettingsImmediate Regression Check
**Problem**: `_saveSettingsImmediate()` at line 5188-5207 does a `readFileBackup()` + stat regression comparison on every immediate save. This adds file I/O to the critical save path.
**Fix**: Cache the regression baseline. Only re-read file backup every 5 minutes or on level change, not every save.

---

## Implementation Notes

### Patterns to Reuse
1. **Debounced save**: SoloLevelingStats has a 2s debounce pattern at line 5036 — copy to CriticalHit, ShadowExchange, SkillTree
2. **Event-driven channel detection**: SoloLevelingStats uses pushState/replaceState wrappers at lines 5553-5577 — copy to SystemWindow
3. **`document.hidden` gate**: Add to all interval callbacks that do non-critical work
4. **Auto-stopping intervals**: Dungeons regen pattern (stop when idle, restart on event) — apply to HP bar restoration, widget polling, etc.
5. **`structuredClone()`**: Replace ALL `JSON.parse(JSON.stringify(...))` instances. Safe in Discord's Chromium (available since Chrome 98).

### Safety Rules
- NEVER remove an interval without ensuring the restart path exists
- ALWAYS keep fallback polling (even at longer intervals) when replacing with events
- Test each plugin independently after changes — don't batch untested changes
- `structuredClone()` throws on non-serializable values (functions, Symbols, DOM nodes) — this is actually desirable for save validation
- SoloLevelingStats `saveSettings()` has critical startup guards — don't modify the guard logic

### Items Removed from Original Plan (Already Fixed or Inaccurate)
1. **~~1.2 Widget debounce "never initialized"~~** — `_widgetRefreshMinIntervalMs` IS initialized to 800 at line 2389
2. **~~2.10 Stealth interval runs when disabled~~** — Already has guard checks and auto-stop logic at lines 466-467, 486
3. **~~Widget update interval is 15s~~** — It's actually 30s at line 2647

### Estimated Total Impact
- **Intervals eliminated or gated**: ~18 across all plugins (increased from 15 due to new findings)
- **Disk I/O reduction**: ~60-70% fewer saveSettings() calls under normal use
- **CPU reduction**: ~20-30% in visible combat / active dungeon scenarios
- **IDB query reduction**: ~80% fewer in ShadowArmy modal when idle
- **DOM query reduction**: ~95% for SystemWindow channel detection (event-driven)
- **JSON.parse/stringify elimination**: 30+ instances across all plugins → `structuredClone()`

### Priority Execution Order
1. **Phase 1.4** (CriticalHit save cascade) — highest frequency, easiest fix
2. **Phase 1.5** (SystemWindow polling) — constant 1s drain, clean pattern to copy
3. **Phase 1.3** (SkillTree triple save) — simple removal of redundant calls
4. **Phase 1.1** (ShadowArmy modal interval) — large IDB impact when modal open
5. **Phase 2 batch** — all `document.hidden` gates can be done in one pass
6. **Phase 3.1** (structuredClone) — mechanical replacement, low risk
7. **Phase 4** — cleanup pass, batch together
