const {
  BURST_WINDOW_MS,
  GLOBAL_UTILITY_FEED_ID,
  STARTUP_TOAST_GRACE_MS,
} = require("./constants");

const { resolvePresenceUpdateStatus } = require("./senses-engine-utils");

const DEFAULT_AVATAR_URL = "https://cdn.discordapp.com/embed/avatars/0.png";
const MAX_ACTIVITY_SEED_SCAN_ENTRIES = 6000;
const LAST_SEEN_FALLBACK_MS = 24 * 60 * 60 * 1000;

function getStartupState(ctx) {
  const now = Date.now();
  const msSinceSubscribe = now - ctx._subscribeTime;
  const isEarlyStartup = ctx._subscribeTime > 0 && msSinceSubscribe < STARTUP_TOAST_GRACE_MS;
  return {
    now,
    msSinceSubscribe,
    isEarlyStartup,
    delayMs: isEarlyStartup ? Math.max(0, STARTUP_TOAST_GRACE_MS - msSinceSubscribe) : 0,
  };
}

function ensureCurrentGuildId(ctx) {
  if (ctx._currentGuildId) return;
  try {
    ctx._currentGuildId = ctx._plugin._SelectedGuildStore
      ? ctx._plugin._SelectedGuildStore.getGuildId()
      : null;
    if (ctx._currentGuildId) {
      ctx._plugin._debugMode &&
        console.log(`[ShadowSenses] Lazy guild resolve: _currentGuildId=${ctx._currentGuildId}`);
    }
  } catch (_) {}
}

function resolveMessageChannelContext(ctx, message) {
  let channelName = "unknown";
  let guildId = message.guild_id || null;

  try {
    const channel = ctx._plugin._ChannelStore
      ? ctx._plugin._ChannelStore.getChannel(message.channel_id)
      : null;
    if (channel) {
      channelName = channel.name || "unknown";
      if (!guildId) guildId = channel.guild_id;
    }
  } catch (chErr) {
    ctx._plugin.debugError("SensesEngine", "Failed to resolve channel", chErr);
  }

  if (!guildId) return null;
  return { guildId, channelName };
}

function resolveTypingPayload(payload) {
  if (!payload) return null;
  const userId = String(payload.userId || payload.user_id || "");
  if (!userId) return null;
  return {
    userId,
    channelId: payload.channelId || payload.channel_id || null,
    guildId: payload.guildId || payload.guild_id || null,
  };
}

function resolveTypingChannelContext(ctx, channelId, initialGuildId) {
  let guildId = initialGuildId || null;
  let channelName = "unknown";
  if (!channelId || !ctx._plugin._ChannelStore?.getChannel) return { guildId, channelName };

  try {
    const channel = ctx._plugin._ChannelStore.getChannel(channelId);
    if (!channel) return { guildId, channelName };
    channelName =
      channel.name ||
      channel.rawRecipients
        ?.map((recipient) => recipient?.username)
        .filter(Boolean)
        .join(", ") ||
      "Direct Message";
    if (!guildId && channel.guild_id) guildId = channel.guild_id;
  } catch (err) {
    ctx._plugin.debugError("SensesEngine", "Failed to resolve typing channel", err);
  }
  return { guildId, channelName };
}

function pruneTypingCooldown(ctx, now, cooldownMs) {
  if (ctx._typingToastCooldown.size <= 500) return;
  for (const [key, ts] of ctx._typingToastCooldown.entries()) {
    if (now - ts > cooldownMs * 4) ctx._typingToastCooldown.delete(key);
  }
}

function shouldSkipTypingToast(ctx, cooldownKey, now, cooldownMs) {
  const lastToastAt = ctx._typingToastCooldown.get(cooldownKey) || 0;
  if (now - lastToastAt < cooldownMs) return true;
  ctx._typingToastCooldown.set(cooldownKey, now);
  pruneTypingCooldown(ctx, now, cooldownMs);
  return false;
}

