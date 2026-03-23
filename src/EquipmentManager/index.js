/**
 * EquipmentManager — Solo Leveling equipment system.
 *
 * Boss drop integration, 10 equipment slots, set bonuses, and stat integration.
 * Channel header icon opens the armory popup.
 * Other plugins read bonuses via window.EquipmentManager or the SL event bus.
 */

const { EquipmentStorage } = require('./storage');
const C = require('./constants');
const equipmentLogic = require('./equipment-logic');
const dropSystem = require('./drop-system');
const eventAPI = require('./event-api');
const CSS = require('./styles.css');
const { version: PLUGIN_VERSION } = require('./manifest.json');

const STYLE_ID = 'EquipmentManager-styles';
const HEADER_ICON_ID = 'eq-header-icon';
const POPUP_ID = 'eq-header-popup';

const HEADER_TOOLBAR_SELECTORS = [
  '[aria-label="Channel header"] [class*="toolbar_"]',
  '[class*="titleWrapper_"] [class*="toolbar_"]',
  'header [class*="toolbar_"]',
];

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = class EquipmentManager {
  constructor() {
    this.storage = new EquipmentStorage();
    this._userLevel = 1;
    this._cachedBonuses = null;
    this._headerIconLoop = null;
    this._popupTickLoop = null;
    this._popupDocClick = null;
    this._stopped = true;
    this._ready = false;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async start() {
    this._stopped = false;
    BdApi.DOM.addStyle(STYLE_ID, CSS);

    try {
      await this.storage.open();
    } catch (err) {
      console.error('[EquipmentManager] Storage init failed:', err);
      return;
    }

    // Pull current user level from SoloLevelingStats
    this._syncUserLevel();

    // Compute initial bonus totals
    this.calculateTotalBonuses();

    // Subscribe to boss-kill events and expose the public API
    this._mountEventListeners();
    this._exposePublicAPI();

    // Inject the header icon
    this._startHeaderIcon();

    this._ready = true;
  }

  stop() {
    this._stopped = true;
    this._ready = false;

    this._unmountEventListeners();
    this._removePublicAPI();

    if (this._headerIconLoop) {
      clearInterval(this._headerIconLoop);
      this._headerIconLoop = null;
    }
    if (this._popupTickLoop) {
      clearInterval(this._popupTickLoop);
      this._popupTickLoop = null;
    }

    this._removePopup();
    document.getElementById(HEADER_ICON_ID)?.remove();

    BdApi.DOM.removeStyle(STYLE_ID);

    // storage.close() is async; fire-and-forget on plugin stop
    this.storage.close().catch((err) => {
      console.error('[EquipmentManager] Storage close error:', err);
    });
  }

  // ─── SoloLevelingStats integration ──────────────────────────────────────────

  _syncUserLevel() {
    try {
      const sls = BdApi.Plugins.get('SoloLevelingStats')?.instance;
      this._userLevel = sls?.settings?.level || sls?.level || 1;
    } catch (_) {
      this._userLevel = 1;
    }
  }

  // ─── Header Icon ────────────────────────────────────────────────────────────

  _getToolbar() {
    for (const sel of HEADER_TOOLBAR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  _startHeaderIcon() {
    this._ensureHeaderIcon();
    this._headerIconLoop = setInterval(() => {
      if (this._stopped || document.hidden) return;
      this._ensureHeaderIcon();
    }, 2000);
  }

  _ensureHeaderIcon() {
    // Don't re-inject if already present and connected
    const existing = document.getElementById(HEADER_ICON_ID);
    if (existing?.isConnected) return;

    const toolbar = this._getToolbar();
    if (!toolbar) return;
    if (toolbar.querySelector(`#${HEADER_ICON_ID}`)) return;

    const btn = document.createElement('button');
    btn.id = HEADER_ICON_ID;
    btn.className = 'eq-header-btn';
    btn.setAttribute('aria-label', 'Equipment Manager');
    btn.title = 'Equipment Manager';
    // Sword / star hybrid icon — distinct from ItemVault's lock
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
    </svg>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._togglePopup();
    });

    toolbar.insertBefore(btn, toolbar.firstChild);
  }

  // ─── Popup ──────────────────────────────────────────────────────────────────

  _togglePopup() {
    if (document.getElementById(POPUP_ID)) {
      this._removePopup();
    } else {
      this._showPopup();
    }
  }

  _removePopup() {
    if (this._popupTickLoop) {
      clearInterval(this._popupTickLoop);
      this._popupTickLoop = null;
    }
    if (this._popupDocClick) {
      document.removeEventListener('mousedown', this._popupDocClick, true);
      this._popupDocClick = null;
    }
    document.getElementById(POPUP_ID)?.remove();
  }

  _showPopup() {
    this._removePopup();
    this._syncUserLevel();

    const btn = document.getElementById(HEADER_ICON_ID);
    if (!btn) return;

    const POPUP_WIDTH = 560;
    const popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.style.cssText = `
      position: fixed; z-index: 10001;
      width: ${POPUP_WIDTH}px; max-height: calc(100vh - 80px);
      overflow-y: auto;
      background: #0a0a0f;
      border: 1px solid rgba(138,43,226,0.4);
      border-radius: 0;
      box-shadow: 0 12px 48px rgba(0,0,0,0.85), 0 0 30px rgba(138,43,226,0.12);
      padding: 0;
      font-family: 'Friend or Foe BB', var(--font-primary), sans-serif;
      scrollbar-width: thin;
      scrollbar-color: rgba(138,43,226,0.3) transparent;
    `;

    document.body.appendChild(popup);
    this._renderPopupContent(popup);
    this._positionPopup(popup, btn);

    // Close when clicking outside the popup or the anchor button
    this._popupDocClick = (e) => {
      if (!popup.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        this._removePopup();
      }
    };
    document.addEventListener('mousedown', this._popupDocClick, true);

    // Periodic re-render — preserves scroll position
    this._popupTickLoop = setInterval(() => {
      if (this._stopped) return;
      const p = document.getElementById(POPUP_ID);
      if (!p) {
        clearInterval(this._popupTickLoop);
        this._popupTickLoop = null;
        return;
      }
      const scrollTop = p.scrollTop;
      this._renderPopupContent(p);
      p.scrollTop = scrollTop;
    }, 2000);
  }

  _positionPopup(popup, btn) {
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 12;
    const POPUP_WIDTH = 560;
    let left = rect.right - POPUP_WIDTH;
    left = Math.max(margin, Math.min(left, vw - POPUP_WIDTH - margin));
    popup.style.left = `${left}px`;
    popup.style.top = `${rect.bottom + 8}px`;
  }

  _refreshPopup() {
    const p = document.getElementById(POPUP_ID);
    if (!p) return;
    const scrollTop = p.scrollTop;
    this._renderPopupContent(p);
    p.scrollTop = scrollTop;
  }

  _renderPopupContent(popup) {
    if (!popup) popup = document.getElementById(POPUP_ID);
    if (!popup) return;

    const equipped = this.storage.getEquipped();
    const inventory = this.storage.getInventory();
    const instanceMap = new Map(inventory.map(i => [i.instanceId, i]));
    const bonuses = this._cachedBonuses || this.calculateTotalBonuses();
    const sets = this.getActiveSetBonuses();

    // ── Equipment slot grid (2 rows × 5 cols) ─────────────────────────────
    const slotOrder = [
      'weapon', 'offHand', 'helmet', 'chestplate', 'gloves',
      'boots', 'earring', 'necklace', 'ring1', 'ring2',
    ];

    let slotsHtml = '';
    for (const slotKey of slotOrder) {
      const slotDef = C.EQUIPMENT_SLOTS[slotKey];
      const instanceId = equipped[slotKey];
      const instance = instanceId ? instanceMap.get(instanceId) : null;
      const def = instance ? C.getEquipmentById(instance.equipmentId) : null;
      const rarityColor = def ? C.getRarityColor(def.rarity) : '#2a1a3a';
      const isEmpty = !def;
      const bgEmpty = 'rgba(138,43,226,0.03)';
      const bgFilled = 'rgba(138,43,226,0.08)';
      const bgHover = 'rgba(138,43,226,0.12)';
      const borderColor = isEmpty ? 'rgba(138,43,226,0.1)' : `${rarityColor}60`;

      slotsHtml += `
        <div data-eq-action="slot-click" data-eq-slot="${slotKey}" style="
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          width: 96px; height: 96px;
          background: ${isEmpty ? bgEmpty : bgFilled};
          border: 1px solid ${borderColor};
          cursor: pointer;
          transition: background 0.12s;
        " onmouseenter="this.style.background='${bgHover}'" onmouseleave="this.style.background='${isEmpty ? bgEmpty : bgFilled}'">
          <div style="font-size: 22px; margin-bottom: 2px;">${def?.icon || slotDef?.icon || '◻️'}</div>
          <div style="font-size: 9px; color: ${def ? rarityColor : '#4a3a6a'}; font-weight: 700; text-align: center; max-width: 88px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${def ? escapeHtml(def.name) : escapeHtml(slotDef?.label || slotKey)}
          </div>
          ${def ? `<div style="font-size: 8px; color: ${rarityColor}; font-weight: 800; margin-top: 1px;">${def.rarity}-Rank</div>` : ''}
        </div>
      `;
    }

    // ── Active set bonuses ─────────────────────────────────────────────────
    let setsHtml = '';
    if (sets.length > 0) {
      setsHtml = sets.map(s => {
        const bonusStr = Object.entries(s.activeBonus || {})
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `+${v} ${k.toUpperCase().slice(0, 3)}`)
          .join(', ') || 'Bonus';
        return `
          <div style="padding: 8px 20px; border-bottom: 1px solid rgba(138,43,226,0.1); font-size: 12px; color: #b380e0;">
            &#9656; ${escapeHtml(s.name)} (${s.equipped}/${s.total}) — ${bonusStr}
          </div>
        `;
      }).join('');
    }

    // ── Inventory list (unequipped items only) ─────────────────────────────
    const equippedInstanceIds = new Set(Object.values(equipped).filter(Boolean));
    const unequipped = inventory.filter(i => !equippedInstanceIds.has(i.instanceId));

    let inventoryHtml = '';
    if (unequipped.length === 0) {
      inventoryHtml = `<div style="text-align: center; color: #4a3a6a; padding: 20px; font-size: 11px;">
        No items in inventory. Defeat dungeon bosses for equipment drops!
      </div>`;
    } else {
      inventoryHtml = unequipped.map(inst => {
        const def = C.getEquipmentById(inst.equipmentId);
        if (!def) return '';
        const rc = C.getRarityColor(def.rarity);
        const canEquipResult = this.canEquip(def.id);
        const mainStat = Object.entries(def.stats || {})
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `+${v} ${k.toUpperCase().slice(0, 3)}`)
          .join(', ') || '—';
        const levelReq = def.levelReq || def.levelRequirement || 0;
        const btnBg = canEquipResult.canEquip
          ? 'rgba(138,43,226,0.2)'
          : 'rgba(255,255,255,0.03)';
        const btnColor = canEquipResult.canEquip ? '#b380e0' : '#3a2a5a';
        const btnBorder = canEquipResult.canEquip
          ? 'rgba(138,43,226,0.3)'
          : 'rgba(255,255,255,0.05)';
        const btnCursor = canEquipResult.canEquip ? 'pointer' : 'not-allowed';

        return `
          <div style="display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid rgba(138,43,226,0.06); border-left: 3px solid ${rc};">
            <div style="font-size: 20px; width: 36px; text-align: center;">${def.icon}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 700; color: #e0d0f0;">
                ${escapeHtml(def.name)}
                <span style="font-size: 9px; font-weight: 800; color: ${rc}; margin-left: 6px;">${def.rarity}-Rank</span>
              </div>
              <div style="font-size: 10px; color: #6a5a8a; margin-top: 2px;">${mainStat}</div>
              <div style="font-size: 9px; color: #3a2a5a; margin-top: 1px;">Lv.${levelReq} req &middot; ${escapeHtml(def.slot)}</div>
            </div>
            <button data-eq-action="equip" data-eq-instance="${inst.instanceId}" style="
              padding: 4px 12px; font-size: 10px; font-weight: 800;
              background: ${btnBg};
              color: ${btnColor};
              border: 1px solid ${btnBorder};
              cursor: ${btnCursor};
              text-transform: uppercase; letter-spacing: 0.06em;
              font-family: inherit;
              border-radius: 0;
            ">${canEquipResult.canEquip ? 'Equip' : `Lv.${levelReq}`}</button>
          </div>
        `;
      }).join('');
    }

    // ── Full popup HTML ────────────────────────────────────────────────────
    popup.innerHTML = `
      <!-- Header -->
      <div style="display: flex; align-items: center; gap: 10px; padding: 16px 20px; background: linear-gradient(90deg, rgba(138,43,226,0.15) 0%, rgba(10,10,15,0) 100%); border-bottom: 1px solid rgba(138,43,226,0.3);">
        <span style="font-size: 22px;">&#9876;&#65039;</span>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #d4b0ff; letter-spacing: 0.04em; text-transform: uppercase;">Equipment</h3>
          <div style="font-size: 10px; color: #4a3a6a; letter-spacing: 0.03em;">Solo Leveling Armory</div>
        </div>
        <span style="font-size: 10px; color: #3a2a5a; font-weight: 600;">${PLUGIN_VERSION}</span>
      </div>

      <!-- Stats summary row -->
      <div style="display: flex; padding: 10px 20px; background: rgba(138,43,226,0.04); border-bottom: 1px solid rgba(138,43,226,0.15);">
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 18px; font-weight: 800; color: #ef4444; font-variant-numeric: tabular-nums;">${bonuses.attack || 0}</div>
          <div style="font-size: 9px; color: #4a3a6a; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">ATK</div>
        </div>
        <div style="width: 1px; background: rgba(138,43,226,0.2); margin: 4px 0;"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 18px; font-weight: 800; color: #60a5fa; font-variant-numeric: tabular-nums;">${bonuses.defense || 0}</div>
          <div style="font-size: 9px; color: #4a3a6a; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">DEF</div>
        </div>
        <div style="width: 1px; background: rgba(138,43,226,0.2); margin: 4px 0;"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 18px; font-weight: 800; color: #a78bfa; font-variant-numeric: tabular-nums;">${sets.length}</div>
          <div style="font-size: 9px; color: #4a3a6a; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Sets</div>
        </div>
        <div style="width: 1px; background: rgba(138,43,226,0.2); margin: 4px 0;"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 18px; font-weight: 800; color: #34d399; font-variant-numeric: tabular-nums;">${inventory.length}</div>
          <div style="font-size: 9px; color: #4a3a6a; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Items</div>
        </div>
      </div>

      <!-- Equipment slot grid -->
      <div style="padding: 12px 16px;">
        <div style="font-size: 10px; color: #4a3a6a; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; margin-bottom: 8px; padding-left: 4px;">Equipped</div>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;">
          ${slotsHtml}
        </div>
      </div>

      <!-- Set bonuses -->
      ${setsHtml}

      <!-- Inventory -->
      <div style="padding: 8px 0 0 0;">
        <div style="font-size: 10px; color: #4a3a6a; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; margin-bottom: 6px; padding: 0 20px;">Inventory (${unequipped.length})</div>
        ${inventoryHtml}
      </div>
    `;

    // ── Event delegation ───────────────────────────────────────────────────
    popup.addEventListener('click', (e) => {
      const target = e.target.closest('[data-eq-action]');
      if (!target) return;
      const action = target.dataset.eqAction;

      if (action === 'equip') {
        const instanceId = target.dataset.eqInstance;
        if (!instanceId) return;
        const inst = instanceMap.get(instanceId);
        if (!inst) return;
        const def = C.getEquipmentById(inst.equipmentId);
        if (!def) return;

        // Rings occupy ring1 or ring2 — prefer empty slot, else ring1
        let targetSlot = def.slot;
        if (targetSlot === 'ring') {
          targetSlot = !equipped.ring1 ? 'ring1' : 'ring2';
        }

        const result = this.equipItem(instanceId, targetSlot);
        if (result?.success) {
          BdApi.UI.showToast(`Equipped ${def.name}`, { type: 'success' });
        } else {
          BdApi.UI.showToast(result?.message || 'Cannot equip', { type: 'error' });
        }
        this._refreshPopup();
      }

      if (action === 'slot-click') {
        const slot = target.dataset.eqSlot;
        if (!slot || !equipped[slot]) return;
        const prevInstanceId = equipped[slot];
        const result = this.unequipItem(slot);
        if (result?.success) {
          const inst = instanceMap.get(prevInstanceId);
          const def = inst ? C.getEquipmentById(inst.equipmentId) : null;
          BdApi.UI.showToast(`Unequipped ${def?.name || 'item'}`, { type: 'info' });
        }
        this._refreshPopup();
      }
    });
  }

  // ─── Settings Panel ──────────────────────────────────────────────────────────

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = 'padding: 16px; background: #1e1e2e; color: #cdd6f4;';
    panel.innerHTML = `
      <div style="font-size: 14px; font-weight: 700; color: #d4b0ff; margin-bottom: 8px;">EquipmentManager v${PLUGIN_VERSION}</div>
      <div style="font-size: 12px; color: #6c7086; line-height: 1.5;">
        Equipment drops from dungeon boss kills. Open the armory from the channel header icon (&#11088;).
      </div>
    `;
    return panel;
  }
};

// Mix in logic modules after class definition
const EquipmentManagerClass = module.exports;
Object.assign(EquipmentManagerClass.prototype, equipmentLogic, dropSystem, eventAPI);
