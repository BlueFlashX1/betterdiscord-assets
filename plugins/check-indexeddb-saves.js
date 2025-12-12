/**
 * Console Code to Check IndexedDB Saves
 *
 * Paste this into Discord console (Ctrl+Shift+I) to check IndexedDB saves
 *
 * Usage:
 * 1. Open Discord console (Ctrl+Shift+I or Cmd+Option+I on Mac)
 * 2. Paste this entire code block
 * 3. Press Enter
 * 4. Check the output for IndexedDB save status
 */

(async function checkIndexedDBSaves() {
  console.log(
    '%c=== INDEXEDDB SAVE CHECKER ===',
    'font-size: 16px; font-weight: bold; color: #5865F2;'
  );
  console.log('');

  // Load UnifiedSaveManager
  let UnifiedSaveManager;
  try {
    // Try to load from file
    const fs = require('fs');
    const path = require('path');
    const saveManagerPath = path.join(BdApi.Plugins.folder, 'UnifiedSaveManager.js');
    const saveManagerCode = fs.readFileSync(saveManagerPath, 'utf8');
    eval(saveManagerCode);
    UnifiedSaveManager = window.UnifiedSaveManager || eval('UnifiedSaveManager');
  } catch (error) {
    console.error('Failed to load UnifiedSaveManager:', error);
    console.log('Make sure UnifiedSaveManager.js is in your plugins folder');
    return;
  }

  const plugins = ['SoloLevelingStats', 'Dungeons', 'ShadowArmy'];
  const results = {};

  for (const pluginName of plugins) {
    console.log(`%c[${pluginName}]`, 'font-weight: bold; color: #FEE75C;');

    try {
      const manager = new UnifiedSaveManager(pluginName);
      await manager.init();

      // Get all keys
      const keys = await manager.getAllKeys();
      console.log(`  Keys found: ${keys.length > 0 ? keys.join(', ') : 'None'}`);

      // Check settings
      if (keys.includes('settings') || keys.length === 0) {
        const settings = await manager.load('settings');
        if (settings) {
          const size = JSON.stringify(settings).length;
          const keyCount = Object.keys(settings || {}).length;
          console.log(`  ✅ Settings: EXISTS (${keyCount} keys, ${size} bytes)`);

          // Show key stats
          if (settings.level !== undefined) console.log(`     Level: ${settings.level}`);
          if (settings.rank !== undefined) console.log(`     Rank: ${settings.rank}`);
          if (settings.totalXP !== undefined)
            console.log(`     Total XP: ${settings.totalXP?.toLocaleString() || 0}`);
          if (settings.userHP !== undefined)
            console.log(`     User HP: ${settings.userHP}/${settings.userMaxHP || 'N/A'}`);

          results[pluginName] = { settings: true, data: settings };
        } else {
          console.log(`  ❌ Settings: MISSING`);
          results[pluginName] = { settings: false };
        }
      }

      // Check backups
      const backups = await manager.getBackups('settings', 10);
      if (backups.length > 0) {
        console.log(`  ✅ Backups: ${backups.length} found`);
        const latest = backups[0];
        const latestDate = new Date(latest.timestamp);
        console.log(`     Latest: ${latestDate.toLocaleString()}`);

        if (results[pluginName]?.settings) {
          const mainLevel = results[pluginName].data?.level || 0;
          const backupLevel = latest.data?.level || 0;
          const mainXP = results[pluginName].data?.totalXP || 0;
          const backupXP = latest.data?.totalXP || 0;

          if (backupLevel > mainLevel || backupXP > mainXP) {
            console.log(`  ⚠️  WARNING: Latest backup is NEWER than main!`);
            console.log(`     Main: Level ${mainLevel}, XP ${mainXP.toLocaleString()}`);
            console.log(`     Backup: Level ${backupLevel}, XP ${backupXP.toLocaleString()}`);
            console.log(
              `     %cYou should restore from backup!`,
              'color: #ED4245; font-weight: bold;'
            );
          }
        }

        results[pluginName].backups = backups;
      } else {
        console.log(`  ❌ Backups: NONE`);
        results[pluginName].backups = [];
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      results[pluginName] = { error: error.message };
    }

    console.log('');
  }

  // Summary
  console.log('%c=== SUMMARY ===', 'font-size: 14px; font-weight: bold; color: #5865F2;');

  let hasIssues = false;
  for (const [pluginName, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`❌ ${pluginName}: Error - ${result.error}`);
      hasIssues = true;
    } else if (!result.settings && result.backups?.length === 0) {
      console.log(`❌ ${pluginName}: No saves found in IndexedDB`);
      hasIssues = true;
    } else if (!result.settings && result.backups?.length > 0) {
      console.log(`⚠️  ${pluginName}: Main missing, ${result.backups.length} backup(s) available`);
      hasIssues = true;
    } else if (result.settings && result.backups?.length > 0) {
      const mainLevel = result.data?.level || 0;
      const backupLevel = result.backups[0]?.data?.level || 0;
      if (backupLevel > mainLevel) {
        console.log(`⚠️  ${pluginName}: Backup is newer (should restore)`);
        hasIssues = true;
      } else {
        console.log(`✅ ${pluginName}: All saves OK (${result.backups.length} backups)`);
      }
    } else {
      console.log(`✅ ${pluginName}: Settings OK (no backups yet)`);
    }
  }

  console.log('');

  // Restore function
  if (hasIssues) {
    console.log(
      '%c=== RESTORE FUNCTION ===',
      'font-size: 14px; font-weight: bold; color: #ED4245;'
    );
    console.log('To restore from backup, use:');
    console.log('');
    console.log('restoreFromIndexedDBBackup("SoloLevelingStats", backupId);');
    console.log('');

    window.restoreFromIndexedDBBackup = async function (pluginName, backupId) {
      try {
        const manager = new UnifiedSaveManager(pluginName);
        await manager.init();

        if (!backupId) {
          // Get latest backup
          const backups = await manager.getBackups('settings', 1);
          if (backups.length === 0) {
            console.error(`No backups found for ${pluginName}`);
            return;
          }
          backupId = backups[0].id;
        }

        console.log(`Restoring ${pluginName} from backup ${backupId}...`);
        const data = await manager.restoreFromBackup('settings', backupId);
        console.log(`✅ Successfully restored ${pluginName} from backup!`);
        console.log(`Reload Discord (Ctrl+R) to apply changes.`);
        return data;
      } catch (error) {
        console.error(`Failed to restore: ${error.message}`);
      }
    };
  }

  // Return results for programmatic access
  return results;
})();
