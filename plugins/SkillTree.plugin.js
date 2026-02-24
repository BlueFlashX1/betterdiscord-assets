/**
 * @name SkillTree
 * @author BlueFlashX1
 * @description Solo Leveling lore-appropriate skill tree system with upgradeable passive abilities
 * @version 3.0.0
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 *
 * ============================================================================
 * ATTRIBUTION & LICENSE
 * ============================================================================
 *
 * Window Focus Detection Pattern:
 * This plugin uses a window focus/blur detection pattern inspired by
 * AutoIdleOnAFK plugin by RoguedBear.
 * - Original plugin: https://github.com/RoguedBear/BetterDiscordPlugin-AutoIdleOnAFK
 * - Original author: RoguedBear
 * - Original license: MIT License
 * - Pattern used: window blur/focus event listeners for button persistence
 *
 * This attribution does not imply the entire plugin is derived from AutoIdleOnAFK.
 * The window focus detection is a small, reusable pattern and this plugin
 * remains primarily original work by BlueFlashX1.
 *
 * ============================================================================
 * VERSION HISTORY
 * ============================================================================
 *
 * @changelog v3.0.0 (2026-02-17)
 * - Migrated modal rendering from innerHTML to React (BdApi.React + createRoot)
 * - Component factory: buildSkillTreeComponents() with closure access to plugin
 * - useReducer force-update bridge for imperative plugin logic -> React re-renders
 * - Reset dialog now a React sub-component inside modal
 * - Removed ~320 lines of dead innerHTML + event delegation code
 * - Zero visual regressions (all existing CSS classes preserved)
 *
 * @changelog v2.0.1 (2025-12-03)
 * - Code structure improvements (section headers, better organization)
 * - Console log cleanup (removed verbose debug logs)
 * - Performance optimizations
 */

// ============================================================================
// REACT COMPONENT FACTORY (v3.0.0 — replaces innerHTML modal rendering)
// ============================================================================
function buildSkillTreeComponents(pluginInstance) {
  const React = BdApi.React;
  const ce = React.createElement;

  // ── Helper: format effect text for a skill ──
  function formatEffectText(effect) {
    if (!effect) return '';
    const parts = [];
    if (effect.xpBonus) parts.push(`+${(effect.xpBonus * 100).toFixed(1)}% XP`);
    if (effect.critBonus) parts.push(`+${(effect.critBonus * 100).toFixed(1)}% Crit`);
    if (effect.longMsgBonus) parts.push(`+${(effect.longMsgBonus * 100).toFixed(1)}% Long Msg`);
    if (effect.questBonus) parts.push(`+${(effect.questBonus * 100).toFixed(1)}% Quest`);
    if (effect.allStatBonus) parts.push(`+${(effect.allStatBonus * 100).toFixed(1)}% All Stats`);
    return parts.join(' \u2022 ');
  }

  // ── ManaBar ──
  function ManaBar({ current, max }) {
    const pct = max > 0 ? (current / max) * 100 : 0;
    return ce('div', { className: 'skilltree-mana-bar-container' },
      ce('span', { className: 'skilltree-mana-bar-label' }, 'Mana'),
      ce('div', { className: 'skilltree-mana-bar-track' },
        ce('div', { className: 'skilltree-mana-bar-fill', style: { width: `${pct.toFixed(1)}%` } })
      ),
      ce('span', { className: 'skilltree-mana-bar-text' }, `${Math.floor(current)} / ${max}`)
    );
  }

  // ── ActiveSkillCard ──
  function ActiveSkillCard({ skillId, def, isUnlocked, isRunning, isOnCooldown, cooldownRemaining, state, manaInfo, onActivate }) {
    const cardClasses = ['skilltree-active-skill', isRunning ? 'is-active' : '', !isUnlocked ? 'is-locked' : ''].filter(Boolean).join(' ');
    const durationText = def.durationMs ? `${Math.round(def.durationMs / 60000)}m` : `${def.charges} charge${def.charges > 1 ? 's' : ''}`;
    const cooldownText = `${Math.round(def.cooldownMs / 60000)}m`;

    let statusEl = null;
    if (isRunning) {
      if (def.durationMs && state.expiresAt > 0) {
        const remainMin = Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 60000));
        statusEl = ce('div', { className: 'skilltree-active-skill-status active-text' }, `ACTIVE - ${remainMin}m remaining`);
      } else if (def.charges && state.chargesLeft > 0) {
        statusEl = ce('div', { className: 'skilltree-active-skill-status active-text' }, `ACTIVE - ${state.chargesLeft} charge${state.chargesLeft > 1 ? 's' : ''} left`);
      }
    } else if (isOnCooldown) {
      const cdMin = Math.ceil(cooldownRemaining / 60000);
      statusEl = ce('div', { className: 'skilltree-active-skill-status cooldown-text' }, `Cooldown: ${cdMin}m`);
    }

    let actionEl = null;
    if (!isUnlocked) {
      const reqSkillDef = pluginInstance.findSkillAndTier(def.unlock.passiveSkill);
      const reqName = reqSkillDef?.skill?.name || def.unlock.passiveSkill;
      actionEl = ce('div', { className: 'skilltree-active-skill-unlock-req' }, `Requires ${reqName} Lv${def.unlock.passiveLevel}`);
    } else if (isRunning) {
      actionEl = ce('button', { className: 'skilltree-activate-btn', disabled: true }, 'Active');
    } else {
      const canActivate = !isOnCooldown && manaInfo.current >= def.manaCost;
      actionEl = ce('button', {
        className: 'skilltree-activate-btn',
        disabled: !canActivate,
        onClick: canActivate ? () => onActivate(skillId) : undefined,
      }, isOnCooldown ? 'On Cooldown' : 'Activate');
    }

    return ce('div', { className: cardClasses },
      ce('div', { className: 'skilltree-active-skill-header' },
        ce('span', { className: 'skilltree-active-skill-name' }, def.name),
        ce('span', { className: 'skilltree-active-skill-cost' }, `${def.manaCost} Mana`)
      ),
      ce('div', { className: 'skilltree-active-skill-desc' }, def.desc),
      def.lore ? ce('div', { className: 'skilltree-active-skill-lore' }, def.lore) : null,
      ce('div', { className: 'skilltree-active-skill-info' },
        ce('span', null, `Duration: ${durationText}`),
        ce('span', null, `Cooldown: ${cooldownText}`)
      ),
      statusEl,
      actionEl
    );
  }

  // ── ActiveSkillsSection ──
  function ActiveSkillsSection({ onActivate }) {
    const manaInfo = pluginInstance.getManaInfo();
    return ce('div', { className: 'skilltree-active-section' },
      ce('div', { className: 'skilltree-active-section-header' }, ce('span', null, 'Active Skills')),
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
        });
      })
    );
  }

  // ── SkillCard ──
  function SkillCard({ skill, level, maxLevel, canUpgrade, nextCost, effect, onUpgrade, onMaxUpgrade }) {
    const canMax = level < maxLevel && canUpgrade;
    const classes = `skilltree-skill ${level > 0 ? 'unlocked' : ''} ${level >= maxLevel ? 'max-level' : ''}`;
    const effectStr = formatEffectText(effect);

    return ce('div', { className: classes },
      ce('div', { className: 'skilltree-skill-name' }, skill.name),
      ce('div', { className: 'skilltree-skill-desc' }, skill.desc),
      skill.lore ? ce('div', { className: 'skilltree-skill-lore' }, skill.lore) : null,
      level > 0 ? ce('div', { className: 'skilltree-skill-level' }, `Level ${level}/${maxLevel}`) : null,
      level > 0 && effectStr ? ce('div', { className: 'skilltree-skill-effects' }, `Current Effects: ${effectStr}`) : null,
      level < maxLevel ? ce(React.Fragment, null,
        ce('div', { className: 'skilltree-skill-cost' }, `Cost: ${nextCost || 'N/A'} SP`),
        ce('div', { className: 'skilltree-btn-group' },
          ce('button', { className: 'skilltree-upgrade-btn', disabled: !canUpgrade, onClick: canUpgrade ? () => onUpgrade(skill.id) : undefined }, level === 0 ? 'Unlock' : 'Upgrade'),
          ce('button', { className: 'skilltree-max-btn', disabled: !canMax, onClick: canMax ? () => onMaxUpgrade(skill.id) : undefined }, 'Max')
        )
      ) : ce('div', { className: 'skilltree-skill-max' }, 'MAX LEVEL')
    );
  }

  // ── PassiveSkillList ──
  function PassiveSkillList({ tier, tierKey, onUpgrade, onMaxUpgrade }) {
    if (!tier.skills) return null;
    return ce('div', { className: 'skilltree-tier', id: `st-${tierKey}` },
      ce('div', { className: 'skilltree-tier-header' },
        ce('span', null, tier.name),
        ce('span', { className: 'skilltree-tier-badge' }, `Tier ${tier.tier}`)
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

  // ── TierNavigation ──
  function TierNavigation({ tiers, currentTier, onTierChange }) {
    return ce('div', { className: 'skilltree-tier-nav' },
      tiers.map((tierKey) =>
        ce('button', {
          key: tierKey,
          className: `skilltree-tier-nav-btn ${tierKey === currentTier ? 'active' : ''}`,
          onClick: () => onTierChange(tierKey),
        }, `Tier ${tierKey.replace('tier', '')}`)
      )
    );
  }

  // ── SkillTreeHeader ──
  function SkillTreeHeader({ sp, level, onReset }) {
    return ce('div', { className: 'skilltree-header' },
      ce('h2', null, 'Solo Leveling Skill Tree'),
      ce('div', { className: 'skilltree-header-info' },
        ce('div', { className: 'skilltree-stat' },
          ce('span', null, 'Available SP:'),
          ce('span', { className: 'skilltree-stat-value' }, String(sp))
        ),
        level != null ? ce('div', { className: 'skilltree-stat' },
          ce('span', null, 'Level:'),
          ce('span', { className: 'skilltree-stat-value' }, String(level))
        ) : null,
        ce('button', { className: 'skilltree-reset-btn', onClick: onReset }, 'Reset Skills')
      )
    );
  }

  // ── ResetConfirmDialog ──
  function ResetConfirmDialog({ onConfirm, onCancel, expectedSP, currentLevel }) {
    React.useEffect(() => {
      const handler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
      document.addEventListener('keydown', handler, true);
      return () => document.removeEventListener('keydown', handler, true);
    }, [onCancel]);

    return ce('div', { className: 'st-confirm-dialog-overlay', onClick: (e) => { if (e.target.className === 'st-confirm-dialog-overlay') onCancel(); } },
      ce('div', { className: 'st-confirm-dialog' },
        ce('div', { className: 'st-confirm-header' }, ce('h3', null, 'Reset Skill Tree?')),
        ce('div', { className: 'st-confirm-body' },
          ce('p', null, 'This will reset all skills and refund your skill points.'),
          ce('ul', null,
            ce('li', null, 'Reset all skill levels to 0'),
            ce('li', null, 'Clear all skill bonuses'),
            ce('li', null, 'Refund ', ce('strong', null, String(expectedSP)), ' SP for level ', ce('strong', null, String(currentLevel)))
          ),
          ce('p', { style: { color: 'rgba(236, 72, 153, 0.85)', fontWeight: 600 } }, 'This action cannot be undone.')
        ),
        ce('div', { className: 'st-confirm-actions' },
          ce('button', { className: 'st-confirm-btn st-confirm-cancel', onClick: onCancel }, 'Cancel'),
          ce('button', { className: 'st-confirm-btn st-confirm-yes', onClick: onConfirm }, 'Reset')
        )
      )
    );
  }

  // ── SkillTreeModal (top-level) ──
  function SkillTreeModal({ onClose }) {
    const [currentTierPage, setCurrentTierPage] = React.useState(pluginInstance.settings.currentTierPage || 'tier1');
    const [isResetOpen, setIsResetOpen] = React.useState(false);
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

    // Expose forceUpdate to plugin instance
    React.useEffect(() => {
      pluginInstance._modalForceUpdate = forceUpdate;
      return () => { pluginInstance._modalForceUpdate = null; };
    }, [forceUpdate]);

    // Escape key: close reset dialog first, then modal
    React.useEffect(() => {
      const handler = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          if (isResetOpen) setIsResetOpen(false);
          else onClose();
        }
      };
      document.addEventListener('keydown', handler, true);
      return () => document.removeEventListener('keydown', handler, true);
    }, [isResetOpen, onClose]);

    const soloData = pluginInstance.getSoloLevelingData();
    const allTierKeys = Object.keys(pluginInstance.skillTree);
    const visibleTiers = (pluginInstance.settings.visibleTiers || allTierKeys).filter((k) => allTierKeys.includes(k));
    const activeTier = allTierKeys.includes(currentTierPage) ? currentTierPage : visibleTiers[0] || 'tier1';
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
      if (!result.success && BdApi?.UI?.showToast) BdApi.UI.showToast(result.reason, { type: 'error', timeout: 2500 });
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

    return ce('div', { className: 'skilltree-modal' },
      ce(SkillTreeHeader, { sp: pluginInstance.settings.skillPoints, level: soloData?.level, onReset: handleReset }),
      ce(TierNavigation, { tiers: visibleTiers, currentTier: activeTier, onTierChange: handleTierChange }),
      ce('div', { className: 'skilltree-modal-content' },
        tierData ? ce(PassiveSkillList, { tier: tierData, tierKey: activeTier, onUpgrade: handleUpgrade, onMaxUpgrade: handleMaxUpgrade }) : null,
        ce(ActiveSkillsSection, { onActivate: handleActivate })
      ),
      ce('button', { className: 'skilltree-close-btn', onClick: onClose }, '\u00D7'),
      isResetOpen ? ce(ResetConfirmDialog, { onConfirm: handleResetConfirm, onCancel: handleResetCancel, expectedSP, currentLevel: resetSoloData?.level || 0 }) : null
    );
  }

  return { SkillTreeModal, SkillTreeHeader, TierNavigation, PassiveSkillList, SkillCard, ActiveSkillsSection, ActiveSkillCard, ManaBar, ResetConfirmDialog };
}

