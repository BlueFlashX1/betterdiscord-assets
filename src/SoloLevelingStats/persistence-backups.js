module.exports = {
  readFileBackup() {
    if (!this.fileBackupPath) return null;
    try {
      const fs = require('fs');

      const getCandidate = (path, source) => {
        try {
          if (!fs.existsSync(path)) return null;
          const raw = fs.readFileSync(path, 'utf8');
          const data = JSON.parse(raw);

          let quality = 0;
          try {
            quality = this._getSettingsCandidateQuality(data);
          } catch (_) {
            quality = 0;
          }
          const stat = fs.statSync(path);
          const ts = Date.parse(data?._metadata?.lastSave || '') || stat.mtimeMs || 0;

          return {
            source,
            data,
            quality: Number.isFinite(quality) ? quality : 0,
            ts: Number.isFinite(ts) ? ts : 0,
            path,
          };
        } catch (e) {
          return null;
        }
      };

      const candidates = [];
      const mainCandidate = getCandidate(this.fileBackupPath, 'file');
      if (mainCandidate) candidates.push(mainCandidate);
      for (let i = 1; i <= 5; i++) {
        const backupCandidate = getCandidate(`${this.fileBackupPath}.bak${i}`, 'file');
        if (backupCandidate) candidates.push(backupCandidate);
      }

      if (candidates.length === 0) return null;

      candidates.sort((a, b) => {
        if (b.quality !== a.quality) return b.quality - a.quality;
        return b.ts - a.ts;
      });

      if (candidates.length > 1) {
        this.debugLog(
          'READ_FILE_BACKUP',
          `Found ${candidates.length} backups. Best: ${candidates[0].path} (Q:${candidates[0].quality})`
        );
      }

      return candidates[0].data;
    } catch (error) {
      this.debugError('LOAD_SETTINGS_FILE', error);
      return null;
    }
  },

  writeFileBackup(data) {
    if (!this.fileBackupPath) return false;
    try {
      const fs = require('fs');

      const maxBackups = 5;
      for (let i = maxBackups - 1; i >= 0; i--) {
        const src = i === 0 ? this.fileBackupPath : `${this.fileBackupPath}.bak${i}`;
        const dest = `${this.fileBackupPath}.bak${i + 1}`;
        if (fs.existsSync(src)) {
          try {
            const content = fs.readFileSync(src);
            fs.writeFileSync(dest, content);
          } catch (e) {
            this.debugError('ROTATE_BACKUP', e);
          }
        }
      }

      const jsonStr = JSON.stringify(data, null, 2);
      const tmpPath = `${this.fileBackupPath}.tmp`;
      fs.writeFileSync(tmpPath, jsonStr, 'utf8');
      fs.renameSync(tmpPath, this.fileBackupPath);
      this.debugLog('SAVE_SETTINGS', 'Saved file backup (rotated)', { path: this.fileBackupPath });
      return true;
    } catch (error) {
      this.debugError('SAVE_SETTINGS_FILE', error);
      return false;
    }
  },

  checkBackups() {
    const statuses = [];
    try {
      const main = BdApi.Data.load('SoloLevelingStats', 'settings');
      statuses.push(
        main ? `BdApi.Data main: OK (${Object.keys(main).length} keys)` : 'BdApi.Data main: MISSING'
      );
    } catch (e) {
      statuses.push(`BdApi.Data main error: ${e.message}`);
    }
  
    try {
      const backup = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
      statuses.push(
        backup
          ? `BdApi.Data backup: OK (${Object.keys(backup).length} keys)`
          : 'BdApi.Data backup: MISSING'
      );
    } catch (e) {
      statuses.push(`BdApi.Data backup error: ${e.message}`);
    }
  
    try {
      const exists = this.fileBackupPath && require('fs').existsSync(this.fileBackupPath);
      if (exists) {
        const raw = require('fs').readFileSync(this.fileBackupPath, 'utf8');
        const data = JSON.parse(raw);
        statuses.push(
          `File backup: OK (${Object.keys(data || {}).length} keys, ${raw.length} bytes) at ${
            this.fileBackupPath
          }`
        );
      } else {
        statuses.push(`File backup: MISSING (${this.fileBackupPath})`);
      }
    } catch (e) {
      statuses.push(`File backup error: ${e.message}`);
    }
  
    this.debugLog('BACKUP_STATUS', 'SoloLevelingStats backup status', { statuses });
    return statuses;
  },

  async restoreFromFileBackupToStores() {
    try {
      const data = this.readFileBackup();
      if (!data) {
        this.debugLog('RESTORE_FILE_BACKUP', 'No file backup found to restore.');
        return false;
      }
      // Use deep copy to avoid reference issues
      this.settings = structuredClone({ ...this.defaultSettings, ...data });
      this.recomputeHPManaFromStats();
      await this.saveSettings(true);
      this.debugLog('RESTORE_FILE_BACKUP', 'Restored from file backup and saved to stores', {
        path: this.fileBackupPath,
      });
      return true;
    } catch (error) {
      this.debugError('RESTORE_FILE_BACKUP', error);
      return false;
    }
  },

  async checkIndexedDBBackups() {
    const SaveManager = this._UnifiedSaveManager;
    if (!SaveManager) {
      this.debugLog('INDEXEDDB_CHECK', 'UnifiedSaveManager not available for IndexedDB checks.');
      return null;
    }
    const manager = new SaveManager('SoloLevelingStats');
    await manager.init();
  
    const keys = await manager.getAllKeys();
    const result = { keys };
  
    if (keys.includes('settings') || keys.length === 0) {
      const settings = await manager.load('settings');
      if (settings) {
        result.settings = {
          exists: true,
          keys: Object.keys(settings || {}).length,
          level: settings.level,
          rank: settings.rank,
          totalXP: settings.totalXP,
        };
      } else {
        result.settings = { exists: false };
      }
    }
  
    const backups = await manager.getBackups('settings', 10);
    result.backups = backups.map((b) => ({
      id: b.id,
      timestamp: b.timestamp,
      level: b.data?.level,
      totalXP: b.data?.totalXP,
    }));
  
    this.debugLog('INDEXEDDB_STATUS', 'IndexedDB status', result);
    return result;
  },

  async restoreFromIndexedDBBackup(backupId = null) {
    const SaveManager = this._UnifiedSaveManager;
    if (!SaveManager) {
      this.debugLog('INDEXEDDB_RESTORE', 'UnifiedSaveManager not available for IndexedDB restore.');
      return false;
    }
    const manager = new SaveManager('SoloLevelingStats');
    await manager.init();
  
    let targetId = backupId;
    if (!targetId) {
      const backups = await manager.getBackups('settings', 1);
      if (!backups.length) {
        this.debugError('INDEXEDDB_RESTORE', 'No IndexedDB backups found.');
        return false;
      }
      targetId = backups[0].id;
    }
  
    const data = await manager.restoreFromBackup('settings', targetId);
    if (!data) {
      this.debugError('INDEXEDDB_RESTORE', 'Failed to restore from IndexedDB backup.');
      return false;
    }
  
    // Save restored data to BdApi.Data and file for consistency
    this.settings = structuredClone({ ...this.defaultSettings, ...data });
    this.recomputeHPManaFromStats();
    await this.saveSettings(true);
    this.debugLog('RESTORE_INDEXEDDB', 'Restored from IndexedDB backup', { backupId: targetId });
    return true;
  },

  registerBackupConsoleHooks() {
    if (!window.SLSBackupTool) {
      window.SLSBackupTool = {};
    }
    window.SLSBackupTool.checkBackups = () => this.checkBackups();
    window.SLSBackupTool.restoreFromFile = () => this.restoreFromFileBackupToStores();
    window.SLSBackupTool.checkIndexedDB = () => this.checkIndexedDBBackups();
    window.SLSBackupTool.restoreIndexedDB = (backupId) => this.restoreFromIndexedDBBackup(backupId);
  }
};
