/**
 * @name SoloLevelingStats
 * @author Matthew
 * @description Solo Leveling-inspired stats system that tracks Discord activity and rewards progression through levels, stats, achievements, and daily quests
 * @version 1.0.0
 * @authorId
 * @authorLink
 * @website
 * @source
 */

module.exports = class SoloLevelingStats {
  // Verification helper - call this from console: BdApi.Plugins.get('SoloLevelingStats').instance.verifyMessageDetection()
  verifyMessageDetection() {
    console.log('=== SoloLevelingStats Message Detection Verification ===');
    console.log('Plugin Enabled:', this.settings.enabled);
    console.log('Current Level:', this.settings.level);
    console.log('Current XP:', this.settings.xp);
    console.log('Total XP:', this.settings.totalXP);
    console.log('Messages Sent:', this.settings.activity.messagesSent);
    console.log('Characters Typed:', this.settings.activity.charactersTyped);
    console.log('');
    console.log('Message Observer Active:', !!this.messageObserver);
    console.log('Input Handler Active:', !!this.messageInputHandler);
    console.log('Input Monitoring Active:', this.inputMonitoringActive);
    console.log('');
    console.log('Processed Message IDs:', this.processedMessageIds?.size || 0);
    console.log('Recent Messages:', this.recentMessages?.size || 0);
    console.log('');
    console.log('To test: Send a message in Discord and check if XP increases.');
    console.log('Enable debug mode in settings to see detailed logs.');
    return {
      enabled: this.settings.enabled,
      level: this.settings.level,
      xp: this.settings.xp,
      totalXP: this.settings.totalXP,
      messagesSent: this.settings.activity.messagesSent,
      observerActive: !!this.messageObserver,
      inputHandlerActive: !!this.messageInputHandler,
    };
  }
  constructor() {
    this.defaultSettings = {
      enabled: true,
      // Stat definitions
      stats: {
        strength: 0, // +5% XP per message per point (max 20)
        agility: 0, // +2% crit chance per point (max 20, capped at 25% total), +1% EXP per point during crit hits
        intelligence: 0, // +10% bonus XP from long messages per point (max 20)
        vitality: 0, // +5% daily quest rewards per point (max 20)
        luck: 0, // Each point grants a random % buff that stacks (max 20)
      },
      luckBuffs: [], // Array of random buff percentages that stack (e.g., [2.5, 4.1, 3.7])
      unallocatedStatPoints: 0,
      // Level system
      level: 1,
      xp: 0,
      totalXP: 0,
      // Rank system (E, D, C, B, A, S, SS, SSS, SSS+, NH, Monarch, Monarch+, Shadow Monarch)
      rank: 'E',
      rankHistory: [],
      // Activity tracking
      activity: {
        messagesSent: 0,
        charactersTyped: 0,
        channelsVisited: [], // Will be converted to Set in loadSettings
        timeActive: 0, // in minutes
        lastActiveTime: null, // Will be set in start()
        sessionStartTime: null, // Will be set in start()
        critsLanded: 0, // Track critical hits for achievements
      },
      // Daily quests
      dailyQuests: {
        lastResetDate: null, // Will be set in start()
        quests: {
          messageMaster: { progress: 0, target: 20, completed: false },
          characterChampion: { progress: 0, target: 1000, completed: false },
          channelExplorer: { progress: 0, target: 5, completed: false },
          activeAdventurer: { progress: 0, target: 30, completed: false }, // minutes
          perfectStreak: { progress: 0, target: 10, completed: false },
        },
      },
      // Achievements
      achievements: {
        unlocked: [],
        titles: [],
        activeTitle: null,
      },
    };

    this.settings = this.defaultSettings;
    this.messageObserver = null;
    this.activityTracker = null;
    this.messageInputHandler = null;
    this.processedMessageIds = new Set();
    this.recentMessages = new Set(); // Track recently processed messages to prevent duplicates
    this.lastSaveTime = Date.now();
    this.saveInterval = 30000; // Save every 30 seconds (backup save)
    this.importantSaveInterval = 5000; // Save important changes every 5 seconds
    this.lastMessageId = null; // Track last message ID for crit detection
    this.lastMessageElement = null; // Track last message element for crit detection

    // Event emitter system for real-time progress bar updates
    this.eventListeners = {
      xpChanged: [],
      levelChanged: [],
      rankChanged: [],
      statsChanged: [],
    };

    // Debug system (OPTIMIZED: Default disabled, better throttling)
    this.debug = {
      enabled: false, // OPTIMIZED: Default disabled to reduce CPU/memory usage
      verbose: false, // Set to true for verbose logging (includes frequent operations)
      errorCount: 0,
      lastError: null,
      operationCounts: {},
      // Operations that happen frequently - only log if verbose=true
      frequentOperations: new Set([
        'GET_CHANNEL_INFO',
        'TRACK_CHANNEL_VISIT',
        'START_CHANNEL_TRACKING',
        'HANDLE_CHANNEL_CHANGE',
        'MUTATION_OBSERVER',
        'INPUT_DETECTION',
        'PERIODIC_BACKUP',
        'SAVE_DATA',
      ]),
      // Throttle frequent operations (log max once per X ms)
      lastLogTimes: {},
      throttleInterval: 10000, // OPTIMIZED: Increased to 10 seconds (was 5) to reduce spam
    };
  }

  // Debug logging helper with verbosity control
  debugLog(operation, message, data = null) {
    if (!this.debug.enabled) return;

    // Check if this is a frequent operation
    const isFrequent = this.debug.frequentOperations.has(operation);

    if (isFrequent && !this.debug.verbose) {
      // Throttle frequent operations - only log once per throttleInterval
      const now = Date.now();
      const lastLogTime = this.debug.lastLogTimes[operation] || 0;

      if (now - lastLogTime < this.debug.throttleInterval) {
        // Skip logging, but still track count
        this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
        return;
      }

      // Update last log time
      this.debug.lastLogTimes[operation] = now;
    }

    const timestamp = new Date().toISOString();
    console.warn(`[SoloLevelingStats:${operation}] ${message}`, data || '');

    // Track operation counts
    this.debug.operationCounts[operation] = (this.debug.operationCounts[operation] || 0) + 1;
  }

  // Error logging helper
  debugError(operation, error, context = {}) {
    this.debug.errorCount++;

    // Extract error message properly
    let errorMessage = 'Unknown error';
    let errorStack = null;

    if (error instanceof Error) {
      errorMessage = error.message || String(error);
      errorStack = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      // Try to extract meaningful info from error object
      errorMessage = error.message || error.toString() || JSON.stringify(error).substring(0, 200);
      errorStack = error.stack;
    } else {
      errorMessage = String(error);
    }

    this.debug.lastError = {
      operation,
      error: errorMessage,
      stack: errorStack,
      context,
      timestamp: Date.now(),
    };

    const timestamp = new Date().toISOString();
    console.error(`[SoloLevelingStats:ERROR:${operation}]`, errorMessage, {
      stack: errorStack,
      context,
      timestamp,
    });

    // Also log to debug file
    console.warn(`[SoloLevelingStats:ERROR:${operation}] ${errorMessage}`, context);
  }

  // ============================================================================
  // Event Emitter System for Real-Time Updates
  // ============================================================================

  /**
   * Subscribe to an event
   * @param {string} eventName - Event name: 'xpChanged', 'levelChanged', 'rankChanged', 'statsChanged'
   * @param {Function} callback - Callback function to call when event fires
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }
    this.eventListeners[eventName].push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.eventListeners[eventName].indexOf(callback);
      if (index > -1) {
        this.eventListeners[eventName].splice(index, 1);
      }
    };
  }

  /**
   * Emit an event to all listeners
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   */
  emit(eventName, data = {}) {
    if (!this.eventListeners[eventName]) {
      return;
    }

    // Call all listeners
    this.eventListeners[eventName].forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        this.debugError('EVENT_EMIT', error, { eventName, callback: callback.name || 'anonymous' });
      }
    });
  }

  /**
   * Emit XP changed event with current state
   */
  emitXPChanged() {
    const levelInfo = this.getCurrentLevel();
    this.emit('xpChanged', {
      level: this.settings.level,
      xp: levelInfo.xp,
      xpRequired: levelInfo.xpRequired,
      totalXP: this.settings.totalXP,
      rank: this.settings.rank,
      levelInfo,
    });
  }

  /**
   * Emit level changed event
   */
  emitLevelChanged(oldLevel, newLevel) {
    const levelInfo = this.getCurrentLevel();
    this.emit('levelChanged', {
      oldLevel,
      newLevel,
      xp: levelInfo.xp,
      xpRequired: levelInfo.xpRequired,
      totalXP: this.settings.totalXP,
      rank: this.settings.rank,
      levelInfo,
    });
    // Also emit XP changed since level affects XP display
    this.emitXPChanged();
  }

  /**
   * Emit rank changed event
   */
  emitRankChanged(oldRank, newRank) {
    const levelInfo = this.getCurrentLevel();
    this.emit('rankChanged', {
      oldRank,
      newRank,
      level: this.settings.level,
      xp: levelInfo.xp,
      xpRequired: levelInfo.xpRequired,
      totalXP: this.settings.totalXP,
      levelInfo,
    });
    // Also emit XP changed since rank affects XP display
    this.emitXPChanged();
  }

  start() {
    try {
      this.debugLog('START', 'Plugin starting...');

      // Load settings
      this.loadSettings();
      this.debugLog('START', 'Settings loaded', {
        level: this.settings.level,
        rank: this.settings.rank,
        totalXP: this.settings.totalXP,
      });

      // Initialize date values if not set
      if (!this.settings.activity.lastActiveTime) {
        this.settings.activity.lastActiveTime = Date.now();
      }
      if (!this.settings.activity.sessionStartTime) {
        this.settings.activity.sessionStartTime = Date.now();
      }
      if (!this.settings.dailyQuests.lastResetDate) {
        this.settings.dailyQuests.lastResetDate = new Date().toDateString();
      }

      // Initialize rank if not set
      if (!this.settings.rank) {
        this.settings.rank = 'E';
      }
      if (!this.settings.rankHistory) {
        this.settings.rankHistory = [];
      }

      // Check for rank promotion on startup
      this.checkRankPromotion();

      this.debugLog('START', 'Plugin started successfully');

      // Verify getSettingsPanel is accessible
      if (typeof this.getSettingsPanel === 'function') {
        // OPTIMIZED: Removed verbose debug logs
        // this.debugLog('DEBUG', 'getSettingsPanel() method is accessible');
      } else {
        this.debugError('DEBUG', new Error('getSettingsPanel() method NOT FOUND!'));
      }

      // Test plugin registration after a delay
      setTimeout(() => {
        const plugin = BdApi.Plugins.get('SoloLevelingStats');
        // OPTIMIZED: Removed verbose debug logs
        // this.debugLog('DEBUG', 'Plugin lookup test', { found: !!plugin });

        // Also try to find by class name
        // OPTIMIZED: Removed verbose debug logs
        // const allPlugins = BdApi.Plugins.getAll ? BdApi.Plugins.getAll() : [];
        // this.debugLog('DEBUG', 'All plugin names', { count: allPlugins.length });
      }, 2000);
    } catch (error) {
      this.debugError('START', error, { phase: 'initialization' });
    }

    // Initialize level from total XP (in case of data migration)
    const levelInfo = this.getCurrentLevel();
    if (this.settings.level !== levelInfo.level) {
      this.settings.level = levelInfo.level;
      this.settings.xp = levelInfo.xp;
    }

    // Reset daily quests if new day
    this.checkDailyReset();

    // Track initial channel visit
    this.trackChannelVisit();

    // Start real-time channel change detection
    this.startChannelTracking();

    // Start activity tracking
    this.startActivityTracking();

    // Start message observation
    this.startObserving();

    // Start auto-save interval
    this.startAutoSave();

    // Cleanup unwanted titles from saved data
    this.cleanupUnwantedTitles();

    // Integrate with CriticalHit plugin (if available)
    this.integrateWithCriticalHit();

    // Create in-chat UI panel
    this.createChatUI();

    // OPTIMIZED: Use debugLog instead of direct console.log
    this.debugLog('START', `Started! Level ${this.settings.level}, ${this.settings.xp} XP`);
    this.debugLog('START', `Rank ${this.settings.rank}, Total XP: ${this.settings.totalXP}`);

    // Emit initial XP changed event for progress bar plugins
    this.emitXPChanged();

    // Force log to debug file
    try {
      if (BdApi && typeof BdApi.showToast === 'function') {
        BdApi.showToast(`Solo Leveling Stats enabled! Level ${this.settings.level}`, {
          type: 'success',
          timeout: 3000,
        });
      } else {
        this.debugLog('START', `Plugin enabled! Level ${this.settings.level}`);
      }
    } catch (error) {
      this.debugError('START', error, { phase: 'toast_notification' });
    }

    // Log startup to debug
    console.warn(
      `[SoloLevelingStats] Plugin initialized - Level ${this.settings.level}, Rank ${this.settings.rank}`
    );
  }

  integrateWithCriticalHit() {
    // Try to find CriticalHit plugin and enhance crit chance with Agility stat
    // Note: BetterDiscord doesn't provide direct plugin-to-plugin access
    // This integration would need to be done via a shared data store or event system
    // For now, we'll store the agility bonus in a way CriticalHit can read it

    try {
      // Validate settings exist
      if (!this.settings || !this.settings.stats) {
        this.debugError('SAVE_AGILITY_BONUS', new Error('Settings or stats not initialized'));
        return;
      }

      // Store agility bonus in BetterDiscord Data for CriticalHit to read
      // Agility scales: +2% crit chance per point (simplified scaling)
      // CRIT CHANCE CAPPED AT 25% MAX (user request)
      // Luck buffs enhance Agility bonus: (base AGI bonus) * (1 + luck multiplier)
      const agilityStat = this.settings.stats.agility || 0;
      const baseAgilityBonus = agilityStat * 0.02; // 2% per point
      const totalLuckBuff = this.getTotalLuckBuff ? this.getTotalLuckBuff() : 0;
      const luckMultiplier = totalLuckBuff / 100;
      const enhancedAgilityBonus = baseAgilityBonus * (1 + luckMultiplier); // Luck enhances Agility

      // Add title crit chance bonus
      const titleBonus = this.getActiveTitleBonus();
      const titleCritBonus = titleBonus.critChance || 0;

      // CAP CRIT CHANCE AT 25% (0.25) - includes title bonus
      const totalCritBonus = enhancedAgilityBonus + titleCritBonus;
      const cappedCritBonus = Math.min(totalCritBonus, 0.25);

      // Prepare data object (ensure all values are serializable numbers)
      const agilityData = {
        bonus: isNaN(cappedCritBonus) ? 0 : Number(cappedCritBonus.toFixed(6)),
        baseBonus: isNaN(baseAgilityBonus) ? 0 : Number(baseAgilityBonus.toFixed(6)),
        titleCritBonus: isNaN(titleCritBonus) ? 0 : Number(titleCritBonus.toFixed(6)),
        agility: agilityStat,
        luckEnhanced: totalLuckBuff > 0,
        capped: totalCritBonus > 0.25, // Indicate if it was capped
      };

      // Always save agility bonus (even if 0) so CriticalHit knows current agility
      BdApi.Data.save('SoloLevelingStats', 'agilityBonus', agilityData);

      // Only log if there's a bonus
      if (cappedCritBonus > 0) {
        const bonusParts = [];
        if (enhancedAgilityBonus > 0)
          bonusParts.push(`Agility: +${(enhancedAgilityBonus * 100).toFixed(1)}%`);
        if (titleCritBonus > 0) bonusParts.push(`Title: +${(titleCritBonus * 100).toFixed(1)}%`);
        this.debugLog(
          'AGILITY_BONUS',
          `Crit bonus available for CriticalHit: +${(cappedCritBonus * 100).toFixed(
            1
          )}% (${bonusParts.join(', ')})`
        );
      }

      // Save Luck buffs for CriticalHit to read (stacked random buffs apply to crit chance)
      try {
        let luckCritBonus = 0;
        if (
          (this.settings.stats.luck || 0) > 0 &&
          Array.isArray(this.settings.luckBuffs) &&
          this.settings.luckBuffs.length > 0
        ) {
          // Sum all stacked luck buffs for crit chance bonus
          luckCritBonus = totalLuckBuff / 100; // Convert % to decimal
        }

        const luckData = {
          bonus: isNaN(luckCritBonus) ? 0 : Number(luckCritBonus.toFixed(6)),
          luck: this.settings.stats.luck || 0,
          luckBuffs: Array.isArray(this.settings.luckBuffs) ? [...this.settings.luckBuffs] : [],
          totalBuffPercent: isNaN(luckCritBonus) ? 0 : Number((luckCritBonus * 100).toFixed(2)),
        };

        BdApi.Data.save('SoloLevelingStats', 'luckBonus', luckData);

        if (luckCritBonus > 0) {
          this.debugLog(
            'LUCK_BONUS',
            `Luck buffs available for CriticalHit: +${(luckCritBonus * 100).toFixed(
              1
            )}% crit chance (${this.settings.luckBuffs.length} stacked buffs)`
          );
        }
      } catch (error) {
        this.debugError('SAVE_LUCK_BONUS', error);
      }
    } catch (error) {
      // Error saving bonus - log but don't crash
      this.debugError('SAVE_AGILITY_BONUS', error);
    }
  }

  saveAgilityBonus() {
    // Alias for integrateWithCriticalHit for backward compatibility
    this.integrateWithCriticalHit();
  }

  createChatUI() {
    // Remove existing UI if present
    this.removeChatUI();

    // Inject CSS for chat UI
    this.injectChatUICSS();

    // Function to actually create the UI
    const tryCreateUI = () => {
      // Find the chat input area or message list container
      const messageInputArea =
        document.querySelector('[class*="channelTextArea"]') ||
        document.querySelector('[class*="textArea"]')?.parentElement ||
        document.querySelector('[class*="slateTextArea"]')?.parentElement;

      if (!messageInputArea || !messageInputArea.parentElement) {
        return false;
      }

      // Check if UI already exists
      if (document.getElementById('sls-chat-ui')) {
        return true;
      }

      // Create the UI panel
      const uiPanel = document.createElement('div');
      uiPanel.id = 'sls-chat-ui';
      uiPanel.className = 'sls-chat-panel';
      uiPanel.innerHTML = this.renderChatUI();

      // Insert before the message input area
      messageInputArea.parentElement.insertBefore(uiPanel, messageInputArea);

      // Add event listeners
      this.attachChatUIListeners(uiPanel);

      // Also attach listeners to stat buttons that were just created
      setTimeout(() => {
        this.attachStatButtonListeners(uiPanel);
      }, 100);

      // Update UI periodically
      if (!this.chatUIUpdateInterval) {
        this.chatUIUpdateInterval = setInterval(() => {
          this.updateChatUI();
        }, 2000); // Update every 2 seconds
      }

      this.chatUIPanel = uiPanel;
      return true;
    };

    // Try to create immediately
    if (!tryCreateUI()) {
      // Retry after a delay if Discord hasn't loaded yet
      const retryInterval = setInterval(() => {
        if (tryCreateUI()) {
          clearInterval(retryInterval);
        }
      }, 1000);

      // Stop retrying after 10 seconds
      setTimeout(() => clearInterval(retryInterval), 10000);
    }

    // Watch for DOM changes (channel switches, etc.)
    if (!this.chatUIObserver) {
      this.chatUIObserver = new MutationObserver(() => {
        if (!document.getElementById('sls-chat-ui')) {
          tryCreateUI();
        }
      });

      const chatContainer =
        document.querySelector('[class*="chat"]') ||
        document.querySelector('[class*="messagesWrapper"]') ||
        document.body;

      if (chatContainer) {
        this.chatUIObserver.observe(chatContainer, {
          childList: true,
          subtree: true,
        });
      }
    }
  }

  removeChatUI() {
    if (this.chatUIPanel) {
      this.chatUIPanel.remove();
      this.chatUIPanel = null;
    }
    if (this.chatUIUpdateInterval) {
      clearInterval(this.chatUIUpdateInterval);
      this.chatUIUpdateInterval = null;
    }
    if (this.chatUIObserver) {
      this.chatUIObserver.disconnect();
      this.chatUIObserver = null;
    }
  }

  renderChatUI() {
    const levelInfo = this.getCurrentLevel();
    const xpPercent = (levelInfo.xp / levelInfo.xpRequired) * 100;
    const titleBonus = this.getActiveTitleBonus();

    return `
      <div class="sls-chat-header">
        <div class="sls-chat-title">Solo Leveling</div>
        <button class="sls-chat-toggle" id="sls-chat-toggle">▼</button>
      </div>
      <div class="sls-chat-content" id="sls-chat-content">
        <!-- Level & XP -->
        <div class="sls-chat-level">
          <div class="sls-chat-level-header">
            <div class="sls-chat-rank">Rank: ${this.settings.rank}</div>
            <div class="sls-chat-level-number">Lv. ${this.settings.level}</div>
          </div>
          <div class="sls-chat-xp">
            <div class="sls-chat-xp-text">${levelInfo.xp} / ${levelInfo.xpRequired} XP</div>
            <div class="sls-chat-progress-bar">
              <div class="sls-chat-progress-fill" style="width: ${xpPercent}%"></div>
            </div>
            <div class="sls-chat-total-xp">Total: ${this.settings.totalXP.toLocaleString()} XP</div>
          </div>
        </div>

        <!-- Active Title -->
        ${
          this.settings.achievements.activeTitle
            ? `
        <div class="sls-chat-title-display">
          <span class="sls-chat-title-label">Title:</span>
          <span class="sls-chat-title-name">${this.settings.achievements.activeTitle}</span>
          ${(() => {
            const buffs = [];
            if (titleBonus.xp > 0) buffs.push(`+${(titleBonus.xp * 100).toFixed(0)}% XP`);
            if (titleBonus.critChance > 0)
              buffs.push(`+${(titleBonus.critChance * 100).toFixed(0)}% Crit`);
            if (titleBonus.strength > 0) buffs.push(`+${titleBonus.strength} STR`);
            if (titleBonus.agility > 0) buffs.push(`+${titleBonus.agility} AGI`);
            if (titleBonus.intelligence > 0) buffs.push(`+${titleBonus.intelligence} INT`);
            if (titleBonus.vitality > 0) buffs.push(`+${titleBonus.vitality} VIT`);
            if (titleBonus.luck > 0) buffs.push(`+${titleBonus.luck} LUK`);
            return buffs.length > 0
              ? `<span class="sls-chat-title-bonus">${buffs.join(', ')}</span>`
              : '';
          })()}
        </div>
        `
            : ''
        }

        <!-- Stats -->
        <div class="sls-chat-stats">
          ${this.renderChatStats()}
        </div>
        ${
          this.settings.unallocatedStatPoints > 0
            ? `
        <div class="sls-chat-stat-allocation">
          <div class="sls-chat-stat-points">${
            this.settings.unallocatedStatPoints
          } unallocated stat point${this.settings.unallocatedStatPoints > 1 ? 's' : ''}</div>
          <div class="sls-chat-stat-buttons">
            ${this.renderChatStatButtons()}
          </div>
        </div>
        `
            : ''
        }

        <!-- Collapsible Sections -->
        <div class="sls-chat-section-toggle" data-section="activity">
          <span class="sls-chat-section-title">Activity Summary</span>
          <span class="sls-chat-section-arrow">▼</span>
        </div>
        <div class="sls-chat-section" id="sls-chat-activity" style="display: none;">
          ${this.renderChatActivity()}
        </div>

        <div class="sls-chat-section-toggle" data-section="quests">
          <span class="sls-chat-section-title">Daily Quests</span>
          <span class="sls-chat-section-arrow">▼</span>
        </div>
        <div class="sls-chat-section" id="sls-chat-quests" style="display: none;">
          ${this.renderChatQuests()}
        </div>

        <div class="sls-chat-section-toggle" data-section="achievements">
          <span class="sls-chat-section-title">Achievements (${
            this.settings.achievements.unlocked.length
          } unlocked)</span>
          <span class="sls-chat-section-arrow">▼</span>
        </div>
        <div class="sls-chat-section" id="sls-chat-achievements" style="display: none;">
          ${this.renderChatAchievements()}
        </div>
      </div>
    `;
  }

  renderChatActivity() {
    // Safe access with fallbacks
    const messagesSent = this.settings?.activity?.messagesSent ?? 0;
    const charactersTyped = this.settings?.activity?.charactersTyped ?? 0;
    const channelsVisited = this.settings?.activity?.channelsVisited;
    const channelsCount =
      channelsVisited instanceof Set
        ? channelsVisited.size
        : Array.isArray(channelsVisited)
        ? channelsVisited.length
        : 0;
    const timeActive = this.settings?.activity?.timeActive ?? 0;

    return `
      <div class="sls-chat-activity-grid">
        <div class="sls-chat-activity-item">
          <div class="sls-chat-activity-label">Messages</div>
          <div class="sls-chat-activity-value">${messagesSent.toLocaleString()}</div>
        </div>
        <div class="sls-chat-activity-item">
          <div class="sls-chat-activity-label">Characters</div>
          <div class="sls-chat-activity-value">${charactersTyped.toLocaleString()}</div>
        </div>
        <div class="sls-chat-activity-item">
          <div class="sls-chat-activity-label">Channels</div>
          <div class="sls-chat-activity-value">${channelsCount}</div>
        </div>
        <div class="sls-chat-activity-item">
          <div class="sls-chat-activity-label">Time Active</div>
          <div class="sls-chat-activity-value">${Math.round(timeActive / 60)}h ${Math.round(
      timeActive % 60
    )}m</div>
        </div>
      </div>
    `;
  }

  renderChatQuests() {
    const quests = [
      {
        id: 'messageMaster',
        name: 'Message Master',
        desc: 'Send 20 messages',
        quest: this.settings.dailyQuests.quests.messageMaster,
      },
      {
        id: 'characterChampion',
        name: 'Character Champion',
        desc: 'Type 1,000 characters',
        quest: this.settings.dailyQuests.quests.characterChampion,
      },
      {
        id: 'channelExplorer',
        name: 'Channel Explorer',
        desc: 'Visit 5 unique channels',
        quest: this.settings.dailyQuests.quests.channelExplorer,
      },
      {
        id: 'activeAdventurer',
        name: 'Active Adventurer',
        desc: 'Be active for 30 minutes',
        quest: this.settings.dailyQuests.quests.activeAdventurer,
      },
      {
        id: 'perfectStreak',
        name: 'Perfect Streak',
        desc: 'Send 10 messages',
        quest: this.settings.dailyQuests.quests.perfectStreak,
      },
    ];

    return quests
      .map(({ id, name, desc, quest }) => {
        const percentage = (quest.progress / quest.target) * 100;
        return `
        <div class="sls-chat-quest-item ${quest.completed ? 'sls-chat-quest-complete' : ''}">
          <div class="sls-chat-quest-header">
            <span class="sls-chat-quest-name">${name}</span>
            <span class="sls-chat-quest-progress">${quest.progress}/${quest.target}</span>
          </div>
          <div class="sls-chat-quest-desc">${desc}</div>
          <div class="sls-chat-progress-bar">
            <div class="sls-chat-progress-fill" style="width: ${percentage}%"></div>
          </div>
          ${quest.completed ? '<div class="sls-chat-quest-badge">Complete</div>' : ''}
        </div>
      `;
      })
      .join('');
  }

  renderChatAchievements() {
    const achievements = this.getAchievementDefinitions();
    const unlockedCount = this.settings.achievements.unlocked.length;
    const totalCount = achievements.length;

    // Show only unlocked achievements in chat (to keep it brief)
    const unlockedAchievements = achievements
      .filter((a) => this.settings.achievements.unlocked.includes(a.id))
      .slice(0, 5); // Show max 5 unlocked achievements

    return `
      <div class="sls-chat-achievements-summary">
        <div class="sls-chat-achievements-count">${unlockedCount} / ${totalCount} unlocked</div>
        ${
          unlockedAchievements.length > 0
            ? `
        <div class="sls-chat-achievements-list">
          ${unlockedAchievements
            .map(
              (a) => `
            <div class="sls-chat-achievement-item">
              <span class="sls-chat-achievement-icon">[+]</span>
              <span class="sls-chat-achievement-name">${a.name}</span>
            </div>
          `
            )
            .join('')}
        </div>
        `
            : '<div class="sls-chat-achievements-empty">No achievements unlocked yet</div>'
        }
      </div>
    `;
  }

  renderChatStatButtons() {
    const stats = [
      { key: 'strength', name: 'STR', fullName: 'Strength', desc: '+5% XP' },
      {
        key: 'agility',
        name: 'AGI',
        fullName: 'Agility',
        desc: '+2% Crit (capped 25%), +1% EXP/Crit',
      },
      { key: 'intelligence', name: 'INT', fullName: 'Intelligence', desc: '+10% Long Msg' },
      { key: 'vitality', name: 'VIT', fullName: 'Vitality', desc: '+5% Quests' },
      { key: 'luck', name: 'LUK', fullName: 'Luck', desc: 'Random buff stacks' },
    ];

    return stats
      .map((stat) => {
        const currentValue = this.settings.stats[stat.key];
        const isMaxed = currentValue >= 20;
        const canAllocate = this.settings.unallocatedStatPoints > 0 && !isMaxed;

        return `
        <button
          class="sls-chat-stat-btn ${isMaxed ? 'sls-chat-stat-btn-maxed' : ''} ${
          canAllocate ? 'sls-chat-stat-btn-available' : ''
        }"
          data-stat="${stat.key}"
          ${!canAllocate ? 'disabled' : ''}
          title="${stat.fullName}: ${currentValue}/20${isMaxed ? ' (MAXED)' : ''} - ${
          stat.desc
        } per point"
        >
          <div class="sls-chat-stat-btn-name">${stat.name}</div>
          <div class="sls-chat-stat-btn-value">${currentValue}</div>
          ${canAllocate ? '<div class="sls-chat-stat-btn-plus">+</div>' : ''}
        </button>
      `;
      })
      .join('');
  }

  renderChatStats() {
    const statDefs = {
      strength: { name: 'STR', desc: '+5% XP/msg', gain: 'Send messages' },
      agility: {
        name: 'AGI',
        desc: '+2% crit chance (capped 25%), +1% EXP per point during crit hits',
        gain: 'Send messages',
      },
      intelligence: { name: 'INT', desc: '+10% long msg XP', gain: 'Long messages' },
      vitality: { name: 'VIT', desc: '+5% quest rewards', gain: 'Complete quests' },
      luck: { name: 'LUK', desc: 'Random buff per point (stacks)', gain: 'Allocate stat points' },
    };

    return Object.entries(this.settings.stats)
      .map(([key, value]) => {
        const def = statDefs[key];
        return `
        <div class="sls-chat-stat-item" data-stat="${key}">
          <span class="sls-chat-stat-name">${def.name}</span>
          <span class="sls-chat-stat-value">${value}</span>
          <div class="sls-chat-stat-tooltip">
            <div class="sls-tooltip-title">${def.name}</div>
            <div class="sls-tooltip-desc">${def.desc}</div>
            <div class="sls-tooltip-gain">Gain: ${def.gain}</div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  attachChatUIListeners(panel) {
    // Main toggle button
    const toggleBtn = panel.querySelector('#sls-chat-toggle');
    const content = panel.querySelector('#sls-chat-content');

    if (toggleBtn && content) {
      // Check initial state - if no inline style, it's expanded by default
      const isCurrentlyExpanded =
        content.style.display !== 'none' &&
        (content.style.display === '' ||
          content.style.display === 'block' ||
          window.getComputedStyle(content).display !== 'none');

      // Set initial arrow state
      toggleBtn.textContent = isCurrentlyExpanded ? '▼' : '▲';

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        // Toggle content visibility
        const isExpanded =
          content.style.display !== 'none' &&
          (content.style.display === '' ||
            content.style.display === 'block' ||
            window.getComputedStyle(content).display !== 'none');

        content.style.display = isExpanded ? 'none' : 'block';
        toggleBtn.textContent = isExpanded ? '▲' : '▼';

        // OPTIMIZED: Removed verbose logging for GUI toggle (happens frequently)
        // this.debugLog('CHAT_GUI', 'Chat GUI toggled', { wasExpanded: isExpanded, nowExpanded: !isExpanded });
      });
    }

    // Section toggles
    panel.querySelectorAll('.sls-chat-section-toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const sectionId = toggle.dataset.section;
        const section = panel.querySelector(`#sls-chat-${sectionId}`);
        const arrow = toggle.querySelector('.sls-chat-section-arrow');

        if (section) {
          const isExpanded = section.style.display !== 'none';
          section.style.display = isExpanded ? 'none' : 'block';
          if (arrow) arrow.textContent = isExpanded ? '▼' : '▲';
        }
      });
    });

    // Stat tooltips
    panel.querySelectorAll('.sls-chat-stat-item').forEach((item) => {
      item.addEventListener('mouseenter', (e) => {
        const tooltip = item.querySelector('.sls-chat-stat-tooltip');
        if (tooltip) tooltip.style.display = 'block';
      });
      item.addEventListener('mouseleave', (e) => {
        const tooltip = item.querySelector('.sls-chat-stat-tooltip');
        if (tooltip) tooltip.style.display = 'none';
      });
    });

    // Stat allocation buttons (if points available)
    panel.querySelectorAll('.sls-chat-stat-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (this.settings.unallocatedStatPoints > 0) {
          const statName = item.dataset.stat;
          this.allocateStatPoint(statName);
          this.updateChatUI();
        }
      });
    });

    // Attach stat button listeners
    this.attachStatButtonListeners(panel);
  }

  attachStatButtonListeners(panel) {
    // Stat allocation buttons in chat UI (the new buttons)
    // Use a WeakSet to track which buttons have listeners (more reliable than attributes)
    if (!this._buttonListenersSet) {
      this._buttonListenersSet = new WeakSet();
    }

    const allButtons = panel ? panel.querySelectorAll('.sls-chat-stat-btn') : [];
    const buttons = Array.from(allButtons).filter((btn) => !this._buttonListenersSet.has(btn));

    // Only log if there are NEW buttons to attach (reduce noise)
    if (buttons.length > 0) {
      this.debugLog('ATTACH_STAT_BUTTONS', 'Attaching listeners to stat buttons', {
        buttonCount: buttons.length,
        totalButtons: allButtons.length,
        hasPanel: !!panel,
        panelId: panel?.id,
      });
    }

    if (buttons.length === 0) {
      // No new buttons to attach
      return;
    }

    buttons.forEach((btn, index) => {
      // Mark as having listener attached using WeakSet (survives re-renders better)
      this._buttonListenersSet.add(btn);
      btn.setAttribute('data-listener-attached', 'true'); // Also set attribute for CSS selectors

      const statName = btn.getAttribute('data-stat');
      this.debugLog('ATTACH_STAT_BUTTONS', 'Attaching listener to button', {
        index,
        statName,
        hasStatName: !!statName,
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const clickedStatName = btn.getAttribute('data-stat');
        this.debugLog('STAT_ALLOCATION', 'Button clicked', {
          statName: clickedStatName,
          hasStatName: !!clickedStatName,
          unallocatedPoints: this.settings.unallocatedStatPoints,
          buttonClasses: btn.className,
          buttonHTML: btn.outerHTML.substring(0, 150),
          allAttributes: Array.from(btn.attributes)
            .map((a) => `${a.name}="${a.value}"`)
            .join(', '),
        });
        if (clickedStatName && this.allocateStatPoint(clickedStatName)) {
          // Update UI immediately
          this.updateChatUI();
        } else if (!clickedStatName) {
          this.debugError('STAT_ALLOCATION', new Error('No stat name found on button'), {
            buttonHTML: btn.outerHTML.substring(0, 200),
            allAttributes: Array.from(btn.attributes)
              .map((a) => `${a.name}="${a.value}"`)
              .join(', '),
          });
        }
      });
    });
  }

  updateChatUI() {
    if (!this.chatUIPanel) return;

    const levelInfo = this.getCurrentLevel();
    const xpPercent = (levelInfo.xp / levelInfo.xpRequired) * 100;

    // Update rank display
    const rankEl = this.chatUIPanel.querySelector('.sls-chat-rank');
    if (rankEl) rankEl.textContent = `Rank: ${this.settings.rank}`;

    // Update level display
    const levelNumber = this.chatUIPanel.querySelector('.sls-chat-level-number');
    if (levelNumber) levelNumber.textContent = `Lv. ${this.settings.level}`;

    // Update XP display
    const xpText = this.chatUIPanel.querySelector('.sls-chat-xp-text');
    if (xpText) xpText.textContent = `${levelInfo.xp} / ${levelInfo.xpRequired} XP`;

    // Update total XP
    const totalXPEl = this.chatUIPanel.querySelector('.sls-chat-total-xp');
    if (totalXPEl) totalXPEl.textContent = `Total: ${this.settings.totalXP.toLocaleString()} XP`;

    // Update progress bar
    const progressFill = this.chatUIPanel.querySelector('.sls-chat-progress-fill');
    if (progressFill) progressFill.style.width = `${xpPercent}%`;

    // Update active title
    const titleDisplay = this.chatUIPanel.querySelector('.sls-chat-title-display');
    const titleBonus = this.getActiveTitleBonus();
    if (this.settings.achievements.activeTitle) {
      if (!titleDisplay) {
        // Re-render title section if it doesn't exist
        const levelSection = this.chatUIPanel.querySelector('.sls-chat-level');
        if (levelSection && levelSection.nextElementSibling) {
          const titleDiv = document.createElement('div');
          titleDiv.className = 'sls-chat-title-display';
          titleDiv.innerHTML = `
            <span class="sls-chat-title-label">Title:</span>
            <span class="sls-chat-title-name">${this.settings.achievements.activeTitle}</span>
            ${
              titleBonus.xp > 0
                ? `<span class="sls-chat-title-bonus">+${(titleBonus.xp * 100).toFixed(
                    0
                  )}% XP</span>`
                : ''
            }
          `;
          levelSection.parentElement.insertBefore(titleDiv, levelSection.nextElementSibling);
        }
      } else {
        const titleName = titleDisplay.querySelector('.sls-chat-title-name');
        const titleBonusEl = titleDisplay.querySelector('.sls-chat-title-bonus');
        if (titleName) titleName.textContent = this.settings.achievements.activeTitle;
        if (titleBonusEl && titleBonus.xp > 0) {
          titleBonusEl.textContent = `+${(titleBonus.xp * 100).toFixed(0)}% XP`;
        }
      }
    } else if (titleDisplay) {
      titleDisplay.remove();
    }

    // Update stat values
    this.chatUIPanel.querySelectorAll('.sls-chat-stat-item').forEach((item) => {
      const statName = item.dataset.stat;
      const valueEl = item.querySelector('.sls-chat-stat-value');
      if (valueEl) valueEl.textContent = this.settings.stats[statName];
    });

    // Update stat button values
    this.chatUIPanel.querySelectorAll('.sls-chat-stat-btn').forEach((btn) => {
      const statName = btn.dataset.stat;
      const valueEl = btn.querySelector('.sls-chat-stat-btn-value');
      if (valueEl) {
        valueEl.textContent = this.settings.stats[statName];
      }
      // Update button state
      const currentValue = this.settings.stats[statName];
      const isMaxed = currentValue >= 20;
      const canAllocate = this.settings.unallocatedStatPoints > 0 && !isMaxed;
      btn.disabled = !canAllocate;
      btn.classList.toggle('sls-chat-stat-btn-maxed', isMaxed);
      btn.classList.toggle('sls-chat-stat-btn-available', canAllocate);
      // Update plus indicator
      const plusEl = btn.querySelector('.sls-chat-stat-btn-plus');
      if (plusEl) {
        plusEl.style.display = canAllocate ? 'block' : 'none';
      }
    });

    // Update unallocated points and stat allocation section
    const statAllocationEl = this.chatUIPanel.querySelector('.sls-chat-stat-allocation');
    if (this.settings.unallocatedStatPoints > 0) {
      if (!statAllocationEl) {
        const content = this.chatUIPanel.querySelector('#sls-chat-content');
        if (content) {
          const allocationDiv = document.createElement('div');
          allocationDiv.className = 'sls-chat-stat-allocation';
          allocationDiv.innerHTML = `
            <div class="sls-chat-stat-points">${
              this.settings.unallocatedStatPoints
            } unallocated stat point${this.settings.unallocatedStatPoints > 1 ? 's' : ''}</div>
            <div class="sls-chat-stat-buttons">
              ${this.renderChatStatButtons()}
            </div>
          `;
          // Insert after stats section
          const statsSection = content.querySelector('.sls-chat-stats');
          if (statsSection && statsSection.nextSibling) {
            content.insertBefore(allocationDiv, statsSection.nextSibling);
          } else {
            content.appendChild(allocationDiv);
          }
          // Re-attach event listeners
          this.attachChatUIListeners(this.chatUIPanel);
        }
      } else {
        // Update existing allocation section
        const pointsEl = statAllocationEl.querySelector('.sls-chat-stat-points');
        const buttonsEl = statAllocationEl.querySelector('.sls-chat-stat-buttons');
        if (pointsEl) {
          pointsEl.textContent = `${this.settings.unallocatedStatPoints} unallocated stat point${
            this.settings.unallocatedStatPoints > 1 ? 's' : ''
          }`;
        }
        if (buttonsEl) {
          // Only re-render buttons if they don't exist (prevent unnecessary re-renders)
          const existingButtons = buttonsEl.querySelectorAll('.sls-chat-stat-btn');

          if (existingButtons.length === 0) {
            // No buttons exist, create them
            buttonsEl.innerHTML = this.renderChatStatButtons();
            this.attachStatButtonListeners(this.chatUIPanel);
          } else {
            // Buttons exist, just update values and state without re-rendering
            existingButtons.forEach((btn) => {
              const statName = btn.getAttribute('data-stat');
              if (!statName) return;

              const valueEl = btn.querySelector('.sls-chat-stat-btn-value');
              if (valueEl) {
                valueEl.textContent = this.settings.stats[statName] || 0;
              }

              // Update button state
              const currentValue = this.settings.stats[statName] || 0;
              const isMaxed = currentValue >= 20;
              const canAllocate = this.settings.unallocatedStatPoints > 0 && !isMaxed;
              btn.disabled = !canAllocate;
              btn.classList.toggle('sls-chat-stat-btn-maxed', isMaxed);
              btn.classList.toggle('sls-chat-stat-btn-available', canAllocate);

              // Update plus indicator
              let plusEl = btn.querySelector('.sls-chat-stat-btn-plus');
              if (canAllocate && !plusEl) {
                plusEl = document.createElement('div');
                plusEl.className = 'sls-chat-stat-btn-plus';
                plusEl.textContent = '+';
                btn.appendChild(plusEl);
              } else if (!canAllocate && plusEl) {
                plusEl.remove();
              }

              // Update title
              const statDefs = {
                strength: { fullName: 'Strength', desc: '+5% XP' },
                agility: { fullName: 'Agility', desc: '+2% Crit (capped 25%), +1% EXP/Crit' },
                intelligence: { fullName: 'Intelligence', desc: '+10% Long Msg' },
                vitality: { fullName: 'Vitality', desc: '+5% Quests' },
                luck: { fullName: 'Luck', desc: 'Random buff stacks' },
              };
              const def = statDefs[statName];
              if (def) {
                btn.title = `${def.fullName}: ${currentValue}/20${isMaxed ? ' (MAXED)' : ''} - ${
                  def.desc
                } per point`;
              }
            });
          }
        }
        statAllocationEl.style.display = 'block';
      }
    } else if (statAllocationEl) {
      statAllocationEl.style.display = 'none';
    }

    // Update activity section if visible
    const activitySection = this.chatUIPanel.querySelector('#sls-chat-activity');
    if (activitySection && activitySection.style.display !== 'none') {
      activitySection.innerHTML = this.renderChatActivity();
    }

    // Update quests section if visible
    const questsSection = this.chatUIPanel.querySelector('#sls-chat-quests');
    if (questsSection && questsSection.style.display !== 'none') {
      questsSection.innerHTML = this.renderChatQuests();
    }

    // Update achievements section if visible
    const achievementsSection = this.chatUIPanel.querySelector('#sls-chat-achievements');
    if (achievementsSection && achievementsSection.style.display !== 'none') {
      achievementsSection.innerHTML = this.renderChatAchievements();
    }

    // Update achievements count in toggle
    const achievementsToggle = this.chatUIPanel.querySelector(
      '[data-section="achievements"] .sls-chat-section-title'
    );
    if (achievementsToggle) {
      const count = this.settings.achievements.unlocked.length;
      achievementsToggle.textContent = `Achievements (${count} unlocked)`;
    }
  }

  injectChatUICSS() {
    if (document.getElementById('sls-chat-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'sls-chat-ui-styles';
    style.textContent = `
      .sls-chat-panel {
        position: relative;
        margin: 6px 16px 8px 16px;
        background: linear-gradient(135deg, rgba(10, 10, 15, 0.95) 0%, rgba(15, 15, 26, 0.95) 100%);
        border: 1px solid rgba(138, 43, 226, 0.5);
        border-radius: 10px;
        padding: 10px 12px;
        box-shadow: 0 0 8px rgba(138, 43, 226, 0.4), inset 0 0 20px rgba(138, 43, 226, 0.1);
        z-index: 1000;
        font-family: 'Orbitron', 'Segoe UI', sans-serif;
        backdrop-filter: blur(8px);
      }

      .sls-chat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(138, 43, 226, 0.2);
      }

      .sls-chat-title {
        color: #d4a5ff;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.5px;
        text-shadow: 0 0 6px rgba(138, 43, 226, 0.9), 0 0 12px rgba(138, 43, 226, 0.5);
      }

      .sls-chat-toggle {
        background: rgba(138, 43, 226, 0.15);
        border: 1px solid rgba(138, 43, 226, 0.3);
        color: #b894e6;
        cursor: pointer;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 5px;
        transition: all 0.2s ease;
        min-width: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .sls-chat-toggle:hover {
        background: rgba(138, 43, 226, 0.25);
        border-color: rgba(138, 43, 226, 0.5);
        color: #d4a5ff;
        box-shadow: 0 0 6px rgba(138, 43, 226, 0.4);
        transform: translateY(-1px);
      }

      .sls-chat-content {
        display: block;
      }

      .sls-chat-level {
        margin-bottom: 10px;
      }

      .sls-chat-level-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }

      .sls-chat-rank {
        font-size: 12px;
        font-weight: 700;
        color: #ba55d3;
        text-shadow: 0 0 5px rgba(138, 43, 226, 0.9);
        padding: 3px 8px;
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.2) 0%, rgba(75, 0, 130, 0.15) 100%);
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 5px;
        display: inline-block;
        box-shadow: 0 0 4px rgba(138, 43, 226, 0.3);
      }

      .sls-chat-level-number {
        font-size: 18px;
        font-weight: 800;
        color: #d4a5ff;
        text-shadow: 0 0 6px rgba(138, 43, 226, 1), 0 0 12px rgba(138, 43, 226, 0.6);
        letter-spacing: 0.5px;
      }

      .sls-chat-xp {
        margin-bottom: 10px;
      }

      .sls-chat-xp-text {
        font-size: 10px;
        color: #b894e6;
        margin-bottom: 5px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
        font-weight: 600;
      }

      .sls-chat-progress-bar {
        width: 100%;
        height: 6px;
        background: rgba(10, 10, 15, 0.9);
        border-radius: 3px;
        overflow: visible;
        border: none !important; /* Remove border that creates glow */
        box-shadow: none !important;
        filter: none !important;
        position: relative;
      }

      .sls-chat-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #8a2be2 0%, #9370db 50%, #ba55d3 100%);
        transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        border-radius: 3px;
        /* COMPLETE GLOW REMOVAL - ALL POSSIBLE SOURCES */
        box-shadow: none !important;
        filter: none !important;
        outline: none !important;
        border: none !important;
        text-shadow: none !important;
        drop-shadow: none !important;
        -webkit-box-shadow: none !important;
        -moz-box-shadow: none !important;
        -webkit-filter: none !important;
        -moz-filter: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      /* Force remove glow from ALL states and pseudo-elements */
      .sls-chat-progress-fill *,
      .sls-chat-progress-fill::before,
      .sls-chat-progress-fill::after,
      .sls-chat-progress-fill:hover,
      .sls-chat-progress-fill:active,
      .sls-chat-progress-fill:focus {
        box-shadow: none !important;
        filter: none !important;
        text-shadow: none !important;
        outline: none !important;
        border: none !important;
      }

      /* Purple glow shimmer completely disabled */
      .sls-chat-progress-fill::after {
        display: none !important;
        content: none !important;
        background: none !important;
        animation: none !important;
      }

      /* Purple glow overlay completely disabled */
      .sls-chat-progress-fill::before {
        display: none !important;
        content: none !important;
        background: none !important;
        animation: none !important;
      }

      /* Sparkle particles */
      .sls-chat-progress-bar .sls-progress-sparkle {
        position: absolute;
        width: 4px;
        height: 4px;
        background: rgba(186, 85, 211, 0.9);
        border-radius: 50%;
        pointer-events: none;
        animation: sparkle-float 2s infinite;
        box-shadow: 0 0 6px rgba(186, 85, 211, 0.8);
      }

      /* Milestone markers */
      .sls-chat-progress-bar .sls-milestone-marker {
        position: absolute;
        top: -8px;
        width: 2px;
        height: 22px;
        background: rgba(139, 92, 246, 0.5);
        pointer-events: none;
        z-index: 1;
      }

      .sls-chat-progress-bar .sls-milestone-marker::after {
        content: '';
        position: absolute;
        top: -4px;
        left: -3px;
        width: 8px;
        height: 8px;
        background: rgba(139, 92, 246, 0.8);
        border-radius: 50%;
        box-shadow: 0 0 6px rgba(139, 92, 246, 0.6);
      }

      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }

      @keyframes sparkle {
        0%, 100% { opacity: 0; }
        50% { opacity: 1; }
      }

      @keyframes sparkle-float {
        0% {
          opacity: 0;
          transform: translateY(0) scale(0);
        }
        50% {
          opacity: 1;
          transform: translateY(-10px) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateY(-20px) scale(0);
        }
      }

      /* Quest celebration styles */
      .sls-quest-celebration {
        position: fixed;
        z-index: 100000;
        pointer-events: none;
        animation: quest-celebration-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .sls-quest-celebration-content {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.95) 0%, rgba(109, 40, 217, 0.95) 100%);
        border: 3px solid rgba(255, 255, 255, 0.8);
        border-radius: 16px;
        padding: 30px 40px;
        text-align: center;
        box-shadow: 0 0 30px rgba(139, 92, 246, 0.8),
                    0 0 60px rgba(139, 92, 246, 0.5),
                    inset 0 0 20px rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(10px);
      }

      .sls-quest-celebration-icon {
        font-size: 64px;
        animation: quest-icon-bounce 0.6s ease-out;
        margin-bottom: 10px;
      }

      .sls-quest-celebration-text {
        font-family: 'Press Start 2P', monospace;
        font-size: 20px;
        color: #ffffff;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.8),
                     0 0 20px rgba(139, 92, 246, 0.8);
        margin-bottom: 10px;
        animation: quest-text-glow 1s ease-in-out infinite;
      }

      .sls-quest-celebration-name {
        font-size: 18px;
        color: rgba(255, 255, 255, 0.9);
        font-weight: bold;
        margin-bottom: 15px;
      }

      .sls-quest-celebration-rewards {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 15px;
      }

      .sls-quest-reward-item {
        font-size: 16px;
        color: #00ff88;
        font-weight: bold;
        text-shadow: 0 0 8px rgba(0, 255, 136, 0.6);
        animation: quest-reward-pop 0.4s ease-out 0.2s both;
      }

      .sls-quest-particle {
        position: absolute;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        pointer-events: none;
        animation: quest-particle-burst 2s ease-out forwards;
      }

      .sls-quest-celebrating {
        animation: quest-card-pulse 0.5s ease-out;
        box-shadow: 0 0 20px rgba(139, 92, 246, 0.8) !important;
      }

      @keyframes quest-celebration-pop {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.3);
        }
        50% {
          transform: translate(-50%, -50%) scale(1.1);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      @keyframes quest-icon-bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-20px); }
      }

      @keyframes quest-text-glow {
        0%, 100% {
          text-shadow: 0 0 10px rgba(255, 255, 255, 0.8),
                       0 0 20px rgba(139, 92, 246, 0.8);
        }
        50% {
          text-shadow: 0 0 20px rgba(255, 255, 255, 1),
                       0 0 40px rgba(139, 92, 246, 1);
        }
      }

      @keyframes quest-reward-pop {
        0% {
          opacity: 0;
          transform: scale(0);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes quest-particle-burst {
        0% {
          opacity: 1;
          transform: translate(0, 0) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(var(--particle-x, 0), var(--particle-y, 0)) scale(0);
        }
      }

      @keyframes quest-card-pulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.05);
        }
      }

      .sls-chat-stats {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      .sls-chat-stat-item {
        position: relative;
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.12) 0%, rgba(75, 0, 130, 0.08) 100%);
        border: 1px solid rgba(138, 43, 226, 0.35);
        border-radius: 5px;
        padding: 5px 9px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        gap: 5px;
        align-items: center;
        backdrop-filter: blur(4px);
      }

      .sls-chat-stat-item:hover {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.22) 0%, rgba(75, 0, 130, 0.15) 100%);
        border-color: rgba(138, 43, 226, 0.6);
        box-shadow: 0 0 6px rgba(138, 43, 226, 0.5);
        transform: translateY(-1px);
      }

      .sls-chat-stat-name {
        color: #d4a5ff;
        font-weight: 700;
        font-size: 11px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-stat-value {
        color: #ba55d3;
        font-weight: 700;
        font-size: 12px;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.7);
      }

      .sls-chat-stat-tooltip {
        display: none;
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 8px;
        background: rgba(10, 10, 15, 0.95);
        border: 1px solid rgba(138, 43, 226, 0.6);
        border-radius: 8px;
        padding: 8px 12px;
        min-width: 150px;
        box-shadow: 0 0 6px rgba(138, 43, 226, 0.5);
        z-index: 1001;
        pointer-events: none;
      }

      .sls-tooltip-title {
        color: #d4a5ff;
        font-weight: 700;
        font-size: 12px;
        margin-bottom: 4px;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.7);
      }

      .sls-tooltip-desc {
        color: #b894e6;
        font-size: 11px;
        margin-bottom: 4px;
      }

      .sls-tooltip-gain {
        color: #a78bfa;
        font-size: 10px;
        font-style: italic;
      }

      .sls-chat-stat-points {
        background: rgba(138, 43, 226, 0.2);
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 6px;
        padding: 6px 10px;
        color: #d4a5ff;
        font-weight: 700;
        font-size: 11px;
        text-align: center;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.8);
        box-shadow: 0 0 5px rgba(138, 43, 226, 0.3);
        margin-bottom: 8px;
      }

      .sls-chat-stat-allocation {
        margin-top: 12px;
        margin-bottom: 12px;
      }

      .sls-chat-stat-buttons {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: center;
        margin-top: 8px;
      }

      .sls-chat-stat-btn {
        position: relative;
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.15) 0%, rgba(75, 0, 130, 0.1) 100%);
        border: 1px solid rgba(138, 43, 226, 0.3);
        border-radius: 6px;
        padding: 8px 12px;
        min-width: 50px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .sls-chat-stat-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.3) 0%, rgba(75, 0, 130, 0.2) 100%);
        border-color: rgba(138, 43, 226, 0.6);
        box-shadow: 0 0 5px rgba(138, 43, 226, 0.5);
        transform: translateY(-2px);
      }

      .sls-chat-stat-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .sls-chat-stat-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .sls-chat-stat-btn-available {
        border-color: rgba(138, 43, 226, 0.5);
        box-shadow: 0 0 4px rgba(138, 43, 226, 0.3);
      }

      .sls-chat-stat-btn-maxed {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.25) 0%, rgba(75, 0, 130, 0.15) 100%);
        border-color: rgba(138, 43, 226, 0.7);
        box-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
      }

      .sls-chat-stat-btn-name {
        color: #b894e6;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.5);
      }

      .sls-chat-stat-btn-value {
        color: #d4a5ff;
        font-size: 14px;
        font-weight: 700;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.7);
      }

      .sls-chat-stat-btn-plus {
        position: absolute;
        top: 2px;
        right: 4px;
        color: #22c55e;
        font-size: 12px;
        font-weight: 700;
        text-shadow: 0 0 4px rgba(34, 197, 94, 0.8);
      }

      .sls-chat-total-xp {
        font-size: 10px;
        color: #a78bfa;
        margin-top: 4px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
      }

      .sls-chat-title-display {
        background: rgba(138, 43, 226, 0.15);
        border: 1px solid rgba(138, 43, 226, 0.3);
        border-radius: 6px;
        padding: 6px 10px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .sls-chat-title-label {
        color: #b894e6;
        font-size: 11px;
        font-weight: 600;
      }

      .sls-chat-title-name {
        color: #d4a5ff;
        font-weight: 700;
        font-size: 12px;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.7);
      }

      .sls-chat-title-bonus {
        color: #ba55d3;
        font-size: 10px;
        font-weight: 600;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-section-toggle {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        margin: 8px 0 4px 0;
        background: rgba(138, 43, 226, 0.1);
        border: 1px solid rgba(138, 43, 226, 0.3);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .sls-chat-section-toggle:hover {
        background: rgba(138, 43, 226, 0.2);
        border-color: rgba(138, 43, 226, 0.5);
      }

      .sls-chat-section-title {
        color: #d4a5ff;
        font-weight: 700;
        font-size: 12px;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-section-arrow {
        color: #b894e6;
        font-size: 10px;
      }

      .sls-chat-section {
        margin-bottom: 8px;
        padding: 8px;
        background: rgba(138, 43, 226, 0.05);
        border-radius: 6px;
      }

      .sls-chat-activity-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }

      .sls-chat-activity-item {
        background: rgba(138, 43, 226, 0.1);
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-radius: 6px;
        padding: 8px;
        text-align: center;
      }

      .sls-chat-activity-label {
        font-size: 10px;
        color: #b894e6;
        margin-bottom: 4px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
      }

      .sls-chat-activity-value {
        font-size: 16px;
        font-weight: 700;
        color: #d4a5ff;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.7);
      }

      .sls-chat-quest-item {
        background: rgba(138, 43, 226, 0.08);
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-left: 3px solid rgba(138, 43, 226, 0.4);
        border-radius: 6px;
        padding: 8px;
        margin-bottom: 6px;
        position: relative;
      }

      .sls-chat-quest-item.sls-chat-quest-complete {
        border-left-color: #00ff88;
        background: rgba(0, 255, 136, 0.1);
      }

      .sls-chat-quest-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
      }

      .sls-chat-quest-name {
        color: #d4a5ff;
        font-weight: 600;
        font-size: 11px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-quest-progress {
        color: #ba55d3;
        font-weight: 600;
        font-size: 11px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-quest-desc {
        font-size: 10px;
        color: #b894e6;
        margin-bottom: 6px;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.4);
      }

      .sls-chat-quest-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        color: #00ff88;
        font-weight: 700;
        font-size: 14px;
        text-shadow: 0 0 4px rgba(0, 255, 136, 0.8);
      }

      .sls-chat-achievements-summary {
        padding: 4px 0;
      }

      .sls-chat-achievements-count {
        color: #d4a5ff;
        font-weight: 700;
        font-size: 11px;
        margin-bottom: 8px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-achievements-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .sls-chat-achievement-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px;
        background: rgba(138, 43, 226, 0.1);
        border: 1px solid rgba(138, 43, 226, 0.3);
        border-radius: 6px;
      }

      .sls-chat-achievement-icon {
        color: #00ff88;
        font-weight: 700;
        font-size: 12px;
        text-shadow: 0 0 6px rgba(0, 255, 136, 0.7);
      }

      .sls-chat-achievement-name {
        color: #d4a5ff;
        font-weight: 600;
        font-size: 11px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.6);
      }

      .sls-chat-achievements-empty {
        color: #b894e6;
        font-size: 10px;
        font-style: italic;
        text-align: center;
        padding: 8px;
      }
    `;

    document.head.appendChild(style);
  }

  stop() {
    // Stop observing
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }

    if (this.activityTracker) {
      clearInterval(this.activityTracker);
      this.activityTracker = null;
    }

    // Stop channel tracking
    if (this.channelTrackingInterval) {
      clearInterval(this.channelTrackingInterval);
      this.channelTrackingInterval = null;
      this.debugLog('STOP', 'Channel tracking stopped');
    }

    // Remove event listeners
    if (this.messageInputHandler) {
      const messageInput =
        document.querySelector('[class*="slateTextArea"]') ||
        document.querySelector('[class*="textArea"]') ||
        document.querySelector('textarea[placeholder*="Message"]');
      if (messageInput && this.messageInputHandler.handleKeyDown) {
        messageInput.removeEventListener('keydown', this.messageInputHandler.handleKeyDown);
        messageInput.removeEventListener('input', this.messageInputHandler.handleInput);
      }
      if (this.messageInputHandler.observer) {
        this.messageInputHandler.observer.disconnect();
      }
      this.messageInputHandler = null;
    }

    // Remove chat UI
    this.removeChatUI();

    // Save before stopping
    this.saveSettings(true);

    this.debugLog('STOP', 'Plugin stopped');
  }

  loadSettings() {
    try {
      this.debugLog('LOAD_SETTINGS', 'Attempting to load settings...');

      // Try to load main settings
      let saved = null;
      try {
        saved = BdApi.Data.load('SoloLevelingStats', 'settings');
        this.debugLog('LOAD_SETTINGS', 'Main settings load attempt', { success: !!saved });
      } catch (error) {
        this.debugError('LOAD_SETTINGS', error, { phase: 'main_load' });
      }

      // If main save failed, try backup
      if (!saved) {
        this.debugLog('LOAD_SETTINGS', 'Main save not found, trying backup...');
        try {
          saved = BdApi.Data.load('SoloLevelingStats', 'settings_backup');
          if (saved) {
            this.debugLog('LOAD_SETTINGS', 'Successfully loaded from backup');
          }
        } catch (error) {
          this.debugError('LOAD_SETTINGS', error, { phase: 'backup_load' });
        }
      }

      if (saved && typeof saved === 'object') {
        try {
          this.settings = { ...this.defaultSettings, ...saved };
          this.debugLog('LOAD_SETTINGS', 'Settings merged', {
            level: this.settings.level,
            rank: this.settings.rank,
            totalXP: this.settings.totalXP,
          });

          // Migrate old data structures if needed
          this.migrateData();

          // Restore Set for channelsVisited
          if (Array.isArray(this.settings.activity.channelsVisited)) {
            this.settings.activity.channelsVisited = new Set(
              this.settings.activity.channelsVisited
            );
            this.debugLog('LOAD_SETTINGS', 'Converted channelsVisited array to Set');
          } else if (!(this.settings.activity.channelsVisited instanceof Set)) {
            this.settings.activity.channelsVisited = new Set();
            this.debugLog('LOAD_SETTINGS', 'Initialized new channelsVisited Set');
          }

          // Initialize luckBuffs array if it doesn't exist
          if (!Array.isArray(this.settings.luckBuffs)) {
            this.settings.luckBuffs = [];
            this.debugLog('LOAD_SETTINGS', 'Initialized luckBuffs array', {});
          } else {
            const totalBuff = this.settings.luckBuffs.reduce((sum, buff) => sum + buff, 0);
            this.debugLog('LOAD_SETTINGS', 'Loaded luckBuffs', {
              count: this.settings.luckBuffs.length,
              totalBuff: totalBuff.toFixed(1) + '%',
              buffs: [...this.settings.luckBuffs],
            });
          }

          // Verify critical data exists
          if (!this.settings.level || !this.settings.totalXP) {
            this.debugLog('LOAD_SETTINGS', 'Critical data missing, initializing defaults');
            const levelInfo = this.getCurrentLevel();
            this.settings.level = levelInfo.level;
            this.settings.totalXP = this.settings.totalXP || 0;
          }

          this.debugLog('LOAD_SETTINGS', 'Settings loaded successfully', {
            level: this.settings.level,
            totalXP: this.settings.totalXP,
            messagesSent: this.settings.activity.messagesSent,
            rank: this.settings.rank,
          });

          // Emit initial XP changed event for progress bar plugins
          this.emitXPChanged();
        } catch (error) {
          this.debugError('LOAD_SETTINGS', error, { phase: 'settings_merge' });
          throw error;
        }
      } else {
        this.settings = { ...this.defaultSettings };
        // Initialize Set for channelsVisited
        this.settings.activity.channelsVisited = new Set();
        this.debugLog('LOAD_SETTINGS', 'No saved data found, using defaults');
      }
    } catch (error) {
      this.debugError('LOAD_SETTINGS', error, { phase: 'load_settings' });
      this.settings = { ...this.defaultSettings };
      // Initialize Set for channelsVisited
      this.settings.activity.channelsVisited = new Set();
    }
  }

  saveSettings(immediate = false) {
    // Prevent saving if settings aren't initialized
    if (!this.settings) {
      this.debugError('SAVE_SETTINGS', new Error('Settings not initialized'));
      return;
    }

    try {
      // Save agility and luck bonuses for CriticalHit before saving settings
      try {
        this.saveAgilityBonus();
      } catch (error) {
        // Don't fail entire save if agility bonus save fails
        this.debugError('SAVE_AGILITY_BONUS_IN_SAVE', error);
      }

      // Convert Set to Array for storage and ensure all data is serializable
      const settingsToSave = {
        ...this.settings,
        activity: {
          ...this.settings.activity,
          channelsVisited:
            this.settings.activity?.channelsVisited instanceof Set
              ? Array.from(this.settings.activity.channelsVisited)
              : Array.isArray(this.settings.activity?.channelsVisited)
              ? this.settings.activity.channelsVisited
              : [],
        },
        // Add metadata for debugging
        _metadata: {
          lastSave: new Date().toISOString(),
          version: '1.0.0',
        },
      };

      // Remove any non-serializable properties (functions, undefined, etc.)
      const cleanSettings = JSON.parse(JSON.stringify(settingsToSave));

      // Save with retry logic (synchronous retries)
      let saveSuccess = false;
      let lastError = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          BdApi.Data.save('SoloLevelingStats', 'settings', cleanSettings);
          this.lastSaveTime = Date.now();
          saveSuccess = true;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 2) {
            // Small delay before retry (synchronous)
            const start = Date.now();
            while (Date.now() - start < 50 * (attempt + 1)) {
              // Busy wait for small delay
            }
          }
        }
      }

      if (!saveSuccess) {
        throw lastError || new Error('Failed to save settings after 3 attempts');
      }

      if (immediate) {
        // OPTIMIZED: Removed verbose logging for frequent saves (happens every 5 seconds)
        // this.debugLog('SAVE_DATA', 'Data saved immediately');
      }
    } catch (error) {
      this.debugError('SAVE_SETTINGS', error);
      // Try to save to backup location
      try {
        // Ensure we have a clean copy for backup
        const backupData = JSON.parse(
          JSON.stringify({
            ...this.settings,
            activity: {
              ...this.settings.activity,
              channelsVisited:
                this.settings.activity?.channelsVisited instanceof Set
                  ? Array.from(this.settings.activity.channelsVisited)
                  : Array.isArray(this.settings.activity?.channelsVisited)
                  ? this.settings.activity.channelsVisited
                  : [],
            },
          })
        );
        BdApi.Data.save('SoloLevelingStats', 'settings_backup', backupData);
        this.debugLog('SAVE_SETTINGS', 'Saved to backup location');
      } catch (backupError) {
        this.debugError('SAVE_SETTINGS_BACKUP', backupError);
      }
    }
  }

  migrateData() {
    // Migration logic for future updates
    try {
      // Ensure stats object exists
      if (!this.settings.stats || typeof this.settings.stats !== 'object') {
        this.settings.stats = { ...this.defaultSettings.stats };
      } else {
        // Ensure all stat properties exist
        const defaultStats = this.defaultSettings.stats;
        Object.keys(defaultStats).forEach((key) => {
          if (
            this.settings.stats[key] === undefined ||
            typeof this.settings.stats[key] !== 'number'
          ) {
            this.settings.stats[key] = defaultStats[key];
          }
        });
      }

      // Ensure activity object exists
      if (!this.settings.activity || typeof this.settings.activity !== 'object') {
        this.settings.activity = { ...this.defaultSettings.activity };
      } else {
        // Ensure all activity properties exist
        const defaultActivity = this.defaultSettings.activity;
        Object.keys(defaultActivity).forEach((key) => {
          if (this.settings.activity[key] === undefined) {
            this.settings.activity[key] = defaultActivity[key];
          }
        });
      }

      // Ensure luckBuffs array exists
      if (!Array.isArray(this.settings.luckBuffs)) {
        this.settings.luckBuffs = [];
      }

      // Ensure channelsVisited is a Set
      if (!(this.settings.activity.channelsVisited instanceof Set)) {
        if (Array.isArray(this.settings.activity.channelsVisited)) {
          this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
        } else {
          this.settings.activity.channelsVisited = new Set();
        }
      }

      if (
        this.settings.unallocatedStatPoints === undefined ||
        typeof this.settings.unallocatedStatPoints !== 'number'
      ) {
        this.settings.unallocatedStatPoints = 0;
      }
    } catch (error) {
      this.debugError('MIGRATE_DATA', error);
      // Fallback to defaults if migration fails
      this.settings.stats = { ...this.defaultSettings.stats };
      this.settings.activity = { ...this.defaultSettings.activity };
      this.settings.activity.channelsVisited = new Set();
      this.settings.luckBuffs = [];
      this.settings.unallocatedStatPoints = 0;
    }
  }

  // ============================================================================
  // PHASE 1: Core Tracking System
  // ============================================================================

  startActivityTracking() {
    // Track time active
    this.activityTracker = setInterval(() => {
      const now = Date.now();
      const timeDiff = (now - this.settings.activity.lastActiveTime) / 1000 / 60; // minutes

      // Only count if user was active in last 5 minutes
      if (timeDiff < 5) {
        this.settings.activity.timeActive += timeDiff;
        this.settings.activity.lastActiveTime = now;

        // Update daily quest: Active Adventurer
        this.updateQuestProgress('activeAdventurer', timeDiff);
      }
    }, 60000); // Check every minute

    // Track mouse/keyboard activity
    let activityTimeout;
    const resetActivityTimeout = () => {
      clearTimeout(activityTimeout);
      this.settings.activity.lastActiveTime = Date.now();
      activityTimeout = setTimeout(() => {
        // User inactive
      }, 300000); // 5 minutes
    };

    document.addEventListener('mousemove', resetActivityTimeout);
    document.addEventListener('keydown', resetActivityTimeout);
    resetActivityTimeout();
  }

  startObserving() {
    // Watch for new messages appearing in chat
    // Better approach: Monitor message input and detect when messages are sent
    const findMessageInput = () => {
      // Try multiple selectors - Discord uses different class names
      const selectors = [
        'div[contenteditable="true"][role="textbox"]', // Modern Discord uses contenteditable divs
        'div[contenteditable="true"]',
        '[class*="slateTextArea"]',
        '[class*="textArea"]',
        '[class*="textValue"]',
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="message"]',
        '[class*="messageInput"]',
        '[class*="input"]',
        '[data-slate-editor="true"]', // Slate editor
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          this.debugLog('FIND_INPUT', 'Found input element', { selector });
          return element;
        }
      }

      // Also try to find by role attribute
      const roleInput = document.querySelector('[role="textbox"]');
      if (roleInput && roleInput.contentEditable === 'true') {
        this.debugLog('FIND_INPUT', 'Found input by role="textbox"');
        return roleInput;
      }

      return null;
    };

    // Watch message container for new messages (similar to CriticalHit approach)
    const messageContainer =
      document.querySelector('[class*="messagesWrapper"]') ||
      document.querySelector('[class*="scrollerInner"]') ||
      document.querySelector('[class*="scroller"]');

    if (!messageContainer) {
      // Wait and try again
      setTimeout(() => this.startObserving(), 1000);
      return;
    }

    // Track processed messages to avoid duplicates
    this.processedMessageIds = this.processedMessageIds || new Set();

    // Get current user ID to identify our own messages
    let currentUserId = null;
    try {
      // Try to get current user from Discord's state
      const userElement =
        document.querySelector('[class*="avatar"]') || document.querySelector('[class*="user"]');
      if (userElement) {
        // Try to extract user ID from React props
        const reactKey = Object.keys(userElement).find(
          (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
        );
        if (reactKey) {
          let fiber = userElement[reactKey];
          for (let i = 0; i < 10 && fiber; i++) {
            if (fiber.memoizedProps?.user?.id) {
              currentUserId = fiber.memoizedProps.user.id;
              break;
            }
            fiber = fiber.return;
          }
        }
      }
    } catch (e) {
      this.debugError('GET_USER_ID', e);
    }

    const self = this;
    this.messageObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            // Element node
            // Check if this is a message element
            const messageElement = node.classList?.contains('message')
              ? node
              : node.querySelector?.('[class*="message"]') || node.closest?.('[class*="message"]');

            if (messageElement) {
              // Check if this is our own message
              const isOwnMessage = this.isOwnMessage(messageElement, currentUserId);

              self.debugLog('MUTATION_OBSERVER', 'Message element detected', {
                hasMessageElement: !!messageElement,
                isOwnMessage,
                hasCurrentUserId: !!currentUserId,
              });

              if (isOwnMessage) {
                const messageId = self.getMessageId(messageElement);
                self.debugLog('MUTATION_OBSERVER', 'Own message detected via MutationObserver', {
                  messageId,
                  alreadyProcessed: messageId ? self.processedMessageIds.has(messageId) : false,
                  elementClasses: messageElement.classList?.toString() || '',
                });

                if (messageId && !self.processedMessageIds.has(messageId)) {
                  // Double-check: Only process if we have strong confirmation
                  // MutationObserver is fallback - be extra careful
                  const hasReactProps =
                    currentUserId &&
                    (() => {
                      try {
                        const reactKey = Object.keys(messageElement).find(
                          (key) =>
                            key.startsWith('__reactFiber') ||
                            key.startsWith('__reactInternalInstance')
                        );
                        if (reactKey) {
                          let fiber = messageElement[reactKey];
                          for (let i = 0; i < 20 && fiber; i++) {
                            const authorId =
                              fiber.memoizedProps?.message?.author?.id ||
                              fiber.memoizedState?.message?.author?.id ||
                              fiber.memoizedProps?.message?.authorId;
                            if (authorId === currentUserId) return true;
                            fiber = fiber.return;
                          }
                        }
                      } catch (e) {}
                      return false;
                    })();

                  const hasExplicitYou = (() => {
                    const usernameElement =
                      messageElement.querySelector('[class*="username"]') ||
                      messageElement.querySelector('[class*="author"]');
                    if (usernameElement) {
                      const usernameText = usernameElement.textContent?.trim() || '';
                      return (
                        usernameText.toLowerCase() === 'you' ||
                        usernameText.toLowerCase().startsWith('you ')
                      );
                    }
                    return false;
                  })();

                  // Only process if we have React props confirmation OR explicit "You" indicator
                  if (!hasReactProps && !hasExplicitYou) {
                    self.debugLog(
                      'MUTATION_OBSERVER',
                      'Skipping: Insufficient confirmation for MutationObserver detection',
                      {
                        hasReactProps,
                        hasExplicitYou,
                        messageId,
                      }
                    );
                    return; // Don't process - too risky
                  }

                  self.processedMessageIds.add(messageId);

                  // Get message text
                  const messageText =
                    messageElement.textContent?.trim() ||
                    messageElement
                      .querySelector('[class*="messageContent"]')
                      ?.textContent?.trim() ||
                    messageElement.querySelector('[class*="textValue"]')?.textContent?.trim() ||
                    '';

                  if (messageText.length > 0 && !self.isSystemMessage(messageElement)) {
                    self.debugLog('MUTATION_OBSERVER', 'Processing own message (confirmed)', {
                      messageId,
                      length: messageText.length,
                      preview: messageText.substring(0, 50),
                      confirmationMethod: hasReactProps ? 'React props' : 'Explicit You',
                    });
                    setTimeout(() => {
                      self.processMessageSent(messageText);
                    }, 100);
                  } else {
                    self.debugLog('MUTATION_OBSERVER', 'Message skipped', {
                      reason: messageText.length === 0 ? 'empty' : 'system_message',
                    });
                  }
                } else {
                  self.debugLog('MUTATION_OBSERVER', 'Message already processed or no ID', {
                    messageId,
                    hasId: !!messageId,
                  });
                }
              } else {
                self.debugLog('MUTATION_OBSERVER', 'Message is NOT own, skipping', {
                  hasCurrentUserId: !!currentUserId,
                });
              }
            }
          }
        });
      });

      // Track channel visits
      this.trackChannelVisit();
    });

    this.messageObserver.observe(messageContainer, {
      childList: true,
      subtree: true,
    });

    // OPTIMIZED: Removed direct console.warn calls - use debugLog instead
    this.debugLog('SETUP_MESSAGE_DETECTION', 'MutationObserver set up for message detection');
    this.debugLog('SETUP_MESSAGE_DETECTION', 'Setting up message detection via MutationObserver');

    // Primary method: Detect message sends via input (most reliable)
    let retryCount = 0;
    const maxRetries = 10;
    const setupInputMonitoring = () => {
      const messageInput = findMessageInput();
      if (!messageInput) {
        retryCount++;
        if (retryCount < maxRetries) {
          this.debugLog(
            'SETUP_INPUT',
            `Message input not found, retrying (${retryCount}/${maxRetries})`
          );
          setTimeout(setupInputMonitoring, 1000);
        } else {
          this.debugLog(
            'SETUP_INPUT',
            'Message input not found after max retries, will rely on MutationObserver'
          );
        }
        return;
      }

      retryCount = 0; // Reset on success

      this.debugLog('SETUP_INPUT', 'Found message input, setting up monitoring');
      let lastInputValue = '';
      let inputTimeout = null;

      const handleInput = () => {
        // Store current input value - handle both textarea and contenteditable div
        let currentValue = '';
        if (messageInput.tagName === 'TEXTAREA') {
          currentValue = messageInput.value || '';
        } else if (messageInput.contentEditable === 'true') {
          // For contenteditable divs, get text content
          currentValue =
            messageInput.textContent ||
            messageInput.innerText ||
            messageInput.querySelector('[class*="textValue"]')?.textContent ||
            '';
        } else {
          currentValue =
            messageInput.value || messageInput.textContent || messageInput.innerText || '';
        }

        lastInputValue = currentValue;

        // Clear any pending timeout
        if (inputTimeout) {
          clearTimeout(inputTimeout);
        }
      };

      const handleKeyDown = (event) => {
        // Check if Enter was pressed (message sent)
        if (event.key === 'Enter' && !event.shiftKey) {
          // Get actual text content, not HTML
          let messageText = '';
          try {
            // Try to get text from the contenteditable div
            if (messageInput.textContent) {
              messageText = messageInput.textContent.trim();
            } else if (messageInput.innerText) {
              messageText = messageInput.innerText.trim();
            } else {
              messageText = lastInputValue.trim();
            }
          } catch (e) {
            messageText = lastInputValue.trim();
          }

          // Sanity check: Discord messages are typically under 2000 characters
          // If we're getting something huge, it's probably capturing the wrong content
          if (messageText.length > 2000) {
            this.debugLog('INPUT_DETECTION', 'Message too long, likely capturing wrong content', {
              length: messageText.length,
              preview: messageText.substring(0, 100),
            });
            // Try to extract just the visible text
            const textNodes = [];
            const walker = document.createTreeWalker(
              messageInput,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            let node;
            while ((node = walker.nextNode())) {
              const text = node.textContent?.trim();
              if (text && text.length > 0 && text.length < 2000) {
                textNodes.push(text);
              }
            }
            if (textNodes.length > 0) {
              messageText = textNodes.join(' ').trim();
              // Still limit to reasonable size
              if (messageText.length > 2000) {
                messageText = messageText.substring(0, 2000);
              }
            } else {
              // Fallback: just take first 2000 chars
              messageText = messageText.substring(0, 2000);
            }
          }

          if (messageText.length > 0 && messageText.length <= 2000) {
            this.debugLog('INPUT_DETECTION', 'Enter key pressed, message detected', {
              length: messageText.length,
              preview: messageText.substring(0, 50),
            });

            // Process immediately - don't wait for input to clear
            // Discord's contenteditable divs might not clear immediately
            this.debugLog('INPUT_DETECTION', 'Processing message immediately');
            setTimeout(() => {
              this.processMessageSent(messageText);
              lastInputValue = ''; // Clear after processing
            }, 100);

            // Also check if input was cleared after a delay (verification)
            setTimeout(() => {
              let currentValue = '';
              if (messageInput.tagName === 'TEXTAREA') {
                currentValue = messageInput.value || '';
              } else {
                currentValue = messageInput.textContent || messageInput.innerText || '';
              }

              if (!currentValue || currentValue.trim().length === 0) {
                this.debugLog('INPUT_DETECTION', 'Input cleared, message confirmed sent');
              } else {
                this.debugLog('INPUT_DETECTION', 'Input still has content, may be editing');
              }
            }, 500);
          }
        }
      };

      // Track input changes
      messageInput.addEventListener('input', handleInput, true);
      messageInput.addEventListener('keydown', handleKeyDown, true);

      // Also listen for paste events
      messageInput.addEventListener(
        'paste',
        () => {
          setTimeout(handleInput, 50);
        },
        true
      );

      // Watch for input value changes via MutationObserver
      const inputObserver = new MutationObserver(() => {
        const currentValue =
          messageInput.value || messageInput.textContent || messageInput.innerText || '';
        if (currentValue !== lastInputValue) {
          lastInputValue = currentValue;
        }
      });

      inputObserver.observe(messageInput, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      this.messageInputHandler = {
        handleInput,
        handleKeyDown,
        observer: inputObserver,
        element: messageInput,
      };
      this.debugLog('SETUP_INPUT', 'Input monitoring set up successfully');
      this.inputMonitoringActive = true;
    };

    // Start input monitoring
    setupInputMonitoring();
  }

  getMessageId(messageElement) {
    // Try to get a unique ID for the message (improved method)
    let messageId =
      messageElement.getAttribute('data-list-item-id') || messageElement.getAttribute('id');

    // Try React props (Discord stores message data in React)
    if (!messageId) {
      try {
        const reactKey = Object.keys(messageElement).find(
          (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
        );
        if (reactKey) {
          let fiber = messageElement[reactKey];
          for (let i = 0; i < 10 && fiber; i++) {
            if (fiber.memoizedProps?.message?.id) {
              messageId = fiber.memoizedProps.message.id;
              break;
            }
            if (fiber.memoizedState?.message?.id) {
              messageId = fiber.memoizedState.message.id;
              break;
            }
            fiber = fiber.return;
          }
        }
      } catch (e) {
        // React access failed, continue to fallback
      }
    }

    // Fallback: create hash from content + timestamp
    if (!messageId) {
      const content = messageElement.textContent?.trim() || '';
      const timestamp = Date.now();
      const hashContent = `${content.substring(0, 100)}:${timestamp}`;
      let hash = 0;
      for (let i = 0; i < hashContent.length; i++) {
        const char = hashContent.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      messageId = `hash_${Math.abs(hash)}`;
    }

    return messageId;
  }

  isSystemMessage(messageElement) {
    // Check if message is a system message
    const systemClasses = ['systemMessage', 'systemText', 'joinMessage', 'leaveMessage'];
    const classes = Array.from(messageElement.classList || []);
    return classes.some((c) => systemClasses.some((sc) => c.includes(sc)));
  }

  isOwnMessage(messageElement, currentUserId) {
    try {
      this.debugLog('IS_OWN_MESSAGE', 'Checking if message is own', {
        hasCurrentUserId: !!currentUserId,
        elementClasses: messageElement.classList?.toString() || '',
      });

      // PRIMARY METHOD 1: Check React props for user ID match (MOST RELIABLE)
      if (currentUserId) {
        try {
          const reactKey = Object.keys(messageElement).find(
            (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
          );
          if (reactKey) {
            let fiber = messageElement[reactKey];
            for (let i = 0; i < 20 && fiber; i++) {
              const authorId =
                fiber.memoizedProps?.message?.author?.id ||
                fiber.memoizedState?.message?.author?.id ||
                fiber.memoizedProps?.message?.authorId;

              if (authorId === currentUserId) {
                this.debugLog(
                  'IS_OWN_MESSAGE',
                  'CONFIRMED: Detected via React props user ID match',
                  {
                    authorId,
                    currentUserId,
                    method: fiber.memoizedProps?.message?.author?.id
                      ? 'memoizedProps.author.id'
                      : fiber.memoizedState?.message?.author?.id
                      ? 'memoizedState.author.id'
                      : 'memoizedProps.authorId',
                  }
                );
                return true;
              }
              fiber = fiber.return;
            }
          }
        } catch (e) {
          this.debugLog('IS_OWN_MESSAGE', 'React access failed', { error: e.message });
        }
      }

      // PRIMARY METHOD 2: Check for explicit "You" indicator (RELIABLE)
      const usernameElement =
        messageElement.querySelector('[class*="username"]') ||
        messageElement.querySelector('[class*="author"]') ||
        messageElement.querySelector('[class*="usernameInner"]');

      if (usernameElement) {
        const usernameText = usernameElement.textContent?.trim() || '';
        // Only trust explicit "You" text, not class names
        if (usernameText.toLowerCase() === 'you' || usernameText.toLowerCase().startsWith('you ')) {
          this.debugLog('IS_OWN_MESSAGE', 'CONFIRMED: Detected via explicit "You" indicator', {
            usernameText,
          });
          return true;
        }
      }

      // SECONDARY: Require MULTIPLE strong indicators together (more strict)
      const messageClasses = messageElement.classList?.toString() || '';
      const hasOwnClass =
        messageClasses.includes('own') || messageElement.closest('[class*="own"]') !== null;
      const hasCozyClass = messageClasses.includes('cozy');
      const hasRightAligned = messageClasses.includes('right');
      const hasOwnTimestamp = messageElement
        .querySelector('[class*="timestamp"]')
        ?.classList?.toString()
        .includes('own');

      // Require at least 2 strong indicators
      let indicatorCount = 0;
      if (hasOwnClass) indicatorCount++;
      if (hasOwnTimestamp) indicatorCount++;
      if (hasRightAligned && hasCozyClass) indicatorCount++; // Both together = stronger

      if (indicatorCount >= 2) {
        this.debugLog('IS_OWN_MESSAGE', 'CONFIRMED: Multiple strong indicators', {
          hasOwnClass,
          hasOwnTimestamp,
          hasRightAligned,
          hasCozyClass,
          indicatorCount,
        });
        return true;
      }

      // If we don't have strong confirmation, return false
      this.debugLog('IS_OWN_MESSAGE', 'NOT OWN: Insufficient indicators', {
        hasOwnClass,
        hasOwnTimestamp,
        hasRightAligned,
        hasCozyClass,
        indicatorCount,
        hasCurrentUserId: !!currentUserId,
      });
      return false;
    } catch (error) {
      this.debugError('IS_OWN_MESSAGE', error);
      return false; // Default to false on error
    }
  }

  processMessageSent(messageText) {
    try {
      this.debugLog('PROCESS_MESSAGE', 'Processing message', {
        length: messageText.length,
        preview: messageText.substring(0, 30),
      });

      // Prevent duplicate processing
      const messageHash = `${messageText.substring(0, 50)}:${Date.now()}`;
      const hashKey = `msg_${this.hashString(messageHash)}`;

      // Check if we've processed this message recently (within last 2 seconds)
      if (!this.recentMessages) {
        this.recentMessages = new Set();
      }

      // Clean old hashes (older than 2 seconds)
      if (this.recentMessages.size > 100) {
        this.recentMessages.clear();
        this.debugLog('PROCESS_MESSAGE', 'Cleaned old message hashes');
      }

      if (this.recentMessages.has(hashKey)) {
        this.debugLog('PROCESS_MESSAGE', 'Duplicate message detected, skipping');
        return;
      }

      this.recentMessages.add(hashKey);

      // Sanity check: Limit message length to prevent capturing wrong content
      // Discord's max message length is 2000 characters
      const maxMessageLength = 2000;
      const actualMessageLength = Math.min(messageText.length, maxMessageLength);

      // If message is longer than max, log warning
      if (messageText.length > maxMessageLength) {
        this.debugLog('PROCESS_MESSAGE', 'Message length exceeds Discord limit, truncating', {
          originalLength: messageText.length,
          truncatedLength: actualMessageLength,
        });
      }

      const messageLength = actualMessageLength;

      // Update activity counters
      try {
        this.settings.activity.messagesSent++;
        this.settings.activity.charactersTyped += messageLength;
        this.debugLog('PROCESS_MESSAGE', 'Activity counters updated', {
          messagesSent: this.settings.activity.messagesSent,
          charactersTyped: this.settings.activity.charactersTyped,
        });
      } catch (error) {
        this.debugError('PROCESS_MESSAGE', error, { phase: 'update_activity' });
      }

      // Track channel visit
      try {
        this.trackChannelVisit();
      } catch (error) {
        this.debugError('PROCESS_MESSAGE', error, { phase: 'track_channel' });
      }

      // Store message info for crit detection
      try {
        // Try to find the message element in DOM
        const messageElements = document.querySelectorAll('[class*="message"]');
        if (messageElements.length > 0) {
          // Get the most recent message (last in list)
          const lastMsg = Array.from(messageElements).pop();
          if (lastMsg) {
            this.lastMessageElement = lastMsg;
            this.lastMessageId = this.getMessageId(lastMsg);
          }
        }
      } catch (error) {
        // Ignore errors in message tracking
      }

      // Calculate and award XP (this will save immediately)
      try {
        this.awardXP(messageText, messageLength);
        this.debugLog('PROCESS_MESSAGE', 'XP awarded successfully');
      } catch (error) {
        this.debugError('PROCESS_MESSAGE', error, { phase: 'award_xp' });
      }

      // Update daily quests
      try {
        this.updateQuestProgress('messageMaster', 1);
        this.updateQuestProgress('characterChampion', messageLength);
        this.debugLog('PROCESS_MESSAGE', 'Quest progress updated');
      } catch (error) {
        this.debugError('PROCESS_MESSAGE', error, { phase: 'update_quests' });
      }

      // Check for achievements (will save if achievement unlocked)
      try {
        this.checkAchievements();
      } catch (error) {
        this.debugError('PROCESS_MESSAGE', error, { phase: 'check_achievements' });
      }

      // Update UI immediately after processing
      try {
        this.updateChatUI();
        this.debugLog('PROCESS_MESSAGE', 'UI updated after message processing');
      } catch (error) {
        this.debugError('PROCESS_MESSAGE', error, { phase: 'update_ui' });
      }

      // Note: XP gain already triggers immediate save, but we'll also save quest progress
      // Save quest progress if it changed (but not every message to avoid spam)
      if (Date.now() - this.lastSaveTime > 5000) {
        try {
          this.saveSettings();
        } catch (error) {
          this.debugError('PROCESS_MESSAGE', error, { phase: 'periodic_save' });
        }
      }

      this.debugLog('PROCESS_MESSAGE', 'Message processing completed');
    } catch (error) {
      this.debugError('PROCESS_MESSAGE', error, {
        messageLength: messageText?.length,
        messagePreview: messageText?.substring(0, 30),
      });
    }
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  trackChannelVisit() {
    try {
      const channelInfo = this.getCurrentChannelInfo();

      if (!channelInfo) {
        this.debugLog('TRACK_CHANNEL_VISIT', 'No channel info found', {
          currentUrl: window.location.href,
        });
        return;
      }

      const { channelId, channelType, serverId, isDM } = channelInfo;

      // Ensure channelsVisited is a Set
      if (!(this.settings.activity.channelsVisited instanceof Set)) {
        if (Array.isArray(this.settings.activity.channelsVisited)) {
          this.settings.activity.channelsVisited = new Set(this.settings.activity.channelsVisited);
        } else {
          this.settings.activity.channelsVisited = new Set();
        }
      }

      const previousSize = this.settings.activity.channelsVisited.size;
      const wasNewChannel = !this.settings.activity.channelsVisited.has(channelId);

      this.settings.activity.channelsVisited.add(channelId);

      // Reduced verbosity - only log if verbose mode enabled or if it's a new channel
      if (wasNewChannel || this.debug.verbose) {
        this.debugLog('TRACK_CHANNEL_VISIT', 'Channel visit tracked', {
          channelId,
          channelType,
          serverId: serverId || 'N/A (DM)',
          isDM,
          wasNewChannel,
          previousCount: previousSize,
          newCount: this.settings.activity.channelsVisited.size,
          totalChannels: this.settings.activity.channelsVisited.size,
        });
      }

      // If new channel, update quest and save immediately
      if (wasNewChannel) {
        this.debugLog('TRACK_CHANNEL_VISIT', 'New channel discovered!', {
          channelId,
          channelType,
          isDM,
        });
        this.updateQuestProgress('channelExplorer', 1);

        // Save immediately when discovering a new channel
        this.saveSettings(true);
        this.debugLog('TRACK_CHANNEL_VISIT', 'Settings saved immediately after new channel visit');
      }
    } catch (error) {
      this.debugError('TRACK_CHANNEL_VISIT', error, {
        currentUrl: window.location.href,
      });
    }
  }

  getCurrentChannelInfo() {
    try {
      const url = window.location.href;
      // Reduced verbosity - only log if verbose mode enabled (frequent operation)
      this.debugLog('GET_CHANNEL_INFO', 'Getting channel info', { url });

      // Pattern 1: Server channel - /channels/{serverId}/{channelId}
      const serverChannelMatch = url.match(/channels\/(\d+)\/(\d+)/);
      if (serverChannelMatch) {
        const serverId = serverChannelMatch[1];
        const channelId = serverChannelMatch[2];
        // Reduced verbosity - only log if verbose mode enabled
        this.debugLog('GET_CHANNEL_INFO', 'Server channel detected', {
          serverId,
          channelId,
          type: 'server',
        });
        return {
          channelId: `server_${serverId}_${channelId}`, // Unique ID for server channels
          channelType: 'server',
          serverId,
          isDM: false,
          rawChannelId: channelId,
        };
      }

      // Pattern 2: Direct Message (DM) - /@me/{channelId}
      const dmMatch = url.match(/@me\/(\d+)/);
      if (dmMatch) {
        const channelId = dmMatch[1];
        // Reduced verbosity - only log if verbose mode enabled
        this.debugLog('GET_CHANNEL_INFO', 'DM channel detected', {
          channelId,
          type: 'dm',
        });
        return {
          channelId: `dm_${channelId}`, // Unique ID for DMs
          channelType: 'dm',
          serverId: null,
          isDM: true,
          rawChannelId: channelId,
        };
      }

      // Pattern 3: Group DM - /channels/@me/{groupId}
      const groupDmMatch = url.match(/channels\/@me\/(\d+)/);
      if (groupDmMatch) {
        const groupId = groupDmMatch[1];
        // Reduced verbosity - only log if verbose mode enabled
        this.debugLog('GET_CHANNEL_INFO', 'Group DM detected', {
          groupId,
          type: 'group_dm',
        });
        return {
          channelId: `group_dm_${groupId}`,
          channelType: 'group_dm',
          serverId: null,
          isDM: true,
          rawChannelId: groupId,
        };
      }

      // Pattern 4: Fallback - use full URL as ID (for unknown patterns)
      this.debugLog('GET_CHANNEL_INFO', 'Unknown channel pattern, using URL as ID', {
        url,
        type: 'unknown',
      });
      return {
        channelId: `unknown_${this.hashString(url)}`,
        channelType: 'unknown',
        serverId: null,
        isDM: false,
        rawChannelId: url,
      };
    } catch (error) {
      this.debugError('GET_CHANNEL_INFO', error, {
        currentUrl: window.location.href,
      });
      return null;
    }
  }

  getCurrentChannelId() {
    // Legacy method for backward compatibility
    const info = this.getCurrentChannelInfo();
    return info ? info.channelId : null;
  }

  startChannelTracking() {
    try {
      this.debugLog('START_CHANNEL_TRACKING', 'Starting real-time channel change detection');

      // Track current URL to detect changes
      let lastUrl = window.location.href;
      let lastChannelId = null;

      // Get initial channel ID
      const initialInfo = this.getCurrentChannelInfo();
      if (initialInfo) {
        lastChannelId = initialInfo.channelId;
        this.debugLog('START_CHANNEL_TRACKING', 'Initial channel detected', {
          channelId: lastChannelId,
          channelType: initialInfo.channelType,
          url: lastUrl,
        });
      }

      // Method 1: Monitor URL changes via popstate (back/forward navigation)
      window.addEventListener('popstate', () => {
        const newUrl = window.location.href;
        if (newUrl !== lastUrl) {
          this.debugLog('START_CHANNEL_TRACKING', 'URL changed via popstate', {
            oldUrl: lastUrl,
            newUrl,
          });
          lastUrl = newUrl;
          this.handleChannelChange(lastChannelId);
        }
      });

      // Method 2: Monitor URL changes via pushState/replaceState (Discord's navigation)
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      const checkUrlChange = (newUrl) => {
        if (newUrl !== lastUrl) {
          this.debugLog('START_CHANNEL_TRACKING', 'URL changed via history API', {
            oldUrl: lastUrl,
            newUrl,
          });
          lastUrl = newUrl;
          this.handleChannelChange(lastChannelId);
        }
      };

      history.pushState = function (...args) {
        originalPushState.apply(history, args);
        setTimeout(() => checkUrlChange(window.location.href), 0);
      };

      history.replaceState = function (...args) {
        originalReplaceState.apply(history, args);
        setTimeout(() => checkUrlChange(window.location.href), 0);
      };

      // Method 3: Poll URL changes (fallback for Discord's internal navigation)
      // Optimized: Increased interval to reduce CPU usage (500ms -> 1000ms)
      // Discord's navigation is usually caught by popstate/history API, so polling is rarely needed
      this.channelTrackingInterval = setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
          this.debugLog('START_CHANNEL_TRACKING', 'URL changed via polling', {
            oldUrl: lastUrl,
            newUrl: currentUrl,
          });
          lastUrl = currentUrl;
          this.handleChannelChange(lastChannelId);
        }
      }, 1000); // Check every 1000ms (reduced from 500ms for better performance)

      this.debugLog('START_CHANNEL_TRACKING', 'Channel tracking started successfully', {
        methods: ['popstate', 'history API', 'polling'],
        pollInterval: '1000ms',
      });
    } catch (error) {
      this.debugError('START_CHANNEL_TRACKING', error);
    }
  }

  handleChannelChange(lastChannelId) {
    try {
      const channelInfo = this.getCurrentChannelInfo();

      if (!channelInfo) {
        this.debugLog('HANDLE_CHANNEL_CHANGE', 'No channel info after change', {
          currentUrl: window.location.href,
        });
        return;
      }

      const { channelId, channelType, serverId, isDM } = channelInfo;

      // Only track if channel actually changed
      if (channelId !== lastChannelId) {
        // Reduced verbosity - only log if verbose mode enabled (frequent operation)
        this.debugLog('HANDLE_CHANNEL_CHANGE', 'Channel changed detected', {
          oldChannelId: lastChannelId,
          newChannelId: channelId,
          channelType,
          serverId: serverId || 'N/A (DM)',
          isDM,
        });

        // Track the new channel visit
        this.trackChannelVisit();

        // Update last channel ID
        lastChannelId = channelId;
      } else {
        this.debugLog('HANDLE_CHANNEL_CHANGE', 'Same channel, no change', {
          channelId,
        });
      }
    } catch (error) {
      this.debugError('HANDLE_CHANNEL_CHANGE', error, {
        currentUrl: window.location.href,
      });
    }
  }

  startAutoSave() {
    // Backup save every 30 seconds (safety net)
    setInterval(() => {
      this.saveSettings();
      // OPTIMIZED: Removed verbose logging for periodic saves (happens every 30 seconds)
      // this.debugLog('PERIODIC_BACKUP', 'Periodic backup save completed');
    }, this.saveInterval);

    // Also save on page unload (before Discord closes)
    window.addEventListener('beforeunload', () => {
      this.saveSettings(true);
    });

    // Save on visibility change (when tab loses focus)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveSettings(true);
      }
    });
  }

  checkDailyReset() {
    const today = new Date().toDateString();
    if (this.settings.dailyQuests.lastResetDate !== today) {
      // Reset daily quests
      this.settings.dailyQuests.lastResetDate = today;
      Object.keys(this.settings.dailyQuests.quests).forEach((questId) => {
        this.settings.dailyQuests.quests[questId].progress = 0;
        this.settings.dailyQuests.quests[questId].completed = false;
      });
      // Save immediately on daily reset
      this.saveSettings(true);
      this.debugLog('DAILY_QUESTS', 'Daily quests reset');
    }
  }

  // ============================================================================
  // PHASE 2: Level & XP System
  // ============================================================================

  awardXP(messageText, messageLength) {
    try {
      this.debugLog('AWARD_XP', 'Calculating XP', { messageLength });

      // Base XP: 10 per message
      let xp = 10;

      // ===== ENHANCED XP GAINS =====

      // 1. Character bonus: +0.15 per character (max +75) - increased from 50
      const charBonus = Math.min(messageLength * 0.15, 75);
      xp += charBonus;

      // 2. Quality bonuses based on message content
      const qualityBonus = this.calculateQualityBonus(messageText, messageLength);
      xp += qualityBonus;

      // 3. Message type bonuses
      const typeBonus = this.calculateMessageTypeBonus(messageText);
      xp += typeBonus;

      // 4. Engagement bonus (if message gets reactions later, tracked separately)
      // This is handled when reactions are detected

      // 5. Time-based bonus (active during peak hours)
      const timeBonus = this.calculateTimeBonus();
      xp += timeBonus;

      // 6. Channel activity bonus (more active channels = more XP)
      const channelBonus = this.calculateChannelActivityBonus();
      xp += channelBonus;

      // Apply active title bonus
      const titleBonus = this.getActiveTitleBonus();
      if (titleBonus.xp > 0) {
        xp *= 1 + titleBonus.xp;
      }
      // Note: Other title bonuses (critChance, stats) are applied elsewhere

      // Apply skill tree bonuses (from SkillTree plugin)
      try {
        const skillBonuses = BdApi.Data.load('SkillTree', 'bonuses');
        if (skillBonuses) {
          // Apply XP bonus
          if (skillBonuses.xpBonus > 0) {
            xp *= 1 + skillBonuses.xpBonus;
          }
          // Apply long message bonus
          if (messageLength > 200 && skillBonuses.longMsgBonus > 0) {
            xp *= 1 + skillBonuses.longMsgBonus;
          }
        }
      } catch (error) {
        // SkillTree not available or error loading bonuses
      }

      // Get Luck buff multiplier (applies to ALL stat bonuses)
      const totalLuckBuff =
        typeof this.getTotalLuckBuff === 'function' ? this.getTotalLuckBuff() : 0;
      const luckMultiplier = totalLuckBuff / 100; // Convert percentage to multiplier

      // Apply skill tree all-stat bonus (if any)
      let skillAllStatBonus = 0;
      try {
        const skillBonuses = BdApi.Data.load('SkillTree', 'bonuses');
        if (skillBonuses && skillBonuses.allStatBonus > 0) {
          skillAllStatBonus = skillBonuses.allStatBonus;
        }
      } catch (error) {
        // SkillTree not available
      }

      // Stat multipliers - Enhanced scaling for meaningful effects
      // Strength: +5% XP per point (multiplicative - gets stronger)
      // Luck buffs enhance Strength bonus: (base STR bonus) * (1 + luck multiplier)
      // Skill tree all-stat bonus enhances all stat bonuses
      const baseStrengthMultiplier = 1 + this.settings.stats.strength * 0.05;
      const enhancedStrengthMultiplier =
        baseStrengthMultiplier * (1 + luckMultiplier + skillAllStatBonus);
      xp = Math.round(xp * enhancedStrengthMultiplier);

      // Intelligence: Enhanced scaling for long messages
      // Base +10% per point, +2% per point after 5 (diminishing returns but still meaningful)
      // Luck buffs enhance Intelligence bonus: (base INT bonus) * (1 + luck multiplier)
      // Skill tree all-stat bonus enhances all stat bonuses
      if (messageLength > 200) {
        const intBaseBonus = this.settings.stats.intelligence * 0.1;
        const intAdvancedBonus = Math.max(0, (this.settings.stats.intelligence - 5) * 0.02);
        const baseIntMultiplier = 1 + intBaseBonus + intAdvancedBonus;
        const enhancedIntMultiplier = baseIntMultiplier * (1 + luckMultiplier + skillAllStatBonus);
        xp = Math.round(xp * enhancedIntMultiplier);
      }

      // Luck: Apply stacked buffs as additional XP bonus (on top of enhanced stat bonuses)
      // This gives Luck a direct XP boost in addition to enhancing other stats
      if (totalLuckBuff > 0) {
        const luckBonusXP = Math.round(xp * luckMultiplier);
        xp += luckBonusXP;

        // Calculate int multiplier info for debug log (only if message is long enough)
        let intEnhancedInfo = 'N/A';
        if (messageLength > 200) {
          const intBaseBonus = this.settings.stats.intelligence * 0.1;
          const intAdvancedBonus = Math.max(0, (this.settings.stats.intelligence - 5) * 0.02);
          const baseIntMultiplier = 1 + intBaseBonus + intAdvancedBonus;
          const enhancedIntMultiplier =
            baseIntMultiplier * (1 + luckMultiplier + skillAllStatBonus);
          intEnhancedInfo = baseIntMultiplier.toFixed(2) + ' → ' + enhancedIntMultiplier.toFixed(2);
        }

        this.debugLog('AWARD_XP_LUCK', 'Stacked luck buffs applied', {
          luckStat: this.settings.stats.luck,
          luckBuffs: [...this.settings.luckBuffs],
          totalStackedBuff: totalLuckBuff.toFixed(1) + '%',
          luckMultiplier: (luckMultiplier * 100).toFixed(1) + '%',
          baseXP: xp - luckBonusXP,
          luckBonusXP,
          finalXP: xp,
          strengthEnhanced:
            baseStrengthMultiplier.toFixed(2) + ' → ' + enhancedStrengthMultiplier.toFixed(2),
          intEnhanced: intEnhancedInfo,
        });
      }

      // Critical Hit Bonus: +25% XP multiplier if message was a crit
      const critBonus = this.checkCriticalHitBonus();
      if (critBonus > 0) {
        const baseXP = xp;
        let critMultiplier = critBonus;
        let isMegaCrit = false;

        // Check for Dagger Throw Master mega crit (1000x multiplier)
        const activeTitle = this.settings.achievements?.activeTitle;
        if (activeTitle === 'Dagger Throw Master') {
          const agilityStat = this.settings.stats?.agility || 0;
          // Chance = Agility stat * 2% (e.g., 10 AGI = 20% chance)
          const megaCritChance = agilityStat * 0.02;
          const roll = Math.random();

          if (roll < megaCritChance) {
            // MEGA CRIT! 1000x multiplier
            critMultiplier = 999; // 1000x total (1 + 999 = 1000x)
            isMegaCrit = true;

            // Show epic notification
            this.showNotification(
              `💥💥💥 MEGA CRITICAL HIT! 💥💥💥\n` +
                `Dagger Throw Master activated!\n` +
                `1000x XP Multiplier!`,
              'success',
              8000
            );

            this.debugLog('AWARD_XP_MEGA_CRIT', 'Mega crit activated!', {
              agilityStat,
              megaCritChance: (megaCritChance * 100).toFixed(1) + '%',
              roll: roll.toFixed(4),
              multiplier: '1000x',
            });
          }
        }

        xp = Math.round(xp * (1 + critMultiplier));
        // Track crit for achievements
        if (!this.settings.activity.critsLanded) {
          this.settings.activity.critsLanded = 0;
        }
        this.settings.activity.critsLanded++;

        const logData = {
          critBonus: (critBonus * 100).toFixed(0) + '%',
          baseXP,
          critBonusXP: xp - baseXP,
          finalXP: xp,
          totalCrits: this.settings.activity.critsLanded,
        };

        if (isMegaCrit) {
          logData.megaCrit = true;
          logData.multiplier = '1000x';
          logData.agilityStat = this.settings.stats?.agility || 0;
        }

        this.debugLog(
          'AWARD_XP_CRIT',
          isMegaCrit ? 'MEGA CRITICAL HIT!' : 'Critical hit bonus applied',
          logData
        );
      }

      // Rank bonus multiplier (higher rank = more XP)
      const rankMultiplier = this.getRankMultiplier();
      xp *= rankMultiplier;

      // Round XP
      xp = Math.round(xp);
      this.debugLog('AWARD_XP', 'XP calculated', { xp, messageLength });

      // Add XP
      const oldLevel = this.settings.level;
      const oldTotalXP = this.settings.totalXP;
      this.settings.xp += xp;
      this.settings.totalXP += xp;

      this.debugLog('AWARD_XP', 'XP added', {
        xpAwarded: xp,
        oldTotalXP,
        newTotalXP: this.settings.totalXP,
        oldLevel,
      });

      // Emit XP changed event for real-time progress bar updates
      this.emitXPChanged();

      // Save immediately on XP gain (important data)
      // Use setTimeout to avoid blocking the main thread
      setTimeout(() => {
        try {
          this.saveSettings(true);
          this.debugLog('AWARD_XP', 'Settings saved after XP gain');
        } catch (error) {
          this.debugError('AWARD_XP', error, { phase: 'save_after_xp' });
        }
      }, 0);

      // Update chat UI
      try {
        this.updateChatUI();
      } catch (error) {
        this.debugError('AWARD_XP', error, { phase: 'update_ui' });
      }

      // Check for level up and rank promotion
      try {
        this.checkLevelUp(oldLevel);
        this.checkRankPromotion();
        this.debugLog('AWARD_XP', 'Level and rank checks completed');
      } catch (error) {
        this.debugError('AWARD_XP', error, { phase: 'level_rank_check' });
      }
    } catch (error) {
      this.debugError('AWARD_XP', error, {
        messageLength,
        messagePreview: messageText?.substring(0, 30),
      });
    }
  }

  checkCriticalHitBonus() {
    // Check if the last message was a critical hit
    // CriticalHit plugin adds 'bd-crit-hit' class to crit messages
    // Agility affects EXP multiplier: base 0.25 (25%) + agility bonus
    try {
      let isCrit = false;

      if (!this.lastMessageElement) {
        // Try to find the message element
        const messageElements = document.querySelectorAll('[class*="message"]');
        if (messageElements.length > 0) {
          const lastMsg = Array.from(messageElements).pop();
          if (lastMsg && lastMsg.classList.contains('bd-crit-hit')) {
            isCrit = true;
          }
        }
      } else if (this.lastMessageElement.classList.contains('bd-crit-hit')) {
        isCrit = true;
      } else if (this.lastMessageId) {
        // Also check by message ID if CriticalHit plugin stores crit info
        try {
          const critPlugin = BdApi.Plugins.get('CriticalHit');
          if (critPlugin) {
            const instance = critPlugin.instance || critPlugin;
            if (instance && instance.critMessages) {
              // Check if this message is in the crit set
              const messageElements = document.querySelectorAll('[class*="message"]');
              for (const msgEl of messageElements) {
                const msgId = this.getMessageId(msgEl);
                if (msgId === this.lastMessageId && msgEl.classList.contains('bd-crit-hit')) {
                  isCrit = true;
                  break;
                }
              }
            }
          }
        } catch (error) {
          // CriticalHit plugin not available or error accessing
        }
      }

      if (!isCrit) {
        return 0; // No crit bonus
      }

      // Get agility stat for EXP multiplier
      const agilityStat = this.settings.stats?.agility || 0;

      // Base crit bonus: 0.25 (25%)
      // Agility bonus: +0.01 per point (1% per agility point)
      // Example: 10 agility = +0.10 (10%) = total 0.35 (35% bonus)
      const agilityBonus = agilityStat * 0.01;
      const baseCritBonus = 0.25;
      let critMultiplier = baseCritBonus + agilityBonus;

      // Check for combo multiplier (from CriticalHitAnimation)
      // Higher combos = exponentially more EXP (scales with combo number itself)
      try {
        const comboData = BdApi.Data.load('CriticalHitAnimation', 'userCombo');
        if (comboData && comboData.comboCount > 1) {
          const comboCount = comboData.comboCount || 1;

          // Exponential combo scaling: combo bonus = (comboCount - 1) ^ 1.5 * 0.02
          // Examples:
          //   2x combo: (2-1)^1.5 * 0.02 = 0.02 (2%)
          //   3x combo: (3-1)^1.5 * 0.02 = 0.056 (5.6%)
          //   5x combo: (5-1)^1.5 * 0.02 = 0.16 (16%)
          //   10x combo: (10-1)^1.5 * 0.02 = 0.54 (54%)
          //   20x combo: (20-1)^1.5 * 0.02 = 1.65 (165%)
          const comboBonus = Math.pow(comboCount - 1, 1.5) * 0.02;
          critMultiplier += comboBonus;

          // Agility also enhances combo bonus: combo bonus * (1 + agility * 0.01)
          // Example: 10x combo (0.54) with 10 agility = 0.54 * 1.10 = 0.594
          const agilityComboEnhancement = comboBonus * (agilityStat * 0.01);
          critMultiplier += agilityComboEnhancement;

          this.debugLog('CHECK_CRIT_BONUS', 'Combo detected', {
            comboCount,
            comboBonus: (comboBonus * 100).toFixed(1) + '%',
            agilityComboEnhancement: (agilityComboEnhancement * 100).toFixed(1) + '%',
            totalComboBonus: ((comboBonus + agilityComboEnhancement) * 100).toFixed(1) + '%',
          });
        }
      } catch (error) {
        // Combo data not available or error accessing
      }

      this.debugLog('CHECK_CRIT_BONUS', 'Crit bonus calculated', {
        baseCritBonus: (baseCritBonus * 100).toFixed(0) + '%',
        agilityStat,
        agilityBonus: (agilityBonus * 100).toFixed(1) + '%',
        totalMultiplier: (critMultiplier * 100).toFixed(1) + '%',
      });

      return critMultiplier;
    } catch (error) {
      this.debugError('CHECK_CRIT_BONUS', error);
    }

    return 0; // No crit bonus
  }

  calculateQualityBonus(messageText, messageLength) {
    let bonus = 0;

    // Long message bonus (scales with length)
    if (messageLength > 200) {
      bonus += 20; // Base bonus for long messages
      if (messageLength > 500) bonus += 15; // Extra for very long
      if (messageLength > 1000) bonus += 25; // Extra for extremely long
    }

    // Rich content bonus
    const hasLinks = /https?:\/\//.test(messageText);
    const hasCode = /```|`/.test(messageText);
    const hasEmojis = /[\u{1F300}-\u{1F9FF}]/u.test(messageText);
    const hasMentions = /<@|@everyone|@here/.test(messageText);

    if (hasLinks) bonus += 5;
    if (hasCode) bonus += 10; // Code blocks show effort
    if (hasEmojis && messageLength > 50) bonus += 3; // Emojis in longer messages
    if (hasMentions) bonus += 2;

    // Word diversity bonus (more unique words = better quality)
    const words = messageText.toLowerCase().match(/\b\w+\b/g) || [];
    const uniqueWords = new Set(words);
    if (uniqueWords.size > 10 && messageLength > 100) {
      bonus += Math.min(uniqueWords.size * 0.5, 15);
    }

    // Question/answer bonus (engagement indicators)
    if (messageText.includes('?') && messageLength > 30) bonus += 5;
    if (messageText.match(/^[A-Z].*[.!?]$/)) bonus += 3; // Proper sentences

    return Math.round(bonus);
  }

  calculateMessageTypeBonus(messageText) {
    let bonus = 0;

    // Structured content bonuses
    if (messageText.match(/^\d+[\.\)]\s/)) bonus += 5; // Numbered lists
    if (messageText.match(/^[-*]\s/m)) bonus += 5; // Bullet points
    if (messageText.includes('\n') && messageText.split('\n').length > 2) bonus += 8; // Multi-line

    return bonus;
  }

  calculateTimeBonus() {
    const hour = new Date().getHours();
    // Peak hours bonus (evening/night when more active)
    if (hour >= 18 && hour <= 23) {
      return 5; // Evening bonus
    } else if (hour >= 0 && hour <= 4) {
      return 8; // Late night bonus (dedicated players)
    }
    return 0;
  }

  calculateChannelActivityBonus() {
    // More active channels give slightly more XP (encourages engagement)
    const channelId = this.getCurrentChannelId();
    if (!channelId) return 0;

    // This is a simple implementation - could be enhanced with channel activity tracking
    // For now, just a small bonus for being active
    return 2;
  }

  // Get total Luck buff percentage (helper method)
  getTotalLuckBuff() {
    if (
      this.settings.stats.luck > 0 &&
      Array.isArray(this.settings.luckBuffs) &&
      this.settings.luckBuffs.length > 0
    ) {
      return this.settings.luckBuffs.reduce((sum, buff) => sum + buff, 0);
    }
    return 0;
  }

  getRankMultiplier() {
    const rankMultipliers = {
      E: 1.0,
      D: 1.1,
      C: 1.2,
      B: 1.3,
      A: 1.4,
      S: 1.5,
      SS: 1.7,
      SSS: 1.9,
      'SSS+': 2.1,
      NH: 2.3, // National Hunter
      Monarch: 2.6,
      'Monarch+': 3.0,
      'Shadow Monarch': 3.5, // Shadow Monarch (Final)
    };
    return rankMultipliers[this.settings.rank] || 1.0;
  }

  getXPRequiredForLevel(level) {
    // Exponential scaling: baseXP * (level ^ 1.5)
    // No level cap - unlimited progression
    const baseXP = 100;
    return Math.round(baseXP * Math.pow(level, 1.5));
  }

  getCurrentLevel() {
    let level = 1;
    let totalXPNeeded = 0;
    let xpForNextLevel = 0;

    // Calculate level based on total XP
    while (true) {
      xpForNextLevel = this.getXPRequiredForLevel(level);
      if (totalXPNeeded + xpForNextLevel > this.settings.totalXP) {
        break;
      }
      totalXPNeeded += xpForNextLevel;
      level++;
    }

    return {
      level: level,
      xp: this.settings.totalXP - totalXPNeeded,
      xpRequired: xpForNextLevel,
      totalXPNeeded: totalXPNeeded,
    };
  }

  checkLevelUp(oldLevel) {
    try {
      this.debugLog('CHECK_LEVEL_UP', 'Checking for level up', { oldLevel });

      const levelInfo = this.getCurrentLevel();
      const newLevel = levelInfo.level;

      if (newLevel > oldLevel) {
        // LEVEL UP!
        const levelsGained = newLevel - oldLevel;
        this.settings.level = newLevel;
        this.settings.xp = levelInfo.xp;
        this.settings.unallocatedStatPoints += levelsGained; // Award stat points for each level

        this.debugLog('CHECK_LEVEL_UP', 'Level up detected!', {
          oldLevel,
          newLevel,
          levelsGained,
          unallocatedPoints: this.settings.unallocatedStatPoints,
        });

        // Emit level changed event for real-time progress bar updates
        this.emitLevelChanged(oldLevel, newLevel);

        // Save immediately on level up (critical event)
        try {
          this.saveSettings(true);
          this.debugLog('CHECK_LEVEL_UP', 'Settings saved after level up');
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'save_after_levelup' });
        }

        // Show level up notification
        try {
          this.showLevelUpNotification(newLevel, oldLevel);
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'show_notification' });
        }

        // Check for level achievements
        try {
          this.checkAchievements();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'check_achievements' });
        }

        // Check for rank promotion (after level up)
        try {
          this.checkRankPromotion();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'check_rank_promotion' });
        }

        // Update chat UI after level up
        try {
          this.updateChatUI();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'update_ui' });
        }
      } else {
        // Update current XP
        this.settings.xp = levelInfo.xp;
        // Emit XP changed event (level didn't change but XP did)
        this.emitXPChanged();
        // Update chat UI
        try {
          this.updateChatUI();
        } catch (error) {
          this.debugError('CHECK_LEVEL_UP', error, { phase: 'update_ui_no_levelup' });
        }
      }
    } catch (error) {
      this.debugError('CHECK_LEVEL_UP', error, { oldLevel });
    }
  }

  getRankRequirements() {
    // Rank requirements: [level, achievements required, description]
    return {
      E: { level: 1, achievements: 0, name: 'E-Rank Hunter', next: 'D' },
      D: { level: 10, achievements: 2, name: 'D-Rank Hunter', next: 'C' },
      C: { level: 25, achievements: 5, name: 'C-Rank Hunter', next: 'B' },
      B: { level: 50, achievements: 10, name: 'B-Rank Hunter', next: 'A' },
      A: { level: 100, achievements: 15, name: 'A-Rank Hunter', next: 'S' },
      S: { level: 200, achievements: 20, name: 'S-Rank Hunter', next: 'SS' },
      SS: { level: 300, achievements: 22, name: 'SS-Rank Hunter', next: 'SSS' },
      SSS: { level: 400, achievements: 24, name: 'SSS-Rank Hunter', next: 'SSS+' },
      'SSS+': { level: 500, achievements: 26, name: 'SSS+-Rank Hunter', next: 'NH' },
      NH: { level: 700, achievements: 28, name: 'National Hunter', next: 'Monarch' },
      Monarch: { level: 1000, achievements: 30, name: 'Monarch', next: 'Monarch+' },
      'Monarch+': { level: 1500, achievements: 33, name: 'Monarch+', next: 'Shadow Monarch' },
      'Shadow Monarch': { level: 2000, achievements: 35, name: 'Shadow Monarch', next: null },
    };
  }

  checkRankPromotion() {
    try {
      this.debugLog('CHECK_RANK_PROMOTION', 'Checking for rank promotion', {
        currentRank: this.settings.rank,
        level: this.settings.level,
        achievements: this.settings.achievements.unlocked.length,
      });

      const rankRequirements = this.getRankRequirements();
      const currentRank = this.settings.rank;
      const currentReq = rankRequirements[currentRank];

      if (!currentReq || !currentReq.next) {
        this.debugLog('CHECK_RANK_PROMOTION', 'Already at max rank or invalid rank');
        return; // Already at max rank or invalid rank
      }

      const nextRank = currentReq.next;
      const nextReq = rankRequirements[nextRank];

      // Check if requirements are met
      const levelMet = this.settings.level >= nextReq.level;
      const achievementsMet = this.settings.achievements.unlocked.length >= nextReq.achievements;

      this.debugLog('CHECK_RANK_PROMOTION', 'Requirements check', {
        nextRank,
        levelMet,
        levelRequired: nextReq.level,
        currentLevel: this.settings.level,
        achievementsMet,
        achievementsRequired: nextReq.achievements,
        currentAchievements: this.settings.achievements.unlocked.length,
      });

      if (levelMet && achievementsMet) {
        // RANK PROMOTION!
        const oldRank = this.settings.rank;
        this.settings.rank = nextRank;

        this.debugLog('CHECK_RANK_PROMOTION', 'Rank promotion!', {
          oldRank,
          newRank: nextRank,
          level: this.settings.level,
          achievements: this.settings.achievements.unlocked.length,
        });

        // Emit rank changed event for real-time progress bar updates
        this.emitRankChanged(oldRank, nextRank);

        // Add to rank history
        if (!this.settings.rankHistory) {
          this.settings.rankHistory = [];
        }
        this.settings.rankHistory.push({
          rank: nextRank,
          level: this.settings.level,
          achievements: this.settings.achievements.unlocked.length,
          timestamp: Date.now(),
        });

        // Save immediately on rank promotion (critical event)
        try {
          this.saveSettings(true);
          this.debugLog('CHECK_RANK_PROMOTION', 'Settings saved after rank promotion');
        } catch (error) {
          this.debugError('CHECK_RANK_PROMOTION', error, { phase: 'save_after_promotion' });
        }

        // Show rank promotion notification
        try {
          this.showRankPromotionNotification(oldRank, nextRank, nextReq);
        } catch (error) {
          this.debugError('CHECK_RANK_PROMOTION', error, { phase: 'show_notification' });
        }

        // Update chat UI
        try {
          this.updateChatUI();
        } catch (error) {
          this.debugError('CHECK_RANK_PROMOTION', error, { phase: 'update_ui' });
        }
      }
    } catch (error) {
      this.debugError('CHECK_RANK_PROMOTION', error, {
        currentRank: this.settings.rank,
        level: this.settings.level,
      });
    }
  }

  showRankPromotionNotification(oldRank, newRank, rankInfo) {
    const message =
      `[SYSTEM] Rank Promotion!\n\n` +
      `Rank Up: ${oldRank} → ${newRank}\n` +
      `New Title: ${rankInfo.name}\n` +
      `Level: ${this.settings.level}\n` +
      `Achievements: ${this.settings.achievements.unlocked.length}\n` +
      `XP Multiplier: ${(this.getRankMultiplier() * 100).toFixed(0)}%`;

    this.showNotification(message, 'success', 6000);

    console.log(`Rank Promotion! ${oldRank} → ${newRank} (${rankInfo.name})`);
  }

  showLevelUpNotification(newLevel, oldLevel) {
    const levelInfo = this.getCurrentLevel();
    const bonusPoints = newLevel * 50;
    const levelsGained = newLevel - oldLevel;
    const rankInfo = this.getRankRequirements()[this.settings.rank];

    const message =
      `[SYSTEM] Level up detected. HP fully restored.\n\n` +
      `LEVEL UP! You're now Level ${newLevel}!\n` +
      `Rank: ${this.settings.rank} - ${rankInfo.name}\n` +
      `HP: ${oldLevel * 10}/${oldLevel * 10} → ${newLevel * 10}/${newLevel * 10}\n` +
      `Bonus: +${bonusPoints} points!\n` +
      `+${levelsGained} stat point(s)! Use settings to allocate stats`;

    this.showNotification(message, 'success', 5000);

    // Play level up sound/effect (optional)
    console.log(`LEVEL UP! ${oldLevel} → ${newLevel} (Rank: ${this.settings.rank})`);
  }

  showNotification(message, type = 'info', timeout = 3000) {
    try {
      if (BdApi && typeof BdApi.showToast === 'function') {
        BdApi.showToast(message, {
          type: type,
          timeout: timeout,
        });
      } else {
        // Fallback: log to console if showToast is not available
        // OPTIMIZED: Removed verbose logging for notifications
        // this.debugLog('NOTIFICATION', `${type.toUpperCase()}: ${message}`);
      }
    } catch (error) {
      this.debugError('NOTIFICATION', error);
    }
  }

  // ============================================================================
  // PHASE 3: Stat System (Placeholder - will implement in next phase)
  // ============================================================================

  allocateStatPoint(statName) {
    // Normalize stat name (handle case variations)
    if (!statName) {
      this.debugError('ALLOCATE_STAT', new Error('No stat name provided'), {
        statName,
        type: typeof statName,
      });
      this.debugError('INVALID_STAT', new Error('Invalid stat name!'));
      this.showNotification('Invalid stat name!', 'error', 2000);
      return false;
    }

    // Convert to string and normalize
    statName = String(statName).toLowerCase().trim();

    // Map common variations
    const statMap = {
      str: 'strength',
      agi: 'agility',
      int: 'intelligence',
      vit: 'vitality',
      luk: 'luck',
      luck: 'luck',
    };

    if (statMap[statName]) {
      statName = statMap[statName];
    }

    this.debugLog('ALLOCATE_STAT', 'Attempting allocation', {
      originalStatName: statName,
      normalizedStatName: statName,
      unallocatedPoints: this.settings.unallocatedStatPoints,
      availableStats: Object.keys(this.settings.stats),
      statExists: statName in this.settings.stats,
      statValue: this.settings.stats[statName],
      statsObject: this.settings.stats,
    });

    if (this.settings.unallocatedStatPoints <= 0) {
      this.showNotification('No stat points available!', 'error', 2000);
      return false;
    }

    if (!(statName in this.settings.stats)) {
      this.debugError('ALLOCATE_STAT', new Error(`Invalid stat name: ${statName}`), {
        providedName: statName,
        availableStats: Object.keys(this.settings.stats),
        statsObject: this.settings.stats,
      });
      this.debugError('INVALID_STAT', new Error('Invalid stat name!'));
      this.showNotification(`Invalid stat name: ${statName}!`, 'error', 2000);
      return false;
    }

    // Check max (20 per stat)
    if (this.settings.stats[statName] >= 20) {
      this.showNotification(
        `${statName.charAt(0).toUpperCase() + statName.slice(1)} is already maxed!`,
        'error',
        2000
      );
      return false;
    }

    const oldValue = this.settings.stats[statName];
    this.settings.stats[statName]++;
    this.settings.unallocatedStatPoints--;

    // Special handling for Luck: Generate random buff that stacks
    if (statName === 'luck') {
      // Generate random buff between 2% and 8% (can be adjusted)
      const randomBuff = Math.random() * 6 + 2; // 2% to 8%
      const roundedBuff = Math.round(randomBuff * 10) / 10; // Round to 1 decimal

      // Initialize luckBuffs array if it doesn't exist
      if (!Array.isArray(this.settings.luckBuffs)) {
        this.settings.luckBuffs = [];
      }

      // Add the new buff to the stack
      this.settings.luckBuffs.push(roundedBuff);

      // Calculate total stacked buff
      const totalLuckBuff =
        typeof this.getTotalLuckBuff === 'function' ? this.getTotalLuckBuff() : 0;

      this.debugLog('ALLOCATE_STAT_LUCK', 'Random luck buff generated', {
        newBuff: roundedBuff,
        totalBuffs: this.settings.luckBuffs.length,
        allBuffs: [...this.settings.luckBuffs],
        totalStackedBuff: totalLuckBuff.toFixed(1) + '%',
        luckStat: this.settings.stats.luck,
      });

      // Show notification with buff info
      this.showNotification(
        `+1 Luck! (${oldValue} → ${
          this.settings.stats[statName]
        })\nRandom Buff: +${roundedBuff.toFixed(1)}% (Total: +${totalLuckBuff.toFixed(
          1
        )}% stacked)`,
        'success',
        5000
      );

      // Save immediately
      this.saveSettings(true);
      this.updateChatUI();

      this.debugLog('ALLOCATE_STAT', 'Luck stat point allocated with buff', {
        statName,
        oldValue,
        newValue: this.settings.stats[statName],
        newBuff: roundedBuff,
        totalStackedBuff: totalLuckBuff,
        remainingPoints: this.settings.unallocatedStatPoints,
      });

      return true;
    }

    // Calculate new effect strength for feedback (for non-luck stats)
    const statEffects = {
      strength: `+${(this.settings.stats[statName] * 5).toFixed(0)}% XP per message`,
      agility: `+${(this.settings.stats[statName] * 2).toFixed(0)}% crit chance (capped 25%), +${
        this.settings.stats[statName]
      }% EXP per crit`,
      intelligence: `+${(
        this.settings.stats[statName] * 10 +
        Math.max(0, (this.settings.stats[statName] - 5) * 2)
      ).toFixed(0)}% bonus XP (long messages)`,
      vitality: `+${(this.settings.stats[statName] * 5).toFixed(0)}% quest rewards`,
      luck: `+${(this.settings.stats[statName] * 1).toFixed(
        0
      )}% random bonus chance (up to ${Math.min(50, this.settings.stats[statName] * 1).toFixed(
        0
      )}%)`,
    };

    const effectText = statEffects[statName] || 'Effect applied';

    // Show success notification with effect info
    this.showNotification(
      `+1 ${statName.charAt(0).toUpperCase() + statName.slice(1)}! (${oldValue} → ${
        this.settings.stats[statName]
      })\n${effectText}`,
      'success',
      4000
    );

    // Save immediately on stat allocation (important change)
    this.saveSettings(true);

    // Update chat UI
    this.updateChatUI();

    // Debug log
    this.debugLog('ALLOCATE_STAT', 'Stat point allocated successfully', {
      statName,
      oldValue,
      newValue: this.settings.stats[statName],
      remainingPoints: this.settings.unallocatedStatPoints,
      effect: effectText,
    });

    return true;
  }

  // ============================================================================
  // PHASE 4: Achievement System
  // ============================================================================

  checkAchievements() {
    const achievements = this.getAchievementDefinitions();
    let newAchievements = [];

    achievements.forEach((achievement) => {
      // Skip if already unlocked
      if (this.settings.achievements.unlocked.includes(achievement.id)) {
        return;
      }

      // Check if achievement is unlocked
      if (this.checkAchievementCondition(achievement)) {
        this.unlockAchievement(achievement);
        newAchievements.push(achievement);
      }
    });

    return newAchievements;
  }

  getAchievementDefinitions() {
    return [
      // Early Game - E-Rank Hunter Titles
      {
        id: 'weakest_hunter',
        name: 'The Weakest Hunter',
        description: 'Send 50 messages',
        condition: { type: 'messages', value: 50 },
        title: 'The Weakest Hunter',
        titleBonus: { xp: 0.03, strength: 1 }, // +3% XP, +1 Strength
      },
      {
        id: 'e_rank',
        name: 'E-Rank Hunter',
        description: 'Send 200 messages',
        condition: { type: 'messages', value: 200 },
        title: 'E-Rank Hunter',
        titleBonus: { xp: 0.08 }, // +8% XP
      },
      {
        id: 'd_rank',
        name: 'D-Rank Hunter',
        description: 'Send 500 messages',
        condition: { type: 'messages', value: 500 },
        title: 'D-Rank Hunter',
        titleBonus: { xp: 0.12 }, // +12% XP
      },
      {
        id: 'c_rank',
        name: 'C-Rank Hunter',
        description: 'Send 1,000 messages',
        condition: { type: 'messages', value: 1000 },
        title: 'C-Rank Hunter',
        titleBonus: { xp: 0.18 }, // +18% XP
      },
      {
        id: 'b_rank',
        name: 'B-Rank Hunter',
        description: 'Send 2,500 messages',
        condition: { type: 'messages', value: 2500 },
        title: 'B-Rank Hunter',
        titleBonus: { xp: 0.25 }, // +25% XP
      },
      {
        id: 'a_rank',
        name: 'A-Rank Hunter',
        description: 'Send 5,000 messages',
        condition: { type: 'messages', value: 5000 },
        title: 'A-Rank Hunter',
        titleBonus: { xp: 0.32 }, // +32% XP
      },
      {
        id: 's_rank',
        name: 'S-Rank Hunter',
        description: 'Send 10,000 messages',
        condition: { type: 'messages', value: 10000 },
        title: 'S-Rank Hunter',
        titleBonus: { xp: 0.4, strength: 2, critChance: 0.02 }, // +40% XP, +2 Strength, +2% Crit Chance
      },
      // Character/Writing Milestones
      {
        id: 'shadow_extraction',
        name: 'Shadow Extraction',
        description: 'Type 25,000 characters',
        condition: { type: 'characters', value: 25000 },
        title: 'Shadow Extraction',
        titleBonus: { xp: 0.15, critChance: 0.02, agility: 1 }, // +15% XP, +2% Crit Chance, +1 Agility
      },
      {
        id: 'domain_expansion',
        name: 'Domain Expansion',
        description: 'Type 75,000 characters',
        condition: { type: 'characters', value: 75000 },
        title: 'Domain Expansion',
        titleBonus: { xp: 0.22 }, // +22% XP
      },
      {
        id: 'ruler_authority',
        name: "Ruler's Authority",
        description: 'Type 150,000 characters',
        condition: { type: 'characters', value: 150000 },
        title: "Ruler's Authority",
        titleBonus: { xp: 0.3 }, // +30% XP
      },
      // Level Milestones
      {
        id: 'awakened',
        name: 'The Awakened',
        description: 'Reach Level 15',
        condition: { type: 'level', value: 15 },
        title: 'The Awakened',
        titleBonus: { xp: 0.1 }, // +10% XP
      },
      {
        id: 'shadow_army',
        name: 'Shadow Army Commander',
        description: 'Reach Level 30',
        condition: { type: 'level', value: 30 },
        title: 'Shadow Army Commander',
        titleBonus: { xp: 0.2 }, // +20% XP
      },
      {
        id: 'necromancer',
        name: 'Necromancer',
        description: 'Reach Level 50',
        condition: { type: 'level', value: 50 },
        title: 'Necromancer',
        titleBonus: { xp: 0.28 }, // +28% XP
      },
      {
        id: 'national_level',
        name: 'National Level Hunter',
        description: 'Reach Level 75',
        condition: { type: 'level', value: 75 },
        title: 'National Level Hunter',
        titleBonus: { xp: 0.35 }, // +35% XP
      },
      {
        id: 'monarch_candidate',
        name: 'Monarch Candidate',
        description: 'Reach Level 100',
        condition: { type: 'level', value: 100 },
        title: 'Monarch Candidate',
        titleBonus: { xp: 0.42 }, // +42% XP
      },
      // Activity/Time Milestones
      {
        id: 'dungeon_grinder',
        name: 'Dungeon Grinder',
        description: 'Be active for 5 hours',
        condition: { type: 'time', value: 300 }, // minutes
        title: 'Dungeon Grinder',
        titleBonus: { xp: 0.06 }, // +6% XP
      },
      {
        id: 'gate_explorer',
        name: 'Gate Explorer',
        description: 'Be active for 20 hours',
        condition: { type: 'time', value: 1200 },
        title: 'Gate Explorer',
        titleBonus: { xp: 0.14 }, // +14% XP
      },
      {
        id: 'raid_veteran',
        name: 'Raid Veteran',
        description: 'Be active for 50 hours',
        condition: { type: 'time', value: 3000 },
        title: 'Raid Veteran',
        titleBonus: { xp: 0.24 }, // +24% XP
      },
      {
        id: 'eternal_hunter',
        name: 'Eternal Hunter',
        description: 'Be active for 100 hours',
        condition: { type: 'time', value: 6000 },
        title: 'Eternal Hunter',
        titleBonus: { xp: 0.33 }, // +33% XP
      },
      // Channel/Exploration Milestones
      {
        id: 'gate_traveler',
        name: 'Gate Traveler',
        description: 'Visit 5 unique channels',
        condition: { type: 'channels', value: 5 },
        title: 'Gate Traveler',
        titleBonus: { xp: 0.04 }, // +4% XP
      },
      {
        id: 'dungeon_master',
        name: 'Dungeon Master',
        description: 'Visit 15 unique channels',
        condition: { type: 'channels', value: 15 },
        title: 'Dungeon Master',
        titleBonus: { xp: 0.11 }, // +11% XP
      },
      {
        id: 'dimension_walker',
        name: 'Dimension Walker',
        description: 'Visit 30 unique channels',
        condition: { type: 'channels', value: 30 },
        title: 'Dimension Walker',
        titleBonus: { xp: 0.19 }, // +19% XP
      },
      {
        id: 'realm_conqueror',
        name: 'Realm Conqueror',
        description: 'Visit 50 unique channels',
        condition: { type: 'channels', value: 50 },
        title: 'Realm Conqueror',
        titleBonus: { xp: 0.27 }, // +27% XP
      },
      // Special Titles (High Requirements)
      {
        id: 'shadow_monarch',
        name: 'Shadow Monarch',
        description: 'Reach Level 50 and send 5,000 messages',
        condition: { type: 'level', value: 50 },
        title: 'Shadow Monarch',
        titleBonus: { xp: 0.38, critChance: 0.03, agility: 2, strength: 1 }, // +38% XP, +3% Crit Chance, +2 Agility, +1 Strength
      },
      {
        id: 'monarch_of_destruction',
        name: 'Monarch of Destruction',
        description: 'Reach Level 75 and type 100,000 characters',
        condition: { type: 'level', value: 75 },
        title: 'Monarch of Destruction',
        titleBonus: { xp: 0.45 }, // +45% XP
      },
      {
        id: 'the_ruler',
        name: 'The Ruler',
        description: 'Reach Level 100 and be active for 50 hours',
        condition: { type: 'level', value: 100 },
        title: 'The Ruler',
        titleBonus: {
          xp: 0.5,
          critChance: 0.05,
          strength: 2,
          agility: 2,
          intelligence: 2,
          vitality: 2,
          luck: 1,
        }, // +50% XP, +5% Crit Chance, +2 All Stats, +1 Luck
      },
      // Character-Based Titles
      {
        id: 'sung_jin_woo',
        name: 'Sung Jin-Woo',
        description: 'Reach Level 50, send 5,000 messages, and type 100,000 characters',
        condition: { type: 'level', value: 50 },
        title: 'Sung Jin-Woo',
        titleBonus: { xp: 0.35 }, // +35% XP
      },
      {
        id: 'the_weakest',
        name: 'The Weakest',
        description: 'Send your first 10 messages',
        condition: { type: 'messages', value: 10 },
        title: 'The Weakest',
        titleBonus: { xp: 0.02 }, // +2% XP
      },
      {
        id: 's_rank_jin_woo',
        name: 'S-Rank Hunter Jin-Woo',
        description: 'Reach S-Rank and Level 50',
        condition: { type: 'level', value: 50 },
        title: 'S-Rank Hunter Jin-Woo',
        titleBonus: { xp: 0.42 }, // +42% XP
      },
      {
        id: 'shadow_sovereign',
        name: 'Shadow Sovereign',
        description: 'Reach Level 60 and send 7,500 messages',
        condition: { type: 'level', value: 60 },
        title: 'Shadow Sovereign',
        titleBonus: { xp: 0.4 }, // +40% XP
      },
      {
        id: 'ashborn_successor',
        name: "Ashborn's Successor",
        description: 'Reach Level 75 and type 200,000 characters',
        condition: { type: 'level', value: 75 },
        title: "Ashborn's Successor",
        titleBonus: { xp: 0.48, critChance: 0.04, intelligence: 2, agility: 2 }, // +48% XP, +4% Crit Chance, +2 Intelligence, +2 Agility
      },
      // Ability/Skill Titles
      {
        id: 'arise',
        name: 'Arise',
        description: 'Unlock 10 achievements',
        condition: { type: 'achievements', value: 10 },
        title: 'Arise',
        titleBonus: { xp: 0.12 }, // +12% XP
      },
      {
        id: 'shadow_exchange',
        name: 'Shadow Exchange',
        description: 'Send 3,000 messages',
        condition: { type: 'messages', value: 3000 },
        title: 'Shadow Exchange',
        titleBonus: { xp: 0.2 }, // +20% XP
      },
      {
        id: 'dagger_throw_master',
        name: 'Dagger Throw Master',
        description:
          'Land 1,000 critical hits. Special: Agility% chance for 1000x crit multiplier!',
        condition: { type: 'crits', value: 1000 },
        title: 'Dagger Throw Master',
        titleBonus: { xp: 0.25, critChance: 0.05, agility: 2 }, // +25% XP, +5% Crit Chance, +2 Agility
      },
      {
        id: 'stealth_master',
        name: 'Stealth Master',
        description: 'Be active for 30 hours during off-peak hours',
        condition: { type: 'time', value: 1800 },
        title: 'Stealth Master',
        titleBonus: { xp: 0.18 }, // +18% XP
      },
      {
        id: 'mana_manipulator',
        name: 'Mana Manipulator',
        description: 'Reach 15 Intelligence stat',
        condition: { type: 'stat', stat: 'intelligence', value: 15 },
        title: 'Mana Manipulator',
        titleBonus: { xp: 0.22, intelligence: 2 }, // +22% XP, +2 Intelligence
      },
      {
        id: 'shadow_storage',
        name: 'Shadow Storage',
        description: 'Visit 25 unique channels',
        condition: { type: 'channels', value: 25 },
        title: 'Shadow Storage',
        titleBonus: { xp: 0.16 }, // +16% XP
      },
      {
        id: 'beast_monarch',
        name: 'Beast Monarch',
        description: 'Reach 15 Strength stat',
        condition: { type: 'stat', stat: 'strength', value: 15 },
        title: 'Beast Monarch',
        titleBonus: { xp: 0.28, strength: 2 }, // +28% XP, +2 Strength
      },
      {
        id: 'frost_monarch',
        name: 'Frost Monarch',
        description: 'Send 8,000 messages',
        condition: { type: 'messages', value: 8000 },
        title: 'Frost Monarch',
        titleBonus: { xp: 0.3 }, // +30% XP
      },
      {
        id: 'plague_monarch',
        name: 'Plague Monarch',
        description: 'Reach Level 65',
        condition: { type: 'level', value: 65 },
        title: 'Plague Monarch',
        titleBonus: { xp: 0.32 }, // +32% XP
      },
      {
        id: 'monarch_white_flames',
        name: 'Monarch of White Flames',
        description: 'Land 500 critical hits',
        condition: { type: 'crits', value: 500 },
        title: 'Monarch of White Flames',
        titleBonus: { xp: 0.26, critChance: 0.04, agility: 1 }, // +26% XP, +4% Crit Chance, +1 Agility
      },
      {
        id: 'monarch_transfiguration',
        name: 'Monarch of Transfiguration',
        description: 'Reach Level 70 and type 150,000 characters',
        condition: { type: 'level', value: 70 },
        title: 'Monarch of Transfiguration',
        titleBonus: { xp: 0.34 }, // +34% XP
      },
      // Solo Leveling Lore Titles
      {
        id: 'shadow_soldier',
        name: 'Shadow Soldier',
        description: 'Land 100 critical hits',
        condition: { type: 'crits', value: 100 },
        title: 'Shadow Soldier',
        titleBonus: { xp: 0.08, critChance: 0.01, agility: 1 }, // +8% XP, +1% Crit, +1 AGI
      },
      {
        id: 'kamish_slayer',
        name: 'Kamish Slayer',
        description: 'Reach Level 80 and land 2,000 critical hits',
        condition: { type: 'level', value: 80 },
        title: 'Kamish Slayer',
        titleBonus: { xp: 0.4, critChance: 0.05, strength: 2, agility: 2 }, // +40% XP, +5% Crit, +2 STR, +2 AGI
      },
      {
        id: 'demon_tower_conqueror',
        name: 'Demon Tower Conqueror',
        description: 'Reach Level 60 and visit 40 unique channels',
        condition: { type: 'level', value: 60 },
        title: 'Demon Tower Conqueror',
        titleBonus: { xp: 0.32, intelligence: 2, vitality: 1 }, // +32% XP, +2 INT, +1 VIT
      },
      {
        id: 'double_awakening',
        name: 'Double Awakening',
        description: 'Reach Level 25 and send 3,500 messages',
        condition: { type: 'level', value: 25 },
        title: 'Double Awakening',
        titleBonus: { xp: 0.15, critChance: 0.02, strength: 1, agility: 1 }, // +15% XP, +2% Crit, +1 STR, +1 AGI
      },
      {
        id: 'system_user',
        name: 'System User',
        description: 'Unlock 15 achievements',
        condition: { type: 'achievements', value: 15 },
        title: 'System User',
        titleBonus: { xp: 0.2, intelligence: 2, luck: 1 }, // +20% XP, +2 INT, +1 LUK
      },
      {
        id: 'instant_dungeon_master',
        name: 'Instant Dungeon Master',
        description: 'Type 200,000 characters and be active for 75 hours',
        condition: { type: 'characters', value: 200000 },
        title: 'Instant Dungeon Master',
        titleBonus: { xp: 0.35, intelligence: 2, vitality: 2 }, // +35% XP, +2 INT, +2 VIT
      },
      {
        id: 'shadow_army_general',
        name: 'Shadow Army General',
        description: 'Reach Level 55 and land 750 critical hits',
        condition: { type: 'level', value: 55 },
        title: 'Shadow Army General',
        titleBonus: { xp: 0.3, critChance: 0.03, agility: 2, strength: 1 }, // +30% XP, +3% Crit, +2 AGI, +1 STR
      },
      {
        id: 'monarch_of_beasts',
        name: 'Monarch of Beasts',
        description: 'Reach 18 Strength stat',
        condition: { type: 'stat', stat: 'strength', value: 18 },
        title: 'Monarch of Beasts',
        titleBonus: { xp: 0.32, strength: 3, critChance: 0.02 }, // +32% XP, +3 STR, +2% Crit
      },
      {
        id: 'monarch_of_insects',
        name: 'Monarch of Insects',
        description: 'Send 12,000 messages',
        condition: { type: 'messages', value: 12000 },
        title: 'Monarch of Insects',
        titleBonus: { xp: 0.42, agility: 2, intelligence: 1 }, // +42% XP, +2 AGI, +1 INT
      },
      {
        id: 'monarch_of_iron_body',
        name: 'Monarch of Iron Body',
        description: 'Reach 18 Vitality stat',
        condition: { type: 'stat', stat: 'vitality', value: 18 },
        title: 'Monarch of Iron Body',
        titleBonus: { xp: 0.3, vitality: 3, strength: 1 }, // +30% XP, +3 VIT, +1 STR
      },
      {
        id: 'monarch_of_beginning',
        name: 'Monarch of Beginning',
        description: 'Reach Level 90 and unlock 20 achievements',
        condition: { type: 'level', value: 90 },
        title: 'Monarch of Beginning',
        titleBonus: { xp: 0.45, critChance: 0.04, strength: 2, agility: 2, intelligence: 2 }, // +45% XP, +4% Crit, +2 All Combat Stats
      },
      {
        id: 'absolute_ruler',
        name: 'Absolute Ruler',
        description: 'Reach Level 120 and type 300,000 characters',
        condition: { type: 'level', value: 120 },
        title: 'Absolute Ruler',
        titleBonus: {
          xp: 0.52,
          critChance: 0.06,
          strength: 3,
          agility: 3,
          intelligence: 2,
          vitality: 2,
          luck: 2,
        }, // +52% XP, +6% Crit, +3 STR/AGI, +2 INT/VIT, +2 LUK
      },
      {
        id: 'shadow_sovereign_heir',
        name: 'Shadow Sovereign Heir',
        description: 'Reach Level 85 and land 1,500 critical hits',
        condition: { type: 'level', value: 85 },
        title: 'Shadow Sovereign Heir',
        titleBonus: { xp: 0.43, critChance: 0.05, agility: 3, intelligence: 2 }, // +43% XP, +5% Crit, +3 AGI, +2 INT
      },
      {
        id: 'ruler_of_chaos',
        name: 'Ruler of Chaos',
        description: 'Reach Level 110 and be active for 150 hours',
        condition: { type: 'level', value: 110 },
        title: 'Ruler of Chaos',
        titleBonus: { xp: 0.48, critChance: 0.05, strength: 2, agility: 2, luck: 2 }, // +48% XP, +5% Crit, +2 STR/AGI, +2 LUK
      },
    ];
  }

  checkAchievementCondition(achievement) {
    const condition = achievement.condition;

    switch (condition.type) {
      case 'messages':
        return this.settings.activity.messagesSent >= condition.value;
      case 'characters':
        return this.settings.activity.charactersTyped >= condition.value;
      case 'level':
        return this.settings.level >= condition.value;
      case 'time':
        return this.settings.activity.timeActive >= condition.value;
      case 'channels':
        const channelsVisited = this.settings.activity?.channelsVisited;
        if (channelsVisited instanceof Set) {
          return channelsVisited.size >= condition.value;
        } else if (Array.isArray(channelsVisited)) {
          return channelsVisited.length >= condition.value;
        }
        return false;
      case 'achievements':
        return (this.settings.achievements?.unlocked?.length || 0) >= condition.value;
      case 'crits':
        return (this.settings.activity?.critsLanded || 0) >= condition.value;
      case 'stat':
        return this.settings.stats?.[condition.stat] >= condition.value;
      default:
        return false;
    }
  }

  unlockAchievement(achievement) {
    // Double-check: prevent duplicate unlocks
    if (this.settings.achievements.unlocked.includes(achievement.id)) {
      this.debugLog('ACHIEVEMENT', 'Achievement already unlocked, skipping', {
        achievementId: achievement.id,
        achievementName: achievement.name,
      });
      return; // Already unlocked, don't show notification again
    }

    // Add to unlocked list
    this.settings.achievements.unlocked.push(achievement.id);

    // Add title if provided
    if (achievement.title && !this.settings.achievements.titles.includes(achievement.title)) {
      this.settings.achievements.titles.push(achievement.title);
    }

    // Set as active title if no title is active
    if (!this.settings.achievements.activeTitle && achievement.title) {
      this.settings.achievements.activeTitle = achievement.title;
    }

    // Show notification
    const message =
      `[SYSTEM] Achievement unlocked: ${achievement.name}\n` +
      `${achievement.description}\n` +
      (achievement.title ? `👑 Title acquired: ${achievement.title}` : '');

    this.showNotification(message, 'success', 5000);

    this.debugLog('ACHIEVEMENT', 'Achievement unlocked', {
      achievementId: achievement.id,
      achievementName: achievement.name,
      title: achievement.title,
      totalUnlocked: this.settings.achievements.unlocked.length,
    });

    // Save immediately on achievement unlock (important event)
    this.saveSettings(true);
  }

  cleanupUnwantedTitles() {
    const unwantedTitles = [
      'Scribe',
      'Wordsmith',
      'Author',
      'Explorer',
      'Wanderer',
      'Apprentice',
      'Message Warrior',
    ];

    let cleaned = false;

    // Remove from unlocked titles
    if (this.settings.achievements?.titles) {
      const beforeCount = this.settings.achievements.titles.length;
      this.settings.achievements.titles = this.settings.achievements.titles.filter(
        (t) => !unwantedTitles.includes(t)
      );
      if (this.settings.achievements.titles.length !== beforeCount) {
        cleaned = true;
      }
    }

    // Unequip if active
    if (
      this.settings.achievements?.activeTitle &&
      unwantedTitles.includes(this.settings.achievements.activeTitle)
    ) {
      this.settings.achievements.activeTitle = null;
      cleaned = true;
    }

    // Remove from unlocked achievements if they exist
    if (this.settings.achievements?.unlocked) {
      const achievements = this.getAchievementDefinitions();
      const unwantedIds = achievements
        .filter((a) => unwantedTitles.includes(a.title))
        .map((a) => a.id);
      if (unwantedIds.length > 0) {
        const beforeCount = this.settings.achievements.unlocked.length;
        this.settings.achievements.unlocked = this.settings.achievements.unlocked.filter(
          (id) => !unwantedIds.includes(id)
        );
        if (this.settings.achievements.unlocked.length !== beforeCount) {
          cleaned = true;
        }
      }
    }

    if (cleaned) {
      this.saveSettings(true);
      this.debugLog('CLEANUP', 'Removed unwanted titles from saved data', {
        removedTitles: unwantedTitles,
      });
    }
  }

  setActiveTitle(title) {
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

    // Allow null to unequip title
    if (title === null || title === '') {
      this.settings.achievements.activeTitle = null;
      this.saveSettings(true);
      if (this.updateChatUI) {
        this.updateChatUI();
      }
      return true;
    }

    // Block unwanted titles
    if (unwantedTitles.includes(title)) {
      return false;
    }

    // Also remove unwanted titles from unlocked titles list
    this.settings.achievements.titles = this.settings.achievements.titles.filter(
      (t) => !unwantedTitles.includes(t)
    );

    if (this.settings.achievements.titles.includes(title)) {
      this.settings.achievements.activeTitle = title;
      // Save immediately on title change
      this.saveSettings(true);
      if (this.updateChatUI) {
        this.updateChatUI();
      }
      return true;
    }
    return false;
  }

  getActiveTitleBonus() {
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
    if (
      !this.settings.achievements.activeTitle ||
      unwantedTitles.includes(this.settings.achievements.activeTitle)
    ) {
      // If active title is unwanted, unequip it
      if (
        this.settings.achievements.activeTitle &&
        unwantedTitles.includes(this.settings.achievements.activeTitle)
      ) {
        this.settings.achievements.activeTitle = null;
        this.saveSettings(true);
      }
      return {
        xp: 0,
        critChance: 0,
        strength: 0,
        agility: 0,
        intelligence: 0,
        vitality: 0,
        luck: 0,
      };
    }

    const achievements = this.getAchievementDefinitions();
    const achievement = achievements.find(
      (a) => a.title === this.settings.achievements.activeTitle
    );

    const bonus = achievement?.titleBonus || { xp: 0 };
    // Ensure all buff types are present (default to 0)
    return {
      xp: bonus.xp || 0,
      critChance: bonus.critChance || 0,
      strength: bonus.strength || 0,
      agility: bonus.agility || 0,
      intelligence: bonus.intelligence || 0,
      vitality: bonus.vitality || 0,
      luck: bonus.luck || 0,
    };
  }

  // ============================================================================
  // PHASE 5: Daily Quest System
  // ============================================================================

  updateQuestProgress(questId, amount) {
    const quest = this.settings.dailyQuests.quests[questId];
    if (!quest || quest.completed) {
      return;
    }

    quest.progress += amount;
    if (quest.progress >= quest.target) {
      quest.completed = true;
      this.completeQuest(questId);
    }
  }

  completeQuest(questId) {
    const questRewards = {
      messageMaster: { xp: 50, statPoints: 1 },
      characterChampion: { xp: 75, statPoints: 0 },
      channelExplorer: { xp: 50, statPoints: 1 },
      activeAdventurer: { xp: 100, statPoints: 0 },
      perfectStreak: { xp: 150, statPoints: 1 },
    };

    const rewards = questRewards[questId];
    if (!rewards) {
      return;
    }

    // Apply vitality bonus to rewards (enhanced by Luck buffs and skill tree)
    // Vitality scales: +5% base per point, +1% per point after 10 (better scaling)
    // Luck buffs enhance Vitality bonus: (base VIT bonus) * (1 + luck multiplier)
    // Skill tree all-stat bonus enhances all stat bonuses
    const vitalityBaseBonus = this.settings.stats.vitality * 0.05;
    const vitalityAdvancedBonus = Math.max(0, (this.settings.stats.vitality - 10) * 0.01);
    const baseVitalityBonus = vitalityBaseBonus + vitalityAdvancedBonus;
    const totalLuckBuff = typeof this.getTotalLuckBuff === 'function' ? this.getTotalLuckBuff() : 0;
    const luckMultiplier = totalLuckBuff / 100;

    // Get skill tree bonuses
    let skillAllStatBonus = 0;
    let skillQuestBonus = 0;
    try {
      const skillBonuses = BdApi.Data.load('SkillTree', 'bonuses');
      if (skillBonuses) {
        if (skillBonuses.allStatBonus > 0) skillAllStatBonus = skillBonuses.allStatBonus;
        if (skillBonuses.questBonus > 0) skillQuestBonus = skillBonuses.questBonus;
      }
    } catch (error) {
      // SkillTree not available
    }

    // Luck and skill tree enhance Vitality: base bonus multiplied by (1 + luck multiplier + skill all-stat bonus)
    const enhancedVitalityBonus =
      baseVitalityBonus * (1 + luckMultiplier + skillAllStatBonus) + skillQuestBonus;
    const vitalityBonus = 1 + enhancedVitalityBonus;
    const xpReward = Math.round(rewards.xp * vitalityBonus);

    // Award rewards
    const oldLevel = this.settings.level;
    this.settings.xp += xpReward;
    this.settings.totalXP += xpReward;
    this.settings.unallocatedStatPoints += rewards.statPoints;

    // Emit XP changed event for real-time progress bar updates
    this.emitXPChanged();

    // Save immediately on quest completion (important event)
    this.saveSettings(true);

    // Check level up (will also save if level up occurs)
    this.checkLevelUp(oldLevel);

    // Show notification
    const questNames = {
      messageMaster: 'Message Master',
      characterChampion: 'Character Champion',
      channelExplorer: 'Channel Explorer',
      activeAdventurer: 'Active Adventurer',
      perfectStreak: 'Perfect Streak',
    };

    const message =
      `[QUEST COMPLETE] ${questNames[questId]}\n` +
      `💰 +${xpReward} XP${rewards.statPoints > 0 ? `, +${rewards.statPoints} stat point(s)` : ''}`;

    this.showNotification(message, 'success', 4000);

    // Quest completion celebration animation
    this.showQuestCompletionCelebration(questNames[questId], xpReward, rewards.statPoints);
  }

  showQuestCompletionCelebration(questName, xpReward, statPoints) {
    try {
      // Find quest card in UI
      const questCards = document.querySelectorAll('.sls-chat-quest-item');
      let questCard = null;

      // Find the completed quest card
      for (const card of questCards) {
        const cardText = card.textContent || '';
        if (cardText.includes(questName) || card.classList.contains('sls-chat-quest-complete')) {
          questCard = card;
          break;
        }
      }

      // Create celebration overlay
      const celebration = document.createElement('div');
      celebration.className = 'sls-quest-celebration';
      celebration.innerHTML = `
        <div class="sls-quest-celebration-content">
          <div class="sls-quest-celebration-icon">🎉</div>
          <div class="sls-quest-celebration-text">QUEST COMPLETE!</div>
          <div class="sls-quest-celebration-name">${this.escapeHtml(questName)}</div>
          <div class="sls-quest-celebration-rewards">
            <div class="sls-quest-reward-item">💰 +${xpReward} XP</div>
            ${
              statPoints > 0
                ? `<div class="sls-quest-reward-item">⭐ +${statPoints} Stat Point${
                    statPoints > 1 ? 's' : ''
                  }</div>`
                : ''
            }
          </div>
        </div>
      `;

      // Position near quest card if found, otherwise center screen
      if (questCard) {
        const rect = questCard.getBoundingClientRect();
        celebration.style.left = `${rect.left + rect.width / 2}px`;
        celebration.style.top = `${rect.top + rect.height / 2}px`;
        celebration.style.transform = 'translate(-50%, -50%)';

        // Highlight quest card
        questCard.classList.add('sls-quest-celebrating');
        setTimeout(() => {
          questCard.classList.remove('sls-quest-celebrating');
        }, 3000);
      } else {
        // Center of screen
        celebration.style.left = '50%';
        celebration.style.top = '50%';
        celebration.style.transform = 'translate(-50%, -50%)';
      }

      document.body.appendChild(celebration);

      // Create particles
      this.createQuestParticles(celebration);

      // Remove after animation
      setTimeout(() => {
        celebration.remove();
      }, 3000);

      this.debugLog('QUEST_CELEBRATION', 'Quest completion celebration shown', {
        questName,
        xpReward,
        statPoints,
      });
    } catch (error) {
      this.debugError('QUEST_CELEBRATION', error);
    }
  }

  createQuestParticles(container) {
    const particleCount = 30;
    const colors = ['#8b5cf6', '#7c3aed', '#6d28d9', '#ffffff', '#00ff88'];

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'sls-quest-particle';
      particle.style.left = '50%';
      particle.style.top = '50%';
      particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

      const angle = (Math.PI * 2 * i) / particleCount;
      const distance = 100 + Math.random() * 50;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;

      particle.style.setProperty('--particle-x', `${x}px`);
      particle.style.setProperty('--particle-y', `${y}px`);

      container.appendChild(particle);

      setTimeout(() => {
        particle.remove();
      }, 2000);
    }
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================================
  // PHASE 6: Settings Panel UI
  // ============================================================================

  // Define as prototype method (like CriticalHit) so BetterDiscord can find it
  // Returns the chat GUI instead of settings panel
  getSettingsPanel() {
    console.log(
      '[SoloLevelingStats] ========== getSettingsPanel() CALLED - Returning Chat GUI =========='
    );
    const plugin = this;

    let container;
    try {
      // Inject chat UI CSS instead of settings CSS
      try {
        this.injectChatUICSS();
        this.debugLog('INJECT_CSS', 'Chat UI CSS injected successfully');
      } catch (error) {
        this.debugError('INJECT_CSS', error);
      }

      // Create container with chat UI
      container = document.createElement('div');
      container.className = 'sls-chat-panel';
      container.id = 'sls-settings-chat-ui';

      // Set chat UI HTML
      container.innerHTML = this.renderChatUI();

      // Attach chat UI listeners
      this.attachChatUIListeners(container);

      // Attach stat button listeners
      setTimeout(() => {
        this.attachStatButtonListeners(container);
      }, 100);

      // OPTIMIZED: Removed verbose logging
      // this.debugLog('GET_SETTINGS_PANEL', 'Returning chat GUI container');
      return container;
    } catch (error) {
      this.debugError('GET_SETTINGS_PANEL', error);
      // Return a fallback container with error message
      const fallback = document.createElement('div');
      fallback.className = 'sls-chat-panel';
      fallback.innerHTML = `<div style="padding: 20px; color: #fff;">Error creating chat GUI: ${error.message}. Check console for details.</div>`;
      return fallback;
    }
  }

  renderStatBar(statName, statKey, currentValue, description, statValue) {
    const maxValue = 20;
    const percentage = (currentValue / maxValue) * 100;
    const canAllocate = this.settings.unallocatedStatPoints > 0 && currentValue < maxValue;

    // Calculate effect strength for visual feedback
    const effectStrength = statValue || currentValue;
    const isMaxed = currentValue >= maxValue;
    const effectClass = isMaxed
      ? 'sls-stat-maxed'
      : effectStrength >= 15
      ? 'sls-stat-strong'
      : effectStrength >= 10
      ? 'sls-stat-medium'
      : 'sls-stat-weak';

    return `
      <div class="sls-stat-item ${effectClass}">
        <div class="sls-stat-header">
          <div class="sls-stat-name">${statName}</div>
          <div class="sls-stat-value">${currentValue}/${maxValue}${isMaxed ? ' (MAX)' : ''}</div>
        </div>
        <div class="sls-stat-bar">
          <div class="sls-stat-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="sls-stat-desc">${description}</div>
        ${
          canAllocate
            ? `<button class="sls-stat-allocate" data-stat="${statKey}" title="Allocate 1 point to ${statName}">+1</button>`
            : isMaxed
            ? '<div class="sls-stat-maxed-badge">MAXED</div>'
            : '<div class="sls-stat-no-points">No points available</div>'
        }
      </div>
    `;
  }

  renderQuest(questId, questName, questDesc, questData) {
    const percentage = (questData.progress / questData.target) * 100;
    const isComplete = questData.completed;

    return `
      <div class="sls-quest-item ${isComplete ? 'sls-quest-complete' : ''}">
        <div class="sls-quest-header">
          <div class="sls-quest-name">${questName}</div>
          <div class="sls-quest-progress">${questData.progress}/${questData.target}</div>
        </div>
        <div class="sls-quest-desc">${questDesc}</div>
        <div class="sls-progress-bar">
          <div class="sls-progress-fill" style="width: ${percentage}%"></div>
        </div>
        ${isComplete ? '<div class="sls-quest-complete-badge">✓ Complete</div>' : ''}
      </div>
    `;
  }

  renderAchievements() {
    const achievements = this.getAchievementDefinitions();
    return achievements
      .map((achievement) => {
        const isUnlocked = this.settings.achievements.unlocked.includes(achievement.id);
        return `
        <div class="sls-achievement-item ${
          isUnlocked ? 'sls-achievement-unlocked' : 'sls-achievement-locked'
        }">
          <div class="sls-achievement-icon">${isUnlocked ? '✓' : '🔒'}</div>
          <div class="sls-achievement-name">${achievement.name}</div>
          <div class="sls-achievement-desc">${achievement.description}</div>
        </div>
      `;
      })
      .join('');
  }

  injectSettingsCSS() {
    if (document.getElementById('solo-leveling-stats-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'solo-leveling-stats-styles';
    style.textContent = `
      /* Dark Purple Glowing Theme - Solo Leveling Aesthetic */
      @keyframes purpleGlow {
        0%, 100% {
          box-shadow: 0 0 4px rgba(138, 43, 226, 0.5), 0 0 6px rgba(138, 43, 226, 0.3);
        }
        50% {
          box-shadow: 0 0 6px rgba(138, 43, 226, 0.8), 0 0 8px rgba(138, 43, 226, 0.5), 0 0 10px rgba(138, 43, 226, 0.3);
        }
      }

      @keyframes pulseGlow {
        0%, 100% {
          text-shadow: 0 0 4px rgba(138, 43, 226, 0.8), 0 0 6px rgba(138, 43, 226, 0.6);
        }
        50% {
          text-shadow: 0 0 6px rgba(138, 43, 226, 1), 0 0 8px rgba(138, 43, 226, 0.8), 0 0 10px rgba(138, 43, 226, 0.6);
        }
      }

      @keyframes progressGlow {
        0%, 100% {
          box-shadow: 0 0 4px rgba(138, 43, 226, 0.6), inset 0 0 4px rgba(138, 43, 226, 0.3);
        }
        50% {
          box-shadow: 0 0 6px rgba(138, 43, 226, 0.9), inset 0 0 5px rgba(138, 43, 226, 0.5);
        }
      }

      .solo-leveling-stats-settings {
        padding: 0;
        color: #e0d0ff;
        background: #0a0a0f;
        position: relative;
      }

      /* Ensure BetterDiscord's toggle arrow is clickable */
      .solo-leveling-stats-settings > [class*="collapse"],
      .solo-leveling-stats-settings [class*="collapse"],
      .bd-plugin-header [class*="collapse"],
      .bd-plugin-header button[aria-label*="collapse"],
      .bd-plugin-header button[aria-label*="expand"] {
        pointer-events: auto !important;
        z-index: 100 !important;
        position: relative !important;
      }

      /* Ensure the plugin header itself doesn't block clicks */
      .bd-plugin-body .bd-plugin-header {
        pointer-events: auto !important;
      }

      /* Make sure the header content doesn't overlap the toggle */
      .solo-leveling-stats-settings .sls-header {
        margin-left: 0 !important;
        padding-left: 50px !important;
      }

      .sls-header {
        padding: 24px 28px 24px 50px; /* Left padding for BetterDiscord's toggle arrow */
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.15) 0%, rgba(75, 0, 130, 0.1) 100%);
        border-bottom: 2px solid rgba(138, 43, 226, 0.4);
        margin-bottom: 28px;
        box-shadow: 0 2px 6px rgba(138, 43, 226, 0.2);
        animation: purpleGlow 3s ease-in-out infinite;
        position: relative;
        z-index: 1; /* Ensure header is above other elements */
      }

      .sls-title h2 {
        margin: 0;
        font-size: 28px;
        font-weight: 700;
        color: #d4a5ff;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.8), 0 0 6px rgba(138, 43, 226, 0.5);
        animation: pulseGlow 2s ease-in-out infinite;
      }

      .sls-subtitle {
        color: #b894e6;
        font-size: 14px;
        margin-top: 6px;
        text-shadow: 0 0 5px rgba(138, 43, 226, 0.5);
      }

      .sls-content {
        padding: 0 28px 28px;
        background: #0f0f15;
      }

      .sls-section {
        margin-bottom: 36px;
        padding-bottom: 28px;
        border-bottom: 1px solid rgba(138, 43, 226, 0.2);
      }

      .sls-section:last-child {
        border-bottom: none;
      }

      .sls-section-title {
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 18px;
        color: #d4a5ff;
        text-shadow: 0 0 8px rgba(138, 43, 226, 0.6);
      }

      .sls-level-display {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.1) 0%, rgba(75, 0, 130, 0.05) 100%);
        padding: 24px;
        border-radius: 12px;
        border: 1px solid rgba(138, 43, 226, 0.3);
        box-shadow: 0 0 5px rgba(138, 43, 226, 0.2), inset 0 0 6px rgba(138, 43, 226, 0.1);
      }

      .sls-level-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }

      .sls-rank-display {
        font-size: 18px;
        font-weight: 700;
        color: #ba55d3;
        padding: 8px 12px;
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.2) 0%, rgba(75, 0, 130, 0.15) 100%);
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 8px;
        text-shadow: 0 0 10px rgba(138, 43, 226, 0.8);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.3);
        display: inline-block;
      }

      .sls-level-number {
        font-size: 42px;
        font-weight: 800;
        color: #d4a5ff;
        text-shadow: 0 0 15px rgba(138, 43, 226, 1), 0 0 25px rgba(138, 43, 226, 0.7);
        animation: pulseGlow 2.5s ease-in-out infinite;
      }

      .sls-xp-display {
        margin-bottom: 12px;
      }

      .sls-xp-text {
        font-size: 15px;
        color: #b894e6;
        margin-bottom: 10px;
        text-shadow: 0 0 5px rgba(138, 43, 226, 0.5);
      }

      .sls-progress-bar {
        width: 100%;
        height: 14px;
        background: rgba(20, 20, 30, 0.8);
        border-radius: 7px;
        overflow: hidden;
        border: 1px solid rgba(138, 43, 226, 0.3);
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
      }

      .sls-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #8a2be2 0%, #9370db 50%, #ba55d3 100%);
        transition: width 0.4s ease;
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.8), 0 0 20px rgba(138, 43, 226, 0.5);
        animation: progressGlow 2s ease-in-out infinite;
      }

      .sls-total-xp {
        font-size: 13px;
        color: #a78bfa;
        margin-top: 10px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
      }

      .sls-stat-points {
        margin-top: 16px;
        padding: 12px;
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.2) 0%, rgba(75, 0, 130, 0.15) 100%);
        border-radius: 8px;
        border: 1px solid rgba(138, 43, 226, 0.4);
        color: #d4a5ff;
        font-weight: 700;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.8);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.3);
      }

      .sls-stats-grid {
        display: grid;
        gap: 18px;
      }

      .sls-stat-item {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.08) 0%, rgba(75, 0, 130, 0.05) 100%);
        padding: 18px;
        border-radius: 10px;
        border: 1px solid rgba(138, 43, 226, 0.25);
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.15);
        transition: all 0.3s ease;
      }

      .sls-stat-item:hover {
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.4);
        border-color: rgba(138, 43, 226, 0.5);
        transform: translateY(-2px);
      }

      .sls-stat-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
      }

      .sls-stat-name {
        font-weight: 700;
        color: #d4a5ff;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.6);
      }

      .sls-stat-value {
        color: #ba55d3;
        font-weight: 700;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.7);
      }

      .sls-stat-bar {
        width: 100%;
        height: 10px;
        background: rgba(20, 20, 30, 0.8);
        border-radius: 5px;
        overflow: hidden;
        margin-bottom: 10px;
        border: 1px solid rgba(138, 43, 226, 0.2);
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
      }

      .sls-stat-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #8a2be2 0%, #9370db 50%, #ba55d3 100%);
        box-shadow: 0 0 4px rgba(138, 43, 226, 0.7);
        transition: width 0.3s ease;
      }

      .sls-stat-desc {
        font-size: 12px;
        color: #b894e6;
        margin-bottom: 10px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
      }

      .sls-stat-allocate {
        padding: 8px 16px;
        background: linear-gradient(135deg, #8a2be2 0%, #9370db 100%);
        color: #ffffff;
        border: 1px solid rgba(138, 43, 226, 0.6);
        border-radius: 6px;
        cursor: pointer;
        font-weight: 700;
        transition: all 0.3s ease;
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.5);
        text-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
      }

      .sls-stat-allocate:hover {
        background: linear-gradient(135deg, #9370db 0%, #ba55d3 100%);
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.8), 0 0 30px rgba(138, 43, 226, 0.5);
        transform: translateY(-2px);
      }

      .sls-stat-allocate:active {
        transform: translateY(0);
      }

      .sls-stat-maxed-badge {
        padding: 6px 12px;
        background: linear-gradient(135deg, #ba55d3 0%, #9370db 100%);
        color: #ffffff;
        border: 1px solid rgba(138, 43, 226, 0.6);
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        text-align: center;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.8);
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.5);
      }

      .sls-stat-no-points {
        padding: 6px 12px;
        background: rgba(50, 50, 60, 0.5);
        color: #888;
        border: 1px solid rgba(138, 43, 226, 0.2);
        border-radius: 6px;
        font-size: 11px;
        text-align: center;
      }

      .sls-stat-item.sls-stat-weak {
        border-color: rgba(138, 43, 226, 0.25);
      }

      .sls-stat-item.sls-stat-medium {
        border-color: rgba(138, 43, 226, 0.4);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.2);
      }

      .sls-stat-item.sls-stat-strong {
        border-color: rgba(138, 43, 226, 0.6);
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.4);
      }

      .sls-stat-item.sls-stat-maxed {
        border-color: rgba(138, 43, 226, 0.8);
        box-shadow: 0 0 25px rgba(138, 43, 226, 0.6);
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.15) 0%, rgba(75, 0, 130, 0.1) 100%);
      }

      .sls-activity-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 18px;
      }

      .sls-activity-item {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.1) 0%, rgba(75, 0, 130, 0.05) 100%);
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        border: 1px solid rgba(138, 43, 226, 0.25);
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.2);
        transition: all 0.3s ease;
      }

      .sls-activity-item:hover {
        box-shadow: 0 0 20px rgba(138, 43, 226, 0.4);
        transform: translateY(-3px);
      }

      .sls-activity-label {
        font-size: 13px;
        color: #b894e6;
        margin-bottom: 10px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
      }

      .sls-activity-value {
        font-size: 28px;
        font-weight: 800;
        color: #d4a5ff;
        text-shadow: 0 0 12px rgba(138, 43, 226, 0.9), 0 0 20px rgba(138, 43, 226, 0.6);
      }

      .sls-quests-list {
        display: grid;
        gap: 14px;
      }

      .sls-quest-item {
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.08) 0%, rgba(75, 0, 130, 0.05) 100%);
        padding: 18px;
        border-radius: 10px;
        border-left: 4px solid rgba(138, 43, 226, 0.4);
        border: 1px solid rgba(138, 43, 226, 0.2);
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.15);
        transition: all 0.3s ease;
      }

      .sls-quest-item:hover {
        box-shadow: 0 0 18px rgba(138, 43, 226, 0.3);
        border-left-color: rgba(138, 43, 226, 0.7);
      }

      .sls-quest-item.sls-quest-complete {
        border-left-color: #00ff88;
        background: linear-gradient(135deg, rgba(0, 255, 136, 0.1) 0%, rgba(138, 43, 226, 0.05) 100%);
        box-shadow: 0 0 15px rgba(0, 255, 136, 0.3), 0 0 25px rgba(138, 43, 226, 0.2);
      }

      .sls-quest-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
      }

      .sls-quest-name {
        font-weight: 700;
        color: #d4a5ff;
        text-shadow: 0 0 3px rgba(138, 43, 226, 0.6);
      }

      .sls-quest-progress {
        color: #ba55d3;
        font-weight: 700;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.7);
      }

      .sls-quest-desc {
        font-size: 12px;
        color: #b894e6;
        margin-bottom: 10px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
      }

      .sls-quest-complete-badge {
        margin-top: 10px;
        color: #00ff88;
        font-weight: 700;
        font-size: 13px;
        text-shadow: 0 0 10px rgba(0, 255, 136, 0.8);
      }

      .sls-achievements-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 14px;
      }

      .sls-achievement-item {
        background: linear-gradient(135deg, rgba(20, 20, 30, 0.6) 0%, rgba(10, 10, 15, 0.8) 100%);
        padding: 18px;
        border-radius: 10px;
        text-align: center;
        opacity: 0.4;
        border: 1px solid rgba(138, 43, 226, 0.1);
        transition: all 0.3s ease;
      }

      .sls-achievement-item:hover {
        opacity: 0.7;
      }

      .sls-achievement-item.sls-achievement-unlocked {
        opacity: 1;
        border: 2px solid rgba(138, 43, 226, 0.6);
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.15) 0%, rgba(75, 0, 130, 0.1) 100%);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.4), 0 0 25px rgba(138, 43, 226, 0.2);
      }

      .sls-achievement-item.sls-achievement-unlocked:hover {
        box-shadow: 0 0 25px rgba(138, 43, 226, 0.6), 0 0 35px rgba(138, 43, 226, 0.4);
        transform: translateY(-3px);
      }

      .sls-achievement-icon {
        font-size: 36px;
        margin-bottom: 10px;
        filter: drop-shadow(0 0 8px rgba(138, 43, 226, 0.6));
      }

      .sls-achievement-name {
        font-weight: 700;
        color: #d4a5ff;
        margin-bottom: 6px;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.7);
      }

      .sls-achievement-desc {
        font-size: 11px;
        color: #b894e6;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.4);
      }

      .sls-title-selector {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .sls-select {
        padding: 12px 16px;
        background: rgba(20, 20, 30, 0.8);
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 8px;
        color: #d4a5ff;
        font-size: 14px;
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.2);
        transition: all 0.3s ease;
      }

      .sls-select:focus {
        outline: none;
        border-color: rgba(138, 43, 226, 0.7);
        box-shadow: 0 0 15px rgba(138, 43, 226, 0.4);
      }

      .sls-title-bonus {
        font-size: 13px;
        color: #ba55d3;
        font-weight: 700;
        text-shadow: 0 0 4px rgba(138, 43, 226, 0.7);
      }
    `;

    document.head.appendChild(style);
  }
};
