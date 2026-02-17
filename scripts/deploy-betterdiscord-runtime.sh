#!/bin/bash
set -euo pipefail

ASSETS_ROOT="${ASSETS_ROOT:-$HOME/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets}"
BD_ROOT="${BD_ROOT:-$HOME/Library/Application Support/BetterDiscord}"

ASSETS_THEMES="$ASSETS_ROOT/themes"
ASSETS_PLUGINS="$ASSETS_ROOT/plugins"
BD_THEMES="$BD_ROOT/themes"
BD_PLUGINS="$BD_ROOT/plugins"
BLOCKED_PLUGINS=(
  "HSLDockNametagBridge.plugin.js"
  "HSLDockLocalDebug.plugin.js"
  "UserPanelDockMover.plugin.js"
)

mkdir -p "$BD_THEMES" "$BD_PLUGINS"

# Theme deployment (production copy)
rsync -a "$ASSETS_THEMES/SoloLeveling-ClearVision.theme.css" "$BD_THEMES/"
rsync -a --delete "$ASSETS_THEMES/variables/" "$BD_THEMES/variables/"
rsync -a "$ASSETS_THEMES/SLEndingBest.gif" "$BD_THEMES/"

# Plugin deployment (copy canonical plugin files)
for f in \
  CSSPicker.plugin.js \
  CriticalHit.plugin.js \
  Dungeons.plugin.js \
  ElementInspector2.plugin.js \
  HSLDockAutoHide.plugin.js \
  HSLWheelBridge.plugin.js \
  OverlayClickProbe.plugin.js \
  Overlay30sRecorder.plugin.js \
  LevelProgressBar.plugin.js \
  ShadowArmy.plugin.js \
  ShadowExchange.plugin.js \
  SkillTree.plugin.js \
  SoloLevelingStats.plugin.js \
  SoloLevelingToasts.plugin.js \
  ThemeAutoMaintainer.plugin.js \
  ThemeCSSAudit.plugin.js \
  TitleManager.plugin.js
  do
  if [[ -f "$ASSETS_PLUGINS/$f" ]]; then
    rsync -a "$ASSETS_PLUGINS/$f" "$BD_PLUGINS/"
  fi
done

# Deploy shared libraries (non-plugin JS files required by plugins)
for lib in \
  SoloLevelingUtils.js
  do
  if [[ -f "$ASSETS_PLUGINS/$lib" ]]; then
    rsync -a "$ASSETS_PLUGINS/$lib" "$BD_PLUGINS/"
  fi
done

# Enforce removal of blocked plugins so deploy never re-introduces them.
for blocked in "${BLOCKED_PLUGINS[@]}"; do
  rm -f "$BD_PLUGINS/$blocked"
done

echo "Deployed BetterDiscord runtime from $ASSETS_ROOT -> $BD_ROOT"
