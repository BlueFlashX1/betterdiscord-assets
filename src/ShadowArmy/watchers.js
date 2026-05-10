/**
 * ShadowArmy — Channel & member list watchers, DOM queries, permission checks.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./watchers'))
 */

const dc = require('../shared/discord-classes');

module.exports = {
  // CHANNEL & MEMBER LIST WATCHERS

  /**
   * Setup channel watcher for URL changes (event-based, no polling).
   * Ensures button and widget persist across guild/channel switches.
   */
  setupChannelWatcher() {
    let lastUrl = window.location.href;

    const handleUrlChange = () => {
      if (this._isStopped) return;

      const currentUrl = window.location.href;
      if (currentUrl === lastUrl) return;

      lastUrl = currentUrl;
      if (this._navChangeTimeout) {
        clearTimeout(this._navChangeTimeout);
        this._retryTimeouts.delete(this._navChangeTimeout);
      }
      const navTimeoutId = setTimeout(() => {
        this._retryTimeouts?.delete?.(navTimeoutId);
        if (this._isStopped) return;
        if (this._navChangeTimeout === navTimeoutId) {
          this._navChangeTimeout = null;
        }
        this.setupMemberListWatcher();
      }, 200);
      this._navChangeTimeout = navTimeoutId;
      this._retryTimeouts?.add?.(navTimeoutId);
    };

    // PERF(P5-1): Use shared NavigationBus instead of independent pushState wrapper
    if (this._PluginUtils?.NavigationBus) {
      if (typeof this._navBusUnsub === 'function') {
        this._navBusUnsub();
        this._navBusUnsub = null;
      }
      this._navBusUnsub = this._PluginUtils.NavigationBus.subscribe(() => handleUrlChange());
    }

    this.setupMemberListWatcher();
  },

  getCurrentChannelRouteInfo() {
    if (typeof window === 'undefined') return null;

    const pathname = window.location?.pathname || '';
    const threadMatch = pathname.match(/^\/channels\/(\d+)\/(\d+)\/threads\/(\d+)$/);
    if (threadMatch) {
      return {
        routeType: 'thread',
        serverId: threadMatch[1],
        parentChannelId: threadMatch[2],
        rawChannelId: threadMatch[3],
      };
    }

    const serverMatch = pathname.match(/^\/channels\/(\d+)\/(\d+)$/);
    if (serverMatch) {
      return {
        routeType: 'server',
        serverId: serverMatch[1],
        rawChannelId: serverMatch[2],
      };
    }

    return null;
  },

  getChannelStoreModule() {
    let ChannelStore = this.webpackModules?.ChannelStore;
    if (!ChannelStore?.getChannel) {
      try {
        ChannelStore = BdApi.Webpack.getStore("ChannelStore");
      } catch (_) {
        ChannelStore = null;
      }
      if (ChannelStore) this.webpackModules.ChannelStore = ChannelStore;
    }
    return ChannelStore || null;
  },

  _findMainChatContainer() {
    const cc = dc.sel.chatContent;
    const selectors = [
      `main${cc}`,
      `section${cc}[role="main"]`,
      `div${cc}:not([role="complementary"])`,
      `div${dc.sel.chat}:not(${dc.sel.chatLayerWrapper})`,
    ];
    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container) return container;
    }
    return null;
  },

  _findMessageInputArea(mainChat) {
    if (!mainChat) return null;
    return (
      mainChat.querySelector(dc.sel.channelTextArea) ||
      mainChat.querySelector(dc.sel.textArea)?.parentElement ||
      mainChat.querySelector(dc.sel.slateTextArea)?.parentElement ||
      null
    );
  },

  _isWritableEditor(editor) {
    if (!editor) return false;
    const blockedByAria = editor.getAttribute('aria-disabled') === 'true';
    const blockedByFlags =
      editor.hasAttribute('disabled') ||
      editor.hasAttribute('readonly') ||
      editor.getAttribute('contenteditable') === 'false';
    return !(blockedByAria || blockedByFlags);
  },

  hasWritableMessageInputInMainChat() {
    const mainChat = this._findMainChatContainer();
    const inputArea = this._findMessageInputArea(mainChat);
    if (!inputArea) return false;
    if (inputArea.matches?.('[aria-disabled="true"]') || inputArea.closest('[aria-disabled="true"]')) {
      return false;
    }

    const editorCandidates = [
      '[role="textbox"]',
      'textarea',
      '[contenteditable="true"]',
      dc.sel.slateTextArea,
    ];
    const editor = editorCandidates
      .map((selector) => inputArea.querySelector(selector))
      .find(Boolean);

    return this._isWritableEditor(editor);
  },

  hasViewAndSendPermissions(channel) {
    if (!channel) return this.hasWritableMessageInputInMainChat();

    let PermissionStore = this.webpackModules?.PermissionStore;
    if (!PermissionStore?.can) {
      try {
        PermissionStore = BdApi.Webpack.getStore("PermissionStore");
      } catch (_) {
        PermissionStore = null;
      }
      if (PermissionStore) this.webpackModules.PermissionStore = PermissionStore;
    }

    let Permissions = this.webpackModules?.Permissions;
    if (!Permissions || Permissions.VIEW_CHANNEL == null || Permissions.SEND_MESSAGES == null) {
      try {
        Permissions = BdApi.Webpack.getModule(
          (m) =>
            m &&
            Object.prototype.hasOwnProperty.call(m, 'VIEW_CHANNEL') &&
            Object.prototype.hasOwnProperty.call(m, 'SEND_MESSAGES')
        );
      } catch (_) {
        Permissions = null;
      }
      if (Permissions) this.webpackModules.Permissions = Permissions;
    }

    if (
      PermissionStore?.can &&
      Permissions?.VIEW_CHANNEL != null &&
      Permissions?.SEND_MESSAGES != null
    ) {
      const canView = !!PermissionStore.can(Permissions.VIEW_CHANNEL, channel);
      const canSend = !!PermissionStore.can(Permissions.SEND_MESSAGES, channel);
      return canView && canSend;
    }

    return this.hasWritableMessageInputInMainChat();
  },

  canInjectWidgetInCurrentView() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;

    const routeInfo = this.getCurrentChannelRouteInfo();
    // Accept both 'server' (regular guild channel route) and 'thread'
    // (route info comes from the /threads/ URL match in
    // getCurrentChannelRouteInfo). The widget should mount in the
    // member list of any guild surface that has one.
    if (!routeInfo || (routeInfo.routeType !== 'server' && routeInfo.routeType !== 'thread')) return false;

    const ChannelStore = this.getChannelStoreModule();
    const channel = ChannelStore?.getChannel
      ? ChannelStore.getChannel(routeInfo.rawChannelId)
      : null;
    if (channel) {
      // Allow any guild channel surface that has a member list. Previously
      // restricted to GUILD_TEXT (0) + GUILD_ANNOUNCEMENT (5); user wants
      // the widget to also mount in:
      //   10 = ANNOUNCEMENT_THREAD
      //   11 = PUBLIC_THREAD
      //   12 = PRIVATE_THREAD
      //   15 = GUILD_FORUM
      // The /threads/ URL early-bail above this block was also removed
      // since thread routes are now legitimate widget mount surfaces.
      const channelType = Number(channel.type);
      const ALLOWED_TYPES = new Set([0, 5, 10, 11, 12, 15]);
      if (!ALLOWED_TYPES.has(channelType)) return false;
      return this.hasViewAndSendPermissions(channel);
    }

    return this.hasWritableMessageInputInMainChat();
  },

  getMemberListElements() {
    if (typeof document === 'undefined') return null;

    const allCandidates = document.querySelectorAll(dc.sel.membersWrap);
    const membersWrap = Array.from(allCandidates).find((candidate) => {
      if (!candidate?.isConnected) return false;
      if (candidate.closest('[id^="chat-messages-"]')) return false;
      const style = candidate.style;
      if (style?.display === 'none') return false;
      if (candidate.offsetParent === null) return false;
      return true;
    });

    if (!membersWrap) return null;

    const membersList =
      membersWrap.querySelector(`:scope > ${dc.sel.members}`) ||
      membersWrap.querySelector(dc.sel.members);

    if (!membersList || membersList.closest('[id^="chat-messages-"]')) return null;

    const membersContent =
      membersList.querySelector(`:scope > ${dc.sel.content}`) ||
      membersList.querySelector(dc.sel.content);

    return { membersWrap, membersList, membersContent };
  },

  isWidgetInValidMemberList(widget) {
    if (!widget || typeof widget.closest !== 'function') return false;
    if (widget.closest('[id^="chat-messages-"]')) return false;
    return !!widget.closest(dc.sel.membersWrap);
  },

  _scheduleWatcherRetry(callback, delayMs = 0) {
    const retryId = setTimeout(() => {
      this._retryTimeouts?.delete?.(retryId);
      if (this._isStopped) return;
      if (typeof callback === 'function') callback();
    }, Math.max(0, Number(delayMs) || 0));
    this._retryTimeouts?.add?.(retryId);
    return retryId;
  },

  _scheduleMemberListSetupRetry(delayMs = 0) {
    if (this._memberListSetupRetryTimeout) {
      clearTimeout(this._memberListSetupRetryTimeout);
      this._retryTimeouts?.delete?.(this._memberListSetupRetryTimeout);
      this._memberListSetupRetryTimeout = null;
    }

    this._memberListSetupRetryTimeout = this._scheduleWatcherRetry(() => {
      this._memberListSetupRetryTimeout = null;
      this.setupMemberListWatcher();
    }, delayMs);
  },

  setupMemberListWatcher() {
    if (this.memberListObserver) {
      this.memberListObserver.disconnect();
    }
    if (!this.canInjectWidgetInCurrentView()) {
      document.getElementById('shadow-army-widget')?.remove();
      this._scheduleMemberListSetupRetry(1500);
      return;
    }

    const memberRoot = this.getMemberListElements()?.membersWrap || null;
    const chatContent = this._findMainChatContainer();

    const observeRoot =
      memberRoot?.parentElement ||
      chatContent?.parentElement ||
      null;

    if (!observeRoot) {
      this._scheduleMemberListSetupRetry(1200);
      return;
    }

    if (this._memberListSetupRetryTimeout) {
      clearTimeout(this._memberListSetupRetryTimeout);
      this._retryTimeouts?.delete?.(this._memberListSetupRetryTimeout);
      this._memberListSetupRetryTimeout = null;
    }

    this._lastMemberListWatchCheck = 0;
    this._memberListRetryCount = 0;
    let wasMemberListAbsent = false;

    const onMemberListMutated = (mutations = null) => {
      if (this._isStopped) return;
      if (document.hidden) return;
      const now = Date.now();
      if (now - this._lastMemberListWatchCheck < 150) return;

      const mutationList = Array.isArray(mutations) ? mutations : null;

      // PERF: Skip mutations that only affect the chat area (not the member list).
      // Retry-driven checks pass null and should continue with a direct recheck.
      let hasMemberListMutation = false;
      if (mutationList && mutationList.length > 0) {
        for (let i = 0; i < mutationList.length; i++) {
          const target = mutationList[i]?.target;
          if (target?.classList) {
            const cn = target.className;
            if (typeof cn === 'string' && (cn.includes('membersWrap') || cn.includes('members_'))) {
              hasMemberListMutation = true;
              break;
            }
          }
          if (!hasMemberListMutation && target?.closest?.(dc.sel.membersWrap)) {
            hasMemberListMutation = true;
            break;
          }
        }
      } else {
        hasMemberListMutation = true;
      }
      if (!hasMemberListMutation) return;

      this._lastMemberListWatchCheck = now;
      if (!this.canInjectWidgetInCurrentView()) {
        document.getElementById('shadow-army-widget')?.remove();
        return;
      }

      const memberElements = this.getMemberListElements();
      if (!memberElements?.membersList) {
        document.getElementById('shadow-army-widget')?.remove();
        wasMemberListAbsent = true;
        if (this._memberListRetryCount >= 5) {
          this._memberListRetryCount = 0;
        }
        if (this._memberListRetryCount < 5) {
          this._memberListRetryCount++;
          this._scheduleWatcherRetry(() => onMemberListMutated(null), 300);
        }
        return;
      }

      this._memberListRetryCount = 0;

      if (wasMemberListAbsent) {
        wasMemberListAbsent = false;
        if (this.widgetReinjectionTimeout) {
          clearTimeout(this.widgetReinjectionTimeout);
          this._retryTimeouts?.delete?.(this.widgetReinjectionTimeout);
        }
        this.widgetReinjectionTimeout = this._scheduleWatcherRetry(
          () => this.injectShadowRankWidget(),
          250
        );
        return;
      }

      const widget = document.getElementById('shadow-army-widget');
      if (widget && this.isWidgetInValidMemberList(widget)) return;
      widget && widget.remove();

      if (this.widgetReinjectionTimeout) {
        clearTimeout(this.widgetReinjectionTimeout);
        this._retryTimeouts?.delete?.(this.widgetReinjectionTimeout);
      }
      this.widgetReinjectionTimeout = this._scheduleWatcherRetry(
        () => this.injectShadowRankWidget(),
        150
      );
    };

    // PERF: Debounce member list mutations — Discord fires many during scroll/online status changes
    let _memberListDebounceTimer = null;
    let _memberListPendingMutations = [];

    // Cheap synchronous filter for the observer hot path — must stay branch-light
    // because the observer fires on EVERY mutation in the chat+member subtree
    // (typing indicators, message renders, voice activity, presence changes).
    // Only walks className (no closest() walk) so each mutation costs microseconds.
    const _classNameLooksLikeMembers = (target) => {
      if (!target?.classList) return false;
      const cn = target.className;
      if (typeof cn !== 'string') return false;
      return cn.includes('membersWrap') || cn.includes('members_') || cn.includes('member_');
    };

    this.memberListObserver = new MutationObserver((mutations) => {
      // BUG-FIX (2026-04-12): the prior implementation called
      // onMemberListMutated() with no arguments, which made the chat-area
      // filter unconditionally pass (mutations === null → hasMemberListMutation
      // = true). That turned the debounced callback into a 12.5Hz heavy
      // DOM-query loop that ran continuously for the entire session and
      // sustained ~135% renderer CPU.
      //
      // Two fixes here:
      //   1. Synchronous pre-filter — drop chat-only batches before scheduling
      //      any deferred work.
      //   2. Accumulate mutations across the 80ms debounce window so the
      //      deferred filter sees the full set instead of dropping them.

      let hasRelevant = false;
      for (let i = 0; i < mutations.length; i++) {
        if (_classNameLooksLikeMembers(mutations[i]?.target)) {
          hasRelevant = true;
          break;
        }
      }
      if (!hasRelevant) return;

      for (let i = 0; i < mutations.length; i++) {
        _memberListPendingMutations.push(mutations[i]);
      }

      if (_memberListDebounceTimer) return;
      _memberListDebounceTimer = setTimeout(() => {
        _memberListDebounceTimer = null;
        const drained = _memberListPendingMutations;
        _memberListPendingMutations = [];
        onMemberListMutated(drained);
      }, 80);
    });

    this.memberListObserver.observe(observeRoot, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });

    // Periodic observer health check. Polling here is intentional —
    // member-list auto-show (the Discord "Show Members" toggle) re-renders
    // the parent without firing a channel-switch event, so a pure
    // SelectedChannelStore listener misses this case and the widget never
    // gets injected when the user reveals the panel. Keep the 3s poll;
    // its cost is negligible (one isConnected check per tick) and it
    // covers every variant of member-list mount/unmount uniformly.
    if (this._memberListHealthCheck) clearInterval(this._memberListHealthCheck);
    this._memberListHealthCheck = setInterval(() => {
      if (this._isStopped) {
        clearInterval(this._memberListHealthCheck);
        this._memberListHealthCheck = null;
        return;
      }
      if (document.hidden) return;
      if (!observeRoot.isConnected) {
        clearInterval(this._memberListHealthCheck);
        this._memberListHealthCheck = null;
        this.setupMemberListWatcher();
      }
    }, 3000);

    // Immediate pass in case member list is already mounted
    this.injectShadowRankWidget();
  },

};
