# Discord Theme Maintenance - Quick Reference

## 🎯 All-In-One Solution: Theme Auto Maintainer

**Replaces 3 old plugins with 1 unified solution!**

### Installation

```bash
# Remove old plugins
rm ~/Library/Application\ Support/BetterDiscord/plugins/ClassAutoUpdater.plugin.js
rm ~/Library/Application\ Support/BetterDiscord/plugins/CSSCleanupHelper.plugin.js
rm ~/Library/Application\ Support/BetterDiscord/plugins/CSSVerification.plugin.js

# Install unified plugin
cp "Better Discord/betterdiscord-dev/plugins/ThemeAutoMaintainer.plugin.js" \
   ~/Library/Application\ Support/BetterDiscord/plugins/

# Restart Discord (Cmd+R)
# Settings → Plugins → Enable "Theme Auto Maintainer"
```

---

## What It Does

### 🔍 Multi-Source Verification

- **Live Discord DOM** → Current classes in real-time (most accurate)
- **GitHub DiscordClasses** → Verified mappings from repo (safest)
- **Dual Verification** → Requires BOTH to confirm (ultra-safe)

### 🔄 Automatic Updates

- Detects broken classes (e.g., `.app-3xd6d0`)
- Finds current classes (e.g., `.app__160d8`) from DOM + GitHub
- Auto-fixes broken classes
- Creates timestamped backups

### 🧹 Smart Cleanup

- Identifies truly unused selectors (not in DOM OR GitHub)
- Comments out instead of deleting (safer)
- Shows line numbers for manual review
- Only flags confirmed unused

### 💾 Periodic Backups

- Automatic backups every 24 hours (configurable)
- Keeps last 10 backups (auto-cleanup old ones)
- Backups before updates and cleanup
- Never lose your work

---

## Recommended Settings

```
Monitoring & Updates:
  ✅ Auto-Update Broken Classes: ON
  ✅ Check on Startup: ON
  ✅ Check Interval: 30 minutes

Verification & Safety:
  ✅ Scan Live Discord DOM: ON (real-time)
  ✅ Verify with GitHub Repo: ON (safest)
  ✅ Require Both Verifications: ON (ultra-safe)

Cleanup & Backups:
  ⚠️ Auto-Cleanup Unused: OFF (manual review safer)
  ✅ Comment Instead of Remove: ON
  ✅ Backup Interval: 24 hours
  ✅ Max Backups: 10

Notifications:
  ✅ Show Notifications: ON
  ⚠️ Verbose Logging: OFF (enable for debugging)
```

---

## Usage

### Automatic Mode (Set & Forget) ✨

**1. Install plugin** (see above)

**2. Enable recommended settings**

**3. Done!**

Plugin handles everything:

- ✅ Checks on startup
- ✅ Monitors every 30 minutes
- ✅ Auto-updates broken classes
- ✅ Creates daily backups
- ✅ Logs all changes
- ✅ Notifies you of actions

**You do nothing!** Just use Discord normally.

---

### Manual Mode (For Control Freaks)

**1. Run Full Check**

```
Settings → Plugins → Theme Auto Maintainer → Manual Actions
Click "🔍 Run Full Check"
```

**2. View Report**

```
Click "📊 View Detailed Report"

Results:
  ✅ Broken Classes (2)
    - .app-3xd6d0 → .app__160d8 (verified by: DOM + GitHub)
    - .app-2CXKsg → .app__160d8 (verified by: DOM + GitHub)
    [🔄 Apply Updates Now]

  ⚠️ Truly Unused (320)
    - [class*="oldElement"]::before (line 27)
    - .oldDiscordElement-abc123 (line 500)
    - ... (318 more)
    [🧹 Comment Out Unused]
```

**3. Apply Updates**

```
Click "🔄 Apply Updates Now"
  → Backup: theme.css.update-2025-12-20T16-30-00.bak
  → Updates: 2 broken classes fixed
  → Notification: "Updated 2 broken classes!"
  → Re-analyzes automatically
```

**4. Clean Unused**

```
Click "🧹 Comment Out Unused"
  → Confirm: "Comment out 320 selectors?"
  → Backup: theme.css.cleanup-2025-12-20T16-30-00.bak
  → Comments: All unused marked /* UNUSED: ... */
  → Notification: "Cleaned 320 selectors!"
```

**5. Manual Review**

```
Open theme CSS
Search: /* UNUSED:
Review each block
Delete confirmed unused
Keep if uncertain
Test theme
```

---

## Console Quick Commands

```javascript
// Get plugin instance
const tm = BdApi.Plugins.get('Theme Auto Maintainer').instance;

// Quick check
tm.performFullCheck();

// View results
console.log(`Broken: ${tm.updatableSelectors.length}`);
console.log(`Unused: ${tm.unusedSelectors.length}`);

// Apply fixes
tm.applyUpdates();

// Backup now
tm.createBackups();

// View live classes
tm.liveClasses;

// View GitHub classes
tm.githubClasses;
```

---

## Verification Modes

### Mode 1: Dual Verification (Recommended)

