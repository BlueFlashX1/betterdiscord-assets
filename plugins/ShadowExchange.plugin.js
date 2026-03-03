/**
 * @name ShadowExchange
 * @description Shadow waypoint bookmark system — station shadows at Discord locations and teleport to them instantly. Solo Leveling themed.
 * @version 2.1.1
 * @author matthewthompson
 */

const _bdLoad = (f) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.join(BdApi.Plugins.folder, f);
    const source = fs.readFileSync(fullPath, 'utf8');
    const moduleShim = { exports: {} };
    const factory = new Function('module', 'exports', 'require', source);
    factory(moduleShim, moduleShim.exports, require);
    const loaded = moduleShim.exports;
    if (typeof loaded === 'function') return loaded;
    if (loaded && typeof loaded.default === 'function') return loaded.default;
  } catch (_) {}

  function LoaderErrorPlugin() {}
  LoaderErrorPlugin.prototype.start = function () {
    try {
      BdApi.UI.showToast(`ShadowExchange failed to load ${f}`, { type: 'error' });
    } catch (_) {}
    console.error(`[ShadowExchange] Failed to load ${f}`);
  };
  LoaderErrorPlugin.prototype.stop = function () {};
  return LoaderErrorPlugin;
};

module.exports = _bdLoad('ShadowExchangeMain.js');
