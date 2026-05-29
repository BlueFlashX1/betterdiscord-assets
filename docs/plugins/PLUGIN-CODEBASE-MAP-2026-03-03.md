# BetterDiscord Plugins Codebase Map (2026-03-03)

## Scope
- Workspace: `betterdiscord-assets`
- Plugin directory: `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/plugins`
- Files included: all `*.plugin.js`
- Files excluded from plugin count: support modules such as `SoloLevelingUtils.js`, `UnifiedSaveManager.js`, `BetterDiscordPluginUtils.js`, `ShadowPortalCore.js`

## Methodology
- LOC calculated by line counting each `*.plugin.js`.
- Interconnection extracted via static patterns:
  - Hard runtime deps:
    - `BdApi.Plugins.get/isEnabled/enable/disable("<Plugin>")`
    - `getPluginInstance("<Plugin>")`
  - Soft data deps:
    - `BdApi.Data.load/save("<Plugin>", ...)`
- Notes:
  - This is static analysis, not runtime tracing.
  - Dynamic string-based lookups or indirect references may not be captured.

## Summary
- Total plugin files: `29`
- Hard dependency edges: `29`
- Soft dependency edges: `2`
- Primary hub plugins:
  - `SoloLevelingStats`
  - `SoloLevelingToasts`
  - `ShadowArmy`
  - `ShadowSenses`

---

## 1) Plugin Size Categories (LOC)

### Mega (>= 10,000 LOC)
| Plugin | LOC |
|---|---:|
| Dungeons | 15,848 |
| SoloLevelingStats | 11,780 |
| ShadowArmy | 11,092 |

### Very Large (5,000 - 9,999 LOC)
| Plugin | LOC |
|---|---:|
| CriticalHit | 8,326 |

### Large (2,000 - 4,999 LOC)
| Plugin | LOC |
|---|---:|
| ShadowSenses | 3,290 |
| SkillTree | 3,279 |
| RulersAuthority | 2,249 |
| SoloLevelingToasts | 2,025 |

### Medium (1,000 - 1,999 LOC)
| Plugin | LOC |
|---|---:|
| LevelProgressBar | 1,926 |
| ShadowExchange | 1,924 |
| ShadowRecon | 1,620 |
| TitleManager | 1,561 |
| CSSPicker | 1,484 |
| HSLDockAutoHide | 1,439 |
| ShadowStep | 1,424 |
| Stealth | 1,190 |

### Small (300 - 999 LOC)
| Plugin | LOC |
|---|---:|
| ChatNavArrows | 697 |
| SystemWindow | 684 |
| UserPanelDockMover | 328 |
| HSLWheelBridge | 310 |

### Tiny (< 300 LOC)
| Plugin | LOC |
|---|---:|
| AnimateTest | 168 |
| DraggableTest | 162 |
| TooltipTest | 141 |
| ScrollSpyTest | 140 |
| HotkeysTest | 129 |
| MutationScannerTest | 113 |
| CustomEventsTest | 94 |
| EventDelegationTest | 88 |
| TestPlugin | 70 |

---

## 2) Interconnection Categories

## Hub Tier
| Plugin | Hard In | Hard Out | Soft In | Soft Out |
|---|---:|---:|---:|---:|
| SoloLevelingStats | 7 | 5 | 1 | 0 |
| SoloLevelingToasts | 7 | 1 | 0 | 0 |
| ShadowArmy | 4 | 2 | 0 | 0 |
| ShadowSenses | 1 | 4 | 0 | 0 |

