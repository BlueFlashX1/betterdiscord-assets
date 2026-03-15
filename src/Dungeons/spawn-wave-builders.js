module.exports = {
  getDefaultBeastFamilies() {
    return [
      'insect',
      'beast',
      'reptile',
      'ice',
      'dragon',
      'giant',
      'demon',
      'humanoid-beast',
      'undead',
      'construct',
      'ancient',
    ];
  },

  selectMagicBeastType(allowedFamilies, mobRank, allRanks) {
    const safeFamilies = Array.isArray(allowedFamilies) && allowedFamilies.length > 0
      ? allowedFamilies
      : this.getDefaultBeastFamilies();
    const safeRanks = Array.isArray(allRanks) && allRanks.length > 0
      ? allRanks
      : this.settings?.dungeonRanks || this.defaultSettings?.dungeonRanks || [];

    // Magic beast type definitions (matches Shadow Army shadowRoles)
    const magicBeastTypes = {
      // Insect family
      ant: { type: 'ant', name: 'Ant', family: 'insect', minRank: null },
      spider: { type: 'spider', name: 'Spider', family: 'insect', minRank: null },
      centipede: { type: 'centipede', name: 'Centipede', family: 'insect', minRank: null },

      // Beast family
      bear: { type: 'bear', name: 'Bear', family: 'beast', minRank: null },
      wolf: { type: 'wolf', name: 'Wolf', family: 'beast', minRank: null },

      // Reptile family
      naga: { type: 'naga', name: 'Naga', family: 'reptile', minRank: null },
      serpent: { type: 'serpent', name: 'Serpent', family: 'reptile', minRank: null },

      // Ice family
      yeti: { type: 'yeti', name: 'Yeti', family: 'ice', minRank: null },

      // Dragon family (wyverns S+, dragons NH+)
      dragon: { type: 'dragon', name: 'Dragon', family: 'dragon', minRank: 'NH' },
      wyvern: { type: 'wyvern', name: 'Wyvern', family: 'dragon', minRank: 'S' },

      // Giant family
      giant: { type: 'giant', name: 'Giant', family: 'giant', minRank: null },
      titan: { type: 'titan', name: 'Titan', family: 'giant', minRank: 'A' },

      // Demon family
      demon: { type: 'demon', name: 'Demon', family: 'demon', minRank: 'B' },

      // Humanoid-beast family
      ogre: { type: 'ogre', name: 'Ogre', family: 'humanoid-beast', minRank: null },

      // Undead family
      ghoul: { type: 'ghoul', name: 'Ghoul', family: 'undead', minRank: null },

      // Construct family
      golem: { type: 'golem', name: 'Golem', family: 'construct', minRank: null },

      // Ancient family
      elf: { type: 'elf', name: 'Elf', family: 'ancient', minRank: null },

      // Humanoid-beast family (orcs, etc.)
      orc: { type: 'orc', name: 'Orc', family: 'humanoid-beast', minRank: null },
    };

    // Filter beasts by allowed families
    let availableBeasts = Object.values(magicBeastTypes).filter((beast) =>
      safeFamilies.includes(beast.family)
    );

    // Filter by rank restrictions
    const mobRankIndex = safeRanks.indexOf(mobRank);
    availableBeasts = availableBeasts.filter((beast) => {
      if (!beast.minRank) return true; // No restriction
      const minRankIndex = safeRanks.indexOf(beast.minRank);
      if (mobRankIndex < 0 || minRankIndex < 0) return true;
      return mobRankIndex >= minRankIndex; // Only if mob rank meets minimum
    });

    // Fallback: if no beasts available, return a generic beast
    if (availableBeasts.length === 0) {
      return { type: 'beast', name: 'Beast', family: 'beast', minRank: null };
    }

    // Randomly select from available beasts
    return availableBeasts[Math.floor(Math.random() * availableBeasts.length)];
  },

  _buildFallbackMobWave(dungeon, desiredCount = 1, context = 'spawn_guard') {
    const rankList = this.getDungeonRankList();
    const mobRank = dungeon?.rank || rankList[0] || 'E';
    const rankIndex = this.getRankIndexValue(mobRank, rankList);
    const baseStats = this.calculateMobBaseStats(rankIndex) || {};

    const baseStrength = Math.max(1, Math.floor(Number(baseStats.strength) || 100));
    const baseAgility = Math.max(0, Math.floor(Number(baseStats.agility) || 80));
    const baseIntelligence = Math.max(0, Math.floor(Number(baseStats.intelligence) || 60));
    const baseVitality = Math.max(1, Math.floor(Number(baseStats.vitality) || 150));
    const maxSpawn = this.clampNumber(Math.floor(Number(desiredCount) || 1), 1, 25);

    const safeFamilies =
      Array.isArray(dungeon?.beastFamilies) && dungeon.beastFamilies.length > 0
        ? dungeon.beastFamilies
        : this.getDefaultBeastFamilies();

    const fallbackMobs = [];
    const spawnedAt = Date.now();
    for (let i = 0; i < maxSpawn; i++) {
      const beast = this.selectMagicBeastType(safeFamilies, mobRank, rankList);
      const role = this.deriveMonsterRoleFromBeast(beast.type, beast.family);
      const hpVariance = 0.85 + Math.random() * 0.3;
      const hp = Math.max(1, Math.floor((220 + baseVitality * 12 + rankIndex * 90) * hpVariance));

      fallbackMobs.push({
        id: `mob_fallback_${spawnedAt}_${i}_${Math.random().toString(36).slice(2, 8)}`,
        rank: mobRank,
        beastType: beast.type,
        beastName: beast.name,
        beastFamily: beast.family,
        role,
        isMagicBeast: true,
        hp,
        maxHp: hp,
        lastAttackTime: 0,
        attackCooldown: 1800 + Math.random() * 1200,
        mobTier: 'normal',
        isElite: false,
        baseStats: {
          strength: baseStrength,
          agility: baseAgility,
          intelligence: baseIntelligence,
          vitality: baseVitality,
          perception: Math.max(10, Math.floor((baseStrength + baseAgility + baseIntelligence) * 0.25)),
        },
        strength: baseStrength,
        agility: baseAgility,
        intelligence: baseIntelligence,
        vitality: baseVitality,
        traits: {
          strengthMod: 1,
          agilityMod: 1,
          intelligenceMod: 1,
          vitalityMod: 1,
          hpMod: hpVariance,
        },
        extractionData: {
          dungeonRank: dungeon?.rank || mobRank,
          dungeonType: dungeon?.type || 'Recovered',
          biome: dungeon?.biome?.name || dungeon?.type || 'Recovered',
          beastFamilies: safeFamilies,
          spawnedAt,
          context,
        },
        description: `${mobRank}-rank ${beast.name} (fallback)`,
      });
    }

    return fallbackMobs;
  },

  _getMobActiveCap(dungeon) {
    // No artificial ceiling — dungeon's total mob capacity (from MOB_COUNT_BY_RANK) IS the cap.
    // E=50, SS=25000, SSS=50000, Shadow Monarch=1000000.
    const dungeonMobCapacity = Number(dungeon?.mobs?.mobCapacity);
    return Number.isFinite(dungeonMobCapacity) && dungeonMobCapacity > 0
      ? Math.max(50, Math.floor(dungeonMobCapacity))
      : 200; // Fallback for dungeons without capacity data
  },

  processMobSpawnQueue(channelKey) {
    const dungeon = this._getActiveDungeon(channelKey);
    if (!dungeon) {
      this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TRACE: processMobSpawnQueue(${channelKey}) — NO DUNGEON`);
      this._mobSpawnQueue.delete(channelKey);
      return 0;
    }

    // Hot-reload/cleanup safety: ensure mob containers exist before pushing.
    if (!dungeon.mobs || typeof dungeon.mobs !== 'object') dungeon.mobs = {};
    if (!Array.isArray(dungeon.mobs.activeMobs)) dungeon.mobs.activeMobs = [];

    const queuedMobs = this._mobSpawnQueue.get(channelKey);
    if (!queuedMobs || queuedMobs.length === 0) {
      this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TRACE: processMobSpawnQueue(${channelKey}) — EMPTY queue`);
      this._mobSpawnQueue.delete(channelKey);
      return 0;
    }

    // Queue hardening: ignore malformed placeholder entries so counters stay accurate.
    let validQueuedMobs = [];
    for (let i = 0; i < queuedMobs.length; i++) {
      const mob = queuedMobs[i];
      if (!mob || typeof mob !== 'object') continue;

      const hp = Number(mob.hp);
      const maxHp = Number(mob.maxHp);
      if (!Number.isFinite(hp) || hp <= 0 || !Number.isFinite(maxHp) || maxHp <= 0) continue;

      mob.hp = Math.max(1, Math.floor(hp));
      mob.maxHp = Math.max(mob.hp, Math.floor(maxHp));
      this.ensureMonsterRole(mob);
      validQueuedMobs.push(mob);
    }

    if (validQueuedMobs.length === 0) {
      const fallbackMobs = this._buildFallbackMobWave(
        dungeon,
        Math.max(1, Math.min(10, queuedMobs.length || 1)),
        'queue_invalid'
      );
      if (fallbackMobs.length > 0) {
        this._logSpawnPipelineGuard(
          channelKey,
          `queue invalid; substituting fallback wave (${fallbackMobs.length} mobs)`
        );
        validQueuedMobs = fallbackMobs;
      }
      if (validQueuedMobs.length === 0) {
        this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TRACE: processMobSpawnQueue(${channelKey}) — DROPPED invalid queued mobs (${queuedMobs.length})`);
        this._mobSpawnQueue.delete(channelKey);
        return 0;
      }
    }

    // Concurrent alive cap — flush up to remaining capacity, re-queue overflow
    const mobCap = this._getMobActiveCap(dungeon);
    let aliveMobs = 0;
    for (let i = 0; i < dungeon.mobs.activeMobs.length; i++) {
      dungeon.mobs.activeMobs[i]?.hp > 0 && aliveMobs++;
    }
    this._mobCleanupCache.set(channelKey, { alive: aliveMobs, time: Date.now() });
    const capacityRemaining = Math.max(0, mobCap - aliveMobs);
    if (capacityRemaining <= 0) {
      // Queue stays — will flush next tick when shadows kill some mobs
      this._mobSpawnQueue.set(channelKey, validQueuedMobs);
      return validQueuedMobs.length;
    }
    const mobsToFlush = validQueuedMobs.slice(0, capacityRemaining);
    const queuedOverflow =
      validQueuedMobs.length > mobsToFlush.length ? validQueuedMobs.slice(mobsToFlush.length) : [];
    const beforeCount = dungeon.mobs.activeMobs.length;
    // Batch append to activeMobs array (more efficient than individual pushes)
    dungeon.mobs.activeMobs.push(...mobsToFlush);
    dungeon.mobs.remaining += mobsToFlush.length;
    dungeon.mobs.total += mobsToFlush.length;
    this.settings.debug && console.log(
      `[Dungeons] MOB_SPAWN_TRACE: processMobSpawnQueue(${channelKey}) — FLUSHED ${mobsToFlush.length} mobs (activeMobs: ${beforeCount} → ${dungeon.mobs.activeMobs.length}, total=${dungeon.mobs.total}, queuedLeft=${queuedOverflow.length})`
    );

    // CRITICAL: Save mobs to dedicated database (cached for migration)
    if (this.mobBossStorageManager && mobsToFlush.length > 0) {
      this.mobBossStorageManager.enqueueMobs(mobsToFlush, channelKey).catch((error) => {
        this.errorLog('Failed to queue mobs for caching', error);
      });
    }

    if (queuedOverflow.length > 0) {
      this._mobSpawnQueue.set(channelKey, queuedOverflow);
    } else {
      this._mobSpawnQueue.delete(channelKey);
    }

    // Keep alive-count cache coherent for immediate retry flushes in the same second.
    this._mobCleanupCache.set(channelKey, {
      alive: aliveMobs + mobsToFlush.length,
      time: Date.now(),
    });

    // Update HP bar so mob count reflects in real-time
    this.queueHPBarUpdate(channelKey);
    return queuedOverflow.length;
  },

  spawnMobs(channelKey) {
    const dungeon = this._getActiveDungeon(channelKey);
    if (!dungeon) {
      this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TRACE: spawnMobs(${channelKey}) — NO DUNGEON, stopping`);
      this.stopMobSpawning(channelKey);
      return;
    }

    // Hot-reload/cleanup safety: ensure mob containers exist before iterating/appending.
    if (!dungeon.mobs || typeof dungeon.mobs !== 'object') dungeon.mobs = {};
    if (!Array.isArray(dungeon.mobs.activeMobs)) dungeon.mobs.activeMobs = [];

    // NO targetCount stop — mobs spawn continuously until boss dies.
    // mobCapacity is a CONCURRENT alive limit: as shadows kill mobs, new ones spawn to refill.
    if (dungeon.boss.hp > 0) {
      const dungeonRankIndex = this.getRankIndexValue(dungeon.rank);

      // Count alive mobs (cached when fresh, O(n) scan otherwise)
      let _aliveMobs = 0;
      const _mobCacheEntry = this._mobCleanupCache.get(channelKey);
      if (_mobCacheEntry && (Date.now() - _mobCacheEntry.time < 1000)) {
        _aliveMobs = _mobCacheEntry.alive || 0;
      } else {
        for (const mob of dungeon.mobs.activeMobs) {
          mob?.hp > 0 && _aliveMobs++;
        }
      }

      // Concurrent alive cap from MOB_COUNT_BY_RANK (E=50, Monarch=250k, etc.)
      const activeMobCap = this._getMobActiveCap(dungeon);

      // If alive mobs are at cap, skip this tick — wait for shadows to kill some
      if (_aliveMobs >= activeMobCap) {
        if (!this._mobCapWarningShown[channelKey]) {
          this.debugLog('MOB_CAP', 'Alive mobs at concurrent cap, waiting for kills', {
            channelKey, activeMobCap, alive: _aliveMobs, rank: dungeon.rank,
          });
          this._mobCapWarningShown[channelKey] = true;
          this._setTrackedTimeout(() => {
            if (this._mobCapWarningShown) delete this._mobCapWarningShown[channelKey];
          }, 30000);
        }
        return;
      }

      // Rank/capacity-aware wave sizing
      const { baseSpawnCount, variancePercent } = this.getMobWaveRuntimeConfig();
      const totalMobCapacity = Math.max(activeMobCap, Number(dungeon.mobs?.mobCapacity) || activeMobCap);
      const spawnFraction = 0.05 + dungeonRankIndex * 0.005;
      const rankCapacityBase = Math.floor(totalMobCapacity * spawnFraction);
      const effectiveBase = Math.max(
        Number.isFinite(baseSpawnCount) && baseSpawnCount > 0 ? baseSpawnCount : 1,
        rankCapacityBase
      );
      // Deficit-based scaling: spawn faster when more room, slower near cap
      const deficitRatio = activeMobCap > 0
        ? this.clampNumber((activeMobCap - _aliveMobs) / activeMobCap, 0, 1)
        : 0;
      const deficitBoost = 0.8 + deficitRatio * 0.6; // 0.8x near cap → 1.4x when empty
      const rankSpawnCap = Math.max(10, Math.min(50000, Math.floor(totalMobCapacity * 0.1)));
      const dynamicBaseSpawn = this.clampNumber(Math.floor(effectiveBase * deficitBoost), 1, rankSpawnCap);

      // Apply variance around dynamic target
      const variance = dynamicBaseSpawn * variancePercent;
      const plannedSpawn = this.clampNumber(
        Math.floor(dynamicBaseSpawn - variance + Math.random() * variance * 2),
        1,
        rankSpawnCap
      );

      // Clamp to remaining concurrent capacity (don't overshoot alive cap)
      const capacityRemaining = Math.max(0, activeMobCap - _aliveMobs);
      const actualSpawnCount = Math.max(1, Math.min(capacityRemaining, plannedSpawn));

      const pressureMobFactor = this.getShadowPressureMobFactor(dungeon);
      const pressureBucket = Math.round(pressureMobFactor * 100);
      const rankList = this.getDungeonRankList();

      // CRITICAL: Check cache first to prevent excessive generation (prevents crashes)
      const cacheKey = `${channelKey}_${dungeon.rank}_${actualSpawnCount}_${pressureBucket}`;
      const cached = this._mobGenerationCache.get(cacheKey);
      const now = Date.now();

      let newMobs;
      if (cached && now - cached.timestamp < this._mobCacheTTL) {
        // Use cached mobs (reuse generation to prevent crashes)
        const spawnedAt = Date.now();
        newMobs = [];
        for (let i = 0; i < cached.mobs.length; i++) {
          const mobTemplate = cached.mobs[i];
          if (!mobTemplate || typeof mobTemplate !== 'object') continue;
          const hp = Number(mobTemplate.hp);
          const maxHp = Number(mobTemplate.maxHp);
          if (!Number.isFinite(hp) || hp <= 0 || !Number.isFinite(maxHp) || maxHp <= 0) continue;

          const mob = {
            ...mobTemplate,
            id: `mob_${spawnedAt}_${this._mobIdCounter++}`, // New unique ID (counter is faster than random+toString(36))
            spawnedAt, // Update spawn time
          };
          mob.hp = Math.max(1, Math.floor(hp));
          mob.maxHp = Math.max(mob.hp, Math.floor(maxHp));
          this.ensureMonsterRole(mob);
          newMobs.push(mob);
        }
        // MOB_CACHE log stripped — spawning works, no need to trace
      } else {
        // Generate new mobs and cache them
        // BATCH MOB GENERATION with INDIVIDUAL VARIANCE
        // PERF: avoid Array.from allocation/closure in a hot path.
        const spawnedAt = Date.now();
        newMobs = [];
        for (let i = 0; i < actualSpawnCount; i++) {
          // Mob rank: dungeon rank ± 1 (can be 1 rank weaker, same, or 1 rank stronger)
          // Example: A rank dungeon → B, A, or S rank mobs
          const rankVariation = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
          const mobRankIndex = Math.max(
            0,
            Math.min(rankList.length - 1, dungeonRankIndex + rankVariation)
          );
          const mobRank = rankList[mobRankIndex] || dungeon.rank || rankList[0] || 'E';
          const mobTier = this._rollMobTier();
          const tierMultipliers = this._getMobTierMultipliers(mobTier);

          // MAGIC BEAST TYPE SELECTION (biome-based) — selected BEFORE stats so species weights apply
          const magicBeastType = this.selectMagicBeastType(
            dungeon.beastFamilies,
            mobRank,
            rankList
          );

          // Species stat weights — orcs hit harder, spiders are agile, golems are tanks, etc.
          const speciesWeights = C.BEAST_STAT_WEIGHTS?.[magicBeastType.type];
          const sw = speciesWeights || { strength: 1.0, agility: 1.0, intelligence: 1.0, vitality: 1.0 };

          // INDIVIDUAL MOB VARIANCE: Each mob is unique (85-115% stat variance)
          const strengthVariance = this._varianceWide();
          const agilityVariance = this._varianceWide();
          const intelligenceVariance = this._varianceWide();
          const vitalityVariance = this._varianceWide();

          // BASE STATS scaled by rank (using centralized calculation)
          const mobBaseStats = this.calculateMobBaseStats(mobRankIndex);

          // INDIVIDUAL STATS with species weight × variance × tier
          const mobStrength = Math.floor(mobBaseStats.strength * sw.strength * strengthVariance * tierMultipliers.statMultiplier);
          const mobAgility = Math.floor(mobBaseStats.agility * sw.agility * agilityVariance * tierMultipliers.statMultiplier);
          const mobIntelligence = Math.floor(
            mobBaseStats.intelligence * sw.intelligence * intelligenceVariance * tierMultipliers.statMultiplier
          );
          const mobVitality = Math.floor(mobBaseStats.vitality * sw.vitality * vitalityVariance * tierMultipliers.statMultiplier);

          // Mob HP scales on rank (multiplicative) + vitality (additive) with variance.
          // Uses UNWEIGHTED base vitality for HP — species weights differentiate combat
          // behavior (str/agi/int), not raw tankiness. Tanky species (golem 1.9×) would
          // be nearly unkillable if vitality weight also inflated HP.
          const mobRankHpFactor = this.getMobRankHpFactorByIndex(mobRankIndex);
          const baseHP =
            (200 + mobBaseStats.vitality * 15 + mobRankIndex * 100) *
            mobRankHpFactor *
            tierMultipliers.hpMultiplier *
            pressureMobFactor;
          const hpVariance = 0.7 + Math.random() * 0.3;
          const mobHP = Math.floor(baseHP * hpVariance);

          const finalMobHP = Math.max(1, mobHP);

          if (!Number.isFinite(finalMobHP) || finalMobHP <= 0) {
            this.errorLog?.('COMBAT', 'Invalid mob HP — skipping mob spawn', { finalMobHP });
            continue;
          }

          // Attack cooldown variance (some mobs attack faster than others)
          const cooldownVariance =
            (2000 + Math.random() * 2000) * tierMultipliers.cooldownMultiplier;

          // SHADOW ARMY COMPATIBLE STRUCTURE
          // Mobs store full stats compatible with shadow extraction system
          // When extracted, these stats transfer directly to shadow baseStats
          const mobRole = this.deriveMonsterRoleFromBeast(
            magicBeastType.type,
            magicBeastType.family
          );
          newMobs.push({
            // Core mob identity
            id: `mob_${spawnedAt}_${this._mobIdCounter++}`,
            rank: mobRank,

            // MAGIC BEAST IDENTITY (for shadow extraction)
            beastType: magicBeastType.type, // 'ant', 'dragon', 'naga', etc.
            beastName: magicBeastType.name, // 'Ant', 'Dragon', 'Naga', etc.
            beastFamily: magicBeastType.family, // 'insect', 'dragon', 'reptile', etc.
            role: mobRole,
            isMagicBeast: true, // All dungeon mobs are magic beasts

            // Combat stats (current HP)
            // HP calculated from vitality: 200 + VIT × 15 + rankIndex × 100 (with variance)
            hp: finalMobHP,
            maxHp: finalMobHP,
            lastAttackTime: 0,
            attackCooldown: cooldownVariance,
            mobTier,
            isElite: mobTier !== 'normal',

            // SHADOW-COMPATIBLE STATS (directly transferable to shadow.baseStats)
            baseStats: {
              strength: mobStrength,
              agility: mobAgility,
              intelligence: mobIntelligence,
              vitality: mobVitality,
              perception: Math.floor((50 + mobRankIndex * 20) * (sw.perception || 1.0) * this._varianceWide()),
            },

            // Root-level stats for combat calculations (mirrors baseStats for direct access)
            strength: mobStrength,
            agility: mobAgility,
            intelligence: mobIntelligence,
            vitality: mobVitality,

            // Individual variance modifiers (preserved during extraction)
            traits: {
              strengthMod: strengthVariance,
              agilityMod: agilityVariance,
              intelligenceMod: intelligenceVariance,
              vitalityMod: vitalityVariance,
              hpMod: hpVariance,
            },

            // Extraction metadata (used when converting to shadow)
            extractionData: {
              dungeonRank: dungeon.rank,
              dungeonType: dungeon.type,
              biome: dungeon.biome?.name || dungeon.type || 'Unknown',
              beastFamilies: dungeon.beastFamilies,
              spawnedAt,
            },

            // Magic beast description (for display/debugging)
            description: `${mobRank}-rank ${magicBeastType.name} (${mobTier}) from ${dungeon.biome?.name || dungeon.type || 'Unknown'}`,
          });
        }

        if (newMobs.length === 0) {
          this.errorLog?.('COMBAT', 'Mob generation produced no valid mobs; skipping spawn wave', {
            channelKey,
            actualSpawnCount,
            pressureMobFactor,
          });
        }

        // Cache generated mobs (template for future spawns to prevent crashes)
        const mobTemplates = new Array(newMobs.length);
        for (let i = 0; i < newMobs.length; i++) {
          const m = newMobs[i];
          mobTemplates[i] = {
            ...m,
            id: undefined, // Remove ID for template
            spawnedAt: undefined, // Remove timestamp for template
          };
        }
        this._mobGenerationCache.set(cacheKey, { mobs: mobTemplates, timestamp: now });

        // Limit cache size to prevent memory issues
        if (this._mobGenerationCache.size > 50) {
          const firstKey = this._mobGenerationCache.keys().next().value;
          this._mobGenerationCache.delete(firstKey);
        }
      }

      if (!newMobs || newMobs.length === 0) {
        const fallbackMobs = this._buildFallbackMobWave(
          dungeon,
          Math.max(1, Math.min(actualSpawnCount || 1, 12)),
          'generation_empty'
        );
        if (fallbackMobs.length > 0) {
          this._logSpawnPipelineGuard(
            channelKey,
            `empty generation; injected fallback wave (${fallbackMobs.length})`
          );
          newMobs = fallbackMobs;
          if (cached) this._mobGenerationCache.delete(cacheKey);
        } else {
          this.errorLog?.('COMBAT', 'No valid mobs available after generation/cache pass; skipping spawn wave', {
            channelKey,
            cacheKey,
            fromCache: !!cached,
          });
          if (cached) this._mobGenerationCache.delete(cacheKey);
          return;
        }
      }

      // Generated mobs log stripped — FLUSHING log in processMobSpawnQueue covers this

      // PERFORMANCE: Queue mobs for batched spawning (250-500ms) to smooth DOM updates and reduce GC churn
      if (!this._mobSpawnQueue.has(channelKey)) {
        this._mobSpawnQueue.set(channelKey, []);
      }
      this._mobSpawnQueue.get(channelKey).push(...newMobs);

      // Schedule batch processing via global spawn loop (no per-dungeon timers)
      if (!this._mobSpawnQueueNextAt.has(channelKey)) {
        const batchDelay = 250 + Math.random() * 250; // 250-500ms random delay
        this._mobSpawnQueueNextAt.set(channelKey, Date.now() + batchDelay);
        // Batch flush scheduled log stripped — covered by FLUSHING log
        this._ensureMobSpawnLoop();
      }

      if (!dungeon.spawnWaveCount) dungeon.spawnWaveCount = 0;
      dungeon.spawnWaveCount++;
    } else {
      // Boss is dead, stop spawning
      this.settings.debug && console.log(`[Dungeons] MOB_SPAWN_TRACE: spawnMobs(${channelKey}) — BOSS DEAD (hp=${dungeon.boss?.hp}), stopping`);
      this.stopMobSpawning(channelKey);
    }
  }
};
