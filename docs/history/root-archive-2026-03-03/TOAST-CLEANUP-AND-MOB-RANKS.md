# Toast Notifications Cleanup & Mob Rank System

## ✅ Toast Notifications - Essential Info Only

### Changes Made:

#### 1. **Dungeon Completion Summary** (Simplified)
**Before**:
```
Dungeon [A-rank] CLEARED!
Killed: 6,234 mobs
Extracted: 234 shadows  ← REMOVED (no extraction spam)
You: +1,200 XP | Shadows: +45,000 XP

=== BATCH 2 (750ms delay) ===
Damage Analytics             ← REMOVED (useless info)
Boss Damage: 1,547,289       ← REMOVED
Mob Damage: 2,341,023        ← REMOVED
Total Damage: 3,888,312      ← REMOVED

=== BATCH 3 (1000ms delay) ===
Level-Ups (47 shadows)
  Beru [A]: Lv 12 -> 15
  Igris [S]: Lv 8 -> 11
  ...and 45 more!
```

**After** (Essential only):
```
Dungeon [A-rank] CLEARED!
Killed: 6,234 mobs
You: +1,200 XP | Shadows: +45,000 XP

=== 750ms delay (only if 3+ level-ups) ===
47 shadows leveled up!
```

**Result**:
- ✅ No damage statistics (useless clutter)
- ✅ No extraction count (no spam)
- ✅ Simplified level-up notification
- ✅ Single essential toast + optional level-up summary

---

#### 2. **Mob Kill Notifications** (Removed)
**Before**:
```
Killed 50 mobs in Dungeon [A-rank]  ← Every 50 kills!
Killed 100 mobs in Dungeon [A-rank] ← Spam!
Killed 150 mobs in Dungeon [A-rank] ← Spam!
```

**After**:
```
(Silent - no notifications)
Total shown in completion summary only
```

---

#### 3. **Mob Extraction Notifications** (Removed)
**Before**:
```
🌟 25 shadows extracted from mobs!   ← Milestone spam
🌟 50 shadows extracted from mobs!   ← Milestone spam
🌟 100 shadows extracted from mobs!  ← Milestone spam
```

**After**:
```
(Silent - no notifications)
ARISE animation shows visually (no text spam)
Total NOT shown (no extraction spam at all)
```

---

#### 4. **Shadow Death Notifications** (Simplified)
**Before**:
```
Only 5 shadows left!  ← Spam
Only 4 shadows left!  ← Spam
Only 3 shadows left!  ← Spam
Only 2 shadows left!  ← Spam
Only 1 shadow left!   ← Spam
ALL shadows defeated! You're next!
```

**After**:
```
(Silent until critical)
ALL shadows defeated! You're next!  ← Only when critical
```

---

#### 5. **Boss Extraction** (Simplified)
**Before**:
```
ARISE! Shadow "Igris" extracted! (2 attempts remaining)
```

**After**:
```
ARISE! "Igris" extracted!
```

---

#### 6. **Failed Extraction** (Simplified)
**Before**:
```
Extraction failed. (2 attempts remaining)
```

**After**:
```
Extraction failed. (2 left)
```

---

#### 7. **Joining Dungeons** (Simplified)
**Before**:
```
Already in Cavern [A-rank]!
You must complete, be defeated, or leave your current dungeon first.
```

**After**:
```
Already in Cavern [A-rank]! Complete it first.
```

---

#### 8. **Defeat Messages** (Simplified)
**Before**:
```
Shadow armies have been defeated. Rejoin the dungeon when you have HP to continue.
```

**After**:
```
All shadows defeated. Rejoin when HP regenerates.
```

---

#### 9. **Boss Attack** (Simplified)
**Before**:
```
Boss attacked you for 234 damage! (No shadows to protect you)
```

**After**:
```
Boss attacked you for 234 damage!
```

---

#### 10. **Low Mana** (Simplified)
**Before**:
```
Low mana! 15 shadows couldn't be resurrected.
Mana: 234/1,200 (19%)
```

**After**:
```
Low mana! 15 shadows couldn't be resurrected.
```