## Connected Tier
| Plugin | Hard In | Hard Out | Soft In | Soft Out |
|---|---:|---:|---:|---:|
| Dungeons | 2 | 3 | 0 | 0 |
| ShadowExchange | 2 | 1 | 0 | 0 |
| SkillTree | 2 | 1 | 1 | 0 |
| CriticalHit | 2 | 0 | 0 | 2 |
| HSLDockAutoHide | 1 | 1 | 0 | 0 |
| ShadowRecon | 1 | 1 | 0 | 0 |
| LevelProgressBar | 0 | 2 | 0 | 0 |
| RulersAuthority | 0 | 2 | 0 | 0 |
| UserPanelDockMover | 0 | 2 | 0 | 0 |
| ShadowStep | 0 | 1 | 0 | 0 |
| Stealth | 0 | 1 | 0 | 0 |
| TestPlugin | 0 | 1 | 0 | 0 |
| TitleManager | 0 | 1 | 0 | 0 |

## Isolated Tier
| Plugin | Hard In | Hard Out | Soft In | Soft Out |
|---|---:|---:|---:|---:|
| AnimateTest | 0 | 0 | 0 | 0 |
| ChatNavArrows | 0 | 0 | 0 | 0 |
| CSSPicker | 0 | 0 | 0 | 0 |
| CustomEventsTest | 0 | 0 | 0 | 0 |
| DraggableTest | 0 | 0 | 0 | 0 |
| EventDelegationTest | 0 | 0 | 0 | 0 |
| HotkeysTest | 0 | 0 | 0 | 0 |
| HSLWheelBridge | 0 | 0 | 0 | 0 |
| MutationScannerTest | 0 | 0 | 0 | 0 |
| ScrollSpyTest | 0 | 0 | 0 | 0 |
| SystemWindow | 0 | 0 | 0 | 0 |
| TooltipTest | 0 | 0 | 0 | 0 |

---

## 3) Hard Runtime Dependency Edges

- `Dungeons -> ShadowArmy, ShadowExchange, SoloLevelingToasts`
- `HSLDockAutoHide -> SoloLevelingToasts`
- `LevelProgressBar -> ShadowRecon, SoloLevelingStats`
- `RulersAuthority -> SkillTree, SoloLevelingStats`
- `ShadowArmy -> CriticalHit, SoloLevelingStats`
- `ShadowExchange -> ShadowArmy`
- `ShadowRecon -> ShadowSenses`
- `ShadowSenses -> Dungeons, ShadowArmy, ShadowExchange, SoloLevelingToasts`
- `ShadowStep -> SoloLevelingStats`
- `SkillTree -> SoloLevelingStats`
- `SoloLevelingStats -> CriticalHit, Dungeons, ShadowArmy, SkillTree, SoloLevelingToasts`
- `SoloLevelingToasts -> SoloLevelingStats`
- `Stealth -> SoloLevelingToasts`
- `TestPlugin -> SoloLevelingToasts`
- `TitleManager -> SoloLevelingStats`
- `UserPanelDockMover -> HSLDockAutoHide, SoloLevelingToasts`

---

## 4) Soft Data Dependency Edges

- `CriticalHit -> SoloLevelingStats` (via `BdApi.Data.*`)
- `CriticalHit -> SkillTree` (via `BdApi.Data.*`)

---

## 5) Architecture Observations

- `SoloLevelingStats` is the central integration hub for gameplay systems.
- `SoloLevelingToasts` is the dominant notification sink used by many plugins.
- Combat/gameplay cluster is strongly coupled:
  - `Dungeons`, `ShadowArmy`, `ShadowExchange`, `ShadowSenses`, `SoloLevelingStats`, `SoloLevelingToasts`
- Utility/test plugins are mostly isolated and low risk for cross-plugin regressions.
- Medium-size plugins that only point to one hub (`TitleManager`, `ShadowStep`, `Stealth`) are good candidates for interface contracts to reduce fragility.

---

## 6) Maintenance Guidance

- Treat these as high regression-risk hubs during refactors:
  - `SoloLevelingStats`, `SoloLevelingToasts`, `ShadowArmy`, `Dungeons`
- For any hub API change, verify dependents in this order:
  1. Direct hard dependents
  2. Data-sharing dependents (`BdApi.Data` consumers)
  3. UI/event dependents (`SoloLevelingToasts` users)
- Re-run this map after major merges to keep coupling visible.

