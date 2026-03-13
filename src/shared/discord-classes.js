/**
 * Shared Discord class resolver — centralised Webpack class lookups with
 * memoisation and wildcard fallbacks.
 *
 * Usage (in any plugin):
 *   const dc = require("../shared/discord-classes");
 *   const sel = dc.sel;  // pre-resolved selector map
 *   // sel.chatContent   → ".chatContent_a1b2c3"  (or '[class*="chatContent_"]')
 *   // sel.messageListItem → ".messageListItem_x9y8" (or '[class*="messageListItem_"]')
 *
 * For CSS injection, use dc.cls (raw class name without the dot) or dc.sel (with dot).
 * For querySelector, use dc.sel (includes the dot prefix for class selectors).
 *
 * The resolver runs lazily on first access. If Webpack modules aren't available yet
 * (plugin loaded before Discord finishes hydrating), call dc.refresh() later.
 */

const { Webpack } = BdApi;

// ─── Internal cache ──────────────────────────────────────────────────────────
let _resolved = false;
const _cls = {};   // raw class names  (e.g. "chatContent_a1b2c3")
const _sel = {};   // CSS selectors     (e.g. ".chatContent_a1b2c3")
const _fb  = {};   // fallback selectors (e.g. '[class*="chatContent_"]')

// ─── Module definitions ──────────────────────────────────────────────────────
// Each entry: [webpackFilterKeys, propertyName, fallbackSelector]
// webpackFilterKeys: passed to Webpack.getByKeys() to find the module
//   — use null to fall back to getModule() scan (for stems where getByKeys
//     returns the wrong module, e.g. "author")
// propertyName: the export on that module containing the CSS class string
// fallbackSelector: attribute wildcard selector used when Webpack fails

