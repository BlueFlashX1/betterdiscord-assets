/**
 * Shared toolbar child tagger — stamps `data-sl-tb="<identity>"` on the
 * DIRECT children of every visible channel-header toolbar so theme CSS
 * (SoloLevelingTheme modules/toolbar-org.css) can match cheap
 * attribute-equality selectors instead of `:has()` / `[aria-label*="…" i]`
 * substring selectors.
 *
 * Why (perf-audit 2026-07-13): `:has()` rules with universal child anchors
 * and case-insensitive substring arguments force the style engine to
 * re-check those arguments during invalidation on ordinary DOM churn,
 * document-wide, on every mutation. Tagging moves that matching into JS,
 * where it runs ONCE per toolbar render (a loop over ~15 children), and
 * the CSS side becomes a hash-fast attribute-equality match.
 *
 * Triggers — no polling, no new global observers:
 *   - shared/header-toolbar.js watchToolbar() hub (CHANNEL_SELECT,
 *     VOICE_STATE_UPDATES, toolbar mount/unmount, visibility return)
 *   - one childList-only MutationObserver attached to each toolbar node,
 *     covering plugin icons injected AFTER the toolbar mounted (the hub's
 *     #app-mount observer only fires when a toolbar element itself is
 *     added/removed, not for its children)
 *
 * Consumed by SoloLevelingTheme.start(); refcounted so a future second
 * consumer can co-install safely.
 */

const { getAllChannelHeaderToolbars, watchToolbar } = require('./header-toolbar');

const TAG_ATTR = 'data-sl-tb';

// Exact-ID identities, checked first. The child either IS the element with
// this id (SL plugins appendChild directly) or wraps it (Discord natives /
// defensive re-wrap case). Order mirrors modules/toolbar-org.css groups.
const ID_TAGS = [
  ['cbg-toggle-button', 'cbg'],
  ['sls-header-stats-button', 'sls'],
  ['shadow-senses-header-icon', 'senses'],
  ['dungeons-header-widget', 'dungeons'],
  ['eq-header-icon', 'eq'],
  ['itemvault-header-icon', 'itemvault'],
  ['se-swirl-icon', 'se'],
  ['ra-toolbar-icon', 'ra'],
];

// aria-label identities (lowercased substring match on the child's own
// label or any labeled descendant). Substrings chosen to cover every
// Discord label variant the old CSS matched:
//   'mute channel'  covers "Mute Channel" AND "Unmute Channel"
//   'member list'   covers "Member List" / "Hide Member List" / "Show Member List"
const LABEL_TAGS = [
  [['start voice call'], 'voice-call'],
  [['start video call'], 'video-call'],
  [['thread'], 'threads'],
  [['notification', 'mute channel'], 'notifications'],
  [['pinned'], 'pins'],
  [['member list', 'show members'], 'members'],
  [['search'], 'search'],
];

// Cap descendant label scans — toolbar children are a button plus at most a
// couple of labeled inner elements; anything past that is not a toolbar icon.
const MAX_LABELED_DESCENDANTS = 6;

let _refs = 0;
let _unwatch = null;
let _childObserver = null;
let _observedToolbars = new WeakSet();
let _retagScheduled = false;

function _identityFor(child) {
  for (const [id, tag] of ID_TAGS) {
    if (child.id === id || child.querySelector('#' + id)) return tag;
  }

  const labels = [];
  const own = child.getAttribute('aria-label');
  if (own) labels.push(own.toLowerCase());
  const labeled = child.querySelectorAll('[aria-label]');
  const n = Math.min(labeled.length, MAX_LABELED_DESCENDANTS);
  for (let i = 0; i < n; i++) {
    const l = labeled[i].getAttribute('aria-label');
    if (l) labels.push(l.toLowerCase());
  }

  for (const [needles, tag] of LABEL_TAGS) {
    for (const label of labels) {
      for (const needle of needles) {
        if (label.includes(needle)) return tag;
      }
    }
  }
  return null;
}

function _applyTags() {
  try {
    for (const toolbar of getAllChannelHeaderToolbars()) {
      for (const child of toolbar.children) {
        const tag = _identityFor(child);
        if (tag) {
          if (child.getAttribute(TAG_ATTR) !== tag) child.setAttribute(TAG_ATTR, tag);
        } else if (child.hasAttribute(TAG_ATTR)) {
          child.removeAttribute(TAG_ATTR);
        }
      }
      // Attribute writes don't fire a childList observer, so observing the
      // toolbar we just tagged cannot loop.
      if (_childObserver && !_observedToolbars.has(toolbar)) {
        _observedToolbars.add(toolbar);
        _childObserver.observe(toolbar, { childList: true });
      }
    }
  } catch (_) {}
}

// Coalesce observer bursts into one retag per frame. Hidden-tab mutations
// are skipped; the watchToolbar hub re-fires callbacks on visibility return.
function _scheduleRetag() {
  if (_retagScheduled || document.hidden) return;
  _retagScheduled = true;
  requestAnimationFrame(() => {
    _retagScheduled = false;
    _applyTags();
  });
}

/**
 * Install the toolbar tagger. Refcounted — only the first install creates
 * the watcher/observer. Returns a release function for stop()/cleanup.
 */
function installToolbarTags() {
  _refs++;
  if (_refs === 1) {
    try {
      _childObserver = new MutationObserver(_scheduleRetag);
    } catch (_) {
      _childObserver = null;
    }
    _unwatch = watchToolbar(_applyTags);
  }

  return function uninstallToolbarTags() {
    _refs = Math.max(0, _refs - 1);
    if (_refs !== 0) return;
    if (_unwatch) {
      try { _unwatch(); } catch (_) {}
      _unwatch = null;
    }
    if (_childObserver) {
      try { _childObserver.disconnect(); } catch (_) {}
      _childObserver = null;
    }
    _observedToolbars = new WeakSet();
    try {
      for (const el of document.querySelectorAll('[' + TAG_ATTR + ']')) {
        el.removeAttribute(TAG_ATTR);
      }
    } catch (_) {}
  };
}

module.exports = {
  TAG_ATTR,
  installToolbarTags,
};
