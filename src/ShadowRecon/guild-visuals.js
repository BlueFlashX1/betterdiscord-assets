const dc = require('../shared/discord-classes');

function getGuildsTarget(plugin) {
  if (plugin._guildsTargetCache && plugin._guildsTargetCache.isConnected) {
    return plugin._guildsTargetCache;
  }
  const target =
    document.querySelector('[data-list-id="guildsnav"]') ||
    document.querySelector(`${dc.sel.guilds} ${dc.sel.scroller}`) ||
    document.querySelector(dc.sel.guilds);
  plugin._guildsTargetCache = target;
  return target;
}

function isHorizontalGuildNav(plugin, target) {
  if (!target || typeof window === "undefined" || typeof window.getComputedStyle !== "function") return false;
  const cache = plugin._guildNavOrientationCache;
  const now = Date.now();
  if (
    cache.target === target &&
    (now - cache.measuredAt) < plugin._guildNavOrientationCacheTTL
  ) {
    return cache.horizontal;
  }

  let horizontal = false;
  const candidates = [target, target.firstElementChild, target.parentElement].filter(Boolean);
  for (const node of candidates) {
    try {
      const style = window.getComputedStyle(node);
      const direction = String(style?.flexDirection || "").toLowerCase();
      if (direction.startsWith("row")) {
        horizontal = true;
        break;
      }
    } catch (_) {}
  }

  if (!horizontal) {
    try {
      const rect = target.getBoundingClientRect();
      if (rect.width > rect.height * 1.3) horizontal = true;
    } catch (_) {}
  }

  cache.target = target;
  cache.measuredAt = now;
  cache.horizontal = horizontal;
  return horizontal;
}

function syncServerCounterWidgetOrientation(plugin, widget, target = null) {
  if (!widget) return false;
  const navTarget = target || getGuildsTarget(plugin);
  const horizontal = isHorizontalGuildNav(plugin, navTarget);
  const orientationFlag = horizontal ? "1" : "0";
  if (widget.dataset.shadowReconHorizontal !== orientationFlag) {
    widget.classList.toggle("shadow-recon-widget--rotated", horizontal);
    widget.dataset.shadowReconHorizontal = orientationFlag;
  }
  return horizontal;
}

function injectServerCounterWidget(plugin, widgetId) {
  if (!plugin.settings.showServerCounterWidget) {
    removeServerCounterWidget(plugin, widgetId);
    return;
  }

  const target = getGuildsTarget(plugin);
  if (!target) return;

  let widget = document.getElementById(widgetId);
  if (!widget) {
    widget = document.createElement("div");
    widget.id = widgetId;
    widget.className = "shadow-recon-widget";
    widget.title = "Left click: Open current guild dossier | Right click: Recon/unrecon current guild";
    plugin._widgetClickHandler = () => {
      const guildId = plugin._getCurrentGuildId();
      if (guildId) plugin.openGuildDossier(guildId);
      else plugin._toast("Select a guild first", "warning");
    };
    plugin._widgetContextHandler = (event) => {
      event.preventDefault();
      plugin._toggleCurrentGuildMarkWithToast();
    };
    widget.addEventListener("click", plugin._widgetClickHandler);
    widget.addEventListener("contextmenu", plugin._widgetContextHandler);

    if (target.firstChild) target.insertBefore(widget, target.firstChild);
    else target.appendChild(widget);
  }

  updateServerCounterWidget(plugin, widgetId, target);
}

