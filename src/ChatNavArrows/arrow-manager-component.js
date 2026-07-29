const { getScrollerPair, createArrowElement, computeArrowVisibility, jumpToPresent, jumpToChannelStart, createThrottledScrollHandler } = require('./dom-helpers');

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
  const { scrollerRef, wrapperRef, lastScrollLogRef } = refs;

  React.useEffect(() => {
    dbg("useEffect mounted");
    if (pluginInstance._isStopped) {
      dbg("BAIL: pluginInstance._isStopped");
      return undefined;
    }

    let currentScroller = null;
    let scrollHandler = null;
    let initialRetryTimer = null;

    const applyScrollState = (scroller) => {
      if (!scroller.isConnected) {
        dbg("scrollHandler: scroller disconnected");
        return;
      }
      const { showDown, showUp } = computeArrowVisibility(scroller);
      setShowDown(showDown);
      setShowUp(showUp);
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
        scrollHandler.cancel?.();
      }

      currentScroller = scroller;
      scrollerRef.current = scroller;
      wrapperRef.current = wrapper;
      if (wrapper) wrapper.style.position = "relative";

      scrollHandler = createThrottledScrollHandler(() => applyScrollState(scroller));

      scroller.addEventListener("scroll", scrollHandler, { passive: true });
      scrollHandler();
      setBindCount((count) => count + 1);
      dbg("findAndBind: bound, bindCount incremented");
    };

    const findAndBind = () => {
      if (currentScroller?.isConnected) return;
      const { wrapper, scroller } = getScrollerPair();
      dbg("findScroller:", {
        wrapper: wrapper ? `<${wrapper.tagName} class="${(wrapper.className || "").slice(0, 60)}">` : null,
        scroller: scroller ? `<${scroller.tagName} class="${(scroller.className || "").slice(0, 60)}">` : null,
      });
      bindScroller(wrapper, scroller);
    };

    findAndBind();
    if (!currentScroller) {
      dbg("Initial bind failed — scheduling 150ms retry");
      initialRetryTimer = setTimeout(findAndBind, 150);
    }

    // Event-driven re-bind — replaces the prior 2s setInterval that
    // polled findAndBind for scroller disconnection. Channel switches
    // are the only event that nukes the message scroller; subscribe
    // to SelectedChannelStore and let findAndBind run when the listener
    // fires. findAndBind itself early-exits if the scroller is still
    // valid, so re-firing is cheap.
    let storeListener = null;
    let store = null;
    try {
      const SelectedChannelStore = BdApi.Webpack.getStore?.("SelectedChannelStore");
      if (SelectedChannelStore && typeof SelectedChannelStore.addChangeListener === "function") {
        storeListener = () => findAndBind();
        SelectedChannelStore.addChangeListener(storeListener);
        store = SelectedChannelStore;
      }
    } catch (_) {}

    return () => {
      dbg("useEffect cleanup");
      if (initialRetryTimer) {
        clearTimeout(initialRetryTimer);
        initialRetryTimer = null;
      }
      if (currentScroller && scrollHandler) {
        currentScroller.removeEventListener("scroll", scrollHandler);
        scrollHandler.cancel?.();
      }
      if (store && storeListener) {
        try { store.removeChangeListener(storeListener); } catch (_) {}
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
    const domArrowsRef = React.useRef(null);
    const lastScrollLogRef = React.useRef(0);

    useScrollerBinding(React, {
      pluginInstance: activePlugin,
      dbg,
      refs: { scrollerRef, wrapperRef, lastScrollLogRef },
      setShowDown,
      setShowUp,
      setBindCount,
    });

    const handleDownClick = React.useCallback(() => {
      const wrapper = wrapperRef.current;
      const scroller = scrollerRef.current;
      if (!wrapper || !scroller) return;
      jumpToPresent(wrapper, scroller);
    }, []);

    const handleUpClick = React.useCallback(() => {
      jumpToChannelStart(scrollerRef.current);
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

    if (activePlugin._settings?.debug) dbg(
      `render: bindCount=${bindCount}, wrapper=${!!wrapper}, connected=${wrapper?.isConnected}, createPortal=${portalAvailable}, showDown=${showDown}, showUp=${showUp}`
    );

    if (wrapperConnected && portalAvailable) {
      if (activePlugin._settings?.debug) dbg("render -> PORTAL path");
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

    if (!wrapper && activePlugin._settings?.debug) dbg("render -> NULL (no wrapper yet, waiting for findAndBind)");
    return null;
  };
}

module.exports = { createArrowManagerComponent };
