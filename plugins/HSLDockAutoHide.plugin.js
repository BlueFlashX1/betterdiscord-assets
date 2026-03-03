/**
 * @name HSLDockAutoHide
 * @description Auto-hide/show bottom horizontal server dock on hover/near-bottom cursor, with dynamic layout shift. Includes user panel dock mover (originally by BlueFlashX1).
 * @version 4.0.1
 * @author Solo Leveling Theme Dev, BlueFlashX1
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
      BdApi.UI.showToast(`HSLDockAutoHide failed to load ${f}`, { type: 'error' });
    } catch (_) {}
    console.error(`[HSLDockAutoHide] Failed to load ${f}`);
  };
  LoaderErrorPlugin.prototype.stop = function () {};
  return LoaderErrorPlugin;
};

module.exports = _bdLoad('HSLDockAutoHideMain.js');
