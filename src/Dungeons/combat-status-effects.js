const C = require('./constants');

const DEFAULT_STATUS_EFFECTS = C.COMBAT_STATUS_EFFECTS || {
  poison: {
    maxStacks: 4,
    durationMs: 9000,
    tickMs: 1000,
    damagePctPerStack: 0.0025,
    maxDamagePct: 0.018,
  },
  armorBreak: {
    maxStacks: 3,
    durationMs: 7000,
    damageAmpPerStack: 0.06,
    maxDamageAmp: 0.2,
  },
  slow: {
    maxStacks: 3,
    durationMs: 7000,
    slowPerStack: 0.08,
    maxSlow: 0.3,
  },
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
        mobs: new Map(),
        nextTickAt: 0,
        lastPruneAt: 0,
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
    if (!Number.isFinite(state.nextTickAt)) state.nextTickAt = 0;
    if (!Number.isFinite(state.lastPruneAt)) state.lastPruneAt = 0;
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
      if (!effect || !Number.isFinite(effect.expiresAt) || effect.expiresAt <= now) {
        delete bucket[effectName];
        changed = true;
      }
    }
    return changed;
  },

  _markCombatStatusHasActive(state) {
    if (!state) return;
    const bossActive = state.boss && Object.keys(state.boss).length > 0;
    state.hasActive = bossActive || (state.mobs instanceof Map && state.mobs.size > 0);
  },

  _pruneCombatStatusState(channelKey, dungeon = null, now = Date.now()) {
    const state = this._combatStatusByChannel?.get?.(channelKey);
    if (!state) return;

    this._pruneStatusBucket(state.boss, now);

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

  _applyCombatStatusToEntity({ channelKey, targetType, targetId, effectName, stackDelta = 1, now = Date.now() }) {
    if (!this._isCombatStatusEffectsEnabled()) return null;
    const effectConfig = this._getStatusEffectConfig(effectName);
    if (!effectConfig) return null;

    const bucket = this._getStatusBucket(channelKey, targetType, targetId, true);
    if (!bucket) return null;

    const existing = bucket[effectName];
    const maxStacks = Math.max(1, Math.floor(effectConfig.maxStacks || 1));
    const addedStacks = Math.max(1, Math.floor(Number(stackDelta) || 1));
    const currentStacks = Math.max(0, Math.floor(existing?.stacks || 0));
    const nextStacks = this.clampNumber(currentStacks + addedStacks, 1, maxStacks);

    const nextState = {
      stacks: nextStacks,
      appliedAt: now,
      expiresAt: now + Math.max(500, Math.floor(effectConfig.durationMs || 3000)),
      nextTickAt:
        effectName === 'poison'
          ? now + Math.max(400, Math.floor(effectConfig.tickMs || 1000))
          : 0,
    };
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
    if (!Number.isFinite(effect.expiresAt) || effect.expiresAt <= now) {
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
    return Math.max(1, Math.floor(baseDamage * multiplier));
  },

  getEntityAttackSlowMultiplier(channelKey, targetType, targetId, now = Date.now()) {
    if (!this._isCombatStatusEffectsEnabled()) return 1;
    const effect = this._readActiveStatusEffect(channelKey, targetType, targetId, 'slow', now);
    if (!effect) return 1;
    const config = this._getStatusEffectConfig('slow');
    const slow = this.clampNumber(
      (effect.stacks || 0) * (config?.slowPerStack || 0),
      0,
      config?.maxSlow || 0.3
    );
    return this.clampNumber(1 + slow, 1, 1.6);
  },

  _resolveShadowStatusEffectProfile(profile) {
    const archetype = profile?.archetype || 'balanced';
    const personalityKey = profile?.personalityKey || 'balanced';

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
    const effectProfile = this._resolveShadowStatusEffectProfile(profile);
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
    this._applyCombatStatusToEntity({
      channelKey,
      targetType,
      targetId,
      effectName: effectProfile.effectName,
      stackDelta,
      now,
    });
  },

  isCombatStatusTickDue(channelKey, now = Date.now()) {
    if (!this._isCombatStatusEffectsEnabled() || !channelKey) return false;
    const state = this._combatStatusByChannel?.get?.(channelKey);
    if (!state || !state.hasActive) return false;
    return now >= (state.nextTickAt || 0);
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

    const poisonConfig = this._getStatusEffectConfig('poison');
    const bossPoison = this._readActiveStatusEffect(channelKey, 'boss', 'boss', 'poison', now);
    if (bossPoison && dungeon?.boss?.hp > 0) {
      if (!Number.isFinite(bossPoison.nextTickAt) || bossPoison.nextTickAt <= now) {
        const maxHp = Number(dungeon.boss.maxHp) || Number(dungeon.boss.hp) || 1;
        const poisonPct = this.clampNumber(
          (bossPoison.stacks || 0) * (poisonConfig?.damagePctPerStack || 0),
          0,
          poisonConfig?.maxDamagePct || 0.018
        );
        const poisonDamage = Math.max(1, Math.floor(maxHp * poisonPct));
        await this.applyDamageToBoss(channelKey, poisonDamage, 'status');
        bossPoison.nextTickAt = now + Math.max(400, Math.floor(poisonConfig?.tickMs || 1000));
      }
    }

    if (state.mobs instanceof Map && state.mobs.size > 0 && Array.isArray(dungeon?.mobs?.activeMobs)) {
      const liveMobById = new Map();
      for (const mob of dungeon.mobs.activeMobs) {
        if (!mob || mob.hp <= 0) continue;
        const mobId = this.getEnemyKey(mob, 'mob');
        if (mobId) liveMobById.set(String(mobId), mob);
      }

      const deadMobsFromStatus = [];
      for (const [mobId, bucket] of state.mobs.entries()) {
        const poison = this._readActiveStatusEffect(channelKey, 'mob', mobId, 'poison', now);
        if (!poison) continue;
        if (Number.isFinite(poison.nextTickAt) && poison.nextTickAt > now) continue;

        const mob = liveMobById.get(String(mobId));
        if (!mob || mob.hp <= 0) {
          state.mobs.delete(String(mobId));
          continue;
        }

        const maxHp = Number(mob.maxHp) || Number(mob.hp) || 1;
        const poisonPct = this.clampNumber(
          (poison.stacks || 0) * (poisonConfig?.damagePctPerStack || 0),
          0,
          poisonConfig?.maxDamagePct || 0.018
        );
        const poisonDamage = Math.max(1, Math.floor(maxHp * poisonPct));
        const beforeHp = mob.hp;
        this.applyDamageToEntityHp(mob, poisonDamage);
        poison.nextTickAt = now + Math.max(400, Math.floor(poisonConfig?.tickMs || 1000));

        if (beforeHp > 0 && mob.hp <= 0) {
          deadMobsFromStatus.push(mob);
          state.mobs.delete(String(mobId));
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
              phase: 'status-poison',
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
