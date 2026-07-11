const {
  BURST_WINDOW_MS,
  GLOBAL_UTILITY_FEED_ID,
  STARTUP_TOAST_GRACE_MS,
} = require("./constants");

const { resolvePresenceUpdateStatus } = require("./senses-engine-utils");
const { getNavigationUtils } = require("../shared/navigation");

const DEFAULT_AVATAR_URL = "https://cdn.discordapp.com/embed/avatars/0.png";

// Navigate Discord to a channel (or specific message inside it). Used as the
// onClick handler for typing/sent toast cards so clicking jumps to the chat.
function navigateToChannel(guildId, channelId, messageId) {
  // Channel-only navigation via NavigationUtils.transitionTo. The
  // previous experiment with MessageActions.jumpToMessage to trigger
  // Discord's scroll-to-message + flash-highlight animation was
  // unreliable across Discord builds and was removed per user request.
  // This helper now just lands the user in the target channel — the
  // URL includes the messageId segment so Discord shows the message
  // hash in the path, but no scroll/flash animation is attempted.
  try {
    const nav = getNavigationUtils();
    if (!nav?.transitionTo || !channelId) return false;
    const guildSeg = guildId && guildId !== "DM" ? guildId : "@me";
    const path = `/channels/${guildSeg}/${channelId}${messageId ? "/" + messageId : ""}`;
    nav.transitionTo(path);
    return true;
  } catch (_) {
    return false;
  }
}
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
  // PERF: O(1) — Map preserves insertion order; oldest entry is first key.
  // upsertUserLastActivity deletes+re-inserts on update, so insertion order = recency.
  const oldest = ctx._userLastActivity.keys().next().value;
  if (oldest != null) ctx._userLastActivity.delete(oldest);
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

/**
 * Extract a lean set of media references (image / video attachments +
 * embed thumbnails) for inline rendering in the FeedTab. Returns
 * { attachments, embeds } — both arrays may be empty. URLs prefer
 * proxy_url (Discord's CDN-cached version) over raw url so we benefit
 * from Discord's image optimization pipeline.
 *
 * Filters aggressively: only images & videos (no PDFs / archives), only
 * embeds with a renderable still image (no plain link embeds). Tenor
 * GIFs land in `embeds` as type "gifv" with a still thumbnail — we
 * intentionally keep the STILL (thumbnail) URL not the animated MP4
 * URL because the user opted for no-lag previews.
 */
