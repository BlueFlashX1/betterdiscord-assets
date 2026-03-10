const EDGE_THRESHOLD = 100;
const POLL_INTERVAL_MS = 2000;

function findScrollerElements() {
  const wrapper =
    document.querySelector('div[class*="messagesWrapper_"]') ||
    document.querySelector('div[class*="messagesWrapper-"]') ||
    document.querySelector('main[class*="chatContent"] > div > div[class*="scroller"]')?.parentElement;
  const scroller =
    wrapper?.querySelector('div[class*="scroller_"]') ||
    wrapper?.querySelector('div[class*="scroller-"]') ||
    wrapper?.querySelector('[class*="scrollerInner_"]')?.parentElement;
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
  const arrows = domArrowsRef.current;
  if (!arrows) return;
  if (arrows.down?.isConnected) arrows.down.remove();
  if (arrows.up?.isConnected) arrows.up.remove();
  domArrowsRef.current = null;
}

function useScrollerBinding(React, options) {
  const {
    pluginInstance,
    dbg,
    refs,
    setShowDown,
    setShowUp,
    setBindCount,
  } = options;
  const { scrollerRef, wrapperRef, pollRef, lastScrollLogRef } = refs;

  React.useEffect(() => {
    dbg("useEffect mounted");
    if (pluginInstance._isStopped) {
      dbg("BAIL: pluginInstance._isStopped");
      return undefined;
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
      if (now - lastScrollLogRef.current > 3000) {
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
      if (currentScroller?.isConnected) return;
      const { wrapper, scroller } = findScrollerElements();
      dbg("findScroller:", {
        wrapper: wrapper ? `<${wrapper.tagName} class="${(wrapper.className || "").slice(0, 60)}">` : null,
        scroller: scroller ? `<${scroller.tagName} class="${(scroller.className || "").slice(0, 60)}">` : null,
      });
      bindScroller(wrapper, scroller);
    };

    findAndBind();
    if (!currentScroller) {
      dbg("Initial bind failed — scheduling 150ms retry");
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
    handleUpClick,
  } = args;

  React.useEffect(() => {
    if (portalAvailable || !wrapperConnected || !wrapper) {
      removeDomArrows(domArrowsRef);
      return undefined;
    }

    let arrows = domArrowsRef.current;
    if (!arrows || !arrows.down?.isConnected) {
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
    domArrowsRef,
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
    handleUpClick,
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
          onClick: handleDownClick,
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
          onClick: handleUpClick,
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

function createArrowManagerComponent(BdApi, pluginInstance) {
  const React = BdApi.React;

  return function ArrowManager({ pluginInstance: injectedPlugin }) {
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
      setBindCount,
    });

    const handleDownClick = React.useCallback(() => {
      const wrapper = wrapperRef.current;
      const scroller = scrollerRef.current;
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
    }, []);

    const handleUpClick = React.useCallback(() => {
      const scroller = scrollerRef.current;
      if (scroller) scroller.scrollTop = 0;
    }, []);

    const wrapper = wrapperRef.current;
    const wrapperConnected = !!(wrapper && wrapper.isConnected);
    const portalAvailable = !!BdApi.ReactDOM?.createPortal;

    useDomArrowInjection(React, {
      portalAvailable,
      wrapperConnected,
      wrapper,
      bindCount,
      domArrowsRef,
      handleDownClick,
      handleUpClick,
    });

    useDomArrowVisibilitySync(React, {
      portalAvailable,
      showDown,
      showUp,
      bindCount,
      domArrowsRef,
    });

    dbg(
      `render: bindCount=${bindCount}, wrapper=${!!wrapper}, connected=${wrapper?.isConnected}, createPortal=${portalAvailable}, showDown=${showDown}, showUp=${showUp}`
    );

    if (wrapperConnected && portalAvailable) {
      dbg("render -> PORTAL path");
      return renderPortalArrows({
        React,
        ReactDOM: BdApi.ReactDOM,
        wrapper,
        showDown,
        showUp,
        handleDownClick,
        handleUpClick,
      });
    }

    if (!wrapper) dbg("render -> NULL (no wrapper yet, waiting for findAndBind)");
    return null;
  };
}

module.exports = { createArrowManagerComponent };
