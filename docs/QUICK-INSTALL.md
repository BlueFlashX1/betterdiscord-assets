# 🚀 Quick Install Guide (No npm Required)

You don't need npm to install BetterDiscord plugins! Here are simple ways to do it:

## Method 1: Direct Copy (Simplest)

Just copy the plugin file directly to BetterDiscord's plugins folder:

```bash
# Copy the plugin
cp plugins/CriticalHit.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

**Pros:**
- ✅ No npm needed
- ✅ Simple and straightforward
- ✅ Works immediately

**Cons:**
- ❌ Changes in dev folder don't auto-update (need to copy again)
- ❌ Two separate files (dev + BetterDiscord)

## Method 2: Manual Symlink (Best for Development)

Create a symlink so changes in dev folder automatically appear in BetterDiscord:

```bash
# Create symlink
ln -s ~/Documents/DEVELOPMENT/betterdiscord-dev/plugins/CriticalHit.plugin.js \
      ~/Library/Application\ Support/BetterDiscord/plugins/CriticalHit.plugin.js
```

**Pros:**
- ✅ No npm needed
- ✅ Edit in dev folder, changes appear automatically
- ✅ Single source of truth

**Cons:**
- ❌ Slightly more complex command

## Method 3: Using npm Scripts (What We Set Up)

The npm scripts are just convenience wrappers:

```bash
npm run link:plugin CriticalHit.plugin.js
```

This does the same as Method 2, but with a simpler command.

## For Themes

Same thing applies to themes:

```bash
# Direct copy
cp themes/MyTheme.theme.css ~/Library/Application\ Support/BetterDiscord/themes/

# Manual symlink
ln -s ~/Documents/DEVELOPMENT/betterdiscord-dev/themes/MyTheme.theme.css \
      ~/Library/Application\ Support/BetterDiscord/themes/MyTheme.theme.css
```

## Quick Reference

**Plugin locations:**
- Development: `~/Documents/DEVELOPMENT/betterdiscord-dev/plugins/`
- BetterDiscord: `~/Library/Application Support/BetterDiscord/plugins/`

**Theme locations:**
- Development: `~/Documents/DEVELOPMENT/betterdiscord-dev/themes/`
- BetterDiscord: `~/Library/Application Support/BetterDiscord/themes/`

## After Installing

1. Open Discord
2. Go to **Settings** → **BetterDiscord** → **Plugins** (or **Themes**)
3. Find your plugin/theme and toggle it **ON**
4. Reload Discord (**Cmd+R**)

That's it! No npm required! 🎉
