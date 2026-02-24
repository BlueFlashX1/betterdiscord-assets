/**
 * @name SoloLevelingStats
 * @author BlueFlashX1
 * @description Level up, unlock achievements, and complete daily quests based on your Discord activity
 * @version 3.0.1
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

// Load UnifiedSaveManager for crash-resistant IndexedDB storage
let UnifiedSaveManager;
try {
  if (typeof window !== 'undefined' && typeof window.UnifiedSaveManager === 'function') {
    UnifiedSaveManager = window.UnifiedSaveManager;
  } else {
    const fs = require('fs');
    const path = require('path');
    const pluginFolder =
      (BdApi?.Plugins?.folder && typeof BdApi.Plugins.folder === 'string'
        ? BdApi.Plugins.folder
        : null) ||
      (typeof __dirname === 'string' ? __dirname : null);
    if (pluginFolder) {
      const saveManagerPath = path.join(pluginFolder, 'UnifiedSaveManager.js');
      if (fs.existsSync(saveManagerPath)) {
        const saveManagerCode = fs.readFileSync(saveManagerPath, 'utf8');
        const moduleSandbox = { exports: {} };
        const exportsSandbox = moduleSandbox.exports;
        const loader = new Function(
          'window',
          'module',
          'exports',
          `${saveManagerCode}\nreturn module.exports || (typeof UnifiedSaveManager !== 'undefined' ? UnifiedSaveManager : null) || window?.UnifiedSaveManager || null;`
        );
        UnifiedSaveManager = loader(
          typeof window !== 'undefined' ? window : undefined,
          moduleSandbox,
          exportsSandbox
        );
        if (UnifiedSaveManager && typeof window !== 'undefined') {
          window.UnifiedSaveManager = UnifiedSaveManager;
        }
      }
    }
  }
} catch (error) {
  console.warn('[SoloLevelingStats] Failed to load UnifiedSaveManager:', error);
}

// ============================================================================
// REACT COMPONENT FACTORY (v3.0.0 — replaces innerHTML chat UI rendering)
// ============================================================================
function buildChatUIComponents(pluginInstance) {
  const React = BdApi.React;
  const ce = React.createElement;

  // ── HPManaDisplay: Fixed top bar with HP/MP progress bars ──
  function HPManaDisplay({ expanded }) {
    const s = pluginInstance.settings;
    const totalStats = pluginInstance.getTotalEffectiveStats();
    pluginInstance.recomputeHPManaFromStats(totalStats);

    const hpPercent = (s.userHP / s.userMaxHP) * 100;
    const manaPercent = (s.userMana / s.userMaxMana) * 100;

    const barHeight = expanded ? '12px' : '16px';
    const containerMinWidth = expanded ? '0' : '133px';
    const containerFlex = expanded ? '1' : '1.3';
    const textDisplay = expanded ? 'flex' : 'none';
    const barMinWidth = expanded ? '0' : '100px';

    return ce('div', {
      className: `sls-chat-hp-mana-display${expanded ? '' : ' sls-hp-mana-collapsed'}`,
      id: 'sls-chat-hp-mana-display',
      style: { display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: '0' }
    },
      // HP bar
      ce('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flex: containerFlex, minWidth: containerMinWidth } },
        ce('div', { style: { color: '#ec4899', fontSize: '11px', fontWeight: '600', minWidth: '30px', flexShrink: '0' } }, 'HP'),
        ce('div', { style: { flex: '1', height: barHeight, minHeight: barHeight, background: 'rgba(20, 20, 30, 0.8)', borderRadius: '6px', overflow: 'hidden', position: 'relative', minWidth: barMinWidth } },
          ce('div', { id: 'sls-hp-bar-fill', style: { height: '100%', width: `${hpPercent}%`, background: 'linear-gradient(90deg, #8a2be2 0%, #7b27cc 50%, #6c22b6 100%)', borderRadius: '6px', transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 0 8px rgba(138, 43, 226, 0.5)' } })
        ),
        ce('div', { id: 'sls-hp-text', style: { color: 'rgba(255, 255, 255, 0.7)', fontSize: '10px', minWidth: '50px', textAlign: 'right', flexShrink: '0', display: textDisplay } },
          `${Math.floor(s.userHP)}/${s.userMaxHP}`)
      ),
      // MP bar
      ce('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flex: containerFlex, minWidth: containerMinWidth } },
        ce('div', { style: { color: '#3b82f6', fontSize: '11px', fontWeight: '600', minWidth: '30px', flexShrink: '0' } }, 'MP'),
        ce('div', { id: 'sls-mp-bar-container', style: { flex: '1', height: barHeight, minHeight: barHeight, background: 'rgba(20, 20, 30, 0.8)', borderRadius: '6px', overflow: 'hidden', position: 'relative', minWidth: barMinWidth } },
          ce('div', { id: 'sls-mp-bar-fill', style: { height: '100%', width: `${manaPercent}%`, background: 'linear-gradient(90deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%)', borderRadius: '6px', transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 0 8px rgba(96, 165, 250, 0.5)' } })
        ),
        ce('div', { id: 'sls-mp-text', style: { color: 'rgba(255, 255, 255, 0.7)', fontSize: '10px', minWidth: '50px', textAlign: 'right', flexShrink: '0', display: textDisplay } },
          `${Math.floor(s.userMana)}/${s.userMaxMana}`)
      )
    );
  }

  // ── LevelInfo: Rank, Level, XP progress bar, Shadow Power ──
  function LevelInfo() {
    const s = pluginInstance.settings;
    const progressSnapshot = pluginInstance.getLevelProgressSnapshot({ allowFallback: true, logContext: 'REACT_CHAT_UI' });
    const xpPercent = progressSnapshot.xpPercent;

    return ce('div', { className: 'sls-chat-level' },
      ce('div', { className: 'sls-chat-level-row' },
        ce('div', { className: 'sls-chat-rank' }, `Rank: ${s.rank}`),
        ce('div', { className: 'sls-chat-level-number' }, `Lv.${s.level}`),
        ce('div', { className: 'sls-chat-progress-bar' },
          ce('div', { className: 'sls-chat-progress-fill', id: 'sls-xp-progress-fill', style: { width: pluginInstance.formatPercentWidth(xpPercent) } })
        ),
        ce('div', { className: 'sls-chat-shadow-power' }, `Shadow Power: ${pluginInstance.getTotalShadowPower()}`)
      )
    );
  }

  // ── ActiveTitle: Conditional title display with buff badges ──
  function ActiveTitle() {
    const s = pluginInstance.settings;
    if (!s.achievements.activeTitle) return null;

    const titleBonus = pluginInstance.getActiveTitleBonus();
    const buffs = [];

    const percentRules = [['xp', 'XP'], ['critChance', 'Crit'], ['strengthPercent', 'STR'], ['agilityPercent', 'AGI'],
      ['intelligencePercent', 'INT'], ['vitalityPercent', 'VIT'], ['perceptionPercent', 'PER']];
    percentRules.forEach(([key, label]) => {
      const value = titleBonus[key] || 0;
      if (value > 0) buffs.push(`+${(value * 100).toFixed(0)}% ${label}`);
    });

    const rawRules = [['strength', 'strengthPercent', 'STR'], ['agility', 'agilityPercent', 'AGI'],
      ['intelligence', 'intelligencePercent', 'INT'], ['vitality', 'vitalityPercent', 'VIT'],
      ['perception', 'perceptionPercent', 'PER']];
    rawRules.forEach(([rawKey, percentKey, label]) => {
      const rawValue = titleBonus[rawKey] || 0;
      if (rawValue > 0 && !titleBonus[percentKey]) buffs.push(`+${rawValue} ${label}`);
    });

    return ce('div', { className: 'sls-chat-title-display' },
      ce('span', { className: 'sls-chat-title-label' }, 'Title:'),
      ce('span', { className: 'sls-chat-title-name' }, s.achievements.activeTitle),
      buffs.length > 0 ? ce('span', { className: 'sls-chat-title-bonus' }, buffs.join(', ')) : null
    );
  }

  // ── StatsList: 5-stat grid (read-only display) ──
  function StatsList() {
    const totalStats = pluginInstance.getTotalEffectiveStats();

    return ce('div', { className: 'sls-chat-stats' },
      pluginInstance.STAT_KEYS.map((key) => {
        const def = pluginInstance.STAT_METADATA[key];
        if (!def) return null;
        return ce('div', { key, className: 'sls-chat-stat-item', 'data-stat': key },
          ce('span', { className: 'sls-chat-stat-name' }, def.name),
          ce('span', { className: 'sls-chat-stat-value' }, String(totalStats[key]))
        );
      })
    );
  }

  // ── StatButton: Single allocation button ──
  function StatButton({ statKey, onAllocate }) {
    const s = pluginInstance.settings;
    const totalStats = pluginInstance.getTotalEffectiveStats();
    const titleBonus = pluginInstance.getActiveTitleBonus();
    const shadowBuffs = pluginInstance.getEffectiveShadowArmyBuffs();

    const stat = pluginInstance.STAT_METADATA[statKey];
    const baseValue = s.stats[statKey];
    const totalValue = totalStats[statKey];
    const canAllocate = s.unallocatedStatPoints > 0;
    const tooltip = pluginInstance.buildStatTooltip(statKey, baseValue, totalValue, titleBonus, shadowBuffs);
    const valueText = pluginInstance.getStatValueWithBuffsHTML(totalValue, statKey, titleBonus, shadowBuffs);

    return ce('button', {
      className: `sls-chat-stat-btn${canAllocate ? ' sls-chat-stat-btn-available' : ''}`,
      'data-stat': statKey,
      disabled: !canAllocate,
      title: tooltip,
      onClick: (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (canAllocate) onAllocate(statKey);
      }
    },
      ce('div', { className: 'sls-chat-stat-btn-name' }, stat.name),
      ce('div', { className: 'sls-chat-stat-btn-value' }, valueText),
      canAllocate ? ce('div', { className: 'sls-chat-stat-btn-plus' }, '+') : null
    );
  }

  // ── StatAllocation: Points display + 5 allocation buttons ──
  function StatAllocation({ onAllocate }) {
    const s = pluginInstance.settings;
    if (s.unallocatedStatPoints <= 0) return null;

    return ce('div', { className: 'sls-chat-stat-allocation' },
      ce('div', { className: 'sls-chat-stat-points' }, pluginInstance.formatUnallocatedStatPointsText()),
      ce('div', { className: 'sls-chat-stat-buttons' },
        pluginInstance.STAT_KEYS.map((key) =>
          ce(StatButton, { key, statKey: key, onAllocate })
        )
      )
    );
  }

  // ── CollapsibleSection: Reusable toggle for Activity/Quests ──
  function CollapsibleSection({ sectionId, title, children }) {
    const [isOpen, setIsOpen] = React.useState(false);

    return ce(React.Fragment, null,
      ce('div', {
        className: 'sls-chat-section-toggle',
        'data-section': sectionId,
        onClick: () => setIsOpen(!isOpen)
      },
        ce('span', { className: 'sls-chat-section-title' }, title),
        ce('span', { className: 'sls-chat-section-arrow' }, isOpen ? '' : '')
      ),
      ce('div', {
        className: 'sls-chat-section',
        id: `sls-chat-${sectionId}`,
        style: { display: isOpen ? 'block' : 'none' }
      }, children)
    );
  }

  // ── ActivityGrid: 4-item activity summary ──
  function ActivityGrid() {
    const a = pluginInstance.settings?.activity || {};
    const messagesSent = a.messagesSent ?? 0;
    const charactersTyped = a.charactersTyped ?? 0;
    const channelsVisited = a.channelsVisited;
    const channelsCount = channelsVisited instanceof Set ? channelsVisited.size
      : Array.isArray(channelsVisited) ? channelsVisited.length : 0;
    const timeActive = a.timeActive ?? 0;

    const items = [
      { label: 'Messages', value: messagesSent.toLocaleString() },
      { label: 'Characters', value: charactersTyped.toLocaleString() },
      { label: 'Channels', value: String(channelsCount) },
      { label: 'Time Active', value: `${Math.round(timeActive / 60)}h ${Math.round(timeActive % 60)}m` },
    ];

    return ce('div', { className: 'sls-chat-activity-grid' },
      items.map((item) =>
        ce('div', { key: item.label, className: 'sls-chat-activity-item' },
          ce('div', { className: 'sls-chat-activity-label' }, item.label),
          ce('div', { className: 'sls-chat-activity-value' }, item.value)
        )
      )
    );
  }

  // ── QuestList: Daily quest progress items ──
  function QuestList() {
    const quests = pluginInstance.settings.dailyQuests.quests;

    return ce(React.Fragment, null,
      Object.entries(quests).map(([questId, quest]) => {
        const def = pluginInstance.questData[questId] || { name: questId, desc: '' };
        const cappedProgress = Math.min(quest.progress, quest.target);
        const percentage = Math.min((cappedProgress / quest.target) * 100, 100);
        const progressText = quest.completed ? 'Completed' : `${Math.floor(cappedProgress)}/${quest.target}`;

        return ce('div', { key: questId, className: `sls-chat-quest-item${quest.completed ? ' sls-chat-quest-complete' : ''}` },
          ce('div', { className: 'sls-chat-quest-header' },
            ce('span', { className: 'sls-chat-quest-name' }, def.name),
            ce('span', { className: 'sls-chat-quest-progress' }, progressText)
          ),
          ce('div', { className: 'sls-chat-quest-desc' }, def.desc),
          ce('div', { className: 'sls-chat-progress-bar' },
            ce('div', { className: 'sls-chat-progress-fill', style: { width: `${percentage.toFixed(1)}%` } })
          )
        );
      })
    );
  }

  // ── StatsPanel: Top-level container with forceUpdate bridge ──
  function StatsPanel() {
    const [expanded, setExpanded] = React.useState(pluginInstance.settings.chatUIPanelExpanded !== false);
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

    // Expose forceUpdate to plugin instance for imperative updates
    React.useEffect(() => {
      pluginInstance._chatUIForceUpdate = forceUpdate;
      return () => { pluginInstance._chatUIForceUpdate = null; };
    }, [forceUpdate]);

    const handleToggle = React.useCallback((e) => {
      e.stopPropagation();
      e.preventDefault();
      setExpanded((prev) => {
        const next = !prev;
        pluginInstance.settings.chatUIPanelExpanded = next;
        return next;
      });
    }, []);

    const handleAllocate = React.useCallback((statKey) => {
      if (pluginInstance.allocateStatPoint(statKey)) forceUpdate();
    }, []);

    return ce(React.Fragment, null,
      ce('div', { className: 'sls-chat-header' },
        ce(HPManaDisplay, { expanded }),
        ce('button', { className: 'sls-chat-toggle', id: 'sls-chat-toggle', onClick: handleToggle },
          expanded ? '' : '')
      ),
      ce('div', {
        className: 'sls-chat-content',
        id: 'sls-chat-content',
        style: { display: expanded ? 'block' : 'none' }
      },
        ce(LevelInfo),
        ce(ActiveTitle),
        ce(StatsList),
        ce(StatAllocation, { onAllocate: handleAllocate }),
        ce(CollapsibleSection, { sectionId: 'activity', title: 'Activity Summary' },
          ce(ActivityGrid)
        ),
        ce(CollapsibleSection, { sectionId: 'quests', title: 'Daily Quests' },
          ce(QuestList)
        )
      )
    );
  }

  return { StatsPanel, HPManaDisplay, LevelInfo, ActiveTitle, StatsList, StatAllocation, ActivityGrid, QuestList };
}

module.exports = class SoloLevelingStats {
  // ============================================================================
  // SECTION 1: IMPORTS & DEPENDENCIES
  // ============================================================================
  // UnifiedSaveManager loaded above for IndexedDB storage

  // ============================================================================
  // SECTION 2: CONFIGURATION & HELPERS
  // ============================================================================

  // ── §2.1 CONSTRUCTOR & DEFAULT SETTINGS ──────────────────────────────────
  // Initializes all default state: stats, XP, rank, quests, achievements,
  // HP/Mana, activity tracking, caches, and event system.
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
    this.STAT_KEYS = ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
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
    this.DEFAULT_SHADOW_BUFFS = { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 };

    // Dirty flag for throttled UI updates (used by 2s chatUIUpdateInterval)
    this._chatUIDirty = false;
    this._chatUIForceUpdate = null; // React forceUpdate bridge (set by StatsPanel useEffect)

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

  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================
  // All methods live here — helpers first, then core systems, then UI.
  // Search for §3.N to jump to a specific subsection.

  // ── §3.1 PERFORMANCE HELPERS ────────────────────────────────────────────
  // throttle(), debounce(), DOM cache management, perf cache invalidation

  throttle(func, wait) {
    let timeout = null;
    let lastRun = 0;

    return (...args) => {
      const now = Date.now();
      const remaining = wait - (now - lastRun);

      if (remaining <= 0) {
        lastRun = now;
        return func.apply(this, args);
      } else if (!timeout) {
        timeout = setTimeout(() => {
          lastRun = Date.now();
          timeout = null;
          func.apply(this, args);
        }, remaining);
      }
    };
  }

  debounce(func, wait) {
    let timeout = null;

    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  initDOMCache() {
    try {
      // HP/Mana bars
      this.domCache.hpBar = document.querySelector('.sls-hp-bar');
      this.domCache.hpBarFill = document.querySelector('.sls-hp-bar-fill');
      this.domCache.hpText = document.querySelector('.sls-hp-text');
      this.domCache.manaBar = document.querySelector('.sls-mana-bar');
      this.domCache.manaBarFill = document.querySelector('.sls-mana-bar-fill');
      this.domCache.manaText = document.querySelector('.sls-mana-text');

      // Stats display
      this.domCache.levelDisplay = document.querySelector('.sls-level-display');
      this.domCache.xpDisplay = document.querySelector('.sls-xp-display');
      this.domCache.rankDisplay = document.querySelector('.sls-rank-display');

      // Shadow power
      this.domCache.shadowPowerDisplay = document.querySelector('.sls-shadow-power');

      // Quest panel
      this.domCache.questPanel = document.querySelector('.sls-quest-panel');

      // Mark cache as valid
      this.domCache.valid = true;
      this.domCache.lastUpdate = Date.now();
    } catch (error) {
      this.errorLog('DOM_CACHE', 'DOM cache initialization failed:', error);
      this.domCache.valid = false;
    }
  }

  _clearCurrentLevelCache() {
    this._cache.currentLevel = null;
    this._cache.currentLevelTime = 0;
    this._cache.milestoneMultiplier = null;
    this._cache.milestoneMultiplierLevel = null;
  }

  _clearPerceptionCaches() {
    this._cache.totalPerceptionBuff = null;
    this._cache.totalPerceptionBuffTime = 0;
    this._cache.perceptionBuffsByStat = null;
    this._cache.perceptionBuffsByStatTime = 0;
  }

  _clearTitleCaches() {
    this._cache.activeTitleBonus = null;
    this._cache.activeTitleBonusTime = 0;
    this._cache.activeTitleBonusKey = null;
  }

  _clearShadowCaches() {
    this._cache.shadowArmyBuffs = null;
    this._cache.shadowArmyBuffsTime = 0;
  }

  _clearTotalEffectiveStatsCache() {
    this._cache.totalEffectiveStats = null;
    this._cache.totalEffectiveStatsTime = 0;
    this._cache.totalEffectiveStatsKey = null;
  }

  /**
   * Invalidate performance caches when data changes
   * Call this when XP, level, stats, or settings change
   */
  invalidatePerformanceCache(cacheKeys = null) {
    if (!cacheKeys) {
      this._clearCurrentLevelCache();
      this._clearPerceptionCaches();
      this._clearTitleCaches();
      this._clearShadowCaches();
      this._clearTotalEffectiveStatsCache();
      this._cache.hpCache.clear();
      this._cache.manaCache.clear();
      return;
    }

    const keySet = new Set(cacheKeys);
    keySet.has('currentLevel') && this._clearCurrentLevelCache();
    keySet.has('perception') && this._clearPerceptionCaches();
    keySet.has('title') && this._clearTitleCaches();
    keySet.has('shadow') && this._clearShadowCaches();
    if (keySet.has('title') || keySet.has('stats') || keySet.has('shadow')) {
      this._clearTotalEffectiveStatsCache();
    }
    if (keySet.has('stats')) {
      this._cache.hpCache.clear();
      this._cache.manaCache.clear();
    }
  }

  // ── §3.2 LOOKUP MAP HELPERS ──────────────────────────────────────────────
  // O(1) rank color, XP multiplier, stat points, quest data lookups

  // ── §3.3 CALCULATION HELPERS ─────────────────────────────────────────────
  // Quality bonus, message type bonus, time bonus, channel activity,
  // streak bonus, XP requirements, HP/Mana formulas, skill tree integration

  calculateQualityBonus(messageText, messageLength) {
    let bonus = 0;

    // Long message bonus (scales with length)
    if (messageLength > 200) {
      bonus += 20; // Base bonus for long messages
      if (messageLength > 500) bonus += 15; // Extra for very long
      if (messageLength > 1000) bonus += 25; // Extra for extremely long
    }

    // Rich content bonus (uses pre-compiled regex from constructor)
    const hasLinks = this.RE_LINKS.test(messageText);
    const hasCode = this.RE_CODE.test(messageText);
    const hasEmojis = this.RE_EMOJIS.test(messageText);
    const hasMentions = this.RE_MENTIONS.test(messageText);

    if (hasLinks) bonus += 5;
    if (hasCode) bonus += 10; // Code blocks show effort
    if (hasEmojis && messageLength > 50) bonus += 3; // Emojis in longer messages
    if (hasMentions) bonus += 2;

    // Word diversity bonus (more unique words = better quality)
    this.RE_WORDS.lastIndex = 0; // Reset stateful regex
    const words = messageText.toLowerCase().match(this.RE_WORDS) || [];
    const uniqueWords = new Set(words);
    if (uniqueWords.size > 10 && messageLength > 100) {
      bonus += Math.min(uniqueWords.size * 0.5, 15);
    }

    // Question/answer bonus (engagement indicators)
    if (messageText.includes('?') && messageLength > 30) bonus += 5;
    if (this.RE_PROPER_SENTENCE.test(messageText)) bonus += 3; // Proper sentences

    return Math.round(bonus);
  }

  calculateMessageTypeBonus(messageText) {
    let bonus = 0;

    // Structured content bonuses (uses pre-compiled regex from constructor)
    if (this.RE_NUMBERED_LIST.test(messageText)) bonus += 5; // Numbered lists
    if (this.RE_BULLET_LIST.test(messageText)) bonus += 5; // Bullet points
    if (messageText.includes('\n') && messageText.split('\n').length > 2) bonus += 8; // Multi-line

    return bonus;
  }

  calculateTimeBonus() {
    const now = Date.now();
    if (
      this._cache.timeBonus !== null &&
      this._cache.timeBonusTime &&
      now - this._cache.timeBonusTime < this._cache.timeBonusTTL
    ) {
      return this._cache.timeBonus;
    }

    const hour = new Date().getHours();
    // Peak hours bonus (evening/night when more active)
    let result = 0;
    if (hour >= 18 && hour <= 23) {
      result = 5; // Evening bonus
    } else if (hour >= 0 && hour <= 4) {
      result = 8; // Late night bonus (dedicated players)
    }

    this._cache.timeBonus = result;
    this._cache.timeBonusTime = now;

    return result;
  }

  calculateChannelActivityBonus() {
    // More active channels give slightly more XP (encourages engagement)
    const channelId = this.getCurrentChannelId();
    if (!channelId) return 0;

    // This is a simple implementation - could be enhanced with channel activity tracking
    // For now, just a small bonus for being active
    return 2;
  }

  calculateActivityStreakBonus() {
    // Check cache first (streak changes daily)
    const now = Date.now();
    const today = new Date().toDateString();
    const cacheKey = `${today}_${this.settings.activity?.streakDays || 0}`;

    if (
      this._cache.activityStreakBonus !== null &&
      this._cache.activityStreakBonusTime &&
      this._cache.activityStreakBonusKey === cacheKey &&
      now - this._cache.activityStreakBonusTime < this._cache.activityStreakBonusTTL
    ) {
      return this._cache.activityStreakBonus;
    }

    // Reward consistent daily activity to help balance progression at high levels
    // Tracks consecutive days with activity (messages sent)
    try {
      const lastActiveDate = this.settings.activity?.lastActiveDate;

      // Initialize streak tracking if needed
      if (!this.settings.activity.streakDays) {
        this.settings.activity.streakDays = 0;
      }

      // Check if this is a new day
      if (lastActiveDate !== today) {
        // Check if streak continues (yesterday was active)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();

        if (lastActiveDate === yesterdayStr) {
          // Streak continues
          this.settings.activity.streakDays = (this.settings.activity.streakDays || 0) + 1;
        } else if (lastActiveDate && lastActiveDate !== today) {
          // Streak broken
          this.settings.activity.streakDays = 1;
        } else {
          // First day or no previous activity
          this.settings.activity.streakDays = 1;
        }

        this.settings.activity.lastActiveDate = today;
      }

      // Calculate bonus based on streak (capped at 7 days for balance)
      // 1 day: +1 XP, 2 days: +2 XP, 3 days: +4 XP, 4 days: +6 XP, 5 days: +8 XP, 6 days: +10 XP, 7+ days: +12 XP
      const streakDays = Math.min(this.settings.activity.streakDays || 0, 7);
      const streakBonus = streakDays <= 1 ? streakDays : Math.min(2 + (streakDays - 1) * 2, 12);

      // Cache the result with key
      this._cache.activityStreakBonus = streakBonus;
      this._cache.activityStreakBonusTime = now;
      this._cache.activityStreakBonusKey = cacheKey;

      return streakBonus;
    } catch (error) {
      this.debugError('CALCULATE_STREAK_BONUS', error);
      return 0;
    }
  }

  getSkillTreeBonuses() {
    const now = Date.now();
    if (
      this._cache.skillTreeBonuses !== null &&
      this._cache.skillTreeBonusesTime &&
      now - this._cache.skillTreeBonusesTime < this._cache.skillTreeBonusesTTL
    ) {
      return this._cache.skillTreeBonuses;
    }

    try {
      const bonuses = BdApi.Data.load('SkillTree', 'bonuses') || null;
      this._cache.skillTreeBonuses = bonuses;
      this._cache.skillTreeBonusesTime = now;
      return bonuses;
    } catch (error) {
      this.debugError('SKILL_TREE_BONUSES', error);
      this._cache.skillTreeBonuses = null;
      this._cache.skillTreeBonusesTime = now;
      return null;
    }
  }

  /**
   * Get active skill buffs from SkillTree plugin (shared storage)
   * @returns {Object|null} - Active buff effects or null
   */
  getActiveSkillBuffs() {
    const now = Date.now();
    if (
      this._cache.activeSkillBuffs !== null &&
      this._cache.activeSkillBuffsTime &&
      now - this._cache.activeSkillBuffsTime < this._cache.activeSkillBuffsTTL
    ) {
      return this._cache.activeSkillBuffs;
    }

    try {
      const buffs = BdApi.Data.load('SkillTree', 'activeBuffs') || null;
      this._cache.activeSkillBuffs = buffs;
      this._cache.activeSkillBuffsTime = now;
      return buffs;
    } catch (error) {
      this.debugError('ACTIVE_SKILL_BUFFS', error);
      this._cache.activeSkillBuffs = null;
      this._cache.activeSkillBuffsTime = now;
      return null;
    }
  }

  /**
   * Consume a charge from a charge-based active skill via SkillTree plugin
   * @param {string} skillId - Active skill ID
   * @returns {boolean}
   */
  consumeActiveSkillCharge(skillId) {
    try {
      const skillTreePlugin = BdApi.Plugins.get('SkillTree');
      const instance = skillTreePlugin?.instance || skillTreePlugin;
      if (instance && typeof instance.consumeActiveSkillCharge === 'function') {
        return instance.consumeActiveSkillCharge(skillId);
      }
    } catch (_error) {
      // SkillTree not available
    }
    return false;
  }

  extractMentionCountFromText(messageText = '') {
    if (!messageText) return 0;
    const mentionMatches = messageText.match(/<@!?\d+>|@everyone|@here/g);
    return mentionMatches ? mentionMatches.length : 0;
  }

  getChannelStore() {
    let channelStore = this.webpackModules?.ChannelStore;
    if (!channelStore?.getChannel) {
      channelStore = BdApi.Webpack.getModule((m) => m && m.getChannel && m.getLastSelectedChannelId);
      if (channelStore) this.webpackModules.ChannelStore = channelStore;
    }
    return channelStore || null;
  }

  getChannelTypeById(channelId) {
    if (!channelId) return null;
    try {
      return this.getChannelStore()?.getChannel?.(channelId)?.type ?? null;
    } catch (_error) {
      return null;
    }
  }

  isThreadLikeChannelType(channelType) {
    return channelType === 10 || channelType === 11 || channelType === 12;
  }

  doesMessageFiberMatchAuthorId(messageElement, authorIdToMatch) {
    if (!messageElement || !authorIdToMatch) return false;
    try {
      const reactKey = this.getReactFiberKey(messageElement);
      if (!reactKey) return false;

      let fiber = messageElement[reactKey];
      for (let i = 0; i < 20 && fiber; i++) {
        const authorId =
          fiber.memoizedProps?.message?.author?.id ||
          fiber.memoizedState?.message?.author?.id ||
          fiber.memoizedProps?.message?.authorId;
        if (authorId === authorIdToMatch) return true;
        fiber = fiber.return;
      }
      return false;
    } catch (_error) {
      return false;
    }
  }

  ensureValidTotalXP(logContext = 'TOTAL_XP') {
    if (
      typeof this.settings.totalXP === 'number' &&
      !isNaN(this.settings.totalXP) &&
      this.settings.totalXP >= 0
    ) {
      return false;
    }

    const currentLevel = this.settings.level || 1;
    let totalXPNeeded = 0;
    for (let l = 1; l < currentLevel; l++) {
      totalXPNeeded += this.getXPRequiredForLevel(l);
    }
    this.settings.totalXP = totalXPNeeded + (this.settings.xp || 0);

    this.debugLog(logContext, 'Initialized missing totalXP', {
      initializedTotalXP: this.settings.totalXP,
      level: currentLevel,
      xp: this.settings.xp,
    });
    return true;
  }

  buildMessageContextFromStore(message, messageText = '') {
    const channelId = message?.channel_id || this.getCurrentChannelId();
    const channelType = this.getChannelTypeById(channelId);
    const mentionCount = Array.isArray(message?.mentions)
      ? message.mentions.length + (message?.mention_everyone ? 1 : 0)
      : this.extractMentionCountFromText(messageText);

    return {
      source: 'store',
      channelId,
      channelType,
      mentionCount,
      hasMentions: mentionCount > 0,
      isReply: !!(message?.message_reference || message?.referenced_message),
      isThread:
        this.isThreadLikeChannelType(channelType) ||
        /\/threads\/\d+/.test(window.location?.pathname || ''),
      isForumThread: channelType === 11 || channelType === 12,
    };
  }

  buildMessageContextFromView(messageText = '', messageElement = null) {
    const channelInfo = this.getCurrentChannelInfo() || {};
    const rawChannelId = channelInfo.rawChannelId || null;
    const channelType = this.getChannelTypeById(rawChannelId);
    const mentionCount = this.extractMentionCountFromText(messageText);

    const hasReplyNode = !!messageElement?.querySelector?.(
      '[class*="replied"], [class*="reply"], [id*="reply"]'
    );

    return {
      source: 'view',
      channelId: rawChannelId || channelInfo.channelId || null,
      channelType,
      mentionCount,
      hasMentions: mentionCount > 0,
      isReply: hasReplyNode,
      isThread:
        channelInfo.channelType === 'thread' ||
        this.isThreadLikeChannelType(channelType) ||
        /\/threads\/\d+/.test(window.location?.pathname || ''),
      isForumThread: channelType === 11 || channelType === 12,
    };
  }

  calculateInteractionQualityBonus(messageContext = {}, messageText = '') {
    const mentionCount = Number.isFinite(messageContext?.mentionCount)
      ? messageContext.mentionCount
      : this.extractMentionCountFromText(messageText);
    const isReply = messageContext?.isReply === true;
    const isThreadParticipation = messageContext?.isThread === true;

    let bonus = 0;
    isReply && (bonus += 5); // Encourage actual conversation chains
    mentionCount > 0 && (bonus += Math.min(8, mentionCount * 2)); // Cap mention bonus to avoid farming
    isThreadParticipation && (bonus += 4); // Reward focused thread participation

    return bonus;
  }

  normalizeMessageFingerprint(messageText = '') {
    return String(messageText || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '<url>')
      .replace(/<@!?\d+>|@everyone|@here/g, '<mention>')
      .replace(/[^\w\s<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
  }

  pruneAntiAbuseFingerprints(now, maxAgeMs) {
    if (!this._messageAntiAbuse?.fingerprints) return;
    for (const [key, entry] of this._messageAntiAbuse.fingerprints.entries()) {
      if (!entry?.lastSeen || now - entry.lastSeen > maxAgeMs) {
        this._messageAntiAbuse.fingerprints.delete(key);
      }
    }
  }

  getRapidSendDecayMultiplier(deltaMs) {
    if (!isFinite(deltaMs)) return 1.0;
    if (deltaMs < 700) return 0.18;
    if (deltaMs < 1200) return 0.35;
    if (deltaMs < 2000) return 0.55;
    if (deltaMs < 3500) return 0.75;
    if (deltaMs < 5000) return 0.9;
    return 1.0;
  }

  getRepeatDecayMultiplier(repeatCount) {
    if (repeatCount <= 1) return 1.0;
    if (repeatCount === 2) return 0.85;
    if (repeatCount === 3) return 0.65;
    return Math.max(0.35, 0.65 - (repeatCount - 3) * 0.08);
  }

  calculateAntiAbuseScore(messageText, messageContext = {}) {
    const now = Date.now();
    this._messageAntiAbuse = this._messageAntiAbuse || {
      lastMessageTime: 0,
      fingerprints: new Map(),
    };
    const state = this._messageAntiAbuse;
    const repeatWindowMs = 2 * 60 * 1000;

    // Rapid-send decay (ultra-fast bursts are penalized heavily)
    const deltaMs = state.lastMessageTime > 0 ? now - state.lastMessageTime : Number.POSITIVE_INFINITY;
    const rapidMultiplier = this.getRapidSendDecayMultiplier(deltaMs);

    // Repeat-text decay (same normalized content in rolling window)
    this.pruneAntiAbuseFingerprints(now, repeatWindowMs);
    const fingerprint = this.normalizeMessageFingerprint(messageText);
    let repeatCount = 1;
    if (fingerprint.length >= 6) {
      const existing = state.fingerprints.get(fingerprint);
      if (existing && now - existing.lastSeen <= repeatWindowMs) {
        repeatCount = existing.count + 1;
      }
      state.fingerprints.set(fingerprint, { count: repeatCount, lastSeen: now });
    }
    const repeatMultiplier = this.getRepeatDecayMultiplier(repeatCount);

    // Combined decay with floor to avoid zeroing out progression
    const multiplier = Math.max(0.12, Math.min(1.0, rapidMultiplier * repeatMultiplier));
    state.lastMessageTime = now;

    return {
      multiplier,
      rapidMultiplier,
      repeatMultiplier,
      repeatCount,
      deltaMs: isFinite(deltaMs) ? deltaMs : null,
      source: messageContext?.source || 'unknown',
    };
  }

  getPerceptionBurstProfile() {
    const perceptionStat = this.settings?.stats?.perception ?? 0;
    const perception = Math.max(0, Number(perceptionStat) || 0);
    const burstChance = Math.min(0.45, 0.05 + perception * 0.0035); // 5% base, +0.35% per PER
    const maxHits = Math.min(40, Math.max(1, 1 + Math.floor(perception * 0.5))); // 1..40
    const jackpotChance = perception >= 40 ? Math.min(0.02, (perception - 39) * 0.0004) : 0;

    return {
      perception,
      burstChance,
      maxHits,
      jackpotChance,
    };
  }

  calculateBaseXpForMessage({ messageText, messageLength, messageContext = null }) {
    // ===== BASE XP CALCULATION (Additive Bonuses) =====
    // Base XP: 10 per message
    let baseXP = 10;

    // 1. Character bonus: +0.15 per character (max +75)
    const charBonus = Math.min(messageLength * 0.15, 75);
    baseXP += charBonus;

    // 2. Quality bonuses based on message content
    const qualityBonus = this.calculateQualityBonus(messageText, messageLength);
    baseXP += qualityBonus;

    // 3. Message type bonuses
    const typeBonus = this.calculateMessageTypeBonus(messageText);
    baseXP += typeBonus;

    // 4. Time-based bonus (active during peak hours)
    const timeBonus = this.calculateTimeBonus();
    baseXP += timeBonus;

    // 5. Channel activity bonus (more active channels = more XP)
    const channelBonus = this.calculateChannelActivityBonus();
    baseXP += channelBonus;

    // 6. Activity streak bonus (reward consistent daily activity)
    // This helps balance progression at high levels by rewarding regular play
    const streakBonus = this.calculateActivityStreakBonus();
    baseXP += streakBonus;

    // 7. Interaction quality bonus (reply/mention/thread participation)
    const interactionBonus = this.calculateInteractionQualityBonus(messageContext || {}, messageText);

    // 8. Anti-abuse scoring (repeat-text + ultra-fast send decay)
    const antiAbuse = this.calculateAntiAbuseScore(messageText, messageContext || {});
    const decayedBaseXp = Math.max(3, Math.round(baseXP * antiAbuse.multiplier));
    const scaledInteractionBonus = Math.round(interactionBonus * Math.max(0.5, antiAbuse.multiplier));
    const finalBaseXp = decayedBaseXp + scaledInteractionBonus;

    this._lastAntiAbuseMeta = {
      antiAbuse,
      interactionBonus,
      scaledInteractionBonus,
      preDecayBaseXP: baseXP,
      postDecayBaseXP: finalBaseXp,
    };

    return finalBaseXp;
  }

  getXPRequiredForLevel(level) {
    // Check cache first (level XP requirements never change)
    if (this._cache.xpRequiredForLevel.has(level)) {
      return this._cache.xpRequiredForLevel.get(level);
    }

    const baseXP = 100;
    const exponentialPart = baseXP * Math.pow(level, 1.6);
    const linearPart = baseXP * level * 0.25;
    const result = Math.round(exponentialPart + linearPart);

    if (this._cache.xpRequiredForLevel.size < 1000) {
      this._cache.xpRequiredForLevel.set(level, result);
    }

    return result;
  }

  calculateHP(vitality, rank = 'E') {
    // Check cache first
    const cacheKey = `${vitality}_${rank}`;
    if (this._cache.hpCache.has(cacheKey)) {
      return this._cache.hpCache.get(cacheKey);
    }

    const rankIndex = Math.max(this.settings.ranks.indexOf(rank), 0);
    const baseHP = 100;
    const result = baseHP + vitality * 10 + rankIndex * 50;

    // Cache the result (limit cache size)
    if (this._cache.hpCache.size < 100) {
      this._cache.hpCache.set(cacheKey, result);
    }

    return result;
  }

  calculateMana(intelligence) {
    if (this._cache.manaCache.has(intelligence)) {
      return this._cache.manaCache.get(intelligence);
    }

    const baseMana = 100;
    const result = baseMana + intelligence * 10;
    if (this._cache.manaCache.size < 100) {
      this._cache.manaCache.set(intelligence, result);
    }

    return result;
  }

  getCurrentChannelInfo() {
    try {
      const url = window.location.href;
      // Reduced verbosity - only log if verbose mode enabled (frequent operation)
      this.debugLog('GET_CHANNEL_INFO', 'Getting channel info', { url });

      // Pattern 0: Thread route - /channels/{serverId}/{parentChannelId}/threads/{threadId}
      const threadMatch = url.match(/channels\/(\d+)\/(\d+)\/threads\/(\d+)/);
      if (threadMatch) {
        const serverId = threadMatch[1];
        const parentChannelId = threadMatch[2];
        const threadId = threadMatch[3];
        this.debugLog('GET_CHANNEL_INFO', 'Thread route detected', {
          serverId,
          parentChannelId,
          threadId,
          type: 'thread',
        });
        return {
          channelId: `thread_${serverId}_${parentChannelId}_${threadId}`,
          channelType: 'thread',
          serverId,
          isDM: false,
          rawChannelId: threadId,
          parentChannelId,
        };
      }

      // Pattern 1: Server channel - /channels/{serverId}/{channelId}
      const serverChannelMatch = url.match(/channels\/(\d+)\/(\d+)/);
      if (serverChannelMatch) {
        const serverId = serverChannelMatch[1];
        const channelId = serverChannelMatch[2];
        // Reduced verbosity - only log if verbose mode enabled
        this.debugLog('GET_CHANNEL_INFO', 'Server channel detected', {
          serverId,
          channelId,
          type: 'server',
        });
        return {
          channelId: `server_${serverId}_${channelId}`, // Unique ID for server channels
          channelType: 'server',
          serverId,
          isDM: false,
          rawChannelId: channelId,
        };
      }

      // Pattern 2: Direct Message (DM) - /@me/{channelId}
      const dmMatch = url.match(/@me\/(\d+)/);
      if (dmMatch) {
        const channelId = dmMatch[1];
        // Reduced verbosity - only log if verbose mode enabled
        this.debugLog('GET_CHANNEL_INFO', 'DM channel detected', {
          channelId,
          type: 'dm',
        });
        return {
          channelId: `dm_${channelId}`, // Unique ID for DMs
          channelType: 'dm',
          serverId: null,
          isDM: true,
          rawChannelId: channelId,
        };
      }

      // Pattern 3: Group DM - /channels/@me/{groupId}
      const groupDmMatch = url.match(/channels\/@me\/(\d+)/);
      if (groupDmMatch) {
        const groupId = groupDmMatch[1];
        // Reduced verbosity - only log if verbose mode enabled
        this.debugLog('GET_CHANNEL_INFO', 'Group DM detected', {
          groupId,
          type: 'group_dm',
        });
        return {
          channelId: `group_dm_${groupId}`,
          channelType: 'group_dm',
          serverId: null,
          isDM: true,
          rawChannelId: groupId,
        };
      }

      // Pattern 4: Fallback - use full URL as ID (for unknown patterns)
      this.debugLog('GET_CHANNEL_INFO', 'Unknown channel pattern, using URL as ID', {
        url,
        type: 'unknown',
      });
      return {
        channelId: `unknown_${this.hashString(url)}`,
        channelType: 'unknown',
        serverId: null,
        isDM: false,
        rawChannelId: url,
      };
    } catch (error) {
      this.debugError('GET_CHANNEL_INFO', error, {
        currentUrl: window.location.href,
      });
      return null;
    }
  }

  getCurrentChannelId() {
    const info = this.getCurrentChannelInfo();
    return info ? info.channelId : null;
  }

  /**
   * Check if the current view is a guild text channel (not thread/forum/VC/DM).
   * Uses ChannelStore for accurate type detection, falls back to URL heuristics.
   * Discord channel types: 0=GUILD_TEXT, 2=GUILD_VOICE, 5=GUILD_ANNOUNCEMENT,
   * 10/11/12=threads, 13=GUILD_STAGE, 15=GUILD_FORUM, 1=DM, 3=GROUP_DM
   */
  _isGuildTextChannel() {
    try {
      const pathname = window.location?.pathname || '';
      if (/\/threads\/\d+/.test(pathname)) return false;

      const channelInfo = this.getCurrentChannelInfo();
      if (!channelInfo) return false;

      // DMs and group DMs are never guild text channels
      if (channelInfo.isDM) return false;
      if (channelInfo.channelType === 'dm' || channelInfo.channelType === 'group_dm') return false;
      if (channelInfo.channelType === 'thread') return false;

      // Use ChannelStore for accurate channel type detection
      const channelStore = this.getChannelStore();
      if (channelStore?.getChannel && channelInfo.rawChannelId) {
        const channel = channelStore.getChannel(channelInfo.rawChannelId);
        if (channel) {
          // type 0 = GUILD_TEXT, type 5 = GUILD_ANNOUNCEMENT (text-based)
          // Exclude: 10/11/12=threads, 15=GUILD_FORUM, 2=VOICE, 13=STAGE
          return channel.type === 0 || channel.type === 5;
        }
      }

      // Fallback: URL-based detection — guild server channels match /channels/{serverId}/{channelId}
      // Without ChannelStore we can't distinguish threads/forums from text channels.
      // Check URL for thread indicators (threads often have /threads/ in URL or longer channel IDs)
      if (channelInfo.channelType === 'server') {
        return true;
      }
      return false;
    } catch (error) {
      this.debugError('IS_GUILD_TEXT_CHANNEL', error);
      return false;
    }
  }

  _getPrimaryChatContainer() {
    return (
      document.querySelector('main[class*="chatContent"]') ||
      document.querySelector('section[class*="chatContent"][role="main"]') ||
      document.querySelector('div[class*="chatContent"]:not([role="complementary"])') ||
      document.querySelector('div[class*="chat_"]:not([class*="chatLayerWrapper"])')
    );
  }

  _getMessageInputAreaInPrimaryChat() {
    const mainChat = this._getPrimaryChatContainer();
    if (!mainChat) return null;

    const messageInputArea =
      mainChat.querySelector('[class*="channelTextArea"]') ||
      mainChat.querySelector('[class*="textArea"]')?.parentElement ||
      mainChat.querySelector('[class*="slateTextArea"]')?.parentElement;

    if (!messageInputArea || !messageInputArea.parentElement) return null;

    // Safety: don't inject inside dialogs/modals (Forward To, etc.)
    if (
      messageInputArea.closest('[role="dialog"]') ||
      messageInputArea.closest('[class*="layerContainer_"]')
    ) {
      return null;
    }

    return messageInputArea;
  }

  _hasWritableMessageInputInCurrentView() {
    try {
      const messageInputArea = this._getMessageInputAreaInPrimaryChat();
      if (!messageInputArea) return false;

      if (
        messageInputArea.getAttribute('aria-disabled') === 'true' ||
        messageInputArea.closest('[aria-disabled="true"]')
      ) {
        return false;
      }

      const editor =
        messageInputArea.querySelector('[role="textbox"]') ||
        messageInputArea.querySelector('textarea') ||
        messageInputArea.querySelector('[contenteditable="true"]') ||
        messageInputArea.querySelector('[class*="slateTextArea"]');

      if (!editor) return false;

      if (
        editor.getAttribute('aria-disabled') === 'true' ||
        editor.getAttribute('disabled') !== null ||
        editor.getAttribute('readonly') !== null ||
        editor.getAttribute('contenteditable') === 'false'
      ) {
        return false;
      }

      return true;
    } catch (error) {
      this.debugError('HAS_WRITABLE_INPUT', error);
      return false;
    }
  }

  _canShowChatUIInCurrentView() {
    return this._isGuildTextChannel() && this._hasWritableMessageInputInCurrentView();
  }

  getRankMultiplier() {
    return this.rankData.xpMultipliers[this.settings.rank] || 1.0;
  }

  /**
   * Get title and shadow buff percentages for a stat key.
   * Handles old-format (raw number) → new-format (percentage) conversion
   * while using PER as the canonical perception stat key.
   * @param {string} statKey - One of STAT_KEYS
   * @param {Object} titleBonus - From getActiveTitleBonus()
   * @param {Object} [shadowBuffs] - From getShadowArmyBuffs() (optional)
   * @returns {{ titlePercent: number, shadowPercent: number }}
   */
  getBuffPercents(statKey, titleBonus, shadowBuffs) {
    // Title: support both old format (raw numbers) and new format (percentages)
    const percentKey = `${statKey}Percent`;
    const rawKey = statKey === 'perception' ? (titleBonus.perception || 0) : (titleBonus[statKey] || 0);
    const titlePercent = titleBonus[percentKey] || (rawKey ? rawKey / 100 : 0);

    // Shadow: percentages (0.1 = 10%)
    let shadowPercent = 0;
    if (shadowBuffs) {
      shadowPercent = statKey === 'perception'
        ? (shadowBuffs.perception || 0)
        : (shadowBuffs[statKey] || 0);
    }

    return { titlePercent, shadowPercent };
  }

  getStatPointsForLevel(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    if (normalizedLevel < 100) return 5;
    if (normalizedLevel < 300) return 4;
    if (normalizedLevel < 700) return 3;
    if (normalizedLevel < 1200) return 2;
    return 1;
  }

  getTitleXpCapForLevel(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    if (normalizedLevel < 200) return 0.35;
    if (normalizedLevel < 500) return 0.45;
    if (normalizedLevel < 1000) return 0.55;
    if (normalizedLevel < 1500) return 0.65;
    return 0.75;
  }

  getPerMessageXpSoftCap(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.round(220 + normalizedLevel * 2.8);
  }

  getPerMessageXpHardCap(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.round(420 + normalizedLevel * 4.2);
  }

  applyXpGovernors(rawXp, level) {
    let xp = Math.max(0, Math.round(Number(rawXp) || 0));
    const softCap = this.getPerMessageXpSoftCap(level);
    const hardCap = this.getPerMessageXpHardCap(level);

    if (xp > softCap) {
      const overflow = xp - softCap;
      const capGap = Math.max(1, hardCap - softCap);
      // Smooth overflow compression: tiny overages stay tiny, large spikes asymptotically
      // approach the hard cap without jumping there immediately.
      const compressionScale = Math.max(1, Math.round(capGap / 4));
      const compressedOverflow = Math.min(capGap, Math.round(Math.sqrt(overflow * compressionScale)));
      xp = softCap + compressedOverflow;
    }

    return Math.min(xp, hardCap);
  }

  getReactFiberKey(element) {
    return Object.keys(element).find(
      (key) =>
        key.startsWith('__reactFiber') ||
        key.startsWith('__reactInternalInstance') ||
        key.startsWith('__reactContainer')
    );
  }

  getMessageContainer() {
    const cached = this._messageContainerEl;
    if (cached && cached.isConnected) return cached;
    const el =
      document.querySelector('[class*="messagesWrapper"]') ||
      document.querySelector('[class*="scrollerInner"]') ||
      document.querySelector('[class*="messageList"]') ||
      document.querySelector('[class*="scroller"]');
    this._messageContainerEl = el || null;
    return this._messageContainerEl;
  }

  getCurrentLevel() {
    // Check cache first
    const now = Date.now();
    if (
      this._cache.currentLevel &&
      this._cache.currentLevelTime &&
      now - this._cache.currentLevelTime < this._cache.currentLevelTTL
    ) {
      return this._cache.currentLevel;
    }

    // CRITICAL: Ensure totalXP is valid (prevent progress bar from breaking)
    const totalXP =
      typeof this.settings.totalXP === 'number' &&
      !isNaN(this.settings.totalXP) &&
      this.settings.totalXP >= 0
        ? this.settings.totalXP
        : 0;

    let level = 1;
    let totalXPNeeded = 0;
    let xpForNextLevel = 0;

    // Safety: Prevent infinite loop (max level 10000)
    const maxLevel = 10000;
    let iterations = 0;

    // Calculate level based on total XP
    while (iterations < maxLevel) {
      xpForNextLevel = this.getXPRequiredForLevel(level);
      if (totalXPNeeded + xpForNextLevel > totalXP) {
        break;
      }
      totalXPNeeded += xpForNextLevel;
      level++;
      iterations++;
    }

    // Ensure xpForNextLevel is valid (at least 1)
    if (xpForNextLevel <= 0) {
      xpForNextLevel = this.getXPRequiredForLevel(level);
    }

    // Calculate current XP in level
    const currentXP = Math.max(0, totalXP - totalXPNeeded);

    const result = {
      level: level,
      xp: currentXP,
      xpRequired: xpForNextLevel,
      totalXPNeeded: totalXPNeeded,
    };

    // Cache the result
    this._cache.currentLevel = result;
    this._cache.currentLevelTime = now;

    return result;
  }

  getRankRequirements() {
    // Rank requirements: [level, achievements required, description]
    return {
      E: { level: 1, achievements: 0, name: 'E-Rank Hunter', next: 'D' },
      D: { level: 10, achievements: 2, name: 'D-Rank Hunter', next: 'C' },
      C: { level: 25, achievements: 5, name: 'C-Rank Hunter', next: 'B' },
      B: { level: 50, achievements: 10, name: 'B-Rank Hunter', next: 'A' },
      A: { level: 100, achievements: 15, name: 'A-Rank Hunter', next: 'S' },
      S: { level: 200, achievements: 20, name: 'S-Rank Hunter', next: 'SS' },
      SS: { level: 300, achievements: 22, name: 'SS-Rank Hunter', next: 'SSS' },
      SSS: { level: 400, achievements: 24, name: 'SSS-Rank Hunter', next: 'SSS+' },
      'SSS+': { level: 500, achievements: 26, name: 'SSS+-Rank Hunter', next: 'NH' },
      NH: { level: 700, achievements: 28, name: 'National Hunter', next: 'Monarch' },
      Monarch: { level: 1000, achievements: 30, name: 'Monarch', next: 'Monarch+' },
      'Monarch+': { level: 1500, achievements: 33, name: 'Monarch+', next: 'Shadow Monarch' },
      'Shadow Monarch': { level: 2000, achievements: 35, name: 'Shadow Monarch', next: null },
    };
  }

  getTotalEffectiveStats() {
    // Check cache first
    const now = Date.now();
    // Cache key from stat values + active title (O(1) vs JSON.stringify O(n))
    const s = this.settings.stats || {};
    const cacheKey = `${s.strength || 0}_${s.agility || 0}_${s.intelligence || 0}_${s.vitality || 0}_${s.perception || 0}_${this.settings.achievements?.activeTitle || ''}`;

    if (
      this._cache.totalEffectiveStats &&
      this._cache.totalEffectiveStatsKey === cacheKey &&
      this._cache.totalEffectiveStatsTime &&
      now - this._cache.totalEffectiveStatsTime < this._cache.totalEffectiveStatsTTL
    ) {
      return this._cache.totalEffectiveStats;
    }

    // CRITICAL: Ensure stats object exists and has all required properties
    // If stats are missing or reset, initialize with defaults to prevent all-zero stats
    if (!this.settings.stats || typeof this.settings.stats !== 'object') {
      this.settings.stats = {
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        perception: 0,
      };
      this.saveSettings(); // Save initialized stats
      this.debugLog('STATS', 'Stats object was missing, initialized with defaults');
    }

    // Ensure all stat properties exist (migration safety)
    const baseStats = {
      strength: this.settings.stats.strength || 0,
      agility: this.settings.stats.agility || 0,
      intelligence: this.settings.stats.intelligence || 0,
      vitality: this.settings.stats.vitality || 0,
      perception: this.settings.stats.perception ?? 0,
    };

    const titleBonus = this.getActiveTitleBonus();
    const shadowBuffs = this.getEffectiveShadowArmyBuffs();

    // Apply title + shadow bonuses multiplicatively per stat using shared helper
    const result = {};
    for (const key of this.STAT_KEYS) {
      const { titlePercent, shadowPercent } = this.getBuffPercents(key, titleBonus, shadowBuffs);
      const withTitle = Math.round(baseStats[key] * (1 + titlePercent));
      result[key] = Math.round(withTitle * (1 + shadowPercent));
    }

    // Cache the result
    this._cache.totalEffectiveStats = result;
    this._cache.totalEffectiveStatsKey = cacheKey;
    this._cache.totalEffectiveStatsTime = now;

    return result;
  }

  getTotalShadowPower() {
    // Return cached value immediately
    return this.cachedShadowPower;
  }

  clampPercentage(value) {
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  }

  formatPercentWidth(value) {
    return `${this.clampPercentage(value).toFixed(2)}%`;
  }

  getLevelProgressSnapshot({ allowFallback = false, logContext = null } = {}) {
    const levelInfo = this.getCurrentLevel();
    if (levelInfo && Number.isFinite(levelInfo.xpRequired) && levelInfo.xpRequired > 0) {
      return {
        valid: true,
        source: 'levelInfo',
        levelInfo,
        xp: levelInfo.xp,
        xpRequired: levelInfo.xpRequired,
        xpPercent: this.clampPercentage((levelInfo.xp / levelInfo.xpRequired) * 100),
      };
    }

    if (allowFallback) {
      const fallbackXP = this.settings.xp || 0;
      const fallbackXPRequired = this.getXPRequiredForLevel(this.settings.level || 1);
      if (fallbackXPRequired > 0) {
        const xpPercent = this.clampPercentage((fallbackXP / fallbackXPRequired) * 100);
        if (logContext) {
          this.debugLog(logContext, 'Using fallback XP calculation', {
            fallbackXP,
            fallbackXPRequired,
            xpPercent,
            level: this.settings.level,
          });
        }
        return {
          valid: true,
          source: 'fallback',
          levelInfo: levelInfo || null,
          xp: fallbackXP,
          xpRequired: fallbackXPRequired,
          xpPercent,
        };
      }
    }

    return {
      valid: false,
      source: 'invalid',
      levelInfo: levelInfo || null,
      xp: 0,
      xpRequired: 0,
      xpPercent: 0,
    };
  }

  getEventLevelInfoOrNull(logContext) {
    const snapshot = this.getLevelProgressSnapshot({ allowFallback: false });
    if (!snapshot.valid || !snapshot.levelInfo) {
      this.debugLog(logContext, 'Level info not available, skipping emit');
      return null;
    }
    return snapshot.levelInfo;
  }

  buildCoreProgressPayload(levelInfo) {
    return {
      xp: levelInfo.xp,
      xpRequired: levelInfo.xpRequired,
      totalXP: this.settings.totalXP,
      levelInfo,
    };
  }

  // getXPProgressFillElement() — REMOVED in v3.0.0 (React LevelInfo component owns XP bar)

  // ── §3.4 EVENT SYSTEM HELPERS ────────────────────────────────────────────
  // on(), off(), emit() — pub/sub for xpChanged, levelChanged, rankChanged,
  // statsChanged, shadowPowerChanged events

  on(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }
    this.eventListeners[eventName].push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.eventListeners[eventName].indexOf(callback);
      if (index > -1) {
        this.eventListeners[eventName].splice(index, 1);
      }
    };
  }

  emit(eventName, data = {}) {
    if (!this.eventListeners[eventName]) {
      return;
    }

    // Call all listeners
    this.eventListeners[eventName].forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        this.debugError('EVENT_EMIT', error, { eventName, callback: callback.name || 'anonymous' });
      }
    });

    // Secondary event channel: DOM CustomEvent for cross-plugin reliability
    // (Some plugins may not have direct access to this instance's on/off methods in all BD environments)
    try {
      const CustomEventCtor = typeof window !== 'undefined' ? window.CustomEvent : null;
      typeof document?.dispatchEvent === 'function' &&
        typeof CustomEventCtor === 'function' &&
        document.dispatchEvent(
          new CustomEventCtor(`SoloLevelingStats:${eventName}`, {
            detail: data,
          })
        );
    } catch (error) {
      // Never allow event dispatch to break game loop
      this.debugError('EVENT_EMIT', error, { eventName, phase: 'custom_event_dispatch' });
    }
  }

  emitXPChanged() {
    try {
      const levelInfo = this.getEventLevelInfoOrNull('EMIT_XP_CHANGED');
      if (!levelInfo) return;

      const xpData = {
        level: this.settings.level,
        rank: this.settings.rank,
        ...this.buildCoreProgressPayload(levelInfo),
      };

      this._chatUIDirty = true;
      this.emit('xpChanged', xpData);

      // Trigger UI update immediately after emit
      try {
        this.updateChatUI();
      } catch (error) {
        this.debugError('EMIT_XP_CHANGED', error, { phase: 'ui_update_after_emit' });
      }
    } catch (error) {
      this.debugError('EMIT_XP_CHANGED', error);
    }
  }

  emitLevelChanged(oldLevel, newLevel) {
    try {
      const levelInfo = this.getEventLevelInfoOrNull('EMIT_LEVEL_CHANGED');
      if (!levelInfo) return;

      this.emit('levelChanged', {
        oldLevel,
        newLevel,
        rank: this.settings.rank,
        ...this.buildCoreProgressPayload(levelInfo),
      });

      // Also emit XP changed since level affects XP display
      this.emitXPChanged();
    } catch (error) {
      this.debugError('EMIT_LEVEL_CHANGED', error);
    }
  }

  emitRankChanged(oldRank, newRank) {
    try {
      const levelInfo = this.getEventLevelInfoOrNull('EMIT_RANK_CHANGED');
      if (!levelInfo) return;

      this.emit('rankChanged', {
        oldRank,
        newRank,
        level: this.settings.level,
        ...this.buildCoreProgressPayload(levelInfo),
      });

      // Also emit XP changed since rank affects XP display
      this.emitXPChanged();
    } catch (error) {
      this.debugError('EMIT_RANK_CHANGED', error);
    }
  }

  // ── §3.5 WEBPACK MODULE HELPERS ──────────────────────────────────────────
  // Discord internals: MessageStore, UserStore, ChannelStore, MessageActions
  // Function patching for reliable message tracking, React fiber injection

  /**
   * Set up webpack patches for message tracking
   * Uses MessageStore to detect new messages
   */
  setupWebpackPatches() {
    try {
      const extractMessageFromPatch = ({ args, returnValue }) => {
        const raw = [returnValue, ...(Array.isArray(args) ? args : [])].filter(Boolean);
        const candidates = raw
          .flatMap((v) => [
            v,
            v?.message,
            v?.payload?.message,
            v?.payload?.messageRecord,
            v?.messageRecord,
          ])
          .filter(Boolean);

        return candidates.find((m) => {
          const hasId = typeof m?.id === 'string' || typeof m?.id === 'number';
          const hasAuthor = typeof m?.author?.id === 'string' || typeof m?.author?.id === 'number';
          const hasContent = typeof m?.content === 'string';
          return hasId && (hasAuthor || hasContent);
        });
      };

      // Patch MessageStore.receiveMessage if available
      if (this.webpackModules.MessageStore && this.webpackModules.MessageStore.receiveMessage) {
        BdApi.Patcher.after(
          'SoloLevelingStats',
          this.webpackModules.MessageStore,
          'receiveMessage',
          (thisObject, args, returnValue) => {
            try {
              // Process message from store (more reliable than DOM)
              const message = extractMessageFromPatch({ args, returnValue });
              message?.id && this.processMessageFromStore(message);
            } catch (error) {
              this.debugError('MESSAGE_STORE_PATCH', error);
            }
          }
        );
        this.messageStorePatch = true;
        this.debugLog('WEBPACK_PATCH', 'MessageStore patch installed');
      }

      // Also patch MessageActions.sendMessage for sent messages
      if (this.webpackModules.MessageActions && this.webpackModules.MessageActions.sendMessage) {
        BdApi.Patcher.after(
          'SoloLevelingStats',
          this.webpackModules.MessageActions,
          'sendMessage',
          (thisObject, args, returnValue) => {
            try {
              // Process sent message
              const message = extractMessageFromPatch({ args, returnValue });
              message?.id && this.processMessageFromStore(message);
            } catch (error) {
              this.debugError('MESSAGE_ACTIONS_PATCH', error);
            }
          }
        );
        this.debugLog('WEBPACK_PATCH', 'MessageActions patch installed');
      }
    } catch (error) {
      this.debugError('WEBPACK_PATCH_SETUP', error);
      this.webpackModuleAccess = false;
    }
  }

  /**
   * Get current user ID from UserStore (more reliable than React fiber)
   */
  getCurrentUserIdFromStore() {
    try {
      if (this.webpackModules.UserStore) {
        const user = this.webpackModules.UserStore.getCurrentUser();
        if (user && user.id) {
          this.currentUserId = user.id;
          this.settings.ownUserId = user.id;
          this.debugLog('USER_STORE', 'Current user ID retrieved', { userId: user.id });
          return user.id;
        }
      }
    } catch (error) {
      this.debugError('USER_STORE', error);
    }
    return null;
  }

  /**
   * Process message from MessageStore (webpack-based)
   * More reliable than DOM observation
   */
  processMessageFromStore(message) {
    try {
      this.processedMessageIds = this.processedMessageIds || new Set();

      // Skip if message is too old (before plugin start)
      if (message.timestamp && message.timestamp < this.pluginStartTime) {
        return;
      }

      // Skip if already processed
      if (this.processedMessageIds.has(message.id)) {
        return;
      }

      // Get current user ID
      const currentUserId = this.getCurrentUserIdFromStore() || this.settings.ownUserId;
      if (!currentUserId) {
        // Fallback to React fiber if store unavailable
        this.getCurrentUserIdFromStore();
        return;
      }

      // Check if this is our own message
      if (message.author && message.author.id === currentUserId) {
        // Mark as processed
        this.addProcessedMessageId(message.id);

        // Keep context for crit detection (avoid expensive DOM scans)
        this.lastMessageId = message.id;
        this.lastMessageElement = null;

        // Process message for XP/quest tracking
        const messageText = message.content || '';
        const messageLength = messageText.length;

        // Clear pending input fallback if this store message matches
        const pending = this._pendingSendFallback;
        if (pending && typeof pending.hash === 'number') {
          const hash = this.hashString(messageText.substring(0, 2000));
          hash === pending.hash &&
            Date.now() - pending.at < 2000 &&
            (this._pendingSendFallback = null);
        }

        this.debugLog('MESSAGE_STORE', 'Processing message from store', {
          messageId: message.id,
          messageLength,
          channelId: message.channel_id,
        });

        if (!messageText.length) return;

        const messageContext = this.buildMessageContextFromStore(message, messageText);
        this.processMessageSent(messageText, messageContext);
      }
    } catch (error) {
      this.debugError('MESSAGE_STORE_PROCESS', error);
    }
  }

  addProcessedMessageId(messageId) {
    if (!messageId) return;
    this.processedMessageIds = this.processedMessageIds || new Set();
    this.processedMessageIds.add(messageId);

    // Cap growth to avoid unbounded memory usage over long sessions
    const MAX_PROCESSED_MESSAGE_IDS = 5000;
    if (this.processedMessageIds.size <= MAX_PROCESSED_MESSAGE_IDS) return;

    const keepCount = Math.floor(MAX_PROCESSED_MESSAGE_IDS * 0.6);
    const trimmed = Array.from(this.processedMessageIds).slice(-keepCount);
    this.processedMessageIds = new Set(trimmed);
  }

  /**
   * Attempt to inject chat UI into Discord's React tree.
   * Delegates to SLUtils.tryReactInjection() for shared MainContent.Z patching,
   * with per-render guard to hide UI in threads/forums/locked channels.
   * Falls back to inline implementation if SLUtils unavailable.
   * @returns {boolean} - True if React injection was successful
   */
  tryReactInjection() {
    try {
      // Check if webpack modules are available
      if (!this.webpackModuleAccess) {
        this.debugLog('REACT_INJECTION', 'Webpack modules not available, skipping React injection');
        return false;
      }

      const pluginInstance = this;

      // Prefer SLUtils shared implementation (deduplicates MainContent.Z lookup)
      if (this._SLUtils?.tryReactInjection) {
        const { StatsPanel } = pluginInstance._chatUIComponents;
        const success = this._SLUtils.tryReactInjection({
          patcherId: 'SoloLevelingStats',
          elementId: 'sls-chat-ui',
          guard: () => pluginInstance._canShowChatUIInCurrentView(),
          render: (React) => {
            return React.createElement('div', {
              id: 'sls-chat-ui',
              className: 'sls-chat-panel',
            }, React.createElement(StatsPanel));
          },
          onMount: (domEl) => {
            pluginInstance.chatUIPanel = domEl;
            pluginInstance.ensureChatUIUpdateInterval(true);
          },
          debugLog: this.debugLog.bind(this),
          debugError: this.debugError.bind(this),
        });

        if (success) {
          this.reactInjectionActive = true;
          return true;
        }
        // SLUtils failed (MainContent not found), fall through to return false
        return false;
      }

      // Fallback: inline implementation (SLUtils not loaded)
      let MainContent = BdApi.Webpack.getByStrings('baseLayer', {
        searchExports: true,
      });
      if (!MainContent) {
        MainContent = BdApi.Webpack.getByStrings('appMount', {
          searchExports: true,
        });
      }
      if (!MainContent) {
        this.debugLog('REACT_INJECTION', 'Main content component not found, using DOM fallback');
        return false;
      }

      const React = BdApi.React;

      BdApi.Patcher.after(
        'SoloLevelingStats',
        MainContent,
        'Z',
        (thisObject, args, returnValue) => {
          try {
            if (!pluginInstance._canShowChatUIInCurrentView()) {
              return returnValue;
            }

            const bodyPath = BdApi.Utils.findInTree(
              returnValue,
              (prop) =>
                prop &&
                prop.props &&
                (prop.props.className?.includes('app') ||
                  prop.props.id === 'app-mount' ||
                  prop.type === 'body'),
              { walkable: ['props', 'children'] }
            );

            if (bodyPath && bodyPath.props) {
              const hasChatUI = BdApi.Utils.findInTree(
                returnValue,
                (prop) => prop && prop.props && prop.props.id === 'sls-chat-ui',
                { walkable: ['props', 'children'] }
              );

              if (!hasChatUI && !pluginInstance.chatUIPanel) {
                const { StatsPanel } = pluginInstance._chatUIComponents;
                const chatUIElement = React.createElement('div', {
                  id: 'sls-chat-ui',
                  className: 'sls-chat-panel',
                }, React.createElement(StatsPanel));

                if (Array.isArray(bodyPath.props.children)) {
                  bodyPath.props.children.unshift(chatUIElement);
                } else if (bodyPath.props.children) {
                  bodyPath.props.children = [chatUIElement, bodyPath.props.children];
                } else {
                  bodyPath.props.children = chatUIElement;
                }

                pluginInstance.reactInjectionActive = true;
                pluginInstance.debugLog('REACT_INJECTION', 'Chat UI injected via React components (inline fallback)');

                setTimeout(() => {
                  const domElement = document.getElementById('sls-chat-ui');
                  if (domElement) {
                    pluginInstance.chatUIPanel = domElement;
                    pluginInstance.ensureChatUIUpdateInterval(true);
                  }
                }, 100);
              }
            }
          } catch (error) {
            pluginInstance.debugError('REACT_INJECTION', error);
            return returnValue;
          }
        }
      );

      this.reactInjectionActive = true;
      this.debugLog('REACT_INJECTION', 'React injection setup complete (inline fallback)');
      return true;
    } catch (error) {
      this.debugError('REACT_INJECTION', error, { phase: 'setup' });
      return false;
    }
  }

  // ── §3.6 UTILITY HELPERS ─────────────────────────────────────────────────
  // Daily reset, crit bonus calc, perception buffs, message detection helpers

  checkDailyReset() {
    const today = new Date().toDateString();
    if (this.settings.dailyQuests.lastResetDate !== today) {
      // Reset daily quests
      this.settings.dailyQuests.lastResetDate = today;
      Object.keys(this.settings.dailyQuests.quests).forEach((questId) => {
        this.settings.dailyQuests.quests[questId].progress = 0;
        this.settings.dailyQuests.quests[questId].completed = false;
      });
      // Save immediately on daily reset
      this.saveSettings(true);
      this.debugLog('DAILY_QUESTS', 'Daily quests reset');
    }
  }

  checkCriticalHitBonus() {
    // Check if the last message was a critical hit
    // CriticalHit plugin adds 'bd-crit-hit' class to crit messages
    // Agility affects EXP multiplier: base 0.25 (25%) + agility bonus
    try {
      this._cache.lastAppliedCritBurst = null;

      const getMessageContainerElement = () => this.getMessageContainer();

      const findMessageElementById = (messageId) => {
        if (!messageId) return null;

        const cssEscape =
          typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function'
            ? window.CSS.escape
            : null;
        const safe = cssEscape
          ? cssEscape(String(messageId))
          : String(messageId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        const container = getMessageContainerElement() || document;

        // Discord commonly uses data-list-item-id that includes the message id
        return (
          container.querySelector?.(`[data-list-item-id*="${safe}"]`) ||
          container.querySelector?.(`#${safe}`) ||
          null
        );
      };

      const findLatestOwnMessageElement = (limit = 25) => {
        const container = getMessageContainerElement();
        if (!container) return null;

        const nodes = Array.from(container.querySelectorAll?.('[class*="message"]') || []);
        if (!nodes.length) return null;

        const currentUserId = this.currentUserId || this.settings?.ownUserId || null;
        return nodes
          .slice(-limit)
          .reverse()
          .find((el) => this.isOwnMessage?.(el, currentUserId));
      };

      const cachedLast = this.lastMessageElement;
      const lastMessageElement =
        cachedLast && cachedLast.isConnected
          ? cachedLast
          : (this.lastMessageId && findMessageElementById(this.lastMessageId)) ||
            findLatestOwnMessageElement();

      if (lastMessageElement) {
        this.lastMessageElement = lastMessageElement;
        this.lastMessageId = this.lastMessageId || this.getMessageId(lastMessageElement);
      }

      const isCrit = !!(
        lastMessageElement && lastMessageElement.classList?.contains('bd-crit-hit')
      );

      if (!isCrit) {
        return 0; // No crit bonus
      }

      // Get agility stat for EXP multiplier
      const agilityStat = this.settings.stats?.agility || 0;

      // Base crit bonus: 0.20 (20%)
      // Agility bonus: +0.006 per point (0.6% per agility point), capped for stability.
      const agilityBonus = Math.min(0.75, agilityStat * 0.006);
      const baseCritBonus = 0.2;
      let critMultiplier = baseCritBonus + agilityBonus;

      // Check burst-hit multiplier produced by CriticalHit (PER-driven multi-crit)
      try {
        const now = Date.now();
        const cachedComboData = this._cache?.criticalHitComboData;
        const cachedComboDataTime = this._cache?.criticalHitComboDataTime || 0;
        const comboTTL = this._cache?.criticalHitComboDataTTL ?? 500;

        const comboData =
          now - cachedComboDataTime < comboTTL
            ? cachedComboData
            : (() => {
                try {
                  const loaded = {
                    combo: BdApi.Data.load('CriticalHitAnimation', 'userCombo'),
                    burst: BdApi.Data.load('CriticalHit', 'lastCritBurst'),
                  };
                  this._cache.criticalHitComboData = loaded;
                  this._cache.criticalHitComboDataTime = now;
                  return loaded;
                } catch (_error) {
                  // Cache a null for this window to avoid repeated failing reads
                  this._cache.criticalHitComboData = null;
                  this._cache.criticalHitComboDataTime = now;
                  return null;
                }
              })();

        const comboCount = comboData?.combo?.comboCount || 1;
        const burstData = comboData?.burst || null;
        let burstHits = Math.max(1, Number(burstData?.burstHits || comboCount || 1));

        // If burst is for a different message, ignore it for this XP calc.
        if (
          burstData?.messageId &&
          this.lastMessageId &&
          String(burstData.messageId) !== String(this.lastMessageId)
        ) {
          burstHits = 1;
        }

        if (burstHits > 1) {
          // PER burst bonus uses diminishing returns + hard caps.
          // This preserves burst reward identity without making leveling trivial.
          const effectiveBurstHits = Math.min(25, burstHits); // ignore extreme jackpot tails for XP scaling
          const logGain = Math.log2(effectiveBurstHits + 1) * 0.045;
          const chainGain = (Math.min(12, effectiveBurstHits) - 1) * 0.008;
          const burstBonus = Math.min(0.45, logGain + chainGain); // Max +45%
          critMultiplier += burstBonus;

          // Light AGI synergy (kept modest to avoid runaway scaling)
          const agilityBurstEnhancement = burstBonus * Math.min(0.12, agilityStat * 0.001);
          critMultiplier += agilityBurstEnhancement;

          this._cache.lastAppliedCritBurst = {
            burstHits,
            effectiveBurstHits,
            burstBonus,
            agilityBurstEnhancement,
            messageId: this.lastMessageId || null,
            timestamp: now,
          };

          this.debugLog('CHECK_CRIT_BONUS', 'Burst detected', {
            burstHits,
            effectiveBurstHits,
            burstBonus: (burstBonus * 100).toFixed(1) + '%',
            agilityBurstEnhancement: (agilityBurstEnhancement * 100).toFixed(1) + '%',
            totalBurstBonus: ((burstBonus + agilityBurstEnhancement) * 100).toFixed(1) + '%',
          });
        }
      } catch (error) {
        // Burst data not available or error accessing
      }

      // Hard cap total crit multiplier to avoid runaway XP spikes.
      critMultiplier = Math.min(1.35, critMultiplier);

      this.debugLog('CHECK_CRIT_BONUS', 'Crit bonus calculated', {
        baseCritBonus: (baseCritBonus * 100).toFixed(0) + '%',
        agilityStat,
        agilityBonus: (agilityBonus * 100).toFixed(1) + '%',
        totalMultiplier: (critMultiplier * 100).toFixed(1) + '%',
      });

      return critMultiplier;
    } catch (error) {
      this.debugError('CHECK_CRIT_BONUS', error);
    }

    return 0; // No crit bonus
  }

  integrateWithCriticalHit() {
    // AGI = crit chance provider, PER = burst-hit provider for CriticalHit.
    // Data is shared through BdApi.Data.

    // Initialize variables at function scope to prevent ReferenceError in catch block
    let cappedCritBonus = 0;
    let enhancedAgilityBonus = 0;
    let baseAgilityBonus = 0;
    let titleCritBonus = 0;
    let agilityStat = 0;

    try {
      // Validate settings exist
      if (!this.settings || !this.settings.stats) {
        this.debugError('SAVE_AGILITY_BONUS', new Error('Settings or stats not initialized'));
        return;
      }

      // AGI system: +2% crit chance per AGI point (+title crit chance)
      // Effective crit chance is capped in CriticalHit at 50%.

      agilityStat = this.settings.stats.agility || 0;
      baseAgilityBonus = agilityStat * 0.02; // 2% per point
      const titleBonus = this.getActiveTitleBonus();
      titleCritBonus = titleBonus.critChance || 0;

      // FUNCTIONAL: Sum crit bonuses, cap at 50% (0.50)
      const totalCritChance = Math.min(baseAgilityBonus + titleCritBonus, 0.5);
      cappedCritBonus = totalCritChance; // Alias for clarity
      enhancedAgilityBonus = baseAgilityBonus; // Agility-only crit chance

      // Prepare data object (ensure all values are serializable numbers)
      const agilityData = {
        bonus: isNaN(cappedCritBonus) ? 0 : Number(cappedCritBonus.toFixed(6)),
        baseBonus: isNaN(baseAgilityBonus) ? 0 : Number(baseAgilityBonus.toFixed(6)),
        titleCritBonus: isNaN(titleCritBonus) ? 0 : Number(titleCritBonus.toFixed(6)),
        agility: agilityStat,
        perceptionEnhanced: false,
        capped: totalCritChance >= 0.5, // Indicate if it was capped at 50%
      };

      // Always save agility bonus (even if 0) so CriticalHit knows current agility
      BdApi.Data.save('SoloLevelingStats', 'agilityBonus', agilityData);

      // Only log if there's a bonus
      if (cappedCritBonus > 0) {
        const bonusParts = [];
        if (enhancedAgilityBonus > 0)
          bonusParts.push(`Agility: +${(enhancedAgilityBonus * 100).toFixed(1)}%`);
        if (titleCritBonus > 0) bonusParts.push(`Title: +${(titleCritBonus * 100).toFixed(1)}%`);
        this.debugLog(
          'AGILITY_BONUS',
          `Crit bonus available for CriticalHit: +${(cappedCritBonus * 100).toFixed(
            1
          )}% (${bonusParts.join(', ')})`
        );
      }

      // Save PER burst profile for CriticalHit (PER now controls multi-hit burst size, not crit chance)
      try {
        const perceptionProfile = this.getPerceptionBurstProfile();
        const perceptionData = {
          perception: perceptionProfile.perception,
          effectivePerception: perceptionProfile.perception,
          burstChance: Number(perceptionProfile.burstChance.toFixed(6)),
          maxHits: perceptionProfile.maxHits,
          jackpotChance: Number(perceptionProfile.jackpotChance.toFixed(6)),
          updatedAt: Date.now(),
        };

        BdApi.Data.save('SoloLevelingStats', 'perceptionBurst', perceptionData);

        // Backward compatibility payload for older readers: luck no longer affects crit chance.
        BdApi.Data.save('SoloLevelingStats', 'luckBonus', {
          bonus: 0,
          perception: perceptionProfile.perception,
          luck: perceptionProfile.perception,
          luckBuffs: [],
          totalBuffPercent: 0,
        });

        this.debugLog('PERCEPTION_BURST', 'Perception burst profile synced for CriticalHit', {
          perception: perceptionProfile.perception,
          burstChance: `${(perceptionProfile.burstChance * 100).toFixed(1)}%`,
          maxHits: perceptionProfile.maxHits,
          jackpotChance: `${(perceptionProfile.jackpotChance * 100).toFixed(2)}%`,
        });
      } catch (error) {
        this.debugError('SAVE_PERCEPTION_BURST', error);
      }
    } catch (error) {
      // Error saving bonus - log but don't crash
      this.debugError('SAVE_AGILITY_BONUS', error);
    }
  }

  saveAgilityBonus() {
    // Alias for integrateWithCriticalHit for backward compatibility
    this.integrateWithCriticalHit();
  }

  migrateData() {
    // Migration logic for future updates
    try {
      // Ensure stats object exists
      if (!this.settings.stats || typeof this.settings.stats !== 'object') {
        // CRITICAL: Use deep copy to prevent defaultSettings corruption
        this.settings.stats = JSON.parse(JSON.stringify(this.defaultSettings.stats));
      } else {
        // Ensure all stat properties exist
        const defaultStats = this.defaultSettings.stats;
        Object.keys(defaultStats).forEach((key) => {
          if (
            this.settings.stats[key] === undefined ||
            typeof this.settings.stats[key] !== 'number'
          ) {
            this.settings.stats[key] = defaultStats[key];
          }
        });
      }

      // Ensure activity object exists
      if (!this.settings.activity || typeof this.settings.activity !== 'object') {
        // CRITICAL: Use deep copy to prevent defaultSettings corruption
        this.settings.activity = JSON.parse(JSON.stringify(this.defaultSettings.activity));
      } else {
        // Ensure all activity properties exist
        const defaultActivity = this.defaultSettings.activity;
        Object.keys(defaultActivity).forEach((key) => {
          if (this.settings.activity[key] === undefined) {
            this.settings.activity[key] = defaultActivity[key];
          }
        });
      }

      // Migration: Convert luck to perception
      if (this.settings.stats.luck !== undefined && this.settings.stats.perception === undefined) {
        this.settings.stats.perception = this.settings.stats.luck;
        delete this.settings.stats.luck;
      }
      if (this.settings.luckBuffs !== undefined && this.settings.perceptionBuffs === undefined) {
        this.settings.perceptionBuffs = this.settings.luckBuffs;
        delete this.settings.luckBuffs;
      }

      // Ensure perceptionBuffs array exists
      if (!Array.isArray(this.settings.perceptionBuffs)) {
        this.settings.perceptionBuffs = [];
      }

      // Ensure channelsVisited is a Set
      if (!(this.settings.activity.channelsVisited instanceof Set)) {
        if (Array.isArray(this.settings.activity.channelsVisited)) {
          this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
        } else {
          this.settings.activity.channelsVisited = new Set();
        }
      }

      if (
        this.settings.unallocatedStatPoints === undefined ||
        typeof this.settings.unallocatedStatPoints !== 'number'
      ) {
        this.settings.unallocatedStatPoints = 0;
      }
    } catch (error) {
      this.debugError('MIGRATE_DATA', error);
      // Fallback to defaults if migration fails
      // CRITICAL: Use deep copy to prevent defaultSettings corruption
      this.settings.stats = JSON.parse(JSON.stringify(this.defaultSettings.stats));
      this.settings.activity = JSON.parse(JSON.stringify(this.defaultSettings.activity));
      this.settings.activity.channelsVisited = new Set();
      this.settings.perceptionBuffs = [];
      this.settings.unallocatedStatPoints = 0;
    }
  }

  getMessageInputElement() {
    // Cache selector list to avoid allocations on repeated lookups
    if (!this._messageInputSelectors) {
      this._messageInputSelectors = [
        'div[contenteditable="true"][role="textbox"]', // Modern Discord uses contenteditable divs
        'div[contenteditable="true"]',
        '[class*="slateTextArea"]',
        '[class*="textArea"]',
        '[class*="textValue"]',
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="message"]',
        '[class*="messageInput"]',
        '[class*="input"]',
        '[data-slate-editor="true"]', // Slate editor
      ];
    }

    for (const selector of this._messageInputSelectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    // Also try to find by role attribute
    const roleInput = document.querySelector('[role="textbox"]');
    if (roleInput && roleInput.contentEditable === 'true') {
      this.debugLog('FIND_INPUT', 'Found input by role="textbox"');
      return roleInput;
    }

    return null;
  }

  getMessageContainerElementForObserving() {
    if (!this._messageContainerSelectors) {
      this._messageContainerSelectors = [
        '[class*="messagesWrapper"]',
        '[class*="scrollerInner"]',
        '[class*="scroller"]',
      ];
    }

    for (const selector of this._messageContainerSelectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    return null;
  }

  getCurrentUserIdForMessageDetection() {
    // PRIORITY: Webpack UserStore > React fiber > stored user id
    try {
      const now = Date.now();
      if (
        this._currentUserIdCacheTime &&
        now - this._currentUserIdCacheTime < 5000 &&
        this._currentUserIdCache
      ) {
        return this._currentUserIdCache;
      }

      // Method 1: Try webpack UserStore (most reliable)
      if (this.webpackModuleAccess && this.webpackModules.UserStore) {
        const storeUserId = this.getCurrentUserIdFromStore();
        if (storeUserId) {
          this._currentUserIdCache = storeUserId;
          this._currentUserIdCacheTime = now;
          return storeUserId;
        }
      }

      // Method 2: Fallback to React fiber traversal (if webpack unavailable)
      const userElement =
        document.querySelector('[class*="avatar"]') || document.querySelector('[class*="user"]');
      if (userElement) {
        const reactKey = this.getReactFiberKey(userElement);
        if (reactKey) {
          let fiber = userElement[reactKey];
          for (let i = 0; i < 10 && fiber; i++) {
            if (fiber.memoizedProps?.user?.id) return fiber.memoizedProps.user.id;
            fiber = fiber.return;
          }
        }
      }

      // Method 3: Use stored user ID as final fallback
      const fallback = this.settings.ownUserId || null;
      this._currentUserIdCache = fallback;
      this._currentUserIdCacheTime = now;
      return fallback;
    } catch (error) {
      this.debugError('GET_USER_ID', error);
      return this.settings.ownUserId || null;
    }
  }

  setupMessageObserver({ messageContainer, currentUserId }) {
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }

    const self = this;
    this.messageObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;

          // Avoid attaching ad-hoc properties to DOM nodes in hot paths.
          // Store metadata in a WeakMap so GC can collect nodes naturally.
          if (!self._domNodeAddedTime) {
            self._domNodeAddedTime = new WeakMap();
          }
          self._domNodeAddedTime.set(node, Date.now());

          // Check if this is a message element
          const messageElement = node.classList?.contains('message')
            ? node
            : node.querySelector?.('[class*="message"]') || node.closest?.('[class*="message"]');

          // Also mark message element with added time
          if (messageElement && messageElement !== node) {
            self._domNodeAddedTime.set(messageElement, Date.now());
          }

          if (!messageElement) return;

          // Check if this is our own message
          const isOwnMessage = this.isOwnMessage(messageElement, currentUserId);
          self.debugLog('MUTATION_OBSERVER', 'Message element detected', {
            hasMessageElement: !!messageElement,
            isOwnMessage,
            hasCurrentUserId: !!currentUserId,
          });

          if (!isOwnMessage) return;

          const messageId = self.getMessageId(messageElement);
          self.debugLog('MUTATION_OBSERVER', 'Own message detected via MutationObserver', {
            messageId,
            alreadyProcessed: messageId ? self.processedMessageIds.has(messageId) : false,
            elementClasses: messageElement.classList?.toString() || '',
            usingWebpack: self.webpackModuleAccess,
          });

          // Skip DOM processing if webpack patches are handling it (fallback mode)
          if (self.webpackModuleAccess && messageId && self.processedMessageIds.has(messageId)) {
            return;
          }

          if (!messageId || self.processedMessageIds.has(messageId)) {
            self.debugLog('MUTATION_OBSERVER', 'Message already processed or no ID', {
              messageId,
              hasId: !!messageId,
            });
            return;
          }

          // Double-check: Only process if we have strong confirmation
          const hasReactProps = this.doesMessageFiberMatchAuthorId(messageElement, currentUserId);

          const hasExplicitYou = (() => {
            const usernameElement =
              messageElement.querySelector('[class*="username"]') ||
              messageElement.querySelector('[class*="author"]');
            if (usernameElement) {
              const usernameText = usernameElement.textContent?.trim() || '';
              return (
                usernameText.toLowerCase() === 'you' ||
                usernameText.toLowerCase().startsWith('you ')
              );
            }
            return false;
          })();

          if (!hasReactProps && !hasExplicitYou) {
            self.debugLog(
              'MUTATION_OBSERVER',
              'Skipping: Insufficient confirmation for MutationObserver detection',
              {
                hasReactProps,
                hasExplicitYou,
                messageId,
              }
            );
            return;
          }

          // Check message timestamp to prevent processing old chat history
          const messageTimestamp = self.getMessageTimestamp(messageElement);
          const isNewMessage = messageTimestamp && messageTimestamp >= (self.pluginStartTime || 0);
          if (!isNewMessage && messageTimestamp) {
            self.debugLog('MUTATION_OBSERVER', 'Skipping old message from chat history', {
              messageId,
              messageTimestamp,
              pluginStartTime: self.pluginStartTime,
              age: Date.now() - messageTimestamp,
            });
            return;
          }

          self.addProcessedMessageId(messageId);
          self.lastMessageId = messageId;
          self.lastMessageElement = messageElement;

          // Get message text
          const messageText =
            messageElement.textContent?.trim() ||
            messageElement.querySelector('[class*="messageContent"]')?.textContent?.trim() ||
            messageElement.querySelector('[class*="textValue"]')?.textContent?.trim() ||
            '';

          if (messageText.length > 0 && !self.isSystemMessage(messageElement)) {
            self.debugLog('MUTATION_OBSERVER', 'Processing own message (confirmed)', {
              messageId,
              length: messageText.length,
              preview: messageText.substring(0, 50),
              confirmationMethod: hasReactProps ? 'React props' : 'Explicit You',
              isNewMessage,
              messageTimestamp,
            });
            const timeoutId = setTimeout(() => {
              self._messageProcessTimeouts?.delete(timeoutId);
              if (!self._isRunning) return;
              const context = self.buildMessageContextFromView(messageText, messageElement);
              self.processMessageSent(messageText, context);
            }, 100);
            if (!self._messageProcessTimeouts) {
              self._messageProcessTimeouts = new Set();
            }
            self._messageProcessTimeouts.add(timeoutId);
          } else {
            self.debugLog('MUTATION_OBSERVER', 'Message skipped', {
              reason: messageText.length === 0 ? 'empty' : 'system_message',
            });
          }
        });
      });

      // Track channel visits
      this.trackChannelVisit();
    });

    this.messageObserver.observe(messageContainer, {
      childList: true,
      subtree: true,
    });

    this.debugLog('SETUP_MESSAGE_DETECTION', 'MutationObserver set up for message detection');
  }

  setupInputMonitoringForMessageSending({ maxRetries = 10 } = {}) {
    if (this.messageInputHandler?.element?.isConnected) return;

    let retryCount = 0;
    const attemptSetup = () => {
      const messageInput = this.getMessageInputElement();
      if (!messageInput) {
        retryCount++;
        if (retryCount < maxRetries) {
          this.debugLog(
            'SETUP_INPUT',
            `Message input not found, retrying (${retryCount}/${maxRetries})`
          );
          if (!this._setupInputRetryTimeout) {
            this._setupInputRetryTimeout = setTimeout(() => {
              this._setupInputRetryTimeout = null;
              attemptSetup();
            }, 1000);
          }
        } else {
          this.debugLog(
            'SETUP_INPUT',
            'Message input not found after max retries, will rely on MutationObserver'
          );
        }
        return;
      }

      retryCount = 0; // Reset on success
      this.debugLog('SETUP_INPUT', 'Found message input, setting up monitoring');

      let lastInputValue = '';
      let inputTimeout = null;

      // PERF: Use textContent only — innerText forces full layout reflow on every keystroke.
      // textContent is sufficient for detecting message content; it just lacks line breaks
      // from <br> elements which don't matter for our send-detection logic.
      const handleInput = () => {
        let currentValue = '';
        if (messageInput.tagName === 'TEXTAREA') {
          currentValue = messageInput.value || '';
        } else if (messageInput.contentEditable === 'true') {
          currentValue =
            messageInput.textContent ||
            messageInput.querySelector('[class*="textValue"]')?.textContent ||
            '';
        } else {
          currentValue =
            messageInput.value || messageInput.textContent || '';
        }
        lastInputValue = currentValue;

        if (inputTimeout) clearTimeout(inputTimeout);
      };

      const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          // If webpack patches are enabled, prefer store-based processing.
          // BUT: some Discord builds don't provide full message objects at patch time.
          // Fallback: if store-based path doesn't confirm within a short window, process via input text.
          if (this.webpackModuleAccess && this.messageStorePatch) {
            let messageText = '';
            try {
              // PERF: Use textContent only (innerText forces layout reflow).
              // Enter key fires once so less critical, but consistent with handleInput.
              messageText =
                (messageInput.textContent && messageInput.textContent.trim()) ||
                lastInputValue.trim();
            } catch (e) {
              messageText = lastInputValue.trim();
            }

            if (!messageText) return;

            const hash = this.hashString(messageText.substring(0, 2000));
            this._pendingSendFallback = { at: Date.now(), hash };

            this._messageProcessTimeouts = this._messageProcessTimeouts || new Set();
            const fallbackTimeoutId = setTimeout(() => {
              this._messageProcessTimeouts?.delete(fallbackTimeoutId);
              if (!this._isRunning) return;
              const pending = this._pendingSendFallback;
              if (!pending || pending.hash !== hash) return;

              // No store confirmation observed -> award XP via input path
              this._pendingSendFallback = null;
              this.processMessageSent(messageText, this.buildMessageContextFromView(messageText));
            }, 350);
            this._messageProcessTimeouts.add(fallbackTimeoutId);
            return;
          }

          let messageText = '';
          try {
            messageText = (messageInput.textContent && messageInput.textContent.trim()) || lastInputValue.trim();
          } catch (e) {
            messageText = lastInputValue.trim();
          }

          if (messageText.length > 2000) {
            this.debugLog('INPUT_DETECTION', 'Message too long, likely capturing wrong content', {
              length: messageText.length,
              preview: messageText.substring(0, 100),
            });
            const textNodes = [];
            const walker = document.createTreeWalker(
              messageInput,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            let node;
            while ((node = walker.nextNode())) {
              const text = node.textContent?.trim();
              if (text && text.length > 0 && text.length < 2000) {
                textNodes.push(text);
              }
            }
            if (textNodes.length > 0) {
              messageText = textNodes.join(' ').trim();
              if (messageText.length > 2000) messageText = messageText.substring(0, 2000);
            } else {
              messageText = messageText.substring(0, 2000);
            }
          }

          if (messageText.length > 0 && messageText.length <= 2000) {
            this.debugLog('INPUT_DETECTION', 'Enter key pressed, message detected', {
              length: messageText.length,
              preview: messageText.substring(0, 50),
            });

            this.debugLog('INPUT_DETECTION', 'Processing message immediately');
            this._messageProcessTimeouts = this._messageProcessTimeouts || new Set();

            const processSendTimeoutId = setTimeout(() => {
              this._messageProcessTimeouts?.delete(processSendTimeoutId);
              if (!this._isRunning) return;
              this.processMessageSent(messageText, this.buildMessageContextFromView(messageText));
              lastInputValue = '';
            }, 100);
            this._messageProcessTimeouts.add(processSendTimeoutId);

            const confirmSendTimeoutId = setTimeout(() => {
              this._messageProcessTimeouts?.delete(confirmSendTimeoutId);
              if (!this._isRunning) return;
              let currentValue = '';
              if (messageInput.tagName === 'TEXTAREA') {
                currentValue = messageInput.value || '';
              } else {
                currentValue = messageInput.textContent || '';
              }
              if (!currentValue || currentValue.trim().length === 0) {
                this.debugLog('INPUT_DETECTION', 'Input cleared, message confirmed sent');
              } else {
                this.debugLog('INPUT_DETECTION', 'Input still has content, may be editing');
              }
            }, 500);
            this._messageProcessTimeouts.add(confirmSendTimeoutId);
          }
        }
      };

      messageInput.addEventListener('input', handleInput, true);
      messageInput.addEventListener('keydown', handleKeyDown, true);

      const handlePaste = () => {
        this._messageProcessTimeouts = this._messageProcessTimeouts || new Set();
        const pasteTimeoutId = setTimeout(() => {
          this._messageProcessTimeouts?.delete(pasteTimeoutId);
          if (!this._isRunning) return;
          handleInput();
        }, 50);
        this._messageProcessTimeouts.add(pasteTimeoutId);
      };
      messageInput.addEventListener('paste', handlePaste, true);

      // PERF: inputObserver removed entirely. It was observing the message input
      // with childList+subtree, which fires on EVERY character in contentEditable
      // (Discord modifies DOM tree structure per keystroke). The input/keydown event
      // listeners above already track all typing — the observer was pure overhead.

      this.messageInputHandler = {
        handleInput,
        handleKeyDown,
        handlePaste,
        observer: null,
        element: messageInput,
      };
      this.debugLog('SETUP_INPUT', 'Input monitoring set up successfully');
      this.inputMonitoringActive = true;
    };

    attemptSetup();
  }

  startObserving() {
    const messageContainer = this.getMessageContainerElementForObserving();

    if (!messageContainer) {
      // Wait and try again
      if (!this._startObservingRetryTimeout) {
        this._startObservingRetryTimeout = setTimeout(() => {
          this._startObservingRetryTimeout = null;
          this.startObserving();
        }, 1000);
      }
      return;
    }

    // Cache message container for later lookups (crit detection, etc.)
    this._messageContainerEl = messageContainer;

    // Track processed messages to avoid duplicates
    this.processedMessageIds = this.processedMessageIds || new Set();

    const currentUserId = this.getCurrentUserIdForMessageDetection();

    // Only use DOM observation if webpack modules are not available
    // Webpack patches handle message tracking more reliably
    if (this.webpackModuleAccess) {
      this.debugLog('START_OBSERVING', 'Using webpack patches, DOM observer as fallback only');
      // Still set up observer as fallback, but it will be less active
    }

    // Observer-based fallback (and for crit context)
    this.setupMessageObserver({ messageContainer, currentUserId });

    // Primary method: Detect message sends via input
    this.setupInputMonitoringForMessageSending({ maxRetries: 10 });
  }

  getMessageId(messageElement) {
    // Try to get a unique ID for the message (improved method)
    let messageId =
      messageElement.getAttribute('data-list-item-id') || messageElement.getAttribute('id');

    // Try React props (Discord stores message data in React)
    if (!messageId) {
      try {
        const reactKey = this.getReactFiberKey(messageElement);
        if (reactKey) {
          let fiber = messageElement[reactKey];
          for (let i = 0; i < 10 && fiber; i++) {
            if (fiber.memoizedProps?.message?.id) {
              messageId = fiber.memoizedProps.message.id;
              break;
            }
            if (fiber.memoizedState?.message?.id) {
              messageId = fiber.memoizedState.message.id;
              break;
            }
            fiber = fiber.return;
          }
        }
      } catch (e) {
        // React access failed, continue to fallback
      }
    }

    // Fallback: create hash from content + timestamp
    if (!messageId) {
      const content = messageElement.textContent?.trim() || '';
      const timestamp = Date.now();
      const hashContent = `${content.substring(0, 100)}:${timestamp}`;
      let hash = 0;
      for (let i = 0; i < hashContent.length; i++) {
        const char = hashContent.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      messageId = `hash_${Math.abs(hash)}`;
    }

    return messageId;
  }

  getMessageTimestamp(messageElement) {
    try {
      // Method 1: Try React props (most reliable)
      const reactKey = this.getReactFiberKey(messageElement);
      if (reactKey) {
        let fiber = messageElement[reactKey];
        for (let i = 0; i < 20 && fiber; i++) {
          const timestamp =
            fiber.memoizedProps?.message?.timestamp ||
            fiber.memoizedState?.message?.timestamp ||
            fiber.memoizedProps?.message?.createdTimestamp;
          if (timestamp) {
            // Discord timestamps can be in seconds or milliseconds
            return typeof timestamp === 'string'
              ? new Date(timestamp).getTime()
              : timestamp < 1000000000000
              ? timestamp * 1000
              : timestamp;
          }
          fiber = fiber.return;
        }
      }

      // Method 2: Try to find timestamp element in DOM
      const timestampElement = messageElement.querySelector('[class*="timestamp"]');
      if (timestampElement) {
        const timeAttr =
          timestampElement.getAttribute('datetime') || timestampElement.getAttribute('title');
        if (timeAttr) {
          const parsed = new Date(timeAttr).getTime();
          if (!isNaN(parsed)) return parsed;
        }
      }

      // Method 3: Check if message was just added (within last 5 seconds = likely new)
      // This is a fallback for messages without timestamp data
      const addedTime = this._domNodeAddedTime?.get(messageElement);
      const elementAge = Date.now() - (addedTime || Date.now());
      if (elementAge < 5000) {
        // Assume it's new if added within last 5 seconds
        return Date.now();
      }

      return null;
    } catch (error) {
      this.debugError('GET_MESSAGE_TIMESTAMP', error);
      return null;
    }
  }

  isSystemMessage(messageElement) {
    // Check if message is a system message
    const systemClasses = ['systemMessage', 'systemText', 'joinMessage', 'leaveMessage'];
    const classes = Array.from(messageElement.classList || []);
    return classes.some((c) => systemClasses.some((sc) => c.includes(sc)));
  }

  isOwnMessage(messageElement, currentUserId) {
    try {
      this.debugLog('IS_OWN_MESSAGE', 'Checking if message is own', {
        hasCurrentUserId: !!currentUserId,
        elementClasses: messageElement.classList?.toString() || '',
      });

      // PRIMARY METHOD 1: Check React props for user ID match (MOST RELIABLE)
      if (this.doesMessageFiberMatchAuthorId(messageElement, currentUserId)) {
        this.debugLog('IS_OWN_MESSAGE', 'CONFIRMED: Detected via React props user ID match', {
          currentUserId,
        });
        return true;
      }

      // PRIMARY METHOD 2: Check for explicit "You" indicator (RELIABLE)
      const usernameElement =
        messageElement.querySelector('[class*="username"]') ||
        messageElement.querySelector('[class*="author"]') ||
        messageElement.querySelector('[class*="usernameInner"]');

      if (usernameElement) {
        const usernameText = usernameElement.textContent?.trim() || '';
        // Only trust explicit "You" text, not class names
        if (usernameText.toLowerCase() === 'you' || usernameText.toLowerCase().startsWith('you ')) {
          this.debugLog('IS_OWN_MESSAGE', 'CONFIRMED: Detected via explicit "You" indicator', {
            usernameText,
          });
          return true;
        }
      }

      // SECONDARY: Require MULTIPLE strong indicators together (more strict)
      const messageClasses = messageElement.classList?.toString() || '';
      const hasOwnClass =
        messageClasses.includes('own') || messageElement.closest('[class*="own"]') !== null;
      const hasCozyClass = messageClasses.includes('cozy');
      const hasRightAligned = messageClasses.includes('right');
      const hasOwnTimestamp = messageElement
        .querySelector('[class*="timestamp"]')
        ?.classList?.toString()
        .includes('own');

      // Require at least 2 strong indicators
      let indicatorCount = 0;
      if (hasOwnClass) indicatorCount++;
      if (hasOwnTimestamp) indicatorCount++;
      if (hasRightAligned && hasCozyClass) indicatorCount++; // Both together = stronger

      if (indicatorCount >= 2) {
        this.debugLog('IS_OWN_MESSAGE', 'CONFIRMED: Multiple strong indicators', {
          hasOwnClass,
          hasOwnTimestamp,
          hasRightAligned,
          hasCozyClass,
          indicatorCount,
        });
        return true;
      }

      // If we don't have strong confirmation, return false
      this.debugLog('IS_OWN_MESSAGE', 'NOT OWN: Insufficient indicators', {
        hasOwnClass,
        hasOwnTimestamp,
        hasRightAligned,
        hasCozyClass,
        indicatorCount,
        hasCurrentUserId: !!currentUserId,
      });
      return false;
    } catch (error) {
      this.debugError('IS_OWN_MESSAGE', error);
      return false; // Default to false on error
    }
  }

  // ── §3.8 XP & LEVELING SYSTEM ────────────────────────────────────────────
  // Entry point: processMessageSent() → awardXP() (8-stage pipeline)
  // Stages: base XP → stat% → title bonus → active skills → milestones
  //         → diminishing returns → crit bonus → rank multiplier

  runMessageProcessingStage(stageFn) {
    try {
      stageFn();
    } catch (error) {
      this.debugError('MESSAGE_STAGE', error);
    }
  }

  processMessageSent(messageText, messageContext = null) {
    if (!this._isRunning || typeof messageText !== 'string' || messageText.length === 0) return;

    try {
      const resolvedContext =
        messageContext && typeof messageContext === 'object'
          ? messageContext
          : this.buildMessageContextFromView(messageText);

      const now = Date.now();
      const recentWindowMs = 2000;
      const channelScope = resolvedContext?.channelId || this.getCurrentChannelId() || 'global';
      const hashKey = `msg_${channelScope}_${this.hashString(messageText.substring(0, 2000))}`;

      // Defensive: ensure Map semantics even if an older version left a Set here
      (!this.recentMessages || typeof this.recentMessages.get !== 'function') &&
        (this.recentMessages = new Map());

      // Prune old entries (keep window bounded)
      if (this.recentMessages.size > 100) {
        for (const [k, ts] of this.recentMessages.entries()) {
          now - ts > recentWindowMs && this.recentMessages.delete(k);
        }
      }

      const lastProcessedAt = this.recentMessages.get(hashKey);
      if (lastProcessedAt && now - lastProcessedAt < recentWindowMs) return;
      this.recentMessages.set(hashKey, now);

      const messageLength = Math.min(messageText.length, 2000);

      this.runMessageProcessingStage(() => {
        this.settings.activity.messagesSent++;
        this.settings.activity.charactersTyped += messageLength;
      });
      this.runMessageProcessingStage(() => this.trackChannelVisit());
      this.runMessageProcessingStage(() => this.awardXP(messageText, messageLength, resolvedContext));
      this.runMessageProcessingStage(() => {
        this.updateQuestProgress('messageMaster', 1);
        this.updateQuestProgress('characterChampion', messageLength);
        this.updateQuestProgress('perfectStreak', 1);
      });
      this.runMessageProcessingStage(() => this.processNaturalStatGrowth());
      this.runMessageProcessingStage(() => this.checkAchievements());

      // XP gain already triggers immediate save, this is only a periodic quest-progress flush.
      if (Date.now() - this.lastSaveTime > 5000) {
        this.runMessageProcessingStage(() => this.saveSettings());
      }
    } catch (error) {
      this.debugError('PROCESS_MESSAGE', error);
    }
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  handleChannelChange(lastChannelId) {
    try {
      const channelInfo = this.getCurrentChannelInfo();

      if (!channelInfo) {
        this.debugLog('HANDLE_CHANNEL_CHANGE', 'No channel info after change', {
          currentUrl: window.location.href,
        });
        return lastChannelId;
      }

      const { channelId, channelType, serverId, isDM } = channelInfo;

      // Only track if channel actually changed
      if (channelId !== lastChannelId) {
        // Reduced verbosity - only log if verbose mode enabled (frequent operation)
        this.debugLog('HANDLE_CHANNEL_CHANGE', 'Channel changed detected', {
          oldChannelId: lastChannelId,
          newChannelId: channelId,
          channelType,
          serverId: serverId || 'N/A (DM)',
          isDM,
        });

        // Track the new channel visit
        this.trackChannelVisit();

        // Re-evaluate chat UI visibility for new channel
        if (this._isGuildTextChannel()) {
          // Guild text channel — ensure UI is present
          if (!document.getElementById('sls-chat-ui')) {
            this.createChatUI();
          }
        } else {
          // Non-guild-text channel — remove UI
          this.removeChatUI();
        }

        // Update last channel ID
        return channelId;
      } else {
        this.debugLog('HANDLE_CHANNEL_CHANGE', 'Same channel, no change', {
          channelId,
        });
      }
    } catch (error) {
      this.debugError('HANDLE_CHANNEL_CHANGE', error, {
        currentUrl: window.location.href,
      });
    }

    return lastChannelId;
  }

  startAutoSave() {
    // Avoid duplicate timers/listeners on reloads
    if (this._autoSaveHandlers) return;

    // Also save on page unload (before Discord closes)
    const beforeUnloadHandler = () => {
      this.saveSettings(true);
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);

    // Save on visibility change (when tab loses focus)
    const visibilityChangeHandler = () => document.hidden && this.saveSettings(true);
    document.addEventListener('visibilitychange', visibilityChangeHandler);

    this._autoSaveHandlers = {
      beforeUnloadHandler,
      visibilityChangeHandler,
    };
  }

  // ── §3.9 NOTIFICATION SYSTEM ─────────────────────────────────────────────
  // Toast-style notifications: success, error, warning, level-up
  // Prefers SoloLevelingToasts plugin, falls back to BdApi.showToast

  showNotification(message, type = 'info', timeout = 3000) {
    try {
      // Prefer SoloLevelingToasts for animated notifications if available.
      // Fallback to BdApi.showToast otherwise.
      const now = Date.now();
      const cacheTtlMs = 3000;
      if (!this._toastPluginCacheTime || now - this._toastPluginCacheTime > cacheTtlMs) {
        this._toastPluginCacheTime = now;
        this._toastPluginCache = BdApi?.Plugins?.get?.('SoloLevelingToasts')?.instance || null;
      }
      const slToasts = this._toastPluginCache;
      if (slToasts?.showToast) {
        slToasts.showToast(message, type, timeout);
        return;
      }
      if (BdApi && typeof BdApi.showToast === 'function') {
        BdApi.showToast(message, {
          type: type,
          timeout: timeout,
        });
      }
    } catch (error) {
      this.debugError('NOTIFICATION', error);
    }
  }

  // ── §3.10 FORMATTING HELPERS ─────────────────────────────────────────────
  // HTML escaping, number formatting, time formatting

  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── §3.11 PLUGIN LIFECYCLE ───────────────────────────────────────────────
  // start(): Load settings → webpack → observers → activity → UI
  // stop():  Remove UI → unpatch → stop observers → save → cleanup

  /**
   * Load SoloLevelingUtils shared library (React injection, toolbar registry, etc.)
   */
  _loadSLUtils() {
    this._SLUtils = null;
    try {
      if (typeof window !== 'undefined' && window.SoloLevelingUtils) {
        this._SLUtils = window.SoloLevelingUtils;
        return;
      }
      const path = require('path');
      const pluginsDir = BdApi.Plugins?.folder || path.join(BdApi.getPath?.() || '', 'plugins');
      const utilsPath = path.join(pluginsDir, 'SoloLevelingUtils.js');
      delete require.cache[require.resolve?.(utilsPath)];
      this._SLUtils = require(utilsPath);
      if (!window.SoloLevelingUtils) window.SoloLevelingUtils = this._SLUtils;
    } catch (_) {
      this._SLUtils = null;
    }
  }

  async start() {
    try {
      this.debugLog('START', 'Plugin starting...');

      // Record plugin start time to prevent processing old messages
      this.pluginStartTime = Date.now();
      this._isRunning = true;
      this._loadSLUtils();

      // Init React components factory (v3.0.0)
      this._chatUIComponents = buildChatUIComponents(this);

      this.debugLog('START', 'Plugin start time recorded', { startTime: this.pluginStartTime });

      // ============================================================================
      // PERFORMANCE OPTIMIZATION: Initialize systems
      // ============================================================================

      // Initialize DOM cache (eliminates 84 querySelector calls per update!)
      this.initDOMCache();

      // FUNCTIONAL: Safe method binding (NO IF-ELSE!)
      // Only binds methods that exist, returns no-op for missing methods
      const bindIfExists = (methodName, wait, throttleOrDebounce) => {
        const method = this[methodName];
        const noOp = () => this.debugLog('BIND_SKIP', `Method ${methodName} not found`);
        return method ? throttleOrDebounce(method.bind(this), wait) : noOp;
      };

      // Create throttled versions (4x per second max)
      this.throttled.checkDailyQuests = bindIfExists(
        'checkDailyQuests',
        500,
        this.throttle.bind(this)
      );

      // Create debounced versions (wait 1 sec after last call)
      this.debounced.saveSettings = bindIfExists('saveSettings', 1000, this.debounce.bind(this));

      this.debugLog('START', 'Performance optimizations initialized');

      // Initialize UnifiedSaveManager (IndexedDB)
      if (this.saveManager) {
        try {
          await this.saveManager.init();
          this.debugLog('START', 'UnifiedSaveManager initialized (IndexedDB)');
        } catch (error) {
          this.debugError('START', 'Failed to initialize UnifiedSaveManager', error);
          this.saveManager = null; // Fallback to BdApi.Data
        }
      }

      // STARTUP SAVE GUARD: block all saves until loadSettings() completes.
      // Also reset first-save persisted-progress probe for this session.
      this._startupLoadComplete = false;
      this._startupProgressProbeComplete = false;
      this._hasRealProgress = false;

      // Load settings (will use IndexedDB if available, fallback to BdApi.Data)
      await this.loadSettings();
      this.debugLog('START', 'Settings loaded', {
        level: this.settings.level,
        rank: this.settings.rank,
        totalXP: this.settings.totalXP,
      });

      // Initialize date values if not set
      if (!this.settings.activity.lastActiveTime) {
        this.settings.activity.lastActiveTime = Date.now();
      }
      if (!this.settings.activity.sessionStartTime) {
        this.settings.activity.sessionStartTime = Date.now();
      }
      if (!this.settings.dailyQuests.lastResetDate) {
        this.settings.dailyQuests.lastResetDate = new Date().toDateString();
      }

      // Initialize rank if not set
      if (!this.settings.rank) {
        this.settings.rank = 'E';
      }
      if (!this.settings.rankHistory) {
        this.settings.rankHistory = [];
      }

      // Check for rank promotion on startup
      this.checkRankPromotion();

      this.debugLog('START', 'Plugin started successfully');

      // Expose backup helpers to console for quick checks/restores
      this.registerBackupConsoleHooks();

      // Initialize shadow power cache from saved settings or default to '0'
      // Also check ShadowArmy's cached value as fallback
      const shadowArmyPlugin = BdApi.Plugins.get('ShadowArmy');
      const shadowArmyCachedPower = shadowArmyPlugin?.instance?.settings?.cachedTotalPower;

      if (shadowArmyCachedPower !== undefined && shadowArmyCachedPower > 0) {
        // Use ShadowArmy's cached value if available and valid
        this.cachedShadowPower = shadowArmyCachedPower.toLocaleString();
        this.settings.cachedShadowPower = this.cachedShadowPower;
        this.debugLog('START', 'Loaded shadow power from ShadowArmy cache', {
          cachedShadowPower: this.cachedShadowPower,
          source: 'ShadowArmy',
        });
      } else {
        // Fallback to SoloLevelingStats cached value
        this.cachedShadowPower = this.settings.cachedShadowPower || '0';
        this.debugLog('START', 'Loaded cached shadow power from settings', {
          cachedShadowPower: this.cachedShadowPower,
          source: 'SoloLevelingStats',
        });
      }

      // Initialize shadow power immediately on startup (don't wait for interval)
      if (typeof this.updateShadowPower === 'function') {
        this.updateShadowPower().catch((error) => {
          this.debugError('START', 'Failed to initialize shadow power', error);
        });
      }
      this.setupShadowPowerObserver?.();

      // Listen for shadow extraction events from ShadowArmy
      this._shadowExtractedHandler = () => {
        // Update shadow power when a new shadow is extracted
        this.updateShadowPower?.();
      };
      document.addEventListener('shadowExtracted', this._shadowExtractedHandler);

      // Fallback: Update shadow power periodically (safe call with optional chaining)
      this.shadowPowerInterval = setInterval(() => {
        this.updateShadowPower?.();
      }, 5000);

      // PERIODIC BACKUP SAVE (Every 30 seconds)
      // Safety net — only saves if settings actually changed since last save
      this.periodicSaveInterval = setInterval(() => {
        if (this._settingsDirty) {
          this.debugLog('PERIODIC_SAVE', 'Backup auto-save triggered');
          this.saveSettings();
        }
      }, this.saveInterval); // 30 seconds (defined in constructor)

      if (typeof this.getSettingsPanel !== 'function') {
        this.debugError('DEBUG', new Error('getSettingsPanel() method NOT FOUND!'));
      }
    } catch (error) {
      this.debugError('START', error, { phase: 'initialization' });
    }

    const levelInfo = this.getCurrentLevel();
    if (this.settings.level !== levelInfo.level) {
      this.settings.level = levelInfo.level;
      this.settings.xp = levelInfo.xp;
    }

    // Initialize HP/Mana from stats
    const vitality = this.settings.stats.vitality || 0;
    const intelligence = this.settings.stats.intelligence || 0;
    const userRank = this.settings.rank || 'E';
    if (!this.settings.userMaxHP || this.settings.userMaxHP === null) {
      this.settings.userMaxHP = this.calculateHP(vitality, userRank);
      this.settings.userHP = this.settings.userMaxHP;
    }
    if (!this.settings.userMaxMana || this.settings.userMaxMana === null) {
      this.settings.userMaxMana = this.calculateMana(intelligence);
      this.settings.userMana = this.settings.userMaxMana;
    }

    // Reset daily quests if new day
    this.checkDailyReset();

    // Track initial channel visit
    this.trackChannelVisit();

    // Start real-time channel change detection
    this.startChannelTracking();

    // Start activity tracking
    this.startActivityTracking();

    // Start message observation
    this.startObserving();

    // Start auto-save interval
    this.startAutoSave();

    // Cleanup unwanted titles from saved data
    this.cleanupUnwantedTitles();

    // Re-validate unlocked achievements against current requirements
    // (revokes titles if level requirements were raised)
    this.revalidateUnlockedAchievements();

    // Apply retroactive natural stat growth based on level and activity
    this.applyRetroactiveNaturalStatGrowth();

    // Integrate with CriticalHit plugin (if available)
    this.integrateWithCriticalHit();

    // Create in-chat UI panel
    try {
      this.createChatUI();
    } catch (error) {
      this.debugError('CREATE_CHAT_UI', error);
      // Retry after a delay if initial creation fails
      if (this._createChatUIStartupRetryTimeout) {
        clearTimeout(this._createChatUIStartupRetryTimeout);
      }
      this._createChatUIStartupRetryTimeout = setTimeout(() => {
        this._createChatUIStartupRetryTimeout = null;
        try {
          this.createChatUI();
        } catch (retryError) {
          this.debugError('CREATE_CHAT_UI_RETRY', retryError);
        }
      }, 2000);
    }

    // OPTIMIZED: Use debugLog instead of direct console.log
    this.debugLog('START', `Started! Level ${this.settings.level}, ${this.settings.xp} XP`);
    this.debugLog('START', `Rank ${this.settings.rank}, Total XP: ${this.settings.totalXP}`);

    // Emit initial XP changed event for progress bar plugins
    this.emitXPChanged();

    // Set up event listener to update UI when XP changes
    this.on('xpChanged', () => {
      try {
        this.updateChatUI();
      } catch (error) {
        this.debugError('XP_CHANGED_LISTENER', 'Error updating UI on XP change', error);
      }
    });

    // Startup is silent — no toast on every reload.

    // Log startup to debug
  }

  stop() {
    this._isRunning = false;

    // Clean up level up debounce timeout
    if (this.levelUpDebounceTimeout) {
      clearTimeout(this.levelUpDebounceTimeout);
      this.levelUpDebounceTimeout = null;
    }
    this.pendingLevelUp = null;

    // Stop observing
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }
    this._domNodeAddedTime = null;
    if (this.processedMessageIds) {
      this.processedMessageIds.clear();
      this.processedMessageIds = null;
    }
    if (this.recentMessages) {
      // recentMessages may be Map or Set depending on version
      this.recentMessages.clear?.();
      this.recentMessages = null;
    }
    if (this._startObservingRetryTimeout) {
      clearTimeout(this._startObservingRetryTimeout);
      this._startObservingRetryTimeout = null;
    }
    if (this._setupInputRetryTimeout) {
      clearTimeout(this._setupInputRetryTimeout);
      this._setupInputRetryTimeout = null;
    }
    if (this._messageProcessTimeouts) {
      this._messageProcessTimeouts.forEach((id) => clearTimeout(id));
      this._messageProcessTimeouts.clear();
    }

    // Prevent delayed stat allocation notifications after disable
    if (this._statAllocationTimeout) {
      clearTimeout(this._statAllocationTimeout);
      this._statAllocationTimeout = null;
    }
    if (this._statAllocationQueue) {
      this._statAllocationQueue.length = 0;
    }

    if (this.activityTracker) {
      clearInterval(this.activityTracker);
      this.activityTracker = null;
    }

    // Stop periodic save
    if (this.periodicSaveInterval) {
      clearInterval(this.periodicSaveInterval);
      this.periodicSaveInterval = null;
      this.debugLog('STOP', 'Periodic save stopped');
    }

    // Stop legacy auto-save interval (if present)
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    // Remove auto-save listeners
    if (this._autoSaveHandlers) {
      window.removeEventListener('beforeunload', this._autoSaveHandlers.beforeUnloadHandler);
      document.removeEventListener(
        'visibilitychange',
        this._autoSaveHandlers.visibilityChangeHandler
      );
      this._autoSaveHandlers = null;
    }

    // Stop channel tracking
    if (this.channelTrackingInterval) {
      clearInterval(this.channelTrackingInterval);
      this.channelTrackingInterval = null;
      this.debugLog('STOP', 'Channel tracking stopped');
    }
    if (this._channelTrackingHooks) {
      window.removeEventListener('popstate', this._channelTrackingHooks.popstateHandler);
      this._channelTrackingHooks.pushStateWrapper &&
        history.pushState === this._channelTrackingHooks.pushStateWrapper &&
        (history.pushState = this._channelTrackingHooks.originalPushState);
      this._channelTrackingHooks.replaceStateWrapper &&
        history.replaceState === this._channelTrackingHooks.replaceStateWrapper &&
        (history.replaceState = this._channelTrackingHooks.originalReplaceState);
      this._channelTrackingHooks = null;
      this._channelTrackingState = null;
      this.debugLog('STOP', 'Channel tracking listeners/hooks restored');
    }

    // Remove event listeners
    if (this.messageInputHandler) {
      const messageInput =
        this.messageInputHandler.element ||
        document.querySelector('[class*="slateTextArea"]') ||
        document.querySelector('[class*="textArea"]') ||
        document.querySelector('textarea[placeholder*="Message"]');

      if (messageInput && this.messageInputHandler.handleKeyDown) {
        // These listeners were added with capture=true, so they must be removed with capture=true
        messageInput.removeEventListener('keydown', this.messageInputHandler.handleKeyDown, true);
        messageInput.removeEventListener('input', this.messageInputHandler.handleInput, true);
      }
      if (messageInput && this.messageInputHandler.handlePaste) {
        messageInput.removeEventListener('paste', this.messageInputHandler.handlePaste, true);
      }
      if (this.messageInputHandler.observer) {
        this.messageInputHandler.observer.disconnect();
      }
      this.messageInputHandler = null;
    }

    // Remove chat UI
    this.removeChatUI();

    // Cleanup webpack patches
    if (this.messageStorePatch || this.reactInjectionActive) {
      try {
        BdApi.Patcher.unpatchAll('SoloLevelingStats');
        this.messageStorePatch = null;
        this.reactInjectionActive = false;
        this.debugLog('STOP', 'Webpack patches and React injection removed');
      } catch (error) {
        this.debugError('STOP', error, { phase: 'unpatch' });
      }
    }

    // Clear webpack module references
    this.webpackModules = {
      MessageStore: null,
      UserStore: null,
      ChannelStore: null,
      MessageActions: null,
    };
    this.webpackModuleAccess = false;

    // Stop shadow power observer/interval
    if (this.shadowPowerObserver) {
      this.shadowPowerObserver.disconnect();
      this.shadowPowerObserver = null;
    }
    if (this.shadowPowerInterval) {
      clearInterval(this.shadowPowerInterval);
      this.shadowPowerInterval = null;
    }
    if (this.shadowPowerUpdateTimeout) {
      clearTimeout(this.shadowPowerUpdateTimeout);
      this.shadowPowerUpdateTimeout = null;
    }

    // Remove shadow extraction event listener
    if (this._shadowExtractedHandler) {
      document.removeEventListener('shadowExtracted', this._shadowExtractedHandler);
      this._shadowExtractedHandler = null;
    }

    // Cleanup HP bar position updater
    if (this.userHPBarPositionUpdater) {
      clearInterval(this.userHPBarPositionUpdater);
      this.userHPBarPositionUpdater = null;
    }

    // Cleanup panel watcher
    if (this.panelWatcher) {
      this.panelWatcher.disconnect();
      this.panelWatcher = null;
    }

    // Cleanup user HP bar
    if (this.userHPBar) {
      this.userHPBar = null;
    }

    // Remove activity tracking event listeners
    if (this._activityTrackingHandlers) {
      document.removeEventListener('mousemove', this._activityTrackingHandlers.mousemove);
      document.removeEventListener('keydown', this._activityTrackingHandlers.keydown);
      this._activityTrackingHandlers = null;
    }
    if (this._activityTimeout) {
      clearTimeout(this._activityTimeout);
      this._activityTimeout = null;
    }

    // MEMORY CLEANUP: Clear quest celebration particles and animations
    document.querySelectorAll('.sls-quest-celebration, .sls-quest-particle').forEach((el) => {
      // Clear any timeouts stored on elements
      if (el._removeTimeout) {
        clearTimeout(el._removeTimeout);
      }
      el.remove();
    });

    // MEMORY CLEANUP: Clear level-up overlay animation (non-toast)
    this.clearLevelUpAnimationTimeouts?.();
    this._levelUpAnimationQueue && (this._levelUpAnimationQueue.length = 0);
    this._levelUpAnimationInFlight = false;
    document.getElementById('sls-levelup-overlay')?.remove();

    // Also cleanup tracked celebrations
    if (this._questCelebrations) {
      this._questCelebrations.forEach((celebration) => {
        if (celebration._removeTimeout) {
          clearTimeout(celebration._removeTimeout);
        }
        if (celebration._progressInterval) {
          clearInterval(celebration._progressInterval);
        }
        if (celebration && celebration.parentNode) {
          celebration.remove();
        }
      });
      this._questCelebrations.clear();
    }

    // Clear pending level up data
    if (this.pendingLevelUp) {
      this.pendingLevelUp = null;
    }

    // Save before stopping
    this.saveSettings(true);

    // Detach settings panel delegated handler if attached
    if (this._settingsPanelRoot && this._settingsPanelHandlers?.change) {
      try {
        this._settingsPanelRoot.removeEventListener('change', this._settingsPanelHandlers.change);
      } catch (_) {
        // Ignore removal errors
      }
    }
    if (this._settingsPanelRoot && this._settingsPanelHandlers?.click) {
      try {
        this._settingsPanelRoot.removeEventListener('click', this._settingsPanelHandlers.click);
      } catch (_) {
        // Ignore removal errors
      }
    }
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
    if (this._settingsPreviewRoot) {
      try {
        this._settingsPreviewRoot.unmount();
      } catch (error) {
        this.debugError('STOP', error, { phase: 'unmount-settings-preview-root' });
      }
      this._settingsPreviewRoot = null;
    }

    this.debugLog('STOP', 'Plugin stopped');
  }

  // ── §3.12 SETTINGS MANAGEMENT ────────────────────────────────────────────
  // Triple-backup persistence: File, IndexedDB, BdApi.Data
  // loadSettings() picks newest/highest-priority, deep merges, migrates

  readFileBackup() {
    if (!this.fileBackupPath) return null;
    try {
      const fs = require('fs');

      // Helper to read and score a file
      const getCandidate = (path) => {
        try {
          if (!fs.existsSync(path)) return null;
          const raw = fs.readFileSync(path, 'utf8');
          const data = JSON.parse(raw);

          // Score quality: Level * 1000 + Stat Sum
          const stats = data.stats || {};
          const statSum = (Number(stats.strength) || 0) + (Number(stats.agility) || 0) +
            (Number(stats.intelligence) || 0) + (Number(stats.vitality) || 0) + (Number(stats.perception) || 0);
          const quality = (Number(data.level) || 0) * 1000 + statSum + (Number(data.totalXP || data.xp) || 0) * 0.01;

          return { data, quality, path };
        } catch (e) {
          return null;
        }
      };

      // Scan all backup slots: main, .bak1, .bak2, .bak3, .bak4, .bak5
      const candidates = [];
      const paths = [this.fileBackupPath];
      for (let i = 1; i <= 5; i++) paths.push(`${this.fileBackupPath}.bak${i}`);

      paths.forEach(p => {
        const c = getCandidate(p);
        if (c) candidates.push(c);
      });

      if (candidates.length === 0) return null;

      // Sort by quality descending
      candidates.sort((a, b) => b.quality - a.quality);

      if (candidates.length > 1) {
        this.debugLog('READ_FILE_BACKUP', `Found ${candidates.length} backups. Best: ${candidates[0].path} (Q:${candidates[0].quality})`);
      }

      return candidates[0].data;
    } catch (error) {
      this.debugError('LOAD_SETTINGS_FILE', error);
      return null;
    }
  }

  writeFileBackup(data) {
    if (!this.fileBackupPath) return false;
    try {
      const fs = require('fs');

      // Rotate backups: .bak4 -> .bak5, .bak3 -> .bak4, ... .json -> .bak1
      // Keep up to 5 rolling backups
      const maxBackups = 5;
      for (let i = maxBackups - 1; i >= 0; i--) {
        const src = i === 0 ? this.fileBackupPath : `${this.fileBackupPath}.bak${i}`;
        const dest = `${this.fileBackupPath}.bak${i + 1}`;
        if (fs.existsSync(src)) {
          try {
            // Copy manually since fs.copyFileSync might be missing in Electron renderer
            const content = fs.readFileSync(src);
            fs.writeFileSync(dest, content);
          } catch (e) {
            // Ignore rotation errors (permissions, etc), focus on saving main file
            this.debugError('ROTATE_BACKUP', e);
          }
        }
      }

      const jsonStr = JSON.stringify(data, null, 2);
      // Async write to avoid blocking the UI thread
      fs.writeFile(this.fileBackupPath, jsonStr, 'utf8', (err) => {
        if (err) {
          this.debugError('SAVE_SETTINGS_FILE', err);
        } else {
          this.debugLog('SAVE_SETTINGS', 'Saved file backup (rotated)', { path: this.fileBackupPath });
        }
      });
      return true;
    } catch (error) {
      this.debugError('SAVE_SETTINGS_FILE', error);
      return false;
    }
  }

  checkBackups() {
    const statuses = [];
    try {
      const main = BdApi.Data.load('SoloLevelingStats', 'settings');
      statuses.push(
        main ? `BdApi.Data main: OK (${Object.keys(main).length} keys)` : 'BdApi.Data main: MISSING'
      );
    } catch (e) {
      statuses.push(`BdApi.Data main error: ${e.message}`);
    }

    try {
      const backup = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
      statuses.push(
        backup
          ? `BdApi.Data backup: OK (${Object.keys(backup).length} keys)`
          : 'BdApi.Data backup: MISSING'
      );
    } catch (e) {
      statuses.push(`BdApi.Data backup error: ${e.message}`);
    }

    try {
      const exists = this.fileBackupPath && require('fs').existsSync(this.fileBackupPath);
      if (exists) {
        const raw = require('fs').readFileSync(this.fileBackupPath, 'utf8');
        const data = JSON.parse(raw);
        statuses.push(
          `File backup: OK (${Object.keys(data || {}).length} keys, ${raw.length} bytes) at ${
            this.fileBackupPath
          }`
        );
      } else {
        statuses.push(`File backup: MISSING (${this.fileBackupPath})`);
      }
    } catch (e) {
      statuses.push(`File backup error: ${e.message}`);
    }

    this.debugLog('BACKUP_STATUS', 'SoloLevelingStats backup status', { statuses });
    return statuses;
  }

  async restoreFromFileBackupToStores() {
    try {
      const data = this.readFileBackup();
      if (!data) {
        this.warnLog('RESTORE_FILE_BACKUP', 'No file backup found to restore.');
        return false;
      }
      // Use deep copy to avoid reference issues
      this.settings = JSON.parse(JSON.stringify({ ...this.defaultSettings, ...data }));
      this.recomputeHPManaFromStats();
      await this.saveSettings(true);
      this.debugLog('RESTORE_FILE_BACKUP', 'Restored from file backup and saved to stores', {
        path: this.fileBackupPath,
      });
      return true;
    } catch (error) {
      this.debugError('RESTORE_FILE_BACKUP', error);
      return false;
    }
  }

  async checkIndexedDBBackups() {
    if (!UnifiedSaveManager) {
      this.warnLog('INDEXEDDB_CHECK', 'UnifiedSaveManager not available for IndexedDB checks.');
      return null;
    }
    const manager = new UnifiedSaveManager('SoloLevelingStats');
    await manager.init();

    const keys = await manager.getAllKeys();
    const result = { keys };

    if (keys.includes('settings') || keys.length === 0) {
      const settings = await manager.load('settings');
      if (settings) {
        result.settings = {
          exists: true,
          keys: Object.keys(settings || {}).length,
          level: settings.level,
          rank: settings.rank,
          totalXP: settings.totalXP,
        };
      } else {
        result.settings = { exists: false };
      }
    }

    const backups = await manager.getBackups('settings', 10);
    result.backups = backups.map((b) => ({
      id: b.id,
      timestamp: b.timestamp,
      level: b.data?.level,
      totalXP: b.data?.totalXP,
    }));

    this.debugLog('INDEXEDDB_STATUS', 'IndexedDB status', result);
    return result;
  }

  async restoreFromIndexedDBBackup(backupId = null) {
    if (!UnifiedSaveManager) {
      this.warnLog('INDEXEDDB_RESTORE', 'UnifiedSaveManager not available for IndexedDB restore.');
      return false;
    }
    const manager = new UnifiedSaveManager('SoloLevelingStats');
    await manager.init();

    let targetId = backupId;
    if (!targetId) {
      const backups = await manager.getBackups('settings', 1);
      if (!backups.length) {
        this.errorLog('INDEXEDDB_RESTORE', 'No IndexedDB backups found.');
        return false;
      }
      targetId = backups[0].id;
    }

    const data = await manager.restoreFromBackup('settings', targetId);
    if (!data) {
      this.errorLog('INDEXEDDB_RESTORE', 'Failed to restore from IndexedDB backup.');
      return false;
    }

    // Save restored data to BdApi.Data and file for consistency
    this.settings = JSON.parse(JSON.stringify({ ...this.defaultSettings, ...data }));
    this.recomputeHPManaFromStats();
    await this.saveSettings(true);
    this.debugLog('RESTORE_INDEXEDDB', 'Restored from IndexedDB backup', { backupId: targetId });
    return true;
  }

  recomputeHPManaFromStats(totalStatsOverride = null) {
    const totalStats = totalStatsOverride || this.getTotalEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const intelligence = totalStats.intelligence || 0;
    const userRank = this.settings.rank || 'E';
    const maxHP = this.calculateHP(vitality, userRank);
    const maxMana = this.calculateMana(intelligence);

    const prevMaxHP = this.settings.userMaxHP || maxHP;
    const prevHP = this.settings.userHP ?? prevMaxHP;
    const hpPercent = prevMaxHP > 0 ? Math.min(prevHP / prevMaxHP, 1) : 1;
    this.settings.userMaxHP = maxHP;
    this.settings.userHP = Math.min(maxHP, Math.floor(maxHP * hpPercent));

    const prevMaxMana = this.settings.userMaxMana || maxMana;
    const prevMana = this.settings.userMana ?? prevMaxMana;
    const manaPercent = prevMaxMana > 0 ? Math.min(prevMana / prevMaxMana, 1) : 1;
    this.settings.userMaxMana = maxMana;
    this.settings.userMana = Math.min(maxMana, Math.floor(maxMana * manaPercent));
  }

  _isRealProgressState(data) {
    if (!data || typeof data !== 'object') return false;

    const stats = data.stats || {};
    const activity = data.activity || {};
    const quests = data.dailyQuests?.quests || {};
    const achievements = data.achievements || {};

    const hasStatGrowth = ['strength', 'agility', 'intelligence', 'vitality', 'perception'].some(
      (key) => Number(stats[key] || 0) > 0
    );
    const hasActivity =
      Number(activity.messagesSent || 0) > 0 ||
      Number(activity.charactersTyped || 0) > 0 ||
      Number(activity.timeActive || 0) > 0 ||
      Number(activity.critsLanded || 0) > 0;
    const hasQuestProgress = Object.values(quests).some(
      (quest) =>
        quest &&
        (Number(quest.progress || 0) > 0 || quest.completed === true)
    );
    const hasAchievements =
      (Array.isArray(achievements.unlocked) && achievements.unlocked.length > 0) ||
      (Array.isArray(achievements.titles) && achievements.titles.length > 0) ||
      Boolean(achievements.activeTitle);
    const hasNonDefaultRank = typeof data.rank === 'string' && data.rank !== 'E';

    return (
      Number(data.level || 0) > 1 ||
      Number(data.totalXP || 0) > 0 ||
      Number(data.xp || 0) > 0 ||
      Number(data.unallocatedStatPoints || 0) > 0 ||
      hasNonDefaultRank ||
      hasStatGrowth ||
      hasActivity ||
      hasQuestProgress ||
      hasAchievements
    );
  }

  async _detectPersistedRealProgress() {
    const inspect = (source, data) => {
      if (this._isRealProgressState(data)) {
        return {
          found: true,
          source,
          level: Number(data?.level || 0),
          totalXP: Number(data?.totalXP || 0),
        };
      }
      return null;
    };

    try {
      const fileSaved = this.readFileBackup();
      const match = inspect('file', fileSaved);
      if (match) return match;
    } catch (_) {
      // best effort
    }

    if (this.saveManager) {
      try {
        const idbMain = await this.saveManager.load('settings');
        const match = inspect('indexeddb-main', idbMain);
        if (match) return match;
      } catch (_) {
        // best effort
      }

      try {
        const backups = await this.saveManager.getBackups('settings', 3);
        for (const backup of backups) {
          const match = inspect('indexeddb-backup', backup?.data);
          if (match) return match;
        }
      } catch (_) {
        // best effort
      }
    }

    try {
      const bdMain = BdApi.Data.load('SoloLevelingStats', 'settings');
      const match = inspect('bdapi-main', bdMain);
      if (match) return match;
    } catch (_) {
      // best effort
    }

    try {
      const bdBackup = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
      const match = inspect('bdapi-backup', bdBackup);
      if (match) return match;
    } catch (_) {
      // best effort
    }

    try {
      const fs = require('fs');
      const pathModule = require('path');
      const legacyPath = pathModule.join(BdApi.Plugins.folder, 'SoloLevelingStats.data.json');
      if (fs.existsSync(legacyPath)) {
        const legacyData = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        const match = inspect('legacy-file', legacyData);
        if (match) return match;
      }
    } catch (_) {
      // best effort
    }

    return { found: false };
  }

  registerBackupConsoleHooks() {
    if (!window.SLSBackupTool) {
      window.SLSBackupTool = {};
    }
    window.SLSBackupTool.checkBackups = () => this.checkBackups();
    window.SLSBackupTool.restoreFromFile = () => this.restoreFromFileBackupToStores();
    window.SLSBackupTool.checkIndexedDB = () => this.checkIndexedDBBackups();
    window.SLSBackupTool.restoreIndexedDB = (backupId) => this.restoreFromIndexedDBBackup(backupId);
  }

  async loadSettings() {
    try {
      this.debugLog('LOAD_SETTINGS', 'Attempting to load settings...');

      // Robust load: collect candidates and pick the newest valid one.
      // IMPORTANT: never overwrite a valid candidate with null (previous bug caused resets).
      const getSavedTimestamp = (data) => {
        const iso = data?._metadata?.lastSave;
        const ts = iso ? Date.parse(iso) : NaN;
        return Number.isFinite(ts) ? ts : 0;
      };

      const candidates = [];

      // File backup (survives some repair/reinstall cases)
      try {
        const fileSaved = this.readFileBackup();
        fileSaved &&
          typeof fileSaved === 'object' &&
          candidates.push({ source: 'file', data: fileSaved, ts: getSavedTimestamp(fileSaved) });
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'File backup load failed', error);
      }

      // IndexedDB main
      if (this.saveManager) {
        try {
          const idbSaved = await this.saveManager.load('settings');
          idbSaved &&
            typeof idbSaved === 'object' &&
            candidates.push({
              source: 'indexeddb',
              data: idbSaved,
              ts: getSavedTimestamp(idbSaved),
            });
        } catch (error) {
          this.debugError('LOAD_SETTINGS', 'IndexedDB load failed', error);
        }
      }

      // BdApi.Data main
      try {
        const bdSaved = BdApi.Data.load('SoloLevelingStats', 'settings');
        bdSaved &&
          typeof bdSaved === 'object' &&
          candidates.push({ source: 'bdapi', data: bdSaved, ts: getSavedTimestamp(bdSaved) });
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'BdApi.Data load failed', error);
      }

      // Legacy .data.json in plugins folder (old backup format — prevents orphaned data loss)
      try {
        const fs = require('fs');
        const pathModule = require('path');
        const legacyPath = pathModule.join(BdApi.Plugins.folder, 'SoloLevelingStats.data.json');
        if (fs.existsSync(legacyPath)) {
          const legacyRaw = fs.readFileSync(legacyPath, 'utf8');
          const legacySaved = JSON.parse(legacyRaw);
          if (legacySaved && typeof legacySaved === 'object') {
            candidates.push({ source: 'legacy-file', data: legacySaved, ts: getSavedTimestamp(legacySaved) });
            this.debugLog('LOAD_SETTINGS', 'Found legacy .data.json backup', {
              level: legacySaved.level, rank: legacySaved.rank, ts: getSavedTimestamp(legacySaved),
            });
          }
        }
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'Legacy .data.json load failed', error);
      }

      // Pick best candidate by quality (data richness) + timestamp + storage priority
      // CRITICAL: prevents zeroed defaults with newer timestamps from overriding valid data
      const sourcePriority = {
        indexeddb: 3,
        file: 2,
        'legacy-file': 1.5,
        bdapi: 1,
      };
      const getPriority = (source) => sourcePriority[source] ?? 0;

      const getCandidateQuality = (data) => {
        if (!data || typeof data !== 'object') return 0;
        const stats = data.stats || {};
        const statSum = (Number(stats.strength) || 0) + (Number(stats.agility) || 0) +
          (Number(stats.intelligence) || 0) + (Number(stats.vitality) || 0) + (Number(stats.perception) || 0);
        return (Number(data.level) || 0) * 1000 + statSum + (Number(data.totalXP || data.xp) || 0) * 0.01;
      };

      // Score all candidates and sanitize timestamps
      const MAX_VALID_TIMESTAMP = Date.now() + 86400000; // Now + 1 day (anything beyond is bogus)
      candidates.forEach(c => {
        c.quality = getCandidateQuality(c.data);
        // Clamp future timestamps — prevents poisoned data (e.g. year 2099) from winning
        if (c.ts > MAX_VALID_TIMESTAMP) {
          this.debugLog('LOAD_SETTINGS', `WARNING: Clamped future timestamp from ${c.source}`, {
            originalTs: new Date(c.ts).toISOString(), clampedTo: new Date(MAX_VALID_TIMESTAMP).toISOString(),
          });
          c.ts = 0; // Treat as unknown age — let quality decide
        }
      });

      const best = candidates.reduce(
        (acc, cur) => {
          // QUALITY-FIRST selection: higher quality ALWAYS wins unless nearly identical
          // This prevents stale data with newer timestamps from overriding real progress
          const qualityRatio = acc.quality > 0 ? cur.quality / acc.quality : (cur.quality > 0 ? Infinity : 1);
          if (qualityRatio > 1.1) return cur;  // 10% higher quality wins regardless of timestamp
          if (qualityRatio < 0.91) return acc;  // Current best is 10%+ higher quality

          // Nearly identical quality (<10% diff): use timestamp then priority
          const hasNewerTimestamp = cur.ts > acc.ts;
          const isTie = cur.ts === acc.ts;
          const hasHigherPriority = getPriority(cur.source) >= getPriority(acc.source);
          return hasNewerTimestamp || (isTie && hasHigherPriority) ? cur : acc;
        },
        {
          source: null,
          data: null,
          ts: 0,
          quality: 0,
        }
      );

      let saved = best.data;
      const loadedFromFile = best.source === 'file';

      // ALWAYS log candidate selection (critical for diagnosing data loss)
      this.debugLog('LOAD_SETTINGS', saved ? 'Selected settings candidate' : 'WARNING: No valid candidate found', {
        winner: best.source,
        winnerLevel: saved?.level,
        winnerQuality: best.quality,
        candidateCount: candidates.length,
        allCandidates: candidates.map(c => ({
          source: c.source, level: c.data?.level, quality: c.quality,
          ts: c.ts ? new Date(c.ts).toISOString() : 'none',
        })),
      });

      // Try IndexedDB backup if main failed
      if (!saved && this.saveManager) {
        try {
          const backups = await this.saveManager.getBackups('settings', 1);
          if (backups.length > 0) {
            saved = backups[0].data;
            this.debugLog('LOAD_SETTINGS', 'Loaded from IndexedDB backup');
            // Restore backup to main
            try {
              await this.saveManager.save('settings', saved);
              this.debugLog('LOAD_SETTINGS', 'Restored backup to main');
            } catch (restoreError) {
              this.debugError('LOAD_SETTINGS', 'Failed to restore backup', restoreError);
            }
          }
        } catch (error) {
          this.debugError('LOAD_SETTINGS', 'IndexedDB backup load failed', error);
        }
      }

      // Try BdApi.Data backup as last resort
      if (!saved) {
        try {
          saved = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
          if (saved) {
            this.debugLog('LOAD_SETTINGS', 'Loaded from BdApi.Data backup');
            // Migrate to IndexedDB
            if (this.saveManager) {
              try {
                await this.saveManager.save('settings', saved);
                this.debugLog('LOAD_SETTINGS', 'Migrated backup to IndexedDB');
              } catch (migrateError) {
                this.debugError('LOAD_SETTINGS', 'Migration failed', migrateError);
              }
            }
          }
        } catch (error) {
          this.debugError('LOAD_SETTINGS', 'BdApi.Data backup load failed', error);
        }
      }

      if (saved && typeof saved === 'object') {
        try {
          // CRITICAL FIX: Deep merge to prevent nested object reference sharing
          // Shallow spread (...) only copies top-level, nested objects are still references!
          const merged = { ...this.defaultSettings, ...saved };
          this.settings = JSON.parse(JSON.stringify(merged));
          this.debugLog('LOAD_SETTINGS', 'Settings merged (deep copy)', {
            level: this.settings.level,
            rank: this.settings.rank,
            totalXP: this.settings.totalXP,
          });

          // Migrate old data structures if needed
          this.migrateData();

          // Restore Set for channelsVisited
          if (Array.isArray(this.settings.activity.channelsVisited)) {
            this.settings.activity.channelsVisited = new Set(
              this.settings.activity.channelsVisited
            );
            this.debugLog('LOAD_SETTINGS', 'Converted channelsVisited array to Set');
          } else if (!(this.settings.activity.channelsVisited instanceof Set)) {
            this.settings.activity.channelsVisited = new Set();
            this.debugLog('LOAD_SETTINGS', 'Initialized new channelsVisited Set');
          }

          // CRITICAL: Ensure stats object exists and is properly initialized
          // If stats are missing or empty, merge with defaults instead of overwriting
          if (!this.settings.stats || typeof this.settings.stats !== 'object') {
            // CRITICAL: Use deep copy to prevent defaultSettings corruption
            this.settings.stats = JSON.parse(JSON.stringify(this.defaultSettings.stats));
            this.debugLog('LOAD_SETTINGS', 'Stats object was missing, initialized from defaults');
          } else {
            // Merge stats with defaults to ensure all properties exist
            // CRITICAL: Create new object to avoid reference sharing
            const mergedStats = {
              ...this.defaultSettings.stats,
              ...this.settings.stats,
            };
            this.settings.stats = mergedStats;
            // Ensure all stat properties exist (migration safety)
            this.settings.stats.strength =
              this.settings.stats.strength ?? this.defaultSettings.stats.strength ?? 0;
            this.settings.stats.agility =
              this.settings.stats.agility ?? this.defaultSettings.stats.agility ?? 0;
            this.settings.stats.intelligence =
              this.settings.stats.intelligence ?? this.defaultSettings.stats.intelligence ?? 0;
            this.settings.stats.vitality =
              this.settings.stats.vitality ?? this.defaultSettings.stats.vitality ?? 0;
            this.settings.stats.perception =
              this.settings.stats.perception ??
              this.settings.stats.luck ??
              this.defaultSettings.stats.perception ??
              0;
            this.debugLog('LOAD_SETTINGS', 'Stats merged with defaults', {
              strength: this.settings.stats.strength,
              agility: this.settings.stats.agility,
              intelligence: this.settings.stats.intelligence,
              vitality: this.settings.stats.vitality,
              perception: this.settings.stats.perception,
            });
          }

          // Migration note: luck -> perception conversion happens in migrateData().
          // Keep only a safety normalization here to avoid crashing on corrupted saves.
          if (!Array.isArray(this.settings.perceptionBuffs)) {
            this.settings.perceptionBuffs = [];
          }

          // Verify critical data exists
          if (
            !this.settings.level ||
            typeof this.settings.level !== 'number' ||
            this.settings.level < 1
          ) {
            this.debugLog('LOAD_SETTINGS', 'Level missing or invalid, initializing from totalXP');
            const levelInfo = this.getCurrentLevel();
            this.settings.level = levelInfo.level || 1;
          }

          // Ensure HP/Mana align with current stats/rank after any reset/refund
          this.recomputeHPManaFromStats();

          this._hasRealProgress = this._isRealProgressState(this.settings);
          // If loaded state already has progress, skip extra first-save probe.
          // If it looks fresh/default-like, force one persisted probe before first save.
          this._startupProgressProbeComplete = this._hasRealProgress;

          // STARTUP GUARD: load complete — unlock save path
          this._startupLoadComplete = true;
          this.debugLog('LOAD_SETTINGS', 'Startup load confirmed — saves unlocked', {
            level: this.settings.level,
            totalXP: this.settings.totalXP,
            source: best.source,
            hasRealProgress: this._hasRealProgress,
          });

          // If we loaded from file backup, push it back to primary stores for persistence
          if (loadedFromFile) {
            try {
              await this.saveSettings(true);
              this.debugLog('LOAD_SETTINGS', 'Restored file backup to persistent stores');
            } catch (saveErr) {
              this.debugError('LOAD_SETTINGS', 'Failed to push file backup to stores', saveErr);
            }
          }

          // CRITICAL: Ensure totalXP is initialized (prevent progress bar from breaking)
          this.ensureValidTotalXP('LOAD_SETTINGS');

          this.debugLog('LOAD_SETTINGS', 'Settings loaded successfully', {
            level: this.settings.level,
            totalXP: this.settings.totalXP,
            messagesSent: this.settings.activity.messagesSent,
            rank: this.settings.rank,
          });

          // Emit initial XP changed event for progress bar plugins
          this.emitXPChanged();
        } catch (error) {
          this.debugError('LOAD_SETTINGS', error, { phase: 'settings_merge' });
          throw error;
        }
      } else {
        // LAST-RESORT SAFETY CHECK: Before accepting defaults, verify no real progress
        // exists anywhere. This catches the edge case where all 3 tiers returned null
        // but legacy .data.json has orphaned real data.
        let rescuedFromLegacy = false;
        try {
          const fs = require('fs');
          const pathModule = require('path');
          const legacyPath = pathModule.join(BdApi.Plugins.folder, 'SoloLevelingStats.data.json');
          if (fs.existsSync(legacyPath)) {
            const legacyRaw = fs.readFileSync(legacyPath, 'utf8');
            const legacyData = JSON.parse(legacyRaw);
            if (legacyData && legacyData.level > 1) {
              this.warnLog('RESCUE', `Found real progress in legacy .data.json (level ${legacyData.level}) — refusing to use defaults`);
              const merged = { ...this.defaultSettings, ...legacyData };
              this.settings = JSON.parse(JSON.stringify(merged));
              if (Array.isArray(this.settings.activity?.channelsVisited)) {
                this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
              } else {
                this.settings.activity.channelsVisited = new Set();
              }
              this.recomputeHPManaFromStats();
              this._hasRealProgress = true;
              this._startupProgressProbeComplete = true;
              this._startupLoadComplete = true;
              // Persist rescued data to all tiers so future loads find it
              try { await this.saveSettings(true); } catch (_) { /* best-effort */ }
              rescuedFromLegacy = true;
            }
          }
        } catch (legacyErr) {
          this.debugError('LOAD_SETTINGS', 'Legacy rescue check failed', legacyErr);
        }

        if (!rescuedFromLegacy) {
          // Genuinely new user — no data anywhere
          this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
          this.settings.activity.channelsVisited = new Set();
          this._hasRealProgress = false;
          this._startupProgressProbeComplete = false;
          this._startupLoadComplete = true; // Allow saves — this is a real fresh start
          this.debugLog('LOAD_SETTINGS', 'No saved data found anywhere (including legacy), using defaults');
        }
      }
    } catch (error) {
      this.debugError('LOAD_SETTINGS', error, { phase: 'load_settings' });
      // CRITICAL: Use deep copy to prevent defaultSettings corruption
      this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
      // Initialize Set for channelsVisited
      this.settings.activity.channelsVisited = new Set();

      // Even on error, try legacy rescue before allowing saves of defaults
      try {
        const fs = require('fs');
        const pathModule = require('path');
        const legacyPath = pathModule.join(BdApi.Plugins.folder, 'SoloLevelingStats.data.json');
        if (fs.existsSync(legacyPath)) {
          const legacyData = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
          if (legacyData && legacyData.level > 1) {
            this.warnLog('RESCUE', 'ERROR-PATH RESCUE: Found real progress in legacy .data.json');
            const merged = { ...this.defaultSettings, ...legacyData };
            this.settings = JSON.parse(JSON.stringify(merged));
            if (Array.isArray(this.settings.activity?.channelsVisited)) {
              this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
            } else {
              this.settings.activity.channelsVisited = new Set();
            }
          }
        }
      } catch (_) { /* best-effort */ }
      this._hasRealProgress = this._isRealProgressState(this.settings);
      this._startupProgressProbeComplete = this._hasRealProgress;
      this._startupLoadComplete = true;
    }
  }

  // FUNCTIONAL AUTO-SAVE WRAPPER
  // Wraps a function that modifies settings and auto-saves after
  // Usage: this.withAutoSave(() => { modify settings here }, true)
  withAutoSave(modifyFn, immediate = false) {
    const executeAndSave = () => {
      const result = modifyFn();
      this.saveSettings(immediate);
      return result;
    };
    return executeAndSave();
  }

  // SHADOW XP SHARE (Integration with ShadowArmy plugin)
  // FUNCTIONAL - NO IF-ELSE! Uses optional chaining and short-circuit evaluation
  shareShadowXP(xpAmount, source = 'message') {
    const shareWithPlugin = (plugin) => {
      plugin.instance.shareShadowXP(xpAmount, source);
      this.debugConsole('[SHADOW XP]', `Shared ${xpAmount} XP (${source})`);
      return true;
    };

    const logError = (error) => {
      this.debugLog('SHADOW_XP_SHARE', `ShadowArmy integration: ${error.message}`);
      return null;
    };

    try {
      const plugin = BdApi.Plugins.get('ShadowArmy');
      const hasShareFunction = typeof plugin?.instance?.shareShadowXP === 'function';

      // Functional short-circuit: Only executes shareWithPlugin if hasShareFunction is true
      return hasShareFunction && shareWithPlugin(plugin);
    } catch (error) {
      return logError(error);
    }
  }

  /**
   * Debounced save — coalesces rapid saveSettings() calls (20+ call sites).
   * Actual I/O happens after 2s of quiet. Use immediate=true only for
   * stop()/beforeunload/visibilitychange where data loss is critical.
   */
  async saveSettings(immediate = false) {
    // Prevent saving if settings aren't initialized
    if (!this.settings) {
      this.debugError('SAVE_SETTINGS', new Error('Settings not initialized'));
      return;
    }

    // STARTUP SAVE GUARD: Block ALL saves until loadSettings() has confirmed
    // real data loaded or verified this is a genuine fresh start. This prevents
    // the "load defaults → immediate save → overwrite real progress" cascade.
    if (this._startupLoadComplete === false) {
      this.debugLog('SAVE_SETTINGS', 'BLOCKED — startup load not yet complete, refusing to save');
      return;
    }

    if (immediate) {
      // Flush any pending debounce and save now
      if (this._saveSettingsTimer) {
        clearTimeout(this._saveSettingsTimer);
        this._saveSettingsTimer = null;
      }
      this._settingsDirty = false;
      return this._saveSettingsImmediate();
    }

    // Debounced path — coalesce rapid calls
    this._settingsDirty = true;
    if (this._saveSettingsTimer) return;
    this._saveSettingsTimer = setTimeout(() => {
      this._saveSettingsTimer = null;
      if (this._settingsDirty) {
        this._settingsDirty = false;
        this._saveSettingsImmediate();
      }
    }, 2000);
  }

  async _saveSettingsImmediate() {
    if (!this.settings) return;

    // FIRST-SAVE GUARD: if startup state looks fresh, probe every persisted source once.
    // If real progress exists anywhere, reload instead of writing defaults over it.
    if (!this._startupProgressProbeComplete) {
      const probeResult = await this._detectPersistedRealProgress();
      this._startupProgressProbeComplete = true;

      const currentLooksFresh = !this._isRealProgressState(this.settings);
      if (probeResult.found && currentLooksFresh) {
        this.warnLog('SAVE_GUARD', `BLOCKED save: found persisted progress in ${probeResult.source} (level ${probeResult.level}, totalXP ${probeResult.totalXP}) while current state looks fresh. Reloading instead of overwriting.`);
        try {
          await this.loadSettings();
        } catch (_) {
          // best effort
        }
        return;
      }
    }

    try {
      // CRITICAL: Validate settings before attempting to save bonuses
      // This prevents errors from corrupting the save process
      if (!this.settings || !this.settings.stats) {
        this.debugError(
          'SAVE_SETTINGS',
          new Error('Settings or stats not initialized - cannot save bonuses')
        );
        // Continue with main save even if bonus save fails
      } else {
        // Sync AGI crit-chance + PER burst profile for CriticalHit before saving settings
        try {
          this.saveAgilityBonus();
        } catch (error) {
          // Don't fail entire save if agility bonus save fails
          // Log error but continue with main settings save
          this.debugError('SAVE_AGILITY_BONUS_IN_SAVE', error);
        }
      }

      this.debugLog('SAVE_SETTINGS', 'Current settings before save', {
        level: this.settings.level,
        xp: this.settings.xp,
        totalXP: this.settings.totalXP,
        rank: this.settings.rank,
        stats: this.settings.stats,
        unallocatedPoints: this.settings.unallocatedStatPoints,
      });

      // Convert Set to Array for storage and ensure all data is serializable
      const settingsToSave = {
        ...this.settings,
        activity: {
          ...this.settings.activity,
          channelsVisited:
            this.settings.activity?.channelsVisited instanceof Set
              ? Array.from(this.settings.activity.channelsVisited)
              : Array.isArray(this.settings.activity?.channelsVisited)
              ? this.settings.activity.channelsVisited
              : [],
        },
        // Add metadata for debugging
        _metadata: {
          lastSave: new Date().toISOString(),
          version: '2.5.0',
        },
      };

      // Remove any non-serializable properties (functions, undefined, etc.)
      const cleanSettings = JSON.parse(JSON.stringify(settingsToSave));
      this._hasRealProgress = this._isRealProgressState(cleanSettings) || this._hasRealProgress;

      // CRITICAL: Validate critical data before saving to prevent level resets
      // If level is invalid (0, negative, or missing), don't save corrupted data
      if (
        !cleanSettings.level ||
        cleanSettings.level < 1 ||
        !Number.isInteger(cleanSettings.level)
      ) {
        this.debugError(
          'SAVE_SETTINGS',
          new Error(
            `Invalid level detected: ${cleanSettings.level}. Aborting save to prevent data corruption.`
          )
        );
        return; // Don't save corrupted data
      }

      // Validate XP is a valid number
      if (typeof cleanSettings.xp !== 'number' || isNaN(cleanSettings.xp) || cleanSettings.xp < 0) {
        this.debugError(
          'SAVE_SETTINGS',
          new Error(
            `Invalid XP detected: ${cleanSettings.xp}. Aborting save to prevent data corruption.`
          )
        );
        return; // Don't save corrupted data
      }

      // CRITICAL: Validate stats haven't regressed to defaults (prevent stat wipe)
      const statSum = Object.values(cleanSettings.stats || {}).reduce(
        (a, b) => a + (Number(b) || 0), 0
      );
      if (statSum === 0 && cleanSettings.level > 1) {
        this.debugError(
          'SAVE_SETTINGS',
          new Error(
            `All stats are zero at level ${cleanSettings.level}. Aborting save to prevent data wipe.`
          )
        );
        return; // Don't save — this is clearly corrupt
      }

      // CRITICAL: Check for stat regression vs existing file backup
      try {
        const existingBackup = this.readFileBackup();
        if (existingBackup?.stats) {
          const existingStatSum = Object.values(existingBackup.stats).reduce(
            (a, b) => a + (Number(b) || 0), 0
          );
          if (existingStatSum > 0 && statSum < existingStatSum * 0.5) {
            this.debugError(
              'SAVE_SETTINGS',
              new Error(
                `Stats regression detected: current ${statSum} vs backup ${existingStatSum} (>50% drop). Aborting save.`
              )
            );
            return; // Don't overwrite good data with regressed data
          }
        }
      } catch (regressionCheckError) {
        // Don't block save if regression check itself fails
        this.debugError('SAVE_SETTINGS', 'Regression check failed (non-fatal)', regressionCheckError);
      }

      // CRITICAL: Validate totalXP is valid (prevent progress bar from breaking)
      if (
        typeof cleanSettings.totalXP !== 'number' ||
        isNaN(cleanSettings.totalXP) ||
        cleanSettings.totalXP < 0
      ) {
        // Calculate totalXP from level and xp if invalid
        const currentLevel = cleanSettings.level || 1;
        let totalXPNeeded = 0;
        for (let l = 1; l < currentLevel; l++) {
          totalXPNeeded += this.getXPRequiredForLevel(l);
        }
        cleanSettings.totalXP = totalXPNeeded + (cleanSettings.xp || 0);
        this.debugLog('SAVE_SETTINGS', 'Fixed invalid totalXP before save', {
          fixedTotalXP: cleanSettings.totalXP,
          level: currentLevel,
          xp: cleanSettings.xp,
        });
      }

      this.debugLog('SAVE_SETTINGS', 'Clean settings to be saved', {
        level: cleanSettings.level,
        xp: cleanSettings.xp,
        totalXP: cleanSettings.totalXP,
        rank: cleanSettings.rank,
        stats: cleanSettings.stats,
        statSum,
        metadata: cleanSettings._metadata,
      });

      // File backup first to survive BdApi.Data/IndexedDB clears
      this.writeFileBackup(cleanSettings);

      // Save to IndexedDB first (crash-resistant, primary storage)
      if (this.saveManager) {
        try {
          await this.saveManager.save('settings', cleanSettings, true); // true = create backup
          this.lastSaveTime = Date.now();
          this.debugLog('SAVE_SETTINGS', 'Saved to IndexedDB', {
            level: cleanSettings.level,
            xp: cleanSettings.xp,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          this.debugError('SAVE_SETTINGS', 'IndexedDB save failed', error);
        }
      }

      // Also save to BdApi.Data (backup/legacy support)
      let saveSuccess = false;
      let lastError = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          BdApi.Data.save('SoloLevelingStats', 'settings', cleanSettings);
          this.lastSaveTime = Date.now();
          saveSuccess = true;
          this.debugLog('SAVE_SETTINGS', 'Saved to BdApi.Data', {
            attempt: attempt + 1,
            level: cleanSettings.level,
            xp: cleanSettings.xp,
            timestamp: new Date().toISOString(),
          });
          break;
        } catch (error) {
          lastError = error;
          // No delay between retries - avoid blocking UI thread
        }
      }

      if (!saveSuccess) {
        // Don't throw - IndexedDB save might have succeeded
        this.debugError('SAVE_SETTINGS', 'BdApi.Data save failed after 3 attempts', lastError);
      }

      // CRITICAL: Always replace backup after successful primary save (maximum persistence)
      try {
        BdApi.Data.save('SoloLevelingStats', 'settings_backup', cleanSettings);
        this.debugLog('SAVE_SETTINGS', 'BdApi.Data backup saved');
      } catch (backupError) {
        // Log backup failure but don't fail entire save
        this.debugError('SAVE_SETTINGS_BACKUP', 'BdApi.Data backup save failed', backupError);
      }
    } catch (error) {
      this.debugError('SAVE_SETTINGS', error);
      // Try to save to backup location
      try {
        // Ensure we have a clean copy for backup
        const backupData = JSON.parse(
          JSON.stringify({
            ...this.settings,
            activity: {
              ...this.settings.activity,
              channelsVisited:
                this.settings.activity?.channelsVisited instanceof Set
                  ? Array.from(this.settings.activity.channelsVisited)
                  : Array.isArray(this.settings.activity?.channelsVisited)
                  ? this.settings.activity.channelsVisited
                  : [],
            },
          })
        );
        BdApi.Data.save('SoloLevelingStats', 'settings_backup', backupData);
        this.debugLog('SAVE_SETTINGS', 'Backup replaced (fallback after primary save failure)');
      } catch (backupError) {
        this.debugError('SAVE_SETTINGS_BACKUP', backupError);
      }
    }
  }

  createChatUiPreviewPanel() {
    try {
      // Ensure stale preview roots do not accumulate when settings are reopened.
      if (this._settingsPreviewRoot) {
        try {
          this._settingsPreviewRoot.unmount();
        } catch (error) {
          this.debugError('CREATE_CHAT_UI_PREVIEW_PANEL', error, {
            phase: 'unmount-previous-preview-root',
          });
        }
        this._settingsPreviewRoot = null;
      }

      // Ensure chat UI styles exist for the preview
      this.injectChatUICSS();

      const container = document.createElement('div');
      container.className = 'sls-chat-panel';
      container.id = 'sls-settings-chat-ui';

      // v3.0.0: Render React component tree into preview panel
      const { StatsPanel } = this._chatUIComponents;
      const root = BdApi.ReactDOM.createRoot(container);
      root.render(BdApi.React.createElement(StatsPanel));
      this._settingsPreviewRoot = root;

      return container;
    } catch (error) {
      this.debugError('CREATE_CHAT_UI_PREVIEW_PANEL', error);
      const fallback = document.createElement('div');
      fallback.className = 'sls-chat-panel';
      fallback.innerHTML = `<div style="padding: 20px; color: #fff;">Error creating chat UI preview: ${this.escapeHtml(error.message)}. Check console for details.</div>`;
      return fallback;
    }
  }

  // ── §3.13 CSS STYLES (Settings Panel Theme) ──────────────────────────────
  // Removed unused legacy settings-panel CSS injector.

  // ── §3.14 ACTIVITY TRACKING ──────────────────────────────────────────────
  // Shadow power observer, time-active counter (1-min poll),
  // mouse/keyboard activity (5-min timeout), channel visit tracking

  setupShadowPowerObserver() {
    if (this.shadowPowerObserver) {
      this.shadowPowerObserver.disconnect();
    }

    // Watch for ShadowArmy plugin settings changes
    const shadowArmyPlugin = BdApi.Plugins.get('ShadowArmy');
    if (!shadowArmyPlugin || !shadowArmyPlugin.instance) {
      return;
    }

    // Observe ShadowArmy settings object for changes
    // Since we can't directly observe object properties, we'll observe the plugin's storage
    // and use a combination of polling (reduced frequency) and event-based updates

    // Watch for DOM changes that might indicate shadow extraction (message elements)
    // This is a fallback - primary method is event-based
    this.shadowPowerObserver = new MutationObserver(() => {
      // Debounce updates
      if (this.shadowPowerUpdateTimeout) {
        clearTimeout(this.shadowPowerUpdateTimeout);
      }
      this.shadowPowerUpdateTimeout = setTimeout(() => {
        this.updateShadowPower?.();
      }, 100); // Update 100ms after last mutation (faster updates)
    });

    // Observe message container for new messages (which might trigger shadow extraction)
    const messageContainer = this.getMessageContainer();

    if (messageContainer) {
      this.shadowPowerObserver.observe(messageContainer, {
        childList: true,
        subtree: true,
      });
    }

    // Note: Proxy wrapping ShadowArmy's settings is not reliable in BetterDiscord,
    // and a failed attempt can be harder to reason about than polling/events.
    // We rely on the ShadowArmy event + the DOM observer debounce above.
  }

  // renderChatActivity() — REMOVED in v3.0.0 (replaced by React ActivityGrid component)

  startActivityTracking() {
    // Track time active
    this.activityTracker = setInterval(() => {
      const now = Date.now();
      const timeDiff = (now - this.settings.activity.lastActiveTime) / 1000 / 60; // minutes

      // Only count if user was active in last 5 minutes
      if (timeDiff < 5) {
        this.settings.activity.timeActive += timeDiff;
        this.settings.activity.lastActiveTime = now;

        // Debounced save — activity tracking fires every minute
        this.saveSettings();

        // Update daily quest: Active Adventurer
        this.updateQuestProgress('activeAdventurer', timeDiff);
      }
    }, 60000); // Check every minute

    // Track mouse/keyboard activity (throttled — was firing hundreds of times/sec on mousemove)
    this._activityTimeout = null;
    this._lastActivityReset = 0;
    const resetActivityTimeout = () => {
      const now = Date.now();
      // Throttle: only process once per 2 seconds (mousemove fires 100s/sec)
      if (now - this._lastActivityReset < 2000) return;
      this._lastActivityReset = now;

      if (this._activityTimeout) {
        clearTimeout(this._activityTimeout);
      }
      this.settings.activity.lastActiveTime = now;
      this._activityTimeout = setTimeout(() => {
        // User inactive
      }, 300000); // 5 minutes
    };

    // Store handlers for cleanup
    this._activityTrackingHandlers = {
      mousemove: resetActivityTimeout,
      keydown: resetActivityTimeout,
    };

    document.addEventListener('mousemove', resetActivityTimeout);
    document.addEventListener('keydown', resetActivityTimeout);
    resetActivityTimeout();
  }

  trackChannelVisit() {
    try {
      const channelInfo = this.getCurrentChannelInfo();

      if (!channelInfo) {
        this.debugLog('TRACK_CHANNEL_VISIT', 'No channel info found', {
          currentUrl: window.location.href,
        });
        return;
      }

      const { channelId, channelType, serverId, isDM } = channelInfo;

      // Ensure channelsVisited is a Set
      if (!(this.settings.activity.channelsVisited instanceof Set)) {
        if (Array.isArray(this.settings.activity.channelsVisited)) {
          this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
        } else {
          this.settings.activity.channelsVisited = new Set();
        }
      }

      const previousSize = this.settings.activity.channelsVisited.size;
      const wasNewChannel = !this.settings.activity.channelsVisited.has(channelId);

      this.settings.activity.channelsVisited.add(channelId);

      // Reduced verbosity - only log if verbose mode enabled or if it's a new channel
      if (wasNewChannel || this.debug.verbose) {
        this.debugLog('TRACK_CHANNEL_VISIT', 'Channel visit tracked', {
          channelId,
          channelType,
          serverId: serverId || 'N/A (DM)',
          isDM,
          wasNewChannel,
          previousCount: previousSize,
          newCount: this.settings.activity.channelsVisited.size,
          totalChannels: this.settings.activity.channelsVisited.size,
        });
      }

      // If new channel, update quest and save immediately
      if (wasNewChannel) {
        this.debugLog('TRACK_CHANNEL_VISIT', 'New channel discovered!', {
          channelId,
          channelType,
          isDM,
        });
        this.updateQuestProgress('channelExplorer', 1);

        // Save immediately when discovering a new channel
        this.saveSettings(true);
        this.debugLog('TRACK_CHANNEL_VISIT', 'Settings saved immediately after new channel visit');
      }
    } catch (error) {
      this.debugError('TRACK_CHANNEL_VISIT', error, {
        currentUrl: window.location.href,
      });
    }
  }

  startChannelTracking() {
    try {
      this.debugLog('START_CHANNEL_TRACKING', 'Starting real-time channel change detection');

      // Avoid duplicate hooks/listeners on reloads
      if (this._channelTrackingHooks) return;

      // Track current URL to detect changes
      const state = {
        lastUrl: window.location.href,
        lastChannelId: null,
      };

      // Get initial channel ID
      const initialInfo = this.getCurrentChannelInfo();
      if (initialInfo) {
        state.lastChannelId = initialInfo.channelId;
        this.debugLog('START_CHANNEL_TRACKING', 'Initial channel detected', {
          channelId: state.lastChannelId,
          channelType: initialInfo.channelType,
          url: state.lastUrl,
        });
      }

      // Method 1: Monitor URL changes via popstate (back/forward navigation)
      const popstateHandler = () => {
        const newUrl = window.location.href;
        if (newUrl !== state.lastUrl) {
          this.debugLog('START_CHANNEL_TRACKING', 'URL changed via popstate', {
            oldUrl: state.lastUrl,
            newUrl,
          });
          state.lastUrl = newUrl;
          state.lastChannelId = this.handleChannelChange(state.lastChannelId);
        }
      };
      window.addEventListener('popstate', popstateHandler);

      // Method 2: Monitor URL changes via pushState/replaceState (Discord's navigation)
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      const checkUrlChange = (newUrl) => {
        if (newUrl !== state.lastUrl) {
          this.debugLog('START_CHANNEL_TRACKING', 'URL changed via history API', {
            oldUrl: state.lastUrl,
            newUrl,
          });
          state.lastUrl = newUrl;
          state.lastChannelId = this.handleChannelChange(state.lastChannelId);
        }
      };

      const pushStateWrapper = function (...args) {
        originalPushState.apply(history, args);
        setTimeout(() => checkUrlChange(window.location.href), 0);
      };
      history.pushState = pushStateWrapper;

      const replaceStateWrapper = function (...args) {
        originalReplaceState.apply(history, args);
        setTimeout(() => checkUrlChange(window.location.href), 0);
      };
      history.replaceState = replaceStateWrapper;

      // Method 3: Poll URL changes (fallback for Discord's internal navigation)
      // Optimized: Increased interval to reduce CPU usage (500ms -> 1000ms)
      // Discord's navigation is usually caught by popstate/history API, so polling is rarely needed
      this.channelTrackingInterval = setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== state.lastUrl) {
          this.debugLog('START_CHANNEL_TRACKING', 'URL changed via polling', {
            oldUrl: state.lastUrl,
            newUrl: currentUrl,
          });
          state.lastUrl = currentUrl;
          state.lastChannelId = this.handleChannelChange(state.lastChannelId);
        }
      }, 3000); // PERF: 3s fallback poll (popstate/history hooks handle most navigation)

      this._channelTrackingHooks = {
        popstateHandler,
        originalPushState,
        originalReplaceState,
        pushStateWrapper,
        replaceStateWrapper,
      };
      this._channelTrackingState = state;

      this.debugLog('START_CHANNEL_TRACKING', 'Channel tracking started successfully', {
        methods: ['popstate', 'history API', 'polling'],
        pollInterval: '1000ms',
      });
    } catch (error) {
      this.debugError('START_CHANNEL_TRACKING', error);
    }
  }

  // ── §3.15 LEVEL-UP & RANK SYSTEM ─────────────────────────────────────────
  // checkLevelUp(): Detect level changes, award stat points, trigger animations
  // checkRankPromotion(): E→D→C→B→A→S→SS→SSS→SSS+→NH→Monarch→Monarch+→SM
  // showLevelUpNotification(): Banner + sound overlay

  getRankPromotionBonusTable() {
    return {
      D: 4,
      C: 6,
      B: 9,
      A: 13,
      S: 19,
      SS: 27,
      SSS: 38,
      'SSS+': 54,
      NH: 76,
      Monarch: 110,
      'Monarch+': 165,
      'Shadow Monarch': 280,
    };
  }

  getLegacyRankPromotionBonusTableForBackfill() {
    // Previous live values (pre-exponential rank tuning).
    return {
      D: 2,
      C: 3,
      B: 4,
      A: 5,
      S: 7,
      SS: 9,
      SSS: 11,
      'SSS+': 13,
      NH: 16,
      Monarch: 20,
      'Monarch+': 24,
      'Shadow Monarch': 30,
    };
  }

  calculateRankPromotionDampener(averageStat) {
    const safeAverage = Math.max(0, Number(averageStat) || 0);
    if (safeAverage >= 1200) return 0.5;
    if (safeAverage >= 800) return 0.62;
    if (safeAverage >= 500) return 0.75;
    if (safeAverage >= 300) return 0.88;
    return 1;
  }

  getPromotedRanksForRank(rank = this.settings?.rank) {
    const fallbackRanks =
      this.defaultSettings?.ranks || ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SSS+', 'NH', 'Monarch', 'Monarch+', 'Shadow Monarch'];
    const ranks =
      Array.isArray(this.settings?.ranks) && this.settings.ranks.length
        ? this.settings.ranks
        : fallbackRanks;
    const rankIndex = ranks.indexOf(rank);
    if (rankIndex <= 0) return [];
    return ranks.slice(1, rankIndex + 1);
  }

  async applyRankPromotionBonusBackfill() {
    try {
      if (this.settings?._rankBonusBackfillV2Applied) {
        return { applied: false, reason: 'already_applied' };
      }

      if (!this.settings?.stats || typeof this.settings.stats !== 'object') {
        return { applied: false, reason: 'missing_stats' };
      }

      const promotedRanks = this.getPromotedRanksForRank();
      if (!promotedRanks.length) {
        return { applied: false, reason: 'no_promotions' };
      }

      const currentTable = this.getRankPromotionBonusTable();
      const legacyTable = this.getLegacyRankPromotionBonusTableForBackfill();
      const deltaBase = promotedRanks.reduce((sum, rank) => {
        const currentValue = Number(currentTable[rank] || 0);
        const legacyValue = Number(legacyTable[rank] || 0);
        return sum + Math.max(0, currentValue - legacyValue);
      }, 0);

      if (deltaBase <= 0) {
        return { applied: false, reason: 'no_delta', promotedRanks, deltaBase };
      }

      const backupKey = `rankBonusBackfillV2_pre_${Date.now()}`;
      const snapshot = JSON.parse(JSON.stringify(this.settings));
      try {
        BdApi.Data.save('SoloLevelingStats', backupKey, snapshot);
      } catch (error) {
        this.debugError('RANK_BACKFILL', error, { phase: 'backup_failed', backupKey });
        return { applied: false, reason: 'backup_failed', backupKey, error };
      }

      const statKeys = this.STAT_KEYS || ['strength', 'agility', 'intelligence', 'vitality', 'perception'];
      const previousState = {
        stats: { ...this.settings.stats },
        userHP: this.settings.userHP,
        userMaxHP: this.settings.userMaxHP,
        userMana: this.settings.userMana,
        userMaxMana: this.settings.userMaxMana,
        markerApplied: this.settings._rankBonusBackfillV2Applied,
        markerAppliedAt: this.settings._rankBonusBackfillV2AppliedAt,
        markerBackupKey: this.settings._rankBonusBackfillV2BackupKey,
        markerMeta: this.settings._rankBonusBackfillV2Meta,
      };

      try {
        const statSum = statKeys.reduce((sum, key) => sum + (Number(this.settings.stats[key]) || 0), 0);
        const averageStat = statSum / statKeys.length;
        const dampener = this.calculateRankPromotionDampener(averageStat);
        const perStatDelta = Math.max(1, Math.round(deltaBase * dampener));

        statKeys.forEach((key) => {
          this.settings.stats[key] = (Number(this.settings.stats[key]) || 0) + perStatDelta;
        });

        this.settings._rankBonusBackfillV2Applied = true;
        this.settings._rankBonusBackfillV2AppliedAt = Date.now();
        this.settings._rankBonusBackfillV2BackupKey = backupKey;
        this.settings._rankBonusBackfillV2Meta = {
          promotedRanks,
          deltaBase,
          dampener,
          perStatDelta,
          rankAtApply: this.settings.rank,
        };

        this.recomputeHPManaFromStats();
        await this.saveSettings(true);
        this.updateChatUI();

        this.debugLog('RANK_BACKFILL', 'Rank promotion backfill applied', {
          rank: this.settings.rank,
          promotedRanks,
          deltaBase,
          dampener,
          perStatDelta,
          backupKey,
        });

        return {
          applied: true,
          rank: this.settings.rank,
          promotedRanks,
          deltaBase,
          dampener,
          perStatDelta,
          backupKey,
        };
      } catch (error) {
        this.settings.stats = { ...previousState.stats };
        this.settings.userHP = previousState.userHP;
        this.settings.userMaxHP = previousState.userMaxHP;
        this.settings.userMana = previousState.userMana;
        this.settings.userMaxMana = previousState.userMaxMana;
        this.settings._rankBonusBackfillV2Applied = previousState.markerApplied;
        this.settings._rankBonusBackfillV2AppliedAt = previousState.markerAppliedAt;
        this.settings._rankBonusBackfillV2BackupKey = previousState.markerBackupKey;
        this.settings._rankBonusBackfillV2Meta = previousState.markerMeta;

        try {
          await this.saveSettings(true);
        } catch (rollbackError) {
          this.debugError('RANK_BACKFILL', rollbackError, { phase: 'rollback_save_failed' });
        }

        this.debugError('RANK_BACKFILL', error, { phase: 'apply_failed' });
        return { applied: false, reason: 'apply_failed', backupKey, error };
      }
    } catch (error) {
      this.debugError('RANK_BACKFILL', error, { phase: 'unexpected' });
      return { applied: false, reason: 'unexpected_error', error };
    }
  }

  checkLevelUp(oldLevel) {
    try {
      // #region agent log
      // #endregion

      this.debugLog('CHECK_LEVEL_UP', 'Checking for level up', { oldLevel });

      const levelInfo = this.getCurrentLevel();
      const newLevel = levelInfo.level;

      if (newLevel > oldLevel) {
        // LEVEL UP!
        const levelsGained = newLevel - oldLevel;

        // #region agent log
        // #endregion

        this.settings.level = newLevel;
        this.settings.xp = levelInfo.xp;
        const _statPointsBefore = this.settings.unallocatedStatPoints;
        // Balanced stat point curve (front-loaded early, tapered late).
        // Prevents runaway high-level stat inflation while preserving progression.
        const statPointsPerLevel = this.getStatPointsForLevel(newLevel);
        this.settings.unallocatedStatPoints += levelsGained * statPointsPerLevel;
        const _statPointsAfter = this.settings.unallocatedStatPoints;

        // #region agent log
        // #endregion

        this.debugLog('CHECK_LEVEL_UP', 'Level up detected!', {
          oldLevel,
          newLevel,
          levelsGained,
          unallocatedPoints: this.settings.unallocatedStatPoints,
        });

        // Process natural stat growth for each level gained (handles skipped levels)
        // This ensures stats grow naturally even when multiple levels are gained at once
        try {
          const _statsBefore = { ...this.settings.stats };
          Array.from({ length: levelsGained }).forEach(() => {
            this.processNaturalStatGrowth();
          });
          const _statsAfter = { ...this.settings.stats };

          // #region agent log
          // #endregion

          this.debugLog('CHECK_LEVEL_UP', 'Natural stat growth processed for skipped levels', {
            levelsGained,
          });
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'natural_stat_growth_on_levelup' });
        }

        // Emit level changed event for real-time progress bar updates
        this.emitLevelChanged(oldLevel, newLevel);

        // Save immediately on level up (critical event)
        try {
          this.saveSettings(true);
          this.debugLog('CHECK_LEVEL_UP', 'Settings saved after level up');
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'save_after_levelup' });
        }

        // Debounce level up notification to prevent spam
        // If there's already a pending notification, update it with the latest level
        if (this.pendingLevelUp) {
          // Update pending notification with latest level
          this.pendingLevelUp.oldLevel = Math.min(this.pendingLevelUp.oldLevel, oldLevel);
          this.pendingLevelUp.newLevel = Math.max(this.pendingLevelUp.newLevel, newLevel);
          this.pendingLevelUp.levelsGained =
            this.pendingLevelUp.newLevel - this.pendingLevelUp.oldLevel;
          // #region agent log
          // #endregion
        } else {
          // Create new pending notification
          this.pendingLevelUp = {
            oldLevel,
            newLevel,
            levelsGained,
          };
          // #region agent log
          // #endregion
        }

        // Debounce without starvation: once scheduled, don't keep resetting the timer.
        // Rapid XP updates can otherwise prevent the notification from ever firing.
        if (!this.levelUpDebounceTimeout) {
          this.levelUpDebounceTimeout = setTimeout(() => {
            if (this.pendingLevelUp) {
              const {
                oldLevel: finalOldLevel,
                newLevel: finalNewLevel,
                levelsGained: _finalLevelsGained,
              } = this.pendingLevelUp;
              // #region agent log
              // #endregion

              // Calculate actual stat points gained
              const statPointsPerLevel = this.getStatPointsForLevel(finalNewLevel);
              const actualStatPointsGained = (finalNewLevel - finalOldLevel) * statPointsPerLevel;

              this.showLevelUpNotification(finalNewLevel, finalOldLevel, actualStatPointsGained);
              this.pendingLevelUp = null;
              this.levelUpDebounceTimeout = null;
            } else {
              this.levelUpDebounceTimeout = null;
            }
          }, this.levelUpDebounceDelay);
        }

        // Check for level achievements
        try {
          this.checkAchievements();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'check_achievements' });
        }

        // Check for rank promotion (after level up)
        try {
          this.checkRankPromotion();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'check_rank_promotion' });
        }

        // Update chat UI after level up
        try {
          this.updateChatUI();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'update_ui' });
        }
      } else {
        // Update current XP
        this.settings.xp = levelInfo.xp;
        // Emit XP changed event (level didn't change but XP did)
        this.emitXPChanged();
        // Update chat UI
        try {
          this.updateChatUI();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'update_ui_no_levelup' });
        }
      }
    } catch (error) {
      this.debugError('CHECK_LEVEL_UP', error, { oldLevel });
    }
  }

  checkRankPromotion() {
    try {
      this.debugLog('CHECK_RANK_PROMOTION', 'Checking for rank promotion', {
        currentRank: this.settings.rank,
        level: this.settings.level,
        achievements: this.settings.achievements.unlocked.length,
      });

      const rankRequirements = this.getRankRequirements();
      const currentRank = this.settings.rank;
      const currentReq = rankRequirements[currentRank];

      if (!currentReq || !currentReq.next) {
        this.debugLog('CHECK_RANK_PROMOTION', 'Already at max rank or invalid rank');
        return; // Already at max rank or invalid rank
      }

      const nextRank = currentReq.next;
      const nextReq = rankRequirements[nextRank];

      // Check if requirements are met
      const levelMet = this.settings.level >= nextReq.level;
      const achievementsMet = this.settings.achievements.unlocked.length >= nextReq.achievements;

      this.debugLog('CHECK_RANK_PROMOTION', 'Requirements check', {
        nextRank,
        levelMet,
        levelRequired: nextReq.level,
        currentLevel: this.settings.level,
        achievementsMet,
        achievementsRequired: nextReq.achievements,
        currentAchievements: this.settings.achievements.unlocked.length,
      });

      if (levelMet && achievementsMet) {
        // RANK PROMOTION!
        const oldRank = this.settings.rank;
        this.settings.rank = nextRank;

        this.debugLog('CHECK_RANK_PROMOTION', 'Rank promotion!', {
          oldRank,
          newRank: nextRank,
          level: this.settings.level,
          achievements: this.settings.achievements.unlocked.length,
        });

        // Grant rank promotion stat bonuses on an exponential-ish curve.
        // Late tiers (Monarch+) are intentionally dramatic; damping prevents runaway inflation.
        const rankPromotionBonuses = this.getRankPromotionBonusTable();

        const baseBonus = rankPromotionBonuses[nextRank] || 0;
        const statSum =
          (this.settings.stats.strength || 0) +
          (this.settings.stats.agility || 0) +
          (this.settings.stats.intelligence || 0) +
          (this.settings.stats.vitality || 0) +
          (this.settings.stats.perception || 0);
        const averageStat = statSum / 5;
        const dampener = this.calculateRankPromotionDampener(averageStat);
        const bonus = Math.max(1, Math.round(baseBonus * dampener));
        if (bonus > 0) {
          // Apply bonus to all stats
          this.settings.stats.strength = (this.settings.stats.strength || 0) + bonus;
          this.settings.stats.agility = (this.settings.stats.agility || 0) + bonus;
          this.settings.stats.intelligence = (this.settings.stats.intelligence || 0) + bonus;
          this.settings.stats.vitality = (this.settings.stats.vitality || 0) + bonus;
          this.settings.stats.perception = (this.settings.stats.perception || 0) + bonus;

          // Recalculate HP/Mana after stat bonus (vitality/intelligence increased)
          const vitality = this.settings.stats.vitality || 0;
          const intelligence = this.settings.stats.intelligence || 0;
          this.settings.userMaxHP = this.calculateHP(vitality, nextRank);
          this.settings.userMaxMana = this.calculateMana(intelligence);

          // Fully restore HP/Mana on rank promotion
          this.settings.userHP = this.settings.userMaxHP;
          this.settings.userMana = this.settings.userMaxMana;
        }

        // Emit rank changed event for real-time progress bar updates
        this.emitRankChanged(oldRank, nextRank);

        // Add to rank history
        if (!this.settings.rankHistory) {
          this.settings.rankHistory = [];
        }
        this.settings.rankHistory.push({
          rank: nextRank,
          level: this.settings.level,
          achievements: this.settings.achievements.unlocked.length,
          timestamp: Date.now(),
        });
        // Cap rank history to last 100 entries to prevent unbounded growth
        if (this.settings.rankHistory.length > 100) {
          this.settings.rankHistory = this.settings.rankHistory.slice(-100);
        }

        // Save immediately on rank promotion (critical event)
        try {
          this.saveSettings(true);
          this.debugLog('CHECK_RANK_PROMOTION', 'Settings saved after rank promotion');
        } catch (error) {
          this.debugError('CHECK_RANK_PROMOTION', error, { phase: 'save_after_promotion' });
        }

        // Show rank promotion notification
        try {
          this.showRankPromotionNotification(oldRank, nextRank, nextReq, bonus);
        } catch (error) {
          this.debugError('CHECK_RANK_PROMOTION', error, { phase: 'show_notification' });
        }

        // Update chat UI
        try {
          this.updateChatUI();
        } catch (error) {
          this.debugError('CHECK_RANK_PROMOTION', error, { phase: 'update_ui' });
        }
      }
    } catch (error) {
      this.debugError('CHECK_RANK_PROMOTION', error, {
        currentRank: this.settings.rank,
        level: this.settings.level,
      });
    }
  }

  /**
   * Public XP grant API for external plugins (for example Dungeons).
   * This applies raw XP directly without message-based multipliers/governors.
   *
   * @param {number} amount - XP amount to add
   * @param {Object} [options]
   * @param {string} [options.source='external'] - Source label for debug logs
   * @param {boolean} [options.shareShadowXP=false] - Mirror grant to ShadowArmy share pipeline
   * @param {boolean} [options.saveImmediately=false] - Force immediate persistence
   * @returns {number} Granted XP amount (0 when invalid)
   */
  addXP(amount, options = {}) {
    try {
      const rawAmount = Number(amount);
      const xpAmount = Number.isFinite(rawAmount) ? Math.floor(rawAmount) : 0;
      if (xpAmount <= 0) return 0;

      const source =
        typeof options.source === 'string' && options.source.trim().length > 0
          ? options.source.trim()
          : 'external';
      const shareShadowXP = Boolean(options.shareShadowXP);
      const saveImmediately = Boolean(options.saveImmediately);

      this.ensureValidTotalXP(`ADD_XP:${source}`);

      const oldLevel = this.settings.level || 1;
      const oldTotalXP = this.settings.totalXP || 0;
      this.settings.xp = (this.settings.xp || 0) + xpAmount;
      this.settings.totalXP = oldTotalXP + xpAmount;

      // Invalidate level cache since XP changed.
      this.invalidatePerformanceCache(['currentLevel']);

      // Normalize current XP bucket using canonical level resolver.
      const newLevelInfo = this.getCurrentLevel();
      if (this.settings.level !== newLevelInfo.level) {
        this.settings.level = newLevelInfo.level;
        this.settings.xp = newLevelInfo.xp;
      } else {
        this.settings.xp = newLevelInfo.xp;
      }

      // Emit XP changed event for real-time progress updates.
      this.emitXPChanged();

      // Keep level/rank progression behavior aligned with awardXP().
      this.checkLevelUp(oldLevel);
      if ((this.settings.level || 1) === oldLevel) {
        this.checkRankPromotion();
      }

      if (saveImmediately) {
        this.saveSettings(true);
      } else {
        setTimeout(() => {
          try {
            this.saveSettings();
          } catch (error) {
            this.debugError('ADD_XP', error, { phase: 'save_after_add_xp', source });
          }
        }, 0);
      }

      if (shareShadowXP) {
        try {
          this.shareShadowXP(xpAmount, source);
        } catch (error) {
          this.debugError('ADD_XP', error, { phase: 'shadow_xp_share', source });
        }
      }

      this.debugLog('ADD_XP', 'External XP added', {
        source,
        xpAmount,
        oldTotalXP,
        newTotalXP: this.settings.totalXP,
        oldLevel,
        newLevel: this.settings.level,
      });

      return xpAmount;
    } catch (error) {
      this.debugError('ADD_XP', error, { amount, options });
      return 0;
    }
  }

  awardXP(messageText, messageLength, messageContext = null) {
    try {
      this.debugLog('AWARD_XP', 'Calculating XP', { messageLength });

      // Get current level for calculations
      const levelInfo = this.getCurrentLevel();
      const currentLevel = levelInfo.level;

      const baseXP = this.calculateBaseXpForMessage({ messageText, messageLength, messageContext });
      const antiAbuseMeta = this._lastAntiAbuseMeta;
      if (antiAbuseMeta?.antiAbuse) {
        const shouldLogAntiAbuse =
          antiAbuseMeta.antiAbuse.multiplier < 1 || antiAbuseMeta.interactionBonus > 0;
        shouldLogAntiAbuse &&
          this.debugLog('ANTI_ABUSE', 'Applied anti-abuse scoring', {
            multiplier: antiAbuseMeta.antiAbuse.multiplier,
            rapidMultiplier: antiAbuseMeta.antiAbuse.rapidMultiplier,
            repeatMultiplier: antiAbuseMeta.antiAbuse.repeatMultiplier,
            repeatCount: antiAbuseMeta.antiAbuse.repeatCount,
            deltaMs: antiAbuseMeta.antiAbuse.deltaMs,
            interactionBonus: antiAbuseMeta.interactionBonus,
            scaledInteractionBonus: antiAbuseMeta.scaledInteractionBonus,
            preDecayBaseXP: antiAbuseMeta.preDecayBaseXP,
            postDecayBaseXP: antiAbuseMeta.postDecayBaseXP,
            source: antiAbuseMeta.antiAbuse.source,
          });
      }

      // ===== ACTIVE SKILL BUFFS (SkillTree temporary activated abilities) =====
      const activeBuffs = this.getActiveSkillBuffs();

      // ===== PERCENTAGE BONUSES (Additive, Not Multiplicative) =====
      let totalPercentageBonus = 0; // Track all percentage bonuses additively

      // ===== SKILL TREE BONUSES (Additive Percentage - Permanent Buffs) =====
      // Skill Tree bonuses are ADDITIVE percentage bonuses (like title bonuses)
      // They're permanent buffs that add to the percentage pool
      // Reset stat multiplier for this calculation
      this._skillTreeStatMultiplier = null;

      const skillBonuses = this.getSkillTreeBonuses();
      // XP bonus: Additive percentage (adds to percentage pool)
      skillBonuses?.xpBonus > 0 && (totalPercentageBonus += skillBonuses.xpBonus * 100);
      // Long message bonus: Additive percentage (adds to percentage pool)
      messageLength > 200 &&
        skillBonuses?.longMsgBonus > 0 &&
        (totalPercentageBonus += skillBonuses.longMsgBonus * 100);
      // All stat bonus: Multiplies stat-based bonuses (strength, intelligence)
      skillBonuses?.allStatBonus > 0 &&
        (this._skillTreeStatMultiplier = 1 + skillBonuses.allStatBonus);

      // Active buff: Ruler's Authority allStatMultiplier (stacks multiplicatively with passive)
      if (activeBuffs?.allStatMultiplier > 1.0) {
        this._skillTreeStatMultiplier = (this._skillTreeStatMultiplier || 1.0) * activeBuffs.allStatMultiplier;
      }

      // Title bonus will be applied multiplicatively after percentage bonuses
      // (stored for later application)

      // ===== STAT BONUSES (Additive with Diminishing Returns) =====

      // Strength: +2% per point, with diminishing returns after 20 points
      const strengthStat = this.settings.stats.strength || 0;
      let strengthBonus = 0;
      if (strengthStat > 0) {
        if (strengthStat <= 20) {
          strengthBonus = strengthStat * 2; // 2% per point up to 20
        } else {
          // Diminishing returns: 40% base + (stat - 20) * 0.5%
          strengthBonus = 40 + (strengthStat - 20) * 0.5;
        }
        // Apply Skill Tree allStatBonus multiplier if available
        if (this._skillTreeStatMultiplier) {
          strengthBonus *= this._skillTreeStatMultiplier;
        }
        totalPercentageBonus += strengthBonus;
      }

      // Intelligence: TIERED SYSTEM for messages (Mana/Magic efficiency)
      // TIER 1 (100-200 chars): +3% per INT point
      // TIER 2 (200-400 chars): +7% per INT point
      // TIER 3 (400+ chars):    +12% per INT point

      const intelligenceStat = this.settings.stats.intelligence || 0;

      // FUNCTIONAL: Determine tier bonus (lookup map, no if-else chain)
      const intTierBonuses = {
        tier3: { threshold: 400, bonus: 12 }, // Very long messages
        tier2: { threshold: 200, bonus: 7 }, // Long messages
        tier1: { threshold: 100, bonus: 3 }, // Medium messages
      };

      // FUNCTIONAL: Find applicable tier (no if-else)
      const applicableTier = Object.values(intTierBonuses).find(
        (tier) => messageLength >= tier.threshold
      );

      // FUNCTIONAL: Calculate intelligence bonus (short-circuit)
      applicableTier &&
        intelligenceStat > 0 &&
        (() => {
          const bonusPerPoint = applicableTier.bonus;
          let intelligenceBonus = 0;

          // Diminishing returns after 15 points (same scaling for all tiers)
          intelligenceStat <= 15
            ? (intelligenceBonus = intelligenceStat * bonusPerPoint)
            : (intelligenceBonus =
                15 * bonusPerPoint + (intelligenceStat - 15) * (bonusPerPoint / 5));

          // Apply Skill Tree allStatBonus multiplier if available
          this._skillTreeStatMultiplier && (intelligenceBonus *= this._skillTreeStatMultiplier);

          totalPercentageBonus += intelligenceBonus;

          this.debugLog('INT_TIER_BONUS', 'Intelligence tier bonus applied', {
            messageLength,
            tier: applicableTier.threshold,
            bonusPerPoint,
            intelligenceStat,
            intelligenceBonus: intelligenceBonus.toFixed(1) + '%',
          });
        })();

      // ===== APPLY PERCENTAGE BONUSES (Additive) =====
      // Cap additive pool to prevent unbounded growth stacking.
      const cappedPercentageBonus = Math.min(totalPercentageBonus, 220);
      let xp = Math.round(baseXP * (1 + cappedPercentageBonus / 100));

      // ===== TITLE BONUS (Multiplicative - Single Equipped Title) =====
      // Titles are MULTIPLICATIVE since you can only equip one title at a time
      // This makes title choice meaningful and powerful
      const titleBonus = this.getActiveTitleBonus();
      const titleXpCap = this.getTitleXpCapForLevel(currentLevel);
      const appliedTitleXpBonus = Math.min(Math.max(0, titleBonus.xp || 0), titleXpCap);
      if (appliedTitleXpBonus > 0) {
        xp = Math.round(xp * (1 + appliedTitleXpBonus));
      }

      // ===== ACTIVE SKILL: Sprint XP Multiplier (Multiplicative) =====
      if (activeBuffs?.xpMultiplier > 1.0) {
        xp = Math.round(xp * activeBuffs.xpMultiplier);
      }

      // ===== MILESTONE BONUSES (Multiplicative - Catch-up mechanism) =====
      // At certain level milestones, multiply XP to help balance diminishing returns
      // These are MULTIPLICATIVE since they're milestone rewards
      // Slightly nerfed but still impactful
      const milestoneMultipliers = {
        25: 1.06,
        50: 1.1,
        75: 1.14,
        100: 1.18,
        150: 1.22,
        200: 1.27,
        300: 1.33,
        400: 1.38,
        500: 1.43,
        700: 1.48,
        1000: 1.54,
        1500: 1.6,
        2000: 1.68,
      };

      // Apply highest milestone multiplier reached (using .reduce() for cleaner code)
      // Cache milestone multiplier based on level
      let milestoneMultiplier = 1.0;
      if (
        this._cache.milestoneMultiplierLevel === currentLevel &&
        this._cache.milestoneMultiplier !== null
      ) {
        milestoneMultiplier = this._cache.milestoneMultiplier;
      } else {
        milestoneMultiplier = Object.entries(milestoneMultipliers).reduce(
          (highest, [milestone, multiplier]) => {
            return currentLevel >= parseInt(milestone) ? multiplier : highest;
          },
          1.0
        );
        // Cache the result
        this._cache.milestoneMultiplier = milestoneMultiplier;
        this._cache.milestoneMultiplierLevel = currentLevel;
      }

      if (milestoneMultiplier > 1.0) {
        xp = Math.round(xp * milestoneMultiplier);
      }

      // ===== LEVEL-BASED DIMINISHING RETURNS (Balanced) =====
      // At higher levels, XP gains are reduced to prevent rapid leveling.
      // Floor: 60% preserves forward motion without runaway acceleration.
      if (currentLevel > 10) {
        const rawMultiplier = 1 / (1 + (currentLevel - 10) * 0.01);
        const levelReductionMultiplier = Math.max(rawMultiplier, 0.6); // Floor at 60%
        xp = Math.round(xp * levelReductionMultiplier);

        // Minimum XP floor: Always award at least 10 XP per message (ensures visible progress)
        const minXP = 10;
        xp = Math.max(xp, minXP);
      }

      // ===== CRITICAL HIT BONUS (Multiplicative, but capped) =====
      // Active skill: Mutilate — guaranteed crit (charge-based)
      let activeSkillForcedCrit = false;
      if (activeBuffs?.guaranteedCrit) {
        const consumed = this.consumeActiveSkillCharge('mutilate');
        if (consumed) activeSkillForcedCrit = true;
      }

      let critBonus = this.checkCriticalHitBonus();
      // Active skill: Bloodlust — bonus crit chance (if not already crit)
      if (critBonus <= 0 && activeBuffs?.critChanceBonus > 0) {
        const roll = Math.random();
        if (roll < activeBuffs.critChanceBonus) {
          // Bloodlust-triggered crit: use base crit multiplier from agility
          const agilityStat = this.settings.stats?.agility || 0;
          critBonus = Math.min(1.2, 0.2 + Math.min(0.75, agilityStat * 0.006));
        }
      }
      // Active skill: Mutilate — force crit if guaranteed
      if (activeSkillForcedCrit && critBonus <= 0) {
        const agilityStat = this.settings.stats?.agility || 0;
        critBonus = Math.min(1.2, 0.2 + Math.min(0.75, agilityStat * 0.006));
      }

      if (critBonus > 0) {
        const baseXPBeforeCrit = xp;
        let critMultiplier = critBonus;
        let isMegaCrit = false;
        let comboFlatBonusXP = 0;

        // Check for Dagger Throw Master mega crit (special case - high but capped burst)
        const activeTitle = this.settings.achievements?.activeTitle;
        if (activeTitle === 'Dagger Throw Master') {
          const agilityStat = this.settings.stats?.agility || 0;
          const megaCritChance = Math.min(0.2, agilityStat * 0.001);
          const roll = Math.random();

          if (roll < megaCritChance) {
            critMultiplier = 149; // 150x total
            isMegaCrit = true;
            this.showNotification(
              ` MEGA CRITICAL HIT! \n` +
                `Dagger Throw Master activated!\n` +
                `150x XP Multiplier!`,
              'success',
              8000
            );
            this.debugLog('AWARD_XP_MEGA_CRIT', 'Mega crit activated!', {
              agilityStat,
              megaCritChance: (megaCritChance * 100).toFixed(1) + '%',
              roll: roll.toFixed(4),
              multiplier: '150x',
            });
          }
        }

        // Apply crit multiplier (only multiplicative bonus remaining)
        xp = Math.round(xp * (1 + critMultiplier));

        // PER burst chain grants additional flat XP with strict cap.
        // Keeps higher combos rewarding while preventing easy over-leveling.
        const critBurstInfo = this._cache?.lastAppliedCritBurst || null;
        if (!isMegaCrit && critBurstInfo?.burstHits > 1) {
          const effectiveBurstHits = Math.min(20, Number(critBurstInfo.effectiveBurstHits || 1));
          const extraRatio = Math.min(
            0.18,
            Math.log2(effectiveBurstHits + 1) * 0.02 +
              (Math.min(12, effectiveBurstHits) - 1) * 0.006
          );
          const cappedFlatBonus = Math.max(4, Math.round(baseXPBeforeCrit * 0.18));
          comboFlatBonusXP = Math.min(
            cappedFlatBonus,
            Math.max(2, Math.round(baseXPBeforeCrit * extraRatio))
          );
          xp += comboFlatBonusXP;
        }

        // Track crit for achievements
        if (!this.settings.activity.critsLanded) {
          this.settings.activity.critsLanded = 0;
        }
        this.settings.activity.critsLanded++;

        this.debugLog(
          'AWARD_XP_CRIT',
          isMegaCrit ? 'MEGA CRITICAL HIT!' : 'Critical hit bonus applied',
          {
            critBonus: (critBonus * 100).toFixed(0) + '%',
            baseXPBeforeCrit,
            critBonusXP: xp - baseXPBeforeCrit,
            comboFlatBonusXP,
            burstHits: this._cache?.lastAppliedCritBurst?.burstHits || 1,
            finalXP: xp,
            totalCrits: this.settings.activity.critsLanded,
            isMegaCrit,
          }
        );
      }

      // ===== RANK BONUS (Multiplicative, but final) =====
      // Rank multiplier applied last (this is the only remaining multiplicative bonus)
      const rankMultiplier = this.getRankMultiplier();
      xp = Math.round(xp * rankMultiplier);

      // ===== ACTIVE SKILL: Domain Expansion Global Multiplier (final layer) =====
      if (activeBuffs?.globalMultiplier > 1.0) {
        xp = Math.round(xp * activeBuffs.globalMultiplier);
      }

      // Final XP governor: soft-cap + hard-cap compression based on level.
      xp = this.applyXpGovernors(xp, currentLevel);

      // Final rounding
      xp = Math.round(xp);

      // Calculate skill tree multiplier for logging (if any)
      const skillTreeMultiplier = this._skillTreeStatMultiplier || 1.0;

      this.debugLog('AWARD_XP', 'XP calculated', {
        baseXP,
        totalPercentageBonus: totalPercentageBonus.toFixed(1) + '%',
        cappedPercentageBonus: cappedPercentageBonus.toFixed(1) + '%',
        titleXpApplied: `${(appliedTitleXpBonus * 100).toFixed(1)}% (cap ${(titleXpCap * 100).toFixed(0)}%)`,
        skillTreeMultiplier:
          skillTreeMultiplier > 1.0 ? `${((skillTreeMultiplier - 1) * 100).toFixed(1)}%` : 'None',
        milestoneMultiplier:
          milestoneMultiplier > 1.0 ? `${((milestoneMultiplier - 1) * 100).toFixed(0)}%` : 'None',
        levelReduction:
          currentLevel > 10
            ? (Math.max(1 / (1 + (currentLevel - 10) * 0.01), 0.6) * 100).toFixed(1) + '%'
            : 'N/A',
        rankMultiplier: `${((this.getRankMultiplier() - 1) * 100).toFixed(0)}%`,
        finalXP: xp,
        messageLength,
        currentLevel,
      });

      // CRITICAL: Ensure totalXP is initialized (prevent progress bar from breaking)
      this.ensureValidTotalXP('AWARD_XP');

      // Add XP
      const oldLevel = this.settings.level;
      const oldTotalXP = this.settings.totalXP;
      this.settings.xp += xp;
      this.settings.totalXP += xp;

      // Invalidate level cache since XP changed
      this.invalidatePerformanceCache(['currentLevel']);

      // Update level based on new total XP
      const newLevelInfo = this.getCurrentLevel();
      if (this.settings.level !== newLevelInfo.level) {
        this.settings.level = newLevelInfo.level;
        this.settings.xp = newLevelInfo.xp;
      } else {
        this.settings.xp = newLevelInfo.xp;
      }

      this.debugLog('AWARD_XP', 'XP added', {
        xpAwarded: xp,
        oldTotalXP,
        newTotalXP: this.settings.totalXP,
        oldLevel,
        newLevel: this.settings.level,
        currentXP: this.settings.xp,
        xpRequired: newLevelInfo.xpRequired,
      });

      // Emit XP changed event for real-time progress bar updates (triggers updateChatUI internally)
      this.emitXPChanged();

      // Save on XP gain (debounced — coalesces rapid XP grants)
      // Use setTimeout to avoid blocking the main thread
      setTimeout(() => {
        try {
          this.saveSettings();
          this.debugLog('AWARD_XP', 'Settings saved after XP gain');
        } catch (error) {
          this.debugError('AWARD_XP', error, { phase: 'save_after_xp' });
        }
      }, 0);

      // Check for level up and rank promotion
      try {
        this.checkLevelUp(oldLevel);
        if ((this.settings.level || 1) === oldLevel) {
          this.checkRankPromotion();
        }
        this.debugLog('AWARD_XP', 'Level and rank checks completed');
      } catch (error) {
        this.debugError('AWARD_XP', error, { phase: 'level_rank_check' });
      }

      // Share XP with shadow army (asynchronous, doesn't block UI)
      try {
        this.shareShadowXP(xp, 'message');
      } catch (error) {
        this.debugError('AWARD_XP', error, { phase: 'shadow_xp_share' });
      }
    } catch (error) {
      this.debugError('AWARD_XP', error, {
        messageLength,
        messagePreview: messageText?.substring(0, 30),
      });
    }
  }

  showRankPromotionNotification(oldRank, newRank, rankInfo, statBonus = 0) {
    let message =
      `[SYSTEM] Rank Promotion!\n\n` +
      `Rank Up: ${oldRank} → ${newRank}\n` +
      `New Title: ${rankInfo.name}\n` +
      `Level: ${this.settings.level}\n` +
      `Achievements: ${this.settings.achievements.unlocked.length}\n`;

    if (statBonus > 0) {
      message += `BONUS: +${statBonus} to ALL stats!\n`;
    }

    message += `XP Multiplier: ${(this.getRankMultiplier() * 100).toFixed(0)}%`;

    this.showNotification(message, 'success', 6000);
  }

  showLevelUpNotification(newLevel, oldLevel, actualStatPointsGained = null) {
    // #region agent log
    // #endregion

    const _levelInfo = this.getCurrentLevel();
    const levelsGained = newLevel - oldLevel;

    // Calculate actual stat points gained if not provided
    if (actualStatPointsGained === null) {
      const statPointsPerLevel = this.getStatPointsForLevel(newLevel);
      actualStatPointsGained = levelsGained * statPointsPerLevel;
    }

    const rankInfo = this.getRankRequirements()[this.settings.rank];

    // Get current HP/MaxHP (HP is fully restored on level up)
    const totalStats = this.getTotalEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const currentMaxHP = this.calculateHP(vitality, this.settings.rank);

    // Ensure HP is fully restored on level up
    this.settings.userMaxHP = currentMaxHP;
    this.settings.userHP = currentMaxHP;

    // Build message with correct stats for multiple level ups
    let message = `[SYSTEM] Level up detected. HP fully restored.\n\n`;

    if (levelsGained > 1) {
      message += `LEVEL UP! ${levelsGained}x Level Up! You're now Level ${newLevel}!\n`;
      message += `(Level ${oldLevel} → Level ${newLevel})\n`;
    } else {
      message += `LEVEL UP! You're now Level ${newLevel}!\n`;
    }

    message += `Rank: ${this.settings.rank} - ${rankInfo.name}\n`;
    message += `HP: ${currentMaxHP}/${currentMaxHP} (Fully Restored!)\n`;
    message += `+${actualStatPointsGained} stat point(s)! Use settings to allocate stats`;

    // Use animated "level-up" toast style when SoloLevelingToasts is installed.
    this.showNotification(message, 'level-up', 5000);

    // Dedicated Level Up overlay animation (not a toast).
    // Triggers every time the player's level increases (queues if multiple happen quickly).
    this.enqueueLevelUpAnimation(oldLevel, newLevel);

    // Play level up sound/effect (optional)
  }

  // ── §3.16 LEVEL-UP OVERLAY ANIMATION ─────────────────────────────────────
  // Full-screen overlay banner with CSS animations (slideDown, pulse, glow)
  // Queue system supports up to 5 sequential animations

  getOrCreateLevelUpOverlay() {
    const existing = document.getElementById('sls-levelup-overlay');
    if (existing) return existing;

    // Ensure required CSS exists (the overlay styles live in chat UI CSS).
    try {
      this.injectChatUICSS?.();
    } catch (_) {
      // Ignore CSS injection failures; overlay will still exist but may be unstyled.
    }

    const overlay = document.createElement('div');
    overlay.id = 'sls-levelup-overlay';
    overlay.className = 'sls-levelup-overlay';
    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  }

  clearLevelUpAnimationTimeouts() {
    if (!this._levelUpAnimationTimeouts) return;
    this._levelUpAnimationTimeouts.forEach((id) => clearTimeout(id));
    this._levelUpAnimationTimeouts.clear();
  }

  enqueueLevelUpAnimation(oldLevel, newLevel) {
    if (!this._isRunning) return;
    if (document.hidden) return;
    if (typeof oldLevel !== 'number' || typeof newLevel !== 'number') return;
    if (newLevel <= oldLevel) return;

    this._levelUpAnimationQueue || (this._levelUpAnimationQueue = []);

    const levelsGained = newLevel - oldLevel;
    const maxSequential = 5;

    const entries =
      levelsGained > maxSequential
        ? [{ title: `LEVEL UP x${levelsGained}`, subtitle: `Level ${newLevel}` }]
        : Array.from({ length: levelsGained }, (_, i) => ({
            title: 'LEVEL UP',
            subtitle: `Level ${oldLevel + 1 + i}`,
          }));

    entries.forEach((entry) => this._levelUpAnimationQueue.push(entry));
    this.drainLevelUpAnimationQueue();
  }

  drainLevelUpAnimationQueue() {
    if (!this._isRunning) return;
    if (this._levelUpAnimationInFlight) return;
    const next = this._levelUpAnimationQueue?.shift?.();
    if (!next) return;

    this._levelUpAnimationInFlight = true;
    this.renderLevelUpBanner(next);

    // Match CSS animation duration (1200ms) plus a small gap.
    const doneId = setTimeout(() => {
      this._levelUpAnimationInFlight = false;
      this.drainLevelUpAnimationQueue();
    }, 1350);
    this._levelUpAnimationTimeouts?.add?.(doneId);
  }

  renderLevelUpBanner({ title, subtitle }) {
    try {
      const overlay = this.getOrCreateLevelUpOverlay();
      if (!overlay) return;

      // Clear previous banner(s) to avoid stacking.
      overlay.textContent = '';

      const banner = document.createElement('div');
      banner.className = 'sls-levelup-banner';

      const titleEl = document.createElement('div');
      titleEl.className = 'sls-levelup-title';
      titleEl.textContent = title || 'LEVEL UP';

      const subtitleEl = document.createElement('div');
      subtitleEl.className = 'sls-levelup-subtitle';
      subtitleEl.textContent = subtitle || '';

      banner.appendChild(titleEl);
      subtitleEl.textContent && banner.appendChild(subtitleEl);
      overlay.appendChild(banner);

      // Cleanup banner after animation; keep overlay for reuse.
      const cleanupId = setTimeout(() => {
        banner.remove();
      }, 1600);
      this._levelUpAnimationTimeouts?.add?.(cleanupId);
    } catch (error) {
      this.debugError?.('LEVEL_UP_ANIMATION', error);
    }
  }

  /**
   * 3.5 STATS SYSTEM
   */

  getStatBuffBreakdown(statKey, titleBonus, shadowBuffs) {
    const { titlePercent, shadowPercent } = this.getBuffPercents(statKey, titleBonus, shadowBuffs);
    const hasTitleBuff = titlePercent > 0;
    const hasShadowBuff = shadowPercent > 0;
    return {
      titlePercent,
      shadowPercent,
      hasTitleBuff,
      hasShadowBuff,
      titleDisplay: hasTitleBuff ? (titlePercent * 100).toFixed(0) : null,
      shadowDisplay: hasShadowBuff ? (shadowPercent * 100).toFixed(0) : null,
    };
  }

  buildStatTooltip(statKey, baseValue, totalValue, titleBonus, shadowBuffs) {
    const stat = this.STAT_METADATA[statKey];
    if (!stat) return '';

    const breakdown = this.getStatBuffBreakdown(statKey, titleBonus, shadowBuffs);
    const tooltipParts = [`${stat.fullName}: Base ${baseValue}`];
    if (breakdown.hasTitleBuff && breakdown.titleDisplay !== null) {
      tooltipParts.push(`+${breakdown.titleDisplay}% title`);
    }
    if (breakdown.hasShadowBuff && breakdown.shadowDisplay !== null) {
      tooltipParts.push(`+${breakdown.shadowDisplay}% shadow`);
    }
    tooltipParts.push(`Total: ${totalValue}`);
    tooltipParts.push(`${stat.desc} per point`);
    return tooltipParts.join(' | ');
  }

  getStatValueWithBuffsHTML(totalValue, statKey, titleBonus, shadowBuffs) {
    // Show only the final computed total — buff breakdown is in the tooltip on hover
    return totalValue.toString();
  }

  // renderChatStatButtons() — REMOVED in v3.0.0 (replaced by React StatButton component)

  formatUnallocatedStatPointsText() {
    const points = this.settings.unallocatedStatPoints || 0;
    return `${points} unallocated stat point${points === 1 ? '' : 's'}`;
  }

  // syncChatStatButton() — REMOVED in v3.0.0 (React components handle stat button state)
  // renderChatStats() — REMOVED in v3.0.0 (replaced by React StatsList component)
  // attachStatButtonListeners() — REMOVED in v3.0.0 (React onClick handlers replace DOM listeners)

  // ── §3.17 STATS SYSTEM ───────────────────────────────────────────────────
  // allocateStatPoint(): Spend points (STR/AGI/INT/VIT/PER)
  // processNaturalStatGrowth(): Passive per-message stat gains (0.5%+ chance)
  // _queueStatAllocation(): Aggregated notification batching

  /**
   * Aggregate stat allocation notifications to prevent spam
   * Queues allocations and shows a single notification with total bonuses
   */
  _queueStatAllocation(statName, oldValue, newValue, effectText, perceptionBuff = null) {
    // Add to queue
    this._statAllocationQueue.push({
      statName,
      oldValue,
      newValue,
      effectText,
      perceptionBuff,
      timestamp: Date.now(),
    });

    // Clear existing timeout
    if (this._statAllocationTimeout) {
      clearTimeout(this._statAllocationTimeout);
    }

    // Set new timeout to show aggregated notification
    this._statAllocationTimeout = setTimeout(() => {
      this._showAggregatedStatNotification();
    }, this._statAllocationDebounceDelay);
  }

  /**
   * Show aggregated stat allocation notification with total bonuses
   */
  _showAggregatedStatNotification() {
    if (this._statAllocationQueue.length === 0) return;

    // Group allocations by stat
    const statGroups = {};
    this._statAllocationQueue.forEach((allocation) => {
      const statName = allocation.statName;
      if (!statGroups[statName]) {
        statGroups[statName] = {
          count: 0,
          oldValue: allocation.oldValue,
          newValue: allocation.newValue,
          effectText: allocation.effectText,
        };
      }
      statGroups[statName].count++;
      statGroups[statName].newValue = allocation.newValue; // Update to latest value
    });

    // Build notification message
    const statLines = Object.entries(statGroups).map(([statName, data]) => {
      const statDisplayName = statName.charAt(0).toUpperCase() + statName.slice(1);
      if (data.count === 1) {
        return `+1 ${statDisplayName} (${data.oldValue} → ${data.newValue})`;
      } else {
        return `+${data.count} ${statDisplayName} (${data.oldValue} → ${data.newValue})`;
      }
    });

    // Calculate total bonuses gained from allocations
    const bonusLines = [];

    // Calculate bonuses for each stat type
    Object.entries(statGroups).forEach(([statName, data]) => {
      if (statName === 'perception') {
        const profile = this.getPerceptionBurstProfile();
        bonusLines.push(
          `Perception: ${Math.round(profile.burstChance * 100)}% chain chance, up to x${profile.maxHits} hits`
        );
      } else if (data.effectText && statName !== 'perception') {
        // Calculate total bonus from allocated points
        let totalBonus = 0;
        const statBonusMap = {
          strength: (count) => count * 2, // +2% XP per point (before diminishing returns)
          agility: (count) => count * 2, // +2% crit chance per point
          intelligence: (count) => count * 3, // +3% long-message bonus baseline (higher tiers handled in XP calc)
          vitality: (count) => count * 5, // +5% quest rewards per point
        };

        if (statBonusMap[statName]) {
          totalBonus = statBonusMap[statName](data.count);
          const statDisplayName = statName.charAt(0).toUpperCase() + statName.slice(1);
          bonusLines.push(`${statDisplayName}: +${totalBonus}% total bonus`);
        }
      }
    });

    const message =
      statLines.join('\n') +
      (bonusLines.length > 0 ? '\n\nTotal Bonuses:\n' + bonusLines.join('\n') : '');

    // Show aggregated notification
    this.showNotification(message, 'success', 6000);

    // Clear queue
    this._statAllocationQueue = [];
    this._statAllocationTimeout = null;
  }

  applyStatMutationEffects({
    emitPayload = null,
    invalidateKeys = ['stats', 'perception'],
    saveImmediately = true,
    refreshUI = true,
    recomputeHpMana = true,
  } = {}) {
    invalidateKeys?.length && this.invalidatePerformanceCache(invalidateKeys);
    recomputeHpMana && this.recomputeHPManaFromStats();
    saveImmediately && this.saveSettings(true);
    refreshUI && this.updateChatUI();

    if (emitPayload) {
      this.emit('statsChanged', {
        stats: { ...this.settings.stats },
        ...emitPayload,
      });
    }
  }

  allocateStatPoint(statName) {
    // Normalize stat name (handle case variations)
    if (!statName) {
      this.debugError('ALLOCATE_STAT', new Error('No stat name provided'), {
        statName,
        type: typeof statName,
      });
      this.debugError('INVALID_STAT', new Error('Invalid stat name!'));
      this.showNotification('Invalid stat name!', 'error', 2000);
      return false;
    }

    // Convert to string and normalize
    statName = String(statName).toLowerCase().trim();

    // Map common variations
    const statMap = {
      str: 'strength',
      agi: 'agility',
      int: 'intelligence',
      vit: 'vitality',
      luk: 'perception',
      luck: 'perception', // Migration: map old 'luck' to 'perception'
      per: 'perception',
    };

    if (statMap[statName]) {
      statName = statMap[statName];
    }

    this.debugLog('ALLOCATE_STAT', 'Attempting allocation', {
      originalStatName: statName,
      normalizedStatName: statName,
      unallocatedPoints: this.settings.unallocatedStatPoints,
      availableStats: Object.keys(this.settings.stats),
      statExists: statName in this.settings.stats,
      statValue: this.settings.stats[statName],
      statsObject: this.settings.stats,
    });

    if (this.settings.unallocatedStatPoints <= 0) {
      this.showNotification('No stat points available!', 'error', 2000);
      return false;
    }

    if (!(statName in this.settings.stats)) {
      this.debugError('ALLOCATE_STAT', new Error(`Invalid stat name: ${statName}`), {
        providedName: statName,
        availableStats: Object.keys(this.settings.stats),
        statsObject: this.settings.stats,
      });
      this.debugError('INVALID_STAT', new Error('Invalid stat name!'));
      this.showNotification(`Invalid stat name: ${statName}!`, 'error', 2000);
      return false;
    }

    const oldValue = this.settings.stats[statName];
    this.settings.stats[statName]++;
    this.settings.unallocatedStatPoints--;
    const newValue = this.settings.stats[statName];

    // Special handling for Perception (PER): controls crit burst-hit profile
    if (statName === 'perception') {
      const profile = this.getPerceptionBurstProfile();

      this.debugLog('ALLOCATE_STAT_PERCEPTION', 'Perception burst profile updated', {
        perceptionStat: this.settings.stats.perception,
        burstChance: `${(profile.burstChance * 100).toFixed(1)}%`,
        maxHits: profile.maxHits,
        jackpotChance: `${(profile.jackpotChance * 100).toFixed(2)}%`,
      });

      const perEffect = `Crit burst chance ${(profile.burstChance * 100).toFixed(
        0
      )}%, max x${profile.maxHits}`;
      this._queueStatAllocation(statName, oldValue, this.settings.stats[statName], perEffect, null);

      this.applyStatMutationEffects({
        emitPayload: {
          statChanged: statName,
          oldValue,
          newValue,
        },
      });

      // Save immediately — stat allocation is player-visible progress
      this.saveSettings(true);

      this.debugLog(
        'ALLOCATE_STAT',
        `${statName.charAt(0).toUpperCase() + statName.slice(1)} stat point allocated with buff`,
        {
          statName,
          oldValue,
          newValue: this.settings.stats[statName],
          burstChance: profile.burstChance,
          maxHits: profile.maxHits,
          remainingPoints: this.settings.unallocatedStatPoints,
        }
      );

      return true;
    }

    // Calculate new effect strength for feedback (for non-PER stats)
    const statEffects = {
      strength: `+${(this.settings.stats[statName] * 2).toFixed(0)}% XP bonus (diminishing after 20)`,
      agility: `+${(this.settings.stats[statName] * 2).toFixed(0)}% crit chance (up to cap)`,
      intelligence: 'Tiered long-message XP bonus (3/7/12% per point, diminishing after 15)',
      vitality: `+${(this.settings.stats[statName] * 5).toFixed(0)}% quest rewards`,
      perception: `Increases critical burst hit chains (xN)`,
    };

    const effectText = statEffects[statName] || 'Effect applied';

    // Queue notification for aggregation (prevents spam)
    this._queueStatAllocation(
      statName,
      oldValue,
      this.settings.stats[statName],
      effectText,
      null // No perception buff for non-perception stats
    );

    this.applyStatMutationEffects({
      emitPayload: {
        statChanged: statName,
        oldValue,
        newValue,
      },
    });

    // Save immediately — stat allocation is player-visible progress
    this.saveSettings(true);

    // Debug log
    this.debugLog('ALLOCATE_STAT', 'Stat point allocated successfully', {
      statName,
      oldValue,
      newValue: this.settings.stats[statName],
      remainingPoints: this.settings.unallocatedStatPoints,
      effect: effectText,
    });

    return true;
  }

  applyRetroactiveNaturalStatGrowth() {
    try {
      // Check if we've already applied retroactive growth
      if (this.settings._retroactiveStatGrowthApplied) {
        return; // Already applied
      }

      const messagesSent = this.settings.activity?.messagesSent || 0;
      const level = this.settings.level || 1;
      const _charactersTyped = this.settings.activity?.charactersTyped || 0;

      // Calculate expected natural stat growth based on activity.
      // Retroactive grant is intentionally conservative to avoid stat inflation on older saves.
      const baseGrowthPer100Messages = 0.08;
      const levelMultiplier = 1 + Math.min(2.5, (level - 1) * 0.002);
      const messageBasedGrowth = Math.floor(
        (messagesSent / 100) * baseGrowthPer100Messages * levelMultiplier
      );

      // Also grant a light level-based base growth.
      const levelBasedGrowth = Math.floor((level - 1) * 0.03);

      // Total retroactive growth to distribute
      const totalGrowth = messageBasedGrowth + levelBasedGrowth;

      if (totalGrowth > 0) {
        const statNames = this.STAT_KEYS;
        let statsAdded = 0;

        // Distribute growth evenly across all stats
        const growthPerStat = Math.floor(totalGrowth / statNames.length);
        const remainder = totalGrowth % statNames.length;

        statNames.forEach((statName, index) => {
          const _currentStat = this.settings.stats[statName] || 0;
          // Add base growth per stat
          let growthToAdd = growthPerStat;
          // Add remainder to first stats
          if (index < remainder) {
            growthToAdd += 1;
          }

          if (growthToAdd > 0) {
            this.settings.stats[statName] += growthToAdd;
            statsAdded += growthToAdd;

            // PER no longer generates random stacked buffs during growth.
          }
        });

        if (statsAdded > 0) {
          // Mark as applied
          this.settings._retroactiveStatGrowthApplied = true;

          // Save immediately
          this.saveSettings(true);

          this.debugLog('RETROACTIVE_STAT_GROWTH', 'Applied retroactive natural stat growth', {
            messagesSent,
            level,
            totalGrowth,
            statsAdded,
            newStats: { ...this.settings.stats },
          });

          // Retroactive growth is silent — logged to debug only.
        }
      }
    } catch (error) {
      this.debugError('RETROACTIVE_STAT_GROWTH', error);
    }
  }

  processNaturalStatGrowth() {
    try {
      const statNames = this.STAT_KEYS;
      let statsGrown = [];

      // Get user level and rank for bonus growth
      const userLevel = this.settings.level || 1;
      const userRank = this.settings.rank || 'E';
      const rankIndex = this.settings.ranks?.indexOf(userRank) || 0;

      // Level-based bonus: +0.002% per level (caps at +2% at level 1000)
      const levelBonus = Math.min(0.02, userLevel * 0.00002);

      // Rank-based bonus: +0.1% per rank tier (E=0%, ..., Shadow Monarch~1.2%)
      const rankBonus = Math.min(0.012, rankIndex * 0.001);

      statNames.forEach((statName) => {
        const currentStat = this.settings.stats[statName] || 0;

        // Balanced growth chance formula (sublinear scaling to avoid runaway loops):
        // Base: 0.12%
        // Stat scaling: sqrt(stat)-based, capped contribution
        // Level/rank add small additive boosts
        const baseChance = 0.0012;
        const statScaling = Math.min(0.018, Math.sqrt(currentStat) * 0.00045);

        // Total growth chance with bonuses
        const growthChance = Math.min(0.05, baseChance + statScaling + levelBonus + rankBonus); // Cap at 5% max

        // Roll for natural growth
        const roll = Math.random();
        if (roll < growthChance) {
          // Natural stat growth!
          const oldValue = currentStat;

          // Small chance for multi-point procs at very high stats.
          let growthAmount = 1;
          if (currentStat >= 500 && Math.random() < 0.005) {
            growthAmount = 3;
          } else if (currentStat >= 250 && Math.random() < 0.02) {
            growthAmount = 2;
          }

          this.settings.stats[statName] += growthAmount;

          // PER no longer generates random stacked buffs during growth.

          statsGrown.push({
            stat: statName,
            oldValue,
            newValue: this.settings.stats[statName],
            growthAmount,
            chance: (growthChance * 100).toFixed(2) + '%',
          });

          this.debugLog('NATURAL_STAT_GROWTH', `Natural ${statName} growth!`, {
            statName,
            oldValue,
            newValue: this.settings.stats[statName],
            growthAmount,
            growthChance: (growthChance * 100).toFixed(2) + '%',
            levelBonus: (levelBonus * 100).toFixed(2) + '%',
            rankBonus: (rankBonus * 100).toFixed(2) + '%',
            roll: roll.toFixed(4),
          });
        }
      });

      // If any stats grew, save and update UI
      if (statsGrown.length > 0) {
        this.applyStatMutationEffects({
          emitPayload: {
            statsGrown,
          },
        });

        // Debounced save — natural growth happens per-message so we coalesce
        this.saveSettings();
      }
    } catch (error) {
      this.debugError('NATURAL_STAT_GROWTH', error);
    }
  }

  /**
   * 3.6 QUEST SYSTEM
   */

  // renderChatQuests() — REMOVED in v3.0.0 (replaced by React QuestList component)

  // ── §3.18 QUEST SYSTEM ───────────────────────────────────────────────────
  // 5 daily quests: Message Master, Character Champion, Channel Explorer,
  // Active Adventurer, Perfect Streak. Midnight reset via checkDailyReset()
  // Celebration animations on completion with targeted DOM updates

  updateQuestProgress(questId, amount) {
    const quest = this.settings.dailyQuests.quests[questId];
    if (!quest || quest.completed) {
      return;
    }

    quest.progress += amount;
    // Cap progress at target to prevent exceeding
    if (quest.progress > quest.target) {
      quest.progress = quest.target;
    }

    if (quest.progress >= quest.target) {
      quest.completed = true;
      this.completeQuest(questId);
    }
  }

  completeQuest(questId) {
    const def = this.questData[questId];
    if (!def) return;

    // Apply vitality bonus to rewards (enhanced by Perception buffs and skill tree)
    const vitalityBaseBonus = this.settings.stats.vitality * 0.05;
    const vitalityAdvancedBonus = Math.max(0, (this.settings.stats.vitality - 10) * 0.01);
    const baseVitalityBonus = vitalityBaseBonus + vitalityAdvancedBonus;

    // Get skill tree bonuses
    let skillAllStatBonus = 0;
    let skillQuestBonus = 0;
    const skillBonuses = this.getSkillTreeBonuses();
    if (skillBonuses?.allStatBonus > 0) skillAllStatBonus = skillBonuses.allStatBonus;
    if (skillBonuses?.questBonus > 0) skillQuestBonus = skillBonuses.questBonus;

    // Skill tree can still amplify vitality rewards.
    // Perception no longer modifies quest rewards (PER now powers crit burst hits).
    const enhancedVitalityBonus = baseVitalityBonus * (1 + skillAllStatBonus) + skillQuestBonus;
    const vitalityBonus = 1 + enhancedVitalityBonus;
    let xpReward = Math.round(def.xp * vitalityBonus);

    // Active skill: Shadow Exchange — double quest rewards (charge-based)
    const questActiveBuffs = this.getActiveSkillBuffs();
    if (questActiveBuffs?.questRewardMultiplier > 1.0) {
      xpReward = Math.round(xpReward * questActiveBuffs.questRewardMultiplier);
      // Consume the charge
      this.consumeActiveSkillCharge('shadow_exchange_active');
    }

    // Award rewards
    const oldLevel = this.settings.level;
    this.settings.xp += xpReward;
    this.settings.totalXP += xpReward;
    this.settings.unallocatedStatPoints += def.statPoints;

    // Emit XP changed event for real-time progress bar updates
    this.emitXPChanged();

    // Save immediately on quest completion (important event)
    this.saveSettings(true);

    // Check level up (will also save if level up occurs)
    this.checkLevelUp(oldLevel);

    // Show notification
    const message =
      `[QUEST COMPLETE] ${def.name}\n` +
      ` +${xpReward} XP${def.statPoints > 0 ? `, +${def.statPoints} stat point(s)` : ''}`;

    this.showNotification(message, 'success', 2500);

    // Quest completion celebration animation
    this.showQuestCompletionCelebration(def.name, xpReward, def.statPoints);

    // Share XP with shadow army
    try {
      this.shareShadowXP(xpReward, 'quest');
    } catch (error) {
      this.errorLog('QUEST_XP', 'Quest shadow XP share error:', error);
    }
  }

  showQuestCompletionCelebration(questName, xpReward, statPoints) {
    try {
      // Try to load Friend or Foe BB font (if CriticalHit plugin is available, it may already be loaded)
      this._loadQuestFont();

      // Find quest card in UI
      const questCards = document.querySelectorAll('.sls-chat-quest-item');
      let questCard = null;

      // Find the completed quest card
      // Using .find() to search for quest card
      questCard = Array.from(questCards).find((card) => {
        const cardText = card.textContent || '';
        return cardText.includes(questName) || card.classList.contains('sls-chat-quest-complete');
      });

      // Create celebration overlay with zoom animation
      const animationType = 'zoom';

      // Build current progress section with all daily quests
      const questProgressHTML = Object.entries(this.settings.dailyQuests.quests)
        .map(([questId, quest]) => {
          const questInfo = this.questData[questId] || { name: questId };
          const percentage = Math.min((quest.progress / quest.target) * 100, 100);
          const isComplete = quest.completed;
          const progressText = isComplete ? quest.target : Math.floor(quest.progress);

          return `
            <div class="sls-quest-progress-item ${isComplete ? 'completed' : ''}" data-quest-id="${questId}">
              <div class="sls-quest-progress-checkbox">
                ${isComplete ? '✓' : '○'}
              </div>
              <div class="sls-quest-progress-info">
                <div class="sls-quest-progress-name">${questInfo.name}</div>
                <div class="sls-quest-progress-bar-container">
                  <div class="sls-quest-progress-bar">
                    <div class="sls-quest-progress-fill" style="width: ${percentage}%"></div>
                  </div>
                  <div class="sls-quest-progress-text">${progressText}/${quest.target}</div>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      const celebration = document.createElement('div');
      celebration.className = `sls-quest-celebration ${animationType}`;
      celebration.innerHTML = `
        <div class="sls-quest-celebration-content">
          <div class="sls-quest-notification-header">
            <div class="sls-quest-notification-title">Quest Notification [!]</div>
            <div class="sls-quest-notification-subtitle">Daily Quest Completed</div>
          </div>
          <div class="sls-quest-completed-name">${this.escapeHtml(questName)}</div>
          <div class="sls-quest-current-progress">
            <div class="sls-quest-progress-title">Current Progress</div>
            <div class="sls-quest-progress-list">
              ${questProgressHTML}
            </div>
          </div>
          <div class="sls-quest-confirm-button-container">
            <button class="sls-quest-confirm-button">Confirm</button>
          </div>
        </div>
      `;

      // Always center on screen for better visibility
      celebration.style.left = '50%';
      celebration.style.top = '50%';
      celebration.style.transform = 'translate(-50%, -50%)';
      // Opacity starts at 0, CSS animation handles fade-in only (stays visible)
      celebration.style.opacity = '0';

      // Highlight quest card if found (but don't position dialog there)
      if (questCard) {
        questCard.classList.add('sls-quest-celebrating');
        // Keep highlighting until notification is closed
        celebration._questCard = questCard;
      }

      document.body.appendChild(celebration);

      // Create particles
      this.createQuestParticles(celebration);

      // Function to close notification with fade-out
      const closeNotification = () => {
        if (celebration._progressInterval) {
          clearInterval(celebration._progressInterval);
        }
        // Remove quest card highlight
        if (celebration._questCard) {
          celebration._questCard.classList.remove('sls-quest-celebrating');
        }
        // Fast fade-out animation (0.2s)
        celebration.style.animation = 'quest-celebration-fade-out 0.2s ease-out forwards';
        setTimeout(() => {
          if (celebration && celebration.parentNode) {
            celebration.remove();
          }
        }, 200);
      };

      // Confirm button click handler
      const confirmButton = celebration.querySelector('.sls-quest-confirm-button');
      if (confirmButton) {
        confirmButton.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent event bubbling
          closeNotification();
        });
      }

      // Prevent clicking outside to close (only button closes it)
      celebration.addEventListener('click', (e) => {
        // Only close if clicking directly on the celebration background, not on content
        if (e.target === celebration) {
          e.stopPropagation();
        }
      });

      // Update progress in real-time — targeted DOM updates instead of full innerHTML rebuild
      const progressUpdateInterval = setInterval(() => {
        if (!celebration.parentNode) {
          clearInterval(progressUpdateInterval);
          return;
        }

        Object.entries(this.settings.dailyQuests.quests).forEach(([questId, quest]) => {
          const item = celebration.querySelector(`[data-quest-id="${questId}"]`);
          if (!item) return;

          const isComplete = quest.completed;
          const percentage = Math.min((quest.progress / quest.target) * 100, 100);
          const progressText = isComplete ? quest.target : Math.floor(quest.progress);

          // Update completed state
          item.classList.toggle('completed', isComplete);

          // Update checkbox
          const checkbox = item.querySelector('.sls-quest-progress-checkbox');
          if (checkbox) checkbox.textContent = isComplete ? '✓' : '○';

          // Update progress fill width
          const fill = item.querySelector('.sls-quest-progress-fill');
          if (fill) fill.style.width = `${percentage}%`;

          // Update progress text
          const text = item.querySelector('.sls-quest-progress-text');
          if (text) text.textContent = `${progressText}/${quest.target}`;
        });
      }, 500);

      // Clear interval when celebration is removed
      celebration._progressInterval = progressUpdateInterval;

      // Ensure cleanup on plugin stop
      if (!this._questCelebrations) {
        this._questCelebrations = new Set();
      }
      this._questCelebrations.add(celebration);

      // Store reference for cleanup
      celebration._cleanup = () => {
        if (celebration._progressInterval) {
          clearInterval(celebration._progressInterval);
        }
      };

      this.debugLog('QUEST_CELEBRATION', 'Quest completion celebration shown', {
        questName,
        xpReward,
        statPoints,
      });
    } catch (error) {
      this.debugError('QUEST_CELEBRATION', error);
    }
  }

  /**
   * Load Friend or Foe BB font for quest notification
   * Uses same font files as CriticalHit plugin if available
   */
  _loadQuestFont() {
    try {
      // Check if font is already loaded (by CriticalHit plugin or previous call)
      const fontName = 'Friend or Foe BB';
      const existingStyle = document.getElementById('sls-quest-font-friend-or-foe-bb');
      if (existingStyle) {
        return; // Font already loaded
      }

      // Check if CriticalHit plugin has loaded the font
      if (document.fonts && document.fonts.check) {
        document.fonts.ready.then(() => {
          setTimeout(() => {
            if (document.fonts.check(`16px "${fontName}"`)) {
              this.debugLog('QUEST_FONT', 'Friend or Foe BB font already available');
              return; // Font already loaded by another plugin
            }
            // Try to load font from CriticalHit's font path
            this._loadFontFromCriticalHit();
          }, 100);
        });
      } else {
        // Fallback: Try to load from CriticalHit's font path
        this._loadFontFromCriticalHit();
      }
    } catch (error) {
      this.debugError('QUEST_FONT_LOAD', error);
    }
  }

  /**
   * Attempt to load font from CriticalHit plugin's font folder
   */
  _loadFontFromCriticalHit() {
    try {
      // Try to load font from CriticalHit plugin using embedded base64 method
      const critPlugin = BdApi.Plugins.get('CriticalHit');
      if (critPlugin && critPlugin.instance) {
        const critInstance = critPlugin.instance;
        // Use loadLocalFont instead of getFontsFolderPath (which is deprecated)
        if (typeof critInstance.loadLocalFont === 'function') {
          const fontLoaded = critInstance.loadLocalFont('Friend or Foe BB');
          if (fontLoaded) {
            this.debugLog(
              'QUEST_FONT',
              'Friend or Foe BB font loaded via CriticalHit loadLocalFont (base64)'
            );
            return;
          }
        }
        // Fallback: Try deprecated getFontsFolderPath (but it now returns null)
        if (typeof critInstance.getFontsFolderPath === 'function') {
          const fontsPath = critInstance.getFontsFolderPath();
          // If getFontsFolderPath returns null, fonts are embedded - skip file:// URL loading
          if (!fontsPath) {
            this.debugLog(
              'QUEST_FONT',
              'CriticalHit uses embedded fonts - font should already be loaded'
            );
            return;
          }
          const fontFileName = 'FriendorFoeBB';

          // Create @font-face CSS (legacy fallback - should not be used)
          const fontStyle = document.createElement('style');
          fontStyle.id = 'sls-quest-font-friend-or-foe-bb';
          fontStyle.textContent = `
            @font-face {
              font-family: 'Friend or Foe BB';
              src: url('${fontsPath}${fontFileName}.woff2') format('woff2'),
                   url('${fontsPath}${fontFileName}.woff') format('woff'),
                   url('${fontsPath}${fontFileName}.ttf') format('truetype');
              font-weight: normal;
              font-style: normal;
              font-display: swap;
            }
          `;
          document.head.appendChild(fontStyle);
          this.debugLog(
            'QUEST_FONT',
            'Friend or Foe BB font loaded from CriticalHit path (legacy)'
          );
          return;
        }
      }

      // If CriticalHit not available, try default BetterDiscord fonts path
      const defaultFontsPath = BdApi.Plugins.folder + '/../fonts/';
      const fontFileName = 'FriendorFoeBB';

      const fontStyle = document.createElement('style');
      fontStyle.id = 'sls-quest-font-friend-or-foe-bb';
      fontStyle.textContent = `
        @font-face {
          font-family: 'Friend or Foe BB';
          src: url('${defaultFontsPath}${fontFileName}.woff2') format('woff2'),
               url('${defaultFontsPath}${fontFileName}.woff') format('woff'),
               url('${defaultFontsPath}${fontFileName}.ttf') format('truetype');
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `;
      document.head.appendChild(fontStyle);
      this.debugLog('QUEST_FONT', 'Friend or Foe BB font loaded from default path');
    } catch (error) {
      this.debugError('QUEST_FONT_LOAD_CRITICALHIT', error);
      // Font will fall back to Orbitron or Segoe UI
    }
  }

  createQuestParticles(container) {
    const particleCount = 30;
    const colors = ['#5a3a8f', '#4b2882', '#3d1f6b', '#8a2be2', '#00ff88'];

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'sls-quest-particle';
      particle.style.left = '50%';
      particle.style.top = '50%';
      particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

      const angle = (Math.PI * 2 * i) / particleCount;
      const distance = 100 + Math.random() * 50;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;

      particle.style.setProperty('--particle-x', `${x}px`);
      particle.style.setProperty('--particle-y', `${y}px`);

      container.appendChild(particle);

      setTimeout(() => {
        particle.remove();
      }, 2000);
    }
  }

  // ── §3.19 ACHIEVEMENT SYSTEM ─────────────────────────────────────────────
  // 76 achievements across 7 tiers: E-Rank → Monarch → Shadow Monarch
  // Each achievement can unlock an equippable title with stat bonuses
  // checkAchievements() runs after every message to evaluate conditions
  // Achievement types: level, messages, crits, stat, channels, time, characters

  checkAchievements() {
    const achievements = this.getAchievementDefinitions();
    let newAchievements = [];

    // Build a Set for O(1) lookups (was O(n) .includes() per achievement — 3800 comparisons/msg)
    if (!this._unlockedAchievementSet || this._unlockedAchievementSetSize !== this.settings.achievements.unlocked.length) {
      this._unlockedAchievementSet = new Set(this.settings.achievements.unlocked);
      this._unlockedAchievementSetSize = this.settings.achievements.unlocked.length;
    }

    achievements.forEach((achievement) => {
      // Skip if already unlocked — O(1) Set.has vs O(n) Array.includes
      if (this._unlockedAchievementSet.has(achievement.id)) {
        return;
      }

      // Check if achievement is unlocked
      if (this.checkAchievementCondition(achievement)) {
        this.unlockAchievement(achievement);
        this._unlockedAchievementSet.add(achievement.id);
        this._unlockedAchievementSetSize = this.settings.achievements.unlocked.length;
        newAchievements.push(achievement);
      }
    });

    return newAchievements;
  }

  checkAchievementCondition(achievement) {
    const condition = achievement.condition;

    switch (condition.type) {
      case 'messages':
        return this.settings.activity.messagesSent >= condition.value;
      case 'characters':
        return this.settings.activity.charactersTyped >= condition.value;
      case 'level':
        return this.settings.level >= condition.value;
      case 'time':
        return this.settings.activity.timeActive >= condition.value;
      case 'channels':
        const channelsVisited = this.settings.activity?.channelsVisited;
        if (channelsVisited instanceof Set) {
          return channelsVisited.size >= condition.value;
        } else if (Array.isArray(channelsVisited)) {
          return channelsVisited.length >= condition.value;
        }
        return false;
      case 'achievements':
        return (this.settings.achievements?.unlocked?.length || 0) >= condition.value;
      case 'crits':
        return (this.settings.activity?.critsLanded || 0) >= condition.value;
      case 'stat':
        return this.settings.stats?.[condition.stat] >= condition.value;
      case 'compound':
        return (condition.conditions || []).every((c) =>
          this.checkAchievementCondition({ condition: c })
        );
      default:
        return false;
    }
  }

  getAchievementDefinitions() {
    // Check cache first (static definitions never change)
    if (this._cache.achievementDefinitions) {
      return this._cache.achievementDefinitions;
    }

    // ============================================================================
    // ACHIEVEMENT DEFINITIONS (791 lines)
    //
    // CATEGORIES:
    // 1. Early Game (E-Rank) - Lines 5505-5550
    // 2. Mid Game (D-C Rank) - Lines 5550-5650
    // 3. Advanced (B-A Rank) - Lines 5650-5800
    // 4. Elite (S-SS Rank) - Lines 5800-6000
    // 5. Legendary (SSS+ & NH) - Lines 6000-6150
    // 6. Monarch Tier - Lines 6150-6250
    // 7. Special Achievements - Lines 6250-6291
    // ============================================================================
    const achievements = [
      // ========================================
      // CATEGORY 1: EARLY GAME (E-RANK)
      // ========================================
      {
        id: 'weakest_hunter',
        name: 'The Weakest Hunter',
        description: 'Send 50 messages',
        condition: { type: 'messages', value: 50 },
        title: 'The Weakest Hunter',
        titleBonus: { xp: 0.03, strengthPercent: 0.05 }, // +3% XP, +5% Strength
      },
      {
        id: 'e_rank',
        name: 'E-Rank Hunter',
        description: 'Send 200 messages',
        condition: { type: 'messages', value: 200 },
        title: 'E-Rank Hunter',
        titleBonus: { xp: 0.08, strengthPercent: 0.05 }, // +8% XP, +5% STR
      },

      // ========================================
      // CATEGORY 2: MID GAME (D-C RANK)
      // ========================================
      {
        id: 'd_rank',
        name: 'D-Rank Hunter',
        description: 'Send 500 messages',
        condition: { type: 'messages', value: 500 },
        title: 'D-Rank Hunter',
        titleBonus: { xp: 0.12, agilityPercent: 0.05 }, // +12% XP, +5% AGI
      },
      {
        id: 'c_rank',
        name: 'C-Rank Hunter',
        description: 'Send 1,000 messages',
        condition: { type: 'messages', value: 1000 },
        title: 'C-Rank Hunter',
        titleBonus: { xp: 0.18, critChance: 0.01, strengthPercent: 0.05 }, // +18% XP, +1% Crit, +5% STR
      },

      // ========================================
      // CATEGORY 3: ADVANCED (B-A RANK)
      // ========================================
      {
        id: 'b_rank',
        name: 'B-Rank Hunter',
        description: 'Send 2,500 messages',
        condition: { type: 'messages', value: 2500 },
        title: 'B-Rank Hunter',
        titleBonus: { xp: 0.25, critChance: 0.02, agilityPercent: 0.05, intelligencePercent: 0.05 }, // +25% XP, +2% Crit, +5% AGI, +5% INT
      },
      {
        id: 'a_rank',
        name: 'A-Rank Hunter',
        description: 'Send 5,000 messages',
        condition: { type: 'messages', value: 5000 },
        title: 'A-Rank Hunter',
        titleBonus: { xp: 0.32, critChance: 0.02, strengthPercent: 0.05, agilityPercent: 0.05 }, // +32% XP, +2% Crit, +5% STR, +5% AGI
      },

      // ========================================
      // CATEGORY 4: ELITE (S-SS RANK)
      // ========================================
      {
        id: 's_rank',
        name: 'S-Rank Hunter',
        description: 'Send 10,000 messages',
        condition: { type: 'messages', value: 10000 },
        title: 'S-Rank Hunter',
        titleBonus: { xp: 0.4, strengthPercent: 0.1, critChance: 0.02 }, // +40% XP, +10% Strength, +2% Crit Chance
      },
      // Character/Writing Milestones
      {
        id: 'shadow_extraction',
        name: 'Shadow Extraction',
        description: 'Type 25,000 characters — the Shadow Monarch\'s core power to raise the dead',
        condition: { type: 'characters', value: 25000 },
        title: 'Shadow Extraction',
        titleBonus: { xp: 0.15, intelligencePercent: 0.1, critChance: 0.01 }, // Shadow Extraction: necromantic INT ability
      },
      {
        id: 'domain_expansion',
        name: 'Domain Expansion',
        description: 'Reach Level 100 and type 75,000 characters — territorial dominance amplifying all power within',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 100 }, { type: 'characters', value: 75000 }] },
        title: 'Domain Expansion',
        titleBonus: { xp: 0.3, intelligencePercent: 0.15, vitalityPercent: 0.1, perceptionPercent: 0.05, critChance: 0.02 }, // Domain: area control INT, endurance, battlefield awareness
      },
      {
        id: 'ruler_authority',
        name: "Ruler's Authority",
        description: 'Reach Level 200 and type 150,000 characters — the telekinetic power wielded by the Rulers',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 200 }, { type: 'characters', value: 150000 }] },
        title: "Ruler's Authority",
        titleBonus: { xp: 0.5, intelligencePercent: 0.2, perceptionPercent: 0.15, critChance: 0.03 }, // Ruler's Authority: telekinetic INT mastery, cosmic perception
      },
      // Level Milestones (1-2000)
      {
        id: 'first_steps',
        name: 'First Steps',
        description: 'Reach Level 1',
        condition: { type: 'level', value: 1 },
        title: 'First Steps',
        titleBonus: { xp: 0.02, critChance: 0.005 }, // +2% XP, +0.5% Crit
      },
      {
        id: 'novice_hunter',
        name: 'Novice Hunter',
        description: 'Reach Level 5',
        condition: { type: 'level', value: 5 },
        title: 'Novice Hunter',
        titleBonus: { xp: 0.05, critChance: 0.01, strengthPercent: 0.05 }, // +5% XP, +1% Crit, +5% STR
      },
      {
        id: 'rising_hunter',
        name: 'Rising Hunter',
        description: 'Reach Level 10',
        condition: { type: 'level', value: 10 },
        title: 'Rising Hunter',
        titleBonus: { xp: 0.08, critChance: 0.01, agilityPercent: 0.05 }, // +8% XP, +1% Crit, +5% AGI
      },
      {
        id: 'awakened',
        name: 'The Awakened',
        description: 'Reach Level 15',
        condition: { type: 'level', value: 15 },
        title: 'The Awakened',
        titleBonus: { xp: 0.12, critChance: 0.015, strengthPercent: 0.05, agilityPercent: 0.05 }, // +12% XP, +1.5% Crit, +5% STR/AGI
      },
      {
        id: 'experienced_hunter',
        name: 'Experienced Hunter',
        description: 'Reach Level 20',
        condition: { type: 'level', value: 20 },
        title: 'Experienced Hunter',
        titleBonus: {
          xp: 0.15,
          critChance: 0.02,
          strengthPercent: 0.05,
          intelligencePercent: 0.05,
        }, // +15% XP, +2% Crit, +5% STR/INT
      },
      {
        id: 'shadow_army',
        name: 'Shadow Army Commander',
        description: 'Reach Level 50 — commander of the shadow soldiers, Jin-Woo\'s extracted army',
        condition: { type: 'level', value: 50 },
        title: 'Shadow Army Commander',
        titleBonus: { xp: 0.22, intelligencePercent: 0.1, agilityPercent: 0.05, critChance: 0.02 }, // Shadow Commander: INT to command army, tactical mobility
      },
      {
        id: 'elite_hunter',
        name: 'Elite Hunter',
        description: 'Reach Level 40',
        condition: { type: 'level', value: 40 },
        title: 'Elite Hunter',
        titleBonus: {
          xp: 0.25,
          critChance: 0.025,
          strengthPercent: 0.1,
          agilityPercent: 0.05,
          intelligencePercent: 0.05,
        }, // +25% XP, +2.5% Crit, +10% STR, +5% AGI/INT
      },
      {
        id: 'necromancer',
        name: 'Necromancer',
        description: 'Reach Level 100 — the forbidden class obtained after Jin-Woo\'s job change quest',
        condition: { type: 'level', value: 100 },
        title: 'Necromancer',
        titleBonus: {
          xp: 0.35,
          intelligencePercent: 0.15,
          vitalityPercent: 0.05,
          agilityPercent: 0.05,
          critChance: 0.02,
        }, // Necromancer class: heavy INT (shadow magic), some endurance and mobility
      },
      {
        id: 'national_level',
        name: 'National Level Hunter',
        description: 'Reach Level 300 — one of the elite few hunters who represent an entire nation\'s power',
        condition: { type: 'level', value: 300 },
        title: 'National Level Hunter',
        titleBonus: {
          xp: 0.8,
          strengthPercent: 0.2,
          agilityPercent: 0.15,
          intelligencePercent: 0.15,
          vitalityPercent: 0.1,
          critChance: 0.06,
        }, // National Level: elite above S-rank, strong all-round with combat focus
      },
      {
        id: 'monarch_candidate',
        name: 'Monarch Candidate',
        description: 'Reach Level 500 — on the threshold of transcending mortal hunter limits',
        condition: { type: 'level', value: 500 },
        title: 'Monarch Candidate',
        titleBonus: {
          xp: 1.2,
          strengthPercent: 0.25,
          agilityPercent: 0.25,
          intelligencePercent: 0.2,
          vitalityPercent: 0.2,
          critChance: 0.1,
        }, // Monarch Candidate: approaching transcendence, strong across all stats
      },
      {
        id: 'high_rank_hunter',
        name: 'High-Rank Hunter',
        description: 'Reach Level 150',
        condition: { type: 'level', value: 150 },
        title: 'High-Rank Hunter',
        titleBonus: {
          xp: 0.6,
          critChance: 0.06,
          strengthPercent: 0.15,
          agilityPercent: 0.15,
          intelligencePercent: 0.15,
          vitalityPercent: 0.1,
        }, // +60% XP, +6% Crit, +15% STR/AGI/INT, +10% VIT
      },
      {
        id: 's_rank_elite',
        name: 'S-Rank Elite',
        description: 'Reach Level 200',
        condition: { type: 'level', value: 200 },
        title: 'S-Rank Elite',
        titleBonus: {
          xp: 0.7,
          critChance: 0.07,
          strengthPercent: 0.2,
          agilityPercent: 0.2,
          intelligencePercent: 0.15,
          vitalityPercent: 0.15,
        }, // +70% XP, +7% Crit, +20% STR/AGI, +15% INT/VIT
      },
      {
        id: 'transcendent_hunter',
        name: 'Transcendent Hunter',
        description: 'Reach Level 250',
        condition: { type: 'level', value: 250 },
        title: 'Transcendent Hunter',
        titleBonus: {
          xp: 0.8,
          critChance: 0.08,
          strengthPercent: 0.2,
          agilityPercent: 0.2,
          intelligencePercent: 0.2,
          vitalityPercent: 0.15,
        }, // +80% XP, +8% Crit, +20% All Stats, +15% VIT
      },
      {
        id: 'legendary_hunter',
        name: 'Legendary Hunter',
        description: 'Reach Level 300',
        condition: { type: 'level', value: 300 },
        title: 'Legendary Hunter',
        titleBonus: {
          xp: 0.9,
          critChance: 0.09,
          strengthPercent: 0.25,
          agilityPercent: 0.25,
          intelligencePercent: 0.2,
          vitalityPercent: 0.2,
        }, // +90% XP, +9% Crit, +25% STR/AGI, +20% INT/VIT
      },
      {
        id: 'mythic_hunter',
        name: 'Mythic Hunter',
        description: 'Reach Level 400',
        condition: { type: 'level', value: 400 },
        title: 'Mythic Hunter',
        titleBonus: {
          xp: 1.05,
          critChance: 0.1,
          strengthPercent: 0.25,
          agilityPercent: 0.25,
          intelligencePercent: 0.25,
          vitalityPercent: 0.2,
        }, // +105% XP, +10% Crit, +25% All Stats, +20% VIT
      },
      {
        id: 'divine_hunter',
        name: 'Divine Hunter',
        description: 'Reach Level 500',
        condition: { type: 'level', value: 500 },
        title: 'Divine Hunter',
        titleBonus: {
          xp: 1.2,
          critChance: 0.12,
          strengthPercent: 0.3,
          agilityPercent: 0.3,
          intelligencePercent: 0.25,
          vitalityPercent: 0.25,
        }, // +120% XP, +12% Crit, +30% STR/AGI, +25% INT/VIT
      },
      {
        id: 'celestial_hunter',
        name: 'Celestial Hunter',
        description: 'Reach Level 600',
        condition: { type: 'level', value: 600 },
        title: 'Celestial Hunter',
        titleBonus: {
          xp: 1.35,
          critChance: 0.13,
          strengthPercent: 0.3,
          agilityPercent: 0.3,
          intelligencePercent: 0.3,
          vitalityPercent: 0.25,
        }, // +135% XP, +13% Crit, +30% All Stats, +25% VIT
      },
      {
        id: 'national_hunter_elite',
        name: 'National Hunter Elite',
        description: 'Reach Level 700',
        condition: { type: 'level', value: 700 },
        title: 'National Hunter Elite',
        titleBonus: {
          xp: 1.5,
          critChance: 0.15,
          strengthPercent: 0.35,
          agilityPercent: 0.35,
          intelligencePercent: 0.3,
          vitalityPercent: 0.3,
        }, // +150% XP, +15% Crit, +35% STR/AGI, +30% INT/VIT
      },
      {
        id: 'monarch_aspirant',
        name: 'Monarch Aspirant',
        description: 'Reach Level 800',
        condition: { type: 'level', value: 800 },
        title: 'Monarch Aspirant',
        titleBonus: {
          xp: 1.65,
          critChance: 0.16,
          strengthPercent: 0.35,
          agilityPercent: 0.35,
          intelligencePercent: 0.35,
          vitalityPercent: 0.3,
        }, // +165% XP, +16% Crit, +35% All Stats, +30% VIT
      },
      {
        id: 'monarch_heir',
        name: 'Monarch Heir',
        description: 'Reach Level 900',
        condition: { type: 'level', value: 900 },
        title: 'Monarch Heir',
        titleBonus: {
          xp: 1.8,
          critChance: 0.18,
          strengthPercent: 0.4,
          agilityPercent: 0.4,
          intelligencePercent: 0.35,
          vitalityPercent: 0.35,
        }, // +180% XP, +18% Crit, +40% STR/AGI, +35% INT/VIT
      },
      {
        id: 'true_monarch',
        name: 'True Monarch',
        description: 'Reach Level 1000',
        condition: { type: 'level', value: 1000 },
        title: 'True Monarch',
        titleBonus: {
          xp: 2.0,
          critChance: 0.2,
          strengthPercent: 0.4,
          agilityPercent: 0.4,
          intelligencePercent: 0.4,
          vitalityPercent: 0.35,
        }, // +200% XP, +20% Crit, +40% All Stats, +35% VIT
      },
      {
        id: 'monarch_transcendent',
        name: 'Monarch Transcendent',
        description: 'Reach Level 1200',
        condition: { type: 'level', value: 1200 },
        title: 'Monarch Transcendent',
        titleBonus: {
          xp: 2.25,
          critChance: 0.22,
          strengthPercent: 0.45,
          agilityPercent: 0.45,
          intelligencePercent: 0.4,
          vitalityPercent: 0.4,
        }, // +225% XP, +22% Crit, +45% STR/AGI, +40% INT/VIT
      },
      {
        id: 'monarch_supreme',
        name: 'Monarch Supreme',
        description: 'Reach Level 1500',
        condition: { type: 'level', value: 1500 },
        title: 'Monarch Supreme',
        titleBonus: {
          xp: 2.5,
          critChance: 0.25,
          strengthPercent: 0.45,
          agilityPercent: 0.45,
          intelligencePercent: 0.45,
          vitalityPercent: 0.4,
        }, // +250% XP, +25% Crit, +45% All Stats, +40% VIT
      },
      {
        id: 'monarch_ultimate',
        name: 'Monarch Ultimate',
        description: 'Reach Level 1800',
        condition: { type: 'level', value: 1800 },
        title: 'Monarch Ultimate',
        titleBonus: {
          xp: 2.75,
          critChance: 0.27,
          strengthPercent: 0.5,
          agilityPercent: 0.5,
          intelligencePercent: 0.45,
          vitalityPercent: 0.45,
        }, // +275% XP, +27% Crit, +50% STR/AGI, +45% INT/VIT
      },
      {
        id: 'shadow_monarch_final',
        name: 'Shadow Monarch (Final)',
        description: 'Reach Level 2000',
        condition: { type: 'level', value: 2000 },
        title: 'Shadow Monarch (Final)',
        titleBonus: {
          xp: 3.0,
          critChance: 0.3,
          strengthPercent: 0.5,
          agilityPercent: 0.5,
          intelligencePercent: 0.5,
          vitalityPercent: 0.5,
        }, // +300% XP, +30% Crit, +50% All Stats
      },
      // Activity/Time Milestones
      {
        id: 'dungeon_grinder',
        name: 'Dungeon Grinder',
        description: 'Be active for 5 hours',
        condition: { type: 'time', value: 300 }, // minutes
        title: 'Dungeon Grinder',
        titleBonus: { xp: 0.06, vitalityPercent: 0.05 }, // +6% XP, +5% VIT
      },
      {
        id: 'gate_explorer',
        name: 'Gate Explorer',
        description: 'Be active for 20 hours',
        condition: { type: 'time', value: 1200 },
        title: 'Gate Explorer',
        titleBonus: { xp: 0.14, vitalityPercent: 0.05, agilityPercent: 0.05 }, // +14% XP, +5% VIT, +5% AGI
      },
      {
        id: 'raid_veteran',
        name: 'Raid Veteran',
        description: 'Be active for 50 hours',
        condition: { type: 'time', value: 3000 },
        title: 'Raid Veteran',
        titleBonus: { xp: 0.24, vitalityPercent: 0.1, strengthPercent: 0.05 }, // +24% XP, +10% VIT, +5% STR
      },
      {
        id: 'eternal_hunter',
        name: 'Eternal Hunter',
        description: 'Be active for 100 hours',
        condition: { type: 'time', value: 6000 },
        title: 'Eternal Hunter',
        titleBonus: { xp: 0.33, vitalityPercent: 0.1, strengthPercent: 0.05, agilityPercent: 0.05 }, // +33% XP, +10% VIT, +5% STR, +5% AGI
      },
      // Channel/Exploration Milestones
      {
        id: 'gate_traveler',
        name: 'Gate Traveler',
        description: 'Visit 5 unique channels',
        condition: { type: 'channels', value: 5 },
        title: 'Gate Traveler',
        titleBonus: { xp: 0.04, agilityPercent: 0.05 }, // +4% XP, +5% AGI
      },
      {
        id: 'dungeon_master',
        name: 'Dungeon Master',
        description: 'Visit 15 unique channels',
        condition: { type: 'channels', value: 15 },
        title: 'Dungeon Master',
        titleBonus: { xp: 0.11, intelligencePercent: 0.05, agilityPercent: 0.05 }, // +11% XP, +5% INT, +5% AGI
      },
      {
        id: 'dimension_walker',
        name: 'Dimension Walker',
        description: 'Visit 30 unique channels',
        condition: { type: 'channels', value: 30 },
        title: 'Dimension Walker',
        titleBonus: { xp: 0.19, intelligencePercent: 0.1, agilityPercent: 0.05, critChance: 0.01 }, // +19% XP, +10% INT, +5% AGI, +1% Crit
      },
      {
        id: 'realm_conqueror',
        name: 'Realm Conqueror',
        description: 'Visit 50 unique channels',
        condition: { type: 'channels', value: 50 },
        title: 'Realm Conqueror',
        titleBonus: { xp: 0.27, intelligencePercent: 0.1, agilityPercent: 0.1, critChance: 0.02 }, // +27% XP, +10% INT, +10% AGI, +2% Crit
      },
      // Special Titles (High Requirements)
      {
        id: 'shadow_monarch',
        name: 'Shadow Monarch',
        description: 'Reach Shadow Monarch rank (Lv 2000) — Ashborn, the King of the Dead, supreme ruler of all shadows',
        condition: { type: 'level', value: 2000 },
        title: 'Shadow Monarch',
        titleBonus: { xp: 5.0, strengthPercent: 1.0, agilityPercent: 1.0, intelligencePercent: 1.0, vitalityPercent: 1.0, perceptionPercent: 1.0, critChance: 0.3 }, // ASHBORN: supreme god-tier — 100% ALL stats, 500% XP, 30% Crit
      },
      {
        id: 'monarch_of_destruction',
        name: 'Monarch of Destruction',
        description: 'Reach Monarch+ rank (Lv 1500) — Antares, the King of Dragons and ultimate adversary',
        condition: { type: 'level', value: 1500 },
        title: 'Monarch of Destruction',
        titleBonus: { xp: 2.5, strengthPercent: 0.5, vitalityPercent: 0.4, intelligencePercent: 0.3, critChance: 0.2 }, // Antares: supreme destructive force, dragon durability, breath attacks, devastating strikes
      },
      {
        id: 'the_ruler',
        name: 'The Ruler',
        description: 'Reach National Hunter rank (Lv 700) and be active for 200 hours — emissary of the Absolute Being',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 700 }, { type: 'time', value: 12000 }] },
        title: 'The Ruler',
        titleBonus: {
          xp: 1.4,
          intelligencePercent: 0.35,
          perceptionPercent: 0.3,
          vitalityPercent: 0.2,
          strengthPercent: 0.15,
          critChance: 0.1,
        }, // Ruler: divine telekinetic power, cosmic awareness, light endurance
      },
      // Character-Based Titles
      {
        id: 'sung_jin_woo',
        name: 'Sung Jin-Woo',
        description: 'Reach S-Rank (Lv 200) and send 10,000 messages — the Hunter who defied fate',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 200 }, { type: 'messages', value: 10000 }] },
        title: 'Sung Jin-Woo',
        titleBonus: { xp: 0.5, strengthPercent: 0.1, agilityPercent: 0.15, intelligencePercent: 0.1, critChance: 0.05 }, // Jin-Woo: assassin AGI/Crit, growing INT, balanced warrior
      },
      {
        id: 'the_weakest',
        name: 'The Weakest',
        description: 'Send your first 10 messages',
        condition: { type: 'messages', value: 10 },
        title: 'The Weakest',
        titleBonus: { xp: 0.02, perceptionPercent: 0.05 }, // +2% XP, +5% Perception
      },
      {
        id: 's_rank_jin_woo',
        name: 'S-Rank Hunter Jin-Woo',
        description: 'Reach S-Rank (Lv 200) — Korea\'s 10th S-Rank Hunter',
        condition: { type: 'level', value: 200 },
        title: 'S-Rank Hunter Jin-Woo',
        titleBonus: {
          xp: 0.55,
          agilityPercent: 0.15,
          strengthPercent: 0.1,
          intelligencePercent: 0.1,
          critChance: 0.06,
          perceptionPercent: 0.05,
        }, // S-Rank Jin-Woo: assassin speed, dual dagger crits, shadow INT, combat awareness
      },
      {
        id: 'shadow_sovereign',
        name: 'Shadow Sovereign',
        description: 'Reach Monarch+ rank (Lv 1500) and send 18,000 messages — heir to the shadow throne',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1500 }, { type: 'messages', value: 18000 }] },
        title: 'Shadow Sovereign',
        titleBonus: { xp: 2.3, intelligencePercent: 0.4, agilityPercent: 0.3, strengthPercent: 0.25, critChance: 0.15 }, // Shadow heir: necromantic INT, shadow speed, growing power
      },
      {
        id: 'ashborn_successor',
        name: "Ashborn's Successor",
        description: 'Reach Monarch+ rank (Lv 1500) and type 500,000 characters — chosen vessel of the Shadow Monarch',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1500 }, { type: 'characters', value: 500000 }] },
        title: "Ashborn's Successor",
        titleBonus: { xp: 2.4, intelligencePercent: 0.45, agilityPercent: 0.3, strengthPercent: 0.25, vitalityPercent: 0.2, critChance: 0.15 }, // Ashborn's vessel: inheriting shadow necromancy, combat prowess, shadow endurance
      },
      // Ability/Skill Titles
      {
        id: 'arise',
        name: 'Arise',
        description: 'Unlock 10 achievements — the iconic command to summon shadow soldiers from the dead',
        condition: { type: 'achievements', value: 10 },
        title: 'Arise',
        titleBonus: { xp: 0.12, intelligencePercent: 0.1, critChance: 0.01 }, // Arise: invocation of shadow extraction, pure INT
      },
      {
        id: 'shadow_exchange',
        name: 'Shadow Exchange',
        description: 'Send 3,000 messages — instant teleportation by swapping position with a shadow soldier',
        condition: { type: 'messages', value: 3000 },
        title: 'Shadow Exchange',
        titleBonus: { xp: 0.2, agilityPercent: 0.15, critChance: 0.02 }, // Shadow Exchange: instant repositioning, pure AGI mobility
      },
      {
        id: 'dagger_throw_master',
        name: 'Dagger Throw Master',
        description:
          'Land 1,000 critical hits. Special: Agility-scaled (capped) chance for 150x crit multiplier! — Jin-Woo\'s lethal ranged precision',
        condition: { type: 'crits', value: 1000 },
        title: 'Dagger Throw Master',
        titleBonus: { xp: 0.25, critChance: 0.06, agilityPercent: 0.1, perceptionPercent: 0.1 }, // Dagger Throw: speed + precision + lethal accuracy
      },
      {
        id: 'stealth_master',
        name: 'Stealth Master',
        description: 'Be active for 30 hours during off-peak hours — Jin-Woo\'s ability to erase his presence completely',
        condition: { type: 'time', value: 1800 },
        title: 'Stealth Master',
        titleBonus: { xp: 0.18, agilityPercent: 0.1, perceptionPercent: 0.1, critChance: 0.03 }, // Stealth: evasion + counter-detection + ambush crits
      },
      {
        id: 'mana_manipulator',
        name: 'Mana Manipulator',
        description: 'Reach 15 Intelligence stat — mastery over raw mana energy',
        condition: { type: 'stat', stat: 'intelligence', value: 15 },
        title: 'Mana Manipulator',
        titleBonus: { xp: 0.22, intelligencePercent: 0.15, perceptionPercent: 0.05 }, // Mana Mastery: heavy INT + mana sense (PER)
      },
      {
        id: 'shadow_storage',
        name: 'Shadow Storage',
        description: 'Visit 25 unique channels — storing shadow soldiers in a pocket dimension across locations',
        condition: { type: 'channels', value: 25 },
        title: 'Shadow Storage',
        titleBonus: { xp: 0.16, intelligencePercent: 0.1, agilityPercent: 0.05 }, // Shadow Storage: INT to manage pocket dimension, cross-location mobility
      },
      {
        id: 'beast_monarch',
        name: 'Beast Monarch',
        description: 'Reach Monarch rank (Lv 1000) and 30 Strength stat — Rakan, the King of Beasts',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'stat', stat: 'strength', value: 30 }] },
        title: 'Beast Monarch',
        titleBonus: { xp: 1.8, strengthPercent: 0.45, agilityPercent: 0.25, vitalityPercent: 0.2, perceptionPercent: 0.3, critChance: 0.2 }, // Rakan: raw STR beast, predatory senses + lethal crits
      },
      {
        id: 'frost_monarch',
        name: 'Frost Monarch',
        description: 'Reach Monarch rank (Lv 1000) and send 15,000 messages — Sillad, the King of Snow Folk',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'messages', value: 15000 }] },
        title: 'Frost Monarch',
        titleBonus: { xp: 1.8, intelligencePercent: 0.45, vitalityPercent: 0.25, perceptionPercent: 0.25, critChance: 0.1 }, // Sillad: cold intelligence, endurance, strategic awareness
      },
      {
        id: 'plague_monarch',
        name: 'Plague Monarch',
        description: 'Reach Monarch rank (Lv 1000) and 30 Intelligence stat — Querehsha, the Queen of Insects',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'stat', stat: 'intelligence', value: 30 }] },
        title: 'Plague Monarch',
        titleBonus: { xp: 1.8, intelligencePercent: 0.4, perceptionPercent: 0.3, vitalityPercent: 0.25, critChance: 0.08 }, // Querehsha: swarm intelligence, omnisensory awareness, attrition endurance
      },
      {
        id: 'monarch_white_flames',
        name: 'Monarch of White Flames',
        description: 'Reach Monarch rank (Lv 1000) and land 3,000 critical hits — Baran, the King of Demons',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'crits', value: 3000 }] },
        title: 'Monarch of White Flames',
        titleBonus: { xp: 1.9, strengthPercent: 0.35, intelligencePercent: 0.3, vitalityPercent: 0.2, critChance: 0.18 }, // Baran: brute STR + lightning/fire magic, devastating crits
      },
      {
        id: 'monarch_transfiguration',
        name: 'Monarch of Transfiguration',
        description: 'Reach Monarch rank (Lv 1000) and type 500,000 characters — Yogumunt, the King of Demonic Spectres',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'characters', value: 500000 }] },
        title: 'Monarch of Transfiguration',
        titleBonus: { xp: 1.8, intelligencePercent: 0.45, agilityPercent: 0.25, perceptionPercent: 0.3, critChance: 0.1 }, // Yogumunt: master illusionist/schemer, spectral evasion, deception awareness
      },
      // Solo Leveling Lore Titles
      {
        id: 'shadow_soldier',
        name: 'Shadow Soldier',
        description: 'Land 100 critical hits — a loyal soldier extracted from the fallen',
        condition: { type: 'crits', value: 100 },
        title: 'Shadow Soldier',
        titleBonus: { xp: 0.08, strengthPercent: 0.05, agilityPercent: 0.05, critChance: 0.01 }, // Shadow Soldier: basic combat stats, loyal fighter
      },
      {
        id: 'kamish_slayer',
        name: 'Kamish Slayer',
        description: 'Reach Level 200 and land 2,000 critical hits — the dragon Kamish required National Level Hunters to defeat',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 200 }, { type: 'crits', value: 2000 }] },
        title: 'Kamish Slayer',
        titleBonus: { xp: 0.5, strengthPercent: 0.15, agilityPercent: 0.1, vitalityPercent: 0.1, critChance: 0.05 }, // Kamish Slayer: dragon-killing STR, survival VIT, decisive strikes
      },
      {
        id: 'demon_tower_conqueror',
        name: 'Demon Tower Conqueror',
        description: 'Reach Level 100 and visit 40 unique channels — conqueror of the Demon King Baran\'s tower',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 100 }, { type: 'channels', value: 40 }] },
        title: 'Demon Tower Conqueror',
        titleBonus: { xp: 0.35, strengthPercent: 0.1, intelligencePercent: 0.1, vitalityPercent: 0.1, critChance: 0.03 }, // Baran's tower: balanced combat (physical + magic demons), endurance gauntlet
      },
      {
        id: 'double_awakening',
        name: 'Double Awakening',
        description: 'Reach Level 50 and send 3,500 messages — the rare phenomenon of awakening a second time, unlocking unlimited growth',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 50 }, { type: 'messages', value: 3500 }] },
        title: 'Double Awakening',
        titleBonus: { xp: 0.2, strengthPercent: 0.05, agilityPercent: 0.05, intelligencePercent: 0.05, vitalityPercent: 0.05, perceptionPercent: 0.05, critChance: 0.02 }, // Double Awakening: ALL stats unlocked (unlimited growth potential)
      },
      {
        id: 'system_user',
        name: 'System User',
        description: 'Unlock 15 achievements — fully interfacing with the System that grants unlimited growth',
        condition: { type: 'achievements', value: 15 },
        title: 'System User',
        titleBonus: { xp: 0.25, intelligencePercent: 0.1, perceptionPercent: 0.1 }, // System User: INT (system interface) + PER (system notifications/awareness)
      },
      {
        id: 'instant_dungeon_master',
        name: 'Instant Dungeon Master',
        description: 'Type 200,000 characters and be active for 75 hours — mastering the System\'s private training dimensions',
        condition: { type: 'compound', conditions: [{ type: 'characters', value: 200000 }, { type: 'time', value: 4500 }] },
        title: 'Instant Dungeon Master',
        titleBonus: { xp: 0.5, intelligencePercent: 0.1, vitalityPercent: 0.1, strengthPercent: 0.05, agilityPercent: 0.05 }, // Instant Dungeon: grinding master, balanced growth from endless training
      },
      {
        id: 'shadow_army_general',
        name: 'Shadow Army General',
        description: 'Reach Level 100 and land 750 critical hits — commanding the shadow army\'s elite forces',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 100 }, { type: 'crits', value: 750 }] },
        title: 'Shadow Army General',
        titleBonus: { xp: 0.35, intelligencePercent: 0.15, strengthPercent: 0.1, agilityPercent: 0.05, critChance: 0.03 }, // Shadow General: strategic INT command, combat STR, tactical strikes
      },
      {
        id: 'monarch_of_beasts',
        name: 'Monarch of Fangs',
        description: 'Reach Monarch rank (Lv 1000) and 40 Strength stat — Rakan, the King of Beasts unleashed',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'stat', stat: 'strength', value: 40 }] },
        title: 'Monarch of Fangs',
        titleBonus: { xp: 2.0, strengthPercent: 0.5, agilityPercent: 0.3, perceptionPercent: 0.35, critChance: 0.22 }, // Rakan unleashed: apex predator, maximum STR/Crit, hunting instincts
      },
      {
        id: 'monarch_of_plagues',
        name: 'Monarch of Plagues',
        description: 'Reach Monarch+ rank (Lv 1500) and send 20,000 messages — Querehsha, the Queen of Insects ascended',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1500 }, { type: 'messages', value: 20000 }] },
        title: 'Monarch of Plagues',
        titleBonus: { xp: 2.3, intelligencePercent: 0.45, perceptionPercent: 0.35, vitalityPercent: 0.3, agilityPercent: 0.15, critChance: 0.1 }, // Querehsha ascended: plague mastery, swarm omniscience, corrosive endurance
      },
      {
        id: 'monarch_of_iron_body',
        name: 'Monarch of Iron Body',
        description: 'Reach Monarch rank (Lv 1000) and 35 Vitality stat — Tarnak, the King of Monstrous Humanoids',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'stat', stat: 'vitality', value: 35 }] },
        title: 'Monarch of Iron Body',
        titleBonus: { xp: 1.8, vitalityPercent: 0.5, strengthPercent: 0.3, critChance: 0.05 }, // Tarnak: indestructible defense, massive VIT, secondary STR
      },
      {
        id: 'monarch_of_beginning',
        name: 'Monarch of Beginning',
        description: 'Reach Monarch rank (Lv 1000) and unlock 30 achievements — Legia, the King of Giants (weakest Monarch)',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'achievements', value: 30 }] },
        title: 'Monarch of Beginning',
        titleBonus: {
          xp: 1.5,
          strengthPercent: 0.3,
          vitalityPercent: 0.25,
          critChance: 0.05,
        }, // Legia: weakest Monarch, brute force giant, durable but slow and unrefined
      },
      {
        id: 'absolute_ruler',
        name: 'Absolute Ruler',
        description: 'Reach Monarch rank (Lv 1000) and type 600,000 characters — wielder of the Rulers\' full authority',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'characters', value: 600000 }] },
        title: 'Absolute Ruler',
        titleBonus: {
          xp: 2.0,
          intelligencePercent: 0.45,
          perceptionPercent: 0.35,
          vitalityPercent: 0.3,
          strengthPercent: 0.2,
          agilityPercent: 0.15,
          critChance: 0.12,
        }, // Absolute Ruler: full divine authority, supreme cosmic awareness, immortal endurance
      },
      {
        id: 'shadow_sovereign_heir',
        name: 'Shadow Sovereign Heir',
        description: 'Reach Monarch+ rank (Lv 1500) and land 5,000 critical hits — on the cusp of inheriting the shadow',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1500 }, { type: 'crits', value: 5000 }] },
        title: 'Shadow Sovereign Heir',
        titleBonus: { xp: 2.3, agilityPercent: 0.35, critChance: 0.2, intelligencePercent: 0.3, strengthPercent: 0.2 }, // Shadow heir through combat: assassin crits, shadow magic, dagger mastery
      },
      {
        id: 'ruler_of_chaos',
        name: 'Ruler of Chaos',
        description: 'Reach National Hunter rank (Lv 700) and be active for 300 hours — power beyond mortal comprehension',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 700 }, { type: 'time', value: 18000 }] },
        title: 'Ruler of Chaos',
        titleBonus: {
          xp: 1.5,
          intelligencePercent: 0.3,
          perceptionPercent: 0.3,
          agilityPercent: 0.2,
          strengthPercent: 0.15,
          critChance: 0.12,
        }, // Chaotic Ruler: unpredictable divine power, heightened awareness, cosmic speed
      },
    ];

    // Cache the result (static definitions never change)
    this._cache.achievementDefinitions = achievements;
    return achievements;
  }

  unlockAchievement(achievement) {
    // Double-check: prevent duplicate unlocks
    if (this.settings.achievements.unlocked.includes(achievement.id)) {
      this.debugLog('ACHIEVEMENT', 'Achievement already unlocked, skipping', {
        achievementId: achievement.id,
        achievementName: achievement.name,
      });
      return; // Already unlocked, don't show notification again
    }

    // Add to unlocked list
    this.settings.achievements.unlocked.push(achievement.id);

    // Add title if provided
    if (achievement.title && !this.settings.achievements.titles.includes(achievement.title)) {
      this.settings.achievements.titles.push(achievement.title);
    }

    // Set as active title if no title is active
    if (!this.settings.achievements.activeTitle && achievement.title) {
      this.settings.achievements.activeTitle = achievement.title;
      // Invalidate title cache since active title changed
      this.invalidatePerformanceCache(['title']);
    }

    // Show notification
    const message =
      `[SYSTEM] Achievement unlocked: ${achievement.name}\n` +
      `${achievement.description}\n` +
      (achievement.title ? ` Title acquired: ${achievement.title}` : '');

    this.showNotification(message, 'success', 5000);

    this.debugLog('ACHIEVEMENT', 'Achievement unlocked', {
      achievementId: achievement.id,
      achievementName: achievement.name,
      title: achievement.title,
      totalUnlocked: this.settings.achievements.unlocked.length,
    });

    // Save immediately on achievement unlock (important event)
    this.saveSettings(true);
  }

  cleanupUnwantedTitles() {
    const unwantedTitles = this.UNWANTED_TITLES;

    let cleaned = false;

    // Remove from unlocked titles
    if (this.settings.achievements?.titles) {
      const beforeCount = this.settings.achievements.titles.length;
      this.settings.achievements.titles = this.settings.achievements.titles.filter(
        (t) => !unwantedTitles.includes(t)
      );
      if (this.settings.achievements.titles.length !== beforeCount) {
        cleaned = true;
      }
    }

    // Unequip if active
    if (
      this.settings.achievements?.activeTitle &&
      unwantedTitles.includes(this.settings.achievements.activeTitle)
    ) {
      this.settings.achievements.activeTitle = null;
      cleaned = true;
    }

    // Remove from unlocked achievements if they exist
    if (this.settings.achievements?.unlocked) {
      const achievements = this.getAchievementDefinitions();
      const unwantedIds = achievements
        .filter((a) => unwantedTitles.includes(a.title))
        .map((a) => a.id);
      if (unwantedIds.length > 0) {
        const beforeCount = this.settings.achievements.unlocked.length;
        this.settings.achievements.unlocked = this.settings.achievements.unlocked.filter(
          (id) => !unwantedIds.includes(id)
        );
        if (this.settings.achievements.unlocked.length !== beforeCount) {
          cleaned = true;
        }
      }
    }

    if (cleaned) {
      this.saveSettings(true);
      this.debugLog('CLEANUP', 'Removed unwanted titles from saved data', {
        removedTitles: unwantedTitles,
      });
    }
  }

  revalidateUnlockedAchievements() {
    const achievements = this.getAchievementDefinitions();
    const unlocked = this.settings.achievements?.unlocked || [];
    const titles = this.settings.achievements?.titles || [];

    if (unlocked.length === 0) return;

    const revokedIds = [];
    const revokedTitles = [];

    unlocked.forEach((id) => {
      const achievement = achievements.find((a) => a.id === id);
      if (!achievement) return; // unknown ID, leave it

      if (!this.checkAchievementCondition(achievement)) {
        revokedIds.push(id);
        if (achievement.title) {
          revokedTitles.push(achievement.title);
        }
      }
    });

    if (revokedIds.length === 0) return;

    // Remove revoked achievement IDs
    this.settings.achievements.unlocked = unlocked.filter(
      (id) => !revokedIds.includes(id)
    );

    // Remove revoked titles
    this.settings.achievements.titles = titles.filter(
      (t) => !revokedTitles.includes(t)
    );

    // Unequip active title if it was revoked
    if (
      this.settings.achievements?.activeTitle &&
      revokedTitles.includes(this.settings.achievements.activeTitle)
    ) {
      this.settings.achievements.activeTitle = null;
    }

    this.saveSettings(true);
    this.debugLog('REVALIDATE', 'Revoked achievements that no longer meet requirements', {
      revokedCount: revokedIds.length,
      revokedIds,
      revokedTitles,
    });
  }

  setActiveTitle(title) {
    // Filter out unwanted titles
    const unwantedTitles = this.UNWANTED_TITLES;

    // Allow null to unequip title
    if (title === null || title === '') {
      this.settings.achievements.activeTitle = null;
      this.saveSettings(true);
      if (this.updateChatUI) {
        this.updateChatUI();
      }
      return true;
    }

    // Block unwanted titles
    if (unwantedTitles.includes(title)) {
      return false;
    }

    // Also remove unwanted titles from unlocked titles list
    this.settings.achievements.titles = this.settings.achievements.titles.filter(
      (t) => !unwantedTitles.includes(t)
    );

    if (this.settings.achievements.titles.includes(title)) {
      this.settings.achievements.activeTitle = title;
      // Save immediately on title change
      this.saveSettings(true);
      if (this.updateChatUI) {
        this.updateChatUI();
      }
      return true;
    }
    return false;
  }

  getActiveTitleBonus() {
    // Check cache first
    const now = Date.now();
    const activeTitle = this.settings.achievements?.activeTitle || null;
    const cacheKey = activeTitle;

    if (
      this._cache.activeTitleBonus &&
      this._cache.activeTitleBonusKey === cacheKey &&
      this._cache.activeTitleBonusTime &&
      now - this._cache.activeTitleBonusTime < this._cache.activeTitleBonusTTL
    ) {
      return this._cache.activeTitleBonus;
    }

    // Filter out unwanted titles
    const unwantedTitles = this.UNWANTED_TITLES;
    if (
      !this.settings.achievements.activeTitle ||
      unwantedTitles.includes(this.settings.achievements.activeTitle)
    ) {
      // If active title is unwanted, unequip it
      if (
        this.settings.achievements.activeTitle &&
        unwantedTitles.includes(this.settings.achievements.activeTitle)
      ) {
        this.settings.achievements.activeTitle = null;
        this.saveSettings(true);
      }
      const result = {
        xp: 0,
        critChance: 0,
        // Old format (raw numbers) - for backward compatibility
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        perception: 0,
        // New format (percentages) - primary format
        strengthPercent: 0,
        agilityPercent: 0,
        intelligencePercent: 0,
        vitalityPercent: 0,
        perceptionPercent: 0,
      };
      // Cache the result
      this._cache.activeTitleBonus = result;
      this._cache.activeTitleBonusKey = null;
      this._cache.activeTitleBonusTime = now;
      return result;
    }

    const achievements = this.getAchievementDefinitions();
    const achievement = achievements.find(
      (a) => a.title === this.settings.achievements.activeTitle
    );

    const bonus = achievement?.titleBonus || { xp: 0 };
    // Return the raw titleBonus object directly (same as TitleManager)
    // This ensures both plugins see the exact same data structure
    // The display code handles both old format (raw) and new format (percentages)
    const result = {
      ...bonus,
      // Ensure defaults for common properties to avoid undefined issues
      xp: bonus.xp || 0,
      critChance: bonus.critChance || 0,
      // Old format (raw numbers) - for backward compatibility
      strength: bonus.strength || 0,
      agility: bonus.agility || 0,
      intelligence: bonus.intelligence || 0,
      vitality: bonus.vitality || 0,
      perception: bonus.perception || 0,
      // New format (percentages) - primary format
      strengthPercent: bonus.strengthPercent || 0,
      agilityPercent: bonus.agilityPercent || 0,
      intelligencePercent: bonus.intelligencePercent || 0,
      vitalityPercent: bonus.vitalityPercent || 0,
      perceptionPercent: bonus.perceptionPercent || 0,
    };

    this._cache.activeTitleBonus = result;
    this._cache.activeTitleBonusKey = cacheKey;
    this._cache.activeTitleBonusTime = now;

    return result;
  }

  /**
   * 3.8 HP/MANA SYSTEM
   */

  /**
   * Persist shadow power value and update display.
   * @param {number} totalPower
   * @param {Object} [shadowArmy] - ShadowArmy instance to sync cache back to
   */
  _commitShadowPower(totalPower, shadowArmy) {
    this.cachedShadowPower = totalPower.toLocaleString();
    this.settings.cachedShadowPower = this.cachedShadowPower;
    this.saveSettings();
    if (shadowArmy?.settings) {
      shadowArmy.settings.cachedTotalPower = totalPower;
      shadowArmy.settings.cachedTotalPowerTimestamp = Date.now();
      shadowArmy.saveSettings();
    }
    this.updateShadowPowerDisplay();
  }

  /**
   * Manually sum power from an array of shadow objects.
   * @param {Object} shadowArmy - ShadowArmy plugin instance
   * @param {Array}  shadows    - raw shadow records
   * @returns {number} total power
   */
  _sumShadowPower(shadowArmy, shadows) {
    return shadows.reduce((sum, shadow) => {
      try {
        if (shadowArmy.calculateShadowPowerCached) {
          return sum + (shadowArmy.calculateShadowPowerCached(shadow) || 0);
        }
        const d = shadowArmy.getShadowData ? shadowArmy.getShadowData(shadow) : shadow;
        if (shadowArmy.getShadowEffectiveStats && shadowArmy.calculateShadowPower) {
          const eff = shadowArmy.getShadowEffectiveStats(d);
          if (eff) {
            const p = shadowArmy.calculateShadowPower(eff, 1);
            return sum + (p > 0 ? p : (d?.strength || 0));
          }
        }
        return sum + (d?.strength || 0);
      } catch (_) {
        return sum;
      }
    }, 0);
  }

  /**
   * Update shadow power from ShadowArmy plugin.
   * Layered fallback: SA cache -> aggregated stats -> manual IDB enumeration -> 0.
   */
  async updateShadowPower() {
    try {
      if (!this._isRunning) return;

      const shadowArmyPlugin = BdApi.Plugins.get('ShadowArmy');
      if (!shadowArmyPlugin?.instance) {
        this.cachedShadowPower = '0';
        this.updateShadowPowerDisplay();
        return;
      }
      const shadowArmy = shadowArmyPlugin.instance;

      // --- FAST PATH: ShadowArmy's own persistent cache ---
      if (shadowArmy.settings?.cachedTotalPower !== undefined) {
        const cachedPower = shadowArmy.settings.cachedTotalPower || 0;
        const cacheAge = shadowArmy.settings.cachedTotalPowerTimestamp
          ? Date.now() - shadowArmy.settings.cachedTotalPowerTimestamp
          : Infinity;
        const isRecent = cacheAge < 300000; // 5 min
        const isRecentZero = cachedPower === 0 && cacheAge < 10000;

        if (isRecent && (cachedPower > 0 || isRecentZero)) {
          this.debugLog('UPDATE_SHADOW_POWER', 'Using ShadowArmy cached power', { cachedPower });
          this._commitShadowPower(cachedPower, shadowArmy);
          return;
        }
      }

      // --- PRIMARY: getAggregatedArmyStats + getTotalShadowPower ---
      if (typeof shadowArmy.getAggregatedArmyStats === 'function') {
        try {
          let totalPower = 0;

          // Direct calculation (preferred)
          if (typeof shadowArmy.getTotalShadowPower === 'function') {
            try {
              totalPower = await shadowArmy.getTotalShadowPower(false);
            } catch (_) {
              const stats = await shadowArmy.getAggregatedArmyStats();
              totalPower = stats?.totalPower ?? 0;
            }
          } else {
            const stats = await shadowArmy.getAggregatedArmyStats(true);
            totalPower = stats?.totalPower ?? 0;
          }

          const armyStats = await shadowArmy.getAggregatedArmyStats();

          // Diagnostic: IDB has data but aggregation returned 0 shadows -> manual calc
          if (totalPower === 0 && armyStats?.totalShadows === 0 && shadowArmy.storageManager) {
            try {
              const count = await shadowArmy.storageManager.getTotalCount();
              if (count > 0) {
                const direct = await shadowArmy.storageManager.getShadows({}, 0, 10000);
                if (direct?.length > 0) {
                  const manualPower = this._sumShadowPower(shadowArmy, direct);
                  if (manualPower > 0) {
                    this._commitShadowPower(manualPower, shadowArmy);
                    return;
                  }
                }
              }
            } catch (e) {
              this.debugError('UPDATE_SHADOW_POWER', 'Direct shadow retrieval failed', e);
            }
          }

          // Fallback: armyStats power if direct calc was 0
          if (!totalPower) totalPower = armyStats?.totalPower ?? 0;

          // Retry once if power=0 but shadows exist
          if (totalPower === 0 && armyStats?.totalShadows > 0) {
            const retry = await shadowArmy.getAggregatedArmyStats(true);
            if ((retry?.totalPower ?? 0) > 0) {
              this._commitShadowPower(retry.totalPower, shadowArmy);
              return;
            }
          }

          this.debugLog('UPDATE_SHADOW_POWER', 'Power calculation completed', {
            totalPower,
            totalShadows: armyStats?.totalShadows || 0,
          });

          // Commit result (guard against zeroing out when shadows exist)
          if (totalPower > 0 || (armyStats && armyStats.totalShadows === 0)) {
            this._commitShadowPower(totalPower, shadowArmy);
          } else {
            this.debugError('UPDATE_SHADOW_POWER', 'Power is 0 despite having shadows');
            this.updateShadowPowerDisplay();
          }
          return;
        } catch (error) {
          this.debugError('UPDATE_SHADOW_POWER', 'Primary method failed', error);
        }
      }

      // --- FALLBACK: manual storage manager enumeration ---
      if (shadowArmy.storageManager?.getShadows) {
        try {
          if (!shadowArmy.storageManager.db) await shadowArmy.storageManager.init();
          const shadows = await shadowArmy.storageManager.getShadows({}, 0, 1000000);
          if (shadows?.length > 0) {
            const totalPower = this._sumShadowPower(shadowArmy, shadows);
            this._commitShadowPower(totalPower, shadowArmy);
            return;
          }
        } catch (e) {
          this.debugError('UPDATE_SHADOW_POWER', 'Fallback storage enumeration failed', e);
        }
      }

      // No shadows
      this._commitShadowPower(0, shadowArmy);
    } catch (error) {
      this.debugError('UPDATE_SHADOW_POWER', error);
      this.cachedShadowPower = '0';
      this.updateShadowPowerDisplay();
    }
  }

  updateShadowPowerDisplay() {
    // v3.0.0: React LevelInfo component reads cachedShadowPower directly.
    // Just trigger a re-render via the forceUpdate bridge + emit event for LevelProgressBar.
    if (!this._isRunning) return;

    this.debugLog('UPDATE_SHADOW_POWER_DISPLAY', 'Triggering React re-render for shadow power', {
      cachedShadowPower: this.cachedShadowPower,
    });

    // Trigger React re-render — LevelInfo reads this.cachedShadowPower
    this._chatUIForceUpdate?.();

    // Emit event for real-time updates in LevelProgressBar
    this.emit('shadowPowerChanged', {
      shadowPower: this.cachedShadowPower,
    });
  }

  // ── §3.20 SHADOW ARMY INTEGRATION ────────────────────────────────────────
  // getShadowArmyBuffs(): Read shadow stats from ShadowArmy plugin
  // getEffectiveShadowArmyBuffs(): Apply Arise skill multiplier
  // shareShadowXP(): 5% message XP, 10% quest XP to all shadows

  cacheShadowArmyBuffs(buffs, timestamp = Date.now()) {
    const normalized = buffs && typeof buffs === 'object'
      ? { ...this.DEFAULT_SHADOW_BUFFS, ...buffs }
      : { ...this.DEFAULT_SHADOW_BUFFS };
    this._cache.shadowArmyBuffs = normalized;
    this._cache.shadowArmyBuffsTime = timestamp;
    return normalized;
  }

  getShadowArmyBuffs() {
    // Check cache first (avoid repeated plugin lookups)
    const now = Date.now();
    if (
      this._cache.shadowArmyBuffs &&
      this._cache.shadowArmyBuffsTime &&
      now - this._cache.shadowArmyBuffsTime < this._cache.shadowArmyBuffsTTL
    ) {
      return this._cache.shadowArmyBuffs;
    }

    try {
      const shadowArmyPlugin = BdApi.Plugins.get('ShadowArmy');
      if (!shadowArmyPlugin || !shadowArmyPlugin.instance) {
        return this.cacheShadowArmyBuffs(null, now);
      }

      const shadowArmy = shadowArmyPlugin.instance;

      // Use calculateTotalBuffs if available (async method)
      // For synchronous access, try to get cached buffs or calculate synchronously
      if (shadowArmy.calculateTotalBuffs) {
        // Try to get buffs synchronously if there's a cached version
        // Otherwise return zeros (will be updated asynchronously)
        if (shadowArmy.cachedBuffs && Date.now() - (shadowArmy.cachedBuffsTime || 0) < 5000) {
          // Use cached buffs if recent (within 5 seconds)
          return this.cacheShadowArmyBuffs(shadowArmy.cachedBuffs, now);
        }

        // Trigger async calculation and cache it
        shadowArmy
          .calculateTotalBuffs()
          .then((buffs) => {
            shadowArmy.cachedBuffs = buffs;
            shadowArmy.cachedBuffsTime = Date.now();
            this.cacheShadowArmyBuffs(buffs);
            // Update UI when buffs are calculated
            this.updateChatUI();
          })
          .catch(() => {
            // Silently fail if ShadowArmy isn't ready
          });

        // Return zeros for now, will be updated when async calculation completes
        return this.cacheShadowArmyBuffs(shadowArmy.cachedBuffs, now);
      }

      return this.cacheShadowArmyBuffs(null, now);
    } catch (error) {
      // Silently fail if ShadowArmy isn't available
      return this.cacheShadowArmyBuffs(null, now);
    }
  }

  /**
   * Get shadow army buffs with active skill Arise multiplier applied
   * @returns {Object} - Shadow buffs (potentially amplified)
   */
  getEffectiveShadowArmyBuffs() {
    const baseBuffs = this.getShadowArmyBuffs();
    const activeBuffs = this.getActiveSkillBuffs();
    if (!activeBuffs || activeBuffs.shadowBuffMultiplier <= 1.0) return baseBuffs;

    // Apply Arise multiplier to all shadow buff values
    const multiplier = activeBuffs.shadowBuffMultiplier;
    return {
      strength: (baseBuffs.strength || 0) * multiplier,
      agility: (baseBuffs.agility || 0) * multiplier,
      intelligence: (baseBuffs.intelligence || 0) * multiplier,
      vitality: (baseBuffs.vitality || 0) * multiplier,
      perception: (baseBuffs.perception || 0) * multiplier,
    };
  }

  // ── §3.21 HP/MANA SYSTEM ─────────────────────────────────────────────────
  // HP = 100 + 10*VIT + 50*rank_index | Mana = 100 + 10*INT
  // updateHPManaBars() — REMOVED in v3.0.0 (React HPManaDisplay component re-renders via forceUpdate)

  // ── §3.22 CHAT UI MANAGEMENT ─────────────────────────────────────────────
  // createChatUI(): Build collapsible panel (level, stats, quests, achievements)
  // renderChatUI(): Generate full HTML with sections (Stats | Activity | Quests)
  // updateChatUI(): Refresh visible tab (throttled to 2s)
  // attachChatUIListeners(): Tab switching, stat allocation buttons
  // getChatUiCssText(): 1200+ lines of theme CSS (§3.22.1)

  ensureChatUIUpdateInterval(onlyWhenDirty = false) {
    if (this.chatUIUpdateInterval) return;

    this.chatUIUpdateInterval = setInterval(() => {
      if (onlyWhenDirty && !this._chatUIDirty) return;
      this._chatUIDirty = false;
      this.updateChatUI();
    }, 2000);
  }

  // initializeChatUIPanel() — REMOVED in v3.0.0 (React components self-initialize)

  createChatUI() {
    try {
      // Only inject chat UI in guild text channels (not threads/forums/VC/DMs)
      if (!this._isGuildTextChannel()) {
        this.debugLog('CREATE_CHAT_UI', 'Skipping — not a guild text channel');
        this.removeChatUI();
        return;
      }

      this.debugLog('CREATE_CHAT_UI', 'Starting chat UI creation');

      // Remove existing UI if present
      this.removeChatUI();

      // Inject CSS for chat UI
      this.injectChatUICSS();

      // Try React injection first (preferred method — v3.0.0 uses component tree)
      if (this.tryReactInjection()) {
        // React injection successful — components handle their own state + events
        setTimeout(() => {
          const uiPanel = document.getElementById('sls-chat-ui');
          if (uiPanel) {
            this.chatUIPanel = uiPanel;
            this.ensureChatUIUpdateInterval(true);
          }
        }, 100);
        return; // React injection successful, skip DOM fallback
      }

      // Fallback to DOM injection if React injection fails
      this.debugLog('CREATE_CHAT_UI', 'React injection failed, using DOM fallback');

      // Function to actually create the UI
      const tryCreateUI = () => {
        try {
          if (!this._canShowChatUIInCurrentView()) return false;

          // Find writable input area scoped to primary chat content only
          const messageInputArea = this._getMessageInputAreaInPrimaryChat();
          if (!messageInputArea) return false;

          // Check if UI already exists
          if (document.getElementById('sls-chat-ui')) {
            return true;
          }

          // Create the UI panel container
          const uiPanel = document.createElement('div');
          uiPanel.id = 'sls-chat-ui';
          uiPanel.className = 'sls-chat-panel';

          // Insert before the message input area
          messageInputArea.parentElement.insertBefore(uiPanel, messageInputArea);

          // Render React component tree into panel (v3.0.0)
          try {
            const { StatsPanel } = this._chatUIComponents;
            const root = BdApi.ReactDOM.createRoot(uiPanel);
            root.render(BdApi.React.createElement(StatsPanel));
            this._chatUIRoot = root;
          } catch (renderError) {
            this.debugError('RENDER_CHAT_UI', renderError);
            uiPanel.remove();
            return false;
          }

          this.chatUIPanel = uiPanel;
          this.ensureChatUIUpdateInterval(true);
          return true;
        } catch (uiError) {
          this.debugError('TRY_CREATE_UI', uiError);
          return false;
        }
      };

      // Try to create immediately
      if (!tryCreateUI()) {
        // Retry after a delay if Discord hasn't loaded yet
        this.chatUICreationRetryInterval = setInterval(() => {
          if (tryCreateUI()) {
            clearInterval(this.chatUICreationRetryInterval);
            this.chatUICreationRetryInterval = null;
            if (this.chatUICreationRetryTimeout) {
              clearTimeout(this.chatUICreationRetryTimeout);
              this.chatUICreationRetryTimeout = null;
            }
          }
        }, 1000);

        // Stop retrying after 10 seconds
        this.chatUICreationRetryTimeout = setTimeout(() => {
          if (this.chatUICreationRetryInterval) {
            clearInterval(this.chatUICreationRetryInterval);
            this.chatUICreationRetryInterval = null;
          }
          this.chatUICreationRetryTimeout = null;
        }, 10000);
      }

      // Watch for DOM changes (channel switches, etc.)
      if (!this.chatUIObserver) {
        this.chatUIObserver = new MutationObserver(() => {
          if (document.hidden) return;
          if (!this._canShowChatUIInCurrentView()) {
            this.removeChatUI();
            return;
          }
          if (document.getElementById('sls-chat-ui')) return;
          if (this._chatUiObserverDebounceTimeout) return;
          this._chatUiObserverDebounceTimeout = setTimeout(() => {
            this._chatUiObserverDebounceTimeout = null;
            tryCreateUI();
          }, 150);
        });

        const chatContainer =
          document.querySelector('[class*="chat"]') ||
          document.querySelector('[class*="messagesWrapper"]') ||
          null;

        // IMPORTANT: Never observe document.body; Discord mutates it constantly and can peg CPU.
        if (!chatContainer) {
          this._chatUiObserverRetryTimeout ||= setTimeout(() => {
            this._chatUiObserverRetryTimeout = null;
            this.chatUIObserver && this.createChatUI();
          }, 1500);
          return;
        }

        this.chatUIObserver.observe(chatContainer, {
          childList: true,
          subtree: true,
        });
      }
    } catch (error) {
      this.debugError('CREATE_CHAT_UI', error);
      // Retry after delay
      if (!this._createChatUIErrorRetryTimeout) {
        this._createChatUIErrorRetryTimeout = setTimeout(() => {
          this._createChatUIErrorRetryTimeout = null;
          try {
            this.createChatUI();
          } catch (retryError) {
            this.debugError('CREATE_CHAT_UI_RETRY', retryError);
          }
        }, 3000);
      }
    }
  }

  removeChatUI() {
    // Unmount React root if using createRoot fallback (v3.0.0)
    if (this._chatUIRoot) {
      try {
        this._chatUIRoot.unmount();
      } catch (error) {
        this.debugError('REMOVE_CHAT_UI', error);
      }
      this._chatUIRoot = null;
    }
    // If React injection is active, the UI will be removed when patch is removed
    // But we should also try to remove DOM element if it exists
    if (this.chatUIPanel) {
      this.chatUIPanel.remove();
      this.chatUIPanel = null;
    }
    if (this.chatUIUpdateInterval) {
      clearInterval(this.chatUIUpdateInterval);
      this.chatUIUpdateInterval = null;
    }
    if (this._createChatUIStartupRetryTimeout) {
      clearTimeout(this._createChatUIStartupRetryTimeout);
      this._createChatUIStartupRetryTimeout = null;
    }
    if (this._createChatUIErrorRetryTimeout) {
      clearTimeout(this._createChatUIErrorRetryTimeout);
      this._createChatUIErrorRetryTimeout = null;
    }
    if (this._chatUiObserverRetryTimeout) {
      clearTimeout(this._chatUiObserverRetryTimeout);
      this._chatUiObserverRetryTimeout = null;
    }
    if (this._chatUiObserverDebounceTimeout) {
      clearTimeout(this._chatUiObserverDebounceTimeout);
      this._chatUiObserverDebounceTimeout = null;
    }
    if (this.chatUICreationRetryInterval) {
      clearInterval(this.chatUICreationRetryInterval);
      this.chatUICreationRetryInterval = null;
    }
    if (this.chatUICreationRetryTimeout) {
      clearTimeout(this.chatUICreationRetryTimeout);
      this.chatUICreationRetryTimeout = null;
    }
    if (this.chatUIObserver) {
      this.chatUIObserver.disconnect();
      this.chatUIObserver = null;
    }

    this._lastChatUIUpdateAt = 0;

    // Remove injected CSS so it doesn't persist after disable
    document.getElementById('sls-chat-ui-styles')?.remove();
  }

  // buildTitleBonusHTML() — REMOVED in v3.0.0 (replaced by React ActiveTitle component)
  // renderChatUI() — REMOVED in v3.0.0 (replaced by React StatsPanel component)
  // attachChatUIListeners() — REMOVED in v3.0.0 (React components handle their own events)

  updateChatUI() {
    // v3.0.0: React components own their own rendering.
    // Just trigger a re-render via the forceUpdate bridge.
    if (!this._isRunning) return;
    this._chatUIDirty = false;

    // Self-throttle to avoid redundant work when multiple events trigger updates
    const now = Date.now();
    const lastUpdateAt = this._lastChatUIUpdateAt || 0;
    if (now - lastUpdateAt < 150) return;
    this._lastChatUIUpdateAt = now;

    // Trigger React re-render via forceUpdate bridge
    if (this._chatUIForceUpdate) {
      this._chatUIForceUpdate();
    }
  }

  /**
   * 3.8.2 INJECT CHAT UI CSS
   *
   * Injects comprehensive CSS styles for the Solo Leveling Stats chat UI panel.
   * Styles are organized into 9 functional sections for easy maintenance.
   *
   * CSS STRUCTURE:
   * 1. BASE PANEL & LAYOUT - Main container, header, content wrapper, toggle button
   * 2. HP/MANA DISPLAY - Health/mana bars with collapsed state styling
   * 3. LEVEL & STATS DISPLAY - Level number, rank badge, XP text, shadow power
   * 4. XP PROGRESS BAR - Progress bar, fill, sparkles, milestone markers
   * 5. QUEST SYSTEM UI - Quest celebration modal, progress items, notifications
   * 6. STAT ALLOCATION CONTROLS - Stat items, allocation buttons, stat points
   * 7. TITLE & ACHIEVEMENTS - Title display, achievement items and list
   * 8. UTILITY COMPONENTS - Section toggles, activity grid, quest items
   * 9. ANIMATIONS & KEYFRAMES - All animation definitions for visual effects
   *
   * THEME COLORS:
   * - Primary Purple: rgba(138, 43, 226, ...) - Main theme color
   * - Accent Purple: #8a2be2, #9370db, #ba55d3 - Gradient accents
   * - Text Purple: #d4a5ff, #b894e6 - Text colors
   * - Success Green: #00ff88 - Quest completion, achievements
   * - Background: rgba(10, 10, 15, 0.95) - Dark gradient background
   *
   * FONT FAMILY:
   * - Primary: 'Friend or Foe BB' (Solo Leveling theme font)
   * - Fallback: 'Orbitron', 'Segoe UI', sans-serif
   */
  getChatUiCssText() {
    return `
      /* ============================================================================
         SOLO LEVELING STATS - THEME CSS
         ============================================================================
         This CSS file styles the Solo Leveling Stats plugin UI components.
         Organized by functional area for easy maintenance and navigation.
         ============================================================================ */

      /* ============================================================================
         SECTION 1: BASE PANEL & LAYOUT
         ============================================================================
         Targets: Main chat panel container, header, content wrapper, toggle button
         Purpose: Foundation layout and container styling for the entire UI
         ============================================================================ */
      .sls-chat-panel {
        position: relative;
        margin: 6px 16px 8px 16px;
        background: linear-gradient(135deg, rgba(10, 10, 15, 0.95) 0%, rgba(15, 15, 26, 0.95) 100%);
        border: 1px solid rgba(138, 43, 226, 0.5);
        border-radius: 2px;
        padding: 14px 12px;
        box-shadow: 0 0 8px rgba(138, 43, 226, 0.4);
        z-index: 1000;
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        backdrop-filter: blur(8px);
      }

      .sls-chat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(138, 43, 226, 0.2);
        gap: 12px;
      }

      /* ============================================================================
         SECTION 2: HP/MANA DISPLAY & COLLAPSED STATES
         ============================================================================
         Targets: HP/Mana bar containers, collapsed state styling
         Purpose: Health and mana bar display with enhanced visibility when collapsed
         ============================================================================ */
      .sls-chat-hp-mana-display {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        flex: 1 !important;
        min-width: 0 !important;
        overflow: hidden !important;
        transition: gap 0.3s ease;
      }

      /* Enhanced styling when collapsed (toggle off) - make bars more prominent */
      .sls-chat-hp-mana-display.sls-hp-mana-collapsed {
        gap: 16px !important;
        min-width: 333px !important;
      }

      /* Increase horizontal size of HP/MP containers when collapsed */
      .sls-hp-mana-collapsed > div {
        flex: 1.3 !important;
        min-width: 133px !important;
      }

      .sls-hp-mana-collapsed > div > div:nth-child(2),
      .sls-hp-mana-collapsed #sls-mp-bar-container {
        height: 16px !important;
        min-height: 16px !important;
        min-width: 100px !important;
        flex: 1 !important;
        box-shadow: 0 0 6px rgba(138, 43, 226, 0.4) !important;
        border: 1px solid rgba(138, 43, 226, 0.2) !important;
      }

      /* Make bar fills more visible when collapsed */
      .sls-hp-mana-collapsed #sls-hp-bar-fill {
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.6) !important;
      }
      .sls-hp-mana-collapsed #sls-mp-bar-fill {
        box-shadow: 0 0 10px rgba(96, 165, 250, 0.6) !important;
      }

      .sls-chat-title {
        color: #d4a5ff;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.5px;
        text-shadow: 0 0 6px rgba(138, 43, 226, 0.9), 0 0 12px rgba(138, 43, 226, 0.5);
      }

      .sls-chat-toggle {
        background: rgba(138, 43, 226, 0.15);
        border: 1px solid rgba(138, 43, 226, 0.3);
        color: #b894e6;
        cursor: pointer;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 2px;
        transition: all 0.2s ease;
        min-width: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-left: 8px;
      }

      .sls-chat-toggle:hover {
        background: rgba(138, 43, 226, 0.25);
        border-color: rgba(138, 43, 226, 0.5);
        color: #d4a5ff;
        box-shadow: 0 0 6px rgba(138, 43, 226, 0.4);
        transform: translateY(-1px);
      }

      .sls-chat-content {
        display: block;
      }

      /* ============================================================================
         SECTION 3: LEVEL & STATS DISPLAY
         ============================================================================
         Targets: Level number, rank badge, XP text, shadow power display
         Purpose: Display user level, rank, XP progress, and shadow army power
         ============================================================================ */
      .sls-chat-level {
        margin-bottom: 10px;
        display: flex;
        flex-direction: row;
        width: 100%;
      }

      .sls-chat-shadow-power {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        color: #8a2be2;
        font-size: 12px;
        font-weight: 600;
        margin-left: 12px;
        white-space: nowrap;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
        display: flex !important;
        align-items: center;
        flex-shrink: 0;
        visibility: visible !important;
        opacity: 1 !important;
      }

      .sls-chat-level-row {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 8px;
        flex-wrap: nowrap !important;
        margin-bottom: 0;
        width: 100%;
      }

      .sls-chat-rank {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        font-size: 11px;
        font-weight: 700;
        color: #ba55d3;
        text-shadow: 0 0 5px rgba(138, 43, 226, 0.9);
        padding: 2px 6px;
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.2) 0%, rgba(75, 0, 130, 0.15) 100%);
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 2px;
        display: inline-flex !important;
        flex-shrink: 0;
        box-shadow: 0 0 4px rgba(138, 43, 226, 0.3);
        white-space: nowrap;
        line-height: 1.2;
        align-items: center;
      }

      .sls-chat-level-number {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        font-size: 13px;
        font-weight: 800;
        color: #d4a5ff;
        text-shadow: 0 0 6px rgba(138, 43, 226, 1), 0 0 12px rgba(138, 43, 226, 0.6);
        letter-spacing: 0.5px;
        white-space: nowrap;
        line-height: 1;
        display: inline-flex !important;
        flex-shrink: 0;
        align-items: center;
      }

      .sls-chat-xp-text {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        font-size: 11px;
        color: #b894e6;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
        font-weight: 600;
        white-space: nowrap;
        line-height: 1;
        display: inline-flex !important;
        flex-shrink: 0;
        align-items: center;
      }

      /* ============================================================================
         SECTION 4: XP PROGRESS BAR
         ============================================================================
         Targets: Progress bar container, fill, sparkle particles, milestone markers
         Purpose: Visual XP progress indicator with animations and milestone tracking
         ============================================================================ */
      .sls-chat-progress-bar {
        flex: 1;
        min-width: 80px;
        max-width: 200px;
        height: 8px;
        background: rgba(10, 10, 15, 0.9);
        border-radius: 2px;
        overflow: hidden;
        border: none !important;
        box-shadow: none !important;
        filter: none !important;
        position: relative;
        align-self: center;
        margin: 0;
        display: flex;
        align-items: center;
      }

      .sls-chat-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #8a2be2 0%, #9370db 50%, #ba55d3 100%);
        transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        border-radius: 2px;
        /* COMPLETE GLOW REMOVAL - ALL POSSIBLE SOURCES */
        box-shadow: none !important;
        filter: none !important;
        outline: none !important;
        border: none !important;
        text-shadow: none !important;
        drop-shadow: none !important;
        -webkit-box-shadow: none !important;
        -moz-box-shadow: none !important;
        -webkit-filter: none !important;
        -moz-filter: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      /* Force remove glow from ALL states and pseudo-elements */
      .sls-chat-progress-fill *,
      .sls-chat-progress-fill::before,
      .sls-chat-progress-fill::after,
      .sls-chat-progress-fill:hover,
      .sls-chat-progress-fill:active,
      .sls-chat-progress-fill:focus {
        box-shadow: none !important;
        filter: none !important;
        text-shadow: none !important;
        outline: none !important;
        border: none !important;
      }

      /* Purple glow shimmer completely disabled */
      .sls-chat-progress-fill::after {
        display: none !important;
        content: none !important;
        background: none !important;
        animation: none !important;
      }

      /* Purple glow overlay completely disabled */
      .sls-chat-progress-fill::before {
        display: none !important;
        content: none !important;
        background: none !important;
        animation: none !important;
      }

      /* Sparkle particles */
      .sls-chat-progress-bar .sls-progress-sparkle {
        position: absolute;
        width: 4px;
        height: 4px;
        background: rgba(138, 43, 226, 0.9);
        border-radius: 50%;
        pointer-events: none;
        animation: sparkle-float 2s infinite;
        box-shadow: 0 0 6px rgba(138, 43, 226, 0.8);
      }

      /* Progress bar milestone markers - visual indicators for level milestones */
      .sls-chat-progress-bar .sls-milestone-marker {
        position: absolute;
        top: -8px;
        width: 2px;
        height: 22px;
        background: rgba(138, 43, 226, 0.5);
        pointer-events: none;
        z-index: 1;
      }

      .sls-chat-progress-bar .sls-milestone-marker::after {
        content: '';
        position: absolute;
        top: -4px;
        left: -3px;
        width: 8px;
        height: 8px;
        background: rgba(138, 43, 226, 0.8);
        border-radius: 50%;
        box-shadow: 0 0 6px rgba(138, 43, 226, 0.6);
      }

      /* ============================================================================
         SECTION 9: ANIMATIONS & KEYFRAMES
         ============================================================================
         Targets: All animated elements (progress bar, quest celebrations, particles)
         Purpose: Define animation keyframes for visual effects throughout the UI
         ============================================================================ */
      /* Progress bar shimmer effect (currently unused but available) */
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }

      /* Progress bar sparkle effect (currently unused but available) */
      @keyframes sparkle {
        0%, 100% { opacity: 0; }
        50% { opacity: 1; }
      }

      @keyframes sparkle-float {
        0% {
          opacity: 0;
          transform: translateY(0) scale(0);
        }
        50% {
          opacity: 1;
          transform: translateY(-10px) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateY(-20px) scale(0);
        }
      }

      /* Level up overlay animation (non-toast) */
      .sls-levelup-overlay {
        position: fixed;
        left: 0;
        right: 0;
        top: 0;
        pointer-events: none;
        z-index: 999998;
      }

      .sls-levelup-banner {
        position: absolute;
        left: 50%;
        top: 54px;
        transform: translateX(-50%);
        padding: 10px 16px;
        border-radius: 2px;
        background: rgba(10, 10, 15, 0.92);
        border: 1px solid rgba(138, 43, 226, 0.55);
        color: #a78bfa;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        box-shadow: 0 10px 30px rgba(138, 43, 226, 0.25);
        text-shadow: 0 0 10px rgba(167, 139, 250, 0.6);
        animation: sls-levelup-pop 1200ms ease-out forwards;
        will-change: transform, opacity;
        text-align: center;
        min-width: 220px;
      }

      .sls-levelup-title {
        font-size: 14px;
        line-height: 1.2;
      }

      .sls-levelup-subtitle {
        margin-top: 6px;
        padding-top: 4px;
        font-size: 12px;
        font-weight: 700;
        opacity: 0.92;
        letter-spacing: 0.02em;
        text-transform: none;
      }

      @keyframes sls-levelup-pop {
        0% {
          opacity: 0;
          transform: translateX(-50%) translateY(0) scale(0.75);
        }
        15% {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1.05);
        }
        100% {
          opacity: 0;
          transform: translateX(-50%) translateY(-14px) scale(1);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .sls-levelup-banner {
          animation: none !important;
          opacity: 1 !important;
        }
      }

      /* ============================================================================
         SECTION 5: QUEST SYSTEM UI
         ============================================================================
         Targets: Quest celebration modal, quest progress items, quest notification
         Purpose: Quest completion animations and quest progress tracking UI
         ============================================================================ */
      /* Quest celebration styles */
      /*
       * ANIMATION TYPES AVAILABLE (change animation property to switch):
       *
       * 1. FADE (default): quest-celebration-fade-in + quest-celebration-visible + quest-celebration-fade-out
       *    - Fast fade-in (0.2s), smooth visible (2.1s), fast fade-out (0.2s)
       *
       * 2. SLIDE: quest-celebration-slide-in (slides from top)
       *
       * 3. ZOOM: quest-celebration-zoom-in (zooms from center)
       *
       * 4. BOUNCE: quest-celebration-bounce (bouncy entrance)
       *
       * 5. ROTATE: quest-celebration-rotate-in (rotates while fading)
       *
       * 6. ELASTIC: quest-celebration-elastic (elastic spring effect)
       *
       * To use alternative animations, replace the animation property with:
       *   animation: [animation-name] 0.2s ease-out,
       *              quest-celebration-visible 2.1s ease-out 0.2s,
       *              quest-celebration-fade-out 0.2s ease-out 2.3s;
       */
      .sls-quest-celebration {
        position: fixed;
        z-index: 100000;
        pointer-events: auto; /* Allow clicking to close */
        cursor: pointer; /* Show it's clickable */
        /* Fast fade-in: 0-200ms, visible: 200ms-2300ms, fast fade-out: 2300ms-2500ms */
        animation: quest-celebration-fade-in 0.2s ease-out,
                   quest-celebration-visible 2.1s ease-out 0.2s,
                   quest-celebration-fade-out 0.2s ease-out 2.3s;
        opacity: 0; /* Start hidden, animation will make it visible */
      }

      /* Alternative animation classes (add to celebration element to use) */
      .sls-quest-celebration.slide {
        animation: quest-celebration-slide-in 0.2s ease-out,
                   quest-celebration-visible 2.1s ease-out 0.2s,
                   quest-celebration-fade-out 0.2s ease-out 2.3s;
      }

      .sls-quest-celebration.zoom {
        animation: quest-celebration-zoom-in 0.2s ease-out forwards;
      }

      .sls-quest-celebration.bounce {
        animation: quest-celebration-bounce 0.4s ease-out,
                   quest-celebration-visible 1.9s ease-out 0.4s,
                   quest-celebration-fade-out 0.2s ease-out 2.3s;
      }

      .sls-quest-celebration.rotate {
        animation: quest-celebration-rotate-in 0.2s ease-out,
                   quest-celebration-visible 2.1s ease-out 0.2s,
                   quest-celebration-fade-out 0.2s ease-out 2.3s;
      }

      .sls-quest-celebration.elastic {
        animation: quest-celebration-elastic 0.5s ease-out,
                   quest-celebration-visible 1.8s ease-out 0.5s,
                   quest-celebration-fade-out 0.2s ease-out 2.3s;
      }

      .sls-quest-celebration-content {
        background: linear-gradient(135deg, rgba(5, 5, 10, 0.98) 0%, rgba(10, 5, 15, 0.98) 100%);
        border: 2px solid rgba(138, 43, 226, 0.3);
        border-radius: 2px;
        padding: 24px 32px;
        text-align: left;
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.2),
                    0 0 40px rgba(75, 0, 130, 0.15),
                    inset 0 0 30px rgba(138, 43, 226, 0.1);
        backdrop-filter: blur(8px);
        min-width: 400px;
        max-width: 500px;
      }

      .sls-quest-notification-header {
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(138, 43, 226, 0.2);
      }

      .sls-quest-notification-title {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        font-size: 18px;
        font-weight: 700;
        color: rgba(138, 43, 226, 0.9);
        text-shadow: 0 0 8px rgba(138, 43, 226, 0.4);
        margin-bottom: 6px;
        letter-spacing: 0.5px;
      }

      .sls-quest-notification-subtitle {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        font-size: 14px;
        color: rgba(200, 180, 255, 0.8);
        font-weight: 600;
      }

      .sls-quest-completed-name {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        font-size: 16px;
        color: rgba(255, 255, 255, 0.95);
        font-weight: 600;
        margin-bottom: 20px;
        padding: 10px;
        background: rgba(138, 43, 226, 0.1);
        border-left: 3px solid rgba(138, 43, 226, 0.5);
        border-radius: 2px;
      }

      .sls-quest-current-progress {
        margin-top: 20px;
      }

      .sls-quest-progress-title {
        font-size: 14px;
        font-weight: 700;
        color: rgba(138, 43, 226, 0.8);
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .sls-quest-progress-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .sls-quest-progress-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px;
        background: rgba(10, 5, 15, 0.6);
        border-radius: 2px;
        border: 1px solid rgba(138, 43, 226, 0.15);
        transition: all 0.2s ease;
      }

      .sls-quest-progress-item.completed {
        background: rgba(138, 43, 226, 0.1);
        border-color: rgba(138, 43, 226, 0.3);
      }

      .sls-quest-progress-checkbox {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        color: rgba(138, 43, 226, 0.6);
        flex-shrink: 0;
      }

      .sls-quest-progress-item.completed .sls-quest-progress-checkbox {
        color: rgba(138, 43, 226, 0.9);
        text-shadow: 0 0 6px rgba(138, 43, 226, 0.6);
      }

      .sls-quest-progress-info {
        flex: 1;
        min-width: 0;
      }

      .sls-quest-progress-name {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.85);
        font-weight: 600;
        margin-bottom: 6px;
      }

      .sls-quest-progress-item.completed .sls-quest-progress-name {
        color: rgba(200, 180, 255, 0.9);
      }

      .sls-quest-progress-bar-container {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .sls-quest-progress-bar {
        flex: 1;
        height: 6px;
        background: rgba(20, 10, 30, 0.8);
        border-radius: 2px;
        overflow: hidden;
        border: 1px solid rgba(138, 43, 226, 0.2);
      }

      .sls-quest-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, rgba(138, 43, 226, 0.6) 0%, rgba(138, 43, 226, 0.4) 100%);
        transition: width 0.3s ease;
        border-radius: 2px;
      }

      .sls-quest-progress-item.completed .sls-quest-progress-fill {
        background: linear-gradient(90deg, rgba(138, 43, 226, 0.8) 0%, rgba(138, 43, 226, 0.6) 100%);
      }

      .sls-quest-progress-text {
        font-size: 11px;
        color: rgba(200, 180, 255, 0.7);
        font-weight: 600;
        min-width: 50px;
        text-align: right;
      }

      .sls-quest-confirm-button-container {
        display: flex;
        justify-content: center;
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid rgba(138, 43, 226, 0.2);
      }

      .sls-quest-confirm-button {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.3) 0%, rgba(75, 0, 130, 0.3) 100%);
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 2px;
        padding: 12px 32px;
        color: rgba(200, 180, 255, 0.95);
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        text-transform: uppercase;
        letter-spacing: 1px;
        text-shadow: 0 0 6px rgba(138, 43, 226, 0.6);
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.3);
      }

      .sls-quest-confirm-button:hover {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.4) 0%, rgba(75, 0, 130, 0.4) 100%);
        border-color: rgba(138, 43, 226, 0.7);
        color: rgba(255, 255, 255, 1);
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.5);
        transform: translateY(-2px);
      }

      .sls-quest-confirm-button:active {
        transform: translateY(0);
        box-shadow: 0 0 8px rgba(138, 43, 226, 0.4);
      }

      .sls-quest-celebration-icon {
        font-size: 64px;
        animation: quest-icon-bounce 0.6s ease-out;
        margin-bottom: 10px;
      }

      .sls-quest-celebration-text {
        font-family: 'Press Start 2P', monospace;
        font-size: 20px;
        color: #ffffff;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.8),
                     0 0 20px rgba(138, 43, 226, 0.8);
        margin-bottom: 10px;
        animation: quest-text-glow 1s ease-in-out infinite;
      }

      .sls-quest-celebration-name {
        font-size: 18px;
        color: rgba(255, 255, 255, 0.9);
        font-weight: bold;
        margin-bottom: 15px;
      }

      .sls-quest-celebration-rewards {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 15px;
      }

      .sls-quest-reward-item {
        font-size: 16px;
        color: #00ff88;
        font-weight: bold;
        text-shadow: 0 0 8px rgba(0, 255, 136, 0.6);
        animation: quest-reward-pop 0.4s ease-out 0.2s both;
      }

      .sls-quest-particle {
        position: absolute;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        pointer-events: none;
        animation: quest-particle-burst 2s ease-out forwards;
      }

      .sls-quest-celebrating {
        animation: quest-card-pulse 0.5s ease-out;
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.8) !important;
      }

      /* Fast fade-in animation (0-200ms) */
      @keyframes quest-celebration-fade-in {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      /* Visible state (200ms-2300ms) - subtle scale bounce for engagement */
      @keyframes quest-celebration-visible {
        0%, 100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        50% {
          transform: translate(-50%, -50%) scale(1.02);
        }
      }

      /* Fast fade-out animation (2300ms-2500ms) */
      @keyframes quest-celebration-fade-out {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.95);
        }
      }

      /* Alternative animation: Slide from top */
      @keyframes quest-celebration-slide-in {
        0% {
          opacity: 0;
          transform: translate(-50%, -60%) scale(0.9);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      /* Alternative animation: Zoom in */
      @keyframes quest-celebration-zoom-in {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.5);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      /* Alternative animation: Bounce */
      @keyframes quest-celebration-bounce {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.3);
        }
        50% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.15);
        }
        70% {
          transform: translate(-50%, -50%) scale(0.95);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      /* Alternative animation: Rotate + fade */
      @keyframes quest-celebration-rotate-in {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8) rotate(-10deg);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1) rotate(0deg);
        }
      }

      /* Alternative animation: Elastic */
      @keyframes quest-celebration-elastic {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.3);
        }
        50% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.2);
        }
        75% {
          transform: translate(-50%, -50%) scale(0.9);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      @keyframes quest-icon-bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-20px); }
      }

      @keyframes quest-text-glow {
        0%, 100% {
          text-shadow: 0 0 10px rgba(255, 255, 255, 0.8),
                       0 0 20px rgba(138, 43, 226, 0.8);
        }
        50% {
          text-shadow: 0 0 20px rgba(255, 255, 255, 1),
                       0 0 40px rgba(138, 43, 226, 1);
        }
      }

      @keyframes quest-reward-pop {
        0% {
          opacity: 0;
          transform: scale(0);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes quest-particle-burst {
        0% {
          opacity: 1;
          transform: translate(0, 0) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(var(--particle-x, 0), var(--particle-y, 0)) scale(0);
        }
      }

      @keyframes quest-card-pulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.05);
        }
      }

      .sls-chat-stats {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      .sls-chat-stat-item {
        position: relative;
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.12) 0%, rgba(75, 0, 130, 0.08) 100%);
        border: 1px solid rgba(138, 43, 226, 0.35);
        border-radius: 2px;
        padding: 5px 9px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        gap: 5px;
        align-items: center;
        backdrop-filter: blur(4px);
      }

      .sls-chat-stat-item:hover {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.22) 0%, rgba(75, 0, 130, 0.15) 100%);
        border-color: rgba(138, 43, 226, 0.6);
        box-shadow: 0 0 6px rgba(138, 43, 226, 0.5);
        transform: translateY(-1px);
      }

      .sls-chat-stat-name {
        color: #d4a5ff;
        font-weight: 700;
        font-size: 11px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-stat-value {
        color: #ba55d3;
        font-weight: 700;
        font-size: 12px;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.7);
      }

      .sls-chat-stat-points {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        background: rgba(138, 43, 226, 0.2);
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 2px;
        padding: 6px 10px;
        color: #d4a5ff;
        font-weight: 700;
        font-size: 11px;
        text-align: center;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.8);
        box-shadow: 0 0 5px rgba(138, 43, 226, 0.3);
        margin-bottom: 8px;
      }

      .sls-chat-stat-allocation {
        margin-top: 12px;
        margin-bottom: 12px;
      }

      .sls-chat-stat-buttons {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: center;
        margin-top: 8px;
      }

      .sls-chat-stat-btn {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        position: relative;
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.15) 0%, rgba(75, 0, 130, 0.1) 100%);
        border: 1px solid rgba(138, 43, 226, 0.3);
        border-radius: 2px;
        padding: 8px 12px;
        min-width: 50px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .sls-chat-stat-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.3) 0%, rgba(75, 0, 130, 0.2) 100%);
        border-color: rgba(138, 43, 226, 0.6);
        box-shadow: 0 0 5px rgba(138, 43, 226, 0.5);
        transform: translateY(-2px);
      }

      .sls-chat-stat-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .sls-chat-stat-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .sls-chat-stat-btn-available {
        border-color: rgba(138, 43, 226, 0.5);
        box-shadow: 0 0 4px rgba(138, 43, 226, 0.3);
      }

      .sls-chat-stat-btn-maxed {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.25) 0%, rgba(75, 0, 130, 0.15) 100%);
        border-color: rgba(138, 43, 226, 0.7);
        box-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
      }

      .sls-chat-stat-btn-name {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        color: #b894e6;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.5);
      }

      .sls-chat-stat-btn-value {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        color: #d4a5ff;
        font-size: 14px;
        font-weight: 700;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.7);
      }

      .sls-chat-stat-btn-plus {
        position: absolute;
        top: 2px;
        right: 4px;
        color: #22c55e;
        font-size: 12px;
        font-weight: 700;
        text-shadow: 0 0 4px rgba(34, 197, 94, 0.8);
      }

      .sls-chat-total-xp {
        font-size: 10px;
        color: #a78bfa;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
        font-weight: 600;
        white-space: nowrap;
        display: inline-flex !important;
        flex-shrink: 0;
        line-height: 1;
        align-items: center;
      }

      /* ============================================================================
         SECTION 7: TITLE & ACHIEVEMENTS DISPLAY
         ============================================================================
         Targets: Title display, title labels, achievement items, achievement list
         Purpose: Display user titles and achievement progress
         ============================================================================ */
      .sls-chat-title-display {
        background: rgba(138, 43, 226, 0.15);
        border: 1px solid rgba(138, 43, 226, 0.3);
        border-radius: 2px;
        padding: 6px 10px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .sls-chat-title-label {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        color: #b894e6;
        font-size: 11px;
        font-weight: 600;
      }

      .sls-chat-title-name {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        color: #d4a5ff;
        font-weight: 700;
        font-size: 12px;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.7);
      }

      .sls-chat-title-bonus {
        font-family: 'Friend or Foe BB', 'Orbitron', 'Segoe UI', sans-serif;
        color: #ba55d3;
        font-size: 10px;
        font-weight: 600;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      /* ============================================================================
         SECTION 8: UTILITY COMPONENTS
         ============================================================================
         Targets: Section toggles, activity grid, quest items in chat panel
         Purpose: Reusable UI components for collapsible sections and activity display
         ============================================================================ */
      .sls-chat-section-toggle {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        margin: 8px 0 4px 0;
        background: rgba(138, 43, 226, 0.1);
        border: 1px solid rgba(138, 43, 226, 0.3);
        border-radius: 2px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .sls-chat-section-toggle:hover {
        background: rgba(138, 43, 226, 0.2);
        border-color: rgba(138, 43, 226, 0.5);
      }

      .sls-chat-section-title {
        color: #d4a5ff;
        font-weight: 700;
        font-size: 12px;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-section-arrow {
        color: #b894e6;
        font-size: 10px;
      }

      .sls-chat-section {
        margin-bottom: 8px;
        padding: 8px;
        background: rgba(138, 43, 226, 0.05);
        border-radius: 2px;
      }

      .sls-chat-activity-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }

      .sls-chat-activity-item {
        background: rgba(138, 43, 226, 0.1);
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-radius: 2px;
        padding: 8px;
        text-align: center;
      }

      .sls-chat-activity-label {
        font-size: 10px;
        color: #b894e6;
        margin-bottom: 4px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
      }

      .sls-chat-activity-value {
        font-size: 16px;
        font-weight: 700;
        color: #d4a5ff;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.7);
      }

      .sls-chat-quest-item {
        background: rgba(138, 43, 226, 0.08);
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-left: 3px solid rgba(138, 43, 226, 0.4);
        border-radius: 2px;
        padding: 8px;
        margin-bottom: 6px;
        position: relative;
      }

      .sls-chat-quest-item.sls-chat-quest-complete {
        border-left-color: #00ff88;
        background: rgba(0, 255, 136, 0.1);
      }

      .sls-chat-quest-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
      }

      .sls-chat-quest-name {
        color: #d4a5ff;
        font-weight: 600;
        font-size: 11px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-quest-progress {
        color: #ba55d3;
        font-weight: 600;
        font-size: 11px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-quest-desc {
        font-size: 10px;
        color: #b894e6;
        margin-bottom: 6px;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.4);
      }

      .sls-chat-quest-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        color: #00ff88;
        font-weight: 700;
        font-size: 14px;
        text-shadow: 0 0 4px rgba(0, 255, 136, 0.8);
      }

      .sls-chat-achievements-summary {
        padding: 4px 0;
      }

      .sls-chat-achievements-count {
        color: #d4a5ff;
        font-weight: 700;
        font-size: 11px;
        margin-bottom: 8px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-achievements-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .sls-chat-achievement-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px;
        background: rgba(138, 43, 226, 0.1);
        border: 1px solid rgba(138, 43, 226, 0.3);
        border-radius: 2px;
      }

      .sls-chat-achievement-icon {
        color: #00ff88;
        font-weight: 700;
        font-size: 12px;
        text-shadow: 0 0 6px rgba(0, 255, 136, 0.7);
      }

      .sls-chat-achievement-name {
        color: #d4a5ff;
        font-weight: 600;
        font-size: 11px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-achievements-empty {
        color: #b894e6;
        font-size: 10px;
        font-style: italic;
        text-align: center;
        padding: 8px;
      }
    `;
  }

  injectChatUICSS() {
    if (document.getElementById('sls-chat-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'sls-chat-ui-styles';
    style.textContent = this.getChatUiCssText();

    document.head.appendChild(style);
  }

  // ── §3.23 SETTINGS PANEL (BetterDiscord API) ─────────────────────────────
  // getSettingsPanel(): Creates UI for debug mode toggle + reset tools

  // Creates UI for plugin settings with debug mode toggle
  getSettingsPanel() {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: 20px;
      background: #1e1e2e;
      border-radius: 2px;
      border: 1px solid rgba(138, 43, 226, 0.5);
      color: #ffffff;
      font-family: 'Segoe UI', sans-serif;
    `;

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Solo Leveling Stats - Settings';
    title.style.cssText = `
      color: #8a2be2;
      margin-bottom: 20px;
      font-size: 24px;
      text-shadow: 0 0 10px rgba(138, 43, 226, 0.6);
    `;
    container.appendChild(title);

    // Debug Mode Toggle
    const debugToggle = this.createToggle(
      'debugMode',
      'Debug Mode',
      'Show detailed console logs for troubleshooting (constructor, save, load, periodic backups)',
      this.settings.debugMode || false,
      null
    );
    container.appendChild(debugToggle);

    // Info section
    const info = document.createElement('div');
    info.style.cssText = `
      margin-top: 20px;
      padding: 15px;
      background: rgba(138, 43, 226, 0.1);
      border-radius: 2px;
      border-left: 3px solid #8a2be2;
    `;
    info.innerHTML = `
      <strong style="color: #8a2be2;">Debug Console Logs:</strong><br>
      <span style="color: #b894e6; font-size: 13px;">
        When enabled, you'll see detailed logs for:<br>
        • Constructor initialization<br>
        • Save operations (current, clean, success)<br>
        • Load operations (raw data, merge, verification)<br>
        • Periodic backup saves (every 30 seconds)<br>
        • Shadow XP sharing<br>
        • Data verification (matches, deep copy status)
      </span>
    `;
    container.appendChild(info);

    // One-time rank backfill action
    const backfillApplied = !!this.settings?._rankBonusBackfillV2Applied;
    const rankBackfillAction = this.createActionButton(
      'recalculateRankBonuses',
      backfillApplied ? 'Rank Bonus Backfill Applied' : 'Recalculate Rank Bonuses',
      backfillApplied
        ? 'One-time rank-bonus backfill is already applied on this profile.'
        : 'Safely applies a one-time retroactive rank-bonus recalculation using the latest exponential curve. A backup snapshot is saved first.',
      backfillApplied
    );
    container.appendChild(rankBackfillAction);

    // Chat UI preview (kept as a helper for readability)
    try {
      const previewHeader = document.createElement('h3');
      previewHeader.textContent = 'Chat UI Preview';
      previewHeader.style.cssText = `
        margin-top: 24px;
        margin-bottom: 12px;
        color: #d4a5ff;
        font-size: 16px;
        font-weight: 700;
      `;
      container.appendChild(previewHeader);

      container.appendChild(this.createChatUiPreviewPanel());
    } catch (error) {
      this.debugError('SETTINGS_PANEL_PREVIEW', error);
    }

    // Delegated settings panel binding (single handler)
    if (this._settingsPanelRoot && this._settingsPanelHandlers?.change) {
      try {
        this._settingsPanelRoot.removeEventListener('change', this._settingsPanelHandlers.change);
      } catch (_) {
        // Ignore removal errors
      }
    }
    if (this._settingsPanelRoot && this._settingsPanelHandlers?.click) {
      try {
        this._settingsPanelRoot.removeEventListener('click', this._settingsPanelHandlers.click);
      } catch (_) {
        // Ignore removal errors
      }
    }
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;

    this._settingsPanelHandlers = {
      change: (e) => {
        const target = e?.target;
        if (!target) return;
        const key = target.getAttribute?.('data-sls-setting');
        if (!key) return;
        const isChecked = !!target.checked;

        const handlers = {
          debugMode: () =>
            this.withAutoSave(() => {
              this.settings.debugMode = isChecked;
              this.debugLog('SETTINGS', 'Debug mode', isChecked ? 'enabled' : 'disabled');
            }, true),
        };

        const fn = handlers[key];
        fn && fn();
      },
      click: (e) => {
        const actionButton = e?.target?.closest?.('button[data-sls-action]');
        if (!actionButton) return;
        const actionKey = actionButton.getAttribute('data-sls-action');
        if (!actionKey) return;

        const handlers = {
          recalculateRankBonuses: async () => {
            if (this.settings?._rankBonusBackfillV2Applied) {
              this.showNotification('Rank bonus backfill already applied on this profile.', 'info', 5000);
              actionButton.disabled = true;
              actionButton.textContent = 'Rank Bonus Backfill Applied';
              return;
            }

            const confirmed = window.confirm(
              'Apply one-time rank bonus recalculation?\n\n' +
                'This will create a backup snapshot first, then apply a one-time stat backfill. ' +
                'It should only be run once per profile.'
            );
            if (!confirmed) return;

            const statusNode = container.querySelector?.(
              `[data-sls-action-status="${actionKey}"]`
            );
            const originalLabel = actionButton.textContent;
            actionButton.disabled = true;
            actionButton.textContent = 'Applying Backfill...';
            statusNode &&
              (statusNode.textContent =
                'Creating backup and applying one-time rank bonus backfill...');

            try {
              const result = await this.applyRankPromotionBonusBackfill();
              if (result?.applied) {
                actionButton.textContent = 'Rank Bonus Backfill Applied';
                statusNode &&
                  (statusNode.textContent =
                    `Applied successfully. +${result.perStatDelta} to each stat. Backup: ${result.backupKey}`);
                this.showNotification(
                  `Rank bonus backfill complete (+${result.perStatDelta} each stat).`,
                  'success',
                  7000
                );
                return;
              }

              const reason = result?.reason || 'unknown';
              const recoverable = reason === 'backup_failed' || reason === 'apply_failed' || reason === 'unexpected_error';
              actionButton.disabled = !recoverable;
              actionButton.textContent = recoverable ? originalLabel : 'Rank Bonus Backfill Applied';
              const failureText =
                reason === 'already_applied'
                  ? 'Backfill was already applied previously.'
                  : reason === 'no_promotions'
                    ? 'No rank promotions found for this profile. No changes made.'
                    : reason === 'no_delta'
                      ? 'No bonus delta detected between legacy and current tables. No changes made.'
                      : reason === 'missing_stats'
                        ? 'Stats object missing. No changes made.'
                        : `Backfill failed (${reason}). No data loss: restore via backup key ${result?.backupKey || 'N/A'}.`;
              statusNode && (statusNode.textContent = failureText);
              this.showNotification(failureText, recoverable ? 'error' : 'info', 7000);
            } catch (error) {
              actionButton.disabled = false;
              actionButton.textContent = originalLabel;
              statusNode &&
                (statusNode.textContent =
                  'Backfill failed unexpectedly. No data loss expected. Check console logs.');
              this.debugError('SETTINGS_PANEL_ACTION', error, { actionKey });
              this.showNotification('Backfill failed unexpectedly. Check console logs.', 'error', 7000);
            }
          },
        };

        const fn = handlers[actionKey];
        fn &&
          fn().catch((error) => {
            this.debugError('SETTINGS_PANEL_ACTION', error, { actionKey, phase: 'handler_invoke' });
          });
      },
    };

    container.addEventListener('change', this._settingsPanelHandlers.change);
    container.addEventListener('click', this._settingsPanelHandlers.click);
    this._settingsPanelRoot = container;

    return container;
  }

  // FUNCTIONAL TOGGLE CREATOR (NO IF-ELSE!)
  // Creates a styled toggle switch with label and description
  createToggle(settingKey, label, description, defaultValue, _onChangeUnused) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      margin-bottom: 20px;
      padding: 15px;
      background: rgba(138, 43, 226, 0.05);
      border-radius: 2px;
      border: 1px solid rgba(138, 43, 226, 0.2);
    `;

    const toggleContainer = document.createElement('div');
    toggleContainer.style.cssText = 'display: flex; align-items: center; margin-bottom: 8px;';

    // Toggle switch
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = defaultValue;
    toggle.id = `sls-setting-${settingKey}`;
    toggle.setAttribute('data-sls-setting', settingKey);
    toggle.style.cssText = `
      width: 40px;
      height: 20px;
      margin-right: 12px;
      cursor: pointer;
    `;

    // Label
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.setAttribute('for', toggle.id);
    labelEl.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      color: #ffffff;
      cursor: pointer;
    `;

    // Description
    const desc = document.createElement('div');
    desc.textContent = description;
    desc.style.cssText = `
      font-size: 13px;
      color: #b894e6;
      line-height: 1.5;
    `;

    toggleContainer.appendChild(toggle);
    toggleContainer.appendChild(labelEl);
    wrapper.appendChild(toggleContainer);
    wrapper.appendChild(desc);

    return wrapper;
  }

  createActionButton(actionKey, label, description, disabled = false) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      margin-top: 16px;
      margin-bottom: 8px;
      padding: 15px;
      background: rgba(138, 43, 226, 0.05);
      border-radius: 2px;
      border: 1px solid rgba(138, 43, 226, 0.2);
    `;

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = !!disabled;
    button.setAttribute('data-sls-action', actionKey);
    button.style.cssText = `
      padding: 10px 14px;
      border-radius: 2px;
      border: 1px solid rgba(138, 43, 226, 0.55);
      background: ${disabled ? 'rgba(120, 120, 120, 0.35)' : 'rgba(138, 43, 226, 0.25)'};
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      cursor: ${disabled ? 'not-allowed' : 'pointer'};
      margin-bottom: 8px;
    `;

    const desc = document.createElement('div');
    desc.textContent = description;
    desc.style.cssText = `
      font-size: 13px;
      color: #b894e6;
      line-height: 1.5;
    `;

    const status = document.createElement('div');
    status.setAttribute('data-sls-action-status', actionKey);
    status.textContent = disabled
      ? 'Already applied for this profile.'
      : 'Not applied yet.';
    status.style.cssText = `
      margin-top: 8px;
      font-size: 12px;
      color: #d4a5ff;
      line-height: 1.4;
    `;

    wrapper.appendChild(button);
    wrapper.appendChild(desc);
    wrapper.appendChild(status);
    return wrapper;
  }

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT
  // ============================================================================

  // ── §4.1 DEBUG LOGGING ──────────────────────────────────────────────────
  // Conditional logging (settings.debugMode), throttles frequent operations
  // to prevent console spam. Tracks operation counts and error history.
  debugLog(operation, message, data = null) {
    // UNIFIED DEBUG SYSTEM: Check settings.debugMode instead of this.debug.enabled
    if (!this.settings?.debugMode) return;

    // Check if this is a frequent operation
    const isFrequent = this.debug.frequentOperations.has(operation);

    if (isFrequent && !this.debug.verbose) {
      // Throttle frequent operations - only log once per throttleInterval
      const now = Date.now();
      const lastLogTime = this.debug.lastLogTimes[operation] || 0;

      if (now - lastLogTime < this.debug.throttleInterval) {
        // Skip logging, but still track count
        this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
        return;
      }

      // Update last log time
      this.debug.lastLogTimes[operation] = now;
    }

    const _timestamp = new Date().toISOString();
    console.warn(`[SoloLevelingStats:${operation}] ${message}`, data || '');

    // Track operation counts
    this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
  }

  // ── §4.2 DEBUG ERROR TRACKING ─────────────────────────────────────────────
  // Error logging with context and stack traces
  debugError(operation, error, context = {}) {
    if (!this.debug) this.debug = {};
    if (typeof this.debug.errorCount !== 'number') this.debug.errorCount = 0;
    this.debug.errorCount++;

    // Extract error message properly
    let errorMessage = 'Unknown error';
    let errorStack = null;

    if (error instanceof Error) {
      errorMessage = error.message || String(error);
      errorStack = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      // Try to extract meaningful info from error object
      errorMessage = error.message || error.toString() || JSON.stringify(error).substring(0, 200);
      errorStack = error.stack;
    } else {
      errorMessage = String(error);
    }

    this.debug.lastError = {
      operation,
      error: errorMessage,
      stack: errorStack,
      context,
      timestamp: Date.now(),
    };

    const timestamp = new Date().toISOString();
    console.error(`[SoloLevelingStats:ERROR:${operation}]`, errorMessage, {
      stack: errorStack,
      context,
      timestamp,
    });

    // Also log to debug file
    console.warn(`[SoloLevelingStats:ERROR:${operation}] ${errorMessage}`, context);
  }

  /**
   * Debug console logging (for constructor and critical operations)
   * Only logs when debugMode is enabled
   */
  debugConsole(prefix, message, data = {}) {
    const log = () => console.log(`${prefix}`, message, data);
    // Safe check: Only log if settings exist AND debugMode is explicitly true
    return this.settings?.debugMode === true && log();
  }
};
