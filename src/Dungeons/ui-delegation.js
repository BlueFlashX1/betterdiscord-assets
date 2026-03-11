module.exports = {
  ensureDelegatedUiStyles() {
    // Hover/focus styles now live in styles.css; this ensures they stay injected.
    this.ensureBossHpBarCssInjected?.();
  },

  installDelegatedUiHandlers() {
    if (this._delegatedUiHandlersInstalled) return;
    this._delegatedUiHandlersInstalled = true;
    this.ensureDelegatedUiStyles();

    this._delegatedUiClickHandler = (e) => {
      const target = /** @type {HTMLElement|null} */ (e.target);
      if (!target) return;

      const deployBtn = target.closest?.('.dungeon-deploy-btn');
      if (deployBtn) {
        e.preventDefault();
        e.stopPropagation();
        const channelKey = deployBtn.getAttribute('data-channel-key');
        channelKey &&
          Promise.resolve(this.deployShadows(channelKey)).catch((error) =>
            this.errorLog('UI', 'Failed to deploy shadows', { channelKey, error })
          );
        return;
      }

      const recallBtn = target.closest?.('.dungeon-recall-btn');
      if (recallBtn) {
        e.preventDefault();
        e.stopPropagation();
        const channelKey = recallBtn.getAttribute('data-channel-key');
        channelKey &&
          Promise.resolve(this.recallShadows(channelKey)).catch((error) =>
            this.errorLog('UI', 'Failed to recall shadows', { channelKey, error })
          );
        return;
      }

      const joinBtn = target.closest?.('.dungeon-join-btn');
      if (joinBtn) {
        e.preventDefault();
        e.stopPropagation();
        const channelKey = joinBtn.getAttribute('data-channel-key');
        channelKey &&
          Promise.resolve(this.selectDungeon(channelKey)).catch((error) =>
            this.errorLog('UI', 'Failed to join dungeon', { channelKey, error })
          );
        return;
      }

      const leaveBtn = target.closest?.('.dungeon-leave-btn');
      if (leaveBtn) {
        e.preventDefault();
        e.stopPropagation();
        const channelKey = leaveBtn.getAttribute('data-channel-key');
        if (!channelKey) return;
        const dungeon = this.activeDungeons.get(channelKey);
        if (!dungeon) return;

        dungeon.userParticipating = false;
        this.settings.userActiveDungeon = null;
        this.saveSettings();
        this.updateBossHPBar(channelKey);
        this.showToast(`Left ${dungeon.name}. You can now join other dungeons.`, 'info');
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
        channelKey &&
          Promise.resolve(this.attemptBossExtraction(channelKey)).catch((error) =>
            this.errorLog('UI', 'Failed to attempt boss extraction', { channelKey, error })
          );
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
