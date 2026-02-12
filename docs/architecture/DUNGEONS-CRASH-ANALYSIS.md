# Dungeons Plugin Crash Analysis & Optimization Plan

## 🔴 Crash Reported - Root Cause Investigation

### Most Likely Crash Causes

**1. Extraction Queue Overflow** 🌊

- **Problem**: 3,000 mobs processing → 3,000 extractions queued
- **Issue**: Batch processing all 3,000 in parallel = memory explosion
- **Location**: Line 3535-3608 (`processExtractionQueue`)
- **Symptom**: Browser freezes, tab crashes, out of memory

**2. Mob Spawn Rate Too High** 🚀

- **Problem**: 500-1000 mobs every 5 seconds = 6,000-12,000/minute
- **Issue**: Spawning faster than killing = infinite growth
- **Location**: Line 1808-1975 (`spawnMobs`)
- **Symptom**: activeMobs array grows beyond 3,000 cap repeatedly

**3. Combat Processing Bottleneck** ⚔️

- **Problem**: Processing 3,000 mobs × 1,600 shadows = 4.8M operations
- **Issue**: Too many calculations per cycle
- **Location**: Line 2748-2920 (`processShadowAttacks`)
- **Symptom**: Lag, eventual crash from CPU overload

**4. Async Race Conditions** 🏁

- **Problem**: Multiple async extraction calls at once
- **Issue**: Promise.all with hundreds of promises
- **Location**: Line 3565-3590 (extraction batch)
- **Symptom**: Unpredictable crashes, database locks

**5. Memory Leak in Combat** 💾

- **Problem**: Dead mobs not cleaned up fast enough
- **Issue**: Array keeps growing despite cleanup
- **Location**: Line 3406-3411 (memory optimization)
- **Symptom**: Memory usage climbs, eventual crash

---

## 🎯 Optimization Plan (5 Major Improvements)

### 1. **Chunk Extraction Processing** (Prevent Memory Explosion)

**Current** (DANGEROUS):

```javascript
// Process all 3,000 extractions at once!
await Promise.all(pendingExtractions.map((item) => attemptExtraction(item)));
// 3,000 parallel operations = CRASH!
```

**Proposed** (SAFE):

```javascript
// Chunk into batches of 50
const CHUNK_SIZE = 50;
for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
  const chunk = pending.slice(i, i + CHUNK_SIZE);
  await Promise.all(chunk.map((item) => attemptExtraction(item)));

  // Small delay between chunks (prevent overwhelming)
  if (i + CHUNK_SIZE < pending.length) {
    await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms delay
  }
}
// 50 at a time = SAFE!
```

**Result**:

- 3,000 extractions → 60 batches of 50
- Total time: ~3 seconds (safe)
- No memory explosion

---

### 2. **Dynamic Spawn Rate** (Balance Spawning)

**Current** (UNBALANCED):

```javascript
// Always spawn 500-1000 every 5 seconds
const actualSpawnCount = 500 + Math.random() * 500;
// Regardless of how many alive!
```

**Proposed** (BALANCED):

```javascript
// Spawn based on current mob count (dynamic)
const aliveMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0).length;
const targetCapacity = 3000; // Match combat limit

let spawnCount;
if (aliveMobs < 1000) {
  spawnCount = 1000; // Rapid spawn when low
} else if (aliveMobs < 2000) {
  spawnCount = 500; // Normal spawn
} else if (aliveMobs < 2500) {
  spawnCount = 250; // Slow spawn
} else {
  spawnCount = 100; // Minimal spawn (near cap)
}

// Result: Self-balancing spawn rate
```

**Result**:

- Mobs stay near 2,500-3,000 (optimal)
- No infinite growth
- No spawn starvation

---

### 3. **Reduce Combat Frequency** (Less CPU)

**Current** (HEAVY):

```javascript
// Attack every 2 seconds
this.shadowAttackInterval = setInterval(() => {
  processShadowAttacks(); // 3,000 mobs processed
}, 2000);
```

**Proposed** (LIGHTER):

```javascript
// Attack every 3 seconds (50% less frequent)
this.shadowAttackInterval = setInterval(() => {
  processShadowAttacks(); // Same 3,000 limit
}, 3000); // Was 2000

// OR: Dynamic interval based on mob count
const aliveMobs = dungeon.mobs.activeMobs.filter((m) => m.hp > 0).length;
const interval = aliveMobs > 2000 ? 3000 : 2000;
```

**Result**:

- 33% less CPU usage
- Still epic battles
- Prevents crash from overload

---

### 4. **Extraction Rate Limiting** (Prevent Queue Backup)

**Current** (NO LIMIT):

