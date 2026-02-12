# BetterDiscord Plugins - Code Structure

## Overview
All plugins are organized with clear section headers and logical grouping for easy navigation and maintenance.

---

## Dungeons.plugin.js (5,340 lines)

### Major Sections:

#### 1. STORAGE MANAGER (Lines 1-274)
- `DungeonStorageManager` class
- IndexedDB operations
- Database schema & migrations
- CRUD operations for dungeons

#### 2. MAIN PLUGIN CLASS (Lines 275-365)
- Constructor & default settings
- Plugin initialization

#### 3. PLUGIN LIFECYCLE (Lines 366-485)
- `start()` - Plugin activation
- `stop()` - Plugin cleanup
- Retry logic & initialization

#### 4. DATABASE INITIALIZATION (Lines 486-547)
- `initStorage()` - IndexedDB setup
- Database statistics
- Migration handling

#### 5. SETTINGS MANAGEMENT (Lines 548-565)
- `loadSettings()` - Load from localStorage
- `saveSettings()` - Persist settings

#### 6. USER STATS & RESOURCES (Lines 566-645)
- `initializeUserStats()` - HP/Mana calculation
- Shadow army scaling (HP +25/shadow, Mana +50/shadow)
- `getShadowCount()` - Army size tracking
- `recalculateUserMana()` - Dynamic mana pool

#### 7. PLUGIN INTEGRATION (Lines 646-1048)
- `loadPluginReferences()` - Load external plugins
- SoloLevelingStats integration
- ShadowArmy integration
- Toasts integration

#### 8. MESSAGE OBSERVATION (Lines 1049-1171)
- Message detection for dungeon spawns
- Observer setup & cleanup

#### 9. DUNGEON SPAWNING (Lines 1172-1413)
- `checkDungeonSpawn()` - Spawn logic
- `calculateDungeonRank()` - Rank determination
- `createDungeon()` - Dungeon creation
- Multi-dungeon support
- Shadow weight distribution

#### 10. MOB MANAGEMENT (Lines 1414-1559)
- `startMobSpawning()` - Continuous mob spawning
- `spawnMobs()` - Create mobs with stats
- Mob rank variation
- 50 mobs per 3 seconds

#### 11. USER COMBAT ACTIONS (Lines 1560-1979)
- `joinDungeon()` - User participation
- `leaveDungeon()` - Exit dungeon
- User attack mechanics
- User death handling

#### 12. COMBAT SYSTEM - Shadow Attacks (Lines 1980-2385)
- `processShadowAttacks()` - Dynamic combat
- Individual shadow cooldowns
- Random targeting (95% mobs, 5% boss)
- Behavior modifiers (aggressive/balanced/tactical)
- Damage variance & calculations

#### 13. COMBAT SYSTEM - Boss & Mob Attacks (Lines 2386-2660)
- `processBossAttacks()` - Boss AOE attacks
- `processMobAttacks()` - Mob attacks
- Auto-resurrection on death
- Damage calculations with variance

#### 14. MOB EXTRACTION (Lines 2661-2956)
- Shadow extraction from defeated mobs
- ARISE attempts for mob shadows
- Extraction animations

#### 15. RESURRECTION SYSTEM (Lines 2957-3111)
- `getResurrectionCost()` - Rank-based mana costs
- `getResurrectionPriority()` - Priority system
- `attemptAutoResurrection()` - Auto-revive logic
- Manual revive system

#### 16. DUNGEON COMPLETION (Lines 3112-3261)
- `completeDungeon()` - End dungeon
- XP distribution (user + shadows)
- Combat-based natural growth
- Cleanup logic

#### 17. NOTIFICATION SYSTEM (Lines 3262-3338)
- `showDungeonCompletionSummary()` - Batched toasts
- 3-batch notification system
- Stats aggregation

#### 18. ARISE EXTRACTION (Lines 3339-3655)
- `showAriseButton()` - UI button
- `attemptBossExtraction()` - Boss shadow extraction
- `showAriseSuccessAnimation()` - Success animation
- `showAriseFailAnimation()` - Fail animation
- 3 extraction attempts per boss

#### 19. DAMAGE CALCULATIONS (Lines 3656-3820)
- `calculateDamage()` - Stat-based damage
- `calculateHP()` - HP from vitality
- Defense reduction formulas

#### 20. BOSS HP BAR (Lines 3821-4212)
- `updateBossHPBar()` - Real-time HP display
- Multi-line responsive layout
- Mob counter integration
- Channel detection & switching
- Members list detection for width

#### 21. VISUAL INDICATORS (Lines 4213-4243)
- Dungeon channel indicators
- Indicator management

#### 22. CHANNEL WATCHING (Lines 4244-4698)
- Channel switch detection
- URL monitoring
- HP bar updates on channel change
- 500ms detection frequency

#### 23. MOB KILL NOTIFICATIONS (Lines 4699-4750)
- Periodic kill count notifications
- Notification throttling

#### 24. DUNGEON UI MODAL (Lines 4751-4908)
- Active dungeons list
- Join/leave buttons
- Real-time updates

#### 25. TOAST SYSTEM (Lines 4909-5068)
- Toast notifications
- Fallback toast system
- Type-based styling

#### 26. CSS INJECTION (Lines 5069-5369)
- `injectCSS()` - Style injection
- `removeCSS()` - Cleanup
- Boss HP bar styles
- Animation keyframes
- Responsive design

#### 27. SETTINGS PANEL (Lines 5370-5524)
- Configuration UI
- Settings management

---

## ShadowArmy.plugin.js (4,649 lines)

### Major Sections:

#### 1. STORAGE MANAGER (Lines 1-775)
- `ShadowStorageManager` class
- IndexedDB operations
- Shadow CRUD operations
- Pagination & filtering
- Aggregation & statistics