function syncLastSeenCount(ctx, guildId) {
  if (!guildId || guildId !== ctx._currentGuildId) return;
  const feed = ctx._guildFeeds[guildId];
  if (feed) ctx._lastSeenCount[guildId] = feed.length;
}

function getRemovedFriendIds(previousFriends, nextFriends) {
  const removed = [];
  for (const friendId of previousFriends) {
    if (!nextFriends.has(friendId)) removed.push(friendId);
  }
  return removed;
}

function withStartupDelay(ctx, startupState, action) {
  if (!startupState.isEarlyStartup) {
    action();
    return;
  }
  ctx._scheduleDeferredUtilityToast(action, startupState.delayMs);
}

function showActivityToast(ctx, options) {
  const {
    deployment,
    authorName,
    guildName,
    channelName,
    accentColor,
    body,
    detail,
    fallbackType,
    fallbackBody,
  } = options;
  const avatarUrl = ctx._resolveUserAvatarUrl(options.authorId) || DEFAULT_AVATAR_URL;

  if (ctx._toastEngine) {
    ctx._toastEngine.showCardToast({
      avatarUrl,
      accentColor,
      header: `[${deployment.shadowRank}] ${deployment.shadowName}`,
      body,
      detail,
      duration: 5000,
    });
    return;
  }

  ctx._toast(
    `[${deployment.shadowRank}] ${deployment.shadowName} reports: ${fallbackBody}`,
    fallbackType,
    5000
  );
}

