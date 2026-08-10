# SPEC: MentionBeacon — BD plugin + one Discord desktop widget

> 2026-08-09. Origin: desktop-widget planning session (Übersicht wall).
> Decision record: a BD plugin beats a VPS bot module for this — it sees with
> the USER's eyes (all servers + DMs, no bot-membership scoping) and keeps the
> whole pipeline local. VC visualization collapses into the same plugin
> (client receives SPEAKING/voice-state events natively — the same data
> Overlayed extracts via RPC).

## Goal

ONE Übersicht widget ("Discord" panel) showing:
1. **Mentions feed** — who mentioned Matthew, in which server/#channel, message
   preview, age; rolling **3-day** window; visual flash on new arrivals
   (deaf-accessible — this is the primary notification surface).
2. **Voice call view** — when he's in a VC: channel name + participant list
   with **live speaking indicators** (glow on the speaker).

## Ban-safety doctrine (NON-NEGOTIABLE design rules)

The plugin must be **purely observational** — indistinguishable from vanilla
client usage at the network level:

- **NO REST/API calls, ever.** Not even "harmless" fetches. The plugin only
  (a) subscribes to FluxDispatcher events the client already receives, and
  (b) reads already-populated Flux stores via their getters.
- **NO message sending, reacting, acking, or any state mutation.**
- **NO forced backfill.** Mentions missed while Discord was closed populate
  only if/when Discord itself loads the Inbox→Mentions store (reading a
  populated store is passive). If it's empty, the feed is live-only. Do NOT
  call fetch/load actions on stores — that's the line between reading and
  requesting.
- **All output is local file writes** — zero network surface. Nothing this
  plugin does is visible to Discord's servers beyond running BetterDiscord
  itself (the pre-existing, accepted client-mod exposure shared by the other
  20 plugins in this suite).
- Honest risk statement: BD itself is technically against ToS; this plugin
  adds no *detectable* behavior on top of it. Passive store-reading plugins
  are the lowest-risk class that exists.

## Architecture

```
Discord client (BD)                         Übersicht
┌─────────────────────────┐    writes    ┌──────────────────────┐
│ MentionBeacon.plugin.js │ ───────────▶ │ discord.widget       │
│  MESSAGE_CREATE gate    │  mentions.json│  Mentions list       │
│  VOICE_STATE + SPEAKING │  vc.json     │  VC speaking grid    │
└─────────────────────────┘              │  flash on new mention│
                                         └──────────────────────┘
Output dir: ~/.cache/discord-pulse/   (fs is available per BD constraints)
```

## Plugin design (src/MentionBeacon/ — normal suite build pipeline)

**Dispatcher acquisition**: the shared pattern (CLAUDE.md — store `_dispatcher`
extraction first, NO optional chaining in Webpack filters).

**Mention capture** — subscribe `MESSAGE_CREATE` (and `MESSAGE_UPDATE` for
edits that add a mention):
- Hot-path gate order (PERF-CONVENTIONS R-rules — cheapest, most-likely-to-
  reject first): (1) `message.author.id === selfId`? drop. (2) mention check:
  direct `@self` in `message.mentions` OR DM channel type OR (opt-in via
  settings) role-mention matching one of self's roles OR (opt-in, default
  OFF) `@everyone`. (3) only then resolve names/channel via stores.
- Record: `{ id, ts, authorId, authorName, avatarURL, guildName, channelName,
  guildId, channelId, messageId, preview }` — preview clamped ~90 chars,
  newlines collapsed (notch/widget lesson: truncate upstream).
- Rolling window: prune > 3 days on each write and on start.
- Persistence: `~/.cache/discord-pulse/mentions.json`, writes **debounced 2s**
  (suite persistence convention — coalesced, never per-event).
- Startup backfill: read the recent-mentions store IF already populated
  (passive read only — see doctrine).

**VC capture** — subscribe voice-state + `SPEAKING` dispatches:
- Track only the VC *self* is in (gate: self's voice channel id; not in VC →
  clear vc.json and do nothing — zero idle cost).
- `vc.json`: `{ inVC, guildName, channelName, members: [{ id, name,
  avatarURL, speaking, muted, deafened }] }`.
- SPEAKING events are chatty: coalesce writes to ≥250ms; full member refresh
  only on join/leave/move events.
- stop() unsubscribes everything (no leaked dispatcher subscriptions).

**Settings panel** (suite convention: rgba(10,10,16,0.98) bg, stats + Debug
Mode toggle): counts captured/pruned, toggles for role-mentions / @everyone /
DMs, Debug Mode.

## Widget design (ONE panel: `discord.widget`, ubersicht-widgets repo)

- Same chrome as audio-control (theme.json vars, header, scroll-area with
  drag-scroll pattern, pointer-events discipline).
- **VC section** (only rendered when `vc.json.inVC`): channel name + member
  rows/grid; speaking = accent glow ring (CSS transition, no JS animation);
  muted/deafened glyphs.
- **Mentions section**: newest first — avatar, author, `server #channel`,
  clamped preview, relative age; subtle divider per day. Click a row →
  `run("open discord://-/channels/<guildId>/<channelId>/<messageId>")` —
  deep-links straight to the message (DMs: `@me` path).
- **Flash on new mention**: reuse the audio-control sound-flash pattern
  (panel class + keyframes) in a distinct color (cyan/blue vs the audio
  panel's gold) so the two alert types are distinguishable at a glance.
- Poll cadence: `mentions.json` every 30s; `vc.json` every **1s only while
  inVC was true on last read**, else 30s (perf ethos: pay for liveness only
  during calls). Both via one `command` cat-ing the two files.

## Files touched

- NEW `src/MentionBeacon/{manifest.json,index.js,styles.css}` (this repo)
- NEW `source/Widgets/discord/` + symlink (ubersicht-widgets repo, same
  pattern as audio-control)
- `docs/ACTIVE_DOCS.md` — add this spec to the index

## Test plan

1. Build + link, Ctrl+R Discord; confirm zero console errors, settings opens.
2. Have someone @ him in a test server (or self-mention from an alt/bot
   message that pings him) → appears in feed ≤2s + widget flash ≤30s.
3. DM test; role-mention test with toggle on/off.
4. Join a VC → widget shows members ≤1s; speaking glow tracks the speaker;
   leave → section disappears, polling drops to 30s.
5. Perf: with Debug on, confirm no writes while idle and no dispatcher work
   beyond the gate when messages don't mention him.
6. Ban-safety review before ship: grep the plugin for `fetch(`, `api`,
   `.send`, REST module acquisition — must be ZERO network-touching code.