#### 2. MAIN PLUGIN CLASS (Lines 776-1024)
- Constructor & default settings
- Shadow ranks & roles configuration
- Stat weight definitions
- Extraction config

#### 3. PLUGIN LIFECYCLE (Lines 1025-1155)
- `start()` - Plugin activation
- `stop()` - Plugin cleanup
- Storage initialization
- Plugin integrations

#### 4. SETTINGS & STORAGE (Lines 1156-1300)
- `loadSettings()` - Load config
- `saveSettings()` - Save config
- User ID retrieval
- Migration logic

#### 5. MESSAGE OBSERVATION (Lines 1301-1560)
- Message detection for XP
- Observer setup
- Extraction events

#### 6. EXTRACTION PROBABILITY (Lines 1561-1989)
- `determineExtractableRanks()` - Rank restrictions
- `calculateRankProbabilities()` - Probability distribution
- `calculateExtractionChance()` - Success calculation
- Rank limits enforcement

#### 7. SHADOW GENERATION & STATS (Lines 1990-2445)
- `generateShadow()` - Create shadow
- Role selection (weighted random)
- Rank-based stat generation
- No user stat caps

#### 8. BASE STATS CALCULATION (Lines 2446-2582)
- `generateShadowBaseStats()` - Rank baselines
- Role specialization (10x+ differences)
- Variance application
- Exponential scaling

#### 9. STAT CALCULATION UTILITIES (Lines 2583-2834)
- `getShadowEffectiveStats()` - Total stats
- `calculateShadowStrength()` - Power calculation
- `getRankBaselineStats()` - Rank baselines

#### 10. XP & LEVELING SYSTEM (Lines 2835-2970)
- `grantShadowXP()` - XP distribution
- Level-up loops
- Stat application
- Auto rank-up trigger

#### 11. AUTO RANK-UP SYSTEM (Lines 2971-3047)
- `attemptAutoRankUp()` - Promotion logic
- 80% stat threshold
- Level/XP reset on promotion
- Strength recalculation

#### 12. NATURAL GROWTH SYSTEM (Lines 3048-3151)
- `applyNaturalGrowth()` - Combat growth
- Role-weighted growth
- Individual variance
- Combat time tracking

#### 13. LEVEL-UP STATS (Lines 3152-3239)
- `applyShadowLevelUpStats()` - Stat gains
- Role-weighted deltas
- Individual variance
- Per-level randomness

#### 14. BUFF SYSTEM (Lines 3240-2833)
- `getTopGenerals()` - Auto-select 7 strongest
- `calculateTotalBuffs()` - Buff calculation
- Stat distribution

#### 15. MIGRATIONS (Lines 3234-3534)
- Base stats fixing
- Shadow recalculation
- Batch processing

#### 16. UI COMPONENTS (Lines 3535-4574)
- `createShadowArmyButton()` - Toolbar button
- `openShadowArmyUI()` - Main modal
- Shadow list rendering
- Real-time updates
- Filters & sorting
- Generals display

#### 17. SETTINGS PANEL (Lines 4575-4649)
- Configuration UI
- Extraction settings

---

## SoloLevelingStats.plugin.js (7,876 lines)

### Major Sections:

#### Key Features:
- Player stats & leveling
- XP from messages
- Skill points & allocation
- Stat buffs & calculations
- Chat UI integration
- Database storage

---

## SkillTree.plugin.js (1,770 lines)

### Major Sections:

#### Key Features:
- Skill tree UI
- Skill unlocking
- Skill point management
- Tree navigation
- Visual skill connections

---

## Supporting Plugins

### SoloLevelingToasts.plugin.js
- Toast notification system
- Type-based styling
- Animation system

### TitleManager.plugin.js
- Title management
- Title display
- Title unlocking

### LevelProgressBar.plugin.js
- Visual XP progress bar
- Level display

### LevelUpAnimation.plugin.js
- Level-up animations
- Visual effects

### CriticalHitMerged.plugin.js
- Critical hit system
- Damage multipliers
- Visual effects

---

## Code Organization Principles

### Section Headers:
```javascript
// ================================================================================
// MAJOR SECTION NAME
// ================================================================================
```

### Subsections:
```javascript
// ============================================================================
// Subsection Name - Description
// ============================================================================
```

### Function Documentation:
```javascript
/**
 * Function name and purpose
 * 
 * Operations:
 * 1. Step one
 * 2. Step two
 * 3. Step three
 * 
 * @param {type} param - Description
 * @returns {type} Description
 */
```

### Benefits:
- ✅ Easy navigation in large files
- ✅ Clear separation of concerns
- ✅ Quick function finding
- ✅ Better maintainability
- ✅ Self-documenting code structure

---

## File Size Summary

| Plugin | Lines | Sections | Complexity |
|--------|-------|----------|------------|
| Dungeons | 5,340 | 27 major | High |
| ShadowArmy | 4,649 | 17 major | High |
| SoloLevelingStats | 7,876 | 15+ major | Very High |
| SkillTree | 1,770 | 8 major | Medium |
| CriticalHitMerged | 8,917 | 12 major | Very High |
| Others | < 1,500 | 5-8 major | Low-Medium |

---

## Navigation Tips

### Find Sections:
```
Search for: "// =====" to find major sections
Search for: "// ====== SECTION NAME" to find specific section
```

### Find Functions:
```
Search for: "async functionName" or "functionName()"
Look at section headers to know where to find functionality
```

### Understand Flow:
```
1. Read section header comments
2. Read function operation lists
3. Read inline code comments
4. Follow logical flow
```

---

**All plugins now have professional, well-structured code organization!**
