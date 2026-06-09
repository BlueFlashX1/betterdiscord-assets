const { getNavigationUtils } = require('../shared/navigation');
const { showToolbarTooltip, hideToolbarTooltip, removeToolbarTooltip, ensureTooltipCSS } = require('../shared/toolbar-tooltip');
const { isVoiceChannelChat } = require('../shared/channel-context');
const { watchToolbar } = require('../shared/header-toolbar');

const HEADER_WIDGET_ID = 'dungeons-header-widget';
const HEADER_POPUP_ID = 'dungeons-header-popup';
// Toolbar selectors: wildcard-first for reliability, then resolved dc.sel as bonus.
// "toolbar" in the shared DEFS uses getByKeys("toolbar") which is too generic —
// it often resolves to the wrong Webpack module. The original wildcard selectors
// are the proven-working path. dc.sel.toolbar is kept as a first-try optimistic
// check only — it falls through to wildcards if it matched the wrong element.
const HEADER_TOOLBAR_SELECTORS = [
  // Wildcards (proven, always correct)
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
    if (this._unwatchToolbar) return;

    // Event-driven toolbar placement: fires on CHANNEL_SELECT, VOICE_STATE, and
    // a narrow MutationObserver fallback. Also fires once on attach — no need for
    // a separate initial ensureDungeonHeaderWidget() call.
    this._unwatchToolbar = watchToolbar(() => {
      if (!this.started) return;
      this.ensureDungeonHeaderWidget();
    });

    // Popup content refresh: keep a lightweight interval ONLY for re-rendering the
    // open popup and badge when it's visible. Toolbar placement is now event-driven
    // above, so this loop no longer calls ensureDungeonHeaderWidget().
    const popupTick = () => {
      if (!this.started) return;
      if (document.hidden) return; // PERF: Skip DOM work when window not visible
      if (this._dungeonHeaderPopup?.isConnected) {
        this.renderDungeonHeaderPopup();
        this.queueDungeonHeaderPopupPosition();
      } else {
        this._updateDungeonHeaderWidgetBadge();
      }
    };

    this._dungeonHeaderWidgetLoop = setInterval(popupTick, 3000);
    this._intervals.add(this._dungeonHeaderWidgetLoop);
  },

  stopDungeonHeaderWidget() {
    if (this._unwatchToolbar) {
      this._unwatchToolbar();
      this._unwatchToolbar = null;
    }
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
    removeToolbarTooltip('sl-toolbar-tip-dn');
  },

  _getChannelHeaderToolbarForDungeonWidget() {
    for (const selector of HEADER_TOOLBAR_SELECTORS) {
      const toolbar = document.querySelector(selector);
      if (toolbar && toolbar.offsetParent !== null) return toolbar;
    }
    return null;
  },

  _isDungeonWidgetContextAllowed() {
    // Hide in voice / stage channel chat — the toolbar gets crowded and
    // the dungeon icon isn't useful while in a VC's chat panel.
    // Belt-and-suspenders: shared isVoiceChannelChat() helper AND a direct
    // URL channel-type lookup, since the shared helper has been unreliable
    // on some clients in this repo's history.
    try { if (isVoiceChannelChat()) return false; } catch (_) {}
    try {
      const path = String(window.location?.pathname || '');
      const m = path.match(/^\/channels\/(?:@me|\d+)\/(\d+)/);
      if (m) {
        const ch = BdApi?.Webpack?.getStore?.('ChannelStore')?.getChannel?.(m[1]);
        const t = Number(ch?.type);
        if (t === 2 || t === 13) return false;
      }
    } catch (_) {}
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
        // Demon Castle non-boss floors use sentinel bosses (hp:0) — don't filter those out
        (dungeon._isDemonCastle || (Number(dungeon?.boss?.hp) || 0) > 0)
      ))
      .sort((a, b) => {
        const aRank = rankIndex(a[1]?.rank);
        const bRank = rankIndex(b[1]?.rank);
        if (aRank !== bRank) return bRank - aRank;
        return (Number(b[1]?.startTime) || 0) - (Number(a[1]?.startTime) || 0);
      });
  },

  _getWidgetMobMetrics(channelKey, dungeon) {
    const mobsState = dungeon?.mobs || {};
    const activeList = Array.isArray(mobsState.activeMobs) ? mobsState.activeMobs : [];

    // Reuse recent alive count cache when available; fallback to lightweight scan.
    const cache = this._mobCleanupCache?.get?.(channelKey);
    const cacheAgeMs = cache ? Date.now() - (Number(cache.time) || 0) : Number.POSITIVE_INFINITY;
    const aliveFromCache = Number(cache?.alive);
    const aliveMobs =
      Number.isFinite(aliveFromCache) && cacheAgeMs <= 1200
        ? Math.max(0, Math.floor(aliveFromCache))
        : activeList.reduce((count, mob) => count + ((Number(mob?.hp) || 0) > 0 ? 1 : 0), 0);

    const queuedList = this._mobSpawnQueue?.get?.(channelKey);
    const queuedMobs = Array.isArray(queuedList)
      ? queuedList.length
      : Number.isFinite(Number(queuedList))
        ? Math.max(0, Math.floor(Number(queuedList)))
        : 0;

    const mobsKilled = Math.max(0, Math.floor(Number(mobsState.killed) || 0));
    const mobsTarget = Math.max(0, Math.floor(Number(mobsState.targetCount) || 0));
    const mobsSpawned = Math.max(0, Math.floor(Number(mobsState.total) || 0));
    return {
      aliveMobs,
      queuedMobs,
      mobsKilled,
      mobsTarget,
      mobsSpawned,
    };
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

    ensureTooltipCSS();
    button.addEventListener('mouseenter', () => showToolbarTooltip(button, 'sl-toolbar-tip-dn', 'Active Dungeons'));
    button.addEventListener('mouseleave', () => hideToolbarTooltip('sl-toolbar-tip-dn'));

    this._dungeonHeaderWidgetButton = button;
    return button;
  },

  ensureDungeonHeaderWidget() {
    const activeDungeons = this._getActiveDungeonsForWidget();
    const hasActiveDungeons = activeDungeons.length > 0;
    const contextAllowed = this._isDungeonWidgetContextAllowed();
    const toolbar = this._getChannelHeaderToolbarForDungeonWidget();

    // Story mode: always show widget once story mode is initialized (so user can enter the castle)
    const hasStoryMode = this._storyModeActive || this._demonCastle != null;
    if ((!hasActiveDungeons && !hasStoryMode) || !contextAllowed || !toolbar) {
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
    window.addEventListener('resize', this._dungeonHeaderPopupResizeHandler, { passive: true });
    window.addEventListener('scroll', this._dungeonHeaderPopupScrollHandler, { passive: true, capture: true });
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
    this._lastPopupVersionKey = null; // Force full render on next open
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

    const desiredWidth = Math.max(420, Math.min(560, viewportWidth - 24));
    const maxHeight = Math.max(300, viewportHeight - 80);
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

    const activeTab = this._storyModePopupTab || 'dungeons';

    // PERF: Dirty-flag — skip innerHTML rebuild when dungeon state is identical since
    // last render. Version key encodes all tick-varying fields: boss HP, mob counts,
    // deploy/join flags, active tab, and row count. Build it before any DOM work.
    const popupVersionKey = activeTab + '|' + rows.map(([ck, d]) => {
      const { aliveMobs, queuedMobs, mobsKilled, mobsSpawned } = this._getWidgetMobMetrics(ck, d);
      return `${ck}:${Math.floor(d?.boss?.hp || 0)}:${aliveMobs}:${queuedMobs}:${mobsKilled}:${mobsSpawned}:${d.shadowsDeployed ? 1 : 0}:${d.userParticipating ? 1 : 0}`;
    }).join('|');
    if (popupVersionKey === this._lastPopupVersionKey) return;
    this._lastPopupVersionKey = popupVersionKey;

    // Preserve scroll position across re-renders
    const contentEl = popup.querySelector('.dungeons-header-popup-content');
    const savedScrollTop = contentEl ? contentEl.scrollTop : 0;
    const hasStoryTab = typeof this._getStoryModeTabHtml === 'function';

    if (rows.length === 0 && activeTab === 'dungeons' && !hasStoryTab) {
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
      const {
        aliveMobs,
        queuedMobs,
        mobsKilled,
        mobsSpawned,
      } = this._getWidgetMobMetrics(channelKey, dungeon);
      // Show kills as running total (no target — spawning is continuous until boss dies)
      const mobKillLine = mobsKilled.toLocaleString();
      const spawnLine = mobsSpawned.toLocaleString();

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
            <span>Active ${aliveMobs.toLocaleString()}</span>
            <span>•</span>
            <span>Queued ${queuedMobs.toLocaleString()}</span>
            <span>•</span>
            <span>Spawned ${spawnLine}</span>
            <span>•</span>
            <span>Killed ${mobKillLine}</span>
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

    // Build tab bar (Dungeons | Story)
    const storyTabActive = activeTab === 'story' || activeTab === 'story-detail-dc';
    const tabsHtml = hasStoryTab ? `
      <div class="dungeons-popup-tabs">
        <button class="dungeons-tab-btn dungeon-widget-action ${activeTab === 'dungeons' ? 'is-active' : ''}"
                type="button" data-dungeon-action="tab-dungeons" data-channel-key="_tab">
          &#x2694; Dungeons${rows.length > 0 ? ` (${rows.length})` : ''}
        </button>
        <button class="dungeons-tab-btn dungeon-widget-action ${storyTabActive ? 'is-active' : ''}"
                type="button" data-dungeon-action="tab-story" data-channel-key="_tab">
          &#x1F4D6; Story
        </button>
      </div>
    ` : `<div class="dungeons-header-popup-title">Active Dungeons (${rows.length})</div>`;

    let contentHtml;
    if (activeTab === 'story-detail-dc' && typeof this._getDemonCastleDetailHtml === 'function') {
      contentHtml = this._getDemonCastleDetailHtml();
    } else if (activeTab === 'story' && hasStoryTab) {
      contentHtml = this._getStoryModeTabHtml();
    } else {
      contentHtml = rows.length > 0 ? rowsHtml : '<div class="dungeons-header-popup-empty">No active dungeons right now.</div>';
    }

    popup.innerHTML = `
      <div class="dungeons-header-popup-surface">
        <div class="dungeons-header-popup-head">
          ${tabsHtml}
          <button class="dungeon-widget-close-btn" type="button" aria-label="Close">×</button>
        </div>
        <div class="dungeons-header-popup-content">
          ${contentHtml}
        </div>
      </div>
    `;

    // Restore scroll position after innerHTML replacement
    if (savedScrollTop > 0) {
      const newContentEl = popup.querySelector('.dungeons-header-popup-content');
      if (newContentEl) newContentEl.scrollTop = savedScrollTop;
    }

    this.positionDungeonHeaderPopup();
  },

  focusDungeonChannel(channelKey) {
    const dungeon = this.activeDungeons?.get?.(channelKey);
    if (!dungeon) {
      this.showToast('Cannot open dungeon channel right now.', 'error');
      return false;
    }

    let guildId = dungeon.guildId;
    let channelId = dungeon.channelId;
    if (!guildId || !channelId) {
      const key = String(channelKey || '');
      const splitIndex = key.indexOf('_');
      if (splitIndex > 0 && splitIndex < key.length - 1) {
        guildId ||= key.slice(0, splitIndex);
        channelId ||= key.slice(splitIndex + 1);
      }
    }
    if (!guildId || !channelId) {
      this.showToast('Cannot open dungeon channel right now.', 'error');
      return false;
    }

    try {
      // Translate the "DM" sentinel that channel-discovery.js and
      // spawn-core.js use for direct-message dungeons into Discord's
      // actual @me URL segment. Without this, /channels/DM/<id> is
      // silently rejected by Discord's router and the GO button
      // appears to do nothing for DM dungeons. Same translation
      // ShadowSenses' navigateToChannel uses.
      const guildSeg = guildId && guildId !== "DM" ? guildId : "@me";
      const path = `/channels/${guildSeg}/${channelId}`;
      this._navigationUtils ||= getNavigationUtils();

      if (this._navigationUtils?.transitionTo) {
        this._navigationUtils.transitionTo(path);
        return true;
      }

      const { Webpack } = BdApi;
      const nav =
        Webpack?.getByKeys?.('transitionTo', 'back', 'forward') ||
        // Optional chaining INSIDE filters is banned (AGENTS.md).
        Webpack?.getModule?.((m) => m && m.transitionTo && m.back && m.forward);
      if (nav?.transitionTo) {
        this._navigationUtils = nav;
        nav.transitionTo(path);
        return true;
      }

      if (window.history?.pushState) {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
        return true;
      }
    } catch (error) {
      this.errorLog('UI', 'Failed to navigate to dungeon channel', { channelKey, error });
    }

    this.showToast('Could not navigate to dungeon channel.', 'error');
    return false;
  },
};
