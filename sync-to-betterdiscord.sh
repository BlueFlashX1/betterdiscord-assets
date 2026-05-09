#!/bin/bash
# Sync Migrated Theme to BetterDiscord Installation
# ============================================================================
# Copies the migrated theme and modular variables to the actual BetterDiscord
# themes directory where Discord detects and loads themes.
#
# USAGE: ./sync-to-betterdiscord.sh
# ============================================================================

set -e

BETTERDISCORD_THEMES="$HOME/Library/Application Support/BetterDiscord/themes"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/themes" && pwd)"
TARGET_THEME="$BETTERDISCORD_THEMES/SoloLeveling-ClearVision.theme.css"
TARGET_VARS_DIR="$BETTERDISCORD_THEMES/variables"

if [ -L "$TARGET_THEME" ] || [ -L "$TARGET_VARS_DIR" ]; then
    echo "Symlink mode enabled. No copy needed."
    echo "Theme: $(readlink "$TARGET_THEME" 2>/dev/null || echo "$TARGET_THEME")"
    echo "Vars:  $(readlink "$TARGET_VARS_DIR" 2>/dev/null || echo "$TARGET_VARS_DIR")"
    exit 0
fi

echo "🔄 Syncing to BetterDiscord installation..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📂 Source: $SOURCE_DIR"
echo "📂 Target: $BETTERDISCORD_THEMES"
echo ""

# Check if BetterDiscord themes directory exists
if [ ! -d "$BETTERDISCORD_THEMES" ]; then
    echo "❌ Error: BetterDiscord themes directory not found"
    echo "   Expected: $BETTERDISCORD_THEMES"
    exit 1
fi

# Create backup of current theme
if [ -f "$BETTERDISCORD_THEMES/SoloLeveling-ClearVision.theme.css" ]; then
    echo "💾 Creating backup of current theme..."
    cp "$BETTERDISCORD_THEMES/SoloLeveling-ClearVision.theme.css" \
       "$BETTERDISCORD_THEMES/SoloLeveling-ClearVision.theme.css.backup-$(date +%Y%m%d-%H%M%S)"
    echo "✅ Backup created"
fi

# Copy variables directory
echo ""
echo "📁 Copying variables directory..."
cp -r "$SOURCE_DIR/variables" "$BETTERDISCORD_THEMES/"
echo "✅ Variables directory copied"

# Copy migrated theme
echo ""
echo "🎨 Copying migrated theme..."
cp "$SOURCE_DIR/SoloLeveling-ClearVision.theme.css" "$BETTERDISCORD_THEMES/"
echo "✅ Theme copied"

# Copy template theme (optional)
echo ""
echo "📄 Copying modular template theme..."
cp "$SOURCE_DIR/SoloLeveling-Modular.theme.css" "$BETTERDISCORD_THEMES/"
echo "✅ Template copied"

# Verify
echo ""
echo "🔍 Verifying sync..."
if [ -f "$BETTERDISCORD_THEMES/SoloLeveling-ClearVision.theme.css" ] && \
   [ -d "$BETTERDISCORD_THEMES/variables" ]; then
    echo "✅ All files present"

    # Check for import statement
    if grep -q "@import url('./variables/variables.css')" "$BETTERDISCORD_THEMES/SoloLeveling-ClearVision.theme.css"; then
        echo "✅ Modular import present"
    else
        echo "⚠️  Import statement not found (this shouldn't happen)"
    fi

    # Count modular tokens
    TOKEN_COUNT=$(grep -c "var(--sl-" "$BETTERDISCORD_THEMES/SoloLeveling-ClearVision.theme.css" || echo "0")
    echo "✅ Modular tokens in use: $TOKEN_COUNT+"
else
    echo "❌ Sync verification failed"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Sync Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Files in BetterDiscord themes directory:"
ls -lh "$BETTERDISCORD_THEMES" | grep -E "Solo|variables" | sed 's/^/   /'
echo ""
echo "🚀 Next Steps:"
echo "   1. Open Discord"
echo "   2. Settings → Themes"
echo "   3. Disable and re-enable 'Solo Leveling (ClearVision Base)'"
echo "   4. Theme will reload with modular variables"
echo ""
echo "💡 Note: If theme was already enabled, you may need to:"
echo "   - Disable theme"
echo "   - Restart Discord (Ctrl+R or Cmd+R)"
echo "   - Re-enable theme"
echo ""
