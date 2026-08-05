const { UnifiedSaveManager } = require('./bootstrap-runtime');

/**
 * init-state — every `this.*` field the plugin owns, declared in one place.
 * One mixin (see index.js); called from the constructor via _initDefaults /
 * _initTimers / _initCaches / _initState / _initUI.
 *
 * Because all 40 sibling files share one `this`, this file is the closest
 * thing the plugin has to a schema. If you cannot find where a field comes
 * from, look here first.
 *
 * IT ALSO OWNS THE TUNING THAT ISN'T IN constants.js — a real trap:
 *   this.rankScaling = { powerStep, damageExponent, damageMin, damageMax,
 *                        mobHpStep, bossHpStep, shadowHp* ... }
 * combat-primitives reads these with `??` fallbacks. Those fallbacks MUST
 * mirror the values here. They have drifted before — a stale fallback triple
 * against different live values meant reading that function alone gave a damage
 * curve the game never used. Currently in sync at
 * powerStep 1.35 / damageExponent 0.85 / damageMin 0.35 / damageMax 8.0
 * (init-state ~line 198; combat-primitives ~line 750). Change one, change both.
 *
 * PRECOMPUTED LOOKUP TABLES built here, all indexed by rank index:
 *   _mobStatTable ....... quadratic mob stat growth
 *   _bossHPBonusTable ... boss HP bonus (uniform polynomial)
 *   _flatResCostTable ... resurrection mana cost per shadow rank
 * They exist so the combat path does zero math per entity. Adding a rank means
 * extending every table here, not just the RANK_ORDER list in shared/rank-utils.
 */
