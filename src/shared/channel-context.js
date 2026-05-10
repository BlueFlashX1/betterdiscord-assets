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
  try {
    const channel = getCurrentChannel();
    if (channel) {
      const type = Number(channel.type);
      if (type === 2 || type === 13) return true;
    }
  } catch (_) {}

  // 2) URL-based: most reliable — Discord's URL is /channels/<g>/<id>
  //    whenever a channel is being viewed. Look up that ID in
  //    ChannelStore and check its type. Bypasses any
  //    SelectedChannelStore staleness.
  try {
    if (typeof window !== "undefined" && window.location && Webpack) {
      const m = String(window.location.pathname || "").match(/^\/channels\/(?:@me|\d+)\/(\d+)/);
      if (m && m[1]) {
        const ChannelStore = Webpack.getStore("ChannelStore");
        const ch = ChannelStore?.getChannel?.(m[1]);
        const t = Number(ch?.type);
        if (t === 2 || t === 13) return true;
      }
    }
  } catch (_) {}

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

function _writeVcAttribute() {
  try {
    const value = isVoiceChannelChat() ? "true" : "false";
    if (document.body && document.body.getAttribute(VC_BODY_ATTR) !== value) {
      document.body.setAttribute(VC_BODY_ATTR, value);
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
      const Webpack = BdApi?.Webpack;
      const dispatcher =
        Webpack?.Stores?.UserStore?._dispatcher ||
        Webpack?.getModule((m) => m && m.dispatch && m.subscribe);
      if (dispatcher && typeof dispatcher.subscribe === "function") {
        const handler = () => _writeVcAttribute();
        dispatcher.subscribe("CHANNEL_SELECT", handler);
        dispatcher.subscribe("VOICE_STATE_UPDATES", handler);
        _vcDispatcherUnsub = () => {
          try { dispatcher.unsubscribe("CHANNEL_SELECT", handler); } catch (_) {}
          try { dispatcher.unsubscribe("VOICE_STATE_UPDATES", handler); } catch (_) {}
        };
      }
    } catch (_) {}

    // Slow safety-net poll in case the dispatcher subscription misses an
    // edge case. 1s is fast enough for UX, slow enough not to matter.
    _vcWatchInterval = setInterval(_writeVcAttribute, 1000);
  }

  return function uninstallVoiceChatBodyAttr() {
    _vcWatchRefCount = Math.max(0, _vcWatchRefCount - 1);
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
        if (document.body) document.body.removeAttribute(VC_BODY_ATTR);
      } catch (_) {}
      try {
        if (BdApi?.DOM?.removeStyle) BdApi.DOM.removeStyle(VC_HIDE_STYLE_ID);
      } catch (_) {}
    }
  };
}

module.exports = {
  getCurrentChannel,
  isVoiceChannelChat,
  debugVoiceChannelChat,
  installVoiceChatBodyAttr,
  VC_BODY_ATTR,
};