---

## 🎯 MOB RANK SYSTEM - Dungeon-Relative

### How It Works:

**Mob Spawn Rank** (Line 1856-1863):
```javascript
// Mob rank: dungeon rank ± 1 (can be weaker, same, or stronger)
const rankVariation = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
const mobRankIndex = Math.max(
  0,
  Math.min(dungeonRanks.length - 1, dungeonRankIndex + rankVariation)
);
const mobRank = dungeonRanks[mobRankIndex];
```

**Examples**:

| Dungeon Rank | Mob Spawn Ranks |
|--------------|-----------------|
| **E-rank** | E (same), D (+1) |
| **D-rank** | E (-1), D (same), C (+1) |
| **C-rank** | D (-1), C (same), B (+1) |
| **B-rank** | C (-1), B (same), A (+1) |
| **A-rank** | B (-1), A (same), S (+1) |
| **S-rank** | A (-1), S (same), SS (+1) |

**Extraction Rank** (Line 3670-3679):
```javascript
// Extraction uses mob's actual rank (which is already dungeon ±1)
const result = await this.shadowArmy.attemptDungeonExtraction(
  mobId,
  userRank,      // User's rank
  userLevel,     // User's level
  userStats,     // User's stats
  mobRank,       // ← MOB'S ACTUAL RANK (dungeon ±1)
  mobStats,      // Mob's stats
  mobStrength,   // Mob's strength
  beastFamilies  // Biome families
);
```

**Result**:
- ✅ Mob **spawn** rank: Dungeon ±1 rank
- ✅ Mob **extraction** rank: Same as spawn rank (dungeon ±1)
- ✅ Shadows extracted match mob rank perfectly
- ✅ No random extraction ranks
- ✅ All ranks relative to dungeon

---

## 📊 Complete System Verification

### Mob Spawn Example (A-rank Dungeon):

**Step 1: Determine Mob Rank**
```
Dungeon rank: A (index 4)
Random variation: -1, 0, or +1
Possible ranks: B (index 3), A (index 4), S (index 5)
Selected: A-rank (index 4)
```

**Step 2: Generate Mob Stats**
```
Base stats (A-rank):
- Strength: 100 + 4×50 = 300
- Agility: 80 + 4×40 = 240
- Intelligence: 60 + 4×30 = 180
- Vitality: 150 + 4×100 = 550

Individual variance (85-115%): 95%
Final stats:
- Strength: 300 × 0.95 = 285
- Agility: 240 × 0.95 = 228
- Intelligence: 180 × 0.95 = 171
- Vitality: 550 × 0.95 = 522
```

**Step 3: Assign Beast Type**
```
Biome: Mountains
Families: ['insect', 'reptile', 'avian']
Selected: Ant (insect family)
```

**Step 4: Create Mob Object**
```javascript
mob = {
  id: 'mob_1234567890_0_abc123',
  rank: 'A',  // ← Dungeon-relative (A-rank dungeon → A-rank mob)
  beastType: 'ant',
  beastFamily: 'insect',
  baseStats: {
    strength: 285,
    agility: 228,
    intelligence: 171,
    vitality: 522,
    luck: 95
  },
  hp: 4442,
  // ... more fields
};
```

---

### Extraction Example (Same Mob):

**Step 1: Mob Dies**
```
Mob HP: 4442 → 0
Queue for extraction
```

**Step 2: Attempt Extraction**
```javascript
attemptMobExtraction(channelKey, mob);
  → shadowArmy.attemptDungeonExtraction(
      mobId: 'dungeon_...',
      userRank: 'B',
      userLevel: 99,
      userStats: {INT:600, PER:181, STR:693, ...},
      mobRank: 'A',  // ← MOB'S ACTUAL RANK (same as spawn!)
      mobStats: {STR:285, AGI:228, INT:171, VIT:522, LUK:95},
      mobStrength: 285,
      beastFamilies: ['insect', 'reptile', 'avian']
    );
```

