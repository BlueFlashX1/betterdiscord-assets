const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const _bdLoad = loadBdModuleFromPlugins;

let _ReactUtils;
try { _ReactUtils = _bdLoad("BetterDiscordReactUtils.js"); } catch (_) { _ReactUtils = null; }

let _SLUtils;
_SLUtils = _bdLoad("SoloLevelingUtils.js") || window.SoloLevelingUtils || null;
if (_SLUtils && !window.SoloLevelingUtils) window.SoloLevelingUtils = _SLUtils;

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

module.exports = {
  _PluginUtils,
  _ReactUtils,
  _SLUtils,
  _bdLoad,
};
