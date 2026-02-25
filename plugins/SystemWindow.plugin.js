/**
 * @name SystemWindow
 * @author BlueFlashX1
 * @description Styles Discord messages as Solo Leveling System windows — codeblock-style grouped containers. Purple for your messages (Monarch), blue for others (System).
 * @version 2.6.0
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 */

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }

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
    this._nearViewport = new Set();
    this._visibilityObserver = null;
  }

  /* ═══════════════════════════════════════════════
     §1  Lifecycle
     ═══════════════════════════════════════════════ */

  start() {
    this.settings = {
      ...this._defaultSettings,
      ...(BdApi.Data.load("SystemWindow", "settings") || {}),
    };
    // Cache current user ID for self-message detection (purple vs blue)
    try {
      this._currentUserId = BdApi.Webpack.getStore("UserStore")?.getCurrentUser()?.id || null;
    } catch (e) {
      this._currentUserId = null;
    }
    if (this.settings.enabled) {
      this._injectCSS();
      this._attachObserver();
    }
    BdApi.UI.showToast("SystemWindow active", { type: "success", timeout: 2000 });
  }

  stop() {
    BdApi.DOM.removeStyle(this._STYLE_ID);
    this._detachObserver();
    this._cleanupClasses();
    this._currentUserId = null;
  }

  /* ═══════════════════════════════════════════════
     §2  Observer — Classify message groups
     ═══════════════════════════════════════════════

     Two mechanisms:
     1. Scroller observer (childList) — catches new messages,
        deletions, edits in the current channel
     2. Poll (1s interval) — catches channel switches by
        detecting scroller element replacement. More reliable
        than watching chatContent_ which may itself be replaced.
     ═══════════════════════════════════════════════ */

  _attachObserver() {
    // Immediately find and observe the current scroller
    this._findAndObserve();

    // ── Event-driven channel detection (replaces 1s poll) ──
    // PERF(P5-1): Use shared NavigationBus instead of independent pushState wrapper
    if (_PluginUtils?.NavigationBus) {
      this._navBusUnsub = _PluginUtils.NavigationBus.subscribe(() => this._checkChannelSwitch());
    }

    // Safety-net fallback: 10s poll (catches edge cases the events miss)
    this._pollInterval = setInterval(() => {
      if (document.hidden) return;
      this._checkChannelSwitch();
    }, 10000);
  }

  /** Check if scroller element changed (channel switch) */
  _checkChannelSwitch() {
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
      // Discord hasn't loaded yet — retry (max 10 attempts = 20s)
      this._findRetryTimer = setTimeout(() => {
        if (this.settings.enabled) this._findAndObserve(retryCount + 1);
      }, 2000);
    }
  }

  _observeScroller(scroller) {
    if (this._observer) this._observer.disconnect();

    // ── Visibility tracker: only classify messages near the viewport ──
    // Prevents freezing when teleporting to old messages (200+ items).
    // Off-screen messages keep the CSS pre-style (individual blue codeblocks).
    this._nearViewport.clear();
    if (this._visibilityObserver) this._visibilityObserver.disconnect();
    const scrollRoot = scroller.closest('[class*="scroller_"]') || scroller.parentElement;
    this._visibilityObserver = new IntersectionObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!this._nearViewport.has(entry.target)) {
            this._nearViewport.add(entry.target);
            changed = true;
          }
        } else {
          if (this._nearViewport.delete(entry.target)) changed = true;
        }
      }
      // New items scrolled into view — re-classify to apply grouping
      if (changed) this._throttledClassify();
    }, {
      root: scrollRoot,
      rootMargin: '600px 0px', // classify 600px above/below viewport
    });

    // Observe existing LIs
    for (const li of scroller.querySelectorAll(':scope > li[class*="messageListItem_"]')) {
      this._visibilityObserver.observe(li);
    }

    // MutationObserver: watch for new/removed LIs
    this._observer = new MutationObserver((mutations) => {
      // Track new LIs with the visibility observer
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && node.matches?.('li[class*="messageListItem_"]')) {
            this._visibilityObserver?.observe(node);
          }
        }
      }
      this._throttledClassify();
    });
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
    // PERF(P5-1): Unsubscribe from shared NavigationBus
    if (this._navBusUnsub) {
      this._navBusUnsub();
      this._navBusUnsub = null;
    }
    if (this._visibilityObserver) {
      this._visibilityObserver.disconnect();
      this._visibilityObserver = null;
    }
    this._nearViewport.clear();
    clearTimeout(this._throttleTimer);
    this._throttleTimer = null;
    this._lastScrollerEl = null;
  }

  _throttledClassify() {
    if (this._throttleTimer) return;
    this._throttleTimer = setTimeout(() => {
      this._throttleTimer = null;
      this._classifyMessages();
    }, 150);
  }

  /* ═══════════════════════════════════════════════
     §3  Message Classification
     ═══════════════════════════════════════════════

     Walks the message list and assigns CSS classes to LI:
       sw-group-solo   — single message, own group
       sw-group-start  — first in a consecutive group
       sw-group-middle — middle of a consecutive group
       sw-group-end    — last in a consecutive group
       sw-self         — message sent by current user
     ═══════════════════════════════════════════════ */

  _classifyMessages() {
    const scroller =
      this._lastScrollerEl ||
      document.querySelector('ol[role="list"][class*="scrollerInner_"]');
    if (!scroller) return;

    const items = scroller.querySelectorAll(':scope > li[class*="messageListItem_"]');
    if (!items.length) return;

    // Build groups using Discord's groupStart_ class as boundary
    const groups = [];
    let currentGroup = [];

    for (const li of items) {
      const article = li.querySelector(':scope > div[role="article"]');
      if (!article) {
        // Non-message element (date divider, unread bar, etc.)
        if (currentGroup.length) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        continue;
      }

      const isGroupStart = /\bgroupStart/.test(article.className);

      if (isGroupStart && currentGroup.length) {
        groups.push(currentGroup);
        currentGroup = [];
      }

      currentGroup.push({ li, article });
    }

    if (currentGroup.length) groups.push(currentGroup);

    // ── Non-destructive class application ──
    // Only touch elements that actually need changes. For position
    // swaps (e.g. solo→start when a new msg joins a group), add
    // the new class BEFORE removing the old one so there's never
    // a classless frame that causes a visual flash.

    const SW_POS_CLASSES = ["sw-group-solo", "sw-group-start", "sw-group-middle", "sw-group-end"];
    let classifiedCount = 0;

    for (const group of groups) {
      // PERF: Skip groups entirely if no item is near the viewport.
      // Off-screen messages keep the CSS pre-style (individual blue codeblocks).
      const hasVisible = group.some(({ li }) => this._nearViewport.has(li));
      if (!hasVisible) continue;

      // Cached _isOwnMessage: Fiber walk once per article element, ever.
      const firstArt = group[0].article;
      let isSelf;
      if (firstArt.hasAttribute('data-sw-self')) {
        isSelf = firstArt.getAttribute('data-sw-self') === '1';
      } else {
        isSelf = this._isOwnMessage(firstArt);
        firstArt.setAttribute('data-sw-self', isSelf ? '1' : '0');
      }

      for (let i = 0; i < group.length; i++) {
        const { li, article: art } = group[i];

        // Only write classes for items near the viewport
        if (!this._nearViewport.has(li)) continue;

        // Compute desired position class
        let desiredPos;
        if (group.length === 1) {
          desiredPos = "sw-group-solo";
        } else if (i === 0) {
          desiredPos = "sw-group-start";
        } else if (i === group.length - 1) {
          desiredPos = "sw-group-end";
        } else {
          desiredPos = "sw-group-middle";
        }

        // Compute desired modifier classes
        const wantSelf = isSelf;
        const wantMentioned = /\bmentioned/.test(art.className);

        // Skip entirely if this element already has the correct state
        const hasPos = li.classList.contains(desiredPos);
        const hasSelf = li.classList.contains("sw-self");
        const hasMentioned = li.classList.contains("sw-mentioned");

        if (hasPos && hasSelf === wantSelf && hasMentioned === wantMentioned) {
          continue; // Nothing to do — skip this element entirely
        }

        // Position class: ADD first, THEN remove old — never classless
        if (!hasPos) {
          li.classList.add(desiredPos);
          for (const cls of SW_POS_CLASSES) {
            if (cls !== desiredPos) li.classList.remove(cls);
          }
        }

        // Reconcile modifier classes (no-op if already correct)
        if (wantSelf && !hasSelf) li.classList.add("sw-self");
        else if (!wantSelf && hasSelf) li.classList.remove("sw-self");

        if (wantMentioned && !hasMentioned) li.classList.add("sw-mentioned");
        else if (!wantMentioned && hasMentioned) li.classList.remove("sw-mentioned");
        classifiedCount++;
      }
    }

    if (this.settings.debugMode) {
      console.log(`[SystemWindow] Classified ${classifiedCount}/${items.length} messages (${groups.length} groups, ${this._nearViewport.size} near viewport)`);
    }
  }

  /**
   * Checks if a message article belongs to the current user via React fiber.
   * Walks up fiber tree (max 15 levels) looking for message.author.id.
   */
  _isOwnMessage(article) {
    if (!this._currentUserId || !article) return false;
    try {
      let fiber = BdApi.ReactUtils.getInternalInstance(article);
      for (let i = 0; i < 15 && fiber; i++) {
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
  }

  /* ═══════════════════════════════════════════════
     §4  CSS
     ═══════════════════════════════════════════════

     v2.5.0: Styles the LI element directly (not the
     child article). This ensures the codeblock visually
     wraps EVERYTHING — avatar, username, timestamp, and
     message content — since the avatar may be a sibling
     of the article at the LI level.
     ═══════════════════════════════════════════════ */

  _injectCSS() {
    BdApi.DOM.removeStyle(this._STYLE_ID);
    BdApi.DOM.addStyle(this._STYLE_ID, this._getCSS());
  }

  _getCSS() {
    // ── Colors ──
    const BLUE = "59, 130, 246"; // #3b82f6 — System (others)
    const PURPLE = "155, 50, 255"; // #9b32ff — Monarch (self), saturated violet
    const R = "2px";
    const BG = "rgba(0, 0, 0, 0.55)"; // Darker codeblock background

    return /* css */ `
      /* ═══════════════════════════════════════════════
         SystemWindow v2.5.0 — LI-level codeblock wrapping
         Wraps avatar + username + timestamp + message text
         ═══════════════════════════════════════════════ */

      /* ════════════════════════════════════════════
         PRE-STYLE: CSS-only base applied to ALL message
         items BEFORE JS classification. Prevents the flash
         when Discord replaces DOM nodes on re-render.

         Specificity (0,1,1) with !important — same as the
         sw-group-* rules below. Since equal !important +
         equal specificity = last rule wins, the grouping
         rules that come AFTER this block always override.
         ════════════════════════════════════════════ */

      li[class*="messageListItem_"] {
        background: ${BG} !important;
        border-left: 3px solid rgba(${BLUE}, 0.5) !important;
        border-right: 1px solid rgba(${BLUE}, 0.2) !important;
        border-top: 1px solid rgba(${BLUE}, 0.2) !important;
        border-bottom: 1px solid rgba(${BLUE}, 0.2) !important;
        border-radius: ${R} !important;
        position: relative !important;
        margin-left: 48px !important;
        margin-right: 96px !important;
        margin-top: 4px !important;
        margin-bottom: 4px !important;
        padding: 4px 12px 8px 8px !important;
        transition: box-shadow 200ms ease,
                    border-color 200ms ease !important;
      }

      /* Self messages pre-style — handled by .sw-self class from JS classification.
         data-is-self attribute was never set; now using React fiber detection. */

      /* Mentioned messages pre-style (CSS-only) */
      li[class*="messageListItem_"]:has(div[class*="mentioned"]) {
        border-left-color: rgba(239, 68, 68, 0.7) !important;
        border-right-color: rgba(239, 68, 68, 0.25) !important;
        border-top-color: rgba(239, 68, 68, 0.25) !important;
        border-bottom-color: rgba(239, 68, 68, 0.25) !important;
        background: rgba(239, 68, 68, 0.08) !important;
      }

      /* ════════════════════════════════════════════
         BASE: Classified messages (JS-applied) —
         overrides pre-style with proper grouping
         ════════════════════════════════════════════ */

      li.sw-group-solo,
      li.sw-group-start,
      li.sw-group-middle,
      li.sw-group-end {
        background: ${BG} !important;
        border-left: 3px solid rgba(${BLUE}, 0.5) !important;
        border-right: 1px solid rgba(${BLUE}, 0.2) !important;
        position: relative !important;
        margin-left: 48px !important;
        margin-right: 96px !important;
        padding: 4px 12px 8px 8px !important;
        transition: box-shadow 200ms ease,
                    border-color 200ms ease !important;
      }

      /* ════════════════════════════════════════════
         SOLO: Full border + full radius
         ════════════════════════════════════════════ */

      li.sw-group-solo {
        border-top: 1px solid rgba(${BLUE}, 0.2) !important;
        border-bottom: 1px solid rgba(${BLUE}, 0.2) !important;
        border-radius: ${R} !important;
        margin-top: 12px !important;
        margin-bottom: 12px !important;
        padding-bottom: 10px !important;
      }

      /* ════════════════════════════════════════════
         GROUP START: Top border + top radius
         ════════════════════════════════════════════ */

      li.sw-group-start {
        border-top: 1px solid rgba(${BLUE}, 0.2) !important;
        border-bottom: none !important;
        border-radius: ${R} ${R} 0 0 !important;
        margin-top: 12px !important;
        margin-bottom: 0 !important;
      }

      /* ════════════════════════════════════════════
         GROUP MIDDLE: Side borders only
         ════════════════════════════════════════════ */

      li.sw-group-middle {
        border-top: none !important;
        border-bottom: none !important;
        border-radius: 0 !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }

      /* ════════════════════════════════════════════
         GROUP END: Bottom border + bottom radius
         ════════════════════════════════════════════ */

      li.sw-group-end {
        border-top: none !important;
        border-bottom: 1px solid rgba(${BLUE}, 0.2) !important;
        border-radius: 0 0 ${R} ${R} !important;
        margin-top: 0 !important;
        margin-bottom: 12px !important;
        padding-bottom: 10px !important;
      }

      /* ════════════════════════════════════════════
         SELF: Purple accent (Monarch)
         Same darkened bg as others — only border color
         differs. Glow is hover-only.
         ════════════════════════════════════════════ */

      li.sw-self {
        border-left-color: rgba(${PURPLE}, 0.5) !important;
        border-right-color: rgba(${PURPLE}, 0.2) !important;
      }

      li.sw-self.sw-group-solo,
      li.sw-self.sw-group-start {
        border-top-color: rgba(${PURPLE}, 0.2) !important;
      }

      li.sw-self.sw-group-solo,
      li.sw-self.sw-group-end {
        border-bottom-color: rgba(${PURPLE}, 0.2) !important;
      }

      /* ════════════════════════════════════════════
         HOVER: Glow on the codeblock
         ════════════════════════════════════════════ */

      li.sw-group-solo:hover,
      li.sw-group-start:hover,
      li.sw-group-middle:hover,
      li.sw-group-end:hover {
        box-shadow: 0 0 18px rgba(${BLUE}, 0.45),
                    0 0 40px rgba(${BLUE}, 0.15),
                    inset 0 0 12px rgba(${BLUE}, 0.1) !important;
        border-left-color: rgba(${BLUE}, 1) !important;
      }

      li.sw-self.sw-group-solo:hover,
      li.sw-self.sw-group-start:hover,
      li.sw-self.sw-group-middle:hover,
      li.sw-self.sw-group-end:hover {
        box-shadow: 0 0 20px rgba(${PURPLE}, 0.6),
                    0 0 45px rgba(${PURPLE}, 0.25),
                    inset 0 0 12px rgba(${PURPLE}, 0.1) !important;
        border-left-color: rgba(${PURPLE}, 1) !important;
      }

      /* ════════════════════════════════════════════
         AVATAR: Clean circle inside codeblock
         ════════════════════════════════════════════ */

      li.sw-group-solo [class*="avatar"],
      li.sw-group-start [class*="avatar"] {
        z-index: 1 !important;
      }

      /* ════════════════════════════════════════════
         USERNAMES: System label feel
         ════════════════════════════════════════════ */

      li.sw-group-solo [class*="username"],
      li.sw-group-start [class*="username"] {
        letter-spacing: 0.03em !important;
      }

      /* ════════════════════════════════════════════
         TIMESTAMPS: Subtle metadata
         ════════════════════════════════════════════ */

      li.sw-group-solo time, li.sw-group-start time,
      li.sw-group-middle time, li.sw-group-end time,
      li.sw-group-solo [class*="timestamp"],
      li.sw-group-start [class*="timestamp"],
      li.sw-group-middle [class*="timestamp"],
      li.sw-group-end [class*="timestamp"] {
        opacity: 0.6 !important;
        font-size: 0.68rem !important;
        transition: opacity 200ms ease !important;
      }

      li.sw-group-solo:hover time, li.sw-group-start:hover time,
      li.sw-group-middle:hover time, li.sw-group-end:hover time,
      li.sw-group-solo:hover [class*="timestamp"],
      li.sw-group-start:hover [class*="timestamp"],
      li.sw-group-middle:hover [class*="timestamp"],
      li.sw-group-end:hover [class*="timestamp"] {
        opacity: 0.8 !important;
      }

      /* ════════════════════════════════════════════
         REPLY BLOCKS: Nested mini-codeblock
         ════════════════════════════════════════════ */

      li.sw-group-solo [class*="repliedMessage"],
      li.sw-group-start [class*="repliedMessage"] {
        background: rgba(0, 0, 0, 0.25) !important;
        border: 1px solid rgba(${BLUE}, 0.15) !important;
        border-left: 2px solid rgba(${BLUE}, 0.3) !important;
        border-radius: ${R} !important;
        padding: 4px 8px !important;
        margin-bottom: 4px !important;
      }

      li.sw-self.sw-group-solo [class*="repliedMessage"],
      li.sw-self.sw-group-start [class*="repliedMessage"] {
        border-color: rgba(${PURPLE}, 0.15) !important;
        border-left-color: rgba(${PURPLE}, 0.3) !important;
      }

      /* ════════════════════════════════════════════
         EMBEDS: Codeblock accent
         ════════════════════════════════════════════ */

      li.sw-group-solo [class*="embedWrapper"],
      li.sw-group-start [class*="embedWrapper"],
      li.sw-group-middle [class*="embedWrapper"],
      li.sw-group-end [class*="embedWrapper"] {
        background: rgba(0, 0, 0, 0.25) !important;
        border: 1px solid rgba(${BLUE}, 0.15) !important;
        border-left: 2px solid rgba(${BLUE}, 0.3) !important;
        border-radius: ${R} !important;
      }

      li.sw-self [class*="embedWrapper"] {
        border-color: rgba(${PURPLE}, 0.15) !important;
        border-left-color: rgba(${PURPLE}, 0.3) !important;
      }

      /* ════════════════════════════════════════════
         MENTIONED: Crimson "Emergency Quest" accent
         Overrides blue/purple with System alert red
         when the message mentions you (@you / @everyone)
         ════════════════════════════════════════════ */

      li.sw-mentioned {
        border-left-color: rgba(239, 68, 68, 0.7) !important;
        border-right-color: rgba(239, 68, 68, 0.25) !important;
        background: rgba(239, 68, 68, 0.08) !important;
      }

      li.sw-mentioned.sw-group-solo,
      li.sw-mentioned.sw-group-start {
        border-top-color: rgba(239, 68, 68, 0.25) !important;
      }

      li.sw-mentioned.sw-group-solo,
      li.sw-mentioned.sw-group-end {
        border-bottom-color: rgba(239, 68, 68, 0.25) !important;
      }

      /* Kill the theme's mention bg + ::before bar inside codeblocks */
      li.sw-mentioned div[class*="mentioned_"] {
        background: transparent !important;
      }
      li.sw-mentioned div[class*="mentioned_"]::before {
        display: none !important;
      }

      /* Kill Discord's native message hover highlight inside codeblocks —
         the codeblock glow handles hover feedback instead */
      li.sw-group-solo div[class*="message_"]:hover,
      li.sw-group-start div[class*="message_"]:hover,
      li.sw-group-middle div[class*="message_"]:hover,
      li.sw-group-end div[class*="message_"]:hover,
      li.sw-group-solo div[role="article"]:hover,
      li.sw-group-start div[role="article"]:hover,
      li.sw-group-middle div[role="article"]:hover,
      li.sw-group-end div[role="article"]:hover {
        background: transparent !important;
      }

      /* Mentioned hover: crimson glow */
      li.sw-mentioned.sw-group-solo:hover,
      li.sw-mentioned.sw-group-start:hover,
      li.sw-mentioned.sw-group-middle:hover,
      li.sw-mentioned.sw-group-end:hover {
        box-shadow: 0 0 18px rgba(239, 68, 68, 0.5),
                    0 0 40px rgba(239, 68, 68, 0.2),
                    inset 0 0 12px rgba(239, 68, 68, 0.1) !important;
        border-left-color: rgba(239, 68, 68, 1) !important;
      }
    `;
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
