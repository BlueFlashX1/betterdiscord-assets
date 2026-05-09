/**
 * Runtime loader for BetterDiscord local plugin helper modules.
 * Reads `<BdApi.Plugins.folder>/<fileName>` and evaluates it with a CommonJS shim.
 */

function loadBdModuleFromPlugins(fileName) {
  if (!fileName) return null;
  try {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), "utf8");
    const moduleObj = { exports: {} };
    const factory = new Function(
      "module",
      "exports",
      "require",
      "BdApi",
      `${source}\nreturn module.exports || exports || null;`
    );
    const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
    const candidate = loaded || moduleObj.exports;
    if (typeof candidate === "function") return candidate;
    if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) {
      return candidate;
    }
  } catch (_) {}
  return null;
}

module.exports = {
  loadBdModuleFromPlugins,
};
