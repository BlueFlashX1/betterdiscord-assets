import STYLES from "./styles.css";
import {
  extractMessageText,
  formatNumbersInMessage,
  summarizeMessage,
  detectToastType,
  getAccentColor,
  getMessageGroupKey,
  combineMessages,
  getNotificationFilterFlags,
} from "./formatting";
const { buildSoloLevelingToastsSettingsPanel } = require("./settings-panel");

// ============================================================================
// SoloLevelingToasts — Unified Toast Engine v2
// ============================================================================

module.exports = class SoloLevelingToasts {
  // ==========================================================================
  // SECTION 1: CONSTRUCTOR & LOW-LEVEL HELPERS
  // ==========================================================================

  constructor() {
    // Default settings
    this.defaultSettings = {
      enabled: true,
      showParticles: true,
      particleCount: 20,
      animationDuration: 150,
      fadeAnimationDuration: 400,
      defaultTimeout: 4000,
      position: "top-right",
      maxToasts: 5,
    };

    this.settings = structuredClone(this.defaultSettings);

    // Toast management
    this.toastContainer = null;
    this.activeToasts = [];
    this.patcher = null;
    this.messageGroups = new Map();
    this.groupWindow = 1000;
    this.debugMode = false;

    // Webpack stores
    this.webpackModules = { UserStore: null, ChannelStore: null };
    this.webpackModuleAccess = false;

    // Lifecycle management
    this._isStopped = false;
    this._hookRetryId = null;
    this._trackedTimeouts = new Set();

    // Settings panel lifecycle
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;

    // Toast Engine v2: rate limiting + consumer tracking
    this._rateLimiter = new Map();
    this._registeredConsumers = new Set();

    // Performance caches
    this._cache = {
      soloPluginInstance: null,
      soloPluginInstanceTime: 0,
      soloPluginInstanceTTL: 5000,
    };
  }

  get toastEngineVersion() {
    return 2;
  }

  // ── Tracked timeout helpers ──

  _setTrackedTimeout(callback, delayMs) {
    const timeoutId = setTimeout(() => {
      this._trackedTimeouts.delete(timeoutId);
      !this._isStopped && callback();
    }, delayMs);
    this._trackedTimeouts.add(timeoutId);
    return timeoutId;
  }

  _clearTrackedTimeouts() {
    this._trackedTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._trackedTimeouts.clear();
  }

  _clearTrackedTimeout(timeoutId) {
    if (!Number.isFinite(timeoutId)) return;
    clearTimeout(timeoutId);
    this._trackedTimeouts.delete(timeoutId);
  }

  // ── Toast timeout helpers ──

  _getToastTimeout(timeout) {
    return timeout || this.settings.defaultTimeout;
  }

  _clearToastFadeTimeout(toast) {
    if (!toast || !toast.dataset) return;
    const existingTimeout = toast.dataset.fadeTimeout;
    if (!existingTimeout) return;
    const timeoutId = Number.parseInt(existingTimeout, 10);
    this._clearTrackedTimeout(timeoutId);
    toast.dataset.fadeTimeout = "";
  }

  _scheduleToastFadeOut(toast, timeoutMs) {
    if (!toast) return;
    this._clearToastFadeTimeout(toast);
    const fadeAnimationDuration = this.settings.fadeAnimationDuration;
    const fadeOutDelay = Math.max(0, timeoutMs - fadeAnimationDuration);
    const timeoutId = this._setTrackedTimeout(() => {
      this.startFadeOut(toast);
      this._setTrackedTimeout(() => this.removeToast(toast, false), fadeAnimationDuration);
    }, fadeOutDelay);
    toast.dataset.fadeTimeout = timeoutId.toString();
  }

  _evictOldestToastIfNeeded() {
    if (this.activeToasts.length < this.settings.maxToasts) return;
    const oldestToast = this.activeToasts.shift();
    if (!oldestToast) return;
    this._clearToastFadeTimeout(oldestToast);
    oldestToast.remove();
  }

  // ── Settings panel cleanup ──

  detachSoloLevelingToastsSettingsPanelHandlers() {
    const root = this._settingsPanelRoot;
    const handlers = this._settingsPanelHandlers;
    if (root && handlers) {
      root.removeEventListener("change", handlers.onChange);
      root.removeEventListener("input", handlers.onInput);
    }
    this._settingsPanelRoot = null;
    this._settingsPanelHandlers = null;
  }

  // ==========================================================================
  // SECTION 2: WEBPACK & SETTINGS
  // ==========================================================================

  initializeWebpackModules() {
    try {
      this.webpackModules.UserStore = BdApi.Webpack.getStore("UserStore");
      this.webpackModules.ChannelStore = BdApi.Webpack.getStore("ChannelStore");
      this.webpackModuleAccess =
        !!this.webpackModules.UserStore && !!this.webpackModules.ChannelStore;
      if (this.webpackModuleAccess) {
        this.debugLog("WEBPACK_INIT", "Webpack modules initialized successfully");
      } else {
        this.debugLog("WEBPACK_INIT", "Some webpack modules not available, using fallbacks");
      }
    } catch (error) {
      this.debugError("WEBPACK_INIT", error);
      this.webpackModuleAccess = false;
    }
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load("SoloLevelingToasts", "settings");
      if (saved) {
        this.settings = structuredClone({ ...this.defaultSettings, ...saved });
        this.debugMode = this.settings.debugMode || false;
        this.debugLog("SETTINGS", "Settings loaded", this.settings);
      }
    } catch (error) {
      this.debugError("SETTINGS", error);
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save("SoloLevelingToasts", "settings", this.settings);
      this.debugLog("SETTINGS", "Settings saved");
    } catch (error) {
      this.debugError("SETTINGS", error);
    }
  }

  // ==========================================================================
  // SECTION 3: LIFECYCLE (start / stop)
  // ==========================================================================

  start() {
    this._isStopped = false;
    this.loadSettings();
    this.initializeWebpackModules();
    this.injectCSS();
    this.createToastContainer();
    this.hookIntoSoloLeveling();
    this.debugLog("PLUGIN_START", "Plugin started successfully");
  }

  stop() {
    this._isStopped = true;

    if (this._hookRetryId) {
      this._clearTrackedTimeout(this._hookRetryId);
      this._hookRetryId = null;
    }
    this._clearTrackedTimeouts();

    this.unhookIntoSoloLeveling();
    this.removeAllToasts();
    this.removeToastContainer();
    this.removeCSS();

    // Clear message groups
    this.messageGroups.forEach((group) => {
      if (group.timeoutId && group.timeoutId !== true) {
        this._clearTrackedTimeout(group.timeoutId);
      }
      if (group.cleanupTimeoutId) {
        this._clearTrackedTimeout(group.cleanupTimeoutId);
      }
    });
    this.messageGroups.clear();

    // Clear rate limiter + consumer tracking
    this._rateLimiter.clear();
    this._registeredConsumers.clear();

    // Clear all caches
    if (this._cache) {
      this._cache.soloPluginInstance = null;
      this._cache.soloPluginInstanceTime = 0;
    }

    // Clear webpack module references
    this.webpackModules = { UserStore: null, ChannelStore: null };
    this.webpackModuleAccess = false;

    this.detachSoloLevelingToastsSettingsPanelHandlers();

    this.debugLog("PLUGIN_STOP", "Plugin stopped successfully");
  }

  // ==========================================================================
  // SECTION 4: CSS INJECTION
  // ==========================================================================

  injectCSS() {
    const styleId = "solo-leveling-toasts-css";

    const injectedViaBdApi = (() => {
      try {
        BdApi.DOM.addStyle(styleId, STYLES);
        return true;
      } catch (_error) {
        return false;
      }
    })();

    if (!injectedViaBdApi) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    // Apply dynamic durations as CSS custom properties on <html> so
    // they cascade into the toast container and its children.
    const root = document.documentElement;
    root.style.setProperty("--sl-anim-duration", `${this.settings.animationDuration}ms`);
    root.style.setProperty("--sl-fade-duration", `${this.settings.fadeAnimationDuration / 1000}s`);

    this.debugLog(
      "INJECT_CSS",
      `CSS injected successfully via ${injectedViaBdApi ? "BdApi.DOM" : "manual method"}`
    );
  }

  removeCSS() {
    const styleId = "solo-leveling-toasts-css";
    try {
      BdApi.DOM.removeStyle(styleId);
    } catch (error) {
      const style = document.getElementById(styleId);
      if (style) style.remove();
    }
    // Clean up custom properties
    const root = document.documentElement;
    root.style.removeProperty("--sl-anim-duration");
    root.style.removeProperty("--sl-fade-duration");
  }

  // ==========================================================================
  // SECTION 5: TOAST CONTAINER
  // ==========================================================================

  createToastContainer() {
    if (this.toastContainer) {
      this.debugLog("CREATE_CONTAINER", "Container already exists");
      return;
    }
    this.toastContainer = document.createElement("div");
    this.toastContainer.className = `sl-toast-container ${this.settings.position}`;
    document.body.appendChild(this.toastContainer);
    this.debugLog("CREATE_CONTAINER", "Toast container created", {
      position: this.settings.position,
      containerExists: !!this.toastContainer,
      parentExists: !!this.toastContainer.parentElement,
    });
  }

  removeToastContainer() {
    this.toastContainer && (this.toastContainer.remove(), (this.toastContainer = null));
  }

  updateContainerPosition() {
    if (this.toastContainer) {
      this.toastContainer.className = `sl-toast-container ${this.settings.position}`;
    }
  }

  // ==========================================================================
  // SECTION 6: PARTICLES
  // ==========================================================================

  createParticles(toastElement, count) {
    if (this._isStopped) return;
    if (!this.settings.showParticles) return;

    const rect = toastElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Use a wrapper div so all particles can be removed with a single DOM operation
    const wrapper = document.createElement("div");
    wrapper.className = "sl-toast-particle-batch";
    wrapper.style.cssText = "position:fixed;top:0;left:0;pointer-events:none;z-index:100000;";

    for (let i = 0; i < count; i++) {
      const particle = document.createElement("div");
      particle.className = "sl-toast-particle";

      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const distance = 30 + Math.random() * 40;
      const particleX = Math.cos(angle) * distance;
      const particleY = Math.sin(angle) * distance - 20;

      particle.style.left = `${centerX}px`;
      particle.style.top = `${centerY}px`;
      particle.style.setProperty("--sl-particle-x", `${particleX}px`);
      particle.style.setProperty("--sl-particle-y", `${particleY}px`);

      wrapper.appendChild(particle);
    }

    document.body.appendChild(wrapper);
    // Single timeout removes all particles at once (was 20 individual timeouts)
    this._setTrackedTimeout(() => wrapper.remove(), 1500);
  }

  // ==========================================================================
  // SECTION 7: SHOW TOAST (public API) + GROUPING
  // ==========================================================================

  showToast(message, type = "info", timeout = null, options = {}) {
    if (this._isStopped) return;

    // Rate limiting (Toast Engine v2)
    if (options.callerId) {
      this._registeredConsumers.add(options.callerId);
      if (!this._checkRateLimit(options.callerId, options.maxPerMinute || 15)) {
        this.debugLog("RATE_LIMIT", `Throttled toast from ${options.callerId}`);
        return;
      }
    }

    const groupKey = getMessageGroupKey(message, type);
    const now = Date.now();
    const messageText = extractMessageText(message);

    // Check if we have an existing group for this message
    if (this.messageGroups.has(groupKey)) {
      const group = this.messageGroups.get(groupKey);

      group.messages.push({ message: messageText, timestamp: now });
      group.count++;
      group.lastSeen = now;

      if (group.timeoutId && group.timeoutId !== true) {
        this._clearTrackedTimeout(group.timeoutId);
      }

      // Update existing toast if visible (immediate update)
      const existingToast = this.findToastByKey(groupKey);
      if (existingToast) {
        this.updateToastCount(existingToast, group.count);
        this.resetToastFadeOut(existingToast, this._getToastTimeout(timeout));
        return;
      }

      // If RAF is pending, don't schedule another timeout
      if (group.timeoutId === true) {
        return;
      }

      // Faster grouping window
      const fastGroupDelay = Math.min(200, this.groupWindow);
      group.timeoutId = this._setTrackedTimeout(() => {
        if (group.shown === true) {
          this.messageGroups.delete(groupKey);
          return;
        }
        group.shown = true;
        this.messageGroups.delete(groupKey);
        const combinedMessage = combineMessages(group.messages);
        this._showToastInternal(combinedMessage, type, timeout);
      }, fastGroupDelay);

      return;
    }

    // Create new group
    const group = {
      messages: [{ message: messageText, timestamp: now }],
      count: 1,
      lastSeen: now,
      timeoutId: null,
      shown: false,
    };

    this.messageGroups.set(groupKey, group);
    group.timeoutId = true; // sentinel: RAF pending

    requestAnimationFrame(() => {
      if (this._isStopped) return;
      const currentGroup = this.messageGroups.get(groupKey);
      if (currentGroup && !currentGroup.shown) {
        currentGroup.shown = true;
        currentGroup.timeoutId = null;
        const combinedMessage = combineMessages(currentGroup.messages);
        this._showToastInternal(combinedMessage, type, timeout);

        currentGroup.cleanupTimeoutId = this._setTrackedTimeout(() => {
          if (this.messageGroups.get(groupKey) === currentGroup) {
            this.messageGroups.delete(groupKey);
          }
        }, this.groupWindow);
      } else if (currentGroup) {
        currentGroup.timeoutId = null;
      }
    });
  }

  findToastByKey(groupKey) {
    const normalized = groupKey.split("_")[0];
    return (
      this.activeToasts.find((toast) => {
        const toastText = toast.textContent
          .toLowerCase()
          .replace(/\d+/g, "N")
          .replace(/\s+/g, " ")
          .trim();
        return toastText.includes(normalized.substring(0, 30));
      }) || null
    );
  }

  updateToastCount(toast, count) {
    if (!toast) return;
    const titleEl = toast.querySelector(".sl-toast-title");
    if (titleEl) {
      let titleText = titleEl.textContent;
      const countMatch = titleText.match(/x(\d+)/);
      if (countMatch) {
        titleText = titleText.replace(/x\d+/, `x${count}`);
      } else {
        titleText = `${titleText} x${count}`;
      }
      titleEl.textContent = titleText;
    }
    toast.classList.remove("fading-out");
    toast.style.animation = "";
  }

  resetToastFadeOut(toast, timeout) {
    if (!toast) return;
    toast.classList.remove("fading-out");
    toast.style.animation = "";
    toast.style.pointerEvents = "";
    this._scheduleToastFadeOut(toast, timeout);
  }

  // ==========================================================================
  // SECTION 8: INTERNAL TOAST RENDERING
  // ==========================================================================

  _showToastInternal(message, type = "info", timeout = null) {
    if (this._isStopped) return;

    this.debugLog("SHOW_TOAST", "Toast request received", {
      message: message?.substring(0, 100),
      type,
      timeout,
      enabled: this.settings.enabled,
      activeToasts: this.activeToasts.length,
    });

    if (!this.settings.enabled) {
      this.debugLog("SHOW_TOAST", "Plugin disabled, using fallback toast");
      if (BdApi?.UI?.showToast) {
        BdApi.UI.showToast(message, { type, timeout: this._getToastTimeout(timeout) });
      }
      return;
    }

    try {
      this._evictOldestToastIfNeeded();

      const toastType = detectToastType(message, type);
      const toastTimeout = this._getToastTimeout(timeout);

      // Process message: format numbers and summarize
      let processedMessage = message;
      if (typeof processedMessage === "string") {
        processedMessage = formatNumbersInMessage(processedMessage);
        processedMessage = summarizeMessage(processedMessage);
      }

      // Create toast element
      const toast = document.createElement("div");
      toast.className = `sl-toast ${toastType}`;
      toast.style.setProperty("--sl-toast-timeout", `${toastTimeout}ms`);
      toast.style.setProperty("--sl-card-accent", getAccentColor(toastType));

      const accentBar = document.createElement("div");
      accentBar.className = "sl-toast-accent";
      toast.appendChild(accentBar);

      // Extract title and message
      const lines = processedMessage.split("\n");
      const title = lines[0] || "Notification";
      const body = lines.slice(1).join("\n") || "";

      const titleEl = document.createElement("div");
      titleEl.className = "sl-toast-title";
      titleEl.textContent = title;
      toast.appendChild(titleEl);

      if (body) {
        const bodyEl = document.createElement("div");
        bodyEl.className = "sl-toast-message";
        bodyEl.textContent = body;
        toast.appendChild(bodyEl);
      }

      // Progress bar
      const progressBar = document.createElement("div");
      progressBar.style.position = "absolute";
      progressBar.style.top = "0";
      progressBar.style.left = "0";
      progressBar.style.right = "0";
      progressBar.style.height = "2px";
      progressBar.style.background =
        "linear-gradient(90deg, transparent, var(--sl-card-accent, #8a2be2), transparent)";
      progressBar.style.animation = `sl-toast-progress ${toastTimeout}ms linear forwards`;
      toast.appendChild(progressBar);

      // Click to dismiss
      toast.addEventListener("click", () => {
        this._clearToastFadeTimeout(toast);
        this.startFadeOut(toast);
        this._setTrackedTimeout(
          () => this.removeToast(toast, false),
          this.settings.fadeAnimationDuration
        );
      });

      if (!this.toastContainer) {
        this.createToastContainer();
      }

      // Track toast synchronously so _scheduleToastFadeOut can always find it
      this.activeToasts.push(toast);

      requestAnimationFrame(() => {
        if (this._isStopped) return;
        if (!this.toastContainer) {
          this.debugError("SHOW_TOAST", "Toast container is null, cannot append toast");
          return;
        }
        this.toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
          if (this._isStopped) return;
          this.createParticles(toast, this.settings.particleCount);
        });
      });

      this._scheduleToastFadeOut(toast, toastTimeout);

      this.debugLog("SHOW_TOAST", "Toast created and displayed", {
        toastType,
        timeout: toastTimeout,
        activeToasts: this.activeToasts.length,
        containerExists: !!this.toastContainer,
      });
    } catch (error) {
      this.debugError("SHOW_TOAST", error, {
        message: message?.substring(0, 100),
        type,
        timeout,
      });
      if (BdApi?.UI?.showToast) {
        BdApi.UI.showToast(message, { type, timeout: this._getToastTimeout(timeout) });
        this.debugLog("SHOW_TOAST", "Fallback toast shown");
      }
    }
  }

  // ==========================================================================
  // SECTION 9: FADE OUT & REMOVAL
  // ==========================================================================

  startFadeOut(toast) {
    if (!toast || !toast.parentElement) return;
    if (toast.classList.contains("fading-out")) return;

    this._clearToastFadeTimeout(toast);

    const computedStyle = window.getComputedStyle(toast);
    const currentTransform = computedStyle.transform;
    const currentOpacity = computedStyle.opacity;

    toast.style.animation = "none";
    toast.style.transition = "none";
    if (currentTransform && currentTransform !== "none") {
      toast.style.transform = currentTransform;
    }
    if (currentOpacity) {
      toast.style.opacity = currentOpacity;
    }
    // Single reflow commits animation:none + transition:none + inline values
    void toast.offsetHeight;

    toast.style.animation = "";
    toast.style.transition = "";
    toast.classList.add("fading-out");
    toast.style.pointerEvents = "none";

    this.debugLog("START_FADE_OUT", "Fade out started", {
      activeToasts: this.activeToasts.length,
      position: this.settings.position,
    });
  }

  removeToast(toast, fast = false) {
    if (!toast || !toast.parentElement) {
      this.debugLog("REMOVE_TOAST", "Toast already removed or invalid", {
        toastExists: !!toast,
        hasParent: !!toast?.parentElement,
      });
      return;
    }

    this.debugLog("REMOVE_TOAST", "Removing toast", {
      activeToasts: this.activeToasts.length,
      fast,
    });

    toast.remove();
    const index = this.activeToasts.indexOf(toast);
    if (index > -1) {
      this.activeToasts.splice(index, 1);
    }

    this.debugLog("REMOVE_TOAST", "Toast removed", {
      remainingToasts: this.activeToasts.length,
    });
  }

  removeAllToasts() {
    this.activeToasts.forEach((toast) => toast.remove());
    this.activeToasts = [];
  }

  // ==========================================================================
  // SECTION 10: CARD TOAST API + RATE LIMITING (Toast Engine v2)
  // ==========================================================================

  _checkRateLimit(callerId, maxPerMinute = 15) {
    const now = Date.now();
    let timestamps = this._rateLimiter.get(callerId);
    if (!timestamps) { timestamps = []; this._rateLimiter.set(callerId, timestamps); }
    // Evict stale entries in-place (chronological order)
    const cutoff = now - 60000;
    let i = 0;
    while (i < timestamps.length && timestamps[i] < cutoff) i++;
    if (i > 0) timestamps.splice(0, i);
    if (timestamps.length >= maxPerMinute) return false;
    timestamps.push(now);
    // Prune stale callerIds (no activity in 60s) to prevent unbounded growth
    if (this._rateLimiter.size > 50) {
      for (const [id, ts] of this._rateLimiter) {
        if (!ts.length || now - ts[ts.length - 1] > 60000) this._rateLimiter.delete(id);
      }
    }
    return true;
  }

  /**
   * Show a card-style toast with avatar, header, body, and optional detail.
   */
  showCardToast(opts = {}) {
    if (this._isStopped) return;

    const { avatarUrl, accentColor, header, body } = opts;
    if (!avatarUrl || !accentColor || !header || !body) {
      this.debugLog("CARD_TOAST", "Missing required fields", {
        avatarUrl: !!avatarUrl,
        accentColor: !!accentColor,
        header: !!header,
        body: !!body,
      });
      return;
    }

    // Rate limiting
    if (opts.callerId) {
      this._registeredConsumers.add(opts.callerId);
      if (!this._checkRateLimit(opts.callerId, opts.maxPerMinute || 15)) {
        this.debugLog("RATE_LIMIT", `Throttled card toast from ${opts.callerId}`);
        return;
      }
    }

    // Dedup check
    const dedupKey = `${header}::${body}`
      .toLowerCase()
      .replace(/\d+/g, "N")
      .replace(/\s+/g, " ")
      .trim();
    const existingToast = this.activeToasts.find((t) => t._cardDedupKey === dedupKey);
    if (existingToast) {
      this.resetToastFadeOut(existingToast, this._getToastTimeout(opts.timeout));
      this.debugLog("CARD_TOAST", "Deduped card toast", { dedupKey });
      return;
    }

    this._evictOldestToastIfNeeded();

    const toastTimeout = this._getToastTimeout(opts.timeout);

    // Build card DOM
    const toast = document.createElement("div");
    toast.className = "sl-toast sl-toast-card";
    toast.style.setProperty("--sl-card-accent", accentColor);
    toast.style.setProperty("--sl-toast-timeout", `${toastTimeout}ms`);
    toast._cardDedupKey = dedupKey;

    const accent = document.createElement("div");
    accent.className = "sl-toast-card-accent";
    toast.appendChild(accent);

    const inner = document.createElement("div");
    inner.className = "sl-toast-card-inner";

    // Avatar wrap
    const avatarWrap = document.createElement("div");
    avatarWrap.className = "sl-toast-card-avatar-wrap";

    const img = document.createElement("img");
    img.className = "sl-toast-card-avatar";
    img.src = avatarUrl;
    img.alt = "";
    img.onerror = () => {
      img.style.display = "none";
    };
    avatarWrap.appendChild(img);

    const statusDot = document.createElement("div");
    statusDot.className = "sl-toast-card-status";
    avatarWrap.appendChild(statusDot);

    inner.appendChild(avatarWrap);

    // Content
    const content = document.createElement("div");
    content.className = "sl-toast-card-content";

    const headerEl = document.createElement("div");
    headerEl.className = "sl-toast-card-header";
    headerEl.textContent = header;
    content.appendChild(headerEl);

    const bodyEl = document.createElement("div");
    bodyEl.className = "sl-toast-card-body";
    bodyEl.textContent = body;
    content.appendChild(bodyEl);

    if (opts.detail) {
      const detailEl = document.createElement("div");
      detailEl.className = "sl-toast-card-detail";
      detailEl.textContent = opts.detail;
      content.appendChild(detailEl);
    }

    inner.appendChild(content);
    toast.appendChild(inner);

    // Progress bar
    const progressBar = document.createElement("div");
    progressBar.className = "sl-toast-card-progress";
    progressBar.style.animationDuration = `${toastTimeout}ms`;
    toast.appendChild(progressBar);

    // Click to dismiss
    toast.addEventListener("click", () => {
      this._clearToastFadeTimeout(toast);
      if (typeof opts.onClick === "function") {
        try {
          opts.onClick();
        } catch (_) {}
      }
      this.startFadeOut(toast);
      this._setTrackedTimeout(
        () => this.removeToast(toast, false),
        this.settings.fadeAnimationDuration
      );
    });

    if (!this.toastContainer) this.createToastContainer();

    this.activeToasts.push(toast);

    requestAnimationFrame(() => {
      if (this._isStopped || !this.toastContainer) return;
      this.toastContainer.appendChild(toast);
    });

    this._scheduleToastFadeOut(toast, toastTimeout);

    this.debugLog("CARD_TOAST", "Card toast created", {
      header,
      body,
      accentColor,
      activeToasts: this.activeToasts.length,
    });
  }

  // ==========================================================================
  // SECTION 11: SOLOLEVELINGSTATS HOOK
  // ==========================================================================

  _canRetrySoloHook() {
    if (!this._hookRetryCount) this._hookRetryCount = 0;
    if (this._hookRetryCount >= 10) {
      this.debugLog(
        "HOOK_ABORT",
        "Max retry attempts (10) reached for SoloLevelingStats hook -- giving up"
      );
      return false;
    }
    this._hookRetryCount++;
    return true;
  }

  _scheduleSoloHookRetry(message, data = null) {
    this.debugLog("HOOK_RETRY", message, data);
    this._hookRetryId = this._setTrackedTimeout(() => this.hookIntoSoloLeveling(), 2000);
  }

  _resolveSoloLevelingInstance() {
    const now = Date.now();
    if (
      this._cache.soloPluginInstance &&
      this._cache.soloPluginInstanceTime &&
      now - this._cache.soloPluginInstanceTime < this._cache.soloPluginInstanceTTL &&
      BdApi.Plugins.isEnabled("SoloLevelingStats")
    ) {
      return this._cache.soloPluginInstance;
    }

    const soloPlugin = BdApi.Plugins.get("SoloLevelingStats");
    if (!soloPlugin) return null;
    const instance = soloPlugin.instance || soloPlugin;
    this._cache.soloPluginInstance = instance;
    this._cache.soloPluginInstanceTime = now;
    return instance;
  }

  hookIntoSoloLeveling() {
    if (this._isStopped) return;
    if (!this._canRetrySoloHook()) return;

    try {
      const instance = this._resolveSoloLevelingInstance();
      if (!instance) {
        this._scheduleSoloHookRetry("SoloLevelingStats plugin/instance not found, will retry...");
        return;
      }

      if (instance.showNotification) {
        this.patcher = BdApi.Patcher.after(
          "SoloLevelingToasts",
          instance,
          "showNotification",
          (_, args) => {
            const [message, type, timeout] = args;
            const messageText = extractMessageText(message);
            const filterFlags = getNotificationFilterFlags(messageText);

            if (filterFlags.shouldSkip) {
              this.debugLog("HOOK_INTERCEPT", "Skipping spammy notification", {
                originalMessage: messageText.substring(0, 100),
                isNaturalGrowth: filterFlags.isNaturalGrowth,
                isStatAllocation: filterFlags.isStatAllocation,
              });
              return;
            }

            this.debugLog("HOOK_INTERCEPT", "Intercepted showNotification call", {
              message: messageText.substring(0, 100),
              type,
              timeout,
            });
            this.showToast(message, type, timeout);
          }
        );

        if (this._hookRetryId) {
          this._clearTrackedTimeout(this._hookRetryId);
          this._hookRetryId = null;
        }
        this._hookRetryCount = 0;

        this.debugLog("HOOK_SUCCESS", "Successfully hooked into SoloLevelingStats.showNotification", {
          hasPatcher: !!this.patcher,
        });
      } else {
        this._scheduleSoloHookRetry("showNotification method not found, will retry...", {
          hasInstance: !!instance,
          instanceKeys: instance ? Object.keys(instance).slice(0, 10) : [],
        });
      }
    } catch (error) {
      this.debugError("HOOK_ERROR", error);
      this._scheduleSoloHookRetry("Hook crashed, will retry...");
    }
  }

  unhookIntoSoloLeveling() {
    if (this.patcher) {
      BdApi.Patcher.unpatchAll("SoloLevelingToasts");
      this.patcher = null;
      this.debugLog("UNHOOK", "Unhooked from SoloLevelingStats");
    }
    this._hookRetryCount = 0;
  }

  // ==========================================================================
  // SECTION 12: SETTINGS PANEL
  // ==========================================================================

  getSettingsPanel() {
    return buildSoloLevelingToastsSettingsPanel(BdApi, this);
  }

  // ==========================================================================
  // SECTION 13: DEBUGGING & UTILITIES
  // ==========================================================================

  debugLog(operation, message, data = null) {
    if (!this.debugMode) return;

    if (typeof message === "object" && data === null) {
      data = message;
      message = operation;
      operation = "GENERAL";
    }
    const logMessage = data !== null && data !== undefined ? `${message}` : message;
    const logData = data !== null && data !== undefined ? data : "";
    console.log(`[SoloLevelingToasts:${operation}]`, logMessage, logData);
  }

  debugError(operation, error, data = null) {
    if (!this.debugMode && !this.settings?.debugMode) return;
    console.error(`[SoloLevelingToasts:ERROR:${operation}]`, error, data || "");
  }
};
