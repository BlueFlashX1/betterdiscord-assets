#!/bin/bash
set -euo pipefail

# Canonical source is betterdiscord-assets (single repo since Feb 2026).
SOURCE_ROOT="${SOURCE_ROOT:-$HOME/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets}"
BD_ROOT="${BD_ROOT:-$HOME/Library/Application Support/BetterDiscord}"

ASSETS_THEMES="$SOURCE_ROOT/themes"
ASSETS_PLUGINS="$SOURCE_ROOT/plugins"
BD_THEMES="$BD_ROOT/themes"
BD_PLUGINS="$BD_ROOT/plugins"

DEPLOYED_THEMES=(
  SoloLeveling-ClearVision.theme.css
  SLEndingBest.gif
)

DEPLOYED_PLUGINS=(
  CSSPicker.plugin.js
  CriticalHit.plugin.js
  Dungeons.plugin.js
  ElementInspector2.plugin.js
  HSLDockAutoHide.plugin.js
  HSLWheelBridge.plugin.js
  OverlayClickProbe.plugin.js
  Overlay30sRecorder.plugin.js
  LevelProgressBar.plugin.js
  ShadowArmy.plugin.js
  ShadowAwayBridge.plugin.js
  ShadowExchange.plugin.js
  ShadowSenses.plugin.js
  ShadowStep.plugin.js
  Stealth.plugin.js
  SkillTree.plugin.js
  SoloLevelingStats.plugin.js
  SoloLevelingToasts.plugin.js
  ThemeAutoMaintainer.plugin.js
  ThemeCSSAudit.plugin.js
  TitleManager.plugin.js
)

DEPLOYED_LIBS=(
  BetterDiscordPluginUtils.js
  BetterDiscordReactUtils.js
  SoloLevelingUtils.js
  UnifiedSaveManager.js
  LevelProgressBarStyles.js
  LevelProgressBarRuntimeHelpers.js
  PluginMainLoader.js
  ShadowReconMain.js
  LevelProgressBarMain.js
  HSLDockAutoHideMain.js
  ShadowExchangeMain.js
  StealthMain.js
  TitleManagerMain.js
  ShadowStepMain.js
  ShadowPortalCore.js
)

BLOCKED_PLUGINS=(
  HSLDockNametagBridge.plugin.js
  HSLDockLocalDebug.plugin.js
  UserPanelDockMover.plugin.js
)

mkdir -p "$BD_THEMES" "$BD_PLUGINS"

THEME_LIST=$(mktemp)
PLUGIN_LIST=$(mktemp)
trap 'rm -f "$THEME_LIST" "$PLUGIN_LIST"' EXIT

# Apple's openrsync lacks --ignore-missing-args; filter the list ourselves.
for f in "${DEPLOYED_THEMES[@]}"; do
  [[ -f "$ASSETS_THEMES/$f" ]] && printf '%s\n' "$f"
done > "$THEME_LIST"

for f in "${DEPLOYED_PLUGINS[@]}" "${DEPLOYED_LIBS[@]}"; do
  [[ -f "$ASSETS_PLUGINS/$f" ]] && printf '%s\n' "$f"
done > "$PLUGIN_LIST"

[[ -s "$THEME_LIST" ]] && rsync -a --files-from="$THEME_LIST" "$ASSETS_THEMES/" "$BD_THEMES/"
rsync -a --delete "$ASSETS_THEMES/variables/" "$BD_THEMES/variables/"
[[ -s "$PLUGIN_LIST" ]] && rsync -a --files-from="$PLUGIN_LIST" "$ASSETS_PLUGINS/" "$BD_PLUGINS/"

for blocked in "${BLOCKED_PLUGINS[@]}"; do
  rm -f "$BD_PLUGINS/$blocked"
done

echo "Deployed BetterDiscord runtime from $SOURCE_ROOT -> $BD_ROOT"
