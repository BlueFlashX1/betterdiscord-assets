const C = require('./constants');

const DEFAULT_STATUS_EFFECTS = C.COMBAT_STATUS_EFFECTS || {
  poison: { maxStacks: 4, durationMs: 9000, tickMs: 1000, damagePctPerStack: 0.0025, maxDamagePct: 0.018 },
  armorBreak: { maxStacks: 3, durationMs: 7000, damageAmpPerStack: 0.06, maxDamageAmp: 0.2 },
  slow: { maxStacks: 3, durationMs: 7000, slowPerStack: 0.08, maxSlow: 0.3 },
  bleed: { maxStacks: 5, durationMs: 8000, tickMs: 1000, damagePctPerStack: 0.003, maxDamagePct: 0.02 },
  burn: { maxStacks: 3, durationMs: 6000, tickMs: 1000, damagePctPerStack: 0.005, maxDamagePct: 0.022 },
  frostbite: { maxStacks: 4, durationMs: 10000, slowPerStack: 0.10, maxSlow: 0.40, rootAtMaxStacks: true, rootDurationMs: 3000 },
  necrotic: { maxStacks: 3, durationMs: 9000, tickMs: 1000, damagePctPerStack: 0.002, maxDamagePct: 0.012, healReductionPerStack: 0.15, maxHealReduction: 0.45 },
  enrage: { maxStacks: 2, durationMs: Infinity, damageBoostPerStack: 0.20, maxDamageBoost: 0.40, speedBoostPerStack: 0.15, maxSpeedBoost: 0.30 },
};

const DEFAULT_STATUS_LIMITS = C.COMBAT_STATUS_LIMITS || {
  tickIntervalMs: 1000,
  maxTrackedMobsPerDungeon: 600,
};

