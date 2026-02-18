/**
 * @name ChatNavArrows
 * @description Replaces the "Jump to Present" bar with a compact down-arrow button, and adds an up-arrow button to jump to the first message in the channel.
 * @version 2.0.0
 * @author Solo Leveling Theme Dev
 *
 * ============================================================================
 * REACT PATCHER ARCHITECTURE (v2.0.0)
 * ============================================================================
 *
 * Injects via MainContent.Z React patcher (same proven target as
 * SoloLevelingStats, LevelProgressBar, ShadowArmy).  A lightweight React
 * component manages arrow lifecycle — useEffect finds the active scroller,
 * attaches scroll listeners, and injects arrow DOM elements.  Cleanup is
 * automatic via useEffect return.  No MutationObserver needed.
 *
 * Previous approach (v1.x): MutationObserver on #app-mount that fired
 * patchAll() on every DOM mutation — expensive and flickered on re-renders.
 */

module.exports = class ChatNavArrows {
  constructor() {
    this._patcherId = 'ChatNavArrows';
    this._isStopped = false;
  }

  start() {
    this._isStopped = false;
    BdApi.DOM.addStyle('sl-chat-nav-arrows-css', this.getCSS());
    this._installReactPatcher();
  }

  stop() {
    this._isStopped = true;
    BdApi.Patcher.unpatchAll(this._patcherId);
    BdApi.DOM.removeStyle('sl-chat-nav-arrows-css');

    // Restore hidden jump bars
    document.querySelectorAll('div[class^="jumpToPresentBar_"]').forEach((bar) => {
      bar.style.display = '';
    });
    // Remove any residual arrow elements
    document.querySelectorAll('.sl-chat-nav-arrow').forEach((el) => el.remove());
  }

  // ──────────────────────────────────────────────────────────────────────────
  // React Patcher — inject into MainContent.Z (base layer)
  // ──────────────────────────────────────────────────────────────────────────

  _installReactPatcher() {
    let ReactUtils;
    try {
      ReactUtils = require('./BetterDiscordReactUtils.js');
    } catch (_) {
      ReactUtils = null;
    }

    if (ReactUtils) {
      const pluginInstance = this;
      const ok = ReactUtils.patchReactMainContent(this, this._patcherId, (React, appNode, returnValue) => {
        const component = React.createElement(pluginInstance._ArrowManager, {
          key: 'sl-chat-nav-arrows',
          pluginInstance,
        });
        ReactUtils.injectReactComponent(appNode, 'sl-chat-nav-arrows-root', component, returnValue);
      });
      if (!ok) {
        console.error('[ChatNavArrows] MainContent module not found — plugin inactive');
      }
      return;
    }

    // Inline fallback if BetterDiscordReactUtils.js is not available
    let MainContent = BdApi.Webpack.getByStrings('baseLayer', { defaultExport: false });
    if (!MainContent) {
      MainContent = BdApi.Webpack.getByStrings('appMount', { defaultExport: false });
    }
    if (!MainContent) {
      console.error('[ChatNavArrows] MainContent module not found — plugin inactive');
      return;
    }

    const React = BdApi.React;
    const pluginInstance = this;

    BdApi.Patcher.after(this._patcherId, MainContent, 'Z', (_this, _args, returnValue) => {
      try {
        if (pluginInstance._isStopped) return returnValue;

        const appNode = BdApi.Utils.findInTree(
          returnValue,
          (prop) =>
            prop &&
            prop.props &&
            (prop.props.className?.includes('app') ||
              prop.props.id === 'app-mount' ||
              prop.type === 'body'),
          { walkable: ['props', 'children'] }
        );

        if (!appNode || !appNode.props) return returnValue;

        const already = BdApi.Utils.findInTree(
          returnValue,
          (prop) => prop && prop.props && prop.props.id === 'sl-chat-nav-arrows-root',
          { walkable: ['props', 'children'] }
        );
        if (already) return returnValue;

        const arrowManager = React.createElement(pluginInstance._ArrowManager, {
          key: 'sl-chat-nav-arrows',
          pluginInstance,
        });
        const wrapper = React.createElement(
          'div',
          { id: 'sl-chat-nav-arrows-root', style: { display: 'contents' } },
          arrowManager
        );

        if (Array.isArray(appNode.props.children)) {
          appNode.props.children.push(wrapper);
        } else if (appNode.props.children) {
          appNode.props.children = [appNode.props.children, wrapper];
        } else {
          appNode.props.children = wrapper;
        }
      } catch (e) {
        console.error('[ChatNavArrows] React patcher error:', e);
      }
      return returnValue;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Arrow Manager — React functional component
  // ──────────────────────────────────────────────────────────────────────────

  get _ArrowManager() {
    // Cache the component so React doesn't re-create it every render
    if (this.__ArrowManagerCached) return this.__ArrowManagerCached;

    const THRESHOLD = 100; // px from edge to show/hide arrows
    const POLL_INTERVAL = 500; // ms to check for scroller changes (channel switch)

    this.__ArrowManagerCached = ({ pluginInstance }) => {
      const React = BdApi.React;
      const [showDown, setShowDown] = React.useState(false);
      const [showUp, setShowUp] = React.useState(false);
      const scrollerRef = React.useRef(null);
      const wrapperRef = React.useRef(null);
      const pollRef = React.useRef(null);

      React.useEffect(() => {
        if (pluginInstance._isStopped) return;

        let currentScroller = null;
        let scrollHandler = null;

        const findAndBind = () => {
          const wrapper = document.querySelector('div[class*="messagesWrapper_"]');
          const scroller = wrapper?.querySelector('div[class*="scroller_"]');

          if (!scroller || scroller === currentScroller) return;

          // Unbind previous
          if (currentScroller && scrollHandler) {
            currentScroller.removeEventListener('scroll', scrollHandler);
          }

          currentScroller = scroller;
          scrollerRef.current = scroller;
          wrapperRef.current = wrapper;

          // Ensure wrapper is position:relative for absolute arrow positioning
          if (wrapper) wrapper.style.position = 'relative';

          scrollHandler = () => {
            const { scrollTop, scrollHeight, clientHeight } = scroller;
            const atBottom = scrollHeight - scrollTop - clientHeight < THRESHOLD;
            const atTop = scrollTop < THRESHOLD;
            setShowDown(!atBottom);
            setShowUp(!atTop);
          };

          scroller.addEventListener('scroll', scrollHandler, { passive: true });
          scrollHandler(); // Initial check
        };

        // Find scroller immediately, then poll for channel switches
        findAndBind();
        pollRef.current = setInterval(findAndBind, POLL_INTERVAL);

        return () => {
          // Cleanup: remove listener + stop polling
          if (currentScroller && scrollHandler) {
            currentScroller.removeEventListener('scroll', scrollHandler);
          }
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        };
      }, []); // Run once on mount — polling handles channel switches

      const handleDownClick = React.useCallback(() => {
        const wrapper = wrapperRef.current;
        const scroller = scrollerRef.current;
        if (!wrapper || !scroller) return;

        // Try Discord's native jump button (handles loading newer messages)
        const nativeBar = wrapper.querySelector('div[class^="jumpToPresentBar_"]');
        const nativeBtn = nativeBar ? nativeBar.querySelector('button') : null;
        if (nativeBtn) {
          nativeBar.style.display = '';
          nativeBtn.click();
          requestAnimationFrame(() => { nativeBar.style.display = 'none'; });
        } else {
          scroller.scrollTop = scroller.scrollHeight;
        }
      }, []);

      const handleUpClick = React.useCallback(() => {
        const scroller = scrollerRef.current;
        if (scroller) scroller.scrollTop = 0;
      }, []);

      // Render arrows using React portals into the wrapper if available,
      // otherwise render as fixed-position fallback
      const wrapper = wrapperRef.current;

      // Use createPortal to render inside the messages wrapper
      if (wrapper && BdApi.ReactDOM?.createPortal) {
        return BdApi.ReactDOM.createPortal(
          React.createElement(React.Fragment, null,
            React.createElement('div', {
              className: `sl-chat-nav-arrow sl-chat-nav-down${showDown ? ' sl-visible' : ''}`,
              title: 'Jump to Present',
              onClick: handleDownClick,
            }, React.createElement('svg', { viewBox: '0 0 24 24' },
              React.createElement('path', { d: 'M12 16l-6-6h12l-6 6z' })
            )),
            React.createElement('div', {
              className: `sl-chat-nav-arrow sl-chat-nav-up${showUp ? ' sl-visible' : ''}`,
              title: 'Jump to Top',
              onClick: handleUpClick,
            }, React.createElement('svg', { viewBox: '0 0 24 24' },
              React.createElement('path', { d: 'M12 8l-6 6h12l-6-6z' })
            ))
          ),
          wrapper
        );
      }

      // No wrapper found yet — render nothing until scroller is detected
      if (!wrapper) return null;

      // createPortal not available — render nothing (arrows need wrapper context)
      return null;
    };

    return this.__ArrowManagerCached;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CSS
  // ──────────────────────────────────────────────────────────────────────────

  getCSS() {
    return `
      /* Hide native jump-to-present bars globally */
      div[class^="jumpToPresentBar_"] {
        display: none !important;
      }

      .sl-chat-nav-arrow {
        position: absolute;
        z-index: 3;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(8, 10, 20, 0.92);
        border: 1px solid rgba(138, 43, 226, 0.45);
        color: #b48cff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease,
                    box-shadow 0.15s ease, transform 0.15s ease,
                    opacity 0.2s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        right: 24px;
        pointer-events: none;
        opacity: 0;
      }
      .sl-chat-nav-arrow.sl-visible {
        opacity: 1;
        pointer-events: auto;
      }
      .sl-chat-nav-arrow:hover {
        background: rgba(138, 43, 226, 0.2);
        border-color: #8a2be2;
        box-shadow: 0 0 12px rgba(138, 43, 226, 0.35);
        transform: scale(1.1);
      }
      .sl-chat-nav-arrow:active {
        transform: scale(0.95);
      }
      .sl-chat-nav-arrow svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }
      .sl-chat-nav-down {
        bottom: 24px;
      }
      .sl-chat-nav-up {
        bottom: 68px;
      }
    `;
  }
};
