# Solo Leveling Theme - Modular Variables System

**Version:** 2.0  
**Date:** December 21, 2025  
**Status:** Production Ready

---

## Overview

A modular, component-based CSS variable system for the Solo Leveling BetterDiscord theme. Enables easy maintenance, theme variants, and reusable patterns.

---

## File Structure

```
variables/
├── variables.css          # Main entry (imports all modules)
├── _colors.css            # Color palette
├── _effects.css           # Glows, shadows, transitions
├── _typography.css        # Fonts, text styles
├── _spacing.css           # Radii, spacing, layout
├── _components.css        # Component tokens
├── _utilities.css         # Utility classes
└── README.md              # This file
```

---

## Quick Start

### Import in Your Theme

```css
/* Import modular variables */
@import url('./variables/variables.css');

/* Now use semantic tokens */
.my-element {
  color: var(--sl-color-primary);
  box-shadow: var(--sl-effect-glow-medium);
  border-radius: var(--sl-space-radius-control);
  transition: var(--sl-effect-transition-normal);
}
```

### Use Component Tokens

```css
.button-custom {
  background: var(--sl-comp-button-bg-primary);
  box-shadow: var(--sl-comp-button-shadow-primary);
  border-radius: var(--sl-comp-button-radius);
  transition: var(--sl-comp-button-transition);
}

.button-custom:hover {
  background: var(--sl-comp-button-bg-primary-hover);
  box-shadow: var(--sl-comp-button-shadow-primary-hover);
}
```

---

## Variable Naming Convention

### Format

`--sl-[category]-[property]-[variant]`

- **Prefix:** `sl` (Solo Leveling)
- **Category:** color, effect, type, space, comp
- **Property:** Specific property (primary, glow, font, radius, button, etc.)
- **Variant:** State or variation (hover, active, subtle, medium, etc.)

### Examples

```css
--sl-color-primary              /* Primary brand color */
--sl-color-primary-hover        /* Primary color on hover */
--sl-effect-glow-medium         /* Medium intensity glow */
--sl-type-font-primary          /* Primary font family */
--sl-space-radius-control       /* Border radius for controls */
--sl-comp-button-bg-primary     /* Button background (primary variant) */
```

---

## Module Reference

### 1. \_colors.css

**Color palette and gradations**

Categories:

- `--sl-color-primary-*` - Primary brand colors
- `--sl-color-accent-*` - Accent colors (purple scale)
- `--sl-color-status-*` - Status colors (success, warning, danger)
- `--sl-color-bg-*` - Background colors
- `--sl-color-text-*` - Text colors
- `--sl-color-online/idle/dnd/etc` - User status colors
- `--sl-color-purple-alpha-*` - Purple with opacity variations
- `--sl-color-white-alpha-*` - White with opacity variations
- `--sl-color-black-alpha-*` - Black with opacity variations

**Example:**

```css
color: var(--sl-color-primary);
background: var(--sl-color-bg-surface);
color: var(--sl-color-text-secondary);
```

---

### 2. \_effects.css

**Visual effects and animations**

Categories:

- `--sl-effect-glow-*` - Box shadow glow effects
- `--sl-effect-text-shadow-*` - Text shadow effects
- `--sl-effect-shadow-*` - Elevation shadows
- `--sl-effect-border-*` - Border patterns
- `--sl-effect-transition-*` - Timing functions
- `--sl-effect-gradient-*` - Gradient patterns

**Example:**

```css
box-shadow: var(--sl-effect-glow-medium);
text-shadow: var(--sl-effect-text-shadow-strong);
transition: var(--sl-effect-transition-normal);
```

---

### 3. \_typography.css

**Font and text styling**

Categories:

- `--sl-type-font-*` - Font families
- `--sl-type-size-*` - Font sizes
- `--sl-type-weight-*` - Font weights
- `--sl-type-height-*` - Line heights
- `--sl-type-spacing-*` - Letter spacing

**Example:**

```css
font-family: var(--sl-type-font-primary);
font-size: var(--sl-type-size-lg);
font-weight: var(--sl-type-weight-bold);
```

---

### 4. \_spacing.css

**Layout and spacing**

Categories:

- `--sl-space-radius-*` - Border radii
- `--sl-space-[0-24]` - Spacing scale (4px grid)
- `--sl-space-button/card/input-*` - Component spacing
- `--sl-space-gap-*` - Gap utilities
- `--sl-space-z-*` - Z-index scale

**Example:**

```css
border-radius: var(--sl-space-radius-surface);
padding: var(--sl-space-4);
gap: var(--sl-space-gap-md);
```

---

### 5. \_components.css

**Semantic component tokens**

Components:

- `--sl-comp-button-*` - Button component
- `--sl-comp-card-*` - Card component
- `--sl-comp-input-*` - Input component
- `--sl-comp-channel-*` - Channel component
- `--sl-comp-message-*` - Message component
- `--sl-comp-member-*` - Member list component
- `--sl-comp-modal-*` - Modal component
- `--sl-comp-status-*` - Status indicator component
- `--sl-comp-tooltip-*` - Tooltip component
- `--sl-comp-scrollbar-*` - Scrollbar component

**Example:**

```css
/* Button using component tokens */
.custom-button {
  background: var(--sl-comp-button-bg-primary);
  box-shadow: var(--sl-comp-button-shadow-primary);
  border-radius: var(--sl-comp-button-radius);
  transition: var(--sl-comp-button-transition);
}
```

---

### 6. \_utilities.css

