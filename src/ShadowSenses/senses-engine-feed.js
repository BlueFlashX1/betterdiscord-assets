const {
  BURST_WINDOW_MS,
  FEED_MAX_AGE_MS,
  GLOBAL_FEED_CAP,
  GUILD_FEED_CAP,
  PLUGIN_NAME,
  PRIORITY,
} = require("./constants");

function markFeedDirty(ctx, guildId) {
  ctx._feedVersion++;
  ctx._dirtyGuilds.add(guildId);
  ctx._dirty = true;
}

function clearGuildBurstEntries(ctx, guildId) {
  for (const [key, burst] of ctx._burstMap) {
    if (burst.guildId === guildId) ctx._burstMap.delete(key);
  }
}

function enforceGuildFeedCap(ctx, guildId) {
  const feed = ctx._guildFeeds[guildId];
  if (!feed || feed.length <= GUILD_FEED_CAP) return;
  feed.shift();
  ctx._totalFeedEntries--;
  clearGuildBurstEntries(ctx, guildId);
}

function getLargestGuildFeedEntry(feedsByGuild) {
  let maxGuild = null;
  let maxLen = 0;
  for (const [guildId, feed] of Object.entries(feedsByGuild)) {
    if (feed.length > maxLen) {
      maxGuild = guildId;
      maxLen = feed.length;
    }
  }
  return { maxGuild, maxLen };
}

function enforceGlobalFeedCap(ctx) {
  if (ctx._totalFeedEntries <= GLOBAL_FEED_CAP) return;
  const { maxGuild, maxLen } = getLargestGuildFeedEntry(ctx._guildFeeds);
  if (!maxGuild || maxLen <= 0) return;

  const trimTo = Math.max(100, Math.floor(maxLen / 2));
  const trimmed = maxLen - trimTo;
  ctx._guildFeeds[maxGuild] = ctx._guildFeeds[maxGuild].slice(-trimTo);
  ctx._totalFeedEntries -= trimmed;
  clearGuildBurstEntries(ctx, maxGuild);
  ctx._dirtyGuilds.add(maxGuild);
  ctx._plugin.debugLog?.(
    "SensesEngine",
    `Global cap: trimmed guild ${maxGuild} from ${maxLen} to ${trimTo}`
  );
}

function setMatchReason(entry, reason, matchedTerm) {
  entry.matchReason = reason;
  if (matchedTerm) entry.matchedTerm = matchedTerm;
}

function getLowerContent(message, entry) {
  if (typeof message?.content === "string" && message.content.length > 0) {
    return message.content.toLowerCase();
  }
  if (typeof entry?.content === "string" && entry.content.length > 0) {
    return entry.content.toLowerCase();
  }
  return "";
}

function getPerTargetAlertKeywords(ctx, authorId) {
  const manager = ctx?._plugin?.deploymentManager;
  if (!manager) return [];
  if (typeof manager.getAlertKeywordsForUser === "function") {
    return manager.getAlertKeywordsForUser(authorId);
  }
  const deployment = manager.getDeploymentForUser?.(authorId);
  return Array.isArray(deployment?.alertKeywords) ? deployment.alertKeywords : [];
}

function findTermMatch(terms, contentLower) {
  if (!contentLower || !Array.isArray(terms) || terms.length === 0) return null;
  for (const term of terms) {
    if (!term) continue;
    if (contentLower.includes(term.toLowerCase())) return term;
  }
  return null;
}

function isDirectMention(message, currentUserId) {
  if (!currentUserId || !Array.isArray(message?.mentions)) return false;
  for (const mention of message.mentions) {
    if (String(mention?.id || mention) === currentUserId) return true;
  }
  return false;
}

