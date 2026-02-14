# SoloLevelingStats.plugin.js — Full Audit Reference

> **File**: `plugins/SoloLevelingStats.plugin.js`
> **Lines**: 11,406 | **Version**: 2.4.0 | **Last audited**: 2026-02-14

---

## 1. FILE STRUCTURE OVERVIEW

```
Lines     Section                          Purpose
──────    ───────────────────────────────  ─────────────────────────────────────
1-148     Header & Changelog               Plugin metadata, version history
150-163   UnifiedSaveManager Loader         Crash-resistant IndexedDB loader (eval)
165-504   Constructor                       Default settings, caches, constants
506-673   Performance & Lookup Helpers      throttle/debounce, DOM cache, rank maps
675-876   Calculation Helpers               XP formula, quality bonus, time bonus
878-1101  Core Helpers                      getCurrentLevel, HP/Mana calc, getReactFiberKey, getMessageContainer
1103-1413 Event System                      on/emit, emitXP/Level/RankChanged
1415-1767 Webpack Integration               Module init, patches, React injection
1770-2039 Plugin Integration                CriticalHit agility/perception bonus sharing
2040-2119 Data Migration                    luck→perception, stats/activity safety
2122-2169 Message Input Helpers             Selector caching for message input/container
2170-2389 Message Detection                 MutationObserver, React fiber traversal, own-message detection
2391-2590 Input Monitoring                  Keydown/paste/Enter handlers with dedup
2592-2832 Message Ownership Detection       isOwnMessage (3-method cascade), timestamp, system msg check
2834-2979 Message Processing                processMessageSent: dedup, XP award, quest update, stat growth
2981-3042 Channel Change & Hash             handleChannelChange, hashString
3044-3079 Notifications & Formatting        showNotification (SLToasts fallback), escapeHtml
3085-3329 start()                           Plugin lifecycle init (250 lines)
3331-3570 stop()                            Plugin lifecycle cleanup (240 lines)
3572-3773 Settings Persistence              readFileBackup, writeFileBackup, checkBackups, restore helpers
3774-4037 loadSettings()                    3-tier candidate selection (IndexedDB > file > BdApi)
4039-4059 withAutoSave / batchModify        Auto-save wrappers
4061-4084 shareShadowXP()                   Shadow Army XP sharing
4086-4278 saveSettings()                    3-tier save (IndexedDB + BdApi.Data + file) with validation
4280-4304 createChatUiPreviewPanel()        Settings preview
4308-4833 injectSettingsCSS()               Settings panel CSS (~500 lines)
4839-5016 Activity Tracking                 Shadow power observer, activity rendering, channel visits
5018-5114 startChannelTracking()            URL change detection (popstate + History API + polling)
5120-5269 checkLevelUp()                    Level progression with stat points
5271-5392 checkRankPromotion()              Rank gate-check (level + achievements)
5394-5760 awardXP()                         Master XP calculator (~370 lines)
5762-5926 Notifications & Animations        Level-up toasts, rank-up toasts, overlay banners
5928-6194 resetLevelTo()                    Retroactive level reset with stat recalculation
6200-6438 Stats UI                          Stat buttons, rendering, listener attachment
6448-6565 Stat Allocation Aggregation       Debounced multi-stat notification
6567-6747 allocateStatPoint()               Core allocation + perception buff generation
6749-6973 Natural Stat Growth               Retroactive growth, per-message stat roll
6975-7001 renderStatBar()                   Individual stat bar template
7007-7052 Quest Rendering & Progress        renderChatQuests, updateQuestProgress
7054-7431 Quest Completion & Celebration    completeQuest, celebration modal, fonts, particles
7437-7486 Achievement Checking              checkAchievements, checkAchievementCondition
7488-7522 renderChatAchievements()          Achievement summary template
7524-8349 getAchievementDefinitions()       100+ achievements with title bonuses (~825 lines)
8351-8479 Achievement Unlocking & Titles    unlockAchievement, cleanupUnwantedTitles, setActiveTitle
8481-8567 getActiveTitleBonus()             TTL-cached title bonus lookup
8569-8585 renderAchievements()              Full achievement list template
8591-8881 Shadow Power & Shadow Buffs       updateShadowPower (5-layer fallback), getShadowArmyBuffs
8887-8970 updateHPManaBars()                HP/Mana bar UI sync
8976-9192 createChatUI / removeChatUI       Main UI lifecycle (React injection + DOM fallback)
9201-9369 renderChatUI()                    Main HTML template (~170 lines)
9371-9529 attachChatUIListeners()           Event delegation for UI interactions
9531-9856 updateChatUI()                    Real-time UI refresh with element caching (~325 lines)
9886-11406 getChatUiCssText()              Master CSS template (~1520 lines, 9 sections, 50+ keyframes)
```

