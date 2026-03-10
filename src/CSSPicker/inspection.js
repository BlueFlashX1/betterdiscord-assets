/**
 * inspection.js — Stylesheet analysis, CSS rule matching, computed
 * style picking, and capture report utilities for CSSPicker.
 */

/* global Element */

import { truncateMiddle, getElementSummary } from "./element-summary.js";

// ── Formatting helpers ───────────────────────────────────────────

export function formatCssValueCompact(value) {
  return truncateMiddle(
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim(),
    96
  );
}

export function isTrulyTransparent(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    !normalized ||
    normalized === "none" ||
    normalized === "transparent" ||
    normalized === "rgba(0, 0, 0, 0)" ||
    normalized === "rgba(0,0,0,0)"
  );
}

export function shortenStylesheetLabel(label) {
  const text = String(label ?? "");
  const asUrl = /^https?:\/\//i.test(text);
  if (!asUrl) return truncateMiddle(text, 52);
  try {
    const { pathname, host } = new URL(text);
    const parts = pathname.split("/").filter(Boolean);
    const tail = parts.slice(-2).join("/");
    return truncateMiddle(`${host}/${tail}`, 52);
  } catch (e) {
    return truncateMiddle(text, 52);
  }
}

// ── Computed visual summary for toast ────────────────────────────

export function buildComputedVisualSummary(computedStyle) {
  if (!computedStyle) return [];

  const rows = [
    {
      value: computedStyle.backgroundColor,
      include: (v) => !isTrulyTransparent(v),
      render: (v) => `bg ${formatCssValueCompact(v)}`,
    },
    {
      value: computedStyle.backgroundImage,
      include: (v) => v && v !== "none" && !isTrulyTransparent(v),
      render: (v) => `bg-img ${truncateMiddle(v, 78)}`,
    },
    {
      value: computedStyle.boxShadow,
      include: (v) => v && v !== "none",
      render: (v) => `shadow ${truncateMiddle(v, 78)}`,
    },
    {
      value: computedStyle.border,
      include: (v) => v && v !== "none",
      render: (v) => `border ${truncateMiddle(v, 62)}`,
    },
    {
      value: computedStyle.outline,
      include: (v) => v && v !== "none",
      render: (v) => `outline ${truncateMiddle(v, 62)}`,
    },
    {
      value: computedStyle.filter,
      include: (v) => v && v !== "none",
      render: (v) => `filter ${truncateMiddle(v, 62)}`,
    },
    {
      value: computedStyle.backdropFilter,
      include: (v) => v && v !== "none",
      render: (v) => `backdrop ${truncateMiddle(v, 62)}`,
    },
  ];

  const parts = [];
  for (const row of rows) {
    if (!row.include(row.value)) continue;
    parts.push(row.render(row.value));
    if (parts.length >= 4) break;
  }
  return parts;
}

// ── Rule hint builder (works with both legacy and compact format) ─

// Works with both old { properties, stylesheet } and new compact { props, source } format
export function buildRuleHints({ appliedRules, matchedCssRules, maxRuleCount }) {
  const rules = Array.isArray(appliedRules)
    ? appliedRules
    : Array.isArray(matchedCssRules)
      ? matchedCssRules
      : [];
  const keys = [
    "background-image",
    "background",
    "background-color",
    "box-shadow",
    "border",
    "outline",
    "filter",
    "backdrop-filter",
    "transform",
  ];

  const pickFirstRuleForKey = (key) =>
    rules.find((r) => {
      if (r?.props) return !!r.props[key]; // compact format
      if (r?.properties) return !!r.properties[key]?.value; // legacy format
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
      const hasBang = isCompact
        ? (value || "").includes("!important")
        : r.properties[key]?.priority === "important";
      const priority = hasBang ? " !important" : "";
      const pseudo = r.pseudo || "";
      const sel = isCompact ? r.selector : `${r.selector || ""}${pseudo}`;
      const selector = truncateMiddle(sel, 58);
      const sheet = shortenStylesheetLabel(isCompact ? r.source : r.stylesheet);
      const originTag = isCompact && r.origin?.type ? ` (${r.origin.type})` : "";
      const line = `${key}${priority}: ${selector} @ ${sheet}${originTag}`;

      const dedupeKey = `${key}|${sheet}|${sel}`;
      if (unique.has(dedupeKey)) return null;
      unique.add(dedupeKey);
      return line;
    })
    .filter(Boolean)
    .slice(0, Math.max(0, maxRuleCount || 0));
}

