module.exports = {
  cacheShadowArmyBuffs(buffs, timestamp = Date.now()) {
    const normalized =
      buffs && typeof buffs === 'object'
        ? this.normalizeStatBlock({ ...this.DEFAULT_SHADOW_BUFFS, ...buffs }, 0)
        : this.createEmptyStatBlock();
    this._cache.shadowArmyBuffs = normalized;
    this._cache.shadowArmyBuffsTime = timestamp;
    return normalized;
  },

  getShadowArmyBuffs() {
    // Check cache first (avoid repeated plugin lookups)
    const now = Date.now();
    if (
      this._cache.shadowArmyBuffs &&
      this._cache.shadowArmyBuffsTime &&
      now - this._cache.shadowArmyBuffsTime < this._cache.shadowArmyBuffsTTL
    ) {
      return this._cache.shadowArmyBuffs;
    }
  
    try {
      const shadowArmy = this._SLUtils?.getPluginInstance?.('ShadowArmy');
      if (!shadowArmy) {
        return this.cacheShadowArmyBuffs(null, now);
      }
  
      // Use calculateTotalBuffs if available (async method)
      // For synchronous access, try to get cached buffs or calculate synchronously
      if (shadowArmy.calculateTotalBuffs) {
        // Try to get buffs synchronously if there's a cached version
        // Otherwise return zeros (will be updated asynchronously)
        if (shadowArmy.cachedBuffs && Date.now() - (shadowArmy.cachedBuffsTime || 0) < 5000) {
          // Use cached buffs if recent (within 5 seconds)
          return this.cacheShadowArmyBuffs(shadowArmy.cachedBuffs, now);
        }
  
        // Trigger async calculation and cache it (deduped to avoid request storms).
        const refreshCooldownMs = 750;
        const canScheduleRefresh =
          !this._shadowBuffsRefreshPromise &&
          now - (this._shadowBuffsRefreshAt || 0) >= refreshCooldownMs;
  
        if (canScheduleRefresh) {
          this._shadowBuffsRefreshAt = now;
          this._shadowBuffsRefreshPromise = Promise.resolve()
            .then(() => shadowArmy.calculateTotalBuffs())
            .then((buffs) => {
              shadowArmy.cachedBuffs = buffs;
              shadowArmy.cachedBuffsTime = Date.now();
              this.cacheShadowArmyBuffs(buffs);
              // Update UI when buffs are calculated
              this.updateChatUI();
              return buffs;
            })
            .catch(() => null)
            .finally(() => {
              this._shadowBuffsRefreshPromise = null;
            });
        }
  
        // Return zeros for now, will be updated when async calculation completes
        return this.cacheShadowArmyBuffs(shadowArmy.cachedBuffs, now);
      }
  
      return this.cacheShadowArmyBuffs(null, now);
    } catch (error) {
      // Silently fail if ShadowArmy isn't available
      return this.cacheShadowArmyBuffs(null, now);
    }
  },

  getEffectiveShadowArmyBuffs() {
    const baseBuffs = this.getShadowArmyBuffs();
    const activeBuffs = this.getActiveSkillBuffs();
    if (!activeBuffs || activeBuffs.shadowBuffMultiplier <= 1.0) return baseBuffs;
  
    // Apply Arise multiplier to all shadow buff values
    const multiplier = activeBuffs.shadowBuffMultiplier;
    const scaled = this.createEmptyStatBlock();
    const statKeys = this.getStatKeys();
    for (let i = 0; i < statKeys.length; i++) {
      const key = statKeys[i];
      scaled[key] = this.normalizeNumber(baseBuffs?.[key], 0) * multiplier;
    }
    return scaled;
  }
};
