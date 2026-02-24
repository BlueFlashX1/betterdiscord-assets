/**
 * BetterDiscordReactUtils — Shared React utilities for BetterDiscord plugins.
 * Eliminates duplicate React patcher boilerplate across plugins.
 * @version 1.1.0
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
const _MC_STRINGS = ['baseLayer', 'appMount', 'app-mount'];

/**
 * Find the MainContent webpack module (Discord's main app container).
 * Uses multiple strategies for resilience against Discord internal renames.
 * @returns {[object, string]|null} [moduleObject, exportKey] tuple, or null
 */
function findMainContentModule() {
  const { Webpack } = BdApi;

  // Strategy 1: getWithKey (BD 1.13+) — auto-resolves export key
  if (typeof Webpack.getWithKey === 'function') {
    for (const str of _MC_STRINGS) {
      try {
        const result = Webpack.getWithKey(
          m => typeof m === 'function' && m.toString().includes(str)
        );
        if (result && result[0]) return result;
      } catch (_) {}
    }
  }

  // Strategy 2: getByStrings + dynamic key detection (legacy BD / fallback)
  for (const str of _MC_STRINGS) {
    try {
      const mod = Webpack.getByStrings(str, { defaultExport: false });
      if (mod) {
        // Try common SWC-mangled export keys, then any function export
        for (const k of ['Z', 'ZP', 'default']) {
          if (typeof mod[k] === 'function') return [mod, k];
        }
        const key = Object.keys(mod).find(k => typeof mod[k] === 'function');
        if (key) return [mod, key];
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Patch Discord's MainContent React component to inject custom UI.
 * @param {object} pluginInstance - The plugin instance (must have _isStopped and _patcherId)
 * @param {string} patcherId - Unique patcher ID for BdApi.Patcher
 * @param {function} renderCallback - Called with (BdApi.React, appNode, returnValue)
 * @returns {boolean} Whether patching succeeded
 */
function patchReactMainContent(pluginInstance, patcherId, renderCallback) {
  const result = findMainContentModule();
  if (!result) {
    console.warn('[BetterDiscordReactUtils] MainContent module not found — all strategies exhausted. Plugins will use DOM fallback.');
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
      console.error('[BetterDiscordReactUtils] Patcher error:', e);
    }
    return returnValue;
  });

  return true;
}

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
