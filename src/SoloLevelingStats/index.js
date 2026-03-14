/**
 * @name SoloLevelingStats
 * @author BlueFlashX1
 * @description Level up, unlock achievements, and complete daily quests based on your Discord activity
 * @version 3.0.5
 * @authorId
 * @authorLink
 * @website
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 *
 * ============================================================================
 * PLUGIN INTEROPERABILITY
 * ============================================================================
 *
 * This plugin integrates with the CriticalHit plugin for enhanced functionality:
 *
 * - Uses CriticalHit's message history to track critical hits for quests
 * - Reads agility bonus data from CriticalHit for stat calculations
 * - Shares perception/luck bonus data with CriticalHit (backward compatibility)
 * - Loads fonts from CriticalHit's font directory if available
 *
 * The integration is optional - SoloLevelingStats will function without CriticalHit,
 * but some features (like critical hit tracking for quests) will be unavailable.
 *
 * Integration Points:
 * - BdApi.Plugins.get('CriticalHit') - Access CriticalHit plugin instance
 * - BdApi.Data.load('CriticalHitAnimation', 'userCombo') - Read combo data
 * - BdApi.Data.save('SoloLevelingStats', ...) - Share stat bonus data
 * - getFontsFolderPath() - Load fonts from CriticalHit's font directory
 *
 * ============================================================================
 * VERSION HISTORY
 * ============================================================================
 *
 * @changelog v3.0.0 (2026-02-17)
 * - Migrated Chat UI panel from innerHTML to React (BdApi.React + createRoot)
 * - Component factory: buildChatUIComponents() with closure access to plugin
 * - useReducer force-update bridge for imperative plugin logic -> React re-renders
 * - Components: StatsPanel, HPManaDisplay, LevelInfo, StatsList, StatButtons,
 *   CollapsibleSection, ActivityGrid, QuestList
 * - Removed ~400 lines of dead innerHTML + DOM patching + event listener code
 * - Zero visual regressions (all existing CSS classes preserved)
 *
 * ============================================================================
 * FILE STRUCTURE & TABLE OF CONTENTS
 * ============================================================================
 *
 * ~11,500 lines organized into 4 major sections.
 * Search for "// SECTION N" or "// §N.N" to jump to any section.
 * Line hints are approximate and may drift; section/subsection tags are authoritative.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ SECTION 1: IMPORTS & DEPENDENCIES                         ~L 150   │
 * │   UnifiedSaveManager loader (IndexedDB crash-resistant storage)    │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ SECTION 2: CONFIGURATION & HELPERS                        ~L 165   │
 * │   §2.1  Constructor & Default Settings .................. ~L 178   │
 * │   §2.2  Performance Optimization (DOM/calc caches) ...... ~L 331   │
 * │   §2.3  Rank Data & Lookup Maps (O(1) lookups) ......... ~L 414   │
 * │   §2.4  Stat Metadata & Quest Definitions .............. ~L 462   │
 * │   §2.5  Debug & Event System State ..................... ~L 498   │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ SECTION 3: MAJOR OPERATIONS                               ~L 523   │
 * │                                                                    │
 * │  ── Helpers ──                                                     │
 * │   §3.1  Performance Helpers (throttle, debounce, cache). ~L 531   │
 * │   §3.2  Lookup Helpers (rank color/XP/stat points) ..... ~L 672   │
 * │   §3.3  Calculation Helpers (quality, time, XP base) ... ~L 692   │
 * │   §3.4  Event System Helpers (on/off/emit) ............. ~L 1333  │
 * │   §3.5  Webpack Module Helpers (Discord internals) ..... ~L 1464  │
 * │   §3.6  Utility Helpers (daily reset, perception) ...... ~L 1819  │
 * │   §3.7  Message Detection (channel, input, observer) ... ~L 2077  │
 * │                                                                    │
 * │  ── Core Systems ──                                                │
 * │   §3.8  XP & Leveling System (8-stage XP pipeline) .... ~L 2883  │
 * │   §3.9  Notification System ............................ ~L 3060  │
 * │   §3.10 Formatting Helpers ............................. ~L 3119  │
 * │   §3.11 Plugin Lifecycle (start/stop) .................. ~L 3130  │
 * │   §3.12 Settings Management (load/save/backup) ......... ~L 3625  │
 * │   §3.13 CSS Styles (settings panel theme) .............. ~L 4325  │
 * │   §3.14 Activity Tracking (shadow power, time) ......... ~L 4888  │
 * │   §3.15 Level-Up & Rank System (check/promote) ......... ~L 5169  │
 * │   §3.16 Level-Up Overlay Animation ..................... ~L 5920  │
 * │   §3.17 Stats System (allocate, natural growth) ........ ~L 6471  │
 * │   §3.18 Quest System (progress, complete, celebrate) ... ~L 7063  │
 * │   §3.19 Achievement System (check, unlock, titles) ..... ~L 7330  │
 * │     └── Achievement Definitions (76 titles, 791 lines) . ~L 7569  │
 * │   §3.20 Shadow Army Integration (buffs, XP share) ...... ~L 8920  │
 * │   §3.21 HP/Mana System (bars, regen, display) .......... ~L 8987  │
 * │   §3.22 Chat UI (render, update, listeners) ............ ~L 9076  │
 * │     └── Chat UI CSS (theme styles, 1200+ lines) ........ ~L 9986  │
 * │   §3.23 Settings Panel (BetterDiscord API) ............. ~L 11243 │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ SECTION 4: DEBUGGING & DEVELOPMENT                        ~L 11415 │
 * │   §4.1  Debug Logging (throttled, conditional) ......... ~L 11419 │
 * │   §4.2  Debug Error Tracking ........................... ~L 11485 │
 * │   §4.3  Debug Console (constructor logging) ............ ~L 11528 │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * ============================================================================
 * VERSION HISTORY
 * ============================================================================
 *
 * @changelog v2.4.0 (2025-12-06) - ADVANCED BETTERDISCORD INTEGRATION
 * ADVANCED FEATURES:
 * - Added Webpack module access (MessageStore, UserStore, ChannelStore, MessageActions)
 * - Implemented function patching for reliable message tracking
 * - Added React injection for UI panel (better Discord integration)
 * - Enhanced React fiber traversal with better error handling
 * - Improved compatibility with multiple React fiber key patterns
 *
 * PERFORMANCE IMPROVEMENTS:
 * - Message tracking: ~30-50% faster via webpack modules vs DOM
 * - User ID detection: More reliable via UserStore vs fiber traversal
 * - UI updates: Better integration with Discord's React tree
 *
 * RELIABILITY:
 * - More reliable message detection (webpack patches vs DOM observation)
 * - Better error handling in React fiber traversal
 * - Graceful fallbacks if webpack/React unavailable
 * - All existing functionality preserved (backward compatible)
 *
 * @changelog v2.3.0 (2025-12-04) - CODE ORGANIZATION & STRUCTURE
 * ORGANIZATION IMPROVEMENTS:
 * - Added clear 4-section structure with navigation markers
 * - Section 1: Imports & Dependencies (reserved)
 * - Section 2: Configuration & Helpers (settings, maps, utilities)
 * - Section 3: Major Operations (lifecycle, tracking, systems, UI)
 * - Section 4: Debugging & Development (off by default)
 * - Added function location index for easy navigation
 * - Improved code discoverability (find any function quickly)
 * - Better maintainability (clear separation of concerns)
 *
 * BENEFITS:
 * - Easy navigation: Jump to section by searching comments
 * - Clear organization: Know where every function lives
 * - Better maintenance: Find and update code quickly
 * - No breaking changes: All optimizations preserved
 * - Same performance: 90% lag reduction maintained
 *
 * @changelog v2.2.0 (2025-12-04) - PERFORMANCE OPTIMIZATION (90% LAG REDUCTION!)
 * CRITICAL OPTIMIZATIONS:
 * - DOM Caching System: Eliminates 84 querySelector calls per update (70% faster!)
 * - Throttling System: Limits updates to 4x per second (96% fewer operations!)
 * - Lookup Maps: O(1) rank/quest lookups instead of O(n) if-else chains
 * - Debouncing: Saves wait 1 second after last change (smoother performance)
 *
 * NEW HELPER FUNCTIONS:
 * - throttle(func, wait): Limits execution frequency
 * - debounce(func, wait): Delays execution until inactivity
 * - initDOMCache(): Caches all DOM references once
 * - getCachedElement(key): Returns cached DOM reference
 * - getRankColor/XPMultiplier/StatPoints(rank): O(1) lookups
 * - getQuestData(questType): O(1) quest data lookup
 *
 * PERFORMANCE IMPACT:
 * - DOM queries: 84 per update → 0 (cached!)
 * - Updates: 100+ per second → 4 per second
 * - Rank lookups: O(n) → O(1)
 * - Total lag reduction: ~90%!
 *
 * @changelog v2.1.1 (2025-12-04) - UI & MEMORY IMPROVEMENTS
 * - Quest completion animation now uses darker purple theme
 * - Changed background gradient to dark purple (matches Solar Eclipse theme)
 * - Changed border to purple accent (cohesive dark theme)
 * - Particle colors changed to darker purple spectrum
 * - Enhanced memory cleanup (quest celebrations cleared on stop)
 *
 * @changelog v2.1.0 (2025-12-04) - REAL-TIME MANA SYNC
 * - Improved mana sync with Dungeons plugin (instant updates)
 * - Real-time mana consumption tracking
 * - Better integration with shadow resurrection system
 * - Mana display updates immediately on consumption
 * - Fixed delayed mana updates during dungeon combat
 *
 * @changelog v2.0.0 (2025-12-03) - SHADOW XP SHARE SYSTEM
 * - Added Shadow XP Share system - ALL shadows gain XP from user activities
 * - Message XP sharing: 5% of user XP to all shadows
 * - Quest XP sharing: 10% of user XP to all shadows
 * - User keeps 100% XP (shadows get bonus XP on top)
 * - Smart summary notifications (no spam)
 * - Asynchronous processing (non-blocking)
 * - Future: Achievement (15%), Dungeon (20%), Milestone (25%) sharing
 */

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };
const _slsStartupWarn = (...args) => {
  try {
    // Opt-in startup diagnostics only; keep normal startup console clean.
    if (typeof window !== 'undefined' && window.__SLS_DEBUG_STARTUP__) {
      console.warn(...args);
    }
  } catch (_) {
    // ignore
  }
};

