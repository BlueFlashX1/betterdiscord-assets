/**
 * @name ChatNavArrows
 * @description Replaces the Jump to Present bar with a compact down-arrow button, and adds an up-arrow button to jump to the first message in the channel.
 * @version 2.0.1
 * @author Solo Leveling Theme Dev
 */

// src/ChatNavArrows/styles.css
var styles_default = '/* Hide native jump-to-present bars globally */\ndiv[class^="jumpToPresentBar_"] {\n  display: none !important;\n}\n\n.sl-chat-nav-arrow {\n  position: absolute;\n  z-index: 500;\n  width: 36px;\n  height: 36px;\n  border-radius: 50%;\n  background: rgba(8, 10, 20, 0.92);\n  border: 1px solid rgba(138, 43, 226, 0.45);\n  color: #b48cff;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  transition: background 0.15s ease, border-color 0.15s ease,\n              box-shadow 0.15s ease, transform 0.15s ease,\n              opacity 0.2s ease;\n  box-shadow: 0 2px 8px rgba(0,0,0,0.3);\n  right: 24px;\n  pointer-events: none;\n  opacity: 0;\n}\n.sl-chat-nav-arrow.sl-visible {\n  opacity: 1;\n  pointer-events: auto;\n}\n.sl-chat-nav-arrow:hover {\n  background: rgba(138, 43, 226, 0.2);\n  border-color: #8a2be2;\n  box-shadow: 0 0 12px rgba(138, 43, 226, 0.35);\n  transform: scale(1.1);\n}\n.sl-chat-nav-arrow:active {\n  transform: scale(0.95);\n}\n.sl-chat-nav-arrow svg {\n  width: 18px;\n  height: 18px;\n  fill: currentColor;\n}\n.sl-chat-nav-down {\n  bottom: 24px;\n}\n.sl-chat-nav-up {\n  bottom: 68px;\n}\n';

