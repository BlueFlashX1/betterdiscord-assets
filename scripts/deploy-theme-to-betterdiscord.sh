#!/bin/bash
set -euo pipefail

ASSETS_DIR="${ASSETS_DIR:-$HOME/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes}"
BD_THEMES_DIR="${BD_THEMES_DIR:-$HOME/Library/Application Support/BetterDiscord/themes}"
THEME_FILE="SoloLeveling-ClearVision.theme.css"

[ -f "$ASSETS_DIR/$THEME_FILE" ] || { echo "Missing theme: $ASSETS_DIR/$THEME_FILE" >&2; exit 1; }
[ -d "$ASSETS_DIR/variables" ] || { echo "Missing variables dir: $ASSETS_DIR/variables" >&2; exit 1; }
mkdir -p "$BD_THEMES_DIR"

rsync -a "$ASSETS_DIR/$THEME_FILE" "$BD_THEMES_DIR/"
rsync -a --delete "$ASSETS_DIR/variables/" "$BD_THEMES_DIR/variables/"

echo "Deployed $THEME_FILE + variables -> $BD_THEMES_DIR"
