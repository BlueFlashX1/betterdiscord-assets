# Dungeon Combat System Architecture Analysis

## System Overview

The dungeon combat system operates on **3 independent interval-based subsystems** that run simultaneously with different timing characteristics:

1. **Shadow Attacks** (Offensive - Chaotic Individual Timing)
2. **Boss Attacks** (Defensive - AOE with Target Multiplier)
3. **Mob Attacks** (Defensive - Individual Mob Timing)

---

## Combat Intervals & Batch Processing

### 1. Shadow Attack System 👥⚔️

**Interval Configuration:**
```javascript
// Active dungeon (user participating):  3 seconds
// Background dungeon (watching only):   15-20 seconds (randomized)

startShadowAttacks(channelKey) {
  const activeInterval = 3000;
  const backgroundInterval = 15000 + Math.random() * 5000; // 15-20s
  const intervalTime = isActiveDungeon ? activeInterval : backgroundInterval;
  
  setInterval(async () => {
    // Calculate cycles to process
    const cyclesToProcess = currentIsActive ? 1 : Math.max(1, Math.floor(elapsed / activeInterval));
    await this.processShadowAttacks(channelKey, cyclesToProcess);
  }, intervalTime);
}
```

**Key Features:**
- **Individual Shadow Cooldowns**: Each shadow has its own attack timing
- **Chaotic Behavior**: 3 behavior patterns (aggressive, balanced, tactical)
- **Target Priority**: 70% attack mobs, 30% attack boss (random per attack)
- **Batch Processing**: Background dungeons process multiple cycles at once

**Individual Shadow Combat Data:**
```javascript
shadowCombatData[shadowId] = {
  lastAttackTime: Date.now() - Math.random() * cooldown,  // Staggered starts
  cooldown: 800-3500ms,  // Varies by behavior
  behavior: 'aggressive' | 'balanced' | 'tactical',
  attackCount: 0,
  damageDealt: 0
}

// Cooldown ranges by behavior:
- aggressive: 800-1500ms   (fast, reckless)
- balanced:   1500-2500ms  (standard)
- tactical:   2000-3500ms  (slower, strategic)
```

**Attack Processing Flow:**
```
For each shadow in batch:
  1. Check if alive (not in deadShadows, HP > 0)
  2. Check individual cooldown (different per shadow!)
  3. Calculate attacks in time span (based on shadow's cooldown)
  4. For each attack:
     a. Roll target: 70% mob, 30% boss
     b. Calculate base damage
     c. Apply variance (±20%)
     d. Apply behavior multiplier (aggressive 1.3x, balanced 1.0x, tactical 0.85x)
  5. Accumulate damage (batch processing)
  6. Apply all damage at end
  7. Update shadow's last attack time with variance
  8. Vary cooldown for next batch (±10%)
```

**Damage Modifiers:**
- **Variance**: ±20% per attack (80-120%)
- **Behavior**: Aggressive +30%, Tactical -15%
- **Role Bonuses**: Assassin +30%, Mage +20%, Tank -20%

---

### 2. Boss Attack System 👹💥

**Interval Configuration:**
```javascript
// Active dungeon:  1 second
// Background:      15-20 seconds (randomized)

startBossAttacks(channelKey) {
  const activeInterval = 1000;
  const backgroundInterval = 15000 + Math.random() * 5000;
  const intervalTime = isActiveDungeon ? activeInterval : backgroundInterval;
  
  setInterval(async () => {
    const cyclesToProcess = currentIsActive ? 1 : Math.max(1, Math.floor(elapsed / activeInterval));
    await this.processBossAttacks(channelKey, cyclesToProcess);
  }, intervalTime);
}
```

**Key Features:**
- **AOE Attacks**: Boss can hit multiple shadows per attack
- **Rank Scaling**: Higher rank bosses hit more targets
- **Priority System**: Attacks shadows first, user only when all shadows dead
- **Damage Nerfed**: 60% reduction (0.4x multiplier)

