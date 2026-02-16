/**
 * @name Theme Auto Maintainer
 * @author BlueFlashXS
 * @version 1.0.0
 * @description All-in-one theme maintenance: Live DOM + GitHub verification, auto-updates, cleanup, and backups
 * @source https://github.com/BlueFlashXS/ThemeAutoMaintainer
 *
 * Features:
 * - Scans live Discord DOM for current classes
 * - Verifies with GitHub DiscordClasses repo
 * - Auto-updates broken classes
 * - Cleans up unused selectors
 * - Periodic backups (BetterDiscord + dev folder)
 * - Syncs to betterdiscord-assets
 * - Smart suggestions
 * - Multi-layer verification
 */

module.exports = (() => {
  const config = {
    info: {
      name: 'Theme Auto Maintainer',
      authors: [{ name: 'BlueFlashXS' }],
      version: '1.0.0',
      description:
        'All-in-one theme maintenance: Live DOM + GitHub verification, auto-updates, cleanup, and backups',
      github: 'https://github.com/BlueFlashXS/ThemeAutoMaintainer',
    },
    changelog: [
      {
        title: 'v1.0.0 - Unified Solution',
        items: [
          'Combines ClassAutoUpdater + CSSCleanupHelper',
          'Live Discord DOM scanning',
          'GitHub DiscordClasses verification',
          'Automatic class updates',
          'Unused selector cleanup',
          'Periodic automatic backups',
          'Multi-layer verification',
          'Smart cleanup suggestions',
          'Comment-out option for safety',
        ],
      },
    ],
    defaultConfig: [
      {
        type: 'category',
        id: 'monitoring',
        name: 'Monitoring & Updates',
        collapsible: true,
        shown: true,
        settings: [
          {
            type: 'switch',
            id: 'autoUpdate',
            name: 'Auto-Update Broken Classes',
            note: 'Automatically fix broken classes found via DOM + GitHub',
            value: true,
          },
          {
            type: 'switch',
            id: 'checkOnStartup',
            name: 'Check on Discord Startup',
            note: 'Scan and update themes when Discord starts',
            value: true,
          },
          {
            type: 'slider',
            id: 'checkInterval',
            name: 'Check Interval (minutes)',
            note: 'How often to scan for changes (0 = manual only)',
            value: 30,
            min: 0,
            max: 120,
            step: 5,
            units: 'min',
          },
        ],
      },
      {
        type: 'category',
        id: 'verification',
        name: 'Verification & Safety',
        collapsible: true,
        shown: true,
        settings: [
          {
            type: 'switch',
            id: 'useLiveDOM',
            name: 'Scan Live Discord DOM',
            note: "Extract current classes from Discord's DOM (most accurate)",
            value: true,
          },
          {
            type: 'switch',
            id: 'useGitHub',
            name: 'Verify with GitHub Repo',
            note: "Cross-reference with IBeSarah's DiscordClasses repo",
            value: true,
          },
          {
            type: 'switch',
            id: 'requireBothSources',
            name: 'Require Both Verifications',
            note: 'Only update if found in BOTH live DOM AND GitHub (safest)',
            value: true,
          },
        ],
      },
      {
        type: 'category',
        id: 'cleanup',
        name: 'Cleanup & Backups',
        collapsible: true,
        shown: true,
        settings: [
          {
            type: 'switch',
            id: 'autoCleanup',
            name: 'Auto-Cleanup Unused Selectors',
            note: 'Automatically comment out selectors not found in DOM or GitHub',
            value: false,
          },
          {
            type: 'switch',
            id: 'commentInsteadOfRemove',
            name: 'Comment Out Instead of Remove',
            note: 'Mark unused selectors with /* UNUSED */ for manual review',
            value: true,
          },
          {
            type: 'slider',
            id: 'backupInterval',
            name: 'Backup Interval (hours)',
            note: 'Create timestamped backups periodically (0 = manual only)',
            value: 24,
            min: 0,
            max: 168,
            step: 6,
            units: 'hrs',
          },
          {
            type: 'slider',
            id: 'maxBackups',
            name: 'Maximum Backups to Keep',
            note: 'Auto-delete old backups beyond this count',
            value: 10,
            min: 1,
            max: 50,
            step: 1,
          },
        ],
      },
      {
        type: 'category',
        id: 'notifications',
        name: 'Notifications & Logging',
        collapsible: true,
        shown: false,
        settings: [
          {
            type: 'switch',
            id: 'showNotifications',
            name: 'Show Notifications',
            note: 'Toast notifications for updates and cleanups',
            value: true,
          },
          {
            type: 'switch',
            id: 'verboseLogging',
            name: 'Verbose Console Logging',
            note: 'Detailed logs in console for debugging',
            value: false,
          },
        ],
      },
    ],
  };

  return !window.ZeresPluginLibrary
    ? class {
        constructor() {
          this._config = config;
        }
        getName() {
          return config.info.name;
        }
        getAuthor() {
          return config.info.authors.map((a) => a.name).join(', ');
        }
        getDescription() {
          return config.info.description;
        }
        getVersion() {
          return config.info.version;
        }
        load() {
          const showConfirmationModal = BdApi.UI?.showConfirmationModal || BdApi.showConfirmationModal;
          showConfirmationModal(
            'Library Missing',
            `The library plugin needed for ${config.info.name} is missing. Please click Download Now to install it.`,
            {
              confirmText: 'Download Now',
              cancelText: 'Cancel',
              onConfirm: () => {
                const downloadUrl =
                  'https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js';
                BdApi.Net.fetch(downloadUrl)
                  .then((response) => {
                    if (!response?.ok) throw new Error(`HTTP ${response?.status || 'unknown'}`);
                    return response.text();
                  })
                  .then((body) => {
                    require('fs').writeFile(
                      require('path').join(BdApi.Plugins.folder, '0PluginLibrary.plugin.js'),
                      body,
                      () => {}
                    );
                  })
                  .catch(() => {
                    require('electron').shell.openExternal(
                      'https://betterdiscord.app/Download?id=9'
                    );
                  });
              },
            }
          );
        }
        start() {}
        stop() {}
      }
    : (([Plugin, Api]) => {
        const plugin = (Plugin, Library) => {
          const { Patcher, Toasts } = Library;
          const fs = require('fs');
          const path = require('path');

          return class ThemeAutoMaintainer extends Plugin {
            constructor() {
              super();
              // Live DOM data
              this.liveClasses = new Map();
              this.githubClasses = new Map();

              // Analysis results
              this.updatableSelectors = [];
              this.unusedSelectors = [];
              this.brokenSelectors = []; // Attribute selectors that don't match DOM

              // State
              this.checkIntervalId = null;
              this.backupIntervalId = null;
              this.mutationObserver = null;
              this.startupCheckDone = false;
            }

            getDefaultSettings() {
              return {
                autoUpdate: true,
                checkOnStartup: true,
                checkInterval: 30,
                useLiveDOM: true,
                useGitHub: true,
                requireBothSources: true,
                autoCleanup: false,
                commentInsteadOfRemove: true,
                backupInterval: 24,
                maxBackups: 10,
                showNotifications: true,
                verboseLogging: false,
              };
            }

            async onStart() {
              this.log('Starting Theme Auto Maintainer');

              // Step 1: Extract live classes from Discord DOM
              if (this.settings.useLiveDOM) {
                this.extractLiveClasses();
              }

              // Step 2: Load GitHub DiscordClasses repo
              if (this.settings.useGitHub) {
                await this.loadGitHubRepo();
              }

              // Step 3: Run startup check if enabled
              if (this.settings.checkOnStartup && !this.startupCheckDone) {
                setTimeout(() => {
                  this.performFullCheck().catch((err) => this.error('Startup check failed:', err));
                }, 3000);
                this.startupCheckDone = true;
              }

              // Step 4: Setup periodic monitoring
              if (this.settings.checkInterval > 0) {
                this.setupPeriodicCheck();
              }

              // Step 5: Setup periodic backups
              if (this.settings.backupInterval > 0) {
                this.setupPeriodicBackup();
              }

              // Step 6: Monitor DOM for new classes
              if (this.settings.useLiveDOM) {
                this.setupDOMMutationObserver();
              }
            }

            onStop() {
              this.log('Stopping Theme Auto Maintainer');
              if (this.checkIntervalId) clearInterval(this.checkIntervalId);
              if (this.backupIntervalId) clearInterval(this.backupIntervalId);
              if (this.mutationObserver) this.mutationObserver.disconnect();
              Patcher.unpatchAll();
            }

            getSettingsPanel() {
              // Use custom HTML panel to avoid ZeresPluginLibrary render bugs
              const settings = this.settings || this.getDefaultSettings();

              const panel = document.createElement('div');
              panel.style.cssText = 'padding: 16px;';
              panel.innerHTML = `
                <style>
                  .tam-setting-group { margin-bottom: 20px; padding: 15px; background: var(--background-secondary); border-radius: 4px; }
                  .tam-setting-group h3 { margin: 0 0 10px 0; color: var(--header-primary); font-size: 14px; font-weight: 600; }
                  .tam-setting-item { margin: 10px 0; display: flex; justify-content: space-between; align-items: center; }
                  .tam-setting-label { color: var(--text-normal); font-size: 14px; }
                  .tam-setting-note { color: var(--text-muted); font-size: 12px; margin-top: 4px; }
                  .tam-switch { width: 40px; height: 24px; background: var(--background-modifier-accent); border-radius: 12px; position: relative; cursor: pointer; }
                  .tam-switch.active { background: #00ff88; }
                  .tam-switch-handle { width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: left 0.2s; }
                  .tam-switch.active .tam-switch-handle { left: 19px; }
                  .tam-slider { width: 200px; }
                  .tam-button { padding: 10px 16px; background: var(--button-positive-background); color: white; border: none; border-radius: 4px; cursor: pointer; margin: 5px 0; width: 100%; }
                  .tam-button:hover { opacity: 0.9; }
                </style>

                <div class="tam-setting-group">
                  <h3>Monitoring & Updates</h3>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Auto-Update Broken Classes</div>
                      <div class="tam-setting-note">Automatically fix broken classes found via DOM + GitHub</div>
                    </div>
                    <div class="tam-switch ${
                      settings.autoUpdate ? 'active' : ''
                    }" data-setting="autoUpdate">
                      <div class="tam-switch-handle"></div>
                    </div>
                  </div>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Check on Discord Startup</div>
                      <div class="tam-setting-note">Scan and update themes when Discord starts</div>
                    </div>
                    <div class="tam-switch ${
                      settings.checkOnStartup ? 'active' : ''
                    }" data-setting="checkOnStartup">
                      <div class="tam-switch-handle"></div>
                    </div>
                  </div>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Check Interval: <span id="tam-interval-value">${
                        settings.checkInterval
                      }</span> minutes</div>
                      <div class="tam-setting-note">How often to scan for changes (0 = manual only)</div>
                    </div>
                    <input type="range" class="tam-slider" min="0" max="120" step="5" value="${
                      settings.checkInterval
                    }" data-setting="checkInterval" data-display="tam-interval-value" />
                  </div>
                </div>

                <div class="tam-setting-group">
                  <h3>Verification & Safety</h3>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Scan Live Discord DOM</div>
                      <div class="tam-setting-note">Extract current classes from Discord DOM (most accurate)</div>
                    </div>
                    <div class="tam-switch ${
                      settings.useLiveDOM ? 'active' : ''
                    }" data-setting="useLiveDOM">
                      <div class="tam-switch-handle"></div>
                    </div>
                  </div>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Verify with GitHub Repo</div>
                      <div class="tam-setting-note">Cross-reference with IBeSarah DiscordClasses repo</div>
                    </div>
                    <div class="tam-switch ${
                      settings.useGitHub ? 'active' : ''
                    }" data-setting="useGitHub">
                      <div class="tam-switch-handle"></div>
                    </div>
                  </div>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Require Both Verifications</div>
                      <div class="tam-setting-note">Only update if found in BOTH live DOM AND GitHub (safest)</div>
                    </div>
                    <div class="tam-switch ${
                      settings.requireBothSources ? 'active' : ''
                    }" data-setting="requireBothSources">
                      <div class="tam-switch-handle"></div>
                    </div>
                  </div>
                </div>

                <div class="tam-setting-group">
                  <h3>Cleanup & Backups</h3>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Auto-Cleanup Unused Selectors</div>
                      <div class="tam-setting-note">Automatically comment out selectors not found in DOM or GitHub</div>
                    </div>
                    <div class="tam-switch ${
                      settings.autoCleanup ? 'active' : ''
                    }" data-setting="autoCleanup">
                      <div class="tam-switch-handle"></div>
                    </div>
                  </div>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Comment Out Instead of Remove</div>
                      <div class="tam-setting-note">Mark unused selectors with /* UNUSED */ for manual review</div>
                    </div>
                    <div class="tam-switch ${
                      settings.commentInsteadOfRemove ? 'active' : ''
                    }" data-setting="commentInsteadOfRemove">
                      <div class="tam-switch-handle"></div>
                    </div>
                  </div>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Backup Interval: <span id="tam-backup-value">${
                        settings.backupInterval
                      }</span> hours</div>
                      <div class="tam-setting-note">Create timestamped backups periodically (0 = manual only)</div>
                    </div>
                    <input type="range" class="tam-slider" min="0" max="168" step="6" value="${
                      settings.backupInterval
                    }" data-setting="backupInterval" data-display="tam-backup-value" />
                  </div>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Maximum Backups: <span id="tam-maxbackups-value">${
                        settings.maxBackups
                      }</span></div>
                      <div class="tam-setting-note">Auto-delete old backups beyond this count</div>
                    </div>
                    <input type="range" class="tam-slider" min="1" max="50" step="1" value="${
                      settings.maxBackups
                    }" data-setting="maxBackups" data-display="tam-maxbackups-value" />
                  </div>
                </div>

                <div class="tam-setting-group">
                  <h3>Notifications & Logging</h3>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Show Notifications</div>
                      <div class="tam-setting-note">Toast notifications for updates and cleanups</div>
                    </div>
                    <div class="tam-switch ${
                      settings.showNotifications ? 'active' : ''
                    }" data-setting="showNotifications">
                      <div class="tam-switch-handle"></div>
                    </div>
                  </div>
                  <div class="tam-setting-item">
                    <div>
                      <div class="tam-setting-label">Verbose Console Logging</div>
                      <div class="tam-setting-note">Detailed logs in console for debugging</div>
                    </div>
                    <div class="tam-switch ${
                      settings.verboseLogging ? 'active' : ''
                    }" data-setting="verboseLogging">
                      <div class="tam-switch-handle"></div>
                    </div>
                  </div>
                </div>

                <div class="tam-setting-group">
                  <h3>Manual Actions</h3>
                  <button class="tam-button" data-action="check">Run Full Check</button>
                  <button class="tam-button" data-action="update">Apply Class Updates</button>
                  <button class="tam-button" data-action="clean">Clean Unused Selectors</button>
                  <button class="tam-button" data-action="backup">Create Backup Now</button>
                  <button class="tam-button" data-action="report">View Detailed Report</button>
                </div>
              `;

              // Add event listeners for switches
              panel.querySelectorAll('.tam-switch').forEach((sw) => {
                sw.addEventListener('click', () => {
                  const setting = sw.dataset.setting;
                  const newValue = !sw.classList.contains('active');
                  sw.classList.toggle('active');
                  this.settings[setting] = newValue;
                  this.saveSettings();

                  if (setting === 'checkInterval') this.setupPeriodicCheck();
                  if (setting === 'backupInterval') this.setupPeriodicBackup();
                });
              });

              // Add event listeners for sliders
              panel.querySelectorAll('.tam-slider').forEach((slider) => {
                slider.addEventListener('input', (e) => {
                  const setting = slider.dataset.setting;
                  const value = parseInt(e.target.value);
                  const display = document.getElementById(slider.dataset.display);
                  if (display) display.textContent = value;
                  this.settings[setting] = value;
                  this.saveSettings();

                  if (setting === 'checkInterval') this.setupPeriodicCheck();
                  if (setting === 'backupInterval') this.setupPeriodicBackup();
                });
              });

              // Add event listeners for buttons
              panel.querySelectorAll('.tam-button').forEach((btn) => {
                btn.addEventListener('click', async () => {
                  const action = btn.dataset.action;
                  if (action === 'check') await this.performFullCheck();
                  if (action === 'update') this.applyUpdates();
                  if (action === 'clean') this.cleanUnused();
                  if (action === 'backup') this.createBackups();
                  if (action === 'report') this.showDetailedReport();
                });
              });

              return panel;
            }

            // ============================================================================
            // LIVE DOM SCANNING
            // ============================================================================

            /**
             * Extract current classes from live Discord DOM
             */
            extractLiveClasses() {
              this.vlog('Extracting live classes from Discord DOM');
              const classMap = new Map();

              const elements = document.querySelectorAll('[class]');

              elements.forEach((element) => {
                // Handle SVG elements where className is an object
                const className =
                  typeof element.className === 'string'
                    ? element.className
                    : element.className?.baseVal || '';

                const classes = className.split(' ');
                classes.forEach((cls) => {
                  // Match Discord webpack pattern: semanticName_hash or semanticName__hash
                  const match = cls.match(/^([a-zA-Z][a-zA-Z0-9]*)(_|__)([a-f0-9]{5,6})$/);
                  if (match) {
                    const semantic = match[1];
                    const fullClass = cls;

                    if (!classMap.has(semantic)) {
                      classMap.set(semantic, new Set());
                    }
                    classMap.get(semantic).add(fullClass);
                  }
                });
              });

              this.liveClasses = classMap;
              this.vlog(`Extracted ${classMap.size} semantic classes from live DOM`);

              return classMap;
            }

            /**
             * Setup DOM mutation observer
             */
            setupDOMMutationObserver() {
              if (this.mutationObserver) {
                this.mutationObserver.disconnect();
              }

              this.mutationObserver = new MutationObserver((mutations) => {
                let hasNewClasses = false;

                mutations.forEach((mutation) => {
                  if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    hasNewClasses = true;
                  } else if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    hasNewClasses = true;
                  }
                });

                if (hasNewClasses) {
                  clearTimeout(this.extractDebounceTimer);
                  this.extractDebounceTimer = setTimeout(() => {
                    this.extractLiveClasses();
                  }, 5000);
                }
              });

              this.mutationObserver.observe(document.body, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeFilter: ['class'],
              });

              this.vlog('DOM mutation observer active');
            }

            // ============================================================================
            // GITHUB REPO INTEGRATION
            // ============================================================================

            /**
             * Load DiscordClasses from GitHub repo
             */
            async loadGitHubRepo() {
              this.log('Loading DiscordClasses from GitHub');

              try {
                // Use fetch API (available in Electron/Discord)
                const response = await fetch(
                  'https://raw.githubusercontent.com/IBeSarah/DiscordClasses/main/discordclasses.json'
                );

                if (!response.ok) {
                  this.error(`GitHub returned ${response.status} ${response.statusText}`);
                  this.log('Using live DOM only');
                  return new Map();
                }

                const text = await response.text();

                // Validate JSON structure
                if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) {
                  this.error('GitHub response is not JSON');
                  this.log('Using live DOM only');
                  return new Map();
                }

                const json = JSON.parse(text);

                // Convert to semantic -> hashed mapping
                const repoMap = new Map();
                Object.values(json).forEach((module) => {
                  Object.entries(module).forEach(([semantic, hashed]) => {
                    if (!repoMap.has(semantic)) {
                      repoMap.set(semantic, new Set());
                    }
                    repoMap.get(semantic).add(hashed);
                  });
                });

                this.githubClasses = repoMap;
                this.log(`Loaded ${repoMap.size} semantic classes from GitHub`);
                if (this.settings.showNotifications) {
                  Toasts.success('GitHub DiscordClasses loaded');
                }
                return repoMap;
              } catch (err) {
                this.error('GitHub load failed:', err.message || err);
                this.log('Using live DOM only');
                return new Map();
              }
            }

            // ============================================================================
            // THEME ANALYSIS
            // ============================================================================

            /**
             * Perform full check: Scan themes, find updates, find unused
             */
            async performFullCheck() {
              this.log('Performing full theme check');

              // Refresh data sources
              if (this.settings.useLiveDOM) {
                this.extractLiveClasses();
              }

              if (this.settings.useGitHub) {
                try {
                  await this.loadGitHubRepo();
                } catch (err) {
                  this.error('GitHub load failed, continuing with live DOM only');
                }
              }

              // Reset results
              this.updatableSelectors = [];
              this.unusedSelectors = [];

              // Analyze all themes
              await this.analyzeAllThemes();

              // Show summary
              this.showSummary();

              // Auto-update if enabled
              if (this.settings.autoUpdate && this.updatableSelectors.length > 0) {
                this.applyUpdates();
              }

              // Auto-cleanup if enabled
              if (this.settings.autoCleanup && this.unusedSelectors.length > 0) {
                this.cleanUnused();
              }
            }

            /**
             * Analyze all enabled themes
             */
            async analyzeAllThemes() {
              const themesPath = path.join(BdApi.Themes.folder);

              try {
                const themeFiles = fs
                  .readdirSync(themesPath)
                  .filter((f) => f.endsWith('.theme.css'));

                for (const file of themeFiles) {
                  const themePath = path.join(themesPath, file);
                  this.vlog(`Analyzing: ${file}`);
                  await this.analyzeTheme(themePath, file);
                }
              } catch (err) {
                this.error('Failed to analyze themes:', err);
              }
            }

            /**
             * Analyze single theme file
             */
            async analyzeTheme(themePath, themeName) {
              try {
                const content = fs.readFileSync(themePath, 'utf8');
                const selectors = this.extractSelectorsFromCSS(content);

                selectors.forEach(({ selector, line }) => {
                  // Test against live DOM
                  const matchCount = this.testSelector(selector);

                  if (matchCount === 0) {
                    // Unmatched in DOM - check if it can be updated
                    const updateInfo = this.checkForUpdate(selector);

                    if (updateInfo) {
                      // Can be updated!
                      this.updatableSelectors.push({
                        selector,
                        theme: themeName,
                        themePath,
                        line,
                        newClass: updateInfo.newClass,
                        semantic: updateInfo.semantic,
                        verifiedBy: updateInfo.verifiedBy,
                      });
                    } else {
                      // Truly unused (not in DOM, not in GitHub)
                      this.unusedSelectors.push({
                        selector,
                        theme: themeName,
                        themePath,
                        line,
                        type: this.categorizeSelector(selector),
                      });
                    }
                  }
                });
              } catch (err) {
                this.error(`Failed to analyze ${themeName}:`, err);
              }
            }

            /**
             * Extract all selectors from CSS content
             */
            extractSelectorsFromCSS(css) {
              const selectors = [];
              const lines = css.split('\n');

              // Remove comments
              css = css.replace(/\/\*[\s\S]*?\*\//g, '');

              // Match CSS rules
              const rulePattern = /([^{]+)\{[^}]*\}/g;
              let match;

              while ((match = rulePattern.exec(css)) !== null) {
                const selectorBlock = match[1].trim();
                const individualSelectors = selectorBlock.split(',');

                individualSelectors.forEach((sel) => {
                  const selector = sel.trim();
                  if (selector && !selector.startsWith('@')) {
                    const line = this.findLineNumber(selector, lines);
                    selectors.push({ selector, line });
                  }
                });
              }

              return selectors;
            }

            /**
             * Find line number for selector in file
             */
            findLineNumber(selector, lines) {
              try {
                const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const pattern = new RegExp(escapedSelector);

                for (let i = 0; i < lines.length; i++) {
                  if (pattern.test(lines[i])) {
                    return i + 1;
                  }
                }
              } catch (err) {
                // Regex error, skip
              }
              return -1;
            }

            /**
             * Test selector against DOM
             */
            testSelector(selector) {
              try {
                const matches = document.querySelectorAll(selector);
                return matches.length;
              } catch (err) {
                return -1; // Invalid selector
              }
            }

            /**
             * Check if selector can be updated (multi-source verification)
             */
            checkForUpdate(selector) {
              // Extract semantic name from selector
              let semantic = null;
              let oldClass = null;

              // Pattern 1: .className_hash or .className-hash
              let match = selector.match(/^\.([a-zA-Z][a-zA-Z0-9]*)(_|-)([a-f0-9]{5,6})$/);
              if (match) {
                semantic = match[1];
                oldClass = match[0].substring(1); // Remove leading dot
              }

              // Pattern 2: [class*="className_hash"]
              if (!semantic) {
                match = selector.match(/\[class\*="([a-zA-Z][a-zA-Z0-9]*)(_|-)([a-f0-9]{5,6})"\]/);
                if (match) {
                  semantic = match[1];
                  oldClass = match[1] + match[2] + match[3];
                }
              }

              if (!semantic) return null;

              // Multi-source verification
              const verifiedBy = [];
              let newClass = null;

              // Check live DOM
              if (this.settings.useLiveDOM && this.liveClasses.has(semantic)) {
                const liveClass = Array.from(this.liveClasses.get(semantic))[0];
                if (liveClass !== oldClass) {
                  newClass = liveClass;
                  verifiedBy.push('DOM');
                }
              }

              // Check GitHub repo
              if (this.settings.useGitHub && this.githubClasses.has(semantic)) {
                const githubClass = Array.from(this.githubClasses.get(semantic))[0];
                if (githubClass !== oldClass) {
                  if (!newClass) {
                    newClass = githubClass;
                  }
                  verifiedBy.push('GitHub');
                }
              }

              // Require both sources if configured
              if (this.settings.requireBothSources && verifiedBy.length < 2) {
                return null; // Not verified by both sources
              }

              if (newClass && verifiedBy.length > 0) {
                return { semantic, newClass, verifiedBy };
              }

              return null;
            }

            /**
             * Categorize selector by type
             */
            categorizeSelector(selector) {
              if (selector.includes('::before') || selector.includes('::after'))
                return 'pseudo-element';
              if (selector.includes(':hover') || selector.includes(':focus')) return 'pseudo-class';
              if (selector.startsWith('.')) return 'class';
              if (selector.startsWith('#')) return 'id';
              if (selector.includes('[')) return 'attribute';
              if (selector.includes(':is') || selector.includes(':not')) return 'functional-pseudo';
              return 'element';
            }

            // ============================================================================
            // AUTO-UPDATE BROKEN CLASSES
            // ============================================================================

            /**
             * Apply class updates from verification
             */
            applyUpdates() {
              if (this.updatableSelectors.length === 0) {
                Toasts.info('No broken classes to update');
                return;
              }

              this.log(`Applying ${this.updatableSelectors.length} class updates`);

              // Group by theme
              const byTheme = new Map();
              this.updatableSelectors.forEach((item) => {
                if (!byTheme.has(item.themePath)) {
                  byTheme.set(item.themePath, []);
                }
                byTheme.get(item.themePath).push(item);
              });

              let totalUpdated = 0;

              byTheme.forEach((updates, themePath) => {
                try {
                  let content = fs.readFileSync(themePath, 'utf8');
                  const themeName = path.basename(themePath);

                  // Create backup in BetterDiscord folder
                  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
                  const backupPath = `${themePath}.update-${timestamp}.bak`;
                  fs.writeFileSync(backupPath, content, 'utf8');

                  // Apply each update
                  updates.forEach(({ selector, newClass, semantic, verifiedBy }) => {
                    const escapedOld = this.escapeRegex(selector.replace(/^\./, ''));
                    const escapedNew = newClass.replace(/^\./, '');

                    // Replace .oldClass with .newClass
                    content = content.replace(
                      new RegExp(`\\.${escapedOld}\\b`, 'g'),
                      `.${escapedNew}`
                    );

                    // Replace [class*="oldClass"] with [class*="newClass"]
                    content = content.replace(
                      new RegExp(`\\[class\\*="${escapedOld}"\\]`, 'g'),
                      `[class*="${escapedNew}"]`
                    );

                    totalUpdated++;
                    this.vlog(
                      `${selector} → ${newClass} (${semantic}) [verified by: ${verifiedBy.join(
                        ', '
                      )}]`
                    );
                  });

                  // Save updated theme to BetterDiscord folder
                  fs.writeFileSync(themePath, content, 'utf8');
                  this.log(`Updated: ${themeName}`);

                  // Sync to development folders (dev + assets)
                  this.syncToDevelopmentFolders(themeName, content, timestamp);
                } catch (err) {
                  this.error(`Failed to update ${themePath}:`, err);
                }
              });

              if (this.settings.showNotifications) {
                Toasts.success(`Updated ${totalUpdated} broken classes! Synced to dev + assets.`);
              }

              // Clear updatable list
              this.updatableSelectors = [];

              // Re-analyze to find remaining issues
              setTimeout(() => {
                this.performFullCheck().catch((err) => this.error('Re-analysis failed:', err));
              }, 1000);
            }

            /**
             * Sync updated theme to development folders
             * - betterdiscord-dev/themes/ (with backup)
             * - betterdiscord-assets/themes/ (no backup, always current)
             */
            syncToDevelopmentFolders(themeName, content, timestamp) {
              try {
                const homeDir = require('os').homedir();

                // Sync to betterdiscord-dev (with backup)
                const devPath = path.join(
                  homeDir,
                  'Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev/themes'
                );
                if (fs.existsSync(devPath)) {
                  const devThemePath = path.join(devPath, themeName);
                  const devBackupDir = path.join(devPath, 'backups');

                  // Create backup in dev folder
                  if (!fs.existsSync(devBackupDir)) {
                    fs.mkdirSync(devBackupDir, { recursive: true });
                  }
                  const devBackupPath = path.join(
                    devBackupDir,
                    `${themeName}.update-${timestamp}.bak`
                  );
                  if (fs.existsSync(devThemePath)) {
                    fs.copyFileSync(devThemePath, devBackupPath);
                  }

                  // Write updated theme to dev
                  fs.writeFileSync(devThemePath, content, 'utf8');
                  this.vlog(`Synced to dev: ${themeName}`);
                }

                // Sync to betterdiscord-assets (no backup, always up-to-date)
                const assetsPath = path.join(
                  homeDir,
                  'Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes'
                );
                if (fs.existsSync(assetsPath)) {
                  if (!fs.existsSync(assetsPath)) {
                    fs.mkdirSync(assetsPath, { recursive: true });
                  }
                  const assetsThemePath = path.join(assetsPath, themeName);
                  fs.writeFileSync(assetsThemePath, content, 'utf8');
                  this.vlog(`Synced to assets: ${themeName} (always current, no backup)`);
                }
              } catch (err) {
                this.error('Failed to sync to development folders:', err);
              }
            }

            // ============================================================================
            // CLEANUP UNUSED SELECTORS
            // ============================================================================

            /**
             * Clean unused selectors (comment out or remove)
             */
            cleanUnused() {
              if (this.unusedSelectors.length === 0) {
                Toasts.info('No unused selectors to clean');
                return;
              }

              const action = this.settings.commentInsteadOfRemove ? 'comment out' : 'remove';
              const showConfirmationModal = BdApi.UI?.showConfirmationModal || BdApi.showConfirmationModal;

              showConfirmationModal(
                'Clean Unused Selectors',
                `This will ${action} ${this.unusedSelectors.length} unused selectors. Backups will be created. Continue?`,
                {
                  confirmText: 'Clean Up',
                  cancelText: 'Cancel',
                  onConfirm: () => {
                    this.performCleanup();
                  },
                }
              );
            }

            /**
             * Perform cleanup
             */
            performCleanup() {
              this.log(`Cleaning ${this.unusedSelectors.length} unused selectors`);

              // Group by theme
              const byTheme = new Map();
              this.unusedSelectors.forEach((item) => {
                if (!byTheme.has(item.themePath)) {
                  byTheme.set(item.themePath, []);
                }
                byTheme.get(item.themePath).push(item);
              });

              let totalCleaned = 0;

              byTheme.forEach((items, themePath) => {
                try {
                  let content = fs.readFileSync(themePath, 'utf8');
                  const lines = content.split('\n');
                  const themeName = path.basename(themePath);

                  // Create backup in BetterDiscord folder
                  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
                  const backupPath = `${themePath}.cleanup-${timestamp}.bak`;
                  fs.writeFileSync(backupPath, content, 'utf8');

                  // Sort by line (descending) to avoid line number shifts
                  items.sort((a, b) => b.line - a.line);

                  // Process each selector
                  items.forEach(({ selector, line }) => {
                    if (line > 0 && line <= lines.length) {
                      if (this.settings.commentInsteadOfRemove) {
                        lines[line - 1] = `/* UNUSED: ${lines[line - 1].trim()} */`;
                      } else {
                        lines[line - 1] = `/* REMOVED: ${selector} */`;
                      }
                      totalCleaned++;
                    }
                  });

                  // Save cleaned theme to BetterDiscord folder
                  content = lines.join('\n');
                  fs.writeFileSync(themePath, content, 'utf8');

                  // Sync to development folders (dev + assets)
                  this.syncToDevelopmentFolders(themeName, content, timestamp);
                } catch (err) {
                  this.error(`Failed to clean ${themePath}:`, err);
                }
              });

              if (this.settings.showNotifications) {
                Toasts.success(`Cleaned ${totalCleaned} unused selectors! Synced to dev + assets.`);
              }

              this.unusedSelectors = [];
            }

            // ============================================================================
            // BACKUP MANAGEMENT
            // ============================================================================

            /**
             * Create timestamped backups of all themes
             */
            createBackups() {
              this.log('Creating theme backups');
              const themesPath = path.join(BdApi.Themes.folder);
              const backupDir = path.join(themesPath, 'backups');

              try {
                if (!fs.existsSync(backupDir)) {
                  fs.mkdirSync(backupDir, { recursive: true });
                }

                const themeFiles = fs
                  .readdirSync(themesPath)
                  .filter((f) => f.endsWith('.theme.css'));
                const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
                let backupCount = 0;

                themeFiles.forEach((file) => {
                  const sourcePath = path.join(themesPath, file);
                  const backupPath = path.join(backupDir, `${file}.${timestamp}.bak`);

                  fs.copyFileSync(sourcePath, backupPath);
                  backupCount++;
                  this.vlog(`Backed up: ${file}`);
                });

                // Cleanup old backups
                this.cleanupOldBackups(backupDir);

                if (this.settings.showNotifications) {
                  Toasts.success(`Created ${backupCount} theme backups`);
                }
                this.log(`Backed up ${backupCount} themes to ${backupDir}`);
              } catch (err) {
                this.error('Failed to create backups:', err);
              }
            }

            /**
             * Cleanup old backups beyond max count
             */
            cleanupOldBackups(backupDir) {
              try {
                const backups = fs
                  .readdirSync(backupDir)
                  .filter((f) => f.endsWith('.bak'))
                  .map((f) => ({
                    name: f,
                    path: path.join(backupDir, f),
                    mtime: fs.statSync(path.join(backupDir, f)).mtime,
                  }))
                  .sort((a, b) => b.mtime - a.mtime); // Newest first

                const maxBackups = this.settings.maxBackups || 10;

                if (backups.length > maxBackups) {
                  const toDelete = backups.slice(maxBackups);
                  toDelete.forEach((backup) => {
                    fs.unlinkSync(backup.path);
                    this.vlog(`Deleted old backup: ${backup.name}`);
                  });
                  this.log(`Cleaned up ${toDelete.length} old backups`);
                }
              } catch (err) {
                this.error('Failed to cleanup old backups:', err);
              }
            }

            /**
             * Setup periodic backup
             */
            setupPeriodicBackup() {
              if (this.backupIntervalId) {
                clearInterval(this.backupIntervalId);
              }

              if (this.settings.backupInterval > 0) {
                const intervalMs = this.settings.backupInterval * 60 * 60 * 1000;
                this.backupIntervalId = setInterval(() => {
                  this.createBackups();
                }, intervalMs);
                this.log(`Periodic backups enabled: every ${this.settings.backupInterval} hours`);
              }
            }

            // ============================================================================
            // PERIODIC MONITORING
            // ============================================================================

            /**
             * Setup periodic checking
             */
            setupPeriodicCheck() {
              if (this.checkIntervalId) {
                clearInterval(this.checkIntervalId);
              }

              if (this.settings.checkInterval > 0) {
                const intervalMs = this.settings.checkInterval * 60 * 1000;
                this.checkIntervalId = setInterval(() => {
                  this.performFullCheck();
                }, intervalMs);
                this.log(`Periodic checks enabled: every ${this.settings.checkInterval} minutes`);
              }
            }

            // ============================================================================
            // REPORTING
            // ============================================================================

            /**
             * Show summary in console
             */
            showSummary() {
              // Minimal console output
              if (this.updatableSelectors.length > 0) {
                this.log(`Found ${this.updatableSelectors.length} updatable classes`);
              }

              if (this.unusedSelectors.length > 0 && this.settings.verboseLogging) {
                this.log(
                  `Found ${this.unusedSelectors.length} unused selectors (view in settings)`
                );
              }

              if (this.brokenSelectors.length > 0) {
                this.log(
                  `Found ${this.brokenSelectors.length} broken attribute selectors (suggestions available)`
                );
              }

              if (
                this.updatableSelectors.length === 0 &&
                this.unusedSelectors.length === 0 &&
                this.brokenSelectors.length === 0
              ) {
                this.log('All themes are clean and up-to-date!');
              }
            }

            /**
             * Show detailed report modal
             */
            showDetailedReport() {
              // Create backdrop overlay to prevent interaction with elements behind
              const backdrop = document.createElement('div');
              backdrop.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100vw;
                        height: 100vh;
                        background: rgba(0, 0, 0, 0.85);
                        z-index: 9999;
                    `;
              backdrop.id = 'tam-report-backdrop';
              document.body.appendChild(backdrop);

              const modal = document.createElement('div');
              modal.id = 'tam-report-modal';
              modal.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: var(--background-primary);
                        color: var(--text-normal);
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 0 20px rgba(0,0,0,0.5);
                        max-width: 85vw;
                        max-height: 85vh;
                        overflow: auto;
                        z-index: 10000;
                        font-family: monospace;
                    `;

              let html = `
                        <h2 style="margin: 0 0 15px 0; color: var(--header-primary);">Theme Maintenance Report</h2>
                        <p style="margin: 0 0 15px 0; color: var(--text-muted);">
                            Found ${this.updatableSelectors.length} broken classes, ${this.unusedSelectors.length} unused selectors,
                            and ${this.brokenSelectors.length} broken attribute selectors
                        </p>
                    `;

              // Updatable selectors section
              if (this.updatableSelectors.length > 0) {
                html += `
                            <div style="margin: 20px 0; padding: 15px; background: var(--background-secondary); border-radius: 4px; border-left: 4px solid #00ff88;">
                                <h3 style="color: #00ff88; margin: 0 0 10px 0;">Broken Classes (${
                                  this.updatableSelectors.length
                                })</h3>
                                <p style="margin: 0 0 10px 0; color: var(--text-normal);">
                                    These can be auto-updated. Verified by: ${
                                      this.settings.useLiveDOM && this.settings.useGitHub
                                        ? 'Live DOM + GitHub'
                                        : this.settings.useLiveDOM
                                        ? 'Live DOM'
                                        : 'GitHub'
                                    }
                                </p>
                                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                                    <tr style="border-bottom: 1px solid var(--background-modifier-accent);">
                                        <th style="text-align: left; padding: 8px;">Line</th>
                                        <th style="text-align: left; padding: 8px;">Old Class</th>
                                        <th style="text-align: left; padding: 8px;">→</th>
                                        <th style="text-align: left; padding: 8px;">New Class</th>
                                        <th style="text-align: left; padding: 8px;">Verified By</th>
                                    </tr>
                        `;

                this.updatableSelectors.forEach((item) => {
                  html += `
                                <tr style="border-bottom: 1px solid var(--background-modifier-accent);">
                                    <td style="padding: 8px; color: var(--text-muted);">${
                                      item.line > 0 ? item.line : 'N/A'
                                    }</td>
                                    <td style="padding: 8px; color: #ff6b6b;">${this.escapeHtml(
                                      item.selector
                                    )}</td>
                                    <td style="padding: 8px; color: var(--text-muted);">→</td>
                                    <td style="padding: 8px; color: #00ff88;">${this.escapeHtml(
                                      item.newClass
                                    )}</td>
                                    <td style="padding: 8px; color: var(--text-muted);">${item.verifiedBy.join(
                                      ' + '
                                    )}</td>
                                </tr>
                            `;
                });

                html += `
                                </table>
                                <button id="apply-updates-btn" style="
                                    margin-top: 15px;
                                    padding: 12px 24px;
                                    background: #00ff88;
                                    color: #000;
                                    border: none;
                                    border-radius: 4px;
                                    cursor: pointer;
                                    font-size: 14px;
                                    font-weight: bold;
                                ">Apply Updates Now</button>
                            </div>
                        `;
              }

              // Broken attribute selectors section (NEW)
              if (this.brokenSelectors.length > 0) {
                html += `
                            <div style="margin: 20px 0; padding: 15px; background: var(--background-secondary); border-radius: 4px; border-left: 4px solid #ffa500;">
                                <h3 style="color: #ffa500; margin: 0 0 10px 0;">Broken Attribute Selectors (${this.brokenSelectors.length})</h3>
                                <p style="margin: 0 0 10px 0; color: var(--text-normal);">
                                    These selectors don't match in DOM but have suggested fixes
                                </p>
                                <div style="max-height: 400px; overflow-y: auto;">
                        `;

                this.brokenSelectors.slice(0, 20).forEach((item) => {
                  html += `
                                <div style="margin: 15px 0; padding: 10px; background: var(--background-tertiary); border-radius: 4px;">
                                    <div style="color: #ff6b6b; font-family: monospace; margin-bottom: 8px;">
                                        [BROKEN] ${this.escapeHtml(item.selector)}
                                    </div>
                            `;

                  item.suggestions.forEach((sug) => {
                    const confidenceColor =
                      sug.confidence === 'high'
                        ? '#00ff88'
                        : sug.confidence === 'medium'
                        ? '#ffa500'
                        : '#ff6b6b';
                    html += `
                                    <div style="margin: 5px 0 5px 20px; padding: 8px; background: var(--background-secondary); border-left: 3px solid ${confidenceColor}; border-radius: 2px;">
                                        <div style="color: ${confidenceColor}; font-size: 12px; margin-bottom: 4px;">
                                            [SUGGESTED] ${sug.type} (${sug.confidence} confidence)
                                        </div>
                                        <div style="color: var(--text-normal); font-family: monospace; font-size: 12px;">
                                            ${this.escapeHtml(sug.to)}
                                        </div>
                                        <div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">
                                            ${sug.reason} • Matches: ${sug.matches}
                                        </div>
                                    </div>
                                `;
                  });

                  html += `</div>`;
                });

                if (this.brokenSelectors.length > 20) {
                  html += `
                                <div style="padding: 10px; text-align: center; color: var(--text-muted);">
                                    ... and ${this.brokenSelectors.length - 20} more
                                </div>
                            `;
                }

                html += `
                                </div>
                                <div style="margin-top: 10px; padding: 10px; background: var(--background-tertiary); border-radius: 4px;">
                                    <strong style="color: var(--text-normal);">How to fix:</strong>
                                    <ol style="margin: 8px 0; padding-left: 20px; color: var(--text-muted); font-size: 12px;">
                                        <li>Review suggestions above</li>
                                        <li>Test suggested selector in CSS Picker</li>
                                        <li>Update theme CSS manually</li>
                                        <li>Reload theme to verify</li>
                                    </ol>
                                </div>
                            </div>
                        `;
              }

              // Unused selectors section
              if (this.unusedSelectors.length > 0) {
                html += `
                            <div style="margin: 20px 0; padding: 15px; background: var(--background-secondary); border-radius: 4px; border-left: 4px solid #ff6b6b;">
                                <h3 style="color: #ff6b6b; margin: 0 0 10px 0;">Truly Unused Selectors (${
                                  this.unusedSelectors.length
                                })</h3>
                                <p style="margin: 0 0 10px 0; color: var(--text-normal);">
                                    Not found in Discord DOM or GitHub repo - safe to ${
                                      this.settings.commentInsteadOfRemove
                                        ? 'comment out'
                                        : 'remove'
                                    }
                                </p>
                                <table style="width: 100%; border-collapse: collapse; font-size: 12px; max-height: 300px; overflow: auto; display: block;">
                                    <thead style="display: table; width: 100%; table-layout: fixed;">
                                        <tr style="border-bottom: 1px solid var(--background-modifier-accent);">
                                            <th style="text-align: left; padding: 8px; width: 80px;">Line</th>
                                            <th style="text-align: left; padding: 8px;">Selector</th>
                                            <th style="text-align: left; padding: 8px; width: 120px;">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody style="display: table; width: 100%; table-layout: fixed;">
                        `;

                this.unusedSelectors.slice(0, 50).forEach((item) => {
                  html += `
                                <tr style="border-bottom: 1px solid var(--background-modifier-accent);">
                                    <td style="padding: 8px; color: var(--text-muted); width: 80px;">${
                                      item.line > 0 ? item.line : 'N/A'
                                    }</td>
                                    <td style="padding: 8px; color: var(--text-normal); word-break: break-all;">${this.escapeHtml(
                                      item.selector
                                    )}</td>
                                    <td style="padding: 8px; color: var(--text-muted); width: 120px;">${
                                      item.type
                                    }</td>
                                </tr>
                            `;
                });

                if (this.unusedSelectors.length > 50) {
                  html += `
                                <tr>
                                    <td colspan="3" style="padding: 8px; text-align: center; color: var(--text-muted);">
                                        ... and ${this.unusedSelectors.length - 50} more
                                    </td>
                                </tr>
                            `;
                }

                html += `
                                    </tbody>
                                </table>
                                <button id="clean-unused-btn" style="
                                    margin-top: 15px;
                                    padding: 12px 24px;
                                    background: #ff6b6b;
                                    color: #fff;
                                    border: none;
                                    border-radius: 4px;
                                    cursor: pointer;
                                    font-size: 14px;
                                    font-weight: bold;
                                ">${
                                  this.settings.commentInsteadOfRemove ? 'Comment Out' : 'Remove'
                                } Unused</button>
                            </div>
                        `;
              }

              // Action buttons
              html += `
                        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--background-modifier-accent); text-align: right;">
                            <button id="create-backup-btn" style="
                                padding: 10px 20px;
                                background: var(--button-secondary-background);
                                color: var(--text-normal);
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 14px;
                                margin-right: 10px;
                            ">Create Backup</button>
                            <button id="export-report-btn" style="
                                padding: 10px 20px;
                                background: var(--button-secondary-background);
                                color: var(--text-normal);
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 14px;
                                margin-right: 10px;
                            ">Export Report</button>
                            <button id="close-report-btn" style="
                                padding: 10px 20px;
                                background: var(--button-secondary-background);
                                color: var(--text-normal);
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 14px;
                            ">Close</button>
                        </div>
                    `;

              modal.innerHTML = html;
              document.body.appendChild(modal);

              // Helper to close modal and backdrop
              const closeModal = () => {
                modal.remove();
                backdrop.remove();
              };

              // Close when clicking backdrop
              backdrop.onclick = closeModal;

              // Event listeners
              const applyBtn = modal.querySelector('#apply-updates-btn');
              if (applyBtn) {
                applyBtn.onclick = () => {
                  closeModal();
                  this.applyUpdates();
                };
              }

              const cleanBtn = modal.querySelector('#clean-unused-btn');
              if (cleanBtn) {
                cleanBtn.onclick = () => {
                  closeModal();
                  this.cleanUnused();
                };
              }

              modal.querySelector('#create-backup-btn').onclick = () => {
                this.createBackups();
              };

              modal.querySelector('#export-report-btn').onclick = () => {
                this.exportReport();
              };

              modal.querySelector('#close-report-btn').onclick = closeModal;

              // Close on escape
              const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                  closeModal();
                  document.removeEventListener('keydown', escapeHandler);
                }
              };
              document.addEventListener('keydown', escapeHandler);
            }

            /**
             * Export detailed report
             */
            exportReport() {
              const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
              const reportPath = path.join(
                BdApi.Themes.folder,
                `maintenance-report-${timestamp}.json`
              );

              const report = {
                generated: new Date().toISOString(),
                sources: {
                  liveDOM: this.settings.useLiveDOM,
                  github: this.settings.useGitHub,
                  requireBoth: this.settings.requireBothSources,
                },
                summary: {
                  updatable: this.updatableSelectors.length,
                  unused: this.unusedSelectors.length,
                  total: this.updatableSelectors.length + this.unusedSelectors.length,
                },
                updatableSelectors: this.updatableSelectors,
                unusedSelectors: this.unusedSelectors,
              };

              try {
                fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
                Toasts.success(`Report exported: ${path.basename(reportPath)}`);
                this.log(`Report saved to: ${reportPath}`);
              } catch (err) {
                this.error('Failed to export report:', err);
              }
            }

            // ============================================================================
            // HELPERS
            // ============================================================================

            makeButton(label, note, onClick) {
              const button = document.createElement('button');
              button.textContent = label;
              button.className = 'bd-button bd-button-filled';
              button.style.margin = '5px 0';
              button.style.width = '100%';
              button.onclick = onClick;

              const container = document.createElement('div');
              if (note) {
                const noteElem = document.createElement('div');
                noteElem.className = 'bd-description-3';
                noteElem.textContent = note;
                noteElem.style.marginBottom = '5px';
                container.appendChild(noteElem);
              }
              container.appendChild(button);

              return container;
            }

            escapeRegex(str) {
              return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }

            escapeHtml(text) {
              const div = document.createElement('div');
              div.textContent = text;
              return div.innerHTML;
            }

            log(...args) {
              console.log(`[ThemeAutoMaintainer]`, ...args);
            }

            vlog(...args) {
              if (this.settings.verboseLogging) {
                console.log(`[ThemeAutoMaintainer]`, ...args);
              }
            }

            error(...args) {
              console.error(`[ThemeAutoMaintainer]`, ...args);
            }
          };
        };
        return plugin(Plugin, Api);
      })(window.ZeresPluginLibrary.buildPlugin(config));
})();
