import STYLES from "./styles.css";
const { pollForDispatcher } = require("../shared/dispatcher");
const { loadSettings, saveSettings } = require("../shared/settings");
const SLEvents = require("../shared/event-bus");
const { createContentCache } = require("./content-cache");
const { createDecorator } = require("./decorator");
const store = require("./history-store");

const { Webpack } = BdApi;

const PLUGIN_ID = "MessageEditHistory";
const STYLE_ID = "sl-message-edit-history-css";

// Cross-plugin event (shared/event-bus.js). Consumed by ShadowSenses to show
// edits by monitored users in its feed. This module is the source of truth for
// the payload shape — keep consumers in sync when it changes.
const EVENT_EDIT_RECORDED = "MessageEditHistory:editRecorded";

const DEFAULTS = {
  debug: false,
  // Keep the most recent N superseded versions per message.
  maxVersionsPerMessage: 20,
  // Records untouched for this long are pruned at start.
  retentionDays: 30,
  // Skip your own messages (you know what you wrote).
  ignoreOwnMessages: false,
};

const PRUNE_LIMIT_PER_PASS = 500;
const SEED_ID_LIMIT = 2000;

/**
 * 1) Lifecycle + settings
 * 2) Dispatch handling (content snapshots + edit capture)
 * 3) Old-content resolution
 * 4) Settings panel
 */
