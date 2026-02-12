# ChatboxInspector Plugin - Comprehensive Guide

## Overview

ChatboxInspector is a debug tool designed to detect and analyze all Discord chatbox elements, providing detailed CSS selectors and customization opportunities.

## Features

### 🔍 Detection Capabilities

**Automatically Detects**:
- ✅ **Message Input/Textarea** - Where you type messages
- ✅ **Toolbar Buttons** - Emoji, gift, GIF, sticker, upload, etc.
- ✅ **Chat Container** - Main message display area
- ✅ **Scrollbar** - Custom scrollbar styling
- ✅ **Attachment Area** - File upload zone
- ✅ **Emoji Picker** - Emoji selector button

### 📊 Analysis Tools

**Provides**:
- CSS selectors (multi-level, accurate)
- Complete box model (margin, padding, border)
- Color extraction (background, text, border)
- Layout metrics (position, size, display)
- Hierarchy analysis (parent-child structure)
- Customization suggestions (per element type)

### ⚡ Performance Optimized

- **Debounced scanning** - 1-second cooldown between scans
- **Smart caching** - No repeated analysis of same elements
- **Filtered output** - Only chatbox-related elements
- **Lazy detection** - Scans only when needed

## Installation

### Quick Install (Using Helper Script)

```bash
cd /Users/matthewthompson/Documents/DEVELOPMENT/betterdiscord-dev
./scripts/debug-plugin.sh activate chatbox
```

### Manual Install

```bash
cp archive/debug-tools/ChatboxInspector.plugin.js \
   "$HOME/Library/Application Support/BetterDiscord/plugins/"
```

Then:
1. Reload Discord (Cmd+R)
2. Enable plugin in **Settings → Plugins → ChatboxInspector**
3. Open browser console (Cmd+Option+I)

## Usage

### Automatic Detection

The plugin automatically scans and logs chatbox elements when:
- Plugin starts
- You switch channels
- Discord updates the UI
- Chatbox elements change

**Console Output**:
```
[ChatboxInspector] 🔍 Scanning chatbox elements...

[Chatbox] MESSAGE INPUT
  Pattern: textarea[placeholder*="Message"]
  Tag: textarea
  Classes: ['textArea_abc123', 'input_def456']
  CSS Selector: form > div.channelTextArea > div > textarea.textArea_abc123
  Box Model: { width: 800px, height: 44px, margin: 0px, padding: 11px }
  Colors: { background: rgba(0,0,0,0.4), color: #fff, border: transparent }
  Customization Opportunities:
    • Change background color/opacity
    • Add border glow effect
    • Modify border radius
    • Change placeholder text color

[Chatbox] TOOLBAR BUTTON (Send a gift)
  Pattern: button[aria-label*="gift"]
  Tag: button
  CSS Selector: div.buttons > button
  Box Model: { width: 32px, height: 32px }
  ...

[ChatboxInspector] ✅ Scan complete!
```

### Manual Commands

**From browser console**:

```javascript
// Generate comprehensive customization report
window.ChatboxInspector.generateReport();

// Analyze complete layout hierarchy
window.ChatboxInspector.analyzeLayout();

// Trigger manual scan
window.ChatboxInspector.scanChatbox();
```

### Example: Generate Report

```javascript
window.ChatboxInspector.generateReport();
```

**Output**:
```
[ChatboxInspector] 📋 CUSTOMIZATION OPPORTUNITIES REPORT

MESSAGE INPUT:
  🎨 Background: Add dark gradient with purple tint
  ✨ Border: Glowing purple border on focus
  🌟 Placeholder: Styled placeholder text
  📝 Font: Custom font with glow effect
  🔄 Animation: Smooth transitions on focus/blur

TOOLBAR BUTTONS:
  💫 Icon Glow: Add hover glow to icons
  🎯 Active State: Highlight active button
  ✨ Spacing: Adjust button gaps
  🌈 Colors: Custom icon colors per button
  🔄 Animation: Subtle pulse on hover

CHAT CONTAINER:
  🖼️ Background: Custom pattern or gradient
  📏 Message Spacing: Adjust vertical gaps
  💬 Message Bubbles: Custom message styling
  🎨 Alternating: Alternate message backgrounds
  ✨ Timestamps: Custom timestamp styling

SCROLLBAR:
  🎨 Thumb Color: Purple gradient thumb
  ✨ Glow Effect: Glowing scrollbar
  📏 Width: Thicker/thinner scrollbar
  🔄 Animation: Smooth scroll animations
  💫 Hover: Expand on hover

📊 Total Opportunities: 25
```

