const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const _bdLoad = loadBdModuleFromPlugins;

let _ReactUtils;
try { _ReactUtils = _bdLoad("BetterDiscordReactUtils.js"); } catch (_) { _ReactUtils = null; }

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

// Unlike the two optional helpers above, a missing TransitionCleanupUtils has
// a real consequence: every call site optional-chains it, so teardown silently
// becomes a no-op and _transitionNavTimeout / _transitionCleanupTimeout /
// _navigateRetryTimers / _channelFadeResetTimer keep firing after
// _deactivateSensesResources has already nulled sensesEngine and
// deploymentManager. Surface the failure instead of swallowing it — the
// fallback in index.js only runs if this is null, and nobody could diagnose
// that state from a silent catch.
let _TransitionCleanupUtils;
try {
  _TransitionCleanupUtils = _bdLoad("TransitionCleanupUtils.js");
} catch (err) {
  _TransitionCleanupUtils = null;
  console.error(
    '[ShadowSenses] TransitionCleanupUtils.js failed to load — transition/navigation timers will be torn down by the inline fallback:',
    err
  );
}

const { createSingleValueCache: _ttl } = require("../shared/ttl-cache");

module.exports = {
  _bdLoad,
  _PluginUtils,
  _ReactUtils,
  _TransitionCleanupUtils,
  _ttl,
};
