/**
 * selectors.js — Element selector utilities for CSSPicker.
 *
 * Responsible for generating CSS selectors, element summaries,
 * node info, detail snapshots, element flag detection, identity
 * checks, ancestor promotion, and HTML escaping / truncation helpers.
 */

/* global CSS, Element */

// ── Helpers ──────────────────────────────────────────────────────

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

export function truncateMiddle(value, max = 90) {
  const str = String(value ?? "");
  if (str.length <= max) return str;
  const left = Math.max(10, Math.floor(max * 0.6));
  const right = Math.max(8, max - left - 3);
  return `${str.slice(0, left)}...${str.slice(-right)}`;
}

// ── Element summary / node info ──────────────────────────────────

export function getElementSummary(el) {
  if (!el) return "unknown";
  const tag = el.tagName?.toLowerCase?.() || "unknown";
  const id = el.id ? `#${el.id}` : "";
  const className =
    typeof el.className === "string" && el.className.trim()
      ? `.${el.className.trim().split(/\s+/)[0]}`
      : "";
  return `${tag}${id}${className}`;
}

export function getElementNodeInfo(el) {
  if (!el || !(el instanceof Element)) return null;

  const tagName = el.tagName.toLowerCase();
  const id = el.id || null;
  const classList = Array.from(el.classList || []);
  const role = el.getAttribute("role") || null;
  const ariaLabel = el.getAttribute("aria-label") || null;

  return {
    summary: getElementSummary(el),
    tagName,
    id,
    classList,
    role,
    ariaLabel,
  };
}

// ── Class-based selector generators ──────────────────────────────

export function getSemanticClassSelectors(el) {
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
}

export function getExactClassSelectors(el) {
  if (!el?.classList) return [];
  return Array.from(el.classList).map((c) => `.${CSS.escape(c)}`);
}

// ── Structural selector generators ───────────────────────────────

export function buildNthOfTypePath(el, maxDepth = 6) {
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

export function getAttributeSelectorCandidates(el) {
  if (!el || !(el instanceof Element)) return [];

  const ariaLabel = el.getAttribute("aria-label");
  const role = el.getAttribute("role");
  const dataTestId = el.getAttribute("data-testid");

  const candidates = [];

  // Prefer stable attributes (may be localized for aria-label, but still useful).
  ariaLabel &&
    ariaLabel.length <= 80 &&
    candidates.push(`${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`);
  role && candidates.push(`${el.tagName.toLowerCase()}[role="${role}"]`);
  dataTestId && candidates.push(`${el.tagName.toLowerCase()}[data-testid="${dataTestId}"]`);

  return candidates;
}

// Favor stable selectors over hashed class names
export function getStableSelectorSet(el) {
  if (!el || !(el instanceof Element)) return [];
  const tag = el.tagName.toLowerCase();
  const selectors = [];

  // Reuse shared attribute extraction to avoid duplicate DOM reads/formatting logic.
  getAttributeSelectorCandidates(el).forEach((candidate) => selectors.push(candidate));

  // id
  if (el.id) selectors.push(`#${CSS.escape(el.id)}`);

  // semantic class prefixes
  getSemanticClassSelectors(el).forEach((s) => selectors.push(`${tag}${s}`));

  // root fallbacks if applicable
  if (tag === "html") {
    selectors.push(":root", "html");
  }

  return Array.from(new Set(selectors)).filter(Boolean).slice(0, 8);
}

export function getSelectorCandidates(el) {
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
}

export function getBestSelector(el, stableSelectors) {
  return (
    stableSelectors[0] ||
    getExactClassSelectors(el)[0] ||
    (el.id ? `#${CSS.escape(el.id)}` : null)
  );
}

// ── Element state flags ──────────────────────────────────────────

const addVisibilityFlags = (flags, cs) => {
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

const addLayoutFlags = (flags, cs) => {
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

const addInteractionFlags = (flags, el) => {
  try {
    if (el.matches(":hover")) flags.hover = true;
  } catch {}
  try {
    if (el.matches(":focus")) flags.focus = true;
  } catch {}
  try {
    if (el.matches(":focus-within")) flags.focusWithin = true;
  } catch {}
};

const addStateClassFlag = (flags, el) => {
  const classes = Array.from(el.classList || []);
  const stateClass = classes.find((name) =>
    /selected|active|focused|hovered|muted|unread/i.test(name)
  );
  if (stateClass) flags.stateClass = stateClass;
};

export function detectElementFlags(el) {
  if (!el || !(el instanceof Element)) return {};
  const computed = window.getComputedStyle(el);
  const flags = {};
  addVisibilityFlags(flags, computed);
  addLayoutFlags(flags, computed);
  addInteractionFlags(flags, el);
  addStateClassFlag(flags, el);
  return Object.keys(flags).length ? flags : null;
}

// ── Identity & promotion ─────────────────────────────────────────

// Check if element has any meaningful identity (classes, ID, aria-label, role, data-testid)
export function hasElementIdentity(el) {
  if (!el || !(el instanceof Element)) return false;
  if (el.id) return true;
  if (el.classList && el.classList.length > 0) return true;
  if (el.getAttribute("aria-label")) return true;
  if (el.getAttribute("role")) return true;
  if (el.getAttribute("data-testid")) return true;
  return false;
}

// When elementFromPoint lands on a bare wrapper (no classes, no ID, etc.),
// climb up to the nearest meaningful parent so the pick is actionable.
export function promoteToMeaningfulAncestor(el, maxClimb = 3) {
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

// ── Full element details snapshot ────────────────────────────────

import {
  splitComputedStyles,
  extractInlineStyles,
  getCompactCssRules,
  pickComputedStylesCompact,
  MATCH_KEYS,
  _lastCorsBlockedCount,
} from "./inspection.js";

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
    const ariaLabel = child.getAttribute("aria-label");
    if (ariaLabel) entry.ariaLabel = ariaLabel;
    const role = child.getAttribute("role");
    if (role) entry.role = role;
    const flags = detectElementFlags(child);
    if (flags) entry.flags = flags;
    // Only include compact style if child has visible styling worth knowing
    const cs = window.getComputedStyle(child);
    const hasBg =
      cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
    const hasBorder = cs.borderWidth !== "0px";
    const hasShadow = cs.boxShadow !== "none";
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

const appendElementSemanticFields = (result, el) => {
  if (el.id) result.id = el.id;
  const ariaLabel = el.getAttribute("aria-label");
  const role = el.getAttribute("role");
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

export function getElementDetails(el) {
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

  const corsCount = _lastCorsBlockedCount();
  if (corsCount > 0) {
    result._warnings = [
      `${corsCount} cross-origin stylesheet(s) could not be read — some rules may be missing`,
    ];
  }
  return result;
}
