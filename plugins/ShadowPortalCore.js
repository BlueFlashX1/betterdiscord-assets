/**
 * @name ShadowPortalCore
 * @description Shared navigation + transition core for ShadowStep, ShadowExchange, and ShadowSenses.
 * @version 1.0.0
 * @author matthewthompson
 */

/* global BdApi */

"use strict";

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

  _cancelPendingTransition() {
    if (this._transitionNavTimeout) {
      clearTimeout(this._transitionNavTimeout);
      this._transitionNavTimeout = null;
    }
    if (this._transitionCleanupTimeout) {
      clearTimeout(this._transitionCleanupTimeout);
      this._transitionCleanupTimeout = null;
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

  playTransition(callback) {
    if (!this.settings?.animationEnabled) {
      callback();
      return;
    }

    this._cancelPendingTransition();
    this._transitionRunId = Number(this._transitionRunId || 0) + 1;
    const runId = this._transitionRunId;

    const configuredDuration = this.settings.animationDuration || 550;
    const duration = Math.max(420, configuredDuration + 220);
    const totalDuration = duration + 320;
    const transitionStartedAt = performance.now();
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
      `start style=blackMistPortalCanvasV5 duration=${duration} total=${totalDuration} reducedMotion=${prefersReducedMotion} systemReducedMotion=${systemPrefersReducedMotion} respectReducedMotion=${respectReducedMotion} cinders=${shardCount}`
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

    this._transitionStopCanvas = null;
    if (!prefersReducedMotion) {
      const startCanvas = () => {
        if (runId !== this._transitionRunId) return;
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

      for (const shard of shards) {
        const delay = parseFloat(shard.style.getPropertyValue("--ss-delay")) || 0;
        const tx = shard.style.getPropertyValue("--ss-shard-x") || "0px";
        const ty = shard.style.getPropertyValue("--ss-shard-y") || "-80px";
        const rot = shard.style.getPropertyValue("--ss-shard-r") || "0deg";
        shard.animate(
          [
            { transform: "translate3d(0, 0, 0) rotate(0deg) scale(0.3)", opacity: 0 },
            { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)", opacity: 0.72, offset: 0.22 },
            { transform: `translate3d(${tx}, ${ty}, 0) rotate(${rot}) scale(0.2)`, opacity: 0 },
          ],
          { duration: 900, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards", delay }
        );
      }
      debugLog(this, "Transition", "Using WAAPI + canvas portal transition");
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
      debugLog(this, "Transition", `Navigation callback fired at ${Math.round(performance.now() - transitionStartedAt)}ms`);
      callback();
    };

    const navDelay = prefersReducedMotion
      ? 24
      : Math.max(42, Math.min(78, Math.round(totalDuration * 0.06)));

    this._transitionNavTimeout = setTimeout(() => {
      if (runId !== this._transitionRunId) return;
      this._transitionNavTimeout = null;
      runNavigation();
    }, navDelay);

    const cleanupDelay = prefersReducedMotion ? Math.max(320, Math.round(duration * 0.98)) : totalDuration + 340;
    this._transitionCleanupTimeout = setTimeout(() => {
      if (runId !== this._transitionRunId) return;
      this._transitionCleanupTimeout = null;
      this._cancelPendingTransition();
    }, cleanupDelay);
  },

  startPortalCanvasAnimation(canvas, duration) {
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
        outerLightning: Array.from({ length: Math.max(12, Math.round(22 * qualityScale)) }, () => ({
          angle: Math.random() * TAU,
          speed: 0.32 + Math.random() * 0.88,
          reach: 0.24 + Math.random() * 0.42,
          width: 0.9 + Math.random() * 1.55,
          jitter: 0.028 + Math.random() * 0.052,
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
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const start = performance.now();
    const draw = (now) => {
      if (stopped) return;

      const elapsed = now - start;
      const t = Math.max(0, Math.min(1, elapsed / Math.max(1, duration)));
      const easeInOut = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const fadeOut = t < 0.78 ? 1 : Math.max(0, 1 - (t - 0.78) / 0.22);
      const swirl = elapsed * 0.00125;
      const formT = Math.min(1, t / 0.34);
      const formEase = 1 - Math.pow(1 - formT, 3);
      const portalForm = 0.24 + 0.76 * formEase;
      const revealStart = 0.2;
      const revealProgress = t <= revealStart ? 0 : Math.min(1, (t - revealStart) / (1 - revealStart));
      const revealEase = revealProgress < 0.5
        ? 2 * revealProgress * revealProgress
        : 1 - Math.pow(-2 * revealProgress + 2, 2) / 2;

      const portalRadius = maxSide * (0.68 + 1.28 * easeInOut);
      const innerRadius = portalRadius * (0.62 + 0.1 * Math.sin(swirl * 4.4));

      ctx.clearRect(0, 0, width, height);

      const ambientDim = (0.026 + 0.048 * formEase) * fadeOut;
      ctx.fillStyle = `rgba(2, 2, 6, ${ambientDim.toFixed(4)})`;
      ctx.fillRect(0, 0, width, height);

      const veilOuter = maxSide * (0.58 + 0.9 * formEase);
      const veilInner = Math.max(2, innerRadius * (0.1 + 0.18 * formEase));
      const veil = ctx.createRadialGradient(cx, cy, veilInner, cx, cy, veilOuter);
      veil.addColorStop(0, `rgba(22, 12, 36, ${(0.2 * portalForm * fadeOut).toFixed(4)})`);
      veil.addColorStop(0.26, `rgba(12, 8, 22, ${(0.28 * portalForm * fadeOut).toFixed(4)})`);
      veil.addColorStop(0.62, `rgba(6, 6, 12, ${(0.14 * portalForm * fadeOut).toFixed(4)})`);
      veil.addColorStop(1, "rgba(0, 0, 0, 0)");
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
        g.addColorStop(0, `rgba(46, 42, 56, ${(alpha * 1.18).toFixed(4)})`);
        g.addColorStop(0.56, `rgba(14, 12, 20, ${alpha.toFixed(4)})`);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }

      for (let bi = 0; bi < darkBlots.length; bi += detailStep) {
        const blot = darkBlots[bi];
        const ang = blot.angle - swirl * blot.speed + Math.sin(swirl * 0.9 + blot.phase) * 0.32;
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
        ctx.strokeStyle = `rgba(188, 130, 255, ${Math.max(0.07, glow).toFixed(4)})`;
        ctx.lineWidth = rift.lineWidth + easeInOut * 1.8;
        ctx.shadowBlur = (10 + easeInOut * 20) * shadowScale;
        ctx.shadowColor = "rgba(146, 78, 248, 0.78)";
        ctx.stroke();
      }

      for (let fi = 0; fi < coreFilaments.length; fi += detailStep) {
        const filament = coreFilaments[fi];
        const base = filament.angle - swirl * filament.speed + Math.sin(swirl * 1.8 + filament.phase) * 0.26;
        ctx.beginPath();
        for (let i = 0; i <= 7; i++) {
          const p = i / 7;
          const rr = innerRadius * (
            0.74 +
            p * filament.length * 0.44 +
            0.06 * Math.sin(swirl * 2.9 + filament.phase + p * 2.2)
          );
          const ang = base - p * filament.spread * 0.6 + Math.sin(swirl * 2.1 + filament.phase + p) * 0.06;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.88;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const glow = (0.22 + 0.3 * Math.sin(swirl * 3.2 + filament.phase)) * fadeOut;
        ctx.strokeStyle = `rgba(238, 186, 255, ${Math.max(0.07, glow).toFixed(4)})`;
        ctx.lineWidth = filament.lineWidth + easeInOut * 1.1;
        ctx.shadowBlur = (8 + easeInOut * 15) * shadowScale;
        ctx.shadowColor = "rgba(214, 136, 255, 0.76)";
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
        ctx.strokeStyle = `rgba(206, 142, 255, ${Math.max(0.06, glow).toFixed(4)})`;
        ctx.lineWidth = jet.lineWidth + easeInOut * 1.4;
        ctx.shadowBlur = (8 + easeInOut * 14) * shadowScale;
        ctx.shadowColor = "rgba(166, 94, 255, 0.76)";
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

      const coreGradient = ctx.createRadialGradient(cx, cy, innerRadius * 0.08, cx, cy, innerRadius);
      coreGradient.addColorStop(0, `rgba(1, 1, 2, ${(0.98 * fadeOut).toFixed(4)})`);
      coreGradient.addColorStop(0.32, `rgba(0, 0, 1, ${(1 * fadeOut).toFixed(4)})`);
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
      const coreVortexAlpha = (0.14 + 0.3 * (1 - revealProgress)) * fadeOut * portalForm;
      if (coreVortexAlpha > 0.004) {
        const coreVortexRadius = innerRadius * (0.78 + 0.22 * formEase);
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
        vortexGlow.addColorStop(0, `rgba(170, 118, 255, ${(coreVortexAlpha * 0.84).toFixed(4)})`);
        vortexGlow.addColorStop(0.24, `rgba(120, 80, 214, ${(coreVortexAlpha * 0.48).toFixed(4)})`);
        vortexGlow.addColorStop(0.66, `rgba(60, 42, 116, ${(coreVortexAlpha * 0.22).toFixed(4)})`);
        vortexGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = vortexGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, coreVortexRadius, 0, TAU);
        ctx.fill();

        const swirlCount = perfTier === 0 ? 5 : perfTier === 1 ? 7 : 9;
        const swirlPoints = perfTier === 0 ? 11 : 13;
        const turnBase = 2.1 + formEase * 0.9;
        for (let s = 0; s < swirlCount; s++) {
          const phase = swirl * (1.45 + s * 0.19);
          const direction = s % 2 === 0 ? 1 : -1;
          const base = (s / swirlCount) * TAU + phase * direction;
          const laneNoise = Math.sin(phase * 1.7 + s * 0.8) * 0.22;

          ctx.beginPath();
          for (let i = 0; i <= swirlPoints; i++) {
            const p = i / swirlPoints;
            const rr = coreVortexRadius * (
              0.1 +
              0.86 * p +
              0.08 * Math.sin(phase * 2.8 + p * 10.2 + s * 0.6)
            );
            const twist = p * (turnBase + 0.22 * s) * direction;
            const cork = Math.sin(phase * 3.2 + p * 7.4 + s * 0.4) * 0.17;
            const ang = base + twist + cork + laneNoise * (1 - p * 0.45);
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr * 0.88;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          const strandAlpha = coreVortexAlpha * (0.5 + 0.44 * Math.sin(phase + s * 0.6));
          ctx.strokeStyle = `rgba(210, 154, 255, ${Math.max(0.04, strandAlpha).toFixed(4)})`;
          ctx.lineWidth = (1.25 + s * 0.18) * (perfTier === 0 ? 0.9 : 1);
          ctx.shadowBlur = (10 + s * 1.35) * shadowScale;
          ctx.shadowColor = `rgba(150, 92, 240, ${(strandAlpha * 0.8).toFixed(4)})`;
          ctx.stroke();
        }

        const counterCount = perfTier === 0 ? 2 : 3;
        for (let c = 0; c < counterCount; c++) {
          const phase = swirl * (2.2 + c * 0.35);
          const base = (c / counterCount) * TAU + phase;
          ctx.beginPath();
          for (let i = 0; i <= 9; i++) {
            const p = i / 9;
            const rr = coreVortexRadius * (
              0.18 +
              0.68 * p +
              0.05 * Math.sin(phase * 3.1 + p * 9.3)
            );
            const ang =
              base -
              p * (2.3 + c * 0.35) +
              Math.sin(phase * 4.2 + p * 6.4) * 0.14;
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr * 0.88;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          const ca = coreVortexAlpha * 0.42;
          ctx.strokeStyle = `rgba(182, 128, 246, ${Math.max(0.03, ca).toFixed(4)})`;
          ctx.lineWidth = perfTier === 0 ? 1 : 1.2;
          ctx.shadowBlur = (8 + c * 2.2) * shadowScale;
          ctx.shadowColor = `rgba(130, 82, 220, ${(ca * 0.86).toFixed(4)})`;
          ctx.stroke();
        }

        ctx.beginPath();
        for (let i = 0; i <= 28; i++) {
          const p = i / 28;
          const ang = p * TAU + swirl * 1.95;
          const rr = coreVortexRadius * (
            0.28 +
            0.14 * Math.sin(swirl * 4.2 + p * 12) +
            0.07 * Math.sin(swirl * 6.5 + p * 8.2)
          );
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.88;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(122, 78, 206, ${(coreVortexAlpha * 0.34).toFixed(4)})`;
        ctx.fill();
        ctx.restore();
      }

      // Chaotic lightning during early portal formation (no delayed start).
      const lightningRamp = Math.max(0, Math.min(1, t / 0.28));
      if (lightningRamp > 0.01) {
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
        ctx.globalCompositeOperation = "screen";

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
            (0.06 + 0.12 * (flicker * 0.5 + 0.5)) *
            (1 + creationBoost * 0.42) *
            lightningRamp *
            lightningFade *
            fadeOut;
          if (alpha <= 0.004) continue;

          const baseA = bolt.angle + drift * 0.24 + Math.sin(drift * 2.1) * 0.08;
          const startR = lightningRadius * (0.96 + 0.08 * Math.sin(drift * 1.8));
          const reach = innerRadius * (0.12 + bolt.reach * (0.38 + 0.3 * lightningRamp));
          const span = 0.22 + 0.1 * Math.sin(drift * 2.6 + bolt.phase);

          ctx.beginPath();
          for (let i = 0; i <= mainSteps; i++) {
            const p = i / mainSteps;
            const rr = startR + reach * p;
            const jag =
              Math.sin(drift * 3.2 + p * 12.6) +
              0.65 * Math.sin(drift * 5.6 + p * 8.1 + bolt.phase);
            const ang = baseA + (p - 0.24) * span + jag * bolt.jitter * (1 + p * 1.38);
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr * 0.88;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          ctx.strokeStyle = `rgba(112, 66, 206, ${(alpha * 0.78).toFixed(4)})`;
          ctx.lineWidth = bolt.width + 1;
          ctx.shadowBlur = (12 + (1 - revealProgress) * 12) * shadowScale;
          ctx.shadowColor = `rgba(102, 56, 196, ${(alpha * 0.9).toFixed(4)})`;
          ctx.stroke();

          ctx.strokeStyle = `rgba(216, 172, 255, ${Math.min(0.4, alpha + 0.05).toFixed(4)})`;
          ctx.lineWidth = Math.max(0.82, bolt.width * 0.58);
          ctx.shadowBlur = (6 + (1 - revealProgress) * 7) * shadowScale;
          ctx.shadowColor = `rgba(178, 130, 255, ${(alpha * 0.8).toFixed(4)})`;
          ctx.stroke();

          if (flicker > (0.22 - creationBoost * 0.24)) {
            const dir = Math.sin(drift * 2.2 + bolt.phase) > 0 ? 1 : -1;
            const branchStartP = 0.34 + 0.22 * (0.5 + 0.5 * Math.sin(drift * 1.5 + bolt.phase));
            const fromR = startR + reach * branchStartP;
            const fromA = baseA + dir * 0.04;
            const branchReach = reach * (0.38 + 0.22 * (0.5 + 0.5 * Math.sin(drift * 2.4)));
            const branchSpan = dir * (0.2 + 0.1 * Math.sin(drift * 3 + bolt.phase));

            ctx.beginPath();
            for (let b = 0; b <= branchSteps; b++) {
              const p = b / branchSteps;
              const rr = fromR + branchReach * p;
              const jag =
                Math.sin(drift * 4.1 + p * 9.2) +
                0.48 * Math.sin(drift * 6.3 + p * 6.1 + bolt.phase);
              const ang = fromA + p * branchSpan + jag * bolt.jitter * 1.35;
              const x = cx + Math.cos(ang) * rr;
              const y = cy + Math.sin(ang) * rr * 0.88;
              if (b === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }

            const branchAlpha = alpha * 0.58;
            ctx.strokeStyle = `rgba(124, 78, 220, ${branchAlpha.toFixed(4)})`;
            ctx.lineWidth = Math.max(0.75, bolt.width * 0.64);
            ctx.shadowBlur = (9 + (1 - revealProgress) * 9) * shadowScale;
            ctx.shadowColor = `rgba(110, 68, 206, ${(branchAlpha * 0.86).toFixed(4)})`;
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
        const rimWidth = innerRadius * (0.17 + (1 - revealProgress) * 0.1);
        const ringInner = Math.max(2, ringRadius - rimWidth * 0.56);
        const ringOuter = ringRadius + rimWidth;

        ctx.save();
        ctx.globalCompositeOperation = "source-over";

        const ringBody = ctx.createRadialGradient(cx, cy, ringInner, cx, cy, ringOuter);
        ringBody.addColorStop(0, `rgba(0, 0, 0, ${(0.98 * fadeOut).toFixed(4)})`);
        ringBody.addColorStop(0.62, `rgba(0, 0, 0, ${(1 * fadeOut).toFixed(4)})`);
        ringBody.addColorStop(0.88, `rgba(10, 8, 14, ${(0.54 * fadeOut).toFixed(4)})`);
        ringBody.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = ringBody;
        ctx.beginPath();
        ctx.arc(cx, cy, ringOuter, 0, TAU);
        ctx.arc(cx, cy, ringInner, 0, TAU, true);
        ctx.fill("evenodd");

        const blackRimAlpha = Math.max(0, (0.96 - revealProgress * 0.3) * fadeOut);
        if (blackRimAlpha > 0.006) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0, 0, 0, ${blackRimAlpha.toFixed(4)})`;
          ctx.lineWidth = 6 + (1 - revealProgress) * 8.8;
          ctx.shadowBlur = (6 + (1 - revealProgress) * 10) * shadowScale;
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

        for (let i = 0; i < 5; i++) {
          const wave = revealProgress * 1.45 - i * 0.18;
          if (wave <= 0 || wave >= 1.52) continue;
          const waveRadius = ringRadius * (0.95 + wave * 1.08);
          const waveAlpha = (0.18 * (1 - Math.min(1, wave)) * (1 - i * 0.14)) * fadeOut;
          if (waveAlpha <= 0.003) continue;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(58, 58, 66, ${waveAlpha.toFixed(4)})`;
          ctx.lineWidth = Math.max(1, 4.6 - wave * 2.1);
          ctx.shadowBlur = (12 + (1 - wave) * 16) * shadowScale;
          ctx.shadowColor = `rgba(20, 20, 26, ${(waveAlpha * 0.92).toFixed(4)})`;
          ctx.arc(cx, cy, waveRadius, 0, TAU);
          ctx.stroke();
        }

        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < purpleJets.length; i += detailStep) {
          const jet = purpleJets[i];
          const drift = swirl * jet.speed + jet.phase;
          const radius = ringRadius + innerRadius * (0.02 + Math.sin(drift * 1.7) * 0.08);
          const start = jet.angle + drift * 0.24;
          const span = 0.08 + jet.spread * 0.14 + Math.sin(drift * 2.1) * 0.02;
          const alpha = (0.1 + 0.16 * (1 - revealProgress)) * (0.7 + Math.sin(drift * 3.1) * 0.3) * fadeOut;
          if (alpha <= 0.004) continue;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(178, 118, 255, ${Math.max(0.03, alpha).toFixed(4)})`;
          ctx.lineWidth = jet.lineWidth + 0.75 + (1 - revealProgress) * 1.35;
          ctx.shadowBlur = (11 + (1 - revealProgress) * 13) * shadowScale;
          ctx.shadowColor = `rgba(138, 74, 242, ${(alpha * 0.95).toFixed(4)})`;
          ctx.arc(cx, cy, radius, start, start + span);
          ctx.stroke();
        }

        // Secondary lightning during pulse-out reveal (same style, fewer bolts).
        const revealLightningRamp = Math.max(0, Math.min(1, (revealProgress - 0.08) / 0.92));
        if (revealLightningRamp > 0.01) {
          const revealBoltStep = Math.max(perfTier === 0 ? 3 : 2, detailStep + 1);
          const revealMainSteps = perfTier === 0 ? 4 : 5;
          const revealBranchSteps = perfTier === 0 ? 3 : 4;
          const revealLightningRadius = ringRadius + rimWidth * 0.28;

          for (let li = 0; li < outerLightning.length; li += revealBoltStep) {
            const bolt = outerLightning[li];
            const drift = swirl * (bolt.speed * 1.06) + bolt.phase;
            const flicker =
              0.5 +
              0.5 * Math.sin(drift * 4.2 + revealProgress * 16) +
              0.3 * Math.sin(drift * 6.6 + bolt.phase * 1.2);
            if (flicker < -0.04) continue;

            const alpha =
              (0.04 + 0.08 * (flicker * 0.5 + 0.5)) *
              revealLightningRamp *
              fadeOut;
            if (alpha <= 0.003) continue;

            const baseA = bolt.angle + drift * 0.2 + Math.sin(drift * 1.8) * 0.06;
            const startR = revealLightningRadius * (0.98 + 0.05 * Math.sin(drift * 1.7));
            const reach = innerRadius * (0.1 + bolt.reach * 0.26);
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

        const mistHalo = ctx.createRadialGradient(
          cx,
          cy,
          Math.max(2, ringRadius * 0.82),
          cx,
          cy,
          ringRadius + innerRadius * (0.54 + (1 - revealProgress) * 0.18)
        );
        mistHalo.addColorStop(0, "rgba(0, 0, 0, 0)");
        mistHalo.addColorStop(0.38, `rgba(62, 62, 76, ${(0.18 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(0.66, `rgba(28, 28, 36, ${(0.28 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(0.84, `rgba(84, 50, 132, ${(0.12 * fadeOut).toFixed(4)})`);
        mistHalo.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = mistHalo;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius + innerRadius * 0.7, 0, TAU);
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

  return true;
}

module.exports = {
  applyPortalCoreToClass,
  methods,
};

if (typeof window !== "undefined") {
  window.ShadowPortalCore = module.exports;
}
