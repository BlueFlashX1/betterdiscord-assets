function appendContextMenuItems(tree, ...items) {
  const children = tree?.props?.children;
  if (!Array.isArray(children)) return;
  children.push(...items);
}

function buildDMGripContextItem(ctx, channel, channelId, isGripped, actions) {
  return BdApi.ContextMenu.buildItem({
    type: "text",
    label: isGripped ? "Release Grip" : "Grip DM",
    id: isGripped ? "ra-release-dm" : "ra-grip-dm",
    action: () => {
      if (isGripped) {
        actions.releaseDM(ctx, channelId);
        return;
      }
      actions.gripDM(
        ctx,
        channelId,
        channel.rawRecipients?.[0]?.username || channel.name || "Unknown"
      );
    },
  });
}

function handleDMContextMenuPatch(options) {
  const {
    ctx,
    tree,
    channel,
    channelId,
    guildId,
    actions,
  } = options;
  if (guildId || (channel.type !== 1 && channel.type !== 3)) return false;
  const isGripped = actions.isDMGripped(ctx, channelId);
  const separator = BdApi.ContextMenu.buildItem({ type: "separator" });
  const item = buildDMGripContextItem(ctx, channel, channelId, isGripped, actions);
  appendContextMenuItems(tree, separator, item);
  return true;
}

function buildCategoryContextItem(ctx, guildId, channelId, channelName, actions) {
  const crushed = actions.isCategoryCrushed(ctx, guildId, channelId);
  return {
    type: "text",
    label: crushed ? "Release Category" : "Crush Category",
    id: crushed ? "ra-release-category" : "ra-crush-category",
    action: () => {
      if (crushed) {
        actions.releaseCategory(ctx, guildId, channelId);
        ctx._toast(`Released ${channelName}`, "info");
        return;
      }
      actions.crushCategory(ctx, guildId, channelId, channelName);
      ctx._toast(`Crushed ${channelName}`, "success");
    },
  };
}

function buildChannelContextItem(ctx, guildId, channelId, channelName, actions) {
  const hidden = actions.isChannelHidden(ctx, guildId, channelId);
  return {
    type: "text",
    label: hidden ? "Recall Channel" : "Push Channel",
    id: hidden ? "ra-recall-channel" : "ra-push-channel",
    action: () => {
      if (hidden) {
        actions.recallChannel(ctx, guildId, channelId);
        ctx._toast(`Recalled #${channelName}`, "info");
        return;
      }
      actions.pushChannel(ctx, guildId, channelId, channelName);
      ctx._toast(`Pushed #${channelName}`, "success");
    },
  };
}

function buildGuildContextItems(ctx, guildId, channel, actions) {
  const channelId = channel.id;
  const channelName = channel.name;
  const items = [];
  if (channel.type === 4) {
    items.push(buildCategoryContextItem(ctx, guildId, channelId, channelName, actions));
  }
  if (channel.type !== 4) {
    items.push(buildChannelContextItem(ctx, guildId, channelId, channelName, actions));
  }
  return items;
}

function appendGuildSubmenu(tree, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  const separator = BdApi.ContextMenu.buildItem({ type: "separator" });
  const submenu = BdApi.ContextMenu.buildItem({
    type: "submenu",
    label: "Ruler's Authority",
    id: "ra-submenu",
    items,
  });
  appendContextMenuItems(tree, separator, submenu);
}

export function applyChannelContextMenuPatch(options) {
  const {
    ctx,
    tree,
    channel,
    guildId,
    actions,
  } = options;
  const channelId = channel.id;
  if (handleDMContextMenuPatch({ ctx, tree, channel, channelId, guildId, actions })) return;
  if (!guildId) return;
  appendGuildSubmenu(tree, buildGuildContextItems(ctx, guildId, channel, actions));
}
