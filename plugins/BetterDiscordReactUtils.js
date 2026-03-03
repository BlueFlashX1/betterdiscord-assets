/**
 * BetterDiscordReactUtils — Shared React utilities for BetterDiscord plugins.
 * Eliminates duplicate React patcher boilerplate across plugins.
 * @version 1.1.0
 */

/**
 * TABLE OF CONTENTS
 * 1) Module Discovery Helpers
 * 2) React Main Content Patch Helpers
 * 3) React Injection Helpers
 * 4) ReactDOM createRoot Discovery
 */

let _cachedMainContentResult = null;
let _mainContentMissingWarned = false;
let _lastPatcherErrorAt = 0;

function _isValidMainContentTuple(result) {
  if (!Array.isArray(result) || result.length !== 2) return false;
  const [mod, key] = result;
  return !!mod && typeof key === 'string' && typeof mod[key] === 'function';
}

function _logMainContentMissingOnce() {
  if (_mainContentMissingWarned) return;
  _mainContentMissingWarned = true;
  console.warn(
    '[BetterDiscordReactUtils] MainContent module not found — all strategies exhausted. Plugins will use DOM fallback.'
  );
}

function _logPatcherErrorRateLimited(error) {
  const now = Date.now();
  if (now - _lastPatcherErrorAt < 5000) return;
  _lastPatcherErrorAt = now;
  console.error('[BetterDiscordReactUtils] Patcher error:', error);
}

/**
 * ============================================================================
 * 1) MODULE DISCOVERY HELPERS
 * ============================================================================
 */

/**
 * Find the app-mount node inside a React returnValue tree.
 * @param {object} returnValue - React render return value
 * @returns {object|null} The app mount node, or null
 */
function findAppMountNode(returnValue) {
  return BdApi.Utils.findInTree(
    returnValue,
    (prop) =>
      prop &&
      prop.props &&
      (prop.props.className?.includes('app') ||
        prop.props.id === 'app-mount' ||
        prop.type === 'body'),
    { walkable: ['props', 'children'] }
  );
}

/**
 * Candidate strings that may appear in Discord's main app container component.
 * Discord renames these periodically — add new candidates here when discovered.
 */
const _MC_STRINGS = ['baseLayer', 'appMount', 'app-mount', 'notAppAsidePanel', 'applicationStore'];

function _resolveFunctionExportKey(mod) {
  if (!mod) return null;
  for (const key of ['Z', 'ZP', 'default']) {
    if (typeof mod[key] === 'function') return key;
  }
  return Object.keys(mod).find((key) => typeof mod[key] === 'function') || null;
}

function _findMainContentByGetWithKey(Webpack, strings) {
  if (typeof Webpack?.getWithKey !== 'function') return null;
  for (const str of strings) {
    try {
      const result = Webpack.getWithKey(
        (m) => typeof m === 'function' && m.toString().includes(str)
      );
      if (_isValidMainContentTuple(result)) return result;
    } catch (_) {}
  }
  return null;
}

function _findMainContentByGetByStrings(Webpack, strings) {
  for (const str of strings) {
    try {
      const mod = Webpack.getByStrings(str, { defaultExport: false });
      const key = _resolveFunctionExportKey(mod);
      if (key) return [mod, key];
    } catch (_) {}
  }
  return null;
}

/**
 * Find the MainContent webpack module (Discord's main app container).
 * Uses multiple strategies for resilience against Discord internal renames.
 * Results are cached to avoid repeating costly Webpack scans.
 * @returns {[object, string]|null} [moduleObject, exportKey] tuple, or null
 */
