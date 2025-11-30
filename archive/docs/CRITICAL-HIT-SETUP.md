# 💥 Critical Hit Plugin Setup Guide

## What It Does

The **CriticalHit** plugin adds a fun RPG-style critical hit system to Discord messages! Each message has a configurable chance to "land a critical hit" and when it does:

- ✨ **Brilliant red color** - Messages turn bright red
- 🎨 **Different font** - Uses Impact/Arial Black for impact
- ⚡ **Lightning bolt indicator** - Shows a ⚡ before crit messages
- 🌟 **Optional glow effect** - Adds a red glow around the text
- 🎬 **Optional animation** - Subtle pulse animation

## Quick Setup

### Option A: Direct Copy (Simplest - No npm needed!)

```bash
cp ~/Documents/DEVELOPMENT/betterdiscord-dev/plugins/CriticalHit.plugin.js \
   ~/Library/Application\ Support/BetterDiscord/plugins/
```

### Option B: Using npm Script (Development workflow)

```bash
cd ~/Documents/DEVELOPMENT/betterdiscord-dev
npm run link:plugin CriticalHit.plugin.js
```

**Note:** Both methods work! Option A is simpler if you just want to use the plugin. Option B is better if you're actively developing and want changes to auto-update.

### 2. Enable in Discord

1. Open Discord
2. Go to **Settings** → **BetterDiscord** → **Plugins**
3. Find **CriticalHit** in the list
4. Toggle it **ON**
5. Reload Discord (**Cmd+R** or **Ctrl+R**)

### 3. Start Using!

Just send messages normally! Each message has a chance (default 10%) to be a critical hit.

## Customization

Open the plugin settings to customize:

- **Critical Hit Chance**: 0-100% (default: 10%)
- **Critical Hit Color**: Any color (default: brilliant red #ff0000)
- **Critical Hit Font**: Any font family (default: Impact, Arial Black)
- **Enable Animation**: Toggle pulse animation on/off
- **Enable Glow**: Toggle glow effect on/off
- **Test Critical Hit**: Button to test the effect on the last message

## How It Works

1. **Message Detection**: The plugin watches for new messages using a MutationObserver
2. **Random Roll**: When a message appears, it rolls a random number (0-100)
3. **Critical Hit Check**: If the roll is ≤ your crit chance, it's a crit!
4. **Style Application**: Applies red color, custom font, and optional effects
5. **Visual Indicator**: Adds a ⚡ emoji before the message

## Example Settings

**High Crit Build (25% chance):**
- Crit Chance: 25%
- Color: #ff0000 (bright red)
- Font: Impact
- Animation: ON
- Glow: ON

**Subtle Crit Build (5% chance):**
- Crit Chance: 5%
- Color: #cc0000 (darker red)
- Font: Arial Black
- Animation: OFF
- Glow: OFF

**Custom Theme:**
- Crit Chance: 15%
- Color: #ff6b00 (orange)
- Font: "Comic Sans MS", cursive
- Animation: ON
- Glow: ON

## Troubleshooting

**Messages aren't getting crits:**
- Check that the plugin is enabled
- Try increasing the crit chance in settings
- Use the "Test Critical Hit" button to verify it works
- Reload Discord

**Styling looks wrong:**
- Check Discord's theme isn't overriding colors
- Try adjusting the color in settings
- Disable and re-enable the plugin

**Plugin not showing in Discord:**
- Make sure you linked it: `npm run link:plugin CriticalHit.plugin.js`
- Check the file is in: `~/Library/Application Support/BetterDiscord/plugins/`
- Restart Discord completely

## Technical Details

- Uses **MutationObserver** to detect new messages
- Applies inline styles to message content
- Stores settings using BetterDiscord's Data API
- Tracks crit messages to avoid re-processing
- Injects CSS for animations and indicators

## Tips

1. **Start with 10%** - Good balance of frequency
2. **Use glow for emphasis** - Makes crits more noticeable
3. **Test different fonts** - Some fonts look better than others
4. **Adjust color** - Match your Discord theme
5. **Lower chance = more special** - 5% makes crits feel rare and exciting!

Enjoy your critical hits! 💥⚡
