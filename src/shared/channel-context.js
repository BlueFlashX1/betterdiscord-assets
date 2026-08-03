/**
 * Shared channel-context helpers used across plugins to gate UI behaviour
 * (e.g. hide toolbar icons when the user opens a voice-channel chat panel).
 *
 * Discord channel types reference:
 *   0  GUILD_TEXT
 *   1  DM
 *   2  GUILD_VOICE
 *   3  GROUP_DM
 *   4  GUILD_CATEGORY
 *   5  GUILD_ANNOUNCEMENT
 *   10 ANNOUNCEMENT_THREAD
 *   11 PUBLIC_THREAD
 *   12 PRIVATE_THREAD
 *   13 GUILD_STAGE_VOICE
 *   15 GUILD_FORUM
 *   16 GUILD_MEDIA
 */

const { acquireDispatcher } = require('./dispatcher');

function _getStores() {
  try {
    const Webpack = BdApi?.Webpack;
    if (!Webpack) return null;
    const SelectedChannelStore = Webpack.getStore("SelectedChannelStore");
    const ChannelStore = Webpack.getStore("ChannelStore");
    if (!SelectedChannelStore || !ChannelStore) return null;
    return { SelectedChannelStore, ChannelStore };
  } catch (_) {
    return null;
  }
}

function getCurrentChannel() {
  const stores = _getStores();
  if (!stores) return null;
  try {
    const channelId = stores.SelectedChannelStore.getChannelId?.();
    if (!channelId) return null;
    return stores.ChannelStore.getChannel?.(channelId) || null;
  } catch (_) {
    return null;
  }
}

/**
 * True when the user is currently viewing a voice or stage channel.
 * Four detection paths — any positive triggers hide.
 */
function isVoiceChannelChat() {
  const Webpack = BdApi?.Webpack;

  // 1) Primary: selected channel type === voice or stage
  let path1Resolved = false;
  try {
    const channel = getCurrentChannel();
    if (channel) {
      path1Resolved = true;
      const type = Number(channel.type);
      if (type === 2 || type === 13) return true;
    }
  } catch (_) {}

  // 2) URL-based: most reliable — Discord's URL is /channels/<g>/<id>
  //    whenever a channel is being viewed. Look up that ID in
  //    ChannelStore and check its type. Bypasses any
  //    SelectedChannelStore staleness (path 1 can lag one tick behind the
  //    URL right after a channel switch, so this always runs even when
  //    path 1 resolved — do NOT short-circuit path 2 on a path-1 negative).
  let path2Resolved = false;
  try {
    if (typeof window !== "undefined" && window.location && Webpack) {
      const m = String(window.location.pathname || "").match(/^\/channels\/(?:@me|\d+)\/(\d+)/);
      if (m && m[1]) {
        const ChannelStore = Webpack.getStore("ChannelStore");
        const ch = ChannelStore?.getChannel?.(m[1]);
        const t = Number(ch?.type);
        if (!Number.isNaN(t)) {
          path2Resolved = true;
          if (t === 2 || t === 13) return true;
        }
      }
    }
  } catch (_) {}

  // Both independent sources (store + URL) resolved a channel and agree
  // it's not voice/stage — skip paths 3/4 (voice-connect cross-check and
  // the document-wide DOM scan), which exist for when 1+2 can't resolve
  // or can't agree, not to override a confirmed non-voice result.
  if (path1Resolved && path2Resolved) return false;

  // 3) Voice-connect state: user is connected to a VC AND the currently
  //    selected channel matches that VC.
  try {
    if (Webpack) {
      const VoiceStateStore = Webpack.getStore("VoiceStateStore");
      const UserStore = Webpack.getStore("UserStore");
      const SelectedChannelStore = Webpack.getStore("SelectedChannelStore");
      const userId = UserStore?.getCurrentUser?.()?.id;
      if (userId && VoiceStateStore?.getVoiceStateForUser && SelectedChannelStore?.getChannelId) {
        const voiceState = VoiceStateStore.getVoiceStateForUser(userId);
        const voiceChannelId = voiceState?.channelId;
        const selectedId = SelectedChannelStore.getChannelId();
        if (voiceChannelId && selectedId && voiceChannelId === selectedId) return true;
      }
    }
  } catch (_) {}

  // 4) DOM-marker fallback
  try {
    const vcMarkers = document.querySelectorAll(
      '[class*="voiceChannelChat"], [class*="voiceChannel_"][class*="chat_"]'
    );
    for (const el of vcMarkers) {
      if (el.offsetParent !== null) return true;
    }
  } catch (_) {}

  return false;
}

