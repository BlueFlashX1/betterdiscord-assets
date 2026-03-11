# Project Memory

Last updated: 2026-03-11

## Source Of Truth
- For migrated plugins, edit `src/<PluginName>/...` only.
- Build bundles with `node scripts/build-plugin.js <PluginName>`.
- Runtime-loaded files are `plugins/*.plugin.js`, but these are generated output for migrated plugins.

## HP/MP Audit Memory (Discord Plugins)
- HP/MP paths are primarily coordinated across:
  - `src/Dungeons/*`
  - `src/SoloLevelingStats/*`
  - `src/SkillTree/*`
- Main sync/write bridge is in:
  - `src/Dungeons/player-sync-allocation.js`
- Important behavior:
  - User HP damage in dungeon combat is typically applied only when shadows are not available as targets.
  - If shadows stay alive, HP/MP movement can appear minimal.

## Implemented Reliability Note
- `SoloLevelingStats` chat UI updates use throttled + trailing refresh behavior to avoid dropped HP/MP strip updates during burst events.
- Canonical implementation:
  - `src/SoloLevelingStats/chat-ui-core.js`
  - `src/SoloLevelingStats/index.js`

## Known Follow-Up
- Repeated save-guard abort logs exist in `SoloLevelingStats` (`Stats regression detected ... Aborting save`) and should be addressed in a focused persistence pass.
