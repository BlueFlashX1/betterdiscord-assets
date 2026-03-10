# BetterDiscord Plugin Workspace

## Repository

- **Repo**: `betterdiscord-assets` (`https://github.com/BlueFlashX1/betterdiscord-assets.git`)
- **BD plugins folder**: `~/Library/Application Support/BetterDiscord/plugins/`
- **Symlink script**: `scripts/link-all-plugins.sh` (symlinks `plugins/*.plugin.js` to BD folder)

---

## Build System: esbuild vs BundleBD

### Why esbuild (current choice), not BundleBD

Both are officially supported by BetterDiscord. We use a custom esbuild script. Here's why:

| Factor | esbuild (ours) | BundleBD |
|--------|---------------|----------|
| **Internal bundler** | esbuild directly | Rollup + esbuild (for TS/JSX transpilation only) |
| **Build speed** | ~7ms per plugin | Slower (Rollup overhead, multiple plugin passes) |
| **Dependencies** | 1 (`esbuild`) | 20+ (rollup, 7 rollup plugins, sass, less, stylus, postcss-modules, svgr) |
| **Config** | 56-line script we control | Zero-config (opinionated defaults) |
| **CSS handling** | `loader: { ".css": "text" }` — imports as string | `import { addStyles, removeStyles } from "styles"` — auto-manages injection |
| **TypeScript** | Supported (esbuild native) | Supported (esbuild via rollup-plugin-esbuild) |
| **JSX** | Supported (esbuild native) | Supported + auto-binds `BdApi.React` |
| **SCSS/Less/Stylus** | Not built-in (add loader if needed) | Built-in (sass, less, stylus all included) |
| **CSS Modules** | Not built-in | Built-in (`*.module.css`) |
| **SVG as React component** | Not built-in | Built-in (`@svgr/rollup`) |
| **BdApi auto-import** | No — `BdApi` is global, use directly | `import { Webpack } from "betterdiscord"` — creates bound instance |
| **Dev mode** | `npm run watch` (esbuild native) | `npx bundlebd --dev` (watch + auto-copy to BD folder) |
| **Auto-deploy to BD** | Separate symlink script | Built-in with `--dev` flag |
| **Output readability** | Clean CJS, minimal wrapper | Clean output, explicit cleanup pass (`rollup-plugin-cleanup`) |
| **Maintenance** | We own it, update when we want | Community project (last release Apr 2023, 13 stars) |

### When BundleBD would make more sense

- **SCSS/Less/Stylus** — if plugins need preprocessed CSS, BundleBD handles it out of the box
- **CSS Modules** — scoped class names via `*.module.css` without extra config
- **SVG components** — `import Icon from "./icon.svg"` renders as React component
- **BdApi typed imports** — `import { Webpack } from "betterdiscord"` with autocomplete via `@types/bdapi`
- **Zero config** — no build script to maintain; `npx bundlebd` just works

### When esbuild is better (our situation)

- **Speed** — 7ms builds, instant watch rebuilds; Rollup adds overhead that matters at 16k+ LOC
- **Minimal deps** — 1 dependency vs 20+; less supply chain risk, smaller node_modules
- **Full control** — our 56-line script does exactly what we need, nothing more
- **Large plugins** — Dungeons (16k LOC), ShadowArmy (11k LOC), SoloLevelingStats (12k LOC) benefit most from esbuild's raw speed during watch mode
- **No CSS preprocessing** — we use plain CSS, so BundleBD's SCSS/Less/Stylus support is dead weight
- **Already working** — migration path is established, switching bundlers adds risk for zero gain

### Verdict

**Stick with esbuild.** BundleBD solves problems we don't have (SCSS, CSS Modules, SVG components). For plain JS + CSS plugins at our scale (16k LOC max), esbuild's speed and simplicity win. If we ever need SCSS or CSS Modules, we can add a single esbuild plugin rather than switching the entire build system.

---

## esbuild Build System (Current)

