# Theme Auto Maintainer - Complete Documentation

**The all-in-one solution for BetterDiscord theme maintenance.**

Combines live DOM scanning, GitHub verification, automatic updates, cleanup, and backups into one comprehensive plugin.

---

## What It Does

### 🔍 Multi-Source Verification

- **Live Discord DOM** - Scans current classes in real-time (most accurate)
- **GitHub DiscordClasses** - Verifies with IBeSarah's maintained repo (safest)
- **Dual Verification** - Can require BOTH sources to confirm (ultra-safe)

### 🔄 Automatic Updates

- Detects broken classes (old hashes)
- Finds current classes from live DOM + GitHub
- Auto-updates themes with verified classes
- Creates timestamped backups before changes

### 🧹 Smart Cleanup

- Identifies truly unused selectors (not in DOM OR GitHub)
- Categories: Safe to remove, needs review, test first
- Comment-out option (safer than deletion)
- Line number references for manual review

### 💾 Periodic Backups

- Automatic timestamped backups (configurable interval)
- Keeps last N backups (auto-cleanup old ones)
- Backup before updates, cleanup, and scheduled

### 📊 Comprehensive Reporting

- Visual report with color-coded categories
- Export to JSON for offline review
- Console logs for debugging
- Toast notifications for actions

---

## Why This Is Better

### Old Approach (2 Separate Plugins)

```
ClassAutoUpdater:
  ✅ Live DOM scanning
  ✅ Auto-updates
  ❌ No cleanup
  ❌ Limited backups

CSSCleanupHelper:
  ✅ GitHub verification
  ✅ Cleanup suggestions
  ❌ No live DOM
  ❌ Manual updates
```

### New Approach (Unified Plugin)

```
Theme Auto Maintainer:
  ✅ Live DOM scanning (most accurate)
  ✅ GitHub verification (safest)
  ✅ Auto-updates (hands-free)
  ✅ Smart cleanup (removes only confirmed unused)
  ✅ Periodic backups (never lose work)
  ✅ Multi-layer verification (DOM + GitHub)
  ✅ One plugin to rule them all
```

---

## How It Works

### Multi-Layer Verification Process

```
Selector found in theme CSS
   ↓
Test 1: Does it match in live Discord DOM?
   ↓ NO
Test 2: Check semantic name in GitHub repo
   ↓
   Found in GitHub? → UPDATABLE (broken class)
      ↓
   Verify with live DOM? → DOUBLE-VERIFIED ✅
      ↓
   AUTO-UPDATE: Old class → New class
   ↓
   NOT found in GitHub? → TRULY UNUSED
      ↓
   CLEANUP: Comment out or remove
```

### Example Flow

**Selector:** `.app-3xd6d0`

**Step 1: Live DOM Check**

```javascript
document.querySelectorAll('.app-3xd6d0');
// Result: 0 matches (broken!)
```

**Step 2: Extract Semantic Name**

```javascript
'.app-3xd6d0' → semantic: 'app', hash: '3xd6d0'
```

**Step 3: Check Live DOM for Current**

```javascript
liveClasses.get('app');
// Result: ['app__160d8'] ✅ Found!
```

**Step 4: Verify with GitHub**

```javascript
githubClasses.get('app');
// Result: ['app__160d8'] ✅ Matches!
```

**Step 5: Decision**

```
Verified by: Live DOM + GitHub
Action: UPDATE
  .app-3xd6d0 → .app__160d8
```

**Step 6: Apply**

```
1. Create backup: theme.css.update-2025-12-20.bak
2. Replace: .app-3xd6d0 → .app__160d8
3. Save theme
4. Notify: "Updated 1 broken class"
```

---

## Installation

### Remove Old Plugins

```bash
rm ~/Library/Application\ Support/BetterDiscord/plugins/ClassAutoUpdater.plugin.js
rm ~/Library/Application\ Support/BetterDiscord/plugins/CSSCleanupHelper.plugin.js
rm ~/Library/Application\ Support/BetterDiscord/plugins/CSSVerification.plugin.js
```

