#!/bin/bash

# Script to re-enable disabled BetterDiscord plugins

PLUGINS_DIR="$HOME/Library/Application Support/BetterDiscord/plugins"
DISABLED_DIR="$PLUGINS_DIR/disabled"

if [ ! -d "$DISABLED_DIR" ]; then
    echo "❌ No disabled plugins folder found"
    exit 1
fi

echo "🔧 Re-enabling BetterDiscord plugins..."
echo ""
echo "Available disabled plugins:"
echo ""

# List all disabled plugins
ls -1 "$DISABLED_DIR"/*.plugin.js 2>/dev/null | while read plugin; do
    basename "$plugin"
done

echo ""
read -p "Enter plugin name to enable (or 'all' for all): " plugin_name

if [ "$plugin_name" = "all" ]; then
    count=0
    for plugin in "$DISABLED_DIR"/*.plugin.js; do
        if [ -f "$plugin" ]; then
            mv "$plugin" "$PLUGINS_DIR/"
            echo "✅ Enabled: $(basename "$plugin")"
            ((count++))
        fi
    done
    echo ""
    echo "✅ Re-enabled $count plugins"
    echo "🔄 Restart Discord to apply changes"
elif [ -n "$plugin_name" ]; then
    disabled_path="$DISABLED_DIR/$plugin_name"
    if [ -f "$disabled_path" ]; then
        mv "$disabled_path" "$PLUGINS_DIR/"
        echo "✅ Enabled: $plugin_name"
        echo "🔄 Restart Discord to apply changes"
    else
        echo "❌ Plugin not found in disabled folder"
    fi
else
    echo "❌ No plugin specified"
fi
