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

  _isRealProgressState(data) {
    if (!data || typeof data !== 'object') return false;
  
    const stats = data.stats || {};
    const activity = data.activity || {};
    const quests = data.dailyQuests?.quests || {};
    const achievements = data.achievements || {};
  
    const hasStatGrowth = ['strength', 'agility', 'intelligence', 'vitality', 'perception'].some(
      (key) => Number(stats[key] || 0) > 0
    );
    const hasActivity =
      Number(activity.messagesSent || 0) > 0 ||
      Number(activity.charactersTyped || 0) > 0 ||
      Number(activity.timeActive || 0) > 0 ||
      Number(activity.critsLanded || 0) > 0;
    const hasQuestProgress = Object.values(quests).some(
      (quest) =>
        quest &&
        (Number(quest.progress || 0) > 0 || quest.completed === true)
    );
    const hasAchievements =
      (Array.isArray(achievements.unlocked) && achievements.unlocked.length > 0) ||
      (Array.isArray(achievements.titles) && achievements.titles.length > 0) ||
      Boolean(achievements.activeTitle);
    const hasNonDefaultRank = typeof data.rank === 'string' && data.rank !== 'E';
  
    return (
      Number(data.level || 0) > 1 ||
      Number(data.totalXP || 0) > 0 ||
      Number(data.xp || 0) > 0 ||
      Number(data.unallocatedStatPoints || 0) > 0 ||
      hasNonDefaultRank ||
      hasStatGrowth ||
      hasActivity ||
      hasQuestProgress ||
      hasAchievements
    );
  },

  async _detectPersistedRealProgress() {
    const inspect = (source, data) => {
      if (this._isRealProgressState(data)) {
        return {
          found: true,
          source,
          level: Number(data?.level || 0),
          totalXP: Number(data?.totalXP || 0),
        };
      }
      return null;
    };
  
    try {
      const fileSaved = this.readFileBackup();
      const match = inspect('file', fileSaved);
      if (match) return match;
    } catch (_) {
      // best effort
    }
  
    if (this.saveManager) {
      try {
        const idbMain = await this.saveManager.load('settings');
        const match = inspect('indexeddb-main', idbMain);
        if (match) return match;
      } catch (_) {
        // best effort
      }
  
      try {
        const backups = await this.saveManager.getBackups('settings', 3);
        for (const backup of backups) {
          const match = inspect('indexeddb-backup', backup?.data);
          if (match) return match;
        }
      } catch (_) {
        // best effort
      }
    }
  
    try {
      const bdMain = BdApi.Data.load('SoloLevelingStats', 'settings');
      const match = inspect('bdapi-main', bdMain);
      if (match) return match;
    } catch (_) {
      // best effort
    }
  
    try {
      const bdBackup = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
      const match = inspect('bdapi-backup', bdBackup);
      if (match) return match;
    } catch (_) {
      // best effort
    }
  
    try {
      const fs = require('fs');
      const pathModule = require('path');
      const legacyPath = pathModule.join(BdApi.Plugins.folder, 'SoloLevelingStats.data.json');
      if (fs.existsSync(legacyPath)) {
        const legacyData = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        const match = inspect('legacy-file', legacyData);
        if (match) return match;
      }
    } catch (_) {
      // best effort
    }
  
    return { found: false };
  },

  async loadSettings() {
    try {
      this.debugLog('LOAD_SETTINGS', 'Attempting to load settings...');
  
      // Robust load: collect candidates and pick the newest valid one.
      // IMPORTANT: never overwrite a valid candidate with null (previous bug caused resets).
      const getSavedTimestamp = (data) => {
        const iso = data?._metadata?.lastSave;
        const ts = iso ? Date.parse(iso) : NaN;
        return Number.isFinite(ts) ? ts : 0;
      };
  
      const candidates = [];
  
      // File backup (survives some repair/reinstall cases)
      try {
        const fileSaved = this.readFileBackup();
        fileSaved &&
          typeof fileSaved === 'object' &&
          candidates.push({ source: 'file', data: fileSaved, ts: getSavedTimestamp(fileSaved) });
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'File backup load failed', error);
      }
  
      // IndexedDB main
      if (this.saveManager) {
        try {
          const idbSaved = await this.saveManager.load('settings');
          idbSaved &&
            typeof idbSaved === 'object' &&
            candidates.push({
              source: 'indexeddb',
              data: idbSaved,
              ts: getSavedTimestamp(idbSaved),
            });
        } catch (error) {
          this.debugError('LOAD_SETTINGS', 'IndexedDB load failed', error);
        }
      }
  
      // BdApi.Data main
      try {
        const bdSaved = BdApi.Data.load('SoloLevelingStats', 'settings');
        bdSaved &&
          typeof bdSaved === 'object' &&
          candidates.push({ source: 'bdapi', data: bdSaved, ts: getSavedTimestamp(bdSaved) });
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'BdApi.Data load failed', error);
      }
  
      // Legacy .data.json in plugins folder (old backup format — prevents orphaned data loss)
      try {
        const fs = require('fs');
        const pathModule = require('path');
        const legacyPath = pathModule.join(BdApi.Plugins.folder, 'SoloLevelingStats.data.json');
        if (fs.existsSync(legacyPath)) {
          const legacyRaw = fs.readFileSync(legacyPath, 'utf8');
          const legacySaved = JSON.parse(legacyRaw);
          if (legacySaved && typeof legacySaved === 'object') {
            candidates.push({ source: 'legacy-file', data: legacySaved, ts: getSavedTimestamp(legacySaved) });
            this.debugLog('LOAD_SETTINGS', 'Found legacy .data.json backup', {
              level: legacySaved.level, rank: legacySaved.rank, ts: getSavedTimestamp(legacySaved),
            });
          }
        }
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'Legacy .data.json load failed', error);
      }
  
      // Pick best candidate by quality (data richness) + timestamp + storage priority
      // CRITICAL: prevents zeroed defaults with newer timestamps from overriding valid data
      const sourcePriority = {
        indexeddb: 3,
        file: 2,
        'legacy-file': 1.5,
        bdapi: 1,
      };
      const getPriority = (source) => sourcePriority[source] ?? 0;
  
      const getCandidateQuality = (data) => {
        if (!data || typeof data !== 'object') return 0;
        const stats = data.stats || {};
        const statSum = (Number(stats.strength) || 0) + (Number(stats.agility) || 0) +
          (Number(stats.intelligence) || 0) + (Number(stats.vitality) || 0) + (Number(stats.perception) || 0);
        return (Number(data.level) || 0) * 1000 + statSum + (Number(data.totalXP || data.xp) || 0) * 0.01;
      };
  
      // Score all candidates and sanitize timestamps
      const MAX_VALID_TIMESTAMP = Date.now() + 86400000; // Now + 1 day (anything beyond is bogus)
      candidates.forEach(c => {
        c.quality = getCandidateQuality(c.data);
        // Clamp future timestamps — prevents poisoned data (e.g. year 2099) from winning
        if (c.ts > MAX_VALID_TIMESTAMP) {
          this.debugLog('LOAD_SETTINGS', `WARNING: Clamped future timestamp from ${c.source}`, {
            originalTs: new Date(c.ts).toISOString(), clampedTo: new Date(MAX_VALID_TIMESTAMP).toISOString(),
          });
          c.ts = 0; // Treat as unknown age — let quality decide
        }
      });
  
      const best = candidates.reduce(
        (acc, cur) => {
          // QUALITY-FIRST selection: higher quality ALWAYS wins unless nearly identical
          // This prevents stale data with newer timestamps from overriding real progress
          const qualityRatio = acc.quality > 0 ? cur.quality / acc.quality : (cur.quality > 0 ? Infinity : 1);
          if (qualityRatio > 1.1) return cur;  // 10% higher quality wins regardless of timestamp
          if (qualityRatio < 0.91) return acc;  // Current best is 10%+ higher quality
  
          // Nearly identical quality (<10% diff): use timestamp then priority
          const hasNewerTimestamp = cur.ts > acc.ts;
          const isTie = cur.ts === acc.ts;
          const hasHigherPriority = getPriority(cur.source) >= getPriority(acc.source);
          return hasNewerTimestamp || (isTie && hasHigherPriority) ? cur : acc;
        },
        {
          source: null,
          data: null,
          ts: 0,
          quality: 0,
        }
      );
  
      let saved = best.data;
      const loadedFromFile = best.source === 'file';
  
      // ALWAYS log candidate selection (critical for diagnosing data loss)
      this.debugLog('LOAD_SETTINGS', saved ? 'Selected settings candidate' : 'WARNING: No valid candidate found', {
        winner: best.source,
        winnerLevel: saved?.level,
        winnerQuality: best.quality,
        candidateCount: candidates.length,
        allCandidates: candidates.map(c => ({
          source: c.source, level: c.data?.level, quality: c.quality,
          ts: c.ts ? new Date(c.ts).toISOString() : 'none',
        })),
      });
  
      // Try IndexedDB backup if main failed
      if (!saved && this.saveManager) {
        try {
          const backups = await this.saveManager.getBackups('settings', 1);
          if (backups.length > 0) {
            saved = backups[0].data;
            this.debugLog('LOAD_SETTINGS', 'Loaded from IndexedDB backup');
            // Restore backup to main
            try {
              await this.saveManager.save('settings', saved);
              this.debugLog('LOAD_SETTINGS', 'Restored backup to main');
            } catch (restoreError) {
              this.debugError('LOAD_SETTINGS', 'Failed to restore backup', restoreError);
            }
          }
        } catch (error) {
          this.debugError('LOAD_SETTINGS', 'IndexedDB backup load failed', error);
        }
      }
  
      // Try BdApi.Data backup as last resort
      if (!saved) {
        try {
          saved = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
          if (saved) {
            this.debugLog('LOAD_SETTINGS', 'Loaded from BdApi.Data backup');
            // Migrate to IndexedDB
            if (this.saveManager) {
              try {
                await this.saveManager.save('settings', saved);
                this.debugLog('LOAD_SETTINGS', 'Migrated backup to IndexedDB');
              } catch (migrateError) {
                this.debugError('LOAD_SETTINGS', 'Migration failed', migrateError);
              }
            }
          }
        } catch (error) {
          this.debugError('LOAD_SETTINGS', 'BdApi.Data backup load failed', error);
        }
      }
  
      if (saved && typeof saved === 'object') {
        try {
          // CRITICAL FIX: Deep merge to prevent nested object reference sharing
          // Shallow spread (...) only copies top-level, nested objects are still references!
          const merged = { ...this.defaultSettings, ...saved };
          this.settings = structuredClone(merged);
          this.debugLog('LOAD_SETTINGS', 'Settings merged (deep copy)', {
            level: this.settings.level,
            rank: this.settings.rank,
            totalXP: this.settings.totalXP,
          });
  
          // Migrate old data structures if needed
          this.migrateData();
  
          // Restore Set for channelsVisited
          if (Array.isArray(this.settings.activity.channelsVisited)) {
            this.settings.activity.channelsVisited = new Set(
              this.settings.activity.channelsVisited
            );
            this.debugLog('LOAD_SETTINGS', 'Converted channelsVisited array to Set');
          } else if (!(this.settings.activity.channelsVisited instanceof Set)) {
            this.settings.activity.channelsVisited = new Set();
            this.debugLog('LOAD_SETTINGS', 'Initialized new channelsVisited Set');
          }
  
          // CRITICAL: Ensure stats object exists and is properly initialized
          // If stats are missing or empty, merge with defaults instead of overwriting
          if (!this.settings.stats || typeof this.settings.stats !== 'object') {
            // CRITICAL: Use deep copy to prevent defaultSettings corruption
            this.settings.stats = structuredClone(this.defaultSettings.stats);
            this.debugLog('LOAD_SETTINGS', 'Stats object was missing, initialized from defaults');
          } else {
            // Merge stats with defaults to ensure all properties exist
            // CRITICAL: Create new object to avoid reference sharing
            const mergedStats = {
              ...this.defaultSettings.stats,
              ...this.settings.stats,
            };
            this.settings.stats = mergedStats;
            // Ensure all stat properties exist (migration safety)
            this.settings.stats.strength =
              this.settings.stats.strength ?? this.defaultSettings.stats.strength ?? 0;
            this.settings.stats.agility =
              this.settings.stats.agility ?? this.defaultSettings.stats.agility ?? 0;
            this.settings.stats.intelligence =
              this.settings.stats.intelligence ?? this.defaultSettings.stats.intelligence ?? 0;
            this.settings.stats.vitality =
              this.settings.stats.vitality ?? this.defaultSettings.stats.vitality ?? 0;
            this.settings.stats.perception =
              this.settings.stats.perception ??
              this.settings.stats.luck ??
              this.defaultSettings.stats.perception ??
              0;
            this.debugLog('LOAD_SETTINGS', 'Stats merged with defaults', {
              strength: this.settings.stats.strength,
              agility: this.settings.stats.agility,
              intelligence: this.settings.stats.intelligence,
              vitality: this.settings.stats.vitality,
              perception: this.settings.stats.perception,
            });
          }
  
          // Migration note: luck -> perception conversion happens in migrateData().
          // Keep only a safety normalization here to avoid crashing on corrupted saves.
          if (!Array.isArray(this.settings.perceptionBuffs)) {
            this.settings.perceptionBuffs = [];
          }
  
          // Verify critical data exists
          if (
            !this.settings.level ||
            typeof this.settings.level !== 'number' ||
            this.settings.level < 1
          ) {
            this.debugLog('LOAD_SETTINGS', 'Level missing or invalid, initializing from totalXP');
            const levelInfo = this.getCurrentLevel();
            this.settings.level = levelInfo.level || 1;
          }
  
          // Ensure HP/Mana align with current stats/rank after any reset/refund
          this.recomputeHPManaFromStats();
  
          this._hasRealProgress = this._isRealProgressState(this.settings);
          // If loaded state already has progress, skip extra first-save probe.
          // If it looks fresh/default-like, force one persisted probe before first save.
          this._startupProgressProbeComplete = this._hasRealProgress;
  
          // STARTUP GUARD: load complete — unlock save path
          this._startupLoadComplete = true;
          this.debugLog('LOAD_SETTINGS', 'Startup load confirmed — saves unlocked', {
            level: this.settings.level,
            totalXP: this.settings.totalXP,
            source: best.source,
            hasRealProgress: this._hasRealProgress,
          });
  
          // If we loaded from file backup, push it back to primary stores for persistence
          if (loadedFromFile) {
            try {
              await this.saveSettings(true);
              this.debugLog('LOAD_SETTINGS', 'Restored file backup to persistent stores');
            } catch (saveErr) {
              this.debugError('LOAD_SETTINGS', 'Failed to push file backup to stores', saveErr);
            }
          }
  
          // CRITICAL: Ensure totalXP is initialized (prevent progress bar from breaking)
          this.ensureValidTotalXP('LOAD_SETTINGS');
  
          this.debugLog('LOAD_SETTINGS', 'Settings loaded successfully', {
            level: this.settings.level,
            totalXP: this.settings.totalXP,
            messagesSent: this.settings.activity.messagesSent,
            rank: this.settings.rank,
          });
  
          // Emit initial XP changed event for progress bar plugins
          this.emitXPChanged();
        } catch (error) {
          this.debugError('LOAD_SETTINGS', error, { phase: 'settings_merge' });
          throw error;
        }
      } else {
        // LAST-RESORT SAFETY CHECK: Before accepting defaults, verify no real progress
        // exists anywhere. This catches the edge case where all 3 tiers returned null
        // but legacy .data.json has orphaned real data.
        let rescuedFromLegacy = false;
        try {
          const fs = require('fs');
          const pathModule = require('path');
          const legacyPath = pathModule.join(BdApi.Plugins.folder, 'SoloLevelingStats.data.json');
          if (fs.existsSync(legacyPath)) {
            const legacyRaw = fs.readFileSync(legacyPath, 'utf8');
            const legacyData = JSON.parse(legacyRaw);
            if (legacyData && legacyData.level > 1) {
              this.debugLog('RESCUE', `Found real progress in legacy .data.json (level ${legacyData.level}) — refusing to use defaults`);
              const merged = { ...this.defaultSettings, ...legacyData };
              this.settings = structuredClone(merged);
              if (Array.isArray(this.settings.activity?.channelsVisited)) {
                this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
              } else {
                this.settings.activity.channelsVisited = new Set();
              }
              this.recomputeHPManaFromStats();
              this._hasRealProgress = true;
              this._startupProgressProbeComplete = true;
              this._startupLoadComplete = true;
              // Persist rescued data to all tiers so future loads find it
              try { await this.saveSettings(true); } catch (_) { /* best-effort */ }
              rescuedFromLegacy = true;
            }
          }
        } catch (legacyErr) {
          this.debugError('LOAD_SETTINGS', 'Legacy rescue check failed', legacyErr);
        }
  
        if (!rescuedFromLegacy) {
          // Genuinely new user — no data anywhere
          this.settings = structuredClone(this.defaultSettings);
          this.settings.activity.channelsVisited = new Set();
          this._hasRealProgress = false;
          this._startupProgressProbeComplete = false;
          this._startupLoadComplete = true; // Allow saves — this is a real fresh start
          this.debugLog('LOAD_SETTINGS', 'No saved data found anywhere (including legacy), using defaults');
        }
      }
    } catch (error) {
      this.debugError('LOAD_SETTINGS', error, { phase: 'load_settings' });
      // CRITICAL: Use deep copy to prevent defaultSettings corruption
      this.settings = structuredClone(this.defaultSettings);
      // Initialize Set for channelsVisited
      this.settings.activity.channelsVisited = new Set();
  
      // Even on error, try legacy rescue before allowing saves of defaults
      try {
        const fs = require('fs');
        const pathModule = require('path');
        const legacyPath = pathModule.join(BdApi.Plugins.folder, 'SoloLevelingStats.data.json');
        if (fs.existsSync(legacyPath)) {
          const legacyData = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
          if (legacyData && legacyData.level > 1) {
            this.debugLog('RESCUE', 'ERROR-PATH RESCUE: Found real progress in legacy .data.json');
            const merged = { ...this.defaultSettings, ...legacyData };
            this.settings = structuredClone(merged);
            if (Array.isArray(this.settings.activity?.channelsVisited)) {
              this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
            } else {
              this.settings.activity.channelsVisited = new Set();
            }
          }
        }
      } catch (_) { /* best-effort */ }
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

  async _saveSettingsImmediate() {
    if (!this.settings) return;
  
    // FIRST-SAVE GUARD: if startup state looks fresh, probe every persisted source once.
    // If real progress exists anywhere, reload instead of writing defaults over it.
    if (!this._startupProgressProbeComplete) {
      const probeResult = await this._detectPersistedRealProgress();
      this._startupProgressProbeComplete = true;
  
      const currentLooksFresh = !this._isRealProgressState(this.settings);
      if (probeResult.found && currentLooksFresh) {
        this.debugLog('SAVE_GUARD', `BLOCKED save: found persisted progress in ${probeResult.source} (level ${probeResult.level}, totalXP ${probeResult.totalXP}) while current state looks fresh. Reloading instead of overwriting.`);
        try {
          await this.loadSettings();
        } catch (_) {
          // best effort
        }
        return;
      }
    }
  
    try {
      // CRITICAL: Validate settings before attempting to save bonuses
      // This prevents errors from corrupting the save process
      if (!this.settings || !this.settings.stats) {
        this.debugError(
          'SAVE_SETTINGS',
          new Error('Settings or stats not initialized - cannot save bonuses')
        );
        // Continue with main save even if bonus save fails
      } else {
        // Sync AGI crit-chance + PER burst profile for CriticalHit before saving settings
        try {
          this.saveAgilityBonus();
        } catch (error) {
          // Don't fail entire save if agility bonus save fails
          // Log error but continue with main settings save
          this.debugError('SAVE_AGILITY_BONUS_IN_SAVE', error);
        }
      }
  
      this.debugLog('SAVE_SETTINGS', 'Current settings before save', {
        level: this.settings.level,
        xp: this.settings.xp,
        totalXP: this.settings.totalXP,
        rank: this.settings.rank,
        stats: this.settings.stats,
        unallocatedPoints: this.settings.unallocatedStatPoints,
      });
  
      // Convert Set to Array for storage and ensure all data is serializable
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
        // Add metadata for debugging
        _metadata: {
          lastSave: new Date().toISOString(),
          version: '2.5.0',
        },
      };
  
      // Remove any non-serializable properties (functions, undefined, etc.)
      const cleanSettings = structuredClone(settingsToSave);
      this._hasRealProgress = this._isRealProgressState(cleanSettings) || this._hasRealProgress;
  
      // CRITICAL: Validate critical data before saving to prevent level resets
      // If level is invalid (0, negative, or missing), don't save corrupted data
      if (
        !cleanSettings.level ||
        cleanSettings.level < 1 ||
        !Number.isInteger(cleanSettings.level)
      ) {
        this.debugError(
          'SAVE_SETTINGS',
          new Error(
            `Invalid level detected: ${cleanSettings.level}. Aborting save to prevent data corruption.`
          )
        );
        return; // Don't save corrupted data
      }
  
      // Validate XP is a valid number
      if (typeof cleanSettings.xp !== 'number' || isNaN(cleanSettings.xp) || cleanSettings.xp < 0) {
        this.debugError(
          'SAVE_SETTINGS',
          new Error(
            `Invalid XP detected: ${cleanSettings.xp}. Aborting save to prevent data corruption.`
          )
        );
        return; // Don't save corrupted data
      }
  
      // CRITICAL: Validate stats haven't regressed to defaults (prevent stat wipe)
      const statSum = Object.values(cleanSettings.stats || {}).reduce(
        (a, b) => a + (Number(b) || 0), 0
      );
      if (statSum === 0 && cleanSettings.level > 1) {
        this.debugError(
          'SAVE_SETTINGS',
          new Error(
            `All stats are zero at level ${cleanSettings.level}. Aborting save to prevent data wipe.`
          )
        );
        return; // Don't save — this is clearly corrupt
      }
  
      // CRITICAL: Check for stat regression vs existing file backup
      try {
        const existingBackup = this.readFileBackup();
        if (existingBackup?.stats) {
          const existingStatSum = Object.values(existingBackup.stats).reduce(
            (a, b) => a + (Number(b) || 0), 0
          );
          if (existingStatSum > 0 && statSum < existingStatSum * 0.5) {
            this.debugError(
              'SAVE_SETTINGS',
              new Error(
                `Stats regression detected: current ${statSum} vs backup ${existingStatSum} (>50% drop). Aborting save.`
              )
            );
            return; // Don't overwrite good data with regressed data
          }
        }
      } catch (regressionCheckError) {
        // Don't block save if regression check itself fails
        this.debugError('SAVE_SETTINGS', 'Regression check failed (non-fatal)', regressionCheckError);
      }
  
      // CRITICAL: Validate totalXP is valid (prevent progress bar from breaking)
      if (
        typeof cleanSettings.totalXP !== 'number' ||
        isNaN(cleanSettings.totalXP) ||
        cleanSettings.totalXP < 0
      ) {
        // Calculate totalXP from level and xp if invalid
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
      }
  
      this.debugLog('SAVE_SETTINGS', 'Clean settings to be saved', {
        level: cleanSettings.level,
        xp: cleanSettings.xp,
        totalXP: cleanSettings.totalXP,
        rank: cleanSettings.rank,
        stats: cleanSettings.stats,
        statSum,
        metadata: cleanSettings._metadata,
      });
  
      // File backup first to survive BdApi.Data/IndexedDB clears
      this.writeFileBackup(cleanSettings);
  
      // Save to IndexedDB first (crash-resistant, primary storage)
      if (this.saveManager) {
        try {
          await this.saveManager.save('settings', cleanSettings, true); // true = create backup
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
  
      // Also save to BdApi.Data (backup/legacy support)
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
          // No delay between retries - avoid blocking UI thread
        }
      }
  
      if (!saveSuccess) {
        // Don't throw - IndexedDB save might have succeeded
        this.debugError('SAVE_SETTINGS', 'BdApi.Data save failed after 3 attempts', lastError);
      }
  
      // CRITICAL: Always replace backup after successful primary save (maximum persistence)
      try {
        BdApi.Data.save('SoloLevelingStats', 'settings_backup', cleanSettings);
        this.debugLog('SAVE_SETTINGS', 'BdApi.Data backup saved');
      } catch (backupError) {
        // Log backup failure but don't fail entire save
        this.debugError('SAVE_SETTINGS_BACKUP', 'BdApi.Data backup save failed', backupError);
      }
    } catch (error) {
      this.debugError('SAVE_SETTINGS', error);
      // Try to save to backup location
      try {
        // Ensure we have a clean copy for backup
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
