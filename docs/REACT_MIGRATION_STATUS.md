# React Migration Status

> Last updated: Feb 17, 2026

## Overview

BetterDiscord plugins are migrating from raw DOM manipulation to React (BdApi.React + BdApi.Patcher). The rule of thumb: **UI that persists in Discord's component tree benefits from React; ephemeral overlays (toasts, animations, tools) are fine as DOM.**

## Migration Status

| Plugin | Status | React | DOM | Priority |
|--------|--------|-------|-----|----------|
| ChatNavArrows | ✅ Done | Patcher | minimal | — |
| HSLDockAutoHide | ✅ Done (v4.0) | Patcher | minimal | — |
| HSLWheelBridge | ✅ Done (v2.0) | Patcher | minimal | — |
| LevelProgressBar | ✅ Done (v1.4) | Patcher + React injection | bar UI | — |
| ShadowExchange | ✅ Done (v2.0) | createPortal | minimal | — |
| **Dungeons** | ❌ DOM | 9 refs | 155 refs | 🔴 HIGH |
| SkillTree | ✅ Done (v3.0) | createRoot + factory | minimal | — |
| **CriticalHit** | ⚠️ Mixed | 29 refs (settings) | 194 refs + 38 observers | 🟡 PARTIAL |
| ShadowArmy | ✅ Done (v3.6) | createRoot + factory | extraction toasts | — |
| **SoloLevelingStats** | ⚠️ Mixed | 3 refs | 203 refs + 12 observers | 🟡 PARTIAL |
| TitleManager | ✅ Done (v2.0) | createRoot + factory | button only | — |
| SoloLevelingToasts | ⚠️ Patcher only | 0 | 37 refs | ⬜ SKIP |
| CSSPicker | ❌ DOM | 0 | 23 refs | ⬜ SKIP |
| UserPanelDockMover | ❌ DOM | 0 | 6 refs | ⬜ SKIP |

## Verdicts

### 🔴 MIGRATE (high benefit)

**Dungeons** — Boss HP bars render inside Discord's message list. Currently uses 155+ DOM ops and MutationObservers to fight React re-renders. Full React migration would eliminate race conditions and re-render conflicts. Biggest plugin, most to gain.

### 🟡 PARTIAL (migrate specific parts)

**CriticalHit** — Migrate message gradient styling to React patcher (currently fights re-renders via 38 MutationObservers + CSS rules map). Keep DOM for floating "CRITICAL HIT!" animations (ephemeral overlay).

**SoloLevelingStats** — Migrate stats panel overlay to React. Keep DOM for event system, XP calculations, and ephemeral level-up notifications. 12 MutationObservers could mostly be replaced.

### ⬜ SKIP (DOM is correct)

**SoloLevelingToasts** — Toasts are intentionally short-lived floating overlays. React adds overhead with no stability benefit.

**CSSPicker** — Inspection overlay tool that intentionally operates outside Discord's React tree. DOM is the right tool.

**UserPanelDockMover** — Pure CSS repositioning via class toggling. No UI rendering at all.

## Migration Order

1. ~~**SkillTree** — ✅ Done (v3.0.0, Feb 17 2026)~~
2. **Dungeons** — highest DOM count, most to gain, needs serious rework anyway
3. **CriticalHit** (message styling only) — biggest observer count, stability win
4. ~~**ShadowArmy** — ✅ Done (v3.6.0, Feb 17 2026)~~
5. **SoloLevelingStats** (stats panel) — medium priority
6. ~~**TitleManager** — ✅ Done (v2.0.0, Feb 17 2026)~~

## Settings Panels (Feb 17, 2026)

All plugin settings panels have been stripped to essentials:
- **CriticalHit**: Statistics + Debug Mode (React component)
- **ShadowArmy**: Statistics + Storage Diagnostic + Debug Mode (DOM/innerHTML)
- **SkillTree**: Debug Mode only (DOM/innerHTML)
- **Dungeons**: Debug Mode only (React component)
- **LevelProgressBar**: Debug Mode only (DOM/innerHTML)
- All panels use solid `#1e1e2e` backgrounds
