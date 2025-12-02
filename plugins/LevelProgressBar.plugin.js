/**
 * @name LevelProgressBar
 * @author BlueFlashX1
 * @description Always-visible level progress bar for Solo Leveling Stats
 * @version 1.0.1
 */

module.exports = class LevelProgressBar {
  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================
  constructor() {
    this.defaultSettings = {
      enabled: true,
      position: 'top', // top, bottom
      showLevel: true,
      showRank: true,
      showXP: true,
      compact: false, // Compact mode (smaller bar)
      opacity: 1.0, // 100% opacity - fully opaque
      updateInterval: 5000, // Fallback polling interval (only used if events unavailable)
    };

    this.settings = this.defaultSettings;
    this.progressBar = null;
    this.updateInterval = null;
    this.lastLevel = 0;
    this.lastXP = 0;
    this.debugEnabled = false; // OPTIMIZED: Disable debug logging by default
    this.eventUnsubscribers = []; // Store unsubscribe functions for event listeners
    this.fallbackInterval = null; // Fallback polling if events not available (disabled by default)
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================
  start() {
    this.debugLog('START', 'Plugin starting');
    this.loadSettings();
    this.injectCSS();
    this.createProgressBar();

    // Try to subscribe to events immediately, with retry if SoloLevelingStats not ready yet
    this.subscribeToEvents();

    // If subscription failed, retry after a short delay (SoloLevelingStats might still be loading)
    if (this.eventUnsubscribers.length === 0) {
      setTimeout(() => {
        this.subscribeToEvents();
        // If still no events after retry, use fallback polling
        if (this.eventUnsubscribers.length === 0) {
          this.debugLog('START', 'Events not available after retry, using fallback polling');
          this.startUpdating();
        }
      }, 1000);
    }

    this.debugLog('START', 'Plugin started successfully', {
      enabled: this.settings.enabled,
      position: this.settings.position,
      eventBased: this.eventUnsubscribers.length > 0,
      fallbackPolling: this.eventUnsubscribers.length === 0,
    });
  }

  stop() {
    this.debugLog('STOP', 'Plugin stopping');
    this.unsubscribeFromEvents();
    this.stopUpdating();
    this.removeProgressBar();
    this.removeCSS();
    this.debugLog('STOP', 'Plugin stopped successfully');
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================
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
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        box-shadow: 0 2px 10px rgba(139, 92, 246, 0.3);
        backdrop-filter: blur(10px);
      }

      .lpb-progress-bar-content {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0;
        flex-shrink: 0;
      }

      .lpb-progress-container.bottom .lpb-progress-bar {
        border-bottom: none;
        border-top: 2px solid rgba(139, 92, 246, 0.5);
        box-shadow: 0 -2px 10px rgba(139, 92, 246, 0.3);
      }

      .lpb-progress-bar.compact {
        padding: 4px 15px 4px 80px;
      }

      .lpb-progress-text {
        font-size: 14px;
        font-weight: 600;
        color: #a78bfa;
        text-shadow: 0 0 8px rgba(167, 139, 250, 0.6);
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        flex-shrink: 0;
        line-height: 1;
      }

      .lpb-progress-track {
        flex: 1;
        min-width: 100px;
        max-width: 300px;
        height: 12px;
        background: rgba(20, 20, 30, 0.8);
        border-radius: 6px;
        overflow: visible;
        position: relative;
        border: none !important; /* Remove border that creates glow */
        box-shadow: none !important;
        filter: none !important;
        align-self: center;
      }

      /* XP glow animation disabled */
      .lpb-progress-fill.lpb-xp-gain {
        animation: none !important;
        box-shadow: none !important;
      }

      @keyframes lpb-xp-glow {
        /* Disabled - no glow animation */
      }

      .lpb-compact .lpb-progress-track {
        height: 8px;
      }

      .lpb-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%);
        border-radius: 6px;
        transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        box-shadow: 0 0 10px rgba(139, 92, 246, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
      }

      /* Shimmer animation overlay */
      .lpb-progress-fill::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.3) 50%,
          transparent 100%
        );
        animation: lpb-shimmer 2s infinite;
        display: block !important;
      }

      /* XP gain pulse animation */
      .lpb-progress-fill.lpb-xp-gain {
        animation: lpb-xp-pulse 0.6s ease-out;
      }

      @keyframes lpb-xp-pulse {
        0% {
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
        }
        50% {
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.8), inset 0 0 30px rgba(167, 139, 250, 0.6);
          transform: scaleY(1.1);
        }
        100% {
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.5), inset 0 0 20px rgba(167, 139, 250, 0.3);
          transform: scaleY(1);
        }
      }

      /* Subtle glow effect on hover */
      .lpb-progress-fill:hover {
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.7), inset 0 0 25px rgba(167, 139, 250, 0.4);
      }

      /* Sparkle particles */
      .lpb-progress-track .lpb-sparkle {
        position: absolute;
        width: 4px;
        height: 4px;
        background: rgba(186, 85, 211, 0.9);
        border-radius: 50%;
        pointer-events: none;
        animation: lpb-sparkle-float 2s infinite;
        box-shadow: 0 0 8px rgba(186, 85, 211, 0.9);
        top: 50%;
        transform: translateY(-50%);
      }

      /* Milestone markers */
      .lpb-progress-track .lpb-milestone {
        position: absolute;
        top: -10px;
        width: 2px;
        height: 32px;
        background: rgba(139, 92, 246, 0.6);
        pointer-events: none;
        z-index: 1;
      }

      .lpb-progress-track .lpb-milestone::after {
        content: '';
        position: absolute;
        top: -5px;
        left: -4px;
        width: 10px;
        height: 10px;
        background: rgba(139, 92, 246, 0.9);
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(139, 92, 246, 0.8);
        animation: lpb-milestone-pulse 2s infinite;
      }

      @keyframes lpb-sparkle {
        0%, 100% { opacity: 0; }
        50% { opacity: 1; }
      }

      @keyframes lpb-sparkle-float {
        0% {
          opacity: 0;
          transform: translateY(-50%) scale(0);
        }
        50% {
          opacity: 1;
          transform: translateY(-60%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateY(-70%) scale(0);
        }
      }

      @keyframes lpb-milestone-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 0.9;
        }
        50% {
          transform: scale(1.3);
          opacity: 1;
        }
      }

      @keyframes lpb-shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(300%);
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

  // ============================================================================
  // PROGRESS BAR CREATION & MANAGEMENT
  // ============================================================================
  /**
   * Create progress bar element
   */
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

      // Content wrapper for text
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'lpb-progress-bar-content';

      // Single line format matching SoloLevelingStats chat UI: "Rank: E Lv.1 0/100 XP"
      const progressText = document.createElement('div');
      progressText.className = 'lpb-progress-text';
      progressText.id = 'lpb-progress-text';
      progressText.textContent = 'Rank: E Lv.1 0/100 XP';
      contentWrapper.appendChild(progressText);
      bar.appendChild(contentWrapper);

      // Progress track with animated fill
      const progressTrack = document.createElement('div');
      progressTrack.className = 'lpb-progress-track';

      const progressFill = document.createElement('div');
      progressFill.className = 'lpb-progress-fill';
      progressFill.id = 'lpb-progress-fill';
      progressFill.style.width = '0%';

      progressTrack.appendChild(progressFill);
      bar.appendChild(progressTrack);

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

      // Initial update - force update even if data hasn't changed
      this.lastLevel = null;
      this.lastXP = null;
      this.updateProgressBar();

      // Initialize milestone markers
      setTimeout(() => {
        const progressTrack = this.progressBar.querySelector('.lpb-progress-track');
        if (progressTrack) {
          const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
          if (soloPlugin) {
            const instance = soloPlugin.instance || soloPlugin;
            if (instance && instance.getCurrentLevel) {
              const levelInfo = instance.getCurrentLevel();
              const xpPercent = (levelInfo.xp / levelInfo.xpRequired) * 100;
              this.updateMilestoneMarkers(progressTrack, xpPercent);
            }
          }
        }
      }, 100);
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

  /**
   * Update progress bar position
   */
  updateProgressBarPosition() {
    if (this.progressBar) {
      this.progressBar.className = `lpb-progress-container ${this.settings.position}`;
      this.debugLog('UPDATE_POSITION', 'Position updated', {
        position: this.settings.position,
      });
    }
  }

  /**
   * Get SoloLevelingStats instance and level info
   * @returns {Object|null} - Object with instance and levelInfo, or null if unavailable
   */
  getSoloLevelingData() {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) {
        this.debugLog('GET_SOLO_DATA', 'SoloLevelingStats plugin not found');
        return null;
      }

      const instance = soloPlugin.instance || soloPlugin;
      if (!instance?.getCurrentLevel) {
        this.debugLog('GET_SOLO_DATA', 'Instance or method not found', {
          hasInstance: !!instance,
          hasMethod: !!(instance && instance.getCurrentLevel),
        });
        return null;
      }

      // Get current level info (calculates level from totalXP)
      const levelInfo = instance.getCurrentLevel();
      if (!levelInfo) {
        this.debugLog('GET_SOLO_DATA', 'Level info not available');
        return null;
      }

      // Get rank from settings (not from levelInfo)
      const rank = instance.settings?.rank || 'E';

      // Debug log to verify data
      this.debugLog('GET_SOLO_DATA', 'Retrieved SoloLevelingStats data', {
        level: levelInfo.level,
        xp: levelInfo.xp,
        xpRequired: levelInfo.xpRequired,
        rank: rank,
        totalXP: instance.settings?.totalXP,
      });

      return {
        instance,
        levelInfo,
        rank: rank,
      };
    } catch (error) {
      this.debugError('GET_SOLO_DATA', error);
      return null;
    }
  }

  // ============================================================================
  // PROGRESS BAR UPDATE METHODS
  // ============================================================================
  /**
   * Update progress bar with current data
   */
  updateProgressBar() {
    // Early returns for invalid states
    if (!this.progressBar || !this.settings.enabled) {
      this.debugLog('UPDATE_BAR', 'Skipping update', {
        hasBar: !!this.progressBar,
        enabled: this.settings.enabled,
      });
      return;
    }

    try {
      const soloData = this.getSoloLevelingData();
      if (!soloData) {
        this.debugLog('UPDATE_BAR', 'SoloLevelingStats data not available', {
          hasBar: !!this.progressBar,
          enabled: this.settings.enabled,
        });
        return;
      }

      const { levelInfo, rank } = soloData;
      const currentLevel = levelInfo.level;
      const currentXP = levelInfo.xp;
      const xpRequired = levelInfo.xpRequired || 1; // Prevent division by zero
      const xpPercent = Math.min((currentXP / xpRequired) * 100, 100); // Cap at 100%

      // Skip update if data hasn't changed (but allow initial update)
      if (this.lastLevel !== null && this.lastXP !== null && currentLevel === this.lastLevel && currentXP === this.lastXP) {
        return;
      }

      this.debugLog('UPDATE_BAR', 'Data changed, updating bar', {
        oldLevel: this.lastLevel,
        newLevel: currentLevel,
        oldXP: this.lastXP,
        newXP: currentXP,
      });

      this.lastLevel = currentLevel;
      this.lastXP = currentXP;

      // Update progress text (single line format matching SoloLevelingStats)
      this.updateProgressText(rank, currentLevel, currentXP, xpRequired);

      // Update progress fill animation
      const progressFill = this.progressBar.querySelector('#lpb-progress-fill');
      if (progressFill) {
        progressFill.style.width = `${xpPercent}%`;
        // Add XP gain animation class temporarily
        progressFill.classList.add('lpb-xp-gain');
        setTimeout(() => {
          progressFill.classList.remove('lpb-xp-gain');
        }, 600);
      }

      // Update milestone markers
      const progressTrack = this.progressBar.querySelector('.lpb-progress-track');
      if (progressTrack) {
        this.updateMilestoneMarkers(progressTrack, xpPercent);
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

  // ============================================================================
  // PROGRESS TEXT UPDATE METHODS
  // ============================================================================
  /**
   * Update progress text with current rank, level, and XP
   * Format: "Rank: E Lv.1 0/100 XP"
   * @param {string} rank - Current rank
   * @param {number} level - Current level
   * @param {number} xp - Current XP in level
   * @param {number} xpRequired - XP required for next level
   */
  updateProgressText(rank, level, xp, xpRequired) {
    try {
      const progressText = this.progressBar?.querySelector('#lpb-progress-text');
      if (!progressText) {
        this.debugLog('UPDATE_TEXT', 'Progress text element not found');
        return;
      }

      // Format: "Rank: E Lv.1 0/100 XP"
      const text = `Rank: ${rank} Lv.${level} ${xp}/${xpRequired} XP`;
      progressText.textContent = text;

      this.debugLog('UPDATE_TEXT', 'Progress text updated', {
        rank,
        level,
        xp,
        xpRequired,
        text,
      });
    } catch (error) {
      this.debugError('UPDATE_TEXT', error);
    }
  }

  // ============================================================================
  // EVENT SUBSCRIPTION METHODS
  // ============================================================================
  /**
   * Subscribe to SoloLevelingStats events for real-time updates
   * @returns {boolean} True if subscription successful, false otherwise
   */
  subscribeToEvents() {
    // Don't subscribe twice
    if (this.eventUnsubscribers.length > 0) {
      this.debugLog('SUBSCRIBE_EVENTS', 'Already subscribed to events');
      return true;
    }

    const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
    if (!soloPlugin) {
      this.debugLog('SUBSCRIBE_EVENTS', 'SoloLevelingStats plugin not found');
      return false;
    }

    const instance = soloPlugin.instance || soloPlugin;
    if (!instance || typeof instance.on !== 'function') {
      this.debugLog('SUBSCRIBE_EVENTS', 'Event system not available', {
        hasInstance: !!instance,
        hasOnMethod: !!(instance && typeof instance.on === 'function'),
      });
      return false;
    }

    // Subscribe to XP changed events (fires on any XP change)
    const unsubscribeXP = instance.on('xpChanged', (data) => {
      this.debugLog('EVENT_XP_CHANGED', 'XP changed event received', data);
      // Update immediately - no polling needed
      this.updateProgressBar();
    });
    this.eventUnsubscribers.push(unsubscribeXP);

    // Subscribe to level changed events
    const unsubscribeLevel = instance.on('levelChanged', (data) => {
      this.debugLog('EVENT_LEVEL_CHANGED', 'Level changed event received', data);
      // Update immediately - no polling needed
      this.updateProgressBar();
    });
    this.eventUnsubscribers.push(unsubscribeLevel);

    // Subscribe to rank changed events
    const unsubscribeRank = instance.on('rankChanged', (data) => {
      this.debugLog('EVENT_RANK_CHANGED', 'Rank changed event received', data);
      // Update immediately - no polling needed
      this.updateProgressBar();
    });
    this.eventUnsubscribers.push(unsubscribeRank);

    // Log successful subscription (always log, not just debug)
    console.log('[LevelProgressBar]  Event-based updates enabled - progress bar will update in real-time');

    this.debugLog('SUBSCRIBE_EVENTS', 'Successfully subscribed to events', {
      listenersCount: this.eventUnsubscribers.length,
    });

    // Initial update
    this.updateProgressBar();

    return true;
  }

  /**
   * Unsubscribe from all events
   */
  unsubscribeFromEvents() {
    this.eventUnsubscribers.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        this.debugError('UNSUBSCRIBE_EVENTS', error);
      }
    });
    this.eventUnsubscribers = [];
    this.debugLog('UNSUBSCRIBE_EVENTS', 'Unsubscribed from all events');
  }

  // ============================================================================
  // FALLBACK POLLING METHODS
  // ============================================================================
  /**
   * Start fallback polling (only used if events unavailable)
   */
  startUpdating() {
    if (this.updateInterval) {
      this.debugLog('START_UPDATE', 'Update interval already running');
      return;
    }

    // Only use polling as fallback - slower interval since events should handle most updates
    this.updateInterval = setInterval(() => {
      this.updateProgressBar();
    }, this.settings.updateInterval || 5000); // Default to 5 seconds for fallback

    this.debugLog('START_UPDATE', 'Fallback polling started', {
      interval: this.settings.updateInterval || 5000,
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

  createProgressSparkles(progressTrack, xpPercent) {
    // Create 3-5 sparkles along the progress bar
    const sparkleCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < sparkleCount; i++) {
      const sparkle = document.createElement('div');
      sparkle.className = 'lpb-sparkle';
      sparkle.style.left = `${xpPercent}%`;
      sparkle.style.animationDelay = `${i * 0.2}s`;
      progressTrack.appendChild(sparkle);

      setTimeout(() => {
        if (sparkle.parentElement) {
          sparkle.remove();
        }
      }, 2000);
    }
  }

  updateMilestoneMarkers(progressTrack, xpPercent) {
    if (!progressTrack) return;

    // Remove existing markers
    const existingMarkers = progressTrack.querySelectorAll('.lpb-milestone');
    existingMarkers.forEach(m => m.remove());

    // Add markers at 25%, 50%, 75%
    const milestones = [25, 50, 75];
    milestones.forEach(milestone => {
      if (xpPercent >= milestone - 1) { // Show if reached or close
        const marker = document.createElement('div');
        marker.className = 'lpb-milestone';
        marker.style.left = `${milestone}%`;
        progressTrack.appendChild(marker);
      }
    });
  }
};
