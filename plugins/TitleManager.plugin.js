/**
 * @name SoloLevelingTitleManager
 * @author BlueFlashX1
 * @description Title management system for Solo Leveling Stats - display and equip titles with buffs
 * @version 1.0.2
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
    };

    this.settings = this.defaultSettings;
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
        console.log('[TitleManager] Retrying button creation...');
        this.createTitleButton();
      }
      this._retryTimeout1 = null;
    }, 2000);
    this._retryTimeouts.add(this._retryTimeout1);

    // Additional retry after longer delay (for plugin re-enabling)
    this._retryTimeout2 = setTimeout(() => {
      this._retryTimeouts.delete(this._retryTimeout2);
      if (!this.titleButton || !document.body.contains(this.titleButton)) {
        console.log('[TitleManager] Final retry for button creation...');
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

      console.log('TitleManager: Plugin stopped');
    } finally {
      // Cleanup URL change watcher in finally block to guarantee restoration
      // even if stop() throws an error
      if (this._urlChangeCleanup) {
        this._urlChangeCleanup();
        this._urlChangeCleanup = null;
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
      console.error('TitleManager: Error loading settings', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('TitleManager', 'settings', this.settings);
    } catch (error) {
      console.error('TitleManager: Error saving settings', error);
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
      console.error('TitleManager: Error getting SoloLevelingStats data', error);
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
      console.error('[TitleManager] Failed to override history methods:', error);
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
        console.error('[TitleManager] Failed to restore history.pushState:', error);
      }

      try {
        if (this._originalReplaceState && history.replaceState !== this._originalReplaceState) {
          history.replaceState = this._originalReplaceState;
        }
      } catch (error) {
        console.error('[TitleManager] Failed to restore history.replaceState:', error);
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
   * Create title button in Discord UI
   */
  createTitleButton() {
    this.removeTitleButton();
    this.closeTitleModal();
    this.removeCSS();

    // Cleanup URL change watcher
    if (this._urlChangeCleanup) {
      this._urlChangeCleanup();
      this._urlChangeCleanup = null;
    }

    console.log('TitleManager: Plugin stopped');
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load('TitleManager', 'settings');
      if (saved) {
        this.settings = { ...this.defaultSettings, ...saved };
      }
    } catch (error) {
      console.error('TitleManager: Error loading settings', error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save('TitleManager', 'settings', this.settings);
    } catch (error) {
      console.error('TitleManager: Error saving settings', error);
    }
  }

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
      console.error('TitleManager: Error getting SoloLevelingStats data', error);
      return null;
    }
  }

  // Get title bonus info
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
      console.error('TitleManager: Error equipping title', error);
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
      console.error('TitleManager: Error unequipping title', error);
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

    // Sort titles by XP bonus percentage (ascending: lowest to highest)
    titles.sort((titleA, titleB) => {
      const bonusA = this.getTitleBonus(titleA);
      const bonusB = this.getTitleBonus(titleB);
      const xpA = bonusA?.xp || 0;
      const xpB = bonusB?.xp || 0;
      return xpA - xpB; // Ascending order
    });

    const activeTitle =
      soloData?.activeTitle && !unwantedTitles.includes(soloData.activeTitle)
        ? soloData.activeTitle
        : null;

    const modal = document.createElement('div');
    modal.className = 'tm-title-modal';
    modal.innerHTML = `
      <div class="tm-modal-content">
        <div class="tm-modal-header">
          <h2> Titles</h2>
          <button class="tm-close-button" onclick="this.closest('.tm-title-modal').remove()">×</button>
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
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
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
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
      }

      .tm-modal-content {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 2px solid rgba(139, 92, 246, 0.5);
        border-radius: 16px;
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 0 30px rgba(139, 92, 246, 0.5);
      }

      .tm-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 2px solid rgba(139, 92, 246, 0.3);
      }

      .tm-modal-header h2 {
        margin: 0;
        color: #8b5cf6;
        font-family: 'Orbitron', sans-serif;
        font-size: 24px;
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

      .tm-modal-body {
        padding: 20px;
      }

      .tm-active-title {
        background: rgba(0, 255, 136, 0.1);
        border: 2px solid rgba(0, 255, 136, 0.5);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        text-align: center;
      }

      .tm-active-label {
        color: rgba(0, 255, 136, 0.8);
        font-size: 14px;
        margin-bottom: 8px;
      }

      .tm-active-name {
        color: #00ff88;
        font-size: 24px;
        font-weight: bold;
        font-family: 'Orbitron', sans-serif;
        margin-bottom: 8px;
      }

      .tm-active-bonus {
        color: rgba(0, 255, 136, 0.8);
        font-size: 16px;
        margin-bottom: 15px;
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
        color: #8b5cf6;
        font-family: 'Orbitron', sans-serif;
        font-size: 18px;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid rgba(139, 92, 246, 0.3);
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
        background: rgba(20, 20, 30, 0.8);
        border: 2px solid rgba(139, 92, 246, 0.3);
        border-radius: 12px;
        padding: 20px;
        text-align: center;
        transition: all 0.3s ease;
      }

      .tm-title-card.active {
        border-color: rgba(0, 255, 136, 0.6);
        background: rgba(0, 255, 136, 0.1);
      }

      .tm-title-card:hover:not(.active) {
        border-color: rgba(139, 92, 246, 0.8);
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
        transform: translateY(-2px);
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

    document.head.appendChild(style);
  }

  removeCSS() {
    const style = document.getElementById('title-manager-css');
    if (style) style.remove();
  }

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.innerHTML = `
      <div>
        <h3 style="color: #8b5cf6;">Title Manager Settings</h3>
        <label style="display: flex; align-items: center; margin-bottom: 10px;">
          <input type="checkbox" ${this.settings.enabled ? 'checked' : ''} id="tm-enabled">
          <span style="margin-left: 10px;">Enable Title Manager</span>
        </label>
      </div>
    `;

    panel.querySelector('#tm-enabled').addEventListener('change', (e) => {
      this.settings.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        this.createTitleButton();
      } else {
        this.removeTitleButton();
        this.closeTitleModal();
      }
    });

    return panel;
  }
};
