# Dungeons Plugin - Spawn & Allocation Fixes

## 🎯 Issues to Fix

### 1. **Mob Spawning** ❌ → ✅
**Problem**: Spawn frequency causes lag spikes, doesn't stabilize smoothly
**Fix**: 
- Remove hard caps, use soft scaling
- Much slower spawn frequency (every 10s instead of 5s)
- Gradual increase over time (very slowly)
- Stabilizes naturally around 2500-3000 mobs

### 2. **Mob Cleanup** ❌ → ✅
**Problem**: Dead mobs pile up even when not participating
**Fix**: 
- Immediate cleanup of dead mobs if user NOT participating in dungeon
- Only keep dead mobs if user is actively extracting
- Free up memory for inactive dungeons

### 3. **Mana Consumption** ❌ → ✅
**Problem**: Shadow resurrection may not consume mana correctly
**Fix**: 
- Verify mana cost calculation
- Ensure Stats plugin is called for mana consumption
- Show mana consumption in UI

### 4. **Shadow Allocation** ❌ → ✅
**Problem**: Can't allocate shadows mid-fight or across multiple dungeons
**Fix**: 
- Allow shadow re-allocation anytime
- Shadows can be split across multiple dungeons
- Update shadow assignments without restarting combat

---

## 📊 Current vs Fixed Spawn System

### Current System (Causes Lag):
```javascript
// Spawns every 5 seconds (mobSpawnInterval: 5000)
if (aliveMobs < 1000) baseSpawnCount = 1000; // 800-1200 per wave
else if (aliveMobs < 2000) baseSpawnCount = 500; // 400-600 per wave  
else if (aliveMobs < 2500) baseSpawnCount = 250; // 200-300 per wave
else baseSpawnCount = 100; // 80-120 per wave

// PROBLEMS:
// ❌ Spawns too frequently (every 5s)
// ❌ Sudden jumps (1000 → 500 → 250 → 100)
// ❌ Doesn't slow down gradually
// ❌ Can cause lag spikes with 1000 mob bursts
```

### Fixed System (Smooth & Stable):
```javascript
// Spawns every 10 seconds (mobSpawnInterval: 10000) - 50% less frequent!
// Gradual scaling with smooth transitions

if (aliveMobs < 500) baseSpawnCount = 400; // 320-480 (slow start)
else if (aliveMobs < 1000) baseSpawnCount = 300; // 240-360
else if (aliveMobs < 1500) baseSpawnCount = 200; // 160-240
else if (aliveMobs < 2000) baseSpawnCount = 150; // 120-180
else if (aliveMobs < 2500) baseSpawnCount = 100; // 80-120
else if (aliveMobs < 3000) baseSpawnCount = 50; // 40-60 (very slow)
else baseSpawnCount = 20; // 16-24 (minimal maintenance)

// IMPROVEMENTS:
// ✅ Spawns 50% less frequently (10s vs 5s)
// ✅ Smaller spawn batches (400 max vs 1000 max)
// ✅ Gradual slowdown (7 tiers vs 4 tiers)
// ✅ Very slow increase at high counts
// ✅ Natural stabilization around 2500-3000
// ✅ No lag spikes from massive spawns
```

**Result**: 
- **80% less spawning load** (400 mobs/10s = 40/s vs 1000 mobs/5s = 200/s)
- **Smoother progression** (7 gradual tiers)
- **Natural cap** (stabilizes at 2500-3000 without hard limits)

---

## 🧹 Mob Cleanup System

### Current System:
```javascript
// Only cleans up if user NOT participating
if (!dungeon.userParticipating) {
  dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter(m => m.hp > 0);
}

// PROBLEM: Works correctly BUT could be more aggressive
```

### Fixed System:
```javascript
// Immediate cleanup for inactive dungeons
if (!dungeon.userParticipating) {
  // Remove ALL dead mobs immediately (no waiting)
  dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.filter(m => m.hp > 0);
  
  // Also trim to reasonable size if shadows killed a lot
  if (dungeon.mobs.activeMobs.length > 3000) {
    dungeon.mobs.activeMobs = dungeon.mobs.activeMobs.slice(-2500);
  }
}

// IMPROVEMENTS:
// ✅ Immediate cleanup (no delay)
// ✅ Aggressive trimming for inactive dungeons
// ✅ Frees memory faster
// ✅ Prevents inactive dungeon bloat
```

---

## 💙 Mana Consumption System

### What Needs Verification:
```javascript
// Shadow resurrection should:
// 1. Calculate mana cost based on shadow rank
// 2. Call Stats plugin to consume mana
// 3. Show mana cost in notifications
// 4. Prevent resurrection if insufficient mana

// Mana Cost Formula (exponential):
// E rank: 10 mana
// D rank: 20 mana
// C rank: 40 mana
// B rank: 80 mana
// A rank: 160 mana
// S rank: 320 mana
// SS rank: 640 mana
// SSS rank: 1280 mana
```

