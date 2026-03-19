const DC = require('./story-constants');
const { StoryModeStorage } = require('./story-mode-storage');

module.exports = {
  // Called from lifecycle.js start()
  async initStoryMode() {
    const userId = this.settings?.userId || this.soloLevelingStats?.settings?.userId || 'default';
    this.storyModeStorage = new StoryModeStorage(userId);
    try {
      await this.storyModeStorage.init();
      const saved = await this.storyModeStorage.loadProgress('demon_castle');
      this._demonCastle = saved ? { ...DC.DEFAULT_STATE, ...saved } : { ...DC.DEFAULT_STATE };
      const permits = await this.storyModeStorage.loadPermits('demon_castle');
      this._dcPermits = permits?.count || 0;
      this.debugLog('STORY', 'Story mode initialized', {
        floor: this._demonCastle.currentFloor,
        highest: this._demonCastle.highestFloor,
        permits: this._dcPermits,
        totalDemonSouls: this._demonCastle.totalDemonSouls,
      });

      // Sync existing demon soul count to ItemVault (set, not add — avoids double-counting)
      try {
        const Events = require('../shared/event-bus');
        const souls = this._demonCastle.totalDemonSouls || 0;
        if (souls > 0) {
          Events.emit('ItemVault:set', { itemId: 'demon_soul', amount: souls, source: 'Dungeons' });
        }
        const permits = this._demonCastle.totalPermitsEarned || 0;
        if (permits > 0) {
          Events.emit('ItemVault:set', { itemId: 'entry_permit', amount: permits, source: 'Dungeons' });
        }
      } catch (_) {}
    } catch (error) {
      this.errorLog('STORY', 'Failed to init story mode storage', error);
      this._demonCastle = { ...DC.DEFAULT_STATE };
      this._dcPermits = 0;
    }
  },

  // Main entry point — called from UI or auto-advance
  async enterDemonCastle() {
    if (this._storyModeActive) {
      this.showToast('Demon Castle already active', 'warning');
      return;
    }

    const state = this._demonCastle;
    if (!state) {
      this.showToast('Story mode not initialized', 'error');
      return;
    }

    const floor = state.currentFloor || 1;
    const isAutoAdvance = this._dcAutoAdvancing;
    this._dcAutoAdvancing = false;

    // Permits are only consumed to ADVANCE floors (handled by permit drop → auto-advance).
    // Re-entering a floor you've already reached is always free.

    this._storyModeActive = true;
    state.lastEnteredAt = Date.now();
    if (!state.startedAt) state.startedAt = Date.now();

    // Build the floor dungeon object and insert into activeDungeons
    const dungeon = this._createDemonCastleFloor(floor);
    this.activeDungeons.set(DC.DEMON_CASTLE_KEY, dungeon);
    this.channelLocks.add(DC.DEMON_CASTLE_KEY);

    this.showToast(`Entering Demon Castle — Floor ${floor}`, 'info');
    this.debugLog('STORY', `Entering Demon Castle floor ${floor}`, {
      isBoss: DC.isBossFloor(floor),
      demonCount: DC.getDemonCount(floor),
      permits: this._dcPermits,
    });

    // Auto-deploy shadows and start combat
    try {
      await this.deployShadows(DC.DEMON_CASTLE_KEY);
    } catch (error) {
      this.errorLog('STORY', 'Failed to deploy shadows in Demon Castle', error);
    }

    this.ensureDungeonHeaderWidget();
    this.renderDungeonHeaderPopup?.();
    this._saveDemonCastleState();
  },

  // Exit without completing the floor
  async exitDemonCastle() {
    if (!this._storyModeActive) return;

    const dungeon = this.activeDungeons.get(DC.DEMON_CASTLE_KEY);
    if (dungeon) {
      if (this._demonCastle) {
        this._demonCastle.totalDemonsKilled += (dungeon.mobs?.killed || 0);
      }

      // Phase A cleanup
      try { this.stopShadowAttacks(DC.DEMON_CASTLE_KEY); } catch (_) {}
      try { this.stopBossAttacks(DC.DEMON_CASTLE_KEY); } catch (_) {}
      try { this.stopMobAttacks(DC.DEMON_CASTLE_KEY); } catch (_) {}
      try { this.stopMobSpawning(DC.DEMON_CASTLE_KEY); } catch (_) {}
      try { this.removeBossHPBar(DC.DEMON_CASTLE_KEY); } catch (_) {}
      try { this.removeDungeonIndicator(DC.DEMON_CASTLE_KEY); } catch (_) {}

      this.activeDungeons.delete(DC.DEMON_CASTLE_KEY);
      this.channelLocks.delete(DC.DEMON_CASTLE_KEY);
      this._cleanupPerChannelRuntimeState(DC.DEMON_CASTLE_KEY);
    }

    this._storyModeActive = false;
    this.showToast('Exited Demon Castle — Progress saved.', 'info');
    await this._saveDemonCastleState();
    this._flushDcPermits();
    this.ensureDungeonHeaderWidget();
    this.renderDungeonHeaderPopup?.();
  },

  // Build the synthetic dungeon object for a floor
  _createDemonCastleFloor(floor) {
    const isBossFloor = DC.isBossFloor(floor);
    const tier = DC.getFloorTier(floor);
    const dungeonRank = DC.getDungeonRankForFloor(floor);
    const rankIndex = this.getRankIndex?.(dungeonRank) || 0;
    const demonCount = DC.getDemonCount(floor);

    // Build boss config
    let boss;
    if (isBossFloor) {
      const bossConfig = DC.DEMON_CASTLE_BOSSES[floor];
      const bossMult = DC.DEMON_CASTLE_BOSS_MULTIPLIERS[floor] || { hpMult: 1, dmgMult: 1 };
      const baseStats = this.calculateBossBaseStats?.(bossConfig.rank) || {
        strength: 500 + rankIndex * 200,
        agility: 400 + rankIndex * 150,
        intelligence: 300 + rankIndex * 100,
        vitality: 800 + rankIndex * 400,
        perception: 200 + rankIndex * 100,
      };
      baseStats.strength = Math.floor(baseStats.strength * bossMult.dmgMult);
      baseStats.agility = Math.floor(baseStats.agility * bossMult.dmgMult);
      baseStats.intelligence = Math.floor(baseStats.intelligence * bossMult.dmgMult);

      const shadowCount = this._shadowCountCache || 100;
      const bossHp = Math.floor((this.calculateBossHP?.(bossConfig.rank, shadowCount) || 50000) * bossMult.hpMult);

      boss = {
        id: `dc_boss_${floor}_${Date.now()}`,
        name: bossConfig.name,
        rank: bossConfig.rank,
        beastType: 'demon',
        beastFamily: 'demon',
        role: 'boss',
        hp: bossHp,
        maxHp: bossHp,
        ...baseStats,
        baseStats: { ...baseStats },
        lastAttackTime: 0,
        attackCooldown: 2000,
        expectedShadowCount: shadowCount,
        _enragePhases: [],
        _phasesTriggered: [],
        _phaseShieldExpiresAt: 0,
        _dcTitle: bossConfig.title,
        _dcAbilities: bossConfig.abilities || [],
      };
    } else {
      // Sentinel boss — never fights, floor clears when permit drops
      boss = {
        id: `dc_sentinel_${floor}_${Date.now()}`,
        name: `Floor ${floor} Gate`,
        rank: dungeonRank,
        beastType: 'demon',
        beastFamily: 'demon',
        role: 'boss',
        hp: 0,
        maxHp: 1,
        strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0,
        baseStats: { strength: 0, agility: 0, intelligence: 0, vitality: 0, perception: 0 },
        lastAttackTime: Infinity,
        attackCooldown: Infinity,
        expectedShadowCount: 0,
        _isSentinel: true,
        _enragePhases: [],
        _phasesTriggered: [],
        _phaseShieldExpiresAt: 0,
      };
    }

    return {
      id: DC.DEMON_CASTLE_KEY,
      channelKey: DC.DEMON_CASTLE_KEY,
      rank: dungeonRank,
      name: `Demon Castle — Floor ${floor}`,
      type: 'Demon Castle',
      biome: { name: 'Demon Castle', description: 'A burning fortress of demons', mobMultiplier: 1.0, beastFamilies: ['demon'] },
      beastFamilies: ['demon'],
      channelName: 'Demon Castle',
      guildName: 'Story Mode',
      guildId: null,
      channelId: null,
      mobs: {
        total: demonCount,
        remaining: demonCount,
        killed: 0,
        targetCount: demonCount,
        mobCapacity: Math.min(demonCount, 500),
        spawnRate: 1.0,
        activeMobs: [],
      },
      boss,
      startTime: Date.now(),
      _xpBatchKey: `dc_floor_${floor}_${Date.now()}`,
      pendingUserMobXP: 0,
      pendingUserMobKills: 0,
      userParticipating: true,
      shadowsDeployed: false,
      deployedAt: null,
      corpsePile: [],
      shadowAttacks: {},
      shadowContributions: {},
      shadowHP: new Map(),
      shadowRevives: 0,
      bossGate: { enabled: false },
      // Per-floor scaling: mobs get stronger as you progress within each tier (1.0x → 1.5x)
      difficultyScale: { mobFactor: DC.getFloorScaling(floor), bossFactor: 1.0, lastPower: 0, updatedAt: Date.now() },
      completed: false,
      failed: false,

      // Demon Castle specific flags
      _isDemonCastle: true,
      _dcFloor: floor,
      _dcIsBossFloor: isBossFloor,
      _dcTier: tier,
      _pendingEssence: 0,
      _dcPermitsPendingFlush: 0,
    };
  },

  // Called from modified completeDungeon() when _isDemonCastle is true
  _completeDemonCastleFloor(channelKey, dungeon, reason) {
    const floor = dungeon._dcFloor || 1;
    const isBossFloor = dungeon._dcIsBossFloor;

    this.debugLog('STORY', `Completing DC floor ${floor}`, { reason, isBossFloor });

    // Phase A: Synchronous cleanup
    try { this.stopShadowAttacks(channelKey); } catch (_) {}
    try { this.stopBossAttacks(channelKey); } catch (_) {}
    try { this.stopMobAttacks(channelKey); } catch (_) {}
    try { this.stopMobSpawning(channelKey); } catch (_) {}
    try { this.removeBossHPBar(channelKey); } catch (_) {}
    try { this.removeDungeonIndicator(channelKey); } catch (_) {}

    this.activeDungeons.delete(channelKey);
    this.channelLocks.delete(channelKey);
    this._cleanupPerChannelRuntimeState(channelKey);
    this._storyModeActive = false;

    // User exit — no advancement, save and return
    if (reason === 'exit') {
      if (this._demonCastle) {
        this._demonCastle.totalDemonsKilled += (dungeon.mobs?.killed || 0);
      }
      this._saveDemonCastleState();
      this._flushDcPermits();
      return;
    }

    // Phase B: Floor cleared — award XP, update state
    const state = this._demonCastle;
    if (!state) return;

    const mobsKilled = dungeon.mobs?.killed || 0;
    state.totalDemonsKilled += mobsKilled;

    // Grant mob XP with 3x multiplier
    const pendingXp = dungeon.pendingUserMobXP || 0;
    if (pendingXp > 0) {
      const xpGain = Math.floor(pendingXp * DC.XP_MOB_MULTIPLIER);
      this._grantUserDungeonXP(xpGain, 'demon_castle_mobs', { floor, mobsKilled });
    }

    // Boss floor bonus XP
    if (isBossFloor) {
      const bossConfig = DC.DEMON_CASTLE_BOSSES[floor];
      const rankIndex = this.getRankIndex?.(bossConfig?.rank || 'B') || 0;
      const bossXp = Math.floor((200 + rankIndex * 100) * DC.XP_BOSS_MULTIPLIER);
      this._grantUserDungeonXP(bossXp, 'demon_castle_boss', { floor, bossName: bossConfig?.name });
      state.totalBossesDefeated = (state.totalBossesDefeated || 0) + 1;
    }

    // Emit essence for the floor
    if (mobsKilled > 0 && typeof BdApi?.Events?.emit === 'function') {
      const dungeonRank = DC.getDungeonRankForFloor(floor);
      try {
        BdApi.Events.emit('Dungeons:awardEssence', {
          amount: mobsKilled,
          mobRank: dungeonRank,
          source: 'mob_kill',
        });
      } catch (_) {}
    }
    if (isBossFloor && typeof BdApi?.Events?.emit === 'function') {
      try {
        BdApi.Events.emit('Dungeons:awardEssence', {
          amount: 1,
          bossRank: DC.DEMON_CASTLE_BOSSES[floor]?.rank || 'B',
          source: 'boss_kill',
        });
      } catch (_) {}
    }

    // Floor advancement
    if (!state.floorsCleared.includes(floor)) {
      state.floorsCleared.push(floor);
    }
    state.lastClearedFloor = floor;
    if (floor > (state.highestFloor || 0)) {
      state.highestFloor = floor;
    }

    if (floor >= DC.DEMON_CASTLE_FLOORS) {
      // Castle completed!
      state.completedAt = Date.now();
      this.showToast('Demon Castle CLEARED! Baran has been defeated!', 'success');
      this._saveDemonCastleState();
      this._flushDcPermits();
      this.ensureDungeonHeaderWidget();
      this.renderDungeonHeaderPopup?.();
    } else {
      state.currentFloor = floor + 1;
      const nextBoss = DC.isBossFloor(floor + 1);
      const bossStr = nextBoss ? ` — Boss: ${DC.DEMON_CASTLE_BOSSES[floor + 1]?.name}` : '';
      this.showToast(`Floor ${floor} Cleared! Auto-advancing to Floor ${floor + 1}${bossStr}`, 'success');

      this._saveDemonCastleState();
      this._flushDcPermits();

      // Auto-advance: enter next floor after a short delay for cleanup
      // Flag bypasses permit consumption — the permit drop itself triggered this advance
      this._dcAutoAdvancing = true;
      setTimeout(() => {
        this.enterDemonCastle().catch((err) =>
          this.errorLog('STORY', 'Auto-advance failed', err)
        );
      }, 1500);
    }
  },

  // Roll entry permit drop on demon kills — permit = floor clear trigger on non-boss floors
  _rollDemonCastlePermitDrop(floor, killCount) {
    if (killCount <= 0) return;
    // Don't roll permits on boss floors — boss kill is the clear trigger
    if (DC.isBossFloor(floor)) return;

    const dungeon = this.activeDungeons?.get(DC.DEMON_CASTLE_KEY);
    if (!dungeon || dungeon.completed) return;

    const dropRate = DC.getPermitDropRate(floor);
    const remaining = dungeon.mobs?.remaining || 0;
    const totalKilled = dungeon.mobs?.killed || 0;

    for (let i = 0; i < killCount; i++) {
      // Guaranteed drop on the very last demon
      const isLastDemon = (remaining - i) <= 1;
      if (isLastDemon || Math.random() < dropRate) {
        // Permit dropped! This triggers floor clear.
        // Don't increment _dcPermits — the permit is immediately consumed to advance.
        // Only track the lifetime stat.
        if (this._demonCastle) {
          this._demonCastle.totalPermitsEarned = (this._demonCastle.totalPermitsEarned || 0) + 1;
        }
        // Track permit in ItemVault (add then immediately spend — net zero, but audit trail)
        try {
          BdApi.Events.emit('ItemVault:add', {
            itemId: 'entry_permit',
            amount: 1,
            source: 'Dungeons',
            meta: { floor, kills: totalKilled + i + 1, guaranteed: isLastDemon },
          });
          BdApi.Events.emit('ItemVault:spend', {
            itemId: 'entry_permit',
            amount: 1,
            source: 'Dungeons',
            reason: `advance_floor_${floor}_to_${floor + 1}`,
          });
        } catch (_) {}

        this.showToast(`Entry Permit obtained! Advancing to next floor...`, 'success');
        this.debugLog('STORY', `Permit dropped on floor ${floor} after ${totalKilled + i + 1} kills${isLastDemon ? ' (guaranteed last kill)' : ''}`);

        // Trigger floor completion — this will auto-advance
        this.completeDungeon(DC.DEMON_CASTLE_KEY, 'complete');
        return; // Stop rolling — floor is done
      }
    }
  },

  // Flush accumulated permit writes to IDB
  _flushDcPermits() {
    if (!this.storyModeStorage) return;
    this.storyModeStorage.savePermits('demon_castle', this._dcPermits).catch(() => {});
  },

  // Save DC state to IDB
  async _saveDemonCastleState() {
    if (!this.storyModeStorage || !this._demonCastle) return;
    try {
      await this.storyModeStorage.saveProgress('demon_castle', this._demonCastle);
    } catch (error) {
      this.errorLog('STORY', 'Failed to save DC state', error);
    }
  },

  // Non-boss floors: permit drop handles advancement (see _rollDemonCastlePermitDrop)
  // Boss floors: boss kill triggers completeDungeon via normal combat flow
  _checkDemonCastleFloorClear(_channelKey, _dungeon) {
    // No-op: floor clear is now handled by:
    // - Non-boss floors: permit drop in _rollDemonCastlePermitDrop
    // - Boss floors: boss death in normal combat → completeDungeon
  },
};
