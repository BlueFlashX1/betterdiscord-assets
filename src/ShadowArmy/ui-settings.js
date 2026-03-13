/**
 * ShadowArmy — Settings management, settings panel, debug, and diagnostic tools.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./ui-settings'))
 */

const dc = require('../shared/discord-classes');

module.exports = {
  // ============================================================================
  // USER ID DETECTION
  // ============================================================================

  /**
   * Get Discord user ID for storage isolation.
   * 1. Try BetterDiscord Webpack UserStore (PRIMARY)
   * 2. Try window.Discord (fallback)
   * 3. Try React fiber traversal (fallback)
   * 4. Fallback to 'default'
   */
  async getUserId() {
    try {
      const UserStore = BdApi.Webpack.getStore('UserStore');
      if (UserStore && typeof UserStore.getCurrentUser === 'function') {
        try {
          const currentUser = UserStore.getCurrentUser();
          if (currentUser && currentUser.id) {
            this.debugLog('USER_ID', 'Got user ID from BdApi.Webpack.UserStore', {
              userId: currentUser.id,
            });
            return currentUser.id;
          }
        } catch (webpackError) {
          this.debugError('USER_ID', 'Error calling UserStore.getCurrentUser()', webpackError);
        }
      }

      if (window.Discord && window.Discord.user && window.Discord.user.id) {
        this.debugLog('USER_ID', 'Got user ID from window.Discord (fallback)', {
          userId: window.Discord.user.id,
        });
        return window.Discord.user.id;
      }

      try {
        const userElement =
          document.querySelector(dc.sel.avatar) || document.querySelector(dc.sel.user);
        if (userElement) {
          const reactKey = Object.keys(userElement).find(
            (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
          );
          if (reactKey) {
            let fiber = userElement[reactKey];
            for (let i = 0; i < 10 && fiber; i++) {
              if (fiber.memoizedProps?.user?.id) {
                this.debugLog('USER_ID', 'Got user ID from React fiber (fallback)', {
                  userId: fiber.memoizedProps.user.id,
                });
                return fiber.memoizedProps.user.id;
              }
              fiber = fiber.return;
            }
          }
        }
      } catch (fiberError) {
        this.debugError('USER_ID', 'Error in React fiber traversal', fiberError);
      }
    } catch (error) {
      this.debugError('USER_ID', 'Failed to get user ID', error);
    }

    this.debugLog('USER_ID', 'Using default user ID (fallback)', { reason: 'All methods failed' });
    return 'default';
  },

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  /**
   * Load settings from all 3 tiers, picking the newest valid candidate.
   * Tiers: (1) IndexedDB via UnifiedSaveManager, (2) BdApi.Data, (3) File backup
   * Uses _metadata.lastSave timestamp to pick newest; tie-breaks by tier priority.
   */
  async loadSettings() {
    try {
      this.debugLog('LOAD_SETTINGS', 'Attempting to load settings from all tiers...');

      const getSavedTimestamp = (data) => {
        const iso = data?._metadata?.lastSave;
        const ts = iso ? Date.parse(iso) : NaN;
        return Number.isFinite(ts) ? ts : 0;
      };

      const candidates = [];

      // Tier 3: File backup (survives BD reinstall)
      try {
        const fileSaved = this.readFileBackup();
        if (fileSaved && typeof fileSaved === 'object') {
          candidates.push({ source: 'file', data: fileSaved, ts: getSavedTimestamp(fileSaved) });
        }
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'File backup load failed', error);
      }

      // Tier 1: IndexedDB (survives BD reinstall)
      if (this.saveManager) {
        try {
          const idbSaved = await this.saveManager.load('settings');
          if (idbSaved && typeof idbSaved === 'object') {
            candidates.push({ source: 'indexeddb', data: idbSaved, ts: getSavedTimestamp(idbSaved) });
          }
        } catch (error) {
          this.debugError('LOAD_SETTINGS', 'IndexedDB load failed', error);
        }
      }

      // Tier 2: BdApi.Data (wiped on BD reinstall)
      try {
        const storageKey = this.userId ? `settings_${this.userId}` : 'settings';
        const bdSaved = BdApi.Data.load('ShadowArmy', storageKey);
        if (bdSaved && typeof bdSaved === 'object') {
          candidates.push({ source: 'bdapi', data: bdSaved, ts: getSavedTimestamp(bdSaved) });
        }
      } catch (error) {
        this.debugError('LOAD_SETTINGS', 'BdApi.Data load failed', error);
      }

      // Pick newest; tie-break by storage priority
      const sourcePriority = { indexeddb: 3, file: 2, bdapi: 1 };
      const best = candidates.reduce(
        (acc, cur) => {
          const hasNewer = cur.ts > acc.ts;
          const isTie = cur.ts === acc.ts;
          const hasHigherPriority = (sourcePriority[cur.source] ?? 0) >= (sourcePriority[acc.source] ?? 0);
          return hasNewer || (isTie && hasHigherPriority) ? cur : acc;
        },
        { source: null, data: null, ts: 0 }
      );

      if (best.data) {
        this.debugLog('LOAD_SETTINGS', `Selected settings candidate`, {
          source: best.source,
          ts: best.ts ? new Date(best.ts).toISOString() : 'none',
          candidateCount: candidates.length,
          sources: candidates.map((c) => `${c.source}(${c.ts})`).join(', '),
        });
        this.settings = { ...this.defaultSettings, ...best.data };
      } else {
        this.settings = { ...this.defaultSettings };
      }

      // ── Post-load validation & backfill ──
      if (!Array.isArray(this.settings.shadows)) {
        this.settings.shadows = [];
      } else if (this.settings.shadows.length > 0 && this.storageManager) {
        this.debugLog('LOAD_SETTINGS', 'Clearing old shadows from settings (should be in IndexedDB)', {
          shadowsInSettings: this.settings.shadows.length,
        });
        this.settings.shadows = [];
      }
      if (!this.settings.extractionConfig) {
        this.settings.extractionConfig = { ...this.defaultSettings.extractionConfig };
      } else {
        this.settings.extractionConfig = {
          ...this.defaultSettings.extractionConfig,
          ...this.settings.extractionConfig,
        };
      }
      if (!this.settings.rankPromotionConfig || typeof this.settings.rankPromotionConfig !== 'object') {
        this.settings.rankPromotionConfig = {
          ...this.defaultSettings.rankPromotionConfig,
          minLevelByRank: { ...this.defaultSettings.rankPromotionConfig.minLevelByRank },
        };
      } else {
        const loadedMinLevelByRank =
          this.settings.rankPromotionConfig.minLevelByRank &&
          typeof this.settings.rankPromotionConfig.minLevelByRank === 'object'
            ? this.settings.rankPromotionConfig.minLevelByRank
            : {};
        this.settings.rankPromotionConfig = {
          ...this.defaultSettings.rankPromotionConfig,
          ...this.settings.rankPromotionConfig,
          minLevelByRank: {
            ...this.defaultSettings.rankPromotionConfig.minLevelByRank,
            ...loadedMinLevelByRank,
          },
        };
      }
      if (!this.settings.specialArise) {
        this.settings.specialArise = { ...this.defaultSettings.specialArise };
      }
      if (!this.settings.dungeonExtractionAttempts) {
        this.settings.dungeonExtractionAttempts = {};
      }
      if (!this.settings.ariseAnimation) {
        this.settings.ariseAnimation = { ...this.defaultSettings.ariseAnimation };
      } else {
        this.settings.ariseAnimation = {
          ...this.defaultSettings.ariseAnimation,
          ...this.settings.ariseAnimation,
        };
      }
      if (this.settings.cachedTotalPower === undefined) {
        this.settings.cachedTotalPower = 0;
        this.settings.cachedTotalPowerTimestamp = 0;
      }

      // Sync debug mode with settings (after loading)
      this.debug.enabled = this.settings.debugMode === true;
    } catch (error) {
      this.debugError('SETTINGS', 'Error loading settings', error);
      this.settings = { ...this.defaultSettings };
      this.debug.enabled = this.settings.debugMode === true;
    }
  },

  // ── FILE BACKUP (Tier 3) ─────────────────────────────────────────────────
  // Stored OUTSIDE BetterDiscord folder so it survives BD reinstall/repair

  _getFileBackupPath() {
    try {
      const pathModule = require('path');
      const appSupport = pathModule.resolve(BdApi.Plugins.folder, '..', '..');
      const backupDir = pathModule.join(appSupport, 'discord', 'SoloLevelingBackups');
      require('fs').mkdirSync(backupDir, { recursive: true });
      return pathModule.join(backupDir, 'ShadowArmy.json');
    } catch { return null; }
  },

  readFileBackup() {
    const filePath = this._getFileBackupPath();
    if (!filePath) return null;
    try {
      const fs = require('fs');
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      this.debugError('LOAD_SETTINGS_FILE', error);
      return null;
    }
  },

  writeFileBackup(data) {
    const filePath = this._getFileBackupPath();
    if (!filePath) return false;
    try {
      const fs = require('fs');
      fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', (err) => {
        if (err) this.debugError('SAVE_SETTINGS_FILE', err);
        else this.debugLog('SAVE_SETTINGS', 'Saved file backup', { path: filePath });
      });
      return true;
    } catch (error) {
      this.debugError('SAVE_SETTINGS_FILE', error);
      return false;
    }
  },

  /**
   * Debounced save — coalesces rapid saveSettings() calls into one write.
   * All 17+ call sites hit this; actual I/O happens after 3s of quiet.
   */
  saveSettings() {
    this._settingsDirty = true;
    if (this._saveSettingsTimer) return;
    this._saveSettingsTimer = setTimeout(() => {
      this._saveSettingsTimer = null;
      if (this._settingsDirty) {
        this._settingsDirty = false;
        this._saveSettingsImmediate();
      }
    }, 3000);
  },

  async _saveSettingsImmediate() {
    try {
      // Sync debug mode from debug.enabled to settings
      if (this.settings.debugMode !== this.debug.enabled) {
        this.settings.debugMode = this.debug.enabled;
      }

      // CRITICAL: Exclude shadows from settings - shadows are in IndexedDB only
      const settingsToSave = { ...this.settings };
      if (settingsToSave.shadows && Array.isArray(settingsToSave.shadows)) {
        delete settingsToSave.shadows;
      }
      // Remove transient snapshot cache if it leaked into settings
      delete settingsToSave._snapshotCache;
      delete settingsToSave._snapshotTimestamp;

      // Add metadata timestamp for newest-wins load strategy
      settingsToSave._metadata = { lastSave: new Date().toISOString(), version: '3.5.0' };

      // Tier 1: Save to IndexedDB
      if (this.saveManager) {
        try {
          await this.saveManager.save('settings', settingsToSave, true);
          this.debugLog('SAVE_SETTINGS', 'Saved to IndexedDB');
        } catch (error) {
          this.debugError('SAVE_SETTINGS', 'IndexedDB save failed', error);
        }
      }

      // Tier 2: Save to BdApi.Data
      try {
        const storageKey = this.userId ? `settings_${this.userId}` : 'settings';
        BdApi.Data.save('ShadowArmy', storageKey, settingsToSave);
        this.debugLog('SAVE_SETTINGS', 'Saved to BdApi.Data');
      } catch (error) {
        this.debugError('SETTINGS', 'Error saving settings to BdApi.Data', error);
      }

      // Tier 3: File backup outside BD folder
      this.writeFileBackup(settingsToSave);
    } catch (error) {
      this.debugError('SETTINGS', 'Error saving settings', error);
    }
  },

  // ============================================================================
  // SETTINGS PANEL
  // ============================================================================

  detachShadowArmySettingsPanelHandlers() {
    const root = this._shadowArmySettingsPanelRoot;
    const handlers = this._shadowArmySettingsPanelHandlers;
    if (root && handlers) {
      try {
        root.removeEventListener('click', handlers.click);
        root.removeEventListener('change', handlers.change);
      } catch (error) {
        this.debugError('SETTINGS_PANEL', 'Error detaching settings panel handlers', error);
      }
    }
    this._shadowArmySettingsPanelRoot = null;
    this._shadowArmySettingsPanelHandlers = null;
  },

  /**
   * Generate settings panel HTML for BetterDiscord settings UI.
   * MUST be synchronous — async work happens inside delegated handlers.
   */
  getSettingsPanel() {
    const shadowsForDisplay = this.settings.shadows || [];
    const localCacheCount = shadowsForDisplay.length;
    const cachedIndexedDbCount =
      typeof this.settings?.cachedTotalPowerShadowCount === 'number'
        ? this.settings.cachedTotalPowerShadowCount
        : null;

    const shadowsWithPower =
      localCacheCount > 0
        ? shadowsForDisplay.map((shadow) => {
            const effective = this.getShadowEffectiveStats(shadow);
            const strength = this.calculateShadowStrength(effective, 1);
            return { shadow, strength };
          })
        : [];

    shadowsWithPower.sort((a, b) => b.strength - a.strength);

    const storageInfo = this.storageManager
      ? '<div style="color: #34d399; font-size: 11px; margin-top: 4px;">Primary storage: IndexedDB</div>'
      : '<div style="color: #facc15; font-size: 11px; margin-top: 4px;">Primary storage: localStorage</div>';

    const generalsCount = Math.min(7, shadowsWithPower.length);

    const indexedDbCountLabel =
      cachedIndexedDbCount === null
        ? 'Unknown (click diagnostic)'
        : cachedIndexedDbCount.toLocaleString();

    const html = `
      <div class="shadow-army-settings">
        <h2>Shadow Army</h2>
        ${storageInfo}

        <div class="shadow-army-stats">
          <div>Local cache (settings): ${localCacheCount.toLocaleString()}</div>
          <div>Cached IndexedDB count: ${indexedDbCountLabel}</div>
          <div>Total Extracted: ${(this.settings.totalShadowsExtracted || 0).toLocaleString()}</div>
          <div style="color: #8a2be2; font-weight: bold;">Generals: ${generalsCount} / 7 (Auto-selected strongest)</div>
          <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">Generals provide full buffs \u2022 Other shadows provide diminishing returns</div>
        </div>

        <div style="margin-top: 12px; padding: 8px; background: rgba(138, 43, 226, 0.1); border-radius: 2px;">
          <button type="button" data-sa-action="diagnostic" style="padding: 6px 12px; background: #8a2be2; color: white; border: none; border-radius: 2px; cursor: pointer; font-size: 12px; font-weight: 600;">
            Check Actual Storage (Diagnostic)
          </button>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">Click to check IndexedDB for actual shadow count</div>
          <div id="shadow-army-diagnostic-result" style="margin-top: 8px; font-size: 11px; color: #9370db;"></div>
        </div>

        <div style="margin-top: 12px; padding: 8px; background: rgba(138, 43, 226, 0.1); border-radius: 2px;">
          <button type="button" data-sa-action="test-arise" style="padding: 6px 12px; background: #6d28d9; color: white; border: none; border-radius: 2px; cursor: pointer; font-size: 12px; font-weight: 600;">
            Test ARISE Animation
          </button>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">Triggers a test ARISE animation with a dummy shadow to verify font & styling</div>
        </div>

        <div class="shadow-army-config" style="margin-top: 16px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
            <input type="checkbox" id="sa-debug-mode" ${
              this.settings?.debugMode === true ? 'checked' : ''
            }>
            <span>Debug Mode (Console logs for font verification & animation)</span>
          </label>
          <div style="margin-top: 8px; padding: 8px; background: rgba(138, 43, 226, 0.1); border-radius: 2px; font-size: 11px; color: rgba(255, 255, 255, 0.7);">
            <strong style="color: #8a2be2;">Debug Mode:</strong> Enable to see detailed console logs for:
            <ul style="margin: 4px 0; padding-left: 20px;">
              <li>Font loading status (FONT_LOADER)</li>
              <li>Font verification when ARISE animation triggers</li>
              <li>Computed font-family after render</li>
              <li>Animation container creation</li>
              <li>Webpack/React injection status</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;

    this.detachShadowArmySettingsPanelHandlers();

    const clickHandlers = {
      'test-arise': () => {
        const testShadow = {
          id: 'test-arise-preview',
          name: 'Igris',
          rank: 'S',
          role: 'knight',
          roleName: 'Knight',
          level: 100,
          baseStats: { attack: 999, defense: 999, speed: 999 },
        };
        const wasEnabled = this.settings?.ariseAnimation?.enabled;
        if (this.settings?.ariseAnimation) this.settings.ariseAnimation.enabled = true;
        this.triggerArise(testShadow);
        if (this.settings?.ariseAnimation && wasEnabled === false) {
          this.settings.ariseAnimation.enabled = wasEnabled;
        }
      },
      diagnostic: async () => {
        const resultDiv = container.querySelector('#shadow-army-diagnostic-result');
        if (!resultDiv) return;
        resultDiv.textContent = 'Checking storage...';

        try {
          const diagnostic =
            typeof this.diagnoseStorage === 'function' ? await this.diagnoseStorage() : null;
          if (!diagnostic) {
            resultDiv.textContent = 'Diagnostic not available.';
            return;
          }

          const safe = (v) => this.escapeHtml(v);
          const statusColor =
            diagnostic.counts.indexedDB > 0
              ? '#34d399'
              : diagnostic.errors.length > 0
              ? '#ef4444'
              : '#facc15';

          const errorHtml =
            diagnostic.errors.length > 0
              ? `<div style="margin-top: 8px; padding: 6px; background: rgba(239, 68, 68, 0.1); border-radius: 2px; font-size: 10px; color: #ef4444;">
                   <strong>Errors:</strong><br>
                   ${diagnostic.errors.map((e) => safe(`- ${e}`)).join('<br>')}
                 </div>`
              : '';

          const sampleHtml = diagnostic.sampleShadow
            ? `<div style="margin-top: 8px; padding: 6px; background: rgba(52, 211, 153, 0.1); border-radius: 2px; font-size: 10px;">
                 <strong>Sample Shadow Found:</strong><br>
                 ID: ${safe(diagnostic.sampleShadow.id)}<br>
                 Rank: ${safe(diagnostic.sampleShadow.rank)}, Role: ${safe(
                diagnostic.sampleShadow.role
              )}<br>
                 Strength: ${safe(diagnostic.sampleShadow.strength)}
               </div>`
            : '';

          const noteHtml =
            diagnostic.counts.indexedDB > 0 && diagnostic.counts.localStorage === 0
              ? `<div style="margin-top: 8px; padding: 6px; background: rgba(138, 43, 226, 0.2); border-radius: 2px; font-size: 10px; color: #9370db;">
                   <strong>Note:</strong> Shadows are in IndexedDB (${safe(
                     diagnostic.counts.indexedDB
                   )}) but not in local settings cache. IndexedDB is the primary storage.
                 </div>`
              : '';

          resultDiv.innerHTML = `
            <div style="background: rgba(138, 43, 226, 0.15); padding: 12px; border-radius: 2px; margin-top: 8px; border: 1px solid rgba(138, 43, 226, 0.3);">
              <div style="font-weight: bold; margin-bottom: 8px; color: #9370db;">Storage Diagnostic Results:</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                <div>Local cache:</div>
                <div style="font-weight: bold;">${safe(
                  diagnostic.counts.localStorage
                )} shadows</div>
                <div>IndexedDB:</div>
                <div style="font-weight: bold; color: ${statusColor};">${safe(
            diagnostic.counts.indexedDB
          )} shadows</div>
                <div>Storage Manager:</div>
                <div style="font-weight: bold;">${safe(
                  diagnostic.storageManager.exists ? 'Exists' : 'Missing'
                )}</div>
                <div>DB Initialized:</div>
                <div style="font-weight: bold;">${safe(
                  diagnostic.storageManager.initialized ? 'Yes' : 'No'
                )}</div>
                <div>DB Connection:</div>
                <div style="font-weight: bold;">${safe(
                  diagnostic.storageManager.dbOpen ? 'Open' : 'Closed'
                )}</div>
                <div>Database Name:</div>
                <div style="font-weight: bold; font-size: 10px;">${safe(
                  diagnostic.storageManager.dbName
                )}</div>
                <div>User ID:</div>
                <div style="font-weight: bold; font-size: 10px;">${safe(diagnostic.userId)}</div>
              </div>
              ${sampleHtml}
              ${errorHtml}
              ${noteHtml}
            </div>
          `;
        } catch (error) {
          resultDiv.textContent = `Error: ${error?.message || String(error)}`;
        }
      },
    };

    const clickHandler = (e) => {
      if (this._isStopped) return;
      const btn = e.target?.closest?.('[data-sa-action]');
      const action = btn?.getAttribute?.('data-sa-action');
      if (!action || !clickHandlers[action]) return;
      e.preventDefault?.();
      clickHandlers[action]();
    };

    const changeHandlers = {
      'sa-debug-mode': (target) => {
        this.settings.debugMode = !!target.checked;
        this.debug.enabled = !!target.checked;
        this.saveSettings();
      },
    };

    const changeHandler = (e) => {
      if (this._isStopped) return;
      const target = e?.target;
      const handler = target?.id ? changeHandlers[target.id] : null;
      if (!handler) return;
      handler(target);
    };

    container.addEventListener('click', clickHandler);
    container.addEventListener('change', changeHandler);

    this._shadowArmySettingsPanelRoot = container;
    this._shadowArmySettingsPanelHandlers = { click: clickHandler, change: changeHandler };

    return container;
  },

  // ============================================================================
  // DEBUG SYSTEM
  // ============================================================================

  debugLog(tag, message, data = null) {
    if (!this.debug.enabled) return;

    const throttleKey = `${tag}:${message}`;
    const now = Date.now();
    const lastLogTime = this.debug.lastLogTimes[throttleKey] || 0;
    const throttleMs = 1000;

    if (now - lastLogTime < throttleMs) return;

    this.debug.lastLogTimes[throttleKey] = now;
    this.debug.operationCounts[tag] = (this.debug.operationCounts[tag] || 0) + 1;

    const prefix = `[ShadowArmy:${tag}]`;
    if (data !== null) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  },

  debugError(tag, message, error = null) {
    this.debug.errorCount++;
    this.debug.lastError = { tag, message, error, timestamp: Date.now() };

    const prefix = `[ShadowArmy:${tag}]`;
    if (error !== null) {
      console.error(prefix, message, error);
    } else {
      console.error(prefix, message);
    }
  },

  // ============================================================================
  // DIAGNOSTIC TOOLS
  // ============================================================================

  async diagnoseStorage() {
    const diagnostic = {
      timestamp: Date.now(),
      userId: this.userId || 'unknown',
      storageManager: {
        exists: !!this.storageManager,
        initialized: false,
        dbOpen: false,
        dbName: null,
      },
      counts: {
        localStorage: (this.settings.shadows || []).length,
        indexedDB: 0,
      },
      errors: [],
      sampleShadow: null,
    };

    if (this.storageManager) {
      diagnostic.storageManager.dbName = this.storageManager?.dbName || 'unknown';
      diagnostic.storageManager.initialized = this.storageManager.db !== null;
      diagnostic.storageManager.dbOpen = this.storageManager.db !== null;

      try {
        diagnostic.counts.indexedDB = await this.storageManager.getTotalCount();
      } catch (error) {
        diagnostic.errors.push(`getTotalCount failed: ${error.message}`);
      }

      try {
        const sampleShadows = await this.storageManager.getShadows({}, 0, 1);
        if (sampleShadows.length > 0) {
          diagnostic.sampleShadow = {
            id: sampleShadows[0].id,
            rank: sampleShadows[0].rank,
            role: sampleShadows[0].role,
            strength: sampleShadows[0].strength,
          };
        }
      } catch (error) {
        diagnostic.errors.push(`getShadows failed: ${error.message}`);
      }
    } else {
      diagnostic.errors.push('Storage manager not initialized');
    }

    return diagnostic;
  },
};
