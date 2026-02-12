# BetterDiscord Concept Usage Analysis

## Overview

This document analyzes whether **SoloLevelingStats** and **CriticalHit** plugins use concepts from BetterDiscord's advanced guides:

- [Function Patching](https://docs.betterdiscord.app/plugins/concepts/patching)
- [Webpack Modules](https://docs.betterdiscord.app/plugins/concepts/webpack)
- [React Injection](https://docs.betterdiscord.app/plugins/concepts/react)

---

## CriticalHit Plugin

### ✅ Function Patching (`BdApi.Patcher`)

**Status**: **USES** function patching

**Location**: `CriticalHit.plugin.js` - Line 3637

**Implementation**:

```javascript
BdApi.Patcher.after(
  'CriticalHit',
  MessageActions,
  'sendMessage',
  (thisObject, args, returnValue) => {
    // Patch implementation
  }
);
```

**Type**: `after` patch - runs after the original function

**Purpose**: Patches Discord's `MessageActions.sendMessage` to detect when messages are sent and trigger critical hit animations

**Cleanup**: Properly unpatch in `stop()` method:

```javascript
BdApi.Patcher.unpatchAll('CriticalHit');
```

**Compliance**: ✅ Uses official `BdApi.Patcher` API
**Reference**: [Function Patching Guide](https://docs.betterdiscord.app/plugins/concepts/patching)

---

### ✅ Webpack Modules (`BdApi.Webpack`)

**Status**: **USES** webpack module access

**Locations**:

1. **Line 3580-3615**: MessageActions module

   ```javascript
   let MessageActions = BdApi.Webpack.getModule(
     (m) => m && m.sendMessage && typeof m.sendMessage === 'function'
   );
   ```

2. **Line 8784**: UserStore module
   ```javascript
   const UserStore = BdApi.Webpack.getModule((m) => m.getCurrentUser);
   ```

**Purpose**:

- **MessageActions**: Access Discord's message sending functionality for patching
- **UserStore**: Get current user information (Discord ID)

**Methods Used**:

- `BdApi.Webpack.getModule()` - Find specific modules
- `BdApi.Webpack.getAllModules()` - Get all modules (for debugging)

**Compliance**: ✅ Uses official `BdApi.Webpack` API
**Reference**: [Webpack Modules Guide](https://docs.betterdiscord.app/plugins/concepts/webpack)

---

### ⚠️ React Fiber Traversal (Not Full React Injection)

**Status**: **PARTIALLY USES** React concepts (fiber traversal, not full injection)

**Locations**:

- **Line 344**: `getReactFiber()` helper method
- **Line 397, 594, 697**: React fiber traversal for message elements
- **Line 1355, 1418, 1726, 1768, 1833**: React fiber key detection

**Implementation**:

```javascript
getReactFiber(element) {
  if (!element) return null;
  const fiberKey = Object.keys(element).find(
    (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
  );
  return fiberKey ? element[fiberKey] : null;
}
```

**Purpose**: Traverse React fiber tree to extract message IDs and data from Discord's React components

**What It Does**:

- ✅ Accesses React fiber properties (`__reactFiber*`)
- ✅ Traverses React component tree
- ✅ Extracts data from React components

**What It Doesn't Do**:

- ❌ Does NOT patch React render functions
- ❌ Does NOT inject React components into Discord's tree
- ❌ Does NOT use `BdApi.Patcher` on React components

**Compliance**: ✅ Uses React fiber traversal (allowed, not full injection)
**Reference**: [React Injection Guide](https://docs.betterdiscord.app/plugins/concepts/react)

**Note**: This is a **lighter approach** than full React injection - it reads React data without modifying React's render tree.

---

## SoloLevelingStats Plugin

### ❌ Function Patching (`BdApi.Patcher`)

**Status**: **DOES NOT USE** function patching

**Analysis**: No usage of `BdApi.Patcher` found in the plugin

**Reason**: Plugin uses DOM observation and event listeners instead of patching Discord functions

---

### ❌ Webpack Modules (`BdApi.Webpack`)

**Status**: **DOES NOT USE** webpack module access

**Analysis**: No usage of `BdApi.Webpack` found in the plugin

**Reason**: Plugin uses `BdApi.Plugins.get()` and `BdApi.Data` for inter-plugin communication instead of accessing Discord's internal modules

---

### ⚠️ React Fiber Traversal (Not Full React Injection)

**Status**: **PARTIALLY USES** React concepts (fiber traversal, not full injection)

**Locations**:

- **Line 1355, 1418, 1726, 1768, 1833**: React fiber key detection
- **Line 2518**: React fiber traversal for message elements

**Implementation**: Similar to CriticalHit - uses React fiber traversal to extract data

**Purpose**: Extract message data from Discord's React components

**What It Does**:

- ✅ Accesses React fiber properties
- ✅ Traverses React component tree
- ✅ Extracts message IDs and data

**What It Doesn't Do**:

- ❌ Does NOT patch React render functions
- ❌ Does NOT inject React components
- ❌ Does NOT use `BdApi.Patcher` on React components

**Compliance**: ✅ Uses React fiber traversal (allowed, not full injection)

---

## Summary Table

| Concept                   | CriticalHit    | SoloLevelingStats | Notes                                                 |
| ------------------------- | -------------- | ----------------- | ----------------------------------------------------- |
| **Function Patching**     | ✅ **YES**     | ❌ **NO**         | CriticalHit patches `MessageActions.sendMessage`      |
| **Webpack Modules**       | ✅ **YES**     | ❌ **NO**         | CriticalHit accesses `MessageActions` and `UserStore` |
| **React Injection**       | ⚠️ **PARTIAL** | ⚠️ **PARTIAL**    | Both use fiber traversal, not full injection          |
| **React Fiber Traversal** | ✅ **YES**     | ✅ **YES**        | Both traverse React fiber to extract data             |

---

## Detailed Analysis

### CriticalHit: Advanced Integration

**Function Patching**:

- Uses `BdApi.Patcher.after()` to intercept message sending
- Properly cleans up with `unpatchAll()` in `stop()` method
- Follows BetterDiscord best practices

**Webpack Modules**:

- Accesses Discord's internal `MessageActions` module
- Accesses `UserStore` for user information
- Uses proper filtering functions

**React Fiber Traversal**:

- Extracts message IDs from React components
- Traverses React fiber tree safely
- Does not modify React render tree

**Compliance**: ✅ **FULLY COMPLIANT** - Uses official APIs correctly

---

### SoloLevelingStats: DOM-Based Approach

**Function Patching**:

- ❌ Does not use function patching
- Uses `MutationObserver` and event listeners instead

**Webpack Modules**:

- ❌ Does not access webpack modules
- Uses `BdApi.Plugins` and `BdApi.Data` for inter-plugin communication

**React Fiber Traversal**:

- Uses React fiber to extract message data
- Does not modify React render tree

**Compliance**: ✅ **FULLY COMPLIANT** - Uses DOM-based approach (also valid)

---

## Comparison with BetterDiscord Guidelines

### Function Patching Guide Compliance

**CriticalHit**:

- ✅ Uses `BdApi.Patcher` (official API)
- ✅ Uses `after` patch type correctly
- ✅ Properly unpatch in `stop()` method
- ✅ Uses plugin identifier for cleanup

**SoloLevelingStats**:

- ✅ Does not need function patching (uses DOM approach)
- ✅ Alternative approach is also valid

### Webpack Modules Guide Compliance

**CriticalHit**:

- ✅ Uses `BdApi.Webpack.getModule()` (official API)
- ✅ Uses proper filter functions
- ✅ Accesses modules through official API only

**SoloLevelingStats**:

- ✅ Does not access webpack modules (not needed)
- ✅ Uses official APIs for inter-plugin communication

### React Injection Guide Compliance

**Both Plugins**:

- ✅ Use React fiber traversal (allowed)
- ✅ Do NOT directly patch React render functions
- ✅ Do NOT inject React components into Discord's tree
- ✅ Use safer DOM-based approach for UI modifications

**Note**: React fiber traversal is a **lighter approach** than full React injection. It reads React data without modifying the render tree, which is safer and more stable.

---

## Recommendations

### For CriticalHit

✅ **Already Following Best Practices**:

- Proper function patching with cleanup
- Official webpack API usage
- Safe React fiber traversal

**No changes needed** - plugin follows all guidelines correctly.

### For SoloLevelingStats

✅ **Already Following Best Practices**:

- DOM-based approach (also valid)
- No webpack access (not needed)
- Safe React fiber traversal

**No changes needed** - plugin uses appropriate approach for its functionality.

---

## Conclusion

### CriticalHit Plugin

- ✅ **Uses Function Patching**: Patches `MessageActions.sendMessage`
- ✅ **Uses Webpack Modules**: Accesses `MessageActions` and `UserStore`
- ⚠️ **Partial React Usage**: React fiber traversal (not full injection)

**Compliance**: ✅ **FULLY COMPLIANT** with BetterDiscord guidelines

### SoloLevelingStats Plugin

- ❌ **Does NOT use Function Patching**: Uses DOM-based approach
- ❌ **Does NOT use Webpack Modules**: Uses inter-plugin APIs
- ⚠️ **Partial React Usage**: React fiber traversal (not full injection)

**Compliance**: ✅ **FULLY COMPLIANT** with BetterDiscord guidelines

**Both plugins use appropriate approaches for their functionality and are fully compliant with BetterDiscord guidelines.**

---

## References

- [Function Patching Guide](https://docs.betterdiscord.app/plugins/concepts/patching)
- [Webpack Modules Guide](https://docs.betterdiscord.app/plugins/concepts/webpack)
- [React Injection Guide](https://docs.betterdiscord.app/plugins/concepts/react)

---

**Last Updated**: 2025-12-06
