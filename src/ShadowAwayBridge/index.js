/**
 * ShadowAwayBridge source shim.
 *
 * Canonical runtime implementation lives in:
 *   betterdiscord-assets/src/ShadowAwayBridge/runtime.js
 *
 * Keeping this as an explicit shim prevents drift between source and deployed runtime logic.
 */
module.exports = require("./runtime");
