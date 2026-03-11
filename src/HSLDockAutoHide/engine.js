/**
 * ============================================================================
 * REACT PATCHER ARCHITECTURE (v4.0.0)
 * ============================================================================
 *
 * Injects via MainContent.Z React patcher (same proven target as ChatNavArrows,
 * SoloLevelingStats, LevelProgressBar, ShadowArmy).  A <DockAutoHideController>
 * functional component manages a DockEngine instance via useRef.  The engine
 * holds ALL imperative state (mouse tracking, timers, typing detection) — no
 * useState to avoid re-renders on mouse events.
 *
 * React effects handle:
 *   - Engine mount/unmount (event listeners, intervals)
 *   - DOM element discovery on every React render (instant recovery)
 *
 * Previous approach (v3.0.1): 850ms polling via safeTick() to re-discover
 * dock and user panel elements.  Now the React patcher fires instantly on
 * channel navigation / Discord re-renders, eliminating the stale-reference
 * window.  safeTick() is retained at reduced scope for alert rail, geometry,
 * and typing lock enforcement.
 *
 * TABLE OF CONTENTS
 * 1) Loader + Selector Constants
 * 2) DockEngine (imperative state machine)
 * 3) HSLDockAutoHide (plugin lifecycle)
 * 4) React patcher + fallback mount
 * 5) Static CSS (moved to plugin index module)
 */

const {
  debug: debugDockEngine,
  describeDock,
  initDebugFileSink,
  installDebugApi,
  removeDebugApi,
  sanitizeDebugData,
  sanitizeDebugValue,
  snapshotState,
  writeDebugEntry,
} = require("./debug");

// ─── Selector Configuration ─────────────────────────────────────────────────
// Centralized for easy updating when Discord changes class names.

const DOCK_SELECTORS = [
  "nav[aria-label='Servers sidebar']",
  "nav[aria-label='Servers']",
  "nav[class*='guilds_']",
  "[class*='guilds_'][class*='wrapper_']",
];
const DOCK_SELECTOR_STR = DOCK_SELECTORS.join(", ");

const PANEL_SELECTORS = [
  "section[aria-label='User status and settings']",
  "section[class*='panels_'] > section",
];
const PANEL_SELECTOR_STR = PANEL_SELECTORS.join(", ");

const COMPOSER_CONTAINER_SELECTORS = [
  "form[class*='form_']",
  "div[class*='channelBottomBarArea_']",
  "div[class*='channelTextArea_']",
  "div[class*='scrollableContainer_']",
  "div[class*='inner_']",
  "div[class*='textArea_']",
  "div[class*='slateContainer_']",
  "div[class*='slateTextArea_']",
  "div[class*='editor_']",
  "div[class*='markup_']",
].join(", ");

const COMPOSER_EDITABLE_SELECTORS = [
  "textarea",
  "input[type='text']",
  "input[type='search']",
  "input:not([type])",
  "[role='textbox']",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[contenteditable='plaintext-only']",
].join(", ");

const ALERT_SELECTORS = [
  "[class*='listItem'] [class*='mentionsBadge']",
  "[class*='listItem'] [aria-label*='mention' i]",
  "[class*='pill'] [class*='mentionsBadge']",
  "[class*='pill'] [aria-label*='mention' i]",
  "[class*='numberBadge']",
  "[class*='mentionsBadge']",
];
const ALERT_SELECTOR_STR = ALERT_SELECTORS.join(",");
const DIGITS_RE = /\d+/;
const DIGITS_ONLY_RE = /^\d+$/;

// ─── DockEngine — Imperative State Machine ──────────────────────────────────
// A plain JS class that holds ALL dock interaction state and logic.
// Created once per mount by the React component.  NOT a React component itself.

