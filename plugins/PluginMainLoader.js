const fs = require('fs');
const path = require('path');

function loadMainModule(mainFile) {
  try {
    const fullPath = path.join(BdApi.Plugins.folder, mainFile);
    const source = fs.readFileSync(fullPath, 'utf8');
    const moduleShim = { exports: {} };
    const factory = new Function('module', 'exports', 'require', '__filename', '__dirname', source);
    factory(moduleShim, moduleShim.exports, require, fullPath, path.dirname(fullPath));
    const loaded = moduleShim.exports;
    if (typeof loaded === 'function') return loaded;
    if (loaded && typeof loaded.default === 'function') return loaded.default;
    return null;
  } catch (_) {
    return null;
  }
}

module.exports = function loadPluginMain({ pluginName, mainFile }) {
  const LoadedPlugin = loadMainModule(mainFile);
  if (typeof LoadedPlugin === 'function') return LoadedPlugin;

  function LoaderErrorPlugin() {}
  LoaderErrorPlugin.prototype.start = function () {
    try {
      BdApi.UI.showToast(`${pluginName} failed to load ${mainFile}`, { type: 'error' });
    } catch (_) {}
    console.error(`[${pluginName}] Failed to load ${mainFile}`);
  };
  LoaderErrorPlugin.prototype.stop = function () {};
  return LoaderErrorPlugin;
};
