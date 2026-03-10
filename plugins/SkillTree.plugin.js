/**
 * @name SkillTree
 * @description Solo Leveling lore-appropriate skill tree system with upgradeable passive abilities
 * @version 3.0.0
 * @author BlueFlashX1
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/SkillTree/components.js
var require_components = __commonJS({
  "src/SkillTree/components.js"(exports2, module2) {
    function buildSkillTreeComponents2(pluginInstance) {
      const React = BdApi.React;
      const ce = React.createElement;
      function formatEffectText(effect) {
        if (!effect) return "";
        const parts = [];
        if (effect.xpBonus) parts.push(`+${(effect.xpBonus * 100).toFixed(1)}% XP`);
        if (effect.critBonus) parts.push(`+${(effect.critBonus * 100).toFixed(1)}% Crit`);
        if (effect.longMsgBonus) parts.push(`+${(effect.longMsgBonus * 100).toFixed(1)}% Long Msg`);
        if (effect.questBonus) parts.push(`+${(effect.questBonus * 100).toFixed(1)}% Quest`);
        if (effect.allStatBonus) parts.push(`+${(effect.allStatBonus * 100).toFixed(1)}% All Stats`);
        return parts.join(" \u2022 ");
      }
      function ManaBar({ current, max }) {
        const pct = max > 0 ? current / max * 100 : 0;
        return ce(
          "div",
          { className: "skilltree-mana-bar-container" },
          ce("span", { className: "skilltree-mana-bar-label" }, "Mana"),
          ce(
            "div",
            { className: "skilltree-mana-bar-track" },
            ce("div", { className: "skilltree-mana-bar-fill", style: { width: `${pct.toFixed(1)}%` } })
          ),
          ce("span", { className: "skilltree-mana-bar-text" }, `${Math.floor(current)} / ${max}`)
        );
      }
      function getActiveSkillDurationText(def) {
        return def.durationMs ? `${Math.round(def.durationMs / 6e4)}m` : `${def.charges} charge${def.charges > 1 ? "s" : ""}`;
      }
      function buildActiveSkillStatus(ce2, options) {
        const {
          def,
          isRunning,
          isOnCooldown,
          cooldownRemaining,
          state
        } = options;
        if (isRunning) {
          if (def.durationMs && state.expiresAt > 0) {
            const remainMin = Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 6e4));
            return ce2(
              "div",
              { className: "skilltree-active-skill-status active-text" },
              `ACTIVE - ${remainMin}m remaining`
            );
          }
          if (def.charges && state.chargesLeft > 0) {
            return ce2(
              "div",
              { className: "skilltree-active-skill-status active-text" },
              `ACTIVE - ${state.chargesLeft} charge${state.chargesLeft > 1 ? "s" : ""} left`
            );
          }
          return null;
        }
        if (!isOnCooldown) return null;
        const cooldownMinutes = Math.ceil(cooldownRemaining / 6e4);
        return ce2(
          "div",
          { className: "skilltree-active-skill-status cooldown-text" },
          `Cooldown: ${cooldownMinutes}m`
        );
      }
      function buildActiveSkillAction(ce2, options) {
        var _a;
        const {
          skillId,
          def,
          isUnlocked,
          isRunning,
          isOnCooldown,
          manaInfo,
          onActivate
        } = options;
        if (!isUnlocked) {
          const reqSkillDef = pluginInstance.findSkillAndTier(def.unlock.passiveSkill);
          const reqName = ((_a = reqSkillDef == null ? void 0 : reqSkillDef.skill) == null ? void 0 : _a.name) || def.unlock.passiveSkill;
          return ce2(
            "div",
            { className: "skilltree-active-skill-unlock-req" },
            `Requires ${reqName} Lv${def.unlock.passiveLevel}`
          );
        }
        if (isRunning) {
          return ce2("button", { className: "skilltree-activate-btn", disabled: true }, "Active");
        }
        const canActivate = !isOnCooldown && manaInfo.current >= def.manaCost;
        return ce2(
          "button",
          {
            className: "skilltree-activate-btn",
            disabled: !canActivate,
            onClick: canActivate ? () => onActivate(skillId) : void 0
          },
          isOnCooldown ? "On Cooldown" : "Activate"
        );
      }
      function ActiveSkillCard({ skillId, def, isUnlocked, isRunning, isOnCooldown, cooldownRemaining, state, manaInfo, onActivate }) {
        const cardClasses = ["skilltree-active-skill", isRunning ? "is-active" : "", !isUnlocked ? "is-locked" : ""].filter(Boolean).join(" ");
        const durationText = getActiveSkillDurationText(def);
        const cooldownText = `${Math.round(def.cooldownMs / 6e4)}m`;
        const statusEl = buildActiveSkillStatus(ce, {
          def,
          isRunning,
          isOnCooldown,
          cooldownRemaining,
          state
        });
        const actionEl = buildActiveSkillAction(ce, {
          skillId,
          def,
          isUnlocked,
          isRunning,
          isOnCooldown,
          manaInfo,
          onActivate
        });
        return ce(
          "div",
          { className: cardClasses },
          ce(
            "div",
            { className: "skilltree-active-skill-header" },
            ce("span", { className: "skilltree-active-skill-name" }, def.name),
            ce("span", { className: "skilltree-active-skill-cost" }, `${def.manaCost} Mana`)
          ),
          ce("div", { className: "skilltree-active-skill-desc" }, def.desc),
          def.lore ? ce("div", { className: "skilltree-active-skill-lore" }, def.lore) : null,
          ce(
            "div",
            { className: "skilltree-active-skill-info" },
            ce("span", null, `Duration: ${durationText}`),
            ce("span", null, `Cooldown: ${cooldownText}`)
          ),
          statusEl,
          actionEl
        );
      }
      function ActiveSkillsSection({ onActivate }) {
        const manaInfo = pluginInstance.getManaInfo();
        return ce(
          "div",
          { className: "skilltree-active-section" },
          ce("div", { className: "skilltree-active-section-header" }, ce("span", null, "Active Skills")),
          ce(ManaBar, { current: manaInfo.current, max: manaInfo.max }),
          pluginInstance.activeSkillOrder.map((skillId) => {
            const def = pluginInstance.activeSkillDefs[skillId];
            if (!def) return null;
            return ce(ActiveSkillCard, {
              key: skillId,
              skillId,
              def,
              isUnlocked: pluginInstance.isActiveSkillUnlocked(skillId),
              isRunning: pluginInstance.isActiveSkillRunning(skillId),
              isOnCooldown: pluginInstance.isActiveSkillOnCooldown(skillId),
              cooldownRemaining: pluginInstance.getActiveSkillCooldownRemaining(skillId),
              state: pluginInstance.getActiveSkillState(skillId),
              manaInfo,
              onActivate
            });
          })
        );
      }
      function SkillCard({ skill, level, maxLevel, canUpgrade, nextCost, effect, onUpgrade, onMaxUpgrade }) {
        const canMax = level < maxLevel && canUpgrade;
        const classes = `skilltree-skill ${level > 0 ? "unlocked" : ""} ${level >= maxLevel ? "max-level" : ""}`;
        const effectStr = formatEffectText(effect);
        return ce(
          "div",
          { className: classes },
          ce("div", { className: "skilltree-skill-name" }, skill.name),
          ce("div", { className: "skilltree-skill-desc" }, skill.desc),
          skill.lore ? ce("div", { className: "skilltree-skill-lore" }, skill.lore) : null,
          level > 0 ? ce("div", { className: "skilltree-skill-level" }, `Level ${level}/${maxLevel}`) : null,
          level > 0 && effectStr ? ce("div", { className: "skilltree-skill-effects" }, `Current Effects: ${effectStr}`) : null,
          level < maxLevel ? ce(
            React.Fragment,
            null,
            ce("div", { className: "skilltree-skill-cost" }, `Cost: ${nextCost || "N/A"} SP`),
            ce(
              "div",
              { className: "skilltree-btn-group" },
              ce("button", { className: "skilltree-upgrade-btn", disabled: !canUpgrade, onClick: canUpgrade ? () => onUpgrade(skill.id) : void 0 }, level === 0 ? "Unlock" : "Upgrade"),
              ce("button", { className: "skilltree-max-btn", disabled: !canMax, onClick: canMax ? () => onMaxUpgrade(skill.id) : void 0 }, "Max")
            )
          ) : ce("div", { className: "skilltree-skill-max" }, "MAX LEVEL")
        );
      }
      function PassiveSkillList({ tier, tierKey, onUpgrade, onMaxUpgrade }) {
        if (!tier.skills) return null;
        return ce(
          "div",
          { className: "skilltree-tier", id: `st-${tierKey}` },
          ce(
            "div",
            { className: "skilltree-tier-header" },
            ce("span", null, tier.name),
            ce("span", { className: "skilltree-tier-badge" }, `Tier ${tier.tier}`)
          ),
          tier.skills.map((skill) => {
            const level = pluginInstance.getSkillLevel(skill.id);
            const maxLevel = tier.maxLevel || 10;
            return ce(SkillCard, {
              key: skill.id,
              skill,
              level,
              maxLevel,
              canUpgrade: pluginInstance.canUnlockSkill(skill, tier),
              nextCost: pluginInstance.getNextUpgradeCost(skill, tier),
              effect: pluginInstance.getSkillEffect(skill, tier),
              onUpgrade,
              onMaxUpgrade
            });
          })
        );
      }
      function TierNavigation({ tiers, currentTier, onTierChange }) {
        return ce(
          "div",
          { className: "skilltree-tier-nav" },
          tiers.map(
            (tierKey) => ce("button", {
              key: tierKey,
              className: `skilltree-tier-nav-btn ${tierKey === currentTier ? "active" : ""}`,
              onClick: () => onTierChange(tierKey)
            }, `Tier ${tierKey.replace("tier", "")}`)
          )
        );
      }
      function SkillTreeHeader({ sp, level, onReset }) {
        return ce(
          "div",
          { className: "skilltree-header" },
          ce("h2", null, "Solo Leveling Skill Tree"),
          ce(
            "div",
            { className: "skilltree-header-info" },
            ce(
              "div",
              { className: "skilltree-stat" },
              ce("span", null, "Available SP:"),
              ce("span", { className: "skilltree-stat-value" }, String(sp))
            ),
            level != null ? ce(
              "div",
              { className: "skilltree-stat" },
              ce("span", null, "Level:"),
              ce("span", { className: "skilltree-stat-value" }, String(level))
            ) : null,
            ce("button", { className: "skilltree-reset-btn", onClick: onReset }, "Reset Skills")
          )
        );
      }
      function ResetConfirmDialog({ onConfirm, onCancel, expectedSP, currentLevel }) {
        React.useEffect(() => {
          const handler = (e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onCancel();
            }
          };
          document.addEventListener("keydown", handler, true);
          return () => document.removeEventListener("keydown", handler, true);
        }, [onCancel]);
        return ce(
          "div",
          { className: "st-confirm-dialog-overlay", onClick: (e) => {
            if (e.target.className === "st-confirm-dialog-overlay") onCancel();
          } },
          ce(
            "div",
            { className: "st-confirm-dialog" },
            ce("div", { className: "st-confirm-header" }, ce("h3", null, "Reset Skill Tree?")),
            ce(
              "div",
              { className: "st-confirm-body" },
              ce("p", null, "This will reset all skills and refund your skill points."),
              ce(
                "ul",
                null,
                ce("li", null, "Reset all skill levels to 0"),
                ce("li", null, "Clear all skill bonuses"),
                ce("li", null, "Refund ", ce("strong", null, String(expectedSP)), " SP for level ", ce("strong", null, String(currentLevel)))
              ),
              ce("p", { style: { color: "rgba(236, 72, 153, 0.85)", fontWeight: 600 } }, "This action cannot be undone.")
            ),
            ce(
              "div",
              { className: "st-confirm-actions" },
              ce("button", { className: "st-confirm-btn st-confirm-cancel", onClick: onCancel }, "Cancel"),
              ce("button", { className: "st-confirm-btn st-confirm-yes", onClick: onConfirm }, "Reset")
            )
          )
        );
      }
      function SkillTreeModal({ onClose }) {
        const [currentTierPage, setCurrentTierPage] = React.useState(pluginInstance.settings.currentTierPage || "tier1");
        const [isResetOpen, setIsResetOpen] = React.useState(false);
        const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
        React.useEffect(() => {
          pluginInstance._modalForceUpdate = forceUpdate;
          return () => {
            pluginInstance._modalForceUpdate = null;
          };
        }, [forceUpdate]);
        React.useEffect(() => {
          const handler = (e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              if (isResetOpen) setIsResetOpen(false);
              else onClose();
            }
          };
          document.addEventListener("keydown", handler, true);
          return () => document.removeEventListener("keydown", handler, true);
        }, [isResetOpen, onClose]);
        const soloData = pluginInstance.getSoloLevelingData();
        const allTierKeys = Object.keys(pluginInstance.skillTree);
        const visibleTiers = (pluginInstance.settings.visibleTiers || allTierKeys).filter((k) => allTierKeys.includes(k));
        const activeTier = allTierKeys.includes(currentTierPage) ? currentTierPage : visibleTiers[0] || "tier1";
        const tierData = pluginInstance.skillTree[activeTier];
        const handleTierChange = React.useCallback((tierKey) => {
          setCurrentTierPage(tierKey);
          pluginInstance.settings.currentTierPage = tierKey;
          pluginInstance.saveSettings();
        }, []);
        const handleUpgrade = React.useCallback((skillId) => {
          if (pluginInstance.unlockOrUpgradeSkill(skillId)) forceUpdate();
        }, []);
        const handleMaxUpgrade = React.useCallback((skillId) => {
          if (pluginInstance.maxUpgradeSkill(skillId)) forceUpdate();
        }, []);
        const handleActivate = React.useCallback((skillId) => {
          var _a;
          const result = pluginInstance.activateSkill(skillId);
          if (!result.success && ((_a = BdApi == null ? void 0 : BdApi.UI) == null ? void 0 : _a.showToast)) pluginInstance._toast(result.reason, "error", 2500);
          forceUpdate();
        }, []);
        const handleReset = React.useCallback(() => {
          setIsResetOpen(true);
        }, []);
        const handleResetConfirm = React.useCallback(() => {
          pluginInstance.resetSkills();
          setIsResetOpen(false);
          forceUpdate();
        }, []);
        const handleResetCancel = React.useCallback(() => {
          setIsResetOpen(false);
        }, []);
        const resetSoloData = pluginInstance.getSoloLevelingData();
        const expectedSP = (resetSoloData == null ? void 0 : resetSoloData.level) ? pluginInstance.calculateSPForLevel(resetSoloData.level) : 0;
        return ce(
          "div",
          { className: "skilltree-modal" },
          ce(SkillTreeHeader, { sp: pluginInstance.settings.skillPoints, level: soloData == null ? void 0 : soloData.level, onReset: handleReset }),
          ce(TierNavigation, { tiers: visibleTiers, currentTier: activeTier, onTierChange: handleTierChange }),
          ce(
            "div",
            { className: "skilltree-modal-content" },
            tierData ? ce(PassiveSkillList, { tier: tierData, tierKey: activeTier, onUpgrade: handleUpgrade, onMaxUpgrade: handleMaxUpgrade }) : null,
            ce(ActiveSkillsSection, { onActivate: handleActivate })
          ),
          ce("button", { className: "skilltree-close-btn", onClick: onClose }, "\xD7"),
          isResetOpen ? ce(ResetConfirmDialog, { onConfirm: handleResetConfirm, onCancel: handleResetCancel, expectedSP, currentLevel: (resetSoloData == null ? void 0 : resetSoloData.level) || 0 }) : null
        );
      }
      return { SkillTreeModal, SkillTreeHeader, TierNavigation, PassiveSkillList, SkillCard, ActiveSkillsSection, ActiveSkillCard, ManaBar, ResetConfirmDialog };
    }
    module2.exports = { buildSkillTreeComponents: buildSkillTreeComponents2 };
  }
});

// src/SkillTree/active-skill-methods.js
var require_active_skill_methods = __commonJS({
  "src/SkillTree/active-skill-methods.js"(exports2, module2) {
    var ActiveSkillMethods2 = {
      isActiveSkillUnlocked(activeSkillId) {
        const def = this.activeSkillDefs[activeSkillId];
        if (!def || !def.unlock) return false;
        const passiveLevel = this.getSkillLevel(def.unlock.passiveSkill);
        return passiveLevel >= def.unlock.passiveLevel;
      },
      _computeMaxManaFromStats() {
        var _a;
        const soloData = this.getSoloLevelingData();
        const intelligence = ((_a = soloData == null ? void 0 : soloData.stats) == null ? void 0 : _a.intelligence) || 0;
        return 100 + intelligence * 2;
      },
      _getSoloLevelingInstance(now = Date.now()) {
        var _a, _b;
        if (this._cache.soloPluginInstance && this._cache.soloPluginInstanceTime && now - this._cache.soloPluginInstanceTime < this._cache.soloPluginInstanceTTL) {
          return this._cache.soloPluginInstance;
        }
        const instance = ((_b = (_a = this._SLUtils) == null ? void 0 : _a.getPluginInstance) == null ? void 0 : _b.call(_a, "SoloLevelingStats")) || null;
        this._cache.soloPluginInstance = instance;
        this._cache.soloPluginInstanceTime = now;
        return instance;
      },
      _getSharedManaInfo() {
        const instance = this._getSoloLevelingInstance();
        if (!(instance == null ? void 0 : instance.settings)) return null;
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
          current: Math.max(0, Math.min(loadedCurrent, max))
        };
      },
      _setSharedMana(nextMana, maxManaHint) {
        const instance = this._getSoloLevelingInstance();
        if (!(instance == null ? void 0 : instance.settings)) return false;
        const loadedMax = Number(instance.settings.userMaxMana);
        const max = Number.isFinite(loadedMax) && loadedMax > 0 ? loadedMax : Number.isFinite(maxManaHint) && maxManaHint > 0 ? maxManaHint : this._computeMaxManaFromStats();
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
        var _a;
        const now = Date.now();
        const lastRegen = this.settings.lastManaRegen || now;
        const elapsedMinutes = (now - lastRegen) / 6e4;
        if (elapsedMinutes < 0.5) return;
        const soloData = this.getSoloLevelingData();
        const intelligence = ((_a = soloData == null ? void 0 : soloData.stats) == null ? void 0 : _a.intelligence) || 0;
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
        }, 3e4);
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
        var _a;
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
          const remainMin = Math.ceil(remainMs / 6e4);
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
          chargesLeft: def.charges || 0
        };
        if (def.durationMs) {
          this._setActiveSkillTimer(skillId, def.durationMs);
        }
        this.saveSettings();
        const durationText = def.durationMs ? `${Math.round(def.durationMs / 6e4)}m` : `${def.charges} charge${def.charges > 1 ? "s" : ""}`;
        if ((_a = BdApi == null ? void 0 : BdApi.UI) == null ? void 0 : _a.showToast) {
          this._toast(`${def.name} activated! (${durationText})`, "success", 3e3);
        }
        document.dispatchEvent(new CustomEvent("SkillTree:activeSkillActivated", {
          detail: { skillId, effect: def.effect, expiresAt: this.settings.activeSkillStates[skillId].expiresAt }
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
        var _a;
        const state = this.getActiveSkillState(skillId);
        if (!state.active) return;
        this.settings.activeSkillStates[skillId] = {
          ...state,
          active: false,
          expiresAt: 0,
          chargesLeft: 0
        };
        this.saveSettings();
        const def = this.activeSkillDefs[skillId];
        if (((_a = BdApi == null ? void 0 : BdApi.UI) == null ? void 0 : _a.showToast) && def) {
          this._toast(`${def.name} expired.`, "info", 2e3);
        }
        document.dispatchEvent(new CustomEvent("SkillTree:activeSkillExpired", {
          detail: { skillId }
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
          xpMultiplier: 1,
          critChanceBonus: 0,
          guaranteedCrit: false,
          allStatMultiplier: 1,
          questRewardMultiplier: 1,
          shadowBuffMultiplier: 1,
          globalMultiplier: 1
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
      }
    };
    module2.exports = { ActiveSkillMethods: ActiveSkillMethods2 };
  }
});

// src/SkillTree/data.js
var require_data = __commonJS({
  "src/SkillTree/data.js"(exports2, module2) {
    var DEFAULT_SETTINGS = {
      enabled: true,
      debugMode: false,
      visibleTiers: ["tier1", "tier2", "tier3", "tier4", "tier5", "tier6"],
      currentTierPage: "tier1",
      skillPoints: 0,
      unlockedSkills: [],
      skillLevels: {},
      lastLevel: 1,
      totalEarnedSP: 0,
      totalSpentSP: 0,
      currentMana: 100,
      maxMana: 100,
      activeSkillStates: {},
      manaRegenRate: 1,
      lastManaRegen: 0
    };
    var SKILL_TREE = {
      tier1: {
        name: "Basic Abilities",
        tier: 1,
        maxLevel: 10,
        baseCost: 1,
        upgradeCostMultiplier: 1.5,
        growthRate: 1,
        skills: [
          {
            id: "shadow_extraction",
            name: "Shadow Extraction Mastery",
            desc: "Mastery over extracting shadows from defeated enemies. Each level increases XP gain.",
            lore: "The passive ability to extract shadows and turn them into your army.",
            requirement: { level: 5 },
            baseEffect: { xpBonus: 0.02 },
            perLevelEffect: { xpBonus: 0.02 }
          },
          {
            id: "shadow_preservation",
            name: "Shadow Preservation",
            desc: "Preserve and monitor shadows through their senses. Increases long message XP.",
            lore: "Store your shadow army and perceive the world through their eyes.",
            requirement: { level: 8 },
            baseEffect: { longMsgBonus: 0.03 },
            perLevelEffect: { longMsgBonus: 0.03 }
          },
          {
            id: "daggers_dance",
            name: "Dagger's Dance",
            desc: "Jin-Woo's signature dual-dagger combat style. Increases crit chance.",
            lore: "The dance of blades that cut through even S-Rank hunters.",
            requirement: { level: 10, strength: 5 },
            baseEffect: { critBonus: 0.01 },
            perLevelEffect: { critBonus: 0.01 }
          },
          {
            id: "kandiarus_blessing",
            name: "Kandiaru's Blessing",
            desc: "The System Architect's gift. Passively increases XP from all sources.",
            lore: "A hidden blessing woven into the System itself by its creator.",
            requirement: { level: 15, intelligence: 5 },
            baseEffect: { xpBonus: 0.015 },
            perLevelEffect: { xpBonus: 0.015 }
          }
        ]
      },
      tier2: {
        name: "Intermediate Abilities",
        tier: 2,
        maxLevel: 15,
        baseCost: 3,
        upgradeCostMultiplier: 2,
        growthRate: 1.5,
        skills: [
          {
            id: "shadow_exchange",
            name: "Shadow Exchange Efficiency",
            desc: "Efficient conversion of shadows into power. Significantly increases XP gain.",
            lore: "Passively trade shadows for power boosts.",
            requirement: { level: 50, skills: ["shadow_extraction"] },
            baseEffect: { xpBonus: 0.05 },
            perLevelEffect: { xpBonus: 0.05 }
          },
          {
            id: "arise",
            name: "Shadow Command Mastery",
            desc: "Mastery over commanding your shadow army. Increases all stat bonuses.",
            lore: "Passive command over shadows that brings them to life.",
            requirement: { level: 60, skills: ["shadow_preservation"] },
            baseEffect: { allStatBonus: 0.02 },
            perLevelEffect: { allStatBonus: 0.02 }
          },
          {
            id: "gate_creation",
            name: "Gate Creation",
            desc: "Open black-and-purple gates to other worlds. Increases quest rewards.",
            lore: "Tear open dimensional gates at will, each one a path to greater power.",
            requirement: { level: 75, intelligence: 15 },
            baseEffect: { questBonus: 0.04 },
            perLevelEffect: { questBonus: 0.04 }
          },
          {
            id: "dagger_rush",
            name: "Dagger Rush",
            desc: "Barrage opponents with daggers from all directions. Increases crit chance significantly.",
            lore: "A relentless storm of blades that leaves no opening for escape.",
            requirement: { level: 80, agility: 15 },
            baseEffect: { critBonus: 0.02 },
            perLevelEffect: { critBonus: 0.02 }
          },
          {
            id: "stealth",
            name: "Shadow Stealth",
            desc: "Passive ability to move unseen through shadows. Increases XP and crit chance.",
            lore: "Become one with the shadows.",
            requirement: { level: 90, agility: 20 },
            baseEffect: { xpBonus: 0.03, critBonus: 0.015 },
            perLevelEffect: { xpBonus: 0.03, critBonus: 0.015 }
          }
        ]
      },
      tier3: {
        name: "Advanced Abilities",
        tier: 3,
        maxLevel: 20,
        baseCost: 5,
        upgradeCostMultiplier: 2.5,
        growthRate: 2,
        skills: [
          {
            id: "monarchs_domain",
            name: "Monarch's Domain",
            desc: "Exert the Monarch's territory. Massive XP and stat bonuses.",
            lore: "Within this domain, the Shadow Monarch is absolute.",
            requirement: { level: 150, intelligence: 30, skills: ["gate_creation"] },
            baseEffect: { xpBonus: 0.08, allStatBonus: 0.03 },
            perLevelEffect: { xpBonus: 0.08, allStatBonus: 0.03 }
          },
          {
            id: "ruler_authority",
            name: "Ruler's Presence",
            desc: "Passive aura of absolute authority. Increases all bonuses.",
            lore: "The passive power to rule over all.",
            requirement: { level: 200, skills: ["arise"] },
            baseEffect: { xpBonus: 0.06, allStatBonus: 0.04, critBonus: 0.02 },
            perLevelEffect: { xpBonus: 0.06, allStatBonus: 0.04, critBonus: 0.02 }
          },
          {
            id: "shadow_army",
            name: "Shadow Legion Mastery",
            desc: "Mastery over commanding a legion of shadows. Massive XP and quest bonuses.",
            lore: "Passively build an army of shadows to fight for you.",
            requirement: { level: 250, skills: ["shadow_exchange", "arise"] },
            baseEffect: { xpBonus: 0.1, questBonus: 0.06 },
            perLevelEffect: { xpBonus: 0.1, questBonus: 0.06 }
          },
          {
            id: "monarch_power",
            name: "Monarch's Aura",
            desc: "Passive aura of monarch-level power. Extreme bonuses.",
            lore: "The power of a Monarch passively flows through you.",
            requirement: { level: 300, strength: 50, agility: 50 },
            baseEffect: { xpBonus: 0.12, critBonus: 0.03, allStatBonus: 0.05 },
            perLevelEffect: { xpBonus: 0.12, critBonus: 0.03, allStatBonus: 0.05 }
          }
        ]
      },
      tier4: {
        name: "Master Abilities",
        tier: 4,
        maxLevel: 25,
        baseCost: 10,
        upgradeCostMultiplier: 3,
        growthRate: 3,
        skills: [
          {
            id: "shadow_monarch",
            name: "Shadow Monarch's Presence",
            desc: "Passive presence of the Shadow Monarch. Ultimate power over shadows.",
            lore: "The ultimate form - passive ruler of all shadows.",
            requirement: { level: 500, skills: ["monarch_power", "shadow_army"] },
            baseEffect: { xpBonus: 0.15, allStatBonus: 0.08, critBonus: 0.04 },
            perLevelEffect: { xpBonus: 0.15, allStatBonus: 0.08, critBonus: 0.04 }
          },
          {
            id: "ashborn_legacy",
            name: "Ashborn's Legacy",
            desc: "Passive inheritance of the first Shadow Monarch's power. Transcendent bonuses.",
            lore: "The legacy of Ashborn passively flows through you.",
            requirement: { level: 750, skills: ["shadow_monarch"] },
            baseEffect: { xpBonus: 0.2, allStatBonus: 0.1, critBonus: 0.05, questBonus: 0.08 },
            perLevelEffect: { xpBonus: 0.2, allStatBonus: 0.1, critBonus: 0.05, questBonus: 0.08 }
          }
        ]
      },
      tier5: {
        name: "Transcendent Abilities",
        tier: 5,
        maxLevel: 30,
        baseCost: 15,
        upgradeCostMultiplier: 3.5,
        growthRate: 4,
        skills: [
          {
            id: "rulers_domain",
            name: "Ruler's Domain",
            desc: "The opposing cosmic force. Absolute authority over existence.",
            lore: "Channel the Rulers' power - the cosmic opposite of the Monarchs.",
            requirement: { level: 1e3, skills: ["ashborn_legacy"] },
            baseEffect: {
              xpBonus: 0.25,
              allStatBonus: 0.12,
              critBonus: 0.06,
              questBonus: 0.1,
              longMsgBonus: 0.15
            },
            perLevelEffect: {
              xpBonus: 0.25,
              allStatBonus: 0.12,
              critBonus: 0.06,
              questBonus: 0.1,
              longMsgBonus: 0.15
            }
          },
          {
            id: "shadow_realm",
            name: "Shadow Realm",
            desc: "Access the space between worlds. Transcendent XP and stat bonuses.",
            lore: "The dimension where shadows gather between life and death.",
            requirement: { level: 1200, skills: ["rulers_domain"] },
            baseEffect: { xpBonus: 0.3, allStatBonus: 0.15, critBonus: 0.08 },
            perLevelEffect: { xpBonus: 0.3, allStatBonus: 0.15, critBonus: 0.08 }
          },
          {
            id: "gate_ruler",
            name: "Gate Ruler",
            desc: "Command the Gates between dimensions. Massive bonuses.",
            lore: "Every Gate bends to your will, every dungeon opens at your command.",
            requirement: { level: 1400, skills: ["shadow_realm"] },
            baseEffect: { xpBonus: 0.35, allStatBonus: 0.18, critBonus: 0.1, questBonus: 0.12 },
            perLevelEffect: { xpBonus: 0.35, allStatBonus: 0.18, critBonus: 0.1, questBonus: 0.12 }
          }
        ]
      },
      tier6: {
        name: "Ultimate Abilities",
        tier: 6,
        maxLevel: 35,
        baseCost: 25,
        upgradeCostMultiplier: 4,
        growthRate: 5,
        skills: [
          {
            id: "dragons_fear",
            name: "Dragon's Fear",
            desc: "Overwhelming killing intent that paralyzes all. Ultimate bonuses.",
            lore: "An aura of terror that made even the Monarchs' armies hesitate.",
            requirement: { level: 1500, skills: ["gate_ruler"] },
            baseEffect: {
              xpBonus: 0.4,
              allStatBonus: 0.2,
              critBonus: 0.12,
              questBonus: 0.15,
              longMsgBonus: 0.2
            },
            perLevelEffect: {
              xpBonus: 0.4,
              allStatBonus: 0.2,
              critBonus: 0.12,
              questBonus: 0.15,
              longMsgBonus: 0.2
            }
          },
          {
            id: "ashborns_will",
            name: "Ashborn's Will",
            desc: "The first Shadow Monarch's undying resolve. Transcendent bonuses.",
            lore: "Ashborn's will persists across millennia, now flowing through you.",
            requirement: { level: 1750, skills: ["dragons_fear"] },
            baseEffect: { xpBonus: 0.45, allStatBonus: 0.25, critBonus: 0.15, questBonus: 0.18 },
            perLevelEffect: {
              xpBonus: 0.45,
              allStatBonus: 0.25,
              critBonus: 0.15,
              questBonus: 0.18
            }
          },
          {
            id: "shadow_sovereign",
            name: "Shadow Sovereign",
            desc: "The Sovereign of Shadows - Ashborn's true title. Maximum possible power.",
            lore: "You have become the Shadow Sovereign, ruler of death and darkness.",
            requirement: { level: 2e3, skills: ["ashborns_will"] },
            baseEffect: {
              xpBonus: 0.5,
              allStatBonus: 0.3,
              critBonus: 0.18,
              questBonus: 0.2,
              longMsgBonus: 0.25
            },
            perLevelEffect: {
              xpBonus: 0.5,
              allStatBonus: 0.3,
              critBonus: 0.18,
              questBonus: 0.2,
              longMsgBonus: 0.25
            }
          }
        ]
      }
    };
    var ACTIVE_SKILL_DEFS = {
      sprint: {
        id: "sprint",
        name: "Sprint",
        desc: "Channel Jinwoo's supernatural speed. +100% XP for a short burst.",
        lore: "A burst of speed that leaves afterimages in your wake.",
        manaCost: 30,
        durationMs: 5 * 60 * 1e3,
        cooldownMs: 20 * 60 * 1e3,
        effect: { xpMultiplier: 2 },
        unlock: { passiveSkill: "stealth", passiveLevel: 5 }
      },
      bloodlust: {
        id: "bloodlust",
        name: "Bloodlust",
        desc: "Unleash killing intent. +50% crit chance (uncapped during buff).",
        lore: "An aura of murderous intent that makes even S-Rank hunters freeze.",
        manaCost: 50,
        durationMs: 8 * 60 * 1e3,
        cooldownMs: 30 * 60 * 1e3,
        effect: { critChanceBonus: 0.5 },
        unlock: { passiveSkill: "daggers_dance", passiveLevel: 8 }
      },
      mutilate: {
        id: "mutilate",
        name: "Mutilate",
        desc: "Critical strike mastery. Next 10 messages are guaranteed crits.",
        lore: "A flurry of precise strikes, each one finding its mark.",
        manaCost: 40,
        durationMs: null,
        charges: 10,
        cooldownMs: 25 * 60 * 1e3,
        effect: { guaranteedCrit: true },
        unlock: { passiveSkill: "dagger_rush", passiveLevel: 10 }
      },
      rulers_authority: {
        id: "rulers_authority",
        name: "Ruler's Authority",
        desc: "Telekinetic force amplifies all stats. +75% all stat bonuses.",
        lore: "The power to move objects with will alone, now amplifying your very being.",
        manaCost: 60,
        durationMs: 10 * 60 * 1e3,
        cooldownMs: 45 * 60 * 1e3,
        effect: { allStatMultiplier: 1.75 },
        unlock: { passiveSkill: "ruler_authority", passiveLevel: 10 }
      },
      shadow_exchange_active: {
        id: "shadow_exchange_active",
        name: "Shadow Exchange",
        desc: "Swap places with a shadow soldier. Double quest rewards for next quest.",
        lore: "Instantly switch positions with any shadow in your army.",
        manaCost: 25,
        durationMs: null,
        charges: 1,
        cooldownMs: 60 * 60 * 1e3,
        effect: { questRewardMultiplier: 2 },
        unlock: { passiveSkill: "shadow_exchange", passiveLevel: 10 }
      },
      arise_active: {
        id: "arise_active",
        name: "Arise",
        desc: "Command shadows to rise. +200% Shadow Army buff power.",
        lore: "ARISE! The command that raises the dead to serve the Shadow Monarch.",
        manaCost: 80,
        durationMs: 15 * 60 * 1e3,
        cooldownMs: 60 * 60 * 1e3,
        effect: { shadowBuffMultiplier: 3 },
        unlock: { passiveSkill: "arise", passiveLevel: 12 }
      },
      monarchs_domain_active: {
        id: "monarchs_domain_active",
        name: "Monarch's Domain",
        desc: "Expand your domain of power. All bonuses +30% for the duration.",
        lore: "Within this domain, the Shadow Monarch reigns supreme over all.",
        manaCost: 100,
        durationMs: 20 * 60 * 1e3,
        cooldownMs: 90 * 60 * 1e3,
        effect: { globalMultiplier: 1.3 },
        unlock: { passiveSkill: "monarchs_domain", passiveLevel: 15 }
      }
    };
    var ACTIVE_SKILL_ORDER = [
      "sprint",
      "bloodlust",
      "mutilate",
      "rulers_authority",
      "shadow_exchange_active",
      "arise_active",
      "monarchs_domain_active"
    ];
    function createSkillTreeData2() {
      return {
        defaultSettings: structuredClone(DEFAULT_SETTINGS),
        skillTree: structuredClone(SKILL_TREE),
        activeSkillDefs: structuredClone(ACTIVE_SKILL_DEFS),
        activeSkillOrder: [...ACTIVE_SKILL_ORDER]
      };
    }
    module2.exports = { createSkillTreeData: createSkillTreeData2 };
  }
});

// src/SkillTree/skill-upgrade-methods.js
var require_skill_upgrade_methods = __commonJS({
  "src/SkillTree/skill-upgrade-methods.js"(exports2, module2) {
    var SkillTreeUpgradeMethods2 = {
      _syncUnlockedSkillState(skillId) {
        if (!Array.isArray(this.settings.unlockedSkills)) {
          this.settings.unlockedSkills = [];
        }
        if (!this.settings.unlockedSkills.includes(skillId)) {
          this.settings.unlockedSkills.push(skillId);
        }
      },
      _finalizeSkillUpgrade(skillId) {
        this.settings.totalSpentSP = this.getTotalSpentSP();
        this._syncUnlockedSkillState(skillId);
        this._cache.skillBonuses = null;
        this._cache.skillBonusesTime = 0;
        this.saveSettings();
        this.updateButtonText();
      },
      /**
       * Get skill level (0 = not unlocked)
       * @param {string} skillId - Skill ID
       * @returns {number} - Skill level (0 if not unlocked)
       */
      getSkillLevel(skillId) {
        return this.settings.skillLevels[skillId] || 0;
      },
      /**
       * Get skill unlock cost
       * @param {Object} skill - Skill definition
       * @param {Object} tier - Tier definition
       * @returns {number} - Unlock cost in SP
       */
      getSkillUnlockCost(skill, tier) {
        return tier.baseCost || 1;
      },
      /**
       * Get total upgrade cost for a skill up to a certain level
       * @param {Object} skill - Skill definition
       * @param {Object} tier - Tier definition
       * @param {number} targetLevel - Target level
       * @returns {number} - Total upgrade cost
       */
      getSkillUpgradeCost(skill, tier, targetLevel) {
        if (targetLevel <= 1) return 0;
        const baseCost = tier.baseCost || 1;
        const multiplier = tier.upgradeCostMultiplier || 1.5;
        let total = 0;
        for (let i = 1; i <= targetLevel - 1; i++) {
          total += Math.ceil(baseCost * i * multiplier);
        }
        return total;
      },
      /**
       * Get cost to upgrade skill to next level
       * @param {Object} skill - Skill definition
       * @param {Object} tier - Tier definition
       * @returns {number|null} - Cost in SP, or null if max level
       */
      getNextUpgradeCost(skill, tier) {
        const currentLevel = this.getSkillLevel(skill.id);
        if (currentLevel === 0) {
          return tier.baseCost || 1;
        }
        const maxLevel = tier.maxLevel || 10;
        if (currentLevel >= maxLevel) {
          return null;
        }
        const baseCost = tier.baseCost || 1;
        const multiplier = tier.upgradeCostMultiplier || 1.5;
        return Math.ceil(baseCost * currentLevel * multiplier);
      },
      /**
       * Get skill effect at current level
       * @param {Object} skill - Skill definition
       * @param {Object} tier - Tier definition
       * @returns {Object|null} - Effect object or null if not unlocked
       */
      getSkillEffect(skill, tier) {
        const level = this.getSkillLevel(skill.id);
        if (level === 0) return null;
        const effect = {};
        const growthRate = tier.growthRate || 1;
        Object.keys(skill.baseEffect || {}).forEach((key) => {
          const baseValue = skill.baseEffect[key] || 0;
          const perLevelValue = skill.perLevelEffect && skill.perLevelEffect[key] ? skill.perLevelEffect[key] : 0;
          effect[key] = baseValue + perLevelValue * (level - 1) * growthRate;
        });
        return effect;
      },
      /**
       * Find skill and tier by skill ID
       * @param {string} skillId - Skill ID to find
       * @returns {Object|null} - Object with skill and tier, or null if not found
       */
      findSkillAndTier(skillId) {
        try {
          const result = Object.values(this.skillTree).filter((tierData) => tierData == null ? void 0 : tierData.skills).map((tierData) => ({
            skill: tierData.skills.find((s) => s.id === skillId),
            tier: tierData
          })).find(({ skill }) => skill);
          return result || null;
        } catch (error) {
          console.error("SkillTree: Error finding skill", error);
          return null;
        }
      },
      _meetsMinimumRequirement(requiredValue, currentValue) {
        return !requiredValue || currentValue >= requiredValue;
      },
      _meetsStatRequirements(requirement, stats) {
        const perception = stats.perception || 0;
        const statRules = [
          ["strength", stats.strength || 0],
          ["agility", stats.agility || 0],
          ["intelligence", stats.intelligence || 0],
          ["vitality", stats.vitality || 0],
          ["perception", perception]
        ];
        return statRules.every(([key, value]) => this._meetsMinimumRequirement(requirement[key], value));
      },
      _hasRequiredSkills(requirementSkills) {
        if (!Array.isArray(requirementSkills)) return true;
        return requirementSkills.every((prereqId) => this.getSkillLevel(prereqId) > 0);
      },
      /**
       * Check if skill can be unlocked/upgraded
       * @param {Object} skill - Skill definition
       * @param {Object} tier - Tier definition
       * @returns {boolean} - True if skill can be upgraded
       */
      canUnlockSkill(skill, tier) {
        try {
          const soloData = this.getSoloLevelingData();
          if (!soloData) return false;
          const currentLevel = this.getSkillLevel(skill.id);
          const maxLevel = tier.maxLevel || 10;
          if (currentLevel >= maxLevel) return false;
          const cost = this.getNextUpgradeCost(skill, tier);
          if (!cost || this.settings.skillPoints < cost) return false;
          const requirement = skill.requirement || {};
          if (!this._meetsMinimumRequirement(requirement.level, soloData.level)) {
            return false;
          }
          const stats = soloData.stats || {};
          if (!this._meetsStatRequirements(requirement, stats)) return false;
          if (!this._hasRequiredSkills(requirement.skills)) return false;
          return true;
        } catch (error) {
          console.error("SkillTree: Error checking if skill can be unlocked", error);
          return false;
        }
      },
      /**
       * Unlock or upgrade a skill
       * @param {string} skillId - Skill ID to unlock/upgrade
       * @returns {boolean} - True if successful
       */
      unlockOrUpgradeSkill(skillId) {
        try {
          const result = this.findSkillAndTier(skillId);
          if (!result) {
            console.error("SkillTree: Skill not found:", skillId);
            return false;
          }
          const { skill, tier } = result;
          if (!this.canUnlockSkill(skill, tier)) {
            return false;
          }
          const cost = this.getNextUpgradeCost(skill, tier);
          if (!cost) return false;
          this.settings.skillPoints -= cost;
          const currentLevel = this.getSkillLevel(skillId);
          this.settings.skillLevels[skillId] = (currentLevel || 0) + 1;
          this._finalizeSkillUpgrade(skillId);
          const newLevel = this.getSkillLevel(skillId);
          const message = currentLevel === 0 ? `Skill Unlocked: ${skill.name}` : `${skill.name} upgraded to Level ${newLevel}!`;
          this._toast(message, "success");
          return true;
        } catch (error) {
          console.error("SkillTree: Error unlocking/upgrading skill", error);
          return false;
        }
      },
      _buildMaxUpgradePlan(tier, currentLevel, availableSP) {
        const maxLevel = tier.maxLevel || 10;
        const baseCost = tier.baseCost || 1;
        const multiplier = tier.upgradeCostMultiplier || 1.5;
        let targetLevel = currentLevel;
        let totalCost = 0;
        let levelsUpgraded = 0;
        let remainingSP = availableSP;
        while (targetLevel < maxLevel && remainingSP > 0) {
          const nextCost = targetLevel === 0 ? baseCost : Math.ceil(baseCost * targetLevel * multiplier);
          if (!nextCost || remainingSP < nextCost) break;
          totalCost += nextCost;
          remainingSP -= nextCost;
          targetLevel++;
          levelsUpgraded++;
        }
        return { maxLevel, targetLevel, levelsUpgraded, totalCost };
      },
      /**
       * Max upgrade a skill (use all remaining SP)
       * @param {string} skillId - Skill ID to max upgrade
       * @returns {boolean} - True if successful
       */
      maxUpgradeSkill(skillId) {
        try {
          const result = this.findSkillAndTier(skillId);
          if (!result) {
            console.error("SkillTree: Skill not found:", skillId);
            return false;
          }
          const { skill, tier } = result;
          const currentLevel = this.getSkillLevel(skillId);
          const plan = this._buildMaxUpgradePlan(tier, currentLevel, this.settings.skillPoints);
          if (currentLevel >= plan.maxLevel) return false;
          if (!this.canUnlockSkill(skill, tier)) {
            return false;
          }
          if (plan.levelsUpgraded === 0) {
            return false;
          }
          this.settings.skillPoints -= plan.totalCost;
          this.settings.skillLevels[skillId] = plan.targetLevel;
          this._finalizeSkillUpgrade(skillId);
          const message = currentLevel === 0 ? `Skill Unlocked: ${skill.name} (Level ${plan.targetLevel})` : `${skill.name} upgraded ${plan.levelsUpgraded} level(s) to Level ${plan.targetLevel}!`;
          this._toast(message, "success");
          return true;
        } catch (error) {
          console.error("SkillTree: Error max upgrading skill", error);
          return false;
        }
      }
    };
    module2.exports = { SkillTreeUpgradeMethods: SkillTreeUpgradeMethods2 };
  }
});

