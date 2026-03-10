/**
 * @name ShadowStep
 * @description Bookmark channels as Shadow Anchors and teleport to them instantly with a shadow transition. Solo Leveling themed.
 * @version 1.0.1
 * @author BlueFlashX1
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/shared/hotkeys.js
var require_hotkeys = __commonJS({
  "src/shared/hotkeys.js"(exports2, module2) {
    function isEditableTarget2(target) {
      var _a, _b;
      if (!target) return false;
      const tag = ((_b = (_a = target.tagName) == null ? void 0 : _a.toLowerCase) == null ? void 0 : _b.call(_a)) || "";
      return tag === "input" || tag === "textarea" || tag === "select" || !!target.isContentEditable;
    }
    function parseHotkey(hotkey) {
      const parts = String(hotkey || "").split("+").map((p) => p.trim().toLowerCase());
      return {
        key: parts.filter(
          (p) => p !== "ctrl" && p !== "shift" && p !== "alt" && p !== "meta" && p !== "cmd"
        )[0] || "",
        ctrl: parts.includes("ctrl"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt"),
        meta: parts.includes("meta") || parts.includes("cmd")
      };
    }
    function matchesHotkey2(event, hotkey) {
      if (!event || !hotkey) return false;
      const spec = parseHotkey(hotkey);
      if (!spec.key) return false;
      return event.key.toLowerCase() === spec.key && event.ctrlKey === spec.ctrl && event.shiftKey === spec.shift && event.altKey === spec.alt && event.metaKey === spec.meta;
    }
    module2.exports = { isEditableTarget: isEditableTarget2, parseHotkey, matchesHotkey: matchesHotkey2 };
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

// src/shared/navigation.js
var require_navigation = __commonJS({
  "src/shared/navigation.js"(exports2, module2) {
    var { Webpack } = BdApi;
    var _cached = null;
    function getNavigationUtils2() {
      if (_cached) return _cached;
      _cached = Webpack.getByKeys("transitionTo", "back", "forward") || Webpack.getModule((m) => m.transitionTo && m.back && m.forward) || null;
      return _cached;
    }
    module2.exports = { getNavigationUtils: getNavigationUtils2 };
  }
});

// src/ShadowStep/components.js
var require_components = __commonJS({
  "src/ShadowStep/components.js"(exports2, module2) {
    function buildComponents2(BdApi2, pluginRef) {
      const React = BdApi2.React;
      const { useState, useEffect, useCallback, useMemo, useRef } = React;
      const ce = React.createElement;
      function AnchorCard({ anchor, onTeleport, onRemove, onRename }) {
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
        return ce(
          "div",
          {
            className: "ss-anchor-card",
            onClick: () => onTeleport(anchor.id),
            title: `${anchor.guildName} > #${anchor.channelName}
Uses: ${anchor.useCount}`
          },
          ce("div", { className: "ss-anchor-icon" }, guildInitial),
          ce(
            "div",
            { className: "ss-anchor-info" },
            editing ? ce("input", {
              ref: inputRef,
              className: "ss-anchor-rename-input",
              value: editValue,
              onChange: (e) => setEditValue(e.target.value),
              onKeyDown: handleKeyDown,
              onBlur: commitRename,
              onClick: (e) => e.stopPropagation()
            }) : ce("span", {
              className: "ss-anchor-name",
              onDoubleClick: handleDoubleClick
            }, anchor.name || anchor.channelName),
            ce("span", { className: "ss-anchor-server" }, anchor.guildName || "DM")
          ),
          ce("button", {
            className: "ss-anchor-remove",
            onClick: (e) => {
              e.stopPropagation();
              onRemove(anchor.id);
            },
            title: "Uproot Anchor"
          }, "\xD7")
        );
      }
      function AnchorPanel({ onClose }) {
        const [searchQuery, setSearchQuery] = useState("");
        const [sortBy, setSortBy] = useState(pluginRef.settings.sortBy);
        const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
        const searchRef = useRef(null);
        useEffect(() => {
          pluginRef._panelForceUpdate = forceUpdate;
          return () => {
            pluginRef._panelForceUpdate = null;
          };
        }, [forceUpdate]);
        useEffect(() => {
          setTimeout(() => {
            var _a;
            return (_a = searchRef.current) == null ? void 0 : _a.focus();
          }, 50);
        }, []);
        useEffect(() => {
          const handler = (e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              e.preventDefault();
              onClose();
            }
          };
          document.addEventListener("keydown", handler, true);
          return () => document.removeEventListener("keydown", handler, true);
        }, [onClose]);
        const anchors = useMemo(() => {
          let list = [...pluginRef.settings.anchors || []];
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(
              (a) => (a.name || "").toLowerCase().includes(q) || (a.channelName || "").toLowerCase().includes(q) || (a.guildName || "").toLowerCase().includes(q)
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
            default:
              list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          }
          return list;
        }, [searchQuery, sortBy, pluginRef.settings.anchors]);
        const groupedAnchors = useMemo(() => {
          const groups = /* @__PURE__ */ new Map();
          for (const anchor of anchors) {
            const groupKey = anchor.guildId ? `guild:${anchor.guildId}` : `dm:${anchor.guildName || "DM"}`;
            if (!groups.has(groupKey)) {
              groups.set(groupKey, {
                key: groupKey,
                guildName: anchor.guildName || "DM",
                anchors: []
              });
            }
            groups.get(groupKey).anchors.push(anchor);
          }
          return Array.from(groups.values());
        }, [anchors]);
        const handleTeleport = useCallback((anchorId) => {
          pluginRef.teleportTo(anchorId);
        }, []);
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
        return ce(
          "div",
          {
            className: "ss-panel-overlay",
            onClick: onClose
          },
          ce(
            "div",
            {
              className: "ss-panel-container",
              onClick: (e) => e.stopPropagation()
            },
            ce(
              "div",
              { className: "ss-panel-header" },
              ce("h2", { className: "ss-panel-title" }, "Shadow Step"),
              ce("button", {
                className: "ss-panel-close",
                onClick: onClose
              }, "\xD7")
            ),
            ce("input", {
              ref: searchRef,
              className: "ss-panel-search",
              type: "text",
              placeholder: "Search anchors...",
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value)
            }),
            ce(
              "div",
              { className: "ss-panel-sort" },
              ["manual", "recent", "name", "server"].map(
                (s) => ce("button", {
                  key: s,
                  className: `ss-sort-btn ${sortBy === s ? "ss-sort-active" : ""}`,
                  onClick: () => handleSortChange(s)
                }, s.charAt(0).toUpperCase() + s.slice(1))
              )
            ),
            ce(
              "div",
              { className: "ss-panel-list" },
              anchors.length === 0 ? ce(
                "div",
                { className: "ss-panel-empty" },
                searchQuery ? "No anchors match your search" : "No Shadow Anchors planted. Right-click a channel to plant one."
              ) : groupedAnchors.map(
                (group) => ce(
                  "div",
                  { key: group.key, className: "ss-anchor-group" },
                  ce("div", { className: "ss-anchor-group-header" }, group.guildName || "DM"),
                  group.anchors.map(
                    (anchor) => ce(AnchorCard, {
                      key: anchor.id,
                      anchor,
                      onTeleport: handleTeleport,
                      onRemove: handleRemove,
                      onRename: handleRename
                    })
                  )
                )
              )
            ),
            ce(
              "div",
              { className: "ss-panel-footer" },
              ce(
                "span",
                null,
                `${currentCount} / ${maxAnchors} anchors`,
                agiBonus > 0 ? ` (+${agiBonus} AGI)` : ""
              ),
              ce("span", { className: "ss-panel-hint" }, "Grouped by guild")
            )
          )
        );
      }
      return { AnchorCard, AnchorPanel };
    }
    module2.exports = {
      buildComponents: buildComponents2
    };
  }
});

