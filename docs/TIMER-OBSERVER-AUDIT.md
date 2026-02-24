# BetterDiscord Plugin Timer & Observer Audit

**Date**: 2026-02-24 (Post-optimization pass)
**Branch**: `feat/system-window-plugin`
**Scope**: All 20 active plugin files
**Previous work**: `17a6839` — 40+ perf fixes across 16 files

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **setInterval** calls | 38 |
| **MutationObserver** instances | 16 |
| **requestAnimationFrame** uses | ~22 |
| **Event listeners** (Dispatcher + DOM) | ~50+ |
| **Plugins with zero timers** | 3 (TitleManager, ShadowStep, CSSPicker) |

### Timer Fire Rate

| Scenario | Fires/sec | Notes |
|----------|-----------|-------|
| Peak (combat + quest celebration) | ~12.5 | 500ms combat loops active |
| Normal (browsing channels) | ~5 | Most fast timers inactive |
| Background (tab hidden) | ~3-4 | Hidden gates suppress ~70% |
| Pre-optimization (old code) | ~25-30 | No hidden gates, faster intervals |

---

## Per-Plugin Breakdown

### 1. ChatNavArrows.plugin.js

#### setInterval (2)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 286 | 2000ms | YES | start() DOM fallback | Polls for scroller when React patcher unavailable |
| 366 | 2000ms | NO | React useEffect | Polls for scroller changes / channel switches |

#### requestAnimationFrame (2)
- Arrow click handler: hides native jump bar (2 code paths)

#### Event Listeners
- `scroll` on scroller (2 code paths)

---

### 2. CriticalHit.plugin.js

#### setInterval (2)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 331 | variable | NO | `_setTrackedInterval()` | Generic tracked interval wrapper |
| 7018 | 5000ms | NO | React useEffect (settings) | Refreshes stats in settings panel |

#### setTimeout (3)
- `_setTrackedTimeout()` utility (variable)
- `scheduleIdleProcessing()` fallback (16ms)
- `saveSettings()` debounce (300ms)

#### MutationObserver (4) ⚠️ HIGHEST COUNT

| Line | Config | Context | Description |
|------|--------|---------|-------------|
| 2654 | childList+subtree | `startRestoreObserver()` | Watches messages for crit restoration |
| 3444 | childList+subtree | `_setupChannelLoadObserver()` | Detects message load in channel |
| 3465 | childList+subtree | `setupMessageObserver()` | Main: processes new messages for crit styling |
| 4777 | childList+subtree+attributes | Per-message restoration | Watches individual messages for React re-renders stripping CSS |

#### requestAnimationFrame (8)
- Combo animation, CSS rebuild, channel switch restore, message processing, crit class verification

#### Event Listeners
- Dispatcher: `MESSAGE_CREATE`, `CHANNEL_SELECT`
- `popstate`, `pushState`/`replaceState` wrappers

---

### 3. CSSPicker.plugin.js

- **Zero timers/intervals**
- 1 requestAnimationFrame (hover highlight throttle)
- Event listeners: `mousemove`, `click`, `keydown`

---

### 4. Dungeons.plugin.js ⚠️ MOST INTERVALS

#### setInterval (10)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 1379 | 1000ms | NO | `_ensureCombatLoop()` | Combat damage tick |
| 1417 | 500ms | NO | `_ensureMobSpawnLoop()` | Mob spawn loop |
| 1947 | 300000ms (5min) | NO | `start()` | GC expired dungeon data |
| 3456 | 3000ms | NO | `startMessageObserver()` | Check if msg container replaced |
| 6615 | 3000ms | NO | `startRegeneration()` | HP/Mana regen tick |
| 12802 | variable | NO | `startHPBarRestoreInterval()` | Restore HP bars stripped by React |
| 13662 | 15000ms | NO | `startChannelWatcher()` | Fallback channel change poll |
| 13720 | variable | NO | `addMobKillListener()` | Mob kill processing |
| 13771 | 60000ms (1min) | NO | `startDungeonCleanupLoop()` | Clean expired dungeons |
| (10th) | variable | NO | HP bar restore | Additional HP bar interval |

**Note**: Has own `_isWindowVisible` via `visibilitychange` event but does NOT inline `document.hidden` gates on intervals.

#### setTimeout (4)
- `queueMobs()` debounce, `_setTrackedTimeout()`, batch yield (1ms), `saveSettings()` debounce

