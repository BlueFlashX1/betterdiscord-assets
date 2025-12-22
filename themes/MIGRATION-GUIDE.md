# Migration Guide: Modular Variables in SoloLeveling-ClearVision.theme.css

**Date:** December 21, 2025  
**Status:** In Progress  
**File:** `SoloLeveling-ClearVision.theme.css` (4,467 lines)

---

## Overview

This guide provides a systematic approach to migrating the existing Solo Leveling theme to use modular variables with semantic tokens.

---

## Migration Strategy

### Phase 1: Import Added ✅

```css
@import url('./variables/variables.css');
```

**Status:** Complete  
**Impact:** All modular variables now available

---

### Phase 2: Typography Migration (In Progress)

Replace hardcoded font properties with semantic tokens.

#### Find and Replace Patterns

| Find                            | Replace                                       | Impact             |
| ------------------------------- | --------------------------------------------- | ------------------ |
| `font-family: var(--main-font)` | `font-family: var(--sl-type-font-primary)`    | Semantic naming    |
| `font-family: var(--code-font)` | `font-family: var(--sl-type-font-code)`       | Semantic naming    |
| `font-weight: 400`              | `font-weight: var(--sl-type-weight-normal)`   | Consistent weights |
| `font-weight: 500`              | `font-weight: var(--sl-type-weight-medium)`   | Consistent weights |
| `font-weight: 600`              | `font-weight: var(--sl-type-weight-semibold)` | Consistent weights |
| `font-weight: 700`              | `font-weight: var(--sl-type-weight-bold)`     | Consistent weights |

**Completed:**

- ✅ Code blocks migrated to `--sl-type-font-code`
- ✅ Input fields migrated to `--sl-type-font-primary`
- ✅ Buttons migrated to `--sl-type-font-primary` with `--sl-type-weight-medium`

---

### Phase 3: Color Migration

Replace hardcoded colors with semantic color tokens.

#### Primary Colors

| Find      | Replace                          | Occurrences |
| --------- | -------------------------------- | ----------- |
| `#8a2be2` | `var(--sl-color-primary)`        | ~50+        |
| `#ba55d3` | `var(--sl-color-primary-hover)`  | ~20+        |
| `#00ff88` | `var(--sl-color-status-success)` | ~15+        |
| `#ff4444` | `var(--sl-color-status-danger)`  | ~10+        |

#### Background Colors

| Find                     | Replace                                  |
| ------------------------ | ---------------------------------------- |
| `rgba(10, 10, 15, 0.05)` | `var(--sl-color-bg-alpha-5)`             |
| `rgba(10, 10, 15, 0.5)`  | `var(--sl-color-bg-alpha-50)`            |
| `rgba(10, 10, 15, 0.75)` | `var(--sl-color-bg-alpha-75)`            |
| `rgba(15, 15, 25, 1)`    | `var(--sl-color-bg-surface)`             |
| `rgba(20, 20, 30, 0.8)`  | `var(--sl-color-bg-elevated)` with alpha |

#### Purple Alpha Variations

| Find                       | Replace                           |
| -------------------------- | --------------------------------- |
| `rgba(139, 92, 246, 0.1)`  | `var(--sl-color-purple-alpha-10)` |
| `rgba(139, 92, 246, 0.15)` | `var(--sl-color-purple-alpha-15)` |
| `rgba(139, 92, 246, 0.2)`  | `var(--sl-color-purple-alpha-20)` |
| `rgba(139, 92, 246, 0.25)` | `var(--sl-color-purple-alpha-25)` |
| `rgba(139, 92, 246, 0.35)` | `var(--sl-color-purple-alpha-35)` |
| `rgba(139, 92, 246, 0.4)`  | `var(--sl-color-purple-alpha-40)` |

---

### Phase 4: Glow Effects Migration

Replace hardcoded box-shadow glows with semantic effect tokens.

#### Glow Patterns (30+ instances found)

| Current Pattern                     | Replace With                       | Lines     |
| ----------------------------------- | ---------------------------------- | --------- |
| `0 0 8px rgba(139, 92, 246, 0.2)`   | `var(--sl-effect-glow-medium)`     | Multiple  |
| `0 0 10px rgba(139, 92, 246, 0.25)` | `var(--sl-effect-glow-strong)`     | Multiple  |
| `0 0 12px rgba(139, 92, 246, 0.35)` | `var(--sl-effect-glow-bold)`       | Multiple  |
| `0 0 14px rgba(139, 92, 246, 0.4)`  | `var(--sl-effect-glow-intense)`    | Multiple  |
| `0 0 22px rgba(139, 92, 246, 0.34)` | `var(--sl-effect-glow-very-heavy)` | Line 3684 |

