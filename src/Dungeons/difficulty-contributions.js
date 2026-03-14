module.exports = {
  _resolveDungeonXPBatchKey(channelKey, dungeonLike = null) {
    const explicit = typeof dungeonLike?._xpBatchKey === 'string' ? dungeonLike._xpBatchKey.trim() : '';
    if (explicit) return explicit;
    const startTime = Number(dungeonLike?.startTime);
    if (Number.isFinite(startTime) && startTime > 0) {
      return `${channelKey}:${Math.floor(startTime)}`;
    }
    return `${channelKey}:legacy`;
  },

  _queuePendingDungeonMobXP(channelKey, dungeon, xpAmount, killCount = 1) {
    const normalizedXP = Math.floor(Number(xpAmount) || 0);
    if (!dungeon || normalizedXP <= 0) return 0;

    const batchKey = this._resolveDungeonXPBatchKey(channelKey, dungeon);
    dungeon._xpBatchKey = batchKey;

    const currentXP = Number(dungeon.pendingUserMobXP);
    const safeCurrentXP = Number.isFinite(currentXP) && currentXP > 0 ? Math.floor(currentXP) : 0;
    const nextXP = safeCurrentXP + normalizedXP;
    dungeon.pendingUserMobXP = nextXP;

    const currentKills = Number(dungeon.pendingUserMobKills);
    const safeCurrentKills = Number.isFinite(currentKills) && currentKills > 0 ? Math.floor(currentKills) : 0;
    const normalizedKills = Math.max(1, Math.floor(Number(killCount) || 1));
    const nextKills = safeCurrentKills + normalizedKills;
    dungeon.pendingUserMobKills = nextKills;

    this._pendingDungeonMobXPByBatch?.set(batchKey, nextXP);
    this._pendingDungeonMobKillsByBatch?.set(batchKey, nextKills);
    return nextXP;
  },

  _consumePendingDungeonMobXP(batchKey, snapshot = null) {
    const snapXP = Number(snapshot?.pendingUserMobXP);
    const queuedXP = Number(this._pendingDungeonMobXPByBatch?.get(batchKey));
    const pendingXP = Math.max(
      Number.isFinite(snapXP) && snapXP > 0 ? Math.floor(snapXP) : 0,
      Number.isFinite(queuedXP) && queuedXP > 0 ? Math.floor(queuedXP) : 0
    );

    const snapKills = Number(snapshot?.pendingUserMobKills);
    const queuedKills = Number(this._pendingDungeonMobKillsByBatch?.get(batchKey));
    const pendingKills = Math.max(
      Number.isFinite(snapKills) && snapKills > 0 ? Math.floor(snapKills) : 0,
      Number.isFinite(queuedKills) && queuedKills > 0 ? Math.floor(queuedKills) : 0
    );

    this._pendingDungeonMobXPByBatch?.delete(batchKey);
    this._pendingDungeonMobKillsByBatch?.delete(batchKey);
    return { pendingXP, pendingKills };
  },

  _discardPendingDungeonMobXP(batchKey) {
    if (!batchKey) return;
    this._pendingDungeonMobXPByBatch?.delete(batchKey);
    this._pendingDungeonMobKillsByBatch?.delete(batchKey);
  },

  _onMobKilled(channelKey, dungeon, mobRank, killCount = 1) {
    if (!dungeon || typeof dungeon !== 'object') return;
    if (!Number.isFinite(killCount) || killCount <= 0) killCount = 1;
    if (!dungeon.mobs || typeof dungeon.mobs !== 'object') {
      dungeon.mobs = { killed: 0, remaining: 0, activeMobs: [], total: 0 };
    }
    if (!Number.isFinite(dungeon.mobs.killed)) dungeon.mobs.killed = 0;
    if (!Number.isFinite(dungeon.mobs.remaining)) dungeon.mobs.remaining = 0;

    dungeon.mobs.killed += killCount;
    dungeon.mobs.remaining = Math.max(0, dungeon.mobs.remaining - killCount);

    if (!this.settings.mobKillNotifications) this.settings.mobKillNotifications = {};
    if (!this.settings.mobKillNotifications[channelKey]) {
      this.settings.mobKillNotifications[channelKey] = { count: 0, lastNotification: Date.now() };
    }
    this.settings.mobKillNotifications[channelKey].count += killCount;

    // Batch mob XP per dungeon run and award once on dungeon completion.
    // This prevents XP-event fanout during high-kill combat bursts.
    const xpPerKill = this.calculateMobXP(mobRank, true);
    if (xpPerKill > 0) {
      const totalMobXP = xpPerKill * killCount;
      this._queuePendingDungeonMobXP(channelKey, dungeon, totalMobXP, killCount);
    }
  },

  _grantUserDungeonXP(amount, source = 'dungeon', context = {}) {
    const xpAmount = Math.floor(Number(amount) || 0);
    if (xpAmount <= 0) return false;
    if (!this.soloLevelingStats) return false;

    if (typeof this.soloLevelingStats.addXP === 'function') {
      this.soloLevelingStats.addXP(xpAmount, {
        source,
        shareShadowXP: false,
      });
      return true;
    }

    this.errorLog(true, 'DUNGEON_XP_API_MISSING: SoloLevelingStats.addXP unavailable; XP not granted', {
      source,
      xpAmount,
      ...context,
    });
    return false;
  },

  _getOrCreateShadowContributionEntry(dungeon, shadowId) {
    if (!dungeon || shadowId === null || shadowId === undefined) return null;
    const sid = String(shadowId).trim();
    if (!sid) return null;

    if (!dungeon.shadowContributions || typeof dungeon.shadowContributions !== 'object') {
      dungeon.shadowContributions = {};
    }

    if (!dungeon.shadowContributions[sid] || typeof dungeon.shadowContributions[sid] !== 'object') {
      dungeon.shadowContributions[sid] = { mobsKilled: 0, bossDamage: 0 };
    }

    const entry = dungeon.shadowContributions[sid];
    if (!Number.isFinite(entry.mobsKilled)) entry.mobsKilled = 0;
    if (!Number.isFinite(entry.bossDamage)) entry.bossDamage = 0;
    return entry;
  },

  _addShadowContribution(dungeon, shadowId, field, amount) {
    if (!(Number.isFinite(amount) && amount > 0)) return false;
    if (field !== 'mobsKilled' && field !== 'bossDamage') return false;

    const entry = this._getOrCreateShadowContributionEntry(dungeon, shadowId);
    if (!entry) return false;
    entry[field] += amount;
    return true;
  },

  _getMobContributionLedger(dungeon, createIfMissing = false) {
    if (!dungeon || typeof dungeon !== 'object') return null;

    if (
      dungeon._mobContributionByMobId &&
      typeof dungeon._mobContributionByMobId === 'object' &&
      !Array.isArray(dungeon._mobContributionByMobId)
    ) {
      return dungeon._mobContributionByMobId;
    }

    if (!createIfMissing) return null;
    dungeon._mobContributionByMobId = Object.create(null);
    return dungeon._mobContributionByMobId;
  },

  _recordShadowMobDamageContribution(dungeon, mobId, shadowId, damage) {
    if (!(Number.isFinite(damage) && damage > 0)) return false;
    if (!mobId || shadowId === null || shadowId === undefined) return false;
    const sid = String(shadowId).trim();
    if (!sid) return false;

    const ledger = this._getMobContributionLedger(dungeon, true);
    if (!ledger) return false;

    const mid = String(mobId);
    if (!ledger[mid] || typeof ledger[mid] !== 'object') {
      ledger[mid] = Object.create(null);
    }

    ledger[mid][sid] = (Number(ledger[mid][sid]) || 0) + damage;
    return true;
  },

  _applyMobKillContributionsFromLedger(dungeon, mobId, killCount = 1) {
    if (!mobId || !(Number.isFinite(killCount) && killCount > 0)) return false;

    const ledger = this._getMobContributionLedger(dungeon, false);
    if (!ledger) return false;

    const mid = String(mobId);
    const contributionEntry = ledger[mid];
    if (!contributionEntry || typeof contributionEntry !== 'object') return false;

    const contributors = Object.entries(contributionEntry)
      .map(([shadowId, dmg]) => [String(shadowId), Number(dmg)])
      .filter(([shadowId, dmg]) => shadowId && Number.isFinite(dmg) && dmg > 0);

    delete ledger[mid];
    if (contributors.length === 0) return false;

    const totalDamage = contributors.reduce((sum, [, dmg]) => sum + dmg, 0);
    if (!(totalDamage > 0)) return false;

    for (const [shadowId, damage] of contributors) {
      const killShare = (damage / totalDamage) * killCount;
      this._addShadowContribution(dungeon, shadowId, 'mobsKilled', killShare);
    }

    return true;
  },

  _pruneShadowMobContributionLedger(dungeon) {
    const ledger = this._getMobContributionLedger(dungeon, false);
    if (!ledger) return;

    const activeMobIds = new Set();
    const activeMobs = dungeon?.mobs?.activeMobs || [];
    for (const mob of activeMobs) {
      if (!mob || mob.hp <= 0) continue;
      const mobId = this.getEnemyKey(mob, 'mob');
      mobId && activeMobIds.add(String(mobId));
    }

    let remainingEntries = 0;
    for (const mobId of Object.keys(ledger)) {
      if (!activeMobIds.has(mobId)) {
        delete ledger[mobId];
      } else {
        remainingEntries++;
      }
    }

    if (remainingEntries === 0) {
      delete dungeon._mobContributionByMobId;
    }
  },

  _buildShadowContributionWeights(shadows = []) {
    const normalized = Array.isArray(shadows) ? shadows : [];
    const weights = [];
    let totalWeight = 0;

    for (const shadow of normalized) {
      const shadowId = this.getShadowIdValue(shadow);
      if (!shadowId) continue;

      const score = this.getShadowCombatScore(shadow);
      const weight = Number.isFinite(score) && score > 0 ? score : 1;
      weights.push({ shadowId: String(shadowId), weight });
      totalWeight += weight;
    }

    return { weights, totalWeight };
  },

  _distributeWeightedShadowContribution(dungeon, weights, totalWeight, field, totalAmount) {
    if (!(Number.isFinite(totalAmount) && totalAmount > 0)) return false;
    if (!Array.isArray(weights) || weights.length === 0) return false;

    const safeTotalWeight = Number.isFinite(totalWeight) && totalWeight > 0 ? totalWeight : weights.length;
    for (const entry of weights) {
      if (!entry || !entry.shadowId) continue;
      const weight = Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight : 1;
      const share = totalAmount * (weight / safeTotalWeight);
      this._addShadowContribution(dungeon, entry.shadowId, field, share);
    }
    return true;
  },

  _applyFallbackMobKillContribution(dungeon, assignedShadows = [], fallbackShadowId = null, killCount = 1) {
    const safeKillCount =
      Number.isFinite(killCount) && killCount > 0 ? Math.floor(killCount) : 1;

    if (
      fallbackShadowId &&
      this._addShadowContribution(dungeon, fallbackShadowId, 'mobsKilled', safeKillCount)
    ) {
      return true;
    }

    const { weights, totalWeight } = this._buildShadowContributionWeights(assignedShadows);
    return this._distributeWeightedShadowContribution(
      dungeon,
      weights,
      totalWeight,
      'mobsKilled',
      safeKillCount
    );
  },

  _logMobContributionMiss(channelKey, mobId, extra = null) {
    const logKey = String(channelKey || 'unknown');
    const now = Date.now();
    const cooldownMs = 15000;
    const state = this._mobContributionMissLogState.get(logKey) || { lastAt: 0, suppressed: 0 };

    if (now - state.lastAt < cooldownMs) {
      state.suppressed += 1;
      this._mobContributionMissLogState.set(logKey, state);
      return;
    }

    this._mobContributionMissLogState.set(logKey, { lastAt: now, suppressed: 0 });
    this.errorLog(
      true,
      'MOB_CONTRIBUTION_MISS: Missing shadow damage attribution for mob kill',
      {
        channelKey,
        mobId,
        suppressedSinceLast: state.suppressed || 0,
        ...(extra && typeof extra === 'object' ? extra : {}),
      }
    );
  },

  _getDungeonShadowCombatContext(channelKey, dungeon) {
    const assignedShadows = this.shadowAllocations.get(channelKey) || dungeon.shadowAllocation?.shadows || [];
    const shadowHP = dungeon.shadowHP || (dungeon.shadowHP = new Map());
    const deadShadows = this.deadShadows.get(channelKey) || new Set();
    this.maybePruneDungeonShadowState({ dungeon, channelKey, assignedShadows, deadShadows });
    return { assignedShadows, shadowHP, deadShadows };
  },

  async _applyAccumulatedShadowAndUserDamage({
    shadowDamageMap,
    assignedShadows,
    shadowHP,
    deadShadows,
    channelKey,
    totalUserDamage,
    dungeon,
    userDamageToast = null,
    shadowByIdMap = null, // Optional pre-built Map for O(1) lookup (avoids O(N) .find per entry)
    damageAlreadyApplied = false, // When true, HP already deducted (per-round processing); skip Phase 1 damage, only collect deaths
  }) {
    // PERF: O(1) Map lookup — without this, N damaged × M assigned = O(NM) per tick
    const shadowById = shadowByIdMap || new Map(
      assignedShadows.map((s) => [this.getShadowIdValue(s), s])
    );

    // damageAlreadyApplied=true: HP already deducted per-round; just scan for deaths
    const newlyDead = [];
    for (const [shadowId, damage] of shadowDamageMap.entries()) {
      const targetShadow = shadowById.get(shadowId);
      const shadowHPData = shadowHP.get(shadowId);
      if (!targetShadow || !shadowHPData) continue;

      if (damageAlreadyApplied) {
        // Damage already applied per-round — just check if dead
        if (shadowHPData.hp <= 0) {
          newlyDead.push({ shadowId, targetShadow, shadowHPData });
        }
      } else {
        const oldHP = shadowHPData.hp;
        shadowHPData.hp = Math.max(0, shadowHPData.hp - damage);
        shadowHP.set(shadowId, shadowHPData);

        if (oldHP > 0 && shadowHPData.hp <= 0) {
          newlyDead.push({ shadowId, targetShadow, shadowHPData });
        }
      }
    }

    // PERF: Batched resurrection — one mana write-back for all deaths this tick
    if (newlyDead.length > 0 && this.soloLevelingStats) {
      if (!dungeon._lastResurrectionAttempt) dungeon._lastResurrectionAttempt = {};
      const now = Date.now();

      // BUGFIX: Parallel mode uses per-dungeon mana budget; defer write-back to post-Promise.all
      if (this._tickManaBudgetPerDungeon === undefined) {
        this.syncManaFromStats();
      }
      let manaPool = this._tickManaBudgetPerDungeon !== undefined
        ? this._tickManaBudgetPerDungeon - (dungeon._tickManaUsed || 0)
        : (this.settings.userMana || 0);

      const { getRankIndex } = require('../shared/rank-utils');
      newlyDead.sort((a, b) => getRankIndex(b.targetShadow.rank) - getRankIndex(a.targetShadow.rank));

      let resurrectedCount = 0;
      for (const { shadowId, targetShadow, shadowHPData } of newlyDead) {
        dungeon._lastResurrectionAttempt[shadowId] = now;
        const cost = this.getResurrectionCost(targetShadow.rank || 'E');

        if (manaPool >= cost) {
          manaPool -= cost;
          resurrectedCount++;

          if (!shadowHPData.maxHp || shadowHPData.maxHp <= 0) {
            const recalculatedHP = this.initializeShadowHPSync(targetShadow, shadowHP);
            if (recalculatedHP) shadowHPData.maxHp = recalculatedHP.maxHp;
          }
          shadowHPData.hp = shadowHPData.maxHp || 1;
          shadowHP.set(shadowId, { ...shadowHPData });
          deadShadows.delete(shadowId);
          delete dungeon._lastResurrectionAttempt[shadowId];
        }
      }

      if (resurrectedCount > 0) {
        if (this._tickManaBudgetPerDungeon !== undefined) {
          const totalSpent = (this._tickManaBudgetPerDungeon - (dungeon._tickManaUsed || 0)) - manaPool;
          dungeon._tickManaUsed = (dungeon._tickManaUsed || 0) + Math.max(0, totalSpent);
        } else {
          this.settings.userMana = Math.max(0, manaPool);
          this.pushManaToStats(false);
        }
        dungeon.shadowRevives = (dungeon.shadowRevives || 0) + resurrectedCount;
        dungeon.successfulResurrections = (dungeon.successfulResurrections || 0) + resurrectedCount;
        this.markCombatSettingsDirty('batch-resurrection');
        this.startRegeneration(); // PERF: restart regen if it was paused
      }

      if (dungeon._cachedAliveCount != null) {
        dungeon._cachedAliveCount = Math.max(0, dungeon._cachedAliveCount - newlyDead.length + resurrectedCount);
      }
    }

    if (totalUserDamage > 0) {
      const adjustedUserDamage = this.applyStatusAdjustedIncomingDamage(
        channelKey,
        'user',
        'user',
        totalUserDamage,
        Date.now()
      );
      this.syncHPFromStats();
      this.settings.userHP = Math.max(0, this.settings.userHP - adjustedUserDamage);
      this.pushHPToStats(true);
      this.updateStatsUI();
      this.startRegeneration(); // PERF: restart regen if it was paused

      if (userDamageToast && dungeon.userParticipating) {
        this.showToast(userDamageToast(adjustedUserDamage), 'error');
      }

      if (this.settings.userHP <= 0) {
        await this.handleUserDefeat(channelKey);
      }
    }
  },

  _createBossHPBarInPreferredContainer(channelKey) {
    const channelHeader = this.findChannelHeader();
    if (channelHeader) {
      const headerContainer = channelHeader.parentElement || channelHeader;
      if (headerContainer.isConnected) {
        this.createBossHPBarInContainer(headerContainer, channelKey);
      }
    }

    let hpBar = this.bossHPBars.get(channelKey);
    if (!hpBar) {
      const channelContainer = this.findChannelContainer();
      if (channelContainer && channelContainer.isConnected) {
        this.createBossHPBarInContainer(channelContainer, channelKey);
        hpBar = this.bossHPBars.get(channelKey);
      }
    }

    return hpBar || null;
  }
};
