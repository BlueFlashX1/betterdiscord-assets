/**
 * @name SoloLevelingTheme
 * @description Solo Leveling theme — modular CSS with per-module toggle support.
 *              Each CSS section is injected as a separate <style> tag so individual
 *              modules can be toggled on/off for debugging and customization.
 * @version 2.0.0
 * @author Curio
 */

// CSS modules imported as text strings by esbuild (loader: { ".css": "text" })
const cssImports       = require('./modules/imports.css');
const cssWallpaper     = require('./modules/wallpaper.css');
const cssHome          = require('./modules/home.css');
const cssQuickSwitcher = require('./modules/quickswitcher.css');
const cssDmSidebar     = require('./modules/dm-sidebar.css');
const cssDialogs       = require('./modules/dialogs.css');
const cssUserPanel     = require('./modules/user-panel.css');
const cssServerList    = require('./modules/server-list.css');
const cssGuild         = require('./modules/guild.css');
const cssChat          = require('./modules/chat.css');
const cssProfile       = require('./modules/profile.css');
const cssDiscover      = require('./modules/discover.css');
const cssSettings      = require('./modules/settings.css');
const cssSnippets      = require('./modules/snippets.css');

// External stylesheet URLs that must be loaded as <link> elements
// (@import doesn't work inside <style> tags)
const EXTERNAL_IMPORTS = [
  { id: 'hsl',           url: 'https://discordstyles.github.io/HorizontalServerList/HorizontalServerList.css' },
  { id: 'hsl-bottom',    url: 'https://discordstyles.github.io/HorizontalServerList/bottomhsl.css' },
  { id: 'clearvision',   url: 'https://clearvision.github.io/ClearVision-v7/main.css' },
  { id: 'clearvision-bd', url: 'https://clearvision.github.io/ClearVision-v7/betterdiscord.css' },
  { id: 'fof-font',      url: 'https://db.onlinewebfonts.com/c/262e61977221d8478c4e05291da30122?family=Friend+or+Foe+BB' },
  { id: 'colored-mentions', url: 'https://davart154.github.io/Themes/Snippets/Colored%20Mentions/ColoredMentionsSource.css' },
  { id: 'improved-links', url: 'https://cdn.jsdelivr.net/gh/Riddim-GLiTCH/Discord-CSS-Snippets@main/snippets/CSS/ImprovedLinks.css' },
  { id: 'masked-links',  url: 'https://cdn.jsdelivr.net/gh/Riddim-GLiTCH/Discord-CSS-Snippets@main/snippets/CSS/ImprovedLinksMaskedLinksAddon.css' },
];

// Strip @import lines from imports.css — they're handled as <link> elements above.
// Keep only the :root vars, font overrides, and other CSS rules.
const cssImportsClean = cssImports.replace(/@import\s+url\([^)]+\)\s*;?\s*/g, '');

// Module registry — order matters (specificity cascade)
const CSS_MODULES = [
  { id: 'imports',        label: 'Variables & Fonts',         css: cssImportsClean },
  { id: 'wallpaper',      label: 'Animated Wallpaper',       css: cssWallpaper,     locked: true },
  { id: 'home',           label: 'Home & Friends',           css: cssHome },
  { id: 'quickswitcher',  label: 'Quick Switcher',           css: cssQuickSwitcher },
  { id: 'dm-sidebar',     label: 'DM Sidebar',              css: cssDmSidebar },
  { id: 'dialogs',        label: 'Dialog Boxes',             css: cssDialogs },
  { id: 'user-panel',     label: 'User Panel',               css: cssUserPanel },
  { id: 'server-list',    label: 'Server List / Dock',       css: cssServerList },
  { id: 'guild',          label: 'Guild & Channels',         css: cssGuild },
  { id: 'chat',           label: 'Chat & Messages',          css: cssChat },
  { id: 'profile',        label: 'User Profile',             css: cssProfile },
  { id: 'discover',       label: 'Discover & Quests',        css: cssDiscover },
  { id: 'settings',       label: 'Settings',                 css: cssSettings },
  { id: 'snippets',       label: 'Community Snippets',       css: cssSnippets },
];

const STYLE_PREFIX = 'sl-theme-';

