# Dungeons Plugin - Final Fixes

## 🎯 Issues to Fix

### 1. ❌ **Dungeon Timeout Not Working**

**Problem**: Dungeon timed out after 10 minutes, then came back without any messages
**Root Cause**: No active timeout mechanism! Dungeons only check elapsed time on restore, but don't auto-complete after 10 minutes

### 2. ⚠️ **Spawn Interval Too Fixed**

**Problem**: Spawns every exactly 10 seconds (fixed interval)
**Requested**: Variable spawn timing with good mid-range variance

### 3. ⚠️ **HP Scaling Evaluation Needed**

**Current State**:

- Boss HP: 4,500-9,000 per shadow (very high!)
- Mob HP: 250 + vit*8 + rank*200 (already nerfed 50%)
  **Question**: Should boss HP be reduced?

---

## 🔧 Fix 1: Dungeon Timeout System

### Problem Analysis

```javascript
// Current: NO timeout mechanism!
// Dungeons are created but never auto-complete after 10 minutes
// Only check happens on restore (line 5859):
const elapsed = Date.now() - dungeon.startTime;
if (elapsed < this.settings.dungeonDuration) {
  // Restore dungeon
} else {
  // Delete expired dungeon
}

// BUT: If user stays in Discord, dungeon never expires!
```

### Solution: Add Active Timeout Timer

```javascript
// When spawning dungeon (line ~1650):
async spawnDungeon(channelKey, channelInfo) {
  // ... existing spawn code ...

  // ADD: Set timeout for dungeon completion
  const timeoutId = setTimeout(() => {
    this.completeDungeon(channelKey, 'timeout');
  }, this.settings.dungeonDuration); // 10 minutes

  // Store timeout ID for cleanup
  if (!this.dungeonTimeouts) this.dungeonTimeouts = new Map();
  this.dungeonTimeouts.set(channelKey, timeoutId);

  // ... rest of spawn code ...
}

// When completing dungeon (line ~4186):
async completeDungeon(channelKey, reason) {
  // ... existing completion code ...

  // ADD: Clear timeout timer
  if (this.dungeonTimeouts?.has(channelKey)) {
    clearTimeout(this.dungeonTimeouts.get(channelKey));
    this.dungeonTimeouts.delete(channelKey);
  }

  // ... rest of completion code ...
}

// When stopping plugin:
stop() {
  // ADD: Clear all dungeon timeouts
  if (this.dungeonTimeouts) {
    this.dungeonTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.dungeonTimeouts.clear();
  }
  // ... rest of stop code ...
}
```

**Result**: Dungeons will auto-complete after exactly 10 minutes!

---

## 🔧 Fix 2: Variable Spawn Interval

### Problem

```javascript
// Current (line 1708):
const timer = setInterval(() => {
  this.spawnMobs(channelKey);
}, this.settings.mobSpawnInterval); // Fixed 10000ms (10s)
```

### Solution: Dynamic Interval with Variance

```javascript
// Replace fixed interval with dynamic scheduling
startMobSpawning(channelKey) {
  if (this.mobSpawnTimers.has(channelKey)) return;

  const scheduleNextSpawn = () => {
    const dungeon = this.activeDungeons.get(channelKey);
    if (!dungeon || dungeon.completed || dungeon.failed) {
      this.stopMobSpawning(channelKey);
      return;
    }

    // Spawn mobs
    this.spawnMobs(channelKey);

    // Calculate next spawn time with variance
    // Base: 10 seconds
    // Variance: ±20% (8-12 seconds)
    const baseInterval = this.settings.mobSpawnInterval; // 10000ms
    const variance = baseInterval * 0.2; // ±2000ms
    const nextInterval = baseInterval - variance + (Math.random() * variance * 2);
    // Result: 8000-12000ms (8-12 seconds)

    // Schedule next spawn
    const timeoutId = setTimeout(scheduleNextSpawn, nextInterval);
    this.mobSpawnTimers.set(channelKey, timeoutId);
  };

  // Start first spawn
  scheduleNextSpawn();
}

stopMobSpawning(channelKey) {
  const timer = this.mobSpawnTimers.get(channelKey);
  if (timer) {
    clearTimeout(timer); // Changed from clearInterval
    this.mobSpawnTimers.delete(channelKey);
  }
}
```

**Result**:

- Spawns every 8-12 seconds (variable!)
- Good mid-range variance (±20%)
- Not spammy (8s minimum)
- Not too long (12s maximum)
- Dynamic flow!

---

## 🔧 Fix 3: HP Scaling Evaluation

### Current HP Values

**Boss HP**:

```javascript
// Base: 500 + rankIndex * 500
// Shadow Scaling: shadowCount * hpPerShadow

// HP per shadow by biome:
Forest: 4,500 HP/shadow
Arctic: 6,000 HP/shadow
Cavern: 5,500 HP/shadow
Swamp: 5,000 HP/shadow
Mountains: 7,000 HP/shadow
Volcano: 8,000 HP/shadow
Ancient Ruins: 6,500 HP/shadow
Dark Abyss: 9,000 HP/shadow
Tribal Grounds: 5,500 HP/shadow

// Example: E-rank Forest dungeon with 100 shadows
// Boss HP = 500 + (0 * 500) + (100 * 4500) = 450,500 HP!
```

**Mob HP**:

```javascript
// Already nerfed 50%!
// Base: 250 + vitality*8 + rankIndex*200
// Variance: 70-100% (reduced from 80-120%)

// Example: E-rank mob with 50 vitality
// Mob HP = (250 + 50*8 + 0*200) * 0.85 = 595 HP (average)
```

### Analysis

**Boss HP**:

- ✅ **GOOD** - Bosses need high HP to survive shadow army attacks
- Average shadow damage: 1,000-2,000 per hit
- With 100 shadows attacking every 3s, boss takes ~100,000-200,000 damage/3s
- Current HP (450k) = ~7-14 seconds survival time
- **Recommendation**: **KEEP CURRENT** (already balanced for shadow army)

**Mob HP**:

- ✅ **GOOD** - Already nerfed 50%
- Mobs die quickly (1-2 shadow hits)
- Allows for fast-paced combat
- **Recommendation**: **KEEP CURRENT** (already optimized)

### Verdict: **NO HP CHANGES NEEDED** ✅

Both boss and mob HP are already well-balanced:

- Bosses survive long enough for epic battles
- Mobs die quickly for satisfying combat
- System is already optimized!

---

## 📋 Implementation Checklist

### High Priority

- [ ] Add dungeon timeout timer system
- [ ] Add variable spawn interval (8-12s)
- [ ] Test timeout completion
- [ ] Test variable spawn timing

### Optional

- [ ] HP scaling: **NO CHANGES** (already balanced)

---

## 🎮 Expected Results

**After Fixes**:

**Dungeon Timeout**:

- ✅ Dungeons auto-complete after exactly 10 minutes
- ✅ No more "zombie" dungeons that never end
- ✅ Clean completion with proper XP rewards
- ✅ Proper cleanup (timers, storage, memory)

**Variable Spawn Timing**:

- ✅ Spawns every 8-12 seconds (not fixed 10s)
- ✅ Dynamic flow (feels more natural)
- ✅ Good variance (±20%)
- ✅ Not spammy, not too slow

**HP Scaling**:

- ✅ No changes needed (already balanced!)
- ✅ Bosses survive 7-14 seconds (epic battles)
- ✅ Mobs die in 1-2 hits (fast-paced)

---

## 🚀 Next Steps

1. Implement dungeon timeout system
2. Implement variable spawn interval
3. Test both systems
4. Confirm HP scaling is good (no changes)
