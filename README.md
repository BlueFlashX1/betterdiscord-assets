# Solo Leveling BetterDiscord Suite

A comprehensive BetterDiscord plugin and theme suite inspired by the Solo Leveling manhwa, featuring RPG-style progression, achievements, skill trees, and immersive visual effects.

## Assets

This repository hosts animated background assets:
- `shadows-army-solo-leveling.gif` - Solo Leveling Shadow Army animated background
- `shadows-army-solo-leveling-imgur.gif` - Alternative version hosted on Imgur

## Installation

### Quick Install
```bash
# Copy plugins to BetterDiscord
cp plugins/*.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/

# Copy theme to BetterDiscord
cp themes/SoloLeveling-ClearVision.theme.css ~/Library/Application\ Support/BetterDiscord/themes/
```

### Manual Install
1. Copy plugin files from `plugins/` to `~/Library/Application Support/BetterDiscord/plugins/`
2. Copy theme file from `themes/` to `~/Library/Application Support/BetterDiscord/themes/`
3. Reload Discord (Ctrl+R / Cmd+R)
4. Enable plugins and theme in BetterDiscord settings

## Core Plugins

### SoloLevelingStats
The foundation plugin that tracks Discord activity and rewards progression.

**Features:**
- Level System: Gain XP from messages, level up, unlock stat points
- Stat System: 5 stats (STR, AGI, INT, VIT, LUK) with unique bonuses
  - Strength: +5% XP per message per point (max 20 points)
  - Agility: +2% crit chance per point (max 20 points, capped at 90%)
  - Intelligence: +10% bonus XP from long messages per point (max 20 points)
  - Vitality: +5% daily quest rewards per point (max 20 points)
  - Luck: Random % buffs that stack (2-8% per point, max 20 points)
- Rank System: E → D → C → B → A → S → National Level progression
- Daily Quests: 5 quests reset daily with XP and stat point rewards
- Achievements: 20+ Solo Leveling-themed achievements with titles
- Activity Tracking: Messages, characters typed, channels visited, time active
- Chat UI: In-game style panel showing stats, level, XP, quests

**Dependencies:** None (standalone)

### CriticalHit
Visual effects plugin where messages have a chance to land critical hits with special styling.

**Features:**
- Base Crit Chance: 10% (fixed, cannot be changed manually)
- Agility Integration: Crit chance increases with Agility stat (+2% per point, max 90%)
- Skill Tree Integration: Crit chance bonuses from unlocked skills
- Visual Effects:
  - Purple-to-black horizontal gradient text
  - Bebas Neue font (bold, condensed, all-caps)
  - Subtle glow effect
  - Smooth animations
- Message Persistence: Crits persist across channel changes and Discord restarts
- Smart Filtering: Excludes replies, system messages, bots (configurable)
- History System: Stores crit history for 30 days (configurable)

**Dependencies:** SoloLevelingStats (for Agility stat bonuses), SkillTree (for skill-based crit bonuses)

### SkillTree
Passive abilities system to unlock powerful passive skills that enhance your stats.

**Features:**
- 5 Skill Branches: Strength, Agility, Intelligence, Vitality, Luck
- 25 Total Skills: 5 skills per branch with progressive unlocks
- Skill Points: Earn 1 SP per level (level 1 = 0 SP, level 2 = 1 SP, etc.)
- Skill Effects:
  - XP bonuses (per message, long messages)
  - Crit chance bonuses
  - Quest reward bonuses
  - All-stat bonuses (multiplies all stat effects)
- Prerequisites: Stat requirements and prerequisite skills
- Reset Function: Reset tree and recalculate SP based on current level
- Visual UI: Modal with skill tree visualization, unlock buttons

**Dependencies:** SoloLevelingStats (for stat requirements and level tracking)

### TitleManager
Title system to display and equip achievement titles with XP bonuses.

