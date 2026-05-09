# Shadow Away Mention Auto-Reply Plan (Front to Backend)

Date: 2026-03-03  
Status: Planning only (no implementation in this document)

## Table of Contents
1. Purpose
2. Goals and Non-Goals
3. User Experience (Frontend)
4. System Architecture (Frontend to Backend)
5. Data Contracts
6. Bot Runtime Logic
7. AI Capability Scope (Optional)
8. Safety, Security, and Compliance
9. Persistence Model
10. Failure Modes and Fallback Behavior
11. Observability and Diagnostics
12. Rollout Plan
13. Verification Plan
14. Open Questions
15. DigitalOcean Deployment Alignment
16. Return Catch-Up Report (First Message Detection)
17. Shadow Plugin Integration Feasibility

## 1. Purpose
Build a reliable "Shadow replies for me when I am away" system that:
- Detects mentions of your user in restricted guilds/channels only.
- Replies to the exact person who mentioned you.
- Uses your manually typed status text as the primary reply content.

## 2. Goals and Non-Goals

### Goals
- Command-based away profile with custom status text.
- Owner-only control and usage (no public multi-user control).
- Trigger on mention of your user in allowlisted guild/channels only.
- Auto-reply addresses the exact user who pinged you.
- Cooldown and dedupe to prevent spam loops.
- Keep outbound messaging handled by Discord bot account (not user self-send).

### Non-Goals
- No dedicated report channel posting.
- No mirrored channel update feed.
- No user-account selfbot messaging.
- No broad auto-reply outside explicit allowlists.
- No mandatory AI generation in first phase.

## 3. User Experience (Frontend)

### 3.1 Primary Commands (Bot Slash Commands)
- `/shadowaway on status:<text>`
  - Enables away mode.
  - Sets active status reply text.
  - Response must be a private ephemeral embed visible only to you.
- `/shadowaway off`
  - Disables auto-reply.
- `/shadowaway status`
  - Shows enabled/disabled, status preview, cooldown, allowlist counts.
- `/shadowaway set status:<text>`
  - Updates status text without toggling mode.
- `/shadowaway allow guild add/remove guild_id:<id>`
- `/shadowaway allow channel add/remove channel_id:<id>` (optional extra restriction)
- `/shadowaway cooldown set seconds:<n>`
- `/shadowaway test`
  - Dry-run current channel/guild against gates and return pass/fail reason.
- `/shadowaway validate-perms`
  - Checks bot send/reply permissions in current channel.
- `/shadowaway why-last-skip`
  - Returns most recent skip reason and decision snapshot.
- Access policy:
  - only your owner account can execute all `/shadowaway` commands
  - all non-owner command attempts are denied and logged.
- Privacy policy:
  - `/shadowaway` command responses must be private ephemeral embeds.
  - no public confirmation or status payload is posted in channel on command execution.

### 3.2 Optional BetterDiscord Plugin UI (Companion Layer)
- Quick toggle: `Shadow Away On/Off`
- Status text editor
- Read-only sync status (bot reachable / auth ok / last reply time)
- Test utility (dry run validation only)

Note: Plugin UI is convenience only; command and enforcement authority should remain bot-side.

## 4. System Architecture (Frontend to Backend)

### 4.1 Components
- Discord Bot Service (primary engine)
  - Slash command handlers
  - Mention event handler
  - Reply dispatcher
  - Allowlist/cooldown/dedupe gatekeeper

- Optional Bridge API (recommended)
  - Local/private API between plugin and bot backend.
  - Used for quick toggle/status updates only.

- Persistent Store
  - Away profile
  - Allowlists
  - Cooldown/dedupe state
  - Dispatch logs

### 4.2 Message Flow
1. You set away status text via slash command (or plugin bridge).
2. Bot stores active profile.
3. Someone mentions you in monitored channel.
4. Bot validates trigger rules.
5. Bot posts auto-reply in source channel, mentioning the triggering user.
6. Bot records dispatch status and cooldown/dedupe keys.

