const dc = require('../shared/discord-classes');

module.exports = {
  checkDailyReset() {
    const today = new Date().toDateString();
    if (this.settings.dailyQuests.lastResetDate !== today) {
      // Reset daily quests
      this.settings.dailyQuests.lastResetDate = today;
      Object.keys(this.settings.dailyQuests.quests).forEach((questId) => {
        this.settings.dailyQuests.quests[questId].progress = 0;
        this.settings.dailyQuests.quests[questId].completed = false;
      });
      // Save immediately on daily reset
      this.saveSettings(true);
      this.debugLog('DAILY_QUESTS', 'Daily quests reset');
    }
  },

  checkCriticalHitBonus() {
    // Check if the last message was a critical hit
    // CriticalHit plugin adds 'bd-crit-hit' class to crit messages
    // Agility affects EXP multiplier: base 0.25 (25%) + agility bonus
    try {
      this._cache.lastAppliedCritBurst = null;
  
      const getMessageContainerElement = () => this.getMessageContainer();
  
      const findMessageElementById = (messageId) => {
        if (!messageId) return null;
  
        const cssEscape =
          typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function'
            ? window.CSS.escape
            : null;
        const safe = cssEscape
          ? cssEscape(String(messageId))
          : String(messageId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  
        const container = getMessageContainerElement() || document;
  
        // Discord commonly uses data-list-item-id that includes the message id
        return (
          container.querySelector?.(`[data-list-item-id*="${safe}"]`) ||
          container.querySelector?.(`#${safe}`) ||
          null
        );
      };
  
      const findLatestOwnMessageElement = (limit = 25) => {
        const container = getMessageContainerElement();
        if (!container) return null;
  
        const nodes = Array.from(container.querySelectorAll?.(dc.sel.message) || []);
        if (!nodes.length) return null;
  
        const currentUserId = this.currentUserId || this.settings?.ownUserId || null;
        return nodes
          .slice(-limit)
          .reverse()
          .find((el) => this.isOwnMessage?.(el, currentUserId));
      };
  
      const cachedLast = this.lastMessageElement;
      const lastMessageElement =
        cachedLast && cachedLast.isConnected
          ? cachedLast
          : (this.lastMessageId && findMessageElementById(this.lastMessageId)) ||
            findLatestOwnMessageElement();
  
      if (lastMessageElement) {
        this.lastMessageElement = lastMessageElement;
        this.lastMessageId = this.lastMessageId || this.getMessageId(lastMessageElement);
      }
  
      const isCrit = !!(
        lastMessageElement && lastMessageElement.classList?.contains('bd-crit-hit')
      );
  
      if (!isCrit) {
        return 0; // No crit bonus
      }
  
      // Get agility stat for EXP multiplier
      const agilityStat = this.settings.stats?.agility || 0;
  
      // Base crit bonus: 0.20 (20%)
      // Agility bonus: +0.006 per point (0.6% per agility point), capped for stability.
      const agilityBonus = Math.min(0.75, agilityStat * 0.006);
      const baseCritBonus = 0.2;
      let critMultiplier = baseCritBonus + agilityBonus;
  
      // Check burst-hit multiplier produced by CriticalHit (PER-driven multi-crit)
      try {
        const now = Date.now();
        const cachedComboData = this._cache?.criticalHitComboData;
        const cachedComboDataTime = this._cache?.criticalHitComboDataTime || 0;
        const comboTTL = this._cache?.criticalHitComboDataTTL ?? 500;
  
        const comboData =
          now - cachedComboDataTime < comboTTL
            ? cachedComboData
            : (() => {
                try {
                  // Read combo from live CriticalHit instance (was reading dead 'CriticalHitAnimation' key)
                  let liveCombo = null;
                  try {
                    const chPlugin = BdApi.Plugins.isEnabled('CriticalHit') && BdApi.Plugins.get('CriticalHit');
                    const chInstance = chPlugin?.instance;
                    if (chInstance?.getUserCombo) {
                      const userId = this.UserStore?.getCurrentUser?.()?.id;
                      liveCombo = userId ? chInstance.getUserCombo(userId) : null;
                    }
                  } catch (_) { /* CriticalHit unavailable */ }
                  const loaded = {
                    combo: liveCombo,
                    burst: BdApi.Data.load('CriticalHit', 'lastCritBurst'),
                  };
                  this._cache.criticalHitComboData = loaded;
                  this._cache.criticalHitComboDataTime = now;
                  return loaded;
                } catch (_error) {
                  // Cache a null for this window to avoid repeated failing reads
                  this._cache.criticalHitComboData = null;
                  this._cache.criticalHitComboDataTime = now;
                  return null;
                }
              })();
  
        const comboCount = comboData?.combo?.comboCount || 1;
        const burstData = comboData?.burst || null;
        let burstHits = Math.max(1, Number(burstData?.burstHits || comboCount || 1));
  
        // If burst is for a different message, ignore it for this XP calc.
        if (
          burstData?.messageId &&
          this.lastMessageId &&
          String(burstData.messageId) !== String(this.lastMessageId)
        ) {
          burstHits = 1;
        }
  
        if (burstHits > 1) {
          // PER burst bonus uses diminishing returns + hard caps.
          // This preserves burst reward identity without making leveling trivial.
          const effectiveBurstHits = Math.min(25, burstHits); // ignore extreme jackpot tails for XP scaling
          const logGain = Math.log2(effectiveBurstHits + 1) * 0.045;
          const chainGain = (Math.min(12, effectiveBurstHits) - 1) * 0.008;
          const burstBonus = Math.min(0.45, logGain + chainGain); // Max +45%
          critMultiplier += burstBonus;
  
          // Light AGI synergy (kept modest to avoid runaway scaling)
          const agilityBurstEnhancement = burstBonus * Math.min(0.12, agilityStat * 0.001);
          critMultiplier += agilityBurstEnhancement;
  
          this._cache.lastAppliedCritBurst = {
            burstHits,
            effectiveBurstHits,
            burstBonus,
            agilityBurstEnhancement,
            messageId: this.lastMessageId || null,
            timestamp: now,
          };
  
          this.debugLog('CHECK_CRIT_BONUS', 'Burst detected', {
            burstHits,
            effectiveBurstHits,
            burstBonus: (burstBonus * 100).toFixed(1) + '%',
            agilityBurstEnhancement: (agilityBurstEnhancement * 100).toFixed(1) + '%',
            totalBurstBonus: ((burstBonus + agilityBurstEnhancement) * 100).toFixed(1) + '%',
          });
        }
      } catch (error) {
        // Burst data not available or error accessing
      }
  
      // Hard cap total crit multiplier to avoid runaway XP spikes.
      critMultiplier = Math.min(1.35, critMultiplier);
  
      this.debugLog('CHECK_CRIT_BONUS', 'Crit bonus calculated', {
        baseCritBonus: (baseCritBonus * 100).toFixed(0) + '%',
        agilityStat,
        agilityBonus: (agilityBonus * 100).toFixed(1) + '%',
        totalMultiplier: (critMultiplier * 100).toFixed(1) + '%',
      });
  
      return critMultiplier;
    } catch (error) {
      this.debugError('CHECK_CRIT_BONUS', error);
    }
  
    return 0; // No crit bonus
  },

  integrateWithCriticalHit() {
    // AGI = crit chance provider, PER = burst-hit provider for CriticalHit.
    // Data is shared through BdApi.Data.
  
    // Initialize variables at function scope to prevent ReferenceError in catch block
    let cappedCritBonus = 0;
    let enhancedAgilityBonus = 0;
    let baseAgilityBonus = 0;
    let titleCritBonus = 0;
    let agilityStat = 0;
  
    try {
      // Validate settings exist
      if (!this.settings || !this.settings.stats) {
        this.debugError('SAVE_AGILITY_BONUS', new Error('Settings or stats not initialized'));
        return;
      }
  
      // AGI system: +2% crit chance per AGI point (+title crit chance)
      // Effective crit chance is capped in CriticalHit at 50%.
  
      agilityStat = this.settings.stats.agility || 0;
      baseAgilityBonus = agilityStat * 0.02; // 2% per point
      const titleBonus = this.getActiveTitleBonus();
      titleCritBonus = titleBonus.critChance || 0;
  
      // FUNCTIONAL: Sum crit bonuses, cap at 50% (0.50)
      const totalCritChance = Math.min(baseAgilityBonus + titleCritBonus, 0.5);
      cappedCritBonus = totalCritChance; // Alias for clarity
      enhancedAgilityBonus = baseAgilityBonus; // Agility-only crit chance
  
      // Prepare data object (ensure all values are serializable numbers)
      const agilityData = {
        bonus: isNaN(cappedCritBonus) ? 0 : Number(cappedCritBonus.toFixed(6)),
        baseBonus: isNaN(baseAgilityBonus) ? 0 : Number(baseAgilityBonus.toFixed(6)),
        titleCritBonus: isNaN(titleCritBonus) ? 0 : Number(titleCritBonus.toFixed(6)),
        agility: agilityStat,
        perceptionEnhanced: false,
        capped: totalCritChance >= 0.5, // Indicate if it was capped at 50%
      };
  
      // Always save agility bonus (even if 0) so CriticalHit knows current agility
      BdApi.Data.save('SoloLevelingStats', 'agilityBonus', agilityData);
  
      // Only log if there's a bonus
      if (cappedCritBonus > 0) {
        const bonusParts = [];
        if (enhancedAgilityBonus > 0)
          bonusParts.push(`Agility: +${(enhancedAgilityBonus * 100).toFixed(1)}%`);
        if (titleCritBonus > 0) bonusParts.push(`Title: +${(titleCritBonus * 100).toFixed(1)}%`);
        this.debugLog(
          'AGILITY_BONUS',
          `Crit bonus available for CriticalHit: +${(cappedCritBonus * 100).toFixed(
            1
          )}% (${bonusParts.join(', ')})`
        );
      }
  
      // Save PER burst profile for CriticalHit (PER now controls multi-hit burst size, not crit chance)
      try {
        const perceptionProfile = this.getPerceptionBurstProfile();
        const perceptionData = {
          perception: perceptionProfile.perception,
          effectivePerception: perceptionProfile.perception,
          burstChance: Number(perceptionProfile.burstChance.toFixed(6)),
          maxHits: perceptionProfile.maxHits,
          jackpotChance: Number(perceptionProfile.jackpotChance.toFixed(6)),
          updatedAt: Date.now(),
        };
  
        BdApi.Data.save('SoloLevelingStats', 'perceptionBurst', perceptionData);
  
        // Backward compatibility payload for older readers: luck no longer affects crit chance.
        BdApi.Data.save('SoloLevelingStats', 'luckBonus', {
          bonus: 0,
          perception: perceptionProfile.perception,
          luck: perceptionProfile.perception,
          luckBuffs: [],
          totalBuffPercent: 0,
        });
  
        this.debugLog('PERCEPTION_BURST', 'Perception burst profile synced for CriticalHit', {
          perception: perceptionProfile.perception,
          burstChance: `${(perceptionProfile.burstChance * 100).toFixed(1)}%`,
          maxHits: perceptionProfile.maxHits,
          jackpotChance: `${(perceptionProfile.jackpotChance * 100).toFixed(2)}%`,
        });
      } catch (error) {
        this.debugError('SAVE_PERCEPTION_BURST', error);
      }
    } catch (error) {
      // Error saving bonus - log but don't crash
      this.debugError('SAVE_AGILITY_BONUS', error);
    }
  },

  saveAgilityBonus() {
    // Alias for integrateWithCriticalHit for backward compatibility
    this.integrateWithCriticalHit();
  }
};
