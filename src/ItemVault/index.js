/**
 * ItemVault — Centralized item storage for the Solo Leveling plugin ecosystem.
 *
 * Channel header icon with popup inventory display.
 * Other plugins interact via BdApi.Events (see event-api.js).
 */

const Events = require('../shared/event-bus');
const { ItemVaultStorage } = require('./storage');
const { ItemVaultEventAPI } = require('./event-api');
const { runMigration } = require('./migration');
const { getAllItems, getItem, ITEMS } = require('./item-registry');
const CSS = require('./styles.css');
const { version: PLUGIN_VERSION } = require('./manifest.json');

const STYLE_ID = 'ItemVault-styles';
const HEADER_ICON_ID = 'itemvault-header-icon';
const POPUP_ID = 'itemvault-header-popup';

const HEADER_TOOLBAR_SELECTORS = [
  '[aria-label="Channel header"] [class*="toolbar_"]',
  '[class*="titleWrapper_"] [class*="toolbar_"]',
  'header [class*="toolbar_"]',
];

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = class ItemVault {
  constructor() {
    this._storage = new ItemVaultStorage();
    this._eventAPI = null;
    this._debugMode = false;
    this._headerIconLoop = null;
    this._popupTickLoop = null;
    this._stopped = true;
  }

  // ─── Lifecycle ──────────────────────────────────────

  async start() {
    this._stopped = false;
    this._debugMode = BdApi.Data.load('ItemVault', 'debugMode') ?? false;
    this._log(`ItemVault v${PLUGIN_VERSION} starting...`);

    BdApi.DOM.addStyle(STYLE_ID, CSS);

    try {
      await this._storage.open();
      await this._storage.loadAll();
      this._log(`Storage loaded: ${Object.keys(this._storage.getAllBalances()).length} item types`);
    } catch (err) {
      console.error('[ItemVault] Storage init failed:', err);
      BdApi.UI.showToast('ItemVault: Storage failed to initialize', { type: 'error' });
      return;
    }

    try {
      await runMigration(this._storage, (msg) => this._log(msg));
    } catch (err) {
      console.error('[ItemVault] Migration error:', err);
    }

    this._eventAPI = new ItemVaultEventAPI(this._storage, (msg) => this._log(msg));
    this._eventAPI.mount();
    this._eventAPI.broadcastReady();

    // Listen for changes to re-render popup if open
    this._onChanged = () => this._renderPopupContent();
    Events.on('ItemVault:changed', this._onChanged);

    // Start header icon
    this._startHeaderIcon();

    console.log('[ItemVault] Started, toolbar:', !!this._getToolbar(), 'stopped:', this._stopped);
    this._log('ItemVault ready.');
  }

  stop() {
    this._stopped = true;
    this._log('ItemVault stopping...');

    this._stopHeaderIcon();
    this._closePopup();

    if (this._onChanged) {
      Events.off('ItemVault:changed', this._onChanged);
      this._onChanged = null;
    }

    if (this._eventAPI) {
      this._eventAPI.unmount();
      this._eventAPI = null;
    }

    this._storage.close().catch((err) => {
      console.error('[ItemVault] Storage close error:', err);
    });

    BdApi.DOM.removeStyle(STYLE_ID);
    this._log('ItemVault stopped');
  }

  // ─── Header Icon ──────────────────────────────────

  _getToolbar() {
    for (const sel of HEADER_TOOLBAR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  _getIconSVG() {
    // Treasure chest / vault icon
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a4 4 0 0 0-8 0v2"/>
      <circle cx="12" cy="15" r="2"/>
      <line x1="12" y1="17" x2="12" y2="19"/>
    </svg>`;
  }

  _startHeaderIcon() {
    if (this._headerIconLoop) return;
    this._ensureHeaderIcon();
    this._headerIconLoop = setInterval(() => {
      if (this._stopped || document.hidden) return;
      this._ensureHeaderIcon();
    }, 1000);
  }

  _stopHeaderIcon() {
    if (this._headerIconLoop) {
      clearInterval(this._headerIconLoop);
      this._headerIconLoop = null;
    }
    const el = document.getElementById(HEADER_ICON_ID);
    if (el) el.remove();
  }

  _ensureHeaderIcon() {
    const existing = document.getElementById(HEADER_ICON_ID);
    if (existing?.isConnected) return;

    const toolbar = this._getToolbar();
    if (!toolbar) {
      this._log('Header icon: toolbar not found');
      return;
    }
    if (toolbar.querySelector(`#${HEADER_ICON_ID}`)) return;
    this._log('Header icon: injecting into toolbar');

    const btn = document.createElement('div');
    btn.id = HEADER_ICON_ID;
    btn.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      cursor: pointer;
      color: #b5bac1;
      margin: 0 4px;
      transition: color 0.15s ease;
    `;
    btn.title = 'Item Vault';
    btn.innerHTML = this._getIconSVG();

    btn.addEventListener('mouseenter', () => { btn.style.color = '#dcddde'; });
    btn.addEventListener('mouseleave', () => { btn.style.color = '#b5bac1'; });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._togglePopup(btn);
    });

    if (toolbar.firstChild) {
      toolbar.insertBefore(btn, toolbar.firstChild);
    } else {
      toolbar.appendChild(btn);
    }
  }

  // ─── Popup ────────────────────────────────────────

  _togglePopup(anchorEl) {
    const existing = document.getElementById(POPUP_ID);
    if (existing) {
      this._closePopup();
      return;
    }
    this._openPopup(anchorEl);
  }

  _openPopup(anchorEl) {
    this._closePopup();

    const POPUP_WIDTH = 540;
    const popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.style.cssText = `
      position: fixed;
      z-index: 10001;
      width: ${POPUP_WIDTH}px;
      max-height: calc(100vh - 80px);
      overflow-y: auto;
      background: #0a0a0f;
      border: 1px solid rgba(138, 43, 226, 0.4);
      border-radius: 0;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.85), 0 0 30px rgba(138, 43, 226, 0.12);
      padding: 0;
      font-family: var(--font-primary), 'gg sans', sans-serif;
      scrollbar-width: thin;
      scrollbar-color: rgba(138,43,226,0.3) transparent;
    `;
    document.body.appendChild(popup);

    // Position
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const vpW = window.innerWidth;
      let top = rect.bottom + 8;
      let left = rect.right - POPUP_WIDTH;
      if (left < 8) left = 8;
      if (left + POPUP_WIDTH > vpW - 8) left = vpW - POPUP_WIDTH - 8;
      popup.style.top = `${top}px`;
      popup.style.left = `${left}px`;
    }

    this._renderPopupContent();
    this._popupAnchor = anchorEl;

    // Outside click
    this._outsideHandler = (e) => {
      if (!popup.contains(e.target) && !anchorEl?.contains(e.target)) {
        this._closePopup();
      }
    };
    setTimeout(() => document.addEventListener('click', this._outsideHandler, true), 50);

    // ESC
    this._escHandler = (e) => {
      if (e.key === 'Escape') { this._closePopup(); e.stopPropagation(); }
    };
    document.addEventListener('keydown', this._escHandler, true);
  }

  _closePopup() {
    const popup = document.getElementById(POPUP_ID);
    if (popup) popup.remove();
    if (this._outsideHandler) {
      document.removeEventListener('click', this._outsideHandler, true);
      this._outsideHandler = null;
    }
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler, true);
      this._escHandler = null;
    }
  }

  _renderPopupContent() {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;

    const balances = this._storage.getAllBalances();
    const items = getAllItems();
    const totalItems = Object.values(balances).reduce((sum, v) => sum + (v || 0), 0);

    const scrollTop = popup.scrollTop;

    popup.innerHTML = `
      <!-- Header bar -->
      <div style="
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 16px 20px;
        background: linear-gradient(90deg, rgba(138,43,226,0.15) 0%, rgba(10,10,15,0) 100%);
        border-bottom: 1px solid rgba(138,43,226,0.3);
      ">
        <span style="font-size: 24px;">🏛️</span>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #d4b0ff; letter-spacing: 0.04em; text-transform: uppercase;">Item Vault</h3>
          <div style="font-size: 10px; color: #4a3a6a; margin-top: 1px; letter-spacing: 0.03em;">Solo Leveling Inventory</div>
        </div>
        <span style="font-size: 10px; color: #3a2a5a; font-weight: 600;">${PLUGIN_VERSION}</span>
      </div>

      <!-- Stats row -->
      <div style="
        display: flex;
        padding: 12px 20px;
        background: rgba(138,43,226,0.04);
        border-bottom: 1px solid rgba(138,43,226,0.15);
      ">
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 20px; font-weight: 800; color: #b380e0; font-variant-numeric: tabular-nums;">${totalItems.toLocaleString()}</div>
          <div style="font-size: 9px; color: #4a3a6a; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Total</div>
        </div>
        <div style="width: 1px; background: rgba(138,43,226,0.2); margin: 4px 0;"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 20px; font-weight: 800; color: #7c5cbf; font-variant-numeric: tabular-nums;">${items.filter(i => (balances[i.id] || 0) > 0).length}</div>
          <div style="font-size: 9px; color: #4a3a6a; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Held</div>
        </div>
        <div style="width: 1px; background: rgba(138,43,226,0.2); margin: 4px 0;"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 20px; font-weight: 800; color: #5a3f8a; font-variant-numeric: tabular-nums;">${items.length}</div>
          <div style="font-size: 9px; color: #4a3a6a; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Types</div>
        </div>
      </div>

      <!-- Items -->
      <div style="padding: 12px 16px;">
        <div style="font-size: 10px; color: #4a3a6a; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; margin-bottom: 10px; padding-left: 4px;">Inventory</div>
        ${items.filter(i => i.stackable).map(item => {
          const amount = balances[item.id] || 0;
          const rarityColor = this._getRarityColor(item.rarity);
          const hasAny = amount > 0;
          const sourceStr = Array.isArray(item.source) ? item.source.join(', ') : (item.source || '—');
          return `
            <div style="
              display: flex;
              align-items: center;
              gap: 14px;
              padding: 14px 16px;
              margin-bottom: 2px;
              background: ${hasAny ? 'rgba(138,43,226,0.04)' : 'rgba(255,255,255,0.01)'};
              border-left: 3px solid ${rarityColor};
              border-bottom: 1px solid rgba(138,43,226,0.08);
              transition: background 0.12s;
              opacity: ${hasAny ? '1' : '0.45'};
            " onmouseenter="this.style.background='rgba(138,43,226,0.1)'" onmouseleave="this.style.background='${hasAny ? 'rgba(138,43,226,0.04)' : 'rgba(255,255,255,0.01)'}'" >
              <!-- Icon -->
              <div style="
                width: 44px; height: 44px;
                display: flex; align-items: center; justify-content: center;
                background: rgba(138,43,226,0.08);
                border: 1px solid rgba(138,43,226,0.15);
                font-size: 24px;
                flex-shrink: 0;
              ">${item.icon}</div>

              <!-- Info -->
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <span style="font-size: 14px; font-weight: 700; color: #e0d0f0;">${escapeHtml(item.name)}</span>
                  <span style="
                    font-size: 9px;
                    font-weight: 800;
                    color: ${rarityColor};
                    padding: 2px 6px;
                    background: ${rarityColor}15;
                    border: 1px solid ${rarityColor}30;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                  ">${item.rarity}-Rank</span>
                </div>
                <div style="font-size: 11px; color: #6a5a8a; line-height: 1.45;">${escapeHtml(item.description)}</div>
                <div style="font-size: 9px; color: #3a2a5a; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.06em;">Source: ${escapeHtml(sourceStr)}</div>
              </div>

              <!-- Amount -->
              <div style="text-align: right; min-width: 80px; flex-shrink: 0;">
                <div style="
                  font-size: 22px;
                  font-weight: 800;
                  color: ${hasAny ? rarityColor : '#2a1a3a'};
                  font-variant-numeric: tabular-nums;
                  line-height: 1;
                ">${amount.toLocaleString()}</div>
                <div style="font-size: 8px; color: #3a2a5a; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 3px; font-weight: 600;">${escapeHtml(item.category)}</div>
              </div>
            </div>
          `;
        }).join('')}
        ${items.filter(i => i.stackable).length === 0
          ? '<div style="text-align: center; color: #4a3a6a; padding: 30px; font-size: 12px;">No items registered. Enter a dungeon!</div>'
          : ''}
      </div>
    `;

    popup.scrollTop = scrollTop;
  }

  _getRarityColor(rarity) {
    const colors = {
      E: '#9ca3af', D: '#60a5fa', C: '#34d399', B: '#a78bfa',
      A: '#f59e0b', S: '#ef4444', SS: '#ec4899', SSS: '#8b5cf6',
      Monarch: '#fbbf24',
    };
    return colors[rarity] || '#9ca3af';
  }

  // ─── Settings Panel ─────────────────────────────────

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = 'padding: 16px; background: #1e1e2e; color: #e2e2e2; font-family: var(--font-primary), sans-serif;';

    const header = document.createElement('h2');
    header.textContent = `ItemVault v${PLUGIN_VERSION}`;
    header.style.cssText = 'margin: 0 0 16px 0; font-size: 18px; color: #cba6f7;';
    panel.appendChild(header);

    const desc = document.createElement('p');
    desc.textContent = 'Centralized item storage for the Solo Leveling ecosystem. Click the vault icon in the channel header to view your inventory.';
    desc.style.cssText = 'margin: 0 0 16px 0; font-size: 13px; color: #a6adc8;';
    panel.appendChild(desc);

    const debugRow = document.createElement('div');
    debugRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 0;';
    const debugToggle = document.createElement('input');
    debugToggle.type = 'checkbox';
    debugToggle.checked = this._debugMode;
    debugToggle.addEventListener('change', () => {
      this._debugMode = debugToggle.checked;
      BdApi.Data.save('ItemVault', 'debugMode', this._debugMode);
    });
    const debugLabel = document.createElement('span');
    debugLabel.textContent = 'Debug Mode';
    debugLabel.style.cssText = 'font-size: 13px; color: #a6adc8;';
    debugRow.appendChild(debugToggle);
    debugRow.appendChild(debugLabel);
    panel.appendChild(debugRow);

    return panel;
  }

  // ─── Debug Logging ──────────────────────────────────

  _log(...args) {
    if (this._debugMode) {
      console.log('[ItemVault]', ...args);
    }
  }
};
