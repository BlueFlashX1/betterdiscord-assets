module.exports = {
  async initializeUserStats() {
    // Get stats ONCE at the start (avoid redundant calls)
    const totalStats = this.getUserEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const intelligence = totalStats.intelligence || 0;
    const rank = this.soloLevelingStats?.settings?.rank || 'E';
    const level = this.soloLevelingStats?.settings?.level || 1;

    // Get shadow count ONCE (cached for 5 seconds)
    const shadowCount = this.shadowArmy ? await this.getShadowCount() : 0;

    // Calculate user HP from TOTAL EFFECTIVE VITALITY (including buffs) + SHADOW ARMY SIZE
    if (!this.settings.userMaxHP || this.settings.userMaxHP === null) {
      // ENHANCED HP FORMULA: Scales with VIT + Shadow Army Size
      // Base: 100 + VIT × 10 + rankIndex × 50 (original)
      // Shadow Army Bonus: shadowCount × 25 (NEW!)
      // You need more HP to survive while commanding a larger army!
      const rankIndex = this.getRankIndexValue(rank);
      const baseHP = 100 + vitality * 10 + rankIndex * 50;
      const shadowArmyBonus = shadowCount * 25;
      this.settings.userMaxHP = baseHP + shadowArmyBonus;

      if (!this.settings.userHP || this.settings.userHP === null) {
        this.settings.userHP = this.settings.userMaxHP;
      }
    }

    // Calculate user mana from TOTAL EFFECTIVE INTELLIGENCE (including buffs) + level
    if (!this.settings.userMaxMana || this.settings.userMaxMana === null) {
      // LORE MANA FORMULA:
      // - Main scaling: INT (including buffs)
      // - Secondary scaling: level
      // - No shadow-count scaling
      this.settings.userMaxMana = 100 + intelligence * 12 + level * 8;

      if (!this.settings.userMana || this.settings.userMana === null) {
        this.settings.userMana = this.settings.userMaxMana;
      }
    }
  },

  async getShadowCount() {
    // Check centralized cache first
    const cached = this.cache.get('shadowCount');
    if (cached !== null) {
      return cached;
    }

    // Check legacy cache (for backwards compatibility during transition)
    const now = Date.now();
    if (this._shadowCountCache && now - this._shadowCountCache.timestamp < 5000) {
      return this._shadowCountCache.count;
    }

    try {
      // CRITICAL: Only use IndexedDB storageManager - no fallback to old settings.shadows
      if (!this.shadowArmy?.storageManager) {
        // Return cached value immediately instead of blocking for 2.5s
        // The storageManager will be ready after ShadowArmy's start() completes
        return this._shadowCountCache?.count ?? 0;
      }

      // Use O(1) IDB count() instead of fetching all shadow records
      let count = 0;
      if (typeof this.shadowArmy.storageManager.getTotalCount === 'function') {
        count = await this.shadowArmy.storageManager.getTotalCount();
      } else {
        // Fallback: fetch all and count (legacy storageManager without getTotalCount)
        const shadows = await this.shadowArmy.storageManager.getShadows({}, 0, Infinity);
        count = Array.isArray(shadows) ? shadows.length : 0;
      }

      // Cache in both systems (centralized + legacy)
      this.cache.set('shadowCount', count, 5000);
      this._shadowCountCache = { count, timestamp: now };
      return count;
    } catch (error) {
      this.debugLog('GET_SHADOW_COUNT', 'Failed to get shadow count from IndexedDB', error);
    }
    return 0;
  },

  invalidateShadowCountCache() {
    this._shadowCountCache = null;
    // Also clear centralized CacheManager entry
    this.cache?.delete?.('shadowCount');
  },

  getSkillTreeBonuses() {
    const now = Date.now();
    if (
      this._cache.skillTreeBonuses !== null &&
      this._cache.skillTreeBonusesTime &&
      now - this._cache.skillTreeBonusesTime < this._cache.skillTreeBonusesTTL
    ) {
      return this._cache.skillTreeBonuses;
    }

    try {
      let bonuses = null;
      if (this.soloLevelingStats && typeof this.soloLevelingStats.getSkillTreeBonuses === 'function') {
        bonuses = bonuses || this.soloLevelingStats.getSkillTreeBonuses() || null;
      }
      if (!bonuses) {
        bonuses = BdApi.Data.load('SkillTree', 'bonuses') || null;
      }
      this._cache.skillTreeBonuses = bonuses;
      this._cache.skillTreeBonusesTime = now;
      return bonuses;
    } catch (error) {
      this.debugLog('GET_SKILL_TREE_BONUSES', 'Failed to load SkillTree bonuses', error);
      this._cache.skillTreeBonuses = null;
      this._cache.skillTreeBonusesTime = now;
      return null;
    }
  },

  getSkillTreeInstance() {
    return this.validatePluginReference('SkillTree') || null;
  },

  getUserCombatCritChanceBonus() {
    const bonuses = this.getSkillTreeBonuses() || null;
    return Math.max(0, Math.min(0.35, Number(bonuses?.critBonus || 0)));
  },

  getUserCritDamageBonus() {
    const bonuses = this.getSkillTreeBonuses() || null;
    return Math.max(0, Number(bonuses?.critDamageBonus || 0));
  },

  getUserAttackCooldownReduction() {
    const bonuses = this.getSkillTreeBonuses() || null;
    return Math.max(0, Math.min(0.35, Number(bonuses?.attackCooldownReduction || 0)));
  },

  getUserDaggerThrowDamageBonus() {
    const bonuses = this.getSkillTreeBonuses() || null;
    return Math.max(0, Number(bonuses?.daggerThrowDamageBonus || 0));
  },



  rollSkillTreeCombatCrit() {
    const critChance = this.getUserCombatCritChanceBonus();
    return critChance > 0 && Math.random() < critChance;
  },

  applyEnhancedCritMultiplier(damage, baseMultiplier, critDamageBonus = null) {
    const numericDamage = Number(damage);
    if (!Number.isFinite(numericDamage) || numericDamage <= 0) return 0;

    const multiplier = Number(baseMultiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 1) {
      return Math.max(1, Math.floor(numericDamage));
    }

    const bonus =
      critDamageBonus === null || critDamageBonus === undefined
        ? this.getUserCritDamageBonus()
        : Math.max(0, Number(critDamageBonus) || 0);

    if (bonus <= 0) {
      return Math.max(1, Math.floor(numericDamage));
    }

    const adjustedMultiplier = 1 + (multiplier - 1) * (1 + bonus);
    const nonCritDamage = numericDamage / multiplier;
    return Math.max(1, Math.floor(nonCritDamage * adjustedMultiplier));
  },

  getEffectiveUserAttackCooldownMs(attackInterval, fallbackInterval = 1000) {
    const fallback =
      Number.isFinite(Number(fallbackInterval)) && Number(fallbackInterval) > 0
        ? Number(fallbackInterval)
        : 1000;
    const candidate = Number(attackInterval);
    const baseCooldown = Number.isFinite(candidate) && candidate > 0 ? candidate : fallback;
    const reduction = this.getUserAttackCooldownReduction();
    const adjustedCooldown = baseCooldown * (1 - reduction);
    if (typeof this.getEffectiveAttackCooldownMs === 'function') {
      return this.getEffectiveAttackCooldownMs(adjustedCooldown, fallback);
    }
    return Math.max(800, Math.floor(adjustedCooldown));
  },

  getDungeonCombatSkillHudState(channelKey) {
    const dungeon = this.activeDungeons?.get?.(channelKey);
    if (!dungeon?.userParticipating) return [];

    const skillTree = this.getSkillTreeInstance();
    if (!skillTree || typeof skillTree.getAvailableDungeonCombatSkillSnapshots !== 'function') {
      return [];
    }

    return skillTree
      .getAvailableDungeonCombatSkillSnapshots()
      .filter((snapshot) => snapshot?.def && snapshot.unlocked)
      .map((snapshot) => {
        const def = snapshot.def;
        const hasMana = Number(snapshot.mana?.current || 0) >= Number(def.manaCost || 0);
        const isOnCooldown = snapshot.cooldownRemaining > 0;
        const needsDeploy = !dungeon.shadowsDeployed;
        const bossAlive = Number(dungeon?.boss?.hp || 0) > 0;
        const liveMobs = (dungeon.mobs?.activeMobs || []).some((m) => m && m.hp > 0);
        const noEnemies = !bossAlive && !liveMobs;
        const disabled =
          isOnCooldown ||
          !hasMana ||
          needsDeploy ||
          dungeon.completed ||
          dungeon.failed ||
          noEnemies;

        let stateClass = 'is-ready';
        const manaPart = Number(def.manaCost) > 0 ? `${def.manaCost} Mana • ` : 'No Mana Cost • ';
        let titleText = `${def.name} • ${manaPart}${Math.ceil(snapshot.effectiveCooldownMs / 1000)}s cooldown`;

        if (isOnCooldown) {
          stateClass = 'is-cooldown';
          titleText = `${def.name} ready in ${Math.ceil(snapshot.cooldownRemaining / 1000)}s`;
        } else if (!hasMana) {
          stateClass = 'is-starved';
          titleText = `${def.name} requires ${def.manaCost} Mana`;
        } else if (needsDeploy) {
          stateClass = 'is-blocked';
          titleText = `Deploy shadows before using ${def.name}.`;
        } else if (noEnemies) {
          stateClass = 'is-blocked';
          titleText = 'No enemies to target.';
        }

        return {
          ...snapshot,
          hasMana,
          needsDeploy,
          disabled,
          stateClass,
          buttonText: isOnCooldown
            ? `${def.buttonLabel || def.name.toUpperCase()} ${Math.ceil(snapshot.cooldownRemaining / 1000)}s`
            : def.buttonLabel || def.name.toUpperCase(),
          titleText,
        };
      });
  },

  validatePluginReference(pluginName, instanceProperty) {
    // Check cache first
    const now = Date.now();
    const cacheKey = `${pluginName}_${instanceProperty || 'none'}`;
    if (
      this._cache.pluginInstances[cacheKey] &&
      this._cache.pluginInstancesTime[cacheKey] &&
      now - this._cache.pluginInstancesTime[cacheKey] < this._cache.pluginInstancesTTL
    ) {
      return this._cache.pluginInstances[cacheKey];
    }

    if (!BdApi.Plugins.isEnabled(pluginName)) {
      this._cache.pluginInstances[cacheKey] = null;
      this._cache.pluginInstancesTime[cacheKey] = now;
      return null;
    }
    const plugin = BdApi.Plugins.get(pluginName);
    if (!plugin?.instance) {
      this.debugLogOnce(`PLUGIN_MISSING:${pluginName}`, `Plugin ${pluginName} not available`);
      this._cache.pluginInstances[cacheKey] = null;
      this._cache.pluginInstancesTime[cacheKey] = now;
      return null;
    }

    // Validate instance has required methods/properties
    // CRITICAL: For storageManager, don't fail validation if it's not initialized yet
    // ShadowArmy initializes storageManager asynchronously in start()
    if (instanceProperty) {
      if (instanceProperty === 'storageManager') {
        // For storageManager, only validate plugin exists, not the property
        // It will be initialized asynchronously and accessed with optional chaining
        this._cache.pluginInstances[cacheKey] = plugin.instance;
        this._cache.pluginInstancesTime[cacheKey] = now;
        return plugin.instance;
      } else if (!plugin.instance[instanceProperty]) {
        this.debugLogOnce(
          `PLUGIN_MISSING_PROP:${pluginName}:${instanceProperty}`,
          `Plugin ${pluginName} missing ${instanceProperty}`
        );
        this._cache.pluginInstances[cacheKey] = null;
        this._cache.pluginInstancesTime[cacheKey] = now;
        return null;
      }
    }

    // Cache the result
    this._cache.pluginInstances[cacheKey] = plugin.instance;
    this._cache.pluginInstancesTime[cacheKey] = now;

    return plugin.instance;
  },

  async loadPluginReferences() {
    try {
      // Load SoloLevelingStats plugin with validation
      const soloPlugin = this.validatePluginReference('SoloLevelingStats', 'settings');
      if (soloPlugin) {
        this.soloLevelingStats = soloPlugin;
        // Initialize user stats after loading plugin reference
        await this.initializeUserStats();

        // Subscribe to stats changes to update HP/Mana bars
        if (typeof this.soloLevelingStats.on === 'function') {
          this._onStatsChangedUnsubscribe?.();
          const callback = () => {
            // Invalidate stats cache when stats change
            this._cache.userEffectiveStats = null;
            this._cache.userEffectiveStatsTime = 0;
          };
          this._onStatsChangedUnsubscribe = this.soloLevelingStats.on('statsChanged', callback);
        }
      } else {
        this.debugLogOnce(
          'PLUGIN_REF_MISSING:SoloLevelingStats',
          'SoloLevelingStats plugin not available'
        );
      }

      // Load ShadowArmy plugin with validation
      // Note: storageManager may not be initialized yet (async initialization)
      // We'll use optional chaining when accessing it
      const shadowPlugin = this.validatePluginReference('ShadowArmy', 'storageManager');
      if (shadowPlugin) {
        this.shadowArmy = shadowPlugin;
        // Check if storageManager is available (may be null if not initialized yet)
        if (shadowPlugin.storageManager) {
          this.debugLog('ShadowArmy plugin loaded successfully with storageManager');
        } else {
          this.debugLog(
            'ShadowArmy plugin loaded (storageManager will be available after initialization)'
          );
        }

        // Listen for shadow extraction events (event-based sync)
        // Consolidated: also handles extraction verification (previously in setupExtractionEventListener)
        this._shadowExtractedListener = (data) => {
          // Extraction verification (merged from _shadowExtractedHandler)
          const { shadowId, shadowData, mobId, success } = data?.detail || data || {};
          if (success && mobId) {
            this.extractionEvents.set(mobId, {
              success: true,
              shadowId: shadowId,
              timestamp: Date.now(),
            });
            this.debugLog(
              `[Event] Shadow extracted: ${shadowData?.name || 'Unknown'} (${
                shadowData?.rank || '?'
              }-rank)`
            );
          }

          // Invalidate shadow count cache
          this.invalidateShadowCountCache();
          // Invalidate shadows cache
          this.invalidateShadowsCache();

          // BUGFIX INTEGRITY-2: Immediately remove extracted shadow from active allocations.
          // Without this, extracted shadows stay in combat for up to 60s (allocationCacheTTL),
          // consuming mana for resurrections on a shadow that no longer exists.
          if (shadowId) {
            this._removeExtractedShadowFromAllocations(shadowId);
          }

          const activeDungeonCount = this.activeDungeons?.size || 0;
          if (activeDungeonCount === 0) {
            return;
          }

          // Recalculate HP/Mana if needed
          this.recalculateUserHP();
          this.recalculateUserMana();
        };

        // Use BdApi.Events if available, otherwise fallback to DOM events
        if (typeof BdApi?.Events?.on === 'function') {
          BdApi.Events.on('ShadowArmy:shadowExtracted', this._shadowExtractedListener);
          this.debugLog('Subscribed to ShadowArmy:shadowExtracted events');
        } else if (typeof document.addEventListener === 'function') {
          // Fallback to DOM events
          document.addEventListener('shadowExtracted', this._shadowExtractedListener);
          this.debugLog('Subscribed to shadowExtracted DOM events (fallback)');
        }
      } else {
        this.debugLogOnce('PLUGIN_REF_MISSING:ShadowArmy', 'ShadowArmy plugin not available');
      }

      // PERF: 30s plugin validation interval removed — now event-driven via _pluginToggleHandler

      // Load SoloLevelingToasts plugin (with fallback support)
      const toastsPlugin = BdApi.Plugins.isEnabled('SoloLevelingToasts')
        ? BdApi.Plugins.get('SoloLevelingToasts') : null;
      if (toastsPlugin?.instance?.toastEngineVersion >= 2 && typeof toastsPlugin.instance.showToast === 'function') {
        this.toasts = toastsPlugin.instance;
        this.debugLog('SoloLevelingToasts plugin loaded successfully');
      } else {
        // Fallback toast system will be used (no warning needed - graceful degradation)
        this.debugLogOnce(
          'PLUGIN_REF_MISSING:SoloLevelingToasts',
          'SoloLevelingToasts plugin not available, using fallback notifications'
        );
      }
    } catch (error) {
      this.debugLog('Error loading plugin references', error);
      // Don't throw - plugin can still function without integrations
    }
  }
};
