function buildTitleComponents(BdApi, pluginInstance) {
  const React = BdApi.React;
  const ce = React.createElement;

  const SORT_OPTIONS = [
    { value: "xpBonus", label: "XP Gain (Highest)" },
    { value: "critBonus", label: "Crit Chance (Highest)" },
    { value: "strBonus", label: "Strength % (Highest)" },
    { value: "agiBonus", label: "Agility % (Highest)" },
    { value: "intBonus", label: "Intelligence % (Highest)" },
    { value: "vitBonus", label: "Vitality % (Highest)" },
    { value: "perBonus", label: "Perception % (Highest)" },
  ];

  function TitleCard({ title, isActive, bonus, onEquip }) {
    const buffs = pluginInstance.formatTitleBonusLines(bonus);
    return ce("div", { className: `tm-title-card ${isActive ? "active" : ""}`.trim() },
      ce("div", { className: "tm-title-icon" }, ""),
      ce("div", { className: "tm-title-name" }, title),
      buffs.length > 0 ? ce("div", { className: "tm-title-bonus" }, buffs.join(", ")) : null,
      isActive
        ? ce("div", { className: "tm-title-status" }, "Equipped")
        : ce("button", { className: "tm-equip-btn", onClick: () => onEquip(title) }, "Equip")
    );
  }

  function TitleModal({ onClose }) {
    const [sortBy, setSortBy] = React.useState(pluginInstance.settings.sortBy || "xpBonus");
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

    React.useEffect(() => {
      pluginInstance._modalForceUpdate = forceUpdate;
      return () => { pluginInstance._modalForceUpdate = null; };
    }, [forceUpdate]);

    React.useEffect(() => {
      const handler = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }, [onClose]);

    const soloData = pluginInstance.getSoloLevelingData();
    const isTitleAllowed = (t) => !pluginInstance._unwantedTitles.has(t);
    const rawTitles = soloData?.titles || [];
    const titlesLen = rawTitles.length;
    const { sorted: titles, bonusMap } = React.useMemo(() => {
      const filtered = rawTitles.filter(isTitleAllowed);
      return pluginInstance.getSortedTitles({ titles: filtered, sortBy });
    }, [titlesLen, sortBy]);

    const activeTitle = soloData?.activeTitle && isTitleAllowed(soloData.activeTitle) ? soloData.activeTitle : null;

    const handleSortChange = React.useCallback((e) => {
      const val = e.target.value;
      setSortBy(val);
      pluginInstance.settings.sortBy = val;
      pluginInstance.saveSettings();
    }, []);

    const handleEquip = React.useCallback((title) => {
      pluginInstance.equipTitle(title);
    }, []);

    const handleUnequip = React.useCallback(() => {
      pluginInstance.unequipTitle();
    }, []);

    const handleOverlayClick = React.useCallback((e) => {
      if (e.target.classList?.contains("tm-title-modal")) onClose();
    }, [onClose]);

    let activeTitleSection;
    if (activeTitle) {
      const bonus = bonusMap[activeTitle] ?? pluginInstance.getTitleBonus(activeTitle);
      const buffs = pluginInstance.formatTitleBonusLines(bonus);
      activeTitleSection = ce("div", { className: "tm-active-title" },
        ce("div", { className: "tm-active-label" }, "Active Title:"),
        ce("div", { className: "tm-active-name" }, activeTitle),
        buffs.length > 0 ? ce("div", { className: "tm-active-bonus" }, buffs.join(", ")) : null,
        ce("button", { className: "tm-unequip-btn", onClick: handleUnequip }, "Unequip")
      );
    } else {
      activeTitleSection = ce("div", { className: "tm-no-title" },
        ce("div", { className: "tm-no-title-text" }, "No title equipped")
      );
    }

    let gridContent;
    if (titles.length === 0) {
      gridContent = ce("div", { className: "tm-empty-state" },
        ce("div", { className: "tm-empty-icon" }, ""),
        ce("div", { className: "tm-empty-text" }, "No titles unlocked yet"),
        ce("div", { className: "tm-empty-hint" }, "Complete achievements to earn titles")
      );
    } else {
      gridContent = ce("div", { className: "tm-titles-grid" },
        titles.map((title) => ce(TitleCard, {
          key: title,
          title,
          isActive: title === activeTitle,
          bonus: bonusMap[title] ?? pluginInstance.getTitleBonus(title),
          onEquip: handleEquip,
        }))
      );
    }

    return ce("div", { className: "tm-title-modal", onClick: handleOverlayClick },
      ce("div", { className: "tm-modal-content" },
        ce("div", { className: "tm-modal-header" },
          ce("h2", null, "Titles"),
          ce("button", { className: "tm-close-button", onClick: onClose }, "\u00D7")
        ),
        ce("div", { className: "tm-filter-bar" },
          ce("label", { className: "tm-filter-label" }, "Sort by:"),
          ce("select", { id: "tm-sort-select", className: "tm-sort-dropdown", value: sortBy, onChange: handleSortChange },
            SORT_OPTIONS.map((opt) => ce("option", { key: opt.value, value: opt.value }, opt.label))
          )
        ),
        ce("div", { className: "tm-modal-body" },
          activeTitleSection,
          ce("div", { className: "tm-titles-section" },
            ce("h3", { className: "tm-section-title" }, `Available Titles (${titles.length})`),
            gridContent
          )
        )
      )
    );
  }

  return { TitleModal, TitleCard };
}

module.exports = {
  buildTitleComponents,
};
