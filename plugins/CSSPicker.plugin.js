/**
 * @name CSS Picker
 * @author BlueFlashX1
 * @description Hover to inspect, click to capture & auto-update theme. Integrates with Theme Auto Maintainer.
 * @version 1.5.0
 * @authorId
 */
/* global CSS, Element */

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

module.exports = (() => {
  const config = {
    info: {
      name: 'CSS Picker',
      authors: [
        {
          name: 'BlueFlashX1',
          discord_id: '',
        },
      ],
      version: '1.5.0',
      description:
        'Hover to inspect, click to capture. Integrates with Theme Auto Maintainer for class verification.',
    },
  };

  const PLUGIN_NAME = config.info.name;

  const DEFAULT_SETTINGS = {
    toastTimeoutMs: 5500,
    toastIncludeComputed: true,
    toastIncludeRules: true,
    toastRuleCount: 3,
    toastMaxChars: 260,
    hotkeyEnabled: true,
    hotkey: 'Ctrl+Shift+P',
    autoUpdateTheme: true,
    verifyWithDOM: true,
    verifyWithGitHub: true,
    themePath: 'SoloLeveling-ClearVision.theme.css',
  };

  // Load shared utilities BEFORE referencing them (avoids TDZ ReferenceError)
  let _PluginUtils;
  try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

  // Hotkey + editable-target utilities — shared module with inline fallback
  const isEditableTarget = _PluginUtils?.isEditableTarget || ((target) => {
    if (!target) return false;
    const tag = target.tagName?.toLowerCase?.() || '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!target.isContentEditable;
  });

  const normalizeHotkey = _PluginUtils?.normalizeHotkey || ((hotkey) =>
    String(hotkey || '').trim().toLowerCase().replace(/\s+/g, ''));

  const parseHotkey = _PluginUtils?.parseHotkey || ((hotkey) => {
    const normalized = normalizeHotkey(hotkey);
    const parts = normalized.split('+').filter(Boolean);
    const mods = new Set(
      parts.filter((p) => ['ctrl', 'shift', 'alt', 'meta', 'cmd', 'command'].includes(p))
    );
    const key = parts.find((p) => !mods.has(p)) || '';
    return {
      key,
      hasCtrl: mods.has('ctrl'),
      hasShift: mods.has('shift'),
      hasAlt: mods.has('alt'),
      hasMeta: mods.has('meta') || mods.has('cmd') || mods.has('command'),
    };
  });

  const matchesHotkey = _PluginUtils?.matchesHotkey || ((event, hotkey) => {
    const spec = parseHotkey(hotkey);
    if (!spec.key) return false;
    const key = String(event.key || '').toLowerCase();
    return (
      key === spec.key &&
      !!event.ctrlKey === spec.hasCtrl &&
      !!event.shiftKey === spec.hasShift &&
      !!event.altKey === spec.hasAlt &&
      !!event.metaKey === spec.hasMeta
    );
  });

  const loadSettings = () => {
    try {
      return { ...DEFAULT_SETTINGS, ...(BdApi.Data.load(PLUGIN_NAME, 'settings') || {}) };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  };

  const saveSettings = (settings) => {
    try {
      BdApi.Data.save(PLUGIN_NAME, 'settings', settings);
    } catch (e) {
      // ignore
    }
  };


  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  };

  const getTimestampForFilename = () => new Date().toISOString().replace(/[:.]/g, '-');

  const isTrulyTransparent = (value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    return (
      !normalized ||
      normalized === 'none' ||
      normalized === 'transparent' ||
      normalized === 'rgba(0, 0, 0, 0)' ||
      normalized === 'rgba(0,0,0,0)'
    );
  };

  const truncateMiddle = (value, max = 90) => {
    const str = String(value ?? '');
    if (str.length <= max) return str;
    const left = Math.max(10, Math.floor(max * 0.6));
    const right = Math.max(8, max - left - 3);
    return `${str.slice(0, left)}...${str.slice(-right)}`;
  };

  const formatCssValueCompact = (value) =>
    truncateMiddle(
      String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      96
    );

  const shortenStylesheetLabel = (label) => {
    const text = String(label ?? '');
    const asUrl = /^https?:\/\//i.test(text);
    if (!asUrl) return truncateMiddle(text, 52);
    try {
      const { pathname, host } = new URL(text);
      const parts = pathname.split('/').filter(Boolean);
      const tail = parts.slice(-2).join('/');
      return truncateMiddle(`${host}/${tail}`, 52);
    } catch (e) {
      return truncateMiddle(text, 52);
    }
  };

  const buildComputedVisualSummary = (computedStyle) => {
    if (!computedStyle) return [];

    const rows = [
      {
        value: computedStyle.backgroundColor,
        include: (value) => !isTrulyTransparent(value),
        render: (value) => `bg ${formatCssValueCompact(value)}`,
      },
      {
        value: computedStyle.backgroundImage,
        include: (value) => value && value !== 'none' && !isTrulyTransparent(value),
        render: (value) => `bg-img ${truncateMiddle(value, 78)}`,
      },
      {
        value: computedStyle.boxShadow,
        include: (value) => value && value !== 'none',
        render: (value) => `shadow ${truncateMiddle(value, 78)}`,
      },
      {
        value: computedStyle.border,
        include: (value) => value && value !== 'none',
        render: (value) => `border ${truncateMiddle(value, 62)}`,
      },
      {
        value: computedStyle.outline,
        include: (value) => value && value !== 'none',
        render: (value) => `outline ${truncateMiddle(value, 62)}`,
      },
      {
        value: computedStyle.filter,
        include: (value) => value && value !== 'none',
        render: (value) => `filter ${truncateMiddle(value, 62)}`,
      },
      {
        value: computedStyle.backdropFilter,
        include: (value) => value && value !== 'none',
        render: (value) => `backdrop ${truncateMiddle(value, 62)}`,
      },
    ];

    const parts = [];
    for (const row of rows) {
      if (!row.include(row.value)) continue;
      parts.push(row.render(row.value));
      if (parts.length >= 4) break;
    }
    return parts;
  };

  // Works with both old { properties, stylesheet } and new compact { props, source } format
  const buildRuleHints = ({ appliedRules, matchedCssRules, maxRuleCount }) => {
    const rules = Array.isArray(appliedRules) ? appliedRules : Array.isArray(matchedCssRules) ? matchedCssRules : [];
    const keys = [
      'background-image', 'background', 'background-color',
      'box-shadow', 'border', 'outline',
      'filter', 'backdrop-filter', 'transform',
    ];

    const pickFirstRuleForKey = (key) =>
      rules.find((r) => {
        if (r?.props) return !!r.props[key]; // compact format
        if (r?.properties) return !!(r.properties[key]?.value); // legacy format
        return false;
      });

    const picks = keys
      .map((k) => [k, pickFirstRuleForKey(k)])
      .filter(([, r]) => r)
      .slice(0, Math.max(0, maxRuleCount || 0));

    const unique = new Set();
    return picks
      .map(([key, r]) => {
        const isCompact = !!r.props;
        const value = isCompact ? r.props[key] : r.properties[key]?.value;
        const hasBang = isCompact ? (value || '').includes('!important') : r.properties[key]?.priority === 'important';
        const priority = hasBang ? ' !important' : '';
        const pseudo = r.pseudo || '';
        const sel = isCompact ? r.selector : `${r.selector || ''}${pseudo}`;
        const selector = truncateMiddle(sel, 58);
        const sheet = shortenStylesheetLabel(isCompact ? r.source : r.stylesheet);
        const originTag = isCompact && r.origin?.type ? ` (${r.origin.type})` : '';
        const line = `${key}${priority}: ${selector} @ ${sheet}${originTag}`;

        const dedupeKey = `${key}|${sheet}|${sel}`;
        if (unique.has(dedupeKey)) return null;
        unique.add(dedupeKey);
        return line;
      })
      .filter(Boolean)
      .slice(0, Math.max(0, maxRuleCount || 0));
  };

  const buildCaptureToastMessage = ({ elementDetails, saveResult, clipboardResult, settings }) => {
    const elementSummary = elementDetails?.summary || 'unknown';
    const bestSelector = elementDetails?.selector || elementDetails?.bestSelector || null;
    const selectorLabel = bestSelector ? truncateMiddle(bestSelector, 70) : elementSummary;

    const base = `Captured: ${selectorLabel}`;
    const computedParts = settings.toastIncludeComputed
      ? buildComputedVisualSummary(elementDetails?.activeStyles)
      : [];
    const ruleHints = settings.toastIncludeRules
      ? buildRuleHints({
          appliedRules: elementDetails?.appliedRules,
          matchedCssRules: elementDetails?.matchedCssRules, // legacy fallback
          maxRuleCount: settings.toastRuleCount,
        })
      : [];

    const fileMsg = saveResult?.ok ? `saved ${saveResult.fileName}` : 'save failed';
    const clipMsg = clipboardResult?.ok ? 'clipboard ok' : 'clipboard failed';

    const lines = [
      `CSS Picker v${config.info.version} • ${base}`,
      computedParts.length ? computedParts.join(' • ') : null,
      ruleHints.length ? `Rules: ${ruleHints.join(' | ')}` : null,
      `${fileMsg} • ${clipMsg}`,
    ].filter(Boolean);

    const message = lines.join('\n');
    return truncateMiddle(message, settings.toastMaxChars || DEFAULT_SETTINGS.toastMaxChars);
  };

  const getElementSummary = (el) => {
    if (!el) return 'unknown';
    const tag = el.tagName?.toLowerCase?.() || 'unknown';
    const id = el.id ? `#${el.id}` : '';
    const className =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/)[0]}`
        : '';
    return `${tag}${id}${className}`;
  };

  const getSemanticClassSelectors = (el) => {
    if (!el?.classList) return [];

    const classes = Array.from(el.classList);
    const semanticPrefixes = classes
      .map((c) => {
        // Discord pattern: name_hash or name__hash
        const match = c.match(/^([a-zA-Z]+)[_]{1,2}[a-zA-Z0-9]+$/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    const uniquePrefixes = Array.from(new Set(semanticPrefixes)).slice(0, 3);
    return uniquePrefixes.map((prefix) => `[class^="${prefix}_"]`);
  };

  const getExactClassSelectors = (el) => {
    if (!el?.classList) return [];
    return Array.from(el.classList).map((c) => `.${CSS.escape(c)}`);
  };

  const buildNthOfTypePath = (el, maxDepth = 6) => {
    const parts = [];
    let current = el;

    for (let depth = 0; depth < maxDepth && current && current.nodeType === 1; depth++) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }

      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName && c.tagName.toLowerCase() === tag
      );
      const index = siblings.indexOf(current) + 1;
      const segment = siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag;
      parts.unshift(segment);

      current = parent;
      if (tag === 'html' || tag === 'body') break;
    }

    return parts.join(' > ');
  };

  const getAttributeSelectorCandidates = (el) => {
    if (!el || !(el instanceof Element)) return [];

    const ariaLabel = el.getAttribute('aria-label');
    const role = el.getAttribute('role');
    const dataTestId = el.getAttribute('data-testid');

    const candidates = [];

    // Prefer stable attributes (may be localized for aria-label, but still useful).
    ariaLabel &&
      ariaLabel.length <= 80 &&
      candidates.push(`${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`);
    role && candidates.push(`${el.tagName.toLowerCase()}[role="${role}"]`);
    dataTestId && candidates.push(`${el.tagName.toLowerCase()}[data-testid="${dataTestId}"]`);

    return candidates;
  };

  // Favor stable selectors over hashed class names
  const getStableSelectorSet = (el) => {
    if (!el || !(el instanceof Element)) return [];
    const tag = el.tagName.toLowerCase();
    const selectors = [];

    // aria-label and role
    const ariaLabel = el.getAttribute('aria-label');
    ariaLabel && ariaLabel.length <= 80 && selectors.push(`${tag}[aria-label="${ariaLabel}"]`);
    const role = el.getAttribute('role');
    role && selectors.push(`${tag}[role="${role}"]`);

    // data-testid
    const dataTestId = el.getAttribute('data-testid');
    dataTestId && selectors.push(`${tag}[data-testid="${dataTestId}"]`);

    // id
    if (el.id) selectors.push(`#${CSS.escape(el.id)}`);

    // semantic class prefixes
    getSemanticClassSelectors(el).forEach((s) => selectors.push(`${tag}${s}`));

    // root fallbacks if applicable
    if (tag === 'html') {
      selectors.push(':root', 'html');
    }

    return Array.from(new Set(selectors)).filter(Boolean).slice(0, 8);
  };

  const getRootContext = () => {
    const root = document.documentElement;
    const body = document.body;
    const getAttrs = (node) =>
      Array.from(node?.attributes || [])
        .map((a) => ({ name: a.name, value: a.value }))
        .slice(0, 30);
    const getClasses = (node) => Array.from(node?.classList || []);
    return {
      root: {
        summary: root ? getElementSummary(root) : null,
        classList: getClasses(root),
        attributes: getAttrs(root),
      },
      body: {
        summary: body ? getElementSummary(body) : null,
        classList: getClasses(body),
        attributes: getAttrs(body),
      },
    };
  };

  const getSelectorCandidates = (el) => {
    if (!el || !(el instanceof Element)) return [];

    const candidates = [];

    // #id if unique
    if (el.id) {
      const idSel = `#${CSS.escape(el.id)}`;
      candidates.push(idSel);
    }

    getAttributeSelectorCandidates(el).forEach((s) => candidates.push(s));

    // Semantic discord classes via [class^="name_"]
    getSemanticClassSelectors(el).forEach((s) =>
      candidates.push(`${el.tagName.toLowerCase()}${s}`)
    );

    // Full path fallback (not stable but always works in the current DOM)
    candidates.push(buildNthOfTypePath(el));

    // Dedup + drop empties
    return Array.from(new Set(candidates)).filter(Boolean);
  };

  const getElementNodeInfo = (el) => {
    if (!el || !(el instanceof Element)) return null;

    const tagName = el.tagName.toLowerCase();
    const id = el.id || null;
    const classList = Array.from(el.classList || []);
    const role = el.getAttribute('role') || null;
    const ariaLabel = el.getAttribute('aria-label') || null;

    return {
      summary: getElementSummary(el),
      tagName,
      id,
      classList,
      role,
      ariaLabel,
    };
  };

  // ── Element state flags: explicit metadata so AI never misreads hidden/clipped/inert state ──
  const addVisibilityFlags = (flags, cs) => {
    if (cs.display === 'none') {
      flags.hidden = 'display:none';
      return;
    }
    if (cs.visibility === 'hidden') {
      flags.hidden = 'visibility:hidden';
      return;
    }
    if (parseFloat(cs.opacity) === 0) flags.hidden = 'opacity:0';
  };

  const addLayoutFlags = (flags, cs) => {
    if (cs.pointerEvents === 'none') flags.inert = 'pointer-events:none';
    if (cs.overflow === 'hidden' || cs.overflow === 'clip') flags.clipped = cs.overflow;
    if (cs.position === 'fixed' || cs.position === 'sticky') flags.positioning = cs.position;
    const width = parseFloat(cs.width);
    const height = parseFloat(cs.height);
    if (width === 0 || height === 0) {
      flags.collapsed = `${Math.round(width)}x${Math.round(height)}`;
    }
    if (cs.clipPath && cs.clipPath !== 'none') flags.clipPath = cs.clipPath;
  };

  const addInteractionFlags = (flags, el) => {
    try { if (el.matches(':hover')) flags.hover = true; } catch {}
    try { if (el.matches(':focus')) flags.focus = true; } catch {}
    try { if (el.matches(':focus-within')) flags.focusWithin = true; } catch {}
  };

  const addStateClassFlag = (flags, el) => {
    const classes = Array.from(el.classList || []);
    const stateClass = classes.find((name) => /selected|active|focused|hovered|muted|unread/i.test(name));
    if (stateClass) flags.stateClass = stateClass;
  };

  const detectElementFlags = (el) => {
    if (!el || !(el instanceof Element)) return {};
    const computed = window.getComputedStyle(el);
    const flags = {};
    addVisibilityFlags(flags, computed);
    addLayoutFlags(flags, computed);
    addInteractionFlags(flags, el);
    addStateClassFlag(flags, el);
    return Object.keys(flags).length ? flags : null;
  };

  // Check if element has any meaningful identity (classes, ID, aria-label, role, data-testid)
  const hasElementIdentity = (el) => {
    if (!el || !(el instanceof Element)) return false;
    if (el.id) return true;
    if (el.classList && el.classList.length > 0) return true;
    if (el.getAttribute('aria-label')) return true;
    if (el.getAttribute('role')) return true;
    if (el.getAttribute('data-testid')) return true;
    return false;
  };

  // When elementFromPoint lands on a bare wrapper (no classes, no ID, etc.),
  // climb up to the nearest meaningful parent so the pick is actionable.
  const promoteToMeaningfulAncestor = (el, maxClimb = 3) => {
    if (!el || hasElementIdentity(el)) return { el, promoted: false };
    let current = el;
    for (let i = 0; i < maxClimb; i++) {
      const parent = current.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      if (hasElementIdentity(parent)) return { el: parent, promoted: true, originalTag: el.tagName.toLowerCase() };
      current = parent;
    }
    return { el, promoted: false };
  };

  // Full computed style keys for the target element
  const COMPUTED_KEYS_FULL = [
    'display', 'position', 'zIndex', 'opacity',
    'visibility', 'overflow', 'pointerEvents',
    'backgroundColor', 'backgroundImage', 'background',
    'border', 'borderColor', 'borderWidth', 'borderRadius',
    'boxShadow', 'outline', 'filter', 'backdropFilter', 'transform',
    'color', 'fontFamily', 'fontSize', 'lineHeight',
    'padding', 'margin',
    'width', 'height', 'maxWidth', 'maxHeight',
  ];

  // Compact computed style keys for children (visual-only, no layout)
  const COMPUTED_KEYS_COMPACT = [
    'display', 'opacity', 'visibility',
    'background', 'border', 'borderRadius', 'boxShadow',
    'color', 'fontSize',
  ];

  const _pickStyles = (el, keys) => {
    if (!el || !(el instanceof Element)) return null;
    const style = window.getComputedStyle(el);
    return keys.reduce((acc, key) => {
      const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      acc[key] = style.getPropertyValue(cssKey) || style[key] || null;
      return acc;
    }, {});
  };

  const pickComputedStyles = (el) => _pickStyles(el, COMPUTED_KEYS_FULL);
  const pickComputedStylesCompact = (el) => _pickStyles(el, COMPUTED_KEYS_COMPACT);

  // Known browser defaults for computed style keys.
  // Array = any match counts as default; null = always treat as active (inherited/element-dependent).
  const COMPUTED_DEFAULTS = {
    display: null,        // element-dependent (block for div, inline for span, table-cell for td)
    position: 'static',
    zIndex: 'auto',
    opacity: '1',
    visibility: 'visible',
    overflow: 'visible',
    pointerEvents: 'auto',
    backgroundColor: ['rgba(0, 0, 0, 0)', 'transparent'],
    backgroundImage: 'none',
    background: ['rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box', 'rgba(0, 0, 0, 0)'],
    border: ['0px none rgb(0, 0, 0)', '0px none rgba(0, 0, 0, 0)', ''],
    borderColor: ['rgb(0, 0, 0)', 'rgba(0, 0, 0, 0)'],
    borderWidth: '0px',
    borderRadius: '0px',
    boxShadow: 'none',
    outline: ['rgb(0, 0, 0) none 0px', 'rgba(0, 0, 0, 0) none 0px', '0px none invert'],
    filter: 'none',
    backdropFilter: 'none',
    transform: 'none',
    color: null,        // inherited — always active
    fontFamily: null,    // inherited — always active
    fontSize: null,      // inherited — always active
    lineHeight: 'normal',
    padding: '0px',
    margin: '0px',
    width: null,         // element-dependent — always active
    height: null,        // element-dependent — always active
    maxWidth: 'none',
    maxHeight: 'none',
  };

  // Split computed styles into active (non-default) values and a collapsed list of default key names.
  const splitComputedStyles = (el) => {
    const all = pickComputedStyles(el);
    if (!all) return { activeStyles: {}, defaultStyles: [] };
    const activeStyles = {};
    const defaultStyles = [];
    for (const [key, val] of Object.entries(all)) {
      if (!val) { defaultStyles.push(key); continue; }
      const def = COMPUTED_DEFAULTS[key];
      if (def === null) { activeStyles[key] = val; continue; }
      const isDefault = Array.isArray(def)
        ? def.some((d) => val === d)
        : val === def;
      isDefault ? defaultStyles.push(key) : (activeStyles[key] = val);
    }
    return { activeStyles, defaultStyles };
  };

  // Extract inline style="" attribute properties separately from computed styles.
  const extractInlineStyles = (el) => {
    if (!el?.style?.length) return null;
    const inline = {};
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style[i];
      const val = el.style.getPropertyValue(prop);
      const priority = el.style.getPropertyPriority(prop);
      if (val) inline[prop] = priority ? `${val} !important` : val;
    }
    return Object.keys(inline).length ? inline : null;
  };

  const getChildElements = (el, max = 10) => {
    if (!el || !(el instanceof Element) || !el.children) return [];
    return Array.from(el.children).slice(0, max);
  };

  // Compact children: summary + ariaLabel + flags + key visual styles only
  const getChildrenCompact = (el, max = 8) => {
    const children = getChildElements(el, max);
    return children.map((child, index) => {
      const entry = {
        index,
        summary: getElementSummary(child),
      };
      const ariaLabel = child.getAttribute('aria-label');
      if (ariaLabel) entry.ariaLabel = ariaLabel;
      const role = child.getAttribute('role');
      if (role) entry.role = role;
      const flags = detectElementFlags(child);
      if (flags) entry.flags = flags;
      // Only include compact style if child has visible styling worth knowing
      const cs = window.getComputedStyle(child);
      const hasBg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      const hasBorder = cs.borderWidth !== '0px';
      const hasShadow = cs.boxShadow !== 'none';
      if (hasBg || hasBorder || hasShadow) {
        entry.style = pickComputedStylesCompact(child);
      }
      return entry;
    });
  };

  // Compact ancestry: max 4 levels, summary + ariaLabel + stableSelector only
  const getAncestryCompact = (el, maxDepth = 4) => {
    const chain = [];
    let current = el;
    for (let depth = 0; depth < maxDepth && current && current.nodeType === 1; depth++) {
      const entry = { depth, summary: getElementSummary(current) };
      const ariaLabel = current.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.length <= 80) entry.ariaLabel = ariaLabel;
      const stable = getStableSelectorSet(current);
      if (stable.length) entry.selector = stable[0];
      chain.push(entry);
      current = current.parentElement;
      if (!current || ['HTML', 'BODY'].includes(current.tagName)) break;
    }
    return chain;
  };

  const getStylesheetLabel = (sheet, index) => {
    const href = sheet?.href || null;
    if (href) return href;
    const owner = sheet?.ownerNode;
    const ownerTag = owner?.tagName?.toLowerCase?.() || 'style';
    const ownerId = owner?.id ? `#${owner.id}` : '';
    const ownerClass =
      typeof owner?.className === 'string' && owner.className.trim()
        ? `.${owner.className.trim().split(/\s+/)[0]}`
        : '';
    return `inline:${index}:${ownerTag}${ownerId}${ownerClass}`;
  };

  // Clean stylesheet label for AI readability:
  //   "inline:51:style#SoloLeveling-ClearVision-theme-container" → "SoloLeveling-ClearVision-theme"
  //   "https://discord.com/assets/web.26898.css" → "discord-css"
  const simplifySheetLabel = (label) => {
    if (!label) return 'unknown';
    // Discord CDN CSS
    if (/discord\.com\/assets\//.test(label)) return 'discord-css';
    // Inline style with id — extract meaningful name
    const inlineMatch = label.match(/^inline:\d+:style#(.+)/);
    if (inlineMatch) {
      return inlineMatch[1]
        .replace(/-container$/, '')
        .replace(/-styles?$/, '');
    }
    // Inline without id
    if (/^inline:\d+:/.test(label)) return label;
    // External URL — use hostname
    try { return new URL(label).hostname; } catch (_) {}
    return label;
  };

  // Origin types:
  //   discord  — Discord CDN stylesheets (discord.com/assets/*.css)
  //   theme    — BD theme container (id ends with -theme-container)
  //   plugin   — BdApi.DOM.addStyle() <style> elements (has ID, not theme)
  //   customcss — BD Custom CSS editor (id === 'customcss')
  //   external — External CDN (fonts.googleapis.com, etc.) — may be theme OR plugin
  //   unknown  — Discord internal <style> without ID, or browser extension
  const classifyRuleOrigin = (sheetLabel, sheetHref, ownerNode) => {
    // Discord core — loaded from CDN
    if (sheetHref && sheetHref.includes('discord.com/assets/'))
      return { type: 'discord', name: 'Discord' };

    const id = ownerNode?.id || '';

    // BD Custom CSS editor
    if (id === 'customcss')
      return { type: 'customcss', name: 'Custom CSS' };

    // Theme — BD theme container
    if (id.endsWith('-theme-container'))
      return { type: 'theme', name: sheetLabel };

    // Known theme CDN @imports (NOT fonts — fonts can come from plugins too)
    if (sheetHref && (
      sheetHref.includes('clearvision.github.io') ||
      sheetHref.includes('discordstyles.github.io')
    )) return { type: 'theme', name: sheetLabel };

    // External fonts (Google Fonts, etc.) — could be theme or plugin, classify separately
    if (sheetHref && sheetHref.includes('fonts.googleapis.com'))
      return { type: 'external', name: sheetLabel };

    // Plugin — BD style elements from BdApi.DOM.addStyle (has ID, not theme/customcss)
    if (ownerNode?.tagName === 'STYLE' && id)
      return { type: 'plugin', name: sheetLabel };

    // Unknown — probably Discord internal or browser extension
    return { type: 'unknown', name: sheetLabel };
  };

  // Scope analysis: count how many elements a rule selector matches + sample others.
  // querySelectorAll returns a static NodeList — DOM walk happens at call time.
  // For Discord's ~10K DOM nodes, this is <1ms per call in native C++.
  // We cap at 30 rules (maxMatches default), so total overhead is <30ms.
  const getRuleScopeLabel = (totalMatches) => {
    if (totalMatches <= 1) return 'unique';
    if (totalMatches <= 5) return 'targeted';
    if (totalMatches <= 50) return 'moderate';
    return 'global';
  };

  const sampleScopeMatches = (nodes, pickedEl, maxSamples = 5) => {
    const samples = [];
    for (const node of nodes) {
      if (node === pickedEl) continue;
      const tag = node.tagName.toLowerCase();
      const cls = node.classList[0] || '';
      const aria = node.getAttribute('aria-label');
      samples.push(aria ? `${tag}.${cls}[${aria}]` : cls ? `${tag}.${cls}` : tag);
      if (samples.length >= maxSamples) break;
    }
    return samples;
  };

  const analyzeRuleScope = (selectorText, pickedEl) => {
    try {
      const all = document.querySelectorAll(selectorText);
      const total = all.length;
      const result = { scope: getRuleScopeLabel(total), totalMatches: total };
      if (total > 1) result.otherElements = sampleScopeMatches(all, pickedEl);
      return result;
    } catch {
      return { scope: 'unknown', totalMatches: -1 };
    }
  };

  // Returns true for global CSS reset rules (massive comma-separated tag selectors)
  const isResetRule = (selectorText) => {
    if (!selectorText) return false;
    const commas = selectorText.split(',').length;
    return commas > 8; // "a, abbr, acronym, address, ..." style resets
  };

  const splitPseudo = (selectorText) => {
    if (!selectorText || typeof selectorText !== 'string') return { selector: null, pseudo: null };
    const pseudoMatch = selectorText.match(/(.*?)(::before|::after)\s*$/);
    if (!pseudoMatch) return { selector: selectorText, pseudo: null };
    return { selector: pseudoMatch[1].trim(), pseudo: pseudoMatch[2] };
  };

  const iterCssRules = (rules, onRule, state) => {
    if (!rules) return;
    for (let i = 0; i < rules.length; i++) {
      if (state.shouldStop) return;
      const rule = rules[i];

      // CSSStyleRule
      if (rule?.type === 1 && rule.selectorText) {
        onRule(rule, i);
        continue;
      }

      // Any grouping rule (@media, @supports, @container, @layer, etc.)
      const hasNested = rule?.cssRules && rule.cssRules.length;
      hasNested && iterCssRules(rule.cssRules, onRule, state);
    }
  };

  // PERF: Cache flattened CSS rules to avoid re-scanning all stylesheets on every hover.
  // Cache invalidates every 10 seconds (stylesheets rarely change during a session).
  let _cachedFlatRules = null;
  let _cachedFlatRulesTime = 0;
  let _lastCorsBlockedCount = 0;
  const RULE_CACHE_TTL_MS = 10000;

  const _getFlatRules = () => {
    const now = Date.now();
    if (_cachedFlatRules && now - _cachedFlatRulesTime < RULE_CACHE_TTL_MS) return _cachedFlatRules;

    const flat = [];
    let corsCount = 0;
    const sheets = Array.from(document.styleSheets || []);
    sheets.forEach((sheet, sheetIndex) => {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { corsCount++; return; } // Skip CORS sheets
      const sheetLabel = getStylesheetLabel(sheet, sheetIndex);
      iterCssRules(rules, (rule, ruleIndex) => {
        if (rule.selectorText) {
          flat.push({ rule, ruleIndex, sheetLabel, sheetIndex,
                      sheetHref: sheet.href || null, ownerNode: sheet.ownerNode || null });
        }
      }, { shouldStop: false });
    });

    _lastCorsBlockedCount = corsCount;
    _cachedFlatRules = flat;
    _cachedFlatRulesTime = now;
    return flat;
  };

  const ruleTouchesAnyKey = (rule, keys) => {
    for (const key of keys) {
      try {
        if (rule.style?.getPropertyValue?.(key)) return true;
      } catch (_) {}
    }
    return false;
  };

  const selectorMatchesElement = (el, selector) => {
    try {
      return !!selector && el.matches(selector);
    } catch (_) {
      return false;
    }
  };

  const collectRuleProperties = (rule, keys) => {
    const props = {};
    for (const key of keys) {
      const value = rule.style.getPropertyValue(key);
      if (!value) continue;
      props[key] = {
        value,
        priority: rule.style.getPropertyPriority(key) || null,
      };
    }
    return props;
  };

  const findMatchingCssRules = (el, keys, maxMatches = 30) => {
    if (!el || !(el instanceof Element)) return [];
    const matches = [];
    const flatRules = _getFlatRules();

    for (const entry of flatRules) {
      if (matches.length >= maxMatches) break;
      const { rule, ruleIndex, sheetLabel, sheetIndex, sheetHref, ownerNode } = entry;
      const selectorText = rule.selectorText;
      const { selector, pseudo } = splitPseudo(selectorText);
      if (!selector) continue;
      if (!ruleTouchesAnyKey(rule, keys)) continue;
      if (!selectorMatchesElement(el, selector)) continue;

      matches.push({
        stylesheet: sheetLabel,
        sheetIndex,
        ruleIndex,
        selectorText,
        selector,
        pseudo,
        properties: collectRuleProperties(rule, keys),
        sheetHref,
        ownerNode,
      });
    }

    return matches;
  };

  // ── Compact CSS rules: filter resets, simplify labels, flatten props ──
  const getCompactCssRules = (el, keys, maxMatches = 30) => {
    const raw = findMatchingCssRules(el, keys, maxMatches);
    return raw
      .filter((r) => !isResetRule(r.selectorText))
      .map((r) => {
        const entry = {
          source: simplifySheetLabel(r.stylesheet),
          origin: classifyRuleOrigin(simplifySheetLabel(r.stylesheet), r.sheetHref, r.ownerNode),
          scope: analyzeRuleScope(r.selector || r.selectorText, el),
          selector: r.selectorText,
        };
        // Flatten properties: { 'background': { value, priority } } → { 'background': 'value !important' }
        const props = {};
        for (const [key, val] of Object.entries(r.properties)) {
          props[key] = val.priority ? `${val.value} !${val.priority}` : val.value;
        }
        entry.props = props;
        if (r.pseudo) entry.pseudo = r.pseudo;
        return entry;
      });
  };

  const MATCH_KEYS = [
    'background', 'background-color', 'background-image',
    'border', 'border-color', 'border-width', 'border-radius',
    'box-shadow', 'outline', 'filter', 'backdrop-filter', 'transform',
    'display', 'visibility', 'opacity', 'pointer-events', 'overflow',
    'color', 'font-size', 'font-family',
    'mask-image', '-webkit-mask-image',
  ];

  const getBestSelector = (el, stableSelectors) =>
    stableSelectors[0]
    || getExactClassSelectors(el)[0]
    || (el.id ? `#${CSS.escape(el.id)}` : null);

  const appendElementSemanticFields = (result, el) => {
    if (el.id) result.id = el.id;
    const ariaLabel = el.getAttribute('aria-label');
    const role = el.getAttribute('role');
    if (ariaLabel) result.ariaLabel = ariaLabel;
    if (role) result.role = role;
  };

  const appendElementFlagsAndContext = (result, el) => {
    const flags = detectElementFlags(el);
    if (flags) result.flags = flags;
    const parent = el.parentElement;
    if (parent) result.parent = getElementSummary(parent);
    const inlineStyles = extractInlineStyles(el);
    if (inlineStyles) result.inlineStyles = inlineStyles;
    if (el.children && el.children.length > 0) {
      result.children = getChildrenCompact(el, 8);
    }
  };

  const getElementDetails = (el) => {
    if (!el || !(el instanceof Element)) return null;

    const classList = Array.from(el.classList || []);
    const stableSelectors = getStableSelectorSet(el);
    const result = {
      summary: getElementSummary(el),
      selector: getBestSelector(el, stableSelectors),
      classList,
    };

    appendElementSemanticFields(result, el);
    appendElementFlagsAndContext(result, el);
    Object.assign(result, splitComputedStyles(el));

    result.ancestry = getAncestryCompact(el, 4);
    result.appliedRules = getCompactCssRules(el, MATCH_KEYS, 30);
    if (stableSelectors.length > 1) result.altSelectors = stableSelectors.slice(1);
    if (_lastCorsBlockedCount > 0) {
      result._warnings = [`${_lastCorsBlockedCount} cross-origin stylesheet(s) could not be read — some rules may be missing`];
    }
    return result;
  };

  const trySaveReportJson = (report) => {
    const errorResult = (error) => ({
      ok: false,
      error: error?.message || String(error),
      filePath: null,
      fileName: null,
    });

    try {
      const fs = require('fs');
      const path = require('path');

      const realPluginPath = fs.realpathSync(__filename);
      const pluginsDir = path.dirname(realPluginPath); // .../plugins
      const rootDir = path.resolve(pluginsDir, '..'); // .../betterdiscord-dev OR .../BetterDiscord
      const reportsDir = path.join(rootDir, 'reports', 'css-picker');

      fs.mkdirSync(reportsDir, { recursive: true });

      const fileName = `css-picker-${getTimestampForFilename()}.json`;
      const filePath = path.join(reportsDir, fileName);

      fs.writeFileSync(filePath, JSON.stringify(report, null, 2), { encoding: 'utf8' });

      return { ok: true, filePath, fileName, error: null };
    } catch (error) {
      return errorResult(error);
    }
  };

  const tryCopyJsonToClipboard = async (report) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  };

  const createOverlay = () => {
    const overlay = document.createElement('div');
    overlay.id = 'css-picker-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 100000;
      border: 2px solid rgba(138, 43, 226, 0.95);
      border-radius: 2px;
      background: transparent;
      box-shadow: none;
    `;
    return overlay;
  };

  const createLauncherButton = () => {
    const button = document.createElement('button');
    button.id = 'css-picker-launcher';
    button.type = 'button';
    button.textContent = 'Start CSS Picker';
    button.style.cssText = `
      position: fixed;
      right: 18px;
      top: 18px;
      z-index: 100002;
      background: var(--brand-color, #5865f2);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 2px;
      padding: 10px 12px;
      cursor: pointer;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.2px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      font-family: var(--font-primary, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial);
      opacity: 0.96;
    `;
    return button;
  };

  const createTooltip = () => {
    const tooltip = document.createElement('div');
    tooltip.id = 'css-picker-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      top: 28px;
      right: 16px;
      max-width: 520px;
      max-height: 70vh;
      z-index: 100001;
      pointer-events: none;
      background: rgba(17, 18, 20, 0.92);
      border: 1px solid rgba(88, 101, 242, 0.65);
      border-radius: 2px;
      padding: 10px 12px;
      overflow: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      color: #dcddde;
      box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
    `;
    tooltip.innerHTML = `<div style="opacity: 0.85;">CSS Picker v${escapeHtml(
      config.info.version
    )}</div>`;
    return tooltip;
  };

  const updateTooltip = ({ tooltip, el }) => {
    const summary = getElementSummary(el);
    const candidates = getSelectorCandidates(el).slice(0, 3);
    const stable = getStableSelectorSet(el).slice(0, 2);
    const best =
      stable[0] || getExactClassSelectors(el)[0] || (el.id ? `#${CSS.escape(el.id)}` : null);
    const rootCtx = getRootContext();
    const rootClasses = (rootCtx.root.classList || []).slice(0, 4).join(' ') || '(none)';
    const bodyClasses = (rootCtx.body.classList || []).slice(0, 4).join(' ') || '(none)';

    tooltip.innerHTML = `
      <div style="display:flex; justify-content: space-between; gap: 8px; align-items: baseline;">
        <div><strong>${escapeHtml(summary)}</strong></div>
        <div style="opacity: 0.7;">click to capture, esc to cancel</div>
      </div>
      <div style="margin-top: 2px; opacity: 0.65;">CSS Picker v${escapeHtml(
        config.info.version
      )}</div>
      <div style="margin-top: 6px; opacity: 0.9;">
        <div style="opacity: 0.75; margin-bottom: 4px;">Best selector:</div>
        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">${escapeHtml(
          best || '(none)'
        )}</div>
      </div>
      <div style="margin-top: 6px; opacity: 0.9;">
        <div style="opacity: 0.75; margin-bottom: 4px;">Selector candidates:</div>
        ${candidates
          .map(
            (s) =>
              `<div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">${escapeHtml(
                s
              )}</div>`
          )
          .join('')}
      </div>
      <div style="margin-top: 6px; opacity: 0.9;">
        <div style="opacity: 0.75; margin-bottom: 4px;">Root context (may override):</div>
        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">
          :root/html classes: ${escapeHtml(rootClasses)}
        </div>
        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">
          body classes: ${escapeHtml(bodyClasses)}
        </div>
      </div>
    `;
  };

  const positionOverlayOnElement = ({ overlay, el }) => {
    const rect = el.getBoundingClientRect();

    // Ignore zero-size targets (e.g., hidden)
    if (!rect.width || !rect.height) return;

    overlay.style.top = `${Math.max(0, rect.top)}px`;
    overlay.style.left = `${Math.max(0, rect.left)}px`;
    overlay.style.width = `${Math.max(0, rect.width)}px`;
    overlay.style.height = `${Math.max(0, rect.height)}px`;
  };

  return class CSSPicker {

    start() {
    this._toast = _PluginUtils?.createToastHelper?.("cSSPicker") || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
      this.isActive = false;
      this.lastHoverElement = null;

      this.overlay = null;
      this.tooltip = null;
      this.launcher = null;
      this.settings = loadSettings();

      this.onMouseMove = null;
      this.onClick = null;
      this.onKeyDown = null;
      this.onGlobalHotkeyDown = null;
      this.hoverRafId = null;
      this.pendingHoverPoint = null;
      this._launcherClickHandler = null;

      this.injectLauncher();

      this.onGlobalHotkeyDown = (event) => {
        const settings = this.settings || loadSettings();
        if (!settings.hotkeyEnabled) return;
        if (isEditableTarget(event.target)) return;
        if (!matchesHotkey(event, settings.hotkey)) return;

        event.preventDefault();
        event.stopPropagation();
        (this.isActive && this.deactivatePickMode()) || this.activatePickMode();
      };
      document.addEventListener('keydown', this.onGlobalHotkeyDown, true);

      const hotkeyLabel =
        this.settings?.hotkeyEnabled && this.settings?.hotkey
          ? ` Hotkey: ${this.settings.hotkey}`
          : '';
      this._toast(`CSS Picker v${config.info.version} loaded.${hotkeyLabel}`, "info");
    }

    stop() {
      this.deactivatePickMode();
      this.removeLauncher();
      if (this.onGlobalHotkeyDown)
        document.removeEventListener('keydown', this.onGlobalHotkeyDown, true);
      this.onGlobalHotkeyDown = null;
    }

    getSettingsPanel() {
      const panel = document.createElement('div');
      panel.style.cssText = 'padding: 16px;';

      const settings = (this.settings = loadSettings());
      const isChecked = (v) => (v ? 'checked' : '');
      const startHotkeyHint =
        settings.hotkeyEnabled && settings.hotkey ? ` (${escapeHtml(settings.hotkey)})` : '';

      panel.innerHTML = `
        <div>
          <h2 style="margin: 0 0 8px 0;">CSS Picker</h2>
          <p style="margin: 0 0 12px 0; opacity: 0.8;">
            Click Start, then hover anything in Discord and click once to capture selectors.
            It captures only once per activation.
          </p>
          <button id="css-picker-start" style="
            background: var(--brand-color, #5865f2);
            color: white;
            border: none;
            padding: 10px 14px;
            border-radius: 2px;
            cursor: pointer;
            font-weight: 600;
            margin-right: 10px;
          ">Start pick mode (one capture)${startHotkeyHint}</button>
          <button id="css-picker-stop" style="
            background: rgba(4, 4, 5, 0.6);
            color: var(--text-normal, #dcddde);
            border: none;
            padding: 10px 14px;
            border-radius: 2px;
            cursor: pointer;
          ">Stop</button>
        </div>
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
          <div style="font-weight: 700; margin-bottom: 10px;">Toast details</div>
          <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
            <input id="css-picker-toast-computed" type="checkbox" ${isChecked(
              settings.toastIncludeComputed
            )} />
            <span>Include computed visual summary (bg, bg-image, shadow, border)</span>
          </label>
          <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
            <input id="css-picker-toast-rules" type="checkbox" ${isChecked(
              settings.toastIncludeRules
            )} />
            <span>Include matching rule hints (why it looks that way)</span>
          </label>
          <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
            <span style="min-width: 140px; opacity: 0.85;">Rule hints count</span>
            <input id="css-picker-toast-rule-count" type="number" min="0" max="6" value="${escapeHtml(
              settings.toastRuleCount
            )}" style="width: 80px; padding: 6px 8px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); color: var(--text-normal, #dcddde);" />
          </label>
          <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
            <span style="min-width: 140px; opacity: 0.85;">Toast timeout (ms)</span>
            <input id="css-picker-toast-timeout" type="number" min="1500" max="20000" value="${escapeHtml(
              settings.toastTimeoutMs
            )}" style="width: 120px; padding: 6px 8px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); color: var(--text-normal, #dcddde);" />
          </label>
        </div>
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
          <div style="font-weight: 700; margin-bottom: 10px;">Hotkey</div>
          <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
            <input id="css-picker-hotkey-enabled" type="checkbox" ${isChecked(
              settings.hotkeyEnabled
            )} />
            <span>Enable hotkey to toggle pick mode</span>
          </label>
          <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
            <span style="min-width: 140px; opacity: 0.85;">Hotkey</span>
            <input id="css-picker-hotkey" type="text" value="${escapeHtml(
              settings.hotkey
            )}" style="width: 200px; padding: 6px 8px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); color: var(--text-normal, #dcddde);" />
            <span style="opacity: 0.7;">Example: Ctrl+Shift+P</span>
          </label>
        </div>
      `;

      panel.querySelector('#css-picker-start').addEventListener('click', () => {
        this.activatePickMode();
      });

      panel.querySelector('#css-picker-stop').addEventListener('click', () => {
        this.deactivatePickMode();
      });

      const update = (next) => {
        const merged = { ...loadSettings(), ...next };
        saveSettings(merged);
        this.settings = merged;
        this._toast('CSS Picker settings saved', 'success', 2000);
      };

      panel.querySelector('#css-picker-toast-computed').addEventListener('change', (e) => {
        update({ toastIncludeComputed: !!e.target.checked });
      });
      panel.querySelector('#css-picker-toast-rules').addEventListener('change', (e) => {
        update({ toastIncludeRules: !!e.target.checked });
      });
      panel.querySelector('#css-picker-toast-rule-count').addEventListener('change', (e) => {
        const value = Math.max(0, Math.min(6, Number(e.target.value || 0)));
        update({ toastRuleCount: value });
      });
      panel.querySelector('#css-picker-toast-timeout').addEventListener('change', (e) => {
        const value = Math.max(1500, Math.min(20000, Number(e.target.value || 5500)));
        update({ toastTimeoutMs: value });
      });

      panel.querySelector('#css-picker-hotkey-enabled').addEventListener('change', (e) => {
        update({ hotkeyEnabled: !!e.target.checked });
      });
      panel.querySelector('#css-picker-hotkey').addEventListener('change', (e) => {
        update({ hotkey: String(e.target.value || '').trim() || DEFAULT_SETTINGS.hotkey });
      });

      return panel;
    }

    activatePickMode() {
      if (this.isActive) return;
      this.isActive = true;

      this.overlay = createOverlay();
      this.tooltip = createTooltip();

      document.body.appendChild(this.overlay);
      document.body.appendChild(this.tooltip);

      const getTargetFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        if (el.closest && el.closest('#css-picker-launcher')) return null;
        if (el === this.overlay || el === this.tooltip) return null;
        if (el.closest && el.closest('#css-picker-overlay')) return null;
        if (el.closest && el.closest('#css-picker-tooltip')) return null;
        return el;
      };

      this.onMouseMove = (event) => {
        if (!this.isActive) return;
        this.pendingHoverPoint = { x: event.clientX, y: event.clientY };
        if (this.hoverRafId) return;

        this.hoverRafId = requestAnimationFrame(() => {
          this.hoverRafId = null;
          if (!this.isActive || !this.pendingHoverPoint) return;

          const { x, y } = this.pendingHoverPoint;
          this.pendingHoverPoint = null;

          const rawTarget = getTargetFromPoint(x, y);
          if (!rawTarget || !(rawTarget instanceof Element)) return;
          const target = promoteToMeaningfulAncestor(rawTarget).el;

          if (target === this.lastHoverElement) return;
          this.lastHoverElement = target;

          positionOverlayOnElement({ overlay: this.overlay, el: target });
          updateTooltip({ tooltip: this.tooltip, el: target });
        });
      };

      const captureElementAtPoint = async (x, y) => {
        const rawTarget = getTargetFromPoint(x, y);
        if (!rawTarget || !(rawTarget instanceof Element)) {
          return { ok: false, error: 'No element found to capture' };
        }

        const { el: target, promoted, originalTag } = promoteToMeaningfulAncestor(rawTarget);
        const elementDetails = getElementDetails(target);
        if (promoted && originalTag) elementDetails._promotedFrom = originalTag;

        const report = {
          plugin: PLUGIN_NAME,
          version: config.info.version,
          element: elementDetails,
        };

        const saveResult = trySaveReportJson(report);
        const clipboardResult = await tryCopyJsonToClipboard(report);
        const toastType =
          (saveResult.ok && clipboardResult.ok && 'success')
          || ((saveResult.ok || clipboardResult.ok) && 'warning')
          || 'error';
        const settings = this.settings || loadSettings();
        const message = buildCaptureToastMessage({
          elementDetails: report.element,
          saveResult,
          clipboardResult,
          settings,
        });
        return {
          ok: true,
          toastType,
          message,
          toastTimeoutMs: settings.toastTimeoutMs || 5500,
        };
      };

      this.onClick = async (event) => {
        if (!this.isActive) return;
        if (event.target?.closest?.('#css-picker-launcher')) return;
        const capture = await captureElementAtPoint(event.clientX, event.clientY);
        if (!capture.ok) {
          this._toast(capture.error || 'Failed to capture element', 'error');
          this.deactivatePickMode();
          return;
        }
        this._toast(capture.message, capture.toastType, capture.toastTimeoutMs);
        this.deactivatePickMode();
      };

      this.onKeyDown = (event) => {
        if (!this.isActive) return;
        if (event.key !== 'Escape') return;

        event.preventDefault();
        event.stopPropagation();

        this._toast('CSS Picker cancelled', 'info');
        this.deactivatePickMode();
      };

      document.addEventListener('mousemove', this.onMouseMove, true);
      document.addEventListener('click', this.onClick, true);
      document.addEventListener('keydown', this.onKeyDown, true);

      this.updateLauncherState();
      this._toast('CSS Picker active: hover and click once to capture. Press Esc to cancel.', 'info', 5000);
    }

    deactivatePickMode() {
      if (!this.isActive) {
        // Still clean up in case
        this.removeArtifacts();
        return;
      }

      this.isActive = false;
      this.lastHoverElement = null;

      if (this.onMouseMove) document.removeEventListener('mousemove', this.onMouseMove, true);
      if (this.onClick) document.removeEventListener('click', this.onClick, true);
      if (this.onKeyDown) document.removeEventListener('keydown', this.onKeyDown, true);

      this.onMouseMove = null;
      this.onClick = null;
      this.onKeyDown = null;
      this.pendingHoverPoint = null;
      this.hoverRafId && cancelAnimationFrame(this.hoverRafId);
      this.hoverRafId = null;

      this.removeArtifacts();
      this.updateLauncherState();
    }

    removeArtifacts() {
      try {
        this.overlay?.remove();
      } catch (e) {
        // ignore
      }
      try {
        this.tooltip?.remove();
      } catch (e) {
        // ignore
      }
      this.overlay = null;
      this.tooltip = null;
    }

    injectLauncher() {
      if (this.launcher && document.body.contains(this.launcher)) return;
      this.launcher = this.launcher || createLauncherButton();

      this._launcherClickHandler =
        this._launcherClickHandler ||
        (() => {
          (this.isActive && this.deactivatePickMode()) || this.activatePickMode();
        });
      this.launcher.removeEventListener('click', this._launcherClickHandler);
      this.launcher.addEventListener('click', this._launcherClickHandler);

      document.body.appendChild(this.launcher);
      this.updateLauncherState();
    }

    removeLauncher() {
      try {
        this.launcher &&
          this._launcherClickHandler &&
          this.launcher.removeEventListener('click', this._launcherClickHandler);
        this.launcher?.remove();
      } catch (e) {
        // ignore
      }
      this.launcher = null;
    }

    updateLauncherState() {
      if (!this.launcher) return;
      const settings = this.settings || loadSettings();
      const hotkeySuffix = settings.hotkeyEnabled && settings.hotkey ? ` (${settings.hotkey})` : '';
      const states = {
        active: { text: 'Cancel CSS Picker', opacity: '0.82' },
        inactive: { text: 'Start CSS Picker', opacity: '0.96' },
      };
      const next = this.isActive ? states.active : states.inactive;
      this.launcher.textContent = `${next.text}${hotkeySuffix}`;
      this.launcher.style.opacity = next.opacity;
    }
  };
})();
