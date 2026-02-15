# 🔍 Debug Instructions: Track Save/Load State

## What Was Added

Console logging at every critical point in the save/load system:

### 1. **Constructor** (when plugin starts)
```
🔧 [CONSTRUCTOR] Settings initialized with deep copy
```

### 2. **Load Settings** (when loading saved data)
```
💾 [LOAD] Raw saved data from storage
✅ [LOAD] Settings after deep merge
```

### 3. **Save Settings** (when saving data)
```
💾 [SAVE] Current settings before save
💾 [SAVE] Clean settings to be saved
✅ [SAVE] Successfully saved to BdApi.Data
```

---

## 🧪 How to Test with Debug Logging

### Step 1: Open Developer Console
Press **Ctrl+Shift+I** (Windows/Linux) or **Cmd+Option+I** (Mac)

### Step 2: Clear Console
Click the 🚫 icon or press **Ctrl+L** to clear old logs

### Step 3: Reload Discord
Press **Ctrl+R** (Windows/Linux) or **Cmd+R** (Mac)

### Step 4: Watch Console During Reload

You should see:
```
🔧 [CONSTRUCTOR] Settings initialized with deep copy
  level: 1
  xp: 0
  rank: "E"
  settingsAreDefault: false  ← Should be FALSE!
  isDeepCopy: true           ← Should be TRUE!
```

If you have saved data, you'll also see:
```
💾 [LOAD] Raw saved data from storage
  level: 5
  xp: 1000
  rank: "D"
  
✅ [LOAD] Settings after deep merge
  level: 5
  xp: 1000
  rank: "D"
  isDeepCopy: true  ← Should be TRUE!
```

### Step 5: Gain Some XP

Send 5-10 messages in any channel

### Step 6: Watch Console for Save

After gaining XP, you should see:
```
💾 [SAVE] Current settings before save
  level: 1
  xp: 150
  totalXP: 150
  rank: "E"
  
💾 [SAVE] Clean settings to be saved
  level: 1
  xp: 150
  totalXP: 150
  rank: "E"
  metadata: { lastSave: "2025-12-05...", version: "1.0.1" }
  
✅ [SAVE] Successfully saved to BdApi.Data
  attempt: 1
  level: 1
  xp: 150
```

### Step 7: Reload Discord Again

Press **Ctrl+R** and watch console

You should see your saved data loaded:
```
💾 [LOAD] Raw saved data from storage
  level: 1
  xp: 150  ← Should match what was saved!
```

---

## 🔍 What to Look For

### ✅ **Good Signs:**

1. **Constructor**:
   - `settingsAreDefault: false` (not sharing reference)
   - `isDeepCopy: true` (independent objects)

2. **Load**:
   - Raw saved data shows your progress
   - Merged settings match raw data
   - `isDeepCopy: true`

3. **Save**:
   - Current settings show your progress
   - Clean settings match current settings
   - Save succeeds on attempt 1

### ❌ **Bad Signs:**

1. **Constructor**:
   - `settingsAreDefault: true` ← BUG! Still sharing reference!
   - `isDeepCopy: false` ← BUG! Not a deep copy!

2. **Load**:
   - Raw saved data is `null` or `undefined` ← Nothing saved!
   - Merged settings don't match raw data ← Merge failed!
   - `isDeepCopy: false` ← Still sharing references!

3. **Save**:
   - Current settings show level 1 when you're higher ← Not tracking progress!
   - Clean settings don't match current ← Serialization issue!
   - Save fails (no success message) ← BdApi.Data.save failed!

---

## 📊 Example Good Flow

```
1. Plugin starts:
   🔧 [CONSTRUCTOR] level: 1, xp: 0, isDeepCopy: true ✅

2. Load saved data:
   💾 [LOAD] Raw: level: 5, xp: 1000 ✅
   ✅ [LOAD] After merge: level: 5, xp: 1000, isDeepCopy: true ✅

3. Gain XP (send messages):
   (XP increases internally)

4. Auto-save triggers:
   💾 [SAVE] Current: level: 5, xp: 1150 ✅
   💾 [SAVE] Clean: level: 5, xp: 1150 ✅
   ✅ [SAVE] Saved successfully ✅

5. Reload Discord:
   💾 [LOAD] Raw: level: 5, xp: 1150 ✅
   (Progress preserved!)
```

---

## 🐛 Common Issues & Fixes

### Issue 1: No Load Messages

**Problem**: Only see constructor, no load messages
**Cause**: No saved data exists
**Fix**: This is normal for first run. Gain XP, wait for save, then reload.

### Issue 2: Raw Data is Different After Reload

**Problem**: Save shows level 5, but load shows level 1
**Cause**: Save might be failing silently
**Fix**: Check for error messages in console

### Issue 3: isDeepCopy is false

**Problem**: `isDeepCopy: false` in constructor or load
**Cause**: Deep copy fix not applied correctly
**Fix**: Verify both fixes are in the file:
- Line ~196: `JSON.parse(JSON.stringify(this.defaultSettings))`
- Line ~2502: `JSON.parse(JSON.stringify(merged))`

### Issue 4: Settings Don't Update

**Problem**: Send messages but XP doesn't increase
**Cause**: Different issue (not save/load related)
**Fix**: Check message observer is working

---

## 📝 Report Format

When reporting issues, copy the console output:

```
=== CONSTRUCTOR ===
🔧 [CONSTRUCTOR] Settings initialized...
(paste full output)

=== LOAD ===
💾 [LOAD] Raw saved data...
(paste full output)

=== SAVE ===
💾 [SAVE] Current settings...
(paste full output)
```

This will help diagnose exactly where the problem is!

---

## ✅ Next Steps

1. **Clear old data** (if you haven't):
   ```javascript
   BdApi.Data.delete('SoloLevelingStats', 'settings');
   BdApi.Data.delete('SoloLevelingStats', 'settings_backup');
   ```

2. **Reload Discord** (Ctrl+R)

3. **Watch console** for debug messages

4. **Gain XP** (send messages)

5. **Wait for save** (should see save messages)

6. **Reload Discord again**

7. **Check if progress preserved**

8. **Copy console output** and report results!

---

**The debug logging will tell us exactly what's happening!** 🔍✨

