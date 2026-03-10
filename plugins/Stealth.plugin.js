/**
 * @name Stealth
 * @description Total concealment: suppress typing, force invisible, suppress idle detection, hide activities, erase telemetry, and neutralize tracking.
 * @version 2.1.1
 * @author matthewthompson
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/shared/bd-module-loader.js
var require_bd_module_loader = __commonJS({
  "src/shared/bd-module-loader.js"(exports2, module2) {
    function loadBdModuleFromPlugins2(fileName) {
      if (!fileName) return null;
      try {
        const fs = require("fs");
        const path = require("path");
        const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), "utf8");
        const moduleObj = { exports: {} };
        const factory = new Function(
          "module",
          "exports",
          "require",
          "BdApi",
          `${source}
return module.exports || exports || null;`
        );
        const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
        const candidate = loaded || moduleObj.exports;
        if (typeof candidate === "function") return candidate;
        if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) {
          return candidate;
        }
      } catch (_) {
      }
      return null;
    }
    module2.exports = {
      loadBdModuleFromPlugins: loadBdModuleFromPlugins2
    };
  }
});

// src/shared/toast.js
var require_toast = __commonJS({
  "src/shared/toast.js"(exports2, module2) {
    function createToast2() {
      return (message, type = "info") => {
        BdApi.UI.showToast(message, {
          type: type === "level-up" ? "info" : type
        });
      };
    }
    module2.exports = { createToast: createToast2 };
  }
});

// src/Stealth/settings-panel.js
var require_settings_panel = __commonJS({
  "src/Stealth/settings-panel.js"(exports2, module2) {
    function buildStealthSettingsPanel2(BdApi2, plugin) {
      const React = BdApi2.React;
      const rowStyle = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)"
      };
      const labelWrapStyle = {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        flex: 1
      };
      const titleStyle = {
        color: "#e9d5ff",
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 700,
        fontSize: "13px",
        letterSpacing: "0.04em"
      };
      const descStyle = {
        color: "rgba(220, 220, 230, 0.72)",
        fontSize: "12px",
        lineHeight: 1.3
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
            background: "linear-gradient(135deg, rgba(32, 15, 52, 0.7), rgba(12, 8, 20, 0.8))"
          }
        },
        React.createElement(
          "div",
          {
            style: {
              color: "#c084fc",
              fontFamily: "'Orbitron', sans-serif",
              fontSize: "14px",
              fontWeight: 700,
              marginBottom: "6px"
            }
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
        const [checked, setChecked] = React.useState(Boolean(plugin.settings[settingKey]));
        React.useEffect(() => {
          setChecked(Boolean(plugin.settings[settingKey]));
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
              plugin._setSetting(settingKey, value);
            }
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
            lineHeight: 1.4
          }
        },
        `Patched methods: typing ${plugin._patchMetrics.typing}, activities ${plugin._patchMetrics.activities}, telemetry ${plugin._patchMetrics.telemetry}, @silent ${plugin._patchMetrics.silent}, process ${plugin._patchMetrics.process}, readReceipts ${plugin._patchMetrics.readReceipts}`
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
            color: "#d4d4dc"
          }
        },
        React.createElement(Header),
        React.createElement(SettingRow, {
          settingKey: "enabled",
          title: "Master Stealth",
          description: "Global toggle for all stealth suppression rules."
        }),
        React.createElement(SettingRow, {
          settingKey: "suppressTyping",
          title: "Conceal Typing",
          description: "Blocks outbound typing indicators so others do not see when you are typing."
        }),
        React.createElement(SettingRow, {
          settingKey: "invisibleStatus",
          title: "Force Invisible Status",
          description: "Automatically keeps your presence status set to Invisible."
        }),
        React.createElement(SettingRow, {
          settingKey: "suppressActivities",
          title: "Hide Activity Updates",
          description: "Suppresses outbound activity updates (custom status / game activity module calls)."
        }),
        React.createElement(SettingRow, {
          settingKey: "suppressTelemetry",
          title: "Erase Tracking Footprints",
          description: "Blocks analytics tracking and disables Sentry telemetry hooks where possible."
        }),
        React.createElement(SettingRow, {
          settingKey: "disableProcessMonitor",
          title: "Sever Process Monitor",
          description: "Stops observed-game callbacks and suppresses Discord RPC game process monitoring."
        }),
        React.createElement(SettingRow, {
          settingKey: "suppressIdle",
          title: "Suppress Idle Detection",
          description: "Blocks idle/AFK state transitions that can leak presence information."
        }),
        React.createElement(SettingRow, {
          settingKey: "autoSilentMessages",
          title: "Silent Whisper (@silent)",
          description: "Prefixes normal text messages with @silent automatically (slash commands are skipped)."
        }),
        React.createElement(SettingRow, {
          settingKey: "suppressReadReceipts",
          title: "Block Read Receipts",
          description: "Blocks outbound read acknowledgments - channels/DMs never mark as read for other users."
        }),
        React.createElement(SettingRow, {
          settingKey: "restoreStatusOnStop",
          title: "Restore Previous Status",
          description: "When disabled/stopped, revert to your pre-stealth status if captured."
        }),
        React.createElement(SettingRow, {
          settingKey: "showToasts",
          title: "Show Toasts",
          description: "Display stealth on/off and warning toasts."
        }),
        React.createElement(Metrics)
      );
      return React.createElement(Panel);
    }
    module2.exports = { buildStealthSettingsPanel: buildStealthSettingsPanel2 };
  }
});

// src/Stealth/styles.js
var require_styles = __commonJS({
  "src/Stealth/styles.js"(exports2, module2) {
    var STEALTH_SETTINGS_CSS2 = `
.sl-stealth-settings input[type="checkbox"] {
  cursor: pointer;
}

.sl-stealth-settings input[type="checkbox"]:focus-visible {
  outline: 2px solid rgba(168, 85, 247, 0.9);
  outline-offset: 2px;
  border-radius: 2px;
}
`;
    module2.exports = { STEALTH_SETTINGS_CSS: STEALTH_SETTINGS_CSS2 };
  }
});

// src/Stealth/status-setters.js
var require_status_setters = __commonJS({
  "src/Stealth/status-setters.js"(exports2, module2) {
    function attachStealthStatusSetterMethods(StealthClass) {
      Object.assign(StealthClass.prototype, {
        _resolveStatusSetters() {
          const candidates = [];
          const add = (module3, fnName) => {
            if (!module3 || typeof module3[fnName] !== "function") return;
            candidates.push({ module: module3, fnName });
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
          const seen = /* @__PURE__ */ new WeakMap();
          candidates.forEach((entry) => {
            const { module: module3, fnName } = entry;
            if (!seen.has(module3)) {
              seen.set(module3, /* @__PURE__ */ new Set());
            }
            const fnSet = seen.get(module3);
            if (fnSet.has(fnName)) return;
            fnSet.add(fnName);
            unique.push(entry);
          });
          return unique;
        },
        _setStatus(status) {
          if (!status) return false;
          if (!Array.isArray(this._statusSetters) || this._statusSetters.length === 0) {
            this._statusSetters = this._resolveStatusSetters();
          }
          let lastError = null;
          for (const entry of this._statusSetters) {
            const { module: module3, fnName } = entry;
            try {
              if (fnName === "setPresence") {
                try {
                  module3[fnName].call(module3, { status });
                } catch (presenceError) {
                  this._logWarning("STATUS", "setPresence({status}) failed, trying plain string", presenceError, "status-presence-obj");
                  module3[fnName].call(module3, status);
                }
                return true;
              }
              if (fnName === "updateStatus") {
                module3[fnName].call(module3, status);
                return true;
              }
              module3[fnName].call(module3, status);
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
      });
    }
    module2.exports = { attachStealthStatusSetterMethods };
  }
});

