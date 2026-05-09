const SLEvents = require('../shared/event-bus');

module.exports = {
  initEquipmentIntegration() {
    // Pull initial bonuses immediately if EquipmentManager is already ready
    this.updateEquipmentBonuses();

    // Primary channel: SLEvents (same bus EquipmentManager uses to emit)
    this._onEquipmentChanged = () => {
      this.updateEquipmentBonuses();
      // Invalidate effective-stats cache so the next read is fresh
      this._cache.totalEffectiveStats = null;
      this._cache.totalEffectiveStatsTime = 0;
      this.updateChatUI();
    };
    SLEvents.on('EquipmentManager:changed', this._onEquipmentChanged);
  },

  updateEquipmentBonuses() {
    try {
      const bonuses = window.EquipmentManager?.getTotalEquippedBonuses?.() || null;
      this._cachedEquipmentBonuses = bonuses && typeof bonuses === 'object' ? bonuses : null;
    } catch (_) {
      this._cachedEquipmentBonuses = null;
    }
  },

  getEquipmentBonuses() {
    return this._cachedEquipmentBonuses || {};
  },

  cleanupEquipmentIntegration() {
    if (this._onEquipmentChanged) {
      SLEvents.off('EquipmentManager:changed', this._onEquipmentChanged);
      this._onEquipmentChanged = null;
    }
    this._cachedEquipmentBonuses = null;
  },
};
