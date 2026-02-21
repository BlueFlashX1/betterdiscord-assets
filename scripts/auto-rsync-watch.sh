#!/bin/bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Canonical source is betterdiscord-dev. Keep ASSETS_ROOT override for backwards compatibility.
SOURCE_ROOT="${SOURCE_ROOT:-${ASSETS_ROOT:-$HOME/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev}}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-$SOURCE_ROOT/scripts/deploy-betterdiscord-runtime.sh}"
LOG_DIR="$HOME/Library/Logs/BetterDiscord"
LOG_FILE="$LOG_DIR/auto-rsync-watch.log"

mkdir -p "$LOG_DIR"

FSWATCH_BIN="$(command -v fswatch || true)"
if [[ -z "$FSWATCH_BIN" && -x "/opt/homebrew/bin/fswatch" ]]; then
  FSWATCH_BIN="/opt/homebrew/bin/fswatch"
fi

if [[ -z "$FSWATCH_BIN" ]]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') fswatch not found" >> "$LOG_FILE"
  exit 1
fi

if [[ ! -x "$DEPLOY_SCRIPT" ]]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') deploy script missing or not executable: $DEPLOY_SCRIPT" >> "$LOG_FILE"
  exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') watcher started (fswatch: $FSWATCH_BIN)" >> "$LOG_FILE"

watch_paths=(
  "$SOURCE_ROOT/plugins"
  "$SOURCE_ROOT/themes/SoloLeveling-ClearVision.theme.css"
  "$SOURCE_ROOT/themes/variables"
)

"$FSWATCH_BIN" -o -r --latency 0.8 \
  --exclude '\\.git/' \
  --exclude '/docs/' \
  --exclude '/archive/' \
  --exclude '/reports/' \
  --exclude '/node_modules/' \
  --exclude '/\.DS_Store$' \
  "${watch_paths[@]}" | while read -r _; do
  {
    echo "$(date '+%Y-%m-%d %H:%M:%S') change detected, deploying"
    "$DEPLOY_SCRIPT"
    echo "$(date '+%Y-%m-%d %H:%M:%S') deploy complete"
  } >> "$LOG_FILE" 2>&1
done
