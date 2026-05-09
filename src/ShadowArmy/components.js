/**
 * ShadowArmy — React widget components.
 * Factory function that creates ShadowArmyWidget and RankBox components.
 * Called in start(), NOT mixed onto prototype.
 */

function buildWidgetComponents(pluginInstance) {
  const React = BdApi.React;
  const ce = React.createElement;

  const { RANK_ORDER: _RO } = require("../shared/rank-utils");
  const { SHADOW_GRADES } = require("./constants");
  // Display order: descending, exclude Shadow Monarch (not shown in widget)
  const RANKS = [..._RO].filter(r => r !== 'Shadow Monarch').reverse();
  const RANK_COLORS = {
    'Monarch+': '#ff6b2b', Monarch: '#ff4500', NH: '#e040fb', 'SSS+': '#f50057',
    SSS: '#ec4899', SS: '#ef4444', S: '#f59e0b', A: '#8a2be2',
    B: '#3b82f6', C: '#22c55e', D: '#a0a0a0', E: '#999',
  };
  const RANK_LABELS = { 'Monarch+': 'M+', Monarch: 'M', NH: 'NH', 'SSS+': 'SSS+' };
  const ELITE_RANKS = new Set(['Monarch+', 'Monarch', 'NH', 'SSS+']);

  const GRADE_COLORS = {
    Common: '#888', Elite: '#22c55e', Knight: '#3b82f6',
    'Elite Knight': '#8a2be2', General: '#f59e0b', Marshal: '#ef4444', 'Grand Marshal': '#ff6b2b',
  };
  const GRADE_ABBREV = {
    Common: 'C', Elite: 'E', Knight: 'K', 'Elite Knight': 'EK',
    General: 'G', Marshal: 'M', 'Grand Marshal': 'GM',
  };

  function formatPower(raw) {
    if (!raw) return '0';
    if (raw >= 1e6) return (raw / 1e6).toFixed(1) + 'M';
    if (raw >= 1e3) return (raw / 1e3).toFixed(1) + 'K';
    return String(Math.floor(raw));
  }

  // RankBox
  function RankBox({ rank, count, color, isElite }) {
    const label = RANK_LABELS[rank] || rank;
    const boxStyle = {
      textAlign: 'center',
      padding: isElite ? '3px 2px' : '4px',
      background: isElite ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.4)',
      borderRadius: '0',
      border: `1px solid ${color}${isElite ? '60' : '40'}`,
      boxShadow: isElite && count > 0 ? `0 0 6px ${color}30` : undefined,
      transition: 'all 0.2s ease',
    };
    const labelStyle = {
      color,
      fontSize: isElite ? '8px' : '10px',
      fontWeight: 'bold',
      textShadow: isElite && count > 0 ? `0 0 4px ${color}` : 'none',
    };
    const countStyle = {
      color: count > 0 ? '#fff' : '#555',
      fontSize: isElite ? '12px' : '14px',
      fontWeight: 'bold',
    };
    return ce('div', { className: 'rank-box', style: boxStyle },
      ce('div', { className: 'rank-label', style: labelStyle }, label),
      ce('div', { className: 'rank-count', style: countStyle }, count)
    );
  }

  // ShadowArmyWidget
  function ShadowArmyWidget() {
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
    const [data, setData] = React.useState(null);

    // NOTE: forceUpdate wiring moved to refreshCounter useEffect below

    // Fetch rank data on mount + whenever forceUpdate is called
    const [refreshCounter, setRefreshCounter] = React.useState(0);
    const fetchIdRef = React.useRef(0);

    // Wire up forceUpdate to increment refreshCounter (triggers re-fetch)
    React.useEffect(() => {
      const origForceUpdate = pluginInstance._widgetForceUpdate;
      pluginInstance._widgetForceUpdate = () => setRefreshCounter((c) => c + 1);
      return () => { pluginInstance._widgetForceUpdate = origForceUpdate || null; };
    }, []);

    React.useEffect(() => {
      const id = ++fetchIdRef.current;
      (async () => {
        try {
          let rankCounts, totalCount, gradeCounts;
          const sm = pluginInstance.storageManager;

          // Helper: count grades from a flat shadows array
          function tallyGrades(shadowsArr) {
            const map = {};
            for (const s of shadowsArr) {
              const g = s.grade || 'Common';
              map[g] = (map[g] || 0) + 1;
            }
            return map;
          }

          if (sm?.getCountByRank) {
            try {
              const counts = await Promise.all(
                RANKS.map(async (rank) => ({
                  rank, count: await sm.getCountByRank(rank), color: RANK_COLORS[rank] || '#999',
                }))
              );
              totalCount = (await sm.getTotalCount()) || counts.reduce((s, r) => s + r.count, 0);
              rankCounts = counts;

              // Tally grades via batch cursor if available, else fall back to settings.shadows
              const gradeMap = {};
              if (sm.forEachShadowBatch) {
                await sm.forEachShadowBatch((batch) => {
                  for (const s of batch) {
                    const g = s.grade || 'Common';
                    gradeMap[g] = (gradeMap[g] || 0) + 1;
                  }
                });
                gradeCounts = gradeMap;
              } else {
                gradeCounts = tallyGrades(pluginInstance.settings.shadows || []);
              }
            } catch (_) {
              const shadows = pluginInstance.settings.shadows || [];
              totalCount = shadows.length;
              const map = shadows.reduce((c, s) => { c[s.rank || 'E'] = (c[s.rank || 'E'] || 0) + 1; return c; }, {});
              rankCounts = RANKS.map((rank) => ({ rank, count: map[rank] || 0, color: RANK_COLORS[rank] || '#999' }));
              gradeCounts = tallyGrades(shadows);
            }
          } else {
            const shadows = pluginInstance.settings.shadows || [];
            totalCount = shadows.length;
            const map = shadows.reduce((c, s) => { c[s.rank || 'E'] = (c[s.rank || 'E'] || 0) + 1; return c; }, {});
            rankCounts = RANKS.map((rank) => ({ rank, count: map[rank] || 0, color: RANK_COLORS[rank] || '#999' }));
            gradeCounts = tallyGrades(shadows);
          }

          // Fetch fresh total power
          let freshPower = pluginInstance.settings.cachedTotalPower || 0;
          if (typeof pluginInstance.getTotalShadowPower === 'function') {
            try { freshPower = await pluginInstance.getTotalShadowPower(); } catch (_) {}
          }

          if (id === fetchIdRef.current) setData({ rankCounts, totalCount, gradeCounts, totalPower: freshPower });
        } catch (err) {
          pluginInstance.debugError?.('WIDGET', 'Error fetching widget data', err);
        }
      })();
    }, [refreshCounter]);

    if (!data) return null;
    const { rankCounts, totalCount, gradeCounts = {}, totalPower: rawTotalPower = 0 } = data;
    const totalPower = formatPower(rawTotalPower);
    const essence = (pluginInstance.settings.shadowEssence?.essence || 0).toLocaleString();
    const eliteRanks = rankCounts.filter((r) => ELITE_RANKS.has(r.rank));
    const standardRanks = rankCounts.filter((r) => !ELITE_RANKS.has(r.rank));

    // Empty state
    if (totalCount === 0) {
      return ce(React.Fragment, null,
        ce('div', { className: 'widget-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
          ce('div', { className: 'widget-title', style: { color: '#8a2be2', fontSize: '12px', fontWeight: 'bold' } }, 'MY SHADOW ARMY'),
          ce('div', { className: 'widget-total', style: { color: '#999', fontSize: '11px' } }, '0 Total')
        ),
        ce('div', { style: { textAlign: 'center', padding: '20px', color: '#999', fontSize: '11px' } }, 'No shadows yet')
      );
    }

    return ce(React.Fragment, null,
      // Header
      ce('div', { className: 'widget-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
        ce('div', { className: 'widget-title', style: { color: '#8a2be2', fontSize: '12px', fontWeight: 'bold', textShadow: '0 0 8px rgba(138, 43, 226, 0.8)' } }, 'MY SHADOW ARMY'),
        ce('div', { className: 'widget-total', style: { color: '#999', fontSize: '11px' } }, totalCount + ' Total')
      ),
      // Power bar (with essence)
      ce('div', { className: 'widget-power', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px', padding: '6px 8px', background: 'rgba(0, 0, 0, 0.8)', border: '1px solid rgba(138, 43, 226, 0.5)', borderRadius: '0', flexWrap: 'wrap' } },
        ce('span', { style: { color: '#8a2be2', fontSize: '11px', fontWeight: '600', textShadow: '0 0 4px rgba(138, 43, 226, 0.6)', fontFamily: "'Orbitron', sans-serif" } }, '\u2694 Power: ' + totalPower),
        ce('span', { style: { color: 'rgba(138, 43, 226, 0.4)', fontSize: '10px' } }, '|'),
        ce('span', { style: { color: '#9370db', fontSize: '11px', fontWeight: '600' } }, '\u2726 Essence: ' + essence)
      ),
      // Elite ranks grid
      ce('div', { className: 'elite-rank-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '6px' } },
        eliteRanks.map(({ rank, count, color }) => ce(RankBox, { key: rank, rank, count, color, isElite: true }))
      ),
      // Standard ranks grid
      ce('div', { className: 'rank-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '6px' } },
        standardRanks.map(({ rank, count, color }) => ce(RankBox, { key: rank, rank, count, color, isElite: false }))
      ),
      // Grade distribution bar
      ce('div', { className: 'grade-bar', style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' } },
        SHADOW_GRADES.map((grade) => {
          const count = gradeCounts[grade] || 0;
          const color = GRADE_COLORS[grade];
          const abbrev = GRADE_ABBREV[grade];
          return ce('div', {
            key: grade,
            title: grade,
            style: {
              textAlign: 'center', padding: '2px 1px',
              background: count > 0 ? `rgba(0,0,0,0.5)` : 'rgba(0,0,0,0.2)',
              border: `1px solid ${color}${count > 0 ? '50' : '20'}`,
              borderRadius: '0',
            },
          },
            ce('div', { style: { color, fontSize: '7px', fontWeight: 'bold', lineHeight: '1.2' } }, abbrev),
            ce('div', { style: { color: count > 0 ? '#fff' : '#444', fontSize: '9px', fontWeight: 'bold' } }, count)
          );
        })
      ),
      // Divider line (bottom edge)
      ce('div', { style: { marginTop: '4px', borderTop: '1px solid rgba(138, 43, 226, 0.2)' } })
    );
  }

  return { ShadowArmyWidget, RankBox };
}

module.exports = { buildWidgetComponents };
