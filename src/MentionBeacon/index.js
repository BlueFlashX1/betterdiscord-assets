/**
 * MentionBeacon — passive mention + VC speaking capture.
 *
 * BAN-SAFETY DOCTRINE (docs/SPEC-mention-beacon.md): this plugin makes ZERO
 * network requests and mutates ZERO Discord state. It only (a) subscribes to
 * FluxDispatcher events the client already receives and (b) reads
 * already-populated stores via getters. All output is local file writes.
 * Avatar URLs are constructed as plain CDN strings — the widget's webview
 * fetches them like any <img>, the plugin itself never does.
 *
 * Output (consumed by the Übersicht discord widget):
 *   ~/.cache/discord-pulse/mentions.json  — rolling 3-day mention feed
 *   ~/.cache/discord-pulse/vc.json        — live voice-call state
 */

const { pollForDispatcher } = require("../shared/dispatcher");
const { loadSettings, saveSettings } = require("../shared/settings");
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(process.env.HOME || "", ".cache", "discord-pulse");
const MENTIONS_FILE = path.join(OUT_DIR, "mentions.json");
const VC_FILE = path.join(OUT_DIR, "vc.json");

const WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // rolling 3 days
const MAX_MENTIONS = 200;                  // hard cap regardless of age
const MENTIONS_WRITE_DEBOUNCE_MS = 2000;   // suite persistence convention
const VC_WRITE_COALESCE_MS = 250;          // SPEAKING events are chatty

const DEFAULTS = {
  dmMessages: true,        // DMs/group DMs count as mentions
  roleMentions: true,      // @role where self holds the role
  everyoneMentions: false, // @everyone/@here — noisy, default off
  debug: false,
};

