/**
 * @name SoloLevelingTitleManager
 * @author BlueFlashX1
 * @description Manage and equip titles with stat buffs
 * @version 1.1.0
 *
 * @changelog v1.1.0 (2025-12-05)
 * - MAJOR REFACTOR: Complete functional programming overhaul
 * - Organized into 4-section structure (matches SoloLevelingStats)
 * - Fixed shallow copy bugs in constructor and loadSettings
 * - Removed duplicate functions (loadSettings, saveSettings, getSoloLevelingData, getTitleBonus)
 * - Replaced if-else statements with functional alternatives (96 → 83)
 * - Added debug mode system with toggleable logs
 * - Added debugLog() helper (functional, no if-else)
 * - Simplified plugin description
 * - Code reduced from 1,152 → 1,109 lines (-43, -3.7%)
 *
 * @changelog v1.0.3 (2025-12-04)
 * - Fixed close button cleanup
 * - Enhanced memory cleanup
 */

module.exports = class SoloLevelingTitleManager {
  // ============================================================================
  // SECTION 1: IMPORTS & DEPENDENCIES
  // ============================================================================
  // (No external imports needed for this plugin)

  // ============================================================================
  // SECTION 2: CONFIGURATION & HELPERS
  // ============================================================================

  // 2.1 CONSTRUCTOR & SETTINGS
  // ----------------------------------------------------------------------------
  constructor() {
    this.defaultSettings = {
      enabled: true,
      debugMode: false, // Debug mode toggle
    };

    // CRITICAL FIX: Deep copy to prevent defaultSettings from being modified
    // Shallow copy (this.settings = this.defaultSettings) causes save corruption!
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

  // 2.2 HELPER FUNCTIONS
  // ----------------------------------------------------------------------------

  /**
   * HTML escaping utility for XSS prevention
   */
  escapeHtml(text) {
    return typeof text !== 'string'
      ? text
      : (() => {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        })();
  }

  /**
   * Debug logging helper (functional, no if-else)
   */
  debugLog(message, data = null) {
    const log = () => console.log(`[TitleManager]`, message, data || '');
    return this.settings?.debugMode === true && log();
  }

  /**
   * Format title buffs (functional, no if-else)
   * Returns array of formatted buff strings
   */
  formatTitleBuffs(titleName) {
    const bonus = this.getTitleBonus(titleName);
    if (!bonus) return [];

    // FUNCTIONAL: Array-based bonus formatting (no if-else)
    return [
      { val: bonus.xp, fmt: (v) => `+${(v * 100).toFixed(0)}% XP` },
      { val: bonus.critChance, fmt: (v) => `+${(v * 100).toFixed(0)}% Crit` },
      { val: bonus.strengthPercent, fmt: (v) => `+${(v * 100).toFixed(0)}% STR` },
      { val: bonus.agilityPercent, fmt: (v) => `+${(v * 100).toFixed(0)}% AGI` },
      { val: bonus.intelligencePercent, fmt: (v) => `+${(v * 100).toFixed(0)}% INT` },
      { val: bonus.vitalityPercent, fmt: (v) => `+${(v * 100).toFixed(0)}% VIT` },
      { val: bonus.perceptionPercent, fmt: (v) => `+${(v * 100).toFixed(0)}% PER` },
      {
        val: bonus.strength > 0 && !bonus.strengthPercent && bonus.strength,
        fmt: (v) => `+${v} STR`,
      },
      {
        val: bonus.agility > 0 && !bonus.agilityPercent && bonus.agility,
        fmt: (v) => `+${v} AGI`,
      },
      {
        val: bonus.intelligence > 0 && !bonus.intelligencePercent && bonus.intelligence,
        fmt: (v) => `+${v} INT`,
      },
      {
        val: bonus.vitality > 0 && !bonus.vitalityPercent && bonus.vitality,
        fmt: (v) => `+${v} VIT`,
      },
      {
        val: bonus.luck > 0 && !bonus.perceptionPercent && bonus.luck,
        fmt: (v) => `+${v} LUK`,
      },
    ]
      .filter(({ val }) => val > 0)
      .map(({ val, fmt }) => fmt(val));
  }

  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================

  // 3.1 PLUGIN LIFECYCLE
  // ----------------------------------------------------------------------------
  start() {
    // Reset stopped flag to allow watchers to recreate
    this._isStopped = false;

    this.loadSettings();
    this.injectCSS();
    this.createTitleButton();

    // Retry button creation after delays (FUNCTIONAL: no if-else)
    this._retryTimeout1 = setTimeout(() => {
      this._retryTimeouts.delete(this._retryTimeout1);
      (!this.titleButton || !document.body.contains(this.titleButton)) &&
        (this.debugLog('Retrying button creation...'), this.createTitleButton());
      this._retryTimeout1 = null;
    }, 2000);
    this._retryTimeouts.add(this._retryTimeout1);

    // Additional retry after longer delay (FUNCTIONAL: no if-else)
    this._retryTimeout2 = setTimeout(() => {
      this._retryTimeouts.delete(this._retryTimeout2);
      (!this.titleButton || !document.body.contains(this.titleButton)) &&
        (this.debugLog('Final retry for button creation...'), this.createTitleButton());
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

      // Clear all tracked retry timeouts (FUNCTIONAL: no if-else)
      this._retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this._retryTimeouts.clear();

      // Clear legacy retry timeouts (FUNCTIONAL: short-circuit)
      this._retryTimeout1 && (clearTimeout(this._retryTimeout1), (this._retryTimeout1 = null));
      this._retryTimeout2 && (clearTimeout(this._retryTimeout2), (this._retryTimeout2 = null));

      this.debugLog('Plugin stopped');
    } finally {
      // Cleanup URL change watcher (FUNCTIONAL: short-circuit)
      this._urlChangeCleanup && (this._urlChangeCleanup(), (this._urlChangeCleanup = null));

      // MEMORY CLEANUP: Clear modal instance tracking (FUNCTIONAL: filter pattern)
      window._titleManagerInstances &&
        (() => {
          const instancesToRemove = [];
          window._titleManagerInstances.forEach((instance, modal) => {
            instance === this && instancesToRemove.push(modal);
          });
          instancesToRemove.forEach((modal) => window._titleManagerInstances.delete(modal));
        })();
    }
  }

  // 3.2 SETTINGS MANAGEMENT
  // ----------------------------------------------------------------------------
  loadSettings() {
    try {
      const saved = BdApi.Data.load('TitleManager', 'settings');
      // FUNCTIONAL: Only merge and deep copy if saved exists
      saved &&
        (() => {
          const merged = { ...this.defaultSettings, ...saved };
          this.settings = JSON.parse(JSON.stringify(merged));
        })();
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

  // 3.3 DATA ACCESS
  // ----------------------------------------------------------------------------
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

  // 3.4 TITLE MANAGEMENT
  // ----------------------------------------------------------------------------
  /**
   * Setup channel watcher for URL changes (event-based, no polling)
   */
  setupChannelWatcher() {
    // Use event-based URL change detection (more efficient than polling)
    let lastUrl = window.location.href;

    const handleUrlChange = () => {
      // FUNCTIONAL: Guard clause + short-circuit
      if (this._isStopped) return;

      const currentUrl = window.location.href;
      // FUNCTIONAL: Short-circuit instead of if-else
      currentUrl !== lastUrl &&
        (() => {
          lastUrl = currentUrl;
          const timeoutId = setTimeout(() => {
            this._retryTimeouts.delete(timeoutId);
            (!this.titleButton || !document.contains(this.titleButton)) && this.createTitleButton();
          }, 500);
          this._retryTimeouts.add(timeoutId);
        })();
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

      // FUNCTIONAL: Short-circuit for defensive restoration
      try {
        this._originalPushState &&
          history.pushState !== this._originalPushState &&
          (history.pushState = this._originalPushState);
      } catch (error) {
        this.debugLog('Failed to restore history.pushState', error);
      }

      try {
        this._originalReplaceState &&
          history.replaceState !== this._originalReplaceState &&
          (history.replaceState = this._originalReplaceState);
      } catch (error) {
        this.debugLog('Failed to restore history.replaceState', error);
      }

      // Null out stored originals after successful restore
      this._originalPushState = null;
      this._originalReplaceState = null;
    };
  }

  // 3.5 EVENT HANDLING & WATCHERS
  // ----------------------------------------------------------------------------
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
      // FUNCTIONAL: Guard clause + short-circuit for toast
      if (unwantedTitles.includes(titleName)) {
        BdApi?.showToast?.('This title has been removed', { type: 'error', timeout: 2000 });
        return false;
      }

      const soloData = this.getSoloLevelingData();
      // FUNCTIONAL: Guard clause + short-circuit for toast
      if (!soloData || !soloData.titles.includes(titleName)) {
        BdApi?.showToast?.('Title not unlocked', { type: 'error', timeout: 2000 });
        return false;
      }

      // FUNCTIONAL: Optional chaining instead of if-check
      (instance.setActiveTitle &&
        (() => {
          const result = instance.setActiveTitle(titleName);
          result &&
            BdApi?.showToast &&
            (() => {
              // FUNCTIONAL: Use helper function (no if-else, no duplication)
              const buffs = this.formatTitleBuffs(titleName);
              const bonusText = buffs.length > 0 ? ` (${buffs.join(', ')})` : '';
              BdApi.showToast(`Title Equipped: ${titleName}${bonusText}`, {
                type: 'success',
                timeout: 3000,
              });
            })();
          result && (this.refreshModal(), true);
          return result || false;
        })()) ||
        false;
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

      // FUNCTIONAL: Optional chaining for all operations
      return instance.setActiveTitle
        ? (() => {
            const result = instance.setActiveTitle(null);
            // Fallback: set directly if method failed
            !result &&
              instance.settings &&
              ((instance.settings.achievements.activeTitle = null), instance.saveSettings?.(true));
            instance.updateChatUI?.();
            BdApi?.showToast?.('Title Unequipped', { type: 'info', timeout: 2000 });
            this.refreshModal();
            return true;
          })()
        : false;
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
    // FUNCTIONAL: Guard clause + short-circuit for retry
    if (!toolbar) {
      !this._isStopped &&
        (() => {
          const timeoutId = setTimeout(() => {
            this._retryTimeouts.delete(timeoutId);
            this.createTitleButton();
          }, 1000);
          this._retryTimeouts.add(timeoutId);
        })();
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
    // FUNCTIONAL: Short-circuit for cleanup
    this.toolbarObserver?.disconnect();

    this.toolbarObserver = new MutationObserver(() => {
      // FUNCTIONAL: Short-circuit for recreation check
      this.titleButton && !toolbar.contains(this.titleButton) && this.createTitleButton();
    });

    this.toolbarObserver.observe(toolbar, {
      childList: true,
      subtree: true,
    });
  }

  removeTitleButton() {
    // FUNCTIONAL: Short-circuit for cleanup
    this.titleButton && (this.titleButton.remove(), (this.titleButton = null));
    this.toolbarObserver && (this.toolbarObserver.disconnect(), (this.toolbarObserver = null));
  }

  openTitleModal() {
    // FUNCTIONAL: Guard clause for existing modal
    if (this.titleModal) return this.closeTitleModal();

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
          <button class="tm-close-button">×</button>
        </div>
        <div class="tm-modal-body">
          ${
            activeTitle
              ? `
            <div class="tm-active-title">
              <div class="tm-active-label">Active Title:</div>
              <div class="tm-active-name">${this.escapeHtml(activeTitle)}</div>
              ${(() => {
                // FUNCTIONAL: Use helper function (no if-else, no duplication)
                const buffs = this.formatTitleBuffs(activeTitle);
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
                    // FUNCTIONAL: Use helper function (no if-else, no duplication)
                    const buffs = this.formatTitleBuffs(title);
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

  // 3.7 CSS MANAGEMENT
  // ----------------------------------------------------------------------------

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
            </ul>
          </div>
        </div>
      </div>
    `;

    const debugCheckbox = panel.querySelector('#tm-debug');

    // FUNCTIONAL: Optional chaining for event listener
    debugCheckbox?.addEventListener('change', (e) => {
      this.settings.debugMode = e.target.checked;
      this.saveSettings();
      this.debugLog('Debug mode toggled', { enabled: e.target.checked });
    });

    return panel;
  }
};