## 5. Data Contracts

### 5.1 Away Profile
- `userId`
- `ownerUserIds[]` (approved use: your account only)
- `deployedGuildIds[]` (guilds where this bot is active/deployed)
- `enabled` (boolean)
- `statusTemplate` (string, validated length)
- `allowGuildIds[]`
- `allowChannelIds[]` (optional narrowing inside allowlisted guilds)
- `cooldownSeconds`
- `signatureMarker` (fixed: `[SHADOW-AUTO-REPLY]`)
- `maxRepliesPerGuildPerHour`
- `maxRepliesPerChannelPerHour`
- `maxRepliesGlobalPerHour`
- `replyMode` (`static` by default; `ai` optional future)
- `updatedAt`

### 5.2 Mention Trigger Event (internal)
- `eventId` (snowflake-based unique id)
- `targetUserId` (you)
- `triggerUserId` (person who mentioned you)
- `guildId`
- `channelId`
- `messageId`
- `messageContentPreview` (truncated on ingest; max 200 chars)
- `mentionCount`
- `createdAt`

### 5.3 Auto-Reply Dispatch Record
- `dispatchId`
- `eventId`
- `replyMessageId`
- `status` (`sent`, `skipped`, `failed`)
- `skipReason` or `errorCode`

## 6. Bot Runtime Logic

### 6.0 Access Control
- This bot is single-operator for v1:
  - only configured owner user ID(s) may use commands or control away sessions
  - no one else can turn away mode on/off, set status, or query private skip/digest details.

### 6.0.1 Command Response Privacy
- All `/shadowaway` control/status commands respond with ephemeral embeds only.
- Ephemeral payload visibility target: owner account only.
- This includes `/shadowaway on` when away reason text is provided.
- No non-ephemeral fallback for command responses in guild channels.

### 6.1 Trigger Validation Pipeline
1. Ignore bot/webhook authors.
2. Require direct target user mention (`<@userId>` or `<@!userId>`).
3. Reject role-only pings, plain replies without mention, and system/forwarded events.
4. Reject messages already containing shadow signature marker.
5. Load target user away profile.
6. Check `enabled === true`.
7. Check guild allowlist and optional channel allowlist.
8. Check cooldown and dedupe keys.
9. If all pass: send reply.

### 6.2 Reply Composition
- Reply mentions triggering user directly: `<@triggerUserId>`
- Status content from your configured away text.
- Fixed signature marker included in reply metadata/content for loop prevention:
  - `[SHADOW-AUTO-REPLY]`

### 6.3 Allowlist Precedence Rules
- `allowGuildIds` is mandatory gate (default deny).
- `allowChannelIds` is optional narrowing gate.
- Effective rule:
  - If guild not in `allowGuildIds` -> skip.
  - If `allowChannelIds` empty -> allow all channels in allowed guild.
  - If `allowChannelIds` non-empty -> only channels in that set are allowed.
- DM channels are denied in v1.

### 6.4 Dedupe Strategy
- Dedupe key example:
  - `dedupe:{targetUserId}:{guildId}:{channelId}:{triggerUserId}`
- TTL-based window (example: 10 minutes).
- Prevents repetitive responses from same user/channel burst pings.

### 6.5 Cooldown Strategy
- Global cooldown per target user (example: 60s).
- Per-trigger-user cooldown (example: 10–15 min).
- Per-channel cooldown (example: 30–60s).

### 6.6 Anti-Loop and Anti-Spam Guards
- Never respond to bot/webhook/bridge relay messages.
- Never respond if source message includes shadow signature marker.
- Never respond to bot's own reply chain.
- Add reply rate limits:
  - `maxRepliesPerGuildPerHour` (approved default: `12`)
  - `maxRepliesPerChannelPerHour` (approved default: `6`)
  - `maxRepliesGlobalPerHour` (approved default: `40`)
