const { getScrollerPair, createArrowElement } = require('./dom-helpers');
const { createTrackedTimers } = require('../shared/tracked-timers');
const EDGE_THRESHOLD = 100;

function setArrowVisible(el, isVisible) {
  if (!el) return;
  if (isVisible) el.classList.add("sl-visible");
  else el.classList.remove("sl-visible");
}

function updateArrowState(state) {
  const scroller = state?.currentScroller;
  if (!state || !scroller) return;
  const { scrollTop, scrollHeight, clientHeight } = scroller;
  const atBottom = scrollHeight - scrollTop - clientHeight < EDGE_THRESHOLD;
  const atTop = scrollTop < EDGE_THRESHOLD;
  setArrowVisible(state.downEl, !atBottom);
  setArrowVisible(state.upEl, !atTop);
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
  if (!state?.currentScroller || !state.scrollHandler) return;
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
    downEl: null,
    upEl: null,
    downClickHandler: null,
    upClickHandler: null,
    _timers: createTrackedTimers(),
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
    if (plugin._isStopped) return;
    if (document.hidden) return;
    if (state.currentScroller?.isConnected && state.currentWrapper?.isConnected) return;
    const { wrapper, scroller } = getScrollerPair();
    bindScroller(state, wrapper, scroller);
  };

  return state;
}

function stopDomFallback(plugin) {
  const state = plugin._domFallback;
  if (!state) return;

  if (state.store && state.storeListener) {
    try { state.store.removeChangeListener(state.storeListener); } catch (_) {}
    state.store = null;
    state.storeListener = null;
  }
  unbindScroller(state);
  state._timers.clearAll();
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

function startDomFallback(plugin) {
  stopDomFallback(plugin);
  plugin._domFallback = createFallbackState(plugin);
  plugin._domFallback.tick();
  // Event-driven re-bind — replaces the prior 2s setInterval. Channel
  // switches nuke the message scroller; SelectedChannelStore fires
  // exactly when that happens. tick() is idempotent and early-exits
  // when the cached scroller is still connected.
  try {
    const SelectedChannelStore = BdApi.Webpack.getStore?.("SelectedChannelStore");
    if (SelectedChannelStore && typeof SelectedChannelStore.addChangeListener === "function") {
      plugin._domFallback.storeListener = () => plugin._domFallback?.tick?.();
      SelectedChannelStore.addChangeListener(plugin._domFallback.storeListener);
      plugin._domFallback.store = SelectedChannelStore;
    }
  } catch (_) {}
  plugin._debugLog("Using DOM fallback mode");
}

module.exports = { startDomFallback, stopDomFallback };
