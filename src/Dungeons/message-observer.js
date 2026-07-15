const { acquireDispatcher, pollForDispatcher } = require("../shared/dispatcher");

/**
 * Message handling — FluxDispatcher MESSAGE_CREATE driven.
 *
 * PERF (2026-07-14): this module used to be a DOM MutationObserver that ran
 * ~12 DOM traversals per message (getMessageId + getMessageTimestamp with a
 * 20-deep React-fiber-walk fallback + isUserMessage's up-to-8 querySelector
 * calls), for every message from every author, plus a subtree:true callback
 * that fired for every reaction / embed load / hover button. In busy servers
 * that pegged the main thread.
 *
 * It now subscribes to FluxDispatcher MESSAGE_CREATE instead. The event hands
 * over the message object directly, so id / author / bot / timestamp / channel
 * are plain property reads and the hot path does zero DOM work. The only DOM
 * lookup left is a single, exact-selector query for the crit-damage bonus, and
 * only for the current user's OWN messages while they have an active dungeon in
 * the viewed channel — a tiny fraction of traffic. (Same pattern CriticalHit
 * already uses.)
 *
 * Method names startMessageObserver / stopMessageObserver are kept because the
 * lifecycle (lifecycle.js start/stop) calls them; they now manage the
 * subscription rather than a MutationObserver.
 *
 * Mixed onto the plugin prototype via Object.assign — `this` is the plugin.
 */
