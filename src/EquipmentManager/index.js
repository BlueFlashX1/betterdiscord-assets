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
const { createToast } = require('../shared/toast');
const { watchToolbar } = require('../shared/header-toolbar');
const _toast = createToast();
const { showToolbarTooltip, hideToolbarTooltip, removeToolbarTooltip, ensureTooltipCSS } = require('../shared/toolbar-tooltip');

const STYLE_ID = 'EquipmentManager-styles';
const HEADER_ICON_ID = 'eq-header-icon';
const POPUP_ID = 'eq-header-popup';

// Discord channel types we DO NOT want to inject our icon into.
// 2 = GUILD_VOICE, 13 = GUILD_STAGE_VOICE.
const HIDDEN_CHANNEL_TYPES = new Set([2, 13]);

// Salvage is irreversible. Rarities at or above B get a confirmation modal;
// E/D/C (ordinary drop spam) salvage on the first click so clearing an
// inventory full of junk isn't one modal per item.
const VALUABLE_RARITIES = new Set(['B', 'A', 'S', 'SS', 'SSS']);

// Resolve the channel currently shown in the URL — independent of any
// VC overlay state. Returns null when ChannelStore isn't available or
// the URL doesn't point at a channel.
function _getUrlChannelType() {
  try {
    const path = String(window.location?.pathname || '');
    const match = path.match(/^\/channels\/(?:@me|\d+)\/(\d+)/);
    if (!match) return null;
    const channel = BdApi?.Webpack?.getStore?.('ChannelStore')?.getChannel?.(match[1]);
    return channel ? Number(channel.type) : null;
  } catch (_) {
    return null;
  }
}

// All visible channel-header sections. Discord renders one for the
// active channel, plus one extra when the VC chat overlay is open
// (the floating chat panel for the connected voice channel). The
// presence of that second header is the unambiguous "VC chat is open"
// signal — far more reliable than guessing channel state from stores.
function _visibleChannelHeaders() {
  return Array.from(
    document.querySelectorAll('section[aria-label="Channel header"]')
  ).filter((el) => el.offsetParent !== null);
}

const { escapeHtml } = require('../shared/escape-html');

