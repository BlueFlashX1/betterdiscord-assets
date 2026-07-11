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

module.exports = { getScrollerPair, createArrowElement };
