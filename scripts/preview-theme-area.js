#!/usr/bin/env node

const fs = require('fs');

const MANIFEST =
  '/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes/organized/organization-manifest.json';
const ORGANIZED =
  '/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes/organized/SoloLeveling-ClearVision.organized.reference.theme.css';

const areaArg = process.argv.slice(2).join(' ').trim();
if (!areaArg) {
  console.error('Usage: preview-theme-area.js "Area Name"');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const css = fs.readFileSync(ORGANIZED, 'utf8');

const match = manifest.areas.find((a) => a.area.toLowerCase() === areaArg.toLowerCase());
if (!match) {
  console.error('Area not found. Available areas:');
  for (const a of manifest.areas) console.error(`- ${a.area}`);
  process.exit(1);
}

const area = match.area;
const marker = `/* AREA: ${area} `;
const start = css.indexOf(marker);
if (start < 0) {
  console.error('Area marker not found in organized CSS.');
  process.exit(1);
}

const next = css.indexOf('/* AREA:', start + marker.length);
const section = next > -1 ? css.slice(start, next) : css.slice(start);

console.log(section.trim());
