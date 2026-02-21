/**
 * @name ShadowStep
 * @description Bookmark channels as Shadow Anchors and teleport to them instantly with a shadow transition. Solo Leveling themed.
 * @version 1.0.0
 * @author BlueFlashX1
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 */

// ─── Constants ──────────────────────────────────────────────────────────────
const PLUGIN_NAME = "ShadowStep";
const PLUGIN_VERSION = "1.0.0";
const STYLE_ID = "shadow-step-css";
const PANEL_CONTAINER_ID = "ss-panel-root";
const TRANSITION_ID = "ss-transition-overlay";
const BASE_MAX_ANCHORS = 10;
const AGI_BONUS_DIVISOR = 20; // 1 extra slot per 20 AGI
const STATS_CACHE_TTL = 5000;

const DEFAULT_SETTINGS = {
  anchors: [],
  hotkey: "Ctrl+Shift+S",
  animationEnabled: true,
  animationDuration: 400,
  maxAnchors: BASE_MAX_ANCHORS,
  sortBy: "manual",
  debugMode: false,
};

// ─── Hotkey Utilities ───────────────────────────────────────────────────────

const isEditableTarget = (target) => {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase?.() || "";
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return !!target.isContentEditable;
};

const normalizeHotkey = (hotkey) =>
  String(hotkey || "").trim().toLowerCase().replace(/\s+/g, "");

const parseHotkey = (hotkey) => {
  const normalized = normalizeHotkey(hotkey);
  const parts = normalized.split("+").filter(Boolean);
  const mods = new Set(
    parts.filter((p) => ["ctrl", "shift", "alt", "meta", "cmd", "command"].includes(p))
  );
  const key = parts.find((p) => !mods.has(p)) || "";
  return {
    key,
    hasCtrl: mods.has("ctrl"),
    hasShift: mods.has("shift"),
    hasAlt: mods.has("alt"),
    hasMeta: mods.has("meta") || mods.has("cmd") || mods.has("command"),
  };
};

const matchesHotkey = (event, hotkey) => {
  const spec = parseHotkey(hotkey);
  if (!spec.key) return false;
  const key = String(event.key || "").toLowerCase();
  return (
    key === spec.key &&
    !!event.ctrlKey === spec.hasCtrl &&
    !!event.shiftKey === spec.hasShift &&
    !!event.altKey === spec.hasAlt &&
    !!event.metaKey === spec.hasMeta
  );
};

// ─── React Components ───────────────────────────────────────────────────────

