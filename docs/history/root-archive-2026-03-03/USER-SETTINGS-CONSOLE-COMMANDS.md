# User Settings Inspector - Console Commands

## 🎯 Quick Start (Settings Already Open!)

Since your User Settings are already open, run these commands in the browser console:

---

## 📋 Console Commands

### 1. **Manual Scan** (Primary Command)
```javascript
BdApi.Plugins.get('UserSettingsInspector').instance.manualScan();
```

**What this does**:
- ✅ Scans all User Settings elements
- ✅ Detects CSS selectors
- ✅ Shows layout information
- ✅ Shows color information
- ✅ Lists all category items
- ✅ Provides customization recommendations

**Output**: Complete scan report in console

---

### 2. **Check if Plugin is Loaded**
```javascript
BdApi.Plugins.get('UserSettingsInspector');
```

**Expected**:
```javascript
{
  name: "UserSettingsInspector",
  instance: {...},
  enabled: true,
  ...
}
```

**If null**: Plugin not loaded, need to enable it in Settings → Plugins

---

### 3. **Quick Settings Check**
```javascript
const settings = document.querySelector('[class*="standardSidebarView"]');
console.log('Settings open:', settings !== null);
console.log('Settings element:', settings);
```

**Verifies**: Settings modal is detected

---

### 4. **Get Category List**
```javascript
BdApi.Plugins.get('UserSettingsInspector').instance.getCategoryInfo();
```

**Shows**:
- All category items (My Account, Privacy, etc.)
- Which category is currently selected
- Category classes and dimensions

---

### 5. **Get Customization Ideas**
```javascript
BdApi.Plugins.get('UserSettingsInspector').instance.getCustomizationRecommendations();
```

**Shows**:
- CSS selector recommendations
- Property suggestions
- Example values
- Ready-to-use customizations

---

## 🎨 Full Scan Output Example

**What you'll see**:

```
╔════════════════════════════════════════════════════════╗
║   USER SETTINGS INSPECTOR - CSS DETECTION REPORT      ║
╚════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETTINGSCONTAINER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DIV
   Selector: [class*="layer"][class*="baseLayer"]
   Classes: layer_d4b6c5, baseLayer_d4b6c5
   Size: 1440×900px
   Position: top 0px, left 0px

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETTINGSSIDEBAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. NAV
   Selector: [class*="sidebar"]
   Classes: sidebar_a4d4d9, side_a4d4d9
   Size: 240×900px
   Position: top 0px, left 0px

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORYITEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DIV
   Selector: [class*="item"]
   Classes: item_a4d4d9, themed_a4d4d9
   Size: 218×40px
   Position: top 100px, left 11px

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYOUT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Settings Modal:
   Size: 1440×900px
   Position: 0, 0

Sidebar (Categories):
   Size: 240×900px
   Position: 0, 0

Content Area:
   Size: 1200×900px
   Position: 0, 240

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COLOR INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sidebar Colors:
   Background: rgba(47, 49, 54, 1)
   Border: rgba(0, 0, 0, 0.3)

Content Colors:
   Background: rgba(54, 57, 63, 1)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORY ITEMS ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found 15 category items

▶ 1. My Account (ACTIVE)
   Classes: item_a4d4d9, selected_a4d4d9, themed_a4d4d9
   Height: 40px

  2. User Profile
   Classes: item_a4d4d9, themed_a4d4d9
   Height: 40px

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CUSTOMIZATION RECOMMENDATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Settings Modal Background
   Target: [class*="standardSidebarView"]
   Property: background
   Example: linear-gradient(135deg, rgba(20, 10, 30, 0.95), ...)

2. Selected Category
   Target: [class*="side"] [class*="selected"]
   Property: background, border-left
   Example: background: rgba(139, 92, 246, 0.2); border-left: 3px solid #8b5cf6

[UserSettingsInspector] Scan complete! ✅
```

---

## 🚀 Run This Now!

**Copy and paste into console**:

```javascript
BdApi.Plugins.get('UserSettingsInspector').instance.manualScan();
```

**This will give you**:
- All CSS selectors for settings menu
- Layout dimensions
- Color information
- Category list
- Customization recommendations

---

## 📊 Alternative Commands

**If plugin not found**:
```javascript
// Check if plugin is loaded
BdApi.Plugins.get('UserSettingsInspector');

// If null, check plugins folder
// Plugin should be at:
// ~/Library/Application Support/BetterDiscord/plugins/UserSettingsInspector.plugin.js
```

**If settings not detected**:
```javascript
// Verify settings are open
document.querySelector('[class*="standardSidebarView"]');
// Should return element if settings open
```

---

## 🎯 After Scan

**You'll get data for**:
1. Settings modal background
2. Sidebar styling
3. Category items
4. Active category highlighting
5. Content area styling
6. Form elements
7. Buttons
8. Scrollbars
9. Dividers

**Then I can**:
- Create purple theme customizations
- Add glows and effects
- Match your Solo Leveling theme
- Apply consistent styling

**Run the command now and share the output!** 🎯
