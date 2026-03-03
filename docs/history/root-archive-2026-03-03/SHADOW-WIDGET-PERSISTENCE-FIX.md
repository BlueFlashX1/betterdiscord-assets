# Shadow Army Widget Persistence Fix

## Problem
The Shadow Army member list widget CSS and widget element were not persisting when switching channels or guilds. Discord re-renders the member list on navigation, removing custom elements.

## Solution Implemented

### 1. **Early CSS Injection** ✅
```javascript
// In start() method
this.injectWidgetCSS(); // Inject widget CSS early for persistence
```
- Widget CSS now injected immediately on plugin start
- Uses `BdApi.injectCSS()` for persistent injection (survives Discord reloads)
- CSS stays injected across all channel/guild switches

### 2. **Channel/Guild Navigation Detection** ✅
```javascript
// In setupChannelWatcher()
const timeoutId = setTimeout(() => {
  this._retryTimeouts.delete(timeoutId);
  if (!this.shadowArmyButton || !document.contains(this.shadowArmyButton)) {
    this.createShadowArmyButton();
  }
  // Re-inject widget after channel/guild change
  this.injectShadowRankWidget();
}, 500);
```
- Detects URL changes (channel/guild switches)
- Re-injects widget automatically after navigation
- Uses existing URL change detection system

### 3. **MutationObserver for Member List Changes** ✅
```javascript
setupMemberListWatcher() {
  this.memberListObserver = new MutationObserver((mutations) => {
    const widget = document.getElementById('shadow-army-widget');
    const membersList = document.querySelector('[class*="members"]');

    // If member list exists but widget doesn't, re-inject
    if (membersList && !widget) {
      if (this.widgetReinjectionTimeout) {
        clearTimeout(this.widgetReinjectionTimeout);
      }
      this.widgetReinjectionTimeout = setTimeout(() => {
        this.injectShadowRankWidget();
      }, 500);
    }
  });

  // Watch entire document for member list changes
  this.memberListObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}
```
- Watches for DOM changes continuously
- Detects when member list is re-rendered
- Re-injects widget automatically when missing
- Debounces re-injection to prevent multiple calls

### 4. **Proper Cleanup** ✅
```javascript
// In stop() method
// Clear widget reinjection timeout
if (this.widgetReinjectionTimeout) {
  clearTimeout(this.widgetReinjectionTimeout);
  this.widgetReinjectionTimeout = null;
}

// Disconnect member list observer
if (this.memberListObserver) {
  this.memberListObserver.disconnect();
  this.memberListObserver = null;
}
```
- Cleans up observer on plugin stop
- Clears pending timeouts
- Prevents memory leaks

### 5. **BdApi CSS Injection** ✅
```javascript
injectWidgetCSS() {
  const cssContent = `...`;
  BdApi.injectCSS('shadow-army-widget-styles', cssContent);
}

removeWidgetCSS() {
  BdApi.clearCSS('shadow-army-widget-styles');
}
```
- Changed from `document.createElement('style')` to `BdApi.injectCSS()`
- More persistent CSS injection
- Survives Discord internal reloads
- Proper cleanup with `BdApi.clearCSS()`

## How It Works

### Widget Lifecycle

1. **Plugin Start**:
   - Widget CSS injected via `BdApi.injectCSS()` (persistent)
   - Widget element created and inserted into member list
   - MutationObserver starts watching for member list changes
   - URL change detection starts watching for navigation

2. **Channel/Guild Switch**:
   - **URL Change Detection**: Detects navigation → Re-injects widget after 500ms
   - **MutationObserver**: Detects member list re-render → Re-injects widget if missing

3. **Member List Re-render** (other causes):
   - MutationObserver detects member list change
   - Checks if widget is missing
   - Re-injects widget automatically with 500ms debounce

4. **Plugin Stop**:
   - CSS removed via `BdApi.clearCSS()`
   - Widget element removed
   - MutationObserver disconnected
   - URL change listeners cleaned up

## Features

✅ **CSS persists across all navigation**
✅ **Widget automatically re-appears after channel/guild switch**
✅ **Works even if member list is dynamically re-rendered**
✅ **Debounced re-injection prevents multiple calls**
✅ **Proper memory management (no leaks)**
✅ **Uses BdApi for better compatibility**

## Testing Checklist

- [x] CSS stays injected when switching channels
- [x] CSS stays injected when switching guilds
- [x] Widget re-appears after channel switch
- [x] Widget re-appears after guild switch
- [x] Widget re-appears if member list is re-rendered
- [x] No duplicate widgets created
- [x] Proper cleanup on plugin stop
- [x] No memory leaks (observers disconnected)
- [x] Widget clickable and functional after re-injection

## Technical Details

### MutationObserver Configuration
```javascript
this.memberListObserver.observe(document.body, {
  childList: true,  // Watch for added/removed nodes
  subtree: true     // Watch entire subtree
});
```
- Watches entire document body
- Detects any child node additions/removals
- Captures member list re-renders

### Debouncing Strategy
- **500ms delay** after detection before re-injection
- Prevents multiple rapid re-injections
- Clears pending timeout if new change detected
- Ensures smooth user experience

### CSS Injection Strategy
- **Early injection** at plugin start
- **BdApi.injectCSS()** for persistence
- **Automatic re-injection** via widget creation (safety net)
- **Single source of truth** (no duplicates)

## Files Modified

- **plugins/ShadowArmy.plugin.js**
  - Updated `start()` - Added early widget CSS injection
  - Updated `setupChannelWatcher()` - Added widget re-injection on navigation
  - Added `setupMemberListWatcher()` - New MutationObserver for member list
  - Updated `stop()` - Added cleanup for observer and timeouts
  - Updated `injectWidgetCSS()` - Changed to BdApi.injectCSS()
  - Updated `removeWidgetCSS()` - Changed to BdApi.clearCSS()

## Result

The Shadow Army widget and its CSS now **fully persist** across:
- ✅ Channel switches
- ✅ Guild switches  
- ✅ Member list re-renders
- ✅ Discord UI reloads
- ✅ Any navigation changes

The widget is **always visible** in the member list sidebar and updates every 30 seconds with current shadow counts per rank.
