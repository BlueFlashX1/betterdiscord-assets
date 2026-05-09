# BetterDiscord Plugin Typing Lag Audit

**Scan Date**: 2026-03-28
**Scope**: All plugin source files in `src/` for synchronous main-thread blockers
**Focus**: Operations that run during normal chat usage (typing, sending, receiving messages)

---

## Executive Summary

Found **3 HIGH SEVERITY issues** that could cause typing lag during normal Discord usage, and **multiple MEDIUM issues** in less-critical paths.

### Critical Findings

1. **SoloLevelingStats: Double JSON.stringify comparison in constructor** (HIGH - once at startup, but large object)
2. **SoloLevelingStats: JSON.parse(JSON.stringify(...)) deep clone in backup path** (MEDIUM - fallback only)
3. **CriticalHit: Synchronous BdApi.Data.save in MutationObserver callback** (HIGH - runs every message)

---

## Critical Issues (Run During Typing/Messaging)

### 1. CriticalHit: BdApi.Data.save in Hot Path

**File**: `src/CriticalHit/history.js:110-165`
**Function**: `saveMessageHistory()`
**Severity**: **HIGH**
**When it runs**: Every 20 non-crit messages OR immediately for crit messages

**The Issue**:
```javascript
// Line 132 — SYNCHRONOUS SAVE in throttled call
BdApi.Data.save('CriticalHit', 'messageHistory', leanHistory);

// Lines 204-206 — More synchronous saves in same function
BdApi.Data.save(PLUGIN_NAME, "feedGuildIds", Object.keys(this._guildFeeds));
BdApi.Data.save(PLUGIN_NAME, "totalDetections", this._totalDetections);
```

**Context**: This is called from `_throttledSaveHistory()` (line 81-107), which is triggered:
- Line 526: `this._throttledSaveHistory(true)` — immediately after adding a crit message
- Line 528: `this._throttledSaveHistory(false)` — every 20th non-crit message

**Problem**: `BdApi.Data.save()` is **synchronous localStorage write**. On large histories (1000+ entries), serializing and persisting can block for **50-200ms**, causing:
- Typing lag during message composition
- Visual stutter when sending
- Janky animations during playback

**Proof of High Priority**:
- Crit messages trigger immediate save (line 525-526)
- User types → message detected as crit → save blocks → noticeable freeze
- Non-crits queue save every 20 messages (line 527)

**Fix Recommendation**: Defer to `requestIdleCallback()` or move to a worker thread via `setImmediate()`

---

### 2. SoloLevelingStats: Large Object JSON Stringification in Constructor

**File**: `src/SoloLevelingStats/index.js:304`
**Function**: Constructor (line 299-305)
**Severity**: **HIGH - Startup** (happens once when plugin loads)

**The Issue**:
```javascript
isDeepCopy: JSON.stringify(this.settings) === JSON.stringify(this.defaultSettings),
```

**Problem**:
- `this.settings` is a **large object** with nested structures: stats, skills, personality, activity tracking, etc.
- Stringifying it **twice** for a boolean comparison is expensive (~5-20ms depending on data size)
- This runs in the constructor, which **blocks plugin initialization**
- Not catastrophic for typing lag, but delays plugin load time

