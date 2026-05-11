module.exports = {
  throttle(func, wait) {
    let timeout = null;
    let lastRun = 0;
  
    return (...args) => {
      const now = Date.now();
      const remaining = wait - (now - lastRun);
  
      if (remaining <= 0) {
        lastRun = now;
        return func.apply(this, args);
      } else if (!timeout) {
        timeout = setTimeout(() => {
          lastRun = Date.now();
          timeout = null;
          func.apply(this, args);
        }, remaining);
      }
    };
  },

  debounce(func, wait) {
    let timeout = null;
  
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  _registerUIForceUpdate(forceUpdate) {
    if (typeof forceUpdate !== 'function') return;
    this._chatUIForceUpdates ||= new Set();
    this._chatUIForceUpdates.add(forceUpdate);
    this._chatUIForceUpdate = forceUpdate;
  },

  _unregisterUIForceUpdate(forceUpdate) {
    if (typeof forceUpdate === 'function') {
      this._chatUIForceUpdates?.delete?.(forceUpdate);
    }
    if (this._chatUIForceUpdates?.size) {
      const next = this._chatUIForceUpdates.values().next();
      this._chatUIForceUpdate = next?.done ? null : next.value;
    } else {
      this._chatUIForceUpdate = null;
    }
  },

  _triggerUIForceUpdates() {
    if (this._chatUIForceUpdates?.size) {
      this._chatUIForceUpdates.forEach((updateFn) => {
        try {
          updateFn();
        } catch (_) {
          // Ignore stale callbacks from unmounted React trees.
        }
      });
      return;
    }
    if (this._chatUIForceUpdate) {
      try {
        this._chatUIForceUpdate();
      } catch (_) {
        // Ignore stale callback
      }
    }
  },

  // (initDOMCache removed — legacy pre-React DOM cache, no longer consumed.)

  _clearCurrentLevelCache() {
    this._cache.currentLevel = null;
    this._cache.currentLevelTime = 0;
    this._cache.milestoneMultiplier = null;
    this._cache.milestoneMultiplierLevel = null;
  },

  // (_clearPerceptionCaches removed — the cache slots it cleared were
  // never read; both writer and reader were dead.)

  _clearTitleCaches() {
    this._cache.activeTitleBonus = null;
    this._cache.activeTitleBonusTime = 0;
    this._cache.activeTitleBonusKey = null;
  },

  _clearShadowCaches() {
    this._cache.shadowArmyBuffs = null;
    this._cache.shadowArmyBuffsTime = 0;
  },

  _clearTotalEffectiveStatsCache() {
    this._cache.totalEffectiveStats = null;
    this._cache.totalEffectiveStatsTime = 0;
    this._cache.totalEffectiveStatsKey = null;
  },

  invalidatePerformanceCache(cacheKeys = null) {
    if (!cacheKeys) {
      this._clearCurrentLevelCache();
      this._clearTitleCaches();
      this._clearShadowCaches();
      this._clearTotalEffectiveStatsCache();
      this._cache.hpCache.clear();
      this._cache.manaCache.clear();
      return;
    }

    const keySet = new Set(cacheKeys);
    keySet.has('currentLevel') && this._clearCurrentLevelCache();
    keySet.has('title') && this._clearTitleCaches();
    keySet.has('shadow') && this._clearShadowCaches();
    if (keySet.has('title') || keySet.has('stats') || keySet.has('shadow')) {
      this._clearTotalEffectiveStatsCache();
    }
    if (keySet.has('stats')) {
      this._cache.hpCache.clear();
      this._cache.manaCache.clear();
    }
  }
};