module.exports = class SoloLevelingTheme {
  constructor(meta) {
    this.meta = meta;
    this._injectedStyles = new Map();
  }

  start() {
    // Load saved toggle states
    const saved = BdApi.Data.load(this.meta.name, 'moduleStates') || {};

    // Inject external stylesheets as <link> elements (must come first for cascade)
    for (const ext of EXTERNAL_IMPORTS) {
      this._injectExternalLink(ext);
    }

    // Inject CSS modules
    for (const mod of CSS_MODULES) {
      const enabled = saved[mod.id] !== false; // Default: all enabled
      if (enabled) {
        this._injectModule(mod);
      }
    }
  }

  stop() {
    // Remove all injected style tags
    for (const [id, styleEl] of this._injectedStyles) {
      if (styleEl?.isConnected) styleEl.remove();
    }
    this._injectedStyles.clear();

    // Remove external link elements
    for (const ext of EXTERNAL_IMPORTS) {
      const linkId = STYLE_PREFIX + 'ext-' + ext.id;
      document.getElementById(linkId)?.remove();
    }
  }

  _injectExternalLink(ext) {
    const linkId = STYLE_PREFIX + 'ext-' + ext.id;
    if (document.getElementById(linkId)) return;

    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = ext.url;
    link.setAttribute('data-sl-external', ext.id);
    document.head.appendChild(link);
  }

  _injectModule(mod) {
    const styleId = STYLE_PREFIX + mod.id;

    // Don't double-inject
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.setAttribute('data-sl-module', mod.id);
    style.textContent = mod.css;
    document.head.appendChild(style);
    this._injectedStyles.set(mod.id, style);
  }

  _removeModule(modId) {
    const styleId = STYLE_PREFIX + modId;
    const existing = document.getElementById(styleId);
    if (existing) existing.remove();
    this._injectedStyles.delete(modId);
  }

  _isModuleEnabled(modId) {
    return !!document.getElementById(STYLE_PREFIX + modId);
  }

  _toggleModule(modId) {
    const mod = CSS_MODULES.find(m => m.id === modId);
    if (!mod || mod.locked) return false;

    if (this._isModuleEnabled(modId)) {
      this._removeModule(modId);
      this._saveStates();
      return false; // now disabled
    } else {
      this._injectModule(mod);
      this._saveStates();
      return true; // now enabled
    }
  }

  _saveStates() {
    const states = {};
    for (const mod of CSS_MODULES) {
      states[mod.id] = this._isModuleEnabled(mod.id);
    }
    BdApi.Data.save(this.meta.name, 'moduleStates', states);
  }

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = 'padding: 16px; font-family: var(--font-primary); color: #e0e0e0;';

    const title = document.createElement('h2');
    title.textContent = 'Theme Modules';
    title.style.cssText = 'margin: 0 0 12px 0; font-size: 18px; color: #d4b0ff;';
    panel.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = 'Toggle individual CSS modules on/off for debugging. Changes take effect immediately.';
    desc.style.cssText = 'margin: 0 0 16px 0; font-size: 13px; color: #7a7a8a;';
    panel.appendChild(desc);

    for (const mod of CSS_MODULES) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px; margin-bottom: 2px;
        background: rgba(138,43,226,0.04);
        border-left: 3px solid ${mod.locked ? '#4a3a6a' : this._isModuleEnabled(mod.id) ? '#8a2be2' : '#2a1a3a'};
      `;

      const label = document.createElement('span');
      label.textContent = mod.label;
      label.style.cssText = `font-size: 14px; font-weight: 600; color: ${mod.locked ? '#5a4a6a' : '#e0d0f0'};`;

      const toggle = document.createElement('div');
      toggle.style.cssText = 'display: flex; align-items: center; gap: 8px;';

      if (mod.locked) {
        const lockBadge = document.createElement('span');
        lockBadge.textContent = 'LOCKED';
        lockBadge.style.cssText = 'font-size: 10px; color: #4a3a6a; font-weight: 700; letter-spacing: 0.08em;';
        toggle.appendChild(lockBadge);
      } else {
        const enabled = this._isModuleEnabled(mod.id);
        const btn = document.createElement('button');
        btn.textContent = enabled ? 'ON' : 'OFF';
        btn.style.cssText = `
          padding: 4px 14px; border: 1px solid ${enabled ? '#8a2be2' : '#3a2a5a'};
          background: ${enabled ? 'rgba(138,43,226,0.2)' : 'rgba(0,0,0,0.3)'};
          color: ${enabled ? '#d4b0ff' : '#5a4a6a'}; font-size: 12px; font-weight: 700;
          cursor: pointer; letter-spacing: 0.06em;
        `;
        btn.addEventListener('click', () => {
          const nowEnabled = this._toggleModule(mod.id);
          btn.textContent = nowEnabled ? 'ON' : 'OFF';
          btn.style.borderColor = nowEnabled ? '#8a2be2' : '#3a2a5a';
          btn.style.background = nowEnabled ? 'rgba(138,43,226,0.2)' : 'rgba(0,0,0,0.3)';
          btn.style.color = nowEnabled ? '#d4b0ff' : '#5a4a6a';
          row.style.borderLeftColor = nowEnabled ? '#8a2be2' : '#2a1a3a';
        });
        toggle.appendChild(btn);
      }

      row.appendChild(label);
      row.appendChild(toggle);
      panel.appendChild(row);
    }

    return panel;
  }
};