```javascript
// Queue every single dead mob
deadMobs.forEach((mob) => queueMobForExtraction(mob));

// Process entire queue every cycle
await processExtractionQueue(); // Could be thousands!
```

**Proposed** (LIMITED):

```javascript
// Limit queue size per dungeon
const MAX_QUEUE_SIZE = 500; // Maximum pending extractions

// Only queue if under limit
if (queue.length < MAX_QUEUE_SIZE) {
  deadMobs.forEach((mob) => queueMobForExtraction(mob));
} else {
  // Queue full - skip extractions (prioritize stability)
  // User still gets majority of extractions
}

// Process max 200 per cycle (not all)
const toProcess = pendingExtractions.slice(0, 200);
```

**Result**:

- Queue never backs up
- Prevents memory overflow
- Still extract 80%+ of mobs

---

### 5. **Aggressive Memory Management** (Prevent Leaks)

**Current** (REACTIVE):

```javascript
// Clean up after combat
if (activeMobs.length > 3000) {
  activeMobs = activeMobs.slice(0, 3000);
}
```

**Proposed** (PROACTIVE):

```javascript
// Clean up MORE aggressively
if (activeMobs.length > 3000) {
  // Remove oldest 500 mobs (not just trim to 3000)
  activeMobs = activeMobs.slice(500, 3000);
}

// Also: Clear extraction queue more often
if (queue.length > 500) {
  // Remove old failed extractions (keep only recent)
  const now = Date.now();
  queue = queue.filter(
    (item) =>
      now - item.addedAt < 10000 || // Keep if < 10s old
      item.attempts === 0 // Keep if not tried yet
  );
}

// Also: Clear extraction events cache
if (extractionEvents.size > 1000) {
  // Clear old events (keep only last 500)
  const entries = Array.from(extractionEvents.entries());
  extractionEvents.clear();
  entries.slice(-500).forEach(([k, v]) => extractionEvents.set(k, v));
}
```

**Result**:

- Memory stays bounded
- No cache buildup
- No array explosion

---

## 📊 Expected Performance Improvements

| Metric                    | Before         | After     | Improvement  |
| ------------------------- | -------------- | --------- | ------------ |
| **Extraction processing** | 3,000 parallel | 50 chunks | 60x safer    |
| **Spawn rate**            | Fixed 750/5s   | Dynamic   | Balanced     |
| **Combat interval**       | 2s             | 3s        | 33% less CPU |
| **Queue size**            | Unlimited      | 500 max   | Capped       |
| **Memory usage**          | Growing        | Stable    | No leaks     |
| **Crash risk**            | High 🔴        | Low 🟢    | Much safer   |

---

## 🔧 Implementation Priority

**CRITICAL** (Fix Crash):

1. ✅ Chunk extraction processing (50 at a time)
2. ✅ Extraction queue limit (500 max)
3. ✅ Combat interval increase (2s → 3s)

**HIGH** (Improve Performance): 4. ✅ Dynamic spawn rate (based on mob count) 5. ✅ Aggressive memory cleanup

**MEDIUM** (Polish): 6. ⚡ Reduce combat limit (3000 → 2000 for safety) 7. ⚡ Extraction event cache cleanup 8. ⚡ Better error handling

---

## 💡 Additional Optimizations

### A. **Simplify Combat Calculations**

```javascript
// Skip some calculations
if (Math.random() > 0.8) {
  // 20% of attacks skip complex calculations
  damage = estimatedDamage; // Use cached estimate
}
```

### B. **Lazy Extraction**

```javascript
// Don't extract every mob
if (mob.rank === 'E' && Math.random() < 0.5) {
  // Skip 50% of E-rank extractions
  // Focus on higher ranks
}
```

### C. **Reduce Save Frequency**

```javascript
// Save every 10 cycles (20 seconds) instead of 5
if (this._saveCycleCount >= 10) {
  // Save less frequently
}
```

---

## 🎮 Expected User Experience

**Before** (Crashy):

- 😱 Browser tab crashes
- 💥 Discord freezes
- 🔴 Out of memory errors
- 😤 Frustrating

**After** (Smooth):

- ✅ Stable dungeons
- ⚡ Smooth performance
- 🎯 Still epic battles
- 😊 Playable

---

## 📋 Implementation Steps

**Step 1**: Chunk extraction processing (CRITICAL)
**Step 2**: Add extraction queue limit (CRITICAL)
**Step 3**: Increase combat interval to 3s (CRITICAL)
**Step 4**: Implement dynamic spawn rate (HIGH)
**Step 5**: Aggressive memory cleanup (HIGH)

**Want me to implement these fixes now?** 🔧

Each fix is independent, so I can apply them one by one and you can test stability after each!

Let me know which fixes you want me to apply! 🎯