**Bundler**: esbuild v0.27.3 via `scripts/build-plugin.js`

| Setting | Value |
|---------|-------|
| Entry | `src/<PluginName>/index.js` |
| Metadata | `src/<PluginName>/manifest.json` (auto-injected as JSDoc banner) |
| Output | `plugins/<PluginName>.plugin.js` |
| Format | CJS, `platform: "node"`, `target: "node16"` |
| CSS | `.css` imports bundled as string constants (`loader: { ".css": "text" }`) |
| Minification | Disabled (BD guidelines) |

### Commands

```bash
npm run build <PluginName>         # Single build
npm run watch <PluginName>         # Watch mode, auto-rebuilds on save
npm run link:plugin <PluginName>   # Symlink to BD plugins folder
```

### Source Structure (migrated plugins)

```
src/<PluginName>/
  manifest.json   <- { name, description, version, author }
  index.js        <- plugin class, exports module.exports = class ...
  styles.css      <- CSS (imported as string in index.js)
```

### NEVER edit `plugins/<PluginName>.plugin.js` directly for migrated plugins — it's auto-generated.

---

## Plugin Migration Status & Split Blueprints

### Current Source Of Truth

Use the presence of `src/<PluginName>/` to determine whether a plugin is migrated to the esbuild path. Historical React migration notes under `docs/history/` are archived context only and do not reflect the current `src/` layout.

### Migrated to `src/` + esbuild (16 of 20 plugins)

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

### Remaining — Not Yet Migrated to `src/`

4 plugins remain as monoliths in `plugins/` only. Ordered smallest → largest:

| Plugin | LOC | Status | Notes |
|--------|-----|--------|-------|
| CriticalHit | ~8.4k | ⏳ Remaining | 140+ methods, well-organized by concern |
| ShadowArmy | ~11.1k | ⏳ Remaining | ShadowStorageManager already separable |
| SoloLevelingStats | ~11.8k | ⏳ Remaining | 181 methods, heaviest CSS (~1,453 lines) |
| Dungeons | ~16.1k | ⏳ Remaining | Largest plugin, 3 helper classes, deepest split required |

Detailed split blueprints for the four remaining plugins are below.

---

### Tier 4: Critical plugins (8k+ LOC) — split required for AI accuracy

| Plugin | LOC | CSS Lines | Shared Utils | Dispatcher | Internal Classes |
|--------|-----|-----------|--------------|------------|-----------------|
| CriticalHit | 8,373 | ~300 | ReactUtils, PluginUtils | No | 0 (monolithic) |
| ShadowArmy | 11,082 | ~355 | PluginUtils, ReactUtils, SLUtils, UnifiedSaveManager | No | 1 (ShadowStorageManager) |
| SoloLevelingStats | 11,810 | ~1,453 | SLUtils, PluginUtils, UnifiedSaveManager | No | 0 (181 methods) |
| Dungeons | 16,138 | ~415 | None (self-contained) | No | 3 (DungeonStorageManager, MobBossStorageManager, CacheManager) |

**CriticalHit** (8,373 LOC) — 140+ methods, well-organized by concern
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
**AI benefit**: index.js drops from 8,373 → ~1,400 LOC. Editing crit logic = open `crit-detector.js` (350 LOC). Editing animations = open `animation.js` (470 LOC). Claude accuracy goes from ~60% → ~95%.

**ShadowArmy** (11,082 LOC) — ShadowStorageManager already separable
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

**SoloLevelingStats** (11,810 LOC) — 181 methods, heaviest CSS
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

**Dungeons** (16,138 LOC) — 3 helper classes, heaviest plugin
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
**AI benefit**: index.js drops from 16,138 → ~1,200 LOC. Editing combat = open `combat/damage-calc.js` (500 LOC). Editing spawning = open `spawning/mob-spawner.js` (800 LOC). Each file fits entirely in AI context.

---

### Historical Runtime Artifacts (`*Main.js`)

