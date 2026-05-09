# Phase 5 Performance Optimization Plan

**Reviewer**: Antigravity (Senior Performance Architect)
**Refined by**: Claude Opus (Implementation Lead)
**Date**: 2026-02-24
**Branch**: `feat/system-window-plugin`
**Prerequisite**: Phase 1-4 complete (commit `17a6839`)

---

## Anti-Patterns Identified

### CRITICAL: Competing `history.pushState`/`replaceState` Wrappers (7 plugins)

Seven plugins independently wrap `history.pushState` and `history.replaceState`:
- CriticalHit, Dungeons, SoloLevelingStats, SystemWindow, ShadowArmy, TitleManager, SkillTree

Each captures the "current" method, wraps it, assigns its wrapper. If plugins start/stop in
different orders, or if any plugin fails to restore correctly, the chain breaks silently.
This is the highest-priority architectural issue in the suite.

### HIGH: Overlapping Subtree Observers on Layout Container (3 plugins)

ShadowSenses (line 3001), ShadowRecon (line 532), and RulersAuthority (line 1349) all observe
the same layout container with `{childList: true, subtree: true}`. Every DOM mutation fires
three separate callback invocations.

### HIGH: Duplicate Message Container Observer in SoloLevelingStats

`messageObserver` (line 2989) and `shadowPowerObserver` (line 5379) both observe the message
container with `{childList: true, subtree: true}`. The shadowPowerObserver is redundant — shadow
extraction is already covered by the `shadowExtracted` custom event + 5s polling fallback.

### MEDIUM: RulersAuthority Observes `document.body` with subtree

`setupSettingsGuard` (line 2084) uses `{childList: true, subtree: true}` on document.body.
This fires on literally every DOM mutation in Discord, even with 80ms throttle.

### MEDIUM: Broad Chat Selector in SoloLevelingStats

`document.querySelector('[class*="chat"]')` (line 9203) matches any element with "chat"
anywhere in any class name. Could attach a subtree observer to a container far wider than intended.

---

## Execution Plan (Priority Order)

### Batch 1 — Low-Risk Quick Wins (Ship Immediately)

#### P5-6: Add `document.hidden` gates to remaining ungated intervals

**Risk**: LOW | **Impact**: ~1.4 fewer fires/sec when hidden

| # | Plugin | Line | Interval | Change |
|---|--------|------|----------|--------|
| a | HSLWheelBridge | ~137 | 2s | Add `if (document.hidden) return;` after `_isStopped` check |
| b | ShadowRecon | ~497 | 15s | Add `if (document.hidden) return;` after `_stopped` check |
| c | SkillTree | ~977 | 15s | Add `if (document.hidden) return;` after `_isStopped` check |
| d | LevelProgressBar | ~1882 | 5s | Add `if (document.hidden) return;` at start of callback |
| e | SoloLevelingStats | ~5585 | 3s | Add `if (document.hidden) return;` at start of callback |

#### P5-2: Eliminate SoloLevelingStats `shadowPowerObserver`

**Risk**: LOW | **Impact**: -1 observer, -10 timeout churns/sec in active channels

- Remove `setupShadowPowerTracking()` method body (lines ~5370-5401)
- Remove `this.shadowPowerObserver?.disconnect()` from cleanup
- Shadow extraction already detected by `shadowExtracted` event + 5s interval

#### P5-7: Tighten SoloLevelingStats chatUI selector

**Risk**: LOW | **Impact**: Prevents accidental wide-scope observation

Replace at line ~9203:
```javascript
// BEFORE
document.querySelector('[class*="chat"]')
// AFTER
document.querySelector('main[class*="chatContent"]') ||
document.querySelector('section[class*="chatContent"]')
```

---

### Batch 2 — Dungeons Visibility + Settings Guard

#### P5-3: Dungeons visibility gates on non-combat intervals

**Risk**: LOW | **Impact**: ~1 fewer fire/sec when hidden during dungeon

| Target | Line | Gate |
|--------|------|------|
| Regen interval | ~6615 | `if (!this.isWindowVisible()) return;` |
| Channel watcher | ~13662 | `if (!this.isWindowVisible()) return;` |
| Message container health | ~3456 | `if (document.hidden) return;` |
| Mob kill timer | ~13720 | `if (!this.isWindowVisible()) return;` |

**Do NOT gate**: Combat loop (1s), mob spawn (500ms), GC (5min), cleanup (1min)

#### P5-5: Narrow RulersAuthority settings guard observer

**Risk**: LOW-MEDIUM | **Impact**: Eliminates the only `document.body` subtree observer

Replace MutationObserver on document.body with either:
- Option A: 1.5s polling interval with `document.hidden` gate
- Option B: Narrow observer to `[class*="layerContainer_"]` instead of body

Antigravity recommends Option A (polling). I agree — the settings modal is rare and
latency-insensitive. A 1.5s poll is unnoticeable.

---

### Batch 3 — Architectural Refactors (Requires Testing)

#### P5-1: Shared NavigationBus (Replaces 7 pushState wrapper chains)

**Risk**: HIGH | **Impact**: Eliminates all wrapper chain race conditions

Add `NavigationBus` module to `BetterDiscordPluginUtils.js`:

