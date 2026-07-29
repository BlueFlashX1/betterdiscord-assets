# BetterDiscord Plugin Workspace

- **Repo**: `betterdiscord-assets` (`https://github.com/matthewqilanthompson/betterdiscord-assets.git`)
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

## Performance Conventions (BD community canon + suite audits, 2026-07)

> Full playbook for perf work + subagent dispatch template: [docs/PERF-CONVENTIONS.md](docs/PERF-CONVENTIONS.md)
> (hard rules R1–R10, verification discipline, do-not-refix registry, risk grading).

- **Webpack module searches are resolved ONCE and cached** — at `start()` (Stealth pattern) or
  memoized in the shared acquirer (`shared/navigation.js`, `shared/discord-classes.js`,
  `shared/dispatcher.js`). `{ searchExports: true }` loops over every export of every module —
  never call it outside a cached one-time resolution. (BD ≥1.13 adds an internal query cache,
  but per-plugin caching remains the convention.)
- **Hot-path ordering:** cheapest, most-likely-to-reject check first. Own-message/monitored-user
  gates come BEFORE any DOM query or fiber walk.
- **Never full-scan the ShadowArmy store** (281k+ records ≈ 45-50s): rank-index + count-capped
  reads, keyset (not offset) pagination, chunked `getShadowsByIds`. Army-wide XP goes through
  the pending-shared-XP accumulator, never per-event grants.
- **Persistence:** `BdApi.Data.save` deferred off hot paths, coalesced (SLS: 20s debounce +
  30s dirty-gated safety net); never re-READ backups on the write path.
- **Observers:** shared hubs (`LayoutObserverBus`, `__SL_ToolbarHub`, `__SL_DomBus`) over
  per-plugin document-wide observers; narrow scope, throttle callbacks, `document.hidden`-gate
  periodic work. DELIBERATE deviation from the community's "patch React render instead of
  observers" advice: Patcher-on-render couples to hashed Discord internals, which rot faster
  than aria/role-anchored DOM observation in this suite's history — keep observers.
- **React:** memoize components in frequently-refreshing containers (FeedCard pattern); module-
  scope ref callbacks that close over nothing.

## BD Constraints

Output must be a single `.plugin.js` file. `BdApi` is global (no import). Node built-ins `fs`, `crypto`, `buffer`, `https` available via BD polyfills. npm packages OK (bundled by esbuild). `child_process`, remote libraries, and minification are banned.

## Development Workflow

1. **Edit** source in `src/<PluginName>/` (migrated) or `plugins/<Name>.plugin.js` (not yet migrated)
2. **Build** with `npm run build <PluginName>` or `npm run watch` for live dev
3. **Test** — Ctrl+R in Discord to reload; symlink picks up output automatically
4. **Commit** both `src/` source and `plugins/` output — BD needs the built output file
5. **Settings panels**: `rgba(10, 10, 16, 0.98)` background, statistics + Debug Mode toggle only

## Reference

- [Plugin Migration Blueprints](docs/PLUGIN-MIGRATION-BLUEPRINTS.md) — split blueprints for 4 remaining plugins, migration status table, cross-plugin dependencies, shared utilities, historical `*Main.js` artifacts
- [Plugin Codebase Map](docs/plugins/PLUGIN-CODEBASE-MAP-2026-03-03.md) — LOC, dependencies, interconnections (update filename if a newer snapshot exists)
- [Active Docs Index](docs/ACTIVE_DOCS.md) — entry point for all docs

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
