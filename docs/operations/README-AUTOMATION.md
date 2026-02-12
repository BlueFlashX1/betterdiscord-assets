# BetterDiscord Auto-Symlink Automation

## 🤖 Automated Daily Symlink Fixing

The auto-symlink script can now run automatically in the background, ensuring your BetterDiscord symlinks are always up-to-date.

## 🚀 Quick Setup

### Install Automation

```bash
cd ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev
./install-auto-symlink.sh
```

**That's it!** The script will now run automatically.

### Uninstall Automation

```bash
cd ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev
./uninstall-auto-symlink.sh
```

## ⏰ Schedule

**Default Schedule:**

- **Daily at 9:00 AM** - Runs automatically
- **On login/startup** - Runs immediately when you log in
- **Silent background** - Runs without interrupting you

### Customize Schedule

Edit the plist file to change the schedule:

```bash
# Open the plist file
open ~/Library/LaunchAgents/com.betterdiscord.auto-symlink.plist

# Or edit with your preferred editor
nano ~/Library/LaunchAgents/com.betterdiscord.auto-symlink.plist
```

**Change the `StartCalendarInterval` section:**

```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key>
    <integer>9</integer>    <!-- Change hour (0-23) -->
    <key>Minute</key>
    <integer>0</integer>     <!-- Change minute (0-59) -->
</dict>
```

**After editing, reload:**

```bash
launchctl unload ~/Library/LaunchAgents/com.betterdiscord.auto-symlink.plist
launchctl load ~/Library/LaunchAgents/com.betterdiscord.auto-symlink.plist
```

## 📊 Monitoring

### Check Status

```bash
launchctl list | grep betterdiscord
```

**Output shows:**

- PID (if running)
- Exit status
- Last run time

### View Logs

```bash
# View recent logs
tail -20 ~/Library/Logs/BetterDiscord/auto-symlink.log

# Follow logs in real-time
tail -f ~/Library/Logs/BetterDiscord/auto-symlink.log
```

### Manual Run

You can still run the script manually anytime:

```bash
cd ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev
./auto-symlink.sh
```

## 🔧 Troubleshooting

### Automation Not Running

**Check if it's loaded:**

```bash
launchctl list com.betterdiscord.auto-symlink
```

**If not loaded, reload it:**

```bash
launchctl load ~/Library/LaunchAgents/com.betterdiscord.auto-symlink.plist
```

**Check logs for errors:**

```bash
cat ~/Library/Logs/BetterDiscord/auto-symlink.log
```

### Script Path Changed

If you move the `betterdiscord-dev` directory:

1. **Uninstall old automation:**

   ```bash
   ./uninstall-auto-symlink.sh
   ```

2. **Reinstall from new location:**

   ```bash
   cd /new/location/betterdiscord-dev
   ./install-auto-symlink.sh
   ```

The auto-detection will handle the new path automatically!

### Permission Issues

If you see permission errors:

```bash
# Make sure script is executable
chmod +x ~/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev/auto-symlink.sh

# Check LaunchAgent permissions
ls -la ~/Library/LaunchAgents/com.betterdiscord.auto-symlink.plist
```

## 📋 Recommended Frequencies

### Daily (Default) ✅

**Best for:** Most users

- Ensures symlinks stay fixed
- Low overhead
- Catches any directory moves

### Every 6 Hours

**Best for:** Active development

- More frequent updates
- Catches changes faster

**To set:**

```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key>
    <integer>0</integer>
    <key>Minute</key>
    <integer>0</integer>
</dict>
```

Then add multiple intervals or use a different approach.

### On Login Only

**Best for:** Minimal automation

- Only runs when you log in
- No background scheduling

**To set:** Remove `StartCalendarInterval` section, keep only `RunAtLoad`.

### Hourly

**Best for:** Very active development

- Maximum freshness
- More frequent runs

**Note:** Hourly might be overkill for most users.

## 🎯 How It Works

1. **LaunchAgent** - macOS background service
2. **Runs automatically** - No user interaction needed
3. **Logs everything** - Check logs to see what happened
4. **Auto-detects paths** - Works even if you move directories

## 📁 Files Created

- `~/Library/LaunchAgents/com.betterdiscord.auto-symlink.plist` - LaunchAgent config
- `~/Library/Logs/BetterDiscord/auto-symlink.log` - Log file

## ✅ Benefits

1. **Set it and forget it** - Runs automatically
2. **Always up-to-date** - Symlinks fixed daily
3. **No manual work** - Zero maintenance
4. **Works after moves** - Auto-detection handles directory changes
5. **Logged** - See what happened in logs

## 🎉 Summary

**Install once, runs forever:**

```bash
./install-auto-symlink.sh
```

**Your BetterDiscord symlinks will be automatically fixed:**

- ✅ Daily at 9 AM
- ✅ On every login
- ✅ Silently in background
- ✅ Logged for monitoring

**No more broken symlinks!** 🚀
