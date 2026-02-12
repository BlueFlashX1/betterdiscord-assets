# CSS Cleanup Helper - Documentation

**Identifies unused CSS selectors in BetterDiscord themes and helps clean up code structure for better readability and maintainability.**

---

## Purpose

When developing BetterDiscord themes, unused CSS selectors accumulate over time:

- Discord updates change class names
- Experimental selectors that never matched
- Copy-pasted rules from other themes
- Deprecated Discord UI elements

**CSS Cleanup Helper** identifies these unused selectors and categorizes them for safe removal.

---

## Features

### ✅ Unmatched Selector Detection

- Scans theme CSS files
- Tests each selector against live Discord DOM
- Identifies selectors with zero matches
- Excludes pseudo-elements (optional)

### ✅ Categorization by Type

- **class** - `.className` selectors
- **id** - `#idName` selectors
- **element** - `div`, `span`, etc.
- **attribute** - `[class*="message"]`
- **pseudo-element** - `::before`, `::after`
- **pseudo-class** - `:hover`, `:focus`, `:active`
- **functional-pseudo** - `:is()`, `:not()`, `:has()`
- **complex** - Combined/nested selectors

### ✅ Cleanup Suggestions

Intelligent categorization for safe removal:

**Safe to Remove** ✅

- Classes, IDs, elements with no matches
- Can be deleted without testing

**Review Needed** ⚠️

- Pseudo-elements (might be CSS-only)
- Check if visual effects appear before removing

**Test Before Removing** ⚠️

- Complex selectors
- Attribute selectors
- May match in specific contexts

### ✅ Line Number References

- Shows exact line number for each selector
- Quick navigation to theme file
- Makes cleanup faster

### ✅ Export Reports

- JSON format with full details
- Share with other developers
- Track cleanup progress

---

## Installation

### Copy Plugin

```bash
cp "Better Discord/betterdiscord-dev/plugins/CSSCleanupHelper.plugin.js" \
   ~/Library/Application\ Support/BetterDiscord/plugins/
```

### Or Symlink (Development)

```bash
ln -s "$PWD/Better Discord/betterdiscord-dev/plugins/CSSCleanupHelper.plugin.js" \
      ~/Library/Application\ Support/BetterDiscord/plugins/
```

### Enable Plugin

1. Restart Discord (Cmd+R)
2. Settings → Plugins → Enable "CSS Cleanup Helper"

---

## Usage

### Basic Workflow

**1. Open Plugin Settings**

- Settings → Plugins → CSS Cleanup Helper → Settings

**2. Configure Options**

- **Show Line Numbers**: ON (recommended)
- **Group by Selector Type**: ON (recommended)
- **Show Cleanup Suggestions**: ON (recommended)
- **Exclude Pseudo Elements**: ON (safer)

**3. Filter by Theme (Optional)**

- Enter theme name: `SoloLeveling`
- Leave blank to analyze all themes

**4. Run Analysis**

- Click "Analyze Themes"
- Wait for completion (3-10 seconds)

**5. View Results**

- Click "View Detailed Report"
- Review unmatched selectors
- Check suggestions

**6. Export Report**

- Click "Export Report"
- Save to theme folder
- Review offline

**7. Clean Up Theme**

- Open theme CSS file
- Navigate to line numbers
- Remove unused selectors
- Test theme

**8. Re-analyze**

- Run analysis again
- Verify removals
- Repeat until clean

---

## Report Structure

### Summary Section

```
Total unmatched selectors: 322

By Type:
  attribute: 290
  class: 9
  element: 23
```

### Suggestions Section

```
Safe to Remove: 9 selectors
  - These selectors don't match any elements

Review Needed: 23 selectors
  - Pseudo-elements might be CSS-only

Test Before Removing: 290 selectors
  - Complex selectors may match in specific contexts
```

### Detailed List

```
Line | Selector                              | Type
-----|---------------------------------------|----------
366  | .app-3xd6d0                          | class
367  | .app-2CXKsg                          | class
27   | [class*="app"]::before               | attribute
28   | [class*="app"]::after                | attribute
```

---

## Example: Cleaning Solo Leveling Theme

### Before Analysis

```css
/* Line 366 - BROKEN (Discord updated) */
.app-3xd6d0 {
  background: purple;
}

/* Line 367 - BROKEN (old class) */
.app-2CXKsg {
  background: purple;
}

/* Line 500 - UNUSED (Discord removed element) */
.oldDiscordElement-abc123 {
  display: none;
}

/* Line 600 - MAYBE UNUSED (pseudo-element) */
[class*='message']::before {
  content: '⚔️';
}
```

### Run Analysis

```
Plugin Settings → Analyze Themes → View Report

Results:
  Safe to Remove: 3 selectors
    - .app-3xd6d0 (line 366)
    - .app-2CXKsg (line 367)
    - .oldDiscordElement-abc123 (line 500)

  Review Needed: 1 selector
    - [class*="message"]::before (line 600)
```

### After Cleanup

```css
/* Lines 366-367 - REMOVED (broken classes replaced by ClassAutoUpdater)
 * Now using .app__160d8 in updated theme */

/* Line 500 - REMOVED (unused selector deleted) */

/* Line 600 - KEPT (visual effect confirmed working) */
[class*='message']::before {
  content: '⚔️';
}
```

