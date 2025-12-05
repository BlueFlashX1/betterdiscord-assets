# Activity Card Inspector Plugin - Usage Guide

## 📋 Overview

The **Activity Card Inspector** plugin helps you identify Discord's dynamically generated class names and selectors for activity cards. This is essential for creating accurate CSS customizations, especially for removing unwanted purple timestamp backgrounds.

## 🎯 Purpose

- **Detect** activity card elements in real-time
- **Extract** exact CSS selectors and class names
- **Identify** elements with purple backgrounds (timestamp bars)
- **Generate** CSS rules to fix styling issues

## 🚀 Quick Start

### 1. Enable the Plugin

1. Copy `ActivityCardInspector.plugin.js` to your BetterDiscord plugins folder
2. Enable it in Settings → Plugins
3. Open browser console (F12 or Ctrl+Shift+I / Cmd+Option+I)

### 2. Trigger Activity Card Detection

Open any of these to see activity cards:
- User profile (click on user avatar)
- User popout (hover over username)
- Full user modal (View Full Profile)
- Any area showing "Playing [Game Name]"

### 3. Read the Console Output

The plugin will automatically log detailed information about each activity card element it finds.

## 📊 Console Output Explained

### Example Output

```javascript
[Activity Card Inspector] ACTIVITYCARD
├─ Element Type: activityCard
├─ Tag: div
├─ Classes: ['activityCard_abc123', 'wrapper_xyz789']
├─ Full ClassName: "activityCard_abc123 wrapper_xyz789 container_def456"
├─ CSS Selector: div.activityCard_abc123.wrapper_xyz789
├─ Background Color: rgba(138, 43, 226, 0.3)
├─ ⚠️ PURPLE BACKGROUND DETECTED!
├─ CSS to remove:
│   div.activityCard_abc123.wrapper_xyz789 {
│     background: transparent !important;
│     background-color: transparent !important;
│   }
├─ Computed Styles: { backgroundColor: 'rgba(138, 43, 226, 0.3)', ... }
└─ Time-related Children: [...]
```

### Key Information

| Field | Description |
|-------|-------------|
| **Element Type** | Activity card, timestamp bar, time element, etc. |
| **CSS Selector** | Exact selector to target this element |
| **Purple Background Detected** | Red warning if purple background found |
| **CSS to remove** | Ready-to-use CSS rule to fix the issue |
| **Time-related Children** | Nested time/timestamp elements |

## 🎨 Visual Highlighting

When "Highlight Detected Elements" is enabled:

| Color | Meaning |
|-------|---------|
| 🟢 **Green Outline** | Activity Card Root |
| 🔴 **Red Outline** | Timestamp Bar |
| 🟠 **Orange Outline** | Time Element (`<time>` tag) |
| 🟣 **Purple Dashed Outline** | Container Element |
| 🔴 **Red Glow** | **PURPLE BACKGROUND DETECTED!** |

## ⚙️ Settings

### Auto-Inspect Activity Cards
- **On**: Automatically detect activity cards as they appear
- **Off**: Manual scanning only (use "Scan Activity Cards Now" button)

### Highlight Detected Elements
- **On**: Add colored outlines to detected elements (helpful for visual debugging)
- **Off**: No visual highlighting (cleaner but less obvious)

### Log to Console
- **On**: Print detailed information to browser console
- **Off**: Silent operation (still highlights if enabled)

### Show Notifications
- **On**: Show BetterDiscord notifications when cards are detected
- **Off**: No notifications (recommended to avoid spam)

## 🔍 Manual Scanning

Use the **"🔍 Scan Activity Cards Now"** button in settings to:
- Force scan all existing activity cards on page
- Re-scan after navigating to different profiles
- Clear previous inspection data and start fresh

## 💡 Practical Workflow

### Step 1: Identify the Problem

1. Enable the plugin
2. Open a user profile with activity showing
3. Look for **RED GLOW** on elements (purple background detected)

### Step 2: Copy the CSS Selector

From console output, copy the CSS selector:
```
div.activityCard_abc123 > div.timestampBar_xyz789
```

### Step 3: Add to Your Theme

Add the selector to your theme CSS:
```css
/* Remove purple timestamp background */
div.activityCard_abc123 > div.timestampBar_xyz789 {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}
```

