#!/usr/bin/env node

/**
 * Link a plugin from development folder to BetterDiscord plugins folder
 * Usage: node link-plugin.js MyPlugin.plugin.js
 */

const fs = require('fs-extra');
const path = require('path');

const pluginName = process.argv[2] || 'MyPlugin.plugin.js';
const sourcePath = path.join(__dirname, '..', 'plugins', pluginName);
const targetPath = path.join(
  process.env.HOME,
  'Library/Application Support/BetterDiscord/plugins',
  pluginName
);

if (!fs.existsSync(sourcePath)) {
  console.error(`❌ Plugin not found: ${sourcePath}`);
  process.exit(1);
}

try {
  // Create symlink
  if (fs.existsSync(targetPath)) {
    fs.removeSync(targetPath);
  }
  fs.ensureSymlinkSync(sourcePath, targetPath);
  console.log(`✅ Linked ${pluginName} to BetterDiscord plugins folder`);
  console.log(`   Source: ${sourcePath}`);
  console.log(`   Target: ${targetPath}`);
} catch (error) {
  console.error(`❌ Error linking plugin:`, error.message);
  process.exit(1);
}
