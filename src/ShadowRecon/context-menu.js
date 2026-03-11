function buildStaffContextItems(plugin, BdApi, userId, currentGuildId) {
  if (!plugin.settings.showStaffIntelInContextMenu) return [];
  const staff = plugin.getStaffIntel(userId, currentGuildId);
  if (!staff) return [];

  const detailedUnlocked = plugin.isDetailedStaffIntelUnlocked(currentGuildId);
  return [
    BdApi.ContextMenu.buildItem({
      type: "text",
      label: `Shadow Recon: ${staff.label}`,
      disabled: true,
    }),
    BdApi.ContextMenu.buildItem({
      type: "text",
      label: detailedUnlocked
        ? "Shadow Recon: Open Staff Dossier"
        : "Shadow Recon: Staff Dossier (recon guild)",
      action: detailedUnlocked
        ? () => plugin.openStaffIntelModal(userId, currentGuildId)
        : undefined,
      disabled: !detailedUnlocked,
    }),
  ];
}

function buildMarkedTargetContextItems(plugin, BdApi, userId, currentGuildId) {
  if (!plugin.settings.showMarkedTargetIntelInContext) return [];
  if (!plugin._canShowLimitedTargetIntel(userId, currentGuildId)) return [];

  const deployment = plugin._getShadowDeploymentMap().get(String(userId));
  return [
    BdApi.ContextMenu.buildItem({
      type: "text",
      label: `Shadow Recon: Target Intel (Same Guild)${deployment?.shadowRank ? ` [${deployment.shadowRank}]` : ""}`,
      action: () => plugin.openUserIntelModal(userId, currentGuildId),
    }),
  ];
}

function buildUserContextReconItems(plugin, BdApi, userId, currentGuildId) {
  return [
    ...buildStaffContextItems(plugin, BdApi, userId, currentGuildId),
    ...buildMarkedTargetContextItems(plugin, BdApi, userId, currentGuildId),
  ];
}

function buildGuildReconActions(plugin, BdApi, guildId, guild = null) {
  if (!guildId) return [];
  const marked = plugin.isGuildMarked(guildId);
  const guildName = guild?.name || guildId;

  return [
    BdApi.ContextMenu.buildItem({
      type: "text",
      label: marked ? "Unrecon Guild" : "Recon Guild",
      action: () => {
        const nextMarked = plugin.toggleGuildMark(guildId);
        plugin._toast(
          nextMarked
            ? `Recon enabled for guild: ${guildName}`
            : `Recon removed for guild: ${guildName}`,
          nextMarked ? "success" : "info"
        );
      },
    }),
    BdApi.ContextMenu.buildItem({
      type: "text",
      label: "Open Guild Dossier",
      action: () => plugin.openGuildDossier(guildId),
    }),
  ];
}

function getDirectContextChildrenArray(node) {
  if (Array.isArray(node)) return node;
  if (Array.isArray(node?.props?.children)) return node.props.children;
  if (Array.isArray(node?.children)) return node.children;
  return null;
}

function collectContextChildrenCandidates(node) {
  const candidates = [];
  if (node?.props?.children) candidates.push(node.props.children);
  if (node?.children) candidates.push(node.children);

  if (node?.props && typeof node.props === "object") {
    for (const value of Object.values(node.props)) {
      if (!value || value === node.props.children) continue;
      if (typeof value === "object") candidates.push(value);
    }
  }
  return candidates;
}

function resolveContextChildrenArray(node, depth = 0, seen = null) {
  if (!node || depth > 7) return null;
  if (!seen) seen = new Set();
  if (typeof node !== "object") return null;
  if (seen.has(node)) return null;
  seen.add(node);

  const direct = getDirectContextChildrenArray(node);
  if (direct) return direct;

  for (const candidate of collectContextChildrenCandidates(node)) {
    const found = resolveContextChildrenArray(candidate, depth + 1, seen);
    if (found) return found;
  }

  return null;
}

function appendContextItems(BdApi, tree, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  const target = resolveContextChildrenArray(tree);
  if (!target || !Array.isArray(target)) return;
  target.push(BdApi.ContextMenu.buildItem({ type: "separator" }), ...items);
}

module.exports = {
  appendContextItems,
  buildGuildReconActions,
  buildMarkedTargetContextItems,
  buildStaffContextItems,
  buildUserContextReconItems,
  collectContextChildrenCandidates,
  getDirectContextChildrenArray,
  resolveContextChildrenArray,
};