module.exports = {
  _isCombatStatusEffectsEnabled() {
    return this.settings?.combatStatusEffectsEnabled !== false;
  },

  _ensureCombatStatusState(channelKey) {
    if (!channelKey) return null;
    this._combatStatusByChannel || (this._combatStatusByChannel = new Map());

    let state = this._combatStatusByChannel.get(channelKey);
    if (!state) {
      state = {
        boss: {},
        user: {},
        mobs: new Map(),
        nextTickAt: 0,
        lastPruneAt: 0,
        lastUserCleanseAt: 0,
        hasActive: false,
      };
      this._combatStatusByChannel.set(channelKey, state);
      return state;
    }

    // Defensive normalization for older/runtime-mutated shapes.
    if (!(state.mobs instanceof Map)) {
      state.mobs = new Map();
    }
    if (!state.boss || typeof state.boss !== 'object') {
      state.boss = {};
    }
    if (!state.user || typeof state.user !== 'object') {
      state.user = {};
    }
    if (!Number.isFinite(state.nextTickAt)) state.nextTickAt = 0;
    if (!Number.isFinite(state.lastPruneAt)) state.lastPruneAt = 0;
    if (!Number.isFinite(state.lastUserCleanseAt)) state.lastUserCleanseAt = 0;
    if (typeof state.hasActive !== 'boolean') state.hasActive = false;
    return state;
  },

  clearCombatStatusState(channelKey = null) {
    if (!this._combatStatusByChannel) return;
    if (channelKey) {
      this._combatStatusByChannel.delete(channelKey);
      return;
    }
    this._combatStatusByChannel.clear();
  },

  _getStatusEffectConfig(effectName) {
    return DEFAULT_STATUS_EFFECTS?.[effectName] || null;
  },

  _isShadowMagicBeast(shadow) {
    if (!shadow) return false;
    const roleKey = shadow.role || shadow.roleName || shadow.ro || '';
    const roles = this.shadowArmy?.shadowRoles || this.shadowArmy?.constructor?.SHADOW_ROLES;
    if (roles && roles[roleKey]) return !!roles[roleKey].isMagicBeast;
    // Fallback: known magic beast role keys
    const magicBeastRoles = new Set([
      'ant', 'bear', 'wolf', 'spider', 'centipede', 'golem', 'serpent',
      'naga', 'wyvern', 'dragon', 'titan', 'giant', 'elf', 'demon',
      'ghoul', 'orc', 'ogre', 'yeti',
    ]);
    return magicBeastRoles.has(roleKey);
  },

  _getShadowFamily(shadow) {
    if (!shadow) return null;
    if (shadow.family) return shadow.family;
    const roleKey = shadow.role || shadow.roleName || shadow.ro || '';
    const roles = this.shadowArmy?.shadowRoles || this.shadowArmy?.constructor?.SHADOW_ROLES;
    if (roles && roles[roleKey]) return roles[roleKey].family || null;
    const familyByRole = {
      ant: 'insect', spider: 'insect', centipede: 'insect',
      bear: 'beast', wolf: 'beast',
      naga: 'reptile', serpent: 'reptile',
      yeti: 'ice',
      dragon: 'dragon', wyvern: 'dragon',
      giant: 'giant', titan: 'giant',
      demon: 'demon',
      ogre: 'humanoid-beast', orc: 'humanoid-beast',
      ghoul: 'undead',
      golem: 'construct',
      elf: 'ancient',
    };
    return familyByRole[roleKey] || null;
  },

  _getDetoxificationStatusBonuses() {
    const bonuses = this.getSkillTreeBonuses?.() || null;
    return {
      debuffDurationReduction: this.clampNumber(
        Number(bonuses?.debuffDurationReduction || 0),
        0,
        0.8
      ),
      debuffResistChance: this.clampNumber(
        Number(bonuses?.debuffResistChance || 0),
        0,
        0.65
      ),
      debuffCleanseChance: this.clampNumber(
        Number(bonuses?.debuffCleanseChance || 0),
        0,
        0.75
      ),
    };
  },

  _getStatusEffectEntries(bucket, now = Date.now()) {
    if (!bucket || typeof bucket !== 'object') return [];
    return Object.entries(bucket)
      .map(([effectName, effect]) => ({ effectName, effect }))
      .filter(({ effect }) => effect && (effect.expiresAt === Infinity || (Number.isFinite(effect.expiresAt) && effect.expiresAt > now)))
      .sort((a, b) => {
        const stackDelta = Number(b.effect?.stacks || 0) - Number(a.effect?.stacks || 0);
        if (stackDelta !== 0) return stackDelta;
        const aExp = a.effect?.expiresAt;
        const bExp = b.effect?.expiresAt;
        if (aExp === Infinity && bExp === Infinity) return 0;
        if (aExp === Infinity) return 1;
        if (bExp === Infinity) return -1;
        return Number(aExp || 0) - Number(bExp || 0);
      });
  },

  _purgeCombatStatusEffect(channelKey, targetType, targetId, effectName = null, now = Date.now()) {
    const bucket = this._getStatusBucket(channelKey, targetType, targetId, false);
    if (!bucket) return null;

    let keyToDelete = effectName;
    if (!keyToDelete) {
      keyToDelete = this._getStatusEffectEntries(bucket, now)[0]?.effectName || null;
    }
    if (!keyToDelete || !bucket[keyToDelete]) return null;

    const removed = bucket[keyToDelete];
    delete bucket[keyToDelete];

    if (targetType === 'mob' && Object.keys(bucket).length === 0) {
      const state = this._combatStatusByChannel?.get?.(channelKey);
      state?.mobs?.delete?.(String(targetId));
    }

    const state = this._combatStatusByChannel?.get?.(channelKey);
    this._markCombatStatusHasActive(state);
    return { effectName: keyToDelete, effect: removed };
  },

  _attemptUserDetoxificationCleanse(channelKey, now = Date.now()) {
    const state = this._combatStatusByChannel?.get?.(channelKey);
    if (!state?.user || typeof state.user !== 'object') return null;
    if (now - (state.lastUserCleanseAt || 0) < 2500) return null;

    const bonuses = this._getDetoxificationStatusBonuses();
    const cleanseChance = Number(bonuses.debuffCleanseChance || 0);
    if (cleanseChance <= 0) return null;

    const activeEntries = this._getStatusEffectEntries(state.user, now);
    if (activeEntries.length === 0) return null;
    if (Math.random() >= cleanseChance) return null;

    state.lastUserCleanseAt = now;
    return this._purgeCombatStatusEffect(channelKey, 'user', 'user', activeEntries[0].effectName, now);
  },

  _resolveEnemyStatusEffectProfile(attacker, attackerType = 'mob') {
    if (!attacker || typeof attacker !== 'object') return null;

    const role = this.ensureMonsterRole(attacker);
    const rankIndex = Math.max(0, this.getRankIndexValue(attacker.rank || 'E'));
    const beastFamily = attacker.beastFamily || null;

    const familyMap = C.FAMILY_STATUS_EFFECT_MAP || {};
    const familyEffect = beastFamily ? familyMap[beastFamily] : null;

    let effectName;
    let baseChance;

    if (familyEffect) {
      // 70% primary, 30% secondary for variety
      effectName = Math.random() < 0.7 ? familyEffect.primary : familyEffect.secondary;
      baseChance = familyEffect.chance;
    } else {
      // Fallback: role-based mapping (humanoid shadows or unknown families)
      const baseByRole = {
        tank: { effectName: 'armorBreak', chance: 0.08 },
        support: { effectName: 'slow', chance: 0.075 },
        caster: { effectName: 'poison', chance: 0.09 },
        striker: { effectName: 'armorBreak', chance: 0.1 },
        ranger: { effectName: 'slow', chance: 0.11 },
        balanced: { effectName: 'poison', chance: 0.065 },
      };
      const selected = baseByRole[role] || baseByRole.balanced;
      effectName = selected.effectName;
      baseChance = selected.chance;
    }

    let chance = baseChance + Math.min(0.08, rankIndex * 0.004);
    if (attackerType === 'boss') {
      chance += 0.12;
    }

    const stackDelta = attackerType === 'boss' && rankIndex >= 6 ? 2 : 1;
    return {
      effectName,
      chance: this.clampNumber(chance, 0.02, 0.55),
      stackDelta,
    };
  },

  _resolveEnemyStatusProcAttempts(attacksInSpan, attackerType = 'mob') {
    const safeAttacks = Math.max(0, Math.floor(Number(attacksInSpan) || 0));
    if (safeAttacks <= 0) return 0;
    if (attackerType === 'boss') {
      return Math.min(3, safeAttacks);
    }
    return Math.min(4, Math.max(1, Math.ceil(safeAttacks / 12)));
  },

  applyEnemyCombatStatusEffects({
    channelKey,
    attacker,
    attackerType = 'mob',
    attacksInSpan = 0,
    targetType = 'user',
    targetId = 'user',
    now = Date.now(),
  }) {
    if (!this._isCombatStatusEffectsEnabled()) return null;
    if (!channelKey || targetType !== 'user') return null;

    const effectProfile = this._resolveEnemyStatusEffectProfile(attacker, attackerType);
    if (!effectProfile) return null;

    const attempts = this._resolveEnemyStatusProcAttempts(attacksInSpan, attackerType);
    if (attempts <= 0) return null;

    const procChance = 1 - Math.pow(1 - effectProfile.chance, attempts);
    if (Math.random() >= procChance) return null;

    const sourcePower = this._computeSourcePower(attacker?.rank, attacker);
    return this._applyCombatStatusToEntity({
      channelKey,
      targetType,
      targetId,
      effectName: effectProfile.effectName,
      stackDelta: effectProfile.stackDelta,
      now,
      sourcePower,
    });
  },

  _getCombatStatusTickMs() {
    const configured = Number(this.settings?.combatStatusTickMs);
    const base = Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_STATUS_LIMITS.tickIntervalMs || 1000;
    return this.clampNumber(Math.floor(base), 400, 2000);
  },

  _getCombatStatusMaxTrackedMobs() {
    const configured = Number(this.settings?.combatStatusMaxTrackedMobs);
    const base = Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_STATUS_LIMITS.maxTrackedMobsPerDungeon || 600;
    return this.clampNumber(Math.floor(base), 100, 1200);
  },

  _pruneStatusBucket(bucket, now) {
    if (!bucket || typeof bucket !== 'object') return false;
    let changed = false;
    for (const effectName of Object.keys(bucket)) {
      const effect = bucket[effectName];
      if (!effect || (effect.expiresAt !== Infinity && (!Number.isFinite(effect.expiresAt) || effect.expiresAt <= now))) { // Infinity = permanent (enrage)
        delete bucket[effectName];
        changed = true;
      }
    }
    return changed;
  },

  _markCombatStatusHasActive(state) {
    if (!state) return;
    const bossActive = state.boss && Object.keys(state.boss).length > 0;
    const userActive = state.user && Object.keys(state.user).length > 0;
    state.hasActive = bossActive || userActive || (state.mobs instanceof Map && state.mobs.size > 0);
  },

  _pruneCombatStatusState(channelKey, dungeon = null, now = Date.now()) {
    const state = this._combatStatusByChannel?.get?.(channelKey);
    if (!state) return;

    this._pruneStatusBucket(state.boss, now);
    this._pruneStatusBucket(state.user, now);

    if (state.mobs instanceof Map && state.mobs.size > 0) {
      let aliveMobIds = null;
      if (dungeon?.mobs?.activeMobs?.length) {
        aliveMobIds = new Set();
        for (const mob of dungeon.mobs.activeMobs) {
          if (!mob || mob.hp <= 0) continue;
          const mobId = this.getEnemyKey(mob, 'mob');
          if (mobId) aliveMobIds.add(String(mobId));
        }
      }

      for (const [mobId, bucket] of state.mobs.entries()) {
        const key = String(mobId);
        if (aliveMobIds && !aliveMobIds.has(key)) {
          state.mobs.delete(key);
          continue;
        }
        this._pruneStatusBucket(bucket, now);
        if (!bucket || Object.keys(bucket).length === 0) {
          state.mobs.delete(key);
        }
      }
    }

    state.lastPruneAt = now;
    this._markCombatStatusHasActive(state);
    if (!state.hasActive) {
      this._combatStatusByChannel.delete(channelKey);
    }
  },

  _getStatusBucket(channelKey, targetType, targetId, create = false) {
    const state = this._ensureCombatStatusState(channelKey);
    if (!state) return null;

    if (targetType === 'boss') {
      return state.boss;
    }

    if (targetType === 'user') {
      return state.user;
    }

    if (targetType !== 'mob' || targetId == null) {
      return null;
    }

    const mobKey = String(targetId);
    let bucket = state.mobs.get(mobKey);
    if (bucket || !create) return bucket || null;

    if (state.mobs.size >= this._getCombatStatusMaxTrackedMobs()) {
      return null;
    }

    bucket = {};
    state.mobs.set(mobKey, bucket);
    return bucket;
  },

  // Compute a compact source power snapshot for DOT scaling
  // Higher sourceRankIndex + higher stats = more DOT damage
  _computeSourcePower(sourceRank, sourceStats) {
    const rankIndex = Math.max(0, this.getRankIndexValue?.(sourceRank || 'E') || 0);
    const str = Math.max(0, Number(sourceStats?.strength) || 0);
    const int = Math.max(0, Number(sourceStats?.intelligence) || 0);
    // Power formula: rank weight (dominant) + stat component (secondary)
    // Rank multiplier provides the base scaling (E=1..SM=61)
    const rankMult = (C.RANK_MULTIPLIERS || {})[sourceRank] || Math.max(1, rankIndex + 1);
    return {
      rankIndex,
      rankMult,
      statPower: str + int * 0.5, // STR-heavy for physical DOTs, INT contributes for magical
    };
  },

  // Calculate DOT scaling factor based on source power vs target rank
  // Returns a multiplier applied to base % damage (0.5 = half damage, 2.0 = double)
  _getDotSourceScaling(effect, targetRank) {
    if (!effect?._sourcePower) return 1; // No source tracked = flat damage (legacy/enrage)
    const source = effect._sourcePower;
    const targetRankIndex = Math.max(0, this.getRankIndexValue?.(targetRank || 'E') || 0);
    const targetRankMult = (C.RANK_MULTIPLIERS || {})[targetRank] || Math.max(1, targetRankIndex + 1);

    // Rank ratio: source rank vs target rank (clamped to prevent extremes)
    const rankRatio = this.clampNumber(source.rankMult / Math.max(1, targetRankMult), 0.3, 3.0);

    // Stat contribution: source stats provide a small bonus scaling
    // Normalized so ~500 total statPower = 1.0× bonus, scaling logarithmically
    const statBonus = source.statPower > 0
      ? this.clampNumber(Math.log2(1 + source.statPower / 500), 0.5, 2.0)
      : 0.5;

    // Combined: rank ratio is dominant (70%), stat bonus is secondary (30%)
    return this.clampNumber(rankRatio * 0.7 + statBonus * 0.3, 0.25, 3.0);
  },

  _applyCombatStatusToEntity({ channelKey, targetType, targetId, effectName, stackDelta = 1, now = Date.now(), sourcePower = null }) {
    if (!this._isCombatStatusEffectsEnabled()) return null;
    const effectConfig = this._getStatusEffectConfig(effectName);
    if (!effectConfig) return null;

    if (targetType === 'user') {
      // Detoxification only resists toxins/magical debuffs — bleed is physical (lore-accurate)
      const isPhysical = effectName === 'bleed';
      if (!isPhysical) {
        const detox = this._getDetoxificationStatusBonuses();
        const resistChance = Number(detox.debuffResistChance || 0);
        if (resistChance > 0 && Math.random() < resistChance) {
          return null;
        }
      }
    }

    const bucket = this._getStatusBucket(channelKey, targetType, targetId, true);
    if (!bucket) return null;

    const existing = bucket[effectName];
    const maxStacks = Math.max(1, Math.floor(effectConfig.maxStacks || 1));
    const addedStacks = Math.max(1, Math.floor(Number(stackDelta) || 1));
    const currentStacks = Math.max(0, Math.floor(existing?.stacks || 0));
    const nextStacks = this.clampNumber(currentStacks + addedStacks, 1, maxStacks);

    const isPhysicalEffect = effectName === 'bleed';
    const durationReduction =
      targetType === 'user' && !isPhysicalEffect
        ? Number(this._getDetoxificationStatusBonuses().debuffDurationReduction || 0)
        : 0;
    const isPermanent = effectConfig.durationMs === Infinity;
    const durationMs = isPermanent
      ? Infinity
      : Math.max(500, Math.floor(Math.max(500, Math.floor(effectConfig.durationMs || 3000)) * (1 - durationReduction)));
    const nextState = {
      stacks: nextStacks,
      appliedAt: now,
      expiresAt: isPermanent ? Infinity : now + durationMs,
      nextTickAt:
        (effectName === 'poison' || effectName === 'bleed' || effectName === 'burn' || effectName === 'necrotic')
          ? now + Math.max(400, Math.floor(effectConfig.tickMs || 1000))
          : 0,
    };
    // Store source power for rank/stat-scaled DOT damage
    // Use new source if provided, otherwise preserve existing (stacking shouldn't downgrade source)
    if (sourcePower) {
      const existingPower = existing?._sourcePower;
      // Keep the stronger source (higher rank mult wins)
      nextState._sourcePower = existingPower && existingPower.rankMult > sourcePower.rankMult
        ? existingPower
        : sourcePower;
    } else if (existing?._sourcePower) {
      nextState._sourcePower = existing._sourcePower;
    }
    bucket[effectName] = nextState;

    const state = this._ensureCombatStatusState(channelKey);
    this._markCombatStatusHasActive(state);
    return nextState;
  },

  _readActiveStatusEffect(channelKey, targetType, targetId, effectName, now = Date.now()) {
    const bucket = this._getStatusBucket(channelKey, targetType, targetId, false);
    if (!bucket) return null;
    const effect = bucket[effectName];
    if (!effect) return null;
    // Permanent effects (enrage) have Infinity expiresAt — never expire naturally
    if (effect.expiresAt !== Infinity && (!Number.isFinite(effect.expiresAt) || effect.expiresAt <= now)) {
      delete bucket[effectName];
      if (targetType === 'mob' && Object.keys(bucket).length === 0) {
        const state = this._combatStatusByChannel?.get?.(channelKey);
        state?.mobs?.delete?.(String(targetId));
      }
      return null;
    }
    return effect;
  },

  getEntityIncomingDamageMultiplier(channelKey, targetType, targetId, now = Date.now()) {
    if (!this._isCombatStatusEffectsEnabled()) return 1;
    const effect = this._readActiveStatusEffect(channelKey, targetType, targetId, 'armorBreak', now);
    if (!effect) return 1;
    const config = this._getStatusEffectConfig('armorBreak');
    const amp = this.clampNumber(
      (effect.stacks || 0) * (config?.damageAmpPerStack || 0),
      0,
      config?.maxDamageAmp || 0.2
    );
    return this.clampNumber(1 + amp, 1, 1.35);
  },

  applyStatusAdjustedIncomingDamage(channelKey, targetType, targetId, damage, now = Date.now()) {
    const baseDamage = Math.max(0, Math.floor(Number(damage) || 0));
    if (baseDamage <= 0) return 0;
    const multiplier = this.getEntityIncomingDamageMultiplier(channelKey, targetType, targetId, now);
    let adjustedDamage = Math.max(1, Math.floor(baseDamage * multiplier));

    if (targetType === 'user') {
      const bonuses = this.getSkillTreeBonuses?.() || {};
      const threshold = this.clampNumber(Number(bonuses.tenacityThreshold || 0), 0, 1);
      const damageReduction = this.clampNumber(Number(bonuses.tenacityDamageReduction || 0), 0, 0.95);
      const currentHp = Number(this.settings?.userHP) || 0;
      const maxHp = Number(this.settings?.userMaxHP) || 0;

      if (threshold > 0 && damageReduction > 0 && maxHp > 0 && currentHp / maxHp <= threshold) {
        adjustedDamage = Math.max(1, Math.floor(adjustedDamage * (1 - damageReduction)));
      }
    }

    return adjustedDamage;
  },

  getEntityAttackSlowMultiplier(channelKey, targetType, targetId, now = Date.now()) {
    if (!this._isCombatStatusEffectsEnabled()) return 1;

    let totalSlow = 0;

    // Standard slow effect
    const slowEffect = this._readActiveStatusEffect(channelKey, targetType, targetId, 'slow', now);
    if (slowEffect) {
      const slowConfig = this._getStatusEffectConfig('slow');
      totalSlow += this.clampNumber(
        (slowEffect.stacks || 0) * (slowConfig?.slowPerStack || 0),
        0,
        slowConfig?.maxSlow || 0.3
      );
    }

    // Frostbite slow (stronger, stacks separately)
    const frostEffect = this._readActiveStatusEffect(channelKey, targetType, targetId, 'frostbite', now);
    if (frostEffect) {
      const frostConfig = this._getStatusEffectConfig('frostbite');
      // At max stacks with rootAtMaxStacks: full freeze (100% slow = can't attack)
      if (frostConfig?.rootAtMaxStacks && (frostEffect.stacks || 0) >= (frostConfig?.maxStacks || 4)) {
        const rootExpiry = frostEffect._rootExpiresAt || 0;
        if (now < rootExpiry) {
          return 100; // Full freeze — effectively infinite cooldown
        }
      }
      totalSlow += this.clampNumber(
        (frostEffect.stacks || 0) * (frostConfig?.slowPerStack || 0),
        0,
        frostConfig?.maxSlow || 0.4
      );
    }

    if (totalSlow <= 0) return 1;
    return this.clampNumber(1 + totalSlow, 1, 2.5); // Cap at 150% extra cooldown
  },

  getEntityHealReductionMultiplier(channelKey, targetType, targetId, now = Date.now()) {
    if (!this._isCombatStatusEffectsEnabled()) return 1;
    const effect = this._readActiveStatusEffect(channelKey, targetType, targetId, 'necrotic', now);
    if (!effect) return 1;
    const config = this._getStatusEffectConfig('necrotic');
    const reduction = this.clampNumber(
      (effect.stacks || 0) * (config?.healReductionPerStack || 0),
      0,
      config?.maxHealReduction || 0.45
    );
    return this.clampNumber(1 - reduction, 0.1, 1); // Minimum 10% healing
  },

  getEntityEnrageDamageMultiplier(channelKey, targetType, targetId, now = Date.now()) {
    if (!this._isCombatStatusEffectsEnabled()) return 1;
    const effect = this._readActiveStatusEffect(channelKey, targetType, targetId, 'enrage', now);
    if (!effect) return 1;
    const config = this._getStatusEffectConfig('enrage');
    const boost = this.clampNumber(
      (effect.stacks || 0) * (config?.damageBoostPerStack || 0),
      0,
      config?.maxDamageBoost || 0.4
    );
    return this.clampNumber(1 + boost, 1, 1.5);
  },

  getEntityEnrageSpeedMultiplier(channelKey, targetType, targetId, now = Date.now()) {
    if (!this._isCombatStatusEffectsEnabled()) return 1;
    const effect = this._readActiveStatusEffect(channelKey, targetType, targetId, 'enrage', now);
    if (!effect) return 1;
    const config = this._getStatusEffectConfig('enrage');
    const boost = this.clampNumber(
      (effect.stacks || 0) * (config?.speedBoostPerStack || 0),
      0,
      config?.maxSpeedBoost || 0.3
    );
    return this.clampNumber(1 - boost, 0.5, 1); // Lower multiplier = faster attacks
  },

  _resolveShadowStatusEffectProfile(profile, shadow = null) {
    const archetype = profile?.archetype || 'balanced';
    const personalityKey = profile?.personalityKey || 'balanced';

    const isMagicBeast = shadow && this._isShadowMagicBeast(shadow);
    if (isMagicBeast) {
      const family = this._getShadowFamily(shadow);
      const familyMap = C.FAMILY_STATUS_EFFECT_MAP || {};
      const familyEffect = family ? familyMap[family] : null;

      if (familyEffect) {
        const effectName = Math.random() < 0.7 ? familyEffect.primary : familyEffect.secondary; // 70% primary, 30% secondary for variety
        let chance = familyEffect.chance * 0.3; // Shadow base proc rate (lower than enemy)

        // Personality modifier
        switch (personalityKey) {
          case 'aggressive': chance += 0.008; break;
          case 'strategic': case 'tactical': chance += 0.006; break;
          case 'supportive': case 'tank': chance -= 0.003; break;
          default: break;
        }

        return {
          effectName,
          target: 'both',
          chance: this.clampNumber(chance, 0.005, 0.08),
        };
      }
    }

    const baseByArchetype = {
      tank: { effectName: 'armorBreak', target: 'boss', chance: 0.012 },
      support: { effectName: 'slow', target: 'mob', chance: 0.018 },
      caster: { effectName: 'poison', target: 'both', chance: 0.024 },
      striker: { effectName: 'armorBreak', target: 'both', chance: 0.028 },
      ranger: { effectName: 'slow', target: 'both', chance: 0.03 },
      balanced: { effectName: 'poison', target: 'mob', chance: 0.014 },
    };

    const selected = baseByArchetype[archetype] || baseByArchetype.balanced;
    let chance = selected.chance;
    switch (personalityKey) {
      case 'aggressive':
        chance += 0.008;
        break;
      case 'strategic':
      case 'tactical':
        chance += 0.006;
        break;
      case 'supportive':
      case 'tank':
        chance -= 0.003;
        break;
      default:
        break;
    }

    return {
      effectName: selected.effectName,
      target: selected.target,
      chance: this.clampNumber(chance, 0.005, 0.08),
    };
  },

  _pickAliveMobTargetForStatus(aliveMobs) {
    if (!Array.isArray(aliveMobs) || aliveMobs.length === 0) return null;
    const tries = Math.min(4, aliveMobs.length);
    for (let i = 0; i < tries; i++) {
      const mob = aliveMobs[Math.floor(Math.random() * aliveMobs.length)];
      if (mob && mob.hp > 0) return mob;
    }
    return null;
  },

  applyShadowCombatStatusEffects({
    channelKey,
    shadow,
    combatData,
    attacksInSpan = 0,
    bossAttacks = 0,
    mobAttacks = 0,
    aliveMobs = [],
    bossAlive = false,
    now = Date.now(),
  }) {
    if (!this._isCombatStatusEffectsEnabled()) return;
    if (!channelKey || !shadow || attacksInSpan <= 0) return;

    const profile = this._resolveShadowRoleProfile(shadow, combatData);
    const effectProfile = this._resolveShadowStatusEffectProfile(profile, shadow);
    if (!effectProfile?.effectName) return;

    const hasBossTarget =
      bossAlive &&
      bossAttacks > 0 &&
      (effectProfile.target === 'boss' || effectProfile.target === 'both');
    const hasMobTarget =
      mobAttacks > 0 &&
      Array.isArray(aliveMobs) &&
      aliveMobs.length > 0 &&
      (effectProfile.target === 'mob' || effectProfile.target === 'both');
    if (!hasBossTarget && !hasMobTarget) return;

    const chance = this.clampNumber(
      1 - Math.pow(1 - effectProfile.chance, Math.max(1, Math.floor(attacksInSpan))),
      0,
      0.7
    );
    if (Math.random() >= chance) return;

    const stackDelta = attacksInSpan >= 8 ? 2 : 1;
    let targetType = null;
    let targetId = null;

    if (hasBossTarget && hasMobTarget) {
      const bossPreference = bossAttacks / Math.max(1, bossAttacks + mobAttacks);
      if (Math.random() < bossPreference) {
        targetType = 'boss';
        targetId = 'boss';
      } else {
        const mob = this._pickAliveMobTargetForStatus(aliveMobs);
        const mobId = mob ? this.getEnemyKey(mob, 'mob') : null;
        if (mobId) {
          targetType = 'mob';
          targetId = mobId;
        }
      }
    } else if (hasBossTarget) {
      targetType = 'boss';
      targetId = 'boss';
    } else if (hasMobTarget) {
      const mob = this._pickAliveMobTargetForStatus(aliveMobs);
      const mobId = mob ? this.getEnemyKey(mob, 'mob') : null;
      if (mobId) {
        targetType = 'mob';
        targetId = mobId;
      }
    }

    if (!targetType || targetId == null) return;
    const shadowStats = this.getShadowEffectiveStatsCached?.(shadow) || shadow;
    const sourcePower = this._computeSourcePower(shadow?.rank, shadowStats);
    this._applyCombatStatusToEntity({
      channelKey,
      targetType,
      targetId,
      effectName: effectProfile.effectName,
      stackDelta,
      now,
      sourcePower,
    });
  },

  isCombatStatusTickDue(channelKey, now = Date.now()) {
    if (!this._isCombatStatusEffectsEnabled() || !channelKey) return false;
    const state = this._combatStatusByChannel?.get?.(channelKey);
    if (!state || !state.hasActive) return false;
    return now >= (state.nextTickAt || 0);
  },

  _DOT_EFFECTS: ['poison', 'bleed', 'burn', 'necrotic'],

  _calculateDotTickDamage(effectName, effect, maxHp, targetRank = null) {
    const config = this._getStatusEffectConfig(effectName);
    if (!config) return 0;
    const basePct = this.clampNumber(
      (effect.stacks || 0) * (config.damagePctPerStack || 0),
      0,
      config.maxDamagePct || 0.02
    );
    // Apply source power scaling: stronger source = more DOT damage
    const sourceScale = this._getDotSourceScaling(effect, targetRank);
    const scaledPct = this.clampNumber(basePct * sourceScale, 0, config.maxDamagePct * 3);
    return Math.max(1, Math.floor(maxHp * scaledPct));
  },

  _advanceDotTick(effect, effectName, now = Date.now()) {
    const config = this._getStatusEffectConfig(effectName);
    effect.nextTickAt = now + Math.max(400, Math.floor(config?.tickMs || 1000));
  },

  _checkFrostbiteRoot(channelKey, targetType, targetId, now = Date.now()) {
    const effect = this._readActiveStatusEffect(channelKey, targetType, targetId, 'frostbite', now);
    if (!effect) return;
    const config = this._getStatusEffectConfig('frostbite');
    if (!config?.rootAtMaxStacks) return;
    if ((effect.stacks || 0) >= (config.maxStacks || 4) && !effect._rootExpiresAt) {
      effect._rootExpiresAt = now + (config.rootDurationMs || 3000);
    }
  },

  async processCombatStatusEffects(channelKey, dungeon, now = Date.now()) {
    if (!this._isCombatStatusEffectsEnabled()) return;
    if (!channelKey || !dungeon) return;
    const state = this._combatStatusByChannel?.get?.(channelKey);
    if (!state || !state.hasActive) return;

    if (now - (state.lastPruneAt || 0) >= 2000) {
      this._pruneCombatStatusState(channelKey, dungeon, now);
    }
    if (!state.hasActive) return;

    const tickMs = this._getCombatStatusTickMs();
    if (now < (state.nextTickAt || 0)) return;

    if (dungeon?.userParticipating) {
      this._attemptUserDetoxificationCleanse(channelKey, now);
    }

    // User DOT ticks
    if (dungeon?.userParticipating && Number(this.settings?.userHP) > 0) {
      const userRank = this.soloLevelingStats?.settings?.rank || 'E';
      let userDefeated = false;
      for (const effectName of this._DOT_EFFECTS) {
        if (userDefeated) break;
        const effect = this._readActiveStatusEffect(channelKey, 'user', 'user', effectName, now);
        if (!effect) continue;
        if (Number.isFinite(effect.nextTickAt) && effect.nextTickAt > now) continue;

        const maxHp = Number(this.settings.userMaxHP) || Number(this.settings.userHP) || 1;
        const dotDamage = this.applyStatusAdjustedIncomingDamage(
          channelKey, 'user', 'user',
          this._calculateDotTickDamage(effectName, effect, maxHp, userRank),
          now
        );
        this.syncHPFromStats();
        this.settings.userHP = Math.max(0, this.settings.userHP - dotDamage);
        this.pushHPToStats(true);
        this.startRegeneration();
        this._advanceDotTick(effect, effectName, now);

        if (this.settings.userHP <= 0) {
          await this.handleUserDefeat(channelKey);
          userDefeated = true;
        }
      }
      // Check frostbite root state on user
      this._checkFrostbiteRoot(channelKey, 'user', 'user', now);
    }

    // Boss DOT ticks
    if (dungeon?.boss?.hp > 0) {
      for (const effectName of this._DOT_EFFECTS) {
        const effect = this._readActiveStatusEffect(channelKey, 'boss', 'boss', effectName, now);
        if (!effect) continue;
        if (Number.isFinite(effect.nextTickAt) && effect.nextTickAt > now) continue;

        const maxHp = Number(dungeon.boss.maxHp) || Number(dungeon.boss.hp) || 1;
        const dotDamage = this._calculateDotTickDamage(effectName, effect, maxHp, dungeon.boss.rank);
        await this.applyDamageToBoss(channelKey, dotDamage, 'status');
        this._advanceDotTick(effect, effectName, now);
      }
      // Check frostbite root state on boss
      this._checkFrostbiteRoot(channelKey, 'boss', 'boss', now);
    }

    // Mob DOT ticks
    if (state.mobs instanceof Map && state.mobs.size > 0 && Array.isArray(dungeon?.mobs?.activeMobs)) {
      const liveMobById = new Map();
      for (const mob of dungeon.mobs.activeMobs) {
        if (!mob || mob.hp <= 0) continue;
        const mobId = this.getEnemyKey(mob, 'mob');
        if (mobId) liveMobById.set(String(mobId), mob);
      }

      const deadMobsFromStatus = [];
      for (const [mobId, bucket] of state.mobs.entries()) {
        const mob = liveMobById.get(String(mobId));
        if (!mob || mob.hp <= 0) {
          state.mobs.delete(String(mobId));
          continue;
        }

        // Tick ALL active DOT effects on this mob
        for (const effectName of this._DOT_EFFECTS) {
          const effect = this._readActiveStatusEffect(channelKey, 'mob', mobId, effectName, now);
          if (!effect) continue;
          if (Number.isFinite(effect.nextTickAt) && effect.nextTickAt > now) continue;

          const maxHp = Number(mob.maxHp) || Number(mob.hp) || 1;
          const dotDamage = this._calculateDotTickDamage(effectName, effect, maxHp, mob.rank);
          const beforeHp = mob.hp;
          this.applyDamageToEntityHp(mob, dotDamage);
          this._advanceDotTick(effect, effectName, now);

          if (beforeHp > 0 && mob.hp <= 0) {
            deadMobsFromStatus.push(mob);
            state.mobs.delete(String(mobId));
            break; // Mob is dead, skip remaining DOTs
          }
        }
      }

      if (deadMobsFromStatus.length > 0) {
        const assignedShadows =
          this.shadowAllocations.get(channelKey) || dungeon.shadowAllocation?.shadows || [];
        for (const mob of deadMobsFromStatus) {
          const fallbackAttributed = this._applyFallbackMobKillContribution(
            dungeon,
            assignedShadows,
            null,
            1
          );
          if (!fallbackAttributed) {
            this._logMobContributionMiss(channelKey, this.getEnemyKey(mob, 'mob'), {
              phase: 'status-dot',
            });
          }
          this._onMobKilled(channelKey, dungeon, mob.rank);
          this._addToCorpsePile(channelKey, mob, false);
        }
        this._cleanupDungeonActiveMobs(dungeon);
        this._pruneShadowMobContributionLedger(dungeon);
        this.queueHPBarUpdate(channelKey);
      }
    }

    this._pruneCombatStatusState(channelKey, dungeon, now);
    const refreshed = this._combatStatusByChannel?.get?.(channelKey);
    if (refreshed && refreshed.hasActive) {
      refreshed.nextTickAt = now + tickMs;
    }
  },
};
