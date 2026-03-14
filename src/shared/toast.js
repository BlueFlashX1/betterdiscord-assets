/**
 * Shared toast helper with level-up type mapping.
 * Replaces the duplicated `(msg, type) => BdApi.UI.showToast(...)` pattern
 * found in 15/16 plugins.
 *
 * Usage:
 *   import { createToast } from "../shared/toast";
 *   this._toast = createToast();
 *   this._toast("Hello!", "success");
 *   this._toast("Cooldown!", "error", 3000);
 */

/**
 * Create a toast function that maps custom types (e.g. "level-up") to
 * BdApi-supported types.
 * @returns {(message: string, type?: string, timeout?: number) => void}
 */
function createToast() {
  return (message, type = "info", timeout) => {
    const opts = { type: type === "level-up" ? "info" : type };
    if (typeof timeout === "number" && timeout > 0) opts.timeout = timeout;
    BdApi.UI.showToast(message, opts);
  };
}

module.exports = { createToast };