Some legacy `plugins/*Main.js` files are still shipped by the link/deploy scripts for runtime compatibility. Do not use their presence to decide migration status; use `src/<PluginName>/` instead.

| Artifact | Current Interpretation |
|----------|------------------------|
| `LevelProgressBarMain.js` | Historical runtime artifact still shipped by scripts |
| `StealthMain.js` | Historical runtime artifact still shipped by scripts |
| `HSLDockAutoHideMain.js` | Historical runtime artifact still shipped by scripts |
| `ShadowStepMain.js` | Historical runtime artifact still shipped by scripts |
| `TitleManagerMain.js` | Historical runtime artifact still shipped by scripts |
| `ShadowReconMain.js` | Historical runtime artifact still shipped by scripts |
| `ShadowExchangeMain.js` | Historical runtime artifact still shipped by scripts |

---

### Cross-Plugin Dependencies

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

### FluxDispatcher Usage

Only **ShadowSenses** uses FluxDispatcher directly (6 events: MESSAGE_CREATE, PRESENCE_UPDATES, PRESENCE_UPDATE, RELATIONSHIP_*, TYPING_START). All other plugins use DOM observers, NavigationBus, or plugin-to-plugin events.

---

## Critical Patterns

### FluxDispatcher Acquisition (MUST USE THIS)

```javascript
const { Webpack } = BdApi;
this._Dispatcher =
  Webpack.Stores?.UserStore?._dispatcher ||           // Extract from Flux store (MOST RELIABLE)
  Webpack.getModule(m => m.dispatch && m.subscribe) || // NO optional chaining in filter!
  Webpack.getByKeys("actionLogger");                   // Legacy fallback
```

- **DO NOT use optional chaining (`?.`) in Webpack filter functions** — it breaks matching
- `Webpack.Stores.UserStore._dispatcher` is the most reliable method
- Apply this pattern to ALL plugins that need the Dispatcher

### BD Constraints

| Rule | Detail |
|------|--------|
| Output | Must be single `.plugin.js` file |
| Node built-ins | `fs`, `crypto`, `buffer`, `https` available via BD polyfills |
| `child_process` | Banned |
| npm packages | Fine (bundled inline by esbuild) |
| Remote libraries | Banned — everything must be local |
| Minification | Banned (keep readable) |
| `BdApi` | Global, no import needed |

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

### `plugins/` — Runtime shared modules (loaded at runtime by plugins via `loadBdModuleFromPlugins`)

| File | Purpose |
|------|---------|
| `BetterDiscordPluginUtils.js` | Shared utility module (toast, hotkeys, querySelector fallback, etc.) |
| `BetterDiscordReactUtils.js` | React patcher + component injection utilities |
| `SoloLevelingUtils.js` | Solo Leveling ecosystem shared logic |
| `UnifiedSaveManager.js` | Cross-plugin save state management |
| `ShadowPortalCore.js` | Shadow portal shared logic |

---

## Key Docs

- [Plugin Codebase Map](docs/plugins/PLUGIN-CODEBASE-MAP-2026-03-03.md) — LOC, dependencies, interconnections
- [Active Docs Index](docs/ACTIVE_DOCS.md) — entry point for all docs
- [HSL Dock Plugins](docs/plugins/HSL-DOCK-PLUGINS.md) — HSLDockAutoHide + HSLWheelBridge docs

---

## Development Workflow

1. **Edit** source files in `src/<PluginName>/` (or `plugins/` for non-migrated)
2. **Build** with `npm run build <PluginName>` (or `npm run watch` for live dev)
3. **Test** — Ctrl+R Discord to reload, plugin auto-picks up via symlink
4. **Commit** — commit `src/` source AND `plugins/` output (BD needs the output)

## Settings Panels

- All panels use solid `#1e1e2e` backgrounds
- Stripped to essentials: statistics + Debug Mode toggle only
- No over-engineered config UIs
