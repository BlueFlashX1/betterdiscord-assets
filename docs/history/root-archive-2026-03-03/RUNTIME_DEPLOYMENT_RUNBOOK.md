# BetterDiscord Runtime Deployment Runbook

Last updated: 2026-02-11

## Purpose
This documents the canonical BetterDiscord runtime workflow so future AI sessions do not reintroduce unstable symlink-based runtime links.

## Canonical Source of Truth
- Source repo (publishable/prod assets):
  - `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets`
- Runtime destination used by BetterDiscord app:
  - `/Users/matthewthompson/Library/Application Support/BetterDiscord`

## Policy Decision
- Use **rsync copy deployment** for runtime files (themes + selected plugin files).
- Do **not** keep active runtime files as symlinks to a dev repo.

Why:
- Symlinks tie Discord runtime to mutable dev files and can break if paths change.
- rsync gives stable runtime state and reproducible deploys.

## What Was Changed

### 1) Theme runtime switched from symlink to file copy
These runtime paths are now regular filesystem entries:
- `/Users/matthewthompson/Library/Application Support/BetterDiscord/themes/SoloLeveling-ClearVision.theme.css`
- `/Users/matthewthompson/Library/Application Support/BetterDiscord/themes/variables`

Both are deployed from:
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes`

### 2) Plugin runtime symlinks converted to copied files
Converted plugin runtime files (from symlink to regular file):
- `CSSPicker.plugin.js`
- `CriticalHit.plugin.js`
- `Dungeons.plugin.js`
- `ElementInspector2.plugin.js`
- `HSLDockAutoHide.plugin.js`
- `HSLWheelBridge.plugin.js`
- `LevelProgressBar.plugin.js`
- `ShadowArmy.plugin.js`
- `SkillTree.plugin.js`
- `SoloLevelingStats.plugin.js`
- `SoloLevelingToasts.plugin.js`
- `ThemeAutoMaintainer.plugin.js`
- `TitleManager.plugin.js`

Source folder:
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/plugins`

Destination folder:
- `/Users/matthewthompson/Library/Application Support/BetterDiscord/plugins`

### 3) Deploy script added
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/scripts/deploy-betterdiscord-runtime.sh`

This script rsyncs:
- Theme file + variables
- The selected production plugin `.plugin.js` files listed above

## Standard Deploy Command
```bash
/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/scripts/deploy-betterdiscord-runtime.sh
```

## Backups/Recovery
Backups created during conversion:
- Theme backups:
  - `/Users/matthewthompson/Library/Application Support/BetterDiscord/themes/backups/`
- Plugin symlink conversion backups:
  - `/Users/matthewthompson/Library/Application Support/BetterDiscord/plugins/backups/`

To verify runtime is non-symlink:
```bash
find "/Users/matthewthompson/Library/Application Support/BetterDiscord/themes" -maxdepth 1 -type l
find "/Users/matthewthompson/Library/Application Support/BetterDiscord/plugins" -maxdepth 1 -type l -name "*.plugin.js"
```
Expected: no output for active runtime paths.

## BetterDiscord Performance Notes Applied
- BetterDiscord dev/debug-heavy settings were reduced in:
  - `/Users/matthewthompson/Library/Application Support/BetterDiscord/data/stable/settings.json`
- Discord caches were cleared safely (app closed):
  - `Cache`, `Code Cache`, `GPUCache`, `Service Worker`

## Future AI Guidance
When asked to update BetterDiscord runtime:
1. Edit source files in `betterdiscord-assets` repo.
2. Run the deploy script above.
3. Avoid creating new symlinks in runtime folders unless explicitly requested for temporary dev testing.

## Auto Sync (fswatch + launchd)

Automatic rsync deploy is enabled via:
- Watch script:
  - `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/scripts/auto-rsync-watch.sh`
- LaunchAgent:
  - `/Users/matthewthompson/Library/LaunchAgents/com.betterdiscord.rsync-watch.plist`
- Log file:
  - `/Users/matthewthompson/Library/Logs/BetterDiscord/auto-rsync-watch.log`

Behavior:
- Watches `plugins/`, `themes/SoloLeveling-ClearVision.theme.css`, and `themes/variables/`.
- On file changes, runs `scripts/deploy-betterdiscord-runtime.sh`.

Useful commands:
```bash
launchctl kickstart -k gui/$(id -u)/com.betterdiscord.rsync-watch
tail -f "/Users/matthewthompson/Library/Logs/BetterDiscord/auto-rsync-watch.log"
```
