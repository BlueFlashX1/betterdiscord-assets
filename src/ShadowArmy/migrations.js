/**
 * ShadowArmy — Data migrations and lightweight UI refresh hook.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./migrations'))
 */
const C = require('./constants');

module.exports = {
  // ============================================================================
  // DATA MIGRATIONS
  // ============================================================================

  async _loadShadowsForMigration() {
    let allShadows = [];

    if (this.storageManager) {
      try {
        allShadows = await this.storageManager.getShadows({}, 0, Infinity);
      } catch (error) {
        this.debugError('MIGRATION', 'Error getting shadows from IndexedDB', error);
      }
    }

    if (this.settings.shadows && this.settings.shadows.length > 0) {
      const dbShadowIds = new Set(
        allShadows
          .map((shadow) => shadow?.id || shadow?.i || null)
          .filter(Boolean)
      );
      const localStorageShadows = this.settings.shadows.filter((shadow) => {
        const shadowId = shadow?.id || shadow?.i || null;
        return shadowId && !dbShadowIds.has(shadowId);
      });
      allShadows = allShadows.concat(localStorageShadows);
    }

    return allShadows;
  },

  async fixShadowBaseStatsToRankBaselines() {
    try {
      const migrationKey = 'shadowArmy_baseStats_v4';
      if (BdApi.Data.load('ShadowArmy', migrationKey)) return;

      this.debugLog('MIGRATION', 'Fixing shadow base stats to match rank baselines...');

      const allShadows = await this._loadShadowsForMigration();
      this.debugLog('MIGRATION', `Found ${allShadows.length} shadows to fix`);

      if (allShadows.length === 0) {
        this.debugLog('MIGRATION', 'No shadows to fix');
        BdApi.Data.save('ShadowArmy', migrationKey, true);
        return;
      }

      let fixed = 0;
      const batchSize = 50;

      for (let i = 0; i < allShadows.length; i += batchSize) {
        if (this._isStopped) {
          this.debugLog('MIGRATION', 'Base stats migration aborted (plugin stopped)');
          return;
        }
        const batch = allShadows.slice(i, i + batchSize);

        for (const shadow of batch) {
          if (this._isStopped) {
            this.debugLog('MIGRATION', 'Base stats migration aborted (plugin stopped)');
            return;
          }
          try {
            const shadowRank = shadow.rank || 'E';
            const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;
            const roleKey = shadow.role || 'knight';
            const role = this.shadowRoles[roleKey];
            if (!role) continue;

            const rankBaseline = this.getRankBaselineStats(shadowRank, rankMultiplier);
            const roleWeights = this.shadowRoleStatWeights[roleKey] || this.shadowRoleStatWeights.knight;

            const statKeys = C.STAT_KEYS;
            const newBaseStats = statKeys.reduce((stats, stat) => {
              const roleWeight = roleWeights[stat] || 1.0;
              const variance = 0.9 + Math.random() * 0.2;
              stats[stat] = Math.max(1, Math.round(rankBaseline[stat] * roleWeight * variance));
              return stats;
            }, {});

            const existingGrowthStats = shadow.growthStats || { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };
            const existingNaturalGrowthStats = shadow.naturalGrowthStats || { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };

            shadow.baseStats = newBaseStats;
            shadow.growthStats = existingGrowthStats;
            shadow.naturalGrowthStats = existingNaturalGrowthStats;
            shadow.level = shadow.level || 1;
            shadow.xp = shadow.xp || 0;
            shadow.totalCombatTime = shadow.totalCombatTime || 0;
            shadow.lastNaturalGrowth = shadow.lastNaturalGrowth || Date.now();

            const effectiveStats = this.getShadowEffectiveStats(shadow);
            shadow.strength = this.calculateShadowStrength(effectiveStats, 1);

            if (this.storageManager) {
              await this.storageManager.saveShadow(this.prepareShadowForSave(shadow));
            }

            const localIndex = (this.settings.shadows || []).findIndex((s) => s.id === shadow.id);
            if (localIndex !== -1) {
              this.settings.shadows[localIndex] = shadow;
            }

            fixed++;
          } catch (error) {
            this.debugError('MIGRATION', `Error fixing shadow ${shadow.id}`, error);
          }
        }

        if (allShadows.length > 100) {
          this.debugLog('MIGRATION', `Fixed ${Math.min(i + batchSize, allShadows.length)}/${allShadows.length} shadows...`);
        }
      }

      this.saveSettings();
      BdApi.Data.save('ShadowArmy', migrationKey, true);
      this.debugLog('MIGRATION', `Fixed ${fixed} shadows to proper rank baselines!`);
      this.debugLog('MIGRATION', 'SSS shadows now have SSS-level base stats!');
      this.cachedBuffs = null;
      this.cachedBuffsTime = null;
    } catch (error) {
      this.debugError('MIGRATION', 'Error in fixShadowBaseStatsToRankBaselines', error);
      throw error;
    }
  },

  async runDataMigrations() {
    const MIGRATIONS = [
      { version: 3, key: 'shadowArmy_recalculated_v3', run: () => this.recalculateAllShadows() },
      { version: 4, key: 'shadowArmy_baseStats_v4', run: () => this.fixShadowBaseStatsToRankBaselines() },
      { version: 5, key: 'shadowArmy_backfill_v5', run: () => this.backfillMissingFields() },
    ];

    for (const migration of MIGRATIONS) {
      if (BdApi.Data.load('ShadowArmy', migration.key)) continue;
      try {
        this.debugLog('MIGRATION', `Running migration v${migration.version}: ${migration.key}`);
        await migration.run();
        BdApi.Data.save('ShadowArmy', migration.key, { completedAt: new Date().toISOString() });
        this.debugLog('MIGRATION', `Migration v${migration.version} complete`);
      } catch (error) {
        this.debugError('MIGRATION', `Migration v${migration.version} failed: ${migration.key}`, error);
      }
    }
  },

  async backfillMissingFields() {
    if (!this.storageManager) return;

    const allShadows = await this._loadShadowsForMigration();
    if (allShadows.length === 0) return;

    const zeroStats = { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };
    let updated = 0;

    for (const shadow of allShadows) {
      if (shadow._c) continue;

      let dirty = false;

      if (!shadow.growthVarianceSeed || shadow.growthVarianceSeed === 0) {
        shadow.growthVarianceSeed = Math.random();
        dirty = true;
      }
      if (!shadow.naturalGrowthStats || typeof shadow.naturalGrowthStats !== 'object') {
        shadow.naturalGrowthStats = { ...zeroStats };
        dirty = true;
      }
      if (!shadow.growthStats || typeof shadow.growthStats !== 'object') {
        shadow.growthStats = { ...zeroStats };
        dirty = true;
      }
      if (shadow.totalCombatTime === undefined || shadow.totalCombatTime === null) {
        shadow.totalCombatTime = 0;
        dirty = true;
      }
      if (!shadow.lastNaturalGrowth) {
        shadow.lastNaturalGrowth = shadow.extractedAt || Date.now();
        dirty = true;
      }
      if (!shadow.role) {
        shadow.role = 'knight';
        dirty = true;
      }
      if (!shadow.level || shadow.level < 1) {
        shadow.level = 1;
        dirty = true;
      }
      if (shadow.xp === undefined || shadow.xp === null) {
        shadow.xp = 0;
        dirty = true;
      }
      if ((!shadow.strength || shadow.strength === 0) && shadow.baseStats) {
        const effective = this.getShadowEffectiveStats?.(shadow);
        if (effective) {
          shadow.strength = this.calculateShadowStrength?.(effective, 1) || 0;
          dirty = true;
        }
      }

      if (dirty) {
        try {
          await this.storageManager.saveShadow(shadow);
          updated++;
        } catch (error) {
          this.debugError('MIGRATION', `Failed to backfill shadow ${shadow.id}`, error);
        }
      }
    }

    this.debugLog('MIGRATION', `v5 backfill complete`, {
      total: allShadows.length, updated,
      skippedCompressed: allShadows.filter((s) => s._c).length,
    });
  },

  async recalculateAllShadows() {
    try {
      const migrationKey = 'shadowArmy_recalculated_v3';
      if (BdApi.Data.load('ShadowArmy', migrationKey)) return;

      this.debugLog('MIGRATION', 'Recalculating all shadows with user stat capping formula...');

      const allShadows = await this._loadShadowsForMigration();
      this.debugLog('MIGRATION', `Found ${allShadows.length} shadows in migration scan`);

      if (allShadows.length === 0) {
        this.debugLog('MIGRATION', 'No shadows to recalculate');
        BdApi.Data.save('ShadowArmy', migrationKey, true);
        return;
      }

      let recalculated = 0;
      const batchSize = 50;

      for (let i = 0; i < allShadows.length; i += batchSize) {
        if (this._isStopped) {
          this.debugLog('MIGRATION', 'Recalculate migration aborted (plugin stopped)');
          return;
        }
        const batch = allShadows.slice(i, i + batchSize);

        for (const shadow of batch) {
          if (this._isStopped) {
            this.debugLog('MIGRATION', 'Recalculate migration aborted (plugin stopped)');
            return;
          }
          try {
            const shadowRank = shadow.rank || 'E';
            const rankMultiplier = this.rankStatMultipliers[shadowRank] || 1.0;
            const roleKey = shadow.role || 'knight';

            const soloData = this.getSoloLevelingData();
            const currentUserStats = soloData?.stats || {
              strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0,
            };
            const newBaseStats = this.generateShadowBaseStats(currentUserStats, roleKey, shadowRank, rankMultiplier);

            const existingGrowthStats = shadow.growthStats || {
              strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0,
            };

            shadow.baseStats = newBaseStats;
            shadow.growthStats = existingGrowthStats;

            const effectiveStats = this.getShadowEffectiveStats(shadow);
            shadow.strength = this.calculateShadowStrength(effectiveStats, 1);

            if (this.storageManager) {
              try {
                await this.storageManager.saveShadow(this.prepareShadowForSave(shadow));
              } catch (error) {
                this.debugError('MIGRATION', `Failed to save shadow ${shadow.id}`, error);
                const index = (this.settings.shadows || []).findIndex((s) => s.id === shadow.id);
                if (index !== -1) this.settings.shadows[index] = shadow;
              }
            } else {
              const index = (this.settings.shadows || []).findIndex((s) => s.id === shadow.id);
              if (index !== -1) this.settings.shadows[index] = shadow;
            }

            recalculated++;
          } catch (error) {
            this.debugError('MIGRATION', `Error recalculating shadow ${shadow.id}`, error);
          }
        }

        this.saveSettings();
      }

      BdApi.Data.save('ShadowArmy', migrationKey, true);
      this.debugLog('MIGRATION', `Recalculated ${recalculated} shadows with new exponential formula`);
    } catch (error) {
      this.debugError('MIGRATION', 'Error recalculating shadows', error);
    }
  },

  updateUI() {
    if (this._isStopped) return;
    this._widgetDirty = true;
    if (typeof this.scheduleWidgetRefresh === 'function') {
      this.scheduleWidgetRefresh({ reason: 'update_ui', delayMs: 150 });
    }
  },
};