## What Gets Detected

### 1. Message Input Area

**Element**: `<textarea>` where you type messages

**Information Provided**:
- CSS selectors (attribute + context-based)
- Dimensions (width, height, min/max height)
- Colors (background, text, border)
- Typography (font family, size)
- Placeholder text styling
- Parent container structure

**Customization Ideas**:
- Dark gradient background
- Glowing purple border on focus
- Custom placeholder color
- Typing indicator effects
- Auto-resize behavior

### 2. Toolbar Buttons

**Elements**: Icon buttons around message input

**Buttons Detected**:
- ➕ Add attachment
- 🎁 Send gift
- 🖼️ Upload image
- 😊 Emoji picker
- 🎨 Sticker picker
- ✨ GIF picker

**Information Provided**:
- Individual button selectors
- Button dimensions and spacing
- Icon colors and sizes
- Hover states
- Active states
- Container layout (flexbox/grid)

**Customization Ideas**:
- Hover glow effects
- Icon color changes
- Button spacing adjustments
- Active button highlighting
- Pulse animations

### 3. Chat Container

**Element**: Main area where messages display

**Information Provided**:
- Container dimensions (full viewport height calculations)
- Background colors
- Overflow behavior
- Message spacing
- Scroll behavior

**Customization Ideas**:
- Background patterns/gradients
- Message bubble styling
- Alternating backgrounds
- Custom timestamps
- Divider lines

### 4. Scrollbar

**Element**: Chat scrollbar

**Information Provided**:
- Scrollbar width
- Thumb styling
- Track styling
- Colors
- Border radius

**Customization Ideas**:
- Custom thumb color (purple gradient)
- Glow effects
- Width adjustments
- Hover expansion
- Smooth animations

## Output Format

### Console Groups

Each element is logged in a collapsible console group:

```
▼ [Chatbox] MESSAGE INPUT
  Pattern: textarea[placeholder*="Message"]
  Tag: textarea
  Classes: ['textArea_abc123', 'input_def456']
  CSS Selector: form > div > textarea.textArea_abc123
  Box Model: { ... }
  Colors: { ... }
  Layout: { ... }
  Attributes: { ... }
  Customization Opportunities:
    • ...
  Element: <textarea>
```

### Color Coding

- 🟣 **Purple** - Main headings
- 🟡 **Yellow** - Warnings
- 🟢 **Green** - Success messages
- 🔵 **Blue** - Info messages
- 🟠 **Orange** - Customization suggestions

## Workflow

### 1. Activate Plugin

```bash
./scripts/debug-plugin.sh activate chatbox
```

### 2. Reload Discord

Press **Cmd+R** to reload Discord

### 3. Open Console

Press **Cmd+Option+I** to open developer console

### 4. Watch Detection

Plugin automatically scans and logs chatbox elements

### 5. Generate Report

```javascript
window.ChatboxInspector.generateReport();
```

### 6. Analyze Layout

```javascript
window.ChatboxInspector.analyzeLayout();
```

### 7. Document Findings

Update `css-detection-database.json` with:
- Detected class names
- Working selectors
- Customization notes

### 8. Apply Customizations

Update `themes/SoloLeveling-ClearVision.theme.css` with:
- New CSS rules
- Tested selectors
- Visual enhancements

### 9. Deactivate Plugin

```bash
./scripts/debug-plugin.sh deactivate chatbox
```

## Example Customization

### Based on Detection

**Detection Output**:
```
[Chatbox] MESSAGE INPUT
  CSS Selector: div.channelTextArea > div > textarea.textArea
  Background: rgba(0, 0, 0, 0.4)
  Border: 1px solid transparent
```

**Apply Customization**:
```css
/* Message input - Purple glow */
div[class*='channelTextArea'] textarea[class*='textArea'] {
  background: rgba(10, 10, 20, 0.6) !important;
  border: 1px solid rgba(139, 92, 246, 0.3) !important;
  border-radius: 8px !important;
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.1) !important;
  transition: all 0.3s ease !important;
}

div[class*='channelTextArea'] textarea[class*='textArea']:focus {
  border-color: rgba(139, 92, 246, 0.6) !important;
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.2) !important;
}
```

