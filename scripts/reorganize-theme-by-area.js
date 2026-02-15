#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const THEME_PATH =
  '/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes/SoloLeveling-ClearVision.theme.css';
const OUT_DIR =
  '/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes/organized';
const OUT_THEME = path.join(OUT_DIR, 'SoloLeveling-ClearVision.organized.reference.theme.css');
const OUT_MANIFEST = path.join(OUT_DIR, 'organization-manifest.json');
const OUT_GUIDE =
  '/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/docs/THEME_REORGANIZATION_GUIDE.md';

const AREA_ORDER = [
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

function countLine(text, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function classify(selector) {
  for (const rule of AREA_RULES) {
    for (const p of rule.patterns) {
      if (p.test(selector)) return rule.area;
    }
  }
  return 'Misc / Needs Manual Tag';
}

function parseTopLevelBlocks(text) {
  const blocks = [];
  let i = 0;
  let inString = false;
  let quote = '';
  let inComment = false;
  let depth = 0;
  let blockStart = -1;
  let headerStart = 0;

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
      if (depth === 0) {
        blockStart = headerStart;
      }
      depth += 1;
      i += 1;
      continue;
    }

    if (ch === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && blockStart >= 0) {
        const blockEnd = i + 1;
        const blockText = text.slice(blockStart, blockEnd);
        const preamble = text.slice(headerStart, blockStart);
        const selectorHeader = text.slice(blockStart, text.indexOf('{', blockStart));
        const cleanHeader = selectorHeader.replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
        const selectorForClassify = cleanHeader.split(',')[0]?.trim() || '';

        blocks.push({
          start: blockStart,
          end: blockEnd,
          startLine: countLine(text, blockStart),
          selectorHeader: cleanHeader,
          classifySeed: selectorForClassify,
          text: blockText,
          preamble,
        });

        headerStart = blockEnd;
        blockStart = -1;
      }
      i += 1;
      continue;
    }

    i += 1;
  }

  return blocks;
}

function main() {
  if (!fs.existsSync(THEME_PATH)) throw new Error(`Missing theme file: ${THEME_PATH}`);

  const theme = fs.readFileSync(THEME_PATH, 'utf8');
  const blocks = parseTopLevelBlocks(theme);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const grouped = new Map();
  for (const a of AREA_ORDER) grouped.set(a, []);

  for (const b of blocks) {
    const area = classify(b.classifySeed || b.selectorHeader || '');
    if (!grouped.has(area)) grouped.set(area, []);
    grouped.get(area).push({ ...b, area });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceTheme: THEME_PATH,
    totalBlocks: blocks.length,
    areas: AREA_ORDER.map((a) => ({
      area: a,
      blockCount: (grouped.get(a) || []).length,
      firstLine: (grouped.get(a) || [])[0]?.startLine || null,
      lastLine: (grouped.get(a) || []).slice(-1)[0]?.startLine || null,
    })),
    blocks: AREA_ORDER.flatMap((a) =>
      (grouped.get(a) || []).map((b, idx) => ({
        area: a,
        areaIndex: idx + 1,
        sourceStartLine: b.startLine,
        selectorHeader: b.selectorHeader,
      }))
    ),
  };

  const out = [];
  out.push('/* ============================================================');
  out.push(' * SoloLeveling Theme Organized Reference');
  out.push(' * Generated from source theme with original rule text preserved.');
  out.push(' * This is a reference/work file for editing by target area.');
  out.push(' * Source of truth remains SoloLeveling-ClearVision.theme.css');
  out.push(' * ============================================================ */');
  out.push('');

  for (const area of AREA_ORDER) {
    const list = grouped.get(area) || [];
    if (!list.length) continue;

    out.push('/* ============================================================ */');
    out.push(`/* AREA: ${area} (blocks: ${list.length}) */`);
    out.push('/* ============================================================ */');
    out.push('');

    for (const b of list) {
      out.push(`/* SOURCE_LINE: ${b.startLine} */`);
      out.push(b.text.trim());
      out.push('');
    }
  }

  fs.writeFileSync(OUT_THEME, out.join('\n'));
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));

  const guide = [];
  guide.push('# Theme Reorganization Guide');
  guide.push('');
  guide.push(`Generated: ${manifest.generatedAt}`);
  guide.push(`Source theme: \`${THEME_PATH}\``);
  guide.push(`Organized reference: \`${OUT_THEME}\``);
  guide.push(`Manifest: \`${OUT_MANIFEST}\``);
  guide.push('');
  guide.push('## Why this is safe');
  guide.push('- No selectors were invented.');
  guide.push('- All blocks are copied from the source theme as-is.');
  guide.push('- Each copied block includes its original source line.');
  guide.push('- Active runtime theme file was not replaced automatically.');
  guide.push('');
  guide.push('## Area Block Counts');
  guide.push('');
  guide.push('| Area | Blocks | First Source Line | Last Source Line |');
  guide.push('|---|---:|---:|---:|');
  for (const a of manifest.areas) {
    guide.push(`| ${a.area} | ${a.blockCount} | ${a.firstLine ?? '-'} | ${a.lastLine ?? '-'} |`);
  }
  guide.push('');
  guide.push('## Next Step');
  guide.push('- If desired, we can migrate runtime to this organized file after targeted visual testing.');

  fs.writeFileSync(OUT_GUIDE, guide.join('\n'));

  console.log(
    JSON.stringify(
      {
        source: THEME_PATH,
        organizedTheme: OUT_THEME,
        manifest: OUT_MANIFEST,
        guide: OUT_GUIDE,
        totalBlocks: blocks.length,
      },
      null,
      2
    )
  );
}

main();