function buildMessageMedia(message) {
  const attachments = [];
  const embeds = [];

  if (Array.isArray(message.attachments)) {
    for (const a of message.attachments) {
      if (!a) continue;
      const ct = a.content_type || "";
      if (!ct.startsWith("image/") && !ct.startsWith("video/")) continue;
      const url = a.proxy_url || a.url;
      if (!url) continue;
      attachments.push({
        url,
        contentType: ct,
        width: Number(a.width) || undefined,
        height: Number(a.height) || undefined,
        filename: a.filename ? String(a.filename).slice(0, 80) : undefined,
      });
    }
  }

  if (Array.isArray(message.embeds)) {
    for (const e of message.embeds) {
      if (!e) continue;
      // Renderable: gifv (Tenor), image, video, or any embed with a
      // thumbnail. Skip plain link embeds (no preview to show).
      const thumb = e.thumbnail;
      const renderable =
        e.type === "gifv" ||
        e.type === "image" ||
        e.type === "video" ||
        (thumb && (thumb.proxy_url || thumb.url));
      if (!renderable) continue;
      const thumbnailUrl = thumb?.proxy_url || thumb?.url || null;
      if (!thumbnailUrl) continue;
      embeds.push({
        type: String(e.type || "embed"),
        thumbnailUrl,
        width: Number(thumb?.width) || undefined,
        height: Number(thumb?.height) || undefined,
        title: e.title ? String(e.title).slice(0, 80) : undefined,
      });
    }
  }

  return { attachments, embeds };
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
  // Click-to-jump — every match-reason toast carries a #channel reference,
  // so clicking the toast should navigate to that exact message. Captured
  // by closure so the IDs stay stable even if `entry` is later mutated.
  const jumpClick = () => navigateToChannel(entry.guildId, entry.channelId, entry.messageId);

  if (entry.matchReason === "mention") {
    ctx._showMentionToast({
      userId: authorId,
      userName: authorName,
      label: `@mentioned you${invisibleSuffix}`,
      detail: `in ${guildName} #${entry.channelName}${snippet}`,
      accent: "#ef4444",
      deployment,
      onClick: jumpClick,
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
      onClick: jumpClick,
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
    onClick: jumpClick,
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
      // Click-to-jump — navigate to the exact message that triggered
      // this toast, same as the match-reason toasts above.
      onClick: () => navigateToChannel(entry.guildId, entry.channelId, entry.messageId),
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

  // Suppress toasts during the early-startup grace window. seedTrackedStatuses()
  // runs immediately after subscribe() but the PresenceStore is typically empty
  // on Discord cold-start (gateway hasn't yet streamed PRESENCE_UPDATE frames),
  // so the seed snapshot is "everyone offline". The first real frames per
  // friend arrive within seconds and look like offline→online transitions —
  // which historically fired a toast for every online friend on every Discord
  // launch. The state mutation above ALREADY ran, so _statusByUserId is now
  // correctly baselined; we just skip the user-facing toast for this entry.
  if (startupState.isEarlyStartup) return true;

  if (ctx._plugin.settings?.statusAlerts) {
    const toastPayload = {
      userId,
      userName: ctx._resolveUserName(userId, deployment.targetUsername || "Unknown"),
      previousLabel: ctx._getStatusLabel(previousStatus),
      nextLabel: ctx._getStatusLabel(nextStatus),
      nextStatus,
      deployment,
    };
    ctx._showStatusToast(toastPayload);
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

  // PERF: the full monitored-set rescan against the presence store was
  // removed here — it duplicated _pollMonitoredPresenceStatuses (index.js
  // subscribe(): PresenceStore.addChangeListener, 200ms debounce), which
  // already owns catching monitored-user transitions missed by a given
  // dispatcher batch, and fires on every store mutation (a broader trigger
  // set than the 4 dispatcher event names this function is fed from).
  return Array.from(mergedByUserId.values());
}

function onPresenceUpdate(payload) {
  try {
    const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
    if (!monitoredIds || monitoredIds.size === 0) return;

    const updates = this._extractPresenceUpdates(payload, monitoredIds);
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
    if (!(monitoredIds instanceof Set) || monitoredIds.size === 0) {
      this._statusByUserId.clear();
      return;
    }

    // Clean up stale entries for unmonitored users.
    for (const userId of Array.from(this._statusByUserId.keys())) {
      if (!monitoredIds.has(userId)) this._statusByUserId.delete(userId);
    }

    const presenceStore = this._resolvePresenceStore();
    if (!presenceStore || typeof presenceStore.getStatus !== "function") return;

    // Use full state snapshot for most reliable reads (like FriendNotifications).
    // getState().clientStatuses has per-user { desktop/mobile/web } status maps.
    let clientStatuses = null;
    try {
      clientStatuses = presenceStore.getState?.()?.clientStatuses;
    } catch (_) {}

    const startupState = getStartupState(this);
    let hasStateChanges = false;

    for (const monitoredId of monitoredIds) {
      const userId = String(monitoredId || "").trim();
      if (!userId) continue;

      // Resolve status from clientStatuses snapshot first, fall back to getStatus()
      let nextStatus = null;
      try {
        if (clientStatuses && clientStatuses[userId]) {
          // clientStatuses[userId] = { desktop: "online", mobile: "idle", web: "offline" }
          // Pick the "highest" status across clients
          const clientMap = clientStatuses[userId];
          const statusPriority = { online: 4, dnd: 3, idle: 2, offline: 1 };
          let bestStatus = "offline";
          let bestPrio = 0;
          for (const clientStatus of Object.values(clientMap)) {
            const prio = statusPriority[clientStatus] || 0;
            if (prio > bestPrio) { bestPrio = prio; bestStatus = clientStatus; }
          }
          nextStatus = this._normalizeStatus(bestStatus);
        } else {
          const rawStatus = presenceStore.getStatus(userId);
          if (typeof rawStatus === "string" && rawStatus.trim().length > 0) {
            nextStatus = this._normalizeStatus(rawStatus);
          } else {
            nextStatus = "offline";
          }
        }
      } catch (_) {
        nextStatus = "offline";
      }

      const previousStatus = this._statusByUserId.get(userId);

      // First time seeing this user — seed without triggering a notification.
      // FIX: We still seed, but the seed is correct from the start (not always "offline").
      if (previousStatus === undefined) {
        this._statusByUserId.set(userId, nextStatus);
        continue;
      }

      // No change — skip
      if (previousStatus === nextStatus) continue;

      // Status changed! Process as an update.
      const changed = handlePresenceUpdateEntry(this, { userId, status: nextStatus }, monitoredIds, startupState);
      if (changed) hasStateChanges = true;
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

    // Suppress toast if user is currently viewing the same channel —
    // Discord's native typing indicator already shows there.
    // Use the instance-cached _SelectedChannelStore (resolved once in
    // initWebpack) rather than calling getStore on every TYPING_START.
    if (channelId) {
      try {
        const selectedChannelId = this._plugin._SelectedChannelStore?.getChannelId?.();
        if (selectedChannelId && selectedChannelId === channelId) return;
      } catch (_) { /* fall through if store unavailable */ }
    }

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
      // Track this typing event so onMessageCreate can replace the toast
      // with a "sent" toast if the user posts within the next ~30s.
      this._lastTypingAt = this._lastTypingAt || new Map();
      this._lastTypingAt.set(userId, {
        ts: Date.now(),
        channelId,
        guildId,
        channelName,
        guildName,
        userName,
        deployment,
      });
      // LEAK FIX: prune stale typing entries (>60s old) on each insert so
      // the Map doesn't grow unbounded across long sessions.
      const _ltaExpiry = Date.now() - 60000;
      for (const [_ltaKey, _ltaVal] of this._lastTypingAt) {
        if (_ltaVal.ts < _ltaExpiry) this._lastTypingAt.delete(_ltaKey);
      }

      if (this._toastEngine) {
        const avatarUrl = this._resolveUserAvatarUrl(userId) || DEFAULT_AVATAR_URL;
        this._toastEngine.showCardToast({
          avatarUrl,
          accentColor: "#9333ea",
          // Header dropped: the "[shadow] senses" framing felt redundant
          // alongside the body line. Avatar + purple accent still identify
          // the toast as ShadowSenses intel.
          body: `${userName} typing in ${locationLabel}`,
          // Persistent-ish: Discord re-fires TYPING_START every ~10s while
          // the user is typing; each fire refreshes via replaceKey. Auto-
          // fades after 30s if they stop typing without sending.
          timeout: 30000,
          callerId: "shadowSenses-typing",
          maxPerMinute: 60,
          replaceKey: `shadowsenses-typing:${userId}`,
          // No onClick on typing — only sent toast jumps to channel.
        });
      } else {
        this._toast(
          `[${deployment.shadowRank}] ${deployment.shadowName} senses ${userName} typing in ${locationLabel}`,
          "info",
          4000
        );
      }
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

    // Media extraction for inline FeedTab previews (Tenor GIF stills +
    // image attachments). Both arrays may be empty for plain text msgs.
    const { attachments: mediaAttachments, embeds: mediaEmbeds } = buildMessageMedia(message);

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
      attachments: mediaAttachments.length > 0 ? mediaAttachments : undefined,
      embeds: mediaEmbeds.length > 0 ? mediaEmbeds : undefined,
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
      suppressGenericToast: matchToastType !== null,
    });

    // Typing -> Sent: if this author had a typing toast active recently,
    // replace it with a "sent in #channel" toast that links to the message.
    // SKIP entirely when the author is invisible — the red
    // "sent a message while invisible" toast fired upstream by
    // applyPresenceToastAndLastSeen already covers this case and has
    // priority; firing the green typing→sent toast on top would be
    // duplicate noise. Still clear the typing record so the next event
    // doesn't see a stale entry.
    if (this._lastTypingAt && isInvisible) {
      this._lastTypingAt.delete(authorId);
    } else if (this._lastTypingAt) {
      const recent = this._lastTypingAt.get(authorId);
      if (recent && Date.now() - recent.ts < 30000) {
        this._lastTypingAt.delete(authorId);
        if (this._toastEngine) {
          const avatarUrl = this._resolveUserAvatarUrl(authorId) || DEFAULT_AVATAR_URL;
          const friendSuffix = this._isFriend(authorId) ? " [FRIEND]" : "";
          this._toastEngine.showCardToast({
            avatarUrl,
            accentColor: "#22c55e",
            header: `[${deployment.shadowRank}] ${deployment.shadowName} reports${friendSuffix}`,
            body: `${authorName} sent in ${guildName} #${channelName}`,
            detail: "Click to view message",
            timeout: 5000,
            callerId: "shadowSenses-sent",
            maxPerMinute: 30,
            // SAME replaceKey as the typing toast so this dismisses it.
            replaceKey: `shadowsenses-typing:${authorId}`,
            onClick: () => navigateToChannel(guildId, message.channel_id, message.id),
          });
        }
      }
    }

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
};