## Advanced Features

### Layout Hierarchy Analysis

```javascript
window.ChatboxInspector.analyzeLayout();
```

**Output**:
```
[ChatboxInspector] 📐 Complete Layout Analysis

Chat Area Structure
  div [chat, content]
    Size: 1200×800px
    Position: (300, 50)
    div [messagesWrapper]
      Size: 1200×700px
      Position: (300, 50)
      div [scroller]
        Size: 1200×700px
        ...
    form [channelTextArea]
      Size: 1200×100px
      Position: (300, 750)
      div [textArea]
        ...
      div [buttons]
        ...
```

### Detailed Component Analysis

**Message Input**:
```javascript
window.ChatboxInspector.analyzeMessageInputDetailed();
```

**Toolbar**:
```javascript
window.ChatboxInspector.analyzeToolbarDetailed();
```

**Chat Container**:
```javascript
window.ChatboxInspector.analyzeChatContainerDetailed();
```

## Performance Notes

### Optimizations

- **Debouncing**: 1-second cooldown between scans
- **Caching**: Elements analyzed once, cached by unique key
- **Filtering**: Only chatbox-related elements logged
- **Smart detection**: Minimal DOM queries

### Memory Usage

- **Low impact**: < 5MB memory
- **Cleanup**: All caches cleared on plugin stop
- **No leaks**: Observer properly disconnected

### CPU Usage

- **Minimal**: < 0.1% during idle
- **Scanning**: < 1% during active detection
- **No lag**: Optimized for real-time use

## Troubleshooting

### No Elements Detected

**Solution**:
1. Navigate to a text channel (not voice)
2. Wait 1-2 seconds for Discord to load
3. Manually trigger: `window.ChatboxInspector.scanChatbox()`

### Too Many Logs

**Solution**:
- Plugin is already optimized with debouncing
- Logs only appear during changes
- Use console filtering: `[ChatboxInspector]`

### Plugin Not Loading

**Solution**:
1. Check plugin is in BetterDiscord folder
2. Reload Discord (Cmd+R)
3. Enable in Settings → Plugins
4. Check console for errors

## Best Practices

### 1. Activate Only When Needed

- Don't leave active permanently
- Activate → Inspect → Document → Deactivate
- Keeps BetterDiscord clean

### 2. Document Findings

- Save selectors to `css-detection-database.json`
- Take screenshots of elements
- Note Discord version and date
- Record working CSS rules

### 3. Test Customizations

- Apply CSS to theme file
- Test in multiple channels
- Verify persistence after reload
- Check on different screen sizes

### 4. Clean Up

- Remove plugin after use
- Clear console
- Save documentation
- Archive findings

## Integration with CSS Database

### Update Database

After detection, update `css-detection-database.json`:

```json
{
  "chatbox": {
    "messageInput": {
      "lastDetected": "2025-12-04",
      "classNames": ["textArea_abc123", "input_def456"],
      "selectors": {
        "attribute": "textarea[class*='textArea']",
        "context": "form div[class*='channelTextArea'] textarea",
        "legacy": "textarea.textArea"
      },
      "workingCSS": "div[class*='channelTextArea'] textarea",
      "themeLocation": "themes/SoloLeveling-ClearVision.theme.css:1234",
      "resilienceRating": 9
    },
    "toolbarButtons": {
      "lastDetected": "2025-12-04",
      "classNames": ["button_abc123", "buttonContainer_def456"],
      "selectors": {
        "emoji": "button[aria-label*='emoji']",
        "gift": "button[aria-label*='gift']",
        "general": "div[class*='buttons'] button"
      },
      "workingCSS": "div[class*='buttons'] button",
      "resilienceRating": 8
    }
  }
}
```

## Customization Examples

### Example 1: Message Input Glow

```css
/* Message input - Solo Leveling style */
textarea[class*='textArea'] {
  background: rgba(10, 10, 20, 0.6) !important;
  border: 1px solid rgba(139, 92, 246, 0.3) !important;
  border-radius: 8px !important;
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.1) !important;
  color: #e0d0ff !important;
  transition: all 0.3s ease !important;
}

textarea[class*='textArea']:focus {
  border-color: rgba(139, 92, 246, 0.6) !important;
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.3) !important;
  background: rgba(10, 10, 20, 0.8) !important;
}

textarea[class*='textArea']::placeholder {
  color: rgba(139, 92, 246, 0.5) !important;
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.3) !important;
}
```