/**
 * Diagnostic helper — call from DevTools console to see what each
 * detection path returns. Useful when isVoiceChannelChat returns
 * the wrong value for a particular VC context.
 *
 * Usage:  BdApi.Plugins.get("ItemVault").instance._debugVCDetection?.()
 *   or paste the body of this function directly into the console.
 */
function debugVoiceChannelChat() {
  const Webpack = BdApi?.Webpack;
  const out = { final: null, paths: {} };

  try {
    const channel = getCurrentChannel();
    out.paths.selectedChannelType = {
      id: channel?.id,
      type: channel?.type,
      name: channel?.name,
      hit: channel && (channel.type === 2 || channel.type === 13),
    };
  } catch (e) { out.paths.selectedChannelType = { error: String(e) }; }

  try {
    const path = String(window.location.pathname || "");
    const m = path.match(/^\/channels\/(?:@me|\d+)\/(\d+)/);
    const ChannelStore = Webpack?.getStore("ChannelStore");
    const ch = m && m[1] ? ChannelStore?.getChannel?.(m[1]) : null;
    out.paths.urlBased = {
      url: path,
      extractedId: m?.[1] || null,
      type: ch?.type,
      name: ch?.name,
      hit: ch && (ch.type === 2 || ch.type === 13),
    };
  } catch (e) { out.paths.urlBased = { error: String(e) }; }

  try {
    const VoiceStateStore = Webpack?.getStore("VoiceStateStore");
    const UserStore = Webpack?.getStore("UserStore");
    const SelectedChannelStore = Webpack?.getStore("SelectedChannelStore");
    const userId = UserStore?.getCurrentUser?.()?.id;
    const voiceState = userId ? VoiceStateStore?.getVoiceStateForUser?.(userId) : null;
    const selectedId = SelectedChannelStore?.getChannelId?.();
    out.paths.voiceStateMatch = {
      userId,
      voiceChannelId: voiceState?.channelId,
      selectedId,
      hit: voiceState?.channelId && selectedId && voiceState.channelId === selectedId,
    };
  } catch (e) { out.paths.voiceStateMatch = { error: String(e) }; }

  try {
    const vcMarkers = Array.from(document.querySelectorAll(
      '[class*="voiceChannelChat"], [class*="voiceChannel_"][class*="chat_"]'
    ));
    out.paths.domMarkers = {
      total: vcMarkers.length,
      visible: vcMarkers.filter((el) => el.offsetParent !== null).length,
      hit: vcMarkers.some((el) => el.offsetParent !== null),
    };
  } catch (e) { out.paths.domMarkers = { error: String(e) }; }

  out.final = isVoiceChannelChat();
  return out;
}

// ─── Body attribute manager ──────────────────────────────────────────────
// Injects a data-attribute on <body> reflecting the current VC-chat state.
// Plugins can then rely on a CSS rule to hide their toolbar icon when the
// attribute is set — no JS race, no removal/re-inject cycle, no dependency
// on which path injected the icon. Multiple plugins calling install() share
// the same single watcher (refcounted), so subscribing is cheap.

const VC_BODY_ATTR = "data-sl-in-voice-chat";
const FORUM_THREAD_BODY_ATTR = "data-sl-in-forum-or-thread";
const DM_BODY_ATTR = "data-sl-in-dm";
const HOME_BODY_ATTR = "data-sl-in-home";
const READONLY_BODY_ATTR = "data-sl-channel-readonly";
const CHAT_LAYER_BODY_ATTR = "data-sl-chat-layer";

// Memoized SEND_MESSAGES permission bit — the constants module never
// changes within a client session. Resolved lazily on first readonly check.
let _sendMessagesBit = null;
function _getSendMessagesBit() {
  if (_sendMessagesBit !== null) return _sendMessagesBit;
  try {
    const Webpack = BdApi?.Webpack;
    const bits =
      Webpack.getModule(m => m && typeof m === "object" && m.ADMINISTRATOR && m.VIEW_CHANNEL, { searchExports: true }) ||
      Webpack.getByKeys("ADMINISTRATOR", "VIEW_CHANNEL");
    _sendMessagesBit = bits?.SEND_MESSAGES || 0n;
  } catch (_) {
    _sendMessagesBit = 0n;
  }
  return _sendMessagesBit;
}