**Target Multipliers by Rank:**
```javascript
const rankMultipliers = { 
  E: 1,  // Hits 1 shadow per attack
  D: 2,  // Hits 2 shadows per attack
  C: 3, 
  B: 5, 
  A: 8, 
  S: 12  // Hits 12 shadows per attack!
};
```

**Attack Processing Flow:**
```
For each attack in time span:
  1. Check if shadows alive
  2. IF shadows alive:
     a. Calculate AOE targets (1-12 based on boss rank)
     b. Randomly shuffle shadow list
     c. Select top N shadows as targets
     d. For each target shadow:
        - Calculate base damage
        - NERF: 60% reduction (bossDamage *= 0.4)
        - Apply variance (±25%, range 75-125%)
        - Accumulate damage
  3. ELSE IF no shadows (all dead):
     a. Attack user instead
     b. Apply damage reduction (50%)
  4. Apply all accumulated damage
  5. Check for shadow deaths
  6. Attempt auto-resurrection with mana cost
```

**Boss Stats:**
```javascript
boss: {
  attackCooldown: 4000,  // Boss attacks every 4 seconds (base)
  rank: 'E'-'Shadow Monarch',
  strength, agility, intelligence, vitality,
  maxTargetsPerAttack: 1-12 (rank-based)
}
```

---

### 3. Mob Attack System 🐺🗡️

**Interval Configuration:**
```javascript
// Active dungeon:  1 second
// Background:      15-20 seconds (randomized)

startMobAttacks(channelKey) {
  const activeInterval = 1000;
  const backgroundInterval = 15000 + Math.random() * 5000;
  const intervalTime = isActiveDungeon ? activeInterval : backgroundInterval;
  
  setInterval(async () => {
    const cyclesToProcess = currentIsActive ? 1 : Math.max(1, Math.floor(elapsed / activeInterval));
    await this.processMobAttacks(channelKey, cyclesToProcess);
  }, intervalTime);
}
```

**Key Features:**
- **Individual Mob Cooldowns**: Each mob has its own attack timing
- **Priority System**: Mobs attack shadows first, user only when all dead
- **Random Targeting**: Each mob picks random shadow
- **Damage Nerfed**: 70% reduction (0.3x multiplier)

**Mob Attack Cooldowns:**
```javascript
mob.attackCooldown = 2000 + Math.random() * 2000;  // 2-4 seconds per mob
```

**Attack Processing Flow:**
```
For each mob in dungeon:
  1. Check mob is alive (hp > 0)
  2. Calculate attacks in time span (based on mob's cooldown)
  3. Apply mob stat variance (±10%)
  4. For each attack:
     a. Check if shadows alive
     b. IF shadows alive:
        - Pick random shadow as target
        - Calculate base damage
        - NERF: 70% reduction (mobDamage *= 0.3)
        - Apply variance (±20%)
        - Accumulate damage
     c. ELSE IF no shadows:
        - Attack user instead
        - Apply damage reduction (60%)
  5. Apply accumulated damage to shadows
  6. Check for shadow deaths
  7. Attempt auto-resurrection
  8. Update mob's last attack time
```

---

## Combat Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    DUNGEON COMBAT SYSTEM                    │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  SHADOW ATTACKS  │         │  BOSS ATTACKS    │         │   MOB ATTACKS    │
│   (3s interval)  │         │  (1s interval)   │         │  (1s interval)   │
└─────────┬────────┘         └─────────┬────────┘         └─────────┬────────┘
          │                            │                            │
          │ Every 3s                   │ Every 1s                   │ Every 1s
          ├────────────────────────────┼────────────────────────────┤
          │                            │                            │
          ▼                            ▼                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│           BATCH PROCESSING (processes N cycles at once)             │
