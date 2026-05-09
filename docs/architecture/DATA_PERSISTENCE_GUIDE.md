# Data Persistence Guide - SoloLevelingStats Plugin

## 📦 How Data is Stored

### Storage System: BetterDiscord's `BdApi.Data`

All plugin data is stored using BetterDiscord's persistent storage API:

```javascript
// Save data
BdApi.Data.save('SoloLevelingStats', 'settings', dataObject);

// Load data
const data = BdApi.Data.load('SoloLevelingStats', 'settings');
```

**Storage Location**: BetterDiscord stores data in browser's IndexedDB/localStorage (persists across browser restarts, Discord updates, etc.)

---

## 💾 What Data is Stored

### Complete Settings Object (`this.settings`)

The entire settings object is saved, including:

#### **Core Stats**

- `level` - Current level
- `xp` - Current XP in current level
- `totalXP` - Total XP accumulated (used for level calculation)
- `rank` - Current rank (E, D, C, B, A, S, SS, SSS, SSS+, NH, Monarch, Monarch+, Shadow Monarch)
- `unallocatedStatPoints` - Unspent stat points

#### **Stats Object** (`this.settings.stats`)

- `strength` - STR stat
- `agility` - AGI stat
- `intelligence` - INT stat
- `vitality` - VIT stat
- `perception` - PER stat (formerly luck)

#### **HP/Mana**

- `userHP` - Current HP
- `userMaxHP` - Maximum HP (calculated from VIT + rank)
- `userMana` - Current Mana
- `userMaxMana` - Maximum Mana (calculated from INT)

#### **Activity Tracking** (`this.settings.activity`)

- `messagesSent` - Total messages sent
- `charactersTyped` - Total characters typed
- `channelsVisited` - Set of visited channel IDs (converted to array for storage)
- `lastActiveTime` - Last active timestamp
- `sessionStartTime` - Session start timestamp
- `streakDays` - Daily login streak
- `lastActiveDate` - Last active date (for streak calculation)
- `critsLanded` - Critical hits landed

#### **Daily Quests** (`this.settings.dailyQuests`)

- `lastResetDate` - Last daily reset date
- `quests` - Object containing all quest progress:
  - `messageMaster` - { progress, target, completed }
  - `characterChampion` - { progress, target, completed }
  - `channelExplorer` - { progress, target, completed }
  - `activeAdventurer` - { progress, target, completed }
  - `perfectStreak` - { progress, target, completed }

#### **Achievements** (`this.settings.achievements`)

- `unlocked` - Array of unlocked achievement IDs
- `titles` - Array of unlocked titles
- `activeTitle` - Currently active title
- `rankHistory` - Array of rank promotion history

#### **Perception Buffs** (`this.settings.perceptionBuffs`)

- Array of perception buff objects: `[{ stat: 'strength', buff: 2.5 }, ...]`

#### **Cached Values**

- `cachedShadowPower` - Cached total shadow army power (for performance)

#### **Metadata** (`this.settings._metadata`)

- `lastSave` - ISO timestamp of last save
- `version` - Plugin version

---

## 🔄 When Data is Saved

### **Immediate Saves** (`saveSettings(true)`)

Data is saved **immediately** (synchronously) for critical events:

1. **XP Gain** - Every time XP is awarded (`awardXP()`)
2. **Level Up** - When level increases (`checkLevelUp()`)
3. **Rank Promotion** - When rank increases (`checkRankPromotion()`)
4. **Stat Allocation** - When stat points are allocated (`allocateStatPoint()`)
5. **Quest Completion** - When a daily quest is completed (`completeQuest()`)
6. **Achievement Unlock** - When an achievement is unlocked (`checkAchievements()`)
7. **Title Change** - When active title changes (`setActiveTitle()`)
8. **Natural Stat Growth** - When stats grow naturally (`processNaturalStatGrowth()`)
9. **New Channel Visit** - When visiting a new channel (`trackChannelVisit()`)
10. **Daily Quest Reset** - When daily quests reset (`checkDailyReset()`)
11. **Plugin Stop** - When plugin is disabled (`stop()`)
12. **Page Unload** - Before Discord closes (`beforeunload` event)
13. **Tab Hidden** - When tab loses focus (`visibilitychange` event)

### **Periodic Saves** (Automatic)

1. **Every 30 Seconds** - Backup save (`periodicSaveInterval`)

   - Safety net to ensure progress is saved even if debounce doesn't trigger
   - Runs continuously while plugin is active

2. **Every 5 Seconds** - Quest progress save (if quest progress changed)
   - Only saves if `Date.now() - this.lastSaveTime > 5000`
   - Prevents spam saves on every message

### **Debounced Saves** (1 second delay)

- `debounced.saveSettings` - Waits 1 second after last call before saving
- Used for non-critical updates

---

## 🛡️ Backup System

### **Dual Save Strategy**

1. **Primary Save**: `BdApi.Data.save('SoloLevelingStats', 'settings', data)`
2. **Backup Save**: `BdApi.Data.save('SoloLevelingStats', 'settings_backup', data)`

