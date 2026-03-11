const CacheManager = require('./cache-manager');
const { UnifiedSaveManager } = require('./bootstrap-runtime');

module.exports = {
  _initDefaults() {
    this.defaultSettings = {
      enabled: true,
      debug: false, // Debug mode: enables verbose console logging
      spawnChance: 12, // 12% chance per user message
      dungeonDuration: 600000, // 10 minutes
      maxDungeonsPercentage: 0.15, // Max 15% of server channels can have active dungeons
      minDungeonsAllowed: 3, // Always allow at least 3 dungeons even in small servers
      maxDungeonsAllowed: 20, // Cap at 20 dungeons max even in huge servers
      channelSpawnCooldown: 300000, // 5 min cooldown per channel after dungeon ends
      globalSpawnCooldown: 60000, // 60s between any new dungeon spawn
      shadowAttackInterval: 3000,
      userAttackCooldown: 2000,
      mobKillNotificationInterval: 30000,
      mobMaxActiveCap: 1000, // Hard limit on simultaneously active mobs per dungeon
      mobWaveBaseCount: 200, // Per-wave spawn target before variance/cap checks (larger batches, less frequent)
      mobWaveVariancePercent: 0.2, // ±20% organic wave variance
      mobTierNormalShare: 0.7, // Spawn mix: normal mobs
      mobTierEliteShare: 0.25, // Spawn mix: elite mobs
      mobTierChampionShare: 0.05, // Spawn mix: champion mobs (mini-boss pressure)
      shadowMobTargetShare: 0.7, // Shadow targeting: 70% mobs by default
      shadowBossTargetShareLowBossHp: 0.6, // When boss low HP, shift to boss focus
      shadowBossFocusLowHpThreshold: 0.4, // 40% boss HP execute threshold
      bossGateEnabled: true, // Prevent immediate boss burn on fresh dungeon spawn
      bossGateMinDurationMs: 180000, // Boss unlock requires at least 3 minutes elapsed
      bossGateRequiredMobKills: 0, // No mob kill requirement — timer only
      shadowPressureScalingEnabled: false, // Lore mode: disable HP scaling from deployed shadow count
      shadowPressureMobScaleStep: 0.12, // mobHP *= 1 + step * log10(shadowPower + 1)
      shadowPressureBossScaleStep: 0.18, // bossHP *= 1 + step * log10(shadowPower + 1)
      shadowPressureScaleMax: 2.75, // Safety cap for pressure scaling
      staticBossHpBaseMultiplier: 2.3, // Base static HP multiplier (no shadow pressure scaling)
      staticBossHpRankStep: 0.14, // Additional static HP multiplier per rank index
      rankAllocationDeployPoolShare: 0.8, // Share of combat pool to deploy across active dungeons
      rankAllocationPreferredPairShare: 0.8, // Share of each dungeon allocation from (same-rank + one-rank-higher)
      rankAllocationSameRankShare: 0.75, // Inside preferred pair, majority stays same-rank
      roleCombatModelEnabled: true, // Lore-role combat model (bounded state, low-overhead)
      roleCombatModelVersion: 1, // Reserved for future behavior migrations
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
      lastDungeonEndTime: {}, // channelKey -> timestamp (used for spawn cooldown)
      mobKillNotifications: {},
      // User HP/Mana (calculated from stats)
      userHP: null, // Will be calculated from vitality
      userMaxHP: null,
      userMana: null, // Will be calculated from intelligence
      userMaxMana: null,
      settingsVersion: 3,
    };

    // IMPORTANT: avoid sharing references between defaults and live settings.
    // Hot paths mutate `this.settings`; if it aliases `defaultSettings`, defaults get corrupted.
    this.settings = structuredClone(this.defaultSettings);

    // Plugin running state
    this.started = false;

    // Plugin references
    this.soloLevelingStats = null;
    this.shadowArmy = null;
    this.toasts = null;

    // RANK SCALING CONFIG (single source of truth)
    // Used by combat damage + mob/boss/shadow HP scaling.
    this.rankScaling = {
      powerStep: 1.35, // base step used for rank power ratio
      damageExponent: 0.85, // curve for rank-vs-rank damage multiplier
      damageMin: 0.35,
      damageMax: 3.25,
      mobHpStep: 1.18,
      mobHpMaxFactor: 12,
      bossHpStep: 1.3, // stronger rank separation for boss HP
      bossHpMaxFactor: 60, // safety cap for extreme rank indices
      shadowHpBaseFactor: 0.9,
      shadowHpStep: 0.05,
      shadowHpMaxFactor: 1.5,
    };

    this.extractionRetryLimit = 3; // Max attempts per boss (mobs use single-attempt immediate extraction)
  },

  _initTimers() {
    this.shadowAttackIntervals = new Map();
    this.mobKillNotificationTimers = new Map();
    this.mobSpawnTimers = new Map();
    this._mobSpawnNextAt = new Map(); // channelKey -> next spawn timestamp (global scheduler)
    this._mobSpawnQueueNextAt = new Map(); // channelKey -> next queue flush timestamp
    this._mobSpawnLoopInterval = null;
    this._mobSpawnLoopInFlight = false;
    this._mobSpawnLoopNextAt = 0;
    // 500ms base tick: fast enough for responsive queue flushes, light enough for CPU
    this._mobSpawnLoopTickMs = 500;
    this.bossAttackTimers = new Map(); // Boss attack timers per dungeon
    this.mobAttackTimers = new Map(); // Mob attack timers per dungeon

    // CENTRALIZED RESOURCE MANAGEMENT (for proper cleanup - prevents memory leaks)
    this._intervals = new Set(); // Track all setInterval IDs for cleanup
    this._timeouts = new Set(); // Track all setTimeout IDs for cleanup

    // HP/Mana regeneration timer
    this.regenInterval = null;

    // Performance optimization: Track current channel for active dungeon detection
    this.currentChannelUpdateInterval = null; // Update current channel every 2 seconds

    // PERFORMANCE: global combat loop (replaces per-dungeon intervals)
    this._combatLoopInterval = null;
    this._combatLoopInFlight = false;
    this._combatLoopNextAt = 0;
    // 1s base tick: reduces baseline CPU; per-dungeon cadence still handled by interval maps.
    this._combatLoopTickMs = 1000;
    this._shadowActiveIntervalMs = new Map(); // channelKey -> active interval ms
    this._shadowBackgroundIntervalMs = new Map(); // channelKey -> background interval ms
    this._bossBackgroundIntervalMs = new Map(); // channelKey -> background interval ms
    this._mobBackgroundIntervalMs = new Map(); // channelKey -> background interval ms

    // Performance optimization: Track window visibility for background processing
    this._visibilityChangeHandler = null; // Visibility change event handler
    this._pausedIntervals = new Map(); // Track paused intervals: { channelKey: { shadow, boss, mob } }

    // HP bar restoration interval (restores HP bars removed by DOM changes)
    this._hpBarRestoreInterval = null;

    this.dungeonCleanupInterval = null;

    // Performance optimization: Track last processing time for batch processing
    this._lastShadowAttackTime = new Map(); // channelKey -> last processing timestamp
    this._lastBossAttackTime = new Map(); // channelKey -> last processing timestamp
    this._lastMobAttackTime = new Map(); // channelKey -> last processing timestamp
  },

  _initCaches() {
    this._ariseButtonRefs = new Map(); // PERF: Cache ARISE button DOM refs to avoid document.querySelector every 5 ticks
    this._bossBarCache = new Map(); // Cache last boss bar render payload per channel
    this._mobCleanupCache = new Map(); // Throttled alive-mob counts per channel
    this._bossBarLayoutThrottle = new Map(); // Throttle HP bar layout adjustments (100-150ms)
    this._rankStatsCache = new Map(); // Cache rank-based stat calculations
    // Boss stats are rolled fresh per instance (no cache needed — bosses spawn infrequently)
    this._personalityCache = new Map(); // TTL cache for personality lookups
    this._memberWidthCache = new Map(); // Short-lived cache for member list width
    this._containerCache = new Map(); // Cache for progress/header containers (short TTL)

    // CACHE MANAGEMENT
    this._shadowCountCache = null; // Shadow count cache (5s TTL)
    this._shadowsCache = null; // Shadows data cache (10s TTL — invalidated explicitly on mutations)
    this._deployStarterPoolCache = null; // Rank-aware sampled pool for fast deploy allocation (not a full-army cache)
    this._deployStarterPoolCacheTime = null;
    this._deployStarterPoolCacheRank = null;
    // Starter pool should stay reusable long enough for realistic "spawn then deploy" delays.
    this._deployStarterPoolCacheTTL = 120000; // 2 min fresh window
    this._deployStarterPoolStaleMaxAge = 900000; // 15 min stale fallback window
    this._shadowStatsCache = new Map(); // Shadow stats cache (500ms TTL)
    this._mobGenerationCache = new Map(); // Mob generation cache (prevents crashes from excessive generation)
    this._mobCacheTTL = 60000; // 60 seconds cache TTL for mob generation

    // CENTRALIZED CACHE MANAGER
    this.cache = new CacheManager();

    // Additional performance caches
    this._cache = {
      pluginInstances: {}, // Cache plugin instances by name
      pluginInstancesTime: {},
      pluginInstancesTTL: 5000, // 5s - plugin instances don't change often
      userEffectiveStats: null,
      userEffectiveStatsTime: 0,
      userEffectiveStatsTTL: 500, // 500ms - stats change when stats are allocated
    };
    this._guildChannelCache = new Map(); // guildId -> {ts, channels}
    this._guildChannelCacheTTL = 30000; // 30s
    this._spawnableChannelCache = new Map(); // guildId -> {ts, channels} (text + unmuted)
    this._spawnableChannelCacheTTL = 10000; // 10s

    // Shadow army pre-allocation cache (optimization: split shadows once, reuse assignments)
    this.shadowAllocations = new Map(); // Map<channelKey, assignedShadows[]>
    this.shadowReserve = []; // Weakest shadows held back for ShadowSenses deployment
    this.allocationCache = null; // Cache of all shadows
    this.allocationCacheTime = null; // When cache was created
    this.allocationCacheTTL = 45000; // Reduced recompute churn; immediate dirty invalidation still handles ghost-combatant consistency
    this._allocationHardRefreshTTL = 120000; // Safety full refresh in case dirty invalidation misses an edge path
    this._allocationDirty = true; // Recompute allocations on first use
    this._allocationDirtyReason = 'init';
    this._allocationShadowSetDirty = true; // Rebuild sorted shadow pool when army composition/stats changed
    this._allocationSortedShadowsCache = null; // Cached strongest->weakest sorted army
    this._allocationSortedShadowsCacheTime = null;
    this._allocationSortedShadowsCacheTTL = 600000; // 10 min TTL; shadow-set mutations invalidate immediately
    this._allocationScoreCache = null; // Map<shadowId, combatScore>
    this._allocationSummary = new Map(); // channelKey -> { dungeonRank, assignedCount, avgShadowRankIndex }
    this.shadowArmyCountCache = new Map(); // Track shadow count to detect new extractions
  },

  _initState() {
    this.messageObserver = null;
    this._mobIdCounter = 0; // Incrementing mob ID (faster than Math.random().toString(36))
    this._mobSpawnQueue = new Map(); // Micro-queue for batched mob spawning (250-500ms)
    this._spawnPipelineGuardAt = new Map(); // channelKey -> last guard log timestamp
    this._mobContributionMissLogState = new Map(); // channelKey -> throttled miss-log state
    this.lastUserAttackTime = 0;
    this.storageManager = null;
    this.mobBossStorageManager = null; // Dedicated storage for mobs and bosses
    this.activeDungeons = new Map(); // Use Map for better performance
    this._pendingDungeonMobXPByBatch = new Map(); // xpBatchKey -> pending mob XP (awarded on dungeon end)
    this._pendingDungeonMobKillsByBatch = new Map(); // xpBatchKey -> pending mob kills (summary context)
    this._combatRoundRobinCursor = 0; // Fair scheduler cursor for multi-dungeon combat processing
    this._roleCombatStates = new Map(); // channelKey -> bounded role-combat pressure state
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
    this._combatSettingsFlushIntervalMs = 1500;
    this._combatSettingsFallbackFlushTimer = null;

    this.hiddenComments = new Map(); // Track hidden comment elements per channel

    // CHANNEL LOCK SYSTEM: Prevents multiple dungeons in same channel (spam protection)
    this.channelLocks = new Set(); // Locked channels (one dungeon at a time per channel)
    this._lastGlobalSpawnTime = Date.now(); // Initialize to prevent burst spawning on plugin load

    this.deadShadows = new Map(); // Track dead shadows per dungeon

    this._observers = new Set(); // Track all MutationObserver instances
    this._listeners = new Map(); // Track event listeners: {type: Set<handler>}

    // Defeated bosses awaiting shadow extraction (ARISE)
    this.defeatedBosses = new Map(); // { channelKey: { boss, dungeon, timestamp } }
    this._arisedBossIds = new Set(); // Prevent arising the same boss twice

    // ARISE corpse pile is stored on each dungeon object (dungeon.corpsePile = [])
    // so it persists to IDB and survives hot-reloads/restarts.

    this._lastRebalanceAt = new Map(); // channelKey -> timestamp (throttle reinforcement)
    this._rebalanceCooldownMs = 15000; // at most once per 15s per dungeon
    this._deployRebalanceInFlight = new Set(); // channelKeys currently running async post-deploy full split
    this._deployStarterWarmInFlight = null; // Shared promise for starter-pool warmup (prevents duplicate IDB reads)
    this._deployStarterShadowCap = 240; // Fast-start provisional shadow cap before full split completes
    this._pendingDungeonXpPostProcess = new Map(); // taskKey -> metadata

    // Performance optimization: Track current channel for active dungeon detection
    this.currentChannelKey = null; // Current channel user is viewing

    // Performance optimization: Track window visibility for background processing
    this._isWindowVisible = !document.hidden; // Track if Discord window is visible
    this._windowHiddenTime = null; // Timestamp when window became hidden (for simulation)

    // Initialize UnifiedSaveManager for crash-resistant IndexedDB storage
    this.saveManager = null;
    if (UnifiedSaveManager) {
      this.saveManager = new UnifiedSaveManager('Dungeons');
    }

    // Track observer start time to ignore old messages
    this.observerStartTime = Date.now();
    this.processedMessageIds = new Set(); // Track processed message IDs to avoid duplicates

    // CSS Management System - Track injected styles for cleanup
    this._injectedStyles = new Set();

    // Legacy (removed): continuous extraction processors (mobs use MobBossStorageManager + deferred worker)

    // Throttle mob capacity warnings to prevent console spam
    this._mobCapWarningShown = {}; // Track per-dungeon warnings (30s throttle)

    // Event-based extraction verification
    this.extractionEvents = new Map(); // Track extraction attempts by mobId
    // Extraction event handling consolidated into _shadowExtractedListener in loadPluginReferences()

    // Extraction tracking
    this.extractionInProgress = new Set(); // Track channels currently processing extractions
  },

  _initUI() {
    this.dungeonIndicators = new Map();
    this.bossHPBars = new Map();
    this._bossBarLayoutFrame = null;

    // Performance optimization: Throttled DOM updates
    this._hpBarUpdateQueue = new Set(); // Queue of channelKeys needing HP bar updates
    this._hpBarUpdateScheduled = false; // Flag to prevent duplicate scheduling
    this._lastHPBarUpdate = {}; // Track last update time per channelKey (throttle to 1s)
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
    const globalCapRaw = Number(this.settings?.mobMaxActiveCap);
    const globalCap =
      Number.isFinite(globalCapRaw) && globalCapRaw > 0
        ? globalCapRaw
        : this.defaultSettings.mobMaxActiveCap;
    const dungeonCapRaw = Number(dungeonState?.mobs?.mobCapacity);
    const effectiveCap =
      Number.isFinite(dungeonCapRaw) && dungeonCapRaw > 0
        ? Math.min(dungeonCapRaw, globalCap)
        : globalCap;
    const mobCap = this.clampNumber(Math.floor(effectiveCap), 50, 2000);
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
    const ranks = this.settings.dungeonRanks || ['E','D','C','B','A','S','SS','SSS','SSS+','NH','Monarch','Monarch+','Shadow Monarch'];
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

    // Boss HP bonus — piecewise: polynomial early, logarithmic taper late (Step 2c)
    this._bossHPBonusTable = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i <= 7) {
        this._bossHPBonusTable[i] = Math.pow(i + 1, 2.5) * 50;
      } else {
        const sssValue = Math.pow(8, 2.5) * 50; // ~9051
        this._bossHPBonusTable[i] = sssValue + 2000 * Math.log2(i - 6);
      }
    }

    // Spawn phase boundaries (Step 3)
    this._spawnPhases = { rapid: 0.3, moderate: 0.7 };

    // Clear stale rank stats cache
    this._rankStatsCache?.clear?.();
  }
};
