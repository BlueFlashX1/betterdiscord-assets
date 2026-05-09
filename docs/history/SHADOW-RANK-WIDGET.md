# Shadow Rank Widget - Member List Integration

**Date**: 2025-12-04  
**Feature**: Live shadow army stats in Discord member list sidebar  
**Status**: ✅ Complete

---

## 🎯 What It Does

Adds a **clickable widget** to the top of the member list (right sidebar) showing:

- Total shadow count
- Shadow count per rank (SSS, SS, S, A, B, C, D, E)
- Color-coded rank display
- Click to open Shadow Army modal

---

## 📍 Location

**Injected at**: Top of member list sidebar (right side of Discord)

**Position**: Above all user/bot entries

---

## 🎨 Visual Design

```
┌─────────────────────────────────┐
│ MY SHADOW ARMY        1682 Total│
├─────────────────────────────────┤
│ SSS  SS   S    A                │
│  5   12   45   123              │
│                                 │
│  B    C    D    E               │
│ 445  892  567  234              │
├─────────────────────────────────┤
│     Click to manage shadows     │
└─────────────────────────────────┘
```

**Styling**:

- Dark gradient background (purple tint)
- Purple glowing border
- 4x2 grid layout for ranks
- Color-coded rank boxes
- Hover effect (border intensifies)

---

## 🎨 Rank Colors

| Rank | Color      | Hex       |
| ---- | ---------- | --------- |
| SSS  | Pink       | `#ec4899` |
| SS   | Red        | `#ef4444` |
| S    | Orange     | `#f59e0b` |
| A    | Purple     | `#8b5cf6` |
| B    | Blue       | `#3b82f6` |
| C    | Green      | `#22c55e` |
| D    | Light Gray | `#a0a0a0` |
| E    | Gray       | `#999`    |

---

## ⚡ Features

### 1. Auto-Injection

- Widget automatically appears on plugin start
- Waits 3 seconds for Discord to load member list
- Inserts at top of member list

### 2. Auto-Update

- Updates every 30 seconds
- Shows real-time shadow counts
- Reflects promotions, extractions, etc.

### 3. Interactive

- **Hover**: Border glows brighter
- **Click**: Opens full Shadow Army modal
- Smooth transitions

### 4. Clean Removal

- Automatically removed when plugin stops
- No leftover elements

---

## 🔧 Implementation

### Functions Added

**1. `injectShadowRankWidget()`**

- Creates widget DOM element
- Styles with gradient background + purple border
- Adds hover effects
- Adds click handler (opens Shadow Army modal)
- Inserts at top of member list

**2. `updateShadowRankWidget()`**

- Fetches all shadows from storage
- Counts shadows per rank
- Generates HTML grid with counts
- Updates widget content

**3. `removeShadowRankWidget()`**

- Removes widget from DOM
- Called on plugin stop

---

### Lifecycle

**On Plugin Start**:

```javascript
// Wait 3 seconds for Discord to load
setTimeout(() => {
  this.injectShadowRankWidget();
}, 3000);

// Update every 30 seconds
this.widgetUpdateInterval = setInterval(() => {
  this.updateShadowRankWidget();
}, 30000);
```

**On Plugin Stop**:

```javascript
// Clear update interval
if (this.widgetUpdateInterval) {
  clearInterval(this.widgetUpdateInterval);
}

// Remove widget
this.removeShadowRankWidget();
```

---

## 📊 Widget HTML Structure

```html
<div id="shadow-army-widget" style="...">
  <!-- Header -->
  <div style="display: flex; justify-content: space-between;">
    <div>MY SHADOW ARMY</div>
    <div>1682 Total</div>
  </div>

  <!-- Rank Grid (4x2) -->
  <div style="display: grid; grid-template-columns: repeat(4, 1fr);">
    <!-- SSS -->
    <div style="border: 1px solid #ec489940;">
      <div>SSS</div>
      <div>5</div>
    </div>

    <!-- SS -->
    <div style="border: 1px solid #ef444440;">
      <div>SS</div>
      <div>12</div>
    </div>

    <!-- ... more ranks ... -->
  </div>

  <!-- Footer -->
  <div>Click to manage shadows</div>
</div>
```

---

## 🎯 Use Cases

### Quick Army Overview

- Glance at sidebar to see total shadows
- Check rank distribution without opening modal
- Monitor army growth in real-time

### Fast Access

- Click widget to open full Shadow Army modal
- No need to find button in toolbar
- Always visible in member list

### Status Monitoring

- See if you have shadows ready for promotion
- Track army composition
- Plan extraction strategies

---

## 🎨 Visual States

### Normal State

```
Border: rgba(139, 92, 246, 0.4)
Shadow: 0 4px 12px rgba(0, 0, 0, 0.4)
```

### Hover State

```
Border: rgba(139, 92, 246, 0.6)  ← Brighter!
Shadow: 0 4px 16px rgba(0, 0, 0, 0.5)  ← Stronger!
Cursor: pointer
```

### Click

```
Opens Shadow Army modal
Shows full army management UI
```

---

## 📐 Dimensions

**Widget**:

- Width: Auto (fits member list)
- Padding: 12px
- Margin: 12px 8px
- Border Radius: 8px

**Rank Boxes**:

- Grid: 4 columns
- Gap: 6px
- Padding: 4px
- Border Radius: 4px

---

## 🚀 Apply Changes

**Reload Discord** (Cmd+R) to see:

✅ **Widget appears** at top of member list  
✅ **Shows live counts** for all ranks  
✅ **Color-coded** rank display  
✅ **Click to open** Shadow Army modal  
✅ **Auto-updates** every 30 seconds

---

## 💡 Benefits

### Always Visible

- No need to open modal to check stats
- Sidebar is always visible
- Quick reference

### Color-Coded

- Instantly see high-rank shadows (pink/red)
- Identify weak ranks (gray)
- Visual hierarchy

### Interactive

- Hover feedback
- Click to manage
- Smooth animations

### Real-Time

- Updates automatically
- Reflects extractions immediately
- Shows promotions

---

## 🎯 Example Scenarios

**Scenario 1**: Checking Army Strength

```
User: *Glances at sidebar*
Widget: "5 SSS, 12 SS, 45 S"
User: "Nice! My high-rank army is growing!"
```

**Scenario 2**: Planning Promotions

```
User: *Sees "892 C-rank shadows"*
User: *Clicks widget*
Modal: Opens with full army list
User: Promotes C-rank shadows to B
```

**Scenario 3**: After Dungeon

```
Dungeon: Completes, extracts 25 shadows
Widget: Auto-updates in 30 seconds
User: Sees new shadow count immediately
```

---

## 🔍 Technical Details

### DOM Injection

```javascript
const membersList = document.querySelector('[class*="members"]');
const membersContent = membersList.querySelector('[class*="content"]');
membersContent.insertBefore(widget, membersContent.firstChild);
```

### Storage Access

```javascript
// Try IndexedDB first
shadows = await this.storageManager.getShadows({}, 0, 10000);

// Fallback to localStorage
if (!shadows) {
  shadows = this.settings.shadows || [];
}
```

### Update Frequency

- **Initial**: Immediately on injection
- **Periodic**: Every 30 seconds
- **Manual**: When modal is closed (triggers update)

---

**Status**: ✅ **Widget Complete & Active!**  
**Reload Discord** (Cmd+R) to see your shadow army stats in the sidebar! ✨