// src/ShadowStep/settings-panel.js
var require_settings_panel = __commonJS({
  "src/ShadowStep/settings-panel.js"(exports2, module2) {
    var SETTINGS_ROW_STYLE = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)"
    };
    var SETTINGS_LABEL_STYLE = { color: "#ccc", fontSize: "13px" };
    var SETTINGS_INPUT_STYLE = {
      background: "rgba(0,0,0,0.3)",
      border: "1px solid rgba(138,43,226,0.3)",
      borderRadius: "6px",
      color: "#ddd",
      padding: "4px 8px",
      fontSize: "13px",
      outline: "none",
      width: "120px",
      textAlign: "center"
    };
    var SETTINGS_CHECK_STYLE = { accentColor: "#8a2be2" };
    var SETTINGS_LAST_ROW_STYLE = { ...SETTINGS_ROW_STYLE, borderBottom: "none" };
    function buildShadowStepSettingsPanel2(BdApi2, plugin, { baseMaxAnchors, agiBonusDivisor }) {
      const React = BdApi2.React;
      const SettingsPanel = () => {
        const [hotkey, setHotkey] = React.useState(plugin.settings.hotkey);
        const [animEnabled, setAnimEnabled] = React.useState(plugin.settings.animationEnabled);
        const [respectReducedMotion, setRespectReducedMotion] = React.useState(plugin.settings.respectReducedMotion ?? false);
        const [animDuration, setAnimDuration] = React.useState(plugin.settings.animationDuration);
        const [maxAnchors, setMaxAnchors] = React.useState(plugin.settings.maxAnchors);
        const [debug, setDebug] = React.useState(plugin.settings.debugMode);
        const agiStat = plugin._getAgiStat();
        const effectiveMax = (maxAnchors || baseMaxAnchors) + Math.floor(agiStat / agiBonusDivisor);
        const anchorCount = (plugin.settings.anchors || []).length;
        return React.createElement(
          "div",
          {
            style: { padding: "16px", background: "#1e1e2e", borderRadius: "8px", color: "#ccc" }
          },
          React.createElement("h3", {
            style: { color: "#8a2be2", marginTop: 0, marginBottom: "12px", fontFamily: "'Orbitron', sans-serif" }
          }, "Shadow Step Settings"),
          React.createElement(
            "div",
            {
              style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }
            },
            React.createElement(
              "div",
              {
                style: { background: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.3)", borderRadius: "8px", padding: "10px", textAlign: "center" }
              },
              React.createElement("div", { style: { color: "#8a2be2", fontSize: "18px", fontWeight: "700" } }, anchorCount),
              React.createElement("div", { style: { color: "#999", fontSize: "11px" } }, "Active Anchors")
            ),
            React.createElement(
              "div",
              {
                style: { background: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.3)", borderRadius: "8px", padding: "10px", textAlign: "center" }
              },
              React.createElement("div", { style: { color: "#8a2be2", fontSize: "18px", fontWeight: "700" } }, effectiveMax),
              React.createElement(
                "div",
                { style: { color: "#999", fontSize: "11px" } },
                `Max Slots${agiStat > 0 ? ` (+${Math.floor(agiStat / agiBonusDivisor)} AGI)` : ""}`
              )
            )
          ),
          React.createElement(
            "div",
            { style: SETTINGS_ROW_STYLE },
            React.createElement("span", { style: SETTINGS_LABEL_STYLE }, "Hotkey"),
            React.createElement("input", {
              style: SETTINGS_INPUT_STYLE,
              value: hotkey,
              onChange: (e) => {
                setHotkey(e.target.value);
                plugin.settings.hotkey = e.target.value;
                plugin._unregisterHotkey();
                plugin._registerHotkey();
                plugin.scheduleSaveSettings();
              }
            })
          ),
          React.createElement(
            "div",
            { style: SETTINGS_ROW_STYLE },
            React.createElement("span", { style: SETTINGS_LABEL_STYLE }, "Shadow Transition"),
            React.createElement("input", {
              type: "checkbox",
              checked: animEnabled,
              style: SETTINGS_CHECK_STYLE,
              onChange: (e) => {
                setAnimEnabled(e.target.checked);
                plugin.settings.animationEnabled = e.target.checked;
                plugin.scheduleSaveSettings();
              }
            })
          ),
          React.createElement(
            "div",
            { style: SETTINGS_ROW_STYLE },
            React.createElement("span", { style: SETTINGS_LABEL_STYLE }, "Respect Reduced Motion"),
            React.createElement("input", {
              type: "checkbox",
              checked: respectReducedMotion,
              style: SETTINGS_CHECK_STYLE,
              onChange: (e) => {
                setRespectReducedMotion(e.target.checked);
                plugin.settings.respectReducedMotion = e.target.checked;
                plugin.scheduleSaveSettings();
              }
            })
          ),
          React.createElement(
            "div",
            { style: SETTINGS_ROW_STYLE },
            React.createElement("span", { style: SETTINGS_LABEL_STYLE }, `Animation (${animDuration}ms + mist hold)`),
            React.createElement("input", {
              type: "range",
              min: 300,
              max: 1400,
              step: 50,
              value: animDuration,
              style: { accentColor: "#8a2be2", width: "120px" },
              onChange: (e) => {
                const val = parseInt(e.target.value, 10);
                if (Number.isNaN(val)) return;
                setAnimDuration(val);
                plugin.settings.animationDuration = val;
                plugin.scheduleSaveSettings();
              }
            })
          ),
          React.createElement(
            "div",
            { style: SETTINGS_ROW_STYLE },
            React.createElement("span", { style: SETTINGS_LABEL_STYLE }, "Base Max Anchors"),
            React.createElement("input", {
              type: "number",
              min: 3,
              max: 50,
              value: maxAnchors,
              style: { ...SETTINGS_INPUT_STYLE, width: "60px" },
              onChange: (e) => {
                const val = Math.max(3, Math.min(50, parseInt(e.target.value, 10) || baseMaxAnchors));
                setMaxAnchors(val);
                plugin.settings.maxAnchors = val;
                plugin.scheduleSaveSettings();
              }
            })
          ),
          React.createElement(
            "div",
            { style: SETTINGS_LAST_ROW_STYLE },
            React.createElement("span", { style: SETTINGS_LABEL_STYLE }, "Debug Mode"),
            React.createElement("input", {
              type: "checkbox",
              checked: debug,
              style: SETTINGS_CHECK_STYLE,
              onChange: (e) => {
                setDebug(e.target.checked);
                plugin.settings.debugMode = e.target.checked;
                plugin.scheduleSaveSettings();
              }
            })
          )
        );
      };
      return React.createElement(SettingsPanel);
    }
    module2.exports = { buildShadowStepSettingsPanel: buildShadowStepSettingsPanel2 };
  }
});

