/**
 * @name ShadowPortalCore
 * @description Shared navigation + transition core for ShadowStep, ShadowExchange, and ShadowSenses.
 * @version 2.0.0
 * @author matthewthompson
 */

/* global BdApi */

"use strict";

// ── GSAP CDN loader state (shared across all portal-core consumers) ──
let _gsapLoadPromise = null;
let _gsapLoaded = false;

const DEFAULT_CONTEXT_LABEL_KEYS = ["anchorName", "waypointLabel", "label", "name", "targetName", "targetUsername"];

function getCoreConfig(instance) {
  if (!instance || !instance.__shadowPortalCoreConfig || typeof instance.__shadowPortalCoreConfig !== "object") {
    return {};
  }
  return instance.__shadowPortalCoreConfig;
}

function getTransitionId(instance) {
  const cfg = getCoreConfig(instance);
  return typeof cfg.transitionId === "string" && cfg.transitionId.trim() ? cfg.transitionId.trim() : "ss-transition-overlay";
}

function getNavigationFailureToast(instance) {
  const cfg = getCoreConfig(instance);
  return typeof cfg.navigationFailureToast === "string" && cfg.navigationFailureToast.trim()
    ? cfg.navigationFailureToast
    : "Failed to switch channel";
}

function getContextLabel(context, instance) {
  if (!context || typeof context !== "object") return "";
  const cfg = getCoreConfig(instance);
  const keys = Array.isArray(cfg.contextLabelKeys) && cfg.contextLabelKeys.length
    ? cfg.contextLabelKeys
    : DEFAULT_CONTEXT_LABEL_KEYS;

  for (const key of keys) {
    const value = context[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return "";
}

function debugLog(instance, tag, message, ...args) {
  try {
    if (instance && typeof instance.debugLog === "function") {
      instance.debugLog(tag, message, ...args);
    }
  } catch (_) {
    // Never block plugin flow from debug logging errors.
  }
}

function debugError(instance, tag, message, error) {
  try {
    if (instance && typeof instance.debugError === "function") {
      instance.debugError(tag, message, error);
    } else {
      console.error("[ShadowPortalCore]", tag, message, error);
    }
  } catch (_) {
    console.error("[ShadowPortalCore]", tag, message, error);
  }
}

const methods = {
  /**
   * Load GSAP + plugins from CDN with dedup and graceful fallback.
   * Safe to call multiple times — returns cached promise on repeat calls.
   * @returns {Promise<object|null>} GSAP instance or null if CDN failed.
   */
  async _ensureGSAP() {
    if (_gsapLoaded && window.gsap) return window.gsap;
    if (_gsapLoadPromise) return _gsapLoadPromise;

    _gsapLoadPromise = (async () => {
      try {
        const loadScript = (url) => new Promise((resolve, reject) => {
          // Dedup: don't inject same script twice
          if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
          const el = document.createElement("script");
          el.src = url;
          el.onload = resolve;
          el.onerror = reject;
          document.head.appendChild(el);
        });

        const CDN = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0";

        // Core (required)
        await loadScript(`${CDN}/gsap.min.js`);
        // EasePack (required for elastic, expo, back extras)
        await loadScript(`${CDN}/EasePack.min.js`);
        // Optional premium plugins (now free — soft-fail if unavailable)
        await loadScript(`${CDN}/CustomEase.min.js`).catch(() => {});
        await loadScript(`${CDN}/Physics2DPlugin.min.js`).catch(() => {});

        if (!window.gsap) throw new Error("gsap global not found after script injection");

        // Register available plugins
        if (window.CustomEase) window.gsap.registerPlugin(window.CustomEase);
        if (window.Physics2DPlugin) window.gsap.registerPlugin(window.Physics2DPlugin);

        _gsapLoaded = true;
        console.log(
          "%c[ShadowPortalCore]%c GSAP v" + window.gsap.version + " loaded",
          "color:#a855f7;font-weight:bold", "color:#22c55e",
          window.CustomEase ? "+ CustomEase" : "",
          window.Physics2DPlugin ? "+ Physics2D" : ""
        );
        return window.gsap;
      } catch (err) {
        console.warn("[ShadowPortalCore] GSAP CDN load failed — vanilla canvas fallback active:", err.message);
        _gsapLoaded = false;
        _gsapLoadPromise = null;
        return null;
      }
    })();

    return _gsapLoadPromise;
  },

  /**
   * Extract a Discord channel ID from a path like /channels/guildId/channelId
   */
  _extractChannelId(path) {
    const match = String(path || "").match(/\/channels\/\d+\/(\d+)/);
    return match ? match[1] : null;
  },

  /**
   * Check if Discord's MessageStore already has messages for a channel.
   * Cached channels load almost instantly — no need for a long portal animation.
   */
  _isChannelCached(path) {
    try {
      const channelId = this._extractChannelId(path);
      if (!channelId) return false;
      const { Webpack } = BdApi;
      const MessageStore = Webpack.getStore?.("MessageStore")
        || Webpack.getModule?.(m => m.getMessage && m.getMessages);
      if (!MessageStore?.getMessages) return false;
      const messages = MessageStore.getMessages(channelId);
      // If there are any cached messages, this channel has been visited before
      return messages && (messages.length > 0 || messages._array?.length > 0 || messages.size > 0);
    } catch (e) {
      debugError(this, "Cache", "Failed to check channel cache", e);
      return false;
    }
  },

  _normalizePath(path) {
    const p = String(path || "").trim();
    if (!p) return "/";
    const withSlash = p.startsWith("/") ? p : `/${p}`;
    return withSlash.replace(/\/+$/, "") || "/";
  },

  _isPathActive(targetPath) {
    const target = this._normalizePath(targetPath);
    const current = this._normalizePath(window.location?.pathname || "/");
    if (current === target) return true;
    return current.startsWith(`${target}/`);
  },

  _clearNavigateRetries() {
    if (!(this._navigateRetryTimers instanceof Set)) {
      this._navigateRetryTimers = new Set();
      return;
    }

    for (const timer of this._navigateRetryTimers) {
      clearTimeout(timer);
    }
    this._navigateRetryTimers.clear();
  },

  _findChannelViewNode() {
    const transitionId = getTransitionId(this);
    const selectors = [
      "#app-mount main",
      "main",
      "#app-mount [role='main']",
      "#app-mount [class*='chatContent']",
      "#app-mount [class*='chat']",
      "#app-mount [class*='content_']",
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node && node.id !== transitionId && !node.closest(`#${transitionId}`)) return node;
    }
    return null;
  },

  _cancelChannelViewFade() {
    this._channelFadeToken = Number(this._channelFadeToken || 0) + 1;
    if (this._channelFadeResetTimer) {
      clearTimeout(this._channelFadeResetTimer);
      this._channelFadeResetTimer = null;
    }

    const node = this._findChannelViewNode();
    if (!node) return;

    try {
      node.style.removeProperty("opacity");
      node.style.removeProperty("transition");
      node.style.removeProperty("will-change");
    } catch (error) {
      debugError(this, "Transition", "Failed to reset channel view fade styles", error);
    }
  },

  _beginChannelViewFadeOut() {
    this._cancelChannelViewFade();
    const token = this._channelFadeToken;
    const node = this._findChannelViewNode();
    if (!node) return token;

    try {
      node.style.willChange = "opacity";
      if (typeof node.animate === "function") {
        node.animate(
          [{ opacity: 1 }, { opacity: 0.2 }],
          { duration: 120, easing: "ease-out", fill: "forwards" }
        );
      } else {
        node.style.transition = "opacity 120ms ease-out";
        node.style.opacity = "0.2";
      }
    } catch (error) {
      debugError(this, "Transition", "Failed to start channel view fade out", error);
    }

    return token;
  },

  _finishChannelViewFade(token, success) {
    if (token !== this._channelFadeToken) return;
    const node = this._findChannelViewNode();
    if (!node) return;

    const fromOpacity = success ? 0.14 : 0.45;
    const duration = success ? 220 : 140;

    try {
      node.style.willChange = "opacity";
      if (typeof node.animate === "function") {
        node.animate(
          [{ opacity: fromOpacity }, { opacity: 1 }],
          { duration, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }
        );
      } else {
        node.style.transition = `opacity ${duration}ms cubic-bezier(.22,.61,.36,1)`;
        node.style.opacity = "1";
      }
    } catch (error) {
      debugError(this, "Transition", "Failed to finish channel view fade", error);
    }

    if (this._channelFadeResetTimer) clearTimeout(this._channelFadeResetTimer);
    this._channelFadeResetTimer = setTimeout(() => {
      if (token !== this._channelFadeToken) return;
      this._channelFadeResetTimer = null;
      try {
        node.style.removeProperty("opacity");
        node.style.removeProperty("transition");
        node.style.removeProperty("will-change");
      } catch (error) {
        debugError(this, "Transition", "Failed to clean channel view fade styles after transition", error);
      }
    }, duration + 80);
  },

  _navigateOnce(path) {
    try {
      if (this._NavigationUtils?.transitionTo) {
        this._NavigationUtils.transitionTo(path);
        return true;
      }

      const { Webpack } = BdApi;
      const nav =
        Webpack.getByKeys("transitionTo", "back", "forward") ||
        Webpack.getModule((m) => m.transitionTo && m.back);

      if (nav?.transitionTo) {
        this._NavigationUtils = nav;
        nav.transitionTo(path);
        return true;
      }

      if (window.history?.pushState) {
        window.history.pushState({}, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
        return true;
      }

      return false;
    } catch (err) {
      debugError(this, "Navigate", "Failed:", err);
      return false;
    }
  },

  _navigate(path, context = {}, hooks = {}) {
    const targetPath = this._normalizePath(path);
    const maxAttempts = 7;

    if (this._isPathActive(targetPath)) {
      debugLog(this, "Navigate", `Already at ${targetPath}`);
      if (typeof hooks.onConfirmed === "function") {
        try {
          hooks.onConfirmed({ attempt: 0, alreadyActive: true });
        } catch (error) {
          debugError(this, "Navigate", "onConfirmed hook failed for already-active target", error);
        }
      }
      return;
    }

    this._navigateRequestId = Number(this._navigateRequestId || 0) + 1;
    const requestId = this._navigateRequestId;
    this._clearNavigateRetries();

    const attemptNavigate = (attempt) => {
      if (requestId !== this._navigateRequestId) return;

      const invoked = this._navigateOnce(targetPath);
      if (this._isPathActive(targetPath)) {
        debugLog(this, "Navigate", `Confirmed ${targetPath} on attempt ${attempt}`);
        if (typeof hooks.onConfirmed === "function") {
          try {
            hooks.onConfirmed({ attempt, targetPath });
          } catch (error) {
            debugError(this, "Navigate", "onConfirmed hook failed after navigation confirmation", error);
          }
        }
        return;
      }

      if (attempt >= maxAttempts) {
        const contextLabel = getContextLabel(context, this);
        const suffix = contextLabel ? ` (${contextLabel})` : "";
        debugError(this, "Navigate", `Failed to reach ${targetPath}${suffix} after ${attempt} attempts`);

        if (typeof hooks.onFailed === "function") {
          try {
            hooks.onFailed({ attempt, targetPath });
          } catch (error) {
            debugError(this, "Navigate", "onFailed hook failed after navigation exhaustion", error);
          }
        }

        BdApi.UI.showToast(getNavigationFailureToast(this), { type: "error" });

        // Smooth portal retraction if GSAP timeline is active (Phase 6)
        if (this._gsapMasterTimeline) {
          this._reversePortalTransition();
        }
        return;
      }

      const delay = invoked ? 62 + attempt * 38 : 46 + attempt * 34;
      const timer = setTimeout(() => {
        this._navigateRetryTimers.delete(timer);
        if (requestId !== this._navigateRequestId) return;
        attemptNavigate(attempt + 1);
      }, delay);
      this._navigateRetryTimers.add(timer);
    };

    try {
      attemptNavigate(1);
    } catch (err) {
      debugError(this, "Navigate", "Unexpected navigation failure:", err);
      if (typeof hooks.onFailed === "function") {
        try {
          hooks.onFailed({ attempt: 0, targetPath, error: err });
        } catch (hookError) {
          debugError(this, "Navigate", "onFailed hook threw during navigation exception handling", hookError);
        }
      }
      BdApi.UI.showToast("Navigation error — check console", { type: "error" });
    }
  },

  /**
   * Smoothly reverse the portal animation (GSAP only).
   * Falls back to instant cleanup if GSAP timeline isn't active.
   * Automatically called on navigation failure when GSAP is loaded.
   */
  _reversePortalTransition() {
    const tl = this._gsapMasterTimeline;
    if (!tl || !window.gsap) {
      this._cancelPendingTransition();
      return;
    }

    // Cancel scheduled timeouts — reverse handles its own cleanup
    if (this._transitionCleanupTimeout) {
      clearTimeout(this._transitionCleanupTimeout);
      this._transitionCleanupTimeout = null;
    }
    if (this._transitionNavTimeout) {
      clearTimeout(this._transitionNavTimeout);
      this._transitionNavTimeout = null;
    }

    tl.timeScale(2); // 2x speed for snappy retraction
    tl.reverse();
    tl.eventCallback("onReverseComplete", () => {
      this._cancelPendingTransition();
    });

    debugLog(this, "Transition", "Portal reverse initiated (GSAP timeline.reverse @ 2x)");
  },

  _cancelPendingTransition() {
    if (this._transitionNavTimeout) {
      clearTimeout(this._transitionNavTimeout);
      this._transitionNavTimeout = null;
    }
    if (this._transitionCleanupTimeout) {
      clearTimeout(this._transitionCleanupTimeout);
      this._transitionCleanupTimeout = null;
    }
    // Cancel any in-flight shard animations (GSAP timelines use .kill(), WAAPI uses .cancel())
    if (this._activeShardAnims) {
      for (const a of this._activeShardAnims) {
        try { if (typeof a.kill === "function") a.kill(); else a.cancel(); } catch (_) {}
      }
      this._activeShardAnims = null;
    }
    if (typeof this._transitionStopCanvas === "function") {
      try {
        this._transitionStopCanvas();
      } catch (error) {
        debugError(this, "Transition", "Failed to stop active transition canvas", error);
      }
      this._transitionStopCanvas = null;
    }

    const transitionId = getTransitionId(this);
    const overlay = document.getElementById(transitionId);
    if (overlay) overlay.remove();
    this._cancelChannelViewFade();
  },

  /**
   * Play portal transition animation.
   * @param {Function} callback - Navigation callback fired during the animation
   * @param {string} [targetPath] - Optional Discord path for cached-channel detection.
   *   When the target channel has cached messages, a shorter "express" animation plays
   *   (~350ms) instead of the full cinematic portal (~1200ms).
   */
  playTransition(callback, targetPath) {
    if (!this.settings?.animationEnabled) {
      callback();
      return;
    }

    this._cancelPendingTransition();
    this._transitionRunId = Number(this._transitionRunId || 0) + 1;
    const runId = this._transitionRunId;

    // ── Timing: Two profiles based on whether target channel is cached ──
    // Fast (cached):     ~1000ms total, same full portal but sped up
    // Cinematic (uncached): user's configured duration (default 550), full portal
    const configuredDuration = this.settings.animationDuration || 550;
    const isCached = !!targetPath && this._isChannelCached(targetPath);

    // Both paths play the full 1.5s canvas portal — enough time for shockwave + glow breathing
    const duration = 1200;                                          // Canvas animation length
    const totalDuration = 1500;                                     // Total overlay lifetime (1.5s)
    const transitionStartedAt = performance.now();

    // ── Portal Diagnostic Timeline (gated behind debugMode) ──
    const _debugMode = !!this.settings?.debugMode;
    const _diag = { t0: transitionStartedAt, events: [] };
    const _diagLog = (phase) => {
      if (!_debugMode) return;
      const ms = Math.round(performance.now() - _diag.t0);
      _diag.events.push({ phase, ms });
      console.log(`%c[PortalDiag]%c ${phase} %c@ ${ms}ms`, "color:#a855f7;font-weight:bold", "color:#e2e8f0", "color:#94a3b8");
    };
    _diagLog(isCached ? "TRANSITION_START (cached, 1.5s)" : "TRANSITION_START (cinematic, 1.5s)");
    if (_debugMode) {
      console.log(`%c[PortalDiag]%c cached=${isCached} configuredDuration=${configuredDuration} duration=${duration} totalDuration=${totalDuration}`, "color:#a855f7;font-weight:bold", "color:#94a3b8");
      console.log(`%c[PortalDiag]%c navDelay=${isCached ? 80 : Math.max(140, Math.round(totalDuration * 0.18))}ms cleanup=${isCached ? totalDuration + 120 : totalDuration + 340}ms`, "color:#a855f7;font-weight:bold", "color:#94a3b8");
    }
    const systemPrefersReducedMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const respectReducedMotion = this.settings.respectReducedMotion !== false;
    const prefersReducedMotion = respectReducedMotion && systemPrefersReducedMotion;

    const transitionId = getTransitionId(this);
    const overlay = document.createElement("div");
    overlay.id = transitionId;
    overlay.className = "ss-transition-overlay";
    overlay.style.setProperty("--ss-duration", `${duration}ms`);
    overlay.style.setProperty("--ss-total-duration", `${totalDuration}ms`);

    const canvas = document.createElement("canvas");
    canvas.className = "ss-transition-canvas";
    overlay.appendChild(canvas);

    const shardCount = prefersReducedMotion ? 0 : 9 + Math.floor(Math.random() * 8);
    debugLog(
      this,
      "Transition",
      `start style=${isCached ? "expressFlash" : "blackMistPortalCanvasV5"} duration=${duration} total=${totalDuration} cached=${isCached} reducedMotion=${prefersReducedMotion} cinders=${shardCount}`
    );

    const shards = [];
    if (shardCount > 0) {
      const shardFragment = document.createDocumentFragment();
      for (let i = 0; i < shardCount; i++) {
        const shard = document.createElement("div");
        shard.className = "ss-shard";
        shard.style.left = "50%";
        shard.style.top = "50%";
        shard.style.setProperty("--ss-delay", `${Math.random() * 320}ms`);
        const tx = (Math.random() * 2 - 1) * 230;
        const ty = -40 - Math.random() * 280 + Math.random() * 70;
        const rot = (Math.random() * 150 - 75).toFixed(2);
        shard.style.setProperty("--ss-shard-x", `${tx.toFixed(2)}px`);
        shard.style.setProperty("--ss-shard-y", `${ty.toFixed(2)}px`);
        shard.style.setProperty("--ss-shard-r", `${rot}deg`);
        shard.style.width = `${1.5 + Math.random() * 2.5}px`;
        shard.style.height = `${6 + Math.random() * 10}px`;
        shards.push(shard);
        shardFragment.appendChild(shard);
      }
      overlay.appendChild(shardFragment);
    }

    document.body.appendChild(overlay);
    _diagLog("OVERLAY_APPENDED");

    this._transitionStopCanvas = null;
    if (!prefersReducedMotion) {
      const startCanvas = () => {
        if (runId !== this._transitionRunId) return;
        _diagLog("CANVAS_ANIMATION_START");
        try {
          this._transitionStopCanvas = this.startPortalCanvasAnimation(canvas, totalDuration);
        } catch (error) {
          this._transitionStopCanvas = null;
          debugError(this, "Transition", "Canvas portal start failed; continuing with non-canvas overlay", error);
        }
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(startCanvas);
      } else {
        setTimeout(startCanvas, 0);
      }
    }

    const canUseWaapi = typeof overlay.animate === "function";

    if (!prefersReducedMotion && canUseWaapi) {
      _diagLog("WAAPI_OVERLAY_START");
      overlay.classList.add("ss-transition-overlay--waapi");

      overlay.animate(
        [
          { opacity: 0 },
          { opacity: 1, offset: 0.1 },
          { opacity: 1, offset: 0.72 },
          { opacity: 0.86, offset: 0.9 },
          { opacity: 0 },
        ],
        { duration: totalDuration, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }
      );

      // Phase 3: GSAP shard animation with back.out(2) for explosive pop, or WAAPI fallback
      const shardAnims = [];
      if (_gsapLoaded && window.gsap) {
        for (const shard of shards) {
          const delay = parseFloat(shard.style.getPropertyValue("--ss-delay")) || 0;
          const tx = shard.style.getPropertyValue("--ss-shard-x") || "0px";
          const ty = shard.style.getPropertyValue("--ss-shard-y") || "-80px";
          const rot = shard.style.getPropertyValue("--ss-shard-r") || "0deg";
          // Initial state: small, invisible
          window.gsap.set(shard, { scale: 0.3, opacity: 0, x: 0, y: 0, rotation: 0 });
          // Phase 1: burst into view with back.out(2) — explosive pop with overshoot
          const shardTl = window.gsap.timeline({ delay: delay / 1000 });
          shardTl.to(shard, {
            scale: 1, opacity: 0.72, duration: 0.2, ease: "back.out(2)",
          });
          // Phase 2: disperse outward with gravity-like arc
          shardTl.to(shard, {
            x: tx, y: ty, rotation: rot, scale: 0.2, opacity: 0,
            duration: 0.7, ease: "power3.out",
          });
          shardAnims.push(shardTl);
        }
        this._activeShardAnims = shardAnims;
        debugLog(this, "Transition", "Using GSAP shards + canvas portal transition");
      } else {
        for (const shard of shards) {
          const delay = parseFloat(shard.style.getPropertyValue("--ss-delay")) || 0;
          const tx = shard.style.getPropertyValue("--ss-shard-x") || "0px";
          const ty = shard.style.getPropertyValue("--ss-shard-y") || "-80px";
          const rot = shard.style.getPropertyValue("--ss-shard-r") || "0deg";
          shardAnims.push(shard.animate(
            [
              { transform: "translate3d(0, 0, 0) rotate(0deg) scale(0.3)", opacity: 0 },
              { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)", opacity: 0.72, offset: 0.22 },
              { transform: `translate3d(${tx}, ${ty}, 0) rotate(${rot}) scale(0.2)`, opacity: 0 },
            ],
            { duration: 900, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards", delay }
          ));
        }
        this._activeShardAnims = shardAnims;
        debugLog(this, "Transition", "Using WAAPI + canvas portal transition");
      }
    } else if (prefersReducedMotion) {
      overlay.classList.add("ss-transition-overlay--reduced");
      if (canUseWaapi) {
        overlay.animate(
          [{ opacity: 0 }, { opacity: 0.65, offset: 0.35 }, { opacity: 0 }],
          { duration: Math.max(260, Math.round(duration * 0.82)), easing: "ease-out", fill: "forwards" }
        );
      }
    } else {
      overlay.classList.add("ss-transition-overlay--css");
      debugLog(this, "Transition", "Using CSS fallback (canvas unavailable)");
    }

    let navigated = false;
    const runNavigation = () => {
      if (navigated) return;
      navigated = true;
      _diagLog("NAVIGATE_FIRE");
      debugLog(this, "Transition", `Navigation callback fired at ${Math.round(performance.now() - transitionStartedAt)}ms`);
      callback();
      // Log when Discord actually processes the navigation (next microtask)
      Promise.resolve().then(() => _diagLog("NAVIGATE_CALLBACK_RETURNED"));
    };

    // Navigation delay:
    //   Fast (cached):       80ms — portal starts forming, nav fires early (content is already there)
    //   Reduced motion:      24ms — minimal delay
    //   Cinematic (uncached): 18% of total — portal forms, then nav fires behind it
    const navDelay = isCached
      ? 80
      : prefersReducedMotion
        ? 24
        : Math.max(140, Math.round(totalDuration * 0.18));
    _diagLog(`NAV_SCHEDULED (delay=${navDelay}ms)`);

    // Clear stale timers from previous rapid teleport before setting new ones
    if (this._transitionNavTimeout) clearTimeout(this._transitionNavTimeout);
    if (this._transitionCleanupTimeout) clearTimeout(this._transitionCleanupTimeout);
    this._transitionNavTimeout = setTimeout(() => {
      if (runId !== this._transitionRunId) return;
      this._transitionNavTimeout = null;
      runNavigation();
    }, navDelay);

    const cleanupDelay = isCached
      ? totalDuration + 120                    // Fast: brief buffer after portal ends
      : prefersReducedMotion
        ? Math.max(320, Math.round(duration * 0.98))
        : totalDuration + 340;
    _diagLog(`CLEANUP_SCHEDULED (delay=${cleanupDelay}ms)`);
    this._transitionCleanupTimeout = setTimeout(() => {
      if (runId !== this._transitionRunId) return;
      _diagLog("CLEANUP_FIRE");
      this._transitionCleanupTimeout = null;
      this._cancelPendingTransition();
    }, cleanupDelay);
  },

  startPortalCanvasAnimation(canvas, duration) {
    // ── GSAP-enhanced path — uses main-thread canvas only (GSAP depends on DOM) ──
    if (_gsapLoaded && window.gsap) {
      return this._startPortalCanvasGSAP(canvas, duration);
    }

    // ── Vanilla fallback: OffscreenCanvas Worker → main-thread canvas ──
    if (typeof canvas.transferControlToOffscreen === "function") {
      try {
        return this._startPortalCanvasWorker(canvas, duration);
      } catch (e) {
        console.warn("[ShadowPortalCore] OffscreenCanvas Worker failed, falling back to main thread:", e);
      }
    }
    return this._startPortalCanvasMainThread(canvas, duration);
  },

  /**
   * GSAP-enhanced canvas animation path.
   * Creates a master timeline driving a state object; the canvas draw loop
   * reads GSAP-interpolated values instead of computing from raw `t`.
   * Uses main-thread canvas only (GSAP depends on DOM APIs).
   */
  _startPortalCanvasGSAP(canvas, duration) {
    const gsap = window.gsap;
    if (!gsap) return this._startPortalCanvasMainThread(canvas, duration);

    // ── GSAP state object — timeline tweens these, draw loop reads them ──
    const gs = {
      portalForm: 0.38,      // 0.38→1.0 (formation envelope)
      formEase: 0,           // 0→1 (formation progress)
      easeInOut: 0,          // 0→1 (global ease envelope)
      fadeOut: 1,            // 1→0 (end fade)
      revealProgress: 0,     // 0→1 (aperture reveal)
      revealEase: 0,         // 0→1 (reveal easing)
      ringGlow: 1,           // glow multiplier (Phase 5)
      coreGlow: 1,           // core glow multiplier (Phase 5)
      hueShift: 0,           // hue drift in degrees (Phase 5)
      shockwaveBoost: 0,     // elastic overshoot for shockwave ripples (Phase 3)
      vortexSpin: 0,         // 0→1 accelerating spiral rotation over portal lifetime
      strandMorph: 0,        // 0↔1 strand deformation amplitude modulator (breathing)
      tendrilPulse: 0.5,     // 0↔1 inner tendril intensity breathing
    };

    const dur = duration / 1000; // GSAP uses seconds

    // ── Master timeline ──
    const tl = gsap.timeline();

    // Formation: 0→25% — back.out gives subtle overshoot snap
    tl.to(gs, {
      portalForm: 1,
      formEase: 1,
      duration: dur * 0.25,
      ease: "back.out(1.4)",
    }, 0);

    // Global ease envelope: power2.inOut across full duration
    tl.to(gs, {
      easeInOut: 1,
      duration: dur,
      ease: "power2.inOut",
    }, 0);

    // Reveal aperture: 35%→100% with expo.inOut for dramatic accel/decel
    tl.to(gs, {
      revealProgress: 1,
      revealEase: 1,
      duration: dur * 0.65,
      ease: "expo.inOut",
    }, dur * 0.35);

    // Fade out: 95%→100% with power2.in for smooth exit
    tl.to(gs, {
      fadeOut: 0,
      duration: dur * 0.05,
      ease: "power2.in",
    }, dur * 0.95);

    // Phase 3: Shockwave elastic overshoot — starts 37% through, elastic.out gives ripple bounce
    tl.to(gs, {
      shockwaveBoost: 1,
      duration: dur * 0.48,
      ease: "elastic.out(1, 0.3)",
    }, dur * 0.37);

    // Vortex spin: accelerates over full duration — starts slow, builds to full spiral
    tl.to(gs, {
      vortexSpin: 1,
      duration: dur,
      ease: "power2.in",
    }, 0);

    // ── Phase 5: Glow breathing — infinite yoyo loops during portal lifetime ──
    const breathingTweens = [
      gsap.to(gs, { ringGlow: 1.6, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: -1 }),
      gsap.to(gs, { coreGlow: 2.0, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1 }),
      gsap.to(gs, { hueShift: 10, duration: 2, ease: "none", yoyo: true, repeat: -1 }),
      gsap.to(gs, { strandMorph: 1, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: -1 }),
      gsap.to(gs, { tendrilPulse: 1, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: -1 }),
    ];

    // Store timeline on instance for Phase 6 (reverse-on-failure)
    this._gsapMasterTimeline = tl;

    if (this.settings?.debugMode) {
      console.log(
        "%c[PortalDiag]%c GSAP timeline created — " + dur.toFixed(3) + "s, " + tl.getChildren().length + " tweens",
        "color:#a855f7;font-weight:bold", "color:#22c55e",
        "CustomEase:", !!window.CustomEase, "Physics2D:", !!window.Physics2DPlugin
      );
    }

    // Delegate to main-thread draw loop, passing GSAP state
    const stopCanvas = this._startPortalCanvasMainThread(canvas, duration, gs);

    // Wrap stop function to kill GSAP timeline + breathing tweens
    return () => {
      tl.kill();
      for (const tw of breathingTweens) tw.kill();
      this._gsapMasterTimeline = null;
      if (stopCanvas) stopCanvas();
    };
  },

  _startPortalCanvasMainThread(canvas, duration, _gsap) {
    if (!canvas || typeof canvas.getContext !== "function") return null;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return null;

    const TAU = Math.PI * 2;
    const screenArea = Math.max(
      1,
      Math.floor((window.innerWidth || 1920) * (window.innerHeight || 1080))
    );
    const perfTier = screenArea > 3200000 ? 0 : screenArea > 2400000 ? 1 : 2;
    const qualityScale = perfTier === 0 ? 0.58 : perfTier === 1 ? 0.76 : 1;
    const detailStep = perfTier === 0 ? 2 : 1;
    const mistStep = perfTier === 0 ? 3 : perfTier === 1 ? 2 : 1;
    const shadowScale = perfTier === 0 ? 0.62 : perfTier === 1 ? 0.78 : 1;
    const dprCap = perfTier === 0 ? 1.0 : perfTier === 1 ? 1.2 : 1.35;
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    let width = 1;
    let height = 1;
    let maxSide = 1;
    let cx = 0;
    let cy = 0;
    let rafId = 0;
    let stopped = false;

    const seedCacheKey = `v1:${perfTier}:${qualityScale.toFixed(2)}`;
    if (!(this.__shadowPortalSeedCache instanceof Map)) {
      this.__shadowPortalSeedCache = new Map();
    }
    let seeds = this.__shadowPortalSeedCache.get(seedCacheKey);
    if (!seeds) {
      seeds = {
        wisps: Array.from({ length: Math.max(72, Math.round(128 * qualityScale)) }, () => ({
          angle: Math.random() * TAU,
          speed: 0.08 + Math.random() * 0.46,
          offset: 0.08 + Math.random() * 1.08,
          size: 20 + Math.random() * 74,
          phase: Math.random() * TAU,
          drift: Math.random() * 2 - 1,
        })),
        darkBlots: Array.from({ length: Math.max(34, Math.round(56 * qualityScale)) }, () => ({
          angle: Math.random() * TAU,
          speed: 0.12 + Math.random() * 0.38,
          offset: 0.12 + Math.random() * 0.92,
          size: 26 + Math.random() * 62,
          phase: Math.random() * TAU,
        })),
        portalRifts: Array.from({ length: Math.max(22, Math.round(42 * qualityScale)) }, () => ({
          angle: Math.random() * TAU,
          speed: 0.22 + Math.random() * 0.62,
          spread: 0.42 + Math.random() * 1.05,
          lineWidth: 1 + Math.random() * 2.6,
          length: 0.46 + Math.random() * 0.32,
          phase: Math.random() * TAU,
        })),
        coreFilaments: Array.from({ length: Math.max(16, Math.round(28 * qualityScale)) }, () => ({
          angle: Math.random() * TAU,
          speed: 0.3 + Math.random() * 0.82,
          spread: 0.62 + Math.random() * 1.12,
          lineWidth: 1 + Math.random() * 2,
          length: 0.54 + Math.random() * 0.26,
          phase: Math.random() * TAU,
        })),
        ringMistBands: Array.from({ length: Math.max(38, Math.round(84 * qualityScale)) }, () => ({
          angle: Math.random() * TAU,
          speed: 0.2 + Math.random() * 0.95,
          width: 0.06 + Math.random() * 0.22,
          band: 0.74 + Math.random() * 0.64,
          lineWidth: 1.1 + Math.random() * 2.7,
          phase: Math.random() * TAU,
        })),
        purpleJets: Array.from({ length: Math.max(18, Math.round(34 * qualityScale)) }, () => ({
          angle: Math.random() * TAU,
          speed: 0.24 + Math.random() * 0.92,
          length: 0.34 + Math.random() * 0.32,
          spread: 0.22 + Math.random() * 0.64,
          lineWidth: 1 + Math.random() * 2.5,
          phase: Math.random() * TAU,
        })),
        outerLightning: Array.from({ length: Math.max(28, Math.round(52 * qualityScale)) }, () => ({
          angle: Math.random() * TAU,
          speed: 0.32 + Math.random() * 0.88,
          reach: 0.40 + Math.random() * 0.60,
          width: 1.4 + Math.random() * 2.2,
          jitter: 0.05 + Math.random() * 0.09,
          phase: Math.random() * TAU,
        })),
      };
      // Keep only current and previous seed profiles to avoid unbounded growth.
      this.__shadowPortalSeedCache.set(seedCacheKey, seeds);
      if (this.__shadowPortalSeedCache.size > 2) {
        const firstKey = this.__shadowPortalSeedCache.keys().next().value;
        if (firstKey !== seedCacheKey) this.__shadowPortalSeedCache.delete(firstKey);
      }
    }

    const {
      wisps,
      darkBlots,
      portalRifts,
      coreFilaments,
      ringMistBands,
      purpleJets,
      outerLightning,
    } = seeds;

    const resize = () => {
      width = Math.max(1, Math.floor(window.innerWidth));
      height = Math.max(1, Math.floor(window.innerHeight));
      maxSide = Math.max(width, height);
      cx = width / 2;
      cy = height / 2;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    let resizeTimer = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    };
    window.addEventListener("resize", onResize);

    const start = performance.now();
    // ── Canvas phase diagnostics (log once per phase) ──
    const _canvasDiag = { formDone: false, revealStarted: false, fadeStarted: false, done: false };
    const _cdLog = (phase) => { if (this.settings?.debugMode) console.log(`%c[PortalDiag]%c ${phase} %c@ ${Math.round(performance.now() - start)}ms (canvas)`, "color:#a855f7;font-weight:bold", "color:#e2e8f0", "color:#94a3b8"); };

    const draw = (now) => {
      if (stopped) return;

      const elapsed = now - start;
      const t = Math.max(0, Math.min(1, elapsed / Math.max(1, duration)));
      const swirl = elapsed * 0.0022;
      const revealStart = 0.35;

      // ── Phase state: GSAP-driven or vanilla-computed ──
      let easeInOut, fadeOut, formT, formEase, portalForm, revealProgress, revealEase;
      if (_gsap) {
        easeInOut = _gsap.easeInOut;
        fadeOut = _gsap.fadeOut;
        formEase = _gsap.formEase;
        portalForm = _gsap.portalForm;
        revealProgress = _gsap.revealProgress;
        revealEase = _gsap.revealEase;
        formT = formEase; // diagnostics compat
      } else {
        easeInOut = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        fadeOut = t < 0.96 ? 1 : Math.max(0, 1 - (t - 0.96) / 0.04);
        formT = Math.min(1, t / 0.22);
        formEase = 1 - Math.pow(1 - formT, 3);
        portalForm = 0.38 + 0.62 * formEase;
        revealProgress = t <= revealStart ? 0 : Math.min(1, (t - revealStart) / (1 - revealStart));
        revealEase = revealProgress < 0.5
          ? 2 * revealProgress * revealProgress
          : 1 - Math.pow(-2 * revealProgress + 2, 2) / 2;
      }

      // Phase crossing diagnostics
      if (!_canvasDiag.formDone && formT >= 1) { _canvasDiag.formDone = true; _cdLog("FORMATION_COMPLETE (formT=1, t=0.22)"); }
      if (!_canvasDiag.revealStarted && t > revealStart) { _canvasDiag.revealStarted = true; _cdLog(`REVEAL_APERTURE_START (t=${t.toFixed(3)}, target=0.74)`); }
      if (!_canvasDiag.fadeStarted && t >= 0.95) { _canvasDiag.fadeStarted = true; _cdLog("FADE_OUT_START (t=0.95)"); }
      if (!_canvasDiag.done && t >= 1) { _canvasDiag.done = true; _cdLog("CANVAS_ANIMATION_END (t=1)"); }

      // ── Glow breathing multipliers (GSAP Phase 5; 1.0 in vanilla) ──
      const glowMul = _gsap ? _gsap.ringGlow : 1;
      const coreGlowMul = _gsap ? _gsap.coreGlow : 1;
      // ── Vortex dynamics (GSAP-driven; static fallback in vanilla) ──
      const vortexSpinMul = _gsap ? _gsap.vortexSpin : 0;
      const strandMorphMul = _gsap ? _gsap.strandMorph : 0;
      const tendrilPulseMul = _gsap ? _gsap.tendrilPulse : 0.5;

      const portalRadius = maxSide * (0.68 + 1.28 * easeInOut);
      const innerRadius = portalRadius * (0.62 + 0.1 * Math.sin(swirl * 4.4));

      ctx.clearRect(0, 0, width, height);

      const ambientDim = (0.18 + 0.35 * formEase) * fadeOut;
      ctx.fillStyle = `rgba(2, 2, 6, ${ambientDim.toFixed(4)})`;
      ctx.fillRect(0, 0, width, height);

      const veilOuter = maxSide * (0.58 + 0.9 * formEase);
      const veilInner = Math.max(2, innerRadius * (0.1 + 0.18 * formEase));
      const veil = ctx.createRadialGradient(cx, cy, veilInner, cx, cy, veilOuter);
      veil.addColorStop(0, `rgba(6, 4, 10, ${(0.52 * portalForm * fadeOut).toFixed(4)})`);
      veil.addColorStop(0.26, `rgba(4, 3, 8, ${(0.56 * portalForm * fadeOut).toFixed(4)})`);
      veil.addColorStop(0.62, `rgba(2, 2, 4, ${(0.34 * portalForm * fadeOut).toFixed(4)})`);
      veil.addColorStop(1, `rgba(0, 0, 0, ${(0.10 * formEase * fadeOut).toFixed(4)})`);
      ctx.fillStyle = veil;
      ctx.beginPath();
      ctx.arc(cx, cy, veilOuter, 0, TAU);
      ctx.fill();

      for (let wi = 0; wi < wisps.length; wi += detailStep) {
        const wisp = wisps[wi];
        const ang = wisp.angle + swirl * wisp.speed + Math.sin(swirl * 0.8 + wisp.phase) * 0.2;
        const orbit = portalRadius * (0.34 + wisp.offset * 0.72) + Math.sin(swirl * 2.4 + wisp.phase) * portalRadius * 0.12;
        const x = cx + Math.cos(ang) * orbit + Math.sin(swirl + wisp.phase) * 20 * wisp.drift;
        const y = cy + Math.sin(ang) * orbit * 0.78 + Math.cos(swirl * 0.92 + wisp.phase) * 14 * wisp.drift;
        const r = wisp.size * (0.88 + easeInOut * 0.72);
        const alpha = (0.03 + 0.22 * (1 - wisp.offset * 0.68)) * fadeOut * portalForm;

        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(12, 10, 18, ${(alpha * 1.4).toFixed(4)})`);
        g.addColorStop(0.56, `rgba(4, 3, 8, ${(alpha * 1.1).toFixed(4)})`);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }

      for (let bi = 0; bi < darkBlots.length; bi += detailStep) {
        const blot = darkBlots[bi];
        const ang = blot.angle + swirl * blot.speed + Math.sin(swirl * 0.9 + blot.phase) * 0.32;
        const radius = innerRadius * (0.22 + blot.offset * 0.86);
        const x = cx + Math.cos(ang) * radius;
        const y = cy + Math.sin(ang) * radius * 0.82;
        const r = blot.size * (0.82 + easeInOut * 0.62);
        const alpha = (0.18 + 0.26 * (1 - blot.offset * 0.7)) * fadeOut * portalForm;
        const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
        bg.addColorStop(0, `rgba(0, 0, 0, ${Math.min(0.86, alpha).toFixed(4)})`);
        bg.addColorStop(0.62, `rgba(0, 0, 0, ${(alpha * 0.58).toFixed(4)})`);
        bg.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }

      // Purple portal energy is concentrated on the ring, not the center.
      const ringOuterClip = innerRadius * (1.18 + 0.05 * Math.sin(swirl * 1.6));
      const ringInnerClip = innerRadius * (0.66 + 0.04 * Math.sin(swirl * 2.1));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, ringOuterClip, 0, TAU);
      ctx.arc(cx, cy, ringInnerClip, 0, TAU, true);
      ctx.clip("evenodd");
      ctx.globalCompositeOperation = "screen";

      for (let ri = 0; ri < portalRifts.length; ri += detailStep) {
        const rift = portalRifts[ri];
        const base = rift.angle + swirl * rift.speed + Math.sin(swirl * 1.2 + rift.phase) * 0.22;
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const p = i / 8;
          const rr = innerRadius * (
            1.06 -
            p * rift.length * 0.34 +
            0.08 * Math.sin(swirl * 2.3 + rift.phase + p * 2.8)
          );
          const ang = base + (p - 0.48) * rift.spread + Math.sin(swirl * 2 + rift.phase + p) * 0.08;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.86;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const glow = (0.25 + 0.32 * Math.sin(swirl * 2.6 + rift.phase)) * fadeOut;
        ctx.strokeStyle = `rgba(100, 60, 160, ${Math.max(0.05, glow * 0.6).toFixed(4)})`;
        ctx.lineWidth = rift.lineWidth + easeInOut * 1.8;
        ctx.shadowBlur = (8 + easeInOut * 14) * shadowScale * glowMul;
        ctx.shadowColor = "rgba(80, 40, 140, 0.5)";
        ctx.stroke();
      }

      for (let fi = 0; fi < coreFilaments.length; fi += detailStep) {
        const filament = coreFilaments[fi];
        const base = filament.angle + swirl * filament.speed + Math.sin(swirl * 1.8 + filament.phase) * 0.26;
        ctx.beginPath();
        for (let i = 0; i <= 7; i++) {
          const p = i / 7;
          const rr = innerRadius * (
            0.74 +
            p * filament.length * 0.44 +
            0.06 * Math.sin(swirl * 2.9 + filament.phase + p * 2.2)
          );
          const ang = base + p * filament.spread * 0.6 + Math.sin(swirl * 2.1 + filament.phase + p) * 0.06;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.88;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const glow = (0.22 + 0.3 * Math.sin(swirl * 3.2 + filament.phase)) * fadeOut;
        ctx.strokeStyle = `rgba(120, 80, 170, ${Math.max(0.05, glow * 0.55).toFixed(4)})`;
        ctx.lineWidth = filament.lineWidth + easeInOut * 1.1;
        ctx.shadowBlur = (6 + easeInOut * 10) * shadowScale * glowMul;
        ctx.shadowColor = "rgba(90, 50, 150, 0.45)";
        ctx.stroke();
      }

      for (let ji = 0; ji < purpleJets.length; ji += detailStep) {
        const jet = purpleJets[ji];
        const jetBase = jet.angle + swirl * jet.speed + Math.sin(swirl * 1.7 + jet.phase) * 0.24;
        const startR = innerRadius * (0.82 + 0.3 * Math.sin(swirl * 1.3 + jet.phase) * 0.2);
        const endR = startR + innerRadius * (0.12 + jet.length * 0.26);
        const waviness = 0.05 + jet.spread * 0.1;

        ctx.beginPath();
        for (let i = 0; i <= 5; i++) {
          const p = i / 5;
          const rr = startR + (endR - startR) * p;
          const ang = jetBase + (p - 0.5) * jet.spread * 0.5 + Math.sin(swirl * 3.1 + jet.phase + p * 4.2) * waviness;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.87;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const glow = (0.22 + 0.25 * Math.sin(swirl * 3 + jet.phase)) * fadeOut;
        ctx.strokeStyle = `rgba(80, 50, 130, ${Math.max(0.04, glow * 0.5).toFixed(4)})`;
        ctx.lineWidth = jet.lineWidth + easeInOut * 1.4;
        ctx.shadowBlur = (6 + easeInOut * 10) * shadowScale;
        ctx.shadowColor = "rgba(50, 28, 90, 0.4)";
        ctx.stroke();
      }
      ctx.restore();

      const voidGradient = ctx.createRadialGradient(cx, cy, innerRadius * 0.14, cx, cy, innerRadius * 2.18);
      voidGradient.addColorStop(0, `rgba(4, 2, 8, ${(0.88 * fadeOut).toFixed(4)})`);
      voidGradient.addColorStop(0.34, `rgba(2, 1, 5, ${(0.96 * fadeOut).toFixed(4)})`);
      voidGradient.addColorStop(0.72, `rgba(1, 1, 2, ${(0.92 * fadeOut).toFixed(4)})`);
      voidGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = voidGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius * 2.18, 0, TAU);
      ctx.fill();

      // Hard occlusion mask so the portal body is fully solid.
      const solidPortalRadius = innerRadius * (1.02 + 0.03 * Math.sin(swirl * 3.1));
      const solidPortalAlpha = Math.min(1, 0.98 * fadeOut + 0.02);
      ctx.fillStyle = `rgba(0, 0, 0, ${solidPortalAlpha.toFixed(4)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, solidPortalRadius, 0, TAU);
      ctx.fill();

      const coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerRadius);
      coreGradient.addColorStop(0, `rgba(0, 0, 0, ${(1 * fadeOut).toFixed(4)})`);
      coreGradient.addColorStop(0.32, `rgba(0, 0, 0, ${(1 * fadeOut).toFixed(4)})`);
      coreGradient.addColorStop(0.72, `rgba(0, 0, 0, ${(1 * fadeOut).toFixed(4)})`);
      coreGradient.addColorStop(1, `rgba(0, 0, 0, ${(1 * fadeOut).toFixed(4)})`);
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(0, 0, 0, ${(1 * fadeOut).toFixed(4)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius * 0.78, 0, TAU);
      ctx.fill();

      // Large center vortex so formation reads as a portal, not a plain overlay.
      const coreVortexAlpha = (0.24 + 0.42 * (1 - revealProgress)) * fadeOut * portalForm;
      if (coreVortexAlpha > 0.004) {
        const coreVortexRadius = innerRadius * (1.0 + 0.52 * formEase) * (0.5 + 0.5 * coreGlowMul);
        ctx.save();
        ctx.globalCompositeOperation = "source-over";

        const vortexGlow = ctx.createRadialGradient(
          cx,
          cy,
          Math.max(2, coreVortexRadius * 0.08),
          cx,
          cy,
          coreVortexRadius
        );
        vortexGlow.addColorStop(0, `rgba(40, 20, 70, ${(coreVortexAlpha * 0.8).toFixed(4)})`);
        vortexGlow.addColorStop(0.28, `rgba(16, 10, 32, ${(coreVortexAlpha * 0.6).toFixed(4)})`);
        vortexGlow.addColorStop(0.62, `rgba(6, 4, 14, ${(coreVortexAlpha * 0.4).toFixed(4)})`);
        vortexGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = vortexGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, coreVortexRadius, 0, TAU);
        ctx.fill();

        // ── GSAP-enhanced swirl strands (8 strands, unified rotation + tapered width) ──
        const swirlCount = 8;
        const swirlPoints = _gsap ? 24 : (perfTier === 0 ? 12 : 16);
        const strandSeeds = [0.73, 0.21, 0.58, 0.92, 0.37, 0.85, 0.14, 0.66];
        // 6 unified CW + 2 rebel CCW (indices 2, 5) for organic feel
        const strandDirs = [1, 1, -1, 1, 1, -1, 1, 1];
        // Tight speed cluster so strands rotate cohesively
        const strandSpeeds = [1.24, 1.18, 0.88, 1.30, 1.22, 0.92, 1.26, 1.20];
        const strandTurns = [2.4, 2.2, 1.6, 2.5, 2.3, 1.8, 2.6, 2.1];
        // GSAP accelerating spin adds growing angular offset to all strands
        const spinOffset = vortexSpinMul * TAU * 0.8;
        const tierScale = perfTier === 0 ? 0.9 : 1;
        for (let s = 0; s < swirlCount; s++) {
          const phase = swirl * strandSpeeds[s];
          const dir = strandDirs[s];
          const base = strandSeeds[s] * TAU + phase * dir + spinOffset * dir;
          const wobbleFreq = 2.4 + s * 0.7;
          const wobbleAmp = (0.10 + 0.06 * Math.sin(phase * 0.6 + s)) * (1 + strandMorphMul * 1.2);

          // Compute all points first, then draw segments with tapering width
          const pts = [];
          for (let i = 0; i <= swirlPoints; i++) {
            const p = i / swirlPoints;
            const morphWave = strandMorphMul * 0.1 * Math.sin(phase * 2.3 + p * 9.1 + s * 1.7);
            const rr = coreVortexRadius * (
              0.08 +
              1.48 * p +
              0.12 * Math.sin(phase * 1.9 + p * 6.4 + s * 1.3) +
              0.06 * Math.sin(phase * 3.7 + p * 11.8 + s * 0.9) +
              morphWave
            );
            const twist = p * strandTurns[s] * dir;
            const distort =
              Math.sin(phase * wobbleFreq + p * 8.6 + s * 0.5) * wobbleAmp +
              Math.sin(phase * 4.1 + p * 13.2 + s * 1.1) * 0.04 +
              strandMorphMul * 0.06 * Math.sin(phase * 5.3 + p * 15.4 + s * 2.1);
            const ang = base + twist + distort;
            pts.push({
              x: cx + Math.cos(ang) * rr,
              y: cy + Math.sin(ang) * rr * 0.86,
            });
          }

          // Draw tapered segments — wispy at center, bold at outer edge
          const strandAlpha = coreVortexAlpha * (0.58 + 0.42 * Math.sin(phase + s * 0.8));
          const baseW = (1.0 + strandMorphMul * 0.5) * tierScale;
          const maxW = (16.0 + strandMorphMul * 4.0) * tierScale;
          ctx.lineCap = "round";
          for (let i = 0; i < pts.length - 1; i++) {
            const p = i / (pts.length - 1);
            const segAlpha = strandAlpha * (0.3 + 0.7 * p); // also fades in from center
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
            ctx.lineWidth = baseW + (maxW - baseW) * p * p; // quadratic taper — slow start, dramatic end
            ctx.strokeStyle = `rgba(90, 55, 150, ${Math.max(0.03, segAlpha * 0.65).toFixed(4)})`;
            ctx.shadowBlur = (4 + 16 * p + strandMorphMul * 4) * shadowScale * coreGlowMul;
            ctx.shadowColor = `rgba(60, 30, 110, ${(segAlpha * 0.55).toFixed(4)})`;
            ctx.stroke();
          }
          ctx.lineCap = "butt";
        }

        // ── Spiral tendrils — replaces static blob with dynamic swirling filaments ──
        const tendrilCount = 12;
        const tendrilPoints = _gsap ? 28 : 18;
        for (let ti = 0; ti < tendrilCount; ti++) {
          const baseAngle = (ti / tendrilCount) * TAU + swirl * 0.9 + spinOffset * 1.2;
          const spiralTightness = 1.8 + ti * 0.12 + strandMorphMul * 0.4;
          // 9 unified CW, 3 chaotic CCW (indices 3, 7, 10) for organic feel
          const spiralDir = (ti === 3 || ti === 7 || ti === 10) ? -1 : 1;

          ctx.beginPath();
          for (let i = 0; i <= tendrilPoints; i++) {
            const p = i / tendrilPoints;
            // Archimedean spiral: r grows linearly with angle
            const rBase = coreVortexRadius * (0.04 + p * 0.42);
            const rWobble = coreVortexRadius * 0.06 * Math.sin(swirl * 2.8 + ti * 1.3 + p * 5.2) * (1 + tendrilPulseMul * 0.6);
            const rr = rBase + rWobble;
            const spiralAngle = baseAngle
              + p * spiralTightness * spiralDir
              + Math.sin(swirl * 2.5 + ti + p * 3) * 0.15 * (1 + tendrilPulseMul)
              + Math.sin(swirl * 4.3 + ti * 0.7 + p * 7.8) * 0.05;
            const x = cx + Math.cos(spiralAngle) * rr;
            const y = cy + Math.sin(spiralAngle) * rr * 0.88;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          const tAlpha = coreVortexAlpha * (0.35 + 0.45 * tendrilPulseMul) * (0.5 + 0.5 * Math.sin(swirl * 2 + ti * 0.52));
          ctx.strokeStyle = `rgba(100, 60, 165, ${Math.max(0.04, tAlpha * 0.7).toFixed(4)})`;
          ctx.lineWidth = 1.0 + 0.5 * Math.sin(swirl * 3 + ti * 0.9) + tendrilPulseMul * 0.4;
          ctx.shadowBlur = (6 + tendrilPulseMul * 6) * shadowScale * coreGlowMul;
          ctx.shadowColor = `rgba(80, 40, 140, ${(tAlpha * 0.5).toFixed(4)})`;
          ctx.stroke();
        }

        // ── Void eye — concentric broken rings with tapered ends ──
        const eyeR = coreVortexRadius * (0.40 + 0.06 * coreGlowMul);
        const eyePulse = 0.7 + 0.3 * tendrilPulseMul;
        const ringCount = 6;
        const arcSegs = 20; // segments per arc for taper effect

        for (let ri = 0; ri < ringCount; ri++) {
          const depth = ri / (ringCount - 1);
          const radius = Math.max(2, eyeR * (0.95 - 0.82 * depth) * (1 + 0.06 * Math.sin(swirl * 2.1 + ri * 1.4) * eyePulse));
          const ringSpeed = 0.6 + depth * 1.4;
          const ringAngle = swirl * ringSpeed + spinOffset * (0.3 + depth * 0.5) + ri * 1.1;
          // Base width at thickest point (center of arc)
          const peakW = (6.0 + 12.0 * (1 - depth) + strandMorphMul * 3.0) * tierScale;
          const pr = Math.round(110 - 50 * depth);
          const pg = Math.round(60 - 30 * depth);
          const pb = Math.round(200 - 60 * depth);
          const ringAlpha = coreVortexAlpha * (0.7 + 0.3 * (1 - depth)) * eyePulse;

          // Fewer arcs but longer — more coverage
          const arcCount = 2 + Math.floor(depth * 1.5);
          const gapFraction = 0.08 + 0.06 * depth;
          const arcSpan = (TAU / arcCount) * (1 - gapFraction);

          for (let ai = 0; ai < arcCount; ai++) {
            const arcStart = ringAngle + (ai / arcCount) * TAU;
            const wobble = 0.08 * Math.sin(swirl * 3.2 + ri * 2.1 + ai * 1.7) * eyePulse;
            const a0 = arcStart + wobble;

            // Draw arc as segments with tapered width (thick center, thin ends)
            ctx.lineCap = "round";
            for (let si = 0; si < arcSegs; si++) {
              const t0 = si / arcSegs;
              const t1 = (si + 1) / arcSegs;
              const ang0 = a0 + t0 * arcSpan;
              const ang1 = a0 + t1 * arcSpan;
              // Taper: 0 at ends, 1 at center (symmetric parabola)
              const mid = (t0 + t1) * 0.5;
              const taper = 1 - 4 * (mid - 0.5) * (mid - 0.5); // peaks at 0.5
              const segW = Math.max(1, peakW * (0.12 + 0.88 * taper));
              const segAlpha = ringAlpha * (0.3 + 0.7 * taper);

              ctx.beginPath();
              ctx.arc(cx, cy, radius, ang0, ang1);
              ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${Math.max(0.04, segAlpha * 0.85).toFixed(4)})`;
              ctx.lineWidth = segW;
              ctx.shadowBlur = (6 + 10 * (1 - depth)) * taper * shadowScale * coreGlowMul;
              ctx.shadowColor = `rgba(${pr}, ${pg}, ${pb}, ${(segAlpha * 0.4).toFixed(4)})`;
              ctx.stroke();
            }
          }
        }
        ctx.lineCap = "butt";

        // Center blob — single wobbly purple shape
        const blobR = eyeR * (0.12 + 0.03 * coreGlowMul);
        const blobPulse = 0.75 + 0.25 * tendrilPulseMul;
        const blobPts = 24;
        ctx.beginPath();
        for (let bi = 0; bi <= blobPts; bi++) {
          const bp = bi / blobPts;
          const bAng = bp * TAU + swirl * 0.8 + spinOffset * 0.4;
          const w = blobR * (
            1.0
            + 0.2 * Math.sin(swirl * 2.4 + bp * 5.5 + 0.3) * blobPulse
            + 0.12 * Math.sin(swirl * 4.1 + bp * 10.0 + 1.2)
          );
          const bx = cx + Math.cos(bAng) * w;
          const by = cy + Math.sin(bAng) * w * 0.9;
          if (bi === 0) ctx.moveTo(bx, by);
          else ctx.lineTo(bx, by);
        }
        ctx.closePath();
        const blobAlpha = coreVortexAlpha * 0.85 * blobPulse;
        ctx.fillStyle = `rgba(105, 60, 180, ${blobAlpha.toFixed(4)})`;
        ctx.shadowBlur = 14 * shadowScale * coreGlowMul;
        ctx.shadowColor = `rgba(120, 70, 200, ${(blobAlpha * 0.6).toFixed(4)})`;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
      }

      // Chaotic lightning — disabled
      const lightningRamp = Math.max(0, Math.min(1, t / 0.28));
      if (false && lightningRamp > 0.01) {
        const boltStep = perfTier === 0 ? Math.max(2, detailStep) : detailStep;
        const creationBoost = Math.max(
          0,
          Math.min(1, 1 - t / Math.max(0.01, revealStart + 0.08))
        );
        const activeBoltStep =
          creationBoost > 0.24 ? Math.max(1, boltStep - 1) : boltStep;
        const mainSteps = perfTier === 0 ? 4 : 6;
        const branchSteps = perfTier === 0 ? 3 : 4;
        const lightningRadius =
          innerRadius * (0.86 + 0.14 * formEase + Math.sin(swirl * 1.9) * 0.05);
        const lightningFade = Math.max(0, 1 - revealProgress * 0.28);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        for (let li = 0; li < outerLightning.length; li += activeBoltStep) {
          const bolt = outerLightning[li];
          const drift = swirl * bolt.speed + bolt.phase;
          const flicker =
            0.5 +
            0.5 * Math.sin(drift * 4.4 + t * 12.4) +
            0.35 * Math.sin(drift * 7.2 + bolt.phase * 1.3);
          const flickerGate = -0.18 - creationBoost * 0.16;
          if (flicker < flickerGate) continue;

          const alpha =
            (0.22 + 0.34 * (flicker * 0.5 + 0.5)) *
            (1 + creationBoost * 0.55) *
            lightningRamp *
            lightningFade *
            fadeOut;
          if (alpha <= 0.004) continue;

          const baseA = bolt.angle + drift * 0.24 + Math.sin(drift * 2.1) * 0.08;
          const startR = lightningRadius * (0.96 + 0.08 * Math.sin(drift * 1.8));
          const reach = innerRadius * (0.38 + bolt.reach * (0.82 + 0.52 * lightningRamp));
          const span = 0.10 + 0.05 * Math.sin(drift * 2.6 + bolt.phase);

          ctx.beginPath();
          for (let i = 0; i <= mainSteps; i++) {
            const p = i / mainSteps;
            const rr = startR + reach * p;
            const jag =
              Math.sin(drift * 3.2 + p * 12.6) * 0.5 +
              0.3 * Math.sin(drift * 5.6 + p * 8.1 + bolt.phase);
            const ang = baseA + (p - 0.24) * span + jag * bolt.jitter * (1 + p * 0.7);
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr * 0.88;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          ctx.strokeStyle = `rgba(148, 88, 240, ${(alpha * 0.92).toFixed(4)})`;
          ctx.lineWidth = bolt.width + 2.4;
          ctx.shadowBlur = (22 + (1 - revealProgress) * 22) * shadowScale;
          ctx.shadowColor = `rgba(132, 72, 228, ${(alpha * 1.0).toFixed(4)})`;
          ctx.stroke();

          ctx.strokeStyle = `rgba(232, 192, 255, ${Math.min(0.68, alpha + 0.12).toFixed(4)})`;
          ctx.lineWidth = Math.max(1.4, bolt.width * 0.82);
          ctx.shadowBlur = (12 + (1 - revealProgress) * 14) * shadowScale;
          ctx.shadowColor = `rgba(198, 152, 255, ${(alpha * 0.95).toFixed(4)})`;
          ctx.stroke();

          if (flicker > (0.08 - creationBoost * 0.32)) {
            const dir = Math.sin(drift * 2.2 + bolt.phase) > 0 ? 1 : -1;
            const branchStartP = 0.34 + 0.22 * (0.5 + 0.5 * Math.sin(drift * 1.5 + bolt.phase));
            const fromR = startR + reach * branchStartP;
            const fromA = baseA + dir * 0.04;
            const branchReach = reach * (0.48 + 0.32 * (0.5 + 0.5 * Math.sin(drift * 2.4)));
            const branchSpan = dir * (0.16 + 0.08 * Math.sin(drift * 3 + bolt.phase));

            ctx.beginPath();
            for (let b = 0; b <= branchSteps; b++) {
              const p = b / branchSteps;
              const rr = fromR + branchReach * p;
              const jag =
                Math.sin(drift * 4.1 + p * 9.2) * 0.5 +
                0.24 * Math.sin(drift * 6.3 + p * 6.1 + bolt.phase);
              const ang = fromA + p * branchSpan + jag * bolt.jitter * 0.7;
              const x = cx + Math.cos(ang) * rr;
              const y = cy + Math.sin(ang) * rr * 0.88;
              if (b === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }

            const branchAlpha = alpha * 0.72;
            ctx.strokeStyle = `rgba(156, 108, 240, ${branchAlpha.toFixed(4)})`;
            ctx.lineWidth = Math.max(1.0, bolt.width * 0.76);
            ctx.shadowBlur = (12 + (1 - revealProgress) * 12) * shadowScale;
            ctx.shadowColor = `rgba(138, 88, 228, ${(branchAlpha * 0.9).toFixed(4)})`;
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      // Late-stage reveal: black rim with dense mist and purple turbulence.
      if (revealProgress > 0) {
        const apertureRadius =
          innerRadius *
          (0.24 + 2.36 * revealEase) *
          (1 + Math.sin(swirl * 9.8) * 0.11 * (1 - revealProgress * 0.62));

        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(cx, cy, apertureRadius, 0, TAU);
        ctx.fill();
        ctx.restore();

        const ringRadius = apertureRadius * (1 + Math.sin(swirl * 10.8) * 0.026);
        const rimWidth = innerRadius * (0.48 + (1 - revealProgress) * 0.28);
        const ringInner = Math.max(2, ringRadius - rimWidth * 0.42);
        const ringOuter = ringRadius + rimWidth * 1.3;

        ctx.save();
        ctx.globalCompositeOperation = "source-over";

        const ringBody = ctx.createRadialGradient(cx, cy, ringInner, cx, cy, ringOuter);
        ringBody.addColorStop(0, `rgba(0, 0, 0, ${(1.0 * fadeOut).toFixed(4)})`);
        ringBody.addColorStop(0.42, `rgba(0, 0, 0, ${(1.0 * fadeOut).toFixed(4)})`);
        ringBody.addColorStop(0.68, `rgba(4, 2, 8, ${(0.92 * fadeOut).toFixed(4)})`);
        ringBody.addColorStop(0.88, `rgba(8, 6, 14, ${(0.64 * fadeOut).toFixed(4)})`);
        ringBody.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = ringBody;
        ctx.beginPath();
        ctx.arc(cx, cy, ringOuter, 0, TAU);
        ctx.arc(cx, cy, ringInner, 0, TAU, true);
        ctx.fill("evenodd");

        const blackRimAlpha = Math.max(0, (1.0 - revealProgress * 0.18) * fadeOut);
        if (blackRimAlpha > 0.006) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0, 0, 0, ${blackRimAlpha.toFixed(4)})`;
          ctx.lineWidth = 14 + (1 - revealProgress) * 20;
          ctx.shadowBlur = (14 + (1 - revealProgress) * 22) * shadowScale;
          ctx.shadowColor = `rgba(0, 0, 0, ${(blackRimAlpha * 0.78).toFixed(4)})`;
          ctx.arc(cx, cy, ringRadius, 0, TAU);
          ctx.stroke();
        }

        const edgeAlpha = Math.max(0, (0.34 - revealProgress * 0.12) * fadeOut);
        if (edgeAlpha > 0.004) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(124, 120, 136, ${edgeAlpha.toFixed(4)})`;
          ctx.lineWidth = 1.2 + (1 - revealProgress) * 1.4;
          ctx.shadowBlur = (8 + (1 - revealProgress) * 8) * shadowScale;
          ctx.shadowColor = `rgba(48, 44, 60, ${(edgeAlpha * 0.84).toFixed(4)})`;
          ctx.arc(cx, cy, ringRadius + rimWidth * 0.34, 0, TAU);
          ctx.stroke();
        }

        for (let mi = 0; mi < ringMistBands.length; mi += mistStep) {
          const band = ringMistBands[mi];
          const drift = swirl * band.speed + band.phase;
          const radius = ringRadius + innerRadius * (0.03 + (band.band - 0.9) * 0.24) + Math.sin(drift * 1.2) * innerRadius * 0.03;
          const arcLength = band.width + Math.sin(drift * 1.8) * 0.04;
          const start = band.angle + drift * 0.32;
          const alpha = (0.07 + 0.12 * (1 - revealProgress)) * (0.7 + Math.sin(drift * 2.4) * 0.3) * fadeOut;
          if (alpha <= 0.004) continue;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(66, 66, 76, ${Math.max(0.01, alpha).toFixed(4)})`;
          ctx.lineWidth = band.lineWidth + (1 - revealProgress) * 1.8;
          ctx.shadowBlur = (10 + (1 - revealProgress) * 16) * shadowScale;
          ctx.shadowColor = `rgba(18, 18, 24, ${(alpha * 0.9).toFixed(4)})`;
          ctx.arc(cx, cy, radius, start, start + arcLength);
          ctx.stroke();
        }

        // Expanding shockwave ripples — start beyond ring outer edge for visibility
        // Phase 3: shockwaveBoost adds elastic overshoot to radius (GSAP) or 0 (vanilla)
        const swBoost = _gsap ? _gsap.shockwaveBoost : 0;
        for (let i = 0; i < 5; i++) {
          const wave = revealProgress * 1.45 - i * 0.18;
          if (wave <= 0 || wave >= 1.52) continue;
          // Start from ring outer edge so thick ring doesn't cover them
          // shockwaveBoost scales radius by up to 18% via elastic.out overshoot
          const waveRadius = ringOuter + innerRadius * wave * (0.92 + swBoost * 0.18);
          const waveAlpha = (0.38 * (1 - Math.min(1, wave)) * (1 - i * 0.12)) * fadeOut;
          if (waveAlpha <= 0.003) continue;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(72, 58, 96, ${waveAlpha.toFixed(4)})`;
          ctx.lineWidth = Math.max(1.5, 6.4 - wave * 2.8);
          ctx.shadowBlur = (16 + (1 - wave) * 24) * shadowScale * glowMul;
          ctx.shadowColor = `rgba(48, 32, 78, ${(waveAlpha * 0.88).toFixed(4)})`;
          ctx.arc(cx, cy, waveRadius, 0, TAU);
          ctx.stroke();
        }

        // Purple energy jets — centered on ring body
        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < purpleJets.length; i += detailStep) {
          const jet = purpleJets[i];
          const drift = swirl * jet.speed + jet.phase;
          const radius = ringRadius + innerRadius * (0.01 + Math.sin(drift * 1.7) * 0.04);
          const start = jet.angle + drift * 0.24;
          const span = 0.12 + jet.spread * 0.18 + Math.sin(drift * 2.1) * 0.03;
          const alpha = (0.24 + 0.34 * (1 - revealProgress)) * (0.7 + Math.sin(drift * 3.1) * 0.3) * fadeOut;
          if (alpha <= 0.004) continue;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(80, 50, 130, ${Math.max(0.04, alpha * 0.5).toFixed(4)})`;
          ctx.lineWidth = jet.lineWidth + 1.6 + (1 - revealProgress) * 2.4;
          ctx.shadowBlur = (12 + (1 - revealProgress) * 14) * shadowScale;
          ctx.shadowColor = `rgba(50, 28, 90, ${(alpha * 0.45).toFixed(4)})`;
          ctx.arc(cx, cy, radius, start, start + span);
          ctx.stroke();
        }

        // Secondary lightning during pulse-out reveal — boosted alpha & reach for thick ring
        const revealLightningRamp = Math.max(0, Math.min(1, (revealProgress - 0.08) / 0.92));
        if (revealLightningRamp > 0.01) {
          const revealBoltStep = Math.max(perfTier === 0 ? 3 : 2, detailStep + 1);
          const revealMainSteps = perfTier === 0 ? 4 : 5;
          const revealBranchSteps = perfTier === 0 ? 3 : 4;
          const revealLightningRadius = ringOuter + rimWidth * 0.12;

          for (let li = 0; li < outerLightning.length; li += revealBoltStep) {
            const bolt = outerLightning[li];
            const drift = swirl * (bolt.speed * 1.06) + bolt.phase;
            const flicker =
              0.5 +
              0.5 * Math.sin(drift * 4.2 + revealProgress * 16) +
              0.3 * Math.sin(drift * 6.6 + bolt.phase * 1.2);
            if (flicker < -0.04) continue;

            const alpha =
              (0.10 + 0.18 * (flicker * 0.5 + 0.5)) *
              revealLightningRamp *
              fadeOut;
            if (alpha <= 0.003) continue;

            const baseA = bolt.angle + drift * 0.2 + Math.sin(drift * 1.8) * 0.06;
            const startR = revealLightningRadius * (0.98 + 0.05 * Math.sin(drift * 1.7));
            const reach = innerRadius * (0.18 + bolt.reach * 0.42);
            const span = 0.2 + 0.08 * Math.sin(drift * 2.4 + bolt.phase);

            ctx.beginPath();
            for (let i = 0; i <= revealMainSteps; i++) {
              const p = i / revealMainSteps;
              const rr = startR + reach * p;
              const jag =
                Math.sin(drift * 3 + p * 12.2) +
                0.58 * Math.sin(drift * 5.1 + p * 7.6 + bolt.phase);
              const ang = baseA + (p - 0.24) * span + jag * bolt.jitter * (1 + p * 1.12);
              const x = cx + Math.cos(ang) * rr;
              const y = cy + Math.sin(ang) * rr * 0.88;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }

            ctx.strokeStyle = `rgba(108, 64, 198, ${(alpha * 0.72).toFixed(4)})`;
            ctx.lineWidth = Math.max(0.78, bolt.width * 0.88);
            ctx.shadowBlur = (10 + (1 - revealProgress) * 8) * shadowScale;
            ctx.shadowColor = `rgba(100, 58, 188, ${(alpha * 0.88).toFixed(4)})`;
            ctx.stroke();

            ctx.strokeStyle = `rgba(208, 164, 255, ${Math.min(0.32, alpha + 0.03).toFixed(4)})`;
            ctx.lineWidth = Math.max(0.7, bolt.width * 0.48);
            ctx.shadowBlur = (5 + (1 - revealProgress) * 6) * shadowScale;
            ctx.shadowColor = `rgba(170, 126, 246, ${(alpha * 0.74).toFixed(4)})`;
            ctx.stroke();

            if (flicker > 0.26) {
              const dir = Math.sin(drift * 2 + bolt.phase) > 0 ? 1 : -1;
              const branchStartP = 0.36 + 0.2 * (0.5 + 0.5 * Math.sin(drift * 1.4 + bolt.phase));
              const fromR = startR + reach * branchStartP;
              const fromA = baseA + dir * 0.035;
              const branchReach = reach * (0.32 + 0.18 * (0.5 + 0.5 * Math.sin(drift * 2.1)));
              const branchSpan = dir * (0.18 + 0.08 * Math.sin(drift * 2.8 + bolt.phase));

              ctx.beginPath();
              for (let b = 0; b <= revealBranchSteps; b++) {
                const p = b / revealBranchSteps;
                const rr = fromR + branchReach * p;
                const jag =
                  Math.sin(drift * 3.8 + p * 8.6) +
                  0.45 * Math.sin(drift * 6 + p * 5.4 + bolt.phase);
                const ang = fromA + p * branchSpan + jag * bolt.jitter * 1.16;
                const x = cx + Math.cos(ang) * rr;
                const y = cy + Math.sin(ang) * rr * 0.88;
                if (b === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }

              const branchAlpha = alpha * 0.5;
              ctx.strokeStyle = `rgba(120, 76, 210, ${branchAlpha.toFixed(4)})`;
              ctx.lineWidth = Math.max(0.65, bolt.width * 0.52);
              ctx.shadowBlur = (7 + (1 - revealProgress) * 6) * shadowScale;
              ctx.shadowColor = `rgba(108, 70, 198, ${(branchAlpha * 0.82).toFixed(4)})`;
              ctx.stroke();
            }
          }
        }

        // Mist halo — solid atmospheric fog centered on ring
        const mistHalo = ctx.createRadialGradient(
          cx,
          cy,
          Math.max(2, ringRadius * 0.72),
          cx,
          cy,
          ringOuter + innerRadius * (0.78 + (1 - revealProgress) * 0.34)
        );
        mistHalo.addColorStop(0, "rgba(0, 0, 0, 0)");
        mistHalo.addColorStop(0.18, `rgba(42, 28, 68, ${(0.48 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(0.38, `rgba(64, 42, 108, ${(0.58 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(0.56, `rgba(86, 52, 148, ${(0.44 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(0.74, `rgba(58, 34, 102, ${(0.32 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(0.90, `rgba(32, 18, 62, ${(0.16 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = mistHalo;
        ctx.beginPath();
        ctx.arc(cx, cy, ringOuter + innerRadius * 1.0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      if (t < 1) rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      ctx.clearRect(0, 0, width, height);
    };
  },

  /**
   * OffscreenCanvas Worker version — runs the draw loop on a separate CPU thread.
   * Discord's main-thread navigation work cannot starve this animation.
   */
  _startPortalCanvasWorker(canvas, duration) {
    const TAU = Math.PI * 2;
    const screenArea = Math.max(1, Math.floor((window.innerWidth || 1920) * (window.innerHeight || 1080)));
    const perfTier = screenArea > 3200000 ? 0 : screenArea > 2400000 ? 1 : 2;
    const qualityScale = perfTier === 0 ? 0.58 : perfTier === 1 ? 0.76 : 1;
    const dprCap = perfTier === 0 ? 1.0 : perfTier === 1 ? 1.2 : 1.35;
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);

    // Generate seeds on main thread (fast, uses Math.random)
    const seedCacheKey = `v1:${perfTier}:${qualityScale.toFixed(2)}`;
    if (!(this.__shadowPortalSeedCache instanceof Map)) this.__shadowPortalSeedCache = new Map();
    let seeds = this.__shadowPortalSeedCache.get(seedCacheKey);
    if (!seeds) {
      const rng = () => Math.random();
      seeds = {
        wisps: Array.from({ length: Math.max(72, Math.round(128 * qualityScale)) }, () => ({
          angle: rng() * TAU, speed: 0.08 + rng() * 0.46, offset: 0.08 + rng() * 1.08,
          size: 20 + rng() * 74, phase: rng() * TAU, drift: rng() * 2 - 1,
        })),
        darkBlots: Array.from({ length: Math.max(34, Math.round(56 * qualityScale)) }, () => ({
          angle: rng() * TAU, speed: 0.12 + rng() * 0.38, offset: 0.12 + rng() * 0.92,
          size: 26 + rng() * 62, phase: rng() * TAU,
        })),
        portalRifts: Array.from({ length: Math.max(22, Math.round(42 * qualityScale)) }, () => ({
          angle: rng() * TAU, speed: 0.22 + rng() * 0.62, spread: 0.42 + rng() * 1.05,
          lineWidth: 1 + rng() * 2.6, length: 0.46 + rng() * 0.32, phase: rng() * TAU,
        })),
        coreFilaments: Array.from({ length: Math.max(16, Math.round(28 * qualityScale)) }, () => ({
          angle: rng() * TAU, speed: 0.3 + rng() * 0.82, spread: 0.62 + rng() * 1.12,
          lineWidth: 1 + rng() * 2, length: 0.54 + rng() * 0.26, phase: rng() * TAU,
        })),
        ringMistBands: Array.from({ length: Math.max(38, Math.round(84 * qualityScale)) }, () => ({
          angle: rng() * TAU, speed: 0.2 + rng() * 0.95, width: 0.06 + rng() * 0.22,
          band: 0.74 + rng() * 0.64, lineWidth: 1.1 + rng() * 2.7, phase: rng() * TAU,
        })),
        purpleJets: Array.from({ length: Math.max(18, Math.round(34 * qualityScale)) }, () => ({
          angle: rng() * TAU, speed: 0.24 + rng() * 0.92, length: 0.34 + rng() * 0.32,
          spread: 0.22 + rng() * 0.64, lineWidth: 1 + rng() * 2.5, phase: rng() * TAU,
        })),
        outerLightning: Array.from({ length: Math.max(28, Math.round(52 * qualityScale)) }, () => ({
          angle: rng() * TAU, speed: 0.32 + rng() * 0.88, reach: 0.40 + rng() * 0.60,
          width: 1.4 + rng() * 2.2, jitter: 0.05 + rng() * 0.09, phase: rng() * TAU,
        })),
      };
      this.__shadowPortalSeedCache.set(seedCacheKey, seeds);
      if (this.__shadowPortalSeedCache.size > 2) {
        const firstKey = this.__shadowPortalSeedCache.keys().next().value;
        if (firstKey !== seedCacheKey) this.__shadowPortalSeedCache.delete(firstKey);
      }
    }

    const initWidth = Math.max(1, Math.floor(window.innerWidth));
    const initHeight = Math.max(1, Math.floor(window.innerHeight));

    // Transfer canvas to offscreen
    const offscreen = canvas.transferControlToOffscreen();

    // Inline Worker code — the entire draw loop runs on a separate thread
    const workerCode = `
"use strict";
let canvas, ctx, stopped = false;
let width, height, maxSide, cx, cy, dpr;
let seeds, perfTier, detailStep, mistStep, shadowScale, duration;
const TAU = Math.PI * 2;

function resize(w, h, devicePixelRatio) {
  width = w; height = h; dpr = devicePixelRatio;
  maxSide = Math.max(width, height);
  cx = width / 2; cy = height / 2;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    canvas = msg.canvas;
    ctx = canvas.getContext("2d", { alpha: true });
    seeds = msg.seeds;
    perfTier = msg.perfTier;
    detailStep = perfTier === 0 ? 2 : 1;
    mistStep = perfTier === 0 ? 3 : perfTier === 1 ? 2 : 1;
    shadowScale = perfTier === 0 ? 0.62 : perfTier === 1 ? 0.78 : 1;
    duration = msg.duration;
    dpr = msg.dpr;
    resize(msg.width, msg.height, dpr);
    startDrawLoop();
  } else if (msg.type === "resize") {
    resize(msg.width, msg.height, dpr);
  } else if (msg.type === "stop") {
    stopped = true;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    self.close();
  }
};

function startDrawLoop() {
  const { wisps, darkBlots, portalRifts, coreFilaments, ringMistBands, purpleJets, outerLightning } = seeds;
  const qualityScale = perfTier === 0 ? 0.58 : perfTier === 1 ? 0.76 : 1;
  const start = performance.now();

  function draw() {
    if (stopped) return;
    const now = performance.now();
    const elapsed = now - start;
    const t = Math.max(0, Math.min(1, elapsed / Math.max(1, duration)));
    if (t >= 1) { stopped = true; return; }

    const easeInOut = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const fadeOut = t < 0.96 ? 1 : Math.max(0, 1 - (t - 0.96) / 0.04);
    const swirl = elapsed * 0.0022;
    const formT = Math.min(1, t / 0.22);
    const formEase = 1 - Math.pow(1 - formT, 3);
    const portalForm = 0.38 + 0.62 * formEase;
    const revealStart = 0.35;
    const revealProgress = t <= revealStart ? 0 : Math.min(1, (t - revealStart) / (1 - revealStart));
    const revealEase = revealProgress < 0.5 ? 2 * revealProgress * revealProgress : 1 - Math.pow(-2 * revealProgress + 2, 2) / 2;

    const portalRadius = maxSide * (0.68 + 1.28 * easeInOut);
    const innerRadius = portalRadius * (0.62 + 0.1 * Math.sin(swirl * 4.4));

    ctx.clearRect(0, 0, width, height);

    // Ambient dim
    const ambientDim = (0.18 + 0.35 * formEase) * fadeOut;
    ctx.fillStyle = "rgba(2, 2, 6, " + ambientDim.toFixed(4) + ")";
    ctx.fillRect(0, 0, width, height);

    // Veil
    const veilOuter = maxSide * (0.58 + 0.9 * formEase);
    const veilInner = Math.max(2, innerRadius * (0.1 + 0.18 * formEase));
    const veil = ctx.createRadialGradient(cx, cy, veilInner, cx, cy, veilOuter);
    veil.addColorStop(0, "rgba(6, 4, 10, " + (0.52 * portalForm * fadeOut).toFixed(4) + ")");
    veil.addColorStop(0.26, "rgba(4, 3, 8, " + (0.56 * portalForm * fadeOut).toFixed(4) + ")");
    veil.addColorStop(0.62, "rgba(2, 2, 4, " + (0.34 * portalForm * fadeOut).toFixed(4) + ")");
    veil.addColorStop(1, "rgba(0, 0, 0, " + (0.10 * formEase * fadeOut).toFixed(4) + ")");
    ctx.fillStyle = veil;
    ctx.beginPath(); ctx.arc(cx, cy, veilOuter, 0, TAU); ctx.fill();

    // Wisps
    for (let wi = 0; wi < wisps.length; wi += detailStep) {
      const wisp = wisps[wi];
      const ang = wisp.angle + swirl * wisp.speed + Math.sin(swirl * 0.8 + wisp.phase) * 0.2;
      const orbit = portalRadius * (0.34 + wisp.offset * 0.72) + Math.sin(swirl * 2.4 + wisp.phase) * portalRadius * 0.12;
      const x = cx + Math.cos(ang) * orbit + Math.sin(swirl + wisp.phase) * 20 * wisp.drift;
      const y = cy + Math.sin(ang) * orbit * 0.78 + Math.cos(swirl * 0.92 + wisp.phase) * 14 * wisp.drift;
      const r = wisp.size * (0.88 + easeInOut * 0.72);
      const alpha = (0.03 + 0.22 * (1 - wisp.offset * 0.68)) * fadeOut * portalForm;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(12, 10, 18, " + (alpha * 1.4).toFixed(4) + ")");
      g.addColorStop(0.56, "rgba(4, 3, 8, " + (alpha * 1.1).toFixed(4) + ")");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }

    // Dark blots
    for (let bi = 0; bi < darkBlots.length; bi += detailStep) {
      const blot = darkBlots[bi];
      const ang = blot.angle + swirl * blot.speed + Math.sin(swirl * 0.9 + blot.phase) * 0.32;
      const radius = innerRadius * (0.22 + blot.offset * 0.86);
      const x = cx + Math.cos(ang) * radius;
      const y = cy + Math.sin(ang) * radius * 0.82;
      const r = blot.size * (0.82 + easeInOut * 0.62);
      const alpha = (0.18 + 0.26 * (1 - blot.offset * 0.7)) * fadeOut * portalForm;
      const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
      bg.addColorStop(0, "rgba(0, 0, 0, " + Math.min(0.86, alpha).toFixed(4) + ")");
      bg.addColorStop(0.62, "rgba(0, 0, 0, " + (alpha * 0.58).toFixed(4) + ")");
      bg.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }

    // Purple ring energy
    const ringOuterClip = innerRadius * (1.18 + 0.05 * Math.sin(swirl * 1.6));
    const ringInnerClip = innerRadius * (0.66 + 0.04 * Math.sin(swirl * 2.1));
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ringOuterClip, 0, TAU);
    ctx.arc(cx, cy, ringInnerClip, 0, TAU, true);
    ctx.clip("evenodd");
    ctx.globalCompositeOperation = "screen";

    for (let ri = 0; ri < portalRifts.length; ri += detailStep) {
      const rift = portalRifts[ri];
      const base = rift.angle + swirl * rift.speed + Math.sin(swirl * 1.2 + rift.phase) * 0.22;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const p = i / 8;
        const rr = innerRadius * (1.06 - p * rift.length * 0.34 + 0.08 * Math.sin(swirl * 2.3 + rift.phase + p * 2.8));
        const ang = base + (p - 0.48) * rift.spread + Math.sin(swirl * 2 + rift.phase + p) * 0.08;
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr * 0.86;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const glow = (0.25 + 0.32 * Math.sin(swirl * 2.6 + rift.phase)) * fadeOut;
      ctx.strokeStyle = "rgba(100, 60, 160, " + Math.max(0.05, glow * 0.6).toFixed(4) + ")";
      ctx.lineWidth = rift.lineWidth + easeInOut * 1.8;
      ctx.shadowBlur = (8 + easeInOut * 14) * shadowScale;
      ctx.shadowColor = "rgba(80, 40, 140, 0.5)";
      ctx.stroke();
    }

    for (let fi = 0; fi < coreFilaments.length; fi += detailStep) {
      const filament = coreFilaments[fi];
      const base = filament.angle + swirl * filament.speed + Math.sin(swirl * 1.8 + filament.phase) * 0.26;
      ctx.beginPath();
      for (let i = 0; i <= 7; i++) {
        const p = i / 7;
        const rr = innerRadius * (1.1 - p * filament.length * 0.36 + 0.06 * Math.sin(swirl * 2.6 + filament.phase + p * 2.4));
        const ang = base + (p - 0.5) * filament.spread + Math.sin(swirl * 2.2 + filament.phase + p * 0.6) * 0.06;
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr * 0.88;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const glow = (0.2 + 0.24 * Math.sin(swirl * 2.8 + filament.phase)) * fadeOut;
      ctx.strokeStyle = "rgba(120, 80, 170, " + Math.max(0.05, glow * 0.55).toFixed(4) + ")";
      ctx.lineWidth = filament.lineWidth + easeInOut * 1.5;
      ctx.shadowBlur = (6 + easeInOut * 10) * shadowScale;
      ctx.shadowColor = "rgba(90, 50, 150, 0.45)";
      ctx.stroke();
    }
    ctx.restore();

    // Void gradient
    const voidGradient = ctx.createRadialGradient(cx, cy, innerRadius * 0.14, cx, cy, innerRadius * 2.18);
    voidGradient.addColorStop(0, "rgba(4, 2, 8, " + (0.88 * fadeOut).toFixed(4) + ")");
    voidGradient.addColorStop(0.34, "rgba(2, 1, 5, " + (0.96 * fadeOut).toFixed(4) + ")");
    voidGradient.addColorStop(0.72, "rgba(1, 1, 2, " + (0.92 * fadeOut).toFixed(4) + ")");
    voidGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = voidGradient;
    ctx.beginPath(); ctx.arc(cx, cy, innerRadius * 2.18, 0, TAU); ctx.fill();

    // Hard occlusion mask
    const solidPortalRadius = innerRadius * (1.02 + 0.03 * Math.sin(swirl * 3.1));
    const solidPortalAlpha = Math.min(1, 0.98 * fadeOut + 0.02);
    ctx.fillStyle = "rgba(0, 0, 0, " + solidPortalAlpha.toFixed(4) + ")";
    ctx.beginPath(); ctx.arc(cx, cy, solidPortalRadius, 0, TAU); ctx.fill();

    // Core gradient
    const coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerRadius);
    coreGradient.addColorStop(0, "rgba(0, 0, 0, " + (1 * fadeOut).toFixed(4) + ")");
    coreGradient.addColorStop(0.32, "rgba(0, 0, 0, " + (1 * fadeOut).toFixed(4) + ")");
    coreGradient.addColorStop(0.72, "rgba(0, 0, 0, " + (1 * fadeOut).toFixed(4) + ")");
    coreGradient.addColorStop(1, "rgba(0, 0, 0, " + (1 * fadeOut).toFixed(4) + ")");
    ctx.fillStyle = coreGradient;
    ctx.beginPath(); ctx.arc(cx, cy, innerRadius, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, " + (1 * fadeOut).toFixed(4) + ")";
    ctx.beginPath(); ctx.arc(cx, cy, innerRadius * 0.78, 0, TAU); ctx.fill();

    // Core vortex
    const coreVortexAlpha = (0.24 + 0.42 * (1 - revealProgress)) * fadeOut * portalForm;
    if (coreVortexAlpha > 0.004) {
      const coreVortexRadius = innerRadius * (1.0 + 0.52 * formEase);
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      const vortexGlow = ctx.createRadialGradient(cx, cy, Math.max(2, coreVortexRadius * 0.08), cx, cy, coreVortexRadius);
      vortexGlow.addColorStop(0, "rgba(40, 20, 70, " + (coreVortexAlpha * 0.8).toFixed(4) + ")");
      vortexGlow.addColorStop(0.28, "rgba(16, 10, 32, " + (coreVortexAlpha * 0.6).toFixed(4) + ")");
      vortexGlow.addColorStop(0.62, "rgba(6, 4, 14, " + (coreVortexAlpha * 0.4).toFixed(4) + ")");
      vortexGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = vortexGlow;
      ctx.beginPath(); ctx.arc(cx, cy, coreVortexRadius, 0, TAU); ctx.fill();

      // Worker fallback: 8 swirl strands (unified rotation + tapered width, no GSAP)
      var swirlCount = 8;
      var swirlPoints = perfTier === 0 ? 12 : 16;
      var strandSeeds = [0.73, 0.21, 0.58, 0.92, 0.37, 0.85, 0.14, 0.66];
      var strandDirs = [1, 1, -1, 1, 1, -1, 1, 1];
      var strandSpeeds = [1.24, 1.18, 0.88, 1.30, 1.22, 0.92, 1.26, 1.20];
      var strandTurns = [2.4, 2.2, 1.6, 2.5, 2.3, 1.8, 2.6, 2.1];
      for (var s = 0; s < swirlCount; s++) {
        var phase = swirl * strandSpeeds[s];
        var dir = strandDirs[s];
        var base = strandSeeds[s] * TAU + phase * dir;
        var wobbleFreq = 2.4 + s * 0.7;
        var wobbleAmp = 0.10 + 0.06 * Math.sin(phase * 0.6 + s);
        var pts = [];
        for (var i = 0; i <= swirlPoints; i++) {
          var p = i / swirlPoints;
          var rr = coreVortexRadius * (0.08 + 1.48 * p + 0.12 * Math.sin(phase * 1.9 + p * 6.4 + s * 1.3) + 0.06 * Math.sin(phase * 3.7 + p * 11.8 + s * 0.9));
          var twist = p * strandTurns[s] * dir;
          var distort = Math.sin(phase * wobbleFreq + p * 8.6 + s * 0.5) * wobbleAmp + Math.sin(phase * 4.1 + p * 13.2 + s * 1.1) * 0.04;
          var ang = base + twist + distort;
          pts.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr * 0.86 });
        }
        var strandAlpha = coreVortexAlpha * (0.58 + 0.42 * Math.sin(phase + s * 0.8));
        var tS = perfTier === 0 ? 0.9 : 1;
        var bW = 1.0 * tS;
        var mW = 16.0 * tS;
        ctx.lineCap = "round";
        for (var i = 0; i < pts.length - 1; i++) {
          var p = i / (pts.length - 1);
          var segA = strandAlpha * (0.3 + 0.7 * p);
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
          ctx.lineWidth = bW + (mW - bW) * p * p;
          ctx.strokeStyle = "rgba(90, 55, 150, " + Math.max(0.03, segA * 0.65).toFixed(4) + ")";
          ctx.shadowBlur = (4 + 16 * p) * shadowScale;
          ctx.shadowColor = "rgba(60, 30, 110, " + (segA * 0.55).toFixed(4) + ")";
          ctx.stroke();
        }
        ctx.lineCap = "butt";
      }

      // Worker fallback: 12 spiral tendrils (no GSAP — static sine spirals)
      var tendrilCount = 12;
      var tendrilPoints = 18;
      for (var ti = 0; ti < tendrilCount; ti++) {
        var tBaseAngle = (ti / tendrilCount) * TAU + swirl * 0.9;
        var spiralTightness = 1.8 + ti * 0.12;
        var spiralDir = (ti === 3 || ti === 7 || ti === 10) ? -1 : 1;
        ctx.beginPath();
        for (var i = 0; i <= tendrilPoints; i++) {
          var p = i / tendrilPoints;
          var rBase = coreVortexRadius * (0.04 + p * 0.42);
          var rWobble = coreVortexRadius * 0.06 * Math.sin(swirl * 2.8 + ti * 1.3 + p * 5.2);
          var rr = rBase + rWobble;
          var spiralAngle = tBaseAngle + p * spiralTightness * spiralDir + Math.sin(swirl * 2.5 + ti + p * 3) * 0.15 + Math.sin(swirl * 4.3 + ti * 0.7 + p * 7.8) * 0.05;
          var x = cx + Math.cos(spiralAngle) * rr;
          var y = cy + Math.sin(spiralAngle) * rr * 0.88;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        var tAlpha = coreVortexAlpha * 0.55 * (0.5 + 0.5 * Math.sin(swirl * 2 + ti * 0.52));
        ctx.strokeStyle = "rgba(100, 60, 165, " + Math.max(0.04, tAlpha * 0.7).toFixed(4) + ")";
        ctx.lineWidth = 1.0 + 0.5 * Math.sin(swirl * 3 + ti * 0.9);
        ctx.shadowBlur = 6 * shadowScale;
        ctx.shadowColor = "rgba(80, 40, 140, " + (tAlpha * 0.5).toFixed(4) + ")";
        ctx.stroke();
      }

      // Void eye — concentric broken rings with tapered ends (Worker fallback, no GSAP)
      var eyeR2 = coreVortexRadius * 0.40;
      var eyePulse2 = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(swirl * 1.2));
      var ringCount2 = 6;
      var arcSegs2 = 20;

      for (var ri2 = 0; ri2 < ringCount2; ri2++) {
        var depth2 = ri2 / (ringCount2 - 1);
        var radius2 = Math.max(2, eyeR2 * (0.95 - 0.82 * depth2) * (1 + 0.06 * Math.sin(swirl * 2.1 + ri2 * 1.4) * eyePulse2));
        var ringSpeed2 = 0.6 + depth2 * 1.4;
        var ringAngle2 = swirl * ringSpeed2 + ri2 * 1.1;
        var peakW2 = (6.0 + 12.0 * (1 - depth2)) * tS;
        var pr2 = Math.round(110 - 50 * depth2);
        var pg2 = Math.round(60 - 30 * depth2);
        var pb2 = Math.round(200 - 60 * depth2);
        var ringAlpha2 = coreVortexAlpha * (0.7 + 0.3 * (1 - depth2)) * eyePulse2;

        var arcCount2 = 2 + Math.floor(depth2 * 1.5);
        var gapFraction2 = 0.08 + 0.06 * depth2;
        var arcSpan2 = (TAU / arcCount2) * (1 - gapFraction2);

        for (var ai2 = 0; ai2 < arcCount2; ai2++) {
          var arcStart2 = ringAngle2 + (ai2 / arcCount2) * TAU;
          var wobble2 = 0.08 * Math.sin(swirl * 3.2 + ri2 * 2.1 + ai2 * 1.7) * eyePulse2;
          var a0_2 = arcStart2 + wobble2;

          ctx.lineCap = "round";
          for (var si2 = 0; si2 < arcSegs2; si2++) {
            var t0_2 = si2 / arcSegs2;
            var t1_2 = (si2 + 1) / arcSegs2;
            var ang0_2 = a0_2 + t0_2 * arcSpan2;
            var ang1_2 = a0_2 + t1_2 * arcSpan2;
            var mid2 = (t0_2 + t1_2) * 0.5;
            var taper2 = 1 - 4 * (mid2 - 0.5) * (mid2 - 0.5);
            var segW2 = Math.max(1, peakW2 * (0.12 + 0.88 * taper2));
            var segAlpha2 = ringAlpha2 * (0.3 + 0.7 * taper2);

            ctx.beginPath();
            ctx.arc(cx, cy, radius2, ang0_2, ang1_2);
            ctx.strokeStyle = "rgba(" + pr2 + ", " + pg2 + ", " + pb2 + ", " + Math.max(0.04, segAlpha2 * 0.85).toFixed(4) + ")";
            ctx.lineWidth = segW2;
            ctx.shadowBlur = (6 + 10 * (1 - depth2)) * taper2 * shadowScale;
            ctx.shadowColor = "rgba(" + pr2 + ", " + pg2 + ", " + pb2 + ", " + (segAlpha2 * 0.4).toFixed(4) + ")";
            ctx.stroke();
          }
        }
      }
      ctx.lineCap = "butt";

      // Center blob — single wobbly purple shape (Worker fallback)
      var blobR2 = eyeR2 * 0.12;
      var blobPulse2 = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(swirl * 1.2));
      var blobPts2 = 24;
      ctx.beginPath();
      for (var bi2 = 0; bi2 <= blobPts2; bi2++) {
        var bp2 = bi2 / blobPts2;
        var bAng2 = bp2 * TAU + swirl * 0.8;
        var bw2 = blobR2 * (
          1.0
          + 0.2 * Math.sin(swirl * 2.4 + bp2 * 5.5 + 0.3) * blobPulse2
          + 0.12 * Math.sin(swirl * 4.1 + bp2 * 10.0 + 1.2)
        );
        var bbx2 = cx + Math.cos(bAng2) * bw2;
        var bby2 = cy + Math.sin(bAng2) * bw2 * 0.9;
        if (bi2 === 0) ctx.moveTo(bbx2, bby2);
        else ctx.lineTo(bbx2, bby2);
      }
      ctx.closePath();
      var blobAlpha2 = coreVortexAlpha * 0.85 * blobPulse2;
      ctx.fillStyle = "rgba(105, 60, 180, " + blobAlpha2.toFixed(4) + ")";
      ctx.shadowBlur = 14 * shadowScale;
      ctx.shadowColor = "rgba(120, 70, 200, " + (blobAlpha2 * 0.6).toFixed(4) + ")";
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    }

    // Chaotic lightning — disabled
    const lightningRamp = Math.max(0, Math.min(1, t / 0.28));
    if (false && lightningRamp > 0.01) {
      const boltStep = perfTier === 0 ? Math.max(2, detailStep) : detailStep;
      const creationBoost = Math.max(0, Math.min(1, 1 - t / Math.max(0.01, revealStart + 0.08)));
      const activeBoltStep = creationBoost > 0.24 ? Math.max(1, boltStep - 1) : boltStep;
      const mainSteps = perfTier === 0 ? 4 : 6;
      const branchSteps = perfTier === 0 ? 3 : 4;
      const lightningRadius = innerRadius * (0.86 + 0.14 * formEase + Math.sin(swirl * 1.9) * 0.05);
      const lightningFade = Math.max(0, 1 - revealProgress * 0.28);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      for (let li = 0; li < outerLightning.length; li += activeBoltStep) {
        const bolt = outerLightning[li];
        const drift = swirl * bolt.speed + bolt.phase;
        const flicker = 0.5 + 0.5 * Math.sin(drift * 4.4 + t * 12.4) + 0.35 * Math.sin(drift * 7.2 + bolt.phase * 1.3);
        const flickerGate = -0.18 - creationBoost * 0.16;
        if (flicker < flickerGate) continue;
        const alpha = (0.22 + 0.34 * (flicker * 0.5 + 0.5)) * (1 + creationBoost * 0.55) * lightningRamp * lightningFade * fadeOut;
        if (alpha <= 0.004) continue;
        const baseA = bolt.angle + drift * 0.24 + Math.sin(drift * 2.1) * 0.08;
        const startR = lightningRadius * (0.96 + 0.08 * Math.sin(drift * 1.8));
        const reach = innerRadius * (0.38 + bolt.reach * (0.82 + 0.52 * lightningRamp));
        const span = 0.10 + 0.05 * Math.sin(drift * 2.6 + bolt.phase);

        ctx.beginPath();
        for (let i = 0; i <= mainSteps; i++) {
          const p = i / mainSteps;
          const rr = startR + reach * p;
          const jag = Math.sin(drift * 3.2 + p * 12.6) * 0.5 + 0.3 * Math.sin(drift * 5.6 + p * 8.1 + bolt.phase);
          const ang = baseA + (p - 0.24) * span + jag * bolt.jitter * (1 + p * 0.7);
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.88;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(148, 88, 240, " + (alpha * 0.92).toFixed(4) + ")";
        ctx.lineWidth = bolt.width + 2.4;
        ctx.shadowBlur = (22 + (1 - revealProgress) * 22) * shadowScale;
        ctx.shadowColor = "rgba(132, 72, 228, " + (alpha * 1.0).toFixed(4) + ")";
        ctx.stroke();
        ctx.strokeStyle = "rgba(232, 192, 255, " + Math.min(0.68, alpha + 0.12).toFixed(4) + ")";
        ctx.lineWidth = Math.max(1.4, bolt.width * 0.82);
        ctx.shadowBlur = (12 + (1 - revealProgress) * 14) * shadowScale;
        ctx.shadowColor = "rgba(198, 152, 255, " + (alpha * 0.95).toFixed(4) + ")";
        ctx.stroke();

        if (flicker > (0.08 - creationBoost * 0.32)) {
          const dir = Math.sin(drift * 2.2 + bolt.phase) > 0 ? 1 : -1;
          const branchStartP = 0.34 + 0.22 * (0.5 + 0.5 * Math.sin(drift * 1.5 + bolt.phase));
          const fromR = startR + reach * branchStartP;
          const fromA = baseA + dir * 0.04;
          const branchReach = reach * (0.48 + 0.32 * (0.5 + 0.5 * Math.sin(drift * 2.4)));
          const branchSpan = dir * (0.16 + 0.08 * Math.sin(drift * 3 + bolt.phase));
          ctx.beginPath();
          for (let b = 0; b <= branchSteps; b++) {
            const p = b / branchSteps;
            const rr = fromR + branchReach * p;
            const jag = Math.sin(drift * 4.1 + p * 9.2) * 0.5 + 0.24 * Math.sin(drift * 6.3 + p * 6.1 + bolt.phase);
            const ang = fromA + p * branchSpan + jag * bolt.jitter * 0.7;
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr * 0.88;
            if (b === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          const branchAlpha = alpha * 0.72;
          ctx.strokeStyle = "rgba(156, 108, 240, " + branchAlpha.toFixed(4) + ")";
          ctx.lineWidth = Math.max(1.0, bolt.width * 0.76);
          ctx.shadowBlur = (12 + (1 - revealProgress) * 12) * shadowScale;
          ctx.shadowColor = "rgba(138, 88, 228, " + (branchAlpha * 0.9).toFixed(4) + ")";
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Reveal aperture
    if (revealProgress > 0) {
      const apertureRadius = innerRadius * (0.24 + 2.36 * revealEase) * (1 + Math.sin(swirl * 9.8) * 0.11 * (1 - revealProgress * 0.62));
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath(); ctx.arc(cx, cy, apertureRadius, 0, TAU); ctx.fill(); ctx.restore();

      const ringRadius = apertureRadius * (1 + Math.sin(swirl * 10.8) * 0.026);
      const rimWidth = innerRadius * (0.48 + (1 - revealProgress) * 0.28);
      const ringInner = Math.max(2, ringRadius - rimWidth * 0.42);
      const ringOuter = ringRadius + rimWidth * 1.3;

      ctx.save(); ctx.globalCompositeOperation = "source-over";
      const ringBody = ctx.createRadialGradient(cx, cy, ringInner, cx, cy, ringOuter);
      ringBody.addColorStop(0, "rgba(0, 0, 0, " + (1.0 * fadeOut).toFixed(4) + ")");
      ringBody.addColorStop(0.42, "rgba(0, 0, 0, " + (1.0 * fadeOut).toFixed(4) + ")");
      ringBody.addColorStop(0.68, "rgba(4, 2, 8, " + (0.92 * fadeOut).toFixed(4) + ")");
      ringBody.addColorStop(0.88, "rgba(8, 6, 14, " + (0.64 * fadeOut).toFixed(4) + ")");
      ringBody.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = ringBody;
      ctx.beginPath(); ctx.arc(cx, cy, ringOuter, 0, TAU);
      ctx.arc(cx, cy, ringInner, 0, TAU, true); ctx.fill("evenodd");

      const blackRimAlpha = Math.max(0, (1.0 - revealProgress * 0.18) * fadeOut);
      if (blackRimAlpha > 0.006) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0, 0, 0, " + blackRimAlpha.toFixed(4) + ")";
        ctx.lineWidth = 14 + (1 - revealProgress) * 20;
        ctx.shadowBlur = (14 + (1 - revealProgress) * 22) * shadowScale;
        ctx.shadowColor = "rgba(0, 0, 0, " + (blackRimAlpha * 0.78).toFixed(4) + ")";
        ctx.arc(cx, cy, ringRadius, 0, TAU); ctx.stroke();
      }

      const edgeAlpha = Math.max(0, (0.34 - revealProgress * 0.12) * fadeOut);
      if (edgeAlpha > 0.004) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(124, 120, 136, " + edgeAlpha.toFixed(4) + ")";
        ctx.lineWidth = 1.2 + (1 - revealProgress) * 1.4;
        ctx.shadowBlur = (8 + (1 - revealProgress) * 8) * shadowScale;
        ctx.shadowColor = "rgba(48, 44, 60, " + (edgeAlpha * 0.84).toFixed(4) + ")";
        ctx.arc(cx, cy, ringRadius + rimWidth * 0.34, 0, TAU); ctx.stroke();
      }

      // Ring mist bands
      for (let mi = 0; mi < ringMistBands.length; mi += mistStep) {
        const band = ringMistBands[mi];
        const drift = swirl * band.speed + band.phase;
        const radius = ringRadius + innerRadius * (0.03 + (band.band - 0.9) * 0.24) + Math.sin(drift * 1.2) * innerRadius * 0.03;
        const arcLength = band.width + Math.sin(drift * 1.8) * 0.04;
        const start = band.angle + drift * 0.32;
        const alpha = (0.07 + 0.12 * (1 - revealProgress)) * (0.7 + Math.sin(drift * 2.4) * 0.3) * fadeOut;
        if (alpha <= 0.004) continue;
        ctx.beginPath();
        ctx.strokeStyle = "rgba(66, 66, 76, " + Math.max(0.01, alpha).toFixed(4) + ")";
        ctx.lineWidth = band.lineWidth + (1 - revealProgress) * 1.8;
        ctx.shadowBlur = (10 + (1 - revealProgress) * 16) * shadowScale;
        ctx.shadowColor = "rgba(18, 18, 24, " + (alpha * 0.9).toFixed(4) + ")";
        ctx.arc(cx, cy, radius, start, start + arcLength); ctx.stroke();
      }

      // Expanding shockwave ripples — start beyond ring outer edge
      for (let i = 0; i < 5; i++) {
        const wave = revealProgress * 1.45 - i * 0.18;
        if (wave <= 0 || wave >= 1.52) continue;
        const waveRadius = ringOuter + innerRadius * wave * 0.92;
        const waveAlpha = (0.38 * (1 - Math.min(1, wave)) * (1 - i * 0.12)) * fadeOut;
        if (waveAlpha <= 0.003) continue;
        ctx.beginPath();
        ctx.strokeStyle = "rgba(72, 58, 96, " + waveAlpha.toFixed(4) + ")";
        ctx.lineWidth = Math.max(1.5, 6.4 - wave * 2.8);
        ctx.shadowBlur = (16 + (1 - wave) * 24) * shadowScale;
        ctx.shadowColor = "rgba(48, 32, 78, " + (waveAlpha * 0.88).toFixed(4) + ")";
        ctx.arc(cx, cy, waveRadius, 0, TAU); ctx.stroke();
      }

      // Purple energy jets — centered on ring body
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < purpleJets.length; i += detailStep) {
        const jet = purpleJets[i];
        const drift = swirl * jet.speed + jet.phase;
        const radius = ringRadius + innerRadius * (0.01 + Math.sin(drift * 1.7) * 0.04);
        const start = jet.angle + drift * 0.24;
        const span = 0.12 + jet.spread * 0.18 + Math.sin(drift * 2.1) * 0.03;
        const alpha = (0.24 + 0.34 * (1 - revealProgress)) * (0.7 + Math.sin(drift * 3.1) * 0.3) * fadeOut;
        if (alpha <= 0.004) continue;
        ctx.beginPath();
        ctx.strokeStyle = "rgba(80, 50, 130, " + Math.max(0.04, alpha * 0.5).toFixed(4) + ")";
        ctx.lineWidth = jet.lineWidth + 1.6 + (1 - revealProgress) * 2.4;
        ctx.shadowBlur = (12 + (1 - revealProgress) * 14) * shadowScale;
        ctx.shadowColor = "rgba(50, 28, 90, " + (alpha * 0.45).toFixed(4) + ")";
        ctx.arc(cx, cy, radius, start, start + span); ctx.stroke();
      }

      // Reveal lightning — boosted alpha & reach for thick ring
      const revealLightningRamp = Math.max(0, Math.min(1, (revealProgress - 0.08) / 0.92));
      if (revealLightningRamp > 0.01) {
        const revealBoltStep = Math.max(perfTier === 0 ? 3 : 2, detailStep + 1);
        const revealMainSteps = perfTier === 0 ? 4 : 5;
        const revealBranchSteps = perfTier === 0 ? 3 : 4;
        const revealLightningRadius = ringOuter + rimWidth * 0.12;
        for (let li = 0; li < outerLightning.length; li += revealBoltStep) {
          const bolt = outerLightning[li];
          const drift = swirl * (bolt.speed * 1.06) + bolt.phase;
          const flicker = 0.5 + 0.5 * Math.sin(drift * 4.2 + revealProgress * 16) + 0.3 * Math.sin(drift * 6.6 + bolt.phase * 1.2);
          if (flicker < -0.04) continue;
          const alpha = (0.10 + 0.18 * (flicker * 0.5 + 0.5)) * revealLightningRamp * fadeOut;
          if (alpha <= 0.003) continue;
          const baseA = bolt.angle + drift * 0.2 + Math.sin(drift * 1.8) * 0.06;
          const startR = revealLightningRadius * (0.98 + 0.05 * Math.sin(drift * 1.7));
          const reach = innerRadius * (0.18 + bolt.reach * 0.42);
          const span = 0.2 + 0.08 * Math.sin(drift * 2.4 + bolt.phase);
          ctx.beginPath();
          for (let i = 0; i <= revealMainSteps; i++) {
            const p = i / revealMainSteps;
            const rr = startR + reach * p;
            const jag = Math.sin(drift * 3 + p * 12.2) + 0.58 * Math.sin(drift * 5.1 + p * 7.6 + bolt.phase);
            const ang = baseA + (p - 0.24) * span + jag * bolt.jitter * (1 + p * 1.12);
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr * 0.88;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = "rgba(108, 64, 198, " + (alpha * 0.72).toFixed(4) + ")";
          ctx.lineWidth = Math.max(0.78, bolt.width * 0.88);
          ctx.shadowBlur = (10 + (1 - revealProgress) * 8) * shadowScale;
          ctx.shadowColor = "rgba(100, 58, 188, " + (alpha * 0.88).toFixed(4) + ")";
          ctx.stroke();
          ctx.strokeStyle = "rgba(208, 164, 255, " + Math.min(0.32, alpha + 0.03).toFixed(4) + ")";
          ctx.lineWidth = Math.max(0.7, bolt.width * 0.48);
          ctx.shadowBlur = (5 + (1 - revealProgress) * 6) * shadowScale;
          ctx.shadowColor = "rgba(170, 126, 246, " + (alpha * 0.74).toFixed(4) + ")";
          ctx.stroke();
          if (flicker > 0.26) {
            const dir = Math.sin(drift * 2 + bolt.phase) > 0 ? 1 : -1;
            const branchStartP = 0.36 + 0.2 * (0.5 + 0.5 * Math.sin(drift * 1.4 + bolt.phase));
            const fromR = startR + reach * branchStartP;
            const fromA = baseA + dir * 0.035;
            const branchReach = reach * (0.32 + 0.18 * (0.5 + 0.5 * Math.sin(drift * 2.1)));
            const branchSpan = dir * (0.18 + 0.08 * Math.sin(drift * 2.8 + bolt.phase));
            ctx.beginPath();
            for (let b = 0; b <= revealBranchSteps; b++) {
              const p = b / revealBranchSteps;
              const rr = fromR + branchReach * p;
              const jag = Math.sin(drift * 3.8 + p * 8.6) + 0.45 * Math.sin(drift * 6 + p * 5.4 + bolt.phase);
              const ang = fromA + p * branchSpan + jag * bolt.jitter * 1.16;
              const x = cx + Math.cos(ang) * rr;
              const y = cy + Math.sin(ang) * rr * 0.88;
              if (b === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            const branchAlpha = alpha * 0.5;
            ctx.strokeStyle = "rgba(120, 76, 210, " + branchAlpha.toFixed(4) + ")";
            ctx.lineWidth = Math.max(0.65, bolt.width * 0.52);
            ctx.shadowBlur = (7 + (1 - revealProgress) * 6) * shadowScale;
            ctx.shadowColor = "rgba(108, 70, 198, " + (branchAlpha * 0.82).toFixed(4) + ")";
            ctx.stroke();
          }
        }
      }

      // Mist halo — solid atmospheric fog centered on ring
      const mistHalo = ctx.createRadialGradient(cx, cy, Math.max(2, ringRadius * 0.72), cx, cy, ringOuter + innerRadius * (0.78 + (1 - revealProgress) * 0.34));
      mistHalo.addColorStop(0, "rgba(0, 0, 0, 0)");
      mistHalo.addColorStop(0.18, "rgba(42, 28, 68, " + (0.48 * fadeOut).toFixed(4) + ")");
      mistHalo.addColorStop(0.38, "rgba(64, 42, 108, " + (0.58 * fadeOut).toFixed(4) + ")");
      mistHalo.addColorStop(0.56, "rgba(86, 52, 148, " + (0.44 * fadeOut).toFixed(4) + ")");
      mistHalo.addColorStop(0.74, "rgba(58, 34, 102, " + (0.32 * fadeOut).toFixed(4) + ")");
      mistHalo.addColorStop(0.90, "rgba(32, 18, 62, " + (0.16 * fadeOut).toFixed(4) + ")");
      mistHalo.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = mistHalo;
      ctx.beginPath(); ctx.arc(cx, cy, ringOuter + innerRadius * 1.0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    setTimeout(draw, 8);
  }

  draw();
}
`;

    const blob = new Blob([workerCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);

    console.log("%c[PortalDiag]%c OffscreenCanvas Worker created — animation on separate thread", "color:#a855f7;font-weight:bold", "color:#22c55e");

    // Set canvas CSS size before transfer (Worker can't access DOM style)
    canvas.style.width = `${initWidth}px`;
    canvas.style.height = `${initHeight}px`;

    worker.postMessage({
      type: "init",
      canvas: offscreen,
      duration,
      seeds,
      perfTier,
      dpr,
      width: initWidth,
      height: initHeight,
    }, [offscreen]);

    // Forward resize events to Worker (debounced)
    let resizeTimer = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const w = Math.max(1, Math.floor(window.innerWidth));
        const h = Math.max(1, Math.floor(window.innerHeight));
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        worker.postMessage({ type: "resize", width: w, height: h });
      }, 150);
    };
    window.addEventListener("resize", onResize);

    // Return stop function
    return () => {
      window.removeEventListener("resize", onResize);
      try { worker.postMessage({ type: "stop" }); } catch (_) {}
      setTimeout(() => { try { worker.terminate(); } catch (_) {} }, 50);
    };
  },
};

function applyPortalCoreToClass(PluginClass, config = {}) {
  if (!PluginClass || typeof PluginClass !== "function" || !PluginClass.prototype) return false;
  const className = PluginClass.name || "AnonymousPluginClass";

  const mergedConfig = {
    contextLabelKeys: DEFAULT_CONTEXT_LABEL_KEYS,
    ...config,
  };
  if (!Array.isArray(mergedConfig.contextLabelKeys) || mergedConfig.contextLabelKeys.length === 0) {
    mergedConfig.contextLabelKeys = DEFAULT_CONTEXT_LABEL_KEYS;
  }
  if (typeof mergedConfig.transitionId !== "string" || !mergedConfig.transitionId.trim()) {
    console.warn(`[ShadowPortalCore] ${className} missing transitionId; using default overlay id.`);
  }
  if (typeof mergedConfig.navigationFailureToast !== "string" || !mergedConfig.navigationFailureToast.trim()) {
    console.warn(`[ShadowPortalCore] ${className} missing navigationFailureToast; using fallback toast text.`);
  }

  Object.defineProperty(PluginClass.prototype, "__shadowPortalCoreConfig", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: mergedConfig,
  });

  for (const [name, fn] of Object.entries(methods)) {
    if (typeof fn !== "function") continue;
    Object.defineProperty(PluginClass.prototype, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: fn,
    });
  }

  // Fire-and-forget GSAP preload so it's ready by first portal animation.
  // Safe no-op if CDN is blocked — vanilla canvas path will be used instead.
  if (!_gsapLoadPromise && !_gsapLoaded) {
    methods._ensureGSAP.call({}).catch(() => {});
  }

  return true;
}

module.exports = {
  applyPortalCoreToClass,
  methods,
};

if (typeof window !== "undefined") {
  window.ShadowPortalCore = module.exports;
}
