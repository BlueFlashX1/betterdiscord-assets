# ⚖️ Batch vs Individual Timing - How It Balances Both

**Status**: ✅ **EXPLAINED**

---

## 📋 The Question

**How does batch processing balance both:**

1. **Fixed interval** - One timer per dungeon (performance)
2. **Individualistic interval** - Each shadow attacks at own pace (realism)

---

## 🎯 The Solution: Two-Layer Timing System

### Layer 1: Fixed Interval (Dungeon Level)

**Purpose**: Performance - One timer per dungeon

```javascript
// ONE interval per dungeon (fixed timing)
setInterval(async () => {
  // Process ALL shadows in batch
  await this.processShadowAttacks(channelKey, cyclesMultiplier);
}, intervalTime); // Active: 3s, Background: 15-20s
```

**Characteristics**:

- ✅ **Fixed frequency** - Runs at predictable intervals
- ✅ **One timer** - Minimal CPU overhead
- ✅ **Batch trigger** - Starts processing for all shadows

### Layer 2: Individual Cooldowns (Shadow Level)

**Purpose**: Realism - Each shadow attacks at own pace

```javascript
// Inside batch processing
for (const shadow of assignedShadows) {
  const combatData = dungeon.shadowCombatData[shadow.id];

  // Calculate attacks based on THIS shadow's individual cooldown
  const timeSinceLastAttack = now - combatData.lastAttackTime;
  const effectiveCooldown = combatData.cooldown; // Unique per shadow!
  const attacksInSpan = Math.floor((totalTimeSpan - timeSinceLastAttack) / effectiveCooldown);

  // Shadow A: 800ms cooldown → 25 attacks in 20s
  // Shadow B: 2000ms cooldown → 10 attacks in 20s
  // Shadow C: 3000ms cooldown → 6 attacks in 20s
}
```

**Characteristics**:

- ✅ **Individual cooldowns** - Each shadow has unique timing
- ✅ **Respected within batch** - Calculated per shadow
- ✅ **Realistic combat** - Shadows attack at different rates

---

## 🔄 How It Works: Step-by-Step

### Example: Active Dungeon (3 Second Intervals)

**Setup**:

- Shadow A: Aggressive (800ms cooldown)
- Shadow B: Balanced (2000ms cooldown)
- Shadow C: Tactical (3000ms cooldown)

**Timeline**:

```
Time: 0.0s → [FIXED INTERVAL TRIGGERS]
  └─ Batch processing starts

  Shadow A:
    - Last attack: -1.5s (ready!)
    - Time available: 3s
    - Attacks: floor(3s / 0.8s) = 3 attacks
    - Attack times: 0.0s, 0.8s, 1.6s (within batch)

  Shadow B:
    - Last attack: -0.5s (ready!)
    - Time available: 3s
    - Attacks: floor(3s / 2.0s) = 1 attack
    - Attack time: 0.0s (within batch)

  Shadow C:
    - Last attack: -2.0s (ready!)
    - Time available: 3s
    - Attacks: floor(3s / 3.0s) = 1 attack
    - Attack time: 0.0s (within batch)

  └─ All attacks processed in ONE batch calculation
  └─ Update lastAttackTime for each shadow

Time: 3.0s → [FIXED INTERVAL TRIGGERS AGAIN]
  └─ Batch processing starts

  Shadow A:
    - Last attack: 1.6s (from previous batch)
    - Time since: 3.0s - 1.6s = 1.4s
    - Time available: 3s
    - Attacks: floor((1.4s + 3s) / 0.8s) = 5 attacks
    - Attack times: 1.6s, 2.4s, 3.2s, 4.0s, 4.8s

  Shadow B:
    - Last attack: 0.0s (from previous batch)
    - Time since: 3.0s - 0.0s = 3.0s
    - Time available: 3s
    - Attacks: floor((3.0s + 3s) / 2.0s) = 3 attacks
    - Attack times: 0.0s, 2.0s, 4.0s

  Shadow C:
    - Last attack: 0.0s (from previous batch)
    - Time since: 3.0s - 0.0s = 3.0s
    - Time available: 3s
    - Attacks: floor((3.0s + 3s) / 3.0s) = 2 attacks
    - Attack times: 0.0s, 3.0s

  └─ All attacks processed in ONE batch calculation
```

**Key Insight**:

- ✅ **Fixed interval** triggers at 0s, 3s, 6s, 9s... (predictable)
- ✅ **Individual timing** - Each shadow attacks at different rates within each batch
- ✅ **No missed attacks** - Time since last attack is tracked, so attacks accumulate

---

## 📊 Visual Timeline Comparison

### Individual Intervals (Bad - Performance Issue)

```
Shadow A (800ms):  |--|--|--|--|--|--|--|--|--|--|  (10 intervals)
Shadow B (2000ms): |----|----|----|----|----|      (5 intervals)
Shadow C (3000ms): |------|------|------|          (3 intervals)

Total: 18 setIntervals running simultaneously ❌
```

### Batch Processing (Good - Optimal)

```
Fixed Interval:    |----|----|----|----|----|      (1 interval)

Within each batch:
  Shadow A:        |--|--|--|--|--|                (calculated, not separate intervals)
  Shadow B:        |----|----|                      (calculated, not separate intervals)
  Shadow C:        |------|                         (calculated, not separate intervals)

Total: 1 setInterval, all shadows processed ✅
```

---

## 🎯 How Individual Timing Is Preserved

### 1. Individual Cooldowns Stored

```javascript
dungeon.shadowCombatData[shadow.id] = {
  cooldown: 800-3500ms, // Unique per shadow (based on behavior)
  lastAttackTime: timestamp, // Tracks when THIS shadow last attacked
  behavior: 'aggressive' | 'balanced' | 'tactical',
};
```