const DEFS = {
  // ── Layout / Panels ──
  chatContent:         [["chatContent"],         "chatContent",         '[class*="chatContent_"]'],
  sidebar:             [["sidebar"],             "sidebar",             '[class*="sidebar_"]'],
  sidebarList:         [["sidebar", "sidebarList"], "sidebarList",      '[class*="sidebar_"]'],
  membersWrap:         [["membersWrap"],          "membersWrap",        '[class*="membersWrap_"]'],
  members:             [["membersWrap"],          "members",            '[class*="members_"]'],
  container:           [["membersWrap"],          "container",          '[class*="container_"]'],
  privateChannels:     [["privateChannels"],      "privateChannels",    '[class*="privateChannels_"]'],
  userProfileOuter:    [["userProfileOuter"],     "userProfileOuter",   '[class*="userProfileOuter_"]'],
  searchResultsWrap:   [["searchResultsWrap"],    "searchResultsWrap",  '[class*="searchResultsWrap_"]'],

  // ── Scrolling ──
  scroller:            [["scroller", "thin"],     "scroller",           '[class*="scroller_"]'],
  scrollerBase:        [["scrollerBase"],         "scrollerBase",       '[class*="scrollerBase_"]'],
  thin:                [["scroller", "thin"],     "thin",               '[class*="thin_"]'],

  // ── Messages ──
  messageListItem:     [["messageListItem"],      "messageListItem",    '[class*="messageListItem_"]'],
  message:             [["message", "groupStart"], "message",           '[class*="message_"]'],
  groupStart:          [["message", "groupStart"], "groupStart",        '[class*="groupStart_"]'],
  cozy:                [["message", "cozy"],       "cozy",              '[class*="cozy_"]'],
  messageContent:      [["messageContent"],       "messageContent",     '[class*="messageContent_"]'],
  markup:              [["markup"],               "markup",             '[class*="markup_"]'],
  mentioned:           [["mentioned"],            "mentioned",          '[class*="mentioned_"]'],

  // ── Message parts ──
  author:              [null,                     "author",             '[class*="author_"]'],
  username:            [["username"],             "username",           '[class*="username_"]'],
  timestamp:           [["timestamp"],            "timestamp",          '[class*="timestamp_"]'],
  avatar:              [["avatar", "wrapper"],     "avatar",            '[class*="avatar_"]'],
  repliedMessage:      [["repliedMessage"],       "repliedMessage",     '[class*="repliedMessage_"]'],
  embed:               [["embed"],               "embed",              '[class*="embed_"]'],
  attachment:          [["attachment"],           "attachment",         '[class*="attachment_"]'],
  embedWrapper:        [["embedWrapper"],         "embedWrapper",       '[class*="embedWrapper_"]'],
  botTag:              [["botTag"],               "botTag",             '[class*="botTag_"]'],

  // ── Header / Toolbar ──
  toolbar:             [["toolbar"],              "toolbar",            '[class*="toolbar_"]'],
  titleWrapper:        [["titleWrapper"],         "titleWrapper",       '[class*="titleWrapper_"]'],
  title:               [["title", "lineClamp"],    "title",             '[class*="title_"]'],
  channelHeader:       [["channelHeader"],        "channelHeader",      '[class*="channelHeader_"]'],

  // ── Input / Composer ──
  channelTextArea:     [["channelTextArea"],      "channelTextArea",    '[class*="channelTextArea_"]'],
  textContainer:       [["textContainer"],        "textContainer",      '[class*="textContainer_"]'],
  slateContainer:      [["slateContainer"],       "slateContainer",     '[class*="slateContainer_"]'],
  editor:              [["editor"],               "editor",             '[class*="editor_"]'],
  channelBottomBarArea:[["channelBottomBarArea"], "channelBottomBarArea",'[class*="channelBottomBarArea_"]'],
  scrollableContainer: [["scrollableContainer"],  "scrollableContainer",'[class*="scrollableContainer_"]'],
  inner:               [["inner"],                "inner",              '[class*="inner_"]'],

  // ── User panel / profile ──
  user:                [["user"],                 "user",               '[class*="user_"]'],
  nameTag:             [["nameTag"],              "nameTag",            '[class*="nameTag_"]'],
  withTagAsButton:     [["withTagAsButton"],      "withTagAsButton",    '[class*="withTagAsButton_"]'],
  panelSubtextContainer: [["panelSubtextContainer"], "panelSubtextContainer", '[class*="panelSubtextContainer_"]'],
  panelTitleContainer: [["panelTitleContainer"],  "panelTitleContainer", '[class*="panelTitleContainer_"]'],

  // ── App layout ──
  base:                [["base", "content"],       "base",              '[class*="base_"]'],
  content:             [["base", "content"],       "content",           '[class*="content_"]'],
  layers:              [["layers"],               "layers",             '[class*="layers_"]'],
  chat:                [["chat"],                 "chat",               '[class*="chat_"]'],
  chatLayerWrapper:    [["chatLayerWrapper"],     "chatLayerWrapper",    '[class*="chatLayerWrapper_"]'],
  layerContainer:      [["layerContainer"],       "layerContainer",      '[class*="layerContainer_"]'],
  panels:              [["panels"],               "panels",              '[class*="panels_"]'],

  // ── Settings ──
  userSettings:        [["standardSidebarView"],  "standardSidebarView", '[class*="userSettings_"]'],
  standardSidebarView: [["standardSidebarView"],  "standardSidebarView", '[class*="standardSidebarView_"]'],
  settingsContainer:   [["settingsContainer"],    "settingsContainer",   '[class*="settingsContainer_"]'],
  searchBar:           [["searchBar"],            "searchBar",           '[class*="searchBar_"]'],
  privateChannelsHeaderContainer: [["privateChannelsHeaderContainer"], "privateChannelsHeaderContainer", '[class*="privateChannelsHeaderContainer_"]'],

  // ── Messages (extended) ──
  messageList:         [["messageList"],            "messageList",         '[class*="messageList_"]'],
  messageContainer:    [["messageContainer"],       "messageContainer",    '[class*="messageContainer_"]'],
  messageGroupWrapper: [["messageGroupWrapper"],    "messageGroupWrapper", '[class*="messageGroupWrapper_"]'],
  messages:            [["messages"],               "messages",            '[class*="messages_"]'],
  messagesWrapper:     [["messagesWrapper"],        "messagesWrapper",     '[class*="messagesWrapper_"]'],
  scrollerInner:       [["scrollerInner"],          "scrollerInner",       '[class*="scrollerInner_"]'],
  systemMessage:       [["systemMessage"],          "systemMessage",       '[class*="systemMessage_"]'],
  headerText:          [["headerText"],             "headerText",          '[class*="headerText_"]'],

  // ── Guilds / Dock ──
  guilds:              [["guilds", "wrapper"],      "guilds",             '[class*="guilds_"]'],
  wrapper:             [["guilds", "wrapper"],      "wrapper",            '[class*="wrapper_"]'],

  // ── Forms / Composer ──
  form:                [["form"],                  "form",                '[class*="form_"]'],
  textArea:            [["textArea"],              "textArea",            '[class*="textArea_"]'],
  slateTextArea:       [["slateTextArea"],         "slateTextArea",       '[class*="slateTextArea_"]'],

  // ── Alerts / Badges / UI ──
  button:              [["button"],               "button",              '[class*="button_"]'],
  listItem:            [["listItem"],              "listItem",            '[class*="listItem_"]'],
  numberBadge:         [["numberBadge"],           "numberBadge",         '[class*="numberBadge_"]'],
  mentionsBadge:       [["mentionsBadge"],         "mentionsBadge",       '[class*="mentionsBadge_"]'],
  pill:                [["pill"],                  "pill",                '[class*="pill_"]'],

  // ── Probed 2026-03-13 (8 new stems) ──
  app:                 [null,                      "app",                 '[class*="app_"]'],
  bot:                 [["bot"],                   "bot",                 '[class*="bot_"]'],
  botText:             [["botText"],               "botText",             '[class*="botText_"]'],
  channel:             [["channel"],               "channel",             '[class*="channel_"]'],
  header:              [["header"],                "header",              '[class*="header_"]'],
  name:                [null,                      "name",                '[class*="name_"]'],
  text:                [["text"],                  "text",                '[class*="text_"]'],
  thread:              [["thread"],                "thread",              '[class*="thread_"]'],
};

