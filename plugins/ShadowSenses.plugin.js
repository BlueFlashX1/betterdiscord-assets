/**
 * @name ShadowSenses
 * @description Deploy shadow soldiers to monitor Discord users — get notified when they speak, even while invisible. Solo Leveling themed.
 * @version 1.0.0
 * @author matthewthompson
 */

// ─── Constants ─────────────────────────────────────────────────────────────

const PLUGIN_NAME = "ShadowSenses";
const STYLE_ID = "shadow-senses-css";
const WIDGET_ID = "shadow-senses-widget";
const WIDGET_SPACER_ID = "shadow-senses-widget-spacer";
const PANEL_CONTAINER_ID = "shadow-senses-panel-root";
const TRANSITION_ID = "shadow-senses-transition-overlay";

const RANKS = ["E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+", "NH", "Monarch", "Monarch+", "Shadow Monarch"];
const RANK_COLORS = {
  E: "#9ca3af", D: "#60a5fa", C: "#34d399", B: "#a78bfa",
  A: "#f59e0b", S: "#ef4444", SS: "#ec4899", SSS: "#8b5cf6",
  "SSS+": "#c084fc", NH: "#14b8a6", Monarch: "#fbbf24",
  "Monarch+": "#f97316", "Shadow Monarch": "#8a2be2",
};

const GUILD_FEED_CAP = 5000;
const GLOBAL_FEED_CAP = 25000;
const FEED_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const PURGE_INTERVAL_MS = 10 * 60 * 1000; // Check for stale entries every 10 minutes
const WIDGET_OBSERVER_DEBOUNCE_MS = 200;
const WIDGET_REINJECT_DELAY_MS = 300;

// ─── DeploymentManager ─────────────────────────────────────────────────────

class DeploymentManager {
  constructor(debugLog, debugError) {
    this._debugLog = debugLog;
    this._debugError = debugError;
    this._deployments = [];
    this._monitoredUserIds = new Set();
    this._deployedShadowIds = new Set();
    this._availableCache = null; // { shadows: [], timestamp: number } — 5s TTL
  }

  load() {
    try {
      const saved = BdApi.Data.load(PLUGIN_NAME, "deployments");
      this._deployments = Array.isArray(saved) ? saved : [];
      this._rebuildSets();
      this._debugLog("DeploymentManager", "Loaded deployments", { count: this._deployments.length });
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to load deployments", err);
      this._deployments = [];
      this._rebuildSets();
    }
  }

  _save() {
    try {
      BdApi.Data.save(PLUGIN_NAME, "deployments", this._deployments);
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to save deployments", err);
    }
  }

  _rebuildSets() {
    this._monitoredUserIds = new Set(this._deployments.map(d => d.targetUserId));
    this._deployedShadowIds = new Set(this._deployments.map(d => d.shadowId));
  }

  async deploy(shadow, targetUser) {
    if (!shadow || !shadow.id || !targetUser) {
      this._debugError("DeploymentManager", "Invalid deploy args", { shadow, targetUser });
      return false;
    }

    if (this._deployedShadowIds.has(shadow.id)) {
      this._debugLog("DeploymentManager", "Shadow already deployed", shadow.id);
      return false;
    }

    const targetUserId = targetUser.id || targetUser.userId;
    if (!targetUserId) {
      this._debugError("DeploymentManager", "No target user ID");
      return false;
    }

    if (this._monitoredUserIds.has(targetUserId)) {
      this._debugLog("DeploymentManager", "User already monitored", targetUserId);
      return false;
    }

    // Re-verify shadow is still available before committing deployment
    try {
      const currentAvailable = await this.getAvailableShadows();
      const stillAvailable = currentAvailable.find(s => s.id === shadow.id);
      if (!stillAvailable) {
        this._debugLog("DeploymentManager", `Shadow ${shadow.id} no longer available, aborting deployment`);
        return false;
      }
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to re-verify shadow availability", err);
      // Proceed with deployment if verification fails — better than blocking
    }

    const record = {
      shadowId: shadow.id,
      shadowName: shadow.roleName || shadow.role || "Shadow",
      shadowRank: shadow.rank || "E",
      targetUserId,
      targetUsername: targetUser.username || targetUser.globalName || "Unknown",
      deployedAt: Date.now(),
    };

    this._deployments.push(record);
    this._rebuildSets();
    this._availableCache = null; // Invalidate — deployment state changed
    this._save();
    this._debugLog("DeploymentManager", "Deployed shadow", record);
    return true;
  }

  recall(shadowId) {
    const idx = this._deployments.findIndex(d => d.shadowId === shadowId);
    if (idx === -1) return false;

    this._deployments.splice(idx, 1);
    this._rebuildSets();
    this._availableCache = null; // Invalidate — deployment state changed
    this._save();
    this._debugLog("DeploymentManager", "Recalled shadow", shadowId);
    return true;
  }

  isDeployed(shadowId) {
    return this._deployedShadowIds.has(shadowId);
  }

  getDeployedShadowIds() {
    return new Set(this._deployedShadowIds);
  }

  isMonitored(userId) {
    return this._monitoredUserIds.has(userId);
  }

  getDeploymentForUser(userId) {
    return this._deployments.find(d => d.targetUserId === userId) || null;
  }

  getDeployments() {
    return [...this._deployments];
  }

  getDeploymentCount() {
    return this._deployments.length;
  }

  getMonitoredUserIds() {
    return this._monitoredUserIds;
  }

  async getAvailableShadows() {
    // 5s TTL cache — avoids redundant IDB reads + 3 cross-plugin lookups
    const now = Date.now();
    if (this._availableCache && now - this._availableCache.timestamp < 5000) {
      return this._availableCache.shadows;
    }
    try {
      const armyPlugin = BdApi.Plugins.get("ShadowArmy");
      if (!armyPlugin || !armyPlugin.instance) {
        this._debugError("DeploymentManager", "ShadowArmy plugin not available");
        return [];
      }

      // CROSS-PLUGIN SNAPSHOT: Use ShadowArmy's shared snapshot if fresh, else fall back to IDB
      const allShadows = armyPlugin.instance.getShadowSnapshot?.() || await armyPlugin.instance.getAllShadows();
      if (!Array.isArray(allShadows)) return [];

      // Get IDs to exclude: already deployed + exchange-marked + dungeon-allocated
      // Dungeons now keeps a reserve pool (weakest shadows) idle for ShadowSenses.
      // Reserve shadows are available. Dungeon-allocated shadows are NOT (lore: one place at a time).
      // Fallback: if zero available, pull the weakest shadow from a dungeon silently.
      const deployedIds = this._deployedShadowIds;
      let exchangeMarkedIds = new Set();
      let dungeonAllocatedIds = new Set();
      let dungeonReserve = [];

      try {
        const exchangePlugin = BdApi.Plugins.get("ShadowExchange");
        if (exchangePlugin && exchangePlugin.instance && typeof exchangePlugin.instance.getMarkedShadowIds === "function") {
          exchangeMarkedIds = exchangePlugin.instance.getMarkedShadowIds();
        }
      } catch (exErr) {
        this._debugLog("DeploymentManager", "ShadowExchange not available for exclusion", exErr);
      }

      try {
        const dungeonsPlugin = BdApi.Plugins.get("Dungeons");
        if (dungeonsPlugin && dungeonsPlugin.instance) {
          // Get reserve pool (idle shadows held back by Dungeons)
          dungeonReserve = Array.isArray(dungeonsPlugin.instance.shadowReserve)
            ? dungeonsPlugin.instance.shadowReserve : [];
          // Build set of all dungeon-allocated shadow IDs
          if (dungeonsPlugin.instance.shadowAllocations instanceof Map) {
            for (const shadows of dungeonsPlugin.instance.shadowAllocations.values()) {
              if (Array.isArray(shadows)) {
                for (const s of shadows) {
                  const sid = s?.id || s?.extractedData?.id;
                  if (sid) dungeonAllocatedIds.add(sid);
                }
              }
            }
          }
        }
      } catch (dgErr) {
        this._debugLog("DeploymentManager", "Dungeons not available for exclusion", dgErr);
      }

      const reserveIds = new Set(dungeonReserve.map(s => s?.id || s?.extractedData?.id).filter(Boolean));

      // Available = not deployed, not exchange-marked, and either in reserve OR not in any dungeon
      const available = allShadows.filter(s => {
        if (!s || !s.id) return false;
        if (deployedIds.has(s.id)) return false;
        if (exchangeMarkedIds.has(s.id)) return false;
        if (reserveIds.has(s.id)) return true;           // Reserve = idle = available
        if (dungeonAllocatedIds.has(s.id)) return false;  // In dungeon = not available
        return true;
      });

      // Fallback: if no idle shadows, pull weakest from dungeon silently
      if (available.length === 0 && dungeonAllocatedIds.size > 0) {
        const dungeonShadows = allShadows
          .filter(s => s && s.id && dungeonAllocatedIds.has(s.id) && !deployedIds.has(s.id) && !exchangeMarkedIds.has(s.id))
          .sort((a, b) => RANKS.indexOf(a.rank || "E") - RANKS.indexOf(b.rank || "E"));
        if (dungeonShadows.length > 0) available.push(dungeonShadows[0]);
      }

      this._debugLog("DeploymentManager", "Available shadows", {
        total: allShadows.length,
        available: available.length,
        deployed: deployedIds.size,
        exchangeMarked: exchangeMarkedIds.size,
        dungeonAllocated: dungeonAllocatedIds.size,
        reservePool: reserveIds.size,
      });

      this._availableCache = { shadows: available, timestamp: Date.now() };
      return available;
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to get available shadows", err);
      return [];
    }
  }

  async validateDeployments(getAvailableShadowsFn) {
    if (!getAvailableShadowsFn) return;
    try {
      const available = await getAvailableShadowsFn();
      const availableIds = new Set(available.map(s => s.id));
      const before = this._deployments.length;
      this._deployments = this._deployments.filter(d => availableIds.has(d.shadowId));
      if (this._deployments.length < before) {
        this._debugLog("DeploymentManager", `Pruned ${before - this._deployments.length} stale deployments`);
        this._rebuildSets();
        this._save();
      }
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to validate deployments", err);
    }
  }
}

// ─── SensesEngine ──────────────────────────────────────────────────────────

class SensesEngine {
  constructor(pluginRef) {
    this._plugin = pluginRef;
    this._guildFeeds = {};          // { guildId: entry[] } — per-guild persistent feeds
    this._lastSeenCount = {};       // { guildId: number } — track what user has seen per guild
    this._currentGuildId = null;
    this._sessionMessageCount = 0;
    this._totalDetections = 0;
    this._dirty = false;
    this._dirtyGuilds = new Set();  // Per-guild dirty tracking — flush only changed guilds
    this._flushInterval = null;
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;
    this._totalFeedEntries = 0;  // Incremental counter — avoids O(G×F) per message
    this._feedVersion = 0;       // Bumped on every feed mutation — lets consumers skip unchanged polls

    // Presence detection — in-memory only, resets on restart/reload
    // Tracks last message timestamp per monitored user to detect:
    //   1. First activity after restart → "user is active" toast
    //   2. Return from AFK (1-3h silence) → "back from AFK" toast
    this._userLastActivity = new Map();  // authorId → { timestamp, notifiedActive }
    this._AFK_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours — sweet spot for real AFK detection
    this._subscribeTime = 0; // Set when subscribe() fires — used to defer early toasts

    // Load persisted data — per-guild keys first, legacy monolithic fallback
    const feedGuildIds = BdApi.Data.load(PLUGIN_NAME, "feedGuildIds");
    if (Array.isArray(feedGuildIds) && feedGuildIds.length > 0) {
      this._guildFeeds = {};
      for (const gid of feedGuildIds) {
        const feed = BdApi.Data.load(PLUGIN_NAME, `feed_${gid}`);
        if (Array.isArray(feed) && feed.length > 0) {
          this._guildFeeds[gid] = feed;
        }
      }
    } else {
      // Legacy: single monolithic key (pre-Opt6 data)
      this._guildFeeds = BdApi.Data.load(PLUGIN_NAME, "guildFeeds") || {};
    }
    this._totalDetections = BdApi.Data.load(PLUGIN_NAME, "totalDetections") || 0;

    // Count existing entries for lastSeenCount (mark all persisted as "seen")
    // and initialize _totalFeedEntries from persisted data
    for (const guildId of Object.keys(this._guildFeeds)) {
      this._lastSeenCount[guildId] = this._guildFeeds[guildId].length;
      this._totalFeedEntries += this._guildFeeds[guildId].length;
    }

    // Purge entries older than 3 days on startup
    this._purgeOldEntries();

    this._plugin.debugLog("SensesEngine", "Loaded persisted feeds", {
      guilds: Object.keys(this._guildFeeds).length,
      totalEntries: this._totalFeedEntries,
    });
  }

  subscribe() {
    const Dispatcher = this._plugin._Dispatcher;
    if (!Dispatcher) {
      this._plugin.debugError("SensesEngine", "Dispatcher not available, cannot subscribe");
      return;
    }

    // Store current guild — try immediately, retry if null (Discord may not be ready yet)
    try {
      this._currentGuildId = this._plugin._SelectedGuildStore
        ? this._plugin._SelectedGuildStore.getGuildId()
        : null;
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Failed to get initial guild ID", err);
    }
    console.log(`[ShadowSenses] subscribe: _currentGuildId=${this._currentGuildId}`);

    // Mark current guild as seen
    if (this._currentGuildId && this._guildFeeds[this._currentGuildId]) {
      this._lastSeenCount[this._currentGuildId] = this._guildFeeds[this._currentGuildId].length;
    }

    this._handleMessageCreate = this._onMessageCreate.bind(this);
    this._handleChannelSelect = this._onChannelSelect.bind(this);

    Dispatcher.subscribe("MESSAGE_CREATE", this._handleMessageCreate);
    Dispatcher.subscribe("CHANNEL_SELECT", this._handleChannelSelect);
    this._subscribeTime = Date.now();

    // Start debounced flush interval (30s)
    this._flushInterval = setInterval(() => {
      if (!this._dirty) return;
      this._flushToDisk();
    }, 30000);

    // Periodic purge of old entries (every 10 minutes)
    this._purgeInterval = setInterval(() => this._purgeOldEntries(), PURGE_INTERVAL_MS);

    this._plugin.debugLog("SensesEngine", "Subscribed to MESSAGE_CREATE and CHANNEL_SELECT", {
      currentGuildId: this._currentGuildId,
    });
  }

