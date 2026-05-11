# AGENTS.md — BetterDiscord plugin suite

> **Local-only file.** Lives on the `dev` branch which is never pushed.
> The `main` branch's allowlist `.gitignore` publishes only `themes/` +
> `assets/`, so this file is automatically excluded from public release.
>
> Read by Claude Code, Cursor, Copilot, Codex. Encode durable plugin-
> suite knowledge so AI sessions inherit institutional context instead
> of rediscovering it.

## What this repo is

- ~28 BetterDiscord plugins under `src/<PluginName>/`
- Built with esbuild `^0.27.3` via `scripts/build-plugin.js` →
  `plugins/<Name>.plugin.js` (CJS, `target: node16`, no minification,
  no source maps)
- Plugin file is symlinked into BD's plugins folder via
  `scripts/link-all-plugins.sh`
- Two-branch workflow: `dev` = full source local-only, NEVER pushed.
  `main` = allowlist gitignore publishing only `themes/` + `assets/`.

## Critical gotchas (will silently break things)

### Sandbox & runtime
- **`require("os")` is banned by BD's sandbox** — load-time
  `ENOENT '/os'`. `fs`, `path`, `crypto`, `buffer`, `https` all work fine.
- **`child_process`, remote libraries, minification — banned by BD.**
  Don't add esbuild plugins that minify.
- **`document.body` with `subtree: true` MutationObserver pegs CPU.**
  Discord mutates the body constantly. Use the narrowest container
  (chat scroller, message list, channel header) and always gate the
  callback on `if (document.hidden) return;`.

### Discord webpack & Flux
- **NEVER use optional chaining inside Webpack filter functions.**
  `Webpack.getModule(m => m?.dispatch && m?.subscribe)` silently
  returns nothing. Write `m => m && m.dispatch && m.subscribe`. The
  optional-chain breaks BdApi's internal matcher.
- **FluxDispatcher acquisition uses a specific waterfall:**
  ```js
  const dispatcher =
    Webpack?.Stores?.UserStore?._dispatcher ||
    Webpack?.getModule((m) => m && m.dispatch && m.subscribe);
  ```
  Use `src/shared/dispatcher.js` instead of rolling your own.
- **Class hashes can be STALE via `Webpack.getByKeys`.** Discord 2026-05
  ships double-underscore hashes (`messageListItem__5126c`);
  `getByKeys` can return an old single-underscore module. Use substring
  attribute selectors (`[class*="messageListItem_"]`) which match both
  — or use `src/shared/discord-classes.js` (`dc.sel.*` / `dc.fb.*`)
  which has fallback built in.
- **Stores: prefer `BdApi.Webpack.getStore("Name")`** for `UserStore`,
  `SelectedChannelStore`, `ChannelStore`, `PresenceStore`, `GuildStore`,
  `SelectedGuildStore`, `VoiceStateStore`, `ThemeStore`, `WindowStore`.
  Subscribe via `.addChangeListener(fn)` / `.removeChangeListener(fn)`.

### File watcher race (causes silent plugin disables)
- **BD's file watcher on macOS has a rename-event race.** Atomic-rename
  writes hit `loadAddon` on an already-loaded plugin → throws
  "alreadyExists" → catch sets state to disabled, no error surfaced
  to user. **Use direct in-place writes** (esbuild default in this
  repo). PluginGuardian auto-reconciles disabled state in staged
  passes on launch.

### Reload behavior
- **Ctrl+R and BD settings toggle don't reliably reload rebuilt plugins.**
  BD/Electron cache plugin bytecode in the require cache. **Full
  Cmd+Q + reopen** when verifying a fix. Console persists across
  Ctrl+R too — stale logs look current. Add a unique startup
  fingerprint log (commit hash + timestamp) when verifying which
  build is actually loaded.

