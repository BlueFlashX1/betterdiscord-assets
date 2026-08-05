/**
 * @name CallButtonGuard
 * @description Adds a small toggle button to channel headers that have a
 *              "Start Voice Call" / "Start Video Call" button (DMs +
 *              group DMs). Click to collapse / expand those call buttons
 *              so you can't fat-finger them. State persists across reloads.
 * @version 1.0.0
 * @author Curio
 */

/* global BdApi */

const PLUGIN_NAME = "CallButtonGuard";
const STYLE_ID = "cbg-styles";
const BUTTON_ID = "cbg-toggle-button";
const COLLAPSED_BODY_ATTR = "data-cbg-calls-collapsed";

const CSS = `
/* When collapsed, hide every "Start Voice Call" / "Start Video Call"
   button anywhere on the page. Aria-label match works in DMs (where
   they live in the channel header toolbar) AND in any other surface
   Discord might surface them.

   Belt-and-suspenders coverage:
     1. The aria-labeled element itself
     2. Any direct parent that wraps it (Discord sometimes puts an
        extra flex <li> / <div> around the icon wrapper, and hiding
        only the wrapper would leave that parent occupying flex space)
     3. Substring fallback in case Discord changes the exact text
        ("Start Voice Call" → "Voice Call" / "Begin Voice Call" / etc.) */
body[${COLLAPSED_BODY_ATTR}="true"] [aria-label="Start Voice Call"],
body[${COLLAPSED_BODY_ATTR}="true"] [aria-label="Start Video Call"],
body[${COLLAPSED_BODY_ATTR}="true"] [aria-label*="oice Call" i],
body[${COLLAPSED_BODY_ATTR}="true"] [aria-label*="ideo Call" i],
body[${COLLAPSED_BODY_ATTR}="true"] [class*="toolbar_"] > :has(> [aria-label*="oice Call" i]),
body[${COLLAPSED_BODY_ATTR}="true"] [class*="toolbar_"] > :has(> [aria-label*="ideo Call" i]) {
  display: none !important;
  visibility: hidden !important;
  width: 0 !important;
  pointer-events: none !important;
}

/* The toggle button itself — small icon-button matching Discord's
   toolbar button visual weight. Solo Leveling violet for the active
   "expanded" state; danger red for the "collapsed / locked" state. */
#${BUTTON_ID} {
  appearance: none;
  background: transparent;
  border: none;
  width: 32px;
  height: 32px;
  margin: 0 2px;
  padding: 4px;
  cursor: pointer;
  color: #b5bac1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: color 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
}
#${BUTTON_ID}:hover {
  color: #fff;
  background: rgba(138, 43, 226, 0.15);
}
#${BUTTON_ID}[data-collapsed="true"] {
  color: #f87171;
}
#${BUTTON_ID}[data-collapsed="true"]:hover {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.15);
}
#${BUTTON_ID} svg {
  width: 20px;
  height: 20px;
  display: block;
}
`;

const SVG_NS = "http://www.w3.org/2000/svg";

// Build the phone receiver path used in both states. Returns an <svg>
// DOM element ready to appendChild. No innerHTML; pure createElementNS
// so there's no parser path that could execute markup.
function _buildPhoneSvg(collapsed) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  if (collapsed) {
    // Phone with broken receiver shape (collapsed glyph).
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute(
      "d",
      "M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"
    );
    svg.appendChild(path);
    // Diagonal slash overlaid on the receiver — the universal
    // "disabled" indicator.
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "23");
    line.setAttribute("y1", "1");
    line.setAttribute("x2", "1");
    line.setAttribute("y2", "23");
    svg.appendChild(line);
  } else {
    // Standard phone receiver (expanded glyph).
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute(
      "d",
      "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
    );
    svg.appendChild(path);
  }
  return svg;
}

