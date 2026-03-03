# Dungeons Plugin - Improvement Analysis

**Date**: 2025-12-03  
**Based On**: Live console log analysis  
**Status**: Analysis complete, improvements identified

---

## 📊 Console Log Analysis

### Observed Patterns (from console):

```
✅ 10 shadows resurrected. Mana: 26699/28070 (95%)
✅ 20 shadows resurrected. Mana: 26603/28070 (94%)
✅ 30 shadows resurrected. Mana: 28046/28070 (99%)
... (repeats every 10 shadows)

Boss AOE attacked 3 shadows for 1277 total damage!
Boss AOE attacked 3 shadows for 2430 total damage!
Boss AOE attacked 3 shadows for 691 total damage!
... (repeats frequently)

🌟 5 shadows extracted from mobs!
🌟 10 shadows extracted from mobs!
🌟 15 shadows extracted from mobs!
... (repeats every 5 extractions)

⚡ [C] Murky Marshland: BURST SPAWN 4320/14400 mobs (30%)
⚡ [D] Ash Realm: BURST SPAWN 1500/5000 mobs (30%)

[Dungeons] Dungeon not found in active list
[Dungeons] Dungeon not found in active list
... (repeats when accessing cleared dungeons)
```

---

## 🎯 Issues Identified

### 1. **Console Spam** ⚠️ HIGH PRIORITY

**Issue**: Too many frequent logs creating noise

| Log Type | Frequency | Impact |
|----------|-----------|--------|
| Shadow resurrection | Every 10 shadows | High spam |
| Boss AOE attacks | Every attack (~2-5s) | Very high spam |
| Shadow extractions | Every 5 extractions | Medium spam |
| Burst spawns | Once per dungeon | Acceptable |
| "Dungeon not found" | When accessing cleared dungeons | Error spam |

**Impact**: Console becomes unreadable, hard to debug real issues

---

### 2. **"Dungeon Not Found" Error** ⚠️ MEDIUM PRIORITY

**Location**: Line 2614

**Issue**: When user switches channels or dungeon despawns, code tries to access it and logs error

**Context**:
```javascript
const currentDungeonWeight = dungeonWeights.find(
  (dw) => dw.dungeon.channelKey === channelKey
);

if (!currentDungeonWeight) {
  console.log('[Dungeons] Dungeon not found in active list'); // ← SPAM
  return;
}
```

**Problem**: This is not really an error - it's normal behavior when:
- User switches to channel without dungeon
- Dungeon was cleared/despawned
- User navigating between channels

**Impact**: Creates false alarm in console, suggests plugin error when it's normal

---

### 3. **Resurrection Logging** ⚠️ HIGH PRIORITY

**Location**: Line 3644

**Issue**: Logs every 10 shadows resurrected

**Problem**: In battles with 100+ shadows, this creates 10+ log entries very quickly

**Current Code**:
```javascript
if (dungeon.successfulResurrections % 10 === 0) {
  const percent = Math.floor((manaAfter / this.settings.userMaxMana) * 100);
  console.log(
    `[Dungeons] ✅ ${dungeon.successfulResurrections} shadows resurrected. Mana: ${manaAfter}/${this.settings.userMaxMana} (${percent}%)`
  );
}
```

**Observation**: Logs at 10, 20, 30, 40, ... 420, 430 shadows (43+ logs in one battle!)

---

### 4. **Boss AOE Logging** ⚠️ VERY HIGH PRIORITY

**Location**: Line 3037

**Issue**: Logs EVERY single AOE attack

**Problem**: Boss attacks every few seconds, creating constant spam

**Current Code**:
```javascript
console.log(
  `[Dungeons] Boss AOE attacked ${actualTargets} shadows for ${Math.floor(
    totalDamageToShadows
  )} total damage!`
);
```

**Observation**: Can generate 50-100+ logs per dungeon clear

---

### 5. **Shadow Extraction Logging** ⚠️ MEDIUM PRIORITY

**Location**: Line 3495

**Issue**: Logs every 5 extractions

**Problem**: In dungeons with 1000+ shadows, creates 200+ log entries

**Current Code**:
```javascript
if (dungeon.mobExtractions % 5 === 0) {
  console.log(
    `[Dungeons] 🌟 ${dungeon.mobExtractions} shadows extracted from mobs!`
  );
}
```

---

## ✅ Proposed Solutions

### Solution 1: Debug Mode Toggle ⭐ RECOMMENDED

**Add settings toggle for verbose logging**:

```javascript
// In settings
{
  type: 'switch',
  id: 'debugMode',
  name: 'Debug Mode',
  note: 'Enable verbose console logging for debugging',
  value: false  // Default OFF
}

// In code
if (this.settings.debugMode) {
  console.log('[Dungeons] Verbose log...');
}
```

**Benefits**:
- Users can enable when debugging
- Reduces spam by default
- Keeps logs for troubleshooting
- Professional UX

---

### Solution 2: Reduce Log Frequency

**Resurrection Logs** - Change from every 10 to every 50:
```javascript
// OLD: Every 10 shadows
if (dungeon.successfulResurrections % 10 === 0)

// NEW: Every 50 shadows (or milestones)
if (dungeon.successfulResurrections % 50 === 0 || 
    dungeon.successfulResurrections === 100 ||
    dungeon.successfulResurrections === 200)
```

**Boss AOE Logs** - Only log significant attacks:
```javascript
// OLD: Every attack
console.log(`Boss AOE attacked...`);

// NEW: Only when kills occur or milestone
if (shadowsKilled > 0 || actualTargets >= 5) {
  console.log(`Boss AOE attacked...`);
}
```

