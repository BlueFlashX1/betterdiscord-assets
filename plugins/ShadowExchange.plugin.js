/**
 * @name ShadowExchange
 * @description Shadow waypoint bookmark system — station shadows at Discord locations and teleport to them instantly. Solo Leveling themed.
 * @version 2.0.0
 * @author matthewthompson
 *
 * ============================================================================
 * REACT PANEL ARCHITECTURE (v2.0.0)
 * ============================================================================
 *
 * The waypoint panel is now a React component tree rendered via
 * BdApi.ReactDOM.createPortal into a body-level container.  This replaces
 * the v1.x template-literal innerHTML approach that required manual event
 * delegation, cloneNode listener dedup, and full innerHTML replacement on
 * every search/sort change.
 *
 * What changed:
 *   - Panel UI: React functional components with useState/useCallback
 *   - Search/sort: React state → automatic re-render (no innerHTML replace)
 *   - Event handling: React onClick props (no data-action delegation)
 *   - Card list: React keys for identity (no cloneNode hack)
 *
 * What did NOT change:
 *   - Swirl icon: still direct DOM on document.body (z-index escape)
 *   - Context menu: still BdApi.ContextMenu.patch (already React-based)
 *   - Persistence: identical BdApi.Data + file backup
 *   - Navigation: identical NavigationUtils.transitionTo
 *   - Shadow assignment: identical ShadowArmy integration
 *   - CSS: identical stylesheet via BdApi.DOM.addStyle
 *   - Public API: getMarkedShadowIds(), isShadowMarked()
 */

// ─── Constants ─────────────────────────────────────────────────────────────

const SE_PLUGIN_ID = "ShadowExchange";
const SE_VERSION = "2.0.0";
const SE_STYLE_ID = "shadow-exchange-css";
const SE_SWIRL_ID = "se-swirl-icon";
const SE_PANEL_CONTAINER_ID = "se-panel-root";
const TRANSITION_ID = "se-transition-overlay";

const RANK_ORDER = [
  "E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+", "NH",
  "Monarch", "Monarch+", "Shadow Monarch",
];

const RANK_COLORS = {
  E: "#808080", D: "#8B4513", C: "#FF6347", B: "#FFD700",
  A: "#00CED1", S: "#FF69B4", SS: "#9b59b6", SSS: "#e74c3c",
  "SSS+": "#f39c12", NH: "#1abc9c", Monarch: "#e91e63",
  "Monarch+": "#ff5722", "Shadow Monarch": "#7c4dff",
};

const FALLBACK_SHADOWS = [
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
  { name: "Shadow Apex", rank: "Shadow Monarch" },
];

// ─── Utility ───────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

// ─── Transition CSS ────────────────────────────────────────────────────────
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

// ─── React Components ──────────────────────────────────────────────────────

