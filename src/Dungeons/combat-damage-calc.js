const C = require('./constants');
const Dungeons = { RANK_MULTIPLIERS: C.RANK_MULTIPLIERS };

module.exports = {
  applyBossDamageVariance(baseDamage) {
    const variance = 0.75 + Math.random() * 0.5; // 75% to 125%
    return Math.floor(baseDamage * variance);
  },

  applyMobDamageVariance(baseDamage) {
    const variance = 0.8 + Math.random() * 0.4; // 80% to 120%
    return Math.floor(baseDamage * variance);
  },

  calculateBossDamageToUser(
    bossStats,
    userStats,
    bossRank,
    userRank,
    bossRole = '',
    bossFamily = ''
  ) {
    let rawDamage = this.calculateEnemyDamage(bossStats, userStats, bossRank, userRank);
    rawDamage = this.applyBossDamageVariance(rawDamage);
    const roleMultiplier = this.getMonsterOutgoingDamageMultiplier(bossRole, bossFamily, 'user');
    // Apply minimal reduction (10%) - user takes most of the damage when shadows are dead
    // This ensures proper damage scaling based on boss stats
    return Math.max(1, Math.floor(rawDamage * 0.9 * roleMultiplier));
  },

  calculateMobDamageToUser(mobStats, userStats, mobRank, userRank, mobRole = '', mobFamily = '') {
    let rawDamage = this.calculateEnemyDamage(mobStats, userStats, mobRank, userRank);
    rawDamage = this.applyMobDamageVariance(rawDamage);
    const roleMultiplier = this.getMonsterOutgoingDamageMultiplier(mobRole, mobFamily, 'user');
    // Apply minimal reduction (15%) - mobs are slightly weaker but still deal proper damage
    // This ensures proper damage scaling based on mob stats
    return Math.max(1, Math.floor(rawDamage * 0.85 * roleMultiplier));
  },

  calculateBossDamageToShadow(
    bossStats,
    shadowStats,
    bossRank,
    shadowRank,
    bossRole = '',
    shadowRole = '',
    bossFamily = ''
  ) {
    let damage = this.calculateEnemyDamage(bossStats, shadowStats, bossRank, shadowRank);
    damage = Math.floor(damage * 0.6); // 40% damage reduction (was 60%)
    damage = this.applyBossDamageVariance(damage);
    const roleMultiplier = this.getMonsterOutgoingDamageMultiplier(bossRole, bossFamily, 'shadow');
    // Slight protection for tank/support shadows against heavy monster archetypes.
    const shadowArchetype = this._getShadowArchetypeForRole(shadowRole);
    const defenderMultiplier =
      shadowArchetype === 'tank' ? 0.92 : shadowArchetype === 'support' ? 0.96 : 1;
    return Math.max(1, Math.floor(damage * roleMultiplier * defenderMultiplier));
  },

  calculateMobDamageToShadow(
    mobStats,
    shadowStats,
    mobRank,
    shadowRank,
    mobRole = '',
    shadowRole = '',
    mobFamily = ''
  ) {
    let damage = this.calculateEnemyDamage(mobStats, shadowStats, mobRank, shadowRank);
    damage = Math.floor(damage * 0.5); // 50% damage reduction (was 70%)
    damage = this.applyMobDamageVariance(damage);
    const roleMultiplier = this.getMonsterOutgoingDamageMultiplier(mobRole, mobFamily, 'shadow');
    const shadowArchetype = this._getShadowArchetypeForRole(shadowRole);
    const defenderMultiplier =
      shadowArchetype === 'tank' ? 0.9 : shadowArchetype === 'support' ? 0.95 : 1;
    return Math.max(1, Math.floor(damage * roleMultiplier * defenderMultiplier));
  },

  buildShadowStats(shadow) {
    // CRITICAL: Use effective stats (includes ALL stat sources: baseStats + growthStats + naturalGrowthStats)
    const effectiveStats = this.getShadowEffectiveStatsCached(shadow);

    if (effectiveStats) {
      return {
        strength: effectiveStats.strength || 0,
        agility: effectiveStats.agility || 0,
        intelligence: effectiveStats.intelligence || 0,
        vitality: effectiveStats.vitality || 0,
        perception: effectiveStats.perception || 0,
      };
    }

    // Fallback: Calculate manually if effective stats unavailable
    const baseStats = shadow.baseStats || {};
    const growthStats = shadow.growthStats || {};
    const naturalGrowthStats = shadow.naturalGrowthStats || {};

    return {
      strength:
        (baseStats.strength || 0) +
          (growthStats.strength || 0) +
          (naturalGrowthStats.strength || 0) ||
        shadow.strength ||
        0,
      agility:
        (baseStats.agility || 0) + (growthStats.agility || 0) + (naturalGrowthStats.agility || 0) ||
        0,
      intelligence:
        (baseStats.intelligence || 0) +
          (growthStats.intelligence || 0) +
          (naturalGrowthStats.intelligence || 0) || 0,
      vitality:
        (baseStats.vitality || 0) +
          (growthStats.vitality || 0) +
          (naturalGrowthStats.vitality || 0) ||
        shadow.vitality ||
        50,
      perception:
        (baseStats.perception || 0) +
          (growthStats.perception || 0) +
          (naturalGrowthStats.perception || 0) || 0,
    };
  },

  checkCriticalHit(messageElement) {
    if (!messageElement) return false;
    return (
      messageElement.classList?.contains('bd-crit-hit') ||
      messageElement.querySelector?.('.bd-crit-hit') !== null
    );
  },

  calculateMobXP(mobRank, userParticipating = true) {
    const rankIndex = this.getRankIndexValue(mobRank);
    const baseXP = 10 + rankIndex * 5;
    return userParticipating ? baseXP : Math.floor(baseXP * 0.3);
  },

  calculateAttacksInSpan(timeSinceLastAttack, attackCooldown, cyclesMultiplier = 1) {
    const activeInterval = 1000;
    const multiplier = Number.isFinite(Number(cyclesMultiplier)) && Number(cyclesMultiplier) > 0
      ? Math.floor(Number(cyclesMultiplier))
      : 1;
    const totalTimeSpan = multiplier * activeInterval;
    const effectiveCooldown = this.getEffectiveAttackCooldownMs
      ? this.getEffectiveAttackCooldownMs(attackCooldown, activeInterval)
      : Math.max(800, Number.isFinite(Number(attackCooldown)) && Number(attackCooldown) > 0
          ? Number(attackCooldown)
          : activeInterval);
    const effectiveElapsed = this.getCappedAttackElapsedMs
      ? this.getCappedAttackElapsedMs(timeSinceLastAttack, effectiveCooldown, totalTimeSpan)
      : Math.min(
          Math.max(0, Number(timeSinceLastAttack) || 0),
          Math.max(totalTimeSpan * 2, effectiveCooldown * 4)
        );
    return Math.floor(effectiveElapsed / effectiveCooldown);
  },

  applyRoleDamageMultiplier(role, damage) {
    const archetype = this._getShadowArchetypeForRole(role);

    let multiplier = 1;
    switch (archetype) {
      case 'tank':
        multiplier = 0.88;
        break;
      case 'support':
        multiplier = 0.93;
        break;
      case 'caster':
        multiplier = 1.1;
        break;
      case 'striker':
        multiplier = 1.14;
        break;
      case 'ranger':
        multiplier = 1.07;
        break;
      default:
        multiplier = 1;
        break;
    }
    return damage * multiplier;
  }
};