// True when the current channel is a guild channel the user cannot send
// messages in (Discord renders the disabled textarea there). DMs/GDMs are
// always treated as sendable — theme styling only cares about the guild
// read-only case. Used for body[data-sl-channel-readonly] which gates the
// §14d disabled-textarea restyle in SoloLevelingTheme snippets.css.
// Known limit: fires on CHANNEL_SELECT, so a permission change while the
// channel is already open isn't reflected until the next switch — the
// affected styling is purely cosmetic.
function isChannelReadonly() {
  try {
    const ch = getCurrentChannel();
    if (!ch) return false;
    const t = Number(ch.type);
    if (t === 1 || t === 3) return false;
    const PermissionStore = BdApi?.Webpack?.getStore("PermissionStore");
    const SEND = _getSendMessagesBit();
    if (!PermissionStore?.can || !SEND) return false;
    return !PermissionStore.can(SEND, ch);
  } catch (_) {
    return false;
  }
}

// True when the user is currently in a DM or group DM. URL takes the
// shape /channels/@me/<channelId>; we cross-check via ChannelStore so
// /channels/@me/12345 with a missing channel doesn't false-positive.
//   1 = DM
//   3 = GROUP_DM
function isDmChannel() {
  try {
    const Webpack = BdApi?.Webpack;
    if (!Webpack || typeof window === "undefined" || !window.location) return false;
    const path = String(window.location.pathname || "");
    const m = path.match(/^\/channels\/@me\/(\d+)/);
    if (!m || !m[1]) return false;
    const ChannelStore = Webpack.getStore("ChannelStore");
    const ch = ChannelStore?.getChannel?.(m[1]);
    const t = Number(ch?.type);
    // If we can't resolve the channel, the URL pattern alone is a
    // strong DM signal — fall back to true so plugins err on hiding
    // (better than rendering misplaced icons in DMs).
    if (Number.isNaN(t)) return true;
    return t === 1 || t === 3;
  } catch (_) {
    return false;
  }
}

// True when the user is on a non-channel surface — Home/Friends, Store,
// Discovery, Library, Nitro, Settings overview, etc. Specifically:
// /channels/@me with NO channel ID, or any non-/channels/ path.
function isHomeView() {
  try {
    if (typeof window === "undefined" || !window.location) return false;
    const path = String(window.location.pathname || "");
    if (path === "/channels/@me" || path === "/channels/@me/") return true;
    if (/^\/channels\/@me(\?|$)/.test(path)) return true;
    // Any non-/channels/ route means we're not viewing a channel at all.
    if (!path.startsWith("/channels/")) return true;
    return false;
  } catch (_) {
    return false;
  }
}

// True when the user is currently viewing a forum or thread surface
// (forum landing, thread standalone, or thread/forum post opened).
// URL-based: most reliable across Discord client variants.
//   10 = ANNOUNCEMENT_THREAD
//   11 = PUBLIC_THREAD
//   12 = PRIVATE_THREAD
//   15 = GUILD_FORUM
function isForumOrThreadChannel() {
  try {
    const Webpack = BdApi?.Webpack;
    if (!Webpack || typeof window === "undefined" || !window.location) return false;
    const m = String(window.location.pathname || "").match(/^\/channels\/(?:@me|\d+)\/(\d+)/);
    if (!m || !m[1]) return false;
    const ChannelStore = Webpack.getStore("ChannelStore");
    const ch = ChannelStore?.getChannel?.(m[1]);
    const t = Number(ch?.type);
    return t === 10 || t === 11 || t === 12 || t === 15;
  } catch (_) {
    return false;
  }
}
const VC_HIDE_STYLE_ID = "sl-vc-icon-hiding";
const VC_HIDE_CSS = `
/* Auto-injected by src/shared/channel-context.js — hides Solo-Leveling
   plugin toolbar icons when the user is viewing a voice-channel chat panel.
   Toggled via body[data-sl-in-voice-chat="true"]. */
body[data-sl-in-voice-chat="true"] #eq-header-icon,
body[data-sl-in-voice-chat="true"] #itemvault-header-icon,
body[data-sl-in-voice-chat="true"] #shadow-senses-header-icon,
body[data-sl-in-voice-chat="true"] #se-swirl-icon,
body[data-sl-in-voice-chat="true"] #dungeons-header-widget {
  display: none !important;
}
`;
let _vcWatchInstalled = false;
let _vcWatchInterval = null;
let _vcWatchRefCount = 0;
let _vcDispatcherUnsub = null;
// Cross-bundle refcount for the shared CSS rule (window-keyed so all esbuild
// bundles share ONE counter — prevents bundle A from removeStyle-ing while
// bundle B still needs the rule).
if (typeof window !== "undefined") {
  window.__SL_VcHideRefs = window.__SL_VcHideRefs || 0;
}