function buildPanelComponents(pluginInstance) {
  const React = BdApi.React;
  const ce = React.createElement;

  // ── WaypointCard ────────────────────────────────────────────────────────

  function WaypointCard({ wp, onTeleport, onRemove }) {
    const rankColor = RANK_COLORS[wp.shadowRank] || "#808080";
    const typeBadge = getTypeBadge(wp.locationType);
    const visits = wp.visitCount || 0;
    const timeStr = formatTimestamp(wp.createdAt);

    const fullLocation = wp.guildName
      ? `${wp.guildName} \u00BB #${wp.channelName}`
      : `DM \u00BB ${wp.channelName}`;

    // Message preview section
    let messageSection = null;
    if (wp.locationType === "message") {
      let preview = wp.messagePreview || "";
      let author = wp.messageAuthor || "";

      // Backfill from Discord cache
      if (!preview && wp.messageId && wp.channelId) {
        try {
          const cached = pluginInstance.MessageStore?.getMessage(wp.channelId, wp.messageId);
          if (cached) {
            if (cached.content) {
              preview = cached.content.length > 120 ? cached.content.slice(0, 120) + "\u2026" : cached.content;
              wp.messagePreview = preview;
            } else if (cached.embeds?.length) {
              preview = "[Embed]";
            } else if (cached.attachments?.size || cached.attachments?.length) {
              preview = "[Attachment]";
            }
            if (!author && cached.author) {
              author = cached.author.globalName || cached.author.username || "";
              wp.messageAuthor = author;
            }
          }
        } catch (error) {
          this.debugError("Panel", "Failed to parse message metadata for preview", error);
        }
      }

      messageSection = ce("div", { className: "se-message-preview" },
        author ? ce("span", { className: "se-msg-author" }, author + ":") : null,
        ce("span", { className: "se-msg-text" },
          preview || ce("em", { style: { color: "#666" } }, "Navigate to load preview")
        )
      );
    }

    return ce("div", {
      className: "se-waypoint-card",
      style: { borderLeftColor: rankColor },
    },
      // Top row: rank badge, shadow name, remove button
      ce("div", { className: "se-card-top" },
        ce("span", { className: "se-shadow-rank", style: { background: rankColor } }, wp.shadowRank),
        ce("span", { className: "se-shadow-name" }, wp.shadowName),
        ce("button", {
          className: "se-card-remove",
          title: "Recall shadow",
          onClick: (e) => { e.stopPropagation(); onRemove(wp.id); },
        }, "\u2716")
      ),
      // Body: location, message preview, meta
      ce("div", { className: "se-card-body" },
        ce("div", { className: "se-location-label" }, fullLocation),
        messageSection,
        ce("div", { className: "se-location-meta" },
          ce("span", { className: "se-type-badge" }, typeBadge),
          ce("span", { className: "se-visit-count" }, `${visits} visit${visits !== 1 ? "s" : ""}`),
          ce("span", { className: "se-created-time" }, timeStr)
        )
      ),
      // Footer: teleport button
      ce("div", { className: "se-card-footer" },
        ce("button", {
          className: "se-teleport-btn",
          onClick: () => onTeleport(wp.id),
        }, "Teleport")
      )
    );
  }

  // ── WaypointPanel ───────────────────────────────────────────────────────

  function WaypointPanel({ onClose }) {
    const [searchQuery, setSearchQuery] = React.useState("");
    const [sortBy, setSortBy] = React.useState(pluginInstance.settings.sortBy || "created");
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
    const [availCount, setAvailCount] = React.useState(0);

    // Load available shadow count on mount
    React.useEffect(() => {
      let cancelled = false;
      pluginInstance.getAvailableShadowCount().then((count) => {
        if (!cancelled) setAvailCount(count);
      });
      return () => { cancelled = true; };
    }, []);

    // Store refresh callback so business logic can trigger re-render
    React.useEffect(() => {
      pluginInstance._panelForceUpdate = forceUpdate;
      return () => { pluginInstance._panelForceUpdate = null; };
    }, [forceUpdate]);

    // Escape key handler
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

    // Deferred save for message preview backfill
    React.useEffect(() => {
      const timer = setTimeout(() => pluginInstance.saveSettings(), 500);
      return () => clearTimeout(timer);
    }, []);

    // Filter + sort waypoints
    const waypoints = React.useMemo(() => {
      let wps = [...pluginInstance.settings.waypoints];

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        wps = wps.filter(
          (w) =>
            w.label.toLowerCase().includes(q) ||
            w.shadowName.toLowerCase().includes(q) ||
            w.channelName.toLowerCase().includes(q) ||
            w.guildName.toLowerCase().includes(q) ||
            (w.messagePreview || "").toLowerCase().includes(q) ||
            (w.messageAuthor || "").toLowerCase().includes(q)
        );
      }

      if (sortBy === "created") wps.sort((a, b) => b.createdAt - a.createdAt);
      else if (sortBy === "visited") wps.sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0));
      else if (sortBy === "name") wps.sort((a, b) => a.label.localeCompare(b.label));
      else if (sortBy === "rank") {
        wps.sort((a, b) => RANK_ORDER.indexOf(b.shadowRank) - RANK_ORDER.indexOf(a.shadowRank));
      }

      return wps;
    }, [searchQuery, sortBy, pluginInstance.settings.waypoints.length]);

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

    // Build list content
    let listContent;
    if (waypoints.length === 0) {
      listContent = ce("div", { className: "se-empty-state" },
        ce("div", { className: "se-empty-icon" }, "\u2693"),
        ce("div", { className: "se-empty-text" },
          searchQuery ? "No waypoints match your search" : "No waypoints yet"
        ),
        ce("div", { className: "se-empty-hint" },
          searchQuery ? "Try a different search" : 'Click "Mark Current Location" to station a shadow'
        )
      );
    } else {
      listContent = waypoints.map((wp) =>
        ce(WaypointCard, {
          key: wp.id,
          wp,
          onTeleport: handleTeleport,
          onRemove: handleRemove,
        })
      );
    }

    return ce("div", { className: "se-panel-overlay", onClick: handleOverlayClick },
      ce("div", { className: "se-panel-container" },
        // Header
        ce("div", { className: "se-panel-header" },
          ce("h2", { className: "se-panel-title" }, "Shadow Exchange"),
          ce("div", { className: "se-header-actions" },
            ce("button", { className: "se-mark-btn", onClick: handleMark }, "Mark Current Location"),
            ce("button", { className: "se-close-btn", onClick: onClose }, "\u00D7")
          )
        ),
        // Controls: sort + search
        ce("div", { className: "se-panel-controls" },
          ce("select", {
            className: "se-sort-select",
            value: sortBy,
            onChange: handleSortChange,
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
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value),
          })
        ),
        // Waypoint list
        ce("div", { className: "se-waypoint-list" }, listContent),
        // Footer
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
  }

  return { WaypointPanel, WaypointCard };
}

