module.exports = {
  calculateHP(vitality, rank = 'E') {
    const rankList =
      Array.isArray(this.settings?.ranks) && this.settings.ranks.length
        ? this.settings.ranks
        : Array.isArray(this.defaultSettings?.ranks) && this.defaultSettings.ranks.length
        ? this.defaultSettings.ranks
        : ['E'];
    const normalizeRankValue = (value) => String(value || '').trim();

    let resolvedRank = normalizeRankValue(rank);
    if (!rankList.includes(resolvedRank)) {
      const lowered = resolvedRank.toLowerCase();
      resolvedRank = rankList.find((entry) => String(entry).toLowerCase() === lowered) || '';
    }
    if (!rankList.includes(resolvedRank)) {
      const currentRank = normalizeRankValue(this.settings?.rank);
      resolvedRank = rankList.includes(currentRank) ? currentRank : rankList[0];
    }

    const safeVitalityRaw = Number(vitality);
    const safeVitality = Number.isFinite(safeVitalityRaw) ? safeVitalityRaw : 0;

    // Check cache first
    const cacheKey = `${safeVitality}_${resolvedRank}`;
    if (this._cache.hpCache.has(cacheKey)) {
      return this._cache.hpCache.get(cacheKey);
    }
  
    const rankIndex = Math.max(rankList.indexOf(resolvedRank), 0);
    const rankLinearStep = Number.isFinite(this.settings?.userRankHpLinearStep)
      ? this.settings.userRankHpLinearStep
      : 50;
    const rankCurveStep = Number.isFinite(this.settings?.userRankHpCurveStep)
      ? this.settings.userRankHpCurveStep
      : 35;
    const rankHpBonus = Math.max(
      0,
      Math.floor(rankIndex * rankLinearStep + rankIndex * rankIndex * rankCurveStep)
    );
    const baseHP = 100;
    const result = baseHP + safeVitality * 10 + rankHpBonus;
  
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
