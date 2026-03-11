module.exports = {
  calculateQualityBonus(messageText, messageLength) {
    let bonus = 0;
  
    // Long message bonus (scales with length)
    if (messageLength > 200) {
      bonus += 20; // Base bonus for long messages
      if (messageLength > 500) bonus += 15; // Extra for very long
      if (messageLength > 1000) bonus += 25; // Extra for extremely long
    }
  
    // Rich content bonus (uses pre-compiled regex from constructor)
    const hasLinks = this.RE_LINKS.test(messageText);
    const hasCode = this.RE_CODE.test(messageText);
    const hasEmojis = this.RE_EMOJIS.test(messageText);
    const hasMentions = this.RE_MENTIONS.test(messageText);
  
    if (hasLinks) bonus += 5;
    if (hasCode) bonus += 10; // Code blocks show effort
    if (hasEmojis && messageLength > 50) bonus += 3; // Emojis in longer messages
    if (hasMentions) bonus += 2;
  
    // Word diversity bonus (more unique words = better quality)
    this.RE_WORDS.lastIndex = 0; // Reset stateful regex
    const words = messageText.toLowerCase().match(this.RE_WORDS) || [];
    const uniqueWords = new Set(words);
    if (uniqueWords.size > 10 && messageLength > 100) {
      bonus += Math.min(uniqueWords.size * 0.5, 15);
    }
  
    // Question/answer bonus (engagement indicators)
    if (messageText.includes('?') && messageLength > 30) bonus += 5;
    if (this.RE_PROPER_SENTENCE.test(messageText)) bonus += 3; // Proper sentences
  
    return Math.round(bonus);
  },

  calculateMessageTypeBonus(messageText) {
    let bonus = 0;
  
    // Structured content bonuses (uses pre-compiled regex from constructor)
    if (this.RE_NUMBERED_LIST.test(messageText)) bonus += 5; // Numbered lists
    if (this.RE_BULLET_LIST.test(messageText)) bonus += 5; // Bullet points
    if (messageText.includes('\n') && messageText.split('\n').length > 2) bonus += 8; // Multi-line
  
    return bonus;
  },

  calculateTimeBonus() {
    const now = Date.now();
    if (
      this._cache.timeBonus !== null &&
      this._cache.timeBonusTime &&
      now - this._cache.timeBonusTime < this._cache.timeBonusTTL
    ) {
      return this._cache.timeBonus;
    }
  
    const hour = new Date().getHours();
    // Peak hours bonus (evening/night when more active)
    let result = 0;
    if (hour >= 18 && hour <= 23) {
      result = 5; // Evening bonus
    } else if (hour >= 0 && hour <= 4) {
      result = 8; // Late night bonus (dedicated players)
    }
  
    this._cache.timeBonus = result;
    this._cache.timeBonusTime = now;
  
    return result;
  },

  calculateChannelActivityBonus() {
    // More active channels give slightly more XP (encourages engagement)
    const channelId = this.getCurrentChannelId();
    if (!channelId) return 0;
  
    // This is a simple implementation - could be enhanced with channel activity tracking
    // For now, just a small bonus for being active
    return 2;
  },

  calculateActivityStreakBonus() {
    // Check cache first (streak changes daily)
    const now = Date.now();
    const today = new Date().toDateString();
    const cacheKey = `${today}_${this.settings.activity?.streakDays || 0}`;
  
    if (
      this._cache.activityStreakBonus !== null &&
      this._cache.activityStreakBonusTime &&
      this._cache.activityStreakBonusKey === cacheKey &&
      now - this._cache.activityStreakBonusTime < this._cache.activityStreakBonusTTL
    ) {
      return this._cache.activityStreakBonus;
    }
  
    // Reward consistent daily activity to help balance progression at high levels
    // Tracks consecutive days with activity (messages sent)
    try {
      const lastActiveDate = this.settings.activity?.lastActiveDate;
  
      // Initialize streak tracking if needed
      if (!this.settings.activity.streakDays) {
        this.settings.activity.streakDays = 0;
      }
  
      // Check if this is a new day
      if (lastActiveDate !== today) {
        // Check if streak continues (yesterday was active)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();
  
        if (lastActiveDate === yesterdayStr) {
          // Streak continues
          this.settings.activity.streakDays = (this.settings.activity.streakDays || 0) + 1;
        } else if (lastActiveDate && lastActiveDate !== today) {
          // Streak broken
          this.settings.activity.streakDays = 1;
        } else {
          // First day or no previous activity
          this.settings.activity.streakDays = 1;
        }
  
        this.settings.activity.lastActiveDate = today;
      }
  
      // Calculate bonus based on streak (capped at 7 days for balance)
      // 1 day: +1 XP, 2 days: +2 XP, 3 days: +4 XP, 4 days: +6 XP, 5 days: +8 XP, 6 days: +10 XP, 7+ days: +12 XP
      const streakDays = Math.min(this.settings.activity.streakDays || 0, 7);
      const streakBonus = streakDays <= 1 ? streakDays : Math.min(2 + (streakDays - 1) * 2, 12);
  
      // Cache the result with key
      this._cache.activityStreakBonus = streakBonus;
      this._cache.activityStreakBonusTime = now;
      this._cache.activityStreakBonusKey = cacheKey;
  
      return streakBonus;
    } catch (error) {
      this.debugError('CALCULATE_STREAK_BONUS', error);
      return 0;
    }
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
      const bonuses = BdApi.Data.load('SkillTree', 'bonuses') || null;
      this._cache.skillTreeBonuses = bonuses;
      this._cache.skillTreeBonusesTime = now;
      return bonuses;
    } catch (error) {
      this.debugError('SKILL_TREE_BONUSES', error);
      this._cache.skillTreeBonuses = null;
      this._cache.skillTreeBonusesTime = now;
      return null;
    }
  },

  getActiveSkillBuffs() {
    const now = Date.now();
    if (
      this._cache.activeSkillBuffs !== null &&
      this._cache.activeSkillBuffsTime &&
      now - this._cache.activeSkillBuffsTime < this._cache.activeSkillBuffsTTL
    ) {
      return this._cache.activeSkillBuffs;
    }
  
    try {
      const buffs = BdApi.Data.load('SkillTree', 'activeBuffs') || null;
      this._cache.activeSkillBuffs = buffs;
      this._cache.activeSkillBuffsTime = now;
      return buffs;
    } catch (error) {
      this.debugError('ACTIVE_SKILL_BUFFS', error);
      this._cache.activeSkillBuffs = null;
      this._cache.activeSkillBuffsTime = now;
      return null;
    }
  },

  consumeActiveSkillCharge(skillId) {
    try {
      const instance = this._SLUtils?.getPluginInstance?.('SkillTree');
      if (instance && typeof instance.consumeActiveSkillCharge === 'function') {
        return instance.consumeActiveSkillCharge(skillId);
      }
    } catch (_error) {
      // SkillTree not available
    }
    return false;
  },

  calculateInteractionQualityBonus(messageContext = {}, messageText = '') {
    const mentionCount = Number.isFinite(messageContext?.mentionCount)
      ? messageContext.mentionCount
      : this.extractMentionCountFromText(messageText);
    const isReply = messageContext?.isReply === true;
    const isThreadParticipation = messageContext?.isThread === true;
  
    let bonus = 0;
    isReply && (bonus += 5); // Encourage actual conversation chains
    mentionCount > 0 && (bonus += Math.min(8, mentionCount * 2)); // Cap mention bonus to avoid farming
    isThreadParticipation && (bonus += 4); // Reward focused thread participation
  
    return bonus;
  },

  normalizeMessageFingerprint(messageText = '') {
    return String(messageText || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '<url>')
      .replace(/<@!?\d+>|@everyone|@here/g, '<mention>')
      .replace(/[^\w\s<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
  },

  pruneAntiAbuseFingerprints(now, maxAgeMs) {
    if (!this._messageAntiAbuse?.fingerprints) return;
    for (const [key, entry] of this._messageAntiAbuse.fingerprints.entries()) {
      if (!entry?.lastSeen || now - entry.lastSeen > maxAgeMs) {
        this._messageAntiAbuse.fingerprints.delete(key);
      }
    }
  },

  getRapidSendDecayMultiplier(deltaMs) {
    if (!isFinite(deltaMs)) return 1.0;
    if (deltaMs < 700) return 0.18;
    if (deltaMs < 1200) return 0.35;
    if (deltaMs < 2000) return 0.55;
    if (deltaMs < 3500) return 0.75;
    if (deltaMs < 5000) return 0.9;
    return 1.0;
  },

  getRepeatDecayMultiplier(repeatCount) {
    if (repeatCount <= 1) return 1.0;
    if (repeatCount === 2) return 0.85;
    if (repeatCount === 3) return 0.65;
    return Math.max(0.35, 0.65 - (repeatCount - 3) * 0.08);
  },

  calculateAntiAbuseScore(messageText, messageContext = {}) {
    const now = Date.now();
    this._messageAntiAbuse = this._messageAntiAbuse || {
      lastMessageTime: 0,
      fingerprints: new Map(),
    };
    const state = this._messageAntiAbuse;
    const repeatWindowMs = 2 * 60 * 1000;
  
    // Rapid-send decay (ultra-fast bursts are penalized heavily)
    const deltaMs = state.lastMessageTime > 0 ? now - state.lastMessageTime : Number.POSITIVE_INFINITY;
    const rapidMultiplier = this.getRapidSendDecayMultiplier(deltaMs);
  
    // Repeat-text decay (same normalized content in rolling window)
    this.pruneAntiAbuseFingerprints(now, repeatWindowMs);
    const fingerprint = this.normalizeMessageFingerprint(messageText);
    let repeatCount = 1;
    if (fingerprint.length >= 6) {
      const existing = state.fingerprints.get(fingerprint);
      if (existing && now - existing.lastSeen <= repeatWindowMs) {
        repeatCount = existing.count + 1;
      }
      state.fingerprints.set(fingerprint, { count: repeatCount, lastSeen: now });
    }
    const repeatMultiplier = this.getRepeatDecayMultiplier(repeatCount);
  
    // Combined decay with floor to avoid zeroing out progression
    const multiplier = Math.max(0.12, Math.min(1.0, rapidMultiplier * repeatMultiplier));
    state.lastMessageTime = now;
  
    return {
      multiplier,
      rapidMultiplier,
      repeatMultiplier,
      repeatCount,
      deltaMs: isFinite(deltaMs) ? deltaMs : null,
      source: messageContext?.source || 'unknown',
    };
  },

  getPerceptionBurstProfile() {
    const perceptionStat = this.settings?.stats?.perception ?? 0;
    const perception = Math.max(0, Number(perceptionStat) || 0);
    const burstChance = Math.min(0.45, 0.05 + perception * 0.0035); // 5% base, +0.35% per PER
    const maxHits = Math.min(40, Math.max(1, 1 + Math.floor(perception * 0.5))); // 1..40
    const jackpotChance = perception >= 40 ? Math.min(0.02, (perception - 39) * 0.0004) : 0;
  
    return {
      perception,
      burstChance,
      maxHits,
      jackpotChance,
    };
  },

  calculateBaseXpForMessage({ messageText, messageLength, messageContext = null }) {
    // ===== BASE XP CALCULATION (Additive Bonuses) =====
    // Base XP: 10 per message
    let baseXP = 10;
  
    // 1. Character bonus: +0.15 per character (max +75)
    const charBonus = Math.min(messageLength * 0.15, 75);
    baseXP += charBonus;
  
    // 2. Quality bonuses based on message content
    const qualityBonus = this.calculateQualityBonus(messageText, messageLength);
    baseXP += qualityBonus;
  
    // 3. Message type bonuses
    const typeBonus = this.calculateMessageTypeBonus(messageText);
    baseXP += typeBonus;
  
    // 4. Time-based bonus (active during peak hours)
    const timeBonus = this.calculateTimeBonus();
    baseXP += timeBonus;
  
    // 5. Channel activity bonus (more active channels = more XP)
    const channelBonus = this.calculateChannelActivityBonus();
    baseXP += channelBonus;
  
    // 6. Activity streak bonus (reward consistent daily activity)
    // This helps balance progression at high levels by rewarding regular play
    const streakBonus = this.calculateActivityStreakBonus();
    baseXP += streakBonus;
  
    // 7. Interaction quality bonus (reply/mention/thread participation)
    const interactionBonus = this.calculateInteractionQualityBonus(messageContext || {}, messageText);
  
    // 8. Anti-abuse scoring (repeat-text + ultra-fast send decay)
    const antiAbuse = this.calculateAntiAbuseScore(messageText, messageContext || {});
    const decayedBaseXp = Math.max(3, Math.round(baseXP * antiAbuse.multiplier));
    const scaledInteractionBonus = Math.round(interactionBonus * Math.max(0.5, antiAbuse.multiplier));
    const finalBaseXp = decayedBaseXp + scaledInteractionBonus;
  
    this._lastAntiAbuseMeta = {
      antiAbuse,
      interactionBonus,
      scaledInteractionBonus,
      preDecayBaseXP: baseXP,
      postDecayBaseXP: finalBaseXp,
    };
  
    return finalBaseXp;
  },

  getXPRequiredForLevel(level) {
    // Check cache first (level XP requirements never change)
    if (this._cache.xpRequiredForLevel.has(level)) {
      return this._cache.xpRequiredForLevel.get(level);
    }
  
    const baseXP = 100;
    const exponentialPart = baseXP * Math.pow(level, 1.6);
    const linearPart = baseXP * level * 0.25;
    const result = Math.round(exponentialPart + linearPart);
  
    if (this._cache.xpRequiredForLevel.size < 1000) {
      this._cache.xpRequiredForLevel.set(level, result);
    }
  
    return result;
  },

  getStatPointsForLevel(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    if (normalizedLevel < 100) return 5;
    if (normalizedLevel < 300) return 4;
    if (normalizedLevel < 700) return 3;
    if (normalizedLevel < 1200) return 2;
    return 1;
  },

  getTitleXpCapForLevel(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    if (normalizedLevel < 200) return 0.35;
    if (normalizedLevel < 500) return 0.45;
    if (normalizedLevel < 1000) return 0.55;
    if (normalizedLevel < 1500) return 0.65;
    return 0.75;
  },

  getPerMessageXpSoftCap(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.round(220 + normalizedLevel * 2.8);
  },

  getPerMessageXpHardCap(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.round(420 + normalizedLevel * 4.2);
  },

  applyXpGovernors(rawXp, level) {
    let xp = Math.max(0, Math.round(Number(rawXp) || 0));
    const softCap = this.getPerMessageXpSoftCap(level);
    const hardCap = this.getPerMessageXpHardCap(level);
  
    if (xp > softCap) {
      const overflow = xp - softCap;
      const capGap = Math.max(1, hardCap - softCap);
      // Smooth overflow compression: tiny overages stay tiny, large spikes asymptotically
      // approach the hard cap without jumping there immediately.
      const compressionScale = Math.max(1, Math.round(capGap / 4));
      const compressedOverflow = Math.min(capGap, Math.round(Math.sqrt(overflow * compressionScale)));
      xp = softCap + compressedOverflow;
    }
  
    return Math.min(xp, hardCap);
  },

  getRankMultiplier() {
    return this.rankData.xpMultipliers[this.settings.rank] || 1.0;
  }
};