#### MutationObserver (1)
- Message container (childList+subtree, HAS hidden gate)

#### requestAnimationFrame (3)
- Boss bar layout, HP bar update queue, HP bar continuation

#### Event Listeners
- `visibilitychange`, `popstate`, `pushState`/`replaceState` wrappers
- Dispatcher: `CHANNEL_SELECT`

---

### 5. HSLDockAutoHide.plugin.js

#### setInterval (1)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 194 | 1500ms | YES | `start()` | Dock show/hide state sync |

#### setTimeout (3)
- Hide timer (variable), reveal timer (variable), fallback mount (3000ms)

#### requestAnimationFrame (2)
- Rail follow animation loop

#### Event Listeners
- `mousemove`, `keydown`/`keyup`, `visibilitychange`

---

### 6. HSLWheelBridge.plugin.js

#### setInterval (1)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 137 | 2000ms | NO | `start()` fallback | Polls for scroller changes |

#### setTimeout (1)
- Fallback mount (3000ms)

#### Event Listeners
- `wheel` on scroller (passive: false)

---

### 7. LevelProgressBar.plugin.js

#### setInterval (2)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 1553 | variable | YES | `startReconUpdates()` | Recon intel text updates |
| 1882 | 5000ms | NO | `startProgressBarUpdates()` | Fallback progress bar polling |

#### setTimeout (1)
- `_setTrackedTimeout()` utility

#### requestAnimationFrame (1)
- Batched progress bar DOM updates

#### Event Listeners
- Dispatcher: `CHANNEL_SELECT`, `MESSAGE_CREATE`
- `visibilitychange`

---

### 8. RulersAuthority.plugin.js

#### setInterval (0)
None.

#### setTimeout (12)
- Guild change handler, sidebar/members/profile/channel reveal/hide timers (8 total)
- Drag transition restore, icon reinject debounce (140ms), push/pull animation cleanup

#### MutationObserver (4) ⚠️ TIED HIGHEST

| Line | Config | Context | Description |
|------|--------|---------|-------------|
| 1102 | childList+subtree | `setupDMGripping()` | Watches DM list |
| 1339 | childList+subtree | `startToolbarObserver()` | Watches toolbar for icon reinject |
| 2064 | childList+subtree | `setupChannelObserver()` | Watches channel list for truncation |
| 2083 | childList+subtree | `setupSettingsGuard()` | Watches for settings modal |

#### Event Listeners
- `mousemove` (hover zones), `mousedown`/`mouseup`/`pointerdown`/`pointerup` (drag)
- `resize`, Dispatcher: `CHANNEL_SELECT`

---

### 9. ShadowArmy.plugin.js

#### setInterval (4)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 2631 | 3600000ms (1hr) | NO | `start()` | Shadow compression |
| 2644 | 30000ms (30s) | YES | `start()` | Widget refresh (dirty-flag gated) |
| 3273 | 3000ms | YES | `setupMemberListWatcher()` | Health check: observer root in DOM |
| 11067 | 60000ms (60s) | YES | React modal useEffect | Modal auto-refresh |

#### setTimeout (18+)
- Batch yields, startup delays, retry logic, debounced save, ARISE queue drain, widget refresh

#### MutationObserver (1)
- Member list (childList+subtree, hidden gate in callback)

#### Event Listeners
- Dispatcher: `MESSAGE_CREATE`, `CHANNEL_SELECT`
- `visibilitychange`

---

### 10. ShadowExchange.plugin.js

#### setInterval (0)
None.

#### setTimeout (3)
- Deferred save (500ms), `saveSettings()` debounce (500ms), swirl icon reinject (140ms)

#### MutationObserver (1)
- Toolbar area (childList+subtree)

#### Event Listeners
- `resize`, Dispatcher: `MESSAGE_CREATE`

---

### 11. ShadowRecon.plugin.js

#### setInterval (1)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 497 | 15000ms | NO | `startRefreshLoops()` | Refresh guild visual hints |

#### MutationObserver (1)
- Layout container (childList+subtree, 500ms throttle)

---

### 12. ShadowSenses.plugin.js

#### setInterval (4)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 431 | 30000ms (30s) | NO (dirty-flag) | SensesEngine | Flush dirty feed to disk |
| 437 | 600000ms (10min) | NO | SensesEngine | Purge old entries |
| 2266 | 2000ms | YES | React FeedTab | Feed version poll |
| 2443 | 3000ms | YES | React SensesWidget | Widget dirty-flag poll |