### Install Unified Plugin

```bash
cp "Better Discord/betterdiscord-dev/plugins/ThemeAutoMaintainer.plugin.js" \
   ~/Library/Application\ Support/BetterDiscord/plugins/

# Or symlink for development
ln -s "$PWD/Better Discord/betterdiscord-dev/plugins/ThemeAutoMaintainer.plugin.js" \
      ~/Library/Application\ Support/BetterDiscord/plugins/
```

### Enable Plugin

1. Restart Discord (Cmd+R)
2. Settings → Plugins → Enable "Theme Auto Maintainer"
3. Wait 3 seconds for initial check
4. Check console for: `[ThemeAutoMaintainer] ...`

---

## Configuration

### Recommended Settings (Safe & Automatic)

**Monitoring & Updates:**

- Auto-Update Broken Classes: **ON** ✅
- Check on Discord Startup: **ON** ✅
- Check Interval: **30 minutes** ✅

**Verification & Safety:**

- Scan Live Discord DOM: **ON** ✅
- Verify with GitHub Repo: **ON** ✅
- Require Both Verifications: **ON** ✅ (safest)

**Cleanup & Backups:**

- Auto-Cleanup Unused: **OFF** ⚠️ (manual review safer)
- Comment Instead of Remove: **ON** ✅
- Backup Interval: **24 hours** ✅
- Max Backups: **10** ✅

**Notifications:**

- Show Notifications: **ON** ✅
- Verbose Logging: **OFF** (enable for debugging)

### Aggressive Settings (Maximum Automation)

**For fully hands-off maintenance:**

- Auto-Update: ON
- Auto-Cleanup: ON (⚠️ review first!)
- Check Interval: 15 minutes
- Backup Interval: 6 hours
- Comment Mode: ON (safer)

---

## Usage

### Automatic Mode (Recommended)

**Set it and forget it:**

1. Install plugin
2. Enable recommended settings
3. Plugin handles everything:
   - Checks on startup
   - Monitors every 30 minutes
   - Auto-updates broken classes
   - Creates daily backups
   - Logs all changes

**You do nothing!** ✨

### Manual Mode

**For manual control:**

**1. Run Check**

- Settings → Theme Auto Maintainer → Manual Actions
- Click "🔍 Run Full Check"
- Wait 5-10 seconds

**2. View Report**

- Click "📊 View Detailed Report"
- Review two sections:
  - ✅ Broken Classes (updatable)
  - ⚠️ Truly Unused (removable)

**3. Apply Updates**

- Click "🔄 Apply Updates Now"
- Broken classes fixed automatically
- Backup created

**4. Clean Unused**

- Click "🧹 Comment Out Unused"
- Unused selectors marked
- Backup created

**5. Manual Review**

- Open theme CSS
- Search: `/* UNUSED:`
- Review and delete confirmed
- Test theme

---

## Verification Modes

### Mode 1: Live DOM Only (Fastest)

```
Settings:
  - Live DOM: ON
  - GitHub: OFF
  - Require Both: OFF

Result:
  - Instant class detection
  - No GitHub lag
  - No internet needed (after initial load)

Use when: Offline, testing, speed priority
```

### Mode 2: GitHub Only (Safest for Updates)

```
Settings:
  - Live DOM: OFF
  - GitHub: ON
  - Require Both: OFF

Result:
  - Verified class mappings
  - Works before Discord fully loads
  - Relies on maintained repo

Use when: GitHub repo is up-to-date
```

### Mode 3: Dual Verification (Recommended)

```
Settings:
  - Live DOM: ON
  - GitHub: ON
  - Require Both: ON

Result:
  - Only updates if BOTH sources agree
  - Maximum safety
  - Prevents false positives

Use when: Production themes, cautious updates
```

### Mode 4: DOM Priority with GitHub Fallback

