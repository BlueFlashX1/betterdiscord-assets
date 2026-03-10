const RANK_ORDER = window.SoloLevelingUtils?.RANKS || [
  "E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+", "NH",
  "Monarch", "Monarch+", "Shadow Monarch",
];

const RANK_COLORS = {
  E: "#808080", D: "#8B4513", C: "#FF6347", B: "#FFD700",
  A: "#00CED1", S: "#FF69B4", SS: "#9b59b6", SSS: "#e74c3c",
  "SSS+": "#f39c12", NH: "#1abc9c", Monarch: "#e91e63",
  "Monarch+": "#ff5722", "Shadow Monarch": "#7c4dff",
};

function formatTimestamp(ts) {
  try {
    const d = new Date(ts);
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " at " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
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
  return wp.guildName
    ? `${wp.guildName} » #${wp.channelName}`
    : `DM » ${wp.channelName}`;
}

function hasMessageLookupTarget(wp) {
  return Boolean(wp.messageId && wp.channelId);
}

function getCachedMessagePreviewText(cached) {
  if (!cached) return "";
  if (cached.content) {
    return cached.content.length > 120 ? `${cached.content.slice(0, 120)}…` : cached.content;
  }
  if (Array.isArray(cached.embeds) && cached.embeds.length > 0) return "[Embed]";
  const attachmentCount = Number(cached.attachments?.size || cached.attachments?.length || 0);
  if (attachmentCount > 0) return "[Attachment]";
  return "";
}

function getCachedMessageAuthor(cached) {
  if (!cached?.author) return "";
  return cached.author.globalName || cached.author.username || "";
}

function resolveMessagePreviewData(pluginInstance, wp) {
  let preview = wp.messagePreview || "";
  let author = wp.messageAuthor || "";
  if (preview || !hasMessageLookupTarget(wp)) return { preview, author };

  try {
    const cached = pluginInstance.MessageStore?.getMessage(wp.channelId, wp.messageId);
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
  return ce("div", { className: "se-message-preview" },
    author ? ce("span", { className: "se-msg-author" }, `${author}:`) : null,
    ce("span", { className: "se-msg-text" },
      preview || ce("em", { style: { color: "#666" } }, "Navigate to load preview")
    )
  );
}

function getFilteredSortedWaypoints(waypoints, searchQuery, sortBy) {
  let filtered = [...waypoints];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (w) =>
        (w.label || "").toLowerCase().includes(q) ||
        (w.shadowName || "").toLowerCase().includes(q) ||
        (w.channelName || "").toLowerCase().includes(q) ||
        (w.guildName || "").toLowerCase().includes(q) ||
        (w.messagePreview || "").toLowerCase().includes(q) ||
        (w.messageAuthor || "").toLowerCase().includes(q)
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

    return ce("div", {
      className: "se-waypoint-card",
      style: { borderLeftColor: rankColor },
    },
    ce("div", { className: "se-card-top" },
      ce("span", { className: "se-shadow-rank", style: { background: rankColor } }, wp.shadowRank),
      ce("span", { className: "se-shadow-name" }, wp.shadowName),
      ce("button", {
        className: "se-card-remove",
        title: "Recall shadow",
        onClick: (e) => { e.stopPropagation(); onRemove(wp.id); },
      }, "✖")
    ),
    ce("div", { className: "se-card-body" },
      ce("div", { className: "se-location-label" }, fullLocation),
      messageSection,
      ce("div", { className: "se-location-meta" },
        ce("span", { className: "se-type-badge" }, typeBadge),
        ce("span", { className: "se-visit-count" }, `${visits} visit${visits !== 1 ? "s" : ""}`),
        ce("span", { className: "se-created-time" }, timeStr)
      )
    ),
    ce("div", { className: "se-card-footer" },
      ce("button", {
        className: "se-teleport-btn",
        onClick: () => onTeleport(wp.id),
      }, "Teleport")
    ));
  });
}

function buildWaypointListContent(React, options) {
  const {
    WaypointCard,
    waypoints,
    searchQuery,
    handleTeleport,
    handleRemove,
  } = options;
  const ce = React.createElement;
  if (waypoints.length === 0) {
    return ce("div", { className: "se-empty-state" },
      ce("div", { className: "se-empty-icon" }, "⚓"),
      ce("div", { className: "se-empty-text" },
        searchQuery ? "No waypoints match your search" : "No waypoints yet"
      ),
      ce("div", { className: "se-empty-hint" },
        searchQuery ? "Try a different search" : 'Click "Mark Current Location" to station a shadow'
      )
    );
  }

  return waypoints.map((wp) =>
    ce(WaypointCard, {
      key: wp.id,
      wp,
      onTeleport: handleTeleport,
      onRemove: handleRemove,
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
      return () => { cancelled = true; };
    }, []);

    React.useEffect(() => {
      pluginInstance._panelForceUpdate = forceUpdate;
      return () => { pluginInstance._panelForceUpdate = null; };
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
      handleRemove,
    });

    return ce("div", { className: "se-panel-overlay", onClick: handleOverlayClick },
      ce("div", { className: "se-panel-container" },
        ce("div", { className: "se-panel-header" },
          ce("h2", { className: "se-panel-title" }, "Shadow Exchange"),
          ce("div", { className: "se-header-actions" },
            ce("button", { className: "se-mark-btn", onClick: handleMark }, "Mark Current Location"),
            ce("button", { className: "se-close-btn", onClick: onClose }, "×")
          )
        ),
        ce("div", { className: "se-panel-controls" },
          ce("select", {
            className: "se-sort-select",
            value: sortBy,
            onChange: handleSortChange,
          },
          ce("option", { value: "created" }, "Newest First"),
          ce("option", { value: "visited" }, "Recently Visited"),
          ce("option", { value: "name" }, "Name"),
          ce("option", { value: "rank" }, "Shadow Rank")),
          ce("input", {
            type: "text",
            className: "se-search-input",
            placeholder: "Search waypoints...",
            value: searchInput,
            onChange: handleSearchChange,
          })
        ),
        ce("div", { className: "se-waypoint-list" }, listContent),
        ce("div", { className: "se-panel-footer" },
          ce("span", { className: "se-wp-count" },
            `${totalWaypoints} waypoint${totalWaypoints !== 1 ? "s" : ""}`
          ),
          ce("span", { className: "se-shadow-avail" },
            `${availCount} shadow${availCount !== 1 ? "s" : ""} available`
          )
        )
      )
    );
  };
}

function buildPanelComponents(BdApi, pluginInstance) {
  const React = BdApi.React;
  const WaypointCard = createWaypointCard(React, pluginInstance);
  const WaypointPanel = createWaypointPanel(React, pluginInstance, WaypointCard);
  return { WaypointPanel, WaypointCard };
}

module.exports = {
  buildPanelComponents,
};