#### setTimeout (5-6)
- Toast dismiss/emit debounces, auto-dismiss (5.2s), dispatcher retry (500ms recurring), widget reinject

#### MutationObserver (1)
- Layout container (childList+subtree, 500ms throttle)

#### requestAnimationFrame (1)
- Toast CSS transition

#### Event Listeners
- Dispatcher: `MESSAGE_CREATE`, `PRESENCE_UPDATES`, `GUILD_MEMBER_ADD`, `CHANNEL_SELECT`, `VOICE_STATE_UPDATES`, `TYPING_START`
- `visibilitychange`

---

### 13. ShadowStep.plugin.js

- 1 setTimeout (50ms focus input)
- Zero intervals, zero observers

---

### 14. SkillTree.plugin.js

#### setInterval (2)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 977 | 15000ms | NO | `startLevelPolling()` | Fallback level change check |
| 1526 | 30000ms | YES | `startManaRegen()` | Mana regen tick |

#### setTimeout (2)
- `_setTrackedTimeout()` utility, skill duration timer (deactivate after N seconds)

#### Event Listeners
- `visibilitychange`, `focus`

---

### 15. SoloLevelingStats.plugin.js ⚠️ MOST COMPLEX

#### setInterval (7)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 3881 | 5000ms | YES | `start()` | Shadow power update |
| 3888 | 30000ms | NO (dirty-flag) | `start()` | Periodic backup save |
| 5408 | variable | NO | `startActivityTracking()` | Track active time |
| 5585 | 3000ms | NO | `startChannelTracking()` | URL change fallback poll |
| 7425 | 500ms | NO | Quest celebration | Progress bar updates (self-clears) |
| 9077 | 2000ms | YES | `ensureChatUIUpdateInterval()` | Chat UI refresh |
| 9166 | 1000ms | NO | `createChatUI()` | Retry creation (self-clears after 10s) |

#### setTimeout (20+)
- Throttle/debounce utilities, React injection, message processing retries, save debounces, animation cleanup, channel tracking pushState wrappers

#### MutationObserver (3)

| Line | Config | Context | Description |
|------|--------|---------|-------------|
| 2989 | childList+subtree | `startObserving()` | Watches messages for XP counting |
| 5379 | childList+subtree | `setupShadowPowerTracking()` | Shadow army widget changes |
| 9189 | childList+subtree | `createChatUI()` | Chat container reinject (has hidden gate) |

#### Event Listeners
- `visibilitychange`, `popstate`, `pushState`/`replaceState` wrappers
- `keydown` (Enter), `paste`
- Dispatcher: `MESSAGE_CREATE`, `CHANNEL_SELECT`

---

### 16. SoloLevelingToasts.plugin.js

- Zero intervals
- 1 `_setTrackedTimeout()` utility (toast fade/dismiss)
- 3 requestAnimationFrame (toast display, DOM insertion, particle creation)

---

### 17. Stealth.plugin.js

#### setInterval (1)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 485 | 15000ms | NO (settings gate) | `_startStatusMaintain()` | Ensure invisible status stays set |

---

### 18. SystemWindow.plugin.js

#### setInterval (1)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 92 | 10000ms | YES | `start()` | Safety-net fallback for channel detection |

#### setTimeout (2)
- Retry finding scroller (2000ms), throttled classify

#### MutationObserver (1)
- Message scroller (childList ONLY — no subtree)

#### Event Listeners
- `pushState`/`replaceState` wrappers, `popstate`

---

### 19. TitleManager.plugin.js

- **Zero timers, zero intervals, zero observers**
- 1 event listener: `visibilitychange`

---

### 20. UserPanelDockMover.plugin.js

#### setInterval (2)

| Line | Interval | Hidden Gate | Context | Description |
|------|----------|-------------|---------|-------------|
| 47 | 900ms | NO | `start()` | Fast poll to find user panel (initial) |
| 298 | 10000ms | NO | `trySetup()` | Slowed poll after successful setup |

---

## Support Files

### SoloLevelingUtils.js
- 2 setTimeout (post-mount callback 0ms, `_setTrackedTimeout()` utility)

### BetterDiscordPluginUtils.js
- 1 setTimeout (throttle implementation)

