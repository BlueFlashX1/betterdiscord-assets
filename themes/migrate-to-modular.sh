#!/bin/bash
# Automated Migration Script: SoloLeveling-ClearVision.theme.css → Modular Variables
# ============================================================================
# This script performs bulk find-and-replace operations to migrate hardcoded
# values to semantic modular variable tokens.
#
# USAGE:
#   ./migrate-to-modular.sh
#
# SAFETY:
#   - Creates timestamped backup before any changes
#   - Can be run multiple times safely
#   - Review changes with: git diff SoloLeveling-ClearVision.theme.css
# ============================================================================

set -e  # Exit on error

THEME_FILE="SoloLeveling-ClearVision.theme.css"
BACKUP_FILE="SoloLeveling-ClearVision.theme.css.automated-migration-$(date +%Y%m%d-%H%M%S)"

# Check if theme file exists
if [ ! -f "$THEME_FILE" ]; then
    echo "❌ Error: $THEME_FILE not found"
    exit 1
fi

echo "🔄 Starting automated migration..."
echo "📋 Theme file: $THEME_FILE"
echo "💾 Creating backup: $BACKUP_FILE"

# Create backup
cp "$THEME_FILE" "$BACKUP_FILE"

echo ""
echo "🔧 Phase 1: Typography Tokens"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Font family replacements
perl -i -pe 's/font-family:\s*var\(--main-font\)/font-family: var(--sl-type-font-primary)/g' "$THEME_FILE"
perl -i -pe 's/font-family:\s*var\(--code-font\)/font-family: var(--sl-type-font-code)/g' "$THEME_FILE"
perl -i -pe 's/font-family:\s*var\(--heading-font\)/font-family: var(--sl-type-font-heading)/g' "$THEME_FILE"

# Font weight replacements (not in calc() or other functions)
perl -i -pe 's/font-weight:\s*300(?![0-9])/font-weight: var(--sl-type-weight-light)/g' "$THEME_FILE"
perl -i -pe 's/font-weight:\s*400(?![0-9])/font-weight: var(--sl-type-weight-normal)/g' "$THEME_FILE"
perl -i -pe 's/font-weight:\s*500(?![0-9])/font-weight: var(--sl-type-weight-medium)/g' "$THEME_FILE"
perl -i -pe 's/font-weight:\s*600(?![0-9])/font-weight: var(--sl-type-weight-semibold)/g' "$THEME_FILE"
perl -i -pe 's/font-weight:\s*700(?![0-9])/font-weight: var(--sl-type-weight-bold)/g' "$THEME_FILE"

echo "✅ Typography tokens migrated"

echo ""
echo "🔧 Phase 2: Effect Tokens (Glows, Shadows, Transitions)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Glow effects (box-shadow with purple rgba)
perl -i -pe 's/box-shadow:\s*0\s+0\s+4px\s+rgba\(139,\s*92,\s*246,\s*0\.1\)/box-shadow: var(--sl-effect-glow-subtle)/g' "$THEME_FILE"
perl -i -pe 's/box-shadow:\s*0\s+0\s+6px\s+rgba\(139,\s*92,\s*246,\s*0\.15\)/box-shadow: var(--sl-effect-glow-light)/g' "$THEME_FILE"
perl -i -pe 's/box-shadow:\s*0\s+0\s+8px\s+rgba\(139,\s*92,\s*246,\s*0\.2\)/box-shadow: var(--sl-effect-glow-medium)/g' "$THEME_FILE"
perl -i -pe 's/box-shadow:\s*0\s+0\s+10px\s+rgba\(139,\s*92,\s*246,\s*0\.25\)/box-shadow: var(--sl-effect-glow-strong)/g' "$THEME_FILE"
perl -i -pe 's/box-shadow:\s*0\s+0\s+12px\s+rgba\(139,\s*92,\s*246,\s*0\.35\)/box-shadow: var(--sl-effect-glow-bold)/g' "$THEME_FILE"
perl -i -pe 's/box-shadow:\s*0\s+0\s+14px\s+rgba\(139,\s*92,\s*246,\s*0\.4\)/box-shadow: var(--sl-effect-glow-intense)/g' "$THEME_FILE"