// src/ShadowStep/styles.js
var require_styles = __commonJS({
  "src/ShadowStep/styles.js"(exports2, module2) {
    function getShadowStepCss2(pluginVersion) {
      return `
/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   ShadowStep v${pluginVersion} \u2014 Shadow Anchor Teleportation
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

/* \u2500\u2500 Transition Animation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

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

/* \u2500\u2500 Panel Overlay \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

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
  border-radius: 2px;
  width: 420px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(138, 43, 226, 0.15);
  overflow: hidden;
}

/* \u2500\u2500 Panel Header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

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
  border-radius: 2px;
  transition: color 0.15s ease, background 0.15s ease;
}
.ss-panel-close:hover { color: #fff; background: rgba(138, 43, 226, 0.2); }

/* \u2500\u2500 Search \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.ss-panel-search {
  margin: 10px 16px 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(138, 43, 226, 0.2);
  border-radius: 2px;
  color: #ddd;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s ease;
}
.ss-panel-search:focus {
  border-color: rgba(138, 43, 226, 0.5);
}
.ss-panel-search::placeholder { color: #666; }

/* \u2500\u2500 Sort Controls \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

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
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.ss-sort-btn:hover { color: #aaa; }
.ss-sort-active {
  color: #8a2be2;
  border-color: rgba(138, 43, 226, 0.3);
  background: rgba(138, 43, 226, 0.08);
}

/* \u2500\u2500 Anchor List \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.ss-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
  min-height: 80px;
  max-height: 45vh;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

.ss-panel-list::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
.ss-panel-list::-webkit-scrollbar-track { background: transparent !important; }
.ss-panel-list::-webkit-scrollbar-thumb {
  background: transparent !important;
  border: none !important;
}

.ss-panel-empty {
  text-align: center;
  color: #666;
  padding: 24px 16px;
  font-size: 13px;
  line-height: 1.5;
}

.ss-anchor-group {
  margin-bottom: 8px;
}

.ss-anchor-group:last-child {
  margin-bottom: 0;
}

.ss-anchor-group-header {
  color: #9f9faf;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 6px 10px 4px;
}

/* \u2500\u2500 Anchor Card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.ss-anchor-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 2px;
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
  border-radius: 2px;
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
  border-radius: 2px;
  transition: color 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
  opacity: 0;
}
.ss-anchor-card:hover .ss-anchor-remove { opacity: 1; }
.ss-anchor-remove:hover {
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

/* \u2500\u2500 Panel Footer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

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
    module2.exports = { getShadowStepCss: getShadowStepCss2 };
  }
});

// src/ShadowStep/index.js
var _bdLoad = (f) => {
  try {
    const m = { exports: {} };
    new Function("module", "exports", require("fs").readFileSync(require("path").join(BdApi.Plugins.folder, f), "utf8"))(m, m.exports);
    return typeof m.exports === "function" || Object.keys(m.exports).length ? m.exports : null;
  } catch (e) {
    return null;
  }
};
var PLUGIN_NAME = "ShadowStep";
var PLUGIN_VERSION = "1.0.1";
var STYLE_ID = "shadow-step-css";
var PANEL_CONTAINER_ID = "ss-panel-root";
var TRANSITION_ID = "ss-transition-overlay";
var BASE_MAX_ANCHORS = 10;
var AGI_BONUS_DIVISOR = 20;
var STATS_CACHE_TTL = 5e3;
var DEFAULT_SETTINGS = {
  anchors: [],
  hotkey: "Ctrl+Shift+S",
  animationEnabled: true,
  respectReducedMotion: false,
  animationDuration: 550,
  maxAnchors: BASE_MAX_ANCHORS,
  sortBy: "manual",
  debugMode: false
};
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
var { isEditableTarget: _sharedIsEditableTarget, matchesHotkey: _sharedMatchesHotkey } = require_hotkeys();
var { createToast } = require_toast();
var { getNavigationUtils } = require_navigation();
var isEditableTarget = (_PluginUtils == null ? void 0 : _PluginUtils.isEditableTarget) || _sharedIsEditableTarget;
var matchesHotkey = (_PluginUtils == null ? void 0 : _PluginUtils.matchesHotkey) || _sharedMatchesHotkey;
var _ttl = (_PluginUtils == null ? void 0 : _PluginUtils.createTTLCache) || ((ms) => {
  let v, t = 0;
  return { get: () => Date.now() - t < ms ? v : null, set: (x) => {
    v = x;
    t = Date.now();
  }, invalidate: () => {
    v = null;
    t = 0;
  } };
});
var { buildComponents } = require_components();
var { buildShadowStepSettingsPanel } = require_settings_panel();
var { getShadowStepCss } = require_styles();
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
    this._navigateRetryTimers = /* @__PURE__ */ new Set();
    this._navigateRequestId = 0;
    this._channelFadeToken = 0;
    this._channelFadeResetTimer = null;
    this._unpatchContextMenu = null;
    this._hotkeyHandler = null;
    this._panelReactRoot = null;
    this._panelForceUpdate = null;
    this._panelOpen = false;
    this._components = null;
    this._statsCache = _ttl(STATS_CACHE_TTL);
    this._settingsSaveTimer = null;
  }
  // ── Lifecycle ───────────────────────────────────────────────
  start() {
    var _a;
    this._toast = ((_a = _PluginUtils == null ? void 0 : _PluginUtils.createToastHelper) == null ? void 0 : _a.call(_PluginUtils, "shadowStep")) || createToast();
    this.loadSettings();
    this.initWebpack();
    this._components = buildComponents(BdApi, this);
    this.injectCSS();
    this.patchContextMenu();
    this._registerHotkey();
    this._pruneStaleAnchors();
    this._toast(`${PLUGIN_NAME} v${PLUGIN_VERSION} \u2014 Shadows ready`, "info");
  }
  stop() {
    var _a, _b, _c, _d;
    try {
      this.closePanel();
      if (this._unpatchContextMenu) {
        try {
          this._unpatchContextMenu();
        } catch (error) {
          this.debugError("ContextMenu", "Failed to unpatch context menu", error);
        }
        this._unpatchContextMenu = null;
      }
      this._unregisterHotkey();
      (_a = _TransitionCleanupUtils == null ? void 0 : _TransitionCleanupUtils.cancelPendingTransition) == null ? void 0 : _a.call(_TransitionCleanupUtils, this);
      if (this._transitionNavTimeout) {
        clearTimeout(this._transitionNavTimeout);
        this._transitionNavTimeout = null;
      }
      if (this._transitionCleanupTimeout) {
        clearTimeout(this._transitionCleanupTimeout);
        this._transitionCleanupTimeout = null;
      }
      (_b = _TransitionCleanupUtils == null ? void 0 : _TransitionCleanupUtils.clearNavigateRetries) == null ? void 0 : _b.call(_TransitionCleanupUtils, this);
      if ((_c = this._navigateRetryTimers) == null ? void 0 : _c.size) {
        for (const t of this._navigateRetryTimers) clearTimeout(t);
        this._navigateRetryTimers.clear();
      }
      (_d = _TransitionCleanupUtils == null ? void 0 : _TransitionCleanupUtils.cancelChannelViewFade) == null ? void 0 : _d.call(_TransitionCleanupUtils, this);
      if (this._channelFadeResetTimer) {
        clearTimeout(this._channelFadeResetTimer);
        this._channelFadeResetTimer = null;
      }
      this.removeCSS();
      this._components = null;
      this._NavigationUtils = null;
      this._ChannelStore = null;
      this._GuildStore = null;
      this._SelectedGuildStore = null;
      this._statsCache.invalidate();
      this._cssCache = null;
      this._flushScheduledSettingsSave();
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    this._toast(`${PLUGIN_NAME} \u2014 Anchors dormant`, "info");
  }
  // ── Webpack ─────────────────────────────────────────────────
  initWebpack() {
    const { Webpack } = BdApi;
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._GuildStore = Webpack.getStore("GuildStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._NavigationUtils = getNavigationUtils();
    this.debugLog("Webpack", "Modules acquired", {
      ChannelStore: !!this._ChannelStore,
      GuildStore: !!this._GuildStore,
      SelectedGuildStore: !!this._SelectedGuildStore,
      NavigationUtils: !!this._NavigationUtils
    });
  }
  // ── Settings ────────────────────────────────────────────────
  loadSettings() {
    try {
      if (typeof (_PluginUtils == null ? void 0 : _PluginUtils.loadSettings) === "function") {
        this.settings = _PluginUtils.loadSettings(PLUGIN_NAME, DEFAULT_SETTINGS);
      } else {
        const saved = BdApi.Data.load(PLUGIN_NAME, "settings") || {};
        this.settings = { ...DEFAULT_SETTINGS, ...saved };
      }
      if (!Array.isArray(this.settings.anchors)) this.settings.anchors = [];
    } catch (_) {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    this._rebuildAnchorIndex();
  }
  saveSettings() {
    try {
      if (typeof (_PluginUtils == null ? void 0 : _PluginUtils.saveSettings) === "function") {
        _PluginUtils.saveSettings(PLUGIN_NAME, this.settings);
      } else {
        BdApi.Data.save(PLUGIN_NAME, "settings", this.settings);
      }
    } catch (err) {
      this.debugError("Settings", "Failed to save:", err);
    }
  }
  scheduleSaveSettings(delayMs = 180) {
    if (this._settingsSaveTimer) clearTimeout(this._settingsSaveTimer);
    this._settingsSaveTimer = setTimeout(() => {
      this._settingsSaveTimer = null;
      this.saveSettings();
    }, delayMs);
  }
  _flushScheduledSettingsSave() {
    if (!this._settingsSaveTimer) return;
    clearTimeout(this._settingsSaveTimer);
    this._settingsSaveTimer = null;
    this.saveSettings();
  }
  // ── Context Menu ────────────────────────────────────────────
  patchContextMenu() {
    try {
      if (this._unpatchContextMenu) {
        try {
          this._unpatchContextMenu();
        } catch (_) {
        }
        this._unpatchContextMenu = null;
      }
      this._unpatchContextMenu = BdApi.ContextMenu.patch("channel-context", (tree, props) => {
        var _a;
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
                this._toast(`Uprooted anchor: #${anchor.channelName}`, "info");
              }
            }
          });
        } else {
          const maxAnchors = this.getMaxAnchors();
          const atMax = this.settings.anchors.length >= maxAnchors;
          menuItem = BdApi.ContextMenu.buildItem({
            type: "text",
            label: atMax ? `Shadow Anchor (${this.settings.anchors.length}/${maxAnchors})` : "Plant Shadow Anchor",
            id: "shadow-step-add",
            disabled: atMax,
            action: () => {
              if (atMax) return;
              this.addAnchor(channelId, guildId);
            }
          });
        }
        const children = (_a = tree == null ? void 0 : tree.props) == null ? void 0 : _a.children;
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
    var _a, _b;
    if (this.hasAnchor(channelId)) {
      this._toast("Channel already anchored", "warning");
      return;
    }
    const maxAnchors = this.getMaxAnchors();
    if (this.settings.anchors.length >= maxAnchors) {
      this._toast(`Max anchors reached (${maxAnchors})`, "warning");
      return;
    }
    const channel = (_a = this._ChannelStore) == null ? void 0 : _a.getChannel(channelId);
    const guild = guildId ? (_b = this._GuildStore) == null ? void 0 : _b.getGuild(guildId) : null;
    const anchor = {
      id: `sa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: (channel == null ? void 0 : channel.name) || "unknown",
      guildId: guildId || null,
      channelId,
      guildName: (guild == null ? void 0 : guild.name) || (guildId ? "Unknown Server" : "DM"),
      channelName: (channel == null ? void 0 : channel.name) || "unknown",
      createdAt: Date.now(),
      lastUsed: null,
      useCount: 0,
      sortOrder: this.settings.anchors.length
    };
    this.settings.anchors = [...this.settings.anchors, anchor];
    this._rebuildAnchorIndex();
    this.saveSettings();
    if (this._panelForceUpdate) this._panelForceUpdate();
    this._toast(`Shadow Anchor planted: #${anchor.channelName}`, "success");
    this.debugLog("Anchor", "Added:", anchor.name, anchor.channelId);
  }
  removeAnchor(anchorId) {
    this.settings.anchors = this.settings.anchors.filter((a) => a.id !== anchorId);
    this.settings.anchors.forEach((a, i) => {
      a.sortOrder = i;
    });
    this._rebuildAnchorIndex();
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
    var _a;
    return ((_a = this._anchoredChannelIds) == null ? void 0 : _a.has(channelId)) ?? this.settings.anchors.some((a) => a.channelId === channelId);
  }
  _rebuildAnchorIndex() {
    this._anchoredChannelIds = new Set(this.settings.anchors.map((a) => a.channelId));
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
      this.settings.anchors.forEach((a, i) => {
        a.sortOrder = i;
      });
      this._rebuildAnchorIndex();
      this.saveSettings();
      this.debugLog("Prune", `Removed ${pruned} stale anchors`);
    }
  }
  // ── Stats Integration ───────────────────────────────────────
  _getAgiStat() {
    var _a, _b, _c;
    const cached = this._statsCache.get();
    if (cached !== null) {
      return cached.agility || 0;
    }
    try {
      const soloPlugin = BdApi.Plugins.get("SoloLevelingStats");
      if (!(soloPlugin == null ? void 0 : soloPlugin.instance)) {
        this._statsCache.set({ agility: 0 });
        return 0;
      }
      const stats = ((_b = (_a = soloPlugin.instance).getTotalEffectiveStats) == null ? void 0 : _b.call(_a)) || ((_c = soloPlugin.instance.settings) == null ? void 0 : _c.stats) || {};
      this._statsCache.set(stats);
      return stats.agility || 0;
    } catch (_) {
      this._statsCache.set({ agility: 0 });
      return 0;
    }
  }
  // ── Navigation ──────────────────────────────────────────────
  teleportTo(anchorId) {
    var _a, _b, _c;
    const anchor = this.settings.anchors.find((a) => a.id === anchorId);
    if (!anchor) {
      this._toast("Anchor not found", "error");
      return;
    }
    const channelExists = (_a = this._ChannelStore) == null ? void 0 : _a.getChannel(anchor.channelId);
    if (!channelExists) {
      this.removeAnchor(anchor.id);
      this._toast("Anchor is stale and was removed", "warning");
      this.debugLog("Teleport", "Blocked stale anchor", anchor.id, anchor.channelId);
      return;
    }
    const path = anchor.guildId ? `/channels/${anchor.guildId}/${anchor.channelId}` : `/channels/@me/${anchor.channelId}`;
    this.closePanel();
    anchor.lastUsed = Date.now();
    anchor.useCount = (anchor.useCount || 0) + 1;
    this.saveSettings();
    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      _ensureShadowPortalCoreApplied(this.constructor);
    }
    if (typeof this.playTransition !== "function" || typeof this._navigate !== "function") {
      this.debugError("Teleport", "Shared portal core missing; using direct navigation fallback");
      if ((_b = this._NavigationUtils) == null ? void 0 : _b.transitionTo) {
        this._NavigationUtils.transitionTo(path);
      } else if ((_c = window.history) == null ? void 0 : _c.pushState) {
        window.history.pushState({}, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      this._toast(`Shadow Step \u2192 #${anchor.channelName}`, "warning");
      return;
    }
    const _ssT0 = performance.now();
    const _ssDiag = this.settings.debugMode ? (phase) => console.log(`%c[PortalDiag:ShadowStep]%c ${phase} %c@ ${Math.round(performance.now() - _ssT0)}ms`, "color:#f59e0b;font-weight:bold", "color:#e2e8f0", "color:#94a3b8") : () => {
    };
    _ssDiag(`TELEPORT_START \u2192 ${anchor.name} (${path})`);
    this.playTransition(() => {
      _ssDiag("NAV_CALLBACK_ENTERED (playTransition fired callback)");
      const fadeToken = this._beginChannelViewFadeOut();
      _ssDiag("CHANNEL_FADE_OUT_STARTED");
      this._navigate(path, {
        anchorId: anchor.id,
        anchorName: anchor.name,
        channelId: anchor.channelId
      }, {
        onConfirmed: () => {
          _ssDiag("NAVIGATE_CONFIRMED (Discord switched)");
          this._finishChannelViewFade(fadeToken, true);
          _ssDiag("CHANNEL_FADE_IN_STARTED (success)");
        },
        onFailed: () => {
          _ssDiag("NAVIGATE_FAILED");
          this._finishChannelViewFade(fadeToken, false);
          _ssDiag("CHANNEL_FADE_IN_STARTED (failure)");
        }
      });
    }, path);
    this._toast(`Shadow Step \u2192 #${anchor.channelName}`, "success");
    this.debugLog("Teleport", anchor.name, path);
  }
  // ── Hotkey ──────────────────────────────────────────────────
  _registerHotkey() {
    var _a, _b;
    const isMac = ((_a = navigator.platform) == null ? void 0 : _a.startsWith("Mac")) || ((_b = navigator.userAgent) == null ? void 0 : _b.includes("Mac"));
    this._hotkeyHandler = (e) => {
      if (!this.settings.hotkey) return;
      if (isEditableTarget(e.target)) return;
      const directMatch = matchesHotkey(e, this.settings.hotkey);
      const macAlias = isMac && e.metaKey && !e.ctrlKey && matchesHotkey(
        { key: e.key, ctrlKey: true, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: false },
        this.settings.hotkey
      );
      if (directMatch || macAlias) {
        e.preventDefault();
        e.stopPropagation();
        this.togglePanel();
      }
    };
    document.addEventListener("keydown", this._hotkeyHandler);
    this.debugLog("Hotkey", `Registered: ${this.settings.hotkey} (macOS Cmd alias: ${isMac})`);
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
    var _a;
    if (this._panelOpen) return;
    const container = document.createElement("div");
    container.id = PANEL_CONTAINER_ID;
    document.body.appendChild(container);
    const createRoot = (_a = BdApi.ReactDOM) == null ? void 0 : _a.createRoot;
    if (createRoot) {
      const root = createRoot(container);
      root.render(
        BdApi.React.createElement(this._components.AnchorPanel, {
          onClose: () => this.closePanel()
        })
      );
      this._panelReactRoot = root;
    } else {
      BdApi.ReactDOM.render(
        BdApi.React.createElement(this._components.AnchorPanel, {
          onClose: () => this.closePanel()
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
      const container2 = document.getElementById(PANEL_CONTAINER_ID);
      if (container2) BdApi.ReactDOM.unmountComponentAtNode(container2);
    } else if (this._panelReactRoot) {
      try {
        this._panelReactRoot.unmount();
      } catch (error) {
        this.debugError("Panel", "Failed to unmount panel React root", error);
      }
    }
    this._panelReactRoot = null;
    const container = document.getElementById(PANEL_CONTAINER_ID);
    if (container) container.remove();
    this._panelOpen = false;
    this._panelForceUpdate = null;
    this.debugLog("Panel", "Closed");
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
    if (this._cssCache) return this._cssCache;
    this._cssCache = getShadowStepCss(PLUGIN_VERSION);
    return this._cssCache;
  }
  // ── Settings Panel ──────────────────────────────────────────
  getSettingsPanel() {
    return buildShadowStepSettingsPanel(BdApi, this, {
      baseMaxAnchors: BASE_MAX_ANCHORS,
      agiBonusDivisor: AGI_BONUS_DIVISOR
    });
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
  navigationFailureToast: "Shadow Step failed to switch channel",
  contextLabelKeys: ["anchorName", "label", "name"]
};
var _ensureShadowPortalCoreApplied = (PluginClass = module.exports) => {
  const core = _loadShadowPortalCore();
  if (!(core == null ? void 0 : core.applyPortalCoreToClass)) return false;
  core.applyPortalCoreToClass(PluginClass, SHADOW_PORTAL_CONFIG);
  return true;
};
if (!_ensureShadowPortalCoreApplied(module.exports)) {
  console.warn(`[${PLUGIN_NAME}] Shared portal core unavailable. Navigation/transition patch will not be shared.`);
}
