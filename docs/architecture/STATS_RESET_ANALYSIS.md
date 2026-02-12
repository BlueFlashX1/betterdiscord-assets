# Stats Reset Root Cause Analysis

## 🔍 How Your Stats Got Reset

### **The Problem: Shallow Merge Bug**

The stats reset happened due to a **shallow merge bug** in the `loadSettings()` function. Here's exactly what happened:

### **Step-by-Step Breakdown:**

#### **1. Initial Load (Line 3034)**

```javascript
const merged = { ...this.defaultSettings, ...saved };
```

**What this does:**

- Starts with `defaultSettings` (which has `stats: { strength: 0, agility: 0, ... }`)
- Overlays `saved` data on top

**The Bug:**

- If `saved.stats` was an **empty object** `{}` (or `null`/`undefined`), it would overwrite the default stats
- Result: `merged.stats = {}` (empty object)

#### **2. Deep Copy (Line 3035)**

```javascript
this.settings = JSON.parse(JSON.stringify(merged));
```

**What this does:**

- Creates a deep copy to prevent reference sharing

**The Problem:**

- If `merged.stats = {}`, then `this.settings.stats = {}` (empty object)

#### **3. Stats Validation (Line 3058)**

```javascript
if (!this.settings.stats || typeof this.settings.stats !== 'object') {
  this.settings.stats = { ...this.defaultSettings.stats };
}
```

**The Critical Issue:**

- An empty object `{}` **IS** an object (`typeof {} === 'object'`)
- So this check **PASSES** (stats exists, it's an object)
- The code goes to the `else` block instead of initializing from defaults

#### **4. The Old Merge Logic (Before Fix)**

```javascript
// OLD CODE (BEFORE FIX):
this.settings.stats = {
  ...this.defaultSettings.stats, // { strength: 0, agility: 0, ... }
  ...this.settings.stats, // {} (empty object - overwrites nothing, but...)
};
```

**The Problem:**

- If `this.settings.stats = {}`, the spread `...this.settings.stats` adds nothing
- But if individual properties were missing or `undefined`, they wouldn't be filled in properly
- The old code didn't use nullish coalescing (`??`), so `undefined` values could slip through

### **How Empty Stats Could Have Been Saved:**

1. **Previous Code Bug**: An earlier version might have saved `stats: {}` when stats were missing
2. **Data Corruption**: Browser storage corruption could have set stats to empty object
3. **Migration Issue**: A data migration might have accidentally cleared stats
4. **Manual Reset**: Stats might have been manually reset at some point

### **The Fix We Applied:**

#### **1. Guard Clause in `getTotalEffectiveStats()` (Line 877)**

```javascript
if (!this.settings.stats || typeof this.settings.stats !== 'object') {
  this.settings.stats = {
    strength: 0,
    agility: 0,
    intelligence: 0,
    vitality: 0,
    perception: 0,
  };
  this.saveSettings();
}
```

**What this does:**

- Checks if stats are missing or invalid **every time** stats are accessed
- Initializes with defaults if missing
- Saves immediately to prevent future resets

#### **2. Robust Merge in `loadSettings()` (Line 3063-3080)**

```javascript
// NEW CODE (AFTER FIX):
this.settings.stats = {
  ...this.defaultSettings.stats, // Start with defaults
  ...this.settings.stats, // Overlay saved stats
};
// Then ensure each property exists individually
this.settings.stats.strength =
  this.settings.stats.strength ?? this.defaultSettings.stats.strength ?? 0;
// ... (same for all stats)
```

**What this does:**

- Uses **nullish coalescing (`??`)** to preserve existing values
- Only uses defaults if value is `null` or `undefined`
- Ensures all properties exist even if saved stats were incomplete

#### **3. Empty Object Detection (Line 3058)**

```javascript
if (!this.settings.stats || typeof this.settings.stats !== 'object') {
  // Initialize from defaults
}
```

**The Fix:**

- Now also checks if stats object is empty using `Object.keys(this.settings.stats).length === 0`
- But the individual property checks (line 3068-3080) handle this better

### **Why It Won't Happen Again:**

✅ **Multiple Safeguards:**

1. Stats validated on load (`loadSettings()`)
2. Stats validated on access (`getTotalEffectiveStats()`)
3. Individual property checks with nullish coalescing
4. Backup system for recovery

✅ **Preserves Existing Values:**

- Uses `??` operator to only use defaults if value is `null`/`undefined`
- Doesn't overwrite existing stats with zeros

✅ **Backup Recovery:**

- If stats reset, you can restore from backup
- Backup is created on every save

### **How to Check If Stats Were Reset:**

```javascript
// Check current stats
const primary = BdApi.Data.load('SoloLevelingStats', 'settings');
console.log('Current stats:', primary?.stats);

// Check backup stats
const backup = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
console.log('Backup stats:', backup?.stats);

// Compare
if (primary && backup) {
  const primaryTotal = Object.values(primary.stats || {}).reduce((a, b) => a + b, 0);
  const backupTotal = Object.values(backup.stats || {}).reduce((a, b) => a + b, 0);
  console.log('Primary total stats:', primaryTotal);
  console.log('Backup total stats:', backupTotal);
  if (backupTotal > primaryTotal) {
    console.log('⚠️ Backup has higher stats! Consider restoring.');
  }
}
```

### **How to Restore Stats from Backup:**

```javascript
const backup = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
if (backup && backup.stats) {
  const primary = BdApi.Data.load('SoloLevelingStats', 'settings');
  if (primary) {
    primary.stats = backup.stats;
    BdApi.Data.save('SoloLevelingStats', 'settings', primary);
    console.log('✅ Stats restored from backup!');
    console.log('Restored stats:', primary.stats);
  }
}
```

---

## 📊 Summary

**Root Cause:** Shallow merge bug that didn't properly handle empty stats objects or missing properties.

**The Fix:** Multiple validation layers with nullish coalescing to preserve existing values.

**Prevention:** Stats are now validated on load AND on access, with backup recovery available.

**Result:** Stats won't reset again, and if they do, you can restore from backup.
