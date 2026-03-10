/**
 * @name CSS Picker
 * @description Hover to inspect, click to capture & auto-update theme. Integrates with Theme Auto Maintainer.
 * @version 1.5.0
 * @author BlueFlashX1
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/shared/bd-module-loader.js
var require_bd_module_loader = __commonJS({
  "src/shared/bd-module-loader.js"(exports2, module2) {
    function loadBdModuleFromPlugins2(fileName) {
      if (!fileName) return null;
      try {
        const fs = require("fs");
        const path = require("path");
        const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), "utf8");
        const moduleObj = { exports: {} };
        const factory = new Function(
          "module",
          "exports",
          "require",
          "BdApi",
          `${source}
return module.exports || exports || null;`
        );
        const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
        const candidate = loaded || moduleObj.exports;
        if (typeof candidate === "function") return candidate;
        if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) {
          return candidate;
        }
      } catch (_) {
      }
      return null;
    }
    module2.exports = {
      loadBdModuleFromPlugins: loadBdModuleFromPlugins2
    };
  }
});

// src/shared/toast.js
var require_toast = __commonJS({
  "src/shared/toast.js"(exports2, module2) {
    function createToast2() {
      return (message, type = "info") => {
        BdApi.UI.showToast(message, {
          type: type === "level-up" ? "info" : type
        });
      };
    }
    module2.exports = { createToast: createToast2 };
  }
});

// src/shared/hotkeys.js
var require_hotkeys = __commonJS({
  "src/shared/hotkeys.js"(exports2, module2) {
    function isEditableTarget2(target) {
      var _a, _b;
      if (!target) return false;
      const tag = ((_b = (_a = target.tagName) == null ? void 0 : _a.toLowerCase) == null ? void 0 : _b.call(_a)) || "";
      return tag === "input" || tag === "textarea" || tag === "select" || !!target.isContentEditable;
    }
    function parseHotkey(hotkey) {
      const parts = String(hotkey || "").split("+").map((p) => p.trim().toLowerCase());
      return {
        key: parts.filter(
          (p) => p !== "ctrl" && p !== "shift" && p !== "alt" && p !== "meta" && p !== "cmd"
        )[0] || "",
        ctrl: parts.includes("ctrl"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt"),
        meta: parts.includes("meta") || parts.includes("cmd")
      };
    }
    function matchesHotkey2(event, hotkey) {
      if (!event || !hotkey) return false;
      const spec = parseHotkey(hotkey);
      if (!spec.key) return false;
      return event.key.toLowerCase() === spec.key && event.ctrlKey === spec.ctrl && event.shiftKey === spec.shift && event.altKey === spec.alt && event.metaKey === spec.meta;
    }
    module2.exports = { isEditableTarget: isEditableTarget2, parseHotkey, matchesHotkey: matchesHotkey2 };
  }
});

// src/CSSPicker/element-summary.js
function truncateMiddle(value, max = 90) {
  const str = String(value ?? "");
  if (str.length <= max) return str;
  const left = Math.max(10, Math.floor(max * 0.6));
  const right = Math.max(8, max - left - 3);
  return `${str.slice(0, left)}...${str.slice(-right)}`;
}
function getElementSummary(el) {
  var _a, _b;
  if (!el) return "unknown";
  const tag = ((_b = (_a = el.tagName) == null ? void 0 : _a.toLowerCase) == null ? void 0 : _b.call(_a)) || "unknown";
  const id = el.id ? `#${el.id}` : "";
  const className = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : "";
  return `${tag}${id}${className}`;
}

// src/CSSPicker/inspection.js
function formatCssValueCompact(value) {
  return truncateMiddle(
    String(value ?? "").replace(/\s+/g, " ").trim(),
    96
  );
}
function isTrulyTransparent(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "none" || normalized === "transparent" || normalized === "rgba(0, 0, 0, 0)" || normalized === "rgba(0,0,0,0)";
}
function shortenStylesheetLabel(label) {
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
function buildComputedVisualSummary(computedStyle) {
  if (!computedStyle) return [];
  const rows = [
    {
      value: computedStyle.backgroundColor,
      include: (v) => !isTrulyTransparent(v),
      render: (v) => `bg ${formatCssValueCompact(v)}`
    },
    {
      value: computedStyle.backgroundImage,
      include: (v) => v && v !== "none" && !isTrulyTransparent(v),
      render: (v) => `bg-img ${truncateMiddle(v, 78)}`
    },
    {
      value: computedStyle.boxShadow,
      include: (v) => v && v !== "none",
      render: (v) => `shadow ${truncateMiddle(v, 78)}`
    },
    {
      value: computedStyle.border,
      include: (v) => v && v !== "none",
      render: (v) => `border ${truncateMiddle(v, 62)}`
    },
    {
      value: computedStyle.outline,
      include: (v) => v && v !== "none",
      render: (v) => `outline ${truncateMiddle(v, 62)}`
    },
    {
      value: computedStyle.filter,
      include: (v) => v && v !== "none",
      render: (v) => `filter ${truncateMiddle(v, 62)}`
    },
    {
      value: computedStyle.backdropFilter,
      include: (v) => v && v !== "none",
      render: (v) => `backdrop ${truncateMiddle(v, 62)}`
    }
  ];
  const parts = [];
  for (const row of rows) {
    if (!row.include(row.value)) continue;
    parts.push(row.render(row.value));
    if (parts.length >= 4) break;
  }
  return parts;
}
function buildRuleHints({ appliedRules, matchedCssRules, maxRuleCount }) {
  const rules = Array.isArray(appliedRules) ? appliedRules : Array.isArray(matchedCssRules) ? matchedCssRules : [];
  const keys = [
    "background-image",
    "background",
    "background-color",
    "box-shadow",
    "border",
    "outline",
    "filter",
    "backdrop-filter",
    "transform"
  ];
  const pickFirstRuleForKey = (key) => rules.find((r) => {
    var _a;
    if (r == null ? void 0 : r.props) return !!r.props[key];
    if (r == null ? void 0 : r.properties) return !!((_a = r.properties[key]) == null ? void 0 : _a.value);
    return false;
  });
  const picks = keys.map((k) => [k, pickFirstRuleForKey(k)]).filter(([, r]) => r).slice(0, Math.max(0, maxRuleCount || 0));
  const unique = /* @__PURE__ */ new Set();
  return picks.map(([key, r]) => {
    var _a, _b, _c;
    const isCompact = !!r.props;
    const value = isCompact ? r.props[key] : (_a = r.properties[key]) == null ? void 0 : _a.value;
    const hasBang = isCompact ? (value || "").includes("!important") : ((_b = r.properties[key]) == null ? void 0 : _b.priority) === "important";
    const priority = hasBang ? " !important" : "";
    const pseudo = r.pseudo || "";
    const sel = isCompact ? r.selector : `${r.selector || ""}${pseudo}`;
    const selector = truncateMiddle(sel, 58);
    const sheet = shortenStylesheetLabel(isCompact ? r.source : r.stylesheet);
    const originTag = isCompact && ((_c = r.origin) == null ? void 0 : _c.type) ? ` (${r.origin.type})` : "";
    const line = `${key}${priority}: ${selector} @ ${sheet}${originTag}`;
    const dedupeKey = `${key}|${sheet}|${sel}`;
    if (unique.has(dedupeKey)) return null;
    unique.add(dedupeKey);
    return line;
  }).filter(Boolean).slice(0, Math.max(0, maxRuleCount || 0));
}
function buildCaptureToastMessage({ elementDetails, saveResult, clipboardResult, settings, pluginVersion }) {
  const elementSummary = (elementDetails == null ? void 0 : elementDetails.summary) || "unknown";
  const bestSelector = (elementDetails == null ? void 0 : elementDetails.selector) || (elementDetails == null ? void 0 : elementDetails.bestSelector) || null;
  const selectorLabel = bestSelector ? truncateMiddle(bestSelector, 70) : elementSummary;
  const base = `Captured: ${selectorLabel}`;
  const computedParts = settings.toastIncludeComputed ? buildComputedVisualSummary(elementDetails == null ? void 0 : elementDetails.activeStyles) : [];
  const ruleHints = settings.toastIncludeRules ? buildRuleHints({
    appliedRules: elementDetails == null ? void 0 : elementDetails.appliedRules,
    matchedCssRules: elementDetails == null ? void 0 : elementDetails.matchedCssRules,
    // legacy fallback
    maxRuleCount: settings.toastRuleCount
  }) : [];
  const fileMsg = (saveResult == null ? void 0 : saveResult.ok) ? `saved ${saveResult.fileName}` : "save failed";
  const clipMsg = (clipboardResult == null ? void 0 : clipboardResult.ok) ? "clipboard ok" : "clipboard failed";
  const lines = [
    `CSS Picker v${pluginVersion} \u2022 ${base}`,
    computedParts.length ? computedParts.join(" \u2022 ") : null,
    ruleHints.length ? `Rules: ${ruleHints.join(" | ")}` : null,
    `${fileMsg} \u2022 ${clipMsg}`
  ].filter(Boolean);
  const defaultMaxChars = 260;
  const message = lines.join("\n");
  return truncateMiddle(message, settings.toastMaxChars || defaultMaxChars);
}
var COMPUTED_KEYS_FULL = [
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
  "maxHeight"
];
var COMPUTED_KEYS_COMPACT = [
  "display",
  "opacity",
  "visibility",
  "background",
  "border",
  "borderRadius",
  "boxShadow",
  "color",
  "fontSize"
];
var _pickStyles = (el, keys) => {
  if (!el || !(el instanceof Element)) return null;
  const style = window.getComputedStyle(el);
  return keys.reduce((acc, key) => {
    const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    acc[key] = style.getPropertyValue(cssKey) || style[key] || null;
    return acc;
  }, {});
};
function pickComputedStyles(el) {
  return _pickStyles(el, COMPUTED_KEYS_FULL);
}
function pickComputedStylesCompact(el) {
  return _pickStyles(el, COMPUTED_KEYS_COMPACT);
}
var COMPUTED_DEFAULTS = {
  display: null,
  // element-dependent (block for div, inline for span, table-cell for td)
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
    "rgba(0, 0, 0, 0)"
  ],
  border: ["0px none rgb(0, 0, 0)", "0px none rgba(0, 0, 0, 0)", ""],
  borderColor: ["rgb(0, 0, 0)", "rgba(0, 0, 0, 0)"],
  borderWidth: "0px",
  borderRadius: "0px",
  boxShadow: "none",
  outline: ["rgb(0, 0, 0) none 0px", "rgba(0, 0, 0, 0) none 0px", "0px none invert"],
  filter: "none",
  backdropFilter: "none",
  transform: "none",
  color: null,
  // inherited — always active
  fontFamily: null,
  // inherited — always active
  fontSize: null,
  // inherited — always active
  lineHeight: "normal",
  padding: "0px",
  margin: "0px",
  width: null,
  // element-dependent — always active
  height: null,
  // element-dependent — always active
  maxWidth: "none",
  maxHeight: "none"
};
function splitComputedStyles(el) {
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
    isDefault ? defaultStyles.push(key) : activeStyles[key] = val;
  }
  return { activeStyles, defaultStyles };
}
function extractInlineStyles(el) {
  var _a;
  if (!((_a = el == null ? void 0 : el.style) == null ? void 0 : _a.length)) return null;
  const inline = {};
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style[i];
    const val = el.style.getPropertyValue(prop);
    const priority = el.style.getPropertyPriority(prop);
    if (val) inline[prop] = priority ? `${val} !important` : val;
  }
  return Object.keys(inline).length ? inline : null;
}
var getStylesheetLabel = (sheet, index) => {
  var _a, _b;
  const href = (sheet == null ? void 0 : sheet.href) || null;
  if (href) return href;
  const owner = sheet == null ? void 0 : sheet.ownerNode;
  const ownerTag = ((_b = (_a = owner == null ? void 0 : owner.tagName) == null ? void 0 : _a.toLowerCase) == null ? void 0 : _b.call(_a)) || "style";
  const ownerId = (owner == null ? void 0 : owner.id) ? `#${owner.id}` : "";
  const ownerClass = typeof (owner == null ? void 0 : owner.className) === "string" && owner.className.trim() ? `.${owner.className.trim().split(/\s+/)[0]}` : "";
  return `inline:${index}:${ownerTag}${ownerId}${ownerClass}`;
};
var simplifySheetLabel = (label) => {
  if (!label) return "unknown";
  if (/discord\.com\/assets\//.test(label)) return "discord-css";
  const inlineMatch = label.match(/^inline:\d+:style#(.+)/);
  if (inlineMatch) {
    return inlineMatch[1].replace(/-container$/, "").replace(/-styles?$/, "");
  }
  if (/^inline:\d+:/.test(label)) return label;
  try {
    return new URL(label).hostname;
  } catch (_) {
  }
  return label;
};
function classifyRuleOrigin(sheetLabel, sheetHref, ownerNode) {
  if (sheetHref && sheetHref.includes("discord.com/assets/"))
    return { type: "discord", name: "Discord" };
  const id = (ownerNode == null ? void 0 : ownerNode.id) || "";
  if (id === "customcss") return { type: "customcss", name: "Custom CSS" };
  if (id.endsWith("-theme-container")) return { type: "theme", name: sheetLabel };
  if (sheetHref && (sheetHref.includes("clearvision.github.io") || sheetHref.includes("discordstyles.github.io")))
    return { type: "theme", name: sheetLabel };
  if (sheetHref && sheetHref.includes("fonts.googleapis.com"))
    return { type: "external", name: sheetLabel };
  if ((ownerNode == null ? void 0 : ownerNode.tagName) === "STYLE" && id) return { type: "plugin", name: sheetLabel };
  return { type: "unknown", name: sheetLabel };
}
var getRuleScopeLabel = (totalMatches) => {
  if (totalMatches <= 1) return "unique";
  if (totalMatches <= 5) return "targeted";
  if (totalMatches <= 50) return "moderate";
  return "global";
};
var sampleScopeMatches = (nodes, pickedEl, maxSamples = 5) => {
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
function analyzeRuleScope(selectorText, pickedEl) {
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
var isResetRule = (selectorText) => {
  if (!selectorText) return false;
  const commas = selectorText.split(",").length;
  return commas > 8;
};
var splitPseudo = (selectorText) => {
  if (!selectorText || typeof selectorText !== "string")
    return { selector: null, pseudo: null };
  const pseudoMatch = selectorText.match(/(.*?)(::before|::after)\s*$/);
  if (!pseudoMatch) return { selector: selectorText, pseudo: null };
  return { selector: pseudoMatch[1].trim(), pseudo: pseudoMatch[2] };
};
var iterCssRules = (rules, onRule, state) => {
  if (!rules) return;
  for (let i = 0; i < rules.length; i++) {
    if (state.shouldStop) return;
    const rule = rules[i];
    if ((rule == null ? void 0 : rule.type) === 1 && rule.selectorText) {
      onRule(rule, i);
      continue;
    }
    const hasNested = (rule == null ? void 0 : rule.cssRules) && rule.cssRules.length;
    hasNested && iterCssRules(rule.cssRules, onRule, state);
  }
};
var _cachedFlatRules = null;
var _cachedFlatRulesTime = 0;
var _corsBlockedCount = 0;
var RULE_CACHE_TTL_MS = 3e3;
function _lastCorsBlockedCount() {
  return _corsBlockedCount;
}
function _getFlatRules() {
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
    }
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
            ownerNode: owner ? { id: owner.id || "", tagName: owner.tagName || "" } : null
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
var ruleTouchesAnyKey = (rule, keys) => {
  var _a, _b;
  for (const key of keys) {
    try {
      if ((_b = (_a = rule.style) == null ? void 0 : _a.getPropertyValue) == null ? void 0 : _b.call(_a, key)) return true;
    } catch (_) {
    }
  }
  return false;
};
var selectorMatchesElement = (el, selector) => {
  try {
    return !!selector && el.matches(selector);
  } catch (_) {
    return false;
  }
};
var collectRuleProperties = (rule, keys) => {
  const props = {};
  for (const key of keys) {
    const value = rule.style.getPropertyValue(key);
    if (!value) continue;
    props[key] = {
      value,
      priority: rule.style.getPropertyPriority(key) || null
    };
  }
  return props;
};
function findMatchingCssRules(el, keys, maxMatches = 30) {
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
      ownerNode
    });
  }
  return matches;
}
function getCompactCssRules(el, keys, maxMatches = 30) {
  const raw = findMatchingCssRules(el, keys, maxMatches);
  return raw.filter((r) => !isResetRule(r.selectorText)).map((r) => {
    const entry = {
      source: simplifySheetLabel(r.stylesheet),
      origin: classifyRuleOrigin(simplifySheetLabel(r.stylesheet), r.sheetHref, r.ownerNode),
      scope: analyzeRuleScope(r.selector || r.selectorText, el),
      selector: r.selectorText
    };
    const props = {};
    for (const [key, val] of Object.entries(r.properties)) {
      props[key] = val.priority ? `${val.value} !${val.priority}` : val.value;
    }
    entry.props = props;
    if (r.pseudo) entry.pseudo = r.pseudo;
    return entry;
  });
}
var MATCH_KEYS = [
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
  "-webkit-mask-image"
];
var getTimestampForFilename = () => (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
function trySaveReportJson(report) {
  const errorResult = (error) => ({
    ok: false,
    error: (error == null ? void 0 : error.message) || String(error),
    filePath: null,
    fileName: null
  });
  try {
    const fs = require("fs");
    const path = require("path");
    const realPluginPath = fs.realpathSync(__filename);
    const pluginsDir = path.dirname(realPluginPath);
    const rootDir = path.resolve(pluginsDir, "..");
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
async function tryCopyJsonToClipboard(report) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error == null ? void 0 : error.message) || String(error) };
  }
}

