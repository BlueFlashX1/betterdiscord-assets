/**
 * warn-once.js — Deduplicated console.warn helper.
 * Returns a function that only warns once per key.
 */

function createWarnOnce() {
  const warned = new Set();
  return (key, message, detail = null) => {
    if (warned.has(key)) return;
    warned.add(key);
    detail !== null ? console.warn(message, detail) : console.warn(message);
  };
}

function clearWarnings(warnOnce) {
  // No-op if not using the Set-based pattern; provided for symmetry
}

module.exports = { createWarnOnce };
