# BetterDiscord Auto-Symlink System

## 🎯 Problem Solved

**No more broken symlinks when you move directories!** The scripts now automatically detect where the `betterdiscord-dev` directory is located, no matter where you move it.

## 🚀 Quick Start

### Option 1: Run from the betterdiscord-dev directory

```bash
cd ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev
./auto-symlink.sh
```

### Option 2: Run from anywhere (auto-detects location)

```bash
cd ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev
./fix-symlinks
```

## 📋 Available Scripts

### `auto-symlink.sh` (Recommended)

**Auto-detects directory location** and fixes all symlinks.

- ✅ Automatically finds the script's location
- ✅ Works no matter where you move the directory
- ✅ Fixes all plugins and themes
- ✅ Color-coded output
- ✅ Summary report

**Usage:**

```bash
./auto-symlink.sh
```

### `fix-symlinks` (Global Command)

**Can be run from anywhere** - searches for betterdiscord-dev directory.

- ✅ Searches common locations
- ✅ Finds directory by known files
- ✅ Works from any directory

**Usage:**

```bash
./fix-symlinks
```

### `symlink-to-betterdiscord.sh` (Updated)

**Updated to use auto-detection** - now works when directory moves.

- ✅ Auto-detects script location
- ✅ Only handles themes (use auto-symlink.sh for everything)

**Usage:**

```bash
./symlink-to-betterdiscord.sh
```

### `scripts/link-all-plugins.sh` (Updated)

**Updated to use auto-detection** - now works when directory moves.

- ✅ Auto-detects script location
- ✅ Only handles plugins (use auto-symlink.sh for everything)

**Usage:**

```bash
./scripts/link-all-plugins.sh
```

## 🔄 How Auto-Detection Works

### Method 1: Script Location (Primary)

The scripts use `$(dirname "${BASH_SOURCE[0]}")` to find where they are located. This means:

- ✅ Works if you move the entire `betterdiscord-dev` directory
- ✅ Works if you rename parent directories
- ✅ Works if you copy the directory elsewhere

### Method 2: Search Common Locations (Fallback)

If script location doesn't work, searches:

- `~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev`
- `~/Documents/DEVELOPMENT/betterdiscord-dev`
- `~/Documents/DEVELOPMENT/Better Discord/betterdiscord-dev`
- `~/Development/betterdiscord-dev`
- `~/betterdiscord-dev`

### Method 3: Find by Known File (Last Resort)

Searches for `SoloLeveling-ClearVision.theme.css` to locate the directory.

## 💡 Usage Examples

### After Moving Directory

```bash
# You moved betterdiscord-dev to a new location
cd /new/location/betterdiscord-dev
./auto-symlink.sh
# ✅ All symlinks automatically updated!
```

### From Any Directory

```bash
# You're in some random directory
cd ~/somewhere/else
/path/to/betterdiscord-dev/fix-symlinks
# ✅ Finds directory and fixes symlinks!
```

### Quick Fix

```bash
# Just run from the directory
cd ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev
./auto-symlink.sh
```

## 🎨 What Gets Fixed

### Plugins (Auto-detected)

- All `.plugin.js` files in `plugins/` directory
- Automatically finds all plugins
- Creates symlinks to BetterDiscord plugins folder

### Themes (Auto-detected)

- `SoloLeveling-ClearVision.theme.css`
- `variables/` directory
- Creates symlinks to BetterDiscord themes folder

## 🔧 Troubleshooting

### "Could not find betterdiscord-dev directory"

**Solution:** Make sure you're running the script from within the `betterdiscord-dev` directory, or the directory is in one of the searched locations.

### "Source not found" warnings

**Solution:** The script will skip missing files. Make sure all plugins/themes exist in the source directory.

### Symlinks still broken after running

**Solution:**

1. Check that BetterDiscord directories exist:

   ```bash
   ls ~/Library/Application\ Support/BetterDiscord/plugins
   ls ~/Library/Application\ Support/BetterDiscord/themes
   ```

2. Verify source files exist:

   ```bash
   ls plugins/*.plugin.js
   ls themes/*.theme.css
   ```

3. Run script again with verbose output

## 📝 Migration from Old Scripts

### Old Way (Hardcoded Paths)

```bash
# Had to manually update paths in scripts
SOURCE_DIR="/Users/matthewthompson/Documents/DEVELOPMENT/Better Discord/betterdiscord-dev/themes"
```

### New Way (Auto-Detection)

```bash
# Automatically detects location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/themes"
```

**No more manual path updates needed!**

## ✅ Benefits

1. **No Manual Updates:** Scripts automatically find the directory
2. **Works Anywhere:** Move the directory, scripts still work
3. **Self-Contained:** Each script knows where it is
4. **Future-Proof:** Works even if you reorganize your file structure

## 🎉 Summary

**Just run `./auto-symlink.sh` from the betterdiscord-dev directory** - it will automatically:

- ✅ Find the directory location
- ✅ Fix all plugin symlinks
- ✅ Fix all theme symlinks
- ✅ Work no matter where you move the directory

**No more broken symlinks!** 🚀