function _writeVcAttribute() {
  try {
    if (!document.body) return;
    const vcValue = isVoiceChannelChat() ? "true" : "false";
    if (document.body.getAttribute(VC_BODY_ATTR) !== vcValue) {
      document.body.setAttribute(VC_BODY_ATTR, vcValue);
    }
    // Same watcher writes the forum/thread/dm/home attrs — they share
    // the same CHANNEL_SELECT trigger + 1s safety-net poll, so a single
    // pass updates all four. Cheap to read all four states per tick.
    const ftValue = isForumOrThreadChannel() ? "true" : "false";
    if (document.body.getAttribute(FORUM_THREAD_BODY_ATTR) !== ftValue) {
      document.body.setAttribute(FORUM_THREAD_BODY_ATTR, ftValue);
    }
    const dmValue = isDmChannel() ? "true" : "false";
    if (document.body.getAttribute(DM_BODY_ATTR) !== dmValue) {
      document.body.setAttribute(DM_BODY_ATTR, dmValue);
    }
    const homeValue = isHomeView() ? "true" : "false";
    if (document.body.getAttribute(HOME_BODY_ATTR) !== homeValue) {
      document.body.setAttribute(HOME_BODY_ATTR, homeValue);
    }
    const roValue = isChannelReadonly() ? "true" : "false";
    if (document.body.getAttribute(READONLY_BODY_ATTR) !== roValue) {
      document.body.setAttribute(READONLY_BODY_ATTR, roValue);
    }
  } catch (_) {}
}

/**
 * Install the body-attribute watcher. Safe to call from multiple plugins —
 * the watcher is refcounted and only the first install starts the loop.
 * Returns an unsubscribe function for the caller's stop() / cleanup path.
 */
function installVoiceChatBodyAttr() {
  _vcWatchRefCount++;
  // Also increment the cross-bundle window counter so removeStyle only fires
  // when the LAST plugin across ALL esbuild bundles releases the CSS.
  if (typeof window !== "undefined") {
    window.__SL_VcHideRefs = (window.__SL_VcHideRefs || 0) + 1;
  }

  if (!_vcWatchInstalled) {
    _vcWatchInstalled = true;

    // Inject the icon-hiding CSS once — hides all known SL plugin toolbar
    // icons via #id selectors when body[data-sl-in-voice-chat="true"].
    // CSS-based hiding is bulletproof: doesn't matter when/how the icon
    // got injected, the selector match alone suppresses display.
    try {
      if (BdApi?.DOM?.addStyle) {
        BdApi.DOM.addStyle(VC_HIDE_STYLE_ID, VC_HIDE_CSS);
      }
    } catch (_) {}

    _writeVcAttribute(); // immediate first write

    // Fast reactive update: subscribe to CHANNEL_SELECT dispatcher action.
    try {
      const dispatcher = acquireDispatcher();
      if (dispatcher) {
        const handler = () => _writeVcAttribute();
        dispatcher.subscribe("CHANNEL_SELECT", handler);
        dispatcher.subscribe("VOICE_STATE_UPDATES", handler);
        _vcDispatcherUnsub = () => {
          try { dispatcher.unsubscribe("CHANNEL_SELECT", handler); } catch (_) {}
          try { dispatcher.unsubscribe("VOICE_STATE_UPDATES", handler); } catch (_) {}
        };
      }
    } catch (_) {}

    // PERF (2026-07-13): the poll is a fallback, not a companion. When the
    // dispatcher subscription is live it already fires on CHANNEL_SELECT +
    // VOICE_STATE_UPDATES — the 1s poll on top of it was redundant DOM work
    // running 24/7 in every bundle that imports this module. Install the poll
    // ONLY when the dispatcher couldn't be acquired, slower, and never while
    // the window is hidden.
    if (!_vcDispatcherUnsub) {
      _vcWatchInterval = setInterval(() => {
        if (document.hidden) return;
        _writeVcAttribute();
      }, 15000);
    }
  }

  return function uninstallVoiceChatBodyAttr() {
    _vcWatchRefCount = Math.max(0, _vcWatchRefCount - 1);
    // Decrement the cross-bundle window counter; only remove the CSS rule
    // when ALL bundles across ALL plugins have released it.
    const globalRefs = typeof window !== "undefined"
      ? Math.max(0, (window.__SL_VcHideRefs || 1) - 1)
      : 0;
    if (typeof window !== "undefined") window.__SL_VcHideRefs = globalRefs;
    if (_vcWatchRefCount === 0 && _vcWatchInstalled) {
      _vcWatchInstalled = false;
      if (_vcWatchInterval) {
        clearInterval(_vcWatchInterval);
        _vcWatchInterval = null;
      }
      if (_vcDispatcherUnsub) {
        _vcDispatcherUnsub();
        _vcDispatcherUnsub = null;
      }
      try {
        if (document.body) {
          document.body.removeAttribute(VC_BODY_ATTR);
          document.body.removeAttribute(FORUM_THREAD_BODY_ATTR);
          document.body.removeAttribute(DM_BODY_ATTR);
          document.body.removeAttribute(HOME_BODY_ATTR);
          document.body.removeAttribute(READONLY_BODY_ATTR);
        }
      } catch (_) {}
      // Only remove the shared CSS when the cross-bundle counter hits zero.
      if (globalRefs === 0) {
        try {
          if (BdApi?.DOM?.removeStyle) BdApi.DOM.removeStyle(VC_HIDE_STYLE_ID);
        } catch (_) {}
      }
    }
  };
}

