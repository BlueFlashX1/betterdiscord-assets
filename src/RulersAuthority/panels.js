// ═══════════════════════════════════════════════════════════════════════════
// Panel Control — Sidebar, Members, Profile, Search
// ═══════════════════════════════════════════════════════════════════════════
//
// Macro panel control (toggle, restore, count), hover-to-expand system,
// micro channel/category/DM operations, context menus, toolbar icon,
// visual effects, channel observer, guild change listener, settings guard.
import {
  PANEL_DEFS,
  RA_PLUGIN_NAME,
  RA_TOOLBAR_ICON_ID,
  RA_ICON_REINJECT_DELAY_MS,
  RA_OBSERVER_THROTTLE_MS,
  RA_PANEL_HOVER_REVEAL_MIN_MS,
  RA_SETTINGS_OPEN_CLASS,
  SIDEBAR_FALLBACKS,
  MEMBERS_FALLBACKS,
  PROFILE_FALLBACKS,
  SEARCH_FALLBACKS,
  TOOLBAR_FALLBACKS,
  DM_LIST_FALLBACKS,
  _PluginUtils,
} from "./constants";
import { applyChannelContextMenuPatch } from "./context-menu-helpers";
import dc from "../shared/discord-classes";
// ── Helper: find channel sidebar element ──
function findChannelSidebar() {
  for (const sel of SIDEBAR_FALLBACKS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}
// ═══════════════════════════════════════════════════════════════════════════
// §8  Macro Panel Control
// ═══════════════════════════════════════════════════════════════════════════

export function togglePanel(ctx, panelName) {
  const def = PANEL_DEFS[panelName];
  if (!def) return;

  // SkillTree gate check — skip gated panels
  if (ctx.isPanelGated?.(panelName)) return;
  const isPushed = ctx.settings.panels[panelName].pushed;
  ctx.settings.panels[panelName].pushed = !isPushed;

  if (!isPushed) {
    // Capture current width before pushing (for restore)
    const el = ctx._findPanelElement(panelName);
    if (el && !ctx.settings.panels[panelName].width) {
      ctx.settings.panels[panelName].width = el.getBoundingClientRect().width;
    }
    document.body.classList.add(`ra-${panelName}-pushed`);
    showPushEffect(ctx, panelName);
    ctx.debugLog("Panel", `Pushed ${panelName}`);
  } else {
    document.body.classList.remove(`ra-${panelName}-pushed`);
    document.body.classList.remove(`ra-${panelName}-hover-reveal`);
    showPullEffect(ctx, panelName);
    ctx.debugLog("Panel", `Pulled ${panelName}`);
  }

  ctx.saveSettings();
  ctx.updateCSSVars();
  updateToolbarIcon(ctx);
}

export function restorePanelStates(ctx) {
  const apply = () => {
    for (const [panelName, config] of Object.entries(ctx.settings.panels)) {
      if (ctx.isPanelGated?.(panelName)) continue;
      if (config.pushed) {
        document.body.classList.add(`ra-${panelName}-pushed`);
      }
    }
  };

  // Discord's DOM may not be ready yet on first load — defer until a panel
  // element exists so CSS transitions have a target to collapse.
  const probe = () => ctx._findPanelElement("members") || ctx._findPanelElement("sidebar");
  if (probe()) { apply(); return; }

  let attempts = 0;
  const poller = setInterval(() => {
    attempts++;
    if (probe() || attempts >= 40) {   // ~4s max wait
      clearInterval(poller);
      apply();
    }
  }, 100);

  // Cleanup if plugin stops before poller finishes
  const origAbort = ctx._controller?.signal;
  if (origAbort) origAbort.addEventListener("abort", () => clearInterval(poller), { once: true });
}

export function getPushedPanelCount(ctx) {
  return Object.values(ctx.settings.panels).filter((p) => p.pushed).length;
}

// ═══════════════════════════════════════════════════════════════════════════
// §9  Hover-to-Expand System
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Shared timer-based reveal/hide logic for hover-to-expand panels.
 * Manages a reveal timer and a hide timer for the given panel name,
 * toggling visibility via a body class (`ra-{name}-hover-reveal`).
 *
 * @param {RulersAuthority} ctx  plugin instance
 * @param {string} name     Timer prefix (sidebar, members, profile, channel)
 * @param {boolean} inZone  Whether cursor is inside the activation zone/panel
 * @param {number} revealDelay  ms before reveal fires
 * @param {number} hideDelay    ms before hide fires
 * @param {function} [isActive]  Custom "is currently revealed" check (defaults to body class)
 * @param {function} [setActive] Custom reveal/hide setter (defaults to body class toggle)
 */
export function applyHoverRevealState(ctx, options) {
  const {
    name,
    inZone,
    revealDelay,
    hideDelay,
    isActive,
    setActive,
  } = options;
  const revealKey = `_${name}RevealTimer`;
  const hideKey = `_${name}HideTimer`;
  const hoverEnterAtKey = `_${name}HoverEnterAt`;
  const className = `ra-${name}-hover-reveal`;
  const revealDelayMs = Number(revealDelay);
  const hideDelayMs = Number(hideDelay);
  const normalizedRevealDelay = Number.isFinite(revealDelayMs) ? Math.max(0, revealDelayMs) : 0;
  const normalizedHideDelay = Number.isFinite(hideDelayMs) ? Math.max(0, hideDelayMs) : 0;

  const checkActive = isActive || (() => document.body.classList.contains(className));
  const applyActive = setActive || ((revealed) => {
    if (revealed) {
      document.body.classList.add(className);
    } else {
      document.body.classList.remove(className);
    }
  });

  if (inZone) {
    clearTimeout(ctx[hideKey]);
    ctx[hideKey] = null;
    if (checkActive()) {
      ctx[hoverEnterAtKey] = null;
      return;
    }

    const now = Date.now();
    if (!Number.isFinite(ctx[hoverEnterAtKey]) || ctx[hoverEnterAtKey] <= 0) {
      ctx[hoverEnterAtKey] = now;
    }
    const enteredAt = Number(ctx[hoverEnterAtKey]) || now;
    const elapsed = now - enteredAt;
    const remaining = normalizedRevealDelay - elapsed;

    if (remaining <= 0) {
      clearTimeout(ctx[revealKey]);
      ctx[revealKey] = null;
      ctx[hoverEnterAtKey] = null;
      applyActive(true);
      return;
    }

    if (!ctx[revealKey]) {
      ctx[revealKey] = setTimeout(() => {
        ctx[revealKey] = null;
        const since = Date.now() - (Number(ctx[hoverEnterAtKey]) || 0);
        if (since >= normalizedRevealDelay && !checkActive()) {
          ctx[hoverEnterAtKey] = null;
          applyActive(true);
        }
      }, remaining);
    }
  } else {
    clearTimeout(ctx[revealKey]);
    ctx[revealKey] = null;
    ctx[hoverEnterAtKey] = null;
    if (!ctx[hideKey] && checkActive()) {
      if (normalizedHideDelay <= 0) {
        applyActive(false);
        return;
      }
      ctx[hideKey] = setTimeout(() => {
        ctx[hideKey] = null;
        applyActive(false);
      }, normalizedHideDelay);
    }
  }
}

function clearPanelHoverState(ctx, name) {
  const revealKey = `_${name}RevealTimer`;
  const hideKey = `_${name}HideTimer`;
  clearTimeout(ctx[revealKey]);
  clearTimeout(ctx[hideKey]);
  ctx[revealKey] = null;
  ctx[hideKey] = null;
  document.body.classList.remove(`ra-${name}-hover-reveal`);
}

function getHoverRuntime(ctx, e) {
  const currentGuildId = ctx._SelectedGuildStore?.getGuildId?.();
  const hiddenChannelsCount = currentGuildId
    ? ctx.settings.guilds?.[currentGuildId]?.hiddenChannels?.length || 0
    : 0;
  const channelHoverEnabled = hiddenChannelsCount > 0;
  const sidebarHoverEnabled = ctx.settings.panels.sidebar.hoverExpand;
  const membersHoverEnabled = ctx.settings.panels.members.hoverExpand;
  const profileHoverEnabled = ctx.settings.panels.profile.hoverExpand;
  const anyEnabled =
    sidebarHoverEnabled || membersHoverEnabled || profileHoverEnabled || channelHoverEnabled;
  if (!anyEnabled) return null;

  const fudge = Number(ctx.settings.hoverFudgePx) || 15;
  const edgeZonePx = Math.max(36, fudge);
  const revealDelay = Math.max(
    RA_PANEL_HOVER_REVEAL_MIN_MS,
    Number(ctx.settings.hoverRevealDelayMs) || 0
  );
  return {
    event: e,
    fudge,
    edgeZonePx,
    hideDelay: Math.max(0, Number(ctx.settings.hoverHideDelayMs) || 0),
    revealDelay,
    panelRevealDelay: revealDelay,
    viewportWidth: window.innerWidth,
    sidebarHoverEnabled,
    membersHoverEnabled,
    profileHoverEnabled,
    channelHoverEnabled,
  };
}

function handleSidebarHover(ctx, runtime) {
  // SkillTree gate — sidebar requires rulers_authority level 3
  if (ctx.isPanelGated?.("sidebar")) { clearPanelHoverState(ctx, "sidebar"); return; }
  if (!(runtime.sidebarHoverEnabled && ctx.settings.panels.sidebar.pushed)) {
    clearPanelHoverState(ctx, "sidebar");
    return;
  }
  const revealActive = document.body.classList.contains("ra-sidebar-hover-reveal");
  const inEdgeZone = runtime.event.clientX <= runtime.edgeZonePx;
  const sidebarWidth = ctx.settings.panels.sidebar.width || ctx.settings.defaultWidths?.sidebar || 240;
  const inPanel = revealActive && runtime.event.clientX <= (sidebarWidth + runtime.fudge);
  applyHoverRevealState(ctx, {
    name: "sidebar",
    inZone: inEdgeZone || inPanel,
    revealDelay: runtime.panelRevealDelay,
    hideDelay: runtime.hideDelay,
  });
}

function handleMembersHover(ctx, runtime) {
  if (!(runtime.membersHoverEnabled && ctx.settings.panels.members.pushed)) {
    clearPanelHoverState(ctx, "members");
    return;
  }
  const distFromRight = runtime.viewportWidth - runtime.event.clientX;
  const revealActive = document.body.classList.contains("ra-members-hover-reveal");
  const inEdgeZone = distFromRight <= runtime.edgeZonePx;
  const membersWidth = ctx.settings.panels.members.width || ctx.settings.defaultWidths?.members || 245;
  const inPanel = revealActive && distFromRight <= (membersWidth + runtime.fudge);
  applyHoverRevealState(ctx, {
    name: "members",
    inZone: inEdgeZone || inPanel,
    revealDelay: runtime.panelRevealDelay,
    hideDelay: runtime.hideDelay,
  });
}

function handleProfileHover(ctx, runtime) {
  if (!(runtime.profileHoverEnabled && ctx.settings.panels.profile.pushed)) return;
  const distFromRight = runtime.viewportWidth - runtime.event.clientX;
  const revealActive = document.body.classList.contains("ra-profile-hover-reveal");
  const profileWidth = ctx.settings.panels.profile.width || ctx.settings.defaultWidths?.profile || 340;
  const inPanel = revealActive && distFromRight <= (profileWidth + runtime.fudge);
  const inZone =
    distFromRight <= runtime.edgeZonePx && !document.body.classList.contains("ra-members-hover-reveal");
  applyHoverRevealState(ctx, {
    name: "profile",
    inZone: inZone || inPanel,
    revealDelay: runtime.revealDelay,
    hideDelay: runtime.hideDelay,
  });
}

function handleChannelHover(ctx, runtime) {
  if (!runtime.channelHoverEnabled) {
    clearPanelHoverState(ctx, "channel");
    setHiddenChannelRevealState(ctx, false);
    return;
  }
  const hoverEl = getChannelHoverElement();
  const inEdgeZone = runtime.event.clientX <= runtime.edgeZonePx;
  const inChannelPanel = ctx._channelsHoverRevealActive && hoverEl
    ? ctx._isInsideElement(runtime.event, hoverEl, runtime.fudge)
    : false;
  applyHoverRevealState(ctx, {
    name: "channel",
    inZone: inEdgeZone || inChannelPanel,
    revealDelay: runtime.revealDelay,
    hideDelay: runtime.hideDelay,
    isActive: () => ctx._channelsHoverRevealActive,
    setActive: (revealed) => setHiddenChannelRevealState(ctx, revealed),
  });
}

export function setupHoverHandlers(ctx) {
  if (!ctx._controller) return;

  // Read settings dynamically inside handler so changes take effect immediately
  const handler = ctx._throttle((e) => {
    if (!ctx._controller) return; // Guard: plugin stopped
    if (document.body.classList.contains(RA_SETTINGS_OPEN_CLASS)) {
      clearAllHoverStates(ctx);
      return;
    }
    const runtime = getHoverRuntime(ctx, e);
    if (!runtime) {
      clearPanelHoverState(ctx, "sidebar");
      clearPanelHoverState(ctx, "members");
      clearPanelHoverState(ctx, "profile");
      clearPanelHoverState(ctx, "channel");
      setHiddenChannelRevealState(ctx, false);
      return;
    }
    handleSidebarHover(ctx, runtime);
    handleMembersHover(ctx, runtime);
    handleProfileHover(ctx, runtime);
    handleChannelHover(ctx, runtime);
  }, 16); // ~60fps throttle

  document.addEventListener("mousemove", handler, {
    passive: true,
    signal: ctx._controller.signal,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// §11  Micro: Push Channel + Crush Category
// ═══════════════════════════════════════════════════════════════════════════

export function getGuildData(ctx, guildId) {
  if (!ctx.settings.guilds[guildId]) {
    ctx.settings.guilds[guildId] = { hiddenChannels: [], crushedCategories: [] };
  }
  return ctx.settings.guilds[guildId];
}

// ── Push Channel ──

export function pushChannel(ctx, guildId, channelId, channelName) {
  const guildData = getGuildData(ctx, guildId);
  if (guildData.hiddenChannels.some((c) => c.id === channelId)) return;
  guildData.hiddenChannels.push({ id: channelId, name: channelName });
  guildData._hiddenIdSet = null; // invalidate cache
  applyChannelHiding(ctx, guildId);
  ctx.saveSettings();
  ctx.debugLog("PushChannel", `Pushed #${channelName} in ${guildId}`);
}

export function recallChannel(ctx, guildId, channelId) {
  const guildData = getGuildData(ctx, guildId);
  guildData.hiddenChannels = guildData.hiddenChannels.filter((c) => c.id !== channelId);
  guildData._hiddenIdSet = null; // invalidate cache
  const el = document.querySelector(`[data-list-item-id="channels___${channelId}"]`);
  if (el) {
    el.style.display = "";
    el.removeAttribute("data-ra-pushed");
  }
  applyChannelHiding(ctx, guildId);
  ctx.saveSettings();
  ctx.debugLog("RecallChannel", `Recalled ${channelId} in ${guildId}`);
}

export function isChannelHidden(ctx, guildId, channelId) {
  const guildData = ctx.settings.guilds[guildId];
  return guildData?.hiddenChannels?.some((c) => c.id === channelId) || false;
}

// Cached channel hover element (500ms TTL — DOM doesn't change that fast)
let _channelHoverEl = null;
let _channelHoverElTime = 0;
const _CHANNEL_HOVER_TTL = 500;

export function getChannelHoverElement() {
  const now = Date.now();
  if (_channelHoverEl && now - _channelHoverElTime < _CHANNEL_HOVER_TTL && _channelHoverEl.isConnected) {
    return _channelHoverEl;
  }
  const channelTree =
    document.querySelector('ul[aria-label="Channels"]') ||
    document.querySelector('[role="tree"][aria-label="Channels"]') ||
    document.querySelector(`${dc.sel.sidebar} [role="tree"]`);
  if (!channelTree) { _channelHoverEl = null; return null; }
  _channelHoverEl = channelTree.closest(dc.sel.sidebar) || channelTree;
  _channelHoverElTime = now;
  return _channelHoverEl;
}

export function invalidateChannelHoverCache() {
  _channelHoverEl = null;
  _channelHoverElTime = 0;
}

export function setHiddenChannelRevealState(ctx, shouldReveal) {
  const next = !!shouldReveal;
  if (ctx._channelsHoverRevealActive === next) return;
  ctx._channelsHoverRevealActive = next;
  document.body.classList.toggle("ra-channels-hover-reveal", next);
  applyChannelHiding(ctx);
}

function getEffectiveGuildId(ctx, guildId) {
  const currentGuildId = ctx._SelectedGuildStore?.getGuildId?.();
  if (guildId && guildId !== currentGuildId) return null;
  return guildId || currentGuildId || null;
}

function resolveHiddenIdSet(guildData) {
  if (!guildData) return new Set();
  if (!guildData._hiddenIdSet) {
    guildData._hiddenIdSet = new Set(
      (guildData.hiddenChannels || []).map((entry) => String(entry.id))
    );
  }
  return guildData._hiddenIdSet;
}

function clearStalePushedChannelMarkers(scope, hiddenIds) {
  const pushedEls = scope.querySelectorAll("[data-ra-pushed]");
  for (const el of pushedEls) {
    const listId = el.getAttribute("data-list-item-id") || "";
    const channelId = listId.startsWith("channels___")
      ? listId.replace("channels___", "")
      : null;
    if (channelId && hiddenIds.has(channelId)) continue;
    el.style.display = "";
    el.removeAttribute("data-ra-pushed");
  }
}

function applyHiddenChannelVisibility(scope, hiddenIds, revealActive) {
  for (const id of hiddenIds) {
    const el = scope.querySelector(`[data-list-item-id="channels___${id}"]`);
    if (!el) continue;
    el.style.display = revealActive ? "" : "none";
    el.setAttribute("data-ra-pushed", "true");
  }
}

function resetHiddenChannelReveal(ctx) {
  ctx._channelsHoverRevealActive = false;
  document.body.classList.remove("ra-channels-hover-reveal");
}

export function applyChannelHiding(ctx, guildId) {
  const effectiveGuildId = getEffectiveGuildId(ctx, guildId);
  if (!effectiveGuildId) return;
  const guildData = ctx.settings.guilds[effectiveGuildId];
  const hiddenIds = resolveHiddenIdSet(guildData);

  const sidebar = findChannelSidebar();
  const scope = sidebar || document;
  clearStalePushedChannelMarkers(scope, hiddenIds);

  if (hiddenIds.size === 0) {
    resetHiddenChannelReveal(ctx);
    return;
  }

  applyHiddenChannelVisibility(scope, hiddenIds, ctx._channelsHoverRevealActive);
}

export function restoreAllHiddenChannels() {
  const pushed = document.querySelectorAll("[data-ra-pushed]");
  for (const el of pushed) {
    el.style.display = "";
    el.removeAttribute("data-ra-pushed");
  }
  document.body.classList.remove("ra-channels-hover-reveal");
}

// ── Crush Category ──

export function crushCategory(ctx, guildId, categoryId, categoryName) {
  const guildData = getGuildData(ctx, guildId);
  if (guildData.crushedCategories.some((c) => c.id === categoryId)) return;
  guildData.crushedCategories.push({ id: categoryId, name: categoryName });
  applyCategoryCrushing(ctx, guildId);
  ctx.saveSettings();
  ctx.debugLog("CrushCategory", `Crushed ${categoryName} in ${guildId}`);
}

export function releaseCategory(ctx, guildId, categoryId) {
  const guildData = getGuildData(ctx, guildId);
  guildData.crushedCategories = guildData.crushedCategories.filter((c) => c.id !== categoryId);
  const children = document.querySelectorAll(`[data-ra-category-crushed="${categoryId}"]`);
  for (const el of children) {
    el.style.display = "";
    el.removeAttribute("data-ra-category-crushed");
  }
  const catEl = document.querySelector(`[data-list-item-id="channels___${categoryId}"]`);
  if (catEl) catEl.removeAttribute("data-ra-crushed");
  ctx.saveSettings();
  ctx.debugLog("ReleaseCategory", `Released ${categoryId} in ${guildId}`);
}

export function isCategoryCrushed(ctx, guildId, categoryId) {
  const guildData = ctx.settings.guilds[guildId];
  return guildData?.crushedCategories?.some((c) => c.id === categoryId) || false;
}

function getChannelIdFromListItem(el) {
  const listId = el?.getAttribute("data-list-item-id") || "";
  if (!listId.startsWith("channels___")) return null;
  return listId.replace("channels___", "");
}

function hideCrushedCategoryChildren(ctx, categoryEl, categoryId) {
  let next = categoryEl.nextElementSibling;
  let safetyLimit = 200;
  let nonChannelSkips = 0;

  while (next && safetyLimit-- > 0) {
    const channelId = getChannelIdFromListItem(next);
    if (!channelId) {
      nonChannelSkips++;
      if (nonChannelSkips > 5) break;
      next = next.nextElementSibling;
      continue;
    }

    nonChannelSkips = 0;
    const channel = ctx._ChannelStore?.getChannel?.(channelId);
    if (!channel || channel.type === 4) break;
    next.style.display = "none";
    next.setAttribute("data-ra-category-crushed", categoryId);
    next = next.nextElementSibling;
  }
}

function applyCategoryCrushForId(ctx, scope, categoryId) {
  const categoryEl = scope.querySelector(`[data-list-item-id="channels___${categoryId}"]`);
  if (!categoryEl) return;

  const alreadyCrushed =
    categoryEl.hasAttribute("data-ra-crushed") &&
    categoryEl.nextElementSibling?.getAttribute("data-ra-category-crushed") === categoryId;
  if (alreadyCrushed) return;

  categoryEl.setAttribute("data-ra-crushed", "true");
  hideCrushedCategoryChildren(ctx, categoryEl, categoryId);
}

export function applyCategoryCrushing(ctx, guildId) {
  const effectiveGuildId = getEffectiveGuildId(ctx, guildId);
  if (!effectiveGuildId) return;
  const guildData = ctx.settings.guilds[effectiveGuildId];
  const crushedCategories = guildData?.crushedCategories || [];
  if (crushedCategories.length === 0) return;

  const sidebar = findChannelSidebar();
  const scope = sidebar || document;

  for (const { id: categoryId } of crushedCategories) {
    applyCategoryCrushForId(ctx, scope, categoryId);
  }
}

export function restoreAllCrushedCategories() {
  const crushed = document.querySelectorAll("[data-ra-category-crushed]");
  for (const el of crushed) {
    el.style.display = "";
    el.removeAttribute("data-ra-category-crushed");
  }
  const cats = document.querySelectorAll("[data-ra-crushed]");
  for (const el of cats) {
    el.removeAttribute("data-ra-crushed");
  }
}

export function applyMicroStateForCurrentGuild(ctx) {
  const guildId = ctx._SelectedGuildStore?.getGuildId?.();
  if (guildId) {
    applyChannelHiding(ctx, guildId);
    applyCategoryCrushing(ctx, guildId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// §12  Micro: Grip DM
// ═══════════════════════════════════════════════════════════════════════════

export function gripDM(ctx, channelId, username) {
  if (ctx.settings.grippedDMs.some((d) => d.channelId === channelId)) return;
  ctx.settings.grippedDMs.push({ channelId, username });
  applyDMGripping(ctx);
  ctx.saveSettings();
  ctx._toast(`Gripped DM: ${username}`, "success");
  ctx.debugLog("GripDM", `Gripped ${username} (${channelId})`);
}

export function releaseDM(ctx, channelId) {
  ctx.settings.grippedDMs = ctx.settings.grippedDMs.filter((d) => d.channelId !== channelId);
  const el = document.querySelector(`[data-list-item-id*="${channelId}"] .ra-grip-indicator`);
  if (el) el.remove();
  ctx.saveSettings();
  ctx._toast("Released DM grip", "info");
  ctx.debugLog("ReleaseDM", `Released ${channelId}`);
}

export function isDMGripped(ctx, channelId) {
  return ctx.settings.grippedDMs.some((d) => d.channelId === channelId);
}

export function setupDMObserver(ctx) {
  if (ctx._dmObserver) { ctx._dmObserver.disconnect(); ctx._dmObserver = null; }
  if (ctx.settings.grippedDMs.length === 0) return;

  const dmList = ctx._findElement(DM_LIST_FALLBACKS);
  if (!dmList) return;

  const throttledGrip = ctx._throttle(() => {
    if (!ctx._dmObserver) return;
    applyDMGripping(ctx);
  }, RA_OBSERVER_THROTTLE_MS);

  ctx._dmObserver = new MutationObserver(throttledGrip);
  ctx._dmObserver.observe(dmList, { childList: true, subtree: true });
}

export function applyDMGripping(ctx) {
  const dmList = ctx._findElement(DM_LIST_FALLBACKS);
  if (!dmList) return;

  const header = dmList.querySelector(dc.sel.searchBar) ||
                 dmList.querySelector(dc.sel.privateChannelsHeaderContainer) ||
                 dmList.querySelector("h2");
  const insertAfterEl = header?.closest(dc.sel.listItem) || header?.parentElement || null;

  for (const { channelId } of [...ctx.settings.grippedDMs].reverse()) {
    const dmEl = dmList.querySelector(`[data-list-item-id*="${channelId}"]`) ||
                 dmList.querySelector(`a[href="/channels/@me/${channelId}"]`)?.closest("[data-list-item-id]");
    if (!dmEl) continue;

    if (!dmEl.querySelector(".ra-grip-indicator")) {
      const indicator = document.createElement("div");
      indicator.className = "ra-grip-indicator";
      indicator.title = "Telekinetic Grip";
      dmEl.style.position = "relative";
      dmEl.appendChild(indicator);
    }

    if (insertAfterEl && insertAfterEl.nextSibling !== dmEl) {
      dmList.insertBefore(dmEl, insertAfterEl.nextSibling);
    } else if (!insertAfterEl && dmList.firstChild !== dmEl) {
      dmList.insertBefore(dmEl, dmList.firstChild);
    }
  }
}

export function patchContextMenus(ctx) {
  try {
    if (ctx._unpatchChannelCtx) {
      try { ctx._unpatchChannelCtx(); } catch (_) {}
      ctx._unpatchChannelCtx = null;
    }
    ctx._unpatchChannelCtx = BdApi.ContextMenu.patch("channel-context", (tree, props) => {
      if (!props?.channel) return;
      const channel = props.channel;
      const guildId = channel.guild_id || null;
      applyChannelContextMenuPatch({
        ctx,
        tree,
        channel,
        guildId,
        actions: {
          gripDM,
          isCategoryCrushed,
          isChannelHidden,
          isDMGripped,
          crushCategory,
          pushChannel,
          recallChannel,
          releaseCategory,
          releaseDM,
        },
      });
    });
    ctx.debugLog("ContextMenu", "Patched channel-context");
  } catch (err) {
    ctx.debugError("ContextMenu", "Failed to patch:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// §14  Toolbar Icon + Observer
// ═══════════════════════════════════════════════════════════════════════════

export function getChannelHeaderToolbar(ctx) {
  const selectors = ctx._resolvedSelectors.toolbar || TOOLBAR_FALLBACKS;
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!node || node.offsetParent === null) continue;
      const host = node.closest('[aria-label="Channel header"], [class*="titleWrapper_"], header');
      if (host && host.offsetParent === null) continue;
      return node;
    }
  }
  return null;
}

export function attachToolbarIcon(ctx, icon) {
  const toolbar = getChannelHeaderToolbar(ctx);
  if (!toolbar) return false;
  if (icon.parentElement !== toolbar) {
    toolbar.appendChild(icon);
  }
  icon.classList.remove("ra-toolbar-icon--hidden");
  return true;
}

export function injectToolbarIcon(ctx) {
  let icon = document.getElementById(RA_TOOLBAR_ICON_ID);

  if (!icon) {
    icon = document.createElement("div");
    icon.id = RA_TOOLBAR_ICON_ID;
    icon.className = "ra-toolbar-icon";
    icon.setAttribute("role", "button");
    icon.setAttribute("aria-label", "Ruler's Authority \u2014 Toggle Sidebar");
    icon.setAttribute("tabindex", "0");

    // Hand SVG
    icon.innerHTML = [
      '<svg viewBox="0 0 32 32" width="18" height="18" xmlns="http://www.w3.org/2000/svg">',
      '<path fill="#b5b5be" d="M31 8.5c0 0-2.53 5.333-3.215 8.062-0.896 3.57 0.13 6.268-1.172 9.73-2.25 4.060-2.402 4.717-10.613 4.708-3.009-0.003-11.626-2.297-11.626-2.297-1.188-0.305-3.373-0.125-3.373-1.453s1.554-2.296 2.936-2.3l5.439 0.478c1.322-0.083 2.705-0.856 2.747-2.585-0.022-2.558-0.275-4.522-1.573-6.6l-5.042-7.867c-0.301-0.626-0.373-1.694 0.499-2.171s1.862 0.232 2.2 0.849l5.631 7.66c0.602 0.559 1.671 0.667 1.58-0.524l-2.487-11.401c-0.155-0.81 0.256-1.791 1.194-1.791 1.231 0 1.987 0.47 1.963 1.213l2.734 11.249c0.214 0.547 0.972 0.475 1.176-0.031l0.779-10.939c0.040-0.349 0.495-0.957 1.369-0.831s1.377 1.063 1.285 1.424l-0.253 10.809c0.177 0.958 0.93 1.098 1.517 0.563l3.827-6.843c0.232-0.574 1.143-0.693 1.67-0.466 0.491 0.32 0.81 0.748 0.81 1.351v0z"/>',
      "</svg>",
    ].join("");

    // Left click = toggle sidebar (signal for clean teardown)
    const iconSignal = ctx._controller ? { signal: ctx._controller.signal } : {};
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      togglePanel(ctx, "sidebar");
    }, iconSignal);

    // Right click = cycle through panels
    icon.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      e.preventDefault();
      togglePanel(ctx, "members");
    }, iconSignal);

    // Custom themed tooltip (appended to body to avoid overflow clipping)
    icon.addEventListener("mouseenter", () => {
      let tip = document.getElementById("sl-toolbar-tip-ra");
      if (!tip) {
        tip = document.createElement("div");
        tip.id = "sl-toolbar-tip-ra";
        tip.className = "sl-toolbar-tip";
        tip.textContent = "Ruler's Authority";
        document.body.appendChild(tip);
      }
      const rect = icon.getBoundingClientRect();
      tip.style.top = `${rect.top - tip.offsetHeight - 8}px`;
      tip.style.left = `${rect.left + rect.width / 2}px`;
      tip.classList.add("sl-toolbar-tip--visible");
    }, iconSignal);
    icon.addEventListener("mouseleave", () => {
      const tip = document.getElementById("sl-toolbar-tip-ra");
      if (tip) tip.classList.remove("sl-toolbar-tip--visible");
    }, iconSignal);
  }

  updateToolbarIcon(ctx);

  const anchored = attachToolbarIcon(ctx, icon);
  if (!anchored) {
    if (!icon.parentElement) document.body.appendChild(icon);
    icon.classList.add("ra-toolbar-icon--hidden");
  }
}

export function updateToolbarIcon(ctx) {
  const icon = document.getElementById(RA_TOOLBAR_ICON_ID);
  if (!icon) return;
  const pushedCount = getPushedPanelCount(ctx);
  const anyPushed = pushedCount > 0;
  icon.classList.toggle("ra-toolbar-icon--active", anyPushed);
  icon.classList.toggle("ra-toolbar-icon--amplified", ctx._amplifiedMode);

  icon.title = `Ruler's Authority${anyPushed ? ` (${pushedCount} pushed)` : ""}${ctx._amplifiedMode ? " [AMPLIFIED]" : ""}`;
}

export function scheduleIconReinject(ctx, delayMs = RA_ICON_REINJECT_DELAY_MS) {
  if (ctx._iconReinjectTimeout) clearTimeout(ctx._iconReinjectTimeout);
  ctx._iconReinjectTimeout = setTimeout(() => {
    ctx._iconReinjectTimeout = null;
    injectToolbarIcon(ctx);
  }, delayMs);
}

export function setupToolbarObserver(ctx) {
  if (ctx._layoutBusUnsub) return;

  // PERF(P5-4): Use shared LayoutObserverBus instead of independent MutationObserver
  if (_PluginUtils?.LayoutObserverBus) {
    ctx._layoutBusUnsub = _PluginUtils.LayoutObserverBus.subscribe('RulersAuthority', () => {
      const icon = document.getElementById(RA_TOOLBAR_ICON_ID);
      const toolbar = getChannelHeaderToolbar(ctx);
      if (!icon || !toolbar || icon.parentElement !== toolbar) {
        scheduleIconReinject(ctx);
      }
    }, 250);
  }

  if (ctx._controller) {
    window.addEventListener("resize", () => scheduleIconReinject(ctx, 80), {
      passive: true,
      signal: ctx._controller.signal,
    });
  }

  scheduleIconReinject(ctx, 60);
}

export function teardownToolbarObserver(ctx) {
  // PERF(P5-4): Unsubscribe from shared LayoutObserverBus
  if (ctx._layoutBusUnsub) {
    ctx._layoutBusUnsub();
    ctx._layoutBusUnsub = null;
  }
  if (ctx._iconReinjectTimeout) {
    clearTimeout(ctx._iconReinjectTimeout);
    ctx._iconReinjectTimeout = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// §15  Visual Effects + Animations
// ═══════════════════════════════════════════════════════════════════════════

export function showPushEffect(ctx, panelName) {
  if (!ctx.settings.animationsEnabled) return;
  document.body.classList.add("ra-pushing");
  clearTimeout(ctx._pushAnimTimer);
  ctx._pushAnimTimer = setTimeout(() => {
    document.body.classList.remove("ra-pushing");
  }, 500);
}

export function showPullEffect(ctx, panelName) {
  if (!ctx.settings.animationsEnabled) return;
  document.body.classList.add("ra-pulling");
  clearTimeout(ctx._pullAnimTimer);
  ctx._pullAnimTimer = setTimeout(() => {
    document.body.classList.remove("ra-pulling");
  }, 350);
}

// ═══════════════════════════════════════════════════════════════════════════
// Inter-Plugin Integration (SoloLevelingStats, SkillTree)
// ═══════════════════════════════════════════════════════════════════════════

export function getSoloLevelingData(ctx) {
  const cached = ctx._statsCache.get();
  if (cached && BdApi.Plugins.isEnabled("SoloLevelingStats")) {
    return cached;
  }
  if (!BdApi.Plugins.isEnabled("SoloLevelingStats")) return null;

  const soloPlugin = BdApi.Plugins.get("SoloLevelingStats");
  const instance = soloPlugin?.instance || soloPlugin;
  if (!instance?.settings) return null;

  const data = {
    level: instance.settings.level || 1,
    intelligence: instance.settings.stats?.intelligence || 0,
    stats: { ...instance.settings.stats },
  };

  ctx._statsCache.set(data);
  return data;
}


export function setupGuildChangeListener(ctx) {
  if (!ctx._SelectedGuildStore) return;
  ctx._guildChangeHandler = () => {
    ctx._panelElCache = null; // Invalidate panel element cache on guild switch
    invalidateChannelHoverCache();
    clearTimeout(ctx._guildChangeApplyTimer);
    ctx._guildChangeApplyTimer = setTimeout(() => {
      if (!ctx._controller) return;
      applyMicroStateForCurrentGuild(ctx);
      setupChannelObserver(ctx);
    }, 300);
  };
  ctx._SelectedGuildStore.addChangeListener(ctx._guildChangeHandler);

  // Also listen for channel changes within the same guild — Discord can
  // remount the sidebar when navigating to/from forums, stages, threads, etc.
  // This re-applies micro state and reconnects the observer if orphaned.
  if (ctx._SelectedChannelStore) {
    ctx._channelChangeHandler = ctx._throttle(() => {
      if (!ctx._controller) return;
      ctx._panelElCache = null;
      applyMicroStateForCurrentGuild(ctx);
      // Reconnect observer only if it's missing or its target detached
      if (!ctx._channelObserver) {
        setupChannelObserver(ctx);
      }
    }, 500); // Throttle to 500ms — channel switches can fire rapidly
    ctx._SelectedChannelStore.addChangeListener(ctx._channelChangeHandler);
  }
}

export function setupChannelObserver(ctx, retries = 0) {
  if (ctx._channelObserver) {
    ctx._channelObserver.disconnect();
    ctx._channelObserver = null;
  }
  clearTimeout(ctx._channelObserverRetryTimer);

  // Try Webpack-discovered selector first, then fallback
  const m = ctx._modules;
  const channelList =
    (m?.sidebar?.sidebarList && document.querySelector(`.${m.sidebar.sidebarList} [role="tree"]`)) ||
    document.querySelector(`${dc.sel.sidebar} [role="tree"]`) ||
    document.querySelector(`${dc.sel.sidebar} ${dc.sel.scroller}`);

  if (!channelList) {
    // Retry with increasing delay — DOM may not be ready after guild/channel switch
    if (retries < 4 && ctx._controller) {
      const delay = 300 * (retries + 1);
      ctx._channelObserverRetryTimer = setTimeout(() => {
        if (ctx._controller) setupChannelObserver(ctx, retries + 1);
      }, delay);
    }
    return;
  }

  const throttledApply = ctx._throttle(() => {
    if (!ctx._channelObserver) return;
    // Self-heal: if Discord replaced the tree element, reconnect observer
    if (!channelList.isConnected) {
      setupChannelObserver(ctx);
      return;
    }
    applyMicroStateForCurrentGuild(ctx);
  }, RA_OBSERVER_THROTTLE_MS);

  ctx._channelObserver = new MutationObserver(throttledApply);
  ctx._channelObserver.observe(channelList, { childList: true, subtree: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Settings Guard (detects settings modal open/close)
// ═══════════════════════════════════════════════════════════════════════════

// PERF(P5-5): Replaced document.body subtree MutationObserver with 1.5s polling.
export function setupSettingsGuard(ctx) {
  // Clean up previous observer (if any from older version) or interval
  if (ctx._settingsObserver) {
    ctx._settingsObserver.disconnect();
    ctx._settingsObserver = null;
  }
  if (ctx._settingsGuardInterval) {
    clearInterval(ctx._settingsGuardInterval);
    ctx._settingsGuardInterval = null;
  }

  syncSettingsGuardState(ctx);
  ctx._settingsGuardInterval = setInterval(() => {
    if (!ctx._controller) return;
    if (document.hidden) return;
    syncSettingsGuardState(ctx);
  }, 1500);
}

export function isSettingsModalOpen() {
  return !!document.querySelector(dc.sel.standardSidebarView);
}

export function syncSettingsGuardState(ctx, forceOpen) {
  const body = document.body;
  if (!body) return false;

  const isOpen = typeof forceOpen === "boolean" ? forceOpen : isSettingsModalOpen();
  body.classList.toggle(RA_SETTINGS_OPEN_CLASS, isOpen);
  if (isOpen) clearAllHoverStates(ctx);
  return isOpen;
}

export function clearSidebarHoverState(ctx) {
  clearTimeout(ctx._sidebarRevealTimer);
  clearTimeout(ctx._sidebarHideTimer);
  clearTimeout(ctx._channelRevealTimer);
  clearTimeout(ctx._channelHideTimer);
  ctx._sidebarRevealTimer = null;
  ctx._sidebarHideTimer = null;
  ctx._channelRevealTimer = null;
  ctx._channelHideTimer = null;
  document.body.classList.remove("ra-sidebar-hover-reveal");
  if (ctx._channelsHoverRevealActive) setHiddenChannelRevealState(ctx, false);
}

export function clearAllHoverStates(ctx) {
  // Clear ALL hover timers and reveal states (used when settings open or plugin stopping)
  clearSidebarHoverState(ctx);
  clearTimeout(ctx._membersRevealTimer);
  clearTimeout(ctx._membersHideTimer);
  clearTimeout(ctx._profileRevealTimer);
  clearTimeout(ctx._profileHideTimer);
  ctx._membersRevealTimer = null;
  ctx._membersHideTimer = null;
  ctx._profileRevealTimer = null;
  ctx._profileHideTimer = null;
  document.body.classList.remove("ra-members-hover-reveal", "ra-profile-hover-reveal");
}
