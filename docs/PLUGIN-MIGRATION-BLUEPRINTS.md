# Plugin Migration Blueprints & Reference

---

## Migration Status

Use presence of `src/<PluginName>/` as the canonical indicator — not `plugins/*Main.js` artifacts.

### Migrated to `src/` + esbuild (16 of 20)

| Plugin | Status | Notes |
|--------|--------|-------|
| CSSPicker | ✅ Migrated | Split into `index.js`, `selectors.js`, `inspection.js` |
| ChatNavArrows | ✅ Migrated | `index.js` + `dom-fallback.js` + `arrow-manager-component.js` + `styles.css` |
| HSLDockAutoHide | ✅ Migrated | `index.js` + `engine.js` + `styles.js` |
| HSLWheelBridge | ✅ Migrated | `index.js` only, no CSS file |
| LevelProgressBar | ✅ Migrated | `index.js` build entry present in `src/` |
| RulersAuthority | ✅ Migrated | Split into constants, panels, resize, hotkeys, styles, settings |
| ShadowExchange | ✅ Migrated | `index.js` + panel components |
| ShadowRecon | ✅ Migrated | `index.js` build entry present in `src/` |
| ShadowSenses | ✅ Migrated | `index.js` + `senses-engine.js` + `senses-engine-utils.js` + `shared-utils.js` |
| ShadowStep | ✅ Migrated | `index.js` build entry present in `src/` |
| SkillTree | ✅ Migrated | `index.js` + `shared-utils.js` |
| SoloLevelingToasts | ✅ Migrated | Split into `index.js`, `formatting.js`, `styles.css` |
| Stealth | ✅ Migrated | `index.js` build entry present in `src/` |
| SystemWindow | ✅ Migrated | `index.js` + `styles.css` |
| TitleManager | ✅ Migrated | `index.js` build entry present in `src/` |
| UserPanelDockMover | ✅ Migrated | `index.js` + `styles.css` |

### Remaining — Not Yet Migrated to `src/` (4 of 20)

| Plugin | LOC | Status | Notes |
|--------|-----|--------|-------|
| CriticalHit | ~8.4k | ⏳ Remaining | 140+ methods, well-organized by concern |
| ShadowArmy | ~11.1k | ⏳ Remaining | ShadowStorageManager already separable |
| SoloLevelingStats | ~11.8k | ⏳ Remaining | 181 methods, heaviest CSS (~1,453 lines) |
| Dungeons | ~16.1k | ⏳ Remaining | Largest plugin, 3 helper classes, deepest split required |

---

## Split Blueprints (Remaining 4 Plugins)

### CriticalHit (8,373 LOC)

140+ methods, well-organized by concern. AI accuracy goes from ~60% → ~95% after split.

```
src/CriticalHit/
  index.js              ← main class, lifecycle, message processing pipeline (~1,400 LOC)
  id-extraction.js      ← message ID/author extraction, fiber traversal, content hash (~440 LOC)
  message-filtering.js  ← reply/bot/system/empty filters, chance checks (~230 LOC)
  crit-detector.js      ← RNG, chance calculation, bonus collection, styling (~350 LOC)
  history-manager.js    ← crit history persistence, stats, throttled saves (~630 LOC)
  animation.js          ← floating text, combo display, screen shake, fonts (~470 LOC)
  memory-cleanup.js     ← LRU eviction, periodic cleanup, old history pruning (~150 LOC)
  dom-helpers.js        ← element navigation, header detection, URL tracking (~440 LOC)
  settings-panel.js     ← React settings component (~230 LOC)
  styles.css            ← animations + settings panel (~300 LOC)
  manifest.json
```

### ShadowArmy (11,082 LOC)

ShadowStorageManager already separable as its own module.

```
src/ShadowArmy/
  index.js              ← main class, lifecycle, settings (~1,200 LOC)
  storage.js            ← ShadowStorageManager (IndexedDB CRUD, aggregation) (~1,200 LOC)
  extraction.js         ← message extraction queue, dungeon extraction, chance calc (~1,500 LOC)
  combat-stats.js       ← shadow generation, stat calc, power, leveling, progression (~1,750 LOC)
  compression.js        ← hybrid compression (top 100 elite, rest compressed) (~230 LOC)
  animation.js          ← ARISE animation, extraction animations (~630 LOC)
  components.js         ← React: ShadowArmyWidget, RankBox (~150 LOC)
  ui-settings.js        ← settings panel + CSS management (~1,000 LOC)
  constants.js          ← 26 shadow types, stat weights, rank definitions (~370 LOC)
  styles.css            ← extraction + ARISE + settings panel (~355 LOC)
  manifest.json
```

### SoloLevelingStats (11,810 LOC)

181 methods, heaviest CSS (~1,453 lines).

```
src/SoloLevelingStats/
  index.js              ← main class, lifecycle, event system (~1,500 LOC)
  xp-system.js          ← XP calculation, level-up, rank promotion, animations (~1,500 LOC)
  stat-system.js        ← stat allocation, natural growth, buff aggregation (~1,200 LOC)
  message-tracking.js   ← MutationObserver, message detection, anti-abuse (~1,200 LOC)
  quests.js             ← quest progress, completion, celebrations (~700 LOC)
  achievements.js       ← 76 achievement definitions + check/unlock logic (~1,100 LOC)
  integrations.js       ← CriticalHit combo, ShadowArmy buffs, Dungeons mana (~600 LOC)
  components.js         ← React: 14 components (HPMana, Stats, Quests, Popup) (~450 LOC)
  calculations.js       ← quality/time/channel bonuses, XP governors (~400 LOC)
  settings-panel.js     ← HTML-based settings + file backup (~500 LOC)
  styles.css            ← 9 CSS sections + 14 keyframes (~1,453 LOC)
  manifest.json
```