```
Settings:
  - Live DOM: ON
  - GitHub: ON
  - Require Both: OFF

Result:
  - Uses live DOM as primary source
  - GitHub confirms semantic names
  - Fastest + Safe balance

Use when: Daily use (BEST)
```

---

## Backup System

### Backup Types

**1. Periodic Backups** (Scheduled)

- Location: `~/Library/Application Support/BetterDiscord/themes/backups/`
- Format: `ThemeName.theme.css.2025-12-20T16-30-00.bak`
- Frequency: Configurable (default: 24 hours)
- Auto-cleanup: Keeps last N backups (default: 10)

**2. Update Backups** (Before class updates)

- Location: Same folder as theme
- Format: `ThemeName.theme.css.update-2025-12-20T16-30-00.bak`
- When: Before applying class updates
- Kept: All (manual cleanup)

**3. Cleanup Backups** (Before removing unused)

- Location: Same folder as theme
- Format: `ThemeName.theme.css.cleanup-2025-12-20T16-30-00.bak`
- When: Before cleaning unused selectors
- Kept: All (manual cleanup)

### Restore from Backup

**Find backups:**

```bash
# List periodic backups
ls ~/Library/Application\ Support/BetterDiscord/themes/backups/

# List update backups
ls ~/Library/Application\ Support/BetterDiscord/themes/*.update-*.bak

# List cleanup backups
ls ~/Library/Application\ Support/BetterDiscord/themes/*.cleanup-*.bak
```

**Restore:**

```bash
# Restore from periodic backup
cp ~/Library/Application\ Support/BetterDiscord/themes/backups/SoloLeveling.theme.css.2025-12-20T12-00-00.bak \
   ~/Library/Application\ Support/BetterDiscord/themes/SoloLeveling-ClearVision.theme.css

# Restore from update backup (latest)
cp ~/Library/Application\ Support/BetterDiscord/themes/*.update-*.bak \
   ~/Library/Application\ Support/BetterDiscord/themes/SoloLeveling-ClearVision.theme.css
```

---

## Complete Workflow Example

### Solo Leveling Theme Maintenance

**Initial State:**

- Theme: 4266 lines
- Unknown issues

**Step 1: Install & Configure (One-Time)**

```bash
# Install plugin
cp ThemeAutoMaintainer.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/

# Restart Discord
# Enable plugin
# Configure recommended settings
```

**Step 2: First Run (Automatic)**

```
On Discord startup:
  → Plugin loads
  → Scans live DOM (finds 2867 current classes)
  → Loads GitHub repo (finds 2867 verified classes)
  → Analyzes Solo Leveling theme
  → Finds: 2 broken classes, 320 unused selectors
  → Auto-updates 2 broken classes (backup created)
  → Notifies: "Updated 2 broken classes!"
```

**Step 3: Review Unused (Manual)**

```
Settings → View Detailed Report
  → ⚠️ Truly Unused: 320 selectors
  → Click "Comment Out Unused"
  → Confirms: Backup created
  → Notifies: "Cleaned 320 unused selectors!"
```

**Step 4: Manual Review**

```
Open theme CSS
Search: /* UNUSED:
Review each commented block
Delete confirmed unused (315 blocks)
Keep visual effects (5 pseudo-elements)
```

**Step 5: Ongoing (Automatic)**

```
Every 30 minutes:
  → Plugin checks for changes
  → Auto-updates if Discord changed classes
  → Logs changes

Every 24 hours:
  → Creates backup
  → Keeps last 10 backups
  → Auto-deletes old backups
```

**Final State:**

- Theme: 3951 lines (7.4% smaller)
- All selectors used and current
- Daily backups maintained
- Zero maintenance required

---

## Console Commands

