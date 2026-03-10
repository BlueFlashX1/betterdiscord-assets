const ActiveSkillMethods = {
  isActiveSkillUnlocked(activeSkillId) {
    const def = this.activeSkillDefs[activeSkillId];
    if (!def || !def.unlock) return false;
    const passiveLevel = this.getSkillLevel(def.unlock.passiveSkill);
    return passiveLevel >= def.unlock.passiveLevel;
  },

  _computeMaxManaFromStats() {
    const soloData = this.getSoloLevelingData();
    const intelligence = soloData?.stats?.intelligence || 0;
    return 100 + intelligence * 2;
  },

  _getSoloLevelingInstance(now = Date.now()) {
    if (
      this._cache.soloPluginInstance &&
      this._cache.soloPluginInstanceTime &&
      now - this._cache.soloPluginInstanceTime < this._cache.soloPluginInstanceTTL
    ) {
      return this._cache.soloPluginInstance;
    }

    const instance = this._SLUtils?.getPluginInstance?.("SoloLevelingStats") || null;
    this._cache.soloPluginInstance = instance;
    this._cache.soloPluginInstanceTime = now;
    return instance;
  },

  _getSharedManaInfo() {
    const instance = this._getSoloLevelingInstance();
    if (!instance?.settings) return null;

    const fallbackMax = this._computeMaxManaFromStats();
    const loadedMax = Number(instance.settings.userMaxMana);
    const max = Number.isFinite(loadedMax) && loadedMax > 0 ? loadedMax : fallbackMax;
    const loadedCurrent = Number(instance.settings.userMana);

    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(loadedCurrent)) {
      return null;
    }

    return {
      instance,
      max,
      current: Math.max(0, Math.min(loadedCurrent, max)),
    };
  },

  _setSharedMana(nextMana, maxManaHint) {
    const instance = this._getSoloLevelingInstance();
    if (!instance?.settings) return false;

    const loadedMax = Number(instance.settings.userMaxMana);
    const max =
      Number.isFinite(loadedMax) && loadedMax > 0
        ? loadedMax
        : Number.isFinite(maxManaHint) && maxManaHint > 0
          ? maxManaHint
          : this._computeMaxManaFromStats();

    if (!Number.isFinite(max) || max <= 0) return false;

    const current = Math.max(0, Math.min(Number(nextMana) || 0, max));
    instance.settings.userMaxMana = max;
    instance.settings.userMana = current;
    if (typeof instance.updateChatUI === "function") {
      instance.updateChatUI();
    }
    return true;
  },

  getManaInfo() {
    const sharedMana = this._getSharedManaInfo();
    if (sharedMana) {
      this.settings.currentMana = sharedMana.current;
      this.settings.maxMana = sharedMana.max;
      return { current: sharedMana.current, max: sharedMana.max };
    }

    const maxMana = this._computeMaxManaFromStats();
    const current = Math.max(0, Math.min(this.settings.currentMana || 0, maxMana));
    this.settings.currentMana = current;
    this.settings.maxMana = maxMana;
    return { current, max: maxMana };
  },

  tickManaRegen() {
    const now = Date.now();
    const lastRegen = this.settings.lastManaRegen || now;
    const elapsedMinutes = (now - lastRegen) / 60000;
    if (elapsedMinutes < 0.5) return;

    const soloData = this.getSoloLevelingData();
    const intelligence = soloData?.stats?.intelligence || 0;
    const regenPerMinute = 1 + intelligence * 0.1;
    const regenAmount = regenPerMinute * elapsedMinutes;

    const manaInfo = this.getManaInfo();
    const nextMana = Math.min((manaInfo.current || 0) + regenAmount, manaInfo.max);
    this.settings.currentMana = nextMana;
    this.settings.maxMana = manaInfo.max;
    this._setSharedMana(nextMana, manaInfo.max);
    this.settings.lastManaRegen = now;
  },

  startManaRegen() {
    if (this._manaRegenInterval) return;
    if (!this.settings.lastManaRegen) {
      this.settings.lastManaRegen = Date.now();
    }
    this.tickManaRegen();

    this._manaRegenInterval = setInterval(() => {
      if (this._isStopped) return;
      if (document.hidden) return;
      this.tickManaRegen();
    }, 30000);
  },

  stopManaRegen() {
    if (this._manaRegenInterval) {
      clearInterval(this._manaRegenInterval);
      this._manaRegenInterval = null;
    }
  },

  getActiveSkillState(skillId) {
    const states = this.settings.activeSkillStates || {};
    return states[skillId] || { active: false, expiresAt: 0, cooldownUntil: 0, chargesLeft: 0 };
  },

  isActiveSkillRunning(skillId) {
    const state = this.getActiveSkillState(skillId);
    if (!state.active) return false;
    const def = this.activeSkillDefs[skillId];
    if (def && def.charges && state.chargesLeft > 0) return true;
    if (state.expiresAt > Date.now()) return true;
    this._deactivateSkill(skillId);
    return false;
  },

  isActiveSkillOnCooldown(skillId) {
    const state = this.getActiveSkillState(skillId);
    return state.cooldownUntil > Date.now();
  },

  getActiveSkillCooldownRemaining(skillId) {
    const state = this.getActiveSkillState(skillId);
    const remaining = state.cooldownUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  },

  activateSkill(skillId) {
    const def = this.activeSkillDefs[skillId];
    if (!def) return { success: false, reason: "Unknown skill" };

    if (!this.isActiveSkillUnlocked(skillId)) {
      return { success: false, reason: "Skill not unlocked" };
    }

    if (this.isActiveSkillRunning(skillId)) {
      return { success: false, reason: "Already active" };
    }

    if (this.isActiveSkillOnCooldown(skillId)) {
      const remainMs = this.getActiveSkillCooldownRemaining(skillId);
      const remainMin = Math.ceil(remainMs / 60000);
      return { success: false, reason: `On cooldown (${remainMin}m)` };
    }

    const manaInfo = this.getManaInfo();
    if (manaInfo.current < def.manaCost) {
      return { success: false, reason: `Not enough Mana (${Math.floor(manaInfo.current)}/${def.manaCost})` };
    }

    const remainingMana = Math.max(0, manaInfo.current - def.manaCost);
    this.settings.currentMana = remainingMana;
    this.settings.maxMana = manaInfo.max;
    this._setSharedMana(remainingMana, manaInfo.max);

    const now = Date.now();
    if (!this.settings.activeSkillStates) this.settings.activeSkillStates = {};
    this.settings.activeSkillStates[skillId] = {
      active: true,
      expiresAt: def.durationMs ? now + def.durationMs : 0,
      cooldownUntil: now + def.cooldownMs,
      chargesLeft: def.charges || 0,
    };

    if (def.durationMs) {
      this._setActiveSkillTimer(skillId, def.durationMs);
    }

    this.saveSettings();

    const durationText = def.durationMs
      ? `${Math.round(def.durationMs / 60000)}m`
      : `${def.charges} charge${def.charges > 1 ? "s" : ""}`;
    if (BdApi?.UI?.showToast) {
      this._toast(`${def.name} activated! (${durationText})`, "success", 3000);
    }

    document.dispatchEvent(new CustomEvent("SkillTree:activeSkillActivated", {
      detail: { skillId, effect: def.effect, expiresAt: this.settings.activeSkillStates[skillId].expiresAt },
    }));

    return { success: true };
  },

  _setActiveSkillTimer(skillId, delayMs) {
    if (this._activeSkillTimers[skillId]) {
      clearTimeout(this._activeSkillTimers[skillId]);
    }
    this._activeSkillTimers[skillId] = setTimeout(() => {
      delete this._activeSkillTimers[skillId];
      if (this._isStopped) return;
      this._deactivateSkill(skillId);
    }, delayMs);
  },

  _deactivateSkill(skillId) {
    const state = this.getActiveSkillState(skillId);
    if (!state.active) return;

    this.settings.activeSkillStates[skillId] = {
      ...state,
      active: false,
      expiresAt: 0,
      chargesLeft: 0,
    };

    this.saveSettings();

    const def = this.activeSkillDefs[skillId];
    if (BdApi?.UI?.showToast && def) {
      this._toast(`${def.name} expired.`, "info", 2000);
    }

    document.dispatchEvent(new CustomEvent("SkillTree:activeSkillExpired", {
      detail: { skillId },
    }));
  },

  consumeActiveSkillCharge(skillId) {
    const state = this.getActiveSkillState(skillId);
    if (!state.active || state.chargesLeft <= 0) return false;

    state.chargesLeft -= 1;
    this.settings.activeSkillStates[skillId] = state;

    if (state.chargesLeft <= 0) {
      this._deactivateSkill(skillId);
    } else {
      this.saveSettings();
    }

    return true;
  },

  restoreActiveSkillTimers() {
    const states = this.settings.activeSkillStates || {};
    const now = Date.now();

    Object.entries(states).forEach(([skillId, state]) => {
      if (!state.active) return;
      const def = this.activeSkillDefs[skillId];
      if (!def) return;

      if (def.durationMs && state.expiresAt > 0) {
        const remaining = state.expiresAt - now;
        if (remaining > 0) {
          this._setActiveSkillTimer(skillId, remaining);
        } else {
          this._deactivateSkill(skillId);
        }
      }
    });
  },

  getActiveBuffEffects() {
    const effects = {
      xpMultiplier: 1.0,
      critChanceBonus: 0,
      guaranteedCrit: false,
      allStatMultiplier: 1.0,
      questRewardMultiplier: 1.0,
      shadowBuffMultiplier: 1.0,
      globalMultiplier: 1.0,
    };

    Object.entries(this.activeSkillDefs).forEach(([skillId, def]) => {
      if (!this.isActiveSkillRunning(skillId)) return;
      const eff = def.effect;
      if (eff.xpMultiplier) effects.xpMultiplier *= eff.xpMultiplier;
      if (eff.critChanceBonus) effects.critChanceBonus += eff.critChanceBonus;
      if (eff.guaranteedCrit) effects.guaranteedCrit = true;
      if (eff.allStatMultiplier) effects.allStatMultiplier *= eff.allStatMultiplier;
      if (eff.questRewardMultiplier) effects.questRewardMultiplier *= eff.questRewardMultiplier;
      if (eff.shadowBuffMultiplier) effects.shadowBuffMultiplier *= eff.shadowBuffMultiplier;
      if (eff.globalMultiplier) effects.globalMultiplier *= eff.globalMultiplier;
    });

    return effects;
  },
};

module.exports = { ActiveSkillMethods };
