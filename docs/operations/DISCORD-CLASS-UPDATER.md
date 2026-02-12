# Discord Class Updater Documentation

Automated solution for maintaining BetterDiscord themes when Discord changes CSS class names.

## Problem

Discord frequently changes CSS class names (hashed classes like `.app-3xd6d0` → `.app__160d8`), breaking BetterDiscord themes. This happens because:

1. **Discord minifies CSS** - Class names are randomly generated hashes
2. **Hashes change with updates** - Each Discord update potentially changes class names
3. **Themes use specific classes** - Themes target these hashed classes for styling

**Example:**

```css
/* Before Discord update */
.app-3xd6d0 {
  background: purple;
}

/* After Discord update - broken! */
.app__160d8 {
  /* New class name */
  background: purple; /* Still uses old class, won't apply */
}
```

## Solution

We use the **DiscordClasses repository** maintained by [@IBeSarah](https://github.com/IBeSarah/DiscordClasses), which tracks current Discord class mappings.

### Architecture

```
Discord Update
   ↓
IBeSarah's Bot Updates DiscordClasses Repo
   ↓
Our Monitor Script Detects Changes
   ↓
Automatic Theme Update
   ↓
Themes Work Again!
```

## Tools

### 1. Manual Updater (`discord-class-updater.py`)

One-time manual updates for themes.

**Usage:**

```bash
# Dry run (preview changes)
python3 scripts/discord-class-updater.py themes/SoloLeveling-ClearVision.theme.css --dry-run --report

# Apply updates
python3 scripts/discord-class-updater.py themes/SoloLeveling-ClearVision.theme.css

# Use local DiscordClasses JSON
python3 scripts/discord-class-updater.py themes/MyTheme.theme.css --classes-json /path/to/discordclasses.json
```

**Features:**

- Downloads latest DiscordClasses from GitHub
- Detects broken class names in theme
- Replaces with current class names
- Creates backup before updating
- Generates detailed report

### 2. Automated Monitor (`auto-monitor-discord-classes.py`)

Continuous monitoring and automatic updates.

**Usage:**

```bash
# Check for changes (no updates)
python3 scripts/auto-monitor-discord-classes.py --check

# Update themes automatically
python3 scripts/auto-monitor-discord-classes.py --update

# Monitor specific themes
python3 scripts/auto-monitor-discord-classes.py --update --themes path/to/theme1.css path/to/theme2.css

# Setup cron job for daily checks
python3 scripts/auto-monitor-discord-classes.py --setup-cron
```

**Features:**

- Caches DiscordClasses locally
- Detects changes by comparing with cache
- Automatically updates all monitored themes
- Generates change reports
- Sends macOS notifications
- Can be scheduled via cron

### 3. Web-Based Updater

Alternative manual approach using [@SyndiShanX's tool](https://syndishanx.github.io/Website/Update_Classes.html):

1. Upload your theme CSS
2. Tool fetches latest DiscordClasses
3. Automatically updates and downloads fixed theme

## Setup

### One-Time Setup

```bash
# Install dependencies (none needed - uses Python stdlib!)

# Make scripts executable
chmod +x scripts/discord-class-updater.py
chmod +x scripts/auto-monitor-discord-classes.py

# Test the monitor
python3 scripts/auto-monitor-discord-classes.py --check
```

### Automated Monitoring (Recommended)

**Option 1: Cron (macOS/Linux)**

```bash
# Run daily at 3 AM
python3 scripts/auto-monitor-discord-classes.py --setup-cron
# Follow the instructions to add to crontab
```

**Option 2: Manual Checks**

```bash
# Check weekly
python3 scripts/auto-monitor-discord-classes.py --check

# Update when changes detected
python3 scripts/auto-monitor-discord-classes.py --update
```

## How It Works

### Class Name Pattern

Discord uses webpack-style class names:

```
semantic-name + hash
    ↓
.container_a1b2c3
```

**Format:**

- **Semantic name:** Describes purpose (e.g., `app`, `message`, `channel`)
- **Hash:** 6-character hex string (e.g., `a1b2c3`)
- **Separator:** Underscore `_` or dash `-` (older versions)

### DiscordClasses Structure

```json
{
  "3484": {
    "app": "app__160d8",
    "layers": "layers__160d8"
  },
  "3954": {
    "spoilerContent": "spoilerContent__299eb",
    "hidden": "hidden__299eb"
  }
}
```

- **Keys:** Discord module IDs
- **Values:** Semantic name → Current hashed class mappings

### Detection Algorithm

1. **Extract classes from theme**

   - Find all `.className-hash` patterns
   - Find all `[class*="className"]` patterns

2. **Compare with DiscordClasses**

   - Extract semantic names
   - Look up current hashed class
   - Flag mismatches as broken

3. **Update theme**
   - Replace old hash with new hash
   - Preserve semantic name
   - Update all formats (`.class`, `[class*=""]`)

### Example Update

**Before:**

```css
.message-abc123 {
  color: purple;
}

[class*='message-abc123'] {
  background: rgba(0, 0, 0, 0.5);
}
```

**After:**

```css
.message__def456 {
  color: purple;
}

[class*='message__def456'] {
  background: rgba(0, 0, 0, 0.5);
}
```

## Monitoring Reports

Reports are saved to `~/.cache/discord-class-monitor/reports/`

**Example Report:**

```
======================================================================
Discord Class Change Report
======================================================================
Generated: 2025-12-20 16:45:00

✏️  Modified Modules: 3

🔄 Class Changes: 5

  app:
    app-3xd6d0 → app__160d8
  message:
    message-abc123 → message__def456

📝 Theme Updates:

  ✅ SoloLeveling-ClearVision.theme.css: 2 updates
======================================================================
```

## Troubleshooting

### No Changes Detected

```bash
# Force cache refresh
rm -rf ~/.cache/discord-class-monitor/
python3 scripts/auto-monitor-discord-classes.py --update
```

### Theme Not Updating

Check:

1. Theme path is correct
2. Theme has write permissions
3. Backup file exists (`.theme.css.bak`)

### Notifications Not Working

macOS notifications require:

- Terminal/app has notification permissions
- System Preferences → Notifications → Terminal → Allow

## Best Practices

### Theme Development

**✅ DO:**

- Use semantic class selectors when possible: `[class*="message"]`
- Test themes after Discord updates
- Keep backups of working versions

**❌ DON'T:**

- Hardcode specific hashes in multiple places
- Ignore unmatched selector warnings
- Skip testing after auto-updates

### Maintenance

**Weekly:**

- Run `--check` to monitor for changes
- Review change reports

**After Discord Update:**

- Run `--update` immediately
- Test theme in Discord
- Verify all features work

## Advanced Usage

### Custom Theme Paths

```python
#!/usr/bin/env python3
from pathlib import Path
from auto_monitor_discord_classes import DiscordClassMonitor

themes = [
    Path("~/themes/MyTheme1.theme.css").expanduser(),
    Path("~/themes/MyTheme2.theme.css").expanduser(),
]

monitor = DiscordClassMonitor(themes)
monitor.run_update()
```

### Integrate with CI/CD

```bash
# .github/workflows/update-theme.yml
name: Update Discord Classes

on:
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Update classes
        run: |
          python3 scripts/discord-class-updater.py theme.css
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add theme.css
          git commit -m "Auto-update Discord classes" || true
          git push
```

## Resources

- **DiscordClasses Repo:** https://github.com/IBeSarah/DiscordClasses
- **Web Updater:** https://syndishanx.github.io/Website/Update_Classes.html
- **BetterDiscord Docs:** https://docs.betterdiscord.app/

## Changelog

### v1.0.0 (2025-12-20)

- Initial release
- Manual updater script
- Automated monitoring script
- macOS notification support
- Report generation
- Backup creation

## License

MIT License - Feel free to use and modify for your themes!
