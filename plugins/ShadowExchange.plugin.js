/**
 * @name ShadowExchange
 * @description Shadow waypoint bookmark system — station shadows at Discord locations and teleport to them instantly. Solo Leveling themed.
 * @version 1.1.0
 * @author matthewthompson
 */

module.exports = class ShadowExchange {
  // ── Constants ──────────────────────────────────────────────────────────
  static PLUGIN_ID = "ShadowExchange";
  static VERSION = "1.1.0";
  static STYLE_ID = "shadow-exchange-css";
  static SWIRL_ID = "se-swirl-icon";
  static PANEL_ID = "se-waypoint-panel";

  static RANK_ORDER = [
    "E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+", "NH",
    "Monarch", "Monarch+", "Shadow Monarch",
  ];

  static RANK_COLORS = {
    E: "#808080", D: "#8B4513", C: "#FF6347", B: "#FFD700",
    A: "#00CED1", S: "#FF69B4", SS: "#9b59b6", SSS: "#e74c3c",
    "SSS+": "#f39c12", NH: "#1abc9c", Monarch: "#e91e63",
    "Monarch+": "#ff5722", "Shadow Monarch": "#7c4dff",
  };

  static FALLBACK_SHADOWS = [
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

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start() {
    try {
      this.panelOpen = false;
      this.swirlIcon = null;
      this.panelEl = null;
      this.lpbObserver = null;
      this.bodyObserver = null;
      this.escHandler = null;
      this.fallbackIdx = 0;
      this.fileBackupPath = null;

      this.defaultSettings = {
        waypoints: [],
        sortBy: "created",
        debug: false,
        _metadata: { lastSave: null, version: ShadowExchange.VERSION },
      };
      this.settings = { ...this.defaultSettings, waypoints: [] };

      this.initWebpack();
      this.initBackupPath();
      this.loadSettings();
      this.injectCSS();

      // Swirl icon lives on document.body (outside React tree).
      // Try immediate inject, retry after delay, and watch for LPB to appear.
      this.injectSwirlIcon();
      this._retryInject = setTimeout(() => this.injectSwirlIcon(), 1500);
      this._retryInject2 = setTimeout(() => this.injectSwirlIcon(), 5000);
      this.observeLPBChanges();

      // Right-click context menu on messages → "Shadow Mark"
      this.patchContextMenu();

      // Global Escape key to close panel
      this.escHandler = (e) => {
        if (e.key === "Escape" && this.panelOpen) {
          e.stopPropagation();
          this.closePanel();
        }
      };
      document.addEventListener("keydown", this.escHandler, true);

      BdApi.UI.showToast(
        `ShadowExchange v${ShadowExchange.VERSION} active`,
        { type: "success", timeout: 2200 }
      );
    } catch (err) {
      console.error("[ShadowExchange] start() failed:", err);
      BdApi.UI.showToast("ShadowExchange failed to start", { type: "error" });
    }
  }

  stop() {
    try {
      clearTimeout(this._retryInject);
      clearTimeout(this._retryInject2);
      if (this.escHandler) {
        document.removeEventListener("keydown", this.escHandler, true);
      }
      if (this._unpatchContextMenu) {
        this._unpatchContextMenu();
        this._unpatchContextMenu = null;
      }
      this.closePanel();
      this.removeSwirlIcon();
      if (this.bodyObserver) this.bodyObserver.disconnect();
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
  }

  // ── Context Menu (right-click → Shadow Mark) ──────────────────────────

  patchContextMenu() {
    try {
      this._unpatchContextMenu = BdApi.ContextMenu.patch("message", (retVal, props) => {
        const { message, channel } = props;
        if (!message || !channel) return;

        const item = BdApi.ContextMenu.buildItem({
          type: "text",
          label: "Shadow Mark",
          action: () => this.markMessage(channel, message),
        });

        // Append to end of context menu children
        retVal.props.children.push(
          BdApi.ContextMenu.buildItem({ type: "separator" }),
          item
        );
      });
    } catch (err) {
      console.error("[ShadowExchange] Context menu patch failed:", err);
    }
  }

  /**
   * Mark a specific message from the context menu.
   * @param {object} channel - Discord channel object
   * @param {object} message - Discord message object
   */
  async markMessage(channel, message) {
    const channelId = channel.id;
    const guildId = channel.guild_id || null;
    const messageId = message.id;

    // Duplicate check
    const dup = this.settings.waypoints.find(
      (w) => w.channelId === channelId && w.messageId === messageId
    );
    if (dup) {
      BdApi.UI.showToast(`Already marked: ${dup.label}`, { type: "warning" });
      return;
    }

    let channelName = channel.name || "DM";
    let guildName = guildId ? "Unknown Server" : "Direct Messages";
    let locationType = "message";

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

    const waypoint = {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      locationType,
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
    };

    this.settings.waypoints.push(waypoint);
    this.saveSettings();
    this.refreshPanel();

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

    // BdApi.Data
    try {
      const bd = BdApi.Data.load(ShadowExchange.PLUGIN_ID, "settings");
      if (bd && typeof bd === "object") {
        candidates.push({ source: "bdapi", data: bd });
      }
    } catch (_) {}

    // External file backup
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

    // Pick highest-quality (most waypoints, then most recent)
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
      version: ShadowExchange.VERSION,
    };

    try {
      BdApi.Data.save(ShadowExchange.PLUGIN_ID, "settings", this.settings);
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

      // Rotate backups: .bak4→.bak5, .bak3→.bak4, … main→.bak1
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

  // ── Public API (for cross-plugin integration) ───────────────────────────

  /**
   * Returns a Set of shadow IDs currently stationed at waypoints.
   * Other plugins (e.g., Dungeons) should exclude these from battle deployment.
   * @returns {Set<string>}
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
   * @param {string} shadowId
   * @returns {boolean}
   */
  isShadowMarked(shadowId) {
    if (!shadowId || !this.settings?.waypoints) return false;
    return this.settings.waypoints.some((w) => w.shadowId === shadowId);
  }

  // ── Shadow Assignment ──────────────────────────────────────────────────

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

      // Calculate total effective power for each shadow
      const withPower = available.map((shadow) => {
        let power = 0;
        try {
          if (typeof saInstance.getShadowEffectiveStats === "function") {
            const stats = saInstance.getShadowEffectiveStats(shadow);
            power = Object.values(stats).reduce((sum, v) => sum + (Number(v) || 0), 0);
          } else {
            // Fallback: use stored strength
            power = Number(shadow.strength) || 0;
          }
        } catch (_) {
          power = Number(shadow.strength) || 0;
        }
        return { shadow, power };
      });

      // Sort ascending → weakest first
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
    const pool = ShadowExchange.FALLBACK_SHADOWS;
    const assignedNames = new Set(this.settings.waypoints.map((w) => w.shadowName));
    const available = pool.filter((s) => !assignedNames.has(s.name));
    if (available.length > 0) return { ...available[0], id: `fallback_${Date.now()}`, source: "fallback" };

    // All fallback names used — generate numbered one
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
      return ShadowExchange.FALLBACK_SHADOWS.length - this.settings.waypoints.length;
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

    // Duplicate check
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
    };

    this.settings.waypoints.push(waypoint);
    this.saveSettings();
    this.refreshPanel();

    BdApi.UI.showToast(`${shadow.name} stationed at ${label}`, { type: "success" });
  }

  removeWaypoint(waypointId) {
    const idx = this.settings.waypoints.findIndex((w) => w.id === waypointId);
    if (idx === -1) return;
    const wp = this.settings.waypoints[idx];
    this.settings.waypoints.splice(idx, 1);
    this.saveSettings();
    this.refreshPanel();
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

    // Primary: use Discord's internal router (no reload)
    if (this.NavigationUtils?.transitionTo) {
      this.NavigationUtils.transitionTo(url);
    } else {
      // Secondary: try alternative Webpack lookup
      try {
        const nav = BdApi.Webpack.getModule(
          (m) => m?.transitionTo && typeof m.transitionTo === "function",
          { searchExports: true }
        );
        if (nav?.transitionTo) {
          nav.transitionTo(url);
        } else {
          // Last resort: push state + popstate (avoids full page reload)
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

  // ── Swirl Icon Injection ───────────────────────────────────────────────

  /**
   * Inject the swirl icon as a fixed-position element on document.body.
   *
   * The LPB progress bar is entirely React-managed — any child appended to
   * .lpb-progress-bar or #lpb-progress-container gets destroyed on the next
   * React reconciliation cycle.  Instead, the swirl icon lives as its own
   * independent fixed-position element anchored to the bar's visual location.
   */
  injectSwirlIcon() {
    if (document.getElementById(ShadowExchange.SWIRL_ID)) return;

    const container = document.getElementById("lpb-progress-container");
    if (!container) return;

    const icon = document.createElement("div");
    icon.id = ShadowExchange.SWIRL_ID;
    icon.className = "se-swirl-icon";
    icon.title = "Shadow Exchange — Waypoints";
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="rgba(138,43,226,0.15)"/>
      <path d="M12 4c1.5 0 3.5 1.2 4.2 3.5.5 1.5.2 3.2-.8 4.5l-3.4 4-3.4-4c-1-1.3-1.3-3-.8-4.5C8.5 5.2 10.5 4 12 4z" fill="#9b59b6" opacity="0.9"/>
      <circle cx="12" cy="9.5" r="2" fill="#c39bd3"/>
      <path d="M8 15c1.2 1.5 2.5 2.2 4 2.2s2.8-.7 4-2.2" stroke="#9b59b6" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M9.5 18c.8.7 1.6 1 2.5 1s1.7-.3 2.5-1" stroke="#7d3c98" stroke-width="1" fill="none" stroke-linecap="round"/>
    </svg>`;

    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.togglePanel();
    });

    // Append to document.body — completely outside React's managed tree.
    document.body.appendChild(icon);
    this.swirlIcon = icon;

    // Position the icon to match LPB location
    this._positionSwirlIcon();
  }

  /** Align the fixed-position swirl icon to the LPB progress bar's right side. */
  _positionSwirlIcon() {
    const icon = document.getElementById(ShadowExchange.SWIRL_ID);
    const container = document.getElementById("lpb-progress-container");
    if (!icon || !container) return;

    const isBottom = container.classList.contains("bottom");
    icon.dataset.lpbPosition = isBottom ? "bottom" : "top";
  }

  removeSwirlIcon() {
    const icon = document.getElementById(ShadowExchange.SWIRL_ID);
    if (icon) icon.remove();
    this.swirlIcon = null;
  }

  observeLPBChanges() {
    // Wait for the LPB container to appear, then inject swirl icon.
    // No need to observe React child changes since the icon lives on document.body.
    if (document.getElementById("lpb-progress-container")) {
      this.injectSwirlIcon();
      return;
    }

    // LPB container not in DOM yet — watch body for it
    this.bodyObserver = new MutationObserver(() => {
      if (document.getElementById("lpb-progress-container")) {
        this.bodyObserver.disconnect();
        this.bodyObserver = null;
        this.injectSwirlIcon();
      }
    });
    this.bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ── Waypoint Panel ─────────────────────────────────────────────────────

  togglePanel() {
    if (this.panelOpen) this.closePanel();
    else this.openPanel();
  }

  async openPanel() {
    if (this.panelOpen) return;
    this.panelOpen = true;

    const overlay = document.createElement("div");
    overlay.id = ShadowExchange.PANEL_ID;
    overlay.className = "se-panel-overlay";

    const availCount = await this.getAvailableShadowCount();

    overlay.innerHTML = `
      <div class="se-panel-container">
        <div class="se-panel-header">
          <h2 class="se-panel-title">Shadow Exchange</h2>
          <div class="se-header-actions">
            <button class="se-mark-btn" data-action="mark">Mark Current Location</button>
            <button class="se-close-btn" data-action="close">\u00D7</button>
          </div>
        </div>
        <div class="se-panel-controls">
          <select class="se-sort-select" data-action="sort">
            <option value="created"${this.settings.sortBy === "created" ? " selected" : ""}>Newest First</option>
            <option value="visited"${this.settings.sortBy === "visited" ? " selected" : ""}>Recently Visited</option>
            <option value="name"${this.settings.sortBy === "name" ? " selected" : ""}>Name</option>
            <option value="rank"${this.settings.sortBy === "rank" ? " selected" : ""}>Shadow Rank</option>
          </select>
          <input type="text" class="se-search-input" placeholder="Search waypoints..." data-action="search" />
        </div>
        <div class="se-waypoint-list">
          ${this.renderWaypointList()}
        </div>
        <div class="se-panel-footer">
          <span class="se-wp-count">${this.settings.waypoints.length} waypoint${this.settings.waypoints.length !== 1 ? "s" : ""}</span>
          <span class="se-shadow-avail">${availCount} shadow${availCount !== 1 ? "s" : ""} available</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.panelEl = overlay;
    this.bindPanelEvents(overlay);
  }

  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    const panel = document.getElementById(ShadowExchange.PANEL_ID);
    if (panel) panel.remove();
    this.panelEl = null;
  }

  refreshPanel() {
    if (!this.panelOpen || !this.panelEl) return;
    const list = this.panelEl.querySelector(".se-waypoint-list");
    if (list) list.innerHTML = this.renderWaypointList();

    const countEl = this.panelEl.querySelector(".se-wp-count");
    if (countEl) {
      countEl.textContent = `${this.settings.waypoints.length} waypoint${this.settings.waypoints.length !== 1 ? "s" : ""}`;
    }

    // Re-bind card events
    this.bindCardEvents(this.panelEl);
  }

  renderWaypointList(filter = "") {
    let wps = [...this.settings.waypoints];

    // Filter
    if (filter) {
      const q = filter.toLowerCase();
      wps = wps.filter(
        (w) =>
          w.label.toLowerCase().includes(q) ||
          w.shadowName.toLowerCase().includes(q) ||
          w.channelName.toLowerCase().includes(q) ||
          w.guildName.toLowerCase().includes(q)
      );
    }

    // Sort
    const sortBy = this.settings.sortBy || "created";
    if (sortBy === "created") wps.sort((a, b) => b.createdAt - a.createdAt);
    else if (sortBy === "visited") wps.sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0));
    else if (sortBy === "name") wps.sort((a, b) => a.label.localeCompare(b.label));
    else if (sortBy === "rank") {
      const ro = ShadowExchange.RANK_ORDER;
      wps.sort((a, b) => ro.indexOf(b.shadowRank) - ro.indexOf(a.shadowRank));
    }

    if (wps.length === 0) {
      return `<div class="se-empty-state">
        <div class="se-empty-icon">\u2693</div>
        <div class="se-empty-text">${filter ? "No waypoints match your search" : "No waypoints yet"}</div>
        <div class="se-empty-hint">${filter ? "Try a different search" : 'Click "Mark Current Location" to station a shadow'}</div>
      </div>`;
    }

    return wps.map((wp) => this.renderWaypointCard(wp)).join("");
  }

  renderWaypointCard(wp) {
    const rankColor = ShadowExchange.RANK_COLORS[wp.shadowRank] || "#808080";
    const rankClass = wp.shadowRank.replace(/[^a-zA-Z]/g, "").toLowerCase();
    const typeBadge = wp.locationType === "dm" ? "DM" : wp.locationType === "thread" ? "Thread" : wp.locationType === "message" ? "Msg" : "Channel";
    const visits = wp.visitCount || 0;
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    return `<div class="se-waypoint-card" data-wp-id="${esc(wp.id)}" style="border-left-color: ${rankColor};">
      <div class="se-card-top">
        <span class="se-shadow-rank" style="background: ${rankColor};">${esc(wp.shadowRank)}</span>
        <span class="se-shadow-name">${esc(wp.shadowName)}</span>
        <button class="se-card-remove" data-action="remove" data-wp-id="${esc(wp.id)}" title="Recall shadow">\u2716</button>
      </div>
      <div class="se-card-body">
        <div class="se-location-label">${esc(wp.label)}</div>
        <div class="se-location-meta">
          <span class="se-type-badge">${typeBadge}</span>
          <span class="se-visit-count">${visits} visit${visits !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div class="se-card-footer">
        <button class="se-teleport-btn" data-action="teleport" data-wp-id="${esc(wp.id)}">Teleport</button>
      </div>
    </div>`;
  }

  bindPanelEvents(overlay) {
    // Overlay click to close
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.closePanel();
    });

    // Header actions
    overlay.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "close") this.closePanel();
      if (action === "mark") this.markCurrentLocation();
    });

    // Sort
    const sortEl = overlay.querySelector(".se-sort-select");
    if (sortEl) {
      sortEl.addEventListener("change", () => {
        this.settings.sortBy = sortEl.value;
        this.saveSettings();
        this.refreshPanel();
      });
    }

    // Search
    const searchEl = overlay.querySelector(".se-search-input");
    if (searchEl) {
      searchEl.addEventListener("input", () => {
        const list = overlay.querySelector(".se-waypoint-list");
        if (list) list.innerHTML = this.renderWaypointList(searchEl.value);
        this.bindCardEvents(overlay);
      });
    }

    this.bindCardEvents(overlay);
  }

  bindCardEvents(overlay) {
    // Teleport + Remove (event delegation on list)
    const list = overlay.querySelector(".se-waypoint-list");
    if (!list) return;

    // Remove old listener by replacing node (simple dedup)
    const clone = list.cloneNode(true);
    list.parentNode.replaceChild(clone, list);

    clone.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const { action, wpId } = btn.dataset;
      if (action === "teleport" && wpId) this.teleportTo(wpId);
      if (action === "remove" && wpId) this.removeWaypoint(wpId);
    });
  }

  // ── CSS ────────────────────────────────────────────────────────────────

  injectCSS() {
    const css = `
      /* ── Swirl Icon (fixed-position, outside React tree) ───────── */
      .se-swirl-icon {
        position: fixed;
        right: 20px;
        z-index: 999998;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 2px solid rgba(155, 89, 182, 0.6);
        background: rgba(10, 10, 20, 0.7);
        cursor: pointer;
        opacity: 0.85;
        transition: opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        pointer-events: auto;
      }
      /* Position based on LPB top/bottom mode */
      .se-swirl-icon[data-lpb-position="top"] {
        top: 14px;
      }
      .se-swirl-icon[data-lpb-position="bottom"] {
        bottom: 14px;
      }
      /* Fallback if data attribute not set yet — default to top */
      .se-swirl-icon:not([data-lpb-position]) {
        top: 14px;
      }
      .se-swirl-icon:hover {
        opacity: 1;
        transform: scale(1.15);
        border-color: rgba(155, 89, 182, 1);
        box-shadow: 0 0 12px rgba(155, 89, 182, 0.6);
      }

      /* ── Panel Overlay ─────────────────────────────────────────────── */
      .se-panel-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.82);
        backdrop-filter: blur(6px);
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
        width: 560px;
        max-height: 78vh;
        background: linear-gradient(145deg, #1a1a2e, #16213e);
        border: 2px solid rgba(155, 89, 182, 0.5);
        border-radius: 14px;
        box-shadow: 0 0 40px rgba(155, 89, 182, 0.2), 0 8px 32px rgba(0, 0, 0, 0.6);
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
        border-bottom: 1px solid rgba(155, 89, 182, 0.25);
        background: rgba(0, 0, 0, 0.2);
      }
      .se-panel-title {
        font-size: 16px;
        font-weight: 700;
        color: #c39bd3;
        margin: 0;
        letter-spacing: 0.5px;
      }
      .se-header-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .se-mark-btn {
        background: linear-gradient(135deg, #7d3c98, #9b59b6);
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
        box-shadow: 0 0 12px rgba(155, 89, 182, 0.5);
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
        border-bottom: 1px solid rgba(155, 89, 182, 0.12);
      }
      .se-sort-select, .se-search-input {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(155, 89, 182, 0.2);
        border-radius: 6px;
        color: #ddd;
        padding: 6px 10px;
        font-size: 12px;
        outline: none;
        transition: border-color 0.2s ease;
      }
      .se-sort-select:focus, .se-search-input:focus {
        border-color: rgba(155, 89, 182, 0.5);
      }
      .se-search-input {
        flex: 1;
      }
      .se-sort-select {
        width: 140px;
      }
      .se-sort-select option {
        background: #1a1a2e;
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
        background: rgba(155, 89, 182, 0.3);
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
        border: 1px solid rgba(155, 89, 182, 0.12);
        border-left: 3px solid #808080;
        border-radius: 8px;
        padding: 10px 14px;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .se-waypoint-card:hover {
        background: rgba(155, 89, 182, 0.06);
        border-color: rgba(155, 89, 182, 0.25);
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
        color: #c39bd3;
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
        background: rgba(155, 89, 182, 0.15);
        color: #b388d9;
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

      .se-card-footer {
        display: flex;
        justify-content: flex-end;
      }
      .se-teleport-btn {
        background: linear-gradient(135deg, #6c3483, #9b59b6);
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
        box-shadow: 0 0 12px rgba(155, 89, 182, 0.45);
        transform: scale(1.04);
      }

      /* ── Footer ────────────────────────────────────────────────────── */
      .se-panel-footer {
        display: flex;
        justify-content: space-between;
        padding: 10px 18px;
        border-top: 1px solid rgba(155, 89, 182, 0.12);
        font-size: 11px;
        color: #777;
      }
    `;

    try {
      BdApi.DOM.addStyle(ShadowExchange.STYLE_ID, css);
    } catch (_) {
      const style = document.createElement("style");
      style.id = ShadowExchange.STYLE_ID;
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  removeCSS() {
    try {
      BdApi.DOM.removeStyle(ShadowExchange.STYLE_ID);
    } catch (_) {
      const el = document.getElementById(ShadowExchange.STYLE_ID);
      if (el) el.remove();
    }
  }
};
