function collectSessionClientStatuses(plugin) {
  const out = {};
  if (!plugin._SessionsStore?.getSessions) return out;
  const sessions = plugin._SessionsStore.getSessions() || {};
  for (const session of Object.values(sessions)) {
    const client = session?.clientInfo?.client;
    if (!client) continue;
    out[client] = session?.status || "unknown";
  }
  return out;
}

function collectClientStatuses(plugin, userId) {
  const currentUserId = plugin._UserStore?.getCurrentUser?.()?.id;
  if (currentUserId && String(userId) === String(currentUserId)) {
    return collectSessionClientStatuses(plugin);
  }
  return plugin._PresenceStore?.getState?.()?.clientStatuses?.[userId] || {};
}

function mapClientStatusesToRows(plugin, clientStatuses, { platformLabels, statusLabels }) {
  const rows = [];
  for (const [platformRaw, statusRaw] of Object.entries(clientStatuses || {})) {
    const platform = platformLabels[platformRaw] || plugin._capitalize(platformRaw);
    const status = statusLabels[statusRaw] || plugin._capitalize(statusRaw);
    rows.push({ platform, status });
  }
  return rows;
}

function appendPresenceFallbackRow(plugin, rows, userId, { statusLabels }) {
  if (rows.length > 0) return;
  const statusRaw = plugin._PresenceStore?.getStatus?.(userId);
  if (!statusRaw) return;
  rows.push({
    platform: "Presence",
    status: statusLabels[statusRaw] || plugin._capitalize(statusRaw),
  });
}

function getPlatformIntel(plugin, userId, labels) {
  try {
    const rows = mapClientStatusesToRows(plugin, collectClientStatuses(plugin, userId), labels);
    appendPresenceFallbackRow(plugin, rows, userId, labels);
    return rows;
  } catch (error) {
    console.error("[ShadowRecon] Failed getting platform intel", error);
    return [];
  }
}

async function requestUserProfile(plugin, userId, guildId, pluginName) {
  const actions = plugin._UserProfileActions;
  if (!actions) return;

  try {
    if (typeof actions.fetchProfile === "function") {
      await Promise.resolve(actions.fetchProfile(userId, { guildId }));
    } else if (typeof actions.fetchUserProfile === "function") {
      await Promise.resolve(actions.fetchUserProfile(userId, { guildId }));
    }
  } catch (_) {
    try {
      if (typeof actions.fetchProfile === "function") {
        await Promise.resolve(actions.fetchProfile(userId));
      } else if (typeof actions.fetchUserProfile === "function") {
        await Promise.resolve(actions.fetchUserProfile(userId));
      }
    } catch (error) {
      console.error(`[${pluginName}] profile request failed`, error);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 200));
}

function getUserProfile(plugin, userId, pluginName) {
  const store = plugin._UserProfileStore;
  if (!store) return null;

  try {
    if (typeof store.getUserProfile === "function") return store.getUserProfile(userId);
    if (typeof store.getProfile === "function") return store.getProfile(userId);
  } catch (error) {
    console.error(`[${pluginName}] Failed reading UserProfileStore`, error);
  }

  return null;
}

async function getConnectionsIntel(plugin, userId, guildId, pluginName) {
  await requestUserProfile(plugin, userId, guildId, pluginName);

  const profile = getUserProfile(plugin, userId, pluginName);
  const possible =
    profile?.connectedAccounts ||
    profile?.connected_accounts ||
    profile?.connections ||
    profile?.userProfile?.connectedAccounts ||
    profile?.userProfile?.connected_accounts ||
    [];

  if (!Array.isArray(possible)) return [];

  return possible
    .map((connection) => ({
      type: plugin._capitalize(String(connection?.type || connection?.platform || "unknown")),
      name: String(connection?.name || connection?.username || connection?.id || "unknown"),
      verified: Boolean(connection?.verified),
    }))
    .slice(0, 20);
}

module.exports = {
  appendPresenceFallbackRow,
  collectClientStatuses,
  collectSessionClientStatuses,
  getConnectionsIntel,
  getPlatformIntel,
  getUserProfile,
  mapClientStatusesToRows,
  requestUserProfile,
};
