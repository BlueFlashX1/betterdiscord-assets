/**
 * @name ChatNavArrows
 * @description Replaces the Jump to Present bar with a compact down-arrow button, and adds an up-arrow button to jump to the first message in the channel.
 * @version 2.0.1
 * @author Solo Leveling Theme Dev
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/ChatNavArrows/dom-fallback.js
var require_dom_fallback = __commonJS({
  "src/ChatNavArrows/dom-fallback.js"(exports2, module2) {
    var EDGE_THRESHOLD = 100;
    var POLL_INTERVAL_MS = 2e3;
    function getScrollerPair() {
      var _a, _b;
      const wrapper = document.querySelector('div[class*="messagesWrapper_"]') || document.querySelector('div[class*="messagesWrapper-"]') || ((_a = document.querySelector('main[class*="chatContent"] > div > div[class*="scroller"]')) == null ? void 0 : _a.parentElement);
      const scroller = (wrapper == null ? void 0 : wrapper.querySelector('div[class*="scroller_"]')) || (wrapper == null ? void 0 : wrapper.querySelector('div[class*="scroller-"]')) || ((_b = wrapper == null ? void 0 : wrapper.querySelector('[class*="scrollerInner_"]')) == null ? void 0 : _b.parentElement) || null;
      return { wrapper: wrapper || null, scroller };
    }
    function setArrowVisible(el, isVisible) {
      if (!el) return;
      if (isVisible) el.classList.add("sl-visible");
      else el.classList.remove("sl-visible");
    }
    function updateArrowState(state) {
      const scroller = state == null ? void 0 : state.currentScroller;
      if (!state || !scroller) return;
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const atBottom = scrollHeight - scrollTop - clientHeight < EDGE_THRESHOLD;
      const atTop = scrollTop < EDGE_THRESHOLD;
      setArrowVisible(state.downEl, !atBottom);
      setArrowVisible(state.upEl, !atTop);
    }
    function createArrowElement(className, title, svgPath, clickHandler) {
      const el = document.createElement("div");
      el.className = className;
      el.title = title;
      el.innerHTML = `<svg viewBox="0 0 24 24"><path d="${svgPath}"></path></svg>`;
      el.addEventListener("click", clickHandler);
      return el;
    }
    function ensureArrowElements(state, wrapper) {
      if (!state || !wrapper) return;
      wrapper.style.position = "relative";
      if (!state.downEl || !state.downEl.isConnected) {
        if (state.downEl && state.downClickHandler) {
          state.downEl.removeEventListener("click", state.downClickHandler);
        }
        state.downEl = createArrowElement(
          "sl-chat-nav-arrow sl-chat-nav-down",
          "Jump to Present",
          "M12 16l-6-6h12l-6 6z",
          state.downClickHandler
        );
      }
      if (!state.upEl || !state.upEl.isConnected) {
        if (state.upEl && state.upClickHandler) {
          state.upEl.removeEventListener("click", state.upClickHandler);
        }
        state.upEl = createArrowElement(
          "sl-chat-nav-arrow sl-chat-nav-up",
          "Jump to Top",
          "M12 8l-6 6h12l-6-6z",
          state.upClickHandler
        );
      }
      if (!wrapper.contains(state.downEl)) wrapper.appendChild(state.downEl);
      if (!wrapper.contains(state.upEl)) wrapper.appendChild(state.upEl);
    }
    function unbindScroller(state) {
      if (!(state == null ? void 0 : state.currentScroller) || !state.scrollHandler) return;
      state.currentScroller.removeEventListener("scroll", state.scrollHandler);
      state.currentScroller = null;
      state.scrollHandler = null;
    }
    function bindScroller(state, wrapper, scroller) {
      if (!state) return;
      if (state.currentScroller === scroller && state.currentWrapper === wrapper) {
        updateArrowState(state);
        return;
      }
      unbindScroller(state);
      state.currentWrapper = wrapper;
      state.currentScroller = scroller;
      if (!wrapper || !scroller) {
        if (state.downEl) setArrowVisible(state.downEl, false);
        if (state.upEl) setArrowVisible(state.upEl, false);
        return;
      }
      ensureArrowElements(state, wrapper);
      let scrollRafPending = false;
      state.scrollHandler = () => {
        if (scrollRafPending) return;
        scrollRafPending = true;
        requestAnimationFrame(() => {
          scrollRafPending = false;
          updateArrowState(state);
        });
      };
      scroller.addEventListener("scroll", state.scrollHandler, { passive: true });
      updateArrowState(state);
    }
    function createFallbackState(plugin) {
      const state = {
        currentWrapper: null,
        currentScroller: null,
        scrollHandler: null,
        pollTimer: null,
        downEl: null,
        upEl: null,
        downClickHandler: null,
        upClickHandler: null
      };
      state.downClickHandler = () => {
        const wrapper = state.currentWrapper;
        const scroller = state.currentScroller;
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
        updateArrowState(state);
      };
      state.upClickHandler = () => {
        const scroller = state.currentScroller;
        if (!scroller) return;
        scroller.scrollTop = 0;
        updateArrowState(state);
      };
      state.tick = () => {
        var _a, _b;
        if (plugin._isStopped) return;
        if (document.hidden) return;
        if (((_a = state.currentScroller) == null ? void 0 : _a.isConnected) && ((_b = state.currentWrapper) == null ? void 0 : _b.isConnected)) return;
        const { wrapper, scroller } = getScrollerPair();
        bindScroller(state, wrapper, scroller);
      };
      return state;
    }
    function stopDomFallback2(plugin) {
      const state = plugin._domFallback;
      if (!state) return;
      unbindScroller(state);
      if (state.pollTimer) clearInterval(state.pollTimer);
      if (state.downEl && state.downClickHandler) {
        state.downEl.removeEventListener("click", state.downClickHandler);
      }
      if (state.upEl && state.upClickHandler) {
        state.upEl.removeEventListener("click", state.upClickHandler);
      }
      if (state.downEl) state.downEl.remove();
      if (state.upEl) state.upEl.remove();
      plugin._domFallback = null;
    }
    function startDomFallback2(plugin) {
      stopDomFallback2(plugin);
      plugin._domFallback = createFallbackState(plugin);
      plugin._domFallback.tick();
      plugin._domFallback.pollTimer = setInterval(plugin._domFallback.tick, POLL_INTERVAL_MS);
      plugin._debugLog("Using DOM fallback mode");
    }
    module2.exports = { startDomFallback: startDomFallback2, stopDomFallback: stopDomFallback2 };
  }
});

// src/ChatNavArrows/arrow-manager-component.js
var require_arrow_manager_component = __commonJS({
  "src/ChatNavArrows/arrow-manager-component.js"(exports2, module2) {
    var EDGE_THRESHOLD = 100;
    var POLL_INTERVAL_MS = 2e3;
    function findScrollerElements() {
      var _a, _b;
      const wrapper = document.querySelector('div[class*="messagesWrapper_"]') || document.querySelector('div[class*="messagesWrapper-"]') || ((_a = document.querySelector('main[class*="chatContent"] > div > div[class*="scroller"]')) == null ? void 0 : _a.parentElement);
      const scroller = (wrapper == null ? void 0 : wrapper.querySelector('div[class*="scroller_"]')) || (wrapper == null ? void 0 : wrapper.querySelector('div[class*="scroller-"]')) || ((_b = wrapper == null ? void 0 : wrapper.querySelector('[class*="scrollerInner_"]')) == null ? void 0 : _b.parentElement);
      return { wrapper: wrapper || null, scroller: scroller || null };
    }
    function createArrowElement(className, title, pathD, clickHandler) {
      const el = document.createElement("div");
      el.className = className;
      el.title = title;
      el.innerHTML = `<svg viewBox="0 0 24 24"><path d="${pathD}"></path></svg>`;
      el.addEventListener("click", clickHandler);
      return el;
    }
    function removeDomArrows(domArrowsRef) {
      var _a, _b;
      const arrows = domArrowsRef.current;
      if (!arrows) return;
      if ((_a = arrows.down) == null ? void 0 : _a.isConnected) arrows.down.remove();
      if ((_b = arrows.up) == null ? void 0 : _b.isConnected) arrows.up.remove();
      domArrowsRef.current = null;
    }
    function useScrollerBinding(React, options) {
      const {
        pluginInstance,
        dbg,
        refs,
        setShowDown,
        setShowUp,
        setBindCount
      } = options;
      const { scrollerRef, wrapperRef, pollRef, lastScrollLogRef } = refs;
      React.useEffect(() => {
        dbg("useEffect mounted");
        if (pluginInstance._isStopped) {
          dbg("BAIL: pluginInstance._isStopped");
          return void 0;
        }
        let currentScroller = null;
        let scrollHandler = null;
        const applyScrollState = (scroller) => {
          if (!scroller.isConnected) {
            dbg("scrollHandler: scroller disconnected");
            return;
          }
          const { scrollTop, scrollHeight, clientHeight } = scroller;
          const atBottom = scrollHeight - scrollTop - clientHeight < EDGE_THRESHOLD;
          const atTop = scrollTop < EDGE_THRESHOLD;
          setShowDown(!atBottom);
          setShowUp(!atTop);
          const now = Date.now();
          if (now - lastScrollLogRef.current > 3e3) {
            lastScrollLogRef.current = now;
            dbg(
              `scroll: top=${scrollTop}, height=${scrollHeight}, client=${clientHeight}, atTop=${atTop}, atBottom=${atBottom}, showDown=${!atBottom}, showUp=${!atTop}`
            );
          }
        };
        const bindScroller = (wrapper, scroller) => {
          if (!scroller) {
            dbg("findAndBind: no scroller found");
            return;
          }
          dbg("findAndBind: binding new scroller (isConnected:", scroller.isConnected, ")");
          if (currentScroller && scrollHandler) {
            currentScroller.removeEventListener("scroll", scrollHandler);
          }
          currentScroller = scroller;
          scrollerRef.current = scroller;
          wrapperRef.current = wrapper;
          if (wrapper) wrapper.style.position = "relative";
          let scrollRafPending = false;
          scrollHandler = () => {
            if (scrollRafPending) return;
            scrollRafPending = true;
            requestAnimationFrame(() => {
              scrollRafPending = false;
              applyScrollState(scroller);
            });
          };
          scroller.addEventListener("scroll", scrollHandler, { passive: true });
          scrollHandler();
          setBindCount((count) => count + 1);
          dbg("findAndBind: bound, bindCount incremented");
        };
        const findAndBind = () => {
          if (currentScroller == null ? void 0 : currentScroller.isConnected) return;
          const { wrapper, scroller } = findScrollerElements();
          dbg("findScroller:", {
            wrapper: wrapper ? `<${wrapper.tagName} class="${(wrapper.className || "").slice(0, 60)}">` : null,
            scroller: scroller ? `<${scroller.tagName} class="${(scroller.className || "").slice(0, 60)}">` : null
          });
          bindScroller(wrapper, scroller);
        };
        findAndBind();
        if (!currentScroller) {
          dbg("Initial bind failed \u2014 scheduling 150ms retry");
          setTimeout(findAndBind, 150);
        }
        pollRef.current = setInterval(findAndBind, POLL_INTERVAL_MS);
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
    }
    function useDomArrowInjection(React, args) {
      const {
        portalAvailable,
        wrapperConnected,
        wrapper,
        bindCount,
        domArrowsRef,
        handleDownClick,
        handleUpClick
      } = args;
      React.useEffect(() => {
        var _a;
        if (portalAvailable || !wrapperConnected || !wrapper) {
          removeDomArrows(domArrowsRef);
          return void 0;
        }
        let arrows = domArrowsRef.current;
        if (!arrows || !((_a = arrows.down) == null ? void 0 : _a.isConnected)) {
          const down = createArrowElement(
            "sl-chat-nav-arrow sl-chat-nav-down",
            "Jump to Present",
            "M12 16l-6-6h12l-6 6z",
            handleDownClick
          );
          const up = createArrowElement(
            "sl-chat-nav-arrow sl-chat-nav-up",
            "Jump to Top",
            "M12 8l-6 6h12l-6-6z",
            handleUpClick
          );
          arrows = { down, up };
          domArrowsRef.current = arrows;
        }
        if (!wrapper.contains(arrows.down)) wrapper.appendChild(arrows.down);
        if (!wrapper.contains(arrows.up)) wrapper.appendChild(arrows.up);
        return () => removeDomArrows(domArrowsRef);
      }, [portalAvailable, wrapperConnected, wrapper, bindCount, handleDownClick, handleUpClick]);
    }
    function useDomArrowVisibilitySync(React, options) {
      const {
        portalAvailable,
        showDown,
        showUp,
        bindCount,
        domArrowsRef
      } = options;
      React.useEffect(() => {
        if (portalAvailable) return;
        const arrows = domArrowsRef.current;
        if (!arrows) return;
        arrows.down.classList.toggle("sl-visible", showDown);
        arrows.up.classList.toggle("sl-visible", showUp);
      }, [portalAvailable, showDown, showUp, bindCount]);
    }
    function renderPortalArrows(options) {
      const {
        React,
        ReactDOM,
        wrapper,
        showDown,
        showUp,
        handleDownClick,
        handleUpClick
      } = options;
      return ReactDOM.createPortal(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "div",
            {
              className: `sl-chat-nav-arrow sl-chat-nav-down${showDown ? " sl-visible" : ""}`,
              title: "Jump to Present",
              onClick: handleDownClick
            },
            React.createElement(
              "svg",
              { viewBox: "0 0 24 24" },
              React.createElement("path", { d: "M12 16l-6-6h12l-6 6z" })
            )
          ),
          React.createElement(
            "div",
            {
              className: `sl-chat-nav-arrow sl-chat-nav-up${showUp ? " sl-visible" : ""}`,
              title: "Jump to Top",
              onClick: handleUpClick
            },
            React.createElement(
              "svg",
              { viewBox: "0 0 24 24" },
              React.createElement("path", { d: "M12 8l-6 6h12l-6-6z" })
            )
          )
        ),
        wrapper
      );
    }
    function createArrowManagerComponent2(BdApi2, pluginInstance) {
      const React = BdApi2.React;
      return function ArrowManager({ pluginInstance: injectedPlugin }) {
        var _a;
        const activePlugin = injectedPlugin || pluginInstance;
        const dbg = (...args) => activePlugin._debugLog("[ArrowManager]", ...args);
        const [showDown, setShowDown] = React.useState(false);
        const [showUp, setShowUp] = React.useState(false);
        const [bindCount, setBindCount] = React.useState(0);
        const scrollerRef = React.useRef(null);
        const wrapperRef = React.useRef(null);
        const pollRef = React.useRef(null);
        const domArrowsRef = React.useRef(null);
        const lastScrollLogRef = React.useRef(0);
        useScrollerBinding(React, {
          pluginInstance: activePlugin,
          dbg,
          refs: { scrollerRef, wrapperRef, pollRef, lastScrollLogRef },
          setShowDown,
          setShowUp,
          setBindCount
        });
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
        const portalAvailable = !!((_a = BdApi2.ReactDOM) == null ? void 0 : _a.createPortal);
        useDomArrowInjection(React, {
          portalAvailable,
          wrapperConnected,
          wrapper,
          bindCount,
          domArrowsRef,
          handleDownClick,
          handleUpClick
        });
        useDomArrowVisibilitySync(React, {
          portalAvailable,
          showDown,
          showUp,
          bindCount,
          domArrowsRef
        });
        dbg(
          `render: bindCount=${bindCount}, wrapper=${!!wrapper}, connected=${wrapper == null ? void 0 : wrapper.isConnected}, createPortal=${portalAvailable}, showDown=${showDown}, showUp=${showUp}`
        );
        if (wrapperConnected && portalAvailable) {
          dbg("render -> PORTAL path");
          return renderPortalArrows({
            React,
            ReactDOM: BdApi2.ReactDOM,
            wrapper,
            showDown,
            showUp,
            handleDownClick,
            handleUpClick
          });
        }
        if (!wrapper) dbg("render -> NULL (no wrapper yet, waiting for findAndBind)");
        return null;
      };
    }
    module2.exports = { createArrowManagerComponent: createArrowManagerComponent2 };
  }
});

// src/shared/bd-module-loader.js
var require_bd_module_loader = __commonJS({
  "src/shared/bd-module-loader.js"(exports2, module2) {
    function loadBdModuleFromPlugins2(fileName) {
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
        if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) {
          return candidate;
        }
      } catch (_) {
      }
      return null;
    }
    module2.exports = {
      loadBdModuleFromPlugins: loadBdModuleFromPlugins2
    };
  }
});

// src/shared/warn-once.js
var require_warn_once = __commonJS({
  "src/shared/warn-once.js"(exports2, module2) {
    function createWarnOnce2() {
      const warned = /* @__PURE__ */ new Set();
      return (key, message, detail = null) => {
        if (warned.has(key)) return;
        warned.add(key);
        detail !== null ? console.warn(message, detail) : console.warn(message);
      };
    }
    module2.exports = { createWarnOnce: createWarnOnce2 };
  }
});

