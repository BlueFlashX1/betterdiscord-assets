# ⚔️ Solo Leveling Stats Plugin

A Solo Leveling-inspired progression system for Discord that tracks your activity and rewards you with levels, stats, achievements, and daily quests!

## Features

### 📊 Activity Tracking
- **Messages Sent**: Track every message you send
- **Characters Typed**: Count all characters you type
- **Channels Visited**: Track unique channels you visit
- **Time Active**: Monitor your Discord activity time

### ⬆️ Level System
- **XP Progression**: Earn XP from messages, characters, and activity
- **Exponential Scaling**: Level requirements scale exponentially (Level 1→2: 100 XP, Level 50→51: 5000 XP)
- **Level Up Notifications**: Solo Leveling-style "[SYSTEM] Level up detected. HP fully restored."
- **Stat Points**: Earn 1 stat point per level

### 💪 Stat System
Five core stats you can allocate points to:
- **Strength** (0-20): +5% XP per message per point
- **Agility** (0-20): +2% crit chance per point (enhances CriticalHit plugin)
- **Intelligence** (0-20): +10% bonus XP from long messages (>100 chars) per point
- **Vitality** (0-20): +5% daily quest rewards per point
- **Luck** (0-20): +1% random bonus XP chance per point

### 🏆 Achievement System
Unlock achievements at milestones:
- **Message Milestones**: 100, 500, 1k, 5k, 10k messages
- **Character Milestones**: 10k, 50k, 100k characters
- **Level Milestones**: 10, 25, 50, 100
- **Time Milestones**: 10h, 50h active
- **Channel Milestones**: 10, 25, 50 unique channels

Each achievement unlocks a **Title** with passive XP bonuses!

### 📜 Daily Quests
Five daily quests that reset at midnight:
- **Message Master**: Send 20 messages (Reward: +50 XP, +1 stat point)
- **Character Champion**: Type 1,000 characters (Reward: +75 XP)
- **Channel Explorer**: Visit 5 unique channels (Reward: +50 XP, +1 stat point)
- **Active Adventurer**: Be active for 30 minutes (Reward: +100 XP)
- **Perfect Streak**: Send 10 messages without errors (Reward: +150 XP, +1 stat point)

## Installation

1. Copy `SoloLevelingStats.plugin.js` to your BetterDiscord plugins folder:
   ```bash
   cp SoloLevelingStats.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
   ```

2. Enable the plugin in Discord:
   - Settings → BetterDiscord → Plugins
   - Find "SoloLevelingStats" and toggle it ON
   - Reload Discord (Cmd+R)

## Usage

### Viewing Stats
Open the plugin settings to see:
- Your current level and XP progress
- All 5 stats with allocation buttons
- Activity summary (messages, characters, channels, time)
- Daily quest progress
- Unlocked achievements
- Active title selection

### Allocating Stat Points
1. Open plugin settings
2. Find the stat you want to upgrade
3. Click the "+1" button (if you have unallocated points)
4. Stat effects apply immediately!

### Titles
- Unlock titles by completing achievements
- Select an active title in settings
- Active titles provide passive XP bonuses
- Titles stack with stat bonuses!

## Integration

### CriticalHit Plugin
The **Agility** stat enhances the CriticalHit plugin:
- Each Agility point increases crit chance by +2%
- Max +40% crit chance at 20 Agility
- Works automatically when both plugins are enabled

## XP Calculation

Base XP per message:
- **10 XP** base
- **+0.1 XP per character** (max +50 XP)
- **Strength bonus**: +5% per point
- **Intelligence bonus**: +10% per point (for messages >100 chars)
- **Title bonus**: Varies by title (+5% to +25%)
- **Luck bonus**: Random 50% bonus (1% chance per Luck point)

## Tips

1. **Focus on one stat first**: Strength is great for consistent XP gain
2. **Complete daily quests**: They give bonus XP and stat points!
3. **Unlock achievements**: Titles provide permanent XP bonuses
4. **Use Intelligence for long messages**: Great for detailed discussions
5. **Agility + CriticalHit**: Perfect combo for flashy crits!

## Data Storage

All data is stored using BetterDiscord's Data API:
- Settings: `BdApi.Data.load('SoloLevelingStats', 'settings')`
- Auto-saves every 30 seconds
- Persists across Discord restarts

## Solo Leveling Aesthetic

- System notifications: "[SYSTEM] Level up detected. HP fully restored."
- Quest notifications: "[QUEST COMPLETE] Quest Name"
- Achievement notifications: "[SYSTEM] Achievement unlocked: Name"
- Dark theme with orange/red accents
- Progress bars with glow effects

Enjoy your Solo Leveling journey! ⚔️✨
