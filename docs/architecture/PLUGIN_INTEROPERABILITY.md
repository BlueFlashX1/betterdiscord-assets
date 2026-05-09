# Plugin Interoperability Documentation

## Overview

This document describes how **SoloLevelingStats** and **CriticalHit** plugins interact and share data through BetterDiscord's official APIs.

---

## Integration Architecture

```
┌─────────────────────┐
│  SoloLevelingStats  │
│                     │
│  - Reads:           │
│    • CriticalHit    │
│      message history│
│    • Combo data     │
│    • Font paths     │
│                     │
│  - Writes:          │
│    • Agility bonus  │
│    • Luck/Perception│
│      bonus data     │
└──────────┬──────────┘
           │
           │ BdApi.Plugins.get()
           │ BdApi.Data.load/save()
           │
           ▼
┌─────────────────────┐
│    CriticalHit       │
│                     │
│  - Provides:        │
│    • Message history│
│    • Combo tracking │
│    • Font directory │
│                     │
│  - Receives:        │
│    • Stat bonuses   │
│      (optional)     │
└─────────────────────┘
```

---

## SoloLevelingStats → CriticalHit Integration

### Data Reading

#### 1. Message History Access

```javascript
// SoloLevelingStats reads CriticalHit's message history
const critPlugin = BdApi.Plugins.get('CriticalHit');
if (critPlugin && critPlugin.messageHistory) {
  // Use message history for quest tracking
}
```

**Purpose**: Track critical hits for daily quest completion

**Location**: `SoloLevelingStats.plugin.js` - Quest system

#### 2. Combo Data Access

```javascript
// Read combo data from CriticalHit
const comboData = BdApi.Data.load('CriticalHitAnimation', 'userCombo');
```

**Purpose**: Track combo streaks for achievements

**Location**: `SoloLevelingStats.plugin.js` - Achievement system

#### 3. Font Loading

```javascript
// Load fonts from CriticalHit's font directory
const critInstance = BdApi.Plugins.get('CriticalHit');
if (critInstance && typeof critInstance.getFontsFolderPath === 'function') {
  const fontsPath = critInstance.getFontsFolderPath();
  // Load 'Friend or Foe BB' font from CriticalHit's directory
}
```

**Purpose**: Share font resources between plugins

**Location**: `SoloLevelingStats.plugin.js` - `_loadFontFromCriticalHit()`

### Data Writing

#### 1. Agility Bonus Data

```javascript
// Share agility bonus with CriticalHit
BdApi.Data.save('SoloLevelingStats', 'agilityBonus', {
  agility: this.settings.stats.agility,
  critChance: calculatedCritChance,
  // ... other data
});
```

**Purpose**: Provide stat-based crit chance to CriticalHit

**Location**: `SoloLevelingStats.plugin.js` - Stats system

#### 2. Perception/Luck Bonus Data

```javascript
// Share perception bonus (backward compatibility with 'luckBonus' key)
BdApi.Data.save('SoloLevelingStats', 'luckBonus', perceptionData);
```

**Purpose**: Provide perception buff data to CriticalHit

**Location**: `SoloLevelingStats.plugin.js` - Stats system

---

## CriticalHit → SoloLevelingStats Integration

### Data Provided

#### 1. Message History

- **Storage**: `BdApi.Data.save('CriticalHit', 'messageHistory', ...)`
- **Access**: Plugin instance via `BdApi.Plugins.get('CriticalHit')`
- **Purpose**: Track critical hits for quest completion

#### 2. Combo Data

- **Storage**: `BdApi.Data.save('CriticalHitAnimation', 'userCombo', ...)`
- **Access**: `BdApi.Data.load('CriticalHitAnimation', 'userCombo')`
- **Purpose**: Track combo streaks for achievements

#### 3. Font Directory

- **Method**: `getFontsFolderPath()`
- **Access**: Plugin instance method
- **Purpose**: Share font files between plugins

---

## API Usage Patterns

### Official BetterDiscord APIs Used

#### 1. BdApi.Plugins

```javascript
// Get plugin instance
const critPlugin = BdApi.Plugins.get('CriticalHit');
if (critPlugin) {
  // Access plugin methods/properties
  const fontsPath = critPlugin.getFontsFolderPath();
}
```

**Compliance**: ✅ Uses official `BdApi.Plugins` API

#### 2. BdApi.Data

```javascript
// Read data
const comboData = BdApi.Data.load('CriticalHitAnimation', 'userCombo');

// Write data
BdApi.Data.save('SoloLevelingStats', 'agilityBonus', data);
```

**Compliance**: ✅ Uses official `BdApi.Data` API for plugin communication

---

## Dependency Management

### SoloLevelingStats Dependency on CriticalHit

**Status**: **Optional** (graceful fallbacks implemented)

#### Features That Require CriticalHit:

1. **Critical Hit Quest Tracking**: Requires message history
2. **Combo Achievement Tracking**: Requires combo data
3. **Font Loading**: Can use CriticalHit's font directory (optional)

#### Graceful Fallbacks:

