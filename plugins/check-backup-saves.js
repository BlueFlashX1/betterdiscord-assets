/**
 * Console Code to Check for Backup Saves
 *
 * Paste this into Discord console (Ctrl+Shift+I) to check if you have backup saves
 *
 * Usage:
 * 1. Open Discord console (Ctrl+Shift+I or Cmd+Option+I on Mac)
 * 2. Paste this entire code block
 * 3. Press Enter
 * 4. Check the output for backup status
 */

(function checkBackupSaves() {
  console.log(
    '%c=== BACKUP SAVE CHECKER ===',
    'font-size: 16px; font-weight: bold; color: #5865F2;'
  );
  console.log('');

  const plugins = {
    SoloLevelingStats: {
      main: 'settings',
      backup: 'settings_backup',
      name: 'Solo Leveling Stats',
    },
    Dungeons: {
      main: 'settings',
      backup: 'settings_backup',
      name: 'Dungeons',
    },
    ShadowArmy: {
      main: 'settings',
      backup: null, // Check if exists
      name: 'Shadow Army',
    },
  };

  const path = require('path');
  const fs = require('fs');
  const pluginsFolder = BdApi.Plugins.folder;
  const results = {};

  // Check each plugin
  for (const [pluginId, config] of Object.entries(plugins)) {
    const pluginName = config.name;
    const mainKey = config.main;
    const backupKey = config.backup || `${mainKey}_backup`;

    console.log(`%c[${pluginName}]`, 'font-weight: bold; color: #FEE75C;');

    try {
      // Check main save
      const mainData = BdApi.Data.load(pluginId, mainKey);
      const mainExists = mainData !== null && mainData !== undefined;

      if (mainExists) {
        const mainSize = JSON.stringify(mainData).length;
        const mainKeys = Object.keys(mainData || {}).length;
        console.log(`  ✅ Main save: EXISTS (${mainKeys} keys, ${mainSize} bytes)`);

        // Show key stats
        if (mainData.level !== undefined) console.log(`     Level: ${mainData.level}`);
        if (mainData.rank !== undefined) console.log(`     Rank: ${mainData.rank}`);
        if (mainData.totalXP !== undefined)
          console.log(`     Total XP: ${mainData.totalXP?.toLocaleString() || 0}`);
        if (mainData.userHP !== undefined)
          console.log(`     User HP: ${mainData.userHP}/${mainData.userMaxHP || 'N/A'}`);

        results[pluginId] = { main: true, mainData };
      } else {
        console.log(`  ❌ Main save: MISSING`);
        results[pluginId] = { main: false };
      }

      // Check backup save
      try {
        const backupData = BdApi.Data.load(pluginId, backupKey);
        const backupExists = backupData !== null && backupData !== undefined;

        if (backupExists) {
          const backupSize = JSON.stringify(backupData).length;
          const backupKeys = Object.keys(backupData || {}).length;
          console.log(`  ✅ Backup save: EXISTS (${backupKeys} keys, ${backupSize} bytes)`);

          // Compare with main
          if (mainExists) {
            const mainLevel = mainData.level || 0;
            const backupLevel = backupData.level || 0;
            const mainXP = mainData.totalXP || 0;
            const backupXP = backupData.totalXP || 0;

            if (backupLevel > mainLevel || backupXP > mainXP) {
              console.log(`  ⚠️  WARNING: Backup is NEWER than main save!`);
              console.log(`     Main: Level ${mainLevel}, XP ${mainXP.toLocaleString()}`);
              console.log(`     Backup: Level ${backupLevel}, XP ${backupXP.toLocaleString()}`);
              console.log(
                `     %cYou should restore from backup!`,
                'color: #ED4245; font-weight: bold;'
              );
            } else if (backupLevel < mainLevel || backupXP < mainXP) {
              console.log(`  ℹ️  Backup is older than main (this is normal)`);
            } else {
              console.log(`  ✅ Backup matches main save`);
            }
          } else {
            console.log(`  ⚠️  Main save missing but backup exists!`);
            console.log(
              `     %cYou can restore from backup!`,
              'color: #ED4245; font-weight: bold;'
            );
          }

          results[pluginId].backup = true;
          results[pluginId].backupData = backupData;
        } else {
          console.log(`  ❌ Backup save: MISSING`);
          results[pluginId].backup = false;
        }
      } catch (backupError) {
        console.log(`  ❌ Backup check failed: ${backupError.message}`);
        results[pluginId].backup = false;
      }

      // Check JSON file backup in plugins folder (e.g., SoloLevelingStats.data.json)
      try {
        const fileBackupPath = path.join(pluginsFolder, `${pluginId}.data.json`);
        const hasFile = fs.existsSync(fileBackupPath);
        if (hasFile) {
          const raw = fs.readFileSync(fileBackupPath, 'utf8');
          const fileData = JSON.parse(raw);
          const fileSize = raw.length;
          const fileKeys = Object.keys(fileData || {}).length;
          console.log(`  ✅ File backup: EXISTS (${fileKeys} keys, ${fileSize} bytes)`);
          results[pluginId].file = true;
          results[pluginId].fileData = fileData;
          // Quick comparison with main if both exist
          if (mainExists) {
            const mainLevel = mainData.level || 0;
            const fileLevel = fileData.level || 0;
            const mainXP = mainData.totalXP || 0;
            const fileXP = fileData.totalXP || 0;
            if (fileLevel > mainLevel || fileXP > mainXP) {
              console.log(`  ⚠️  File backup is NEWER than main save!`);
            }
          } else {
            console.log(`  ⚠️  Main missing but file backup exists (can restore).`);
          }
        } else {
          console.log(`  ❌ File backup: MISSING (${fileBackupPath})`);
          results[pluginId].file = false;
        }
      } catch (fileErr) {
        console.log(`  ❌ File backup check failed: ${fileErr.message}`);
        results[pluginId].file = false;
      }
    } catch (error) {
      console.log(`  ❌ Error checking ${pluginName}: ${error.message}`);
      results[pluginId] = { error: error.message };
    }

    console.log('');
  }

  // Summary
  console.log('%c=== SUMMARY ===', 'font-size: 14px; font-weight: bold; color: #5865F2;');

  let hasIssues = false;
  for (const [pluginId, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`❌ ${plugins[pluginId].name}: Error - ${result.error}`);
      hasIssues = true;
    } else if (!result.main && !result.backup) {
      console.log(`❌ ${plugins[pluginId].name}: No saves found (complete data loss)`);
      hasIssues = true;
    } else if (!result.main && result.backup) {
      console.log(`⚠️  ${plugins[pluginId].name}: Main missing, backup available (can restore)`);
      hasIssues = true;
    } else if (result.main && result.backup) {
      const mainLevel = result.mainData?.level || 0;
      const backupLevel = result.backupData?.level || 0;
      if (backupLevel > mainLevel) {
        console.log(`⚠️  ${plugins[pluginId].name}: Backup is newer (should restore)`);
        hasIssues = true;
      } else {
        console.log(`✅ ${plugins[pluginId].name}: All saves OK`);
      }
    } else {
      console.log(`⚠️  ${plugins[pluginId].name}: Main exists, no backup`);
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
    console.log('restoreFromBackup("SoloLevelingStats"); // or "Dungeons", "ShadowArmy"');
    console.log('');

    // Define restore function
    window.restoreFromBackup = function (pluginId) {
      const config = plugins[pluginId];
      if (!config) {
        console.error(`Unknown plugin: ${pluginId}`);
        return;
      }

      const backupKey = config.backup || `${config.main}_backup`;

      try {
        const fileBackupPath = path.join(pluginsFolder, `${pluginId}.data.json`);
        let dataToRestore = null;
        let source = null;

        if (fs.existsSync(fileBackupPath)) {
          const raw = fs.readFileSync(fileBackupPath, 'utf8');
          dataToRestore = JSON.parse(raw);
          source = 'file';
        }

        if (!dataToRestore) {
          const backupData = BdApi.Data.load(pluginId, backupKey);
          if (backupData) {
            dataToRestore = backupData;
            source = 'bd-backup';
          }
        }

        if (!dataToRestore) {
          console.error(`No backup found for ${config.name}`);
          return;
        }

        console.log(`Restoring ${config.name} from ${source} backup...`);
        BdApi.Data.save(pluginId, config.main, dataToRestore);
        console.log(`✅ Successfully restored ${config.name} from ${source}!`);
        console.log(`Reload Discord (Ctrl+R) to apply changes.`);
      } catch (error) {
        console.error(`Failed to restore: ${error.message}`);
      }
    };
  }

  // Return results for programmatic access
  return results;
})();
