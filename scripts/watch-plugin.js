#!/usr/bin/env node

/**
 * Watch plugin files for changes and automatically reload in Discord
 * Usage: node watch-plugin.js MyPlugin.plugin.js
 */

const chokidar = require('chokidar');
const { execSync } = require('child_process');
const path = require('path');

const pluginName = process.argv[2] || 'MyPlugin.plugin.js';
const pluginPath = path.join(__dirname, '..', 'plugins', pluginName);

if (!require('fs').existsSync(pluginPath)) {
  console.error(`❌ Plugin not found: ${pluginPath}`);
  process.exit(1);
}

console.log(`👀 Watching ${pluginName} for changes...`);
console.log(`   Press Ctrl+C to stop\n`);

// Link plugin initially
try {
  require('./link-plugin.js');
} catch (error) {
  console.error('Error linking plugin:', error.message);
}

// Watch for changes
const watcher = chokidar.watch(pluginPath, {
  persistent: true,
  ignoreInitial: false
});

watcher.on('change', (path) => {
  console.log(`\n📝 File changed: ${path}`);
  console.log('   Relinking plugin...');

  try {
    require('./link-plugin.js');
    console.log('   ✅ Plugin reloaded! Check Discord (you may need to reload Discord with Ctrl+R)');
  } catch (error) {
    console.error('   ❌ Error reloading plugin:', error.message);
  }
});

watcher.on('error', (error) => {
  console.error('❌ Watcher error:', error);
});
