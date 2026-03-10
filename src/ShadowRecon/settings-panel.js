const PANEL_STYLE = {
  padding: "16px",
  background: "#111827",
  color: "#d1d5db",
  borderRadius: "10px",
  border: "1px solid rgba(75, 123, 236, 0.35)",
};
const ROW_STYLE = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  padding: "10px 0",
  borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
};
const LABEL_STYLE = { color: "#e5e7eb", fontSize: "13px", fontWeight: "600" };
const NOTE_STYLE = { color: "#9ca3af", fontSize: "11px", marginTop: "2px", maxWidth: "480px" };
const STAT_STYLE = { color: "#93c5fd", fontWeight: "700" };

function buildSettingsPanel(BdApi, plugin) {
  const React = BdApi.React;
  const ce = React.createElement;

  const makeToggle = (label, key, note) => ce("div", { style: ROW_STYLE },
    ce("div", null,
      ce("div", { style: LABEL_STYLE }, label),
      note ? ce("div", { style: NOTE_STYLE }, note) : null
    ),
    ce("input", {
      type: "checkbox",
      defaultChecked: !!plugin.settings[key],
      onChange: (e) => {
        plugin.settings[key] = e.target.checked;
        plugin.saveSettings();
        plugin.refreshAllVisuals();
      },
      style: { accentColor: "#4b7bec" },
    })
  );

  const markedTargets = plugin._getShadowDeploymentMap().size;
  const currentGuildId = plugin._getCurrentGuildId();

  return ce("div", { style: PANEL_STYLE },
    ce("h3", { style: { marginTop: 0, color: "#60a5fa" } }, "Shadow Recon Control"),

    ce("div", { style: { marginBottom: "12px", color: "#9ca3af", fontSize: "12px" } },
      ce("span", null, "Guilds: "),
      ce("span", { style: STAT_STYLE }, plugin._formatNumber(plugin.getServerCount())),
      ce("span", null, " | Marked Guilds: "),
      ce("span", { style: STAT_STYLE }, plugin._formatNumber(plugin._markedGuildIds.size)),
      ce("span", null, " | Marked Targets: "),
      ce("span", { style: STAT_STYLE }, plugin._formatNumber(markedTargets))
    ),

    makeToggle("Lore Lock (recon guild for full dossier)", "loreLockedRecon", "When enabled, unrecon guild dossiers only show a limited briefing."),
    makeToggle("Server Counter Widget", "showServerCounterWidget", "Adds total guild / marked intel at top of guild bar."),
    makeToggle("Guild Hover Intel Hint", "showGuildHoverIntel", "Adds recon hint text on guild icon hover elements."),
    makeToggle("Staff Intel in User Context", "showStaffIntelInContextMenu", "Shows rank without recon mark; detailed staff dossier unlocks when guild is recon-marked."),
    makeToggle("Marked Target Intel Action", "showMarkedTargetIntelInContext", "Adds platform/connections intel action for ShadowSenses targets."),

    ce("div", { style: { display: "flex", gap: "8px", marginTop: "14px" } },
      ce("button", {
        className: "shadow-recon-button",
        onClick: () => plugin._toggleCurrentGuildMarkWithToast(),
      }, currentGuildId && plugin.isGuildMarked(currentGuildId) ? "Unrecon Current Guild" : "Recon Current Guild"),
      ce("button", {
        className: "shadow-recon-button",
        onClick: () => {
          if (currentGuildId) plugin.openGuildDossier(currentGuildId);
          else plugin._toast("Select a guild first", "warning");
        },
      }, "Open Current Guild Dossier"),
      ce("button", {
        className: "shadow-recon-button",
        onClick: () => {
          plugin._markedGuildIds.clear();
          plugin.saveMarkedGuilds();
          plugin.refreshAllVisuals();
          plugin._toast("Shadow Recon guild marks cleared", "info");
        },
      }, "Clear Recon Guilds")
    )
  );
}

module.exports = {
  buildSettingsPanel,
};