class DockEngine {
  constructor() {
    this.version = "4.0.0";
    this.stateTarget = document.body;
    this.root = document.documentElement;

    // ── Config ──
    this.peekPx = 8;
    this.revealZonePx = 85;
    this.hideDelayMs = 500;
    this.revealHoldMs = 0;
    this.revealConfirmMs = 1000;
    this.focusReentryGuardMs = 1000;
    this.composerHideSuppressMs = 1200;
    this.startupLockMs = 6500;
    this.typingLockMs = 2600;
    this.railHeightPx = 9;

    // ── Dynamic state ──
    this.lockOpenUntil = Date.now() + this.startupLockMs;
    this.revealHoldUntil = 0;
    this.suppressOpenUntil = 0;
    this.typingLockUntil = 0;
    this.requireRevealReset = false;

    this.pointerOverDock = false;
    this.lastMouseX = -1;
    this.lastMouseY = -1;
    this.lastMouseMoveAt = 0;
    this.hasMouseMoved = false;

    // ── DOM references ──
    this.dock = null;
    this.dockMoveTarget = null;
    this.rail = null;
    this.railVisible = false;
    this.railFollowFrame = null;
    this.userPanel = null;
    this.isUserPanelPositioned = false;
    this._panelHoverContainer = null;
    this._panelHoverBindAttempted = false;
    this._onPanelEnter = null;
    this._onPanelLeave = null;
    this._lastDockHeight = null;
    this._origPanelsHeight = document.body.style.getPropertyValue("--custom-app-panels-height") || null;

    // ── Timers ──
    this.hideTimer = null;
    this.revealTimer = null;
    this.syncInterval = null;
    this._mouseMoveRafId = null;
    this._mouseMoveRafPending = false;
    this._resizeRafPending = false;
    this._dockHeightDirty = true;
    this._lastTickRefreshAt = 0;
    this._cachedComposerEl = null;
    this._cachedComposerResult = false;

    // ── Debug ──
    this.tickCount = 0;
    this.debugEnabled = false;
    this.debugConsole = false;
    this.debugFileEnabled = false;
    this.debugMaxEntries = 2200;
    this.debugBuffer = [];
    this.debugSeq = 0;
    this.debugFilePath = null;
    this.fs = null;

    // ── Bind event handlers ──
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onDockEnter = this.onDockEnter.bind(this);
    this.onDockLeave = this.onDockLeave.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onWindowBlur = this.onWindowBlur.bind(this);
    this.onWindowFocus = this.onWindowFocus.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.onComposerInput = this.onComposerInput.bind(this);
    this.onComposerKeyDown = this.onComposerKeyDown.bind(this);
    this.onComposerFocusIn = this.onComposerFocusIn.bind(this);
    this.safeTick = this.safeTick.bind(this);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  mount() {
    this.initDebugFileSink();
    this.installDebugApi();
    this.debug("mount:init", { version: this.version }, true);

    // Body state
    document.body.style.setProperty("--custom-app-panels-height", "0px");
    document.body.style.removeProperty("--sl-userpanel-width");
    this.stateTarget.classList.add("sl-dock-autohide", "sl-dock-hidden");
    this.stateTarget.classList.remove("sl-dock-visible");
    this.stateTarget.style.setProperty("--sl-dock-peek", `${this.peekPx}px`);

    // Alert rail
    this.createRail();

    // Global event listeners
    document.addEventListener("mousemove", this.onMouseMove, { passive: true });
    document.addEventListener("beforeinput", this.onComposerInput, { capture: true, passive: true });
    document.addEventListener("input", this.onComposerInput, { capture: true, passive: true });
    document.addEventListener("compositionstart", this.onComposerInput, { capture: true, passive: true });
    document.addEventListener("compositionupdate", this.onComposerInput, { capture: true, passive: true });
    document.addEventListener("keydown", this.onComposerKeyDown, { capture: true, passive: true });
    document.addEventListener("focusin", this.onComposerFocusIn, { capture: true, passive: true });
    window.addEventListener("resize", this.onResize, { passive: true });
    window.addEventListener("blur", this.onWindowBlur, { passive: true });
    window.addEventListener("focus", this.onWindowFocus, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibilityChange, { passive: true });

    // Initial sync + tick
    this.syncDock();
    this.trySetupUserPanel();
    this.safeTick();
    this.syncInterval = setInterval(() => {
      if (document.hidden) return; // PERF: Skip when window not visible
      this.safeTick();
    }, 1500); // 1.5s (was 850ms) — dock state rarely changes

    this.debug("mount:ready", { syncIntervalMs: 1500 }, true);
  }

  unmount() {
    this.debug("unmount:begin", {}, true);

    // Remove global listeners
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("beforeinput", this.onComposerInput, true);
    document.removeEventListener("input", this.onComposerInput, true);
    document.removeEventListener("compositionstart", this.onComposerInput, true);
    document.removeEventListener("compositionupdate", this.onComposerInput, true);
    document.removeEventListener("keydown", this.onComposerKeyDown, true);
    document.removeEventListener("focusin", this.onComposerFocusIn, true);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("focus", this.onWindowFocus);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    // Timers
    this.clearHideTimer();
    this.clearRevealTimer("unmount");
    if (this.syncInterval) { clearInterval(this.syncInterval); this.syncInterval = null; }
    if (this._mouseMoveRafId) { cancelAnimationFrame(this._mouseMoveRafId); this._mouseMoveRafId = null; this._mouseMoveRafPending = false; }

    // Dock events
    this.unbindDockEvents();
    if (this.dockMoveTarget) {
      this.dockMoveTarget.classList.remove("sl-hsl-dock-target");
      this.dockMoveTarget.style.removeProperty("translate");
    }

    // Body state
    if (this.stateTarget) {
      this.stateTarget.classList.remove("sl-dock-autohide", "sl-dock-visible", "sl-dock-hidden", "sl-dock-composer-lock");
      this.stateTarget.style.removeProperty("--sl-dock-height");
      this.stateTarget.style.removeProperty("--sl-dock-peek");
    }

    // Rail
    this.removeRail();
    this.stopRailFollow();

    // User panel
    this.unbindUserPanelHover();
    if (this.userPanel) {
      this.userPanel.classList.remove("sl-userpanel-docked");
      this.userPanel.style.removeProperty("right");
      this.userPanel.style.removeProperty("left");
    }
    if (this._origPanelsHeight) {
      document.body.style.setProperty("--custom-app-panels-height", this._origPanelsHeight);
    } else {
      document.body.style.removeProperty("--custom-app-panels-height");
    }

    // Debug
    this.removeDebugApi();

    // Null references
    this.dock = null;
    this.dockMoveTarget = null;
    this.userPanel = null;
    this.isUserPanelPositioned = false;
    this.root = null;
    this.stateTarget = null;
    this._cachedComposerEl = null;
    this._cachedComposerResult = false;
  }

  // ── Dock Discovery (called by React effect + safeTick) ────────────────────

  syncDock() {
    if (this.dock?.isConnected) return;
    const nextDock = this.findActiveDock();
    if (nextDock === this.dock) return;
    this.debug("dock:change", {
      prev: this.describeDock(this.dock),
      next: this.describeDock(nextDock),
    }, true);

    this.unbindDockEvents();
    if (this.dockMoveTarget) this.dockMoveTarget.classList.remove("sl-hsl-dock-target");
    this.dock = nextDock;
    this.dockMoveTarget = nextDock;
    this.pointerOverDock = false;
    this._dockHeightDirty = true;

    if (!this.dock) return;
    if (this.dockMoveTarget) this.dockMoveTarget.classList.add("sl-hsl-dock-target");
    this.mountRailToDock();
    if (Date.now() < this.typingLockUntil) {
      if (this.stateTarget && !this.stateTarget.classList.contains("sl-dock-hidden")) {
        this.stateTarget.classList.add("sl-dock-hidden");
        this.stateTarget.classList.remove("sl-dock-visible");
      }
    }
    this.applyDockStateInline();
    this.dock.addEventListener("mouseenter", this.onDockEnter);
    this.dock.addEventListener("mouseleave", this.onDockLeave);
    this.debug("dock:bound-events", { dock: this.describeDock(this.dock) });
  }

  findActiveDock() {
    const docks = Array.from(document.querySelectorAll(DOCK_SELECTOR_STR));
    if (!docks.length) return null;

    // PERF: Batch-read all rects first (single layout pass), then filter in JS
    const measured = [];
    for (const dock of docks) {
      measured.push({ dock, rect: dock.getBoundingClientRect() });
    }

    let best = null;
    let bestScore = -Infinity;
    for (const { dock, rect } of measured) {
      if (rect.width < 120 || rect.height < 24) continue;
      // Only call getComputedStyle on size-qualified candidates (expensive)
      const style = getComputedStyle(dock);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const score = rect.width + rect.top * 2;
      if (score > bestScore) { best = dock; bestScore = score; }
    }

    const chosen = best;
    this.debug("dock:find", { count: docks.length, chosen: this.describeDock(chosen) });
    return chosen;
  }

  unbindDockEvents() {
    if (!this.dock) return;
    this.dock.removeEventListener("mouseenter", this.onDockEnter);
    this.dock.removeEventListener("mouseleave", this.onDockLeave);
  }

  ensureDockTargetClass() {
    if (!this.dockMoveTarget) return;
    if (!this.dockMoveTarget.classList.contains("sl-hsl-dock-target")) {
      this.dockMoveTarget.classList.add("sl-hsl-dock-target");
    }
  }

  // ── User Panel (called by React effect + safeTick) ────────────────────────

  trySetupUserPanel() {
    const panel = document.querySelector(PANEL_SELECTOR_STR);
    const dock = this.dock;

    if (!panel || !dock) return;

    if (this.isUserPanelPositioned && panel === this.userPanel) {
      if (!panel.classList.contains("sl-userpanel-docked")) {
        panel.classList.add("sl-userpanel-docked");
      }
      if (!this._panelHoverContainer && !this._panelHoverBindAttempted) this.bindUserPanelHover(panel);
      return;
    }

    if (this.userPanel && this.userPanel !== panel) {
      this.userPanel.classList.remove("sl-userpanel-docked");
      this.userPanel.style.removeProperty("right");
      this.userPanel.style.removeProperty("left");
    }

    this.userPanel = panel;
    panel.classList.add("sl-userpanel-docked");
    this.isUserPanelPositioned = true;
    this.bindUserPanelHover(panel);
    this.debug("userpanel:setup", { found: true }, true);
  }

  bindUserPanelHover(panel) {
    this.unbindUserPanelHover();
    this._panelHoverBindAttempted = true;
    const container = panel.querySelector("div[class^='container_']");
    if (!container) return;

    this._onPanelEnter = () => {
      if (Date.now() < this.typingLockUntil) return;
      this.pointerOverDock = true;
      this.revealHoldUntil = 0;
      this.clearHideTimer();
      this.clearRevealTimer("userpanel-enter");
      this.showDock("userpanel-enter");
    };
    this._onPanelLeave = () => {
      this.pointerOverDock = false;
      this.scheduleHide(this.hideDelayMs);
    };

    container.addEventListener("mouseenter", this._onPanelEnter);
    container.addEventListener("mouseleave", this._onPanelLeave);
    this._panelHoverContainer = container;
    this.debug("userpanel:hover-bridge-bound", {}, true);
  }

  unbindUserPanelHover() {
    if (this._panelHoverContainer) {
      if (this._onPanelEnter) this._panelHoverContainer.removeEventListener("mouseenter", this._onPanelEnter);
      if (this._onPanelLeave) this._panelHoverContainer.removeEventListener("mouseleave", this._onPanelLeave);
    }
    this._panelHoverContainer = null;
    this._panelHoverBindAttempted = false;
    this._onPanelEnter = null;
    this._onPanelLeave = null;
  }

  // ── safeTick — Reduced Scope ──────────────────────────────────────────────
  // Discovery (syncDock, trySetupUserPanel) is now handled by React effects.
  // Tick focuses on: typing enforcement, pointer refresh, alerts, rail, height.

  safeTick() {
    try {
      this.tickCount += 1;
      this.debug("tick:begin", { tick: this.tickCount });

      if (this.stateTarget && !this.stateTarget.classList.contains("sl-dock-autohide")) {
        this.stateTarget.classList.add("sl-dock-autohide");
      }

      // Keep discovery responsive during startup/reflow churn; otherwise run periodic safety checks.
      const dockMissing = !this.dock?.isConnected;
      const panelMissing = !this.userPanel?.isConnected || !this.isUserPanelPositioned;
      if (dockMissing || panelMissing || this.tickCount % 5 === 0) {
        this.syncDock();
        this.trySetupUserPanel();
      }

      // Typing lock enforcement (guard stateTarget — can be null before first syncDock)
      if (this.stateTarget) {
        if (Date.now() < this.typingLockUntil) {
          this.stateTarget.classList.add("sl-dock-composer-lock");
          if (!this.stateTarget.classList.contains("sl-dock-hidden")) {
            this.stateTarget.classList.add("sl-dock-hidden");
            this.stateTarget.classList.remove("sl-dock-visible");
          }
          this.pointerOverDock = false;
          this.revealHoldUntil = 0;
        } else if (this.stateTarget.classList.contains("sl-dock-composer-lock") && !this.isOpenSuppressed()) {
          this.stateTarget.classList.remove("sl-dock-composer-lock");
        }
      }

      this.ensureDockTargetClass();
      this.mountRailToDock();
      this.refreshPointerState();
      this.enforceStartupLock();
      this.enforceAutoHideState();
      this.applyDockStateInline();
      this.updateDockHeightVar();
      this.updateAlertState();
      this.updateRailGeometry();

      this.debug("tick:end", { tick: this.tickCount });
    } catch (err) {
      this.debug("tick:error", { error: String(err) }, true);
    }
  }

  // ── Show / Hide State Machine ─────────────────────────────────────────────

  showDock(trigger = "unknown") {
    if (!this.stateTarget) { this.debug("dock:show-blocked", { reason: "no-root" }, true); return; }
    if (!this.hasMouseMoved) { this.debug("dock:show-blocked", { reason: "no-mouse-move" }, true); return; }
    if (Date.now() < this.lockOpenUntil) { this.debug("dock:show-blocked", { reason: "startup-lock" }, true); return; }
    if (this.isOpenSuppressed()) { this.debug("dock:show-blocked", { reason: "focus-guard" }, true); return; }
    if (Date.now() < this.typingLockUntil) { this.debug("dock:show-blocked", { reason: "typing-active" }, true); return; }
    if (this.stateTarget.classList.contains("sl-dock-visible")) { this.debug("dock:show-noop", { reason: "already-visible" }); return; }

    this.clearHideTimer();
    this.stateTarget.classList.remove("sl-dock-composer-lock");
    this.stateTarget.classList.add("sl-dock-visible");
    this.stateTarget.classList.remove("sl-dock-hidden");
    this.revealHoldUntil = trigger === "reveal-zone-hover" ? Date.now() + this.revealHoldMs : 0;
    this.debug("dock:show-applied", { trigger, revealHoldUntil: this.revealHoldUntil }, true);
    this.applyDockStateInline();
    this.startRailFollow(620);
  }

  hideDock() {
    if (!this.stateTarget) { this.debug("dock:hide-blocked", { reason: "no-root" }, true); return; }
    if (this.shouldKeepDockOpen()) { this.debug("dock:hide-blocked", { reason: "keep-open" }, true); return; }
    if (this.stateTarget.classList.contains("sl-dock-hidden")) { this.applyDockStateInline(); return; }

    this.stateTarget.classList.add("sl-dock-hidden");
    this.stateTarget.classList.remove("sl-dock-visible");
    this.debug("dock:hide-applied", {}, true);
    this.applyDockStateInline();
    this.startRailFollow(620);
  }

  applyDockStateInline() {
    if (!this.stateTarget || !this.dockMoveTarget) return;
    const typingActive = Date.now() < this.typingLockUntil;
    if (typingActive && !this.stateTarget.classList.contains("sl-dock-hidden")) {
      this.stateTarget.classList.add("sl-dock-hidden");
      this.stateTarget.classList.remove("sl-dock-visible");
    }
    if (this.dockMoveTarget.style.translate) {
      this.dockMoveTarget.style.removeProperty("translate");
    }
  }

  shouldKeepDockOpen() {
    if (Date.now() < this.typingLockUntil) return false;
    return this.pointerOverDock || Date.now() < this.revealHoldUntil;
  }

  isOpenSuppressed() {
    if (Date.now() < this.suppressOpenUntil) return true;
    if (document.visibilityState !== "visible") return true;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return true;
    return false;
  }

  // ── Timer Management ──────────────────────────────────────────────────────

  scheduleHide(delayMs) {
    if (this.shouldKeepDockOpen()) { this.clearHideTimer(); return; }
    this.clearHideTimer();
    const ms = Number(delayMs);
    if (!Number.isFinite(ms) || ms <= 0) {
      if (!this.shouldKeepDockOpen()) this.hideDock();
      return;
    }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (!this.shouldKeepDockOpen()) this.hideDock();
    }, ms);
  }

  clearHideTimer() {
    if (!this.hideTimer) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  scheduleRevealShow(reason) {
    if (this.revealTimer) return;
    if (Date.now() < this.typingLockUntil) return;
    this.revealTimer = setTimeout(() => {
      this.revealTimer = null;
      this.showDock("reveal-zone-hover");
    }, this.revealConfirmMs);
  }

  clearRevealTimer(reason) {
    if (!this.revealTimer) return;
    clearTimeout(this.revealTimer);
    this.revealTimer = null;
  }

  // ── Enforcement ───────────────────────────────────────────────────────────

  enforceAutoHideState() {
    if (!this.stateTarget) return;
    const visible = this.stateTarget.classList.contains("sl-dock-visible");
    if (visible && Date.now() < this.typingLockUntil) {
      this.pointerOverDock = false;
      this.revealHoldUntil = 0;
      this.clearRevealTimer("typing-enforce");
      this.hideDock();
      return;
    }
  }

  enforceStartupLock() {
    if (!this.root) return;
    if (Date.now() >= this.lockOpenUntil) return;
    this.pointerOverDock = false;
    this.hasMouseMoved = false;
    this.lastMouseX = -1;
    this.lastMouseY = -1;
    this.hideDock();
  }

  refreshPointerState() {
    if (!this.dock) { this.pointerOverDock = false; return; }
    if (Date.now() < this.typingLockUntil) { this.pointerOverDock = false; return; }
    // PERF: Skip expensive geometry checks (getBoundingClientRect + elementFromPoint)
    // when mouse hasn't moved since last tick refresh
    if (this.lastMouseMoveAt <= this._lastTickRefreshAt) return;
    this._lastTickRefreshAt = Date.now();
    this.pointerOverDock = (
      this.hasMouseMoved &&
      this.isCursorInsideDockRect() &&
      this.isPointerOnDockHitTarget()
    );
  }

  // ── Event Handlers ────────────────────────────────────────────────────────

  onMouseMove(event) {
    // PERF: Always capture coords (cheap), but coalesce heavy work to 1x per RAF
    this.hasMouseMoved = true;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    if (this._mouseMoveRafPending) return;
    this._mouseMoveRafPending = true;
    this._mouseMoveRafId = requestAnimationFrame(() => {
      this._mouseMoveRafPending = false;
      this._mouseMoveRafId = null;
      this._processMouseMove();
    });
  }

  _processMouseMove() {
    if (Date.now() < this.lockOpenUntil) return;
    this.lastMouseMoveAt = Date.now();

    if (Date.now() < this.typingLockUntil) {
      this.clearRevealTimer("typing-active-move");
      this.clearHideTimer();
      return;
    }

    // Keep pointer-over state fresh per mouse event (safeTick refresh can be stale
    // during fast movements, which can otherwise cause premature hides).
    const cursorOnDock =
      this.isCursorInsideDockRect(this.lastMouseX, this.lastMouseY) &&
      this.isPointerOnDockHitTarget(this.lastMouseX, this.lastMouseY);
    this.pointerOverDock = cursorOnDock;

    if (this.requireRevealReset) {
      this.requireRevealReset = false;
  
    }

    const nearBottom = this.isCursorInRevealStrip(this.lastMouseX, this.lastMouseY);
    const hidden = Boolean(this.stateTarget?.classList?.contains("sl-dock-hidden"));
    const shouldReveal = hidden && nearBottom && !this.pointerOverDock && !this.isOpenSuppressed() && this.isRecentMouseMove(1200);

    if (shouldReveal) {
      this.scheduleRevealShow("reveal-zone-hover");
    } else {
      this.clearRevealTimer("reveal-zone-exit");
    }

    if (this.shouldKeepDockOpen()) { this.clearHideTimer(); return; }
    this.scheduleHide(this.hideDelayMs);
  }

  onDockEnter() {
    if (Date.now() < this.lockOpenUntil) return;
    if (Date.now() < this.typingLockUntil) return;
    if (this.isOpenSuppressed()) return;
    const recentMove = this.isRecentMouseMove(500);
    const insideDockRect = this.isCursorInsideDockRect();
    const hitOnDock = this.isPointerOnDockHitTarget();
    if (!recentMove || !insideDockRect || !hitOnDock) return;

    this.pointerOverDock = true;
    this.revealHoldUntil = 0;
    this.clearRevealTimer("dock-enter");
    this.showDock("dock-enter");
  }

  onDockLeave() {
    // Fast cross-node pointer transitions can emit transient leave events.
    // If cursor is still on the dock hit area, keep it open.
    if (this.isCursorInsideDockRect() || this.isPointerOnDockHitTarget()) {
      this.pointerOverDock = true;
      this.clearHideTimer();
      return;
    }
    this.pointerOverDock = false;
    this.clearRevealTimer("dock-leave");
    this.scheduleHide(this.hideDelayMs);
  }

  onResize() {
    this._dockHeightDirty = true;
    this.startRailFollow(700);
    // PERF: Debounce resize → safeTick via RAF to avoid redundant layout during drag-resize
    if (this._resizeRafPending) return;
    this._resizeRafPending = true;
    requestAnimationFrame(() => {
      this._resizeRafPending = false;
      this.safeTick();
    });
  }

  onWindowBlur() {
    this.suppressOpenUntil = Date.now() + this.focusReentryGuardMs;
    this.requireRevealReset = true;

    this.pointerOverDock = false;
    this.hasMouseMoved = false;
    this.lastMouseMoveAt = 0;
    this.revealHoldUntil = 0;
    this.clearRevealTimer("blur");
    this.hideDock();
  }

  onWindowFocus() {
    this.suppressOpenUntil = Date.now() + this.focusReentryGuardMs;
    this.requireRevealReset = true;

    this.pointerOverDock = false;
    this.hasMouseMoved = false;
    this.lastMouseMoveAt = 0;
    this.revealHoldUntil = 0;
    this.clearRevealTimer("focus");
  }

  onVisibilityChange() {
    if (document.visibilityState === "visible") {
      this.suppressOpenUntil = Date.now() + this.focusReentryGuardMs;
      this.requireRevealReset = true;
  
      this.pointerOverDock = false;
      this.hasMouseMoved = false;
      this.lastMouseMoveAt = 0;
      this.revealHoldUntil = 0;
      this.clearRevealTimer("visibility-visible");
    }
  }

  // ── Typing Detection ──────────────────────────────────────────────────────

  touchTypingLock(source, target) {
    const active = target instanceof Element
      ? target
      : (document.activeElement instanceof Element ? document.activeElement : null);
    if (!this.isElementInMessageComposer(active)) return;
    const now = Date.now();
    const nextLock = now + this.typingLockMs;
    if (nextLock > this.typingLockUntil) this.typingLockUntil = nextLock;
    // PERF: beforeinput + input + keydown all fire per keystroke (3-5x).
    // Timestamp update above is cheap, but DOM work below is expensive.
    // Throttle DOM manipulation to once per frame (~16ms).
    if (this._lastTypingLockDOM && now - this._lastTypingLockDOM < 16) return;
    this._lastTypingLockDOM = now;
    this.clearRevealTimer("typing-lock");
    this.clearHideTimer();
    this.pointerOverDock = false;
    this.revealHoldUntil = 0;
    this.suppressOpenUntil = Math.max(this.suppressOpenUntil, now + this.composerHideSuppressMs);
    this.requireRevealReset = true;
    if (this.stateTarget) {
      this.stateTarget.classList.add("sl-dock-composer-lock");
      if (!this.stateTarget.classList.contains("sl-dock-hidden")) {
        this.stateTarget.classList.add("sl-dock-hidden");
        this.stateTarget.classList.remove("sl-dock-visible");
      }
      this.applyDockStateInline();
    }
  }

  onComposerInput(event) { this.touchTypingLock("input", event?.target || null); }

  onComposerKeyDown(event) {
    if (!event) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = String(event.key || "");
    const isTypingKey = key.length === 1 || key === "Backspace" || key === "Delete" || key === "Enter";
    if (!isTypingKey) return;
    this.touchTypingLock("keydown", event.target || null);
  }

  onComposerFocusIn(event) {
    if (!event || !event.target) return;
    const el = event.target instanceof Element ? event.target : null;
    if (!el) return;
    if (!el.matches(COMPOSER_EDITABLE_SELECTORS) && !this.isElementInMessageComposer(el)) return;
    this.clearRevealTimer("composer-focus");
    this.requireRevealReset = true;
  }

  isElementInMessageComposer(el) {
    if (!el || !(el instanceof Element)) return false;
    // PERF: Cache result — same element reference always gives same answer.
    // Avoids closest() with 10 selectors walking up DOM 3-5x per keystroke.
    if (el === this._cachedComposerEl) return this._cachedComposerResult;
    const result = Boolean(el.closest(COMPOSER_CONTAINER_SELECTORS));
    this._cachedComposerEl = el;
    this._cachedComposerResult = result;
    return result;
  }

  // ── Cursor Geometry ───────────────────────────────────────────────────────

  isCursorInRevealStrip(x = this.lastMouseX, y = this.lastMouseY) {
    if (typeof x !== "number" || typeof y !== "number") return false;
    if (x < 0 || y < 0) return false;
    if (x > window.innerWidth || y > window.innerHeight) return false;
    if (!this.dock || !this.dock.getBoundingClientRect) {
      return y >= window.innerHeight - this.revealZonePx;
    }
    const rect = this.dock.getBoundingClientRect();
    const zoneTop = Math.max(0, rect.top - this.revealZonePx);
    const zoneBottom = Math.min(window.innerHeight, rect.bottom + 2);
    return y >= zoneTop && y <= zoneBottom;
  }

  // Backward-compat alias used by debug tooling.
  isCursorNearBottom(x = this.lastMouseX, y = this.lastMouseY) {
    return this.isCursorInRevealStrip(x, y);
  }

  isCursorInsideDockRect(x = this.lastMouseX, y = this.lastMouseY) {
    if (!this.dock || !this.dock.getBoundingClientRect) return false;
    if (typeof x !== "number" || typeof y !== "number") return false;
    if (x < 0 || y < 0) return false;
    const rect = this.dock.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  isPointerOnDockHitTarget(x = this.lastMouseX, y = this.lastMouseY) {
    if (!this.dock || !document?.elementFromPoint) return false;
    if (typeof x !== "number" || typeof y !== "number") return false;
    if (x < 0 || y < 0) return false;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit instanceof Element)) return false;
    if (hit === this.dock || this.dock.contains(hit)) return true;
    if (this.userPanel && (hit === this.userPanel || this.userPanel.contains(hit))) return true;
    return false;
  }

  isRecentMouseMove(maxAgeMs = 500) {
    if (!this.lastMouseMoveAt) return false;
    return Date.now() - this.lastMouseMoveAt <= maxAgeMs;
  }

  // ── Dock Height ───────────────────────────────────────────────────────────

  updateDockHeightVar() {
    // PERF: Only re-measure when dock geometry may have changed (resize, dock swap)
    if (!this._dockHeightDirty && this._lastDockHeight) return;
    if (!this.stateTarget || !this.dock) return;
    const rect = this.dock.getBoundingClientRect();
    const h = Math.max(52, Math.round(rect.height || this.dock.offsetHeight || 80));
    const next = `${h}px`;
    if (this._lastDockHeight !== next) {
      this._lastDockHeight = next;
      this.stateTarget.style.setProperty("--sl-dock-height", next);
    }
    this._dockHeightDirty = false;
  }

  // ── Alert Rail ────────────────────────────────────────────────────────────

  createRail() {
    if (this.rail) return;
    const rail = document.createElement("div");
    rail.id = "sl-hsl-alert-rail";
    rail.style.cssText = [
      "position: fixed", "left: 0px", "top: 0px", "width: 0px",
      `height: ${this.railHeightPx}px`, "pointer-events: none", "opacity: 0", "z-index: 40",
      "background: linear-gradient(90deg, rgba(138,43,226,0.96), rgba(167,139,250,0.96))",
      "box-shadow: 0 0 18px rgba(138,43,226,0.68), 0 0 34px rgba(138,43,226,0.42)",
      "transform: none",
      "transition: opacity 180ms ease, top 120ms cubic-bezier(0.2, 0.75, 0.25, 1)",
    ].join(";");
    this.rail = rail;
  }

  mountRailToDock() {
    if (!this.rail) return;
    if (this.rail.parentElement !== document.body) document.body.appendChild(this.rail);
  }

  removeRail() {
    if (!this.rail) return;
    this.rail.remove();
    this.rail = null;
  }

  startRailFollow(durationMs = 520) {
    this.stopRailFollow();
    const startedAt = performance.now();
    const step = (now) => {
      this.updateRailGeometry();
      if (!this.rail || !this.root) { this.railFollowFrame = null; return; }
      if (now - startedAt >= durationMs) { this.railFollowFrame = null; return; }
      this.railFollowFrame = requestAnimationFrame(step);
    };
    this.railFollowFrame = requestAnimationFrame(step);
  }

  stopRailFollow() {
    if (!this.railFollowFrame) return;
    cancelAnimationFrame(this.railFollowFrame);
    this.railFollowFrame = null;
  }

  updateAlertState() {
    if (!this.dock) {
      this.railVisible = false;
      if (this.rail) this.rail.style.opacity = "0";
      return;
    }
    const hasBlockingDialog = Boolean(document.querySelector("div[role='dialog']"));
    let candidates = this.dock.querySelectorAll(ALERT_SELECTOR_STR);
    if (!candidates.length && this.dock.parentElement) {
      candidates = this.dock.parentElement.querySelectorAll(ALERT_SELECTOR_STR);
    }
    let hasAlert = false;
    if (!hasBlockingDialog) {
      for (const el of candidates) {
        if (this.isAlertNodeActive(el)) { hasAlert = true; break; }
      }
    }
    const changed = hasAlert !== this.railVisible;
    this.railVisible = hasAlert;
    if (this.rail) this.rail.style.opacity = hasAlert ? "1" : "0";
    if (changed) this.startRailFollow(700);
  }

  updateRailGeometry() {
    if (!this.rail || !this.dock) return;
    const target = this.dockMoveTarget || this.dock;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) { this.rail.style.opacity = "0"; return; }
    let left = Math.round(rect.left);
    let top = Math.round(rect.top - this.railHeightPx);
    // Nudge rail down 2px when dock is visible so it doesn't overlap content above
    if (this.stateTarget?.classList?.contains("sl-dock-visible")) top += 5;
    if (left < 0) left = 0;
    const maxTop = window.innerHeight - this.railHeightPx;
    if (top < 0) top = 0;
    if (top > maxTop) top = maxTop;
    let width = Math.max(1, Math.round(rect.width));
    const maxWidth = Math.max(1, window.innerWidth - left);
    if (width > maxWidth) width = maxWidth;
    this.rail.style.left = `${left}px`;
    this.rail.style.top = `${top}px`;
    this.rail.style.width = `${width}px`;
  }

  _isAlertNodeUsable(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    // offsetParent is null for display:none elements (cheaper than getComputedStyle)
    if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
    return true;
  }

  _getAlertNodeTextData(el) {
    return {
      className: String(el.className || "").toLowerCase(),
      label: String(el.getAttribute("aria-label") || "").toLowerCase(),
      text: String(el.textContent || "").trim().toLowerCase(),
    };
  }

  _isMentionLabelActive(label) {
    if (!label) return false;
    if (label.includes("no mention") || label.includes("no mentions")) return false;
    if (!label.includes("mention")) return false;
    const amount = label.match(DIGITS_RE);
    return amount ? Number(amount[0]) > 0 : true;
  }

  _isBadgeClassActive(className, text) {
    if (!className.includes("mentionsbadge") && !className.includes("numberbadge")) return false;
    return DIGITS_ONLY_RE.test(text) ? Number(text) > 0 : true;
  }

  isAlertNodeActive(el) {
    if (!this._isAlertNodeUsable(el)) return false;
    const { className, label, text } = this._getAlertNodeTextData(el);
    if (this._isMentionLabelActive(label)) return true;
    return this._isBadgeClassActive(className, text);
  }

  // ── Debug Infrastructure ──────────────────────────────────────────────────

  debug(event, data = {}, includeState = false) {
    return debugDockEngine(this, event, data, includeState);
  }

  installDebugApi() {
    return installDebugApi(this);
  }

  removeDebugApi() {
    return removeDebugApi(this);
  }

  initDebugFileSink() {
    return initDebugFileSink(this);
  }

  writeDebugEntry(entry) {
    return writeDebugEntry(this, entry);
  }

  snapshotState() {
    return snapshotState(this);
  }

  sanitizeDebugData(data) {
    return sanitizeDebugData(this, data);
  }

  sanitizeDebugValue(value) {
    return sanitizeDebugValue(this, value);
  }

  describeDock(el) {
    return describeDock(el);
  }
}

module.exports = { DockEngine };
