const { getNavigationUtils } = require('../shared/navigation');

const HEADER_WIDGET_ID = 'dungeons-header-widget';
const HEADER_POPUP_ID = 'dungeons-header-popup';
const HEADER_TOOLBAR_SELECTORS = [
  '[aria-label="Channel header"] [class*="toolbar_"]',
  '[class*="titleWrapper_"] [class*="toolbar_"]',
  'header [class*="toolbar_"]',
];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  startDungeonHeaderWidget() {
    if (this._dungeonHeaderWidgetLoop) return;

    const tick = () => {
      if (!this.started) return;
      this.ensureDungeonHeaderWidget();
      if (this._dungeonHeaderPopup?.isConnected) {
        this.renderDungeonHeaderPopup();
        this.queueDungeonHeaderPopupPosition();
      } else {
        this._updateDungeonHeaderWidgetBadge();
      }
    };

    this.ensureDungeonHeaderWidget();
    this._dungeonHeaderWidgetLoop = setInterval(tick, 1500);
    this._intervals.add(this._dungeonHeaderWidgetLoop);
  },

  stopDungeonHeaderWidget() {
    if (this._dungeonHeaderWidgetLoop) {
      clearInterval(this._dungeonHeaderWidgetLoop);
      this._intervals.delete(this._dungeonHeaderWidgetLoop);
      this._dungeonHeaderWidgetLoop = null;
    }

    this.closeDungeonHeaderPopup();

    if (this._dungeonHeaderWidgetButton?.isConnected) {
      this._dungeonHeaderWidgetButton.remove();
    }
    this._dungeonHeaderWidgetButton = null;
  },

  _getChannelHeaderToolbarForDungeonWidget() {
    for (const selector of HEADER_TOOLBAR_SELECTORS) {
      const toolbar = document.querySelector(selector);
      if (toolbar && toolbar.offsetParent !== null) return toolbar;
    }
    return null;
  },

  _isDungeonWidgetContextAllowed() {
    const channelInfo = this.getChannelInfo?.();
    return Boolean(channelInfo && channelInfo.guildId && channelInfo.guildId !== 'DM');
  },

  _getActiveDungeonsForWidget() {
    if (!this.activeDungeons || this.activeDungeons.size === 0) return [];

    const rankOrder = this.settings?.dungeonRanks || [];
    const rankIndex = (rank) => Math.max(0, rankOrder.indexOf(rank));

    return Array.from(this.activeDungeons.entries())
      .filter(([, dungeon]) => (
        dungeon &&
        !dungeon.completed &&
        !dungeon.failed &&
        !dungeon._completing &&
        (Number(dungeon?.boss?.hp) || 0) > 0
      ))
      .sort((a, b) => {
        const aRank = rankIndex(a[1]?.rank);
        const bRank = rankIndex(b[1]?.rank);
        if (aRank !== bRank) return bRank - aRank;
        return (Number(b[1]?.startTime) || 0) - (Number(a[1]?.startTime) || 0);
      });
  },

  _createDungeonHeaderWidgetButton() {
    if (this._dungeonHeaderWidgetButton?.isConnected) return this._dungeonHeaderWidgetButton;

    const button = document.createElement('button');
    button.id = HEADER_WIDGET_ID;
    button.className = 'dungeons-header-widget';
    button.type = 'button';
    button.setAttribute('aria-label', 'Active Dungeons');
    button.innerHTML = `
      <span class="dungeons-header-widget-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor" d="M4.5 20A1.5 1.5 0 0 1 3 18.5V8a1 1 0 0 1 .293-.707l4-4A1 1 0 0 1 8 3h8a1 1 0 0 1 .707.293l4 4A1 1 0 0 1 21 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-15Zm.5-2h14v-9.5L15.586 5H8.414L5 8.5V18Zm4-7h6a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2Zm0 3h6a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2Z"/>
        </svg>
      </span>
      <span class="dungeons-header-widget-count" aria-hidden="true"></span>
    `;

    this._dungeonHeaderWidgetButton = button;
    return button;
  },

  ensureDungeonHeaderWidget() {
    const activeDungeons = this._getActiveDungeonsForWidget();
    const hasActiveDungeons = activeDungeons.length > 0;
    const contextAllowed = this._isDungeonWidgetContextAllowed();
    const toolbar = this._getChannelHeaderToolbarForDungeonWidget();

    if (!hasActiveDungeons || !contextAllowed || !toolbar) {
      if (this._dungeonHeaderWidgetButton?.isConnected) {
        this._dungeonHeaderWidgetButton.remove();
      }
      this.closeDungeonHeaderPopup();
      return false;
    }

    const button = this._createDungeonHeaderWidgetButton();
    if (button.parentElement !== toolbar) {
      toolbar.appendChild(button);
    }

    this._updateDungeonHeaderWidgetBadge(activeDungeons.length);
    return true;
  },

  _updateDungeonHeaderWidgetBadge(forcedCount = null) {
    const button = this._dungeonHeaderWidgetButton;
    if (!button) return;

    const activeCount = Number.isFinite(forcedCount)
      ? forcedCount
      : this._getActiveDungeonsForWidget().length;
    const badge = button.querySelector('.dungeons-header-widget-count');

    if (badge) {
      if (activeCount > 0) {
        badge.textContent = String(Math.min(activeCount, 99));
        badge.classList.add('is-visible');
      } else {
        badge.textContent = '';
        badge.classList.remove('is-visible');
      }
    }

    button.title = activeCount > 0
      ? `Active Dungeons (${activeCount})`
      : 'Active Dungeons';
  },

  toggleDungeonHeaderPopup() {
    if (this._dungeonHeaderPopup?.isConnected) {
      this.closeDungeonHeaderPopup();
    } else {
      this.openDungeonHeaderPopup();
    }
  },

  openDungeonHeaderPopup() {
    if (this._dungeonHeaderPopup?.isConnected) return;
    if (!this.ensureDungeonHeaderWidget()) return;
    if (!this._dungeonHeaderWidgetButton?.isConnected) return;

    const popup = document.createElement('div');
    popup.id = HEADER_POPUP_ID;
    popup.className = 'dungeons-header-popup';
    document.body.appendChild(popup);
    this._dungeonHeaderPopup = popup;

    this.renderDungeonHeaderPopup();

    this._dungeonHeaderPopupDocClickHandler = (event) => {
      const target = event.target;
      if (!target) return;
      const clickedPopup = this._dungeonHeaderPopup?.contains?.(target);
      const clickedButton = this._dungeonHeaderWidgetButton?.contains?.(target);
      if (!clickedPopup && !clickedButton) {
        this.closeDungeonHeaderPopup();
      }
    };
    this._dungeonHeaderPopupResizeHandler = () => this.queueDungeonHeaderPopupPosition();
    this._dungeonHeaderPopupScrollHandler = () => this.queueDungeonHeaderPopupPosition();

    document.addEventListener('mousedown', this._dungeonHeaderPopupDocClickHandler, true);
    window.addEventListener('resize', this._dungeonHeaderPopupResizeHandler);
    window.addEventListener('scroll', this._dungeonHeaderPopupScrollHandler, true);
  },

  closeDungeonHeaderPopup() {
    if (this._dungeonHeaderPopupPositionRaf) {
      cancelAnimationFrame(this._dungeonHeaderPopupPositionRaf);
      this._dungeonHeaderPopupPositionRaf = null;
    }
    if (this._dungeonHeaderPopupDocClickHandler) {
      document.removeEventListener('mousedown', this._dungeonHeaderPopupDocClickHandler, true);
      this._dungeonHeaderPopupDocClickHandler = null;
    }
    if (this._dungeonHeaderPopupResizeHandler) {
      window.removeEventListener('resize', this._dungeonHeaderPopupResizeHandler);
      this._dungeonHeaderPopupResizeHandler = null;
    }
    if (this._dungeonHeaderPopupScrollHandler) {
      window.removeEventListener('scroll', this._dungeonHeaderPopupScrollHandler, true);
      this._dungeonHeaderPopupScrollHandler = null;
    }
    if (this._dungeonHeaderPopup?.isConnected) {
      this._dungeonHeaderPopup.remove();
    }
    this._dungeonHeaderPopup = null;
  },

  queueDungeonHeaderPopupPosition() {
    if (this._dungeonHeaderPopupPositionRaf) return;
    if (typeof requestAnimationFrame !== 'function') {
      this.positionDungeonHeaderPopup();
      return;
    }
    this._dungeonHeaderPopupPositionRaf = requestAnimationFrame(() => {
      this._dungeonHeaderPopupPositionRaf = null;
      this.positionDungeonHeaderPopup();
    });
  },

  positionDungeonHeaderPopup() {
    const popup = this._dungeonHeaderPopup;
    const button = this._dungeonHeaderWidgetButton;
    if (!popup || !button || !popup.isConnected || !button.isConnected) return;

    const buttonRect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;

    const desiredWidth = Math.max(360, Math.min(520, viewportWidth - 24));
    const maxHeight = Math.max(220, viewportHeight - 90);
    const margin = 12;

    popup.style.width = `${desiredWidth}px`;
    popup.style.maxHeight = `${maxHeight}px`;

    let left = buttonRect.right - desiredWidth;
    left = Math.max(margin, Math.min(left, viewportWidth - desiredWidth - margin));

    let top = buttonRect.bottom + 10;
    if (top > viewportHeight - margin - 220) {
      top = Math.max(margin, buttonRect.top - Math.min(maxHeight, 500) - 10);
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(margin, top)}px`;
  },

  renderDungeonHeaderPopup() {
    const popup = this._dungeonHeaderPopup;
    if (!popup || !popup.isConnected) return;

    const rows = this._getActiveDungeonsForWidget();
    this._updateDungeonHeaderWidgetBadge(rows.length);

    if (rows.length === 0) {
      popup.innerHTML = `
        <div class="dungeons-header-popup-surface">
          <div class="dungeons-header-popup-head">
            <div class="dungeons-header-popup-title">Active Dungeons</div>
            <button class="dungeon-widget-close-btn" type="button" aria-label="Close">×</button>
          </div>
          <div class="dungeons-header-popup-empty">No active dungeons right now.</div>
        </div>
      `;
      this.positionDungeonHeaderPopup();
      return;
    }

    const rowsHtml = rows.map(([channelKey, dungeon]) => {
      const channelName = escapeHtml(dungeon.channelName || 'unknown-channel');
      const dungeonName = escapeHtml(dungeon.name || 'Unknown Dungeon');
      const dungeonRank = escapeHtml(dungeon.rank || '?');
      const guildName = escapeHtml(dungeon.guildName || 'Unknown Guild');
      const deployed = Boolean(dungeon.shadowsDeployed);
      const joined = Boolean(dungeon.userParticipating);
      const bossHp = Math.max(0, Math.floor(Number(dungeon?.boss?.hp) || 0)).toLocaleString();
      const mobsKilled = Math.max(0, Math.floor(Number(dungeon?.mobs?.killed) || 0));
      const mobsTarget = Math.max(0, Math.floor(Number(dungeon?.mobs?.targetCount) || 0));
      const mobLine = mobsTarget > 0 ? `${mobsKilled}/${mobsTarget}` : `${mobsKilled}`;

      return `
        <div class="dungeons-header-popup-row" data-channel-key="${channelKey}">
          <div class="dungeons-header-popup-row-top">
            <div class="dungeons-header-popup-row-name">${dungeonName}</div>
            <div class="dungeons-header-popup-row-rank">${dungeonRank}</div>
          </div>
          <div class="dungeons-header-popup-row-meta">
            <span>#${channelName}</span>
            <span>•</span>
            <span>${guildName}</span>
          </div>
          <div class="dungeons-header-popup-row-stats">
            <span>Boss HP ${bossHp}</span>
            <span>•</span>
            <span>Mobs ${mobLine}</span>
            <span class="dungeons-header-popup-state ${deployed ? 'is-deployed' : 'is-waiting'}">
              ${deployed ? 'DEPLOYED' : 'WAITING'}
            </span>
            <span class="dungeons-header-popup-state ${joined ? 'is-joined' : 'is-not-joined'}">
              ${joined ? 'JOINED' : 'NOT JOINED'}
            </span>
          </div>
          <div class="dungeons-header-popup-row-actions">
            <button class="dungeon-widget-action action-go" type="button" data-dungeon-action="goto" data-channel-key="${channelKey}">
              GO
            </button>
            <button class="dungeon-widget-action action-deploy" type="button" data-dungeon-action="${deployed ? 'recall' : 'deploy'}" data-channel-key="${channelKey}">
              ${deployed ? 'RECALL' : 'DEPLOY'}
            </button>
            <button class="dungeon-widget-action action-join" type="button" data-dungeon-action="${joined ? 'leave' : 'join'}" data-channel-key="${channelKey}">
              ${joined ? 'LEAVE' : 'JOIN'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    popup.innerHTML = `
      <div class="dungeons-header-popup-surface">
        <div class="dungeons-header-popup-head">
          <div class="dungeons-header-popup-title">Active Dungeons (${rows.length})</div>
          <button class="dungeon-widget-close-btn" type="button" aria-label="Close">×</button>
        </div>
        <div class="dungeons-header-popup-content">
          ${rowsHtml}
        </div>
      </div>
    `;

    this.positionDungeonHeaderPopup();
  },

  focusDungeonChannel(channelKey) {
    const dungeon = this.activeDungeons?.get?.(channelKey);
    if (!dungeon || !dungeon.guildId || !dungeon.channelId) {
      this.showToast('Cannot open dungeon channel right now.', 'error');
      return false;
    }

    try {
      this._navigationUtils ||= getNavigationUtils();
      const path = `/channels/${dungeon.guildId}/${dungeon.channelId}`;
      if (this._navigationUtils?.transitionTo) {
        this._navigationUtils.transitionTo(path);
        return true;
      }
    } catch (error) {
      this.errorLog('UI', 'Failed to navigate to dungeon channel', { channelKey, error });
    }

    this.showToast('Could not navigate to dungeon channel.', 'error');
    return false;
  },
};
