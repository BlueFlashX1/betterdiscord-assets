# CSS Cleanup Workflow - Complete Guide

**Enhanced CSS Cleanup Helper v2.0** - Check GitHub first, update broken classes, then clean truly unused selectors.

---

## How It Works (3-Step Process)

### Step 1: Check GitHub DiscordClasses Repo

```
Plugin scans theme CSS
   ↓
Finds unmatched selectors
   ↓
Checks GitHub repo for current class names
   ↓
Categorizes: Updatable vs. Truly Unused
```

### Step 2: Auto-Update Broken Classes

```
Updatable selectors (found in GitHub)
   ↓
Replace old class with new class
   ↓
Create backup (.bak)
   ↓
Save updated theme
```

### Step 3: Clean Truly Unused Selectors

```
Truly unused (not in DOM, not in GitHub)
   ↓
Option A: Comment out (safer)
Option B: Remove completely
   ↓
Create backup (.cleanup.bak)
   ↓
Save cleaned theme
```

---

## Complete Workflow

### 1. Install & Configure

**Install:**

```bash
# Remove old CSS Verification plugin (replaced)
rm ~/Library/Application\ Support/BetterDiscord/plugins/CSSVerification.plugin.js

# Install new CSS Cleanup Helper
cp "Better Discord/betterdiscord-dev/plugins/CSSCleanupHelper.plugin.js" \
   ~/Library/Application\ Support/BetterDiscord/plugins/
```

**Configure:**

- Settings → Plugins → CSS Cleanup Helper → Settings
- **Check GitHub for Updates**: ON ✅ (checks repo first)
- **Auto-Update Broken Classes**: ON ✅ (fixes automatically)
- **Comment Instead of Remove**: ON ✅ (safer - can review)
- **Show Line Numbers**: ON ✅
- **Exclude Pseudo Elements**: ON ✅ (::before/::after might be CSS-only)

### 2. Run Analysis

**Open Settings:**

- Settings → Plugins → CSS Cleanup Helper → Settings

**Filter (Optional):**

- Theme Name Filter: "SoloLeveling"
- Leave blank for all themes

**Analyze:**

- Click "Analyze Themes"
- Wait for GitHub to load (3-5 seconds)
- Wait for analysis (3-10 seconds)

**Expected Output:**

```
✅ GitHub DiscordClasses loaded successfully
[CSSCleanupHelper] Loaded 2867 semantic classes from GitHub repo
[CSSCleanupHelper] Analyzing theme: SoloLeveling-ClearVision.theme.css
✅ Analysis complete! Found 2 updatable and 320 unused selectors
```

### 3. View Report

**Click "View Detailed Report"**

**Report Sections:**

**✅ Broken Classes (2)**

```
Line | Old Class       | New Class      | Semantic
-----|----------------|----------------|----------
366  | .app-3xd6d0    | .app__160d8   | app
367  | .app-2CXKsg    | .app__160d8   | app
```

→ **Action:** Click "Apply Updates Now"

**⚠️ Truly Unused Selectors (320)**

```
Line | Selector                              | Type
-----|---------------------------------------|----------
27   | [class*="app"]::before               | attribute
28   | [class*="app"]::after                | attribute
500  | .oldDiscordElement-abc123            | class
```

→ **Action:** Click "Comment Out Unused Selectors"

### 4. Apply Updates

**Click "Apply Updates Now"**

**What happens:**

```
1. Creates backup: SoloLeveling-ClearVision.theme.css.bak
2. Replaces broken classes:
   - .app-3xd6d0 → .app__160d8
   - .app-2CXKsg → .app__160d8
3. Saves updated theme
4. Shows notification: "Updated 2 broken classes!"
5. Auto re-analyzes (shows remaining issues)
```

**Result:**

```css
/* Before */
.app-3xd6d0 {
  background: purple;
}
.app-2CXKsg {
  background: purple;
}

/* After */
.app__160d8 {
  background: purple;
}
/* Second instance merged into first */
```

### 5. Clean Unused Selectors

**Click "Clean Unused Selectors"** (or button in report)

**Confirmation Modal:**

```
This will comment out 320 unused selectors.
Backups will be created.
Continue?
```

**What happens:**

```
1. Creates backup: SoloLeveling-ClearVision.theme.css.cleanup.bak
2. Comments out unused selectors:
   - /* UNUSED: [class*="app"]::before { ... } */
3. Saves cleaned theme
4. Shows notification: "Cleaned 320 unused selectors!"
```

**Example Output:**

```css
/* Original */
[class*='app']::before {
  content: '';
}

/* After Cleanup (Comment Mode) */
/* UNUSED: [class*="app"]::before { */
/*   content: ""; */
/* } */

/* After Cleanup (Remove Mode) */
/* REMOVED UNUSED: [class*="app"]::before */
```

### 6. Review & Test

**Review Commented Selectors:**

1. Open theme CSS file
2. Search for `/* UNUSED:`
3. Review each commented selector
4. If needed, uncomment and test
5. If truly unused, delete comment block

**Test Theme:**

1. Restart Discord (Cmd+R)
2. Check all UI elements:
   - Server list
   - Channel list
   - Messages
   - User popouts
   - Settings
   - Modals
3. Verify no visual elements missing
4. Check console for CSS errors

### 7. Final Cleanup (Optional)

**Remove Comment Blocks:**

```bash
# Open theme in editor
# Search for: /* UNUSED:
# Delete confirmed unused blocks
# Save
```

**Re-analyze to Verify:**

