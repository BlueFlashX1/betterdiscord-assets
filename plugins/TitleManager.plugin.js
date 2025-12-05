/**
 * @name SoloLevelingTitleManager
 * @author BlueFlashX1
 * @description Title management system for Solo Leveling Stats - display and equip titles with buffs
 * @version 1.0.3
 *
 * @changelog v1.0.3 (2025-12-04)
 * - Fixed close button using inline onclick that bypassed cleanup
 * - Close button now routes through central modal click handler
 * - Ensures proper state cleanup (titleModal, _titleManagerInstances)
 * - Enhanced memory cleanup (modal instance tracking cleared on stop)
 *
 * @changelog v1.0.2 (2025-12-03)
 * - Code structure improvements (section headers)
 * - Console log cleanup (removed verbose logs)
 */

module.exports = class SoloLevelingTitleManager {
  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================
  constructor() {
    this.defaultSettings = {
      enabled: true,
      debugMode: false, // Debug mode toggle
      sortBy: 'xpBonus', // Default sort by XP bonus
    };

    // Deep copy to prevent defaultSettings from being modified
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.titleButton = null;
    this.titleModal = null;
    this._urlChangeCleanup = null; // Cleanup function for URL change watcher
    this._retryTimeout1 = null; // Timeout ID for first retry
    this._retryTimeout2 = null; // Timeout ID for second retry

    // Track all retry timeouts for proper cleanup
    this._retryTimeouts = new Set();
    this._isStopped = false;

    // Store original history methods for defensive restoration
    this._originalPushState = null;
    this._originalReplaceState = null;
  }

  // Helper Functions
  // ============================================================================
  
  /**
   * Debug logging helper (toggleable via settings)
   */
  debugLog(message, data = null) {
    if (!this.settings?.debugMode) return;
    console.log(`[TitleManager] ${message}`, data || '');
  }

  /**
   * HTML escaping utility for XSS prevention
   */
  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================
  start() {
    // Reset stopped flag to allow watchers to recreate
    this._isStopped = false;

    this.loadSettings();
    this.injectCSS();
    this.createTitleButton();

    // Retry button creation after delays to ensure Discord UI is ready
    this._retryTimeout1 = setTimeout(() => {
      this._retryTimeouts.delete(this._retryTimeout1);
      if (!this.titleButton || !document.body.contains(this.titleButton)) {
        this.debugLog('Retrying button creation...');
        this.createTitleButton();
      }
      this._retryTimeout1 = null;
    }, 2000);
    this._retryTimeouts.add(this._retryTimeout1);

    // Additional retry after longer delay (for plugin re-enabling)
    this._retryTimeout2 = setTimeout(() => {
      this._retryTimeouts.delete(this._retryTimeout2);
      if (!this.titleButton || !document.body.contains(this.titleButton)) {
        this.debugLog('Final retry for button creation...');
        this.createTitleButton();
      }
      this._retryTimeout2 = null;
    }, 5000);
    this._retryTimeouts.add(this._retryTimeout2);

    // Watch for channel changes and recreate button
    this.setupChannelWatcher();
  }

  stop() {
    // Set stopped flag to prevent recreating watchers
    this._isStopped = true;

    try {
      this.removeTitleButton();
      this.closeTitleModal();
      this.removeCSS();

      // Clear all tracked retry timeouts
      this._retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this._retryTimeouts.clear();

      // Clear legacy retry timeouts (for backwards compatibility)
      if (this._retryTimeout1) {
        clearTimeout(this._retryTimeout1);
        this._retryTimeout1 = null;
      }
      if (this._retryTimeout2) {
        clearTimeout(this._retryTimeout2);
        this._retryTimeout2 = null;
      }

      this.debugLog('Plugin stopped');
    } finally {
      // Cleanup URL change watcher in finally block to guarantee restoration
      // even if stop() throws an error
      if (this._urlChangeCleanup) {
        this._urlChangeCleanup();
        this._urlChangeCleanup = null;
      }

      // MEMORY CLEANUP: Clear modal instance tracking
      if (window._titleManagerInstances) {
        // Remove any instances belonging to this plugin
        const instancesToRemove = [];
        window._titleManagerInstances.forEach((instance, modal) => {
          if (instance === this) {
            instancesToRemove.push(modal);
          }
        });
        instancesToRemove.forEach((modal) => {
          window._titleManagerInstances.delete(modal);
        });
      }
    }
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================
  loadSettings() {
    try {
      const saved = BdApi.Data.load('TitleManager', 'settings');
      if (saved) {
        this.settings = { ...this.defaultSettings, ...saved };
      }
    } catch (error) {
      this.debugLog('Error loading settings', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('TitleManager', 'settings', this.settings);
    } catch (error) {
      this.debugLog('Error saving settings', error);
    }
  }

  // ============================================================================
  // DATA ACCESS METHODS
  // ============================================================================
  /**
   * Get SoloLevelingStats data
   * @returns {Object|null} - SoloLevelingStats data or null if unavailable
   */
  getSoloLevelingData() {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) return null;

      const instance = soloPlugin.instance || soloPlugin;
      const achievements = instance.settings?.achievements || {};

      return {
        titles: achievements.titles || [],
        activeTitle: achievements.activeTitle || null,
        achievements: achievements,
      };
    } catch (error) {
      this.debugLog('Error getting SoloLevelingStats data', error);
      return null;
    }
  }

  /**
   * Get title bonus info
   * @param {string} titleName - Title name
   * @returns {Object|null} - Title bonus object or null
   */
  getTitleBonus(titleName) {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) return null;
      const instance = soloPlugin.instance || soloPlugin;

      // Find achievement with this title
      if (instance.getAchievementDefinitions) {
        const achievements = instance.getAchievementDefinitions();
        const achievement = achievements.find((a) => a.title === titleName);
        return achievement?.titleBonus || null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // ============================================================================
  // TITLE MANAGEMENT METHODS
  // ============================================================================
  // ============================================================================
  // EVENT HANDLING & WATCHERS
  // ============================================================================
  /**
   * Setup channel watcher for URL changes (event-based, no polling)
   */
  setupChannelWatcher() {
    // Use event-based URL change detection (more efficient than polling)
    let lastUrl = window.location.href;

    const handleUrlChange = () => {
      // Return early if plugin is stopped
      if (this._isStopped) return;

      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Recreate button after channel change
        const timeoutId = setTimeout(() => {
          this._retryTimeouts.delete(timeoutId);
          if (!this.titleButton || !document.contains(this.titleButton)) {
            this.createTitleButton();
          }
        }, 500);
        this._retryTimeouts.add(timeoutId);
      }
    };

    // Listen to browser navigation events
    window.addEventListener('popstate', handleUrlChange);

    // Override pushState and replaceState to detect programmatic navigation
    // Store originals in private properties for defensive restoration
    try {
      this._originalPushState = history.pushState;
      this._originalReplaceState = history.replaceState;

      history.pushState = function (...args) {
        this._originalPushState.apply(history, args);
        handleUrlChange();
      }.bind(this);

      history.replaceState = function (...args) {
        this._originalReplaceState.apply(history, args);
        handleUrlChange();
      }.bind(this);
    } catch (error) {
      this.debugLog('Failed to override history methods', error);
    }

    // Store idempotent and defensive cleanup function
    this._urlChangeCleanup = () => {
      window.removeEventListener('popstate', handleUrlChange);

      // Defensive restoration: check if methods need restoration before restoring
      try {
        if (this._originalPushState && history.pushState !== this._originalPushState) {
          history.pushState = this._originalPushState;
        }
      } catch (error) {
        this.debugLog('Failed to restore history.pushState', error);
      }

      try {
        if (this._originalReplaceState && history.replaceState !== this._originalReplaceState) {
          history.replaceState = this._originalReplaceState;
        }
      } catch (error) {
        this.debugLog('Failed to restore history.replaceState', error);
      }

      // Null out stored originals after successful restore
      this._originalPushState = null;
      this._originalReplaceState = null;
    };
  }

  // ============================================================================
  // UI METHODS
  // ============================================================================
  /**
   * Equip a title
   * @param {string} titleName - Title name to equip
   * @returns {boolean} - True if successful
   */
  equipTitle(titleName) {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) return false;
      const instance = soloPlugin.instance || soloPlugin;

      // Check if title exists in unlocked titles and is not in unwanted list
      const unwantedTitles = [
        'Scribe',
        'Wordsmith',
        'Author',
        'Explorer',
        'Wanderer',
        'Apprentice',
        'Message Warrior',
      ];
      if (unwantedTitles.includes(titleName)) {
        if (BdApi && typeof BdApi.showToast === 'function') {
          BdApi.showToast('This title has been removed', { type: 'error', timeout: 2000 });
        }
        return false;
      }

      const soloData = this.getSoloLevelingData();
      if (!soloData || !soloData.titles.includes(titleName)) {
        if (BdApi && typeof BdApi.showToast === 'function') {
          BdApi.showToast('Title not unlocked', { type: 'error', timeout: 2000 });
        }
        return false;
      }

      if (instance.setActiveTitle) {
        const result = instance.setActiveTitle(titleName);
        if (result) {
          // Show notification
          if (BdApi && typeof BdApi.showToast === 'function') {
            const bonus = this.getTitleBonus(titleName);
            const buffs = [];
            if (bonus) {
              if (bonus.xp > 0) buffs.push(`+${(bonus.xp * 100).toFixed(0)}% XP`);
              if (bonus.critChance > 0) buffs.push(`+${(bonus.critChance * 100).toFixed(0)}% Crit`);
              // Check for percentage-based stat bonuses (new format)
              if (bonus.strengthPercent > 0)
                buffs.push(`+${(bonus.strengthPercent * 100).toFixed(0)}% STR`);
              if (bonus.agilityPercent > 0)
                buffs.push(`+${(bonus.agilityPercent * 100).toFixed(0)}% AGI`);
              if (bonus.intelligencePercent > 0)
                buffs.push(`+${(bonus.intelligencePercent * 100).toFixed(0)}% INT`);
              if (bonus.vitalityPercent > 0)
                buffs.push(`+${(bonus.vitalityPercent * 100).toFixed(0)}% VIT`);
              if (bonus.perceptionPercent > 0)
                buffs.push(`+${(bonus.perceptionPercent * 100).toFixed(0)}% PER`);
              // Support old format (raw numbers) for backward compatibility
              if (bonus.strength > 0 && !bonus.strengthPercent)
                buffs.push(`+${bonus.strength} STR`);
              if (bonus.agility > 0 && !bonus.agilityPercent) buffs.push(`+${bonus.agility} AGI`);
              if (bonus.intelligence > 0 && !bonus.intelligencePercent)
                buffs.push(`+${bonus.intelligence} INT`);
              if (bonus.vitality > 0 && !bonus.vitalityPercent)
                buffs.push(`+${bonus.vitality} VIT`);
              if (bonus.luck > 0 && !bonus.perceptionPercent) buffs.push(`+${bonus.luck} LUK`);
            }
            const bonusText = buffs.length > 0 ? ` (${buffs.join(', ')})` : '';
            BdApi.showToast(`Title Equipped: ${titleName}${bonusText}`, {
              type: 'success',
              timeout: 3000,
            });
          }
          this.refreshModal();
          return true;
        }
      }
      return false;
    } catch (error) {
      this.debugLog('Error equipping title', error);
      return false;
    }
  }

  /**
   * Unequip currently active title
   * @returns {boolean} - True if successful
   */
  unequipTitle() {
    try {
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      if (!soloPlugin) return false;
      const instance = soloPlugin.instance || soloPlugin;

      // Use setActiveTitle with null to unequip
      if (instance.setActiveTitle) {
        // Try setting to null - if that doesn't work, set directly
        const result = instance.setActiveTitle(null);
        if (!result && instance.settings) {
          // Fallback: set directly
          instance.settings.achievements.activeTitle = null;
          if (instance.saveSettings) {
            instance.saveSettings(true);
          }
        }
        if (instance.updateChatUI) {
          instance.updateChatUI();
        }
        if (BdApi && typeof BdApi.showToast === 'function') {
          BdApi.showToast('Title Unequipped', { type: 'info', timeout: 2000 });
        }
        this.refreshModal();
        return true;
      }
      return false;
    } catch (error) {
      this.debugLog('Error unequipping title', error);
      return false;
    }
  }

  createTitleButton() {
    // Remove any existing buttons first (prevent duplicates)
    const existingButtons = document.querySelectorAll('.tm-title-button');
    existingButtons.forEach((btn) => btn.remove());
    this.titleButton = null;

    // Find Discord's button row - look for the container with keyboard, gift, GIF, emoji icons
    const findToolbar = () => {
      // Method 1: Find by looking for common Discord button classes
      const buttonRow =
        // Look for container with multiple buttons (Discord's toolbar)
        Array.from(document.querySelectorAll('[class*="button"]')).find((el) => {
          const siblings = Array.from(el.parentElement?.children || []);
          // Check if this container has multiple button-like elements (Discord's toolbar)
          return (
            siblings.length >= 4 &&
            siblings.some(
              (s) =>
                s.querySelector('[class*="emoji"]') ||
                s.querySelector('[class*="gif"]') ||
                s.querySelector('[class*="attach"]')
            )
          );
        })?.parentElement ||
        // Method 2: Find by text area and traverse up
        (() => {
          const textArea =
            document.querySelector('[class*="channelTextArea"]') ||
            document.querySelector('[class*="slateTextArea"]') ||
            document.querySelector('textarea[placeholder*="Message"]');
          if (!textArea) return null;

          // Go up to find the input container, then find button row
          let container =
            textArea.closest('[class*="container"]') ||
            textArea.closest('[class*="wrapper"]') ||
            textArea.parentElement?.parentElement?.parentElement;

          // Look for the row that contains multiple buttons
          const buttons = container?.querySelectorAll('[class*="button"]');
          if (buttons && buttons.length >= 4) {
            return buttons[0]?.parentElement;
          }

          return (
            container?.querySelector('[class*="buttons"]') ||
            container?.querySelector('[class*="buttonContainer"]')
          );
        })();

      return buttonRow;
    };

    const toolbar = findToolbar();
    if (!toolbar) {
      // Return early if plugin is stopped
      if (this._isStopped) return;

      const timeoutId = setTimeout(() => {
        this._retryTimeouts.delete(timeoutId);
        this.createTitleButton();
      }, 1000);
      this._retryTimeouts.add(timeoutId);
      return;
    }

    // Create title button with SVG icon
    const button = document.createElement('button');
    button.className = 'tm-title-button';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"></path>
      </svg>
    `;
    button.title = 'Titles';
    button.addEventListener('click', () => this.openTitleModal());

    // Insert button before skill tree button (or before apps button if no skill tree)
    const skillTreeBtn = toolbar.querySelector('.st-skill-tree-button');
    const appsButton = Array.from(toolbar.children).find(
      (el) =>
        el.querySelector('[class*="apps"]') ||
        el.getAttribute('aria-label')?.toLowerCase().includes('app')
    );

    if (skillTreeBtn) {
      toolbar.insertBefore(button, skillTreeBtn);
    } else if (appsButton) {
      toolbar.insertBefore(button, appsButton);
    } else {
      toolbar.appendChild(button);
    }
    this.titleButton = button;

    // Watch for toolbar changes and reposition if needed
    this.observeToolbar(toolbar);
  }

  observeToolbar(toolbar) {
    if (this.toolbarObserver) {
      this.toolbarObserver.disconnect();
    }

    this.toolbarObserver = new MutationObserver(() => {
      if (this.titleButton && !toolbar.contains(this.titleButton)) {
        // Button was removed, recreate it
        this.createTitleButton();
      }
    });

    this.toolbarObserver.observe(toolbar, {
      childList: true,
      subtree: true,
    });
  }

  removeTitleButton() {
    if (this.titleButton) {
      this.titleButton.remove();
      this.titleButton = null;
    }
    if (this.toolbarObserver) {
      this.toolbarObserver.disconnect();
      this.toolbarObserver = null;
    }
  }

  openTitleModal() {
    if (this.titleModal) {
      this.closeTitleModal();
      return;
    }

    const soloData = this.getSoloLevelingData();
    // Filter out unwanted titles
    const unwantedTitles = [
      'Scribe',
      'Wordsmith',
      'Author',
      'Explorer',
      'Wanderer',
      'Apprentice',
      'Message Warrior',
    ];
    let titles = (soloData?.titles || []).filter((title) => !unwantedTitles.includes(title));

    // Sort titles by selected bonus type (highest to lowest)
    const sortBy = this.settings.sortBy || 'xpBonus';
    const sortFunctions = {
      xpBonus: (a, b) => (this.getTitleBonus(b)?.xp || 0) - (this.getTitleBonus(a)?.xp || 0),
      critBonus: (a, b) =>
        (this.getTitleBonus(b)?.critChance || 0) - (this.getTitleBonus(a)?.critChance || 0),
      strBonus: (a, b) =>
        (this.getTitleBonus(b)?.strengthPercent || 0) -
        (this.getTitleBonus(a)?.strengthPercent || 0),
      agiBonus: (a, b) =>
        (this.getTitleBonus(b)?.agilityPercent || 0) - (this.getTitleBonus(a)?.agilityPercent || 0),
      intBonus: (a, b) =>
        (this.getTitleBonus(b)?.intelligencePercent || 0) -
        (this.getTitleBonus(a)?.intelligencePercent || 0),
      vitBonus: (a, b) =>
        (this.getTitleBonus(b)?.vitalityPercent || 0) -
        (this.getTitleBonus(a)?.vitalityPercent || 0),
      perBonus: (a, b) =>
        (this.getTitleBonus(b)?.perceptionPercent || 0) -
        (this.getTitleBonus(a)?.perceptionPercent || 0),
    };
    titles.sort(sortFunctions[sortBy] || sortFunctions.xpBonus);

    const activeTitle =
      soloData?.activeTitle && !unwantedTitles.includes(soloData.activeTitle)
        ? soloData.activeTitle
        : null;

    const modal = document.createElement('div');
    modal.className = 'tm-title-modal';
    modal.innerHTML = `
      <div class="tm-modal-content">
        <div class="tm-modal-header">
          <h2>⭐ Titles</h2>
          <button class="tm-close-button">×</button>
        </div>
        <div class="tm-filter-bar">
          <label class="tm-filter-label">Sort by:</label>
          <select id="tm-sort-select" class="tm-sort-dropdown">
            <option value="xpBonus" ${
              this.settings.sortBy === 'xpBonus' ? 'selected' : ''
            }>📈 XP Gain (Highest)</option>
            <option value="critBonus" ${
              this.settings.sortBy === 'critBonus' ? 'selected' : ''
            }>⚡ Crit Chance (Highest)</option>
            <option value="strBonus" ${
              this.settings.sortBy === 'strBonus' ? 'selected' : ''
            }>💪 Strength % (Highest)</option>
            <option value="agiBonus" ${
              this.settings.sortBy === 'agiBonus' ? 'selected' : ''
            }>🏃 Agility % (Highest)</option>
            <option value="intBonus" ${
              this.settings.sortBy === 'intBonus' ? 'selected' : ''
            }>🧠 Intelligence % (Highest)</option>
            <option value="vitBonus" ${
              this.settings.sortBy === 'vitBonus' ? 'selected' : ''
            }>❤️ Vitality % (Highest)</option>
            <option value="perBonus" ${
              this.settings.sortBy === 'perBonus' ? 'selected' : ''
            }>👁️ Perception % (Highest)</option>
          </select>
        </div>
        <div class="tm-modal-body">
          ${
            activeTitle
              ? `
            <div class="tm-active-title">
              <div class="tm-active-label">Active Title:</div>
              <div class="tm-active-name">${this.escapeHtml(activeTitle)}</div>
              ${(() => {
                const bonus = this.getTitleBonus(activeTitle);
                if (!bonus) return '';
                const buffs = [];
                if (bonus.xp > 0) buffs.push(`+${(bonus.xp * 100).toFixed(0)}% XP`);
                if (bonus.critChance > 0)
                  buffs.push(`+${(bonus.critChance * 100).toFixed(0)}% Crit`);
                // Check for percentage-based stat bonuses (new format)
                if (bonus.strengthPercent > 0)
                  buffs.push(`+${(bonus.strengthPercent * 100).toFixed(0)}% STR`);
                if (bonus.agilityPercent > 0)
                  buffs.push(`+${(bonus.agilityPercent * 100).toFixed(0)}% AGI`);
                if (bonus.intelligencePercent > 0)
                  buffs.push(`+${(bonus.intelligencePercent * 100).toFixed(0)}% INT`);
                if (bonus.vitalityPercent > 0)
                  buffs.push(`+${(bonus.vitalityPercent * 100).toFixed(0)}% VIT`);
                if (bonus.perceptionPercent > 0)
                  buffs.push(`+${(bonus.perceptionPercent * 100).toFixed(0)}% PER`);
                // Support old format (raw numbers) for backward compatibility
                if (bonus.strength > 0 && !bonus.strengthPercent)
                  buffs.push(`+${bonus.strength} STR`);
                if (bonus.agility > 0 && !bonus.agilityPercent) buffs.push(`+${bonus.agility} AGI`);
                if (bonus.intelligence > 0 && !bonus.intelligencePercent)
                  buffs.push(`+${bonus.intelligence} INT`);
                if (bonus.vitality > 0 && !bonus.vitalityPercent)
                  buffs.push(`+${bonus.vitality} VIT`);
                if (bonus.luck > 0 && !bonus.perceptionPercent) buffs.push(`+${bonus.luck} LUK`);
                return buffs.length > 0
                  ? `<div class="tm-active-bonus">${buffs.join(', ')}</div>`
                  : '';
              })()}
              <button class="tm-unequip-btn" id="tm-unequip-btn">Unequip</button>
            </div>
          `
              : `
            <div class="tm-no-title">
              <div class="tm-no-title-text">No title equipped</div>
            </div>
          `
          }
          <div class="tm-titles-section">
            <h3 class="tm-section-title">Available Titles (${titles.length})</h3>
            ${
              titles.length === 0
                ? `
              <div class="tm-empty-state">
                <div class="tm-empty-icon"></div>
                <div class="tm-empty-text">No titles unlocked yet</div>
                <div class="tm-empty-hint">Complete achievements to unlock titles!</div>
              </div>
            `
                : `
              <div class="tm-titles-grid">
                ${titles
                  .map((title) => {
                    const isActive = title === activeTitle;
                    const bonus = this.getTitleBonus(title);
                    const buffs = [];
                    if (bonus) {
                      if (bonus.xp > 0) buffs.push(`+${(bonus.xp * 100).toFixed(0)}% XP`);
                      if (bonus.critChance > 0)
                        buffs.push(`+${(bonus.critChance * 100).toFixed(0)}% Crit`);
                      // Check for percentage-based stat bonuses (new format)
                      if (bonus.strengthPercent > 0)
                        buffs.push(`+${(bonus.strengthPercent * 100).toFixed(0)}% STR`);
                      if (bonus.agilityPercent > 0)
                        buffs.push(`+${(bonus.agilityPercent * 100).toFixed(0)}% AGI`);
                      if (bonus.intelligencePercent > 0)
                        buffs.push(`+${(bonus.intelligencePercent * 100).toFixed(0)}% INT`);
                      if (bonus.vitalityPercent > 0)
                        buffs.push(`+${(bonus.vitalityPercent * 100).toFixed(0)}% VIT`);
                      if (bonus.perceptionPercent > 0)
                        buffs.push(`+${(bonus.perceptionPercent * 100).toFixed(0)}% PER`);
                      // Support old format (raw numbers) for backward compatibility
                      if (bonus.strength > 0 && !bonus.strengthPercent)
                        buffs.push(`+${bonus.strength} STR`);
                      if (bonus.agility > 0 && !bonus.agilityPercent)
                        buffs.push(`+${bonus.agility} AGI`);
                      if (bonus.intelligence > 0 && !bonus.intelligencePercent)
                        buffs.push(`+${bonus.intelligence} INT`);
                      if (bonus.vitality > 0 && !bonus.vitalityPercent)
                        buffs.push(`+${bonus.vitality} VIT`);
                      if (bonus.luck > 0 && !bonus.perceptionPercent)
                        buffs.push(`+${bonus.luck} LUK`);
                    }
                    return `
                      <div class="tm-title-card ${isActive ? 'active' : ''}">
                        <div class="tm-title-icon"></div>
                        <div class="tm-title-name">${this.escapeHtml(title)}</div>
                        ${
                          buffs.length > 0
                            ? `<div class="tm-title-bonus">${buffs.join(', ')}</div>`
                            : ''
                        }
                        ${
                          isActive
                            ? `
                          <div class="tm-title-status">Equipped</div>
                        `
                            : `
                          <button class="tm-equip-btn" data-title="${this.escapeHtml(
                            title
                          )}">Equip</button>
                        `
                        }
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
            }
          </div>
        </div>
      </div>
    `;

    // Store instance reference (namespaced for security)
    if (!window._titleManagerInstances) window._titleManagerInstances = new WeakMap();
    window._titleManagerInstances.set(modal, this);

    // Add event listeners (secure, no inline onclick)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeTitleModal();
        return;
      }

      // Handle close button clicks
      if (e.target.classList.contains('tm-close-button') || e.target.closest('.tm-close-button')) {
        this.closeTitleModal();
        return;
      }

      // Handle equip button clicks
      if (e.target.classList.contains('tm-equip-btn')) {
        const title = e.target.getAttribute('data-title');
        if (title) {
          this.equipTitle(title);
        }
      }

      // Handle unequip button
      if (e.target.id === 'tm-unequip-btn' || e.target.closest('#tm-unequip-btn')) {
        this.unequipTitle();
      }
    });

    // Handle sort filter change
    const sortSelect = modal.querySelector('#tm-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.settings.sortBy = e.target.value;
        this.saveSettings();
        this.refreshModal();
      });
    }

    document.body.appendChild(modal);
    this.titleModal = modal;
  }

  // HTML escaping utility for XSS prevention
  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  refreshModal() {
    this.closeTitleModal();
    setTimeout(() => this.openTitleModal(), 100);
  }

  closeTitleModal() {
    if (this.titleModal) {
      if (window._titleManagerInstances) {
        window._titleManagerInstances.delete(this.titleModal);
      }
      this.titleModal.remove();
      this.titleModal = null;
    }
  }

  injectCSS() {
    const styleId = 'title-manager-css';
    const cssContent = `
      .tm-title-button {
        background: transparent;
        border: none;
        border-radius: 4px;
        width: 32px;
        height: 32px;
        cursor: pointer;
        color: var(--interactive-normal, #b9bbbe);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        margin: 0 2px;
        flex-shrink: 0;
        padding: 6px;
        box-sizing: border-box;
      }

      .tm-title-button svg {
        width: 20px;
        height: 20px;
        transition: all 0.2s ease;
        display: block;
      }

      .tm-title-button:hover {
        background: var(--background-modifier-hover, rgba(4, 4, 5, 0.6));
        color: var(--interactive-hover, #dcddde);
      }

      .tm-title-button:hover svg {
        transform: scale(1.1);
      }

      .tm-title-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(15px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .tm-modal-content {
        background: linear-gradient(145deg, #0f0f1e 0%, #1a1a2e 40%, #16213e 70%, #1a1a2e 100%);
        border: 2px solid transparent;
        border-radius: 20px;
        width: 90%;
        max-width: 850px;
        max-height: 90vh;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.9),
                    0 0 120px rgba(139, 92, 246, 0.5),
                    0 0 200px rgba(102, 126, 234, 0.3),
                    inset 0 0 120px rgba(139, 92, 246, 0.15);
        background-clip: padding-box;
        position: relative;
      }
      .tm-modal-content::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 20px;
        padding: 2px;
        background: linear-gradient(135deg,
          rgba(139, 92, 246, 0.7) 0%,
          rgba(102, 126, 234, 0.7) 25%,
          rgba(59, 130, 246, 0.5) 50%,
          rgba(139, 92, 246, 0.7) 75%,
          rgba(102, 126, 234, 0.7) 100%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        z-index: -1;
        animation: borderGlow 3s ease-in-out infinite;
      }
      @keyframes borderGlow {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }

      .tm-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 30px;
        border-bottom: 2px solid rgba(139, 92, 246, 0.4);
        background: linear-gradient(135deg,
          rgba(139, 92, 246, 0.25) 0%,
          rgba(102, 126, 234, 0.25) 50%,
          rgba(118, 75, 162, 0.25) 100%);
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
        position: relative;
        overflow: hidden;
      }
      .tm-modal-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 200%;
        height: 100%;
        background: linear-gradient(90deg,
          transparent,
          rgba(139, 92, 246, 0.15),
          rgba(102, 126, 234, 0.15),
          transparent);
        animation: shimmer 4s ease-in-out infinite;
      }
      @keyframes shimmer {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      .tm-modal-header h2 {
        margin: 0;
        color: #fff;
        font-family: 'Orbitron', sans-serif;
        font-size: 32px;
        font-weight: 900;
        text-shadow: 0 2px 15px rgba(139, 92, 246, 1),
                     0 0 30px rgba(102, 126, 234, 0.8),
                     0 4px 40px rgba(139, 92, 246, 0.6);
        letter-spacing: 2px;
        background: linear-gradient(135deg,
          #fff 0%,
          #e9d5ff 30%,
          #c4b5fd 60%,
          #a78bfa 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        position: relative;
        z-index: 1;
      }

      .tm-close-button {
        background: transparent;
        border: none;
        color: #8b5cf6;
        font-size: 32px;
        cursor: pointer;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        transition: all 0.2s ease;
      }

      .tm-close-button:hover {
        background: rgba(139, 92, 246, 0.2);
      }

      .tm-filter-bar {
        padding: 20px 30px;
        background: linear-gradient(135deg,
          rgba(139, 92, 246, 0.15) 0%,
          rgba(102, 126, 234, 0.15) 100%);
        border-bottom: 1px solid rgba(139, 92, 246, 0.3);
        display: flex;
        align-items: center;
        gap: 15px;
        box-shadow: 0 2px 15px rgba(0, 0, 0, 0.3);
      }

      .tm-filter-label {
        color: rgba(255, 255, 255, 0.9);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        text-shadow: 0 2px 10px rgba(139, 92, 246, 0.5);
      }

      .tm-sort-dropdown {
        flex: 1;
        max-width: 350px;
        padding: 12px 16px;
        background: linear-gradient(135deg,
          rgba(139, 92, 246, 0.25) 0%,
          rgba(102, 126, 234, 0.25) 100%);
        border: 2px solid rgba(139, 92, 246, 0.4);
        border-radius: 10px;
        color: #fff;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(139, 92, 246, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }

      .tm-sort-dropdown:hover {
        background: linear-gradient(135deg,
          rgba(139, 92, 246, 0.35) 0%,
          rgba(102, 126, 234, 0.35) 100%);
        border-color: rgba(139, 92, 246, 0.6);
        box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.15);
        transform: translateY(-2px);
      }

      .tm-sort-dropdown:focus {
        border-color: rgba(139, 92, 246, 0.8);
        box-shadow: 0 0 20px rgba(139, 92, 246, 0.6),
                    0 6px 25px rgba(139, 92, 246, 0.4);
      }

      .tm-sort-dropdown option {
        background: #1a1a2e;
        color: #fff;
        padding: 10px;
      }

      .tm-modal-body {
        padding: 25px 30px;
        overflow-y: auto;
        max-height: calc(90vh - 200px);
      }

      .tm-active-title {
        background: linear-gradient(135deg,
          rgba(0, 255, 136, 0.15) 0%,
          rgba(0, 204, 111, 0.15) 100%);
        border: 2px solid rgba(0, 255, 136, 0.6);
        border-radius: 15px;
        padding: 25px;
        margin-bottom: 25px;
        text-align: center;
        box-shadow: 0 8px 25px rgba(0, 255, 136, 0.3),
                    inset 0 0 40px rgba(0, 255, 136, 0.1);
        position: relative;
        overflow: hidden;
      }
      .tm-active-title::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(0, 255, 136, 0.1) 0%, transparent 70%);
        animation: pulse 3s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 0.5; }
        50% { transform: scale(1.1); opacity: 0.8; }
      }

      .tm-active-label {
        color: rgba(0, 255, 136, 0.9);
        font-size: 14px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 10px;
        position: relative;
        z-index: 1;
      }

      .tm-active-name {
        color: #00ff88;
        font-size: 28px;
        font-weight: 900;
        font-family: 'Orbitron', sans-serif;
        margin-bottom: 12px;
        text-shadow: 0 0 20px rgba(0, 255, 136, 0.8),
                     0 2px 15px rgba(0, 255, 136, 0.6);
        background: linear-gradient(135deg, #00ff88 0%, #00cc6f 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        position: relative;
        z-index: 1;
      }

      .tm-active-bonus {
        color: rgba(0, 255, 136, 0.9);
        font-size: 17px;
        font-weight: 600;
        margin-bottom: 18px;
        text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
        position: relative;
        z-index: 1;
      }

      .tm-unequip-btn {
        padding: 8px 20px;
        background: rgba(255, 68, 68, 0.8);
        border: 2px solid rgba(255, 68, 68, 1);
        border-radius: 6px;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .tm-unequip-btn:hover {
        background: rgba(255, 68, 68, 1);
        box-shadow: 0 0 10px rgba(255, 68, 68, 0.6);
      }

      .tm-no-title {
        background: rgba(139, 92, 246, 0.1);
        border: 2px dashed rgba(139, 92, 246, 0.3);
        border-radius: 12px;
        padding: 30px;
        margin-bottom: 20px;
        text-align: center;
      }

      .tm-no-title-text {
        color: rgba(255, 255, 255, 0.6);
        font-size: 16px;
      }

      .tm-titles-section {
        margin-top: 20px;
      }

      .tm-section-title {
        color: #fff;
        font-family: 'Orbitron', sans-serif;
        font-size: 20px;
        font-weight: 800;
        margin-bottom: 20px;
        padding-bottom: 12px;
        border-bottom: 2px solid rgba(139, 92, 246, 0.4);
        text-shadow: 0 2px 10px rgba(139, 92, 246, 0.8);
        background: linear-gradient(135deg, #fff 0%, #e9d5ff 50%, #c4b5fd 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .tm-empty-state {
        text-align: center;
        padding: 40px;
        color: rgba(255, 255, 255, 0.5);
      }

      .tm-empty-icon {
        font-size: 48px;
        margin-bottom: 15px;
      }

      .tm-empty-text {
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 8px;
      }

      .tm-empty-hint {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.4);
      }

      .tm-titles-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 15px;
      }

      .tm-title-card {
        background: linear-gradient(135deg,
          rgba(20, 20, 30, 0.9) 0%,
          rgba(26, 26, 46, 0.9) 100%);
        border: 2px solid rgba(139, 92, 246, 0.4);
        border-radius: 15px;
        padding: 25px;
        text-align: center;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
        position: relative;
        overflow: hidden;
      }

      .tm-title-card::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg,
          rgba(139, 92, 246, 0.1) 0%,
          transparent 50%);
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .tm-title-card.active {
        border-color: rgba(0, 255, 136, 0.7);
        background: linear-gradient(135deg,
          rgba(0, 255, 136, 0.15) 0%,
          rgba(0, 204, 111, 0.15) 100%);
        box-shadow: 0 8px 25px rgba(0, 255, 136, 0.4),
                    inset 0 0 30px rgba(0, 255, 136, 0.1);
      }

      .tm-title-card:hover:not(.active) {
        border-color: rgba(139, 92, 246, 0.9);
        box-shadow: 0 8px 30px rgba(139, 92, 246, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
        transform: translateY(-4px) scale(1.02);
      }

      .tm-title-card:hover::before {
        opacity: 1;
      }

      .tm-title-icon {
        font-size: 32px;
        margin-bottom: 10px;
      }

      .tm-title-name {
        font-weight: bold;
        color: #8b5cf6;
        font-size: 16px;
        margin-bottom: 8px;
        font-family: 'Orbitron', sans-serif;
      }

      .tm-title-card.active .tm-title-name {
        color: #00ff88;
      }

      .tm-title-bonus {
        color: rgba(0, 255, 136, 0.8);
        font-size: 14px;
        margin-bottom: 12px;
      }

      .tm-title-status {
        color: #00ff88;
        font-size: 12px;
        font-weight: bold;
        padding: 6px 12px;
        background: rgba(0, 255, 136, 0.2);
        border-radius: 6px;
        display: inline-block;
      }

      .tm-equip-btn {
        width: 100%;
        padding: 8px;
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        border: none;
        border-radius: 6px;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .tm-equip-btn:hover {
        background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
        box-shadow: 0 0 10px rgba(139, 92, 246, 0.6);
      }
    `;

    // Use BdApi.DOM for persistent CSS injection (v1.8.0+)
    try {
      BdApi.DOM.addStyle(styleId, cssContent);
    } catch (error) {
      // Fallback to manual injection
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = cssContent;
      document.head.appendChild(style);
    }
  }

  removeCSS() {
    const styleId = 'title-manager-css';
    try {
      BdApi.DOM.removeStyle(styleId);
    } catch (error) {
      // Fallback to manual removal
      const style = document.getElementById(styleId);
      if (style) style.remove();
    }
  }

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.innerHTML = `
      <div>
        <h3 style="color: #8b5cf6;">Title Manager Settings</h3>
        <label style="display: flex; align-items: center; margin-bottom: 10px;">
          <input type="checkbox" ${this.settings.debugMode ? 'checked' : ''} id="tm-debug">
          <span style="margin-left: 10px;">Debug Mode (Show console logs)</span>
        </label>
        <div style="margin-top: 15px; padding: 10px; background: rgba(139, 92, 246, 0.1); border-radius: 8px; border-left: 3px solid #8b5cf6;">
          <div style="color: #8b5cf6; font-weight: bold; margin-bottom: 5px;">Debug Information</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            Enable Debug Mode to see detailed console logs for:
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>Button creation and retries</li>
              <li>Settings load/save operations</li>
              <li>Title equip/unequip actions</li>
              <li>Error tracking and debugging</li>
              <li>History method restoration</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    const debugCheckbox = panel.querySelector('#tm-debug');
    if (debugCheckbox) {
      debugCheckbox.addEventListener('change', (e) => {
        this.settings.debugMode = e.target.checked;
        this.saveSettings();
        this.debugLog('Debug mode toggled', { enabled: e.target.checked });
      });
    }

    return panel;
  }
};
