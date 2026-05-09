module.exports = {
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
      // Fallback to defaults if migration fails
      // CRITICAL: Use deep copy to prevent defaultSettings corruption
      this.settings.stats = structuredClone(this.defaultSettings.stats);
      this.settings.activity = structuredClone(this.defaultSettings.activity);
      this.settings.activity.channelsVisited = new Set();
      this.settings.perceptionBuffs = [];
      this.settings.unallocatedStatPoints = 0;
    }
  }
};