function formatSilenceDuration(silenceMs) {
  if (!Number.isFinite(silenceMs) || silenceMs <= 0) return "<1m";
  const totalMinutes = Math.floor(silenceMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d${hours > 0 ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

function upsertUserLastActivity(ctx, authorId, timestamp, notifiedActive, isFallback = false) {
  const normalizedUserId = String(authorId || "");
  const nextTimestamp = Number(timestamp) || 0;
  if (!normalizedUserId || nextTimestamp <= 0) return;

  const current = ctx._userLastActivity.get(normalizedUserId);
  if (current && nextTimestamp < (current.timestamp || 0)) return;

  ctx._userLastActivity.set(normalizedUserId, {
    timestamp: nextTimestamp,
    notifiedActive: !!notifiedActive,
    isFallback: !!isFallback,
  });
  ctx._activityIndexDirty = true;
}

function getPendingSeedUserIds(ctx) {
  const monitoredIds = ctx._plugin.deploymentManager?.getMonitoredUserIds?.();
  if (!(monitoredIds instanceof Set) || monitoredIds.size === 0) return new Set();

  const pending = new Set();
  for (const monitoredId of monitoredIds) {
    const userId = String(monitoredId || "");
    if (!userId) continue;
    const cached = ctx._userLastActivity.get(userId);
    if (!cached || !Number.isFinite(cached.timestamp) || cached.timestamp <= 0) {
      pending.add(userId);
    }
  }
  return pending;
}

function seedUserActivityFromFeeds() {
  if (this._activitySeededFromHistory) return;
  this._activitySeededFromHistory = true;
  if (!this._guildFeeds || typeof this._guildFeeds !== "object") return;

  const pendingSeedUserIds = getPendingSeedUserIds(this);
  if (pendingSeedUserIds.size === 0) return;

  let scannedEntries = 0;
  let scanLimitReached = false;
  for (const feed of Object.values(this._guildFeeds)) {
    if (!Array.isArray(feed) || feed.length === 0) continue;
    for (let index = feed.length - 1; index >= 0; index--) {
      scannedEntries++;
      if (scannedEntries > MAX_ACTIVITY_SEED_SCAN_ENTRIES) {
        scanLimitReached = true;
        break;
      }
      const entry = feed[index];
      if (!entry || entry.eventType !== "message") continue;
      const authorId = entry.authorId ? String(entry.authorId) : "";
      const timestamp = Number(entry.timestamp) || 0;
      if (!authorId || timestamp <= 0 || !pendingSeedUserIds.has(authorId)) continue;
      upsertUserLastActivity(this, authorId, timestamp, false);
      pendingSeedUserIds.delete(authorId);
      if (pendingSeedUserIds.size === 0) break;
    }
    if (scanLimitReached) break;
    if (pendingSeedUserIds.size === 0) break;
  }

  if (scanLimitReached && pendingSeedUserIds.size > 0) {
    this._plugin.debugLog(
      "SensesEngine",
      "Activity seed scan capped to avoid startup hitch",
      { unresolved: pendingSeedUserIds.size, scannedEntries: MAX_ACTIVITY_SEED_SCAN_ENTRIES }
    );
  }
  if (pendingSeedUserIds.size > 0) {
    const fallbackTimestamp = Date.now() - LAST_SEEN_FALLBACK_MS;
    for (const unresolvedUserId of pendingSeedUserIds) {
      upsertUserLastActivity(this, unresolvedUserId, fallbackTimestamp, false, true);
    }
  }

  trimUserActivitySeedCache(this);
}

function pruneUserActivityCache(ctx) {
  if (ctx._userLastActivity.size <= ctx._USER_ACTIVITY_MAX) return;
  let oldestUserId = null;
  let oldestTs = Infinity;
  for (const [uid, data] of ctx._userLastActivity) {
    if ((data?.timestamp || 0) < oldestTs) {
      oldestUserId = uid;
      oldestTs = data.timestamp || 0;
    }
  }
  if (oldestUserId) ctx._userLastActivity.delete(oldestUserId);
}

function trimUserActivitySeedCache(ctx) {
  if (ctx._userLastActivity.size <= ctx._USER_ACTIVITY_MAX) return;
  const topRecent = Array.from(ctx._userLastActivity.entries())
    .sort((a, b) => (b[1]?.timestamp || 0) - (a[1]?.timestamp || 0))
    .slice(0, ctx._USER_ACTIVITY_MAX);
  ctx._userLastActivity = new Map(topRecent);
}

function trackUserActivity(ctx, params) {
  const {
    authorId,
    authorName,
    deployment,
    guildName,
    channelName,
    startupState,
    now,
  } = params;
  const lastActivity = ctx._userLastActivity.get(authorId);
  const alreadyNotifiedThisSession = ctx._sessionActivityNotified.has(authorId);
  const isFallbackLastSeen = !!lastActivity?.isFallback;
  const silenceMs = lastActivity ? Math.max(0, now - (lastActivity.timestamp || 0)) : null;

  if (!alreadyNotifiedThisSession) {
    const elapsedLabel =
      isFallbackLastSeen
        ? "last seen 24h+ ago"
        : Number.isFinite(silenceMs) && silenceMs > 0
        ? `last seen ${formatSilenceDuration(silenceMs)} ago`
        : "first signal this session";
    withStartupDelay(ctx, startupState, () =>
      showActivityToast(ctx, {
        authorId,
        deployment,
        authorName,
        guildName,
        channelName,
        accentColor: "#22c55e",
        body: `${authorName} is active`,
        detail: `${elapsedLabel} • ${guildName} #${channelName}`,
        fallbackType: "quest",
        fallbackBody: `${authorName} is active (${elapsedLabel})`,
      })
    );
    ctx._sessionActivityNotified.add(authorId);
    upsertUserLastActivity(ctx, authorId, now, true, false);
    pruneUserActivityCache(ctx);
    return;
  }

  if (!lastActivity) {
    upsertUserLastActivity(ctx, authorId, now, true, false);
    pruneUserActivityCache(ctx);
    return;
  }

  if (silenceMs >= ctx._AFK_THRESHOLD_MS) {
    const timeStr = formatSilenceDuration(silenceMs);
    withStartupDelay(ctx, startupState, () =>
      showActivityToast(ctx, {
        authorId,
        deployment,
        authorName,
        guildName,
        channelName,
        accentColor: "#fbbf24",
        body: `${authorName} has returned`,
        detail: `AFK ${timeStr} • ${guildName} #${channelName}`,
        fallbackType: "achievement",
        fallbackBody: `${authorName} has returned (AFK ${timeStr})`,
      })
    );
  }

  upsertUserLastActivity(ctx, authorId, now, true, false);
  pruneUserActivityCache(ctx);
}

function buildAttachmentMarker(attachment) {
  const contentType = attachment?.content_type || "";
  if (contentType.startsWith("image/")) return "[Image]";
  if (contentType.startsWith("video/")) return "[Video]";
  if (contentType.startsWith("audio/")) return "[Audio]";
  return `[File: ${attachment?.filename || "attachment"}]`;
}

function buildEmbedMarker(embed) {
  if (embed?.title) return `[Embed: ${embed.title.slice(0, 60)}]`;
  if (embed?.description) return `[Embed: ${embed.description.slice(0, 60)}]`;
  if (embed?.url) return "[Link]";
  return "[Embed]";
}

function buildMessageContent(message) {
  const contentParts = [];
  if (message.content) contentParts.push(message.content.slice(0, 200));
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    for (const attachment of message.attachments) {
      contentParts.push(buildAttachmentMarker(attachment));
    }
  }
  if (Array.isArray(message.embeds) && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      contentParts.push(buildEmbedMarker(embed));
    }
  }
  return contentParts.join(" ") || "";
}

function showMatchReasonToast(ctx, params) {
  const {
    entry,
    deployment,
    authorId,
    authorName,
    guildName,
    isInvisible = false,
  } = params;
  const snippet = entry.content ? `: "${entry.content.slice(0, 80)}"` : "";
  const invisibleSuffix = isInvisible ? " (invisible)" : "";

  if (entry.matchReason === "mention") {
    ctx._showMentionToast({
      userId: authorId,
      userName: authorName,
      label: `@mentioned you${invisibleSuffix}`,
      detail: `in ${guildName} #${entry.channelName}${snippet}`,
      accent: "#ef4444",
      deployment,
    });
    return "mention";
  }

  if (entry.matchReason === "name") {
    ctx._showMentionToast({
      userId: authorId,
      userName: authorName,
      label: `said "${entry.matchedTerm}"${invisibleSuffix}`,
      detail: `in ${guildName} #${entry.channelName}${snippet}`,
      accent: "#ec4899",
      deployment,
    });
    return "name";
  }

  const keywordTerm = entry.userKeywordMatch || (entry.matchReason === "targetKeyword"
    ? entry.matchedTerm
    : null);
  if (!keywordTerm) return null;
  ctx._showMentionToast({
    userId: authorId,
    userName: authorName,
    label: `keyword "${keywordTerm}"${invisibleSuffix}`,
    detail: `in ${guildName} #${entry.channelName}${snippet}`,
    accent: "#34d399",
    deployment,
  });
  return "keyword";
}

function pruneInvisibleToastCooldown(ctx, now) {
  if (ctx._invisibleToastCooldown.size <= 500) return;
  for (const [key, ts] of ctx._invisibleToastCooldown.entries()) {
    if (now - ts > BURST_WINDOW_MS * 4) ctx._invisibleToastCooldown.delete(key);
  }
}

function shouldSkipInvisibleMessageToast(ctx, entry, now) {
  const cooldownKey = `${entry.authorId}:${entry.channelId || "unknown"}`;
  const previous = ctx._invisibleToastCooldown.get(cooldownKey) || 0;
  if (now - previous < BURST_WINDOW_MS) return true;
  ctx._invisibleToastCooldown.set(cooldownKey, now);
  pruneInvisibleToastCooldown(ctx, now);
  return false;
}

function applyPresenceToastAndLastSeen(ctx, params) {
  const {
    entry,
    guildId,
    guildName,
    isAwayGuild,
    userStatus = "offline",
    isInvisible = false,
    matchToastType = null,
    suppressGenericToast = false,
  } = params;

  if (isInvisible && !matchToastType && !shouldSkipInvisibleMessageToast(ctx, entry, entry.timestamp || Date.now())) {
    const location = `${guildName} #${entry.channelName}`;
    ctx._showMentionToast({
      userId: entry.authorId,
      userName: entry.authorName,
      label: "sent a message while invisible",
      detail: `in ${location}`,
      accent: "#ef4444",
      deployment: {
        shadowRank: entry.shadowRank,
        shadowName: entry.shadowName,
      },
    });
    syncLastSeenCount(ctx, guildId);
    return;
  }

  if (suppressGenericToast) {
    syncLastSeenCount(ctx, guildId);
    return;
  }

  if (isAwayGuild) {
    ctx._toast(
      `[${entry.shadowRank}] ${entry.shadowName} sensed ${entry.authorName} in ${guildName} #${entry.channelName}`,
      "info"
    );
    return;
  }

  if (isInvisible) {
    ctx._toast(
      `[${entry.shadowRank}] ${entry.shadowName} sensed ${entry.authorName} (${userStatus}) in #${entry.channelName}`,
      "error"
    );
  }
  syncLastSeenCount(ctx, guildId);
}

function resolveSelectedGuildId(ctx, payload) {
  if (payload?.guildId) return payload.guildId;
  try {
    return ctx._plugin._SelectedGuildStore ? ctx._plugin._SelectedGuildStore.getGuildId() : null;
  } catch (gErr) {
    ctx._plugin.debugError("SensesEngine", "Failed to get guild ID on select", gErr);
    return null;
  }
}

function notifyUnseenSignalsForGuild(ctx, guildId) {
  if (!guildId || !ctx._guildFeeds[guildId]) return;
  const feed = ctx._guildFeeds[guildId];
  const lastSeen = ctx._lastSeenCount[guildId] || 0;
  const unseenCount = feed.length - lastSeen;
  if (unseenCount > 0) {
    const unseenEntries = feed.slice(lastSeen);
    const shadowNames = new Set(unseenEntries.map((entry) => entry.shadowName));
    const guildName = ctx._plugin._getGuildName(guildId);

    ctx._toast(
      `Shadow Senses: ${unseenCount} signal${unseenCount > 1 ? "s" : ""} in ${guildName} from ${shadowNames.size} shadow${shadowNames.size > 1 ? "s" : ""} while away`,
      "info"
    );
    ctx._plugin._widgetDirty = true;
  }
  ctx._lastSeenCount[guildId] = feed.length;
}

function handlePresenceUpdateEntry(ctx, update, monitoredIds, startupState) {
  const userId = update.userId;
  if (!userId || !monitoredIds.has(userId)) return false;

  const deployment = ctx._plugin.deploymentManager.getDeploymentForUser(userId);
  if (!deployment) return false;

  const hasPriorStatus = ctx._statusByUserId.has(userId);
  const previousStatus = hasPriorStatus
    ? ctx._normalizeStatus(ctx._statusByUserId.get(userId))
    : null;
  let nextStatus =
    typeof update.status === "string" && update.status.trim().length > 0
      ? ctx._normalizeStatus(update.status)
      : null;
  if (!nextStatus && update.clientStatus) {
    nextStatus = resolvePresenceUpdateStatus(update, ctx._normalizeStatus.bind(ctx));
  }
  if (!nextStatus) {
    const presenceStore = ctx._resolvePresenceStore();
    const liveStatus = presenceStore?.getStatus?.(userId);
    if (typeof liveStatus === "string" && liveStatus.trim().length > 0) {
      nextStatus = ctx._normalizeStatus(liveStatus);
    }
  }
  if (!nextStatus) {
    if (!hasPriorStatus) return false;
    nextStatus = previousStatus || "offline";
  }

  ctx._statusByUserId.set(userId, nextStatus);
  if (!hasPriorStatus || previousStatus === nextStatus) return false;

  if (ctx._plugin.settings?.statusAlerts) {
    const toastPayload = {
      userId,
      userName: ctx._resolveUserName(userId, deployment.targetUsername || "Unknown"),
      previousLabel: ctx._getStatusLabel(previousStatus),
      nextLabel: ctx._getStatusLabel(nextStatus),
      nextStatus,
      deployment,
    };
    if (startupState.isEarlyStartup) {
      ctx._scheduleStatusToast(toastPayload, startupState.delayMs);
    } else {
      ctx._showStatusToast(toastPayload);
    }
  }

  return true;
}

function mergePresenceUpdatesWithStoreSnapshot(ctx, updates, monitoredIds) {
  const mergedByUserId = new Map();
  const upsert = (userId, status) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId || !monitoredIds.has(normalizedUserId)) return;
    const normalizedStatus =
      typeof status === "string" && status.trim().length > 0
        ? ctx._normalizeStatus(status)
        : null;
    const existing = mergedByUserId.get(normalizedUserId);
    if (existing?.status && !normalizedStatus) return;
    mergedByUserId.set(normalizedUserId, { userId: normalizedUserId, status: normalizedStatus });
  };

  for (const update of updates || []) {
    if (!update || typeof update !== "object") continue;
    upsert(update.userId, update.status);
  }

  const presenceStore = ctx._resolvePresenceStore();
  if (presenceStore && typeof presenceStore.getStatus === "function") {
    for (const monitoredId of monitoredIds) {
      const normalizedUserId = String(monitoredId || "").trim();
      if (!normalizedUserId) continue;
      // Skip store reads for users already present from the dispatcher payload —
      // the dispatcher data is fresher and should not be overwritten by a potentially stale store.
      if (mergedByUserId.has(normalizedUserId)) continue;
      let liveStatus = null;
      try {
        const rawStatus = presenceStore.getStatus(normalizedUserId);
        if (typeof rawStatus === "string" && rawStatus.trim().length > 0) {
          liveStatus = ctx._normalizeStatus(rawStatus);
        }
      } catch (_) {}
      upsert(normalizedUserId, liveStatus);
    }
  }

  return Array.from(mergedByUserId.values());
}

