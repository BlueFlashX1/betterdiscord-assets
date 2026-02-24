/**
 * @name Stealth
 * @description Total concealment: suppress typing, force invisible, suppress idle detection, hide activities, erase telemetry, and neutralize tracking.
 * @version 2.0.0
 * @author matthewthompson
 */

/** Load a local shared module from BD's plugins folder (BD require only handles Node built-ins). */
const _bdLoad = f => { try { const m = {exports:{}}; new Function('module','exports',require('fs').readFileSync(require('path').join(BdApi.Plugins.folder, f),'utf8'))(m,m.exports); return typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : null; } catch(e) { return null; } };

const STEALTH_PLUGIN_ID = "Stealth";
const STEALTH_STYLE_ID = "stealth-plugin-css";

const DEFAULT_SETTINGS = {
  enabled: true,
  suppressTyping: true,
  invisibleStatus: true,
  suppressActivities: true,
  suppressTelemetry: true,
  disableProcessMonitor: true,
  autoSilentMessages: true,
  suppressIdle: true,
  restoreStatusOnStop: true,
  showToasts: true,
};

module.exports = class Stealth {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };

    this._statusInterval = null;
    this._originalStatus = null;
    this._forcedInvisible = false;
    this._statusSetters = [];
    this._processMonitorPatched = false;

    this._Dispatcher = null;
    this._dispatcherPollTimer = null;
    this._fluxHandlers = new Map();

    this._stores = {
      user: null,
      presence: null,
    };

    this._patchMetrics = {
      typing: 0,
      activities: 0,
      telemetry: 0,
      silent: 0,
      process: 0,
    };

    this._suppressEventLog = {
      typing: 0,
      activities: 0,
      telemetry: 0,
      idle: 0,
      silent: 0,
    };

    this._warningTimestamps = new Map();
  }

  start() {
    this.loadSettings();
    this.injectCSS();
    this._initStores();
    this._initDispatcher();
    this._processMonitorPatched = false;
    this._patchMetrics = {
      typing: 0,
      activities: 0,
      telemetry: 0,
      silent: 0,
      process: 0,
    };

    this._installPatches();
    this._syncStatusPolicy();

    this._toast("Stealth engaged", "success");
  }

  stop() {
    this._stopStatusInterval();
    this._unsubscribeFluxEvents();
    if (this._dispatcherPollTimer) {
      clearInterval(this._dispatcherPollTimer);
      this._dispatcherPollTimer = null;
    }
    this._processMonitorPatched = false;
    this._warningTimestamps.clear();

    if (this.settings.restoreStatusOnStop) {
      this._restoreOriginalStatus();
    }

    BdApi.Patcher.unpatchAll(STEALTH_PLUGIN_ID);
    BdApi.DOM.removeStyle(STEALTH_STYLE_ID);
  }

  loadSettings() {
    try {
      const saved = BdApi.Data.load(STEALTH_PLUGIN_ID, "settings");
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...(saved && typeof saved === "object" ? saved : {}),
      };
    } catch (error) {
      this._logWarning("SETTINGS", "Failed to load settings; using defaults", error, "settings-load");
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings() {
    try {
      BdApi.Data.save(STEALTH_PLUGIN_ID, "settings", this.settings);
    } catch (error) {
      this._logWarning("SETTINGS", "Failed to persist settings", error, "settings-save");
    }
  }

  _initStores() {
    try {
      this._stores.user = BdApi.Webpack.getStore("UserStore");

      this._stores.presence = BdApi.Webpack.getStore("PresenceStore");
    } catch (error) {
      this._logWarning("WEBPACK", "Failed to initialize User/Presence stores", error, "stores-init");
    }
  }

  _initDispatcher() {
    const { Webpack } = BdApi;

    // Proven acquisition pattern — NO optional chaining in getModule filter
    this._Dispatcher =
      Webpack.Stores?.UserStore?._dispatcher ||
      Webpack.getModule(m => m.dispatch && m.subscribe) ||
      Webpack.getByKeys("actionLogger") ||
      null;

    if (this._Dispatcher) {
      this._subscribeFluxEvents();
      return;
    }

    // Poll for late-loading Dispatcher (same pattern as ShadowSenses)
    let attempt = 0;
    this._dispatcherPollTimer = setInterval(() => {
      attempt++;
      this._Dispatcher =
        BdApi.Webpack.Stores?.UserStore?._dispatcher ||
        BdApi.Webpack.getModule(m => m.dispatch && m.subscribe) ||
        null;

      if (this._Dispatcher) {
        clearInterval(this._dispatcherPollTimer);
        this._dispatcherPollTimer = null;
        this._subscribeFluxEvents();
        return;
      }
      if (attempt >= 30) {
        clearInterval(this._dispatcherPollTimer);
        this._dispatcherPollTimer = null;
        this._logWarning("FLUX", "Dispatcher not found after 15s polling", null, "flux-poll-timeout");
      }
    }, 500);
  }

  _subscribeFluxEvents() {
    if (!this._Dispatcher) return;

    const events = {
      PRESENCE_UPDATES: () => {
        if (!this.settings.enabled || !this.settings.invisibleStatus) return;
        this._ensureInvisibleStatus();
      },

      IDLE: () => {
        if (!this.settings.enabled || !this.settings.suppressIdle) return;
        this._recordSuppressed("idle");
        this._ensureInvisibleStatus();
      },

      AFK: () => {
        if (!this.settings.enabled || !this.settings.suppressIdle) return;
        this._recordSuppressed("idle");
        this._ensureInvisibleStatus();
      },

      TRACK: () => {
        if (!this.settings.enabled || !this.settings.suppressTelemetry) return;
        this._recordSuppressed("telemetry");
      },

      CONNECTION_OPEN: () => {
        if (this.settings.enabled && this.settings.suppressTelemetry) {
          this._disableSentryAndTelemetry();
        }
        if (this.settings.enabled && this.settings.invisibleStatus) {
          setTimeout(() => this._ensureInvisibleStatus(), 1000);
        }
      },
    };

    for (const [eventName, handler] of Object.entries(events)) {
      try {
        this._Dispatcher.subscribe(eventName, handler);
        this._fluxHandlers.set(eventName, handler);
      } catch (err) {
        this._logWarning("FLUX", `Failed to subscribe to ${eventName}`, err, `flux-sub-${eventName}`);
      }
    }
  }

  _unsubscribeFluxEvents() {
    if (!this._Dispatcher) return;

    for (const [eventName, handler] of this._fluxHandlers.entries()) {
      try {
        this._Dispatcher.unsubscribe(eventName, handler);
      } catch (err) {
        this._logWarning("FLUX", `Failed to unsubscribe from ${eventName}`, err, `flux-unsub-${eventName}`);
      }
    }
    this._fluxHandlers.clear();
  }

  _installPatches() {
    this._patchTypingIndicators();
    this._patchActivityUpdates();
    this._patchTelemetry();
    this._patchAutoSilentMessages();
  }

  _patchTypingIndicators() {
    let patched = 0;

    // Primary patch path from InvisibleTyping's approach: patch TypingModule.startTyping directly.
    try {
      const typingModule =
        BdApi.Webpack.getByKeys("startTyping", "stopTyping") ||
        BdApi.Webpack.getByKeys("startTyping");
      if (typingModule && typeof typingModule.startTyping === "function") {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          typingModule,
          "startTyping",
          (ctx, args, original) => {
            if (this.settings.enabled && this.settings.suppressTyping) {
              this._recordSuppressed("typing");
              return undefined;
            }
            return original.apply(ctx, args);
          }
        );
        patched += 1;
      }
      if (typingModule && typeof typingModule.stopTyping === "function") {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          typingModule,
          "stopTyping",
          (ctx, args, original) => {
            if (this.settings.enabled && this.settings.suppressTyping) {
              return undefined;
            }
            return original.apply(ctx, args);
          }
        );
        patched += 1;
      }
    } catch (error) {
      this._logWarning("TYPING", "Direct startTyping/stopTyping patch failed", error, "typing-direct");
    }

    const fnNames = [
      "sendTyping",
      "sendTypingStart",
      "triggerTyping",
      "startTypingNow",
      "stopTyping",
    ];

    const keyCombos = [
      ["startTyping", "stopTyping"],
      ["sendTyping", "stopTyping"],
      ["startTyping"],
      ["sendTyping"],
    ];

    patched += this._patchFunctions({
      fnNames,
      keyCombos,
      shouldBlock: () => this.settings.enabled && this.settings.suppressTyping,
      onBlocked: () => this._recordSuppressed("typing"),
      tag: "typing",
      blockedReturnValue: undefined,
    });

    this._patchMetrics.typing = patched;
  }

  _patchActivityUpdates() {
    const fnNames = [
      "setActivity",
      "setLocalActivity",
      "setCustomStatus",
      "setRichPresence",
      "setGame",
      "setPlayingStatus",
      "setNowPlaying",
    ];

    const keyCombos = [
      ["setActivity"],
      ["setLocalActivity"],
      ["setCustomStatus"],
      ["setRichPresence"],
      ["setGame"],
    ];

    const patched = this._patchFunctions({
      fnNames,
      keyCombos,
      shouldBlock: () => this.settings.enabled && this.settings.suppressActivities,
      onBlocked: () => this._recordSuppressed("activities"),
      tag: "activities",
      blockedReturnValue: undefined,
    });

    this._patchMetrics.activities = patched;
  }

  _patchTelemetry() {
    let patched = 0;

    try {
      const analytics = BdApi.Webpack.getByKeys("AnalyticEventConfigs");
      if (analytics?.default && typeof analytics.default.track === "function") {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          analytics.default,
          "track",
          (ctx, args, original) => {
            if (this.settings.enabled && this.settings.suppressTelemetry) {
              this._recordSuppressed("telemetry");
              return undefined;
            }
            return original.apply(ctx, args);
          }
        );
        patched += 1;
      }
    } catch (error) {
      this._logWarning("TELEMETRY", "Failed to patch analytics tracker", error, "telemetry-analytics");
    }

    try {
      const nativeModule =
        BdApi.Webpack.getByKeys("getDiscordUtils", "ensureModule") ||
        BdApi.Webpack.getByKeys("ensureModule");
      if (nativeModule && typeof nativeModule.ensureModule === "function") {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          nativeModule,
          "ensureModule",
          (ctx, args, original) => {
            const moduleName = args?.[0];
            if (
              this.settings.enabled &&
              this.settings.disableProcessMonitor &&
              typeof moduleName === "string" &&
              moduleName.includes("discord_rpc")
            ) {
              return undefined;
            }
            return original.apply(ctx, args);
          }
        );
        patched += 1;
      }
    } catch (error) {
      this._logWarning("TELEMETRY", "Failed to patch native ensureModule", error, "telemetry-native");
    }

    this._patchMetrics.telemetry = patched;
    this._applyStealthHardening();
  }

  _patchAutoSilentMessages() {
    let patched = 0;
    try {
      const messageActions = BdApi.Webpack.getByKeys("sendMessage");
      if (messageActions && typeof messageActions.sendMessage === "function") {
        BdApi.Patcher.before(STEALTH_PLUGIN_ID, messageActions, "sendMessage", (_ctx, args) => {
          if (!this.settings.enabled || !this.settings.autoSilentMessages) return;
          const message = args?.[1];
          if (!message || typeof message.content !== "string") return;

          const content = message.content.trimStart();
          if (!content || content.startsWith("@silent") || content.startsWith("/")) return;
          message.content = `@silent ${message.content}`;
          this._recordSuppressed("silent");
        });
        patched += 1;
      }
    } catch (error) {
      this._logWarning("SILENT", "Failed to patch sendMessage for @silent mode", error, "silent-patch");
    }

    this._patchMetrics.silent = patched;
  }

  _applyStealthHardening() {
    if (!this.settings.enabled) return;
    if (this.settings.suppressTelemetry) this._disableSentryAndTelemetry();
    if (this.settings.disableProcessMonitor) this._disableProcessMonitor();
  }

  _disableSentryAndTelemetry() {
    try {
      window?.__SENTRY__?.globalEventProcessors?.splice(
        0,
        window?.__SENTRY__?.globalEventProcessors?.length || 0
      );
      window?.__SENTRY__?.logger?.disable?.();

      const sentryHub = window?.DiscordSentry?.getCurrentHub?.();
      if (sentryHub) {
        sentryHub.getClient?.()?.close?.(0);
        const scope = sentryHub.getScope?.();
        scope?.clear?.();
        scope?.setFingerprint?.(null);
        sentryHub.setUser?.(null);
        sentryHub.setTags?.({});
        sentryHub.setExtras?.({});
        sentryHub.endSession?.();
      }

      for (const key in console) {
        if (!Object.prototype.hasOwnProperty.call(console, key)) continue;
        const current = console[key];
        if (current && current.__sentry_original__) {
          console[key] = current.__sentry_original__;
        }
      }
    } catch (error) {
      this._logWarning("TELEMETRY", "Failed while disabling Sentry hooks", error, "telemetry-sentry");
    }
  }

  _disableProcessMonitor() {
    let patched = 0;
    try {
      const settingsManager = BdApi.Webpack.getModule(
        (m) => m?.updateAsync && m?.type === 1,
        { searchExports: true }
      );
      const boolSetting = BdApi.Webpack.getModule(
        (m) => m?.typeName?.includes("Bool"),
        { searchExports: true }
      );
      settingsManager?.updateAsync(
        "status",
        (settings) => {
          settings.showCurrentGame = boolSetting?.create
            ? boolSetting.create({ value: false })
            : false;
        },
        0
      );
    } catch (error) {
      this._logWarning("PROCESS", "Failed to force disable current-game visibility", error, "process-status");
    }

    try {
      const nativeModule = BdApi.Webpack.getByKeys("getDiscordUtils");
      const discordUtils = nativeModule?.getDiscordUtils?.();
      if (!discordUtils) {
        this._patchMetrics.process = Math.max(this._patchMetrics.process, patched);
        return;
      }

      discordUtils.setObservedGamesCallback?.([], () => {});
      if (
        typeof discordUtils.setObservedGamesCallback === "function" &&
        !this._processMonitorPatched
      ) {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          discordUtils,
          "setObservedGamesCallback",
          () => undefined
        );
        this._processMonitorPatched = true;
        patched += 1;
      }
    } catch (error) {
      this._logWarning("PROCESS", "Failed to neutralize observed-games callback", error, "process-observe");
    }

    this._patchMetrics.process = Math.max(this._patchMetrics.process, patched);
  }

  _patchFunctions({ fnNames, keyCombos, shouldBlock, onBlocked, tag, blockedReturnValue }) {
    const modules = this._collectModules(fnNames, keyCombos);
    let patchedCount = 0;

    modules.forEach((mod) => {
      fnNames.forEach((fn) => {
        if (!mod || typeof mod[fn] !== "function") return;

        BdApi.Patcher.instead(STEALTH_PLUGIN_ID, mod, fn, (ctx, args, original) => {
          if (shouldBlock()) {
            onBlocked();
            return blockedReturnValue;
          }

          try {
            return original.apply(ctx, args);
          } catch (error) {
            console.error(`[${STEALTH_PLUGIN_ID}] Failed calling ${tag}.${fn}`, error);
            return blockedReturnValue;
          }
        });

        patchedCount += 1;
      });
    });

    return patchedCount;
  }

  _collectModules(fnNames, keyCombos) {
    const modules = [];

    const add = (m) => {
      if (m && (typeof m === "object" || typeof m === "function")) {
        modules.push(m);
      }
    };

    keyCombos.forEach((keys) => {
      try {
        if (Array.isArray(keys) && keys.length) {
          add(BdApi.Webpack.getByKeys(...keys));
        }
      } catch (error) {
        this._logWarning(
          "WEBPACK",
          `Module lookup by keys failed: ${Array.isArray(keys) ? keys.join(",") : "unknown"}`,
          error,
          `collect-keys:${Array.isArray(keys) ? keys.join(",") : "unknown"}`
        );
      }
    });

    try {
      add(
        BdApi.Webpack.getModule(
          (m) => m && fnNames.some((name) => typeof m[name] === "function")
        )
      );
    } catch (error) {
      this._logWarning("WEBPACK", "Fallback module scan failed", error, "collect-fallback-scan");
    }

    return this._dedupeModules(modules);
  }

  _dedupeModules(modules) {
    const unique = [];
    const seen = new Set();

    modules.forEach((mod) => {
      if (!mod) return;
      if (seen.has(mod)) return;
      seen.add(mod);
      unique.push(mod);
    });

    return unique;
  }

  _syncStatusPolicy() {
    const shouldForceInvisible = this.settings.enabled && this.settings.invisibleStatus;

    if (!shouldForceInvisible) {
      this._stopStatusInterval();

      if (this._forcedInvisible) {
        this._restoreOriginalStatus();
        this._forcedInvisible = false;
      }

      return;
    }

    this._statusSetters = this._resolveStatusSetters();

    const forced = this._ensureInvisibleStatus();
    if (!forced && this.settings.showToasts) {
      this._toast("Stealth: could not force Invisible status", "warning");
    }

    if (!this._statusInterval) {
      this._statusInterval = setInterval(() => {
        if (!this.settings.enabled || !this.settings.invisibleStatus) return;
        this._ensureInvisibleStatus();
      }, 5000);
    }
  }

  _stopStatusInterval() {
    if (this._statusInterval) {
      clearInterval(this._statusInterval);
      this._statusInterval = null;
    }
  }

  _resolveStatusSetters() {
    const candidates = [];

    const add = (module, fnName) => {
      if (!module || typeof module[fnName] !== "function") return;
      candidates.push({ module, fnName });
    };

    const addByKeys = (...keys) => {
      try {
        const mod = BdApi.Webpack.getByKeys(...keys);
        if (!mod) return;
        keys.forEach((key) => add(mod, key));
      } catch (error) {
        this._logWarning(
          "STATUS",
          `Status setter lookup failed: ${keys.join(",")}`,
          error,
          `status-lookup:${keys.join(",")}`
        );
      }
    };

    addByKeys("setStatus", "getStatus");
    addByKeys("setStatus");
    addByKeys("updateStatus");
    addByKeys("setPresence");

    try {
      const mod = BdApi.Webpack.getModule(
        (m) => m && typeof m.setStatus === "function"
      );
      add(mod, "setStatus");
    } catch (error) {
      this._logWarning("STATUS", "Fallback setStatus module scan failed", error, "status-fallback-scan");
    }

    const unique = [];
    const seen = new WeakMap();

    candidates.forEach((entry) => {
      const { module, fnName } = entry;
      if (!seen.has(module)) {
        seen.set(module, new Set());
      }
      const fnSet = seen.get(module);
      if (fnSet.has(fnName)) return;
      fnSet.add(fnName);
      unique.push(entry);
    });

    return unique;
  }

  _ensureInvisibleStatus() {
    const current = this._getCurrentStatus();

    if (current && current !== "invisible" && !this._originalStatus) {
      this._originalStatus = current;
    }

    if (current === "invisible") {
      this._forcedInvisible = true;
      return true;
    }

    const updated = this._setStatus("invisible");
    if (updated) {
      this._forcedInvisible = true;
    }

    return updated;
  }

  _setStatus(status) {
    if (!status) return false;
    if (!Array.isArray(this._statusSetters) || this._statusSetters.length === 0) {
      this._statusSetters = this._resolveStatusSetters();
    }

    let lastError = null;
    for (const entry of this._statusSetters) {
      const { module, fnName } = entry;
      try {
        if (fnName === "setPresence") {
          try {
            module[fnName].call(module, { status });
          } catch (presenceError) {
            this._logWarning("STATUS", `setPresence({status}) failed, trying plain string`, presenceError, "status-presence-obj");
            module[fnName].call(module, status);
          }
          return true;
        }

        if (fnName === "updateStatus") {
          module[fnName].call(module, status);
          return true;
        }

        module[fnName].call(module, status);
        return true;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      this._logWarning("STATUS", "All status setter candidates failed", lastError, "status-all-setters-failed");
    }

    return false;
  }

  _restoreOriginalStatus() {
    if (!this._originalStatus) return;

    this._setStatus(this._originalStatus);
    this._originalStatus = null;
  }

  _getCurrentStatus() {
    try {
      const user = this._stores.user?.getCurrentUser?.();
      const userId = user?.id;

      if (userId && this._stores.presence?.getStatus) {
        const status = this._stores.presence.getStatus(userId);
        if (typeof status === "string") {
          return status.toLowerCase();
        }
      }
    } catch (error) {
      this._logWarning("STATUS", "Failed reading current presence status", error, "status-read");
    }

    return null;
  }

  _logWarning(scope, message, error = null, throttleKey = null) {
    const key = throttleKey || `${scope}:${message}`;
    const now = Date.now();
    const throttleMs = 15000;
    if (this._warningTimestamps.size > 256) {
      const staleBefore = now - 5 * 60 * 1000;
      for (const [mapKey, ts] of this._warningTimestamps) {
        if (ts < staleBefore) this._warningTimestamps.delete(mapKey);
        if (this._warningTimestamps.size <= 192) break;
      }
      while (this._warningTimestamps.size > 192) {
        const oldestKey = this._warningTimestamps.keys().next().value;
        if (oldestKey === undefined) break;
        this._warningTimestamps.delete(oldestKey);
      }
    }
    const lastTs = this._warningTimestamps.get(key) || 0;
    if (now - lastTs < throttleMs) return;
    this._warningTimestamps.set(key, now);

    if (error) {
      console.warn(`[${STEALTH_PLUGIN_ID}][${scope}] ${message}`, error);
    } else {
      console.warn(`[${STEALTH_PLUGIN_ID}][${scope}] ${message}`);
    }
  }

  _recordSuppressed(kind) {
    const now = Date.now();
    const last = this._suppressEventLog[kind] || 0;

    // Throttle logs/toasts for suppressed events.
    if (now - last < 3000) return;

    this._suppressEventLog[kind] = now;
  }

  _setSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();

    if (key === "enabled" || key === "invisibleStatus") {
      this._syncStatusPolicy();
      this._applyStealthHardening();

      if (key === "enabled") {
        this._toast(
          this.settings.enabled ? "Stealth engaged" : "Stealth disengaged",
          this.settings.enabled ? "success" : "info"
        );
      }
      return;
    }

    if (key === "showToasts") return;
    if ((key === "suppressTelemetry" || key === "disableProcessMonitor") && this.settings.enabled) {
      this._applyStealthHardening();
      return;
    }

    if (key === "restoreStatusOnStop" && !this.settings.restoreStatusOnStop) {
      this._originalStatus = null;
      return;
    }
  }

  _toast(message, type = "info") {
    if (!this.settings.showToasts) return;

    let PluginUtils;
    try { PluginUtils = _bdLoad("BetterDiscordPluginUtils.js"); } catch (_) { PluginUtils = null; }

    if (PluginUtils) {
      PluginUtils.showToast(message, { type, timeout: 2500 });
      return;
    }

    // Inline fallback — modern API first, deprecated last
    if (typeof BdApi.UI?.showToast === "function") {
      BdApi.UI.showToast(message, { type, timeout: 2500 });
      return;
    }
    if (typeof BdApi.showToast === "function") {
      BdApi.showToast(message, { type, timeout: 2500 });
    }
  }

  getSettingsPanel() {
    const React = BdApi.React;
    const self = this;

    const rowStyle = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      padding: "10px 0",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    };

    const labelWrapStyle = {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      flex: 1,
    };

    const titleStyle = {
      color: "#e9d5ff",
      fontFamily: "'Orbitron', sans-serif",
      fontWeight: 700,
      fontSize: "13px",
      letterSpacing: "0.04em",
    };

    const descStyle = {
      color: "rgba(220, 220, 230, 0.72)",
      fontSize: "12px",
      lineHeight: 1.3,
    };

    const checkStyle = { accentColor: "#8a2be2", width: "16px", height: "16px" };

    const Header = () => React.createElement(
      "div",
      {
        style: {
          padding: "12px 14px",
          border: "1px solid rgba(138,43,226,0.4)",
          borderRadius: "10px",
          marginBottom: "14px",
          background: "linear-gradient(135deg, rgba(32, 15, 52, 0.7), rgba(12, 8, 20, 0.8))",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            color: "#c084fc",
            fontFamily: "'Orbitron', sans-serif",
            fontSize: "14px",
            fontWeight: 700,
            marginBottom: "6px",
          },
        },
        "Shadow Monarch Stealth"
      ),
      React.createElement(
        "div",
        { style: { color: "rgba(226, 232, 240, 0.82)", fontSize: "12px", lineHeight: 1.35 } },
        "Total concealment: hide typing, force Invisible, suppress idle detection, silence messages, erase telemetry footprints, and sever process monitoring."
      )
    );

    const SettingRow = ({ settingKey, title, description }) => {
      const [checked, setChecked] = React.useState(Boolean(self.settings[settingKey]));

      React.useEffect(() => {
        setChecked(Boolean(self.settings[settingKey]));
      }, [settingKey]);

      return React.createElement(
        "div",
        { style: rowStyle },
        React.createElement(
          "div",
          { style: labelWrapStyle },
          React.createElement("span", { style: titleStyle }, title),
          React.createElement("span", { style: descStyle }, description)
        ),
        React.createElement("input", {
          type: "checkbox",
          checked,
          style: checkStyle,
          onChange: (e) => {
            const value = Boolean(e.target.checked);
            setChecked(value);
            self._setSetting(settingKey, value);
          },
        })
      );
    };

    const Metrics = () => React.createElement(
      "div",
      {
        style: {
          marginTop: "14px",
          padding: "10px",
          borderRadius: "8px",
          background: "rgba(10, 10, 16, 0.7)",
          border: "1px solid rgba(138,43,226,0.25)",
          color: "rgba(226,232,240,0.82)",
          fontSize: "12px",
          lineHeight: 1.4,
        },
      },
      `Patched methods: typing ${self._patchMetrics.typing}, activities ${self._patchMetrics.activities}, telemetry ${self._patchMetrics.telemetry}, @silent ${self._patchMetrics.silent}, process ${self._patchMetrics.process}`
    );

    const Panel = () => React.createElement(
      "div",
      {
        className: "sl-stealth-settings",
        style: {
          padding: "16px",
          borderRadius: "12px",
          background: "rgba(8, 8, 14, 0.92)",
          border: "1px solid rgba(138,43,226,0.35)",
          boxShadow: "0 0 24px rgba(138,43,226,0.18)",
          color: "#d4d4dc",
        },
      },
      React.createElement(Header),
      React.createElement(SettingRow, {
        settingKey: "enabled",
        title: "Master Stealth",
        description: "Global toggle for all stealth suppression rules.",
      }),
      React.createElement(SettingRow, {
        settingKey: "suppressTyping",
        title: "Conceal Typing",
        description: "Blocks outbound typing indicators so others do not see when you are typing.",
      }),
      React.createElement(SettingRow, {
        settingKey: "invisibleStatus",
        title: "Force Invisible Status",
        description: "Automatically keeps your presence status set to Invisible.",
      }),
      React.createElement(SettingRow, {
        settingKey: "suppressActivities",
        title: "Hide Activity Updates",
        description: "Suppresses outbound activity updates (custom status / game activity module calls).",
      }),
      React.createElement(SettingRow, {
        settingKey: "suppressTelemetry",
        title: "Erase Tracking Footprints",
        description: "Blocks analytics tracking and disables Sentry telemetry hooks where possible.",
      }),
      React.createElement(SettingRow, {
        settingKey: "disableProcessMonitor",
        title: "Sever Process Monitor",
        description: "Stops observed-game callbacks and suppresses Discord RPC game process monitoring.",
      }),
      React.createElement(SettingRow, {
        settingKey: "suppressIdle",
        title: "Suppress Idle Detection",
        description: "Blocks idle/AFK state transitions that can leak presence information.",
      }),
      React.createElement(SettingRow, {
        settingKey: "autoSilentMessages",
        title: "Silent Whisper (@silent)",
        description: "Prefixes normal text messages with @silent automatically (slash commands are skipped).",
      }),
      React.createElement(SettingRow, {
        settingKey: "restoreStatusOnStop",
        title: "Restore Previous Status",
        description: "When disabled/stopped, revert to your pre-stealth status if captured.",
      }),
      React.createElement(SettingRow, {
        settingKey: "showToasts",
        title: "Show Toasts",
        description: "Display stealth on/off and warning toasts.",
      }),
      React.createElement(Metrics)
    );

    return React.createElement(Panel);
  }

  injectCSS() {
    BdApi.DOM.addStyle(
      STEALTH_STYLE_ID,
      `
.sl-stealth-settings input[type="checkbox"] {
  cursor: pointer;
}

.sl-stealth-settings input[type="checkbox"]:focus-visible {
  outline: 2px solid rgba(168, 85, 247, 0.9);
  outline-offset: 2px;
  border-radius: 2px;
}
`
    );
  }
};