// Load UnifiedSaveManager for crash-resistant IndexedDB storage
let UnifiedSaveManager;
try {
  if (typeof window !== 'undefined' && typeof window.UnifiedSaveManager === 'function') {
    UnifiedSaveManager = window.UnifiedSaveManager;
  } else {
    UnifiedSaveManager = _bdLoad("UnifiedSaveManager.js") || window.UnifiedSaveManager || null;
    if (UnifiedSaveManager && !window.UnifiedSaveManager) window.UnifiedSaveManager = UnifiedSaveManager;
  }
} catch (error) {
  _slsStartupWarn('[SoloLevelingStats] Failed to load UnifiedSaveManager:', error);
}

// Load SoloLevelingUtils at top level
let _SLUtils;
_SLUtils = _bdLoad("SoloLevelingUtils.js") || window.SoloLevelingUtils || null;

let _PluginUtils;
try { _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }
if (_SLUtils && !window.SoloLevelingUtils) window.SoloLevelingUtils = _SLUtils;

// ============================================================================
// REACT COMPONENT FACTORY (v3.0.0 — replaces innerHTML chat UI rendering)
// ============================================================================

const C = require('./constants');


const SoloLevelingStats = class SoloLevelingStats {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      debugMode: false, // Toggle debug console logs
      // Stat definitions
      stats: {
        strength: 0, // XP efficiency: +2% per point (diminishing returns after 20)
        agility: 0, // Reflexes/Speed: +2% crit chance per point (capped by CriticalHit at 50% effective)
        intelligence: 0, // Mana/Magic: long-message XP tiers (3/7/12), diminishing returns after 15
        vitality: 0, // HP/Stamina: quest reward scaling and max HP
        perception: 0, // Sense precision: controls crit burst chance + burst chain ceiling
      },
      perceptionBuffs: [], // Legacy field (old random PER buffs), retained for backward compatibility
      unallocatedStatPoints: 0,
      // Level system
      level: 1,
      xp: 0,
      totalXP: 0,
      // Rank system (E, D, C, B, A, S, SS, SSS, SSS+, NH, Monarch, Monarch+, Shadow Monarch)
      rank: 'E',
      rankHistory: [],
      ranks: [
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
      // Activity tracking
      activity: {
        messagesSent: 0,
        charactersTyped: 0,
        channelsVisited: [], // Will be converted to Set in loadSettings
        timeActive: 0, // in minutes
        lastActiveTime: null, // Will be set in start()
        sessionStartTime: null, // Will be set in start()
        critsLanded: 0, // Track critical hits for achievements
      },
      // Daily quests
      dailyQuests: {
        lastResetDate: null, // Will be set in start()
        quests: {
          messageMaster: { progress: 0, target: 20, completed: false },
          characterChampion: { progress: 0, target: 1000, completed: false },
          channelExplorer: { progress: 0, target: 5, completed: false },
          activeAdventurer: { progress: 0, target: 30, completed: false }, // minutes
          perfectStreak: { progress: 0, target: 10, completed: false },
        },
      },
      // Achievements
      achievements: {
        unlocked: [],
        titles: [],
        activeTitle: null,
      },
      // Chat UI panel state (closed by default, user opens manually)
      chatUIPanelExpanded: false,
      // HP/Mana (calculated from stats)
      userHP: null,
      userMaxHP: null,
      userMana: null,
      userMaxMana: null,
    };
  
    // Deep copy to prevent defaultSettings from being modified
    // Shallow copy (this.settings = this.defaultSettings) causes save corruption!
    this.settings = structuredClone(this.defaultSettings);
    this.debugConsole('[CONSTRUCTOR]', 'Settings initialized with deep copy', {
      level: this.settings.level,
      xp: this.settings.xp,
      rank: this.settings.rank,
      settingsAreDefault: this.settings === this.defaultSettings,
      isDeepCopy: JSON.stringify(this.settings) === JSON.stringify(this.defaultSettings),
    });
  
    // Initialize UnifiedSaveManager for crash-resistant IndexedDB storage
    this.saveManager = null;
    if (UnifiedSaveManager) {
      this.saveManager = new UnifiedSaveManager('SoloLevelingStats');
    }
    this._UnifiedSaveManager = UnifiedSaveManager || null;
    this._PluginUtils = _PluginUtils || null;
    this._constants = C;
    // File-based backup path — stored OUTSIDE BetterDiscord folder so it survives BD reinstall/repair
    // Location: /Library/Application Support/discord/SoloLevelingBackups/SoloLevelingStats.json
    try {
      const pathModule = require('path');
      const fs = require('fs');
      const appSupport = pathModule.resolve(BdApi.Plugins.folder, '..', '..'); // Application Support
      const backupDir = pathModule.join(appSupport, 'discord', 'SoloLevelingBackups');
      fs.mkdirSync(backupDir, { recursive: true });
      this.fileBackupPath = pathModule.join(backupDir, 'SoloLevelingStats.json');
    } catch (_) {
      this.fileBackupPath = null;
    }
    this.messageObserver = null;
    this.activityTracker = null;
    this.messageInputHandler = null;
    this._pendingSendFallback = null;
    this.processedMessageIds = new Set();
    // Track recently processed messages to prevent duplicates
    // Must be a Map (hashKey -> timestamp). Some older versions used Set; guard in processMessageSent.
    this.recentMessages = new Map();
    // Anti-abuse tracking for XP scoring (repeat text + ultra-fast send decay)
    this._messageAntiAbuse = {
      lastMessageTime: 0,
      fingerprints: new Map(), // Map<fingerprint, { count, lastSeen }>
    };
    this.lastSaveTime = Date.now();
    this.saveInterval = 30000; // Save every 30 seconds (backup save)
    this.importantSaveInterval = 5000; // Save important changes every 5 seconds
    // Startup persistence guards
    // _startupLoadComplete: blocks any save before loadSettings() resolves
    // _hasRealProgress: tracks whether current in-memory state is meaningful progress
    // _startupProgressProbeComplete: one-time persisted progress scan before first save
    this._startupLoadComplete = false;
    this._hasRealProgress = false;
    this._startupProgressProbeComplete = false;
    this._sessionToken = 0; // guards against orphaned async start() continuations
    // Level up debouncing to prevent spam
    this.pendingLevelUp = null;
    this.levelUpDebounceTimeout = null;
    this.levelUpDebounceDelay = 500; // 500ms debounce for level up notifications
    // Level-up animation (overlay) queueing + cleanup
    this._levelUpAnimationQueue = [];
    this._levelUpAnimationInFlight = false;
    this._levelUpAnimationTimeouts = new Set();
    this.lastMessageId = null; // Track last message ID for crit detection
    this.lastMessageElement = null; // Track last message element for crit detection
  
    // Event emitter system for real-time progress bar updates
    this.eventListeners = {
      xpChanged: [],
      levelChanged: [],
      rankChanged: [],
      statsChanged: [],
      shadowPowerChanged: [],
    };
    this.shadowPowerObserver = null;
    this.shadowPowerInterval = null;
  
    // HP/Mana bars
    this.userHPBar = null;
    this.userHPBarPositionUpdater = null;
    this.panelWatcher = null;
    this.shadowPowerUpdateTimeout = null;
  
    // Activity tracking handlers (for cleanup)
    this._activityTrackingHandlers = null;
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
    this._settingsPreviewRoot = null;
  
    // Stat allocation aggregation (prevents spammy notifications)
    this._statAllocationQueue = [];
    this._statAllocationTimeout = null;
    this._statAllocationDebounceDelay = 1000; // Aggregate allocations within 1 second
  
    // Webpack modules (for advanced Discord integration)
    this.webpackModules = {
      MessageStore: null,
      UserStore: null,
      ChannelStore: null,
      MessageActions: null,
    };
    this.webpackModuleAccess = false; // Track if webpack modules are available
    this.messageStorePatch = null; // Track message store patch for cleanup
    this.reactInjectionActive = false; // Track if React injection is active
  
    // ── §2.2 PERFORMANCE OPTIMIZATION SYSTEM ────────────────────────────────
    // DOM Cache (eliminates 84 querySelector calls per update)
    // Performance Caches (tiered TTL for expensive calculations)
  
    // DOM Cache (eliminates 84 querySelector calls per update!)
    this.domCache = {
      // HP/Mana bars
      hpBar: null,
      hpBarFill: null,
      hpText: null,
      manaBar: null,
      manaBarFill: null,
      manaText: null,
  
      // Stats display
      levelDisplay: null,
      xpDisplay: null,
      rankDisplay: null,
  
      // Shadow power
      shadowPowerDisplay: null,
  
      // Quest UI
      questPanel: null,
      questItems: {},
  
      // Panels
      statsPanel: null,
      achievementsPanel: null,
  
      // Cache validity
      valid: false,
      lastUpdate: 0,
    };
  
    // Throttled function cache
    this.throttled = {};
    this.debounced = {};
  
    // Performance caches for expensive calculations
    this._cache = {
      currentLevel: null,
      currentLevelTime: 0,
      currentLevelTTL: 100, // 100ms - level changes frequently
      totalPerceptionBuff: null,
      totalPerceptionBuffTime: 0,
      totalPerceptionBuffTTL: 500, // 500ms - perception buffs don't change often
      perceptionBuffsByStat: null,
      perceptionBuffsByStatTime: 0,
      perceptionBuffsByStatTTL: 500, // 500ms
      timeBonus: null,
      timeBonusTime: 0,
      timeBonusTTL: 60000, // 1 minute - time changes every minute
      activityStreakBonus: null,
      activityStreakBonusTime: 0,
      activityStreakBonusKey: null,
      activityStreakBonusTTL: 3600000, // 1 hour - streak changes daily
      milestoneMultiplier: null,
      milestoneMultiplierLevel: null,
      milestoneMultiplierTTL: 100, // 100ms - level changes frequently
      skillTreeBonuses: null,
      skillTreeBonusesTime: 0,
      skillTreeBonusesTTL: 2000, // 2s - skill tree changes rarely
      hiddenBlessingBonuses: null,
      hiddenBlessingBonusesTime: 0,
      hiddenBlessingBonusesTTL: 2000, // 2s - hidden blessings track rank and update infrequently
      activeSkillBuffs: null,
      activeSkillBuffsTime: 0,
      activeSkillBuffsTTL: 1000, // 1s - active skills can expire/activate frequently
      activeTitleBonus: null,
      activeTitleBonusTime: 0,
      activeTitleBonusKey: null,
      activeTitleBonusTTL: 1000, // 1s - title changes rarely
      shadowArmyBuffs: null,
      shadowArmyBuffsTime: 0,
      shadowArmyBuffsTTL: 2000, // 2s - shadow buffs update asynchronously
      totalEffectiveStats: null,
      totalEffectiveStatsTime: 0,
      totalEffectiveStatsKey: null,
      totalEffectiveStatsTTL: 500, // 500ms - stats change occasionally
      xpRequiredForLevel: new Map(), // Cache individual level XP requirements
      achievementDefinitions: null, // Static definitions - cache permanently
      hpCache: new Map(), // Cache HP calculations: key = `${vitality}_${rank}`
      manaCache: new Map(), // Cache Mana calculations: key = intelligence
      criticalHitComboData: null, // Cache CriticalHitAnimation combo info (short TTL)
      criticalHitComboDataTime: 0,
      criticalHitComboDataTTL: 500, // 500ms - reduces repeated reads during message bursts
      lastAppliedCritBurst: null, // Last validated PER burst used for XP bonus calculation
    };
  
    // Rank lookup maps (replaces if-else chains)
    this.rankData = {
      colors: {
        E: '#808080',
        D: '#8B4513',
        C: '#4169E1',
        B: '#9370DB',
        A: '#FFD700',
        S: '#FF4500',
        SS: '#FF1493',
        SSS: '#8B00FF',
        'SSS+': '#FF00FF',
        NH: '#00FFFF',
        Monarch: '#FF0000',
        'Monarch+': '#FF69B4',
        'Shadow Monarch': '#000000',
      },
      xpMultipliers: {
        E: 1.0,
        D: 1.12,
        C: 1.28,
        B: 1.48,
        A: 1.72,
        S: 2.02,
        SS: 2.4,
        SSS: 2.88,
        'SSS+': 3.46,
        NH: 4.18,
        Monarch: 5.1,
        'Monarch+': 6.3,
        'Shadow Monarch': 9.0,
      },
      statPoints: {
        E: 2,
        D: 3,
        C: 4,
        B: 5,
        A: 6,
        S: 8,
        SS: 10,
        SSS: 12,
        'SSS+': 15,
        NH: 20,
        Monarch: 25,
        'Monarch+': 30,
        'Shadow Monarch': 50,
      },
    };
  
    // Shared constants
    this.STAT_KEYS = [...C.STAT_KEYS];
    this.UNWANTED_TITLES = [
      'Scribe',
      'Wordsmith',
      'Author',
      'Explorer',
      'Wanderer',
      'Apprentice',
      'Message Warrior',
      'Monarch of Beast',
      'Monarch of Beasts',
    ];
  
    // Pre-compiled regex patterns (avoids allocation per message in hot path)
    this.RE_LINKS = /https?:\/\//;
    this.RE_CODE = /```|`/;
    this.RE_EMOJIS = /[\u{1F300}-\u{1F9FF}]/u;
    this.RE_MENTIONS = /<@|@everyone|@here/;
    this.RE_WORDS = /\b\w+\b/g;
    this.RE_PROPER_SENTENCE = /^[A-Z].*[.!?]$/;
    this.RE_NUMBERED_LIST = /^\d+[.)]\s/;
    this.RE_BULLET_LIST = /^[-*]\s/m;
  
    // Single source of truth for stat metadata — replaces 3 inline statDefs
    this.STAT_METADATA = {
      strength:     { name: 'STR', fullName: 'Strength',     desc: '+2% XP (DR)',                                longDesc: '+2% XP per point, diminishing after 20',                gain: 'Send messages' },
      agility:      { name: 'AGI', fullName: 'Agility',      desc: '+2% Crit Chance',                             longDesc: '+2% critical hit chance per point (effective cap handled by CriticalHit)', gain: 'Send messages' },
      intelligence: { name: 'INT', fullName: 'Intelligence',  desc: 'Tiered Long Msg XP',                         longDesc: '3/7/12% long-msg XP tiers with diminishing after 15',   gain: 'Long messages' },
      vitality:     { name: 'VIT', fullName: 'Vitality',      desc: 'Quest + HP Scaling',                          longDesc: 'Improves quest rewards and max HP',                     gain: 'Complete quests' },
      perception:   { name: 'PER', fullName: 'Perception',    desc: 'Crit Burst Control',                          longDesc: 'Increases chance and ceiling for multi-hit crit bursts', gain: 'Allocate stat points' },
    };
  
    // Default empty shadow buffs — used by getShadowArmyBuffs fallback paths
    this.DEFAULT_SHADOW_BUFFS = { ...C.EMPTY_STAT_BLOCK };
  
    // Dirty flag for throttled UI updates (used by 2s chatUIUpdateInterval)
    this._chatUIDirty = false;
    this._chatUIForceUpdate = null; // React forceUpdate bridge (set by StatsPanel useEffect)
    this._chatUIForceUpdates = new Set(); // Multi-surface forceUpdate bridge (strip + popup)
    this._chatUIUpdateThrottleTimer = null;
    this._shadowBuffsRefreshPromise = null; // Dedupes async ShadowArmy buff refreshes
    this._shadowBuffsRefreshAt = 0;
    this._headerStatsButton = null;
    this._headerStatsPopup = null;
    this._headerStatsPopupRoot = null;
    this._headerStatsPopupDocClickHandler = null;
    this._headerStatsPopupResizeHandler = null;
    this._headerStatsPopupScrollHandler = null;
    this._headerStatsPopupPositionRaf = null;
    this._headerStatsPopupScrollListenerOptions = { capture: true, passive: true };
    this._channelInfoCacheUrl = null;
    this._channelInfoCache = null;
    this._channelTrackingHooks = null;
    this._xpChangedUnsub = null;
  
    // Quest definitions — single source of truth for names, descriptions, and rewards
    this.questData = {
      messageMaster: { name: 'Message Master', desc: 'Send 20 messages', xp: 50, statPoints: 1 },
      characterChampion: { name: 'Character Champion', desc: 'Type 1,000 characters', xp: 75, statPoints: 0 },
      channelExplorer: { name: 'Channel Explorer', desc: 'Visit 5 unique channels', xp: 50, statPoints: 1 },
      activeAdventurer: { name: 'Active Adventurer', desc: 'Be active for 30 minutes', xp: 100, statPoints: 0 },
      perfectStreak: { name: 'Perfect Streak', desc: 'Send 10 messages', xp: 150, statPoints: 1 },
    };
  
    // ── §2.5 DEBUG & EVENT SYSTEM STATE ──────────────────────────────────────
    // Debug system uses settings.debugMode (unified toggle)
    // Event system provides xpChanged/levelChanged/rankChanged/statsChanged hooks
    this.debug = {
      verbose: false, // Set to true for verbose logging (includes frequent operations)
      errorCount: 0,
      lastError: null,
      operationCounts: {},
      // Operations that happen frequently - only log if verbose=true
      frequentOperations: new Set([
        'GET_CHANNEL_INFO',
        'TRACK_CHANNEL_VISIT',
        'START_CHANNEL_TRACKING',
        'HANDLE_CHANNEL_CHANGE',
        'MUTATION_OBSERVER',
        'INPUT_DETECTION',
        'PERIODIC_BACKUP',
        'SAVE_DATA',
      ]),
      // Throttle frequent operations (log max once per X ms)
      lastLogTimes: {},
      throttleInterval: 10000, // OPTIMIZED: Increased to 10 seconds (was 5) to reduce spam
    };
  }

};

Object.assign(
  SoloLevelingStats.prototype,
  require('./performance-cache'),
  require('./stat-helpers'),
  require('./calculation-bonuses'),
  require('./channel-context'),
  require('./progression-read-model'),
  require('./hp-mana'),
  require('./events'),
  require('./lifecycle'),
  require('./webpack-integration'),
  require('./criticalhit-integration'),
  require('./migration-compat'),
  require('./message-observers'),
  require('./xp-processing'),
  require('./notifications'),
  require('./persistence-backups'),
  require('./settings-store'),
  require('./activity-tracking'),
  require('./rank-progression'),
  require('./levelup-overlay'),
  require('./stat-allocation'),
  require('./quests'),
  require('./achievements'),
  require('./achievement-definitions'),
  require('./shadowarmy-integration'),
  require('./chat-ui-core'),
  require('./chat-ui-css'),
  require('./settings-panel'),
  require('./diagnostics')
);

module.exports = SoloLevelingStats;
