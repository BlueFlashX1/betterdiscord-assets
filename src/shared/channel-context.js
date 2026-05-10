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
 * True when the user is currently viewing a voice or stage channel (i.e.
 * the chat panel attached to a VC). Three detection paths so any one
 * positive signal hides the plugin icons — robust to Discord refactors,
 * BD timing edge cases, and unusual store states.
 */
function isVoiceChannelChat() {
  // 1) Primary: selected channel type === voice or stage
  try {
    const channel = getCurrentChannel();
    if (channel) {
      const type = Number(channel.type);
      if (type === 2 || type === 13) return true;
    }
  } catch (_) {}

  // 2) Voice-connect state: user is connected to a VC AND the currently
  //    selected channel matches that VC (i.e. they're viewing its chat).
  try {
    const Webpack = BdApi?.Webpack;
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

  // 3) DOM-marker fallback: Discord renders a panel with class names
  //    containing "voiceChannel" + "chat" (hash-suffixed) when the VC
  //    chat overlay is open. Visible (offsetParent !== null) means it's
  //    actually being shown, not just attached for animation.
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

module.exports = {
  getCurrentChannel,
  isVoiceChannelChat,
};