// src/Stealth/status-proto.js
var require_status_proto = __commonJS({
  "src/Stealth/status-proto.js"(exports2, module2) {
    var STEALTH_PLUGIN_ID2 = "Stealth";
    function attachStealthStatusProtoMethods(StealthClass) {
      Object.assign(StealthClass.prototype, {
        /** Find Discord's PreloadedUserSettings proto module.
         *  This is the REAL status-change mechanism in modern Discord —
         *  updateAsync("status", cb) is what the UI status picker calls. */
        _initProtoUtils() {
          var _a;
          try {
            const allProtos = [];
            BdApi.Webpack.getModule((exp) => {
              try {
                if (typeof exp.updateAsync === "function") allProtos.push(exp);
              } catch (e) {
              }
              return false;
            }, { searchExports: true });
            for (const p of allProtos) {
              try {
                if (String(((_a = p.ProtoClass) == null ? void 0 : _a.typeName) || "").includes("PreloadedUserSettings")) {
                  this._protoUtils = p;
                  if (this.settings.debugMode) console.log("[Stealth] Proto settings acquired (PreloadedUserSettings)");
                  return;
                }
              } catch (e) {
              }
            }
            if (this.settings.debugMode) console.warn("[Stealth] All strategies failed \u2014 no proto with 'status' field found");
          } catch (err) {
            this._logWarning("STATUS", "Failed to find PreloadedUserSettings proto module", err, "proto-init");
          }
        },
        /** Patch updateAsync so ANY status change via the proto system
         *  (including Discord's own UI status picker) gets forced to invisible.
         *  Proto status enum: 0=unset, 1=online, 2=idle, 3=dnd, 4=invisible */
        _patchProtoStatusUpdate() {
          if (!this._protoUtils || typeof this._protoUtils.updateAsync !== "function") {
            this._logWarning("STATUS", "Proto utils unavailable \u2014 cannot intercept proto status changes", null, "proto-patch-skip");
            return;
          }
          BdApi.Patcher.before(STEALTH_PLUGIN_ID2, this._protoUtils, "updateAsync", (_ctx, args) => {
            if (!this.settings.enabled || !this.settings.invisibleStatus) return;
            if (args[0] === "status" && typeof args[1] === "function") {
              const originalCallback = args[1];
              args[1] = (data) => {
                originalCallback(data);
                if (data == null ? void 0 : data.status) {
                  data.status.value = "invisible";
                }
              };
            }
          });
        },
        /** Direct proto call to set status to invisible — used by _ensureInvisibleStatus
         *  as primary method, with legacy setStatus as fallback. */
        _setStatusViaProto(statusString) {
          if (!this._protoUtils || typeof this._protoUtils.updateAsync !== "function") return false;
          try {
            this._protoUtils.updateAsync("status", (data) => {
              if (data == null ? void 0 : data.status) {
                data.status.value = statusString;
              }
            }, 0);
            return true;
          } catch (err) {
            this._logWarning("STATUS", "Proto updateAsync call failed", err, "proto-set");
            return false;
          }
        }
      });
    }
    module2.exports = { attachStealthStatusProtoMethods };
  }
});

