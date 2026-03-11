module.exports = {
  ensureDelegatedUiStyles() {
    // Hover/focus styles now live in styles.css; this ensures they stay injected.
    this.ensureBossHpBarCssInjected?.();
  },

  installDelegatedUiHandlers() {
    if (this._delegatedUiHandlersInstalled) return;
    this._delegatedUiHandlersInstalled = true;
    this.ensureDelegatedUiStyles();

    const refreshDungeonWidgetPopup = () => {
      if (this._dungeonHeaderPopup?.isConnected) {
        this.renderDungeonHeaderPopup?.();
        this.queueDungeonHeaderPopupPosition?.();
      } else {
        this._updateDungeonHeaderWidgetBadge?.();
      }
    };

    const runGuardedDungeonAction = (action, channelKey, runner) => {
      if (!action || !channelKey || typeof runner !== 'function') return;
      this._dungeonUiActionLocks ||= new Set();
      const lockKey = `${action}:${channelKey}`;
      if (this._dungeonUiActionLocks.has(lockKey)) return;
      this._dungeonUiActionLocks.add(lockKey);
      Promise.resolve()
        .then(runner)
        .catch((error) =>
          this.errorLog('UI', 'Failed to process guarded dungeon action', { action, channelKey, error })
        )
        .finally(() => {
          this._dungeonUiActionLocks?.delete?.(lockKey);
          refreshDungeonWidgetPopup();
        });
    };

    const runDungeonWidgetAction = (action, channelKey) => {
      switch (action) {
        case 'goto':
          return this.focusDungeonChannel?.(channelKey);
        case 'deploy':
          return this.deployShadows(channelKey);
        case 'recall':
          return this.recallShadows(channelKey);
        case 'join':
          return this.selectDungeon(channelKey);
        case 'leave':
          return this.leaveDungeon(channelKey);
        default:
          return false;
      }
    };

    this._delegatedUiClickHandler = (e) => {
      const target = /** @type {HTMLElement|null} */ (e.target);
      if (!target) return;

      const dungeonWidgetToggle = target.closest?.('.dungeons-header-widget');
      if (dungeonWidgetToggle) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleDungeonHeaderPopup?.();
        return;
      }

      const dungeonWidgetClose = target.closest?.('.dungeon-widget-close-btn');
      if (dungeonWidgetClose) {
        e.preventDefault();
        e.stopPropagation();
        this.closeDungeonHeaderPopup?.();
        return;
      }

      const dungeonWidgetAction = target.closest?.('.dungeon-widget-action');
      if (dungeonWidgetAction) {
        e.preventDefault();
        e.stopPropagation();
        const action = dungeonWidgetAction.getAttribute('data-dungeon-action');
        const channelKey = dungeonWidgetAction.getAttribute('data-channel-key');
        if (!action || !channelKey) return;
        runGuardedDungeonAction(action, channelKey, () => runDungeonWidgetAction(action, channelKey));
        return;
      }

      const deployBtn = target.closest?.('.dungeon-deploy-btn');
      if (deployBtn) {
        e.preventDefault();
        e.stopPropagation();
        const channelKey = deployBtn.getAttribute('data-channel-key');
        if (!channelKey) return;
        runGuardedDungeonAction('deploy', channelKey, () => this.deployShadows(channelKey));
        return;
      }

      const recallBtn = target.closest?.('.dungeon-recall-btn');
      if (recallBtn) {
        e.preventDefault();
        e.stopPropagation();
        const channelKey = recallBtn.getAttribute('data-channel-key');
        if (!channelKey) return;
        runGuardedDungeonAction('recall', channelKey, () => this.recallShadows(channelKey));
        return;
      }

      const joinBtn = target.closest?.('.dungeon-join-btn');
      if (joinBtn) {
        e.preventDefault();
        e.stopPropagation();
        const channelKey = joinBtn.getAttribute('data-channel-key');
        if (!channelKey) return;
        runGuardedDungeonAction('join', channelKey, () => this.selectDungeon(channelKey));
        return;
      }

      const leaveBtn = target.closest?.('.dungeon-leave-btn');
      if (leaveBtn) {
        e.preventDefault();
        e.stopPropagation();
        const channelKey = leaveBtn.getAttribute('data-channel-key');
        if (!channelKey) return;
        runGuardedDungeonAction('leave', channelKey, () => this.leaveDungeon(channelKey));
        return;
      }

      const ariseBtn = target.closest?.('.dungeon-arise-button');
      if (ariseBtn) {
        e.preventDefault();
        e.stopPropagation();
        // ── Immediate visual disable to block spam clicks ──
        if (ariseBtn.dataset.ariseDisabled === 'true') return;
        ariseBtn.dataset.ariseDisabled = 'true';
        ariseBtn.style.opacity = '0.5';
        ariseBtn.style.pointerEvents = 'none';
        ariseBtn.style.cursor = 'not-allowed';
        const channelKey = ariseBtn.getAttribute('data-arise-button');
        if (!channelKey) return;
        runGuardedDungeonAction('arise', channelKey, () => this.attemptBossExtraction(channelKey));
        return;
      }

    };

    // Capture to ensure Discord handlers can't swallow our clicks.
    document.addEventListener('click', this._delegatedUiClickHandler, true);
    this._listeners.set('delegated_click', { target: document, event: 'click', handler: this._delegatedUiClickHandler, capture: true });
  },

  removeDelegatedUiHandlers() {
    if (!this._delegatedUiHandlersInstalled) return;
    this._delegatedUiHandlersInstalled = false;

    if (this._delegatedUiClickHandler) {
      document.removeEventListener('click', this._delegatedUiClickHandler, true);
      this._delegatedUiClickHandler = null;
      this._listeners.delete('delegated_click');
    }
  }
};
