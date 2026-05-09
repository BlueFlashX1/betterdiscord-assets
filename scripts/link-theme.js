#!/usr/bin/env node

/**
 * Link a theme from development folder to BetterDiscord themes folder
 * Usage: node link-theme.js MyTheme.theme.css
 */

const fs = require('fs-extra');
const path = require('path');

const themeName = process.argv[2] || 'MyTheme.theme.css';
const sourcePath = path.join(__dirname, '..', 'themes', themeName);
const targetPath = path.join(
  process.env.HOME,
  'Library/Application Support/BetterDiscord/themes',
  themeName
);

if (!fs.existsSync(sourcePath)) {
  console.error(`❌ Theme not found: ${sourcePath}`);
  process.exit(1);
}

try {
  // Create symlink
  if (fs.existsSync(targetPath)) {
    fs.removeSync(targetPath);
  }
  fs.ensureSymlinkSync(sourcePath, targetPath);
  console.log(`✅ Linked ${themeName} to BetterDiscord themes folder`);
  console.log(`   Source: ${sourcePath}`);
  console.log(`   Target: ${targetPath}`);
} catch (error) {
  console.error(`❌ Error linking theme:`, error.message);
  process.exit(1);
}
