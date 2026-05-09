#!/bin/bash

# Script to disable highly demanding BetterDiscord plugins
# This moves them to a disabled folder instead of deleting them

PLUGINS_DIR="$HOME/Library/Application Support/BetterDiscord/plugins"
DISABLED_DIR="$PLUGINS_DIR/disabled"

# Create disabled directory if it doesn't exist
mkdir -p "$DISABLED_DIR"

echo "🔧 Disabling highly demanding BetterDiscord plugins..."
echo ""

# List of highly demanding plugins to disable
HEAVY_PLUGINS=(
    "BetterAnimations.plugin.js"      # 31,500 lines - MASSIVE
    "Translator.plugin.js"             # 2,976 lines - API heavy
    "ImageUtilities.plugin.js"         # 2,268 lines - CPU intensive
    "GuildProfile.plugin.js"           # 2,161 lines - Resource heavy
)

# Also disable aesthetic-only plugins that are resource intensive
AESTHETIC_PLUGINS=(
    "BetterChannelList.plugin.js"
    "BetterChatNames.plugin.js"
    "BetterFolders.plugin.js"
    "BetterFriendList.plugin.js"
    "BetterGuildTooltip.plugin.js"
    "BetterNsfwTag.plugin.js"
    "BetterStats.plugin.js"            # Redundant with SoloLevelingStats
    "ChannelsPreview.plugin.js"
    "MoreRoleColors.plugin.js"
    "RoleMentionIcons.plugin.js"
)

# Combine all plugins to disable
ALL_PLUGINS=("${HEAVY_PLUGINS[@]}" "${AESTHETIC_PLUGINS[@]}")

disabled_count=0
already_disabled=0
not_found=0

for plugin in "${ALL_PLUGINS[@]}"; do
    plugin_path="$PLUGINS_DIR/$plugin"
    disabled_path="$DISABLED_DIR/$plugin"

    if [ -f "$plugin_path" ]; then
        if [ -f "$disabled_path" ]; then
            echo "⚠️  $plugin - Already disabled"
            ((already_disabled++))
        else
            mv "$plugin_path" "$disabled_path"
            echo "✅ Disabled: $plugin"
            ((disabled_count++))
        fi
    else
        echo "ℹ️  $plugin - Not found (may already be disabled)"
        ((not_found++))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary:"
echo "   ✅ Disabled: $disabled_count plugins"
echo "   ⚠️  Already disabled: $already_disabled plugins"
echo "   ℹ️  Not found: $not_found plugins"
echo ""
echo "💡 To re-enable a plugin, move it back from:"
echo "   $DISABLED_DIR"
echo ""
echo "🔄 Restart Discord to apply changes"