#### Specific Replacements Needed

**Line 1303:** Card hover

```css
/* Before */
box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38), 0 0 0 1px rgba(139, 92, 246, 0.35) !important;

/* After */
box-shadow: var(--sl-effect-shadow-card-hover), 0 0 0 1px var(--sl-color-purple-alpha-35) !important;
```

**Line 1503:** Intense glow

```css
/* Before */
box-shadow: 0 0 12px rgba(139, 92, 246, 0.6) !important;

/* After - create new token or use existing */
box-shadow: var(--sl-effect-glow-very-heavy) !important;
```

**Lines 3684:** Selected button

```css
/* Before */
box-shadow: 0 0 22px rgba(139, 92, 246, 0.34), inset 0 0 0 1px rgba(255, 255, 255, 0.1) !important;

/* After */
box-shadow: var(--sl-effect-shadow-button-selected) !important;
```

---

### Phase 5: Text Shadow Migration

Replace hardcoded text-shadow with semantic tokens.

| Current Pattern                    | Replace With                           |
| ---------------------------------- | -------------------------------------- |
| `0 0 3px rgba(0, 0, 0, 0.28)`      | `var(--sl-effect-text-shadow-subtle)`  |
| `0 0 6px rgba(139, 92, 246, 0.25)` | `var(--sl-effect-text-shadow-medium)`  |
| `0 1px 1px rgba(0, 0, 0, 0.28)`    | `var(--sl-effect-text-shadow-dark)`    |
| `0 1px 2px rgba(0, 0, 0, 0.2)`     | `var(--sl-effect-text-shadow-darkest)` |

---

### Phase 6: Border Migration

Replace hardcoded borders with semantic border tokens.

| Current Pattern                       | Replace With                            |
| ------------------------------------- | --------------------------------------- |
| `1px solid rgba(139, 92, 246, 0.1)`   | `var(--sl-effect-border-purple-subtle)` |
| `1px solid rgba(139, 92, 246, 0.15)`  | `var(--sl-effect-border-purple-light)`  |
| `1px solid rgba(139, 92, 246, 0.2)`   | `var(--sl-effect-border-purple-medium)` |
| `1px solid rgba(255, 255, 255, 0.06)` | `var(--sl-effect-border-white-subtle)`  |

---

### Phase 7: Transition Migration

Replace hardcoded transitions with semantic tokens.

| Current Pattern        | Replace With                         |
| ---------------------- | ------------------------------------ |
| `all 0.15s ease`       | `var(--sl-effect-transition-fast)`   |
| `all 0.2s ease`        | `var(--sl-effect-transition-normal)` |
| `all 0.3s ease`        | `var(--sl-effect-transition-slow)`   |
| `box-shadow 0.2s ease` | `var(--sl-effect-transition-glow)`   |

---

## Automated Migration Script

For bulk replacements, use this script:

```bash
#!/bin/bash
# migrate-to-modular.sh

THEME_FILE="SoloLeveling-ClearVision.theme.css"
BACKUP="SoloLeveling-ClearVision.theme.css.pre-automated-migration-$(date +%Y%m%d-%H%M%S)"

# Create backup
cp "$THEME_FILE" "$BACKUP"

# Typography replacements
sed -i '' 's/font-family: var(--main-font)/font-family: var(--sl-type-font-primary)/g' "$THEME_FILE"
sed -i '' 's/font-family: var(--code-font)/font-family: var(--sl-type-font-code)/g' "$THEME_FILE"
sed -i '' 's/font-weight: 400/font-weight: var(--sl-type-weight-normal)/g' "$THEME_FILE"
sed -i '' 's/font-weight: 500/font-weight: var(--sl-type-weight-medium)/g' "$THEME_FILE"

# Glow replacements (most common first)
sed -i '' 's/box-shadow: 0 0 8px rgba(139, 92, 246, 0\.2)/box-shadow: var(--sl-effect-glow-medium)/g' "$THEME_FILE"
sed -i '' 's/box-shadow: 0 0 10px rgba(139, 92, 246, 0\.25)/box-shadow: var(--sl-effect-glow-strong)/g' "$THEME_FILE"
sed -i '' 's/box-shadow: 0 0 12px rgba(139, 92, 246, 0\.35)/box-shadow: var(--sl-effect-glow-bold)/g' "$THEME_FILE"

# Text shadow replacements
sed -i '' 's/text-shadow: 0 1px 2px rgba(0, 0, 0, 0\.2)/text-shadow: var(--sl-effect-text-shadow-darkest)/g' "$THEME_FILE"
sed -i '' 's/text-shadow: 0 1px 1px rgba(0, 0, 0, 0\.28)/text-shadow: var(--sl-effect-text-shadow-dark)/g' "$THEME_FILE"

echo "Migration complete! Backup saved to: $BACKUP"
echo "Review changes and test in Discord before committing."
```

