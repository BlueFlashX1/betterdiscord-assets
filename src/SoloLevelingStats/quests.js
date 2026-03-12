module.exports = {
  updateQuestProgress(questId, amount) {
    const quest = this.settings.dailyQuests.quests[questId];
    if (!quest || quest.completed) {
      return;
    }

    const previousProgress = Number(quest.progress || 0);
    quest.progress += amount;
    // Cap progress at target to prevent exceeding
    if (quest.progress > quest.target) {
      quest.progress = quest.target;
    }

    if (quest.progress >= quest.target) {
      quest.completed = true;
      this.completeQuest(questId);
      return;
    }

    // Persist non-completion quest progress changes with debounced save.
    // Completion path performs its own immediate save in completeQuest().
    if (quest.progress !== previousProgress) {
      this.saveSettings();
    }
  },

  completeQuest(questId) {
    const def = this.questData[questId];
    if (!def) return;
  
    // Apply vitality bonus to rewards (enhanced by Perception buffs and skill tree)
    const vitalityBaseBonus = this.settings.stats.vitality * 0.05;
    const vitalityAdvancedBonus = Math.max(0, (this.settings.stats.vitality - 10) * 0.01);
    const baseVitalityBonus = vitalityBaseBonus + vitalityAdvancedBonus;
  
    // Get skill tree bonuses
    let skillAllStatBonus = 0;
    let skillQuestBonus = 0;
    const skillBonuses = this.getSkillTreeBonuses();
    if (skillBonuses?.allStatBonus > 0) skillAllStatBonus = skillBonuses.allStatBonus;
    if (skillBonuses?.questBonus > 0) skillQuestBonus = skillBonuses.questBonus;
  
    // Skill tree can still amplify vitality rewards.
    // Perception no longer modifies quest rewards (PER now powers crit burst hits).
    const enhancedVitalityBonus = baseVitalityBonus * (1 + skillAllStatBonus) + skillQuestBonus;
    const vitalityBonus = 1 + enhancedVitalityBonus;
    let xpReward = Math.round(def.xp * vitalityBonus);
  
    // Active skill: Shadow Exchange — boosted next quest reward (charge-based)
    const questActiveBuffs = this.getActiveSkillBuffs();
    if (questActiveBuffs?.questRewardMultiplier > 1.0) {
      xpReward = Math.round(xpReward * questActiveBuffs.questRewardMultiplier);
      // Consume the charge
      this.consumeActiveSkillCharge('shadow_exchange_technique');
    }
  
    // Award rewards
    const oldLevel = this.settings.level;
    this.settings.xp += xpReward;
    this.settings.totalXP += xpReward;
    this.settings.unallocatedStatPoints += def.statPoints;
  
    // Emit XP changed event for real-time progress bar updates
    this.emitXPChanged();
  
    // Save immediately on quest completion (important event)
    this.saveSettings(true);
  
    // Check level up (will also save if level up occurs)
    this.checkLevelUp(oldLevel);
  
    // Show notification
    const message =
      `[QUEST COMPLETE] ${def.name}\n` +
      ` +${xpReward} XP${def.statPoints > 0 ? `, +${def.statPoints} stat point(s)` : ''}`;
  
    this.showNotification(message, 'success', 2500);
  
    // Quest completion celebration animation
    this.showQuestCompletionCelebration(def.name, xpReward, def.statPoints);
  
    // Share XP with shadow army
    try {
      this.shareShadowXP(xpReward, 'quest');
    } catch (error) {
      this.debugError('QUEST_XP', 'Quest shadow XP share error:', error);
    }
  },

  showQuestCompletionCelebration(questName, xpReward, statPoints) {
    try {
      // Try to load Friend or Foe BB font (if CriticalHit plugin is available, it may already be loaded)
      this._loadQuestFont();
  
      // Find quest card in UI
      const questCards = document.querySelectorAll('.sls-chat-quest-item');
      let questCard = null;
  
      // Find the completed quest card
      // Using .find() to search for quest card
      questCard = Array.from(questCards).find((card) => {
        const cardText = card.textContent || '';
        return cardText.includes(questName) || card.classList.contains('sls-chat-quest-complete');
      });
  
      // Create celebration overlay with zoom animation
      const animationType = 'zoom';
  
      // Build current progress section with all daily quests
      const questProgressHTML = Object.entries(this.settings.dailyQuests.quests)
        .map(([questId, quest]) => {
          const questInfo = this.questData[questId] || { name: questId };
          const percentage = Math.min((quest.progress / quest.target) * 100, 100);
          const isComplete = quest.completed;
          const progressText = isComplete ? quest.target : Math.floor(quest.progress);
  
          return `
            <div class="sls-quest-progress-item ${isComplete ? 'completed' : ''}" data-quest-id="${questId}">
              <div class="sls-quest-progress-checkbox">
                ${isComplete ? '✓' : '○'}
              </div>
              <div class="sls-quest-progress-info">
                <div class="sls-quest-progress-name">${questInfo.name}</div>
                <div class="sls-quest-progress-bar-container">
                  <div class="sls-quest-progress-bar">
                    <div class="sls-quest-progress-fill" style="width: ${percentage}%"></div>
                  </div>
                  <div class="sls-quest-progress-text">${progressText}/${quest.target}</div>
                </div>
              </div>
            </div>
          `;
        })
        .join('');
  
      const celebration = document.createElement('div');
      celebration.className = `sls-quest-celebration ${animationType}`;
      celebration.innerHTML = `
        <div class="sls-quest-celebration-content">
          <div class="sls-quest-notification-header">
            <div class="sls-quest-notification-title">Quest Notification [!]</div>
            <div class="sls-quest-notification-subtitle">Daily Quest Completed</div>
          </div>
          <div class="sls-quest-completed-name">${this.escapeHtml(questName)}</div>
          <div class="sls-quest-current-progress">
            <div class="sls-quest-progress-title">Current Progress</div>
            <div class="sls-quest-progress-list">
              ${questProgressHTML}
            </div>
          </div>
          <div class="sls-quest-confirm-button-container">
            <button class="sls-quest-confirm-button">Confirm</button>
          </div>
        </div>
      `;
  
      // Always center on screen for better visibility
      celebration.style.left = '50%';
      celebration.style.top = '50%';
      celebration.style.transform = 'translate(-50%, -50%)';
      // Opacity starts at 0, CSS animation handles fade-in only (stays visible)
      celebration.style.opacity = '0';
  
      // Highlight quest card if found (but don't position dialog there)
      if (questCard) {
        questCard.classList.add('sls-quest-celebrating');
        // Keep highlighting until notification is closed
        celebration._questCard = questCard;
      }
  
      document.body.appendChild(celebration);
  
      // Create particles
      this.createQuestParticles(celebration);
  
      // Function to close notification with fade-out
      const closeNotification = () => {
        if (celebration._progressInterval) {
          clearInterval(celebration._progressInterval);
        }
        // Remove quest card highlight
        if (celebration._questCard) {
          celebration._questCard.classList.remove('sls-quest-celebrating');
        }
        // Fast fade-out animation (0.2s)
        celebration.style.animation = 'quest-celebration-fade-out 0.2s ease-out forwards';
        celebration._removeTimeout = setTimeout(() => {
          celebration._removeTimeout = null;
          if (celebration && celebration.parentNode) {
            celebration.remove();
          }
          this._questCelebrations?.delete?.(celebration);
        }, 200);
      };
  
      // Confirm button click handler
      const confirmButton = celebration.querySelector('.sls-quest-confirm-button');
      if (confirmButton) {
        confirmButton.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent event bubbling
          closeNotification();
        });
      }
  
      // Prevent clicking outside to close (only button closes it)
      celebration.addEventListener('click', (e) => {
        // Only close if clicking directly on the celebration background, not on content
        if (e.target === celebration) {
          e.stopPropagation();
        }
      });
  
      // Update progress in real-time — targeted DOM updates instead of full innerHTML rebuild
      const progressUpdateInterval = setInterval(() => {
        if (!celebration.parentNode) {
          clearInterval(progressUpdateInterval);
          return;
        }
  
        Object.entries(this.settings.dailyQuests.quests).forEach(([questId, quest]) => {
          const item = celebration.querySelector(`[data-quest-id="${questId}"]`);
          if (!item) return;
  
          const isComplete = quest.completed;
          const percentage = Math.min((quest.progress / quest.target) * 100, 100);
          const progressText = isComplete ? quest.target : Math.floor(quest.progress);
  
          // Update completed state
          item.classList.toggle('completed', isComplete);
  
          // Update checkbox
          const checkbox = item.querySelector('.sls-quest-progress-checkbox');
          if (checkbox) checkbox.textContent = isComplete ? '✓' : '○';
  
          // Update progress fill width
          const fill = item.querySelector('.sls-quest-progress-fill');
          if (fill) fill.style.width = `${percentage}%`;
  
          // Update progress text
          const text = item.querySelector('.sls-quest-progress-text');
          if (text) text.textContent = `${progressText}/${quest.target}`;
        });
      }, 500);
  
      // Clear interval when celebration is removed
      celebration._progressInterval = progressUpdateInterval;
  
      // Ensure cleanup on plugin stop
      if (!this._questCelebrations) {
        this._questCelebrations = new Set();
      }
      this._questCelebrations.add(celebration);
  
      // Store reference for cleanup
      celebration._cleanup = () => {
        if (celebration._progressInterval) {
          clearInterval(celebration._progressInterval);
        }
      };
  
      this.debugLog('QUEST_CELEBRATION', 'Quest completion celebration shown', {
        questName,
        xpReward,
        statPoints,
      });
    } catch (error) {
      this.debugError('QUEST_CELEBRATION', error);
    }
  },

  _loadQuestFont() {
    try {
      // Check if font is already loaded (by CriticalHit plugin or previous call)
      const fontName = 'Friend or Foe BB';
      const existingStyle = document.getElementById('sls-quest-font-friend-or-foe-bb');
      if (existingStyle) {
        return; // Font already loaded
      }
  
      // Check if CriticalHit plugin has loaded the font
      if (document.fonts && document.fonts.check) {
        document.fonts.ready.then(() => {
          setTimeout(() => {
            if (document.fonts.check(`16px "${fontName}"`)) {
              this.debugLog('QUEST_FONT', 'Friend or Foe BB font already available');
              return; // Font already loaded by another plugin
            }
            // Try to load font from CriticalHit's font path
            this._loadFontFromCriticalHit();
          }, 100);
        });
      } else {
        // Fallback: Try to load from CriticalHit's font path
        this._loadFontFromCriticalHit();
      }
    } catch (error) {
      this.debugError('QUEST_FONT_LOAD', error);
    }
  },

  _loadFontFromCriticalHit() {
    try {
      // Try to load font from CriticalHit plugin using embedded base64 method
      const critInstance = this._SLUtils?.getPluginInstance?.('CriticalHit');
      if (critInstance) {
        // Use loadLocalFont instead of getFontsFolderPath (which is deprecated)
        if (typeof critInstance.loadLocalFont === 'function') {
          const fontLoaded = critInstance.loadLocalFont('Friend or Foe BB');
          if (fontLoaded) {
            this.debugLog(
              'QUEST_FONT',
              'Friend or Foe BB font loaded via CriticalHit loadLocalFont (base64)'
            );
            return;
          }
        }
        // Fallback: Try deprecated getFontsFolderPath (but it now returns null)
        if (typeof critInstance.getFontsFolderPath === 'function') {
          const fontsPath = critInstance.getFontsFolderPath();
          // If getFontsFolderPath returns null, fonts are embedded - skip file:// URL loading
          if (!fontsPath) {
            this.debugLog(
              'QUEST_FONT',
              'CriticalHit uses embedded fonts - font should already be loaded'
            );
            return;
          }
          const fontFileName = 'FriendorFoeBB';
  
          // Create @font-face CSS (legacy fallback - should not be used)
          const fontStyle = document.createElement('style');
          fontStyle.id = 'sls-quest-font-friend-or-foe-bb';
          fontStyle.textContent = `
            @font-face {
              font-family: 'Friend or Foe BB';
              src: url('${fontsPath}${fontFileName}.woff2') format('woff2'),
                   url('${fontsPath}${fontFileName}.woff') format('woff'),
                   url('${fontsPath}${fontFileName}.ttf') format('truetype');
              font-weight: normal;
              font-style: normal;
              font-display: swap;
            }
          `;
          document.head.appendChild(fontStyle);
          this.debugLog(
            'QUEST_FONT',
            'Friend or Foe BB font loaded from CriticalHit path (legacy)'
          );
          return;
        }
      }
  
      // If CriticalHit not available, try default BetterDiscord fonts path
      const defaultFontsPath = BdApi.Plugins.folder + '/../fonts/';
      const fontFileName = 'FriendorFoeBB';
  
      const fontStyle = document.createElement('style');
      fontStyle.id = 'sls-quest-font-friend-or-foe-bb';
      fontStyle.textContent = `
        @font-face {
          font-family: 'Friend or Foe BB';
          src: url('${defaultFontsPath}${fontFileName}.woff2') format('woff2'),
               url('${defaultFontsPath}${fontFileName}.woff') format('woff'),
               url('${defaultFontsPath}${fontFileName}.ttf') format('truetype');
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `;
      document.head.appendChild(fontStyle);
      this.debugLog('QUEST_FONT', 'Friend or Foe BB font loaded from default path');
    } catch (error) {
      this.debugError('QUEST_FONT_LOAD_CRITICALHIT', error);
      // Font will fall back to Orbitron or Segoe UI
    }
  },

  createQuestParticles(container) {
    const particleCount = 30;
    const colors = ['#5a3a8f', '#4b2882', '#3d1f6b', '#8a2be2', '#00ff88'];
  
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
  
      particle._removeTimeout = setTimeout(() => {
        particle._removeTimeout = null;
        particle.remove();
      }, 2000);
    }
  }
};