// src/SkillTree/styles.js
var require_styles = __commonJS({
  "src/SkillTree/styles.js"(exports2, module2) {
    var STYLE_ID = "skilltree-css";
    var SKILL_TREE_CSS = `
      /* Main Button - Matching Discord native toolbar buttons (GIF, Stickers, Emoji) */
      .st-skill-tree-button-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0 0 0 4px;
        box-sizing: border-box;
      }
      .st-skill-tree-button {
        width: 32px;
        height: 32px;
        background: transparent;
        border: 1px solid rgba(138, 43, 226, 1);
        border-radius: 2px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease, background-color 0.15s ease;
        color: var(--interactive-normal, #b9bbbe);
        padding: 0;
        margin: 0;
        box-sizing: border-box;
      }
      .st-skill-tree-button:hover {
        color: var(--interactive-hover, #dcddde);
        background: rgba(138, 43, 226, 0.15);
        border-color: rgba(138, 43, 226, 0.85);
      }
      .st-skill-tree-button:active {
        color: var(--interactive-active, #fff);
        background: rgba(138, 43, 226, 0.25);
        border-color: rgba(138, 43, 226, 1);
      }
      .st-skill-tree-button svg {
        width: 20px;
        height: 20px;
        display: block;
      }

      /* Modal Container */
      .skilltree-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(145deg, #0a0a10 0%, #0d0d14 50%, #08080e 100%);
        border-radius: 2px;
        padding: 0;
        max-width: 900px;
        width: 90vw;
        max-height: 85vh;
        overflow: hidden;
        z-index: 10001;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8),
                    0 0 100px rgba(138, 43, 226, 0.3),
                    inset 0 0 100px rgba(75, 0, 130, 0.1);
        border: 2px solid rgba(138, 43, 226, 0.3);
        animation: modalFadeIn 0.3s ease-out;
      }
      @keyframes modalFadeIn {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      /* Modal Content */
      .skilltree-modal-content {
        padding: 30px;
        padding-bottom: 80px;
        overflow-y: auto;
        max-height: calc(85vh - 200px);
        background: linear-gradient(180deg, #0a0a0f 0%, #08080d 100%);
      }

      /* Header */
      .skilltree-header {
        background: linear-gradient(135deg, #1a0e2e 0%, #140a24 100%);
        padding: 25px 30px;
        border-bottom: 2px solid rgba(138, 43, 226, 0.3);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        position: relative;
        overflow: hidden;
      }
      .skilltree-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        animation: shimmer 3s infinite;
      }
      @keyframes shimmer {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      .skilltree-header h2 {
        margin: 0 0 12px 0;
        color: #fff;
        font-size: 28px;
        font-weight: 800;
        text-shadow: 0 2px 10px rgba(138, 43, 226, 0.8),
                     0 0 20px rgba(75, 0, 130, 0.6);
        letter-spacing: 1px;
        background: linear-gradient(135deg, #fff 0%, #e8dcff 50%, #d4b8ff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .skilltree-header-info {
        display: flex;
        gap: 20px;
        align-items: center;
        flex-wrap: wrap;
      }
      .skilltree-stat {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: #1a0e2e;
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 2px;
        color: #e8dcff;
        font-size: 14px;
        font-weight: 600;
      }

      .skilltree-reset-btn {
        padding: 10px 20px;
        background: linear-gradient(135deg, #cc2222 0%, #aa1818 100%);
        border: 2px solid var(--danger-color, #ff4444);
        border-radius: 2px;
        color: white;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: 0 0 15px rgba(255, 68, 68, 0.3);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .skilltree-reset-btn:hover {
        background: linear-gradient(135deg, rgba(255, 68, 68, 1) 0%, rgba(220, 38, 38, 1) 100%);
        border-color: rgba(255, 100, 100, 1);
        box-shadow: 0 0 25px rgba(255, 68, 68, 0.6);
        transform: translateY(-2px);
      }

      .skilltree-reset-btn:active {
        transform: translateY(0);
        box-shadow: 0 0 15px rgba(255, 68, 68, 0.4);
        backdrop-filter: blur(10px);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      }

      /* Custom Confirm Dialog */
      .st-confirm-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #000000cc;
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        animation: fadeIn 0.2s ease;
      }

      .st-confirm-dialog {
        background: linear-gradient(135deg, #0a0a10 0%, #08080d 100%);
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 2px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 0 40px rgba(138, 43, 226, 0.35);
        animation: bounceIn 0.3s ease;
      }

      .st-confirm-header {
        padding: 20px;
        border-bottom: 2px solid rgba(138, 43, 226, 0.35);
      }

      .st-confirm-header h3 {
        margin: 0;
        color: #a855f7;
        font-size: 22px;
        font-weight: bold;
        text-align: center;
      }

      .st-confirm-body {
        padding: 25px;
        color: rgba(236, 233, 255, 0.92);
        font-size: 15px;
        line-height: 1.6;
      }

      .st-confirm-body p {
        margin: 0 0 10px 0;
      }

      .st-confirm-body ul {
        margin: 10px 0;
        padding-left: 25px;
      }

      .st-confirm-body li {
        margin: 8px 0;
        color: rgba(236, 233, 255, 0.8);
      }

      .st-confirm-actions {
        display: flex;
        gap: 12px;
        padding: 20px;
        border-top: 2px solid rgba(138, 43, 226, 0.25);
      }

      .st-confirm-btn {
        flex: 1;
        padding: 12px 24px;
        border-radius: 2px;
        font-size: 15px;
        font-weight: bold;
        cursor: pointer;
        outline: none;
        transition: all 0.25s ease;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .st-confirm-cancel {
        background: linear-gradient(135deg, #0d0d14 0%, #0d0d14 100%);
        border: 2px solid rgba(138, 43, 226, 0.35);
        color: rgba(236, 233, 255, 0.9);
      }

      .st-confirm-cancel:hover {
        background: linear-gradient(135deg, #111118 0%, #111118 100%);
        border-color: rgba(168, 85, 247, 0.7);
        transform: translateY(-2px);
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.35);
      }

      .st-confirm-yes {
        background: linear-gradient(135deg, #7a26cc 0%, #4b0082 100%);
        border: 2px solid rgba(168, 85, 247, 0.9);
        color: white;
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.4);
      }

      .st-confirm-yes:hover {
        background: linear-gradient(135deg, rgba(168, 85, 247, 1) 0%, rgba(138, 43, 226, 1) 100%);
        border-color: rgba(168, 85, 247, 1);
        transform: translateY(-2px);
        box-shadow: 0 0 25px rgba(168, 85, 247, 0.55);
      }

      .st-confirm-btn:active {
        transform: translateY(0);
      }
      .skilltree-stat-value {
        color: #fbbf24;
        font-weight: 700;
        text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
      }

      /* Close Button */
      .skilltree-close-btn {
        position: absolute;
        top: 15px;
        right: 15px;
        background: linear-gradient(135deg, #ff4444 0%, #cc2222 100%);
        color: white;
        border: none;
        border-radius: 2px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 18px;
        font-weight: 700;
        box-shadow: 0 4px 15px rgba(255, 68, 68, 0.4);
        transition: all 0.2s;
        z-index: 10;
      }
      .skilltree-close-btn:hover {
        transform: scale(1.1) rotate(90deg);
        box-shadow: 0 6px 20px rgba(255, 68, 68, 0.6);
      }

      /* Tier Section */
      /* Tier Navigation Bar */
      .skilltree-tier-nav {
        display: flex;
        gap: 8px;
        padding: 16px 20px;
        background: linear-gradient(135deg, #12091e 0%, #0e0716 100%);
        border-bottom: 2px solid rgba(138, 43, 226, 0.2);
        overflow-x: auto;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }

      .skilltree-tier-nav::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }

      .skilltree-tier-nav::-webkit-scrollbar-track {
        background: transparent !important;
      }

      .skilltree-tier-nav::-webkit-scrollbar-thumb {
        background: transparent !important;
        border: none !important;
      }

      .skilltree-tier-nav-btn {
        padding: 10px 20px;
        background: linear-gradient(135deg, #0d0d14 0%, #08080d 100%);
        border: 2px solid rgba(138, 43, 226, 0.5);
        border-radius: 2px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.2);
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .skilltree-tier-nav-btn:hover {
        border-color: rgba(138, 43, 226, 0.8);
        background: linear-gradient(135deg, #2a1548 0%, #1e0f36 100%);
        box-shadow: 0 0 25px rgba(138, 43, 226, 0.5);
        transform: translateY(-2px);
        color: #fff;
      }

      .skilltree-tier-nav-btn:active {
        transform: translateY(0);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.3);
      }

      .skilltree-tier-nav-btn.active {
        background: linear-gradient(135deg, #3d1a66 0%, #2e1450 100%);
        border-color: #8a2be2;
        box-shadow: 0 0 30px rgba(138, 43, 226, 0.7);
        color: #fff;
        font-weight: 700;
      }

      .skilltree-tier {
        margin: 35px 0;
        padding: 25px;
        background: linear-gradient(135deg, #110a1e 0%, #0e0818 100%);
        border-radius: 2px;
        border: 1px solid rgba(138, 43, 226, 0.2);
        scroll-margin-top: 20px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
        position: relative;
        overflow: hidden;
      }
      .skilltree-tier::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #8a2be2 0%, #4b0082 50%, #8a2be2 100%);
        background-size: 200% 100%;
        animation: gradientShift 3s ease infinite;
      }
      .skilltree-tier-header {
        color: #fff;
        margin: 0 0 20px 0;
        font-size: 22px;
        font-weight: 700;
        padding-bottom: 12px;
        border-bottom: 2px solid rgba(138, 43, 226, 0.4);
        text-shadow: 0 2px 8px rgba(138, 43, 226, 0.6);
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .skilltree-tier-badge {
        display: inline-block;
        padding: 4px 12px;
        background: linear-gradient(135deg, #8a2be2 0%, #4b0082 100%);
        border-radius: 2px;
        font-size: 12px;
        font-weight: 700;
        color: white;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        box-shadow: 0 2px 8px rgba(138, 43, 226, 0.4);
      }

      /* Skill Card */
      .skilltree-skill {
        background: linear-gradient(135deg, #0a0a12 0%, #08080e 100%);
        border-radius: 2px;
        padding: 18px;
        margin: 12px 0;
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-left: 4px solid #8a2be2;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
      }
      .skilltree-skill::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(138, 43, 226, 0.1), transparent);
        transition: left 0.5s;
      }
      .skilltree-skill:hover {
        transform: translateX(5px);
        border-color: rgba(138, 43, 226, 0.5);
        box-shadow: 0 6px 25px rgba(138, 43, 226, 0.3),
                    0 0 30px rgba(75, 0, 130, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }
      .skilltree-skill:hover::before {
        left: 100%;
      }
      .skilltree-skill.unlocked {
        border-left-color: #00ff88;
        background: linear-gradient(135deg, #081a12 0%, #0a0a12 100%);
      }
      .skilltree-skill.max-level {
        border-left-color: #fbbf24;
        background: linear-gradient(135deg, #1a1508 0%, #0a0a12 100%);
        box-shadow: 0 4px 20px rgba(251, 191, 36, 0.2),
                    0 0 30px rgba(251, 191, 36, 0.1);
      }
      .skilltree-skill-name {
        font-weight: 700;
        color: #fff;
        margin-bottom: 6px;
        font-size: 16px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        letter-spacing: 0.3px;
      }
      .skilltree-skill-desc {
        color: #cbd5e1;
        font-size: 13px;
        margin-bottom: 10px;
        line-height: 1.5;
      }
      .skilltree-skill-lore {
        color: #a855f7;
        font-size: 11px;
        font-style: italic;
        margin-top: 6px;
        padding-left: 12px;
        border-left: 2px solid rgba(168, 85, 247, 0.3);
      }
      .skilltree-skill-level {
        color: #00ff88;
        font-size: 12px;
        margin-top: 10px;
        margin-bottom: 6px;
        font-weight: 600;
        text-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
      }
      .skilltree-skill-effects {
        color: #00ff88;
        font-size: 11px;
        margin-top: 8px;
        padding: 8px;
        background: #081a12;
        border-radius: 2px;
        border: 1px solid rgba(0, 255, 136, 0.25);
      }
      .skilltree-skill-cost {
        color: #fbbf24;
        font-size: 12px;
        font-weight: 600;
        margin-top: 8px;
        text-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
      }
      .skilltree-skill-max {
        color: #fbbf24;
        font-size: 12px;
        font-weight: 700;
        margin-top: 8px;
        text-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .skilltree-btn-group {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      .skilltree-upgrade-btn {
        background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
        color: white;
        border: none;
        border-radius: 2px;
        padding: 10px 20px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 4px 15px rgba(0, 255, 136, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        flex: 1;
      }
      .skilltree-upgrade-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 255, 136, 0.6),
                    inset 0 1px 0 rgba(255, 255, 255, 0.3);
        background: linear-gradient(135deg, #00ff88 0%, #00ff88 100%);
      }
      .skilltree-upgrade-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      .skilltree-upgrade-btn:disabled {
        background: linear-gradient(135deg, #475569 0%, #334155 100%);
        cursor: not-allowed;
        opacity: 0.5;
        box-shadow: none;
      }
      .skilltree-max-btn {
        background: linear-gradient(135deg, #8a2be2 0%, #4b0082 100%);
        color: white;
        border: none;
        border-radius: 2px;
        padding: 10px 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 4px 15px rgba(138, 43, 226, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .skilltree-max-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(138, 43, 226, 0.6),
                    inset 0 1px 0 rgba(255, 255, 255, 0.3);
        background: linear-gradient(135deg, #4b0082 0%, #8a2be2 100%);
      }
      .skilltree-max-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      .skilltree-max-btn:disabled {
        background: linear-gradient(135deg, #475569 0%, #334155 100%);
        cursor: not-allowed;
        opacity: 0.5;
        box-shadow: none;
      }

      /* Scrollbar - Hidden but scrollable */
      .skilltree-modal-content::-webkit-scrollbar {
        width: 0px;
        background: transparent;
      }
      .skilltree-modal-content {
        scrollbar-width: none;  /* Firefox */
        -ms-overflow-style: none;  /* IE 10+ */
      }

      /* ===== ACTIVE SKILLS SECTION ===== */
      .skilltree-active-section {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 2px solid rgba(138, 43, 226, 0.3);
      }
      .skilltree-active-section-header {
        font-size: 16px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.95);
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .skilltree-mana-bar-container {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
        padding: 10px 14px;
        background: #08080e;
        border-radius: 2px;
        border: 1px solid rgba(0, 100, 255, 0.3);
      }
      .skilltree-mana-bar-label {
        font-size: 13px;
        font-weight: 600;
        color: rgba(100, 180, 255, 0.9);
        white-space: nowrap;
      }
      .skilltree-mana-bar-track {
        flex: 1;
        height: 12px;
        background: #060608;
        border-radius: 2px;
        overflow: hidden;
        position: relative;
      }
      .skilltree-mana-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #1e64ff 0%, #64b4ff 100%);
        border-radius: 2px;
        transition: width 0.5s ease;
        box-shadow: 0 0 8px rgba(30, 100, 255, 0.5);
      }
      .skilltree-mana-bar-text {
        font-size: 12px;
        font-weight: 600;
        color: rgba(100, 180, 255, 0.9);
        white-space: nowrap;
        min-width: 65px;
        text-align: right;
      }

      /* Active Skill Card */
      .skilltree-active-skill {
        padding: 14px 16px;
        margin-bottom: 10px;
        background: linear-gradient(135deg, #0a0a12 0%, #0c0c14 100%);
        border: 1px solid rgba(138, 43, 226, 0.25);
        border-radius: 2px;
        transition: all 0.3s ease;
      }
      .skilltree-active-skill:hover {
        border-color: rgba(138, 43, 226, 0.5);
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.15);
      }
      .skilltree-active-skill.is-active {
        border-color: rgba(0, 255, 136, 0.6);
        box-shadow: 0 0 15px rgba(0, 255, 136, 0.15);
        background: linear-gradient(135deg, #081a12 0%, #0a0a12 100%);
      }
      .skilltree-active-skill.is-locked {
        opacity: 0.45;
        filter: grayscale(0.4);
      }
      .skilltree-active-skill-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      .skilltree-active-skill-name {
        font-size: 14px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.95);
      }
      .skilltree-active-skill-cost {
        font-size: 12px;
        font-weight: 600;
        color: rgba(100, 180, 255, 0.9);
      }
      .skilltree-active-skill-desc {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        margin-bottom: 6px;
        line-height: 1.3;
      }
      .skilltree-active-skill-lore {
        font-size: 11px;
        color: rgba(138, 43, 226, 0.7);
        font-style: italic;
        margin-bottom: 8px;
      }
      .skilltree-active-skill-info {
        display: flex;
        gap: 12px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 8px;
      }
      .skilltree-active-skill-info span {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .skilltree-active-skill-status {
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .skilltree-active-skill-status.active-text {
        color: #00ff88;
      }
      .skilltree-active-skill-status.cooldown-text {
        color: #ff4444;
      }

      /* Activate Button */
      .skilltree-activate-btn {
        width: 100%;
        padding: 8px 16px;
        border-radius: 2px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        border: 2px solid rgba(138, 43, 226, 0.6);
        background: linear-gradient(135deg, #6a1fb3 0%, #4b0082 100%);
        color: white;
        transition: all 0.3s ease;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .skilltree-activate-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #9a4de6 0%, #7a26cc 100%);
        border-color: rgba(168, 85, 247, 0.9);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.4);
        transform: translateY(-1px);
      }
      .skilltree-activate-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        background: #0d0d14;
        border-color: rgba(138, 43, 226, 0.2);
      }
      .skilltree-activate-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      .skilltree-active-skill-unlock-req {
        font-size: 11px;
        color: rgba(255, 68, 68, 0.8);
        font-style: italic;
      }

      /* Shadow-theme harmonization (kept scoped to SkillTree classes) */
      .skilltree-modal {
        --st-primary-rgb: var(--sl-color-primary-rgb, 138, 43, 226);
        --st-primary: rgb(var(--st-primary-rgb));
        --st-surface: rgba(8, 10, 20, 0.98);
        --st-surface-soft: rgba(12, 15, 30, 0.95);
        --st-text: rgba(236, 233, 255, 0.95);
        --st-text-muted: rgba(236, 233, 255, 0.72);
      }

      .skilltree-modal,
      .st-confirm-dialog {
        background: linear-gradient(145deg, var(--st-surface) 0%, var(--st-surface-soft) 100%);
        border-color: rgba(var(--st-primary-rgb), 0.42);
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.55), 0 0 28px rgba(var(--st-primary-rgb), 0.24);
      }

      .skilltree-header,
      .skilltree-tier-nav,
      .skilltree-tier,
      .skilltree-skill,
      .skilltree-active-skill,
      .skilltree-mana-bar-container {
        background: linear-gradient(145deg, rgba(12, 15, 30, 0.95) 0%, rgba(8, 10, 20, 0.95) 100%);
        border-color: rgba(var(--st-primary-rgb), 0.32);
      }

      .skilltree-header h2,
      .skilltree-tier-header,
      .skilltree-active-section-header {
        color: var(--st-text);
      }

      .skilltree-skill-desc,
      .skilltree-active-skill-desc,
      .skilltree-active-skill-info,
      .skilltree-active-skill-unlock-req {
        color: var(--st-text-muted);
      }

      .skilltree-tier-nav-btn,
      .skilltree-activate-btn,
      .skilltree-max-btn {
        border-color: rgba(var(--st-primary-rgb), 0.72);
      }

      .skilltree-tier-nav-btn.active {
        background: linear-gradient(135deg, rgba(var(--st-primary-rgb), 0.48) 0%, rgba(40, 22, 72, 0.92) 100%);
      }
    `;
    function injectSkillTreeCss2() {
      const existingStyle = document.getElementById(STYLE_ID);
      if (existingStyle) {
        existingStyle.remove();
      }
      try {
        BdApi.DOM.addStyle(STYLE_ID, SKILL_TREE_CSS);
      } catch (error) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = SKILL_TREE_CSS;
        document.head.appendChild(style);
      }
    }
    module2.exports = { injectSkillTreeCss: injectSkillTreeCss2 };
  }
});

