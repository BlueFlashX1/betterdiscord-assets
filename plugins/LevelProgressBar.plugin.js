/**
 * @name LevelProgressBar
 * @author BlueFlashX1
 * @description Always-visible level progress bar for Solo Leveling Stats
 * @version 1.0.0
 */

module.exports = class LevelProgressBar {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      position: 'top', // top, bottom
      showLevel: true,
      showRank: true,
      showXP: true,
      compact: false, // Compact mode (smaller bar)
      opacity: 1.0, // 100% opacity - fully opaque
      updateInterval: 1000, // Update every second
    };

    this.settings = this.defaultSettings;
    this.progressBar = null;
    this.updateInterval = null;
    this.lastLevel = 0;
    this.lastXP = 0;
    this.debugEnabled = false; // OPTIMIZED: Disable debug logging by default
  }

  start() {
    this.debugLog('START', 'Plugin starting');
    this.loadSettings();
    this.injectCSS();
    this.createProgressBar();
    this.startUpdating();
    this.debugLog('START', 'Plugin started successfully', {
      enabled: this.settings.enabled,
      position: this.settings.position,
    });
  }

  stop() {
    this.debugLog('STOP', 'Plugin stopping');
    this.stopUpdating();
    this.removeProgressBar();
    this.removeCSS();
    this.debugLog('STOP', 'Plugin stopped successfully');
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load('LevelProgressBar', 'settings');
      if (saved) {
        this.settings = { ...this.defaultSettings, ...saved };
        this.debugLog('LOAD_SETTINGS', 'Settings loaded successfully', {
          enabled: this.settings.enabled,
          position: this.settings.position,
          showLevel: this.settings.showLevel,
          showRank: this.settings.showRank,
          showXP: this.settings.showXP,
          compact: this.settings.compact,
        });
      } else {
        this.debugLog('LOAD_SETTINGS', 'No saved settings, using defaults');
      }
    } catch (error) {
      this.debugError('LOAD_SETTINGS', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('LevelProgressBar', 'settings', this.settings);
      this.debugLog('SAVE_SETTINGS', 'Settings saved successfully');
    } catch (error) {
      this.debugError('SAVE_SETTINGS', error);
    }
  }

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h3 style="color: #8b5cf6; margin-bottom: 10px;">Level Progress Bar Settings</h3>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.enabled ? 'checked' : ''} id="lpb-enabled">
          <span style="margin-left: 10px;">Enable Progress Bar</span>
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Position:</span>
          <select id="lpb-position" style="width: 100%; padding: 5px;">
            <option value="top" ${this.settings.position === 'top' ? 'selected' : ''}>Top</option>
            <option value="bottom" ${
              this.settings.position === 'bottom' ? 'selected' : ''
            }>Bottom</option>
          </select>
        </label>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.showLevel ? 'checked' : ''} id="lpb-show-level">
          <span style="margin-left: 10px;">Show Level</span>
        </label>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.showRank ? 'checked' : ''} id="lpb-show-rank">
          <span style="margin-left: 10px;">Show Rank</span>
        </label>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.showXP ? 'checked' : ''} id="lpb-show-xp">
          <span style="margin-left: 10px;">Show XP</span>
        </label>
        <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" ${this.settings.compact ? 'checked' : ''} id="lpb-compact">
          <span style="margin-left: 10px;">Compact Mode</span>
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <span style="display: block; margin-bottom: 5px;">Opacity (0.1 - 1.0):</span>
          <input type="number" id="lpb-opacity" value="${
            this.settings.opacity
          }" min="0.1" max="1.0" step="0.05" style="width: 100%; padding: 5px;">
        </label>
      </div>
    `;

    // Event listeners
    panel.querySelector('#lpb-enabled').addEventListener('change', (e) => {
      this.settings.enabled = e.target.checked;
      this.saveSettings();
      if (this.settings.enabled) {
        this.createProgressBar();
        this.startUpdating();
      } else {
        this.removeProgressBar();
        this.stopUpdating();
      }
    });

    panel.querySelector('#lpb-position').addEventListener('change', (e) => {
      this.settings.position = e.target.value;
      this.saveSettings();
      this.updateProgressBarPosition();
    });

    panel.querySelector('#lpb-show-level').addEventListener('change', (e) => {
      this.settings.showLevel = e.target.checked;
      this.saveSettings();
      this.updateProgressBar();
    });

    panel.querySelector('#lpb-show-rank').addEventListener('change', (e) => {
      this.settings.showRank = e.target.checked;
      this.saveSettings();
      this.updateProgressBar();
    });

    panel.querySelector('#lpb-show-xp').addEventListener('change', (e) => {
      this.settings.showXP = e.target.checked;
      this.saveSettings();
      this.updateProgressBar();
    });

    panel.querySelector('#lpb-compact').addEventListener('change', (e) => {
      this.settings.compact = e.target.checked;
      this.saveSettings();
      this.updateProgressBar();
    });

    panel.querySelector('#lpb-opacity').addEventListener('change', (e) => {
      this.settings.opacity = parseFloat(e.target.value);
      this.saveSettings();
      if (this.progressBar) {
        this.progressBar.style.opacity = this.settings.opacity;
      }
    });

    return panel;
  }

  injectCSS() {
    const styleId = 'level-progress-bar-css';
    if (document.getElementById(styleId)) {
      this.debugLog('INJECT_CSS', 'CSS already injected');
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .lpb-progress-container {
        position: fixed;
        left: 0;
        right: 0;
        z-index: 999997;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      .lpb-progress-container.top {
        top: 0;
      }

      .lpb-progress-container.bottom {
        bottom: 0;
      }

      .lpb-progress-bar {
        width: 100%;
        background: rgba(10, 10, 15, 0.95);
        border-bottom: 2px solid rgba(139, 92, 246, 0.5);
        padding: 8px 20px 8px 80px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 20px;
        box-shadow: 0 2px 10px rgba(139, 92, 246, 0.3);
        backdrop-filter: blur(10px);
      }

      .lpb-progress-container.bottom .lpb-progress-bar {
        border-bottom: none;
        border-top: 2px solid rgba(139, 92, 246, 0.5);
        box-shadow: 0 -2px 10px rgba(139, 92, 246, 0.3);
      }

      .lpb-progress-bar.compact {
        padding: 4px 15px 4px 80px;
      }

      .lpb-info-section {
        display: flex;
        align-items: center;
        gap: 15px;
        flex-shrink: 0;
      }

      .lpb-compact .lpb-info-section {
        gap: 10px;
      }

      .lpb-level-text {
        font-family: 'Press Start 2P', monospace;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.9);
        white-space: nowrap;
      }

      .lpb-compact .lpb-level-text {
        font-size: 9px;
      }

      .lpb-rank-text {
        font-family: 'Press Start 2P', monospace;
        font-size: 10px;
        color: #8b5cf6;
        text-shadow: 0 0 3px rgba(139, 92, 246, 0.5),
                     0 0 6px rgba(124, 58, 237, 0.4),
                     0 0 9px rgba(109, 40, 217, 0.3);
        white-space: nowrap;
      }

      .lpb-compact .lpb-rank-text {
        font-size: 8px;
      }

      .lpb-progress-section {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        width: 1100px;
        flex-shrink: 0;
      }

      .lpb-compact .lpb-progress-section {
        gap: 8px;
        width: 1000px;
      }

      .lpb-progress-track {
        width: 100%;
        height: 12px;
        background: rgba(20, 20, 30, 0.8);
        border-radius: 6px;
        overflow: hidden;
        position: relative;
        border: 1px solid rgba(139, 92, 246, 0.2);
        min-width: 100px;
      }

      .lpb-compact .lpb-progress-track {
        height: 8px;
      }

      .lpb-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%);
        border-radius: 6px;
        transition: width 0.5s ease-out;
        position: relative;
        box-shadow: 0 0 10px rgba(139, 92, 246, 0.6),
                    inset 0 0 10px rgba(255, 255, 255, 0.1);
      }

      .lpb-progress-fill::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
        animation: lpb-shimmer 2s infinite;
      }

      @keyframes lpb-shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      .lpb-xp-text {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.8);
        white-space: nowrap;
        font-family: 'Press Start 2P', monospace;
      }

      .lpb-compact .lpb-xp-text {
        font-size: 9px;
      }

    `;
    document.head.appendChild(style);
    this.debugLog('INJECT_CSS', 'CSS injected successfully', {
      styleId,
      styleExists: !!document.getElementById(styleId),
    });
  }

  removeCSS() {
    const style = document.getElementById('level-progress-bar-css');
    if (style) style.remove();
  }

  createProgressBar() {
    if (!this.settings.enabled) {
      this.debugLog('CREATE_BAR', 'Plugin disabled, skipping');
      return;
    }

    if (this.progressBar) {
      this.debugLog('CREATE_BAR', 'Progress bar already exists');
      return;
    }

    try {
      const container = document.createElement('div');
      container.className = `lpb-progress-container ${this.settings.position}`;
      container.style.opacity = this.settings.opacity;

      const bar = document.createElement('div');
      bar.className = `lpb-progress-bar ${this.settings.compact ? 'compact' : ''}`;

      // Info section (Level, Rank)
      const infoSection = document.createElement('div');
      infoSection.className = 'lpb-info-section';

      if (this.settings.showRank) {
        const rankText = document.createElement('div');
        rankText.className = 'lpb-rank-text';
        rankText.id = 'lpb-rank';
        rankText.textContent = 'Rank: E';
        infoSection.appendChild(rankText);
      }

      if (this.settings.showLevel) {
        const levelText = document.createElement('div');
        levelText.className = 'lpb-level-text';
        levelText.id = 'lpb-level';
        levelText.textContent = 'Lv. 1';
        infoSection.appendChild(levelText);
      }

      bar.appendChild(infoSection);

      // Progress section
      const progressSection = document.createElement('div');
      progressSection.className = 'lpb-progress-section';

      if (this.settings.showXP) {
        const xpText = document.createElement('div');
        xpText.className = 'lpb-xp-text';
        xpText.id = 'lpb-xp';
        xpText.textContent = '0 / 100 XP';
        progressSection.appendChild(xpText);
      }

      const progressTrack = document.createElement('div');
      progressTrack.className = 'lpb-progress-track';
      const progressFill = document.createElement('div');
      progressFill.className = 'lpb-progress-fill';
      progressFill.id = 'lpb-progress-fill';
      progressFill.style.width = '0%';
      progressTrack.appendChild(progressFill);
      progressSection.appendChild(progressTrack);

      bar.appendChild(progressSection);

      container.appendChild(bar);
      document.body.appendChild(container);

      this.progressBar = container;
      this.debugLog('CREATE_BAR', 'Progress bar created successfully', {
        position: this.settings.position,
        compact: this.settings.compact,
        containerExists: !!this.progressBar,
        parentExists: !!this.progressBar.parentElement,
        showLevel: this.settings.showLevel,
        showRank: this.settings.showRank,
        showXP: this.settings.showXP,
      });

      // Initial update
      this.updateProgressBar();
    } catch (error) {
      this.debugError('CREATE_BAR', error);
    }
  }

  removeProgressBar() {
    if (this.progressBar) {
      this.progressBar.remove();
      this.progressBar = null;
      this.debugLog('REMOVE_BAR', 'Progress bar removed');
    }
  }

  updateProgressBarPosition() {
    if (this.progressBar) {
      this.progressBar.className = `lpb-progress-container ${this.settings.position}`;
      this.debugLog('UPDATE_POSITION', 'Position updated', {
        position: this.settings.position,
      });
    }
  }

  updateProgressBar() {
    if (!this.progressBar || !this.settings.enabled) {
      this.debugLog('UPDATE_BAR', 'Skipping update', {
        hasBar: !!this.progressBar,
        enabled: this.settings.enabled,
      });
      return;
    }

    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) {
        this.debugLog('UPDATE_BAR', 'SoloLevelingStats plugin not found');
        return;
      }

      const instance = soloPlugin.instance || soloPlugin;
      if (!instance || !instance.getCurrentLevel) {
        this.debugLog('UPDATE_BAR', 'SoloLevelingStats instance or method not found', {
          hasInstance: !!instance,
          hasMethod: !!(instance && instance.getCurrentLevel),
        });
        return;
      }

      const levelInfo = instance.getCurrentLevel();
      const currentLevel = levelInfo.level;
      const currentXP = levelInfo.xp;
      const xpRequired = levelInfo.xpRequired;
      const xpPercent = (currentXP / xpRequired) * 100;
      const rank = instance.settings?.rank || 'E';

      // Check if data changed (OPTIMIZED: Removed verbose logging for no-change case)
      if (currentLevel === this.lastLevel && currentXP === this.lastXP) {
        // OPTIMIZED: Don't log "No change detected" - happens every second, causes spam
        return; // No change, skip update
      }

      this.debugLog('UPDATE_BAR', 'Data changed, updating bar', {
        oldLevel: this.lastLevel,
        newLevel: currentLevel,
        oldXP: this.lastXP,
        newXP: currentXP,
      });

      this.lastLevel = currentLevel;
      this.lastXP = currentXP;

      // Update rank
      if (this.settings.showRank) {
        const rankEl = this.progressBar.querySelector('#lpb-rank');
        if (rankEl) {
          rankEl.textContent = `Rank: ${rank}`;
          this.debugLog('UPDATE_BAR', 'Rank updated', { rank });
        } else {
          this.debugLog('UPDATE_BAR', 'Rank element not found');
        }
      }

      // Update level
      if (this.settings.showLevel) {
        const levelEl = this.progressBar.querySelector('#lpb-level');
        if (levelEl) {
          levelEl.textContent = `Lv. ${currentLevel}`;
          this.debugLog('UPDATE_BAR', 'Level updated', { level: currentLevel });
        } else {
          this.debugLog('UPDATE_BAR', 'Level element not found');
        }
      }

      // Update XP
      if (this.settings.showXP) {
        const xpEl = this.progressBar.querySelector('#lpb-xp');
        if (xpEl) {
          xpEl.textContent = `${currentXP} / ${xpRequired} XP`;
          this.debugLog('UPDATE_BAR', 'XP updated', { xp: currentXP, xpRequired });
        } else {
          this.debugLog('UPDATE_BAR', 'XP element not found');
        }
      }

      // Update progress bar
      const progressFill = this.progressBar.querySelector('#lpb-progress-fill');
      if (progressFill) {
        progressFill.style.width = `${xpPercent}%`;
        this.debugLog('UPDATE_BAR', 'Progress fill updated', {
          width: `${xpPercent}%`,
        });
      }

      // Update compact class
      const bar = this.progressBar.querySelector('.lpb-progress-bar');
      if (bar) {
        if (this.settings.compact) {
          bar.classList.add('compact');
        } else {
          bar.classList.remove('compact');
        }
      }

      this.debugLog('UPDATE_BAR', 'Progress bar updated successfully', {
        level: currentLevel,
        xp: currentXP,
        xpRequired,
        percent: Math.round(xpPercent),
        rank,
        showLevel: this.settings.showLevel,
        showRank: this.settings.showRank,
        showXP: this.settings.showXP,
      });
    } catch (error) {
      this.debugError('UPDATE_BAR', error, {
        hasBar: !!this.progressBar,
        enabled: this.settings.enabled,
      });
    }
  }

  startUpdating() {
    if (this.updateInterval) {
      this.debugLog('START_UPDATE', 'Update interval already running');
      return;
    }

    this.updateInterval = setInterval(() => {
      this.updateProgressBar();
    }, this.settings.updateInterval);

    this.debugLog('START_UPDATE', 'Update interval started', {
      interval: this.settings.updateInterval,
    });
  }

  stopUpdating() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      this.debugLog('STOP_UPDATE', 'Update interval stopped');
    }
  }

  debugLog(operation, message, data = null) {
    // OPTIMIZED: Disable debug logging by default to reduce CPU/memory usage
    // Set this.debugEnabled = true in constructor to enable
    if (!this.debugEnabled) return;

    if (typeof message === 'object' && data === null) {
      data = message;
      message = operation;
      operation = 'GENERAL';
    }
    const logMessage = data !== null && data !== undefined ? `${message}` : message;
    const logData = data !== null && data !== undefined ? data : '';
    console.log(`[LevelProgressBar] ${operation}:`, logMessage, logData);
  }

  debugError(operation, error, data = null) {
    console.error(`[LevelProgressBar] ERROR [${operation}]:`, error, data || '');
  }
};
