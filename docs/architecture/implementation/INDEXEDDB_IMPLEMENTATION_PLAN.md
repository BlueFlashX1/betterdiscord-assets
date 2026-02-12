# IndexedDB Implementation Plan for ShadowArmy Plugin

## Overview

This plan covers implementing IndexedDB storage for ShadowArmy with user-specific isolation, probability rework, exponential stat scaling, and performance optimizations.

---

## Phase 1: User-Specific Storage Isolation

### 1.1 Get Discord User ID

**Method**: Use BetterDiscord's UserStore or window object
```javascript
// Option 1: Via BdApi
const UserStore = BdApi.findModuleByProps('getCurrentUser');
const currentUser = UserStore?.getCurrentUser();
const userId = currentUser?.id || 'default';

// Option 2: Via window (if available)
const userId = window.Discord?.user?.id || 'default';
```

### 1.2 Database Naming Convention

**Pattern**: `ShadowArmyDB_${userId}`
- Each user gets their own database
- Prevents data conflicts between users
- Allows multiple users on same machine

### 1.3 Check All Plugins for User Isolation

**Plugins to Check:**
1. ✅ SoloLevelingStats - Uses `BdApi.Data.save('SoloLevelingStats', 'settings', ...)`
2. ✅ ShadowArmy - Uses `BdApi.Data.save('ShadowArmy', 'settings', ...)`
3. ✅ ShadowAriseAnimation - Uses `BdApi.Data.save('ShadowAriseAnimation', 'settings', ...)`
4. ✅ LevelProgressBar - Uses `BdApi.Data.save('LevelProgressBar', 'settings', ...)`
5. ✅ SoloLevelingToasts - Uses `BdApi.Data.save('SoloLevelingToasts', 'settings', ...)`
6. ✅ TitleManager - Uses `BdApi.Data.save('TitleManager', 'settings', ...)`
7. ✅ SkillTree - Uses `BdApi.Data.save('SkillTree', 'settings', ...)`
8. ✅ LevelUpAnimation - Uses `BdApi.Data.save('LevelUpAnimation', 'settings', ...)`

**Action**: All plugins need user-specific storage keys:
- Current: `BdApi.Data.save('PluginName', 'settings', ...)`
- New: `BdApi.Data.save('PluginName', `settings_${userId}`, ...)`

---

## Phase 2: IndexedDB Storage Manager Implementation

### 2.1 ShadowStorageManager Class Structure

```javascript
class ShadowStorageManager {
  constructor(userId) {
    this.userId = userId;
    this.dbName = `ShadowArmyDB_${userId}`;
    this.dbVersion = 1;
    this.storeName = 'shadows';
    this.db = null;
    
    // Memory cache
    this.favoriteCache = new Map(); // Favorite shadows (7 generals)
    this.recentCache = new Map(); // Recently accessed shadows
    this.cacheLimit = 100;
    
    // Aggregation cache (for performance)
    this.aggregatedPowerCache = null;
    this.aggregatedPowerCacheTime = null;
    this.cacheTTL = 60000; // 1 minute
  }
  
  // Core methods
  async init() { /* Open/create IndexedDB */ }
  async migrateFromLocalStorage() { /* Migration logic */ }
  async saveShadow(shadow) { /* Save to IndexedDB */ }
  async getShadow(id) { /* Get from cache or IndexedDB */ }
  async getShadows(filters, offset, limit) { /* Paginated query */ }
  async getFavoriteShadows() { /* From memory cache */ }
  async deleteShadow(id) { /* Remove from IndexedDB */ }
  async getTotalCount() { /* Get total shadow count */ }
  
  // Aggregation methods
  async getAggregatedPower(userRank) { /* Aggregate weak shadows */ }
  async updateAggregatedPowerCache() { /* Update cache */ }
  
  // Batch operations
  async saveShadowsBatch(shadows) { /* Save multiple shadows */ }
  async getShadowsByRank(rank) { /* Filter by rank */ }
  async getShadowsByRole(role) { /* Filter by role */ }
}
```

### 2.2 Database Schema

