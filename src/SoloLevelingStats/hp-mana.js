module.exports = {
  calculateHP(vitality, rank = 'E') {
    // Check cache first
    const cacheKey = `${vitality}_${rank}`;
    if (this._cache.hpCache.has(cacheKey)) {
      return this._cache.hpCache.get(cacheKey);
    }
  
    const rankIndex = Math.max(this.settings.ranks.indexOf(rank), 0);
    const baseHP = 100;
    const result = baseHP + vitality * 10 + rankIndex * 50;
  
    // Cache the result (limit cache size)
    if (this._cache.hpCache.size < 100) {
      this._cache.hpCache.set(cacheKey, result);
    }
  
    return result;
  },

  calculateMana(intelligence) {
    if (this._cache.manaCache.has(intelligence)) {
      return this._cache.manaCache.get(intelligence);
    }
  
    const baseMana = 100;
    const result = baseMana + intelligence * 10;
    if (this._cache.manaCache.size < 100) {
      this._cache.manaCache.set(intelligence, result);
    }
  
    return result;
  }
};
