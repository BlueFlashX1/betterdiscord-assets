# Solo Leveling BetterDiscord Suite

A comprehensive BetterDiscord plugin and theme suite inspired by the Solo Leveling manhwa, featuring RPG-style progression, achievements, skill trees, and immersive visual effects.

## Download Assets

### Required Files

**Plugins (7 files):**
- `SoloLevelingStats.plugin.js` - Core stats system (REQUIRED)
- `CriticalHit.plugin.js` - Critical hit effects
- `SkillTree.plugin.js` - Skill tree system
- `TitleManager.plugin.js` - Title management
- `LevelProgressBar.plugin.js` - Progress bar UI
- `SoloLevelingToasts.plugin.js` - Toast notifications
- `LevelUpAnimation.plugin.js` - Level up animation

**Theme (1 file):**
- `SoloLeveling-ClearVision.theme.css` - Dark purple Solo Leveling theme

**Optional Assets:**
- `shadows-army-solo-leveling.gif` - Solo Leveling Shadow Army animated background
- `shadows-army-solo-leveling-imgur.gif` - Alternative version hosted on Imgur

### How to Download

1. **From GitHub Repository:**
   - Navigate to: `https://github.com/BlueFlashX1/betterdiscord-assets`
   - Click "Code" → "Download ZIP"
   - Extract the ZIP file
   - Navigate to `plugins/` folder for plugin files
   - Navigate to `themes/` folder for theme file

2. **Individual File Download:**
   - Click on each `.plugin.js` file in the `plugins/` folder
   - Click "Raw" button to download directly
   - Click on `SoloLeveling-ClearVision.theme.css` in the `themes/` folder
   - Click "Raw" button to download directly

### File Checklist

Before installation, ensure you have:
- [ ] All 7 plugin files (`.plugin.js` extension)
- [ ] 1 theme file (`SoloLeveling-ClearVision.theme.css`)
- [ ] BetterDiscord installed and enabled

## Installation

### Prerequisites

- BetterDiscord must be installed and enabled
- Discord desktop app (not browser version)

### Step-by-Step Installation

1. **Locate BetterDiscord folders:**
   - macOS: `~/Library/Application Support/BetterDiscord/`
   - Windows: `%AppData%\BetterDiscord\`
   - Linux: `~/.config/BetterDiscord/`

2. **Install plugins:**
   - Copy all `.plugin.js` files from `plugins/` folder
   - Paste into `BetterDiscord/plugins/` folder

3. **Install theme:**
   - Copy `SoloLeveling-ClearVision.theme.css` from `themes/` folder
   - Paste into `BetterDiscord/themes/` folder

4. **Enable in Discord:**
   - Press `Ctrl+R` (Windows/Linux) or `Cmd+R` (macOS) to reload Discord
   - Open Discord Settings → BetterDiscord → Plugins
   - Enable all Solo Leveling plugins
   - Open Discord Settings → BetterDiscord → Themes
   - Enable `SoloLeveling-ClearVision` theme

### Quick Install (macOS Terminal)

```bash
# Navigate to repository
cd /path/to/betterdiscord-dev

