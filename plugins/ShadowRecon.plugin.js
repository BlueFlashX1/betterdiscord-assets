/**
 * @name ShadowRecon
 * @description Lore-accurate recon suite: mark guilds for dossiers, track staff authority, and inspect marked targets from ShadowSenses (platform + connections).
 * @version 1.0.5
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
      BdApi.UI.showToast(`ShadowRecon failed to load ${f}`, { type: 'error' });
    } catch (_) {}
    console.error(`[ShadowRecon] Failed to load ${f}`);
  };
  LoaderErrorPlugin.prototype.stop = function () {};
  return LoaderErrorPlugin;
};

module.exports = _bdLoad('ShadowReconMain.js');
