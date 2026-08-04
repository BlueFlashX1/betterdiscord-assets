/**
 * Shared class-substitution — swaps `[class^="stem_"]` / `[class*="stem_"]`
 * attribute-substring selectors in injected theme CSS for exact, hash-fast
 * class selectors (`.stem_ab12cd`) resolved from the RUNNING client's
 * webpack registry.
 *
 * Why (perf-audit wave 3, 2026-07-13): attribute-substring selectors cannot
 * be hash-filtered by the style engine — every invalidation candidate pays a
 * string scan per rule. The theme carries ~1,100 such selector uses. Exact
 * class selectors are hash-indexed and effectively free.
 *
 * SAFETY MODEL — two independent gates, both must pass per stem:
 *
 *  Gate 1 (offline, build-time list): ALLOWLIST_STEMS below contains only
 *    stems that appear with EXACTLY ONE hash across all ~3,000 modules of
 *    the DiscordClasses dataset (github.com/itmesarah/DiscordClasses,
 *    scraped 2026-07-13, canary 577267). Ambiguous stems — `container_`
 *    (693 hashes), `scroller_` (71), `header_` (278) — are excluded:
 *    substituting one hash would silently stop matching every other module
 *    that legitimately matched the substring form.
 *
 *  Gate 2 (runtime, every start): resolveUniqueClasses() sweeps the live
 *    client's loaded webpack modules once and only substitutes a stem if
 *    the running client ALSO shows exactly one hash for it. This catches
 *    canary-vs-stable drift and future Discord refactors. Values must be a
 *    single CSS-identifier token starting with `stem_`.
 *
 *  A stem failing either gate simply keeps its substring selector — the
 *  behavior is never worse than before substitution.
 *
 * Gate 1 covers lazy-loaded modules the runtime sweep can't see (a stem
 * that LOOKS unique at sweep time could collide with a module Discord
 * loads later — the offline dataset is scraped from the full bundle set,
 * so such stems never enter the allowlist).
 */

// Generated from DiscordClasses/discordclasses.json (2026-07-13, canary 577267):
// stems used by src/SoloLevelingTheme/modules/*.css whose semantic key maps
// to exactly one hashed class across the entire dataset. Regenerate the
// analysis (see memory/scratch/selector-audit-wave2-2026-07-13.md) before
// adding entries.
//
// RE-VALIDATED 2026-08-04 against canary 587595. 55 of 62 stems still resolve
// to exactly one hash. Changes made:
//   REMOVED `contentColumn` — now TWO hashes (contentColumn__23e6b,
//     contentColumn__6d3d8). snippets.css:206,242 uses [class*="contentColumn_"]
//     to suppress scrollbars on BOTH columns; substituting one hash would have
//     silently dropped the other. This is the exact Gate 1 failure mode, and it
//     was live — Gate 2 alone would not catch it, because a client with only one
//     of the two modules loaded sees a "unique" stem and substitutes.
//   REMOVED `field` — now two hashes (field__2f582, field_db41ea).
//   ADDED `roleMention` — one hash (roleMention__75297), used by chat.css:103
//     in the HOT message-list region.
// Five stems (contentDefault, embedFull, peopleListItem, searchAnswer,
// sectionHidden) no longer appear in the dataset at all. Left in place: Gate 2
// simply finds nothing and skips them, and they may still exist in clients the
// scrape missed. Re-check them at the next revalidation.
//
// LESSON: this list decays as Discord re-hashes. Re-validate against a current
// DiscordClasses scrape periodically — Gate 2 does NOT make Gate 1 redundant,
// it only covers stems that are ambiguous in the CURRENTLY LOADED bundle.
const ALLOWLIST_STEMS = [
  'activitySection', 'anchor', 'buttonsInner', 'cardPrimary',
  'channelTextAreaDisabled', 'chatContent', 'chatLayerWrapper',
  'childWrapper', 'codeBlockText', 'connectedAccounts',
  'contentDefault', 'control', 'defaultKeybindGroup', 'edited', 'embedFull',
  'faq', 'guildBoostingSettings', 'guilds', 'guildsList',
  'headerBarInner', 'headerTop', 'itemCard', 'linkTop', 'listBox',
  'listItems', 'markup', 'membersWrap', 'messageGroupWrapper', 'misc',
  'modalContentInner', 'modeSelected', 'navScroller', 'peopleColumn',
  'peopleList', 'peopleListItem', 'popoutContentWrapper', 'profileBody',
  'quickswitcher', 'reactionTooltip', 'repliedMessage', 'roleMention',
  'rootWithShadow',
  'scrollableContainer', 'searchAnswer', 'searchResult', 'searchResultsWrap',
  'sectionHidden', 'selectDropdown', 'selectField', 'sidebarList',
  'sidebarRegion', 'tabListScroller', 'tabPanelScroller', 'themedBackground',
  'thread', 'threadSidebarOpen', 'tileChild', 'timestampInline',
  'upperContainer', 'videoGrid', 'voiceButtonsContainer',
];

// A resolved value must be one plain CSS identifier ("edited_ab12cd") —
// compound values ("x_ab12 y_cd34") or exotic characters are rejected.
const VALID_CLASS_RE = /^[A-Za-z0-9_-]+$/;

// Matches the two substring-selector shapes the theme uses. The trailing
// `_"` keeps global semantic classes like [class*="theme-dark"] untouched.
const CLASS_ATTR_RE = /\[class[\^*]="([A-Za-z0-9]+)_"\]/g;

/**
 * One sweep over the loaded webpack registry. Returns { stem: className }
 * for every allowlisted stem the live client resolves to exactly one hash.
 * Costs one module-registry pass (~tens of ms); call it once per start,
 * off the critical path.
 */
function resolveUniqueClasses() {
  const stemSet = new Set(ALLOWLIST_STEMS);
  const found = new Map();
  try {
    // Collector filter: visits every loaded module, always returns false so
    // nothing is retained by BdApi. Per-module try/catch — class modules are
    // plain string maps, but unrelated modules may have throwing getters.
    BdApi.Webpack.getModule((m) => {
      if (m && typeof m === 'object') {
        try {
          for (const k in m) {
            if (!stemSet.has(k)) continue;
            const v = m[k];
            if (typeof v === 'string' && v.startsWith(k + '_') && VALID_CLASS_RE.test(v)) {
              let vals = found.get(k);
              if (!vals) found.set(k, (vals = new Set()));
              vals.add(v);
            }
          }
        } catch (_) {}
      }
      return false;
    }, { first: false, searchExports: false });
  } catch (_) {
    return null;
  }

  const map = {};
  for (const [stem, vals] of found) {
    if (vals.size === 1) map[stem] = vals.values().next().value;
  }
  return Object.keys(map).length ? map : null;
}

/**
 * Rewrite substring selectors to exact class selectors using a map from
 * resolveUniqueClasses(). Unresolved stems keep their substring form.
 */
function substituteClasses(css, map) {
  if (!css || !map) return css;
  return css.replace(CLASS_ATTR_RE, (full, stem) => (map[stem] ? '.' + map[stem] : full));
}

module.exports = {
  ALLOWLIST_STEMS,
  resolveUniqueClasses,
  substituteClasses,
};
