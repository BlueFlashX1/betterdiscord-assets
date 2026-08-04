const dc = require("../shared/discord-classes");

/**
 * channel-context — "where did this message happen, and is it mine?"
 * Object.assign'd onto the SoloLevelingStats prototype. Consumed by the
 * message observers and the XP path, which run per message.
 *
 * Entry points: getChannelStore(), getChannelTypeById(channelId),
 * isThreadLikeChannelType(type), doesMessageFiberMatchAuthorId(el, id),
 * extractMentionCountFromText(text).
 *
 * EVERYTHING HERE IS ON THE PER-MESSAGE HOT PATH. In a busy server this runs
 * tens of times a second, so each helper is written to be cheap and to fail
 * soft: an unresolvable channel returns a neutral value rather than throwing,
 * because a throw here would kill XP for that message.
 *
 * doesMessageFiberMatchAuthorId walks the React fiber, which is the expensive
 * one — call it LAST, after cheaper checks have already ruled the message out.
 * The suite's rule is that own-message and monitored-user gates come before
 * any DOM query or fiber walk; this helper is exactly what that rule is
 * protecting against.
 *
 * Discord's hashed classes are reached through `dc` (shared/discord-classes),
 * never hardcoded — that resolver returns an exact class when the running
 * client exposes a unique one and falls back to a substring selector, so a
 * rename degrades instead of breaking.
 *
 * Thread-like channel types are treated separately because threads and forum
 * posts report a different channel type while still being "in" a parent
 * channel; XP attribution follows the parent, so a new Discord channel type
 * has to be classified here or it silently attributes to nothing.
 */

