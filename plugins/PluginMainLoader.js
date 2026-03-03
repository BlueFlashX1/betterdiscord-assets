const path = require('path');

const loadFromPluginFolder = (fileName) => {
  try {
    const fullPath = path.join(BdApi.Plugins.folder, fileName);
    const loaded = require(fullPath);
    if (typeof loaded === 'function') return loaded;
    if (loaded && typeof loaded.default === 'function') return loaded.default;
    return loaded || null;
  } catch (_) {
    return null;
  }
};

module.exports = function loadPluginMain({ pluginName, mainFile }) {
  const LoadedPlugin = loadFromPluginFolder(mainFile);
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
