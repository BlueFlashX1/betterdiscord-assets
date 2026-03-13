/**
 * ShadowArmy — Widget injection, CSS, and lifecycle management.
 *
 * Mixin: Object.assign(ShadowArmy.prototype, require('./widget'))
 */

module.exports = {
  // ============================================================================
  // WIDGET MANAGEMENT
  // ============================================================================

  /**
   * Inject CSS for shadow rank widget (using BdApi.DOM for persistence)
   */
  injectWidgetCSS() {
    const cssContent = `
      #shadow-army-widget {
        background: linear-gradient(135deg, rgba(20, 10, 30, 0.95), rgba(10, 10, 20, 0.95)) !important;
        border: 1px solid rgba(138, 43, 226, 0.4) !important;
        border-radius: 0 !important;
        padding: 12px !important;
        margin: 8px !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 20px rgba(138, 43, 226, 0.15) !important;
        cursor: pointer !important;
        transition: all 0.3s ease !important;
      }

      #shadow-army-widget:hover {
        border-color: rgba(138, 43, 226, 0.6) !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 24px rgba(138, 43, 226, 0.25) !important;
      }

      #shadow-army-widget .widget-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        margin-bottom: 8px !important;
      }

      #shadow-army-widget .widget-title {
        color: #8a2be2 !important;
        font-size: 12px !important;
        font-weight: bold !important;
        text-shadow: 0 0 8px rgba(138, 43, 226, 0.8) !important;
      }

      #shadow-army-widget .widget-total {
        color: #999 !important;
        font-size: 11px !important;
      }

      #shadow-army-widget .rank-grid {
        display: grid !important;
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 6px !important;
      }

      #shadow-army-widget .rank-box {
        text-align: center !important;
        padding: 4px !important;
        background: rgba(0, 0, 0, 0.4) !important;
        border-radius: 0 !important;
        transition: all 0.2s ease !important;
      }

      #shadow-army-widget .rank-label {
        font-size: 10px !important;
        font-weight: bold !important;
      }

      #shadow-army-widget .rank-count {
        color: #fff !important;
        font-size: 14px !important;
        font-weight: bold !important;
      }

      #shadow-army-widget * {
        border-radius: 0 !important;
      }
    `;

    const widgetStyleId = 'shadow-army-widget-styles';
    this.injectOrUpdateCSS(widgetStyleId, cssContent, {
      forceUpdate: false,
      useThemeVars: false,
      priority: 100,
    });
  },

  removeWidgetCSS() {
    const styleId = 'shadow-army-widget-styles';
    this.removeCSSById(styleId);
  },

  /**
   * Inject shadow rank widget into member list sidebar.
   * Fast injection with smart retry logic.
   */
  async injectShadowRankWidget() {
    if (this._isStopped) return;

    // Widget requires both shadow_extraction and shadow_preservation unlocked
    if (!this._isSkillTreeSkillUnlocked('shadow_extraction') ||
        !this._isSkillTreeSkillUnlocked('shadow_preservation')) {
      this.removeShadowRankWidget();
      return;
    }

    if (!this.canInjectWidgetInCurrentView()) {
      this.removeShadowRankWidget();
      return;
    }

    // If widget already exists and is valid, just force-update the React tree
    const existingWidget = document.getElementById('shadow-army-widget');
    if (existingWidget && this.isWidgetInValidMemberList(existingWidget)) {
      this._widgetForceUpdate?.();
      return;
    }
    // Stale widget — clean up before reinserting
    existingWidget && this.removeShadowRankWidget();

    const memberElements = this.getMemberListElements();
    const membersList = memberElements?.membersList || null;
    if (!membersList) return;

    try {
      const spacer = document.createElement('div');
      spacer.id = 'shadow-army-widget-spacer';
      spacer.style.cssText = 'height: 16px; flex-shrink: 0;';

      const widget = document.createElement('div');
      widget.id = 'shadow-army-widget';
      widget.addEventListener('click', () => this.openShadowArmyUI());

      const membersContent = memberElements?.membersContent || null;
      if (membersContent?.firstChild) {
        membersContent.insertBefore(widget, membersContent.firstChild);
        membersContent.insertBefore(spacer, widget);
      } else if (membersList.firstChild) {
        membersList.insertBefore(widget, membersList.firstChild);
        membersList.insertBefore(spacer, widget);
      } else {
        membersList.appendChild(spacer);
        membersList.appendChild(widget);
      }

      // Mount React component
      if (this._widgetReactRoot) {
        try { this._widgetReactRoot.unmount(); } catch (_) {}
        this._widgetReactRoot = null;
      }
      const createRoot = this._getCreateRoot();
      if (createRoot) {
        const root = createRoot(widget);
        this._widgetReactRoot = root;
        const { ShadowArmyWidget } = this._widgetComponents;
        root.render(BdApi.React.createElement(ShadowArmyWidget));
        this.debugLog('WIDGET', 'Widget mounted (React)');
      } else {
        this.debugError('WIDGET', 'createRoot unavailable — widget will not render');
      }
    } catch (error) {
      this.debugError('WIDGET', 'Error injecting shadow rank widget', error);
    }
  },

  updateShadowRankWidget() {
    if (this._isStopped) return;
    if (!document.getElementById('shadow-army-widget')) return;
    if (!this.canInjectWidgetInCurrentView()) {
      this.removeShadowRankWidget();
      return;
    }
    this._widgetForceUpdate?.();
  },

  scheduleWidgetRefresh({ reason = 'unknown', delayMs = 250 } = {}) {
    this._widgetDirty = true;
    if (this._isStopped) return;

    if (this._widgetRefreshTimer) {
      return;
    }

    const now = Date.now();
    const elapsed = now - (this._lastWidgetRefreshAt || 0);
    const minWait = Math.max(0, (this._widgetRefreshMinIntervalMs || 0) - elapsed);
    const waitMs = Math.max(0, delayMs || 0, minWait);

    this._widgetRefreshTimer = setTimeout(() => {
      this._widgetRefreshTimer = null;
      this._runScheduledWidgetRefresh(reason).catch((error) => {
        this.debugError('WIDGET', 'Scheduled refresh failed', error);
      });
    }, waitMs);
  },

  async _runScheduledWidgetRefresh(reason = 'unknown') {
    if (this._isStopped) return;
    if (!this._widgetDirty) return;

    if (this._widgetRefreshInFlight) {
      this._widgetRefreshQueued = true;
      return;
    }

    this._widgetRefreshInFlight = true;
    try {
      this._widgetDirty = false;
      await Promise.resolve(this.updateShadowRankWidget());
      this._lastWidgetRefreshAt = Date.now();
      this.debugLog('WIDGET', 'Coalesced widget refresh complete', {
        reason,
        refreshedAt: this._lastWidgetRefreshAt,
      });
    } catch (error) {
      this._widgetDirty = true;
      this.debugError('WIDGET', 'Coalesced widget refresh error', { reason, error });
    } finally {
      this._widgetRefreshInFlight = false;
      if (this._widgetRefreshQueued && !this._isStopped) {
        this._widgetRefreshQueued = false;
        this.scheduleWidgetRefresh({ reason: 'queued_followup', delayMs: this._widgetRefreshMinIntervalMs });
      }
    }
  },

  removeShadowRankWidget() {
    if (this._widgetReactRoot) {
      this._widgetReactRoot.unmount();
      this._widgetReactRoot = null;
    }
    this._widgetForceUpdate = null;
    const spacer = document.getElementById('shadow-army-widget-spacer');
    if (spacer) spacer.remove();
    const widget = document.getElementById('shadow-army-widget');
    if (widget) widget.remove();
    this.removeWidgetCSS();
  },

  /**
   * Resolve React 18 createRoot across BdApi versions and Webpack exports.
   */
  _getCreateRoot() {
    if (this._ReactUtils?.getCreateRoot) return this._ReactUtils.getCreateRoot();
    if (BdApi.ReactDOM?.createRoot) return BdApi.ReactDOM.createRoot.bind(BdApi.ReactDOM);
    return null;
  },
};