module.exports = {
  startMessageObserver() {
    if (this._msgDispatcher || this._msgDispatcherPoll) return;
    try {
      const d = acquireDispatcher();
      if (d) {
        this._msgDispatcher = d;
        this._subscribeMessageDispatcher();
        return;
      }
      // Not ready yet — poll with backoff, then subscribe once acquired.
      this._msgDispatcherPoll = pollForDispatcher({
        onAcquired: (dd) => {
          this._msgDispatcherPoll = null;
          if (!this.started) return; // stopped while we waited
          this._msgDispatcher = dd;
          this._subscribeMessageDispatcher();
        },
        onTimeout: () => {
          this._msgDispatcherPoll = null;
          this.errorLog?.('MESSAGE_DISPATCHER', 'FluxDispatcher unavailable after 30s — Dungeons will not react to messages');
        },
        onPoll: () => { if (!this.started) this._msgDispatcherPoll?.cancel?.(); },
      });
    } catch (error) {
      this.errorLog?.('MESSAGE_DISPATCHER', 'init failed', error);
    }
  },

  _subscribeMessageDispatcher() {
    if (!this._msgDispatcher || this._msgCreateHandler) return;
    this._msgCreateHandler = (payload) => this._onMessageCreate(payload);
    try {
      this._msgDispatcher.subscribe('MESSAGE_CREATE', this._msgCreateHandler);
      this.debugLog('MESSAGE_DISPATCHER', 'Subscribed to MESSAGE_CREATE');
    } catch (error) {
      this._msgCreateHandler = null;
      this.errorLog?.('MESSAGE_DISPATCHER', 'subscribe failed', error);
    }
  },

  stopMessageObserver() {
    if (this._msgDispatcher && this._msgCreateHandler) {
      try { this._msgDispatcher.unsubscribe('MESSAGE_CREATE', this._msgCreateHandler); } catch (_) {}
    }
    this._msgCreateHandler = null;
    this._msgDispatcher = null;
    if (this._msgDispatcherPoll) {
      try { this._msgDispatcherPoll.cancel?.(); } catch (_) {}
      this._msgDispatcherPoll = null;
    }
    // processedMessageIds intentionally NOT cleared here (bounded by the 1000-id
    // LRU below). Clearing it on channel switch would re-attribute every
    // still-cached id as "new" and re-trigger spawns/attacks. Full release
    // happens when the plugin stops and `this` is torn down.
  },

  _onMessageCreate(payload) {
    try {
      if (!this.started || !this.settings?.enabled) return;
      if (typeof document !== 'undefined' && document.hidden) return;

      const msg = payload && payload.message;
      if (!msg || !msg.id || !msg.channel_id || !msg.author || !msg.author.id) return;

      // ORDER (perf): free property-read rejects FIRST. Bot/webhook/system
      // traffic (a large share of busy-server volume) is dropped before any
      // store call, Set write, or timestamp parse. type 0 = default, 19 = reply.
      if (msg.author.bot || msg.webhook_id) return;
      if (msg.type !== 0 && msg.type !== 19) return;

      // Only react to the channel the user is actually viewing — mirrors the
      // old DOM observer, which only ever saw rendered messages in the open
      // channel. Without this, MESSAGE_CREATE for other subscribed channels
      // would change spawn frequency/distribution.
      const viewedChannelId = this._getViewedChannelId();
      if (!viewedChannelId || msg.channel_id !== viewedChannelId) return;

      // Dedup (bounded LRU — same policy as the old observer).
      if (this.processedMessageIds.has(msg.id)) return;
      this.processedMessageIds.add(msg.id);
      if (this.processedMessageIds.size > 1000) {
        const firstId = this.processedMessageIds.values().next().value;
        this.processedMessageIds.delete(firstId);
      }

      // Realtime guard: MESSAGE_CREATE is live, but keep the "ignore anything
      // before we started" gate for safety (e.g. a late-delivered dispatch).
      const ts = this._msgTimestampMs(msg.timestamp);
      if (ts && this.observerStartTime && ts < this.observerStartTime) return;

      this._processDungeonMessage(msg);
    } catch (error) {
      this.errorLog?.('MESSAGE_CREATE', 'handler failed', error);
    }
  },

  // Spawn + user-attack logic, driven by the message object (ported from the
  // old handleMessage). No DOM scraping — the element is fetched on demand only
  // for the crit bonus, below.
  _processDungeonMessage(msg) {
    const channelInfo = this.getChannelInfo() || this.getChannelInfoFromLocation();
    if (!channelInfo) return;

    const now = Date.now();
    const userChannelKey = `${channelInfo.guildId}_${channelInfo.channelId}`;
    const isGuild = Boolean(channelInfo.guildId) && channelInfo.guildId !== 'DM';

    if (isGuild) {
      const globalCooldownRaw = Number(this.settings?.globalSpawnCooldown);
      const globalCooldownDefault = Number(this.defaultSettings?.globalSpawnCooldown) || 60000;
      const globalCooldown = Number.isFinite(globalCooldownRaw) && globalCooldownRaw >= 0
        ? globalCooldownRaw
        : globalCooldownDefault;
      const inGlobalCooldown = this._lastGlobalSpawnTime &&
        (now - this._lastGlobalSpawnTime) < globalCooldown;

      // Fast gate: skip channel discovery while the global spawn cooldown holds.
      if (!inGlobalCooldown) {
        const spawnTarget = this.pickSpawnChannel(channelInfo);
        const channelKey = spawnTarget.channelKey || userChannelKey;
        const spawnChannelInfo = spawnTarget.channelInfo || channelInfo;
        this.checkDungeonSpawn(channelKey, spawnChannelInfo, { messageId: msg.id }).catch((err) => {
          this.errorLog('checkDungeonSpawn failed', err);
        });
      }
    }

    if (this.settings.userActiveDungeon === userChannelKey) {
      const userSlowMultiplier = this.getEntityAttackSlowMultiplier(userChannelKey, 'user', 'user', now);
      const effectiveUserAttackCooldown = this.getEffectiveUserAttackCooldownMs(
        (this.settings.userAttackCooldown || 2000) * userSlowMultiplier,
        this.settings.userAttackCooldown || 2000
      );
      if (now - this.lastUserAttackTime >= effectiveUserAttackCooldown) {
        // Stamp the cooldown at decision time so the deferred own-message path
        // below can't be re-entered by the next message.
        this.lastUserAttackTime = now;

        // The message element is used ONLY for the crit-damage bonus:
        // checkCriticalHit() looks for CriticalHit's `.bd-crit-hit` class, and
        // CriticalHit only ever styles the CURRENT user's OWN crits. So:
        //   - other authors' messages never crit -> pass null, attack now.
        //   - own messages MIGHT crit, but CriticalHit applies `.bd-crit-hit`
        //     ASYNCHRONOUSLY (a double-rAF after this same MESSAGE_CREATE
        //     dispatch, sometimes a 400ms straggler). Reading it synchronously
        //     here misses it every time. Defer the lookup + attack ~120ms to
        //     match the old observer's incidental 100ms flush delay, which is
        //     what let the crit bonus land. Non-crit attacks stay instant.
        if (this._isOwnAuthor(msg.author.id)) {
          this._setTrackedTimeout(() => {
            if (!this.started || !this.settings?.enabled) return;
            const el = this._findMessageElementById(msg.channel_id, msg.id);
            Promise.resolve(this.processUserAttack(userChannelKey, el)).catch((err) => {
              this.errorLog('processUserAttack failed', err);
            });
          }, 120);
        } else {
          Promise.resolve(this.processUserAttack(userChannelKey, null)).catch((err) => {
            this.errorLog('processUserAttack failed', err);
          });
        }
      }
    }
  },

  // ── small helpers ──────────────────────────────────────────────────────────

  _msgTimestampMs(ts) {
    if (ts == null) return null;
    if (typeof ts === 'number') return ts;
    // Discord dispatch timestamps are usually ISO strings; sometimes a
    // moment-like object with valueOf().
    if (typeof ts === 'object' && typeof ts.valueOf === 'function') {
      const v = ts.valueOf();
      return typeof v === 'number' ? v : null;
    }
    const t = new Date(ts).getTime();
    return Number.isNaN(t) ? null : t;
  },

  // PERF (2026-07-15): store refs are MEMOIZED on the instance. This runs per
  // MESSAGE_CREATE (every message from every author), and BdApi.Webpack.getStore
  // is a module-registry lookup — not guaranteed cached. Flux stores are stable
  // for the app's lifetime, so resolve once and retry only while null.
  _getViewedChannelId() {
    try {
      let store = this._selectedChannelStoreRef;
      if (!store) {
        store = BdApi.Webpack.getStore?.('SelectedChannelStore');
        if (!(store && typeof store.getChannelId === 'function')) {
          store = BdApi.Webpack.getStore?.('ChannelStore');
        }
        if (store && typeof store.getChannelId === 'function') {
          this._selectedChannelStoreRef = store;
        } else {
          return null;
        }
      }
      return store.getChannelId();
    } catch (_) {}
    return null;
  },

  _isOwnAuthor(authorId) {
    try {
      let store = this._userStoreRef;
      if (!store) {
        store = BdApi.Webpack.getStore?.('UserStore');
        if (store && typeof store.getCurrentUser === 'function') this._userStoreRef = store;
        else return false;
      }
      const me = store.getCurrentUser();
      return !!(me && me.id === authorId);
    } catch (_) {
      return false;
    }
  },

  // Exact lookup of a rendered message row by id. data-list-item-id is
  // "chat-messages-<channelId>-<messageId>". Returns the row (which carries or
  // contains CriticalHit's `.bd-crit-hit`), or null if not currently rendered.
  _findMessageElementById(channelId, messageId) {
    if (!messageId) return null;
    try {
      return document.querySelector(`[data-list-item-id="chat-messages-${channelId}-${messageId}"]`)
        || document.querySelector(`[data-list-item-id$="-${messageId}"]`)
        || null;
    } catch (_) {
      return null;
    }
  },
};