│  cyclesToProcess = 1 (active) or elapsed/interval (background)     │
└─────────────────────────────────────────────────────────────────────┘
          │                            │                            │
          ▼                            ▼                            ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ Each shadow has  │         │ Boss has single  │         │ Each mob has     │
│ INDIVIDUAL       │         │ global cooldown  │         │ INDIVIDUAL       │
│ cooldown         │         │ (4s base)        │         │ cooldown         │
│ (800-3500ms)     │         │                  │         │ (2-4s)           │
└──────────────────┘         └──────────────────┘         └──────────────────┘
          │                            │                            │
          ▼                            ▼                            ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ CHAOTIC TIMING:  │         │ AOE ATTACKS:     │         │ RANDOM TARGETS:  │
│ Each shadow      │         │ 1-12 shadows     │         │ Pick random      │
│ attacks at its   │         │ hit per attack   │         │ shadow each time │
│ own pace         │         │ (rank-based)     │         │                  │
└──────────────────┘         └──────────────────┘         └──────────────────┘
          │                            │                            │
          ▼                            ▼                            ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ TARGET PRIORITY: │         │ PRIORITY SYSTEM: │         │ PRIORITY SYSTEM: │
│ 70% mobs         │         │ 1. Shadows first │         │ 1. Shadows first │
│ 30% boss         │         │ 2. User if all   │         │ 2. User if all   │
│ (random each!)   │         │    shadows dead  │         │    shadows dead  │
└──────────────────┘         └──────────────────┘         └──────────────────┘
          │                            │                            │
          └────────────────────────────┴────────────────────────────┘
                                       │
                                       ▼
                          ┌──────────────────────────┐
                          │   DAMAGE ACCUMULATION    │
                          │   (Map-based batching)   │
                          └──────────────┬───────────┘
                                         │
                                         ▼
                          ┌──────────────────────────┐
                          │    APPLY ALL DAMAGE      │
                          │  (after batch complete)  │
                          └──────────────┬───────────┘
                                         │
                                         ▼
                          ┌──────────────────────────┐
                          │   CHECK FOR DEATHS       │
                          │ (shadows, mobs, boss)    │
                          └──────────────┬───────────┘
                                         │
                                         ▼
                          ┌──────────────────────────┐
                          │  AUTO-RESURRECTION       │
                          │   (shadows only)         │
                          └──────────────────────────┘
```

---

## Shadow Allocation Strategy

**Pre-Split System (Cached for Performance):**

```javascript
preSplitShadowArmy() {
  // Cache TTL: 1 minute
  // Recalculates only when cache expires or dungeons change
  
  // Weight system:
  const weight = dungeonRankIndex + 1;  // E=1, D=2, ... S=6, etc.
  
  // Shadow distribution:
  const shadowPortion = (dungeonWeight / totalWeight) * totalShadows;
  
  // Rank filtering:
  // Shadows within ±2 ranks of dungeon rank
  // Example: B-rank dungeon gets C, B, A rank shadows
}
```

**Example Distribution:**
```
Total Shadows: 100
Active Dungeons: 3

Dungeon 1 [B-rank]: weight = 4
Dungeon 2 [A-rank]: weight = 5
Dungeon 3 [S-rank]: weight = 6
Total weight = 15

