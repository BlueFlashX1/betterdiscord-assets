const { buildCSS } = require("./build-styles");
const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const { createToast } = require("../shared/toast");
const { loadSettings, saveSettings } = require("../shared/settings");

// HARDCODED wildcard selectors — bypass dc.sel for the two runtime queries
// that matter most. Discord (2026-05) ships double-underscore class hashes
// like `messageListItem__5126c`. Webpack getByKeys can return a STALE
// single-underscore module if multiple modules export the same key, in
// which case dc.sel.messageListItem resolves to `.messageListItem_oldhash`
// and our `:scope > li${dc.sel.messageListItem}` query matches nothing.
// Substring attribute-selectors are immune — they match both old (single
// underscore) and new (double underscore) hashes uniformly.
const SCROLLER_SELECTOR  = '[role="list"][class*="scrollerInner_"]';
const MSG_LI_SELECTOR    = 'li[class*="messageListItem_"]';

/**
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
    this._selChannelStore = null;
    this._selChannelListener = null;
    this._userListener = null;
    this._throttleTimer = null;
    this._lastScrollerEl = null;
    this._classifyRAF = null;
    this._classifyVersion = 1;
    this._started = false;
    // PERF: cache the <article> element per <li> so re-classify passes during
    // scroll skip the querySelector. WeakMap => entries GC with the LI, no leak.
    this._articleCache = new WeakMap();
    this._onVisibility = null;
  }

  /* ═══════════════════════════════════════════════
     §1  Lifecycle
     ═══════════════════════════════════════════════ */

  start() {
    if (this._started) {
      this.stop();
    }

    this._toast = _PluginUtils?.createToastHelper?.("systemWindow") || createToast();
    this.settings = loadSettings("SystemWindow", this._defaultSettings);
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

    // Direct Webpack store subscriptions — replaces the prior 10s safety-net
    // poll. SelectedChannelStore.addChangeListener fires on every
    // channel/DM/thread switch, UserStore.addChangeListener fires on
    // account switch. Both are pure event-driven and don't require
    // BetterDiscordPluginUtils to be installed. Idle cost between
    // navigation events is now zero.
    try {
      const SelectedChannelStore = BdApi.Webpack.getStore?.("SelectedChannelStore");
      if (SelectedChannelStore && typeof SelectedChannelStore.addChangeListener === "function") {
        this._selChannelListener = () => this._checkChannelSwitch();
        SelectedChannelStore.addChangeListener(this._selChannelListener);
        this._selChannelStore = SelectedChannelStore;
      }
      if (this._UserStore && typeof this._UserStore.addChangeListener === "function") {
        this._userListener = () => this._checkChannelSwitch();
        this._UserStore.addChangeListener(this._userListener);
      }
    } catch (_) {}

    // PERF: stop the classify hot-path entirely while the window is hidden
    // (minimized / occluded). The MutationObserver may still fire on
    // background message renders, but _throttledClassify early-returns, so no
    // querySelectorAll/classList work runs. On return to foreground we force
    // one full re-classify to catch up on anything that arrived while hidden.
    this._onVisibility = () => {
      if (!document.hidden) {
        this._classifyVersion += 1;
        this._classifyMessages();
      }
    };
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  _checkChannelSwitch() {
    // Detect account switch — invalidate cached self-flags
    try {
      const currentId = this._UserStore?.getCurrentUser()?.id || null;
      if (currentId && currentId !== this._currentUserId) {
        this._currentUserId = currentId;
        document.querySelectorAll('div[role="article"][data-sw-self]')
          .forEach((el) => el.removeAttribute('data-sw-self'));
        // Force one full re-classify so self-message classes refresh under new account.
        this._classifyVersion += 1;
        this._classifyMessages();
      }
    } catch (_) {}

    const scroller = document.querySelector(SCROLLER_SELECTOR);
    if (!scroller) return;
    if (scroller !== this._lastScrollerEl) {
      this._lastScrollerEl = scroller;
      // New channel/scroller => force a full pass once, then incremental updates.
      this._classifyVersion += 1;
      this._observeScroller(scroller);
      this._classifyMessages();
      if (this.settings.debugMode) {
        console.log("[SystemWindow] Channel switch detected — re-classified");
      }
    }
  }

  _findAndObserve(retryCount = 0) {
    const scroller = document.querySelector(SCROLLER_SELECTOR);
    if (scroller) {
      this._lastScrollerEl = scroller;
      this._classifyVersion += 1;
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
    if (this._selChannelStore && this._selChannelListener) {
      try { this._selChannelStore.removeChangeListener(this._selChannelListener); } catch (_) {}
      this._selChannelStore = null;
      this._selChannelListener = null;
    }
    if (this._UserStore && this._userListener) {
      try { this._UserStore.removeChangeListener(this._userListener); } catch (_) {}
      this._userListener = null;
    }
    if (this._findRetryTimer) {
      clearTimeout(this._findRetryTimer);
      this._findRetryTimer = null;
    }
    if (this._navBusUnsub) {
      this._navBusUnsub();
      this._navBusUnsub = null;
    }
    if (this._onVisibility) {
      document.removeEventListener("visibilitychange", this._onVisibility);
      this._onVisibility = null;
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
    if (document.hidden) return; // PERF: no classify work while backgrounded
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

  /**
   * Walk the React fiber attached to a message <article> to read its
   * `message.author.id`. Cached on the element via data-sw-author so
   * subsequent classify passes are O(1). Empty-string attribute value
   * is the "looked up, fiber yielded nothing" sentinel.
   *
   * Author identity is the SOURCE OF TRUTH for grouping. Discord's
   * `groupStart_` className is treated as a fallback only — they have
   * a habit of either renaming the suffix or applying it to every
   * article (observed 2026-05 with the new `groupStart__5126c`
   * double-underscore hash format that lands on every message, not
   * just true group-starts), which historically caused every message
   * to be classified as its own solo group.
   */
  _getAuthorId(article) {
    if (!article) return null;
    if (article.hasAttribute('data-sw-author')) {
      const v = article.getAttribute('data-sw-author');
      return v === '' ? null : v;
    }
    let authorId = null;
    try {
      let fiber = BdApi.ReactUtils.getInternalInstance(article);
      for (let i = 0; i < 8 && fiber; i++) {
        const found =
          fiber.memoizedProps?.message?.author?.id ||
          fiber.memoizedState?.message?.author?.id;
        if (found) { authorId = found; break; }
        fiber = fiber.return;
      }
    } catch (_) {}
    article.setAttribute('data-sw-author', authorId || '');
    return authorId;
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
      document.querySelector(SCROLLER_SELECTOR);
    if (!scroller) return;

    // `:scope > ...` requires the LI to be a DIRECT child of the scroller.
    // If Discord re-wraps in a future build, fall back to descendant search.
    let items = scroller.querySelectorAll(`:scope > ${MSG_LI_SELECTOR}`);
    if (!items.length) items = scroller.querySelectorAll(MSG_LI_SELECTOR);
    if (!items.length) return;

    const ver = String(this._classifyVersion || 1);

    let groupCount = 0;
    let currentGroup = [];
    let groupHasNew = false;
    let prevAuthorId = null;

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
      // Tolerant article query: prefer direct child, fall back to any
      // descendant. Discord occasionally re-wraps the <article> one
      // level deeper during render.
      let article = this._articleCache.get(li);
      if (!article || !li.contains(article)) {
        article =
          li.querySelector(':scope > div[role="article"]') ||
          li.querySelector('div[role="article"]');
        if (article) this._articleCache.set(li, article);
      }
      if (!article) {
        flushGroup();
        prevAuthorId = null;
        continue;
      }

      const authorId = this._getAuthorId(article);

      // Boundary detection.
      //   PRIMARY: author identity from React fiber. Two consecutive
      //     messages share a group iff their authors match — immune to
      //     Discord renaming `groupStart_` or applying it to every
      //     article (the 2026-05 regression).
      //   FALLBACK: Discord's `groupStart` className substring. Used
      //     only when fiber lookup yields nothing (transient render
      //     state). Worst case under fallback is the original behaviour.
      let isBoundary;
      if (prevAuthorId !== null && authorId !== null) {
        isBoundary = authorId !== prevAuthorId;
      } else {
        isBoundary = article.className.includes('groupStart');
      }
      if (isBoundary) flushGroup();

      if (li.dataset.swVer !== ver) groupHasNew = true;
      currentGroup.push({ li, article });
      if (authorId !== null) prevAuthorId = authorId;
    }

    flushGroup();

    if (this.settings.debugMode) {
      console.log(`[SystemWindow] Classified ${items.length} messages into ${groupCount} groups (v${ver})`);
    }
  }

  _isOwnMessage(article) {
    if (!this._currentUserId || !article) return false;
    return this._getAuthorId(article) === this._currentUserId;
  }

  _cleanupClasses() {
    document
      .querySelectorAll(".sw-group-solo, .sw-group-start, .sw-group-middle, .sw-group-end, .sw-self, .sw-mentioned")
      .forEach((el) =>
        el.classList.remove("sw-group-solo", "sw-group-start", "sw-group-middle", "sw-group-end", "sw-self", "sw-mentioned"),
      );
    document
      .querySelectorAll('div[role="article"][data-sw-self], div[role="article"][data-sw-author]')
      .forEach((el) => {
        el.removeAttribute('data-sw-self');
        el.removeAttribute('data-sw-author');
      });
    document
      .querySelectorAll('li[data-sw-ver]')
      .forEach((el) => delete el.dataset.swVer);
  }

  /* ═══════════════════════════════════════════════
     §4  CSS Injection
     ═══════════════════════════════════════════════ */

  _injectCSS() {
    BdApi.DOM.removeStyle(this._STYLE_ID);
    BdApi.DOM.addStyle(this._STYLE_ID, buildCSS());
  }

  /* ═══════════════════════════════════════════════
     §5  Settings
     ═══════════════════════════════════════════════ */

  _saveSettings(next) {
    const merged = { ...this.settings, ...next };
    saveSettings("SystemWindow", merged);
    this.settings = merged;
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.cssText = "padding: 16px; background: rgba(10, 10, 16, 0.98); border-radius: 2px;";

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
