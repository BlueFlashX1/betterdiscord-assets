module.exports = {
  getOrCreateLevelUpOverlay() {
    const existing = document.getElementById('sls-levelup-overlay');
    if (existing) return existing;
  
    // Ensure required CSS exists (the overlay styles live in chat UI CSS).
    try {
      this.injectChatUICSS?.();
    } catch (_) {
      // Ignore CSS injection failures; overlay will still exist but may be unstyled.
    }
  
    const overlay = document.createElement('div');
    overlay.id = 'sls-levelup-overlay';
    overlay.className = 'sls-levelup-overlay';
    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  },

  clearLevelUpAnimationTimeouts() {
    if (!this._levelUpAnimationTimeouts) return;
    this._levelUpAnimationTimeouts.forEach((id) => clearTimeout(id));
    this._levelUpAnimationTimeouts.clear();
  },

  enqueueLevelUpAnimation(oldLevel, newLevel) {
    if (!this._isRunning) return;
    if (document.hidden) return;
    if (typeof oldLevel !== 'number' || typeof newLevel !== 'number') return;
    if (newLevel <= oldLevel) return;
  
    this._levelUpAnimationQueue || (this._levelUpAnimationQueue = []);
  
    const levelsGained = newLevel - oldLevel;
    const maxSequential = 5;
  
    const entries =
      levelsGained > maxSequential
        ? [{ title: `LEVEL UP x${levelsGained}`, subtitle: `Level ${newLevel}` }]
        : Array.from({ length: levelsGained }, (_, i) => ({
            title: 'LEVEL UP',
            subtitle: `Level ${oldLevel + 1 + i}`,
          }));
  
    entries.forEach((entry) => this._levelUpAnimationQueue.push(entry));
    this.drainLevelUpAnimationQueue();
  },

  drainLevelUpAnimationQueue() {
    if (!this._isRunning) return;
    if (this._levelUpAnimationInFlight) return;
    const next = this._levelUpAnimationQueue?.shift?.();
    if (!next) return;
  
    this._levelUpAnimationInFlight = true;
    this.renderLevelUpBanner(next);
  
    // Match CSS animation duration (1200ms) plus a small gap.
    const doneId = setTimeout(() => {
      this._levelUpAnimationInFlight = false;
      this.drainLevelUpAnimationQueue();
    }, 1350);
    this._levelUpAnimationTimeouts?.add?.(doneId);
  },

  renderLevelUpBanner({ title, subtitle }) {
    try {
      const overlay = this.getOrCreateLevelUpOverlay();
      if (!overlay) return;
  
      // Clear previous banner(s) to avoid stacking.
      overlay.textContent = '';
  
      const banner = document.createElement('div');
      banner.className = 'sls-levelup-banner';
  
      const titleEl = document.createElement('div');
      titleEl.className = 'sls-levelup-title';
      titleEl.textContent = title || 'LEVEL UP';
  
      const subtitleEl = document.createElement('div');
      subtitleEl.className = 'sls-levelup-subtitle';
      subtitleEl.textContent = subtitle || '';
  
      banner.appendChild(titleEl);
      subtitleEl.textContent && banner.appendChild(subtitleEl);
      overlay.appendChild(banner);
  
      // Cleanup banner after animation; keep overlay for reuse.
      const cleanupId = setTimeout(() => {
        banner.remove();
      }, 1600);
      this._levelUpAnimationTimeouts?.add?.(cleanupId);
    } catch (error) {
      this.debugError?.('LEVEL_UP_ANIMATION', error);
    }
  },

  getStatBuffBreakdown(statKey, titleBonus, shadowBuffs) {
    const { titlePercent, shadowPercent } = this.getBuffPercents(statKey, titleBonus, shadowBuffs);
    const hasTitleBuff = titlePercent > 0;
    const hasShadowBuff = shadowPercent > 0;
    return {
      titlePercent,
      shadowPercent,
      hasTitleBuff,
      hasShadowBuff,
      titleDisplay: hasTitleBuff ? (titlePercent * 100).toFixed(0) : null,
      shadowDisplay: hasShadowBuff ? (shadowPercent * 100).toFixed(0) : null,
    };
  },

  buildStatTooltip(statKey, baseValue, totalValue, titleBonus, shadowBuffs) {
    const stat = this.STAT_METADATA[statKey];
    if (!stat) return '';
  
    const breakdown = this.getStatBuffBreakdown(statKey, titleBonus, shadowBuffs);
    const tooltipParts = [`${stat.fullName}: Base ${baseValue}`];
    if (breakdown.hasTitleBuff && breakdown.titleDisplay !== null) {
      tooltipParts.push(`+${breakdown.titleDisplay}% title`);
    }
    if (breakdown.hasShadowBuff && breakdown.shadowDisplay !== null) {
      tooltipParts.push(`+${breakdown.shadowDisplay}% shadow`);
    }
    tooltipParts.push(`Total: ${totalValue}`);
    tooltipParts.push(`${stat.desc} per point`);
    return tooltipParts.join(' | ');
  },

  getStatValueWithBuffsHTML(totalValue, statKey, titleBonus, shadowBuffs) {
    // Show only the final computed total — buff breakdown is in the tooltip on hover
    return totalValue.toString();
  },

  formatUnallocatedStatPointsText() {
    const points = this.settings.unallocatedStatPoints || 0;
    return `${points} unallocated stat point${points === 1 ? '' : 's'}`;
  }
};
