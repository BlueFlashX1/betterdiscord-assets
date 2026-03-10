/**
 * Shared toast helper with level-up type mapping.
 * Replaces the duplicated `(msg, type) => BdApi.UI.showToast(...)` pattern
 * found in 15/16 plugins.
 *
 * Usage:
 *   import { createToast } from "../shared/toast";
 *   this._toast = createToast();
 *   this._toast("Hello!", "success");
 */

/**
 * Create a toast function that maps custom types (e.g. "level-up") to
 * BdApi-supported types.
 * @returns {(message: string, type?: string) => void}
 */
function createToast() {
  return (message, type = "info") => {
    BdApi.UI.showToast(message, {
      type: type === "level-up" ? "info" : type,
    });
  };
}

module.exports = { createToast };
