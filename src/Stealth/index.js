/**
 * TABLE OF CONTENTS
 * 1) Bootstrap + Constants
 * 2) Lifecycle + Settings
 * 3) Dispatcher + Flux Wiring
 * 4) Patch Installation
 * 5) Status Enforcement
 * 6) Warning/Diagnostics
 * 7) Settings UI + Styles
 */

const { loadBdModuleFromPlugins } = require("../shared/bd-module-loader");
let _PluginUtils;
try { _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js"); } catch (_) { _PluginUtils = null; }
const { createToast } = require("../shared/toast");
const { buildStealthSettingsPanel } = require("./settings-panel");
const { STEALTH_SETTINGS_CSS } = require("./styles");
const { attachStealthStatusPolicyMethods } = require("./status-policy");

const STEALTH_PLUGIN_ID = "Stealth";
const STEALTH_STYLE_ID = "stealth-plugin-css";
const STEALTH_SKILLTREE_PLUGIN_ID = "SkillTree";
const STEALTH_ACTIVE_SKILL_ID = "stealth_technique";
const STEALTH_GATE_REFRESH_MS = 15000;
const STEALTH_GATE_STATES = Object.freeze({
  PLUGIN_DISABLED: "PLUGIN_DISABLED",
  LOCKED: "LOCKED",
  DORMANT: "DORMANT",
  ACTIVE: "ACTIVE",
  UNAVAILABLE: "UNAVAILABLE",
});

const DEFAULT_SETTINGS = {
  enabled: true,
  suppressTyping: true,
  invisibleStatus: true,
  suppressActivities: true,
  suppressTelemetry: true,
  disableProcessMonitor: true,
  autoSilentMessages: true,
  suppressIdle: true,
  suppressReadReceipts: true,
  restoreStatusOnStop: true,
  showToasts: true,
  debugMode: false,
};

module.exports = class Stealth {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };

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
      readReceipts: 0,
    };

    this._suppressEventLog = {
      typing: 0,
      activities: 0,
      telemetry: 0,
      idle: 0,
      silent: 0,
      readReceipts: 0,
    };

    this._warningTimestamps = new Map();
    this._protoUtils = null;
    this._sentryDisabled = false;
    this._pendingTimers = new Set();
    this._gateState = STEALTH_GATE_STATES.UNAVAILABLE;
    this._lastGateReason = "init";
    this._skillTreeWatcher = {
      pollTimer: null,
      stateChangeHandler: null,
      activatedHandler: null,
      expiredHandler: null,
    };
  }

  _toast(message, type = "info", timeout = null) {
    if (!this.settings.showToasts) return;
    this._toastImpl?.(message, type, timeout);
  }

  // ── Lifecycle + Settings ───────────────────────────────────────────────
  start() {
    this._clearRuntimeArtifacts();
    this._toastImpl = _PluginUtils?.createToastHelper?.("stealth")
      || ((message, type = "info", timeout = null) => {
        const p = (() => {
          try {
            const plugin = BdApi.Plugins.get("SoloLevelingToasts");
            return plugin?.instance?.toastEngineVersion >= 2 ? plugin.instance : null;
          } catch (_) { return null; }
        })();
        if (p) p.showToast(message, type, timeout, { callerId: "stealth" });
        else createToast()(message, type);
      });
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
      readReceipts: 0,
    };

    this._installPatches();
    this._statusSetters = this._resolveStatusSetters(); // eager resolve, avoid lazy init on hot path
    this._setupStealthSkillGate();
    this._syncStatusPolicy();
    this._applyStealthHardening();

    const gate = this.getStealthGateSummary();
    if (gate.state === STEALTH_GATE_STATES.ACTIVE) {
      this._toast("Stealth engaged", "success");
    } else {
      this._toast(`Stealth armed (${gate.label})`, "info", 2600);
    }
  }

  _scheduleTimer(fn, delay) {
    if (typeof fn !== "function") return null;
    const timeoutMs = Number.isFinite(delay) ? Math.max(0, delay) : 0;
    const tid = setTimeout(() => {
      this._pendingTimers.delete(tid);
      try {
        fn();
      } catch (error) {
        this._logWarning("TIMER", "Scheduled callback failed", error, "timer-callback");
      }
    }, timeoutMs);
    this._pendingTimers.add(tid);
    return tid;
  }

  _clearRuntimeArtifacts() {
    for (const tid of this._pendingTimers) clearTimeout(tid);
    this._pendingTimers.clear();
    this._teardownStealthSkillGate();
    this._unsubscribeFluxEvents();
    if (this._dispatcherPollTimer) {
      clearInterval(this._dispatcherPollTimer);
      this._dispatcherPollTimer = null;
    }
    this._Dispatcher = null;
    this._statusSetters = [];
    this._sentryDisabled = false;
    this._processMonitorPatched = false;
    this._warningTimestamps.clear();
    this._gateState = STEALTH_GATE_STATES.UNAVAILABLE;
    this._lastGateReason = "cleared";
    BdApi.Patcher.unpatchAll(STEALTH_PLUGIN_ID);
    BdApi.DOM.removeStyle(STEALTH_STYLE_ID);
  }

  stop() {
    if (this.settings.restoreStatusOnStop) {
      this._restoreOriginalStatus();
    }
    this._clearRuntimeArtifacts();
  }

  loadSettings() {
    try {
      if (typeof _PluginUtils?.loadSettings === "function") {
        this.settings = _PluginUtils.loadSettings(STEALTH_PLUGIN_ID, DEFAULT_SETTINGS);
      } else {
        const saved = BdApi.Data.load(STEALTH_PLUGIN_ID, "settings");
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...(saved && typeof saved === "object" ? saved : {}),
        };
      }
    } catch (error) {
      this._logWarning("SETTINGS", "Failed to load settings; using defaults", error, "settings-load");
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings() {
    try {
      if (typeof _PluginUtils?.saveSettings === "function") {
        _PluginUtils.saveSettings(STEALTH_PLUGIN_ID, this.settings);
      } else {
        BdApi.Data.save(STEALTH_PLUGIN_ID, "settings", this.settings);
      }
    } catch (error) {
      this._logWarning("SETTINGS", "Failed to persist settings", error, "settings-save");
    }
  }

  _canSuppress(settingKey) {
    return (
      this.settings.enabled &&
      this._gateState === STEALTH_GATE_STATES.ACTIVE &&
      Boolean(this.settings[settingKey])
    );
  }

  _isStealthSuppressionActive() {
    return this._gateState === STEALTH_GATE_STATES.ACTIVE;
  }

  _resolveSkillTreeRuntime() {
    try {
      const plugin = BdApi.Plugins.get(STEALTH_SKILLTREE_PLUGIN_ID);
      const instance = plugin?.instance || null;
      if (!instance) return { available: false, unlocked: false, active: false, phase: null };

      let unlocked = false;
      let active = false;
      let phase = null;

      if (typeof instance.getActiveSkillRuntimeSnapshot === "function") {
        const snapshot = instance.getActiveSkillRuntimeSnapshot(STEALTH_ACTIVE_SKILL_ID);
        if (snapshot && typeof snapshot === "object") {
          unlocked = Boolean(snapshot.unlocked);
          active = Boolean(snapshot.isRunning);
          phase = snapshot.phase || null;
        }
      }

      if (typeof instance.isActiveSkillUnlocked === "function") {
        unlocked = Boolean(instance.isActiveSkillUnlocked(STEALTH_ACTIVE_SKILL_ID));
      }
      if (typeof instance.isActiveSkillRunning === "function") {
        active = Boolean(instance.isActiveSkillRunning(STEALTH_ACTIVE_SKILL_ID));
      }

      return { available: true, unlocked, active, phase };
    } catch (error) {
      this._logWarning("GATE", "Failed to inspect SkillTree runtime", error, "gate-runtime");
      return { available: false, unlocked: false, active: false, phase: null };
    }
  }

  _computeStealthGateState(runtime) {
    if (!this.settings.enabled) return STEALTH_GATE_STATES.PLUGIN_DISABLED;
    if (!runtime.available) return STEALTH_GATE_STATES.UNAVAILABLE;
    if (!runtime.unlocked) return STEALTH_GATE_STATES.LOCKED;
    if (runtime.active) return STEALTH_GATE_STATES.ACTIVE;
    return STEALTH_GATE_STATES.DORMANT;
  }

  _formatStealthGateLabel(state) {
    switch (state) {
      case STEALTH_GATE_STATES.ACTIVE:
        return "Stealth Technique active";
      case STEALTH_GATE_STATES.DORMANT:
        return "Unlocked, waiting activation";
      case STEALTH_GATE_STATES.LOCKED:
        return "Locked in SkillTree";
      case STEALTH_GATE_STATES.PLUGIN_DISABLED:
        return "Master Stealth disabled";
      default:
        return "SkillTree unavailable";
    }
  }

  getStealthGateSummary() {
    const state = this._gateState;
    return {
      state,
      label: this._formatStealthGateLabel(state),
      skillId: STEALTH_ACTIVE_SKILL_ID,
      enabled: Boolean(this.settings.enabled),
      active: this._isStealthSuppressionActive(),
    };
  }

  _setupStealthSkillGate() {
    if (!this._skillTreeWatcher) {
      this._skillTreeWatcher = {
        pollTimer: null,
        stateChangeHandler: null,
        activatedHandler: null,
        expiredHandler: null,
      };
    }
    if (this._skillTreeWatcher.stateChangeHandler) return;

    this._skillTreeWatcher.stateChangeHandler = (event) => {
      const skillId = event?.detail?.skillId;
      if (skillId && skillId !== STEALTH_ACTIVE_SKILL_ID) return;
      this._refreshStealthSkillGate("skill-event");
    };
    this._skillTreeWatcher.activatedHandler = (event) => {
      const skillId = event?.detail?.skillId;
      if (skillId !== STEALTH_ACTIVE_SKILL_ID) return;
      this._refreshStealthSkillGate("legacy-activated");
    };
    this._skillTreeWatcher.expiredHandler = (event) => {
      const skillId = event?.detail?.skillId;
      if (skillId !== STEALTH_ACTIVE_SKILL_ID) return;
      this._refreshStealthSkillGate("legacy-expired");
    };

    document.addEventListener("SkillTree:activeSkillStateChanged", this._skillTreeWatcher.stateChangeHandler);
    document.addEventListener("SkillTree:activeSkillActivated", this._skillTreeWatcher.activatedHandler);
    document.addEventListener("SkillTree:activeSkillExpired", this._skillTreeWatcher.expiredHandler);

    this._skillTreeWatcher.pollTimer = setInterval(() => {
      this._refreshStealthSkillGate("poll");
    }, STEALTH_GATE_REFRESH_MS);

    this._refreshStealthSkillGate("start");
  }

  _teardownStealthSkillGate() {
    if (!this._skillTreeWatcher) return;
    if (this._skillTreeWatcher.pollTimer) {
      clearInterval(this._skillTreeWatcher.pollTimer);
      this._skillTreeWatcher.pollTimer = null;
    }
    if (this._skillTreeWatcher.stateChangeHandler) {
      document.removeEventListener("SkillTree:activeSkillStateChanged", this._skillTreeWatcher.stateChangeHandler);
      this._skillTreeWatcher.stateChangeHandler = null;
    }
    if (this._skillTreeWatcher.activatedHandler) {
      document.removeEventListener("SkillTree:activeSkillActivated", this._skillTreeWatcher.activatedHandler);
      this._skillTreeWatcher.activatedHandler = null;
    }
    if (this._skillTreeWatcher.expiredHandler) {
      document.removeEventListener("SkillTree:activeSkillExpired", this._skillTreeWatcher.expiredHandler);
      this._skillTreeWatcher.expiredHandler = null;
    }
  }

  _handleStealthGateTransition(prevState, nextState, reason) {
    const becameActive =
      prevState !== STEALTH_GATE_STATES.ACTIVE &&
      nextState === STEALTH_GATE_STATES.ACTIVE;
    const stoppedBeingActive =
      prevState === STEALTH_GATE_STATES.ACTIVE &&
      nextState !== STEALTH_GATE_STATES.ACTIVE;

    if (stoppedBeingActive) {
      if (this.settings.restoreStatusOnStop) {
        this._restoreOriginalStatus();
      }
      this._forcedInvisible = false;
      if (reason !== "poll" && this.settings.enabled) {
        this._toast("Stealth Technique ended. Suppression paused.", "info", 2200);
      }
    }

    if (becameActive) {
      this._applyStealthHardening();
      if (reason !== "poll") {
        this._toast("Stealth Technique active. Suppression engaged.", "success", 2200);
      }
    }

    this._syncStatusPolicy();
  }

  _refreshStealthSkillGate(reason = "refresh") {
    const runtime = this._resolveSkillTreeRuntime();
    const nextState = this._computeStealthGateState(runtime);
    const prevState = this._gateState;
    this._lastGateReason = reason;
    this._gateState = nextState;

    if (prevState === nextState) {
      if (nextState === STEALTH_GATE_STATES.ACTIVE) {
        this._syncStatusPolicy();
      }
      return;
    }

    this._handleStealthGateTransition(prevState, nextState, reason);
  }

  // ── Store + Flux Dispatcher Wiring ─────────────────────────────────────
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
    this._Dispatcher =
      _PluginUtils?.getDispatcher?.() ||
      Webpack.Stores?.UserStore?._dispatcher ||
      Webpack.getModule(m => m.dispatch && m.subscribe) ||
      null;

    if (this._Dispatcher) {
      this._subscribeFluxEvents();
      return;
    }

    // Poll for late-loading Dispatcher
    let attempt = 0;
    this._dispatcherPollTimer = setInterval(() => {
      attempt++;
      this._Dispatcher =
        _PluginUtils?.getDispatcher?.() ||
        Webpack.Stores?.UserStore?._dispatcher ||
        Webpack.getModule(m => m.dispatch && m.subscribe) ||
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
        if (!this._canSuppress("invisibleStatus")) return;
        this._ensureInvisibleStatus();
      },

      IDLE: () => {
        if (!this._canSuppress("suppressIdle")) return;
        this._recordSuppressed("idle");
        if (this._canSuppress("invisibleStatus")) this._ensureInvisibleStatus();
      },

      AFK: () => {
        if (!this._canSuppress("suppressIdle")) return;
        this._recordSuppressed("idle");
        if (this._canSuppress("invisibleStatus")) this._ensureInvisibleStatus();
      },

      TRACK: () => {
        if (!this._canSuppress("suppressTelemetry")) return;
        this._recordSuppressed("telemetry");
      },

      CONNECTION_OPEN: () => {
        if (this._canSuppress("suppressTelemetry")) {
          this._disableSentryAndTelemetry();
        }
        if (this._canSuppress("invisibleStatus")) {
          this._scheduleTimer(() => this._ensureInvisibleStatus(), 1000);
        }
      },

      // Fires when user changes status via Discord's UI status picker
      USER_SETTINGS_PROTO_UPDATE: () => {
        if (!this._canSuppress("invisibleStatus")) return;
        // Small delay so Discord applies the setting, then we override
        this._scheduleTimer(() => this._ensureInvisibleStatus(), 300);
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
    if (!this._Dispatcher) {
      this._fluxHandlers.clear();
      return;
    }

    for (const [eventName, handler] of this._fluxHandlers.entries()) {
      try {
        this._Dispatcher.unsubscribe(eventName, handler);
      } catch (err) {
        this._logWarning("FLUX", `Failed to unsubscribe from ${eventName}`, err, `flux-unsub-${eventName}`);
      }
    }
    this._fluxHandlers.clear();
  }

  // ── Patch Installation ─────────────────────────────────────────────────
  _installPatches() {
    this._patchTypingIndicators();
    this._patchActivityUpdates();
    this._patchTelemetry();
    this._patchAutoSilentMessages();
    this._patchReadReceipts();
    this._initProtoUtils();
    this._patchProtoStatusUpdate();
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
            if (this._canSuppress("suppressTyping")) {
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
            if (this._canSuppress("suppressTyping")) {
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
      shouldBlock: () => this._canSuppress("suppressTyping"),
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
      shouldBlock: () => this._canSuppress("suppressActivities"),
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
            if (this._canSuppress("suppressTelemetry")) {
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
              this._canSuppress("disableProcessMonitor") &&
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
          if (!this._canSuppress("autoSilentMessages")) return;
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

  _patchReadReceipts() {
    let patched = 0;

    // Strategy 1: Patch ack/bulkAck on the unread-tracking module
    // Discord calls these when you view a channel to tell the server you've read messages.
    const ackFnNames = ["ack", "bulkAck", "ackChannel"];
    const ackKeyCombos = [
      ["ack", "bulkAck"],
      ["ack", "ackChannel"],
      ["ack"],
    ];

    patched += this._patchFunctions({
      fnNames: ackFnNames,
      keyCombos: ackKeyCombos,
      shouldBlock: () => this._canSuppress("suppressReadReceipts"),
      onBlocked: () => this._recordSuppressed("readReceipts"),
      tag: "readReceipts",
      blockedReturnValue: Promise.resolve(),
    });

    // Strategy 2: Patch the HTTP-level unread ack endpoint
    // Some Discord versions call a lower-level module with "markRead" or "ackMessages".
    try {
      const markReadModule = BdApi.Webpack.getByKeys("markRead") ||
        BdApi.Webpack.getByKeys("ackMessages");
      if (markReadModule) {
        for (const fn of ["markRead", "ackMessages"]) {
          if (typeof markReadModule[fn] === "function") {
            BdApi.Patcher.instead(
              STEALTH_PLUGIN_ID,
              markReadModule,
              fn,
              (ctx, args, original) => {
                if (this._canSuppress("suppressReadReceipts")) {
                  this._recordSuppressed("readReceipts");
                  return Promise.resolve();
                }
                return original.apply(ctx, args);
              }
            );
            patched += 1;
          }
        }
      }
    } catch (error) {
      this._logWarning("READ_RECEIPTS", "Failed to patch markRead/ackMessages", error, "ack-mark-read");
    }

    this._patchMetrics.readReceipts = patched;
  }

  _applyStealthHardening() {
    if (!this._isStealthSuppressionActive()) return;
    if (this._canSuppress("suppressTelemetry")) this._disableSentryAndTelemetry();
    if (this._canSuppress("disableProcessMonitor")) this._disableProcessMonitor();
  }

  _disableSentryAndTelemetry() {
    if (this._sentryDisabled) return;
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
      this._sentryDisabled = true;
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
            this._logWarning(tag.toUpperCase(), `Failed calling ${tag}.${fn}`, error, `patch-call-${tag}.${fn}`);
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

  // ── Diagnostics / Warning Throttle ────────────────────────────────────
  _trimWarningTimestamps(now, targetSize = 192) {
    if (this._warningTimestamps.size <= 256) return;
    const staleBefore = now - 5 * 60 * 1000;
    for (const [mapKey, timestamp] of this._warningTimestamps) {
      if (timestamp < staleBefore) this._warningTimestamps.delete(mapKey);
      if (this._warningTimestamps.size <= targetSize) return;
    }
    while (this._warningTimestamps.size > targetSize) {
      const oldestKey = this._warningTimestamps.keys().next().value;
      if (oldestKey === undefined) break;
      this._warningTimestamps.delete(oldestKey);
    }
  }

  _shouldThrottleWarning(key, now, throttleMs) {
    const lastTs = this._warningTimestamps.get(key) || 0;
    if (now - lastTs < throttleMs) return true;
    this._warningTimestamps.set(key, now);
    return false;
  }

  _printWarning(scope, message, error) {
    const prefix = `[${STEALTH_PLUGIN_ID}][${scope}] ${message}`;
    if (error) {
      console.warn(prefix, error);
      return;
    }
    console.warn(prefix);
  }

  _logWarning(scope, message, error = null, throttleKey = null) {
    const key = throttleKey || `${scope}:${message}`;
    const now = Date.now();
    const throttleMs = 15000;
    if (this._shouldThrottleWarning(key, now, throttleMs)) return;
    // Trim only after a warning passes through AND map is large
    if (this._warningTimestamps.size > 256) this._trimWarningTimestamps(now);
    this._printWarning(scope, message, error);
  }

  _recordSuppressed(kind) {
    const now = Date.now();
    const last = this._suppressEventLog[kind] || 0;

    // Throttle logs/toasts for suppressed events.
    if (now - last < 3000) return;

    this._suppressEventLog[kind] = now;
  }

  _isStatusPolicySetting(key) {
    return key === "enabled" || key === "invisibleStatus";
  }

  _handleStatusPolicySettingChange(key) {
    this._refreshStealthSkillGate("settings");
    this._syncStatusPolicy();
    this._applyStealthHardening();
    if (key !== "enabled") return;
    if (!this.settings.enabled) {
      this._toast("Stealth disengaged", "info");
      return;
    }
    const gate = this.getStealthGateSummary();
    this._toast(
      gate.state === STEALTH_GATE_STATES.ACTIVE ? "Stealth engaged" : `Stealth armed (${gate.label})`,
      gate.state === STEALTH_GATE_STATES.ACTIVE ? "success" : "info"
    );
  }

  _shouldReapplyHardeningForSetting(key) {
    return (key === "suppressTelemetry" || key === "disableProcessMonitor") && this._isStealthSuppressionActive();
  }

  _setSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();

    if (this._isStatusPolicySetting(key)) {
      this._handleStatusPolicySettingChange(key);
      return;
    }

    if (key === "showToasts") return;
    if (this._shouldReapplyHardeningForSetting(key)) {
      this._applyStealthHardening();
      return;
    }

    if (key === "restoreStatusOnStop" && !this.settings.restoreStatusOnStop) {
      this._originalStatus = null;
      return;
    }
  }

  // ── Settings UI ────────────────────────────────────────────────────────
  getSettingsPanel() {
    return buildStealthSettingsPanel(BdApi, this);
  }

  injectCSS() {
    BdApi.DOM.addStyle(STEALTH_STYLE_ID, STEALTH_SETTINGS_CSS);
  }
};

attachStealthStatusPolicyMethods(module.exports);
