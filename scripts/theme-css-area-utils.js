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

function classifySelector(selector) {
  for (const rule of AREA_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(selector)) return rule.area;
    }
  }
  return 'Misc / Needs Manual Tag';
}

function areaRank(area) {
  const idx = AREA_ORDER.indexOf(area);
  return idx === -1 ? 999 : idx;
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

module.exports = {
  AREA_ORDER,
  AREA_RULES,
  areaRank,
  classifySelector,
  countLine,
  parseRules,
};