// src/shared/bd-module-loader.js
var require_bd_module_loader = __commonJS({
  "src/shared/bd-module-loader.js"(exports2, module2) {
    function loadBdModuleFromPlugins(fileName) {
      if (!fileName) return null;
      try {
        const fs = require("fs");
        const path = require("path");
        const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), "utf8");
        const moduleObj = { exports: {} };
        const factory = new Function(
          "module",
          "exports",
          "require",
          "BdApi",
          `${source}
return module.exports || exports || null;`
        );
        const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
        const candidate = loaded || moduleObj.exports;
        if (typeof candidate === "function") return candidate;
        if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) {
          return candidate;
        }
      } catch (_) {
      }
      return null;
    }
    module2.exports = {
      loadBdModuleFromPlugins
    };
  }
});

// src/SkillTree/shared-utils.js
var require_shared_utils = __commonJS({
  "src/SkillTree/shared-utils.js"(exports2, module2) {
    var { loadBdModuleFromPlugins } = require_bd_module_loader();
    var _bdLoad = loadBdModuleFromPlugins;
    var _ReactUtils2;
    try {
      _ReactUtils2 = _bdLoad("BetterDiscordReactUtils.js");
    } catch (_) {
      _ReactUtils2 = null;
    }
    var _SLUtils2;
    _SLUtils2 = _bdLoad("SoloLevelingUtils.js") || window.SoloLevelingUtils || null;
    if (_SLUtils2 && !window.SoloLevelingUtils) window.SoloLevelingUtils = _SLUtils2;
    var _PluginUtils2;
    try {
      _PluginUtils2 = _bdLoad("BetterDiscordPluginUtils.js");
    } catch (_) {
      _PluginUtils2 = null;
    }
    module2.exports = {
      _PluginUtils: _PluginUtils2,
      _ReactUtils: _ReactUtils2,
      _SLUtils: _SLUtils2,
      _bdLoad
    };
  }
});