- Settings → CSS Cleanup Helper → Analyze Themes
- Should show: 0 updatable, minimal unused

---

## Comparison: Old vs. New Plugin

### Old CSS Verification Plugin

```
❌ Only flagged unmatched selectors
❌ No GitHub verification
❌ Manual updates required
❌ No categorization (all treated same)
❌ No auto-fix capability
```

### New CSS Cleanup Helper v2.0

```
✅ Checks GitHub repo first
✅ Auto-updates broken classes
✅ Flags truly unused selectors
✅ Categorizes by type + action needed
✅ Comment or remove options
✅ Line number references
✅ Smart suggestions
```

---

## Decision Tree

```
Selector unmatched in DOM?
   ↓
   YES → Check GitHub repo
      ↓
      Found in GitHub? → UPDATE (broken class)
      ↓
      Not found in GitHub? → FLAG (truly unused)
         ↓
         Pseudo-element? → REVIEW (might be CSS-only)
         ↓
         Class/ID/Element? → REMOVE (safe)
         ↓
         Complex/Attribute? → TEST (might match in context)
```

---

## Example: Solo Leveling Theme Cleanup

### Initial State

- Total selectors: 4266 lines
- Unmatched: 322 selectors

### After Analysis

```
GitHub Check: ✅ Loaded 2867 modules

Results:
  ✅ Updatable (broken classes): 2
  ⚠️ Truly unused: 320

Breakdown:
  - class: 9
  - attribute: 290
  - element: 23
```

### After Step 1: Apply Updates

```
✅ Updated 2 broken classes
  - .app-3xd6d0 → .app__160d8
  - .app-2CXKsg → .app__160d8

Remaining: 320 truly unused selectors
```

### After Step 2: Clean Unused (Comment Mode)

```
✅ Commented out 320 unused selectors
  - All prefixed with /* UNUSED: */
  - Backup saved: theme.css.cleanup.bak

Theme file size: Unchanged (comments don't affect load)
Readability: Improved (unused clearly marked)
```

### After Step 3: Manual Review & Delete

```
Reviewed 320 commented selectors
  - Kept 5 (pseudo-elements with visual effects)
  - Deleted 315 (confirmed unused)

Final state:
  - 3951 lines (315 lines removed)
  - 7.4% size reduction
  - 100% used selectors
  - Cleaner, more maintainable code
```

---

## Safety Features

### Automatic Backups

**Two backup types:**

1. `.bak` - Before class updates
2. `.cleanup.bak` - Before cleanup

**Restore if needed:**

```bash
# Restore from update backup
mv SoloLeveling-ClearVision.theme.css.bak SoloLeveling-ClearVision.theme.css

# Restore from cleanup backup
mv SoloLeveling-ClearVision.theme.css.cleanup.bak SoloLeveling-ClearVision.theme.css
```

### Comment-First Approach

**Default: Comment instead of remove**

- Selectors remain in file (commented)
- Can review before permanent deletion
- Easy to restore if needed
- No functionality lost

### GitHub Verification

**Prevents false removals:**

- Checks repo before flagging
- Only removes if NOT in GitHub
- Broken classes updated, not removed
- Safer cleanup process

---

## Recommended Schedule

**Weekly:**

- Run analysis
- Apply updates (if any)
- Review report

**After Discord Update:**

- Run analysis immediately
- Apply updates
- Test theme

**Monthly:**

- Full cleanup (comment unused)
- Review commented selectors
- Delete confirmed unused

---

## Console Commands

```javascript
// Get plugin
const plugin = BdApi.Plugins.get('CSS Cleanup Helper').instance;

// Run analysis with GitHub check
plugin.analyzeThemes();

// View updatable selectors
console.log(plugin.updatableSelectors);

// View truly unused selectors
console.log(plugin.unmatchedSelectors);

// Apply updates (fix broken classes)
plugin.applyUpdates();

// Clean unused selectors
plugin.cleanUnusedSelectors();

// Export full report
plugin.exportReport();
```

---

## Files & Resources

**Plugins:**

- ~~`CSSVerification.plugin.js`~~ (REMOVED - replaced)
- `CSSCleanupHelper.plugin.js` (NEW - enhanced)
- `ClassAutoUpdater.plugin.js` (complementary)

**Docs:**

- `docs/CSS-CLEANUP-WORKFLOW.md` (this file)
- `docs/CSS-CLEANUP-HELPER.md` (technical reference)
- `docs/LIVE-CLASS-DETECTION.md` (ClassAutoUpdater)

**Reports:**

- `~/Library/Application Support/BetterDiscord/themes/cleanup-report-*.json`

**Backups:**

- `.bak` - Before updates
- `.cleanup.bak` - Before cleanup

---

## Quick Reference Card

**Complete Workflow:**

1. Settings → CSS Cleanup Helper
2. Filter: "SoloLeveling" (optional)
3. Click "Analyze Themes"
4. Click "View Detailed Report"
5. Click "Apply Updates Now" (fixes broken classes)
6. Click "Comment Out Unused" (marks unused)
7. Open theme → Review `/* UNUSED: */` comments
8. Delete confirmed unused blocks
9. Test theme
10. Re-analyze to verify

**Settings:**

- GitHub Check: ON (verify first)
- Auto-Update: ON (fix broken)
- Comment Mode: ON (safer)
- Show Line Numbers: ON (navigation)
- Exclude Pseudo: ON (CSS-only safe)

---

**TL;DR:** GitHub check first → Update broken classes → Mark unused → Review manually → Delete confirmed → Clean theme! 🎉
