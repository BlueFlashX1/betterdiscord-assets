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
        const authorId =
          fiber.memoizedProps?.message?.author?.id ||
          fiber.memoizedState?.message?.author?.id ||
          fiber.memoizedProps?.message?.authorId;
        if (authorId === authorIdToMatch) return true;
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

  buildMessageContextFromStore(message, messageText = '') {
    const channelId = message?.channel_id || this.getCurrentChannelId();
    const channelType = this.getChannelTypeById(channelId);
    const mentionCount = Array.isArray(message?.mentions)
      ? message.mentions.length + (message?.mention_everyone ? 1 : 0)
      : this.extractMentionCountFromText(messageText);
  
    return {
      source: 'store',
      channelId,
      channelType,
      mentionCount,
      hasMentions: mentionCount > 0,
      isReply: !!(message?.message_reference || message?.referenced_message),
      isThread:
        this.isThreadLikeChannelType(channelType) ||
        /\/threads\/\d+/.test(window.location?.pathname || ''),
      isForumThread: channelType === 11 || channelType === 12,
    };
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
      const pathname = window.location?.pathname || '';
      if (/\/threads\/\d+/.test(pathname)) return false;
  
      const channelInfo = this.getCurrentChannelInfo();
      if (!channelInfo) return false;
  
      // DMs and group DMs are never guild text channels
      if (channelInfo.isDM) return false;
      if (channelInfo.channelType === 'dm' || channelInfo.channelType === 'group_dm') return false;
      if (channelInfo.channelType === 'thread') return false;
  
      // Use ChannelStore for accurate channel type detection
      const channelStore = this.getChannelStore();
      if (channelStore?.getChannel && channelInfo.rawChannelId) {
        const channel = channelStore.getChannel(channelInfo.rawChannelId);
        if (channel) {
          // type 0 = GUILD_TEXT, type 5 = GUILD_ANNOUNCEMENT (text-based)
          // Exclude: 10/11/12=threads, 15=GUILD_FORUM, 2=VOICE, 13=STAGE
          return channel.type === 0 || channel.type === 5;
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

  _getPrimaryChatContainer() {
    // PERF: 2s TTL cache — avoids 6 sequential querySelector calls on every hot-path invocation
    const now = Date.now();
    if (this._cachedChatContainer && this._cachedChatContainerTs && (now - this._cachedChatContainerTs < 2000)) {
      if (this._cachedChatContainer.isConnected) return this._cachedChatContainer;
      this._cachedChatContainer = null;
      this._cachedChatContainerTs = 0;
    }
  
    const el =
      document.querySelector('main[class*="chatContent"]') ||
      document.querySelector('section[class*="chatContent"][role="main"]') ||
      document.querySelector('div[class*="chatContent"]:not([role="complementary"])') ||
      document.querySelector('main[class*="chatContent-"]') ||
      document.querySelector('div[class*="chat_"]:not([class*="chatLayerWrapper"])') ||
      document.querySelector('div[class*="chat-"]:not([class*="chatLayerWrapper"])');
  
    if (el) {
      this._cachedChatContainer = el;
      this._cachedChatContainerTs = now;
    }
    return el;
  },

  _getMessageInputAreaInPrimaryChat() {
    const mainChat = this._getPrimaryChatContainer();
    if (!mainChat) return null;
  
    const messageInputArea =
      mainChat.querySelector('[class*="channelTextArea_"]') ||
      mainChat.querySelector('[class*="channelTextArea-"]') ||
      mainChat.querySelector('[class*="channelTextArea"]') ||
      mainChat.querySelector('[class*="textArea"]')?.parentElement ||
      mainChat.querySelector('[class*="slateTextArea"]')?.parentElement;
  
    if (!messageInputArea || !messageInputArea.parentElement) return null;
  
    // Safety: don't inject inside dialogs/modals (Forward To, etc.)
    if (
      messageInputArea.closest('[role="dialog"]') ||
      messageInputArea.closest('[class*="layerContainer_"]')
    ) {
      return null;
    }
  
    return messageInputArea;
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
      document.querySelector('[class*="messagesWrapper"]') ||
      document.querySelector('[class*="scrollerInner"]') ||
      document.querySelector('[class*="messageList"]') ||
      document.querySelector('[class*="scroller"]');
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
        '[class*="slateTextArea"]',
        '[class*="textArea"]',
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
        '[class*="messagesWrapper"]',
        '[class*="scrollerInner"]',
        '[class*="scroller"]',
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
  
      // Method 1: Try webpack UserStore (most reliable)
      if (this.webpackModuleAccess && this.webpackModules.UserStore) {
        const storeUserId = this.getCurrentUserIdFromStore();
        if (storeUserId) {
          this._currentUserIdCache = storeUserId;
          this._currentUserIdCacheTime = now;
          return storeUserId;
        }
      }
  
      // Method 2: Fallback to React fiber traversal (if webpack unavailable)
      const userElement =
        document.querySelector('[class*="avatar"]') || document.querySelector('[class*="user"]');
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

  getMessageTimestamp(messageElement) {
    try {
      // Method 1: Try React props (most reliable)
      const reactKey = this.getReactFiberKey(messageElement);
      if (reactKey) {
        let fiber = messageElement[reactKey];
        for (let i = 0; i < 20 && fiber; i++) {
          const timestamp =
            fiber.memoizedProps?.message?.timestamp ||
            fiber.memoizedState?.message?.timestamp ||
            fiber.memoizedProps?.message?.createdTimestamp;
          if (timestamp) {
            // Discord timestamps can be in seconds or milliseconds
            return typeof timestamp === 'string'
              ? new Date(timestamp).getTime()
              : timestamp < 1000000000000
              ? timestamp * 1000
              : timestamp;
          }
          fiber = fiber.return;
        }
      }
  
      // Method 2: Try to find timestamp element in DOM
      const timestampElement = messageElement.querySelector('[class*="timestamp"]');
      if (timestampElement) {
        const timeAttr =
          timestampElement.getAttribute('datetime') || timestampElement.getAttribute('title');
        if (timeAttr) {
          const parsed = new Date(timeAttr).getTime();
          if (!isNaN(parsed)) return parsed;
        }
      }
  
      // Method 3: Check if message was just added (within last 5 seconds = likely new)
      // This is a fallback for messages without timestamp data
      const addedTime = this._domNodeAddedTime?.get(messageElement);
      const elementAge = Date.now() - (addedTime || Date.now());
      if (elementAge < 5000) {
        // Assume it's new if added within last 5 seconds
        return Date.now();
      }
  
      return null;
    } catch (error) {
      this.debugError('GET_MESSAGE_TIMESTAMP', error);
      return null;
    }
  },

  isSystemMessage(messageElement) {
    // Check if message is a system message
    const systemClasses = ['systemMessage', 'systemText', 'joinMessage', 'leaveMessage'];
    const classes = Array.from(messageElement.classList || []);
    return classes.some((c) => systemClasses.some((sc) => c.includes(sc)));
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
        messageElement.querySelector('[class*="username"]') ||
        messageElement.querySelector('[class*="author"]') ||
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
        .querySelector('[class*="timestamp"]')
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