Distribution:
- B-rank dungeon: (4/15) * 100 = 26 shadows
- A-rank dungeon: (5/15) * 100 = 33 shadows
- S-rank dungeon: (6/15) * 100 = 40 shadows
```

---

## Timing Breakdown

### Active Dungeon (User Participating):
```
Shadow Attacks:  Every 3 seconds
Boss Attacks:    Every 1 second
Mob Attacks:     Every 1 second
HP Bar Updates:  Every 250ms (throttled)
Extraction:      10ms delay (batches of 20)
Mob Spawning:    3-7 seconds (variable)
```

### Background Dungeon (Watching Only):
```
Shadow Attacks:  Every 15-20 seconds (processes 5-6 cycles at once)
Boss Attacks:    Every 15-20 seconds (processes 15-20 cycles at once)
Mob Attacks:     Every 15-20 seconds (processes 15-20 cycles at once)
HP Bar Updates:  Never (not visible)
Extraction:      Still works if user was participating
Mob Spawning:    3-7 seconds (same as active)
```

**Why Different Intervals?**
- Active dungeons need real-time feedback (smooth UI)
- Background dungeons batch process to save CPU
- Shadows attack all dungeons simultaneously (multi-tasking)

---

## Damage Calculations

### Base Damage Formula:
```javascript
calculateDamage(attackerStats, defenderStats, attackerRank, defenderRank) {
  // Physical damage
  let damage = 15 + attackerStrength * 3;
  
  // Magic damage
  damage += attackerIntelligence * 2;
  
  // Rank multiplier
  if (attackerRankIndex > defenderRankIndex) {
    damage *= 1 + rankDiff * 0.3;  // +30% per rank above
  } else if (attackerRankIndex < defenderRankIndex) {
    damage *= Math.max(0.4, 1 + rankDiff * 0.2);  // -20% per rank below, min 40%
  }
  
  // Critical hit chance (from agility)
  const critChance = Math.min(40, attackerAgility * 0.3);  // Max 40%
  if (Math.random() * 100 < critChance) {
    damage *= 2.5;  // 2.5x critical multiplier!
  }
  
  // Defense reduction
  const defense = defenderStrength * 0.25 + defenderVitality * 0.15;
  const defenseReduction = Math.min(0.7, defense / (defense + 100));  // Max 70%
  damage *= (1 - defenseReduction);
  
  return Math.max(1, Math.floor(damage));
}
```

### Damage Nerfs (Balance):
```javascript
// Shadow attacks: NO NERF (full damage)
shadowDamage = calculateDamage(...);

// Boss attacks shadows: 60% NERF
bossDamage = calculateDamage(...) * 0.4;

// Mob attacks shadows: 70% NERF  
mobDamage = calculateDamage(...) * 0.3;

// Boss attacks user: 50% NERF (if all shadows dead)
userDamage = calculateDamage(...) * 0.5;

// Mob attacks user: 60% NERF (if all shadows dead)
userDamage = calculateDamage(...) * 0.4;
```

---

## Combat Behavior Patterns

### Shadow Behaviors (Random Assignment):

**1. Aggressive (33% chance)**
```javascript
{
  cooldown: 800-1500ms,    // Fast attacks
  damage: 1.3x,            // 30% bonus damage
  playstyle: "High risk, high reward"
}
```

**2. Balanced (33% chance)**
```javascript
{
  cooldown: 1500-2500ms,   // Standard attacks
  damage: 1.0x,            // Normal damage
  playstyle: "Reliable and consistent"
}
```

**3. Tactical (33% chance)**
```javascript
{
  cooldown: 2000-3500ms,   // Slower attacks
  damage: 0.85x,           // 15% less damage
  playstyle: "Strategic, survivability-focused"
}
```

**Why Behaviors Matter:**
- Creates diverse shadow army dynamics
- Some shadows attack fast, others slow
- Prevents synchronized, predictable combat
- More realistic, chaotic battles

---

## Target Selection Logic

### Shadow Target Selection (70/30 Split):
```javascript
if (bossAlive && mobsAlive) {
  const targetRoll = Math.random();
  if (targetRoll < 0.7) {
    target = randomMob;    // 70% chance
  } else {
    target = boss;         // 30% chance
  }
} else if (bossAlive) {
  target = boss;           // Only boss left
} else if (mobsAlive) {
  target = randomMob;      // Only mobs left
}
```

**Rationale:**
- Mobs are numerous, need clearing first
- Boss is tough, some shadows should chip away at it
- Creates realistic multi-front combat

### Boss/Mob Target Selection (Shadows First):
```javascript
// PRIORITY SYSTEM: Always attack shadows first
if (aliveShadows.length > 0) {
  target = randomShadow;      // Shadow army shields user
} else if (userParticipating) {
  target = user;              // User takes damage when exposed
}
```

**Rationale:**
- Shadow army acts as shield/tank
- User is protected as long as shadows alive
- Realistic Solo Leveling lore (shadows protect monarch)

---

## Batch Processing System

### Why Batch Processing?

**Problem**: Processing thousands of individual attacks every second = CPU overload

**Solution**: Batch multiple attacks together, calculate once

### Background Dungeon Example:

**Without Batching (❌):**
```
Run interval every 3s
  Process 1 attack cycle
  Wait 3s
  Process 1 attack cycle
  Wait 3s
  ... (always playing catch-up)
