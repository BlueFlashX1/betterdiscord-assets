# Plugin Version History

**Last Updated:** 2025-12-03

---

## Version Updates Summary

| Plugin | Old Version | New Version | Change Type | Date |
|--------|-------------|-------------|-------------|------|
| **Dungeons** | 2.0.0 | **3.0.0** | MAJOR | 2025-12-03 |
| **ShadowArmy** | 1.0.2 | **2.0.0** | MAJOR | 2025-12-03 |
| **SoloLevelingStats** | 1.0.1 | **2.0.0** | MAJOR | 2025-12-03 |
| **SkillTree** | 2.0.0 | **2.0.1** | PATCH | 2025-12-03 |
| **TitleManager** | 1.0.1 | **1.0.2** | PATCH | 2025-12-03 |
| **SoloLevelingToasts** | 1.0.3 | **1.0.4** | PATCH | 2025-12-03 |

---

## Dungeons v3.0.0 (2025-12-03) 🎮

### **MAJOR UPDATE - Biome System & Extended Ranks**

#### New Features:
- ✅ **9 Themed Biomes** - Forest, Arctic, Cavern, Swamp, Mountains, Volcano, Ancient Ruins, Dark Abyss, Tribal Grounds
- ✅ **Biome-Specific Spawns** - Each biome spawns specific beast families
- ✅ **Extended Rank System** - Added NH, Monarch, Monarch+, Shadow Monarch ranks
- ✅ **Themed Names** - Dungeon and boss names reflect biome theme
- ✅ **Beast Family Classification** - 10 families (insect, beast, ice, construct, etc.)
- ✅ **Dragon Restrictions** - Dragons only spawn in NH+ dungeons
- ✅ **Rank-Based Unlocks** - Wyverns (S+), Titans (A+), Demons (B+)

#### Balance Changes:
- ⚡ **Massive Mob HP Scaling** - 10-45x increase across all ranks
- ⚡ **Boss HP Multipliers** - 4,500-9,000 HP per shadow (per biome)
- ⚡ **Mob Counts** - Up to 150,000 mobs in high-rank dungeons
- ⚡ **Shadow Targeting** - 95% mobs, 5% boss (prevents boss rush)

#### UI/UX Improvements:
- 🎨 **Responsive HP Bar** - Dynamic width calculation
- 🎨 **Multi-Line Layout** - No text truncation
- 🎨 **Guild/Channel Switching** - HP bar correctly updates
- 🎨 **Participation Status** - FIGHTING/WATCHING badges

#### Technical:
- 🔧 Biome-based dungeon generation
- 🔧 Beast family filtering system
- 🔧 Rank restriction checks
- 🔧 Improved CSS injection with fallbacks
- 🔧 Enhanced channel detection

#### Bug Fixes:
- 🐛 Fixed boss HP bar overlap with channel header
- 🐛 Fixed HP bar not showing on channel switch
- 🐛 Fixed CSS not applying reliably
- 🐛 Fixed text truncation in HP bar

---

## ShadowArmy v2.0.0 (2025-12-03) 👥

### **MAJOR UPDATE - Magic Beast System & Auto-Progression**

#### New Shadow Types:
- ✅ **10 New Magic Beasts** - Orc, Naga, Titan, Giant, Elf, Demon, Ghoul, Ogre, Centipede, Yeti
- ✅ **Total: 26 Shadow Types** - 18 magic beasts + 8 humanoids
- ✅ **Beast Family Classification** - 10 families for biome-specific spawning

#### Extraction System:
- ✅ **100% Magic Beasts from Dungeons** - No more humanoids from dungeons
- ✅ **100% Humanoids from Messages** - Complete source separation
- ✅ **Biome-Specific Filtering** - Only appropriate beasts per biome
- ✅ **Rank Restrictions** - Dragons (NH+), Wyverns (S+), Titans (A+), Demons (B+)

#### Progression System:
- ✅ **Auto-Rank-Up** - Shadows automatically promote at 80% stat threshold
- ✅ **Auto-Resurrection** - Shadows resurrect automatically with mana cost
- ✅ **Resurrection Priority** - Higher-rank shadows prioritized
- ✅ **Exponential Mana Costs** - E: 10, S: 320, NH: 5,120, Shadow Monarch: 40,960

#### Growth System:
- ⚡ **Enhanced Natural Growth** - 10x base growth rate increase
- ⚡ **Combat-Time Based** - Growth during dungeon participation only
- ⚡ **Role-Weighted** - Growth favors shadow's role strengths
- ⚡ **Individual Variance** - Each shadow grows uniquely

