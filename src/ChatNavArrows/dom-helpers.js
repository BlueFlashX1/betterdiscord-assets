const dc = require('../shared/discord-classes');

// Shared between the React portal path (arrow-manager-component.js) and the
// DOM-fallback path (dom-fallback.js) so a future selector update only needs
// to happen once.

function getScrollerPair() {
  const wrapper =
    document.querySelector(`div${dc.sel.messagesWrapper}`) ||
    document.querySelector('div[class*="messagesWrapper-"]') ||
    document.querySelector(`main${dc.sel.chatContent} > div > div${dc.sel.scroller}`)?.parentElement;
  const scroller =
    wrapper?.querySelector(`div${dc.sel.scroller}`) ||
    wrapper?.querySelector('div[class*="scroller-"]') ||
    wrapper?.querySelector(dc.sel.scrollerInner)?.parentElement ||
    null;
  return { wrapper: wrapper || null, scroller };
}

function createArrowElement(className, title, pathD, clickHandler) {
  const el = document.createElement("div");
  el.className = className;
  el.title = title;
  el.innerHTML = `<svg viewBox="0 0 24 24"><path d="${pathD}"></path></svg>`;
  el.addEventListener("click", clickHandler);
  return el;
}

// Shared by BOTH arrow paths (React portal + DOM fallback) — keep the edge
// math and jump-to-present semantics identical between them.
const EDGE_THRESHOLD = 100;

function computeArrowVisibility(scroller) {
  const { scrollTop, scrollHeight, clientHeight } = scroller;
  return {
    showDown: scrollHeight - scrollTop - clientHeight >= EDGE_THRESHOLD,
    showUp: scrollTop >= EDGE_THRESHOLD,
  };
}

// Click Discord's native jump-to-present button when available (preserves
// unread-clearing semantics); manual scroll to bottom otherwise.
function jumpToPresent(wrapper, scroller) {
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
}

// Scroll-driven arrow updates, rAF-coalesced AND min-interval gated.
// Why the gate (profiler 2026-07-29): with the channel pinned to bottom,
// Discord fires a scroll event per appended message; during message storms
// the per-frame geometry read runs against a freshly-mutated layout and
// forces a full reflow of the message list (measured 685ms worst single
// rAF callback). Arrow visibility doesn't need 60fps — 200ms max cadence
// with a trailing call (final state always lands after scrolling stops).
function createThrottledScrollHandler(run, intervalMs = 200) {
  let rafPending = false;
  let trailingTimer = null;
  let lastRun = 0;
  const invoke = () => {
    lastRun = performance.now();
    run();
  };
  const handler = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const since = performance.now() - lastRun;
      if (since >= intervalMs) {
        invoke();
      } else {
        clearTimeout(trailingTimer);
        trailingTimer = setTimeout(invoke, intervalMs - since);
      }
    });
  };
  handler.cancel = () => clearTimeout(trailingTimer);
  return handler;
}

module.exports = { getScrollerPair, createArrowElement, EDGE_THRESHOLD, computeArrowVisibility, jumpToPresent, createThrottledScrollHandler };
