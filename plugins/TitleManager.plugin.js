/**
 * @name SoloLevelingTitleManager
 * @author BlueFlashX1
 * @description Title management system for Solo Leveling Stats - display and equip titles with buffs
 * @version 2.0.0
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
      BdApi.UI.showToast(`TitleManager failed to load ${f}`, { type: 'error' });
    } catch (_) {}
    console.error(`[TitleManager] Failed to load ${f}`);
  };
  LoaderErrorPlugin.prototype.stop = function () {};
  return LoaderErrorPlugin;
};

module.exports = _bdLoad('TitleManagerMain.js');
