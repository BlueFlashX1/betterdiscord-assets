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

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

module.exports = class ChatNavArrows {
  constructor() {
    this._patcherId = 'ChatNavArrows';
    this._isStopped = false;
    this._domFallback = null;
  }

  start() {
    this._isStopped = false;
    BdApi.DOM.addStyle('sl-chat-nav-arrows-css', this.getCSS());
    const reactPatched = this._installReactPatcher();
    if (!reactPatched) {
      this._startDomFallback();
    }
  }

  stop() {
    this._isStopped = true;
    BdApi.Patcher.unpatchAll(this._patcherId);
    BdApi.DOM.removeStyle('sl-chat-nav-arrows-css');
    this._stopDomFallback();

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
      ReactUtils = _bdLoad('BetterDiscordReactUtils.js');
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
        return false;
      }
      return true;
    }

    // Inline fallback if BetterDiscordReactUtils.js is not available
    // Multi-strategy MainContent finder (resilient to Discord renames)
    const _mcStrings = ['baseLayer', 'appMount', 'app-mount', 'notAppAsidePanel', 'applicationStore'];
    let MainContent = null, _mcKey = 'Z';
    if (typeof BdApi.Webpack.getWithKey === 'function') {
      for (const s of _mcStrings) {
        try { const r = BdApi.Webpack.getWithKey(m => typeof m === 'function' && m.toString().includes(s)); if (r && r[0]) { MainContent = r[0]; _mcKey = r[1]; break; } } catch (_) {}
      }
    }
    if (!MainContent) {
      for (const s of _mcStrings) {
        try { const mod = BdApi.Webpack.getByStrings(s, { defaultExport: false }); if (mod) { for (const k of ['Z','ZP','default']) { if (typeof mod[k] === 'function') { MainContent = mod; _mcKey = k; break; } } if (!MainContent) { const k = Object.keys(mod).find(k => typeof mod[k] === 'function'); if (k) { MainContent = mod; _mcKey = k; } } if (MainContent) break; } } catch (_) {}
      }
    }
    if (!MainContent) {
      console.error('[ChatNavArrows] MainContent module not found (all strategies exhausted) — using DOM fallback');
      return false;
    }

    const React = BdApi.React;
    const pluginInstance = this;

    BdApi.Patcher.after(this._patcherId, MainContent, _mcKey, (_this, _args, returnValue) => {
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
    return true;
  }

  _startDomFallback() {
    this._stopDomFallback();
    this._domFallback = {
      currentWrapper: null,
      currentScroller: null,
      scrollHandler: null,
      pollTimer: null,
      downEl: null,
      upEl: null,
    };

    const getScrollerPair = () => {
      const wrapper =
        document.querySelector('div[class*="messagesWrapper_"]') ||
        document.querySelector('div[class*="messagesWrapper-"]') ||
        document.querySelector('main[class*="chatContent"] > div > div[class*="scroller"]')?.parentElement;
      const scroller =
        wrapper?.querySelector('div[class*="scroller_"]') ||
        wrapper?.querySelector('div[class*="scroller-"]') ||
        wrapper?.querySelector('[class*="scrollerInner_"]')?.parentElement ||
        null;
      return { wrapper: wrapper || null, scroller };
    };

    const setArrowVisible = (el, isVisible) => {
      if (!el) return;
      if (isVisible) el.classList.add('sl-visible');
      else el.classList.remove('sl-visible');
    };

    const updateArrowState = () => {
      const state = this._domFallback;
      const scroller = state?.currentScroller;
      if (!state || !scroller) return;
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const threshold = 100;
      const atBottom = scrollHeight - scrollTop - clientHeight < threshold;
      const atTop = scrollTop < threshold;
      setArrowVisible(state.downEl, !atBottom);
      setArrowVisible(state.upEl, !atTop);
    };

    const handleDownClick = () => {
      const state = this._domFallback;
      const wrapper = state?.currentWrapper;
      const scroller = state?.currentScroller;
      if (!wrapper || !scroller) return;

      const nativeBar = wrapper.querySelector('div[class^="jumpToPresentBar_"]');
      const nativeBtn = nativeBar ? nativeBar.querySelector('button') : null;
      if (nativeBtn) {
        nativeBar.style.display = '';
        nativeBtn.click();
        requestAnimationFrame(() => {
          nativeBar.style.display = 'none';
        });
      } else {
        scroller.scrollTop = scroller.scrollHeight;
      }
      updateArrowState();
    };

    const handleUpClick = () => {
      const scroller = this._domFallback?.currentScroller;
      if (!scroller) return;
      scroller.scrollTop = 0;
      updateArrowState();
    };

    const ensureArrowElements = (wrapper) => {
      const state = this._domFallback;
      if (!state || !wrapper) return;

      wrapper.style.position = 'relative';

      if (!state.downEl || !state.downEl.isConnected) {
        state.downEl = document.createElement('div');
        state.downEl.className = 'sl-chat-nav-arrow sl-chat-nav-down';
        state.downEl.title = 'Jump to Present';
        state.downEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 16l-6-6h12l-6 6z"></path></svg>';
        state.downEl.addEventListener('click', handleDownClick);
      }

      if (!state.upEl || !state.upEl.isConnected) {
        state.upEl = document.createElement('div');
        state.upEl.className = 'sl-chat-nav-arrow sl-chat-nav-up';
        state.upEl.title = 'Jump to Top';
        state.upEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 8l-6 6h12l-6-6z"></path></svg>';
        state.upEl.addEventListener('click', handleUpClick);
      }

      if (!wrapper.contains(state.downEl)) wrapper.appendChild(state.downEl);
      if (!wrapper.contains(state.upEl)) wrapper.appendChild(state.upEl);
    };

    const unbindScroller = () => {
      const state = this._domFallback;
      if (!state?.currentScroller || !state.scrollHandler) return;
      state.currentScroller.removeEventListener('scroll', state.scrollHandler);
      state.currentScroller = null;
      state.scrollHandler = null;
    };

    const bindScroller = (wrapper, scroller) => {
      const state = this._domFallback;
      if (!state) return;

      if (state.currentScroller === scroller && state.currentWrapper === wrapper) {
        updateArrowState();
        return;
      }

      unbindScroller();

      state.currentWrapper = wrapper;
      state.currentScroller = scroller;

      if (!wrapper || !scroller) {
        if (state.downEl) setArrowVisible(state.downEl, false);
        if (state.upEl) setArrowVisible(state.upEl, false);
        return;
      }

      ensureArrowElements(wrapper);

      state.scrollHandler = () => updateArrowState();
      scroller.addEventListener('scroll', state.scrollHandler, { passive: true });
      updateArrowState();
    };

    const tick = () => {
      if (this._isStopped) return;
      if (document.hidden) return; // PERF: Skip when window not visible
      const { wrapper, scroller } = getScrollerPair();
      // Early exit: skip if same scroller is still connected
      if (scroller === this._domFallback.currentScroller && scroller?.isConnected) return;
      bindScroller(wrapper, scroller);
    };

    tick();
    this._domFallback.pollTimer = setInterval(tick, 2000); // 2s (was 500ms)
    console.log('[ChatNavArrows] Using DOM fallback mode');
  }

  _stopDomFallback() {
    const state = this._domFallback;
    if (!state) return;

    if (state.currentScroller && state.scrollHandler) {
      state.currentScroller.removeEventListener('scroll', state.scrollHandler);
    }
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
    }
    if (state.downEl) {
      state.downEl.remove();
    }
    if (state.upEl) {
      state.upEl.remove();
    }
    this._domFallback = null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Arrow Manager — React functional component
  // ──────────────────────────────────────────────────────────────────────────

  get _ArrowManager() {
    // Cache the component so React doesn't re-create it every render
    if (this.__ArrowManagerCached) return this.__ArrowManagerCached;

    const THRESHOLD = 100; // px from edge to show/hide arrows
    const POLL_INTERVAL = 2000; // ms to check for scroller changes (was 500ms)

    this.__ArrowManagerCached = ({ pluginInstance }) => {
      const React = BdApi.React;
      const [showDown, setShowDown] = React.useState(false);
      const [showUp, setShowUp] = React.useState(false);
      // bindCount forces a re-render whenever findAndBind discovers a new scroller.
      // Without this, the first render returns null (wrapperRef not set yet),
      // and if the scroll handler's setState values match defaults (both false
      // — e.g. short channel at bottom), no re-render ever happens and the
      // portal never mounts.
      const [bindCount, setBindCount] = React.useState(0);
      const scrollerRef = React.useRef(null);
      const wrapperRef = React.useRef(null);
      const pollRef = React.useRef(null);
      // Track DOM-injected arrows for cleanup when createPortal unavailable
      const domArrowsRef = React.useRef(null);

      React.useEffect(() => {
        if (pluginInstance._isStopped) return;

        let currentScroller = null;
        let scrollHandler = null;

        const findScroller = () => {
          const wrapper =
            document.querySelector('div[class*="messagesWrapper_"]') ||
            document.querySelector('div[class*="messagesWrapper-"]') ||
            document.querySelector('main[class*="chatContent"] > div > div[class*="scroller"]')?.parentElement;
          const scroller =
            wrapper?.querySelector('div[class*="scroller_"]') ||
            wrapper?.querySelector('div[class*="scroller-"]') ||
            wrapper?.querySelector('[class*="scrollerInner_"]')?.parentElement;
          return { wrapper: wrapper || null, scroller: scroller || null };
        };

        const findAndBind = () => {
          const { wrapper, scroller } = findScroller();
          if (!scroller) return;
          // Same scroller still connected — no rebind needed
          if (scroller === currentScroller && scroller.isConnected) return;

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
            if (!scroller.isConnected) return;
            const { scrollTop, scrollHeight, clientHeight } = scroller;
            const atBottom = scrollHeight - scrollTop - clientHeight < THRESHOLD;
            const atTop = scrollTop < THRESHOLD;
            setShowDown(!atBottom);
            setShowUp(!atTop);
          };

          scroller.addEventListener('scroll', scrollHandler, { passive: true });
          scrollHandler(); // Initial check
          // Force re-render so the portal/DOM path can pick up the new wrapper
          setBindCount(c => c + 1);
        };

        // Find scroller immediately; retry quickly if DOM isn't ready yet
        findAndBind();
        if (!currentScroller) {
          setTimeout(findAndBind, 150);
        }
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

      const wrapper = wrapperRef.current;

      // ── Portal path (preferred) ──
      if (wrapper && wrapper.isConnected && BdApi.ReactDOM?.createPortal) {
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

      // ── DOM injection fallback (createPortal unavailable or wrapper stale) ──
      // Inject arrow elements directly into the wrapper via useEffect.
      // This mirrors the DOM fallback mode but driven by React state.
      React.useEffect(() => {
        if (!wrapper || !wrapper.isConnected) return;
        if (BdApi.ReactDOM?.createPortal) return; // Portal path handles it

        // Create or reuse arrow elements
        let arrows = domArrowsRef.current;
        if (!arrows || !arrows.down.isConnected) {
          const down = document.createElement('div');
          down.className = 'sl-chat-nav-arrow sl-chat-nav-down';
          down.title = 'Jump to Present';
          down.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 16l-6-6h12l-6 6z"></path></svg>';
          down.addEventListener('click', handleDownClick);

          const up = document.createElement('div');
          up.className = 'sl-chat-nav-arrow sl-chat-nav-up';
          up.title = 'Jump to Top';
          up.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 8l-6 6h12l-6-6z"></path></svg>';
          up.addEventListener('click', handleUpClick);

          arrows = { down, up };
          domArrowsRef.current = arrows;
        }

        if (!wrapper.contains(arrows.down)) wrapper.appendChild(arrows.down);
        if (!wrapper.contains(arrows.up)) wrapper.appendChild(arrows.up);

        arrows.down.classList.toggle('sl-visible', showDown);
        arrows.up.classList.toggle('sl-visible', showUp);

        return () => {
          if (arrows.down.isConnected) arrows.down.remove();
          if (arrows.up.isConnected) arrows.up.remove();
        };
      }, [wrapper, showDown, showUp, bindCount, handleDownClick, handleUpClick]);

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
        z-index: 500;
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
