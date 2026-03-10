/**
 * @name RulersAuthority
 * @description Telekinetic control over Discord's UI — push, pull, grip, and crush panels and channels. Solo Leveling themed.
 * @version 2.1.2
 * @author BlueFlashX1
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/shared/bd-module-loader.js
var require_bd_module_loader = __commonJS({
  "src/shared/bd-module-loader.js"(exports2, module2) {
    function loadBdModuleFromPlugins2(fileName) {
      if (!fileName) return null;
      try {
        const fs = require("fs");
        const path = require("path");
        const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), "utf8");
        const moduleObj = { exports: {} };
        const factory = new Function(
          "module",
          "exports",
          "require",
          "BdApi",
          `${source}
return module.exports || exports || null;`
        );
        const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
        const candidate = loaded || moduleObj.exports;
        if (typeof candidate === "function") return candidate;
        if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) {
          return candidate;
        }
      } catch (_) {
      }
      return null;
    }
    module2.exports = {
      loadBdModuleFromPlugins: loadBdModuleFromPlugins2
    };
  }
});

// src/shared/hotkeys.js
var require_hotkeys = __commonJS({
  "src/shared/hotkeys.js"(exports2, module2) {
    function isEditableTarget2(target) {
      var _a2, _b;
      if (!target) return false;
      const tag = ((_b = (_a2 = target.tagName) == null ? void 0 : _a2.toLowerCase) == null ? void 0 : _b.call(_a2)) || "";
      return tag === "input" || tag === "textarea" || tag === "select" || !!target.isContentEditable;
    }
    function parseHotkey2(hotkey) {
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
      const spec = parseHotkey2(hotkey);
      if (!spec.key) return false;
      return event.key.toLowerCase() === spec.key && event.ctrlKey === spec.ctrl && event.shiftKey === spec.shift && event.altKey === spec.alt && event.metaKey === spec.meta;
    }
    module2.exports = { isEditableTarget: isEditableTarget2, parseHotkey: parseHotkey2, matchesHotkey: matchesHotkey2 };
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

// src/RulersAuthority/constants.js
var import_bd_module_loader = __toESM(require_bd_module_loader());
var RA_PLUGIN_NAME = "RulersAuthority";
var RA_VERSION = "2.1.2";
var RA_STYLE_ID = "rulers-authority-css";
var RA_VARS_STYLE_ID = "rulers-authority-vars";
var RA_TOOLBAR_ICON_ID = "ra-toolbar-icon";
var RA_ICON_REINJECT_DELAY_MS = 140;
var RA_STATS_CACHE_TTL = 5e3;
var RA_OBSERVER_THROTTLE_MS = 200;
var RA_RESIZE_MIN_WIDTH = 80;
var RA_PANEL_HOVER_REVEAL_MIN_MS = 500;
var RA_SETTINGS_OPEN_CLASS = "ra-settings-open";
var SIDEBAR_FALLBACKS = [
  'nav[aria-label="Channels sidebar"]',
  'nav[aria-label="Channels"]',
  '[class*="sidebar_"][class*="container_"]',
  '[class*="sidebar_"]'
];
var SIDEBAR_CSS_SAFE = SIDEBAR_FALLBACKS.slice(0, -1);
var MEMBERS_FALLBACKS = [
  '[class^="membersWrap_"]',
  '[class*=" membersWrap_"]',
  '[class*="membersWrap"]'
];
var PROFILE_FALLBACKS = [
  '[class*="userProfileOuter_"]',
  '[class*="userPanelOuter_"]',
  '[class*="profilePanel_"]'
];
var SEARCH_FALLBACKS = [
  '[class*="searchResultsWrap_"]'
];
var TOOLBAR_FALLBACKS = [
  '[aria-label="Channel header"] [class*="toolbar_"]',
  '[class*="titleWrapper_"] [class*="toolbar_"]',
  'header [class*="toolbar_"]'
];
var DM_LIST_FALLBACKS = [
  '[class*="privateChannels_"] [class*="scroller_"]',
  '[class*="privateChannels_"] [role="list"]'
];
var PANEL_DEFS = {
  sidebar: { label: "Channel Sidebar", hoverCapable: true, moduleName: "sidebar", moduleKey: "sidebarList" },
  members: { label: "Members List", hoverCapable: true, moduleName: "members", moduleKey: "membersWrap" },
  profile: { label: "User Profile", hoverCapable: true, moduleName: "panel", moduleKey: "outer" },
  search: { label: "Search Results", hoverCapable: false, moduleName: "search", moduleKey: "searchResultsWrap" }
};
var DEFAULT_SETTINGS = {
  enabled: true,
  debugMode: false,
  transitionSpeed: 250,
  animationsEnabled: true,
  // Panel states + widths
  panels: {
    sidebar: { pushed: false, hotkey: "Ctrl+Shift+R", hoverExpand: true, width: 0 },
    members: { pushed: false, hotkey: "", hoverExpand: true, width: 0 },
    profile: { pushed: false, hotkey: "", hoverExpand: true, width: 0 },
    search: { pushed: false, hotkey: "", width: 0 }
  },
  // Default panel widths (used for reset)
  defaultWidths: {
    sidebar: 240,
    members: 245,
    profile: 340,
    search: 400
  },
  // Hover config
  hoverFudgePx: 15,
  hoverRevealDelayMs: 500,
  hoverHideDelayMs: 300,
  // Per-guild micro state
  guilds: {},
  // { [guildId]: { hiddenChannels: [{ id, name }], crushedCategories: [{ id, name }] } }
  // DM gripping
  grippedDMs: []
  // [{ channelId, username }]
};
var { loadBdModuleFromPlugins } = import_bd_module_loader.default;
var _bdLoad = loadBdModuleFromPlugins;
var _PluginUtils;
try {
  _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js");
} catch (_) {
  _PluginUtils = null;
}

// src/RulersAuthority/hotkeys.js
var { isEditableTarget: _sharedIsEditableTarget, parseHotkey, matchesHotkey: _sharedMatchesHotkey } = require_hotkeys();
var _pluginUtilsRef = null;
function setPluginUtils(utils) {
  _pluginUtilsRef = utils;
}
function isEditableTarget(t) {
  if (_pluginUtilsRef == null ? void 0 : _pluginUtilsRef.isEditableTarget) return _pluginUtilsRef.isEditableTarget(t);
  return _sharedIsEditableTarget(t);
}
function matchesHotkey(e, hotkey) {
  if (_pluginUtilsRef == null ? void 0 : _pluginUtilsRef.matchesHotkey) return _pluginUtilsRef.matchesHotkey(e, hotkey);
  return _sharedMatchesHotkey(e, hotkey);
}

// src/RulersAuthority/resize.js
function isResizeEdgeHit(panelName, rect, clientX) {
  const isLeftEdge = panelName !== "sidebar" && clientX <= rect.left + 12;
  const isRightEdge = panelName === "sidebar" && clientX >= rect.right - 12;
  return isLeftEdge || isRightEdge;
}
function shouldSkipPanelResizeStart(panelName) {
  return panelName === "sidebar" && document.body.classList.contains(RA_SETTINGS_OPEN_CLASS);
}
function tryStartPanelDrag(ctx, event, target, panelName) {
  if (shouldSkipPanelResizeStart(panelName)) return false;
  const panelEl = ctx._findPanelElement(panelName);
  if (!panelEl) return false;
  const clickedPanel = target === panelEl || target.parentElement === panelEl;
  if (!clickedPanel) return false;
  const rect = panelEl.getBoundingClientRect();
  if (!isResizeEdgeHit(panelName, rect, event.clientX)) return false;
  event.preventDefault();
  ctx._dragging = panelEl;
  ctx._dragPanel = panelName;
  panelEl.style.setProperty("transition", "none", "important");
  ctx.debugLog("Resize", `Started dragging ${panelName}`);
  return true;
}
function handleResizeMouseDown(ctx, event) {
  if (event.button !== 0) return;
  const target = event.target;
  for (const panelName of Object.keys(PANEL_DEFS)) {
    if (tryStartPanelDrag(ctx, event, target, panelName)) return;
  }
}
function setupResizeHandlers(ctx) {
  if (!ctx._controller) return;
  const signal = ctx._controller.signal;
  document.addEventListener("mousedown", (e) => {
    handleResizeMouseDown(ctx, e);
  }, { passive: false, signal });
  let _resizeRafId = null;
  document.addEventListener("mousemove", (e) => {
    if (!ctx._dragging || !ctx._dragPanel) return;
    if (_resizeRafId) return;
    _resizeRafId = requestAnimationFrame(() => {
      _resizeRafId = null;
      if (!ctx._dragging || !ctx._dragPanel) return;
      const rect = ctx._dragging.getBoundingClientRect();
      let width;
      if (ctx._dragPanel === "sidebar") {
        width = e.clientX - rect.left;
      } else {
        width = rect.right - e.clientX;
      }
      width = Math.max(RA_RESIZE_MIN_WIDTH, Math.min(width, window.innerWidth * 0.6));
      ctx._dragging.style.setProperty("width", `${width}px`, "important");
      ctx._dragging.style.setProperty("max-width", `${width}px`, "important");
      ctx._dragging.style.setProperty("min-width", `${width}px`, "important");
    });
  }, { passive: true, signal });
  document.addEventListener("mouseup", (e) => {
    if (!ctx._dragging || !ctx._dragPanel) return;
    if (e.button !== 0) return;
    const panelName = ctx._dragPanel;
    const dragged = ctx._dragging;
    ctx.settings.panels[panelName].width = parseInt(dragged.style.width, 10) || ctx.settings.defaultWidths[panelName];
    dragged.style.removeProperty("width");
    dragged.style.removeProperty("max-width");
    dragged.style.removeProperty("min-width");
    ctx.saveSettings();
    ctx.updateCSSVars();
    setTimeout(() => {
      dragged.style.removeProperty("transition");
    }, ctx.settings.transitionSpeed);
    ctx._dragging = null;
    ctx._dragPanel = null;
    ctx.debugLog("Resize", `Committed ${panelName} width: ${ctx.settings.panels[panelName].width}px`);
  }, { passive: true, signal });
}
function removeAllResizeStyles(ctx) {
  for (const panelName of Object.keys(PANEL_DEFS)) {
    const el = ctx._findPanelElement(panelName);
    if (el) {
      el.style.removeProperty("width");
      el.style.removeProperty("max-width");
      el.style.removeProperty("min-width");
      el.style.removeProperty("transition");
    }
  }
}

// src/RulersAuthority/context-menu-helpers.js
function appendContextMenuItems(tree, ...items) {
  var _a2;
  const children = (_a2 = tree == null ? void 0 : tree.props) == null ? void 0 : _a2.children;
  if (!Array.isArray(children)) return;
  children.push(...items);
}
function buildDMGripContextItem(ctx, channel, channelId, isGripped, actions) {
  return BdApi.ContextMenu.buildItem({
    type: "text",
    label: isGripped ? "Release Grip" : "Grip DM",
    id: isGripped ? "ra-release-dm" : "ra-grip-dm",
    action: () => {
      var _a2, _b;
      if (isGripped) {
        actions.releaseDM(ctx, channelId);
        return;
      }
      actions.gripDM(
        ctx,
        channelId,
        ((_b = (_a2 = channel.rawRecipients) == null ? void 0 : _a2[0]) == null ? void 0 : _b.username) || channel.name || "Unknown"
      );
    }
  });
}
function handleDMContextMenuPatch(options) {
  const {
    ctx,
    tree,
    channel,
    channelId,
    guildId,
    actions
  } = options;
  if (guildId || channel.type !== 1 && channel.type !== 3) return false;
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
    }
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
    }
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
    items
  });
  appendContextMenuItems(tree, separator, submenu);
}
function applyChannelContextMenuPatch(options) {
  const {
    ctx,
    tree,
    channel,
    guildId,
    actions
  } = options;
  const channelId = channel.id;
  if (handleDMContextMenuPatch({ ctx, tree, channel, channelId, guildId, actions })) return;
  if (!guildId) return;
  appendGuildSubmenu(tree, buildGuildContextItems(ctx, guildId, channel, actions));
}

// src/RulersAuthority/panels.js
function findChannelSidebar() {
  for (const sel of SIDEBAR_FALLBACKS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}
function togglePanel(ctx, panelName) {
  const def = PANEL_DEFS[panelName];
  if (!def) return;
  const isPushed = ctx.settings.panels[panelName].pushed;
  ctx.settings.panels[panelName].pushed = !isPushed;
  if (!isPushed) {
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
function restorePanelStates(ctx) {
  for (const [panelName, config] of Object.entries(ctx.settings.panels)) {
    if (config.pushed) {
      document.body.classList.add(`ra-${panelName}-pushed`);
    }
  }
}
function getPushedPanelCount(ctx) {
  return Object.values(ctx.settings.panels).filter((p) => p.pushed).length;
}
function applyHoverRevealState(ctx, options) {
  const {
    name,
    inZone,
    revealDelay,
    hideDelay,
    isActive,
    setActive
  } = options;
  const revealKey = `_${name}RevealTimer`;
  const hideKey = `_${name}HideTimer`;
  const className = `ra-${name}-hover-reveal`;
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
    if (!ctx[revealKey] && !checkActive()) {
      ctx[revealKey] = setTimeout(() => {
        ctx[revealKey] = null;
        applyActive(true);
      }, revealDelay);
    }
  } else {
    clearTimeout(ctx[revealKey]);
    ctx[revealKey] = null;
    if (!ctx[hideKey] && checkActive()) {
      ctx[hideKey] = setTimeout(() => {
        ctx[hideKey] = null;
        applyActive(false);
      }, hideDelay);
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
  var _a2, _b, _c, _d, _e;
  const currentGuildId = (_b = (_a2 = ctx._SelectedGuildStore) == null ? void 0 : _a2.getGuildId) == null ? void 0 : _b.call(_a2);
  const hiddenChannelsCount = currentGuildId ? ((_e = (_d = (_c = ctx.settings.guilds) == null ? void 0 : _c[currentGuildId]) == null ? void 0 : _d.hiddenChannels) == null ? void 0 : _e.length) || 0 : 0;
  const channelHoverEnabled = hiddenChannelsCount > 0;
  const sidebarHoverEnabled = ctx.settings.panels.sidebar.hoverExpand;
  const membersHoverEnabled = ctx.settings.panels.members.hoverExpand;
  const profileHoverEnabled = ctx.settings.panels.profile.hoverExpand;
  const anyEnabled = sidebarHoverEnabled || membersHoverEnabled || profileHoverEnabled || channelHoverEnabled;
  if (!anyEnabled) return null;
  const fudge = ctx.settings.hoverFudgePx;
  const revealDelay = ctx.settings.hoverRevealDelayMs;
  return {
    event: e,
    fudge,
    hideDelay: ctx.settings.hoverHideDelayMs,
    revealDelay,
    panelRevealDelay: Math.max(RA_PANEL_HOVER_REVEAL_MIN_MS, revealDelay),
    viewportWidth: window.innerWidth,
    sidebarHoverEnabled,
    membersHoverEnabled,
    profileHoverEnabled,
    channelHoverEnabled
  };
}
function handleSidebarHover(ctx, runtime) {
  if (!(runtime.sidebarHoverEnabled && ctx.settings.panels.sidebar.pushed)) {
    clearPanelHoverState(ctx, "sidebar");
    return;
  }
  const sidebarEl = ctx._findPanelElement("sidebar");
  const inZone = runtime.event.clientX <= runtime.fudge;
  const inPanel = sidebarEl ? ctx._isInsideElement(runtime.event, sidebarEl, runtime.fudge) : false;
  applyHoverRevealState(ctx, {
    name: "sidebar",
    inZone: inZone || inPanel,
    revealDelay: runtime.panelRevealDelay,
    hideDelay: runtime.hideDelay
  });
}
function handleMembersHover(ctx, runtime) {
  if (!(runtime.membersHoverEnabled && ctx.settings.panels.members.pushed)) {
    clearPanelHoverState(ctx, "members");
    return;
  }
  const membersEl = ctx._findPanelElement("members");
  const distFromRight = runtime.viewportWidth - runtime.event.clientX;
  const inZone = distFromRight <= runtime.fudge;
  const inPanel = membersEl ? ctx._isInsideElement(runtime.event, membersEl, runtime.fudge) : false;
  applyHoverRevealState(ctx, {
    name: "members",
    inZone: inZone || inPanel,
    revealDelay: runtime.panelRevealDelay,
    hideDelay: runtime.hideDelay
  });
}
function handleProfileHover(ctx, runtime) {
  if (!(runtime.profileHoverEnabled && ctx.settings.panels.profile.pushed)) return;
  const profileEl = ctx._findPanelElement("profile");
  const inPanel = profileEl ? ctx._isInsideElement(runtime.event, profileEl, runtime.fudge) : false;
  const distFromRight = runtime.viewportWidth - runtime.event.clientX;
  const inZone = distFromRight <= runtime.fudge && !document.body.classList.contains("ra-members-hover-reveal");
  applyHoverRevealState(ctx, {
    name: "profile",
    inZone: inZone || inPanel,
    revealDelay: runtime.revealDelay,
    hideDelay: runtime.hideDelay
  });
}
function handleChannelHover(ctx, runtime) {
  if (!runtime.channelHoverEnabled) {
    clearPanelHoverState(ctx, "channel");
    setHiddenChannelRevealState(ctx, false);
    return;
  }
  const hoverEl = getChannelHoverElement();
  const inChannelPanel = hoverEl ? ctx._isInsideElement(runtime.event, hoverEl, runtime.fudge) : false;
  applyHoverRevealState(ctx, {
    name: "channel",
    inZone: inChannelPanel,
    revealDelay: runtime.revealDelay,
    hideDelay: runtime.hideDelay,
    isActive: () => ctx._channelsHoverRevealActive,
    setActive: (revealed) => setHiddenChannelRevealState(ctx, revealed)
  });
}
function setupHoverHandlers(ctx) {
  if (!ctx._controller) return;
  const handler = ctx._throttle((e) => {
    if (!ctx._controller) return;
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
  }, 16);
  document.addEventListener("mousemove", handler, {
    passive: true,
    signal: ctx._controller.signal
  });
}
function getGuildData(ctx, guildId) {
  if (!ctx.settings.guilds[guildId]) {
    ctx.settings.guilds[guildId] = { hiddenChannels: [], crushedCategories: [] };
  }
  return ctx.settings.guilds[guildId];
}
function pushChannel(ctx, guildId, channelId, channelName) {
  const guildData = getGuildData(ctx, guildId);
  if (guildData.hiddenChannels.some((c) => c.id === channelId)) return;
  guildData.hiddenChannels.push({ id: channelId, name: channelName });
  guildData._hiddenIdSet = null;
  applyChannelHiding(ctx, guildId);
  ctx.saveSettings();
  ctx.debugLog("PushChannel", `Pushed #${channelName} in ${guildId}`);
}
function recallChannel(ctx, guildId, channelId) {
  const guildData = getGuildData(ctx, guildId);
  guildData.hiddenChannels = guildData.hiddenChannels.filter((c) => c.id !== channelId);
  guildData._hiddenIdSet = null;
  const el = document.querySelector(`[data-list-item-id="channels___${channelId}"]`);
  if (el) {
    el.style.display = "";
    el.removeAttribute("data-ra-pushed");
  }
  applyChannelHiding(ctx, guildId);
  ctx.saveSettings();
  ctx.debugLog("RecallChannel", `Recalled ${channelId} in ${guildId}`);
}
function isChannelHidden(ctx, guildId, channelId) {
  var _a2;
  const guildData = ctx.settings.guilds[guildId];
  return ((_a2 = guildData == null ? void 0 : guildData.hiddenChannels) == null ? void 0 : _a2.some((c) => c.id === channelId)) || false;
}
var _channelHoverEl = null;
var _channelHoverElTime = 0;
var _CHANNEL_HOVER_TTL = 500;
function getChannelHoverElement() {
  const now = Date.now();
  if (_channelHoverEl && now - _channelHoverElTime < _CHANNEL_HOVER_TTL && _channelHoverEl.isConnected) {
    return _channelHoverEl;
  }
  const channelTree = document.querySelector('ul[aria-label="Channels"]') || document.querySelector('[role="tree"][aria-label="Channels"]') || document.querySelector('[class*="sidebar_"] [role="tree"]');
  if (!channelTree) {
    _channelHoverEl = null;
    return null;
  }
  _channelHoverEl = channelTree.closest('[class*="sidebar_"]') || channelTree;
  _channelHoverElTime = now;
  return _channelHoverEl;
}
function invalidateChannelHoverCache() {
  _channelHoverEl = null;
  _channelHoverElTime = 0;
}
function setHiddenChannelRevealState(ctx, shouldReveal) {
  const next = !!shouldReveal;
  if (ctx._channelsHoverRevealActive === next) return;
  ctx._channelsHoverRevealActive = next;
  document.body.classList.toggle("ra-channels-hover-reveal", next);
  applyChannelHiding(ctx);
}
function getEffectiveGuildId(ctx, guildId) {
  var _a2, _b;
  const currentGuildId = (_b = (_a2 = ctx._SelectedGuildStore) == null ? void 0 : _a2.getGuildId) == null ? void 0 : _b.call(_a2);
  if (guildId && guildId !== currentGuildId) return null;
  return guildId || currentGuildId || null;
}
function resolveHiddenIdSet(guildData) {
  if (!guildData) return /* @__PURE__ */ new Set();
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
    const channelId = listId.startsWith("channels___") ? listId.replace("channels___", "") : null;
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
function applyChannelHiding(ctx, guildId) {
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
function restoreAllHiddenChannels() {
  const pushed = document.querySelectorAll("[data-ra-pushed]");
  for (const el of pushed) {
    el.style.display = "";
    el.removeAttribute("data-ra-pushed");
  }
  document.body.classList.remove("ra-channels-hover-reveal");
}
function crushCategory(ctx, guildId, categoryId, categoryName) {
  const guildData = getGuildData(ctx, guildId);
  if (guildData.crushedCategories.some((c) => c.id === categoryId)) return;
  guildData.crushedCategories.push({ id: categoryId, name: categoryName });
  applyCategoryCrushing(ctx, guildId);
  ctx.saveSettings();
  ctx.debugLog("CrushCategory", `Crushed ${categoryName} in ${guildId}`);
}
function releaseCategory(ctx, guildId, categoryId) {
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
function isCategoryCrushed(ctx, guildId, categoryId) {
  var _a2;
  const guildData = ctx.settings.guilds[guildId];
  return ((_a2 = guildData == null ? void 0 : guildData.crushedCategories) == null ? void 0 : _a2.some((c) => c.id === categoryId)) || false;
}
function getChannelIdFromListItem(el) {
  const listId = (el == null ? void 0 : el.getAttribute("data-list-item-id")) || "";
  if (!listId.startsWith("channels___")) return null;
  return listId.replace("channels___", "");
}
function hideCrushedCategoryChildren(ctx, categoryEl, categoryId) {
  var _a2, _b;
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
    const channel = (_b = (_a2 = ctx._ChannelStore) == null ? void 0 : _a2.getChannel) == null ? void 0 : _b.call(_a2, channelId);
    if (!channel || channel.type === 4) break;
    next.style.display = "none";
    next.setAttribute("data-ra-category-crushed", categoryId);
    next = next.nextElementSibling;
  }
}
function applyCategoryCrushForId(ctx, scope, categoryId) {
  var _a2;
  const categoryEl = scope.querySelector(`[data-list-item-id="channels___${categoryId}"]`);
  if (!categoryEl) return;
  const alreadyCrushed = categoryEl.hasAttribute("data-ra-crushed") && ((_a2 = categoryEl.nextElementSibling) == null ? void 0 : _a2.getAttribute("data-ra-category-crushed")) === categoryId;
  if (alreadyCrushed) return;
  categoryEl.setAttribute("data-ra-crushed", "true");
  hideCrushedCategoryChildren(ctx, categoryEl, categoryId);
}
function applyCategoryCrushing(ctx, guildId) {
  const effectiveGuildId = getEffectiveGuildId(ctx, guildId);
  if (!effectiveGuildId) return;
  const guildData = ctx.settings.guilds[effectiveGuildId];
  const crushedCategories = (guildData == null ? void 0 : guildData.crushedCategories) || [];
  if (crushedCategories.length === 0) return;
  const sidebar = findChannelSidebar();
  const scope = sidebar || document;
  for (const { id: categoryId } of crushedCategories) {
    applyCategoryCrushForId(ctx, scope, categoryId);
  }
}
function restoreAllCrushedCategories() {
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
function applyMicroStateForCurrentGuild(ctx) {
  var _a2, _b;
  const guildId = (_b = (_a2 = ctx._SelectedGuildStore) == null ? void 0 : _a2.getGuildId) == null ? void 0 : _b.call(_a2);
  if (guildId) {
    applyChannelHiding(ctx, guildId);
    applyCategoryCrushing(ctx, guildId);
  }
}
function gripDM(ctx, channelId, username) {
  if (ctx.settings.grippedDMs.some((d) => d.channelId === channelId)) return;
  ctx.settings.grippedDMs.push({ channelId, username });
  applyDMGripping(ctx);
  ctx.saveSettings();
  ctx._toast(`Gripped DM: ${username}`, "success");
  ctx.debugLog("GripDM", `Gripped ${username} (${channelId})`);
}
function releaseDM(ctx, channelId) {
  ctx.settings.grippedDMs = ctx.settings.grippedDMs.filter((d) => d.channelId !== channelId);
  const el = document.querySelector(`[data-list-item-id*="${channelId}"] .ra-grip-indicator`);
  if (el) el.remove();
  ctx.saveSettings();
  ctx._toast("Released DM grip", "info");
  ctx.debugLog("ReleaseDM", `Released ${channelId}`);
}
function isDMGripped(ctx, channelId) {
  return ctx.settings.grippedDMs.some((d) => d.channelId === channelId);
}
function setupDMObserver(ctx) {
  if (ctx._dmObserver) {
    ctx._dmObserver.disconnect();
    ctx._dmObserver = null;
  }
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
function applyDMGripping(ctx) {
  var _a2;
  const dmList = ctx._findElement(DM_LIST_FALLBACKS);
  if (!dmList) return;
  const header = dmList.querySelector('[class*="searchBar_"]') || dmList.querySelector('[class*="privateChannelsHeaderContainer_"]') || dmList.querySelector("h2");
  const insertAfterEl = (header == null ? void 0 : header.closest('[class*="listItem_"]')) || (header == null ? void 0 : header.parentElement) || null;
  for (const { channelId } of [...ctx.settings.grippedDMs].reverse()) {
    const dmEl = dmList.querySelector(`[data-list-item-id*="${channelId}"]`) || ((_a2 = dmList.querySelector(`a[href="/channels/@me/${channelId}"]`)) == null ? void 0 : _a2.closest("[data-list-item-id]"));
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
function patchContextMenus(ctx) {
  try {
    if (ctx._unpatchChannelCtx) {
      try {
        ctx._unpatchChannelCtx();
      } catch (_) {
      }
      ctx._unpatchChannelCtx = null;
    }
    ctx._unpatchChannelCtx = BdApi.ContextMenu.patch("channel-context", (tree, props) => {
      if (!(props == null ? void 0 : props.channel)) return;
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
          releaseDM
        }
      });
    });
    ctx.debugLog("ContextMenu", "Patched channel-context");
  } catch (err) {
    ctx.debugError("ContextMenu", "Failed to patch:", err);
  }
}
function getChannelHeaderToolbar(ctx) {
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
function attachToolbarIcon(ctx, icon) {
  const toolbar = getChannelHeaderToolbar(ctx);
  if (!toolbar) return false;
  if (icon.parentElement !== toolbar) {
    toolbar.appendChild(icon);
  }
  icon.classList.remove("ra-toolbar-icon--hidden");
  return true;
}
function injectToolbarIcon(ctx) {
  let icon = document.getElementById(RA_TOOLBAR_ICON_ID);
  if (!icon) {
    icon = document.createElement("div");
    icon.id = RA_TOOLBAR_ICON_ID;
    icon.className = "ra-toolbar-icon";
    icon.setAttribute("role", "button");
    icon.setAttribute("aria-label", "Ruler's Authority \u2014 Toggle Sidebar");
    icon.setAttribute("tabindex", "0");
    icon.innerHTML = [
      '<svg viewBox="0 0 32 32" width="18" height="18" xmlns="http://www.w3.org/2000/svg">',
      '<path fill="#b5b5be" d="M31 8.5c0 0-2.53 5.333-3.215 8.062-0.896 3.57 0.13 6.268-1.172 9.73-2.25 4.060-2.402 4.717-10.613 4.708-3.009-0.003-11.626-2.297-11.626-2.297-1.188-0.305-3.373-0.125-3.373-1.453s1.554-2.296 2.936-2.3l5.439 0.478c1.322-0.083 2.705-0.856 2.747-2.585-0.022-2.558-0.275-4.522-1.573-6.6l-5.042-7.867c-0.301-0.626-0.373-1.694 0.499-2.171s1.862 0.232 2.2 0.849l5.631 7.66c0.602 0.559 1.671 0.667 1.58-0.524l-2.487-11.401c-0.155-0.81 0.256-1.791 1.194-1.791 1.231 0 1.987 0.47 1.963 1.213l2.734 11.249c0.214 0.547 0.972 0.475 1.176-0.031l0.779-10.939c0.040-0.349 0.495-0.957 1.369-0.831s1.377 1.063 1.285 1.424l-0.253 10.809c0.177 0.958 0.93 1.098 1.517 0.563l3.827-6.843c0.232-0.574 1.143-0.693 1.67-0.466 0.491 0.32 0.81 0.748 0.81 1.351v0z"/>',
      "</svg>"
    ].join("");
    const iconSignal = ctx._controller ? { signal: ctx._controller.signal } : {};
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      togglePanel(ctx, "sidebar");
    }, iconSignal);
    icon.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      e.preventDefault();
      togglePanel(ctx, "members");
    }, iconSignal);
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
function updateToolbarIcon(ctx) {
  const icon = document.getElementById(RA_TOOLBAR_ICON_ID);
  if (!icon) return;
  const pushedCount = getPushedPanelCount(ctx);
  const anyPushed = pushedCount > 0;
  icon.classList.toggle("ra-toolbar-icon--active", anyPushed);
  icon.classList.toggle("ra-toolbar-icon--amplified", ctx._amplifiedMode);
  icon.title = `Ruler's Authority${anyPushed ? ` (${pushedCount} pushed)` : ""}${ctx._amplifiedMode ? " [AMPLIFIED]" : ""}`;
}
function scheduleIconReinject(ctx, delayMs = RA_ICON_REINJECT_DELAY_MS) {
  if (ctx._iconReinjectTimeout) clearTimeout(ctx._iconReinjectTimeout);
  ctx._iconReinjectTimeout = setTimeout(() => {
    ctx._iconReinjectTimeout = null;
    injectToolbarIcon(ctx);
  }, delayMs);
}
function setupToolbarObserver(ctx) {
  var _a2;
  if (ctx._layoutBusUnsub) return;
  if ((_a2 = _PluginUtils) == null ? void 0 : _a2.LayoutObserverBus) {
    ctx._layoutBusUnsub = _PluginUtils.LayoutObserverBus.subscribe("RulersAuthority", () => {
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
      signal: ctx._controller.signal
    });
  }
  scheduleIconReinject(ctx, 60);
}
function teardownToolbarObserver(ctx) {
  if (ctx._layoutBusUnsub) {
    ctx._layoutBusUnsub();
    ctx._layoutBusUnsub = null;
  }
  if (ctx._iconReinjectTimeout) {
    clearTimeout(ctx._iconReinjectTimeout);
    ctx._iconReinjectTimeout = null;
  }
}
function showPushEffect(ctx, panelName) {
  if (!ctx.settings.animationsEnabled) return;
  document.body.classList.add("ra-pushing");
  clearTimeout(ctx._pushAnimTimer);
  ctx._pushAnimTimer = setTimeout(() => {
    document.body.classList.remove("ra-pushing");
  }, 500);
}
function showPullEffect(ctx, panelName) {
  if (!ctx.settings.animationsEnabled) return;
  document.body.classList.add("ra-pulling");
  clearTimeout(ctx._pullAnimTimer);
  ctx._pullAnimTimer = setTimeout(() => {
    document.body.classList.remove("ra-pulling");
  }, 350);
}
function getSoloLevelingData(ctx) {
  var _a2;
  const cached = ctx._statsCache.get();
  if (cached && BdApi.Plugins.isEnabled("SoloLevelingStats")) {
    return cached;
  }
  if (!BdApi.Plugins.isEnabled("SoloLevelingStats")) return null;
  const soloPlugin = BdApi.Plugins.get("SoloLevelingStats");
  const instance = (soloPlugin == null ? void 0 : soloPlugin.instance) || soloPlugin;
  if (!(instance == null ? void 0 : instance.settings)) return null;
  const data = {
    level: instance.settings.level || 1,
    intelligence: ((_a2 = instance.settings.stats) == null ? void 0 : _a2.intelligence) || 0,
    stats: { ...instance.settings.stats }
  };
  ctx._statsCache.set(data);
  return data;
}
function setupSkillTreeListeners(ctx) {
  var _a2, _b;
  ctx._onSkillActivated = (e) => {
    var _a3;
    if (((_a3 = e.detail) == null ? void 0 : _a3.skillId) === "rulers_authority") {
      ctx._amplifiedMode = true;
      ctx._amplifiedExpiresAt = e.detail.expiresAt || 0;
      onAmplifiedModeChange(ctx, true);
    }
  };
  ctx._onSkillExpired = (e) => {
    var _a3;
    if (((_a3 = e.detail) == null ? void 0 : _a3.skillId) === "rulers_authority") {
      ctx._amplifiedMode = false;
      onAmplifiedModeChange(ctx, false);
    }
  };
  document.addEventListener("SkillTree:activeSkillActivated", ctx._onSkillActivated);
  document.addEventListener("SkillTree:activeSkillExpired", ctx._onSkillExpired);
  if (BdApi.Plugins.isEnabled("SkillTree")) {
    const stInstance = (_a2 = BdApi.Plugins.get("SkillTree")) == null ? void 0 : _a2.instance;
    if ((_b = stInstance == null ? void 0 : stInstance.isActiveSkillRunning) == null ? void 0 : _b.call(stInstance, "rulers_authority")) {
      ctx._amplifiedMode = true;
      ctx.debugLog("SkillTree", "rulers_authority already active on start");
    }
  }
}
function onAmplifiedModeChange(ctx, active) {
  if (active) {
    document.body.classList.add("ra-amplified");
    ctx._toast("Ruler's Authority AMPLIFIED \u2014 Full telekinetic power!", "success", 4e3);
  } else {
    document.body.classList.remove("ra-amplified");
    ctx._toast("Ruler's Authority amplification expired.", "info");
  }
  updateToolbarIcon(ctx);
}
function setupGuildChangeListener(ctx) {
  if (!ctx._SelectedGuildStore) return;
  ctx._guildChangeHandler = () => {
    ctx._panelElCache = null;
    invalidateChannelHoverCache();
    clearTimeout(ctx._guildChangeApplyTimer);
    ctx._guildChangeApplyTimer = setTimeout(() => {
      if (!ctx._controller) return;
      applyMicroStateForCurrentGuild(ctx);
      setupChannelObserver(ctx);
    }, 300);
  };
  ctx._SelectedGuildStore.addChangeListener(ctx._guildChangeHandler);
  if (ctx._SelectedChannelStore) {
    ctx._channelChangeHandler = ctx._throttle(() => {
      if (!ctx._controller) return;
      ctx._panelElCache = null;
      applyMicroStateForCurrentGuild(ctx);
      if (!ctx._channelObserver) {
        setupChannelObserver(ctx);
      }
    }, 500);
    ctx._SelectedChannelStore.addChangeListener(ctx._channelChangeHandler);
  }
}
function setupChannelObserver(ctx, retries = 0) {
  var _a2;
  if (ctx._channelObserver) {
    ctx._channelObserver.disconnect();
    ctx._channelObserver = null;
  }
  clearTimeout(ctx._channelObserverRetryTimer);
  const m = ctx._modules;
  const channelList = ((_a2 = m == null ? void 0 : m.sidebar) == null ? void 0 : _a2.sidebarList) && document.querySelector(`.${m.sidebar.sidebarList} [role="tree"]`) || document.querySelector('[class*="sidebar_"] [role="tree"]') || document.querySelector('[class*="sidebar_"] [class*="scroller_"]');
  if (!channelList) {
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
    if (!channelList.isConnected) {
      setupChannelObserver(ctx);
      return;
    }
    applyMicroStateForCurrentGuild(ctx);
  }, RA_OBSERVER_THROTTLE_MS);
  ctx._channelObserver = new MutationObserver(throttledApply);
  ctx._channelObserver.observe(channelList, { childList: true, subtree: true });
}
function setupSettingsGuard(ctx) {
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
function isSettingsModalOpen() {
  return !!document.querySelector('[class*="standardSidebarView_"]');
}
function syncSettingsGuardState(ctx, forceOpen) {
  const body = document.body;
  if (!body) return false;
  const isOpen = typeof forceOpen === "boolean" ? forceOpen : isSettingsModalOpen();
  body.classList.toggle(RA_SETTINGS_OPEN_CLASS, isOpen);
  if (isOpen) clearAllHoverStates(ctx);
  return isOpen;
}
function clearSidebarHoverState(ctx) {
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
function clearAllHoverStates(ctx) {
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

// src/RulersAuthority/styles.js
function updateCSSVars(ctx) {
  const s = ctx.settings;
  BdApi.DOM.removeStyle(RA_VARS_STYLE_ID);
  BdApi.DOM.addStyle(RA_VARS_STYLE_ID, `
    :root {
      --ra-transition-speed: ${s.transitionSpeed}ms;
      --ra-sidebar-width: ${s.panels.sidebar.width || s.defaultWidths.sidebar}px;
      --ra-members-width: ${s.panels.members.width || s.defaultWidths.members}px;
      --ra-profile-width: ${s.panels.profile.width || s.defaultWidths.profile}px;
      --ra-search-width: ${s.panels.search.width || s.defaultWidths.search}px;
      --ra-push-color: rgba(138, 43, 226, 0.25);
      --ra-members-bg: rgba(10, 14, 24, 0.44);
      --ra-hover-fudge: ${s.hoverFudgePx}px;
    }
  `.replace(/\s+/g, " "));
}
function buildCSS(ctx) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
  const m = ctx._modules || {};
  const buildCollapsedPushRule = (selectors) => `${selectors.join(",\n")} {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}`;
  const sidebarSel = ((_a2 = m.sidebar) == null ? void 0 : _a2.sidebarList) ? `.${m.sidebar.sidebarList}` : SIDEBAR_CSS_SAFE.join(", ");
  const membersSel = ((_b = m.members) == null ? void 0 : _b.membersWrap) ? `.${m.members.membersWrap}` : MEMBERS_FALLBACKS.join(", ");
  const profileSel = ((_c = m.panel) == null ? void 0 : _c.outer) ? `.${m.panel.outer}` : PROFILE_FALLBACKS.join(", ");
  const searchSel = ((_d = m.search) == null ? void 0 : _d.searchResultsWrap) ? `.${m.search.searchResultsWrap}` : SEARCH_FALLBACKS.join(", ");
  const chatSel = ((_e = m.guilds) == null ? void 0 : _e.chatContent) ? `.${m.guilds.chatContent}` : '[class*="chatContent_"]';
  const sidebarPush = SIDEBAR_CSS_SAFE.map((s) => `body.ra-sidebar-pushed:not(.${RA_SETTINGS_OPEN_CLASS}) ${s}`);
  const membersPush = MEMBERS_FALLBACKS.map((s) => `body.ra-members-pushed ${s}`);
  const profilePush = PROFILE_FALLBACKS.map((s) => `body.ra-profile-pushed ${s}`);
  const searchPush = SEARCH_FALLBACKS.map((s) => `body.ra-search-pushed ${s}`);
  if ((_f = m.sidebar) == null ? void 0 : _f.sidebarList) sidebarPush.unshift(`body.ra-sidebar-pushed:not(.${RA_SETTINGS_OPEN_CLASS}) .${m.sidebar.sidebarList}`);
  if ((_g = m.members) == null ? void 0 : _g.membersWrap) membersPush.unshift(`body.ra-members-pushed .${m.members.membersWrap}`);
  if ((_h = m.panel) == null ? void 0 : _h.outer) profilePush.unshift(`body.ra-profile-pushed .${m.panel.outer}`);
  if ((_i = m.search) == null ? void 0 : _i.searchResultsWrap) searchPush.unshift(`body.ra-search-pushed .${m.search.searchResultsWrap}`);
  const sidebarHover = SIDEBAR_CSS_SAFE.map((s) => `body.ra-sidebar-pushed.ra-sidebar-hover-reveal:not(.${RA_SETTINGS_OPEN_CLASS}) ${s}`);
  const membersHover = MEMBERS_FALLBACKS.map((s) => `body.ra-members-pushed.ra-members-hover-reveal ${s}`);
  const profileHover = PROFILE_FALLBACKS.map((s) => `body.ra-profile-pushed.ra-profile-hover-reveal ${s}`);
  if ((_j = m.sidebar) == null ? void 0 : _j.sidebarList) sidebarHover.unshift(`body.ra-sidebar-pushed.ra-sidebar-hover-reveal:not(.${RA_SETTINGS_OPEN_CLASS}) .${m.sidebar.sidebarList}`);
  if ((_k = m.members) == null ? void 0 : _k.membersWrap) membersHover.unshift(`body.ra-members-pushed.ra-members-hover-reveal .${m.members.membersWrap}`);
  if ((_l = m.panel) == null ? void 0 : _l.outer) profileHover.unshift(`body.ra-profile-pushed.ra-profile-hover-reveal .${m.panel.outer}`);
  const sidebarHandleDisable = SIDEBAR_FALLBACKS.map((s) => `body.${RA_SETTINGS_OPEN_CLASS} ${s}::before`);
  if ((_m = m.sidebar) == null ? void 0 : _m.sidebarList) sidebarHandleDisable.unshift(`body.${RA_SETTINGS_OPEN_CLASS} .${m.sidebar.sidebarList}::before`);
  return `
/* \u2500\u2500 Ruler's Authority v${RA_VERSION} \u2014 Dynamic CSS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

/* \u2500\u2500 Core Panel Push \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

${buildCollapsedPushRule(sidebarPush)}

${buildCollapsedPushRule(membersPush)}

${buildCollapsedPushRule(profilePush)}

${buildCollapsedPushRule(searchPush)}

/* \u2500\u2500 Members Column Surface (transparent) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

${membersSel},
${membersSel} > div[class*="members_"],
${membersSel} > div[class*="container_"] {
  background: var(--ra-members-bg) !important;
  position: relative !important;
  overflow: visible !important;
}

${membersSel},
${membersSel} [class*="members_"],
${membersSel} [class*="scroller_"],
${membersSel} [class*="thin_"],
${membersSel} [class*="scrollerBase_"] {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

${membersSel}::-webkit-scrollbar,
${membersSel} [class*="members_"]::-webkit-scrollbar,
${membersSel} [class*="scroller_"]::-webkit-scrollbar,
${membersSel} [class*="thin_"]::-webkit-scrollbar,
${membersSel} [class*="scrollerBase_"]::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}

/* \u2500\u2500 Chat content dark overlay \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
body.ra-members-pushed.ra-members-hover-reveal ${chatSel} {
  background: rgba(0, 0, 0, 0.4) !important;
}

/* \u2500\u2500 Members: outer wrap matches inner dark overlay \u2500\u2500 */
body.ra-members-pushed.ra-members-hover-reveal ${membersSel},
body.ra-members-pushed.ra-members-hover-reveal div[class^="membersWrap_"] {
  background: rgba(0, 0, 0, 0.4) !important;
  background-color: rgba(0, 0, 0, 0.4) !important;
  box-shadow: none !important;
  border-left: 0 !important;
  outline: none !important;
}

body.ra-members-pushed.ra-members-hover-reveal div[class^="members_"] {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border-left: 0 !important;
  outline: none !important;
}

body.ra-members-pushed.ra-members-hover-reveal div[aria-label="Members"][role="list"] {
  background: transparent !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}

/* \u2500\u2500 Hover-to-Expand (float overlay) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

${sidebarHover.join(",\n")} {
  width: var(--ra-sidebar-width) !important;
  min-width: var(--ra-sidebar-width) !important;
  max-width: var(--ra-sidebar-width) !important;
  overflow-y: auto !important;
  box-shadow: none !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}

${membersHover.join(",\n")} {
  width: var(--ra-members-width) !important;
  min-width: var(--ra-members-width) !important;
  max-width: var(--ra-members-width) !important;
  overflow-y: auto !important;
  overflow-x: visible !important;
  position: relative !important;
  border-left: 0 !important;
  box-shadow: none !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}

/* Stable selectors from live DOM: force-hide member list scrollbar */
body.ra-members-pushed.ra-members-hover-reveal aside[class^="membersWrap_"] > div[class^="members_"],
body.ra-members-pushed.ra-members-hover-reveal div[aria-label="Members"][role="list"] {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

body.ra-members-pushed.ra-members-hover-reveal aside[class^="membersWrap_"] > div[class^="members_"]::-webkit-scrollbar,
body.ra-members-pushed.ra-members-hover-reveal div[aria-label="Members"][role="list"]::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
  background: transparent !important;
}

${profileHover.join(",\n")} {
  width: var(--ra-profile-width) !important;
  min-width: var(--ra-profile-width) !important;
  max-width: var(--ra-profile-width) !important;
  overflow-y: auto !important;
  position: absolute !important;
  right: 0 !important;
  top: 0 !important;
  height: 100% !important;
  z-index: 101 !important;
  box-shadow: -4px 0 20px var(--ra-push-color) !important;
  transition: width var(--ra-transition-speed) ease,
              min-width var(--ra-transition-speed) ease,
              max-width var(--ra-transition-speed) ease;
}

/* \u2500\u2500 Resize Handles (::before pseudo-elements \u2014 CollapsibleUI pattern) \u2500\u2500 */

${membersSel}:before,
${profileSel}:before,
${searchSel}:before {
  cursor: e-resize;
  z-index: 200;
  position: absolute;
  content: "";
  width: 12px;
  height: 100%;
  left: -4px;
  opacity: 0;
  transition: opacity 200ms ease;
}

${membersSel}:hover:before,
${profileSel}:hover:before,
${searchSel}:hover:before {
  opacity: 1;
  background: transparent;
}

${sidebarSel}:before {
  cursor: e-resize;
  z-index: 200;
  position: absolute;
  content: "";
  width: 12px;
  height: 100%;
  right: -4px;
  left: auto;
  opacity: 0;
  transition: opacity 200ms ease;
}

${sidebarSel}:hover:before {
  opacity: 1;
  background: transparent;
}

${sidebarHandleDisable.join(",\n")} {
  opacity: 0 !important;
  background: none !important;
  pointer-events: none !important;
}

/* \u2500\u2500 Crushed Category Visual \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

[data-ra-crushed="true"] {
  opacity: 0.5;
  border-left: 2px solid rgba(138, 43, 226, 0.4);
}

/* \u2500\u2500 Grip DM Indicator \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.ra-grip-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: radial-gradient(circle, #b49bff 0%, rgba(138, 43, 226, 0.3) 100%);
  border-radius: 50%;
  pointer-events: none;
  animation: ra-grip-pulse 2s ease-in-out infinite;
}

@keyframes ra-grip-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}

/* \u2500\u2500 Toolbar Icon \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.ra-toolbar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  border-radius: 4px;
  transition: opacity 0.15s ease, background 0.15s ease;
  margin-left: 4px;
  opacity: 0.8;
}

.ra-toolbar-icon:hover {
  opacity: 1;
}

.ra-toolbar-icon:hover svg {
  filter: drop-shadow(0 0 4px rgba(200, 170, 255, 0.7));
}

/* \u2500\u2500 Shared Toolbar Tooltip \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.sl-toolbar-tip {
  position: fixed;
  transform: translateX(-50%);
  padding: 8px 12px;
  background: rgb(10, 10, 15);
  border: 1px solid rgba(138, 43, 226, 0.4);
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(138, 43, 226, 0.25), 0 0 20px rgba(138, 43, 226, 0.08);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.1s ease;
  z-index: 999999;
}
.sl-toolbar-tip--visible {
  opacity: 1;
}
.sl-toolbar-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: rgba(138, 43, 226, 0.4);
}

.ra-toolbar-icon--active {
  opacity: 1;
}

.ra-toolbar-icon--active svg {
  filter: drop-shadow(0 0 4px rgba(138, 43, 226, 0.6));
}

.ra-toolbar-icon--hidden {
  display: none !important;
}

/* \u2500\u2500 Amplified Mode \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.ra-toolbar-icon--amplified svg {
  filter: drop-shadow(0 0 8px rgba(138, 43, 226, 0.8)) !important;
  animation: ra-amplified-glow 2s ease-in-out infinite;
}

@keyframes ra-amplified-glow {
  0%, 100% { filter: drop-shadow(0 0 8px rgba(138, 43, 226, 0.8)); }
  50% { filter: drop-shadow(0 0 16px rgba(180, 60, 255, 1.0)); }
}

body.ra-amplified [data-ra-crushed="true"] {
  border-left-color: rgba(180, 60, 255, 0.6);
}

body.ra-amplified .ra-grip-indicator {
  background: radial-gradient(circle, #c78dff 0%, rgba(180, 60, 255, 0.5) 100%);
}

/* \u2500\u2500 Push/Pull Animation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

@keyframes ra-push-ripple {
  0% { box-shadow: inset 3px 0 12px rgba(138, 43, 226, 0.5); }
  50% { box-shadow: inset 3px 0 20px rgba(138, 43, 226, 0.2); }
  100% { box-shadow: none; }
}

@keyframes ra-pull-bounce {
  0% { transform: scaleX(0.97); }
  60% { transform: scaleX(1.01); }
  100% { transform: scaleX(1); }
}

body.ra-pushing ${chatSel},
body.ra-pushing [class*="chatContent_"] {
  animation: ra-push-ripple 500ms ease-out;
}

body.ra-pulling ${chatSel},
body.ra-pulling [class*="chatContent_"] {
  animation: ra-pull-bounce 350ms ease-out;
}
  `.trim();
}
function injectCSS(ctx) {
  if (!ctx._builtCSS) ctx._builtCSS = buildCSS(ctx);
  BdApi.DOM.removeStyle(RA_STYLE_ID);
  BdApi.DOM.addStyle(RA_STYLE_ID, ctx._builtCSS);
}

// src/RulersAuthority/settings.js
function getSettingsPanel(ctx) {
  const React = BdApi.React;
  const { useState, useCallback, useReducer } = React;
  const ce = React.createElement;
  const SettingsPanel = () => {
    const [, forceUpdate] = useReducer((x) => x + 1, 0);
    const [debug, setDebug] = useState(ctx.settings.debugMode);
    const [transSpeed, setTransSpeed] = useState(ctx.settings.transitionSpeed);
    const [anims, setAnims] = useState(ctx.settings.animationsEnabled);
    const slsData = getSoloLevelingData(ctx);
    const updateSetting = useCallback((key, value) => {
      ctx.settings[key] = value;
      ctx.saveSettings();
      forceUpdate();
    }, []);
    const containerStyle = {
      background: "#1e1e2e",
      padding: "16px",
      borderRadius: "8px",
      color: "#ccc",
      fontFamily: "inherit",
      fontSize: "14px"
    };
    const sectionStyle = {
      marginBottom: "16px",
      padding: "12px",
      background: "#252540",
      borderRadius: "6px"
    };
    const headerStyle = { color: "#b49bff", fontSize: "16px", marginBottom: "8px", fontWeight: "600" };
    const subHeaderStyle = { color: "#9b8ec4", fontSize: "13px", marginBottom: "6px", fontWeight: "500" };
    const labelStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" };
    const dimStyle = { fontSize: "11px", color: "#666", marginTop: "2px" };
    const btnStyle = {
      background: "#9b59b6",
      border: "none",
      color: "#fff",
      padding: "4px 10px",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "12px",
      marginRight: "6px",
      marginBottom: "4px"
    };
    const btnDimStyle = { ...btnStyle, background: "#444" };
    const Toggle = ({ label, checked, onChange }) => ce(
      "label",
      { style: labelStyle },
      ce("span", null, label),
      ce("input", {
        type: "checkbox",
        checked,
        style: { accentColor: "#9b59b6" },
        onChange: (e) => onChange(e.target.checked)
      })
    );
    const StatusSection = () => ce(
      "div",
      { style: sectionStyle },
      ce("div", { style: headerStyle }, "Ruler's Authority"),
      ce(
        "div",
        { style: dimStyle },
        slsData ? `INT: ${slsData.intelligence} | Level: ${slsData.level}` : "SoloLevelingStats not detected"
      ),
      ctx._amplifiedMode && ce(
        "div",
        { style: { ...dimStyle, color: "#b49bff", marginTop: "4px" } },
        "AMPLIFIED MODE ACTIVE"
      ),
      ce(
        "div",
        { style: { ...dimStyle, marginTop: "4px" } },
        `Webpack: ${Object.keys(ctx._resolvedSelectors).filter((k) => {
          var _a2, _b, _c, _d, _e;
          const m = ctx._modules;
          if (k === "sidebar") return !!((_a2 = m.sidebar) == null ? void 0 : _a2.sidebarList);
          if (k === "members") return !!((_b = m.members) == null ? void 0 : _b.membersWrap);
          if (k === "profile") return !!((_c = m.panel) == null ? void 0 : _c.outer);
          if (k === "search") return !!((_d = m.search) == null ? void 0 : _d.searchResultsWrap);
          if (k === "toolbar") return !!((_e = m.icons) == null ? void 0 : _e.toolbar);
          return false;
        }).length}/5 modules resolved`
      )
    );
    const PanelSection = () => ce(
      "div",
      { style: sectionStyle },
      ce("div", { style: subHeaderStyle }, "Panel Controls"),
      Object.entries(PANEL_DEFS).map(
        ([name, def]) => ce(
          "div",
          { key: name, style: { marginBottom: "8px" } },
          ce(Toggle, {
            label: def.label,
            checked: ctx.settings.panels[name].pushed,
            onChange: () => {
              togglePanel(ctx, name);
              forceUpdate();
            }
          }),
          def.hoverCapable && ce(Toggle, {
            label: "  \u21B3 Hover to expand",
            checked: ctx.settings.panels[name].hoverExpand,
            onChange: (v) => {
              ctx.settings.panels[name].hoverExpand = v;
              ctx.saveSettings();
              forceUpdate();
            }
          }),
          // Width display (if panel has been resized)
          ctx.settings.panels[name].width > 0 && ce(
            "div",
            { style: { ...dimStyle, display: "flex", alignItems: "center", gap: "6px" } },
            ce("span", null, `Width: ${ctx.settings.panels[name].width}px`),
            ce("button", {
              style: { ...btnDimStyle, fontSize: "10px", padding: "2px 6px", marginBottom: "0" },
              onClick: () => {
                ctx.settings.panels[name].width = ctx.settings.defaultWidths[name];
                ctx.saveSettings();
                updateCSSVars(ctx);
                forceUpdate();
              }
            }, "Reset")
          )
        )
      )
    );
    const HiddenChannelsSection = () => {
      const guildEntries = Object.entries(ctx.settings.guilds).filter(
        ([, data]) => {
          var _a2, _b;
          return ((_a2 = data.hiddenChannels) == null ? void 0 : _a2.length) > 0 || ((_b = data.crushedCategories) == null ? void 0 : _b.length) > 0;
        }
      );
      if (guildEntries.length === 0) return null;
      return ce(
        "div",
        { style: sectionStyle },
        ce("div", { style: subHeaderStyle }, "Pushed Channels & Crushed Categories"),
        guildEntries.map(([guildId, data]) => {
          var _a2, _b, _c, _d;
          const guild = (_b = (_a2 = ctx._GuildStore) == null ? void 0 : _a2.getGuild) == null ? void 0 : _b.call(_a2, guildId);
          const guildName = (guild == null ? void 0 : guild.name) || guildId;
          return ce(
            "div",
            { key: guildId, style: { marginBottom: "10px" } },
            ce("div", { style: { fontSize: "12px", color: "#999", marginBottom: "4px" } }, guildName),
            (_c = data.hiddenChannels) == null ? void 0 : _c.map(
              (ch) => ce("button", {
                key: ch.id,
                style: btnDimStyle,
                onClick: () => {
                  recallChannel(ctx, guildId, ch.id);
                  forceUpdate();
                }
              }, `Recall #${ch.name}`)
            ),
            (_d = data.crushedCategories) == null ? void 0 : _d.map(
              (cat) => ce("button", {
                key: cat.id,
                style: btnDimStyle,
                onClick: () => {
                  releaseCategory(ctx, guildId, cat.id);
                  forceUpdate();
                }
              }, `Release ${cat.name}`)
            )
          );
        })
      );
    };
    const GrippedDMsSection = () => {
      if (ctx.settings.grippedDMs.length === 0) return null;
      return ce(
        "div",
        { style: sectionStyle },
        ce("div", { style: subHeaderStyle }, "Gripped DMs"),
        ctx.settings.grippedDMs.map(
          (dm) => ce("button", {
            key: dm.channelId,
            style: btnDimStyle,
            onClick: () => {
              releaseDM(ctx, dm.channelId);
              forceUpdate();
            }
          }, `Release ${dm.username}`)
        )
      );
    };
    const GeneralSection = () => ce(
      "div",
      { style: sectionStyle },
      ce("div", { style: subHeaderStyle }, "General"),
      ce(
        "label",
        { style: { ...labelStyle, marginBottom: "10px" } },
        ce("span", null, `Transition Speed: ${transSpeed}ms`),
        ce("input", {
          type: "range",
          min: 0,
          max: 600,
          step: 50,
          value: transSpeed,
          style: { width: "120px", accentColor: "#9b59b6" },
          onChange: (e) => {
            const v = Number(e.target.value);
            setTransSpeed(v);
            ctx.settings.transitionSpeed = v;
            ctx.saveSettings();
            updateCSSVars(ctx);
          }
        })
      ),
      ce(Toggle, {
        label: "Animations",
        checked: anims,
        onChange: (v) => {
          setAnims(v);
          updateSetting("animationsEnabled", v);
        }
      }),
      ce(Toggle, {
        label: "Debug Mode",
        checked: debug,
        onChange: (v) => {
          setDebug(v);
          updateSetting("debugMode", v);
        }
      })
    );
    return ce(
      "div",
      { style: containerStyle },
      ce(StatusSection),
      ce(PanelSection),
      ce(HiddenChannelsSection),
      ce(GrippedDMsSection),
      ce(GeneralSection)
    );
  };
  return React.createElement(SettingsPanel);
}

// src/RulersAuthority/index.js
var { createToast } = require_toast();
var _createModules = () => ({
  _members: void 0,
  _membersResolved: false,
  _sidebar: void 0,
  _sidebarResolved: false,
  _panel: void 0,
  _panelResolved: false,
  _search: void 0,
  _searchResolved: false,
  _toolbar: void 0,
  _toolbarResolved: false,
  _icons: void 0,
  _iconsResolved: false,
  _guilds: void 0,
  _guildsResolved: false,
  _channels: void 0,
  _channelsResolved: false,
  get members() {
    if (!this._membersResolved) {
      this._members = BdApi.Webpack.getByKeys("membersWrap", "hiddenMembers") || null;
      this._membersResolved = true;
    }
    return this._members;
  },
  get sidebar() {
    if (!this._sidebarResolved) {
      this._sidebar = BdApi.Webpack.getByKeys("sidebar", "activityPanel", "sidebarListRounded") || null;
      this._sidebarResolved = true;
    }
    return this._sidebar;
  },
  get panel() {
    if (!this._panelResolved) {
      this._panel = BdApi.Webpack.getByKeys("outer", "inner", "overlay") || null;
      this._panelResolved = true;
    }
    return this._panel;
  },
  get search() {
    if (!this._searchResolved) {
      this._search = BdApi.Webpack.getByKeys("searchResultsWrap", "stillIndexing", "noResults") || null;
      this._searchResolved = true;
    }
    return this._search;
  },
  get toolbar() {
    if (!this._toolbarResolved) {
      this._toolbar = BdApi.Webpack.getByKeys("updateIconForeground", "search", "downloadArrow") || null;
      this._toolbarResolved = true;
    }
    return this._toolbar;
  },
  get icons() {
    if (!this._iconsResolved) {
      this._icons = BdApi.Webpack.getByKeys("selected", "iconWrapper", "clickable", "icon") || null;
      this._iconsResolved = true;
    }
    return this._icons;
  },
  get guilds() {
    if (!this._guildsResolved) {
      this._guilds = BdApi.Webpack.getByKeys("chatContent", "noChat", "parentChannelName") || null;
      this._guildsResolved = true;
    }
    return this._guilds;
  },
  get channels() {
    if (!this._channelsResolved) {
      this._channels = BdApi.Webpack.getByKeys("channel", "closeIcon", "dm") || null;
      this._channelsResolved = true;
    }
    return this._channels;
  }
});
var _a;
var _ttl = ((_a = _PluginUtils) == null ? void 0 : _a.createTTLCache) || ((ms) => {
  let v, t = 0;
  return { get: () => Date.now() - t < ms ? v : null, set: (x) => {
    v = x;
    t = Date.now();
  }, invalidate: () => {
    v = null;
    t = 0;
  } };
});
setPluginUtils(_PluginUtils);
function ensureGuildSettingsShape(settings) {
  if (typeof settings.guilds !== "object" || settings.guilds === null) settings.guilds = {};
}
function ensurePanelSettingsShape(settings) {
  if (!settings.panels || typeof settings.panels !== "object") {
    settings.panels = structuredClone(DEFAULT_SETTINGS.panels);
  }
  for (const [panelName, def] of Object.entries(PANEL_DEFS)) {
    if (!settings.panels[panelName] || typeof settings.panels[panelName] !== "object") {
      settings.panels[panelName] = structuredClone(DEFAULT_SETTINGS.panels[panelName] || {});
    }
    if (def.hoverCapable && typeof settings.panels[panelName].hoverExpand !== "boolean") {
      settings.panels[panelName].hoverExpand = true;
    }
  }
}
function normalizeHoverDelays(settings) {
  if (settings.hoverRevealDelayMs === 120) {
    settings.hoverRevealDelayMs = DEFAULT_SETTINGS.hoverRevealDelayMs;
  }
  if (!Number.isFinite(settings.hoverRevealDelayMs) || settings.hoverRevealDelayMs < 0) {
    settings.hoverRevealDelayMs = DEFAULT_SETTINGS.hoverRevealDelayMs;
  }
  if (!Number.isFinite(settings.hoverHideDelayMs) || settings.hoverHideDelayMs < 0) {
    settings.hoverHideDelayMs = DEFAULT_SETTINGS.hoverHideDelayMs;
  }
}
function sanitizeLoadedSettings(saved, deepMerge) {
  const settings = deepMerge(DEFAULT_SETTINGS, saved);
  if (!Array.isArray(settings.grippedDMs)) settings.grippedDMs = [];
  if (!settings.defaultWidths) settings.defaultWidths = { ...DEFAULT_SETTINGS.defaultWidths };
  ensureGuildSettingsShape(settings);
  ensurePanelSettingsShape(settings);
  normalizeHoverDelays(settings);
  return settings;
}
module.exports = class RulersAuthority {
  constructor() {
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this._amplifiedMode = false;
    this._amplifiedExpiresAt = 0;
    this._modules = null;
    this._ChannelStore = null;
    this._GuildStore = null;
    this._SelectedGuildStore = null;
    this._SelectedChannelStore = null;
    this._statsCache = _ttl(RA_STATS_CACHE_TTL);
    this._panelElCache = null;
    this._resolvedSelectors = {};
    this._controller = null;
    this._channelObserver = null;
    this._dmObserver = null;
    this._toolbarObserver = null;
    this._settingsObserver = null;
    this._iconReinjectTimeout = null;
    this._sidebarRevealTimer = null;
    this._sidebarHideTimer = null;
    this._membersRevealTimer = null;
    this._membersHideTimer = null;
    this._profileRevealTimer = null;
    this._profileHideTimer = null;
    this._channelRevealTimer = null;
    this._channelHideTimer = null;
    this._channelsHoverRevealActive = false;
    this._onSkillActivated = null;
    this._onSkillExpired = null;
    this._pushAnimTimer = null;
    this._pullAnimTimer = null;
    this._dragging = null;
    this._dragPanel = null;
    this._guildChangeHandler = null;
    this._channelChangeHandler = null;
    this._guildChangeApplyTimer = null;
    this._channelObserverRetryTimer = null;
  }
  // ── Lifecycle ──────────────────────────────────────────────
  start() {
    var _a2, _b;
    this._toast = ((_b = (_a2 = _PluginUtils) == null ? void 0 : _a2.createToastHelper) == null ? void 0 : _b.call(_a2, "rulersAuthority")) || createToast();
    try {
      this._controller = new AbortController();
      this.loadSettings();
      this.initWebpack();
      setupSettingsGuard(this);
      injectCSS(this);
      updateCSSVars(this);
      restorePanelStates(this);
      injectToolbarIcon(this);
      setupToolbarObserver(this);
      patchContextMenus(this);
      this.setupHotkeyListener();
      setupHoverHandlers(this);
      setupResizeHandlers(this);
      setupChannelObserver(this);
      setupGuildChangeListener(this);
      setupSkillTreeListeners(this);
      applyMicroStateForCurrentGuild(this);
      applyDMGripping(this);
      setupDMObserver(this);
      this._toast("Ruler's Authority \u2014 Active", "info");
    } catch (err) {
      this.debugError("Lifecycle", "Error during start:", err);
      this._toast("Ruler's Authority \u2014 Failed to start", "error");
    }
  }
  stop() {
    try {
      this._clearLifecycleTimers();
      if (this._controller) {
        this._controller.abort();
        this._controller = null;
      }
      this._resetBodyVisualState();
      BdApi.DOM.removeStyle(RA_STYLE_ID);
      BdApi.DOM.removeStyle(RA_VARS_STYLE_ID);
      const icon = document.getElementById(RA_TOOLBAR_ICON_ID);
      if (icon) icon.remove();
      const raTip = document.getElementById("sl-toolbar-tip-ra");
      if (raTip) raTip.remove();
      teardownToolbarObserver(this);
      if (this._unpatchChannelCtx) {
        this._unpatchChannelCtx();
        this._unpatchChannelCtx = null;
      }
      this._disconnectObserversAndGuards();
      this._detachSkillTreeListeners();
      this._detachStoreListeners();
      restoreAllHiddenChannels();
      restoreAllCrushedCategories();
      removeAllResizeStyles(this);
      document.body.classList.remove(RA_SETTINGS_OPEN_CLASS);
      this._resetRuntimeReferences();
    } catch (err) {
      this.debugError("Lifecycle", "Error during stop:", err);
    }
    this._toast("Ruler's Authority \u2014 Dormant", "info");
  }
  _clearLifecycleTimers() {
    const timeoutKeys = [
      "_iconReinjectTimeout",
      "_sidebarRevealTimer",
      "_sidebarHideTimer",
      "_membersRevealTimer",
      "_membersHideTimer",
      "_profileRevealTimer",
      "_profileHideTimer",
      "_channelRevealTimer",
      "_channelHideTimer",
      "_pushAnimTimer",
      "_pullAnimTimer",
      "_guildChangeApplyTimer",
      "_channelObserverRetryTimer"
    ];
    for (const key of timeoutKeys) {
      clearTimeout(this[key]);
      this[key] = null;
    }
  }
  _resetBodyVisualState() {
    for (const panelName of Object.keys(PANEL_DEFS)) {
      document.body.classList.remove(`ra-${panelName}-pushed`, `ra-${panelName}-hover-reveal`);
    }
    document.body.classList.remove("ra-amplified", "ra-pushing", "ra-pulling", "ra-channels-hover-reveal");
    this._channelsHoverRevealActive = false;
  }
  _disconnectObserversAndGuards() {
    if (this._channelObserver) {
      this._channelObserver.disconnect();
      this._channelObserver = null;
    }
    if (this._dmObserver) {
      this._dmObserver.disconnect();
      this._dmObserver = null;
    }
    if (this._settingsObserver) {
      this._settingsObserver.disconnect();
      this._settingsObserver = null;
    }
    if (this._settingsGuardInterval) {
      clearInterval(this._settingsGuardInterval);
      this._settingsGuardInterval = null;
    }
  }
  _detachSkillTreeListeners() {
    if (this._onSkillActivated) {
      document.removeEventListener("SkillTree:activeSkillActivated", this._onSkillActivated);
      this._onSkillActivated = null;
    }
    if (this._onSkillExpired) {
      document.removeEventListener("SkillTree:activeSkillExpired", this._onSkillExpired);
      this._onSkillExpired = null;
    }
  }
  _detachStoreListeners() {
    if (this._guildChangeHandler && this._SelectedGuildStore) {
      this._SelectedGuildStore.removeChangeListener(this._guildChangeHandler);
      this._guildChangeHandler = null;
    }
    if (this._channelChangeHandler && this._SelectedChannelStore) {
      this._SelectedChannelStore.removeChangeListener(this._channelChangeHandler);
      this._channelChangeHandler = null;
    }
  }
  _resetRuntimeReferences() {
    this._ChannelStore = null;
    this._GuildStore = null;
    this._SelectedGuildStore = null;
    this._SelectedChannelStore = null;
    this._statsCache.invalidate();
    this._modules = null;
    this._resolvedSelectors = {};
    this._dragging = null;
    this._dragPanel = null;
  }
  // ═══════════════════════════════════════════════════════════════════════
  // §6  Webpack Init + Dynamic Selectors
  // ═══════════════════════════════════════════════════════════════════════
  initWebpack() {
    const { Webpack } = BdApi;
    this._ChannelStore = Webpack.getStore("ChannelStore");
    this._GuildStore = Webpack.getStore("GuildStore");
    this._SelectedGuildStore = Webpack.getStore("SelectedGuildStore");
    this._SelectedChannelStore = Webpack.getStore("SelectedChannelStore");
    this._modules = _createModules();
    this._builtCSS = null;
    this._buildResolvedSelectors();
    this.debugLog("Webpack", "Modules acquired", {
      stores: {
        ChannelStore: !!this._ChannelStore,
        GuildStore: !!this._GuildStore,
        SelectedGuildStore: !!this._SelectedGuildStore,
        SelectedChannelStore: !!this._SelectedChannelStore
      },
      cssModules: {
        members: !!this._modules.members,
        sidebar: !!this._modules.sidebar,
        panel: !!this._modules.panel,
        search: !!this._modules.search,
        toolbar: !!this._modules.toolbar,
        icons: !!this._modules.icons,
        guilds: !!this._modules.guilds
      }
    });
  }
  _buildResolvedSelectors() {
    var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const m = this._modules;
    this._resolvedSelectors = {
      sidebar: ((_a2 = m.sidebar) == null ? void 0 : _a2.sidebarList) ? [`.${m.sidebar.sidebarList}`] : SIDEBAR_FALLBACKS,
      members: ((_b = m.members) == null ? void 0 : _b.membersWrap) ? [`.${m.members.membersWrap}`] : MEMBERS_FALLBACKS,
      profile: ((_c = m.panel) == null ? void 0 : _c.outer) ? [
        ...((_d = m.guilds) == null ? void 0 : _d.content) ? [`.${m.guilds.content} .${m.panel.outer}`] : [],
        `.${m.panel.outer}`
      ] : PROFILE_FALLBACKS,
      search: ((_e = m.search) == null ? void 0 : _e.searchResultsWrap) ? [`.${m.search.searchResultsWrap}`] : SEARCH_FALLBACKS,
      toolbar: ((_f = m.icons) == null ? void 0 : _f.toolbar) ? [`.${m.icons.toolbar}`] : TOOLBAR_FALLBACKS,
      dmList: DM_LIST_FALLBACKS
      // DM list doesn't change often, keep fallbacks
    };
    this.debugLog("Selectors", "Resolved selectors", {
      sidebar: ((_g = m.sidebar) == null ? void 0 : _g.sidebarList) ? "webpack" : "fallback",
      members: ((_h = m.members) == null ? void 0 : _h.membersWrap) ? "webpack" : "fallback",
      profile: ((_i = m.panel) == null ? void 0 : _i.outer) ? "webpack" : "fallback",
      search: ((_j = m.search) == null ? void 0 : _j.searchResultsWrap) ? "webpack" : "fallback",
      toolbar: ((_k = m.icons) == null ? void 0 : _k.toolbar) ? "webpack" : "fallback"
    });
  }
  // Find a DOM element using resolved selectors for a panel
  // PERF: Caches element refs — panel elements rarely change (only on guild/channel switch).
  _findPanelElement(panelName) {
    var _a2;
    const cached = (_a2 = this._panelElCache) == null ? void 0 : _a2[panelName];
    if (cached && cached.isConnected) return cached;
    const selectors = this._resolvedSelectors[panelName];
    if (!selectors) return null;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.isConnected) {
        if (!this._panelElCache) this._panelElCache = {};
        this._panelElCache[panelName] = el;
        return el;
      }
    }
    if (this._panelElCache) this._panelElCache[panelName] = null;
    return null;
  }
  // ── Delegated methods (call module functions with `this` context) ──
  togglePanel(panelName) {
    togglePanel(this, panelName);
  }
  updateCSSVars() {
    updateCSSVars(this);
  }
  updateToolbarIcon() {
    updateToolbarIcon(this);
  }
  setupHotkeyListener() {
    if (!this._controller) return;
    document.addEventListener("keydown", (e) => {
      if (isEditableTarget(e.target)) return;
      for (const [panelName, config] of Object.entries(this.settings.panels)) {
        if (config.hotkey && matchesHotkey(e, config.hotkey)) {
          e.preventDefault();
          e.stopPropagation();
          togglePanel(this, panelName);
          return;
        }
      }
    }, { capture: true, signal: this._controller.signal });
  }
  getSettingsPanel() {
    return getSettingsPanel(this);
  }
  // ═══════════════════════════════════════════════════════════════════════
  // §18  Utilities
  // ═══════════════════════════════════════════════════════════════════════
  loadSettings() {
    try {
      const saved = BdApi.Data.load(RA_PLUGIN_NAME, "settings") || {};
      this.settings = sanitizeLoadedSettings(saved, this._deepMerge.bind(this));
    } catch (_) {
      this.settings = structuredClone(DEFAULT_SETTINGS);
    }
  }
  saveSettings() {
    try {
      BdApi.Data.save(RA_PLUGIN_NAME, "settings", this.settings);
    } catch (err) {
      this.debugError("Settings", "Failed to save:", err);
    }
  }
  // ── DOM Helpers ──
  _findElement(selectorArray) {
    for (const selector of selectorArray) {
      const el = document.querySelector(selector);
      if (el && el.isConnected) return el;
    }
    return null;
  }
  _isInsideElement(mouseEvent, element, fudgePx = 0) {
    const rect = element.getBoundingClientRect();
    return mouseEvent.clientX >= rect.left - fudgePx && mouseEvent.clientX <= rect.right + fudgePx && mouseEvent.clientY >= rect.top - fudgePx && mouseEvent.clientY <= rect.bottom + fudgePx;
  }
  // ── General Helpers ──
  _throttle(fn, wait) {
    var _a2;
    if ((_a2 = _PluginUtils) == null ? void 0 : _a2.createThrottle) return _PluginUtils.createThrottle(fn, wait);
    let lastTime = 0;
    let timer = null;
    return function(...args) {
      const now = Date.now();
      const remaining = wait - (now - lastTime);
      if (remaining <= 0) {
        clearTimeout(timer);
        timer = null;
        lastTime = now;
        fn(...args);
      } else if (!timer) {
        timer = setTimeout(() => {
          lastTime = Date.now();
          timer = null;
          fn(...args);
        }, remaining);
      }
    };
  }
  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
        result[key] = this._deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
  debugLog(tag, msg, data) {
    if (!this.settings.debugMode) return;
    console.log(`[${RA_PLUGIN_NAME}][${tag}]`, msg, data || "");
  }
  debugError(tag, msg, err) {
    console.error(`[${RA_PLUGIN_NAME}][${tag}]`, msg, err || "");
  }
};
