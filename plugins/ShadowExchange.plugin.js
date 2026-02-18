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
        } catch (_) {}
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

// ─── Plugin Class ──────────────────────────────────────────────────────────

module.exports = class ShadowExchange {
  // ── Lifecycle ──────────────────────────────────────────────────────────

  constructor() {
    this._panelForceUpdate = null;
    this._panelContainer = null;
  }

  start() {
    try {
      this.panelOpen = false;
      this.swirlIcon = null;
      this.fallbackIdx = 0;
      this.fileBackupPath = null;
      this._panelForceUpdate = null;
      this._panelContainer = null;
      this.defaultSettings = {
        waypoints: [],
        sortBy: "created",
        debug: false,
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
      this.removeSwirlIcon();
      this.removeCSS();
    } catch (err) {
      console.error("[ShadowExchange] stop() failed:", err);
    }
  }

  // ── Webpack Modules ────────────────────────────────────────────────────

  initWebpack() {
    try {
      this.NavigationUtils = BdApi.Webpack.getModule(
        (m) => m?.transitionTo && m?.back && m?.forward
      );
    } catch (_) {
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
    } catch (_) {}

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
    } catch (_) {}

    let messageAuthor = "";
    try {
      if (message.author) {
        messageAuthor = message.author.globalName || message.author.username || "";
      }
    } catch (_) {}

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
    } catch (_) {}

    try {
      const file = this.readFileBackup();
      if (file && typeof file === "object") {
        candidates.push({ source: "file", data: file });
      }
    } catch (_) {}

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
        } catch (_) {}
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
        } catch (_) {}
      }

      const json = JSON.stringify(data, null, 2);
      fs.writeFile(this.fileBackupPath, json, "utf8", (err) => {
        if (err) console.error("[ShadowExchange] File backup write failed:", err);
      });
    } catch (err) {
      console.error("[ShadowExchange] writeFileBackup error:", err);
    }
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
      const allShadows = await saInstance.getAllShadows();
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
      const all = await saInstance.getAllShadows();
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
    } catch (_) {}

    try {
      if (guildId) {
        const guild = this.GuildStore?.getGuild(guildId);
        if (guild) guildName = guild.name;
      }
    } catch (_) {}

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

    if (this.NavigationUtils?.transitionTo) {
      this.NavigationUtils.transitionTo(url);
    } else {
      try {
        const nav = BdApi.Webpack.getModule(
          (m) => m?.transitionTo && typeof m.transitionTo === "function",
          { searchExports: true }
        );
        if (nav?.transitionTo) {
          nav.transitionTo(url);
        } else {
          history.pushState({}, "", url);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      } catch (_) {
        history.pushState({}, "", url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }

    wp.lastVisited = Date.now();
    wp.visitCount = (wp.visitCount || 0) + 1;
    this.saveSettings();
    this.closePanel();

    BdApi.UI.showToast(`Exchanged to ${wp.label}`, { type: "success", timeout: 2500 });
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
    // Try BdApi.ReactDOM.createRoot (if BdApi exposes it)
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    // Webpack: find react-dom/client module with createRoot
    try {
      const client = BdApi.Webpack.getModule((m) => m?.createRoot && m?.hydrateRoot);
      if (client?.createRoot) return client.createRoot.bind(client);
    } catch (_) {}
    // Webpack: find createRoot as an individual export
    try {
      const createRoot = BdApi.Webpack.getModule(
        (m) => typeof m === "function" && m?.name === "createRoot",
        { searchExports: true }
      );
      if (createRoot) return createRoot;
    } catch (_) {}
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
      try { this._reactRoot.unmount(); } catch (_) {}
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
      } catch (_) {}
      container.remove();
    }
    this._panelContainer = null;
    this._panelForceUpdate = null;
  }

  // ── CSS ────────────────────────────────────────────────────────────────

  injectCSS() {
    const css = `
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
