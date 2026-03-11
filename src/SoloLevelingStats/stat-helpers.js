const C = require('./constants');

module.exports = {
  getStatKeys() {
    if (Array.isArray(this.STAT_KEYS) && this.STAT_KEYS.length > 0) {
      return this.STAT_KEYS;
    }
    return C.STAT_KEYS;
  },

  normalizeNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  },

  createEmptyStatBlock() {
    return { ...C.EMPTY_STAT_BLOCK };
  },

  normalizeStatBlock(stats = null, fallback = 0) {
    const source = stats && typeof stats === 'object' ? stats : null;
    const normalized = this.createEmptyStatBlock();
    const keys = this.getStatKeys();

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      normalized[key] = this.normalizeNumber(source?.[key], fallback);
    }

    return normalized;
  },

  sumStatBlock(stats = null) {
    const source = stats && typeof stats === 'object' ? stats : this.settings?.stats;
    if (!source || typeof source !== 'object') return 0;

    const keys = this.getStatKeys();
    let sum = 0;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      sum += this.normalizeNumber(source[key], 0);
    }

    return sum;
  },

  addToAllStats(increment, targetStats = null) {
    const target = targetStats && typeof targetStats === 'object' ? targetStats : this.settings?.stats;
    if (!target || typeof target !== 'object') return;

    const delta = Math.max(0, Math.round(this.normalizeNumber(increment, 0)));
    if (!delta) return;

    const keys = this.getStatKeys();
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      target[key] = this.normalizeNumber(target[key], 0) + delta;
    }
  },
};