module.exports = class CallButtonGuard {
  constructor() {
    this._stopped = true;
    this._loop = null;
  }

  start() {
    this._stopped = false;
    // Default to collapsed (calls hidden) on first install — the whole
    // point of this plugin is to prevent accidental calls, so the safe
    // default is "guard active". Only user toggling explicitly to false
    // and saving disables the guard. `BdApi.Data.load` returns undefined
    // when nothing has been saved yet.
    const saved = BdApi.Data.load(PLUGIN_NAME, "collapsed");
    this._collapsed = saved === undefined || saved === null ? true : !!saved;
    BdApi.DOM.addStyle(STYLE_ID, CSS);
    this._writeBodyAttr();
    this._ensureButton();
    // 2s polling for re-injection — Discord can re-render the channel
    // header during DM switches / reload of the right-side panel.
    this._loop = setInterval(() => {
      if (this._stopped || document.hidden) return;
      this._ensureButton();
    }, 2000);
  }

  stop() {
    this._stopped = true;
    if (this._loop) {
      clearInterval(this._loop);
      this._loop = null;
    }
    document.querySelectorAll("#" + BUTTON_ID).forEach((el) => el.remove());
    if (document.body) document.body.removeAttribute(COLLAPSED_BODY_ATTR);
    BdApi.DOM.removeStyle(STYLE_ID);
  }

  _writeBodyAttr() {
    if (!document.body) return;
    document.body.setAttribute(COLLAPSED_BODY_ATTR, this._collapsed ? "true" : "false");
  }

  _toggle() {
    this._collapsed = !this._collapsed;
    try { BdApi.Data.save(PLUGIN_NAME, "collapsed", this._collapsed); } catch (_) {}
    this._writeBodyAttr();
    document.querySelectorAll("#" + BUTTON_ID).forEach((btn) => this._renderButtonState(btn));
  }

  _renderButtonState(btn) {
    btn.setAttribute("data-collapsed", this._collapsed ? "true" : "false");
    btn.title = this._collapsed ? "Show call buttons" : "Hide call buttons";
    btn.setAttribute("aria-label", btn.title);
    // Replace contents with a freshly built SVG element. textContent='' clears
    // the existing children safely; appendChild attaches our DOM-built node.
    btn.textContent = "";
    btn.appendChild(_buildPhoneSvg(this._collapsed));
  }

  _ensureButton() {
    // Only inject in toolbars that ALREADY contain a Start Voice Call
    // button. That's the unambiguous DM / group-DM signal — text
    // channels don't have those buttons, so we won't pollute them.
    const toolbars = document.querySelectorAll(
      'section[aria-label="Channel header"] [class*="toolbar_"]'
    );
    for (const toolbar of toolbars) {
      if (!toolbar.querySelector('[aria-label="Start Voice Call"]')) continue;
      if (toolbar.querySelector("#" + BUTTON_ID)) continue;

      const btn = document.createElement("button");
      btn.id = BUTTON_ID;
      btn.type = "button";
      this._renderButtonState(btn);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this._toggle();
      });
      // Inject at the FRONT of the toolbar so the toggle is the first
      // thing the user sees. The SoloLevelingTheme toolbar-org module
      // can give #cbg-toggle-button an explicit flex `order` to nail
      // its visual position regardless of injection point.
      toolbar.insertBefore(btn, toolbar.firstChild);
    }
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.cssText = "padding: 14px; color: #d1d5db; background: rgba(8,10,20,0.96); border: 1px solid rgba(138,43,226,0.45); border-radius: 2px;";

    const h = document.createElement("h3");
    h.style.cssText = "margin: 0 0 8px; color: #8a2be2; font-family: 'Friend or Foe BB', sans-serif;";
    h.textContent = "Call Button Guard";
    panel.appendChild(h);

    const desc = document.createElement("div");
    desc.style.cssText = "font-size: 12px; color: #9ca3af; line-height: 1.5;";
    desc.textContent =
      "Adds a small toggle to the channel header in any chat that has Start Voice Call / Start Video Call buttons (DMs and group DMs). Click the toggle to collapse those buttons so an accidental click doesn't ring anyone. State persists across reloads.";
    panel.appendChild(desc);

    const status = document.createElement("div");
    status.style.cssText = "margin-top: 10px; font-size: 11px; color: #6b7280;";
    status.appendChild(document.createTextNode("Currently: "));
    const strong = document.createElement("strong");
    strong.style.color = this._collapsed ? "#f87171" : "#a78bfa";
    strong.textContent = this._collapsed ? "calls hidden" : "calls visible";
    status.appendChild(strong);
    panel.appendChild(status);

    return panel;
  }
};
