# React Migration Status

> Last updated: Feb 17, 2026

## Overview

BetterDiscord plugins are migrating from raw DOM manipulation to React (BdApi.React + BdApi.Patcher). The rule of thumb: **UI that persists in Discord's component tree benefits from React; ephemeral overlays (toasts, animations, tools) are fine as DOM.**

## Migration Status

| Plugin | Status | React | DOM | Priority |
|--------|--------|-------|-----|----------|
| ~~ChatNavArrows~~ | ✅ Done | Patcher | minimal | — |
| ~~HSLDockAutoHide~~ | ✅ Done (v4.0) | Patcher | minimal | — |
| ~~HSLWheelBridge~~ | ✅ Done (v2.0) | Patcher | minimal | — |
| ~~LevelProgressBar~~ | ✅ Done (v1.4) | Patcher + React injection | bar UI | — |
| ~~ShadowExchange~~ | ✅ Done (v2.0) | createPortal | minimal | — |
| ~~SkillTree~~ | ✅ Done (v3.0) | createRoot + factory | minimal | — |
| ~~ShadowArmy~~ | ✅ Done (v3.6) | createRoot + factory | extraction toasts | — |
| ~~TitleManager~~ | ✅ Done (v2.0) | createRoot + factory | button only | — |
| **Dungeons** | ❌ DOM | 9 refs | 155 refs | 🔴 HIGH |
| **CriticalHit** | ⚠️ Mixed | 29 refs (settings) | 194 refs + 38 observers | 🟡 PARTIAL |
| **SoloLevelingStats** | ⚠️ Mixed | 3 refs | 203 refs + 12 observers | 🟡 PARTIAL |
| SoloLevelingToasts | ⬜ SKIP | 0 | 37 refs | — |
| CSSPicker | ⬜ SKIP | 0 | 23 refs | — |
| UserPanelDockMover | ⬜ SKIP | 0 | 6 refs | — |

### Summary: 11/14 complete · 3 remaining to migrate

- **8 migrated** to React (SkillTree, ShadowArmy, TitleManager, ChatNavArrows, HSLDockAutoHide, HSLWheelBridge, LevelProgressBar, ShadowExchange)
- **3 intentionally skipped** — DOM is the correct approach for these plugins (see below)
- **3 remaining** — Dungeons, CriticalHit, SoloLevelingStats

## Remaining Work

### 🔴 MIGRATE (high benefit)

**Dungeons** — Boss HP bars render inside Discord's message list. Currently uses 155+ DOM ops and MutationObservers to fight React re-renders. Full React migration would eliminate race conditions and re-render conflicts. Biggest plugin, most to gain.

### 🟡 PARTIAL (migrate specific parts)

**CriticalHit** — Migrate message gradient styling to React patcher (currently fights re-renders via 38 MutationObservers + CSS rules map). Keep DOM for floating "CRITICAL HIT!" animations (ephemeral overlay).

**SoloLevelingStats** — Migrate stats panel overlay to React. Keep DOM for event system, XP calculations, and ephemeral level-up notifications. 12 MutationObservers could mostly be replaced.

### ⬜ SKIP (DOM is the correct choice — no migration needed)

These 3 plugins are **intentionally staying DOM-based** because React would add overhead with zero benefit:

**SoloLevelingToasts** — Toast notifications are ephemeral floating overlays (~2-5 seconds lifespan). They appear over Discord's UI, never inside React's component tree. React's diffing/lifecycle would add latency to what needs to be instant fire-and-forget DOM insertion. Zero MutationObservers, no re-render conflicts.

**CSSPicker** — A CSS inspection overlay tool that operates *outside* Discord's React tree by design. It creates floating highlight boxes and info panels over arbitrary DOM elements. Needs direct DOM access to measure/position elements. React would fight against the very thing it's trying to inspect.

**UserPanelDockMover** — Pure CSS repositioning via class toggling (`classList.add/remove`). Has zero UI rendering — it just moves Discord's existing user panel dock by toggling CSS classes. There's literally nothing to render with React.

## Migration Order

1. ~~**SkillTree** — ✅ Done (v3.0.0, Feb 17 2026)~~
2. ~~**ShadowArmy** — ✅ Done (v3.6.0, Feb 17 2026)~~
3. ~~**TitleManager** — ✅ Done (v2.0.0, Feb 17 2026)~~
4. **Dungeons** — highest DOM count, most to gain, needs serious rework anyway
5. **CriticalHit** (message styling only) — biggest observer count, stability win
6. **SoloLevelingStats** (stats panel) — medium priority

## Completed Migrations (Feb 17, 2026)

| Plugin | Version | Pattern | Notes |
|--------|---------|---------|-------|
| ChatNavArrows | — | Patcher | Already React |
| HSLDockAutoHide | v4.0 | Patcher | Already React |
| HSLWheelBridge | v2.0 | Patcher | Already React |
| LevelProgressBar | v1.4 | Patcher + React injection | Already React |
| ShadowExchange | v2.0 | createPortal | Already React |
| SkillTree | v3.0 | createRoot + factory | Modal migrated |
| ShadowArmy | v3.6 | createRoot + factory | Member list widget migrated |
| TitleManager | v2.0 | createRoot + factory | Modal migrated |

## Settings Panels (Feb 17, 2026)

All plugin settings panels have been stripped to essentials:
- **CriticalHit**: Statistics + Debug Mode (React component)
- **ShadowArmy**: Statistics + Storage Diagnostic + Debug Mode (DOM/innerHTML)
- **SkillTree**: Debug Mode only (DOM/innerHTML)
- **Dungeons**: Debug Mode only (React component)
- **LevelProgressBar**: Debug Mode only (DOM/innerHTML)
- All panels use solid `#1e1e2e` backgrounds