// ── Capture toast message builder ────────────────────────────────

export function buildCaptureToastMessage({ elementDetails, saveResult, clipboardResult, settings, pluginVersion }) {
  const elementSummary = elementDetails?.summary || "unknown";
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

  const fileMsg = saveResult?.ok ? `saved ${saveResult.fileName}` : "save failed";
  const clipMsg = clipboardResult?.ok ? "clipboard ok" : "clipboard failed";

  const lines = [
    `CSS Picker v${pluginVersion} • ${base}`,
    computedParts.length ? computedParts.join(" • ") : null,
    ruleHints.length ? `Rules: ${ruleHints.join(" | ")}` : null,
    `${fileMsg} • ${clipMsg}`,
  ].filter(Boolean);

  const defaultMaxChars = 260;
  const message = lines.join("\n");
  return truncateMiddle(message, settings.toastMaxChars || defaultMaxChars);
}

// ── Computed style picking ───────────────────────────────────────

// Full computed style keys for the target element
const COMPUTED_KEYS_FULL = [
  "display",
  "position",
  "zIndex",
  "opacity",
  "visibility",
  "overflow",
  "pointerEvents",
  "backgroundColor",
  "backgroundImage",
  "background",
  "border",
  "borderColor",
  "borderWidth",
  "borderRadius",
  "boxShadow",
  "outline",
  "filter",
  "backdropFilter",
  "transform",
  "color",
  "fontFamily",
  "fontSize",
  "lineHeight",
  "padding",
  "margin",
  "width",
  "height",
  "maxWidth",
  "maxHeight",
];

// Compact computed style keys for children (visual-only, no layout)
const COMPUTED_KEYS_COMPACT = [
  "display",
  "opacity",
  "visibility",
  "background",
  "border",
  "borderRadius",
  "boxShadow",
  "color",
  "fontSize",
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

export function pickComputedStyles(el) {
  return _pickStyles(el, COMPUTED_KEYS_FULL);
}

export function pickComputedStylesCompact(el) {
  return _pickStyles(el, COMPUTED_KEYS_COMPACT);
}

// Known browser defaults for computed style keys.
// Array = any match counts as default; null = always treat as active (inherited/element-dependent).
const COMPUTED_DEFAULTS = {
  display: null, // element-dependent (block for div, inline for span, table-cell for td)
  position: "static",
  zIndex: "auto",
  opacity: "1",
  visibility: "visible",
  overflow: "visible",
  pointerEvents: "auto",
  backgroundColor: ["rgba(0, 0, 0, 0)", "transparent"],
  backgroundImage: "none",
  background: [
    "rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box",
    "rgba(0, 0, 0, 0)",
  ],
  border: ['0px none rgb(0, 0, 0)', '0px none rgba(0, 0, 0, 0)', ''],
  borderColor: ["rgb(0, 0, 0)", "rgba(0, 0, 0, 0)"],
  borderWidth: "0px",
  borderRadius: "0px",
  boxShadow: "none",
  outline: ["rgb(0, 0, 0) none 0px", "rgba(0, 0, 0, 0) none 0px", "0px none invert"],
  filter: "none",
  backdropFilter: "none",
  transform: "none",
  color: null, // inherited — always active
  fontFamily: null, // inherited — always active
  fontSize: null, // inherited — always active
  lineHeight: "normal",
  padding: "0px",
  margin: "0px",
  width: null, // element-dependent — always active
  height: null, // element-dependent — always active
  maxWidth: "none",
  maxHeight: "none",
};

// Split computed styles into active (non-default) values and a collapsed list of default key names.
export function splitComputedStyles(el) {
  const all = pickComputedStyles(el);
  if (!all) return { activeStyles: {}, defaultStyles: [] };
  const activeStyles = {};
  const defaultStyles = [];
  for (const [key, val] of Object.entries(all)) {
    if (!val) {
      defaultStyles.push(key);
      continue;
    }
    const def = COMPUTED_DEFAULTS[key];
    if (def === null) {
      activeStyles[key] = val;
      continue;
    }
    const isDefault = Array.isArray(def) ? def.some((d) => val === d) : val === def;
    isDefault ? defaultStyles.push(key) : (activeStyles[key] = val);
  }
  return { activeStyles, defaultStyles };
}

// Extract inline style="" attribute properties separately from computed styles.
export function extractInlineStyles(el) {
  if (!el?.style?.length) return null;
  const inline = {};
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style[i];
    const val = el.style.getPropertyValue(prop);
    const priority = el.style.getPropertyPriority(prop);
    if (val) inline[prop] = priority ? `${val} !important` : val;
  }
  return Object.keys(inline).length ? inline : null;
}