function updateServerCounterWidget(plugin, widgetId, target = null) {
  const widget = document.getElementById(widgetId);
  if (!widget) return;
  const horizontal = syncServerCounterWidgetOrientation(plugin, widget, target);
  const guildCount = plugin.getServerCount();
  const markedGuildCount = plugin._markedGuildIds.size;
  const markedTargetCount = plugin._getShadowDeploymentMap().size;
  const compact = (value) => {
    const n = Number(value) || 0;
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
    return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}m`;
  };
  const nextText = horizontal
    ? `R${compact(guildCount)}/${compact(markedGuildCount)}/${compact(markedTargetCount)}`
    : `Recon: ${guildCount} guilds | ${markedGuildCount} marked | ${markedTargetCount} marked targets`;
  if (widget.textContent !== nextText) {
    widget.textContent = nextText;
  }
}

function removeServerCounterWidget(plugin, widgetId) {
  const widget = document.getElementById(widgetId);
  if (widget) {
    if (plugin._widgetClickHandler) widget.removeEventListener("click", plugin._widgetClickHandler);
    if (plugin._widgetContextHandler) widget.removeEventListener("contextmenu", plugin._widgetContextHandler);
    widget.remove();
  }
  plugin._widgetClickHandler = null;
  plugin._widgetContextHandler = null;
}

function safeNonNegativeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

function readOnlineCountFromObject(obj) {
  if (!obj || typeof obj !== "object") return null;
  const keys = [
    "online",
    "onlineCount",
    "presence",
    "presenceCount",
    "approximatePresenceCount",
    "approximate_presence_count",
  ];
  for (const key of keys) {
    const parsed = safeNonNegativeInt(obj[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseOnlineCountResult(result) {
  const direct = safeNonNegativeInt(result);
  if (direct !== null) return direct;
  return readOnlineCountFromObject(result);
}

function resolveOnlineCountFromMethod(plugin, countStore, guildId, methodRef) {
  if (typeof methodRef !== "function") return null;
  try {
    const parsed = parseOnlineCountResult(methodRef.call(countStore, guildId));
    if (parsed === null) return null;
    plugin._onlineCountMethod = methodRef;
    return parsed;
  } catch (_) {
    return null;
  }
}

function readOnlineCountFromMethodCache(plugin, countStore, guildId) {
  if (!plugin._onlineCountMethod) return null;
  const result = resolveOnlineCountFromMethod(
    plugin,
    countStore,
    guildId,
    plugin._onlineCountMethod
  );
  if (result !== null) return result;
  plugin._onlineCountMethod = null;
  return null;
}

function readOnlineCountFromMethodList(plugin, countStore, guildId, methodNames) {
  for (const methodName of methodNames) {
    const count = resolveOnlineCountFromMethod(plugin, countStore, guildId, countStore?.[methodName]);
    if (count !== null) return count;
  }
  return null;
}

function readOnlineCountFromStore(plugin, guildId) {
  const countStore = plugin._GuildMemberCountStore;
  if (!countStore || typeof countStore !== "object") return null;

  const cachedMethodCount = readOnlineCountFromMethodCache(plugin, countStore, guildId);
  if (cachedMethodCount !== null) return cachedMethodCount;

  const storeMethods = [
    "getOnlineCount",
    "getOnlineMemberCount",
    "getPresenceCount",
    "getMemberCounts",
    "getCounts",
    "getGuildCounts",
  ];
  return readOnlineCountFromMethodList(plugin, countStore, guildId, storeMethods);
}

function getGuildOnlineCount(plugin, guildId, guild = null) {
  if (!guildId) return 0;

  const fromStore = readOnlineCountFromStore(plugin, guildId);
  if (fromStore !== null) return fromStore;

  const activeGuild = guild || plugin._GuildStore?.getGuild?.(guildId);
  const fromGuild = readOnlineCountFromObject(activeGuild);
  if (fromGuild !== null) return fromGuild;

  return 0;
}

function extractSnowflake(text, regex) {
  if (!text) return null;
  const match = String(text).match(regex);
  return match ? match[0] : null;
}

function getGuildHintNodes(plugin) {
  const scope = getGuildsTarget(plugin) || document;
  let nodes = scope.querySelectorAll('[data-list-item-id*="guild"]');
  if (!nodes.length && scope !== document) {
    // Safety fallback if nav target is temporarily detached/swapped.
    nodes = document.querySelectorAll('[data-list-item-id*="guild"]');
  }
  return nodes;
}

function getGuildHintStats(plugin, guildId, guild) {
  const memberCount =
    plugin._GuildMemberCountStore?.getMemberCount?.(guildId) ||
    guild?.memberCount ||
    guild?.member_count ||
    0;
  const online = getGuildOnlineCount(plugin, guildId, guild);
  const marked = plugin.isGuildMarked(guildId);
  return { memberCount, online, marked };
}

function shouldSkipGuildHintUpdate(plugin, node, guildId, stats) {
  const cached = plugin._guildHintCache.get(guildId);
  if (!cached) return false;
  const unchanged =
    cached.memberCount === stats.memberCount &&
    cached.online === stats.online &&
    cached.marked === stats.marked;
  if (!unchanged) return false;
  return node.getAttribute("data-shadow-recon-title") === "1";
}

function applyGuildHintTitle(plugin, node, guildId, guild, stats) {
  const markedLabel = stats.marked ? "[Marked]" : "[Unmarked]";
  const title = `${markedLabel} ${guild.name} | Online ${plugin._formatNumber(stats.online)} | Members ${plugin._formatNumber(stats.memberCount)}`;
  plugin._guildHintCache.set(guildId, stats);
  if (node.getAttribute("title") === title) return;
  node.setAttribute("title", title);
  node.setAttribute("data-shadow-recon-title", "1");
}

function refreshGuildIconHints(plugin, snowflakeRegex) {
  if (!plugin.settings.showGuildHoverIntel) {
    plugin._guildHintCache.clear();
    clearGuildIconHints();
    return;
  }
  const nodes = getGuildHintNodes(plugin);
  for (const node of nodes) {
    const raw = node.getAttribute("data-list-item-id") || "";
    const guildId = extractSnowflake(raw, snowflakeRegex);
    if (!guildId) continue;

    const guild = plugin._GuildStore?.getGuild?.(guildId);
    if (!guild) continue;

    const stats = getGuildHintStats(plugin, guildId, guild);
    if (shouldSkipGuildHintUpdate(plugin, node, guildId, stats)) continue;
    applyGuildHintTitle(plugin, node, guildId, guild, stats);
  }
}

function clearGuildIconHints() {
  const nodes = document.querySelectorAll('[data-shadow-recon-title="1"]');
  for (const node of nodes) {
    node.removeAttribute("title");
    node.removeAttribute("data-shadow-recon-title");
  }
}

module.exports = {
  clearGuildIconHints,
  extractSnowflake,
  getGuildOnlineCount,
  getGuildsTarget,
  injectServerCounterWidget,
  isHorizontalGuildNav,
  readOnlineCountFromObject,
  readOnlineCountFromStore,
  refreshGuildIconHints,
  removeServerCounterWidget,
  safeNonNegativeInt,
  syncServerCounterWidgetOrientation,
  updateServerCounterWidget,
};
