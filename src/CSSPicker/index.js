/**
 * CSSPicker — Hover to inspect, click to capture & auto-update theme.
 * Integrates with Theme Auto Maintainer for class verification.
 *
 * Entry point. Handles settings, hotkey utilities, DOM creation
 * (overlay, launcher button, tooltip), and the CSSPicker class.
 */

/* global CSS, Element */

import {
  escapeHtml,
  truncateMiddle,
  getElementSummary,
  getStableSelectorSet,
  getExactClassSelectors,
  getSelectorCandidates,
  promoteToMeaningfulAncestor,
  getElementDetails,
} from "./selectors.js";

import {
  buildCaptureToastMessage,
  trySaveReportJson,
  tryCopyJsonToClipboard,
} from "./inspection.js";
const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
const { createToast } = require("../shared/toast");
const { isEditableTarget, matchesHotkey } = require("../shared/hotkeys");

// ── Config & settings ────────────────────────────────────────────

const PLUGIN_NAME = "CSS Picker";
const PLUGIN_VERSION = "1.5.0";

const DEFAULT_SETTINGS = {
  toastTimeoutMs: 5500,
  toastIncludeComputed: true,
  toastIncludeRules: true,
  toastRuleCount: 3,
  toastMaxChars: 260,
  hotkeyEnabled: true,
  hotkey: "Ctrl+Shift+P",
  autoUpdateTheme: true,
  verifyWithDOM: true,
  verifyWithGitHub: true,
  themePath: "SoloLeveling-ClearVision.theme.css",
};

