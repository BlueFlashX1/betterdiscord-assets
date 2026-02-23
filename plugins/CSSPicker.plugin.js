/**
 * @name CSS Picker
 * @author BlueFlashX1
 * @description Hover to inspect, click to capture & auto-update theme. Integrates with Theme Auto Maintainer.
 * @version 1.3.0
 * @authorId
 */
/* global CSS, Element */

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
      version: '1.3.0',
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

  const isEditableTarget = (target) => {
    const el = target;
    if (!el) return false;
    const tag = el.tagName?.toLowerCase?.() || '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!el.isContentEditable;
  };

  const normalizeHotkey = (hotkey) =>
    String(hotkey || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');

  const parseHotkey = (hotkey) => {
    const normalized = normalizeHotkey(hotkey);
    const parts = normalized.split('+').filter(Boolean);
    const mods = new Set(
      parts.filter((p) => ['ctrl', 'shift', 'alt', 'meta', 'cmd', 'command'].includes(p))
    );
    const key = parts.find((p) => !mods.has(p)) || '';

    const hasCtrl = mods.has('ctrl');
    const hasShift = mods.has('shift');
    const hasAlt = mods.has('alt');
    const hasMeta = mods.has('meta') || mods.has('cmd') || mods.has('command');

    return { key, hasCtrl, hasShift, hasAlt, hasMeta };
  };

  const matchesHotkey = (event, hotkey) => {
    const spec = parseHotkey(hotkey);
    if (!spec.key) return false;

    const key = String(event.key || '').toLowerCase();
    const isKeyMatch = key === spec.key || (spec.key.length === 1 && key === spec.key);

    return (
      isKeyMatch &&
      !!event.ctrlKey === spec.hasCtrl &&
      !!event.shiftKey === spec.hasShift &&
      !!event.altKey === spec.hasAlt &&
      !!event.metaKey === spec.hasMeta
    );
  };

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

  const safeToast = (message, options = {}) => {
    try {
      BdApi.showToast(message, { timeout: 3000, ...options });
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

    const bgColor = computedStyle.backgroundColor;
    const bgImg = computedStyle.backgroundImage;
    const shadow = computedStyle.boxShadow;
    const border = computedStyle.border;
    const outline = computedStyle.outline;
    const filter = computedStyle.filter;
    const backdrop = computedStyle.backdropFilter;

    const parts = [
      !isTrulyTransparent(bgColor) && `bg ${formatCssValueCompact(bgColor)}`,
      bgImg &&
        !isTrulyTransparent(bgImg) &&
        bgImg !== 'none' &&
        `bg-img ${truncateMiddle(bgImg, 78)}`,
      shadow && shadow !== 'none' && `shadow ${truncateMiddle(shadow, 78)}`,
      border && border !== 'none' && `border ${truncateMiddle(border, 62)}`,
      outline && outline !== 'none' && `outline ${truncateMiddle(outline, 62)}`,
      filter && filter !== 'none' && `filter ${truncateMiddle(filter, 62)}`,
      backdrop && backdrop !== 'none' && `backdrop ${truncateMiddle(backdrop, 62)}`,
    ].filter(Boolean);

    return parts.slice(0, 4);
  };

  const buildRuleHints = ({ matchedCssRules, maxRuleCount }) => {
    const rules = Array.isArray(matchedCssRules) ? matchedCssRules : [];
    const keys = [
      'background-image',
      'background',
      'background-color',
      'box-shadow',
      'border',
      'outline',
      'filter',
      'backdrop-filter',
      'transform',
    ];

    const pickFirstRuleForKey = (key) =>
      rules.find((r) => r?.properties && r.properties[key] && r.properties[key].value);

    const picks = keys
      .map((k) => [k, pickFirstRuleForKey(k)])
      .filter(([, r]) => r)
      .slice(0, Math.max(0, maxRuleCount || 0));

    const unique = new Set();
    return picks
      .map(([key, r]) => {
        const prop = r.properties[key];
        const priority = prop?.priority === 'important' ? ' !important' : '';
        const pseudo = r.pseudo ? r.pseudo : '';
        const selector = truncateMiddle(`${r.selector}${pseudo}`, 58);
        const sheet = shortenStylesheetLabel(r.stylesheet);
        const line = `${key}${priority}: ${selector} @ ${sheet}`;

        const dedupeKey = `${key}|${r.stylesheet}|${r.selectorText}`;
        if (unique.has(dedupeKey)) return null;
        unique.add(dedupeKey);
        return line;
      })
      .filter(Boolean)
      .slice(0, Math.max(0, maxRuleCount || 0));
  };

  const buildCaptureToastMessage = ({ elementDetails, saveResult, clipboardResult, settings }) => {
    const elementSummary = elementDetails?.summary || 'unknown';
    const bestSelector = elementDetails?.bestSelector || null;
    const selectorLabel = bestSelector ? truncateMiddle(bestSelector, 70) : elementSummary;

    const base = `Captured: ${selectorLabel}`;
    const computedParts = settings.toastIncludeComputed
      ? buildComputedVisualSummary(elementDetails?.computedStyle)
      : [];
    const ruleHints = settings.toastIncludeRules
      ? buildRuleHints({
          matchedCssRules: elementDetails?.matchedCssRules,
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

  const pickComputedStyles = (el) => {
    if (!el || !(el instanceof Element)) return null;

    const style = window.getComputedStyle(el);
    const keys = [
      'display',
      'position',
      'zIndex',
      'opacity',
      'backgroundColor',
      'backgroundImage',
      'background',
      'border',
      'borderColor',
      'borderWidth',
      'borderRadius',
      'boxShadow',
      'outline',
      'filter',
      'backdropFilter',
      'transform',
      'color',
      'fontFamily',
      'fontSize',
      'lineHeight',
      'padding',
      'margin',
    ];

    return keys.reduce((acc, key) => {
      const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      acc[key] = style.getPropertyValue(cssKey) || style[key] || null;
      return acc;
    }, {});
  };

  const getChildElements = (el, max = 10) => {
    if (!el || !(el instanceof Element) || !el.children) return [];
    return Array.from(el.children).slice(0, max);
  };

  const getChildrenDetails = (el, max = 10) => {
    const children = getChildElements(el, max);
    return children
      .map((child, index) => {
        const node = getElementNodeInfo(child);
        if (!node) return null;

        const attrs = Array.from(child.attributes || [])
          .map((a) => ({ name: a.name, value: a.value }))
          .slice(0, 25);

        return {
          index,
          ...node,
          attributes: attrs,
          textPreview: (child.textContent || '').trim().slice(0, 120) || null,
          stableSelectors: getStableSelectorSet(child),
          selectorCandidates: getSelectorCandidates(child).slice(0, 8),
          computedStyle: pickComputedStyles(child),
        };
      })
      .filter(Boolean);
  };

  const getTablistChildHints = (el) => {
    if (!el || !(el instanceof Element)) return null;
    const role = el.getAttribute('role');
    if (role !== 'tablist') return null;

    const children = getChildElements(el, 20);
    const tabs = children.filter((child) => {
      const hasTabRole = child.getAttribute('role') === 'tab';
      const hasItemPrefix = Array.from(child.classList || []).some((c) => /^item[_]{1,2}/.test(c));
      return hasTabRole || hasItemPrefix;
    });

    const selected = tabs.filter((child) => {
      const ariaSelected = child.getAttribute('aria-selected');
      return ariaSelected === 'true' || child.className?.includes?.('selected');
    });

    return {
      childCount: children.length,
      tabCandidatesCount: tabs.length,
      selectedTabCandidatesCount: selected.length,
      tabCandidatesSummaries: tabs.slice(0, 6).map((c) => ({
        summary: getElementSummary(c),
        role: c.getAttribute('role') || null,
        ariaSelected: c.getAttribute('aria-selected') || null,
        classList: Array.from(c.classList || []).slice(0, 10),
        stableSelectors: getStableSelectorSet(c).slice(0, 4),
        selectorCandidates: getSelectorCandidates(c).slice(0, 4),
      })),
    };
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

      // CSSMediaRule / CSSSupportsRule
      const hasNested = rule?.cssRules && rule.cssRules.length;
      hasNested && iterCssRules(rule.cssRules, onRule, state);
    }
  };

  // PERF: Cache flattened CSS rules to avoid re-scanning all stylesheets on every hover.
  // Cache invalidates every 10 seconds (stylesheets rarely change during a session).
  let _cachedFlatRules = null;
  let _cachedFlatRulesTime = 0;
  const RULE_CACHE_TTL_MS = 10000;

  const _getFlatRules = () => {
    const now = Date.now();
    if (_cachedFlatRules && now - _cachedFlatRulesTime < RULE_CACHE_TTL_MS) return _cachedFlatRules;

    const flat = [];
    const sheets = Array.from(document.styleSheets || []);
    sheets.forEach((sheet, sheetIndex) => {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { return; } // Skip CORS sheets
      const sheetLabel = getStylesheetLabel(sheet, sheetIndex);
      iterCssRules(rules, (rule, ruleIndex) => {
        if (rule.selectorText) {
          flat.push({ rule, ruleIndex, sheetLabel, sheetIndex });
        }
      }, { shouldStop: false });
    });

    _cachedFlatRules = flat;
    _cachedFlatRulesTime = now;
    return flat;
  };

  const findMatchingCssRules = (el, keys, maxMatches = 30) => {
    if (!el || !(el instanceof Element)) return [];
    const matches = [];
    const flatRules = _getFlatRules();

    for (let i = 0; i < flatRules.length; i++) {
      if (matches.length >= maxMatches) break;

      const { rule, ruleIndex, sheetLabel, sheetIndex } = flatRules[i];
      const selectorText = rule.selectorText;
      const { selector, pseudo } = splitPseudo(selectorText);
      if (!selector) continue;

      // Quick prefilter: only consider rules that set any of the keys
      let hasAnyKey = false;
      for (let k = 0; k < keys.length; k++) {
        try {
          if (rule.style?.getPropertyValue?.(keys[k])) { hasAnyKey = true; break; }
        } catch (e) { /* skip */ }
      }
      if (!hasAnyKey) continue;

      try {
        if (!el.matches(selector)) continue;
      } catch (e) { continue; } // Invalid selector

      const props = {};
      for (let k = 0; k < keys.length; k++) {
        const value = rule.style.getPropertyValue(keys[k]);
        if (value) {
          props[keys[k]] = {
            value,
            priority: rule.style.getPropertyPriority(keys[k]) || null,
          };
        }
      }

      matches.push({
        stylesheet: sheetLabel,
        sheetIndex,
        ruleIndex,
        selectorText,
        selector,
        pseudo,
        properties: props,
      });
    }

    return matches;
  };

  const getAncestry = (el, maxDepth = 10) => {
    const chain = [];
    let current = el;

    for (let depth = 0; depth < maxDepth && current && current.nodeType === 1; depth++) {
      const node = getElementNodeInfo(current);
      if (!node) break;

      chain.push({
        depth,
        ...node,
        selectorCandidates: getSelectorCandidates(current).slice(0, 8),
      });

      current = current.parentElement;
      if (!current) break;
      if (current.tagName && ['HTML', 'BODY'].includes(current.tagName)) {
        const rootNode = getElementNodeInfo(current);
        rootNode &&
          chain.push({
            depth: depth + 1,
            ...rootNode,
            selectorCandidates: getSelectorCandidates(current).slice(0, 8),
          });
        break;
      }
    }

    return chain;
  };

  const getElementDetails = (el) => {
    if (!el || !(el instanceof Element)) return null;

    const MAX_SELECTOR_CANDIDATES = 8;
    const MAX_UNIQUE_CHECKS = 2;
    const MAX_CHILDREN_DETAILS = 12;
    const MATCH_KEYS = [
      'background',
      'background-color',
      'background-image',
      'border',
      'border-color',
      'border-width',
      'border-radius',
      'box-shadow',
      'outline',
      'filter',
      'backdrop-filter',
      'transform',
    ];

    const rect = el.getBoundingClientRect();
    const classList = Array.from(el.classList || []);
    const childrenCount = el.children ? el.children.length : 0;
    const firstChildSummary = el.firstElementChild ? getElementSummary(el.firstElementChild) : null;
    const parentSummary = el.parentElement ? getElementSummary(el.parentElement) : null;

    const attributes = Array.from(el.attributes || [])
      .map((a) => ({ name: a.name, value: a.value }))
      .slice(0, 40);

    const selectorCandidates = getSelectorCandidates(el)
      .slice(0, MAX_SELECTOR_CANDIDATES)
      .map((selector, index) => {
        const base = {
          selector,
          isValid: false,
          matchesNow: false,
          isUnique: null,
        };

        try {
          const matches = Array.from(document.querySelectorAll(selector));
          const matchCount = matches.length;
          const matchesNow = matchCount > 0;
          const shouldCheckUniqueness = matchesNow && index < MAX_UNIQUE_CHECKS;

          return {
            ...base,
            isValid: true,
            matchesNow,
            isUnique: shouldCheckUniqueness ? matchCount === 1 : null,
          };
        } catch (e) {
          return base;
        }
      });

    return {
      capturedAt: new Date().toISOString(),
      summary: getElementSummary(el),
      tagName: el.tagName.toLowerCase(),
      id: el.id || null,
      classList,
      exactClassSelectors: getExactClassSelectors(el).slice(0, 10),
      semanticClassSelectors: getSemanticClassSelectors(el),
      parentSummary,
      childrenSummary: {
        count: childrenCount,
        firstChild: firstChildSummary,
      },
      attributes,
      textPreview: (el.textContent || '').trim().slice(0, 200) || null,
      computedStyle: pickComputedStyles(el),
      children: getChildrenDetails(el, MAX_CHILDREN_DETAILS),
      tablistHints: getTablistChildHints(el),
      matchedCssRules: findMatchingCssRules(el, MATCH_KEYS, 40),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      },
      stableSelectors: getStableSelectorSet(el),
      bestSelector:
        getStableSelectorSet(el)[0] ||
        getExactClassSelectors(el)[0] ||
        (el.id ? `#${CSS.escape(el.id)}` : null),
      rootSelectors: [':root', 'html', 'body'],
      selectorCandidates,
      ancestry: getAncestry(el, 10),
      rootContext: getRootContext(),
    };
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
      border-radius: 6px;
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
      border-radius: 10px;
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
      border-radius: 8px;
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
      safeToast(`CSS Picker v${config.info.version} loaded.${hotkeyLabel}`, {
        type: 'info',
      });
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
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            margin-right: 10px;
          ">Start pick mode (one capture)${startHotkeyHint}</button>
          <button id="css-picker-stop" style="
            background: rgba(4, 4, 5, 0.6);
            color: var(--text-normal, #dcddde);
            border: none;
            padding: 10px 14px;
            border-radius: 6px;
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
            )}" style="width: 80px; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); color: var(--text-normal, #dcddde);" />
          </label>
          <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
            <span style="min-width: 140px; opacity: 0.85;">Toast timeout (ms)</span>
            <input id="css-picker-toast-timeout" type="number" min="1500" max="20000" value="${escapeHtml(
              settings.toastTimeoutMs
            )}" style="width: 120px; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); color: var(--text-normal, #dcddde);" />
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
            )}" style="width: 200px; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); color: var(--text-normal, #dcddde);" />
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
        safeToast('CSS Picker settings saved', { type: 'success', timeout: 2000 });
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

          const target = getTargetFromPoint(x, y);
          if (!target || !(target instanceof Element)) return;

          if (target === this.lastHoverElement) return;
          this.lastHoverElement = target;

          positionOverlayOnElement({ overlay: this.overlay, el: target });
          updateTooltip({ tooltip: this.tooltip, el: target });
        });
      };

      this.onClick = async (event) => {
        if (!this.isActive) return;

        // Capture exactly once per activation
        if (event.target && event.target.closest && event.target.closest('#css-picker-launcher')) {
          return;
        }

        const target = getTargetFromPoint(event.clientX, event.clientY);
        if (!target || !(target instanceof Element)) {
          safeToast('No element found to capture', { type: 'error' });
          this.deactivatePickMode();
          return;
        }

        const report = {
          plugin: PLUGIN_NAME,
          version: config.info.version,
          url: window.location.href,
          element: getElementDetails(target),
        };

        const saveResult = trySaveReportJson(report);
        const clipboardResult = await tryCopyJsonToClipboard(report);

        const toastType =
          (saveResult.ok && clipboardResult.ok && 'success') ||
          ((saveResult.ok || clipboardResult.ok) && 'warning') ||
          'error';

        const settings = this.settings || loadSettings();
        const message = buildCaptureToastMessage({
          elementDetails: report.element,
          saveResult,
          clipboardResult,
          settings,
        });

        safeToast(message, { type: toastType, timeout: settings.toastTimeoutMs || 5500 });

        this.deactivatePickMode();
      };

      this.onKeyDown = (event) => {
        if (!this.isActive) return;
        if (event.key !== 'Escape') return;

        event.preventDefault();
        event.stopPropagation();

        safeToast('CSS Picker cancelled', { type: 'info' });
        this.deactivatePickMode();
      };

      document.addEventListener('mousemove', this.onMouseMove, true);
      document.addEventListener('click', this.onClick, true);
      document.addEventListener('keydown', this.onKeyDown, true);

      this.updateLauncherState();
      safeToast('CSS Picker active: hover and click once to capture. Press Esc to cancel.', {
        type: 'info',
        timeout: 5000,
      });
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
