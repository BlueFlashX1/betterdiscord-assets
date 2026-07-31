# Performance Conventions & Subagent Briefing Pack

> Canonical playbook for performance work on this suite. Derived from the 2026-07 audit
> campaign (tiers 1–5, lag-spike wave, CPU-budget waves 1–2) + BetterDiscord community canon.
> **Dispatch convention:** point subagents at this file + `memory/CURRENT.md` instead of
> re-embedding context. Audit archives live in `memory/scratch/cpu-audit-*.md`.

## 1. The one principle

Discord's UI is a single main thread. Every finding reduces to `small cost × huge frequency`.
The three frequencies that matter: **messages received** (hundreds/hr in busy servers),
**messages sent**, and **timers that fire forever**. Break the multiplication — don't just
speed up the work; prove the work doesn't need to happen at that frequency.

## 2. Hard rules (violations are bugs, not style)

| # | Rule | Canonical example |
|---|------|-------------------|
| R1 | **Never full-scan the ShadowArmy IDB store** (281k+ records ≈ 45–50s). Bounded reads only: `index('rank').getAll(rank, count)`, keyset pagination (`getShadowsByKeyPage`), chunked `getShadowsByIds`. Grep ALL call sites incl. internal re-verification paths before declaring a scan fixed. | `ShadowArmy/storage.js:getShadowsByRankLimited`; DKB `bd-idb-bounded-queries-at-scale` |
| R2 | **SUPERSEDED 2026-07-30 — there is no army-wide XP.** This rule used to require routing it through the pending-shared-XP accumulator. Shadows now earn NO XP at all: `grantShadowXP` has zero call sites, `shareShadowXP` and `flushPendingSharedXp` are no-ops, and growth is derived (veterancy) plus banked combat hours. Do not follow this rule's original instruction — implementing it would re-add ~562k IDB callbacks and ~29s CPU per flush. See §3c. | §3c; `ShadowArmy/progression.js:shareShadowXP` |
| R3 | **Hot-path check ordering: cheapest, most-likely-to-reject first.** Own-message / monitored-user Set lookups come BEFORE any DOM query, fiber walk, or allocation. Cache negative results (WeakSet of not-own elements) when the answer is immutable. | `CriticalHit/pipeline.js:checkForCrit`; `SLS/message-observers.js` |
| R4 | **`BdApi.Data.save` is a SYNCHRONOUS WHOLE-FILE DISK REWRITE** (corrected 2026-07-30 — it is NOT localStorage). Verified in BD source `stores/json.ts`: `setData()` → `#savePluginData()` → `fs.writeFileSync(file, JSON.stringify(cache, null, 4))` — no batching, no debounce, and it re-serializes the plugin's ENTIRE config on EVERY call (this machine: `SoloLevelingStats.config.json` = 128KB, ShadowSenses 48KB). Reads ARE memory-cached (`#ensurePluginData` early-returns), so debounce WRITES only — debouncing loads buys nothing. Defer off hot paths, coalesce (SLS: 20s debounce + 30s dirty-gated net), flush on stop. Never READ (e.g. backup scans) on the write path. **`BdApi.Data.recache()` is BANNED outside debugging** — docs: "Recache loads can block the filesystem and significantly degrade performance." | `SLS/settings-store.js`, `persistence-backups.js`; BD source: https://github.com/BetterDiscord/BetterDiscord/blob/development/src/betterdiscord/stores/json.ts |
| R5 | **Webpack modules resolve ONCE, cached** — at `start()` or in a memoized shared acquirer. `{searchExports:true}` only inside a one-time cached resolution. **No optional chaining inside Webpack filter functions.** Dispatcher via `shared/dispatcher.acquireDispatcher()`; stores via `BdApi.Webpack.getStore("X")` cached on the instance. | `Stealth/index.js:816`, `shared/dispatcher.js`. NOTE (verified 2026-07-30): BD's own webpack cache is gated ONLY on `cacheId` — `searchExports` does NOT bypass it (searching.ts: `if (cacheId) WebpackCache.get/set`, no query-type discrimination). Our one-time caching stands on its own merits and on the publishing guideline: "Plugins must not waste hardware resources. e.g., repeated webpack searching without caching" (docs.betterdiscord.app/plugins/publishing/guidelines). |
| R6 | **Observers: shared hubs, narrow scope, throttled, `document.hidden`-gated.** New cross-plugin singletons live on `window.__SL_*` (esbuild bundles `shared/` per plugin — module scope is NOT shared; refcount on the global). Deliberate deviation from the DOCS' preference; the docs' ONLY statement on this is a CONSISTENCY argument, not a performance one (verbatim, docs.betterdiscord.app/plugins/concepts/react): "If you want to add a component to the UI and not worry about using `onRemoved` or `MutationObserver` to constantly re-add your elements, patching a render function keeps things consistent." Verified 2026-07-30: BD docs make NO performance claim against observers anywhere. This suite trades that consistency benefit for rot-resistance (Patcher-on-render couples to hashed internals). Do not "discover" a contradiction here later — there isn't one. | `shared/header-toolbar.js`, DKB `bd-esbuild-shared-singletons` |
| R7 | **Timers:** every interval needs (a) a `document.hidden` gate unless its work is required while hidden, (b) a self-stop or dirty-flag when idle, (c) an absolute catch-up ceiling if it processes elapsed time (5-min precedent). | `Dungeons/combat-shadow-support.js:getCappedAttackElapsedMs` |
| R8 | **IDB partial tolerance:** per-item `request.onerror` must `preventDefault()`+`stopPropagation()` or one bad record aborts the whole transaction. `onabort` handlers ARE the rejection path — never remove. No `push(...spread)` with potentially >65k elements. | `ShadowArmy/storage.js` batch methods |
| R9 | **React:** memoize components in frequently-refreshing containers; hoist ref callbacks that close over nothing; keyed remount semantics must be verified before memoizing. | `ShadowSenses/components.js:FeedCard` |
| R11 | **Every Patcher patch wraps its body in `try..catch` returning the ORIGINAL return value.** The only explicit safety instruction BD's React docs give (verbatim): "If the code itself is dangerous or complex, try using a `try..catch` where the `catch` returns the original return value." An uncaught throw inside a render patch propagates into Discord's reconciler. | docs.betterdiscord.app/plugins/concepts/react |
| R10 | **Fonts/CSS:** never `var(--font-primary)` (theme-poisoned); every `addStyle` has a symmetric `removeStyle`; shared-by-ID CSS refcounts on `window.__SL_*`. | DKB `bd-css-var-font-primary-poisoned` |