function onPresenceUpdate(payload) {
  try {
    const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
    if (!monitoredIds || monitoredIds.size === 0) return;

    const updates = this._extractPresenceUpdates(payload);
    const mergedUpdates = mergePresenceUpdatesWithStoreSnapshot(this, updates, monitoredIds);
    if (mergedUpdates.length === 0) return;

    const startupState = getStartupState(this);
    let hasStateChanges = false;
    for (const update of mergedUpdates) {
      hasStateChanges =
        handlePresenceUpdateEntry(this, update, monitoredIds, startupState) || hasStateChanges;
    }
    if (hasStateChanges) this._plugin._widgetDirty = true;
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Error in PRESENCE_UPDATE handler", err);
  }
}

function pollMonitoredPresenceStatuses(source = "interval") {
  try {
    const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
    if (!(this._presenceStatusMissCount instanceof Map)) {
      this._presenceStatusMissCount = new Map();
    }
    if (!(monitoredIds instanceof Set) || monitoredIds.size === 0) {
      this._statusByUserId.clear();
      this._presenceStatusMissCount.clear();
      return;
    }

    // Keep runtime maps bounded to currently monitored users only.
    for (const userId of Array.from(this._statusByUserId.keys())) {
      if (!monitoredIds.has(userId)) this._statusByUserId.delete(userId);
    }
    for (const userId of Array.from(this._presenceStatusMissCount.keys())) {
      if (!monitoredIds.has(userId)) this._presenceStatusMissCount.delete(userId);
    }

    const presenceStore = this._resolvePresenceStore();
    if (!presenceStore || typeof presenceStore.getStatus !== "function") return;

    const updates = [];
    for (const monitoredId of monitoredIds) {
      const userId = String(monitoredId || "").trim();
      if (!userId) continue;

      let nextStatus = null;
      try {
        const rawStatus = presenceStore.getStatus(userId);
        if (typeof rawStatus === "string" && rawStatus.trim().length > 0) {
          nextStatus = this._normalizeStatus(rawStatus);
          this._presenceStatusMissCount.delete(userId);
        } else {
          const missCount = (Number(this._presenceStatusMissCount.get(userId)) || 0) + 1;
          this._presenceStatusMissCount.set(userId, missCount);

          // With 5s poll interval, a single miss is sufficient to detect offline.
          if (missCount >= 1) nextStatus = "offline";
        }
      } catch (_) {}

      if (!this._statusByUserId.has(userId)) {
        this._statusByUserId.set(userId, nextStatus || "offline");
        continue;
      }

      updates.push({ userId, status: nextStatus });
    }

    if (updates.length === 0) return;

    const startupState = getStartupState(this);
    let hasStateChanges = false;
    for (const update of updates) {
      hasStateChanges =
        handlePresenceUpdateEntry(this, update, monitoredIds, startupState) || hasStateChanges;
    }
    if (hasStateChanges) {
      this._plugin._widgetDirty = true;
      this._plugin.debugLog("SensesEngine", "Presence poll detected state changes", {
        source,
        monitoredCount: monitoredIds.size,
      });
    }
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Error in presence status poll", err);
  }
}