### CSS / theme variable poisoning
- **`var(--font-primary)` is poisoned in this repo.** SoloLevelingTheme
  + SoloLeveling-ClearVision override it to the chunky
  `'Friend or Foe BB'` brand font. Plugin CSS that uses
  `var(--font-primary)` silently renders the wrong font even with
  `!important` winning the cascade. **Always hardcode**
  `'gg sans', system-ui, sans-serif`.

### JS idioms that bite
- **Never use `||` for settings defaults.** `settings.critChance || 10`
  makes a legitimate `0` impossible. Use `??`:
  `settings.critChance ?? 10`. Same for combo counters and any
  numeric setting where `0` is valid.
- **`debugError` MUST NOT gate on `debugMode`.** `debugMode` defaults
  to false and resets on every `loadSettings()`, so a gated
  `debugError` is silently inert in production. Always log via
  `console.error` regardless of debugMode.
- **Save callbacks MUST NOT silently swallow errors.**
  `setTimeout(() => { try { BdApi.Data.save(...) } catch(_){} })` makes
  disk failures invisible AND fires misleading "SUCCESS" logs
  synchronously before the actual save attempt. Move logging inside
  the setTimeout body; surface failures via `debugError`.
- **Snapshot/cache state lives on instance props, never `settings`.**
  `BdApi.Data.save("Plugin", "settings", this.settings)` will
  persist cache data to disk; it shouldn't be there.

### LRU / Set discipline
- **Direct `Set.add` bypasses LRU bookkeeping** when there's a parallel
  ordering array. Always funnel through the dedicated helper
  (e.g. `markAsProcessed()` in CriticalHit) so eviction stays
  consistent and the Set doesn't grow unbounded.

## Conventions (strong)

