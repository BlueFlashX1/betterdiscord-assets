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

  initDOMCache() {
    try {
      // HP/Mana bars
      this.domCache.hpBar = document.querySelector('.sls-hp-bar');
      this.domCache.hpBarFill = document.querySelector('.sls-hp-bar-fill');
      this.domCache.hpText = document.querySelector('.sls-hp-text');
      this.domCache.manaBar = document.querySelector('.sls-mana-bar');
      this.domCache.manaBarFill = document.querySelector('.sls-mana-bar-fill');
      this.domCache.manaText = document.querySelector('.sls-mana-text');
  
      // Stats display
      this.domCache.levelDisplay = document.querySelector('.sls-level-display');
      this.domCache.xpDisplay = document.querySelector('.sls-xp-display');
      this.domCache.rankDisplay = document.querySelector('.sls-rank-display');
  
      // Shadow power
      this.domCache.shadowPowerDisplay = document.querySelector('.sls-shadow-power');
  
      // Quest panel
      this.domCache.questPanel = document.querySelector('.sls-quest-panel');
  
      // Mark cache as valid
      this.domCache.valid = true;
      this.domCache.lastUpdate = Date.now();
    } catch (error) {
      this.debugError('DOM_CACHE', 'DOM cache initialization failed:', error);
      this.domCache.valid = false;
    }
  },

  _clearCurrentLevelCache() {
    this._cache.currentLevel = null;
    this._cache.currentLevelTime = 0;
    this._cache.milestoneMultiplier = null;
    this._cache.milestoneMultiplierLevel = null;
  },

  _clearPerceptionCaches() {
    this._cache.totalPerceptionBuff = null;
    this._cache.totalPerceptionBuffTime = 0;
    this._cache.perceptionBuffsByStat = null;
    this._cache.perceptionBuffsByStatTime = 0;
  },

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
      this._clearPerceptionCaches();
      this._clearTitleCaches();
      this._clearShadowCaches();
      this._clearTotalEffectiveStatsCache();
      this._cache.hpCache.clear();
      this._cache.manaCache.clear();
      return;
    }
  
    const keySet = new Set(cacheKeys);
    keySet.has('currentLevel') && this._clearCurrentLevelCache();
    keySet.has('perception') && this._clearPerceptionCaches();
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
