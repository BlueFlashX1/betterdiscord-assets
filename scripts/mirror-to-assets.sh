#!/bin/bash
# Mirror BetterDiscord plugins and themes from betterdiscord-dev to betterdiscord-assets
# This script ensures only production-ready files are copied

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Directories
DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS_DIR="$DEV_DIR/../betterdiscord-assets"
BLOCKED_PLUGINS=(
    "HSLDockNametagBridge.plugin.js"
    "HSLDockLocalDebug.plugin.js"
    "UserPanelDockMover.plugin.js"
)

# Check if assets directory exists
if [ ! -d "$ASSETS_DIR" ]; then
    echo -e "${RED}Error: betterdiscord-assets directory not found at $ASSETS_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}Mirroring BetterDiscord files from dev to assets...${NC}"
echo "Source: $DEV_DIR"
echo "Destination: $ASSETS_DIR"
echo ""

clean_copied_dir() {
    local dir="$1"

    /usr/bin/python3 - "$dir" <<'PY'
import os
import sys

root = sys.argv[1]
blocked_suffixes = (".py", ".sh", ".bak", ".backup")
blocked_names = ("README.md",)

for current_root, dirs, files in os.walk(root):
    for filename in files:
        path = os.path.join(current_root, filename)
        try:
            if filename in blocked_names:
                os.remove(path)
                continue
            if filename.endswith(blocked_suffixes):
                os.remove(path)
        except FileNotFoundError:
            pass
PY
}

is_blocked_plugin() {
    local name="$1"
    for blocked in "${BLOCKED_PLUGINS[@]}"; do
        if [[ "$name" == "$blocked" ]]; then
            return 0
        fi
    done
    return 1
}

# Function to copy plugin
copy_plugin() {
    local plugin_file="$1"
    local plugin_name=$(basename "$plugin_file")

    echo -e "${YELLOW}Copying plugin: $plugin_name${NC}"
    cp "$plugin_file" "$ASSETS_DIR/plugins/"

    # Copy plugin assets directory if it exists
    local plugin_dir="${plugin_file%.plugin.js}"
    if [ -d "$plugin_dir" ]; then
        echo "  Copying assets directory: $(basename "$plugin_dir")"
        cp -r "$plugin_dir" "$ASSETS_DIR/plugins/"
        clean_copied_dir "$ASSETS_DIR/plugins/$(basename "$plugin_dir")"
    fi
}

# Function to copy theme
copy_theme() {
    local theme_file="$1"
    local theme_name=$(basename "$theme_file")

    echo -e "${YELLOW}Copying theme: $theme_name${NC}"
    cp "$theme_file" "$ASSETS_DIR/themes/"

    # Copy theme assets directory if it exists
    local theme_dir="${theme_file%.theme.css}"
    if [ -d "$theme_dir" ]; then
        echo "  Copying assets directory: $(basename "$theme_dir")"
        cp -r "$theme_dir" "$ASSETS_DIR/themes/"
        clean_copied_dir "$ASSETS_DIR/themes/$(basename "$theme_dir")"
    fi
}

# Copy all plugins
echo -e "${GREEN}=== Copying Plugins ===${NC}"
for plugin in "$DEV_DIR/plugins"/*.plugin.js; do
    if [ -f "$plugin" ]; then
        # Skip backup files
        if [[ "$plugin" != *.backup* ]] && [[ "$plugin" != *.bak* ]]; then
            plugin_name="$(basename "$plugin")"
            if is_blocked_plugin "$plugin_name"; then
                echo -e "${YELLOW}Skipping blocked plugin: $plugin_name${NC}"
                continue
            fi
            copy_plugin "$plugin"
        fi
    fi
done

# Copy essential CSS/JS files referenced by plugins
echo ""
echo -e "${GREEN}=== Copying Essential Files ===${NC}"
if [ -f "$DEV_DIR/plugins/shadow-army-widget-styles.css" ]; then
    echo "Copying: shadow-army-widget-styles.css"
    cp "$DEV_DIR/plugins/shadow-army-widget-styles.css" "$ASSETS_DIR/plugins/"
fi

if [ -f "$DEV_DIR/plugins/UnifiedSaveManager.js" ]; then
    echo "Copying: UnifiedSaveManager.js"
    cp "$DEV_DIR/plugins/UnifiedSaveManager.js" "$ASSETS_DIR/plugins/"
fi

if [ -f "$DEV_DIR/plugins/SoloLevelingUtils.js" ]; then
    echo "Copying: SoloLevelingUtils.js"
    cp "$DEV_DIR/plugins/SoloLevelingUtils.js" "$ASSETS_DIR/plugins/"
fi

# Copy all themes
echo ""
echo -e "${GREEN}=== Copying Themes ===${NC}"
for theme in "$DEV_DIR/themes"/*.theme.css; do
    if [ -f "$theme" ]; then
        # Skip backup files
        if [[ "$theme" != *.backup* ]] && [[ "$theme" != *.bak* ]]; then
            copy_theme "$theme"
        fi
    fi
done

echo ""
echo -e "${GREEN}Mirroring complete!${NC}"
echo ""
echo "Files copied to: $ASSETS_DIR"
echo ""
echo "Next steps:"
echo "  1. Review changes in betterdiscord-assets"
echo "  2. Test plugins/themes"
echo "  3. Commit changes if ready"
