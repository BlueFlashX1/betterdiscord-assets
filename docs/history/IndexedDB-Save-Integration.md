# IndexedDB Unified Save System - Integration Guide

## Problem

BdApi.Data can be cleared during BetterDiscord/Discord crashes, causing data loss. IndexedDB is more persistent and crash-resistant.

## Solution

UnifiedSaveManager provides:

- ✅ Crash-resistant storage (IndexedDB)
- ✅ Automatic backups (keeps last 10 per key)
- ✅ Automatic restore from backup if main save is missing
- ✅ User-specific databases (isolated per Discord user)
- ✅ Unified system for all plugins

## Quick Integration

### Step 1: Load UnifiedSaveManager

Add at the top of your plugin (after module.exports):

```javascript
// Load UnifiedSaveManager from file
let UnifiedSaveManager;
try {
  const fs = require('fs');
  const path = require('path');
  const saveManagerPath = path.join(BdApi.Plugins.folder, 'UnifiedSaveManager.js');
  const saveManagerCode = fs.readFileSync(saveManagerPath, 'utf8');
  eval(saveManagerCode);
  UnifiedSaveManager = window.UnifiedSaveManager || eval('UnifiedSaveManager');
} catch (error) {
  console.error('[PluginName] Failed to load UnifiedSaveManager:', error);
}
```

### Step 2: Initialize in Constructor

```javascript
constructor() {
  // ... existing code ...

  // Initialize UnifiedSaveManager
  this.saveManager = null;
  if (UnifiedSaveManager) {
    this.saveManager = new UnifiedSaveManager('PluginName');
  }
}
```

### Step 3: Initialize in start()

```javascript
async start() {
  // ... existing code ...

  // Initialize save manager
  if (this.saveManager) {
    try {
      await this.saveManager.init();
      this.debugLog('START', 'UnifiedSaveManager initialized');
    } catch (error) {
      this.errorLog('START', 'Failed to initialize UnifiedSaveManager', error);
      this.saveManager = null; // Fallback to BdApi.Data
    }
  }

  // Load settings (will use IndexedDB if available, fallback to BdApi.Data)
  await this.loadSettings();
}
```

### Step 4: Update loadSettings()

```javascript
async loadSettings() {
  let saved = null;

  // Try IndexedDB first (crash-resistant)
  if (this.saveManager) {
    try {
      saved = await this.saveManager.load('settings');
      if (saved) {
        this.debugLog('LOAD_SETTINGS', 'Loaded from IndexedDB');
      }
    } catch (error) {
      this.errorLog('LOAD_SETTINGS', 'IndexedDB load failed', error);
    }
  }

  // Fallback to BdApi.Data
  if (!saved) {
    try {
      saved = BdApi.Data.load('PluginName', 'settings');
      if (saved) {
        this.debugLog('LOAD_SETTINGS', 'Loaded from BdApi.Data (fallback)');
        // Migrate to IndexedDB
        if (this.saveManager) {
          await this.saveManager.save('settings', saved);
        }
      }
    } catch (error) {
      this.errorLog('LOAD_SETTINGS', 'BdApi.Data load failed', error);
    }
  }

  // Try backup if main failed
  if (!saved && this.saveManager) {
    try {
      const backups = await this.saveManager.getBackups('settings', 1);
      if (backups.length > 0) {
        saved = backups[0].data;
        this.debugLog('LOAD_SETTINGS', 'Loaded from IndexedDB backup');
        // Restore backup to main
        await this.saveManager.save('settings', saved);
      }
    } catch (error) {
      this.errorLog('LOAD_SETTINGS', 'Backup load failed', error);
    }
  }

  // Apply loaded settings
  if (saved) {
    this.settings = { ...this.defaultSettings, ...saved };
  } else {
    this.settings = { ...this.defaultSettings };
  }
}
```

### Step 5: Update saveSettings()

```javascript
saveSettings(immediate = false) {
  const cleanSettings = JSON.parse(JSON.stringify(this.settings));

  // Save to IndexedDB (primary)
  if (this.saveManager) {
    try {
      this.saveManager.save('settings', cleanSettings, true); // true = create backup
      this.debugLog('SAVE_SETTINGS', 'Saved to IndexedDB');
    } catch (error) {
      this.errorLog('SAVE_SETTINGS', 'IndexedDB save failed', error);
    }
  }

  // Also save to BdApi.Data (backup/legacy support)
  try {
    BdApi.Data.save('PluginName', 'settings', cleanSettings);
    BdApi.Data.save('PluginName', 'settings_backup', cleanSettings);
  } catch (error) {
    this.errorLog('SAVE_SETTINGS', 'BdApi.Data save failed', error);
  }
}
```

## Benefits

1. **Crash Resistance**: IndexedDB persists even if BetterDiscord crashes
2. **Automatic Backups**: Keeps last 10 saves per key automatically
3. **Auto-Restore**: Automatically restores from backup if main save is missing
4. **User Isolation**: Each Discord user has their own database
5. **Dual Storage**: Saves to both IndexedDB and BdApi.Data for maximum safety

## Console Commands

### Check IndexedDB Saves

```javascript
// Get all saves for a plugin
const manager = new UnifiedSaveManager('SoloLevelingStats');
await manager.init();
const keys = await manager.getAllKeys();
console.log('Keys:', keys);

// Load specific key
const data = await manager.load('settings');
console.log('Settings:', data);

// Get backups
const backups = await manager.getBackups('settings', 10);
console.log('Backups:', backups);

// Restore from backup
await manager.restoreFromBackup('settings', backupId);
```

## Migration Strategy

1. **Phase 1**: Add UnifiedSaveManager alongside BdApi.Data (dual save)
2. **Phase 2**: Load from IndexedDB first, fallback to BdApi.Data
3. **Phase 3**: Migrate existing BdApi.Data to IndexedDB on first load
4. **Phase 4**: Eventually remove BdApi.Data dependency (optional)

This ensures zero data loss during migration!