#### Extended Ranks:
- ✅ E → D → C → B → A → S → SS → SSS → NH → Monarch → Monarch+ → Shadow Monarch

#### Technical:
- 🔧 Beast family classification system
- 🔧 Biome-based extraction filtering
- 🔧 Rank restriction checks
- 🔧 Auto-promotion algorithm
- 🔧 Mana cost calculations

#### Bug Fixes:
- 🐛 Fixed shadow base stat generation (no more user stat capping)
- 🐛 Fixed general selection (now correctly picks strongest 7)
- 🐛 Fixed natural growth showing "0h combat"

---

## SoloLevelingStats v2.0.0 (2025-12-03) 📊

### **MAJOR UPDATE - Shadow XP Share System**

#### New Features:
- ✅ **Shadow XP Share** - ALL shadows gain XP from user activities
- ✅ **Message XP Sharing** - 5% of user XP to all shadows
- ✅ **Quest XP Sharing** - 10% of user XP to all shadows
- ✅ **No XP Loss** - User keeps 100% XP (shadows get bonus)
- ✅ **Smart Notifications** - Summary only, no spam
- ✅ **Army-Wide Growth** - Even benched shadows progress

#### Share Rates:
```
Messages: 5%
Quests: 10%
Future: Achievements (15%), Dungeons (20%), Milestones (25%)
```

#### How It Works:
```
User gains XP → Calculate share percentage → Grant to ALL shadows → Show summary

Example:
- User completes quest: +5,000 XP
- User keeps: 5,000 XP (100%)
- Each shadow gains: 500 XP (10% share)
- 300 shadows = 150,000 total army XP!
```

#### Benefits:
- ✅ Passive progression for entire army
- ✅ Benched shadows still progress
- ✅ Lore-accurate (shadows linked to monarch)
- ✅ No manual shadow leveling needed
- ✅ Encourages diverse gameplay

#### Technical:
- 🔧 New method: `shareShadowXP(userXP, source)`
- 🔧 Integration with `awardXP()` and `completeQuest()`
- 🔧 Asynchronous processing (non-blocking)
- 🔧 Batch notifications (no spam)
- 🔧 Graceful error handling

---

## SkillTree v2.0.1 (2025-12-03) 🌳

### **PATCH - Code Quality Improvements**

#### Changes:
- 🧹 Console log cleanup (removed verbose debug logs)
- 📝 Code structure improvements (section headers)
- ⚡ Performance optimizations

---

## TitleManager v1.0.2 (2025-12-03) 👑

### **PATCH - Code Quality Improvements**

#### Changes:
- 🧹 Console log cleanup (removed plugin start logs)
- 📝 Code structure improvements (section headers)

---

## SoloLevelingToasts v1.0.4 (2025-12-03) 🔔

### **PATCH - Code Quality Improvements**

#### Changes:
- 📝 Code structure improvements (section headers)
- ⚡ Performance optimizations

---

## Version Numbering System

### **MAJOR.MINOR.PATCH**

**MAJOR (x.0.0):**
- Breaking changes
- Complete system overhauls
- New major features that fundamentally change functionality
- Examples: Biome system, Magic beast overhaul, Shadow XP share

**MINOR (0.x.0):**
- New features (non-breaking)
- Significant enhancements
- New mechanics that add functionality
- Examples: New shadow types, new dungeons, new stats

**PATCH (0.0.x):**
- Bug fixes
- Performance improvements
- Code cleanup
- Minor tweaks
- Examples: Console log cleanup, CSS fixes, structure improvements

---

## Current Plugin Versions (2025-12-03)

| Plugin | Version | Status | Last Updated |
|--------|---------|--------|--------------|
| Dungeons | 3.0.0 | STABLE | 2025-12-03 |
| ShadowArmy | 2.0.0 | STABLE | 2025-12-03 |
| SoloLevelingStats | 2.0.0 | STABLE | 2025-12-03 |
| SkillTree | 2.0.1 | STABLE | 2025-12-03 |
| TitleManager | 1.0.2 | STABLE | 2025-12-03 |
| SoloLevelingToasts | 1.0.4 | STABLE | 2025-12-03 |
| CriticalHitMerged | 2.0.0 | STABLE | (previous) |
| LevelProgressBar | 1.0.2 | STABLE | (previous) |
| LevelUpAnimation | 1.0.1 | STABLE | (previous) |
| ShadowAriseAnimation | 1.0.1 | STABLE | (previous) |
| PixelSnake | 1.0.0 | STABLE | (previous) |

---

## Breaking Changes

