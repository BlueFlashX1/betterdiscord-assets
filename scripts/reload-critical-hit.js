/**
 * Script to reload and re-enable CriticalHit plugin
 * Run this in Discord's DevTools console (Ctrl+Shift+I / Cmd+Option+I)
 * Or use: node scripts/reload-critical-hit.js (if BetterDiscord CLI available)
 */

// Method 1: Using BetterDiscord API (run in Discord console)
const reloadCriticalHit = () => {
  if (typeof BdApi === 'undefined') {
    console.error(
      "BetterDiscord API not available. Make sure you're running this in Discord's console."
    );
    return;
  }

  const pluginName = 'CriticalHit';

  try {
    // Get the plugin
    const plugin = BdApi.Plugins.get(pluginName);

    if (!plugin) {
      console.error(`Plugin "${pluginName}" not found.`);
      return;
    }

    console.log(`Found plugin: ${pluginName}`);
    console.log(`Current state: ${plugin.enabled ? 'enabled' : 'disabled'}`);

    // Disable first (if enabled)
    if (plugin.enabled) {
      console.log('Disabling plugin...');
      BdApi.Plugins.disable(pluginName);
    }

    // Wait a moment
    setTimeout(() => {
      // Reload the plugin
      console.log('Reloading plugin...');
      BdApi.Plugins.reload(pluginName);

      // Wait a moment, then enable
      setTimeout(() => {
        console.log('Enabling plugin...');
        BdApi.Plugins.enable(pluginName);
        console.log(`✅ ${pluginName} plugin reloaded and enabled!`);
      }, 500);
    }, 500);
  } catch (error) {
    console.error('Error reloading plugin:', error);
  }
};

// Method 2: Direct file touch to trigger reload (if API doesn't work)
const touchPluginFile = () => {
  const fs = require('fs');
  const path = require('path');

  const pluginPath = path.join(
    process.env.HOME,
    'Library/Application Support/BetterDiscord/plugins/CriticalHit.plugin.js'
  );

  if (fs.existsSync(pluginPath)) {
    const now = new Date();
    fs.utimesSync(pluginPath, now, now);
    console.log('✅ Plugin file touched - BetterDiscord should auto-reload it');
  } else {
    console.error('Plugin file not found at:', pluginPath);
  }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { reloadCriticalHit, touchPluginFile };
}

// Auto-run if in browser console
if (typeof window !== 'undefined' && typeof BdApi !== 'undefined') {
  reloadCriticalHit();
}