module.exports = class MentionBeacon {
  constructor(meta) {
    this.meta = meta;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  start() {
    this.settings = loadSettings("MentionBeacon", DEFAULTS);
    this.stats = { captured: 0, vcWrites: 0 };

    // Feed survives plugin reloads/Discord restarts via its own output file.
    const prior = this._readJson(MENTIONS_FILE);
    this.mentions = (prior && Array.isArray(prior.mentions)) ? prior.mentions : [];
    this._prune();

    this._subs = [];
    this._speaking = new Set();
    this._vcState = { inVC: false };
    this._mentionsTimer = null;
    this._vcTimer = null;

    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
    } catch (err) {
      console.error("[MentionBeacon] cannot create output dir:", err);
    }

    this._poll = pollForDispatcher({
      onAcquired: (d) => {
        this._Dispatcher = d;
        this._acquireStores();
        // Migrate previews persisted by older builds: re-run the humanizer
        // over stored entries so raw markup (<:emoji:id>, <@id>, …) captured
        // before v1.0.1 doesn't sit ugly in the widget for 3 days. Idempotent
        // — clean previews pass through unchanged.
        this.mentions = this.mentions.map((m) => m && m.preview
          ? { ...m, preview: this._clamp(this._humanize(m.preview, null), 90) }
          : m);
        this._subscribe();
        this._refreshVC();
        this._writeMentionsNow(); // widget sees a valid (and cleaned) file immediately
      },
      onTimeout: () => {
        console.error("[MentionBeacon] FluxDispatcher unavailable — inert");
      },
    });
  }

  stop() {
    if (this._poll && this._poll.cancel) this._poll.cancel();
    if (this._Dispatcher) {
      for (const [ev, fn] of this._subs) {
        try { this._Dispatcher.unsubscribe(ev, fn); } catch (e) { /* gone */ }
      }
    }
    this._subs = [];
    // Flush pending writes so nothing is lost across reloads.
    if (this._mentionsTimer) { clearTimeout(this._mentionsTimer); this._mentionsTimer = null; }
    if (this._vcTimer) { clearTimeout(this._vcTimer); this._vcTimer = null; }
    this._writeMentionsNow();
    this._vcState = { inVC: false };
    this._writeVCNow();
  }

  // ── acquisition ──────────────────────────────────────────────────────────

  _acquireStores() {
    const { Webpack } = BdApi;
    const S = Webpack.Stores || {};
    this._UserStore = S.UserStore;
    this._ChannelStore = S.ChannelStore;
    this._GuildStore = S.GuildStore;
    this._GuildMemberStore = S.GuildMemberStore;
    this._SelectedChannelStore = S.SelectedChannelStore;
    this._VoiceStateStore = S.VoiceStateStore ||
      // NO optional chaining in Webpack filters (breaks matching).
      Webpack.getModule((m) => m.getVoiceStatesForChannel && m.getVoiceStateForUser);
    const me = this._UserStore && this._UserStore.getCurrentUser();
    this._selfId = me ? me.id : null;
  }

  _subscribe() {
    const D = this._Dispatcher;
    const sub = (ev, fn) => { D.subscribe(ev, fn); this._subs.push([ev, fn]); };
    sub("MESSAGE_CREATE", (p) => this._handleMessage(p));
    sub("VOICE_STATE_UPDATES", () => this._refreshVC());
    sub("RTC_CONNECTION_STATE", () => this._refreshVC());
    sub("SPEAKING", (p) => this._handleSpeaking(p));
  }

  // ── mentions ─────────────────────────────────────────────────────────────

  _handleMessage(payload) {
    try {
      const msg = payload && payload.message;
      if (!msg || !msg.author) return;
      if (!this._selfId) { this._acquireStores(); if (!this._selfId) return; }
      // Hot-path gate order (PERF-CONVENTIONS): cheapest, most-likely-to-
      // reject first — own messages are the bulk of dispatches we can drop.
      if (msg.author.id === this._selfId) return;
      const kind = this._mentionKind(msg);
      if (!kind) return;

      const ch = this._ChannelStore ? this._ChannelStore.getChannel(msg.channel_id) : null;
      const guild = ch && ch.guild_id && this._GuildStore
        ? this._GuildStore.getGuild(ch.guild_id) : null;

      this.mentions.unshift({
        id: msg.id,
        ts: Date.parse(msg.timestamp) || Date.now(),
        kind,
        authorId: msg.author.id,
        authorName: msg.author.global_name || msg.author.username || "?",
        avatar: msg.author.avatar
          ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=64`
          : null,
        guildId: (ch && ch.guild_id) || null,
        guildName: guild ? guild.name : ((ch && ch.guild_id) ? "Unknown" : "DM"),
        channelId: msg.channel_id,
        channelName: ch ? (ch.name || "DM") : "?",
        preview: this._clamp(
          this._humanize(msg.content, ch) ||
          (msg.attachments && msg.attachments.length ? "[attachment]" : "[embed]"),
          90
        ),
        // Custom emoji used in the message, name -> CDN id, so the widget can
        // render the actual emote image inline (passive CDN load, same as
        // avatars). Animated ones get .gif.
        emojis: this._extractEmojis(msg.content),
      });
      this.stats.captured++;
      this._prune();
      this._scheduleMentionsWrite();
    } catch (err) {
      if (this.settings.debug) console.error("[MentionBeacon] message handler:", err);
    }
  }

  _mentionKind(msg) {
    const ch = this._ChannelStore ? this._ChannelStore.getChannel(msg.channel_id) : null;
    // DM (1) / group DM (3): any message aimed at us counts.
    if (ch && (ch.type === 1 || ch.type === 3)) {
      return this.settings.dmMessages ? "dm" : null;
    }
    if (Array.isArray(msg.mentions) &&
        msg.mentions.some((u) => u && u.id === this._selfId)) {
      return "direct";
    }
    if (this.settings.everyoneMentions && msg.mention_everyone) return "everyone";
    if (this.settings.roleMentions &&
        Array.isArray(msg.mention_roles) && msg.mention_roles.length &&
        ch && ch.guild_id && this._GuildMemberStore) {
      const me = this._GuildMemberStore.getMember(ch.guild_id, this._selfId);
      if (me && Array.isArray(me.roles) &&
          msg.mention_roles.some((r) => me.roles.includes(r))) {
        return "role";
      }
    }
    return null;
  }

  _prune() {
    const cutoff = Date.now() - WINDOW_MS;
    this.mentions = this.mentions.filter((m) => m && m.ts >= cutoff).slice(0, MAX_MENTIONS);
  }

  _scheduleMentionsWrite() {
    if (this._mentionsTimer) return; // trailing-edge debounce
    this._mentionsTimer = setTimeout(() => {
      this._mentionsTimer = null;
      this._writeMentionsNow();
    }, MENTIONS_WRITE_DEBOUNCE_MS);
  }

  _writeMentionsNow() {
    try {
      fs.writeFileSync(
        MENTIONS_FILE,
        JSON.stringify({ updated: Date.now(), mentions: this.mentions })
      );
    } catch (err) {
      console.error("[MentionBeacon] mentions write failed:", err);
    }
  }

  // ── voice call ───────────────────────────────────────────────────────────

  _refreshVC() {
    try {
      const chId = this._SelectedChannelStore &&
        this._SelectedChannelStore.getVoiceChannelId &&
        this._SelectedChannelStore.getVoiceChannelId();
      if (!chId) {
        if (this._vcState.inVC) {
          this._vcState = { inVC: false };
          this._speaking.clear();
          this._writeVCNow(); // immediate: widget drops its fast poll
        }
        return;
      }
      const ch = this._ChannelStore ? this._ChannelStore.getChannel(chId) : null;
      const guild = ch && ch.guild_id && this._GuildStore
        ? this._GuildStore.getGuild(ch.guild_id) : null;
      const states = (this._VoiceStateStore && this._VoiceStateStore.getVoiceStatesForChannel)
        ? this._VoiceStateStore.getVoiceStatesForChannel(chId) : null;

      const members = Object.values(states || {}).map((vs) => {
        const u = this._UserStore ? this._UserStore.getUser(vs.userId) : null;
        if (!u) return null;
        return {
          id: u.id,
          name: u.global_name || u.username || "?",
          avatar: u.avatar
            ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
            : null,
          self: u.id === this._selfId,
          speaking: this._speaking.has(u.id),
          muted: !!(vs.selfMute || vs.mute),
          deafened: !!(vs.selfDeaf || vs.deaf),
        };
      }).filter(Boolean);

      this._vcState = {
        inVC: true,
        guildName: guild ? guild.name : "",
        channelName: ch ? (ch.name || "Voice") : "Voice",
        members,
      };
      this._scheduleVCWrite();
    } catch (err) {
      if (this.settings.debug) console.error("[MentionBeacon] VC refresh:", err);
    }
  }

  _handleSpeaking(payload) {
    if (!payload || !payload.userId || !this._vcState.inVC) return;
    const now = !!payload.speakingFlags;
    const was = this._speaking.has(payload.userId);
    if (now === was) return;
    if (now) this._speaking.add(payload.userId);
    else this._speaking.delete(payload.userId);
    const m = this._vcState.members &&
      this._vcState.members.find((x) => x.id === payload.userId);
    if (m) m.speaking = now;
    this._scheduleVCWrite();
  }

  _scheduleVCWrite() {
    if (this._vcTimer) return;
    this._vcTimer = setTimeout(() => {
      this._vcTimer = null;
      this._writeVCNow();
    }, VC_WRITE_COALESCE_MS);
  }

  _writeVCNow() {
    try {
      fs.writeFileSync(
        VC_FILE,
        JSON.stringify({ updated: Date.now(), ...this._vcState })
      );
      this.stats.vcWrites++;
    } catch (err) {
      console.error("[MentionBeacon] vc write failed:", err);
    }
  }

  // ── settings panel (suite convention: stats + toggles + Debug Mode) ─────

  getSettingsPanel() {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "background: rgba(10,10,16,0.98); padding: 16px; border-radius: 8px; color: #dde;" +
      "font-size: 13px; line-height: 1.7;";

    const stats = document.createElement("div");
    stats.style.cssText = "opacity:.8; margin-bottom:12px;";
    stats.textContent =
      `Feed: ${this.mentions.length} mention(s) in window · ` +
      `captured this session: ${this.stats.captured} · VC writes: ${this.stats.vcWrites}`;
    wrap.appendChild(stats);

    const toggle = (key, label) => {
      const row = document.createElement("label");
      row.style.cssText = "display:flex; gap:8px; align-items:center; cursor:pointer;";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !!this.settings[key];
      box.onchange = () => {
        this.settings[key] = box.checked;
        saveSettings("MentionBeacon", this.settings);
      };
      const span = document.createElement("span");
      span.textContent = label;
      row.appendChild(box);
      row.appendChild(span);
      wrap.appendChild(row);
    };

    toggle("dmMessages", "Capture DMs / group DMs");
    toggle("roleMentions", "Capture @role mentions (roles you hold)");
    toggle("everyoneMentions", "Capture @everyone / @here");
    toggle("debug", "Debug Mode (log handler errors)");

    return wrap;
  }

  // ── util ─────────────────────────────────────────────────────────────────

  _clamp(text, max) {
    const s = String(text).replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max) + "…" : s;
  }

  _extractEmojis(content) {
    if (!content) return undefined;
    const out = {};
    let found = false;
    for (const m of String(content).matchAll(/<(a?):(\w+):(\d+)>/g)) {
      if (!out[m[2]]) { out[m[2]] = { id: m[3], anim: !!m[1] }; found = true; }
    }
    return found ? out : undefined;
  }

  /**
   * Turn Discord's raw markup into readable text for the widget preview:
   *   <:Skull_Cry:152589…>  -> :Skull_Cry:      (custom emoji, also <a:…>)
   *   <@123…> / <@!123…>    -> @username         (resolved via UserStore)
   *   <#123…>               -> #channel-name     (resolved via ChannelStore)
   *   <@&123…>              -> @role-name        (GuildRolesStore — roles
   *                            moved out of GuildStore; see DKB entry)
   * All lookups are passive store getters; unresolvable ids degrade to
   * generic labels rather than leaking number strings.
   */
  _humanize(content, ch) {
    if (!content) return content;
    let s = String(content);
    s = s.replace(/<a?:(\w+):\d+>/g, ":$1:");
    s = s.replace(/<@!?(\d+)>/g, (_, id) => {
      const u = this._UserStore && this._UserStore.getUser(id);
      return u ? `@${u.global_name || u.username}` : "@user";
    });
    s = s.replace(/<#(\d+)>/g, (_, id) => {
      const c = this._ChannelStore && this._ChannelStore.getChannel(id);
      return c && c.name ? `#${c.name}` : "#channel";
    });
    s = s.replace(/<@&(\d+)>/g, (_, id) => {
      try {
        const { Webpack } = BdApi;
        const S = Webpack.Stores || {};
        const rolesStore = S.GuildRoleStore || S.GuildRolesStore;
        const guildId = ch && ch.guild_id;
        if (rolesStore && guildId && rolesStore.getRole) {
          const r = rolesStore.getRole(guildId, id);
          if (r && r.name) return `@${r.name}`;
        }
      } catch (e) { /* fall through */ }
      return "@role";
    });
    return s;
  }

  _readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { return null; }
  }
};