### Dungeons (16,138 LOC)

Largest plugin, 3 helper classes. index.js drops from 16,138 → ~1,200 LOC after split.

```
src/Dungeons/
  index.js              ← main class, lifecycle, start/stop (~1,200 LOC)
  storage/
    dungeon-storage.js  ← DungeonStorageManager (IndexedDB) (~260 LOC)
    mob-storage.js      ← MobBossStorageManager (batch ops, pagination) (~315 LOC)
    cache-manager.js    ← CacheManager (TTL-based) (~35 LOC)
    settings.js         ← load/save/sanitize settings (~530 LOC)
  combat/
    damage-calc.js      ← calculateDamage, shadow/boss/mob damage formulas (~500 LOC)
    attack-processing.js ← shadow/boss/mob attack loops, batch damage (~1,500 LOC)
    role-combat.js      ← role archetypes, pressure system, multipliers (~300 LOC)
    contribution.js     ← kill XP, damage ledger, weighted distribution (~370 LOC)
  spawning/
    mob-spawner.js      ← spawn loop, wave generation, beast families (~800 LOC)
    dungeon-rank.js     ← rank calculation, channel selection (~500 LOC)
  deployment/
    shadow-deploy.js    ← deploy/recall shadows, starter pool, rebalancing (~1,250 LOC)
    corpse-pile.js      ← ARISE extraction queue, post-combat processing (~475 LOC)
  ui/
    hp-bar.js           ← boss HP bar rendering, layout, restoration (~500 LOC)
    indicators.js       ← dungeon gate icons in channel list (~100 LOC)
    completion.js       ← dungeon completion, ARISE button/animations (~700 LOC)
    delegation.js       ← event delegation for dungeon UI (~130 LOC)
  channel-detection.js  ← channel enumeration, guild channels, message observer (~670 LOC)
  visibility.js         ← pause/resume processing, window visibility (~550 LOC)
  styles.css            ← HP bars, buttons, indicators, animations (~415 LOC)
  settings-panel.js     ← React settings component (~90 LOC)
  manifest.json
```

---

## Historical Runtime Artifacts (`*Main.js`)

Some legacy `plugins/*Main.js` files are shipped by link/deploy scripts for runtime compatibility. Do NOT use their presence to decide migration status — use `src/<PluginName>/` instead.

| Artifact | Interpretation |
|----------|----------------|
| `LevelProgressBarMain.js` | Historical runtime artifact |
| `StealthMain.js` | Historical runtime artifact |
| `HSLDockAutoHideMain.js` | Historical runtime artifact |
| `ShadowStepMain.js` | Historical runtime artifact |
| `TitleManagerMain.js` | Historical runtime artifact |
| `ShadowReconMain.js` | Historical runtime artifact |
| `ShadowExchangeMain.js` | Historical runtime artifact |

---

## Cross-Plugin Dependencies

```
SoloLevelingStats ← CriticalHit (reads combo data)
SoloLevelingStats ← ShadowArmy (reads shadow buffs)
SoloLevelingStats ← Dungeons (mana sync)
SoloLevelingStats → SkillTree (emits levelChanged event)
ShadowArmy → ShadowSenses (shadow data)
ShadowArmy → Dungeons (shadow allocation)
ShadowArmy → ShadowExchange (shadow data)
ShadowSenses ← ShadowPortalCore (navigation)
RulersAuthority ← SkillTree + SoloLevelingStats (visual effects)
```

Only **ShadowSenses** uses FluxDispatcher directly (6 events: MESSAGE_CREATE, PRESENCE_UPDATES, PRESENCE_UPDATE, RELATIONSHIP_*, TYPING_START). All other plugins use DOM observers, NavigationBus, or plugin-to-plugin events.

---

## Shared Utilities

### `src/shared/` — Internal helpers (bundled by esbuild into each plugin)

| File | Purpose |
|------|---------|
| `bd-module-loader.js` | `loadBdModuleFromPlugins()` — load BD shared modules from plugins folder |
| `warn-once.js` | `createWarnOnce()` — deduplicated console.warn (Set-based, per-key) |
| `toast.js` | `createToast()` — SoloLevelingToasts engine → BdApi.UI.showToast fallback |
| `react-dom.js` | `getCreateRoot()` — ReactDOM.createRoot acquisition with fallbacks |
| `hotkeys.js` | `isEditableTarget()`, `matchesHotkey()` — keyboard shortcut helpers |
| `navigation.js` | `getNavigationUtils()` — Discord navigation module acquisition |
| `dispatcher.js` | FluxDispatcher acquisition helpers |
| `debug.js` | Debug logging utilities |
| `settings.js` | Settings load/save helpers |

### `plugins/` — Runtime shared modules (loaded at runtime via `loadBdModuleFromPlugins`)

| File | Purpose |
|------|---------|
| `BetterDiscordPluginUtils.js` | Shared utility module (toast, hotkeys, querySelector fallback, etc.) |
| `BetterDiscordReactUtils.js` | React patcher + component injection utilities |
| `SoloLevelingUtils.js` | Solo Leveling ecosystem shared logic |
| `UnifiedSaveManager.js` | Cross-plugin save state management |
| `ShadowPortalCore.js` | Shadow portal shared logic |

---

## esbuild vs BundleBD Decision

We use esbuild. Key reasons: 1 dep vs 20+, 7ms builds, plain CSS (no preprocessor needed), full control via our 56-line script. BundleBD would make sense if we ever need SCSS, CSS Modules, or SVG-as-component. See git history for full comparison table.
