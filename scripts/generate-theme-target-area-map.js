#!/usr/bin/env node

const fs = require('fs');

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

function countLine(text, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function parseRules(text) {
  const rules = [];
  let i = 0;
  let start = 0;
  let inString = false;
  let quote = '';
  let inComment = false;
  const stack = [];

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === quote) inString = false;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      inComment = true;
      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      i += 1;
      continue;
    }

    if (ch === '{') {
      const raw = text.slice(start, i);
      const cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').trim();

      const type = cleaned.startsWith('@') ? 'at' : 'style';
      const atName = type === 'at' ? cleaned.slice(1).split(/\s|\{/)[0].toLowerCase() : null;
      stack.push({ type, atName, selectorText: cleaned, start, open: i });
      start = i + 1;
      i += 1;
      continue;
    }

    if (ch === '}') {
      const ctx = stack.pop();
      if (ctx && ctx.type === 'style' && ctx.selectorText) {
        const inKeyframes = stack.some((x) => x.type === 'at' && /keyframes/.test(x.atName || ''));
        if (!inKeyframes) {
          const selectors = ctx.selectorText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((s) => !s.startsWith('@'));
          if (selectors.length) {
            rules.push({
              selectors,
              start: ctx.start,
              end: i + 1,
              startLine: countLine(text, ctx.start),
            });
          }
        }
      }
      start = i + 1;
      i += 1;
      continue;
    }

    i += 1;
  }

  return rules;
}

const AREA_RULES = [
  {
    area: 'Theme Shell & Global',
    patterns: [/["']app-mount["']/i, /class\*=\"-app\"/i, /theme-dark|theme-light|theme-midnight/i, /^\*$/],
  },
  {
    area: 'Server Sidebar & Home',
    patterns: [/aria-label="Servers"/i, /tutorialContainer/i, /guilds/i, /circleIconButton/i, /App Icon/i],
  },
  {
    area: 'Channel Sidebar',
    patterns: [/#channels/i, /aria-label="Channels"/i, /thread/i, /iconVisibility/i, /containerDefault/i],
  },
  {
    area: 'DM List',
    patterns: [/Private channels/i, /private-channels-uid_/i, /Direct Messages/i, /interactiveSelected/i],
  },
  {
    area: 'Chat Messages',
    patterns: [/message/i, /role="article"/i, /messageContent/i, /markup/i],
  },
  {
    area: 'Message Composer',
    patterns: [/channelTextArea/i, /slateTextArea/i, /textArea/i, /sendButton/i, /attach/i],
  },
  {
    area: 'Embeds & Media',
    patterns: [/embed/i, /iframe/i, /ytimg/i, /imageContainer/i, /embedVideo/i],
  },
  {
    area: 'Members List',
    patterns: [/members/i, /member/i],
  },
  {
    area: 'User Area / Profile Strip',
    patterns: [/aria-label="User area"/i, /avatar/i, /accountButton/i, /panels/i],
  },
  {
    area: 'Menus, Tooltips & Popouts',
    patterns: [/menu/i, /tooltip/i, /popover/i, /contextMenu/i, /popout/i],
  },
  {
    area: 'Settings UI',
    patterns: [/standardSidebarView/i, /settingsPage/i, /userSettings/i, /tabbedSettings/i, /role="tablist"/i],
  },
  {
    area: 'BetterDiscord UI',
    patterns: [/\.bd-/i, /#bd-/i, /monaco-editor/i],
  },
  {
    area: 'Scrollbars',
    patterns: [/scrollbar/i],
  },
  {
    area: 'Animation & Effects',
    patterns: [/keyframes/i, /animation/i, /pulse/i],
  },
];

function classifySelector(selector) {
  for (const rule of AREA_RULES) {
    for (const p of rule.patterns) {
      if (p.test(selector)) return rule.area;
    }
  }
  return 'Misc / Needs Manual Tag';
}

function areaRank(area) {
  const order = [
    'Theme Shell & Global',
    'Server Sidebar & Home',
    'Channel Sidebar',
    'DM List',
    'Chat Messages',
    'Message Composer',
    'Embeds & Media',
    'Members List',
    'User Area / Profile Strip',
    'Menus, Tooltips & Popouts',
    'Settings UI',
    'BetterDiscord UI',
    'Scrollbars',
    'Animation & Effects',
    'Misc / Needs Manual Tag',
  ];
  const idx = order.indexOf(area);
  return idx === -1 ? 999 : idx;
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