function onTypingStart(payload) {
  try {
    const typingPayload = resolveTypingPayload(payload);
    if (!typingPayload) return;
    const { userId, channelId } = typingPayload;

    const userStore = this._resolveUserStore();
    const currentUserId = userStore?.getCurrentUser?.()?.id;
    if (currentUserId && userId === currentUserId) return;

    const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
    if (!monitoredIds || !monitoredIds.has(userId)) return;

    const deployment = this._plugin.deploymentManager.getDeploymentForUser(userId);
    if (!deployment) return;

    const { guildId, channelName } = resolveTypingChannelContext(
      this,
      channelId,
      typingPayload.guildId
    );

    const eventScopeId = guildId || GLOBAL_UTILITY_FEED_ID;
    const cooldownKey = `${userId}:${channelId || eventScopeId}`;
    const now = Date.now();
    const cooldownMs = this._getTypingCooldownMs();
    if (shouldSkipTypingToast(this, cooldownKey, now, cooldownMs)) return;

    const userName = this._resolveUserName(userId, deployment.targetUsername || "Unknown");
    const guildName = guildId ? this._plugin._getGuildName(guildId) : "Shadow Network";
    const locationLabel = channelId ? `${guildName} #${channelName}` : guildName;

    if (this._plugin.settings?.typingAlerts) {
      this._toast(
        `[${deployment.shadowRank}] ${deployment.shadowName} senses ${userName} typing in ${locationLabel}`,
        "info",
        4000
      );
    }

    syncLastSeenCount(this, guildId);
    this._plugin._widgetDirty = true;
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Error in TYPING_START handler", err);
  }
}