```javascript
// IndexedDB Object Store: "shadows"
{
  id: string,                    // Primary key: shadow ID
  rank: string,                   // Indexed: 'E', 'D', 'C', etc.
  role: string,                   // Indexed: 'tank', 'mage', etc.
  level: number,                  // Indexed: shadow level
  strength: number,               // Indexed: for sorting
  extractedAt: number,             // Indexed: timestamp
  
  // Full shadow data
  roleName: string,
  baseStats: {
    strength: number,
    agility: number,
    intelligence: number,
    vitality: number,
    luck: number,
  },
  growthStats: {
    strength: number,
    agility: number,
    intelligence: number,
    vitality: number,
    luck: number,
  },
  xp: number,
  ownerLevelAtExtraction: number,
  
  // Aggregation flag (for weak shadows)
  isAggregated: boolean,          // true if aggregated
  aggregatedPower: number,         // Total power if aggregated
}
```

### 2.3 Indexes

```javascript
// Indexes for fast queries:
- Primary: id
- Index: rank (for filtering by rank)
- Index: role (for filtering by role)
- Index: level (for sorting by level)
- Index: strength (for sorting by power)
- Index: extractedAt (for sorting by date)
- Compound: [rank, role] (for combined filters)
```

---

## Phase 3: Probability Rework (Solo Leveling Lore)

### 3.1 Current System Issues

- All ranks have similar extraction chances
- Doesn't reflect Solo Leveling lore (weaker shadows more common)
- Higher ranks should be exponentially rarer
- User stats don't influence extraction probability
- No lore-based constraints implemented

### 3.2 Solo Leveling Lore Constraints

**From Solo Leveling Lore:**
1. ✅ **Can't extract from significantly stronger targets** - User rank must be close to target rank
2. ✅ **Can only extract 3 times from same target** - Track extraction attempts per target
3. ⚠️ Can't extract from contaminated mana (demons) - Skip for Discord context
4. ⚠️ Can't extract from mana-based biology (Rulers/Monarchs) - Skip for Discord context
5. ⚠️ Can't extract from targets without mana - Skip for Discord context
6. ⚠️ Can't extract from long-dead targets - Skip for Discord context

