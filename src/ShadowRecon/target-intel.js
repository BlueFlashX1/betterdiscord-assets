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

module.exports = {
  getPlatformIntel,
};