**Extraction Logs** - Change from every 5 to every 25:
```javascript
// OLD: Every 5 extractions
if (dungeon.mobExtractions % 5 === 0)

// NEW: Every 25 extractions
if (dungeon.mobExtractions % 25 === 0)
```

---

### Solution 3: Fix "Dungeon Not Found" Error

**Remove log entirely** (it's not an error):

```javascript
// OLD
if (!currentDungeonWeight) {
  console.log('[Dungeons] Dungeon not found in active list');
  return;
}

// NEW
if (!currentDungeonWeight) {
  // Silent return - this is normal when switching channels
  return;
}
```

**Or make it debug-only**:
```javascript
if (!currentDungeonWeight) {
  if (this.settings.debugMode) {
    console.log('[Dungeons] Dungeon not found in active list (normal)');
  }
  return;
}
```

---

### Solution 4: Batch Logging (Advanced)

**Batch similar events and log summary**:

```javascript
// Track events
this.logBatch = {
  resurrections: 0,
  aoeAttacks: 0,
  extractions: 0,
  lastLog: Date.now()
};

// Accumulate
this.logBatch.resurrections++;
this.logBatch.aoeAttacks++;

// Log summary every 30 seconds
if (Date.now() - this.logBatch.lastLog > 30000) {
  console.log(
    `[Dungeons] Battle Summary: ${this.logBatch.resurrections} resurrections, ` +
    `${this.logBatch.aoeAttacks} boss attacks, ${this.logBatch.extractions} extractions`
  );
  this.logBatch = { resurrections: 0, aoeAttacks: 0, extractions: 0, lastLog: Date.now() };
}
```

---

### Solution 5: Log Levels

**Implement log level system**:

```javascript
// Log levels
const LOG_LEVELS = {
  NONE: 0,     // No logs
  ERROR: 1,    // Only errors
  WARN: 2,     // Warnings + errors
  INFO: 3,     // Important info
  DEBUG: 4,    // Everything
  VERBOSE: 5   // Everything + spam
};

// In settings
{
  type: 'dropdown',
  id: 'logLevel',
  name: 'Log Level',
  options: [
    { label: 'None', value: 0 },
    { label: 'Errors Only', value: 1 },
    { label: 'Important Info', value: 3 },
    { label: 'Debug', value: 4 }
  ],
  value: 3  // Default: Important info only
}

// Usage
if (this.settings.logLevel >= LOG_LEVELS.DEBUG) {
  console.log('[Dungeons] Detailed debug info...');
}

if (this.settings.logLevel >= LOG_LEVELS.VERBOSE) {
  console.log('[Dungeons] Every single event...');
}
```

---

## 🎯 Recommended Changes

### Phase 1: Quick Fixes (Conservative)

1. ✅ **Remove "Dungeon not found" log** (not an error)
2. ✅ **Reduce resurrection logs** from every 10 to every 50
3. ✅ **Reduce extraction logs** from every 5 to every 25
4. ✅ **Remove most AOE logs** (only log kills or big attacks)

**Estimated reduction**: ~85% less console spam

---

### Phase 2: Debug Mode (Recommended)

1. ✅ **Add debug mode toggle** in settings
2. ✅ **Gate verbose logs** behind debug flag
3. ✅ **Keep important logs** always visible
4. ✅ **User controls verbosity**

**Benefits**: Professional, user-controlled, maintains debug capability

---

### Phase 3: Advanced (Optional)

1. ⭐ **Log batching system**
2. ⭐ **Log level dropdown**
3. ⭐ **Battle summary instead of per-event logs**
4. ⭐ **Performance metrics tracking**

**Benefits**: Maximum flexibility, minimal spam, better UX

---

## 📊 Log Categorization

### Keep (Always Visible):

- ✅ Dungeon spawn announcements
- ✅ Boss defeated messages
- ✅ Dungeon completed/failed messages
- ✅ Critical errors
- ✅ Achievement milestones

### Reduce Frequency:

- ⚠️ Resurrection logs (every 10 → every 50 or 100)
- ⚠️ Extraction logs (every 5 → every 25 or 50)
- ⚠️ Boss AOE (every attack → only kills or big attacks)

### Remove or Debug-Only:

- ❌ "Dungeon not found" (normal behavior)
- ❌ Per-attack AOE logs (too frequent)
- ❌ Every 10 resurrection (too spammy)
- ❌ Database operation logs (internal)

---

## 🔧 Implementation Priority

| Change | Priority | Effort | Impact |
|--------|----------|--------|--------|
| Remove "Dungeon not found" | High | 1 min | Immediate |
| Reduce resurrection frequency | High | 2 min | High |
| Reduce AOE logs | High | 2 min | Very High |
| Reduce extraction logs | Medium | 1 min | Medium |
| **Add debug mode toggle** | **High** | **10 min** | **Best solution** |
| Batch logging system | Low | 30 min | Advanced |
| Log levels dropdown | Low | 20 min | Advanced |

---

## 🚀 Quick Win: Phase 1 Changes

**Estimated time**: 5 minutes  
**Impact**: 85% less console spam  
**Risk**: None (just logging changes)

### Changes to make:

1. **Line 2614**: Remove or silence "Dungeon not found"
2. **Line 3644**: Change `% 10` to `% 50`
3. **Line 3037**: Add condition - only log if kills or big attack
4. **Line 3495**: Change `% 5` to `% 25`

---

## 🎓 Best Practice

**Recommended**: Add debug mode toggle (Phase 2)

**Why**:
- Professional plugin behavior
- User controls verbosity
- Easy to debug when needed
- Clean console by default

**Similar to other plugins**:
- SoloLevelingStats has debug logging system
- CriticalHit has debug mode
- Industry standard for BetterDiscord plugins

---

**Next Step**: Implement Phase 1 (quick fixes) or Phase 2 (debug mode)?