// src/Stealth/status-policy.js
var require_status_policy = __commonJS({
  "src/Stealth/status-policy.js"(exports2, module2) {
    var { attachStealthStatusSetterMethods } = require_status_setters();
    var { attachStealthStatusProtoMethods } = require_status_proto();
    function attachStealthStatusPolicyMethods2(StealthClass) {
      attachStealthStatusSetterMethods(StealthClass);
      attachStealthStatusProtoMethods(StealthClass);
      Object.assign(StealthClass.prototype, {
        _syncStatusPolicy() {
          const shouldForceInvisible = this.settings.enabled && this.settings.invisibleStatus;
          if (!shouldForceInvisible) {
            if (this._forcedInvisible) {
              this._restoreOriginalStatus();
              this._forcedInvisible = false;
            }
            return;
          }
          const forced = this._ensureInvisibleStatus();
          if (!forced && this.settings.showToasts) {
            this._toast("Stealth: could not force Invisible status", "warning");
          }
        },
        _ensureInvisibleStatus() {
          const current = this._getCurrentStatus();
          if (current && current !== "invisible" && !this._originalStatus) {
            this._originalStatus = current;
          }
          if (current === "invisible") {
            this._forcedInvisible = true;
            return true;
          }
          if (this._setStatusViaProto("invisible")) {
            this._forcedInvisible = true;
            return true;
          }
          const updated = this._setStatus("invisible");
          if (updated) {
            this._forcedInvisible = true;
          }
          return updated;
        },
        _restoreOriginalStatus() {
          if (!this._originalStatus) return;
          this._setStatusViaProto(this._originalStatus);
          this._setStatus(this._originalStatus);
          this._originalStatus = null;
        },
        _getCurrentStatus() {
          var _a, _b, _c;
          try {
            const user = (_b = (_a = this._stores.user) == null ? void 0 : _a.getCurrentUser) == null ? void 0 : _b.call(_a);
            const userId = user == null ? void 0 : user.id;
            if (userId && ((_c = this._stores.presence) == null ? void 0 : _c.getStatus)) {
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
      });
    }
    module2.exports = { attachStealthStatusPolicyMethods: attachStealthStatusPolicyMethods2 };
  }
});

// src/Stealth/index.js
var { loadBdModuleFromPlugins } = require_bd_module_loader();
var _PluginUtils;
try {
  _PluginUtils = loadBdModuleFromPlugins("BetterDiscordPluginUtils.js");
} catch (_) {
  _PluginUtils = null;
}
var { createToast } = require_toast();
var { buildStealthSettingsPanel } = require_settings_panel();
var { STEALTH_SETTINGS_CSS } = require_styles();
var { attachStealthStatusPolicyMethods } = require_status_policy();
var STEALTH_PLUGIN_ID = "Stealth";
var STEALTH_STYLE_ID = "stealth-plugin-css";
var DEFAULT_SETTINGS = {
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
  debugMode: false
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
    this._fluxHandlers = /* @__PURE__ */ new Map();
    this._stores = {
      user: null,
      presence: null
    };
    this._patchMetrics = {
      typing: 0,
      activities: 0,
      telemetry: 0,
      silent: 0,
      process: 0,
      readReceipts: 0
    };
    this._suppressEventLog = {
      typing: 0,
      activities: 0,
      telemetry: 0,
      idle: 0,
      silent: 0,
      readReceipts: 0
    };
    this._warningTimestamps = /* @__PURE__ */ new Map();
    this._protoUtils = null;
    this._sentryDisabled = false;
    this._pendingTimers = /* @__PURE__ */ new Set();
  }
  _toast(message, type = "info", timeout = null) {
    var _a;
    if (!this.settings.showToasts) return;
    (_a = this._toastImpl) == null ? void 0 : _a.call(this, message, type, timeout);
  }
  // ── Lifecycle + Settings ───────────────────────────────────────────────
  start() {
    var _a;
    this._toastImpl = ((_a = _PluginUtils == null ? void 0 : _PluginUtils.createToastHelper) == null ? void 0 : _a.call(_PluginUtils, "stealth")) || ((message, type = "info", timeout = null) => {
      const p = (() => {
        var _a2;
        try {
          const plugin = BdApi.Plugins.get("SoloLevelingToasts");
          return ((_a2 = plugin == null ? void 0 : plugin.instance) == null ? void 0 : _a2.toastEngineVersion) >= 2 ? plugin.instance : null;
        } catch (_) {
          return null;
        }
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
      readReceipts: 0
    };
    this._installPatches();
    this._statusSetters = this._resolveStatusSetters();
    this._syncStatusPolicy();
    this._toast("Stealth engaged", "success");
  }
  _scheduleTimer(fn, delay) {
    const tid = setTimeout(() => {
      this._pendingTimers.delete(tid);
      fn();
    }, delay);
    this._pendingTimers.add(tid);
  }
  stop() {
    for (const tid of this._pendingTimers) clearTimeout(tid);
    this._pendingTimers.clear();
    this._unsubscribeFluxEvents();
    if (this._dispatcherPollTimer) {
      clearInterval(this._dispatcherPollTimer);
      this._dispatcherPollTimer = null;
    }
    this._sentryDisabled = false;
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
      if (typeof (_PluginUtils == null ? void 0 : _PluginUtils.loadSettings) === "function") {
        this.settings = _PluginUtils.loadSettings(STEALTH_PLUGIN_ID, DEFAULT_SETTINGS);
      } else {
        const saved = BdApi.Data.load(STEALTH_PLUGIN_ID, "settings");
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...saved && typeof saved === "object" ? saved : {}
        };
      }
    } catch (error) {
      this._logWarning("SETTINGS", "Failed to load settings; using defaults", error, "settings-load");
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }
  saveSettings() {
    try {
      if (typeof (_PluginUtils == null ? void 0 : _PluginUtils.saveSettings) === "function") {
        _PluginUtils.saveSettings(STEALTH_PLUGIN_ID, this.settings);
      } else {
        BdApi.Data.save(STEALTH_PLUGIN_ID, "settings", this.settings);
      }
    } catch (error) {
      this._logWarning("SETTINGS", "Failed to persist settings", error, "settings-save");
    }
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
    var _a, _b, _c;
    const { Webpack } = BdApi;
    this._Dispatcher = ((_a = _PluginUtils == null ? void 0 : _PluginUtils.getDispatcher) == null ? void 0 : _a.call(_PluginUtils)) || ((_c = (_b = Webpack.Stores) == null ? void 0 : _b.UserStore) == null ? void 0 : _c._dispatcher) || Webpack.getModule((m) => m.dispatch && m.subscribe) || null;
    if (this._Dispatcher) {
      this._subscribeFluxEvents();
      return;
    }
    let attempt = 0;
    this._dispatcherPollTimer = setInterval(() => {
      var _a2, _b2, _c2;
      attempt++;
      this._Dispatcher = ((_a2 = _PluginUtils == null ? void 0 : _PluginUtils.getDispatcher) == null ? void 0 : _a2.call(_PluginUtils)) || ((_c2 = (_b2 = Webpack.Stores) == null ? void 0 : _b2.UserStore) == null ? void 0 : _c2._dispatcher) || Webpack.getModule((m) => m.dispatch && m.subscribe) || null;
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
          this._scheduleTimer(() => this._ensureInvisibleStatus(), 1e3);
        }
      },
      // Fires when user changes status via Discord's UI status picker
      USER_SETTINGS_PROTO_UPDATE: () => {
        if (!this.settings.enabled || !this.settings.invisibleStatus) return;
        this._scheduleTimer(() => this._ensureInvisibleStatus(), 300);
      }
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
    try {
      const typingModule = BdApi.Webpack.getByKeys("startTyping", "stopTyping") || BdApi.Webpack.getByKeys("startTyping");
      if (typingModule && typeof typingModule.startTyping === "function") {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          typingModule,
          "startTyping",
          (ctx, args, original) => {
            if (this.settings.enabled && this.settings.suppressTyping) {
              this._recordSuppressed("typing");
              return void 0;
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
              return void 0;
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
      "stopTyping"
    ];
    const keyCombos = [
      ["startTyping", "stopTyping"],
      ["sendTyping", "stopTyping"],
      ["startTyping"],
      ["sendTyping"]
    ];
    patched += this._patchFunctions({
      fnNames,
      keyCombos,
      shouldBlock: () => this.settings.enabled && this.settings.suppressTyping,
      onBlocked: () => this._recordSuppressed("typing"),
      tag: "typing",
      blockedReturnValue: void 0
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
      "setNowPlaying"
    ];
    const keyCombos = [
      ["setActivity"],
      ["setLocalActivity"],
      ["setCustomStatus"],
      ["setRichPresence"],
      ["setGame"]
    ];
    const patched = this._patchFunctions({
      fnNames,
      keyCombos,
      shouldBlock: () => this.settings.enabled && this.settings.suppressActivities,
      onBlocked: () => this._recordSuppressed("activities"),
      tag: "activities",
      blockedReturnValue: void 0
    });
    this._patchMetrics.activities = patched;
  }
  _patchTelemetry() {
    let patched = 0;
    try {
      const analytics = BdApi.Webpack.getByKeys("AnalyticEventConfigs");
      if ((analytics == null ? void 0 : analytics.default) && typeof analytics.default.track === "function") {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          analytics.default,
          "track",
          (ctx, args, original) => {
            if (this.settings.enabled && this.settings.suppressTelemetry) {
              this._recordSuppressed("telemetry");
              return void 0;
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
      const nativeModule = BdApi.Webpack.getByKeys("getDiscordUtils", "ensureModule") || BdApi.Webpack.getByKeys("ensureModule");
      if (nativeModule && typeof nativeModule.ensureModule === "function") {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          nativeModule,
          "ensureModule",
          (ctx, args, original) => {
            const moduleName = args == null ? void 0 : args[0];
            if (this.settings.enabled && this.settings.disableProcessMonitor && typeof moduleName === "string" && moduleName.includes("discord_rpc")) {
              return void 0;
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
          const message = args == null ? void 0 : args[1];
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
    const ackFnNames = ["ack", "bulkAck", "ackChannel"];
    const ackKeyCombos = [
      ["ack", "bulkAck"],
      ["ack", "ackChannel"],
      ["ack"]
    ];
    patched += this._patchFunctions({
      fnNames: ackFnNames,
      keyCombos: ackKeyCombos,
      shouldBlock: () => this.settings.enabled && this.settings.suppressReadReceipts,
      onBlocked: () => this._recordSuppressed("readReceipts"),
      tag: "readReceipts",
      blockedReturnValue: Promise.resolve()
    });
    try {
      const markReadModule = BdApi.Webpack.getByKeys("markRead") || BdApi.Webpack.getByKeys("ackMessages");
      if (markReadModule) {
        for (const fn of ["markRead", "ackMessages"]) {
          if (typeof markReadModule[fn] === "function") {
            BdApi.Patcher.instead(
              STEALTH_PLUGIN_ID,
              markReadModule,
              fn,
              (ctx, args, original) => {
                if (this.settings.enabled && this.settings.suppressReadReceipts) {
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
    if (!this.settings.enabled) return;
    if (this.settings.suppressTelemetry) this._disableSentryAndTelemetry();
    if (this.settings.disableProcessMonitor) this._disableProcessMonitor();
  }
  _disableSentryAndTelemetry() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s;
    if (this._sentryDisabled) return;
    try {
      (_d = (_a = window == null ? void 0 : window.__SENTRY__) == null ? void 0 : _a.globalEventProcessors) == null ? void 0 : _d.splice(
        0,
        ((_c = (_b = window == null ? void 0 : window.__SENTRY__) == null ? void 0 : _b.globalEventProcessors) == null ? void 0 : _c.length) || 0
      );
      (_g = (_f = (_e = window == null ? void 0 : window.__SENTRY__) == null ? void 0 : _e.logger) == null ? void 0 : _f.disable) == null ? void 0 : _g.call(_f);
      const sentryHub = (_i = (_h = window == null ? void 0 : window.DiscordSentry) == null ? void 0 : _h.getCurrentHub) == null ? void 0 : _i.call(_h);
      if (sentryHub) {
        (_l = (_k = (_j = sentryHub.getClient) == null ? void 0 : _j.call(sentryHub)) == null ? void 0 : _k.close) == null ? void 0 : _l.call(_k, 0);
        const scope = (_m = sentryHub.getScope) == null ? void 0 : _m.call(sentryHub);
        (_n = scope == null ? void 0 : scope.clear) == null ? void 0 : _n.call(scope);
        (_o = scope == null ? void 0 : scope.setFingerprint) == null ? void 0 : _o.call(scope, null);
        (_p = sentryHub.setUser) == null ? void 0 : _p.call(sentryHub, null);
        (_q = sentryHub.setTags) == null ? void 0 : _q.call(sentryHub, {});
        (_r = sentryHub.setExtras) == null ? void 0 : _r.call(sentryHub, {});
        (_s = sentryHub.endSession) == null ? void 0 : _s.call(sentryHub);
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
    var _a, _b;
    let patched = 0;
    try {
      const settingsManager = BdApi.Webpack.getModule(
        (m) => (m == null ? void 0 : m.updateAsync) && (m == null ? void 0 : m.type) === 1,
        { searchExports: true }
      );
      const boolSetting = BdApi.Webpack.getModule(
        (m) => {
          var _a2;
          return (_a2 = m == null ? void 0 : m.typeName) == null ? void 0 : _a2.includes("Bool");
        },
        { searchExports: true }
      );
      settingsManager == null ? void 0 : settingsManager.updateAsync(
        "status",
        (settings) => {
          settings.showCurrentGame = (boolSetting == null ? void 0 : boolSetting.create) ? boolSetting.create({ value: false }) : false;
        },
        0
      );
    } catch (error) {
      this._logWarning("PROCESS", "Failed to force disable current-game visibility", error, "process-status");
    }
    try {
      const nativeModule = BdApi.Webpack.getByKeys("getDiscordUtils");
      const discordUtils = (_a = nativeModule == null ? void 0 : nativeModule.getDiscordUtils) == null ? void 0 : _a.call(nativeModule);
      if (!discordUtils) {
        this._patchMetrics.process = Math.max(this._patchMetrics.process, patched);
        return;
      }
      (_b = discordUtils.setObservedGamesCallback) == null ? void 0 : _b.call(discordUtils, [], () => {
      });
      if (typeof discordUtils.setObservedGamesCallback === "function" && !this._processMonitorPatched) {
        BdApi.Patcher.instead(
          STEALTH_PLUGIN_ID,
          discordUtils,
          "setObservedGamesCallback",
          () => void 0
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
    const seen = /* @__PURE__ */ new Set();
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
    const staleBefore = now - 5 * 60 * 1e3;
    for (const [mapKey, timestamp] of this._warningTimestamps) {
      if (timestamp < staleBefore) this._warningTimestamps.delete(mapKey);
      if (this._warningTimestamps.size <= targetSize) return;
    }
    while (this._warningTimestamps.size > targetSize) {
      const oldestKey = this._warningTimestamps.keys().next().value;
      if (oldestKey === void 0) break;
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
    const throttleMs = 15e3;
    if (this._shouldThrottleWarning(key, now, throttleMs)) return;
    if (this._warningTimestamps.size > 256) this._trimWarningTimestamps(now);
    this._printWarning(scope, message, error);
  }
  _recordSuppressed(kind) {
    const now = Date.now();
    const last = this._suppressEventLog[kind] || 0;
    if (now - last < 3e3) return;
    this._suppressEventLog[kind] = now;
  }
  _isStatusPolicySetting(key) {
    return key === "enabled" || key === "invisibleStatus";
  }
  _handleStatusPolicySettingChange(key) {
    this._syncStatusPolicy();
    this._applyStealthHardening();
    if (key !== "enabled") return;
    this._toast(
      this.settings.enabled ? "Stealth engaged" : "Stealth disengaged",
      this.settings.enabled ? "success" : "info"
    );
  }
  _shouldReapplyHardeningForSetting(key) {
    return (key === "suppressTelemetry" || key === "disableProcessMonitor") && this.settings.enabled;
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
