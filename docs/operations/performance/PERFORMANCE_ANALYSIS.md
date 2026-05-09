# macOS Performance Analysis & Optimization Guide

## System Overview

### Hardware Specs

- **CPU**: MacBook Pro M4 Pro (14-inch, 2024)
- **OS**: macOS Sequoia (25.2.0)
- **Architecture**: Apple Silicon (ARM64)

## Performance Metrics

### CPU Usage

- Monitor with: `top -l 1 -n 10`
- Check load average: `uptime`
- Normal load: < number of CPU cores

### Memory (RAM)

- Check usage: `vm_stat`
- Monitor pressure: `memory_pressure`
- Check swap: `sysctl vm.swapusage`
- **Warning signs**: High memory pressure, swap usage > 0

### Disk Storage

- Check usage: `df -h /`
- Find large files: `find ~ -type f -size +100M`
- Check node_modules: `find ~ -name node_modules -type d -exec du -sh {} \;`

### GPU

- Check info: `system_profiler SPDisplaysDataType`
- M4 Pro has integrated GPU (shared memory)

## Common Performance Issues

### 1. Too Many Running Processes

**Symptoms**: Slow response, high CPU usage
**Solution**:

```bash
# Check running processes
ps aux | wc -l

# Kill unnecessary processes
killall [process_name]

# Disable startup items
launchctl list | grep [service]
launchctl unload [service_path]
```

### 2. High Memory Usage

**Symptoms**: System slowdown, swap usage
**Solution**:

```bash
# Check memory pressure
memory_pressure

# Clear system caches (requires restart)
sudo purge

# Close memory-intensive apps
# Check Activity Monitor for memory hogs
```

### 3. Disk Space Issues

**Symptoms**: Slow disk I/O, system warnings
**Solution**:

```bash
# Find large files
find ~ -type f -size +100M -exec ls -lh {} \;

# Clean node_modules
find ~/Documents/DEVELOPMENT -name node_modules -type d -prune -exec rm -rf {} \;

# Clear caches
rm -rf ~/Library/Caches/*
```

### 4. Browser/Electron Apps

**Symptoms**: High CPU/RAM usage
**Common culprits**:

- Chrome/Chromium (multiple processes)
- Discord (Electron app)
- Cursor/VS Code (Electron app)
- Slack (Electron app)

**Solution**:

- Close unused tabs/windows
- Disable unnecessary extensions
- Restart browser/IDE periodically

### 5. Docker Containers

**Symptoms**: High resource usage
**Solution**:

```bash
# Check running containers
docker ps

# Stop unused containers
docker stop [container_id]

# Remove stopped containers
docker container prune

# Check resource usage
docker stats
```

### 6. Python Processes

**Symptoms**: Background scripts consuming resources
**Solution**:

```bash
# Find Python processes
ps aux | grep python

# Kill specific process
kill [PID]

# Kill all Python processes (careful!)
killall Python
```

## Optimization Recommendations

### Immediate Actions

1. **Close Unused Applications**

   - Check Activity Monitor (Cmd+Space, type "Activity Monitor")
   - Quit apps you're not using

2. **Restart Regularly**

   - macOS benefits from periodic restarts
   - Clears memory leaks and cached processes

3. **Clear System Caches**

   ```bash
   # Clear user caches
   rm -rf ~/Library/Caches/*

   # Clear system caches (requires sudo)
   sudo purge
   ```

4. **Manage Startup Items**

   ```bash
   # View startup items
   launchctl list

   # Disable unnecessary startup items
   # System Preferences → Users & Groups → Login Items
   ```

5. **Clean Disk Space**

   ```bash
   # Find large files
   du -sh ~/Documents/DEVELOPMENT/* | sort -hr

   # Remove node_modules
   find ~/Documents/DEVELOPMENT -name node_modules -type d -prune -exec rm -rf {} \;

   # Remove .git directories (if not needed)
   find ~/Documents/DEVELOPMENT -name .git -type d -prune -exec du -sh {} \;
   ```

### Long-term Optimizations

1. **Monitor Resource Usage**

   - Use Activity Monitor regularly
   - Set up alerts for high CPU/memory usage

2. **Optimize Development Environment**

   - Use `.gitignore` to exclude large files
   - Clean node_modules regularly
   - Use Docker efficiently (stop unused containers)

3. **Browser Optimization**

   - Limit open tabs
   - Disable unused extensions
   - Use browser task manager to identify resource hogs

4. **IDE Optimization**

   - Disable unused extensions in Cursor/VS Code
   - Limit workspace size
   - Exclude large directories from indexing

5. **System Maintenance**
   - Run Disk Utility periodically
   - Keep macOS updated
   - Monitor disk health

## Monitoring Commands

### Quick Health Check

```bash
# System overview
uptime
vm_stat
df -h /

# Top processes
top -l 1 -n 10

# Memory pressure
memory_pressure
```

### Detailed Analysis

```bash
# CPU usage by process
ps aux | sort -rk 3,3 | head -10

# Memory usage by process
ps aux | sort -rk 4,4 | head -10

# Disk usage by directory
du -sh ~/Documents/DEVELOPMENT/* | sort -hr

# Large files
find ~/Documents/DEVELOPMENT -type f -size +100M
```

## Performance Benchmarks

### Normal Ranges

- **CPU Usage**: < 50% idle
- **Memory Pressure**: Normal (not "Warning" or "Critical")
- **Disk Usage**: < 80% full
- **Load Average**: < number of CPU cores
- **Process Count**: < 200 processes

### Warning Signs

- Memory pressure: Warning or Critical
- Swap usage: > 0 GB
- Disk usage: > 85% full
- Load average: > number of CPU cores
- CPU usage: Consistently > 80%

## Troubleshooting Steps

1. **Identify Resource Hogs**

   ```bash
   top -l 1 -n 20
   ```

2. **Check Memory Pressure**

   ```bash
   memory_pressure
   ```

3. **Find Large Files**

   ```bash
   find ~ -type f -size +100M -exec ls -lh {} \;
   ```

4. **Check Disk Health**

   ```bash
   diskutil info /
   ```

5. **Monitor Real-time Usage**

   ```bash
   # CPU and memory
   top -o cpu

   # Disk I/O
   iostat -w 1
   ```

## Emergency Performance Fixes

### If System is Frozen/Slow

1. **Force Quit Applications**

   - Cmd+Option+Esc → Force Quit
   - Or: `killall [app_name]`

2. **Clear Memory**

   ```bash
   sudo purge
   ```

3. **Restart System**

   ```bash
   sudo reboot
   ```

4. **Safe Mode**
   - Hold Shift during boot
   - Clears caches and disables startup items

## Regular Maintenance Schedule

### Daily

- Close unused applications
- Monitor Activity Monitor

### Weekly

- Clear browser caches
- Restart system
- Check disk space

### Monthly

- Clean node_modules
- Review startup items
- Check for large files
- Update software

### Quarterly

- Full system cleanup
- Disk health check
- Review installed applications