**Result:** Cleaner code, smaller file size, better maintainability!

---

## Advanced Features

### Console Commands

```javascript
// Access plugin instance
const plugin = BdApi.Plugins.get('CSS Cleanup Helper').instance;

// Run analysis programmatically
plugin.analyzeThemes();

// View results
console.log(plugin.unmatchedSelectors);
console.log(plugin.selectorsByType);
console.log(plugin.suggestions);

// Export report manually
plugin.exportReport();
```

### Custom Filtering

**By Theme:**

```
Settings → Theme Name Filter: "SoloLeveling"
→ Only analyzes Solo Leveling theme
```

**By Selector Type:**

```javascript
// Get only class selectors
plugin.selectorsByType.get('class');

// Get only pseudo-elements
plugin.selectorsByType.get('pseudo-element');
```

### Batch Cleanup

**Process Multiple Themes:**

1. Leave filter blank
2. Run analysis
3. Export report
4. Use report to clean multiple themes

---

## Best Practices

### ✅ DO

**Before Cleanup:**

- Run analysis on current theme
- Export report for backup
- Take note of line numbers

**During Cleanup:**

- Start with "Safe to Remove" suggestions
- Test theme after each batch removal
- Keep pseudo-elements if visual effect present

**After Cleanup:**

- Run analysis again to verify
- Test all theme features
- Commit changes to git

### ❌ DON'T

**Avoid These Mistakes:**

- Don't remove all unmatched at once
- Don't skip testing after removals
- Don't remove pseudo-elements without checking
- Don't trust "attribute" as safe to remove
- Don't cleanup without backup

### ⚠️ Warning Signs

**Stop and test if you see:**

- Theme looks broken
- Missing visual effects
- Elements losing styling
- Console errors about CSS

---

## Integration with Other Plugins

### ClassAutoUpdater

```
ClassAutoUpdater: Fixes broken classes automatically
CSSCleanupHelper: Identifies remaining unused selectors

Workflow:
1. Run ClassAutoUpdater (fixes broken classes)
2. Run CSSCleanupHelper (finds truly unused selectors)
3. Remove confirmed unused selectors
4. Theme is clean and up-to-date!
```

### CSS Verification Tool

```
CSS Verification: Shows what matches/doesn't match
CSSCleanupHelper: Organizes unmatched for cleanup

Use both:
- CSS Verification: Real-time testing
- CSSCleanupHelper: Cleanup planning
```

---

## Troubleshooting

### No Unmatched Selectors Found

**Possible causes:**

- All selectors are valid (good!)
- Theme not loaded yet
- Plugin needs restart

**Solution:**

1. Ensure theme is enabled
2. Wait 5 seconds after Discord loads
3. Re-run analysis

### False Positives (Valid Selectors Flagged)

**Common reasons:**

- Selector matches in specific context (modal, settings)
- Pseudo-elements create visual effects
- Conditional elements (only appear sometimes)

**Solution:**

- Review "Test Before Removing" suggestions
- Test in all Discord contexts
- Keep if unsure

### Line Numbers Wrong

**Causes:**

- Theme modified after analysis
- Comments/whitespace changed

**Solution:**

- Re-run analysis
- Use manual search in theme file

---

## Report Example

### JSON Export Format

```json
{
  "generated": "2025-12-20T16:45:00.000Z",
  "summary": {
    "total": 322,
    "byType": {
      "attribute": 290,
      "class": 9,
      "element": 23
    }
  },
  "suggestions": [
    {
      "category": "Safe to Remove",
      "count": 9,
      "description": "These selectors don't match any elements and can likely be removed safely",
      "selectors": [...]
    }
  ],
  "selectors": [
    {
      "selector": ".app-3xd6d0",
      "theme": "SoloLeveling-ClearVision.theme.css",
      "line": 366,
      "type": "class",
      "matchCount": 0
    }
  ]
}
```

---

## Performance

**Analysis Speed:**

- Small theme (<1000 lines): <1 second
- Medium theme (1000-3000 lines): 1-3 seconds
- Large theme (3000+ lines): 3-10 seconds

**Memory Usage:**

- Negligible (<5MB)
- No background monitoring
- Only active during analysis

---

## Roadmap

**Planned Features:**

- [ ] Auto-removal mode (with confirmation)
- [ ] Before/after comparison
- [ ] Undo cleanup functionality
- [ ] Batch theme processing
- [ ] Visual selector highlighting
- [ ] Integration with git diff
- [ ] Cleanup history tracking

---

## Resources

- **Plugin:** `plugins/CSSCleanupHelper.plugin.js`
- **Related:** `plugins/ClassAutoUpdater.plugin.js`
- **Reports:** `~/Library/Application Support/BetterDiscord/themes/cleanup-report-*.json`

---

## Quick Reference

**Common Commands:**

```javascript
// Get plugin
const plugin = BdApi.Plugins.get('CSS Cleanup Helper').instance;

// Analyze
plugin.analyzeThemes();

// View results
plugin.showDetailedReport();

// Export
plugin.exportReport();
```

**Settings Shortcuts:**

- `Ctrl+,` → Settings
- Plugins → CSS Cleanup Helper → Settings
- Analyze Themes → View Report

---

**TL;DR:** Install plugin → Settings → Analyze Themes → View Report → Remove unused selectors → Cleaner theme! 🎉