```
Settings:
  - Live DOM: ON
  - GitHub: ON
  - Require Both: ON

Result: Only updates if BOTH DOM and GitHub agree
Safety: Maximum
Speed: Fast (GitHub cached after first load)
```

### Mode 2: DOM Priority (Fastest)

```
Settings:
  - Live DOM: ON
  - GitHub: ON
  - Require Both: OFF

Result: Uses DOM as primary, GitHub confirms semantic names
Safety: High
Speed: Fastest
```

### Mode 3: GitHub Only (Offline After First Load)

```
Settings:
  - Live DOM: OFF
  - GitHub: ON
  - Require Both: OFF

Result: Uses only GitHub repo
Safety: High
Speed: Fast (no DOM scan)
```

---

## Backup Locations

**Periodic Backups:**

```
~/Library/Application Support/BetterDiscord/themes/backups/
  SoloLeveling-ClearVision.theme.css.2025-12-20T12-00-00.bak
  SoloLeveling-ClearVision.theme.css.2025-12-19T12-00-00.bak
  ... (last 10 kept)
```

**Update Backups:**

```
~/Library/Application Support/BetterDiscord/themes/
  SoloLeveling-ClearVision.theme.css.update-2025-12-20T16-30-00.bak
```

**Cleanup Backups:**

```
~/Library/Application Support/BetterDiscord/themes/
  SoloLeveling-ClearVision.theme.css.cleanup-2025-12-20T16-35-00.bak
```

---

## Comparison: Old vs. New

| Feature               | Old (3 Plugins)     | New (1 Plugin) |
| --------------------- | ------------------- | -------------- |
| **Live DOM Scan**     | ✅ ClassAutoUpdater | ✅ Built-in    |
| **GitHub Verify**     | ✅ CSSCleanupHelper | ✅ Built-in    |
| **Auto-Update**       | ✅ ClassAutoUpdater | ✅ Enhanced    |
| **Cleanup**           | ✅ CSSCleanupHelper | ✅ Enhanced    |
| **Backups**           | ⚠️ Basic            | ✅ Advanced    |
| **Dual Verification** | ❌ No               | ✅ Yes         |
| **Periodic Backups**  | ❌ No               | ✅ Yes         |
| **Unified Workflow**  | ❌ Manual           | ✅ Automatic   |
| **Maintenance**       | 3 plugins           | 1 plugin       |

---

## Troubleshooting

### No Updates Detected

```javascript
// Check data sources
const tm = BdApi.Plugins.get('Theme Auto Maintainer').instance;
console.log(`Live classes: ${tm.liveClasses.size}`);
console.log(`GitHub classes: ${tm.githubClasses.size}`);

// Force reload
tm.extractLiveClasses();
tm.loadGitHubRepo();
tm.performFullCheck();
```

### Theme Not Updating

```
Check:
  1. Auto-Update: ON
  2. Plugin enabled: YES
  3. Broken classes found: >0
  4. Check console for errors
```

### Restore from Backup

```bash
# List backups
ls ~/Library/Application\ Support/BetterDiscord/themes/backups/

# Restore latest periodic backup
cp ~/Library/Application\ Support/BetterDiscord/themes/backups/SoloLeveling-ClearVision.theme.css.2025-12-20*.bak \
   ~/Library/Application\ Support/BetterDiscord/themes/SoloLeveling-ClearVision.theme.css

# Or restore latest update backup
ls -t ~/Library/Application\ Support/BetterDiscord/themes/*.update-*.bak | head -1 | xargs -I {} cp {} ~/Library/Application\ Support/BetterDiscord/themes/SoloLeveling-ClearVision.theme.css
```

---

## Resources

**Plugin:**

- `Better Discord/betterdiscord-dev/plugins/ThemeAutoMaintainer.plugin.js`

**Documentation:**

- `docs/THEME-AUTO-MAINTAINER.md` - Complete guide (this file)
- `docs/LIVE-CLASS-DETECTION.md` - Technical concepts
- `docs/CSS-CLEANUP-WORKFLOW.md` - Cleanup workflow

**Python Scripts (Complementary):**

- `scripts/discord-class-updater.py` - Manual batch updates
- `scripts/auto-monitor-discord-classes.py` - Scheduled checks

**External Resources:**

- GitHub Repo: <https://github.com/IBeSarah/DiscordClasses>
- Web Updater: <https://syndishanx.github.io/Website/Update_Classes.html>

---

## Quick Actions

**Daily:**

- Nothing! Plugin handles everything automatically

**Weekly:**

- Check console logs (verify plugin working)
- Review backup folder (confirm backups created)

**After Discord Update:**

- Plugin auto-detects and updates
- Check notification ("Updated N classes")
- Test theme (should work perfectly)

**Monthly:**

- Review `/* UNUSED:` comments in theme
- Delete confirmed unused blocks
- Run full check to verify clean

---

**TL;DR:** Install → Enable → Forget about it! Plugin maintains your theme automatically with live DOM + GitHub verification, auto-updates, cleanup, and backups. 🎉
