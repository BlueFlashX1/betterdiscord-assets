const ACTIVE_SKILL_PHASES = Object.freeze({
  LOCKED: "LOCKED",
  IDLE: "IDLE",
  CHANNELING: "CHANNELING",
  COOLDOWN: "COOLDOWN",
});

const ACTIVE_SKILL_EMPTY_STATE = Object.freeze({
  active: false,
  expiresAt: 0,
  cooldownUntil: 0,
  chargesLeft: 0,
});

const DUNGEON_COMBAT_SKILL_EMPTY_STATE = Object.freeze({
  cooldownUntil: 0,
  lastUsedAt: 0,
});

const ACTIVE_SKILL_STATE_EVENT = "SkillTree:activeSkillStateChanged";
const DUNGEON_COMBAT_SKILL_STATE_EVENT = "SkillTree:dungeonCombatSkillStateChanged";

const ActiveSkillMethods = {
  _getEffectiveManaCost(baseManaCost) {
    const reduction = this.calculateSkillBonuses?.()?.manaCostReduction || 0;
    return Math.max(1, Math.ceil(baseManaCost * (1 - reduction)));
  },

  isActiveSkillUnlocked(activeSkillId) {
    const def = this.activeSkillDefs[activeSkillId];
    if (!def || !def.unlock) return false;
    const passiveLevel = this.getSkillLevel(def.unlock.passiveSkill);
    return passiveLevel >= def.unlock.passiveLevel;
  },

  _computeMaxManaFromStats() {
    const soloData = this.getSoloLevelingData();
    const intelligence = soloData?.stats?.intelligence || 0;
    // Must match SoloLevelingStats hp-mana.js calculateMana: 100 + INT*10 + flatMana
    // flatMana comes from SkillTree bonuses — not available here in the fallback path, so use 0
    return 100 + intelligence * 10;
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

  _persistSettingsFast() {
    try {
      BdApi?.Data?.save?.("SkillTree", "settings", this.settings);
    } catch (_) {
      // Non-critical best-effort persistence for high-frequency mana ticks.
    }
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

  _getManaRegenPerMinute() {
    const soloData = this.getSoloLevelingData();
    const intelligence = soloData?.stats?.intelligence || 0;
    const bonuses =
      typeof this.calculateSkillBonuses === 'function' ? this.calculateSkillBonuses() || {} : {};
    const longevityMultiplier = 1 + Math.max(0, Number(bonuses.manaRegenBonus || 0));
    return (1 + intelligence * 0.1) * longevityMultiplier;
  },

  tickManaRegen() {
    const now = Date.now();
    const lastRegen = this.settings.lastManaRegen || now;
    const elapsedMinutes = (now - lastRegen) / 60000;
    if (elapsedMinutes < 0.5) return;

    const regenPerMinute = this._getManaRegenPerMinute();
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

  _cloneActiveSkillState(state) {
    if (!state || typeof state !== "object") {
      return { ...ACTIVE_SKILL_EMPTY_STATE };
    }
    return {
      active: Boolean(state.active),
      expiresAt: Number(state.expiresAt) || 0,
      cooldownUntil: Number(state.cooldownUntil) || 0,
      chargesLeft: Math.max(0, Number(state.chargesLeft) || 0),
    };
  },

  getActiveSkillState(skillId) {
    const states = this.settings.activeSkillStates || {};
    return this._cloneActiveSkillState(states[skillId]);
  },

  getActiveSkillPhase(skillId, now = Date.now()) {
    if (!this.isActiveSkillUnlocked(skillId)) return ACTIVE_SKILL_PHASES.LOCKED;

    const state = this.getActiveSkillState(skillId);
    if (state.active) {
      const def = this.activeSkillDefs[skillId];
      if (def?.charges && state.chargesLeft <= 0) {
        this._deactivateSkill(skillId, "charges_exhausted");
        return this.getActiveSkillPhase(skillId, now);
      }
      if (def?.durationMs && state.expiresAt > 0 && state.expiresAt <= now) {
        this._deactivateSkill(skillId, "expired");
        return this.getActiveSkillPhase(skillId, now);
      }
      return ACTIVE_SKILL_PHASES.CHANNELING;
    }

    if (state.cooldownUntil > now) return ACTIVE_SKILL_PHASES.COOLDOWN;
    return ACTIVE_SKILL_PHASES.IDLE;
  },

  getActiveSkillRuntimeSnapshot(skillId, now = Date.now()) {
    const def = this.activeSkillDefs[skillId] || null;
    const phase = this.getActiveSkillPhase(skillId, now);
    const state = this.getActiveSkillState(skillId);
    const mana = this.getManaInfo();
    const cooldownRemaining = Math.max(0, state.cooldownUntil - now);
    const expiresIn =
      phase === ACTIVE_SKILL_PHASES.CHANNELING && state.expiresAt > 0
        ? Math.max(0, state.expiresAt - now)
        : 0;

    return {
      skillId,
      def,
      state,
      phase,
      unlocked: phase !== ACTIVE_SKILL_PHASES.LOCKED,
      isRunning: phase === ACTIVE_SKILL_PHASES.CHANNELING,
      isOnCooldown: phase === ACTIVE_SKILL_PHASES.COOLDOWN,
      cooldownRemaining,
      expiresIn,
      mana,
    };
  },

  _emitActiveSkillStateChange(skillId, prevState, nextState, reason, extra = {}) {
    const snapshot = this.getActiveSkillRuntimeSnapshot(skillId);
    document.dispatchEvent(
      new CustomEvent(ACTIVE_SKILL_STATE_EVENT, {
        detail: {
          skillId,
          prevState: prevState || null,
          nextState: nextState || null,
          reason: reason || "updated",
          mana: snapshot.mana.current,
          cooldownUntil: snapshot.state.cooldownUntil || 0,
          expiresAt: snapshot.state.expiresAt || 0,
          timestamp: Date.now(),
          ...extra,
        },
      })
    );
  },

  isActiveSkillRunning(skillId) {
    return this.getActiveSkillPhase(skillId) === ACTIVE_SKILL_PHASES.CHANNELING;
  },

  isActiveSkillOnCooldown(skillId) {
    return this.getActiveSkillPhase(skillId) === ACTIVE_SKILL_PHASES.COOLDOWN;
  },

  getActiveSkillCooldownRemaining(skillId) {
    const state = this.getActiveSkillState(skillId);
    const remaining = state.cooldownUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  },

  _clearActiveSkillTimer(skillId) {
    if (this._activeSkillTimers[skillId]) {
      clearTimeout(this._activeSkillTimers[skillId]);
      delete this._activeSkillTimers[skillId];
    }
  },

  _clearActiveSkillSustain(skillId) {
    if (!this._activeSkillSustainIntervals) this._activeSkillSustainIntervals = {};
    const timerId = this._activeSkillSustainIntervals[skillId];
    if (!timerId) return;
    clearInterval(timerId);
    delete this._activeSkillSustainIntervals[skillId];
  },

  _startActiveSkillSustain(skillId) {
    const def = this.activeSkillDefs[skillId];
    const sustain = def?.sustain;
    if (!sustain) return;

    const tickMs = Math.max(1000, Number(sustain.tickMs) || 0);
    const baseManaPerTick = Math.max(0, Number(sustain.manaPerTick) || 0);
    const policy = String(sustain.policy || "").trim().toLowerCase();
    const regenSafetyMultiplier = Math.max(
      0.1,
      Math.min(0.99, Number(sustain.regenSafetyMultiplier) || 0.9)
    );
    const minManaFloor = Math.max(0, Number(sustain.minManaFloor) || 0);
    const persistEveryTicks = Math.max(1, Math.round(10000 / tickMs));
    if (!tickMs || !baseManaPerTick) return;

    if (!this._activeSkillSustainIntervals) this._activeSkillSustainIntervals = {};
    this._clearActiveSkillSustain(skillId);
    let tickCounter = 0;

    this._activeSkillSustainIntervals[skillId] = setInterval(() => {
      if (this._isStopped) return;
      const running = this.isActiveSkillRunning(skillId);
      if (!running) {
        this._clearActiveSkillSustain(skillId);
        return;
      }

      const manaInfo = this.getManaInfo();
      let effectiveManaPerTick = baseManaPerTick;
      if (policy === "never_deplete") {
        const regenPerMinute = this._getManaRegenPerMinute();
        const regenPerTick = (regenPerMinute * tickMs) / 60000;
        const cappedDrain = Math.max(0, regenPerTick * regenSafetyMultiplier);
        effectiveManaPerTick = Math.min(baseManaPerTick, cappedDrain);
      }

      if (effectiveManaPerTick <= 0) return;

      if (policy === "never_deplete" && manaInfo.current <= minManaFloor + effectiveManaPerTick) {
        const flooredMana = Math.max(minManaFloor, manaInfo.current);
        this.settings.currentMana = flooredMana;
        this.settings.maxMana = manaInfo.max;
        this._setSharedMana(flooredMana, manaInfo.max);
        tickCounter += 1;
        if (tickCounter >= persistEveryTicks) {
          tickCounter = 0;
          this._persistSettingsFast();
        }
        return;
      }

      if (manaInfo.current < effectiveManaPerTick) {
        this._deactivateSkill(skillId, "mana_depleted");
        return;
      }

      const remainingMana = Math.max(0, manaInfo.current - effectiveManaPerTick);
      this.settings.currentMana = remainingMana;
      this.settings.maxMana = manaInfo.max;
      this._setSharedMana(remainingMana, manaInfo.max);
      tickCounter += 1;
      if (tickCounter >= persistEveryTicks) {
        tickCounter = 0;
        this._persistSettingsFast();
      }

      if (typeof this._modalForceUpdate === "function") {
        this._modalForceUpdate();
      }
    }, tickMs);
  },

  activateSkill(skillId) {
    const def = this.activeSkillDefs[skillId];
    if (!def) return { success: false, reason: "Unknown skill" };

    const prevPhase = this.getActiveSkillPhase(skillId);
    if (prevPhase === ACTIVE_SKILL_PHASES.LOCKED) {
      return { success: false, reason: "Skill not unlocked" };
    }

    if (prevPhase === ACTIVE_SKILL_PHASES.CHANNELING) {
      return { success: false, reason: "Already active" };
    }

    if (prevPhase === ACTIVE_SKILL_PHASES.COOLDOWN) {
      const remainMs = this.getActiveSkillCooldownRemaining(skillId);
      const remainMin = Math.ceil(remainMs / 60000);
      return { success: false, reason: `On cooldown (${remainMin}m)` };
    }

    const manaInfo = this.getManaInfo();
    const effectiveManaCost = this._getEffectiveManaCost(def.manaCost);
    if (manaInfo.current < effectiveManaCost) {
      return { success: false, reason: `Not enough Mana (${Math.floor(manaInfo.current)}/${effectiveManaCost})` };
    }

    const remainingMana = Math.max(0, manaInfo.current - effectiveManaCost);
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
    this._startActiveSkillSustain(skillId);

    this.saveSettings();

    let durationText = "Active";
    if (def.durationMs) {
      durationText = `${Math.round(def.durationMs / 60000)}m`;
    } else if (def.charges) {
      durationText = `${def.charges} charge${def.charges > 1 ? "s" : ""}`;
    } else if (def.sustain) {
      durationText = "Sustained";
    }
    if (BdApi?.UI?.showToast) {
      this._toast(`${def.name} activated! (${durationText})`, "success", 3000);
    }

    document.dispatchEvent(
      new CustomEvent("SkillTree:activeSkillActivated", {
        detail: { skillId, effect: def.effect, expiresAt: this.settings.activeSkillStates[skillId].expiresAt },
      })
    );

    const nextPhase = this.getActiveSkillPhase(skillId);
    this._emitActiveSkillStateChange(skillId, prevPhase, nextPhase, "activated", {
      effect: def.effect || {},
    });

    return { success: true };
  },

  deactivateSkill(skillId, reason = "manual") {
    const def = this.activeSkillDefs[skillId];
    if (!def) return { success: false, reason: "Unknown skill" };
    if (!this.isActiveSkillRunning(skillId)) {
      return { success: false, reason: "Not active" };
    }
    this._deactivateSkill(skillId, reason);
    return { success: true };
  },

  _setActiveSkillTimer(skillId, delayMs) {
    this._clearActiveSkillTimer(skillId);
    this._activeSkillTimers[skillId] = setTimeout(() => {
      delete this._activeSkillTimers[skillId];
      if (this._isStopped) return;
      this._deactivateSkill(skillId, "expired");
    }, delayMs);
  },

  _deactivateSkill(skillId, reason = "expired") {
    const prevPhase = this.getActiveSkillPhase(skillId);
    const state = this.getActiveSkillState(skillId);
    if (!state.active) return;

    this._clearActiveSkillTimer(skillId);
    this._clearActiveSkillSustain(skillId);

    if (!this.settings.activeSkillStates) this.settings.activeSkillStates = {};
    this.settings.activeSkillStates[skillId] = {
      ...state,
      active: false,
      expiresAt: 0,
      cooldownUntil: reason === "manual" ? 0 : state.cooldownUntil,
      chargesLeft: 0,
    };

    this.saveSettings();

    const def = this.activeSkillDefs[skillId];
    if (BdApi?.UI?.showToast && def) {
      let toastText = `${def.name} expired.`;
      if (reason === "manual") toastText = `${def.name} deactivated.`;
      if (reason === "mana_depleted") toastText = `${def.name} ended (Mana depleted).`;
      this._toast(toastText, "info", 2200);
    }

    document.dispatchEvent(
      new CustomEvent("SkillTree:activeSkillExpired", {
        detail: { skillId, reason },
      })
    );

    const nextPhase = this.getActiveSkillPhase(skillId);
    this._emitActiveSkillStateChange(skillId, prevPhase, nextPhase, reason);
  },

  consumeActiveSkillCharge(skillId) {
    const state = this.getActiveSkillState(skillId);
    if (!state.active || state.chargesLeft <= 0) return false;

    // Write back with spread to preserve all fields (state is a clone)
    if (!this.settings.activeSkillStates) this.settings.activeSkillStates = {};
    this.settings.activeSkillStates[skillId] = { ...state, chargesLeft: state.chargesLeft - 1 };

    if (state.chargesLeft - 1 <= 0) {
      this._deactivateSkill(skillId, "charges_exhausted");
    } else {
      this.saveSettings();
    }

    return true;
  },

  isDungeonCombatSkillUnlocked(skillId) {
    const def = this.dungeonCombatSkillDefs?.[skillId];
    if (!def?.unlock) return false;
    const passiveLevel = this.getSkillLevel(def.unlock.passiveSkill);
    return passiveLevel >= def.unlock.passiveLevel;
  },

  _cloneDungeonCombatSkillState(state) {
    if (!state || typeof state !== "object") {
      return { ...DUNGEON_COMBAT_SKILL_EMPTY_STATE };
    }
    return {
      cooldownUntil: Math.max(0, Number(state.cooldownUntil) || 0),
      lastUsedAt: Math.max(0, Number(state.lastUsedAt) || 0),
    };
  },

  getDungeonCombatSkillState(skillId) {
    const states = this.settings.combatSkillStates || {};
    return this._cloneDungeonCombatSkillState(states[skillId]);
  },

  getDungeonCombatSkillCooldownRemaining(skillId, now = Date.now()) {
    const state = this.getDungeonCombatSkillState(skillId);
    return Math.max(0, state.cooldownUntil - now);
  },

  _getOffensiveCooldownReduction() {
    const bonuses =
      typeof this.calculateSkillBonuses === "function" ? this.calculateSkillBonuses() || {} : {};
    return Math.max(0, Math.min(0.35, Number(bonuses.attackCooldownReduction || 0)));
  },

  getEffectiveDungeonCombatSkillCooldownMs(skillId) {
    const def = this.dungeonCombatSkillDefs?.[skillId];
    if (!def) return 0;

    const baseCooldown = Math.max(1000, Number(def.cooldownMs) || 0);
    const minimumCooldown = Math.max(
      1000,
      Number(def.minimumCooldownMs || def.minCooldownMs) || 0
    );
    const reduction = this._getOffensiveCooldownReduction();
    return Math.max(minimumCooldown, Math.round(baseCooldown * (1 - reduction)));
  },

  getDungeonCombatSkillRuntimeSnapshot(skillId, now = Date.now()) {
    const def = this.dungeonCombatSkillDefs?.[skillId] || null;
    const unlocked = def ? this.isDungeonCombatSkillUnlocked(skillId) : false;
    const state = this.getDungeonCombatSkillState(skillId);
    const mana = this.getManaInfo();
    const cooldownRemaining = Math.max(0, state.cooldownUntil - now);

    return {
      skillId,
      def,
      unlocked,
      state,
      mana,
      isOnCooldown: cooldownRemaining > 0,
      cooldownRemaining,
      effectiveCooldownMs: def ? this.getEffectiveDungeonCombatSkillCooldownMs(skillId) : 0,
      effectiveManaCost: def ? this._getEffectiveManaCost(def.manaCost) : 0,
      ready:
        Boolean(def) &&
        unlocked &&
        cooldownRemaining <= 0 &&
        mana.current >= (def ? this._getEffectiveManaCost(def.manaCost) : 0),
    };
  },

  getAvailableDungeonCombatSkillSnapshots(now = Date.now()) {
    return (this.dungeonCombatSkillOrder || [])
      .map((skillId) => this.getDungeonCombatSkillRuntimeSnapshot(skillId, now))
      .filter((snapshot) => snapshot?.def);
  },

  _emitDungeonCombatSkillStateChange(skillId, prevState, nextState, reason, extra = {}) {
    document.dispatchEvent(
      new CustomEvent(DUNGEON_COMBAT_SKILL_STATE_EVENT, {
        detail: {
          skillId,
          prevState: prevState || null,
          nextState: nextState || null,
          reason: reason || "updated",
          timestamp: Date.now(),
          ...extra,
        },
      })
    );
  },

  useDungeonCombatSkill(skillId) {
    const def = this.dungeonCombatSkillDefs?.[skillId];
    if (!def) return { success: false, reason: "Unknown combat skill" };

    if (!this.isDungeonCombatSkillUnlocked(skillId)) {
      return { success: false, reason: "Skill not unlocked" };
    }

    const now = Date.now();
    const prevState = this.getDungeonCombatSkillState(skillId);
    const cooldownRemaining = Math.max(0, prevState.cooldownUntil - now);
    if (cooldownRemaining > 0) {
      return {
        success: false,
        reason: `On cooldown (${Math.ceil(cooldownRemaining / 1000)}s)`,
      };
    }

    const manaInfo = this.getManaInfo();
    const effectiveManaCost = this._getEffectiveManaCost(def.manaCost);
    if (manaInfo.current < effectiveManaCost) {
      return {
        success: false,
        reason: `Not enough Mana (${Math.floor(manaInfo.current)}/${effectiveManaCost})`,
      };
    }

    const cooldownMs = this.getEffectiveDungeonCombatSkillCooldownMs(skillId);
    const remainingMana = Math.max(0, manaInfo.current - effectiveManaCost);
    const nextState = {
      cooldownUntil: now + cooldownMs,
      lastUsedAt: now,
    };

    this.settings.currentMana = remainingMana;
    this.settings.maxMana = manaInfo.max;
    this._setSharedMana(remainingMana, manaInfo.max);

    if (!this.settings.combatSkillStates) this.settings.combatSkillStates = {};
    this.settings.combatSkillStates[skillId] = nextState;

    this.saveSettings();
    this._emitDungeonCombatSkillStateChange(skillId, prevState, nextState, "used", {
      cooldownUntil: nextState.cooldownUntil,
      mana: remainingMana,
    });

    return {
      success: true,
      def,
      state: nextState,
      mana: { current: remainingMana, max: manaInfo.max },
      cooldownMs,
      cooldownUntil: nextState.cooldownUntil,
      snapshot: this.getDungeonCombatSkillRuntimeSnapshot(skillId),
    };
  },

  restoreActiveSkillTimers() {
    const states = this.settings.activeSkillStates || {};
    const now = Date.now();

    Object.entries(states).forEach(([skillId, rawState]) => {
      const state = this._cloneActiveSkillState(rawState);
      if (!state.active) return;
      const def = this.activeSkillDefs[skillId];
      if (!def) return;

      this._startActiveSkillSustain(skillId);

      if (def.durationMs && state.expiresAt > 0) {
        const remaining = state.expiresAt - now;
        if (remaining > 0) {
          this._setActiveSkillTimer(skillId, remaining);
        } else {
          this._deactivateSkill(skillId, "expired");
          return;
        }
      }

      const nextPhase = this.getActiveSkillPhase(skillId);
      this._emitActiveSkillStateChange(skillId, null, nextPhase, "restored");
    });
  },

  getActiveBuffEffects() {
    const effects = {
      xpMultiplier: 1.0,
      critChanceBonus: 0,
      guaranteedCrit: false,
      allStatMultiplier: 1.0,
      globalMultiplier: 1.0,
    };

    Object.entries(this.activeSkillDefs).forEach(([skillId, def]) => {
      if (!this.isActiveSkillRunning(skillId)) return;
      const eff = def.effect;
      if (eff.xpMultiplier) effects.xpMultiplier *= eff.xpMultiplier;
      if (eff.critChanceBonus) effects.critChanceBonus += eff.critChanceBonus;
      if (eff.guaranteedCrit) effects.guaranteedCrit = true;
      if (eff.allStatMultiplier) effects.allStatMultiplier *= eff.allStatMultiplier;
      if (eff.globalMultiplier) effects.globalMultiplier *= eff.globalMultiplier;
    });

    return effects;
  },
};

module.exports = { ActiveSkillMethods };