**Features:**
- Title Collection: View all unlocked titles from achievements
- Equip Titles: Equip one title at a time for XP bonuses
- Title Bonuses: Varied XP bonuses (3% to 50% depending on achievement)
- Visual UI: Modal showing active title, available titles, bonuses
- Solo Leveling Lore: All titles themed after Solo Leveling (E-Rank Hunter, Shadow Monarch, etc.)

**Dependencies:** SoloLevelingStats (for titles and achievements)

## Visual Enhancement Plugins

### LevelProgressBar
Always-visible progress bar that shows level progress at top or bottom of Discord.

**Features:**
- Position: Top or bottom of Discord window
- Display Options: Level, Rank, XP, progress bar
- Compact Mode: Smaller bar for minimal UI
- Opacity Control: 0-100% opacity
- Real-time Updates: Updates every second

**Dependencies:** SoloLevelingStats (for level/XP data)

### SoloLevelingToasts
Custom notifications with Solo Leveling-themed toast notifications for events.

**Features:**
- Purple Gradient: Matches Solo Leveling theme
- Particle Effects: Animated particles on notifications (default: 20 particles)
- Position Control: Top-right, top-left, bottom-right, bottom-left
- Auto-dismiss: Configurable timeout (default: 5 seconds)
- Max Toasts: Limit visible toasts (default: 5)

**Dependencies:** SoloLevelingStats (hooks into level ups, quests, achievements)

### LevelUpAnimation
Level up celebration with floating "LEVEL UP!" animation when you level up.

**Features:**
- Floating Animation: Text floats upward with fade
- Particle Effects: 30 particles per animation (configurable)
- Glow Effect: Purple glow matching theme
- Customizable: Duration (default: 3 seconds), distance (default: 150px), particle count, font size

**Dependencies:** SoloLevelingStats (detects level ups)

## Theme

### SoloLeveling-ClearVision
Dark purple Solo Leveling theme based on ClearVision v7.

**Features:**
- Dark Theme: Deep purple/black color scheme
- Solo Leveling Aesthetic: Matches manhwa art style
- Orbitron Font: Futuristic font family throughout
- Custom Styling:
  - Message containers with purple accents
  - Enhanced embeds and cards
  - Improved sidebar visibility
  - Status indicators with glow
  - Smooth animations and transitions
- Performance Optimized: Removed expensive blur effects, optimized animations

**Font Stack:**
- Primary: `'Orbitron', sans-serif`
- Code: `'Orbitron', monospace`
- Headings: `'Orbitron', sans-serif` (weight 500)

## Plugin Integration

### How Plugins Work Together:

```
SoloLevelingStats (Core)
├── CriticalHit (reads Agility stat for crit chance)
├── SkillTree (reads stats for skill requirements, saves bonuses)
├── TitleManager (reads titles/achievements, equips titles)
├── LevelProgressBar (reads level/XP for display)
├── SoloLevelingToasts (hooks into events for notifications)
└── LevelUpAnimation (detects level ups for animations)
```

### Data Flow:
1. SoloLevelingStats tracks activity and calculates stats
2. CriticalHit reads Agility bonus from SoloLevelingStats
3. SkillTree reads stats for requirements, saves bonuses to shared storage
4. SoloLevelingStats reads SkillTree bonuses when calculating XP
5. TitleManager reads titles from SoloLevelingStats achievements
6. Visual plugins (ProgressBar, Toasts, Animation) display SoloLevelingStats data

## Achievement System

### Solo Leveling Lore Titles:

**Early Game:**
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

**Activity Titles:**
- Dungeon Grinder, Gate Explorer, Raid Veteran, Eternal Hunter
- Gate Traveler, Dungeon Master, Dimension Walker, Realm Conqueror

## Skill Tree System

### Skill Branches:

**Strength Branch** (5 skills):
- Power Strike → Mighty Blow → Devastating Force
- Armor Break (side path)
- Berserker Rage (ultimate: XP + crit)

**Agility Branch** (5 skills):
- Quick Reflexes → Lightning Speed → Blinding Speed
- Shadow Step (side path)
- Transcendent Speed (ultimate: crit + XP)

