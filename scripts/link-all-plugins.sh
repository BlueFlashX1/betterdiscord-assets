#!/bin/bash

# Link all plugins from development folder to BetterDiscord plugins folder
# This creates symlinks so BetterDiscord uses the development versions

set -e

# Auto-detect script location (works no matter where you move the directory!)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$SCRIPT_DIR/plugins"
BD_PLUGINS_DIR="$HOME/Library/Application Support/BetterDiscord/plugins"
BLOCKED_PLUGINS=(
    "HSLDockNametagBridge.plugin.js"
    "HSLDockLocalDebug.plugin.js"
)

echo "🔗 Linking BetterDiscord plugins..."
echo "   Source: $DEV_DIR"
echo "   Target: $BD_PLUGINS_DIR"
echo ""

# Check if BetterDiscord plugins directory exists
if [ ! -d "$BD_PLUGINS_DIR" ]; then
    echo "❌ BetterDiscord plugins directory not found: $BD_PLUGINS_DIR"
    exit 1
fi

# Check if development directory exists
if [ ! -d "$DEV_DIR" ]; then
    echo "❌ Development plugins directory not found: $DEV_DIR"
    exit 1
fi

is_blocked_plugin() {
    local name="$1"
    for blocked in "${BLOCKED_PLUGINS[@]}"; do
        if [[ "$name" == "$blocked" ]]; then
            return 0
        fi
    done
    return 1
}

# Process each plugin
cd "$DEV_DIR"
for plugin in *.plugin.js; do
    if [ ! -f "$plugin" ]; then
        continue
    fi

    if is_blocked_plugin "$plugin"; then
        target_path="$BD_PLUGINS_DIR/$plugin"
        echo "Skipping blocked plugin: $plugin"
        if [ -e "$target_path" ] || [ -L "$target_path" ]; then
            echo "  Removing blocked target: $target_path"
            rm -f "$target_path"
        fi
        echo ""
        continue
    fi

    source_path="$DEV_DIR/$plugin"
    target_path="$BD_PLUGINS_DIR/$plugin"

    echo "Processing: $plugin"

    # Remove existing file/symlink if it exists
    if [ -e "$target_path" ] || [ -L "$target_path" ]; then
        echo "  Removing existing: $target_path"
        rm -f "$target_path"
    fi

    # Create symlink
    ln -sf "$source_path" "$target_path"

    # Verify symlink
    if [ -L "$target_path" ] && [ -e "$target_path" ]; then
        echo "  ✅ Linked: $plugin"
    else
        echo "  ❌ Failed to link: $plugin"
    fi
    echo ""
done

echo "✅ All plugins linked successfully!"
echo ""
echo "Linking shared helper JS files..."
for helper in \
    BetterDiscordPluginUtils.js \
    BetterDiscordReactUtils.js \
    SoloLevelingUtils.js \
    UnifiedSaveManager.js \
    LevelProgressBarStyles.js \
    LevelProgressBarRuntimeHelpers.js \
    ShadowPortalCore.js; do
    source_path="$DEV_DIR/$helper"
    target_path="$BD_PLUGINS_DIR/$helper"

    if [ ! -f "$source_path" ]; then
        continue
    fi

    if [ -e "$target_path" ] || [ -L "$target_path" ]; then
        rm -f "$target_path"
    fi

    ln -sf "$source_path" "$target_path"
    if [ -L "$target_path" ] && [ -e "$target_path" ]; then
        echo "  ✅ Linked helper: $helper"
    else
        echo "  ❌ Failed helper link: $helper"
    fi
done
echo ""
echo "Verifying symlinks..."
cd "$BD_PLUGINS_DIR"
for plugin in *.plugin.js; do
    if [ -L "$plugin" ]; then
        if [ -e "$plugin" ]; then
            echo "  ✅ $plugin -> $(readlink "$plugin")"
        else
            echo "  ❌ $plugin (broken symlink)"
        fi
    fi
done
