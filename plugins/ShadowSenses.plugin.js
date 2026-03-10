/**
 * @name ShadowSenses
 * @description Deploy shadow soldiers to monitor Discord users — get notified when they speak, even while invisible. Solo Leveling themed.
 * @version 1.1.5
 * @author matthewthompson
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/ShadowSenses/constants.js
var require_constants = __commonJS({
  "src/ShadowSenses/constants.js"(exports2, module2) {
    var PLUGIN_NAME2 = "ShadowSenses";
    var PLUGIN_VERSION2 = "1.1.5";
    var STYLE_ID = "shadow-senses-css";
    var WIDGET_ID = "shadow-senses-widget";
    var WIDGET_SPACER_ID2 = "shadow-senses-widget-spacer";
    var PANEL_CONTAINER_ID = "shadow-senses-panel-root";
    var TRANSITION_ID2 = "shadow-senses-transition-overlay";
    var GLOBAL_UTILITY_FEED_ID = "__shadow_senses_global__";
    var _a;
    var RANKS = ((_a = window.SoloLevelingUtils) == null ? void 0 : _a.RANKS) || ["E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+", "NH", "Monarch", "Monarch+", "Shadow Monarch"];
    var RANK_COLORS = {
      E: "#9ca3af",
      D: "#60a5fa",
      C: "#34d399",
      B: "#a78bfa",
      A: "#f59e0b",
      S: "#ef4444",
      SS: "#ec4899",
      SSS: "#8b5cf6",
      "SSS+": "#c084fc",
      NH: "#14b8a6",
      Monarch: "#fbbf24",
      "Monarch+": "#f97316",
      "Shadow Monarch": "#8a2be2"
    };
    var GUILD_FEED_CAP = 5e3;
    var GLOBAL_FEED_CAP = 25e3;
    var FEED_MAX_AGE_MS = 1 * 24 * 60 * 60 * 1e3;
    var PURGE_INTERVAL_MS2 = 10 * 60 * 1e3;
    var WIDGET_OBSERVER_DEBOUNCE_MS = 200;
    var WIDGET_REINJECT_DELAY_MS = 300;
    var STARTUP_TOAST_GRACE_MS = 5e3;
    var DEFAULT_TYPING_ALERT_COOLDOWN_MS = 15e3;
    var BURST_WINDOW_MS = 1e4;
    var PRIORITY = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    var PRIORITY_LABELS = { 1: null, 2: "P2", 3: "P3", 4: "P4!" };
    var PRIORITY_COLORS = {
      1: null,
      2: "rgba(96, 165, 250, 0.3)",
      3: "rgba(251, 191, 36, 0.35)",
      4: "rgba(239, 68, 68, 0.4)"
    };
    var KEYWORD_MATCH_COLOR = "rgba(52, 211, 153, 0.35)";
    var NAME_MENTION_COLOR = "rgba(236, 72, 153, 0.4)";
    var ONLINE_STATUSES = /* @__PURE__ */ new Set(["online", "idle", "dnd"]);
    var PRESENCE_EVENT_NAMES2 = ["PRESENCE_UPDATES", "PRESENCE_UPDATE"];
    var RELATIONSHIP_EVENT_NAMES2 = ["FRIEND_REQUEST_ACCEPTED", "RELATIONSHIP_ADD", "RELATIONSHIP_UPDATE", "RELATIONSHIP_REMOVE"];
    var STATUS_LABELS = {
      online: "Online",
      idle: "Idle",
      dnd: "Do Not Disturb",
      offline: "Offline",
      invisible: "Invisible"
    };
    var STATUS_ACCENT_COLORS = {
      online: "#22c55e",
      idle: "#f59e0b",
      dnd: "#ef4444",
      offline: "#9ca3af",
      invisible: "#9ca3af"
    };
    var STATUS_TOAST_TIMEOUT_MS = 5200;
    var DEFAULT_SETTINGS2 = {
      animationEnabled: true,
      respectReducedMotion: false,
      animationDuration: 550,
      statusAlerts: true,
      typingAlerts: true,
      removedFriendAlerts: true,
      showMarkedOnlineCount: true,
      typingAlertCooldownMs: DEFAULT_TYPING_ALERT_COOLDOWN_MS,
      groupHighPriorityBursts: false,
      priorityKeywords: [],
      mentionNames: []
    };
    module2.exports = {
      BURST_WINDOW_MS,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS2,
      DEFAULT_TYPING_ALERT_COOLDOWN_MS,
      FEED_MAX_AGE_MS,
      GLOBAL_FEED_CAP,
      GLOBAL_UTILITY_FEED_ID,
      GUILD_FEED_CAP,
      KEYWORD_MATCH_COLOR,
      NAME_MENTION_COLOR,
      ONLINE_STATUSES,
      PANEL_CONTAINER_ID,
      PLUGIN_NAME: PLUGIN_NAME2,
      PLUGIN_VERSION: PLUGIN_VERSION2,
      PRESENCE_EVENT_NAMES: PRESENCE_EVENT_NAMES2,
      PRIORITY,
      PRIORITY_COLORS,
      PRIORITY_LABELS,
      PURGE_INTERVAL_MS: PURGE_INTERVAL_MS2,
      RANK_COLORS,
      RANKS,
      RELATIONSHIP_EVENT_NAMES: RELATIONSHIP_EVENT_NAMES2,
      STARTUP_TOAST_GRACE_MS,
      STATUS_ACCENT_COLORS,
      STATUS_LABELS,
      STATUS_TOAST_TIMEOUT_MS,
      STYLE_ID,
      TRANSITION_ID: TRANSITION_ID2,
      WIDGET_ID,
      WIDGET_OBSERVER_DEBOUNCE_MS,
      WIDGET_REINJECT_DELAY_MS,
      WIDGET_SPACER_ID: WIDGET_SPACER_ID2
    };
  }
});

// src/shared/bd-module-loader.js
var require_bd_module_loader = __commonJS({
  "src/shared/bd-module-loader.js"(exports2, module2) {
    function loadBdModuleFromPlugins(fileName) {
      if (!fileName) return null;
      try {
        const fs = require("fs");
        const path = require("path");
        const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), "utf8");
        const moduleObj = { exports: {} };
        const factory = new Function(
          "module",
          "exports",
          "require",
          "BdApi",
          `${source}
return module.exports || exports || null;`
        );
        const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
        const candidate = loaded || moduleObj.exports;
        if (typeof candidate === "function") return candidate;
        if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) {
          return candidate;
        }
      } catch (_) {
      }
      return null;
    }
    module2.exports = {
      loadBdModuleFromPlugins
    };
  }
});

// src/ShadowSenses/shared-utils.js
var require_shared_utils = __commonJS({
  "src/ShadowSenses/shared-utils.js"(exports2, module2) {
    var { loadBdModuleFromPlugins } = require_bd_module_loader();
    var _bdLoad = loadBdModuleFromPlugins;
    var _ReactUtils;
    try {
      _ReactUtils = _bdLoad("BetterDiscordReactUtils.js");
    } catch (_) {
      _ReactUtils = null;
    }
    var _PluginUtils;
    try {
      _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js");
    } catch (_) {
      _PluginUtils = null;
    }
    var _TransitionCleanupUtils2;
    try {
      _TransitionCleanupUtils2 = _bdLoad("TransitionCleanupUtils.js");
    } catch (_) {
      _TransitionCleanupUtils2 = null;
    }
    var _ttl = (_PluginUtils == null ? void 0 : _PluginUtils.createTTLCache) || ((ms) => {
      let v;
      let t = 0;
      return {
        get: () => Date.now() - t < ms ? v : null,
        set: (x) => {
          v = x;
          t = Date.now();
        },
        invalidate: () => {
          v = null;
          t = 0;
        }
      };
    });
    module2.exports = {
      _bdLoad,
      _PluginUtils,
      _ReactUtils,
      _TransitionCleanupUtils: _TransitionCleanupUtils2,
      _ttl
    };
  }
});

