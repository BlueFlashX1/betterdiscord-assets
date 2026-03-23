const C = require('./constants');

/**
 * Drop system mixin.
 * Mixed into the EquipmentManager plugin class via Object.assign.
 *
 * All methods are designed to be called with `this` pointing at the plugin instance,
 * so they can access this.debugLog?.() and delegate to helpers below.
 */
module.exports = {
  /**
   * Roll for equipment drop(s) on a boss kill.
   * Called when the Dungeons:awardEssence event fires with source === 'boss_kill'.
   *
   * @param {string} bossRank  — e.g. 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'
   * @param {object} context   — optional metadata from the dungeon event
   * @param {boolean} [context.isDemonCastle]
   * @param {number}  [context.dcFloor]
   * @param {string}  [context.bossName]
   * @returns {string[]} — array of dropped equipment IDs (may be empty)
   */
  rollEquipmentDrop(bossRank, context = {}) {
    // 1. Guaranteed Demon Castle floor drops take priority
    if (context.isDemonCastle && context.dcFloor != null) {
      const guaranteed = C.GUARANTEED_DROPS?.[context.dcFloor];
      if (guaranteed && guaranteed.length > 0) {
        this.debugLog?.(
          `[EquipmentManager] Demon Castle floor ${context.dcFloor}: awarding ${guaranteed.length} guaranteed drop(s)`
        );
        return [...guaranteed];
      }
    }

    // 2. Probabilistic drop check
    const dropChance = C.DROP_TABLES?.DROP_CHANCE_BY_RANK?.[bossRank] ?? 0.05;
    if (Math.random() >= dropChance) {
      this.debugLog?.(`[EquipmentManager] No drop for rank ${bossRank} boss (chance ${dropChance})`);
      return [];
    }

    // 3. Select rarity from rank-specific pool
    const pool = C.DROP_TABLES?.RARITY_POOL_BY_RANK?.[bossRank] || ['E'];
    const weights = C.DROP_TABLES?.RARITY_WEIGHTS || {};
    const selectedRarity = this._weightedRarityPick(pool, weights);

    this.debugLog?.(
      `[EquipmentManager] Drop roll for rank ${bossRank}: rarity=${selectedRarity}`
    );

    // 4. Filter equipment database by selected rarity
    const allEquipment = Object.values(C.EQUIPMENT_DATABASE || {});
    const eligible = allEquipment.filter(e => e.rarity === selectedRarity);
    if (eligible.length === 0) {
      this.debugLog?.(`[EquipmentManager] No equipment found for rarity "${selectedRarity}"`);
      return [];
    }

    // 5. Pick a random item from eligible pool
    const item = eligible[Math.floor(Math.random() * eligible.length)];
    this.debugLog?.(`[EquipmentManager] Dropped: ${item.name} (${item.id})`);

    return [item.id];
  },

  /**
   * Create a new inventory instance from a dropped equipment ID.
   *
   * @param {string} equipmentId  — ID from C.EQUIPMENT_DATABASE
   * @param {string} [source]     — provenance label, e.g. 'boss_kill', 'dc_floor_5'
   * @returns {{ instanceId: string, equipmentId: string, acquiredAt: number, acquiredFrom: string }}
   */
  createDropInstance(equipmentId, source = 'boss_kill') {
    return {
      instanceId: this._generateId(),
      equipmentId,
      acquiredAt: Date.now(),
      acquiredFrom: source,
    };
  },

  /**
   * Perform a weighted random selection from a rarity pool.
   *
   * pool    = ['B', 'A', 'S']          — rarities to pick from
   * weights = { E: 0.90, D: 0.80, ... } — per-rarity probability weights (keyed by rarity)
   *
   * If a pool entry has no entry in weights, it gets a share of the remaining weight
   * distributed evenly across all unweighted entries.
   *
   * @param {string[]} pool
   * @param {object}   weights  — map of rarity → relative weight (0–1 or any positive number)
   * @returns {string}
   */
  _weightedRarityPick(pool, weights) {
    if (pool.length === 0) return 'E';
    if (pool.length === 1) return pool[0];

    // Build a numeric weight for each pool entry
    const rawWeights = pool.map(rarity => {
      const w = weights[rarity];
      return (typeof w === 'number' && w > 0) ? w : null;
    });

    const weightedCount = rawWeights.filter(w => w !== null).length;
    const weightedSum = rawWeights.reduce((acc, w) => acc + (w ?? 0), 0);
    const unweightedCount = pool.length - weightedCount;

    // Remaining weight distributed evenly among entries without explicit weights
    const fallbackWeight = unweightedCount > 0
      ? Math.max(0, (1 - weightedSum) / unweightedCount)
      : 0;

    const resolvedWeights = rawWeights.map(w => w !== null ? w : fallbackWeight);
    const totalWeight = resolvedWeights.reduce((acc, w) => acc + w, 0);

    if (totalWeight <= 0) {
      // All weights collapsed to zero — uniform random fallback
      return pool[Math.floor(Math.random() * pool.length)];
    }

    let roll = Math.random() * totalWeight;
    for (let i = 0; i < pool.length; i++) {
      roll -= resolvedWeights[i];
      if (roll <= 0) return pool[i];
    }

    // Floating point safety: return last entry
    return pool[pool.length - 1];
  },

  /**
   * Generate a unique instance ID for an inventory item.
   * Prefers crypto.randomUUID when available; falls back to timestamp + random hex.
   *
   * @returns {string}
   */
  _generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  },
};