- On limiter hit:
  - skip auto-reply and store reason for `/shadowaway why-last-skip`
  - still collect mention event and essential info in pending queue for return digest.

## 7. AI Capability Scope (Optional)

### 7.1 Default
- `replyMode = static`
- Bot sends your exact typed status text.

### 7.2 Optional Future Mode
- `replyMode = ai`
- AI may paraphrase while preserving intent and safety constraints.
- Must keep mention target (`@triggerUser`) and never reveal secrets.
- Must include strict fallback to static text if AI fails or times out.

### 7.3 AI Voice Profile (Shadow Monarch Style, Grade-Independent v1)
- Grade-based personality differences are intentionally not included in v1.
- Required style:
  - Loyal shadow-servant tone.
  - Respectful, concise, calm.
  - No sarcasm/comedy unless explicitly enabled later.
- Required structure:
  - Address the pinging user.
  - Deliver your configured status intent clearly.
  - Optional short availability note when present in your status template.
- Guardrails:
  - Do not invent commitments, schedules, or promises.
  - Do not expose internals (allowlists, cooldown keys, secrets).
  - Do not change core meaning of your configured status.

### 7.4 Canonical Reply Template Pattern (Preferred)
- Target phrasing baseline:
  - `<@triggerUser>, your message is noted. My liege {status_clause}.`
- Example for assignment-away status:
  - `<@triggerUser>, your message is noted. My liege is currently away handling assignments.`
- AI mode should preserve this opening structure unless explicitly overridden by settings.
- If AI mode is off, static mode can still use this exact template with token replacement.

## 8. Safety, Security, and Compliance

### 8.1 Token and Auth Rules
- Never store bot token in BetterDiscord plugin files.
- Store token in backend environment only.
- Bridge endpoint requires auth secret and request signature.

### 8.1.1 Bridge Anti-Replay Requirements
- Every bridge request must include:
  - `timestampMs`
  - `nonce` (single-use random identifier)
  - `signature` over canonical payload
- Verification rules:
  - reject if timestamp drift exceeds 60 seconds
  - reject if nonce already seen within replay window
  - reject if signature mismatch.
- Keep nonce cache TTL at least 5 minutes.

### 8.2 Scope Restriction
- Default deny everywhere.
- Must explicitly allow guilds/channels before any auto-reply.
- Hard cap on status message length and sanitization.

### 8.3 Abuse Prevention
- Cooldowns + dedupe.
- Permission checks for command usage (strict owner-only).
- Optional emergency kill-switch command:
  - `/shadowaway emergency-off`

## 9. Persistence Model

### 9.1 Minimum Tables / Collections
- `away_profiles`
- `allowlist_entries`
- `dispatch_logs`
- `cooldown_state`

### 9.2 Suggested Indexes
- `(userId, enabled)` for fast active lookups
- `(userId, guildId, channelId)` for allowlist checks
- `(targetUserId, triggerUserId, channelId, createdAt)` for dedupe/cooldown

## 10. Failure Modes and Fallback Behavior
- Backend unreachable from plugin bridge:
  - Show non-blocking UI error in plugin.
  - Do not attempt unsafe local fallback send.
- Missing send permission in source channel:
  - Log dispatch failure with code and skip retries by default.
- Invalid template:
  - Reject on set-time, not send-time.
- AI mode failure/timeouts (future):
  - Fallback immediately to static status text.

## 11. Observability and Diagnostics
- Metrics:
  - `mentions_seen`
  - `mentions_matched`
  - `auto_replies_sent`
  - `auto_replies_skipped_by_reason`
  - `dispatch_failures`
- Log levels:
  - `INFO` for normal sends/skips
  - `WARN` for permissions and misconfig
  - `ERROR` for send failures/auth failures

## 12. Rollout Plan

### Phase 1: Bot-only Core
- Slash commands.
- Mention trigger + allowlist + cooldown + dedupe.
- Static status replies only.