// ─── Resolver ────────────────────────────────────────────────────────────────

function _resolve() {
  // Module-level cache: group DEFS by their filterKeys to avoid redundant
  // Webpack lookups (many properties share the same module).
  const moduleCache = new Map();

  for (const [name, [filterKeys, prop, fallback]] of Object.entries(DEFS)) {
    _fb[name] = fallback;

    let mod;
    if (filterKeys === null) {
      // Scan mode: getByKeys returns wrong module for this stem.
      // Use getModule with a property value test instead.
      try {
        mod = Webpack.getModule(m =>
          m?.[prop] && typeof m[prop] === "string" && /^\w+_\w{4,}/.test(m[prop])
        ) || null;
      } catch (_) {
        mod = null;
      }
    } else {
      const cacheKey = filterKeys.join("|");
      mod = moduleCache.get(cacheKey);
      if (mod === undefined) {
        try {
          mod = Webpack.getByKeys(...filterKeys) || null;
        } catch (_) {
          mod = null;
        }
        moduleCache.set(cacheKey, mod);
      }
    }

    const cls = mod?.[prop];
    if (cls && typeof cls === "string" && !cls.includes(" ")) {
      _cls[name] = cls;
      _sel[name] = `.${cls}`;
    } else {
      _cls[name] = "";
      _sel[name] = fallback;
    }
  }

  _resolved = true;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Lazily-resolved selector map. First access triggers Webpack lookups. */
const sel = new Proxy(_sel, {
  get(target, prop) {
    if (!_resolved) _resolve();
    return target[prop];
  },
});

/** Raw class names (without dot prefix). Empty string when unresolved. */
const cls = new Proxy(_cls, {
  get(target, prop) {
    if (!_resolved) _resolve();
    return target[prop];
  },
});

/** Fallback wildcard selectors (always available, no Webpack needed). */
const fb = new Proxy(_fb, {
  get(target, prop) {
    if (!_resolved) _resolve();
    return target[prop];
  },
});

/**
 * Force re-resolve all classes. Call this if plugin loads before Discord
 * finishes hydrating and selectors returned fallbacks.
 */
function refresh() {
  _resolved = false;
  _resolve();
}

/**
 * Returns true if the given name was resolved via Webpack (not a fallback).
 * Useful for deciding whether to use a fast `.className` path or a slower
 * fallback querySelector chain.
 */
function isResolved(name) {
  if (!_resolved) _resolve();
  return !!_cls[name];
}

/**
 * Build a CSS selector string for injection. Returns the resolved `.className`
 * selector when available, otherwise the wildcard fallback.
 * Optionally accepts a prefix (e.g. "body.my-class ") and suffix (e.g. "::before").
 */
function cssSelector(name, prefix = "", suffix = "") {
  if (!_resolved) _resolve();
  return `${prefix}${_sel[name]}${suffix}`;
}

/**
 * querySelector helper: tries resolved class first, then fallback.
 * @param {Element} root - DOM element to query within
 * @param {string} name - logical name from DEFS
 * @returns {Element|null}
 */
function query(root, name) {
  if (!_resolved) _resolve();
  if (_cls[name]) {
    const el = root.querySelector(`.${_cls[name]}`);
    if (el) return el;
  }
  return root.querySelector(_fb[name]);
}

/**
 * querySelectorAll helper: tries resolved class first, then fallback.
 * @param {Element} root - DOM element to query within
 * @param {string} name - logical name from DEFS
 * @returns {NodeList}
 */
function queryAll(root, name) {
  if (!_resolved) _resolve();
  if (_cls[name]) {
    const list = root.querySelectorAll(`.${_cls[name]}`);
    if (list.length) return list;
  }
  return root.querySelectorAll(_fb[name]);
}

module.exports = { sel, cls, fb, refresh, isResolved, cssSelector, query, queryAll, DEFS };