### Step 4: Generalize the Selector

Discord uses dynamic class names that change with updates. Use attribute selectors for better longevity:

**Instead of:**
```css
div.activityCard_abc123 > div.timestampBar_xyz789
```

**Use:**
```css
[class*='activityCard'] [class*='timestampBar'] {
  background: transparent !important;
}
```

This targets any element with "activityCard" in its class name, followed by any element with "timestampBar" in its class name.

## 🛠️ Troubleshooting

### No Activity Cards Detected

**Problem**: Console shows no output when viewing profiles

**Solutions**:
1. Check that "Auto-Inspect Activity Cards" is enabled
2. Try clicking "Scan Activity Cards Now" button
3. Make sure you're viewing a user with active Discord status (playing game, listening to music, etc.)
4. Check console for JavaScript errors

### Too Many Elements Detected

**Problem**: Console is flooded with detections

**Solutions**:
1. Disable "Auto-Inspect Activity Cards"
2. Disable "Show Notifications"
3. Use manual scanning instead
4. Clear console with "🗑️ Clear Console" button

### Highlights Not Showing

**Problem**: No colored outlines appear on elements

**Solutions**:
1. Check that "Highlight Detected Elements" is enabled
2. Restart the plugin (disable/enable)
3. Check if another theme is overriding the outline styles

### Wrong Elements Highlighted

**Problem**: Non-activity elements are being highlighted

**Solutions**:
1. Discord may have changed their class naming structure
2. Check console output for false positives
3. Report the issue for plugin update

## 📝 Understanding Discord's Dynamic Classes

Discord generates unique class names for each build:

```
activityCard_abc123    ← "abc123" changes with Discord updates
timestampBar_xyz789    ← "xyz789" changes with Discord updates
```

**This is why we use attribute selectors:**

```css
[class*='activityCard']    /* Matches any class containing "activityCard" */
[class*='timestampBar']    /* Matches any class containing "timestampBar" */
```

## 🎓 Advanced Tips

### Find All Purple Backgrounds

Look for console output with:
```
⚠️ PURPLE BACKGROUND DETECTED!
```

These are the exact elements causing the purple highlight issue.

### Export Results

Right-click in console → "Save as..." to export all logged information to a file.

### Inspect Specific Elements

1. Right-click element in browser
2. "Inspect Element"
3. Note the class names
4. Use "Scan Activity Cards Now" to get full details

### Create Generic Rules

After identifying several similar elements, create generic rules:

```css
/* Generic activity card timestamp removal */
[class*='activityCard'] [class*='time'],
[class*='activityCard'] [class*='timestamp'],
[class*='activityCard'] [class*='bar'] {
  background: transparent !important;
}
```

## 🔗 Integration with SoloLeveling Theme

The inspected selectors can be directly added to:
```
betterdiscord-dev/themes/SoloLeveling-ClearVision.theme.css
```

In **Section 6: Activity Card Styling** (around line 428).

## 📚 Related Documentation

- `.cursor-workspace/docs/BYTEROVER-SYNCHRONIZATION.md` - Memory synchronization
- `betterdiscord-dev/docs/` - Other plugin documentation
- `betterdiscord-dev/archive/` - Historical plugin examples

## 🐛 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Classes changing after Discord update | Use `[class*='partial']` selectors |
| Inline styles overriding CSS | Add `!important` flag |
| Elements not detected | Enable auto-inspect and manual scan |
| Too much console output | Disable "Log to Console" |
| Can't find timestamp bars | Look for RED GLOW highlights |

## 📞 Support

If you encounter issues:
1. Check console for JavaScript errors
2. Verify plugin is enabled
3. Try disabling other plugins (conflict check)
4. Restart Discord
5. Check BetterDiscord version compatibility

## 🎯 Final Notes

This plugin is a **debugging tool** - you don't need to keep it enabled all the time. Enable it when:
- Creating/updating themes
- Discord updates break your styling
- Troubleshooting purple backgrounds
- Learning Discord's class structure

Once you've identified the selectors and added them to your theme, you can disable the plugin to reduce overhead.

---

**Happy Theming!** 🎨✨