function findMainContentModule(forceRefresh = false) {
  if (!forceRefresh && _isValidMainContentTuple(_cachedMainContentResult)) {
    return _cachedMainContentResult;
  }

  const { Webpack } = BdApi;

  const withKeyResult = _findMainContentByGetWithKey(Webpack, _MC_STRINGS);
  if (_isValidMainContentTuple(withKeyResult)) {
    _cachedMainContentResult = withKeyResult;
    return withKeyResult;
  }

  const byStringsResult = _findMainContentByGetByStrings(Webpack, _MC_STRINGS);
  if (_isValidMainContentTuple(byStringsResult)) {
    _cachedMainContentResult = byStringsResult;
    return byStringsResult;
  }

  return null;
}

/**
 * ============================================================================
 * 2) REACT MAIN CONTENT PATCH HELPERS
 * ============================================================================
 */

/**
 * Patch Discord's MainContent React component to inject custom UI.
 * @param {object} pluginInstance - The plugin instance (must have _isStopped and _patcherId)
 * @param {string} patcherId - Unique patcher ID for BdApi.Patcher
 * @param {function} renderCallback - Called with (BdApi.React, appNode, returnValue)
 * @returns {boolean} Whether patching succeeded
 */
function patchReactMainContent(pluginInstance, patcherId, renderCallback) {
  let result = findMainContentModule();
  if (!_isValidMainContentTuple(result)) {
    result = findMainContentModule(true);
  }

  if (!result) {
    _logMainContentMissingOnce();
    return false;
  }

  const [mod, key] = result;

  BdApi.Patcher.after(patcherId, mod, key, (_this, _args, returnValue) => {
    try {
      if (pluginInstance._isStopped) return returnValue;

      const appNode = findAppMountNode(returnValue);
      if (!appNode || !appNode.props) return returnValue;

      renderCallback(BdApi.React, appNode, returnValue);
    } catch (e) {
      _logPatcherErrorRateLimited(e);
    }
    return returnValue;
  });

  return true;
}

/**
 * ============================================================================
 * 3) REACT INJECTION HELPERS
 * ============================================================================
 */

/**
 * Inject a React component into an appNode's children with dedup protection.
 * @param {object} appNode - The app mount node from findAppMountNode
 * @param {string} componentId - Unique ID for the wrapper div (for dedup)
 * @param {object} component - React element to inject
 * @param {object} [searchRoot] - Root to search for duplicates (defaults to appNode)
 * @returns {boolean} Whether injection succeeded (false if already exists)
 */
function injectReactComponent(appNode, componentId, component, searchRoot) {
  // Duplicate check
  const already = BdApi.Utils.findInTree(
    searchRoot ?? appNode,
    (prop) => prop && prop.props && prop.props.id === componentId,
    { walkable: ['props', 'children'] }
  );
  if (already) return false;

  const wrapper = BdApi.React.createElement(
    'div',
    { id: componentId, style: { display: 'contents' } },
    component
  );

  if (Array.isArray(appNode.props.children)) {
    appNode.props.children.push(wrapper);
  } else if (appNode.props.children) {
    appNode.props.children = [appNode.props.children, wrapper];
  } else {
    appNode.props.children = wrapper;
  }

  return true;
}

/**
 * ============================================================================
 * 4) REACTDOM CREATEROOT DISCOVERY
 * ============================================================================
 */

/**
 * Get React 18 createRoot with webpack fallbacks.
 * @returns {function|null} createRoot function, or null if unavailable
 */
function getCreateRoot() {
  // Try BdApi.ReactDOM first (official API)
  if (BdApi.ReactDOM?.createRoot) {
    return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
  }

  // Fallback 1: Webpack search for react-dom/client
  try {
    const client = BdApi.Webpack.getModule((m) => m?.createRoot && m?.hydrateRoot);
    if (client?.createRoot) return client.createRoot.bind(client);
  } catch (_) {}

  // Fallback 2: Search exports for createRoot function
  try {
    const createRoot = BdApi.Webpack.getModule(
      (m) => typeof m === 'function' && m?.name === 'createRoot',
      { searchExports: true }
    );
    if (createRoot) return createRoot;
  } catch (_) {}

  return null;
}

module.exports = {
  patchReactMainContent,
  injectReactComponent,
  getCreateRoot,
};
