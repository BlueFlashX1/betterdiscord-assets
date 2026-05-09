# BetterDiscord Plugin Workspace

- **Repo**: `betterdiscord-assets` (`https://github.com/BlueFlashX1/betterdiscord-assets.git`)
- **BD plugins folder**: `~/Library/Application Support/BetterDiscord/plugins/`
- **Symlink script**: `scripts/link-all-plugins.sh` (symlinks `plugins/*.plugin.js` to BD folder)

## Build System (esbuild v0.27.3 via `scripts/build-plugin.js`)

- **Entry**: `src/<PluginName>/index.js` + `src/<PluginName>/manifest.json` (auto-injected as JSDoc banner)
- **Output**: `plugins/<PluginName>.plugin.js` — CJS, `platform: node`, `target: node16`, no minification
- **CSS**: `.css` imports bundled as string constants (`loader: { ".css": "text" }`)
- **Commands**: `npm run build <PluginName>` / `npm run watch <PluginName>` / `npm run link:plugin <PluginName>`

## Source Structure (migrated plugins)

```
src/<PluginName>/
  manifest.json   ← { name, description, version, author }
  index.js        ← plugin class, exports module.exports = class ...
  styles.css      ← CSS (imported as string in index.js)
```

**NEVER edit `plugins/<PluginName>.plugin.js` directly for migrated plugins — it is auto-generated.**

## Critical Pattern: FluxDispatcher Acquisition

```javascript
const { Webpack } = BdApi;
this._Dispatcher =
  Webpack.Stores?.UserStore?._dispatcher ||           // Extract from Flux store (MOST RELIABLE)
  Webpack.getModule(m => m.dispatch && m.subscribe) || // NO optional chaining in filter!
  Webpack.getByKeys("actionLogger");                   // Legacy fallback
```

**DO NOT use optional chaining (`?.`) in Webpack filter functions** — it breaks matching.
Apply this pattern to every plugin that needs the Dispatcher.

## BD Constraints

Output must be a single `.plugin.js` file. `BdApi` is global (no import). Node built-ins `fs`, `crypto`, `buffer`, `https` available via BD polyfills. npm packages OK (bundled by esbuild). `child_process`, remote libraries, and minification are banned.

## Development Workflow

1. **Edit** source in `src/<PluginName>/` (migrated) or `plugins/<Name>.plugin.js` (not yet migrated)
2. **Build** with `npm run build <PluginName>` or `npm run watch` for live dev
3. **Test** — Ctrl+R in Discord to reload; symlink picks up output automatically
4. **Commit** both `src/` source and `plugins/` output — BD needs the built output file
5. **Settings panels**: solid `#1e1e2e` background, statistics + Debug Mode toggle only

## Reference

- [Plugin Migration Blueprints](docs/PLUGIN-MIGRATION-BLUEPRINTS.md) — split blueprints for 4 remaining plugins, migration status table, cross-plugin dependencies, shared utilities, historical `*Main.js` artifacts
- [Plugin Codebase Map](docs/plugins/PLUGIN-CODEBASE-MAP-2026-03-03.md) — LOC, dependencies, interconnections (update filename if a newer snapshot exists)
- [Active Docs Index](docs/ACTIVE_DOCS.md) — entry point for all docs