```javascript
// Access plugin
const plugin = BdApi.Plugins.get('Theme Auto Maintainer').instance;

// View current live classes
plugin.liveClasses;

// View GitHub classes
plugin.githubClasses;

// View broken classes (updatable)
plugin.updatableSelectors;

// View unused selectors
plugin.unusedSelectors;

// Force full check
plugin.performFullCheck();

// Apply updates manually
plugin.applyUpdates();

// Clean unused manually
plugin.cleanUnused();

// Create backup now
plugin.createBackups();

// Export report
plugin.exportReport();
```

---

## Troubleshooting

### No Classes Detected

**Live DOM returns empty:**

- Wait 5 seconds after Discord loads
- Restart Discord (Cmd+R)
- Check console for errors

**GitHub fails to load:**

- Check internet connection
- Retry: `plugin.loadGitHubRepo()`
- Continue with live DOM only

### Plugin Not Updating

**Check settings:**

- Auto-Update: ON
- Check Interval: >0
- Plugin enabled: YES

**Check console:**

```javascript
// Should show periodic logs
[ThemeAutoMaintainer] Performing full theme check
```

### Backups Not Creating

**Check settings:**

- Backup Interval: >0
- Max Backups: >0

**Check backup folder:**

```bash
ls ~/Library/Application\ Support/BetterDiscord/themes/backups/
```

---

## Performance

**Resource Usage:**

- Memory: <10MB (class maps + plugin state)
- CPU: <1% (only during checks)
- Network: ~1MB (GitHub JSON, once per session)

**Operation Speed:**

- Live DOM scan: <100ms
- GitHub fetch: 200-500ms (first time only)
- Theme analysis: 50-100ms per theme
- Update application: <50ms
- Total check time: <1 second

**Background Impact:**

- Mutation observer: Negligible
- Periodic checks: <100ms every 30 min
- No FPS impact
- No lag or stuttering

---

## Best Practices

### ✅ DO

**For Daily Use:**

- Enable auto-update (hands-free)
- Use dual verification (safest)
- Keep comment mode ON (review first)
- Enable periodic backups (never lose work)

**For Theme Development:**

- Enable verbose logging (debugging)
- Use live DOM (real-time feedback)
- Manual cleanup mode (controlled changes)
- Export reports (documentation)

**After Discord Updates:**

- Plugin auto-detects and updates
- Check report for changes
- Test theme thoroughly
- Review backups if issues

### ❌ DON'T

**Avoid These:**

- Don't disable both verification sources
- Don't enable auto-cleanup without testing first
- Don't delete all backups (keep at least 3)
- Don't skip manual review of commented selectors
- Don't remove pseudo-elements without checking visual effects

---

## Integration with Workflow

### Solo Leveling Theme Suite

**Plugins Working Together:**

```
Theme Auto Maintainer (This plugin):
  → Maintains CSS classes
  → Cleans unused selectors
  → Creates backups

CriticalHit.plugin.js:
  → Chat effects
  → Uses maintained CSS

Dungeons.plugin.js:
  → Game mechanics
  → Uses maintained CSS

All plugins benefit from clean, up-to-date theme!
```

### Python Scripts (Complementary)

**Plugin vs. Python:**

```
Plugin:
  - Real-time monitoring (Discord running)
  - Live DOM accuracy
  - User-friendly
  - Automatic

Python:
  - Scheduled checks (Discord off)
  - CI/CD integration
  - Batch processing
  - Command-line
```

**Use Both:**

- Plugin: Daily use
- Python: CI/CD, automation

---

## Advanced Features

### Custom Verification Rules

**Edit verification logic:**

```javascript
// Require minimum verification count
checkForUpdate(selector) {
  const verifiedBy = [];

  // Check all sources
  if (liveDOM.has(semantic)) verifiedBy.push('DOM');
  if (github.has(semantic)) verifiedBy.push('GitHub');

  // Custom rule: require at least 1 source
  if (verifiedBy.length >= 1) {
    return {semantic, newClass, verifiedBy};
  }

  return null;
}
```

### Selective Theme Processing

**Filter specific themes:**

