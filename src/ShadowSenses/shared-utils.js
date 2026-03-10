const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const _bdLoad = loadBdModuleFromPlugins;

let _ReactUtils;
try { _ReactUtils = _bdLoad("BetterDiscordReactUtils.js"); } catch (_) { _ReactUtils = null; }

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

let _TransitionCleanupUtils;
try { _TransitionCleanupUtils = _bdLoad("TransitionCleanupUtils.js"); } catch (_) { _TransitionCleanupUtils = null; }

const _ttl = _PluginUtils?.createTTLCache || ((ms) => {
  let v;
  let t = 0;
  return {
    get: () => Date.now() - t < ms ? v : null,
    set: (x) => {
      v = x;
      t = Date.now();
    },
    invalidate: () => {
      v = null;
      t = 0;
    },
  };
});

module.exports = {
  _bdLoad,
  _PluginUtils,
  _ReactUtils,
  _TransitionCleanupUtils,
  _ttl,
};