# Copy plugins
cp plugins/*.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/

# Copy theme
cp themes/SoloLeveling-ClearVision.theme.css ~/Library/Application\ Support/BetterDiscord/themes/

# Reload Discord (Ctrl+R or Cmd+R)
```

## Core Plugins

### SoloLevelingStats
Foundation plugin that tracks Discord activity and rewards progression.

- **Level System:** Gain XP from messages, level up, unlock stat points
- **Stat System:** 5 stats (STR, AGI, INT, VIT, LUK) with unique bonuses
  - Strength: +5% XP per message per point (max 20)
  - Agility: +2% crit chance per point (max 20, capped at 90%)
  - Intelligence: +10% bonus XP from long messages per point (max 20)
  - Vitality: +5% daily quest rewards per point (max 20)
  - Luck: Random % buffs that stack (2-8% per point, max 20)
- **Rank System:** E → D → C → B → A → S → SS → SSS → SSS+ → NH → Monarch → Monarch+ → Shadow Monarch
- **Daily Quests:** 5 quests reset daily with XP and stat point rewards
- **Achievements:** 20+ Solo Leveling-themed achievements with titles
- **Activity Tracking:** Messages, characters typed, channels visited, time active
- **Chat UI:** In-game style panel showing stats, level, XP, quests

**Dependencies:** None

### CriticalHit
Visual effects plugin where messages have a chance to land critical hits.

- **Base Crit Chance:** 10% (fixed, buffed by Agility stat)
- **Agility Integration:** +2% crit chance per Agility point (max 90%)
- **Skill Tree Integration:** Crit bonuses from unlocked skills
- **Visual Effects:** Purple-to-black gradient, Bebas Neue font, glow, animations
- **Message Persistence:** Crits persist across channel changes and restarts
- **Smart Filtering:** Excludes replies, system messages, bots (configurable)
- **History System:** Stores crit history for 30 days

**Dependencies:** SoloLevelingStats, SkillTree

### SkillTree
Passive abilities system to unlock powerful skills.

- **5 Skill Branches:** Strength, Agility, Intelligence, Vitality, Luck
- **25 Total Skills:** 5 skills per branch with progressive unlocks
- **Skill Points:** Earn 1 SP per level (level 1 = 0 SP, level 2 = 1 SP)
- **Skill Effects:** XP bonuses, crit chance bonuses, quest rewards, all-stat bonuses
- **Prerequisites:** Stat requirements and prerequisite skills
- **Reset Function:** Reset tree and recalculate SP based on current level
- **Visual UI:** Modal with skill tree visualization

**Dependencies:** SoloLevelingStats

### TitleManager
Title system to display and equip achievement titles.

- **Title Collection:** View all unlocked titles from achievements
- **Equip Titles:** Equip one title at a time for XP bonuses
- **Title Bonuses:** Varied XP bonuses (3% to 50% depending on achievement)
- **Visual UI:** Modal showing active title, available titles, bonuses
- **Solo Leveling Lore:** All titles themed after Solo Leveling

**Dependencies:** SoloLevelingStats

## Visual Enhancement Plugins

### LevelProgressBar
Always-visible progress bar showing level progress.

- Position: Top or bottom of Discord window
- Display: Level, Rank, XP, progress bar
- Compact Mode: Smaller bar option
- Opacity: 0-100% control
- Updates: Every second

**Dependencies:** SoloLevelingStats

### SoloLevelingToasts
Custom toast notifications for events.

- Purple gradient matching theme
- Particle effects (default: 20 particles)
- Position control (4 corners)
- Auto-dismiss (default: 5 seconds)
- Max toasts limit (default: 5)

**Dependencies:** SoloLevelingStats

### LevelUpAnimation
Floating "LEVEL UP!" animation on level up.

- Floating animation with fade
- Particle effects (30 particles, configurable)
- Purple glow matching theme
- Customizable duration, distance, particle count, font size

**Dependencies:** SoloLevelingStats

## Theme

### SoloLeveling-ClearVision
Dark purple Solo Leveling theme based on ClearVision v7.

- Dark purple/black color scheme
- Solo Leveling aesthetic matching manhwa art style
- Orbitron font family throughout
- Custom styling: Message containers, embeds, sidebar, status indicators
- Performance optimized: Removed expensive blur effects

**Font Stack:** `'Orbitron', sans-serif` (weight 400-500)

## Plugin Integration

```
SoloLevelingStats (Core)
├── CriticalHit (reads Agility stat)
├── SkillTree (reads stats, saves bonuses)
├── TitleManager (reads titles/achievements)
├── LevelProgressBar (reads level/XP)
├── SoloLevelingToasts (hooks into events)
└── LevelUpAnimation (detects level ups)
```

## Achievement System

**Early Game Titles:**
- The Weakest Hunter (+3% XP)
- E-Rank Hunter (+8% XP)
- D-Rank Hunter (+12% XP)
- C-Rank Hunter (+18% XP)
- B-Rank Hunter (+25% XP)
- A-Rank Hunter (+32% XP)
- S-Rank Hunter (+40% XP)

**Special Titles:**
- Shadow Extraction (+15% XP)
- Domain Expansion (+22% XP)
- Ruler's Authority (+30% XP)
- The Awakened (+10% XP)
- Shadow Army Commander (+20% XP)
- Necromancer (+28% XP)
- National Level Hunter (+35% XP)
- Monarch Candidate (+42% XP)
- Shadow Monarch (+38% XP)
- Monarch of Destruction (+45% XP)
- The Ruler (+50% XP)

**Activity Titles:** Dungeon Grinder, Gate Explorer, Raid Veteran, Eternal Hunter, Gate Traveler, Dungeon Master, Dimension Walker, Realm Conqueror

## Skill Tree System

**Strength Branch:** Power Strike → Mighty Blow → Devastating Force, Armor Break (side), Berserker Rage (ultimate)

**Agility Branch:** Quick Reflexes → Lightning Speed → Blinding Speed, Shadow Step (side), Transcendent Speed (ultimate)

**Intelligence Branch:** Mental Clarity → Genius Mind → Master Strategist, Tactical Analysis (side), Omniscient Mind (ultimate)

**Vitality Branch:** Robust Health → Iron Will → Immortal Body, Regeneration (side), Eternal Vitality (ultimate)

**Luck Branch:** Lucky Break → Fortune's Favor → Divine Luck, Serendipity (side), Fate's Blessing (ultimate)

## Configuration

**CriticalHit:** Enable/disable crits, gradient, animation, glow, font, filtering, history retention

**SkillTree:** Enable/disable, view skill points, view unlocked skills, reset tree

**TitleManager:** Enable/disable, view titles, equip/unequip titles

**SoloLevelingStats:** Enable/disable tracking, allocate stat points, view achievements, view daily quests, chat UI toggle

## Quick Start

1. Install BetterDiscord (if not installed)
2. Copy plugins to BetterDiscord plugins folder
3. Copy theme to BetterDiscord themes folder
4. Reload Discord (Ctrl+R / Cmd+R)
5. Enable plugins in BetterDiscord settings
6. Enable theme in BetterDiscord themes
7. Start chatting - XP and stats track automatically

## Tips & Tricks

- **Maximize XP:** Type longer messages (200+ chars), complete daily quests
- **Increase Crit Chance:** Level up Agility stat (max 90% with stats + skills)
- **Unlock Skills:** Meet stat requirements, spend skill points wisely
- **Equip Titles:** Higher-tier titles give better XP bonuses
- **Complete Quests:** Daily quests reset at midnight, give stat points
- **Track Progress:** Use LevelProgressBar to always see your level

## Troubleshooting

**Plugins not loading?**
- Verify BetterDiscord is installed and enabled
- Check files are in correct directories
- Check console for errors (Ctrl+Shift+I / Cmd+Option+I)

**Stats not tracking?**
- Ensure SoloLevelingStats plugin is enabled
- Verify you're sending messages (not just reading)
- Check chat UI is visible (toggle in settings)

**Crits not appearing?**
- Verify CriticalHit plugin is enabled
- Check SoloLevelingStats is running (for Agility bonuses)
- Verify message filters aren't excluding your messages

**Skills not unlocking?**
- Check stat requirements are met
- Verify prerequisite skills are unlocked
- Ensure you have enough skill points

## File Structure

```
betterdiscord-dev/
├── plugins/
│   ├── SoloLevelingStats.plugin.js
│   ├── CriticalHit.plugin.js
│   ├── SkillTree.plugin.js
│   ├── TitleManager.plugin.js
│   ├── LevelProgressBar.plugin.js
│   ├── SoloLevelingToasts.plugin.js
│   └── LevelUpAnimation.plugin.js
├── themes/
│   └── SoloLeveling-ClearVision.theme.css
└── README.md
```

## License

All plugins and themes are for personal use. Based on Solo Leveling manhwa by Chugong.

## Author

Matthew - Solo Leveling BetterDiscord Suite Developer

## Version History

- **v1.0.0** (2025-11-30): Initial release with core stats system, critical hit system, skill tree system, title management, visual enhancements, and Solo Leveling theme

## Additional Resources

- Plugin Ideas: `plugins/docs/PLUGIN_IDEAS.md`
- Solo Leveling Stats Docs: `plugins/docs/SOLO-LEVELING-STATS-README.md`