```

**With Batching (✅):**
```
Run interval every 15-20s
  Calculate elapsed time: 18s
  Cycles to process: 18s / 3s = 6 cycles
  Process ALL 6 cycles worth of attacks in ONE calculation
  Update state once
  Wait 15-20s
  ... (caught up, efficient)
```

### Batch Processing Math:
```javascript
// Active dungeon
cyclesToProcess = 1;  // Always real-time

// Background dungeon
const elapsed = now - lastProcessingTime;
cyclesToProcess = Math.max(1, Math.floor(elapsed / activeInterval));

// Example: If 18s passed and activeInterval is 3s
// cyclesToProcess = Math.floor(18000 / 3000) = 6 cycles

// Each shadow attack calculated 6 times worth in one batch
attacksInSpan = Math.floor((totalTimeSpan - timeSinceLastAttack) / cooldown);
```

---

## Memory Optimization

### Shadow HP Tracking:
```javascript
dungeon.shadowHP = {
  'shadow_123': { hp: 1250, maxHp: 1500 },
  'shadow_456': { hp: 2100, maxHp: 2100 },
  // ... one entry per shadow
}

// Stored as Object (not Map) for IndexedDB serialization
```

### Dead Shadow Tracking:
```javascript
this.deadShadows.set(channelKey, new Set(['shadow_123', 'shadow_789']));

// Set provides O(1) lookup for death checks
// Separate from shadowHP for performance
```

### Mob Array Capping:
```javascript
// AGGRESSIVE MEMORY OPTIMIZATION
if (dungeon.mobs.activeMobs.length > 3000) {
  dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.slice(500);
  // Remove oldest 500, keeping 2500
  // Creates headroom for new spawns
}

// Processing cap: Max 3000 mobs per cycle
const aliveMobs = dungeon.mobs.activeMobs
  .filter(m => m.hp > 0)
  .slice(0, 3000);  // Process first 3000 only
```

---

## Extraction System Integration

### Automatic Dungeon-Only Extraction:

**When Shadows Kill Mobs:**
```javascript
if (mob.hp <= 0) {
  dungeon.mobs.killed += 1;
  
  // Track shadow contribution for XP
  dungeon.shadowContributions[shadowId].mobsKilled += 1;
  
  // IMMEDIATE EXTRACTION (if user participating)
  if (dungeon.userParticipating) {
    this.extractImmediately(channelKey, mob);  // 10ms batch delay
  }
}
```

**Extraction Processing:**
```javascript
extractImmediately(channelKey, mob) {
  // Add to immediate batch
  batch.push(mob);
  
  // Process after 10ms (allows batch accumulation)
  setTimeout(() => {
    this.processImmediateBatch(channelKey);  // Batch of 20 mobs
  }, 10);
}

