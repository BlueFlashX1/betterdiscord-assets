/**
 * @name Stealth
 * @description Conceal presence by suppressing typing, forcing invisible status, blocking read receipts, and hiding activity updates.
 * @version 1.0.0
 * @author matthewthompson
 */

const STEALTH_PLUGIN_ID = "Stealth";
const STEALTH_STYLE_ID = "stealth-plugin-css";

const DEFAULT_SETTINGS = {
  enabled: true,
  suppressTyping: true,
  invisibleStatus: true,
  suppressReadReceipts: true,
  suppressActivities: true,
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

    this._stores = {
      user: null,
      presence: null,
    };

    this._patchMetrics = {
      typing: 0,
      receipts: 0,
      activities: 0,
    };

    this._suppressEventLog = {
      typing: 0,
      receipts: 0,
      activities: 0,
    };

    this._warningTimestamps = new Map();
  }

  start() {
    this.loadSettings();
    this.injectCSS();
    this._initStores();

    this._installPatches();
    this._syncStatusPolicy();

    this._toast("Stealth engaged", "success");
  }

  stop() {
    this._stopStatusInterval();

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
      this._stores.user =
        BdApi.Webpack.getStore?.("UserStore") ||
        BdApi.Webpack.getModule((m) => m && typeof m.getCurrentUser === "function");

      this._stores.presence =
        BdApi.Webpack.getStore?.("PresenceStore") ||
        BdApi.Webpack.getModule((m) => m && typeof m.getStatus === "function");
    } catch (error) {
      this._logWarning("WEBPACK", "Failed to initialize User/Presence stores", error, "stores-init");
    }
  }

  _installPatches() {
    this._patchTypingIndicators();
    this._patchReadReceipts();
    this._patchActivityUpdates();
  }

  _patchTypingIndicators() {
    const fnNames = [
      "startTyping",
      "sendTyping",
      "sendTypingStart",
      "triggerTyping",
      "startTypingNow",
    ];

    const keyCombos = [
      ["startTyping", "stopTyping"],
      ["sendTyping", "stopTyping"],
      ["startTyping"],
      ["sendTyping"],
    ];

    const patched = this._patchFunctions({
      fnNames,
      keyCombos,
      shouldBlock: () => this.settings.enabled && this.settings.suppressTyping,
      onBlocked: () => this._recordSuppressed("typing"),
      tag: "typing",
      blockedReturnValue: undefined,
    });

    this._patchMetrics.typing = patched;
  }

  _patchReadReceipts() {
    const fnNames = [
      "ack",
      "ackChannel",
      "ackMessageId",
      "bulkAck",
      "markRead",
      "markChannelRead",
      "readStateAck",
      "markGuildAsRead",
    ];

    const keyCombos = [
      ["ack", "bulkAck"],
      ["ack", "ackChannel"],
      ["markRead", "markChannelRead"],
      ["ackMessageId", "ack"],
      ["ack"],
    ];

    const patched = this._patchFunctions({
      fnNames,
      keyCombos,
      shouldBlock: () => this.settings.enabled && this.settings.suppressReadReceipts,
      onBlocked: () => this._recordSuppressed("receipts"),
      tag: "receipts",
      blockedReturnValue: undefined,
    });

    this._patchMetrics.receipts = patched;
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
      }, 15000);
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
          } catch (_error) {
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

      if (key === "enabled") {
        this._toast(
          this.settings.enabled ? "Stealth engaged" : "Stealth disengaged",
          this.settings.enabled ? "success" : "info"
        );
      }
      return;
    }

    if (key === "showToasts") return;

    if (key === "restoreStatusOnStop" && !this.settings.restoreStatusOnStop) {
      this._originalStatus = null;
      return;
    }
  }

  _toast(message, type = "info") {
    if (!this.settings.showToasts) return;

    if (typeof BdApi.showToast === "function") {
      BdApi.showToast(message, { type, timeout: 2500 });
      return;
    }

    if (typeof BdApi.UI?.showToast === "function") {
      BdApi.UI.showToast(message, { type, timeout: 2500 });
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
        "Shadow Stealth"
      ),
      React.createElement(
        "div",
        { style: { color: "rgba(226, 232, 240, 0.82)", fontSize: "12px", lineHeight: 1.35 } },
        "Conceal your presence: typing, status, read-state, and activity broadcasts. Read receipt suppression can keep channels unread on your side."
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
      `Patched methods: typing ${self._patchMetrics.typing}, read receipts ${self._patchMetrics.receipts}, activities ${self._patchMetrics.activities}`
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
        settingKey: "suppressReadReceipts",
        title: "Suppress Read Receipts",
        description: "Blocks read acknowledgements (side effect: some channels stay unread locally).",
      }),
      React.createElement(SettingRow, {
        settingKey: "suppressActivities",
        title: "Hide Activity Updates",
        description: "Suppresses outbound activity updates (custom status / game activity module calls).",
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
