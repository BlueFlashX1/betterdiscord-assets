const SLEvents = require('../shared/event-bus');

// Shadow Monarch's Regalia — IDs of all 10 set pieces, ordered by slot.
const SM_REGALIA_ITEM_IDS = [
  'shadow_monarchs_blade',       // weapon
  'shadow_monarchs_aegis',       // offHand
  'crown_of_the_shadow_monarch', // helmet
  'shadow_sovereigns_mantle',    // chestplate
  'shadow_gauntlets',            // gloves
  'shadow_greaves',              // boots
  'shadow_monarchs_earring',     // earring
  'shadow_monarchs_necklace',    // necklace
  'shadow_monarchs_ring_left',   // ring (→ ring1)
  'shadow_monarchs_ring_right',  // ring (→ ring2)
];

// Settings key used to persist the one-time grant flag.
// Stored in BdApi.Data so it survives plugin reloads.
const SM_GRANT_FLAG_KEY = '_shadowMonarchRegaliaGranted';
const PLUGIN_NAME = 'EquipmentManager';

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

      let droppedIds = this.rollEquipmentDrop(bossRank, context) || [];
      // SHADOW MONARCH PERK (Sovereign's Tribute): the fallen offer double
      // tribute — boss kills roll the drop table a second time at SM. Two
      // independent rolls (not a guaranteed drop): expected yield doubles,
      // and both can hit. Regalia stays grant-only via GRANT_ONLY_SET_IDS
      // regardless of how many rolls happen.
      try {
        const rank = BdApi.Plugins.get('SoloLevelingStats')?.instance?.settings?.rank;
        if (rank === 'Shadow Monarch') {
          droppedIds = droppedIds.concat(this.rollEquipmentDrop(bossRank, context) || []);
        }
      } catch (_) { /* tribute must never break the base drop */ }
      if (!droppedIds || droppedIds.length === 0) return;

      for (const eqId of droppedIds) {
        const instance = this.createDropInstance(eqId, 'boss_kill');
        this.storage.addToInventory(instance);

        const def = require('./constants').getEquipmentById(eqId);
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

      // Coalesce popup refreshes — Dungeons:awardEssence can fire several
      // times in quick succession during one dungeon, each potentially
      // dropping loot. Batch the re-render into a single frame.
      clearTimeout(this._bossKillRefreshTimer);
      this._bossKillRefreshTimer = setTimeout(() => this._refreshPopup(), 200);
    };
    SLEvents.on('Dungeons:awardEssence', this._onBossKill);

    // Shadow Monarch rank-change detection: check on startup, then poll
    // every 30 s. Guarded by a persisted once-flag so items are granted
    // exactly once even across plugin reloads or Discord restarts. Skip
    // starting the poll entirely if the grant was already persisted in a
    // prior session — the interval only exists to catch the rank-up.
    this._checkShadowMonarchGrant();
    if (!BdApi.Data.load(PLUGIN_NAME, SM_GRANT_FLAG_KEY)) {
      this._smRankPollInterval = setInterval(() => {
        this._checkShadowMonarchGrant();
      }, 30_000);
    }
  },

  _unmountEventListeners() {
    if (this._onBossKill) {
      SLEvents.off('Dungeons:awardEssence', this._onBossKill);
      this._onBossKill = null;
    }
    clearTimeout(this._bossKillRefreshTimer);
    this._bossKillRefreshTimer = null;

    if (this._smRankPollInterval) {
      clearInterval(this._smRankPollInterval);
      this._smRankPollInterval = null;
    }
  },

  /**
   * Check if the player is Shadow Monarch rank and, if so, grant the full
   * Shadow Monarch's Regalia set to their inventory exactly once.
   *
   * Idempotency: persisted via BdApi.Data[SM_GRANT_FLAG_KEY].
   * Cross-plugin read: BdApi.Plugins.get('SoloLevelingStats')?.instance?.settings?.rank
   */
  _checkShadowMonarchGrant() {
    try {
      // 1. Bail immediately if already granted (persisted across reloads).
      const alreadyGranted = BdApi.Data.load(PLUGIN_NAME, SM_GRANT_FLAG_KEY);
      if (alreadyGranted) return;

      // 2. Read rank from SoloLevelingStats.
      const sls = BdApi.Plugins.get('SoloLevelingStats')?.instance;
      const rank = sls?.settings?.rank || sls?.rank || null;
      if (rank !== 'Shadow Monarch') return;

      // 3. Grant all 10 set pieces to inventory.
      const C = require('./constants');
      for (const eqId of SM_REGALIA_ITEM_IDS) {
        const instance = this.createDropInstance(eqId, 'shadow_monarch_regalia_grant');
        this.storage.addToInventory(instance);

        const def = C.getEquipmentById(eqId);
        SLEvents.emit('EquipmentManager:itemDropped', {
          equipmentId: eqId,
          instanceId: instance.instanceId,
          rarity: def?.rarity,
          name: def?.name,
        });
      }

      // 4. Persist the once-flag so this never runs again.
      BdApi.Data.save(PLUGIN_NAME, SM_GRANT_FLAG_KEY, true);

      // Grant is now permanent — stop the poll, it has nothing left to check.
      if (this._smRankPollInterval) {
        clearInterval(this._smRankPollInterval);
        this._smRankPollInterval = null;
      }

      // 5. Notify the player and refresh the popup if open.
      BdApi.UI.showToast(
        "Shadow Monarch's Regalia has materialised in your inventory.",
        { type: 'success' }
      );
      this._refreshPopup?.();

      SLEvents.emit('EquipmentManager:shadowMonarchRegaliaGranted', {
        itemIds: SM_REGALIA_ITEM_IDS,
      });
    } catch (err) {
      console.error('[EquipmentManager] _checkShadowMonarchGrant error:', err);
    }
  },

  _exposePublicAPI() {
    window.EquipmentManager = {
      getTotalEquippedBonuses: () => this._cachedBonuses || this.calculateTotalBonuses(),

      /**
       * Returns a map of slot → equipment definition for every filled slot.
       * Each definition includes `setId` so callers can filter by set membership.
       * @returns {{ [slot: string]: object }}
       */
      getEquippedItems: () => {
        const C = require('./constants');
        const equipped = this.storage.getEquipped();
        const result = {};
        for (const [slot, instanceId] of Object.entries(equipped)) {
          const inst = this.storage.getInstance(instanceId);
          if (inst) result[slot] = C.getEquipmentById(inst.equipmentId);
        }
        return result;
      },

      /**
       * Returns the number of equipped pieces belonging to the given setId.
       * Convenience wrapper so external plugins don't need to iterate getEquippedItems().
       *
       * Usage from another plugin:
       *   const count = window.EquipmentManager?.getEquippedSetPieceCount?.('shadow_monarch_regalia') ?? 0;
       *
       * @param {string} setId
       * @returns {number}
       */
      getEquippedSetPieceCount: (setId) => {
        const C = require('./constants');
        const equipped = this.storage.getEquipped();
        let count = 0;
        for (const instanceId of Object.values(equipped)) {
          if (!instanceId) continue;
          const inst = this.storage.getInstance(instanceId);
          if (!inst) continue;
          const def = C.getEquipmentById(inst.equipmentId);
          if (def?.setId === setId) count++;
        }
        return count;
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
