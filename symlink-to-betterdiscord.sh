#!/bin/bash

set -euo pipefail

# Auto-detect script location (works no matter where you move the directory!)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/themes"

BETTERDISCORD_THEMES="$HOME/Library/Application Support/BetterDiscord/themes"

THEME_NAME="SoloLeveling-ClearVision.theme.css"

TARGET_THEME="$BETTERDISCORD_THEMES/$THEME_NAME"
TARGET_VARS_DIR="$BETTERDISCORD_THEMES/variables"

SOURCE_THEME="$SOURCE_DIR/$THEME_NAME"
SOURCE_VARS_DIR="$SOURCE_DIR/variables"

if [ ! -d "$BETTERDISCORD_THEMES" ]; then
  echo "Error: BetterDiscord themes directory not found: $BETTERDISCORD_THEMES" >&2
  exit 1
fi

if [ ! -f "$SOURCE_THEME" ]; then
  echo "Error: Source theme file not found: $SOURCE_THEME" >&2
  exit 1
fi

if [ ! -d "$SOURCE_VARS_DIR" ]; then
  echo "Error: Source variables directory not found: $SOURCE_VARS_DIR" >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BETTERDISCORD_THEMES/Archive/symlink-backup-$TS"
mkdir -p "$BACKUP_DIR"

backup_path() {
  local name="$1"
  echo "$BACKUP_DIR/$name"
}

move_or_remove_target() {
  local target="$1"
  local backup_name="$2"

  if [ -L "$target" ]; then
    rm "$target"
    return 0
  fi

  if [ -e "$target" ]; then
    mv "$target" "$(backup_path "$backup_name")"
  fi
}

move_or_remove_target "$TARGET_THEME" "$THEME_NAME"
move_or_remove_target "$TARGET_VARS_DIR" "variables"

ln -s "$SOURCE_THEME" "$TARGET_THEME"
ln -s "$SOURCE_VARS_DIR" "$TARGET_VARS_DIR"

echo "Symlink mode enabled."
echo "Backup dir: $BACKUP_DIR"
echo "Theme symlink: $(readlink "$TARGET_THEME")"
echo "Vars symlink:  $(readlink "$TARGET_VARS_DIR")"
echo ""
echo "Next: Reload Discord / toggle the theme off+on."