### Dungeons v3.0.0:
- ⚠️ Dungeon type names changed (Normal/Elite/etc. → Forest/Arctic/etc.)
- ⚠️ Boss HP calculations significantly changed
- ⚠️ Mob HP scaling drastically increased
- ⚠️ Extended rank system (added 4 new ranks)
- 💡 **Migration:** Restart Discord, existing dungeons will clear

### ShadowArmy v2.0.0:
- ⚠️ Dungeon extractions now 100% magic beasts (no humanoids)
- ⚠️ Shadow base stats recalculated (no user stat caps)
- ⚠️ Auto-rank-up enabled by default (manual promotion removed)
- ⚠️ Auto-resurrection consumes mana automatically
- 💡 **Migration:** Force-fix script available if needed, auto-rank-up handles progression

### SoloLevelingStats v2.0.0:
- ⚠️ Shadow XP share system active (all shadows gain XP from user)
- ⚠️ May see more shadow level-up notifications
- 💡 **Migration:** No action needed, works automatically

---

## Compatibility Matrix

| Plugin | Requires | Compatible With |
|--------|----------|-----------------|
| Dungeons v3.0.0 | ShadowArmy v2.0.0+ | SoloLevelingStats v2.0.0+ |
| ShadowArmy v2.0.0 | None | All plugins |
| SoloLevelingStats v2.0.0 | ShadowArmy v2.0.0+ | All plugins |
| SkillTree v2.0.1 | SoloLevelingStats v1.0.0+ | All plugins |
| TitleManager v1.0.2 | SoloLevelingStats v1.0.0+ | All plugins |
| SoloLevelingToasts v1.0.4 | SoloLevelingStats v1.0.0+ | All plugins |

---

## Recommended Update Order

**When updating plugins, follow this order:**

1. **ShadowArmy** (v2.0.0) - Foundation for other systems
2. **SoloLevelingStats** (v2.0.0) - Core stats and XP sharing
3. **Dungeons** (v3.0.0) - Depends on ShadowArmy v2.0.0
4. **SkillTree** (v2.0.1) - Optional, but recommended
5. **TitleManager** (v1.0.2) - Optional
6. **SoloLevelingToasts** (v1.0.4) - Optional

**Or update all at once and restart Discord!**

---

## Known Issues

### Current Session Changes:
- ✅ All major bugs fixed
- ✅ Console log spam eliminated
- ✅ Boss HP bar responsive
- ✅ Shadow stats correctly calculated
- ✅ Auto-rank-up working
- ✅ Auto-resurrection working
- ✅ Biome system working
- ✅ Shadow XP share working

### Future Improvements:
See `PLUGIN_GAP_ANALYSIS.md` for 57 identified enhancements!

---

## Rollback Instructions

### If You Need to Rollback:

**Via Git:**
```bash
cd betterdiscord-dev
git log --oneline  # Find previous commit
git checkout <commit-hash> -- plugins/
```

**Via BetterDiscord:**
1. Disable all Solo Leveling plugins
2. Replace plugin files with backups
3. Clear BetterDiscord cache
4. Re-enable plugins

**Backup Locations:**
- `plugins/backups/` - Timestamped backups
- Git history - Full version history

---

## Testing Checklist

### Before Using Updated Plugins:

**ShadowArmy v2.0.0:**
- [ ] Check that dungeon extractions give magic beasts only
- [ ] Verify shadows auto-rank-up when ready
- [ ] Confirm auto-resurrection consumes mana
- [ ] Test that dragons only spawn in NH+ dungeons

**Dungeons v3.0.0:**
- [ ] Verify biome names appear correctly
- [ ] Check boss HP bar shows correctly
- [ ] Test channel switching doesn't break HP bar
- [ ] Confirm mobs are tankier, bosses survive longer

**SoloLevelingStats v2.0.0:**
- [ ] Send message, check shadows gain 5% XP
- [ ] Complete quest, check shadows gain 10% XP
- [ ] Verify user keeps 100% XP (no loss)
- [ ] Check notification appears with summary

---

## Future Version Roadmap

### v3.1.0 - Dungeon Rewards (Planned)
- Item drop system
- Equipment system
- Loot tables per biome

### v2.1.0 - Shadow Commands (Planned)
- Direct shadow control
- Formation system
- Command interface

### v2.1.0 - Quest System Expansion (Planned)
- More quest types
- Story quests
- Quest chains

### v3.0.0 - Complete System Integration (Planned)
- Stats affect combat
- Skills affect shadows
- Full gameplay loop

---

**All plugins updated! Ready for the next phase of development!** 🚀

