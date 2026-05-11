module.exports = {
  /**
   * Trim impossible-high unallocated stat points without ever touching
   * already-allocated stats. Guards against legacy save-spam bugs that
   * inflated unallocatedStatPoints far beyond what level-ups + quests
   * could plausibly have granted.
   *
   * Cap = sum of getStatPointsForLevel(l) for l in [1..currentLevel]
   *     + 500 (quest grant buffer; max 5/day × ~100 days)
   *
   * NEVER mutates the 5 base stat values (strength/agility/intelligence/
   * vitality/perception) or any allocated state. Only clamps
   * unallocatedStatPoints downward when it exceeds the cap.
   */
  _reconcileUnallocatedStatPoints() {
    try {
      if (!this.settings) return;
      const currentLevel = Math.max(1, Math.floor(Number(this.settings.level) || 1));
      let levelGrants = 0;
      for (let l = 1; l <= currentLevel; l++) {
        levelGrants += this.getStatPointsForLevel(l);
      }
      const QUEST_GRANT_BUFFER = 500;
      const cap = levelGrants + QUEST_GRANT_BUFFER;
      const current = Number(this.settings.unallocatedStatPoints) || 0;
      if (current <= cap) return;

      const trimmed = current - cap;
      this.settings.unallocatedStatPoints = cap;
      this._settingsDirty = true;

      this.debugError(
        'RECONCILE_UNALLOCATED',
        new Error(`Trimmed ${trimmed} excess unallocated stat points`),
        {
          currentLevel,
          levelGrants,
          questBuffer: QUEST_GRANT_BUFFER,
          cap,
          before: current,
          after: cap,
        }
      );

      if (!this._reconcileUnallocatedToastShown) {
        this._reconcileUnallocatedToastShown = true;
        try {
          BdApi.UI?.showToast?.(
            `SoloLevelingStats: trimmed ${trimmed} excess unallocated stat points (cap: ${cap} at level ${currentLevel}). Allocated stats unchanged.`,
            { type: 'warning', timeout: 10000 }
          );
        } catch (_) {}
      }
    } catch (err) {
      this.debugError('RECONCILE_UNALLOCATED', err);
    }
  },

  migrateData() {
    // Migration logic for future updates
    try {
      // Ensure stats object exists
      if (!this.settings.stats || typeof this.settings.stats !== 'object') {
        // CRITICAL: Use deep copy to prevent defaultSettings corruption
        this.settings.stats = structuredClone(this.defaultSettings.stats);
      } else {
        // Ensure all stat properties exist
        const defaultStats = this.defaultSettings.stats;
        Object.keys(defaultStats).forEach((key) => {
          if (
            this.settings.stats[key] === undefined ||
            typeof this.settings.stats[key] !== 'number'
          ) {
            this.settings.stats[key] = defaultStats[key];
          }
        });
      }
  
      // Ensure activity object exists
      if (!this.settings.activity || typeof this.settings.activity !== 'object') {
        // CRITICAL: Use deep copy to prevent defaultSettings corruption
        this.settings.activity = structuredClone(this.defaultSettings.activity);
      } else {
        // Ensure all activity properties exist
        const defaultActivity = this.defaultSettings.activity;
        Object.keys(defaultActivity).forEach((key) => {
          if (this.settings.activity[key] === undefined) {
            this.settings.activity[key] = defaultActivity[key];
          }
        });
      }
  
      // Migration: Convert luck to perception
      if (this.settings.stats.luck !== undefined && this.settings.stats.perception === undefined) {
        this.settings.stats.perception = this.settings.stats.luck;
        delete this.settings.stats.luck;
      }
      if (this.settings.luckBuffs !== undefined && this.settings.perceptionBuffs === undefined) {
        this.settings.perceptionBuffs = this.settings.luckBuffs;
        delete this.settings.luckBuffs;
      }
  
      // Ensure perceptionBuffs array exists
      if (!Array.isArray(this.settings.perceptionBuffs)) {
        this.settings.perceptionBuffs = [];
      }
  
      // Ensure channelsVisited is a Set
      if (!(this.settings.activity.channelsVisited instanceof Set)) {
        if (Array.isArray(this.settings.activity.channelsVisited)) {
          this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
        } else {
          this.settings.activity.channelsVisited = new Set();
        }
      }
  
      if (
        this.settings.unallocatedStatPoints === undefined ||
        typeof this.settings.unallocatedStatPoints !== 'number'
      ) {
        this.settings.unallocatedStatPoints = 0;
      }
    } catch (error) {
      this.debugError('MIGRATE_DATA', error);
      // Don't wipe real progress on a migration error. If the user has
      // any meaningful state (level > 1, totalXP > 0, any allocated
      // stat > 0), preserve it in-memory and surface a toast — the
      // existing state may be partially-correct but is preferable to
      // a silent reset. Only fall back to defaults if state looks
      // genuinely fresh.
      const looksFresh =
        (this.settings.level || 0) <= 1 &&
        (this.settings.totalXP || 0) <= 0 &&
        (this.settings.unallocatedStatPoints || 0) <= 0 &&
        Object.values(this.settings.stats || {}).every((v) => !v || v <= 0);
      try {
        BdApi.UI?.showToast?.(
          looksFresh
            ? 'SoloLevelingStats: migration failed — reset to defaults.'
            : 'SoloLevelingStats: migration failed — keeping current progress. See console.',
          { type: 'error', timeout: 10000 }
        );
      } catch (_) {}
      if (looksFresh) {
        // CRITICAL: Use deep copy to prevent defaultSettings corruption
        this.settings.stats = structuredClone(this.defaultSettings.stats);
        this.settings.activity = structuredClone(this.defaultSettings.activity);
        this.settings.activity.channelsVisited = new Set();
        this.settings.perceptionBuffs = [];
        this.settings.unallocatedStatPoints = 0;
      }
      // Non-fresh state: leave settings alone. The user keeps what they had.
    }
  }
};