### Example 2: Toolbar Button Glow

```css
/* Toolbar buttons - Magical glow */
div[class*='buttons'] button {
  transition: all 0.2s ease !important;
}

div[class*='buttons'] button:hover {
  color: #a78bfa !important;
  filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.6)) !important;
  transform: scale(1.1) !important;
}

div[class*='buttons'] button svg {
  transition: all 0.2s ease !important;
}

div[class*='buttons'] button:hover svg {
  filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.8)) !important;
}
```

### Example 3: Custom Scrollbar

```css
/* Scrollbar - Purple gradient */
div[class*='scroller']::-webkit-scrollbar {
  width: 8px !important;
}

div[class*='scroller']::-webkit-scrollbar-track {
  background: rgba(10, 10, 20, 0.4) !important;
  border-radius: 4px !important;
}

div[class*='scroller']::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, 
    rgba(139, 92, 246, 0.6), 
    rgba(167, 139, 250, 0.6)) !important;
  border-radius: 4px !important;
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.4) !important;
}

div[class*='scroller']::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, 
    rgba(139, 92, 246, 0.8), 
    rgba(167, 139, 250, 0.8)) !important;
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.6) !important;
}
```

## API Reference

### Global Methods

**`window.ChatboxInspector.scanChatbox()`**
- Triggers immediate chatbox scan
- Detects all chatbox elements
- Logs findings to console

**`window.ChatboxInspector.generateReport()`**
- Generates comprehensive customization report
- Lists all opportunities by category
- Provides customization ideas

**`window.ChatboxInspector.analyzeLayout()`**
- Analyzes complete chatbox layout hierarchy
- Shows parent-child structure
- Provides detailed metrics

**`window.ChatboxInspector.analyzeMessageInputDetailed()`**
- Deep analysis of message input textarea
- Complete styling information
- Container analysis

**`window.ChatboxInspector.analyzeToolbarDetailed()`**
- Deep analysis of toolbar buttons
- Individual button metrics
- Layout analysis

**`window.ChatboxInspector.analyzeChatContainerDetailed()`**
- Deep analysis of chat message container
- Scrollbar styling
- Message spacing

## Comparison with ActivityCardInspector

| Feature | ActivityCardInspector | ChatboxInspector |
|---------|---------------------|------------------|
| **Purpose** | Activity cards | Chatbox elements |
| **Elements** | 5-10 | 20-30 |
| **Patterns** | Activity-specific | Input-specific |
| **Output** | Box model, colors | Box model, colors, hierarchy |
| **Commands** | Manual trigger | Auto + manual |
| **Use Case** | Activity card fixes | Chatbox customization |
| **Status** | Archived (fixed) | New tool |

## Deactivation

### Quick Deactivate

```bash
./scripts/debug-plugin.sh deactivate chatbox
```

### Manual Deactivate

```bash
rm "$HOME/Library/Application Support/BetterDiscord/plugins/ChatboxInspector.plugin.js"
```

## Files

| File | Location | Purpose |
|------|----------|---------|
| **ChatboxInspector.plugin.js** | `archive/debug-tools/` | Main plugin file |
| **debug-plugin.sh** | `scripts/` | Activation helper |
| **README.md** | `archive/debug-tools/` | Quick reference |
| **CHATBOX-INSPECTOR-GUIDE.md** | `docs/` | This complete guide |

## Next Steps After Detection

1. **Save selectors** → `css-detection-database.json`
2. **Design customizations** → Plan visual enhancements
3. **Write CSS** → Create theme rules
4. **Test** → Apply and verify in Discord
5. **Document** → Update theme documentation
6. **Archive tool** → Deactivate plugin

## Summary

ChatboxInspector provides:
- ✅ Complete chatbox element detection
- ✅ Detailed CSS selector generation
- ✅ Comprehensive layout analysis
- ✅ Customization suggestions
- ✅ Performance optimized
- ✅ Easy activation/deactivation

**Use this tool** whenever you want to:
- Customize message input styling
- Add effects to toolbar buttons
- Style the chat container
- Create custom scrollbars
- Understand Discord's chatbox structure

**Result**: Accurate CSS selectors for comprehensive chatbox customization! 🎯
