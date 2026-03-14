/**
 * CriticalHit — Crit engine methods.
 * RNG, chance calculation, cross-plugin bonus loading, burst/combo system.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');

module.exports = {
  _loadAgilityBonus() {
    try {
      const agilityData = BdApi.Data.load('SoloLevelingStats', 'agilityBonus');
      return (agilityData?.bonus ?? 0) * C.BONUS_TO_PERCENT;
    } catch (error) {
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load agility bonus', { error: error.message });
      return 0;
    }
  },

  _loadSkillTreeBonus() {
    try {
      const skillBonuses = BdApi.Data.load('SkillTree', 'bonuses');
      if (skillBonuses?.critBonus > 0) {
        const skillCritBonusPercent = skillBonuses.critBonus * C.BONUS_TO_PERCENT;
        this.debugLog('GET_EFFECTIVE_CRIT', 'Skill tree crit bonus applied', {
          skillCritBonusPercent: skillCritBonusPercent.toFixed(1),
        });
        return skillCritBonusPercent;
      }
    } catch (error) {
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load skill tree bonuses', {
        error: error.message,
      });
    }
    return 0;
  },

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  },

  _seededUnitRoll(seed, step = '0') {
    const hash = this.simpleHash(`${seed}:${step}`);
    return (hash % 10000) / 10000;
  },

  _loadPerceptionBurstProfile() {
    try {
      const saved = BdApi.Data.load('SoloLevelingStats', 'perceptionBurst') || {};
      const perception = Math.max(0, Number(saved.effectivePerception ?? saved.perception ?? 0) || 0);
      // Use SLS-provided values when available, otherwise match SLS formula exactly:
      // 5% base + 0.35%/PER, capped at 45% (from SoloLevelingStats/calculation-bonuses.js)
      const extraHitChance = Number.isFinite(saved.burstChance)
        ? Math.max(0, Math.min(0.45, Number(saved.burstChance)))
        : Math.min(0.45, 0.05 + perception * 0.0035);
      const maxHits = Math.min(40, Math.max(1, Number(saved.maxHits) || (1 + Math.floor(perception * 0.5))));
      const jackpotChance =
        Number.isFinite(saved.jackpotChance)
          ? Math.max(0, Math.min(0.02, Number(saved.jackpotChance)))
          : perception >= 40
          ? Math.min(0.02, (perception - 39) * 0.0004)
          : 0;

      return {
        perception,
        extraHitChance,
        maxHits,
        jackpotChance,
      };
    } catch (error) {
      this.debugLog('BURST_PROFILE', 'Could not load perception burst profile', {
        error: error.message,
      });
      return {
        perception: 0,
        extraHitChance: 0.05,
        maxHits: 1,
        jackpotChance: 0,
      };
    }
  },

  calculateBurstHitCount(messageId, messageElement) {
    const profile = this._loadPerceptionBurstProfile();
    if (profile.maxHits <= 1) return 1;

    const authorId = this.getAuthorId(messageElement) || 'unknown';
    const channelId = this.currentChannelId || this._getCurrentChannelId() || 'unknown';
    const seed = `${messageId || 'noid'}:${channelId}:${authorId}:burst`;

    let hits = 1;
    let step = 1;
    while (hits < profile.maxHits) {
      const decay = Math.pow(0.88, hits - 1);
      const chance = profile.extraHitChance * decay;
      const roll = this._seededUnitRoll(seed, `chain-${step}`);
      if (roll <= chance) {
        hits += 1;
        step += 1;
        continue;
      }
      break;
    }

    // Rare jackpot chain for high PER builds (10x-99x)
    if (profile.jackpotChance > 0) {
      const jackpotRoll = this._seededUnitRoll(seed, 'jackpot-roll');
      if (jackpotRoll <= profile.jackpotChance) {
        const jackpotSize = 10 + Math.floor(this._seededUnitRoll(seed, 'jackpot-size') * 90);
        hits = Math.max(hits, Math.min(99, jackpotSize));
      }
    }

    return Math.max(1, Math.min(99, hits));
  },

  _markComboUpdated(messageId, contentHash = null) {
    if (messageId) {
      this._comboUpdatedMessages.add(messageId);
    }
    if (contentHash) {
      this._comboUpdatedContentHashes.add(contentHash);
    }

    if (this._comboUpdatedMessages.size > C.MAX_THROTTLE_MAP_SIZE) {
      this._comboUpdatedMessages.clear();
    }
    if (this._comboUpdatedContentHashes.size > C.MAX_THROTTLE_MAP_SIZE) {
      this._comboUpdatedContentHashes.clear();
    }
  },

  _syncBurstComboForMessage({ messageId, messageElement, userId, timestamp = Date.now() }) {
    const safeUserId = userId || 'unknown';
    const profile = this._loadPerceptionBurstProfile();
    const burstHits = this.calculateBurstHitCount(messageId, messageElement);

    this.updateUserCombo(safeUserId, burstHits, timestamp);
    this.persistLastCritBurst({
      messageId,
      userId: safeUserId,
      burstHits,
      profile,
    });

    return burstHits;
  },

  persistLastCritBurst({ messageId, userId, burstHits, profile }) {
    try {
      BdApi.Data.save('CriticalHit', 'lastCritBurst', {
        messageId: messageId || null,
        userId: userId || null,
        burstHits: Math.max(1, Math.min(99, Number(burstHits) || 1)),
        perception: profile?.perception ?? 0,
        extraHitChance: profile?.extraHitChance ?? 0,
        maxHits: profile?.maxHits ?? 1,
        jackpotChance: profile?.jackpotChance ?? 0,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.debugError('PERSIST_CRIT_BURST', error);
    }
  },

  getEffectiveCritChance() {
    let baseChance = this.settings.critChance || C.DEFAULT_CRIT_CHANCE;
    baseChance += this._loadAgilityBonus();
    baseChance += this._loadSkillTreeBonus();
    return Math.min(C.MAX_EFFECTIVE_CRIT_CHANCE, Math.max(0, baseChance));
  },
};