**Step 3: Calculate Extraction Chance**
```
User: B-rank (index 3)
Mob: A-rank (index 4)  ← SAME AS SPAWN RANK
Rank difference: +1 (mob 1 rank higher)

Extraction chance factors:
1. Base (INT): 600 × 0.005 = 3.0%
2. Stats mult: 10.01x
3. Rank mult: 1.0x (A-rank)
4. Rank penalty: 0.5x (1 rank higher)
5. Resistance: 0.798 (mob 285 vs user 693)

Final: 3.0% × 10.01 × 1.0 × 0.5 × 0.798 = 11.98%
With 3 tries: 32% effective
```

**Step 4: Shadow Created**
```javascript
shadow = {
  id: 'shadow_xyz',
  name: 'Ant Soldier',
  rank: 'A',  // ← SAME AS MOB RANK (dungeon-relative!)
  role: 'ant',
  baseStats: {
    strength: 285,      // From mob
    agility: 228,       // From mob
    intelligence: 171,  // From mob
    vitality: 522,      // From mob
    luck: 95           // From mob
  },
  // ... more fields
};
```

---

## ✅ Verification Checklist

### Mob Spawn Rank:
- [x] Dungeon rank determines base
- [x] ±1 rank variance applied
- [x] Clamped to valid rank range
- [x] **Result**: B, A, or S rank mobs in A-rank dungeon ✅

### Mob Extraction Rank:
- [x] Uses `mob.rank` (spawn rank)
- [x] No additional randomization
- [x] Passed to Shadow Army as `mobRank`
- [x] **Result**: Shadow matches mob spawn rank exactly ✅

### Shadow Rank:
- [x] Determined by extraction
- [x] Uses mob's actual rank
- [x] Relative to dungeon (±1)
- [x] **Result**: Shadow rank = mob rank = dungeon ±1 ✅

---

## 📋 Summary

### Toast Notifications:
✅ **Removed**:
- Damage statistics (boss/mob/total)
- Extraction count/notifications
- Mob kill notifications
- Milestone extraction toasts
- Shadow death warnings (1-5 remaining)

✅ **Simplified**:
- Boss extraction (removed attempt count)
- Failed extraction (shortened)
- Joining dungeons (one line)
- Defeat messages (shortened)
- Low mana (removed mana display)
- Boss attack (removed explanation)

✅ **Kept**:
- Dungeon cleared status
- Mobs killed count
- XP gains (user + shadows)
- Level-up summary (if 3+ shadows)
- Critical warnings (all shadows dead)

### Mob Ranks:
✅ **Spawn**: Dungeon ±1 rank (B, A, or S for A-rank dungeon)
✅ **Extraction**: Same as spawn rank (no randomization)
✅ **Shadow**: Same as mob rank (dungeon ±1)
✅ **Result**: Complete consistency across spawn → extraction → shadow

**Files Updated**:
- `plugins/Dungeons.plugin.js`:
  - Line 4056-4082: Simplified completion summary
  - Line 3701: Removed extraction milestone toasts
  - Line 3077: Simplified shadow death warnings
  - Line 3807: Simplified low mana toast
  - Line 3104: Simplified boss attack toast
  - Line 2005: Simplified dungeon join rejection
  - Line 2344: Simplified defeat message
  - Line 4213: Simplified boss extraction success
  - Line 4285: Simplified extraction failure
  - Line 5664: Removed mob kill toasts

**Status**: ✅ All changes applied, no errors, fully tested!

---

## 🎮 User Experience

**Before**: Spam everywhere, useless info, repetitive toasts
**After**: Clean, essential info only, no spam

**Example Dungeon Run**:

**During Combat**:
```
(Silent - no toasts during combat!)
ARISE animations show visually for extractions
```

**At Completion**:
```
Dungeon [A-rank] CLEARED!
Killed: 6,234 mobs
You: +1,200 XP | Shadows: +45,000 XP

(750ms later, if significant)
47 shadows leveled up!
```

**Critical Situations Only**:
```
ALL shadows defeated! You're next!
Low mana! 15 shadows couldn't be resurrected.
```

**Result**: Clean, informative, no spam! ✅🎯
