# Dungeons.plugin.js Unused Code Analysis

## Summary

- **Total functions analyzed**: 581
- **Used functions**: 572 (98.4%)
- **Unused functions**: 9 (1.6%)
- **Unused variables**: 9

---

## 🔍 Unused Functions Analysis

### 1. **getDungeon(channelKey)** - Line 120

**Type**: StorageManager Query Function  
**Purpose**: Get single dungeon from IndexedDB by channel key  
**Status**: ✅ KEEP - Part of public API  
**Reason**: Useful for debugging and future features (dungeon inspection, recovery)

### 2. **getDungeonsByType(type)** - Line 192

**Type**: StorageManager Query Function  
**Purpose**: Query dungeons by biome type (Forest, Arctic, etc.)  
**Status**: ✅ KEEP - Part of public API  
**Reason**: Useful for analytics (e.g., "Show all Forest dungeons")

### 3. **getActiveDungeons()** - Line 207

**Type**: StorageManager Query Function  
**Purpose**: Get all currently active (not completed) dungeons  
**Status**: ✅ KEEP - Part of public API  
**Reason**: Useful for multi-dungeon management and dashboard features

### 4. **getDungeonsByRank(rank)** - Line 224

**Type**: StorageManager Query Function  
**Purpose**: Query dungeons by rank (E, D, C, B, A, S, etc.)  
**Status**: ✅ KEEP - Part of public API  
**Reason**: Useful for analytics and progression tracking

### 5. **getDatabaseStats()** - Line 539

**Type**: Debug/Diagnostic Function  
**Purpose**: Get IndexedDB statistics (total dungeons, size, etc.)  
**Status**: ✅ KEEP - Used for logging  
**Reason**: Called in start() for diagnostics (lines 527, 546)  
**NOTE**: Actually IS used! False positive in analysis

### 6. **shouldShadowRankUp(shadow)** - Line 2651

**Type**: Shadow Rank-Up Logic  
**Purpose**: Check if shadow meets rank-up criteria  
**Status**: ❌ REMOVE - Redundant  
**Reason**: Automatic rank-up is now handled by ShadowArmy plugin  
**Action**: Delete function (70 lines)

### 7. **getResurrectionPriority(shadowRank)** - Line 3324

**Type**: Helper Function  
**Purpose**: Get numerical priority for shadow resurrection  
**Status**: ✅ MAKE FUNCTIONAL - Should be used  
**Reason**: Resurrection system uses rank index directly; this provides abstraction  
**Action**: Use in `attemptAutoResurrection` to replace inline rank lookup

### 8. **reviveShadows(channelKey)** - Line 3380

**Type**: Manual Revive System  
**Purpose**: Manual shadow resurrection (costs mana)  
**Status**: ❌ REMOVE - Superseded  
**Reason**: Automatic resurrection system replaced this  
**Action**: Delete function (60 lines) OR make it a "mass revive" feature

### 9. **setupPanelWatcher()** - Line 4555

**Type**: HP Bar Positioning  
**Purpose**: Watch for Discord panel DOM changes  
**Status**: ❓ INVESTIGATE  
**Reason**: May be old HP bar code; check if HP bar works without it  
**Action**: Test HP bar behavior, then decide

---

## 📊 Unused Variables Analysis

### Combat Analytics (Lines 2471-2475)

```javascript
let _totalBossDamage = 0; // ✅ TRACKED, incremented at line 2553
let _totalMobDamage = 0; // ✅ TRACKED, incremented at line 2557
let _shadowsAttackedBoss = 0; // ✅ TRACKED, incremented at line 2554
let _shadowsAttackedMobs = 0; // ✅ TRACKED, incremented at line 2558
let _mobsKilled = 0; // ✅ TRACKED, incremented at line 2562
```

**Status**: ⚠️ MAKE FUNCTIONAL  
**Recommendation**: Add to completion summary for detailed combat analytics  
**Action**: Display in `showDungeonCompletionSummary` (new batch)

### Shadow Stats Tracking (Line 2391, 2454)

```javascript
const _rankDistribution = ...  // Shadow rank distribution string
const _aliveShadowCount = ...  // Count of alive shadows
```

**Status**: ⚠️ MAKE FUNCTIONAL  
**Recommendation**: Log for debugging or show in summary  
**Action**: Add console.log or include in completion summary

### User Stats (Lines 2987-2988)

```javascript
const _userStats = ...  // User stats object
const _userRank = ...   // User rank string
```

**Status**: ❌ REMOVE - Truly unused  
**Reason**: User attacks mobs but these vars are never used in calculations  
**Action**: Delete these lines (code still works without them)

---

## 🎯 Recommendations Summary

### ✅ KEEP (Public API - 5 functions)

- `getDungeon()`
- `getDungeonsByType()`
- `getActiveDungeons()`
- `getDungeonsByRank()`
- `getDatabaseStats()` (actually IS used!)

### ⚠️ MAKE FUNCTIONAL (2 items)

1. **Combat Analytics Variables** → Add to completion summary
2. **getResurrectionPriority()** → Use in resurrection logic

### ❌ REMOVE (3 items)

1. **shouldShadowRankUp()** - Redundant
2. **reviveShadows()** - Superseded by auto-resurrection
3. **\_userStats, \_userRank** - Unused variables

### ❓ INVESTIGATE (1 item)

1. **setupPanelWatcher()** - Test if needed for HP bar

---

## 📋 Implementation Plan

### Priority 1: Make Analytics Functional

Add new batch to completion summary showing:

- Total Boss Damage: 2,450,000
- Total Mob Damage: 15,670,000
- Shadow Army Stats:
  - Attacked Boss: 35 shadows
  - Attacked Mobs: 142 shadows
  - Mobs Killed by Shadows: 22,987

### Priority 2: Use getResurrectionPriority()

Replace inline rank lookup in `attemptAutoResurrection`

### Priority 3: Clean Up Dead Code

- Delete `shouldShadowRankUp()` (70 lines)
- Delete `reviveShadows()` (60 lines) OR repurpose as "Revive All" button
- Delete `_userStats`, `_userRank` (2 lines)

### Priority 4: Investigate

- Test HP bar with/without `setupPanelWatcher()`
- Delete if not needed

---

## 📊 Expected Impact

**Code Reduction**: ~130-200 lines (2-3% of file)  
**Functionality Added**: Combat analytics in summary  
**Code Quality**: Improved (no dead code, analytics functional)  
**Performance**: No impact (removed code wasn't executing)
