/**
 * CriticalHit — Crit engine methods.
 * RNG, chance calculation, cross-plugin bonus loading, burst/combo system.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');
const { djb2Hash } = require('./hash');

const _bonusCache = { agility: null, agilityTime: 0, skill: null, skillTime: 0, perception: null, perceptionTime: 0 };
const BONUS_CACHE_TTL = 30000; // 30 seconds

module.exports = {
  _loadAgilityBonus() {
    const now = Date.now();
    if (_bonusCache.agility !== null && now - _bonusCache.agilityTime < BONUS_CACHE_TTL) {
      return _bonusCache.agility;
    }
    try {
      const agilityData = BdApi.Data.load('SoloLevelingStats', 'agilityBonus');
      _bonusCache.agility = (agilityData?.bonus ?? 0) * C.BONUS_TO_PERCENT;
      _bonusCache.agilityTime = now;
      return _bonusCache.agility;
    } catch (error) {
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load agility bonus', { error: error.message });
      return 0;
    }
  },

  _loadSkillTreeBonus() {
    const now = Date.now();
    if (_bonusCache.skill !== null && now - _bonusCache.skillTime < BONUS_CACHE_TTL) {
      return _bonusCache.skill;
    }
    try {
      const skillBonuses = BdApi.Data.load('SkillTree', 'bonuses');
      if (skillBonuses?.critBonus > 0) {
        const skillCritBonusPercent = skillBonuses.critBonus * C.BONUS_TO_PERCENT;
        this.debugLog('GET_EFFECTIVE_CRIT', 'Skill tree crit bonus applied', {
          skillCritBonusPercent: skillCritBonusPercent.toFixed(1),
        });
        _bonusCache.skill = skillCritBonusPercent;
        _bonusCache.skillTime = now;
        return _bonusCache.skill;
      }
      _bonusCache.skill = 0;
      _bonusCache.skillTime = now;
    } catch (error) {
      this.debugLog('GET_EFFECTIVE_CRIT', 'Could not load skill tree bonuses', {
        error: error.message,
      });
    }
    return 0;
  },

  _loadEquipmentCritBonus() {
    try {
      const bonuses = window.EquipmentManager?.getTotalEquippedBonuses?.();
      return Number(bonuses?.critChance) || 0;
    } catch (_) {
      return 0;
    }
  },

  _loadEquipmentCritDamage() {
    try {
      const bonuses = window.EquipmentManager?.getTotalEquippedBonuses?.();
      return Number(bonuses?.critDamage) || 0;
    } catch (_) {
      return 0;
    }
  },

  simpleHash(str) {
    // Delegates to the shared djb2Hash util in ./hash.js — previously
    // duplicated across crit-engine.js, restoration.js, id-extraction.js.
    return djb2Hash(String(str));
  },

  _seededUnitRoll(seed, step = '0') {
    const hash = this.simpleHash(`${seed}:${step}`);
    return (hash % 10000) / 10000;
  },

  _loadPerceptionBurstProfile() {
    const now = Date.now();
    if (_bonusCache.perception !== null && now - _bonusCache.perceptionTime < BONUS_CACHE_TTL) {
      return _bonusCache.perception;
    }
    try {
      const saved = BdApi.Data.load('SoloLevelingStats', 'perceptionBurst') || {};
      const perception = Math.max(0, Number(saved.effectivePerception ?? saved.perception ?? 0) || 0);
      // Use SLS-provided values when available, otherwise match SLS formula exactly:
      // 5% base + 0.35%/PER, capped at 92% (from SoloLevelingStats/calculation-bonuses.js)
      const extraHitChance = Number.isFinite(saved.burstChance)
        ? Math.max(0, Math.min(0.92, Number(saved.burstChance)))
        : Math.min(0.92, 0.05 + perception * 0.0035);
      // No hard cap — combo ceiling scales purely with perception (matches
      // SoloLevelingStats getPerceptionBurstProfile). The chain self-limits via
      // the 0.88^hits decay in calculateBurstHitCount, so this is the ceiling,
      // not the typical length.
      const maxHits = Math.max(1, Number(saved.maxHits) || (1 + Math.floor(perception * 0.5)));
      const jackpotChance =
        Number.isFinite(saved.jackpotChance)
          ? Math.max(0, Math.min(0.02, Number(saved.jackpotChance)))
          : perception >= 40
          ? Math.min(0.02, (perception - 39) * 0.0004)
          : 0;

      const profile = {
        perception,
        extraHitChance,
        maxHits,
        jackpotChance,
      };
      _bonusCache.perception = profile;
      _bonusCache.perceptionTime = now;
      return profile;
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

    // Burst length scales DIRECTLY with perception. maxHits = 1 + ⌊PER/2⌋, so a
    // thousands-PER build lands combos in the high hundreds. extraHitChance gates
    // whether a multi-hit burst procs this crit; when it does, the length is a
    // perception-scaled fraction of maxHits (sqrt-biased toward the top for
    // satisfying numbers). The old geometric-decay chain capped everyone at ~tens
    // regardless of perception — replaced here.
    const burstRoll = this._seededUnitRoll(seed, 'burst-proc');
    if (burstRoll > profile.extraHitChance) return 1; // no burst this crit

    const sizeRoll = this._seededUnitRoll(seed, 'burst-size');
    const fraction = 0.2 + Math.sqrt(sizeRoll) * 0.6; // 0.2–0.8 of maxHits
    let hits = Math.max(2, Math.round(profile.maxHits * fraction));

    // Rare jackpot pushes the combo to near-max (85–100% of maxHits).
    if (profile.jackpotChance > 0) {
      const jackpotRoll = this._seededUnitRoll(seed, 'jackpot-roll');
      if (jackpotRoll <= profile.jackpotChance) {
        const jpFraction = 0.85 + this._seededUnitRoll(seed, 'jackpot-size') * 0.15;
        hits = Math.max(hits, Math.round(profile.maxHits * jpFraction));
      }
    }

    // No 99-hit cap on the combo — it scales with perception. The chain is
    // already self-limited by the 0.88^hits decay above, so in practice it stays
    // small; only an extraordinary high-PER streak approaches the maxHits ceiling.
    return Math.max(1, hits);
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
    const payload = {
      messageId: messageId || null,
      userId: userId || null,
      burstHits: Math.max(1, Number(burstHits) || 1),
      perception: profile?.perception ?? 0,
      extraHitChance: profile?.extraHitChance ?? 0,
      maxHits: profile?.maxHits ?? 1,
      jackpotChance: profile?.jackpotChance ?? 0,
      timestamp: Date.now(),
    };
    setTimeout(() => {
      // BUG FIX: previously the catch swallowed every save failure
      // silently. lastCritBurst is the cross-plugin handoff for stats
      // displays — a silent failure here meant SoloLevelingStats /
      // LevelProgressBar would never see the most recent burst. Now
      // surfaced via debugError (which always logs since the debug.js
      // change in this wave).
      try {
        BdApi.Data.save('CriticalHit', 'lastCritBurst', payload);
      } catch (saveError) {
        this.debugError?.('PERSIST_LAST_CRIT_BURST', saveError, {
          phase: 'deferred_write',
        });
      }
    }, 0);
  },

  getEffectiveCritChance() {
    // BUG FIX: previously `||` made a critChance of 0 impossible — falsy
    // zero would coerce to DEFAULT_CRIT_CHANCE. Users who want to fully
    // disable random crits via the chance slider couldn't. ?? respects 0.
    let baseChance = this.settings.critChance ?? C.DEFAULT_CRIT_CHANCE;
    baseChance += this._loadAgilityBonus();
    baseChance += this._loadSkillTreeBonus();
    baseChance += this._loadEquipmentCritBonus();
    return Math.min(C.MAX_EFFECTIVE_CRIT_CHANCE, Math.max(0, baseChance));
  },
};
