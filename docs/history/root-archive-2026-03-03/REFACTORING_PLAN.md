# SoloLevelingStats Code Refactoring Plan

## 🎯 Goal: Clean 4-Section Structure

### **Target Structure:**

```javascript
/**
 * Header & Metadata
 */

module.exports = class SoloLevelingStats {
  // ============================================================================
  // SECTION 1: IMPORTS & DEPENDENCIES
  // ============================================================================
  // - BdApi references
  // - External library imports
  // - Plugin dependencies (ShadowArmy, etc.)
  // ============================================================================
  // SECTION 2: CONFIGURATION & HELPERS
  // ============================================================================
  // 2.1 Constructor & Default Settings
  // 2.2 Performance Optimization System (DOM cache, throttle, debounce)
  // 2.3 Lookup Maps & Dictionaries (ranks, quests, achievements)
  // 2.4 Helper Functions (utilities, calculations, formatters)
  // 2.5 Event System (listeners, emitters)
  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================
  // 3.1 Plugin Lifecycle (start, stop)
  // 3.2 Settings Management (load, save, panel)
  // 3.3 Activity Tracking (messages, channels, time)
  // 3.4 XP & Leveling System (gain XP, level up, rank up)
  // 3.5 Stats System (allocate, calculate, display)
  // 3.6 Quest System (daily quests, progress, rewards)
  // 3.7 Achievement System (unlock, track, display)
  // 3.8 HP/Mana System (bars, regeneration, sync)
  // 3.9 UI Management (panels, modals, widgets)
  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT (OFF BY DEFAULT)
  // ============================================================================
  // 4.1 Debug Logging System
  // 4.2 Performance Monitoring
  // 4.3 Error Tracking
  // 4.4 Debug Panel UI
};
```

---

## 📋 Current Code Organization (Messy)

**Current Issues:**

- Helper functions scattered throughout 8,248 lines
- No clear separation between config and operations
- Debug code mixed with production code
- Hard to find specific functionality
- Difficult to maintain

**Current Structure:**

```
Line 1-44:     Header & metadata ✅
Line 45-???:   Constructor (HUGE, mixed config/helpers)
Line ???-???:  Helper functions (scattered everywhere)
Line ???-???:  Major operations (mixed with helpers)
Line ???-???:  Debug code (scattered, always enabled)
Line ???-???:  UI code (mixed throughout)
```

---

## 🔄 Refactoring Steps

### **Step 1: Extract Configuration**

Move from constructor to clean config section:

- Default settings
- Rank data (colors, XP, multipliers)
- Quest data (names, icons, rewards)
- Achievement definitions
- UI configuration

### **Step 2: Extract Helper Functions**

Group related helpers:

- **Math/Calculation**: XP formulas, stat calculations
- **Formatting**: Numbers, time, percentages
- **Validation**: Input checks, bounds
- **Utilities**: Array manipulation, object helpers
- **Performance**: Throttle, debounce, cache

### **Step 3: Organize Major Operations**

Group by functionality:

- **Lifecycle**: start, stop, initialize
- **Settings**: load, save, panel
- **Tracking**: messages, channels, activity
- **Progression**: XP, level, rank
- **Systems**: stats, quests, achievements
- **UI**: panels, widgets, modals

### **Step 4: Isolate Debugging**

Move to separate section:

- Debug logging
- Performance tracking
- Error reporting
- Development tools

---

## 📝 Refactoring Template

