/**
 * ShadowArmy — Extraction pipeline: message listener, shadow extraction, dungeon extraction.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./extraction'))
 */
const SLEvents = require('../shared/event-bus');
const { getPluginInstance, getSkillTreeLevel } = require('../shared/plugin-bridge');

module.exports = {
  // SHADOW ARMY CAPACITY — Lore-Accurate Cap Enforcement

  /**
   * Calculate shadow army capacity for a given player rank + intelligence.
   * Formula: cap = baseCap + floor(sqrt(intelligence) × intScale)
   * Shadow Monarch = Infinity (limitless). E-rank = 0 (no extraction skill).
   */
  getShadowArmyCap(playerRank, intelligence = 0) {
    const entry = this.shadowArmyCapacity?.[playerRank];
    if (!entry) return 0;

    const base = entry.base;
    if (base === Infinity) return Infinity;
    if (!Number.isFinite(base)) return 0;

    const intScale = Number(entry.intScale) || 0;
    const safeInt = Math.max(0, Number(intelligence) || 0);
    return base + Math.floor(Math.sqrt(safeInt) * intScale);
  },

  /**
   * Check if the army is at or over capacity for the current player rank + INT.
   * Returns { atCap, currentCount, cap, overBy }.
   * Grandfathered shadows (existing over-cap) are NOT deleted — only new extractions are blocked.
   */
  async checkShadowArmyCap() {
    const soloData = this.getSoloLevelingData();
    const playerRank = soloData?.rank || 'E';
    const intelligence = soloData?.stats?.intelligence || 0;
    const cap = this.getShadowArmyCap(playerRank, intelligence);

    if (cap === Infinity) {
      // No IDB read needed — no caller uses currentCount when atCap is always false
      return { atCap: false, currentCount: 0, cap: Infinity, overBy: 0 };
    }

    let currentCount = 0;
    if (this.storageManager && typeof this.storageManager.getTotalCount === 'function') {
      try {
        currentCount = await this.storageManager.getTotalCount();
      } catch (e) {
        this.debugError('CAP_CHECK', 'Failed to get shadow count', e);
        // Safe default: block extraction rather than allow unlimited extraction on IDB error
        return { atCap: true, currentCount: 0, cap, overBy: 0 };
      }
    }

    const overBy = Math.max(0, currentCount - cap);
    return { atCap: currentCount >= cap, currentCount, cap, overBy };
  },

  // SOLO LEVELING INTEGRATION

  integrateWithSoloLeveling() {
    try {
      this.soloPlugin = getPluginInstance('SoloLevelingStats');
      if (!this.soloPlugin) {
        this.debugLog('INTEGRATION', 'SoloLevelingStats plugin not enabled or not found');
      }
    } catch (error) {
      this.debugError(
        'INTEGRATION',
        'Failed to integrate with SoloLevelingStats via BdApi.Plugins',
        error
      );
      this.soloPlugin = null;
    }
  },

  getSoloLevelingData() {
    const now = Date.now();
    if (
      this._soloDataCache &&
      this._soloDataCacheTime &&
      now - this._soloDataCacheTime < this._soloDataCacheTTL
    ) {
      return this._soloDataCache;
    }

    if (!this.soloPlugin) {
      this.integrateWithSoloLeveling();
    }
    if (!this.soloPlugin) {
      this._soloDataCache = null;
      this._soloDataCacheTime = 0;
      return null;
    }

    const instance = this.soloPlugin;
    if (!instance || !instance.settings) {
      this._soloDataCache = null;
      this._soloDataCacheTime = 0;
      return null;
    }

    const soloData = {
      rank: instance.settings.rank || 'E',
      level: instance.settings.level || 1,
      stats: instance.settings.stats || {},
      intelligence: instance.settings.stats?.intelligence || 0,
    };

    this._soloDataCache = soloData;
    this._soloDataCacheTime = now;

    return soloData;
  },

  // SKILLTREE GATING

  /**
   * Check if a SkillTree passive skill is unlocked (level >= 1).
   * @param {string} skillId - Skill ID to check
   * @returns {boolean}
   */
  _isSkillTreeSkillUnlocked(skillId) {
    return getSkillTreeLevel(skillId) >= 1;
  },

  _getSkillTreeBonuses() {
    try {
      const instance = getPluginInstance('SkillTree');
      if (!instance || typeof instance.calculateSkillBonuses !== 'function') return null;
      return instance.calculateSkillBonuses();
    } catch {
      return null;
    }
  },

  _hasGuaranteedArise() {
    const bonuses = this._getSkillTreeBonuses();
    return bonuses && bonuses.ariseChanceOverride >= 1.0;
  },

  /**
   * Get the Shadow Monarch's (user's) combat strength.
   * Used to cap shadow growth — no shadow may exceed the monarch.
   * Mirrors calculateShadowStrength: sum of all stats.
   * @returns {number} Monarch strength, or 0 if unavailable
   */
  _getMonarchStrength() {
    const soloData = this.getSoloLevelingData();
    if (!soloData || !soloData.stats) return 0;
    const stats = soloData.stats;
    const total = (stats.strength || 0) + (stats.agility || 0) +
      (stats.intelligence || 0) + (stats.vitality || 0) + (stats.perception || 0);
    return Math.floor(total);
  },

  // SHADOW EXTRACTION PIPELINE

  /**
   * Message-based extraction (humanoid shadows only, no magic beasts).
   * Rate-limited, checks SoloLevelingStats data, up to 3 attempts.
   * @returns {Object|null} Extracted shadow or null
   */
  async attemptShadowExtraction() {
    if (!this._isSkillTreeSkillUnlocked('shadow_extraction')) return null;

    const soloData = this.getSoloLevelingData();
    if (!soloData) return null;

    // Shadow army capacity check — block new extractions when at/over cap
    const capStatus = await this.checkShadowArmyCap();
    if (capStatus.atCap) {
      this.debugLog('EXTRACTION', 'Shadow army at capacity, extraction blocked', {
        current: capStatus.currentCount, cap: capStatus.cap, overBy: capStatus.overBy,
      });
      return null;
    }

    const { rank, level, stats } = soloData;
    const intelligence = stats.intelligence || 0;
    const perception = stats.perception || 0;
    const strength = stats.strength || 0;

    // Rate limiting
    const now = Date.now();
    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;
    const maxPerMinute = cfg.maxExtractionsPerMinute || 3;
    // SHADOW MONARCH PERK (player-exclusive): guaranteed Arise — no per-minute cap
    // (the Monarch raises any fallen at will). Chance is forced to 100% in
    // calculateExtractionChance.
    const isShadowMonarch = this.getSoloLevelingData()?.rank === 'Shadow Monarch';

    if (!this._extractionTimestamps) {
      this._extractionTimestamps = [];
    }
    this._extractionTimestamps = this._extractionTimestamps.filter(
      (timestamp) => now - timestamp < 60000
    );
    if (!isShadowMonarch && this._extractionTimestamps.length >= maxPerMinute) {
      return null;
    }

    // Determine target rank (can extract same rank or 1 rank above).
    // Shadow Monarch is the PLAYER's exclusive rank — shadows cap at Monarch+, so
    // SM is never extractable (slice end is exclusive of the Shadow Monarch index).
    const rankIndex = this.shadowRanks.indexOf(rank);
    const smIdx = this.shadowRanks.indexOf('Shadow Monarch');
    const rankCeil = smIdx > 0 ? smIdx : this.shadowRanks.length;
    const availableRanks = this.shadowRanks.slice(
      0,
      Math.min(rankIndex + 2, rankCeil)
    );
    const targetRank = this._pickRandom(availableRanks) || rank;

    // Preflight chance preview for diagnostics
    const targetRankMultiplier = this.rankStatMultipliers[targetRank] || 1.0;
    const targetBaselineStats = this.getRankBaselineStats(targetRank, targetRankMultiplier);
    const estimatedTargetStrength = this.calculateShadowStrength(targetBaselineStats, 1);
    const extractionChancePreview = this.calculateExtractionChance(
      rank, stats, targetRank, estimatedTargetStrength,
      intelligence, perception, strength, false
    );

    this.debugLog('MESSAGE_EXTRACTION', 'Message extraction preflight', {
      extractionChancePreview: (extractionChancePreview * 100).toFixed(2) + '%',
      intelligence, perception, strength, rank, targetRank, estimatedTargetStrength,
    });

    const extractedShadow = await this.attemptExtractionWithRetries(
      rank, level, stats, targetRank,
      null, null,
      false, // skipCap
      false, // fromDungeon
      null,  // beastFamilies
      3      // maxAttempts
    );

    if (extractedShadow) {
      this._extractionTimestamps.push(now);
      this.debugLog('MESSAGE_EXTRACTION', 'Shadow extracted from message', {
        rank: extractedShadow.rank,
        role: extractedShadow.role,
        strength: extractedShadow.strength,
        id: extractedShadow.id,
      });
    }

    return extractedShadow;
  },

  _getAvailableDungeonBeastRoles(rank, beastFamilies = null) {
    // PERF: Use pre-computed beast role lists instead of filtering Object.keys on every call
    if (!this._allBeastRoleKeys) {
      this._allBeastRoleKeys = Object.keys(this.shadowRoles).filter(k => this.shadowRoles[k].isMagicBeast);
      this._baseBeastRoleKeys = this._allBeastRoleKeys.filter(k => !this.shadowRoles[k].minRank);
    }

    let availableBeastRoles = this._allBeastRoleKeys;

    if (beastFamilies && beastFamilies.length > 0) {
      availableBeastRoles = availableBeastRoles.filter((key) => {
        const beast = this.shadowRoles[key];
        return beastFamilies.includes(beast.family);
      });
    }

    const rankIndex = this.shadowRanks.indexOf(rank);
    availableBeastRoles = availableBeastRoles.filter((key) => {
      const beast = this.shadowRoles[key];
      if (!beast.minRank) return true;
      const minRankIndex = this.shadowRanks.indexOf(beast.minRank);
      return rankIndex >= minRankIndex;
    });

    if (availableBeastRoles.length === 0) {
      availableBeastRoles = this._baseBeastRoleKeys;
    }

    return availableBeastRoles;
  },

  async _persistShadowToSettingsFallback(shadow, attemptNum, reasonLabel) {
    const shadowId = shadow ? this.getCacheKey?.(shadow) || shadow.id || shadow.i : null;
    this.debugError('STORAGE', 'Shadow extraction cannot persist without Shadow Preservation storage', {
      attemptNum,
      reasonLabel,
      shadowId,
      shadowRank: shadow?.rank,
      shadowRole: shadow?.role,
    });

    try {
      this._toast?.('Shadow extraction failed: Shadow Preservation storage unavailable.', 'error');
    } catch (_) {}

    return null;
  },

  /**
   * Attempt extraction with retry logic.
   * Generates shadow, calculates chance, rolls RNG up to maxAttempts times.
   * If successful, saves to IDB (or falls back to settings).
   */
  async attemptExtractionWithRetries(
    userRank,
    userLevel,
    userStats,
    targetRank,
    targetStats = null,
    targetStrength = null,
    skipCap = false,
    fromDungeon = false,
    beastFamilies = null,
    maxAttempts = 3,
    showAnimation = true,
    guaranteedExtraction = false,
    sameRankBoost = false,
    corpse = null
  ) {
    // Hot-reload safety
    const getShadowKey = (shadow) =>
      typeof this.getCacheKey === 'function'
        ? this.getCacheKey(shadow)
        : shadow?.id || shadow?.i || null;

    // Generate shadow
    let shadow;
    if (targetStats && targetStrength != null) {
      let roleKey;
      if (fromDungeon) {
        const availableBeastRoles = this._getAvailableDungeonBeastRoles(targetRank, beastFamilies);
        roleKey = this._pickRandom(availableBeastRoles);
      } else {
        const humanoidRoles = Object.keys(this.shadowRoles).filter(
          (key) => !this.shadowRoles[key].isMagicBeast
        );
        roleKey = this._pickRandom(humanoidRoles);
      }
      if (!roleKey) {
        roleKey = this._pickRandom(Object.keys(this.shadowRoles)) || 'knight';
      }
      const role = this.shadowRoles[roleKey] || this.shadowRoles.knight || { name: roleKey };

      const calculatedStrength =
        targetStrength || (targetStats ? this.calculateShadowPower(targetStats, 1) : 0);

      shadow = {
        id: `shadow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        rank: targetRank,
        role: roleKey,
        roleName: role.name,
        beastType: corpse?.beastType || null,
        beastFamily: corpse?.beastFamily || null,
        strength: calculatedStrength,
        extractedAt: Date.now(),
        level: 1,
        xp: 0,
        baseStats: targetStats,
        growthStats: this.createZeroStatBlock(),
        naturalGrowthStats: this.createZeroStatBlock(),
        totalCombatTime: 0,
        lastNaturalGrowth: Date.now(),
        ownerLevelAtExtraction: userLevel,
        growthVarianceSeed: Math.random(),
      };
    } else {
      shadow = this.generateShadow(targetRank, userLevel, userStats);
      targetStrength = shadow.strength;
      targetStats = shadow.baseStats;
    }

    if (!shadow) {
      this.debugError('EXTRACTION_RETRIES', 'Shadow generation failed - shadow is null/undefined', {
        targetRank, userLevel, hasUserStats: !!userStats,
      });
      return null;
    }

    const intelligence = userStats?.intelligence || 0;
    const perception = userStats?.perception || 0;
    const strength = userStats?.strength || 0;

    for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
      this.debugLog('EXTRACTION_RETRIES', `Attempt ${attemptNum}/${maxAttempts} - Starting extraction`, {
        attemptNum, maxAttempts, targetRank, targetStrength, userRank, skipCap,
        intelligence, perception, strength,
      });

      // True Shadow Monarch: 100% arise chance override
      const monarchGuaranteed = guaranteedExtraction || this._hasGuaranteedArise();

      // Tier 1: Guaranteed extraction
      if (monarchGuaranteed) {
        this.debugLog('EXTRACTION_RETRIES', `Attempt ${attemptNum} - Guaranteed extraction (user outranks mob)`, {
          attemptNum, targetRank, guaranteedExtraction: true,
        });
      } else {
        const extractionChance = this.calculateExtractionChance(
          userRank, userStats, targetRank, targetStrength,
          intelligence, perception, strength, skipCap
        );

        // Tier 2: Same-rank boost (floor of 85%)
        const effectiveChance = sameRankBoost
          ? Math.max(0.85, extractionChance)
          : extractionChance;

        const roll = Math.random();

        this.debugLog('EXTRACTION_RETRIES', `Attempt ${attemptNum} - Extraction roll`, {
          attemptNum,
          baseChance: (extractionChance * 100).toFixed(2) + '%',
          effectiveChance: (effectiveChance * 100).toFixed(2) + '%',
          sameRankBoost,
          roll: (roll * 100).toFixed(2) + '%',
          success: roll < effectiveChance,
        });

        if (roll >= effectiveChance) {
          this.debugLog('EXTRACTION_RETRIES',
            `Attempt ${attemptNum} - Roll failed${sameRankBoost ? ' (same-rank boosted)' : ''}, trying next attempt`,
            { attemptNum, sameRankBoost }
          );
          continue;
        }
      }

      // Extraction succeeded
      {
        this.debugLog('EXTRACTION_RETRIES', `Attempt ${attemptNum} - Roll succeeded, attempting to save shadow`, {
          attemptNum, shadowExists: !!shadow,
          shadowId: getShadowKey(shadow), shadowRank: shadow?.rank, shadowRole: shadow?.role,
        });

        if (!shadow) {
          this.debugError('EXTRACTION_RETRIES', `Attempt ${attemptNum} - Shadow is null/undefined`, { attemptNum });
          continue;
        }

        const shadowId = getShadowKey(shadow);

        if (this.storageManager && this._isSkillTreeSkillUnlocked('shadow_preservation')) {
          try {
            // Ensure shadow has strength calculated before saving
            if (!shadow.strength || shadow.strength === 0) {
              const decompressed = this.getShadowData(shadow);
              const effective = this.getShadowEffectiveStats(decompressed);
              if (effective) {
                shadow.strength = this.calculateShadowPower(effective, 1);
                this.debugLog('EXTRACTION', 'Calculated missing strength before save', {
                  shadowId, calculatedStrength: shadow.strength,
                });
              }
            }

            const shadowToSave = this.prepareShadowForSave(shadow);
            await this.storageManager.saveShadow(shadowToSave);
            this._invalidateSnapshot();
            // Inline cache invalidation — avoids racing the +300ms widget refresh
            // that a deferred setTimeout would cause.
            this._armyStatsCache = null;
            this._armyStatsCacheTime = null;

            // INCREMENTAL CACHE: Update total power cache
            await this.incrementTotalPower(shadowToSave);

            this.debugLog('EXTRACTION', 'Shadow saved to IndexedDB', {
              shadowId, rank: shadow.rank, role: shadow.role,
              strength: shadow.strength, shadowToSaveStrength: shadowToSave.strength,
            });

            // Verify save
            let newCount = 0;
            if (this.storageManager && typeof this.storageManager.getTotalCount === 'function') {
              try {
                newCount = await this.storageManager.getTotalCount();
              } catch (countError) {
                this.debugError('EXTRACTION', 'Failed to get total count after save', countError);
              }
            }

            this.debugLog('EXTRACTION', 'Shadow saved successfully', {
              totalCount: newCount,
              shadowId: getShadowKey(shadow),
              shadowRank: shadow.rank,
              shadowRole: shadow.role,
            });

            // Emit events for other plugins
            const eventData = {
              shadowId: getShadowKey(shadow),
              shadowCount: newCount,
              shadowRank: shadow.rank,
              shadowRole: shadow.role,
              timestamp: Date.now(),
            };

            try {
              SLEvents.emit('ShadowArmy:shadowExtracted', eventData);
            } catch (error) {
              this.debugError('EXTRACTION', 'Failed to emit event', error);
            }

            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
              try {
                const domEvent = new CustomEvent('shadowExtracted', {
                  detail: eventData,
                  bubbles: true,
                });
                document.dispatchEvent(domEvent);
              } catch (error) {
                this.debugError('EXTRACTION', 'Failed to emit DOM event', error);
              }
            }

            this._toast(
              `Shadow Extracted: ${shadow.rank}-Rank ${shadow.roleName || shadow.role}`,
              "success"
            );

            // PERF: Coalesced widget refresh
            this._widgetDirty = true;
            this.scheduleWidgetRefresh({ reason: 'single_extraction', delayMs: 300 });

            // Show extraction animation (only for messages and bosses, not mobs)
            if (showAnimation) {
              this.showExtractionAnimation(shadow);
            }

            // Update counters
            const now = Date.now();
            this.settings.totalShadowsExtracted++;
            this.settings.lastExtractionTime = now;

            // Grant XP
            const extractedShadowId = shadow?.id || shadow?.i;
            await this.grantShadowXP(2, 'extraction', extractedShadowId ? [String(extractedShadowId)] : null, {
              skipPowerRecalc: true,
            });

            this.saveSettings();

            // Force recalculation of aggregated power
            if (
              this.storageManager &&
              typeof this.storageManager.getAggregatedPower === 'function'
            ) {
              try {
                const soloData = this.getSoloLevelingData();
                const resolvedRank = soloData?.rank || 'E';
                this.debugLog('TOTAL_POWER_UPDATE', 'Forcing aggregated power recalculation after shadow extraction', {
                  resolvedRank, shadowRanks: this.shadowRanks,
                });
                const result = await this.storageManager.getAggregatedPower(
                  resolvedRank, this.shadowRanks
                );
                this.debugLog('TOTAL_POWER_UPDATE', 'Aggregated power recalculation completed', {
                  totalPower: result?.totalPower || 0,
                  totalCount: result?.totalCount || 0,
                });
              } catch (error) {
                this.debugError('TOTAL_POWER_UPDATE', 'Failed to recalculate aggregated power', error);
              }
            }

            // Invalidate shadow power cache for this specific shadow
            if (this._shadowPowerCache) {
              this.invalidateShadowPowerCache(shadowToSave);
            }

            this.debugLog('TOTAL_POWER_UPDATE', 'Invalidated full stats cache after extraction');

            this.debugLog('EXTRACTION_RETRIES', `Attempt ${attemptNum} - Shadow extraction completed successfully`, {
              attemptNum,
              shadowId: this.getCacheKey(shadow),
              shadowRank: shadow.rank,
              shadowRole: shadow.role,
              shadowStrength: shadow.strength,
              totalPowerRecalculated: true,
              cacheInvalidated: true,
            });

            this.updateUI();
            return shadow; // SUCCESS
          } catch (error) {
            this.debugError('EXTRACTION_RETRIES', `Attempt ${attemptNum} - Failed to save shadow to IndexedDB`, error);
            return this._persistShadowToSettingsFallback(shadow, attemptNum, 'IndexedDB save failed');
          }
        } else {
          this.debugError('EXTRACTION_RETRIES', 'Shadow extraction blocked because durable storage is unavailable', {
            attemptNum, shadowId: this.getCacheKey(shadow),
          });
          return this._persistShadowToSettingsFallback(shadow, attemptNum, 'Storage manager or Shadow Preservation unavailable');
        }
      }
    }

    // All attempts failed
    return null;
  },

  // DUNGEON EXTRACTION

  /**
   * Attempt shadow extraction from dungeon mob or boss.
   * Bosses: 3 retries. Mobs: 1 attempt (or guaranteed if user outranks).
   */
  async attemptDungeonExtraction(
    bossId, userRank, userLevel, userStats,
    mobRank, mobStats, mobStrength,
    beastFamilies = null, isBoss = true
  ) {
    // SkillTree gate: shadow_extraction must be unlocked
    if (!this._isSkillTreeSkillUnlocked('shadow_extraction')) {
      return { success: false, shadow: null, error: 'Shadow Extraction skill not unlocked' };
    }

    // Shadow army capacity check — block new extractions when at/over cap
    const capStatus = await this.checkShadowArmyCap();
    if (capStatus.atCap) {
      const capLabel = capStatus.cap === Infinity ? 'unlimited' : capStatus.cap.toLocaleString();
      return {
        success: false, shadow: null,
        error: `Shadow army at capacity (${capStatus.currentCount.toLocaleString()}/${capLabel}). Rank up or release shadows.`,
      };
    }

    // Boss attempt limit check
    if (isBoss) {
      const canExtract = this.canExtractFromBoss(bossId);
      if (!canExtract.allowed) {
        return {
          success: false, shadow: null,
          error: canExtract.reason, attemptsRemaining: canExtract.attemptsRemaining,
        };
      }
    }

    // Rank-based extraction tier
    const userRankIdx = this.shadowRanks.indexOf(userRank);
    const mobRankIdx = this.shadowRanks.indexOf(mobRank);
    const rankDiff = mobRankIdx - userRankIdx;

    let dungeonAutoArise = false;
    let maxAttempts = 1;

    if (isBoss) {
      dungeonAutoArise = false;
      maxAttempts = 3;
    } else if (rankDiff < 0) {
      dungeonAutoArise = true;
      maxAttempts = 1;
    } else if (rankDiff === 0) {
      dungeonAutoArise = false;
      maxAttempts = 2;
    } else {
      dungeonAutoArise = false;
      maxAttempts = 1;
    }

    this.debugLog('DUNGEON_EXTRACTION', `Rank comparison: User[${userRank}] vs Mob[${mobRank}]`, {
      userRankIdx, mobRankIdx, rankDiff, dungeonAutoArise, maxAttempts, isBoss,
      tier: dungeonAutoArise ? 'GUARANTEED' : rankDiff === 0 ? 'SAME_RANK_BOOSTED' : rankDiff > 0 ? 'HIGHER_MOB_RNG' : 'BOSS_RNG',
    });

    const extractedShadow = await this.attemptExtractionWithRetries(
      userRank, userLevel, userStats,
      mobRank, mobStats, mobStrength,
      true,  // skipCap
      true,  // fromDungeon
      beastFamilies,
      maxAttempts,
      isBoss,                       // showAnimation
      dungeonAutoArise,             // guaranteedExtraction
      rankDiff === 0 && !isBoss    // sameRankBoost
    );

    if (isBoss) {
      this.recordBossExtractionAttempt(bossId, extractedShadow !== null);
    }

    return {
      success: extractedShadow !== null,
      shadow: extractedShadow,
      error: extractedShadow ? null : 'Extraction failed',
      attemptsRemaining: isBoss ? this.getBossAttemptsRemaining(bossId) : 0,
    };
  },

  /**
   * Streaming bulk extraction for dungeon corpse piles.
   * Processes corpses in bounded chunks with tiny IDB write batches.
   * Peak memory stays flat regardless of pile size.
   */
  async bulkDungeonExtraction(corpsePile, userRank, userLevel, userStats, beastFamilies = []) {
    if (!this._isSkillTreeSkillUnlocked('shadow_extraction')) {
      return { extracted: 0, attempted: 0, error: 'Shadow Extraction skill not unlocked' };
    }
    if (!corpsePile || corpsePile.length === 0) {
      return { extracted: 0, attempted: 0 };
    }

    // Shadow army capacity — limit bulk extraction to remaining slots
    const capStatus = await this.checkShadowArmyCap();
    if (capStatus.atCap) {
      this.debugLog('ARISE', 'Shadow army at capacity, bulk extraction blocked', capStatus);
      this._toast?.(
        `Shadow army at capacity (${capStatus.currentCount.toLocaleString()}/${capStatus.cap.toLocaleString()}). Rank up or release shadows to extract more.`,
        'warning'
      );
      return { extracted: 0, attempted: 0, error: 'Shadow army at capacity' };
    }

    // Cap the corpse pile to remaining capacity (don't process more than we can store)
    const remainingSlots = capStatus.cap === Infinity ? corpsePile.length : Math.max(0, capStatus.cap - capStatus.currentCount);
    if (remainingSlots < corpsePile.length) {
      this.debugLog('ARISE', `Capping bulk extraction to ${remainingSlots} remaining slots (${corpsePile.length} corpses available)`);
      corpsePile = corpsePile.slice(0, remainingSlots);
    }

    const total = corpsePile.length;
    const tuning = (() => {
      if (total >= 20000) {
        return { corpseChunkSize: 12, writeChunkSize: 4, chunkYieldMs: 3, profile: 'extreme_safe' };
      }
      if (total >= 10000) {
        return { corpseChunkSize: 18, writeChunkSize: 6, chunkYieldMs: 2, profile: 'high_safe' };
      }
      if (total >= 5000) {
        return { corpseChunkSize: 25, writeChunkSize: 8, chunkYieldMs: 1, profile: 'balanced' };
      }
      return { corpseChunkSize: 35, writeChunkSize: 10, chunkYieldMs: 0, profile: 'fast' };
    })();
    const CORPSE_CHUNK_SIZE = tuning.corpseChunkSize;
    const WRITE_CHUNK_SIZE = tuning.writeChunkSize;
    const CHUNK_YIELD_MS = tuning.chunkYieldMs;
    let totalExtracted = 0;
    let totalAttempted = 0;
    let totalPowerDelta = 0;
    const rankCounts = {};
    const extractedShadowIds = [];

    const userRankIdx = this.shadowRanks.indexOf(userRank);
    const intelligence = userStats?.intelligence || 0;
    const perception = userStats?.perception || 0;
    const strength = userStats?.strength || 0;

    this.debugLog('ARISE', `ARISE STREAM: Starting extraction of ${total} corpses ` +
      `(profile=${tuning.profile}, corpseChunk=${CORPSE_CHUNK_SIZE}, writeChunk=${WRITE_CHUNK_SIZE}, yield=${CHUNK_YIELD_MS}ms)`);

    // STREAMING PIPELINE: Process corpses in bounded chunks
    for (let i = 0; i < total; i += CORPSE_CHUNK_SIZE) {
      // Honor stop() between chunks. Without this, a stop() landing
      // mid-loop kept iterating across thousands of corpses, writing
      // to IDB against a torn-down plugin instance.
      if (this._isStopped) {
        this.debugLog('ARISE', `ARISE STREAM aborted: plugin stopped at chunk ${Math.floor(i / CORPSE_CHUNK_SIZE) + 1}`);
        break;
      }
      const chunk = corpsePile.slice(i, Math.min(i + CORPSE_CHUNK_SIZE, total));
      const chunkShadows = [];

      // RNG + shadow generation for this chunk (pure JS, no IDB)
      for (const corpse of chunk) {
        totalAttempted++;

        const mobRank = corpse.rank || 'E';
        const mobRankIdx = this.shadowRanks.indexOf(mobRank);
        const rankDiff = mobRankIdx - userRankIdx;
        const isBoss = !!corpse.isBoss;

        if (isBoss) {
          const canExtract = this.canExtractFromBoss(corpse.id);
          if (!canExtract.allowed) continue;
        }

        let guaranteedExtraction = false;
        let maxAttempts = 1;
        let sameRankBoost = false;

        if (isBoss) {
          maxAttempts = 3;
        } else if (rankDiff < 0) {
          guaranteedExtraction = true;
        } else if (rankDiff === 0) {
          maxAttempts = 2;
          sameRankBoost = true;
        }

        // Generate shadow (pure JS)
        let shadow;
        if (corpse.baseStats && corpse.strength != null) {
          const availableBeastRoles = this._getAvailableDungeonBeastRoles(mobRank, beastFamilies);
          const roleKey = this._pickRandom(availableBeastRoles) || 'wolf';
          const role = this.shadowRoles[roleKey] || this.shadowRoles.knight || { name: roleKey };
          const calculatedStrength = corpse.strength || (corpse.baseStats ? this.calculateShadowPower(corpse.baseStats, 1) : 0);

          // PERF: Single Date.now() per shadow instead of 3 calls
          const _now = Date.now();
          shadow = {
            id: `shadow_${_now}_${Math.random().toString(36).substring(2, 11)}`,
            rank: mobRank,
            role: roleKey,
            roleName: role.name,
            beastType: corpse.beastType || null,
            beastFamily: corpse.beastFamily || null,
            strength: calculatedStrength,
            extractedAt: _now,
            level: 1,
            xp: 0,
            baseStats: corpse.baseStats,
            growthStats: this.createZeroStatBlock(),
            naturalGrowthStats: this.createZeroStatBlock(),
            totalCombatTime: 0,
            lastNaturalGrowth: _now,
            ownerLevelAtExtraction: userLevel,
            growthVarianceSeed: Math.random(),
          };
        } else {
          shadow = this.generateShadow(mobRank, userLevel, userStats);
        }

        if (!shadow) continue;

        // RNG extraction roll (True Shadow Monarch overrides to 100%)
        const monarchOverride = guaranteedExtraction || this._hasGuaranteedArise();
        let extracted = false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (monarchOverride) { extracted = true; break; }
          const extractionChance = this.calculateExtractionChance(
            userRank, userStats, mobRank,
            shadow.strength || corpse.strength,
            intelligence, perception, strength, true
          );
          const effectiveChance = sameRankBoost ? Math.max(0.85, extractionChance) : extractionChance;
          if (Math.random() < effectiveChance) { extracted = true; break; }
        }

        if (!extracted) continue;

        // Ensure strength
        if (!shadow.strength || shadow.strength === 0) {
          const decompressed = this.getShadowData(shadow);
          const effective = this.getShadowEffectiveStats(decompressed);
          if (effective) shadow.strength = this.calculateShadowPower(effective, 1);
        }

        // Prepare + track
        const shadowToSave = this.prepareShadowForSave(shadow);
        chunkShadows.push(shadowToSave);

        if (isBoss) this.recordBossExtractionAttempt(corpse.id, true);
      }

      // Persist this chunk's successes in tiny IDB write batches
      if (chunkShadows.length > 0 && this.storageManager && this._isSkillTreeSkillUnlocked('shadow_preservation')) {
        try {
          let savedCount = 0;
          if (typeof this.storageManager.saveShadowsChunked === 'function') {
            savedCount = await this.storageManager.saveShadowsChunked(
              chunkShadows, WRITE_CHUNK_SIZE
            );
          } else {
            savedCount = await this.storageManager.saveShadowsBatch(chunkShadows);
          }

          const effectiveSavedCount = Number.isFinite(savedCount) ? savedCount : chunkShadows.length;
          totalExtracted += effectiveSavedCount;
          const savedShadows = chunkShadows.slice(0, effectiveSavedCount);
          for (const savedShadow of savedShadows) {
            totalPowerDelta += (savedShadow.strength || savedShadow.s || 0);
            const r = savedShadow.rank || savedShadow.r || '?';
            rankCounts[r] = (rankCounts[r] || 0) + 1;
            const extractedShadowId = savedShadow?.id || savedShadow?.i;
            if (extractedShadowId) extractedShadowIds.push(String(extractedShadowId));
          }
        } catch (e) {
          this.debugError(
            'BULK_EXTRACTION',
            `Chunk ${Math.floor(i / CORPSE_CHUNK_SIZE) + 1} save failed`,
            e
          );
        }
      } else if (chunkShadows.length > 0) {
        this.debugError('BULK_EXTRACTION', 'Bulk extraction skipped because durable storage is unavailable', {
          attemptedChunkSize: chunkShadows.length,
          hasStorageManager: Boolean(this.storageManager),
          hasShadowPreservation: this._isSkillTreeSkillUnlocked('shadow_preservation'),
        });
        try {
          this._toast?.('ARISE failed: Shadow Preservation storage unavailable.', 'error');
        } catch (_) {}
      }

      // Yield to event loop
      if (i + CORPSE_CHUNK_SIZE < total) {
        await new Promise(r => setTimeout(r, CHUNK_YIELD_MS));
        // Recheck after the yield — stop() may have landed during the await
        if (this._isStopped) {
          this.debugLog('ARISE', `ARISE STREAM aborted after yield at chunk ${Math.floor(i / CORPSE_CHUNK_SIZE) + 1}`);
          break;
        }
      }
    }

    this.debugLog('ARISE', `ARISE STREAM COMPLETE: ${totalExtracted}/${totalAttempted} extracted from ${total} corpses`);

    // Post-extraction bookkeeping
    if (totalExtracted > 0) {
      try {
        this._invalidateSnapshot();

        if (totalPowerDelta > 0) {
          try {
            await this._applyTotalPowerDelta({ strength: totalPowerDelta }, 'increment');
          } catch (e) {
            this.debugError('BULK_EXTRACTION', 'Failed to update power cache', e);
          }
        }

        this.settings.totalShadowsExtracted = (this.settings.totalShadowsExtracted || 0) + totalExtracted;
        this.settings.lastExtractionTime = Date.now();
        const uniqueExtractedIds = Array.from(new Set(extractedShadowIds));
        if (uniqueExtractedIds.length > 0) {
          await this.grantShadowXP(2, 'extraction', uniqueExtractedIds, {
            skipPowerRecalc: true,
            fetchChunkSize: 250,
          });
        }
        this.saveSettings();

        this._armyStatsCache = null;
        this._armyStatsCacheTime = null;
        this._shadowPowerCache = new Map();

        // ONE batch event
        const eventData = {
          shadowCount: totalExtracted,
          rankCounts,
          timestamp: Date.now(),
          source: 'dungeon_bulk',
        };
        SLEvents.emit('ShadowArmy:batchExtractionComplete', eventData);
        if (typeof window?.dispatchEvent === 'function') {
          document.dispatchEvent(new CustomEvent('shadowExtracted', { detail: eventData, bubbles: true }));
        }

        // ONE summary toast
        if (BdApi?.UI?.showToast) {
          const rankSummary = Object.entries(rankCounts).map(([r, c]) => `${c}x ${r}`).join(', ');
          this._toast(`ARISE: ${totalExtracted} shadows extracted (${rankSummary})`, "success", 4000);
        }

        this._widgetDirty = true;
        this.scheduleWidgetRefresh({ reason: 'bulk_extraction', delayMs: 300 });

        this.updateUI();
      } catch (error) {
        this.debugError('BULK_EXTRACTION', 'Post-extraction bookkeeping failed', error);
      }
    }

    return { extracted: totalExtracted, attempted: totalAttempted };
  },

  // BOSS ATTEMPT TRACKING

  /**
   * Check if can extract from boss (max 3 attempts per corpse per day).
   */
  canExtractFromBoss(bossId) {
    if (!this.settings.dungeonExtractionAttempts) {
      this.settings.dungeonExtractionAttempts = {};
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;
    const maxAttempts = cfg.maxBossAttemptsPerDay || 3;
    const today = new Date().toDateString();
    const attempts = this.settings.dungeonExtractionAttempts[bossId];

    if (!attempts || attempts.lastReset !== today) {
      return { allowed: true, reason: null, attemptsRemaining: maxAttempts };
    }

    if (attempts.count >= maxAttempts) {
      return {
        allowed: false,
        reason: `Maximum extraction attempts reached (${maxAttempts}/${maxAttempts}). Boss corpse has degraded. Try again tomorrow.`,
        attemptsRemaining: 0,
      };
    }

    return { allowed: true, reason: null, attemptsRemaining: maxAttempts - attempts.count };
  },

  recordBossExtractionAttempt(bossId, success) {
    if (!this.settings.dungeonExtractionAttempts) {
      this.settings.dungeonExtractionAttempts = {};
    }

    const today = new Date().toDateString();
    const attempts = this.settings.dungeonExtractionAttempts[bossId];

    const attemptHandlers = {
      update: () => {
        attempts.count++;
        attempts.lastAttempt = Date.now();
        attempts.lastSuccess = success;
      },
      add: () => {
        this.settings.dungeonExtractionAttempts[bossId] = {
          count: 1,
          lastAttempt: Date.now(),
          lastReset: today,
          lastSuccess: success,
        };
      },
    };

    const handler =
      attempts && attempts.lastReset === today ? attemptHandlers.update : attemptHandlers.add;
    handler();

    this.cleanupOldBossAttempts();
    this.saveSettings();
  },

  getBossAttemptsRemaining(bossId) {
    if (!this.settings.dungeonExtractionAttempts) {
      return this.settings.extractionConfig?.maxBossAttemptsPerDay || 3;
    }

    const cfg = this.settings.extractionConfig || this.defaultSettings.extractionConfig;
    const maxAttempts = cfg.maxBossAttemptsPerDay || 3;
    const today = new Date().toDateString();
    const attempts = this.settings.dungeonExtractionAttempts[bossId];

    if (!attempts || attempts.lastReset !== today) {
      return maxAttempts;
    }

    return Math.max(0, maxAttempts - attempts.count);
  },

  cleanupOldBossAttempts() {
    if (!this.settings.dungeonExtractionAttempts) return;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const attempts = this.settings.dungeonExtractionAttempts;

    Object.keys(attempts)
      .filter((bossId) => attempts[bossId].lastAttempt < sevenDaysAgo)
      .forEach((bossId) => delete attempts[bossId]);
  },
};