**Utility classes**

Ready-to-use classes:

- `.sl-glow-subtle/medium/strong` - Glow effects
- `.sl-text-glow` - Text glow effect
- `.sl-transition-fast/normal` - Transitions
- `.sl-card` - Card styling
- `.sl-button-primary` - Primary button

**Example:**

```html
<div class="sl-card sl-glow-medium">
  <button class="sl-button-primary">Click me</button>
</div>
```

---

## Creating Theme Variants

### Example: Light Mode Variant

Create `variables-light.css`:

```css
@import url('./variables.css'); /* Import base */

:root {
  /* Override colors for light mode */
  --sl-color-bg-base: rgba(240, 240, 245, 1);
  --sl-color-bg-surface: rgba(250, 250, 255, 1);
  --sl-color-text-primary: rgba(0, 0, 0, 0.95);
  --sl-color-text-secondary: rgba(0, 0, 0, 0.75);

  /* Effects remain the same (purple glows work on light bg) */
}
```

### Example: High Contrast Variant

```css
@import url('./variables.css');

:root {
  /* Increase color contrast */
  --sl-color-primary: #9d4edd; /* Brighter purple */
  --sl-effect-glow-medium: 0 0 10px rgba(157, 78, 221, 0.4); /* Stronger glow */
  --sl-color-text-primary: rgba(255, 255, 255, 1); /* Full white */
}
```

---

## Migration Guide

### From Current Theme to Modular System

**Step 1: Import modular variables**

```css
/* Add at top of theme file */
@import url('./variables/variables.css');
```

**Step 2: Replace hardcoded values** (gradually)

Before:

```css
.element {
  color: #8a2be2;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.2);
}
```

After:

```css
.element {
  color: var(--sl-color-primary);
  box-shadow: var(--sl-effect-glow-medium);
}
```

**Step 3: Use component tokens** (for complete patterns)

Before:

```css
.button {
  background: #8a2be2;
  border-radius: 8px;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.2);
  transition: all 0.2s ease;
}
```

After:

```css
.button {
  background: var(--sl-comp-button-bg-primary);
  border-radius: var(--sl-comp-button-radius);
  box-shadow: var(--sl-comp-button-shadow-primary);
  transition: var(--sl-comp-button-transition);
}
```

---

## Benefits

### Maintainability

- Single source of truth for colors
- Easy to update (change once, applies everywhere)
- Self-documenting with semantic names
- Organized by category and purpose

### Theme Variants

- Create light/dark modes by swapping color tokens
- Create high contrast versions
- Create seasonal variants (Halloween, Christmas, etc.)
- All without duplicating code

### Reusability

- Component tokens encapsulate complete patterns
- Utility classes for common patterns
- Import in multiple themes
- Share across projects

### Performance

- No runtime cost (CSS variables are native)
- No additional HTTP requests (imported at build time)
- Browser-optimized variable resolution

---

## Best Practices

### 1. Use Semantic Tokens

```css
/* Good: Semantic component tokens */
background: var(--sl-comp-button-bg-primary);

/* Better than: Primitive tokens */
background: var(--sl-color-primary);

/* Avoid: Hardcoded values */
background: #8a2be2;
```

### 2. Layer Your Variables

```css
/* Primitive → Component → Application */

/* Primitive */
--sl-color-primary: #8a2be2;

/* Component (uses primitive) */
--sl-comp-button-bg: var(--sl-color-primary);

/* Application (uses component) */
.my-button {
  background: var(--sl-comp-button-bg);
}
```

### 3. Keep Backward Compatibility

The `variables.css` file includes a backward compatibility layer mapping old variable names to new tokens. Remove this once migration is complete.

---

## Common Patterns

### Hover Glow Effect

```css
.element {
  box-shadow: var(--sl-effect-glow-medium);
  transition: var(--sl-effect-transition-glow);
}

.element:hover {
  box-shadow: var(--sl-effect-glow-strong);
}
```

### Card with Hover Effect

```css
.card {
  background: var(--sl-comp-card-bg);
  border: var(--sl-comp-card-border);
  border-radius: var(--sl-comp-card-radius);
  box-shadow: var(--sl-comp-card-shadow);
  transition: var(--sl-comp-card-transition);
}

.card:hover {
  background: var(--sl-comp-card-bg-hover);
  box-shadow: var(--sl-comp-card-shadow-hover);
  transform: translateY(-2px);
}
```

### Status Indicator with Glow

```css
.status-online {
  background: var(--sl-comp-status-online);
  box-shadow: var(--sl-comp-status-glow-online);
}
```

---

## Troubleshooting

### Variables Not Working

1. Check import order (variables.css must be imported first)
2. Verify file paths are correct
3. Check browser console for CSS errors
4. Ensure :root selector is used for variable definitions

### Visual Regressions

1. Compare before/after screenshots
2. Check browser DevTools computed styles
3. Verify variable fallbacks are working
4. Test in different Discord contexts (servers, DMs, settings)

---

## Future Enhancements

- [ ] CSS custom property fallbacks
- [ ] Theme variant generator tool
- [ ] Variable documentation generator
- [ ] Visual regression testing automation
- [ ] Theme preview tool

---

## Related Documents

- `../docs/PRD.md` - Theme system requirements
- `../docs/ARCHITECTURE.md` - Architecture overview
- `../docs/stories/1.2-theme-variables-refactoring.md` - Implementation story

---

**Created:** 2025-12-21  
**Author:** BlueFlashXS  
**License:** MIT
