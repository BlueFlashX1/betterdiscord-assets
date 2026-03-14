/**
 * Shared rank utilities.
 * Replaces the 8+ duplicated rank-index lookup arrays spread across
 * SoloLevelingStats, SoloLevelingToasts, SkillTree, ShadowArmy, Dungeons,
 * CriticalHit, ShadowSenses, and ShadowExchange.
 *
 * Usage:
 *   const { getRankIndex, compareRanks, getRankAtIndex, RANK_ORDER } = require("../shared/rank-utils");
 *
 *   getRankIndex("S")           // => 5
 *   getRankIndex("Unknown")     // => 0  (treated as E-rank)
 *   compareRanks("SS", "S")    // => positive (SS > S)
 *   getRankAtIndex(12)          // => "Shadow Monarch"
 */

const RANK_ORDER = [
  'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SSS+',
  'NH', 'Monarch', 'Monarch+', 'Shadow Monarch'
];

/**
 * Get the index of a rank string. Returns 0 (E-rank) if rank is invalid or unknown.
 * @param {string} rank
 * @returns {number}
 */
function getRankIndex(rank) {
  const idx = RANK_ORDER.indexOf(rank);
  return idx >= 0 ? idx : 0;
}

/**
 * Compare two ranks. Returns positive if rankA > rankB, negative if rankA < rankB,
 * and 0 if they are equal.
 * @param {string} rankA
 * @param {string} rankB
 * @returns {number}
 */
function compareRanks(rankA, rankB) {
  return getRankIndex(rankA) - getRankIndex(rankB);
}

/**
 * Get the rank string at a given index, clamped to valid range.
 * @param {number} index
 * @returns {string}
 */
function getRankAtIndex(index) {
  const clamped = Math.max(0, Math.min(RANK_ORDER.length - 1, Math.floor(index)));
  return RANK_ORDER[clamped];
}

module.exports = { RANK_ORDER, getRankIndex, compareRanks, getRankAtIndex };