  unsubscribe() {
    const Dispatcher = this._plugin._Dispatcher;
    if (!Dispatcher) return;

    if (this._handleMessageCreate) {
      Dispatcher.unsubscribe("MESSAGE_CREATE", this._handleMessageCreate);
      this._handleMessageCreate = null;
    }

    if (this._handleChannelSelect) {
      Dispatcher.unsubscribe("CHANNEL_SELECT", this._handleChannelSelect);
      this._handleChannelSelect = null;
    }

    // Stop flush + purge intervals and do final flush
    if (this._flushInterval) {
      clearInterval(this._flushInterval);
      this._flushInterval = null;
    }
    if (this._purgeInterval) {
      clearInterval(this._purgeInterval);
      this._purgeInterval = null;
    }
    if (this._dirty) {
      this._flushToDisk();
    }

    this._plugin.debugLog("SensesEngine", "Unsubscribed from all events");
  }

  _flushToDisk() {
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

  _addToGuildFeed(guildId, entry) {
    if (!this._guildFeeds[guildId]) {
      this._guildFeeds[guildId] = [];
    }
    this._guildFeeds[guildId].push(entry);
    this._totalFeedEntries++;

    if (this._guildFeeds[guildId].length > GUILD_FEED_CAP) {
      this._guildFeeds[guildId].shift();
      this._totalFeedEntries--;
    }

    // Global cap: O(1) check via incremental counter (was O(G×F) reduce)
    if (this._totalFeedEntries > GLOBAL_FEED_CAP) {
      let maxGuild = null, maxLen = 0;
      for (const [gid, arr] of Object.entries(this._guildFeeds)) {
        if (arr.length > maxLen) { maxGuild = gid; maxLen = arr.length; }
      }
      if (maxGuild) {
        const trimTo = Math.max(100, Math.floor(maxLen / 2));
        const trimmed = maxLen - trimTo;
        this._guildFeeds[maxGuild] = this._guildFeeds[maxGuild].slice(-trimTo);
        this._totalFeedEntries -= trimmed;
        this._dirtyGuilds.add(maxGuild);
        this._plugin.debugLog?.("SensesEngine", `Global cap: trimmed guild ${maxGuild} from ${maxLen} to ${trimTo}`);
      }
    }

    this._feedVersion++;
    this._dirtyGuilds.add(guildId);
    this._dirty = true;
  }

  /**
   * Remove feed entries older than FEED_MAX_AGE_MS (3 days).
   * Called on startup and periodically via _purgeInterval.
   */
  _purgeOldEntries() {
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

  _onMessageCreate(payload) {
    try {
      if (!payload || !payload.message || !payload.message.author) return;

      const message = payload.message;
      const authorId = message.author.id;

      // O(1) lookup — exit immediately if not monitored
      const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
      if (!monitoredIds.has(authorId)) return;

      // This user IS monitored — resolve deployment info
      const deployment = this._plugin.deploymentManager.getDeploymentForUser(authorId);
      if (!deployment) return;

      // Lazy guild resolution — if subscribe() fired before Discord was ready,
      // _currentGuildId may be null. Try to resolve it now.
      if (!this._currentGuildId) {
        try {
          this._currentGuildId = this._plugin._SelectedGuildStore
            ? this._plugin._SelectedGuildStore.getGuildId()
            : null;
          if (this._currentGuildId) {
            console.log(`[ShadowSenses] Lazy guild resolve: _currentGuildId=${this._currentGuildId}`);
          }
        } catch (_) { /* silent */ }
      }

      // Resolve channel + guild FIRST (needed for presence toast context)
      let channelName = "unknown";
      let guildId = message.guild_id || null;

      try {
        const channel = this._plugin._ChannelStore
          ? this._plugin._ChannelStore.getChannel(message.channel_id)
          : null;
        if (channel) {
          channelName = channel.name || "unknown";
          if (!guildId) guildId = channel.guild_id;
        }
      } catch (chErr) {
        this._plugin.debugError("SensesEngine", "Failed to resolve channel", chErr);
      }

      if (!guildId) return;

      // Resolve guild name for display
      const guildName = this._plugin._getGuildName(guildId);
      const isAwayGuild = guildId !== this._currentGuildId;
      const authorName = message.author.username || message.author.global_name || "Unknown";

      // ── Presence Detection ──────────────────────────────────────────────
      // Track user activity to generate one-time presence toasts:
      //   - First message after restart → "is now active" (once per user, any guild)
      //   - Message after 2h+ silence → "has returned" (once per user, any guild)
      // These fire regardless of current guild — presence is user-level awareness.
      const now = Date.now();
      const lastActivity = this._userLastActivity.get(authorId);

      // During early startup (<3s after subscribe), BdApi.UI.showToast can silently
      // fail if Discord's DOM isn't fully rendered. Defer toasts in that window.
      const msSinceSubscribe = now - this._subscribeTime;
      const isEarlyStartup = this._subscribeTime > 0 && msSinceSubscribe < 3000;

      if (!lastActivity) {
        // First message from this user since restart/reload
        const toastMsg = `[${deployment.shadowRank}] ${deployment.shadowName} reports: ${authorName} is now active`;
        if (isEarlyStartup) {
          setTimeout(() => BdApi.UI.showToast(toastMsg, { type: "success", timeout: 5000 }), 3000 - msSinceSubscribe);
        } else {
          BdApi.UI.showToast(toastMsg, { type: "success", timeout: 5000 });
        }
        this._userLastActivity.set(authorId, { timestamp: now, notifiedActive: true });
      } else {
        const silenceMs = now - lastActivity.timestamp;

        if (silenceMs >= this._AFK_THRESHOLD_MS) {
          // User was silent for 2h+ → AFK return toast
          const silenceHours = Math.floor(silenceMs / (60 * 60 * 1000));
          const silenceMins = Math.floor((silenceMs % (60 * 60 * 1000)) / (60 * 1000));
          const timeStr = silenceHours > 0
            ? `${silenceHours}h${silenceMins > 0 ? ` ${silenceMins}m` : ""}`
            : `${silenceMins}m`;

          const toastMsg = `[${deployment.shadowRank}] ${deployment.shadowName} reports: ${authorName} has returned (AFK ${timeStr})`;
          if (isEarlyStartup) {
            setTimeout(() => BdApi.UI.showToast(toastMsg, { type: "warning", timeout: 5000 }), 3000 - msSinceSubscribe);
          } else {
            BdApi.UI.showToast(toastMsg, { type: "warning", timeout: 5000 });
          }
        }

        // Always update timestamp
        this._userLastActivity.set(authorId, { timestamp: now, notifiedActive: true });
      }

      // Build feed entry
      const entry = {
        messageId: message.id,
        authorId,
        authorName,
        channelId: message.channel_id,
        channelName,
        guildId,
        guildName,
        content: (message.content || "").slice(0, 200),
        timestamp: now,
        shadowName: deployment.shadowName,
        shadowRank: deployment.shadowRank,
      };

      // Add to the guild's feed (always, regardless of current guild)
      this._addToGuildFeed(guildId, entry);

      // Context-aware message notifications:
      // Toast for AWAY guilds only — if you're already viewing this guild, no need to alert.
      // When you switch guilds, the batch summary toast covers what you missed.
      if (isAwayGuild) {
        BdApi.UI.showToast(
          `[${entry.shadowRank}] ${entry.shadowName} sensed ${entry.authorName} in ${guildName} #${entry.channelName}`,
          { type: "info" }
        );
      } else {
        // Current guild — silently track, keep lastSeen in sync
        this._lastSeenCount[guildId] = this._guildFeeds[guildId].length;
      }

      // Update counters
      this._sessionMessageCount++;
      this._totalDetections++;

      // Signal widget refresh
      this._plugin._widgetDirty = true;
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Error in MESSAGE_CREATE handler", err);
    }
  }

  _onChannelSelect(payload) {
    try {
      let newGuildId = null;

      if (payload && payload.guildId) {
        newGuildId = payload.guildId;
      } else {
        try {
          newGuildId = this._plugin._SelectedGuildStore
            ? this._plugin._SelectedGuildStore.getGuildId()
            : null;
        } catch (gErr) {
          this._plugin.debugError("SensesEngine", "Failed to get guild ID on select", gErr);
        }
      }

      // Same guild — no action
      if (newGuildId === this._currentGuildId) return;

      // Check for unseen messages in the guild we're switching TO
      if (newGuildId && this._guildFeeds[newGuildId]) {
        const feed = this._guildFeeds[newGuildId];
        const lastSeen = this._lastSeenCount[newGuildId] || 0;
        const unseenCount = feed.length - lastSeen;

        if (unseenCount > 0) {
          // Collect unique shadow names from unseen entries
          const unseenEntries = feed.slice(lastSeen);
          const shadowNames = new Set(unseenEntries.map(e => e.shadowName));
          const guildName = this._plugin._getGuildName(newGuildId);

          BdApi.UI.showToast(
            `Shadow Senses: ${unseenCount} message${unseenCount > 1 ? "s" : ""} in ${guildName} from ${shadowNames.size} shadow${shadowNames.size > 1 ? "s" : ""} while away`,
            { type: "info" }
          );
          this._plugin._widgetDirty = true;
        }

        // Mark all as seen now that we're viewing this guild
        this._lastSeenCount[newGuildId] = feed.length;
      }

      // Update current guild
      this._currentGuildId = newGuildId;

      this._plugin.debugLog("SensesEngine", "Guild switched", { newGuildId });
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Error in CHANNEL_SELECT handler", err);
    }
  }

  /**
   * Returns merged feed from all guilds EXCEPT the one you're currently viewing,
   * sorted by timestamp (newest last). This gives you a cross-server "what did I miss"
   * view that automatically excludes the guild you're already looking at.
   */
  getActiveFeed() {
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
  getActiveFeedCount() {
    let count = 0;
    for (const [guildId, feed] of Object.entries(this._guildFeeds)) {
      if (guildId === this._currentGuildId) continue;
      count += feed.length;
    }
    return count;
  }

  getSessionMessageCount() {
    return this._sessionMessageCount;
  }

  getTotalDetections() {
    return this._totalDetections;
  }

  clear() {
    // Note: Timer cleanup is handled by unsubscribe(), not here.
    // clear() only resets data state.
    this._guildFeeds = {};
    this._lastSeenCount = {};
    this._currentGuildId = null;
    this._sessionMessageCount = 0;
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;
    this._dirty = false;
    this._dirtyGuilds = new Set();
    this._totalFeedEntries = 0;
    this._feedVersion = 0;
  }
}

// ─── CSS ───────────────────────────────────────────────────────────────────

function buildPortalTransitionCSS() {
  return `
@keyframes ss-mist-css-overlay {
  0% { opacity: 0; }
  14% { opacity: 0.98; }
  56% { opacity: 1; }
  74% { opacity: 0.82; }
  100% { opacity: 0; }
}

@keyframes ss-mist-css-plume {
  0% {
    opacity: 0;
    transform: translate3d(-2%, 4%, 0) scale(1.12) rotate(-3deg);
  }
  22% {
    opacity: 0.9;
    transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
  }
  62% {
    opacity: 0.74;
    transform: translate3d(3%, -2%, 0) scale(1.08) rotate(2deg);
  }
  100% {
    opacity: 0;
    transform: translate3d(6%, -4%, 0) scale(1.18) rotate(4deg);
  }
}

@keyframes ss-mist-css-abyss {
  0% {
    opacity: 0;
    transform: translate3d(2%, -2%, 0) scale(1.05);
  }
  20% {
    opacity: 0.93;
    transform: translate3d(0, 0, 0) scale(1);
  }
  68% {
    opacity: 0.78;
    transform: translate3d(-2%, 1%, 0) scale(1.08);
  }
  100% {
    opacity: 0.12;
    transform: translate3d(-3%, 2%, 0) scale(1.14);
  }
}

@keyframes ss-mist-css-mist {
  0% {
    opacity: 0;
    transform: translate3d(-2%, 3%, 0) scale(calc(var(--ss-ms, 1) * 0.72)) rotate(calc(var(--ss-mr, 0deg) * -0.2));
  }
  26% {
    opacity: 0.86;
    transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
  }
  68% {
    opacity: 0.64;
    transform: translate3d(calc(var(--ss-mx, 0px) * 0.44), calc(var(--ss-my, 0px) * 0.44), 0) scale(calc(var(--ss-ms, 1) * 1.06)) rotate(calc(var(--ss-mr, 0deg) * 0.5));
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--ss-mx, 0px), var(--ss-my, 0px), 0) scale(calc(var(--ss-ms, 1) * 1.2)) rotate(var(--ss-mr, 0deg));
  }
}

@keyframes ss-mist-css-shard {
  0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(0.3); opacity: 0; }
  22% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); opacity: 0.72; }
  100% {
    transform: translate3d(var(--ss-shard-x, 0px), var(--ss-shard-y, -80px), 0) rotate(var(--ss-shard-r, 0deg)) scale(0.2);
    opacity: 0;
  }
}

.ss-transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  pointer-events: none;
  overflow: hidden;
  opacity: 0;
  background: transparent;
  will-change: opacity;
}

.ss-transition-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  opacity: 1;
}

.ss-transition-plume,
.ss-transition-abyss,
.ss-mist,
.ss-shard {
  position: absolute;
  pointer-events: none;
}

.ss-transition-plume {
  inset: -18%;
  opacity: 0;
  transform: translate3d(-2%, 4%, 0) scale(1.12) rotate(-3deg);
  background:
    radial-gradient(65% 48% at 24% 38%, rgba(88, 88, 100, 0.32) 0%, rgba(38, 38, 48, 0.22) 48%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(70% 58% at 74% 62%, rgba(66, 66, 78, 0.3) 0%, rgba(24, 24, 32, 0.2) 52%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(85% 70% at 52% 50%, rgba(0, 0, 0, 0.88) 18%, rgba(0, 0, 0, 0) 100%);
  filter: blur(20px) saturate(0.8);
  will-change: transform, opacity;
}

.ss-transition-abyss {
  inset: -22%;
  opacity: 0;
  transform: translate3d(2%, -2%, 0) scale(1.05);
  background: radial-gradient(95% 84% at 42% 46%, rgba(0, 0, 0, 0.96) 22%, rgba(0, 0, 0, 0.78) 58%, rgba(0, 0, 0, 0.2) 78%, rgba(0, 0, 0, 0) 100%);
  filter: blur(12px);
  will-change: transform, opacity;
}

.ss-mist {
  inset: -30%;
  background:
    radial-gradient(50% 42% at 24% 36%, rgba(84, 84, 96, 0.36) 0%, rgba(34, 34, 44, 0.26) 46%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(56% 46% at 74% 58%, rgba(72, 72, 84, 0.34) 0%, rgba(28, 28, 38, 0.24) 48%, rgba(0, 0, 0, 0) 100%),
    radial-gradient(60% 50% at 52% 52%, rgba(14, 14, 18, 0.72) 0%, rgba(0, 0, 0, 0) 100%);
  filter: blur(30px) saturate(0.78);
  opacity: 0;
  transform: translate3d(-2%, 3%, 0) scale(calc(var(--ss-ms, 1) * 0.72)) rotate(calc(var(--ss-mr, 0deg) * -0.2));
  will-change: transform, opacity;
}

.ss-shard {
  border-radius: 999px;
  transform-origin: center;
  background: linear-gradient(180deg, rgba(204, 188, 166, 0.78) 0%, rgba(96, 72, 54, 0.54) 52%, rgba(16, 10, 8, 0) 100%);
  box-shadow: 0 0 6px rgba(110, 82, 56, 0.28);
  opacity: 0;
  will-change: transform, opacity;
}

.ss-transition-overlay--waapi .ss-transition-plume,
.ss-transition-overlay--waapi .ss-transition-abyss,
.ss-transition-overlay--waapi .ss-mist,
.ss-transition-overlay--waapi .ss-shard {
  animation: none !important;
}

.ss-transition-overlay--css {
  background: radial-gradient(120% 95% at 50% 50%, rgba(8, 8, 12, 0.7) 30%, rgba(0, 0, 0, 0.88) 100%);
  animation: ss-mist-css-overlay var(--ss-total-duration, 1000ms) cubic-bezier(.2,.58,.2,1) forwards;
}

.ss-transition-overlay--css .ss-transition-plume {
  animation: ss-mist-css-plume calc(var(--ss-total-duration, 1000ms) + 120ms) cubic-bezier(.22,.61,.36,1) forwards;
}

.ss-transition-overlay--css .ss-transition-abyss {
  animation: ss-mist-css-abyss calc(var(--ss-total-duration, 1000ms) + 80ms) ease-out forwards;
}

.ss-transition-overlay--css .ss-mist {
  animation: ss-mist-css-mist calc(var(--ss-total-duration, 1000ms) + 180ms) cubic-bezier(.22,.61,.36,1) forwards;
  animation-delay: var(--ss-mist-delay, 0ms);
}

.ss-transition-overlay--css .ss-shard {
  animation: ss-mist-css-shard 900ms cubic-bezier(.22,.61,.36,1) forwards;
  animation-delay: var(--ss-delay, 0ms);
}

.ss-transition-overlay--reduced {
  background: rgba(0, 0, 0, 0.65);
}

.ss-transition-overlay--reduced .ss-transition-plume,
.ss-transition-overlay--reduced .ss-transition-abyss,
.ss-transition-overlay--reduced .ss-mist,
.ss-transition-overlay--reduced .ss-shard {
  display: none;
}
`;
}


function buildCSS() {
  return `
${buildPortalTransitionCSS()}

/* ─── Shadow Senses Widget ──────────────────────────────────────────────── */

.shadow-senses-widget {
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(138, 43, 226, 0.05));
  border: 1px solid #8a2be2;
  border-radius: 8px;
  padding: 8px 10px;
  margin: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.shadow-senses-widget:hover {
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.25), rgba(138, 43, 226, 0.1));
  border-color: #a78bfa;
}

.shadow-senses-widget-label {
  color: #a78bfa;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.shadow-senses-widget-badge {
  background: #8a2be2;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

/* ─── Overlay ───────────────────────────────────────────────────────────── */

.shadow-senses-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(5px);
}

/* ─── Panel ─────────────────────────────────────────────────────────────── */

.shadow-senses-panel {
  background: #1e1e2e;
  border: 1px solid #8a2be2;
  border-radius: 12px;
  width: 700px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(138, 43, 226, 0.3);
}

.shadow-senses-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(138, 43, 226, 0.3);
}

.shadow-senses-panel-title {
  color: #8a2be2;
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.shadow-senses-close-btn {
  background: transparent;
  border: none;
  color: #999;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: color 0.15s ease;
}

.shadow-senses-close-btn:hover {
  color: #fff;
}

/* ─── Tabs ──────────────────────────────────────────────────────────────── */

.shadow-senses-tabs {
  display: flex;
  border-bottom: 1px solid rgba(138, 43, 226, 0.2);
  padding: 0 20px;
}

.shadow-senses-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #999;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.shadow-senses-tab:hover {
  color: #ccc;
}

.shadow-senses-tab.active {
  color: #8a2be2;
  border-bottom-color: #8a2be2;
}

/* ─── Feed Card ─────────────────────────────────────────────────────────── */

.shadow-senses-feed-card {
  background: rgba(20, 20, 40, 0.6);
  border: 1px solid rgba(138, 43, 226, 0.15);
  border-radius: 8px;
  padding: 10px 14px;
  margin: 4px 0;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.shadow-senses-feed-card:hover {
  border-color: #8a2be2;
  background: rgba(20, 20, 40, 0.8);
}

.shadow-senses-feed-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #a78bfa;
  margin-bottom: 4px;
}

.shadow-senses-feed-card-header .time {
  color: #666;
  margin-left: auto;
}

.shadow-senses-feed-card-header .channel {
  color: #60a5fa;
}

.shadow-senses-feed-card-header .shadow-info {
  font-weight: 600;
}

.shadow-senses-feed-content {
  color: #ccc;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* ─── Deploy / Recall ───────────────────────────────────────────────────── */

.shadow-senses-deploy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(20, 20, 40, 0.4);
  border-radius: 8px;
  margin: 4px 0;
  border: 1px solid rgba(138, 43, 226, 0.1);
}

.shadow-senses-deploy-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ccc;
  font-size: 13px;
}

.shadow-senses-deploy-rank {
  font-weight: 700;
  font-size: 12px;
  min-width: 24px;
  text-align: center;
}

.shadow-senses-deploy-arrow {
  color: #666;
  font-size: 14px;
}

.shadow-senses-deploy-target {
  color: #a78bfa;
  font-weight: 600;
}

.shadow-senses-recall-btn {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid #ef4444;
  color: #ef4444;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.shadow-senses-recall-btn:hover {
  background: rgba(239, 68, 68, 0.3);
}

.shadow-senses-deploy-btn {
  background: rgba(138, 43, 226, 0.15);
  border: 1px solid #8a2be2;
  color: #a78bfa;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  width: 100%;
  text-align: center;
  transition: background 0.15s ease;
}

.shadow-senses-deploy-btn:hover {
  background: rgba(138, 43, 226, 0.3);
}

/* ─── Picker (shadow selection overlay) ─────────────────────────────────── */

.shadow-senses-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  z-index: 10003;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(5px);
}

.shadow-senses-picker {
  background: #1e1e2e;
  border: 1px solid #8a2be2;
  border-radius: 12px;
  width: 400px;
  max-width: 90vw;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(138, 43, 226, 0.3);
}

.shadow-senses-picker-title {
  color: #8a2be2;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 12px;
  text-align: center;
  padding: 14px 14px 0;
}

.shadow-senses-picker-shadow-name {
  color: #ccc;
  font-size: 13px;
}

.shadow-senses-picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(138, 43, 226, 0.1);
  transition: background 0.15s ease;
}

.shadow-senses-picker-item:hover {
  background: rgba(138, 43, 226, 0.15);
}

.shadow-senses-picker-item:last-child {
  border-bottom: none;
}

/* ─── Footer ────────────────────────────────────────────────────────────── */

.shadow-senses-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid rgba(138, 43, 226, 0.2);
  color: #666;
  font-size: 11px;
}

/* ─── Empty State ───────────────────────────────────────────────────────── */

.shadow-senses-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
`;
}

// ─── React Components ─────────────────────────────────────────────────────

function buildComponents(pluginRef) {
  const React = BdApi.React;
  const { useState, useEffect, useCallback, useRef, useReducer } = React;
  const ce = React.createElement;

  // ── FeedCard ──────────────────────────────────────────────────────────
  function FeedCard({ entry, onNavigate }) {
    const time = new Date(entry.timestamp);
    const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
    const rankColor = RANK_COLORS[entry.shadowRank] || "#8a2be2";

    return ce("div", {
      className: "shadow-senses-feed-card",
      onClick: () => onNavigate && onNavigate(entry),
    },
      ce("div", { className: "shadow-senses-feed-card-header" },
        ce("span", { style: { color: rankColor, fontWeight: 600 } },
          `[${entry.shadowRank}] ${entry.shadowName}`
        ),
        ce("span", { style: { color: "#666" } }, "\u2192"),
        ce("span", { style: { color: "#ccc" } }, entry.authorName),
        entry.guildName
          ? ce("span", { style: { color: "#a78bfa", fontSize: "0.85em" } }, entry.guildName)
          : null,
        ce("span", { style: { color: "#60a5fa" } }, `#${entry.channelName}`),
        ce("span", { style: { color: "#666", marginLeft: "auto" } }, timeStr)
      ),
      ce("div", { className: "shadow-senses-feed-content" },
        entry.content ? `\u201C${entry.content}\u201D` : "\u2014 no text content \u2014"
      )
    );
  }

  // ── DeploymentRow ─────────────────────────────────────────────────────
  function DeploymentRow({ deployment, onRecall }) {
    const rankColor = RANK_COLORS[deployment.shadowRank] || "#8a2be2";

    return ce("div", { className: "shadow-senses-deploy-row" },
      ce("div", { className: "shadow-senses-deploy-info" },
        ce("span", { className: "shadow-senses-deploy-rank", style: { color: rankColor } },
          `[${deployment.shadowRank}]`
        ),
        ce("span", null, deployment.shadowName),
        ce("span", { className: "shadow-senses-deploy-arrow" }, "\u2192"),
        ce("span", { className: "shadow-senses-deploy-target" }, deployment.targetUsername)
      ),
      ce("button", {
        className: "shadow-senses-recall-btn",
        onClick: () => onRecall && onRecall(deployment),
      }, "Recall")
    );
  }

  // ── FeedTab ───────────────────────────────────────────────────────────
  function FeedTab({ onNavigate }) {
    const [feed, setFeed] = useState([]);
    const scrollRef = useRef(null);
    const prevLenRef = useRef(0);

    useEffect(() => {
      let lastVersion = -1;
      const poll = setInterval(() => {
        try {
          const engine = pluginRef.sensesEngine;
          if (!engine) return;
          // Only copy the feed array when _feedVersion changes (~95% of polls skip)
          const currentVersion = engine._feedVersion;
          if (currentVersion !== lastVersion) {
            lastVersion = currentVersion;
            setFeed(engine.getActiveFeed());
          }
        } catch (_) { pluginRef.debugLog?.('REACT', 'Feed poll error', _); }
      }, 2000);
      // Initial load
      try {
        const engine = pluginRef.sensesEngine;
        if (engine) {
          setFeed(engine.getActiveFeed());
          lastVersion = engine._feedVersion;
        }
      } catch (_) { pluginRef.debugLog?.('REACT', 'Feed initial load error', _); }
      return () => clearInterval(poll);
    }, []);

    useEffect(() => {
      if (feed.length > prevLenRef.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      prevLenRef.current = feed.length;
    }, [feed.length]);

    if (feed.length === 0) {
      return ce("div", { className: "shadow-senses-empty" },
        "No messages detected yet. Shadows are watching..."
      );
    }

    return ce("div", {
      ref: scrollRef,
      style: { maxHeight: "50vh", overflowY: "auto", padding: "8px 16px" },
    },
      feed.map((entry, i) =>
        ce(FeedCard, { key: `${entry.messageId}-${i}`, entry, onNavigate })
      )
    );
  }

  // ── DeploymentsTab ────────────────────────────────────────────────────
  function DeploymentsTab({ onRecall, onDeployNew }) {
    const [deployments, setDeployments] = useState([]);

    useEffect(() => {
      try {
        setDeployments(pluginRef.deploymentManager ? pluginRef.deploymentManager.getDeployments() : []);
      } catch (_) { pluginRef.debugLog?.('REACT', 'Deployments load error', _); }
    }, []);

    const handleRecall = useCallback((deployment) => {
      try {
        if (pluginRef.deploymentManager) {
          pluginRef.deploymentManager.recall(deployment.shadowId);
          setDeployments(pluginRef.deploymentManager.getDeployments());
          pluginRef._widgetDirty = true;
        }
      } catch (err) {
        pluginRef.debugError("DeploymentsTab", "Recall failed:", err);
      }
      if (onRecall) onRecall(deployment);
    }, [onRecall]);

    if (deployments.length === 0) {
      return ce("div", { style: { padding: "16px" } },
        ce("div", { className: "shadow-senses-empty" },
          "No shadows deployed. Right-click a user to deploy a shadow."
        ),
        ce("button", {
          className: "shadow-senses-deploy-btn",
          onClick: onDeployNew,
          style: { marginTop: 12 },
        }, "Deploy New Shadow")
      );
    }

    return ce("div", { style: { padding: "8px 16px", maxHeight: "50vh", overflowY: "auto" } },
      deployments.map((d) =>
        ce(DeploymentRow, { key: d.shadowId, deployment: d, onRecall: handleRecall })
      ),
      ce("button", {
        className: "shadow-senses-deploy-btn",
        onClick: onDeployNew,
        style: { marginTop: 8 },
      }, "Deploy New Shadow")
    );
  }

  // ── SensesPanel ───────────────────────────────────────────────────────
  function SensesPanel({ onClose }) {
    const [activeTab, setActiveTab] = useState("feed");

    const handleOverlayClick = useCallback((e) => {
      if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const handleNavigate = useCallback((entry) => {
      if (!entry.guildId || !entry.channelId) { onClose(); return; }
      const path = entry.messageId
        ? `/channels/${entry.guildId}/${entry.channelId}/${entry.messageId}`
        : `/channels/${entry.guildId}/${entry.channelId}`;
      onClose();
      pluginRef.teleportToPath(path, {
        guildId: entry.guildId,
        channelId: entry.channelId,
        messageId: entry.messageId || null,
      });
    }, [onClose]);

    const handleDeployNew = useCallback(() => {
      BdApi.UI.showToast("Right-click a user to deploy a shadow", { type: "info" });
    }, []);

    const deployCount = pluginRef.deploymentManager
      ? pluginRef.deploymentManager.getDeploymentCount()
      : 0;
    const msgCount = pluginRef.sensesEngine
      ? pluginRef.sensesEngine.getSessionMessageCount()
      : 0;

    return ce("div", {
      className: "shadow-senses-overlay",
      onClick: handleOverlayClick,
    },
      ce("div", { className: "shadow-senses-panel" },
        // Header
        ce("div", { className: "shadow-senses-panel-header" },
          ce("h2", { className: "shadow-senses-panel-title" }, "Shadow Senses"),
          ce("button", {
            className: "shadow-senses-close-btn",
            onClick: onClose,
          }, "\u2715")
        ),
        // Tabs
        ce("div", { className: "shadow-senses-tabs" },
          ce("button", {
            className: `shadow-senses-tab${activeTab === "feed" ? " active" : ""}`,
            onClick: () => setActiveTab("feed"),
          }, "Active Feed"),
          ce("button", {
            className: `shadow-senses-tab${activeTab === "deployments" ? " active" : ""}`,
            onClick: () => setActiveTab("deployments"),
          }, "Deployments")
        ),
        // Tab content
        activeTab === "feed"
          ? ce(FeedTab, { onNavigate: handleNavigate })
          : ce(DeploymentsTab, { onRecall: null, onDeployNew: handleDeployNew }),
        // Footer
        ce("div", { className: "shadow-senses-footer" },
          ce("span", null, `${deployCount} shadow${deployCount !== 1 ? "s" : ""} deployed`),
          ce("span", null, `${msgCount} detection${msgCount !== 1 ? "s" : ""} (since restart)`)
        )
      )
    );
  }

  // ── SensesWidget ──────────────────────────────────────────────────────
  function SensesWidget() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    useEffect(() => {
      pluginRef._widgetForceUpdate = forceUpdate;
      const poll = setInterval(() => {
        if (pluginRef._widgetDirty) {
          pluginRef._widgetDirty = false;
          forceUpdate();
        }
      }, 3000);
      return () => {
        clearInterval(poll);
        pluginRef._widgetForceUpdate = null;
      };
    }, []);

    const deployCount = pluginRef.deploymentManager
      ? pluginRef.deploymentManager.getDeploymentCount()
      : 0;
    const feedCount = pluginRef.sensesEngine
      ? pluginRef.sensesEngine.getActiveFeedCount()
      : 0;

    return ce("div", {
      className: "shadow-senses-widget",
      onClick: () => pluginRef.openPanel(),
    },
      ce("span", { className: "shadow-senses-widget-label" },
        `Shadow Senses: ${deployCount} deployed`
      ),
      feedCount > 0
        ? ce("span", { className: "shadow-senses-widget-badge" }, feedCount)
        : null
    );
  }

  // ── ShadowPicker ──────────────────────────────────────────────────────
  function ShadowPicker({ targetUser, onSelect, onClose }) {
    const [shadows, setShadows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const available = pluginRef.deploymentManager
            ? await pluginRef.deploymentManager.getAvailableShadows()
            : [];
          if (!cancelled) {
            // Sort by rank — higher ranks first
            const sorted = [...available].sort((a, b) => {
              const aIdx = RANKS.indexOf(a.rank || "E");
              const bIdx = RANKS.indexOf(b.rank || "E");
              return bIdx - aIdx;
            });
            setShadows(sorted);
            setLoading(false);
          }
        } catch (err) {
          if (!cancelled) {
            pluginRef.debugError("ShadowPicker", "Failed to load shadows:", err);
            setLoading(false);
          }
        }
      })();
      return () => { cancelled = true; };
    }, []);

    const handleOverlayClick = useCallback((e) => {
      if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const targetName = targetUser
      ? (targetUser.globalName || targetUser.username || "User")
      : "User";

    return ce("div", {
      className: "shadow-senses-picker-overlay",
      onClick: handleOverlayClick,
    },
      ce("div", { className: "shadow-senses-picker" },
        ce("div", { className: "shadow-senses-picker-title" },
          `Deploy a shadow to watch ${targetName}`
        ),
        ce("div", { style: { overflowY: "auto", flex: 1 } },
          loading
            ? ce("div", { className: "shadow-senses-empty" }, "Loading shadows...")
            : shadows.length === 0
              ? ce("div", { className: "shadow-senses-empty" }, "No available shadows. Extract more from ShadowArmy first.")
              : shadows.map((shadow) => {
                  const rankColor = RANK_COLORS[shadow.rank] || "#8a2be2";
                  return ce("div", {
                    key: shadow.id,
                    className: "shadow-senses-picker-item",
                    onClick: () => onSelect(shadow),
                  },
                    ce("span", { className: "shadow-senses-picker-shadow-name" },
                      shadow.roleName || shadow.role || shadow.name || "Shadow"
                    ),
                    ce("span", { style: { color: rankColor, fontWeight: 700, fontSize: 12 } },
                      `[${shadow.rank || "E"}]`
                    )
                  );
                })
        )
      )
    );
  }

  return { SensesWidget, SensesPanel, ShadowPicker };
}

// ─── Shared Utilities ─────────────────────────────────────────────────────
let _ReactUtils;
try { _ReactUtils = require('./BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }

// ─── Plugin Class ──────────────────────────────────────────────────────────

module.exports = class ShadowSenses {
  constructor() {
    this.settings = {
      animationEnabled: true,
      respectReducedMotion: false,
      animationDuration: 550,
    };
    this._transitionNavTimeout = null;
    this._transitionCleanupTimeout = null;
    this._transitionRunId = 0;
    this._transitionStopCanvas = null;
    this._navigateRetryTimers = new Set();
    this._navigateRequestId = 0;
    this._channelFadeToken = 0;
    this._channelFadeResetTimer = null;
  }

  start() {
    try {
      console.log(`[${PLUGIN_NAME}] Starting v1.0.0...`);
      this._debugMode = BdApi.Data.load(PLUGIN_NAME, "debugMode") ?? false;
      this._stopped = false;
      this._widgetDirty = true;
      this._panelOpen = false;
      this._pickerOpen = false;
      this._transitionNavTimeout = null;
      this._transitionCleanupTimeout = null;
      this._transitionRunId = 0;
      this._transitionStopCanvas = null;
      this._navigateRetryTimers = new Set();
      this._navigateRequestId = 0;
      this._channelFadeToken = 0;
      this._channelFadeResetTimer = null;

      // DeploymentManager
      this.deploymentManager = new DeploymentManager(
        (...args) => this.debugLog(...args),
        (...args) => this.debugError(...args)
      );
      this.deploymentManager.load();

      // Webpack modules
      this.initWebpack();

      // SensesEngine
      this.sensesEngine = new SensesEngine(this);

      // Subscribe immediately if Dispatcher ready, otherwise poll until available
      if (this._Dispatcher) {
        this.sensesEngine.subscribe();
      } else {
        this._startDispatcherWait();
      }

      // CSS
      this.injectCSS();

      // React components
      this._components = buildComponents(this);

      // Widget
      this.injectWidget();
      this.setupWidgetObserver();

      // ESC handler + context menu
      this.registerEscHandler();
      this.patchContextMenu();

      this.debugLog("Lifecycle", "Started successfully");
      BdApi.UI.showToast(`${PLUGIN_NAME} v1.0.0 \u2014 Shadow deployment online`, { type: "info" });
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] FATAL: start() crashed:`, err);
      BdApi.UI.showToast(`${PLUGIN_NAME} failed to start: ${err.message}`, { type: "error" });
    }
  }

  stop() {
    try {
      // 0. Mark stopped + clear Dispatcher retry timer if still pending
      this._stopped = true;
      if (this._dispatcherRetryTimer) {
        clearTimeout(this._dispatcherRetryTimer);
        this._dispatcherRetryTimer = null;
      }

      // 1. Unsubscribe Dispatcher + final flush (persists feeds to disk)
      if (this.sensesEngine) {
        this.sensesEngine.unsubscribe();
        this.sensesEngine = null;
      }

      // 2. Unpatch context menu
      if (this._unpatchContextMenu) {
        try { this._unpatchContextMenu(); } catch (_) { this.debugLog?.('CLEANUP', 'Context menu unpatch error', _); }
        this._unpatchContextMenu = null;
      }

      // 3. Close panel + picker
      this.closePanel();
      if (this._pickerReactRoot) {
        try { this._pickerReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Picker unmount error in stop()', _); }
        this._pickerReactRoot = null;
      }
      const picker = document.getElementById("shadow-senses-picker-root");
      if (picker) picker.remove();
      this._pickerOpen = false;

      // 4. Widget + observer
      if (this._widgetObserver) {
        this._widgetObserver.disconnect();
        this._widgetObserver = null;
      }
      clearTimeout(this._widgetReinjectTimeout);
      this._widgetReinjectTimeout = null;
      this.removeWidget();

      // 4b. Direct spacer cleanup (in case removeWidget didn't run)
      try {
        const spacer = document.getElementById(WIDGET_SPACER_ID);
        if (spacer) spacer.remove();
      } catch (_) { this.debugLog?.('CLEANUP', 'Spacer cleanup error', _); }

      // 5. ESC handler
      if (this._escHandler) {
        document.removeEventListener("keydown", this._escHandler);
        this._escHandler = null;
      }

      // 6. Stop and remove any active transition
      this._cancelPendingTransition();
      this._clearNavigateRetries();
      this._cancelChannelViewFade();

      // 7. CSS
      this.removeCSS();

      // 7. Clear refs
      this._components = null;
      this.deploymentManager = null;
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    BdApi.UI.showToast(`${PLUGIN_NAME} \u2014 Shadows recalled`, { type: "info" });
  }

  initWebpack() {
    const { Webpack } = BdApi;
    // Sync attempt — fast path if modules already loaded
    // Per doggybootsy (BD core dev): use Stores._dispatcher or getModule(m => m.dispatch && m.subscribe)
    this._Dispatcher =
      Webpack.Stores?.UserStore?._dispatcher ||
      Webpack.getModule(m => m.dispatch && m.subscribe) ||
      Webpack.getByKeys("actionLogger");
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._GuildStore = Webpack.getStore("GuildStore");
    this._NavigationUtils =
      Webpack.getByKeys("transitionTo", "back", "forward") ||
      Webpack.getModule(m => m.transitionTo && m.back && m.forward);
    this.debugLog("Webpack", "Modules acquired (sync)", {
      Dispatcher: !!this._Dispatcher,
      ChannelStore: !!this._ChannelStore,
      SelectedGuildStore: !!this._SelectedGuildStore,
      GuildStore: !!this._GuildStore,
      NavigationUtils: !!this._NavigationUtils,
    });
  }

  /**
   * Resolve a guild's display name from its ID.
   * @param {string} guildId
   * @returns {string} Guild name or truncated ID fallback
   */
  _getGuildName(guildId) {
    try {
      const guild = this._GuildStore?.getGuild(guildId);
      return guild?.name || guildId?.slice(-6) || "Unknown";
    } catch (_) {
      return guildId?.slice(-6) || "Unknown";
    }
  }

  _startDispatcherWait() {
    const { Webpack } = BdApi;
    let attempt = 0;
    const maxAttempts = 30; // 30 × 500ms = 15s

    const tryAcquire = () => {
      if (this._stopped) return;
      attempt++;

      // Per doggybootsy (BD core dev, Dec 2025):
      //   Webpack.Stores.UserStore._dispatcher  OR
      //   Webpack.getModule(m => m.dispatch && m.subscribe)
      this._Dispatcher =
        Webpack.Stores?.UserStore?._dispatcher ||
        Webpack.getModule(m => m.dispatch && m.subscribe) ||
        Webpack.getByKeys("actionLogger");

      if (this._Dispatcher) {
        this.debugLog("Webpack", `Dispatcher acquired on poll #${attempt} (${attempt * 500}ms)`);
        if (this.sensesEngine) this.sensesEngine.subscribe();
        return;
      }

      if (attempt >= maxAttempts) {
        console.error(`[${PLUGIN_NAME}] Dispatcher unavailable after ${maxAttempts} polls (~15s) — message detection will NOT work`);
        BdApi.UI.showToast(`${PLUGIN_NAME}: Dispatcher not found — message detection disabled`, { type: "error" });
        return;
      }
      this._dispatcherRetryTimer = setTimeout(tryAcquire, 500);
    };

    this._dispatcherRetryTimer = setTimeout(tryAcquire, 500);
  }

  teleportToPath(path, context = {}) {
    const targetPath = this._normalizePath(path);
    this.playTransition(() => {
      const fadeToken = this._beginChannelViewFadeOut();
      this._navigate(targetPath, context, {
        onConfirmed: () => this._finishChannelViewFade(fadeToken, true),
        onFailed: () => this._finishChannelViewFade(fadeToken, false),
      });
    });
  }

  _normalizePath(path) {
    const p = String(path || "").trim();
    if (!p) return "/";
    const withSlash = p.startsWith("/") ? p : `/${p}`;
    return withSlash.replace(/\/+$/, "") || "/";
  }

  _isPathActive(targetPath) {
    const target = this._normalizePath(targetPath);
    const current = this._normalizePath(window.location?.pathname || "/");
    if (current === target) return true;
    return current.startsWith(`${target}/`);
  }

  _clearNavigateRetries() {
    for (const timer of this._navigateRetryTimers) {
      clearTimeout(timer);
    }
    this._navigateRetryTimers.clear();
  }

  _findChannelViewNode() {
    const selectors = [
      "#app-mount main",
      "main",
      "#app-mount [role='main']",
      "#app-mount [class*='chatContent']",
      "#app-mount [class*='chat']",
      "#app-mount [class*='content_']",
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node && node.id !== TRANSITION_ID && !node.closest(`#${TRANSITION_ID}`)) return node;
    }
    return null;
  }

  _cancelChannelViewFade() {
    this._channelFadeToken += 1;
    if (this._channelFadeResetTimer) {
      clearTimeout(this._channelFadeResetTimer);
      this._channelFadeResetTimer = null;
    }
    const node = this._findChannelViewNode();
    if (!node) return;
    try {
      node.style.removeProperty("opacity");
      node.style.removeProperty("transition");
      node.style.removeProperty("will-change");
    } catch (error) {
      this.debugError("Transition", "Failed to reset channel view fade styles", error);
    }
  }

  _beginChannelViewFadeOut() {
    this._cancelChannelViewFade();
    const token = this._channelFadeToken;
    const node = this._findChannelViewNode();
    if (!node) return token;
    try {
      node.style.willChange = "opacity";
      if (typeof node.animate === "function") {
        node.animate(
          [{ opacity: 1 }, { opacity: 0.2 }],
          { duration: 120, easing: "ease-out", fill: "forwards" }
        );
      } else {
        node.style.transition = "opacity 120ms ease-out";
        node.style.opacity = "0.2";
      }
    } catch (error) {
      this.debugError("Transition", "Failed to start channel view fade out", error);
    }
    return token;
  }

  _finishChannelViewFade(token, success) {
    if (token !== this._channelFadeToken) return;
    const node = this._findChannelViewNode();
    if (!node) return;
    const fromOpacity = success ? 0.14 : 0.45;
    const duration = success ? 220 : 140;
    try {
      node.style.willChange = "opacity";
      if (typeof node.animate === "function") {
        node.animate(
          [{ opacity: fromOpacity }, { opacity: 1 }],
          { duration, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }
        );
      } else {
        node.style.transition = `opacity ${duration}ms cubic-bezier(.22,.61,.36,1)`;
        node.style.opacity = "1";
      }
    } catch (error) {
      this.debugError("Transition", "Failed to finish channel view fade", error);
    }

    if (this._channelFadeResetTimer) clearTimeout(this._channelFadeResetTimer);
    this._channelFadeResetTimer = setTimeout(() => {
      if (token !== this._channelFadeToken) return;
      this._channelFadeResetTimer = null;
      try {
        node.style.removeProperty("opacity");
        node.style.removeProperty("transition");
        node.style.removeProperty("will-change");
      } catch (error) {
        this.debugError("Transition", "Failed to clean channel view fade styles after transition", error);
      }
    }, duration + 80);
  }

  _navigateOnce(path) {
    try {
      // Primary: NavigationUtils
      if (this._NavigationUtils?.transitionTo) {
        this._NavigationUtils.transitionTo(path);
        return true;
      }
      // Lazy re-acquire
      const { Webpack } = BdApi;
      const nav =
        Webpack.getByKeys("transitionTo", "back", "forward") ||
        Webpack.getModule((m) => m.transitionTo && m.back);
      if (nav?.transitionTo) {
        this._NavigationUtils = nav;
        nav.transitionTo(path);
        return true;
      }
      // Last resort: history.pushState
      if (window.history?.pushState) {
        window.history.pushState({}, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
        return true;
      }
      return false;
    } catch (err) {
      this.debugError("Navigate", "Failed:", err);
      return false;
    }
  }

  _navigate(path, context = {}, hooks = {}) {
    const targetPath = this._normalizePath(path);
    const maxAttempts = 7;
    if (this._isPathActive(targetPath)) {
      this.debugLog("Navigate", `Already at ${targetPath}`);
      if (typeof hooks.onConfirmed === "function") {
        try {
          hooks.onConfirmed({ attempt: 0, alreadyActive: true });
        } catch (error) {
          this.debugError("Navigate", "onConfirmed hook failed for already-active target", error);
        }
      }
      return;
    }
    const requestId = ++this._navigateRequestId;
    this._clearNavigateRetries();

    const attemptNavigate = (attempt) => {
      if (requestId !== this._navigateRequestId) return;

      const invoked = this._navigateOnce(targetPath);
      if (this._isPathActive(targetPath)) {
        this.debugLog("Navigate", `Confirmed ${targetPath} on attempt ${attempt}`);
        if (typeof hooks.onConfirmed === "function") {
          try {
            hooks.onConfirmed({ attempt, targetPath });
          } catch (error) {
            this.debugError("Navigate", "onConfirmed hook failed after navigation confirmation", error);
          }
        }
        return;
      }

      if (attempt >= maxAttempts) {
        const anchorName = context.anchorName ? ` (${context.anchorName})` : "";
        this.debugError("Navigate", `Failed to reach ${targetPath}${anchorName} after ${attempt} attempts`);
        if (typeof hooks.onFailed === "function") {
          try {
            hooks.onFailed({ attempt, targetPath });
          } catch (error) {
            this.debugError("Navigate", "onFailed hook failed after navigation exhaustion", error);
          }
        }
        BdApi.UI.showToast("Shadow Senses failed to switch channel", { type: "error" });
        return;
      }

      // If no navigation API was callable, still retry quickly in case Webpack modules load late.
      const delay = invoked ? 62 + attempt * 38 : 46 + attempt * 34;
      const timer = setTimeout(() => {
        this._navigateRetryTimers.delete(timer);
        if (requestId !== this._navigateRequestId) return;
        attemptNavigate(attempt + 1);
      }, delay);
      this._navigateRetryTimers.add(timer);
    };

    try {
      attemptNavigate(1);
    } catch (err) {
      this.debugError("Navigate", "Unexpected navigation failure:", err);
      if (typeof hooks.onFailed === "function") {
        try {
          hooks.onFailed({ attempt: 0, targetPath, error: err });
        } catch (hookError) {
          this.debugError("Navigate", "onFailed hook threw during navigation exception handling", hookError);
        }
      }
      BdApi.UI.showToast("Navigation error \u2014 check console", { type: "error" });
    }
  }

  _cancelPendingTransition() {
    if (this._transitionNavTimeout) {
      clearTimeout(this._transitionNavTimeout);
      this._transitionNavTimeout = null;
    }
    if (this._transitionCleanupTimeout) {
      clearTimeout(this._transitionCleanupTimeout);
      this._transitionCleanupTimeout = null;
    }
    if (typeof this._transitionStopCanvas === "function") {
      try {
        this._transitionStopCanvas();
      } catch (error) {
        this.debugError("Transition", "Failed to stop active transition canvas", error);
      }
      this._transitionStopCanvas = null;
    }
    const overlay = document.getElementById(TRANSITION_ID);
    if (overlay) overlay.remove();
    this._cancelChannelViewFade();
  }

  playTransition(callback) {
    if (!this.settings.animationEnabled) {
      callback();
      return;
    }

    // Ensure previous transition callbacks cannot fire out of order.
    this._cancelPendingTransition();
    const runId = ++this._transitionRunId;

    const configuredDuration = this.settings.animationDuration || 550;
    const duration = Math.max(420, configuredDuration + 220);
    const totalDuration = duration + 320;
    const transitionStartedAt = performance.now();
    const systemPrefersReducedMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const respectReducedMotion = this.settings.respectReducedMotion !== false;
    const prefersReducedMotion = respectReducedMotion && systemPrefersReducedMotion;
    const overlay = document.createElement("div");
    overlay.id = TRANSITION_ID;
    overlay.className = "ss-transition-overlay";
    overlay.style.setProperty("--ss-duration", `${duration}ms`);
    overlay.style.setProperty("--ss-total-duration", `${totalDuration}ms`);

    const canvas = document.createElement("canvas");
    canvas.className = "ss-transition-canvas";
    overlay.appendChild(canvas);

    const shardCount = prefersReducedMotion ? 0 : 9 + Math.floor(Math.random() * 8);
    this.debugLog(
      "Transition",
      `start style=blackMistPortalCanvasV5 duration=${duration} total=${totalDuration} reducedMotion=${prefersReducedMotion} systemReducedMotion=${systemPrefersReducedMotion} respectReducedMotion=${respectReducedMotion} cinders=${shardCount}`
    );
    for (let i = 0; i < shardCount; i++) {
      const shard = document.createElement("div");
      shard.className = "ss-shard";
      shard.style.left = "50%";
      shard.style.top = "50%";
      shard.style.setProperty("--ss-delay", `${Math.random() * 320}ms`);
      const tx = (Math.random() * 2 - 1) * 230;
      const ty = -40 - Math.random() * 280 + Math.random() * 70;
      const rot = (Math.random() * 150 - 75).toFixed(2);
      shard.style.setProperty("--ss-shard-x", `${tx.toFixed(2)}px`);
      shard.style.setProperty("--ss-shard-y", `${ty.toFixed(2)}px`);
      shard.style.setProperty("--ss-shard-r", `${rot}deg`);
      shard.style.width = `${1.5 + Math.random() * 2.5}px`;
      shard.style.height = `${6 + Math.random() * 10}px`;
      overlay.appendChild(shard);
    }

    document.body.appendChild(overlay);

    const stopPortalCanvas = prefersReducedMotion
      ? null
      : this.startPortalCanvasAnimation(canvas, totalDuration);
    this._transitionStopCanvas = stopPortalCanvas;

    const canUseWaapi = typeof overlay.animate === "function";

    if (!prefersReducedMotion && canUseWaapi) {
      overlay.classList.add("ss-transition-overlay--waapi");

      overlay.animate(
        [
          { opacity: 0 },
          { opacity: 1, offset: 0.1 },
          { opacity: 1, offset: 0.72 },
          { opacity: 0.86, offset: 0.9 },
          { opacity: 0 },
        ],
        { duration: totalDuration, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }
      );

      for (const shard of overlay.querySelectorAll(".ss-shard")) {
        const delay = parseFloat(shard.style.getPropertyValue("--ss-delay")) || 0;
        const tx = shard.style.getPropertyValue("--ss-shard-x") || "0px";
        const ty = shard.style.getPropertyValue("--ss-shard-y") || "-80px";
        const rot = shard.style.getPropertyValue("--ss-shard-r") || "0deg";
        shard.animate(
          [
            { transform: "translate3d(0, 0, 0) rotate(0deg) scale(0.3)", opacity: 0 },
            { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)", opacity: 0.72, offset: 0.22 },
            { transform: `translate3d(${tx}, ${ty}, 0) rotate(${rot}) scale(0.2)`, opacity: 0 },
          ],
          { duration: 900, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards", delay }
        );
      }
      this.debugLog("Transition", "Using WAAPI + canvas portal transition");
    } else if (prefersReducedMotion) {
      overlay.classList.add("ss-transition-overlay--reduced");
      if (canUseWaapi) {
        overlay.animate(
          [{ opacity: 0 }, { opacity: 0.65, offset: 0.35 }, { opacity: 0 }],
          { duration: Math.max(260, Math.round(duration * 0.82)), easing: "ease-out", fill: "forwards" }
        );
      }
    } else {
      overlay.classList.add("ss-transition-overlay--css");
      this.debugLog("Transition", "Using CSS fallback (canvas unavailable)");
    }

    // Channel switch should happen while portal is still expanding.
    let navigated = false;
    const runNavigation = () => {
      if (navigated) return;
      navigated = true;
      this.debugLog("Transition", `Navigation callback fired at ${Math.round(performance.now() - transitionStartedAt)}ms`);
      callback();
    };
    const navDelay = prefersReducedMotion
      ? 24
      : Math.max(42, Math.min(78, Math.round(totalDuration * 0.06)));
    this._transitionNavTimeout = setTimeout(() => {
      if (runId !== this._transitionRunId) return;
      this._transitionNavTimeout = null;
      runNavigation();
    }, navDelay);

    // Remove overlay after transition completes
    const cleanupDelay = prefersReducedMotion ? Math.max(320, Math.round(duration * 0.98)) : totalDuration + 340;
    this._transitionCleanupTimeout = setTimeout(() => {
      if (runId !== this._transitionRunId) return;
      this._transitionCleanupTimeout = null;
      this._cancelPendingTransition();
    }, cleanupDelay);
  }

  startPortalCanvasAnimation(canvas, duration) {
    if (!canvas || typeof canvas.getContext !== "function") return null;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return null;

    const TAU = Math.PI * 2;
    const screenArea = Math.max(
      1,
      Math.floor((window.innerWidth || 1920) * (window.innerHeight || 1080))
    );
    const perfTier = screenArea > 3200000 ? 0 : screenArea > 2400000 ? 1 : 2;
    const qualityScale = perfTier === 0 ? 0.58 : perfTier === 1 ? 0.76 : 1;
    const detailStep = perfTier === 0 ? 2 : 1;
    const mistStep = perfTier === 0 ? 3 : perfTier === 1 ? 2 : 1;
    const shadowScale = perfTier === 0 ? 0.62 : perfTier === 1 ? 0.78 : 1;
    const dprCap = perfTier === 0 ? 1.0 : perfTier === 1 ? 1.2 : 1.35;
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    let width = 1;
    let height = 1;
    let maxSide = 1;
    let cx = 0;
    let cy = 0;
    let rafId = 0;
    let stopped = false;

    const wisps = Array.from({ length: Math.max(72, Math.round(128 * qualityScale)) }, () => ({
      angle: Math.random() * TAU,
      speed: 0.08 + Math.random() * 0.46,
      offset: 0.08 + Math.random() * 1.08,
      size: 20 + Math.random() * 74,
      phase: Math.random() * TAU,
      drift: Math.random() * 2 - 1,
    }));

    const darkBlots = Array.from({ length: Math.max(34, Math.round(56 * qualityScale)) }, () => ({
      angle: Math.random() * TAU,
      speed: 0.12 + Math.random() * 0.38,
      offset: 0.12 + Math.random() * 0.92,
      size: 26 + Math.random() * 62,
      phase: Math.random() * TAU,
    }));

    const portalRifts = Array.from({ length: Math.max(22, Math.round(42 * qualityScale)) }, () => ({
      angle: Math.random() * TAU,
      speed: 0.22 + Math.random() * 0.62,
      spread: 0.42 + Math.random() * 1.05,
      lineWidth: 1 + Math.random() * 2.6,
      length: 0.46 + Math.random() * 0.32,
      phase: Math.random() * TAU,
    }));

    const coreFilaments = Array.from({ length: Math.max(16, Math.round(28 * qualityScale)) }, () => ({
      angle: Math.random() * TAU,
      speed: 0.3 + Math.random() * 0.82,
      spread: 0.62 + Math.random() * 1.12,
      lineWidth: 1 + Math.random() * 2,
      length: 0.54 + Math.random() * 0.26,
      phase: Math.random() * TAU,
    }));

    const ringMistBands = Array.from({ length: Math.max(38, Math.round(84 * qualityScale)) }, () => ({
      angle: Math.random() * TAU,
      speed: 0.2 + Math.random() * 0.95,
      width: 0.06 + Math.random() * 0.22,
      band: 0.74 + Math.random() * 0.64,
      lineWidth: 1.1 + Math.random() * 2.7,
      phase: Math.random() * TAU,
    }));

    const purpleJets = Array.from({ length: Math.max(18, Math.round(34 * qualityScale)) }, () => ({
      angle: Math.random() * TAU,
      speed: 0.24 + Math.random() * 0.92,
      length: 0.34 + Math.random() * 0.32,
      spread: 0.22 + Math.random() * 0.64,
      lineWidth: 1 + Math.random() * 2.5,
      phase: Math.random() * TAU,
    }));

    const outerLightning = Array.from({ length: Math.max(12, Math.round(22 * qualityScale)) }, () => ({
      angle: Math.random() * TAU,
      speed: 0.32 + Math.random() * 0.88,
      reach: 0.24 + Math.random() * 0.42,
      width: 0.9 + Math.random() * 1.55,
      jitter: 0.028 + Math.random() * 0.052,
      phase: Math.random() * TAU,
    }));

    const resize = () => {
      width = Math.max(1, Math.floor(window.innerWidth));
      height = Math.max(1, Math.floor(window.innerHeight));
      maxSide = Math.max(width, height);
      cx = width / 2;
      cy = height / 2;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const start = performance.now();
    const draw = (now) => {
      if (stopped) return;

      const elapsed = now - start;
      const t = Math.max(0, Math.min(1, elapsed / Math.max(1, duration)));
      const easeInOut = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const fadeOut = t < 0.78 ? 1 : Math.max(0, 1 - (t - 0.78) / 0.22);
      const swirl = elapsed * 0.00125;
      const formT = Math.min(1, t / 0.34);
      const formEase = 1 - Math.pow(1 - formT, 3);
      const portalForm = 0.24 + 0.76 * formEase;
      const revealStart = 0.2;
      const revealProgress = t <= revealStart ? 0 : Math.min(1, (t - revealStart) / (1 - revealStart));
      const revealEase = revealProgress < 0.5
        ? 2 * revealProgress * revealProgress
        : 1 - Math.pow(-2 * revealProgress + 2, 2) / 2;

      const portalRadius = maxSide * (0.68 + 1.28 * easeInOut);
      const innerRadius = portalRadius * (0.62 + 0.1 * Math.sin(swirl * 4.4));

      ctx.clearRect(0, 0, width, height);

      const ambientDim = (0.026 + 0.048 * formEase) * fadeOut;
      ctx.fillStyle = `rgba(2, 2, 6, ${ambientDim.toFixed(4)})`;
      ctx.fillRect(0, 0, width, height);

      const veilOuter = maxSide * (0.58 + 0.9 * formEase);
      const veilInner = Math.max(2, innerRadius * (0.1 + 0.18 * formEase));
      const veil = ctx.createRadialGradient(cx, cy, veilInner, cx, cy, veilOuter);
      veil.addColorStop(0, `rgba(22, 12, 36, ${(0.2 * portalForm * fadeOut).toFixed(4)})`);
      veil.addColorStop(0.26, `rgba(12, 8, 22, ${(0.28 * portalForm * fadeOut).toFixed(4)})`);
      veil.addColorStop(0.62, `rgba(6, 6, 12, ${(0.14 * portalForm * fadeOut).toFixed(4)})`);
      veil.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = veil;
      ctx.beginPath();
      ctx.arc(cx, cy, veilOuter, 0, TAU);
      ctx.fill();

      for (let wi = 0; wi < wisps.length; wi += detailStep) {
        const wisp = wisps[wi];
        const ang = wisp.angle + swirl * wisp.speed + Math.sin(swirl * 0.8 + wisp.phase) * 0.2;
        const orbit = portalRadius * (0.34 + wisp.offset * 0.72) + Math.sin(swirl * 2.4 + wisp.phase) * portalRadius * 0.12;
        const x = cx + Math.cos(ang) * orbit + Math.sin(swirl + wisp.phase) * 20 * wisp.drift;
        const y = cy + Math.sin(ang) * orbit * 0.78 + Math.cos(swirl * 0.92 + wisp.phase) * 14 * wisp.drift;
        const r = wisp.size * (0.88 + easeInOut * 0.72);
        const alpha = (0.03 + 0.22 * (1 - wisp.offset * 0.68)) * fadeOut * portalForm;

        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(46, 42, 56, ${(alpha * 1.18).toFixed(4)})`);
        g.addColorStop(0.56, `rgba(14, 12, 20, ${alpha.toFixed(4)})`);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }

      for (let bi = 0; bi < darkBlots.length; bi += detailStep) {
        const blot = darkBlots[bi];
        const ang = blot.angle - swirl * blot.speed + Math.sin(swirl * 0.9 + blot.phase) * 0.32;
        const radius = innerRadius * (0.22 + blot.offset * 0.86);
        const x = cx + Math.cos(ang) * radius;
        const y = cy + Math.sin(ang) * radius * 0.82;
        const r = blot.size * (0.82 + easeInOut * 0.62);
        const alpha = (0.18 + 0.26 * (1 - blot.offset * 0.7)) * fadeOut * portalForm;
        const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
        bg.addColorStop(0, `rgba(0, 0, 0, ${Math.min(0.86, alpha).toFixed(4)})`);
        bg.addColorStop(0.62, `rgba(0, 0, 0, ${(alpha * 0.58).toFixed(4)})`);
        bg.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }

      // Purple portal energy is concentrated on the ring, not the center.
      const ringOuterClip = innerRadius * (1.18 + 0.05 * Math.sin(swirl * 1.6));
      const ringInnerClip = innerRadius * (0.66 + 0.04 * Math.sin(swirl * 2.1));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, ringOuterClip, 0, TAU);
      ctx.arc(cx, cy, ringInnerClip, 0, TAU, true);
      ctx.clip("evenodd");
      ctx.globalCompositeOperation = "screen";

      for (let ri = 0; ri < portalRifts.length; ri += detailStep) {
        const rift = portalRifts[ri];
        const base = rift.angle + swirl * rift.speed + Math.sin(swirl * 1.2 + rift.phase) * 0.22;
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const p = i / 8;
          const rr = innerRadius * (
            1.06 -
            p * rift.length * 0.34 +
            0.08 * Math.sin(swirl * 2.3 + rift.phase + p * 2.8)
          );
          const ang = base + (p - 0.48) * rift.spread + Math.sin(swirl * 2 + rift.phase + p) * 0.08;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.86;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const glow = (0.25 + 0.32 * Math.sin(swirl * 2.6 + rift.phase)) * fadeOut;
        ctx.strokeStyle = `rgba(188, 130, 255, ${Math.max(0.07, glow).toFixed(4)})`;
        ctx.lineWidth = rift.lineWidth + easeInOut * 1.8;
        ctx.shadowBlur = (10 + easeInOut * 20) * shadowScale;
        ctx.shadowColor = "rgba(146, 78, 248, 0.78)";
        ctx.stroke();
      }

      for (let fi = 0; fi < coreFilaments.length; fi += detailStep) {
        const filament = coreFilaments[fi];
        const base = filament.angle - swirl * filament.speed + Math.sin(swirl * 1.8 + filament.phase) * 0.26;
        ctx.beginPath();
        for (let i = 0; i <= 7; i++) {
          const p = i / 7;
          const rr = innerRadius * (
            0.74 +
            p * filament.length * 0.44 +
            0.06 * Math.sin(swirl * 2.9 + filament.phase + p * 2.2)
          );
          const ang = base - p * filament.spread * 0.6 + Math.sin(swirl * 2.1 + filament.phase + p) * 0.06;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.88;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const glow = (0.22 + 0.3 * Math.sin(swirl * 3.2 + filament.phase)) * fadeOut;
        ctx.strokeStyle = `rgba(238, 186, 255, ${Math.max(0.07, glow).toFixed(4)})`;
        ctx.lineWidth = filament.lineWidth + easeInOut * 1.1;
        ctx.shadowBlur = (8 + easeInOut * 15) * shadowScale;
        ctx.shadowColor = "rgba(214, 136, 255, 0.76)";
        ctx.stroke();
      }

      for (let ji = 0; ji < purpleJets.length; ji += detailStep) {
        const jet = purpleJets[ji];
        const jetBase = jet.angle + swirl * jet.speed + Math.sin(swirl * 1.7 + jet.phase) * 0.24;
        const startR = innerRadius * (0.82 + 0.3 * Math.sin(swirl * 1.3 + jet.phase) * 0.2);
        const endR = startR + innerRadius * (0.12 + jet.length * 0.26);
        const waviness = 0.05 + jet.spread * 0.1;

        ctx.beginPath();
        for (let i = 0; i <= 5; i++) {
          const p = i / 5;
          const rr = startR + (endR - startR) * p;
          const ang = jetBase + (p - 0.5) * jet.spread * 0.5 + Math.sin(swirl * 3.1 + jet.phase + p * 4.2) * waviness;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.87;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const glow = (0.22 + 0.25 * Math.sin(swirl * 3 + jet.phase)) * fadeOut;
        ctx.strokeStyle = `rgba(206, 142, 255, ${Math.max(0.06, glow).toFixed(4)})`;
        ctx.lineWidth = jet.lineWidth + easeInOut * 1.4;
        ctx.shadowBlur = (8 + easeInOut * 14) * shadowScale;
        ctx.shadowColor = "rgba(166, 94, 255, 0.76)";
        ctx.stroke();
      }
      ctx.restore();

      const voidGradient = ctx.createRadialGradient(cx, cy, innerRadius * 0.14, cx, cy, innerRadius * 2.18);
      voidGradient.addColorStop(0, `rgba(4, 2, 8, ${(0.88 * fadeOut).toFixed(4)})`);
      voidGradient.addColorStop(0.34, `rgba(2, 1, 5, ${(0.96 * fadeOut).toFixed(4)})`);
      voidGradient.addColorStop(0.72, `rgba(1, 1, 2, ${(0.92 * fadeOut).toFixed(4)})`);
      voidGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = voidGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius * 2.18, 0, TAU);
      ctx.fill();

      // Hard occlusion mask so the portal body is fully solid.
      const solidPortalRadius = innerRadius * (1.02 + 0.03 * Math.sin(swirl * 3.1));
      const solidPortalAlpha = Math.min(1, 0.98 * fadeOut + 0.02);
      ctx.fillStyle = `rgba(0, 0, 0, ${solidPortalAlpha.toFixed(4)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, solidPortalRadius, 0, TAU);
      ctx.fill();

      const coreGradient = ctx.createRadialGradient(cx, cy, innerRadius * 0.08, cx, cy, innerRadius);
      coreGradient.addColorStop(0, `rgba(1, 1, 2, ${(0.98 * fadeOut).toFixed(4)})`);
      coreGradient.addColorStop(0.32, `rgba(0, 0, 1, ${(1 * fadeOut).toFixed(4)})`);
      coreGradient.addColorStop(0.72, `rgba(0, 0, 0, ${(1 * fadeOut).toFixed(4)})`);
      coreGradient.addColorStop(1, `rgba(0, 0, 0, ${(1 * fadeOut).toFixed(4)})`);
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(0, 0, 0, ${(1 * fadeOut).toFixed(4)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius * 0.78, 0, TAU);
      ctx.fill();

      // Large center vortex so formation reads as a portal, not a plain overlay.
      const coreVortexAlpha = (0.14 + 0.3 * (1 - revealProgress)) * fadeOut * portalForm;
      if (coreVortexAlpha > 0.004) {
        const coreVortexRadius = innerRadius * (0.78 + 0.22 * formEase);
        ctx.save();
        ctx.globalCompositeOperation = "source-over";

        const vortexGlow = ctx.createRadialGradient(
          cx,
          cy,
          Math.max(2, coreVortexRadius * 0.08),
          cx,
          cy,
          coreVortexRadius
        );
        vortexGlow.addColorStop(0, `rgba(170, 118, 255, ${(coreVortexAlpha * 0.84).toFixed(4)})`);
        vortexGlow.addColorStop(0.24, `rgba(120, 80, 214, ${(coreVortexAlpha * 0.48).toFixed(4)})`);
        vortexGlow.addColorStop(0.66, `rgba(60, 42, 116, ${(coreVortexAlpha * 0.22).toFixed(4)})`);
        vortexGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = vortexGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, coreVortexRadius, 0, TAU);
        ctx.fill();

        const swirlCount = perfTier === 0 ? 5 : perfTier === 1 ? 7 : 9;
        const swirlPoints = perfTier === 0 ? 11 : 13;
        const turnBase = 2.1 + formEase * 0.9;
        for (let s = 0; s < swirlCount; s++) {
          const phase = swirl * (1.45 + s * 0.19);
          const direction = s % 2 === 0 ? 1 : -1;
          const base = (s / swirlCount) * TAU + phase * direction;
          const laneNoise = Math.sin(phase * 1.7 + s * 0.8) * 0.22;

          ctx.beginPath();
          for (let i = 0; i <= swirlPoints; i++) {
            const p = i / swirlPoints;
            const rr = coreVortexRadius * (
              0.1 +
              0.86 * p +
              0.08 * Math.sin(phase * 2.8 + p * 10.2 + s * 0.6)
            );
            const twist = p * (turnBase + 0.22 * s) * direction;
            const cork = Math.sin(phase * 3.2 + p * 7.4 + s * 0.4) * 0.17;
            const ang = base + twist + cork + laneNoise * (1 - p * 0.45);
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr * 0.88;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          const strandAlpha = coreVortexAlpha * (0.5 + 0.44 * Math.sin(phase + s * 0.6));
          ctx.strokeStyle = `rgba(210, 154, 255, ${Math.max(0.04, strandAlpha).toFixed(4)})`;
          ctx.lineWidth = (1.25 + s * 0.18) * (perfTier === 0 ? 0.9 : 1);
          ctx.shadowBlur = (10 + s * 1.35) * shadowScale;
          ctx.shadowColor = `rgba(150, 92, 240, ${(strandAlpha * 0.8).toFixed(4)})`;
          ctx.stroke();
        }

        const counterCount = perfTier === 0 ? 2 : 3;
        for (let c = 0; c < counterCount; c++) {
          const phase = swirl * (2.2 + c * 0.35);
          const base = (c / counterCount) * TAU + phase;
          ctx.beginPath();
          for (let i = 0; i <= 9; i++) {
            const p = i / 9;
            const rr = coreVortexRadius * (
              0.18 +
              0.68 * p +
              0.05 * Math.sin(phase * 3.1 + p * 9.3)
            );
            const ang =
              base -
              p * (2.3 + c * 0.35) +
              Math.sin(phase * 4.2 + p * 6.4) * 0.14;
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr * 0.88;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          const ca = coreVortexAlpha * 0.42;
          ctx.strokeStyle = `rgba(182, 128, 246, ${Math.max(0.03, ca).toFixed(4)})`;
          ctx.lineWidth = perfTier === 0 ? 1 : 1.2;
          ctx.shadowBlur = (8 + c * 2.2) * shadowScale;
          ctx.shadowColor = `rgba(130, 82, 220, ${(ca * 0.86).toFixed(4)})`;
          ctx.stroke();
        }

        ctx.beginPath();
        for (let i = 0; i <= 28; i++) {
          const p = i / 28;
          const ang = p * TAU + swirl * 1.95;
          const rr = coreVortexRadius * (
            0.28 +
            0.14 * Math.sin(swirl * 4.2 + p * 12) +
            0.07 * Math.sin(swirl * 6.5 + p * 8.2)
          );
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.88;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(122, 78, 206, ${(coreVortexAlpha * 0.34).toFixed(4)})`;
        ctx.fill();
        ctx.restore();
      }

      // Chaotic lightning during early portal formation (no delayed start).
      const lightningRamp = Math.max(0, Math.min(1, t / 0.28));
      if (lightningRamp > 0.01) {
        const boltStep = perfTier === 0 ? Math.max(2, detailStep) : detailStep;
        const creationBoost = Math.max(
          0,
          Math.min(1, 1 - t / Math.max(0.01, revealStart + 0.08))
        );
        const activeBoltStep =
          creationBoost > 0.24 ? Math.max(1, boltStep - 1) : boltStep;
        const mainSteps = perfTier === 0 ? 4 : 6;
        const branchSteps = perfTier === 0 ? 3 : 4;
        const lightningRadius =
          innerRadius * (0.86 + 0.14 * formEase + Math.sin(swirl * 1.9) * 0.05);
        const lightningFade = Math.max(0, 1 - revealProgress * 0.28);

        ctx.save();
        ctx.globalCompositeOperation = "screen";

        for (let li = 0; li < outerLightning.length; li += activeBoltStep) {
          const bolt = outerLightning[li];
          const drift = swirl * bolt.speed + bolt.phase;
          const flicker =
            0.5 +
            0.5 * Math.sin(drift * 4.4 + t * 12.4) +
            0.35 * Math.sin(drift * 7.2 + bolt.phase * 1.3);
          const flickerGate = -0.18 - creationBoost * 0.16;
          if (flicker < flickerGate) continue;

          const alpha =
            (0.06 + 0.12 * (flicker * 0.5 + 0.5)) *
            (1 + creationBoost * 0.42) *
            lightningRamp *
            lightningFade *
            fadeOut;
          if (alpha <= 0.004) continue;

          const baseA = bolt.angle + drift * 0.24 + Math.sin(drift * 2.1) * 0.08;
          const startR = lightningRadius * (0.96 + 0.08 * Math.sin(drift * 1.8));
          const reach = innerRadius * (0.12 + bolt.reach * (0.38 + 0.3 * lightningRamp));
          const span = 0.22 + 0.1 * Math.sin(drift * 2.6 + bolt.phase);

          ctx.beginPath();
          for (let i = 0; i <= mainSteps; i++) {
            const p = i / mainSteps;
            const rr = startR + reach * p;
            const jag =
              Math.sin(drift * 3.2 + p * 12.6) +
              0.65 * Math.sin(drift * 5.6 + p * 8.1 + bolt.phase);
            const ang = baseA + (p - 0.24) * span + jag * bolt.jitter * (1 + p * 1.38);
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr * 0.88;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          ctx.strokeStyle = `rgba(112, 66, 206, ${(alpha * 0.78).toFixed(4)})`;
          ctx.lineWidth = bolt.width + 1;
          ctx.shadowBlur = (12 + (1 - revealProgress) * 12) * shadowScale;
          ctx.shadowColor = `rgba(102, 56, 196, ${(alpha * 0.9).toFixed(4)})`;
          ctx.stroke();

          ctx.strokeStyle = `rgba(216, 172, 255, ${Math.min(0.4, alpha + 0.05).toFixed(4)})`;
          ctx.lineWidth = Math.max(0.82, bolt.width * 0.58);
          ctx.shadowBlur = (6 + (1 - revealProgress) * 7) * shadowScale;
          ctx.shadowColor = `rgba(178, 130, 255, ${(alpha * 0.8).toFixed(4)})`;
          ctx.stroke();

          if (flicker > (0.22 - creationBoost * 0.24)) {
            const dir = Math.sin(drift * 2.2 + bolt.phase) > 0 ? 1 : -1;
            const branchStartP = 0.34 + 0.22 * (0.5 + 0.5 * Math.sin(drift * 1.5 + bolt.phase));
            const fromR = startR + reach * branchStartP;
            const fromA = baseA + dir * 0.04;
            const branchReach = reach * (0.38 + 0.22 * (0.5 + 0.5 * Math.sin(drift * 2.4)));
            const branchSpan = dir * (0.2 + 0.1 * Math.sin(drift * 3 + bolt.phase));

            ctx.beginPath();
            for (let b = 0; b <= branchSteps; b++) {
              const p = b / branchSteps;
              const rr = fromR + branchReach * p;
              const jag =
                Math.sin(drift * 4.1 + p * 9.2) +
                0.48 * Math.sin(drift * 6.3 + p * 6.1 + bolt.phase);
              const ang = fromA + p * branchSpan + jag * bolt.jitter * 1.35;
              const x = cx + Math.cos(ang) * rr;
              const y = cy + Math.sin(ang) * rr * 0.88;
              if (b === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }

            const branchAlpha = alpha * 0.58;
            ctx.strokeStyle = `rgba(124, 78, 220, ${branchAlpha.toFixed(4)})`;
            ctx.lineWidth = Math.max(0.75, bolt.width * 0.64);
            ctx.shadowBlur = (9 + (1 - revealProgress) * 9) * shadowScale;
            ctx.shadowColor = `rgba(110, 68, 206, ${(branchAlpha * 0.86).toFixed(4)})`;
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      // Late-stage reveal: black rim with dense mist and purple turbulence.
      if (revealProgress > 0) {
        const apertureRadius =
          innerRadius *
          (0.24 + 2.36 * revealEase) *
          (1 + Math.sin(swirl * 9.8) * 0.11 * (1 - revealProgress * 0.62));

        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(cx, cy, apertureRadius, 0, TAU);
        ctx.fill();
        ctx.restore();

        const ringRadius = apertureRadius * (1 + Math.sin(swirl * 10.8) * 0.026);
        const rimWidth = innerRadius * (0.17 + (1 - revealProgress) * 0.1);
        const ringInner = Math.max(2, ringRadius - rimWidth * 0.56);
        const ringOuter = ringRadius + rimWidth;

        ctx.save();
        ctx.globalCompositeOperation = "source-over";

        const ringBody = ctx.createRadialGradient(cx, cy, ringInner, cx, cy, ringOuter);
        ringBody.addColorStop(0, `rgba(0, 0, 0, ${(0.98 * fadeOut).toFixed(4)})`);
        ringBody.addColorStop(0.62, `rgba(0, 0, 0, ${(1 * fadeOut).toFixed(4)})`);
        ringBody.addColorStop(0.88, `rgba(10, 8, 14, ${(0.54 * fadeOut).toFixed(4)})`);
        ringBody.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = ringBody;
        ctx.beginPath();
        ctx.arc(cx, cy, ringOuter, 0, TAU);
        ctx.arc(cx, cy, ringInner, 0, TAU, true);
        ctx.fill("evenodd");

        const blackRimAlpha = Math.max(0, (0.96 - revealProgress * 0.3) * fadeOut);
        if (blackRimAlpha > 0.006) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0, 0, 0, ${blackRimAlpha.toFixed(4)})`;
          ctx.lineWidth = 6 + (1 - revealProgress) * 8.8;
          ctx.shadowBlur = (6 + (1 - revealProgress) * 10) * shadowScale;
          ctx.shadowColor = `rgba(0, 0, 0, ${(blackRimAlpha * 0.78).toFixed(4)})`;
          ctx.arc(cx, cy, ringRadius, 0, TAU);
          ctx.stroke();
        }

        const edgeAlpha = Math.max(0, (0.34 - revealProgress * 0.12) * fadeOut);
        if (edgeAlpha > 0.004) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(124, 120, 136, ${edgeAlpha.toFixed(4)})`;
          ctx.lineWidth = 1.2 + (1 - revealProgress) * 1.4;
          ctx.shadowBlur = (8 + (1 - revealProgress) * 8) * shadowScale;
          ctx.shadowColor = `rgba(48, 44, 60, ${(edgeAlpha * 0.84).toFixed(4)})`;
          ctx.arc(cx, cy, ringRadius + rimWidth * 0.34, 0, TAU);
          ctx.stroke();
        }

        for (let mi = 0; mi < ringMistBands.length; mi += mistStep) {
          const band = ringMistBands[mi];
          const drift = swirl * band.speed + band.phase;
          const radius = ringRadius + innerRadius * (0.03 + (band.band - 0.9) * 0.24) + Math.sin(drift * 1.2) * innerRadius * 0.03;
          const arcLength = band.width + Math.sin(drift * 1.8) * 0.04;
          const start = band.angle + drift * 0.32;
          const alpha = (0.07 + 0.12 * (1 - revealProgress)) * (0.7 + Math.sin(drift * 2.4) * 0.3) * fadeOut;
          if (alpha <= 0.004) continue;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(66, 66, 76, ${Math.max(0.01, alpha).toFixed(4)})`;
          ctx.lineWidth = band.lineWidth + (1 - revealProgress) * 1.8;
          ctx.shadowBlur = (10 + (1 - revealProgress) * 16) * shadowScale;
          ctx.shadowColor = `rgba(18, 18, 24, ${(alpha * 0.9).toFixed(4)})`;
          ctx.arc(cx, cy, radius, start, start + arcLength);
          ctx.stroke();
        }

        for (let i = 0; i < 5; i++) {
          const wave = revealProgress * 1.45 - i * 0.18;
          if (wave <= 0 || wave >= 1.52) continue;
          const waveRadius = ringRadius * (0.95 + wave * 1.08);
          const waveAlpha = (0.18 * (1 - Math.min(1, wave)) * (1 - i * 0.14)) * fadeOut;
          if (waveAlpha <= 0.003) continue;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(58, 58, 66, ${waveAlpha.toFixed(4)})`;
          ctx.lineWidth = Math.max(1, 4.6 - wave * 2.1);
          ctx.shadowBlur = (12 + (1 - wave) * 16) * shadowScale;
          ctx.shadowColor = `rgba(20, 20, 26, ${(waveAlpha * 0.92).toFixed(4)})`;
          ctx.arc(cx, cy, waveRadius, 0, TAU);
          ctx.stroke();
        }

        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < purpleJets.length; i += detailStep) {
          const jet = purpleJets[i];
          const drift = swirl * jet.speed + jet.phase;
          const radius = ringRadius + innerRadius * (0.02 + Math.sin(drift * 1.7) * 0.08);
          const start = jet.angle + drift * 0.24;
          const span = 0.08 + jet.spread * 0.14 + Math.sin(drift * 2.1) * 0.02;
          const alpha = (0.1 + 0.16 * (1 - revealProgress)) * (0.7 + Math.sin(drift * 3.1) * 0.3) * fadeOut;
          if (alpha <= 0.004) continue;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(178, 118, 255, ${Math.max(0.03, alpha).toFixed(4)})`;
          ctx.lineWidth = jet.lineWidth + 0.75 + (1 - revealProgress) * 1.35;
          ctx.shadowBlur = (11 + (1 - revealProgress) * 13) * shadowScale;
          ctx.shadowColor = `rgba(138, 74, 242, ${(alpha * 0.95).toFixed(4)})`;
          ctx.arc(cx, cy, radius, start, start + span);
          ctx.stroke();
        }

        // Secondary lightning during pulse-out reveal (same style, fewer bolts).
        const revealLightningRamp = Math.max(0, Math.min(1, (revealProgress - 0.08) / 0.92));
        if (revealLightningRamp > 0.01) {
          const revealBoltStep = Math.max(perfTier === 0 ? 3 : 2, detailStep + 1);
          const revealMainSteps = perfTier === 0 ? 4 : 5;
          const revealBranchSteps = perfTier === 0 ? 3 : 4;
          const revealLightningRadius = ringRadius + rimWidth * 0.28;

          for (let li = 0; li < outerLightning.length; li += revealBoltStep) {
            const bolt = outerLightning[li];
            const drift = swirl * (bolt.speed * 1.06) + bolt.phase;
            const flicker =
              0.5 +
              0.5 * Math.sin(drift * 4.2 + revealProgress * 16) +
              0.3 * Math.sin(drift * 6.6 + bolt.phase * 1.2);
            if (flicker < -0.04) continue;

            const alpha =
              (0.04 + 0.08 * (flicker * 0.5 + 0.5)) *
              revealLightningRamp *
              fadeOut;
            if (alpha <= 0.003) continue;

            const baseA = bolt.angle + drift * 0.2 + Math.sin(drift * 1.8) * 0.06;
            const startR = revealLightningRadius * (0.98 + 0.05 * Math.sin(drift * 1.7));
            const reach = innerRadius * (0.1 + bolt.reach * 0.26);
            const span = 0.2 + 0.08 * Math.sin(drift * 2.4 + bolt.phase);

            ctx.beginPath();
            for (let i = 0; i <= revealMainSteps; i++) {
              const p = i / revealMainSteps;
              const rr = startR + reach * p;
              const jag =
                Math.sin(drift * 3 + p * 12.2) +
                0.58 * Math.sin(drift * 5.1 + p * 7.6 + bolt.phase);
              const ang = baseA + (p - 0.24) * span + jag * bolt.jitter * (1 + p * 1.12);
              const x = cx + Math.cos(ang) * rr;
              const y = cy + Math.sin(ang) * rr * 0.88;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }

            ctx.strokeStyle = `rgba(108, 64, 198, ${(alpha * 0.72).toFixed(4)})`;
            ctx.lineWidth = Math.max(0.78, bolt.width * 0.88);
            ctx.shadowBlur = (10 + (1 - revealProgress) * 8) * shadowScale;
            ctx.shadowColor = `rgba(100, 58, 188, ${(alpha * 0.88).toFixed(4)})`;
            ctx.stroke();

            ctx.strokeStyle = `rgba(208, 164, 255, ${Math.min(0.32, alpha + 0.03).toFixed(4)})`;
            ctx.lineWidth = Math.max(0.7, bolt.width * 0.48);
            ctx.shadowBlur = (5 + (1 - revealProgress) * 6) * shadowScale;
            ctx.shadowColor = `rgba(170, 126, 246, ${(alpha * 0.74).toFixed(4)})`;
            ctx.stroke();

            if (flicker > 0.26) {
              const dir = Math.sin(drift * 2 + bolt.phase) > 0 ? 1 : -1;
              const branchStartP = 0.36 + 0.2 * (0.5 + 0.5 * Math.sin(drift * 1.4 + bolt.phase));
              const fromR = startR + reach * branchStartP;
              const fromA = baseA + dir * 0.035;
              const branchReach = reach * (0.32 + 0.18 * (0.5 + 0.5 * Math.sin(drift * 2.1)));
              const branchSpan = dir * (0.18 + 0.08 * Math.sin(drift * 2.8 + bolt.phase));

              ctx.beginPath();
              for (let b = 0; b <= revealBranchSteps; b++) {
                const p = b / revealBranchSteps;
                const rr = fromR + branchReach * p;
                const jag =
                  Math.sin(drift * 3.8 + p * 8.6) +
                  0.45 * Math.sin(drift * 6 + p * 5.4 + bolt.phase);
                const ang = fromA + p * branchSpan + jag * bolt.jitter * 1.16;
                const x = cx + Math.cos(ang) * rr;
                const y = cy + Math.sin(ang) * rr * 0.88;
                if (b === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }

              const branchAlpha = alpha * 0.5;
              ctx.strokeStyle = `rgba(120, 76, 210, ${branchAlpha.toFixed(4)})`;
              ctx.lineWidth = Math.max(0.65, bolt.width * 0.52);
              ctx.shadowBlur = (7 + (1 - revealProgress) * 6) * shadowScale;
              ctx.shadowColor = `rgba(108, 70, 198, ${(branchAlpha * 0.82).toFixed(4)})`;
              ctx.stroke();
            }
          }
        }

        const mistHalo = ctx.createRadialGradient(
          cx,
          cy,
          Math.max(2, ringRadius * 0.82),
          cx,
          cy,
          ringRadius + innerRadius * (0.54 + (1 - revealProgress) * 0.18)
        );
        mistHalo.addColorStop(0, "rgba(0, 0, 0, 0)");
        mistHalo.addColorStop(0.38, `rgba(62, 62, 76, ${(0.18 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(0.66, `rgba(28, 28, 36, ${(0.28 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(0.84, `rgba(84, 50, 132, ${(0.12 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = mistHalo;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius + innerRadius * 0.7, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      if (t < 1) rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      ctx.clearRect(0, 0, width, height);
    };
  }

  injectCSS() {
    try {
      BdApi.DOM.addStyle(STYLE_ID, buildCSS());
      this.debugLog("CSS", "Injected via BdApi.DOM.addStyle");
    } catch (err) {
      // Manual fallback
      try {
        if (!document.getElementById(STYLE_ID)) {
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = buildCSS();
          document.head.appendChild(style);
          this.debugLog("CSS", "Injected via manual <style> fallback");
        }
      } catch (fallbackErr) {
        this.debugError("CSS", "Failed to inject CSS", fallbackErr);
      }
    }
  }

  removeCSS() {
    try {
      BdApi.DOM.removeStyle(STYLE_ID);
    } catch (err) {
      // Manual fallback
      try {
        const el = document.getElementById(STYLE_ID);
        if (el) el.remove();
      } catch (fallbackErr) {
        this.debugError("CSS", "Failed to remove CSS", fallbackErr);
      }
    }
  }

  debugLog(system, ...args) {
    if (this._debugMode) console.log(`[${PLUGIN_NAME}][${system}]`, ...args);
  }

  debugError(system, ...args) {
    console.error(`[${PLUGIN_NAME}][${system}]`, ...args);
  }

  // ── Widget Injection ────────────────────────────────────────────────────

  _getMembersWrap() {
    try {
      const wraps = document.querySelectorAll('[class^="membersWrap_"], [class*=" membersWrap_"]');
      for (const wrap of wraps) {
        if (wrap.offsetParent !== null) return wrap;
      }
    } catch (err) {
      this.debugError("Widget", "Failed to find membersWrap", err);
    }
    return null;
  }

  _getCreateRoot() {
    if (_ReactUtils?.getCreateRoot) return _ReactUtils.getCreateRoot();
    // Minimal inline fallback
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  }

  injectWidget() {
    try {
      if (!this._components?.SensesWidget) {
        this.debugError?.('Widget', 'Components not initialized');
        return;
      }

      // Clean up any existing widget
      this.removeWidget();

      const membersWrap = this._getMembersWrap();
      if (!membersWrap) {
        this.debugLog("Widget", "membersWrap not found, skipping widget inject");
        return;
      }

      // Find innermost content target: membersList > membersContent (or first child)
      const membersList = membersWrap.querySelector('[class^="members_"], [class*=" members_"]');
      const target = membersList || membersWrap;

      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        this.debugError("Widget", "createRoot not available");
        return;
      }

      // Create spacer
      const spacer = document.createElement("div");
      spacer.id = WIDGET_SPACER_ID;
      spacer.style.height = "16px";
      spacer.style.flexShrink = "0";

      // Create widget container
      const widgetDiv = document.createElement("div");
      widgetDiv.id = WIDGET_ID;
      widgetDiv.style.flexShrink = "0";

      // Insert at top
      if (target.firstChild) {
        target.insertBefore(widgetDiv, target.firstChild);
        target.insertBefore(spacer, widgetDiv);
      } else {
        target.appendChild(spacer);
        target.appendChild(widgetDiv);
      }

      // Mount React
      const root = createRoot(widgetDiv);
      root.render(BdApi.React.createElement(this._components.SensesWidget));
      this._widgetReactRoot = root;

      this.debugLog("Widget", "Injected into members panel");
    } catch (err) {
      this.debugError("Widget", "Failed to inject widget", err);
    }
  }

  removeWidget() {
    try {
      if (this._widgetReactRoot) {
        try { this._widgetReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Widget unmount error', _); }
        this._widgetReactRoot = null;
      }
      const existing = document.getElementById(WIDGET_ID);
      if (existing) existing.remove();
      const spacer = document.getElementById(WIDGET_SPACER_ID);
      if (spacer) spacer.remove();
    } catch (err) {
      this.debugError("Widget", "Failed to remove widget", err);
    }
  }

  setupWidgetObserver() {
    try {
      const appMount = document.getElementById("app-mount");
      if (!appMount) {
        this.debugError("Widget", "app-mount not found for observer");
        return;
      }

      // Narrow target: observe layout container instead of entire Discord DOM.
      // Chromium creates O(depth) ancestor walks per mutation with subtree:true.
      // app-mount captures ALL mutations (typing, presence, popups, tooltips).
      // Layout container only captures channel/member list structural changes.
      const layoutContainer = appMount.querySelector('[class*="base_"][class*="container_"]')
        || appMount.querySelector('[class*="app_"]')
        || appMount; // fallback if Discord class names change

      let lastCheck = 0;
      this._widgetObserver = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastCheck < 500) return; // 500ms — widget reinject is not time-critical
        lastCheck = now;

        const membersWrap = this._getMembersWrap();
        const widgetEl = document.getElementById(WIDGET_ID);

        if (membersWrap && !widgetEl) {
          // Members visible but widget gone — reinject after short delay
          clearTimeout(this._widgetReinjectTimeout);
          this._widgetReinjectTimeout = setTimeout(() => {
            try { this.injectWidget(); } catch (err) {
              this.debugError("Widget", "Reinject failed", err);
            }
          }, WIDGET_REINJECT_DELAY_MS);
        } else if (!membersWrap && widgetEl) {
          // Members gone but widget still in DOM — clean up
          this.removeWidget();
        }
      });

      this._widgetObserver.observe(layoutContainer, { childList: true, subtree: true });
      this.debugLog("Widget", `MutationObserver attached to ${layoutContainer === appMount ? "app-mount (fallback)" : "layout container"}`);
    } catch (err) {
      this.debugError("Widget", "Failed to setup observer", err);
    }
  }

  // ── Panel ───────────────────────────────────────────────────────────────

  openPanel() {
    try {
      if (!this._components?.SensesPanel) {
        this.debugError?.('Panel', 'Components not initialized');
        return;
      }

      // Force-close any existing panel to prevent overlap
      if (this._panelReactRoot) {
        try { this._panelReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Panel pre-close unmount error', _); }
        this._panelReactRoot = null;
      }

      // Toggle if already open
      if (this._panelOpen) {
        this.closePanel();
        return;
      }

      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        this.debugError("Panel", "createRoot not available");
        return;
      }

      const container = document.createElement("div");
      container.id = PANEL_CONTAINER_ID;
      container.style.display = "contents";
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(BdApi.React.createElement(this._components.SensesPanel, {
        onClose: () => this.closePanel(),
      }));

      this._panelReactRoot = root;
      this._panelOpen = true;
      this.debugLog("Panel", "Opened");
    } catch (err) {
      this.debugError("Panel", "Failed to open panel", err);
    }
  }

  closePanel() {
    try {
      if (this._panelReactRoot) {
        try { this._panelReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Panel unmount error', _); }
        this._panelReactRoot = null;
      }
      const container = document.getElementById(PANEL_CONTAINER_ID);
      if (container) container.remove();
      this._panelOpen = false;
      this.debugLog("Panel", "Closed");
    } catch (err) {
      this.debugError("Panel", "Failed to close panel", err);
    }
  }

  // ── Shadow Picker ───────────────────────────────────────────────────────

  openShadowPicker(targetUser) {
    try {
      if (!this._components?.ShadowPicker) {
        this.debugError?.('Picker', 'Components not initialized');
        return;
      }

      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        this.debugError("Picker", "createRoot not available");
        return;
      }

      // Close existing picker if open
      if (this._pickerReactRoot) {
        try { this._pickerReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Picker unmount error in openShadowPicker()', _); }
        this._pickerReactRoot = null;
      }
      const existingPicker = document.getElementById("shadow-senses-picker-root");
      if (existingPicker) existingPicker.remove();

      const container = document.createElement("div");
      container.id = "shadow-senses-picker-root";
      container.style.display = "contents";
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(BdApi.React.createElement(this._components.ShadowPicker, {
        targetUser,
        onSelect: async (shadow) => {
          try {
            const success = await this.deploymentManager.deploy(shadow, targetUser);
            if (success) {
              const targetName = targetUser.globalName || targetUser.username || "User";
              BdApi.UI.showToast(
                `Deployed ${shadow.roleName || shadow.role || "Shadow"} [${shadow.rank || "E"}] to monitor ${targetName}`,
                { type: "success" }
              );
              this._widgetDirty = true;
            } else {
              BdApi.UI.showToast("Shadow already deployed or target already monitored", { type: "warning" });
            }
          } catch (err) {
            this.debugError("Picker", "Deploy failed", err);
            BdApi.UI.showToast("Failed to deploy shadow", { type: "error" });
          }
          // Close picker after selection
          this._closePicker();
        },
        onClose: () => this._closePicker(),
      }));

      this._pickerReactRoot = root;
      this._pickerOpen = true;
      this.debugLog("Picker", "Opened for user", targetUser?.username);
    } catch (err) {
      this.debugError("Picker", "Failed to open picker", err);
    }
  }

  _closePicker() {
    try {
      if (this._pickerReactRoot) {
        try { this._pickerReactRoot.unmount(); } catch (_) { this.debugLog?.('CLEANUP', 'Picker unmount error in _closePicker()', _); }
        this._pickerReactRoot = null;
      }
      const container = document.getElementById("shadow-senses-picker-root");
      if (container) container.remove();
      this._pickerOpen = false;
      this.debugLog("Picker", "Closed");
    } catch (err) {
      this.debugError("Picker", "Failed to close picker", err);
    }
  }

  // ── ESC Handler ─────────────────────────────────────────────────────────

  registerEscHandler() {
    try {
      this._escHandler = (e) => {
        if (e.key !== "Escape") return;
        // Close picker first (higher z-index), then panel
        if (this._pickerOpen) {
          this._closePicker();
          e.stopPropagation();
        } else if (this._panelOpen) {
          this.closePanel();
          e.stopPropagation();
        }
      };
      document.addEventListener("keydown", this._escHandler);
      this.debugLog("ESC", "Handler registered");
    } catch (err) {
      this.debugError("ESC", "Failed to register ESC handler", err);
    }
  }

  // ── Context Menu ────────────────────────────────────────────────────────

  patchContextMenu() {
    try {
      this._unpatchContextMenu = BdApi.ContextMenu.patch("user-context", (tree, props) => {
        // No outer try-catch — let menu construction errors propagate visibly
        if (!props || !props.user) return;
        const user = props.user;
        const userId = user.id;

        const deployment = this.deploymentManager.getDeploymentForUser(userId);

        let menuItem;
        if (deployment) {
          // Already monitored — show recall option
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: "Recall",
            action: () => {
              try {
                this.deploymentManager.recall(deployment.shadowId);
                BdApi.UI.showToast(
                  `Recalled ${deployment.shadowName} from ${deployment.targetUsername}`,
                  { type: "info" }
                );
                this._widgetDirty = true;
              } catch (err) {
                this.debugError("ContextMenu", "Recall failed", err);
              }
            },
          });
        } else {
          // Not monitored — auto-deploy weakest available shadow
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: "Deploy Shadow",
            action: async () => {
              // Try-catch only around risky async shadow loading
              let available;
              try {
                available = this.deploymentManager
                  ? await this.deploymentManager.getAvailableShadows()
                  : [];
              } catch (err) {
                this.debugError("ContextMenu", "Failed to load available shadows", err);
                BdApi.UI.showToast("Failed to load shadows", { type: "error" });
                return;
              }

              try {
                if (available.length === 0) {
                  BdApi.UI.showToast("No available shadows. All are deployed, in dungeons, or marked for exchange.", { type: "warning" });
                  return;
                }
                // Sort weakest first (ascending rank index)
                const sorted = [...available].sort((a, b) => {
                  const aIdx = RANKS.indexOf(a.rank || "E");
                  const bIdx = RANKS.indexOf(b.rank || "E");
                  return aIdx - bIdx;
                });
                const weakest = sorted[0];
                const success = await this.deploymentManager.deploy(weakest, user);
                if (success) {
                  const targetName = user.globalName || user.username || "User";
                  BdApi.UI.showToast(
                    `Deployed ${weakest.roleName || weakest.role || "Shadow"} [${weakest.rank || "E"}] to monitor ${targetName}`,
                    { type: "success" }
                  );
                  this._widgetDirty = true;
                } else {
                  BdApi.UI.showToast("Shadow already deployed or target already monitored", { type: "warning" });
                }
              } catch (err) {
                this.debugError("ContextMenu", "Auto-deploy failed", err);
                BdApi.UI.showToast("Failed to deploy shadow", { type: "error" });
              }
            },
          });
        }

        const separator = BdApi.ContextMenu.buildItem({ type: "separator" });

        // Append to children
        if (tree && tree.props && tree.props.children) {
          if (Array.isArray(tree.props.children)) {
            tree.props.children.push(separator, menuItem);
          }
        }
      });
      this.debugLog("ContextMenu", "Patched user-context menu");
    } catch (err) {
      this.debugError("ContextMenu", "Failed to patch context menu", err);
    }
  }

  getSettingsPanel() {
    const React = BdApi.React;
    const ce = React.createElement;

    const deployCount = this.deploymentManager?.getDeploymentCount() || 0;
    const sessionCount = this.sensesEngine?.getSessionMessageCount() || 0;
    const totalDetections = this.sensesEngine?.getTotalDetections() || 0;

    const statCardStyle = {
      background: "rgba(138, 43, 226, 0.1)",
      border: "1px solid rgba(138, 43, 226, 0.3)",
      borderRadius: "8px",
      padding: "12px",
      textAlign: "center",
    };

    return ce("div", { style: { padding: "16px", background: "#1e1e2e", borderRadius: "8px", color: "#ccc" } },
      // Statistics header
      ce("h3", { style: { color: "#8a2be2", marginTop: 0, marginBottom: "12px" } }, "Shadow Senses Statistics"),

      // Stat cards grid
      ce("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" } },
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, deployCount),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Deployed")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, sessionCount),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Detections (since restart)")
        ),
        ce("div", { style: statCardStyle },
          ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, totalDetections.toLocaleString()),
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Total Detections")
        )
      ),

      // Debug toggle
      ce("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        ce("span", { style: { color: "#999", fontSize: "13px" } }, "Debug Mode"),
        ce("input", {
          type: "checkbox",
          checked: this._debugMode,
          onChange: (e) => {
            this._debugMode = e.target.checked;
            BdApi.Data.save(PLUGIN_NAME, "debugMode", this._debugMode);
          },
          style: { accentColor: "#8a2be2" },
        })
      )
    );
  }
};