processImmediateBatch(channelKey) {
  // Process in chunks of 20 (parallel)
  for (let i = 0; i < batch.length; i += 20) {
    const chunk = batch.slice(i, i + 20);
    
    // Process all 20 in parallel
    await Promise.all(chunk.map(async (mob) => {
      await this.attemptMobExtraction(channelKey, mob);
    }));
    
    // AGGRESSIVE CLEANUP: Remove immediately (success or failure)
    dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter(
      m => !processedMobIds.has(m.id)
    );
  }
}
```

**Boss Extraction (ARISE):**
- Separate from automatic extraction
- 3 attempts per corpse per day
- Manual trigger via ARISE button
- Special animation (full-screen)

---

## Auto-Resurrection System

**Triggered When Shadow Dies:**
```javascript
if (oldHP > 0 && shadowHP.hp <= 0) {
  const resurrected = await this.attemptAutoResurrection(shadow, channelKey);
  if (resurrected) {
    shadowHP.hp = shadowHP.maxHp;  // Full HP restore
  } else {
    deadShadows.add(shadowId);     // Permanently dead (not enough mana)
  }
}
```

**Mana Cost by Rank (Exponential):**
```javascript
const rankCosts = {
  E: 6,
  D: 12,
  C: 24,
  B: 48,
  A: 96,
  S: 192,
  SS: 384,
  SSS: 768,
  'SSS+': 1536,
  NH: 3072,
  Monarch: 6144,
  'Monarch+': 12288,
  'Shadow Monarch': 24576
};
```

---

## Performance Characteristics

### CPU Usage (per dungeon):
```
Active Dungeon:
- Shadow processing: Every 3s (1 cycle)
- Boss processing:   Every 1s (1 cycle)
- Mob processing:    Every 1s (1 cycle)
Total: ~3 calculations per 3 seconds

Background Dungeon:
- Shadow processing: Every 15-20s (5-6 cycles batched)
- Boss processing:   Every 15-20s (15-20 cycles batched)
- Mob processing:    Every 15-20s (15-20 cycles batched)
Total: ~1 calculation per 15-20 seconds (CPU savings!)
```

### Memory Footprint (per dungeon):
```
Shadow HP tracking:     ~100 bytes per shadow
Mob tracking:           ~200 bytes per mob (capped at 3000)
Shadow combat data:     ~150 bytes per shadow
Extraction queue:       ~250 bytes per queued mob (capped at 500)
Immediate batch:        ~250 bytes per mob (cleared after 10ms)

Total per active dungeon: ~1-2 MB (with 100 shadows, 3000 mobs)
```

---

## Key Design Patterns

### 1. **Chaotic Combat** (Shadows)
- Individual cooldowns per shadow
- Random behavior patterns
- Staggered attack timing
- Creates organic, unpredictable battles

### 2. **Synchronized Combat** (Bosses)
- Single global cooldown
- AOE attacks (multiple targets)
- Predictable timing
- Creates powerful, threatening presence

### 3. **Swarm Combat** (Mobs)
- Individual cooldowns per mob
- Random targeting
- Weak individually, strong in numbers
- Creates overwhelming horde feel

### 4. **Priority System** (All)
- Shadows shield user from damage
- Enemies always attack shadows first
- User only takes damage when exposed
- Realistic tank/DPS dynamics

### 5. **Batch Processing** (Performance)
- Background dungeons process multiple cycles
- Active dungeons process real-time
- All damage accumulated, applied once
- CPU-efficient multi-dungeon support

---

## Summary

**The combat system is a sophisticated multi-threaded architecture where:**

1. **Shadows** operate with chaotic individual timing (800-3500ms cooldowns)
2. **Boss** operates with synchronized AOE timing (4s cooldown, 1-12 targets)
3. **Mobs** operate with individual swarm timing (2-4s cooldowns)
4. All three systems run **independently** with different intervals
5. **Batch processing** enables efficient background dungeon calculations
6. **Damage accumulation** prevents partial state updates
7. **Priority systems** ensure shadows tank for user
8. **Auto-resurrection** brings back fallen shadows with mana cost
9. **Extraction** happens automatically on mob death (dungeon-only)

This creates **realistic, dynamic, multi-front combat** that scales efficiently across multiple dungeons!
