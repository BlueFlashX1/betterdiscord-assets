const {
  GLOBAL_UTILITY_FEED_ID,
  STARTUP_TOAST_GRACE_MS,
} = require("./constants");

const DEFAULT_AVATAR_URL = "https://cdn.discordapp.com/embed/avatars/0.png";

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
  const silenceHours = Math.floor(silenceMs / (60 * 60 * 1000));
  const silenceMins = Math.floor((silenceMs % (60 * 60 * 1000)) / (60 * 1000));
  if (silenceHours > 0) {
    return `${silenceHours}h${silenceMins > 0 ? ` ${silenceMins}m` : ""}`;
  }
  return `${silenceMins}m`;
}

function pruneUserActivityCache(ctx) {
  if (ctx._userLastActivity.size <= ctx._USER_ACTIVITY_MAX) return;
  let oldestUserId = null;
  let oldestTs = Infinity;
  for (const [uid, data] of ctx._userLastActivity) {
    if (data.timestamp < oldestTs) {
      oldestUserId = uid;
      oldestTs = data.timestamp;
    }
  }
  if (oldestUserId) ctx._userLastActivity.delete(oldestUserId);
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

  if (!lastActivity) {
    withStartupDelay(ctx, startupState, () =>
      showActivityToast(ctx, {
        authorId,
        deployment,
        authorName,
        guildName,
        channelName,
        accentColor: "#22c55e",
        body: `${authorName} is now active`,
        detail: `${guildName} #${channelName}`,
        fallbackType: "quest",
        fallbackBody: `${authorName} is now active`,
      })
    );
    ctx._userLastActivity.set(authorId, { timestamp: now, notifiedActive: true });
    return;
  }

  const silenceMs = now - lastActivity.timestamp;
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

  ctx._userLastActivity.set(authorId, { timestamp: now, notifiedActive: true });
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
  } = params;
  const snippet = entry.content ? `: "${entry.content.slice(0, 80)}"` : "";

  if (entry.matchReason === "mention") {
    ctx._showMentionToast({
      userId: authorId,
      userName: authorName,
      label: "@mentioned you",
      detail: `in ${guildName} #${entry.channelName}${snippet}`,
      accent: "#ef4444",
      deployment,
    });
    return;
  }

  if (entry.matchReason === "name") {
    ctx._showMentionToast({
      userId: authorId,
      userName: authorName,
      label: `said "${entry.matchedTerm}"`,
      detail: `in ${guildName} #${entry.channelName}${snippet}`,
      accent: "#ec4899",
      deployment,
    });
    return;
  }

  const keywordTerm = entry.userKeywordMatch || (entry.matchReason === "targetKeyword"
    ? entry.matchedTerm
    : null);
  if (!keywordTerm) return;
  ctx._showMentionToast({
    userId: authorId,
    userName: authorName,
    label: `keyword "${keywordTerm}"`,
    detail: `in ${guildName} #${entry.channelName}${snippet}`,
    accent: "#34d399",
    deployment,
  });
}

function applyPresenceToastAndLastSeen(ctx, params) {
  const {
    entry,
    guildId,
    guildName,
    isAwayGuild,
    authorId,
  } = params;
  const presenceStore = ctx._resolvePresenceStore();
  const userStatus = presenceStore?.getStatus?.(authorId) || "offline";
  const isInvisible = userStatus === "offline";

  if (isAwayGuild) {
    ctx._toast(
      `[${entry.shadowRank}] ${entry.shadowName} sensed ${entry.authorName} in ${guildName} #${entry.channelName}`,
      "info"
    );
    return;
  }

  if (isInvisible) {
    ctx._toast(
      `[${entry.shadowRank}] ${entry.shadowName} sensed ${entry.authorName} (invisible) in #${entry.channelName}`,
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

function onPresenceUpdate(payload) {
  try {
    const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
    if (!monitoredIds || monitoredIds.size === 0) return;

    const updates = this._extractPresenceUpdates(payload);
    if (updates.length === 0) return;

    const startupState = getStartupState(this);
    let hasStateChanges = false;
    for (const update of updates) {
      hasStateChanges =
        handlePresenceUpdateEntry(this, update, monitoredIds, startupState) || hasStateChanges;
    }
    if (hasStateChanges) this._plugin._widgetDirty = true;
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Error in PRESENCE_UPDATE handler", err);
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

    showMatchReasonToast(this, {
      entry,
      deployment,
      authorId,
      authorName,
      guildName,
    });
    applyPresenceToastAndLastSeen(this, {
      entry,
      guildId,
      guildName,
      isAwayGuild,
      authorId,
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
  _onPresenceUpdate: onPresenceUpdate,
  _onRelationshipChange: onRelationshipChange,
  _onTypingStart: onTypingStart,
  onChannelSelect,
  onMessageCreate,
  onPresenceUpdate,
  onRelationshipChange,
  onTypingStart,
};