### Fixed Resurrection System:
```javascript
async resurrectShadow(channelKey, shadowId) {
  // 1. Calculate mana cost
  const shadow = getShadow(shadowId);
  const rankIndex = RANKS.indexOf(shadow.rank);
  const manaCost = Math.pow(2, rankIndex) * 10; // Exponential: 10, 20, 40, 80...
  
  // 2. Check if user has enough mana
  const currentMana = this.soloLevelingStats?.settings?.mana || 0;
  if (currentMana < manaCost) {
    this.toasts?.showToast(
      `❌ Insufficient Mana`,
      `Need ${manaCost} mana to resurrect ${shadow.name} (${shadow.rank})`,
      'error'
    );
    return false;
  }
  
  // 3. Consume mana from Stats plugin
  if (this.soloLevelingStats?.consumeMana) {
    this.soloLevelingStats.consumeMana(manaCost);
  }
  
  // 4. Resurrect shadow
  dungeon.shadowHP[shadowId] = {
    hp: shadow.vitality * 10,
    maxHp: shadow.vitality * 10
  };
  
  // 5. Remove from dead list
  deadShadows.delete(shadowId);
  
  // 6. Show notification
  this.toasts?.showToast(
    `✨ Shadow Resurrected`,
    `${shadow.name} (${shadow.rank}) returned! -${manaCost} mana`,
    'success'
  );
  
  return true;
}
```

---

## ⚔️ Shadow Allocation System

### Current Problem:
- Shadows may only be assignable at dungeon start
- Can't reallocate mid-fight
- Can't split across multiple dungeons easily

### Fixed Allocation:
```javascript
// Allow dynamic shadow allocation
async reallocateShadows(fromChannelKey, toChannelKey, shadowIds) {
  const fromDungeon = this.activeDungeons.get(fromChannelKey);
  const toDungeon = this.activeDungeons.get(toChannelKey);
  
  if (!fromDungeon || !toDungeon) return false;
  
  // Remove from source dungeon
  if (!fromDungeon.assignedShadowIds) fromDungeon.assignedShadowIds = [];
  fromDungeon.assignedShadowIds = fromDungeon.assignedShadowIds.filter(
    id => !shadowIds.includes(id)
  );
  
  // Add to target dungeon
  if (!toDungeon.assignedShadowIds) toDungeon.assignedShadowIds = [];
  toDungeon.assignedShadowIds.push(...shadowIds);
  
  // Initialize shadow HP in target dungeon
  for (const shadowId of shadowIds) {
    const shadow = await this.getShadow(shadowId);
    if (shadow) {
      toDungeon.shadowHP[shadowId] = {
        hp: shadow.vitality * 10,
        maxHp: shadow.vitality * 10
      };
      
      // Initialize combat data
      toDungeon.shadowCombatData[shadowId] = {
        lastAttackTime: 0,
        cooldown: 1000 + Math.random() * 1000, // 1-2s
        targetPreference: Math.random() > 0.3 ? 'mobs' : 'boss' // 70% mobs, 30% boss
      };
    }
  }
  
  // Save both dungeons
  await this.storageManager?.saveDungeon(fromDungeon);
  await this.storageManager?.saveDungeon(toDungeon);
  
  return true;
}

// Shadow UI button for reallocation
createReallocationUI() {
  // Shows list of active dungeons
  // Allows dragging shadows between dungeons
  // Updates in real-time
}
```

---

## 📋 Implementation Checklist

### Spawn System:
- [ ] Change `mobSpawnInterval` from 5000 to 10000
- [ ] Update spawn thresholds (7 tiers instead of 4)
- [ ] Reduce max spawn count (400 vs 1000)
- [ ] Add gradual scaling

### Cleanup System:
- [ ] Verify `userParticipating` check works
- [ ] Add aggressive trimming for inactive dungeons
- [ ] Ensure immediate cleanup

### Mana System:
- [ ] Implement resurrection mana cost calculation
- [ ] Add Stats plugin mana consumption call
- [ ] Add mana check before resurrection
- [ ] Show mana cost in notifications

### Allocation System:
- [ ] Implement `reallocateShadows()` function
- [ ] Add shadow list tracking per dungeon
- [ ] Allow mid-fight reallocation
- [ ] Create UI for shadow management

---

## 🎯 Expected Results

**After Fixes**:
- ✅ Smooth, gradual mob spawning (no lag spikes)
- ✅ Natural stabilization around 2500-3000 mobs
- ✅ Immediate cleanup of inactive dungeon mobs
- ✅ Correct mana consumption for resurrections
- ✅ Flexible shadow allocation across dungeons
- ✅ Better performance (80% less spawn load)

**Performance Impact**:
- **Spawn rate**: 200 mobs/s → 40 mobs/s (80% reduction)
- **Lag spikes**: Eliminated (smaller batches)
- **Memory usage**: Reduced (aggressive cleanup)
- **Stability**: Improved (gradual scaling)

---

## 🚀 Next Steps

1. Apply spawn frequency fixes
2. Verify mob cleanup system
3. Implement mana consumption
4. Add shadow reallocation
5. Test with multiple dungeons
6. Verify performance improvements