**Intelligence Branch** (5 skills):
- Mental Clarity → Genius Mind → Master Strategist
- Tactical Analysis (side path)
- Omniscient Mind (ultimate: long message + quest)

**Vitality Branch** (5 skills):
- Robust Health → Iron Will → Immortal Body
- Regeneration (side path)
- Eternal Vitality (ultimate: quest + XP)

**Luck Branch** (5 skills):
- Lucky Break → Fortune's Favor → Divine Luck
- Serendipity (side path)
- Fate's Blessing (ultimate: all-stat + crit)

## Configuration

### CriticalHit Settings:
- Enable/disable crits
- Gradient on/off
- Animation on/off
- Glow effect on/off
- Font customization
- Message filtering options
- History retention (days)

### SkillTree Settings:
- Enable/disable skill tree
- View skill points
- View unlocked skills
- Reset tree (refunds all SP)

### TitleManager Settings:
- Enable/disable title manager
- View available titles
- Equip/unequip titles

### SoloLevelingStats Settings:
- Enable/disable stats tracking
- Allocate stat points
- View achievements
- View daily quests
- Chat UI toggle

## File Structure

```
betterdiscord-dev/
├── plugins/
│   ├── SoloLevelingStats.plugin.js    # Core stats system
│   ├── CriticalHit.plugin.js           # Crit message effects
│   ├── SkillTree.plugin.js            # Passive abilities
│   ├── TitleManager.plugin.js         # Title management
│   ├── LevelProgressBar.plugin.js     # Progress bar UI
│   ├── SoloLevelingToasts.plugin.js   # Toast notifications
│   └── LevelUpAnimation.plugin.js     # Level up animation
├── themes/
│   └── SoloLeveling-ClearVision.theme.css  # Main theme
└── README.md                          # This file
```

## Quick Start

1. Install BetterDiscord (if not already installed)
2. Copy plugins to `~/Library/Application Support/BetterDiscord/plugins/`
3. Copy theme to `~/Library/Application Support/BetterDiscord/themes/`
4. Reload Discord (Ctrl+R / Cmd+R)
5. Enable plugins in BetterDiscord settings
6. Enable theme in BetterDiscord themes
7. Start chatting - XP and stats will track automatically

## Tips & Tricks

- Maximize XP: Type longer messages (200+ chars), complete daily quests
- Increase Crit Chance: Level up Agility stat (max 90% with stats + skills)
- Unlock Skills: Meet stat requirements, spend skill points wisely
- Equip Titles: Higher-tier titles give better XP bonuses
- Complete Quests: Daily quests reset at midnight, give stat points
- Track Progress: Use LevelProgressBar to always see your level

## Troubleshooting

**Plugins not loading?**
- Check BetterDiscord is installed and enabled
- Verify files are in correct directories
- Check console for errors (Ctrl+Shift+I)

**Stats not tracking?**
- Ensure SoloLevelingStats plugin is enabled
- Check you're sending messages (not just reading)
- Verify chat UI is visible (toggle in settings)

**Crits not appearing?**
- Check CriticalHit plugin is enabled
- Verify SoloLevelingStats is running (for Agility bonuses)
- Check message filters aren't excluding your messages

**Skills not unlocking?**
- Verify stat requirements are met
- Check prerequisite skills are unlocked
- Ensure you have enough skill points

## License

All plugins and themes are for personal use. Based on Solo Leveling manhwa by Chugong.

## Author

Matthew - Solo Leveling BetterDiscord Suite Developer

## Version History

- **v1.0.0** (2025-11-30)
  - Initial release
  - Core stats system
  - Critical hit system
  - Skill tree system
  - Title management
  - Visual enhancements
  - Solo Leveling theme

## Additional Resources

- Plugin Ideas: See `plugins/docs/PLUGIN_IDEAS.md`
- Solo Leveling Stats Docs: See `plugins/docs/SOLO-LEVELING-STATS-README.md`
