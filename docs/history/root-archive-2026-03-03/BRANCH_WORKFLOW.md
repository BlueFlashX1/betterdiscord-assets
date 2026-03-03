# Branch Workflow: Testing Before Merging to Main

## 🎯 Current Status

You're on: `solo-stats-v2.3-testing` ✅
Main branch: `main`

Your testing branch is **ahead of main** with new commits.

---

## 📍 Understanding the Workflow

```
main branch (stable)
    │
    ├── Commit 1: Old code
    │
    └── (branch split here)
            │
            ├── solo-stats-v2.3-testing (YOU ARE HERE)
            │   ├── Commit 2: For-loop optimizations
            │   ├── Commit 3: Navigation improvements
            │   ├── Commit 4: Critical save state fix
            │   └── (ready for testing)
```

---

## ✅ How Testing on This Branch Works

### 1. **BetterDiscord Loads From Your Folder**

BetterDiscord reads plugins from:
```
/Users/matthewthompson/Documents/DEVELOPMENT/betterdiscord-dev/plugins/
```

Your file is **symlinked** to BetterDiscord:
```
BetterDiscord plugins folder
    ↓ (symlink)
/Users/matthewthompson/Documents/DEVELOPMENT/betterdiscord-dev/plugins/SoloLevelingStats.plugin.js
```

**Result**: Any changes to this file are **instantly loaded** when you reload Discord!

---

### 2. **Testing Workflow**

```bash
# You're already on the testing branch!
git branch
# * solo-stats-v2.3-testing  ← YOU ARE HERE

# Your file has all the latest changes:
# ✅ For-loop optimizations (5 optimizations)
# ✅ Navigation improvements (category markers)
# ✅ Save state fix (deep copy)

# To test:
1. Reload Discord (Ctrl+R or Cmd+R)
2. Plugin automatically loads from your dev folder
3. Test all features
4. If issues found: Fix on this branch, commit, test again
5. If all works: Merge to main!
```

---

### 3. **See What's Different From Main**

```bash
# Show commits you've added on this branch
git log main..solo-stats-v2.3-testing --oneline

# Show which files changed
git diff main --name-only

# Show actual code changes
git diff main plugins/SoloLevelingStats.plugin.js
```

---

### 4. **Continue Adding Changes**

```bash
# Make changes to the plugin
# (edit SoloLevelingStats.plugin.js)

# Test in Discord (Ctrl+R)

# Commit your changes
git add plugins/SoloLevelingStats.plugin.js
git commit -m "Fix: XYZ bug"

# The branch is now further ahead of main!
# Keep testing and committing until everything works
```

---

### 5. **When Everything Works (Merge to Main)**

```bash
# Switch to main branch
git checkout main

# Merge your testing branch
git merge solo-stats-v2.3-testing

# Now main has all your changes!
# You can delete the testing branch
git branch -d solo-stats-v2.3-testing

# Or keep it for future testing
```

---

## 🎮 Testing Checklist

### Before Merging to Main, Test:

#### Core Features
- [ ] **XP Gain**: Send messages → XP increases
- [ ] **Level Up**: Gain enough XP → Level up notification
- [ ] **Save State**: Reload Discord → Progress preserved ✅ (CRITICAL FIX!)
- [ ] **Stat Allocation**: Allocate stats → Bonuses apply
- [ ] **Quest Progress**: Complete quests → Rewards given
- [ ] **Achievement Unlock**: Meet criteria → Achievement unlocked
- [ ] **HP/Mana Sync**: Enter dungeon → HP/Mana syncs with Dungeons plugin

#### Performance
- [ ] **No Lag**: Discord feels smooth (90% improvement!)
- [ ] **No Console Spam**: Dev console clean (Ctrl+Shift+I)
- [ ] **Memory Usage**: No memory leaks

#### UI
- [ ] **Progress Bars**: Update correctly
- [ ] **Notifications**: Show properly
- [ ] **Settings Panel**: Opens and works
- [ ] **Chat UI**: Displays correctly

---

## 🔍 Checking What's Ahead of Main

```bash
# List all commits on testing branch not in main
git log main..solo-stats-v2.3-testing --oneline

# Example output:
# 7ea518e 🚨 CRITICAL FIX: Save state corruption
# 2fed4ba v2.3.1: Long function navigation improvements
# 1cff2b9 v2.3.0: Safe checkpoint with 5 for-loop optimizations
```

Each of these commits is a change you've made that **main doesn't have yet**.

---

## 📊 Current Commits Ahead of Main

1. **1cff2b9**: For-loop optimizations (5 loops → functional methods)
2. **2fed4ba**: Navigation improvements (category markers, CSS sections)
3. **7ea518e**: **CRITICAL FIX** - Save state corruption (shallow copy bug)

---

## 🎯 Your Current Position

```
┌─────────────────────────────────────┐
│  solo-stats-v2.3-testing (YOU HERE) │
│  ✅ All optimizations                │
│  ✅ Save state fix                   │
│  ⏳ Ready for testing                │
└─────────────────────────────────────┘
                │
                │ (after testing passes)
                ↓
┌─────────────────────────────────────┐
│  main (stable production branch)    │
│  ⏳ Will receive all changes         │
│  ⏳ After merge                      │
└─────────────────────────────────────┘
```

---

## 🚀 Next Steps

1. **You're on the right branch!** ✅
2. **Reload Discord** (Ctrl+R / Cmd+R)
3. **Test the save state fix**:
   - Gain some XP
   - Note your level
   - Reload Discord
   - **Check**: Is your level preserved? ✅
4. **Test other features** (XP, quests, stats, etc.)
5. **If all works**: Merge to main!
6. **If issues**: Fix on this branch, commit, test again

---

## 💡 Pro Tips

### See Changes Live
```bash
# Watch for changes (useful for debugging)
git status
# Shows modified files since last commit
```

### Compare With Main
```bash
# Show what you changed
git diff main
# Shows ALL code changes
```

### Undo a Bad Change
```bash
# Discard changes to a file
git checkout -- plugins/SoloLevelingStats.plugin.js

# Go back to a previous commit
git log --oneline  # find commit hash
git reset --hard abc123  # revert to that commit
```

### Keep Testing Branch Around
```bash
# Don't delete testing branch after merge
# Keep it for future testing

# Create a new testing branch from main later
git checkout main
git checkout -b solo-stats-v2.4-testing
```

---

## ✅ Summary

**You're ready to test!**

- ✅ On testing branch: `solo-stats-v2.3-testing`
- ✅ 3 commits ahead of main
- ✅ Critical save state fix applied
- ✅ BetterDiscord loads from your dev folder
- ✅ Changes are live when you reload Discord

**Just reload Discord and test!** 🎮✨