```javascript
// Example: Quest tracking with fallback
const critPlugin = BdApi.Plugins.get('CriticalHit');
if (critPlugin && critPlugin.messageHistory) {
  // Use CriticalHit data
} else {
  // Fallback: Track crits independently
  // Plugin still functions without CriticalHit
}
```

**Result**: SoloLevelingStats works standalone, but enhanced features require CriticalHit

---

## Data Flow Examples

### Example 1: Critical Hit Quest Tracking

```
1. User sends message
   ↓
2. CriticalHit detects crit → saves to messageHistory
   ↓
3. SoloLevelingStats reads messageHistory
   ↓
4. SoloLevelingStats updates quest progress
   ↓
5. Quest completion notification
```

### Example 2: Font Loading

```
1. SoloLevelingStats needs 'Friend or Foe BB' font
   ↓
2. Checks if font already loaded
   ↓
3. If not, gets font path from CriticalHit
   ↓
4. Loads font from CriticalHit's directory
   ↓
5. Falls back to default BetterDiscord fonts if unavailable
```

### Example 3: Stat Bonus Sharing

```
1. User allocates agility stat points
   ↓
2. SoloLevelingStats calculates crit chance bonus
   ↓
3. Saves to BdApi.Data as 'agilityBonus'
   ↓
4. CriticalHit can read this data (if needed)
   ↓
5. Both plugins benefit from shared data
```

---

## Best Practices

### 1. Always Check for Plugin Availability

```javascript
// ✅ GOOD: Check before accessing
const critPlugin = BdApi.Plugins.get('CriticalHit');
if (critPlugin && typeof critPlugin.getFontsFolderPath === 'function') {
  // Safe to use
}

// ❌ BAD: Direct access without check
const fontsPath = BdApi.Plugins.get('CriticalHit').getFontsFolderPath();
```

### 2. Use Official APIs Only

```javascript
// ✅ GOOD: Official BdApi methods
BdApi.Data.load('CriticalHitAnimation', 'userCombo');
BdApi.Plugins.get('CriticalHit');

// ❌ BAD: Direct webpack access or globals
// Don't access webpack modules directly
```

### 3. Implement Graceful Fallbacks

```javascript
// ✅ GOOD: Fallback if plugin unavailable
const critPlugin = BdApi.Plugins.get('CriticalHit');
if (critPlugin) {
  // Enhanced features
} else {
  // Basic functionality still works
}
```

### 4. Document Data Keys

- Use consistent, documented data keys
- Prefix with plugin name to avoid conflicts
- Example: `'SoloLevelingStats'`, `'CriticalHitAnimation'`

---

## Data Keys Reference

### SoloLevelingStats Data Keys

- `'SoloLevelingStats'` - Main plugin data
- `'SoloLevelingStats'` / `'agilityBonus'` - Agility stat bonus data
- `'SoloLevelingStats'` / `'luckBonus'` - Perception/luck bonus data (backward compatibility)

### CriticalHit Data Keys

- `'CriticalHit'` / `'messageHistory'` - Message history storage
- `'CriticalHitAnimation'` / `'userCombo'` - User combo data

---

## Version Compatibility

### Current Versions

- **SoloLevelingStats**: v2.4.0
- **CriticalHit**: v3.1.0

### Compatibility Notes

- SoloLevelingStats is backward compatible with older CriticalHit versions
- CriticalHit maintains backward compatibility with SoloLevelingStats data keys
- Font loading integration added in SoloLevelingStats v2.4.0

---

## Troubleshooting

### Issue: SoloLevelingStats not detecting critical hits

**Solution**:

1. Ensure CriticalHit plugin is enabled
2. Check that CriticalHit is saving message history
3. Verify SoloLevelingStats is reading from correct data key

### Issue: Fonts not loading

**Solution**:

1. Check if CriticalHit is installed and enabled
2. Verify font files exist in CriticalHit's font directory
3. Check browser console for font loading errors
4. SoloLevelingStats will fall back to default fonts if CriticalHit unavailable

### Issue: Data not syncing between plugins

**Solution**:

1. Verify both plugins are enabled
2. Check that `BdApi.Data` is working correctly
3. Ensure data keys match between plugins
4. Check browser console for errors

---

## Future Enhancements

### Potential Improvements:

1. **Event System**: Use BetterDiscord's event system for real-time updates
2. **Shared Configuration**: Allow shared settings between plugins
3. **Plugin Discovery**: Automatic plugin detection and feature negotiation
4. **Data Validation**: Add validation for shared data structures

---

## Compliance Notes

✅ **All integrations use official BetterDiscord APIs**

- `BdApi.Plugins` - Plugin instance access
- `BdApi.Data` - Data storage and retrieval

✅ **No direct webpack access**

- All communication through official APIs

✅ **Graceful degradation**

- Plugins work standalone
- Enhanced features require both plugins

✅ **Proper data namespacing**

- All data keys prefixed with plugin names
- No conflicts with other plugins

---

## Summary

The integration between SoloLevelingStats and CriticalHit is:

- **Optional**: Both plugins work standalone
- **Official**: Uses only BetterDiscord's official APIs
- **Documented**: Clear data flow and integration points
- **Compliant**: Follows all BetterDiscord guidelines
- **Maintainable**: Clean separation of concerns
