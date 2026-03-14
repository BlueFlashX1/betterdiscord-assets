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
    widget.addEventListener("mouseenter", () => showGuildTooltip(plugin, widget));
    widget.addEventListener("mouseleave", hideGuildTooltip);
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
  syncServerCounterWidgetOrientation(plugin, widget, target);
  const guildCount = plugin.getServerCount();
  const markedGuildCount = plugin._markedGuildIds.size;
  const markedTargetCount = plugin._getShadowDeploymentMap().size;

  // Widget label: always short
  const label = "☍ Recon";
  if (widget.textContent !== label) {
    widget.textContent = label;
  }

  // Stats go into the tooltip
  const hint = `Guilds: ${guildCount} | Marked: ${markedGuildCount} | Targets: ${markedTargetCount} | Left click: Open guild dossier | Right click: Recon/unrecon guild`;
  widget.setAttribute("data-shadow-recon-hint", hint);
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

function getOrCreateTooltip() {
  let tooltip = document.getElementById("shadow-recon-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "shadow-recon-tooltip";
    tooltip.className = "shadow-recon-tooltip";
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function positionTooltip(tooltip, anchor) {
  const rect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const pad = 8;

  // Default: position to the right of the guild icon
  let left = rect.right + pad;
  let top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);

  // If it overflows the right edge, flip to left side
  if (left + tooltipRect.width > window.innerWidth - pad) {
    left = rect.left - tooltipRect.width - pad;
  }
  // Clamp vertical
  if (top < pad) top = pad;
  if (top + tooltipRect.height > window.innerHeight - pad) {
    top = window.innerHeight - tooltipRect.height - pad;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showGuildTooltip(plugin, node) {
  const content = node.getAttribute("data-shadow-recon-hint");
  if (!content) return;
  const tooltip = getOrCreateTooltip();
  tooltip.textContent = "";

  const lines = content.split(" | ");
  for (const line of lines) {
    const row = document.createElement("div");
    row.className = "shadow-recon-tooltip-row";
    // Highlight [Marked] / [Unmarked] tag
    if (line.startsWith("[Marked]") || line.startsWith("[Unmarked]")) {
      const tag = document.createElement("span");
      tag.className = line.startsWith("[Marked]")
        ? "shadow-recon-tooltip-tag shadow-recon-tooltip-tag--marked"
        : "shadow-recon-tooltip-tag shadow-recon-tooltip-tag--unmarked";
      const bracketEnd = line.indexOf("]") + 1;
      tag.textContent = line.slice(0, bracketEnd);
      row.appendChild(tag);
      const rest = line.slice(bracketEnd).trim();
      if (rest) {
        const nameSpan = document.createElement("span");
        nameSpan.className = "shadow-recon-tooltip-name";
        nameSpan.textContent = ` ${rest}`;
        row.appendChild(nameSpan);
      }
    } else {
      row.textContent = line;
    }
    tooltip.appendChild(row);
  }

  tooltip.classList.add("shadow-recon-tooltip--visible");
  // Position after content is set so dimensions are correct
  requestAnimationFrame(() => positionTooltip(tooltip, node));
}

function hideGuildTooltip() {
  const tooltip = document.getElementById("shadow-recon-tooltip");
  if (tooltip) tooltip.classList.remove("shadow-recon-tooltip--visible");
}

function ensureTooltipHandlers(plugin, node) {
  if (node._shadowReconHoverBound) return;
  node._shadowReconHoverBound = true;
  node.addEventListener("mouseenter", () => showGuildTooltip(plugin, node));
  node.addEventListener("mouseleave", hideGuildTooltip);
}

function applyGuildHintTitle(plugin, node, guildId, guild, stats) {
  const markedLabel = stats.marked ? "[Marked]" : "[Unmarked]";
  const title = `${markedLabel} ${guild.name} | Online ${plugin._formatNumber(stats.online)} | Members ${plugin._formatNumber(stats.memberCount)}`;
  plugin._guildHintCache.set(guildId, stats);
  if (node.getAttribute("data-shadow-recon-hint") === title) return;
  node.removeAttribute("title"); // Remove native tooltip
  node.setAttribute("data-shadow-recon-hint", title);
  node.setAttribute("data-shadow-recon-title", "1");
  ensureTooltipHandlers(plugin, node);
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
    node.removeAttribute("data-shadow-recon-hint");
    node.removeAttribute("data-shadow-recon-title");
  }
  removeGuildTooltip();
}

function removeGuildTooltip() {
  const tooltip = document.getElementById("shadow-recon-tooltip");
  if (tooltip) tooltip.remove();
}

module.exports = {
  clearGuildIconHints,
  getGuildOnlineCount,
  injectServerCounterWidget,
  refreshGuildIconHints,
  removeGuildTooltip,
  removeServerCounterWidget,
  updateServerCounterWidget,
};