---

## Manual Migration Checklist

### High-Impact Sections (Migrate First)

- [x] Typography (fonts, weights) - Partially complete
- [ ] Server list glows
- [ ] Channel list selection
- [ ] Member list avatar glows
- [ ] Message hover effects
- [ ] Button styles
- [ ] Modal shadows
- [ ] Tooltip glows
- [ ] Status indicators
- [ ] Scrollbar gradients

### Medium-Impact Sections

- [ ] Loading screens
- [ ] Reactions
- [ ] Embeds
- [ ] Context menus
- [ ] User popouts
- [ ] Settings panels

### Low-Impact Sections

- [ ] Animations (keep as-is initially)
- [ ] Edge cases
- [ ] Rare UI elements

---

## Testing After Each Phase

1. **Visual Check:** Compare before/after screenshots
2. **Console Check:** No CSS errors
3. **Interaction Test:** Hover, click, focus states work
4. **Performance:** No load time increase

---

## Example Migrations (Completed)

### Typography Section ✅

**Before:**

```css
code {
  font-family: var(--code-font) !important;
  font-weight: 400 !important;
}
```

**After:**

```css
code {
  font-family: var(--sl-type-font-code) !important;
  font-weight: var(--sl-type-weight-normal) !important;
}
```

**Benefits:** Semantic naming, centralized weight management

---

### Next Section to Migrate: Server List Glows

Find server list glow patterns and replace with semantic tokens.

**Pattern to find:**

```css
box-shadow: 0 0 [size] rgba(139, 92, 246, [alpha]) !important;
```

**Replace with appropriate token:**

- 4px + 0.1 alpha → `var(--sl-effect-glow-subtle)`
- 6px + 0.15 alpha → `var(--sl-effect-glow-light)`
- 8px + 0.2 alpha → `var(--sl-effect-glow-medium)`
- 10px + 0.25 alpha → `var(--sl-effect-glow-strong)`
- 12px + 0.35 alpha → `var(--sl-effect-glow-bold)`
- 14px + 0.4 alpha → `var(--sl-effect-glow-intense)`

---

## Benefits of Migration

### Before (Hardcoded)

```css
.button:hover {
  background: #ba55d3;
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.25);
  border: 1px solid rgba(139, 92, 246, 0.2);
  transition: all 0.2s ease;
}
```

**Issues:**

- 4 hardcoded values
- Not maintainable
- Can't create variants easily

### After (Semantic Tokens)

```css
.button:hover {
  background: var(--sl-color-primary-hover);
  box-shadow: var(--sl-effect-glow-strong);
  border: var(--sl-effect-border-purple-medium);
  transition: var(--sl-effect-transition-normal);
}
```

**Benefits:**

- Self-documenting
- Single source of truth
- Easy to create variants
- Maintainable

---

## Progress Tracking

### Sections Migrated

- [x] Import statement added
- [x] Code blocks typography
- [x] Input fields typography
- [x] Button typography
- [ ] Server list (0/50 rules)
- [ ] Channel list (0/80 rules)
- [ ] Member list (0/40 rules)
- [ ] Messages (0/100 rules)
- [ ] Modals (0/60 rules)
- [ ] Tooltips (0/30 rules)

### Estimated Progress

**Lines migrated:** ~50 / 4,467 (1%)  
**Sections migrated:** 3 / 22 (14%)  
**Estimated time to complete:** 8-10 hours

---

## Recommendation

Given the file size, consider:

1. **Gradual Migration:** Migrate one section per session
2. **Test After Each Section:** Ensure no visual regressions
3. **Use Automation:** Use the migration script for bulk replacements
4. **Focus on High-Impact:** Prioritize frequently visible UI elements

---

## Next Steps

1. ⬜ Run automated migration script for common patterns
2. ⬜ Manually review and test
3. ⬜ Migrate server list section
4. ⬜ Migrate channel list section
5. ⬜ Continue with remaining sections

---

**Current Status:** Typography partially migrated, import added  
**Next:** Continue with automated script or section-by-section migration
