const C = require('./constants');
const { RANK_ORDER } = require('../shared/rank-utils');

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

    // 2. Resolve the boss rank to a rank that actually has drop tables.
    // 'Shadow Monarch' is intentionally absent from the tables (its reward is
    // the Regalia grant, not loot), so a Shadow-Monarch-rank boss resolves DOWN
    // to Monarch+ rather than falling through to the weakest defaults.
    const rank = this._resolveRankForDrops(bossRank);

    // 3. Probabilistic drop check.
    const chanceTable = C.DROP_TABLES?.DROP_CHANCE_BY_RANK || {};
    const dropChance = chanceTable[rank] ?? chanceTable.E ?? 0.25;
    if (Math.random() >= dropChance) {
      this.debugLog?.(`[EquipmentManager] No drop for rank ${bossRank} boss (chance ${dropChance})`);
      return [];
    }

    // 4. Select rarity from the rank-specific pool, using rank-specific weights
    // when defined (high ranks skew toward the top of their pool).
    const poolTable = C.DROP_TABLES?.RARITY_POOL_BY_RANK || {};
    const pool = poolTable[rank] || poolTable.E || ['D'];
    const weights = C.DROP_TABLES?.RARITY_WEIGHTS_BY_RANK?.[rank]
      || C.DROP_TABLES?.RARITY_WEIGHTS
      || {};
    const selectedRarity = this._weightedRarityPick(pool, weights);

    this.debugLog?.(
      `[EquipmentManager] Drop roll for rank ${bossRank} (as ${rank}): rarity=${selectedRarity}`
    );

    // 5. Resolve the selected rarity to actual items — grant-only sets excluded.
    const allEquipment = this._droppableEquipment();
    const eligible = this._resolveEligibleForRarity(allEquipment, selectedRarity);
    if (eligible.length === 0) {
      this.debugLog?.(`[EquipmentManager] No equipment found at or below rarity "${selectedRarity}"`);
      return [];
    }

    // 5. Pick a random item from eligible pool
    const item = eligible[Math.floor(Math.random() * eligible.length)];
    this.debugLog?.(`[EquipmentManager] Dropped: ${item.name} (${item.id})`);

    return [item.id];
  },

  /**
   * All equipment that is allowed to appear as a random drop.
   *
   * Excludes grant-only sets (see C.GRANT_ONLY_SET_IDS) — currently the Shadow
   * Monarch's Regalia, which is awarded whole on reaching Shadow Monarch rank
   * (Lv2000 + 35 achievements). Every SSS-rarity item in the catalogue belongs
   * to that set, so without this filter a single SSS roll could hand the player
   * a Regalia piece and undercut the terminal reward.
   *
   * @returns {object[]}
   */
  _droppableEquipment() {
    const all = Object.values(C.EQUIPMENT_DATABASE || {});
    const grantOnly = C.GRANT_ONLY_SET_IDS || [];
    if (grantOnly.length === 0) return all;
    return all.filter(e => !grantOnly.includes(e.setId));
  },

  /**
   * Map a boss rank onto the nearest rank that HAS drop tables.
   *
   * 'Shadow Monarch' is deliberately not in the tables, so a boss of that rank
   * would otherwise hit the unknown-rank default and drop bottom-tier junk.
   * Walk DOWN the canonical rank ladder to the nearest ranked entry instead
   * (Shadow Monarch -> Monarch+). A rank that isn't on the ladder at all is
   * genuinely unknown and falls back to 'E'.
   *
   * @param {string} bossRank
   * @returns {string}
   */
  _resolveRankForDrops(bossRank) {
    const chanceTable = C.DROP_TABLES?.DROP_CHANCE_BY_RANK || {};
    if (chanceTable[bossRank] != null) return bossRank;

    const ladder = RANK_ORDER || [];
    const idx = ladder.indexOf(bossRank);
    if (idx === -1) return 'E';

    for (let i = idx - 1; i >= 0; i--) {
      if (chanceTable[ladder[i]] != null) return ladder[i];
    }
    return 'E';
  },

  /**
   * Resolve a chosen rarity to a non-empty item list.
   *
   * A rarity tier with no items in the catalogue used to mean "no drop": the
   * chance roll succeeded, the rarity was picked, the filter came back empty
   * and the caller silently returned []. That is how the (item-less) 'E' tier
   * turned E-rank bosses into a guaranteed 0% and ate most of D/C's rolls.
   *
   * Now a gap degrades gracefully — step DOWN the rarity ladder to the nearest
   * tier that actually has items (and only as a last resort, up). A future
   * catalogue gap costs the player a slightly worse item, never the whole drop.
   *
   * @param {object[]} allEquipment
   * @param {string}   rarity
   * @returns {object[]}
   */
  _resolveEligibleForRarity(allEquipment, rarity) {
    const at = (r) => allEquipment.filter(e => e.rarity === r);

    const exact = at(rarity);
    if (exact.length > 0) return exact;

    const order = C.RARITY_ORDER || ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    const idx = order.indexOf(rarity);
    if (idx === -1) return [];

    for (let i = idx - 1; i >= 0; i--) {
      const down = at(order[i]);
      if (down.length > 0) return down;
    }
    for (let i = idx + 1; i < order.length; i++) {
      const up = at(order[i]);
      if (up.length > 0) return up;
    }
    return [];
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
    // Empty pool falls back to the lowest REAL rarity. It used to return 'E',
    // which has no items in the catalogue and therefore meant "no drop".
    if (pool.length === 0) return (C.RARITY_ORDER && C.RARITY_ORDER[0]) || 'D';
    if (pool.length === 1) return pool[0];

    // Build a numeric weight for each pool entry (weights is positional: [lowest, middle, highest])
    const rawWeights = pool.map((rarity, index) => {
      const w = Array.isArray(weights) ? weights[index] : weights[rarity];
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