// ── Chat-layer (thread/forum overlay) body attribute ──────────────
//
// Replaces `body:has(div[class^="chatLayerWrapper_"])` in
// SoloLevelingTheme/modules/guild.css — the only :has() in the suite whose
// subject is <body>, which forces the style engine to re-test <body> on DOM
// mutations anywhere in the document. Every other :has() here is anchored on
// a narrow subject ([role="dialog"], div[class^="layer_"]) and is left alone.
//
// A prior audit (DKB bd-has-selector-to-data-attr-tagging) recorded this rule
// as un-convertible because the URL stays on the text channel, so CHANNEL_SELECT
// never fires. That rules out a dispatcher trigger — but not a childList
// observer on the layer container, which is what this uses. Layers mount
// rarely (unlike the message list), so observing them is cheap.

let _chatLayerObserver = null;
let _chatLayerRefCount = 0;
let _chatLayerRafPending = false;
let _chatLayerLastValue = null;

function _writeChatLayerAttribute() {
  try {
    if (!document.body) return;
    const value = document.querySelector('div[class^="chatLayerWrapper_"]') ? "true" : "false";
    // Only write on change — an unconditional attribute write invalidates
    // style for the whole document, reintroducing the cost this removes.
    if (value === _chatLayerLastValue) return;
    _chatLayerLastValue = value;
    document.body.setAttribute(CHAT_LAYER_BODY_ATTR, value);
  } catch (_) {}
}

function _scheduleChatLayerWrite() {
  if (_chatLayerRafPending) return;
  _chatLayerRafPending = true;
  requestAnimationFrame(() => {
    _chatLayerRafPending = false;
    _writeChatLayerAttribute();
  });
}

/**
 * Install the shared chat-layer body-attribute watcher (refcounted, like
 * installVoiceChatBodyAttr). Returns an uninstall function.
 */
function installChatLayerBodyAttr() {
  _chatLayerRefCount++;

  if (!_chatLayerObserver) {
    _writeChatLayerAttribute(); // immediate first write

    // Observe the layer container rather than document.body: layers mount
    // rarely, and a layer element can mount empty and populate a frame later,
    // so subtree observation is needed but affordable at this scope.
    const target =
      document.querySelector('[class*="layerContainer_"]') ||
      document.querySelector('[class*="layers_"]') ||
      document.body;

    if (target) {
      _chatLayerObserver = new MutationObserver(_scheduleChatLayerWrite);
      _chatLayerObserver.observe(target, { childList: true, subtree: true });
    }
  }

  return function uninstallChatLayerBodyAttr() {
    _chatLayerRefCount = Math.max(0, _chatLayerRefCount - 1);
    if (_chatLayerRefCount > 0) return;

    if (_chatLayerObserver) {
      _chatLayerObserver.disconnect();
      _chatLayerObserver = null;
    }
    _chatLayerRafPending = false;
    _chatLayerLastValue = null;
    try {
      document.body?.removeAttribute(CHAT_LAYER_BODY_ATTR);
    } catch (_) {}
  };
}

module.exports = {
  getCurrentChannel,
  isVoiceChannelChat,
  isForumOrThreadChannel,
  isDmChannel,
  isHomeView,
  isChannelReadonly,
  debugVoiceChannelChat,
  installVoiceChatBodyAttr,
  installChatLayerBodyAttr,
  VC_BODY_ATTR,
  CHAT_LAYER_BODY_ATTR,
  FORUM_THREAD_BODY_ATTR,
  DM_BODY_ATTR,
  HOME_BODY_ATTR,
  READONLY_BODY_ATTR,
};
