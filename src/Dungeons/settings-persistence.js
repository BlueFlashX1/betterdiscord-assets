const { DungeonStorageManager, MobBossStorageManager } = require('./storage');

module.exports = {
  async initStorage() {
    try {
      const userId = await this.getUserId();
      this.storageManager = new DungeonStorageManager(userId);
      await this.storageManager.init();

      // Initialize MobBossStorageManager for dedicated mob/boss database
      this.mobBossStorageManager = new MobBossStorageManager(userId);
      this.mobBossStorageManager.setLogHandlers({
        debug: (message, context) => this.debugLog('MOB_BOSS_STORAGE', message, context),
        warn: (message, context) => this.debugLog('MOB_BOSS_STORAGE_WARN', message, context),
        error: (message, context, error) =>
          this.errorLog('MOB_BOSS_STORAGE', message, context, error),
      });
      await this.mobBossStorageManager.init();
      this.debugLog('MobBossStorageManager initialized successfully');
      // Silent database initialization (no console spam)
    } catch (error) {
      this.errorLog('Failed to initialize storage', error);
      this.storageManager = null;
      this.mobBossStorageManager = null;
    }
  },

  async getUserId() {
    try {
      if (window.Discord && window.Discord.user && window.Discord.user.id) {
        return window.Discord.user.id;
      }
      const UserStore =
        BdApi.Webpack?.getStore?.('UserStore') ||
        BdApi.Webpack?.getModule?.((m) => m?.getCurrentUser);
      if (UserStore && UserStore.getCurrentUser) {
        const user = UserStore.getCurrentUser();
        if (user && user.id) return user.id;
      }
    } catch (error) {
      this.debugLog('Failed to get user ID', error);
    }
    return 'default';
  },

  async _loadSettingsBackupFromIndexedDb() {
    if (!this.saveManager) return null;

    try {
      const [latestBackup] = await this.saveManager.getBackups('settings', 1);
      const backupData = latestBackup?.data || null;
      if (!backupData) return null;

      this.debugLog('LOAD_SETTINGS', 'Loaded from IndexedDB backup');

      try {
        await this.saveManager.save('settings', backupData);
        this.debugLog('LOAD_SETTINGS', 'Restored backup to main');
      } catch (restoreError) {
        this.errorLog('LOAD_SETTINGS', 'Failed to restore backup', restoreError);
      }

      return backupData;
    } catch (error) {
      this.errorLog('LOAD_SETTINGS', 'IndexedDB backup load failed', error);
      return null;
    }
  },

  async loadSettings() {
    try {
      // Try to load settings - IndexedDB first (crash-resistant), then BdApi.Data
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
          saved = BdApi.Data.load('Dungeons', 'settings');
          if (saved) {
            this.debugLog('LOAD_SETTINGS', 'Loaded from BdApi.Data (fallback)');
            // Migrate to IndexedDB
            if (this.saveManager) {
              try {
                await this.saveManager.save('settings', saved);
                this.debugLog('LOAD_SETTINGS', 'Migrated to IndexedDB');
              } catch (migrateError) {
                this.errorLog('LOAD_SETTINGS', 'Migration to IndexedDB failed', migrateError);
              }
            }
          }
        } catch (error) {
          this.errorLog('LOAD_SETTINGS', 'BdApi.Data load failed', error);
        }
      }

      // Try IndexedDB backup if main failed
      if (!saved) {
        saved = await this._loadSettingsBackupFromIndexedDb();
      }

      // Try BdApi.Data backup as last resort
      if (!saved) {
        try {
          saved = BdApi.Data.load('Dungeons', 'settings_backup');
          if (saved) {
            this.debugLog('LOAD_SETTINGS', 'Loaded from BdApi.Data backup');
            // Migrate to IndexedDB
            if (this.saveManager) {
              try {
                await this.saveManager.save('settings', saved);
                this.debugLog('LOAD_SETTINGS', 'Migrated backup to IndexedDB');
              } catch (migrateError) {
                this.errorLog('LOAD_SETTINGS', 'Migration failed', migrateError);
              }
            }
          }
        } catch (error) {
          this.errorLog('LOAD_SETTINGS', 'BdApi.Data backup load failed', error);
        }
      }

      if (saved) {
        this.settings = { ...this.defaultSettings, ...saved };

        // Backup settings before migration in case of corruption
        const preMigrationBackup = structuredClone(this.settings);

        try {
          // Version-gated migrations (only run once, not every load)
          const currentVersion = this.settings.settingsVersion || 0;
          if (currentVersion < 1) {
            // v1: Apply bossGate defaults only if not already set
            this.settings.bossGateMinDurationMs ??= this.defaultSettings.bossGateMinDurationMs;
            this.settings.bossGateRequiredMobKills ??= this.defaultSettings.bossGateRequiredMobKills;
            this.settings.settingsVersion = 1;
          }
          if (currentVersion < 2) {
            // v2: Raise legacy default mob cap from 500 -> 1000 unless user had a custom value.
            const legacyMobCap = Number(this.settings?.mobMaxActiveCap);
            if (!Number.isFinite(legacyMobCap) || legacyMobCap <= 0 || legacyMobCap === 500) {
              this.settings.mobMaxActiveCap = this.defaultSettings.mobMaxActiveCap;
            }
            this.settings.settingsVersion = 2;
          }
          if (currentVersion < 3) {
            // v3: Correct stale runtime cap from legacy 600 profile to new default 1000.
            const legacyMobCap = Number(this.settings?.mobMaxActiveCap);
            if (!Number.isFinite(legacyMobCap) || legacyMobCap <= 0 || legacyMobCap === 600) {
              this.settings.mobMaxActiveCap = this.defaultSettings.mobMaxActiveCap;
            }
            this.settings.settingsVersion = 3;
          }
        } catch (migrationError) {
          this.errorLog?.('SETTINGS', 'Migration failed, restoring backup', migrationError);
          this.settings = preMigrationBackup;
        }

        // Remove unknown keys not in defaultSettings
        const validKeys = new Set(Object.keys(this.defaultSettings));
        for (const key of Object.keys(this.settings)) {
          if (!validKeys.has(key)) {
            this.debugLog?.('SETTINGS', `Removing unknown setting key: ${key}`);
            delete this.settings[key];
          }
        }

        // Initialize user HP/Mana from stats if not set
        await this.initializeUserStats();
      } else {
        await this.initializeUserStats();
      }

      // Harden critical combat settings against stale/corrupt persisted values.
      // Bad values here can silently produce zero-mob deploys or immediate boss burn.
      const sanitizedKeys = this.sanitizeCriticalCombatSettings();
      if (sanitizedKeys.length > 0) {
        this.debugLog?.('SETTINGS', 'Sanitized combat setting keys', sanitizedKeys);
        this.saveSettings();
      }
    } catch (error) {
      this.errorLog('Failed to load settings', error);
      this.settings = { ...this.defaultSettings };
    }
  },

  sanitizeCriticalCombatSettings() {
    if (!this.settings || typeof this.settings !== 'object') return [];

    const changedKeys = [];
    const isSameValue = (a, b) => {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) return false;
        }
        return true;
      }
      return a === b;
    };
    const setIfChanged = (key, value) => {
      if (isSameValue(this.settings[key], value)) return;
      this.settings[key] = value;
      changedKeys.push(key);
    };

    const bossGateEnabled = this.settings?.bossGateEnabled !== false;
    setIfChanged('bossGateEnabled', bossGateEnabled);

    const bossGateMinDurationMsRaw = Number(this.settings?.bossGateMinDurationMs);
    const bossGateMinDurationMs =
      Number.isFinite(bossGateMinDurationMsRaw) && bossGateMinDurationMsRaw >= 5000
        ? Math.floor(bossGateMinDurationMsRaw)
        : this.defaultSettings.bossGateMinDurationMs;
    setIfChanged('bossGateMinDurationMs', bossGateMinDurationMs);

    const bossGateRequiredMobKillsRaw = Number(this.settings?.bossGateRequiredMobKills);
    const bossGateRequiredMobKills =
      Number.isFinite(bossGateRequiredMobKillsRaw) && bossGateRequiredMobKillsRaw >= 0
        ? Math.floor(bossGateRequiredMobKillsRaw)
        : this.defaultSettings.bossGateRequiredMobKills;
    setIfChanged('bossGateRequiredMobKills', bossGateRequiredMobKills);

    const mobWaveBaseCountRaw = Number(this.settings?.mobWaveBaseCount);
    const mobWaveBaseCount = Number.isFinite(mobWaveBaseCountRaw)
      ? this.clampNumber(Math.floor(mobWaveBaseCountRaw), 1, 5000)
      : this.defaultSettings.mobWaveBaseCount;
    setIfChanged('mobWaveBaseCount', mobWaveBaseCount);

    const mobWaveVariancePercentRaw = Number(this.settings?.mobWaveVariancePercent);
    const mobWaveVariancePercent = Number.isFinite(mobWaveVariancePercentRaw)
      ? this.clampNumber(mobWaveVariancePercentRaw, 0, 0.95)
      : this.defaultSettings.mobWaveVariancePercent;
    setIfChanged('mobWaveVariancePercent', mobWaveVariancePercent);

    const mobMaxActiveCapRaw = Number(this.settings?.mobMaxActiveCap);
    const mobMaxActiveCap = Number.isFinite(mobMaxActiveCapRaw)
      ? this.clampNumber(Math.floor(mobMaxActiveCapRaw), 50, 2000)
      : this.defaultSettings.mobMaxActiveCap;
    setIfChanged('mobMaxActiveCap', mobMaxActiveCap);

    const defaultRankList = Array.isArray(this.defaultSettings?.dungeonRanks)
      ? this.defaultSettings.dungeonRanks
      : ['E'];
    const incomingRankList = Array.isArray(this.settings?.dungeonRanks)
      ? this.settings.dungeonRanks
      : [];
    const normalizedRankList = [...new Set(
      incomingRankList
        .map((rank) => (typeof rank === 'string' ? rank.trim() : ''))
        .filter(Boolean)
    )];
    setIfChanged(
      'dungeonRanks',
      normalizedRankList.length > 0 ? normalizedRankList : [...defaultRankList]
    );

    return changedKeys;
  },

  getDungeonRankList() {
    const settingsRanks = Array.isArray(this.settings?.dungeonRanks)
      ? this.settings.dungeonRanks
      : [];
    const normalizedSettingRanks = [...new Set(
      settingsRanks
        .map((rank) => (typeof rank === 'string' ? rank.trim() : ''))
        .filter(Boolean)
    )];
    if (normalizedSettingRanks.length > 0) return normalizedSettingRanks;

    const defaultRanks = Array.isArray(this.defaultSettings?.dungeonRanks)
      ? this.defaultSettings.dungeonRanks
      : [];
    if (defaultRanks.length > 0) return [...defaultRanks];

    return ['E'];
  },

  getBossGateRuntimeConfig() {
    const minDurationRaw = Number(this.settings?.bossGateMinDurationMs);
    const requiredMobKillsRaw = Number(this.settings?.bossGateRequiredMobKills);
    return {
      enabled: this.settings?.bossGateEnabled !== false,
      minDurationMs:
        Number.isFinite(minDurationRaw) && minDurationRaw >= 5000
          ? Math.floor(minDurationRaw)
          : this.defaultSettings.bossGateMinDurationMs,
      requiredMobKills:
        Number.isFinite(requiredMobKillsRaw) && requiredMobKillsRaw >= 0
          ? Math.floor(requiredMobKillsRaw)
          : this.defaultSettings.bossGateRequiredMobKills,
    };
  },

  getMobWaveRuntimeConfig() {
    const baseSpawnRaw = Number(this.settings?.mobWaveBaseCount);
    const varianceRaw = Number(this.settings?.mobWaveVariancePercent);
    return {
      baseSpawnCount: Number.isFinite(baseSpawnRaw)
        ? this.clampNumber(Math.floor(baseSpawnRaw), 1, 5000)
        : this.defaultSettings.mobWaveBaseCount,
      variancePercent: Number.isFinite(varianceRaw)
        ? this.clampNumber(varianceRaw, 0, 0.95)
        : this.defaultSettings.mobWaveVariancePercent,
    };
  },

  saveSettings(immediate = false) {
    if (immediate) {
      // Cancel any pending debounced save and write now
      if (this._saveSettingsTimer) {
        this._timeouts.delete(this._saveSettingsTimer);
        clearTimeout(this._saveSettingsTimer);
        this._saveSettingsTimer = null;
      }
      this._saveSettingsDirty = false;
      return this._saveSettingsImmediate();
    }
    this._saveSettingsDirty = true;
    if (this._saveSettingsTimer) return; // Already scheduled
    this._saveSettingsTimer = setTimeout(() => {
      this._timeouts.delete(this._saveSettingsTimer);
      this._saveSettingsTimer = null;
      if (this._saveSettingsDirty) {
        this._saveSettingsDirty = false;
        this._saveSettingsImmediate();
      }
    }, 3000);
    this._timeouts.add(this._saveSettingsTimer);
  },

  markCombatSettingsDirty(reason = null) {
    this._combatSettingsDirty = true;
    if (this._perfTelemetry) {
      this._perfTelemetry.combatDirtyMarkCount = (this._perfTelemetry.combatDirtyMarkCount || 0) + 1;
      if (reason) {
        this._perfTelemetry.lastCombatDirtyReason = String(reason);
      }
    }
    const combatLoopRunning = Boolean(this._combatLoopInterval || this._combatLoopInFlight);
    if (!combatLoopRunning) {
      // No combat loop to flush from: fall back to normal debounced save path.
      this.saveSettings();
      return;
    }
    if (!this._combatSettingsFallbackFlushTimer && typeof this._setTrackedTimeout === 'function') {
      this._combatSettingsFallbackFlushTimer = this._setTrackedTimeout(() => {
        this._combatSettingsFallbackFlushTimer = null;
        this.flushCombatSettingsDirty(Date.now(), true);
      }, 2500);
    }
  },

  flushCombatSettingsDirty(now = Date.now(), force = false) {
    if (!this._combatSettingsDirty) return false;
    const flushIntervalMs = Number.isFinite(this._combatSettingsFlushIntervalMs)
      ? Math.max(500, this._combatSettingsFlushIntervalMs)
      : 1500;
    const lastFlushAt = Number(this._combatSettingsLastFlushAt) || 0;
    if (!force && now - lastFlushAt < flushIntervalMs) return false;
    this._combatSettingsLastFlushAt = now;
    this._combatSettingsDirty = false;
    if (this._combatSettingsFallbackFlushTimer) {
      this._timeouts.delete(this._combatSettingsFallbackFlushTimer);
      clearTimeout(this._combatSettingsFallbackFlushTimer);
      this._combatSettingsFallbackFlushTimer = null;
    }
    this.saveSettings();
    return true;
  },

  async _saveSettingsImmediate() {
    try {
      const now = Date.now();
      const shouldLog =
        this.settings?.debug && (!this._lastSaveLogTime || now - this._lastSaveLogTime > 30000);

      // Save to IndexedDB first (crash-resistant, primary storage)
      if (this.saveManager) {
        try {
          // PERF: Only create IDB backup every 10th save (~30s) instead of every save (~3s).
          // Backup cleanup scans 20 records and deletes oldest — wasteful at 3s intervals.
          if (!this._settingsBackupCounter) this._settingsBackupCounter = 0;
          this._settingsBackupCounter++;
          const createBackup = this._settingsBackupCounter >= 10;
          if (createBackup) this._settingsBackupCounter = 0;

          await this.saveManager.save('settings', this.settings, createBackup);
          if (shouldLog) {
            this.debugLog('SAVE_SETTINGS', 'Saved to IndexedDB', {
              timestamp: new Date().toISOString(),
            });
          }
        } catch (error) {
          this.errorLog('SAVE_SETTINGS', 'IndexedDB save failed', error);
        }
      }

      // Also save to BdApi.Data (backup/legacy support)
      let saveSuccess = false;
      let lastError = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          BdApi.Data.save('Dungeons', 'settings', this.settings);
          saveSuccess = true;
          if (shouldLog) {
            this.debugLog('SAVE_SETTINGS', 'Saved to BdApi.Data', {
              attempt: attempt + 1,
              timestamp: new Date().toISOString(),
            });
          }
          break;
        } catch (error) {
          lastError = error;
          // No delay between retries - avoid blocking UI thread
        }
      }

      if (!saveSuccess) {
        // Don't throw - IndexedDB save might have succeeded
        this.errorLog('SAVE_SETTINGS', 'BdApi.Data save failed after 3 attempts', lastError);
      }

      // CRITICAL: Always replace backup after successful primary save (maximum persistence)
      try {
        BdApi.Data.save('Dungeons', 'settings_backup', this.settings);
        if (shouldLog) {
          this.debugLog('SAVE_SETTINGS', 'BdApi.Data backup saved');
        }
      } catch (backupError) {
        // Log backup failure but don't fail entire save
        this.errorLog('SAVE_SETTINGS_BACKUP', 'BdApi.Data backup save failed', backupError);
      }

      if (shouldLog) {
        this._lastSaveLogTime = now;
      }
    } catch (error) {
      this.errorLog('Failed to save settings', error);
    }
  }
};