### Phase 2: Plugin Companion
- Quick toggle and status set via bridge API.
- Status sync from bot backend.

### Phase 3: Optional AI Assist
- Add AI reply mode behind explicit setting.
- Keep strict static fallback path.

## 13. Verification Plan

### 13.1 Unit Tests
- Trigger matching with mention edge cases.
- Cooldown and dedupe correctness.
- Allowlist gate checks.
- Reply formatting (target mention + status text).

### 13.2 Integration Tests
- Command set -> mention -> reply flow.
- Allowlist reject paths.
- Permission failure paths.
- AI fallback path (future mode only).

### 13.3 Live Validation Checklist
- Enable away profile with known status text.
- Mention target in allowed channel.
- Verify exact-user mention reply text.
- Verify repeated ping suppression within cooldown window.
- Verify no report-channel dependency exists.

## 14. Open Questions
- Should one status template be global or per-guild override?
- Do you want optional auto-disable after a set duration?
- For AI mode, should it only rephrase template text, or also adapt to ping context?

## 15. DigitalOcean Deployment Alignment

### 15.1 Current Deployment Pattern (Verified from `discord/bots`)
- Deploy target: DigitalOcean VPS with repo at `/root/discord-bots`.
- Process manager: PM2 using `ecosystem.config.js`.
- CI deploy path: GitHub Actions workflow `.github/workflows/deploy.yml` on `main` push.
- Deployment action: SSH into VPS, then:
  - backup `ecosystem.config.js`
  - `git fetch origin main` + `git reset --hard origin/main`
  - restore ecosystem config if needed
  - run `node scripts/merge-ecosystem.js`
  - run selective `npm install --production` for JS bots
  - clear Python cache files
  - `pm2 delete all` -> `pm2 start ecosystem.config.js` -> `pm2 save`
- Manual fallback path exists:
  - local `deploy-all.sh` / `deploy-bot.sh` rsync to VPS
  - optional direct restart commands over SSH.

### 15.2 Shadow-Away Service Placement
- Add the shadow-away bot backend as a new bot/service under the same `discord/bots` repo.
- Register it in both:
  - `ecosystem.config.example.js` (source of truth)
  - VPS `ecosystem.config.js` (merged/preserved by existing workflow).
- Keep secrets bot-side only (`.env` on VPS, never in BetterDiscord plugin).

### 15.3 Deployment Sequence for Shadow-Away
1. Merge backend code to `main` in `discord/bots`.
2. Ensure PM2 app entry exists for the new service name.
3. Verify required VPS env file exists and contains token + mode settings.
4. Let GitHub Actions deploy run (`deploy.yml`) and restart PM2 stack.
5. Validate with:
  - `pm2 list`
  - `pm2 logs <shadow-away-app> --lines 100`
  - slash command smoke test (`/shadowaway status`, `/shadowaway test`).

### 15.4 Runtime/Config Contract
- Required runtime config (minimum):
  - `DISCORD_TOKEN`
  - `OWNER_USER_IDS` or equivalent command admin gate
  - optional AI keys only when `replyMode=ai` is enabled.
- Safety defaults on first boot:
  - away mode disabled
  - empty allowlists (deny all)
  - static mode enabled (`replyMode=static`).

### 15.5 Operational Notes for Reliability
- Because deploy uses full PM2 recycle (`delete all` + `start`), keep startup fast and fail-loud on missing env.
- Persist decision logs for `/shadowaway why-last-skip` across restarts (store-backed, not memory-only).
- Keep signature marker and cooldown cache versioned to prevent behavior drift after deploys.

## 16. Return Catch-Up Report (First Message Detection)

### 16.1 Goal
- When away mode is active, collect mention events that were auto-handled.
- When you return and send your first message, the system should report:
  - who mentioned you
  - where it happened
  - direct jump links to each mention message.

