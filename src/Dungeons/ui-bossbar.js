const dc = require("../shared/discord-classes");

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  _buildBossBarCombatSkillButtonHtml(skillState, channelKey) {
    if (!skillState?.skillId) return '';
    const titleText = String(skillState.titleText || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const disabledAttr = skillState.disabled ? ' disabled' : '';
    return `
      <button
        class="dungeon-combat-skill-btn ${skillState.stateClass || ''}"
        data-channel-key="${channelKey}"
        data-skill-id="${skillState.skillId}"
        data-dungeon-tip="${titleText}"${disabledAttr}
      >${skillState.buttonText || skillState.skillId.toUpperCase()}</button>
    `;
  },

  _buildBossBarCombatSkillsRow(channelKey) {
    const skillStates = this.getDungeonCombatSkillHudState?.(channelKey) || [];
    if (!skillStates.length) return '';

    const buttonsHtml = skillStates
      .map((skillState) => this._buildBossBarCombatSkillButtonHtml(skillState, channelKey))
      .join('');

    return `
      <div class="boss-bar-combat-row">
        <span class="boss-bar-combat-label">Skills:</span>
        <div class="boss-bar-combat-actions">${buttonsHtml}</div>
      </div>
    `;
  },

  // Status ailment icon/label/color definitions for boss combat effects
  _STATUS_AILMENT_DISPLAY: {
    poison:    { icon: '\u2620',     label: 'Poison',    cls: 'effect-badge-ailment-dot' },    // ☠
    bleed:     { icon: '\u{1FA78}',  label: 'Bleed',     cls: 'effect-badge-ailment-dot' },    // 🩸
    burn:      { icon: '\u{1F525}',  label: 'Burn',      cls: 'effect-badge-ailment-dot' },    // 🔥
    necrotic:  { icon: '\u{1F480}',  label: 'Necrotic',  cls: 'effect-badge-ailment-dot' },    // 💀
    armorBreak:{ icon: '\u{1F6E1}',  label: 'Armor Break',cls: 'effect-badge-ailment-amp' },   // 🛡 (with crack connotation)
    slow:      { icon: '\u{1F422}',  label: 'Slow',      cls: 'effect-badge-ailment-slow' },   // 🐢
    frostbite: { icon: '\u2744',     label: 'Frostbite', cls: 'effect-badge-ailment-slow' },   // ❄
    enrage:    { icon: '\u{1F4A2}',  label: 'Enrage',    cls: 'effect-badge-ailment-enrage' }, // 💢
  },

  _buildActiveEffectsRow(dungeon) {
    const now = Date.now();
    const effects = [];

    // Buffs (green/cyan icons)
    const domain = dungeon.activeBuffs?.domain;
    if (domain && domain.expiresAt > now) {
      const sec = Math.ceil((domain.expiresAt - now) / 1000);
      const pct = Math.round((domain.statMultiplier - 1) * 100);
      effects.push({ icon: '\u{1F451}', label: `Domain +${pct}%`, time: sec, type: 'buff' });
    }
    const sprint = dungeon.activeBuffs?.sprint;
    if (sprint && sprint.expiresAt > now) {
      const sec = Math.ceil((sprint.expiresAt - now) / 1000);
      const pct = Math.round(sprint.cooldownReduction * 100);
      effects.push({ icon: '\u26A1', label: `Sprint -${pct}% CD`, time: sec, type: 'buff' });
    }

    // Skill debuffs (red/orange icons)
    const rulers = dungeon.activeDebuffs?.rulers_force;
    if (rulers && rulers.expiresAt > now) {
      const sec = Math.ceil((rulers.expiresAt - now) / 1000);
      effects.push({ icon: '\u270A', label: 'Stunned', time: sec, type: 'debuff' });
    }
    const fearMobs = dungeon.activeDebuffs?.dragons_fear_mobs;
    if (fearMobs && fearMobs.expiresAt > now) {
      const sec = Math.ceil((fearMobs.expiresAt - now) / 1000);
      effects.push({ icon: '\u{1F409}', label: 'Fear', time: sec, type: 'debuff' });
    }
    const fearBoss = dungeon.activeDebuffs?.dragons_fear_boss;
    if (fearBoss && fearBoss.expiresAt > now) {
      const sec = Math.ceil((fearBoss.expiresAt - now) / 1000);
      effects.push({ icon: '\u{1F409}', label: 'Boss Fear', time: sec, type: 'debuff' });
    }
    const blMobs = dungeon.activeDebuffs?.bloodlust_mobs;
    if (blMobs && blMobs.expiresAt > now) {
      const sec = Math.ceil((blMobs.expiresAt - now) / 1000);
      effects.push({ icon: '\u{1F480}', label: 'Bloodlust', time: sec, type: 'debuff' });
    }
    const blBoss = dungeon.activeDebuffs?.bloodlust_boss;
    if (blBoss && blBoss.expiresAt > now) {
      const sec = Math.ceil((blBoss.expiresAt - now) / 1000);
      effects.push({ icon: '\u{1F480}', label: 'Boss Paralyzed', time: sec, type: 'debuff' });
    }
    const blStats = dungeon.activeDebuffs?.bloodlust_stats;
    if (blStats && blStats.expiresAt > now) {
      const sec = Math.ceil((blStats.expiresAt - now) / 1000);
      const pct = Math.round((blStats.statReduction || 0.5) * 100);
      effects.push({ icon: '\u{1F53B}', label: `-${pct}% Stats`, time: sec, type: 'debuff' });
    }

    // Combat status ailments on BOSS (from _combatStatusByChannel)
    const channelKey = dungeon.channelKey;
    const statusState = this._combatStatusByChannel?.get?.(channelKey);
    if (statusState?.boss && statusState.hasActive) {
      const bossBucket = statusState.boss;
      for (const [effectName, effect] of Object.entries(bossBucket)) {
        if (!effect || typeof effect !== 'object') continue;
        const isActive = effect.expiresAt === Infinity ||
          (Number.isFinite(effect.expiresAt) && effect.expiresAt > now);
        if (!isActive) continue;

        const display = this._STATUS_AILMENT_DISPLAY[effectName];
        if (!display) continue;

        const stacks = Math.max(1, Number(effect.stacks) || 1);
        const sec = effect.expiresAt === Infinity
          ? null // permanent (enrage)
          : Math.ceil((effect.expiresAt - now) / 1000);

        // Build label with stack count
        const stackStr = stacks > 1 ? ` x${stacks}` : '';
        effects.push({
          icon: display.icon,
          label: `${display.label}${stackStr}`,
          time: sec,
          type: 'ailment',
          cls: display.cls,
        });
      }
    }

    // Mob ailment summary counts (aggregated across all mobs)
    if (statusState?.mobs && statusState.mobs.size > 0) {
      // Tally: { effectName: count }
      const mobAilmentCounts = {};
      for (const [, mobBucket] of statusState.mobs) {
        if (!mobBucket || typeof mobBucket !== 'object') continue;
        for (const [effectName, effect] of Object.entries(mobBucket)) {
          if (!effect || typeof effect !== 'object') continue;
          const isActive = effect.expiresAt === Infinity ||
            (Number.isFinite(effect.expiresAt) && effect.expiresAt > now);
          if (!isActive) continue;
          mobAilmentCounts[effectName] = (mobAilmentCounts[effectName] || 0) + 1;
        }
      }
      for (const [effectName, count] of Object.entries(mobAilmentCounts)) {
        const display = this._STATUS_AILMENT_DISPLAY[effectName];
        if (!display || count === 0) continue;
        effects.push({
          icon: display.icon,
          label: `${count} Mobs ${display.label}`,
          time: null,
          type: 'ailment-mob',
          cls: 'effect-badge-ailment-mob',
        });
      }
    }

    // Combat status ailments on USER (debuffs applied by enemies)
    if (statusState?.user && statusState.hasActive) {
      const userBucket = statusState.user;
      for (const [effectName, effect] of Object.entries(userBucket)) {
        if (!effect || typeof effect !== 'object') continue;
        const isActive = effect.expiresAt === Infinity ||
          (Number.isFinite(effect.expiresAt) && effect.expiresAt > now);
        if (!isActive) continue;

        const display = this._STATUS_AILMENT_DISPLAY[effectName];
        if (!display) continue;

        const stacks = Math.max(1, Number(effect.stacks) || 1);
        const sec = effect.expiresAt === Infinity
          ? null
          : Math.ceil((effect.expiresAt - now) / 1000);

        const stackStr = stacks > 1 ? ` x${stacks}` : '';
        effects.push({
          icon: display.icon,
          label: `${display.label}${stackStr} (You)`,
          time: sec,
          type: 'ailment-self',
          cls: 'effect-badge-ailment-self',
        });
      }
    }

    if (!effects.length) return '';

    // Group effects into visual sections for clean alignment
    const groupOrder = ['buff', 'debuff', 'ailment', 'ailment-mob', 'ailment-self'];
    const groups = {};
    for (const e of effects) {
      const groupKey = e.type;
      (groups[groupKey] || (groups[groupKey] = [])).push(e);
    }

    const renderBadge = (e) => {
      let cls;
      if (e.cls) {
        cls = e.cls;
      } else if (e.type === 'buff') {
        cls = 'effect-badge-buff';
      } else {
        cls = 'effect-badge-debuff';
      }

      let displayStr;
      let titleTime;
      if (e.type === 'ailment-mob') {
        displayStr = e.label.replace(/^(\d+)\s+Mobs\s+.*/, '$1');
        titleTime = e.label;
      } else if (e.time === null) {
        displayStr = '\u221E';
        titleTime = 'permanent';
      } else if (e.time >= 60) {
        displayStr = `${Math.floor(e.time / 60)}m${e.time % 60}s`;
        titleTime = displayStr;
      } else {
        displayStr = `${e.time}s`;
        titleTime = displayStr;
      }
      return `<span class="dungeon-effect-badge ${cls}" data-dungeon-tip="${escapeHtml(e.label)} (${titleTime})">${e.icon} ${displayStr}</span>`;
    };

    // Build sections with separators between groups
    const sections = [];
    for (const key of groupOrder) {
      const group = groups[key];
      if (!group || group.length === 0) continue;
      sections.push(group.map(renderBadge).join(''));
    }

    // Join sections with a thin vertical separator
    const separator = '<span class="effect-row-separator"></span>';
    return `<div class="dungeon-active-effects-row">${sections.join(separator)}</div>`;
  },

  _updateActiveEffectsRow(hpBar, dungeon) {
    let row = hpBar.querySelector('.dungeon-active-effects-row');
    const html = this._buildActiveEffectsRow(dungeon);
    if (!html) {
      if (row) row.remove();
      return;
    }
    if (row) {
      row.outerHTML = html;
    } else {
      // Insert after combat skills row (or after stats row)
      const combatRow = hpBar.querySelector('.boss-bar-combat-row');
      const statsRow = hpBar.querySelector('.boss-bar-stats');
      const anchor = combatRow || statsRow;
      if (anchor) {
        anchor.insertAdjacentHTML('afterend', html);
      }
    }
  },

  _updateGateTimerFastPath(hpBar, dungeon) {
    const timerEl = hpBar.querySelector('.boss-gate-timer');
    if (!timerEl) return;

    const bossAlive = Number(dungeon?.boss?.hp || 0) > 0;
    const gateUnlocked = Boolean(
      dungeon.bossGate?.unlockedAt &&
      Number.isFinite(dungeon.bossGate.unlockedAt) &&
      dungeon.bossGate.unlockedAt > 0
    );

    // Gate just unlocked — remove timer (structural rebuild handles the rest)
    if (!bossAlive || gateUnlocked) {
      timerEl.remove();
      return;
    }

    // Update countdown text
    const deployedAt = Number(dungeon.bossGate?.deployedAt || dungeon.deployedAt || 0);
    const minDuration = Number(dungeon.bossGate?.minDurationMs || 180000);
    const elapsed = Math.max(0, Date.now() - deployedAt);
    const remaining = Math.max(0, minDuration - elapsed);
    const kills = Number(dungeon.mobs?.killed || 0);
    const reqKills = Number(dungeon.bossGate?.requiredMobKills || 25);
    const killsLeft = Math.max(0, reqKills - kills);

    const countdownEl = timerEl.querySelector('.boss-gate-countdown');
    if (countdownEl) {
      countdownEl.textContent = remaining > 0
        ? `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`
        : 'READY';
    }
    const killsEl = timerEl.querySelector('.boss-gate-kills');
    if (killsEl) {
      killsEl.textContent = killsLeft > 0 ? `${killsLeft} kills needed` : 'kills done';
    }
  },

  _updateBossBarCombatSkillButtons(hpBar, channelKey) {
    const skillStates = this.getDungeonCombatSkillHudState?.(channelKey) || [];
    if (!skillStates.length) return;

    skillStates.forEach((skillState) => {
      const button = hpBar.querySelector(
        `.dungeon-combat-skill-btn[data-skill-id="${skillState.skillId}"]`
      );
      if (!button) return;

      button.textContent = skillState.buttonText || skillState.skillId.toUpperCase();
      button.setAttribute('data-dungeon-tip', skillState.titleText || '');
      button.className = `dungeon-combat-skill-btn ${skillState.stateClass || ''}`;
      if (skillState.disabled) {
        button.setAttribute('disabled', 'disabled');
      } else {
        button.removeAttribute('disabled');
      }
    });
  },

  _getCurrentChannelKeyFast() {
    if (typeof this.currentChannelKey === 'string' && this.currentChannelKey.includes('_')) {
      return this.currentChannelKey;
    }

    const currentChannelInfo = this.getChannelInfo() || this.getChannelInfoFromLocation();
    if (!currentChannelInfo?.channelId) return null;

    const channelKey = `${currentChannelInfo.guildId}_${currentChannelInfo.channelId}`;
    this.currentChannelKey = channelKey;
    return channelKey;
  },

  updateBossHPBar(channelKey) {
    try {
      // PERFORMANCE: Skip expensive DOM updates when window is hidden
      if (!this.isWindowVisible()) {
        return; // Don't update UI when window is not visible
      }

      // Ensure boss HP bar CSS is present before any render/recreate work.
      this.ensureBossHpBarCssInjected?.();

      // Do not render when user/settings layers are open to prevent overlap
      if (this.isSettingsLayerOpen()) {
        this.removeBossHPBar(channelKey);
        this.showChannelHeaderComments(channelKey);
        return;
      }

      const dungeon = this.activeDungeons.get(channelKey);
      const bossAlive = dungeon && Number(dungeon.boss?.hp || 0) > 0;
      const liveMobs = dungeon?.mobs?.activeMobs?.some((m) => m && m.hp > 0) || false;
      if (!dungeon || dungeon.completed || dungeon.failed || dungeon._completing || (!bossAlive && !liveMobs)) {
        this.removeBossHPBar(channelKey);
        this._bossBarCache?.delete?.(channelKey);
        this.showChannelHeaderComments(channelKey);
        return;
      }

      // Use watcher-tracked key first (fallback to store/location lookup) to avoid repeated store/DOM reads.
      const currentChannelKey = this._getCurrentChannelKeyFast();
      if (!currentChannelKey) {
        // Retry after delay
        this.queueHPBarUpdate(channelKey);
        return;
      }

      const isCurrentChannel = currentChannelKey === channelKey;

      if (!isCurrentChannel) {
        // Not the current channel, remove HP bar if it exists (if already created)
        const existingBar = this.bossHPBars.get(channelKey);
        if (existingBar) {
          this.removeBossHPBar(channelKey);
          this._bossBarCache?.delete?.(channelKey);
          this.showChannelHeaderComments(channelKey);
        }
        return;
      }

      // PERF: Sync HP/Mana from stats plugin only for the VISIBLE dungeon.
      // Moved here from before channel guard — saves 9 wasted calls per tick
      // for background dungeons that don't need fresh stats for rendering.
      this.syncHPAndManaFromStats();

      // Force recreate boss HP bar when returning to dungeon channel
      // This ensures it shows correctly after guild/channel switches and console opens
      const existingBar = this.bossHPBars.get(channelKey);
      if (existingBar) {
        // React re-render guard: use .isConnected (more robust than document.body.contains)
        const barConnected = existingBar.isConnected;
        const container = existingBar.closest('.dungeon-boss-hp-container');
        const containerConnected = container && container.isConnected;

        if (!barConnected || !containerConnected) {
          // Bar or container removed from DOM (likely React re-render) - force recreate
          this.bossHPBars.delete(channelKey);
          this._bossBarCache?.delete?.(channelKey);
          // Also clean up any orphaned containers
          if (container && !containerConnected) {
            try {
              container.remove();
            } catch (e) {
              // Ignore errors
            }
          }
        }
      }

      // Hide comments in channel header to make room
      this.hideChannelHeaderComments(channelKey);

      const hpPercent = bossAlive ? (dungeon.boss.hp / dungeon.boss.maxHp) * 100 : 0;
      let hpBar = this.bossHPBars.get(channelKey);

      if (!hpBar) {
        hpBar = this._createBossHPBarInPreferredContainer(channelKey);

        // If still no HP bar, retry after delay
        if (!hpBar) {
          this.queueHPBarUpdate(channelKey);
          return;
        }
      } else {
        // HP bar exists - verify it's in the correct container and still in DOM
        const container = hpBar.closest('.dungeon-boss-hp-container');
        if (!container || !container.isConnected) {
          // Container missing or removed (likely React re-render) - recreate
          this.bossHPBars.delete(channelKey);
          this._bossBarCache?.delete?.(channelKey);
          hpBar = this._createBossHPBarInPreferredContainer(channelKey);
        }
      }

      // REAL-TIME: Get fresh mob counts (throttled cleanup)
      const now = Date.now();
      let aliveMobs = 0;
      const totalMobs = dungeon.mobs?.targetCount || 0;

      const lastCleanup = this._mobCleanupCache.get(channelKey);
      const shouldCleanup = !lastCleanup || now - lastCleanup.time > 500;
      if (shouldCleanup) {
        // Single-pass filter + count (was two separate .filter() passes)
        if (dungeon.mobs?.activeMobs) {
          const alive = [];
          for (let i = 0; i < dungeon.mobs.activeMobs.length; i++) {
            const m = dungeon.mobs.activeMobs[i];
            if (m && m.hp > 0) alive.push(m);
          }
          dungeon.mobs.activeMobs = alive;
          aliveMobs = alive.length;
        }
        this._mobCleanupCache.set(channelKey, { time: now, alive: aliveMobs });
      } else {
        aliveMobs = lastCleanup.alive || 0;
      }

      // REAL-TIME: Get current boss HP (ensure it's up-to-date)
      const currentBossHP = dungeon.boss?.hp || 0;
      const currentBossMaxHP = dungeon.boss?.maxHp || 0;
      const combatSkillStates = this.getDungeonCombatSkillHudState?.(channelKey) || [];
      const combatSignature = combatSkillStates.map((skillState) => skillState.skillId).join('|');

      // Boss gate status — track whether boss HP section should show
      const gateUnlocked = Boolean(
        dungeon.bossGate?.unlockedAt &&
        Number.isFinite(dungeon.bossGate.unlockedAt) &&
        dungeon.bossGate.unlockedAt > 0
      );

      // Boss bar diffing: structural vs numeric split.
      // Structural fields (buttons, badge, name, type, gateUnlocked) require full innerHTML rebuild.
      // Numeric fields (HP, mobs, gate countdown) update via targeted textContent (no DOM destruction).
      // PERF: ~99% of ticks hit the fast-path since structural fields rarely change during combat.
      const hpFloor = Math.floor(currentBossHP);
      const maxHpFloor = Math.floor(currentBossMaxHP);
      const hpPctRound = Math.floor(hpPercent * 10) / 10;
      const prev = this._bossBarCache.get(channelKey);
      const structuralUnchanged = prev &&
        prev.part === dungeon.userParticipating && prev.dep === dungeon.shadowsDeployed &&
        prev.type === dungeon.type && prev.rank === dungeon.rank && prev.name === dungeon.name &&
        prev.combatSig === combatSignature && prev.gateUnlocked === gateUnlocked;

      if (hpBar && structuralUnchanged) {
        // Fast path: update numeric values via targeted textContent (no innerHTML rebuild)
        const hpCont = hpBar.closest('.dungeon-boss-hp-container');
        if (hpCont) {
          hpCont.style.setProperty('--boss-hp-percent', `${hpPercent}%`);
          hpCont.setAttribute('data-hp-percent', hpPercent);
        }
        const textEl = hpBar.querySelector('.hp-bar-text');
        if (textEl) textEl.textContent = `${Math.floor(hpPercent)}%`;
        // Boss HP + mob count text updates (avoids full innerHTML rebuild for numeric changes)
        const hpCurrentEl = hpBar.querySelector('.boss-hp-current');
        if (hpCurrentEl) hpCurrentEl.textContent = Math.floor(currentBossHP).toLocaleString();
        const hpMaxEl = hpBar.querySelector('.boss-hp-max');
        if (hpMaxEl) hpMaxEl.textContent = currentBossMaxHP.toLocaleString();
        const mobAliveEl = hpBar.querySelector('.mob-alive');
        if (mobAliveEl) mobAliveEl.textContent = aliveMobs.toLocaleString();
        const mobTotalEl = hpBar.querySelector('.mob-total');
        if (mobTotalEl) mobTotalEl.textContent = totalMobs.toLocaleString();
        // Fast-path: update shadow alive/dead counts (changes every combat tick)
        if (dungeon.shadowsDeployed) {
          const allocated = this.shadowAllocations.get(channelKey) || dungeon.shadowAllocation?.shadows || [];
          const deadSet = this.deadShadows?.get(channelKey);
          const deadCount = deadSet?.size || 0;
          const aliveCount = Math.max(0, allocated.length - deadCount);
          const shadowAliveEl = hpBar.querySelector('.shadow-alive');
          if (shadowAliveEl) shadowAliveEl.textContent = aliveCount.toLocaleString();
          const shadowTotalEl = hpBar.querySelector('.shadow-total');
          if (shadowTotalEl) shadowTotalEl.textContent = allocated.length.toLocaleString();
          const shadowDeadEl = hpBar.querySelector('.shadow-dead');
          if (shadowDeadEl) {
            shadowDeadEl.textContent = deadCount > 0 ? `(${deadCount} dead)` : '';
            shadowDeadEl.style.display = deadCount > 0 ? '' : 'none';
          }
        }
        this._updateBossBarCombatSkillButtons(hpBar, channelKey);
        this._updateActiveEffectsRow(hpBar, dungeon);
        // Fast-path: update gate timer countdown (changes every tick)
        this._updateGateTimerFastPath(hpBar, dungeon);
        // Update cache with current numeric values
        this._bossBarCache.set(channelKey, {
          hp: hpFloor, maxHp: maxHpFloor, hpPct: hpPctRound,
          alive: aliveMobs, total: totalMobs,
          part: dungeon.userParticipating, dep: dungeon.shadowsDeployed,
          type: dungeon.type, rank: dungeon.rank, name: dungeon.name,
          combatSig: combatSignature, gateUnlocked,
        });
        this.scheduleBossBarLayout(hpBar.parentElement);
        return;
      }

      this._bossBarCache.set(channelKey, {
        hp: hpFloor, maxHp: maxHpFloor, hpPct: hpPctRound,
        alive: aliveMobs, total: totalMobs,
        part: dungeon.userParticipating, dep: dungeon.shadowsDeployed,
        type: dungeon.type, rank: dungeon.rank, name: dungeon.name,
        combatSig: combatSignature, gateUnlocked,
      });
      // Preserve HP state + CSS var for recovery after React re-render
      const hpContainer = hpBar?.closest('.dungeon-boss-hp-container');
      if (hpContainer) {
        hpContainer.setAttribute('data-hp-percent', hpPercent);
        hpContainer.style.setProperty('--boss-hp-percent', `${hpPercent}%`);
      }

      // Participation indicator — 3 states: WAITING (no deploy), DEPLOYED (shadows fighting), FIGHTING (user joined)
      const participationBadge = !dungeon.shadowsDeployed
        ? '<span class="boss-bar-badge-waiting">WAITING</span>'
        : dungeon.userParticipating
          ? '<span class="boss-bar-badge-fighting">FIGHTING</span>'
          : '<span class="boss-bar-badge-deployed">DEPLOYED</span>';

      // DEPLOY SHADOWS button / DEPLOYED indicator
      const deployButtonHTML = !dungeon.shadowsDeployed
        ? `<button class="dungeon-deploy-btn" data-channel-key="${channelKey}">DEPLOY SHADOWS</button>`
        : `<button class="dungeon-recall-btn" data-channel-key="${channelKey}">RECALL SHADOWS</button>`;

      // JOIN button (show if user hasn't joined yet — can join before or after deploy)
      const joinButtonHTML = !dungeon.userParticipating
        ? `<button class="dungeon-join-btn" data-channel-key="${channelKey}">JOIN</button>`
        : '';

      // LEAVE button (only show if user IS participating)
      const leaveButtonHTML = dungeon.userParticipating
        ? `<button class="dungeon-leave-btn" data-channel-key="${channelKey}">LEAVE</button>`
        : '';
      const combatSkillsRowHTML = this._buildBossBarCombatSkillsRow(channelKey);
      const activeEffectsRowHTML = this._buildActiveEffectsRow(dungeon);

      // Boss gate status — show boss HP only when gate unlocked (gateUnlocked computed above for cache)
      const showBossSection = bossAlive && gateUnlocked;

      // Gate timer countdown (how long until boss becomes targetable)
      let gateTimerHTML = '';
      if (bossAlive && !gateUnlocked && dungeon.shadowsDeployed) {
        const deployedAt = Number(dungeon.bossGate?.deployedAt || dungeon.deployedAt || 0);
        const minDuration = Number(dungeon.bossGate?.minDurationMs || 180000);
        const elapsed = Math.max(0, Date.now() - deployedAt);
        const remaining = Math.max(0, minDuration - elapsed);
        const kills = Number(dungeon.mobs?.killed || 0);
        const reqKills = Number(dungeon.bossGate?.requiredMobKills || 25);
        const killsLeft = Math.max(0, reqKills - kills);

        if (remaining > 0 || killsLeft > 0) {
          const timeStr = remaining > 0
            ? `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`
            : 'READY';
          const killStr = killsLeft > 0 ? `${killsLeft} kills needed` : 'kills done';
          gateTimerHTML = `
            <div class="boss-gate-timer">
              <span class="boss-gate-icon">\u{1F512}</span>
              <span class="boss-gate-label">Boss Sealed</span>
              <span class="boss-gate-countdown">${timeStr}</span>
              <span class="boss-gate-separator">|</span>
              <span class="boss-gate-kills">${killStr}</span>
            </div>`;
        }
      }

      // Stats row — show boss HP only when gate is unlocked
      const bossStatsHTML = showBossSection
        ? `<div>
            <span class="boss-bar-stat-label">Boss:</span>
            <span class="boss-hp-current">${Math.floor(currentBossHP).toLocaleString()}</span>
            <span class="boss-bar-stat-separator">/</span>
            <span class="boss-hp-max">${currentBossMaxHP.toLocaleString()}</span>
          </div>`
        : '';

      // HP bar fill — only visible when boss gate is unlocked
      const hpBarHTML = showBossSection
        ? `<div class="hp-bar-container">
            <div class="hp-bar-fill"></div>
            <div class="hp-bar-text">${Math.floor(hpPercent)}%</div>
          </div>`
        : '';

      // Shadow deployment info row — shows count + rank breakdown when deployed
      let shadowInfoHTML = '';
      if (dungeon.shadowsDeployed) {
        const allocated = this.shadowAllocations.get(channelKey) || dungeon.shadowAllocation?.shadows || [];
        const deadSet = this.deadShadows?.get(channelKey);
        const deadCount = deadSet?.size || 0;
        const aliveCount = Math.max(0, allocated.length - deadCount);
        // Build rank breakdown (highest first)
        const rc = {};
        for (const s of allocated) {
          const r = s?.rank || 'E';
          rc[r] = (rc[r] || 0) + 1;
        }
        const rankOrder = ['Shadow Monarch', 'Monarch+', 'Monarch', 'NH', 'SSS+', 'SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E'];
        const parts = rankOrder.filter(r => rc[r] > 0).map(r => `${rc[r]}${r}`);
        const rankStr = parts.length > 0 ? parts.join(' ') : '';
        shadowInfoHTML = `
          <div class="boss-bar-shadow-info">
            <span class="boss-bar-stat-label">Shadows:</span>
            <span class="shadow-alive">${aliveCount.toLocaleString()}</span>
            <span class="boss-bar-stat-separator">/</span>
            <span class="shadow-total">${allocated.length.toLocaleString()}</span>
            ${deadCount > 0 ? `<span class="shadow-dead" style="color:#ef4444;margin-left:4px;">(${deadCount} dead)</span>` : ''}
            ${rankStr ? `<span class="shadow-ranks" style="opacity:0.7;margin-left:6px;font-size:11px;">[${rankStr}]</span>` : ''}
          </div>`;
      }

      // Multi-line layout to show all info without truncation
      hpBar.innerHTML = `
      <div class="boss-bar-layout">
        <div class="boss-bar-header">
          <div class="boss-bar-info">
            <div class="boss-bar-name">
              ${participationBadge} | ${escapeHtml(dungeon.name)} [${escapeHtml(dungeon.rank)}]
            </div>
            ${deployButtonHTML}
            ${joinButtonHTML}
            ${leaveButtonHTML}
          </div>
          <div class="boss-bar-type">
            ${escapeHtml(dungeon.type)}
          </div>
        </div>
        ${gateTimerHTML}
        <div class="boss-bar-stats">
          ${bossStatsHTML}
          <div>
            <span class="boss-bar-stat-label">Mobs:</span>
            <span class="mob-alive">${aliveMobs.toLocaleString()}</span>
            <span class="boss-bar-stat-separator">/</span>
            <span class="mob-total">${totalMobs.toLocaleString()}</span>
          </div>
          ${shadowInfoHTML}
        </div>
        ${combatSkillsRowHTML}
        ${activeEffectsRowHTML}
      </div>
      ${hpBarHTML}
    `;

      // Re-apply layout in case member list visibility changed
      this.scheduleBossBarLayout(hpBar.parentElement);

      // JOIN/LEAVE buttons are handled via delegated click handler (prevents per-rerender listeners).
    } catch (error) {
      this.errorLog('CRITICAL', 'Error updating boss HP bar', { channelKey, error });
    }
  },

  findChannelHeader() {
    // PERFORMANCE: Cache container detection results (2s TTL) to avoid repeated DOM queries
    const cacheKey = 'channelHeader';
    const now = Date.now();
    const cached = this._containerCache.get(cacheKey);
    if (cached && now - cached.timestamp < 2000) {
      // PERF-8: isConnected is faster than document.body.contains (avoids tree walk)
      if (cached.value?.isConnected) {
        return cached.value;
      }
    }

    // Strategy 1: Use aria-label (most stable)
    let header =
      document.querySelector('section[aria-label="Channel header"]') ||
      document.querySelector('section[aria-label*="Channel header"]');

    // Strategy 2: Use resolved class selectors (fast, exact)
    if (!header) {
      header =
        document.querySelector(`${dc.sel.title}${dc.sel.container}`) ||
        document.querySelector(dc.sel.channelHeader);
    }

    // Strategy 3: Wildcard fallbacks (always correct even if Webpack resolved wrong)
    if (!header) {
      header =
        document.querySelector('[class*="title_"][class*="container_"]') ||
        document.querySelector('[class*="channelHeader_"]');
    }

    if (header) {
      this._containerCache.set(cacheKey, { value: header, timestamp: now });
    }

    return header;
  },

  findChannelContainer() {
    // PERFORMANCE: Cache container detection results (2s TTL) to avoid repeated DOM queries
    const cacheKey = 'channelContainer';
    const now = Date.now();
    const cached = this._containerCache.get(cacheKey);
    if (cached && now - cached.timestamp < 2000) {
      // PERF-8: isConnected is faster than document.body.contains (avoids tree walk)
      if (cached.value?.isConnected) {
        return cached.value;
      }
    }

    // Strategy 1: Look for main chat container by aria-label
    let container =
      document.querySelector('main[aria-label*="Chat"]') ||
      document.querySelector('[class*="chat"][class*="container"]') ||
      document.querySelector('[class*="chatContainer"]');

    // Strategy 2: Find by structure - look for message list container
    if (!container) {
      const messageList =
        document.querySelector(dc.sel.messageList) ||
        document.querySelector(dc.sel.messages);
      if (messageList) {
        container = messageList.closest(dc.sel.container) || messageList.parentElement;
      }
    }

    // Strategy 3: Find by channel content area (resolved selectors)
    if (!container) {
      container =
        document.querySelector(`${dc.sel.channel} ${dc.sel.content}`) ||
        document.querySelector(`${dc.sel.chat} ${dc.sel.content}`);
    }

    // Strategy 4: Wildcard fallbacks (safety net if Webpack resolved wrong)
    if (!container) {
      container =
        document.querySelector('[class*="channel_"] [class*="content_"]') ||
        document.querySelector('[class*="chat_"] [class*="content_"]') ||
        document.querySelector('[class*="chatContent_"]');
    }

    if (container) {
      this._containerCache.set(cacheKey, { value: container, timestamp: now });
    }

    return container;
  },

  createBossHPBarInContainer(container, channelKey) {
    if (!container) {
      this.errorLog('Cannot create boss HP bar: container is null', { channelKey });
      return;
    }

    // Verify container is still in DOM before proceeding (isConnected is more robust)
    if (!container.isConnected) {
      this.debugLog('HP_BAR_CREATE', 'Container not in DOM, will retry', { channelKey });
      this.queueHPBarUpdate(channelKey);
      return;
    }

    try {
      // Ensure boss HP bar CSS exists (Discord/BD can swap layers and styles may be removed).
      this.ensureBossHpBarCssInjected?.();

      // PERF: Targeted cleanup — only query containers for this channel (was querying ALL containers)
      document.querySelectorAll(`.dungeon-boss-hp-container[data-channel-key="${channelKey}"]`).forEach((el) => {
        try {
          const hasBar = el.querySelector('.dungeon-boss-hp-bar');
          // Remove if empty or not in DOM (orphaned)
          if (!hasBar || !el.isConnected) {
            el.remove();
          }
        } catch {
          // Ignore errors during cleanup
        }
      });

      // Look for existing container for this specific channel
      let bossHpContainer = container.querySelector(
        '.dungeon-boss-hp-container[data-channel-key="' + channelKey + '"]'
      );

      // If found existing container for different channel, remove it first
      const otherContainers = container.querySelectorAll('.dungeon-boss-hp-container');
      otherContainers.forEach((el) => {
        const elChannelKey = el.getAttribute('data-channel-key');
        if (elChannelKey && elChannelKey !== channelKey) {
          // Remove container for different channel
          try {
            el.remove();
          } catch (e) {
            // Ignore errors
          }
        }
      });

      if (!bossHpContainer) {
        bossHpContainer = document.createElement('div');
        bossHpContainer.className = 'dungeon-boss-hp-container';
        bossHpContainer.setAttribute('data-channel-key', channelKey);
        bossHpContainer.style.zIndex = '99';
        // Set initial HP percent from dungeon data
        const dungeon = this.activeDungeons?.get(channelKey);
        const initHpPercent = dungeon?.boss ? (dungeon.boss.hp / dungeon.boss.maxHp) * 100 : 100;
        bossHpContainer.style.setProperty('--boss-hp-percent', `${initHpPercent}%`);

        // Verify container is still in DOM before inserting
        if (!container.isConnected) {
          this.debugLog('HP_BAR_CREATE', 'Container removed from DOM during creation, will retry', {
            channelKey,
          });
          this.queueHPBarUpdate(channelKey);
          return;
        }

        // Insert at the top of container (before first child) for channel header
        if (container.firstChild) {
          container.insertBefore(bossHpContainer, container.firstChild);
        } else {
          container.appendChild(bossHpContainer);
        }
      } else {
        bossHpContainer.innerHTML = '';
      }

      // Create HP bar element
      const hpBar = document.createElement('div');
      hpBar.className = 'dungeon-boss-hp-bar';
      hpBar.setAttribute('data-dungeon-boss-hp-bar', channelKey);

      // Add HP bar to container
      bossHpContainer.appendChild(hpBar);

      // Adjust layout based on member list visibility/width
      this.scheduleBossBarLayout(bossHpContainer);

      this.bossHPBars.set(channelKey, hpBar);
    } catch (error) {
      this.errorLog('CRITICAL', 'Error creating boss HP bar in container', { channelKey, error });
    }
  },

  hideChannelHeaderComments(channelKey) {
    if (this.hiddenComments.has(channelKey)) return; // Already hidden

    // Find comment-related elements in channel header
    const channelHeader = this.findChannelHeader();
    if (!channelHeader) return;

    // Look for comment buttons/elements using multiple strategies
    const allButtons = channelHeader.querySelectorAll(`button${dc.sel.button}`);
    const commentElements = [];

    allButtons.forEach((button) => {
      const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
      const className = (button.className || '').toLowerCase();
      const textContent = (button.textContent || '').toLowerCase();

      const isCommentButton =
        ariaLabel.includes('comment') ||
        ariaLabel.includes('thread') ||
        ariaLabel.includes('reply') ||
        className.includes('comment') ||
        className.includes('thread') ||
        className.includes('reply') ||
        textContent.includes('comment') ||
        textContent.includes('thread');

      // Also check for buttons with SVG icons that might be comment buttons
      const hasIcon = button.querySelector('svg');
      const isInToolbar = button.closest(dc.sel.toolbar);

      if (isCommentButton || (hasIcon && isInToolbar && ariaLabel)) {
        commentElements.push(button);
      }
    });

    // Comment/thread/reply elements are now hidden via CSS rule on
    // .dungeon-boss-hp-container ~ [class*="toolbar"] selectors.
    // No JS DOM manipulation needed — CSS handles it and survives re-renders.

    // Still track via aria-label-based buttons for showChannelHeaderComments restore
    if (commentElements.length > 0) {
      this.hiddenComments.set(channelKey, commentElements.map((el) => ({
        element: el,
        originalDisplay: el.style.display || '',
        originalVisibility: el.style.visibility || '',
      })));
    }
  },

  showChannelHeaderComments(channelKey) {
    const hidden = this.hiddenComments.get(channelKey);
    if (!hidden) return;

    hidden.forEach(({ element, originalDisplay, originalVisibility }) => {
      if (element && element.parentNode) {
        element.style.display = originalDisplay || '';
        if (originalVisibility) {
          element.style.visibility = originalVisibility;
        }
      }
    });

    this.hiddenComments.delete(channelKey);
  },

  removeBossHPBar(channelKey) {
    const hpBar = this.bossHPBars.get(channelKey);
    if (hpBar?.parentNode) {
      const container = hpBar.parentNode;
      hpBar.parentNode.removeChild(hpBar);

      // If container is now empty, remove it too
      if (
        container.classList.contains('dungeon-boss-hp-container') &&
        container.children.length === 0
      ) {
        container.parentNode?.removeChild(container);
      }
    }
    this.bossHPBars.delete(channelKey);
    // Clear cached payload so next render fully rebuilds the bar (prevents desync after removal)
    this._bossBarCache?.delete?.(channelKey);
    // Restore comments when boss HP bar is removed
    this.showChannelHeaderComments(channelKey);
  },

  removeAllBossHPBars() {
    this.bossHPBars.forEach((hpBar) => {
      if (hpBar?.parentNode) {
        const container = hpBar.parentNode;
        hpBar.parentNode.removeChild(hpBar);

        // If container is now empty, remove it too
        if (
          container.classList.contains('dungeon-boss-hp-container') &&
          container.children.length === 0
        ) {
          container.parentNode?.removeChild(container);
        }
      }
    });
    this.bossHPBars.clear();
    this._bossBarCache?.clear?.();
    this._ariseButtonRefs?.clear?.();

    // Also remove any orphaned containers
    document.querySelectorAll('.dungeon-boss-hp-container').forEach((container) => {
      if (container.children.length === 0) {
        container.remove();
      }
    });
  },

  isElementVisible(el) {
    if (!el) return false;
    // PERF: Single getBoundingClientRect replaces getComputedStyle + offsetWidth + offsetHeight
    // (was 3 forced layout reads, now 1)
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  },

  isSettingsLayerOpen() {
    const now = Date.now();
    const cached = this._settingsLayerOpenCache;
    if (cached && now - cached.ts < 250) return cached.value;

    const value = Boolean(
      document.querySelector("nav[aria-label*='Settings' i]") ||
        document.querySelector(dc.sel.userSettings) ||
        document.querySelector(dc.sel.settingsContainer)
    );
    this._settingsLayerOpenCache = { value, ts: now };
    return value;
  },

  adjustBossBarLayout(container) {
    if (!container) return;

    // Member list detection: adjust width/margin so bar doesn't sit under member list
    // Cache member list width briefly to avoid repeated reflows
    const memberWrap =
      document.querySelector("aside[aria-label*='Members' i]") ||
      document.querySelector(dc.sel.membersWrap);
    const memberVisible = this.isElementVisible(memberWrap);

    let memberWidth = 0;
    const cacheKey = 'memberWidth';
    const now = Date.now();
    const cached = this._memberWidthCache.get(cacheKey);
    if (cached && now - cached.timestamp < 400) {
      memberWidth = cached.width;
    } else if (memberVisible && memberWrap) {
      memberWidth = memberWrap.getBoundingClientRect().width || memberWrap.offsetWidth || 0;
      this._memberWidthCache.set(cacheKey, { width: memberWidth, timestamp: now });
    }

    if (memberVisible && memberWidth > 0) {
      container.style.maxWidth = `calc(100% - ${memberWidth}px)`;
      container.style.marginRight = `${memberWidth}px`;
      container.style.alignSelf = 'flex-start';
    } else {
      container.style.maxWidth = '100%';
      container.style.marginRight = '0';
      container.style.alignSelf = 'stretch';
    }
  },

  scheduleBossBarLayout(container) {
    if (!container) return;

    // PERFORMANCE: Throttle layout adjustments to 100-150ms to reduce layout thrash
    const containerId = container.getAttribute('data-channel-key') || 'default';
    const now = Date.now();
    const lastLayout = this._bossBarLayoutThrottle.get(containerId) || 0;
    const throttleDelay = 120; // 120ms throttle (between 100-150ms)

    if (now - lastLayout < throttleDelay) {
      // Skip this layout adjustment - too soon
      return;
    }

    if (this._bossBarLayoutFrame) {
      cancelAnimationFrame(this._bossBarLayoutFrame);
    }
    this._bossBarLayoutFrame = requestAnimationFrame(() => {
      this.adjustBossBarLayout(container);
      this._bossBarLayoutThrottle.set(containerId, Date.now());
      this._bossBarLayoutFrame = null;
    });
  }
};