// src/SkillTree/ui-methods.js
var require_ui_methods = __commonJS({
  "src/SkillTree/ui-methods.js"(exports2, module2) {
    var { _PluginUtils: _PluginUtils2 } = require_shared_utils();
    var SkillTreeUiMethods2 = {
      _getComposerRoot() {
        var _a;
        const primaryChat = this._getPrimaryChatContainer();
        const roots = [
          ...((_a = primaryChat == null ? void 0 : primaryChat.querySelectorAll) == null ? void 0 : _a.call(primaryChat, '[class*="channelTextArea"]')) || [],
          ...document.querySelectorAll('[class*="channelTextArea"]')
        ];
        const uniqueRoots = Array.from(new Set(roots));
        for (const root of uniqueRoots) {
          if (!this._isElementVisible(root)) continue;
          const formRoot = root.closest("form") || root;
          const editor = formRoot.querySelector(
            '[role="textbox"], textarea, [contenteditable="true"], [class*="slateTextArea"]'
          );
          if (!editor) continue;
          return formRoot;
        }
        return null;
      },
      _getPrimaryChatContainer() {
        return document.querySelector('main[class*="chatContent"]') || document.querySelector('section[class*="chatContent"][role="main"]') || document.querySelector('section[class*="chatContent"]:not([role="complementary"])') || document.querySelector('div[class*="chatContent"]:not([role="complementary"])');
      },
      _isElementVisible(element) {
        var _a;
        if (!element || !element.isConnected) return false;
        if (element.getAttribute("aria-hidden") === "true") return false;
        const rects = (_a = element.getClientRects) == null ? void 0 : _a.call(element);
        return !!(rects && rects.length > 0);
      },
      /**
       * Update button text with current SP count
       */
      updateButtonText() {
        if (this.skillTreeButton) {
          this.skillTreeButton.title = `Skill Tree (${this.settings.skillPoints} SP)`;
        }
      },
      /**
       * Show skill tree modal (React v3.0.0)
       * If already open, forces a re-render. Otherwise creates root and renders.
       */
      showSkillTreeModal() {
        var _a, _b;
        this.recalculateSPFromLevel();
        this.checkForLevelUp();
        if (this._modalReactRoot && this._modalForceUpdate) {
          this._modalForceUpdate();
          return;
        }
        let container = document.getElementById("st-modal-root");
        if (!container) {
          container = document.createElement("div");
          container.id = "st-modal-root";
          container.style.display = "contents";
          document.body.appendChild(container);
        }
        this._modalContainer = container;
        const React = BdApi.React;
        const { SkillTreeModal } = this._components;
        const onClose = () => this.closeSkillTreeModal();
        const element = React.createElement(SkillTreeModal, { onClose });
        const createRoot = this._getCreateRoot();
        if (createRoot) {
          const root = createRoot(container);
          this._modalReactRoot = root;
          root.render(element);
          return;
        }
        const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule((m) => (m == null ? void 0 : m.render) && (m == null ? void 0 : m.unmountComponentAtNode));
        if (ReactDOM == null ? void 0 : ReactDOM.render) {
          ReactDOM.render(element, container);
          return;
        }
        console.error("[SkillTree] Neither createRoot nor ReactDOM.render available");
        container.remove();
        (_b = (_a = BdApi.UI) == null ? void 0 : _a.showToast) == null ? void 0 : _b.call(_a, "SkillTree: React rendering unavailable", { type: "error" });
      },
      /**
       * Close and unmount skill tree modal (React v3.0.0)
       */
      closeSkillTreeModal() {
        if (this._modalReactRoot) {
          try {
            this._modalReactRoot.unmount();
          } catch (error) {
            console.error("[SkillTree] Failed to unmount modal React root:", error);
          }
          this._modalReactRoot = null;
        }
        const container = document.getElementById("st-modal-root");
        if (container) {
          try {
            const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule((m) => m == null ? void 0 : m.unmountComponentAtNode);
            if (ReactDOM == null ? void 0 : ReactDOM.unmountComponentAtNode) ReactDOM.unmountComponentAtNode(container);
          } catch (error) {
            console.error("[SkillTree] Failed to unmount legacy modal container:", error);
          }
          container.remove();
        }
        this._modalContainer = null;
        this._modalForceUpdate = null;
      },
      /**
       * Setup channel watcher for URL changes (event-based, no polling)
       * Enhanced to persist buttons across guild/channel switches
       */
      setupChannelWatcher() {
        let lastUrl = window.location.href;
        const handleUrlChange = () => {
          if (this._isStopped) return;
          const currentUrl = window.location.href;
          if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            this._setTrackedTimeout(() => this.updateButtonText(), 300);
          }
        };
        if (_PluginUtils2 == null ? void 0 : _PluginUtils2.NavigationBus) {
          this._navBusUnsub = _PluginUtils2.NavigationBus.subscribe(() => handleUrlChange());
        }
        this._urlChangeCleanup = () => {
          if (this._navBusUnsub) {
            this._navBusUnsub();
            this._navBusUnsub = null;
          }
        };
      },
      /**
       * Setup window focus/visibility watcher (detects when user returns from another window)
       * Pattern from AutoIdleOnAFK plugin - uses window blur/focus events for reliable detection
       */
      setupWindowFocusWatcher() {
        this._boundHandleBlur = this._handleWindowBlur.bind(this);
        this._boundHandleFocus = this._handleWindowFocus.bind(this);
        this._boundHandleVisibilityChange = () => {
          if (this._isStopped || document.hidden) return;
          this._setTrackedTimeout(() => this.updateButtonText(), 300);
        };
        window.addEventListener("blur", this._boundHandleBlur);
        window.addEventListener("focus", this._boundHandleFocus);
        document.addEventListener("visibilitychange", this._boundHandleVisibilityChange);
        this._windowFocusCleanup = () => {
          window.removeEventListener("blur", this._boundHandleBlur);
          window.removeEventListener("focus", this._boundHandleFocus);
          document.removeEventListener("visibilitychange", this._boundHandleVisibilityChange);
        };
      },
      /**
       * Handle window blur event (Discord window loses focus)
       * Pattern from AutoIdleOnAFK - fires when user switches to another window/app
       */
      _handleWindowBlur() {
        if (this._isStopped) return;
      },
      /**
       * Handle window focus event (Discord window gains focus)
       * Pattern from AutoIdleOnAFK - fires when user returns to Discord window
       */
      _handleWindowFocus() {
        if (this._isStopped) return;
      }
    };
    module2.exports = { SkillTreeUiMethods: SkillTreeUiMethods2 };
  }
});

