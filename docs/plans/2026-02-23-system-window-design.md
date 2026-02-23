# SystemWindow — Design Doc

**Date**: 2026-02-23
**Plugin**: SystemWindow
**File**: `plugins/SystemWindow.plugin.js`
**Approach**: Pure CSS injection (~150-200 lines)

---

## Concept

Style all Discord chat messages as Solo Leveling "System windows" — dark panels with glowing borders. Your messages get a purple accent (Monarch), everyone else gets blue (System).

## Visual Spec

### Base (All Messages)
- Background: `rgba(13, 13, 26, 0.45)` — dark tint
- Border: 2px solid with box-shadow glow
- Border-radius: `4px` (sharp HUD, not bubbly)
- Padding boost inside content area
- Slight margin between messages for separation

### Accent Colors
| Target | Border | Glow |
|--------|--------|------|
| Others' messages | `#3b82f6` (blue) | `rgba(59, 130, 246, 0.15)` |
| Your messages | `#8a2be2` (purple) | `rgba(138, 43, 226, 0.15)` |

### Hover
- Glow intensifies (box-shadow opacity bump)

### Usernames
- Slightly brighter
- `letter-spacing: 0.03em` — system label feel

### Timestamps
- Reduced opacity
- Slightly smaller font

### Reply Blocks
- Nested sub-panel: thinner 1px border, dimmer background
- Inherits accent from parent message direction

### Embeds/Attachments
- Inherit parent message border accent

## Selectors

| Element | Selector |
|---------|----------|
| Message container | `li[class*="messageListItem"]` |
| Message inner | `[class*="message_"]` |
| Your messages | `[data-is-self="true"]` |
| Reply blocks | `[class*="repliedMessage"]` |
| Embeds | `[class*="embedWrapper"]` |
| Usernames | `[class*="username"]` |
| Timestamps | `time, [class*="timestamp"]` |

## Settings Panel
- Enabled toggle (on/off)
- Debug mode toggle
- Hardcoded SL colors — no customization knobs

## Lifecycle
- `start()` → load settings → `BdApi.DOM.addStyle()`
- `stop()` → `BdApi.DOM.removeStyle()`
- No observers, no patchers, no event listeners

## Architecture Decision
Pure CSS (Approach A) chosen over observer-based or React patcher approaches because:
1. `[data-is-self="true"]` provides self/other distinction without JS
2. ~150 lines vs 300-500+ for alternatives
3. Easy to migrate to theme CSS if desired later
4. Zero runtime overhead
