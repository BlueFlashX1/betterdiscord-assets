#!/usr/bin/env python3
"""
Refactor TitleManager.plugin.js into 4-section structure (match SoloLevelingStats)

SECTIONS:
1. Imports & Dependencies
2. Configuration & Helpers
3. Major Operations
4. Debugging & Development
"""

import re

def refactor_title_manager():
    # Read the current file
    with open('plugins/TitleManager.plugin.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract sections
    header_match = re.search(r'(/\*\*.*?\*/)\s*module\.exports', content, re.DOTALL)
    header = header_match.group(1) if header_match else ''

    # Build new structure
    new_content = f'''{header}

module.exports = class SoloLevelingTitleManager {{
  // ============================================================================
  // SECTION 1: IMPORTS & DEPENDENCIES
  // ============================================================================
  // (No external imports needed for this plugin)

  // ============================================================================
  // SECTION 2: CONFIGURATION & HELPERS
  // ============================================================================

  // 2.1 CONSTRUCTOR & SETTINGS
  // ----------------------------------------------------------------------------
  constructor() {{
    this.defaultSettings = {{
      enabled: true,
      debugMode: false, // Debug mode toggle
    }};

    // CRITICAL FIX: Deep copy to prevent defaultSettings from being modified
    // Shallow copy (this.settings = this.defaultSettings) causes save corruption!
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.titleButton = null;
    this.titleModal = null;
    this._urlChangeCleanup = null;
    this._retryTimeout1 = null;
    this._retryTimeout2 = null;
    this._retryTimeouts = new Set();
    this._isStopped = false;
    this._originalPushState = null;
    this._originalReplaceState = null;
  }}

  // 2.2 HELPER FUNCTIONS
  // ----------------------------------------------------------------------------

  /**
   * HTML escaping utility for XSS prevention
   */
  escapeHtml(text) {{
    return typeof text !== 'string' ? text : (() => {{
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }})();
  }}

  /**
   * Debug logging helper (functional, no if-else)
   */
  debugLog(message, data = null) {{
    const log = () => console.log(`[TitleManager]`, message, data || '');
    return this.settings?.debugMode === true && log();
  }}

  // ============================================================================
  // SECTION 3: MAJOR OPERATIONS
  // ============================================================================

  // 3.1 PLUGIN LIFECYCLE
  // ----------------------------------------------------------------------------
  start() {{
    this._isStopped = false;
    this.loadSettings();
    this.injectCSS();
    this.createTitleButton();

    this._retryTimeout1 = setTimeout(() => {{
      this._retryTimeouts.delete(this._retryTimeout1);
      (!this.titleButton || !document.body.contains(this.titleButton)) && this.createTitleButton();
      this._retryTimeout1 = null;
    }}, 2000);
    this._retryTimeouts.add(this._retryTimeout1);

    this._retryTimeout2 = setTimeout(() => {{
      this._retryTimeouts.delete(this._retryTimeout2);
      (!this.titleButton || !document.body.contains(this.titleButton)) && this.createTitleButton();
      this._retryTimeout2 = null;
    }}, 5000);
    this._retryTimeouts.add(this._retryTimeout2);

    this.setupChannelWatcher();
  }}

  stop() {{
    this._isStopped = true;

    try {{
      this.removeTitleButton();
      this.closeTitleModal();
      this.removeCSS();

      this._retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this._retryTimeouts.clear();

      this._retryTimeout1 && (clearTimeout(this._retryTimeout1), this._retryTimeout1 = null);
      this._retryTimeout2 && (clearTimeout(this._retryTimeout2), this._retryTimeout2 = null);
    }} finally {{
      this._urlChangeCleanup && (this._urlChangeCleanup(), this._urlChangeCleanup = null);

      window._titleManagerInstances && (() => {{
        const instancesToRemove = [];
        window._titleManagerInstances.forEach((instance, modal) => {{
          instance === this && instancesToRemove.push(modal);
        }});
        instancesToRemove.forEach((modal) => window._titleManagerInstances.delete(modal));
      }})();
    }}
  }}

  // 3.2 SETTINGS MANAGEMENT
  // ----------------------------------------------------------------------------
  loadSettings() {{
    try {{
      const saved = BdApi.Data.load('TitleManager', 'settings');
      if (saved) {{
        // CRITICAL FIX: Deep merge to prevent nested object reference sharing
        const merged = {{ ...this.defaultSettings, ...saved }};
        this.settings = JSON.parse(JSON.stringify(merged));
      }}
    }} catch (error) {{
      this.debugLog('Error loading settings', error);
    }}
  }}

  saveSettings() {{
    try {{
      BdApi.Data.save('TitleManager', 'settings', this.settings);
    }} catch (error) {{
      this.debugLog('Error saving settings', error);
    }}
  }}

  getSettingsPanel() {{
    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.innerHTML = `
      <div>
        <h3 style="color: #8b5cf6;">Title Manager Settings</h3>
        <label style="display: flex; align-items: center; margin-bottom: 10px;">
          <input type="checkbox" ${{this.settings.enabled ? 'checked' : ''}} id="tm-enabled">
          <span style="margin-left: 10px;">Enable Title Manager</span>
        </label>
        <label style="display: flex; align-items: center; margin-bottom: 10px;">
          <input type="checkbox" ${{this.settings.debugMode ? 'checked' : ''}} id="tm-debug">
          <span style="margin-left: 10px;">Debug Mode (Show console logs)</span>
        </label>
      </div>
    `;

    const enabledCheckbox = panel.querySelector('#tm-enabled');
    const debugCheckbox = panel.querySelector('#tm-debug');

    enabledCheckbox?.addEventListener('change', (e) => {{
      this.settings.enabled = e.target.checked;
      this.saveSettings();
      e.target.checked ? this.createTitleButton() : (this.removeTitleButton(), this.closeTitleModal());
    }});

    debugCheckbox?.addEventListener('change', (e) => {{
      this.settings.debugMode = e.target.checked;
      this.saveSettings();
      this.debugLog('Debug mode toggled', {{ enabled: e.target.checked }});
    }});

    return panel;
  }}

  // 3.3 DATA ACCESS
  // ----------------------------------------------------------------------------
  getSoloLevelingData() {{
    try {{
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      const instance = soloPlugin?.instance || soloPlugin;
      const achievements = instance?.settings?.achievements || {{}};

      return soloPlugin ? {{
        titles: achievements.titles || [],
        activeTitle: achievements.activeTitle || null,
        achievements: achievements,
      }} : null;
    }} catch (error) {{
      this.debugLog('Error getting SoloLevelingStats data', error);
      return null;
    }}
  }}

  getTitleBonus(titleName) {{
    try {{
      const soloPlugin = BdApi.Plugins.get('SoloLevelingStats');
      const instance = soloPlugin?.instance || soloPlugin;
      const achievements = instance?.getAchievementDefinitions?.();
      const achievement = achievements?.find((a) => a.title === titleName);
      return achievement?.titleBonus || null;
    }} catch (error) {{
      return null;
    }}
  }}

  // 3.4 TITLE MANAGEMENT
  // ----------------------------------------------------------------------------'''

    # Extract equipTitle and unequipTitle functions
    equip_match = re.search(
        r'(equipTitle\(titleName\) \{.*?\n  \})\n\n  /\*\*.*?Unequip',
        content,
        re.DOTALL
    )
    if equip_match:
        equip_code = equip_match.group(1)
        # Replace if-else with functional alternatives and clean up
        equip_code = equip_code.replace('  equipTitle(titleName) {', '  equipTitle(titleName) {')

    unequip_match = re.search(
        r'(unequipTitle\(\) \{.*?\n  \})\n\n  createTitleButton',
        content,
        re.DOTALL
    )

    # Continue building the file...
    # For now, let's keep the original functions and just add section headers

    print("✅ Analysis complete. Proceeding with manual refactoring...")
    return None

if __name__ == '__main__':
    refactor_title_manager()