let _ReactUtils;
try { _ReactUtils = require('./BetterDiscordReactUtils.js'); } catch (_) { _ReactUtils = null; }

module.exports = class SkillTree {
  // ============================================================================
  // §1 CONSTRUCTOR & INITIALIZATION
  // ============================================================================
  constructor() {
    this.defaultSettings = {
      enabled: true,
      debugMode: false, // Debug mode toggle
      visibleTiers: ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'tier6'], // All 6 tiers visible by default
      currentTierPage: 'tier1', // Current tier page being viewed
      skillPoints: 0, // Skill points separate from stat points
      unlockedSkills: [], // Array of unlocked skill IDs (legacy support)
      skillLevels: {}, // Object mapping skill ID to level (e.g., { 'shadow_extraction': 5 })
      lastLevel: 1, // Track last level to detect level ups
      totalEarnedSP: 0, // Total SP earned from level ups (for reset calculation)
      totalSpentSP: 0, // Total SP spent on skills (for accurate calculations)
      // Active skills state
      currentMana: 100, // Current mana (max derived from SLS intelligence stat)
      maxMana: 100,     // Base max mana (can be boosted by intelligence)
      activeSkillStates: {}, // { skillId: { active: false, expiresAt: 0, cooldownUntil: 0, chargesLeft: 0 } }
      manaRegenRate: 1, // Mana regen per minute (base, scales with intelligence)
      lastManaRegen: 0, // Timestamp of last mana regen tick
    };

    // Track all retry timeouts for proper cleanup
    this._retryTimeouts = new Set();
    this._isStopped = false;

    // Stop-safe timeout helper usage + UI handler references for cleanup
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;

    // React modal refs (v3.0.0)
    this._modalContainer = null;
    this._modalReactRoot = null;
    this._modalForceUpdate = null;
    this._components = null;

    // Toolbar cache (avoid repeated full-document scans)
    this._toolbarCache = {
      element: null,
      time: 0,
      ttl: 1500,
    };

    // Solo Leveling Lore-Appropriate Skill Tree
    // Skills are organized by tiers: Tier 1 (Low), Tier 2 (Mid), Tier 3 (High), Tier 4 (Master)
    // Higher tiers have higher costs but better growth rates
    this.skillTree = {
      // ===== TIER 1: BASIC SKILLS (Level 1-50) =====
      // Low cost, slow growth, accessible early game
      tier1: {
        name: 'Basic Abilities',
        tier: 1,
        maxLevel: 10,
        baseCost: 1, // Base SP cost to unlock
        upgradeCostMultiplier: 1.5, // Each upgrade costs baseCost * (level * multiplier)
        growthRate: 1.0, // Growth multiplier (lower = slower growth)
        skills: [
          {
            id: 'shadow_extraction',
            name: 'Shadow Extraction Mastery',
            desc: 'Mastery over extracting shadows from defeated enemies. Each level increases XP gain.',
            lore: 'The passive ability to extract shadows and turn them into your army.',
            requirement: { level: 5 },
            baseEffect: { xpBonus: 0.02 }, // +2% per level
            perLevelEffect: { xpBonus: 0.02 }, // +2% per level upgrade
          },
          {
            id: 'shadow_preservation',
            name: 'Shadow Preservation',
            desc: 'Preserve and monitor shadows through their senses. Increases long message XP.',
            lore: 'Store your shadow army and perceive the world through their eyes.',
            requirement: { level: 8 },
            baseEffect: { longMsgBonus: 0.03 }, // +3% per level
            perLevelEffect: { longMsgBonus: 0.03 },
          },
          {
            id: 'daggers_dance',
            name: "Dagger's Dance",
            desc: "Jin-Woo's signature dual-dagger combat style. Increases crit chance.",
            lore: 'The dance of blades that cut through even S-Rank hunters.',
            requirement: { level: 10, strength: 5 },
            baseEffect: { critBonus: 0.01 }, // +1% per level
            perLevelEffect: { critBonus: 0.01 },
          },
          {
            id: 'kandiarus_blessing',
            name: "Kandiaru's Blessing",
            desc: "The System Architect's gift. Passively increases XP from all sources.",
            lore: 'A hidden blessing woven into the System itself by its creator.',
            requirement: { level: 15, intelligence: 5 },
            baseEffect: { xpBonus: 0.015 }, // +1.5% per level
            perLevelEffect: { xpBonus: 0.015 },
          },
        ],
      },
      // ===== TIER 2: INTERMEDIATE SKILLS (Level 50-150) =====
      // Medium cost, medium growth, mid-game progression
      tier2: {
        name: 'Intermediate Abilities',
        tier: 2,
        maxLevel: 15,
        baseCost: 3,
        upgradeCostMultiplier: 2.0,
        growthRate: 1.5, // 50% faster growth than Tier 1
        skills: [
          {
            id: 'shadow_exchange',
            name: 'Shadow Exchange Efficiency',
            desc: 'Efficient conversion of shadows into power. Significantly increases XP gain.',
            lore: 'Passively trade shadows for power boosts.',
            requirement: { level: 50, skills: ['shadow_extraction'] },
            baseEffect: { xpBonus: 0.05 }, // +5% per level
            perLevelEffect: { xpBonus: 0.05 },
          },
          {
            id: 'arise',
            name: 'Shadow Command Mastery',
            desc: 'Mastery over commanding your shadow army. Increases all stat bonuses.',
            lore: 'Passive command over shadows that brings them to life.',
            requirement: { level: 60, skills: ['shadow_preservation'] },
            baseEffect: { allStatBonus: 0.02 }, // +2% per level
            perLevelEffect: { allStatBonus: 0.02 },
          },
          {
            id: 'gate_creation',
            name: 'Gate Creation',
            desc: 'Open black-and-purple gates to other worlds. Increases quest rewards.',
            lore: 'Tear open dimensional gates at will, each one a path to greater power.',
            requirement: { level: 75, intelligence: 15 },
            baseEffect: { questBonus: 0.04 }, // +4% per level
            perLevelEffect: { questBonus: 0.04 },
          },
          {
            id: 'dagger_rush',
            name: 'Dagger Rush',
            desc: 'Barrage opponents with daggers from all directions. Increases crit chance significantly.',
            lore: "A relentless storm of blades that leaves no opening for escape.",
            requirement: { level: 80, agility: 15 },
            baseEffect: { critBonus: 0.02 }, // +2% per level
            perLevelEffect: { critBonus: 0.02 },
          },
          {
            id: 'stealth',
            name: 'Shadow Stealth',
            desc: 'Passive ability to move unseen through shadows. Increases XP and crit chance.',
            lore: 'Become one with the shadows.',
            requirement: { level: 90, agility: 20 },
            baseEffect: { xpBonus: 0.03, critBonus: 0.015 }, // +3% XP, +1.5% crit per level
            perLevelEffect: { xpBonus: 0.03, critBonus: 0.015 },
          },
        ],
      },
      // ===== TIER 3: ADVANCED SKILLS (Level 150-500) =====
      // High cost, high growth, late-game power
      tier3: {
        name: 'Advanced Abilities',
        tier: 3,
        maxLevel: 20,
        baseCost: 5,
        upgradeCostMultiplier: 2.5,
        growthRate: 2.0, // 2x faster growth than Tier 1
        skills: [
          {
            id: 'monarchs_domain',
            name: "Monarch's Domain",
            desc: "Exert the Monarch's territory. Massive XP and stat bonuses.",
            lore: 'Within this domain, the Shadow Monarch is absolute.',
            requirement: { level: 150, intelligence: 30, skills: ['gate_creation'] },
            baseEffect: { xpBonus: 0.08, allStatBonus: 0.03 }, // +8% XP, +3% stats per level
            perLevelEffect: { xpBonus: 0.08, allStatBonus: 0.03 },
          },
          {
            id: 'ruler_authority',
            name: "Ruler's Presence",
            desc: 'Passive aura of absolute authority. Increases all bonuses.',
            lore: 'The passive power to rule over all.',
            requirement: { level: 200, skills: ['arise'] },
            baseEffect: { xpBonus: 0.06, allStatBonus: 0.04, critBonus: 0.02 }, // +6% XP, +4% stats, +2% crit per level
            perLevelEffect: { xpBonus: 0.06, allStatBonus: 0.04, critBonus: 0.02 },
          },
          {
            id: 'shadow_army',
            name: 'Shadow Legion Mastery',
            desc: 'Mastery over commanding a legion of shadows. Massive XP and quest bonuses.',
            lore: 'Passively build an army of shadows to fight for you.',
            requirement: { level: 250, skills: ['shadow_exchange', 'arise'] },
            baseEffect: { xpBonus: 0.1, questBonus: 0.06 }, // +10% XP, +6% quest per level
            perLevelEffect: { xpBonus: 0.1, questBonus: 0.06 },
          },
          {
            id: 'monarch_power',
            name: "Monarch's Aura",
            desc: 'Passive aura of monarch-level power. Extreme bonuses.',
            lore: 'The power of a Monarch passively flows through you.',
            requirement: { level: 300, strength: 50, agility: 50 },
            baseEffect: { xpBonus: 0.12, critBonus: 0.03, allStatBonus: 0.05 }, // +12% XP, +3% crit, +5% stats per level
            perLevelEffect: { xpBonus: 0.12, critBonus: 0.03, allStatBonus: 0.05 },
          },
        ],
      },
      // ===== TIER 4: MASTER SKILLS (Level 500-1000) =====
      // Very high cost, very high growth, end-game mastery
      tier4: {
        name: 'Master Abilities',
        tier: 4,
        maxLevel: 25,
        baseCost: 10,
        upgradeCostMultiplier: 3.0,
        growthRate: 3.0, // 3x faster growth than Tier 1
        skills: [
          {
            id: 'shadow_monarch',
            name: "Shadow Monarch's Presence",
            desc: 'Passive presence of the Shadow Monarch. Ultimate power over shadows.',
            lore: 'The ultimate form - passive ruler of all shadows.',
            requirement: { level: 500, skills: ['monarch_power', 'shadow_army'] },
            baseEffect: { xpBonus: 0.15, allStatBonus: 0.08, critBonus: 0.04 }, // +15% XP, +8% stats, +4% crit per level
            perLevelEffect: { xpBonus: 0.15, allStatBonus: 0.08, critBonus: 0.04 },
          },
          {
            id: 'ashborn_legacy',
            name: "Ashborn's Legacy",
            desc: "Passive inheritance of the first Shadow Monarch's power. Transcendent bonuses.",
            lore: 'The legacy of Ashborn passively flows through you.',
            requirement: { level: 750, skills: ['shadow_monarch'] },
            baseEffect: { xpBonus: 0.2, allStatBonus: 0.1, critBonus: 0.05, questBonus: 0.08 }, // +20% XP, +10% stats, +5% crit, +8% quest per level
            perLevelEffect: { xpBonus: 0.2, allStatBonus: 0.1, critBonus: 0.05, questBonus: 0.08 },
          },
        ],
      },
      // ===== TIER 5: TRANSCENDENT SKILLS (Level 1000-1500) =====
      // Extremely high cost, extremely high growth, transcendent power
      tier5: {
        name: 'Transcendent Abilities',
        tier: 5,
        maxLevel: 30,
        baseCost: 15,
        upgradeCostMultiplier: 3.5,
        growthRate: 4.0, // 4x faster growth than Tier 1
        skills: [
          {
            id: 'rulers_domain',
            name: "Ruler's Domain",
            desc: 'The opposing cosmic force. Absolute authority over existence.',
            lore: "Channel the Rulers' power - the cosmic opposite of the Monarchs.",
            requirement: { level: 1000, skills: ['ashborn_legacy'] },
            baseEffect: {
              xpBonus: 0.25,
              allStatBonus: 0.12,
              critBonus: 0.06,
              questBonus: 0.1,
              longMsgBonus: 0.15,
            }, // +25% XP, +12% stats, +6% crit, +10% quest, +15% long msg per level
            perLevelEffect: {
              xpBonus: 0.25,
              allStatBonus: 0.12,
              critBonus: 0.06,
              questBonus: 0.1,
              longMsgBonus: 0.15,
            },
          },
          {
            id: 'shadow_realm',
            name: 'Shadow Realm',
            desc: 'Access the space between worlds. Transcendent XP and stat bonuses.',
            lore: 'The dimension where shadows gather between life and death.',
            requirement: { level: 1200, skills: ['rulers_domain'] },
            baseEffect: { xpBonus: 0.3, allStatBonus: 0.15, critBonus: 0.08 }, // +30% XP, +15% stats, +8% crit per level
            perLevelEffect: { xpBonus: 0.3, allStatBonus: 0.15, critBonus: 0.08 },
          },
          {
            id: 'gate_ruler',
            name: "Gate Ruler",
            desc: 'Command the Gates between dimensions. Massive bonuses.',
            lore: 'Every Gate bends to your will, every dungeon opens at your command.',
            requirement: { level: 1400, skills: ['shadow_realm'] },
            baseEffect: { xpBonus: 0.35, allStatBonus: 0.18, critBonus: 0.1, questBonus: 0.12 }, // +35% XP, +18% stats, +10% crit, +12% quest per level
            perLevelEffect: { xpBonus: 0.35, allStatBonus: 0.18, critBonus: 0.1, questBonus: 0.12 },
          },
        ],
      },
      // ===== TIER 6: ULTIMATE SKILLS (Level 1500-2000) =====
      // Maximum cost, maximum growth, ultimate power
      tier6: {
        name: 'Ultimate Abilities',
        tier: 6,
        maxLevel: 35,
        baseCost: 25,
        upgradeCostMultiplier: 4.0,
        growthRate: 5.0, // 5x faster growth than Tier 1
        skills: [
          {
            id: 'dragons_fear',
            name: "Dragon's Fear",
            desc: 'Overwhelming killing intent that paralyzes all. Ultimate bonuses.',
            lore: "An aura of terror that made even the Monarchs' armies hesitate.",
            requirement: { level: 1500, skills: ['gate_ruler'] },
            baseEffect: {
              xpBonus: 0.4,
              allStatBonus: 0.2,
              critBonus: 0.12,
              questBonus: 0.15,
              longMsgBonus: 0.2,
            }, // +40% XP, +20% stats, +12% crit, +15% quest, +20% long msg per level
            perLevelEffect: {
              xpBonus: 0.4,
              allStatBonus: 0.2,
              critBonus: 0.12,
              questBonus: 0.15,
              longMsgBonus: 0.2,
            },
          },
          {
            id: 'ashborns_will',
            name: "Ashborn's Will",
            desc: "The first Shadow Monarch's undying resolve. Transcendent bonuses.",
            lore: "Ashborn's will persists across millennia, now flowing through you.",
            requirement: { level: 1750, skills: ['dragons_fear'] },
            baseEffect: { xpBonus: 0.45, allStatBonus: 0.25, critBonus: 0.15, questBonus: 0.18 }, // +45% XP, +25% stats, +15% crit, +18% quest per level
            perLevelEffect: {
              xpBonus: 0.45,
              allStatBonus: 0.25,
              critBonus: 0.15,
              questBonus: 0.18,
            },
          },
          {
            id: 'shadow_sovereign',
            name: "Shadow Sovereign",
            desc: "The Sovereign of Shadows - Ashborn's true title. Maximum possible power.",
            lore: 'You have become the Shadow Sovereign, ruler of death and darkness.',
            requirement: { level: 2000, skills: ['ashborns_will'] },
            baseEffect: {
              xpBonus: 0.5,
              allStatBonus: 0.3,
              critBonus: 0.18,
              questBonus: 0.2,
              longMsgBonus: 0.25,
            }, // +50% XP, +30% stats, +18% crit, +20% quest, +25% long msg per level
            perLevelEffect: {
              xpBonus: 0.5,
              allStatBonus: 0.3,
              critBonus: 0.18,
              questBonus: 0.2,
              longMsgBonus: 0.25,
            },
          },
        ],
      },
    };

    // ===== ACTIVE SKILLS (Cooldown-Based Temporary Buffs) =====
    // Active skills cost Mana, have a duration, and a cooldown.
    // They provide powerful temporary multipliers in the awardXP chain.
    // Unlock conditions: specific passive skill at a required level.
    this.activeSkillDefs = {
      sprint: {
        id: 'sprint',
        name: 'Sprint',
        desc: 'Channel Jinwoo\'s supernatural speed. +100% XP for a short burst.',
        lore: 'A burst of speed that leaves afterimages in your wake.',
        manaCost: 30,
        durationMs: 5 * 60 * 1000,  // 5 min
        cooldownMs: 20 * 60 * 1000, // 20 min
        effect: { xpMultiplier: 2.0 },
        unlock: { passiveSkill: 'stealth', passiveLevel: 5 },
      },
      bloodlust: {
        id: 'bloodlust',
        name: 'Bloodlust',
        desc: 'Unleash killing intent. +50% crit chance (uncapped during buff).',
        lore: 'An aura of murderous intent that makes even S-Rank hunters freeze.',
        manaCost: 50,
        durationMs: 8 * 60 * 1000,  // 8 min
        cooldownMs: 30 * 60 * 1000, // 30 min
        effect: { critChanceBonus: 0.50 },
        unlock: { passiveSkill: 'daggers_dance', passiveLevel: 8 },
      },
      mutilate: {
        id: 'mutilate',
        name: 'Mutilate',
        desc: 'Critical strike mastery. Next 10 messages are guaranteed crits.',
        lore: 'A flurry of precise strikes, each one finding its mark.',
        manaCost: 40,
        durationMs: null, // charge-based, not time-based
        charges: 10,
        cooldownMs: 25 * 60 * 1000, // 25 min
        effect: { guaranteedCrit: true },
        unlock: { passiveSkill: 'dagger_rush', passiveLevel: 10 },
      },
      rulers_authority: {
        id: 'rulers_authority',
        name: "Ruler's Authority",
        desc: 'Telekinetic force amplifies all stats. +75% all stat bonuses.',
        lore: 'The power to move objects with will alone, now amplifying your very being.',
        manaCost: 60,
        durationMs: 10 * 60 * 1000, // 10 min
        cooldownMs: 45 * 60 * 1000, // 45 min
        effect: { allStatMultiplier: 1.75 },
        unlock: { passiveSkill: 'ruler_authority', passiveLevel: 10 },
      },
      shadow_exchange_active: {
        id: 'shadow_exchange_active',
        name: 'Shadow Exchange',
        desc: 'Swap places with a shadow soldier. Double quest rewards for next quest.',
        lore: 'Instantly switch positions with any shadow in your army.',
        manaCost: 25,
        durationMs: null, // charge-based
        charges: 1,       // next 1 quest
        cooldownMs: 60 * 60 * 1000, // 60 min
        effect: { questRewardMultiplier: 2.0 },
        unlock: { passiveSkill: 'shadow_exchange', passiveLevel: 10 },
      },
      arise_active: {
        id: 'arise_active',
        name: 'Arise',
        desc: 'Command shadows to rise. +200% Shadow Army buff power.',
        lore: 'ARISE! The command that raises the dead to serve the Shadow Monarch.',
        manaCost: 80,
        durationMs: 15 * 60 * 1000, // 15 min
        cooldownMs: 60 * 60 * 1000, // 60 min
        effect: { shadowBuffMultiplier: 3.0 },
        unlock: { passiveSkill: 'arise', passiveLevel: 12 },
      },
      monarchs_domain_active: {
        id: 'monarchs_domain_active',
        name: "Monarch's Domain",
        desc: 'Expand your domain of power. All bonuses +30% for the duration.',
        lore: 'Within this domain, the Shadow Monarch reigns supreme over all.',
        manaCost: 100,
        durationMs: 20 * 60 * 1000, // 20 min
        cooldownMs: 90 * 60 * 1000, // 90 min
        effect: { globalMultiplier: 1.30 },
        unlock: { passiveSkill: 'monarchs_domain', passiveLevel: 15 },
      },
    };

    // Active skill ordering for UI display
    this.activeSkillOrder = [
      'sprint', 'bloodlust', 'mutilate', 'rulers_authority',
      'shadow_exchange_active', 'arise_active', 'monarchs_domain_active',
    ];

    // CRITICAL FIX: Deep copy to prevent defaultSettings corruption
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.skillTreeModal = null;
    this.skillTreeButton = null;
    this.levelCheckInterval = null; // Deprecated - using events instead
    this.eventUnsubscribers = []; // Store unsubscribe functions for event listeners
    this._urlChangeCleanup = null; // Cleanup function for URL change watcher
    this._windowFocusCleanup = null; // Cleanup function for window focus watcher
    this._retryTimeout1 = null; // Timeout ID for first retry
    this._retryTimeout2 = null; // Timeout ID for second retry
    this._periodicCheckInterval = null; // Periodic button persistence check
    // _composerObserver removed — React patcher handles button persistence
    this._ensureButtonScheduled = false; // Debounce flag for ensure-button checks
    this._manaRegenInterval = null; // Mana regeneration interval
    this._activeSkillTimers = {};   // Expiry timers for active skills { skillId: timeoutId }

    // Performance caches
    this._cache = {
      soloLevelingData: null,
      soloLevelingDataTime: 0,
      soloLevelingDataTTL: 100, // 100ms - data changes frequently
      soloPluginInstance: null, // Cache plugin instance to avoid repeated lookups
      soloPluginInstanceTime: 0,
      soloPluginInstanceTTL: 5000, // 5s - plugin instance doesn't change often
      skillBonuses: null, // Cache calculated skill bonuses
      skillBonusesTime: 0,
      skillBonusesTTL: 500, // 500ms - bonuses change when skills are upgraded
    };
  }

  // ============================================================================
  // §2 LIFECYCLE METHODS (start/stop)
  // ============================================================================
  start() {
    // Reset stopped flag to allow watchers to recreate
    this._isStopped = false;

    this.loadSettings();
    this._loadSLUtils();

    // Init React components factory (v3.0.0)
    this._components = buildSkillTreeComponents(this);

    // Calculate and save spent SP based on existing skill upgrades
    // This ensures accurate SP calculations if skills were already upgraded
    this.initializeSpentSP();

    this.injectCSS();

    // Register toolbar button via SLUtils React patcher (React-only, no DOM fallback).
    if (this._SLUtils?.registerToolbarButton) {
      this._SLUtils.registerToolbarButton({
        id: 'st-skill-tree-button-wrapper',
        priority: 20, // After TitleManager (10)
        renderReact: (React, _channel) => this._renderSkillTreeButtonReact(React),
        cleanup: () => {
          this.skillTreeButton = null;
        },
      });
    } else {
      console.error('[SkillTree] SLUtils not available — toolbar button inactive');
    }
    this.saveSkillBonuses();

    // Watch for channel changes and recreate button
    this.setupChannelWatcher();

    // Watch for window focus/visibility changes (user coming back from another window)
    this.setupWindowFocusWatcher();

    // Watch for level ups from SoloLevelingStats (event-based, will retry if not ready)
    this.setupLevelUpWatcher();

    // Recalculate SP on startup based on current level
    this.recalculateSPFromLevel();

    // Start fallback polling only if event subscription isn't available.
    this.startLevelPolling();

    // Active skills: restore timers for skills that were active before reload
    this.restoreActiveSkillTimers();
    this.saveActiveBuffs();

    // Start mana regeneration
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
    this._SLUtils = null;
    try {
      if (typeof window !== 'undefined' && window.SoloLevelingUtils) {
        this._SLUtils = window.SoloLevelingUtils;
        return;
      }
      const path = require('path');
      const pluginsDir = BdApi.Plugins?.folder || path.join(BdApi.getPath?.() || '', 'plugins');
      const utilsPath = path.join(pluginsDir, 'SoloLevelingUtils.js');
      delete require.cache[require.resolve?.(utilsPath)];
      this._SLUtils = require(utilsPath);
      if (!window.SoloLevelingUtils) window.SoloLevelingUtils = this._SLUtils;
    } catch (_) {
      this._SLUtils = null;
    }
  }

  /**
   * Get React 18 createRoot with webpack fallbacks (same pattern as ShadowExchange)
   */
  _getCreateRoot() {
    if (_ReactUtils?.getCreateRoot) return _ReactUtils.getCreateRoot();
    // Minimal inline fallback
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  }

  /**
   * Render SkillTree button as a React element (for SLUtils Tier 1 React toolbar patcher).
   * Returns a React element that will be injected into ChatButtonsGroup.type children.
   * @param {Object} React - BdApi.React
   * @returns {ReactElement}
   */
  _renderSkillTreeButtonReact(React) {
    if (this._isStopped) return null;

    const pluginInstance = this;
    const sp = this.settings?.skillPoints ?? 0;

    // SVG paths for skill tree layers icon
    const svgPaths = [
      'M12 2L2 7L12 12L22 7L12 2Z',
      'M2 17L12 22L22 17',
      'M2 12L12 17L22 12',
    ];

    return React.createElement(
      'div',
      {
        id: 'st-skill-tree-button-wrapper',
        className: 'st-skill-tree-button-wrapper',
        style: { display: 'flex', alignItems: 'center' },
      },
      React.createElement(
        'button',
        {
          className: 'st-skill-tree-button',
          title: `Skill Tree (${sp} SP)`,
          onClick: () => pluginInstance.showSkillTreeModal(),
          ref: (el) => {
            if (el && el !== pluginInstance.skillTreeButton) {
              pluginInstance.skillTreeButton = el;
            }
          },
        },
        React.createElement(
          'svg',
          {
            width: '20',
            height: '20',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '2',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            style: { display: 'block', margin: 'auto' },
          },
          ...svgPaths.map((d, i) => React.createElement('path', { key: i, d }))
        )
      )
    );
  }

  startLevelPolling() {
    // Only poll when we have no event-based subscriber yet.
    if (this.eventUnsubscribers.length > 0) return;
    if (this.levelCheckInterval) return;
    this.levelCheckInterval = setInterval(() => {
      if (this._isStopped) return;
      this.checkForLevelUp();
      this.recalculateSPFromLevel();
    }, 15000);
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
    // Return early if plugin is stopped to prevent recreating watchers
    if (this._isStopped) {
      return;
    }

    // Subscribe to SoloLevelingStats levelChanged events for real-time updates
    const instance = this._SLUtils?.getPluginInstance?.('SoloLevelingStats');
    if (!instance) {
      // Retry after a delay - SoloLevelingStats might still be loading or disabled
      this._setTrackedTimeout(() => this.setupLevelUpWatcher(), 2000);
      return;
    }
    if (!instance || typeof instance.on !== 'function') {
      // Retry after a delay - Event system might not be ready yet
      this._setTrackedTimeout(() => this.setupLevelUpWatcher(), 2000);
      return;
    }

    // Subscribe to level changed events
    const unsubscribeLevel = instance.on('levelChanged', (data) => {
      // Invalidate cache since level changed
      this._cache.soloLevelingData = null;
      this._cache.soloLevelingDataTime = 0;

      // FUNCTIONAL: Short-circuit for level up (no if-else)
      data.newLevel > (this.settings.lastLevel || 1) &&
        (() => {
          const levelsGained = data.newLevel - (this.settings.lastLevel || 1);
          this.awardSPForLevelUp(levelsGained);
          this.settings.lastLevel = data.newLevel;
          this.saveSettings();
        })();
    });
    this.eventUnsubscribers.push(unsubscribeLevel);
    this.stopLevelPolling();

    // Initial check on startup
    this.checkForLevelUp();
  }

  stop() {
    // Set stopped flag to prevent recreating watchers
    this._isStopped = true;

    // Unregister from shared SLUtils toolbar registry (if registered)
    try {
      this._SLUtils?.unregisterToolbarButton?.('st-skill-tree-button-wrapper');
    } catch (error) {
      console.error('[SkillTree] Failed to unregister toolbar button:', error);
    }

    // Unsubscribe from events
    this.unsubscribeFromEvents();

    // Clear intervals
    this.stopLevelPolling();
    this.stopManaRegen();

    // Clear active skill expiry timers
    Object.values(this._activeSkillTimers).forEach((tid) => clearTimeout(tid));
    this._activeSkillTimers = {};

    // Clear all tracked retry timeouts
    this._retryTimeouts.forEach((timeoutId) => this._clearTrackedTimeout(timeoutId));
    this._retryTimeouts.clear();

    // Clear legacy retry timeouts (for backwards compatibility)
    if (this._retryTimeout1) {
      this._clearTrackedTimeout(this._retryTimeout1);
      this._retryTimeout1 = null;
    }
    if (this._retryTimeout2) {
      this._clearTrackedTimeout(this._retryTimeout2);
      this._retryTimeout2 = null;
    }

    // Cleanup URL change watcher with guaranteed execution
    if (this._urlChangeCleanup) {
      try {
        this._urlChangeCleanup();
      } catch (e) {
        console.error('[SkillTree] Error during URL change watcher cleanup:', e);
      } finally {
        this._urlChangeCleanup = null;
      }
    }

    // Cleanup window focus watcher
    if (this._windowFocusCleanup) {
      try {
        this._windowFocusCleanup();
      } catch (e) {
        console.error('[SkillTree] Error during window focus watcher cleanup:', e);
      } finally {
        this._windowFocusCleanup = null;
      }
    }

    // Remove UI elements
    if (this.skillTreeButton) {
      this.skillTreeButton.remove();
      this.skillTreeButton = null;
    }

    // Clear all caches
    this._cache.soloLevelingData = null;
    this._cache.soloLevelingDataTime = 0;
    this._cache.soloPluginInstance = null;
    this._cache.soloPluginInstanceTime = 0;
    this._cache.skillBonuses = null;
    this._cache.skillBonusesTime = 0;

    // No toolbar observer or composer observer to clean up — React patcher
    // handles button lifecycle via SLUtils.unregisterToolbarButton().

    // React modal cleanup (v3.0.0)
    this.closeSkillTreeModal();

    this.detachSkillTreeSettingsPanelHandlers();

    // Remove CSS using BdApi (with fallback for compatibility)
    if (BdApi.DOM && BdApi.DOM.removeStyle) {
      BdApi.DOM.removeStyle('skilltree-css');
    } else {
      // Fallback: direct DOM removal if BdApi method unavailable
      const styleElement = document.getElementById('skilltree-css');
      if (styleElement) {
        styleElement.remove();
      }
    }
  }

  detachSkillTreeSettingsPanelHandlers() {
    const root = this._settingsPanelRoot;
    const handlers = this._settingsPanelHandlers;
    if (root && handlers) {
      root.removeEventListener('change', handlers.onChange);
      root.removeEventListener('click', handlers.onClick);
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
        // Level up detected!
        const levelsGained = currentLevel - lastLevel;
        this.awardSPForLevelUp(levelsGained);
        this.settings.lastLevel = currentLevel;
        this.saveSettings();
      }
    } catch (error) {
      console.error('SkillTree: Error checking level up', error);
    }
  }

  /**
   * Calculate total SP that should be earned based on level
   * Fixed gain: 1 SP per level (no diminishing returns)
   * @param {number} level - Current level
   * @returns {number} - Total SP earned
   */
  calculateSPForLevel(level) {
    // 1 SP per level (level 1 = 0 SP, level 2 = 1 SP, level 3 = 2 SP, etc.)
    return Math.max(0, level - 1);
  }

  /**
   * Award SP when leveling up (fixed 1 SP per level)
   * @param {number} levelsGained - Number of levels gained
   */
  awardSPForLevelUp(levelsGained) {
    const spEarned = levelsGained; // 1 SP per level
    this.settings.skillPoints += spEarned;
    this.settings.totalEarnedSP += spEarned;
    this.saveSettings();

    // FUNCTIONAL: Show notification (optional chaining, no if-else)
    BdApi?.showToast?.(`Level Up! +${spEarned} Skill Point${spEarned > 1 ? 's' : ''}`, {
      type: 'success',
      timeout: 3000,
    });
  }

  /**
   * Debug logging helper (checks debugMode setting)
   */
  debugLog(...args) {
    if (this.settings?.debugMode) {
      console.log('[SkillTree]', ...args);
    }
  }

  escapeHtml(unsafeString) {
    return String(unsafeString ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /**
   * Recalculate SP based on current level (for reset or initial setup)
   * Always syncs level and ensures SP matches current level
   */
  recalculateSPFromLevel() {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.level) return;

      const currentLevel = soloData.level;
      const expectedSP = this.calculateSPForLevel(currentLevel);
      const lastLevel = this.settings.lastLevel || 1;

      // Always update last level to current level (keep in sync)
      if (currentLevel !== lastLevel) {
        this.settings.lastLevel = currentLevel;

        // If level increased, award SP for the level difference
        if (currentLevel > lastLevel) {
          const levelsGained = currentLevel - lastLevel;
          this.awardSPForLevelUp(levelsGained);
        }
      }

      // Always ensure totalEarnedSP matches expected SP for current level
      if (this.settings.totalEarnedSP < expectedSP) {
        this.settings.totalEarnedSP = expectedSP;
      }

      // SP calculation: totalEarnedSP - spentSP = availableSP
      // Always recalculate spent SP to ensure accuracy
      const spentSP = this.getTotalSpentSP();
      const currentAvailable = this.settings.skillPoints;
      const expectedAvailable = Math.max(0, expectedSP - spentSP); // Prevent negative SP

      // If spentSP exceeds expectedSP, there's a calculation error - reset skills
      if (spentSP > expectedSP) {
        this.debugLog(
          `SP calculation error: spent ${spentSP} but only earned ${expectedSP}. Resetting skills...`
        );
        // CRITICAL FIX: Instead of just capping, reset all skills to fix data corruption
        // This prevents infinite loops and ensures data integrity
        this.settings.skillLevels = {};
        this.settings.unlockedSkills = [];
        this.settings.totalSpentSP = 0;
        this.settings.skillPoints = expectedSP;
        this.settings.totalEarnedSP = expectedSP;
        this.saveSettings();
        this.saveSkillBonuses(); // Clear skill bonuses

        this.debugLog(`Reset all skills due to calculation error. Available SP: ${expectedSP}`);

        // Show toast notification
        BdApi?.showToast?.(
          `Skills reset due to calculation error. You have ${expectedSP} SP for level ${currentLevel}`,
          { type: 'warning', timeout: 5000 }
        );

        return; // Exit early after fixing
      }

      // Ensure available SP matches expected (always accurate)
      if (currentAvailable !== expectedAvailable) {
        this.settings.skillPoints = expectedAvailable;
        this.saveSettings();
      } else if (currentLevel !== lastLevel) {
        // Save if level changed
        this.saveSettings();
      }
    } catch (error) {
      console.error('SkillTree: Error recalculating SP', error);
    }
  }

  /**
   * Reset all skills and recalculate SP based on current level
   * Useful when skills were unlocked ahead of level
   */
  resetSkills() {
    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.level) {
        BdApi?.showToast?.('Cannot reset: SoloLevelingStats not available', {
          type: 'error',
          timeout: 3000,
        });
        return false;
      }

      // Calculate correct SP for current level
      const currentLevel = soloData.level;
      const expectedSP = this.calculateSPForLevel(currentLevel);

      // Reset all skills
      this.settings.skillLevels = {};
      this.settings.unlockedSkills = [];
      this.settings.totalSpentSP = 0; // Reset spent SP
      this.settings.skillPoints = expectedSP;
      this.settings.totalEarnedSP = expectedSP;
      this.settings.lastLevel = currentLevel;

      this.saveSettings();
      this.saveSkillBonuses();

      BdApi?.showToast?.(`Skills Reset! You have ${expectedSP} SP for level ${currentLevel}`, {
        type: 'success',
        timeout: 4000,
      });

      // Refresh modal if open (React v3.0.0: uses forceUpdate)
      if (this._modalForceUpdate) {
        this._modalForceUpdate();
      }

      return true;
    } catch (error) {
      console.error('SkillTree: Error resetting skills', error);
      return false;
    }
  }

  // ============================================================================
  // §5 SETTINGS MANAGEMENT
  // ============================================================================
  loadSettings() {
    try {
      const saved = BdApi.Data.load('SkillTree', 'settings');
      // FUNCTIONAL: Short-circuit merge and migration (no if-else)
      saved &&
        ((this.settings = { ...this.defaultSettings, ...saved }),
        this.settings.unlockedSkills?.length > 0 &&
          ((this.settings.skillLevels = this.settings.skillLevels || {}),
          this.settings.unlockedSkills.forEach(
            (skillId) =>
              (this.settings.skillLevels[skillId] = this.settings.skillLevels[skillId] || 1)
          ),
          (this.settings.unlockedSkills = []),
          this.saveSettings()));

      // v2.5 skill ID rename migration (lore-accurate names)
      const renameMap = {
        shadow_storage: 'shadow_preservation',
        basic_combat: 'daggers_dance',
        dagger_throw: 'dagger_rush',
        instant_dungeon: 'gate_creation',
        mana_sense: 'kandiarus_blessing',
        domain_expansion: 'monarchs_domain',
        absolute_ruler: 'rulers_domain',
        void_mastery: 'shadow_realm',
        dimension_ruler: 'gate_ruler',
        omnipotent_presence: 'dragons_fear',
        eternal_shadow: 'ashborns_will',
        true_monarch: 'shadow_sovereign',
      };
      if (this.settings.skillLevels) {
        let migrated = false;
        for (const [oldId, newId] of Object.entries(renameMap)) {
          if (this.settings.skillLevels[oldId] !== undefined) {
            this.settings.skillLevels[newId] = this.settings.skillLevels[oldId];
            delete this.settings.skillLevels[oldId];
            migrated = true;
          }
        }
        if (migrated) this.saveSettings();
      }
    } catch (error) {
      console.error('SkillTree: Error loading settings', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('SkillTree', 'settings', this.settings);
      this.saveSkillBonuses(); // Update bonuses in shared storage
    } catch (error) {
      console.error('SkillTree: Error saving settings', error);
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
      BdApi.Data.save('SkillTree', 'bonuses', bonuses);
    } catch (error) {
      console.error('SkillTree: Error saving bonuses', error);
    }
  }

  /**
   * Save active skill buff effects to shared storage for SoloLevelingStats to read
   * SLS reads this via BdApi.Data.load('SkillTree', 'activeBuffs')
   */
  saveActiveBuffs() {
    try {
      const effects = this.getActiveBuffEffects();
      BdApi.Data.save('SkillTree', 'activeBuffs', effects);
    } catch (error) {
      console.error('SkillTree: Error saving active buffs', error);
    }
  }

  /**
   * Calculate total bonuses from all unlocked and upgraded skills
   * @returns {Object} - Object with xpBonus, critBonus, longMsgBonus, questBonus, allStatBonus
   */
  calculateSkillBonuses() {
    // Check cache first
    const now = Date.now();
    if (
      this._cache.skillBonuses &&
      this._cache.skillBonusesTime &&
      now - this._cache.skillBonusesTime < this._cache.skillBonusesTTL
    ) {
      return this._cache.skillBonuses;
    }

    const bonuses = {
      xpBonus: 0,
      critBonus: 0,
      longMsgBonus: 0,
      questBonus: 0,
      allStatBonus: 0,
    };

    // Calculate bonuses from all skills at their current levels
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

    // Cache the result
    this._cache.skillBonuses = bonuses;
    this._cache.skillBonusesTime = now;

    return bonuses;
  }

  // ============================================================================
  // §7 ACTIVE SKILLS SYSTEM (7 cooldown-based buffs)
  // ============================================================================

  /**
   * Check if an active skill is unlocked (passive prerequisite met)
   * @param {string} activeSkillId - Active skill ID
   * @returns {boolean}
   */
  isActiveSkillUnlocked(activeSkillId) {
    const def = this.activeSkillDefs[activeSkillId];
    if (!def || !def.unlock) return false;
    const passiveLevel = this.getSkillLevel(def.unlock.passiveSkill);
    return passiveLevel >= def.unlock.passiveLevel;
  }

  /**
   * Get current mana (with intelligence-based max calculation)
   * @returns {{ current: number, max: number }}
   */
  getManaInfo() {
    const soloData = this.getSoloLevelingData();
    const intelligence = soloData?.stats?.intelligence || 0;
    // Max mana: base 100 + 2 per intelligence point
    const maxMana = 100 + intelligence * 2;
    // Ensure current doesn't exceed max
    const current = Math.min(this.settings.currentMana || 0, maxMana);
    return { current, max: maxMana };
  }

  /**
   * Regenerate mana over time (called on interval)
   * Base: 1 mana/min, +0.1 per intelligence point
   */
  tickManaRegen() {
    const now = Date.now();
    const lastRegen = this.settings.lastManaRegen || now;
    const elapsedMinutes = (now - lastRegen) / 60000;
    if (elapsedMinutes < 0.5) return; // Min 30s between regen ticks

    const soloData = this.getSoloLevelingData();
    const intelligence = soloData?.stats?.intelligence || 0;
    const regenPerMinute = 1 + intelligence * 0.1;
    const regenAmount = regenPerMinute * elapsedMinutes;

    const manaInfo = this.getManaInfo();
    this.settings.currentMana = Math.min(
      (this.settings.currentMana || 0) + regenAmount,
      manaInfo.max
    );
    this.settings.lastManaRegen = now;
    // Don't save on every tick - let periodic save handle it
  }

  /**
   * Start mana regeneration interval
   */
  startManaRegen() {
    if (this._manaRegenInterval) return;
    // Initialize lastManaRegen if not set
    if (!this.settings.lastManaRegen) {
      this.settings.lastManaRegen = Date.now();
    }
    // Catch-up regen for time spent offline
    this.tickManaRegen();

    this._manaRegenInterval = setInterval(() => {
      if (this._isStopped) return;
      this.tickManaRegen();
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop mana regeneration interval
   */
  stopManaRegen() {
    if (this._manaRegenInterval) {
      clearInterval(this._manaRegenInterval);
      this._manaRegenInterval = null;
    }
  }

  /**
   * Get the state of an active skill
   * @param {string} skillId
   * @returns {{ active: boolean, expiresAt: number, cooldownUntil: number, chargesLeft: number }}
   */
  getActiveSkillState(skillId) {
    const states = this.settings.activeSkillStates || {};
    return states[skillId] || { active: false, expiresAt: 0, cooldownUntil: 0, chargesLeft: 0 };
  }

  /**
   * Check if an active skill is currently active (buff running)
   * @param {string} skillId
   * @returns {boolean}
   */
  isActiveSkillRunning(skillId) {
    const state = this.getActiveSkillState(skillId);
    if (!state.active) return false;
    const def = this.activeSkillDefs[skillId];
    // Charge-based skills stay active until charges run out
    if (def && def.charges && state.chargesLeft > 0) return true;
    // Time-based skills check expiry
    if (state.expiresAt > Date.now()) return true;
    // Expired — deactivate
    this._deactivateSkill(skillId);
    return false;
  }

  /**
   * Check if a skill is on cooldown
   * @param {string} skillId
   * @returns {boolean}
   */
  isActiveSkillOnCooldown(skillId) {
    const state = this.getActiveSkillState(skillId);
    return state.cooldownUntil > Date.now();
  }

  /**
   * Get remaining cooldown in ms
   * @param {string} skillId
   * @returns {number}
   */
  getActiveSkillCooldownRemaining(skillId) {
    const state = this.getActiveSkillState(skillId);
    const remaining = state.cooldownUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Activate an active skill
   * @param {string} skillId
   * @returns {{ success: boolean, reason?: string }}
   */
  activateSkill(skillId) {
    const def = this.activeSkillDefs[skillId];
    if (!def) return { success: false, reason: 'Unknown skill' };

    // Check unlock
    if (!this.isActiveSkillUnlocked(skillId)) {
      return { success: false, reason: 'Skill not unlocked' };
    }

    // Check already active
    if (this.isActiveSkillRunning(skillId)) {
      return { success: false, reason: 'Already active' };
    }

    // Check cooldown
    if (this.isActiveSkillOnCooldown(skillId)) {
      const remainMs = this.getActiveSkillCooldownRemaining(skillId);
      const remainMin = Math.ceil(remainMs / 60000);
      return { success: false, reason: `On cooldown (${remainMin}m)` };
    }

    // Check mana
    const manaInfo = this.getManaInfo();
    if (manaInfo.current < def.manaCost) {
      return { success: false, reason: `Not enough Mana (${Math.floor(manaInfo.current)}/${def.manaCost})` };
    }

    // Deduct mana
    this.settings.currentMana = manaInfo.current - def.manaCost;

    // Set state
    const now = Date.now();
    if (!this.settings.activeSkillStates) this.settings.activeSkillStates = {};
    this.settings.activeSkillStates[skillId] = {
      active: true,
      expiresAt: def.durationMs ? now + def.durationMs : 0,
      cooldownUntil: now + def.cooldownMs,
      chargesLeft: def.charges || 0,
    };

    // Set expiry timer for time-based skills
    if (def.durationMs) {
      this._setActiveSkillTimer(skillId, def.durationMs);
    }

    this.saveSettings();
    this.saveActiveBuffs();

    // Notification
    const durationText = def.durationMs
      ? `${Math.round(def.durationMs / 60000)}m`
      : `${def.charges} charge${def.charges > 1 ? 's' : ''}`;
    if (BdApi?.UI?.showToast) {
      BdApi.UI.showToast(`${def.name} activated! (${durationText})`, { type: 'success', timeout: 3000 });
    }

    // Fire DOM event for other plugins
    document.dispatchEvent(new CustomEvent('SkillTree:activeSkillActivated', {
      detail: { skillId, effect: def.effect, expiresAt: this.settings.activeSkillStates[skillId].expiresAt },
    }));

    return { success: true };
  }

  /**
   * Set a timeout to deactivate a time-based skill when it expires
   * @param {string} skillId
   * @param {number} delayMs
   */
  _setActiveSkillTimer(skillId, delayMs) {
    // Clear any existing timer
    if (this._activeSkillTimers[skillId]) {
      clearTimeout(this._activeSkillTimers[skillId]);
    }
    this._activeSkillTimers[skillId] = setTimeout(() => {
      delete this._activeSkillTimers[skillId];
      if (this._isStopped) return;
      this._deactivateSkill(skillId);
    }, delayMs);
  }

  /**
   * Deactivate an active skill (buff expired or charges depleted)
   * @param {string} skillId
   */
  _deactivateSkill(skillId) {
    const state = this.getActiveSkillState(skillId);
    if (!state.active) return;

    // Keep cooldownUntil, clear active state
    this.settings.activeSkillStates[skillId] = {
      ...state,
      active: false,
      expiresAt: 0,
      chargesLeft: 0,
    };

    this.saveSettings();
    this.saveActiveBuffs();

    const def = this.activeSkillDefs[skillId];
    if (BdApi?.UI?.showToast && def) {
      BdApi.UI.showToast(`${def.name} expired.`, { type: 'info', timeout: 2000 });
    }

    document.dispatchEvent(new CustomEvent('SkillTree:activeSkillExpired', {
      detail: { skillId },
    }));
  }

  /**
   * Consume a charge from a charge-based active skill
   * Called by SLS when a message is sent and a charge-based buff is active
   * @param {string} skillId
   * @returns {boolean} - True if charge was consumed (and buff effect should apply)
   */
  consumeActiveSkillCharge(skillId) {
    const state = this.getActiveSkillState(skillId);
    if (!state.active || state.chargesLeft <= 0) return false;

    state.chargesLeft -= 1;
    this.settings.activeSkillStates[skillId] = state;

    if (state.chargesLeft <= 0) {
      this._deactivateSkill(skillId);
    } else {
      this.saveSettings();
      this.saveActiveBuffs();
    }

    return true;
  }

  /**
   * Restore active skill timers on plugin start (for skills that were active before reload)
   */
  restoreActiveSkillTimers() {
    const states = this.settings.activeSkillStates || {};
    const now = Date.now();

    Object.entries(states).forEach(([skillId, state]) => {
      if (!state.active) return;
      const def = this.activeSkillDefs[skillId];
      if (!def) return;

      // Time-based: check if still valid
      if (def.durationMs && state.expiresAt > 0) {
        const remaining = state.expiresAt - now;
        if (remaining > 0) {
          this._setActiveSkillTimer(skillId, remaining);
        } else {
          // Expired while offline
          this._deactivateSkill(skillId);
        }
      }
      // Charge-based: stays active if charges remain (no timer needed)
    });
  }

  /**
   * Get all currently active buff effects (aggregated)
   * @returns {Object} - Combined effect object from all active skills
   */
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
  }

  // ============================================================================
  // §8 DATA ACCESS METHODS
  // ============================================================================
  /**
   * Get SoloLevelingStats data
   * @returns {Object|null} - SoloLevelingStats data or null if unavailable
   */
  getSoloLevelingData() {
    // Check cache first
    const now = Date.now();
    if (
      this._cache.soloLevelingData &&
      this._cache.soloLevelingDataTime &&
      now - this._cache.soloLevelingDataTime < this._cache.soloLevelingDataTTL
    ) {
      return this._cache.soloLevelingData;
    }

    try {
      // Cache plugin instance to avoid repeated lookups
      let soloPlugin = null;
      let instance = null;

      if (
        this._cache.soloPluginInstance &&
        this._cache.soloPluginInstanceTime &&
        now - this._cache.soloPluginInstanceTime < this._cache.soloPluginInstanceTTL
      ) {
        instance = this._cache.soloPluginInstance;
      } else {
        instance = this._SLUtils?.getPluginInstance?.('SoloLevelingStats');
        if (!instance) {
          this._cache.soloLevelingData = null;
          this._cache.soloLevelingDataTime = now;
          this._cache.soloPluginInstance = null;
          this._cache.soloPluginInstanceTime = 0;
          return null;
        }
        // Cache the instance
        this._cache.soloPluginInstance = instance;
        this._cache.soloPluginInstanceTime = now;
      }

      const result = {
        stats: instance.settings?.stats || {},
        level: instance.settings?.level || 1,
        totalXP: instance.settings?.totalXP || 0,
      };

      // Cache the result
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
      // Calculate spent SP from existing skill levels
      const spentSP = this.getTotalSpentSP();

      // Recalculate available SP based on earned SP and spent SP
      const soloData = this.getSoloLevelingData();
      if (soloData && soloData.level) {
        const expectedSP = this.calculateSPForLevel(soloData.level);
        const expectedAvailable = expectedSP - spentSP;

        // Ensure totalEarnedSP matches expected SP
        if (this.settings.totalEarnedSP < expectedSP) {
          this.settings.totalEarnedSP = expectedSP;
        }

        // Update available SP to match expected (ensures accuracy)
        if (this.settings.skillPoints !== expectedAvailable) {
          this.settings.skillPoints = expectedAvailable;
          this.saveSettings();
        }
      }

      // If we have spent SP but it wasn't saved, save it now
      if (spentSP > 0 && this.settings.totalSpentSP !== spentSP) {
        this.settings.totalSpentSP = spentSP;
        this.saveSettings();
      }
    } catch (error) {
      console.error('SkillTree: Error initializing spent SP', error);
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
          // Calculate SP spent: unlock cost + upgrade costs
          totalSpent += this.getSkillUnlockCost(skill, tier);
          totalSpent += this.getSkillUpgradeCost(skill, tier, skillLevel);
        }
      });
    });

    // Update in-memory value; callers decide when to persist to avoid excess writes.
    this.settings.totalSpentSP = totalSpent;

    return totalSpent;
  }

  _syncUnlockedSkillState(skillId) {
    if (!Array.isArray(this.settings.unlockedSkills)) {
      this.settings.unlockedSkills = [];
    }
    if (!this.settings.unlockedSkills.includes(skillId)) {
      this.settings.unlockedSkills.push(skillId);
    }
  }

  _finalizeSkillUpgrade(skillId) {
    this.settings.totalSpentSP = this.getTotalSpentSP();
    this._syncUnlockedSkillState(skillId);

    // Skill upgrades immediately affect computed bonuses.
    this._cache.skillBonuses = null;
    this._cache.skillBonusesTime = 0;

    this.saveSettings();
    this.updateButtonText();
  }

  // ============================================================================
  // §9 SKILL DATA ACCESS METHODS
  // ============================================================================
  /**
   * Get skill level (0 = not unlocked)
   * @param {string} skillId - Skill ID
   * @returns {number} - Skill level (0 if not unlocked)
   */
  getSkillLevel(skillId) {
    return this.settings.skillLevels[skillId] || 0;
  }

  /**
   * Get skill unlock cost
   * @param {Object} skill - Skill definition
   * @param {Object} tier - Tier definition
   * @returns {number} - Unlock cost in SP
   */
  getSkillUnlockCost(skill, tier) {
    return tier.baseCost || 1;
  }

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

    // Avoid per-call allocations in a hot path (exact semantics retained via per-level ceil)
    let total = 0;
    for (let i = 1; i <= targetLevel - 1; i++) {
      total += Math.ceil(baseCost * i * multiplier);
    }
    return total;
  }

  /**
   * Get cost to upgrade skill to next level
   * @param {Object} skill - Skill definition
   * @param {Object} tier - Tier definition
   * @returns {number|null} - Cost in SP, or null if max level
   */
  getNextUpgradeCost(skill, tier) {
    const currentLevel = this.getSkillLevel(skill.id);
    if (currentLevel === 0) {
      // Unlock cost
      return tier.baseCost || 1;
    }

    const maxLevel = tier.maxLevel || 10;
    if (currentLevel >= maxLevel) {
      return null; // Already max level
    }

    const baseCost = tier.baseCost || 1;
    const multiplier = tier.upgradeCostMultiplier || 1.5;
    return Math.ceil(baseCost * currentLevel * multiplier);
  }

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
    const growthRate = tier.growthRate || 1.0;

    // Calculate effect: baseEffect applies once, then perLevelEffect scales with level and growth rate
    // For level 1: baseEffect only
    // For level 2+: baseEffect + (perLevelEffect * (level - 1) * growthRate)
    Object.keys(skill.baseEffect || {}).forEach((key) => {
      const baseValue = skill.baseEffect[key] || 0;
      const perLevelValue =
        skill.perLevelEffect && skill.perLevelEffect[key] ? skill.perLevelEffect[key] : 0;
      // Level 1 gets base effect, each additional level adds perLevelEffect scaled by growth rate
      effect[key] = baseValue + perLevelValue * (level - 1) * growthRate;
    });

    return effect;
  }

  // ============================================================================
  // §10 SKILL UPGRADE METHODS
  // ============================================================================
  /**
   * Find skill and tier by skill ID
   * @param {string} skillId - Skill ID to find
   * @returns {Object|null} - Object with skill and tier, or null if not found
   */
  findSkillAndTier(skillId) {
    try {
      // FUNCTIONAL: Find skill using Object.values().find() (no for-in loop)
      const result = Object.values(this.skillTree)
        .filter((tierData) => tierData?.skills)
        .map((tierData) => ({
          skill: tierData.skills.find((s) => s.id === skillId),
          tier: tierData,
        }))
        .find(({ skill }) => skill);

      return result || null;
    } catch (error) {
      console.error('SkillTree: Error finding skill', error);
      return null;
    }
  }

  /**
   * Unsubscribe from all SoloLevelingStats events
   */
  unsubscribeFromEvents() {
    this.eventUnsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        console.error('SkillTree: Error unsubscribing from events', error);
      }
    });
    this.eventUnsubscribers = [];
  }

  _meetsMinimumRequirement(requiredValue, currentValue) {
    return !requiredValue || currentValue >= requiredValue;
  }

  _meetsStatRequirements(requirement, stats) {
    const perception = stats.perception || 0;
    const statRules = [
      ['strength', stats.strength || 0],
      ['agility', stats.agility || 0],
      ['intelligence', stats.intelligence || 0],
      ['vitality', stats.vitality || 0],
      ['perception', perception],
    ];

    return statRules.every(([key, value]) => this._meetsMinimumRequirement(requirement[key], value));
  }

  _hasRequiredSkills(requirementSkills) {
    if (!Array.isArray(requirementSkills)) return true;
    return requirementSkills.every((prereqId) => this.getSkillLevel(prereqId) > 0);
  }

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

      // Early returns for invalid states
      if (currentLevel >= maxLevel) return false;

      const cost = this.getNextUpgradeCost(skill, tier);
      if (!cost || this.settings.skillPoints < cost) return false;

      // Check level requirement
      const requirement = skill.requirement || {};
      if (!this._meetsMinimumRequirement(requirement.level, soloData.level)) {
        return false;
      }

      // Check stat requirements
      const stats = soloData.stats || {};
      if (!this._meetsStatRequirements(requirement, stats)) return false;

      // Check prerequisite skills
      if (!this._hasRequiredSkills(requirement.skills)) return false;

      return true;
    } catch (error) {
      console.error('SkillTree: Error checking if skill can be unlocked', error);
      return false;
    }
  }

  /**
   * Unlock or upgrade a skill
   * @param {string} skillId - Skill ID to unlock/upgrade
   * @returns {boolean} - True if successful
   */
  unlockOrUpgradeSkill(skillId) {
    try {
      const result = this.findSkillAndTier(skillId);
      if (!result) {
        console.error('SkillTree: Skill not found:', skillId);
        return false;
      }

      const { skill, tier } = result;

      if (!this.canUnlockSkill(skill, tier)) {
        return false;
      }

      const cost = this.getNextUpgradeCost(skill, tier);
      if (!cost) return false;

      // Deduct SP and upgrade skill
      this.settings.skillPoints -= cost;
      const currentLevel = this.getSkillLevel(skillId);
      this.settings.skillLevels[skillId] = (currentLevel || 0) + 1;

      this._finalizeSkillUpgrade(skillId);

      // Show notification
      const newLevel = this.getSkillLevel(skillId);
      if (BdApi?.UI?.showToast) {
        const message =
          currentLevel === 0
            ? `Skill Unlocked: ${skill.name}`
            : `${skill.name} upgraded to Level ${newLevel}!`;

        BdApi.UI.showToast(message, {
          type: 'success',
          timeout: 3000,
        });
      }

      return true;
    } catch (error) {
      console.error('SkillTree: Error unlocking/upgrading skill', error);
      return false;
    }
  }

  /**
   * Max upgrade a skill (use all remaining SP)
   * @param {string} skillId - Skill ID to max upgrade
   * @returns {boolean} - True if successful
   */
  maxUpgradeSkill(skillId) {
    try {
      const result = this.findSkillAndTier(skillId);
      if (!result) {
        console.error('SkillTree: Skill not found:', skillId);
        return false;
      }

      const { skill, tier } = result;
      const currentLevel = this.getSkillLevel(skillId);
      const maxLevel = tier.maxLevel || 10;

      // Early returns
      if (currentLevel >= maxLevel) return false;

      // Check requirements
      if (!this.canUnlockSkill(skill, tier)) {
        return false;
      }

      // Calculate how many levels we can afford
      let levelsUpgraded = 0;
      let totalCost = 0;
      let targetLevel = currentLevel;
      let remainingSP = this.settings.skillPoints;

      while (targetLevel < maxLevel && remainingSP > 0) {
        // Calculate cost for next level
        const nextCost =
          targetLevel === 0
            ? tier.baseCost || 1 // Unlock cost
            : Math.ceil((tier.baseCost || 1) * targetLevel * (tier.upgradeCostMultiplier || 1.5)); // Upgrade cost

        if (!nextCost || remainingSP < nextCost) {
          break; // Can't afford next upgrade
        }

        totalCost += nextCost;
        remainingSP -= nextCost;
        targetLevel++;
        levelsUpgraded++;
      }

      if (levelsUpgraded === 0) {
        return false; // Can't afford any upgrades
      }

      // Apply upgrades
      this.settings.skillPoints -= totalCost;
      this.settings.skillLevels[skillId] = targetLevel;

      this._finalizeSkillUpgrade(skillId);

      // Show notification
      if (BdApi?.UI?.showToast) {
        const message =
          currentLevel === 0
            ? `Skill Unlocked: ${skill.name} (Level ${targetLevel})`
            : `${skill.name} upgraded ${levelsUpgraded} level(s) to Level ${targetLevel}!`;

        BdApi.UI.showToast(message, {
          type: 'success',
          timeout: 3000,
        });
      }

      return true;
    } catch (error) {
      console.error('SkillTree: Error max upgrading skill', error);
      return false;
    }
  }

  // ... (rest of the UI methods remain the same, but need to be updated to show skill levels and upgrade costs)
  // §11 UI RENDERING (modal, toolbar button, CSS theme)

  injectCSS() {
    const css = `
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
        scrollbar-width: thin;
        scrollbar-color: rgba(138, 43, 226, 0.5) #0a0a0f;
      }

      .skilltree-tier-nav::-webkit-scrollbar {
        height: 6px;
      }

      .skilltree-tier-nav::-webkit-scrollbar-track {
        background: #0a0a0f;
      }

      .skilltree-tier-nav::-webkit-scrollbar-thumb {
        background: rgba(138, 43, 226, 0.5);
        border-radius: 2px;
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
    `;

    // Remove existing style if it exists
    const existingStyle = document.getElementById('skilltree-css');
    if (existingStyle) {
      existingStyle.remove();
    }

    // Use BdApi.DOM for persistent CSS injection (v1.8.0+)
    const styleId = 'skilltree-css';
    try {
      BdApi.DOM.addStyle(styleId, css);
    } catch (error) {
      // Fallback to manual injection
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  _getComposerRoot() {
    const primaryChat = this._getPrimaryChatContainer();
    const roots = [
      ...(primaryChat?.querySelectorAll?.('[class*="channelTextArea"]') || []),
      ...document.querySelectorAll('[class*="channelTextArea"]'),
    ];

    const uniqueRoots = Array.from(new Set(roots));
    for (const root of uniqueRoots) {
      if (!this._isElementVisible(root)) continue;
      const formRoot = root.closest('form') || root;
      const editor = formRoot.querySelector(
        '[role="textbox"], textarea, [contenteditable="true"], [class*="slateTextArea"]'
      );
      if (!editor) continue;
      return formRoot;
    }

    return null;
  }

  _getPrimaryChatContainer() {
    return (
      document.querySelector('main[class*="chatContent"]') ||
      document.querySelector('section[class*="chatContent"][role="main"]') ||
      document.querySelector('section[class*="chatContent"]:not([role="complementary"])') ||
      document.querySelector('div[class*="chatContent"]:not([role="complementary"])')
    );
  }

  _isElementVisible(element) {
    if (!element || !element.isConnected) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    const rects = element.getClientRects?.();
    return !!(rects && rects.length > 0);
  }

  isValidToolbarContainer(toolbar, composerRoot = null) {
    if (!toolbar?.isConnected) return false;

    const root = composerRoot || this._getComposerRoot();
    if (!root?.isConnected) return false;

    const rootForm = root.closest('form') || root;
    const toolbarForm = toolbar.closest('form');
    const sameForm = !!(toolbarForm && rootForm && toolbarForm === rootForm);
    const sameRegion =
      root.contains(toolbar) ||
      toolbar.contains(root) ||
      sameForm ||
      (!!root.parentElement && root.parentElement.contains(toolbar));
    if (!sameRegion) return false;

    const hasTextbox = !!root.querySelector(
      '[role="textbox"], textarea, [contenteditable="true"], [class*="slateTextArea"]'
    );
    if (!hasTextbox) return false;

    const buttonLike = toolbar.querySelectorAll?.('button, [class*="button"], [aria-label]');
    const buttonCount = buttonLike ? buttonLike.length : 0;
    const hasComposerActionButton = !!toolbar.querySelector(
      '[aria-label*="emoji" i], [aria-label*="gif" i], [aria-label*="sticker" i], [aria-label*="attach" i], [class*="emojiButton"], [class*="attachButton"]'
    );

    return hasComposerActionButton || buttonCount >= 2;
  }

  getToolbarContainer() {
    const now = Date.now();
    const cache = this._toolbarCache || {};
    const cached = cache.element;
    const composerRoot = this._getComposerRoot();
    if (!composerRoot) {
      Object.assign(this._toolbarCache, { element: null, time: now });
      return null;
    }

    const cacheFresh = cached && cache.time && now - cache.time < cache.ttl;
    if (cacheFresh && this.isValidToolbarContainer(cached, composerRoot)) {
      return cached;
    }

    const formRoot = composerRoot.closest('form') || composerRoot;
    const searchScope = formRoot.parentElement || formRoot;

    const selectorCandidates = [
      '[class*="buttons"]',
      '[class*="buttonContainer"]',
      '[class*="actionButtons"]',
      '[class*="inner"]',
    ];

    const candidateSet = new Set();
    selectorCandidates.forEach((selector) => {
      composerRoot.querySelectorAll(selector).forEach((node) => candidateSet.add(node));
      searchScope.querySelectorAll(selector).forEach((node) => candidateSet.add(node));
    });

    const composerActionButtons = searchScope.querySelectorAll(
      '[aria-label*="emoji" i], [aria-label*="gif" i], [aria-label*="sticker" i], [aria-label*="attach" i], [class*="emojiButton"], [class*="attachButton"]'
    );
    composerActionButtons.forEach((btn) => {
      if (!btn) return;
      btn.parentElement && candidateSet.add(btn.parentElement);
      const container = btn.closest(
        '[class*="buttons"], [class*="buttonContainer"], [class*="actionButtons"], [class*="inner"]'
      );
      container && candidateSet.add(container);
    });

    const candidateContainers = Array.from(candidateSet).filter(Boolean);
    const scoredCandidates = candidateContainers
      .filter((container) => this.isValidToolbarContainer(container, composerRoot))
      .map((container) => {
        const hasComposerActionButton = !!container.querySelector(
          '[aria-label*="emoji" i], [aria-label*="gif" i], [aria-label*="sticker" i], [aria-label*="attach" i], [class*="emojiButton"], [class*="attachButton"]'
        );
        const buttonLike = container.querySelectorAll('button, [class*="button"], [aria-label]');
        const buttonCount = buttonLike ? buttonLike.length : 0;
        const score = (hasComposerActionButton ? 100 : 0) + buttonCount;
        return { container, score };
      })
      .sort((a, b) => b.score - a.score);

    const toolbar = scoredCandidates[0]?.container || null;

    Object.assign(this._toolbarCache, { element: toolbar, time: now });
    return this.isValidToolbarContainer(toolbar, composerRoot) ? toolbar : null;
  }

  /**
   * Update button text with current SP count
   */
  updateButtonText() {
    if (this.skillTreeButton) {
      // Update tooltip with current SP count
      this.skillTreeButton.title = `Skill Tree (${this.settings.skillPoints} SP)`;
    }
  }

  /**
   * Show skill tree modal (React v3.0.0)
   * If already open, forces a re-render. Otherwise creates root and renders.
   */
  showSkillTreeModal() {
    this.recalculateSPFromLevel();
    this.checkForLevelUp();

    // If already mounted, just force re-render
    if (this._modalReactRoot && this._modalForceUpdate) {
      this._modalForceUpdate();
      return;
    }

    // Create container
    let container = document.getElementById('st-modal-root');
    if (!container) {
      container = document.createElement('div');
      container.id = 'st-modal-root';
      container.style.display = 'contents';
      document.body.appendChild(container);
    }
    this._modalContainer = container;

    const React = BdApi.React;
    const { SkillTreeModal } = this._components;
    const onClose = () => this.closeSkillTreeModal();
    const element = React.createElement(SkillTreeModal, { onClose });

    // React 18: createRoot
    const createRoot = this._getCreateRoot();
    if (createRoot) {
      const root = createRoot(container);
      this._modalReactRoot = root;
      root.render(element);
      return;
    }

    // React 17 fallback
    const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule((m) => m?.render && m?.unmountComponentAtNode);
    if (ReactDOM?.render) {
      ReactDOM.render(element, container);
      return;
    }

    console.error('[SkillTree] Neither createRoot nor ReactDOM.render available');
    container.remove();
    BdApi.UI?.showToast?.('SkillTree: React rendering unavailable', { type: 'error' });
  }

  /**
   * Close and unmount skill tree modal (React v3.0.0)
   */
  closeSkillTreeModal() {
    if (this._modalReactRoot) {
      try {
        this._modalReactRoot.unmount();
      } catch (error) {
        console.error('[SkillTree] Failed to unmount modal React root:', error);
      }
      this._modalReactRoot = null;
    }

    const container = document.getElementById('st-modal-root');
    if (container) {
      try {
        const ReactDOM = BdApi.ReactDOM || BdApi.Webpack.getModule((m) => m?.unmountComponentAtNode);
        if (ReactDOM?.unmountComponentAtNode) ReactDOM.unmountComponentAtNode(container);
      } catch (error) {
        console.error('[SkillTree] Failed to unmount legacy modal container:', error);
      }
      container.remove();
    }
    this._modalContainer = null;
    this._modalForceUpdate = null;
  }

  /**
   * Setup channel watcher for URL changes (event-based, no polling)
   * Enhanced to persist buttons across guild/channel switches
   */
  setupChannelWatcher() {
    // Use event-based URL change detection (no polling)
    let lastUrl = window.location.href;

    // Watch for URL changes via popstate and pushState/replaceState
    const handleUrlChange = () => {
      // Return early if plugin is stopped
      if (this._isStopped) return;

      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // React patcher handles button persistence on channel switch.
        // Just update tooltip text if button ref exists.
        this._setTrackedTimeout(() => this.updateButtonText(), 300);
      }
    };

    // Listen to browser back/forward navigation
    window.addEventListener('popstate', handleUrlChange);

    // Override pushState and replaceState to detect programmatic navigation.
    // Store the true originals ONCE to avoid infinite recursion on hot reload.
    // On reload, history.pushState may already be our wrapper, so we must not
    // re-capture it as the "original".
    if (!this._originalPushState) this._originalPushState = history.pushState;
    if (!this._originalReplaceState) this._originalReplaceState = history.replaceState;

    const originalPush = this._originalPushState;
    const originalReplace = this._originalReplaceState;

    this._navPushStateWrapper = (...args) => {
      originalPush.apply(history, args);
      handleUrlChange();
    };
    this._navReplaceStateWrapper = (...args) => {
      originalReplace.apply(history, args);
      handleUrlChange();
    };

    history.pushState = this._navPushStateWrapper;
    history.replaceState = this._navReplaceStateWrapper;

    // Store cleanup function with try/finally to guarantee restoration
    this._urlChangeCleanup = () => {
      try {
        // Remove popstate listener
        window.removeEventListener('popstate', handleUrlChange);
        // Restore original history methods
        this._navPushStateWrapper &&
          history.pushState === this._navPushStateWrapper &&
          this._originalPushState &&
          (history.pushState = this._originalPushState);
        this._navReplaceStateWrapper &&
          history.replaceState === this._navReplaceStateWrapper &&
          this._originalReplaceState &&
          (history.replaceState = this._originalReplaceState);
      } catch (e) {
        console.error('[SkillTree] Error during URL watcher cleanup:', e);
      } finally {
        this._navPushStateWrapper = null;
        this._navReplaceStateWrapper = null;
        this._originalPushState = null;
        this._originalReplaceState = null;
      }
    };
  }

  /**
   * Setup window focus/visibility watcher (detects when user returns from another window)
   * Pattern from AutoIdleOnAFK plugin - uses window blur/focus events for reliable detection
   */
  setupWindowFocusWatcher() {
    this._boundHandleBlur = this._handleWindowBlur.bind(this);
    this._boundHandleFocus = this._handleWindowFocus.bind(this);
    this._boundHandleVisibilityChange = () => {
      if (this._isStopped || document.hidden) return;
      // React patcher handles button persistence — just update tooltip
      this._setTrackedTimeout(() => this.updateButtonText(), 300);
    };

    window.addEventListener('blur', this._boundHandleBlur);
    window.addEventListener('focus', this._boundHandleFocus);
    document.addEventListener('visibilitychange', this._boundHandleVisibilityChange);

    // Store cleanup function
    this._windowFocusCleanup = () => {
      window.removeEventListener('blur', this._boundHandleBlur);
      window.removeEventListener('focus', this._boundHandleFocus);
      document.removeEventListener('visibilitychange', this._boundHandleVisibilityChange);
    };
  }

  // NOTE: setupComposerMutationWatcher(), _queueEnsureSkillTreeButton(),
  // _ensureSkillTreeButton(), startPeriodicButtonCheck(), stopPeriodicButtonCheck()
  // all removed in v2.1.0.  React patcher handles button persistence natively.

  /**
   * Handle window blur event (Discord window loses focus)
   * Pattern from AutoIdleOnAFK - fires when user switches to another window/app
   */
  _handleWindowBlur() {
    if (this._isStopped) return;
    // Note: Don't recreate button on blur - wait for focus to return
  }

  /**
   * Handle window focus event (Discord window gains focus)
   * Pattern from AutoIdleOnAFK - fires when user returns to Discord window
   */
  _handleWindowFocus() {
    if (this._isStopped) return;
    // React patcher handles button persistence — no manual re-creation needed
  }

  // ============================================================================
  // §12 DEBUGGING & DEVELOPMENT
  // ============================================================================

  getSettingsPanel() {
    this.detachSkillTreeSettingsPanelHandlers();
    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.style.background = '#1e1e2e';
    panel.style.borderRadius = '8px';
    panel.innerHTML = `
      <div>
        <h3 style="color: #8a2be2; margin-bottom: 20px;">Skill Tree Settings</h3>

        <label style="display: flex; align-items: center; margin-bottom: 15px;">
          <input type="checkbox" ${this.settings.debugMode ? 'checked' : ''} id="st-debug">
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

      if (target?.id === 'st-debug') {
        this.settings.debugMode = target.checked;
        this.saveSettings();
        this.debugLog('SETTINGS', 'Debug mode toggled', { enabled: target.checked });
      }
    };

    panel.addEventListener('change', onChange);
    this._settingsPanelRoot = panel;
    this._settingsPanelHandlers = { onChange };

    return panel;
  }

};