```javascript
/**
 * @name SoloLevelingStats
 * @version 2.3.0
 * [metadata...]
 */

module.exports = class SoloLevelingStats {
  // ============================================================================
  // SECTION 1: IMPORTS & DEPENDENCIES
  // ============================================================================

  // (None currently, but reserved for future use)

  // ============================================================================
  // SECTION 2: CONFIGURATION & HELPERS
  // ============================================================================

  constructor() {
    // 2.1 Default Settings
    this.defaultSettings = {
      enabled: true,
      stats: { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 },
      level: 1,
      xp: 0,
      rank: 'E',
      // ... all default settings
    };

    // 2.2 Performance Optimization
    this.domCache = {
      /* ... */
    };
    this.throttled = {};
    this.debounced = {};

    // 2.3 Lookup Maps
    this.rankData = {
      /* ... */
    };
    this.questData = {
      /* ... */
    };
    this.achievementData = {
      /* ... */
    };

    // 2.4 State Management
    this.settings = this.defaultSettings;
    this.processedMessageIds = new Set();
    // ... all state variables

    // 2.5 Event System
    this.eventListeners = {
      /* ... */
    };

    // 2.6 Debug System (OFF by default)
    this.debug = { enabled: false /* ... */ };
  }

  // 2.7 Performance Helpers
  throttle(func, wait) {
    /* ... */
  }
  debounce(func, wait) {
    /* ... */
  }
  initDOMCache() {
    /* ... */
  }
  getCachedElement(key) {
    /* ... */
  }

  // 2.8 Lookup Helpers
  getRankColor(rank) {
    /* ... */
  }
  getRankXPMultiplier(rank) {
    /* ... */
  }
  getQuestData(questType) {
    /* ... */
  }

  // 2.9 Calculation Helpers
  calculateXPForLevel(level) {
    /* ... */
  }
  calculateStatBonuses() {
    /* ... */
  }
  calculateHP() {
    /* ... */
  }
  calculateMana() {
    /* ... */
  }

  // 2.10 Formatting Helpers
  formatNumber(num) {
    /* ... */
  }
  formatTime(seconds) {
    /* ... */
  }
  formatPercentage(value) {
    /* ... */
  }

  // 2.11 Validation Helpers
  validateRank(rank) {
    /* ... */
  }
  validateLevel(level) {
    /* ... */
  }

  // 2.12 Utility Helpers
  clamp(value, min, max) {
    /* ... */
  }
  randomInRange(min, max) {
    /* ... */
  }

  // 2.13 Event Helpers
  emit(event, data) {
    /* ... */
  }
  on(event, callback) {
    /* ... */
  }
  off(event, callback) {
    /* ... */
  }

  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================

  // 3.1 Plugin Lifecycle
  start() {
    /* ... */
  }
  stop() {
    /* ... */
  }

  // 3.2 Settings Management
  loadSettings() {
    /* ... */
  }
  saveSettings() {
    /* ... */
  }
  getSettingsPanel() {
    /* ... */
  }

  // 3.3 Activity Tracking
  setupMessageTracking() {
    /* ... */
  }
  trackMessage(message) {
    /* ... */
  }
  trackChannel(channelId) {
    /* ... */
  }
  trackActivity() {
    /* ... */
  }

  // 3.4 XP & Leveling
  grantXP(amount, source) {
    /* ... */
  }
  checkLevelUp() {
    /* ... */
  }
  levelUp() {
    /* ... */
  }
  checkRankUp() {
    /* ... */
  }
  rankUp() {
    /* ... */
  }

  // 3.5 Stats System
  allocateStatPoint(stat) {
    /* ... */
  }
  recalculateStats() {
    /* ... */
  }
  displayStats() {
    /* ... */
  }

  // 3.6 Quest System
  checkDailyQuests() {
    /* ... */
  }
  updateQuestProgress(questType, amount) {
    /* ... */
  }
  completeQuest(questType) {
    /* ... */
  }
  resetDailyQuests() {
    /* ... */
  }

  // 3.7 Achievement System
  checkAchievements() {
    /* ... */
  }
  unlockAchievement(achievementId) {
    /* ... */
  }
  displayAchievements() {
    /* ... */
  }

  // 3.8 HP/Mana System
  updateUserHPBar() {
    /* ... */
  }
  updateManaBar() {
    /* ... */
  }
  regenerateHP() {
    /* ... */
  }
  regenerateMana() {
    /* ... */
  }
  syncWithDungeons() {
    /* ... */
  }

  // 3.9 UI Management
  createStatsPanel() {
    /* ... */
  }
  updateStatsDisplay() {
    /* ... */
  }
  createQuestPanel() {
    /* ... */
  }
  updateQuestDisplay() {
    /* ... */
  }
  showLevelUpModal() {
    /* ... */
  }
  showRankUpModal() {
    /* ... */
  }

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT (OFF BY DEFAULT)
  // ============================================================================

  // 4.1 Debug Logging
  debugLog(operation, message, data) {
    /* ... */
  }
  debugError(operation, error, context) {
    /* ... */
  }

  // 4.2 Performance Monitoring
  trackPerformance(operation, func) {
    /* ... */
  }
  getPerformanceReport() {
    /* ... */
  }

  // 4.3 Error Tracking
  logError(error, context) {
    /* ... */
  }
  getErrorReport() {
    /* ... */
  }

  // 4.4 Debug Panel
  createDebugPanel() {
    /* ... */
  }
  updateDebugDisplay() {
    /* ... */
  }
};
```

---

## ✅ Benefits of New Structure

1. **Easy Navigation**: Jump to section by number
2. **Clear Separation**: Config vs Operations vs Debug
3. **Better Maintenance**: Find code quickly
4. **Performance**: Debug code isolated (off by default)
5. **Scalability**: Easy to add new features
6. **Readability**: Logical grouping

---

## 🚀 Implementation Plan

### **Phase 1: Prepare**

- [x] Create backup
- [x] Document current structure
- [ ] Identify all functions
- [ ] Map dependencies

### **Phase 2: Reorganize Constructor**

- [ ] Extract settings to clean object
- [ ] Extract lookup maps
- [ ] Keep initialization minimal
- [ ] Move helpers to Section 2

### **Phase 3: Extract Helpers**

- [ ] Move calculation functions
- [ ] Move formatting functions
- [ ] Move validation functions
- [ ] Move utility functions
- [ ] Group by purpose

### **Phase 4: Organize Operations**

- [ ] Group lifecycle methods
- [ ] Group tracking methods
- [ ] Group progression methods
- [ ] Group system methods
- [ ] Group UI methods

### **Phase 5: Isolate Debugging**

- [ ] Move debug logging
- [ ] Move performance tracking
- [ ] Move error handling
- [ ] Disable by default

### **Phase 6: Test & Verify**

- [ ] Load plugin
- [ ] Test all features
- [ ] Check performance
- [ ] Verify no errors

---

## 📊 Expected Results

**Before:**

```
8,248 lines
Scattered organization
Hard to navigate
Mixed concerns
```

**After:**

```
8,248 lines (same functionality)
4 clear sections
Easy to navigate
Separated concerns
```

**No breaking changes, just better organization! 🎉**