### **When Backup is Created**

- **On Save Failure**: If primary save fails, backup is automatically created
- **On Critical Events**: Backup is created alongside primary save for important events

### **Load Priority**

When loading settings, the plugin tries:

1. **Primary** (`settings`) - First attempt
2. **Backup** (`settings_backup`) - Fallback if primary fails

```javascript
// Load logic
let saved = BdApi.Data.load('SoloLevelingStats', 'settings');
if (!saved) {
  saved = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
}
```

---

## ✅ Data Validation & Safety

### **Pre-Save Validation**

Before saving, the plugin validates critical data:

```javascript
// Level validation
if (!cleanSettings.level || cleanSettings.level < 1 || !Number.isInteger(cleanSettings.level)) {
  // Abort save - don't save corrupted data
  return;
}

// XP validation
if (typeof cleanSettings.xp !== 'number' || isNaN(cleanSettings.xp) || cleanSettings.xp < 0) {
  // Abort save - don't save corrupted data
  return;
}
```

### **Data Cleaning**

Before saving, data is cleaned:

- **Set → Array**: `channelsVisited` Set is converted to array (Sets aren't JSON serializable)
- **Remove Functions**: Non-serializable properties (functions, undefined) are removed via `JSON.parse(JSON.stringify())`
- **Deep Copy**: Prevents reference sharing issues

### **Post-Load Validation**

After loading, the plugin validates and initializes missing data:

```javascript
// Ensure stats object exists
if (!this.settings.stats || typeof this.settings.stats !== 'object') {
  this.settings.stats = { ...this.defaultSettings.stats };
}

// Ensure totalXP is valid
if (typeof this.settings.totalXP !== 'number' || isNaN(this.settings.totalXP)) {
  // Calculate from level and xp
  this.settings.totalXP = calculateFromLevel(this.settings.level, this.settings.xp);
}
```

---

## 🔧 Retry Logic

### **Save Retry Mechanism**

If save fails, the plugin retries up to 3 times:

```javascript
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    BdApi.Data.save('SoloLevelingStats', 'settings', cleanSettings);
    saveSuccess = true;
    break;
  } catch (error) {
    lastError = error;
    // Retry immediately (no delay)
  }
}
```

---

## 📋 Complete Save Triggers List

| Event               | Trigger                      | Frequency             | Priority  |
| ------------------- | ---------------------------- | --------------------- | --------- |
| XP Gain             | `awardXP()`                  | Every message         | Immediate |
| Level Up            | `checkLevelUp()`             | On level increase     | Immediate |
| Rank Promotion      | `checkRankPromotion()`       | On rank increase      | Immediate |
| Stat Allocation     | `allocateStatPoint()`        | On stat point use     | Immediate |
| Quest Completion    | `completeQuest()`            | On quest complete     | Immediate |
| Achievement Unlock  | `checkAchievements()`        | On achievement unlock | Immediate |
| Title Change        | `setActiveTitle()`           | On title change       | Immediate |
| Natural Stat Growth | `processNaturalStatGrowth()` | On stat growth        | Immediate |
| New Channel Visit   | `trackChannelVisit()`        | On new channel        | Immediate |
| Daily Reset         | `checkDailyReset()`          | Daily                 | Immediate |
| Plugin Stop         | `stop()`                     | On disable            | Immediate |
| Page Unload         | `beforeunload`               | On close              | Immediate |
| Tab Hidden          | `visibilitychange`           | On blur               | Immediate |
| Periodic Backup     | `periodicSaveInterval`       | Every 30s             | Normal    |
| Quest Progress      | `processMessage()`           | Every 5s (if changed) | Normal    |

---

## 🚨 Ensuring Maximum Persistence

### **Current Safeguards**

✅ **Multiple Save Triggers** - Data saved on every important event
✅ **Periodic Backups** - Automatic saves every 30 seconds
✅ **Dual Storage** - Primary + backup saves
✅ **Retry Logic** - 3 attempts on failure
✅ **Data Validation** - Prevents saving corrupted data
✅ **Post-Load Validation** - Fixes missing/invalid data on load
✅ **Page Unload Save** - Saves before Discord closes
✅ **Tab Hidden Save** - Saves when tab loses focus

### **Additional Recommendations**

1. **Manual Backup**: Periodically export your data:

   ```javascript
   // In browser console
   const data = BdApi.Data.load('SoloLevelingStats', 'settings');
   console.log(JSON.stringify(data, null, 2));
   // Copy and save to a text file
   ```

2. **Check Backup**: Verify backup exists and view details:

   ```javascript
   // Quick check - does backup exist?
   const backup = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
   console.log('Backup exists:', !!backup);

   // Detailed check - view backup data
   if (backup) {
     console.log('=== BACKUP DATA ===');
     console.log('Level:', backup.level);
     console.log('Total XP:', backup.totalXP);
     console.log('Current XP:', backup.xp);
     console.log('Rank:', backup.rank);
     console.log('Stats:', backup.stats);
     console.log('Unallocated Points:', backup.unallocatedStatPoints);
     console.log('Last Save:', backup._metadata?.lastSave);
     console.log('Version:', backup._metadata?.version);
   } else {
     console.log('❌ No backup found!');
   }
   ```

3. **Create Backup Manually**: If backup doesn't exist, create it from primary:

   ```javascript
   // Create backup from primary data
   const primary = BdApi.Data.load('SoloLevelingStats', 'settings');
   if (primary) {
     BdApi.Data.save('SoloLevelingStats', 'settings_backup', primary);
     console.log('✅ Backup created successfully!');
   } else {
     console.log('❌ No primary data to backup!');
   }
   ```

4. **Restore from Backup**: If data is lost:

   ```javascript
   const backup = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
   if (backup) {
     BdApi.Data.save('SoloLevelingStats', 'settings', backup);
     console.log('✅ Data restored from backup!');
   } else {
     console.log('❌ No backup found to restore!');
   }
   ```

---

## 🔍 Debugging Data Issues

### **Check Current Data**

```javascript
// In browser console
const data = BdApi.Data.load('SoloLevelingStats', 'settings');
if (data) {
  console.log('=== PRIMARY DATA ===');
  console.log('Level:', data.level);
  console.log('Total XP:', data.totalXP);
  console.log('Current XP:', data.xp);
  console.log('Rank:', data.rank);
  console.log('Stats:', data.stats);
  console.log('Unallocated Points:', data.unallocatedStatPoints);
  console.log('Last Save:', data._metadata?.lastSave);
  console.log('Version:', data._metadata?.version);
} else {
  console.log('❌ No primary data found!');
}
```

### **Check Backup Data**

```javascript
// Quick backup check command
const backup = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
if (backup) {
  console.log('✅ Backup exists!');
  console.log('=== BACKUP DATA ===');
  console.log('Level:', backup.level);
  console.log('Total XP:', backup.totalXP);
  console.log('Current XP:', backup.xp);
  console.log('Rank:', backup.rank);
  console.log('Stats:', backup.stats);
  console.log('Unallocated Points:', backup.unallocatedStatPoints);
  console.log('Last Save:', backup._metadata?.lastSave);
  console.log('Version:', backup._metadata?.version);
} else {
  console.log('❌ No backup found!');
}
```

### **Compare Primary vs Backup**

```javascript
// Compare primary and backup data
const primary = BdApi.Data.load('SoloLevelingStats', 'settings');
const backup = BdApi.Data.load('SoloLevelingStats', 'settings_backup');

console.log('=== COMPARISON ===');
console.log('Primary exists:', !!primary);
console.log('Backup exists:', !!backup);

if (primary && backup) {
  console.log('Level match:', primary.level === backup.level);
  console.log('Total XP match:', primary.totalXP === backup.totalXP);
  console.log('Rank match:', primary.rank === backup.rank);
  console.log('Stats match:', JSON.stringify(primary.stats) === JSON.stringify(backup.stats));

  if (primary._metadata?.lastSave && backup._metadata?.lastSave) {
    const primaryTime = new Date(primary._metadata.lastSave);
    const backupTime = new Date(backup._metadata.lastSave);
    console.log('Primary last save:', primaryTime.toLocaleString());
    console.log('Backup last save:', backupTime.toLocaleString());
    console.log('Backup is newer:', backupTime > primaryTime);
  }
}
```

### **Force Save**

```javascript
// Get plugin instance
const plugin = BdApi.Plugins.get('SoloLevelingStats');
if (plugin && plugin.instance) {
  plugin.instance.saveSettings(true);
  console.log('Forced save completed');
}
```

---

## 📊 Data Flow Diagram

```
┌─────────────────┐
│  User Action    │
│  (XP, Stats)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Update Settings│
│  (this.settings)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate Data   │
│ (Level, XP)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Clean Data      │
│ (JSON.stringify)│
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│ Primary Save    │  │ Backup Save     │
│ (settings)      │  │ (settings_backup)│
└─────────────────┘  └─────────────────┘
         │                 │
         └────────┬────────┘
                  │
                  ▼
         ┌─────────────────┐
         │  Save Complete  │
         └─────────────────┘
```

---

## 🎯 Summary

**Your data is saved:**

- ✅ On every XP gain
- ✅ On every level up
- ✅ On every stat change
- ✅ Every 30 seconds (backup)
- ✅ Before Discord closes
- ✅ When tab loses focus
- ✅ With retry logic (3 attempts)
- ✅ With backup storage
- ✅ With data validation

**Data persists through:**

- ✅ Browser restarts
- ✅ Discord updates
- ✅ Plugin reloads
- ✅ System crashes (if saved before crash)
- ✅ Tab closures
- ✅ Browser crashes (if saved before crash)

**Maximum persistence is ensured through multiple redundant save mechanisms!**
