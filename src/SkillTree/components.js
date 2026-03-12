function buildSkillTreeComponents(pluginInstance) {
  const React = BdApi.React;
  const ce = React.createElement;

  function formatEffectText(effect) {
    if (!effect) return "";
    const parts = [];
    if (effect.xpBonus) parts.push(`+${(effect.xpBonus * 100).toFixed(1)}% XP`);
    if (effect.critBonus) parts.push(`+${(effect.critBonus * 100).toFixed(1)}% Crit`);
    if (effect.critDamageBonus) parts.push(`+${(effect.critDamageBonus * 100).toFixed(1)}% Crit Damage`);
    if (effect.longMsgBonus) parts.push(`+${(effect.longMsgBonus * 100).toFixed(1)}% Long Msg`);
    if (effect.questBonus) parts.push(`+${(effect.questBonus * 100).toFixed(1)}% Quest`);
    if (effect.allStatBonus) parts.push(`+${(effect.allStatBonus * 100).toFixed(1)}% All Stats`);
    if (effect.attackCooldownReduction) {
      parts.push(`-${(effect.attackCooldownReduction * 100).toFixed(1)}% Attack Cooldown`);
    }
    if (effect.daggerThrowDamageBonus) {
      parts.push(`+${(effect.daggerThrowDamageBonus * 100).toFixed(1)}% Dagger Throw Damage`);
    }
    if (effect.hpRegenBonus) parts.push(`+${(effect.hpRegenBonus * 100).toFixed(1)}% HP Regen`);
    if (effect.manaRegenBonus) parts.push(`+${(effect.manaRegenBonus * 100).toFixed(1)}% Mana Regen`);
    if (effect.debuffDurationReduction) {
      parts.push(`-${(effect.debuffDurationReduction * 100).toFixed(1)}% Debuff Duration`);
    }
    if (effect.debuffResistChance) {
      parts.push(`+${(effect.debuffResistChance * 100).toFixed(1)}% Debuff Resist`);
    }
    if (effect.debuffCleanseChance) {
      parts.push(`+${(effect.debuffCleanseChance * 100).toFixed(1)}% Cleanse Chance`);
    }
    if (effect.tenacityDamageReduction && effect.tenacityThreshold) {
      parts.push(
        `-${(effect.tenacityDamageReduction * 100).toFixed(1)}% Incoming Damage below ${(effect.tenacityThreshold * 100).toFixed(0)}% HP`
      );
    }
    if (effect.naturalGrowthMultiplier && effect.naturalGrowthMultiplier > 1) {
      parts.push(`+${((effect.naturalGrowthMultiplier - 1) * 100).toFixed(1)}% Natural Growth`);
    }
    return parts.join(" \u2022 ");
  }

  function ManaBar({ current, max }) {
    const pct = max > 0 ? (current / max) * 100 : 0;
    return ce("div", { className: "skilltree-mana-bar-container" },
      ce("span", { className: "skilltree-mana-bar-label" }, "Mana"),
      ce("div", { className: "skilltree-mana-bar-track" },
        ce("div", { className: "skilltree-mana-bar-fill", style: { width: `${pct.toFixed(1)}%` } })
      ),
      ce("span", { className: "skilltree-mana-bar-text" }, `${Math.floor(current)} / ${max}`)
    );
  }

  function getActiveSkillDurationText(def) {
    if (def.durationMs) return `${Math.round(def.durationMs / 60000)}m`;
    if (def.charges) return `${def.charges} charge${def.charges > 1 ? "s" : ""}`;
    if (def.sustain) return "Sustain";
    return "Passive";
  }

  function buildActiveSkillStatus(ce, options) {
    const {
      def,
      isRunning,
      isOnCooldown,
      cooldownRemaining,
      state,
    } = options;
    if (isRunning) {
      if (def.durationMs && state.expiresAt > 0) {
        const remainMin = Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 60000));
        return ce(
          "div",
          { className: "skilltree-active-skill-status active-text" },
          `ACTIVE - ${remainMin}m remaining`
        );
      }
      if (def.charges && state.chargesLeft > 0) {
        return ce(
          "div",
          { className: "skilltree-active-skill-status active-text" },
          `ACTIVE - ${state.chargesLeft} charge${state.chargesLeft > 1 ? "s" : ""} left`
        );
      }
      if (def.sustain) {
        return ce(
          "div",
          { className: "skilltree-active-skill-status active-text" },
          "ACTIVE - Sustained (regen-safe drain)"
        );
      }
      return null;
    }

    if (!isOnCooldown) return null;
    const cooldownMinutes = Math.ceil(cooldownRemaining / 60000);
    return ce(
      "div",
      { className: "skilltree-active-skill-status cooldown-text" },
      `Cooldown: ${cooldownMinutes}m`
    );
  }