// src/ChatNavArrows/styles.css
var styles_default = '/* Hide native jump-to-present bars globally */\ndiv[class^="jumpToPresentBar_"] {\n  display: none !important;\n}\n\n.sl-chat-nav-arrow {\n  position: absolute;\n  z-index: 500;\n  width: 36px;\n  height: 36px;\n  border-radius: 50%;\n  background: rgba(8, 10, 20, 0.92);\n  border: 1px solid rgba(138, 43, 226, 0.45);\n  color: #b48cff;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  transition: background 0.15s ease, border-color 0.15s ease,\n              box-shadow 0.15s ease, transform 0.15s ease,\n              opacity 0.2s ease;\n  box-shadow: 0 2px 8px rgba(0,0,0,0.3);\n  right: 24px;\n  pointer-events: none;\n  opacity: 0;\n}\n.sl-chat-nav-arrow.sl-visible {\n  opacity: 1;\n  pointer-events: auto;\n}\n.sl-chat-nav-arrow:hover {\n  background: rgba(138, 43, 226, 0.2);\n  border-color: #8a2be2;\n  box-shadow: 0 0 12px rgba(138, 43, 226, 0.35);\n  transform: scale(1.1);\n}\n.sl-chat-nav-arrow:active {\n  transform: scale(0.95);\n}\n.sl-chat-nav-arrow svg {\n  width: 18px;\n  height: 18px;\n  fill: currentColor;\n}\n.sl-chat-nav-down {\n  bottom: 24px;\n}\n.sl-chat-nav-up {\n  bottom: 68px;\n}\n';

