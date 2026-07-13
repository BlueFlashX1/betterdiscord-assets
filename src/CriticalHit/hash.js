/**
 * CriticalHit — string-hash utilities.
 *
 * Consolidates what were three previously-duplicate djb2 implementations:
 *   - crit-engine.js `simpleHash`
 *   - restoration.js `_createSimpleContentHash` (removed — fed a content-hash
 *     match against messageHistory that was unreachable under the LEAN schema,
 *     see history.js:415; prefixedContentHash is now unused but kept exported
 *     as a general-purpose utility)
 *   - id-extraction.js `calculateContentHash`
 *
 * Single source of truth means a future change to the hash function
 * (e.g. swapping in SHA-1 via require("crypto") to reduce collision
 * risk on long-running sessions) only needs to land in one place.
 *
 * Why three exported shapes? Because the call sites have different
 * needs:
 *   - djb2Hash             — raw 32-bit integer, for non-message uses
 *   - prefixedContentHash  — `hash_<n>` string for messages
 *   - compositeContentHash — author + content + timestamp → `hash_<n>`
 */

/**
 * djb2-derived 32-bit hash. Returns the absolute integer value so
 * callers don't have to worry about sign for downstream display.
 * @param {string} str
 * @returns {number}
 */
function djb2Hash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // force 32-bit signed integer
  }
  return Math.abs(hash);
}

/**
 * `hash_<djb2>` form used as a fallback message id when the real
 * Discord snowflake isn't available. Used by restoration.js to
 * match cached crit entries by content alone.
 * @param {string} content
 * @returns {string}
 */
function prefixedContentHash(content) {
  return `hash_${djb2Hash(String(content || ''))}`;
}

/**
 * Composite key derived from author + first 100 chars of content +
 * timestamp. Used by id-extraction.calculateContentHash as a stable
 * fallback identifier when Discord doesn't expose a snowflake on the
 * DOM element.
 *
 * @param {string|null} author
 * @param {string} content
 * @param {string|number|null} [timestamp]
 * @returns {string|null} `hash_<djb2>` or null if content is empty
 */
function compositeContentHash(author, content, timestamp = null) {
  if (!content) return null;
  const authorPart = author || 'unknown';
  const composite = `${authorPart}:${String(content).substring(0, 100)}:${timestamp || ''}`;
  return `hash_${djb2Hash(composite)}`;
}

module.exports = {
  djb2Hash,
  prefixedContentHash,
  compositeContentHash,
};
