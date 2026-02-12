# Theme Auto Maintainer - Troubleshooting Guide

## Common Issues & Solutions

---

### ❌ "There is already a theme with name..." Error

**Problem:**

```
Solo Leveling (ClearVision Base): There is already a theme with name Solo Leveling (ClearVision Base)
```

**Cause:**

- BetterDiscord cached old theme files
- Multiple theme files with same `@name` metadata
- Theme renamed but old version still present

**Solution:**

**Step 1: Check for duplicate files**

```bash
ls ~/Library/Application\ Support/BetterDiscord/themes/*.theme.css*
```

**Step 2: Remove old/duplicate files**

```bash
# Move old versions to .old extension
mv ~/Library/Application\ Support/BetterDiscord/themes/UpdatedSoloLeveling.theme.css \
   ~/Library/Application\ Support/BetterDiscord/themes/UpdatedSoloLeveling.theme.css.old

# Or delete old backups
rm ~/Library/Application\ Support/BetterDiscord/themes/*.bak
rm ~/Library/Application\ Support/BetterDiscord/themes/*.old
```

**Step 3: Completely restart Discord**

```
1. Quit Discord (Cmd+Q, not just Cmd+R)
2. Relaunch Discord
3. Wait for full load
4. Settings → Themes → Enable Solo Leveling
```

**Step 4: Verify only one theme file exists**

```bash
ls ~/Library/Application\ Support/BetterDiscord/themes/*.theme.css
# Should show only: SoloLeveling-ClearVision.theme.css
```

---

### ❌ Plugin Not Syncing to Dev/Assets

**Problem:**

- Files in dev/assets folder are out of date
- No backups being created
- Sync not working

**Solution:**

**Check folder structure:**

```bash
# Verify folders exist
test -d ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-dev/themes && echo "✅ Dev exists" || echo "❌ Create dev folder"
test -d ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-assets/themes && echo "✅ Assets exists" || echo "❌ Create assets folder"
```

**Create missing folders:**

```bash
mkdir -p ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-dev/themes/backups
mkdir -p ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-assets/themes
```

**Manual sync to verify paths:**

```bash
cp ~/Library/Application\ Support/BetterDiscord/themes/SoloLeveling-ClearVision.theme.css \
   ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-dev/themes/

cp ~/Library/Application\ Support/BetterDiscord/themes/SoloLeveling-ClearVision.theme.css \
   ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-assets/themes/
```

**Check console for sync errors:**

```javascript
const tm = BdApi.Plugins.get('Theme Auto Maintainer').instance;
// Look for "Failed to sync" errors
```

---

### ❌ Backups Not Creating

**Problem:**

- Backup folders empty
- No `.bak` files created
- Periodic backups not working

**Solution:**

**Check settings:**

```
Settings → Plugins → Theme Auto Maintainer
  - Backup Interval: >0 (not 0)
  - Plugin enabled: YES
```

**Check permissions:**

```bash
touch ~/Library/Application\ Support/BetterDiscord/themes/backups/test.txt && \
rm ~/Library/Application\ Support/BetterDiscord/themes/backups/test.txt && \
echo "✅ Can write to backups" || echo "❌ No write permission"
```

**Force manual backup:**

```
Settings → Theme Auto Maintainer → Manual Actions
Click "💾 Create Backup Now"
```

**Check console:**

```javascript
BdApi.Plugins.get('Theme Auto Maintainer').instance.createBackups();
// Check for errors
```

---

### ❌ Assets Folder Has Backups (Should Not)

**Problem:**

- `.bak` files found in betterdiscord-assets/themes/
- Violates "no backups in assets" requirement

**Solution:**

**Remove backups from assets:**

```bash
rm ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-assets/themes/*.bak
rm ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-assets/themes/*.old
```

**Verify plugin logic:**

```javascript
// The syncToDevelopmentFolders function should NOT create backups in assets
// It should only write the current theme file
```

**Expected assets folder:**

```bash
ls ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-assets/themes/
# Should show ONLY: SoloLeveling-ClearVision.theme.css (no .bak files)
```

---

### ❌ "GitHub DiscordClasses failed to load"

**Problem:**

```
Failed to fetch GitHub data: ...
```

**Cause:**

- No internet connection
- GitHub API rate limit
- Network timeout

**Solution:**

**Option 1: Retry**

```javascript
const tm = BdApi.Plugins.get('Theme Auto Maintainer').instance;
tm.loadGitHubRepo();
```

**Option 2: Disable GitHub verification temporarily**

```
Settings → Theme Auto Maintainer
  - Verify with GitHub Repo: OFF
  - Plugin will use live DOM only
```

**Option 3: Use cached data**

- Plugin continues with last loaded GitHub data
- Live DOM still works
- Updates still happen (DOM-only verification)

---

### ❌ Theme Changes Not Detected

**Problem:**

- Discord classes changed but plugin didn't detect
- No updates applied
- Manual updates needed

**Solution:**

**Force full check:**

```javascript
const tm = BdApi.Plugins.get('Theme Auto Maintainer').instance;
tm.performFullCheck();
```

