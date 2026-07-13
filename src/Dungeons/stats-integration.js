const SLEvents = require('../shared/event-bus');

module.exports = {
  async initializeUserStats() {
    // Get stats ONCE at the start (avoid redundant calls)
    const totalStats = this.getUserEffectiveStats();
    const vitality = totalStats.vitality || 0;
    const intelligence = totalStats.intelligence || 0;
    const rank = this.soloLevelingStats?.settings?.rank || 'E';

    // Get shadow count ONCE (cached for 5 seconds)
    const shadowCount = this.shadowArmy ? await this.getShadowCount() : 0;

    // Calculate user HP from TOTAL EFFECTIVE VITALITY (including buffs) + SHADOW ARMY SIZE
    if (!Number.isFinite(this.settings.userMaxHP)) {
      // ENHANCED HP FORMULA: Scales with VIT + Shadow Army Size
      // Base: 100 + VIT × 10 + rankIndex × 50 (original)
      // Shadow Army Bonus: shadowCount × 25 (NEW!)
      // You need more HP to survive while commanding a larger army!
      const rankIndex = this.getRankIndexValue(rank);
      const baseHP = 100 + vitality * 10 + rankIndex * 50;
      const shadowArmyBonus = shadowCount * 25;
      this.settings.userMaxHP = baseHP + shadowArmyBonus;

      if (!Number.isFinite(this.settings.userHP)) {
        this.settings.userHP = this.settings.userMaxHP;
      }
    }

    // Calculate user mana from TOTAL EFFECTIVE INTELLIGENCE (including buffs) + level
    if (!Number.isFinite(this.settings.userMaxMana)) {
      // LORE MANA FORMULA (matches SoloLevelingStats hp-mana.js):
      // - Main scaling: INT (including buffs)
      // - flatMana: SkillTree bonus (unavailable here, use 0)
      this.settings.userMaxMana = 100 + intelligence * 10 + 0;

      if (!Number.isFinite(this.settings.userMana)) {
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
        // PERF (2026-07-13): the old fallback here full-walked the entire
        // store (getShadows({}, 0, Infinity)) just to COUNT records — a
        // multi-second stall at 281k-shadow scale for a number the cache
        // already approximates. getTotalCount has existed since wave 3; a
        // storageManager without it is effectively unreachable. Surface
        // loudly and reuse the cached count instead of stalling.
        this.errorLog('CRITICAL', 'storageManager.getTotalCount missing — using cached shadow count');
        count = this._shadowCountCache?.count ?? 0;
      }

      // Cache in both systems (centralized + legacy)
      this.cache.set('shadowCount', count, 5000);
      this._shadowCountCache = { count, timestamp: now };
      return count;
    } catch (error) {
      // Surface via errorLog('CRITICAL') instead of debugLog (which
      // gates on settings.debug, silent in production). Fall back to
      // the cached count if available — IDB hiccups shouldn't collapse
      // userMaxHP to its no-shadow baseline. Only return 0 when there
      // is truly no cached snapshot yet (first-load failure).
      this.errorLog('CRITICAL', 'Failed to get shadow count from IndexedDB', error);
      const cached = this._shadowCountCache?.count;
      if (typeof cached === 'number' && cached >= 0) return cached;
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
    const raw = Math.max(0, Number(bonuses?.critBonus || 0));
    // SHADOW MONARCH PERK (Dagger Arts -> Shadow Edge): crit-chance bonus x3, cap raised
    // 0.35 -> 1.0. (The "first hit always crits" rider is combat-path, deferred.)
    if (this.soloLevelingStats?.settings?.rank === 'Shadow Monarch') {
      return Math.min(1, raw * 3);
    }
    return Math.min(0.35, raw);
  },

  getUserCritDamageBonus() {
    const bonuses = this.getSkillTreeBonuses() || null;
    const raw = Math.max(0, Number(bonuses?.critDamageBonus || 0));
    // SHADOW MONARCH PERK (Mutilation -> Fatal Strike): crit-damage bonus x2. (The
    // "crits ignore 100% defense" rider is combat-path, deferred.)
    if (this.soloLevelingStats?.settings?.rank === 'Shadow Monarch') {
      return raw * 2;
    }
    return raw;
  },

  getUserAttackCooldownReduction() {
    const bonuses = this.getSkillTreeBonuses() || null;
    const raw = Math.max(0, Number(bonuses?.attackCooldownReduction || 0));
    // SHADOW MONARCH PERK (Sprint -> Quicksilver): cooldown-reduction floor to -75%.
    if (this.soloLevelingStats?.settings?.rank === 'Shadow Monarch') {
      return 0.75;
    }
    return Math.min(0.35, raw);
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
        const effectiveManaCost = Math.max(0, Number(snapshot.effectiveManaCost ?? def.manaCost) || 0);
        const currentMana = Math.max(0, Number(snapshot.mana?.current) || 0);
        const hasMana = currentMana >= effectiveManaCost;
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
        const manaPart = effectiveManaCost > 0 ? `${effectiveManaCost} Mana • ` : 'No Mana Cost • ';
        let titleText = `${def.name} • ${manaPart}${Math.ceil(snapshot.effectiveCooldownMs / 1000)}s cooldown`;

        if (isOnCooldown) {
          stateClass = 'is-cooldown';
          titleText = `${def.name} ready in ${Math.ceil(snapshot.cooldownRemaining / 1000)}s`;
        } else if (!hasMana) {
          stateClass = 'is-starved';
          titleText = `${def.name} requires ${effectiveManaCost} Mana`;
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
    const cachedInstance = this._cache.pluginInstances[cacheKey];
    if (
      cachedInstance &&
      // Zombie protection (matches shared/plugin-bridge.js:getPluginInstance) -- never
      // serve a cached instance that has begun tearing down since it was cached.
      !(cachedInstance._stopped || cachedInstance._isStopped) &&
      this._cache.pluginInstancesTime[cacheKey] &&
      now - this._cache.pluginInstancesTime[cacheKey] < this._cache.pluginInstancesTTL
    ) {
      return cachedInstance;
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
    if (plugin.instance._stopped || plugin.instance._isStopped) {
      // Zombie protection: refuse to serve/cache an instance that is already stopped.
      this.debugLogOnce(`PLUGIN_STOPPED:${pluginName}`, `Plugin ${pluginName} is stopped — refusing stale reference`);
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
      const detachShadowExtractedListener = () => {
        if (!this._shadowExtractedListener) return;
        SLEvents?.off('ShadowArmy:shadowExtracted', this._shadowExtractedListener);
        if (typeof document.removeEventListener === 'function') {
          document.removeEventListener('shadowExtracted', this._shadowExtractedListener);
        }
        this._shadowExtractedListener = null;
      };

      // Load SoloLevelingStats plugin with validation
      const soloPlugin = this.validatePluginReference('SoloLevelingStats', 'settings');
      if (soloPlugin) {
        this.soloLevelingStats = soloPlugin;
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
        if (shadowPlugin.storageManager) {
          this.debugLog('ShadowArmy plugin loaded successfully with storageManager');
        } else {
          this.debugLog(
            'ShadowArmy plugin loaded (storageManager will be available after initialization)'
          );
        }

        // Listen for shadow extraction events (event-based sync)
        // Consolidated: also handles extraction verification (previously in setupExtractionEventListener)
        detachShadowExtractedListener();
        this._shadowExtractedListener = (data) => {
          // Dedup: both SLEvents and DOM channels fire for the same extraction.
          // Ignore duplicate firings within 50ms.
          const now = Date.now();
          if (this._lastShadowExtractedTs && now - this._lastShadowExtractedTs < 50) return;
          this._lastShadowExtractedTs = now;

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

          this.invalidateShadowCountCache();
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

        // Subscribe both channels unconditionally — emitter fires both every time.
        // Dedup is handled at the top of _shadowExtractedListener via timestamp guard.
        SLEvents?.on('ShadowArmy:shadowExtracted', this._shadowExtractedListener);
        document.addEventListener('shadowExtracted', this._shadowExtractedListener);
        this.debugLog('Subscribed to ShadowArmy:shadowExtracted and shadowExtracted DOM events');
      } else {
        detachShadowExtractedListener();
        this.shadowArmy = null;
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
      this.errorLog('PLUGIN_REF', 'Error loading plugin references', error);
    }
  }
};