function hasCurrentUserRoleMention(ctx, guildId, currentUserId, roleMentions) {
  if (!currentUserId || !guildId || !Array.isArray(roleMentions) || roleMentions.length === 0) {
    return false;
  }
  try {
    const member = ctx._plugin._GuildMemberStore?.getMember?.(guildId, currentUserId);
    if (!member || !Array.isArray(member.roles)) return false;
    const myRoles = new Set(member.roles.map(String));
    for (const roleId of roleMentions) {
      if (myRoles.has(String(roleId))) return true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

function isBurstCandidateMatch(candidate, entry) {
  return (
    !!candidate &&
    candidate.eventType === "message" &&
    candidate.authorId === entry.authorId &&
    candidate.channelId === entry.channelId
  );
}

function resolveBurstIndexByStoredIndex(feed, burst, entry) {
  const index = burst.feedIndex;
  if (!Number.isInteger(index) || index < 0 || index >= feed.length) return -1;
  return isBurstCandidateMatch(feed[index], entry) ? index : -1;
}

function resolveBurstIndexByMessageId(feed, burst, entry) {
  if (!burst.messageId) return -1;
  for (let i = feed.length - 1; i >= 0; i--) {
    const candidate = feed[i];
    if (!isBurstCandidateMatch(candidate, entry)) continue;
    if (candidate.messageId === burst.messageId) return i;
  }
  return -1;
}

function resolveBurstIndexByWindow(feed, entry) {
  const cutoff = entry.timestamp - BURST_WINDOW_MS;
  for (let i = feed.length - 1; i >= 0; i--) {
    const candidate = feed[i];
    if (!isBurstCandidateMatch(candidate, entry)) continue;
    if ((candidate.timestamp || 0) < cutoff) break;
    return i;
  }
  return -1;
}

function shouldAllowBurstMerge(ctx, priorityValue) {
  const allowHighPriorityBursts = !!ctx._plugin.settings?.groupHighPriorityBursts;
  if (!allowHighPriorityBursts && (priorityValue || 1) >= PRIORITY.HIGH) return false;
  return true;
}

function updateBurstAfterMerge(burst, targetIndex, target, entry) {
  burst.feedIndex = targetIndex;
  burst.messageId = target.messageId || entry.messageId || burst.messageId || null;
  burst.timestamp = entry.timestamp;
}

function flushToDisk() {
  try {
    const dirtyCount = this._dirtyGuilds.size;
    if (dirtyCount === 0 && !this._dirty) return;

    // Save only dirty guilds (O(1 guild) instead of O(all guilds))
    for (const guildId of this._dirtyGuilds) {
      BdApi.Data.save(PLUGIN_NAME, `feed_${guildId}`, this._guildFeeds[guildId] || []);
    }
    // Save guild index for load-time discovery + detection counter
    BdApi.Data.save(PLUGIN_NAME, "feedGuildIds", Object.keys(this._guildFeeds));
    BdApi.Data.save(PLUGIN_NAME, "totalDetections", this._totalDetections);

    this._dirtyGuilds.clear();
    this._dirty = false;
    this._plugin.debugLog("SensesEngine", "Flushed to disk", {
      dirtyGuilds: dirtyCount,
      totalGuilds: Object.keys(this._guildFeeds).length,
    });
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Failed to flush to disk", err);
  }
}

function addToGuildFeed(guildId, entry) {
  if (!this._guildFeeds[guildId]) this._guildFeeds[guildId] = [];
  const feed = this._guildFeeds[guildId];
  feed.push(entry);
  this._totalFeedEntries++;
  enforceGuildFeedCap(this, guildId);
  enforceGlobalFeedCap(this);
  markFeedDirty(this, guildId);
}

/**
 * Remove feed entries older than FEED_MAX_AGE_MS (3 days).
 * Called on startup and periodically via _purgeInterval.
 */
function purgeOldEntries() {
  const cutoff = Date.now() - FEED_MAX_AGE_MS;
  let totalPurged = 0;

  for (const guildId of Object.keys(this._guildFeeds)) {
    const feed = this._guildFeeds[guildId];
    if (!feed || feed.length === 0) continue;

    // Entries are chronological — find first entry newer than cutoff
    let keepFrom = 0;
    while (keepFrom < feed.length && feed[keepFrom].timestamp < cutoff) {
      keepFrom++;
    }

    if (keepFrom > 0) {
      this._guildFeeds[guildId] = feed.slice(keepFrom);
      this._totalFeedEntries -= keepFrom;
      totalPurged += keepFrom;
      this._dirtyGuilds.add(guildId);
      this._dirty = true;

      // Remove empty guilds from feeds
      if (this._guildFeeds[guildId].length === 0) {
        delete this._guildFeeds[guildId];
      }
    }
  }

  if (totalPurged > 0) {
    this._feedVersion++;
    this._plugin.debugLog("SensesEngine", `Purged ${totalPurged} entries older than 3 days`);
  }
}

/**
 * Remove non-message utility events from persisted history.
 * Utility alerts (status/typing/relationship) are toast-only.
 */
function purgeUtilityEntries() {
  let removed = 0;
  for (const guildId of Object.keys(this._guildFeeds)) {
    const feed = this._guildFeeds[guildId];
    if (!Array.isArray(feed) || feed.length === 0) continue;

    const filtered = feed.filter((entry) => !entry?.eventType || entry.eventType === "message");
    if (filtered.length === feed.length) continue;

    const diff = feed.length - filtered.length;
    this._guildFeeds[guildId] = filtered;
    this._totalFeedEntries -= diff;
    removed += diff;
    this._dirtyGuilds.add(guildId);
    this._dirty = true;

    if (filtered.length === 0) delete this._guildFeeds[guildId];
  }

  if (removed > 0) {
    this._feedVersion++;
    this._plugin.debugLog("SensesEngine", `Purged ${removed} non-message utility entries`);
  }
}

/**
 * Compute priority (P1-P4) for a message from a monitored user.
 * Short-circuits from highest to lowest; fails open to P1.
 */
function computePriority(message, guildId, entry) {
  const currentUser = this._plugin._UserStore?.getCurrentUser?.();
  const currentUserId = currentUser?.id;
  const contentLower = getLowerContent(message, entry);
  const targetKeyword = findTermMatch(
    getPerTargetAlertKeywords(this, message?.author?.id || entry?.authorId),
    contentLower
  );
  if (targetKeyword) {
    entry.userKeywordMatch = targetKeyword;
  }

  if (isDirectMention(message, currentUserId)) {
    setMatchReason(entry, "mention");
    return PRIORITY.CRITICAL;
  }

  if (currentUserId && message.referenced_message?.author?.id === currentUserId) {
    setMatchReason(entry, "reply");
    return PRIORITY.HIGH;
  }

  if (message.mention_everyone) {
    setMatchReason(entry, "everyone");
    return PRIORITY.HIGH;
  }

  const mentionName = findTermMatch(this._plugin.settings?.mentionNames, contentLower);
  if (mentionName) {
    setMatchReason(entry, "name", mentionName);
    return PRIORITY.HIGH;
  }

  if (hasCurrentUserRoleMention(this, guildId, currentUserId, message.mention_roles)) {
    setMatchReason(entry, "role");
    return PRIORITY.MEDIUM;
  }

  if (targetKeyword) {
    setMatchReason(entry, "targetKeyword", targetKeyword);
    return PRIORITY.MEDIUM;
  }

  const keyword = findTermMatch(this._plugin.settings?.priorityKeywords, contentLower);
  if (keyword) {
    setMatchReason(entry, "keyword", keyword);
    return PRIORITY.MEDIUM;
  }

  return PRIORITY.LOW;
}

/**
 * Resolve the current feed index for an existing burst key.
 * This recovers from stale `feedIndex` values after feed insertions/trims.
 */
function resolveBurstTargetIndex(guildId, burst, entry) {
  const feed = this._guildFeeds[guildId];
  if (!feed || feed.length === 0) return -1;

  const byStoredIndex = resolveBurstIndexByStoredIndex(feed, burst, entry);
  if (byStoredIndex >= 0) return byStoredIndex;

  const byMessageId = resolveBurstIndexByMessageId(feed, burst, entry);
  if (byMessageId >= 0) return byMessageId;

  return resolveBurstIndexByWindow(feed, entry);
}

function tryBurstGroup(guildId, entry) {
  if (!shouldAllowBurstMerge(this, entry.priority)) return false;

  const key = `${entry.authorId}:${entry.channelId}`;
  const burst = this._burstMap.get(key);
  if (!burst || burst.guildId !== guildId) return false;

  if (entry.timestamp - burst.timestamp > BURST_WINDOW_MS) {
    this._burstMap.delete(key);
    return false;
  }

  const feed = this._guildFeeds[guildId];
  if (!feed || feed.length === 0) {
    this._burstMap.delete(key);
    return false;
  }

  const targetIndex = this._resolveBurstTargetIndex(guildId, burst, entry);
  if (targetIndex < 0) {
    this._burstMap.delete(key);
    return false;
  }
  const target = feed[targetIndex];

  // Don't merge into a high-priority entry
  if (!shouldAllowBurstMerge(this, target.priority)) return false;

  // Merge in-place
  if (!target.firstContent) target.firstContent = target.content;
  target.content = entry.content;
  target.messageId = entry.messageId;
  target.timestamp = entry.timestamp;
  target.messageCount = (target.messageCount || 1) + 1;
  if ((entry.priority || 1) > (target.priority || 1)) target.priority = entry.priority;

  updateBurstAfterMerge(burst, targetIndex, target, entry);
  markFeedDirty(this, guildId);
  return true;
}

/**
 * Register a new entry for potential future burst grouping.
 */
function registerBurst(guildId, entry) {
  const key = `${entry.authorId}:${entry.channelId}`;
  const feed = this._guildFeeds[guildId];
  if (!feed) return;
  this._burstMap.set(key, {
    guildId,
    feedIndex: feed.length - 1,
    messageId: entry.messageId || null,
    timestamp: entry.timestamp,
  });
  // LRU cap
  if (this._burstMap.size > 200) {
    this._burstMap.delete(this._burstMap.keys().next().value);
  }
}

/**
 * Returns merged feed from all guilds EXCEPT the one you're currently viewing,
 * sorted by timestamp (newest last). This gives you a cross-server "what did I miss"
 * view that automatically excludes the guild you're already looking at.
 */
function getActiveFeed() {
  const merged = [];
  for (const [guildId, feed] of Object.entries(this._guildFeeds)) {
    if (guildId === this._currentGuildId) continue; // Skip current guild
    for (let i = 0; i < feed.length; i++) {
      merged.push(feed[i]);
    }
  }
  // Sort by timestamp ascending (oldest first, newest at bottom for scroll)
  merged.sort((a, b) => a.timestamp - b.timestamp);
  return merged;
}

/** Count of away-guild feed entries — no array copy. */
function getActiveFeedCount() {
  let count = 0;
  for (const [guildId, feed] of Object.entries(this._guildFeeds)) {
    if (guildId === this._currentGuildId) continue;
    count += feed.length;
  }
  return count;
}

function getMarkedOnlineCount() {
  const monitoredIds = this._plugin.deploymentManager?.getMonitoredUserIds?.();
  if (!monitoredIds || monitoredIds.size === 0) return 0;

  const presenceStore = this._resolvePresenceStore();
  if (!presenceStore || typeof presenceStore.getStatus !== "function") return 0;

  let onlineCount = 0;
  for (const userId of monitoredIds) {
    try {
      const status = this._normalizeStatus(presenceStore.getStatus(userId));
      this._statusByUserId.set(userId, status);
      if (this._isOnlineStatus(status)) onlineCount++;
    } catch (_) {}
  }
  return onlineCount;
}

function getSessionMessageCount() {
  return this._sessionMessageCount;
}

function getTotalDetections() {
  return this._totalDetections;
}

module.exports = {
  _addToGuildFeed: addToGuildFeed,
  _computePriority: computePriority,
  _flushToDisk: flushToDisk,
  _purgeOldEntries: purgeOldEntries,
  _purgeUtilityEntries: purgeUtilityEntries,
  _registerBurst: registerBurst,
  _resolveBurstTargetIndex: resolveBurstTargetIndex,
  _tryBurstGroup: tryBurstGroup,
  addToGuildFeed,
  computePriority,
  flushToDisk,
  getActiveFeed,
  getActiveFeedCount,
  getMarkedOnlineCount,
  getSessionMessageCount,
  getTotalDetections,
  purgeOldEntries,
  purgeUtilityEntries,
  registerBurst,
  resolveBurstTargetIndex,
  tryBurstGroup,
};