// src/ShadowSenses/deployment-manager.js
var require_deployment_manager = __commonJS({
  "src/ShadowSenses/deployment-manager.js"(exports2, module2) {
    var { PLUGIN_NAME: PLUGIN_NAME2, RANKS } = require_constants();
    var { _ttl } = require_shared_utils();
    var DeploymentManager2 = class {
      constructor(debugLog, debugError) {
        this._debugLog = debugLog;
        this._debugError = debugError;
        this._deployments = [];
        this._monitoredUserIds = /* @__PURE__ */ new Set();
        this._deployedShadowIds = /* @__PURE__ */ new Set();
        this._availableCache = _ttl(5e3);
      }
      load() {
        try {
          const saved = BdApi.Data.load(PLUGIN_NAME2, "deployments");
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
          BdApi.Data.save(PLUGIN_NAME2, "deployments", this._deployments);
        } catch (err) {
          this._debugError("DeploymentManager", "Failed to save deployments", err);
        }
      }
      _rebuildSets() {
        this._monitoredUserIds = new Set(this._deployments.map((d) => d.targetUserId));
        this._deployedShadowIds = new Set(this._deployments.map((d) => d.shadowId));
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
        try {
          const currentAvailable = await this.getAvailableShadows();
          const stillAvailable = currentAvailable.find((s) => s.id === shadow.id);
          if (!stillAvailable) {
            this._debugLog("DeploymentManager", `Shadow ${shadow.id} no longer available, aborting deployment`);
            return false;
          }
        } catch (err) {
          this._debugError("DeploymentManager", "Failed to re-verify shadow availability", err);
        }
        const record = {
          shadowId: shadow.id,
          shadowName: shadow.roleName || shadow.role || "Shadow",
          shadowRank: shadow.rank || "E",
          targetUserId,
          targetUsername: targetUser.username || targetUser.globalName || "Unknown",
          deployedAt: Date.now()
        };
        this._deployments.push(record);
        this._rebuildSets();
        this._availableCache.invalidate();
        this._save();
        this._debugLog("DeploymentManager", "Deployed shadow", record);
        return true;
      }
      recall(shadowId) {
        const idx = this._deployments.findIndex((d) => d.shadowId === shadowId);
        if (idx === -1) return false;
        this._deployments.splice(idx, 1);
        this._rebuildSets();
        this._availableCache.invalidate();
        this._save();
        this._debugLog("DeploymentManager", "Recalled shadow", shadowId);
        return true;
      }
      getDeploymentForUser(userId) {
        return this._deployments.find((d) => d.targetUserId === userId) || null;
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
      _getShadowArmyInstance() {
        if (!BdApi.Plugins.isEnabled("ShadowArmy")) {
          this._debugError("DeploymentManager", "ShadowArmy plugin not enabled");
          return null;
        }
        const armyPlugin = BdApi.Plugins.get("ShadowArmy");
        if (!(armyPlugin == null ? void 0 : armyPlugin.instance)) {
          this._debugError("DeploymentManager", "ShadowArmy plugin not available");
          return null;
        }
        return armyPlugin.instance;
      }
      _getExchangeMarkedIds() {
        var _a;
        try {
          if (!BdApi.Plugins.isEnabled("ShadowExchange")) return /* @__PURE__ */ new Set();
          const exchangePlugin = BdApi.Plugins.get("ShadowExchange");
          if (typeof ((_a = exchangePlugin == null ? void 0 : exchangePlugin.instance) == null ? void 0 : _a.getMarkedShadowIds) !== "function") return /* @__PURE__ */ new Set();
          return exchangePlugin.instance.getMarkedShadowIds();
        } catch (err) {
          this._debugLog("DeploymentManager", "ShadowExchange not available for exclusion", err);
          return /* @__PURE__ */ new Set();
        }
      }
      _extractShadowId(shadow) {
        var _a;
        return (shadow == null ? void 0 : shadow.id) || ((_a = shadow == null ? void 0 : shadow.extractedData) == null ? void 0 : _a.id) || null;
      }
      _collectShadowIds(source, targetSet) {
        if (!Array.isArray(source)) return;
        for (const shadow of source) {
          const shadowId = this._extractShadowId(shadow);
          if (shadowId) targetSet.add(shadowId);
        }
      }
      _collectAllocatedShadowIds(allocationMap, targetSet) {
        if (!(allocationMap instanceof Map)) return;
        for (const shadows of allocationMap.values()) {
          this._collectShadowIds(shadows, targetSet);
        }
      }
      _getDungeonsSnapshot() {
        const snapshot = {
          dungeonAllocatedIds: /* @__PURE__ */ new Set(),
          reserveIds: /* @__PURE__ */ new Set()
        };
        try {
          if (!BdApi.Plugins.isEnabled("Dungeons")) return snapshot;
          const dungeonsPlugin = BdApi.Plugins.get("Dungeons");
          const instance = dungeonsPlugin == null ? void 0 : dungeonsPlugin.instance;
          if (!instance) return snapshot;
          this._collectShadowIds(instance.shadowReserve, snapshot.reserveIds);
          this._collectAllocatedShadowIds(instance.shadowAllocations, snapshot.dungeonAllocatedIds);
        } catch (err) {
          this._debugLog("DeploymentManager", "Dungeons not available for exclusion", err);
        }
        return snapshot;
      }
      _buildAvailableShadowList(allShadows, exclusion) {
        return allShadows.filter((shadow) => {
          const sid = shadow == null ? void 0 : shadow.id;
          if (!sid) return false;
          if (exclusion.deployedIds.has(sid)) return false;
          if (exclusion.exchangeMarkedIds.has(sid)) return false;
          if (exclusion.reserveIds.has(sid)) return true;
          if (exclusion.dungeonAllocatedIds.has(sid)) return false;
          return true;
        });
      }
      _injectDungeonFallbackShadow(available, allShadows, exclusion) {
        if (available.length > 0 || exclusion.dungeonAllocatedIds.size === 0) return;
        const fallback = allShadows.filter((shadow) => {
          const sid = shadow == null ? void 0 : shadow.id;
          if (!sid) return false;
          if (!exclusion.dungeonAllocatedIds.has(sid)) return false;
          if (exclusion.deployedIds.has(sid)) return false;
          if (exclusion.exchangeMarkedIds.has(sid)) return false;
          return true;
        }).sort((a, b) => RANKS.indexOf(a.rank || "E") - RANKS.indexOf(b.rank || "E"))[0];
        if (fallback) available.push(fallback);
      }
      async getAvailableShadows() {
        var _a;
        const cached = this._availableCache.get();
        if (cached) return cached;
        try {
          const armyInstance = this._getShadowArmyInstance();
          if (!armyInstance) return [];
          const allShadows = ((_a = armyInstance.getShadowSnapshot) == null ? void 0 : _a.call(armyInstance)) || await armyInstance.getAllShadows();
          if (!Array.isArray(allShadows)) return [];
          const dungeons = this._getDungeonsSnapshot();
          const exclusion = {
            deployedIds: this._deployedShadowIds,
            exchangeMarkedIds: this._getExchangeMarkedIds(),
            dungeonAllocatedIds: dungeons.dungeonAllocatedIds,
            reserveIds: dungeons.reserveIds
          };
          const available = this._buildAvailableShadowList(allShadows, exclusion);
          this._injectDungeonFallbackShadow(available, allShadows, exclusion);
          this._debugLog("DeploymentManager", "Available shadows", {
            total: allShadows.length,
            available: available.length,
            deployed: exclusion.deployedIds.size,
            exchangeMarked: exclusion.exchangeMarkedIds.size,
            dungeonAllocated: exclusion.dungeonAllocatedIds.size,
            reservePool: exclusion.reserveIds.size
          });
          this._availableCache.set(available);
          return available;
        } catch (err) {
          this._debugError("DeploymentManager", "Failed to get available shadows", err);
          return [];
        }
      }
    };
    module2.exports = { DeploymentManager: DeploymentManager2 };
  }
});

// src/ShadowSenses/components.js
var require_components = __commonJS({
  "src/ShadowSenses/components.js"(exports2, module2) {
    var {
      GLOBAL_UTILITY_FEED_ID,
      KEYWORD_MATCH_COLOR,
      NAME_MENTION_COLOR,
      PRIORITY_COLORS,
      PRIORITY_LABELS,
      RANK_COLORS
    } = require_constants();
    function buildComponents2(pluginRef) {
      const React = BdApi.React;
      const { useState, useEffect, useCallback, useRef, useReducer, useMemo } = React;
      const ce = React.createElement;
      const EVENT_LABELS = {
        status: "STATUS",
        typing: "TYPING",
        relationship: "CONNECTION"
      };
      function getEventLabel(eventType) {
        if (eventType === "message") return null;
        return EVENT_LABELS[eventType] || String(eventType || "event").toUpperCase();
      }
      function getBorderColor(matchReason, priority) {
        if (matchReason === "keyword") return KEYWORD_MATCH_COLOR;
        if (matchReason === "name") return NAME_MENTION_COLOR;
        return PRIORITY_COLORS[priority] || null;
      }
      function getPriorityBadge(priority) {
        const label = PRIORITY_LABELS[priority];
        if (!label) return null;
        if (priority >= 4) {
          return { label, color: "#ef4444", background: "rgba(239,68,68,0.15)" };
        }
        if (priority >= 3) {
          return { label, color: "#fbbf24", background: "rgba(251,191,36,0.15)" };
        }
        return { label, color: "#60a5fa", background: "rgba(96,165,250,0.15)" };
      }
      function getMatchBadge(entry, priority) {
        if (entry.matchReason === "keyword") {
          return {
            label: entry.matchedTerm ? `"${entry.matchedTerm}"` : "KW",
            color: "#34d399",
            background: "rgba(52,211,153,0.15)"
          };
        }
        if (entry.matchReason === "name") {
          return {
            label: entry.matchedTerm ? `"${entry.matchedTerm}"` : "NAME",
            color: "#ec4899",
            background: "rgba(236,72,153,0.15)"
          };
        }
        return getPriorityBadge(priority);
      }
      function renderTagBadge(badge) {
        if (!badge) return null;
        return ce(
          "span",
          {
            style: {
              color: badge.color,
              fontSize: badge.fontSize || "0.75em",
              fontWeight: badge.fontWeight || 700,
              padding: "1px 4px",
              borderRadius: "3px",
              background: badge.background
            }
          },
          badge.label
        );
      }
      function getBurstBadge(messageCount) {
        if (messageCount <= 1) return null;
        return {
          label: `${messageCount} msgs`,
          color: "#a78bfa",
          background: "rgba(167, 139, 250, 0.15)"
        };
      }
      function getContentText(entry, eventType) {
        if (eventType === "message") {
          return entry.content ? `\u201C${entry.content}\u201D` : "\u2014 no text content \u2014";
        }
        return entry.content || "\u2014 no details \u2014";
      }
      function getFirstContentBlock(entry, messageCount) {
        if (messageCount <= 1 || !entry.firstContent) return null;
        return ce(
          "div",
          {
            className: "shadow-senses-feed-content",
            style: { color: "#888", fontSize: "11px", marginTop: "2px", fontStyle: "italic" }
          },
          `First: \u201C${entry.firstContent}\u201D`
        );
      }
      function buildFeedCardHeaderNodes(entry, options) {
        const {
          rankColor,
          badge,
          burstBadge,
          eventLabel,
          timeStr
        } = options;
        const nodes = [
          ce("span", { style: { color: rankColor, fontWeight: 600 } }, `[${entry.shadowRank}] ${entry.shadowName}`),
          ce("span", { style: { color: "#666" } }, "\u2192"),
          ce("span", { style: { color: "#ccc" } }, entry.authorName)
        ];
        const matchBadgeNode = renderTagBadge(badge);
        if (matchBadgeNode) nodes.push(matchBadgeNode);
        if (burstBadge) nodes.push(renderTagBadge({ ...burstBadge, fontWeight: 600 }));
        if (eventLabel) {
          nodes.push(
            ce("span", { style: { color: "#fbbf24", fontSize: "0.8em", fontWeight: 700 } }, eventLabel)
          );
        }
        if (entry.guildName) {
          nodes.push(ce("span", { style: { color: "#a78bfa", fontSize: "0.85em" } }, entry.guildName));
        }
        if (entry.channelId) {
          nodes.push(ce("span", { style: { color: "#60a5fa" } }, `#${entry.channelName}`));
        }
        nodes.push(ce("span", { style: { color: "#666", marginLeft: "auto" } }, timeStr));
        return nodes;
      }
      function buildFeedCardStyle(isNavigable, borderColor) {
        return {
          cursor: isNavigable ? "pointer" : "default",
          borderLeft: borderColor ? `3px solid ${borderColor}` : void 0
        };
      }
      function createFeedCardClickHandler(isNavigable, onNavigate, entry) {
        if (!isNavigable || !onNavigate) return void 0;
        return () => onNavigate(entry);
      }
      function FeedCard({ entry, onNavigate }) {
        const time = new Date(entry.timestamp);
        const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
        const rankColor = RANK_COLORS[entry.shadowRank] || "#8a2be2";
        const eventType = entry.eventType || "message";
        const isNavigable = !!(entry.guildId && entry.channelId && entry.guildId !== GLOBAL_UTILITY_FEED_ID);
        const eventLabel = getEventLabel(eventType);
        const priority = entry.priority || 1;
        const msgCount = entry.messageCount || 1;
        const borderColor = getBorderColor(entry.matchReason || null, priority);
        const badge = getMatchBadge(entry, priority);
        const burstBadge = getBurstBadge(msgCount);
        const contentText = getContentText(entry, eventType);
        const firstContent = getFirstContentBlock(entry, msgCount);
        const headerNodes = buildFeedCardHeaderNodes(entry, {
          rankColor,
          badge,
          burstBadge,
          eventLabel,
          timeStr
        });
        return ce(
          "div",
          {
            className: "shadow-senses-feed-card",
            style: buildFeedCardStyle(isNavigable, borderColor),
            onClick: createFeedCardClickHandler(isNavigable, onNavigate, entry)
          },
          ce("div", { className: "shadow-senses-feed-card-header" }, ...headerNodes),
          ce("div", { className: "shadow-senses-feed-content" }, contentText),
          firstContent
        );
      }
      function DeploymentRow({ deployment, onRecall }) {
        const rankColor = RANK_COLORS[deployment.shadowRank] || "#8a2be2";
        return ce(
          "div",
          { className: "shadow-senses-deploy-row" },
          ce(
            "div",
            { className: "shadow-senses-deploy-info" },
            ce(
              "span",
              { className: "shadow-senses-deploy-rank", style: { color: rankColor } },
              `[${deployment.shadowRank}]`
            ),
            ce("span", null, deployment.shadowName),
            ce("span", { className: "shadow-senses-deploy-arrow" }, "\u2192"),
            ce("span", { className: "shadow-senses-deploy-target" }, deployment.targetUsername)
          ),
          ce("button", {
            className: "shadow-senses-recall-btn",
            onClick: () => onRecall && onRecall(deployment)
          }, "Recall")
        );
      }
      function FeedTab({ onNavigate }) {
        const [feed, setFeed] = useState([]);
        const scrollRef = useRef(null);
        const prevLenRef = useRef(0);
        useEffect(() => {
          var _a;
          let lastVersion = -1;
          const poll = setInterval(() => {
            var _a2;
            if (document.hidden) return;
            try {
              const engine = pluginRef.sensesEngine;
              if (!engine) return;
              const currentVersion = engine._feedVersion;
              if (currentVersion !== lastVersion) {
                lastVersion = currentVersion;
                setFeed(engine.getActiveFeed());
              }
            } catch (_) {
              (_a2 = pluginRef.debugLog) == null ? void 0 : _a2.call(pluginRef, "REACT", "Feed poll error", _);
            }
          }, 2e3);
          try {
            const engine = pluginRef.sensesEngine;
            if (engine) {
              setFeed(engine.getActiveFeed());
              lastVersion = engine._feedVersion;
            }
          } catch (_) {
            (_a = pluginRef.debugLog) == null ? void 0 : _a.call(pluginRef, "REACT", "Feed initial load error", _);
          }
          return () => clearInterval(poll);
        }, []);
        useEffect(() => {
          if (feed.length > prevLenRef.current && scrollRef.current) {
            requestAnimationFrame(() => {
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            });
          }
          prevLenRef.current = feed.length;
        }, [feed.length]);
        const visibleFeed = useMemo(() => {
          if (feed.length <= 200) return feed;
          return feed.slice(feed.length - 200);
        }, [feed]);
        if (visibleFeed.length === 0) {
          return ce(
            "div",
            { className: "shadow-senses-empty" },
            "No messages detected yet. Shadows are watching..."
          );
        }
        return ce(
          "div",
          {
            ref: scrollRef,
            style: { maxHeight: "50vh", overflowY: "auto", padding: "8px 16px" }
          },
          visibleFeed.map(
            (entry, i) => ce(FeedCard, { key: `${entry.messageId}-${i}`, entry, onNavigate })
          )
        );
      }
      function DeploymentsTab({ onRecall, onDeployNew }) {
        const [deployments, setDeployments] = useState([]);
        useEffect(() => {
          var _a;
          try {
            setDeployments(pluginRef.deploymentManager ? pluginRef.deploymentManager.getDeployments() : []);
          } catch (_) {
            (_a = pluginRef.debugLog) == null ? void 0 : _a.call(pluginRef, "REACT", "Deployments load error", _);
          }
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
          return ce(
            "div",
            { style: { padding: "16px" } },
            ce(
              "div",
              { className: "shadow-senses-empty" },
              "No shadows deployed. Right-click a user to deploy a shadow."
            ),
            ce("button", {
              className: "shadow-senses-deploy-btn",
              onClick: onDeployNew,
              style: { marginTop: 12 }
            }, "Deploy New Shadow")
          );
        }
        return ce(
          "div",
          { style: { padding: "8px 16px", maxHeight: "50vh", overflowY: "auto" } },
          deployments.map(
            (d) => ce(DeploymentRow, { key: d.shadowId, deployment: d, onRecall: handleRecall })
          ),
          ce("button", {
            className: "shadow-senses-deploy-btn",
            onClick: onDeployNew,
            style: { marginTop: 8 }
          }, "Deploy New Shadow")
        );
      }
      function SensesPanel({ onClose }) {
        var _a;
        const [activeTab, setActiveTab] = useState("feed");
        const handleOverlayClick = useCallback((e) => {
          if (e.target === e.currentTarget) onClose();
        }, [onClose]);
        const handleNavigate = useCallback((entry) => {
          if (!entry.guildId || !entry.channelId) {
            onClose();
            return;
          }
          const path = entry.messageId ? `/channels/${entry.guildId}/${entry.channelId}/${entry.messageId}` : `/channels/${entry.guildId}/${entry.channelId}`;
          onClose();
          pluginRef.teleportToPath(path, {
            guildId: entry.guildId,
            channelId: entry.channelId,
            messageId: entry.messageId || null
          });
        }, [onClose]);
        const handleDeployNew = useCallback(() => {
          pluginRef._toast("Right-click a user to deploy a shadow");
        }, []);
        const deployCount = pluginRef.deploymentManager ? pluginRef.deploymentManager.getDeploymentCount() : 0;
        const onlineMarkedCount = pluginRef.sensesEngine ? pluginRef.sensesEngine.getMarkedOnlineCount() : 0;
        const msgCount = pluginRef.sensesEngine ? pluginRef.sensesEngine.getTotalDetections() : 0;
        return ce(
          "div",
          {
            className: "shadow-senses-overlay",
            onClick: handleOverlayClick
          },
          ce(
            "div",
            { className: "shadow-senses-panel" },
            ce(
              "div",
              { className: "shadow-senses-panel-header" },
              ce("h2", { className: "shadow-senses-panel-title" }, "Shadow Senses"),
              ce("button", {
                className: "shadow-senses-close-btn",
                onClick: onClose
              }, "\u2715")
            ),
            ce(
              "div",
              { className: "shadow-senses-tabs" },
              ce("button", {
                className: `shadow-senses-tab${activeTab === "feed" ? " active" : ""}`,
                onClick: () => setActiveTab("feed")
              }, "Active Feed"),
              ce("button", {
                className: `shadow-senses-tab${activeTab === "deployments" ? " active" : ""}`,
                onClick: () => setActiveTab("deployments")
              }, "Deployments")
            ),
            activeTab === "feed" ? ce(FeedTab, { onNavigate: handleNavigate }) : ce(DeploymentsTab, { onRecall: null, onDeployNew: handleDeployNew }),
            ce(
              "div",
              { className: "shadow-senses-footer" },
              ce(
                "span",
                null,
                ((_a = pluginRef.settings) == null ? void 0 : _a.showMarkedOnlineCount) ? `${deployCount} deployed \u2022 ${onlineMarkedCount} online` : `${deployCount} shadow${deployCount !== 1 ? "s" : ""} deployed`
              ),
              ce("span", null, `${msgCount.toLocaleString()} detection${msgCount !== 1 ? "s" : ""}`)
            )
          )
        );
      }
      function SensesWidget() {
        const [, forceUpdate] = useReducer((x) => x + 1, 0);
        useEffect(() => {
          pluginRef._widgetForceUpdate = forceUpdate;
          const poll = setInterval(() => {
            if (document.hidden) return;
            if (pluginRef._widgetDirty) {
              pluginRef._widgetDirty = false;
              forceUpdate();
            }
          }, 3e3);
          return () => {
            clearInterval(poll);
            pluginRef._widgetForceUpdate = null;
          };
        }, []);
        const feedCount = pluginRef.sensesEngine ? pluginRef.sensesEngine.getActiveFeedCount() : 0;
        const label = "Shadow Sense";
        return ce(
          "div",
          {
            className: "shadow-senses-widget",
            onClick: () => pluginRef.openPanel()
          },
          ce(
            "span",
            { className: "shadow-senses-widget-label" },
            label
          ),
          feedCount > 0 ? ce("span", { className: "shadow-senses-widget-badge" }, feedCount) : null
        );
      }
      return { SensesWidget, SensesPanel };
    }
    module2.exports = { buildComponents: buildComponents2 };
  }
});

// src/ShadowSenses/styles.js
var require_styles = __commonJS({
  "src/ShadowSenses/styles.js"(exports2, module2) {
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

/* \u2500\u2500\u2500 Shadow Senses Widget \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.shadow-senses-widget {
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(138, 43, 226, 0.05));
  border: 1px solid #8a2be2;
  border-radius: 2px;
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
  border-radius: 2px;
  min-width: 20px;
  text-align: center;
}

/* \u2500\u2500\u2500 Overlay \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

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

/* \u2500\u2500\u2500 Panel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.shadow-senses-panel {
  background: #1e1e2e;
  border: 1px solid #8a2be2;
  border-radius: 2px;
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
  border-radius: 2px;
  transition: color 0.15s ease;
}

.shadow-senses-close-btn:hover {
  color: #fff;
}

/* \u2500\u2500\u2500 Tabs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

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

/* \u2500\u2500\u2500 Feed Card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.shadow-senses-feed-card {
  background: rgba(20, 20, 40, 0.6);
  border: 1px solid rgba(138, 43, 226, 0.15);
  border-radius: 2px;
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

/* \u2500\u2500\u2500 Deploy / Recall \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.shadow-senses-deploy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(20, 20, 40, 0.4);
  border-radius: 2px;
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
  border-radius: 2px;
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
  border-radius: 2px;
  cursor: pointer;
  width: 100%;
  text-align: center;
  transition: background 0.15s ease;
}

.shadow-senses-deploy-btn:hover {
  background: rgba(138, 43, 226, 0.3);
}

/* \u2500\u2500\u2500 Footer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.shadow-senses-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid rgba(138, 43, 226, 0.2);
  color: #666;
  font-size: 11px;
}

/* \u2500\u2500\u2500 Empty State \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

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
    module2.exports = { buildCSS };
  }
});

// src/ShadowSenses/plugin-ui-methods.js
var require_plugin_ui_methods = __commonJS({
  "src/ShadowSenses/plugin-ui-methods.js"(exports2, module2) {
    var {
      DEFAULT_TYPING_ALERT_COOLDOWN_MS,
      PANEL_CONTAINER_ID,
      PLUGIN_NAME: PLUGIN_NAME2,
      RANKS,
      STYLE_ID,
      WIDGET_ID,
      WIDGET_REINJECT_DELAY_MS,
      WIDGET_SPACER_ID: WIDGET_SPACER_ID2
    } = require_constants();
    var { buildCSS } = require_styles();
    var { _PluginUtils, _ReactUtils } = require_shared_utils();
    var ShadowSensesUiMethods2 = {
      injectCSS() {
        try {
          BdApi.DOM.addStyle(STYLE_ID, buildCSS());
          this.debugLog("CSS", "Injected via BdApi.DOM.addStyle");
        } catch (err) {
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
      },
      removeCSS() {
        try {
          BdApi.DOM.removeStyle(STYLE_ID);
        } catch (err) {
          try {
            const el = document.getElementById(STYLE_ID);
            if (el) el.remove();
          } catch (fallbackErr) {
            this.debugError("CSS", "Failed to remove CSS", fallbackErr);
          }
        }
      },
      debugLog(system, ...args) {
        if (this._debugMode) console.log(`[${PLUGIN_NAME2}][${system}]`, ...args);
      },
      debugError(system, ...args) {
        console.error(`[${PLUGIN_NAME2}][${system}]`, ...args);
      },
      // ── Widget Injection ────────────────────────────────────────────────────
      _getMembersWrap() {
        try {
          const now = Date.now();
          if (this._cachedMembersWrap && this._cachedMembersWrapTs && now - this._cachedMembersWrapTs < 2e3) {
            if (this._cachedMembersWrap.isConnected && this._cachedMembersWrap.offsetParent !== null) {
              return this._cachedMembersWrap;
            }
            this._cachedMembersWrap = null;
            this._cachedMembersWrapTs = 0;
          }
          const wraps = document.querySelectorAll('[class^="membersWrap_"], [class*=" membersWrap_"]');
          for (const wrap of wraps) {
            if (wrap.offsetParent !== null) {
              this._cachedMembersWrap = wrap;
              this._cachedMembersWrapTs = now;
              return wrap;
            }
          }
          this._cachedMembersWrap = null;
          this._cachedMembersWrapTs = 0;
        } catch (err) {
          this.debugError("Widget", "Failed to find membersWrap", err);
        }
        return null;
      },
      _getCreateRoot() {
        var _a;
        if (_ReactUtils == null ? void 0 : _ReactUtils.getCreateRoot) return _ReactUtils.getCreateRoot();
        if ((_a = BdApi.ReactDOM) == null ? void 0 : _a.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
        return null;
      },
      injectWidget() {
        var _a, _b;
        try {
          if (!((_a = this._components) == null ? void 0 : _a.SensesWidget)) {
            (_b = this.debugError) == null ? void 0 : _b.call(this, "Widget", "Components not initialized");
            return;
          }
          this.removeWidget();
          const membersWrap = this._getMembersWrap();
          if (!membersWrap) {
            this.debugLog("Widget", "membersWrap not found, skipping widget inject");
            return;
          }
          const membersList = membersWrap.querySelector('[class^="members_"], [class*=" members_"]');
          const target = membersList || membersWrap;
          const createRoot = this._getCreateRoot();
          if (!createRoot) {
            this.debugError("Widget", "createRoot not available");
            return;
          }
          const spacer = document.createElement("div");
          spacer.id = WIDGET_SPACER_ID2;
          spacer.style.height = "16px";
          spacer.style.flexShrink = "0";
          const widgetDiv = document.createElement("div");
          widgetDiv.id = WIDGET_ID;
          widgetDiv.style.flexShrink = "0";
          if (target.firstChild) {
            target.insertBefore(widgetDiv, target.firstChild);
            target.insertBefore(spacer, widgetDiv);
          } else {
            target.appendChild(spacer);
            target.appendChild(widgetDiv);
          }
          const root = createRoot(widgetDiv);
          root.render(BdApi.React.createElement(this._components.SensesWidget));
          this._widgetReactRoot = root;
          this.debugLog("Widget", "Injected into members panel");
        } catch (err) {
          this.debugError("Widget", "Failed to inject widget", err);
        }
      },
      removeWidget() {
        var _a;
        try {
          if (this._widgetReactRoot) {
            try {
              this._widgetReactRoot.unmount();
            } catch (_) {
              (_a = this.debugLog) == null ? void 0 : _a.call(this, "CLEANUP", "Widget unmount error", _);
            }
            this._widgetReactRoot = null;
          }
          const existing = document.getElementById(WIDGET_ID);
          if (existing) existing.remove();
          const spacer = document.getElementById(WIDGET_SPACER_ID2);
          if (spacer) spacer.remove();
          this._cachedMembersWrap = null;
          this._cachedMembersWrapTs = 0;
        } catch (err) {
          this.debugError("Widget", "Failed to remove widget", err);
        }
      },
      setupWidgetObserver() {
        try {
          if (_PluginUtils == null ? void 0 : _PluginUtils.LayoutObserverBus) {
            this._layoutBusUnsub = _PluginUtils.LayoutObserverBus.subscribe("ShadowSenses", () => {
              const membersWrap = this._getMembersWrap();
              const widgetEl = document.getElementById(WIDGET_ID);
              if (membersWrap && !widgetEl) {
                clearTimeout(this._widgetReinjectTimeout);
                this._widgetReinjectTimeout = setTimeout(() => {
                  try {
                    this.injectWidget();
                  } catch (err) {
                    this.debugError("Widget", "Reinject failed", err);
                  }
                }, WIDGET_REINJECT_DELAY_MS);
              } else if (!membersWrap && widgetEl) {
                this.removeWidget();
              }
            }, 500);
            this.debugLog("Widget", "Subscribed to shared LayoutObserverBus (500ms throttle)");
          } else {
            this.debugError("Widget", "LayoutObserverBus not available \u2014 widget persistence disabled");
          }
        } catch (err) {
          this.debugError("Widget", "Failed to setup observer", err);
        }
      },
      // ── Panel ───────────────────────────────────────────────────────────────
      openPanel() {
        var _a, _b, _c;
        try {
          if (!((_a = this._components) == null ? void 0 : _a.SensesPanel)) {
            (_b = this.debugError) == null ? void 0 : _b.call(this, "Panel", "Components not initialized");
            return;
          }
          if (this._panelReactRoot) {
            try {
              this._panelReactRoot.unmount();
            } catch (_) {
              (_c = this.debugLog) == null ? void 0 : _c.call(this, "CLEANUP", "Panel pre-close unmount error", _);
            }
            this._panelReactRoot = null;
          }
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
            onClose: () => this.closePanel()
          }));
          this._panelReactRoot = root;
          this._panelOpen = true;
          this.debugLog("Panel", "Opened");
        } catch (err) {
          this.debugError("Panel", "Failed to open panel", err);
        }
      },
      closePanel() {
        var _a;
        try {
          if (this._panelReactRoot) {
            try {
              this._panelReactRoot.unmount();
            } catch (_) {
              (_a = this.debugLog) == null ? void 0 : _a.call(this, "CLEANUP", "Panel unmount error", _);
            }
            this._panelReactRoot = null;
          }
          const container = document.getElementById(PANEL_CONTAINER_ID);
          if (container) container.remove();
          this._panelOpen = false;
          this.debugLog("Panel", "Closed");
        } catch (err) {
          this.debugError("Panel", "Failed to close panel", err);
        }
      },
      // ── ESC Handler ─────────────────────────────────────────────────────────
      registerEscHandler() {
        try {
          this._escHandler = (e) => {
            if (e.key !== "Escape") return;
            if (this._panelOpen) {
              this.closePanel();
              e.stopPropagation();
            }
          };
          document.addEventListener("keydown", this._escHandler);
          this.debugLog("ESC", "Handler registered");
        } catch (err) {
          this.debugError("ESC", "Failed to register ESC handler", err);
        }
      },
      // ── Context Menu ────────────────────────────────────────────────────────
      patchContextMenu() {
        try {
          if (this._unpatchContextMenu) {
            try {
              this._unpatchContextMenu();
            } catch (_) {
            }
            this._unpatchContextMenu = null;
          }
          this._unpatchContextMenu = BdApi.ContextMenu.patch("user-context", (tree, props) => {
            if (!props || !props.user) return;
            const user = props.user;
            const userId = user.id;
            const deployment = this.deploymentManager.getDeploymentForUser(userId);
            let menuItem;
            if (deployment) {
              menuItem = BdApi.ContextMenu.buildItem({
                type: "text",
                label: "Recall",
                action: () => {
                  try {
                    this.deploymentManager.recall(deployment.shadowId);
                    this._toast(`Recalled ${deployment.shadowName} from ${deployment.targetUsername}`);
                    this._widgetDirty = true;
                  } catch (err) {
                    this.debugError("ContextMenu", "Recall failed", err);
                  }
                }
              });
            } else {
              menuItem = BdApi.ContextMenu.buildItem({
                type: "text",
                label: "Deploy Shadow",
                action: async () => {
                  let available;
                  try {
                    available = this.deploymentManager ? await this.deploymentManager.getAvailableShadows() : [];
                  } catch (err) {
                    this.debugError("ContextMenu", "Failed to load available shadows", err);
                    this._toast("Failed to load shadows", "error");
                    return;
                  }
                  try {
                    if (available.length === 0) {
                      this._toast("No available shadows. All are deployed, in dungeons, or marked for exchange.", "warning");
                      return;
                    }
                    const sorted = [...available].sort((a, b) => {
                      const aIdx = RANKS.indexOf(a.rank || "E");
                      const bIdx = RANKS.indexOf(b.rank || "E");
                      return aIdx - bIdx;
                    });
                    const weakest = sorted[0];
                    const success = await this.deploymentManager.deploy(weakest, user);
                    if (success) {
                      const targetName = user.globalName || user.username || "User";
                      this._toast(`Deployed ${weakest.roleName || weakest.role || "Shadow"} [${weakest.rank || "E"}] to monitor ${targetName}`, "success");
                      this._widgetDirty = true;
                    } else {
                      this._toast("Shadow already deployed or target already monitored", "warning");
                    }
                  } catch (err) {
                    this.debugError("ContextMenu", "Auto-deploy failed", err);
                    this._toast("Failed to deploy shadow", "error");
                  }
                }
              });
            }
            const separator = BdApi.ContextMenu.buildItem({ type: "separator" });
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
      },
      getSettingsPanel() {
        var _a, _b, _c, _d, _e;
        const React = BdApi.React;
        const ce = React.createElement;
        const deployCount = ((_a = this.deploymentManager) == null ? void 0 : _a.getDeploymentCount()) || 0;
        const onlineMarkedCount = ((_c = (_b = this.sensesEngine) == null ? void 0 : _b.getMarkedOnlineCount) == null ? void 0 : _c.call(_b)) || 0;
        const sessionCount = ((_d = this.sensesEngine) == null ? void 0 : _d.getSessionMessageCount()) || 0;
        const totalDetections = ((_e = this.sensesEngine) == null ? void 0 : _e.getTotalDetections()) || 0;
        const statCardStyle = {
          background: "rgba(138, 43, 226, 0.1)",
          border: "1px solid rgba(138, 43, 226, 0.3)",
          borderRadius: "8px",
          padding: "12px",
          textAlign: "center"
        };
        const rowStyle = {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginTop: "10px"
        };
        const updateSetting = (key, value) => {
          this.settings[key] = value;
          this.saveSettings();
          this._widgetDirty = true;
          if (typeof this._widgetForceUpdate === "function") this._widgetForceUpdate();
        };
        return ce(
          "div",
          { style: { padding: "16px", background: "#1e1e2e", borderRadius: "8px", color: "#ccc" } },
          // Statistics header
          ce("h3", { style: { color: "#8a2be2", marginTop: 0, marginBottom: "12px" } }, "Shadow Senses Statistics"),
          // Stat cards grid
          ce(
            "div",
            { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" } },
            ce(
              "div",
              { style: statCardStyle },
              ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, deployCount),
              ce("div", { style: { color: "#999", fontSize: "11px" } }, "Deployed")
            ),
            ce(
              "div",
              { style: statCardStyle },
              ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, onlineMarkedCount),
              ce("div", { style: { color: "#999", fontSize: "11px" } }, "Marked Online")
            ),
            ce(
              "div",
              { style: statCardStyle },
              ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, sessionCount),
              ce("div", { style: { color: "#999", fontSize: "11px" } }, "Detections (since restart)")
            ),
            ce(
              "div",
              { style: statCardStyle },
              ce("div", { style: { color: "#8a2be2", fontSize: "20px", fontWeight: "700" } }, totalDetections.toLocaleString()),
              ce("div", { style: { color: "#999", fontSize: "11px" } }, "Total Detections")
            )
          ),
          ce("h3", { style: { color: "#8a2be2", marginTop: 0, marginBottom: "8px", fontSize: "14px" } }, "Marked Utility Alerts"),
          ce(
            "div",
            { style: rowStyle },
            ce("span", { style: { color: "#999", fontSize: "13px" } }, "Status Change Alerts"),
            ce("input", {
              type: "checkbox",
              defaultChecked: !!this.settings.statusAlerts,
              onChange: (e) => updateSetting("statusAlerts", e.target.checked),
              style: { accentColor: "#8a2be2" }
            })
          ),
          ce(
            "div",
            { style: rowStyle },
            ce("span", { style: { color: "#999", fontSize: "13px" } }, "Typing Alerts"),
            ce("input", {
              type: "checkbox",
              defaultChecked: !!this.settings.typingAlerts,
              onChange: (e) => updateSetting("typingAlerts", e.target.checked),
              style: { accentColor: "#8a2be2" }
            })
          ),
          ce(
            "div",
            { style: rowStyle },
            ce("span", { style: { color: "#999", fontSize: "13px" } }, "Removed Friend Alerts"),
            ce("input", {
              type: "checkbox",
              defaultChecked: !!this.settings.removedFriendAlerts,
              onChange: (e) => updateSetting("removedFriendAlerts", e.target.checked),
              style: { accentColor: "#8a2be2" }
            })
          ),
          ce(
            "div",
            { style: rowStyle },
            ce("span", { style: { color: "#999", fontSize: "13px" } }, "Show Marked Online Count"),
            ce("input", {
              type: "checkbox",
              defaultChecked: !!this.settings.showMarkedOnlineCount,
              onChange: (e) => updateSetting("showMarkedOnlineCount", e.target.checked),
              style: { accentColor: "#8a2be2" }
            })
          ),
          ce(
            "div",
            { style: rowStyle },
            ce("span", { style: { color: "#999", fontSize: "13px" } }, "Typing Alert Cooldown (seconds)"),
            ce("input", {
              type: "number",
              min: 3,
              max: 60,
              step: 1,
              defaultValue: Math.round((this.settings.typingAlertCooldownMs || DEFAULT_TYPING_ALERT_COOLDOWN_MS) / 1e3),
              onChange: (e) => {
                const seconds = Number(e.target.value);
                if (!Number.isFinite(seconds)) return;
                updateSetting("typingAlertCooldownMs", Math.min(6e4, Math.max(3e3, Math.floor(seconds * 1e3))));
              },
              style: {
                width: "80px",
                padding: "4px 6px",
                borderRadius: "6px",
                border: "1px solid rgba(138, 43, 226, 0.4)",
                background: "#111827",
                color: "#ccc"
              }
            })
          ),
          ce(
            "div",
            { style: rowStyle },
            ce("span", { style: { color: "#999", fontSize: "13px" } }, "Group High Priority Bursts (P3/P4)"),
            ce("input", {
              type: "checkbox",
              defaultChecked: !!this.settings.groupHighPriorityBursts,
              onChange: (e) => updateSetting("groupHighPriorityBursts", e.target.checked),
              style: { accentColor: "#8a2be2" }
            })
          ),
          ce("h3", { style: { color: "#8a2be2", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Feed Policy"),
          ce(
            "div",
            {
              style: {
                marginTop: "6px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(138, 43, 226, 0.25)",
                background: "rgba(138, 43, 226, 0.08)",
                color: "#b8b8b8",
                fontSize: "12px",
                lineHeight: 1.45
              }
            },
            "Status, typing, and connection alerts are toast-only and are not saved in Active Feed history. ",
            "Active Feed records chat message detections only. ",
            "Burst grouping uses a 10s window per author+channel; enable high-priority grouping if you want P3/P4 merged too."
          ),
          ce("h3", { style: { color: "#8a2be2", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Priority Keywords"),
          ce(
            "div",
            {
              style: {
                marginTop: "6px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(138, 43, 226, 0.25)",
                background: "rgba(138, 43, 226, 0.08)",
                color: "#b8b8b8",
                fontSize: "12px",
                lineHeight: 1.45,
                marginBottom: "8px"
              }
            },
            "Messages containing these keywords are bumped to P2 (Medium) priority. ",
            "P3 = @everyone/reply-to-you, P4 = direct @mention."
          ),
          ce("input", {
            type: "text",
            placeholder: "urgent, important, help, @here ...",
            defaultValue: (this.settings.priorityKeywords || []).join(", "),
            onChange: (e) => {
              const raw = e.target.value;
              const keywords = raw.split(",").map((s) => s.trim()).filter(Boolean);
              updateSetting("priorityKeywords", keywords);
            },
            style: {
              width: "100%",
              padding: "8px 10px",
              borderRadius: "6px",
              border: "1px solid rgba(138, 43, 226, 0.35)",
              background: "rgba(30, 30, 46, 0.9)",
              color: "#e0e0e0",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box"
            }
          }),
          ce("h3", { style: { color: "#ec4899", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Mention Names"),
          ce(
            "div",
            {
              style: {
                marginTop: "6px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(236, 72, 153, 0.25)",
                background: "rgba(236, 72, 153, 0.08)",
                color: "#b8b8b8",
                fontSize: "12px",
                lineHeight: 1.45,
                marginBottom: "8px"
              }
            },
            "When a monitored user says one of these names in a message, you get a toast notification and the feed card is highlighted pink. ",
            "Case-insensitive. Ranked P3 (High)."
          ),
          ce("input", {
            type: "text",
            placeholder: "Curio, bestie, your name ...",
            defaultValue: (this.settings.mentionNames || []).join(", "),
            onChange: (e) => {
              const raw = e.target.value;
              const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
              updateSetting("mentionNames", names);
            },
            style: {
              width: "100%",
              padding: "8px 10px",
              borderRadius: "6px",
              border: "1px solid rgba(236, 72, 153, 0.35)",
              background: "rgba(30, 30, 46, 0.9)",
              color: "#e0e0e0",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box"
            }
          }),
          ce("h3", { style: { color: "#8a2be2", marginBottom: "8px", marginTop: "16px", fontSize: "14px" } }, "Diagnostics"),
          ce(
            "div",
            { style: rowStyle },
            ce("span", { style: { color: "#999", fontSize: "13px" } }, "Debug Mode"),
            ce("input", {
              type: "checkbox",
              defaultChecked: this._debugMode,
              onChange: (e) => {
                this._debugMode = e.target.checked;
                BdApi.Data.save(PLUGIN_NAME2, "debugMode", this._debugMode);
              },
              style: { accentColor: "#8a2be2" }
            })
          )
        );
      }
    };
    module2.exports = ShadowSensesUiMethods2;
  }
});

// src/ShadowSenses/senses-engine-feed.js
var require_senses_engine_feed = __commonJS({
  "src/ShadowSenses/senses-engine-feed.js"(exports2, module2) {
    var {
      BURST_WINDOW_MS,
      FEED_MAX_AGE_MS,
      GLOBAL_FEED_CAP,
      GUILD_FEED_CAP,
      PLUGIN_NAME: PLUGIN_NAME2,
      PRIORITY
    } = require_constants();
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
      var _a, _b;
      if (ctx._totalFeedEntries <= GLOBAL_FEED_CAP) return;
      const { maxGuild, maxLen } = getLargestGuildFeedEntry(ctx._guildFeeds);
      if (!maxGuild || maxLen <= 0) return;
      const trimTo = Math.max(100, Math.floor(maxLen / 2));
      const trimmed = maxLen - trimTo;
      ctx._guildFeeds[maxGuild] = ctx._guildFeeds[maxGuild].slice(-trimTo);
      ctx._totalFeedEntries -= trimmed;
      clearGuildBurstEntries(ctx, maxGuild);
      ctx._dirtyGuilds.add(maxGuild);
      (_b = (_a = ctx._plugin).debugLog) == null ? void 0 : _b.call(
        _a,
        "SensesEngine",
        `Global cap: trimmed guild ${maxGuild} from ${maxLen} to ${trimTo}`
      );
    }
    function setMatchReason(entry, reason, matchedTerm) {
      entry.matchReason = reason;
      if (matchedTerm) entry.matchedTerm = matchedTerm;
    }
    function getLowerContent(message) {
      return typeof (message == null ? void 0 : message.content) === "string" ? message.content.toLowerCase() : "";
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
      if (!currentUserId || !Array.isArray(message == null ? void 0 : message.mentions)) return false;
      for (const mention of message.mentions) {
        if (String((mention == null ? void 0 : mention.id) || mention) === currentUserId) return true;
      }
      return false;
    }
    function hasCurrentUserRoleMention(ctx, guildId, currentUserId, roleMentions) {
      var _a, _b;
      if (!currentUserId || !guildId || !Array.isArray(roleMentions) || roleMentions.length === 0) {
        return false;
      }
      try {
        const member = (_b = (_a = ctx._plugin._GuildMemberStore) == null ? void 0 : _a.getMember) == null ? void 0 : _b.call(_a, guildId, currentUserId);
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
      return !!candidate && candidate.eventType === "message" && candidate.authorId === entry.authorId && candidate.channelId === entry.channelId;
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
      var _a;
      const allowHighPriorityBursts = !!((_a = ctx._plugin.settings) == null ? void 0 : _a.groupHighPriorityBursts);
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
        for (const guildId of this._dirtyGuilds) {
          BdApi.Data.save(PLUGIN_NAME2, `feed_${guildId}`, this._guildFeeds[guildId] || []);
        }
        BdApi.Data.save(PLUGIN_NAME2, "feedGuildIds", Object.keys(this._guildFeeds));
        BdApi.Data.save(PLUGIN_NAME2, "totalDetections", this._totalDetections);
        this._dirtyGuilds.clear();
        this._dirty = false;
        this._plugin.debugLog("SensesEngine", "Flushed to disk", {
          dirtyGuilds: dirtyCount,
          totalGuilds: Object.keys(this._guildFeeds).length
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
    function purgeOldEntries() {
      const cutoff = Date.now() - FEED_MAX_AGE_MS;
      let totalPurged = 0;
      for (const guildId of Object.keys(this._guildFeeds)) {
        const feed = this._guildFeeds[guildId];
        if (!feed || feed.length === 0) continue;
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
    function purgeUtilityEntries() {
      let removed = 0;
      for (const guildId of Object.keys(this._guildFeeds)) {
        const feed = this._guildFeeds[guildId];
        if (!Array.isArray(feed) || feed.length === 0) continue;
        const filtered = feed.filter((entry) => !(entry == null ? void 0 : entry.eventType) || entry.eventType === "message");
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
    function computePriority(message, guildId, entry) {
      var _a, _b, _c, _d, _e, _f;
      const currentUser = (_b = (_a = this._plugin._UserStore) == null ? void 0 : _a.getCurrentUser) == null ? void 0 : _b.call(_a);
      const currentUserId = currentUser == null ? void 0 : currentUser.id;
      const contentLower = getLowerContent(message);
      if (isDirectMention(message, currentUserId)) {
        setMatchReason(entry, "mention");
        return PRIORITY.CRITICAL;
      }
      if (currentUserId && ((_d = (_c = message.referenced_message) == null ? void 0 : _c.author) == null ? void 0 : _d.id) === currentUserId) {
        setMatchReason(entry, "reply");
        return PRIORITY.HIGH;
      }
      if (message.mention_everyone) {
        setMatchReason(entry, "everyone");
        return PRIORITY.HIGH;
      }
      const mentionName = findTermMatch((_e = this._plugin.settings) == null ? void 0 : _e.mentionNames, contentLower);
      if (mentionName) {
        setMatchReason(entry, "name", mentionName);
        return PRIORITY.HIGH;
      }
      if (hasCurrentUserRoleMention(this, guildId, currentUserId, message.mention_roles)) {
        setMatchReason(entry, "role");
        return PRIORITY.MEDIUM;
      }
      const keyword = findTermMatch((_f = this._plugin.settings) == null ? void 0 : _f.priorityKeywords, contentLower);
      if (keyword) {
        setMatchReason(entry, "keyword", keyword);
        return PRIORITY.MEDIUM;
      }
      return PRIORITY.LOW;
    }
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
      if (!shouldAllowBurstMerge(this, target.priority)) return false;
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
    function registerBurst(guildId, entry) {
      const key = `${entry.authorId}:${entry.channelId}`;
      const feed = this._guildFeeds[guildId];
      if (!feed) return;
      this._burstMap.set(key, {
        guildId,
        feedIndex: feed.length - 1,
        messageId: entry.messageId || null,
        timestamp: entry.timestamp
      });
      if (this._burstMap.size > 200) {
        this._burstMap.delete(this._burstMap.keys().next().value);
      }
    }
    function getActiveFeed() {
      const merged = [];
      for (const [guildId, feed] of Object.entries(this._guildFeeds)) {
        if (guildId === this._currentGuildId) continue;
        for (let i = 0; i < feed.length; i++) {
          merged.push(feed[i]);
        }
      }
      merged.sort((a, b) => a.timestamp - b.timestamp);
      return merged;
    }
    function getActiveFeedCount() {
      let count = 0;
      for (const [guildId, feed] of Object.entries(this._guildFeeds)) {
        if (guildId === this._currentGuildId) continue;
        count += feed.length;
      }
      return count;
    }
    function getMarkedOnlineCount() {
      var _a, _b;
      const monitoredIds = (_b = (_a = this._plugin.deploymentManager) == null ? void 0 : _a.getMonitoredUserIds) == null ? void 0 : _b.call(_a);
      if (!monitoredIds || monitoredIds.size === 0) return 0;
      const presenceStore = this._resolvePresenceStore();
      if (!presenceStore || typeof presenceStore.getStatus !== "function") return 0;
      let onlineCount = 0;
      for (const userId of monitoredIds) {
        try {
          const status = this._normalizeStatus(presenceStore.getStatus(userId));
          this._statusByUserId.set(userId, status);
          if (this._isOnlineStatus(status)) onlineCount++;
        } catch (_) {
        }
      }
      return onlineCount;
    }
    function getSessionMessageCount() {
      return this._sessionMessageCount;
    }
    function getTotalDetections() {
      return this._totalDetections;
    }
    module2.exports = {
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
      tryBurstGroup
    };
  }
});

// src/ShadowSenses/senses-engine-events.js
var require_senses_engine_events = __commonJS({
  "src/ShadowSenses/senses-engine-events.js"(exports2, module2) {
    var {
      GLOBAL_UTILITY_FEED_ID,
      STARTUP_TOAST_GRACE_MS
    } = require_constants();
    var DEFAULT_AVATAR_URL = "https://cdn.discordapp.com/embed/avatars/0.png";
    function getStartupState(ctx) {
      const now = Date.now();
      const msSinceSubscribe = now - ctx._subscribeTime;
      const isEarlyStartup = ctx._subscribeTime > 0 && msSinceSubscribe < STARTUP_TOAST_GRACE_MS;
      return {
        now,
        msSinceSubscribe,
        isEarlyStartup,
        delayMs: isEarlyStartup ? Math.max(0, STARTUP_TOAST_GRACE_MS - msSinceSubscribe) : 0
      };
    }
    function ensureCurrentGuildId(ctx) {
      if (ctx._currentGuildId) return;
      try {
        ctx._currentGuildId = ctx._plugin._SelectedGuildStore ? ctx._plugin._SelectedGuildStore.getGuildId() : null;
        if (ctx._currentGuildId) {
          ctx._plugin._debugMode && console.log(`[ShadowSenses] Lazy guild resolve: _currentGuildId=${ctx._currentGuildId}`);
        }
      } catch (_) {
      }
    }
    function resolveMessageChannelContext(ctx, message) {
      let channelName = "unknown";
      let guildId = message.guild_id || null;
      try {
        const channel = ctx._plugin._ChannelStore ? ctx._plugin._ChannelStore.getChannel(message.channel_id) : null;
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
        guildId: payload.guildId || payload.guild_id || null
      };
    }
    function resolveTypingChannelContext(ctx, channelId, initialGuildId) {
      var _a, _b;
      let guildId = initialGuildId || null;
      let channelName = "unknown";
      if (!channelId || !((_a = ctx._plugin._ChannelStore) == null ? void 0 : _a.getChannel)) return { guildId, channelName };
      try {
        const channel = ctx._plugin._ChannelStore.getChannel(channelId);
        if (!channel) return { guildId, channelName };
        channelName = channel.name || ((_b = channel.rawRecipients) == null ? void 0 : _b.map((recipient) => recipient == null ? void 0 : recipient.username).filter(Boolean).join(", ")) || "Direct Message";
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
        fallbackBody
      } = options;
      const avatarUrl = ctx._resolveUserAvatarUrl(options.authorId) || DEFAULT_AVATAR_URL;
      if (ctx._toastEngine) {
        ctx._toastEngine.showCardToast({
          avatarUrl,
          accentColor,
          header: `[${deployment.shadowRank}] ${deployment.shadowName}`,
          body,
          detail,
          duration: 5e3
        });
        return;
      }
      ctx._toast(
        `[${deployment.shadowRank}] ${deployment.shadowName} reports: ${fallbackBody}`,
        fallbackType,
        5e3
      );
    }
    function formatSilenceDuration(silenceMs) {
      const silenceHours = Math.floor(silenceMs / (60 * 60 * 1e3));
      const silenceMins = Math.floor(silenceMs % (60 * 60 * 1e3) / (60 * 1e3));
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
        now
      } = params;
      const lastActivity = ctx._userLastActivity.get(authorId);
      if (!lastActivity) {
        withStartupDelay(
          ctx,
          startupState,
          () => showActivityToast(ctx, {
            authorId,
            deployment,
            authorName,
            guildName,
            channelName,
            accentColor: "#22c55e",
            body: `${authorName} is now active`,
            detail: `${guildName} #${channelName}`,
            fallbackType: "quest",
            fallbackBody: `${authorName} is now active`
          })
        );
        ctx._userLastActivity.set(authorId, { timestamp: now, notifiedActive: true });
        return;
      }
      const silenceMs = now - lastActivity.timestamp;
      if (silenceMs >= ctx._AFK_THRESHOLD_MS) {
        const timeStr = formatSilenceDuration(silenceMs);
        withStartupDelay(
          ctx,
          startupState,
          () => showActivityToast(ctx, {
            authorId,
            deployment,
            authorName,
            guildName,
            channelName,
            accentColor: "#fbbf24",
            body: `${authorName} has returned`,
            detail: `AFK ${timeStr} \u2022 ${guildName} #${channelName}`,
            fallbackType: "achievement",
            fallbackBody: `${authorName} has returned (AFK ${timeStr})`
          })
        );
      }
      ctx._userLastActivity.set(authorId, { timestamp: now, notifiedActive: true });
      pruneUserActivityCache(ctx);
    }
    function buildAttachmentMarker(attachment) {
      const contentType = (attachment == null ? void 0 : attachment.content_type) || "";
      if (contentType.startsWith("image/")) return "[Image]";
      if (contentType.startsWith("video/")) return "[Video]";
      if (contentType.startsWith("audio/")) return "[Audio]";
      return `[File: ${(attachment == null ? void 0 : attachment.filename) || "attachment"}]`;
    }
    function buildEmbedMarker(embed) {
      if (embed == null ? void 0 : embed.title) return `[Embed: ${embed.title.slice(0, 60)}]`;
      if (embed == null ? void 0 : embed.description) return `[Embed: ${embed.description.slice(0, 60)}]`;
      if (embed == null ? void 0 : embed.url) return "[Link]";
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
        guildName
      } = params;
      if (entry.matchReason !== "mention" && entry.matchReason !== "name") return;
      const snippet = entry.content ? `: "${entry.content.slice(0, 80)}"` : "";
      if (entry.matchReason === "mention") {
        ctx._showMentionToast({
          userId: authorId,
          userName: authorName,
          label: "@mentioned you",
          detail: `in ${guildName} #${entry.channelName}${snippet}`,
          accent: "#ef4444",
          deployment
        });
        return;
      }
      ctx._showMentionToast({
        userId: authorId,
        userName: authorName,
        label: `said "${entry.matchedTerm}"`,
        detail: `in ${guildName} #${entry.channelName}${snippet}`,
        accent: "#ec4899",
        deployment
      });
    }
    function applyPresenceToastAndLastSeen(ctx, params) {
      var _a;
      const {
        entry,
        guildId,
        guildName,
        isAwayGuild,
        authorId
      } = params;
      const presenceStore = ctx._resolvePresenceStore();
      const userStatus = ((_a = presenceStore == null ? void 0 : presenceStore.getStatus) == null ? void 0 : _a.call(presenceStore, authorId)) || "offline";
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
      if (payload == null ? void 0 : payload.guildId) return payload.guildId;
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
      var _a;
      const userId = update.userId;
      if (!userId || !monitoredIds.has(userId)) return false;
      const deployment = ctx._plugin.deploymentManager.getDeploymentForUser(userId);
      if (!deployment) return false;
      const hasPriorStatus = ctx._statusByUserId.has(userId);
      const previousStatus = hasPriorStatus ? ctx._normalizeStatus(ctx._statusByUserId.get(userId)) : null;
      const nextStatus = ctx._normalizeStatus(update.status);
      ctx._statusByUserId.set(userId, nextStatus);
      if (!hasPriorStatus || previousStatus === nextStatus) return false;
      if ((_a = ctx._plugin.settings) == null ? void 0 : _a.statusAlerts) {
        const toastPayload = {
          userId,
          userName: ctx._resolveUserName(userId, deployment.targetUsername || "Unknown"),
          previousLabel: ctx._getStatusLabel(previousStatus),
          nextLabel: ctx._getStatusLabel(nextStatus),
          nextStatus,
          deployment
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
          hasStateChanges = handlePresenceUpdateEntry(this, update, monitoredIds, startupState) || hasStateChanges;
        }
        if (hasStateChanges) this._plugin._widgetDirty = true;
      } catch (err) {
        this._plugin.debugError("SensesEngine", "Error in PRESENCE_UPDATE handler", err);
      }
    }
    function onTypingStart(payload) {
      var _a, _b, _c;
      try {
        const typingPayload = resolveTypingPayload(payload);
        if (!typingPayload) return;
        const { userId, channelId } = typingPayload;
        const userStore = this._resolveUserStore();
        const currentUserId = (_b = (_a = userStore == null ? void 0 : userStore.getCurrentUser) == null ? void 0 : _a.call(userStore)) == null ? void 0 : _b.id;
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
        if ((_c = this._plugin.settings) == null ? void 0 : _c.typingAlerts) {
          this._toast(
            `[${deployment.shadowRank}] ${deployment.shadowName} senses ${userName} typing in ${locationLabel}`,
            "info",
            4e3
          );
        }
        syncLastSeenCount(this, guildId);
        this._plugin._widgetDirty = true;
      } catch (err) {
        this._plugin.debugError("SensesEngine", "Error in TYPING_START handler", err);
      }
    }
    function onRelationshipChange() {
      var _a;
      try {
        const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
        if (!monitoredIds || monitoredIds.size === 0) {
          this._snapshotFriendRelationships();
          return;
        }
        const previousFriends = this._relationshipFriendIds || /* @__PURE__ */ new Set();
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
          if ((_a = this._plugin.settings) == null ? void 0 : _a.removedFriendAlerts) {
            this._toast(
              `[${deployment.shadowRank}] ${deployment.shadowName} reports: ${userName} removed your connection`,
              "warning",
              5e3
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
      var _a;
      try {
        const message = payload == null ? void 0 : payload.message;
        if (!((_a = message == null ? void 0 : message.author) == null ? void 0 : _a.id)) return;
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
          now: startupState.now
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
          shadowRank: deployment.shadowRank
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
          guildName
        });
        applyPresenceToastAndLastSeen(this, {
          entry,
          guildId,
          guildName,
          isAwayGuild,
          authorId
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
    module2.exports = {
      _onChannelSelect: onChannelSelect,
      _onMessageCreate: onMessageCreate,
      _onPresenceUpdate: onPresenceUpdate,
      _onRelationshipChange: onRelationshipChange,
      _onTypingStart: onTypingStart,
      onChannelSelect,
      onMessageCreate,
      onPresenceUpdate,
      onRelationshipChange,
      onTypingStart
    };
  }
});

// src/shared/toast.js
var require_toast = __commonJS({
  "src/shared/toast.js"(exports2, module2) {
    function createToast2() {
      return (message, type = "info") => {
        BdApi.UI.showToast(message, {
          type: type === "level-up" ? "info" : type
        });
      };
    }
    module2.exports = { createToast: createToast2 };
  }
});

// src/ShadowSenses/senses-engine-utils.js
var require_senses_engine_utils = __commonJS({
  "src/ShadowSenses/senses-engine-utils.js"(exports2, module2) {
    var {
      DEFAULT_TYPING_ALERT_COOLDOWN_MS,
      ONLINE_STATUSES,
      STATUS_ACCENT_COLORS,
      STATUS_LABELS,
      STATUS_TOAST_TIMEOUT_MS
    } = require_constants();
    var { createToast: createToast2 } = require_toast();
    var _fallbackToast2 = createToast2();
    function resolveUserStore() {
      if (this._plugin._UserStore) return this._plugin._UserStore;
      try {
        this._plugin._UserStore = BdApi.Webpack.getStore("UserStore");
      } catch (err) {
        this._plugin.debugError("SensesEngine", "Failed to resolve UserStore", err);
      }
      return this._plugin._UserStore;
    }
    function resolvePresenceStore() {
      if (this._plugin._PresenceStore) return this._plugin._PresenceStore;
      try {
        this._plugin._PresenceStore = BdApi.Webpack.getStore("PresenceStore");
      } catch (err) {
        this._plugin.debugError("SensesEngine", "Failed to resolve PresenceStore", err);
      }
      return this._plugin._PresenceStore;
    }
    function resolveRelationshipStore() {
      if (this._plugin._RelationshipStore) return this._plugin._RelationshipStore;
      try {
        this._plugin._RelationshipStore = BdApi.Webpack.getStore("RelationshipStore");
      } catch (err) {
        this._plugin.debugError("SensesEngine", "Failed to resolve RelationshipStore", err);
      }
      return this._plugin._RelationshipStore;
    }
    function normalizeStatus(status) {
      if (!status || typeof status !== "string") return "offline";
      return status.toLowerCase();
    }
    function isOnlineStatus(status) {
      return ONLINE_STATUSES.has(this._normalizeStatus(status));
    }
    function getStatusLabel(status) {
      const normalized = this._normalizeStatus(status);
      return STATUS_LABELS[normalized] || normalized;
    }
    function getFriendIdSet() {
      const relationshipStore = this._resolveRelationshipStore();
      if (!relationshipStore || typeof relationshipStore.getFriendIDs !== "function") return /* @__PURE__ */ new Set();
      try {
        return new Set((relationshipStore.getFriendIDs() || []).map(String));
      } catch (err) {
        this._plugin.debugError("SensesEngine", "Failed to read friend IDs", err);
        return /* @__PURE__ */ new Set();
      }
    }
    function snapshotFriendRelationships() {
      this._relationshipFriendIds = this._getFriendIdSet();
    }
    function resolveUserName(userId, fallbackName = "Unknown") {
      const userStore = this._resolveUserStore();
      if (!userStore || typeof userStore.getUser !== "function") return fallbackName;
      try {
        const user = userStore.getUser(userId);
        return (user == null ? void 0 : user.globalName) || (user == null ? void 0 : user.global_name) || (user == null ? void 0 : user.username) || fallbackName;
      } catch (_) {
        return fallbackName;
      }
    }
    function resolveUserAvatarUrl(userId) {
      const userStore = this._resolveUserStore();
      if (!userStore || typeof userStore.getUser !== "function") return null;
      try {
        const user = userStore.getUser(userId);
        if (!user) return null;
        const candidateCalls = [
          () => {
            var _a;
            return (_a = user.getAvatarURL) == null ? void 0 : _a.call(user, null, 64, true);
          },
          () => {
            var _a;
            return (_a = user.getAvatarURL) == null ? void 0 : _a.call(user);
          },
          () => {
            var _a;
            return (_a = user.getAvatarURL) == null ? void 0 : _a.call(user, 64);
          },
          () => {
            var _a;
            return (_a = user.getDefaultAvatarURL) == null ? void 0 : _a.call(user);
          }
        ];
        for (const call of candidateCalls) {
          try {
            const value = call();
            if (typeof value === "string" && value.length > 4) return value;
          } catch (_) {
          }
        }
        if (typeof user.defaultAvatarURL === "string" && user.defaultAvatarURL.length > 4) {
          return user.defaultAvatarURL;
        }
        if (user.avatar && user.id) {
          return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
        }
      } catch (_) {
      }
      return null;
    }
    function isFriend(userId) {
      return this._relationshipFriendIds instanceof Set && this._relationshipFriendIds.has(String(userId));
    }
    function toast(message, type = "info", timeout = null) {
      if (this._toastEngine) {
        this._toastEngine.showToast(message, type, timeout, { callerId: "shadowSenses" });
      } else {
        _fallbackToast2(message, type);
      }
    }
    function scheduleStatusToast(toastPayload, delayMs = 0) {
      const emit = () => {
        if (this._plugin._stopped) return;
        this._showStatusToast(toastPayload);
      };
      if (!Number.isFinite(delayMs) || delayMs <= 0) {
        emit();
        return;
      }
      const timer = setTimeout(() => {
        this._deferredStatusToastTimers.delete(timer);
        emit();
      }, Math.floor(delayMs));
      this._deferredStatusToastTimers.add(timer);
    }
    function scheduleDeferredUtilityToast(callback, delayMs = 0) {
      if (typeof callback !== "function") return;
      const emit = () => {
        if (this._plugin._stopped) return;
        callback();
      };
      if (!Number.isFinite(delayMs) || delayMs <= 0) {
        emit();
        return;
      }
      const timer = setTimeout(() => {
        this._deferredUtilityToastTimers.delete(timer);
        emit();
      }, Math.floor(delayMs));
      this._deferredUtilityToastTimers.add(timer);
    }
    function showStatusToast({ userId, userName, previousLabel, nextLabel, nextStatus, deployment }) {
      const accent = STATUS_ACCENT_COLORS[nextStatus] || "#8a2be2";
      const rankLabel = (deployment == null ? void 0 : deployment.shadowRank) || "E";
      const shadowName = (deployment == null ? void 0 : deployment.shadowName) || "Shadow";
      const friendSuffix = this._isFriend(userId) ? " [FRIEND]" : "";
      if (this._toastEngine) {
        const avatarUrl = this._resolveUserAvatarUrl(userId);
        this._toastEngine.showCardToast({
          avatarUrl: avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png",
          accentColor: accent,
          header: `[${rankLabel}] ${shadowName} reports${friendSuffix}`,
          body: `${userName || "Unknown"} ${previousLabel} -> ${nextLabel}`,
          timeout: STATUS_TOAST_TIMEOUT_MS,
          callerId: "shadowSenses"
        });
      } else {
        BdApi.UI.showToast(`[${rankLabel}] ${shadowName}: ${userName} ${previousLabel} -> ${nextLabel}`, { type: "info" });
      }
    }
    function showMentionToast({ userId, userName, label, detail, accent, deployment }) {
      if (this._toastEngine) {
        const avatarUrl = this._resolveUserAvatarUrl(userId) || "https://cdn.discordapp.com/embed/avatars/0.png";
        this._toastEngine.showCardToast({
          avatarUrl,
          accentColor: accent,
          header: `[${(deployment == null ? void 0 : deployment.shadowRank) || "E"}] ${(deployment == null ? void 0 : deployment.shadowName) || "Shadow"}`,
          body: `${userName} ${label}`,
          detail: detail || void 0,
          timeout: STATUS_TOAST_TIMEOUT_MS,
          callerId: "shadowSenses"
        });
      } else {
        BdApi.UI.showToast(`${userName} ${label}`, { type: "info" });
      }
    }
    function seedTrackedStatuses() {
      const presenceStore = this._resolvePresenceStore();
      this._statusByUserId.clear();
      if (!presenceStore || typeof presenceStore.getStatus !== "function") return;
      const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
      for (const userId of monitoredIds) {
        try {
          const status = this._normalizeStatus(presenceStore.getStatus(userId));
          this._statusByUserId.set(userId, status);
        } catch (_) {
        }
      }
    }
    function getTypingCooldownMs() {
      var _a;
      const ms = Number((_a = this._plugin.settings) == null ? void 0 : _a.typingAlertCooldownMs);
      if (!Number.isFinite(ms)) return DEFAULT_TYPING_ALERT_COOLDOWN_MS;
      return Math.min(6e4, Math.max(3e3, Math.floor(ms)));
    }
    function extractPresenceUpdates(payload) {
      var _a, _b, _c, _d;
      if (!payload) return [];
      const updates = [];
      const push = (userId, status) => {
        if (!userId) return;
        updates.push({
          userId: String(userId),
          status: this._normalizeStatus(status)
        });
      };
      if (Array.isArray(payload.updates)) {
        for (const update of payload.updates) {
          if (!update) continue;
          const userId = update.userId || update.user_id || ((_a = update.user) == null ? void 0 : _a.id);
          const status = update.status || ((_b = update.presence) == null ? void 0 : _b.status);
          if (userId) push(userId, status);
        }
      }
      const directUserId = payload.userId || payload.user_id || ((_c = payload.user) == null ? void 0 : _c.id) || payload.id;
      if (directUserId) {
        const directStatus = payload.status || ((_d = payload.presence) == null ? void 0 : _d.status);
        push(directUserId, directStatus);
      }
      return updates;
    }
    module2.exports = {
      _extractPresenceUpdates: extractPresenceUpdates,
      _getFriendIdSet: getFriendIdSet,
      _getStatusLabel: getStatusLabel,
      _getTypingCooldownMs: getTypingCooldownMs,
      _isFriend: isFriend,
      _isOnlineStatus: isOnlineStatus,
      _normalizeStatus: normalizeStatus,
      _resolvePresenceStore: resolvePresenceStore,
      _resolveRelationshipStore: resolveRelationshipStore,
      _resolveUserAvatarUrl: resolveUserAvatarUrl,
      _resolveUserName: resolveUserName,
      _resolveUserStore: resolveUserStore,
      _scheduleDeferredUtilityToast: scheduleDeferredUtilityToast,
      _scheduleStatusToast: scheduleStatusToast,
      _seedTrackedStatuses: seedTrackedStatuses,
      _showMentionToast: showMentionToast,
      _showStatusToast: showStatusToast,
      _snapshotFriendRelationships: snapshotFriendRelationships,
      _toast: toast,
      extractPresenceUpdates,
      getFriendIdSet,
      getStatusLabel,
      getTypingCooldownMs,
      isFriend,
      isOnlineStatus,
      normalizeStatus,
      resolvePresenceStore,
      resolveRelationshipStore,
      resolveUserAvatarUrl,
      resolveUserName,
      resolveUserStore,
      scheduleDeferredUtilityToast,
      scheduleStatusToast,
      seedTrackedStatuses,
      showMentionToast,
      showStatusToast,
      snapshotFriendRelationships,
      toast
    };
  }
});

// src/ShadowSenses/index.js
var {
  DEFAULT_SETTINGS,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  PRESENCE_EVENT_NAMES,
  PURGE_INTERVAL_MS,
  RELATIONSHIP_EVENT_NAMES,
  TRANSITION_ID,
  WIDGET_SPACER_ID
} = require_constants();
var { DeploymentManager } = require_deployment_manager();
var { buildComponents } = require_components();
var ShadowSensesUiMethods = require_plugin_ui_methods();
var SensesEngineFeed = require_senses_engine_feed();
var SensesEngineEvents = require_senses_engine_events();
var SensesEngineUtils = require_senses_engine_utils();
var { _TransitionCleanupUtils } = require_shared_utils();
var { createToast } = require_toast();
var _fallbackToast = createToast();
var SensesEngine = class {
  constructor(pluginRef) {
    this._plugin = pluginRef;
    this._guildFeeds = {};
    this._lastSeenCount = {};
    this._currentGuildId = null;
    this._sessionMessageCount = 0;
    this._totalDetections = 0;
    this._dirty = false;
    this._dirtyGuilds = /* @__PURE__ */ new Set();
    this._flushInterval = null;
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;
    this._handlePresenceUpdate = null;
    this._handleTypingStart = null;
    this._handleRelationshipChange = null;
    this._subscribedEventHandlers = /* @__PURE__ */ new Map();
    this._totalFeedEntries = 0;
    this._feedVersion = 0;
    this._burstMap = /* @__PURE__ */ new Map();
    this._userLastActivity = /* @__PURE__ */ new Map();
    this._USER_ACTIVITY_MAX = 1e3;
    this._AFK_THRESHOLD_MS = 2 * 60 * 60 * 1e3;
    this._subscribeTime = 0;
    this._statusByUserId = /* @__PURE__ */ new Map();
    this._relationshipFriendIds = /* @__PURE__ */ new Set();
    this._typingToastCooldown = /* @__PURE__ */ new Map();
    this._deferredStatusToastTimers = /* @__PURE__ */ new Set();
    this._deferredUtilityToastTimers = /* @__PURE__ */ new Set();
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
      this._guildFeeds = BdApi.Data.load(PLUGIN_NAME, "guildFeeds") || {};
    }
    this._totalDetections = BdApi.Data.load(PLUGIN_NAME, "totalDetections") || 0;
    for (const guildId of Object.keys(this._guildFeeds)) {
      this._lastSeenCount[guildId] = this._guildFeeds[guildId].length;
      this._totalFeedEntries += this._guildFeeds[guildId].length;
    }
    this._purgeOldEntries();
    this._purgeUtilityEntries();
    if (this._dirty) this._flushToDisk();
    this._plugin.debugLog("SensesEngine", "Loaded persisted feeds", {
      guilds: Object.keys(this._guildFeeds).length,
      totalEntries: this._totalFeedEntries
    });
  }
  subscribe() {
    const Dispatcher = this._plugin._Dispatcher;
    if (!Dispatcher) {
      this._plugin.debugError("SensesEngine", "Dispatcher not available, cannot subscribe");
      return;
    }
    this._toastEngine = (() => {
      try {
        const p = BdApi.Plugins.get("SoloLevelingToasts");
        const inst = p == null ? void 0 : p.instance;
        return (inst == null ? void 0 : inst.toastEngineVersion) >= 2 ? inst : null;
      } catch {
        return null;
      }
    })();
    this._plugin.debugLog("SensesEngine", `Toast engine: ${this._toastEngine ? "v2 connected" : "fallback mode"}`);
    try {
      this._currentGuildId = this._plugin._SelectedGuildStore ? this._plugin._SelectedGuildStore.getGuildId() : null;
    } catch (err) {
      this._plugin.debugError("SensesEngine", "Failed to get initial guild ID", err);
    }
    this._plugin._debugMode && console.log(`[ShadowSenses] subscribe: _currentGuildId=${this._currentGuildId}`);
    if (this._currentGuildId && this._guildFeeds[this._currentGuildId]) {
      this._lastSeenCount[this._currentGuildId] = this._guildFeeds[this._currentGuildId].length;
    }
    this._handleMessageCreate = this._onMessageCreate.bind(this);
    this._handleChannelSelect = this._onChannelSelect.bind(this);
    this._handlePresenceUpdate = this._onPresenceUpdate.bind(this);
    this._handleTypingStart = this._onTypingStart.bind(this);
    this._handleRelationshipChange = this._onRelationshipChange.bind(this);
    this._subscribeEvent("MESSAGE_CREATE", this._handleMessageCreate);
    this._subscribeEvent("CHANNEL_SELECT", this._handleChannelSelect);
    this._subscribeEvent("TYPING_START", this._handleTypingStart);
    for (const eventName of PRESENCE_EVENT_NAMES) {
      this._subscribeEvent(eventName, this._handlePresenceUpdate);
    }
    for (const eventName of RELATIONSHIP_EVENT_NAMES) {
      this._subscribeEvent(eventName, this._handleRelationshipChange);
    }
    this._subscribeTime = Date.now();
    this._seedTrackedStatuses();
    this._snapshotFriendRelationships();
    this._flushInterval = setInterval(() => {
      if (!this._dirty) return;
      this._flushToDisk();
    }, 3e4);
    this._purgeInterval = setInterval(() => this._purgeOldEntries(), PURGE_INTERVAL_MS);
    this._plugin.debugLog("SensesEngine", "Subscribed to dispatcher events", {
      currentGuildId: this._currentGuildId,
      events: Array.from(this._subscribedEventHandlers.keys())
    });
  }
  unsubscribe() {
    var _a;
    const Dispatcher = this._plugin._Dispatcher;
    if (!Dispatcher) return;
    for (const [eventName, handlers] of this._subscribedEventHandlers.entries()) {
      for (const handler of handlers) {
        try {
          Dispatcher.unsubscribe(eventName, handler);
        } catch (err) {
          this._plugin.debugError("SensesEngine", `Failed to unsubscribe ${eventName}`, err);
        }
      }
    }
    this._subscribedEventHandlers.clear();
    (_a = this._burstMap) == null ? void 0 : _a.clear();
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;
    this._handlePresenceUpdate = null;
    this._handleTypingStart = null;
    this._handleRelationshipChange = null;
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
    this._typingToastCooldown.clear();
    this._statusByUserId.clear();
    this._relationshipFriendIds.clear();
    for (const timer of this._deferredStatusToastTimers) clearTimeout(timer);
    this._deferredStatusToastTimers.clear();
    for (const timer of this._deferredUtilityToastTimers) clearTimeout(timer);
    this._deferredUtilityToastTimers.clear();
    this._plugin.debugLog("SensesEngine", "Unsubscribed from all events");
  }
  _subscribeEvent(eventName, handler) {
    const Dispatcher = this._plugin._Dispatcher;
    if (!Dispatcher || !eventName || typeof handler !== "function") return false;
    const existing = this._subscribedEventHandlers.get(eventName);
    if (existing == null ? void 0 : existing.has(handler)) {
      this._plugin.debugLog("SensesEngine", `Duplicate subscribe ignored for ${eventName}`);
      return true;
    }
    try {
      Dispatcher.subscribe(eventName, handler);
      if (existing) {
        existing.add(handler);
      } else {
        this._subscribedEventHandlers.set(eventName, /* @__PURE__ */ new Set([handler]));
      }
      return true;
    } catch (err) {
      this._plugin.debugError("SensesEngine", `Failed to subscribe ${eventName}`, err);
      return false;
    }
  }
  // Feed/utils/event handler methods are mixed in from dedicated modules.
  _clearDispatcherSubscriptions() {
    var _a;
    const Dispatcher = this._plugin._Dispatcher;
    if (!(Dispatcher && ((_a = this._subscribedEventHandlers) == null ? void 0 : _a.size) > 0)) return;
    for (const [eventName, handlers] of this._subscribedEventHandlers.entries()) {
      for (const handler of handlers) {
        try {
          Dispatcher.unsubscribe(eventName, handler);
        } catch (_) {
        }
      }
    }
    this._subscribedEventHandlers.clear();
  }
  _clearDeferredToastTimers() {
    if (this._deferredStatusToastTimers instanceof Set) {
      for (const timer of this._deferredStatusToastTimers) clearTimeout(timer);
    }
    if (this._deferredUtilityToastTimers instanceof Set) {
      for (const timer of this._deferredUtilityToastTimers) clearTimeout(timer);
    }
  }
  _resetRuntimeState() {
    this._guildFeeds = {};
    this._lastSeenCount = {};
    this._burstMap = /* @__PURE__ */ new Map();
    this._currentGuildId = null;
    this._sessionMessageCount = 0;
    this._handleMessageCreate = null;
    this._handleChannelSelect = null;
    this._handlePresenceUpdate = null;
    this._handleTypingStart = null;
    this._handleRelationshipChange = null;
    this._subscribedEventHandlers = /* @__PURE__ */ new Map();
    this._dirty = false;
    this._dirtyGuilds = /* @__PURE__ */ new Set();
    this._totalFeedEntries = 0;
    this._feedVersion = 0;
    this._statusByUserId = /* @__PURE__ */ new Map();
    this._typingToastCooldown = /* @__PURE__ */ new Map();
    this._relationshipFriendIds = /* @__PURE__ */ new Set();
    this._deferredStatusToastTimers = /* @__PURE__ */ new Set();
    this._deferredUtilityToastTimers = /* @__PURE__ */ new Set();
  }
  clear() {
    this._clearDispatcherSubscriptions();
    this._clearDeferredToastTimers();
    this._resetRuntimeState();
  }
};
Object.assign(
  SensesEngine.prototype,
  SensesEngineUtils,
  SensesEngineFeed,
  SensesEngineEvents
);
module.exports = class ShadowSenses {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._transitionNavTimeout = null;
    this._transitionCleanupTimeout = null;
    this._transitionRunId = 0;
    this._transitionStopCanvas = null;
    this._navigateRetryTimers = /* @__PURE__ */ new Set();
    this._navigateRequestId = 0;
    this._channelFadeToken = 0;
    this._channelFadeResetTimer = null;
  }
  start() {
    try {
      this._debugMode = BdApi.Data.load(PLUGIN_NAME, "debugMode") ?? false;
      if (this._debugMode) {
        console.log(`[${PLUGIN_NAME}] Starting v${PLUGIN_VERSION}...`);
      }
      this.loadSettings();
      this._stopped = false;
      this._widgetDirty = true;
      this._panelOpen = false;
      this._transitionNavTimeout = null;
      this._transitionCleanupTimeout = null;
      this._transitionRunId = 0;
      this._transitionStopCanvas = null;
      this._navigateRetryTimers = /* @__PURE__ */ new Set();
      this._navigateRequestId = 0;
      this._channelFadeToken = 0;
      this._channelFadeResetTimer = null;
      this.deploymentManager = new DeploymentManager(
        (...args) => this.debugLog(...args),
        (...args) => this.debugError(...args)
      );
      this.deploymentManager.load();
      this.initWebpack();
      this.sensesEngine = new SensesEngine(this);
      if (this._Dispatcher) {
        this.sensesEngine.subscribe();
      } else {
        this._startDispatcherWait();
      }
      this.injectCSS();
      this._components = buildComponents(this);
      this.injectWidget();
      this.setupWidgetObserver();
      this.registerEscHandler();
      this.patchContextMenu();
      this.debugLog("Lifecycle", "Started successfully");
      this._toast(`${PLUGIN_NAME} v${PLUGIN_VERSION} \u2014 Shadow deployment online`);
    } catch (err) {
      console.error(`[${PLUGIN_NAME}] FATAL: start() crashed:`, err);
      this._toast(`${PLUGIN_NAME} failed to start: ${err.message}`, "error");
    }
  }
  stop() {
    var _a, _b, _c, _d, _e;
    try {
      this._stopped = true;
      if (this._dispatcherRetryTimer) {
        clearTimeout(this._dispatcherRetryTimer);
        this._dispatcherRetryTimer = null;
      }
      if (this.sensesEngine) {
        this.sensesEngine.unsubscribe();
        this.sensesEngine = null;
      }
      if (this._unpatchContextMenu) {
        try {
          this._unpatchContextMenu();
        } catch (_) {
          (_a = this.debugLog) == null ? void 0 : _a.call(this, "CLEANUP", "Context menu unpatch error", _);
        }
        this._unpatchContextMenu = null;
      }
      this.closePanel();
      if (this._layoutBusUnsub) {
        this._layoutBusUnsub();
        this._layoutBusUnsub = null;
      }
      clearTimeout(this._widgetReinjectTimeout);
      this._widgetReinjectTimeout = null;
      this.removeWidget();
      try {
        const spacer = document.getElementById(WIDGET_SPACER_ID);
        if (spacer) spacer.remove();
      } catch (_) {
        (_b = this.debugLog) == null ? void 0 : _b.call(this, "CLEANUP", "Spacer cleanup error", _);
      }
      if (this._escHandler) {
        document.removeEventListener("keydown", this._escHandler);
        this._escHandler = null;
      }
      (_c = _TransitionCleanupUtils == null ? void 0 : _TransitionCleanupUtils.cancelPendingTransition) == null ? void 0 : _c.call(_TransitionCleanupUtils, this);
      (_d = _TransitionCleanupUtils == null ? void 0 : _TransitionCleanupUtils.clearNavigateRetries) == null ? void 0 : _d.call(_TransitionCleanupUtils, this);
      (_e = _TransitionCleanupUtils == null ? void 0 : _TransitionCleanupUtils.cancelChannelViewFade) == null ? void 0 : _e.call(_TransitionCleanupUtils, this);
      this.removeCSS();
      this._components = null;
      this.deploymentManager = null;
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    this._toast(`${PLUGIN_NAME} \u2014 Shadows recalled`);
  }
  _toast(message, type = "info", timeout = null) {
    var _a;
    const engine = (_a = this.sensesEngine) == null ? void 0 : _a._toastEngine;
    if (engine) {
      engine.showToast(message, type, timeout, { callerId: "shadowSenses" });
    } else {
      _fallbackToast(message, type);
    }
  }
  loadSettings() {
    try {
      const saved = BdApi.Data.load(PLUGIN_NAME, "settings");
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...saved && typeof saved === "object" ? saved : {}
      };
    } catch (err) {
      this.debugError("Settings", "Failed to load settings; using defaults", err);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }
  saveSettings() {
    try {
      BdApi.Data.save(PLUGIN_NAME, "settings", this.settings);
    } catch (err) {
      this.debugError("Settings", "Failed to save settings", err);
    }
  }
  initWebpack() {
    var _a, _b;
    const { Webpack } = BdApi;
    this._Dispatcher = ((_b = (_a = Webpack.Stores) == null ? void 0 : _a.UserStore) == null ? void 0 : _b._dispatcher) || Webpack.getModule((m) => m.dispatch && m.subscribe) || Webpack.getByKeys("actionLogger") || null;
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._GuildStore = Webpack.getStore("GuildStore");
    this._UserStore = Webpack.getStore("UserStore");
    this._PresenceStore = Webpack.getStore("PresenceStore");
    this._RelationshipStore = Webpack.getStore("RelationshipStore");
    this._GuildMemberStore = Webpack.getStore("GuildMemberStore");
    this._NavigationUtils = Webpack.getByKeys("transitionTo", "back", "forward") || Webpack.getModule((m) => m.transitionTo && m.back && m.forward);
    this.debugLog("Webpack", "Modules acquired (sync)", {
      Dispatcher: !!this._Dispatcher,
      ChannelStore: !!this._ChannelStore,
      SelectedGuildStore: !!this._SelectedGuildStore,
      GuildStore: !!this._GuildStore,
      UserStore: !!this._UserStore,
      PresenceStore: !!this._PresenceStore,
      RelationshipStore: !!this._RelationshipStore,
      GuildMemberStore: !!this._GuildMemberStore,
      NavigationUtils: !!this._NavigationUtils
    });
  }
  /**
   * Resolve a guild's display name from its ID.
   * @param {string} guildId
   * @returns {string} Guild name or truncated ID fallback
   */
  _getGuildName(guildId) {
    var _a;
    try {
      const guild = (_a = this._GuildStore) == null ? void 0 : _a.getGuild(guildId);
      return (guild == null ? void 0 : guild.name) || (guildId == null ? void 0 : guildId.slice(-6)) || "Unknown";
    } catch (_) {
      return (guildId == null ? void 0 : guildId.slice(-6)) || "Unknown";
    }
  }
  _startDispatcherWait() {
    let attempt = 0;
    const maxAttempts = 30;
    const tryAcquire = () => {
      var _a, _b;
      if (this._stopped) return;
      attempt++;
      this._Dispatcher = ((_b = (_a = BdApi.Webpack.Stores) == null ? void 0 : _a.UserStore) == null ? void 0 : _b._dispatcher) || BdApi.Webpack.getModule((m) => m.dispatch && m.subscribe) || BdApi.Webpack.getByKeys("actionLogger") || null;
      if (this._Dispatcher) {
        this.debugLog("Webpack", `Dispatcher acquired on poll #${attempt} (${attempt * 500}ms)`);
        this.initWebpack();
        if (this.sensesEngine) this.sensesEngine.subscribe();
        return;
      }
      if (attempt >= maxAttempts) {
        console.error(`[${PLUGIN_NAME}] Dispatcher unavailable after ${maxAttempts} polls (~15s) \u2014 message detection will NOT work`);
        this._toast(`${PLUGIN_NAME}: Dispatcher not found \u2014 message detection disabled`, "error");
        return;
      }
      this._dispatcherRetryTimer = setTimeout(tryAcquire, 500);
    };
    this._dispatcherRetryTimer = setTimeout(tryAcquire, 500);
  }
  teleportToPath(path, context = {}) {
    var _a, _b;
    const targetPath = this._normalizePath(path);
    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      _ensureShadowPortalCoreApplied(this.constructor);
    }
    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      this.debugError("Teleport", "Shared portal core missing; using direct navigation fallback");
      if ((_a = this._NavigationUtils) == null ? void 0 : _a.transitionTo) {
        this._NavigationUtils.transitionTo(targetPath);
      } else if ((_b = window.history) == null ? void 0 : _b.pushState) {
        window.history.pushState({}, "", targetPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      this._toast("Shadow Senses navigation fallback used", "warning");
      return;
    }
    this.playTransition(() => {
      const fadeToken = this._beginChannelViewFadeOut();
      this._navigate(targetPath, context, {
        onConfirmed: () => this._finishChannelViewFade(fadeToken, true),
        onFailed: () => this._finishChannelViewFade(fadeToken, false)
      });
    }, targetPath);
  }
  // UI/widget/panel/settings methods are mixed in from plugin-ui-methods.js
};
Object.assign(module.exports.prototype, ShadowSensesUiMethods);
var _getShadowPortalCoreCandidates = (path) => {
  var _a;
  const candidates = [];
  if (((_a = BdApi == null ? void 0 : BdApi.Plugins) == null ? void 0 : _a.folder) && typeof BdApi.Plugins.folder === "string") {
    candidates.push(path.join(BdApi.Plugins.folder, "ShadowPortalCore.js"));
  }
  candidates.push("./ShadowPortalCore.js");
  return candidates;
};
var _tryLoadShadowPortalCoreViaRequire = (candidate) => {
  try {
    const resolved = require.resolve(candidate);
    if (require.cache[resolved]) delete require.cache[resolved];
    const mod = require(resolved);
    return (mod == null ? void 0 : mod.applyPortalCoreToClass) ? mod : null;
  } catch (_) {
    return null;
  }
};
var _resolveShadowPortalAbsolutePath = (path, candidate) => {
  var _a;
  if (path.isAbsolute(candidate)) return candidate;
  const pluginsFolder = ((_a = BdApi == null ? void 0 : BdApi.Plugins) == null ? void 0 : _a.folder) || "";
  return path.join(pluginsFolder, candidate.replace(/^\.\//, ""));
};
var _tryLoadShadowPortalCoreViaFactory = (path, fs, candidate) => {
  try {
    const absolute = _resolveShadowPortalAbsolutePath(path, candidate);
    if (!absolute || !fs.existsSync(absolute)) return null;
    const source = fs.readFileSync(absolute, "utf8");
    const moduleObj = { exports: {} };
    const factory = new Function(
      "module",
      "exports",
      "require",
      "window",
      "BdApi",
      `${source}
return module.exports || exports || (window && window.ShadowPortalCore) || null;`
    );
    const loaded = factory(
      moduleObj,
      moduleObj.exports,
      require,
      typeof window !== "undefined" ? window : null,
      BdApi
    );
    const mod = loaded || moduleObj.exports || (typeof window !== "undefined" ? window.ShadowPortalCore : null);
    return (mod == null ? void 0 : mod.applyPortalCoreToClass) ? mod : null;
  } catch (_) {
    return null;
  }
};
var _loadShadowPortalCore = () => {
  try {
    const path = require("path");
    const fs = require("fs");
    const candidates = _getShadowPortalCoreCandidates(path);
    for (const candidate of candidates) {
      const fromRequire = _tryLoadShadowPortalCoreViaRequire(candidate);
      if (fromRequire) return fromRequire;
      const fromFactory = _tryLoadShadowPortalCoreViaFactory(path, fs, candidate);
      if (fromFactory) return fromFactory;
    }
  } catch (_) {
  }
  return typeof window !== "undefined" ? window.ShadowPortalCore || null : null;
};
var SHADOW_PORTAL_CONFIG = {
  transitionId: TRANSITION_ID,
  navigationFailureToast: "Shadow Senses failed to switch channel",
  contextLabelKeys: ["anchorName", "targetUsername", "targetName", "label", "name"]
};
var _ensureShadowPortalCoreApplied = (PluginClass = module.exports) => {
  const core = _loadShadowPortalCore();
  if (!(core == null ? void 0 : core.applyPortalCoreToClass)) return false;
  core.applyPortalCoreToClass(PluginClass, SHADOW_PORTAL_CONFIG);
  return true;
};
if (!_ensureShadowPortalCoreApplied(module.exports)) {
  const warnOnceKey = "__shadowSensesPortalCoreWarned";
  if (typeof window !== "undefined" && !window[warnOnceKey]) {
    window[warnOnceKey] = true;
    console.warn(`[${PLUGIN_NAME}] Shared portal core unavailable. Navigation/transition patch will not be shared.`);
  }
}