### 16.2 Detection Strategy
- Primary (recommended): BetterDiscord companion plugin uses first outbound message detection while away-session is active, then sends a signed `user_back_online` event to bot backend.
- "First outbound message" scope:
  - `MESSAGE_CREATE` only
  - normal text message only
  - authored by you only (owner user ID match required)
  - any non-empty normal text you send counts.
  - message must be posted in a guild where this bot is deployed/active (`guildId in deployedGuildIds[]`)
  - message guild must also pass away allowlist rules for the active session.
  - excluded from trigger:
    - `MESSAGE_UPDATE` (edits do not count)
    - slash command invocations
    - attachment-only / sticker-only / embed-only posts without normal text content.
- Fallback: explicit command `/shadowaway back` if plugin signal is unavailable.
- One-shot behavior:
  - first return event flushes pending mentions and marks session as closed.
  - subsequent messages do not re-send digest unless away mode is enabled again.

### 16.2.1 Presence-Independent Constraint (Stealth Compatibility)
- Do not use Discord online/idle/invisible/presence transitions for away/return detection.
- Stealth plugin compatibility requirement: user may remain permanently invisible, so presence diff signals are unreliable by design.
- Source of truth for session state:
  - explicit away command on/off
  - first outbound normal-text message detection while away-session is active (owner-authored, deployed-guild only)
  - explicit `/shadowaway back` fallback command.

### 16.3 Pending Mention Queue Model
- Store pending mention records while away mode is enabled:
  - `triggerUserId`, `triggerUserTag`
  - `guildId`, `guildName`
  - `channelId`, `channelName`
  - `messageId`
  - `timestamp`
- Build jump link per record:
  - `https://discord.com/channels/{guildId}/{channelId}/{messageId}`

### 16.4 Return Digest Delivery
- Delivery target (v1):
  - prioritize internal channel report in the same channel where return was detected (your first qualifying outbound normal text message).
  - if channel send fails, fallback to DM to you from bot account.
- Digest format:
  - embedded alert message ("shadow report" embed)
  - header: count of missed mentions while away
  - compact list grouped by guild/channel
  - each item includes user mention and jump link.
  - include machine-readable jump target tuple per item:
    - `guildId`, `channelId`, `messageId` (for optional portal-assisted client jump).

### 16.5 Safety and Limits
- Cap digest size per message (chunk output if needed).
- De-duplicate repeated mentions from same user/message id.
- Expire stale pending mentions after configurable TTL (approved default: 24 hours).
- Redact/truncate old preview content:
  - store `messageContentPreview` as max 200 chars at ingestion
  - purge preview text after 24 hours (keep minimal IDs only until record expiry).
- Pending queue cap per away session (approved default: 1000 records).

## 17. Shadow Plugin Integration Feasibility

### 17.1 Is It Possible?
- Yes. It is feasible to hook Shadow Army / Portal Creation plugins to the bot via a local bridge API.

### 17.2 Recommended Integration Model
- BetterDiscord plugins (client-side) emit signed events to backend bridge:
  - away toggled on/off
  - first outbound message detected
  - optional context signals (portal active, dungeon active, etc.).
- Bot backend consumes events and updates away session state.
- Keep Discord messaging authority only in bot backend.

### 17.3 Boundaries for Harmony and Safety
- Plugins should not send Discord messages directly as user automation.
- Bridge payloads should be minimal and versioned.
- Require shared secret/signature + local allowlist to prevent forged events.
- If bridge unavailable, bot keeps command-only behavior (no hard dependency on plugins).

### 17.4 Verified Hook Surface (Current Plugins)
- `ShadowArmy.plugin.js` (primary shadow DB source):
  - data access surface:
    - `getShadowSnapshot()` (preferred hot snapshot)
    - `getAllShadows()` (fallback full load)
    - `storageManager.getTotalCount()` / `storageManager.getShadows(...)` (IndexedDB-backed)
  - event surface:
    - `ShadowArmy:shadowExtracted`
    - `ShadowArmy:batchExtractionComplete`