module.exports = {
  extractMentionCountFromText(messageText = '') {
    if (!messageText) return 0;
    const mentionMatches = messageText.match(/<@!?\d+>|@everyone|@here/g);
    return mentionMatches ? mentionMatches.length : 0;
  },

  getChannelStore() {
    let channelStore = this.webpackModules?.ChannelStore;
    if (!channelStore?.getChannel) {
      channelStore = BdApi.Webpack.getStore('ChannelStore');
      if (channelStore) this.webpackModules.ChannelStore = channelStore;
    }
    return channelStore || null;
  },

  getChannelTypeById(channelId) {
    if (!channelId) return null;
    try {
      return this.getChannelStore()?.getChannel?.(channelId)?.type ?? null;
    } catch (_error) {
      return null;
    }
  },

  isThreadLikeChannelType(channelType) {
    return channelType === 10 || channelType === 11 || channelType === 12;
  },

  doesMessageFiberMatchAuthorId(messageElement, authorIdToMatch) {
    if (!messageElement || !authorIdToMatch) return false;
    try {
      const reactKey = this.getReactFiberKey(messageElement);
      if (!reactKey) return false;
  
      let fiber = messageElement[reactKey];
      for (let i = 0; i < 20 && fiber; i++) {
        const hasMessageProp = Boolean(fiber.memoizedProps?.message || fiber.memoizedState?.message);
        const authorId =
          fiber.memoizedProps?.message?.author?.id ||
          fiber.memoizedState?.message?.author?.id ||
          fiber.memoizedProps?.message?.authorId;
        if (authorId === authorIdToMatch) return true;
        // PERF: the ancestor (.return) walk from a message row's own DOM
        // node can only ever reach ONE fiber carrying a `.message` prop --
        // the row's own Message component. Reply/forwarded-message preview
        // components are rendered as children of this row, not ancestors,
        // so they live in a different branch of the tree and are never
        // reached by walking upward from here. Once that one fiber is
        // found and its author doesn't match, every fiber further up
        // (group wrapper, list virtualizer, scroller) operates on
        // collections and never carries a single-message `.message` prop,
        // so there is nothing left to check.
        if (hasMessageProp) return false;
        fiber = fiber.return;
      }
      return false;
    } catch (_error) {
      return false;
    }
  },

  ensureValidTotalXP(logContext = 'TOTAL_XP') {
    if (
      typeof this.settings.totalXP === 'number' &&
      !isNaN(this.settings.totalXP) &&
      this.settings.totalXP >= 0
    ) {
      return false;
    }
  
    const currentLevel = this.settings.level || 1;
    let totalXPNeeded = 0;
    for (let l = 1; l < currentLevel; l++) {
      totalXPNeeded += this.getXPRequiredForLevel(l);
    }
    this.settings.totalXP = totalXPNeeded + (this.settings.xp || 0);
  
    this.debugLog(logContext, 'Initialized missing totalXP', {
      initializedTotalXP: this.settings.totalXP,
      level: currentLevel,
      xp: this.settings.xp,
    });
    return true;
  },

  buildMessageContextFromView(messageText = '', messageElement = null) {
    const channelInfo = this.getCurrentChannelInfo() || {};
    const rawChannelId = channelInfo.rawChannelId || null;
    const channelType = this.getChannelTypeById(rawChannelId);
    const mentionCount = this.extractMentionCountFromText(messageText);
  
    const hasReplyNode = !!messageElement?.querySelector?.(
      '[class*="replied"], [class*="reply"], [id*="reply"]'
    );
  
    return {
      source: 'view',
      channelId: rawChannelId || channelInfo.channelId || null,
      channelType,
      mentionCount,
      hasMentions: mentionCount > 0,
      isReply: hasReplyNode,
      isThread:
        channelInfo.channelType === 'thread' ||
        this.isThreadLikeChannelType(channelType) ||
        /\/threads\/\d+/.test(window.location?.pathname || ''),
      isForumThread: channelType === 11 || channelType === 12,
    };
  },

  getCurrentChannelInfo() {
    try {
      const url = window.location.href;
      if (this._channelInfoCacheUrl === url && this._channelInfoCache) {
        return this._channelInfoCache;
      }
      // Reduced verbosity - only log if verbose mode enabled (frequent operation)
      this.debugLog('GET_CHANNEL_INFO', 'Getting channel info', { url });
  
      // Pattern 0: Thread route - /channels/{serverId}/{parentChannelId}/threads/{threadId}
      const threadMatch = url.match(/channels\/(\d+)\/(\d+)\/threads\/(\d+)/);
      if (threadMatch) {
        const serverId = threadMatch[1];
        const parentChannelId = threadMatch[2];
        const threadId = threadMatch[3];
        this.debugLog('GET_CHANNEL_INFO', 'Thread route detected', {
          serverId,
          parentChannelId,
          threadId,
          type: 'thread',
        });
        const info = {
          channelId: `thread_${serverId}_${parentChannelId}_${threadId}`,
          channelType: 'thread',
          serverId,
          isDM: false,
          rawChannelId: threadId,
          parentChannelId,
        };
        this._channelInfoCacheUrl = url;
        this._channelInfoCache = info;
        return info;
      }
  
      // Pattern 1: Server channel - /channels/{serverId}/{channelId}
      const serverChannelMatch = url.match(/channels\/(\d+)\/(\d+)/);
      if (serverChannelMatch) {
        const serverId = serverChannelMatch[1];
        const channelId = serverChannelMatch[2];
        // Reduced verbosity - only log if verbose mode enabled
        this.debugLog('GET_CHANNEL_INFO', 'Server channel detected', {
          serverId,
          channelId,
          type: 'server',
        });
        const info = {
          channelId: `server_${serverId}_${channelId}`, // Unique ID for server channels
          channelType: 'server',
          serverId,
          isDM: false,
          rawChannelId: channelId,
        };
        this._channelInfoCacheUrl = url;
        this._channelInfoCache = info;
        return info;
      }
  
      // Pattern 2: Direct Message (DM) - /@me/{channelId}
      const dmMatch = url.match(/@me\/(\d+)/);
      if (dmMatch) {
        const channelId = dmMatch[1];
        // Reduced verbosity - only log if verbose mode enabled
        this.debugLog('GET_CHANNEL_INFO', 'DM channel detected', {
          channelId,
          type: 'dm',
        });
        const info = {
          channelId: `dm_${channelId}`, // Unique ID for DMs
          channelType: 'dm',
          serverId: null,
          isDM: true,
          rawChannelId: channelId,
        };
        this._channelInfoCacheUrl = url;
        this._channelInfoCache = info;
        return info;
      }
  
      // Pattern 3: Group DM - /channels/@me/{groupId}
      const groupDmMatch = url.match(/channels\/@me\/(\d+)/);
      if (groupDmMatch) {
        const groupId = groupDmMatch[1];
        // Reduced verbosity - only log if verbose mode enabled
        this.debugLog('GET_CHANNEL_INFO', 'Group DM detected', {
          groupId,
          type: 'group_dm',
        });
        const info = {
          channelId: `group_dm_${groupId}`,
          channelType: 'group_dm',
          serverId: null,
          isDM: true,
          rawChannelId: groupId,
        };
        this._channelInfoCacheUrl = url;
        this._channelInfoCache = info;
        return info;
      }
  
      // Pattern 4: Fallback - use full URL as ID (for unknown patterns)
      this.debugLog('GET_CHANNEL_INFO', 'Unknown channel pattern, using URL as ID', {
        url,
        type: 'unknown',
      });
      const info = {
        channelId: `unknown_${this.hashString(url)}`,
        channelType: 'unknown',
        serverId: null,
        isDM: false,
        rawChannelId: url,
      };
      this._channelInfoCacheUrl = url;
      this._channelInfoCache = info;
      return info;
    } catch (error) {
      this.debugError('GET_CHANNEL_INFO', error, {
        currentUrl: window.location.href,
      });
      this._channelInfoCacheUrl = null;
      this._channelInfoCache = null;
      return null;
    }
  },

  getCurrentChannelId() {
    const info = this.getCurrentChannelInfo();
    return info ? info.channelId : null;
  },

  _isGuildTextChannel() {
    try {
      const channelInfo = this.getCurrentChannelInfo();
      if (!channelInfo) return false;

      // DMs and group DMs never get the strip
      if (channelInfo.isDM) return false;
      if (channelInfo.channelType === 'dm' || channelInfo.channelType === 'group_dm') return false;

      // Use ChannelStore for accurate channel type detection
      const channelStore = this.getChannelStore();
      if (channelStore?.getChannel && channelInfo.rawChannelId) {
        const channel = channelStore.getChannel(channelInfo.rawChannelId);
        if (channel) {
          // Allow any guild channel surface where the strip should mount:
          //   0  = GUILD_TEXT
          //   5  = GUILD_ANNOUNCEMENT
          //   2  = GUILD_VOICE          (built-in voice-channel chat)
          //   13 = GUILD_STAGE_VOICE    (stage chat)
          //   10 = ANNOUNCEMENT_THREAD
          //   11 = PUBLIC_THREAD
          //   12 = PRIVATE_THREAD
          //   15 = GUILD_FORUM          (forum landing page)
          // User wants HP/MP/EXP visible in every chat surface inside a
          // guild — character stats are global, not text-channel-specific.
          // Forum / thread types added here so the strip mounts there too;
          // the URL "/threads/" bail and the channelType==='thread' bail
          // were removed because they were the historical cutoff that
          // prevented the strip from ever rendering in those surfaces.
          // Excludes: 16 = GUILD_MEDIA (no chat input there).
          return (
            channel.type === 0 ||
            channel.type === 5 ||
            channel.type === 2 ||
            channel.type === 13 ||
            channel.type === 10 ||
            channel.type === 11 ||
            channel.type === 12 ||
            channel.type === 15
          );
        }
      }
  
      // Fallback: URL-based detection — guild server channels match /channels/{serverId}/{channelId}
      // Without ChannelStore we can't distinguish threads/forums from text channels.
      // Check URL for thread indicators (threads often have /threads/ in URL or longer channel IDs)
      if (channelInfo.channelType === 'server') {
        return true;
      }
      return false;
    } catch (error) {
      this.debugError('IS_GUILD_TEXT_CHANNEL', error);
      return false;
    }
  },

  _canShowChatUIInCurrentView() {
    // Show chat UI in all guild text channels unconditionally.
    // Previously also required a writable message input, which caused the UI to
    // disappear during transient DOM states or when the input wasn't yet rendered.
    return this._isGuildTextChannel();
  },

  getReactFiberKey(element) {
    return Object.keys(element).find(
      (key) =>
        key.startsWith('__reactFiber') ||
        key.startsWith('__reactInternalInstance') ||
        key.startsWith('__reactContainer')
    );
  },

  getMessageContainer() {
    const cached = this._messageContainerEl;
    if (cached && cached.isConnected) return cached;
    const el =
      document.querySelector(dc.sel.messagesWrapper) ||
      document.querySelector(dc.sel.scrollerInner) ||
      document.querySelector(dc.sel.messageList) ||
      document.querySelector(dc.sel.scroller);
    this._messageContainerEl = el || null;
    return this._messageContainerEl;
  },

  getMessageInputElement() {
    const cachedInput = this._messageInputElCache;
    if (cachedInput?.isConnected) return cachedInput;

    // Cache selector list to avoid allocations on repeated lookups
    if (!this._messageInputSelectors) {
      this._messageInputSelectors = [
        'div[contenteditable="true"][role="textbox"]', // Modern Discord uses contenteditable divs
        'div[contenteditable="true"]',
        dc.sel.slateTextArea,
        dc.sel.textArea,
        '[class*="textValue"]',
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="message"]',
        '[class*="messageInput"]',
        '[class*="input"]',
        '[data-slate-editor="true"]', // Slate editor
      ];
    }
  
    for (const selector of this._messageInputSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        this._messageInputElCache = el;
        return el;
      }
    }
  
    // Also try to find by role attribute
    const roleInput = document.querySelector('[role="textbox"]');
    if (roleInput && roleInput.contentEditable === 'true') {
      this.debugLog('FIND_INPUT', 'Found input by role="textbox"');
      this._messageInputElCache = roleInput;
      return roleInput;
    }
  
    this._messageInputElCache = null;
    return null;
  },

  getMessageContainerElementForObserving() {
    if (!this._messageContainerSelectors) {
      this._messageContainerSelectors = [
        dc.sel.messagesWrapper,
        dc.sel.scrollerInner,
        dc.sel.scroller,
      ];
    }
  
    for (const selector of this._messageContainerSelectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
  
    return null;
  },

  getCurrentUserIdForMessageDetection() {
    // PRIORITY: Webpack UserStore > React fiber > stored user id
    try {
      const now = Date.now();
      if (
        this._currentUserIdCacheTime &&
        now - this._currentUserIdCacheTime < 5000 &&
        this._currentUserIdCache
      ) {
        return this._currentUserIdCache;
      }
  
      // Method 1: Webpack UserStore via getCurrentUserIdFromStore(), which now
      // self-resolves the store through BdApi.Webpack.getStore("UserStore").
      // Do NOT gate on webpackModuleAccess/webpackModules.UserStore — the legacy
      // webpack init that populated those is absent in the modular build, so the
      // gate was permanently false and userId never resolved (=> no own-message
      // detection => no XP). The resolver self-resolves + caches the store.
      const storeUserId = this.getCurrentUserIdFromStore();
      if (storeUserId) {
        this._currentUserIdCache = storeUserId;
        this._currentUserIdCacheTime = now;
        return storeUserId;
      }
  
      // Method 2: Fallback to React fiber traversal (if webpack unavailable)
      const userElement =
        document.querySelector(dc.sel.avatar) || document.querySelector(dc.sel.user);
      if (userElement) {
        const reactKey = this.getReactFiberKey(userElement);
        if (reactKey) {
          let fiber = userElement[reactKey];
          for (let i = 0; i < 10 && fiber; i++) {
            if (fiber.memoizedProps?.user?.id) return fiber.memoizedProps.user.id;
            fiber = fiber.return;
          }
        }
      }
  
      // Method 3: Use stored user ID as final fallback
      const fallback = this.settings.ownUserId || null;
      this._currentUserIdCache = fallback;
      this._currentUserIdCacheTime = now;
      return fallback;
    } catch (error) {
      this.debugError('GET_USER_ID', error);
      return this.settings.ownUserId || null;
    }
  },

  getMessageId(messageElement) {
    // Try to get a unique ID for the message (improved method)
    let messageId =
      messageElement.getAttribute('data-list-item-id') || messageElement.getAttribute('id');
  
    // Try React props (Discord stores message data in React)
    if (!messageId) {
      try {
        const reactKey = this.getReactFiberKey(messageElement);
        if (reactKey) {
          let fiber = messageElement[reactKey];
          for (let i = 0; i < 10 && fiber; i++) {
            if (fiber.memoizedProps?.message?.id) {
              messageId = fiber.memoizedProps.message.id;
              break;
            }
            if (fiber.memoizedState?.message?.id) {
              messageId = fiber.memoizedState.message.id;
              break;
            }
            fiber = fiber.return;
          }
        }
      } catch (e) {
        // React access failed, continue to fallback
      }
    }
  
    // Fallback: create hash from content + timestamp
    if (!messageId) {
      const content = messageElement.textContent?.trim() || '';
      const timestamp = Date.now();
      const hashContent = `${content.substring(0, 100)}:${timestamp}`;
      let hash = 0;
      for (let i = 0; i < hashContent.length; i++) {
        const char = hashContent.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      messageId = `hash_${Math.abs(hash)}`;
    }
  
    return messageId;
  },

  isOwnMessage(messageElement, currentUserId) {
    try {
      this.debugLog('IS_OWN_MESSAGE', 'Checking if message is own', {
        hasCurrentUserId: !!currentUserId,
        elementClasses: messageElement.classList?.toString() || '',
      });
  
      // PRIMARY METHOD 1: Check React props for user ID match (MOST RELIABLE)
      if (this.doesMessageFiberMatchAuthorId(messageElement, currentUserId)) {
        this.debugLog('IS_OWN_MESSAGE', 'CONFIRMED: Detected via React props user ID match', {
          currentUserId,
        });
        return true;
      }
  
      // PRIMARY METHOD 2: Check for explicit "You" indicator (RELIABLE)
      const usernameElement =
        messageElement.querySelector(dc.sel.username) ||
        messageElement.querySelector(dc.sel.author) ||
        messageElement.querySelector('[class*="usernameInner"]');
  
      if (usernameElement) {
        const usernameText = usernameElement.textContent?.trim() || '';
        // Only trust explicit "You" text, not class names
        if (usernameText.toLowerCase() === 'you' || usernameText.toLowerCase().startsWith('you ')) {
          this.debugLog('IS_OWN_MESSAGE', 'CONFIRMED: Detected via explicit "You" indicator', {
            usernameText,
          });
          return true;
        }
      }
  
      // SECONDARY: Require MULTIPLE strong indicators together (more strict)
      const messageClasses = messageElement.classList?.toString() || '';
      const hasOwnClass =
        messageClasses.includes('own') || messageElement.closest('[class*="own"]') !== null;
      const hasCozyClass = messageClasses.includes('cozy');
      const hasRightAligned = messageClasses.includes('right');
      const hasOwnTimestamp = messageElement
        .querySelector(dc.sel.timestamp)
        ?.classList?.toString()
        .includes('own');
  
      // Require at least 2 strong indicators
      let indicatorCount = 0;
      if (hasOwnClass) indicatorCount++;
      if (hasOwnTimestamp) indicatorCount++;
      if (hasRightAligned && hasCozyClass) indicatorCount++; // Both together = stronger
  
      if (indicatorCount >= 2) {
        this.debugLog('IS_OWN_MESSAGE', 'CONFIRMED: Multiple strong indicators', {
          hasOwnClass,
          hasOwnTimestamp,
          hasRightAligned,
          hasCozyClass,
          indicatorCount,
        });
        return true;
      }
  
      // If we don't have strong confirmation, return false
      this.debugLog('IS_OWN_MESSAGE', 'NOT OWN: Insufficient indicators', {
        hasOwnClass,
        hasOwnTimestamp,
        hasRightAligned,
        hasCozyClass,
        indicatorCount,
        hasCurrentUserId: !!currentUserId,
      });
      return false;
    } catch (error) {
      this.debugError('IS_OWN_MESSAGE', error);
      return false; // Default to false on error
    }
  }
};
