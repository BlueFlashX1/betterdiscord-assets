#!/bin/bash
set -euo pipefail

SOURCE_ROOT="${SOURCE_ROOT:-$HOME/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets}"
BD_ROOT="${BD_ROOT:-$HOME/Library/Application Support/BetterDiscord}"

CANONICAL_PLUGIN="$SOURCE_ROOT/plugins/ShadowAwayBridge.plugin.js"
LIVE_PLUGIN="$BD_ROOT/plugins/ShadowAwayBridge.plugin.js"

if [[ ! -f "$CANONICAL_PLUGIN" ]]; then
  echo "missing canonical plugin: $CANONICAL_PLUGIN" >&2
  exit 1
fi

if [[ ! -f "$LIVE_PLUGIN" ]]; then
  echo "missing live plugin: $LIVE_PLUGIN" >&2
  exit 1
fi

canonical_sha="$(shasum -a 256 "$CANONICAL_PLUGIN" | awk '{print $1}')"
live_sha="$(shasum -a 256 "$LIVE_PLUGIN" | awk '{print $1}')"

if [[ "$canonical_sha" != "$live_sha" ]]; then
  echo "ShadowAwayBridge drift detected"
  echo "canonical: $canonical_sha"
  echo "live:      $live_sha"
  exit 2
fi

echo "ShadowAwayBridge is in sync ($canonical_sha)"