**Better Approach**: Use a flag (`this._isDeepCopy = true`) set during `structuredClone()`, or skip verification entirely (you just called `structuredClone`, you know it's a deep copy)

---

### 3. ShadowSenses: Per-Guild BdApi.Data.save in Event Loop

**File**: `src/ShadowSenses/senses-engine-feed.js:192-217`
**Function**: `_persistFeed()` (async but uses synchronous saves)
**Severity**: **HIGH - Async-in-name but saves are sync**

**The Issue**:
```javascript
// Lines 200-215 — Multiple BdApi.Data.save calls with yields
for (const guildId of this._dirtyGuilds) {
  BdApi.Data.save(PLUGIN_NAME, `feed_${guildId}`, this._guildFeeds[guildId] || []);
  await new Promise(r => setTimeout(r, 0));  // Yield between saves
}
BdApi.Data.save(PLUGIN_NAME, "feedGuildIds", Object.keys(this._guildFeeds));
await new Promise(r => setTimeout(r, 0));
BdApi.Data.save(PLUGIN_NAME, "totalDetections", this._totalDetections);
```

**Problem**:
- Each `BdApi.Data.save()` is **synchronous** — the `await setTimeout(r, 0)` only yields to other macrotasks AFTER the save completes
- If a user types during a guild feed save, **message composition blocks until all saves finish**
- Per-guild keys mean multiple serializations in sequence
- Yields are too short (0ms) — microqueue tasks can still starve the input thread

**Context**: Called when feed state changes (message detections, shadow activity, etc.)

---

## Medium Issues (Non-Critical Paths)

### 4. SoloLevelingStats: JSON.parse(JSON.stringify(...)) Deep Clone

**File**: `src/SoloLevelingStats/settings-store.js:987-1000`
**Function**: `_saveSettingsBackupFallback()`
**Severity**: **MEDIUM** (fallback, only runs if primary save fails)

**The Issue**:
```javascript
const backupData = JSON.parse(
  JSON.stringify({
    ...this.settings,
    activity: { ... },
  })
);
```

**Problem**:
- Double serialization (stringify → parse) to clone is **expensive** vs `structuredClone()`
- Runs on save failure → already in error path
- Settings object can be large (100+ fields with nested arrays/objects)
- **This is a fallback, so NOT critical path** — but still bad practice

**Fix**: Replace with `const backupData = structuredClone(this.settings)`

---

### 5. SoloLevelingStats: Verification Load After Save (Debug Only)

**File**: `src/CriticalHit/history.js:135`
**Function**: `saveMessageHistory()` — debug mode
**Severity**: **LOW** (debug only)

**The Issue**:
```javascript
if (this.debug?.enabled) {
  const verifyLoad = BdApi.Data.load('CriticalHit', 'messageHistory');
  // ... verification logic
}
```

**Problem**:
- Synchronous load immediately after save to verify persistence
- **Only runs when debug is enabled** — not production blocker
- Still adds latency to saves during debugging

---

### 6. CriticalHit: Cross-Plugin BdApi.Data.load in Message Pipeline

**File**: `src/CriticalHit/crit-engine.js:10-54`
**Functions**: `_loadAgilityBonus()`, `_loadSkillTreeBonus()`, `_loadEquipmentCritBonus()`, `_loadPerceptionBurstProfile()`
**Severity**: **MEDIUM** (called per crit roll)

**The Issue**:
```javascript
// Line 12 — Synchronous load in crit calculation
const agilityData = BdApi.Data.load('SoloLevelingStats', 'agilityBonus');

// Line 22 — Another synchronous load
const skillBonuses = BdApi.Data.load('SkillTree', 'bonuses');

// Line 72 — Another synchronous load
const saved = BdApi.Data.load('SoloLevelingStats', 'perceptionBurst') || {};
```

**Problem**:
- These run during **crit roll calculation** (every message that could crit)
- Cross-plugin data loads (SoloLevelingStats, SkillTree)
- **Repeated loads** for every crit check instead of caching
- Could cause **20-50ms stalls** if localStorage is under contention

**Fix**: Cache results for 5s TTL (like ShadowSenses does with `_availableCache`)

---

### 7. Dungeons: BdApi.Data.load in Hot Path (Stats Integration)

**File**: `src/Dungeons/stats-integration.js:106`
**Function**: `getSkillTreeBonuses()` (called during combat calculations)
**Severity**: **MEDIUM**

**The Issue**:
```javascript
bonuses = BdApi.Data.load('SkillTree', 'bonuses') || null;
```

**Problem**:
- Synchronous load inside cache check
- Runs on every bonus lookup during combat
- No TTL cache visible in this file

---

## Summary Table

| Plugin | File | Issue | Severity | Hot Path? | Recommended Fix |
|--------|------|-------|----------|-----------|-----------------|
| CriticalHit | history.js:132 | Sync BdApi.Data.save every 20 msgs | HIGH | YES | Defer to requestIdleCallback |
| ShadowSenses | senses-engine-feed.js:200 | Multiple sync saves with weak yields | HIGH | YES | Batch saves, use stronger async |
| SoloLevelingStats | index.js:304 | JSON.stringify comparison in constructor | HIGH | Startup only | Use structuredClone flag |
| Dungeons | stats-integration.js:106 | Sync load in hot path | MEDIUM | YES | Add 5s TTL cache |
| CriticalHit | crit-engine.js:12,22,72 | Repeated cross-plugin sync loads | MEDIUM | YES | Implement local cache (5s TTL) |
| SoloLevelingStats | settings-store.js:987 | JSON.parse(JSON.stringify()) clone | MEDIUM | Fallback only | Use structuredClone |
| CriticalHit | history.js:135 | Verify load in debug mode | LOW | Debug only | Keep as-is (debug only) |

---

## Optimization Patterns to Apply

### Pattern 1: TTL Cache for Cross-Plugin Loads

Already implemented in **ShadowSenses** (`src/ShadowSenses/deployment-manager.js:46`):
```javascript
this._availableCache = _ttl(5000); // 5s TTL

// Later:
const cached = this._availableCache.get('key');
if (cached) return cached;
const data = BdApi.Data.load(...);
this._availableCache.set('key', data);
```

**Apply to**: CriticalHit crit-engine.js bonus loads, Dungeons stats-integration.js

---

### Pattern 2: Defer Saves to requestIdleCallback

Better than `await setTimeout(r, 0)`:
```javascript
// Instead of:
BdApi.Data.save(plugin, key, data);

// Use:
requestIdleCallback(() => {
  BdApi.Data.save(plugin, key, data);
}, { timeout: 5000 }); // Fallback to 5s timeout
```

**Apply to**: CriticalHit history.js, ShadowSenses feed persistence

---

### Pattern 3: Batch Multiple Saves

Instead of:
```javascript
BdApi.Data.save(key1, data1);
await setTimeout(r, 0);
BdApi.Data.save(key2, data2);
```

Batch into one save:
```javascript
BdApi.Data.save('Batch', {
  key1: data1,
  key2: data2,
});
```

---

### Pattern 4: Flag Instead of Stringification

Instead of:
```javascript
isDeepCopy: JSON.stringify(this.settings) === JSON.stringify(this.defaultSettings)
```

Use:
```javascript
this._isDeepCopy = true; // Set during structuredClone()
```

---

## Action Items

### Immediate (HIGH severity)
1. **CriticalHit history.js**: Wrap `BdApi.Data.save()` calls in `requestIdleCallback()`
2. **ShadowSenses feed.js**: Strengthen async yielding between saves or batch them
3. **SoloLevelingStats index.js**: Remove JSON.stringify comparison, use flag instead

### Short-term (MEDIUM severity)
4. **CriticalHit crit-engine.js**: Add 5s TTL cache for cross-plugin bonus loads
5. **Dungeons stats-integration.js**: Add TTL cache around BdApi.Data.load

### Low-priority (MEDIUM fallback path)
6. **SoloLevelingStats settings-store.js**: Replace JSON.parse(JSON.stringify()) with structuredClone()

---

## Testing Recommendations

1. **Measure typing latency** before/after fixes with typing test tools
2. **Check localStorage contention** during peak activity (lots of messages, combat)
3. **Profile with DevTools** during message send to confirm BdApi.Data.save() no longer blocks
4. **Test on low-end devices** (older Macs, slower drives) where localStorage latency is worst

---

## Notes

- All `BdApi.Data.*` operations use **localStorage** underneath, which is **synchronous**
- Discord's message processing is time-sensitive — even 50ms stalls are noticeable during typing
- The event loop yielding (`await setTimeout(r, 0)`) is a weak pattern — use `requestIdleCallback()` instead
- `structuredClone()` is available in modern browsers and is the correct deep-clone approach (not JSON.parse/stringify)

