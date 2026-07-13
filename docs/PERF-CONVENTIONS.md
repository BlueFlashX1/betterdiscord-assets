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
| R2 | **Army-wide XP goes through the pending-shared-XP accumulator** (`progression.js:shareShadowXP` → `flushPendingSharedXp`, 10-min timer + stop-flush). Never per-event grants with null shadowIds. | `ShadowArmy/progression.js:19-93` |
| R3 | **Hot-path check ordering: cheapest, most-likely-to-reject first.** Own-message / monitored-user Set lookups come BEFORE any DOM query, fiber walk, or allocation. Cache negative results (WeakSet of not-own elements) when the answer is immutable. | `CriticalHit/pipeline.js:checkForCrit`; `SLS/message-observers.js` |
| R4 | **`BdApi.Data.save` is synchronous localStorage.** Defer off hot paths, coalesce (SLS: 20s debounce + 30s dirty-gated net), flush on stop. Never READ (e.g. backup scans) on the write path — cache reads in memory. | `SLS/settings-store.js`, `persistence-backups.js` |
| R5 | **Webpack modules resolve ONCE, cached** — at `start()` or in a memoized shared acquirer. `{searchExports:true}` only inside a one-time cached resolution. **No optional chaining inside Webpack filter functions.** Dispatcher via `shared/dispatcher.acquireDispatcher()`; stores via `BdApi.Webpack.getStore("X")` cached on the instance. | `Stealth/index.js:816`, `shared/dispatcher.js` |
| R6 | **Observers: shared hubs, narrow scope, throttled, `document.hidden`-gated.** New cross-plugin singletons live on `window.__SL_*` (esbuild bundles `shared/` per plugin — module scope is NOT shared; refcount on the global). Deliberate deviation from community "patch render instead": Patcher-on-render rots with hashed internals; keep aria/role-anchored observers. | `shared/header-toolbar.js`, DKB `bd-esbuild-shared-singletons` |
| R7 | **Timers:** every interval needs (a) a `document.hidden` gate unless its work is required while hidden, (b) a self-stop or dirty-flag when idle, (c) an absolute catch-up ceiling if it processes elapsed time (5-min precedent). | `Dungeons/combat-shadow-support.js:getCappedAttackElapsedMs` |
| R8 | **IDB partial tolerance:** per-item `request.onerror` must `preventDefault()`+`stopPropagation()` or one bad record aborts the whole transaction. `onabort` handlers ARE the rejection path — never remove. No `push(...spread)` with potentially >65k elements. | `ShadowArmy/storage.js` batch methods |
| R9 | **React:** memoize components in frequently-refreshing containers; hoist ref callbacks that close over nothing; keyed remount semantics must be verified before memoizing. | `ShadowSenses/components.js:FeedCard` |
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
dead 71MB+28MB GIFs deletion, MyTheme.theme.css scaffold removal, Tier-2 video-element
background (USER DECISIONS pending); combat-allocation 45-60s staleness after mid-dungeon
rank-up (deliberate tradeoff — leave).

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
