/**
 * @name HSLDockAutoHide
 * @description Auto-hide/show bottom horizontal server dock on hover/near-bottom cursor, with dynamic layout shift.
 * @version 2.0.3
 * @author Solo Leveling Theme Dev
 */

module.exports = class HSLDockAutoHide {
  setDebugHandle(value) {
    try { window.__HSLDockAutoHideDebug = value; } catch (_) {}
    try { globalThis.__HSLDockAutoHideDebug = value; } catch (_) {}
    try { if (window?.BdApi) window.BdApi.__HSLDockAutoHideDebug = value; } catch (_) {}
    try { if (window?.top) window.top.__HSLDockAutoHideDebug = value; } catch (_) {}
    try { if (window?.parent) window.parent.__HSLDockAutoHideDebug = value; } catch (_) {}
  }

  clearDebugHandle() {
    try { delete window.__HSLDockAutoHideDebug; } catch (_) {}
    try { delete globalThis.__HSLDockAutoHideDebug; } catch (_) {}
    try {
      if (window?.BdApi && window.BdApi.__HSLDockAutoHideDebug) {
        delete window.BdApi.__HSLDockAutoHideDebug;
      }
    } catch (_) {}
    try {
      if (window?.top && window.top.__HSLDockAutoHideDebug) {
        delete window.top.__HSLDockAutoHideDebug;
      }
    } catch (_) {}
    try {
      if (window?.parent && window.parent.__HSLDockAutoHideDebug) {
        delete window.parent.__HSLDockAutoHideDebug;
      }
    } catch (_) {}
  }

  start() {
    // Bootstrap debug handle immediately so diagnostics exist even if startup crashes.
    try {
      this.setDebugHandle({
        boot: "starting",
        version: "1.3.0",
        error: null,
        note: "Plugin is bootstrapping. If this persists, startup likely crashed.",
      });
    } catch (_) {}

    try {
    const instanceKey = "__HSLDockAutoHideLiveInstance";
    try {
      const prev = window[instanceKey];
      if (prev && prev !== this && typeof prev.stop === "function") prev.stop();
      window[instanceKey] = this;
    } catch (_) {}

    this.pluginId = "HSLDockAutoHide";
    this.version = "2.0.3";
    this.instanceKey = instanceKey;
    this.root = document.documentElement;
    // Dock state classes live on <body> instead of <html> — Discord's React
    // Helmet (data-rh="lang,style,class") reconciles the <html> class attribute
    // on every keystroke, stripping custom classes and causing flicker.
    this.stateTarget = document.body;
    this.dockSelector = "nav[aria-label='Servers sidebar']";
    this.peekPx = 8;
    this.revealZonePx = 72;
    this.hideDelayMs = 220;
    this.revealHoldMs = 900;
    this.revealHoldUntil = 0;
    this.focusReentryGuardMs = 1000;
    this.composerHideSuppressMs = 1200;
    this.suppressOpenUntil = 0;
    this.requireRevealReset = false;
    this.revealConfirmMs = 140;
    this.revealCandidateAt = 0;
    this.startupLockMs = 6500;
    this.lockOpenUntil = Date.now() + this.startupLockMs;
    this.hideTimer = null;
    this.revealTimer = null;
    this.syncInterval = null;
    this.pointerOverDock = false;
    this.lastMouseX = -1;
    this.lastMouseY = -1;
    this.lastMouseMoveAt = 0;
    this.hasMouseMoved = false;
    this.dockMoveTarget = null;
    this.dockBaseTop = null;
    this.dockBaseLeft = null;
    this.rail = null;
    this.railVisible = false;
    this.railHeightPx = 9;
    this.railFollowFrame = null;
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
    this.typingLockMs = 2600;
    this.typingLockUntil = 0;
    this.composerContainerSelector = [
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
    this.composerEditableSelector = [
      "textarea",
      "input[type='text']",
      "input[type='search']",
      "input:not([type])",
      "[role='textbox']",
      "[contenteditable='']",
      "[contenteditable='true']",
      "[contenteditable='plaintext-only']",
    ].join(", ");
    this.alertSelectors = [
      "[class*='listItem'] [class*='mentionsBadge']",
      "[class*='listItem'] [aria-label*='mention' i]",
      "[class*='pill'] [class*='mentionsBadge']",
      "[class*='pill'] [aria-label*='mention' i]",
      "[class*='numberBadge']",
      "[class*='mentionsBadge']",
    ];

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
    this.syncDock = this.syncDock.bind(this);
    this.safeTick = this.safeTick.bind(this);

    this.initDebugFileSink();
    this.installDebugApi();
    this.debug("start:init", {
      version: this.version,
      revealZonePx: this.revealZonePx,
      peekPx: this.peekPx,
      hideDelayMs: this.hideDelayMs,
      startupLockMs: this.startupLockMs,
      lockOpenUntil: this.lockOpenUntil,
    }, true);

    this.injectStyles();
    this.createRail();

    this.stateTarget.classList.add("sl-dock-autohide", "sl-dock-hidden");
    this.stateTarget.classList.remove("sl-dock-visible");
    this.stateTarget.style.setProperty("--sl-dock-peek", `${this.peekPx}px`);

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

    this.syncDock();
    this.safeTick();
    this.syncInterval = setInterval(this.safeTick, 850);
    this.debug("start:ready", { syncIntervalMs: 850 }, true);

    try {
      if (window.__HSLDockAutoHideDebug) {
        window.__HSLDockAutoHideDebug.boot = "ready";
        window.__HSLDockAutoHideDebug.note = "Plugin started successfully.";
      }
    } catch (_) {}

    BdApi.UI.showToast("HSLDockAutoHide active", { type: "success", timeout: 2200 });
    } catch (err) {
      try {
        const message = String(err?.stack || err?.message || err);
        this.setDebugHandle({
          boot: "failed",
          version: "1.3.0",
          error: message,
          note: "Startup crashed before initialization completed.",
        });
        console.error("[HSLDockAutoHide] startup failed:", err);
        BdApi.UI.showToast("HSLDockAutoHide startup failed (check console)", { type: "error", timeout: 5000 });
      } catch (_) {}
    }
  }

  stop() {
    this.debug("stop:begin", {}, true);
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
    this.clearHideTimer();
    this.clearRevealTimer("stop");
    this.unbindDockEvents();

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (BdApi?.DOM?.removeStyle) BdApi.DOM.removeStyle(this.pluginId);

    if (this.dockMoveTarget) {
      this.dockMoveTarget.classList.remove("sl-hsl-dock-target");
      this.dockMoveTarget.style.removeProperty("translate");
    }

    if (this.stateTarget) {
      this.stateTarget.classList.remove("sl-dock-autohide", "sl-dock-visible", "sl-dock-hidden", "sl-dock-composer-lock");
      this.stateTarget.style.removeProperty("--sl-dock-height");
      this.stateTarget.style.removeProperty("--sl-dock-peek");
    }
    this.removeRail();
    this.stopRailFollow();
    this.removeDebugApi();

    this.root = null;
    this.stateTarget = null;
    this.dock = null;
    this.dockMoveTarget = null;
    this.pointerOverDock = false;
    this.hasMouseMoved = false;
    this.lastMouseX = -1;
    this.railVisible = false;
    this.lastMouseY = -1;

    try {
      if (window[this.instanceKey] === this) delete window[this.instanceKey];
    } catch (_) {}

    BdApi.UI.showToast("HSLDockAutoHide stopped", { type: "info", timeout: 2000 });
  }

  injectStyles() {
    const css = `
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

      /* Kill transition entirely while composer is active — any translate
         change (class toggle, CSS variable update, style re-evaluation)
         during typing would otherwise trigger a 240ms animation flicker. */
      body.sl-dock-autohide.sl-dock-composer-lock .sl-hsl-dock-target {
        transition: none !important;
        translate: 0 calc(var(--sl-dock-height) - var(--sl-dock-peek)) !important;
      }

      /* Move content dynamically with dock visibility */
      body.sl-dock-autohide .base__5e434[data-fullscreen="false"] .content__5e434 {
        transition: margin-bottom 240ms cubic-bezier(0.2, 0.75, 0.25, 1) !important;
        margin-bottom: var(--sl-dock-height) !important;
      }

      body.sl-dock-autohide.sl-dock-hidden .base__5e434[data-fullscreen="false"] .content__5e434 {
        margin-bottom: var(--sl-dock-peek) !important;
      }
    `;

    if (BdApi?.DOM?.addStyle) BdApi.DOM.addStyle(this.pluginId, css);
  }

  createRail() {
    if (this.rail) return;
    const rail = document.createElement("div");
    rail.id = "sl-hsl-alert-rail";
    rail.style.cssText = [
      "position: fixed",
      "left: 0px",
      "top: 0px",
      "width: 0px",
      `height: ${this.railHeightPx}px`,
      "pointer-events: none",
      "opacity: 0",
      "z-index: 40",
      "background: linear-gradient(90deg, rgba(138,43,226,0.96), rgba(167,139,250,0.96))",
      "box-shadow: 0 0 18px rgba(138,43,226,0.68), 0 0 34px rgba(138,43,226,0.42)",
      "transform: none",
      "transition: opacity 180ms ease, top 120ms cubic-bezier(0.2, 0.75, 0.25, 1)",
    ].join(";");
    this.rail = rail;
  }

  startRailFollow(durationMs = 520) {
    this.stopRailFollow();
    const startedAt = performance.now();
    const step = (now) => {
      this.updateRailGeometry();
      if (!this.rail || !this.root) {
        this.railFollowFrame = null;
        return;
      }
      if (now - startedAt >= durationMs) {
        this.railFollowFrame = null;
        return;
      }
      this.railFollowFrame = requestAnimationFrame(step);
    };
    this.railFollowFrame = requestAnimationFrame(step);
  }

  stopRailFollow() {
    if (!this.railFollowFrame) return;
    cancelAnimationFrame(this.railFollowFrame);
    this.railFollowFrame = null;
  }

  removeRail() {
    if (!this.rail) return;
    this.rail.remove();
    this.rail = null;
  }

  safeTick() {
    try {
      this.tickCount += 1;
      this.debug("tick:begin", { tick: this.tickCount });
      if (this.stateTarget && !this.stateTarget.classList.contains("sl-dock-autohide")) {
        this.stateTarget.classList.add("sl-dock-autohide");
      }
      this.syncDock();
      // Immediately correct class state if actively typing — syncDock may
      // have called applyDockStateInline via a dock-change path, and any
      // stale state must be corrected before the rest of the tick runs.
      if (Date.now() < this.typingLockUntil) {
        this.stateTarget.classList.add("sl-dock-composer-lock");
        if (!this.stateTarget.classList.contains("sl-dock-hidden")) {
          this.stateTarget.classList.add("sl-dock-hidden");
          this.stateTarget.classList.remove("sl-dock-visible");
        }
        this.pointerOverDock = false;
        this.revealHoldUntil = 0;
      } else if (this.stateTarget.classList.contains("sl-dock-composer-lock") && !this.isOpenSuppressed()) {
        // Remove composer lock once composer is no longer active and
        // the suppression window has expired — re-enable transitions.
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
    } catch (_) {
      // Keep plugin resilient if Discord DOM shifts during updates.
      this.debug("tick:error", { error: String(_) }, true);
    }
  }

  onResize() {
    this.debug("window:resize", { innerWidth: window.innerWidth, innerHeight: window.innerHeight }, true);
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
    this.debug("window:blur", { suppressOpenUntil: this.suppressOpenUntil }, true);
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
    this.debug("window:focus", { suppressOpenUntil: this.suppressOpenUntil }, true);
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
    this.debug("window:visibility", {
      visibilityState: document.visibilityState,
      suppressOpenUntil: this.suppressOpenUntil,
    }, true);
  }

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
    this.dockMoveTarget = this.resolveDockMoveTarget(nextDock);
    this.dockBaseTop = null;
    this.dockBaseLeft = null;
    this.pointerOverDock = false;

    if (!this.dock) return;
    if (this.dockMoveTarget) this.dockMoveTarget.classList.add("sl-hsl-dock-target");
    this.mountRailToDock();
    // Ensure classes are correct before applying inline state.
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

  unbindDockEvents() {
    if (!this.dock) return;
    this.dock.removeEventListener("mouseenter", this.onDockEnter);
    this.dock.removeEventListener("mouseleave", this.onDockLeave);
  }

  resolveDockMoveTarget(dock) {
    if (!dock) return null;
    return dock;
  }

  findActiveDock() {
    const docks = Array.from(document.querySelectorAll(this.dockSelector));
    if (!docks.length) return null;

    let best = null;
    let bestScore = -Infinity;
    for (const dock of docks) {
      const rect = dock.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 24) continue;
      const style = getComputedStyle(dock);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      // Prefer wider and lower (bottom-dock) candidates.
      const score = rect.width + rect.top * 2;
      if (score > bestScore) {
        best = dock;
        bestScore = score;
      }
    }

    const chosen = best || docks[0];
    this.debug("dock:find", { count: docks.length, chosen: this.describeDock(chosen) });
    return chosen;
  }

  ensureDockTargetClass() {
    if (!this.dockMoveTarget) return;
    if (!this.dockMoveTarget.classList.contains("sl-hsl-dock-target")) {
      this.dockMoveTarget.classList.add("sl-hsl-dock-target");
    }
  }

  applyDockStateInline() {
    if (!this.stateTarget || !this.dockMoveTarget) return;
    // Force hidden classes when actively typing.
    const typingActive = Date.now() < this.typingLockUntil;
    if (typingActive && !this.stateTarget.classList.contains("sl-dock-hidden")) {
      this.stateTarget.classList.add("sl-dock-hidden");
      this.stateTarget.classList.remove("sl-dock-visible");
    }
    // Do NOT set inline translate — the CSS class rules (sl-dock-hidden /
    // sl-dock-visible) handle translate with !important.  Inline !important
    // overrides class !important and causes flicker when the two get out of
    // sync even for a single frame, because the 240ms CSS transition starts
    // animating toward the stale inline value.
    // Instead, just clear any leftover inline translate so the classes win.
    if (this.dockMoveTarget.style.translate) {
      this.dockMoveTarget.style.removeProperty("translate");
    }
    this.debug("dock:apply-inline-state", { typingActive });
  }

  mountRailToDock() {
    if (!this.rail) return;
    const host = document.body;
    if (!host) return;
    if (this.rail.parentElement !== host) {
      host.appendChild(this.rail);
    }
  }

  updateDockHeightVar() {
    if (!this.stateTarget || !this.dock) return;
    const rect = this.dock.getBoundingClientRect();
    const h = Math.max(52, Math.round(rect.height || this.dock.offsetHeight || 80));
    const next = `${h}px`;
    // Only update if actually changed — CSS variable changes retrigger the
    // translate transition and cause visible flicker.
    if (this._lastDockHeight !== next) {
      this._lastDockHeight = next;
      this.stateTarget.style.setProperty("--sl-dock-height", next);
    }
  }

  updateAlertState() {
    if (!this.dock) {
      this.railVisible = false;
      if (this.rail) this.rail.style.opacity = "0";
      return;
    }

    const hasBlockingDialog = Boolean(document.querySelector("div[role='dialog']"));
    // Query from the dock first, then fall back to its parent in case badges
    // live in a sibling wrapper (Discord DOM can restructure across updates).
    const selectorStr = this.alertSelectors.join(",");
    let candidates = this.dock.querySelectorAll(selectorStr);
    if (!candidates.length && this.dock.parentElement) {
      candidates = this.dock.parentElement.querySelectorAll(selectorStr);
    }
    const hasAlert = !hasBlockingDialog && Array.from(candidates).some((el) => this.isAlertNodeActive(el));
    const changed = hasAlert !== this.railVisible;
    this.debug("alert:state", {
      hasBlockingDialog,
      candidateCount: candidates.length,
      hasAlert,
      changed,
    });
    this.railVisible = hasAlert;
    if (this.rail) this.rail.style.opacity = hasAlert ? "1" : "0";
    if (changed) this.startRailFollow(700);
  }

  updateRailGeometry() {
    if (!this.rail || !this.dock) return;
    // Use the move-target's live bounding rect — getBoundingClientRect()
    // already reflects in-flight CSS translate transitions, so the rail
    // tracks the dock smoothly without needing manual translate math.
    const target = this.dockMoveTarget || this.dock;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      this.rail.style.opacity = "0";
      return;
    }

    let left = Math.round(rect.left);
    // Place rail so its bottom edge sits at the dock's top edge.
    let top = Math.round(rect.top - this.railHeightPx);
    if (left < 0) left = 0;
    // Clamp so rail is always fully on-screen (flush to bottom when hidden).
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

  getElementTranslate(el) {
    if (!el || !(el instanceof Element)) return { x: 0, y: 0 };
    const style = getComputedStyle(el);

    let x = 0;
    let y = 0;

    const t = (style.translate || "").trim();
    if (t && t !== "none") {
      const parts = t.split(/\s+/).filter(Boolean);
      if (parts.length >= 1) x = Number.parseFloat(parts[0]) || 0;
      if (parts.length >= 2) y = Number.parseFloat(parts[1]) || 0;
    }

    if (x === 0 && y === 0) {
      const m = style.transform;
      if (m && m !== "none") {
        if (m.startsWith("matrix3d(")) {
          const values = m
            .slice("matrix3d(".length, -1)
            .split(",")
            .map((v) => Number.parseFloat(v.trim()));
          if (values.length === 16) {
            x = values[12] || 0;
            y = values[13] || 0;
          }
        } else if (m.startsWith("matrix(")) {
          const values = m
            .slice("matrix(".length, -1)
            .split(",")
            .map((v) => Number.parseFloat(v.trim()));
          if (values.length === 6) {
            x = values[4] || 0;
            y = values[5] || 0;
          }
        }
      }
    }

    return { x, y };
  }

  isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  isAlertNodeActive(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    // Only reject display:none — skip opacity/visibility checks because when
    // the dock is translated off-screen, computed styles can be unreliable.
    try {
      const style = getComputedStyle(el);
      if (style.display === "none") return false;
    } catch (_) {}

    const cls = String(el.className || "").toLowerCase();
    const label = String(el.getAttribute("aria-label") || "").toLowerCase();
    const text = String(el.textContent || "").trim().toLowerCase();

    // Mention-only rail: ignore generic unread indicators.
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

  isTypingInMessageComposer() {
    if (Date.now() < this.typingLockUntil) return true;

    const active = document.activeElement;
    if (active && active instanceof Element) {
      if (active.matches(this.composerEditableSelector)) return true;
      if (this.isElementInMessageComposer(active)) return true;
    }

    const selection = window.getSelection ? window.getSelection() : null;
    if (selection && selection.rangeCount > 0) {
      const anchor = selection.anchorNode;
      const anchorEl = anchor
        ? (anchor instanceof Element ? anchor : anchor.parentElement)
        : null;
      if (this.isElementInMessageComposer(anchorEl)) {
        return true;
      }
    }

    return false;
  }

  isElementInMessageComposer(el) {
    if (!el || !(el instanceof Element)) return false;
    return Boolean(el.closest(this.composerContainerSelector));
  }

  isComposerFocused() {
    const active = document.activeElement;
    if (!active || !(active instanceof Element)) return false;
    if (active.matches(this.composerEditableSelector)) return true;
    if (this.isElementInMessageComposer(active)) return true;
    return false;
  }

  touchTypingLock(source, target) {
    const active = target instanceof Element
      ? target
      : (document.activeElement instanceof Element ? document.activeElement : null);
    if (!this.isElementInMessageComposer(active)) return;
    const nextLock = Date.now() + this.typingLockMs;
    if (nextLock > this.typingLockUntil) this.typingLockUntil = nextLock;
    this.clearRevealTimer("typing-lock");
    this.clearHideTimer();
    this.pointerOverDock = false;
    this.revealHoldUntil = 0;
    // Suppress dock opens for a window after typing — prevents flicker when
    // the composer unmounts during channel navigation (activeElement becomes
    // BODY, making isComposerFocused() return false and letting a stale
    // reveal timer through).
    this.suppressOpenUntil = Math.max(this.suppressOpenUntil, Date.now() + this.composerHideSuppressMs);
    this.requireRevealReset = true;
    this.debug("typing:lock", {
      source,
      typingLockUntil: this.typingLockUntil,
      suppressOpenUntil: this.suppressOpenUntil,
    });
    // Force hidden state immediately — don't wait for hideDock() logic.
    if (this.stateTarget) {
      this.stateTarget.classList.add("sl-dock-composer-lock");
      if (!this.stateTarget.classList.contains("sl-dock-hidden")) {
        this.stateTarget.classList.add("sl-dock-hidden");
        this.stateTarget.classList.remove("sl-dock-visible");
      }
      this.applyDockStateInline();
    }
  }

  onComposerInput(event) {
    this.touchTypingLock("input", event?.target || null);
  }

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
    if (!el.matches(this.composerEditableSelector) && !this.isElementInMessageComposer(el)) return;
    // Brief suppress window so the dock doesn't flash open during focus
    // transition, but don't force-hide — that blocks hover reveal when
    // the composer merely has focus without active typing.
    this.clearRevealTimer("composer-focus");
    this.requireRevealReset = true;
    this.debug("composer:focusin", {});
  }

  onDockEnter() {
    if (Date.now() < this.lockOpenUntil) return;
    if (Date.now() < this.typingLockUntil) return;
    const nearBottom = this.isCursorNearBottom();
    const currentlyHidden = Boolean(this.stateTarget?.classList?.contains("sl-dock-hidden"));
    const recentMove = this.isRecentMouseMove(500);
    const insideDockRect = this.isCursorInsideDockRect();
    const hitOnDock = this.isPointerOnDockHitTarget();
    if (this.isOpenSuppressed()) {
      this.debug("dock:mouseenter-blocked", {
        reason: "focus-guard",
        suppressOpenUntil: this.suppressOpenUntil,
        nearBottom,
        recentMove,
        insideDockRect,
        hitOnDock,
      }, true);
      return;
    }
    if (!recentMove || !insideDockRect || !hitOnDock) {
      this.debug("dock:mouseenter-blocked", {
        reason: !recentMove
          ? "stale-mouse"
          : !insideDockRect
            ? "outside-dock-rect"
            : "hit-test-miss",
        currentlyHidden,
        nearBottom,
        recentMove,
        insideDockRect,
        hitOnDock,
      }, true);
      return;
    }
    this.pointerOverDock = true;
    this.revealHoldUntil = 0;
    this.clearRevealTimer("dock-enter");
    this.debug("dock:mouseenter", { pointerOverDock: this.pointerOverDock }, true);
    this.showDock("dock-enter");
  }

  onDockLeave() {
    this.pointerOverDock = false;
    this.clearRevealTimer("dock-leave");
    this.debug("dock:mouseleave", { pointerOverDock: this.pointerOverDock }, true);
    this.scheduleHide(this.hideDelayMs);
  }

  onMouseMove(event) {
    if (Date.now() < this.lockOpenUntil) return;
    this.hasMouseMoved = true;
    this.lastMouseMoveAt = Date.now();
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;

    // When the user is actively typing, skip ALL dock-show logic.
    // Composer merely having focus (no recent keystrokes) should NOT block
    // reveal — otherwise hovering the bottom never shows the dock while
    // the message box is focused.
    if (Date.now() < this.typingLockUntil) {
      this.clearRevealTimer("typing-active-move");
      this.clearHideTimer();
      return;
    }

    const nearBottom = this.isCursorInRevealStrip(event.clientX, event.clientY);
    if (nearBottom !== this.debugLastNearBottom) {
      this.debug("mouse:near-bottom-change", {
        x: event.clientX,
        y: event.clientY,
        nearBottom,
        revealThreshold: window.innerHeight - this.revealZonePx,
        withinDockX: this.isCursorWithinDockX(event.clientX),
      }, true);
      this.debugLastNearBottom = nearBottom;
    }

    if (this.requireRevealReset) {
      this.requireRevealReset = false;
      this.revealCandidateAt = 0;
      this.debug("reveal-reset-cleared", { x: event.clientX, y: event.clientY }, true);
    }

    const hidden = Boolean(this.stateTarget?.classList?.contains("sl-dock-hidden"));
    const shouldReveal = (
      hidden &&
      nearBottom &&
      !this.pointerOverDock &&
      !this.isOpenSuppressed() &&
      this.isRecentMouseMove(1200)
    );
    if (shouldReveal) {
      this.scheduleRevealShow("reveal-zone-hover");
    } else {
      this.clearRevealTimer("reveal-zone-exit");
    }

    if (this.shouldKeepDockOpen()) {
      this.clearHideTimer();
      return;
    }
    this.scheduleHide(this.hideDelayMs);
  }

  showDock(trigger = "unknown") {
    if (!this.stateTarget) {
      this.debug("dock:show-blocked", { reason: "no-root" }, true);
      return;
    }
    if (!this.hasMouseMoved) {
      this.debug("dock:show-blocked", { reason: "no-mouse-move" }, true);
      return;
    }
    if (Date.now() < this.lockOpenUntil) {
      this.debug("dock:show-blocked", { reason: "startup-lock", lockOpenUntil: this.lockOpenUntil }, true);
      return;
    }
    if (this.isOpenSuppressed()) {
      this.debug("dock:show-blocked", {
        reason: "focus-guard",
        suppressOpenUntil: this.suppressOpenUntil,
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus?.() ?? null,
      }, true);
      return;
    }
    if (Date.now() < this.typingLockUntil) {
      this.debug("dock:show-blocked", { reason: "typing-active" }, true);
      return;
    }
    if (this.stateTarget.classList.contains("sl-dock-visible")) {
      this.debug("dock:show-noop", { reason: "already-visible" });
      return;
    }
    this.clearHideTimer();
    this.stateTarget.classList.remove("sl-dock-composer-lock");
    this.stateTarget.classList.add("sl-dock-visible");
    this.stateTarget.classList.remove("sl-dock-hidden");
    if (trigger === "reveal-zone-hover") {
      this.revealHoldUntil = Date.now() + this.revealHoldMs;
    } else {
      this.revealHoldUntil = 0;
    }
    this.debug("dock:show-applied", {
      trigger,
      revealHoldUntil: this.revealHoldUntil,
    }, true);
    this.applyDockStateInline();
    this.startRailFollow(620);
  }

  hideDock() {
    if (!this.stateTarget) {
      this.debug("dock:hide-blocked", { reason: "no-root" }, true);
      return;
    }
    if (this.shouldKeepDockOpen()) {
      this.debug("dock:hide-blocked", {
        reason: this.pointerOverDock ? "pointer-over-dock" : "reveal-hold-active",
        revealHoldUntil: this.revealHoldUntil,
      }, true);
      return;
    }
    if (this.stateTarget.classList.contains("sl-dock-hidden")) {
      this.debug("dock:hide-noop", { reason: "already-hidden" });
      this.applyDockStateInline();
      return;
    }
    this.stateTarget.classList.add("sl-dock-hidden");
    this.stateTarget.classList.remove("sl-dock-visible");
    this.debug("dock:hide-applied", {}, true);
    this.applyDockStateInline();
    this.startRailFollow(620);
  }

  scheduleHide(delayMs) {
    if (this.shouldKeepDockOpen()) {
      this.debug("timer:skip-hide", { reason: "keep-open-zone" }, true);
      this.clearHideTimer();
      return;
    }
    this.clearHideTimer();
    this.debug("timer:schedule-hide", { delayMs }, true);
    this.hideTimer = setTimeout(() => this.hideDock(), delayMs);
  }

  clearHideTimer() {
    if (!this.hideTimer) return;
    clearTimeout(this.hideTimer);
    this.debug("timer:clear-hide", {}, true);
    this.hideTimer = null;
  }

  scheduleRevealShow(reason) {
    if (this.revealTimer) return;
    if (Date.now() < this.typingLockUntil) return;
    this.debug("timer:schedule-reveal", { reason, delayMs: this.revealConfirmMs }, true);
    this.revealTimer = setTimeout(() => {
      this.revealTimer = null;
      this.debug("dock:show-attempt", { reason: `${reason}-timer` }, true);
      this.showDock("reveal-zone-hover");
    }, this.revealConfirmMs);
  }

  clearRevealTimer(reason) {
    if (!this.revealTimer) return;
    clearTimeout(this.revealTimer);
    this.revealTimer = null;
    this.debug("timer:clear-reveal", { reason }, true);
  }

  refreshPointerState() {
    if (!this.dock) {
      this.pointerOverDock = false;
      return;
    }
    // Never consider pointer "over dock" while actively typing
    // — the stale cursor position from clicking into the message box can
    // overlap the dock rect and keep it pinned open.
    if (Date.now() < this.typingLockUntil) {
      this.pointerOverDock = false;
      this.debug("dock:pointer-state", { pointerOverDock: false, reason: "typing-active" });
      return;
    }
    this.pointerOverDock = (
      this.hasMouseMoved &&
      this.isCursorInsideDockRect() &&
      this.isPointerOnDockHitTarget()
    );
    this.debug("dock:pointer-state", { pointerOverDock: this.pointerOverDock });
  }

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
    return (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }

  isPointerOnDockHitTarget(x = this.lastMouseX, y = this.lastMouseY) {
    if (!this.dock || !document?.elementFromPoint) return false;
    if (typeof x !== "number" || typeof y !== "number") return false;
    if (x < 0 || y < 0) return false;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit instanceof Element)) return false;
    return hit === this.dock || this.dock.contains(hit);
  }

  isCursorNearBottom() {
    return this.isCursorInRevealStrip(this.lastMouseX, this.lastMouseY);
  }

  isRecentMouseMove(maxAgeMs = 500) {
    if (!this.lastMouseMoveAt) return false;
    return Date.now() - this.lastMouseMoveAt <= maxAgeMs;
  }

  isOpenSuppressed() {
    if (Date.now() < this.suppressOpenUntil) return true;
    if (document.visibilityState !== "visible") return true;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return true;
    return false;
  }

  enforceAutoHideState() {
    if (!this.stateTarget) return;
    const keepOpen = this.shouldKeepDockOpen();
    const visible = this.stateTarget.classList.contains("sl-dock-visible");
    const typing = this.isTypingInMessageComposer();
    const composerFocused = this.isComposerFocused();
    this.debug("dock:enforce-autohide", {
      pointerOverDock: this.pointerOverDock,
      nearBottom: this.isCursorNearBottom(),
      revealHoldUntil: this.revealHoldUntil,
      visible,
      keepOpen,
      typing,
    });
    // Force-close while user is actively typing.
    if (visible && Date.now() < this.typingLockUntil) {
      this.pointerOverDock = false;
      this.revealHoldUntil = 0;
      this.clearRevealTimer("typing-enforce");
      this.debug("dock:enforce-hide-typing", {}, true);
      this.hideDock();
      return;
    }
    // Otherwise do not force-close on tick; closing is handled by
    // dock/mouse events + hide timer to avoid premature auto-closing.
    if (!visible || keepOpen) return;
    this.debug("dock:enforce-autohide-skip", { reason: "force-close-disabled" }, true);
  }

  shouldKeepDockOpen() {
    if (Date.now() < this.typingLockUntil) return false;
    return this.pointerOverDock || Date.now() < this.revealHoldUntil;
  }

  enforceStartupLock() {
    if (!this.root) return;
    if (Date.now() >= this.lockOpenUntil) return;
    this.pointerOverDock = false;
    this.hasMouseMoved = false;
    this.lastMouseX = -1;
    this.lastMouseY = -1;
    this.debug("startup:lock-enforced", { lockOpenUntil: this.lockOpenUntil }, true);
    this.hideDock();
  }

  installDebugApi() {
    try {
      this.setDebugHandle({
        version: this.version,
        getLogs: () => this.debugBuffer.slice(),
        dump: () => {
          const logs = this.debugBuffer.slice();
          console.group("[HSLDockAutoHide] Debug dump");
          console.table(logs);
          console.groupEnd();
          return logs;
        },
        state: () => this.snapshotState(),
        filePath: () => this.debugFilePath,
        clear: () => {
          this.debugBuffer.length = 0;
          this.debugSeq = 0;
          return true;
        },
      });
      this.debug("debug:api-installed", { globalKey: "__HSLDockAutoHideDebug" }, true);
    } catch (_) {}
  }

  removeDebugApi() {
    this.clearDebugHandle();
  }

  debug(event, data = {}, includeState = false) {
    if (!this.debugEnabled) return;
    const entry = {
      seq: ++this.debugSeq,
      at: new Date().toISOString(),
      event,
      ...this.sanitizeDebugData(data),
    };
    if (includeState) entry.state = this.snapshotState();
    this.debugBuffer.push(entry);
    if (this.debugBuffer.length > this.debugMaxEntries) this.debugBuffer.shift();
    this.writeDebugEntry(entry);
    if (this.debugConsole) {
      try {
        console.debug("[HSLDockAutoHide]", entry);
      } catch (_) {}
    }
  }

  initDebugFileSink() {
    if (!this.debugFileEnabled) return;
    try {
      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      const dir = path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "BetterDiscord",
        "logs",
        "HSLDockAutoHide"
      );
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      this.debugFilePath = path.join(dir, `dock-autohide-${stamp}.jsonl`);
      this.fs = fs;
    } catch (_) {
      this.debugFilePath = null;
      this.fs = null;
    }
  }

  writeDebugEntry(entry) {
    if (!this.debugFileEnabled || !this.fs || !this.debugFilePath) return;
    try {
      this.fs.appendFileSync(this.debugFilePath, JSON.stringify(entry) + "\n");
    } catch (_) {}
  }

  snapshotState() {
    const root = this.root;
    const dock = this.dock;
    const target = this.dockMoveTarget;
    return {
      lockRemainingMs: Math.max(0, this.lockOpenUntil - Date.now()),
      hasMouseMoved: this.hasMouseMoved,
      lastMouseX: this.lastMouseX,
      lastMouseY: this.lastMouseY,
      pointerOverDock: this.pointerOverDock,
      nearBottom: this.isCursorNearBottom(),
      rootHiddenClass: Boolean(this.stateTarget?.classList?.contains("sl-dock-hidden")),
      rootVisibleClass: Boolean(this.stateTarget?.classList?.contains("sl-dock-visible")),
      dock: this.describeDock(dock),
      dockTarget: this.describeDock(target),
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
    if (typeof value === "object") {
      const obj = {};
      for (const [k, v] of Object.entries(value)) obj[k] = this.sanitizeDebugValue(v);
      return obj;
    }
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
      rect: rect
        ? {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }
        : null,
    };
  }
};