function buildComponents(pluginRef) {
  const React = BdApi.React;
  const { useState, useEffect, useCallback, useMemo, useRef } = React;
  const ce = React.createElement;

  // ── AnchorCard ──────────────────────────────────────────────
  function AnchorCard({ anchor, index, onTeleport, onRemove, onRename }) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(anchor.name);
    const inputRef = useRef(null);

    useEffect(() => {
      if (editing && inputRef.current) inputRef.current.focus();
    }, [editing]);

    const handleDoubleClick = useCallback((e) => {
      e.stopPropagation();
      setEditValue(anchor.name);
      setEditing(true);
    }, [anchor.name]);

    const commitRename = useCallback(() => {
      const trimmed = editValue.trim();
      if (trimmed && trimmed !== anchor.name) onRename(anchor.id, trimmed);
      setEditing(false);
    }, [editValue, anchor.id, anchor.name, onRename]);

    const handleKeyDown = useCallback((e) => {
      if (e.key === "Enter") commitRename();
      if (e.key === "Escape") setEditing(false);
    }, [commitRename]);

    const guildInitial = (anchor.guildName || "?")[0].toUpperCase();

    return ce("div", {
      className: "ss-anchor-card",
      onClick: () => onTeleport(anchor.id),
      title: `${anchor.guildName} > #${anchor.channelName}\nUses: ${anchor.useCount}`,
    },
      // Number badge (1-9)
      index < 9
        ? ce("span", { className: "ss-anchor-badge" }, String(index + 1))
        : ce("span", { className: "ss-anchor-badge ss-anchor-badge-empty" }, "\u00B7"),

      // Guild icon (letter fallback)
      ce("div", { className: "ss-anchor-icon" }, guildInitial),

      // Channel info
      ce("div", { className: "ss-anchor-info" },
        editing
          ? ce("input", {
              ref: inputRef,
              className: "ss-anchor-rename-input",
              value: editValue,
              onChange: (e) => setEditValue(e.target.value),
              onKeyDown: handleKeyDown,
              onBlur: commitRename,
              onClick: (e) => e.stopPropagation(),
            })
          : ce("span", {
              className: "ss-anchor-name",
              onDoubleClick: handleDoubleClick,
            }, anchor.name || anchor.channelName),
        ce("span", { className: "ss-anchor-server" }, anchor.guildName || "DM")
      ),

      // Remove button
      ce("button", {
        className: "ss-anchor-remove",
        onClick: (e) => { e.stopPropagation(); onRemove(anchor.id); },
        title: "Uproot Anchor",
      }, "\u00D7")
    );
  }

  // ── AnchorPanel ─────────────────────────────────────────────
  function AnchorPanel({ onClose }) {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState(pluginRef.settings.sortBy);
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
    const searchRef = useRef(null);

    // Bridge for imperative refresh
    useEffect(() => {
      pluginRef._panelForceUpdate = forceUpdate;
      return () => { pluginRef._panelForceUpdate = null; };
    }, [forceUpdate]);

    // Focus search on mount
    useEffect(() => {
      setTimeout(() => searchRef.current?.focus(), 50);
    }, []);

    // Escape handler
    useEffect(() => {
      const handler = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); }
      };
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }, [onClose]);

    // Filter + sort
    const anchors = useMemo(() => {
      let list = [...(pluginRef.settings.anchors || [])];
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter((a) =>
          (a.name || "").toLowerCase().includes(q) ||
          (a.channelName || "").toLowerCase().includes(q) ||
          (a.guildName || "").toLowerCase().includes(q)
        );
      }
      switch (sortBy) {
        case "recent":
          list.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
          break;
        case "name":
          list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
          break;
        case "server":
          list.sort((a, b) => (a.guildName || "").localeCompare(b.guildName || ""));
          break;
        default: // manual — sortOrder
          list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      }
      return list;
    }, [searchQuery, sortBy, pluginRef.settings.anchors]);

    // Number key teleport (1-9)
    useEffect(() => {
      const handler = (e) => {
        if (isEditableTarget(e.target)) return;
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          const target = anchors[num - 1];
          if (target) {
            e.preventDefault();
            e.stopPropagation();
            pluginRef.teleportTo(target.id);
            onClose();
          }
        }
      };
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }, [anchors, onClose]);

    const handleTeleport = useCallback((anchorId) => {
      pluginRef.teleportTo(anchorId);
      onClose();
    }, [onClose]);

    const handleRemove = useCallback((anchorId) => {
      pluginRef.removeAnchor(anchorId);
      forceUpdate();
    }, [forceUpdate]);

    const handleRename = useCallback((anchorId, newName) => {
      pluginRef.renameAnchor(anchorId, newName);
      forceUpdate();
    }, [forceUpdate]);

    const handleSortChange = useCallback((newSort) => {
      setSortBy(newSort);
      pluginRef.settings.sortBy = newSort;
      pluginRef.saveSettings();
    }, []);

    const maxAnchors = pluginRef.getMaxAnchors();
    const currentCount = (pluginRef.settings.anchors || []).length;
    const agiBonus = maxAnchors - pluginRef.settings.maxAnchors;

    return ce("div", {
      className: "ss-panel-overlay",
      onClick: onClose,
    },
      ce("div", {
        className: "ss-panel-container",
        onClick: (e) => e.stopPropagation(),
      },
        // Header
        ce("div", { className: "ss-panel-header" },
          ce("h2", { className: "ss-panel-title" }, "Shadow Step"),
          ce("button", {
            className: "ss-panel-close",
            onClick: onClose,
          }, "\u00D7")
        ),

        // Search
        ce("input", {
          ref: searchRef,
          className: "ss-panel-search",
          type: "text",
          placeholder: "Search anchors...",
          value: searchQuery,
          onChange: (e) => setSearchQuery(e.target.value),
        }),

        // Sort controls
        ce("div", { className: "ss-panel-sort" },
          ["manual", "recent", "name", "server"].map((s) =>
            ce("button", {
              key: s,
              className: `ss-sort-btn ${sortBy === s ? "ss-sort-active" : ""}`,
              onClick: () => handleSortChange(s),
            }, s.charAt(0).toUpperCase() + s.slice(1))
          )
        ),

        // Anchor list
        ce("div", { className: "ss-panel-list" },
          anchors.length === 0
            ? ce("div", { className: "ss-panel-empty" },
                searchQuery
                  ? "No anchors match your search"
                  : "No Shadow Anchors planted. Right-click a channel to plant one."
              )
            : anchors.map((anchor, i) =>
                ce(AnchorCard, {
                  key: anchor.id,
                  anchor,
                  index: i,
                  onTeleport: handleTeleport,
                  onRemove: handleRemove,
                  onRename: handleRename,
                })
              )
        ),

        // Footer
        ce("div", { className: "ss-panel-footer" },
          ce("span", null,
            `${currentCount} / ${maxAnchors} anchors`,
            agiBonus > 0 ? ` (+${agiBonus} AGI)` : ""
          ),
          ce("span", { className: "ss-panel-hint" }, "Press 1-9 to teleport")
        )
      )
    );
  }

  return { AnchorCard, AnchorPanel };
}

