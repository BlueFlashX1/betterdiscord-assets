/**
 * ShadowArmy — React widget components.
 * Factory function that creates ShadowArmyWidget and RankBox components.
 * Called in start(), NOT mixed onto prototype.
 */

function buildWidgetComponents(pluginInstance) {
  const React = BdApi.React;
  const ce = React.createElement;

  const RANKS = ['Monarch+', 'Monarch', 'NH', 'SSS+', 'SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E'];
  const RANK_COLORS = {
    'Monarch+': '#ff6b2b', Monarch: '#ff4500', NH: '#e040fb', 'SSS+': '#f50057',
    SSS: '#ec4899', SS: '#ef4444', S: '#f59e0b', A: '#8a2be2',
    B: '#3b82f6', C: '#22c55e', D: '#a0a0a0', E: '#999',
  };
  const RANK_LABELS = { 'Monarch+': 'M+', Monarch: 'M', NH: 'NH', 'SSS+': 'SSS+' };
  const ELITE_RANKS = new Set(['Monarch+', 'Monarch', 'NH', 'SSS+']);

  function formatPower(raw) {
    if (!raw) return '0';
    if (raw >= 1e6) return (raw / 1e6).toFixed(1) + 'M';
    if (raw >= 1e3) return (raw / 1e3).toFixed(1) + 'K';
    return String(Math.floor(raw));
  }

  // ── RankBox ──
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

  // ── ShadowArmyWidget ──
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
          let rankCounts, totalCount;
          const sm = pluginInstance.storageManager;
          if (sm?.getCountByRank) {
            try {
              const counts = await Promise.all(
                RANKS.map(async (rank) => ({
                  rank, count: await sm.getCountByRank(rank), color: RANK_COLORS[rank] || '#999',
                }))
              );
              totalCount = (await sm.getTotalCount()) || counts.reduce((s, r) => s + r.count, 0);
              rankCounts = counts;
            } catch (_) {
              const shadows = pluginInstance.settings.shadows || [];
              totalCount = shadows.length;
              const map = shadows.reduce((c, s) => { c[s.rank || 'E'] = (c[s.rank || 'E'] || 0) + 1; return c; }, {});
              rankCounts = RANKS.map((rank) => ({ rank, count: map[rank] || 0, color: RANK_COLORS[rank] || '#999' }));
            }
          } else {
            const shadows = pluginInstance.settings.shadows || [];
            totalCount = shadows.length;
            const map = shadows.reduce((c, s) => { c[s.rank || 'E'] = (c[s.rank || 'E'] || 0) + 1; return c; }, {});
            rankCounts = RANKS.map((rank) => ({ rank, count: map[rank] || 0, color: RANK_COLORS[rank] || '#999' }));
          }
          if (id === fetchIdRef.current) setData({ rankCounts, totalCount });
        } catch (err) {
          pluginInstance.debugError?.('WIDGET', 'Error fetching widget data', err);
        }
      })();
    }, [refreshCounter]);

    if (!data) return null;
    const { rankCounts, totalCount } = data;
    const totalPower = formatPower(pluginInstance.settings.cachedTotalPower || 0);
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
      // Power bar
      ce('div', { className: 'widget-power', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px', padding: '6px 8px', background: 'rgba(0, 0, 0, 0.8)', border: '1px solid rgba(138, 43, 226, 0.5)', borderRadius: '0' } },
        ce('span', { style: { color: '#8a2be2', fontSize: '11px', fontWeight: '600', textShadow: '0 0 4px rgba(138, 43, 226, 0.6)', fontFamily: "'Orbitron', sans-serif" } }, '\u2694 Total Power: ' + totalPower)
      ),
      // Elite ranks grid
      ce('div', { className: 'elite-rank-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '6px' } },
        eliteRanks.map(({ rank, count, color }) => ce(RankBox, { key: rank, rank, count, color, isElite: true }))
      ),
      // Standard ranks grid
      ce('div', { className: 'rank-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' } },
        standardRanks.map(({ rank, count, color }) => ce(RankBox, { key: rank, rank, count, color, isElite: false }))
      ),
      // Divider line (bottom edge)
      ce('div', { style: { marginTop: '8px', borderTop: '1px solid rgba(138, 43, 226, 0.2)' } })
    );
  }

  return { ShadowArmyWidget, RankBox };
}

module.exports = { buildWidgetComponents };