// src/SkillTree/index.js
var { buildSkillTreeComponents } = require_components();
var { ActiveSkillMethods } = require_active_skill_methods();
var { createSkillTreeData } = require_data();
var { SkillTreeUpgradeMethods } = require_skill_upgrade_methods();
var { injectSkillTreeCss } = require_styles();
var { SkillTreeUiMethods } = require_ui_methods();
var { _PluginUtils, _ReactUtils, _SLUtils } = require_shared_utils();
module.exports = class SkillTree {
  // ============================================================================
  // §1 CONSTRUCTOR & INITIALIZATION
  // ============================================================================
  constructor() {
    const data = createSkillTreeData();
    this.defaultSettings = data.defaultSettings;
    this.skillTree = data.skillTree;
    this.activeSkillDefs = data.activeSkillDefs;
    this.activeSkillOrder = data.activeSkillOrder;
    this._retryTimeouts = /* @__PURE__ */ new Set();
    this._isStopped = false;
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
    this._modalContainer = null;
    this._modalReactRoot = null;
    this._modalForceUpdate = null;
    this._components = null;
    this._toolbarCache = {
      element: null,
      time: 0,
      ttl: 1500
    };
    this.settings = structuredClone(this.defaultSettings);
    this.skillTreeModal = null;
    this.skillTreeButton = null;
    this.levelCheckInterval = null;
    this.eventUnsubscribers = [];
    this._urlChangeCleanup = null;
    this._windowFocusCleanup = null;
    this._retryTimeout1 = null;
    this._retryTimeout2 = null;
    this._periodicCheckInterval = null;
    this._ensureButtonScheduled = false;
    this._manaRegenInterval = null;
    this._activeSkillTimers = {};
    this._cache = {
      soloLevelingData: null,
      soloLevelingDataTime: 0,
      soloLevelingDataTTL: 100,
      // 100ms - data changes frequently
      soloPluginInstance: null,
      // Cache plugin instance to avoid repeated lookups
      soloPluginInstanceTime: 0,
      soloPluginInstanceTTL: 5e3,
      // 5s - plugin instance doesn't change often
      skillBonuses: null,
      // Cache calculated skill bonuses
      skillBonusesTime: 0,
      skillBonusesTTL: 500
      // 500ms - bonuses change when skills are upgraded
    };
  }
  // ============================================================================
  // §2 LIFECYCLE METHODS (start/stop)
  // ============================================================================
  start() {
    var _a, _b;
    this._toast = ((_a = _PluginUtils == null ? void 0 : _PluginUtils.createToastHelper) == null ? void 0 : _a.call(_PluginUtils, "skillTree")) || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
    this._isStopped = false;
    this.loadSettings();
    this._loadSLUtils();
    this._components = buildSkillTreeComponents(this);
    this.initializeSpentSP();
    this.injectCSS();
    if ((_b = this._SLUtils) == null ? void 0 : _b.registerToolbarButton) {
      this._SLUtils.registerToolbarButton({
        id: "st-skill-tree-button-wrapper",
        priority: 20,
        // After TitleManager (10)
        renderReact: (React, _channel) => this._renderSkillTreeButtonReact(React),
        cleanup: () => {
          this.skillTreeButton = null;
        }
      });
    } else {
      console.error("[SkillTree] SLUtils not available \u2014 toolbar button inactive");
    }
    this.saveSkillBonuses();
    this.setupChannelWatcher();
    this.setupWindowFocusWatcher();
    this.setupLevelUpWatcher();
    this.recalculateSPFromLevel();
    this.startLevelPolling();
    this.restoreActiveSkillTimers();
    this.saveActiveBuffs();
    this.startManaRegen();
  }
  _setTrackedTimeout(callback, delayMs) {
    const wrappedCallback = () => {
      this._retryTimeouts.delete(timeoutId);
      if (this._isStopped) return;
      callback();
    };
    const timeoutId = setTimeout(wrappedCallback, delayMs);
    this._retryTimeouts.add(timeoutId);
    return timeoutId;
  }
  _clearTrackedTimeout(timeoutId) {
    if (!Number.isFinite(timeoutId)) return;
    clearTimeout(timeoutId);
    this._retryTimeouts.delete(timeoutId);
  }
  /**
   * Load SoloLevelingUtils shared library (toolbar registry, React injection, etc.)
   */
  _loadSLUtils() {
    this._SLUtils = _SLUtils || window.SoloLevelingUtils || null;
  }
  /**
   * Get React 18 createRoot with webpack fallbacks (same pattern as ShadowExchange)
   */
  _getCreateRoot() {
    var _a;
    if (_ReactUtils == null ? void 0 : _ReactUtils.getCreateRoot) return _ReactUtils.getCreateRoot();
    if ((_a = BdApi.ReactDOM) == null ? void 0 : _a.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  }
  /**
   * Render SkillTree button as a React element (for SLUtils Tier 1 React toolbar patcher).
   * Returns a React element that will be injected into ChatButtonsGroup.type children.
   * @param {Object} React - BdApi.React
   * @returns {ReactElement}
   */
  _renderSkillTreeButtonReact(React) {
    var _a;
    if (this._isStopped) return null;
    const pluginInstance = this;
    const sp = ((_a = this.settings) == null ? void 0 : _a.skillPoints) ?? 0;
    const svgPath = "M12 4V15.2C12 16.8802 12 17.7202 12.327 18.362C12.6146 18.9265 13.0735 19.3854 13.638 19.673C14.2798 20 15.1198 20 16.8 20H17M17 20C17 21.1046 17.8954 22 19 22C20.1046 22 21 21.1046 21 20C21 18.8954 20.1046 18 19 18C17.8954 18 17 18.8954 17 20ZM7 4L17 4M7 4C7 5.10457 6.10457 6 5 6C3.89543 6 3 5.10457 3 4C3 2.89543 3.89543 2 5 2C6.10457 2 7 2.89543 7 4ZM17 4C17 5.10457 17.8954 6 19 6C20.1046 6 21 5.10457 21 4C21 2.89543 20.1046 2 19 2C17.8954 2 17 2.89543 17 4ZM12 12H17M17 12C17 13.1046 17.8954 14 19 14C20.1046 14 21 13.1046 21 12C21 10.8954 20.1046 10 19 10C17.8954 10 17 10.8954 17 12Z";
    return React.createElement(
      "div",
      {
        id: "st-skill-tree-button-wrapper",
        className: "st-skill-tree-button-wrapper",
        style: { display: "flex", alignItems: "center" }
      },
      React.createElement(
        "button",
        {
          className: "st-skill-tree-button",
          title: `Skill Tree (${sp} SP)`,
          onClick: () => pluginInstance.showSkillTreeModal(),
          ref: (el) => {
            if (el && el !== pluginInstance.skillTreeButton) {
              pluginInstance.skillTreeButton = el;
            }
          }
        },
        React.createElement(
          "svg",
          {
            width: "20",
            height: "20",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            style: { display: "block", margin: "auto" }
          },
          React.createElement("path", { d: svgPath })
        )
      )
    );
  }
  startLevelPolling() {
    if (this.eventUnsubscribers.length > 0) return;
    if (this.levelCheckInterval) return;
    this.levelCheckInterval = setInterval(() => {
      if (this._isStopped || document.hidden) return;
      this.checkForLevelUp();
      this.recalculateSPFromLevel();
    }, 15e3);
  }
  stopLevelPolling() {
    if (!this.levelCheckInterval) return;
    clearInterval(this.levelCheckInterval);
    this.levelCheckInterval = null;
  }
  // ============================================================================
  // §3 EVENT HANDLING & WATCHERS
  // ============================================================================
  setupLevelUpWatcher() {
    var _a, _b;
    if (this._isStopped) {
      return;
    }
    const instance = (_b = (_a = this._SLUtils) == null ? void 0 : _a.getPluginInstance) == null ? void 0 : _b.call(_a, "SoloLevelingStats");
    if (!instance) {
      this._setTrackedTimeout(() => this.setupLevelUpWatcher(), 2e3);
      return;
    }
    if (!instance || typeof instance.on !== "function") {
      this._setTrackedTimeout(() => this.setupLevelUpWatcher(), 2e3);
      return;
    }
    const unsubscribeLevel = instance.on("levelChanged", (data) => {
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;
      const lastLevel = this.settings.lastLevel || 1;
      if (data.newLevel > lastLevel) {
        const levelsGained = data.newLevel - lastLevel;
        this.awardSPForLevelUp(levelsGained);
        this.settings.lastLevel = data.newLevel;
        this.saveSettings();
      }
    });
    this.eventUnsubscribers.push(unsubscribeLevel);
    this.stopLevelPolling();
    this.checkForLevelUp();
  }
  stop() {
    var _a, _b;
    this._isStopped = true;
    try {
      (_b = (_a = this._SLUtils) == null ? void 0 : _a.unregisterToolbarButton) == null ? void 0 : _b.call(_a, "st-skill-tree-button-wrapper");
    } catch (error) {
      console.error("[SkillTree] Failed to unregister toolbar button:", error);
    }
    this.unsubscribeFromEvents();
    this.stopLevelPolling();
    this.stopManaRegen();
    Object.values(this._activeSkillTimers).forEach((tid) => clearTimeout(tid));
    this._activeSkillTimers = {};
    this._retryTimeouts.forEach((timeoutId) => this._clearTrackedTimeout(timeoutId));
    this._retryTimeouts.clear();
    if (this._retryTimeout1) {
      this._clearTrackedTimeout(this._retryTimeout1);
      this._retryTimeout1 = null;
    }
    if (this._retryTimeout2) {
      this._clearTrackedTimeout(this._retryTimeout2);
      this._retryTimeout2 = null;
    }
    if (this._urlChangeCleanup) {
      try {
        this._urlChangeCleanup();
      } catch (e) {
        console.error("[SkillTree] Error during URL change watcher cleanup:", e);
      } finally {
        this._urlChangeCleanup = null;
      }
    }
    if (this._windowFocusCleanup) {
      try {
        this._windowFocusCleanup();
      } catch (e) {
        console.error("[SkillTree] Error during window focus watcher cleanup:", e);
      } finally {
        this._windowFocusCleanup = null;
      }
    }
    if (this.skillTreeButton) {
      this.skillTreeButton.remove();
      this.skillTreeButton = null;
    }
    this._cache.soloLevelingData = null;
    this._cache.soloLevelingDataTime = 0;
    this._cache.soloPluginInstance = null;
    this._cache.soloPluginInstanceTime = 0;
    this._cache.skillBonuses = null;
    this._cache.skillBonusesTime = 0;
    this.closeSkillTreeModal();
    this.detachSkillTreeSettingsPanelHandlers();
    if (BdApi.DOM && BdApi.DOM.removeStyle) {
      BdApi.DOM.removeStyle("skilltree-css");
    } else {
      const styleElement = document.getElementById("skilltree-css");
      if (styleElement) {
        styleElement.remove();
      }
    }
  }
  detachSkillTreeSettingsPanelHandlers() {
    const root = this._settingsPanelRoot;
    const handlers = this._settingsPanelHandlers;
    if (root && handlers) {
      root.removeEventListener("change", handlers.onChange);
      root.removeEventListener("click", handlers.onClick);
    }
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
  }
  // ============================================================================
  // §4 LEVEL-UP & SP MANAGEMENT
  // ============================================================================
  checkForLevelUp() {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.level) return;
      const currentLevel = soloData.level;
      const lastLevel = this.settings.lastLevel || 1;
      if (currentLevel > lastLevel) {
        const levelsGained = currentLevel - lastLevel;
        this.awardSPForLevelUp(levelsGained);
        this.settings.lastLevel = currentLevel;
        this.saveSettings();
      }
    } catch (error) {
      console.error("SkillTree: Error checking level up", error);
    }
  }
  /**
   * Calculate total SP that should be earned based on level
   * Fixed gain: 1 SP per level (no diminishing returns)
   * @param {number} level - Current level
   * @returns {number} - Total SP earned
   */
  calculateSPForLevel(level) {
    return Math.max(0, level - 1);
  }
  /**
   * Award SP when leveling up (fixed 1 SP per level)
   * @param {number} levelsGained - Number of levels gained
   */
  awardSPForLevelUp(levelsGained) {
    var _a;
    const spEarned = levelsGained;
    this.settings.skillPoints += spEarned;
    this.settings.totalEarnedSP += spEarned;
    this.saveSettings();
    (_a = BdApi == null ? void 0 : BdApi.showToast) == null ? void 0 : _a.call(BdApi, `Level Up! +${spEarned} Skill Point${spEarned > 1 ? "s" : ""}`, {
      type: "success",
      timeout: 3e3
    });
  }
  /**
   * Debug logging helper (checks debugMode setting)
   */
  debugLog(...args) {
    var _a;
    if ((_a = this.settings) == null ? void 0 : _a.debugMode) {
      console.log("[SkillTree]", ...args);
    }
  }
  /**
   * Recalculate SP based on current level (for reset or initial setup)
   * Always syncs level and ensures SP matches current level
   */
  recalculateSPFromLevel() {
    var _a;
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.level) return;
      const currentLevel = soloData.level;
      const expectedSP = this.calculateSPForLevel(currentLevel);
      const lastLevel = this.settings.lastLevel || 1;
      if (currentLevel !== lastLevel) {
        this.settings.lastLevel = currentLevel;
        if (currentLevel > lastLevel) {
          const levelsGained = currentLevel - lastLevel;
          this.awardSPForLevelUp(levelsGained);
        }
      }
      if (this.settings.totalEarnedSP < expectedSP) {
        this.settings.totalEarnedSP = expectedSP;
      }
      const spentSP = this.getTotalSpentSP();
      const currentAvailable = this.settings.skillPoints;
      const expectedAvailable = Math.max(0, expectedSP - spentSP);
      if (spentSP > expectedSP) {
        this.debugLog(
          `SP calculation error: spent ${spentSP} but only earned ${expectedSP}. Resetting skills...`
        );
        this.settings.skillLevels = {};
        this.settings.unlockedSkills = [];
        this.settings.totalSpentSP = 0;
        this.settings.skillPoints = expectedSP;
        this.settings.totalEarnedSP = expectedSP;
        this.saveSettings();
        this.saveSkillBonuses();
        this.debugLog(`Reset all skills due to calculation error. Available SP: ${expectedSP}`);
        (_a = BdApi == null ? void 0 : BdApi.showToast) == null ? void 0 : _a.call(
          BdApi,
          `Skills reset due to calculation error. You have ${expectedSP} SP for level ${currentLevel}`,
          { type: "warning", timeout: 5e3 }
        );
        return;
      }
      if (currentAvailable !== expectedAvailable) {
        this.settings.skillPoints = expectedAvailable;
      }
      if (currentAvailable !== expectedAvailable || currentLevel !== lastLevel) {
        this.saveSettings();
      }
    } catch (error) {
      console.error("SkillTree: Error recalculating SP", error);
    }
  }
  /**
   * Reset all skills and recalculate SP based on current level
   * Useful when skills were unlocked ahead of level
   */
  resetSkills() {
    var _a, _b;
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.level) {
        (_a = BdApi == null ? void 0 : BdApi.showToast) == null ? void 0 : _a.call(BdApi, "Cannot reset: SoloLevelingStats not available", {
          type: "error",
          timeout: 3e3
        });
        return false;
      }
      const currentLevel = soloData.level;
      const expectedSP = this.calculateSPForLevel(currentLevel);
      this.settings.skillLevels = {};
      this.settings.unlockedSkills = [];
      this.settings.totalSpentSP = 0;
      this.settings.skillPoints = expectedSP;
      this.settings.totalEarnedSP = expectedSP;
      this.settings.lastLevel = currentLevel;
      this.saveSettings();
      this.saveSkillBonuses();
      (_b = BdApi == null ? void 0 : BdApi.showToast) == null ? void 0 : _b.call(BdApi, `Skills Reset! You have ${expectedSP} SP for level ${currentLevel}`, {
        type: "success",
        timeout: 4e3
      });
      if (this._modalForceUpdate) {
        this._modalForceUpdate();
      }
      return true;
    } catch (error) {
      console.error("SkillTree: Error resetting skills", error);
      return false;
    }
  }
  // ============================================================================
  // §5 SETTINGS MANAGEMENT
  // ============================================================================
  loadSettings() {
    var _a;
    try {
      const saved = BdApi.Data.load("SkillTree", "settings");
      saved && (this.settings = { ...this.defaultSettings, ...saved }, ((_a = this.settings.unlockedSkills) == null ? void 0 : _a.length) > 0 && (this.settings.skillLevels = this.settings.skillLevels || {}, this.settings.unlockedSkills.forEach(
        (skillId) => this.settings.skillLevels[skillId] = this.settings.skillLevels[skillId] || 1
      ), this.settings.unlockedSkills = [], this.saveSettings()));
      const renameMap = {
        shadow_storage: "shadow_preservation",
        basic_combat: "daggers_dance",
        dagger_throw: "dagger_rush",
        instant_dungeon: "gate_creation",
        mana_sense: "kandiarus_blessing",
        domain_expansion: "monarchs_domain",
        absolute_ruler: "rulers_domain",
        void_mastery: "shadow_realm",
        dimension_ruler: "gate_ruler",
        omnipotent_presence: "dragons_fear",
        eternal_shadow: "ashborns_will",
        true_monarch: "shadow_sovereign"
      };
      if (this.settings.skillLevels) {
        let migrated = false;
        for (const [oldId, newId] of Object.entries(renameMap)) {
          if (this.settings.skillLevels[oldId] !== void 0) {
            this.settings.skillLevels[newId] = this.settings.skillLevels[oldId];
            delete this.settings.skillLevels[oldId];
            migrated = true;
          }
        }
        if (migrated) this.saveSettings();
      }
    } catch (error) {
      console.error("SkillTree: Error loading settings", error);
    }
  }
  saveSettings() {
    try {
      BdApi.Data.save("SkillTree", "settings", this.settings);
      this.saveSkillBonuses();
      this.saveActiveBuffs();
    } catch (error) {
      console.error("SkillTree: Error saving settings", error);
    }
  }
  // ============================================================================
  // §6 SKILL BONUS CALCULATION
  // ============================================================================
  /**
   * Save skill bonuses to shared storage for SoloLevelingStats to read
   */
  saveSkillBonuses() {
    try {
      const bonuses = this.calculateSkillBonuses();
      BdApi.Data.save("SkillTree", "bonuses", bonuses);
    } catch (error) {
      console.error("SkillTree: Error saving bonuses", error);
    }
  }
  /**
   * Save active skill buff effects to shared storage for SoloLevelingStats to read
   * SLS reads this via BdApi.Data.load('SkillTree', 'activeBuffs')
   */
  saveActiveBuffs() {
    try {
      const effects = this.getActiveBuffEffects();
      BdApi.Data.save("SkillTree", "activeBuffs", effects);
    } catch (error) {
      console.error("SkillTree: Error saving active buffs", error);
    }
  }
  /**
   * Calculate total bonuses from all unlocked and upgraded skills
   * @returns {Object} - Object with xpBonus, critBonus, longMsgBonus, questBonus, allStatBonus
   */
  calculateSkillBonuses() {
    const now = Date.now();
    if (this._cache.skillBonuses && this._cache.skillBonusesTime && now - this._cache.skillBonusesTime < this._cache.skillBonusesTTL) {
      return this._cache.skillBonuses;
    }
    const bonuses = {
      xpBonus: 0,
      critBonus: 0,
      longMsgBonus: 0,
      questBonus: 0,
      allStatBonus: 0
    };
    Object.values(this.skillTree).forEach((tier) => {
      if (!tier.skills) return;
      tier.skills.forEach((skill) => {
        const effect = this.getSkillEffect(skill, tier);
        if (effect) {
          if (effect.xpBonus) bonuses.xpBonus += effect.xpBonus;
          if (effect.critBonus) bonuses.critBonus += effect.critBonus;
          if (effect.longMsgBonus) bonuses.longMsgBonus += effect.longMsgBonus;
          if (effect.questBonus) bonuses.questBonus += effect.questBonus;
          if (effect.allStatBonus) bonuses.allStatBonus += effect.allStatBonus;
        }
      });
    });
    this._cache.skillBonuses = bonuses;
    this._cache.skillBonusesTime = now;
    return bonuses;
  }
  // Active-skill methods are mixed in from active-skill-methods.js
  // ============================================================================
  // §8 DATA ACCESS METHODS
  // ============================================================================
  /**
   * Get SoloLevelingStats data
   * @returns {Object|null} - SoloLevelingStats data or null if unavailable
   */
  getSoloLevelingData() {
    var _a, _b, _c, _d, _e;
    const now = Date.now();
    if (this._cache.soloLevelingData && this._cache.soloLevelingDataTime && now - this._cache.soloLevelingDataTime < this._cache.soloLevelingDataTTL) {
      return this._cache.soloLevelingData;
    }
    try {
      const instance = this._getSoloLevelingInstance(now);
      if (!instance) {
        this._cache.soloLevelingData = null;
        this._cache.soloLevelingDataTime = now;
        this._cache.soloPluginInstance = null;
        this._cache.soloPluginInstanceTime = 0;
        return null;
      }
      const result = {
        stats: ((_a = instance.settings) == null ? void 0 : _a.stats) || {},
        level: ((_b = instance.settings) == null ? void 0 : _b.level) || 1,
        totalXP: ((_c = instance.settings) == null ? void 0 : _c.totalXP) || 0,
        userMana: (_d = instance.settings) == null ? void 0 : _d.userMana,
        userMaxMana: (_e = instance.settings) == null ? void 0 : _e.userMaxMana
      };
      this._cache.soloLevelingData = result;
      this._cache.soloLevelingDataTime = now;
      return result;
    } catch (error) {
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = now;
      return null;
    }
  }
  /**
   * Initialize spent SP on startup based on existing skill upgrades
   * This ensures accurate SP calculations if skills were already upgraded
   * Operations:
   * 1. Calculate total spent SP from existing skill levels
   * 2. Save it to settings
   * 3. Recalculate available SP to ensure accuracy
   */
  initializeSpentSP() {
    try {
      const spentSP = this.getTotalSpentSP();
      const soloData = this.getSoloLevelingData();
      if (soloData && soloData.level) {
        const expectedSP = this.calculateSPForLevel(soloData.level);
        const expectedAvailable = expectedSP - spentSP;
        if (this.settings.totalEarnedSP < expectedSP) {
          this.settings.totalEarnedSP = expectedSP;
        }
        if (this.settings.skillPoints !== expectedAvailable) {
          this.settings.skillPoints = expectedAvailable;
          this.saveSettings();
        }
      }
      if (spentSP > 0 && this.settings.totalSpentSP !== spentSP) {
        this.settings.totalSpentSP = spentSP;
        this.saveSettings();
      }
    } catch (error) {
      console.error("SkillTree: Error initializing spent SP", error);
    }
  }
  /**
   * Calculate total SP spent on skills
   * Updates the in-memory totalSpentSP in settings
   * @returns {number} - Total SP spent
   */
  getTotalSpentSP() {
    let totalSpent = 0;
    Object.values(this.skillTree).forEach((tier) => {
      if (!tier.skills) return;
      tier.skills.forEach((skill) => {
        const skillLevel = this.getSkillLevel(skill.id);
        if (skillLevel > 0) {
          totalSpent += this.getSkillUnlockCost(skill, tier);
          totalSpent += this.getSkillUpgradeCost(skill, tier, skillLevel);
        }
      });
    });
    this.settings.totalSpentSP = totalSpent;
    return totalSpent;
  }
  // Skill-upgrade methods are mixed in from skill-upgrade-methods.js
  /**
   * Unsubscribe from all SoloLevelingStats events
   */
  unsubscribeFromEvents() {
    this.eventUnsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        console.error("SkillTree: Error unsubscribing from events", error);
      }
    });
    this.eventUnsubscribers = [];
  }
  // ... (rest of the UI methods remain the same, but need to be updated to show skill levels and upgrade costs)
  // §11 UI RENDERING (modal, toolbar button, CSS theme)
  injectCSS() {
    injectSkillTreeCss();
  }
  // UI helpers/watchers are mixed in from ui-methods.js
  // ============================================================================
  // §12 DEBUGGING & DEVELOPMENT
  // ============================================================================
  getSettingsPanel() {
    this.detachSkillTreeSettingsPanelHandlers();
    const panel = document.createElement("div");
    panel.style.padding = "20px";
    panel.style.background = "#1e1e2e";
    panel.style.borderRadius = "8px";
    panel.innerHTML = `
      <div>
        <h3 style="color: #8a2be2; margin-bottom: 20px;">Skill Tree Settings</h3>

        <label style="display: flex; align-items: center; margin-bottom: 15px;">
          <input type="checkbox" ${this.settings.debugMode ? "checked" : ""} id="st-debug">
          <span style="margin-left: 10px;">Debug Mode (Show console logs)</span>
        </label>

        <div style="margin-top: 15px; padding: 10px; background: #1a0e2e; border-radius: 0; border-left: 3px solid #8a2be2;">
          <div style="color: #8a2be2; font-weight: bold; margin-bottom: 5px;">Debug Information</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            Enable Debug Mode to see detailed console logs for:
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>Level up detection and SP rewards</li>
              <li>Skill unlock/upgrade operations</li>
              <li>Settings load/save operations</li>
              <li>Button creation and retries</li>
              <li>Event system and watchers</li>
              <li>Error tracking and debugging</li>
            </ul>
          </div>
        </div>
      </div>
    `;
    const onChange = (event) => {
      const target = event.target;
      if ((target == null ? void 0 : target.id) === "st-debug") {
        this.settings.debugMode = target.checked;
        this.saveSettings();
        this.debugLog("SETTINGS", "Debug mode toggled", { enabled: target.checked });
      }
    };
    panel.addEventListener("change", onChange);
    this._settingsPanelRoot = panel;
    this._settingsPanelHandlers = { onChange };
    return panel;
  }
};
Object.assign(
  module.exports.prototype,
  ActiveSkillMethods,
  SkillTreeUpgradeMethods,
  SkillTreeUiMethods
);