function buildActiveSkillAction(ce, options) {
  const {
    skillId,
    def,
    isUnlocked,
    isRunning,
    isOnCooldown,
    manaInfo,
    onActivate,
    onDeactivate,
  } = options;
  if (!isUnlocked) {
      const reqSkillDef = pluginInstance.findSkillAndTier(def.unlock.passiveSkill);
      const reqName = reqSkillDef?.skill?.name || def.unlock.passiveSkill;
      return ce(
        "div",
        { className: "skilltree-active-skill-unlock-req" },
        `Requires ${reqName} Lv${def.unlock.passiveLevel}`
      );
    }

    if (isRunning) {
      return ce(
        "button",
        {
          className: "skilltree-activate-btn",
          onClick: () => onDeactivate(skillId),
        },
        "Deactivate"
      );
    }

    const canActivate = !isOnCooldown && manaInfo.current >= def.manaCost;
    return ce(
      "button",
      {
        className: "skilltree-activate-btn",
        disabled: !canActivate,
        onClick: canActivate ? () => onActivate(skillId) : undefined,
      },
      isOnCooldown ? "On Cooldown" : "Activate"
    );
  }

  function ActiveSkillCard({ skillId, def, isUnlocked, isRunning, isOnCooldown, cooldownRemaining, state, manaInfo, onActivate, onDeactivate }) {
    const cardClasses = ["skilltree-active-skill", isRunning ? "is-active" : "", !isUnlocked ? "is-locked" : ""].filter(Boolean).join(" ");
    const durationText = getActiveSkillDurationText(def);
    const cooldownText = `${Math.round(def.cooldownMs / 60000)}m`;
    const statusEl = buildActiveSkillStatus(ce, {
      def,
      isRunning,
      isOnCooldown,
      cooldownRemaining,
      state,
    });
    const actionEl = buildActiveSkillAction(ce, {
      skillId,
      def,
      isUnlocked,
      isRunning,
      isOnCooldown,
      manaInfo,
      onActivate,
      onDeactivate,
    });

    return ce("div", { className: cardClasses },
      ce("div", { className: "skilltree-active-skill-header" },
        ce("span", { className: "skilltree-active-skill-name" }, def.name),
        ce("span", { className: "skilltree-active-skill-cost" }, `${def.manaCost} Mana`)
      ),
      ce("div", { className: "skilltree-active-skill-desc" }, def.desc),
      def.lore ? ce("div", { className: "skilltree-active-skill-lore" }, def.lore) : null,
      ce("div", { className: "skilltree-active-skill-info" },
        ce("span", null, `Duration: ${durationText}`),
        ce("span", null, `Cooldown: ${cooldownText}`)
      ),
      statusEl,
      actionEl
    );
  }

  function ActiveSkillsSection({ onActivate, onDeactivate }) {
    const manaInfo = pluginInstance.getManaInfo();
    return ce("div", { className: "skilltree-active-section" },
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
          onActivate,
          onDeactivate,
        });
      })
    );
  }

  function SkillCard({ skill, level, maxLevel, canUpgrade, nextCost, effect, onUpgrade, onMaxUpgrade }) {
    const canMax = level < maxLevel && canUpgrade;
    const classes = `skilltree-skill ${level > 0 ? "unlocked" : ""} ${level >= maxLevel ? "max-level" : ""}`;
    const effectStr = formatEffectText(effect);

    return ce("div", { className: classes },
      ce("div", { className: "skilltree-skill-name" }, skill.name),
      ce("div", { className: "skilltree-skill-desc" }, skill.desc),
      skill.lore ? ce("div", { className: "skilltree-skill-lore" }, skill.lore) : null,
      level > 0 ? ce("div", { className: "skilltree-skill-level" }, `Level ${level}/${maxLevel}`) : null,
      level > 0 && effectStr ? ce("div", { className: "skilltree-skill-effects" }, `Current Effects: ${effectStr}`) : null,
      level < maxLevel ? ce(React.Fragment, null,
        ce("div", { className: "skilltree-skill-cost" }, `Cost: ${nextCost || "N/A"} SP`),
        ce("div", { className: "skilltree-btn-group" },
          ce("button", { className: "skilltree-upgrade-btn", disabled: !canUpgrade, onClick: canUpgrade ? () => onUpgrade(skill.id) : undefined }, level === 0 ? "Unlock" : "Upgrade"),
          ce("button", { className: "skilltree-max-btn", disabled: !canMax, onClick: canMax ? () => onMaxUpgrade(skill.id) : undefined }, "Max")
        )
      ) : ce("div", { className: "skilltree-skill-max" }, "MAX LEVEL")
    );
  }

  function PassiveSkillList({ tier, tierKey, onUpgrade, onMaxUpgrade }) {
    if (!tier.skills) return null;
    return ce("div", { className: "skilltree-tier", id: `st-${tierKey}` },
      ce("div", { className: "skilltree-tier-header" },
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
          onMaxUpgrade,
        });
      })
    );
  }

  function PermanentEffectCard({ item, footerText }) {
    const effectStr = formatEffectText(item.effect);
    return ce("div", { className: "skilltree-skill unlocked max-level" },
      ce("div", { className: "skilltree-skill-name" }, item.name),
      ce("div", { className: "skilltree-skill-desc" }, item.desc),
      item.lore ? ce("div", { className: "skilltree-skill-lore" }, item.lore) : null,
      ce("div", { className: "skilltree-skill-level" }, item.statusText || "Always Active"),
      item.effect?.sourceRank ? ce("div", { className: "skilltree-skill-level" }, `Current Rank: ${item.effect.sourceRank}`) : null,
      effectStr ? ce("div", { className: "skilltree-skill-effects" }, `Current Effects: ${effectStr}`) : null,
      ce("div", { className: "skilltree-skill-max" }, footerText)
    );
  }

  function InnatePassivesSection() {
    const innatePassives = pluginInstance.getInnatePassives?.() || [];
    if (innatePassives.length === 0) return null;

    return ce("div", { className: "skilltree-tier", id: "st-innate-passives" },
      ce("div", { className: "skilltree-tier-header" },
        ce("span", null, "Innate System Passives"),
        ce("span", { className: "skilltree-tier-badge" }, "Always On")
      ),
      innatePassives.map((passive) => ce(PermanentEffectCard, { key: passive.id, item: passive, footerText: "INNATE" }))
    );
  }

  function HiddenBlessingsSection() {
    const hiddenBlessings = pluginInstance.getHiddenBlessings?.() || [];
    if (hiddenBlessings.length === 0) return null;

    return ce("div", { className: "skilltree-tier", id: "st-hidden-blessings" },
      ce("div", { className: "skilltree-tier-header" },
        ce("span", null, "Hidden Blessings"),
        ce("span", { className: "skilltree-tier-badge" }, "Rank-Scaled")
      ),
      hiddenBlessings.map((blessing) => ce(PermanentEffectCard, { key: blessing.id, item: blessing, footerText: "HIDDEN" }))
    );
  }

  function TierNavigation({ tiers, currentTier, onTierChange }) {
    return ce("div", { className: "skilltree-tier-nav" },
      tiers.map((tierKey) =>
        ce("button", {
          key: tierKey,
          className: `skilltree-tier-nav-btn ${tierKey === currentTier ? "active" : ""}`,
          onClick: () => onTierChange(tierKey),
        }, `Tier ${tierKey.replace("tier", "")}`)
      )
    );
  }

  function SkillTreeHeader({ sp, level, onReset }) {
    return ce("div", { className: "skilltree-header" },
      ce("h2", null, "Solo Leveling Skill Tree"),
      ce("div", { className: "skilltree-header-info" },
        ce("div", { className: "skilltree-stat" },
          ce("span", null, "Available SP:"),
          ce("span", { className: "skilltree-stat-value" }, String(sp))
        ),
        level != null ? ce("div", { className: "skilltree-stat" },
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

    return ce("div", { className: "st-confirm-dialog-overlay", onClick: (e) => { if (e.target.className === "st-confirm-dialog-overlay") onCancel(); } },
      ce("div", { className: "st-confirm-dialog" },
        ce("div", { className: "st-confirm-header" }, ce("h3", null, "Reset Skill Tree?")),
        ce("div", { className: "st-confirm-body" },
          ce("p", null, "This will reset all skills and refund your skill points."),
          ce("ul", null,
            ce("li", null, "Reset all skill levels to 0"),
            ce("li", null, "Clear all skill bonuses"),
            ce("li", null, "Refund ", ce("strong", null, String(expectedSP)), " SP for level ", ce("strong", null, String(currentLevel)))
          ),
          ce("p", { style: { color: "rgba(236, 72, 153, 0.85)", fontWeight: 600 } }, "This action cannot be undone.")
        ),
        ce("div", { className: "st-confirm-actions" },
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
      const result = pluginInstance.activateSkill(skillId);
      if (!result.success && BdApi?.UI?.showToast) pluginInstance._toast(result.reason, "error", 2500);
      forceUpdate();
    }, []);

    const handleDeactivate = React.useCallback((skillId) => {
      const result = pluginInstance.deactivateSkill(skillId, "manual");
      if (!result.success && BdApi?.UI?.showToast) pluginInstance._toast(result.reason, "error", 2500);
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
    const expectedSP = resetSoloData?.level ? pluginInstance.calculateSPForLevel(resetSoloData.level) : 0;

    return ce("div", { className: "skilltree-modal" },
      ce(SkillTreeHeader, { sp: pluginInstance.settings.skillPoints, level: soloData?.level, onReset: handleReset }),
      ce(TierNavigation, { tiers: visibleTiers, currentTier: activeTier, onTierChange: handleTierChange }),
      ce("div", { className: "skilltree-modal-content" },
        ce(InnatePassivesSection),
        ce(HiddenBlessingsSection),
        tierData ? ce(PassiveSkillList, { tier: tierData, tierKey: activeTier, onUpgrade: handleUpgrade, onMaxUpgrade: handleMaxUpgrade }) : null,
        ce(ActiveSkillsSection, { onActivate: handleActivate, onDeactivate: handleDeactivate })
      ),
      ce("button", { className: "skilltree-close-btn", onClick: onClose }, "\u00D7"),
      isResetOpen ? ce(ResetConfirmDialog, { onConfirm: handleResetConfirm, onCancel: handleResetCancel, expectedSP, currentLevel: resetSoloData?.level || 0 }) : null
    );
  }

  return { SkillTreeModal, SkillTreeHeader, TierNavigation, PassiveSkillList, SkillCard, ActiveSkillsSection, ActiveSkillCard, ManaBar, ResetConfirmDialog, InnatePassivesSection, HiddenBlessingsSection, PermanentEffectCard };
}

module.exports = { buildSkillTreeComponents };
