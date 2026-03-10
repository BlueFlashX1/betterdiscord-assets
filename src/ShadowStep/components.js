function buildComponents(BdApi, pluginRef) {
  const React = BdApi.React;
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

    return ce("div", {
      className: "ss-anchor-card",
      onClick: () => onTeleport(anchor.id),
      title: `${anchor.guildName} > #${anchor.channelName}\nUses: ${anchor.useCount}`,
    },
      ce("div", { className: "ss-anchor-icon" }, guildInitial),
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
      ce("button", {
        className: "ss-anchor-remove",
        onClick: (e) => { e.stopPropagation(); onRemove(anchor.id); },
        title: "Uproot Anchor",
      }, "\u00D7")
    );
  }

  function AnchorPanel({ onClose }) {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState(pluginRef.settings.sortBy);
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
    const searchRef = useRef(null);

    useEffect(() => {
      pluginRef._panelForceUpdate = forceUpdate;
      return () => { pluginRef._panelForceUpdate = null; };
    }, [forceUpdate]);

    useEffect(() => {
      setTimeout(() => searchRef.current?.focus(), 50);
    }, []);

    useEffect(() => {
      const handler = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); }
      };
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }, [onClose]);

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
        default:
          list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      }
      return list;
    }, [searchQuery, sortBy, pluginRef.settings.anchors]);

    const groupedAnchors = useMemo(() => {
      const groups = new Map();
      for (const anchor of anchors) {
        const groupKey = anchor.guildId ? `guild:${anchor.guildId}` : `dm:${anchor.guildName || "DM"}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            key: groupKey,
            guildName: anchor.guildName || "DM",
            anchors: [],
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

    return ce("div", {
      className: "ss-panel-overlay",
      onClick: onClose,
    },
      ce("div", {
        className: "ss-panel-container",
        onClick: (e) => e.stopPropagation(),
      },
        ce("div", { className: "ss-panel-header" },
          ce("h2", { className: "ss-panel-title" }, "Shadow Step"),
          ce("button", {
            className: "ss-panel-close",
            onClick: onClose,
          }, "\u00D7")
        ),
        ce("input", {
          ref: searchRef,
          className: "ss-panel-search",
          type: "text",
          placeholder: "Search anchors...",
          value: searchQuery,
          onChange: (e) => setSearchQuery(e.target.value),
        }),
        ce("div", { className: "ss-panel-sort" },
          ["manual", "recent", "name", "server"].map((s) =>
            ce("button", {
              key: s,
              className: `ss-sort-btn ${sortBy === s ? "ss-sort-active" : ""}`,
              onClick: () => handleSortChange(s),
            }, s.charAt(0).toUpperCase() + s.slice(1))
          )
        ),
        ce("div", { className: "ss-panel-list" },
          anchors.length === 0
            ? ce("div", { className: "ss-panel-empty" },
                searchQuery
                  ? "No anchors match your search"
                  : "No Shadow Anchors planted. Right-click a channel to plant one."
              )
            : groupedAnchors.map((group) =>
                ce("div", { key: group.key, className: "ss-anchor-group" },
                  ce("div", { className: "ss-anchor-group-header" }, group.guildName || "DM"),
                  group.anchors.map((anchor) =>
                    ce(AnchorCard, {
                      key: anchor.id,
                      anchor,
                      onTeleport: handleTeleport,
                      onRemove: handleRemove,
                      onRename: handleRename,
                    })
                  )
                )
              )
        ),
        ce("div", { className: "ss-panel-footer" },
          ce("span", null,
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

module.exports = {
  buildComponents,
};