// ─── Plugin Class ───────────────────────────────────────────────────────────

module.exports = class ShadowStep {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._NavigationUtils = null;
    this._ChannelStore = null;
    this._GuildStore = null;
    this._SelectedGuildStore = null;
    this._unpatchContextMenu = null;
    this._hotkeyHandler = null;
    this._panelReactRoot = null;
    this._panelForceUpdate = null;
    this._panelOpen = false;
    this._components = null;
    this._statsCache = null;
    this._statsCacheTime = 0;
  }

  // ── Lifecycle ───────────────────────────────────────────────

  start() {
    this.loadSettings();
    this.initWebpack();
    this._components = buildComponents(this);
    this.injectCSS();
    this.patchContextMenu();
    this._registerHotkey();
    this._pruneStaleAnchors();
    BdApi.UI.showToast(`${PLUGIN_NAME} v${PLUGIN_VERSION} \u2014 Shadows ready`, { type: "info" });
  }

  stop() {
    try {
      // 1. Close panel
      this.closePanel();

      // 2. Unpatch context menu
      if (this._unpatchContextMenu) {
        try { this._unpatchContextMenu(); } catch (_) {}
        this._unpatchContextMenu = null;
      }

      // 3. Unregister hotkey
      this._unregisterHotkey();

      // 4. Remove transition overlay if stuck
      const overlay = document.getElementById(TRANSITION_ID);
      if (overlay) overlay.remove();

      // 5. Remove CSS
      this.removeCSS();

      // 6. Clear refs
      this._components = null;
      this._NavigationUtils = null;
      this._ChannelStore = null;
      this._GuildStore = null;
      this._SelectedGuildStore = null;
      this._statsCache = null;
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    BdApi.UI.showToast(`${PLUGIN_NAME} \u2014 Anchors dormant`, { type: "info" });
  }

  // ── Webpack ─────────────────────────────────────────────────

  initWebpack() {
    const { Webpack } = BdApi;
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._GuildStore = Webpack.getStore("GuildStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._NavigationUtils =
      Webpack.getByKeys("transitionTo", "back", "forward") ||
      Webpack.getModule((m) => m.transitionTo && m.back && m.forward);
    this.debugLog("Webpack", "Modules acquired", {
      ChannelStore: !!this._ChannelStore,
      GuildStore: !!this._GuildStore,
      SelectedGuildStore: !!this._SelectedGuildStore,
      NavigationUtils: !!this._NavigationUtils,
    });
  }

  // ── Settings ────────────────────────────────────────────────

  loadSettings() {
    try {
      const saved = BdApi.Data.load(PLUGIN_NAME, "settings") || {};
      this.settings = { ...DEFAULT_SETTINGS, ...saved };
      // Ensure anchors is always an array
      if (!Array.isArray(this.settings.anchors)) this.settings.anchors = [];
    } catch (_) {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save(PLUGIN_NAME, "settings", this.settings);
    } catch (err) {
      this.debugError("Settings", "Failed to save:", err);
    }
  }

  // ── Context Menu ────────────────────────────────────────────

  patchContextMenu() {
    try {
      this._unpatchContextMenu = BdApi.ContextMenu.patch("channel-context", (tree, props) => {
        if (!props || !props.channel) return;
        const channel = props.channel;
        const channelId = channel.id;
        const guildId = channel.guild_id || null;

        const isAnchored = this.hasAnchor(channelId);
        const separator = BdApi.ContextMenu.buildItem({ type: "separator" });

        let menuItem;
        if (isAnchored) {
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: "Uproot Shadow Anchor",
            id: "shadow-step-remove",
            action: () => {
              const anchor = this.settings.anchors.find((a) => a.channelId === channelId);
              if (anchor) {
                this.removeAnchor(anchor.id);
                BdApi.UI.showToast(`Uprooted anchor: #${anchor.channelName}`, { type: "info" });
              }
            },
          });
        } else {
          const atMax = this.settings.anchors.length >= this.getMaxAnchors();
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: atMax
              ? `Shadow Anchor (${this.settings.anchors.length}/${this.getMaxAnchors()})`
              : "Plant Shadow Anchor",
            id: "shadow-step-add",
            disabled: atMax,
            action: () => {
              if (atMax) return;
              this.addAnchor(channelId, guildId);
            },
          });
        }

        const children = tree?.props?.children;
        if (Array.isArray(children)) {
          children.push(separator, menuItem);
        }
      });
      this.debugLog("ContextMenu", "Patched channel-context");
    } catch (err) {
      this.debugError("ContextMenu", "Failed to patch:", err);
    }
  }

  // ── Anchor CRUD ─────────────────────────────────────────────

  addAnchor(channelId, guildId) {
    if (this.hasAnchor(channelId)) {
      BdApi.UI.showToast("Channel already anchored", { type: "warning" });
      return;
    }
    if (this.settings.anchors.length >= this.getMaxAnchors()) {
      BdApi.UI.showToast(`Max anchors reached (${this.getMaxAnchors()})`, { type: "warning" });
      return;
    }

    const channel = this._ChannelStore?.getChannel(channelId);
    const guild = guildId ? this._GuildStore?.getGuild(guildId) : null;

    const anchor = {
      id: `sa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: channel?.name || "unknown",
      guildId: guildId || null,
      channelId,
      guildName: guild?.name || (guildId ? "Unknown Server" : "DM"),
      channelName: channel?.name || "unknown",
      createdAt: Date.now(),
      lastUsed: null,
      useCount: 0,
      sortOrder: this.settings.anchors.length,
    };

    this.settings.anchors.push(anchor);
    this.saveSettings();
    if (this._panelForceUpdate) this._panelForceUpdate();
    BdApi.UI.showToast(`Shadow Anchor planted: #${anchor.channelName}`, { type: "success" });
    this.debugLog("Anchor", "Added:", anchor.name, anchor.channelId);
  }

  removeAnchor(anchorId) {
    this.settings.anchors = this.settings.anchors.filter((a) => a.id !== anchorId);
    // Re-index sortOrder
    this.settings.anchors.forEach((a, i) => { a.sortOrder = i; });
    this.saveSettings();
    if (this._panelForceUpdate) this._panelForceUpdate();
    this.debugLog("Anchor", "Removed:", anchorId);
  }

  renameAnchor(anchorId, newName) {
    const anchor = this.settings.anchors.find((a) => a.id === anchorId);
    if (anchor) {
      anchor.name = newName;
      this.saveSettings();
      this.debugLog("Anchor", "Renamed:", anchorId, "->", newName);
    }
  }

  hasAnchor(channelId) {
    return this.settings.anchors.some((a) => a.channelId === channelId);
  }

  getMaxAnchors() {
    const base = this.settings.maxAnchors || BASE_MAX_ANCHORS;
    const agi = this._getAgiStat();
    return base + Math.floor(agi / AGI_BONUS_DIVISOR);
  }

  _pruneStaleAnchors() {
    if (!this._ChannelStore) return;
    const before = this.settings.anchors.length;
    this.settings.anchors = this.settings.anchors.filter((a) => {
      const ch = this._ChannelStore.getChannel(a.channelId);
      return !!ch;
    });
    const pruned = before - this.settings.anchors.length;
    if (pruned > 0) {
      this.settings.anchors.forEach((a, i) => { a.sortOrder = i; });
      this.saveSettings();
      this.debugLog("Prune", `Removed ${pruned} stale anchors`);
    }
  }

  // ── Stats Integration ───────────────────────────────────────

  _getAgiStat() {
    const now = Date.now();
    if (this._statsCache && (now - this._statsCacheTime) < STATS_CACHE_TTL) {
      return this._statsCache.agility || 0;
    }
    try {
      const soloPlugin = BdApi.Plugins.get("SoloLevelingStats");
      if (!soloPlugin?.instance) return 0;
      const stats =
        soloPlugin.instance.getTotalEffectiveStats?.() ||
        soloPlugin.instance.settings?.stats ||
        {};
      this._statsCache = stats;
      this._statsCacheTime = now;
      return stats.agility || 0;
    } catch (_) {
      return 0;
    }
  }

  // ── Navigation ──────────────────────────────────────────────

  teleportTo(anchorId) {
    const anchor = this.settings.anchors.find((a) => a.id === anchorId);
    if (!anchor) {
      BdApi.UI.showToast("Anchor not found", { type: "error" });
      return;
    }

    const path = anchor.guildId
      ? `/channels/${anchor.guildId}/${anchor.channelId}`
      : `/channels/@me/${anchor.channelId}`;

    // Close panel first
    this.closePanel();

    // Update usage stats
    anchor.lastUsed = Date.now();
    anchor.useCount = (anchor.useCount || 0) + 1;
    this.saveSettings();

    // Play transition then navigate
    this.playTransition(() => {
      this._navigate(path);
    });

    BdApi.UI.showToast(`Shadow Step \u2192 #${anchor.channelName}`, { type: "success" });
    this.debugLog("Teleport", anchor.name, path);
  }

  _navigate(path) {
    try {
      // Primary: NavigationUtils
      if (this._NavigationUtils?.transitionTo) {
        this._NavigationUtils.transitionTo(path);
        return;
      }
      // Lazy re-acquire
      const { Webpack } = BdApi;
      const nav =
        Webpack.getByKeys("transitionTo", "back", "forward") ||
        Webpack.getModule((m) => m.transitionTo && m.back);
      if (nav?.transitionTo) {
        this._NavigationUtils = nav;
        nav.transitionTo(path);
        return;
      }
      // Last resort: history.pushState
      if (window.history?.pushState) {
        window.history.pushState({}, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
        return;
      }
      BdApi.UI.showToast("Navigation failed \u2014 NavigationUtils unavailable", { type: "error" });
    } catch (err) {
      this.debugError("Navigate", "Failed:", err);
      BdApi.UI.showToast("Navigation error \u2014 check console", { type: "error" });
    }
  }

  // ── Hotkey ──────────────────────────────────────────────────

  _registerHotkey() {
    this._hotkeyHandler = (e) => {
      if (!this.settings.hotkey) return;
      if (isEditableTarget(e.target)) return;
      if (matchesHotkey(e, this.settings.hotkey)) {
        e.preventDefault();
        e.stopPropagation();
        this.togglePanel();
      }
    };
    document.addEventListener("keydown", this._hotkeyHandler);
    this.debugLog("Hotkey", `Registered: ${this.settings.hotkey}`);
  }

  _unregisterHotkey() {
    if (this._hotkeyHandler) {
      document.removeEventListener("keydown", this._hotkeyHandler);
      this._hotkeyHandler = null;
    }
  }

  // ── Panel ───────────────────────────────────────────────────

  togglePanel() {
    if (this._panelOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  openPanel() {
    if (this._panelOpen) return;

    const container = document.createElement("div");
    container.id = PANEL_CONTAINER_ID;
    document.body.appendChild(container);

    const createRoot = BdApi.ReactDOM?.createRoot;
    if (createRoot) {
      const root = createRoot(container);
      root.render(
        BdApi.React.createElement(this._components.AnchorPanel, {
          onClose: () => this.closePanel(),
        })
      );
      this._panelReactRoot = root;
    } else {
      // React 17 fallback
      BdApi.ReactDOM.render(
        BdApi.React.createElement(this._components.AnchorPanel, {
          onClose: () => this.closePanel(),
        }),
        container
      );
      this._panelReactRoot = "legacy";
    }

    this._panelOpen = true;
    this.debugLog("Panel", "Opened");
  }

  closePanel() {
    if (!this._panelOpen) return;

    if (this._panelReactRoot === "legacy") {
      const container = document.getElementById(PANEL_CONTAINER_ID);
      if (container) BdApi.ReactDOM.unmountComponentAtNode(container);
    } else if (this._panelReactRoot) {
      try { this._panelReactRoot.unmount(); } catch (_) {}
    }
    this._panelReactRoot = null;

    const container = document.getElementById(PANEL_CONTAINER_ID);
    if (container) container.remove();

    this._panelOpen = false;
    this._panelForceUpdate = null;
    this.debugLog("Panel", "Closed");
  }

  // ── Transition Animation ────────────────────────────────────

  playTransition(callback) {
    if (!this.settings.animationEnabled) {
      callback();
      return;
    }

    // Remove any existing overlay
    const existing = document.getElementById(TRANSITION_ID);
    if (existing) existing.remove();

    const duration = this.settings.animationDuration || 400;
    const overlay = document.createElement("div");
    overlay.id = TRANSITION_ID;
    overlay.className = "ss-transition-overlay";
    overlay.style.setProperty("--ss-duration", `${duration}ms`);

    // Spawn purple particles
    const particleCount = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement("div");
      particle.className = "ss-particle";
      particle.style.left = `${15 + Math.random() * 70}%`;
      particle.style.top = `${25 + Math.random() * 50}%`;
      particle.style.animationDelay = `${Math.random() * 200}ms`;
      particle.style.width = `${3 + Math.random() * 4}px`;
      particle.style.height = particle.style.width;
      overlay.appendChild(particle);
    }

    document.body.appendChild(overlay);

    // Navigate at peak darkness (40% through animation)
    const navDelay = Math.round(duration * 0.4);
    setTimeout(() => callback(), navDelay);

    // Remove overlay after animation completes
    setTimeout(() => {
      overlay.remove();
    }, duration + 150);
  }

  // ── CSS ─────────────────────────────────────────────────────

  injectCSS() {
    try {
      BdApi.DOM.addStyle(STYLE_ID, this.buildCSS());
    } catch (_) {
      try {
        if (!document.getElementById(STYLE_ID)) {
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = this.buildCSS();
          document.head.appendChild(style);
        }
      } catch (err) {
        this.debugError("CSS", "Failed to inject:", err);
      }
    }
  }

  removeCSS() {
    try {
      BdApi.DOM.removeStyle(STYLE_ID);
    } catch (_) {
      try {
        const el = document.getElementById(STYLE_ID);
        if (el) el.remove();
      } catch (err) {
        this.debugError("CSS", "Failed to remove:", err);
      }
    }
  }

  buildCSS() {
    return `
/* ═══════════════════════════════════════════════════════════════
   ShadowStep v${PLUGIN_VERSION} — Shadow Anchor Teleportation
   ═══════════════════════════════════════════════════════════════ */

/* ── Transition Animation ────────────────────────────────────── */

@keyframes ss-shadow-enter {
  0% {
    opacity: 0;
    background: radial-gradient(circle at center, transparent 0%, rgba(10, 0, 20, 0) 100%);
  }
  30% {
    opacity: 1;
    background: radial-gradient(circle at center, rgba(138, 43, 226, 0.3) 0%, rgba(10, 0, 20, 0.95) 60%, rgba(0, 0, 0, 1) 100%);
  }
  50% {
    opacity: 1;
    background: radial-gradient(circle at center, rgba(138, 43, 226, 0.15) 0%, rgba(0, 0, 0, 1) 40%);
  }
  70% {
    opacity: 1;
    background: radial-gradient(circle at center, rgba(138, 43, 226, 0.3) 0%, rgba(10, 0, 20, 0.95) 60%, rgba(0, 0, 0, 1) 100%);
  }
  100% {
    opacity: 0;
    background: radial-gradient(circle at center, transparent 0%, rgba(10, 0, 20, 0) 100%);
  }
}

@keyframes ss-particle-rise {
  0% { transform: translateY(0) scale(0); opacity: 0; }
  20% { transform: translateY(-15px) scale(1); opacity: 0.9; }
  100% { transform: translateY(-80px) scale(0.2); opacity: 0; }
}

.ss-transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  pointer-events: none;
  animation: ss-shadow-enter var(--ss-duration, 400ms) ease-in-out forwards;
}

.ss-particle {
  position: absolute;
  border-radius: 50%;
  background: #8a2be2;
  box-shadow: 0 0 6px 2px rgba(138, 43, 226, 0.6);
  animation: ss-particle-rise 600ms ease-out forwards;
}

@media (prefers-reduced-motion: reduce) {
  .ss-transition-overlay {
    animation: none !important;
    background: rgba(0, 0, 0, 0.6) !important;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  .ss-particle {
    animation: none !important;
    display: none;
  }
}

/* ── Panel Overlay ───────────────────────────────────────────── */

.ss-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 100001;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ss-fade-in 150ms ease;
}

@keyframes ss-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.ss-panel-container {
  background: #1e1e2e;
  border: 1px solid rgba(138, 43, 226, 0.4);
  border-radius: 12px;
  width: 420px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(138, 43, 226, 0.15);
  overflow: hidden;
}

/* ── Panel Header ────────────────────────────────────────────── */

.ss-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(138, 43, 226, 0.2);
}

.ss-panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #8a2be2;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.5px;
}

.ss-panel-close {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.15s ease, background 0.15s ease;
}
.ss-panel-close:hover { color: #fff; background: rgba(138, 43, 226, 0.2); }

/* ── Search ──────────────────────────────────────────────────── */

.ss-panel-search {
  margin: 10px 16px 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(138, 43, 226, 0.2);
  border-radius: 8px;
  color: #ddd;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s ease;
}
.ss-panel-search:focus {
  border-color: rgba(138, 43, 226, 0.5);
}
.ss-panel-search::placeholder { color: #666; }

/* ── Sort Controls ───────────────────────────────────────────── */

.ss-panel-sort {
  display: flex;
  gap: 4px;
  padding: 6px 16px;
}

.ss-sort-btn {
  background: none;
  border: 1px solid transparent;
  color: #777;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.ss-sort-btn:hover { color: #aaa; }
.ss-sort-active {
  color: #8a2be2;
  border-color: rgba(138, 43, 226, 0.3);
  background: rgba(138, 43, 226, 0.08);
}

/* ── Anchor List ─────────────────────────────────────────────── */

.ss-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
  min-height: 80px;
  max-height: 45vh;
}

.ss-panel-list::-webkit-scrollbar { width: 6px; }
.ss-panel-list::-webkit-scrollbar-track { background: transparent; }
.ss-panel-list::-webkit-scrollbar-thumb {
  background: rgba(138, 43, 226, 0.3);
  border-radius: 3px;
}

.ss-panel-empty {
  text-align: center;
  color: #666;
  padding: 24px 16px;
  font-size: 13px;
  line-height: 1.5;
}

/* ── Anchor Card ─────────────────────────────────────────────── */

.ss-anchor-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
  margin-bottom: 2px;
}
.ss-anchor-card:hover {
  background: rgba(138, 43, 226, 0.12);
}
.ss-anchor-card:active {
  background: rgba(138, 43, 226, 0.2);
}

.ss-anchor-badge {
  min-width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: rgba(138, 43, 226, 0.15);
  color: #8a2be2;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}
.ss-anchor-badge-empty {
  color: #555;
  background: rgba(255, 255, 255, 0.03);
}

.ss-anchor-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.25), rgba(75, 0, 130, 0.4));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.ss-anchor-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.ss-anchor-name {
  color: #ddd;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-anchor-server {
  color: #777;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-anchor-rename-input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(138, 43, 226, 0.4);
  border-radius: 4px;
  color: #ddd;
  font-size: 13px;
  padding: 2px 6px;
  outline: none;
  width: 100%;
}

.ss-anchor-remove {
  background: none;
  border: none;
  color: #555;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
  opacity: 0;
}
.ss-anchor-card:hover .ss-anchor-remove { opacity: 1; }
.ss-anchor-remove:hover {
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

/* ── Panel Footer ────────────────────────────────────────────── */

.ss-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid rgba(138, 43, 226, 0.2);
  color: #777;
  font-size: 11px;
}

.ss-panel-hint { color: #555; }
`;
  }

  // ── Settings Panel ──────────────────────────────────────────

  getSettingsPanel() {
    const React = BdApi.React;
    const self = this;

    const SettingsPanel = () => {
      const [hotkey, setHotkey] = React.useState(self.settings.hotkey);
      const [animEnabled, setAnimEnabled] = React.useState(self.settings.animationEnabled);
      const [animDuration, setAnimDuration] = React.useState(self.settings.animationDuration);
      const [maxAnchors, setMaxAnchors] = React.useState(self.settings.maxAnchors);
      const [debug, setDebug] = React.useState(self.settings.debugMode);

      const agiStat = self._getAgiStat();
      const effectiveMax = (maxAnchors || BASE_MAX_ANCHORS) + Math.floor(agiStat / AGI_BONUS_DIVISOR);
      const anchorCount = (self.settings.anchors || []).length;

      const rowStyle = {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
      };
      const labelStyle = { color: "#ccc", fontSize: "13px" };
      const inputStyle = {
        background: "rgba(0,0,0,0.3)", border: "1px solid rgba(138,43,226,0.3)",
        borderRadius: "6px", color: "#ddd", padding: "4px 8px", fontSize: "13px",
        outline: "none", width: "120px", textAlign: "center",
      };
      const checkStyle = { accentColor: "#8a2be2" };

      return React.createElement("div", {
        style: { padding: "16px", background: "#1e1e2e", borderRadius: "8px", color: "#ccc" },
      },
        React.createElement("h3", {
          style: { color: "#8a2be2", marginTop: 0, marginBottom: "12px", fontFamily: "'Orbitron', sans-serif" },
        }, "Shadow Step Settings"),

        // Statistics
        React.createElement("div", {
          style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" },
        },
          React.createElement("div", {
            style: { background: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.3)", borderRadius: "8px", padding: "10px", textAlign: "center" },
          },
            React.createElement("div", { style: { color: "#8a2be2", fontSize: "18px", fontWeight: "700" } }, anchorCount),
            React.createElement("div", { style: { color: "#999", fontSize: "11px" } }, "Active Anchors")
          ),
          React.createElement("div", {
            style: { background: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.3)", borderRadius: "8px", padding: "10px", textAlign: "center" },
          },
            React.createElement("div", { style: { color: "#8a2be2", fontSize: "18px", fontWeight: "700" } }, effectiveMax),
            React.createElement("div", { style: { color: "#999", fontSize: "11px" } },
              `Max Slots${agiStat > 0 ? ` (+${Math.floor(agiStat / AGI_BONUS_DIVISOR)} AGI)` : ""}`)
          )
        ),

        // Hotkey
        React.createElement("div", { style: rowStyle },
          React.createElement("span", { style: labelStyle }, "Hotkey"),
          React.createElement("input", {
            style: inputStyle, value: hotkey,
            onChange: (e) => {
              setHotkey(e.target.value);
              self.settings.hotkey = e.target.value;
              self._unregisterHotkey();
              self._registerHotkey();
              self.saveSettings();
            },
          })
        ),

        // Animation enabled
        React.createElement("div", { style: rowStyle },
          React.createElement("span", { style: labelStyle }, "Shadow Transition"),
          React.createElement("input", {
            type: "checkbox", checked: animEnabled, style: checkStyle,
            onChange: (e) => {
              setAnimEnabled(e.target.checked);
              self.settings.animationEnabled = e.target.checked;
              self.saveSettings();
            },
          })
        ),

        // Animation duration
        React.createElement("div", { style: rowStyle },
          React.createElement("span", { style: labelStyle }, `Animation (${animDuration}ms)`),
          React.createElement("input", {
            type: "range", min: 200, max: 800, step: 50, value: animDuration,
            style: { accentColor: "#8a2be2", width: "120px" },
            onChange: (e) => {
              const val = parseInt(e.target.value);
              setAnimDuration(val);
              self.settings.animationDuration = val;
              self.saveSettings();
            },
          })
        ),

        // Max anchors
        React.createElement("div", { style: rowStyle },
          React.createElement("span", { style: labelStyle }, "Base Max Anchors"),
          React.createElement("input", {
            type: "number", min: 3, max: 50, value: maxAnchors,
            style: { ...inputStyle, width: "60px" },
            onChange: (e) => {
              const val = Math.max(3, Math.min(50, parseInt(e.target.value) || BASE_MAX_ANCHORS));
              setMaxAnchors(val);
              self.settings.maxAnchors = val;
              self.saveSettings();
            },
          })
        ),

        // Debug mode
        React.createElement("div", { style: { ...rowStyle, borderBottom: "none" } },
          React.createElement("span", { style: labelStyle }, "Debug Mode"),
          React.createElement("input", {
            type: "checkbox", checked: debug, style: checkStyle,
            onChange: (e) => {
              setDebug(e.target.checked);
              self.settings.debugMode = e.target.checked;
              self.saveSettings();
            },
          })
        )
      );
    };

    return React.createElement(SettingsPanel);
  }

  // ── Debug ───────────────────────────────────────────────────

  debugLog(tag, ...args) {
    if (this.settings.debugMode) {
      console.log(`%c[${PLUGIN_NAME}]%c [${tag}]`, "color: #8a2be2; font-weight: bold", "color: #999", ...args);
    }
  }

  debugError(tag, ...args) {
    console.error(`[${PLUGIN_NAME}] [${tag}]`, ...args);
  }
};