// ── Stylesheet label helpers ─────────────────────────────────────

const getStylesheetLabel = (sheet, index) => {
  const href = sheet?.href || null;
  if (href) return href;
  const owner = sheet?.ownerNode;
  const ownerTag = owner?.tagName?.toLowerCase?.() || "style";
  const ownerId = owner?.id ? `#${owner.id}` : "";
  const ownerClass =
    typeof owner?.className === "string" && owner.className.trim()
      ? `.${owner.className.trim().split(/\s+/)[0]}`
      : "";
  return `inline:${index}:${ownerTag}${ownerId}${ownerClass}`;
};

// Clean stylesheet label for AI readability:
//   "inline:51:style#SoloLeveling-ClearVision-theme-container" -> "SoloLeveling-ClearVision-theme"
//   "https://discord.com/assets/web.26898.css" -> "discord-css"
const simplifySheetLabel = (label) => {
  if (!label) return "unknown";
  // Discord CDN CSS
  if (/discord\.com\/assets\//.test(label)) return "discord-css";
  // Inline style with id -- extract meaningful name
  const inlineMatch = label.match(/^inline:\d+:style#(.+)/);
  if (inlineMatch) {
    return inlineMatch[1].replace(/-container$/, "").replace(/-styles?$/, "");
  }
  // Inline without id
  if (/^inline:\d+:/.test(label)) return label;
  // External URL -- use hostname
  try {
    return new URL(label).hostname;
  } catch (_) {}
  return label;
};

// ── Rule origin classification ───────────────────────────────────

// Origin types:
//   discord  -- Discord CDN stylesheets (discord.com/assets/*.css)
//   theme    -- BD theme container (id ends with -theme-container)
//   plugin   -- BdApi.DOM.addStyle() <style> elements (has ID, not theme)
//   customcss -- BD Custom CSS editor (id === 'customcss')
//   external -- External CDN (fonts.googleapis.com, etc.) -- may be theme OR plugin
//   unknown  -- Discord internal <style> without ID, or browser extension
export function classifyRuleOrigin(sheetLabel, sheetHref, ownerNode) {
  // Discord core -- loaded from CDN
  if (sheetHref && sheetHref.includes("discord.com/assets/"))
    return { type: "discord", name: "Discord" };

  const id = ownerNode?.id || "";

  // BD Custom CSS editor
  if (id === "customcss") return { type: "customcss", name: "Custom CSS" };

  // Theme -- BD theme container
  if (id.endsWith("-theme-container")) return { type: "theme", name: sheetLabel };

  // Known theme CDN @imports (NOT fonts -- fonts can come from plugins too)
  if (
    sheetHref &&
    (sheetHref.includes("clearvision.github.io") ||
      sheetHref.includes("discordstyles.github.io"))
  )
    return { type: "theme", name: sheetLabel };

  // External fonts (Google Fonts, etc.) -- could be theme or plugin, classify separately
  if (sheetHref && sheetHref.includes("fonts.googleapis.com"))
    return { type: "external", name: sheetLabel };

  // Plugin -- BD style elements from BdApi.DOM.addStyle (has ID, not theme/customcss)
  if (ownerNode?.tagName === "STYLE" && id) return { type: "plugin", name: sheetLabel };

  // Unknown -- probably Discord internal or browser extension
  return { type: "unknown", name: sheetLabel };
}

// ── Rule scope analysis ──────────────────────────────────────────

// Scope analysis: count how many elements a rule selector matches + sample others.
const getRuleScopeLabel = (totalMatches) => {
  if (totalMatches <= 1) return "unique";
  if (totalMatches <= 5) return "targeted";
  if (totalMatches <= 50) return "moderate";
  return "global";
};

const sampleScopeMatches = (nodes, pickedEl, maxSamples = 5) => {
  const samples = [];
  for (const node of nodes) {
    if (node === pickedEl) continue;
    const tag = node.tagName.toLowerCase();
    const cls = node.classList[0] || "";
    const aria = node.getAttribute("aria-label");
    samples.push(aria ? `${tag}.${cls}[${aria}]` : cls ? `${tag}.${cls}` : tag);
    if (samples.length >= maxSamples) break;
  }
  return samples;
};

export function analyzeRuleScope(selectorText, pickedEl) {
  try {
    const all = document.querySelectorAll(selectorText);
    const total = all.length;
    const result = { scope: getRuleScopeLabel(total), totalMatches: total };
    if (total > 1) result.otherElements = sampleScopeMatches(all, pickedEl);
    return result;
  } catch {
    return { scope: "unknown", totalMatches: -1 };
  }
}

// ── CSS rule iteration and flat rule cache ────────────────────────

// Returns true for global CSS reset rules (massive comma-separated tag selectors)
const isResetRule = (selectorText) => {
  if (!selectorText) return false;
  const commas = selectorText.split(",").length;
  return commas > 8; // "a, abbr, acronym, address, ..." style resets
};

const splitPseudo = (selectorText) => {
  if (!selectorText || typeof selectorText !== "string")
    return { selector: null, pseudo: null };
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
let _corsBlockedCount = 0;
const RULE_CACHE_TTL_MS = 3000;

/** Accessor for CORS-blocked count (used by selectors.js getElementDetails). */
export function _lastCorsBlockedCount() {
  return _corsBlockedCount;
}

export function _getFlatRules() {
  const now = Date.now();
  if (_cachedFlatRules && now - _cachedFlatRulesTime < RULE_CACHE_TTL_MS)
    return _cachedFlatRules;

  const flat = [];
  let corsCount = 0;
  const sheets = Array.from(document.styleSheets || []);
  sheets.forEach((sheet, sheetIndex) => {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch (e) {
      corsCount++;
      return;
    } // Skip CORS sheets
    const sheetLabel = getStylesheetLabel(sheet, sheetIndex);
    iterCssRules(
      rules,
      (rule, ruleIndex) => {
        if (rule.selectorText) {
          const owner = sheet.ownerNode;
          flat.push({
            rule,
            ruleIndex,
            sheetLabel,
            sheetIndex,
            sheetHref: sheet.href || null,
            ownerNode: owner ? { id: owner.id || "", tagName: owner.tagName || "" } : null,
          });
        }
      },
      { shouldStop: false }
    );
  });

  _corsBlockedCount = corsCount;
  _cachedFlatRules = flat;
  _cachedFlatRulesTime = now;
  return flat;
}

// ── CSS rule matching ────────────────────────────────────────────

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

export function findMatchingCssRules(el, keys, maxMatches = 30) {
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
}

// ── Compact CSS rules: filter resets, simplify labels, flatten props ──

export function getCompactCssRules(el, keys, maxMatches = 30) {
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
      // Flatten properties: { 'background': { value, priority } } -> { 'background': 'value !important' }
      const props = {};
      for (const [key, val] of Object.entries(r.properties)) {
        props[key] = val.priority ? `${val.value} !${val.priority}` : val.value;
      }
      entry.props = props;
      if (r.pseudo) entry.pseudo = r.pseudo;
      return entry;
    });
}

// ── CSS match keys (exported for use by selectors.js) ────────────

export const MATCH_KEYS = [
  "background",
  "background-color",
  "background-image",
  "border",
  "border-color",
  "border-width",
  "border-radius",
  "box-shadow",
  "outline",
  "filter",
  "backdrop-filter",
  "transform",
  "display",
  "visibility",
  "opacity",
  "pointer-events",
  "overflow",
  "color",
  "font-size",
  "font-family",
  "mask-image",
  "-webkit-mask-image",
];

// ── Report save / clipboard ──────────────────────────────────────

const getTimestampForFilename = () => new Date().toISOString().replace(/[:.]/g, "-");

export function trySaveReportJson(report) {
  const errorResult = (error) => ({
    ok: false,
    error: error?.message || String(error),
    filePath: null,
    fileName: null,
  });

  try {
    const fs = require("fs");
    const path = require("path");

    const realPluginPath = fs.realpathSync(__filename);
    const pluginsDir = path.dirname(realPluginPath); // .../plugins
    const rootDir = path.resolve(pluginsDir, ".."); // .../betterdiscord-dev OR .../BetterDiscord
    const reportsDir = path.join(rootDir, "reports", "css-picker");

    fs.mkdirSync(reportsDir, { recursive: true });

    const fileName = `css-picker-${getTimestampForFilename()}.json`;
    const filePath = path.join(reportsDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), { encoding: "utf8" });

    return { ok: true, filePath, fileName, error: null };
  } catch (error) {
    return errorResult(error);
  }
}

export async function tryCopyJsonToClipboard(report) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}