module.exports = {
  _initDefaults() {
    this.defaultSettings = {
      enabled: true,
      debug: false,
      autoDeploy: true, // auto-deploy shadows when a dungeon spawns (no manual join)
      spawnChance: 12,
      dungeonDuration: 600000,
      maxDungeonsPercentage: 0.15,
      minDungeonsAllowed: 3,
      maxDungeonsAllowed: 20,
      channelSpawnCooldown: 300000,
      globalSpawnCooldown: 60000,
      shadowAttackInterval: 3000,
      userAttackCooldown: 2000,
      mobKillNotificationInterval: 30000,
      mobMaxActiveCap: Infinity,
      mobWaveBaseCount: 200,
      mobWaveVariancePercent: 0.2,
      mobTierNormalShare: 0.7,
      mobTierEliteShare: 0.25,
      mobTierChampionShare: 0.05,
      // Post-unlock shadow split between mobs and boss. Raised 0.25 -> 0.5
      // (2026-07-14) so shadows keep clearing adds while fighting the boss
      // instead of ~75% tunnelling the boss; still shifts toward the boss at
      // low boss HP via shadowBossTargetShareLowBossHp. While the boss is
      // GATED, shadows already target mobs 100% (getShadowBossTargetChance
      // returns 0), so this only governs the post-unlock phase.
      // Extra army boss-damage while the player is actively participating
      // (joined + attacking). Makes joining matter instead of deploy-and-idle.
      // 0.25 = +25%. Range 0–2.
      userParticipationDamageBonus: 0.25,
      // Deliberate flat multiplier on all shadow damage (boss + mobs) so a large
      // shadow army overwhelms by sheer size. 2.0 = double. Raise for more
      // steamroll, lower for more challenge. (Not the old inflation bug — this
      // is the clean, single-source power lever.)
      shadowDamageScalar: 2.0,
      // MONARCH'S WILL (SM perk, 2026-08-05): damage multiplier for shadows
      // fighting in dungeons OTHER than the one the Monarch has joined.
      monarchsWillMultiplier: 1.25,
      // PERFORMANCE MODE (default ON): clamps concurrent alive mobs to
      // performanceAliveMobCap regardless of dungeon rank. High-rank dungeons
      // allowed up to 1M alive mobs, and several per-tick passes scan the full
      // alive array — the main in-dungeon lag source. Kill throughput is
      // unchanged (the attack budget only simulates ~800 mobs/tick anyway;
      // mobs refill from the queue as they die). Set false for rank-table caps.
      performanceMode: true,
      performanceAliveMobCap: 800,
      // WARFRONT (2026-07-15): two-layer battle. The object-simulated frontline
      // stays capped (performanceAliveMobCap), while the MASS battle — your
      // surplus army vs the gate's war host (dungeon.war.reserves, seeded from
      // mobCapacity: S 10k … Monarch+ 500k) — resolves in AGGREGATE each combat
      // tick: O(1) arithmetic, real war-scale kill counts, zero per-entity cost.
      // Kills flow through _onMobKilled (XP/essence/gate credit all batched).
      warfrontEnabled: true,
      // SOVEREIGN'S COMMAND: a species whose Grand Marshal is fielded fights
      // with its leader's edge — offense sovereigns raise war output, defense
      // sovereigns cut casualties, and led frontline shadows hit harder.
      gmLeadershipEnabled: true,
      gmLeadershipOffenseBonus: 0.2,
      gmLeadershipCasualtyCut: 0.4,
      gmLeadershipFrontlineBonus: 0.1,
      // Aggregate kills per surplus shadow per combat tick (~2s). 0.015 with a
      // 100k surplus army ≈ 1,500 kills/tick ≈ 45k/min — a Monarch host
      // (250k) falls in ~5 minutes of sustained war.
      warfrontKillRatePerShadow: 0.015,
      warfrontMaxKillsPerTick: 5000,
      // Boss gate during war: the general takes the field only after this
      // fraction of the host is culled (floor on top of the rank-scaled kills).
      warGateCullPercent: 0.10,
      // Anti-stuck valve: the gate opens on time alone after this long, so an
      // under-sized army is never permanently walled off the boss.
      bossGateMaxWaitMs: 600000,
      // Healer/support shadows actively restore HP to alive-damaged shadows
      // each combat tick (scaled by healer presence). Set false to disable.
      shadowHealerRestorationEnabled: true,
      // When the army exceeds its deployable cap, guarantee this share of the
      // deployed set is support/tank so the role-pressure mechanics engage
      // instead of being benched by a pure strongest-first cut. 0.12 = 12%.
      roleDiversityGuaranteeEnabled: true,
      minSupportTankShare: 0.12,
      shadowMobTargetShare: 0.5,
      shadowBossTargetShareLowBossHp: 0.85,
      shadowBossFocusLowHpThreshold: 0.4,
      bossGateEnabled: true,
      // Boss gate = clear-mobs-then-boss pacing. Was a pure 3-min timer with
      // ZERO required kills, so mobs were a side-show. Now the gate needs a
      // real mob cull (40 kills) plus a shorter 60s floor, so the mob phase is
      // an actual phase. Mobs spawn continuously while the boss lives, so any
      // finite kill count is always reachable — no unwinnable risk.
      bossGateMinDurationMs: 60000,
      bossGateRequiredMobKills: 40,
      shadowPressureScalingEnabled: false,
      shadowPressureMobScaleStep: 0.12,
      shadowPressureBossScaleStep: 0.18,
      shadowPressureScaleMax: 2.75,
      staticBossHpBaseMultiplier: 2.3,
      // GEOMETRIC per rank (was staticBossHpRankStep: 0.14, linear — replaced
      // 2026-08-03). See getStaticBossHpMultiplier in player-sync-allocation.js
      // for why a linear step could not separate the top ranks. Old saves that
      // still carry staticBossHpRankStep are harmless: the reader keys off
      // staticBossHpRankGrowth and falls back to this default when absent.
      staticBossHpRankGrowth: 1.25,
      rankAllocationDeployPoolShare: 0.8,
      rankAllocationPreferredPairShare: 0.8,
      rankAllocationSameRankShare: 0.75,
      roleCombatModelEnabled: true,
      roleCombatModelVersion: 1,
      combatStatusEffectsEnabled: true,
      combatStatusTickMs: 1000,
      combatStatusMaxTrackedMobs: 600,
      // Dungeon ranks including SS, SSS
      dungeonRanks: [
        'E',
        'D',
        'C',
        'B',
        'A',
        'S',
        'SS',
        'SSS',
        'SSS+',
        'NH',
        'Monarch',
        'Monarch+',
        'Shadow Monarch',
      ],
      userActiveDungeon: null,
      lastSpawnTime: {},
      lastDungeonEndTime: {},
      mobKillNotifications: {},
      userHP: null,
      userMaxHP: null,
      userMana: null,
      userMaxMana: null,
      // HP scaling: rank quadratic + shadow soft-cap
      userRankHpLinearStep: 50,
      userRankHpCurveStep: 35,
      userHpPerShadowBase: 8,
      userHpPerShadowRankStep: 0.6,
      userHpShadowSoftCapCount: 500,
      userHpShadowSoftCapMultiplier: 0.12,
      // Combat stat harmonizer: compresses extreme high-rank stats
      shadowCombatStatPivotScale: 3.5,
      shadowCombatStatCompressionExp: 0.68,
      settingsVersion: 4,
    };

    // IMPORTANT: avoid sharing references between defaults and live settings.
    // Hot paths mutate `this.settings`; if it aliases `defaultSettings`, defaults get corrupted.
    this.settings = structuredClone(this.defaultSettings);

    this.started = false;
    this.soloLevelingStats = null;
    this.shadowArmy = null;
    this.toasts = null;

    // Rank scaling — single source of truth for combat damage + mob/boss/shadow HP
    //
    // Damage multiplier is clamp((powerStep^gap)^damageExponent, min, max) where
    // gap = attackerRankIndex - defenderRankIndex. Applies symmetrically to every
    // matchup: shadow→mob, mob→shadow, and the player (combat-role-damage.js:516
    // is the single call site).
    //
    // damageMax 3.25 -> 8.0 (2026-08-03): the old ceiling stopped differentiating
    // at just +4.6 ranks, so a Shadow Monarch shadow hit an E mob with exactly the
    // same rank bonus as an A-rank shadow would — every gap from +5 to +12
    // collapsed to one number. 8.0 pushes that out to +8.2. The rank ladder is 13
    // wide, so removing the cap entirely would need ~21.4; 8.0 is deliberately
    // short of that, leaving the extreme end compressed rather than explosive
    // (stats already carry a ~644x spread from E to Shadow Monarch, so the rank
    // multiplier is the seasoning, not the meal).
    //
    // damageMin 0.35 is intentionally NOT lowered here — it is the floor that
    // keeps under-ranked shadows contributing instead of being dead weight. Note
    // it is generous: an E shadow still deals 35% of its damage to a Shadow
    // Monarch target. Lower it toward ~0.15 if under-ranked deployments should
    // feel genuinely futile.
    this.rankScaling = {
      powerStep: 1.35,
      damageExponent: 0.85,
      damageMin: 0.35,
      damageMax: 8.0,
      mobHpStep: 1.18,
      mobHpMaxFactor: 12,
      bossHpStep: 1.3,
      bossHpMaxFactor: 60,
      shadowHpBaseFactor: 0.9,
      shadowHpStep: 0.05,
      shadowHpMaxFactor: 1.5,
    };

    this.extractionRetryLimit = 3;
  },

  _initTimers() {
    this.shadowAttackIntervals = new Map();
    this.mobKillNotificationTimers = new Map();
    this.mobSpawnTimers = new Map();
    this._mobSpawnNextAt = new Map();
    this._mobSpawnQueueNextAt = new Map();
    this._mobSpawnLoopInterval = null;
    this._mobSpawnLoopInFlight = false;
    this._mobSpawnLoopNextAt = 0;
    // 1500ms base tick: reduced from 500ms to avoid typing lag in background
    this._mobSpawnLoopTickMs = 1500;
    this.bossAttackTimers = new Map();
    this.mobAttackTimers = new Map();

    // Centralized resource tracking (cleanup on stop)
    this._intervals = new Set();
    this._timeouts = new Set();

    this.regenInterval = null;
    this.currentChannelUpdateInterval = null;

    // PERFORMANCE: global combat loop (replaces per-dungeon intervals)
    this._combatLoopInterval = null;
    this._combatLoopInFlight = false;
    this._combatLoopNextAt = 0;
    // 2s base tick: reduced from 1s to avoid typing lag in background
    this._combatLoopTickMs = 2000;
    this._shadowActiveIntervalMs = new Map();
    this._shadowBackgroundIntervalMs = new Map();
    this._bossBackgroundIntervalMs = new Map();
    this._mobBackgroundIntervalMs = new Map();

    this._visibilityChangeHandler = null;
    this._pausedIntervals = new Map();
    this._hpBarRestoreInterval = null;

    this.dungeonCleanupInterval = null;

    this._lastShadowAttackTime = new Map();
    this._lastBossAttackTime = new Map();
    this._lastMobAttackTime = new Map();
  },

  _initCaches() {
    this._ariseButtonRefs = new Map();
    this._bossBarCache = new Map();
    this._mobCleanupCache = new Map();
    this._bossBarLayoutThrottle = new Map();
    this._rankStatsCache = new Map();
    this._personalityCache = new Map();
    this._memberWidthCache = new Map();
    this._containerCache = new Map();

    this._shadowCountCache = null;
    this._shadowsCache = null;
    this._deployStarterPoolCache = null;
    this._deployStarterPoolCacheTime = null;
    this._deployStarterPoolCacheRank = null;
    this._deployStarterPoolCacheTTL = 120000;
    this._deployStarterPoolStaleMaxAge = 900000;
    this._shadowStatsCache = new Map();
    this._mobGenerationCache = new Map();
    this._mobCacheTTL = 60000;


    this._cache = {
      pluginInstances: {},
      pluginInstancesTime: {},
      pluginInstancesTTL: 5000,
      skillTreeBonuses: null,
      skillTreeBonusesTime: 0,
      skillTreeBonusesTTL: 500,
      userEffectiveStats: null,
      userEffectiveStatsTime: 0,
      userEffectiveStatsTTL: 500,
    };
    this._guildChannelCache = new Map();
    this._guildChannelCacheTTL = 30000;
    this._spawnableChannelCache = new Map();
    this._spawnableChannelCacheTTL = 10000;

    // Shadow pre-allocation: split once, reuse across combat ticks
    this.shadowAllocations = new Map();
    this.shadowReserve = [];
    this.allocationCache = null;
    this.allocationCacheTime = null;
    this.allocationCacheTTL = 45000;
    this._allocationHardRefreshTTL = 120000;
    this._allocationDirty = true;
    this._allocationDirtyReason = 'init';
    this._allocationShadowSetDirty = true;
    this._allocationSortedShadowsCache = null;
    this._allocationSortedShadowsCacheTime = null;
    this._allocationSortedShadowsCacheTTL = 600000;
    this._allocationScoreCache = null;
    this._allocationSummary = new Map();
    this.shadowArmyCountCache = new Map();
  },

  _initState() {
    // Message handling is FluxDispatcher-driven (see message-observer.js); the
    // old MutationObserver field is gone. Dispatcher handle/handler are lazily
    // created in startMessageObserver.
    this._msgDispatcher = null;
    this._msgCreateHandler = null;
    this._msgDispatcherPoll = null;
    this._sessionToken = 0;
    this._mobIdCounter = 0;
    this._mobSpawnQueue = new Map();
    this._spawnPipelineGuardAt = new Map();
    this._mobContributionMissLogState = new Map();
    this.lastUserAttackTime = 0;
    this.storageManager = null;
    this.mobBossStorageManager = null; // Dedicated storage for mobs and bosses
    this.activeDungeons = new Map();
    this._pendingDungeonMobXPByBatch = new Map();
    this._pendingDungeonMobKillsByBatch = new Map();
    this._combatRoundRobinCursor = 0;
    this._roleCombatStates = new Map();
    this._combatStatusByChannel = new Map();
    this._perfTelemetry = {
      combatTickEmaMs: 0,
      mobSpawnTickEmaMs: 0,
      lastAutotuneLogAt: 0,
      lastSchedulerLogAt: 0,
      lastSpikeLogAt: 0,
      combatSpikeCount: 0,
      combatDirtyMarkCount: 0,
      lastCombatDirtyReason: null,
      lastProcessedDungeonCount: 0,
      lastSkippedDungeonCount: 0,
    };
    this._combatSettingsDirty = false;
    this._combatSettingsLastFlushAt = 0;
    // 10s (was 1500ms — profiler 2026-07-30): the 1.5s floor drove a full
    // settings sanitize+IDB save every ~3s of combat (505ms-class stalls +
    // the USM backup train). Boss-death/completion saves stay immediate;
    // SLS precedent is 20s coalescing. Crash window: ≤10s of mana/XP drift,
    // covered by existing catch-up mechanics.
    this._combatSettingsFlushIntervalMs = 10000;
    this._combatSettingsFallbackFlushTimer = null;

    this.hiddenComments = new Map();

    // Channel lock: one dungeon at a time per channel
    this.channelLocks = new Set();
    this._lastGlobalSpawnTime = 0;

    this.deadShadows = new Map();
    this._observers = new Set();
    this._listeners = new Map(); // {type: Set<handler>} or {target,event,handler,capture}

    // Defeated bosses awaiting ARISE extraction
    this.defeatedBosses = new Map();
    this._arisedBossIds = new Set();

    // ARISE corpse pile is stored on each dungeon object (dungeon.corpsePile = [])
    // so it persists to IDB and survives hot-reloads/restarts.

    this._lastRebalanceAt = new Map();
    this._rebalanceCooldownMs = 15000;
    this._deployRebalanceInFlight = new Set();
    this._deployStarterWarmInFlight = null;
    this._deployStarterShadowCap = 240;

    this.currentChannelKey = null;
    this._isWindowVisible = !document.hidden;
    this._windowHiddenTime = null;

    this.saveManager = null;
    if (UnifiedSaveManager) {
      this.saveManager = new UnifiedSaveManager('Dungeons');
    }

    this.observerStartTime = Date.now();
    this.processedMessageIds = new Set();
    this._injectedStyles = new Set();
    this._mobCapWarningShown = {};
    this.extractionEvents = new Map();
    this.extractionInProgress = new Set();

    // Story Modes (Demon Castle)
    this._storyModeActive = false;
    this._demonCastle = null;
    this._dcPermits = 0;
    this._dcPermitsPendingFlush = 0;
    this.storyModeStorage = null;
  },

  _initUI() {
    this.dungeonIndicators = new Map();
    this.bossHPBars = new Map();
    this._bossBarLayoutFrame = null;
    this._navigationUtils = null;
    this._dungeonHeaderWidgetButton = null;
    this._dungeonHeaderPopup = null;
    this._dungeonHeaderWidgetLoop = null;
    this._dungeonHeaderPopupDocClickHandler = null;
    this._dungeonHeaderPopupResizeHandler = null;
    this._dungeonHeaderPopupScrollHandler = null;
    this._dungeonHeaderPopupPositionRaf = null;
    this._dungeonUiActionLocks = new Set();
    this._storyModePopupTab = 'dungeons';

    // Throttled DOM updates
    this._hpBarUpdateQueue = new Set();
    this._hpBarUpdateScheduled = false;
    this._lastHPBarUpdate = {};
  },

  debugLog(...args) {
    if (!args || args.length === 0) return;
    if (this.settings.debug) {
      // Legacy direct console log kept for compatibility; controlled by infoLog/debugLog
      // Prefer debugLog/infoLog instead of direct console usage.
      console.log('[Dungeons]', ...args);
    }
  },

  debugLogOnce(key, ...args) {
    if (!key) return this.debugLog(...args);
    this._debugLogOnceKeys || (this._debugLogOnceKeys = new Set());
    // LEAK-1: Prevent unbounded growth in multi-hour sessions
    if (this._debugLogOnceKeys.size > 5000) {
      this._debugLogOnceKeys.clear();
    }
    if (this._debugLogOnceKeys.has(key)) return;
    this._debugLogOnceKeys.add(key);
    this.debugLog(...args);
  },

  _setTrackedTimeout(callback, delayMs) {
    const timeoutId = setTimeout(() => {
      this._timeouts.delete(timeoutId);
      callback();
    }, delayMs);
    this._timeouts.add(timeoutId);
    return timeoutId;
  },

  _yieldToEventLoop(delayMs = 0) {
    return new Promise((resolve) => {
      this._setTrackedTimeout(resolve, delayMs);
    });
  },

  _getPluginSafe(name) {
    try {
      if (!BdApi.Plugins.isEnabled(name)) return null;
      const plugin = BdApi.Plugins.get(name);
      if (!plugin?.instance) {
        this.debugLogOnce?.(`PLUGIN_MISSING:${name}`, 'PLUGIN', `Plugin ${name} not available`);
        return null;
      }
      return plugin.instance;
    } catch (e) {
      this.errorLog?.('PLUGIN', `Failed to get plugin ${name}`, e);
      return null;
    }
  },

  _getShadowSensesDeployedIds() {
    const deployed = new Set();
    try {
      const senses = this._getPluginSafe('ShadowSenses');
      if (!senses) return deployed;

      if (typeof senses.getDeployedShadowIds === 'function') {
        const ids = senses.getDeployedShadowIds();
        if (ids instanceof Set) {
          ids.forEach((id) => id && deployed.add(String(id)));
          return deployed;
        }
      }

      // Compatibility fallback: ShadowSenses exposes deploymentManager in current builds.
      const deployments = senses.deploymentManager?.getDeployments?.();
      if (Array.isArray(deployments)) {
        deployments.forEach((entry) => {
          const id = entry?.shadowId;
          id && deployed.add(String(id));
        });
      }
    } catch (error) {
      this.errorLog?.('PLUGIN', 'Failed to get ShadowSenses deployed IDs', error);
    }
    return deployed;
  },

  _ensureCombatLoop() {
    if (this._combatLoopInterval) return;
    const tick = () => {
      if (!this.started) return;
      if (this._combatLoopInFlight) return;
      if (
        this.shadowAttackIntervals.size === 0 &&
        this.bossAttackTimers.size === 0 &&
        this.mobAttackTimers.size === 0
      ) {
        // No work left; stop the loop to reduce baseline CPU.
        this._stopCombatLoop();
        return;
      }

      this._combatLoopInFlight = true;
      Promise.resolve()
        .then(() => this._combatLoopTick())
        .catch((error) => this.errorLog('CRITICAL', 'Combat loop tick error', error))
        .finally(() => {
          this._combatLoopInFlight = false;
        });
    };

    this._combatLoopInterval = setInterval(tick, this._combatLoopTickMs);
    this._intervals.add(this._combatLoopInterval);
  },

  _stopCombatLoop() {
    if (!this._combatLoopInterval) return;
    clearInterval(this._combatLoopInterval);
    this._intervals.delete(this._combatLoopInterval);
    this._combatLoopInterval = null;
    this._combatLoopInFlight = false;
    this._combatLoopNextAt = 0;
  },

  _ensureMobSpawnLoop() {
    if (this._mobSpawnLoopInterval) return;
    this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TRACE: _ensureMobSpawnLoop — STARTING loop (tickMs=${this._mobSpawnLoopTickMs})`);

    const tick = () => {
      if (!this.started) return;
      if (this._mobSpawnLoopInFlight) return;

      const hasWork =
        (this._mobSpawnNextAt && this._mobSpawnNextAt.size > 0) ||
        (this._mobSpawnQueueNextAt && this._mobSpawnQueueNextAt.size > 0);
      if (!hasWork) {
        // PERF: Stop the interval entirely when idle — prevents 500ms empty ticks forever.
        // _mobSpawnLoopTick's self-stop is unreachable from this early-return path.
        this._stopMobSpawnLoop();
        return;
      }

      // Allow queue flush even when window is hidden so newly spawned mobs actually deploy.
      // We'll still skip creating NEW waves while hidden to prevent load spikes.
      const isVisible = this.isWindowVisible();

      this._mobSpawnLoopInFlight = true;
      Promise.resolve()
        .then(() => this._mobSpawnLoopTick(isVisible))
        .catch((error) => this.errorLog('CRITICAL', 'Mob spawn loop tick error', error))
        .finally(() => {
          this._mobSpawnLoopInFlight = false;
        });
    };

    this._mobSpawnLoopInterval = setInterval(tick, this._mobSpawnLoopTickMs || 300);
    this._intervals.add(this._mobSpawnLoopInterval);
  },

  _stopMobSpawnLoop() {
    if (!this._mobSpawnLoopInterval) return;
    clearInterval(this._mobSpawnLoopInterval);
    this._intervals.delete(this._mobSpawnLoopInterval);
    this._mobSpawnLoopInterval = null;
    this._mobSpawnLoopInFlight = false;
    this._mobSpawnLoopNextAt = 0;
  },

  _computeNextMobSpawnDelayMs(dungeonState) {
    // Phased spawn rate: rapid fill → moderate → steady
    // Use active-vs-cap fill ratio (not active-vs-targetCount) so large dungeons
    // don't stay permanently in rapid mode while capped by runtime mob capacity.
    const mobCount = dungeonState?.mobs?.activeMobs?.length || 0;
    const dungeonCapRaw = Number(dungeonState?.mobs?.mobCapacity);
    const mobCap = Number.isFinite(dungeonCapRaw) && dungeonCapRaw > 0
      ? Math.max(50, Math.floor(dungeonCapRaw))
      : 200;
    const fillRatio = mobCap > 0 ? this.clampNumber(mobCount / mobCap, 0, 1) : 1;

    let baseInterval;
    if (fillRatio < (this._spawnPhases?.rapid ?? 0.3)) {
      baseInterval = 2500;                                         // Rapid: 2.5s (was 800ms — 3x fewer events)
    } else if (fillRatio < (this._spawnPhases?.moderate ?? 0.7)) {
      baseInterval = 4000 + (fillRatio - 0.3) * 4000;             // 4s→5.6s (moderate fill)
    } else {
      baseInterval = 6000 + (fillRatio - 0.7) * 6667;             // 6s→8s (steady/full)
    }

    const variance = baseInterval * 0.15;
    return baseInterval - variance + Math.random() * variance * 2;
  },

  _getDesiredMobSpawnTickMs(isVisible = true) {
    if (!isVisible) return 1000;
    const activeCount = this.activeDungeons?.size || 0;
    let base = this._mobSpawnLoopTickMs || 500;
    if (activeCount >= 3) base = 750;
    else if (activeCount >= 2) base = 650;
    const adaptive = this._getAdaptiveLoadState();
    return base + Math.floor(adaptive.tickPenaltyMs * 0.7);
  },

  _getDesiredCombatTickMs(isWindowVisible = true) {
    const activeCount = this.activeDungeons?.size || 0;
    let base = this._combatLoopTickMs || 1000;
    if (!isWindowVisible) base = 2000;
    else if (activeCount >= 4) base = 1500;
    else if (activeCount >= 2) base = 1250;
    const adaptive = this._getAdaptiveLoadState();
    return base + adaptive.tickPenaltyMs;
  },

  _recordPerfMetric(metricKey, sampleMs, alpha = 0.15) {
    if (!this._perfTelemetry || !Number.isFinite(sampleMs) || sampleMs < 0) return;
    const prev = Number(this._perfTelemetry[metricKey]) || 0;
    if (prev <= 0) {
      this._perfTelemetry[metricKey] = sampleMs;
      return;
    }
    this._perfTelemetry[metricKey] = prev + (sampleMs - prev) * this.clampNumber(alpha, 0.05, 0.5);
  },

  _maybeLogPerfSpike({
    now = Date.now(),
    tickMs = 0,
    desiredTickMs = 0,
    activeDungeonCount = 0,
    processedDungeonCount = 0,
    skippedDungeonCount = 0,
    isWindowVisible = true,
  } = {}) {
    if (!this._perfTelemetry || !Number.isFinite(tickMs) || tickMs <= 0) return;
    const targetTickMs = Number.isFinite(desiredTickMs) && desiredTickMs > 0
      ? desiredTickMs
      : (this._combatLoopTickMs || 1000);
    const overshootMs = tickMs - targetTickMs;
    // Ignore tiny variance; focus on spikes likely to be user-visible.
    if (overshootMs < 250 && tickMs < 1500) return;

    this._perfTelemetry.combatSpikeCount = (this._perfTelemetry.combatSpikeCount || 0) + 1;
    const severeSpike = overshootMs >= 1000 || tickMs >= 2200;
    const throttleMs = severeSpike ? 20000 : 45000;
    const lastSpikeLogAt = Number(this._perfTelemetry.lastSpikeLogAt) || 0;
    if (now - lastSpikeLogAt < throttleMs) return;

    this._perfTelemetry.lastSpikeLogAt = now;
    const adaptive = this._getAdaptiveLoadState();
    console.warn(
      `[Dungeons] PERF SPIKE tick=${Math.round(tickMs)}ms target=${Math.round(targetTickMs)}ms ` +
      `overshoot=+${Math.round(Math.max(0, overshootMs))}ms active=${activeDungeonCount} ` +
      `processed=${processedDungeonCount} skipped=${skippedDungeonCount} ` +
      `visible=${isWindowVisible ? 1 : 0} ema=${Math.round(adaptive.maxEma)}ms ` +
      `dirty=${this._combatSettingsDirty ? 1 : 0} reason=${this._perfTelemetry.lastCombatDirtyReason || 'n/a'} ` +
      `spikes=${this._perfTelemetry.combatSpikeCount}`
    );
  },

  _getAdaptiveLoadState() {
    const combatEma = Number(this._perfTelemetry?.combatTickEmaMs) || 0;
    const spawnEma = Number(this._perfTelemetry?.mobSpawnTickEmaMs) || 0;
    const maxEma = Math.max(combatEma, spawnEma);
    if (maxEma >= 450) {
      return { tickPenaltyMs: 500, budgetScale: 0.6, maxEma, combatEma, spawnEma };
    }
    if (maxEma >= 300) {
      return { tickPenaltyMs: 300, budgetScale: 0.75, maxEma, combatEma, spawnEma };
    }
    if (maxEma >= 200) {
      return { tickPenaltyMs: 150, budgetScale: 0.9, maxEma, combatEma, spawnEma };
    }
    return { tickPenaltyMs: 0, budgetScale: 1, maxEma, combatEma, spawnEma };
  },

  _isAllocationHardExpired(now = Date.now()) {
    if (!this.allocationCache || !this.allocationCacheTime) return true;
    const hardTtl = Number.isFinite(this._allocationHardRefreshTTL)
      ? Math.max(30000, this._allocationHardRefreshTTL)
      : 120000;
    return now - this.allocationCacheTime >= hardTtl;
  },

  _hasDeployedDungeonMissingAllocation() {
    for (const [channelKey, dungeon] of this.activeDungeons.entries()) {
      if (!dungeon || dungeon.completed || dungeon.failed || !dungeon.shadowsDeployed) continue;
      if (dungeon?._deployPendingFullAllocation === true) continue;
      if (this._deployRebalanceInFlight?.has?.(channelKey)) continue;
      const assigned = this.shadowAllocations.get(channelKey);
      if (!Array.isArray(assigned) || assigned.length === 0) return true;
    }
    return false;
  },

  _buildRankLookupTables() {
    const { RANK_ORDER } = require('../shared/rank-utils');
    const ranks = this.settings.dungeonRanks || RANK_ORDER;
    const n = ranks.length;

    // Flat resurrection costs (Step 1)
    this._flatResCostTable = new Float32Array([5, 8, 12, 18, 25, 35, 50, 70, 85, 95, 120, 150, 200].slice(0, n));

    // Mob base stats — quadratic+linear scaling (Step 2a)
    this._mobStatTable = {
      strength:     new Float32Array(n),
      agility:      new Float32Array(n),
      intelligence: new Float32Array(n),
      vitality:     new Float32Array(n),
    };
    for (let i = 0; i < n; i++) {
      this._mobStatTable.strength[i]     = 100 + i * 50 + Math.floor(i * i * 15);
      this._mobStatTable.agility[i]      = 80  + i * 40 + Math.floor(i * i * 12);
      this._mobStatTable.intelligence[i] = 60  + i * 30 + Math.floor(i * i * 8);
      this._mobStatTable.vitality[i]     = 150 + i * 100 + Math.floor(i * i * 40);
    }

    // Boss HP bonus — uniform polynomial across every rank.
    //
    // This used to taper logarithmically above SSS (9051 + 2000*log2(i-6)),
    // which grew only 1.57x across the top FIVE ranks (9051 -> 14221) and made
    // SSS+ through Shadow Monarch feel interchangeable. The taper was also
    // nearly irrelevant next to the vitality term it is added to, so removing
    // it costs little and restores late-game separation.
    this._bossHPBonusTable = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this._bossHPBonusTable[i] = Math.pow(i + 1, 2.5) * 50;
    }

    // Spawn phase boundaries (Step 3)
    this._spawnPhases = { rapid: 0.3, moderate: 0.7 };

    // Clear stale rank stats cache
    this._rankStatsCache?.clear?.();
  }
};
