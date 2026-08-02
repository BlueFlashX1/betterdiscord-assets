/**
 * Stamps `body[data-sl-dg-settings]` with whether a settings/modal layer is
 * open, so the boss-bar hide rules can match a hash-fast attribute instead of
 * `body:has(...)`.
 *
 * Why: `body:has(<selector>)` makes the style engine re-test whether <body>
 * still matches on DOM mutations anywhere in the document. In a chat client
 * that is continuous, and it inflates style-recalc + forced-layout — the
 * dominant cost in the AAPerfSentinel report. Moving the match into JS that
 * runs only when a layer mounts/unmounts turns a per-mutation tax into a
 * handful of querySelector calls per settings open/close.
 *
 * Same conversion as shared/toolbar-tags.js; see DKB
 * bd-has-selector-to-data-attr-tagging for the pattern and for which `:has()`
 * forms are NOT worth converting.
 *
 * Scope note: the observer watches the layer container, NOT document.body.
 * Layers mount rarely (modals, settings), unlike the message list, so subtree
 * observation here is cheap — and it is required, because a layer element can
 * mount empty and populate its children a frame later.
 */

const dc = require('../shared/discord-classes');

const ATTR = 'data-sl-dg-settings';

let observer = null;
let rafPending = false;
let lastValue = null;

function isSettingsLayerOpen() {
  // aria-label first: it survives Discord's hashed-class renames, which is
  // the resilience the :has() rules were originally chosen for.
  return Boolean(
    document.querySelector("nav[aria-label*='Settings' i]") ||
    document.querySelector(dc.sel.userSettings) ||
    document.querySelector(dc.sel.settingsContainer) ||
    document.querySelector(dc.sel.standardSidebarView)
  );
}

function applyTag() {
  const open = isSettingsLayerOpen();
  const next = open ? '1' : '0';
  // Only write on change: an unconditional attribute write invalidates style
  // for the whole document, which is the cost this module exists to remove.
  if (next === lastValue) return;
  lastValue = next;
  document.body?.setAttribute(ATTR, next);
}

function scheduleApply() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    applyTag();
  });
}

function resolveLayerContainer() {
  return (
    document.querySelector(dc.sel.layerContainer) ||
    document.querySelector(dc.sel.layers) ||
    document.body
  );
}

module.exports = {
  startSettingsLayerTag() {
    this.stopSettingsLayerTag();

    applyTag();

    const target = resolveLayerContainer();
    if (!target) return;

    observer = new MutationObserver(scheduleApply);
    observer.observe(target, { childList: true, subtree: true });
  },

  stopSettingsLayerTag() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    rafPending = false;
    lastValue = null;
    document.body?.removeAttribute(ATTR);
  },
};
