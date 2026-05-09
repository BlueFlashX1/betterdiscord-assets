#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets';
const REPORT_DIR = '/Users/matthewthompson/Library/Application Support/BetterDiscord/plugins/reports';
const MAP_JSON = path.join(ROOT, 'docs/THEME_TARGET_AREA_MAP.json');
const MARKER = path.join(ROOT, 'themes/organized/post-change-audit-marker.txt');

if (!fs.existsSync(MARKER)) throw new Error(`Missing marker: ${MARKER}`);
if (!fs.existsSync(MAP_JSON)) throw new Error(`Missing area map: ${MAP_JSON}`);

const markerTs = new Date(fs.readFileSync(MARKER, 'utf8').trim()).getTime();
const files = fs
  .readdirSync(REPORT_DIR)
  .filter((f) => f.startsWith('theme-css-audit-') && f.endsWith('.json') && f !== 'theme-css-audit-history.json')
  .map((f) => ({ f, p: path.join(REPORT_DIR, f), m: fs.statSync(path.join(REPORT_DIR, f)).mtimeMs }))
  .filter((x) => x.m >= markerTs)
  .sort((a, b) => a.m - b.m);

const areaMap = JSON.parse(fs.readFileSync(MAP_JSON, 'utf8'));
const selectorToArea = new Map((areaMap.selectors || []).map((s) => [s.selector, s.area]));

const agg = new Map();
function ensure(area) {
  if (!agg.has(area)) agg.set(area, { tested: 0, used: 0, unused: 0, invalid: 0 });
  return agg.get(area);
}

for (const x of files) {
  const j = JSON.parse(fs.readFileSync(x.p, 'utf8'));
  for (const row of j.used || []) {
    const area = selectorToArea.get(row.selector) || 'Misc / Needs Manual Tag';
    const a = ensure(area);
    a.tested += 1;
    a.used += 1;
  }
  for (const row of j.unused || []) {
    const area = selectorToArea.get(row.selector) || 'Misc / Needs Manual Tag';
    const a = ensure(area);
    a.tested += 1;
    a.unused += 1;
  }
  for (const row of j.invalid || []) {
    const area = selectorToArea.get(row.selector) || 'Misc / Needs Manual Tag';
    const a = ensure(area);
    a.invalid += 1;
  }
}

const out = [];
out.push(`# Post-Change Theme Audit Summary`);
out.push(``);
out.push(`- Marker (UTC): ${new Date(markerTs).toISOString()}`);
out.push(`- Reports counted: ${files.length}`);
out.push(``);
out.push(`| Area | Tested | Used | Unused | Invalid | Used % |`);
out.push(`|---|---:|---:|---:|---:|---:|`);

const rows = Array.from(agg.entries())
  .map(([area, a]) => ({ area, ...a, usedPct: a.tested ? ((a.used / a.tested) * 100).toFixed(2) : '0.00' }))
  .sort((a, b) => a.area.localeCompare(b.area));
for (const r of rows) {
  out.push(`| ${r.area} | ${r.tested} | ${r.used} | ${r.unused} | ${r.invalid} | ${r.usedPct}% |`);
}

const OUT = path.join(ROOT, 'docs/THEME_POST_CHANGE_AUDIT_SUMMARY.md');
fs.writeFileSync(OUT, out.join('\n'));
console.log(JSON.stringify({ marker: new Date(markerTs).toISOString(), reports: files.length, out: OUT }, null, 2));