---

## 2. KEY SUBSYSTEMS

### 2.1 Data Persistence (3-Tier)
| Tier | Storage | Priority | Survives |
|------|---------|----------|----------|
| 1 | IndexedDB (UnifiedSaveManager) | Highest | Reload, crash |
| 2 | BdApi.Data (localStorage) | Medium | Reload |
| 3 | File backup (JSON on disk) | Lowest | BD repair, reinstall |

- **Load**: Selects newest candidate by `_metadata.lastSave` timestamp
- **Save**: Writes to all 3 tiers + BdApi.Data backup slot
- **Intervals**: 30s periodic backup, 5s important-change save, 1s debounced save

### 2.2 Message Detection (3-Method Cascade)
1. **Webpack Patches** (preferred): `MessageStore.receiveMessage` + `MessageActions.sendMessage`
2. **Input Monitoring** (fallback with dedup): Enter keydown → 350ms fallback if store doesn't confirm
3. **MutationObserver** (DOM fallback): Watches `messagesWrapper` for new nodes, validates via React fiber

### 2.3 XP Formula (awardXP, ~370 lines)
```
Base XP = 10 + charBonus + qualityBonus + typeBonus + timeBonus + channelBonus + streakBonus
Multipliers (multiplicative chain):
  × strengthMultiplier (1 + strength × 0.02)
  × intelligenceMultiplier (tiered: 100-200: +3%, 200-400: +7%, 400+: +12%)
  × vitalityMultiplier (1 + vitality × 0.005)
  × perceptionBuff
  × skillTreeBonus
  × titleBonus
  × milestoneMultiplier (every 10 levels = +5%)
  × diminishingReturns (caps at 5.0×)
  × critMultiplier (if crit hit: 1 + 0.25 + agility×0.01 + comboBonus)
  × rankMultiplier (E:1.0 → Shadow Monarch:12.5)
  × difficultyScaling (based on XP required for level)
```

### 2.4 Event System
- **Instance events**: `on(eventName, callback)` → returns unsubscribe fn
- **DOM events**: `document.dispatchEvent(CustomEvent('SoloLevelingStats:eventName', {detail}))`
- **Events**: `xpChanged`, `levelChanged`, `rankChanged`, `statsChanged`, `shadowPowerChanged`
- **Dirty flag**: `_chatUIDirty` set in `emitXPChanged()`, consumed by 2s interval

### 2.5 Rank System
| Rank | Level Req | Achievements | XP Mult |
|------|-----------|-------------|---------|
| E | 1 | 0 | 1.0 |
| D | 10 | 2 | 1.25 |
| C | 25 | 5 | 1.5 |
| B | 50 | 10 | 1.85 |
| A | 100 | 15 | 2.25 |
| S | 200 | 20 | 2.75 |
| SS | 300 | 22 | 3.5 |
| SSS | 400 | 24 | 4.25 |
| SSS+ | 500 | 26 | 5.25 |
| NH | 700 | 28 | 6.5 |
| Monarch | 1000 | 30 | 8.0 |
| Monarch+ | 1500 | 33 | 10.0 |
| Shadow Monarch | 2000 | 35 | 12.5 |

### 2.6 Stats System
- **5 stats**: strength, agility, intelligence, vitality, perception
- **Sources**: base (allocated) + perception buffs (random) + title bonuses (%) + shadow army buffs (%)
- **Natural growth**: Scales with activity (messages, level), 5-8% chance per message
- **Perception**: Each point generates random buff for any stat (stacking)
- **Agility**: +2% crit chance per point (capped 30%), crits give 1.5× XP
- **Vitality**: +5% quest rewards, determines max HP
- **Intelligence**: Tiered XP bonus, determines max Mana
- **Strength**: +2% XP per point

---

## 3. SHARED CONSTANTS (Constructor)

| Constant | Location | Purpose |
|----------|----------|---------|
| `this.STAT_KEYS` | Line 462 | `['strength', 'agility', 'intelligence', 'vitality', 'perception']` |
| `this.UNWANTED_TITLES` | Line 463 | 7 banned titles filtered from achievements |
| `this.questData` | Lines 472-478 | Single source of truth for quest definitions |
| `this.rankData.colors` | Lines 414-428 | Rank → hex color map |
| `this.rankData.xpMultipliers` | Lines 429-443 | Rank → XP multiplier map (nerfed values) |
| `this.rankData.statPoints` | Lines 444-458 | Rank → stat points per level-up |
| `this.STAT_METADATA` | Lines 465-472 | Unified stat metadata (name, fullName, desc, longDesc, gain) |
| `this.DEFAULT_SHADOW_BUFFS` | Line 475 | Zero-initialized shadow buff object for fallback paths |
| `this._chatUIElements` | Line 477 | Cached UI element references (direct assignment, no spread) |
| `this._chatUIDirty` | Line 480 | Dirty flag for throttled UI interval |

