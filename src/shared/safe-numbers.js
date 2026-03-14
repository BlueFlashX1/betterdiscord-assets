/**
 * Safe number utilities.
 * Prevents NaN propagation, provides clamping, and standardizes
 * the zero-stat-block pattern used across all combat plugins.
 *
 * Usage:
 *   const { safeNumber, clampNumber, createZeroStatBlock, STAT_KEYS } = require("../shared/safe-numbers");
 *
 *   safeNumber(undefined)        // => 0
 *   safeNumber("abc", 5)         // => 5
 *   clampNumber(150, 0, 100)     // => 100
 *   createZeroStatBlock()        // => { strength: 0, agility: 0, ... }
 */

const STAT_KEYS = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];

/**
 * Normalize a value to a finite number. Returns fallback if NaN/Infinity/undefined.
 * @param {*} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Clamp a number between min and max, with NaN protection.
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampNumber(value, min, max) {
  const n = safeNumber(value, min);
  return Math.max(min, Math.min(max, n));
}

/**
 * Create a zero stat block with standard stat keys.
 * @returns {{ strength: number, agility: number, intelligence: number, vitality: number, perception: number }}
 */
function createZeroStatBlock() {
  return { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };
}

module.exports = { safeNumber, clampNumber, createZeroStatBlock, STAT_KEYS };