**Implementation:**
- User rank must be within 2 ranks of target rank (can't extract significantly stronger)
- Track extraction attempts per "target" (message content hash or similar)
- Max 3 attempts per unique target

### 3.3 Stats Influence on Probability

**User Stats Influence:**
- **Intelligence**: Primary stat for extraction (already used, increase weight)
- **Perception**: Secondary stat for detecting extraction opportunities
- **Strength**: Affects ability to extract stronger shadows
- **Total Stats**: Overall power affects extraction success rate

**Target Stats Influence:**
- **Target Rank**: Higher rank = exponentially harder
- **Target Strength**: Stronger targets resist extraction
- **Rank Difference**: User rank vs target rank affects success

**Formula:**
```javascript
// Base extraction chance
baseChance = minBaseChance + (intelligence * chancePerInt)

// Stats multiplier
statsMultiplier = 1.0 + (
  (intelligence * 0.01) +      // INT: +1% per point
  (perception * 0.005) +       // PER: +0.5% per point
  (strength * 0.003) +         // STR: +0.3% per point
  (totalStats / 1000 * 0.01)   // Total power bonus
)

// Rank difference penalty
rankDiff = targetRankIndex - userRankIndex
rankPenalty = rankDiff > 0 ? Math.pow(0.5, rankDiff) : 1.0  // 50% reduction per rank above

// Target strength resistance
targetResistance = Math.min(0.9, targetStrength / (userStrength * 2))  // Cap at 90% resistance

// Final chance
finalChance = baseChance * statsMultiplier * rankPenalty * (1 - targetResistance)
```

### 3.4 New Probability System

**Principle**: Lower ranks = easier to extract, Higher ranks = exponentially harder
**Stats**: User stats boost chance, target stats resist extraction
**Lore**: Can't extract significantly stronger targets

```javascript
// Rank extraction probability multipliers (base chance * multiplier)
const rankProbabilityMultipliers = {
  'E': 10.0,      // Very common (10x base chance)
  'D': 5.0,       // Common (5x base chance)
  'C': 2.5,       // Uncommon (2.5x base chance)
  'B': 1.0,       // Normal (1x base chance)
  'A': 0.5,       // Rare (0.5x base chance)
  'S': 0.2,       // Very rare (0.2x base chance)
  'SS': 0.1,      // Extremely rare (0.1x base chance)
  'SSS': 0.05,    // Ultra rare (0.05x base chance)
  'SSS+': 0.02,   // Legendary (0.02x base chance)
  'NH': 0.01,     // Mythic (0.01x base chance)
  'Monarch': 0.005,    // Near impossible (0.005x base chance)
  'Monarch+': 0.001,   // Almost never (0.001x base chance)
  'Shadow Monarch': 0.0001, // Once in a lifetime (0.0001x base chance)
};

// User rank affects which shadows can be extracted
// E rank user: Can only extract E-D-C shadows (very low chance for C)
// S rank user: Can extract up to S-SS shadows (very low chance for SS)
// Monarch user: Can extract up to Monarch shadows (extremely rare)
```

### 3.5 Rank-Based Extraction Logic with Stats

```javascript
determineExtractionChance(userRank, userStats, targetRank, targetStrength) {
  const userRankIndex = this.shadowRanks.indexOf(userRank);
  const targetRankIndex = this.shadowRanks.indexOf(targetRank);
  
  // Lore constraint: Can't extract significantly stronger targets
  const rankDiff = targetRankIndex - userRankIndex;
  if (rankDiff > 2) {
    return 0; // Target too strong (more than 2 ranks above)
  }
  
  // Base rank multiplier
  const rankMultiplier = rankProbabilityMultipliers[targetRank] || 1.0;
  
  // Stats influence
  const intelligence = userStats.intelligence || 0;
  const perception = userStats.perception || 0;
  const strength = userStats.strength || 0;
  const totalStats = Object.values(userStats).reduce((sum, val) => sum + (val || 0), 0);
  
  const statsMultiplier = 1.0 + (
    (intelligence * 0.01) +
    (perception * 0.005) +
    (strength * 0.003) +
    (totalStats / 1000 * 0.01)
  );
  
  // Rank difference penalty (if target is stronger)
  const rankPenalty = rankDiff > 0 ? Math.pow(0.5, rankDiff) : 1.0;
  
  // Target strength resistance
  const userStrength = this.calculateUserStrength(userStats);
  const targetResistance = Math.min(0.9, targetStrength / (userStrength * 2));
  
  // Calculate final chance
  const baseChance = this.settings.extractionConfig.minBaseChance || 0.001;
  const chancePerInt = this.settings.extractionConfig.chancePerInt || 0.005;
  
  const finalChance = Math.max(0, Math.min(1,
    (baseChance + intelligence * chancePerInt) *
    rankMultiplier *
    statsMultiplier *
    rankPenalty *
    (1 - targetResistance)
  ));
  
  return finalChance;
}

determineExtractableRanks(userRank, userStats) {
  const userRankIndex = this.shadowRanks.indexOf(userRank);
  const extractableRanks = [];
  
  // User can extract shadows up to their rank + 2 tiers above (lore constraint)
  // But lower ranks are always more common
  for (let i = 0; i <= Math.min(userRankIndex + 2, this.shadowRanks.length - 1); i++) {
    const rank = this.shadowRanks[i];
    const multiplier = rankProbabilityMultipliers[rank] || 1.0;
    
    // Apply stats boost to multiplier
    const intelligence = userStats.intelligence || 0;
    const statsBoost = 1.0 + (intelligence * 0.01);
    
    extractableRanks.push({ 
      rank, 
      multiplier: multiplier * statsBoost 
    });
  }
  
  // Normalize probabilities so they sum to 1.0
  const totalMultiplier = extractableRanks.reduce((sum, r) => sum + r.multiplier, 0);
  extractableRanks.forEach(r => {
    r.probability = r.multiplier / totalMultiplier;
  });
  
  return extractableRanks;
}
```

### 3.6 Target Extraction Tracking

**Track extraction attempts per target:**
```javascript
// In settings
extractionAttempts: {
  // Key: target identifier (message hash or similar)
  // Value: { count: number, lastAttempt: timestamp }
}

// Check before extraction
canExtractFromTarget(targetId) {
  const attempts = this.settings.extractionAttempts[targetId];
  if (!attempts) return true; // No previous attempts
  
  // Lore: Max 3 attempts per target
  return attempts.count < 3;
}

// Record attempt
recordExtractionAttempt(targetId) {
  if (!this.settings.extractionAttempts) {
    this.settings.extractionAttempts = {};
  }
  
  const attempts = this.settings.extractionAttempts[targetId] || { count: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  this.settings.extractionAttempts[targetId] = attempts;
}
```

---

## Phase 4: Exponential Stat Scaling

### 4.1 Current System Issues

- Stats are too similar between ranks (e.g., E rank: 10-15, S rank: 15-20)
- Doesn't reflect exponential power growth in Solo Leveling
- Higher ranks should be dramatically stronger

### 4.2 New Exponential Scaling Formula

```javascript
// Base stat multiplier per rank (exponential growth)
const rankStatMultipliers = {
  'E': 1.0,           // Base (100%)
  'D': 1.5,           // 150% (1.5x)
  'C': 2.25,          // 225% (1.5^2)
  'B': 3.375,         // 337.5% (1.5^3)
  'A': 5.0625,        // 506.25% (1.5^4)
  'S': 7.59375,       // 759.375% (1.5^5)
  'SS': 11.390625,    // 1139% (1.5^6)
  'SSS': 17.0859375,  // 1708% (1.5^7)
  'SSS+': 25.62890625, // 2562% (1.5^8)
  'NH': 38.443359375,  // 3844% (1.5^9)
  'Monarch': 57.6650390625,      // 5766% (1.5^10)
  'Monarch+': 86.49755859375,    // 8649% (1.5^11)
  'Shadow Monarch': 129.746337890625, // 12974% (1.5^12)
};

// Formula: baseStat * rankMultiplier * roleWeight * (1 + randomVariance)
// Example: E rank tank with base 10 STR = 10 * 1.0 * 0.8 = 8 STR
//          S rank tank with base 10 STR = 10 * 7.59 * 0.8 = 60.7 STR
```

### 4.3 Implementation

```javascript
generateShadowBaseStats(userStats, roleKey, shadowRank) {
  const rankMultiplier = rankStatMultipliers[shadowRank] || 1.0;
  const weights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;
  const stats = ['strength', 'agility', 'intelligence', 'vitality', 'luck'];
  
  const totalUserStats = /* sum of user stats */;
  const baseStats = {};
  
  stats.forEach((stat) => {
    const userStat = userStats[stat] || 0;
    const w = weights[stat] || 0.5;
    
    // Exponential scaling formula
    const raw = (
      (userStat * 0.7 + totalUserStats * 0.1 + 5) * 
      w * 
      rankMultiplier *  // EXPONENTIAL MULTIPLIER
      (1 + Math.random() * 0.2) // 0-20% variance
    );
    
    baseStats[stat] = Math.max(1, Math.round(raw));
  });
  
  return baseStats;
}
```

---

## Phase 5: Aggregation for Performance

### 5.1 Aggregation Strategy

**Goal**: Reduce memory/processing for weak shadows (2+ ranks below current rank)

**Logic**:
- Shadows 2+ ranks below user's current rank are aggregated
- Individual shadow data preserved in IndexedDB
- Only total power/strength calculated and cached
- Full stats still accessible when needed

### 5.2 Aggregation Implementation

```javascript
async getAggregatedPower(userRank) {
  // Check cache first
  if (this.aggregatedPowerCache && 
      Date.now() - this.aggregatedPowerCacheTime < this.cacheTTL) {
    return this.aggregatedPowerCache;
  }
  
  const userRankIndex = this.shadowRanks.indexOf(userRank);
  const weakRankThreshold = Math.max(0, userRankIndex - 2);
  const weakRanks = this.shadowRanks.slice(0, weakRankThreshold + 1);
  
  // Query IndexedDB for weak shadows
  const transaction = this.db.transaction([this.storeName], 'readonly');
  const store = transaction.objectStore(this.storeName);
  const index = store.index('rank');
  
  let totalPower = 0;
  let totalCount = 0;
  
  // Sum power from all weak rank shadows
  for (const rank of weakRanks) {
    const request = index.getAll(rank);
    const shadows = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    shadows.forEach(shadow => {
      totalPower += shadow.strength || 0;
      totalCount++;
    });
  }
  
  // Cache result
  this.aggregatedPowerCache = {
    totalPower,
    totalCount,
    ranks: weakRanks,
    timestamp: Date.now(),
  };
  this.aggregatedPowerCacheTime = Date.now();
  
  return this.aggregatedPowerCache;
}
```

### 5.3 Preserve Individual Stats

**Important**: Even when aggregated, individual shadow stats are preserved in IndexedDB:
- Full `baseStats` object (STR, AGI, INT, VIT, LUK)
- Full `growthStats` object
- All other shadow properties
- Only calculation is aggregated for performance

---

## Phase 6: Migration Strategy

### 6.1 Migration Steps

1. **Detect existing localStorage data**
   ```javascript
   const oldData = BdApi.Data.load('ShadowArmy', 'settings');
   if (oldData && oldData.shadows && oldData.shadows.length > 0) {
     // Migration needed
   }
   ```

2. **Create IndexedDB database**
   ```javascript
   await this.init();
   ```

3. **Migrate shadows to IndexedDB**
   ```javascript
   await this.saveShadowsBatch(oldData.shadows);
   ```

4. **Keep localStorage as backup (1 version)**
   ```javascript
   // Keep old data for 1 version, then remove
   ```

5. **Update all save/load calls**
   ```javascript
   // Replace: this.settings.shadows.push(shadow)
   // With: await this.storageManager.saveShadow(shadow)
   ```

### 6.2 Backward Compatibility

- Check for IndexedDB support
- Fallback to localStorage if IndexedDB unavailable
- Graceful degradation

---

## Phase 7: Implementation Order

### Step 1: User ID Detection
- [ ] Create utility function to get Discord user ID
- [ ] Test with multiple users

### Step 2: ShadowStorageManager Class
- [ ] Implement IndexedDB initialization
- [ ] Implement saveShadow/getShadow methods
- [ ] Implement pagination and filtering
- [ ] Implement aggregation methods

### Step 3: Migration System
- [ ] Implement localStorage → IndexedDB migration
- [ ] Test migration with existing data
- [ ] Handle edge cases

### Step 4: Update ShadowArmy Plugin
- [ ] Replace localStorage calls with IndexedDB
- [ ] Update all shadow operations
- [ ] Test shadow extraction and storage

### Step 5: Probability Rework
- [ ] Implement new probability multipliers
- [ ] Update rank extraction logic
- [ ] Test probability distribution

### Step 6: Exponential Stat Scaling
- [ ] Implement rank multipliers
- [ ] Update stat generation
- [ ] Test stat differences between ranks

### Step 7: Aggregation System
- [ ] Implement aggregation logic
- [ ] Add caching
- [ ] Test performance improvements

### Step 8: User Isolation for All Plugins
- [ ] Update all Solo Leveling plugins
- [ ] Add user ID to storage keys
- [ ] Test multi-user scenarios

---

## Phase 8: Testing Checklist

### Storage Tests
- [ ] Single user: Extract and store shadows
- [ ] Multiple users: Separate storage per user
- [ ] Migration: Old data migrates correctly
- [ ] Performance: 10,000+ shadows load quickly

### Probability Tests
- [ ] Lower ranks extract more often
- [ ] Higher ranks extract rarely
- [ ] User rank affects extractable ranks

### Stat Scaling Tests
- [ ] E rank shadows have low stats
- [ ] S rank shadows have high stats
- [ ] Exponential growth is visible

### Aggregation Tests
- [ ] Weak shadows aggregated correctly
- [ ] Individual stats preserved in DB
- [ ] Performance improved

---

## Estimated Implementation Time

- **Phase 1-2**: 2-3 hours (User isolation + IndexedDB class)
- **Phase 3**: 1 hour (Probability rework)
- **Phase 4**: 1 hour (Exponential stats)
- **Phase 5**: 1-2 hours (Aggregation)
- **Phase 6**: 1 hour (Migration)
- **Phase 7**: 2-3 hours (Integration)
- **Phase 8**: 1-2 hours (Testing)

**Total**: ~10-13 hours

---

## Notes

- All shadow data preserved in IndexedDB (no data loss)
- Backward compatible with existing saves
- User-specific storage prevents conflicts
- Exponential scaling reflects Solo Leveling power system
- Aggregation improves performance without losing data
