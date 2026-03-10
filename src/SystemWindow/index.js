import STYLES from "./styles.css";
const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");

/**
 * TABLE OF CONTENTS
 * 1) Lifecycle
 * 2) Observer + Classification
 * 3) Message Classification
 * 4) Settings
 */

let _PluginUtils;
try { _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

const SW_POS_CLASSES = ["sw-group-solo", "sw-group-start", "sw-group-middle", "sw-group-end"];

module.exports = class SystemWindow {
  constructor() {
    this._STYLE_ID = "system-window-css";
    this._defaultSettings = {
      enabled: true,
      debugMode: false,
    };
    this.settings = structuredClone(this._defaultSettings);
    this._observer = null;
    this._pollInterval = null;
    this._throttleTimer = null;
    this._lastScrollerEl = null;
    this._classifyRAF = null;
    this._classifyVersion = 0;
    this._started = false;
  }

  /* ═══════════════════════════════════════════════
     §1  Lifecycle
     ═══════════════════════════════════════════════ */

  start() {
    if (this._started) {
      this.stop();
    }

    this._toast = _PluginUtils?.createToastHelper?.("systemWindow") || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
    this.settings = {
      ...this._defaultSettings,
      ...(BdApi.Data.load("SystemWindow", "settings") || {}),
    };
    // Cache store refs + current user ID for self-message detection (purple vs blue)
    try {
      this._UserStore = BdApi.Webpack.getStore("UserStore");
      this._currentUserId = this._UserStore?.getCurrentUser()?.id || null;
    } catch (e) {
      this._UserStore = null;
      this._currentUserId = null;
    }
    if (this.settings.enabled) {
      this._injectCSS();
      this._attachObserver();
    }
    this._started = true;
    this._toast("SystemWindow active", "success", 2000);
  }

  stop() {
    BdApi.DOM.removeStyle(this._STYLE_ID);
    this._detachObserver();
    this._cleanupClasses();
    this._currentUserId = null;
    this._started = false;
  }

  /* ═══════════════════════════════════════════════
     §2  Observer — Classify message groups
     ═══════════════════════════════════════════════ */

  _attachObserver() {
    this._detachObserver();
    this._findAndObserve();

    // PERF(P5-1): Use shared NavigationBus instead of independent pushState wrapper
    if (_PluginUtils?.NavigationBus) {
      this._navBusUnsub = _PluginUtils.NavigationBus.subscribe(() => this._checkChannelSwitch());
    }

    // Safety-net fallback: 10s poll
    this._pollInterval = setInterval(() => {
      if (document.hidden) return;
      this._checkChannelSwitch();
    }, 10000);
  }

  _checkChannelSwitch() {
    // Detect account switch — invalidate cached self-flags
    try {
      const currentId = this._UserStore?.getCurrentUser()?.id || null;
      if (currentId && currentId !== this._currentUserId) {
        this._currentUserId = currentId;
        document.querySelectorAll('div[role="article"][data-sw-self]')
          .forEach((el) => el.removeAttribute('data-sw-self'));
      }
    } catch (_) {}

    const scroller = document.querySelector('ol[role="list"][class*="scrollerInner_"]');
    if (!scroller) return;
    if (scroller !== this._lastScrollerEl) {
      this._lastScrollerEl = scroller;
      this._observeScroller(scroller);
      this._classifyMessages();
      if (this.settings.debugMode) {
        console.log("[SystemWindow] Channel switch detected — re-classified");
      }
    }
  }

  _findAndObserve(retryCount = 0) {
    const scroller = document.querySelector('ol[role="list"][class*="scrollerInner_"]');
    if (scroller) {
      this._lastScrollerEl = scroller;
      this._observeScroller(scroller);
      this._classifyMessages();
    } else if (retryCount < 10) {
      this._findRetryTimer = setTimeout(() => {
        if (this.settings.enabled) this._findAndObserve(retryCount + 1);
      }, 2000);
    }
  }

  _observeScroller(scroller) {
    if (this._observer) this._observer.disconnect();
    this._observer = new MutationObserver(() => this._throttledClassify());
    this._observer.observe(scroller, { childList: true });
  }

  _detachObserver() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    if (this._findRetryTimer) {
      clearTimeout(this._findRetryTimer);
      this._findRetryTimer = null;
    }
    if (this._navBusUnsub) {
      this._navBusUnsub();
      this._navBusUnsub = null;
    }
    if (this._classifyRAF) {
      cancelAnimationFrame(this._classifyRAF);
      this._classifyRAF = null;
    }
    clearTimeout(this._throttleTimer);
    this._throttleTimer = null;
    this._lastScrollerEl = null;
  }

  _throttledClassify() {
    if (this._throttleTimer) return;
    this._throttleTimer = setTimeout(() => {
      this._throttleTimer = null;
      if (this._classifyRAF) cancelAnimationFrame(this._classifyRAF);
      this._classifyRAF = requestAnimationFrame(() => {
        this._classifyRAF = null;
        this._classifyMessages();
      });
    }, 150);
  }

  /* ═══════════════════════════════════════════════
     §3  Message Classification
     ═══════════════════════════════════════════════ */

  _getGroupSelfFlag(firstArticle) {
    if (firstArticle.hasAttribute('data-sw-self')) {
      return firstArticle.getAttribute('data-sw-self') === '1';
    }
    const isSelf = this._isOwnMessage(firstArticle);
    firstArticle.setAttribute('data-sw-self', isSelf ? '1' : '0');
    return isSelf;
  }

  _getDesiredGroupPosition(groupSize, index) {
    if (groupSize === 1) return "sw-group-solo";
    if (index === 0) return "sw-group-start";
    if (index === groupSize - 1) return "sw-group-end";
    return "sw-group-middle";
  }

  _syncPositionClass(li, desiredPos) {
    if (li.classList.contains(desiredPos)) return;
    li.classList.add(desiredPos);
    for (const cls of SW_POS_CLASSES) {
      if (cls !== desiredPos) li.classList.remove(cls);
    }
  }

  _syncToggleClass(li, className, shouldHave) {
    if (shouldHave) li.classList.add(className);
    else li.classList.remove(className);
  }

  _applyGroupClasses(li, desiredPos, wantSelf, wantMentioned) {
    const hasPos = li.classList.contains(desiredPos);
    const hasSelf = li.classList.contains("sw-self");
    const hasMentioned = li.classList.contains("sw-mentioned");

    if (hasPos && hasSelf === wantSelf && hasMentioned === wantMentioned) return;

    this._syncPositionClass(li, desiredPos);
    this._syncToggleClass(li, "sw-self", wantSelf);
    this._syncToggleClass(li, "sw-mentioned", wantMentioned);
  }

  _classifyGroup(group) {
    if (!group.length) return;

    const isSelf = this._getGroupSelfFlag(group[0].article);
    const groupSize = group.length;

    for (let i = 0; i < groupSize; i++) {
      const { li, article } = group[i];
      const desiredPos = this._getDesiredGroupPosition(groupSize, i);
      const wantMentioned = article.className.includes("mentioned");
      this._applyGroupClasses(li, desiredPos, isSelf, wantMentioned);
    }
  }

  _classifyMessages() {
    const scroller =
      this._lastScrollerEl ||
      document.querySelector('ol[role="list"][class*="scrollerInner_"]');
    if (!scroller) return;

    const items = scroller.querySelectorAll(':scope > li[class*="messageListItem_"]');
    if (!items.length) return;

    // Bump version — only re-classify groups that contain new/changed items
    this._classifyVersion = (this._classifyVersion || 0) + 1;
    const ver = String(this._classifyVersion);

    let groupCount = 0;
    let currentGroup = [];
    let groupHasNew = false;

    const flushGroup = () => {
      if (!currentGroup.length) return;
      // Only re-classify if any item in the group is new/unversioned
      if (groupHasNew) {
        this._classifyGroup(currentGroup);
        for (const { li } of currentGroup) {
          li.dataset.swVer = ver;
        }
      }
      groupCount++;
      currentGroup = [];
      groupHasNew = false;
    };

    for (const li of items) {
      const article = li.querySelector(':scope > div[role="article"]');
      if (!article) {
        flushGroup();
        continue;
      }

      const isGroupStart = article.className.includes('groupStart');
      if (isGroupStart) flushGroup();

      if (li.dataset.swVer !== ver) groupHasNew = true;
      currentGroup.push({ li, article });
    }

    flushGroup();

    if (this.settings.debugMode) {
      console.log(`[SystemWindow] Classified ${items.length} messages into ${groupCount} groups (v${ver})`);
    }
  }

  _isOwnMessage(article) {
    if (!this._currentUserId || !article) return false;
    try {
      let fiber = BdApi.ReactUtils.getInternalInstance(article);
      for (let i = 0; i < 8 && fiber; i++) {
        const authorId =
          fiber.memoizedProps?.message?.author?.id ||
          fiber.memoizedState?.message?.author?.id;
        if (authorId) return authorId === this._currentUserId;
        fiber = fiber.return;
      }
    } catch (e) {}
    return false;
  }

  _cleanupClasses() {
    document
      .querySelectorAll(".sw-group-solo, .sw-group-start, .sw-group-middle, .sw-group-end, .sw-self, .sw-mentioned")
      .forEach((el) =>
        el.classList.remove("sw-group-solo", "sw-group-start", "sw-group-middle", "sw-group-end", "sw-self", "sw-mentioned"),
      );
    document
      .querySelectorAll('div[role="article"][data-sw-self]')
      .forEach((el) => el.removeAttribute('data-sw-self'));
    document
      .querySelectorAll('li[data-sw-ver]')
      .forEach((el) => delete el.dataset.swVer);
  }

  /* ═══════════════════════════════════════════════
     §4  CSS Injection
     ═══════════════════════════════════════════════ */

  _injectCSS() {
    BdApi.DOM.removeStyle(this._STYLE_ID);
    BdApi.DOM.addStyle(this._STYLE_ID, STYLES);
  }

  /* ═══════════════════════════════════════════════
     §5  Settings
     ═══════════════════════════════════════════════ */

  _saveSettings(next) {
    const merged = { ...this.settings, ...next };
    BdApi.Data.save("SystemWindow", "settings", merged);
    this.settings = merged;
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.cssText = "padding: 16px; background: #1e1e2e; border-radius: 0;";

    panel.innerHTML = `
      <div>
        <h2 style="margin: 0 0 4px 0; color: #dcddde; font-size: 18px;">SystemWindow</h2>
        <p style="margin: 0 0 16px 0; opacity: 0.6; font-size: 12px; color: #dcddde;">
          Codeblock-style message display with SL theming
        </p>
      </div>

      <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
        <label style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input id="sw-enabled" type="checkbox" ${this.settings.enabled ? "checked" : ""} />
          <span style="color: #dcddde;">Enabled</span>
        </label>

        <label style="display: flex; gap: 10px; align-items: center; cursor: pointer;">
          <input id="sw-debug" type="checkbox" ${this.settings.debugMode ? "checked" : ""} />
          <span style="color: #dcddde;">Debug Mode</span>
        </label>
      </div>
    `;

    panel.querySelector("#sw-enabled")?.addEventListener("change", (e) => {
      this._saveSettings({ enabled: e.target.checked });
      if (e.target.checked) {
        this._injectCSS();
        this._attachObserver();
      } else {
        BdApi.DOM.removeStyle(this._STYLE_ID);
        this._detachObserver();
        this._cleanupClasses();
      }
    });

    panel.querySelector("#sw-debug")?.addEventListener("change", (e) => {
      this._saveSettings({ debugMode: e.target.checked });
    });

    return panel;
  }
};