```javascript
// Only process Solo Leveling theme
analyzeAllThemes() {
  const themeFiles = fs.readdirSync(themesPath)
    .filter(f => f.includes('SoloLeveling'));
  // ...
}
```

### Export Enhanced Reports

**Add custom data to reports:**

```javascript
exportReport() {
  const report = {
    // ... standard data
    custom: {
      verificationMode: this.getVerificationMode(),
      classStats: this.getClassStats(),
      changeHistory: this.getChangeHistory()
    }
  };
  // ...
}
```

---

## Migration from Old Plugins

### From ClassAutoUpdater

**What Carries Over:**

- ✅ Live DOM scanning
- ✅ Auto-update capability
- ✅ Periodic monitoring
- ✅ Notifications

**What's New:**

- ✅ GitHub verification
- ✅ Unused selector cleanup
- ✅ Periodic backups
- ✅ Multi-source verification

### From CSSCleanupHelper

**What Carries Over:**

- ✅ Unused selector detection
- ✅ Categorization
- ✅ Line numbers
- ✅ Comment mode

**What's New:**

- ✅ Live DOM integration
- ✅ Auto-update before cleanup
- ✅ Periodic backups
- ✅ Automated workflow

### Settings Migration

**Old ClassAutoUpdater settings:**

```
autoUpdate → autoUpdate (same)
checkOnStartup → checkOnStartup (same)
checkInterval → checkInterval (same)
useGitHubVerify → useGitHub (renamed)
showNotifications → showNotifications (same)
```

**Old CSSCleanupHelper settings:**

```
checkGitHub → useGitHub (renamed)
commentInsteadOfRemove → commentInsteadOfRemove (same)
showLineNumbers → (always enabled)
```

---

## Roadmap

**Planned Features:**

- [ ] Visual diff preview before updates
- [ ] Rollback last N changes
- [ ] A/B testing mode (compare before/after)
- [ ] Export class change history
- [ ] Integration with git (auto-commit backups)
- [ ] Selective update approval
- [ ] Theme templates (save clean versions)
- [ ] Multi-theme sync (update all at once)

---

## Files & Resources

**Plugin:**

- `Better Discord/betterdiscord-dev/plugins/ThemeAutoMaintainer.plugin.js`

**Old Plugins (Removed):**

- ~~`ClassAutoUpdater.plugin.js`~~ (replaced)
- ~~`CSSCleanupHelper.plugin.js`~~ (replaced)
- ~~`CSSVerification.plugin.js`~~ (replaced)

**Documentation:**

- `docs/THEME-AUTO-MAINTAINER.md` (this file)
- `docs/LIVE-CLASS-DETECTION.md` (concepts)
- `docs/CSS-CLEANUP-WORKFLOW.md` (workflow)

**Backups:**

- Periodic: `~/Library/Application Support/BetterDiscord/themes/backups/*.bak`
- Update: `~/Library/Application Support/BetterDiscord/themes/*.update-*.bak`
- Cleanup: `~/Library/Application Support/BetterDiscord/themes/*.cleanup-*.bak`

**Reports:**

- `~/Library/Application Support/BetterDiscord/themes/maintenance-report-*.json`

---

## Quick Reference

**Installation:**

```bash
rm ~/Library/Application\ Support/BetterDiscord/plugins/{ClassAutoUpdater,CSSCleanupHelper,CSSVerification}.plugin.js
cp ThemeAutoMaintainer.plugin.js ~/Library/Application\ Support/BetterDiscord/plugins/
```

**Configuration:**

- Recommended settings enabled
- Auto-update: ON
- Dual verification: ON
- Comment mode: ON

**Daily Use:**

- Zero maintenance required
- Auto-updates on startup
- Checks every 30 min
- Daily backups

**Manual Actions:**

- Run check: Settings → Manual Actions
- View report: 📊 button
- Export report: For documentation

---

**TL;DR:** Install → Enable recommended settings → Never worry about broken classes or unused code again! 🎉
