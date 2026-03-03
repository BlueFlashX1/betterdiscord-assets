/**
 * @name ShadowStep
 * @description Bookmark channels as Shadow Anchors and teleport to them instantly with a shadow transition. Solo Leveling themed.
 * @version 1.0.1
 * @author BlueFlashX1
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
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
      BdApi.UI.showToast(`ShadowStep failed to load ${f}`, { type: 'error' });
    } catch (_) {}
    console.error(`[ShadowStep] Failed to load ${f}`);
  };
  LoaderErrorPlugin.prototype.stop = function () {};
  return LoaderErrorPlugin;
};

module.exports = _bdLoad('ShadowStepMain.js');