**Refresh data sources:**

```javascript
// Refresh live DOM
tm.extractLiveClasses();

// Reload GitHub
tm.loadGitHubRepo();

// Then check
tm.performFullCheck();
```

**Check settings:**

```
- Auto-Update: ON
- Check on Startup: ON
- Check Interval: >0
```

---

### ❌ Too Many Backups

**Problem:**

- Backup folder has hundreds of `.bak` files
- Taking up space
- Cluttered

**Solution:**

**Adjust max backups:**

```
Settings → Theme Auto Maintainer
  - Max Backups: 10 (default)
  - Lower to 5 for less storage
  - Raise to 20 for more history
```

**Manual cleanup:**

```bash
# Keep only last 10 backups in BetterDiscord
cd ~/Library/Application\ Support/BetterDiscord/themes/backups/
ls -t *.bak | tail -n +11 | xargs rm

# Keep only last 10 in dev
cd ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-dev/themes/backups/
ls -t *.bak | tail -n +11 | xargs rm
```

---

## Prevention Tips

### Avoid Duplication

**DO:**

- Keep only one theme file with a given `@name`
- Remove old versions before installing new
- Use `.old` extension to disable themes

**DON'T:**

- Have multiple files with same `@name` metadata
- Keep old theme files enabled
- Mix versions in same folder

### Maintain Clean Setup

**Regular Maintenance:**

```bash
# Monthly: Remove old/disabled themes
ls ~/Library/Application\ Support/BetterDiscord/themes/*.old
rm ~/Library/Application\ Support/BetterDiscord/themes/*.old

# Weekly: Verify sync
diff ~/Library/Application\ Support/BetterDiscord/themes/SoloLeveling-ClearVision.theme.css \
     ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-dev/themes/SoloLeveling-ClearVision.theme.css
```

---

## Quick Fixes

### Reset Everything

**Nuclear option (complete reset):**

```bash
# 1. Backup current theme
cp ~/Library/Application\ Support/BetterDiscord/themes/SoloLeveling-ClearVision.theme.css \
   ~/Desktop/SoloLeveling-ClearVision.theme.css.backup

# 2. Remove all theme files
rm ~/Library/Application\ Support/BetterDiscord/themes/*.theme.css*

# 3. Copy clean version from dev
cp ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-dev/themes/SoloLeveling-ClearVision.theme.css \
   ~/Library/Application\ Support/BetterDiscord/themes/

# 4. Restart Discord (Cmd+Q then relaunch)

# 5. Enable theme in settings
```

### Force Sync

**Manual sync command:**

```bash
# Source: Dev (most up-to-date)
SOURCE="$HOME/Documents/DEVELOPMENT/Better Discord/betterdiscord-dev/themes/SoloLeveling-ClearVision.theme.css"

# Copy to BetterDiscord
cp "$SOURCE" ~/Library/Application\ Support/BetterDiscord/themes/

# Copy to Assets
cp "$SOURCE" ~/Documents/DEVELOPMENT/Better\ Discord/betterdiscord-assets/themes/

# Verify
diff ~/Library/Application\ Support/BetterDiscord/themes/SoloLeveling-ClearVision.theme.css "$SOURCE"
```

---

## Console Debugging

### Check Plugin State

```javascript
const tm = BdApi.Plugins.get('Theme Auto Maintainer').instance;

// Check data loaded
console.log(`Live classes: ${tm.liveClasses.size}`);
console.log(`GitHub classes: ${tm.githubClasses.size}`);
console.log(`Updatable: ${tm.updatableSelectors.length}`);
console.log(`Unused: ${tm.unusedSelectors.length}`);

// View last sync
console.log(tm);
```

### Force Operations

```javascript
// Extract live classes
tm.extractLiveClasses();

// Load GitHub
tm.loadGitHubRepo();

// Run full check
tm.performFullCheck();

// Apply updates
tm.applyUpdates();

// Create backup
tm.createBackups();
```

---

## Error Messages Explained

### "No such file or directory"

- **Cause:** Path doesn't exist
- **Fix:** Create missing folders with `mkdir -p`

### "Permission denied"

- **Cause:** No write access
- **Fix:** Check folder permissions, run Discord with correct user

### "Failed to parse GitHub data"

- **Cause:** Invalid JSON from GitHub
- **Fix:** Retry later, disable GitHub verification temporarily

### "Failed to sync to development folders"

- **Cause:** Dev/assets folders don't exist
- **Fix:** Create folders manually

---

## Support

**Get help:**

1. Enable verbose logging: Settings → Verbose Logging: ON
2. Check console for detailed errors
3. Export report: Settings → Export Report
4. Review INSTALLATION-GUIDE.md
5. Check DEPLOYMENT-CHECKLIST.md

**Documentation:**

- `TROUBLESHOOTING.md` (this file)
- `INSTALLATION-GUIDE.md` - Setup
- `DEPLOYMENT-CHECKLIST.md` - Verification
- `docs/THEME-AUTO-MAINTAINER.md` - Complete reference

---

**Most issues are resolved by:** Fully quit and restart Discord, or manually sync files once.