## 3. Verification discipline (what made round 1 safe)

- **Verify the finding in code before fixing** (pre-edit-verify). Audits can cite stale lines.
- **Dead code:** `grep -rn '\bname\b'` — refs==1 (definition only) = dead; refs>=2 = LIVE.
  "Unused export" / "only called in own file" is NOT dead (30/30 false-positive incident).
- **Behavior contracts:** game balance, XP totals, and faithful per-event delivery for
  monitored users are invariants. Coalescing/reordering must be provably outcome-identical.
- **Builds:** `node scripts/build-plugin.js <Name>` per touched plugin; `--all` after
  `shared/` edits (bundled per-plugin). Green build ≠ correct — esbuild bundles broken refs.
- **Runtime evidence beats static review:** BD debug log is at
  `~/Library/Application Support/BetterDiscord/data/stable/debug.log`; frequency-profile it
  (`grep | cut | uniq -c`) before and after. Probe pattern for un-DevTools-able questions:
  temp plugin writing JSON to `BdApi.Plugins.folder` (NOT ~/Documents — Discord lacks TCC
  write there; `__filename` is a bare basename, don't realpath it).

## 3b. MEASURED BASELINE (2026-07-30, end of the AAPerfSentinel campaign)

What "healthy" looks like on this machine, so a future session can tell drift from noise.
Idle-to-light load (1 active dungeon, ~40 msg/min), AAPerfSentinel v4.3:

| Signal | Healthy value |
|---|---|
| Renderer CPU | 0.7-4% of one core |
| Frames under 33ms | 97-99% |
| Long tasks per 30s window | ~10 (750ms total) |
| ShadowArmy attributed | absent from LAST WINDOW movers (<1ms) |
| Whole suite steady-state | ~20ms/min attributed |
| Heap floor (post-GC) | stable across a session; peaks are churn, not leaks |
| Per-plugin DOM footprint | 1-4 elements each, flat |
| Burst captures | none firing |

Campaign trajectory for ShadowArmy's window cost: 23,020ms/min -> 6,609ms/min -> absent.
If a future report shows ShadowArmy back in the movers, or renderer CPU sitting above ~5%
at idle, something regressed — read the newest AAPerfSentinel-burst-*.log first, it names
the caller chain three frames deep.

**Known-good exception — the hourly compression pass.** ShadowArmy legitimately spikes to
~6000ms in a single window at `start + 10 min` and hourly after, via
`processShadowCompression` -> `transformShadowsBatch`. Measured 2026-07-30: 5948ms across
819 chunk transactions (~7.3ms each, awaited per chunk so the event loop yields), frames
held at 97.2% under 33ms, and it fell back to 380ms four minutes later with heap dropping
1112MB -> 458MB. This is NOT a regression — it is the tiering work the keyPath outage had
been silently skipping. Before treating any ShadowArmy spike as a defect, check that it is
**scheduled** (fires on the 10min/hourly cadence, not continuously), **yielding** (per-chunk
cost in single-digit ms), and **gated** (tier filters exclude already-correct records, so
each pass shrinks). All three true -> wait one flush and re-read. Full reasoning:
DKB `learnings/patterns/discord/bd-post-fix-catchup-burst-reads-as-regression.md`.

Corollary: the report's `heap FLOOR ... RISING` verdict is unreliable during a bulk pass —
it compares session start to now and cannot tell a leak from 160k records legitimately
warmed into memory. Trust it only at steady state.

### Open, measured, not yet fixed

- **`header-toolbar.js` `fireAll` costs ~126ms per fire** (10 fires/session, 1264ms total;
  a second site `_onVisibility>fireAll` averages 97.5ms over 9 calls). Attributed to
  SoloLevelingTheme only because it won the shared-singleton startup race — the cost is the
  hub notifying ~7 subscribers, each rebuilding its icon. The single-resolve fix already
  landed (toolbar resolved once, passed to all callbacks); this is the remaining
  per-subscriber rebuild cost. Next step is measuring which subscriber dominates before
  touching anything.
- **Video wallpaper costs nothing measurable.** `<video>` is GPU-composited and registers
  zero JS callbacks; verified 2026-07-30 with the element live. Do not re-audit it as a
  suspect — SoloLevelingTheme's attributed time is the toolbar hub above.

## 3c. ARCHITECTURE CHANGE — shadow growth is DERIVED (2026-07-30)

Read this before touching anything XP-, level-, or cache-shaped in ShadowArmy.
The suite no longer works the way older comments in the code describe.

**Shadows do not earn XP. At all.** `grantShadowXP` has ZERO call sites and is
unreachable; `shareShadowXP` is a no-op. Army-wide XP cost ~562k IDB callbacks
and ~29s of CPU per flush; dungeon combat XP added 310k more; extraction added a
get+put per shadow. All removed. Do not "restore" any of them — nothing reads a
shadow's level, and the XP number fed no gate.

**Growth comes from three places now:**
1. **Veterancy** — derived at read time from `extractedAt`, never stored:
   `1 + VETERANCY_RATE * sqrt(ageDays)`. Zero writes.
2. **Combat growth** — dungeon hours bank `naturalGrowthStats` per shadow. This
   IS implemented (progression.js) and is real earned progression.
3. **Shadow Monarch scaling** — replaces stats with a fraction of the PLAYER's.
   Veterancy composes with it by closing the gap (`1 - (1-factor)/vet`), never
   by multiplying past it. The perk's invariant is that a shadow NEVER reaches
   the player's stats; verified max 0.9938x across all ranks out to 100 years.

**Rank promotion** gates on INTRINSIC stats (`getShadowEffectiveStats(shadow,
{intrinsic:true})`) plus an essence cost. It must NOT gate on plain effective
stats: under the Monarch perk those are player-derived, which cleared every
baseline by 100-650x and made each promotion make the next one easier. The old
level gate is gone because levels no longer advance.

**Dungeon XP goes to the PLAYER.** `shadowTotalXP` is the amount the army earned
FOR the player at a 100% share, already folded into `userXP`. It is not an award
to shadows. The completion summary reports it as a breakdown, not a second gain.

### Deliberately stale caches — do NOT "fix" these

`getTopGenerals` and `getAggregatedArmyStats` intentionally serve results up to
5 minutes old and IGNORE `getArmyStatsCacheKey` changes. This looks like a bug
and is not. That key encodes {timestamp, count, version} of the power cache, so
every extraction busts it; at ~60 msg/min that forced a full 281k walk roughly
every 30s to re-pick the same 7 shadows (20,831 + 12,949 callbacks, 45% of all
traffic combined). Top-7 membership and army-wide aggregates are stable enough
that staleness is the right trade. `getAggregatedArmyStats(true)` bypasses the
cache when a caller genuinely needs current numbers.

### getShadows is a trap at scale — use the keyset primitives

`getShadows()` still walks with `openCursor` on BOTH its paths: one IDB callback
PER RECORD. It is fine for small limits and is retained because its filtered
path supports `offset > 0` and descending order, which `getAll` cannot express.

**Never pass it a large limit.** `_warmDeployStarterPool` passed up to 100,000
and produced 92,829 callbacks — 92.1% of all IDB traffic in the suite. Use
instead:
- `getShadowsByKeyPage(lastKey, limit)` — records, one `getAll` per page
- `getShadowKeyPage(lastKey, limit)` — ids only, via `getAllKeys`
- `forEachShadowBatchPaged(onBatch)` — full walk, ~500 records per callback
- `getShadowsByRankLimited(...)` — bounded rank query

**Landmine, flagged not fixed:** `src/Dungeons/combat-shadow-execution.js:915`
calls `getShadows({}, 0, Infinity)`, which takes the FILTERED path and walks the
entire store. It is dead today only because a `getAllShadowsRaw` existence check
always passes. If that primary is ever removed, this fires and scans 281k
records per call.

### The recurring failure mode in this codebase

Four separate bugs today were the same shape: **code that appears to do
something and silently does nothing.**
- A promise stranded forever because a throw inside an `IDBRequest.onsuccess`
  handler escapes to the event loop instead of reaching `reject()` — no error,
  no log, work silently re-running every startup.
- `getAggregatedArmyStats(true)` — callers passed a force flag the function
  never declared, so it was discarded exactly when fresh data mattered most.
- A `.catch()` that logged through `debugError`, invisible unless debug mode
  happened to be on.
- Per-shadow XP writes feeding a counter nothing read.

None produced an error. All were found by measuring, not by reading. When
something looks like it costs more than it should, instrument it before
theorising — and when adding a diagnostic, CHECK THE BUILD TIMESTAMP AGAINST
THE SESSION START before trusting what it reports. That trap cost two full
diagnostic cycles today.

## 4. Do-not-refix registry (fixed or refuted — re-reporting is a defect)

Fixed 2026-07: SLS backup-cache + 20s save coalescing + not-own WeakSet/batch-dedup/fiber
early-exit + chatUIObserver narrowed; CriticalHit own-check-first + O(1) restoration map +
hash caching; Dungeons index-scoped GC + hidden gates + 5-min catch-up ceiling; ShadowArmy
XP coalescing (message+quest) + cacheKey-primary buff caches + keyset promotion pagination +
essence pre-check/cooldown + batch preventDefault; ShadowSenses deploy bounded query +
FeedCard memo (+ presence pre-filter, VC-detector short-circuit, RA dedup — wave 2, verify
landed); ItemVault spend-fail dedup; dispatcher harmonization; getAggregatedPower removed.

Refuted (do NOT touch): SoloLevelingToasts messageGroups (eviction exists); SystemWindow
visibilitychange (correct as-is); ShadowPortalCore breathing tweens; ShadowArmy storage
onabort handlers; CSSPicker ESM/CJS mix; plugin-bridge cache; toolbar-tooltip fallback;
Dungeons usedIds sentinel; EquipmentManager bonus cache; SoloLevelingTheme hashed classes.
Also refuted (wave 5): CriticalHit CSS_STYLE_IDS "dead constants" (all 6 keys refs>=2; the
stop()-side defensive removeStyle is legitimate cleanup); SLS activityTracker 60s hidden-gate
(R7(a)-exempt — pure arithmetic feeding away/idle grace-period accounting; gating would change
semantics).

Fixed 2026-07 wave 3 (R1-R10 conformance sweep): ShadowSenses onTypingStart monitored-check
ordering; Dungeons handleMessage dedup-before-DOM-query + R8 preventDefault on 3 mob/dungeon
store sites; ShadowArmy getAllShadowsRaw() (indexed stream, no wasted sort) rewiring
compression/migrations/getAllShadows + getShadowsByIds onerror preventDefault.

Fixed 2026-07-12 (wave 5): ItemVault flush per-put onerror isolation (failed item re-dirtied,
persisted siblings stay cleared); EquipmentManager SM-rank poll skipped/self-stopped once grant
flag persists + popup tick hidden-gated; SkillTree dead blur/focus listeners + dead composer
helpers removed, sustain-tick re-render isolated to ActiveSkillsSection via _manaTickForceUpdate
(passive/innate/blessing sections out of the per-tick render path); CriticalHit startObserving
retry capped (OBSERVER_MAX_RETRIES=20) + provably-unreachable content-hash restoration fallback
removed (LEAN schema never populates messageContent/author); Dungeons header-widget loop
self-stops when no dungeons/story/popup (restart hooks in spawn-core/restore-gc-toast/
story-mode-core); SoloLevelingToasts debug-payload construction gated behind debugMode;
ShadowPortalCore consumer refcount REBUILT — raw counter (require-time +1, every stop() −1
incl. start()'s restart-safety self-call) drained to 0 during ordinary startup and tore the
shared GSAP/mask cache down under active consumers, re-enable never re-acquired. Now: consumers
Set keyed by class name, _portalCoreAcquire() on genuine activation, _portalCoreRelease() tears
down only when a HELD key empties the Set (release-without-acquire is a full no-op so the
cold-start self-call can't wipe the require-time preload); module-level stop() is a deprecated
warn-once no-op.

Fixed 2026-07-12 (wave 6 — SA↔Dungeons architecture study + rendering audit): ShadowArmy
transformShadowsBatch merge-on-write primitive (storage.js) — self-heal, compression tiering,
autoPromoteGrades, and grantShadowXP all rewired to transform FRESH records inside the write
transaction (lost-update class closed; field-ownership table lives on the primitive);
autoPromoteGrades essence delta-write (concurrent awards preserved); _lastCompressionGen only
advances on fully-successful tier writes; bulkDungeonExtraction cap-cache invalidation +
per-chunk cap re-check/clamp. Dungeons: catch-up boss damage uses a synthetic per-chunk clock
for the phase-shield window (restores "mirrors live combat" — real Date.now() made post-
threshold chunks 100% shield-absorbed); deployShadows abort/resume now try/finally-paired
(stranded aborts disabled self-heal all session); corpse-pipeline re-validates shadowArmy
across awaits; validatePluginReference rejects stopped instances. Rendering: 49MB background
GIF re-encoded to 9.6MB animated WebP (SHA-pinned raw URLs in both delivery paths);
RulersAuthority migrated to shared watchToolbar() hub; LayoutObserverBus document.hidden gate
+ visibilitychange catch-up dispatch (4 subscriber plugins silenced while backgrounded);
HSLDockAutoHide safeTick reads-before-writes + alert-rail translate3d (was ~40 layout frames
per hover); RA DM-grip observer reentrancy guard; toast progress strip width→scaleX; standalone
theme.css scrollbar-wildcard + outerContainer_ scoping ported from plugin modules (March-audit
parity); dead src/Dungeons/styles.css + dungeonPulse keyframe removed.

Also refuted (wave 6 — do NOT re-attempt): boss HP-bar width→scaleX (fill carries fixed-px
box-shadow/border-radius that squish under scaleX, worst at low HP; track-element/counter-scale/
clip-path all regress visuals or aren't compositor-only); guild.css:730 body:has(chatLayerWrapper_)
→ data-attr conversion (thread-sidebar overlay mounts WITHOUT any dispatcher event — only a 1s
poll could feed the attr, a visible member-list staleness regression; :has() is the only
synchronous signal short of a new dedicated observer); ARISE glow drop-shadow keyframes and
bossHpPulse/gateTimerPulse (bounded, small-area, signature visuals — accepted cost); HSLDock
permanent will-change (re-promotion per hover would cost more).

Parked (wave 6 additions): bulk-vs-bulk same-event-loop-tick cap overshoot sliver (needs atomic
slot reservation — extraction redesign for a grandfathered-anyway edge); themes/variables/ token
system adoption (built, never @imported, 100+ hardcoded rgba repeats — dedicated refactor wave);
Tier-2 video-element background (USER DECISION pending); combat-allocation 45-60s staleness
after mid-dungeon rank-up (deliberate tradeoff — leave).
RESOLVED 2026-07-29 (dead-weight sweep): 49MB themes/SLEndingBest.gif git-rm'd from HEAD —
zero live references (delivery is SHA-pinned to the 9.2MB .webp at commit 91a45d9, served from
history regardless of HEAD; only a docs/history mention remained). The old "71MB+28MB GIFs"
sizes in the wave-6 note were stale. MyTheme.theme.css scaffold: already gone (no file on
disk). ShadowAwayBridge stale runtime.js: already resolved 2026-07-13 (de-bundled into real
source, commit "refactor(awaybridge)"). Suite-wide V8 static sweep completed: remaining
`delete` sites are cold-path (migrations/teardown/10-min purges) or small-N effect buckets
that are persistence-coupled (activeBuffs/activeDebuffs/dots ride the dungeon JSON save —
Map conversion would drop active buffs on reload; left deliberately). spawn-wave-builders
mobTemplates new Array(n)+fill → map() (holey→packed).

Parked (refreshed wave 5): Dungeons mobs `extracted` flag — DESIGN DECISION NEEDED: the mobs
IDB store is write-only at runtime (only batchSaveMobs writes it; nothing ever reads), every
write hardcodes extracted:false, and normal completion already deletes via deleteMobsByDungeon
— the GC branch only matters for abandoned/crashed sessions. Options: (a) mark-on-death (adds
hot-combat IDB read-modify-write — R1/R7 cost for a rare orphan case), (b) drop mob persistence
entirely, (c) leave the GC branch as a harmless no-op. Debug-logging signature unification
(6+ variants); ShadowAwayBridge stale committed runtime.js (NEEDS USER DECISION);
EquipmentManager storage.js flush abort-on-error — deliberate referential-integrity design,
dormant risk (all meta fields primitive today); add pre-transaction record validation only if
non-primitive meta ever lands. Cosmetics (zero cost, not worth churn): ChatNavArrows
dom-fallback.js unused createTrackedTimers instance; HSLDockAutoHide dead poller constructor
fields; TitleModal 300ms sort-save debounce not cleared on unmount.

HIGH items — RESOLVED 2026-07-11 with user approval (wave 4):
- Self-heal every-start scan: FIXED — shadows stamped `_healV` (persists as `hv` through
  compression) at all 3 creation sites; `selfHealCleanV` flag persisted only on non-aborted
  full passes skips Phase 2; HEAL_VERSION bump re-enables one pass. (constants.js owns
  HEAL_VERSION.)
- Hourly compression full-scan: MITIGATED — `_armyWriteGen` counter bumped only at real
  mutation sites (extraction delta, XP flush, rank-up, heal writes, deletes) gates the pass;
  skip when unchanged; first pass after start always runs; gen re-read at record time so
  mid-pass mutations aren't masked. NOTE: getArmyStatsCacheKey was evaluated and REJECTED as
  the signal — it self-invalidates on passive reads. The streaming top-K tiering rewrite
  remains available as a future HIGH item if the gated scan ever matters again.
- SLS achievements fallback: FIXED — cache-first ladder (ShadowArmy cachedTotalPower →
  SLS cachedShadowPower → one 10k-bounded scan only on never-cached fresh installs, with
  visible debugError); honest-zero commit guard verified upstream and untouched.

Incidental discovery (wave 4): ShadowArmy `deleteShadowsBatch` currently has ZERO live
callers (dead code today; left in place, defensively write-gen-bumped — the batch API is
sound and likely to be wired up by a future exchange/conversion feature).

Fixed 2026-07-13 (waves: theme selectors, portal trio, toast engine, senses):
CriticalHit debug-arg cache-thrash + restore-only observer + single-scan
restoration; RA instant hover + focus guardrail; channel-context poll→15s
dispatcher-fallback + 5th body attr data-sl-channel-readonly; wallpaper
animated→static data URI (both paths); toolbar-org/sidebar :has() →
shared/toolbar-tags.js data-sl-tb + body-attr guards (~30 rules); exact-class
substitution shared/class-substitution.js (dual gate: DiscordClasses offline
uniqueness ∩ live webpack re-verify; 62 stems); HSLDock bottom-edge instant
reveal + dock-rect TTL cache + far-above fast-path; portal transition CSS
dedup into ShadowPortalCore/transition-css.js via consumer refcount (was 3
identical permanent copies) + dead plume/abyss/mist rules deleted + SE panel
backdrop-blur removed; toast engine particle-wrapper stop() sweep + 3-batch
particle cap + PluginUtils 5s-TTL engine cache w/ _isStopped guard; toast
noise (Stealth one-per-state-change, SA extractionToasts default-off,
Dungeons level/rank toasts debug-gated); Senses jumpToMessage click-to-jump +
card imageUrl media + duration→timeout fix; extractPresenceUpdates redundant
direct-fallback deleted; FeedTab 300ms debounce; guild-feed batch trim.

Fixed 2026-07-17 (post-feature audit — WARFRONT / SOVEREIGN'S COMMAND / COMMAND-
HIERARCHY surface, the only code added since the last perf commit 5318be5):
Dungeons `getBossGateRuntimeConfig` RANK_KILL_MULT object literal hoisted to a
module-scope frozen const (was reallocated per boss-hit / per shadow-combat tick
— R3); ShadowArmy `_buildSpeciesGradeCensus` write-gen gated (`_speciesCensusGen`
vs `_armyWriteGen` + `genAtStart` mid-scan guard) so the 5-min periodic full-store
census scan (281k records) SKIPS when the army is unmutated — same primitive as
the hourly-compression gate (officer counts stay live via `_recordOfficerPromotion`;
per-species totals move only on extraction/delete, both of which bump the gen). The
rest of the new surface was verified R1-R10 conformant: WARFRONT genuinely O(1)/tick
(identity-cached war intel), SOVEREIGN doctrines O(species) pure arithmetic, no new
scans/timers/observers.

Fixed 2026-07-28 (graph-verified dead-code wave — code-review-graph MCP + suite-wide
ref-count + git-history check per candidate): removed 16 dead functions + orphaned
cascades (~230 lines) across CriticalHit (_loadEquipmentCritDamage, both
_getPluginsFolderFrom* font helpers), Dungeons (applyBehaviorModifier — leftover of the
e533037 triple-stack fix, removal locks that fix in; _isBossStunned), EquipmentManager
(getEquippedInstanceId), ItemVault (getRecord), ShadowRecon (_buildGrid wrapper +
buildGrid import), SkillTree (getDungeonCombatSkillCooldownRemaining), SLS
(buildMessageContextFromStore, _getMessageInputAreaInPrimaryChat, getMessageTimestamp,
isSystemMessage [SLS copy; CriticalHit's own copy is live], allocateStatPoint shim,
_getPrimaryChatContainer + its _cachedChatContainer* invalidations in xp-processing,
stale _domNodeAddedTime null-out). Kept deliberately (do NOT re-flag): ShadowArmy
deleteShadow/_deleteShadowsByIds (deleteShadowsBatch precedent — sound deletion API
family); ShadowSenses getWatchFocusForUser/isPriorityTarget (added 2026-07-13 with
watch-focus feature, awaiting wiring); HSLDockAutoHide isCursorNearBottom (documented
DevTools debug alias). RESOLVED 2026-07-28 (user approved delete): ShadowSenses members-list widget REMOVED
entirely — it was never wired (no injectWidget/setupWidgetObserver call site in any
commit; only stop()-side teardown existed) and the wired header eye-icon already
provides identical function (unread badge + open panel). Removed: injectWidget/
removeWidget/setupWidgetObserver/_getMembersWrap (plugin-ui-methods), SensesWidget
component + export, the _widgetDirty defineProperty/_widgetBus EventTarget infra and
all 11 dirty-writer sites (engine ×6, ui-methods ×3, components, index), WIDGET_*
constants, widget CSS, stop() teardown block, now-orphaned hasSignals/hasStateChanges
accumulators and the _PluginUtils/_ReactUtils import. Do NOT reintroduce a members-
sidebar entry point without a fresh design decision.

Fixed 2026-07-28 (V8 shape/monomorphism lens — web.dev/speed-v8 + v8.dev/elements-kinds
rules applied to hot paths): Dungeons _lastResurrectionAttempt converted plain-object→Map
at all 3 sites (combat-shadow-execution, combat-shadow-support LEAK-2 prune,
difficulty-contributions batched-resurrection) — repeated `delete obj[key]` in the combat
tick forces V8 dictionary mode; Map matches the existing _shadowLastProcessed pattern
incl. instanceof-defensive re-init (cooldowns are combat-ephemeral; reset-on-reload
precedent already accepted for _shadowLastProcessed). ShadowArmy decompress markers
`_compressed`/`_ultraCompressed` REMOVED from both decompress templates — zero readers
anywhere (the "UI-only" comment at the save-path strip site was stale); they guaranteed
a hidden-class split between fresh and decompressed full records; the strip-site
destructuring stays as legacy armor for in-memory records. Verified non-issues (do NOT
re-flag): shadow creation is clean-by-construction (all growth fields in all 3 creation
templates — the lazy guards in applyNaturalGrowth are legacy-record armor that never
fires post-heal); no `new Array(n)` holes, no hot-path `delete` remains, compact stat
arrays are uniformly numeric (PACKED_SMI/DOUBLE safe).

Parked (V8-lens, needs own wave + runtime verification): fresh vs tier-1 vs tier-2
decompressed full-record property ORDER harmonization (3 templates, insertion order
defines hidden class; compression schema is delicate — field-ownership table) — only
worth it if profiling shows army-loop polymorphism actually hurts (≤4 shapes stays
polymorphic, not megamorphic, per V8 IC design; write-gen gating already makes the big
loops rare). Left as-is: extraction.js:1113 delete attempts[bossId] (per-boss-defeat
rare path); Dungeons lazy `_`-runtime-field init (small-N objects, one transition then
stable).

AAPerfSentinel live findings 2026-07-29 (first full-coverage session on a clean boot):
FIXED & runtime-VERIFIED — ShadowExchange swirl reinject short-circuit (1627ms/567ms-worst
→ 17ms/7ms-worst, ~100x); ShadowSenses feed auto-scroll near-bottom gate (steady-state
~600ms/min → ~12ms/min). INSTRUMENTED, fix pending data — HSLDockAutoHide safeTick
(~5ms per 1.5s tick steady, 671ms storm worst; per-section timing added under
debugEnabled — alert-rail runs precisely while dock is hidden, so no blind gating;
next debug session identifies which of heightVar/alertState/railGeom carries the cost).
PARKED as accepted per-navigation cost (do NOT re-flag) — RulersAuthority guild/channel-
switch micro-state re-application (applyMicroStateForCurrentGuild + observer setup,
431ms worst, ~1/min; reordering risks visible unhidden-channel flash). Architecture
verdict for the record: with full attribution coverage, Discord-internal runtime timers
alone (~1.3s/min, 1523ms worst) out-cost the entire suite (~21ms/min steady) — channel
transitions (CHANNEL_UPDATES/CHANNEL_SELECT) remain Discord's own worst moments.

Ponytail wave 2026-07-29 (4-agent fleet audit + central verification; ~320 lines cut):
FIXED — LPB tri-tier settings→single-tier BdApi.Data (cosmetic toggles; BdApi tier was
always written); ChatNavArrows edge/jump logic → dom-helpers (computeArrowVisibility/
jumpToPresent); TitleManager debugLog/debugError dual-signature collapsed; RA hover-delay
keys deleted (provably 0, instant-hover decision); ShadowRecon snowflake dup derived;
SE dead 'debug' key; SAB _createRow dead label; escapeHtml 5 copies → shared/escape-html
(5-replace superset); ARISE_SVG 9.9KB dup → shared/arise-svg; Dungeons CacheManager
DELETED with the LEGACY _shadowCountCache kept as survivor (inverts the audit suggestion:
player-flow.js:1397 + story-mode-core.js:151 read the legacy field directly — the
"centralized" layer was the redundant one); Dungeons ui-delegation 4 identical action
blocks → table+loop.
REFUTED (do NOT re-propose): EqM/ItemVault _getUrlChannelType/_visibleChannelHeaders →
shared installVoiceChatBodyAttr — NOT equivalent: Rule 2 (exactly-one-visible-header) is
INJECTION TARGETING (picks the canonical header when the VC overlay adds a second one),
which CSS hiding cannot replace; and the body-attr watcher is only installed by
SoloLevelingTheme, so gating on it couples icon correctness to another plugin being
enabled. escapeHtml consolidation stands; the channel-detection pair stays local.
PARKED — LPB _invokeRuntimeHelper dispatch table (dies in the planned runtime-helpers
migration; interim refactor risks subtle fallback drift).
FLAGGED (correctness, out of ponytail scope, NOT fixed): story-mode-core.js:151
`const shadowCount = this._shadowCountCache || 100;` reads the cache OBJECT as a count —
almost certainly meant `?.count ?? 100`. Needs a game-balance-aware fix.

Fixed 2026-07-29 (profiler wave 3): ChatNavArrows scroll-driven geometry reads gated to
200ms max cadence with trailing call (shared createThrottledScrollHandler, both arrow
paths). Mechanism: pinned-at-bottom channels fire a scroll event per appended message;
per-frame rAF reads during message storms ran against freshly-mutated layout (measured
132ms avg / 685ms worst per rAF callback, top LAST WINDOW mover). Arrow visibility needs
~5Hz, not 60Hz. Trailing timer cancelled at both unbind sites.

CRITICAL FIX 2026-07-29 (evening): transformShadowsBatch keyPath normalization —
compressShadow/compressShadowUltra outputs carry `i` but not `id` (store keyPath 'id');
put() on an id-less object throws SYNCHRONOUSLY, aborting the whole 200-id chunk and
erroring every sibling get. LATENT SINCE WAVE 6 (2026-07-12, the rewire onto
transformShadowsBatch — the old updateShadowsBatch writer had the normalization line,
the new path didn't). Every compression tiering pass since then failed army-wide
(~280k get-errors + ~1.4k chunk aborts per pass) whenever the write-gen gate let one
run; the earlier "hot-reload IDB zombie" diagnosis was WRONG (reload merely triggered
the always-runs-after-start pass). The 2026-07-28 decompress-marker removal is
EXONERATED. Consequence of the outage: army effectively uncompressed since mid-July
(Discord IDB dir ~9.3GB — expect it to shrink over the first few successful passes).
Also fixed: chunk-abort logger now surfaces DOMException name/message (they
JSON-serialize to {} — the whole storm logged as undiagnosable `{"error":{}}`).
Verification after next restart: compression pass should log ZERO TRANSFORM_BATCH
errors AND counters.compressed/ultraCompressed > 0. DKB:
bugs/shadowarmy/idb-keypath-sync-throw-aborts-chunk.

Fixed 2026-07-29 (AAPerfSentinel v2 IDB funnel — the "idle churn" find): Dungeons
getAllShadows fell through its 10s TTL + ShadowArmy's 2s-fresh snapshot to a FULL
281k-record cursor walk + full decompress every ~10s during ANY active dungeon
(~3.7M IDB callbacks / 2.5min measured, ~6s/min main thread + invisible microtask
decompress; predates all 2026-07 waves — v1 instrumentation couldn't see IDB).
TTL raised 10s→60s: correctness rides the explicit invalidateShadowsCache() hooks
(allocation, lifecycle, army-change listener); 60s matches the already-accepted
combat-allocation staleness class. HIGH follow-up registered (own wave, game-feel
review needed): combat consumers should stop using getAllShadows entirely —
defeat/aliveness checks only need the ASSIGNED shadows (getShadowsByIds on
dungeon.shadowAllocation, ~dozens not 281k); ShadowArmy's shared snapshot windows
(2s) could also be event-invalidated instead of time-gated.

SOLVED 2026-07-29 (the 370M-callback churn — _withStore probe verdict): the walker was
forEachShadowBatch (per-record openCursor/continue = 281k IDB events PER WALK), driven
~7/min by legitimate order-free consumers: the ShadowArmy panel's grade tally (60s cache
zeroed by every grade promotion), totalPower recalc on army-count change (constant during
combat), and armyStats streams. Earlier Dungeons-TTL fix (bc525c4) was a MISDIAGNOSIS
(pattern-matched cadence, async-cut hid the caller — kept anyway as valid hygiene).
STRUCTURAL FIX: forEachShadowBatchPaged — paged store.getAll() keyset on the unique
primary key, ~500 records per IDB event (~560 events/walk, 500x fewer); panel tally +
both army-stats streams switched (all order-free). Cursor variant retained for ordered
consumers (getAllShadowsRaw). _withStore caller probe (window.__SA_STORE_CALLERS)
retained until verified, then remove. Expected: ShadowArmy idb attribution collapses
from ~6s/min to <100ms/min; verify via SHADOWARMY _withStore CALLERS + sites table.
CONFIRMED separately: Dungeons 5-min GC IDBKeyRange.only(boolean) throws — booleans are
not valid IDB keys, index-scoped mob GC has NEVER worked; feeds the parked
mobs-extracted-flag USER DECISION (do not silently fix).

Diagnosis-fleet wave 2026-07-30 (4 agents + central verification; items 4-8 + 1b + 2):
FIXED — Dungeons handleUserDefeat aliveness check iterates dungeon.shadowHP directly
(was full-army getAllShadows just for ids; shadowHP provably pruned to assigned);
SkillTree startup/reset skill-event broadcasts staggered one macrotask per event (5
plugins' activations no longer stack into one block; all listeners have retry
fallbacks); ShadowPortalCore portal glow → pre-painted radial-gradient sibling with
opacity-only tweens (was ANIMATED filter property, 58-104ms frames; breathing tweens
untouched; VISUAL CHECK pending user's next portal jump); ShadowArmy
setupMemberListWatcher/injectShadowRankWidget duplicate forced-reflow pair deduped via
hints param (76ms avg/468ms worst per URL change); story-mode-core shadowCount
?.count fix (was cache OBJECT → NaN silently disabled 2 of 3 reinforcement triggers;
bossHp unaffected — calculateBossHP does not exist, term always fell back to 50000);
MOB PERSISTENCE REMOVED per user decision (b) — 17 sites, zero readers verified,
corpse/extraction pipelines memory-only confirmed, bosses store untouched, orphaned
mobs/mobs_dead stores left in place (physical drop needs dbVersion bump — deliberately
skipped); combat settings flush floor 1500ms→10s + fallback 2.5s→12s + dungeon-blob
debounce 2s→5s (boss-death/completion immediate saves untouched); UnifiedSaveManager
cleanupOldBackups throttled to 1/5min per key (ran after EVERY backed-up save —
getBackups cursor walk + deletes riding each write; shared-safe strictly-less-work).
DECLINED as designed-correct (do NOT re-flag): combat-shadow-execution:982 deploy-pool
full fetch + combat-shadow-allocation:500 fair-share full fetch (genuinely army-wide,
TTL/gen-gated). PARKED: sanitizeDungeonForStorage double-deep-clone + replacer +
uncapped shadowHP/shadowCombatData maps (needs Map-content verification before replacer
drop); markCombatSettingsDirty semantic decouple from dungeon saves (flush-floor raise
captures most of the win); USM compound plugin+dataKey index (cross-plugin SCHEMA_VERSION
migration — HIGH). FLAGGED for user: calculateBossHP was never implemented — Demon
Castle boss HP has never rank-scaled (design gap); DungeonStorageManager
clearCompletedDungeons uses the same IDBKeyRange.only(boolean) broken pattern on
completed/failed indices (dungeon archival GC likely never runs — same bug class,
dungeon store kept, needs its own fix decision).

Fixed 2026-07-30 (late wave): getAllShadowsRaw → forEachShadowBatchPaged (last
cursor-per-record walker; order change extractedAt-desc→primary-key audited across
every consumer — all sort/tally/id-set/min-scan, none read recency; ties between
EQUAL-power shadows may resolve differently in weakest-selection, accepted).
clearCompletedDungeons → plain openCursor + JS filter (IDBKeyRange.only(true) threw
every 5min since dbVersion 2; completed/failed/status_rank/active_rank indices are
PERMANENTLY EMPTY — IDB never indexes booleans; flagged for removal at next version
bump alongside orphaned mobs stores. GC kept — unlike mobs, dungeon records ARE read
back by restoreActiveDungeons). CriticalHit: voice-channel gate on startObserving
(VC has no message container by design — was burning 20×500ms retries + an error log
per VC visit) AND re-arm setupChannelChangeListener on BOTH give-up branches — the
listener was torn down unconditionally by _handleChannelChange but reinstalled only on
SUCCESS, so any give-up killed channel-change detection FOR THE REST OF THE SESSION
(general failure-mode class: unconditional-teardown + resubscribe-only-on-happy-path —
worth grep-checking elsewhere). AAPerfSentinel: Load-context report line (active
dungeons + message rate) so frame/lag stats are comparable across sessions.
PARKED with reasoning — ShadowStep openPanel 494ms (ONE measurement; the diagnosing
agent could not attribute the cost inside ShadowStep's own code and suspects Discord's
React commit / other suite observers reacting to the body mutation; the proposed
persistent-root refactor targets createRoot churn, likely a small fraction of the
total. Re-measure via the profiler's sites table before refactoring — do NOT
speculatively rebuild the panel lifecycle). CORRECTED 2026-07-30 — the earlier note "SoloLevelingToasts 729ms on:click (plain DOM
builder, no React — not a shared cause)" was WRONG and would have led a future audit to
re-decline a real fix. The toast's own listener is trivial; the cost is the CALLER-supplied
opts.onClick invoked synchronously inside the click task — ShadowSenses passes portalJump,
which reaches Discord's own transitionTo router and tears down/rebuilds the chat view.
FIXED: onClick deferred one frame (SoloLevelingToasts/index.js card-toast handler), so the
dismiss animation paints before navigation runs. Fix lives in Toasts, so it holds for ANY
caller's onClick.
ShadowStep openPanel 494ms — STILL PARKED, now by ELIMINATION not assumption: zero
layout-forcing reads exist anywhere in src/ShadowStep (verified by grep), the anchor list is
capped at ~10, and the only two body-scoped observers in the suite (HSLDock one-shot,
RA settings-guard) do trivial per-node work. Nothing inside the plugin accounts for it;
most likely Discord's own React commit on the new body subtree. DELIBERATELY NOT applying
the persistent-root refactor: keeping AnchorPanel mounted behind display:none would leave
its ESC handler live while hidden and skip the focus effect on open — real behavior
regressions for speculative gain on a single measurement.

MEASURED 2026-07-30 (AAPerfSentinel v3.3 fs-level instrumentation — R4 quantified at last):
synchronous config writes are REAL but CHEAP in practice: SLS ~6.6 saves/min totalling
7.0ms over 5 minutes, max 1.5ms per write; SkillTree 5.4/min = 8.4ms; Dungeons 2/min.
The OS page cache absorbs the 128KB rewrites. CONCLUSION: keep R4's coalescing (it is
what holds the rates this low) but do NOT chase further debouncing for perf — measured
cost is ~2ms/min suite-wide. Do not re-open this without new measurements.
FIXED same pass: SLS writeFileBackup rotated 5 generations by readFileSync+writeFileSync
(11 fs ops/save, same bytes moved 5x) → renameSync (metadata-only, identical semantics,
recovery path already scans every .bakN). NOTE: BdApi.Data.save is NON-WRITABLE — it
cannot be wrapped; disk-write instrumentation must go through fs.writeFileSync.

MEASURED 2026-07-30 (v4.2 CSS selector audit — style-recalc pressure quantified):
sl-theme-dialogs carries 65 :has() selectors (verified against source, comment-stripped),
the most in the suite; guild 3, shadow-senses ~19. VERDICT: NOT a problem and NOT to be
"fixed" — every dialogs :has() is ELEMENT-scoped (div[class^="layer_"]:has(...),
.bd-modal-root:has(...)), never body/document-scoped, so evaluation is bounded to modal
layer subtrees that exist only while a dialog is open. Document-scoped :has() count in
dialogs.css: ZERO. The one genuinely document-scoped case (guild.css body:has(
chatLayerWrapper_)) was already refuted 2026-07-13 for lack of a driving event. Do NOT
re-open ":has() is expensive" as a finding without evidence of a DOCUMENT-scoped instance.
Instrument note: the audit strips /* */ comments before counting — the first run reported
162 "universal selectors" in a token file with none (every comment's closing " */" matched).

Closed 2026-07-30 (final open-items pass):
- BOSS HP BUG (gameplay, not perf): calculateBossHP was CALLED by story-mode-core but never
  existed — Demon Castle bosses were flat 50000 HP forever, never rank-scaled. Implemented in
  combat-primitives mirroring spawn-core's formula (100 + vit*10 + rankBonus) * staticMult *
  armyMult, FLOORED at 50000 so no floor gets easier. shadowCount param accepted (existing
  call site passes it) but deliberately unused as a multiplier — army reaches 281k.
- WORSE BUG found in the same block: calculateBossBaseStats?.(bossConfig.rank) passed a rank
  STRING where a rank INDEX is expected → Math.min("Monarch", 11) = NaN → stat-table lookup
  undefined → EVERY Demon Castle boss had NaN strength/agility/intelligence/vitality, and the
  `|| fallback` never fired because the NaN-filled object is truthy. Now passes rankIndex
  (already computed two lines above). Demon Castle bosses have been statless since story mode
  shipped.
- combat-primitives.js was missing `const C = require('./constants')` — the new code would
  have thrown ReferenceError at runtime while esbuild bundled it happily. Caught by grepping
  the file for the import, NOT by the build. Green build != correct (section 3) earned again.
- MOB `extracted` FLAG: question is MOOT — mob persistence was removed entirely (553f36f),
  zero references survive. Do not re-open.
- ShadowStep 494ms: debugMode-gated PHASE PROBE added to openPanel (container-append vs
  react-mount split) instead of refactoring on one measurement. Enable ShadowStep debugMode
  and open the panel to get the breakdown.
- AAPerfSentinel v4.3 BURST CAPTURE: when a plugin's window delta exceeds 2500ms, a
  timestamped AAPerfSentinel-burst-*.log is frozen (never overwritten, max 12/session) — the
  155/min walk burst was lost to the 30s overwrite and never recurred while anyone was
  looking.

FORCED-LAYOUT SWEEP 2026-07-30 (suite-wide, every layout-reading API grepped, callers read
for write-ordering) — HEADLINE NEGATIVE: ZERO read-after-write sites on channel-switch,
per-message, or pointer-handler paths. The suite does not trigger the forced style/layout
that LoAF bills to Discord's own code; those hot-path reads are all clean reads (CriticalHit
pipeline offsetParent gates are correctly FIRST per R3; RA resize/mousemove read-then-write
ordering is already right). Do NOT re-open "our plugins cause Discord's reflow" without a
NEW measurement.
FIXED (read-after-write, all confirmed): Dungeons ui-header-widget renderDungeonHeaderPopup
wrote popup.innerHTML then synchronously called positionDungeonHeaderPopup (which reads
button.getBoundingClientRect) — on a 3s tick while the popup is open, the only RECURRING
instance in the suite; the rAF-deferred queueDungeonHeaderPopupPosition already existed in
the same file, unused. Plus 4 one-shot popup/tooltip sites now read the anchor rect BEFORE
their DOM writes: shared/toolbar-tooltip showToolbarTooltip (shared by 7 plugins, fires per
icon hover), EquipmentManager _positionPopup (prereadRect param), ItemVault popup, ShadowSenses
_positionSensesPopup (prereadRect param). The anchor's geometry never depended on the popup,
so the reflow was pure waste.
NOT exhaustively swept: class (d) one-shot sites beyond the 4 above (agent stopped after the
pattern repeated 3x); severity floor is a single user action, so this is a deliberate stop.

SOLVED 2026-07-30 (the recurring full-store-walk burst — caught by v4.3 BURST CAPTURE):
attemptAutoRankUp called getTotalShadowPower(TRUE) — a FORCED full-army walk — on EVERY
shadow rank-up (guarded only by _batchXpInProgress, so all combat/dungeon rank-ups outside
an XP batch hit it). Burst files recorded 540 paged walks in one 4-minute window (~135/min)
with the caller chain naming it. It ALSO zeroed cachedTotalPowerShadowCount first, which
guaranteed the next non-forced call ALSO walked the store (count mismatch) — two full walks
per rank-up. Replaced with the pre-existing incremental _applyTotalPowerDelta (race-safe
serialized chain): army total moves by exactly this shadow's power change, O(1) vs O(281k).
The count-zeroing line is removed for the same reason. This is the same phenomenon as the
earlier "155/min paged walk" burst that could not be reproduced on demand — the burst-capture
instrument is what finally named it, after a cadence-guess had already produced one wrong fix
(bc525c4, kept as hygiene).

Refuted 2026-07-13 (do NOT re-propose): blanket [class*=]→[class^=] (stem
ambiguity: container_=693 hashes — use class-substitution allowlist instead);
portal canvas gradient bucket-caching (radii oscillate per frame by design);
guild.css body:has(chatLayerWrapper_) → JS observer (≈zero net win; candidate
pure-CSS replacement threadSidebarOpen_ NEEDS LIVE DOM CHECK); profile.css
note-:has() drop (orphans visible header); SE getWaypointListRevision
memoization (in-place mutation makes identity-memo stale); RA width-transition
→ transform (push layout must resize chat; user keeps the 250ms slide).

## 5. Dispatch template (copy for each subagent)

```
Repo: /Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets
(branch perf/all-plugins-audit). Scope: ONLY <dirs/files>.
Read docs/PERF-CONVENTIONS.md (hard rules R1-R10, verification discipline, do-not-refix
registry) and <audit file> first — your work unit is <findings>.
Purpose: <1 sentence>.
Do, after verifying each in code: <numbered items with file:line>.
Constraints: work-claim memory/current_tasks/<slug>.md before first edit, delete when done,
abort on overlap. Edit src/ only — never plugins/*.plugin.js (generated). If Edit/Write
declines with "User answered in terminal", fall back to Bash+python exact-string replacement
(user-authorized for this repo): assert single-match before replacing, re-read after.
No commits.
Done when: <observable conditions incl. build green>.
Return ≤N tokens: per-item ✅/❌ + file:line, key verification evidence, build result.
```

Risk grading for triage: **LOW** = mechanically safe, auto-apply. **MED** = apply with stated
verification. **HIGH** = touches game feel/balance/data — surface to the user first.