module.exports = class EquipmentManager {
  constructor() {
    this.storage = new EquipmentStorage();
    this._userLevel = 1;
    this._cachedBonuses = null;
    this._unwatchToolbar = null;
    this._popupTickLoop = null;
    this._popupDocClick = null;
    this._stopped = true;
    this._ready = false;
    // Tracks the storage version at last popup render; skip re-render when unchanged.
    this._lastPopupVersion = -1;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async start() {
    this._stopped = false;
    BdApi.DOM.addStyle(STYLE_ID, CSS);

    try {
      await this.storage.open();

      // Pull current user level from SoloLevelingStats
      this._syncUserLevel();

      // Compute initial bonus totals
      this.calculateTotalBonuses();

      // Subscribe to boss-kill events and expose the public API
      // Kept inside the try so they only run after storage has successfully opened.
      this._mountEventListeners();
      this._exposePublicAPI();

      // Inject the header icon
      this._startHeaderIcon();

      this._ready = true;

      // Announce readiness so any plugin that loaded BEFORE us (e.g. SoloLevelingStats,
      // which pulls equipment bonuses at its own init) re-reads now. Without this, if
      // load order put us second and the user never changes gear, those plugins would
      // cache zero equipment bonuses for the whole session.
      try { this._emitChanged?.(null, 'startup'); } catch (_) {}
    } catch (err) {
      console.error('[EquipmentManager] Storage init failed:', err);
    }
  }

  stop() {
    this._stopped = true;
    this._ready = false;

    this._unmountEventListeners();
    this._removePublicAPI();

    if (this._unwatchToolbar) {
      try { this._unwatchToolbar(); } catch (_) {}
      this._unwatchToolbar = null;
    }
    if (this._popupTickLoop) {
      clearInterval(this._popupTickLoop);
      this._popupTickLoop = null;
    }

    this._removePopup();
    document.getElementById(HEADER_ICON_ID)?.remove();
    removeToolbarTooltip('sl-toolbar-tip-em');

    BdApi.DOM.removeStyle(STYLE_ID);

    // Fire-and-forget storage close — BD does NOT await stop(), so awaiting here
    // would race with the next instance's start() opening the same IDB database.
    try {
      const closeResult = this.storage?.close?.();
      if (closeResult && typeof closeResult.then === 'function') {
        closeResult.catch((err) => console.error('[EquipmentManager] Storage close error:', err));
      }
    } catch (err) {
      console.error('[EquipmentManager] Storage close error:', err);
    }
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
  //
  // Injection rules (all must hold to inject):
  //   1. URL channel must not be a voice / stage channel.
  //   2. Exactly ONE channel-header section is visible. When the VC chat
  //      overlay is open Discord renders TWO headers — refuse to inject
  //      in that scenario.
  //   3. The icon, if it already exists, must live inside the canonical
  //      header. If it has migrated (Discord re-rendered into the wrong
  //      header), we remove and re-inject in the right place.

  _removeHeaderIcon() {
    const el = document.getElementById(HEADER_ICON_ID);
    if (el) el.remove();
  }

  _startHeaderIcon() {
    if (this._unwatchToolbar) return;
    // Event-driven re-injection via shared/header-toolbar.js. Replaces
    // the prior 2s setInterval self-heal loop. CHANNEL_SELECT +
    // VOICE_STATE_UPDATES + narrow MutationObserver on #app-mount cover
    // every case the poll was guarding against.
    this._unwatchToolbar = watchToolbar(() => {
      if (this._stopped || document.hidden) return;
      this._ensureHeaderIcon();
    });
  }

  _ensureHeaderIcon() {
    // Rule 1 — URL channel type
    const channelType = _getUrlChannelType();
    if (HIDDEN_CHANNEL_TYPES.has(channelType)) {
      this._removeHeaderIcon();
      return;
    }

    // Rule 2 — exactly one channel header
    const headers = _visibleChannelHeaders();
    if (headers.length !== 1) {
      this._removeHeaderIcon();
      return;
    }

    const canonical = headers[0];
    const toolbar = canonical.querySelector('[class*="toolbar_"]');
    if (!toolbar) {
      this._removeHeaderIcon();
      return;
    }

    // Rule 3 — existing icon must be inside the canonical header
    const existing = document.getElementById(HEADER_ICON_ID);
    if (existing?.isConnected) {
      if (canonical.contains(existing)) return;
      existing.remove();
    }
    if (toolbar.querySelector(`#${HEADER_ICON_ID}`)) return;

    const btn = document.createElement('button');
    btn.id = HEADER_ICON_ID;
    btn.className = 'eq-header-btn';
    btn.setAttribute('aria-label', 'Equipment Manager');
    btn.style.cssText = `
      background: none; border: none; padding: 0; margin: 0 4px;
      position: relative; display: flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; cursor: pointer; color: #b5bac1;
      transition: color 0.15s ease;
    `;
    // Sword / star hybrid icon — distinct from ItemVault's lock
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
    </svg>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._togglePopup();
    });
    ensureTooltipCSS();
    btn.addEventListener('mouseenter', () => showToolbarTooltip(btn, 'sl-toolbar-tip-em', 'Equipment Manager'));
    btn.addEventListener('mouseleave', () => hideToolbarTooltip('sl-toolbar-tip-em'));

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
    const popup = document.getElementById(POPUP_ID);
    if (popup && this._popupClickHandler) {
      popup.removeEventListener('click', this._popupClickHandler);
      this._popupClickHandler = null;
    }
    popup?.remove();
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
      width: ${POPUP_WIDTH}px;
      overflow-y: auto;
      background: linear-gradient(165deg, rgba(22,18,32,0.97) 0%, rgba(13,12,20,0.97) 55%, rgba(10,10,16,0.98) 100%);
      border: 1px solid rgba(138,43,226,0.32);
      border-radius: 2px;
      box-shadow: 0 20px 52px rgba(0,0,0,0.85), 0 0 30px rgba(138,43,226,0.18), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(138,43,226,0.06);
      padding: 0;
      scrollbar-width: thin;
      scrollbar-color: rgba(138,43,226,0.85) rgba(8,8,13,0.55);
    `;

    document.body.appendChild(popup);

    // ── Event delegation — wired once on the stable popup element ──────────
    this._popupClickHandler = (e) => {
      const target = e.target.closest('[data-eq-action]');
      if (!target) return;
      const action = target.dataset.eqAction;

      if (action === 'equip') {
        const instanceId = target.dataset.eqInstance;
        if (!instanceId) return;
        // O(1) lookup (2026-07-13) — was materializing the whole inventory
        // into an array + Map just to read one entry.
        const inst = this.storage.getInstance(instanceId);
        if (!inst) return;
        const def = C.getEquipmentById(inst.equipmentId);
        if (!def) return;

        // Rings occupy ring1 or ring2 — prefer empty slot, else ring1
        let targetSlot = def.slot;
        if (targetSlot === 'ring') {
          const equipped = this.storage.getEquipped();
          targetSlot = !equipped.ring1 ? 'ring1' : 'ring2';
        }

        const result = this.equipItem(instanceId, targetSlot);
        if (result?.success) {
          if (result.unequippedInstanceId) {
            const displacedInst = this.storage.getInstance(result.unequippedInstanceId);
            const displacedDef = displacedInst ? C.getEquipmentById(displacedInst.equipmentId) : null;
            _toast(`Equipped ${def.name} (replaced ${displacedDef?.name || 'previous item'})`, 'success');
          } else {
            _toast(`Equipped ${def.name}`, 'success');
          }
        } else {
          _toast(result?.message || 'Cannot equip', 'error');
        }
        this._refreshPopup();
      }

      if (action === 'slot-click') {
        const slot = target.dataset.eqSlot;
        const equipped = this.storage.getEquipped();
        if (!slot || !equipped[slot]) return;
        const prevInstanceId = equipped[slot];
        const result = this.unequipItem(slot);
        if (result?.success) {
          const inst = this.storage.getInstance(prevInstanceId);
          const def = inst ? C.getEquipmentById(inst.equipmentId) : null;
          _toast(`Unequipped ${def?.name || 'item'}`, 'info');
        }
        this._refreshPopup();
      }

      // Salvage — permanently destroys the item. Confirmed for B-rank and
      // above; junk (E/D/C) salvages immediately so clearing drop spam isn't
      // a modal-per-item chore.
      if (action === 'salvage') {
        const instanceId = target.dataset.eqInstance;
        if (!instanceId) return;
        const inst = this.storage.getInstance(instanceId);
        if (!inst) return;
        const def = C.getEquipmentById(inst.equipmentId);
        const name = def?.name || 'this item';
        const rarity = def?.rarity || 'E';

        const doSalvage = () => {
          const result = this.salvageItem(instanceId);
          _toast(result.message, result.success ? 'info' : 'error');
          this._refreshPopup();
        };

        if (VALUABLE_RARITIES.has(rarity)) {
          this._confirmDestructive(
            `Salvage ${name}?`,
            `${name} (${rarity}-Rank) will be permanently destroyed. This cannot be undone.`,
            doSalvage
          );
        } else {
          doSalvage();
        }
      }

      // Bulk salvage of duplicates — always confirmed (it can destroy many
      // items at once), and the confirmation states the exact count.
      if (action === 'salvage-duplicates') {
        const preview = this._countDuplicates();
        if (preview === 0) {
          _toast('No duplicates to salvage.', 'info');
          return;
        }
        this._confirmDestructive(
          `Salvage ${preview} duplicate${preview === 1 ? '' : 's'}?`,
          `One copy of each item is kept (equipped items are never touched). ${preview} item${preview === 1 ? '' : 's'} will be permanently destroyed. This cannot be undone.`,
          () => {
            const result = this.salvageDuplicates();
            _toast(result.message, 'success');
            this._refreshPopup();
          }
        );
      }
    };
    popup.addEventListener('click', this._popupClickHandler);

    this._renderPopupContent(popup);
    this._positionPopup(popup, btn);

    // Close when clicking outside the popup or the anchor button
    this._popupDocClick = (e) => {
      if (!popup.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        this._removePopup();
      }
    };
    document.addEventListener('mousedown', this._popupDocClick, true);

    // Periodic re-render — preserves scroll position.
    // Skip the re-render entirely when storage hasn't changed since last tick.
    this._popupTickLoop = setInterval(() => {
      if (this._stopped) return;
      const p = document.getElementById(POPUP_ID);
      if (!p) {
        clearInterval(this._popupTickLoop);
        this._popupTickLoop = null;
        return;
      }
      // R7(a): skip re-render work while the tab is hidden. Does not
      // self-stop here — popup UI is invisible but should resume ticking
      // immediately when the tab regains visibility, no state accumulates.
      if (document.hidden) return;
      if (this.storage.version === this._lastPopupVersion) return;
      const scrollTop = p.scrollTop;
      this._renderPopupContent(p);
      p.scrollTop = scrollTop;
    }, 2000);
  }

  /**
   * Count unequipped duplicates. Mirrors salvageDuplicates' keep-rule exactly:
   * if a copy of an equipmentId is equipped, every unequipped copy is a
   * duplicate; otherwise one unequipped copy is kept.
   */
  _countDuplicates() {
    const equipped = this.storage.getEquipped();
    const equippedInstanceIds = new Set(Object.values(equipped).filter(Boolean));
    const inventory = this.storage.getInventory();
    const equippedEquipmentIds = new Set(
      inventory.filter((i) => equippedInstanceIds.has(i.instanceId)).map((i) => i.equipmentId)
    );
    const seen = new Set();
    let count = 0;
    for (const inst of inventory) {
      if (equippedInstanceIds.has(inst.instanceId)) continue;
      if (equippedEquipmentIds.has(inst.equipmentId) || seen.has(inst.equipmentId)) count++;
      seen.add(inst.equipmentId);
    }
    return count;
  }

  /**
   * Confirmation modal for irreversible actions. Falls back to executing
   * nothing (safe default) if BdApi's modal API is unavailable — a destructive
   * action must never proceed just because the confirm UI failed to render.
   */
  _confirmDestructive(title, body, onConfirm) {
    try {
      if (typeof BdApi.UI?.showConfirmationModal === 'function') {
        BdApi.UI.showConfirmationModal(title, body, {
          danger: true,
          confirmText: 'Salvage',
          cancelText: 'Cancel',
          onConfirm,
        });
        return;
      }
    } catch (err) {
      console.error('[EquipmentManager] Confirmation modal failed:', err);
    }
    _toast('Cannot show confirmation dialog — salvage aborted.', 'error');
  }

  _positionPopup(popup, btn) {
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 12;
    const POPUP_WIDTH = 560;
    let left = rect.right - POPUP_WIDTH;
    left = Math.max(margin, Math.min(left, vw - POPUP_WIDTH - margin));
    popup.style.left = `${left}px`;
    const top = rect.bottom + 8;
    popup.style.top = `${top}px`;
    // Height must be derived from where the popup ACTUALLY starts. The old
    // static `max-height: calc(100vh - 80px)` assumed a ~64px top; whenever
    // the header icon sat lower, the panel ran past the viewport bottom and
    // the last inventory rows became unreachable (no scroll left to give).
    popup.style.maxHeight = `${Math.max(200, window.innerHeight - top - margin)}px`;
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

    // PERF (2026-07-13): the bonus helpers now resolve instances O(1) through
    // storage's Map, so the popup no longer materializes the entire inventory
    // into an array+Map on every render/2s tick just to feed them.
    const equipped = this.storage.getEquipped();
    const inventory = this.storage.getInventory();
    const bonuses = this._cachedBonuses || this.calculateTotalBonuses();
    const sets = this.getActiveSetBonuses();

    // Mark storage version as rendered so the tick loop can skip unchanged ticks.
    this._lastPopupVersion = this.storage.version;

    // ── Equipment slot grid (2 rows × 5 cols) ─────────────────────────────
    const slotOrder = [
      'weapon', 'offHand', 'helmet', 'chestplate', 'gloves',
      'boots', 'earring', 'necklace', 'ring1', 'ring2',
    ];

    let slotsHtml = '';
    for (const slotKey of slotOrder) {
      const slotDef = C.EQUIPMENT_SLOTS[slotKey];
      const instanceId = equipped[slotKey];
      const instance = instanceId ? this.storage.getInstance(instanceId) : null;
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
          <div style="font-size: 9px; color: ${def ? rarityColor : '#b5bac1'}; font-weight: 700; text-align: center; max-width: 88px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
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
          <div style="padding: 8px 20px; border-bottom: 1px solid rgba(138,43,226,0.1); font-size: 12px; color: #8a2be2;">
            &#9656; ${escapeHtml(s.name)} (${s.equipped}/${s.total}) — ${bonusStr}
          </div>
        `;
      }).join('');
    }

    // ── Inventory list (unequipped items only) ─────────────────────────────
    const equippedInstanceIds = new Set(Object.values(equipped).filter(Boolean));
    const unequipped = inventory.filter(i => !equippedInstanceIds.has(i.instanceId));

    // Sort for scannability (2026-07-30): equippable-now first (level-locked
    // items sink to the bottom where they can't be acted on anyway), then
    // grouped by slot in the same order as the equipped grid above, then
    // strongest rarity first, then highest level requirement. Turns a random
    // drop-order pile into "here are your weapons, best first".
    const invSlotOrder = Object.keys(C.EQUIPMENT_SLOTS);
    const slotRank = (slot) => {
      const i = invSlotOrder.indexOf(slot === 'ring' ? 'ring1' : slot);
      return i === -1 ? invSlotOrder.length : i;
    };
    const rarityRank = (rarity) => {
      const i = C.RARITY_ORDER.indexOf(rarity);
      return i === -1 ? -1 : i;
    };
    unequipped.sort((a, b) => {
      const da = C.getEquipmentById(a.equipmentId);
      const db = C.getEquipmentById(b.equipmentId);
      if (!da || !db) return da ? -1 : db ? 1 : 0;
      const ea = this.canEquip(da.id).canEquip ? 0 : 1;
      const eb = this.canEquip(db.id).canEquip ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const sa = slotRank(da.slot);
      const sb = slotRank(db.slot);
      if (sa !== sb) return sa - sb;
      const ra = rarityRank(da.rarity);
      const rb = rarityRank(db.rarity);
      if (ra !== rb) return rb - ra;
      return (db.levelReq || db.levelRequirement || 0) - (da.levelReq || da.levelRequirement || 0);
    });

    // Duplicate count drives the bulk-salvage button. Single source of truth
    // shared with the click handler's confirmation copy.
    const duplicateCount = this._countDuplicates();

    let inventoryHtml = '';
    if (unequipped.length === 0) {
      inventoryHtml = `<div style="text-align: center; color: #b5bac1; padding: 20px; font-size: 11px;">
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
        const btnColor = canEquipResult.canEquip ? '#8a2be2' : '#b5bac1';
        const btnBorder = canEquipResult.canEquip
          ? 'rgba(138,43,226,0.3)'
          : 'rgba(255,255,255,0.05)';
        const btnCursor = canEquipResult.canEquip ? 'pointer' : 'not-allowed';

        return `
          <div style="display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid rgba(138,43,226,0.06); border-left: 3px solid ${rc};">
            <div style="font-size: 20px; width: 36px; text-align: center;">${def.icon}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 700; color: #dcddde;">
                ${escapeHtml(def.name)}
                <span style="font-size: 9px; font-weight: 800; color: ${rc}; margin-left: 6px;">${def.rarity}-Rank</span>
              </div>
              <div style="font-size: 10px; color: #b5bac1; margin-top: 2px;">${mainStat}</div>
              <div style="font-size: 9px; color: #b5bac1; margin-top: 1px;">Lv.${levelReq} req &middot; ${escapeHtml(def.slot)}</div>
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
            <button data-eq-action="salvage" data-eq-instance="${inst.instanceId}" title="Salvage (destroy) this item" style="
              padding: 4px 10px; font-size: 10px; font-weight: 800;
              background: rgba(239,68,68,0.08);
              color: #ef4444;
              border: 1px solid rgba(239,68,68,0.25);
              cursor: pointer;
              text-transform: uppercase; letter-spacing: 0.06em;
              font-family: inherit;
              border-radius: 0;
            ">Salvage</button>
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
          <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #dcddde; letter-spacing: 0.04em; text-transform: uppercase;">Equipment</h3>
          <div style="font-size: 10px; color: #b5bac1; letter-spacing: 0.03em;">Solo Leveling Armory</div>
        </div>
        <span style="font-size: 10px; color: #b5bac1; font-weight: 600;">${PLUGIN_VERSION}</span>
      </div>

      <!-- Stats summary row -->
      <div style="display: flex; padding: 10px 20px; background: rgba(138,43,226,0.04); border-bottom: 1px solid rgba(138,43,226,0.15);">
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 18px; font-weight: 800; color: #ef4444; font-variant-numeric: tabular-nums;">${bonuses.attack || 0}</div>
          <div style="font-size: 9px; color: #b5bac1; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">ATK</div>
        </div>
        <div style="width: 1px; background: rgba(138,43,226,0.2); margin: 4px 0;"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 18px; font-weight: 800; color: #60a5fa; font-variant-numeric: tabular-nums;">${bonuses.defense || 0}</div>
          <div style="font-size: 9px; color: #b5bac1; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">DEF</div>
        </div>
        <div style="width: 1px; background: rgba(138,43,226,0.2); margin: 4px 0;"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 18px; font-weight: 800; color: #8a2be2; font-variant-numeric: tabular-nums;">${sets.length}</div>
          <div style="font-size: 9px; color: #b5bac1; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Sets</div>
        </div>
        <div style="width: 1px; background: rgba(138,43,226,0.2); margin: 4px 0;"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 18px; font-weight: 800; color: #34d399; font-variant-numeric: tabular-nums;">${inventory.length}</div>
          <div style="font-size: 9px; color: #b5bac1; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Items</div>
        </div>
      </div>

      <!-- Equipment slot grid -->
      <div style="padding: 12px 16px;">
        <div style="font-size: 10px; color: #b5bac1; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; margin-bottom: 8px; padding-left: 4px;">Equipped</div>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;">
          ${slotsHtml}
        </div>
      </div>

      <!-- Set bonuses -->
      ${setsHtml}

      <!-- Inventory -->
      <div style="padding: 8px 0 0 0;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding: 0 20px;">
          <div style="font-size: 10px; color: #b5bac1; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;">Inventory (${unequipped.length})</div>
          ${duplicateCount > 0 ? `
            <button data-eq-action="salvage-duplicates" title="Salvage every duplicate, keeping one copy of each item" style="
              padding: 3px 10px; font-size: 9px; font-weight: 800;
              background: rgba(239,68,68,0.08);
              color: #ef4444;
              border: 1px solid rgba(239,68,68,0.25);
              cursor: pointer;
              text-transform: uppercase; letter-spacing: 0.06em;
              font-family: inherit;
              border-radius: 0;
            ">Salvage ${duplicateCount} Duplicate${duplicateCount === 1 ? '' : 's'}</button>
          ` : ''}
        </div>
        ${inventoryHtml}
      </div>
    `;
  }

  // ─── Settings Panel ──────────────────────────────────────────────────────────

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = 'padding: 16px; background: rgba(10, 10, 16, 0.98); color: #dcddde;';
    panel.innerHTML = `
      <div style="font-size: 14px; font-weight: 700; color: #dcddde; margin-bottom: 8px;">EquipmentManager v${PLUGIN_VERSION}</div>
      <div style="font-size: 12px; color: #b5bac1; line-height: 1.5;">
        Equipment drops from dungeon boss kills. Open the armory from the channel header icon (&#11088;).
      </div>
    `;
    return panel;
  }
};

// Mix in logic modules after class definition
const EquipmentManagerClass = module.exports;
Object.assign(EquipmentManagerClass.prototype, equipmentLogic, dropSystem, eventAPI);
