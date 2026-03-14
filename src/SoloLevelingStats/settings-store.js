module.exports = {
  recomputeHPManaFromStats(totalStatsOverride = null) {
    const totalStats = totalStatsOverride || this.getTotalEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const intelligence = totalStats.intelligence || 0;
    const userRank = this.settings.rank || 'E';
    const maxHP = this.calculateHP(vitality, userRank);
    const maxMana = this.calculateMana(intelligence);
  
    const prevMaxHP = this.settings.userMaxHP || maxHP;
    const prevHP = this.settings.userHP ?? prevMaxHP;
    const hpPercent = prevMaxHP > 0 ? Math.min(prevHP / prevMaxHP, 1) : 1;
    this.settings.userMaxHP = maxHP;
    this.settings.userHP = Math.min(maxHP, Math.floor(maxHP * hpPercent));
  
    const prevMaxMana = this.settings.userMaxMana || maxMana;
    const prevMana = this.settings.userMana ?? prevMaxMana;
    const manaPercent = prevMaxMana > 0 ? Math.min(prevMana / prevMaxMana, 1) : 1;
    this.settings.userMaxMana = maxMana;
    this.settings.userMana = Math.min(maxMana, Math.floor(maxMana * manaPercent));
  },

  syncHPManaForDisplay(totalStatsOverride = null) {
    const totalStats = totalStatsOverride || this.getTotalEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const intelligence = totalStats.intelligence || 0;
    const userRank = this.settings.rank || 'E';
    const nextMaxHP = this.calculateHP(vitality, userRank);
    const nextMaxMana = this.calculateMana(intelligence);
  
    const needsMaxSync =
      this.settings.userMaxHP !== nextMaxHP ||
      this.settings.userMaxMana !== nextMaxMana;
    const needsCurrentInit =
      !Number.isFinite(this.settings.userHP) ||
      !Number.isFinite(this.settings.userMana);
  
    if (needsMaxSync || needsCurrentInit) {
      this.recomputeHPManaFromStats(totalStats);
      return true;
    }
    return false;
  },

  _hasProgressCoreFields(data) {
    const hasNonDefaultRank = typeof data.rank === 'string' && data.rank !== 'E';
    return (
      Number(data.level || 0) > 1 ||
      Number(data.totalXP || 0) > 0 ||
      Number(data.xp || 0) > 0 ||
      Number(data.unallocatedStatPoints || 0) > 0 ||
      hasNonDefaultRank
    );
  },

  _hasProgressStatGrowth(stats) {
    const statKeys = this.getStatKeys();
    for (let i = 0; i < statKeys.length; i++) {
      const key = statKeys[i];
      if (this.normalizeNumber(stats?.[key], 0) > 0) {
        return true;
      }
    }
    return false;
  },

  _hasProgressActivity(activity) {
    return (
      Number(activity?.messagesSent || 0) > 0 ||
      Number(activity?.charactersTyped || 0) > 0 ||
      Number(activity?.timeActive || 0) > 0 ||
      Number(activity?.critsLanded || 0) > 0
    );
  },

  _hasProgressQuestState(quests) {
    const questValues = Object.values(quests || {});
    for (let i = 0; i < questValues.length; i++) {
      const quest = questValues[i];
      if (quest && (Number(quest.progress || 0) > 0 || quest.completed === true)) {
        return true;
      }
    }
    return false;
  },

  _hasProgressAchievements(achievements) {
    return (
      (Array.isArray(achievements?.unlocked) && achievements.unlocked.length > 0) ||
      (Array.isArray(achievements?.titles) && achievements.titles.length > 0) ||
      Boolean(achievements?.activeTitle)
    );
  },

  _isRealProgressState(data) {
    if (!data || typeof data !== 'object') return false;

    if (this._hasProgressCoreFields(data)) return true;
    if (this._hasProgressStatGrowth(data.stats || {})) return true;
    if (this._hasProgressActivity(data.activity || {})) return true;
    if (this._hasProgressQuestState(data.dailyQuests?.quests || {})) return true;
    if (this._hasProgressAchievements(data.achievements || {})) return true;

    return false;
  },

  _createProgressProbeMatch(source, data) {
    if (!this._isRealProgressState(data)) return null;
    return {
      found: true,
      source,
      level: Number(data?.level || 0),
      totalXP: Number(data?.totalXP || 0),
    };
  },

  async _probeRealProgressSource(source, loadFn) {
    try {
      const loaded = await loadFn();
      return this._createProgressProbeMatch(source, loaded);
    } catch (_) {
      return null;
    }
  },

  _probeRealProgressCollection(source, items) {
    if (!Array.isArray(items)) return null;
    for (let i = 0; i < items.length; i++) {
      const match = this._createProgressProbeMatch(source, items[i]);
      if (match) return match;
    }
    return null;
  },

  async _detectPersistedRealProgress() {
    const fileMatch = await this._probeRealProgressSource('file', async () => this.readFileBackup());
    if (fileMatch) return fileMatch;

    if (this.saveManager) {
      const indexedDbMainMatch = await this._probeRealProgressSource(
        'indexeddb-main',
        async () => this.saveManager.load('settings')
      );
      if (indexedDbMainMatch) return indexedDbMainMatch;

      try {
        const backups = await this.saveManager.getBackups('settings', 3);
        const backupData = backups.map((backup) => backup?.data);
        const indexedDbBackupMatch = this._probeRealProgressCollection('indexeddb-backup', backupData);
        if (indexedDbBackupMatch) return indexedDbBackupMatch;
      } catch (_) {
        // best effort
      }
    }

    const bdMainMatch = await this._probeRealProgressSource(
      'bdapi-main',
      async () => BdApi.Data.load('SoloLevelingStats', 'settings')
    );
    if (bdMainMatch) return bdMainMatch;

    const bdBackupMatch = await this._probeRealProgressSource(
      'bdapi-backup',
      async () => BdApi.Data.load('SoloLevelingStats', 'settings_backup')
    );
    if (bdBackupMatch) return bdBackupMatch;

    const legacyMatch = await this._probeRealProgressSource('legacy-file', async () =>
      this._readLegacySettingsFile()
    );
    if (legacyMatch) return legacyMatch;

    return { found: false };
  },

  _getSavedTimestamp(data) {
    const iso = data?._metadata?.lastSave;
    const ts = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(ts) ? ts : 0;
  },

  _collectSettingsCandidate(candidates, source, data) {
    if (!data || typeof data !== 'object') return;
    candidates.push({ source, data, ts: this._getSavedTimestamp(data) });
  },

  _getLegacySettingsPath() {
    const pathModule = require('path');
    return pathModule.join(BdApi.Plugins.folder, 'SoloLevelingStats.data.json');
  },

  _readLegacySettingsFile() {
    const fs = require('fs');
    const legacyPath = this._getLegacySettingsPath();
    if (!fs.existsSync(legacyPath)) return null;
    const legacyRaw = fs.readFileSync(legacyPath, 'utf8');
    return JSON.parse(legacyRaw);
  },

  async _collectSettingsLoadCandidates() {
    const candidates = [];

    try {
      this._collectSettingsCandidate(candidates, 'file', this.readFileBackup());
    } catch (error) {
      this.debugError('LOAD_SETTINGS', 'File backup load failed', error);
    }

    if (this.saveManager) {
      try {
        this._collectSettingsCandidate(candidates, 'indexeddb', await this.saveManager.load('settings'));
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'IndexedDB load failed', error);
      }

      try {
        const backups = await this.saveManager.getBackups('settings', 1);
        const indexedDbBackupData = Array.isArray(backups) ? backups[0]?.data : null;
        this._collectSettingsCandidate(candidates, 'indexeddb-backup', indexedDbBackupData);
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'IndexedDB backup candidate load failed', error);
      }
    }

    try {
      this._collectSettingsCandidate(candidates, 'bdapi', BdApi.Data.load('SoloLevelingStats', 'settings'));
    } catch (error) {
      this.debugError('LOAD_SETTINGS', 'BdApi.Data load failed', error);
    }

    try {
      this._collectSettingsCandidate(
        candidates,
        'bdapi-backup',
        BdApi.Data.load('SoloLevelingStats', 'settings_backup')
      );
    } catch (error) {
      this.debugError('LOAD_SETTINGS', 'BdApi.Data backup candidate load failed', error);
    }

    try {
      const legacySaved = this._readLegacySettingsFile();
      if (legacySaved && typeof legacySaved === 'object') {
        this._collectSettingsCandidate(candidates, 'legacy-file', legacySaved);
        this.debugLog('LOAD_SETTINGS', 'Found legacy .data.json backup', {
          level: legacySaved.level,
          rank: legacySaved.rank,
          ts: this._getSavedTimestamp(legacySaved),
        });
      }
    } catch (error) {
      this.debugError('LOAD_SETTINGS', 'Legacy .data.json load failed', error);
    }

    return candidates;
  },

  _getSettingsSourcePriority(source) {
    const sourcePriority = {
      indexeddb: 3,
      'indexeddb-backup': 2.5,
      file: 2,
      'legacy-file': 1.5,
      'bdapi-backup': 1.25,
      bdapi: 1,
    };
    return sourcePriority[source] ?? 0;
  },

  _getSettingsCandidateQuality(data) {
    if (!data || typeof data !== 'object') return 0;
    const stats = data.stats || {};
    const statSum = this.sumStatBlock(stats);
    return (Number(data.level) || 0) * 1000 + statSum + (Number(data.totalXP || data.xp) || 0) * 0.01;
  },

  _sanitizeAndScoreSettingsCandidates(candidates) {
    const maxValidTimestamp = Date.now() + 86400000;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      let quality = 0;
      try {
        quality = this._getSettingsCandidateQuality(candidate.data);
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'Candidate quality scoring failed', error, {
          source: candidate.source,
          level: candidate.data?.level,
        });
      }
      candidate.quality = Number.isFinite(quality) && quality >= 0 ? quality : 0;
      if (candidate.ts <= maxValidTimestamp) continue;

      this.debugLog('LOAD_SETTINGS', `WARNING: Clamped future timestamp from ${candidate.source}`, {
        originalTs: new Date(candidate.ts).toISOString(),
        clampedTo: new Date(maxValidTimestamp).toISOString(),
      });
      candidate.ts = 0;
    }
  },

  _pickBestSettingsCandidate(candidates, logSelection = true) {
    this._sanitizeAndScoreSettingsCandidates(candidates);

    const best = candidates.reduce(
      (acc, cur) => {
        const qualityRatio = acc.quality > 0 ? cur.quality / acc.quality : cur.quality > 0 ? Infinity : 1;
        if (qualityRatio > 1.1) return cur;
        if (qualityRatio < 0.91) return acc;

        const hasNewerTimestamp = cur.ts > acc.ts;
        const isTie = cur.ts === acc.ts;
        const hasHigherPriority =
          this._getSettingsSourcePriority(cur.source) >= this._getSettingsSourcePriority(acc.source);
        return hasNewerTimestamp || (isTie && hasHigherPriority) ? cur : acc;
      },
      { source: null, data: null, ts: 0, quality: 0 }
    );

    if (logSelection) {
      const saved = best.data;
      this.debugLog(
        'LOAD_SETTINGS',
        saved ? 'Selected settings candidate' : 'WARNING: No valid candidate found',
        {
          winner: best.source,
          winnerLevel: saved?.level,
          winnerQuality: best.quality,
          candidateCount: candidates.length,
          allCandidates: candidates.map((candidate) => ({
            source: candidate.source,
            level: candidate.data?.level,
            quality: candidate.quality,
            ts: candidate.ts ? new Date(candidate.ts).toISOString() : 'none',
          })),
        }
      );
    }

    return best;
  },

  _selectBestSettingsCandidate(candidates) {
    return this._pickBestSettingsCandidate(candidates, true);
  },

  _estimateTotalXPForState(data) {
    const directTotalXp = Number(data?.totalXP);
    if (Number.isFinite(directTotalXp) && directTotalXp >= 0) {
      return directTotalXp;
    }

    const level = Math.max(1, Math.floor(Number(data?.level) || 1));
    const xp = Math.max(0, Number(data?.xp) || 0);
    let totalXPNeeded = 0;
    for (let l = 1; l < level; l++) {
      totalXPNeeded += this.getXPRequiredForLevel(l);
    }
    return totalXPNeeded + xp;
  },

  async _getPersistedSaveFloorCandidate() {
    const candidates = [];

    try {
      this._collectSettingsCandidate(candidates, 'file', this.readFileBackup());
    } catch (_) {
      // best effort
    }

    try {
      this._collectSettingsCandidate(candidates, 'bdapi', BdApi.Data.load('SoloLevelingStats', 'settings'));
    } catch (_) {
      // best effort
    }

    try {
      this._collectSettingsCandidate(
        candidates,
        'bdapi-backup',
        BdApi.Data.load('SoloLevelingStats', 'settings_backup')
      );
    } catch (_) {
      // best effort
    }

    if (this.saveManager) {
      try {
        this._collectSettingsCandidate(candidates, 'indexeddb', await this.saveManager.load('settings'));
      } catch (_) {
        // best effort
      }

      try {
        const backups = await this.saveManager.getBackups('settings', 1);
        const indexedDbBackupData = Array.isArray(backups) ? backups[0]?.data : null;
        this._collectSettingsCandidate(candidates, 'indexeddb-backup', indexedDbBackupData);
      } catch (_) {
        // best effort
      }
    }

    if (candidates.length === 0) return null;
    return this._pickBestSettingsCandidate(candidates, false);
  },

  async _tryIndexedDbBackupRestore() {
    if (!this.saveManager) return null;
    try {
      const backups = await this.saveManager.getBackups('settings', 1);
      if (!backups.length) return null;

      const backupData = backups[0].data;
      this.debugLog('LOAD_SETTINGS', 'Loaded from IndexedDB backup');
      try {
        await this.saveManager.save('settings', backupData);
        this.debugLog('LOAD_SETTINGS', 'Restored backup to main');
      } catch (restoreError) {
        this.debugError('LOAD_SETTINGS', 'Failed to restore backup', restoreError);
      }
      return backupData;
    } catch (error) {
      this.debugError('LOAD_SETTINGS', 'IndexedDB backup load failed', error);
      return null;
    }
  },

  async _tryBdApiBackupRestore() {
    try {
      const saved = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
      if (!saved) return null;

      this.debugLog('LOAD_SETTINGS', 'Loaded from BdApi.Data backup');
      if (this.saveManager) {
        try {
          await this.saveManager.save('settings', saved);
          this.debugLog('LOAD_SETTINGS', 'Migrated backup to IndexedDB');
        } catch (migrateError) {
          this.debugError('LOAD_SETTINGS', 'Migration failed', migrateError);
        }
      }
      return saved;
    } catch (error) {
      this.debugError('LOAD_SETTINGS', 'BdApi.Data backup load failed', error);
      return null;
    }
  },

  _ensureActivityChannelsVisitedSet() {
    if (Array.isArray(this.settings.activity?.channelsVisited)) {
      this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
      this.debugLog('LOAD_SETTINGS', 'Converted channelsVisited array to Set');
      return;
    }

    if (!(this.settings.activity?.channelsVisited instanceof Set)) {
      this.settings.activity.channelsVisited = new Set();
      this.debugLog('LOAD_SETTINGS', 'Initialized new channelsVisited Set');
    }
  },

  _ensureSettingsStatsInitialized() {
    if (!this.settings.stats || typeof this.settings.stats !== 'object') {
      this.settings.stats = this.createEmptyStatBlock();
      this.debugLog('LOAD_SETTINGS', 'Stats object was missing, initialized from defaults');
      return;
    }

    const mergedStats = { ...this.defaultSettings.stats, ...this.settings.stats };
    if (mergedStats.perception == null && mergedStats.luck != null) {
      mergedStats.perception = mergedStats.luck;
    }
    this.settings.stats = this.normalizeStatBlock(mergedStats, 0);
    this.debugLog('LOAD_SETTINGS', 'Stats merged with defaults', {
      strength: this.settings.stats.strength,
      agility: this.settings.stats.agility,
      intelligence: this.settings.stats.intelligence,
      vitality: this.settings.stats.vitality,
      perception: this.settings.stats.perception,
    });
  },

  _initializeLoadedSettings(saved) {
    const merged = { ...this.defaultSettings, ...saved };
    this.settings = structuredClone(merged);
    this.debugLog('LOAD_SETTINGS', 'Settings merged (deep copy)', {
      level: this.settings.level,
      rank: this.settings.rank,
      totalXP: this.settings.totalXP,
    });

    this.migrateData();
    this._ensureActivityChannelsVisitedSet();
    this._ensureSettingsStatsInitialized();

    if (!Array.isArray(this.settings.perceptionBuffs)) {
      this.settings.perceptionBuffs = [];
    }

    if (!this.settings.level || typeof this.settings.level !== 'number' || this.settings.level < 1) {
      this.debugLog('LOAD_SETTINGS', 'Level missing or invalid, initializing from totalXP');
      const levelInfo = this.getCurrentLevel();
      this.settings.level = levelInfo.level || 1;
    }

    this.recomputeHPManaFromStats();
    this._hasRealProgress = this._isRealProgressState(this.settings);
    this._startupProgressProbeComplete = this._hasRealProgress;
    this._startupLoadComplete = true;
  },

  async _applyLoadedSettings(saved, source, loadedFromFile) {
    this._initializeLoadedSettings(saved);

    this.debugLog('LOAD_SETTINGS', 'Startup load confirmed — saves unlocked', {
      level: this.settings.level,
      totalXP: this.settings.totalXP,
      source,
      hasRealProgress: this._hasRealProgress,
    });

    if (loadedFromFile) {
      try {
        await this.saveSettings(true);
        this.debugLog('LOAD_SETTINGS', 'Restored file backup to persistent stores');
      } catch (saveErr) {
        this.debugError('LOAD_SETTINGS', 'Failed to push file backup to stores', saveErr);
      }
    }

    this.ensureValidTotalXP('LOAD_SETTINGS');
    this.debugLog('LOAD_SETTINGS', 'Settings loaded successfully', {
      level: this.settings.level,
      totalXP: this.settings.totalXP,
      messagesSent: this.settings.activity.messagesSent,
      rank: this.settings.rank,
    });
    this.emitXPChanged();
  },

  async _attemptLegacyRescue() {
    try {
      const rescueCandidates = [];

      try {
        this._collectSettingsCandidate(rescueCandidates, 'file', this.readFileBackup());
      } catch (_) {
        // best effort
      }

      if (this.saveManager) {
        try {
          this._collectSettingsCandidate(
            rescueCandidates,
            'indexeddb',
            await this.saveManager.load('settings')
          );
        } catch (_) {
          // best effort
        }

        try {
          const backups = await this.saveManager.getBackups('settings', 1);
          const indexeddbBackupData = Array.isArray(backups) ? backups[0]?.data : null;
          this._collectSettingsCandidate(rescueCandidates, 'indexeddb-backup', indexeddbBackupData);
        } catch (_) {
          // best effort
        }
      }

      try {
        this._collectSettingsCandidate(
          rescueCandidates,
          'bdapi',
          BdApi.Data.load('SoloLevelingStats', 'settings')
        );
      } catch (_) {
        // best effort
      }

      try {
        this._collectSettingsCandidate(
          rescueCandidates,
          'bdapi-backup',
          BdApi.Data.load('SoloLevelingStats', 'settings_backup')
        );
      } catch (_) {
        // best effort
      }

      let legacyData = null;
      try {
        legacyData = this._readLegacySettingsFile();
      } catch (_) {
        // best effort
      }
      if (legacyData && typeof legacyData === 'object') {
        this._collectSettingsCandidate(rescueCandidates, 'legacy-file', legacyData);
      }

      const best = this._selectBestSettingsCandidate(rescueCandidates);
      const selected = best?.data;
      if (!selected || !this._isRealProgressState(selected)) return false;

      this.debugLog('RESCUE', 'Rescue selected best persisted candidate', {
        source: best.source,
        level: Number(selected.level || 0),
        totalXP: Number(selected.totalXP || 0),
        quality: best.quality,
        candidateCount: rescueCandidates.length,
      });
      this._initializeLoadedSettings(selected);
      this._hasRealProgress = true;
      this._startupProgressProbeComplete = true;
      this._startupLoadComplete = true;
      try {
        await this.saveSettings(true);
      } catch (_) {
        // best-effort
      }
      return true;
    } catch (legacyErr) {
      this.debugError('LOAD_SETTINGS', 'Legacy rescue check failed', legacyErr);
      return false;
    }
  },

  _initializeFreshSettingsState() {
    this.settings = structuredClone(this.defaultSettings);
    this.settings.activity.channelsVisited = new Set();
    this._hasRealProgress = false;
    this._startupProgressProbeComplete = false;
    this._startupLoadComplete = true;
    this.debugLog('LOAD_SETTINGS', 'No saved data found anywhere (including legacy), using defaults');
  },

  _initializeFallbackSettingsAfterLoadError(error) {
    this.debugError('LOAD_SETTINGS', error, { phase: 'load_settings' });
    this.settings = structuredClone(this.defaultSettings);
    this.settings.activity.channelsVisited = new Set();
  },

  async loadSettings() {
    try {
      this.debugLog('LOAD_SETTINGS', 'Attempting to load settings...');
      const candidates = await this._collectSettingsLoadCandidates();
      const best = this._selectBestSettingsCandidate(candidates);
      const loadedFromFile = best.source === 'file';

      let saved = best.data;
      let source = best.source;
      if (!saved) {
        saved = await this._tryIndexedDbBackupRestore();
        if (saved) source = 'indexeddb-backup';
      }
      if (!saved) {
        saved = await this._tryBdApiBackupRestore();
        if (saved) source = 'bdapi-backup';
      }

      if (saved && typeof saved === 'object') {
        try {
          await this._applyLoadedSettings(saved, source, loadedFromFile);
        } catch (error) {
          this.debugError('LOAD_SETTINGS', error, { phase: 'settings_merge' });
          throw error;
        }
        return;
      }

      const rescuedFromLegacy = await this._attemptLegacyRescue();
      if (!rescuedFromLegacy) {
        this._initializeFreshSettingsState();
      }
    } catch (error) {
      this._initializeFallbackSettingsAfterLoadError(error);
      try {
        const rescued = await this._attemptLegacyRescue();
        if (rescued) {
          this.debugLog('RESCUE', 'ERROR-PATH RESCUE: Found real progress in legacy .data.json');
        }
      } catch (_) {
        // best-effort
      }
      this._hasRealProgress = this._isRealProgressState(this.settings);
      this._startupProgressProbeComplete = this._hasRealProgress;
      this._startupLoadComplete = true;
    }
  },

  withAutoSave(modifyFn, immediate = false) {
    const executeAndSave = () => {
      const result = modifyFn();
      this.saveSettings(immediate);
      return result;
    };
    return executeAndSave();
  },

  shareShadowXP(xpAmount, source = 'message') {
    const shareWithPlugin = (plugin) => {
      plugin.instance.shareShadowXP(xpAmount, source);
      this.debugConsole('[SHADOW XP]', `Shared ${xpAmount} XP (${source})`);
      return true;
    };
  
    const logError = (error) => {
      this.debugLog('SHADOW_XP_SHARE', `ShadowArmy integration: ${error.message}`);
      return null;
    };
  
    try {
      const saInstance = this._SLUtils?.getPluginInstance?.('ShadowArmy');
      if (!saInstance || typeof saInstance.shareShadowXP !== 'function') return null;
  
      return shareWithPlugin({ instance: saInstance });
    } catch (error) {
      return logError(error);
    }
  },

  async saveSettings(immediate = false) {
    // Prevent saving if settings aren't initialized
    if (!this.settings) {
      this.debugError('SAVE_SETTINGS', new Error('Settings not initialized'));
      return;
    }
  
    // STARTUP SAVE GUARD: Block ALL saves until loadSettings() has confirmed
    // real data loaded or verified this is a genuine fresh start. This prevents
    // the "load defaults → immediate save → overwrite real progress" cascade.
    if (this._startupLoadComplete === false) {
      this.debugLog('SAVE_SETTINGS', 'BLOCKED — startup load not yet complete, refusing to save');
      return;
    }
  
    if (immediate) {
      // Flush any pending debounce and save now
      if (this._saveSettingsTimer) {
        clearTimeout(this._saveSettingsTimer);
        this._saveSettingsTimer = null;
      }
      this._settingsDirty = false;
      return this._saveSettingsImmediate();
    }
  
    // Debounced path — coalesce rapid calls
    this._settingsDirty = true;
    if (this._saveSettingsTimer) return;
    this._saveSettingsTimer = setTimeout(() => {
      this._saveSettingsTimer = null;
      if (this._settingsDirty) {
        this._settingsDirty = false;
        this._saveSettingsImmediate();
      }
    }, 2000);
  },

  async _runStartupSaveProbeGuard() {
    if (this._startupProgressProbeComplete) return true;

    const probeResult = await this._detectPersistedRealProgress();
    this._startupProgressProbeComplete = true;
    const currentLooksFresh = !this._isRealProgressState(this.settings);
    if (!probeResult.found || !currentLooksFresh) return true;

    this.debugLog(
      'SAVE_GUARD',
      `BLOCKED save: found persisted progress in ${probeResult.source} (level ${probeResult.level}, totalXP ${probeResult.totalXP}) while current state looks fresh. Reloading instead of overwriting.`
    );
    try {
      await this.loadSettings();
    } catch (_) {
      // best effort
    }
    return false;
  },

  _syncBonusesForSave() {
    if (!this.settings || !this.settings.stats) {
      this.debugError(
        'SAVE_SETTINGS',
        new Error('Settings or stats not initialized - cannot save bonuses')
      );
      return;
    }

    try {
      this.saveAgilityBonus();
    } catch (error) {
      this.debugError('SAVE_AGILITY_BONUS_IN_SAVE', error);
    }
  },

  _createCleanSettingsForSave() {
    const settingsToSave = {
      ...this.settings,
      activity: {
        ...this.settings.activity,
        channelsVisited:
          this.settings.activity?.channelsVisited instanceof Set
            ? Array.from(this.settings.activity.channelsVisited)
            : Array.isArray(this.settings.activity?.channelsVisited)
            ? this.settings.activity.channelsVisited
            : [],
      },
      _metadata: {
        lastSave: new Date().toISOString(),
        version: this.meta?.version || '3.0.5',
      },
    };

    const cleanSettings = structuredClone(settingsToSave);
    this._hasRealProgress = this._isRealProgressState(cleanSettings) || this._hasRealProgress;
    return cleanSettings;
  },

  async _validateCleanSettingsForSave(cleanSettings) {
    if (!cleanSettings.level || cleanSettings.level < 1 || !Number.isInteger(cleanSettings.level)) {
      this.debugError(
        'SAVE_SETTINGS',
        new Error(
          `Invalid level detected: ${cleanSettings.level}. Aborting save to prevent data corruption.`
        )
      );
      return { isValid: false, statSum: 0 };
    }

    if (typeof cleanSettings.xp !== 'number' || isNaN(cleanSettings.xp) || cleanSettings.xp < 0) {
      this.debugError(
        'SAVE_SETTINGS',
        new Error(`Invalid XP detected: ${cleanSettings.xp}. Aborting save to prevent data corruption.`)
      );
      return { isValid: false, statSum: 0 };
    }

    const statSum = Object.values(cleanSettings.stats || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    if (statSum === 0 && cleanSettings.level > 1) {
      this.debugError(
        'SAVE_SETTINGS',
        new Error(
          `All stats are zero at level ${cleanSettings.level}. Aborting save to prevent data wipe.`
        )
      );
      return { isValid: false, statSum };
    }

    try {
      const existingBackup = this.readFileBackup();
      if (existingBackup?.stats) {
        const existingStatSum = Object.values(existingBackup.stats).reduce(
          (a, b) => a + (Number(b) || 0),
          0
        );
        if (existingStatSum > 0 && statSum < existingStatSum * 0.5) {
          this.debugError(
            'SAVE_SETTINGS',
            new Error(
              `Stats regression detected: current ${statSum} vs backup ${existingStatSum} (>50% drop). Aborting save.`
            )
          );
          return { isValid: false, statSum };
        }
      }
    } catch (regressionCheckError) {
      this.debugError('SAVE_SETTINGS', 'Regression check failed (non-fatal)', regressionCheckError);
    }

    try {
      const persistedFloor = await this._getPersistedSaveFloorCandidate();
      const floorData = persistedFloor?.data;
      const hasFloorProgress = floorData && this._isRealProgressState(floorData);
      const hasCurrentProgress = this._isRealProgressState(cleanSettings);
      if (hasFloorProgress && hasCurrentProgress) {
        const floorLevel = Number(floorData.level || 0);
        const currentLevel = Number(cleanSettings.level || 0);
        const floorTotalXP = this._estimateTotalXPForState(floorData);
        const currentTotalXP = this._estimateTotalXPForState(cleanSettings);
        const floorQuality = this._getSettingsCandidateQuality({ ...floorData, totalXP: floorTotalXP });
        const currentQuality = this._getSettingsCandidateQuality({ ...cleanSettings, totalXP: currentTotalXP });

        const levelDrop = floorLevel - currentLevel;
        const majorLevelDrop = floorLevel >= 25 && levelDrop >= 5;
        const majorTotalXPDrop = floorTotalXP >= 100000 && currentTotalXP <= floorTotalXP * 0.75;
        const majorQualityDrop = floorQuality > 0 && currentQuality <= floorQuality * 0.75;

        const regressionDetected = majorLevelDrop || majorTotalXPDrop || majorQualityDrop;
        let allowRollback = this._allowProgressRollbackSave === true;
        try {
          allowRollback =
            allowRollback ||
            (typeof window !== 'undefined' && window.__SLS_ALLOW_REGRESSION_SAVE__ === true);
        } catch (_) {
          // best effort
        }

        if (regressionDetected && !allowRollback) {
          this.debugError(
            'SAVE_SETTINGS',
            new Error(
              `Progress regression blocked: current L${currentLevel}/XP ${currentTotalXP} vs persisted floor from ${
                persistedFloor.source || 'unknown'
              } L${floorLevel}/XP ${floorTotalXP}.`
            )
          );
          return { isValid: false, statSum };
        }
      }
    } catch (saveFloorError) {
      this.debugError('SAVE_SETTINGS', 'Persisted save floor check failed (non-fatal)', saveFloorError);
    }

    return { isValid: true, statSum };
  },

  _ensureValidTotalXpForSave(cleanSettings) {
    if (
      typeof cleanSettings.totalXP === 'number' &&
      !isNaN(cleanSettings.totalXP) &&
      cleanSettings.totalXP >= 0
    ) {
      return;
    }

    const currentLevel = cleanSettings.level || 1;
    let totalXPNeeded = 0;
    for (let l = 1; l < currentLevel; l++) {
      totalXPNeeded += this.getXPRequiredForLevel(l);
    }
    cleanSettings.totalXP = totalXPNeeded + (cleanSettings.xp || 0);
    this.debugLog('SAVE_SETTINGS', 'Fixed invalid totalXP before save', {
      fixedTotalXP: cleanSettings.totalXP,
      level: currentLevel,
      xp: cleanSettings.xp,
    });
  },

  async _saveCleanSettingsToStores(cleanSettings) {
    this.writeFileBackup(cleanSettings);

    if (this.saveManager) {
      try {
        await this.saveManager.save('settings', cleanSettings, true);
        this.lastSaveTime = Date.now();
        this.debugLog('SAVE_SETTINGS', 'Saved to IndexedDB', {
          level: cleanSettings.level,
          xp: cleanSettings.xp,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.debugError('SAVE_SETTINGS', 'IndexedDB save failed', error);
      }
    }

    let saveSuccess = false;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        BdApi.Data.save('SoloLevelingStats', 'settings', cleanSettings);
        this.lastSaveTime = Date.now();
        saveSuccess = true;
        this.debugLog('SAVE_SETTINGS', 'Saved to BdApi.Data', {
          attempt: attempt + 1,
          level: cleanSettings.level,
          xp: cleanSettings.xp,
          timestamp: new Date().toISOString(),
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!saveSuccess) {
      this.debugError('SAVE_SETTINGS', 'BdApi.Data save failed after 3 attempts', lastError);
    }

    try {
      BdApi.Data.save('SoloLevelingStats', 'settings_backup', cleanSettings);
      this.debugLog('SAVE_SETTINGS', 'BdApi.Data backup saved');
    } catch (backupError) {
      this.debugError('SAVE_SETTINGS_BACKUP', 'BdApi.Data backup save failed', backupError);
    }
  },

  _saveSettingsBackupFallback() {
    try {
      const backupData = JSON.parse(
        JSON.stringify({
          ...this.settings,
          activity: {
            ...this.settings.activity,
            channelsVisited:
              this.settings.activity?.channelsVisited instanceof Set
                ? Array.from(this.settings.activity.channelsVisited)
                : Array.isArray(this.settings.activity?.channelsVisited)
                ? this.settings.activity.channelsVisited
                : [],
          },
        })
      );
      BdApi.Data.save('SoloLevelingStats', 'settings_backup', backupData);
      this.debugLog('SAVE_SETTINGS', 'Backup replaced (fallback after primary save failure)');
    } catch (backupError) {
      this.debugError('SAVE_SETTINGS_BACKUP', backupError);
    }
  },

  async _saveSettingsImmediate() {
    if (!this.settings) return;

    if (!(await this._runStartupSaveProbeGuard())) return;

    try {
      this._syncBonusesForSave();

      this.debugLog('SAVE_SETTINGS', 'Current settings before save', {
        level: this.settings.level,
        xp: this.settings.xp,
        totalXP: this.settings.totalXP,
        rank: this.settings.rank,
        stats: this.settings.stats,
        unallocatedPoints: this.settings.unallocatedStatPoints,
      });

      const cleanSettings = this._createCleanSettingsForSave();
      this._ensureValidTotalXpForSave(cleanSettings);
      const validation = await this._validateCleanSettingsForSave(cleanSettings);
      if (!validation.isValid) return;

      this.debugLog('SAVE_SETTINGS', 'Clean settings to be saved', {
        level: cleanSettings.level,
        xp: cleanSettings.xp,
        totalXP: cleanSettings.totalXP,
        rank: cleanSettings.rank,
        stats: cleanSettings.stats,
        statSum: validation.statSum,
        metadata: cleanSettings._metadata,
      });

      await this._saveCleanSettingsToStores(cleanSettings);
    } catch (error) {
      this.debugError('SAVE_SETTINGS', error);
      this._saveSettingsBackupFallback();
    }
  },

  createChatUiPreviewPanel() {
    try {
      // Ensure stale preview roots do not accumulate when settings are reopened.
      if (this._settingsPreviewRoot) {
        try {
          this._settingsPreviewRoot.unmount();
        } catch (error) {
          this.debugError('CREATE_CHAT_UI_PREVIEW_PANEL', error, {
            phase: 'unmount-previous-preview-root',
          });
        }
        this._settingsPreviewRoot = null;
      }
  
      // Ensure chat UI styles exist for the preview
      this.injectChatUICSS();
  
      const container = document.createElement('div');
      container.className = 'sls-chat-panel';
      container.id = 'sls-settings-chat-ui';
  
      // v3.0.0: Render React component tree into preview panel
      const { StatsPanel } = this._chatUIComponents;
      const root = BdApi.ReactDOM.createRoot(container);
      root.render(BdApi.React.createElement(StatsPanel));
      this._settingsPreviewRoot = root;
  
      return container;
    } catch (error) {
      this.debugError('CREATE_CHAT_UI_PREVIEW_PANEL', error);
      const fallback = document.createElement('div');
      fallback.className = 'sls-chat-panel';
      fallback.innerHTML = `<div style="padding: 20px; color: #fff;">Error creating chat UI preview: ${this.escapeHtml(error.message)}. Check console for details.</div>`;
      return fallback;
    }
  }
};
