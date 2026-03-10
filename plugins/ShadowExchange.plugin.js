/**
 * @name ShadowExchange
 * @description Shadow waypoint bookmark system — station shadows at Discord locations and teleport to them instantly. Solo Leveling themed.
 * @version 2.1.1
 * @author matthewthompson
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/ShadowExchange/panel-components.js
var require_panel_components = __commonJS({
  "src/ShadowExchange/panel-components.js"(exports2, module2) {
    var _a;
    var RANK_ORDER = ((_a = window.SoloLevelingUtils) == null ? void 0 : _a.RANKS) || [
      "E",
      "D",
      "C",
      "B",
      "A",
      "S",
      "SS",
      "SSS",
      "SSS+",
      "NH",
      "Monarch",
      "Monarch+",
      "Shadow Monarch"
    ];
    var RANK_COLORS = {
      E: "#808080",
      D: "#8B4513",
      C: "#FF6347",
      B: "#FFD700",
      A: "#00CED1",
      S: "#FF69B4",
      SS: "#9b59b6",
      SSS: "#e74c3c",
      "SSS+": "#f39c12",
      NH: "#1abc9c",
      Monarch: "#e91e63",
      "Monarch+": "#ff5722",
      "Shadow Monarch": "#7c4dff"
    };
    function formatTimestamp(ts) {
      try {
        const d = new Date(ts);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      } catch (_) {
        return "";
      }
    }
    function getTypeBadge(locationType) {
      if (locationType === "dm") return "DM";
      if (locationType === "thread") return "Thread";
      if (locationType === "message") return "Msg";
      return "Channel";
    }
    function buildLocationLabel(wp) {
      return wp.guildName ? `${wp.guildName} \xBB #${wp.channelName}` : `DM \xBB ${wp.channelName}`;
    }
    function hasMessageLookupTarget(wp) {
      return Boolean(wp.messageId && wp.channelId);
    }
    function getCachedMessagePreviewText(cached) {
      var _a2, _b;
      if (!cached) return "";
      if (cached.content) {
        return cached.content.length > 120 ? `${cached.content.slice(0, 120)}\u2026` : cached.content;
      }
      if (Array.isArray(cached.embeds) && cached.embeds.length > 0) return "[Embed]";
      const attachmentCount = Number(((_a2 = cached.attachments) == null ? void 0 : _a2.size) || ((_b = cached.attachments) == null ? void 0 : _b.length) || 0);
      if (attachmentCount > 0) return "[Attachment]";
      return "";
    }
    function getCachedMessageAuthor(cached) {
      if (!(cached == null ? void 0 : cached.author)) return "";
      return cached.author.globalName || cached.author.username || "";
    }
    function resolveMessagePreviewData(pluginInstance, wp) {
      var _a2;
      let preview = wp.messagePreview || "";
      let author = wp.messageAuthor || "";
      if (preview || !hasMessageLookupTarget(wp)) return { preview, author };
      try {
        const cached = (_a2 = pluginInstance.MessageStore) == null ? void 0 : _a2.getMessage(wp.channelId, wp.messageId);
        if (!cached) return { preview, author };
        const nextPreview = getCachedMessagePreviewText(cached);
        if (nextPreview) {
          preview = nextPreview;
          wp.messagePreview = nextPreview;
        }
        if (!author) {
          const nextAuthor = getCachedMessageAuthor(cached);
          if (nextAuthor) {
            author = nextAuthor;
            wp.messageAuthor = nextAuthor;
          }
        }
      } catch (error) {
        pluginInstance.debugError("Panel", "Failed to parse message metadata for preview", error);
      }
      return { preview, author };
    }
    function buildWaypointMessageSection(React, pluginInstance, wp) {
      if (wp.locationType !== "message") return null;
      const ce = React.createElement;
      const { preview, author } = resolveMessagePreviewData(pluginInstance, wp);
      return ce(
        "div",
        { className: "se-message-preview" },
        author ? ce("span", { className: "se-msg-author" }, `${author}:`) : null,
        ce(
          "span",
          { className: "se-msg-text" },
          preview || ce("em", { style: { color: "#666" } }, "Navigate to load preview")
        )
      );
    }
    function getFilteredSortedWaypoints(waypoints, searchQuery, sortBy) {
      let filtered = [...waypoints];
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (w) => (w.label || "").toLowerCase().includes(q) || (w.shadowName || "").toLowerCase().includes(q) || (w.channelName || "").toLowerCase().includes(q) || (w.guildName || "").toLowerCase().includes(q) || (w.messagePreview || "").toLowerCase().includes(q) || (w.messageAuthor || "").toLowerCase().includes(q)
        );
      }
      if (sortBy === "created") filtered.sort((a, b) => b.createdAt - a.createdAt);
      else if (sortBy === "visited") filtered.sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0));
      else if (sortBy === "name") filtered.sort((a, b) => a.label.localeCompare(b.label));
      else if (sortBy === "rank") {
        filtered.sort((a, b) => RANK_ORDER.indexOf(b.shadowRank) - RANK_ORDER.indexOf(a.shadowRank));
      }
      return filtered;
    }
    function createWaypointCard(React, pluginInstance) {
      const ce = React.createElement;
      return React.memo(function WaypointCard({ wp, onTeleport, onRemove }) {
        const rankColor = RANK_COLORS[wp.shadowRank] || "#808080";
        const typeBadge = getTypeBadge(wp.locationType);
        const visits = wp.visitCount || 0;
        const timeStr = formatTimestamp(wp.createdAt);
        const fullLocation = buildLocationLabel(wp);
        const messageSection = buildWaypointMessageSection(React, pluginInstance, wp);
        return ce(
          "div",
          {
            className: "se-waypoint-card",
            style: { borderLeftColor: rankColor }
          },
          ce(
            "div",
            { className: "se-card-top" },
            ce("span", { className: "se-shadow-rank", style: { background: rankColor } }, wp.shadowRank),
            ce("span", { className: "se-shadow-name" }, wp.shadowName),
            ce("button", {
              className: "se-card-remove",
              title: "Recall shadow",
              onClick: (e) => {
                e.stopPropagation();
                onRemove(wp.id);
              }
            }, "\u2716")
          ),
          ce(
            "div",
            { className: "se-card-body" },
            ce("div", { className: "se-location-label" }, fullLocation),
            messageSection,
            ce(
              "div",
              { className: "se-location-meta" },
              ce("span", { className: "se-type-badge" }, typeBadge),
              ce("span", { className: "se-visit-count" }, `${visits} visit${visits !== 1 ? "s" : ""}`),
              ce("span", { className: "se-created-time" }, timeStr)
            )
          ),
          ce(
            "div",
            { className: "se-card-footer" },
            ce("button", {
              className: "se-teleport-btn",
              onClick: () => onTeleport(wp.id)
            }, "Teleport")
          )
        );
      });
    }
    function buildWaypointListContent(React, options) {
      const {
        WaypointCard,
        waypoints,
        searchQuery,
        handleTeleport,
        handleRemove
      } = options;
      const ce = React.createElement;
      if (waypoints.length === 0) {
        return ce(
          "div",
          { className: "se-empty-state" },
          ce("div", { className: "se-empty-icon" }, "\u2693"),
          ce(
            "div",
            { className: "se-empty-text" },
            searchQuery ? "No waypoints match your search" : "No waypoints yet"
          ),
          ce(
            "div",
            { className: "se-empty-hint" },
            searchQuery ? "Try a different search" : 'Click "Mark Current Location" to station a shadow'
          )
        );
      }
      return waypoints.map(
        (wp) => ce(WaypointCard, {
          key: wp.id,
          wp,
          onTeleport: handleTeleport,
          onRemove: handleRemove
        })
      );
    }
    function createWaypointPanel(React, pluginInstance, WaypointCard) {
      const ce = React.createElement;
      return function WaypointPanel({ onClose }) {
        const [searchInput, setSearchInput] = React.useState("");
        const [searchQuery, setSearchQuery] = React.useState("");
        const searchTimerRef = React.useRef(null);
        const [sortBy, setSortBy] = React.useState(pluginInstance.settings.sortBy || "created");
        const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
        const [availCount, setAvailCount] = React.useState(0);
        const handleSearchChange = React.useCallback((e) => {
          const val = e.target.value;
          setSearchInput(val);
          if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
          searchTimerRef.current = setTimeout(() => setSearchQuery(val), 150);
        }, []);
        React.useEffect(() => () => clearTimeout(searchTimerRef.current), []);
        React.useEffect(() => {
          let cancelled = false;
          pluginInstance.getAvailableShadowCount().then((count) => {
            if (!cancelled) setAvailCount(count);
          });
          return () => {
            cancelled = true;
          };
        }, []);
        React.useEffect(() => {
          pluginInstance._panelForceUpdate = forceUpdate;
          return () => {
            pluginInstance._panelForceUpdate = null;
          };
        }, [forceUpdate]);
        React.useEffect(() => {
          const handler = (e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          };
          document.addEventListener("keydown", handler, true);
          return () => document.removeEventListener("keydown", handler, true);
        }, [onClose]);
        React.useEffect(() => {
          const timer = setTimeout(() => pluginInstance.saveSettings(), 500);
          return () => clearTimeout(timer);
        }, []);
        const waypoints = React.useMemo(
          () => getFilteredSortedWaypoints(pluginInstance.settings.waypoints, searchQuery, sortBy),
          [searchQuery, sortBy, pluginInstance.settings.waypoints.length]
        );
        const handleSortChange = React.useCallback((e) => {
          const val = e.target.value;
          setSortBy(val);
          pluginInstance.settings.sortBy = val;
          pluginInstance.saveSettings();
        }, []);
        const handleMark = React.useCallback(() => {
          pluginInstance.markCurrentLocation();
        }, []);
        const handleTeleport = React.useCallback((wpId) => {
          pluginInstance.teleportTo(wpId);
        }, []);
        const handleRemove = React.useCallback((wpId) => {
          pluginInstance.removeWaypoint(wpId);
        }, []);
        const handleOverlayClick = React.useCallback((e) => {
          if (e.target.classList.contains("se-panel-overlay")) onClose();
        }, [onClose]);
        const totalWaypoints = pluginInstance.settings.waypoints.length;
        const listContent = buildWaypointListContent(React, {
          WaypointCard,
          waypoints,
          searchQuery,
          handleTeleport,
          handleRemove
        });
        return ce(
          "div",
          { className: "se-panel-overlay", onClick: handleOverlayClick },
          ce(
            "div",
            { className: "se-panel-container" },
            ce(
              "div",
              { className: "se-panel-header" },
              ce("h2", { className: "se-panel-title" }, "Shadow Exchange"),
              ce(
                "div",
                { className: "se-header-actions" },
                ce("button", { className: "se-mark-btn", onClick: handleMark }, "Mark Current Location"),
                ce("button", { className: "se-close-btn", onClick: onClose }, "\xD7")
              )
            ),
            ce(
              "div",
              { className: "se-panel-controls" },
              ce(
                "select",
                {
                  className: "se-sort-select",
                  value: sortBy,
                  onChange: handleSortChange
                },
                ce("option", { value: "created" }, "Newest First"),
                ce("option", { value: "visited" }, "Recently Visited"),
                ce("option", { value: "name" }, "Name"),
                ce("option", { value: "rank" }, "Shadow Rank")
              ),
              ce("input", {
                type: "text",
                className: "se-search-input",
                placeholder: "Search waypoints...",
                value: searchInput,
                onChange: handleSearchChange
              })
            ),
            ce("div", { className: "se-waypoint-list" }, listContent),
            ce(
              "div",
              { className: "se-panel-footer" },
              ce(
                "span",
                { className: "se-wp-count" },
                `${totalWaypoints} waypoint${totalWaypoints !== 1 ? "s" : ""}`
              ),
              ce(
                "span",
                { className: "se-shadow-avail" },
                `${availCount} shadow${availCount !== 1 ? "s" : ""} available`
              )
            )
          )
        );
      };
    }
    function buildPanelComponents2(BdApi2, pluginInstance) {
      const React = BdApi2.React;
      const WaypointCard = createWaypointCard(React, pluginInstance);
      const WaypointPanel = createWaypointPanel(React, pluginInstance, WaypointCard);
      return { WaypointPanel, WaypointCard };
    }
    module2.exports = {
      buildPanelComponents: buildPanelComponents2
    };
  }
});

// src/ShadowExchange/styles.js
var require_styles = __commonJS({
  "src/ShadowExchange/styles.js"(exports2, module2) {
    function getShadowExchangeCss2(portalTransitionCss) {
      return `
${portalTransitionCss}

      /* \u2500\u2500 Swirl Icon (anchored in channel-header toolbar) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .se-swirl-icon {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        margin-left: 4px;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        border: none;
        background: transparent;
        cursor: pointer;
        opacity: 0.8;
        transition: opacity 0.15s ease, background 0.15s ease;
        pointer-events: auto;
      }
      .se-swirl-icon--hidden {
        display: none !important;
      }
      .se-swirl-icon:hover {
        opacity: 1;
      }
      .se-swirl-icon:hover svg {
        filter: drop-shadow(0 0 4px rgba(200, 170, 255, 0.7));
      }

      /* \u2500\u2500 Shared Toolbar Tooltip \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .sl-toolbar-tip {
        position: fixed;
        transform: translateX(-50%);
        padding: 8px 12px;
        background: rgb(10, 10, 15);
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 4px;
        box-shadow: 0 2px 12px rgba(138, 43, 226, 0.25), 0 0 20px rgba(138, 43, 226, 0.08);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.3px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.1s ease;
        z-index: 999999;
      }
      .sl-toolbar-tip--visible {
        opacity: 1;
      }
      .sl-toolbar-tip::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: rgba(138, 43, 226, 0.4);
      }

      /* \u2500\u2500 Panel Overlay \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .se-panel-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(5px);
        z-index: 100001;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: se-fade-in 0.25s ease;
      }
      @keyframes se-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* \u2500\u2500 Panel Container \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .se-panel-container {
        width: 650px;
        max-height: 82vh;
        background: #1e1e2e;
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 2px;
        box-shadow: 0 0 40px rgba(138, 43, 226, 0.2), 0 8px 32px rgba(0, 0, 0, 0.6);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: se-slide-up 0.3s ease;
      }
      @keyframes se-slide-up {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      /* \u2500\u2500 Header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .se-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(138, 43, 226, 0.25);
        background: rgba(0, 0, 0, 0.2);
      }
      .se-panel-title {
        font-size: 16px;
        font-weight: 700;
        color: #a78bfa;
        margin: 0;
        letter-spacing: 0.5px;
      }
      .se-header-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .se-mark-btn {
        background: linear-gradient(135deg, #7c3aed, #8a2be2);
        color: #fff;
        border: none;
        border-radius: 2px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: box-shadow 0.2s ease, transform 0.15s ease;
      }
      .se-mark-btn:hover {
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.5);
        transform: scale(1.03);
      }
      .se-close-btn {
        background: none;
        border: none;
        color: #999;
        font-size: 22px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        transition: color 0.15s ease;
      }
      .se-close-btn:hover {
        color: #fff;
      }

      /* \u2500\u2500 Controls \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .se-panel-controls {
        display: flex;
        gap: 8px;
        padding: 10px 18px;
        border-bottom: 1px solid rgba(138, 43, 226, 0.12);
      }
      .se-sort-select, .se-search-input {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-radius: 2px;
        color: #ddd;
        padding: 6px 10px;
        font-size: 12px;
        outline: none;
        transition: border-color 0.2s ease;
      }
      .se-sort-select:focus, .se-search-input:focus {
        border-color: rgba(138, 43, 226, 0.5);
      }
      .se-search-input {
        flex: 1;
      }
      .se-sort-select {
        width: 140px;
      }
      .se-sort-select option {
        background: #1e1e2e;
        color: #ddd;
      }

      /* \u2500\u2500 Waypoint List \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .se-waypoint-list {
        flex: 1;
        overflow-y: auto;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 120px;
        max-height: 55vh;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      .se-waypoint-list::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }
      .se-waypoint-list::-webkit-scrollbar-track {
        background: transparent !important;
      }
      .se-waypoint-list::-webkit-scrollbar-thumb {
        background: transparent !important;
        border: none !important;
      }

      /* \u2500\u2500 Empty State \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .se-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: #888;
      }
      .se-empty-icon {
        font-size: 32px;
        margin-bottom: 10px;
        opacity: 0.5;
      }
      .se-empty-text {
        font-size: 14px;
        font-weight: 600;
        color: #aaa;
      }
      .se-empty-hint {
        font-size: 12px;
        margin-top: 4px;
        color: #666;
      }

      /* \u2500\u2500 Waypoint Card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .se-waypoint-card {
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(138, 43, 226, 0.12);
        border-left: 3px solid #808080;
        border-radius: 2px;
        padding: 10px 14px;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .se-waypoint-card:hover {
        background: rgba(138, 43, 226, 0.06);
        border-color: rgba(138, 43, 226, 0.25);
      }

      .se-card-top {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .se-shadow-rank {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 2px;
        font-size: 10px;
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.3px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.4);
        flex-shrink: 0;
      }
      .se-shadow-name {
        font-size: 13px;
        font-weight: 600;
        color: #a78bfa;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .se-card-remove {
        background: none;
        border: none;
        color: #666;
        font-size: 12px;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 2px;
        transition: color 0.15s ease, background 0.15s ease;
        flex-shrink: 0;
      }
      .se-card-remove:hover {
        color: #e74c3c;
        background: rgba(231, 76, 60, 0.1);
      }

      .se-card-body {
        margin-bottom: 8px;
      }
      .se-location-label {
        font-size: 13px;
        color: #ddd;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .se-location-meta {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .se-type-badge {
        background: rgba(138, 43, 226, 0.15);
        color: #a78bfa;
        padding: 1px 6px;
        border-radius: 2px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.3px;
      }
      .se-visit-count {
        font-size: 11px;
        color: #777;
      }
      .se-created-time {
        font-size: 10px;
        color: #666;
        margin-left: auto;
      }

      /* \u2500\u2500 Message Preview \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .se-message-preview {
        background: rgba(0, 0, 0, 0.2);
        border-left: 2px solid rgba(138, 43, 226, 0.3);
        border-radius: 0 2px 2px 0;
        padding: 5px 8px;
        margin: 4px 0 6px 0;
        font-size: 12px;
        color: #aaa;
        max-height: 48px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        line-height: 1.4;
      }
      .se-msg-author {
        color: #a78bfa;
        font-weight: 600;
        margin-right: 4px;
      }
      .se-msg-text {
        color: #999;
      }

      .se-card-footer {
        display: flex;
        justify-content: flex-end;
      }
      .se-teleport-btn {
        background: linear-gradient(135deg, #6d28d9, #8a2be2);
        color: #fff;
        border: none;
        border-radius: 2px;
        padding: 5px 16px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: box-shadow 0.2s ease, transform 0.15s ease;
        letter-spacing: 0.3px;
      }
      .se-teleport-btn:hover {
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.45);
        transform: scale(1.04);
      }

      /* \u2500\u2500 Footer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
      .se-panel-footer {
        display: flex;
        justify-content: space-between;
        padding: 10px 18px;
        border-top: 1px solid rgba(138, 43, 226, 0.12);
        font-size: 11px;
        color: #777;
      }
    `;
    }
    module2.exports = {
      getShadowExchangeCss: getShadowExchangeCss2
    };
  }
});

// src/ShadowExchange/portal-transition-css.js
var require_portal_transition_css = __commonJS({
  "src/ShadowExchange/portal-transition-css.js"(exports2, module2) {
    var PORTAL_TRANSITION_CSS2 = `
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
    module2.exports = { PORTAL_TRANSITION_CSS: PORTAL_TRANSITION_CSS2 };
  }
});

// src/ShadowExchange/persistence.js
var require_persistence = __commonJS({
  "src/ShadowExchange/persistence.js"(exports2, module2) {
    function initBackupPath2(plugin) {
      try {
        const pathModule = require("path");
        const fs = require("fs");
        const appSupport = pathModule.resolve(BdApi.Plugins.folder, "..", "..");
        const backupDir = pathModule.join(appSupport, "discord", "SoloLevelingBackups");
        fs.mkdirSync(backupDir, { recursive: true });
        plugin.fileBackupPath = pathModule.join(backupDir, "ShadowExchange.json");
      } catch (_) {
        plugin.fileBackupPath = null;
      }
    }
    function loadSettings2(plugin, defaultSettings, { pluginId }) {
      const candidates = [];
      try {
        const bd = BdApi.Data.load(pluginId, "settings");
        if (bd && typeof bd === "object") {
          candidates.push({ source: "bdapi", data: bd });
        }
      } catch (error) {
        plugin.debugError("Settings", "Failed to load settings from BdApi.Data", error);
      }
      try {
        const file = readFileBackup2(plugin);
        if (file && typeof file === "object") {
          candidates.push({ source: "file", data: file });
        }
      } catch (error) {
        plugin.debugError("Settings", "Failed to load settings from file backup", error);
      }
      if (candidates.length === 0) {
        plugin.settings = { ...defaultSettings, waypoints: [] };
        return;
      }
      const score = (candidate) => {
        var _a;
        const waypoints = Array.isArray(candidate.data.waypoints) ? candidate.data.waypoints.length : 0;
        const timestamp = ((_a = candidate.data._metadata) == null ? void 0 : _a.lastSave) ? new Date(candidate.data._metadata.lastSave).getTime() || 0 : 0;
        return waypoints * 1e3 + timestamp / 1e10;
      };
      candidates.sort((a, b) => score(b) - score(a));
      const best = candidates[0].data;
      plugin.settings = {
        ...defaultSettings,
        ...best,
        waypoints: Array.isArray(best.waypoints) ? best.waypoints : []
      };
    }
    function saveSettings2(plugin) {
      if (plugin._saveDebounceTimer) clearTimeout(plugin._saveDebounceTimer);
      plugin._saveDebounceTimer = setTimeout(() => {
        plugin._saveDebounceTimer = null;
        plugin._flushSaveSettings();
      }, 500);
    }
    function flushSaveSettings2(plugin, { pluginId, version }) {
      plugin._markedShadowIdsCache = null;
      plugin._waypointByLocationCache = null;
      plugin.settings._metadata = {
        lastSave: (/* @__PURE__ */ new Date()).toISOString(),
        version
      };
      try {
        BdApi.Data.save(pluginId, "settings", plugin.settings);
      } catch (error) {
        console.error("[ShadowExchange] BdApi.Data.save failed:", error);
      }
      writeFileBackup2(plugin, plugin.settings);
    }
    function readFileBackup2(plugin) {
      if (!plugin.fileBackupPath) return null;
      try {
        const fs = require("fs");
        const paths = [plugin.fileBackupPath];
        for (let i = 1; i <= 5; i += 1) paths.push(`${plugin.fileBackupPath}.bak${i}`);
        const candidates = [];
        for (const candidatePath of paths) {
          try {
            if (!fs.existsSync(candidatePath)) continue;
            const raw = fs.readFileSync(candidatePath, "utf8");
            const data = JSON.parse(raw);
            const quality = Array.isArray(data.waypoints) ? data.waypoints.length : 0;
            candidates.push({ data, quality, path: candidatePath });
          } catch (error) {
            plugin.debugError("Settings", `Failed to parse backup candidate ${candidatePath}`, error);
          }
        }
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.quality - a.quality);
        return candidates[0].data;
      } catch (_) {
        return null;
      }
    }
    function writeFileBackup2(plugin, data) {
      if (!plugin.fileBackupPath) return;
      try {
        const fs = require("fs");
        const json = JSON.stringify(data, null, 2);
        fs.writeFile(plugin.fileBackupPath, json, "utf8", (err) => {
          if (err) {
            console.error("[ShadowExchange] File backup write failed:", err);
            return;
          }
          for (let i = 4; i >= 1; i -= 1) {
            const src = `${plugin.fileBackupPath}.bak${i}`;
            const dest = `${plugin.fileBackupPath}.bak${i + 1}`;
            try {
              fs.renameSync(src, dest);
            } catch (_) {
            }
          }
          fs.copyFile(plugin.fileBackupPath, `${plugin.fileBackupPath}.bak1`, () => {
          });
        });
      } catch (error) {
        console.error("[ShadowExchange] writeFileBackup error:", error);
      }
    }
    module2.exports = {
      flushSaveSettings: flushSaveSettings2,
      initBackupPath: initBackupPath2,
      loadSettings: loadSettings2,
      readFileBackup: readFileBackup2,
      saveSettings: saveSettings2,
      writeFileBackup: writeFileBackup2
    };
  }
});