// src/CSSPicker/selectors.js
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}
function getSemanticClassSelectors(el) {
  if (!(el == null ? void 0 : el.classList)) return [];
  const classes = Array.from(el.classList);
  const semanticPrefixes = classes.map((c) => {
    const match = c.match(/^([a-zA-Z]+)[_]{1,2}[a-zA-Z0-9]+$/);
    return match ? match[1] : null;
  }).filter(Boolean);
  const uniquePrefixes = Array.from(new Set(semanticPrefixes)).slice(0, 3);
  return uniquePrefixes.map((prefix) => `[class^="${prefix}_"]`);
}
function getExactClassSelectors(el) {
  if (!(el == null ? void 0 : el.classList)) return [];
  return Array.from(el.classList).map((c) => `.${CSS.escape(c)}`);
}
function buildNthOfTypePath(el, maxDepth = 6) {
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
    if (tag === "html" || tag === "body") break;
  }
  return parts.join(" > ");
}
function getAttributeSelectorCandidates(el) {
  if (!el || !(el instanceof Element)) return [];
  const ariaLabel = el.getAttribute("aria-label");
  const role = el.getAttribute("role");
  const dataTestId = el.getAttribute("data-testid");
  const candidates = [];
  ariaLabel && ariaLabel.length <= 80 && candidates.push(`${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`);
  role && candidates.push(`${el.tagName.toLowerCase()}[role="${role}"]`);
  dataTestId && candidates.push(`${el.tagName.toLowerCase()}[data-testid="${dataTestId}"]`);
  return candidates;
}
function getStableSelectorSet(el) {
  if (!el || !(el instanceof Element)) return [];
  const tag = el.tagName.toLowerCase();
  const selectors = [];
  getAttributeSelectorCandidates(el).forEach((candidate) => selectors.push(candidate));
  if (el.id) selectors.push(`#${CSS.escape(el.id)}`);
  getSemanticClassSelectors(el).forEach((s) => selectors.push(`${tag}${s}`));
  if (tag === "html") {
    selectors.push(":root", "html");
  }
  return Array.from(new Set(selectors)).filter(Boolean).slice(0, 8);
}
function getSelectorCandidates(el) {
  if (!el || !(el instanceof Element)) return [];
  const candidates = [];
  if (el.id) {
    const idSel = `#${CSS.escape(el.id)}`;
    candidates.push(idSel);
  }
  getAttributeSelectorCandidates(el).forEach((s) => candidates.push(s));
  getSemanticClassSelectors(el).forEach(
    (s) => candidates.push(`${el.tagName.toLowerCase()}${s}`)
  );
  candidates.push(buildNthOfTypePath(el));
  return Array.from(new Set(candidates)).filter(Boolean);
}
function getBestSelector(el, stableSelectors) {
  return stableSelectors[0] || getExactClassSelectors(el)[0] || (el.id ? `#${CSS.escape(el.id)}` : null);
}
var addVisibilityFlags = (flags, cs) => {
  if (cs.display === "none") {
    flags.hidden = "display:none";
    return;
  }
  if (cs.visibility === "hidden") {
    flags.hidden = "visibility:hidden";
    return;
  }
  if (parseFloat(cs.opacity) === 0) flags.hidden = "opacity:0";
};
var addLayoutFlags = (flags, cs) => {
  if (cs.pointerEvents === "none") flags.inert = "pointer-events:none";
  if (cs.overflow === "hidden" || cs.overflow === "clip") flags.clipped = cs.overflow;
  if (cs.position === "fixed" || cs.position === "sticky") flags.positioning = cs.position;
  const width = parseFloat(cs.width);
  const height = parseFloat(cs.height);
  if (width === 0 || height === 0) {
    flags.collapsed = `${Math.round(width)}x${Math.round(height)}`;
  }
  if (cs.clipPath && cs.clipPath !== "none") flags.clipPath = cs.clipPath;
};
var addInteractionFlags = (flags, el) => {
  try {
    if (el.matches(":hover")) flags.hover = true;
  } catch {
  }
  try {
    if (el.matches(":focus")) flags.focus = true;
  } catch {
  }
  try {
    if (el.matches(":focus-within")) flags.focusWithin = true;
  } catch {
  }
};
var addStateClassFlag = (flags, el) => {
  const classes = Array.from(el.classList || []);
  const stateClass = classes.find(
    (name) => /selected|active|focused|hovered|muted|unread/i.test(name)
  );
  if (stateClass) flags.stateClass = stateClass;
};
function detectElementFlags(el) {
  if (!el || !(el instanceof Element)) return {};
  const computed = window.getComputedStyle(el);
  const flags = {};
  addVisibilityFlags(flags, computed);
  addLayoutFlags(flags, computed);
  addInteractionFlags(flags, el);
  addStateClassFlag(flags, el);
  return Object.keys(flags).length ? flags : null;
}
function hasElementIdentity(el) {
  if (!el || !(el instanceof Element)) return false;
  if (el.id) return true;
  if (el.classList && el.classList.length > 0) return true;
  if (el.getAttribute("aria-label")) return true;
  if (el.getAttribute("role")) return true;
  if (el.getAttribute("data-testid")) return true;
  return false;
}
function promoteToMeaningfulAncestor(el, maxClimb = 3) {
  if (!el || hasElementIdentity(el)) return { el, promoted: false };
  let current = el;
  for (let i = 0; i < maxClimb; i++) {
    const parent = current.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) break;
    if (hasElementIdentity(parent))
      return { el: parent, promoted: true, originalTag: el.tagName.toLowerCase() };
    current = parent;
  }
  return { el, promoted: false };
}
var getChildElements = (el, max = 10) => {
  if (!el || !(el instanceof Element) || !el.children) return [];
  return Array.from(el.children).slice(0, max);
};
var getChildrenCompact = (el, max = 8) => {
  const children = getChildElements(el, max);
  return children.map((child, index) => {
    const entry = {
      index,
      summary: getElementSummary(child)
    };
    const ariaLabel = child.getAttribute("aria-label");
    if (ariaLabel) entry.ariaLabel = ariaLabel;
    const role = child.getAttribute("role");
    if (role) entry.role = role;
    const flags = detectElementFlags(child);
    if (flags) entry.flags = flags;
    const cs = window.getComputedStyle(child);
    const hasBg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
    const hasBorder = cs.borderWidth !== "0px";
    const hasShadow = cs.boxShadow !== "none";
    if (hasBg || hasBorder || hasShadow) {
      entry.style = pickComputedStylesCompact(child);
    }
    return entry;
  });
};
var getAncestryCompact = (el, maxDepth = 4) => {
  const chain = [];
  let current = el;
  for (let depth = 0; depth < maxDepth && current && current.nodeType === 1; depth++) {
    const entry = { depth, summary: getElementSummary(current) };
    const ariaLabel = current.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.length <= 80) entry.ariaLabel = ariaLabel;
    const stable = getStableSelectorSet(current);
    if (stable.length) entry.selector = stable[0];
    chain.push(entry);
    current = current.parentElement;
    if (!current || ["HTML", "BODY"].includes(current.tagName)) break;
  }
  return chain;
};
var appendElementSemanticFields = (result, el) => {
  if (el.id) result.id = el.id;
  const ariaLabel = el.getAttribute("aria-label");
  const role = el.getAttribute("role");
  if (ariaLabel) result.ariaLabel = ariaLabel;
  if (role) result.role = role;
};
var appendElementFlagsAndContext = (result, el) => {
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
function getElementDetails(el) {
  if (!el || !(el instanceof Element)) return null;
  const classList = Array.from(el.classList || []);
  const stableSelectors = getStableSelectorSet(el);
  const result = {
    summary: getElementSummary(el),
    selector: getBestSelector(el, stableSelectors),
    classList
  };
  appendElementSemanticFields(result, el);
  appendElementFlagsAndContext(result, el);
  Object.assign(result, splitComputedStyles(el));
  result.ancestry = getAncestryCompact(el, 4);
  result.appliedRules = getCompactCssRules(el, MATCH_KEYS, 30);
  if (stableSelectors.length > 1) result.altSelectors = stableSelectors.slice(1);
  const corsCount = _lastCorsBlockedCount();
  if (corsCount > 0) {
    result._warnings = [
      `${corsCount} cross-origin stylesheet(s) could not be read \u2014 some rules may be missing`
    ];
  }
  return result;
}

// src/CSSPicker/index.js
var { loadBdModuleFromPlugins } = require_bd_module_loader();
var { createToast } = require_toast();
var { isEditableTarget, matchesHotkey } = require_hotkeys();
var PLUGIN_NAME = "CSS Picker";
var PLUGIN_VERSION = "1.5.0";
var DEFAULT_SETTINGS = {
  toastTimeoutMs: 5500,
  toastIncludeComputed: true,
  toastIncludeRules: true,
  toastRuleCount: 3,
  toastMaxChars: 260,
  hotkeyEnabled: true,
  hotkey: "Ctrl+Shift+P",
  autoUpdateTheme: true,
  verifyWithDOM: true,
  verifyWithGitHub: true,
  themePath: "SoloLeveling-ClearVision.theme.css"
};
var loadSettings = () => {
  try {
    return { ...DEFAULT_SETTINGS, ...BdApi.Data.load(PLUGIN_NAME, "settings") || {} };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
};
var saveSettings = (settings) => {
  try {
    BdApi.Data.save(PLUGIN_NAME, "settings", settings);
  } catch (e) {
  }
};
var _PluginUtils = null;
try {
  _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js");
} catch (_) {
  _PluginUtils = null;
}
var _rootCtxCache = null;
var _rootCtxClassKey = "";
var getRootContext = () => {
  const root = document.documentElement;
  const body = document.body;
  const classKey = ((root == null ? void 0 : root.className) || "") + "|" + ((body == null ? void 0 : body.className) || "");
  if (_rootCtxCache && classKey === _rootCtxClassKey) return _rootCtxCache;
  const getAttrs = (node) => Array.from((node == null ? void 0 : node.attributes) || []).map((a) => ({ name: a.name, value: a.value })).slice(0, 30);
  const getClasses = (node) => Array.from((node == null ? void 0 : node.classList) || []);
  _rootCtxCache = {
    root: {
      summary: root ? getElementSummary(root) : null,
      classList: getClasses(root),
      attributes: getAttrs(root)
    },
    body: {
      summary: body ? getElementSummary(body) : null,
      classList: getClasses(body),
      attributes: getAttrs(body)
    }
  };
  _rootCtxClassKey = classKey;
  return _rootCtxCache;
};
var createOverlay = () => {
  const overlay = document.createElement("div");
  overlay.id = "css-picker-overlay";
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
var createLauncherButton = () => {
  const button = document.createElement("button");
  button.id = "css-picker-launcher";
  button.type = "button";
  button.textContent = "Start CSS Picker";
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
var createTooltip = () => {
  const tooltip = document.createElement("div");
  tooltip.id = "css-picker-tooltip";
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
  tooltip.innerHTML = `<div style="opacity: 0.85;">CSS Picker v${escapeHtml(PLUGIN_VERSION)}</div>`;
  return tooltip;
};
var updateTooltip = ({ tooltip, el }) => {
  const summary = getElementSummary(el);
  const candidates = getSelectorCandidates(el).slice(0, 3);
  const stable = getStableSelectorSet(el).slice(0, 2);
  const best = stable[0] || getExactClassSelectors(el)[0] || (el.id ? `#${CSS.escape(el.id)}` : null);
  const rootCtx = getRootContext();
  const rootClasses = (rootCtx.root.classList || []).slice(0, 4).join(" ") || "(none)";
  const bodyClasses = (rootCtx.body.classList || []).slice(0, 4).join(" ") || "(none)";
  tooltip.innerHTML = `
    <div style="display:flex; justify-content: space-between; gap: 8px; align-items: baseline;">
      <div><strong>${escapeHtml(summary)}</strong></div>
      <div style="opacity: 0.7;">click to capture, esc to cancel</div>
    </div>
    <div style="margin-top: 2px; opacity: 0.65;">CSS Picker v${escapeHtml(PLUGIN_VERSION)}</div>
    <div style="margin-top: 6px; opacity: 0.9;">
      <div style="opacity: 0.75; margin-bottom: 4px;">Best selector:</div>
      <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">${escapeHtml(
    best || "(none)"
  )}</div>
    </div>
    <div style="margin-top: 6px; opacity: 0.9;">
      <div style="opacity: 0.75; margin-bottom: 4px;">Selector candidates:</div>
      ${candidates.map(
    (s) => `<div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">${escapeHtml(
      s
    )}</div>`
  ).join("")}
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
var positionOverlayOnElement = ({ overlay, el }) => {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  overlay.style.top = `${Math.max(0, rect.top)}px`;
  overlay.style.left = `${Math.max(0, rect.left)}px`;
  overlay.style.width = `${Math.max(0, rect.width)}px`;
  overlay.style.height = `${Math.max(0, rect.height)}px`;
};
module.exports = class CSSPicker {
  start() {
    var _a, _b, _c;
    this._toast = ((_a = _PluginUtils == null ? void 0 : _PluginUtils.createToastHelper) == null ? void 0 : _a.call(_PluginUtils, "cSSPicker")) || createToast();
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
      if (this.isActive) this.deactivatePickMode();
      else this.activatePickMode();
    };
    document.addEventListener("keydown", this.onGlobalHotkeyDown, true);
    const hotkeyLabel = ((_b = this.settings) == null ? void 0 : _b.hotkeyEnabled) && ((_c = this.settings) == null ? void 0 : _c.hotkey) ? ` Hotkey: ${this.settings.hotkey}` : "";
    this._toast(`CSS Picker v${PLUGIN_VERSION} loaded.${hotkeyLabel}`, "info");
  }
  stop() {
    this.deactivatePickMode();
    this.removeLauncher();
    if (this.onGlobalHotkeyDown)
      document.removeEventListener("keydown", this.onGlobalHotkeyDown, true);
    this.onGlobalHotkeyDown = null;
  }
  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.cssText = "padding: 16px;";
    const settings = this.settings = loadSettings();
    const isChecked = (v) => v ? "checked" : "";
    const startHotkeyHint = settings.hotkeyEnabled && settings.hotkey ? ` (${escapeHtml(settings.hotkey)})` : "";
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
    panel.querySelector("#css-picker-start").addEventListener("click", () => {
      this.activatePickMode();
    });
    panel.querySelector("#css-picker-stop").addEventListener("click", () => {
      this.deactivatePickMode();
    });
    const update = (next) => {
      const merged = { ...loadSettings(), ...next };
      saveSettings(merged);
      this.settings = merged;
      this._toast("CSS Picker settings saved", "success", 2e3);
    };
    panel.querySelector("#css-picker-toast-computed").addEventListener("change", (e) => {
      update({ toastIncludeComputed: !!e.target.checked });
    });
    panel.querySelector("#css-picker-toast-rules").addEventListener("change", (e) => {
      update({ toastIncludeRules: !!e.target.checked });
    });
    panel.querySelector("#css-picker-toast-rule-count").addEventListener("change", (e) => {
      const value = Math.max(0, Math.min(6, Number(e.target.value || 0)));
      update({ toastRuleCount: value });
    });
    panel.querySelector("#css-picker-toast-timeout").addEventListener("change", (e) => {
      const value = Math.max(1500, Math.min(2e4, Number(e.target.value || 5500)));
      update({ toastTimeoutMs: value });
    });
    panel.querySelector("#css-picker-hotkey-enabled").addEventListener("change", (e) => {
      update({ hotkeyEnabled: !!e.target.checked });
    });
    panel.querySelector("#css-picker-hotkey").addEventListener("change", (e) => {
      update({ hotkey: String(e.target.value || "").trim() || DEFAULT_SETTINGS.hotkey });
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
      if (el.closest && el.closest("#css-picker-launcher")) return null;
      if (el === this.overlay || el === this.tooltip) return null;
      if (el.closest && el.closest("#css-picker-overlay")) return null;
      if (el.closest && el.closest("#css-picker-tooltip")) return null;
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
        return { ok: false, error: "No element found to capture" };
      }
      const { el: target, promoted, originalTag } = promoteToMeaningfulAncestor(rawTarget);
      const elementDetails = getElementDetails(target);
      if (promoted && originalTag) elementDetails._promotedFrom = originalTag;
      const report = {
        plugin: PLUGIN_NAME,
        version: PLUGIN_VERSION,
        element: elementDetails
      };
      const saveResult = trySaveReportJson(report);
      const clipboardResult = await tryCopyJsonToClipboard(report);
      const toastType = saveResult.ok && clipboardResult.ok && "success" || (saveResult.ok || clipboardResult.ok) && "warning" || "error";
      const settings = this.settings || loadSettings();
      const message = buildCaptureToastMessage({
        elementDetails: report.element,
        saveResult,
        clipboardResult,
        settings,
        pluginVersion: PLUGIN_VERSION
      });
      return {
        ok: true,
        toastType,
        message,
        toastTimeoutMs: settings.toastTimeoutMs || 5500
      };
    };
    this.onClick = async (event) => {
      var _a, _b;
      if (!this.isActive) return;
      if ((_b = (_a = event.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, "#css-picker-launcher")) return;
      const capture = await captureElementAtPoint(event.clientX, event.clientY);
      if (!capture.ok) {
        this._toast(capture.error || "Failed to capture element", "error");
        this.deactivatePickMode();
        return;
      }
      this._toast(capture.message, capture.toastType, capture.toastTimeoutMs);
      this.deactivatePickMode();
    };
    this.onKeyDown = (event) => {
      if (!this.isActive) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      this._toast("CSS Picker cancelled", "info");
      this.deactivatePickMode();
    };
    document.addEventListener("mousemove", this.onMouseMove, true);
    document.addEventListener("click", this.onClick, true);
    document.addEventListener("keydown", this.onKeyDown, true);
    this.updateLauncherState();
    this._toast(
      "CSS Picker active: hover and click once to capture. Press Esc to cancel.",
      "info",
      5e3
    );
  }
  deactivatePickMode() {
    if (!this.isActive) {
      this.removeArtifacts();
      return;
    }
    this.isActive = false;
    this.lastHoverElement = null;
    _rootCtxCache = null;
    _rootCtxClassKey = "";
    if (this.onMouseMove) document.removeEventListener("mousemove", this.onMouseMove, true);
    if (this.onClick) document.removeEventListener("click", this.onClick, true);
    if (this.onKeyDown) document.removeEventListener("keydown", this.onKeyDown, true);
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
    var _a, _b;
    try {
      (_a = this.overlay) == null ? void 0 : _a.remove();
    } catch (e) {
    }
    try {
      (_b = this.tooltip) == null ? void 0 : _b.remove();
    } catch (e) {
    }
    this.overlay = null;
    this.tooltip = null;
  }
  injectLauncher() {
    if (this.launcher && document.body.contains(this.launcher)) return;
    this.launcher = this.launcher || createLauncherButton();
    this._launcherClickHandler = this._launcherClickHandler || (() => {
      if (this.isActive) this.deactivatePickMode();
      else this.activatePickMode();
    });
    this.launcher.removeEventListener("click", this._launcherClickHandler);
    this.launcher.addEventListener("click", this._launcherClickHandler);
    document.body.appendChild(this.launcher);
    this.updateLauncherState();
  }
  removeLauncher() {
    var _a;
    try {
      this.launcher && this._launcherClickHandler && this.launcher.removeEventListener("click", this._launcherClickHandler);
      (_a = this.launcher) == null ? void 0 : _a.remove();
    } catch (e) {
    }
    this.launcher = null;
  }
  updateLauncherState() {
    if (!this.launcher) return;
    const settings = this.settings || loadSettings();
    const hotkeySuffix = settings.hotkeyEnabled && settings.hotkey ? ` (${settings.hotkey})` : "";
    const states = {
      active: { text: "Cancel CSS Picker", opacity: "0.82" },
      inactive: { text: "Start CSS Picker", opacity: "0.96" }
    };
    const next = this.isActive ? states.active : states.inactive;
    this.launcher.textContent = `${next.text}${hotkeySuffix}`;
    this.launcher.style.opacity = next.opacity;
  }
};
