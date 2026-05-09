#!/usr/bin/env node

const fs = require('fs');
const { areaRank, classifySelector, parseRules } = require('./theme-css-area-utils');

const THEME_PATH =
  '/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes/SoloLeveling-ClearVision.theme.css';
const HISTORY_PATH =
  '/Users/matthewthompson/Library/Application Support/BetterDiscord/plugins/reports/theme-css-audit-history.json';
const OUT_MD =
  '/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/docs/THEME_TARGET_AREA_MAP.md';
const OUT_JSON =
  '/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/docs/THEME_TARGET_AREA_MAP.json';

function canon(s) {
  return s.replace(/\s+/g, ' ').trim().replace(/'/g, '"');
}

function main() {
  if (!fs.existsSync(THEME_PATH)) throw new Error(`Missing theme file: ${THEME_PATH}`);

  const themeText = fs.readFileSync(THEME_PATH, 'utf8');
  const rules = parseRules(themeText);

  let history = { totalRuns: 0, selectors: {} };
  if (fs.existsSync(HISTORY_PATH)) {
    history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  }

  const areaMap = new Map();
  const entries = [];

  for (const rule of rules) {
    for (const rawSel of rule.selectors) {
      const selector = canon(rawSel);
      if (!selector) continue;

      const stats = history.selectors?.[selector] || { usedRuns: 0, unusedRuns: 0, invalidRuns: 0 };
      const usedRuns = stats.usedRuns || 0;
      const unusedRuns = stats.unusedRuns || 0;
      const invalidRuns = stats.invalidRuns || 0;
      const seenRuns = usedRuns + unusedRuns;
      const deadConfidence = seenRuns > 0 && usedRuns === 0 ? 1 : 0;
      const area = classifySelector(selector);

      if (!areaMap.has(area)) {
        areaMap.set(area, {
          area,
          selectors: 0,
          usedEver: 0,
          highDead: 0,
          firstLine: rule.startLine,
          lastLine: rule.startLine,
          samples: [],
        });
      }

      const agg = areaMap.get(area);
      agg.selectors += 1;
      if (usedRuns > 0) agg.usedEver += 1;
      if (seenRuns >= 10 && usedRuns === 0 && deadConfidence === 1) agg.highDead += 1;
      agg.firstLine = Math.min(agg.firstLine, rule.startLine);
      agg.lastLine = Math.max(agg.lastLine, rule.startLine);
      if (agg.samples.length < 8 && !agg.samples.includes(selector)) agg.samples.push(selector);

      entries.push({
        area,
        selector,
        line: rule.startLine,
        usedRuns,
        unusedRuns,
        invalidRuns,
        seenRuns,
        deadConfidence,
      });
    }
  }

  const areas = Array.from(areaMap.values()).sort((a, b) => {
    const rankDiff = areaRank(a.area) - areaRank(b.area);
    if (rankDiff !== 0) return rankDiff;
    return a.firstLine - b.firstLine;
  });

  entries.sort((a, b) => {
    const r = areaRank(a.area) - areaRank(b.area);
    if (r !== 0) return r;
    return a.line - b.line;
  });

  const jsonOut = {
    generatedAt: new Date().toISOString(),
    themePath: THEME_PATH,
    historyPath: HISTORY_PATH,
    historyRuns: history.totalRuns || 0,
    areaSummary: areas,
    selectors: entries,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(jsonOut, null, 2));

  const md = [];
  md.push('# Theme Target Area Map');
  md.push('');
  md.push(`Generated: ${jsonOut.generatedAt}`);
  md.push(`History runs used: ${jsonOut.historyRuns}`);
  md.push(`Theme: \`${THEME_PATH}\``);
  md.push('');
  md.push('## Area Summary');
  md.push('');
  md.push('| Area | Selectors | Ever Used | High-Confidence Dead | Line Span |');
  md.push('|---|---:|---:|---:|---|');
  for (const a of areas) {
    md.push(`| ${a.area} | ${a.selectors} | ${a.usedEver} | ${a.highDead} | ${a.firstLine}-${a.lastLine} |`);
  }

  md.push('');
  md.push('## Customization Index By Target Area');
  md.push('');

  for (const area of areas) {
    md.push(`### ${area.area}`);
    md.push(`- Selector count: ${area.selectors}`);
    md.push(`- Ever used in reports: ${area.usedEver}`);
    md.push(`- High-confidence dead (seen>=10, never used): ${area.highDead}`);
    md.push(`- Theme line span: ${area.firstLine}-${area.lastLine}`);
    md.push('- Sample selectors:');
    for (const s of area.samples) md.push(`  - \`${s}\``);
    md.push('');
  }

  md.push('## Notes');
  md.push('- This map is for navigation and safe cleanup planning; it does not rewrite CSS automatically.');
  md.push('- Use high-confidence dead selectors as first candidates, especially hashed-class selectors.');
  md.push('- Re-run this script after major Discord updates or theme refactors.');

  fs.writeFileSync(OUT_MD, md.join('\n'));

  console.log(
    JSON.stringify(
      {
        outMarkdown: OUT_MD,
        outJson: OUT_JSON,
        areaCount: areas.length,
        selectorCount: entries.length,
        historyRuns: jsonOut.historyRuns,
      },
      null,
      2
    )
  );
}

main();
