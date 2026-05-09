# Debug Tools Archive

**Purpose**: Stores occasional-use debug/inspection plugins  
**Strategy**: Keep archived to prevent BetterDiscord issues, activate only when needed

---

## 🛠️ Quick Command

Use the helper script for easy activation/deactivation:

```bash
# Activate user settings inspector
./scripts/debug-plugin.sh activate settings

# Activate chatbox inspector
./scripts/debug-plugin.sh activate chatbox

# Activate sidebar inspector
./scripts/debug-plugin.sh activate sidebar

# Activate all debug tools
./scripts/debug-plugin.sh activate all

# Check status
./scripts/debug-plugin.sh status

# Deactivate
./scripts/debug-plugin.sh deactivate settings
./scripts/debug-plugin.sh deactivate all
```

---

## 📁 Archived Tools

### 1. UserSettingsInspector.plugin.js ⭐ NEW

**Purpose**: Detect and analyze Discord User Settings menu for customization  
**Use Case**: Finding CSS selectors for settings modal, sidebar, categories, content  
**Status**: Archived (activate when needed)

**Detects**:
- ✅ Settings modal container
- ✅ Settings sidebar (left categories)
- ✅ Settings content area (right side)
- ✅ Category items (My Account, Privacy, etc.)
- ✅ Active/selected category
- ✅ Category headers
- ✅ Close button
- ✅ Form elements (inputs, checkboxes, switches)
- ✅ Buttons
- ✅ Scrollable content
- ✅ Profile section
- ✅ Dividers

**Features**:
- 🔍 Multi-pattern detection (12 categories)
- 📐 Complete layout analysis
- 🎨 Color extraction
- ✨ Customization recommendations
- 🚫 Auto-scan limit (2 scans max, no spam)
- 📊 Category list with active state

**How to Use**:
1. Activate: `./scripts/debug-plugin.sh activate settings`
2. Reload Discord (Cmd+R)
3. Enable plugin in Settings → Plugins
4. Click gear icon to open User Settings
5. Plugin auto-scans and logs to console
6. For manual scan: `BdApi.Plugins.get("UserSettingsInspector").instance.manualScan()`
7. Deactivate: `./scripts/debug-plugin.sh deactivate settings`

**Console Output**:
- Settings container detection
- Sidebar/content detection
- Category items list
- Layout dimensions
- Color analysis
- Customization recommendations

---

### 2. ChatboxInspector.plugin.js ⭐

**Purpose**: Detect and analyze Discord chatbox elements for customization  
**Use Case**: Finding CSS selectors for message input, toolbar, buttons, scrollbar  
**Status**: Archived (activate when needed)

**Detects**:
- ✅ Message input/textarea
- ✅ Toolbar buttons (emoji, gift, GIF, sticker, upload)
- ✅ Chat message container
- ✅ Scrollbar
- ✅ Attachment area
- ✅ All interactive elements

**Features**:
- 🔍 Multi-pattern detection
- 📐 Complete box model analysis
- 🎨 Color extraction
- ✨ Customization suggestions
- 📊 Layout hierarchy analysis
- ⚡ Performance optimized (debounced)

**Console Commands**:
```javascript
// Generate full customization report
window.ChatboxInspector.generateReport();

// Analyze complete layout hierarchy
window.ChatboxInspector.analyzeLayout();
```

### 2. ActivityCardInspector.plugin.js

**Purpose**: Detect and extract Discord activity card CSS selectors  
**Use Case**: When Discord updates break activity card styling  
**Status**: Archived (mission complete - activity cards fixed!)

**When to Use**:

- Discord update breaks purple timestamp removal
- Need to find new class names
- Debugging activity card styling issues
- Creating new activity card customizations

**How to Use**:

1. Copy to BetterDiscord plugins folder:

   ```bash
   cp "archive/debug-tools/ActivityCardInspector.plugin.js" \
      "$HOME/Library/Application Support/BetterDiscord/plugins/"
   ```

2. Enable in Discord Settings → Plugins

3. Open browser console (Cmd+Option+I)

4. Scan activity cards (opens automatically or use settings button)

5. Copy detected selectors and CSS rules

6. Update theme CSS with new patterns

7. **Remove plugin when done**:

   ```bash
   rm "$HOME/Library/Application Support/BetterDiscord/plugins/ActivityCardInspector.plugin.js"
   ```

8. Plugin stays in archive for future use

**Why Archived**:

- Only needed occasionally (after Discord updates)
- Prevents potential BetterDiscord issues with always-on debug plugins
- Reduces plugin overhead when not needed
- Easy to re-enable when needed

---

## 📊 CSS Detection Database

**Location**: `css-detection-database.json`  
**Purpose**: Store detected selectors and working CSS rules

**What's Stored**:

- Detected class names and patterns
- Working CSS rules (verified)
- Detection dates
- Historical patterns from previous Discord versions
- Purple color values
- Resilience ratings

**Benefits**:

- No need to re-research after Discord updates
- Quick reference for working selectors
- Historical tracking of pattern changes
- Can compare before/after Discord updates

**When to Update**:

- After detecting new class names
- After Discord updates
- After verifying existing rules still work
- After applying new CSS enhancements

---

## 🔧 Workflow

### Regular Use (Normal Operation)

```
Theme CSS → Discord
(No debug tools active)
```

### Debug Mode (Discord Update Broke Styling)

```
1. Copy ActivityCardInspector → BetterDiscord plugins
2. Enable plugin
3. Scan and detect new patterns
4. Update css-detection-database.json
5. Update theme CSS
6. Remove plugin from BetterDiscord
7. Plugin returns to archive
```

---

## 🎯 Best Practices

### ✅ Do

- Keep debug tools archived when not in use
- Update database after detecting new patterns
- Remove plugin from BetterDiscord after use
- Document findings in database
- Test theme works before removing plugin

### ❌ Don't

- Leave debug plugins active permanently
- Symlink debug tools to BetterDiscord (can cause issues)
- Delete detection data after use (keep in database)
- Forget to remove plugin after debugging

---

## 📚 Related Files

| File                                           | Purpose              | Location         |
| ---------------------------------------------- | -------------------- | ---------------- |
| `ActivityCardInspector.plugin.js`              | Detection plugin     | This directory   |
| `css-detection-database.json`                  | CSS pattern database | Parent directory |
| `ACTIVITY-CARD-INSPECTOR-GUIDE.md`             | Plugin usage guide   | `../docs/`       |
| `DISCORD-RESILIENT-DETECTION-PATTERN.md`       | Detection patterns   | `../docs/`       |
| `ACTIVITY-CARD-CUSTOMIZATION-OPPORTUNITIES.md` | Enhancement ideas    | `../docs/`       |

---

## 🚀 Quick Commands

**Copy plugin to BetterDiscord**:

```bash
cp "archive/debug-tools/ActivityCardInspector.plugin.js" \
   "$HOME/Library/Application Support/BetterDiscord/plugins/"
```

**Remove plugin from BetterDiscord**:

```bash
rm "$HOME/Library/Application Support/BetterDiscord/plugins/ActivityCardInspector.plugin.js"
```

**Update database** (manually edit):

```bash
code css-detection-database.json
```

---

## 📅 Maintenance

### When Discord Updates

1. Check if theme still works
2. If broken, activate debug plugin
3. Detect new patterns
4. Update database
5. Update theme CSS
6. Archive plugin again

### Database Updates

- Update `lastVerified` dates quarterly
- Add new patterns as discovered
- Mark deprecated patterns
- Track Discord version changes

---

**Status**: ✅ Organized & Documented  
**Last Updated**: 2025-12-03