module.exports = class MessageEditHistory {
  constructor() {
    this._settings = loadSettings(PLUGIN_ID, DEFAULTS);
    this._dispatcher = null;
    this._pollHandle = null;
    this._cache = createContentCache();
    this._knownIds = new Set();
    this._decorator = null;
    this._stopped = true;

    // Bound once: FluxDispatcher.unsubscribe requires the identical reference.
    this._onMessageCreate = this._handleMessageCreate.bind(this);
    this._onMessageUpdate = this._handleMessageUpdate.bind(this);
    this._onMessagesLoaded = this._handleMessagesLoaded.bind(this);
  }

  // ── 1) LIFECYCLE ────────────────────────────────────────────────

  _log(...args) {
    if (!this._settings.debug) return;
    console.log(`[${PLUGIN_ID}:DEBUG]`, ...args);
  }

  _error(context, err) {
    console.error(`[${PLUGIN_ID}] ${context}:`, err);
  }

  start() {
    this._stopped = false;
    BdApi.DOM.addStyle(STYLE_ID, STYLES);

    this._decorator = createDecorator({
      knownIds: this._knownIds,
      loadRecord: (id) => store.getRecord(id),
      formatTimestamp: (ms) => new Date(ms).toLocaleString(),
      onError: (ctx, err) => this._error(ctx, err),
    });

    // Seed the decorator's id set from previously stored history (bounded),
    // then start it. Ordering matters: starting first would leave already-
    // rendered edited messages undecorated until the next mutation.
    store.loadRecentIds(SEED_ID_LIMIT)
      .then((ids) => {
        if (this._stopped) return;
        for (const id of ids) this._knownIds.add(id);
        this._log(`seeded ${ids.length} known edited messages`);
        this._decorator.scanExisting();
      })
      .catch((err) => this._error("seed known ids", err));

    this._decorator.start();

    // Age out old records once per start rather than on a timer — the store
    // only grows on edits, so a startup pass is sufficient and costs nothing
    // during a session.
    const maxAge = this._settings.retentionDays * 24 * 60 * 60 * 1000;
    store.pruneOlderThan(maxAge, PRUNE_LIMIT_PER_PASS)
      .then((n) => { if (n > 0) this._log(`pruned ${n} records older than ${this._settings.retentionDays}d`); })
      .catch((err) => this._error("prune", err));

    this._pollHandle = pollForDispatcher({
      onAcquired: (d) => {
        if (this._stopped) return;
        this._dispatcher = d;
        d.subscribe("MESSAGE_CREATE", this._onMessageCreate);
        d.subscribe("MESSAGE_UPDATE", this._onMessageUpdate);
        d.subscribe("LOAD_MESSAGES_SUCCESS", this._onMessagesLoaded);
        this._log("dispatcher acquired, subscribed");
      },
      onTimeout: () => this._error("startup", new Error("FluxDispatcher unavailable after 30s")),
    });
  }

  stop() {
    this._stopped = true;

    if (this._pollHandle) {
      this._pollHandle.cancel();
      this._pollHandle = null;
    }

    if (this._dispatcher) {
      this._dispatcher.unsubscribe("MESSAGE_CREATE", this._onMessageCreate);
      this._dispatcher.unsubscribe("MESSAGE_UPDATE", this._onMessageUpdate);
      this._dispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", this._onMessagesLoaded);
      this._dispatcher = null;
    }

    if (this._decorator) {
      this._decorator.stop();
      this._decorator = null;
    }

    this._cache.clear();
    this._knownIds.clear();
    store.closeDb();
    BdApi.DOM.removeStyle(STYLE_ID);
  }

  // ── 2) DISPATCH HANDLING ────────────────────────────────────────

  /** Snapshot new messages so a later edit has an old value to compare against. */
  _handleMessageCreate(event) {
    try {
      const msg = event?.message;
      if (!msg?.id) return;
      this._cache.set(msg.id, msg.content ?? "");
    } catch (err) {
      this._error("MESSAGE_CREATE", err);
    }
  }

  /** Snapshot messages arriving from channel history (scrollback, channel switch). */
  _handleMessagesLoaded(event) {
    try {
      const messages = event?.messages;
      if (!Array.isArray(messages)) return;
      for (const msg of messages) {
        if (!msg?.id) continue;
        // Never clobber a live snapshot with a stale API payload: a message
        // edited this session may come back from the API pre-edit.
        if (this._cache.get(msg.id) === undefined) this._cache.set(msg.id, msg.content ?? "");
      }
    } catch (err) {
      this._error("LOAD_MESSAGES_SUCCESS", err);
    }
  }

  _handleMessageUpdate(event) {
    try {
      const msg = event?.message;
      if (!msg?.id) return;

      // MESSAGE_UPDATE also fires for embed resolution, link unfurls, and
      // flag changes. Those payloads carry no `content` at all — treating an
      // absent field as an edit to "" would fabricate history.
      if (typeof msg.content !== "string") return;

      const newContent = msg.content;
      const oldContent = this._resolveOldContent(msg.id, msg.channel_id, newContent);

      // Always refresh the snapshot, even when we bail below — the new text is
      // the baseline for the *next* edit.
      this._cache.set(msg.id, newContent);

      if (oldContent === undefined) {
        this._log("edit seen but no prior content known:", msg.id);
        return;
      }
      if (oldContent === newContent) return; // embed/flag churn, not a text edit

      if (this._settings.ignoreOwnMessages && this._isOwnMessage(msg)) return;

      this._knownIds.add(msg.id);
      this._decorator?.decorateNow(msg.id);

      const at = Date.now();

      store.appendVersion({
        messageId: msg.id,
        channelId: msg.channel_id ?? null,
        authorId: msg.author?.id ?? null,
        previousContent: oldContent,
        at,
      }, this._settings.maxVersionsPerMessage)
        .catch((err) => this._error("appendVersion", err));

      // Announce to the suite. Emitted independently of the write above so a
      // storage failure doesn't also cost the live notification — consumers
      // treat this as a signal, not a promise that the version was persisted.
      try {
        SLEvents.emit(EVENT_EDIT_RECORDED, {
          messageId: msg.id,
          channelId: msg.channel_id ?? null,
          authorId: msg.author?.id ?? null,
          previousContent: oldContent,
          newContent,
          at,
        });
      } catch (err) {
        this._error("emit editRecorded", err);
      }

      this._log("recorded edit for", msg.id);
    } catch (err) {
      this._error("MESSAGE_UPDATE", err);
    }
  }

  // ── 3) OLD-CONTENT RESOLUTION ───────────────────────────────────

  /**
   * Recover the text as it was before this edit.
   *
   * Two independent sources, because neither is reliable alone:
   *   - Our own snapshot cache. Immune to dispatch ordering, but only covers
   *     messages seen this session.
   *   - MessageStore. Covers anything Discord has loaded, but holds the old
   *     text only if our subscriber runs before the store's action handler.
   *     Flux runs store handlers first and plain subscribers after, so this is
   *     usually already updated — detectable by it matching the new content.
   *
   * Cache wins when present; the store is the fallback, and only when it still
   * disagrees with the new content (proving it has not applied the edit yet).
   *
   * @returns {string|undefined} undefined when the old text is unrecoverable.
   */
  _resolveOldContent(messageId, channelId, newContent) {
    const cached = this._cache.get(messageId);
    if (cached !== undefined) return cached;

    try {
      const MessageStore = Webpack.Stores?.MessageStore;
      if (!MessageStore || !channelId) return undefined;
      const stored = MessageStore.getMessage(channelId, messageId);
      const storedContent = stored?.content;
      if (typeof storedContent !== "string") return undefined;
      return storedContent === newContent ? undefined : storedContent;
    } catch (err) {
      this._error("MessageStore lookup", err);
      return undefined;
    }
  }

  _isOwnMessage(msg) {
    try {
      const currentUserId = Webpack.Stores?.UserStore?.getCurrentUser?.()?.id;
      return Boolean(currentUserId) && msg.author?.id === currentUserId;
    } catch (_) {
      return false;
    }
  }

  // ── 4) SETTINGS PANEL ───────────────────────────────────────────

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.cssText =
      "padding:12px;background:rgba(10, 10, 16, 0.98);border-radius:2px;color:#dcddde;";

    const stats = document.createElement("div");
    stats.style.cssText = "margin-bottom:12px;font-size:13px;opacity:0.85;";
    stats.textContent = "Stored edited messages: loading…";
    store.countRecords()
      .then((n) => { stats.textContent = `Stored edited messages: ${n}`; })
      .catch(() => { stats.textContent = "Stored edited messages: unavailable"; });
    panel.appendChild(stats);

    const addToggle = (label, key) => {
      const row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = this._settings[key];
      cb.addEventListener("change", () => {
        this._settings[key] = cb.checked;
        saveSettings(PLUGIN_ID, this._settings);
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(label));
      panel.appendChild(row);
    };

    addToggle("Ignore my own messages", "ignoreOwnMessages");
    addToggle("Debug Mode — log capture diagnostics to console", "debug");

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear all stored history";
    clearBtn.style.cssText =
      "margin-top:8px;padding:6px 12px;background:#3a1116;color:#f5a3a3;border:1px solid #6b1f28;border-radius:3px;cursor:pointer;";
    clearBtn.addEventListener("click", () => {
      store.clearAll()
        .then(() => {
          this._knownIds.clear();
          this._decorator?.stop();
          this._decorator?.start();
          stats.textContent = "Stored edited messages: 0";
        })
        .catch((err) => this._error("clearAll", err));
    });
    panel.appendChild(clearBtn);

    return panel;
  }
};