### 2. Time Since Last Attack Tracked

```javascript
const timeSinceLastAttack = now - combatData.lastAttackTime;
// Shadow A: 1.4s since last attack
// Shadow B: 3.0s since last attack
// Shadow C: 0.5s since last attack
```

### 3. Attacks Calculated Per Shadow

```javascript
const attacksInSpan = Math.floor((totalTimeSpan - timeSinceLastAttack) / effectiveCooldown);
// Shadow A: floor((3s - 1.4s) / 0.8s) = 2 attacks
// Shadow B: floor((3s - 3.0s) / 2.0s) = 0 attacks (not ready yet)
// Shadow C: floor((3s - 0.5s) / 3.0s) = 0 attacks (not ready yet)
```

### 4. Time Advanced Per Shadow

```javascript
// Calculate actual time spent based on attacks
let actualTimeSpent = timeSinceLastAttack;
for (let i = 0; i < attacksInSpan; i++) {
  const cooldownVariance = 0.9 + Math.random() * 0.2;
  actualTimeSpent += effectiveCooldown * cooldownVariance;
}
combatData.lastAttackTime = now + actualTimeSpent;

// Shadow A: lastAttackTime = now + 1.6s (2 attacks × 0.8s)
// Shadow B: lastAttackTime = now + 0s (no attacks, still waiting)
// Shadow C: lastAttackTime = now + 0s (no attacks, still waiting)
```

---

## 🔄 Active vs Background: Same System, Different Frequency

### Active Dungeon (Every 3 Seconds)

**Fixed Interval**: Every 3 seconds

- **More frequent batches** - Real-time feel
- **Smaller time spans** - Each batch processes 3 seconds worth
- **Individual cooldowns respected** - Shadows attack at own pace within 3s window

**Example**:

```
Time: 0s → Batch (3s span)
  Shadow A: 3-4 attacks (800ms cooldown)
  Shadow B: 1-2 attacks (2000ms cooldown)
  Shadow C: 1 attack (3000ms cooldown)

Time: 3s → Batch (3s span)
  Shadow A: 3-4 attacks
  Shadow B: 1-2 attacks
  Shadow C: 1 attack
```

### Background Dungeon (Every 15-20 Seconds)

**Fixed Interval**: Every 15-20 seconds (randomized)

- **Less frequent batches** - CPU efficient
- **Larger time spans** - Each batch processes 15-20 seconds worth
- **Individual cooldowns respected** - Shadows attack at own pace within 15-20s window

**Example**:

```
Time: 0s → Batch (20s span)
  Shadow A: 25 attacks (800ms cooldown × 20s)
  Shadow B: 10 attacks (2000ms cooldown × 20s)
  Shadow C: 6 attacks (3000ms cooldown × 20s)
  All calculated in ONE batch, variance applied per attack

Time: 20s → Batch (20s span)
  Shadow A: 25 attacks (different variance)
  Shadow B: 10 attacks (different variance)
  Shadow C: 6 attacks (different variance)
```

---

## ✅ Benefits of This Approach

### 1. Performance (Fixed Interval)

- ✅ **One timer per dungeon** - Minimal CPU overhead
- ✅ **Predictable timing** - Easy to debug and optimize
- ✅ **Scalable** - Works with 10 or 1000 shadows

### 2. Realism (Individual Cooldowns)

- ✅ **Each shadow unique** - Different attack rates
- ✅ **Cooldowns respected** - Shadows attack when ready
- ✅ **Variance applied** - Each attack has randomness

### 3. Balance

- ✅ **Best of both worlds** - Performance + Realism
- ✅ **No compromise** - Individual timing preserved
- ✅ **Efficient** - Batch processing reduces overhead

---

## 🎯 Key Insight

**The system uses a "fixed trigger, individual calculation" approach:**

1. **Fixed interval** triggers batch processing (performance)
2. **Within batch**, each shadow's individual cooldown is calculated (realism)
3. **Time tracking** ensures no attacks are missed (accuracy)
4. **Variance** applied per attack (realistic combat)

**Result**:

- ✅ **Fixed interval** = Performance (one timer)
- ✅ **Individual cooldowns** = Realism (each shadow unique)
- ✅ **Batch calculation** = Efficiency (process all at once)

---

## 📊 Comparison Table

| Aspect                | Fixed Interval  | Individual Cooldowns | Batch System         |
| --------------------- | --------------- | -------------------- | -------------------- |
| **Timer Count**       | 1 per dungeon   | 1 per shadow         | ✅ 1 per dungeon     |
| **CPU Usage**         | Low             | Very High            | ✅ Low               |
| **Individual Timing** | ❌ Same for all | ✅ Unique per shadow | ✅ Unique per shadow |
| **Realism**           | ❌ Unrealistic  | ✅ Perfect           | ✅ Perfect           |
| **Performance**       | ✅ Perfect      | ❌ Severe lag        | ✅ Perfect           |

**Batch System = Best of Both Worlds!** 🎯

---

## 🎉 Conclusion

**The batch system perfectly balances both:**

1. **Fixed Interval (Performance)**:

   - One timer per dungeon
   - Runs at fixed intervals (3s active, 15-20s background)
   - Minimal CPU overhead

2. **Individual Cooldowns (Realism)**:
   - Each shadow has unique cooldown
   - Attacks calculated based on individual timing
   - Time since last attack tracked per shadow

**How it works**:

- Fixed interval **triggers** batch processing
- Within batch, **individual cooldowns** determine attack timing
- **Time tracking** ensures accuracy
- **Variance** adds realism

**Result**: Performance + Realism = Optimal System! 🚀