# Text shadows
perl -i -pe 's/text-shadow:\s*0\s+1px\s+2px\s+rgba\(0,\s*0,\s*0,\s*0\.2\)/text-shadow: var(--sl-effect-text-shadow-darkest)/g' "$THEME_FILE"
perl -i -pe 's/text-shadow:\s*0\s+1px\s+1px\s+rgba\(0,\s*0,\s*0,\s*0\.28\)/text-shadow: var(--sl-effect-text-shadow-dark)/g' "$THEME_FILE"
perl -i -pe 's/text-shadow:\s*0\s+0\s+3px\s+rgba\(0,\s*0,\s*0,\s*0\.28\)/text-shadow: var(--sl-effect-text-shadow-subtle)/g' "$THEME_FILE"
perl -i -pe 's/text-shadow:\s*0\s+0\s+6px\s+rgba\(139,\s*92,\s*246,\s*0\.25\)/text-shadow: var(--sl-effect-text-shadow-medium)/g' "$THEME_FILE"

# Transitions
perl -i -pe 's/transition:\s*all\s+0\.15s\s+ease/transition: var(--sl-effect-transition-fast)/g' "$THEME_FILE"
perl -i -pe 's/transition:\s*all\s+0\.2s\s+ease/transition: var(--sl-effect-transition-normal)/g' "$THEME_FILE"
perl -i -pe 's/transition:\s*all\s+0\.3s\s+ease(?!-)/transition: var(--sl-effect-transition-slow)/g' "$THEME_FILE"
perl -i -pe 's/transition:\s*box-shadow\s+0\.2s\s+ease/transition: var(--sl-effect-transition-glow)/g' "$THEME_FILE"

echo "✅ Effect tokens migrated"

echo ""
echo "🔧 Phase 3: Border Tokens"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Border replacements
perl -i -pe 's/border:\s*1px\s+solid\s+rgba\(139,\s*92,\s*246,\s*0\.1\)/border: var(--sl-effect-border-purple-subtle)/g' "$THEME_FILE"
perl -i -pe 's/border:\s*1px\s+solid\s+rgba\(139,\s*92,\s*246,\s*0\.15\)/border: var(--sl-effect-border-purple-light)/g' "$THEME_FILE"
perl -i -pe 's/border:\s*1px\s+solid\s+rgba\(139,\s*92,\s*246,\s*0\.2\)/border: var(--sl-effect-border-purple-medium)/g' "$THEME_FILE"
perl -i -pe 's/border:\s*1px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0\.06\)/border: var(--sl-effect-border-white-subtle)/g' "$THEME_FILE"

echo "✅ Border tokens migrated"

echo ""
echo "🔧 Phase 4: Color Tokens"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Primary colors (be careful with hex codes in comments)
perl -i -pe 's/:\s*#8a2be2(?=\s*;|!important)/: var(--sl-color-primary)/g' "$THEME_FILE"
perl -i -pe 's/:\s*#ba55d3(?=\s*;|!important)/: var(--sl-color-primary-hover)/g' "$THEME_FILE"

# Status colors
perl -i -pe 's/:\s*#00ff88(?=\s*;|!important)/: var(--sl-color-status-success)/g' "$THEME_FILE"
perl -i -pe 's/:\s*#ff4444(?=\s*;|!important)/: var(--sl-color-status-danger)/g' "$THEME_FILE"
perl -i -pe 's/:\s*#ffaa00(?=\s*;|!important)/: var(--sl-color-status-warning)/g' "$THEME_FILE"

echo "✅ Color tokens migrated"

echo ""
echo "🔧 Phase 5: Spacing Tokens"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Border radius (specific to avoid catching background-size: 8px)
perl -i -pe 's/border-radius:\s*8px/border-radius: var(--sl-space-radius-control)/g' "$THEME_FILE"
perl -i -pe 's/border-radius:\s*14px/border-radius: var(--sl-space-radius-surface)/g' "$THEME_FILE"
perl -i -pe 's/border-radius:\s*999px/border-radius: var(--sl-space-radius-pill)/g' "$THEME_FILE"
perl -i -pe 's/border-radius:\s*50%/border-radius: var(--sl-space-radius-circle)/g' "$THEME_FILE"

echo "✅ Spacing tokens migrated"

echo ""
echo "✅ Migration Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Summary:"
echo "  • Backup saved: $BACKUP_FILE"
echo "  • Theme file updated: $THEME_FILE"
echo ""
echo "🧪 Next Steps:"
echo "  1. Review changes: git diff $THEME_FILE"
echo "  2. Test in Discord client"
echo "  3. Verify no visual regressions"
echo "  4. If issues, restore: cp \"$BACKUP_FILE\" \"$THEME_FILE\""
echo ""
echo "📍 Documentation:"
echo "  • Migration guide: MIGRATION-GUIDE.md"
echo "  • Variable reference: variables/README.md"
echo ""
