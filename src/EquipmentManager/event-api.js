const SLEvents = require('../shared/event-bus');

module.exports = {
  _mountEventListeners() {
    // Listen for boss kills from Dungeons
    this._onBossKill = (data) => {
      if (data?.source !== 'boss_kill') return;
      const bossRank = data?.bossRank || data?.mobRank || 'E';
      const context = {
        isDemonCastle: data?.isDemonCastle || false,
        dcFloor: data?.dcFloor || null,
        bossName: data?.bossName || null,
      };

      const droppedIds = this.rollEquipmentDrop(bossRank, context);
      if (!droppedIds || droppedIds.length === 0) return;

      for (const eqId of droppedIds) {
        const instance = this.createDropInstance(eqId, 'boss_kill');
        this.storage.addToInventory(instance);

        const def = require('./constants').getEquipmentById(eqId);
        const rarityColor = require('./constants').getRarityColor(def?.rarity);
        BdApi.UI.showToast(
          `Equipment Drop: ${def?.name || eqId} [${def?.rarity || '?'}-Rank]`,
          { type: 'success' }
        );

        SLEvents.emit('EquipmentManager:itemDropped', {
          equipmentId: eqId,
          instanceId: instance.instanceId,
          rarity: def?.rarity,
          name: def?.name,
        });
      }

      this._refreshPopup();
    };
    SLEvents.on('Dungeons:awardEssence', this._onBossKill);
  },

  _unmountEventListeners() {
    if (this._onBossKill) {
      SLEvents.off('Dungeons:awardEssence', this._onBossKill);
      this._onBossKill = null;
    }
  },

  _exposePublicAPI() {
    window.EquipmentManager = {
      getTotalEquippedBonuses: () => this._cachedBonuses || this.calculateTotalBonuses(),
      getEquippedItems: () => {
        const C = require('./constants');
        const equipped = this.storage.getEquipped();
        const inventory = this.storage.getInventory();
        const instanceMap = new Map(inventory.map(i => [i.instanceId, i]));
        const result = {};
        for (const [slot, instanceId] of Object.entries(equipped)) {
          const inst = instanceMap.get(instanceId);
          if (inst) result[slot] = C.getEquipmentById(inst.equipmentId);
        }
        return result;
      },
      getInventory: () => this.storage.getInventory(),
      isReady: () => this._ready || false,
    };
  },

  _removePublicAPI() {
    if (window.EquipmentManager) delete window.EquipmentManager;
  },

  _emitChanged(slot, action) {
    SLEvents.emit('EquipmentManager:changed', {
      slot,
      action,
      totalBonuses: this._cachedBonuses || this.calculateTotalBonuses(),
    });
  },
};