### ShadowPortalCore.js
- 6 setTimeout (debounce, navigate retry with backoff, RAF fallback, transition delays, canvas draw, worker termination)
- 2 requestAnimationFrame (canvas animation start, draw loop)

---

## Hidden Gate Coverage

### Gated (skip when tab hidden) ✅

| Plugin | Gated / Total Intervals |
|--------|------------------------|
| HSLDockAutoHide | 1/1 |
| SystemWindow | 1/1 |
| ShadowArmy | 3/4 |
| ShadowSenses | 2/4 (other 2 are dirty-flag/long-interval) |
| SoloLevelingStats | 2/7 |
| LevelProgressBar | 1/2 |
| SkillTree | 1/2 |
| ChatNavArrows | 1/2 |

### Ungated ❌

| Plugin | Ungated Intervals | Notes |
|--------|-------------------|-------|
| Dungeons | 10/10 | Has own `_isWindowVisible` but doesn't gate intervals |
| CriticalHit | 2/2 | Settings panel only (acceptable) |
| HSLWheelBridge | 1/1 | 2s poll, no gate |
| ShadowRecon | 1/1 | 15s, no gate |
| Stealth | 1/1 | 15s, intentional (must maintain status) |
| UserPanelDockMover | 2/2 | 900ms→10s (fast clears itself) |
| SoloLevelingStats | 5/7 | Channel poll, activity, quest celebration, retry |

---

## MutationObserver Heat Map

| Plugin | Count | All subtree? | Target Scope |
|--------|-------|-------------|--------------|
| **CriticalHit** | **4** | Yes (1 has attributes too) | Message container ×3, per-message |
| **RulersAuthority** | **4** | Yes | DM list, toolbar, channel list, settings |
| **SoloLevelingStats** | **3** | Yes | Messages, shadow widget, chat container |
| ShadowArmy | 1 | Yes | Member list |
| ShadowRecon | 1 | Yes (throttled) | Layout container |
| ShadowSenses | 1 | Yes (throttled) | Layout container |
| ShadowExchange | 1 | Yes | Toolbar |
| SystemWindow | 1 | **No** (childList only) | Scroller |
| Dungeons | 1 | Yes (hidden gated) | Message container |
| **Total** | **16** | | |

---

## Remaining Optimization Candidates

### Tier 1 — Visibility Gates (Low risk, easy wins)

| Plugin | Timer | Current | Proposed |
|--------|-------|---------|----------|
| HSLWheelBridge | 2s scroller poll | No gate | Add `document.hidden` gate |
| ChatNavArrows (React) | 2s scroller poll | No gate | Add `document.hidden` gate |
| ShadowRecon | 15s hint refresh | No gate | Add `document.hidden` gate |
| SkillTree | 15s level poll | No gate | Add `document.hidden` gate |
| LevelProgressBar | 5s progress fallback | No gate | Add `document.hidden` gate |
| SoloLevelingStats | 3s channel poll | No gate | Add `document.hidden` gate |

### Tier 2 — Dungeons Visibility Unification (Medium risk)

Dungeons already tracks `_isWindowVisible` but doesn't use it to gate intervals. Could add `if (!this._isWindowVisible) return;` to:
- 3s message container health check
- 3s HP/Mana regen
- 15s channel watcher
- 1min cleanup loop
- 5min GC

Combat loops (500ms, 1s) should NOT be gated — active combat needs real-time ticks.

### Tier 3 — MutationObserver Consolidation (Higher risk)

**CriticalHit**: 4 observers → could consolidate to 2:
- Merge `startRestoreObserver` + `setupMessageObserver` (both watch same container for childList+subtree)
- Keep `_setupChannelLoadObserver` separate (different lifecycle)
- Per-message observers (line 4777) are inherently per-element — harder to consolidate

**RulersAuthority**: 4 observers are on different targets — consolidation not practical without architectural change.

### Tier 4 — Interval Elimination (Requires refactoring)

| Plugin | Current | Proposed |
|--------|---------|----------|
| SoloLevelingStats channel poll (3s) | setInterval | Already has pushState hooks — could remove interval entirely, keep as 30s safety net |
| HSLWheelBridge scroller poll (2s) | setInterval | Could use MutationObserver on parent or React patcher event |
| ChatNavArrows React poll (2s) | setInterval in useEffect | Could use React state change or MutationObserver callback |
