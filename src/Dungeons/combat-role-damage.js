module.exports = {
  buildDungeonCombatSnapshot({ dungeon, aliveMobs, bossAlive }) {
    // Build Map directly (no intermediate array allocation)
    const mobById = new Map();
    if (aliveMobs) {
      for (const mob of aliveMobs) {
        const id = this.getEnemyKey(mob, 'mob');
        if (id) mobById.set(id, mob);
      }
    }
    return { mobById, bossAlive: Boolean(bossAlive) };
  },

  applyDamageToEntityHp(entity, damage) {
    const oldHp = Number.isFinite(entity?.hp) ? entity.hp : 0;
    const applied = Number.isFinite(damage) ? damage : 0;
    const newHp = Math.max(0, oldHp - applied);
    entity && (entity.hp = newHp);
    return { oldHp, newHp, died: oldHp > 0 && newHp <= 0 };
  },

  getShadowBossTargetChance({ dungeon, aliveMobs, bossUnlocked = true }) {
    if (!bossUnlocked || (dungeon?.boss?.hp || 0) <= 0) return 0;

    const mobCount =
      typeof aliveMobs === 'number' ? aliveMobs : Array.isArray(aliveMobs) ? aliveMobs.length : 0;
    const maxHp = dungeon?.boss?.maxHp || 0;
    const hp = dungeon?.boss?.hp || 0;
    const bossFraction = maxHp > 0 ? hp / maxHp : 1;

    const shadowMobTargetShare = Number.isFinite(this.settings?.shadowMobTargetShare)
      ? this.settings.shadowMobTargetShare
      : 0.7;
    const baseBossShare = this.clampNumber(1 - shadowMobTargetShare, 0.05, 0.95);
    const lowHpThreshold = Number.isFinite(this.settings?.shadowBossFocusLowHpThreshold)
      ? this.settings.shadowBossFocusLowHpThreshold
      : 0.4;
    const lowHpBossShare = this.clampNumber(
      Number.isFinite(this.settings?.shadowBossTargetShareLowBossHp)
        ? this.settings.shadowBossTargetShareLowBossHp
        : 0.6,
      0.05,
      0.95
    );

    const mobPressurePenalty =
      mobCount >= 1500 ? 0.08 : mobCount >= 800 ? 0.05 : mobCount >= 400 ? 0.03 : 0;

    if (bossFraction <= lowHpThreshold) {
      return this.clampNumber(Math.max(lowHpBossShare, baseBossShare), 0.05, 0.95);
    }

    return this.clampNumber(baseBossShare - mobPressurePenalty, 0.05, 0.95);
  },

  applyBehaviorModifier(behavior, attackDamage) {
    const behaviorMultipliers = {
      aggressive: 1.3,
      balanced: 1.0,
      tactical: 0.85,
    };
    return Math.floor(attackDamage * (behaviorMultipliers[behavior] || 1.0));
  },

  isRoleCombatModelEnabled() {
    const version = Number.isFinite(this.settings?.roleCombatModelVersion)
      ? this.settings.roleCombatModelVersion
      : 1;
    return this.settings?.roleCombatModelEnabled !== false && version >= 1;
  },

  normalizeShadowRoleKey(role) {
    if (typeof role !== 'string') return '';
    const normalized = role.trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'warrior') return 'knight';
    if (normalized === 'guardian') return 'tank';
    if (normalized === 'priest') return 'healer';
    return normalized;
  },

  normalizeShadowPersonalityKey(personality) {
    if (typeof personality !== 'string') return '';
    return personality.trim().toLowerCase();
  },

  deriveMonsterRoleFromBeast(beastType, beastFamily) {
    const normalizedType = this.normalizeShadowRoleKey(beastType);
    const normalizedFamily = typeof beastFamily === 'string' ? beastFamily.trim().toLowerCase() : '';
    const familyFallbacks = {
      insect: 'ant',
      beast: 'wolf',
      reptile: 'naga',
      ice: 'yeti',
      dragon: 'dragon',
      giant: 'giant',
      demon: 'demon',
      undead: 'ghoul',
      construct: 'golem',
      ancient: 'elf',
      'humanoid-beast': 'orc',
    };

    if (normalizedType && normalizedType !== 'beast' && normalizedType !== 'magic-beast') {
      return normalizedType;
    }

    const fallbackRole = familyFallbacks[normalizedFamily] || '';
    if (fallbackRole) return fallbackRole;

    if (normalizedType === 'beast' || normalizedType === 'magic-beast') {
      return 'wolf';
    }

    return normalizedType || 'balanced';
  },

  ensureMonsterRole(entity) {
    if (!entity || typeof entity !== 'object') return '';
    const resolvedRole = this.deriveMonsterRoleFromBeast(
      entity.role || entity.beastType || entity.type || '',
      entity.beastFamily || entity.family || ''
    );
    if (resolvedRole && entity.role !== resolvedRole) {
      entity.role = resolvedRole;
    }
    return resolvedRole;
  },

  getMonsterOutgoingDamageMultiplier(monsterRole, beastFamily, targetType = 'shadow') {
    if (!this.isRoleCombatModelEnabled()) return 1;
    const roleKey = this.deriveMonsterRoleFromBeast(monsterRole, beastFamily);
    const personalityKey = this.derivePersonalityKeyFromRole(roleKey);
    const archetype = this.getRoleCombatArchetype(roleKey, personalityKey);

    let multiplier = 1;
    switch (archetype) {
      case 'tank':
        multiplier = targetType === 'user' ? 0.93 : 0.88;
        break;
      case 'support':
        multiplier = 0.95;
        break;
      case 'caster':
        multiplier = targetType === 'user' ? 1.12 : 1.04;
        break;
      case 'striker':
        multiplier = targetType === 'user' ? 1.09 : 1.14;
        break;
      case 'ranger':
        multiplier = 1.06;
        break;
      default:
        multiplier = 1;
        break;
    }

    return this.clampNumber(multiplier, 0.8, 1.2);
  },

  derivePersonalityKeyFromRole(roleKey) {
    switch (roleKey) {
      case 'tank':
      case 'golem':
      case 'yeti':
        return 'tank';
      case 'healer':
      case 'support':
        return 'supportive';
      case 'mage':
      case 'spider':
      case 'centipede':
      case 'serpent':
      case 'naga':
      case 'elf':
        return 'strategic';
      case 'ranger':
      case 'wolf':
      case 'wyvern':
        return 'tactical';
      case 'assassin':
      case 'berserker':
      case 'ant':
      case 'bear':
      case 'dragon':
      case 'titan':
      case 'giant':
      case 'demon':
      case 'ghoul':
      case 'orc':
      case 'ogre':
        return 'aggressive';
      default:
        return 'balanced';
    }
  },

  getRoleCombatArchetype(roleKey, personalityKey = 'balanced') {
    switch (roleKey) {
      case 'tank':
      case 'golem':
      case 'yeti':
        return 'tank';
      case 'healer':
      case 'support':
        return 'support';
      case 'mage':
      case 'spider':
      case 'centipede':
      case 'serpent':
      case 'naga':
      case 'elf':
        return 'caster';
      case 'assassin':
      case 'berserker':
      case 'ant':
      case 'bear':
      case 'dragon':
      case 'titan':
      case 'giant':
      case 'demon':
      case 'ghoul':
      case 'orc':
      case 'ogre':
        return 'striker';
      case 'ranger':
      case 'wolf':
      case 'wyvern':
        return 'ranger';
      case 'knight':
        return 'balanced';
      default:
        break;
    }

    switch (personalityKey) {
      case 'tank':
        return 'tank';
      case 'supportive':
        return 'support';
      case 'strategic':
        return 'caster';
      case 'aggressive':
        return 'striker';
      case 'tactical':
        return 'ranger';
      default:
        return 'balanced';
    }
  },

  _createRoleCombatState(now = Date.now()) {
    return {
      updatedAt: now,
      mark: 0, // Enemy vulnerability pressure from role coordination
      guard: 0, // Incoming damage mitigation from tanks/support
      weaken: 0, // Enemy output suppression from caster/support pressure
    };
  },

  _decayRoleCombatStateInPlace(state, now = Date.now()) {
    if (!state || !Number.isFinite(state.updatedAt)) return;
    const elapsed = Math.max(0, now - state.updatedAt);
    if (elapsed <= 0) return;

    const decayWindowMs = 12000;
    const decay = elapsed >= 60000 ? 0 : Math.max(0, 1 - elapsed / decayWindowMs);
    state.mark *= decay;
    state.guard *= decay;
    state.weaken *= decay;
    state.updatedAt = now;
  },

  getRoleCombatState(channelKey, now = Date.now()) {
    if (!channelKey || !this.isRoleCombatModelEnabled()) return null;
    let state = this._roleCombatStates.get(channelKey);
    if (!state) {
      state = this._createRoleCombatState(now);
      this._roleCombatStates.set(channelKey, state);
      return state;
    }
    this._decayRoleCombatStateInPlace(state, now);
    return state;
  },

  clearRoleCombatState(channelKey = null) {
    if (!this._roleCombatStates) return;
    if (channelKey) {
      this._roleCombatStates.delete(channelKey);
      return;
    }
    this._roleCombatStates.clear();
  },

  buildRolePressureBucket() {
    return {
      tank: 0,
      support: 0,
      caster: 0,
      striker: 0,
      ranger: 0,
      balanced: 0,
    };
  },

  _resolveShadowRoleProfile(shadow, combatData = null) {
    const roleKey = this.normalizeShadowRoleKey(
      shadow?.role || shadow?.roleName || shadow?.ro || ''
    );
    const explicitPersonality = this.normalizeShadowPersonalityKey(
      shadow?.personalityKey || shadow?.personality || combatData?.personality || combatData?.behavior || ''
    );
    const personalityKey = explicitPersonality || this.derivePersonalityKeyFromRole(roleKey);
    const archetype = this.getRoleCombatArchetype(roleKey, personalityKey);

    return {
      roleKey,
      personalityKey,
      archetype,
    };
  },

  _getShadowArchetypeForRole(shadowRole = '', combatData = null) {
    const shadowSource =
      shadowRole && typeof shadowRole === 'object' ? shadowRole : { role: shadowRole };
    const { archetype } = this._resolveShadowRoleProfile(shadowSource, combatData);
    return archetype || 'balanced';
  },

  _addRolePressureSample(rolePressure, shadow, combatData, attacks, scaleFactor = 1) {
    if (!rolePressure || !Number.isFinite(attacks) || attacks <= 0) return;

    const { archetype } = this._resolveShadowRoleProfile(shadow, combatData);
    const weightedAttacks = attacks * Math.max(0.25, Number.isFinite(scaleFactor) ? scaleFactor : 1);
    rolePressure[archetype] = (rolePressure[archetype] || 0) + weightedAttacks;
  },

  updateRoleCombatStateFromPressure(channelKey, rolePressure) {
    if (!channelKey || !rolePressure || !this.isRoleCombatModelEnabled()) return null;

    const state = this.getRoleCombatState(channelKey, Date.now());
    if (!state) return null;

    const pressure = (value) => Math.log10(1 + Math.max(0, Number(value) || 0));
    const tankP = pressure(rolePressure.tank);
    const supportP = pressure(rolePressure.support);
    const casterP = pressure(rolePressure.caster);
    const strikerP = pressure(rolePressure.striker);
    const rangerP = pressure(rolePressure.ranger);
    const balancedP = pressure(rolePressure.balanced);

    state.mark = this.clampNumber(
      state.mark + strikerP * 0.95 + rangerP * 0.65 + casterP * 0.35,
      0,
      8
    );
    state.guard = this.clampNumber(
      state.guard + tankP * 0.05 + supportP * 0.04 + balancedP * 0.02,
      0,
      0.55
    );
    state.weaken = this.clampNumber(state.weaken + casterP * 0.04 + supportP * 0.03, 0, 0.35);
    state.updatedAt = Date.now();
    return state;
  },

  getRoleCombatTickContext(channelKey) {
    if (!this.isRoleCombatModelEnabled() || !channelKey) {
      return {
        enabled: false,
        bossMarkMultiplier: 1,
        mobMarkMultiplier: 1,
        incomingDamageMultiplier: 1,
      };
    }

    const state = this.getRoleCombatState(channelKey);
    if (!state) {
      return {
        enabled: false,
        bossMarkMultiplier: 1,
        mobMarkMultiplier: 1,
        incomingDamageMultiplier: 1,
      };
    }

    const bossMarkMultiplier = this.clampNumber(1 + state.mark * 0.03, 1, 1.24);
    const mobMarkMultiplier = this.clampNumber(1 + state.mark * 0.015, 1, 1.12);
    const incomingReduction = state.guard * 0.45 + state.weaken * 0.55;
    const incomingDamageMultiplier = this.clampNumber(1 - incomingReduction, 0.55, 1);

    return {
      enabled: true,
      state,
      bossMarkMultiplier,
      mobMarkMultiplier,
      incomingDamageMultiplier,
    };
  },

  getRoleCombatOutgoingDamageMultiplier({
    shadow,
    combatData,
    targetType = 'mob',
    bossHpFraction = 1,
    roleCombatContext = null,
  }) {
    if (!this.isRoleCombatModelEnabled()) return 1;

    const { personalityKey, archetype } = this._resolveShadowRoleProfile(shadow, combatData);

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

    switch (personalityKey) {
      case 'aggressive':
        multiplier += 0.05;
        break;
      case 'strategic':
        multiplier += 0.03;
        break;
      case 'tactical':
        multiplier += 0.02;
        break;
      case 'supportive':
        multiplier -= 0.03;
        break;
      case 'tank':
        multiplier -= 0.02;
        break;
      default:
        break;
    }

    if (targetType === 'boss' && archetype === 'striker' && bossHpFraction <= 0.45) {
      multiplier += 0.08;
    } else if (targetType === 'mob' && archetype === 'ranger') {
      multiplier += 0.07;
    } else if (targetType === 'mob' && archetype === 'caster') {
      multiplier += 0.05;
    } else if (targetType === 'boss' && archetype === 'support') {
      multiplier -= 0.03;
    }

    const markMultiplier =
      roleCombatContext?.enabled === true
        ? targetType === 'boss'
          ? roleCombatContext.bossMarkMultiplier
          : roleCombatContext.mobMarkMultiplier
        : 1;

    return this.clampNumber(multiplier * markMultiplier, 0.7, 1.65);
  },

  getRoleCombatIncomingDamageMultiplier(channelKey, roleCombatContext = null) {
    if (!this.isRoleCombatModelEnabled()) return 1;
    if (roleCombatContext && Number.isFinite(roleCombatContext.incomingDamageMultiplier)) {
      return roleCombatContext.incomingDamageMultiplier;
    }
    const context = this.getRoleCombatTickContext(channelKey);
    return Number.isFinite(context?.incomingDamageMultiplier)
      ? context.incomingDamageMultiplier
      : 1;
  },

  calculateDamageBreakdown(attackerStats, defenderStats, attackerRank, defenderRank) {
    // Perception dodge: defender's perception grants dodge chance (max 30%)
    const defenderPerception = defenderStats.perception || 0;
    const dodgeChance = Math.min(30, defenderPerception * 0.15); // 0.15% per perception, cap 30%
    if (dodgeChance > 0 && Math.random() * 100 < dodgeChance) {
      return {
        damage: 0,
        dodged: true,
        wasCrit: false,
        critMultiplier: 1,
      };
    }

    const attackerStrength = attackerStats.strength || 0;
    const attackerAgility = attackerStats.agility || 0;
    const attackerIntelligence = attackerStats.intelligence || 0;

    // Base physical damage from strength (increased multiplier)
    let damage = 15 + attackerStrength * 3;

    // Magic damage from intelligence (increased)
    damage += attackerIntelligence * 2;

    // Rank scaling (single source of truth)
    damage *= this.getRankDamageMultiplier(attackerRank, defenderRank);

    // Critical hit chance from agility (better scaling)
    const critChance = Math.min(40, attackerAgility * 0.3); // Max 40% crit, 0.3% per agility
    const wasCrit = Math.random() * 100 < critChance;
    const critMultiplier = wasCrit ? 2.5 : 1;
    if (wasCrit) damage *= critMultiplier;

    // Defense reduction from defender's stats (reduced effectiveness)
    const defenderStrength = defenderStats.strength || 0;
    const defenderVitality = defenderStats.vitality || 0;
    const defense = defenderStrength * 0.25 + defenderVitality * 0.15; // Reduced from 0.5 and 0.3

    // Defense reduces damage by a percentage (not flat reduction)
    const defenseReduction = Math.min(0.7, defense / (defense + 100)); // Max 70% reduction
    damage = damage * (1 - defenseReduction);

    return {
      damage: Math.max(1, Math.floor(damage)),
      dodged: false,
      wasCrit,
      critMultiplier,
    };
  },

  calculateDamage(attackerStats, defenderStats, attackerRank, defenderRank) {
    return this.calculateDamageBreakdown(
      attackerStats,
      defenderStats,
      attackerRank,
      defenderRank
    ).damage;
  },

  calculateUserDamage(enemyStats, enemyRank) {
    return this.calculateUserDamageBreakdown(enemyStats, enemyRank).damage;
  },

  calculateUserDamageBreakdown(enemyStats, enemyRank) {
    if (!this.soloLevelingStats?.settings) {
      return this.calculateDamageBreakdown(
        { strength: 10, agility: 5, intelligence: 5 },
        enemyStats,
        'E',
        enemyRank
      );
    }

    // Use TOTAL EFFECTIVE STATS (base + title buffs + shadow buffs)
    const userStats =
      this.soloLevelingStats.getTotalEffectiveStats?.() ||
      this.soloLevelingStats.settings.stats ||
      {};
    const userRank = this.soloLevelingStats.settings.rank || 'E';

    return this.calculateDamageBreakdown(userStats, enemyStats, userRank, enemyRank);
  },

  _getMobStatReferenceForRank(rankIndex) {
    const safeRankIndex = Number.isFinite(rankIndex) ? Math.max(0, rankIndex) : 0;
    const base = this.calculateMobBaseStats(safeRankIndex);
    const perceptionRef = Math.max(
      10,
      Math.floor(((base.strength || 0) + (base.agility || 0) + (base.intelligence || 0)) / 6)
    );
    return {
      strength: Math.max(10, Number(base.strength) || 10),
      agility: Math.max(10, Number(base.agility) || 10),
      intelligence: Math.max(10, Number(base.intelligence) || 10),
      vitality: Math.max(10, Number(base.vitality) || 10),
      perception: perceptionRef,
    };
  },

  normalizeShadowCombatStatsByRank(stats, rank = 'E') {
    const safeStats = {
      strength: Number.isFinite(Number(stats?.strength)) ? Number(stats.strength) : 0,
      agility: Number.isFinite(Number(stats?.agility)) ? Number(stats.agility) : 0,
      intelligence: Number.isFinite(Number(stats?.intelligence)) ? Number(stats.intelligence) : 0,
      vitality: Number.isFinite(Number(stats?.vitality)) ? Number(stats.vitality) : 0,
      perception: Number.isFinite(Number(stats?.perception)) ? Number(stats.perception) : 0,
    };

    const pivotScale = Number.isFinite(this.settings?.shadowCombatStatPivotScale)
      ? this.settings.shadowCombatStatPivotScale
      : 3.5;
    const compressionExp = Number.isFinite(this.settings?.shadowCombatStatCompressionExp)
      ? this.settings.shadowCombatStatCompressionExp
      : 0.68;

    if (pivotScale <= 0 || compressionExp >= 1) {
      return safeStats;
    }

    const rankIndex = this.getRankIndexValue(rank);
    const reference = this._getMobStatReferenceForRank(rankIndex);
    const compress = (value, pivot) => {
      const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
      const safePivot = Math.max(1, Number.isFinite(pivot) ? pivot : 1);
      if (safeValue <= safePivot) return Math.floor(safeValue);
      return Math.floor(safePivot + Math.pow(safeValue - safePivot, compressionExp));
    };

    return {
      strength: compress(safeStats.strength, reference.strength * pivotScale),
      agility: compress(safeStats.agility, reference.agility * pivotScale),
      intelligence: compress(safeStats.intelligence, reference.intelligence * pivotScale),
      vitality: compress(safeStats.vitality, reference.vitality * pivotScale),
      perception: compress(safeStats.perception, reference.perception * pivotScale),
    };
  },

  getShadowEffectiveStatsCached(shadow) {
    const shadowId = this.getShadowIdValue(shadow);
    if (!shadowId) return null;

    const cacheKey = `shadow_${shadowId}`;
    const now = Date.now();

    // Check cache (2500ms TTL — stats don't mutate during combat ticks)
    if (this._shadowStatsCache && this._shadowStatsCache.has(cacheKey)) {
      const cached = this._shadowStatsCache.get(cacheKey);
      if (now - cached.timestamp < 2500) {
        return cached.stats;
      }
    }

    // Calculate stats - use ShadowArmy's method if available, otherwise fallback
    let stats = {
      strength: shadow.strength || 0,
      agility: shadow.agility || 0,
      intelligence: shadow.intelligence || 0,
      vitality: shadow.vitality || 0,
      perception: shadow.perception || 0,
    };

    // Try to get effective stats from ShadowArmy plugin (NOT recursive call!)
    if (this.shadowArmy && typeof this.shadowArmy.getShadowEffectiveStats === 'function') {
      try {
        const effectiveStats = this.shadowArmy.getShadowEffectiveStats(shadow);
        if (effectiveStats) {
          stats = {
            strength: effectiveStats.strength || stats.strength,
            agility: effectiveStats.agility || stats.agility,
            intelligence: effectiveStats.intelligence || stats.intelligence,
            vitality: effectiveStats.vitality || stats.vitality,
            perception: effectiveStats.perception || stats.perception,
          };
        }
      } catch (error) {
        this.errorLog('SHADOW_STATS', 'Error getting effective stats from ShadowArmy', error);
        // Fall through to fallback calculation
      }
    }

    // Fallback: calculate effective stats manually if ShadowArmy not available
    // CRITICAL: Include ALL stat sources (baseStats + growthStats + naturalGrowthStats)
    if (!this.shadowArmy || typeof this.shadowArmy.getShadowEffectiveStats !== 'function') {
      const baseStats = shadow.baseStats || {};
      const growthStats = shadow.growthStats || {};
      const naturalGrowthStats = shadow.naturalGrowthStats || {};
      stats = {
        strength:
          (baseStats.strength || 0) +
            (growthStats.strength || 0) +
            (naturalGrowthStats.strength || 0) || stats.strength,
        agility:
          (baseStats.agility || 0) +
            (growthStats.agility || 0) +
            (naturalGrowthStats.agility || 0) || stats.agility,
        intelligence:
          (baseStats.intelligence || 0) +
            (growthStats.intelligence || 0) +
            (naturalGrowthStats.intelligence || 0) || stats.intelligence,
        vitality:
          (baseStats.vitality || 0) +
            (growthStats.vitality || 0) +
            (naturalGrowthStats.vitality || 0) || stats.vitality,
        perception:
          (baseStats.perception || 0) +
            (growthStats.perception || 0) +
            (naturalGrowthStats.perception || 0) || stats.perception,
      };
    }

    stats = this.normalizeShadowCombatStatsByRank(stats, shadow?.rank || 'E');

    if (this._shadowStatsCache) {
      this._shadowStatsCache.set(cacheKey, { stats, timestamp: now });
    }

    return stats;
  },

  calculateShadowDamage(shadow, enemyStats, enemyRank) {
    const attacker = this.resolveCombatStats({ entityType: 'shadow', entity: shadow });
    const defender = this.resolveCombatStats({
      entityType: 'enemy',
      stats: enemyStats,
      rank: enemyRank,
      fallbackType: 'mob',
    });

    let damage = this.calculateDamage(attacker.stats, defender.stats, attacker.rank, defender.rank);

    // Apply role-based damage multiplier
    damage = this.applyRoleDamageMultiplier(shadow.role, damage);

    if (!Number.isFinite(damage) || damage < 0) {
      this.debugLog?.('COMBAT', 'NaN/invalid shadow damage, falling back to 1', { role: shadow?.role });
      return 1;
    }
    return Math.max(1, Math.floor(damage));
  },

  calculateEnemyDamage(enemyStats, targetStats, enemyRank, targetRank) {
    const attacker = this.resolveCombatStats({
      entityType: 'enemy',
      stats: enemyStats,
      rank: enemyRank,
      fallbackType: 'mob',
    });
    const defender = this.resolveCombatStats({
      entityType: 'enemy',
      stats: targetStats,
      rank: targetRank,
      fallbackType: 'shadow',
    });
    return this.calculateDamage(attacker.stats, defender.stats, attacker.rank, defender.rank);
  }
};
