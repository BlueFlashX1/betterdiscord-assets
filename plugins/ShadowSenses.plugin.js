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

const RANKS = ["E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+", "NH", "Monarch", "Monarch+", "Shadow Monarch"];
const RANK_COLORS = {
  E: "#9ca3af", D: "#60a5fa", C: "#34d399", B: "#a78bfa",
  A: "#f59e0b", S: "#ef4444", SS: "#ec4899", SSS: "#8b5cf6",
  "SSS+": "#c084fc", NH: "#14b8a6", Monarch: "#fbbf24",
  "Monarch+": "#f97316", "Shadow Monarch": "#8a2be2",
};

const GUILD_FEED_CAP = 5000;

// ─── DeploymentManager ─────────────────────────────────────────────────────

class DeploymentManager {
  constructor(debugLog, debugError) {
    this._debugLog = debugLog;
    this._debugError = debugError;
    this._deployments = [];
    this._monitoredUserIds = new Set();
    this._deployedShadowIds = new Set();
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

  deploy(shadow, targetUser) {
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
    this._save();
    this._debugLog("DeploymentManager", "Deployed shadow", record);
    return true;
  }

  recall(shadowId) {
    const idx = this._deployments.findIndex(d => d.shadowId === shadowId);
    if (idx === -1) return false;

    this._deployments.splice(idx, 1);
    this._rebuildSets();
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

  getMonitoredUserIds() {
    return this._monitoredUserIds;
  }

  async getAvailableShadows() {
    try {
      const armyPlugin = BdApi.Plugins.get("ShadowArmy");
      if (!armyPlugin || !armyPlugin.instance) {
        this._debugError("DeploymentManager", "ShadowArmy plugin not available");
        return [];
      }

      const allShadows = await armyPlugin.instance.getAllShadows();
      if (!Array.isArray(allShadows)) return [];

      // Get IDs to exclude: already deployed + exchange-marked + dungeon-allocated
      const deployedIds = this._deployedShadowIds;
      let exchangeMarkedIds = new Set();
      let dungeonAllocatedIds = new Set();

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
        if (dungeonsPlugin && dungeonsPlugin.instance && dungeonsPlugin.instance.shadowAllocations) {
          for (const shadows of dungeonsPlugin.instance.shadowAllocations.values()) {
            if (Array.isArray(shadows)) {
              for (const s of shadows) {
                if (s && s.id) dungeonAllocatedIds.add(s.id);
              }
            }
          }
        }
      } catch (dErr) {
        this._debugLog("DeploymentManager", "Dungeons not available for exclusion", dErr);
      }

      const available = allShadows.filter(s => {
        if (!s || !s.id) return false;
        if (deployedIds.has(s.id)) return false;
        if (exchangeMarkedIds.has(s.id)) return false;
        if (dungeonAllocatedIds.has(s.id)) return false;
        return true;
      });

      this._debugLog("DeploymentManager", "Available shadows", {
        total: allShadows.length,
        available: available.length,
        deployed: deployedIds.size,
        exchangeMarked: exchangeMarkedIds.size,
        dungeonAllocated: dungeonAllocatedIds.size,
      });

      return available;
    } catch (err) {
      this._debugError("DeploymentManager", "Failed to get available shadows", err);
      return [];
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
    this._flushInterval = null;
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;

    // Load persisted data
    this._guildFeeds = BdApi.Data.load(PLUGIN_NAME, "guildFeeds") || {};
    this._totalDetections = BdApi.Data.load(PLUGIN_NAME, "totalDetections") || 0;

    // Count existing entries for lastSeenCount (mark all persisted as "seen")
    for (const guildId of Object.keys(this._guildFeeds)) {
      this._lastSeenCount[guildId] = this._guildFeeds[guildId].length;
    }

    this._plugin.debugLog("SensesEngine", "Loaded persisted feeds", {
      guilds: Object.keys(this._guildFeeds).length,
      totalEntries: Object.values(this._guildFeeds).reduce((sum, f) => sum + f.length, 0),
    });
  }

  subscribe() {
    const Dispatcher = this._plugin._Dispatcher;
    if (!Dispatcher) {
      this._plugin.debugError("SensesEngine", "Dispatcher not available, cannot subscribe");
      return;
    }

    // Store current guild
    try {
      this._currentGuildId = this._plugin._SelectedGuildStore
        ? this._plugin._SelectedGuildStore.getGuildId()
        : null;
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Failed to get initial guild ID", err);
    }

    // Mark current guild as seen
    if (this._currentGuildId && this._guildFeeds[this._currentGuildId]) {
      this._lastSeenCount[this._currentGuildId] = this._guildFeeds[this._currentGuildId].length;
    }

    this._handleMessageCreate = this._onMessageCreate.bind(this);
    this._handleChannelSelect = this._onChannelSelect.bind(this);

    Dispatcher.subscribe("MESSAGE_CREATE", this._handleMessageCreate);
    Dispatcher.subscribe("CHANNEL_SELECT", this._handleChannelSelect);

    // Start debounced flush interval (30s)
    this._flushInterval = setInterval(() => {
      if (!this._dirty) return;
      this._flushToDisk();
    }, 30000);

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

    // Stop flush interval and do final flush
    if (this._flushInterval) {
      clearInterval(this._flushInterval);
      this._flushInterval = null;
    }
    if (this._dirty) {
      this._flushToDisk();
    }

    this._plugin.debugLog("SensesEngine", "Unsubscribed from all events");
  }

  _flushToDisk() {
    try {
      BdApi.Data.save(PLUGIN_NAME, "guildFeeds", this._guildFeeds);
      BdApi.Data.save(PLUGIN_NAME, "totalDetections", this._totalDetections);
      this._dirty = false;
      this._plugin.debugLog("SensesEngine", "Flushed to disk", {
        guilds: Object.keys(this._guildFeeds).length,
        totalDetections: this._totalDetections,
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
    if (this._guildFeeds[guildId].length > GUILD_FEED_CAP) {
      this._guildFeeds[guildId].shift();
    }
    this._dirty = true;
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

      // Resolve channel
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

      // Build feed entry
      const entry = {
        messageId: message.id,
        authorId,
        authorName: message.author.username || message.author.global_name || "Unknown",
        channelId: message.channel_id,
        channelName,
        guildId,
        content: (message.content || "").slice(0, 200),
        timestamp: Date.now(),
        shadowName: deployment.shadowName,
        shadowRank: deployment.shadowRank,
      };

      // Add to the guild's feed (always, regardless of current guild)
      this._addToGuildFeed(guildId, entry);

      // Toast if this is the current guild
      if (guildId === this._currentGuildId) {
        BdApi.UI.showToast(
          `[${entry.shadowRank}] ${entry.shadowName} sensed ${entry.authorName} in #${entry.channelName}`,
          { type: "info" }
        );
        // Keep lastSeenCount in sync for the active guild
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

          BdApi.UI.showToast(
            `Shadow Senses: ${unseenCount} message${unseenCount > 1 ? "s" : ""} from ${shadowNames.size} shadow${shadowNames.size > 1 ? "s" : ""} while away`,
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

  getActiveFeed() {
    if (!this._currentGuildId) return [];
    return [...(this._guildFeeds[this._currentGuildId] || [])];
  }

  getSessionMessageCount() {
    return this._sessionMessageCount;
  }

  getTotalDetections() {
    return this._totalDetections;
  }

  clear() {
    this._guildFeeds = {};
    this._lastSeenCount = {};
    this._currentGuildId = null;
    this._sessionMessageCount = 0;
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;
    this._dirty = false;
    if (this._flushInterval) {
      clearInterval(this._flushInterval);
      this._flushInterval = null;
    }
  }
}

// ─── CSS ───────────────────────────────────────────────────────────────────

function buildCSS() {
  return `
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
      const poll = setInterval(() => {
        try {
          const current = pluginRef.sensesEngine
            ? pluginRef.sensesEngine.getActiveFeed()
            : [];
          setFeed(current);
        } catch (_) {}
      }, 2000);
      // Initial load
      try {
        setFeed(pluginRef.sensesEngine ? pluginRef.sensesEngine.getActiveFeed() : []);
      } catch (_) {}
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
      } catch (_) {}
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
      try {
        if (pluginRef._NavigationUtils && entry.guildId && entry.channelId) {
          const path = entry.messageId
            ? `/channels/${entry.guildId}/${entry.channelId}/${entry.messageId}`
            : `/channels/${entry.guildId}/${entry.channelId}`;
          pluginRef._NavigationUtils.transitionTo(path);
        }
      } catch (err) {
        pluginRef.debugError("SensesPanel", "Navigate failed:", err);
      }
      onClose();
    }, [onClose]);

    const handleDeployNew = useCallback(() => {
      BdApi.UI.showToast("Right-click a user to deploy a shadow", { type: "info" });
    }, []);

    const deployCount = pluginRef.deploymentManager
      ? pluginRef.deploymentManager.getDeployments().length
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
          ce("span", null, `${msgCount} message${msgCount !== 1 ? "s" : ""} this session`)
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
      ? pluginRef.deploymentManager.getDeployments().length
      : 0;
    const feedCount = pluginRef.sensesEngine
      ? pluginRef.sensesEngine.getActiveFeed().length
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

// ─── Plugin Class ──────────────────────────────────────────────────────────

module.exports = class ShadowSenses {
  start() {
    this._debugMode = BdApi.Data.load(PLUGIN_NAME, "debugMode") ?? false;
    this._widgetDirty = true;
    this._panelOpen = false;
    this._pickerOpen = false;

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
    this.sensesEngine.subscribe();

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

    BdApi.UI.showToast(`${PLUGIN_NAME} v1.0.0 \u2014 Shadow deployment online`, { type: "info" });
  }

  stop() {
    try {
      // 1. Unsubscribe Dispatcher + final flush (persists feeds to disk)
      if (this.sensesEngine) {
        this.sensesEngine.unsubscribe();
        this.sensesEngine = null;
      }

      // 2. Unpatch context menu
      if (this._unpatchContextMenu) {
        try { this._unpatchContextMenu(); } catch (_) {}
        this._unpatchContextMenu = null;
      }

      // 3. Close panel + picker
      this.closePanel();
      if (this._pickerReactRoot) {
        try { this._pickerReactRoot.unmount(); } catch (_) {}
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
      this.removeWidget();

      // 5. ESC handler
      if (this._escHandler) {
        document.removeEventListener("keydown", this._escHandler);
        this._escHandler = null;
      }

      // 6. CSS
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
    // Use getByKeys("actionLogger") per BetterDiscord docs for FluxDispatcher
    this._Dispatcher = Webpack.getByKeys("actionLogger") || Webpack.getModule(m => m?.subscribe && m?.dispatch && m?.unsubscribe);
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._NavigationUtils = Webpack.getModule(m => m?.transitionTo && m?.back && m?.forward);
    this.debugLog("Webpack", "Modules acquired", {
      Dispatcher: !!this._Dispatcher,
      ChannelStore: !!this._ChannelStore,
      SelectedGuildStore: !!this._SelectedGuildStore,
      NavigationUtils: !!this._NavigationUtils,
    });
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
    try {
      if (BdApi.ReactDOM && BdApi.ReactDOM.createRoot) return BdApi.ReactDOM.createRoot;
      const mod = BdApi.Webpack.getModule(m => m?.createRoot && m?.hydrateRoot);
      if (mod && mod.createRoot) return mod.createRoot;
    } catch (err) {
      this.debugError("Widget", "Failed to get createRoot", err);
    }
    return null;
  }

  injectWidget() {
    try {
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
        try { this._widgetReactRoot.unmount(); } catch (_) {}
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

      let lastCheck = 0;
      this._widgetObserver = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastCheck < 200) return;
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
          }, 300);
        } else if (!membersWrap && widgetEl) {
          // Members gone but widget still in DOM — clean up
          this.removeWidget();
        }
      });

      this._widgetObserver.observe(appMount, { childList: true, subtree: true });
      this.debugLog("Widget", "MutationObserver attached to app-mount");
    } catch (err) {
      this.debugError("Widget", "Failed to setup observer", err);
    }
  }

  // ── Panel ───────────────────────────────────────────────────────────────

  openPanel() {
    try {
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
        try { this._panelReactRoot.unmount(); } catch (_) {}
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
      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        this.debugError("Picker", "createRoot not available");
        return;
      }

      // Close existing picker if open
      if (this._pickerReactRoot) {
        try { this._pickerReactRoot.unmount(); } catch (_) {}
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
        onSelect: (shadow) => {
          try {
            const success = this.deploymentManager.deploy(shadow, targetUser);
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
        try { this._pickerReactRoot.unmount(); } catch (_) {}
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
        try {
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
                try {
                  const available = this.deploymentManager
                    ? await this.deploymentManager.getAvailableShadows()
                    : [];
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
                  const success = this.deploymentManager.deploy(weakest, user);
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
        } catch (err) {
          this.debugError("ContextMenu", "Error in patch callback", err);
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

    const deployCount = this.deploymentManager?.getDeployments()?.length || 0;
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
          ce("div", { style: { color: "#999", fontSize: "11px" } }, "Session Detections")
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