- `ShadowSenses.plugin.js` (likely second integration target):
  - deployment surface:
    - `deploymentManager.getDeployments()`
    - `deploymentManager.getMonitoredUserIds()`
  - useful for mapping who currently has an assigned reporting shadow.
- `ShadowPortalCore.js` (portal visuals):
  - provides transition/animation core, not a canonical shadow-state datastore.
  - treat as UX/transition engine only; never as authoritative shadow data source.

### 17.5 Integration Recommendation (ShadowArmy + ShadowSenses)
- Authoritative shadow data for bot-facing summaries should come from `ShadowArmy`.
- Optional contextual overlay (who is currently deployed where) should come from `ShadowSenses`.
- Keep bridge payloads as summarized data deltas; do not stream raw full shadow records each tick.

### 17.6 Portal-Assisted Jump From Return Report (ShadowPortalCore)
- Goal:
  - when you click/trigger a jump from the return shadow report, navigation can use portal transition instead of plain route jump.
- Important constraint:
  - `ShadowStep` / `ShadowExchange` public teleport methods are waypoint/anchor-based, not generic jump-link APIs.
  - for arbitrary mention jump targets (`/channels/{guild}/{channel}/{message}`), a dedicated companion jump handler is cleaner.
- Recommended path:
  - Companion plugin reads jump target tuple from return-report embed item.
  - Companion plugin invokes ShadowPortalCore-backed transition + navigation for that route.
  - If ShadowPortalCore is unavailable, fallback to normal `transitionTo` jump URL.
- Safety gates:
  - only allow portal jump for report entries authored by your trusted shadow bot.
  - only allow jump targets in allowlisted/deployed guilds.

### 17.7 ShadowArmy Bot Access Contract (Dedicated)
- Purpose:
  - expose stable, minimal shadow-state summaries for bot-assisted reporting context.
- Allowed access (read-oriented):
  - `getShadowSnapshot()` (preferred)
  - `getAllShadows()` (fallback only)
  - `storageManager.getTotalCount()` (count metrics)
  - event notifications:
    - `ShadowArmy:shadowExtracted`
    - `ShadowArmy:batchExtractionComplete`
- Forbidden access:
  - no direct mutation via bot bridge (no create/update/delete of shadow records)
  - no full raw DB dumps in routine bridge traffic
  - no per-tick full scans pushed to backend.
- Data minimization:
  - bridge emits aggregate summaries/deltas only
  - no unnecessary personality/private payload fields unless explicitly required.
- Contract versioning:
  - payload must include `schemaVersion`
  - breaking schema changes require version bump and compatibility gate.
- Failure behavior:
  - if ShadowArmy unavailable, bot continues away workflow without shadow metrics context.
- Verification requirements:
  - smoke test: extraction event observed end-to-end
  - snapshot path used before full-load fallback
  - no write path from bot bridge into ShadowArmy storage.

### 17.8 ShadowPortalCore Bot Access Contract (Dedicated)
- Purpose:
  - provide visual transition for user-initiated return-report jumps.
- Allowed access:
  - transition invocation for validated jump targets only
  - fallback navigation when portal core is unavailable.
- Forbidden access:
  - no use as shadow data source
  - no autonomous navigation without explicit user jump action
  - no cross-guild jump outside allowlisted/deployed scope.
- Invocation constraints:
  - jump target must come from trusted return-report embed entry
  - jump target must match tuple format: `guildId/channelId/messageId`
  - route must pass allowlist and deployed-guild checks.
- Performance constraints:
  - one active portal transition at a time for return-report jumps
  - rate-limit repeated rapid jump invocations to avoid UI thrash.
- Failure behavior:
  - if portal transition fails or core unavailable, execute standard `transitionTo` route jump.
- Verification requirements:
  - portal-assisted jump works on valid report item
  - fallback jump works when portal core disabled
  - invalid/untrusted jump payload is rejected.
