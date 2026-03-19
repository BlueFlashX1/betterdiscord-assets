/**
 * ShadowArmy — UI helpers and Shadow Army modal component.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./modal'))
 */
const C = require('./constants');
const { SHADOW_GRADES } = C;

module.exports = {
  // UI HELPERS

  /**
   * Format combat time dynamically (seconds, minutes, or hours)
   */
  formatCombatHours(hours) {
    if (!hours || hours === 0) return '0s';

    const totalSeconds = hours * 3600;

    const timeFormatters = [
      [(s) => s < 60, (s) => `${Math.floor(s)}s`],
      [(s) => s < 3600, (s) => `${Math.floor(s / 60)}m`],
      [(s) => hours < 10, () => `${hours.toFixed(1)}h`],
      [() => true, () => `${Math.floor(hours)}h`],
    ];

    const [, formatter] = timeFormatters.find(([predicate]) => predicate(totalSeconds));
    return formatter(totalSeconds);
  },

  computeShadowArmyUiData(shadows) {
    const safeShadows = Array.isArray(shadows) ? shadows : [];

    const withPower = safeShadows.map((shadow) => {
      const power = this.calculateShadowPowerCached(shadow);
      const shadowId = this.getCacheKey(shadow);
      return { shadow, power, id: shadowId };
    });
    const sortedByPower = [...withPower].sort((a, b) => (b.power || 0) - (a.power || 0));
    const generals = sortedByPower.slice(0, 7).map((x) => x.shadow);

    const totalArmyPower = withPower.reduce((sum, { power }) => sum + (power || 0), 0);

    const statKeys = C.STAT_KEYS;
    const roleStats = safeShadows.reduce((stats, shadow) => {
      const role = shadow?.role || shadow?.roleName || 'Unknown';
      if (!stats[role]) {
        stats[role] = {
          count: 0,
          totalStats: statKeys.reduce((acc, key) => {
            acc[key] = 0;
            return acc;
          }, {}),
          totalLevel: 0,
          isMagicBeast: this.shadowRoles?.[role]?.isMagicBeast || false,
          gradeCounts: {},
          highestRank: 'E',
        };
      }

      stats[role].count++;
      const effective = this.getShadowEffectiveStats(shadow);
      statKeys.reduce((totalStats, key) => {
        totalStats[key] += effective?.[key] || 0;
        return totalStats;
      }, stats[role].totalStats);
      stats[role].totalLevel += shadow?.level || 1;
      // Track grade distribution per role
      const grade = shadow?.grade || 'Common';
      stats[role].gradeCounts[grade] = (stats[role].gradeCounts[grade] || 0) + 1;
      // Track highest rank in this role
      const shadowRank = shadow?.rank || 'E';
      const rankIdx = C.SHADOW_RANKS.indexOf(shadowRank);
      const curIdx = C.SHADOW_RANKS.indexOf(stats[role].highestRank);
      if (rankIdx > curIdx) stats[role].highestRank = shadowRank;
      return stats;
    }, {});

    const roleStatsWithAverages = Object.entries(roleStats).reduce((acc, [role, data]) => {
      const count = data.count || 1;
      acc[role] = {
        ...data,
        avgStats: statKeys.reduce((avgStats, key) => {
          avgStats[key] = Math.floor((data.totalStats?.[key] || 0) / count);
          return avgStats;
        }, {}),
        avgLevel: Math.floor((data.totalLevel || 0) / count),
      };
      acc[role].avgPower = Math.floor(
        statKeys.reduce((sum, key) => sum + (acc[role].avgStats?.[key] || 0), 0) / statKeys.length
      );
      return acc;
    }, {});

    const sortedRoles = Object.entries(roleStatsWithAverages).sort(
      (a, b) => (b?.[1]?.count || 0) - (a?.[1]?.count || 0)
    );

    return { generals, totalArmyPower, sortedRoles };
  },

  escapeHtml(value) {
    const str = value === null || value === undefined ? '' : String(value);
    return str.replace(/[&<>"']/g, (ch) => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[ch] || ch;
    });
  },

  // SHADOW ARMY MODAL

  /**
   * Cached React component factory for the Shadow Army Generals Modal.
   * Uses React.createElement (no JSX) with hooks for state & auto-refresh.
   */
  getShadowArmyModalComponent() {
    if (this.__ShadowArmyModalCached) return this.__ShadowArmyModalCached;
    const pluginRef = this;
    const React = BdApi.React;
    const { useState, useEffect, useCallback, useRef } = React;
    const ce = React.createElement;

    const { RANK_ORDER } = require("../shared/rank-utils");
    const RANKS_SA = RANK_ORDER;
    const RANK_COLORS_SA = {
      E: '#999', D: '#a0a0a0', C: '#22c55e', B: '#3b82f6', A: '#8a2be2',
      S: '#f59e0b', SS: '#ef4444', SSS: '#ec4899', 'SSS+': '#f50057',
      NH: '#e040fb', Monarch: '#ff4500', 'Monarch+': '#ff6b2b', 'Shadow Monarch': '#8a2be2',
    };

    // ---- Sub-component: Stat Card ----
    const StatCard = ({ value, label, color }) =>
      ce('div', { style: { textAlign: 'center' } },
        ce('div', { style: { color, fontSize: '20px', fontWeight: 'bold' } }, value),
        ce('div', { style: { color: '#999', fontSize: '11px' } }, label)
      );

    const GRADE_COLORS_SA = {
      Common: '#888', Elite: '#22c55e', Knight: '#3b82f6',
      'Elite Knight': '#8a2be2', General: '#f59e0b', Marshal: '#ef4444', 'Grand Marshal': '#ff6b2b',
    };

    // ---- Sub-component: Rank Distribution Cell ----
    const RankCell = ({ rank, count, total }) => {
      const color = RANK_COLORS_SA[rank] || '#999';
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
      return ce('div', { style: { textAlign: 'center', padding: '6px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px', border: `1px solid ${color}40` } },
        ce('div', { style: { color, fontSize: '14px', fontWeight: 'bold' } }, rank),
        ce('div', { style: { color: '#fff', fontSize: '16px', fontWeight: 'bold', margin: '2px 0' } }, count),
        ce('div', { style: { color: '#888', fontSize: '9px' } }, `${pct}%`)
      );
    };

    // ---- Sub-component: Grade Distribution Cell ----
    const GradeCell = ({ grade, count, total }) => {
      const color = GRADE_COLORS_SA[grade] || '#999';
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
      return ce('div', { style: { textAlign: 'center', padding: '6px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px', border: `1px solid ${color}40` } },
        ce('div', { style: { color, fontSize: '11px', fontWeight: 'bold' } }, grade),
        ce('div', { style: { color: '#fff', fontSize: '16px', fontWeight: 'bold', margin: '2px 0' } }, count),
        ce('div', { style: { color: '#888', fontSize: '9px' } }, `${pct}%`)
      );
    };

    // ---- Sub-component: Role Distribution Card ----
    const RoleCard = ({ role, data }) => {
      // Build compact grade summary: e.g. "3 Knight, 1 Elite"
      const gradeEntries = Object.entries(data.gradeCounts || {})
        .filter(([, c]) => c > 0)
        .sort((a, b) => {
          const ai = SHADOW_GRADES.indexOf(a[0]);
          const bi = SHADOW_GRADES.indexOf(b[0]);
          return bi - ai; // highest grade first
        });
      const highestRankColor = RANK_COLORS_SA[data.highestRank] || '#999';

      return ce('div', { style: { background: 'rgba(138, 43, 226, 0.1)', borderRadius: '6px', padding: '8px' } },
        ce('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
          ce('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
            ce('span', { style: { color: data.isMagicBeast ? '#f59e0b' : '#8a2be2', fontSize: '12px', fontWeight: 'bold' } }, role),
            data.highestRank && data.highestRank !== 'E'
              ? ce('span', { style: { color: highestRankColor, fontSize: '9px', fontWeight: '600', padding: '1px 3px', border: `1px solid ${highestRankColor}40`, borderRadius: '2px' } }, data.highestRank)
              : null
          ),
          ce('span', { style: { color: '#34d399', fontSize: '11px', fontWeight: 'bold' } }, data.count)
        ),
        ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', fontSize: '9px', color: '#999', marginBottom: '4px' } },
          ce('div', null, 'Lvl: ', ce('span', { style: { color: '#34d399' } }, data.avgLevel)),
          ce('div', null, 'Pwr: ', ce('span', { style: { color: '#8a2be2' } }, data.avgPower)),
          ce('div', null, 'STR: ', ce('span', { style: { color: '#ef4444' } }, data.avgStats?.strength ?? 0)),
          ce('div', null, 'INT: ', ce('span', { style: { color: '#3b82f6' } }, data.avgStats?.intelligence ?? 0))
        ),
        gradeEntries.length > 0 && !(gradeEntries.length === 1 && gradeEntries[0][0] === 'Common')
          ? ce('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' } },
              gradeEntries.map(([grade, count]) =>
                ce('span', {
                  key: grade,
                  style: {
                    color: GRADE_COLORS_SA[grade] || '#888',
                    fontSize: '8px',
                    fontWeight: '600',
                    padding: '1px 3px',
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '2px',
                  },
                }, count + ' ' + grade)
              )
            )
          : null
      );
    };

    // ---- Sub-component: General Card ----
    const GeneralCard = ({ shadow, index }) => {
      const safeShadow = shadow || {};
      const generalRank = (index || 0) + 1;
      const rawId = String(safeShadow.id || safeShadow.i || '');
      const shortId = rawId.slice(-8);

      const effectiveStats = pluginRef.getShadowEffectiveStats(safeShadow);
      const level = Number.isFinite(safeShadow.level) ? safeShadow.level : (parseInt(safeShadow.level, 10) || 1);

      const totalPower =
        typeof pluginRef.calculateShadowStrength === 'function'
          ? pluginRef.calculateShadowStrength(effectiveStats, level)
          : typeof pluginRef.calculateShadowPower === 'function'
          ? pluginRef.calculateShadowPower(effectiveStats, 1)
          : 0;

      const xp = Number.isFinite(safeShadow.xp) ? safeShadow.xp : (parseInt(safeShadow.xp, 10) || 0);
      const xpNeeded = pluginRef.getShadowXpForNextLevel(level, safeShadow.rank);
      const xpProgress = xpNeeded > 0 ? Math.max(0, Math.min(100, (xp / xpNeeded) * 100)) : 0;
      const combatTime = pluginRef.formatCombatHours(safeShadow.totalCombatTime || 0);
      const role = safeShadow.role || safeShadow.roleName || 'Unknown';
      const isMagicBeast = pluginRef.shadowRoles?.[role]?.isMagicBeast || false;
      const roleColor = isMagicBeast ? '#f59e0b' : '#fff';

      const statEntries = [
        { label: 'STR', color: '#ef4444', value: effectiveStats.strength || 0 },
        { label: 'AGI', color: '#22c55e', value: effectiveStats.agility || 0 },
        { label: 'INT', color: '#3b82f6', value: effectiveStats.intelligence || 0 },
        { label: 'VIT', color: '#a855f7', value: effectiveStats.vitality || 0 },
        { label: 'PER', color: '#fbbf24', value: effectiveStats.perception || 0 },
      ];

      return ce('div', {
        className: 'sa-general-card',
        'data-shadow-id': shortId,
        style: {
          background: 'rgba(251, 191, 36, 0.15)', border: '2px solid #fbbf24',
          borderRadius: '8px', padding: '14px', marginBottom: '12px',
          boxShadow: '0 0 15px rgba(251, 191, 36, 0.3)', overflow: 'hidden',
        },
      },
        ce('div', { style: { display: 'flex', gap: '12px' } },
          ce('div', {
            style: {
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#000',
              fontSize: '20px', fontWeight: 'bold', padding: '8px', borderRadius: '8px',
              width: '48px', height: '48px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            },
          }, ce('div', { style: { fontSize: '10px' } }, `#${generalRank}`)),
          ce('div', { style: { flex: 1, minWidth: 0, overflow: 'hidden' } },
            ce('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' } },
              ce('span', { style: { color: '#8a2be2', fontWeight: 'bold', fontSize: '14px', flexShrink: 0 } }, `[${safeShadow.rank || 'E'}]`),
              ce('span', { style: { color: GRADE_COLORS_SA[safeShadow.grade || 'Common'] || '#888', fontSize: '12px', fontWeight: '600', flexShrink: 0 } }, safeShadow.grade || 'Common'),
              ce('span', { style: { color: roleColor, fontSize: '14px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, role),
              ce('span', { style: { color: '#34d399', marginLeft: 'auto', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 } }, Math.floor(totalPower || 0).toLocaleString())
            ),
            ce('div', { style: { marginBottom: '8px' } },
              ce('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999', marginBottom: '2px' } },
                ce('span', null, `Level ${level}`),
                ce('span', null, `${xp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`)
              ),
              ce('div', { style: { background: 'rgba(0,0,0,0.3)', height: '6px', borderRadius: '3px', overflow: 'hidden' } },
                ce('div', { style: { background: 'linear-gradient(90deg, #fbbf24, #f59e0b)', width: `${xpProgress}%`, height: '100%', transition: 'width 0.3s' } })
              )
            ),
            ce('div', { style: { background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', padding: '8px', marginBottom: '8px' } },
              ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' } },
                statEntries.map((stat) =>
                  ce('div', { key: stat.label, style: { textAlign: 'center' } },
                    ce('div', { style: { color: stat.color, fontSize: '9px', fontWeight: '600', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' } }, stat.label),
                    ce('div', { style: { color: '#fff', fontSize: '16px', fontWeight: 'bold', lineHeight: '1.2' } }, (stat.value).toLocaleString())
                  )
                )
              )
            ),
            ce('div', { style: { display: 'flex', gap: '12px', fontSize: '11px' } },
              ce('div', { style: { color: '#34d399' } }, `${combatTime} Combat`),
              ce('div', { style: { color: '#8a2be2' } }, `Level ${level}`),
              ce('div', { style: { color: '#fbbf24', marginLeft: 'auto' } }, `ID: ${shortId}`)
            )
          )
        )
      );
    };

    // ---- Main Modal Component ----
    const ShadowArmyModal = ({ initialShadows, onClose }) => {
      const [shadows, setShadows] = useState(initialShadows || []);
      const refreshInFlightRef = useRef(false);

      useEffect(() => {
        const handleKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
      }, [onClose]);

      useEffect(() => {
        const intervalId = setInterval(async () => {
          if (document.hidden) return;
          if (refreshInFlightRef.current) return;
          if (!pluginRef._widgetDirty) return;

          try {
            refreshInFlightRef.current = true;
            pluginRef._widgetDirty = false;
            if (pluginRef.storageManager?.getShadows) {
              const totalCount = (await pluginRef.storageManager.getTotalCount()) || 0;
              if (totalCount <= 0) {
                setShadows([]);
                return;
              }
              if (totalCount > 2500) {
                pluginRef.debugLog('UI', 'Modal auto-refresh skipped for large army', {
                  totalCount,
                });
                return;
              }
              const freshShadows = await pluginRef.storageManager.getShadows({}, 0, totalCount);
              if (freshShadows && freshShadows.length > 0) {
                setShadows(freshShadows.map((s) => pluginRef.getShadowData(s)));
              }
            }
          } catch (error) {
            pluginRef.debugError('UI', 'Error refreshing UI', error);
          } finally {
            refreshInFlightRef.current = false;
          }
        }, 60000);
        return () => clearInterval(intervalId);
      }, []);

      const handleOverlayClick = useCallback((e) => {
        if (e.target === e.currentTarget) onClose();
      }, [onClose]);

      if (!shadows || shadows.length === 0) {
        return ce('div', {
          className: 'shadow-army-modal',
          onClick: handleOverlayClick,
          style: {
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0, 0, 0, 0.85)', zIndex: 10002,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(5px)',
          },
        },
          ce('div', { style: { width: '90%', maxWidth: '900px', background: '#1e1e2e', border: '2px solid #8a2be2', borderRadius: '12px', padding: '20px' } },
            ce('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
              ce('h2', { style: { color: '#8a2be2', margin: 0 } }, 'Shadow Army Command'),
              ce('button', { onClick: onClose, style: { background: 'transparent', border: 'none', color: '#999', fontSize: '24px', cursor: 'pointer', padding: 0, width: '30px', height: '30px' } }, '\u00d7')
            ),
            ce('div', { style: { textAlign: 'center', padding: '40px', color: '#999' } }, 'No shadows in army yet. Extract shadows from dungeons!')
          )
        );
      }

      const { generals, totalArmyPower, sortedRoles } = pluginRef.computeShadowArmyUiData(shadows);
      const totalCombatTime = pluginRef.formatCombatHours(
        shadows.reduce((sum, shadow) => sum + (shadow.totalCombatTime || 0), 0)
      );
      const currentEssence = pluginRef.settings.shadowEssence?.essence || 0;
      const essenceTotal = currentEssence.toLocaleString();
      const totalExtractions = (pluginRef.settings.totalShadowsExtracted || 0).toLocaleString();

      // Average army level
      const totalLevels = shadows.reduce((sum, s) => sum + (s.level || 1), 0);
      const avgLevel = shadows.length > 0 ? Math.floor(totalLevels / shadows.length) : 0;

      // Army capacity (from SoloLevelingStats integration)
      let capacityStr = '—';
      try {
        const soloData = pluginRef.getSoloLevelingData?.();
        if (soloData) {
          const cap = pluginRef.getShadowArmyCap?.(soloData.rank || 'E', soloData.stats?.intelligence || 0);
          if (cap === Infinity) {
            capacityStr = shadows.length.toLocaleString() + ' / ∞';
          } else if (typeof cap === 'number' && cap > 0) {
            capacityStr = shadows.length.toLocaleString() + ' / ' + cap.toLocaleString();
          }
        }
      } catch (_) {}

      const rankCounts = shadows.reduce((counts, shadow) => {
        const r = shadow.rank || 'E';
        counts[r] = (counts[r] || 0) + 1;
        return counts;
      }, {});

      const gradeCounts = shadows.reduce((counts, shadow) => {
        const g = shadow.grade || 'Common';
        counts[g] = (counts[g] || 0) + 1;
        return counts;
      }, {});

      // Grade promotion info: how many promotions affordable with current essence
      let promotionsAffordable = 0;
      let nextPromotionGrade = null;
      const gradeOrder = SHADOW_GRADES;
      const promotionCosts = pluginRef.settings.shadowEssence?.gradePromotionCost
        || pluginRef.defaultSettings?.shadowEssence?.gradePromotionCost || {};
      // Find cheapest next-grade promotion cost for any shadow
      for (let gi = 0; gi < gradeOrder.length - 1; gi++) {
        const grade = gradeOrder[gi];
        const nextGrade = gradeOrder[gi + 1];
        const cost = promotionCosts[nextGrade];
        if (cost && (gradeCounts[grade] || 0) > 0 && currentEssence >= cost) {
          if (!nextPromotionGrade) nextPromotionGrade = nextGrade;
          promotionsAffordable += Math.min(gradeCounts[grade], Math.floor(currentEssence / cost));
        }
      }

      return ce('div', {
        className: 'shadow-army-modal',
        onClick: handleOverlayClick,
        style: {
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0, 0, 0, 0.85)', zIndex: 10002,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(5px)',
        },
      },
        ce('div', {
          style: {
            width: '90%', maxWidth: '900px', maxHeight: '80vh',
            background: '#1e1e2e', border: '2px solid #8a2be2', borderRadius: '12px',
            padding: '20px', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          },
        },
          ce('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
            ce('h2', { style: { color: '#8a2be2', margin: 0 } }, 'Shadow Army Command'),
            ce('button', {
              onClick: onClose,
              style: { background: 'transparent', border: 'none', color: '#999', fontSize: '24px', cursor: 'pointer', padding: 0, width: '30px', height: '30px' },
            }, '\u00d7')
          ),

          ce('div', {
            style: {
              background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(168, 85, 247, 0.1))',
              border: '1px solid #8a2be2', borderRadius: '8px', padding: '12px', marginBottom: '16px',
            },
          },
            ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' } },
              ce(StatCard, { value: capacityStr, label: 'Army Capacity', color: '#8a2be2' }),
              ce(StatCard, { value: totalArmyPower.toLocaleString(), label: 'Total Power', color: '#fbbf24' }),
              ce(StatCard, { value: essenceTotal, label: 'Essence', color: '#9370db' }),
              ce(StatCard, { value: totalExtractions, label: 'Extracted', color: '#34d399' })
            ),
            ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' } },
              ce(StatCard, { value: avgLevel, label: 'Avg Level', color: '#22c55e' }),
              ce(StatCard, { value: totalCombatTime, label: 'Total Combat', color: '#ef4444' }),
              ce(StatCard, { value: promotionsAffordable > 0 ? promotionsAffordable : '—', label: 'Promotions Ready', color: '#f59e0b' }),
              ce(StatCard, { value: Object.keys(gradeCounts).filter(g => g !== 'Common' && (gradeCounts[g] || 0) > 0).length + ' / ' + (gradeOrder.length - 1), label: 'Grades Unlocked', color: '#ff6b2b' })
            ),

            ce('div', { style: { background: 'rgba(20, 20, 40, 0.6)', border: '1px solid rgba(138, 43, 226, 0.3)', borderRadius: '8px', padding: '12px', marginBottom: '12px' } },
              ce('div', { style: { color: '#8a2be2', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' } }, 'Shadow Rank Distribution'),
              ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' } },
                RANKS_SA.map((rank) => ce(RankCell, { key: rank, rank, count: rankCounts[rank] || 0, total: shadows.length }))
              )
            ),

            ce('div', { style: { background: 'rgba(20, 20, 40, 0.6)', border: '1px solid rgba(138, 43, 226, 0.3)', borderRadius: '8px', padding: '12px', marginBottom: '12px' } },
              ce('div', { style: { color: '#8a2be2', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' } }, 'Shadow Grade Distribution'),
              ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' } },
                SHADOW_GRADES.map((grade) => ce(GradeCell, { key: grade, grade, count: gradeCounts[grade] || 0, total: shadows.length }))
              )
            ),

            ce('div', { style: { background: 'rgba(20, 20, 40, 0.6)', border: '1px solid rgba(138, 43, 226, 0.3)', borderRadius: '8px', padding: '12px' } },
              ce('div', { style: { color: '#8a2be2', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' } }, 'Army Composition by Role/Class'),
              ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' } },
                sortedRoles.map(([role, data]) => ce(RoleCard, { key: role, role, data }))
              )
            )
          ),

          ce('div', { style: { marginBottom: '12px' } },
            ce('h3', { style: { color: '#fbbf24', fontSize: '16px', marginBottom: '12px', textAlign: 'center', textShadow: '0 0 10px rgba(251, 191, 36, 0.5)' } }, 'Shadow Generals')
          ),

          ce('div', { style: { maxHeight: '35vh', overflowY: 'auto' } },
            generals.length === 0
              ? ce('div', { style: { textAlign: 'center', padding: '40px', color: '#999' } }, 'No shadows in army yet. Extract shadows from dungeons!')
              : generals.map((shadow, i) => ce(GeneralCard, { key: pluginRef.getCacheKey(shadow) || i, shadow, index: i }))
          )
        )
      );
    };

    this.__ShadowArmyModalCached = ShadowArmyModal;
    return ShadowArmyModal;
  },

  /**
   * Open Shadow Army Generals Modal (React 18 createRoot).
   */
  async openShadowArmyUI() {
    if (this._armyModalOpen) {
      this.closeShadowArmyModal();
      return;
    }
    this._armyModalOpen = true;

    try {
      let shadows = [];
      if (this.storageManager?.getShadows) {
        try {
          shadows = await this.storageManager.getShadows({}, 0, Infinity);
        } catch (err) {
          this.debugError('UI', 'Could not get shadows from IndexedDB', err);
          shadows = this.settings.shadows || [];
        }
      } else {
        shadows = this.settings.shadows || [];
      }

      shadows = shadows.map((s) => this.getShadowData(s));

      const container = document.createElement('div');
      container.id = 'shadow-army-modal-root';
      container.style.display = 'contents';
      document.body.appendChild(container);

      this.shadowArmyModal = container;

      const createRoot = this._getCreateRoot();
      if (!createRoot) {
        container.remove();
        this._armyModalOpen = false;
        this.shadowArmyModal = null;
        this.debugError('UI', 'createRoot not available for shadow army modal');
        return;
      }

      const root = createRoot(container);
      this._armyModalRoot = root;

      const React = BdApi.React;
      root.render(React.createElement(this.getShadowArmyModalComponent(), {
        pluginInstance: this,
        initialShadows: shadows,
        onClose: () => this.closeShadowArmyModal(),
      }));
    } catch (error) {
      this.debugError('UI', 'Failed to open UI', error);
      this._armyModalOpen = false;
    }
  },

  closeShadowArmyModal() {
    this._armyModalOpen = false;

    if (this._armyModalRoot) {
      try {
        this._armyModalRoot.unmount();
      } catch (error) {
        this.debugError('UI', 'Failed to unmount army modal React root', error);
      }
      this._armyModalRoot = null;
    }

    document.getElementById('shadow-army-modal-root')?.remove();
    this.shadowArmyModal = null;

    try {
      Array.from(document.querySelectorAll('.shadow-army-modal')).forEach((modal) => {
        if (modal?.parentNode) modal.parentNode.removeChild(modal);
      });
    } catch (error) {
      this.debugError('UI', 'Error during modal cleanup', error);
    }
  },
};