const loadSettings = () => {
  try {
    return { ...DEFAULT_SETTINGS, ...(BdApi.Data.load(PLUGIN_NAME, "settings") || {}) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
};

const saveSettings = (settings) => {
  try {
    BdApi.Data.save(PLUGIN_NAME, "settings", settings);
  } catch (e) {
    // ignore
  }
};

// ── Shared utilities (runtime, with inline fallback) ─────────────

let _PluginUtils = null;
try {
  _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js");
} catch (_) {
  _PluginUtils = null;
}

// Hotkey + editable-target utilities — from shared/hotkeys.js

// ── Root context helper (cached — root/body classes rarely change mid-session) ──

let _rootCtxCache = null;
let _rootCtxClassKey = "";

const getRootContext = () => {
  const root = document.documentElement;
  const body = document.body;
  // Fast fingerprint: classList values change far less often than hover targets
  const classKey = (root?.className || "") + "|" + (body?.className || "");
  if (_rootCtxCache && classKey === _rootCtxClassKey) return _rootCtxCache;

  const getAttrs = (node) =>
    Array.from(node?.attributes || [])
      .map((a) => ({ name: a.name, value: a.value }))
      .slice(0, 30);
  const getClasses = (node) => Array.from(node?.classList || []);
  _rootCtxCache = {
    root: {
      summary: root ? getElementSummary(root) : null,
      classList: getClasses(root),
      attributes: getAttrs(root),
    },
    body: {
      summary: body ? getElementSummary(body) : null,
      classList: getClasses(body),
      attributes: getAttrs(body),
    },
  };
  _rootCtxClassKey = classKey;
  return _rootCtxCache;
};

// ── DOM element creation (overlay, launcher, tooltip) ────────────

const createOverlay = () => {
  const overlay = document.createElement("div");
  overlay.id = "css-picker-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 100000;
    border: 2px solid rgba(138, 43, 226, 0.95);
    border-radius: 2px;
    background: transparent;
    box-shadow: none;
  `;
  return overlay;
};

const createLauncherButton = () => {
  const button = document.createElement("button");
  button.id = "css-picker-launcher";
  button.type = "button";
  button.textContent = "Start CSS Picker";
  button.style.cssText = `
    position: fixed;
    right: 18px;
    top: 18px;
    z-index: 100002;
    background: var(--brand-color, #5865f2);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 2px;
    padding: 10px 12px;
    cursor: pointer;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.2px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    font-family: var(--font-primary, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial);
    opacity: 0.96;
  `;
  return button;
};

const createTooltip = () => {
  const tooltip = document.createElement("div");
  tooltip.id = "css-picker-tooltip";
  tooltip.style.cssText = `
    position: fixed;
    top: 28px;
    right: 16px;
    max-width: 520px;
    max-height: 70vh;
    z-index: 100001;
    pointer-events: none;
    background: rgba(17, 18, 20, 0.92);
    border: 1px solid rgba(88, 101, 242, 0.65);
    border-radius: 2px;
    padding: 10px 12px;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 12px;
    color: #dcddde;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
  `;
  tooltip.innerHTML = `<div style="opacity: 0.85;">CSS Picker v${escapeHtml(PLUGIN_VERSION)}</div>`;
  return tooltip;
};

const updateTooltip = ({ tooltip, el }) => {
  const summary = getElementSummary(el);
  const candidates = getSelectorCandidates(el).slice(0, 3);
  const stable = getStableSelectorSet(el).slice(0, 2);
  const best =
    stable[0] || getExactClassSelectors(el)[0] || (el.id ? `#${CSS.escape(el.id)}` : null);
  const rootCtx = getRootContext();
  const rootClasses = (rootCtx.root.classList || []).slice(0, 4).join(" ") || "(none)";
  const bodyClasses = (rootCtx.body.classList || []).slice(0, 4).join(" ") || "(none)";

  tooltip.innerHTML = `
    <div style="display:flex; justify-content: space-between; gap: 8px; align-items: baseline;">
      <div><strong>${escapeHtml(summary)}</strong></div>
      <div style="opacity: 0.7;">click to capture, esc to cancel</div>
    </div>
    <div style="margin-top: 2px; opacity: 0.65;">CSS Picker v${escapeHtml(PLUGIN_VERSION)}</div>
    <div style="margin-top: 6px; opacity: 0.9;">
      <div style="opacity: 0.75; margin-bottom: 4px;">Best selector:</div>
      <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">${escapeHtml(
        best || "(none)"
      )}</div>
    </div>
    <div style="margin-top: 6px; opacity: 0.9;">
      <div style="opacity: 0.75; margin-bottom: 4px;">Selector candidates:</div>
      ${candidates
        .map(
          (s) =>
            `<div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">${escapeHtml(
              s
            )}</div>`
        )
        .join("")}
    </div>
    <div style="margin-top: 6px; opacity: 0.9;">
      <div style="opacity: 0.75; margin-bottom: 4px;">Root context (may override):</div>
      <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">
        :root/html classes: ${escapeHtml(rootClasses)}
      </div>
      <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.95;">
        body classes: ${escapeHtml(bodyClasses)}
      </div>
    </div>
  `;
};

const positionOverlayOnElement = ({ overlay, el }) => {
  const rect = el.getBoundingClientRect();

  // Ignore zero-size targets (e.g., hidden)
  if (!rect.width || !rect.height) return;

  overlay.style.top = `${Math.max(0, rect.top)}px`;
  overlay.style.left = `${Math.max(0, rect.left)}px`;
  overlay.style.width = `${Math.max(0, rect.width)}px`;
  overlay.style.height = `${Math.max(0, rect.height)}px`;
};

// ── CSSPicker class ──────────────────────────────────────────────

module.exports = class CSSPicker {
  start() {
    if (this.onGlobalHotkeyDown || this.launcher || this.isActive) {
      try { this.stop(); } catch (_) {}
    }
    this._toast =
      _PluginUtils?.createToastHelper?.("cssPicker") || createToast();
    this.isActive = false;
    this.lastHoverElement = null;

    this.overlay = null;
    this.tooltip = null;
    this.launcher = null;
    this.settings = loadSettings();

    this.onMouseMove = null;
    this.onClick = null;
    this.onKeyDown = null;
    this.onGlobalHotkeyDown = null;
    this.hoverRafId = null;
    this.pendingHoverPoint = null;
    this._launcherClickHandler = null;
    this._captureInProgress = false;

    this.injectLauncher();

    this.onGlobalHotkeyDown = (event) => {
      const settings = this.settings || loadSettings();
      if (!settings.hotkeyEnabled) return;
      if (isEditableTarget(event.target)) return;
      if (!matchesHotkey(event, settings.hotkey)) return;

      event.preventDefault();
      event.stopPropagation();
      if (this.isActive) this.deactivatePickMode(); else this.activatePickMode();
    };
    document.addEventListener("keydown", this.onGlobalHotkeyDown, true);

    const hotkeyLabel =
      this.settings?.hotkeyEnabled && this.settings?.hotkey
        ? ` Hotkey: ${this.settings.hotkey}`
        : "";
    this._toast(`CSS Picker v${PLUGIN_VERSION} loaded.${hotkeyLabel}`, "info");
  }

  stop() {
    this.deactivatePickMode();
    this.removeLauncher();
    if (this.onGlobalHotkeyDown)
      document.removeEventListener("keydown", this.onGlobalHotkeyDown, true);
    this.onGlobalHotkeyDown = null;
    this._captureInProgress = false;
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.cssText = "padding: 16px;";

    const settings = (this.settings = loadSettings());
    const isChecked = (v) => (v ? "checked" : "");
    const startHotkeyHint =
      settings.hotkeyEnabled && settings.hotkey ? ` (${escapeHtml(settings.hotkey)})` : "";

    panel.innerHTML = `
      <div>
        <h2 style="margin: 0 0 8px 0;">CSS Picker</h2>
        <p style="margin: 0 0 12px 0; opacity: 0.8;">
          Click Start, then hover anything in Discord and click once to capture selectors.
          It captures only once per activation.
        </p>
        <button id="css-picker-start" style="
          background: var(--brand-color, #5865f2);
          color: white;
          border: none;
          padding: 10px 14px;
          border-radius: 2px;
          cursor: pointer;
          font-weight: 600;
          margin-right: 10px;
        ">Start pick mode (one capture)${startHotkeyHint}</button>
        <button id="css-picker-stop" style="
          background: rgba(4, 4, 5, 0.6);
          color: var(--text-normal, #dcddde);
          border: none;
          padding: 10px 14px;
          border-radius: 2px;
          cursor: pointer;
        ">Stop</button>
      </div>
      <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
        <div style="font-weight: 700; margin-bottom: 10px;">Toast details</div>
        <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
          <input id="css-picker-toast-computed" type="checkbox" ${isChecked(
            settings.toastIncludeComputed
          )} />
          <span>Include computed visual summary (bg, bg-image, shadow, border)</span>
        </label>
        <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
          <input id="css-picker-toast-rules" type="checkbox" ${isChecked(
            settings.toastIncludeRules
          )} />
          <span>Include matching rule hints (why it looks that way)</span>
        </label>
        <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
          <span style="min-width: 140px; opacity: 0.85;">Rule hints count</span>
          <input id="css-picker-toast-rule-count" type="number" min="0" max="6" value="${escapeHtml(
            settings.toastRuleCount
          )}" style="width: 80px; padding: 6px 8px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); color: var(--text-normal, #dcddde);" />
        </label>
        <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
          <span style="min-width: 140px; opacity: 0.85;">Toast timeout (ms)</span>
          <input id="css-picker-toast-timeout" type="number" min="1500" max="20000" value="${escapeHtml(
            settings.toastTimeoutMs
          )}" style="width: 120px; padding: 6px 8px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); color: var(--text-normal, #dcddde);" />
        </label>
      </div>
      <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
        <div style="font-weight: 700; margin-bottom: 10px;">Hotkey</div>
        <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
          <input id="css-picker-hotkey-enabled" type="checkbox" ${isChecked(
            settings.hotkeyEnabled
          )} />
          <span>Enable hotkey to toggle pick mode</span>
        </label>
        <label style="display:flex; gap: 10px; align-items:center; margin-bottom: 8px;">
          <span style="min-width: 140px; opacity: 0.85;">Hotkey</span>
          <input id="css-picker-hotkey" type="text" value="${escapeHtml(
            settings.hotkey
          )}" style="width: 200px; padding: 6px 8px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); color: var(--text-normal, #dcddde);" />
          <span style="opacity: 0.7;">Example: Ctrl+Shift+P</span>
        </label>
      </div>
    `;

    const update = (next) => {
      const merged = { ...(this.settings || settings), ...next };
      saveSettings(merged);
      this.settings = merged;
      this._toast("CSS Picker settings saved", "success", 2000);
    };

    const settingsActions = {
      "css-picker-start": () => this.activatePickMode(),
      "css-picker-stop": () => this.deactivatePickMode(),
      "css-picker-toast-computed": (e) => update({ toastIncludeComputed: !!e.target.checked }),
      "css-picker-toast-rules": (e) => update({ toastIncludeRules: !!e.target.checked }),
      "css-picker-toast-rule-count": (e) => update({ toastRuleCount: Math.max(0, Math.min(6, Number(e.target.value || 0))) }),
      "css-picker-toast-timeout": (e) => update({ toastTimeoutMs: Math.max(1500, Math.min(20000, Number(e.target.value || 5500))) }),
      "css-picker-hotkey-enabled": (e) => update({ hotkeyEnabled: !!e.target.checked }),
      "css-picker-hotkey": (e) => update({ hotkey: String(e.target.value || "").trim() || DEFAULT_SETTINGS.hotkey }),
    };

    panel.addEventListener("click", (e) => {
      const handler = settingsActions[e.target.id];
      if (handler) handler(e);
    });
    panel.addEventListener("change", (e) => {
      const handler = settingsActions[e.target.id];
      if (handler) handler(e);
    });

    return panel;
  }

  activatePickMode() {
    if (this.isActive) return;
    this.isActive = true;

    this.overlay = createOverlay();
    this.tooltip = createTooltip();

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.tooltip);

    const getTargetFromPoint = (x, y) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      if (el.closest && el.closest("#css-picker-launcher")) return null;
      if (el === this.overlay || el === this.tooltip) return null;
      if (el.closest && el.closest("#css-picker-overlay")) return null;
      if (el.closest && el.closest("#css-picker-tooltip")) return null;
      return el;
    };

    this.onMouseMove = (event) => {
      if (!this.isActive) return;
      this.pendingHoverPoint = { x: event.clientX, y: event.clientY };
      if (this.hoverRafId) return;

      this.hoverRafId = requestAnimationFrame(() => {
        this.hoverRafId = null;
        if (!this.isActive || !this.pendingHoverPoint) return;

        const { x, y } = this.pendingHoverPoint;
        this.pendingHoverPoint = null;

        const rawTarget = getTargetFromPoint(x, y);
        if (!rawTarget || !(rawTarget instanceof Element)) return;
        const target = promoteToMeaningfulAncestor(rawTarget).el;

        if (target === this.lastHoverElement) return;
        this.lastHoverElement = target;

        positionOverlayOnElement({ overlay: this.overlay, el: target });
        updateTooltip({ tooltip: this.tooltip, el: target });
      });
    };

    const captureElementAtPoint = async (x, y) => {
      const rawTarget = getTargetFromPoint(x, y);
      if (!rawTarget || !(rawTarget instanceof Element)) {
        return { ok: false, error: "No element found to capture" };
      }

      const { el: target, promoted, originalTag } = promoteToMeaningfulAncestor(rawTarget);
      const elementDetails = getElementDetails(target);
      if (promoted && originalTag) elementDetails._promotedFrom = originalTag;

      const report = {
        plugin: PLUGIN_NAME,
        version: PLUGIN_VERSION,
        element: elementDetails,
      };

      const saveResult = trySaveReportJson(report);
      const clipboardResult = await tryCopyJsonToClipboard(report);
      const toastType =
        (saveResult.ok && clipboardResult.ok && "success") ||
        ((saveResult.ok || clipboardResult.ok) && "warning") ||
        "error";
      const settings = this.settings || loadSettings();
      const message = buildCaptureToastMessage({
        elementDetails: report.element,
        saveResult,
        clipboardResult,
        settings,
        pluginVersion: PLUGIN_VERSION,
      });
      return {
        ok: true,
        toastType,
        message,
        toastTimeoutMs: settings.toastTimeoutMs || 5500,
      };
    };

    this.onClick = async (event) => {
      if (!this.isActive) return;
      if (event.target?.closest?.("#css-picker-launcher")) return;
      event.preventDefault();
      event.stopPropagation();
      if (this._captureInProgress) return;
      this._captureInProgress = true;
      try {
        const capture = await captureElementAtPoint(event.clientX, event.clientY);
        if (!capture.ok) {
          this._toast(capture.error || "Failed to capture element", "error");
          return;
        }
        this._toast(capture.message, capture.toastType, capture.toastTimeoutMs);
      } finally {
        this._captureInProgress = false;
        this.deactivatePickMode();
      }
    };

    this.onKeyDown = (event) => {
      if (!this.isActive) return;
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();

      this._toast("CSS Picker cancelled", "info");
      this.deactivatePickMode();
    };

    document.addEventListener("mousemove", this.onMouseMove, true);
    document.addEventListener("click", this.onClick, true);
    document.addEventListener("keydown", this.onKeyDown, true);

    this.updateLauncherState();
    this._toast(
      "CSS Picker active: hover and click once to capture. Press Esc to cancel.",
      "info",
      5000
    );
  }

  deactivatePickMode() {
    if (!this.isActive) {
      // Still clean up in case
      this.removeArtifacts();
      return;
    }

    this.isActive = false;
    this.lastHoverElement = null;
    _rootCtxCache = null;
    _rootCtxClassKey = "";

    if (this.onMouseMove) document.removeEventListener("mousemove", this.onMouseMove, true);
    if (this.onClick) document.removeEventListener("click", this.onClick, true);
    if (this.onKeyDown) document.removeEventListener("keydown", this.onKeyDown, true);

    this.onMouseMove = null;
    this.onClick = null;
    this.onKeyDown = null;
    this.pendingHoverPoint = null;
    this._captureInProgress = false;
    this.hoverRafId && cancelAnimationFrame(this.hoverRafId);
    this.hoverRafId = null;

    this.removeArtifacts();
    this.updateLauncherState();
  }

  removeArtifacts() {
    try {
      this.overlay?.remove();
    } catch (e) {
      // ignore
    }
    try {
      this.tooltip?.remove();
    } catch (e) {
      // ignore
    }
    this.overlay = null;
    this.tooltip = null;
  }

  injectLauncher() {
    if (this.launcher && document.body.contains(this.launcher)) return;
    this.launcher = this.launcher || createLauncherButton();

    this._launcherClickHandler =
      this._launcherClickHandler ||
      (() => {
        if (this.isActive) this.deactivatePickMode(); else this.activatePickMode();
      });
    this.launcher.removeEventListener("click", this._launcherClickHandler);
    this.launcher.addEventListener("click", this._launcherClickHandler);

    document.body.appendChild(this.launcher);
    this.updateLauncherState();
  }

  removeLauncher() {
    try {
      this.launcher &&
        this._launcherClickHandler &&
        this.launcher.removeEventListener("click", this._launcherClickHandler);
      this.launcher?.remove();
    } catch (e) {
      // ignore
    }
    this.launcher = null;
  }

  updateLauncherState() {
    if (!this.launcher) return;
    const settings = this.settings || loadSettings();
    const hotkeySuffix =
      settings.hotkeyEnabled && settings.hotkey ? ` (${settings.hotkey})` : "";
    const states = {
      active: { text: "Cancel CSS Picker", opacity: "0.82" },
      inactive: { text: "Start CSS Picker", opacity: "0.96" },
    };
    const next = this.isActive ? states.active : states.inactive;
    this.launcher.textContent = `${next.text}${hotkeySuffix}`;
    this.launcher.style.opacity = next.opacity;
  }
};