// src/ChatNavArrows/index.js
var { startDomFallback, stopDomFallback } = require_dom_fallback();
var { createArrowManagerComponent } = require_arrow_manager_component();
var { loadBdModuleFromPlugins } = require_bd_module_loader();
var { createWarnOnce } = require_warn_once();
module.exports = class ChatNavArrows {
  constructor() {
    this._patcherId = "ChatNavArrows";
    this._isStopped = false;
    this._domFallback = null;
    this._settings = Object.assign({ debug: false }, BdApi.Data.load("ChatNavArrows", "settings"));
    this._warnOnce = createWarnOnce();
  }
  // ==========================================================================
  // 1) LIFECYCLE + SETTINGS
  // ==========================================================================
  _debugLog(...args) {
    if (!this._settings.debug) return;
    console.log("[ChatNavArrows:DEBUG]", ...args);
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
    this._warnOnce = createWarnOnce();
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
      ReactUtils = loadBdModuleFromPlugins("BetterDiscordReactUtils.js");
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
    startDomFallback(this);
  }
  _stopDomFallback() {
    stopDomFallback(this);
  }
  // ==========================================================================
  // 3) ARROW MANAGER COMPONENT
  // ==========================================================================
  get _ArrowManager() {
    if (this.__ArrowManagerCached) return this.__ArrowManagerCached;
    this.__ArrowManagerCached = createArrowManagerComponent(BdApi, this);
    return this.__ArrowManagerCached;
  }
};