---

## 4. EXTRACTED HELPERS (from audit)

| Helper | Line | Replaces |
|--------|------|----------|
| `getStatPointsForLevel(level)` | ~1117 | 4 inline `5 + Math.floor(level / 10)` formulas |
| `getReactFiberKey(element)` | ~1121 | 5 inline `Object.keys().find()` patterns |
| `getMessageContainer()` | ~1130 | Local closure + 2 inline querySelector chains |
| `getRankMultiplier()` | ~1113 | One-liner referencing `this.rankData.xpMultipliers` |
| `getBuffPercents(statKey, titleBonus, shadowBuffs)` | ~1098 | 3× inline title/shadow buff percentage calculations |

---

## 5. PERFORMANCE CACHES

| Cache Key | TTL | Purpose |
|-----------|-----|---------|
| `currentLevel` | 100ms | Level/XP calculation result |
| `totalPerceptionBuff` | 500ms | Sum of stacked perception buffs |
| `perceptionBuffsByStat` | 500ms | Perception buffs grouped by stat |
| `timeBonus` | 60s | Peak-hours XP bonus |
| `activityStreakBonus` | 1hr | Daily streak bonus |
| `milestoneMultiplier` | 100ms | Every-10-levels multiplier |
| `skillTreeBonuses` | 2s | SkillTree plugin bonuses |
| `activeTitleBonus` | 1s | Active title stat bonuses |
| `shadowArmyBuffs` | 2s | Shadow army stat buffs |
| `totalEffectiveStats` | 500ms | Final stat totals (base+title+shadow) |
| `xpRequiredForLevel` | Permanent | Level → XP requirement (Map, max 1000) |
| `hpCache` | Permanent | `vit_rank` → HP (Map, max 100) |
| `manaCache` | Permanent | `int` → Mana (Map, max 100) |
| `criticalHitComboData` | 500ms | CriticalHitAnimation combo data |

---

## 6. PLUGIN INTEGRATIONS

| Plugin | Integration | Data Flow |
|--------|-------------|-----------|
| **CriticalHit** | Agility crit bonus, perception crit bonus, combo data | SLS → BdApi.Data → CriticalHit reads |
| **ShadowArmy** | Shadow power display, shadow buffs, XP sharing | Bidirectional: ShadowArmy cache ↔ SLS |
| **SkillTree** | XP bonuses from unlocked nodes | SkillTree → BdApi.Data → SLS reads |
| **SoloLevelingToasts** | Animated notifications | SLS → SLToasts.showToast() |
| **LevelProgressBar** | Real-time XP/level/rank/shadow events | SLS emits → LPB subscribes (instance.on + DOM CustomEvent) |
| **UnifiedSaveManager** | Crash-resistant IndexedDB storage | SLS → USM.save/load |

---

## 7. CSS TEMPLATES (Line Budget)

| Template | Lines | Location |
|----------|-------|----------|
| `injectSettingsCSS()` | ~525 | 4308-4833 |
| `getChatUiCssText()` | ~1520 | 9886-11406 |
| **Total inline CSS** | **~2045** | **18% of file** |

---

## 8. LARGE METHODS (100+ lines)

| Method | Lines | Size | Notes |
|--------|-------|------|-------|
| `awardXP()` | 5394-5760 | ~370 | Master XP calculator, multiplicative chain |
| `updateChatUI()` | 9531-9856 | ~325 | Real-time UI refresh with caching |
| `start()` | 3085-3329 | ~245 | Plugin init lifecycle |
| `stop()` | 3331-3570 | ~240 | Plugin cleanup lifecycle |
| `resetLevelTo()` | 5928-6194 | ~267 | Level reset with retroactive recalc |
| `saveSettings()` | 4086-4278 | ~192 | 3-tier persistence |
| `allocateStatPoint()` | 6567-6747 | ~180 | Stat alloc + perception buff gen |
| `showQuestCompletionCelebration()` | 7112-7289 | ~178 | Quest modal + particles |
| `renderChatUI()` | 9221-9369 | ~149 | Main HTML template |
| `createChatUI()` | 8976-9143 | ~168 | UI lifecycle (React + DOM) |
| `attachChatUIListeners()` | 9371-9529 | ~158 | Event delegation |
| `processNaturalStatGrowth()` | 6844-6973 | ~130 | Per-message stat rolls |
| `checkRankPromotion()` | 5271-5392 | ~122 | Rank gate-check |
| `loadSettings()` | 3774-4037 | ~264 | 3-tier candidate selection |