// src/ChatNavArrows/index.js
function _bdLoad(fileName) {
  if (!fileName) return null;
  try {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), "utf8");
    const moduleObj = { exports: {} };
    const factory = new Function(
      "module",
      "exports",
      "require",
      "BdApi",
      `${source}
return module.exports || exports || null;`
    );
    const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
    const candidate = loaded || moduleObj.exports;
    if (typeof candidate === "function") return candidate;
    if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) return candidate;
  } catch (_) {
  }
  return null;
}
module.exports = class ChatNavArrows {
  constructor() {
    this._patcherId = "ChatNavArrows";
    this._isStopped = false;
    this._domFallback = null;
    this._settings = Object.assign({ debug: false }, BdApi.Data.load("ChatNavArrows", "settings"));
    this._warnedMessages = /* @__PURE__ */ new Set();
  }
  // ==========================================================================
  // 1) LIFECYCLE + SETTINGS
  // ==========================================================================
  _debugLog(...args) {
    if (!this._settings.debug) return;
    console.log("[ChatNavArrows:DEBUG]", ...args);
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
    const panel = document.createElement("div");
    panel.style.cssText = "padding:12px;background:#1e1e2e;border-radius:8px;color:#cdd6f4;font-family:system-ui,sans-serif";
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = this._settings.debug;
    cb.addEventListener("change", () => {
      this._settings.debug = cb.checked;
      BdApi.Data.save("ChatNavArrows", "settings", this._settings);
    });
    row.appendChild(cb);
    row.appendChild(document.createTextNode("Debug Mode \u2014 log arrow diagnostics to console"));
    panel.appendChild(row);
    return panel;
  }
  start() {
    this._stopDomFallback();
    BdApi.Patcher.unpatchAll(this._patcherId);
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
    this._isStopped = false;
    this._patcherCallbackFired = false;
    this._warnedMessages.clear();
    BdApi.DOM.addStyle("sl-chat-nav-arrows-css", styles_default);
    this._debugLog("start() called");
    const reactPatched = this._installReactPatcher();
    this._debugLog("React patcher result:", reactPatched);
    if (!reactPatched) {
      this._debugLog("Falling back to DOM mode immediately");
      this._startDomFallback();
    } else {
      requestAnimationFrame(() => {
        if (this._patcherCallbackFired || this._isStopped) return;
        this._debugLog("Patcher callback not yet fired \u2014 attempting force re-render");
        this._forceAppRerender();
      });
      this._fallbackTimer = setTimeout(() => {
        if (!this._patcherCallbackFired && !this._isStopped) {
          this._debugLog("Patcher callback not fired after 2s \u2014 starting DOM fallback as safety net");
          this._startDomFallback();
        }
      }, 2e3);
    }
  }
  stop() {
    this._isStopped = true;
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
    BdApi.Patcher.unpatchAll(this._patcherId);
    BdApi.DOM.removeStyle("sl-chat-nav-arrows-css");
    this._stopDomFallback();
    document.querySelectorAll('div[class^="jumpToPresentBar_"]').forEach((bar) => {
      bar.style.display = "";
    });
    document.querySelectorAll(".sl-chat-nav-arrow").forEach((el) => el.remove());
  }
  /**
   * Walk up the React Fiber tree from #app-mount and call forceUpdate on the
   * first class component found. This nudges MainContent to re-render so our
   * patcher callback fires at least once.
   */
  _forceAppRerender() {
    var _a;
    try {
      const node = document.getElementById("app-mount");
      if (!node) {
        this._debugLog("forceRerender: #app-mount not found");
        return;
      }
      const fiberKey = Object.keys(node).find((k) => k.startsWith("__reactFiber"));
      if (!fiberKey) {
        this._debugLog("forceRerender: no fiber key on #app-mount");
        return;
      }
      let fiber = node[fiberKey];
      let attempts = 0;
      while (fiber && attempts < 50) {
        attempts++;
        if ((_a = fiber.stateNode) == null ? void 0 : _a.forceUpdate) {
          fiber.stateNode.forceUpdate();
          this._debugLog(`forceRerender: forceUpdate called (depth ${attempts})`);
          return;
        }
        fiber = fiber.return;
      }
      this._debugLog(`forceRerender: no forceUpdate-able node found (walked ${attempts} fibers)`);
    } catch (e) {
      this._debugLog("forceRerender error:", e.message);
    }
  }
  // ==========================================================================
  // 2) REACT PATCHER + DOM FALLBACK
  // ==========================================================================
  _installReactPatcher() {
    let ReactUtils;
    try {
      ReactUtils = _bdLoad("BetterDiscordReactUtils.js");
    } catch (e) {
      this._debugLog("ReactUtils load error:", e.message);
      ReactUtils = null;
    }
    this._debugLog("ReactUtils loaded:", !!ReactUtils);
    if (!(ReactUtils == null ? void 0 : ReactUtils.patchReactMainContent) || !(ReactUtils == null ? void 0 : ReactUtils.injectReactComponent)) {
      this._debugLog("ReactUtils unavailable for patching \u2014 using DOM fallback");
      return false;
    }
    const pluginInstance = this;
    let patcherCallCount = 0;
    const ok = ReactUtils.patchReactMainContent(this, this._patcherId, (React, appNode, returnValue) => {
      patcherCallCount++;
      pluginInstance._patcherCallbackFired = true;
      if (pluginInstance._domFallback && patcherCallCount === 1) {
        pluginInstance._debugLog("Patcher callback fired \u2014 stopping DOM fallback");
        pluginInstance._stopDomFallback();
      }
      pluginInstance._debugLog(`Patcher callback #${patcherCallCount} \u2014 appNode:`, !!appNode, "appNode.props:", !!(appNode == null ? void 0 : appNode.props));
      const component = React.createElement(pluginInstance._ArrowManager, {
        key: "sl-chat-nav-arrows",
        pluginInstance
      });
      const injected = ReactUtils.injectReactComponent(appNode, "sl-chat-nav-arrows-root", component, returnValue);
      pluginInstance._debugLog(`injectReactComponent result: ${injected ? "injected" : "already exists (dedup)"}`);
    });
    this._debugLog("patchReactMainContent result:", ok);
    if (!ok) {
      this._warnOnce("maincontent-missing", "[ChatNavArrows] MainContent module not found \u2014 using DOM fallback");
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
      upEl: null
    };
    const getScrollerPair = () => {
      var _a, _b;
      const wrapper = document.querySelector('div[class*="messagesWrapper_"]') || document.querySelector('div[class*="messagesWrapper-"]') || ((_a = document.querySelector('main[class*="chatContent"] > div > div[class*="scroller"]')) == null ? void 0 : _a.parentElement);
      const scroller = (wrapper == null ? void 0 : wrapper.querySelector('div[class*="scroller_"]')) || (wrapper == null ? void 0 : wrapper.querySelector('div[class*="scroller-"]')) || ((_b = wrapper == null ? void 0 : wrapper.querySelector('[class*="scrollerInner_"]')) == null ? void 0 : _b.parentElement) || null;
      return { wrapper: wrapper || null, scroller };
    };
    const setArrowVisible = (el, isVisible) => {
      if (!el) return;
      if (isVisible) el.classList.add("sl-visible");
      else el.classList.remove("sl-visible");
    };
    const updateArrowState = () => {
      const state = this._domFallback;
      const scroller = state == null ? void 0 : state.currentScroller;
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
      const wrapper = state == null ? void 0 : state.currentWrapper;
      const scroller = state == null ? void 0 : state.currentScroller;
      if (!wrapper || !scroller) return;
      const nativeBar = wrapper.querySelector('div[class^="jumpToPresentBar_"]');
      const nativeBtn = nativeBar ? nativeBar.querySelector("button") : null;
      if (nativeBtn) {
        nativeBar.style.display = "";
        nativeBtn.click();
        requestAnimationFrame(() => {
          nativeBar.style.display = "none";
        });
      } else {
        scroller.scrollTop = scroller.scrollHeight;
      }
      updateArrowState();
    };
    const handleUpClick = () => {
      var _a;
      const scroller = (_a = this._domFallback) == null ? void 0 : _a.currentScroller;
      if (!scroller) return;
      scroller.scrollTop = 0;
      updateArrowState();
    };
    const ensureArrowElements = (wrapper) => {
      const state = this._domFallback;
      if (!state || !wrapper) return;
      wrapper.style.position = "relative";
      if (!state.downEl || !state.downEl.isConnected) {
        if (state.downEl) state.downEl.removeEventListener("click", handleDownClick);
        state.downEl = document.createElement("div");
        state.downEl.className = "sl-chat-nav-arrow sl-chat-nav-down";
        state.downEl.title = "Jump to Present";
        state.downEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 16l-6-6h12l-6 6z"></path></svg>';
        state.downEl.addEventListener("click", handleDownClick);
      }
      if (!state.upEl || !state.upEl.isConnected) {
        if (state.upEl) state.upEl.removeEventListener("click", handleUpClick);
        state.upEl = document.createElement("div");
        state.upEl.className = "sl-chat-nav-arrow sl-chat-nav-up";
        state.upEl.title = "Jump to Top";
        state.upEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 8l-6 6h12l-6-6z"></path></svg>';
        state.upEl.addEventListener("click", handleUpClick);
      }
      if (!wrapper.contains(state.downEl)) wrapper.appendChild(state.downEl);
      if (!wrapper.contains(state.upEl)) wrapper.appendChild(state.upEl);
    };
    const unbindScroller = () => {
      const state = this._domFallback;
      if (!(state == null ? void 0 : state.currentScroller) || !state.scrollHandler) return;
      state.currentScroller.removeEventListener("scroll", state.scrollHandler);
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
      let scrollRafPending = false;
      state.scrollHandler = () => {
        if (scrollRafPending) return;
        scrollRafPending = true;
        requestAnimationFrame(() => {
          scrollRafPending = false;
          updateArrowState();
        });
      };
      scroller.addEventListener("scroll", state.scrollHandler, { passive: true });
      updateArrowState();
    };
    const tick = () => {
      if (this._isStopped) return;
      if (document.hidden) return;
      const { wrapper, scroller } = getScrollerPair();
      if (scroller === this._domFallback.currentScroller && (scroller == null ? void 0 : scroller.isConnected)) return;
      bindScroller(wrapper, scroller);
    };
    tick();
    this._domFallback.pollTimer = setInterval(tick, 2e3);
    this._debugLog("Using DOM fallback mode");
  }
  _stopDomFallback() {
    const state = this._domFallback;
    if (!state) return;
    if (state.currentScroller && state.scrollHandler) {
      state.currentScroller.removeEventListener("scroll", state.scrollHandler);
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
    if (this.__ArrowManagerCached) return this.__ArrowManagerCached;
    const THRESHOLD = 100;
    const POLL_INTERVAL = 2e3;
    this.__ArrowManagerCached = ({ pluginInstance }) => {
      var _a;
      const React = BdApi.React;
      const dbg = (...a) => pluginInstance._debugLog("[ArrowManager]", ...a);
      const [showDown, setShowDown] = React.useState(false);
      const [showUp, setShowUp] = React.useState(false);
      const [bindCount, setBindCount] = React.useState(0);
      const scrollerRef = React.useRef(null);
      const wrapperRef = React.useRef(null);
      const pollRef = React.useRef(null);
      const domArrowsRef = React.useRef(null);
      const lastScrollLogRef = React.useRef(0);
      React.useEffect(() => {
        dbg("useEffect mounted");
        if (pluginInstance._isStopped) {
          dbg("BAIL: pluginInstance._isStopped");
          return;
        }
        let currentScroller = null;
        let scrollHandler = null;
        const findScroller = () => {
          var _a2, _b;
          const sel1 = 'div[class*="messagesWrapper_"]';
          const sel2 = 'div[class*="messagesWrapper-"]';
          const sel3 = 'main[class*="chatContent"] > div > div[class*="scroller"]';
          const wrapper2 = document.querySelector(sel1) || document.querySelector(sel2) || ((_a2 = document.querySelector(sel3)) == null ? void 0 : _a2.parentElement);
          const scroller = (wrapper2 == null ? void 0 : wrapper2.querySelector('div[class*="scroller_"]')) || (wrapper2 == null ? void 0 : wrapper2.querySelector('div[class*="scroller-"]')) || ((_b = wrapper2 == null ? void 0 : wrapper2.querySelector('[class*="scrollerInner_"]')) == null ? void 0 : _b.parentElement);
          dbg("findScroller:", {
            wrapper: wrapper2 ? `<${wrapper2.tagName} class="${(wrapper2.className || "").slice(0, 60)}">` : null,
            scroller: scroller ? `<${scroller.tagName} class="${(scroller.className || "").slice(0, 60)}">` : null
          });
          return { wrapper: wrapper2 || null, scroller: scroller || null };
        };
        const findAndBind = () => {
          const { wrapper: wrapper2, scroller } = findScroller();
          if (!scroller) {
            dbg("findAndBind: no scroller found");
            return;
          }
          if (scroller === currentScroller && scroller.isConnected) return;
          dbg("findAndBind: binding new scroller (isConnected:", scroller.isConnected, ")");
          if (currentScroller && scrollHandler) {
            currentScroller.removeEventListener("scroll", scrollHandler);
          }
          currentScroller = scroller;
          scrollerRef.current = scroller;
          wrapperRef.current = wrapper2;
          if (wrapper2) wrapper2.style.position = "relative";
          let scrollRafPending = false;
          const scrollWork = () => {
            if (!scroller.isConnected) {
              dbg("scrollHandler: scroller disconnected");
              return;
            }
            const { scrollTop, scrollHeight, clientHeight } = scroller;
            const atBottom = scrollHeight - scrollTop - clientHeight < THRESHOLD;
            const atTop = scrollTop < THRESHOLD;
            setShowDown(!atBottom);
            setShowUp(!atTop);
            const now = Date.now();
            if (now - lastScrollLogRef.current > 3e3) {
              lastScrollLogRef.current = now;
              dbg(`scroll: top=${scrollTop}, height=${scrollHeight}, client=${clientHeight}, atTop=${atTop}, atBottom=${atBottom}, showDown=${!atBottom}, showUp=${!atTop}`);
            }
          };
          scrollHandler = () => {
            if (scrollRafPending) return;
            scrollRafPending = true;
            requestAnimationFrame(() => {
              scrollRafPending = false;
              scrollWork();
            });
          };
          scroller.addEventListener("scroll", scrollHandler, { passive: true });
          scrollHandler();
          setBindCount((c) => c + 1);
          dbg("findAndBind: bound, bindCount incremented");
        };
        findAndBind();
        if (!currentScroller) {
          dbg("Initial bind failed \u2014 scheduling 150ms retry");
          setTimeout(findAndBind, 150);
        }
        pollRef.current = setInterval(findAndBind, POLL_INTERVAL);
        return () => {
          dbg("useEffect cleanup");
          if (currentScroller && scrollHandler) {
            currentScroller.removeEventListener("scroll", scrollHandler);
          }
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        };
      }, []);
      const handleDownClick = React.useCallback(() => {
        const wrapper2 = wrapperRef.current;
        const scroller = scrollerRef.current;
        if (!wrapper2 || !scroller) return;
        const nativeBar = wrapper2.querySelector('div[class^="jumpToPresentBar_"]');
        const nativeBtn = nativeBar ? nativeBar.querySelector("button") : null;
        if (nativeBtn) {
          nativeBar.style.display = "";
          nativeBtn.click();
          requestAnimationFrame(() => {
            nativeBar.style.display = "none";
          });
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
      const portalAvailable = !!((_a = BdApi.ReactDOM) == null ? void 0 : _a.createPortal);
      React.useEffect(() => {
        var _a2;
        const removeArrows = () => {
          var _a3, _b;
          const arrows2 = domArrowsRef.current;
          if (!arrows2) return;
          if ((_a3 = arrows2.down) == null ? void 0 : _a3.isConnected) arrows2.down.remove();
          if ((_b = arrows2.up) == null ? void 0 : _b.isConnected) arrows2.up.remove();
          domArrowsRef.current = null;
        };
        if (portalAvailable || !wrapperConnected || !wrapper) {
          removeArrows();
          return;
        }
        let arrows = domArrowsRef.current;
        if (!arrows || !((_a2 = arrows.down) == null ? void 0 : _a2.isConnected)) {
          const down = document.createElement("div");
          down.className = "sl-chat-nav-arrow sl-chat-nav-down";
          down.title = "Jump to Present";
          down.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 16l-6-6h12l-6 6z"></path></svg>';
          down.addEventListener("click", handleDownClick);
          const up = document.createElement("div");
          up.className = "sl-chat-nav-arrow sl-chat-nav-up";
          up.title = "Jump to Top";
          up.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 8l-6 6h12l-6-6z"></path></svg>';
          up.addEventListener("click", handleUpClick);
          arrows = { down, up };
          domArrowsRef.current = arrows;
        }
        if (!wrapper.contains(arrows.down)) wrapper.appendChild(arrows.down);
        if (!wrapper.contains(arrows.up)) wrapper.appendChild(arrows.up);
        return () => {
          var _a3, _b;
          if (!domArrowsRef.current) return;
          if ((_a3 = domArrowsRef.current.down) == null ? void 0 : _a3.isConnected) domArrowsRef.current.down.remove();
          if ((_b = domArrowsRef.current.up) == null ? void 0 : _b.isConnected) domArrowsRef.current.up.remove();
          domArrowsRef.current = null;
        };
      }, [portalAvailable, wrapperConnected, wrapper, bindCount, handleDownClick, handleUpClick]);
      React.useEffect(() => {
        if (portalAvailable) return;
        const arrows = domArrowsRef.current;
        if (!arrows) return;
        arrows.down.classList.toggle("sl-visible", showDown);
        arrows.up.classList.toggle("sl-visible", showUp);
      }, [portalAvailable, showDown, showUp, bindCount]);
      dbg(`render: bindCount=${bindCount}, wrapper=${!!wrapper}, connected=${wrapper == null ? void 0 : wrapper.isConnected}, createPortal=${portalAvailable}, showDown=${showDown}, showUp=${showUp}`);
      if (wrapperConnected && portalAvailable) {
        dbg("render \u2192 PORTAL path");
        return BdApi.ReactDOM.createPortal(
          React.createElement(
            React.Fragment,
            null,
            React.createElement("div", {
              className: `sl-chat-nav-arrow sl-chat-nav-down${showDown ? " sl-visible" : ""}`,
              title: "Jump to Present",
              onClick: handleDownClick
            }, React.createElement(
              "svg",
              { viewBox: "0 0 24 24" },
              React.createElement("path", { d: "M12 16l-6-6h12l-6 6z" })
            )),
            React.createElement("div", {
              className: `sl-chat-nav-arrow sl-chat-nav-up${showUp ? " sl-visible" : ""}`,
              title: "Jump to Top",
              onClick: handleUpClick
            }, React.createElement(
              "svg",
              { viewBox: "0 0 24 24" },
              React.createElement("path", { d: "M12 8l-6 6h12l-6-6z" })
            ))
          ),
          wrapper
        );
      }
      if (!wrapper) dbg("render \u2192 NULL (no wrapper yet, waiting for findAndBind)");
      return null;
    };
    return this.__ArrowManagerCached;
  }
};
