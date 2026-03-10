import STYLES from "./styles.css";

/**
 * TABLE OF CONTENTS
 * 1) Lifecycle + Settings
 * 2) React Patcher + DOM Fallback
 * 3) Arrow Manager Component
 */

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
function _bdLoad(fileName) {
  if (!fileName) return null;
  try {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), 'utf8');
    const moduleObj = { exports: {} };
    const factory = new Function(
      'module',
      'exports',
      'require',
      'BdApi',
      `${source}\nreturn module.exports || exports || null;`
    );
    const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
    const candidate = loaded || moduleObj.exports;
    if (typeof candidate === 'function') return candidate;
    if (candidate && typeof candidate === 'object' && Object.keys(candidate).length > 0) return candidate;
  } catch (_) {}
  return null;
}

module.exports = class ChatNavArrows {
  constructor() {
    this._patcherId = 'ChatNavArrows';
    this._isStopped = false;
    this._domFallback = null;
    this._settings = Object.assign({ debug: false }, BdApi.Data.load('ChatNavArrows', 'settings'));
    this._warnedMessages = new Set();
  }

  // ==========================================================================
  // 1) LIFECYCLE + SETTINGS
  // ==========================================================================

  _debugLog(...args) {
    if (!this._settings.debug) return;
    console.log('[ChatNavArrows:DEBUG]', ...args);
  }

  _warnOnce(key, message, detail = null) {
    if (this._warnedMessages.has(key)) return;
    this._warnedMessages.add(key);
    if (detail !== null) {
      console.warn(message, detail);
      return;
    }
    console.warn(message);
  }

  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = 'padding:12px;background:#1e1e2e;border-radius:8px;color:#cdd6f4;font-family:system-ui,sans-serif';

    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = this._settings.debug;
    cb.addEventListener('change', () => {
      this._settings.debug = cb.checked;
      BdApi.Data.save('ChatNavArrows', 'settings', this._settings);
    });

    row.appendChild(cb);
    row.appendChild(document.createTextNode('Debug Mode — log arrow diagnostics to console'));
    panel.appendChild(row);
    return panel;
  }

  start() {
    // Idempotent start: clear stale patch/fallback if plugin is reloaded quickly.
    this._stopDomFallback();
    BdApi.Patcher.unpatchAll(this._patcherId);
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }

    this._isStopped = false;
    this._patcherCallbackFired = false;
    this._warnedMessages.clear();
    BdApi.DOM.addStyle('sl-chat-nav-arrows-css', STYLES);
    this._debugLog('start() called');
    const reactPatched = this._installReactPatcher();
    this._debugLog('React patcher result:', reactPatched);
    if (!reactPatched) {
      this._debugLog('Falling back to DOM mode immediately');
      this._startDomFallback();
    } else {
      // React patcher installed, but MainContent may have already rendered.
      // Attempt to force a re-render so the patcher callback fires.
      requestAnimationFrame(() => {
        if (this._patcherCallbackFired || this._isStopped) return;
        this._debugLog('Patcher callback not yet fired — attempting force re-render');
        this._forceAppRerender();
      });
      // Safety net: if patcher callback still hasn't fired after 2s, start DOM fallback
      this._fallbackTimer = setTimeout(() => {
        if (!this._patcherCallbackFired && !this._isStopped) {
          this._debugLog('Patcher callback not fired after 2s — starting DOM fallback as safety net');
          this._startDomFallback();
        }
      }, 2000);
    }
  }

  stop() {
    this._isStopped = true;
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
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

  /**
   * Walk up the React Fiber tree from #app-mount and call forceUpdate on the
   * first class component found. This nudges MainContent to re-render so our
   * patcher callback fires at least once.
   */
  _forceAppRerender() {
    try {
      const node = document.getElementById('app-mount');
      if (!node) { this._debugLog('forceRerender: #app-mount not found'); return; }
      const fiberKey = Object.keys(node).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) { this._debugLog('forceRerender: no fiber key on #app-mount'); return; }
      let fiber = node[fiberKey];
      let attempts = 0;
      while (fiber && attempts < 50) {
        attempts++;
        if (fiber.stateNode?.forceUpdate) {
          fiber.stateNode.forceUpdate();
          this._debugLog(`forceRerender: forceUpdate called (depth ${attempts})`);
          return;
        }
        fiber = fiber.return;
      }
      this._debugLog(`forceRerender: no forceUpdate-able node found (walked ${attempts} fibers)`);
    } catch (e) {
      this._debugLog('forceRerender error:', e.message);
    }
  }

  // ==========================================================================
  // 2) REACT PATCHER + DOM FALLBACK
  // ==========================================================================

  _installReactPatcher() {
    let ReactUtils;
    try {
      ReactUtils = _bdLoad('BetterDiscordReactUtils.js');
    } catch (e) {
      this._debugLog('ReactUtils load error:', e.message);
      ReactUtils = null;
    }
    this._debugLog('ReactUtils loaded:', !!ReactUtils);

    if (!ReactUtils?.patchReactMainContent || !ReactUtils?.injectReactComponent) {
      this._debugLog('ReactUtils unavailable for patching — using DOM fallback');
      return false;
    }

    const pluginInstance = this;
    let patcherCallCount = 0;
    const ok = ReactUtils.patchReactMainContent(this, this._patcherId, (React, appNode, returnValue) => {
      patcherCallCount++;
      pluginInstance._patcherCallbackFired = true;
      if (pluginInstance._domFallback && patcherCallCount === 1) {
        pluginInstance._debugLog('Patcher callback fired — stopping DOM fallback');
        pluginInstance._stopDomFallback();
      }
      pluginInstance._debugLog(`Patcher callback #${patcherCallCount} — appNode:`, !!appNode, 'appNode.props:', !!appNode?.props);
      const component = React.createElement(pluginInstance._ArrowManager, {
        key: 'sl-chat-nav-arrows',
        pluginInstance,
      });
      const injected = ReactUtils.injectReactComponent(appNode, 'sl-chat-nav-arrows-root', component, returnValue);
      pluginInstance._debugLog(`injectReactComponent result: ${injected ? 'injected' : 'already exists (dedup)'}`);
    });

    this._debugLog('patchReactMainContent result:', ok);
    if (!ok) {
      this._warnOnce('maincontent-missing', '[ChatNavArrows] MainContent module not found — using DOM fallback');
      return false;
    }
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

      // PERF: RAF-coalesced scroll handler (was firing on every scroll event)
      let scrollRafPending = false;
      state.scrollHandler = () => {
        if (scrollRafPending) return;
        scrollRafPending = true;
        requestAnimationFrame(() => { scrollRafPending = false; updateArrowState(); });
      };
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
    this._debugLog('Using DOM fallback mode');
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

  // ==========================================================================
  // 3) ARROW MANAGER COMPONENT
  // ==========================================================================

  get _ArrowManager() {
    // Cache the component so React doesn't re-create it every render
    if (this.__ArrowManagerCached) return this.__ArrowManagerCached;

    const THRESHOLD = 100; // px from edge to show/hide arrows
    const POLL_INTERVAL = 2000; // ms to check for scroller changes (was 500ms)

    this.__ArrowManagerCached = ({ pluginInstance }) => {
      const React = BdApi.React;
      const dbg = (...a) => pluginInstance._debugLog('[ArrowManager]', ...a);
      const [showDown, setShowDown] = React.useState(false);
      const [showUp, setShowUp] = React.useState(false);
      // bindCount forces a re-render whenever findAndBind discovers a new scroller.
      const [bindCount, setBindCount] = React.useState(0);
      const scrollerRef = React.useRef(null);
      const wrapperRef = React.useRef(null);
      const pollRef = React.useRef(null);
      // Track DOM-injected arrows for cleanup when createPortal unavailable
      const domArrowsRef = React.useRef(null);
      // Throttle scroll diagnostics (max once per 3s)
      const lastScrollLogRef = React.useRef(0);

      React.useEffect(() => {
        dbg('useEffect mounted');
        if (pluginInstance._isStopped) { dbg('BAIL: pluginInstance._isStopped'); return; }

        let currentScroller = null;
        let scrollHandler = null;

        const findScroller = () => {
          const sel1 = 'div[class*="messagesWrapper_"]';
          const sel2 = 'div[class*="messagesWrapper-"]';
          const sel3 = 'main[class*="chatContent"] > div > div[class*="scroller"]';
          const wrapper =
            document.querySelector(sel1) ||
            document.querySelector(sel2) ||
            document.querySelector(sel3)?.parentElement;
          const scroller =
            wrapper?.querySelector('div[class*="scroller_"]') ||
            wrapper?.querySelector('div[class*="scroller-"]') ||
            wrapper?.querySelector('[class*="scrollerInner_"]')?.parentElement;
          dbg('findScroller:', {
            wrapper: wrapper ? `<${wrapper.tagName} class="${(wrapper.className || '').slice(0,60)}">` : null,
            scroller: scroller ? `<${scroller.tagName} class="${(scroller.className || '').slice(0,60)}">` : null,
          });
          return { wrapper: wrapper || null, scroller: scroller || null };
        };

        const findAndBind = () => {
          const { wrapper, scroller } = findScroller();
          if (!scroller) { dbg('findAndBind: no scroller found'); return; }
          // Same scroller still connected — no rebind needed
          if (scroller === currentScroller && scroller.isConnected) return;

          dbg('findAndBind: binding new scroller (isConnected:', scroller.isConnected, ')');

          // Unbind previous
          if (currentScroller && scrollHandler) {
            currentScroller.removeEventListener('scroll', scrollHandler);
          }

          currentScroller = scroller;
          scrollerRef.current = scroller;
          wrapperRef.current = wrapper;

          // Ensure wrapper is position:relative for absolute arrow positioning
          if (wrapper) wrapper.style.position = 'relative';

          // PERF: RAF-coalesced scroll handler (was firing on every scroll event)
          let scrollRafPending = false;
          const scrollWork = () => {
            if (!scroller.isConnected) { dbg('scrollHandler: scroller disconnected'); return; }
            const { scrollTop, scrollHeight, clientHeight } = scroller;
            const atBottom = scrollHeight - scrollTop - clientHeight < THRESHOLD;
            const atTop = scrollTop < THRESHOLD;
            setShowDown(!atBottom);
            setShowUp(!atTop);
            // Throttled scroll diagnostics
            const now = Date.now();
            if (now - lastScrollLogRef.current > 3000) {
              lastScrollLogRef.current = now;
              dbg(`scroll: top=${scrollTop}, height=${scrollHeight}, client=${clientHeight}, atTop=${atTop}, atBottom=${atBottom}, showDown=${!atBottom}, showUp=${!atTop}`);
            }
          };
          scrollHandler = () => {
            if (scrollRafPending) return;
            scrollRafPending = true;
            requestAnimationFrame(() => { scrollRafPending = false; scrollWork(); });
          };

          scroller.addEventListener('scroll', scrollHandler, { passive: true });
          scrollHandler(); // Initial check
          // Force re-render so the portal/DOM path can pick up the new wrapper
          setBindCount(c => c + 1);
          dbg('findAndBind: bound, bindCount incremented');
        };

        // Find scroller immediately; retry quickly if DOM isn't ready yet
        findAndBind();
        if (!currentScroller) {
          dbg('Initial bind failed — scheduling 150ms retry');
          setTimeout(findAndBind, 150);
        }
        pollRef.current = setInterval(findAndBind, POLL_INTERVAL);

        return () => {
          dbg('useEffect cleanup');
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
      const wrapperConnected = !!(wrapper && wrapper.isConnected);
      const portalAvailable = !!BdApi.ReactDOM?.createPortal;

      // DOM fallback path must use stable hook order (no conditional hooks).
      React.useEffect(() => {
        const removeArrows = () => {
          const arrows = domArrowsRef.current;
          if (!arrows) return;
          if (arrows.down?.isConnected) arrows.down.remove();
          if (arrows.up?.isConnected) arrows.up.remove();
          domArrowsRef.current = null;
        };

        if (portalAvailable || !wrapperConnected || !wrapper) {
          removeArrows();
          return;
        }

        let arrows = domArrowsRef.current;
        if (!arrows || !arrows.down?.isConnected) {
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

        return () => {
          if (!domArrowsRef.current) return;
          if (domArrowsRef.current.down?.isConnected) domArrowsRef.current.down.remove();
          if (domArrowsRef.current.up?.isConnected) domArrowsRef.current.up.remove();
          domArrowsRef.current = null;
        };
      }, [portalAvailable, wrapperConnected, wrapper, bindCount, handleDownClick, handleUpClick]);

      React.useEffect(() => {
        if (portalAvailable) return;
        const arrows = domArrowsRef.current;
        if (!arrows) return;
        arrows.down.classList.toggle('sl-visible', showDown);
        arrows.up.classList.toggle('sl-visible', showUp);
      }, [portalAvailable, showDown, showUp, bindCount]);

      // ── Render path diagnostics ──
      dbg(`render: bindCount=${bindCount}, wrapper=${!!wrapper}, connected=${wrapper?.isConnected}, createPortal=${portalAvailable}, showDown=${showDown}, showUp=${showUp}`);

      // ── Portal path (preferred) ──
      if (wrapperConnected && portalAvailable) {
        dbg('render → PORTAL path');
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

      if (!wrapper) dbg('render → NULL (no wrapper yet, waiting for findAndBind)');
      return null;
    };

    return this.__ArrowManagerCached;
  }
};