### Plugin layout
- One directory per plugin: `src/<PluginName>/`
- Required: `index.js`, `manifest.json`. Optional: `styles.css`
  (imported as string via esbuild's `loader: { ".css": "text" }`).
- **Mixin pattern**: `module.exports = class X {...}` in `index.js`,
  then `Object.assign(X.prototype, require('./debug'), …)` at the
  bottom. Each slice file exports a plain object of methods that
  bind via `this`.
- Common slice files: `constants.js` (defaults exported as `C`),
  `<feature>-engine.js`, `observer.js`, `dom-helpers.js`,
  `pipeline.js`, `restoration.js`, `history.js`, `id-extraction.js`,
  `message-filtering.js`, `animation.js`, `styling.js`,
  `settings-panel.js`, `debug.js`.

### Shared modules (`src/shared/`)
Use these instead of rolling your own:

| Module | Use for |
|---|---|
| `header-toolbar.js` | `watchToolbar(onChange)` + `getChannelHeaderToolbar()`. Replaces 2s/3s/5s self-heal polls. |
| `channel-context.js` | `installVoiceChatBodyAttr`, `isVoiceChannelChat`, `isDmChannel`, etc. Body-attr CSS gating. |
| `navigation.js` | `getNavigationUtils()` (cached). |
| `dispatcher.js` | FluxDispatcher acquisition + subscribe/unsubscribe. |
| `discord-classes.js` | `dc.sel.foo` resolved class selectors with substring fallback. |
| `settings.js` | `loadSettings(pluginId, defaults)` / `saveSettings(pluginId, obj)` over `BdApi.Data`. |
| `bd-module-loader.js` | `loadBdModuleFromPlugins(fileName)` for `BetterDiscordPluginUtils.js`, `BetterDiscordReactUtils.js`. |
| `toast.js` | Toast helper with rate-limit and rich-card support. |
| `event-bus.js` | `window.__SL_EventBus` cross-plugin pub/sub. |
| `tracked-timers.js` | Tracked setTimeout/setInterval (auto-cleared on plugin stop). |

### Event-driven > polling
- Replace `setInterval × N attempts` patterns with `MutationObserver`
  that `disconnect()`s on success, with a hard time-ceiling fallback
  (~10s) as safety stop.
- Replace channel-poll patterns with
  `SelectedChannelStore.addChangeListener`.
- Replace presence-poll patterns with
  `PresenceStore.addChangeListener` (200ms debounce).
- BD's plugin lifecycle hook `observer(mutation)` is the cheapest
  DOM-event hook — single global MutationObserver BD already runs.
  Use it for "wait for element X to appear" patterns.
- **Keep as polling**: game-loop heartbeats (combat ticks, HP regen,
  mob spawn), periodic cleanup (GC, history purge), debounced disk
  flushes, activity-time counters. These ARE time-based by design.

### Performance
- `[id$="-${msgId}"]` (suffix anchor) is dramatically faster than
  `[id*="${msgId}"]` (substring) at scale (~hundreds of cached CSS
  rules).
- `node.className.includes(...)` zero-alloc beats
  `Array.from(node.classList).some(...)` per mutation.
- Cache module lookups (`let _cached = null; ...`) — see
  `navigation.js`, `dispatcher.js` for the pattern.

### Settings panels
- Solid `#1e1e2e` background, stats + a Debug Mode toggle only.
  Don't overload.

## Quick build reference

```bash
npm run build <PluginName>          # one plugin
npm run build:all                   # everything
npm run watch <PluginName>          # live dev
npm run link:plugin <PluginName>    # symlink output → BD plugins folder
```

After ANY rebuild of a plugin the user is testing: **tell them to
Cmd+Q + reopen Discord** (not Ctrl+R) to verify.

## Two-branch git workflow

- `dev` — full source tree, tracked normally, **NEVER pushed**. Plugin
  work happens here.
- `main` — allowlist `.gitignore` excludes everything except
  `themes/` + `assets/`. Public-facing only.
- When the user says "commit" without context: ask **what scope**
  (single change vs major checkpoint). The user prefers descriptive
  commit bodies explaining the *why*.
- **Banned**: `git add -A`, force-pushing `main`, pushing `dev`,
  skipping hooks (`--no-verify`).

## "Ask before" — user preferences I've learned

- **Destructive ops**: don't `rm`. `mv` files to
  `~/Downloads/<task>-cleanup-<YYYY-MM-DD>/` instead and let the user
  delete from there.
- **Big refactors**: prefer **multiple small commits as rollback
  points** over one big atomic commit. The polling-elimination
  refactor was 16 commits intentionally.
- **Plugin behavior changes**: confirm with the user before changing
  UX semantics (toast timing, modal behavior, etc.). The
  toast-jump-to-message attempt was reverted because it was
  unreliable across Discord builds — user prefers stable channel-only
  navigation over flaky animation.
- **Polling**: when in doubt, leave it as polling. Replacing a poll
  with events that don't cover an edge case (like ShadowArmy
  member-list auto-show, which doesn't fire a channel-switch event)
  silently breaks features.

## Banned patterns

| Pattern | Why |
|---|---|
| `require("os")` | BD sandbox: load-time crash |
| `Webpack.getModule(m => m?.foo)` (optional chain in filter) | Breaks BdApi matcher silently |
| `document.body` + `subtree:true` MutationObserver | CPU pegs from chat re-renders |
| `var(--font-primary)` in plugin CSS | Theme-poisoned to brand font |
| `settings.foo \|\| DEFAULT` for numeric settings | Coerces legitimate `0` |
| `try { save() } catch(_) {}` with no logging | Silent data loss |
| Atomic-rename writes to `plugins/*.plugin.js` | BD addon-manager race |
| Direct edits to `plugins/<Name>.plugin.js` for migrated plugins | Build output, gets regenerated |
| `git add -A` / `git add .` | Risks committing secrets, untracked debug files |
| Pushing `dev` | Repo policy: dev is local-only |

## Verification protocol when fixing a plugin

1. `npm run build <PluginName>`
2. Tell user: **Cmd+Q + reopen Discord** (NOT Ctrl+R)
3. Have user reproduce the scenario
4. If "still broken": confirm plugin is enabled in BD settings BEFORE
   assuming code is wrong
5. Add a unique startup fingerprint console.log if not sure which
   build is loaded