// src/ShadowExchange/index.js
var _bdLoad = (f) => {
  try {
    const m = { exports: {} };
    new Function("module", "exports", require("fs").readFileSync(require("path").join(BdApi.Plugins.folder, f), "utf8"))(m, m.exports);
    return typeof m.exports === "function" || Object.keys(m.exports).length ? m.exports : null;
  } catch (e) {
    return null;
  }
};
var SE_PLUGIN_ID = "ShadowExchange";
var SE_VERSION = "2.1.1";
var SE_STYLE_ID = "shadow-exchange-css";
var SE_SWIRL_ID = "se-swirl-icon";
var SE_PANEL_CONTAINER_ID = "se-panel-root";
var TRANSITION_ID = "se-transition-overlay";
var SWIRL_REINJECT_DELAY_MS = 140;
var FALLBACK_SHADOWS = [
  { name: "Shadow Scout", rank: "E" },
  { name: "Shadow Sentry", rank: "E" },
  { name: "Shadow Guard", rank: "E" },
  { name: "Shadow Watcher", rank: "D" },
  { name: "Shadow Patrol", rank: "D" },
  { name: "Shadow Ranger", rank: "D" },
  { name: "Shadow Knight", rank: "C" },
  { name: "Shadow Striker", rank: "C" },
  { name: "Shadow Warrior", rank: "B" },
  { name: "Shadow Vanguard", rank: "B" },
  { name: "Shadow Elite", rank: "A" },
  { name: "Shadow Blade", rank: "A" },
  { name: "Shadow Marshal", rank: "S" },
  { name: "Shadow Commander", rank: "S" },
  { name: "Shadow Overlord", rank: "SS" },
  { name: "Shadow Arbiter", rank: "SS" },
  { name: "Shadow Sovereign", rank: "SSS" },
  { name: "Shadow Titan", rank: "SSS" },
  { name: "Shadow Paragon", rank: "SSS+" },
  { name: "Shadow Apex", rank: "Shadow Monarch" }
];
var { buildPanelComponents } = require_panel_components();
var { getShadowExchangeCss } = require_styles();
var { PORTAL_TRANSITION_CSS } = require_portal_transition_css();
var {
  flushSaveSettings,
  initBackupPath,
  loadSettings,
  readFileBackup,
  saveSettings,
  writeFileBackup
} = require_persistence();
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
var _SLUtils;
try {
  _SLUtils = _bdLoad("SoloLevelingUtils.js") || window.SoloLevelingUtils || null;
} catch (_) {
  _SLUtils = window.SoloLevelingUtils || null;
}
var _TransitionCleanupUtils;
try {
  _TransitionCleanupUtils = _bdLoad("TransitionCleanupUtils.js");
} catch (_) {
  _TransitionCleanupUtils = null;
}
module.exports = class ShadowExchange {
  // ── Lifecycle ──────────────────────────────────────────────────────────
  _resetRuntimeState() {
    this._panelForceUpdate = null;
    this._panelContainer = null;
    this._swirlReinjectTimeout = null;
    this._swirlResizeHandler = null;
    this._transitionNavTimeout = null;
    this._transitionCleanupTimeout = null;
    this._transitionRunId = 0;
    this._transitionStopCanvas = null;
    this._navigateRetryTimers = /* @__PURE__ */ new Set();
    this._navigateRequestId = 0;
    this._channelFadeToken = 0;
    this._channelFadeResetTimer = null;
    this._saveDebounceTimer = null;
    this._layoutBusUnsub = null;
    this._markedShadowIdsCache = null;
    this._waypointByLocationCache = null;
  }
  constructor() {
    this._resetRuntimeState();
    this._NavigationUtils = null;
  }
  start() {
    var _a;
    this._toast = ((_a = _PluginUtils == null ? void 0 : _PluginUtils.createToastHelper) == null ? void 0 : _a.call(_PluginUtils, "shadowExchange")) || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
    try {
      this.panelOpen = false;
      this.swirlIcon = null;
      this.fallbackIdx = 0;
      this.fileBackupPath = null;
      this._resetRuntimeState();
      this.defaultSettings = {
        waypoints: [],
        sortBy: "created",
        debug: false,
        animationEnabled: true,
        respectReducedMotion: false,
        animationDuration: 550,
        _metadata: { lastSave: null, version: SE_VERSION }
      };
      this.settings = { ...this.defaultSettings, waypoints: [] };
      this.initWebpack();
      this.initBackupPath();
      this.loadSettings();
      this.injectCSS();
      this._components = buildPanelComponents(BdApi, this);
      this.injectSwirlIcon();
      this.setupSwirlObserver();
      this.patchContextMenu();
      this._toast(`ShadowExchange v${SE_VERSION} active`, "success");
    } catch (err) {
      console.error("[ShadowExchange] start() failed:", err);
      this._toast("ShadowExchange failed to start", "error");
    }
  }
  stop() {
    var _a, _b, _c;
    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
      this._saveDebounceTimer = null;
      this._flushSaveSettings();
    }
    try {
      if (this._unpatchContextMenu) {
        this._unpatchContextMenu();
        this._unpatchContextMenu = null;
      }
      this.closePanel();
      (_a = _TransitionCleanupUtils == null ? void 0 : _TransitionCleanupUtils.cancelPendingTransition) == null ? void 0 : _a.call(_TransitionCleanupUtils, this);
      (_b = _TransitionCleanupUtils == null ? void 0 : _TransitionCleanupUtils.clearNavigateRetries) == null ? void 0 : _b.call(_TransitionCleanupUtils, this);
      (_c = _TransitionCleanupUtils == null ? void 0 : _TransitionCleanupUtils.cancelChannelViewFade) == null ? void 0 : _c.call(_TransitionCleanupUtils, this);
      this.teardownSwirlObserver();
      this.removeSwirlIcon();
      const seTip = document.getElementById("sl-toolbar-tip-se");
      if (seTip) seTip.remove();
      this.removeCSS();
    } catch (err) {
      console.error("[ShadowExchange] stop() failed:", err);
    }
  }
  // ── Webpack Modules ────────────────────────────────────────────────────
  initWebpack() {
    const { Webpack } = BdApi;
    try {
      this._NavigationUtils = Webpack.getModule(
        (m) => m && m.transitionTo && m.back && m.forward
      );
      this.NavigationUtils = this._NavigationUtils;
    } catch (_) {
      this._NavigationUtils = null;
      this.NavigationUtils = null;
    }
    this.ChannelStore = Webpack.getStore("ChannelStore");
    this.GuildStore = Webpack.getStore("GuildStore");
    this.MessageStore = Webpack.getStore("MessageStore");
    this.UserStore = Webpack.getStore("UserStore");
  }
  // ── Context Menu (right-click → Shadow Mark) ──────────────────────────
  patchContextMenu() {
    try {
      if (this._unpatchContextMenu) {
        try {
          this._unpatchContextMenu();
        } catch (_) {
        }
        this._unpatchContextMenu = null;
      }
      this._unpatchContextMenu = BdApi.ContextMenu.patch("message", (tree, props) => {
        var _a, _b;
        try {
          const { message, channel } = props;
          if (!message || !channel) return;
          const existingWaypoint = this._getWaypointByLocation(channel.id, message.id);
          const separator = BdApi.ContextMenu.buildItem({ type: "separator" });
          let item;
          if (existingWaypoint) {
            item = BdApi.ContextMenu.buildItem({
              type: "text",
              label: `Shadow Unmark (${existingWaypoint.shadowName})`,
              id: "shadow-exchange-unmark",
              action: () => {
                this.removeWaypoint(existingWaypoint.id);
                this._toast(
                  `${existingWaypoint.shadowName} recalled \u2014 available for deployment`,
                  "info"
                );
              }
            });
          } else {
            item = BdApi.ContextMenu.buildItem({
              type: "text",
              label: "Shadow Mark",
              id: "shadow-exchange-mark",
              action: () => this.markMessage(channel, message)
            });
          }
          const children = (_a = tree == null ? void 0 : tree.props) == null ? void 0 : _a.children;
          if (Array.isArray(children)) {
            children.push(separator, item);
          } else if (((_b = children == null ? void 0 : children.props) == null ? void 0 : _b.children) && Array.isArray(children.props.children)) {
            children.props.children.push(separator, item);
          }
        } catch (err) {
          console.error("[ShadowExchange] Context menu callback error:", err);
        }
      });
    } catch (err) {
      console.error("[ShadowExchange] Context menu patch failed:", err);
    }
  }
  /**
   * Mark a specific message from the context menu.
   */
  _resolveWaypointLocationNames(channel, guildId) {
    var _a, _b;
    let channelName = channel.name || "DM";
    let guildName = guildId ? "Unknown Server" : "Direct Messages";
    try {
      if (guildId) {
        const guild = (_a = this.GuildStore) == null ? void 0 : _a.getGuild(guildId);
        if (guild) guildName = guild.name;
      }
      if (!channel.name && ((_b = channel.recipients) == null ? void 0 : _b.length)) channelName = "DM";
    } catch (error) {
      this.debugError("Mark", "Failed to resolve guild/channel labels for message waypoint", error);
    }
    return { channelName, guildName };
  }
  _buildWaypointLabel(guildId, guildName, channelName) {
    return guildId ? `${guildName} \xBB #${channelName}` : `DM \xBB ${channelName}`;
  }
  _extractMessagePreviewText(message) {
    var _a, _b;
    try {
      if (message.content) {
        return message.content.length > 120 ? `${message.content.slice(0, 120)}\u2026` : message.content;
      }
      if ((_a = message.embeds) == null ? void 0 : _a.length) return "[Embed]";
      if ((_b = message.attachments) == null ? void 0 : _b.length) {
        const count = message.attachments.length;
        return `[${count} attachment${count > 1 ? "s" : ""}]`;
      }
    } catch (error) {
      this.debugError("Mark", "Failed to build message preview text", error);
    }
    return "";
  }
  _extractMessageAuthor(message) {
    try {
      if (message.author) {
        return message.author.globalName || message.author.username || "";
      }
    } catch (error) {
      this.debugError("Mark", "Failed to read message author for waypoint", error);
    }
    return "";
  }
  async markMessage(channel, message) {
    const channelId = channel.id;
    const guildId = channel.guild_id || null;
    const messageId = message.id;
    const dup = this._getWaypointByLocation(channelId, messageId);
    if (dup) {
      this._toast(`Already marked: ${dup.label}`, "warning");
      return;
    }
    const { channelName, guildName } = this._resolveWaypointLocationNames(channel, guildId);
    const shadow = await this.getWeakestAvailableShadow();
    if (!shadow) {
      this._toast("No shadows available!", "error");
      return;
    }
    const label = this._buildWaypointLabel(guildId, guildName, channelName);
    const messagePreview = this._extractMessagePreviewText(message);
    const messageAuthor = this._extractMessageAuthor(message);
    const waypoint = {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      locationType: "message",
      guildId,
      channelId,
      messageId,
      shadowId: shadow.id,
      shadowName: shadow.name,
      shadowRank: shadow.rank,
      createdAt: Date.now(),
      lastVisited: null,
      visitCount: 0,
      channelName,
      guildName,
      messagePreview,
      messageAuthor
    };
    this.settings.waypoints.push(waypoint);
    this.saveSettings();
    this._triggerPanelRefresh();
    this._toast(`${shadow.name} stationed at message in ${label}`, "success");
  }
  // ── Persistence ────────────────────────────────────────────────────────
  initBackupPath() {
    return initBackupPath(this);
  }
  loadSettings() {
    return loadSettings(this, this.defaultSettings, {
      pluginId: SE_PLUGIN_ID
    });
  }
  /** Debounced save — batches rapid actions (sort/navigate/mark) into one write */
  saveSettings() {
    return saveSettings(this);
  }
  _flushSaveSettings() {
    return flushSaveSettings(this, {
      pluginId: SE_PLUGIN_ID,
      version: SE_VERSION
    });
  }
  readFileBackup() {
    return readFileBackup(this);
  }
  writeFileBackup(data) {
    return writeFileBackup(this, data);
  }
  debugError(system, ...args) {
    console.error(`[ShadowExchange][${system}]`, ...args);
  }
  // ── Public API (for cross-plugin integration) ─────────────────────────
  /**
   * Returns a Set of shadow IDs currently stationed at waypoints.
   * Other plugins (e.g., Dungeons) should exclude these from battle deployment.
   */
  getMarkedShadowIds() {
    var _a;
    if (!this._markedShadowIdsCache) {
      this._markedShadowIdsCache = new Set(
        (((_a = this.settings) == null ? void 0 : _a.waypoints) || []).map((w) => w.shadowId).filter(Boolean)
      );
    }
    return this._markedShadowIdsCache;
  }
  isShadowMarked(shadowId) {
    return this.getMarkedShadowIds().has(shadowId);
  }
  /** O(1) waypoint lookup by channelId+messageId (cached Map, invalidated on save) */
  _getWaypointByLocation(channelId, messageId) {
    var _a;
    if (!this._waypointByLocationCache) {
      this._waypointByLocationCache = /* @__PURE__ */ new Map();
      for (const w of ((_a = this.settings) == null ? void 0 : _a.waypoints) || []) {
        this._waypointByLocationCache.set(`${w.channelId}:${w.messageId || ""}`, w);
      }
    }
    return this._waypointByLocationCache.get(`${channelId}:${messageId || ""}`) || null;
  }
  // ── Shadow Assignment ────────────────────────────────────────────────
  async getWeakestAvailableShadow() {
    var _a;
    if (!BdApi.Plugins.isEnabled("ShadowArmy")) return this.getFallbackShadow();
    const saPlugin = BdApi.Plugins.get("ShadowArmy");
    const saInstance = saPlugin == null ? void 0 : saPlugin.instance;
    if (!saInstance || typeof saInstance.getAllShadows !== "function") {
      return this.getFallbackShadow();
    }
    try {
      const allShadows = ((_a = saInstance.getShadowSnapshot) == null ? void 0 : _a.call(saInstance)) || await saInstance.getAllShadows();
      if (!Array.isArray(allShadows) || allShadows.length === 0) {
        return this.getFallbackShadow();
      }
      const available = allShadows.filter((s) => (s == null ? void 0 : s.id) && !this.isShadowMarked(s.id));
      if (available.length === 0) {
        return this.getFallbackShadow();
      }
      const withPower = available.map((shadow) => {
        let power = 0;
        try {
          if (typeof saInstance.getShadowEffectiveStats === "function") {
            const stats = saInstance.getShadowEffectiveStats(shadow);
            power = Object.values(stats).reduce((sum, v) => sum + (Number(v) || 0), 0);
          } else {
            power = Number(shadow.strength) || 0;
          }
        } catch (_) {
          power = Number(shadow.strength) || 0;
        }
        return { shadow, power };
      });
      withPower.sort((a, b) => a.power - b.power);
      const weakest = withPower[0].shadow;
      return {
        id: weakest.id,
        name: weakest.roleName || weakest.role || "Shadow Soldier",
        rank: weakest.rank || "E",
        source: "army"
      };
    } catch (err) {
      console.error("[ShadowExchange] Shadow query failed:", err);
      return this.getFallbackShadow();
    }
  }
  getFallbackShadow() {
    const pool = FALLBACK_SHADOWS;
    const assignedNames = new Set(this.settings.waypoints.map((w) => w.shadowName));
    const available = pool.filter((s) => !assignedNames.has(s.name));
    if (available.length > 0) return { ...available[0], id: `fallback_${Date.now()}`, source: "fallback" };
    this.fallbackIdx += 1;
    return {
      id: `fallback_${Date.now()}`,
      name: `Shadow Soldier #${this.fallbackIdx}`,
      rank: "E",
      source: "fallback"
    };
  }
  async getAvailableShadowCount() {
    var _a;
    if (!BdApi.Plugins.isEnabled("ShadowArmy")) {
      return Math.max(0, FALLBACK_SHADOWS.length - this.settings.waypoints.length);
    }
    const saPlugin = BdApi.Plugins.get("ShadowArmy");
    const saInstance = saPlugin == null ? void 0 : saPlugin.instance;
    if (!saInstance || typeof saInstance.getAllShadows !== "function") {
      return Math.max(0, FALLBACK_SHADOWS.length - this.settings.waypoints.length);
    }
    try {
      const all = ((_a = saInstance.getShadowSnapshot) == null ? void 0 : _a.call(saInstance)) || await saInstance.getAllShadows();
      return all.filter((s) => (s == null ? void 0 : s.id) && !this.isShadowMarked(s.id)).length;
    } catch (_) {
      return 0;
    }
  }
  // ── Location Detection ─────────────────────────────────────────────────
  _parseCurrentLocationFromUrl(url) {
    const match = url.match(/channels\/(@me|(\d+))\/(\d+)(?:\/(\d+))?/);
    if (!match) return null;
    const [, guildIdOrMe, guildIdNum, channelId, messageId] = match;
    return {
      guildId: guildIdOrMe === "@me" ? null : guildIdNum || guildIdOrMe,
      channelId,
      messageId: messageId || null
    };
  }
  _resolveCurrentChannelMetadata(channelId, guildId) {
    var _a, _b;
    let channelName = "Unknown";
    let locationType = "channel";
    try {
      const channel = (_a = this.ChannelStore) == null ? void 0 : _a.getChannel(channelId);
      if (!channel) return { channelName, locationType };
      channelName = channel.name || (((_b = channel.recipients) == null ? void 0 : _b.length) ? "DM" : "Unknown");
      if (channel.isThread && channel.isThread()) locationType = "thread";
      else if (!guildId) locationType = "dm";
    } catch (error) {
      this.debugError("Location", "Failed to resolve channel metadata for current location", error);
    }
    return { channelName, locationType };
  }
  _resolveCurrentGuildName(guildId) {
    var _a;
    if (!guildId) return "Direct Messages";
    let guildName = "Unknown Server";
    try {
      const guild = (_a = this.GuildStore) == null ? void 0 : _a.getGuild(guildId);
      if (guild) guildName = guild.name;
    } catch (error) {
      this.debugError("Location", "Failed to resolve guild metadata for current location", error);
    }
    return guildName;
  }
  getCurrentLocation() {
    const parsed = this._parseCurrentLocationFromUrl(window.location.href);
    if (!parsed) return null;
    const { guildId, channelId, messageId } = parsed;
    const { channelName, locationType: baseType } = this._resolveCurrentChannelMetadata(channelId, guildId);
    const guildName = this._resolveCurrentGuildName(guildId);
    const locationType = messageId ? "message" : baseType;
    return { guildId, channelId, messageId, channelName, guildName, locationType };
  }
  // ── Marking ────────────────────────────────────────────────────────────
  async markCurrentLocation() {
    const loc = this.getCurrentLocation();
    if (!loc) {
      this._toast("Navigate to a channel first", "warning");
      return;
    }
    const dup = this._getWaypointByLocation(loc.channelId, loc.messageId);
    if (dup) {
      this._toast(`Already marked: ${dup.label}`, "warning");
      return;
    }
    const shadow = await this.getWeakestAvailableShadow();
    if (!shadow) {
      this._toast("No shadows available!", "error");
      return;
    }
    const label = loc.guildId ? `${loc.guildName} \xBB #${loc.channelName}` : `DM \xBB ${loc.channelName}`;
    const waypoint = {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      locationType: loc.locationType,
      guildId: loc.guildId,
      channelId: loc.channelId,
      messageId: loc.messageId,
      shadowId: shadow.id,
      shadowName: shadow.name,
      shadowRank: shadow.rank,
      createdAt: Date.now(),
      lastVisited: null,
      visitCount: 0,
      channelName: loc.channelName,
      guildName: loc.guildName,
      messagePreview: "",
      messageAuthor: ""
    };
    this.settings.waypoints.push(waypoint);
    this.saveSettings();
    this._triggerPanelRefresh();
    this._toast(`${shadow.name} stationed at ${label}`, "success");
  }
  removeWaypoint(waypointId) {
    const idx = this.settings.waypoints.findIndex((w) => w.id === waypointId);
    if (idx === -1) return;
    const wp = this.settings.waypoints[idx];
    this.settings.waypoints.splice(idx, 1);
    this.saveSettings();
    this._triggerPanelRefresh();
    this._toast(`${wp.shadowName} recalled from ${wp.label}`, "info");
  }
  // ── Navigation ─────────────────────────────────────────────────────────
  teleportTo(waypointId) {
    var _a, _b;
    const wp = this.settings.waypoints.find((w) => w.id === waypointId);
    if (!wp) return;
    let url = "/channels/";
    url += wp.guildId || "@me";
    url += `/${wp.channelId}`;
    if (wp.messageId) url += `/${wp.messageId}`;
    this.closePanel();
    wp.lastVisited = Date.now();
    wp.visitCount = (wp.visitCount || 0) + 1;
    this.saveSettings();
    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      _ensureShadowPortalCoreApplied(this.constructor);
    }
    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      this.debugError("Teleport", "Shared portal core missing; using direct navigation fallback");
      if ((_a = this._NavigationUtils) == null ? void 0 : _a.transitionTo) {
        this._NavigationUtils.transitionTo(url);
      } else if ((_b = window.history) == null ? void 0 : _b.pushState) {
        window.history.pushState({}, "", url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      this._toast(`Exchanged to ${wp.label}`, "warning", 2500);
      return;
    }
    this.playTransition(() => {
      const fadeToken = this._beginChannelViewFadeOut();
      this._navigate(url, {
        waypointId: wp.id,
        waypointLabel: wp.label,
        channelId: wp.channelId
      }, {
        onConfirmed: () => this._finishChannelViewFade(fadeToken, true),
        onFailed: () => this._finishChannelViewFade(fadeToken, false)
      });
    }, url);
    this._toast(`Exchanged to ${wp.label}`, "success", 2500);
  }
  // ── Panel refresh bridge (imperative → React) ─────────────────────────
  _triggerPanelRefresh() {
    if (this._panelForceUpdate) {
      this._panelForceUpdate();
    }
  }
  // ── Swirl Icon (channel-header anchored) ───────────────────────────────
  _getChannelHeaderToolbar() {
    const hosts = document.querySelectorAll('[aria-label="Channel header"], [class*="titleWrapper_"], header');
    for (const host of hosts) {
      if (host.offsetParent === null) continue;
      const node = host.querySelector('[class*="toolbar_"]');
      if (!node || node.offsetParent === null) continue;
      return node;
    }
    return null;
  }
  _attachSwirlIconToHeader(icon = null) {
    const targetIcon = icon || document.getElementById(SE_SWIRL_ID);
    if (!targetIcon) return false;
    const toolbar = this._getChannelHeaderToolbar();
    if (!toolbar) return false;
    if (targetIcon.parentElement !== toolbar) {
      toolbar.appendChild(targetIcon);
    }
    targetIcon.classList.remove("se-swirl-icon--hidden");
    return true;
  }
  _showToolbarTooltip(icon, tooltipId, label) {
    const tip = typeof (_SLUtils == null ? void 0 : _SLUtils.getOrCreateOverlay) === "function" ? _SLUtils.getOrCreateOverlay(tooltipId, "sl-toolbar-tip") : (() => {
      const existing = document.getElementById(tooltipId);
      if (existing) return existing;
      const created = document.createElement("div");
      created.id = tooltipId;
      created.className = "sl-toolbar-tip";
      (document.body || document.documentElement).appendChild(created);
      return created;
    })();
    const rect = icon.getBoundingClientRect();
    tip.textContent = label;
    tip.style.top = `${rect.top - tip.offsetHeight - 8}px`;
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.classList.add("sl-toolbar-tip--visible");
  }
  _hideToolbarTooltip(tooltipId) {
    const tip = document.getElementById(tooltipId);
    if (tip) tip.classList.remove("sl-toolbar-tip--visible");
  }
  _scheduleSwirlIconReinject(delayMs = SWIRL_REINJECT_DELAY_MS) {
    if (this._swirlReinjectTimeout) clearTimeout(this._swirlReinjectTimeout);
    this._swirlReinjectTimeout = setTimeout(() => {
      this._swirlReinjectTimeout = null;
      this.injectSwirlIcon();
    }, delayMs);
  }
  setupSwirlObserver() {
    if (this._layoutBusUnsub) return;
    if (_PluginUtils == null ? void 0 : _PluginUtils.LayoutObserverBus) {
      this._layoutBusUnsub = _PluginUtils.LayoutObserverBus.subscribe("ShadowExchange", () => {
        this._scheduleSwirlIconReinject();
      }, 250);
    }
    this._swirlResizeHandler = () => this._scheduleSwirlIconReinject(80);
    window.addEventListener("resize", this._swirlResizeHandler, { passive: true });
    this._scheduleSwirlIconReinject(60);
  }
  teardownSwirlObserver() {
    if (this._layoutBusUnsub) {
      this._layoutBusUnsub();
      this._layoutBusUnsub = null;
    }
    if (this._swirlReinjectTimeout) {
      clearTimeout(this._swirlReinjectTimeout);
      this._swirlReinjectTimeout = null;
    }
    if (this._swirlResizeHandler) {
      window.removeEventListener("resize", this._swirlResizeHandler);
      this._swirlResizeHandler = null;
    }
  }
  injectSwirlIcon() {
    let icon = document.getElementById(SE_SWIRL_ID);
    if (!icon) {
      icon = document.createElement("div");
      icon.id = SE_SWIRL_ID;
      icon.className = "se-swirl-icon";
      icon.innerHTML = [
        '<svg viewBox="0 0 512 512" width="18" height="18" xmlns="http://www.w3.org/2000/svg">',
        '<path fill="#b5b5be" d="M298.736 21.016c-99.298 0-195.928 104.647-215.83 233.736-7.074 45.887-3.493 88.68 8.512 124.787-4.082-6.407-7.92-13.09-11.467-20.034-16.516-32.335-24.627-65.378-25-96.272-11.74 36.254-8.083 82.47 14.482 126.643 27.7 54.227 81.563 91.94 139.87 97.502 5.658.725 11.447 1.108 17.364 1.108 99.298 0 195.93-104.647 215.83-233.736 9.28-60.196.23-115.072-22.133-156.506 21.625 21.867 36.56 45.786 44.617 69.496.623-30.408-14.064-65.766-44.21-95.806-33.718-33.598-77.227-50.91-114.995-50.723-2.328-.118-4.67-.197-7.04-.197zm-5.6 36.357c40.223 0 73.65 20.342 95.702 53.533 15.915 42.888 12.51 108.315.98 147.858-16.02 54.944-40.598 96.035-79.77 126.107-41.79 32.084-98.447 24.39-115.874-5.798-1.365-2.363-2.487-4.832-3.38-7.385 11.724 14.06 38.188 14.944 61.817 1.3 25.48-14.71 38.003-40.727 27.968-58.108-10.036-17.384-38.826-19.548-64.307-4.837-9.83 5.676-17.72 13.037-23.14 20.934.507-1.295 1.043-2.59 1.626-3.88-18.687 24.49-24.562 52.126-12.848 72.417 38.702 45.923 98.07 25.503 140.746-6.426 37.95-28.392 72.32-73.55 89.356-131.988 1.265-4.34 2.416-8.677 3.467-13.008-.286 2.218-.59 4.442-.934 6.678-16.807 109.02-98.412 197.396-182.272 197.396-35.644 0-65.954-15.975-87.74-42.71-26.492-48.396-15.988-142.083 4.675-185.15 26.745-55.742 66.133-122.77 134.324-116.804 46.03 4.027 63.098 58.637 39.128 116.22-8.61 20.685-21.192 39.314-36.21 54.313 24.91-16.6 46.72-42.13 59.572-73 23.97-57.583 6.94-113.422-39.13-116.805-85.737-6.296-137.638 58.55-177.542 128.485-9.21 19.9-16.182 40.35-20.977 60.707.494-7.435 1.312-14.99 2.493-22.652C127.67 145.75 209.275 57.373 293.135 57.373z"/>',
        "</svg>"
      ].join("");
      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.togglePanel();
      });
      icon.addEventListener("mouseenter", () => {
        this._showToolbarTooltip(icon, "sl-toolbar-tip-se", "Shadow Exchange");
      });
      icon.addEventListener("mouseleave", () => {
        this._hideToolbarTooltip("sl-toolbar-tip-se");
      });
    }
    const anchored = this._attachSwirlIconToHeader(icon);
    if (!anchored) {
      if (!icon.parentElement) document.body.appendChild(icon);
      icon.classList.add("se-swirl-icon--hidden");
    }
    this.swirlIcon = icon;
  }
  removeSwirlIcon() {
    const icon = document.getElementById(SE_SWIRL_ID);
    if (icon) icon.remove();
    this.swirlIcon = null;
  }
  // ── Panel (React-rendered) ─────────────────────────────────────────────
  togglePanel() {
    if (this.panelOpen) this.closePanel();
    else this.openPanel();
  }
  /**
   * Get react-dom/client.createRoot (React 18+).
   * Discord uses React 18, which removed ReactDOM.render() in favor of createRoot().
   */
  _getCreateRoot() {
    var _a;
    if (_ReactUtils == null ? void 0 : _ReactUtils.getCreateRoot) return _ReactUtils.getCreateRoot();
    if ((_a = BdApi.ReactDOM) == null ? void 0 : _a.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  }
  openPanel() {
    if (this.panelOpen) return;
    this.panelOpen = true;
    try {
      let container = document.getElementById(SE_PANEL_CONTAINER_ID);
      if (!container) {
        container = document.createElement("div");
        container.id = SE_PANEL_CONTAINER_ID;
        container.style.display = "contents";
        document.body.appendChild(container);
      }
      this._panelContainer = container;
      const React = BdApi.React;
      const { WaypointPanel } = this._components;
      const onClose = () => this.closePanel();
      const element = React.createElement(WaypointPanel, { onClose });
      const createRoot = this._getCreateRoot();
      if (createRoot) {
        const root = createRoot(container);
        this._reactRoot = root;
        root.render(element);
        return;
      }
      const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule(
        (m) => m && m.render && m.unmountComponentAtNode
      );
      if (ReactDOM == null ? void 0 : ReactDOM.render) {
        ReactDOM.render(element, container);
        return;
      }
      console.error("[ShadowExchange] Neither createRoot nor ReactDOM.render available");
      this.panelOpen = false;
      container.remove();
      this._toast("ShadowExchange: React rendering unavailable", "error");
    } catch (err) {
      console.error("[ShadowExchange] openPanel() failed:", err);
      this.panelOpen = false;
      this._toast("ShadowExchange: panel error", "error");
    }
  }
  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    if (this._reactRoot) {
      try {
        this._reactRoot.unmount();
      } catch (error) {
        this.debugError("Panel", "Failed to unmount panel React root", error);
      }
      this._reactRoot = null;
    }
    const container = document.getElementById(SE_PANEL_CONTAINER_ID);
    if (container) {
      try {
        const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule(
          (m) => m && m.unmountComponentAtNode
        );
        if (ReactDOM == null ? void 0 : ReactDOM.unmountComponentAtNode) ReactDOM.unmountComponentAtNode(container);
      } catch (error) {
        this.debugError("Panel", "Failed to unmount legacy panel container", error);
      }
      container.remove();
    }
    this._panelContainer = null;
    this._panelForceUpdate = null;
  }
  // ── CSS ────────────────────────────────────────────────────────────────
  injectCSS() {
    const css = getShadowExchangeCss(PORTAL_TRANSITION_CSS);
    try {
      BdApi.DOM.addStyle(SE_STYLE_ID, css);
    } catch (_) {
      const style = document.createElement("style");
      style.id = SE_STYLE_ID;
      style.textContent = css;
      document.head.appendChild(style);
    }
  }
  removeCSS() {
    try {
      BdApi.DOM.removeStyle(SE_STYLE_ID);
    } catch (_) {
      const el = document.getElementById(SE_STYLE_ID);
      if (el) el.remove();
    }
  }
};
var _loadShadowPortalCore = () => {
  var _a;
  if (typeof (_SLUtils == null ? void 0 : _SLUtils.loadShadowPortalCore) === "function") {
    const mod = _SLUtils.loadShadowPortalCore();
    if (mod == null ? void 0 : mod.applyPortalCoreToClass) return mod;
  }
  return typeof window !== "undefined" && ((_a = window.ShadowPortalCore) == null ? void 0 : _a.applyPortalCoreToClass) ? window.ShadowPortalCore : null;
};
var SHADOW_PORTAL_CONFIG = {
  transitionId: TRANSITION_ID,
  navigationFailureToast: "Shadow Exchange failed to switch channel",
  contextLabelKeys: ["waypointLabel", "anchorName", "label", "name"]
};
var _ensureShadowPortalCoreApplied = (PluginClass = module.exports) => {
  const core = _loadShadowPortalCore();
  if (!(core == null ? void 0 : core.applyPortalCoreToClass)) return false;
  core.applyPortalCoreToClass(PluginClass, SHADOW_PORTAL_CONFIG);
  return true;
};
if (!_ensureShadowPortalCoreApplied(module.exports)) {
  console.warn(`[${SE_PLUGIN_ID}] Shared portal core unavailable. Navigation/transition patch will not be shared.`);
}
