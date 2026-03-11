function buildChatUIComponents(pluginInstance) {
  const React = BdApi.React;
  const ce = React.createElement;

  // ============================================================================
  // COMPONENT SECTION A: CORE STATUS DISPLAYS
  // ============================================================================
  // HPManaDisplay / LevelInfo / ActiveTitle

  // ── HPManaDisplay: Compact HP/MP strip shown near chat composer ──
  function HPManaDisplay({ compact = false, totalStatsOverride = null }) {
    const s = pluginInstance.settings;
    const totalStats = totalStatsOverride || pluginInstance.getTotalEffectiveStats();
    if (typeof pluginInstance.syncHPManaForDisplay === 'function') {
      pluginInstance.syncHPManaForDisplay(totalStats);
    } else {
      pluginInstance.recomputeHPManaFromStats(totalStats);
    }

    const hpPercent = (s.userHP / s.userMaxHP) * 100;
    const manaPercent = (s.userMana / s.userMaxMana) * 100;

    const barHeight = compact ? '10px' : '12px';
    const containerMinWidth = compact ? '120px' : '0';
    const containerFlex = compact ? '1' : '1';
    const textDisplay = 'block';
    const barMinWidth = compact ? '72px' : '0';

    return ce('div', {
      className: `sls-chat-hp-mana-display${compact ? ' sls-chat-hp-mana-compact' : ''}`,
      id: 'sls-chat-hp-mana-display',
      style: { display: 'flex', alignItems: 'center', gap: compact ? '8px' : '12px', flex: '1', minWidth: '0' }
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

  // ============================================================================
  // COMPONENT SECTION B: STATS + ALLOCATION
  // ============================================================================
  // Shared render-context builder keeps popup stat reads coherent and cheap.

  function buildStatsRenderContext() {
    return {
      totalStats: pluginInstance.getTotalEffectiveStats(),
      titleBonus: pluginInstance.getActiveTitleBonus(),
      shadowBuffs: pluginInstance.getEffectiveShadowArmyBuffs(),
    };
  }

  // ── StatsList: 5-stat grid (read-only display) ──
  function StatsList({ totalStats }) {
    const effectiveStats = totalStats || pluginInstance.getTotalEffectiveStats();

    return ce('div', { className: 'sls-chat-stats' },
      pluginInstance.STAT_KEYS.map((key) => {
        const def = pluginInstance.STAT_METADATA[key];
        if (!def) return null;
        return ce('div', { key, className: 'sls-chat-stat-item', 'data-stat': key },
          ce('span', { className: 'sls-chat-stat-name' }, def.name),
          ce('span', { className: 'sls-chat-stat-value' }, String(effectiveStats[key]))
        );
      })
    );
  }

  // ── StatsRadarGraph: Spider-web chart for effective stat distribution ──
  function StatsRadarGraph({ totalStats }) {
    const effectiveStats = totalStats || pluginInstance.getTotalEffectiveStats();
    const statKeys = pluginInstance.STAT_KEYS.filter((key) => Boolean(pluginInstance.STAT_METADATA[key]));
    if (!statKeys.length) return null;

    const values = statKeys.map((key) => Math.max(0, Number(effectiveStats[key]) || 0));
    const maxObserved = Math.max(...values, 1);
    const scaleSteps = [25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    let chartMax = scaleSteps.find((step) => step >= maxObserved);
    if (!chartMax) {
      const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(maxObserved))));
      chartMax = Math.ceil(maxObserved / magnitude) * magnitude;
    }

    const size = 200;
    const center = size / 2;
    const radius = 66;
    const labelRadius = radius + 16;

    const toPoint = (index, ratio = 1) => {
      const angle = (-Math.PI / 2) + (index / statKeys.length) * (Math.PI * 2);
      const clamped = Math.max(0, Math.min(1, ratio));
      const x = center + Math.cos(angle) * radius * clamped;
      const y = center + Math.sin(angle) * radius * clamped;
      return [x, y];
    };

    const toLabelPoint = (index) => {
      const angle = (-Math.PI / 2) + (index / statKeys.length) * (Math.PI * 2);
      const x = center + Math.cos(angle) * labelRadius;
      const y = center + Math.sin(angle) * labelRadius;
      return [x, y];
    };

    const formatPoints = (points) => points
      .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ');

    const rings = [0.25, 0.5, 0.75, 1];
    const ringPolygons = rings.map((ringRatio) =>
      formatPoints(statKeys.map((_, index) => toPoint(index, ringRatio)))
    );
    const dataPolygon = formatPoints(
      statKeys.map((_, index) => toPoint(index, values[index] / chartMax))
    );

    return ce('div', { className: 'sls-popup-radar' },
      ce('div', { className: 'sls-popup-section-title' }, 'Stat Radar'),
      ce('div', { className: 'sls-popup-radar-wrap' },
        ce('svg', {
          className: 'sls-popup-radar-svg',
          viewBox: `0 0 ${size} ${size}`,
          role: 'img',
          'aria-label': 'Stat radar chart'
        },
          ringPolygons.map((points, idx) =>
            ce('polygon', { key: `ring-${rings[idx]}`, className: 'sls-popup-radar-ring', points })
          ),
          statKeys.map((key, index) => {
            const [x, y] = toPoint(index, 1);
            return ce('line', {
              key: `axis-${key}`,
              className: 'sls-popup-radar-axis',
              x1: center,
              y1: center,
              x2: x,
              y2: y,
            });
          }),
          ce('polygon', { className: 'sls-popup-radar-area', points: dataPolygon }),
          statKeys.map((key, index) => {
            const [x, y] = toPoint(index, values[index] / chartMax);
            return ce('circle', { key: `node-${key}`, className: 'sls-popup-radar-node', cx: x, cy: y, r: 2.4 });
          }),
          statKeys.map((key, index) => {
            const [x, y] = toLabelPoint(index);
            const label = pluginInstance.STAT_METADATA[key]?.name || key.toUpperCase();
            return ce('text', { key: `label-${key}`, className: 'sls-popup-radar-label', x, y }, label);
          })
        ),
        ce('div', { className: 'sls-popup-radar-scale' }, `Scale max: ${Number(chartMax).toLocaleString()}`)
      )
    );
  }

  // ── StatButton: Single allocation button ──
  function StatButton({ statKey, onAllocate, totalStats, titleBonus, shadowBuffs }) {
    const s = pluginInstance.settings;
    const effectiveStats = totalStats || pluginInstance.getTotalEffectiveStats();
    const effectiveTitleBonus = titleBonus || pluginInstance.getActiveTitleBonus();
    const effectiveShadowBuffs = shadowBuffs || pluginInstance.getEffectiveShadowArmyBuffs();

    const stat = pluginInstance.STAT_METADATA[statKey];
    const baseValue = s.stats[statKey];
    const totalValue = effectiveStats[statKey];
    const canAllocate = s.unallocatedStatPoints > 0;
    const tooltip = pluginInstance.buildStatTooltip(statKey, baseValue, totalValue, effectiveTitleBonus, effectiveShadowBuffs);
    const valueText = pluginInstance.getStatValueWithBuffsHTML(totalValue, statKey, effectiveTitleBonus, effectiveShadowBuffs);

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
  function StatAllocation({ onAllocate, totalStats, titleBonus, shadowBuffs }) {
    const s = pluginInstance.settings;
    if (s.unallocatedStatPoints <= 0) return null;

    return ce('div', { className: 'sls-chat-stat-allocation' },
      ce('div', { className: 'sls-chat-stat-points' }, pluginInstance.formatUnallocatedStatPointsText()),
      ce('div', { className: 'sls-chat-stat-buttons' },
        pluginInstance.STAT_KEYS.map((key) =>
          ce(StatButton, { key, statKey: key, onAllocate, totalStats, titleBonus, shadowBuffs })
        )
      )
    );
  }

  // ============================================================================
  // COMPONENT SECTION C: POPUP SUMMARY + COLLAPSIBLE DETAILS
  // ============================================================================
  // Buff summary, activity cards, and quest progress sections.

  // ── BuffSummaryList: Unified buff summary across plugin ecosystem ──
  function BuffSummaryList() {
    const groups = pluginInstance.getUnifiedBuffSummary();

    return ce('div', { className: 'sls-popup-buff-summary' },
      ce('div', { className: 'sls-popup-section-title' }, 'Buff Summary'),
      groups.length > 0
        ? groups.map((group) =>
            ce('div', { key: group.source, className: 'sls-popup-buff-group' },
              ce('div', { className: 'sls-popup-buff-source' }, group.source),
              ce('div', { className: 'sls-popup-buff-entries' },
                group.entries.map((entry, idx) =>
                  ce('span', { key: `${group.source}-${entry.label}-${idx}`, className: 'sls-popup-buff-entry' }, `${entry.label}: ${entry.value}`)
                )
              )
            )
          )
        : ce('div', { className: 'sls-popup-empty' }, 'No active cross-plugin buffs detected.')
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

  // ── StatsPanel: Composer strip only (full panel moved to popup) ──
  function StatsPanel() {
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

    // Expose forceUpdate bridge to plugin instance for imperative updates
    React.useEffect(() => {
      pluginInstance._registerUIForceUpdate?.(forceUpdate);
      return () => { pluginInstance._unregisterUIForceUpdate?.(forceUpdate); };
    }, [forceUpdate]);

    return ce('div', { className: 'sls-chat-strip' },
      ce(HPManaDisplay, { compact: true })
    );
  }

  // ============================================================================
  // COMPONENT SECTION D: HEADER POPUP SURFACE
  // ============================================================================
  // Top-level popup renderer that composes all sections.

  // ── StatsPopup: Dedicated popup for stats, allocation, and buff summary ──
  function StatsPopup({ onClose }) {
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
    const renderContext = buildStatsRenderContext();

    const handleAllocate = React.useCallback((statKey) => {
      if (pluginInstance.allocateStatPoint(statKey)) forceUpdate();
    }, []);

    React.useEffect(() => {
      pluginInstance._registerUIForceUpdate?.(forceUpdate);
      return () => { pluginInstance._unregisterUIForceUpdate?.(forceUpdate); };
    }, [forceUpdate]);

    return ce('div', {
      className: 'sls-stats-popup-surface',
      onClick: (e) => e.stopPropagation(),
    },
      ce('div', { className: 'sls-stats-popup-header' },
        ce('div', { className: 'sls-stats-popup-title' }, 'Hunter Console'),
        ce('button', {
          className: 'sls-stats-popup-close',
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose?.();
          }
        }, '×')
      ),
      ce('div', { className: 'sls-stats-popup-content' },
        ce(HPManaDisplay, { compact: false, totalStatsOverride: renderContext.totalStats }),
        ce(LevelInfo),
        ce(ActiveTitle),
        ce(StatsList, { totalStats: renderContext.totalStats }),
        ce(StatsRadarGraph, { totalStats: renderContext.totalStats }),
        ce(StatAllocation, {
          onAllocate: handleAllocate,
          totalStats: renderContext.totalStats,
          titleBonus: renderContext.titleBonus,
          shadowBuffs: renderContext.shadowBuffs,
        }),
        ce(BuffSummaryList),
        ce(CollapsibleSection, { sectionId: 'activity', title: 'Activity Summary' },
          ce(ActivityGrid)
        ),
        ce(CollapsibleSection, { sectionId: 'quests', title: 'Daily Quests' },
          ce(QuestList)
        )
      )
    );
  }

  return {
    StatsPanel,
    StatsPopup,
    HPManaDisplay,
    LevelInfo,
    ActiveTitle,
    StatsList,
    StatsRadarGraph,
    StatAllocation,
    BuffSummaryList,
    ActivityGrid,
    QuestList,
  };
}

module.exports = buildChatUIComponents;
