/**
 * @name HSLDockAutoHide
 * @description Auto-hide/show bottom horizontal server dock on hover/near-bottom cursor, with dynamic layout shift. Includes user panel dock mover (originally by BlueFlashX1).
 * @version 4.0.0
 * @author Solo Leveling Theme Dev, BlueFlashX1
 *
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
 */

// ─── Selector Configuration ─────────────────────────────────────────────────
// Centralized for easy updating when Discord changes class names.

const DOCK_SELECTORS = [
  "nav[aria-label='Servers sidebar']",
  "nav[aria-label='Servers']",
  "nav[class*='guilds_']",
  "[class*='guilds_'][class*='wrapper_']",
];

const PANEL_SELECTORS = [
  "section[aria-label='User status and settings']",
  "section[class*='panels_'] > section",
];

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
    this.revealZonePx = 72;
    this.hideDelayMs = 220;
    this.revealHoldMs = 900;
    this.revealConfirmMs = 140;
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
    this.revealCandidateAt = 0;
    this.pointerOverDock = false;
    this.lastMouseX = -1;
    this.lastMouseY = -1;
    this.lastMouseMoveAt = 0;
    this.hasMouseMoved = false;

    // ── DOM references ──
    this.dock = null;
    this.dockMoveTarget = null;
    this.dockBaseTop = null;
    this.dockBaseLeft = null;
    this.rail = null;
    this.railVisible = false;
    this.railFollowFrame = null;
    this.userPanel = null;
    this.isUserPanelPositioned = false;
    this._panelHoverContainer = null;
    this._onPanelEnter = null;
    this._onPanelLeave = null;
    this._lastDockHeight = null;
    this._origPanelsHeight = document.body.style.getPropertyValue("--custom-app-panels-height") || null;

    // ── Timers ──
    this.hideTimer = null;
    this.revealTimer = null;
    this.syncInterval = null;

    // ── Debug ──
    this.tickCount = 0;
    this.debugEnabled = false;
    this.debugConsole = false;
    this.debugFileEnabled = false;
    this.debugMaxEntries = 2200;
    this.debugBuffer = [];
    this.debugSeq = 0;
    this.debugLastNearBottom = null;
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
    this.safeTick();
    this.syncInterval = setInterval(this.safeTick, 850);

    this.debug("mount:ready", { syncIntervalMs: 850 }, true);
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
  }

  // ── Dock Discovery (called by React effect + safeTick) ────────────────────

  syncDock() {
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
    this.dockBaseTop = null;
    this.dockBaseLeft = null;
    this.pointerOverDock = false;

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
    const selectorStr = DOCK_SELECTORS.join(", ");
    const docks = Array.from(document.querySelectorAll(selectorStr));
    if (!docks.length) return null;

    let best = null;
    let bestScore = -Infinity;
    for (const dock of docks) {
      const rect = dock.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 24) continue;
      const style = getComputedStyle(dock);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const score = rect.width + rect.top * 2;
      if (score > bestScore) { best = dock; bestScore = score; }
    }

    const chosen = best || docks[0];
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
    const selectorStr = PANEL_SELECTORS.join(", ");
    const panel = document.querySelector(selectorStr);
    const dock = this.dock;

    if (!panel || !dock) return;

    if (this.isUserPanelPositioned && panel === this.userPanel) {
      if (!panel.classList.contains("sl-userpanel-docked")) {
        panel.classList.add("sl-userpanel-docked");
      }
      if (!this._panelHoverContainer) this.bindUserPanelHover(panel);
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

      // Still call syncDock + trySetupUserPanel as safety net (reduced urgency)
      this.syncDock();
      this.trySetupUserPanel();

      // Typing lock enforcement
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
    this.hideTimer = setTimeout(() => this.hideDock(), delayMs);
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
    this.pointerOverDock = (
      this.hasMouseMoved &&
      this.isCursorInsideDockRect() &&
      this.isPointerOnDockHitTarget()
    );
  }

  // ── Event Handlers ────────────────────────────────────────────────────────

  onMouseMove(event) {
    if (Date.now() < this.lockOpenUntil) return;
    this.hasMouseMoved = true;
    this.lastMouseMoveAt = Date.now();
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;

    if (Date.now() < this.typingLockUntil) {
      this.clearRevealTimer("typing-active-move");
      this.clearHideTimer();
      return;
    }

    if (this.requireRevealReset) {
      this.requireRevealReset = false;
      this.revealCandidateAt = 0;
    }

    const nearBottom = this.isCursorInRevealStrip(event.clientX, event.clientY);
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
    this.pointerOverDock = false;
    this.clearRevealTimer("dock-leave");
    this.scheduleHide(this.hideDelayMs);
  }

  onResize() {
    this.dockBaseTop = null;
    this.dockBaseLeft = null;
    this.startRailFollow(700);
    this.safeTick();
  }

  onWindowBlur() {
    this.suppressOpenUntil = Date.now() + this.focusReentryGuardMs;
    this.requireRevealReset = true;
    this.revealCandidateAt = 0;
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
    this.revealCandidateAt = 0;
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
      this.revealCandidateAt = 0;
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

  isTypingInMessageComposer() {
    if (Date.now() < this.typingLockUntil) return true;
    const active = document.activeElement;
    if (active && active instanceof Element) {
      if (active.matches(COMPOSER_EDITABLE_SELECTORS)) return true;
      if (this.isElementInMessageComposer(active)) return true;
    }
    return false;
  }

  isElementInMessageComposer(el) {
    if (!el || !(el instanceof Element)) return false;
    return Boolean(el.closest(COMPOSER_CONTAINER_SELECTORS));
  }

  isComposerFocused() {
    const active = document.activeElement;
    if (!active || !(active instanceof Element)) return false;
    if (active.matches(COMPOSER_EDITABLE_SELECTORS)) return true;
    if (this.isElementInMessageComposer(active)) return true;
    return false;
  }

  // ── Cursor Geometry ───────────────────────────────────────────────────────

  isCursorWithinDockX(x = this.lastMouseX) {
    if (typeof x !== "number" || x < 0) return false;
    if (!this.dock || !this.dock.getBoundingClientRect) return true;
    const rect = this.dock.getBoundingClientRect();
    return x >= rect.left && x <= rect.right;
  }

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

  isCursorInsideDockRect(x = this.lastMouseX, y = this.lastMouseY) {
    if (!this.dock || !this.dock.getBoundingClientRect) return false;
    if (typeof x !== "number" || typeof y !== "number") return false;
    if (x < 0 || y < 0) return false;
    const rect = this.dock.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  isCursorNearBottom() {
    return this.isCursorInRevealStrip(this.lastMouseX, this.lastMouseY);
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
    if (!this.stateTarget || !this.dock) return;
    const rect = this.dock.getBoundingClientRect();
    const h = Math.max(52, Math.round(rect.height || this.dock.offsetHeight || 80));
    const next = `${h}px`;
    if (this._lastDockHeight !== next) {
      this._lastDockHeight = next;
      this.stateTarget.style.setProperty("--sl-dock-height", next);
    }
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
    const selectorStr = ALERT_SELECTORS.join(",");
    let candidates = this.dock.querySelectorAll(selectorStr);
    if (!candidates.length && this.dock.parentElement) {
      candidates = this.dock.parentElement.querySelectorAll(selectorStr);
    }
    const hasAlert = !hasBlockingDialog && Array.from(candidates).some((el) => this.isAlertNodeActive(el));
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

  isAlertNodeActive(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    try {
      const style = getComputedStyle(el);
      if (style.display === "none") return false;
    } catch (error) {
      this.debugEnabled && console.warn("[HSLDockAutoHide] Failed to read computed style for alert node", error);
    }
    const cls = String(el.className || "").toLowerCase();
    const label = String(el.getAttribute("aria-label") || "").toLowerCase();
    const text = String(el.textContent || "").trim().toLowerCase();
    if (label.includes("no mention") || label.includes("no mentions")) return false;
    if (label.includes("mention") || label.includes("mentions")) {
      const amount = label.match(/\d+/);
      if (amount) return Number(amount[0]) > 0;
      return true;
    }
    if (cls.includes("mentionsbadge") || cls.includes("numberbadge")) {
      if (/^\d+$/.test(text)) return Number(text) > 0;
      return true;
    }
    return false;
  }

  // ── Debug Infrastructure ──────────────────────────────────────────────────

  debug(event, data = {}, includeState = false) {
    if (!this.debugEnabled) return;
    const entry = { seq: ++this.debugSeq, at: new Date().toISOString(), event, ...this.sanitizeDebugData(data) };
    if (includeState) entry.state = this.snapshotState();
    this.debugBuffer.push(entry);
    if (this.debugBuffer.length > this.debugMaxEntries) this.debugBuffer.shift();
    this.writeDebugEntry(entry);
    if (this.debugConsole) {
      try {
        console.debug("[HSLDockAutoHide]", entry);
      } catch (error) {
        this.debugEnabled && console.warn("[HSLDockAutoHide] Failed to write debug console entry", error);
      }
    }
  }

  installDebugApi() {
    try {
      const engine = this;
      const handle = {
        version: this.version,
        getLogs: () => engine.debugBuffer.slice(),
        dump: () => { const logs = engine.debugBuffer.slice(); console.group("[HSLDockAutoHide] Debug dump"); console.table(logs); console.groupEnd(); return logs; },
        state: () => engine.snapshotState(),
        filePath: () => engine.debugFilePath,
        clear: () => { engine.debugBuffer.length = 0; engine.debugSeq = 0; return true; },
      };
      try {
        window.__HSLDockAutoHideDebug = handle;
      } catch (error) {
        this.debugEnabled && console.warn("[HSLDockAutoHide] Failed to install debug API on window", error);
      }
      try {
        globalThis.__HSLDockAutoHideDebug = handle;
      } catch (error) {
        this.debugEnabled && console.warn("[HSLDockAutoHide] Failed to install debug API on globalThis", error);
      }
    } catch (error) {
      this.debugEnabled && console.warn("[HSLDockAutoHide] Failed to install debug API", error);
    }
  }

  removeDebugApi() {
    try {
      delete window.__HSLDockAutoHideDebug;
    } catch (error) {
      this.debugEnabled && console.warn("[HSLDockAutoHide] Failed to remove debug API from window", error);
    }
    try {
      delete globalThis.__HSLDockAutoHideDebug;
    } catch (error) {
      this.debugEnabled && console.warn("[HSLDockAutoHide] Failed to remove debug API from globalThis", error);
    }
  }

  initDebugFileSink() {
    if (!this.debugFileEnabled) return;
    try {
      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      const dir = path.join(os.homedir(), "Library", "Application Support", "BetterDiscord", "logs", "HSLDockAutoHide");
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      this.debugFilePath = path.join(dir, `dock-autohide-${stamp}.jsonl`);
      this.fs = fs;
    } catch (error) {
      this.debugFilePath = null;
      this.fs = null;
      this.debugEnabled && console.warn("[HSLDockAutoHide] Failed to initialize debug file sink", error);
    }
  }

  writeDebugEntry(entry) {
    if (!this.debugFileEnabled || !this.fs || !this.debugFilePath) return;
    try {
      this.fs.appendFileSync(this.debugFilePath, JSON.stringify(entry) + "\n");
    } catch (error) {
      this.debugEnabled && console.warn("[HSLDockAutoHide] Failed writing debug entry to file", error);
    }
  }

  snapshotState() {
    return {
      lockRemainingMs: Math.max(0, this.lockOpenUntil - Date.now()),
      hasMouseMoved: this.hasMouseMoved,
      lastMouseX: this.lastMouseX,
      lastMouseY: this.lastMouseY,
      pointerOverDock: this.pointerOverDock,
      nearBottom: this.isCursorNearBottom(),
      rootHiddenClass: Boolean(this.stateTarget?.classList?.contains("sl-dock-hidden")),
      rootVisibleClass: Boolean(this.stateTarget?.classList?.contains("sl-dock-visible")),
      dock: this.describeDock(this.dock),
      dockTarget: this.describeDock(this.dockMoveTarget),
      railVisible: this.railVisible,
      railMounted: Boolean(this.rail && this.rail.parentElement),
      hideTimerActive: Boolean(this.hideTimer),
      tickCount: this.tickCount,
    };
  }

  sanitizeDebugData(data) {
    const out = {};
    if (!data || typeof data !== "object") return out;
    for (const [k, v] of Object.entries(data)) out[k] = this.sanitizeDebugValue(v);
    return out;
  }

  sanitizeDebugValue(value) {
    if (value == null) return value;
    if (value instanceof Element) return this.describeDock(value);
    if (Array.isArray(value)) return value.map((v) => this.sanitizeDebugValue(v));
    if (typeof value === "object") { const obj = {}; for (const [k, v] of Object.entries(value)) obj[k] = this.sanitizeDebugValue(v); return obj; }
    if (typeof value === "function") return "[Function]";
    return value;
  }

  describeDock(el) {
    if (!el) return null;
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return {
      tag: String(el.tagName || "").toLowerCase(),
      id: el.id || null,
      className: typeof el.className === "string" ? el.className : null,
      ariaLabel: el.getAttribute?.("aria-label") || null,
      rect: rect ? { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
    };
  }
}

// ─── Plugin Class ───────────────────────────────────────────────────────────

module.exports = class HSLDockAutoHide {
  constructor() {
    this._patcherId = 'HSLDockAutoHide';
    this._isStopped = false;
    this._engineMounted = false;
    this._fallbackEngine = null;
    this._fallbackTimer = null;
  }

  start() {
    this._isStopped = false;
    this._engineMounted = false;
    this._fallbackEngine = null;
    BdApi.DOM.addStyle('HSLDockAutoHide', this.getCSS());
    this._installReactPatcher();

    // Fallback: if React patcher does not mount within 3s, mount engine directly
    this._fallbackTimer = setTimeout(() => {
      this._fallbackTimer = null;
      if (!this._isStopped && !this._engineMounted) {
        console.warn('[HSLDockAutoHide] React patcher did not mount — using direct DOM fallback');
        const engine = new DockEngine();
        this._fallbackEngine = engine;
        this._engineMounted = true;
        engine.mount();
      }
    }, 3000);

    BdApi.UI.showToast("HSLDockAutoHide v4.0.0 active (+ UserPanel)", { type: "success", timeout: 2200 });
  }

  stop() {
    this._isStopped = true;
    // Clear fallback timer
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
    // Unmount fallback engine if active
    if (this._fallbackEngine) {
      this._fallbackEngine.unmount();
      this._fallbackEngine = null;
    }
    this._engineMounted = false;
    BdApi.Patcher.unpatchAll(this._patcherId);
    BdApi.DOM.removeStyle('HSLDockAutoHide');
    // Cleanup any residual state left if React component already unmounted
    document.body.classList.remove("sl-dock-autohide", "sl-dock-visible", "sl-dock-hidden", "sl-dock-composer-lock");
    document.body.style.removeProperty("--sl-dock-height");
    document.body.style.removeProperty("--sl-dock-peek");
    document.body.style.removeProperty("--custom-app-panels-height");
    document.querySelectorAll(".sl-hsl-dock-target").forEach(el => el.classList.remove("sl-hsl-dock-target"));
    document.querySelectorAll(".sl-userpanel-docked").forEach(el => el.classList.remove("sl-userpanel-docked"));
    document.getElementById("sl-hsl-alert-rail")?.remove();
    BdApi.UI.showToast("HSLDockAutoHide stopped", { type: "info", timeout: 2000 });
  }

  // ── React Patcher — MainContent.Z ─────────────────────────────────────────

  _installReactPatcher() {
    let ReactUtils;
    try {
      ReactUtils = require('./BetterDiscordReactUtils.js');
    } catch (_) {
      ReactUtils = null;
    }

    if (ReactUtils) {
      const pluginInstance = this;
      const ok = ReactUtils.patchReactMainContent(this, this._patcherId, (React, appNode, returnValue) => {
        const component = React.createElement(pluginInstance._DockController, {
          key: 'sl-dock-autohide',
          pluginInstance,
        });
        ReactUtils.injectReactComponent(appNode, 'sl-dock-autohide-root', component, returnValue);
      });
      if (!ok) {
        console.error('[HSLDockAutoHide] MainContent module not found — plugin inactive');
      }
      return;
    }

    // Inline fallback if BetterDiscordReactUtils.js is not available
    let MainContent = BdApi.Webpack.getByStrings('baseLayer', { defaultExport: false });
    if (!MainContent) {
      MainContent = BdApi.Webpack.getByStrings('appMount', { defaultExport: false });
    }
    if (!MainContent) {
      console.error('[HSLDockAutoHide] MainContent module not found — plugin inactive');
      return;
    }

    const React = BdApi.React;
    const pluginInstance = this;

    BdApi.Patcher.after(this._patcherId, MainContent, 'Z', (_this, _args, returnValue) => {
      try {
        if (pluginInstance._isStopped) return returnValue;

        const appNode = BdApi.Utils.findInTree(
          returnValue,
          (prop) =>
            prop && prop.props &&
            (prop.props.className?.includes('app') ||
              prop.props.id === 'app-mount' ||
              prop.type === 'body'),
          { walkable: ['props', 'children'] }
        );

        if (!appNode || !appNode.props) {
          if (!pluginInstance._appNodeWarnLogged) {
            console.warn('[HSLDockAutoHide] findInTree could not locate appNode in React tree — fallback will activate');
            pluginInstance._appNodeWarnLogged = true;
          }
          return returnValue;
        }

        const already = BdApi.Utils.findInTree(
          returnValue,
          (prop) => prop && prop.props && prop.props.id === 'sl-dock-autohide-root',
          { walkable: ['props', 'children'] }
        );
        if (already) return returnValue;

        const controller = React.createElement(pluginInstance._DockController, {
          key: 'sl-dock-autohide',
          pluginInstance,
        });
        const wrapper = React.createElement('div', {
          id: 'sl-dock-autohide-root',
          style: { display: 'contents' },
        }, controller);

        if (Array.isArray(appNode.props.children)) {
          appNode.props.children.push(wrapper);
        } else if (appNode.props.children) {
          appNode.props.children = [appNode.props.children, wrapper];
        } else {
          appNode.props.children = wrapper;
        }
      } catch (e) {
        console.error('[HSLDockAutoHide] React patcher error:', e);
      }
      return returnValue;
    });
  }

  // ── DockAutoHideController — React Functional Component ───────────────────

  get _DockController() {
    if (this.__DockControllerCached) return this.__DockControllerCached;

    this.__DockControllerCached = ({ pluginInstance }) => {
      const React = BdApi.React;
      const engineRef = React.useRef(null);

      // Mount: create engine, attach listeners, start tick
      React.useEffect(() => {
        if (pluginInstance._isStopped) return;

        // Signal that React mount succeeded — cancel fallback
        pluginInstance._engineMounted = true;
        if (pluginInstance._fallbackTimer) {
          clearTimeout(pluginInstance._fallbackTimer);
          pluginInstance._fallbackTimer = null;
        }
        // If fallback engine already started, unmount it
        if (pluginInstance._fallbackEngine) {
          pluginInstance._fallbackEngine.unmount();
          pluginInstance._fallbackEngine = null;
        }

        const engine = new DockEngine();
        engineRef.current = engine;
        engine.mount();
        console.log('[HSLDockAutoHide] React patcher mounted DockEngine successfully');
        return () => {
          engine.unmount();
          engineRef.current = null;
        };
      }, []);

      // Re-discover DOM elements on every React render (instant recovery)
      React.useEffect(() => {
        if (!engineRef.current || pluginInstance._isStopped) return;
        engineRef.current.syncDock();
        engineRef.current.trySetupUserPanel();
      }); // No deps = runs on every render

      return null; // No visible output
    };

    return this.__DockControllerCached;
  }

  // ── CSS ───────────────────────────────────────────────────────────────────

  getCSS() {
    return `
      body.sl-dock-autohide {
        --sl-dock-height: 80px;
        --sl-dock-peek: 8px;
      }

      body.sl-dock-autohide .sl-hsl-dock-target {
        transition: translate 240ms cubic-bezier(0.2, 0.75, 0.25, 1) !important;
        will-change: translate;
        scale: 1 !important;
      }

      body.sl-dock-autohide.sl-dock-visible .sl-hsl-dock-target {
        translate: 0 0 !important;
      }

      body.sl-dock-autohide.sl-dock-hidden .sl-hsl-dock-target {
        translate: 0 calc(var(--sl-dock-height) - var(--sl-dock-peek)) !important;
      }

      body.sl-dock-autohide.sl-dock-composer-lock .sl-hsl-dock-target {
        transition: none !important;
        translate: 0 calc(var(--sl-dock-height) - var(--sl-dock-peek)) !important;
      }

      body.sl-dock-autohide [class*="base_"][data-fullscreen="false"] > [class*="content_"] {
        transition: margin-bottom 240ms cubic-bezier(0.2, 0.75, 0.25, 1) !important;
        margin-bottom: var(--sl-dock-height) !important;
      }

      body.sl-dock-autohide.sl-dock-hidden [class*="base_"][data-fullscreen="false"] > [class*="content_"] {
        margin-bottom: var(--sl-dock-peek) !important;
      }

      /* ── User Panel Dock Mover ── */
      section[aria-label="User status and settings"].sl-userpanel-docked {
        position: fixed !important;
        right: 0 !important;
        left: auto !important;
        z-index: 42 !important;
        pointer-events: none !important;
        height: var(--sl-dock-height, 80px) !important;
        width: 300px !important;
        min-width: 300px !important;
        max-width: 300px !important;
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        padding: 4px 12px !important;
        margin: 0 !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 0 !important;
        overflow: hidden !important;
        transition: bottom 240ms cubic-bezier(0.2, 0.75, 0.25, 1),
                    opacity 180ms ease !important;
      }

      body.sl-dock-autohide.sl-dock-hidden section[aria-label="User status and settings"].sl-userpanel-docked {
        bottom: calc(-1 * (var(--sl-dock-height, 80px) - var(--sl-dock-peek, 8px))) !important;
      }

      body.sl-dock-autohide.sl-dock-visible section[aria-label="User status and settings"].sl-userpanel-docked {
        bottom: 0 !important;
      }

      body.sl-dock-autohide.sl-dock-composer-lock section[aria-label="User status and settings"].sl-userpanel-docked {
        transition: none !important;
        bottom: calc(-1 * (var(--sl-dock-height, 80px) - var(--sl-dock-peek, 8px))) !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="wrapper_"]:empty {
        display: none !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="wrapper_"] {
        pointer-events: auto !important;
        margin: 0 6px 0 0 !important;
        padding: 0 !important;
        flex-shrink: 0 !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="container_"] {
        pointer-events: auto !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        padding: 4px 12px !important;
        margin: 0 !important;
        border-radius: 8px !important;
        background: rgba(8, 10, 20, 0.96) !important;
        background-image: none !important;
        border-left: 1px solid rgba(138, 43, 226, 0.22) !important;
        box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3) !important;
        gap: 10px !important;
        min-width: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        flex: 1 1 0% !important;
        height: auto !important;
        max-height: calc(var(--sl-dock-height, 80px) - 10px) !important;
        overflow: hidden !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked > div[class^="container_"] > * {
        max-width: none !important;
        min-width: 0 !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked [class^="nameTag_"],
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="panelSubtextContainer_"],
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="panelTitleContainer_"] {
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        max-width: none !important;
        width: auto !important;
        flex: 1 1 0% !important;
        min-width: 0 !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked [class^="avatarWrapper_"],
      section[aria-label="User status and settings"].sl-userpanel-docked [class*="withTagAsButton_"],
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="canCopy_"] {
        flex: 1 1 0% !important;
        min-width: 0 !important;
        max-width: none !important;
        width: auto !important;
        overflow: hidden !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked [class^="avatar_"] {
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
        flex-shrink: 0 !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked [class^="actionButtons_"],
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="actions_"] {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 2px !important;
        flex-shrink: 0 !important;
        flex-grow: 0 !important;
        margin-left: auto !important;
      }

      section[aria-label="User status and settings"].sl-userpanel-docked [class^="actionButtons_"] button,
      section[aria-label="User status and settings"].sl-userpanel-docked [class^="actions_"] button {
        width: 28px !important;
        height: 28px !important;
        min-width: 28px !important;
        padding: 2px !important;
      }

      /* Collapse the sidebar panels wrapper so the fixed-position panel
         does not leave a gap.  The section itself is position:fixed and
         escapes the wrapper's overflow clipping — do NOT collapse the
         section directly or its height:0 will make the fixed panel invisible. */
      div[class^="panels_"]:has(section[aria-label="User status and settings"].sl-userpanel-docked) {
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
    `;
  }
};
