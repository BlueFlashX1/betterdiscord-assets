# BetterDiscord Plugin Polish & Version Update Plan

## 📋 All Plugins (11 Total)

### Current Versions & Change Assessment

| Plugin                             | Current | Changes  | New Version | Priority    |
| ---------------------------------- | ------- | -------- | ----------- | ----------- |
| **Dungeons.plugin.js**             | 3.0.0   | MASSIVE  | **4.0.0**   | 🔴 Critical |
| **ShadowArmy.plugin.js**           | 2.0.0   | MAJOR    | **3.0.0**   | 🔴 Critical |
| **SoloLevelingStats.plugin.js**    | 2.0.0   | MODERATE | **2.1.0**   | 🟡 Medium   |
| **LevelProgressBar.plugin.js**     | 1.0.0   | MODERATE | **1.1.0**   | 🟡 Medium   |
| **SoloLevelingToasts.plugin.js**   | 1.0.0   | MINOR    | **1.0.1**   | 🟢 Low      |
| **LevelUpAnimation.plugin.js**     | 1.0.0   | MINOR    | **1.0.1**   | 🟢 Low      |
| **SkillTree.plugin.js**            | 1.0.0   | MINOR    | **1.0.1**   | 🟢 Low      |
| **TitleManager.plugin.js**         | 1.0.0   | MINOR    | **1.0.1**   | 🟢 Low      |
| **CriticalHitMerged.plugin.js**    | 1.0.0   | NONE     | **1.0.0**   | ⚪ None     |
| **ShadowAriseAnimation.plugin.js** | 1.0.0   | NONE     | **1.0.0**   | ⚪ None     |
| **PixelSnake.plugin.js**           | 1.0.0   | NONE     | **1.0.0**   | ⚪ None     |

---

## 🔴 CRITICAL UPDATES

### 1. Dungeons.plugin.js → 4.0.0

**Major Changes Made**:

- ✅ Complete extraction system overhaul (queue + event-based + immediate)
- ✅ Continuous mob spawning system (dynamic with variance)
- ✅ Chunked extraction processing (50/20 batches)
- ✅ Combat interval optimization (2s → 3s)
- ✅ Memory management (aggressive cleanup)
- ✅ Toast notification cleanup (essential only)
- ✅ Console spam removal (30+ logs removed)
- ✅ Dynamic spawn rates (self-balancing)
- ✅ Extraction queue limit (500 max)
- ✅ Smart cleanup (only after extraction complete)
- ✅ 3-retry guarantee with verification
- ✅ Event-based extraction verification
- ✅ Immediate extraction in batches

**Refactoring Needs**:

- Remove commented-out code
- Add clear section markers
- Consolidate duplicate cleanup logic
- Improve function documentation
- Add version history

**Version Jump**: 3.0.0 → **4.0.0** (major system changes)

---

### 2. ShadowArmy.plugin.js → 3.0.0

**Major Changes Made**:

- ✅ Widget system refactored (disabled chatbox button)
- ✅ Member list widget persistence
- ✅ BdApi.DOM migration (injectCSS → DOM.addStyle)
- ✅ Speed optimizations (instant widget injection)
- ✅ Chatbox UI disabled (clean toolbar)
- ✅ Duplicate widget prevention
- ✅ Natural growth system improvements

**Refactoring Needs**:

- Remove commented-out widget code
- Clean up disabled button functions
- Add clear UI section markers
- Improve extraction documentation
- Add version history

**Version Jump**: 2.0.0 → **3.0.0** (major UI changes)

---

## 🟡 MEDIUM UPDATES

### 3. SoloLevelingStats.plugin.js → 2.1.0

**Moderate Changes**:

- ✅ Mana sync improvements
- ✅ Real-time mana consumption
- ✅ Integration with Dungeons

**Refactoring Needs**:

- Add section markers
- Document mana sync system
- Clean up unused code

**Version Jump**: 2.0.0 → **2.1.0** (minor feature addition)

---

### 4. LevelProgressBar.plugin.js → 1.1.0

**Moderate Changes**:

- ✅ Height reduction (padding adjustments)
- ✅ Shadow power display fixes
- ✅ Alignment improvements

**Refactoring Needs**:

- Document shadow power integration
- Clean up CSS injection
- Add clear sections

**Version Jump**: 1.0.0 → **1.1.0** (minor feature improvements)

---

## 🟢 MINOR UPDATES

### 5-8. Minor CSS Migration (→ 1.0.1)

**Plugins**:

- SoloLevelingToasts.plugin.js
- LevelUpAnimation.plugin.js
- SkillTree.plugin.js
- TitleManager.plugin.js

**Changes**:

- ✅ BdApi.DOM migration (injectCSS → DOM.addStyle)

**Refactoring Needs**:

- Minimal, just version bump
- Add migration note in changelog

**Version Jump**: 1.0.0 → **1.0.1** (bug fix/API migration)

---

## ⚪ NO CHANGES

### 9-11. Unchanged Plugins (→ 1.0.0)

**Plugins**:

- CriticalHitMerged.plugin.js
- ShadowAriseAnimation.plugin.js
- PixelSnake.plugin.js

**No changes needed**, version stays same

---

## 🔧 Refactoring Strategy

### For Each Plugin

**1. Header Documentation**:

```javascript
/**
 * @name PluginName
 * @version X.X.X
 * @description ...
 *
 * @changelog
 * vX.X.X (2025-12-04)
 * - Change 1
 * - Change 2
 */
```

**2. Section Markers**:

```javascript
// ============================================================================
// SECTION NAME
// ============================================================================
```

**3. Remove Dead Code**:

- Commented-out functions
- Unused variables
- Debug code

**4. Consistent Formatting**:

- Function documentation
- Variable naming
- Comment style

**5. Navigation Comments**:

```javascript
// SUBSECTION: Feature Name
// - Purpose
// - Integration points
```

---

## 📊 Estimated Work

| Plugin            | Lines     | Complexity | Time Estimate |
| ----------------- | --------- | ---------- | ------------- |
| Dungeons          | 6,307     | Very High  | 30-45 min     |
| ShadowArmy        | 5,611     | High       | 25-35 min     |
| SoloLevelingStats | ~2,000    | Medium     | 10-15 min     |
| LevelProgressBar  | 1,099     | Low        | 5-10 min      |
| Others (7)        | ~500 each | Very Low   | 2-5 min each  |

**Total**: ~2-3 hours of work

---

## 🎯 Implementation Plan

**Phase 1** (Most Critical):

1. Dungeons.plugin.js → 4.0.0
2. ShadowArmy.plugin.js → 3.0.0

**Phase 2** (Medium Priority): 3. SoloLevelingStats.plugin.js → 2.1.0 4. LevelProgressBar.plugin.js → 1.1.0

**Phase 3** (Quick Updates):
5-8. Minor plugins → 1.0.1
9-11. Unchanged → 1.0.0 (no changes)

---

## 🚀 Starting Phase 1

Beginning with Dungeons.plugin.js refactoring...

This will take some time - I'll work through all 11 plugins systematically!