// ─── Shared Utilities ─────────────────────────────────────────────────────
let _ReactUtils;
try { _ReactUtils = require('./BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }

// ─── Plugin Class ──────────────────────────────────────────────────────────

module.exports = class ShadowExchange {
  // ── Lifecycle ──────────────────────────────────────────────────────────

  constructor() {
    this._panelForceUpdate = null;
    this._panelContainer = null;
    this._transitionNavTimeout = null;
    this._transitionCleanupTimeout = null;
    this._transitionRunId = 0;
    this._transitionStopCanvas = null;
    this._navigateRetryTimers = new Set();
    this._navigateRequestId = 0;
    this._channelFadeToken = 0;
    this._channelFadeResetTimer = null;
    this._NavigationUtils = null;
  }

  start() {
    try {
      this.panelOpen = false;
      this.swirlIcon = null;
      this.fallbackIdx = 0;
      this.fileBackupPath = null;
      this._panelForceUpdate = null;
      this._panelContainer = null;
      this._transitionNavTimeout = null;
      this._transitionCleanupTimeout = null;
      this._transitionRunId = 0;
      this._transitionStopCanvas = null;
      this._navigateRetryTimers = new Set();
      this._navigateRequestId = 0;
      this._channelFadeToken = 0;
      this._channelFadeResetTimer = null;
      this.defaultSettings = {
        waypoints: [],
        sortBy: "created",
        debug: false,
        animationEnabled: true,
        respectReducedMotion: false,
        animationDuration: 550,
        _metadata: { lastSave: null, version: SE_VERSION },
      };
      this.settings = { ...this.defaultSettings, waypoints: [] };

      this.initWebpack();
      this.initBackupPath();
      this.loadSettings();
      this.injectCSS();

      // Build React components (cached for this plugin instance)
      this._components = buildPanelComponents(this);

      // Swirl icon — simple body-level DOM injection (fixed-position overlay).
      this.injectSwirlIcon();

      // Right-click context menu on messages → "Shadow Mark"
      this.patchContextMenu();

      BdApi.UI.showToast(
        `ShadowExchange v${SE_VERSION} active`,
        { type: "success", timeout: 2200 }
      );
    } catch (err) {
      console.error("[ShadowExchange] start() failed:", err);
      BdApi.UI.showToast("ShadowExchange failed to start", { type: "error" });
    }
  }

  stop() {
    try {
      if (this._unpatchContextMenu) {
        this._unpatchContextMenu();
        this._unpatchContextMenu = null;
      }
      this.closePanel();
      this._cancelPendingTransition();
      this._clearNavigateRetries();
      this._cancelChannelViewFade();
      this.removeSwirlIcon();
      this.removeCSS();
    } catch (err) {
      console.error("[ShadowExchange] stop() failed:", err);
    }
  }

  // ── Webpack Modules ────────────────────────────────────────────────────

  initWebpack() {
    try {
      this._NavigationUtils = BdApi.Webpack.getModule(
        (m) => m?.transitionTo && m?.back && m?.forward
      );
      this.NavigationUtils = this._NavigationUtils;
    } catch (_) {
      this._NavigationUtils = null;
      this.NavigationUtils = null;
    }
    try {
      this.ChannelStore = BdApi.Webpack.getModule(
        (m) => m?.getChannel && m?.getDMFromUserId
      );
    } catch (_) {
      this.ChannelStore = null;
    }
    try {
      this.GuildStore = BdApi.Webpack.getModule(
        (m) => m?.getGuild && m?.getGuilds
      );
    } catch (_) {
      this.GuildStore = null;
    }
    try {
      this.MessageStore = BdApi.Webpack.getModule(
        (m) => m?.getMessage && m?.getMessages
      );
    } catch (_) {
      this.MessageStore = null;
    }
    try {
      this.UserStore = BdApi.Webpack.getModule(
        (m) => m?.getUser && m?.getCurrentUser
      );
    } catch (_) {
      this.UserStore = null;
    }
  }

  // ── Context Menu (right-click → Shadow Mark) ──────────────────────────

  patchContextMenu() {
    try {
      this._unpatchContextMenu = BdApi.ContextMenu.patch("message", (tree, props) => {
        try {
          const { message, channel } = props;
          if (!message || !channel) return;

          const existingWaypoint = this.settings.waypoints.find(
            (w) => w.channelId === channel.id && w.messageId === message.id
          );

          const separator = BdApi.ContextMenu.buildItem({ type: "separator" });

          let item;
          if (existingWaypoint) {
            item = BdApi.ContextMenu.buildItem({
              type: "text",
              label: `Shadow Unmark (${existingWaypoint.shadowName})`,
              id: "shadow-exchange-unmark",
              action: () => {
                this.removeWaypoint(existingWaypoint.id);
                BdApi.UI.showToast(
                  `${existingWaypoint.shadowName} recalled — available for deployment`,
                  { type: "info" }
                );
              },
            });
          } else {
            item = BdApi.ContextMenu.buildItem({
              type: "text",
              label: "Shadow Mark",
              id: "shadow-exchange-mark",
              action: () => this.markMessage(channel, message),
            });
          }

          const children = tree?.props?.children;
          if (Array.isArray(children)) {
            children.push(separator, item);
          } else if (children?.props?.children && Array.isArray(children.props.children)) {
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
  async markMessage(channel, message) {
    const channelId = channel.id;
    const guildId = channel.guild_id || null;
    const messageId = message.id;

    const dup = this.settings.waypoints.find(
      (w) => w.channelId === channelId && w.messageId === messageId
    );
    if (dup) {
      BdApi.UI.showToast(`Already marked: ${dup.label}`, { type: "warning" });
      return;
    }

    let channelName = channel.name || "DM";
    let guildName = guildId ? "Unknown Server" : "Direct Messages";

    try {
      if (guildId) {
        const guild = this.GuildStore?.getGuild(guildId);
        if (guild) guildName = guild.name;
      }
      if (!channel.name && channel.recipients?.length) channelName = "DM";
    } catch (error) {
      this.debugError("Mark", "Failed to resolve guild/channel labels for message waypoint", error);
    }

    const shadow = await this.getWeakestAvailableShadow();
    if (!shadow) {
      BdApi.UI.showToast("No shadows available!", { type: "error" });
      return;
    }

    const label = guildId
      ? `${guildName} \u00BB #${channelName}`
      : `DM \u00BB ${channelName}`;

    let messagePreview = "";
    try {
      if (message.content) {
        messagePreview = message.content.length > 120
          ? message.content.slice(0, 120) + "\u2026"
          : message.content;
      } else if (message.embeds?.length) {
        messagePreview = "[Embed]";
      } else if (message.attachments?.length) {
        messagePreview = `[${message.attachments.length} attachment${message.attachments.length > 1 ? "s" : ""}]`;
      }
    } catch (error) {
      this.debugError("Mark", "Failed to build message preview text", error);
    }

    let messageAuthor = "";
    try {
      if (message.author) {
        messageAuthor = message.author.globalName || message.author.username || "";
      }
    } catch (error) {
      this.debugError("Mark", "Failed to read message author for waypoint", error);
    }

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
      messageAuthor,
    };

    this.settings.waypoints.push(waypoint);
    this.saveSettings();
    this._triggerPanelRefresh();

    BdApi.UI.showToast(`${shadow.name} stationed at message in ${label}`, { type: "success" });
  }

  // ── Persistence ────────────────────────────────────────────────────────

  initBackupPath() {
    try {
      const pathModule = require("path");
      const fs = require("fs");
      const appSupport = pathModule.resolve(BdApi.Plugins.folder, "..", "..");
      const backupDir = pathModule.join(appSupport, "discord", "SoloLevelingBackups");
      fs.mkdirSync(backupDir, { recursive: true });
      this.fileBackupPath = pathModule.join(backupDir, "ShadowExchange.json");
    } catch (_) {
      this.fileBackupPath = null;
    }
  }

  loadSettings() {
    const candidates = [];

    try {
      const bd = BdApi.Data.load(SE_PLUGIN_ID, "settings");
      if (bd && typeof bd === "object") {
        candidates.push({ source: "bdapi", data: bd });
      }
    } catch (error) {
      this.debugError("Settings", "Failed to load settings from BdApi.Data", error);
    }

    try {
      const file = this.readFileBackup();
      if (file && typeof file === "object") {
        candidates.push({ source: "file", data: file });
      }
    } catch (error) {
      this.debugError("Settings", "Failed to load settings from file backup", error);
    }

    if (candidates.length === 0) {
      this.settings = { ...this.defaultSettings, waypoints: [] };
      return;
    }

    const score = (c) => {
      const wps = Array.isArray(c.data.waypoints) ? c.data.waypoints.length : 0;
      const ts = c.data._metadata?.lastSave
        ? new Date(c.data._metadata.lastSave).getTime() || 0
        : 0;
      return wps * 1000 + ts / 1e10;
    };
    candidates.sort((a, b) => score(b) - score(a));

    const best = candidates[0].data;
    this.settings = {
      ...this.defaultSettings,
      ...best,
      waypoints: Array.isArray(best.waypoints) ? best.waypoints : [],
    };
  }

  saveSettings() {
    this.settings._metadata = {
      lastSave: new Date().toISOString(),
      version: SE_VERSION,
    };

    try {
      BdApi.Data.save(SE_PLUGIN_ID, "settings", this.settings);
    } catch (err) {
      console.error("[ShadowExchange] BdApi.Data.save failed:", err);
    }

    this.writeFileBackup(this.settings);
  }

  readFileBackup() {
    if (!this.fileBackupPath) return null;
    try {
      const fs = require("fs");
      const paths = [this.fileBackupPath];
      for (let i = 1; i <= 5; i++) paths.push(`${this.fileBackupPath}.bak${i}`);

      const candidates = [];
      for (const p of paths) {
        try {
          if (!fs.existsSync(p)) continue;
          const raw = fs.readFileSync(p, "utf8");
          const data = JSON.parse(raw);
          const wps = Array.isArray(data.waypoints) ? data.waypoints.length : 0;
          candidates.push({ data, quality: wps, path: p });
        } catch (error) {
          this.debugError("Settings", `Failed to parse backup candidate ${p}`, error);
        }
      }
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.quality - a.quality);
      return candidates[0].data;
    } catch (_) {
      return null;
    }
  }

  writeFileBackup(data) {
    if (!this.fileBackupPath) return;
    try {
      const fs = require("fs");

      for (let i = 4; i >= 0; i--) {
        const src = i === 0 ? this.fileBackupPath : `${this.fileBackupPath}.bak${i}`;
        const dest = `${this.fileBackupPath}.bak${i + 1}`;
        try {
          if (fs.existsSync(src)) {
            fs.writeFileSync(dest, fs.readFileSync(src));
          }
        } catch (error) {
          this.debugError("Settings", `Failed rotating backup ${src} -> ${dest}`, error);
        }
      }

      const json = JSON.stringify(data, null, 2);
      fs.writeFile(this.fileBackupPath, json, "utf8", (err) => {
        if (err) console.error("[ShadowExchange] File backup write failed:", err);
      });
    } catch (err) {
      console.error("[ShadowExchange] writeFileBackup error:", err);
    }
  }

  debugLog(system, ...args) {
    if (this.settings?.debug) console.log(`[ShadowExchange][${system}]`, ...args);
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
    return new Set(
      (this.settings?.waypoints || [])
        .map((w) => w.shadowId)
        .filter(Boolean)
    );
  }

  /**
   * Check if a specific shadow is stationed at a waypoint.
   */
  isShadowMarked(shadowId) {
    if (!shadowId || !this.settings?.waypoints) return false;
    return this.settings.waypoints.some((w) => w.shadowId === shadowId);
  }

  // ── Shadow Assignment ────────────────────────────────────────────────

  async getWeakestAvailableShadow() {
    const saPlugin = BdApi.Plugins.get("ShadowArmy");
    const saInstance = saPlugin?.instance;

    if (!saInstance || typeof saInstance.getAllShadows !== "function") {
      return this.getFallbackShadow();
    }

    try {
      // CROSS-PLUGIN SNAPSHOT: Use ShadowArmy's shared snapshot if fresh, else fall back to IDB
      const allShadows = saInstance.getShadowSnapshot?.() || await saInstance.getAllShadows();
      if (!Array.isArray(allShadows) || allShadows.length === 0) {
        return this.getFallbackShadow();
      }

      const assignedIds = new Set(this.settings.waypoints.map((w) => w.shadowId));
      const available = allShadows.filter((s) => s?.id && !assignedIds.has(s.id));

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
        source: "army",
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
      source: "fallback",
    };
  }

  async getAvailableShadowCount() {
    const saPlugin = BdApi.Plugins.get("ShadowArmy");
    const saInstance = saPlugin?.instance;
    if (!saInstance || typeof saInstance.getAllShadows !== "function") {
      return FALLBACK_SHADOWS.length - this.settings.waypoints.length;
    }
    try {
      // CROSS-PLUGIN SNAPSHOT: Use ShadowArmy's shared snapshot if fresh, else fall back to IDB
      const all = saInstance.getShadowSnapshot?.() || await saInstance.getAllShadows();
      const assignedIds = new Set(this.settings.waypoints.map((w) => w.shadowId));
      return all.filter((s) => s?.id && !assignedIds.has(s.id)).length;
    } catch (_) {
      return 0;
    }
  }

  // ── Location Detection ─────────────────────────────────────────────────

  getCurrentLocation() {
    const urlPattern = /channels\/(@me|(\d+))\/(\d+)(?:\/(\d+))?/;
    const match = window.location.href.match(urlPattern);
    if (!match) return null;

    const [, guildIdOrMe, guildIdNum, channelId, messageId] = match;
    const guildId = guildIdOrMe === "@me" ? null : guildIdNum || guildIdOrMe;

    let channelName = "Unknown";
    let guildName = guildId ? "Unknown Server" : "Direct Messages";
    let locationType = "channel";

    try {
      const channel = this.ChannelStore?.getChannel(channelId);
      if (channel) {
        channelName = channel.name || (channel.recipients?.length ? "DM" : "Unknown");
        if (channel.isThread && channel.isThread()) locationType = "thread";
        else if (!guildId) locationType = "dm";
      }
    } catch (error) {
      this.debugError("Location", "Failed to resolve channel metadata for current location", error);
    }

    try {
      if (guildId) {
        const guild = this.GuildStore?.getGuild(guildId);
        if (guild) guildName = guild.name;
      }
    } catch (error) {
      this.debugError("Location", "Failed to resolve guild metadata for current location", error);
    }

    if (messageId) locationType = "message";

    return { guildId, channelId, messageId: messageId || null, channelName, guildName, locationType };
  }

  // ── Marking ────────────────────────────────────────────────────────────

  async markCurrentLocation() {
    const loc = this.getCurrentLocation();
    if (!loc) {
      BdApi.UI.showToast("Navigate to a channel first", { type: "warning" });
      return;
    }

    const dup = this.settings.waypoints.find(
      (w) => w.channelId === loc.channelId && w.messageId === loc.messageId
    );
    if (dup) {
      BdApi.UI.showToast(`Already marked: ${dup.label}`, { type: "warning" });
      return;
    }

    const shadow = await this.getWeakestAvailableShadow();
    if (!shadow) {
      BdApi.UI.showToast("No shadows available!", { type: "error" });
      return;
    }

    const label =
      loc.guildId
        ? `${loc.guildName} \u00BB #${loc.channelName}`
        : `DM \u00BB ${loc.channelName}`;

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
      messageAuthor: "",
    };

    this.settings.waypoints.push(waypoint);
    this.saveSettings();
    this._triggerPanelRefresh();

    BdApi.UI.showToast(`${shadow.name} stationed at ${label}`, { type: "success" });
  }

  removeWaypoint(waypointId) {
    const idx = this.settings.waypoints.findIndex((w) => w.id === waypointId);
    if (idx === -1) return;
    const wp = this.settings.waypoints[idx];
    this.settings.waypoints.splice(idx, 1);
    this.saveSettings();
    this._triggerPanelRefresh();
    BdApi.UI.showToast(`${wp.shadowName} recalled from ${wp.label}`, { type: "info" });
  }

  renameWaypoint(waypointId, newLabel) {
    const wp = this.settings.waypoints.find((w) => w.id === waypointId);
    if (!wp) return;
    wp.label = newLabel.trim() || wp.label;
    this.saveSettings();
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  teleportTo(waypointId) {
    const wp = this.settings.waypoints.find((w) => w.id === waypointId);
    if (!wp) return;

    let url = "/channels/";
    url += wp.guildId || "@me";
    url += `/${wp.channelId}`;
    if (wp.messageId) url += `/${wp.messageId}`;

    // Close panel first so target channel is visible during reveal.
    this.closePanel();

    wp.lastVisited = Date.now();
    wp.visitCount = (wp.visitCount || 0) + 1;
    this.saveSettings();

    this.playTransition(() => {
      const fadeToken = this._beginChannelViewFadeOut();
      this._navigate(url, {
        waypointId: wp.id,
        waypointLabel: wp.label,
        channelId: wp.channelId,
      }, {
        onConfirmed: () => this._finishChannelViewFade(fadeToken, true),
        onFailed: () => this._finishChannelViewFade(fadeToken, false),
      });
    });

    BdApi.UI.showToast(`Exchanged to ${wp.label}`, { type: "success", timeout: 2500 });
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
        BdApi.UI.showToast("Shadow Exchange failed to switch channel", { type: "error" });
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

  // ── Panel refresh bridge (imperative → React) ─────────────────────────

  _triggerPanelRefresh() {
    if (this._panelForceUpdate) {
      this._panelForceUpdate();
    }
  }

  // ── Swirl Icon (body-level DOM injection) ──────────────────────────────

  /**
   * Inject the swirl icon directly onto document.body as a fixed-position
   * overlay.  Body-level injection is intentional — the icon must sit above
   * all React stacking contexts (LPB container, Discord modals, etc.).
   */
  injectSwirlIcon() {
    if (document.getElementById(SE_SWIRL_ID)) return;

    const icon = document.createElement("div");
    icon.id = SE_SWIRL_ID;
    icon.className = "se-swirl-icon";
    icon.title = "Shadow Exchange — Waypoints";
    icon.innerHTML = [
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">',
      '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="rgba(138,43,226,0.15)"/>',
      '<path d="M12 4c1.5 0 3.5 1.2 4.2 3.5.5 1.5.2 3.2-.8 4.5l-3.4 4-3.4-4c-1-1.3-1.3-3-.8-4.5C8.5 5.2 10.5 4 12 4z" fill="#9b59b6" opacity="0.9"/>',
      '<circle cx="12" cy="9.5" r="2" fill="#c39bd3"/>',
      '<path d="M8 15c1.2 1.5 2.5 2.2 4 2.2s2.8-.7 4-2.2" stroke="#9b59b6" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
      '<path d="M9.5 18c.8.7 1.6 1 2.5 1s1.7-.3 2.5-1" stroke="#7d3c98" stroke-width="1" fill="none" stroke-linecap="round"/>',
      "</svg>",
    ].join("");

    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.togglePanel();
    });

    // Inject into LPB container so icon is anchored to the progress bar
    const lpb = document.getElementById("lpb-progress-container");
    icon.dataset.lpbPosition = lpb?.classList.contains("bottom") ? "bottom" : "top";

    if (lpb) {
      lpb.appendChild(icon);
    } else {
      document.body.appendChild(icon);
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
    if (_ReactUtils?.getCreateRoot) return _ReactUtils.getCreateRoot();
    // Minimal inline fallback
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  }

  openPanel() {
    if (this.panelOpen) return;
    this.panelOpen = true;

    try {
      // Create container for React root
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

      // React 18: createRoot API
      const createRoot = this._getCreateRoot();
      if (createRoot) {
        const root = createRoot(container);
        this._reactRoot = root;
        root.render(element);
        return;
      }

      // React 17 fallback: legacy ReactDOM.render
      const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule(
        (m) => m?.render && m?.unmountComponentAtNode
      );
      if (ReactDOM?.render) {
        ReactDOM.render(element, container);
        return;
      }

      // Last resort: manual DOM rendering (non-React fallback)
      console.error("[ShadowExchange] Neither createRoot nor ReactDOM.render available");
      this.panelOpen = false;
      container.remove();
      BdApi.UI.showToast("ShadowExchange: React rendering unavailable", { type: "error" });
    } catch (err) {
      console.error("[ShadowExchange] openPanel() failed:", err);
      this.panelOpen = false;
      BdApi.UI.showToast("ShadowExchange: panel error", { type: "error" });
    }
  }

  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = false;

    // React 18: unmount via root
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
      // React 17 fallback cleanup
      try {
        const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule(
          (m) => m?.unmountComponentAtNode
        );
        if (ReactDOM?.unmountComponentAtNode) ReactDOM.unmountComponentAtNode(container);
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
    const css = `
${buildPortalTransitionCSS()}

      /* ── Swirl Icon (fixed-position, outside React tree) ───────── */
      .se-swirl-icon {
        position: absolute;
        right: 20px;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 2px solid rgba(138, 43, 226, 0.6);
        background: rgba(10, 10, 20, 0.7);
        cursor: pointer;
        opacity: 0.85;
        transition: opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        pointer-events: auto;
      }
      /* Position based on LPB top/bottom mode */
      .se-swirl-icon[data-lpb-position="top"] {
        top: 5px;
      }
      .se-swirl-icon[data-lpb-position="bottom"] {
        bottom: 10px;
      }
      /* Fallback if data attribute not set yet — default to top */
      .se-swirl-icon:not([data-lpb-position]) {
        top: 5px;
      }
      .se-swirl-icon:hover {
        opacity: 1;
        transform: scale(1.15);
        border-color: rgba(138, 43, 226, 1);
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.6);
      }

      /* ── Panel Overlay ─────────────────────────────────────────────── */
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

      /* ── Panel Container ───────────────────────────────────────────── */
      .se-panel-container {
        width: 650px;
        max-height: 82vh;
        background: #1e1e2e;
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 14px;
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

      /* ── Header ────────────────────────────────────────────────────── */
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
        border-radius: 6px;
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

      /* ── Controls ──────────────────────────────────────────────────── */
      .se-panel-controls {
        display: flex;
        gap: 8px;
        padding: 10px 18px;
        border-bottom: 1px solid rgba(138, 43, 226, 0.12);
      }
      .se-sort-select, .se-search-input {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-radius: 6px;
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

      /* ── Waypoint List ─────────────────────────────────────────────── */
      .se-waypoint-list {
        flex: 1;
        overflow-y: auto;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 120px;
        max-height: 55vh;
      }
      .se-waypoint-list::-webkit-scrollbar {
        width: 6px;
      }
      .se-waypoint-list::-webkit-scrollbar-track {
        background: transparent;
      }
      .se-waypoint-list::-webkit-scrollbar-thumb {
        background: rgba(138, 43, 226, 0.3);
        border-radius: 3px;
      }

      /* ── Empty State ───────────────────────────────────────────────── */
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

      /* ── Waypoint Card ─────────────────────────────────────────────── */
      .se-waypoint-card {
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(138, 43, 226, 0.12);
        border-left: 3px solid #808080;
        border-radius: 8px;
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
        border-radius: 3px;
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
        border-radius: 4px;
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
        border-radius: 3px;
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

      /* ── Message Preview ──────────────────────────────────────── */
      .se-message-preview {
        background: rgba(0, 0, 0, 0.2);
        border-left: 2px solid rgba(138, 43, 226, 0.3);
        border-radius: 0 4px 4px 0;
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
        border-radius: 5px;
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

      /* ── Footer ────────────────────────────────────────────────────── */
      .se-panel-footer {
        display: flex;
        justify-content: space-between;
        padding: 10px 18px;
        border-top: 1px solid rgba(138, 43, 226, 0.12);
        font-size: 11px;
        color: #777;
      }
    `;

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
