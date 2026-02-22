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
  respectReducedMotion: false,
  animationDuration: 550,
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
    this._transitionNavTimeout = null;
    this._transitionCleanupTimeout = null;
    this._transitionRunId = 0;
    this._transitionStopCanvas = null;
    this._navigateRetryTimers = new Set();
    this._navigateRequestId = 0;
    this._channelFadeToken = 0;
    this._channelFadeResetTimer = null;
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

      // 4. Stop and remove any active transition
      this._cancelPendingTransition();

      // 5. Clear any queued navigation retries
      this._clearNavigateRetries();

      // 6. Clear channel view fade state
      this._cancelChannelViewFade();

      // 7. Remove CSS
      this.removeCSS();

      // 8. Clear refs
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

    const channelExists = this._ChannelStore?.getChannel(anchor.channelId);
    if (!channelExists) {
      this.removeAnchor(anchor.id);
      BdApi.UI.showToast("Anchor is stale and was removed", { type: "warning" });
      this.debugLog("Teleport", "Blocked stale anchor", anchor.id, anchor.channelId);
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
      const fadeToken = this._beginChannelViewFadeOut();
      this._navigate(path, {
        anchorId: anchor.id,
        anchorName: anchor.name,
        channelId: anchor.channelId,
      }, {
        onConfirmed: () => this._finishChannelViewFade(fadeToken, true),
        onFailed: () => this._finishChannelViewFade(fadeToken, false),
      });
    });

    BdApi.UI.showToast(`Shadow Step \u2192 #${anchor.channelName}`, { type: "success" });
    this.debugLog("Teleport", anchor.name, path);
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
    } catch (_) {}
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
    } catch (_) {}
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
    } catch (_) {}

    if (this._channelFadeResetTimer) clearTimeout(this._channelFadeResetTimer);
    this._channelFadeResetTimer = setTimeout(() => {
      if (token !== this._channelFadeToken) return;
      this._channelFadeResetTimer = null;
      try {
        node.style.removeProperty("opacity");
        node.style.removeProperty("transition");
        node.style.removeProperty("will-change");
      } catch (_) {}
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
        try { hooks.onConfirmed({ attempt: 0, alreadyActive: true }); } catch (_) {}
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
          try { hooks.onConfirmed({ attempt, targetPath }); } catch (_) {}
        }
        return;
      }

      if (attempt >= maxAttempts) {
        const anchorName = context.anchorName ? ` (${context.anchorName})` : "";
        this.debugError("Navigate", `Failed to reach ${targetPath}${anchorName} after ${attempt} attempts`);
        if (typeof hooks.onFailed === "function") {
          try { hooks.onFailed({ attempt, targetPath }); } catch (_) {}
        }
        BdApi.UI.showToast("Shadow Step failed to switch channel", { type: "error" });
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
        try { hooks.onFailed({ attempt: 0, targetPath, error: err }); } catch (_) {}
      }
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
      try { this._transitionStopCanvas(); } catch (_) {}
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
      const [respectReducedMotion, setRespectReducedMotion] = React.useState(self.settings.respectReducedMotion ?? false);
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

        // Respect reduced-motion preference
        React.createElement("div", { style: rowStyle },
          React.createElement("span", { style: labelStyle }, "Respect Reduced Motion"),
          React.createElement("input", {
            type: "checkbox", checked: respectReducedMotion, style: checkStyle,
            onChange: (e) => {
              setRespectReducedMotion(e.target.checked);
              self.settings.respectReducedMotion = e.target.checked;
              self.saveSettings();
            },
          })
        ),

        // Animation duration
        React.createElement("div", { style: rowStyle },
          React.createElement("span", { style: labelStyle }, `Animation (${animDuration}ms + mist hold)`),
          React.createElement("input", {
            type: "range", min: 300, max: 1400, step: 50, value: animDuration,
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