```javascript
const NavigationBus = (() => {
  let initialized = false;
  let originalPushState = null;
  let originalReplaceState = null;
  const subscribers = new Set();

  function init() {
    if (initialized) return;
    initialized = true;
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      notify('pushState', args);
      return result;
    };
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      notify('replaceState', args);
      return result;
    };
    window.addEventListener('popstate', () => notify('popstate'));
  }

  function notify(type, args) {
    const url = window.location.href;
    subscribers.forEach(cb => {
      try { cb({ type, url, args }); } catch (_) {}
    });
  }

  function subscribe(callback) {
    init();
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  }

  function teardown() {
    if (!initialized) return;
    if (subscribers.size > 0) return; // Don't teardown while subscribers exist
    if (originalPushState) history.pushState = originalPushState;
    if (originalReplaceState) history.replaceState = originalReplaceState;
    window.removeEventListener('popstate', notify);
    initialized = false;
  }

  return { subscribe, teardown };
})();
```

**Migration per plugin** (7 plugins):
1. Replace pushState/replaceState wrapping with `NavigationBus.subscribe(callback)`
2. Store unsubscribe function: `this._unsubNav = NavigationBus.subscribe(...)`
3. In `stop()`: call `this._unsubNav()` instead of restoring history methods
4. Remove all `_originalPushState`, `_navPushStateWrapper`, etc. instance properties

**Rollout**: Ship to SystemWindow first (smallest/most isolated). Verify. Then batch remaining 6.

#### P5-4 + P5-8: Shared LayoutObserverBus (Consolidates 3-5 observers)

**Risk**: MEDIUM | **Impact**: 3+ observers → 1 shared observer

Add `LayoutObserverBus` to `BetterDiscordPluginUtils.js`:

```javascript
const LayoutObserverBus = (() => {
  let observer = null;
  let target = null;
  const subscribers = new Map();

  function ensure() {
    if (observer) return;
    target = document.querySelector('[class*="base_"][class*="container_"]')
      || document.querySelector('[class*="app_"]')
      || document.getElementById("app-mount");
    if (!target) return;

    observer = new MutationObserver(() => {
      const now = Date.now();
      subscribers.forEach((sub) => {
        if (now - sub.lastFired < sub.throttleMs) return;
        sub.lastFired = now;
        try { sub.callback(); } catch (_) {}
      });
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function subscribe(id, callback, throttleMs = 500) {
    ensure();
    subscribers.set(id, { callback, throttleMs, lastFired: 0 });
    return () => {
      subscribers.delete(id);
      if (subscribers.size === 0 && observer) {
        observer.disconnect();
        observer = null;
        target = null;
      }
    };
  }

  return { subscribe };
})();
```

**Consumers**:
- ShadowSenses `_setupWidgetObserver()` → `LayoutObserverBus.subscribe('ShadowSenses', cb, 500)`
- ShadowRecon `startDOMObserver()` → `LayoutObserverBus.subscribe('ShadowRecon', cb, 500)`
- RulersAuthority toolbar observer → `LayoutObserverBus.subscribe('RA-toolbar', cb, 250)`
- ShadowExchange swirl observer → `LayoutObserverBus.subscribe('ShadowExchange', cb, 250)`

---

## Items Validated As-Is (No Changes Needed)

| Item | Reason |
|------|--------|
| Dungeons combat loops (500ms, 1s) | Real-time combat must tick |
| ShadowArmy 1hr compression | Negligible frequency |
| Stealth 15s status maintain | Must run when hidden (intentional) |
| CriticalHit per-message observers | Auto-disconnect, throttled, inherently per-element |
| SystemWindow childList-only observer | Already optimal scope |
| All structuredClone() migrations | 0 remaining JSON.parse(JSON.stringify()) |
| CriticalHit save debounce (300ms) | Already implemented |
| UserPanelDockMover 900ms→10s slowdown | Already implemented |
| SoloLevelingStats activity save gate | Already implemented |
| ShadowSenses dirty-flag flush (30s) | Already gated by dirty flag |

---

## Expected Impact

### Fire Rate Projections

| Scenario | Current (Post-Phase 4) | After Phase 5 | Change |
|----------|----------------------|---------------|--------|
| Peak (combat + quest) | ~12.5/sec | ~11/sec | -12% |
| Normal (browsing) | ~5/sec | ~3.5/sec | -30% |
| **Background (tab hidden)** | **~3-4/sec** | **~1-1.5/sec** | **-60%** |

### Observer Count

| State | Count | Change |
|-------|-------|--------|
| Current | 16 | — |
| After P5-2 | 15 | -1 (SLS shadowPower) |
| After P5-4+P5-8 | 11 | -4 (layout+toolbar consolidation) |
| After P5-5 | 10 | -1 (RA settings → polling) |
| **Final** | **10** | **-37.5%** |

### pushState Wrapper Count

| State | Wrappers | Race Conditions |
|-------|----------|-----------------|
| Current | 7 independent chains | Possible |
| After P5-1 | 1 shared bus | **Eliminated** |

### Background Tab (8-hour session)

- Before Phase 5: ~115,200 timer fires
- After Phase 5: ~43,200 timer fires
- **Savings**: ~72,000 fewer fires (-62%)