---

## 9. COMPLETED OPTIMIZATIONS (this session)

| Phase | Task | What was done |
|-------|------|---------------|
| 1.1 | Triple updateChatUI in awardXP | Removed 2 redundant calls, kept 1 in emitXPChanged |
| 1.2 | Duplicate updateHPManaBars | Removed first call, kept second with totalStats pass |
| 1.3 | Dirty flag for 2s interval | Added `_chatUIDirty`, interval only calls when dirty |
| 2.1 | Rank multiplier maps | Unified to nerfed values in rankData.xpMultipliers |
| 2.2 | 7× stat key arrays | Extracted to `this.STAT_KEYS` |
| 2.3 | 3× unwanted titles arrays | Extracted to `this.UNWANTED_TITLES` |
| 2.4 | 4× stat points formula | Extracted to `getStatPointsForLevel()` |
| 2.5 | 2× message container lookup | Extracted to `getMessageContainer()` |
| 2.6 | 5× React fiber key pattern | Extracted to `getReactFiberKey()` |
| 3.1 | Object spread on every UI update | Changed to direct property assignment |
| Quest | 4× quest definition duplication | Unified into `this.questData` |
| Quest | 500ms DOM rebuild in celebration | Changed to targeted `data-quest-id` updates |
| 2.7 | 3× inline statDefs objects | Extracted to `this.STAT_METADATA` (constructor constant) |
| 2.8 | 3× title/shadow buff calc duplication | Extracted to `getBuffPercents(statKey, titleBonus, shadowBuffs)` |
| Const | 6× shadow buff zero-init objects | Extracted to `this.DEFAULT_SHADOW_BUFFS` (constructor constant) |
| Quest | Emoji icons in quest definitions | Removed all emojis from questData, celebration, and debug logs |

---

| Active | Active skills integration | Added `getActiveSkillBuffs()`, `consumeActiveSkillCharge()`, `getEffectiveShadowArmyBuffs()` |
| Active | Sprint XP multiplier | Multiplicative XP buff in `awardXP()` after title bonus |
| Active | Bloodlust crit bonus | Extra crit roll in `awardXP()` if base crit fails |
| Active | Mutilate guaranteed crit | Forces crit + charge consumption in `awardXP()` |
| Active | Ruler's Authority stat mult | Stacks with `_skillTreeStatMultiplier` in `awardXP()` |
| Active | Domain Expansion global mult | Final multiplicative layer in `awardXP()` after rank bonus |
| Active | Shadow Exchange quest reward | Doubles quest XP in `completeQuest()` + charge consumption |
| Active | Arise shadow buff amplifier | `getEffectiveShadowArmyBuffs()` applies multiplier to all shadow stats |
| UI | Chat UI panel default closed | Added `chatUIPanelExpanded: false`, persisted toggle state across channel switches |

---

## 10. DEFERRED ITEMS (lower priority)

_All deferred items from the original audit have been completed._

---

## 11. KNOWN ARCHITECTURE NOTES

1. **Inline CSS**: ~2045 lines (18%) of the file is CSS template literals. If the file grows further, consider extracting to a separate `.css` injected via `BdApi.DOM.addStyle`.
2. **Achievement definitions**: ~825 lines of static data. Could be moved to a JSON file loaded at startup.
3. **resetLevelTo()**: 267 lines of retroactive recalculation — only used for admin/debug resets, not normal gameplay.
4. **Memory safety**: `processedMessageIds` capped at 5000, `recentMessages` pruned at 100, `xpRequiredForLevel` capped at 1000, `hpCache`/`manaCache` capped at 100.
5. **WeakMap for DOM timestamps**: `_domNodeAddedTime` uses WeakMap so DOM nodes can be GC'd naturally.

---

## 12. PLUGIN VERIFICATION STATUS

| Plugin | Status | Verified | Notes |
|--------|--------|----------|-------|
| **SoloLevelingStats** | VERIFIED | 2026-02-14 | Active skill buff integration clean, no dupes/clashes |
| **SkillTree** | VERIFIED | 2026-02-14 | Active skills system, lore renames, CSS theme alignment, all clean |
