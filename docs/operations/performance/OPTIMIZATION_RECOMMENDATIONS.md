# macOS Optimization Recommendations

## ✅ Current Status (Post-Restart)

### Fixed Issues
- ✅ **Swap Usage**: 0MB (was 1.75GB)
- ✅ **Xcode Compilation**: Main processes eliminated
- ✅ **Memory Pressure**: Normal (74% free)
- ⚠️ **Load Average**: Decreasing (179 → will normalize)

### Remaining Items
- ⚠️ **SwiftBar Plugin**: 2 swift-frontend processes (SwiftBar/yabai plugin - normal, low impact)
- ⚠️ **Spotlight Indexing**: 18 mdworker processes (normal after restart, will finish)

## 🎯 Optimization Actions

### 1. Prevent Xcode Background Compilation

**Problem**: Xcode was compiling multiple projects simultaneously

**Solution**:
```bash
# Disable automatic builds in Xcode
# Xcode → Preferences → General → Uncheck "Automatically refresh"
```

**Or create a script to kill Xcode builds**:
```bash
# Add to ~/.zshrc
alias killxcode='killall swift-frontend 2>/dev/null; echo "Xcode processes killed"'
```

### 2. Optimize Startup Items

**Review and disable unnecessary startup items**:

```bash
# View all startup items
launchctl list | grep -v "com.apple\|0x"

# Disable specific items (example)
launchctl unload ~/Library/LaunchAgents/com.user.hangman-bot.plist
launchctl unload ~/Library/LaunchAgents/com.user.grammar-teacher-bot.plist
```

**Items to review**:
- `com.user.hangman-bot` (Status: 1 - may be stuck)
- `com.user.grammar-teacher-bot` (Status: 78 - high CPU)
- `com.docker.helper` (if Docker not used)
- `us.zoom.updater` (if Zoom not used)

### 3. Regular Cache Cleanup

**Create automated cache cleanup**:

```bash
# Add to ~/.zshrc
alias cleancaches='rm -rf ~/Library/Caches/Vivaldi/* ~/Library/Caches/highlight-updater/* 2>/dev/null; pip cache purge 2>/dev/null; echo "Caches cleared"'
```

**Or create a weekly cleanup script**:
```bash
cat > ~/cleanup-weekly.sh << 'EOF'
#!/bin/bash
echo "Weekly cache cleanup..."
rm -rf ~/Library/Caches/Vivaldi/*
rm -rf ~/Library/Caches/highlight-updater/*
pip cache purge
echo "Done!"
EOF
chmod +x ~/cleanup-weekly.sh
```

### 4. Monitor Performance Regularly

**Use the performance check script**:
```bash
# Run weekly
~/Documents/DEVELOPMENT/betterdiscord-dev/check_performance.sh
```

**Or set up a cron job** (weekly check):
```bash
# Add to crontab
0 9 * * 1 ~/Documents/DEVELOPMENT/betterdiscord-dev/check_performance.sh >> ~/performance_log.txt
```

### 5. Optimize Cursor/VS Code

**Reduce extension processes**:
- Disable unused extensions
- Limit workspace size
- Exclude large directories from indexing

**Settings to check**:
- `files.watcherExclude`: Add large directories
- `search.exclude`: Exclude node_modules, .git, etc.

### 6. Clean node_modules Regularly

**Find and clean large node_modules**:
```bash
# Find all node_modules
find ~/Documents/DEVELOPMENT -name node_modules -type d -prune -exec du -sh {} \;

# Clean specific project
cd ~/Documents/DEVELOPMENT/test-projects/homepage
rm -rf node_modules
npm install  # Reinstall when needed
```

**Or use a cleanup script**:
```bash
cat > ~/clean-node-modules.sh << 'EOF'
#!/bin/bash
echo "Finding node_modules directories..."
find ~/Documents/DEVELOPMENT -name node_modules -type d -prune -exec du -sh {} \; | sort -hr
echo ""
read -p "Delete all node_modules? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    find ~/Documents/DEVELOPMENT -name node_modules -type d -prune -exec rm -rf {} \;
    echo "All node_modules deleted"
fi
EOF
chmod +x ~/clean-node-modules.sh
```

## 📊 Performance Monitoring

### Daily Checks
```bash
# Quick check
uptime
sysctl vm.swapusage
```

### Weekly Checks
```bash
# Full check
~/Documents/DEVELOPMENT/betterdiscord-dev/check_performance.sh

# Check for problem processes
ps aux | grep swift-frontend | grep -v grep
ps aux | sort -rk 3,3 | head -10
```

### Monthly Maintenance
1. Clear all caches
2. Review startup items
3. Clean node_modules
4. Check disk space
5. Update software

## 🚨 Warning Thresholds

**Take action if**:
- Load average > 50 (for 12-core system)
- Swap usage > 500MB
- Process count > 600
- CPU idle < 20% consistently
- Memory free < 50%

## 🔧 Quick Fixes

### If System Feels Slow
```bash
# 1. Check load average
uptime

# 2. Check swap usage
sysctl vm.swapusage

# 3. Kill Xcode processes
killall swift-frontend

# 4. Clear memory
sudo purge

# 5. Check top processes
ps aux | sort -rk 3,3 | head -10
```

### If Memory Pressure High
```bash
# 1. Clear caches
cleancaches  # If alias set up

# 2. Close unused applications
# Activity Monitor → Quit unused apps

# 3. Restart system
sudo reboot
```

## 📝 Maintenance Schedule

### Daily
- Monitor Activity Monitor
- Close unused applications

### Weekly
- Run performance check script
- Clear browser caches
- Review running processes

### Monthly
- Full cache cleanup
- Review startup items
- Clean node_modules
- Check disk space

### Quarterly
- Full system cleanup
- Review installed applications
- Update all software
- Disk health check

## ✅ Success Metrics

**System is optimized when**:
- ✅ Load average < 20
- ✅ Swap usage = 0MB
- ✅ Memory free > 50%
- ✅ Process count < 600
- ✅ System feels responsive
- ✅ No unexpected high CPU processes

---

**Created**: 2025-11-30  
**Last Updated**: Post-restart analysis