function onRelationshipChange() {
  try {
    const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
    if (!monitoredIds || monitoredIds.size === 0) {
      this._snapshotFriendRelationships();
      return;
    }

    const previousFriends = this._relationshipFriendIds || new Set();
    const nextFriends = this._getFriendIdSet();
    this._relationshipFriendIds = nextFriends;
    if (previousFriends.size === 0) return;

    const removedFriendIds = getRemovedFriendIds(previousFriends, nextFriends);
    if (removedFriendIds.length === 0) return;

    let hasSignals = false;
    for (const removedId of removedFriendIds) {
      if (!monitoredIds.has(removedId)) continue;
      const deployment = this._plugin.deploymentManager.getDeploymentForUser(removedId);
      if (!deployment) continue;

      const userName = this._resolveUserName(removedId, deployment.targetUsername || "Unknown");
      if (this._plugin.settings?.removedFriendAlerts) {
        this._toast(
          `[${deployment.shadowRank}] ${deployment.shadowName} reports: ${userName} removed your connection`,
          "warning", 5000
        );
      }
      hasSignals = true;
    }
    if (hasSignals) this._plugin._widgetDirty = true;
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Error in relationship handler", err);
  }
}

function onMessageCreate(payload) {
  try {
    const message = payload?.message;
    if (!message?.author?.id) return;
    const authorId = message.author.id;
    const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
    if (!monitoredIds.has(authorId)) return;
    const deployment = this._plugin.deploymentManager.getDeploymentForUser(authorId);
    if (!deployment) return;

    ensureCurrentGuildId(this);
    const channelContext = resolveMessageChannelContext(this, message);
    if (!channelContext) return;
    const { guildId, channelName } = channelContext;
    const guildName = this._plugin._getGuildName(guildId);
    const isAwayGuild = guildId !== this._currentGuildId;
    const authorName = message.author.username || message.author.global_name || "Unknown";
    const presenceStore = this._resolvePresenceStore();
    const userStatus = this._normalizeStatus(presenceStore?.getStatus?.(authorId) || "offline");
    const isInvisible = userStatus === "offline" || userStatus === "invisible";

    const startupState = getStartupState(this);
    trackUserActivity(this, {
      authorId,
      authorName,
      deployment,
      guildName,
      channelName,
      startupState,
      now: startupState.now,
    });

    const entry = {
      eventType: "message",
      messageId: message.id,
      authorId,
      authorName,
      channelId: message.channel_id,
      channelName,
      guildId,
      guildName,
      content: buildMessageContent(message),
      timestamp: startupState.now,
      shadowName: deployment.shadowName,
      shadowRank: deployment.shadowRank,
    };

    entry.priority = this._computePriority(message, guildId, entry);
    const merged = this._tryBurstGroup(guildId, entry);
    if (!merged) {
      this._addToGuildFeed(guildId, entry);
      this._registerBurst(guildId, entry);
    }

    const matchToastType = showMatchReasonToast(this, {
      entry,
      deployment,
      authorId,
      authorName,
      guildName,
      isInvisible,
    });
    applyPresenceToastAndLastSeen(this, {
      entry,
      guildId,
      guildName,
      isAwayGuild,
      userStatus,
      isInvisible,
      matchToastType,
      suppressGenericToast: matchToastType === "mention",
    });

    this._sessionMessageCount++;
    this._totalDetections++;
    this._plugin._widgetDirty = true;
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Error in MESSAGE_CREATE handler", err);
  }
}

function onChannelSelect(payload) {
  try {
    const newGuildId = resolveSelectedGuildId(this, payload);
    if (newGuildId === this._currentGuildId) return;
    notifyUnseenSignalsForGuild(this, newGuildId);
    this._currentGuildId = newGuildId;
    this._plugin.debugLog("SensesEngine", "Guild switched", { newGuildId });
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Error in CHANNEL_SELECT handler", err);
  }
}

module.exports = {
  _onChannelSelect: onChannelSelect,
  _onMessageCreate: onMessageCreate,
  _pollMonitoredPresenceStatuses: pollMonitoredPresenceStatuses,
  _onPresenceUpdate: onPresenceUpdate,
  _onRelationshipChange: onRelationshipChange,
  _seedUserActivityFromFeeds: seedUserActivityFromFeeds,
  _onTypingStart: onTypingStart,
  onChannelSelect,
  onMessageCreate,
  pollMonitoredPresenceStatuses,
  onPresenceUpdate,
  onRelationshipChange,
  seedUserActivityFromFeeds,
  onTypingStart,
};
