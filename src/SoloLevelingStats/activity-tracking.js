module.exports = {
  startActivityTracking() {
    if (this.activityTracker) return;

    // Track time active
    this.activityTracker = setInterval(() => {
      const now = Date.now();
      const timeDiff = (now - this.settings.activity.lastActiveTime) / 1000 / 60; // minutes
  
      // Only count if user was active in last 5 minutes
      if (timeDiff < 5) {
        this.settings.activity.timeActive += timeDiff;
        this.settings.activity.lastActiveTime = now;
  
        // Only save if meaningful time accumulated (>6 seconds)
        if (timeDiff > 0.1) {
          this.saveSettings();
        }
  
        // Update daily quest: Active Adventurer
        this.updateQuestProgress('activeAdventurer', timeDiff);
      }
    }, 60000); // Check every minute
  
    // Track mouse/keyboard activity (throttled — was firing hundreds of times/sec on mousemove)
    this._lastActivityReset = 0;
    const resetActivityTimeout = () => {
      const now = Date.now();
      // Throttle: only process once per 2 seconds (mousemove fires 100s/sec)
      if (now - this._lastActivityReset < 2000) return;
      this._lastActivityReset = now;
      this.settings.activity.lastActiveTime = now;
    };
  
    // Store handlers for cleanup
    this._activityTrackingHandlers = {
      mousemove: resetActivityTimeout,
      keydown: resetActivityTimeout,
    };
  
    document.addEventListener('mousemove', resetActivityTimeout, { passive: true });
    document.addEventListener('keydown', resetActivityTimeout);
    resetActivityTimeout();
  },

  trackChannelVisit() {
    try {
      const channelInfo = this.getCurrentChannelInfo();
  
      if (!channelInfo) {
        this.debugLog('TRACK_CHANNEL_VISIT', 'No channel info found', {
          currentUrl: window.location.href,
        });
        return;
      }
  
      const { channelId, channelType, serverId, isDM } = channelInfo;
  
      // Ensure channelsVisited is a Set
      if (!(this.settings.activity.channelsVisited instanceof Set)) {
        if (Array.isArray(this.settings.activity.channelsVisited)) {
          this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
        } else {
          this.settings.activity.channelsVisited = new Set();
        }
      }
  
      const previousSize = this.settings.activity.channelsVisited.size;
      const wasNewChannel = !this.settings.activity.channelsVisited.has(channelId);
  
      this.settings.activity.channelsVisited.add(channelId);
  
      // Reduced verbosity - only log if verbose mode enabled or if it's a new channel
      if (wasNewChannel || this.debug.verbose) {
        this.debugLog('TRACK_CHANNEL_VISIT', 'Channel visit tracked', {
          channelId,
          channelType,
          serverId: serverId || 'N/A (DM)',
          isDM,
          wasNewChannel,
          previousCount: previousSize,
          newCount: this.settings.activity.channelsVisited.size,
          totalChannels: this.settings.activity.channelsVisited.size,
        });
      }
  
      // If new channel, update quest and save immediately
      if (wasNewChannel) {
        this.debugLog('TRACK_CHANNEL_VISIT', 'New channel discovered!', {
          channelId,
          channelType,
          isDM,
        });
        this.updateQuestProgress('channelExplorer', 1);
  
        // Save immediately when discovering a new channel
        this.saveSettings(true);
        this.debugLog('TRACK_CHANNEL_VISIT', 'Settings saved immediately after new channel visit');
      }
    } catch (error) {
      this.debugError('TRACK_CHANNEL_VISIT', error, {
        currentUrl: window.location.href,
      });
    }
  },

  startChannelTracking() {
    try {
      this.debugLog('START_CHANNEL_TRACKING', 'Starting real-time channel change detection');
  
      // Avoid duplicate hooks/listeners on reloads
      if (this._channelTrackingHooks) return;
  
      // Track current URL to detect changes
      const state = {
        lastUrl: window.location.href,
        lastChannelId: null,
      };
  
      // Get initial channel ID
      const initialInfo = this.getCurrentChannelInfo();
      if (initialInfo) {
        state.lastChannelId = initialInfo.channelId;
        this.debugLog('START_CHANNEL_TRACKING', 'Initial channel detected', {
          channelId: state.lastChannelId,
          channelType: initialInfo.channelType,
          url: state.lastUrl,
        });
      }
  
      // PERF(P5-1): Use shared NavigationBus instead of independent pushState/popstate wrappers
      // Replaces Methods 1+2 (popstate + pushState/replaceState) with single bus subscription
      if (this._PluginUtils?.NavigationBus) {
        this._navBusUnsub = this._PluginUtils.NavigationBus.subscribe(({ url }) => {
          if (url !== state.lastUrl) {
            this.debugLog('START_CHANNEL_TRACKING', 'URL changed via NavigationBus', {
              oldUrl: state.lastUrl,
              newUrl: url,
            });
            state.lastUrl = url;
            this._channelInfoCacheUrl = null;
            this._channelInfoCache = null;
            state.lastChannelId = this.handleChannelChange(state.lastChannelId);
          }
        });
      }
  
      // Method 3: Poll URL changes (safety-net fallback)
      this.channelTrackingInterval = setInterval(() => {
        if (document.hidden) return;
        const currentUrl = window.location.href;
        if (currentUrl !== state.lastUrl) {
          this.debugLog('START_CHANNEL_TRACKING', 'URL changed via polling', {
            oldUrl: state.lastUrl,
            newUrl: currentUrl,
          });
          state.lastUrl = currentUrl;
          this._channelInfoCacheUrl = null;
          this._channelInfoCache = null;
          state.lastChannelId = this.handleChannelChange(state.lastChannelId);
        }
      }, 3000); // PERF: 3s fallback poll (NavigationBus handles most navigation)
  
      this._channelTrackingState = state;
      this._channelTrackingHooks = true;
  
      this.debugLog('START_CHANNEL_TRACKING', 'Channel tracking started successfully', {
        methods: ['NavigationBus', 'polling'],
        pollInterval: '3000ms',
      });
    } catch (error) {
      this._channelTrackingHooks = null;
      this.debugError('START_CHANNEL_TRACKING', error);
    }
  }
};
