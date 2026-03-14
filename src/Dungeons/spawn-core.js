module.exports = {
  getChannelInfoFromLocation() {
    try {
      const path = window.location?.pathname || '';
      const parts = path.split('/').filter(Boolean);
      if (parts[0] !== 'channels') return null;
      const rawGuildId = parts[1];
      const rawChannelId = parts[2];
      if (!rawChannelId) return null;
      const guildId = rawGuildId === '@me' ? 'DM' : rawGuildId;
      return { guildId, channelId: rawChannelId };
    } catch (_) {
      return null;
    }
  },

  getServerChannelCount(guildId) {
    if (!guildId || guildId === 'DM') return null;

    try {
      const ChannelStore =
        BdApi.Webpack?.getStore?.('ChannelStore') ||
        BdApi.Webpack?.getModule?.((m) => m?.getGuildChannels);

      if (ChannelStore) {
        // Method 1: getGuildChannels
        if (typeof ChannelStore.getGuildChannels === 'function') {
          const channels = ChannelStore.getGuildChannels(guildId);
          if (channels) {
            // Count only text channels (not voice, announcements, etc)
            const textChannels = Object.values(channels).filter(
              (c) => c.type === 0 || c.type === 'GUILD_TEXT'
            );
            return textChannels.length;
          }
        }

        // Method 2: getAllChannels and filter by guild
        if (typeof ChannelStore.getAllChannels === 'function') {
          const allChannels = ChannelStore.getAllChannels();
          if (allChannels) {
            const guildChannels = Object.values(allChannels).filter(
              (c) => c.guild_id === guildId && (c.type === 0 || c.type === 'GUILD_TEXT')
            );
            return guildChannels.length;
          }
        }
      }
    } catch (error) {
      this.debugLog('Error getting server channel count:', error);
    }

    return null;
  },

  getActiveDungeonCountForGuild(guildId) {
    let count = 0;
    this.activeDungeons.forEach((dungeon, key) => {
      if (dungeon && !dungeon.completed && !dungeon.failed && key.startsWith(guildId + '_')) {
        count++;
      }
    });
    return count;
  },

  getMaxDungeonsForGuild(guildId) {
    const channelCount = this.getServerChannelCount(guildId);
    const pct = this.settings.maxDungeonsPercentage || 0.15;
    const min = this.settings.minDungeonsAllowed || 3;
    const max = this.settings.maxDungeonsAllowed || 20;
    if (!channelCount) return min; // Can't resolve channels — use safe minimum
    return Math.max(min, Math.min(max, Math.floor(channelCount * pct)));
  },

  async checkDungeonSpawn(channelKey, channelInfo, context = {}) {
    // Gate 1: Channel already locked or has active dungeon
    if (this.channelLocks.has(channelKey) || this.activeDungeons.has(channelKey)) return;

    const now = Date.now();
    const guildId = channelInfo?.guildId;
    const channelId = channelInfo?.channelId;

    // Gate 1.5: Skip muted channels — user has "Mute until I turn it back on" or similar
    // NOTE: Guild-level mute is NOT checked here — if the guild is muted but individual
    // channels are unmuted, dungeons should still spawn in those unmuted channels.
    // pickSpawnChannel() handles per-channel mute filtering for the candidate pool.
    if (guildId && channelId && this._UserGuildSettingsStore) {
      try {
        if (this._UserGuildSettingsStore.isChannelMuted?.(guildId, channelId)) return;
      } catch (_) { /* store unavailable, allow spawn */ }
    }

    // Gate 2: Per-channel cooldown — don't re-spawn in a channel too soon after a dungeon ended
    const channelCooldownRaw = Number(this.settings?.channelSpawnCooldown);
    const channelCooldownDefault = Number(this.defaultSettings?.channelSpawnCooldown) || 300000;
    const channelCooldown = Number.isFinite(channelCooldownRaw) && channelCooldownRaw >= 0
      ? channelCooldownRaw
      : channelCooldownDefault;
    const lastEnd = this.settings.lastDungeonEndTime?.[channelKey];
    if (lastEnd && now - lastEnd < channelCooldown) return;

    // Gate 3: Global spawn throttle — enforce validated cooldown between any new dungeon
    const globalCooldownRaw = Number(this.settings?.globalSpawnCooldown);
    const globalCooldownDefault = Number(this.defaultSettings?.globalSpawnCooldown) || 60000;
    const globalCooldown = Number.isFinite(globalCooldownRaw) && globalCooldownRaw >= 0
      ? globalCooldownRaw
      : globalCooldownDefault;
    if (this._lastGlobalSpawnTime && now - this._lastGlobalSpawnTime < globalCooldown) return;

    // Gate 4: Per-guild cap — max dungeons based on % of guild channels (clamped by min/max)
    if (guildId && guildId !== 'DM') {
      const guildActive = this.getActiveDungeonCountForGuild(guildId);
      const guildMax = this.getMaxDungeonsForGuild(guildId);
      if (guildActive >= guildMax) return;
    }

    // Gate 5: Spawn RNG
    const spawnChancePercent = Number.isFinite(this.settings?.spawnChance)
      ? this.settings.spawnChance
      : 10;
    const spawnChance = Math.max(0, Math.min(1, spawnChancePercent / 100));
    if (Math.random() > spawnChance) return;

    // LOCK CHANNEL + GLOBAL COOLDOWN IMMEDIATELY: Prevents race conditions from message spam.
    // Setting _lastGlobalSpawnTime BEFORE the async createDungeon call prevents concurrent
    // messages from all bypassing the gate while createDungeon is in-flight.
    this.channelLocks.add(channelKey);
    this._lastGlobalSpawnTime = Date.now();

    try {
      const dungeonRank = this.calculateDungeonRank();
      await this.createDungeon(channelKey, channelInfo, dungeonRank);
    } catch (error) {
      this.errorLog(`Error creating dungeon in ${channelKey}:`, error);
      this.channelLocks.delete(channelKey);
    }
  },

  calculateDungeonRank() {
    const rankList = this.getDungeonRankList();
    const userRank = this.soloLevelingStats?.settings?.rank || 'E';
    const rankIndex = this.getRankIndexValue(userRank, rankList);
    const maxRankIndex = rankList.length - 1;

    // Functional: Generate weights using Array.from and map
    const weights = Array.from({ length: maxRankIndex + 1 }, (_, i) =>
      i <= rankIndex ? 10 - (rankIndex - i) : Math.max(1, 5 - (i - rankIndex))
    );

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    // Functional: Use findIndex instead of for-loop
    const selectedIndex = weights.findIndex((weight) => {
      random -= weight;
      return random <= 0;
    });

    return rankList[selectedIndex >= 0 ? selectedIndex : 0] || 'E';
  },

  async createDungeon(channelKey, channelInfo, rank) {
    // FINAL SAFETY CHECK: Forcefully reject if channel already has active dungeon
    // This catches any race conditions that passed the initial checks
    if (this.activeDungeons.has(channelKey)) {
      this.debugLog(
        `CONFLICT DETECTED: Channel ${channelKey} already has active dungeon - forcing abort`
      );
      this.channelLocks.delete(channelKey); // Release lock
      return; // Abort dungeon creation
    }

    const rankList = this.getDungeonRankList();
    const rankIndex = this.getRankIndexValue(rank, rankList);
    // THEMED BIOME DUNGEONS - Each biome spawns specific magic beast families
    // Biomes reflect natural habitats for magic beasts
    const dungeonBiomes = [
      {
        name: 'Forest',
        description: 'Dense woodland teeming with insects and beasts',
        mobMultiplier: 2.5, // Horde of insects
        beastFamilies: ['insect', 'beast'], // Ants, spiders, centipedes, bears, wolves
      },
      {
        name: 'Arctic',
        description: 'Frozen wasteland of ice and snow',
        mobMultiplier: 1.2, // Fewer but tankier
        beastFamilies: ['ice', 'beast'], // Yetis, bears, wolves
      },
      {
        name: 'Cavern',
        description: 'Underground tunnels filled with horrors',
        mobMultiplier: 2.0, // Many creatures
        beastFamilies: ['insect', 'undead', 'construct'], // Spiders, centipedes, ghouls, golems
      },
      {
        name: 'Swamp',
        description: 'Murky marshland of serpents and undead',
        mobMultiplier: 1.8, // Dense population
        beastFamilies: ['reptile', 'undead'], // Serpents, nagas, ghouls
      },
      {
        name: 'Mountains',
        description: 'Rocky peaks inhabited by giants and wyverns',
        mobMultiplier: 0.8, // Fewer but stronger
        beastFamilies: ['giant', 'dragon'], // Giants, titans (A+), wyverns (S+), dragons (NH+)
      },
      {
        name: 'Volcano',
        description: 'Molten hellscape of demons and dragons',
        mobMultiplier: 1.0, // Balanced
        beastFamilies: ['demon', 'humanoid-beast', 'dragon'], // Demons, ogres, dragons (NH+)
      },
      {
        name: 'Ancient Ruins',
        description: 'Mystical ruins guarded by constructs and elves',
        mobMultiplier: 1.2, // Moderate
        beastFamilies: ['construct', 'ancient', 'undead'], // Golems, elves, ghouls
      },
      {
        name: 'Dark Abyss',
        description: 'Void realm of demons and horrors',
        mobMultiplier: 1.5, // Many dark creatures
        beastFamilies: ['demon', 'undead', 'dragon'], // Demons, ghouls, dragons (NH+)
      },
      {
        name: 'Tribal Grounds',
        description: 'Savage lands of orcs and ogres',
        mobMultiplier: 2.0, // Large tribes
        beastFamilies: ['humanoid-beast', 'giant'], // Orcs, ogres, giants
      },
    ];

    const dungeonBiome = dungeonBiomes[Math.floor(Math.random() * dungeonBiomes.length)];
    const dungeonType = dungeonBiome.name;

    // Generate themed names based on biome
    const dungeonName = this.generateDungeonName(rank, dungeonType);
    const bossName = this.generateBossName(rank, dungeonType);

    // LORE-ACCURATE MOB COUNTS (exponential scaling)
    // Solo Leveling lore reference:
    //   E-rank: Small goblin caves (~50 beasts)
    //   D-rank: Low-level beast dens (~150)
    //   C-rank: Mid-tier, requires ~10 hunters (~400)
    //   B-rank: Red gate scale, 14+ hunters (~1,200)
    //   A-rank: Guild raid scale, high orcs (~4,000)
    //   S-rank: National emergency — Jeju Island had 4,000+ ants (~10,000)
    //   SS+: Demon Castle scale, 100 floors (~20,000-50,000)
    //   Monarch+: Full army invasions (~100,000+)
    const MOB_COUNT_BY_RANK = {
      'E': 50,
      'D': 150,
      'C': 400,
      'B': 1200,
      'A': 4000,
      'S': 10000,
      'SS': 25000,
      'SSS': 50000,
      'SSS+': 75000,
      'NH': 100000,
      'Monarch': 250000,
      'Monarch+': 500000,
      'Shadow Monarch': 1000000,
    };
    const baseMobCount = MOB_COUNT_BY_RANK[rank] || (50 * Math.pow(2.5, rankIndex));
    const biomeMultiplier = dungeonBiome.mobMultiplier || 1.0;
    const totalMobCount = Math.floor(
      Math.max(50, baseMobCount * biomeMultiplier)
    );

    // Calculate expected shadow allocation for this dungeon
    // Get current shadow army size
    const totalShadowCount = await this.getShadowCount();

    // Calculate this dungeon's weight relative to other active dungeons
    const activeDungeonsList = Array.from(this.activeDungeons.values()).filter(
      (d) => !d.completed && !d.failed
    );

    // Weight system: E=1, D=2, C=3, B=4, A=5, S=6, etc.
    const thisWeight = rankIndex + 1;
    const existingTotalWeight = activeDungeonsList.reduce((sum, d) => {
      const dRankIndex = this.getRankIndexValue(d.rank);
      return sum + (dRankIndex + 1);
    }, 0);
    const newTotalWeight = existingTotalWeight + thisWeight;

    // Calculate expected shadows for this dungeon
    const expectedShadowPortion = (thisWeight / newTotalWeight) * totalShadowCount;
    const expectedShadowCount = Math.max(1, Math.floor(expectedShadowPortion));

    // Calculate boss stats based on rank (used for combat calculations)
    const bossBaseStats = this.calculateBossBaseStats(rankIndex);
    const bossStrength = bossBaseStats.strength;
    const bossAgility = bossBaseStats.agility;
    const bossIntelligence = bossBaseStats.intelligence;
    const bossVitality = bossBaseStats.vitality;
    const bossPerception = bossBaseStats.perception;

    // Boss HP: static lore HP (base + vitality + rank bonus) times rank multiplier.
    // No runtime scaling from shadow counts.
    const rankBonus = this._bossHPBonusTable?.[rankIndex] || 0;
    const staticBossHpMultiplier = this.getStaticBossHpMultiplier(rankIndex);
    const finalBossHP = Math.max(
      1,
      Math.floor((100 + bossVitality * 10 + rankBonus) * staticBossHpMultiplier)
    );

    // BOSS MAGIC BEAST TYPE (biome-appropriate)
    const bossBeastType = this.selectMagicBeastType(
      dungeonBiome.beastFamilies,
      rank,
      rankList
    );
    const initialBossGate = this.getBossGateRuntimeConfig();
    const dungeonStartTime = Date.now();
    const dungeonXPBatchKey = `${channelKey}:${dungeonStartTime}`;

    const dungeon = {
      id: channelKey,
      channelKey,
      rank,
      name: dungeonName,
      type: dungeonType, // Biome name (Forest, Arctic, etc.)
      biome: dungeonBiome, // Store complete biome data
      beastFamilies: dungeonBiome.beastFamilies, // Allowed beast families for this biome
      channelName: channelInfo.channelName || `Channel ${channelInfo.channelId}`, // Store channel name
      guildName: (() => {
        try {
          const gs = BdApi.Webpack?.getStore?.('GuildStore');
          return gs?.getGuild?.(channelInfo.guildId)?.name || `Guild ${channelInfo.guildId}`;
        } catch (_) { return `Guild ${channelInfo.guildId}`; }
      })(),
      mobs: {
        total: 0,
        remaining: 0,
        killed: 0,
        targetCount: totalMobCount, // Target mob count for this dungeon
        spawnRate: 2 + rankIndex,
        activeMobs: [], // Array of mob objects with HP and stats
        // Per-dungeon mob capacity: Matches full target count (no hard ceiling).
        // Shadows kill mobs continuously; the adaptive combat budget system
        // (perDungeonMobBudget) already throttles per-tick iteration cost.
        mobCapacity: Math.max(200, totalMobCount),
      },
      boss: {
        id: `boss_${channelKey}`,
        name: bossName,
        hp: finalBossHP,
        maxHp: finalBossHP,
        rank,

        // MAGIC BEAST IDENTITY (for shadow extraction)
        beastType: bossBeastType.type,
        beastName: bossBeastType.name,
        beastFamily: bossBeastType.family,
        role: this.deriveMonsterRoleFromBeast(bossBeastType.type, bossBeastType.family),
        isMagicBeast: true,

        // Combat stats (for compatibility)
        strength: bossStrength,
        agility: bossAgility,
        intelligence: bossIntelligence,
        vitality: bossVitality,
        perception: bossPerception,

        // SHADOW-COMPATIBLE STATS (for extraction)
        baseStats: {
          strength: bossStrength,
          agility: bossAgility,
          intelligence: bossIntelligence,
          vitality: bossVitality,
          perception: bossPerception,
        },

        lastAttackTime: 0,
        attackCooldown: 3000, // Boss attacks every 3 seconds (stronger boss without HP scaling)
        expectedShadowCount: expectedShadowCount, // Track expected shadow force

        // Description for display
        description: `${rank}-rank ${bossBeastType.name} Boss from ${dungeonBiome.name}`,
      },
      startTime: dungeonStartTime,
      _xpBatchKey: dungeonXPBatchKey,
      pendingUserMobXP: 0,
      pendingUserMobKills: 0,
      channelId: channelInfo.channelId,
      guildId: channelInfo.guildId,
      userParticipating: null,
      shadowsDeployed: false, // Manual deploy: user must click "Deploy Shadows" to start combat
      deployedAt: null, // Canonical deploy timestamp used for boss gate timing
      corpsePile: [], // Dead mobs collected during combat for post-dungeon ARISE extraction (persisted to IDB)
      shadowAttacks: {},
      shadowContributions: {}, // Track XP contributions: { shadowId: { mobsKilled: 0, bossDamage: 0 } }
      shadowHP: new Map(), // Track shadow HP: Map<shadowId, { hp, maxHp }>
      shadowRevives: 0, // Track total revives for summary
      bossGate: {
        enabled: initialBossGate.enabled,
        minDurationMs: initialBossGate.minDurationMs,
        requiredMobKills: initialBossGate.requiredMobKills,
        deployedAt: null, // Set on first Deploy Shadows; boss vulnerability timer starts from deploy time
        unlockedAt: null,
      },
      difficultyScale: {
        mobFactor: 1,
        bossFactor: 1,
        lastPower: 0,
        updatedAt: Date.now(),
      },
      completed: false,
      failed: false,
    };

    this.activeDungeons.set(channelKey, dungeon);
    this.startHPBarRestoration(); // PERF: restart if auto-stopped (idempotent)

    // Channel remains locked while dungeon is active (one occupied dungeon per channel).

    this.settings.lastSpawnTime[channelKey] = Date.now();
    this.saveSettings(); // Ensure lastSpawnTime is persisted
    this.settings.mobKillNotifications[channelKey] = { count: 0, lastNotification: Date.now() };

    // Save to IndexedDB
    if (this.storageManager) {
      try {
        await this.storageManager.saveDungeon(dungeon);
      } catch (error) {
        this.errorLog('Failed to save dungeon', error);
      }
    }

    // CRITICAL: Save boss to dedicated database (indexed for migration)
    if (this.mobBossStorageManager) {
      try {
        await this.mobBossStorageManager.saveBoss(dungeon.boss, channelKey);
        this.debugLog('BOSS_STORAGE', 'Boss cached to database', {
          dungeonKey: channelKey,
          bossId: dungeon.boss.id,
          rank: dungeon.boss.rank,
        });
      } catch (error) {
        this.errorLog('Failed to cache boss to database', error);
      }
    }

    this.saveSettings();
    this.showDungeonIndicator(channelKey, channelInfo);
    this.showToast(`${dungeonName} [${rank}] Spawned!`, 'info');

    this.settings.debug && console.log(
      `[Dungeons] 🏰 SPAWN: "${dungeonName}" [${rank}] in #${dungeon.channelName} (${dungeon.guildName}) — ` +
      `Biome: ${dungeonType} | Boss: ${dungeon.boss?.name || '?'} [${dungeon.boss?.rank}] | ` +
      `Mobs: ${dungeon.mobs?.targetCount?.toLocaleString()} | Key: ${channelKey}`
    );

    // Sync difficulty scale for mob/boss stat scaling
    this.syncDungeonDifficultyScale(dungeon, channelKey);
    // Spawn-time rank warmup: pre-prime deploy starter pool for this dungeon rank
    // so deploy click does not need to cold-read IDB.
    this._scheduleSpawnRankStarterWarm(channelKey, rank);

    // MANUAL DEPLOY: No mob spawning, no shadow allocation, no combat until user deploys.
    // Prevents idle mob accumulation (7k+ mobs with nothing killing them = UI thread starvation).
    // Mob spawning + combat all start together when deployShadows() is called.
    this.startMobKillNotifications(channelKey);

    // Automatic completion is handled by the global cleanup loop (`cleanupExpiredDungeons`)
    // This avoids per-dungeon long-lived timers that can accumulate.

    // Silent dungeon spawn (no console spam)
  },

  startMobSpawning(channelKey) {
    // Clear any legacy per-dungeon timer (from older versions/hot reloads)
    if (this.mobSpawnTimers.has(channelKey)) {
      const legacy = this.mobSpawnTimers.get(channelKey);
      legacy && clearTimeout(legacy);
      this.mobSpawnTimers.delete(channelKey);
    }

    if (this._mobSpawnNextAt.has(channelKey)) {
      this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TRACE: startMobSpawning SKIPPED — already scheduled for ${channelKey}`);
      this._ensureMobSpawnLoop();
      this.ensureDeployedSpawnPipeline(channelKey, 'start_already_scheduled');
      return;
    }

    // NATURAL SPAWNING: Gradual, organic mob waves with high variance
    // Creates dynamic, unpredictable spawn patterns without overwhelming
    const dungeon = this._getActiveDungeon(channelKey);
    if (!dungeon) {
      this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TRACE: startMobSpawning SKIPPED — no dungeon for ${channelKey}`);
      return;
    }

    // Start first spawn immediately (no delay), then schedule via global loop
    this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TRACE: startMobSpawning calling spawnMobs(${channelKey}), boss.hp=${dungeon.boss?.hp}, activeMobs=${dungeon.mobs?.activeMobs?.length || 0}`);
    this.spawnMobs(channelKey);
    const nextDelay = this._computeNextMobSpawnDelayMs(dungeon);
    this._mobSpawnNextAt.set(channelKey, Date.now() + nextDelay);
    // Next wave timing log stripped
    this._ensureMobSpawnLoop();

    // Natural spawning handles capacity organically
    // No need for capacity monitoring with gradual spawn system
  },

  stopMobSpawning(channelKey) {
    // Clear any legacy per-dungeon timer (from older versions/hot reloads)
    const timer = this.mobSpawnTimers.get(channelKey);
    timer && clearTimeout(timer);
    this.mobSpawnTimers.delete(channelKey);

    this._mobSpawnNextAt.delete(channelKey);
    this._mobSpawnQueueNextAt.delete(channelKey);

    // Process any remaining queued mobs before stopping
    if (this._mobSpawnQueue.has(channelKey)) {
      this.processMobSpawnQueue(channelKey);
      // Stop path should not retain overflow queue entries.
      this._mobSpawnQueue.delete(channelKey);
    }
  },

  stopAllMobSpawning() {
    // Legacy timer cleanup (should be empty)
    this.mobSpawnTimers.forEach((timer) => clearTimeout(timer));
    this.mobSpawnTimers.clear();

    this._mobSpawnNextAt && this._mobSpawnNextAt.clear();
    this._mobSpawnQueueNextAt && this._mobSpawnQueueNextAt.clear();
    this._stopMobSpawnLoop?.();
  },

  _countLiveMobs(dungeon) {
    const mobs = dungeon?.mobs?.activeMobs;
    if (!Array.isArray(mobs) || mobs.length === 0) return 0;

    let live = 0;
    for (let i = 0; i < mobs.length; i++) {
      if (mobs[i]?.hp > 0) live++;
    }
    return live;
  },

  _hasQueuedMobWave(channelKey) {
    const queued = this._mobSpawnQueue?.get?.(channelKey);
    return Array.isArray(queued) && queued.length > 0;
  },

  _logSpawnPipelineGuard(channelKey, message, cooldownMs = 5000) {
    const now = Date.now();
    const last = this._spawnPipelineGuardAt.get(channelKey) || 0;
    if (now - last < cooldownMs) return;
    this._spawnPipelineGuardAt.set(channelKey, now);
    this.debugLog('MOB_SPAWN_GUARD', `${message} | Key: ${channelKey}`);
  },

  ensureDeployedSpawnPipeline(channelKey, reason = 'runtime_guard') {
    const dungeon = this._getActiveDungeon(channelKey);
    if (!dungeon || !dungeon.shadowsDeployed || dungeon.boss?.hp <= 0) return false;

    if (!dungeon.mobs || typeof dungeon.mobs !== 'object') dungeon.mobs = {};
    if (!Array.isArray(dungeon.mobs.activeMobs)) dungeon.mobs.activeMobs = [];
    if (!Number.isFinite(dungeon.mobs.total)) dungeon.mobs.total = 0;
    if (!Number.isFinite(dungeon.mobs.killed)) dungeon.mobs.killed = 0;
    if (!Number.isFinite(dungeon.mobs.targetCount)) dungeon.mobs.targetCount = 0;

    this._ensureMobSpawnLoop();

    const targetCount = Math.max(0, Math.floor(Number(dungeon.mobs.targetCount) || 0));
    const totalSpawned = Math.max(0, Math.floor(Number(dungeon.mobs.total) || 0));
    const liveMobsBefore = this._countLiveMobs(dungeon);
    const hasQueuedWave = this._hasQueuedMobWave(channelKey);
    const spawnExhausted = targetCount > 0 && totalSpawned >= targetCount;

    if (!spawnExhausted && !this._mobSpawnNextAt.has(channelKey)) {
      const nextDelay = this._computeNextMobSpawnDelayMs(dungeon);
      this._mobSpawnNextAt.set(channelKey, Date.now() + nextDelay);
    }

    if (spawnExhausted) return liveMobsBefore > 0 || hasQueuedWave;
    if (liveMobsBefore > 0 || hasQueuedWave) return true;

    this.spawnMobs(channelKey);
    if (this._hasQueuedMobWave(channelKey)) {
      const queuedRemaining = this.processMobSpawnQueue(channelKey);
      if (queuedRemaining > 0) {
        this._mobSpawnQueueNextAt?.set?.(channelKey, Date.now() + 500);
      } else {
        this._mobSpawnQueueNextAt?.delete?.(channelKey);
      }
    }

    const liveMobsAfter = this._countLiveMobs(dungeon);
    this._logSpawnPipelineGuard(
      channelKey,
      `rehydrated spawn pipeline (${reason}) | live ${liveMobsBefore} -> ${liveMobsAfter} | total=${dungeon.mobs.total}/${targetCount || '?'}`
    );

    return liveMobsAfter > 0;
  }
};
