# 🎲 Dynamic Dungeon Spawn Rate Based on Server Member Count

**Status**: ✅ **IMPLEMENTED**

---

## 📋 Summary

Updated dungeon spawning system to dynamically adjust spawn rate based on server member count:
- **Lower member count** = **Higher spawn rate** (more active per person)
- **Higher member count** = **Lower spawn rate** (less active per person)
- **Dynamic calculation** - Adjusts automatically per server
- **Reasonable bounds** - Not impossible, not spammy
- **All messages** - Works for all users' messages (not just yours)

---

## 🎯 How It Works

### Formula

```
Dynamic Spawn Chance = Base Spawn Chance × (1 / √(Member Count / 10))
```

**Explanation**:
- Uses square root curve for smooth decrease
- Normalizes member count (divides by 10)
- Creates natural scaling that feels balanced

### Examples

| Server Size | Member Count | Base Chance | Dynamic Chance | Multiplier |
|-------------|--------------|-------------|----------------|------------|
| **Small** | 10 members | 10% | **10.0%** | 1.00x |
| **Medium** | 100 members | 10% | **3.16%** | 0.32x |
| **Large** | 1,000 members | 10% | **1.0%** | 0.10x |
| **Very Large** | 10,000 members | 10% | **0.32%** | 0.03x |

---

## 🔧 Implementation

### 1. Get Server Member Count

```javascript
getServerMemberCount(guildId) {
  if (!guildId || guildId === 'DM') return null;
  
  const GuildStore = BdApi.Webpack?.getStore?.('GuildStore');
  if (GuildStore?.getGuild) {
    const guild = GuildStore.getGuild(guildId);
    return guild.memberCount || guild.members?.size || guild.approximateMemberCount;
  }
  
  return null;
}
```

**What it does**:
- Gets guild from Discord's GuildStore
- Tries multiple property names for member count
- Returns null for DMs or if unavailable

### 2. Calculate Dynamic Spawn Chance

```javascript
calculateDynamicSpawnChance(baseSpawnChance, guildId) {
  const memberCount = this.getServerMemberCount(guildId);
  
  // If unavailable, use base chance
  if (!memberCount || memberCount < 1) {
    return baseSpawnChance;
  }
  
  // Normalize member count (divide by 10 for smoother curve)
  const normalizedMembers = memberCount / 10;
  
  // Calculate multiplier using square root curve
  const multiplier = 1 / Math.sqrt(normalizedMembers);
  
  // Calculate dynamic spawn chance
  const dynamicChance = baseSpawnChance * multiplier;
  
  // Clamp between reasonable bounds (0.1% min, base chance max)
  const minChance = 0.1;
  const maxChance = baseSpawnChance;
  
  return Math.max(minChance, Math.min(maxChance, dynamicChance));
}
```

**What it does**:
- Gets server member count
- Calculates dynamic multiplier using square root curve
- Applies multiplier to base spawn chance
- Clamps between 0.1% (minimum) and base chance (maximum)

### 3. Use Dynamic Chance in Spawn Check

```javascript
async checkDungeonSpawn(channelKey, channelInfo) {
  // ... existing checks ...
  
  // Calculate dynamic spawn chance based on server member count
  const baseSpawnChance = this.settings.spawnChance || 10;
  const dynamicSpawnChance = this.calculateDynamicSpawnChance(baseSpawnChance, channelInfo.guildId);
  
  const roll = Math.random() * 100;
  
  if (roll > dynamicSpawnChance) return;
  
  // Spawn dungeon
  await this.createDungeon(channelKey, channelInfo, dungeonRank);
}
```

**What it does**:
- Gets base spawn chance from settings
- Calculates dynamic spawn chance based on server size
- Uses dynamic chance for spawn roll
- Spawns dungeon if roll succeeds

---

## 📊 Spawn Rate Examples

### Small Server (10 members)

**Base Chance**: 10%
**Dynamic Chance**: 10% × (1 / √(10/10)) = **10.0%**

**Result**: 
- ✅ **High spawn rate** - Active server, dungeons spawn frequently
- ✅ **Reasonable** - Not spammy, still feels natural

