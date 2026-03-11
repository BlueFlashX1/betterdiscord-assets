const DUNGEONS_CSS = require('./styles.css');

module.exports = {
  removeCSSById(styleId) {
    // Guard clause: Validate input
    if (!styleId) {
      this.errorLog?.('CSS', 'Invalid CSS removal: missing styleId');
      return false;
    }

    try {
      // Try BdApi.DOM.removeStyle first (official API)
      if (BdApi?.DOM?.removeStyle) {
        BdApi.DOM.removeStyle(styleId);
      } else {
        // Fallback to manual removal
        const style = document.getElementById(styleId);
        if (style && style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }

      // Remove from tracking
      if (this._injectedStyles) {
        this._injectedStyles.delete(styleId);
      }

      if (this.debugLog) {
        this.debugLog('CSS', `CSS removed: ${styleId}`);
      }
      return true;
    } catch (error) {
      if (this.errorLog) {
        this.errorLog('CSS', `Failed to remove CSS: ${styleId}`, error);
      }
      return false;
    }
  },

  cleanupAllCSS() {
    if (!this._injectedStyles) return;

    this._injectedStyles.forEach((styleId) => {
      this.removeCSSById(styleId);
    });

    this._injectedStyles.clear();
    if (this.debugLog) {
      this.debugLog('CSS', 'All injected CSS cleaned up');
    }
  },

  injectCSS() {
    const styleId = 'dungeons-plugin-styles';

    const cssContent = typeof DUNGEONS_CSS === 'string' ? DUNGEONS_CSS : '';
    if (!cssContent.trim()) {
      this.errorLog?.('CSS', 'styles.css payload missing; skipping style injection');
      return;
    }

    // Inject CSS using BdApi.DOM.addStyle (official API, persistent across Discord updates)
    try {
      if (BdApi?.DOM?.addStyle) {
        BdApi.DOM.addStyle(styleId, cssContent);
      } else {
        // Fallback to manual injection (shouldn't happen in BetterDiscord)
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = cssContent;
        document.head.appendChild(style);
      }
    } catch (error) {
      this.debugLog('CSS', `Failed to inject CSS: ${styleId}`, error);
    }

    // Track injected style for cleanup
    if (!this._injectedStyles) {
      this._injectedStyles = new Set();
    }
    this._injectedStyles.add(styleId);
  },

  ensureBossHpBarCssInjected() {
    const styleId = 'dungeons-plugin-styles';
    const styleEl = document.getElementById(styleId);
    const styleInHead = Boolean(styleEl && document.head?.contains(styleEl));
    const styleInBody = Boolean(styleEl && document.body?.contains(styleEl) && !styleInHead);
    const styleHasContent = Boolean(styleEl?.textContent?.trim().length);
    let hasValidStyle = styleInHead && styleHasContent;

    // If the style slipped into <body> (common after Discord layer swaps), move it back.
    if (styleEl && styleInBody) {
      try {
        styleEl.parentNode?.removeChild(styleEl);
        document.head?.appendChild(styleEl);
        hasValidStyle = styleHasContent;
      } catch (_) {
        hasValidStyle = false;
      }
    }

    if (!styleEl || !hasValidStyle) {
      this.injectCSS();
    }
  },

  getSettingsPanel() {
    const React = BdApi.React;
    const self = this;

    const SettingsPanel = () => {
      const [isDebugEnabled, setIsDebugEnabled] = React.useState(Boolean(self.settings?.debug));

      return React.createElement(
        'div',
        {
          style: {
            padding: '24px',
            background: '#1e1e2e',
            borderRadius: '8px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          },
        },
        React.createElement(
          'h3',
          {
            style: {
              margin: '0 0 20px 0',
              color: '#cdd6f4',
              fontSize: '18px',
              fontWeight: '600',
              borderBottom: '1px solid #45475a',
              paddingBottom: '12px',
            },
          },
          'Dungeons Settings'
        ),
        React.createElement(
          'label',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              padding: '12px 16px',
              background: '#181825',
              borderRadius: '6px',
              border: '1px solid #45475a',
              transition: 'border-color 0.2s',
              color: '#cdd6f4',
              fontSize: '14px',
            },
          },
          React.createElement('input', {
            type: 'checkbox',
            checked: isDebugEnabled,
            onChange: (e) => {
              const next = Boolean(e.target.checked);
              setIsDebugEnabled(next);
              self.settings.debug = next;
              self.saveSettings();
            },
            style: {
              accentColor: '#b4befe',
              width: '18px',
              height: '18px',
              cursor: 'pointer',
            },
          }),
          React.createElement(
            'span',
            null,
            'Debug Mode',
            React.createElement(
              'span',
              {
                style: {
                  display: 'block',
                  fontSize: '12px',
                  color: '#a6adc8',
                  marginTop: '2px',
                },
              },
              'Enables verbose console logging'
            )
          )
        )
      );
    };

    return React.createElement(SettingsPanel, null);
  }
};
