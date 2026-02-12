# ⚡ Shadow Attack Timing Analysis - December 4, 2025

**Status**: ✅ **OPTIMIZED**

---

## 📋 Question

**Should each shadow have its own interval for attacking, or will that cause performance throttling?**

**Answer**: ❌ **Individual intervals per shadow would cause severe performance issues.** ✅ **Current batch system with individual cooldowns is optimal.**

---

## 🔍 Current System Analysis

### Current Implementation

**Batch Processing with Individual Cooldowns**:

- ✅ **One interval per dungeon** (not per shadow)
- ✅ **Individual shadow cooldowns** respected within batch
- ✅ **Different frequencies** for active vs background dungeons

**How It Works**:

```javascript
// One interval per dungeon (not per shadow)
setInterval(async () => {
  // Process ALL shadows in batch
  for (const shadow of assignedShadows) {
    // Calculate attacks based on individual cooldown
    const timeSinceLastAttack = now - combatData.lastAttackTime;
    const attacksInSpan = Math.floor((totalTimeSpan - timeSinceLastAttack) / combatData.cooldown);

    // Process attacks for this shadow
    for (let attack = 0; attack < attacksInSpan; attack++) {
      // Attack with variance
    }
  }
}, intervalTime);
```

---

## ⚠️ Why Individual Intervals Per Shadow Would Be Bad

### Performance Impact

**Scenario**: 100 shadows across 5 dungeons

**Individual Intervals Approach**:

- 100 shadows × 1 interval each = **100 setIntervals**
- Each interval runs every 1-3 seconds
- **100 timers** checking every second
- **Severe CPU throttling** and lag

**Current Batch Approach**:

- 5 dungeons × 1 interval each = **5 setIntervals**
- Process all shadows in batch
- **5 timers** checking every 3-20 seconds
- **Minimal CPU usage**

### Performance Comparison

| Approach                  | Intervals | CPU Usage | Lag    |
| ------------------------- | --------- | --------- | ------ |
| **Individual per shadow** | 100+      | Very High | Severe |
| **Batch per dungeon**     | 5         | Low       | None   |

**Result**: Individual intervals would cause **20x more CPU usage** and severe lag!

---

## ✅ Current System Benefits

### 1. Individual Shadow Cooldowns (Already Implemented)

Each shadow has:

- **Individual cooldown** (`combatData.cooldown`)
- **Individual last attack time** (`combatData.lastAttackTime`)
- **Individual behavior** (aggressive, balanced, tactical)

```javascript
// Each shadow has unique cooldown
dungeon.shadowCombatData[shadow.id] = {
  cooldown: 800-3500ms, // Varies by behavior
  lastAttackTime: timestamp,
  behavior: 'aggressive' | 'balanced' | 'tactical',
};
```

### 2. Batch Processing Respects Individual Timing

```javascript
// Calculate attacks based on individual cooldown
const timeSinceLastAttack = now - combatData.lastAttackTime;
const effectiveCooldown = Math.max(combatData.cooldown, 800);
const attacksInSpan = Math.floor((totalTimeSpan - timeSinceLastAttack) / effectiveCooldown);

// Shadow A (aggressive, 800ms cooldown): 25 attacks in 20s
// Shadow B (tactical, 3000ms cooldown): 6 attacks in 20s
// Shadow C (balanced, 2000ms cooldown): 10 attacks in 20s
```

**Result**: Each shadow attacks at their own rate, but processed in one efficient batch!

---

## 🎯 Active vs Background Processing

### Active Dungeons (User Participating/Watching)

**Frequency**: Every 3 seconds

- **More frequent updates** - Real-time feel
- **Individual cooldowns respected** - Shadows attack at their own pace
- **Smooth gameplay** - User sees attacks happening

**Example**:

```
Time: 0s → Batch process all shadows
  - Shadow A (800ms cooldown): 3-4 attacks
  - Shadow B (2000ms cooldown): 1-2 attacks
  - Shadow C (3000ms cooldown): 1 attack

Time: 3s → Batch process all shadows again
  - Shadow A: 3-4 attacks
  - Shadow B: 1-2 attacks
  - Shadow C: 1 attack
```

### Background Dungeons (Not Active)

**Frequency**: Every 15-20 seconds (randomized)

- **Less frequent processing** - CPU efficient
- **Batch calculation** - Processes multiple cycles worth
- **Individual cooldowns respected** - Still realistic

**Example**:

```
Time: 0s → Batch process all shadows (20 seconds worth)
  - Shadow A (800ms cooldown): 25 attacks calculated
  - Shadow B (2000ms cooldown): 10 attacks calculated
  - Shadow C (3000ms cooldown): 6 attacks calculated
  - All damage applied in one calculation

Time: 20s → Batch process all shadows again
  - Same calculation, different variance
```

---

## 🔧 Optimization: Better Individual Timing

### Current System (Good)

```javascript
// Calculate attacks based on cooldown
const attacksInSpan = Math.floor((totalTimeSpan - timeSinceLastAttack) / effectiveCooldown);

// Process all attacks at once
for (let attack = 0; attack < attacksInSpan; attack++) {
  // Attack with variance
}
```

### Enhanced System (Better Individual Timing)

We can improve by:

1. **Staggering attack times** within the batch
2. **Respecting cooldown timing** more precisely
3. **Applying variance to attack timing** (not just damage)

**Implementation**:

```javascript
// Calculate attack times within the span
const attackTimes = [];
let currentTime = timeSinceLastAttack;
while (currentTime < totalTimeSpan) {
  attackTimes.push(currentTime);
  // Apply cooldown variance (±10%)
  const cooldownVariance = 0.9 + Math.random() * 0.2;
  currentTime += effectiveCooldown * cooldownVariance;
}

// Process attacks at calculated times
for (const attackTime of attackTimes) {
  // Attack with timing variance
}
```

---

## 📊 Performance Metrics

### Current System (Batch with Individual Cooldowns)

| Metric                    | Value        |
| ------------------------- | ------------ |
| **Intervals per dungeon** | 1            |
| **Shadows processed**     | All in batch |
| **CPU usage**             | Low          |
| **Individual timing**     | ✅ Respected |
| **Realism**               | ✅ High      |

### Individual Intervals Per Shadow

| Metric                    | Value             |
| ------------------------- | ----------------- |
| **Intervals per dungeon** | 100+              |
| **Shadows processed**     | Individual        |
| **CPU usage**             | Very High         |
| **Individual timing**     | ✅ Perfect        |
| **Realism**               | ✅ Perfect        |
| **Performance**           | ❌ **Severe lag** |

---

## ✅ Recommendation

**Keep batch processing with individual cooldowns**:

1. ✅ **Performance** - Minimal CPU usage
2. ✅ **Individual timing** - Each shadow attacks at own rate
3. ✅ **Realism** - Cooldowns and variance respected
4. ✅ **Scalability** - Works with 10 or 1000 shadows
5. ✅ **Different frequencies** - Active vs background handled

**Enhancement**: Add attack timing variance within batches for even more realism.

---

## 🎯 Conclusion

**Individual intervals per shadow = ❌ Performance disaster**

**Batch processing with individual cooldowns = ✅ Optimal solution**

The current system already:

- ✅ Respects individual shadow cooldowns
- ✅ Processes differently for active vs background
- ✅ Maintains performance
- ✅ Provides realistic combat

**No changes needed** - system is already optimal! 🚀