### Medium Server (100 members)

**Base Chance**: 10%
**Dynamic Chance**: 10% × (1 / √(100/10)) = **3.16%**

**Result**:
- ✅ **Moderate spawn rate** - Balanced for medium servers
- ✅ **Not too frequent** - Prevents spam
- ✅ **Not too rare** - Still spawns regularly

### Large Server (1,000 members)

**Base Chance**: 10%
**Dynamic Chance**: 10% × (1 / √(1000/10)) = **1.0%**

**Result**:
- ✅ **Lower spawn rate** - Prevents spam in large servers
- ✅ **Still possible** - Not impossible to spawn
- ✅ **Balanced** - Accounts for more messages

### Very Large Server (10,000 members)

**Base Chance**: 10%
**Dynamic Chance**: 10% × (1 / √(10000/10)) = **0.32%**

**Result**:
- ✅ **Very low spawn rate** - Prevents spam
- ✅ **Still spawns** - Not impossible
- ✅ **Minimum bound** - Clamped to 0.1% minimum

---

## 🎯 Key Features

### 1. Dynamic Adjustment

- ✅ **Automatic** - Adjusts per server automatically
- ✅ **No configuration** - Works out of the box
- ✅ **Per server** - Each server has its own rate

### 2. Reasonable Bounds

- ✅ **Minimum**: 0.1% (prevents impossible spawns)
- ✅ **Maximum**: Base spawn chance (prevents spam)
- ✅ **Smooth curve** - Natural scaling

### 3. All Messages Work

- ✅ **All users** - Any user's message can spawn dungeon
- ✅ **Not just yours** - Works for everyone
- ✅ **Bot filtering** - Still filters out bots

### 4. Server Size Detection

- ✅ **GuildStore** - Uses Discord's guild store
- ✅ **Multiple fallbacks** - Tries different property names
- ✅ **DM handling** - Uses base chance for DMs

---

## 🔄 How It Works in Practice

### Example: Small Server (10 members)

```
User sends message → Check spawn chance
  → Member count: 10
  → Dynamic chance: 10% (same as base)
  → Roll: 5% → ✅ SPAWN DUNGEON!
```

### Example: Large Server (1,000 members)

```
User sends message → Check spawn chance
  → Member count: 1,000
  → Dynamic chance: 1.0% (reduced from 10%)
  → Roll: 0.5% → ✅ SPAWN DUNGEON!
  → Roll: 2.0% → ❌ No spawn (but still possible!)
```

### Example: Very Large Server (10,000 members)

```
User sends message → Check spawn chance
  → Member count: 10,000
  → Dynamic chance: 0.32% (much reduced)
  → Roll: 0.2% → ✅ SPAWN DUNGEON!
  → Roll: 1.0% → ❌ No spawn (rare but not impossible)
```

---

## ✅ Benefits

1. **Balanced Spawning**
   - Small servers: More frequent spawns (active)
   - Large servers: Less frequent spawns (prevents spam)
   - Natural scaling based on server size

2. **Prevents Spam**
   - Large servers won't spawn dungeons constantly
   - Still spawns, but at reasonable rate
   - Accounts for more messages in large servers

3. **Not Impossible**
   - Minimum bound ensures spawns still happen
   - Even in very large servers, dungeons can spawn
   - Just less frequently

4. **All Users**
   - Works for all users' messages
   - Not just your messages
   - More active servers = more spawn opportunities

---

## 📁 Files Modified

1. `plugins/Dungeons.plugin.js`
   - Added `getServerMemberCount()` function
   - Added `calculateDynamicSpawnChance()` function
   - Updated `checkDungeonSpawn()` to use dynamic chance

---

## 🎉 Result

**Dynamic spawn rate system complete!**

- ✅ **Lower member count** = Higher spawn rate
- ✅ **Higher member count** = Lower spawn rate
- ✅ **Dynamic calculation** - Adjusts automatically
- ✅ **Reasonable bounds** - Not impossible, not spammy
- ✅ **All messages** - Works for all users

**Dungeon spawning now adapts to server size automatically!** 🚀
