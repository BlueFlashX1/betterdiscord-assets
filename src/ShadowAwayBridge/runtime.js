/**
 * @name ShadowAwayBridge
 * @description Signed local bridge between BetterDiscord and shadow-away-bot for away state and return detection.
 * @version 1.0.0
 * @author Solo Leveling Theme Dev
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// plugins/ShadowAwayBridge.plugin.js
var require_ShadowAwayBridge_plugin = __commonJS({
  "plugins/ShadowAwayBridge.plugin.js"(exports2, module2) {
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __commonJS2 = (cb, mod) => function __require() {
      return mod || (0, cb[__getOwnPropNames2(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    };
    var require_settings = __commonJS2({
      "src/shared/settings.js"(exports22, module22) {
        function loadSettings2(pluginId, defaults, key = "settings") {
          try {
            return { ...defaults, ...BdApi.Data.load(pluginId, key) || {} };
          } catch (_) {
            return { ...defaults };
          }
        }
        function saveSettings2(pluginId, settings, key = "settings") {
          try {
            BdApi.Data.save(pluginId, key, settings);
          } catch (_) {
          }
        }
        module22.exports = { loadSettings: loadSettings2, saveSettings: saveSettings2 };
      }
    });
    var require_debug = __commonJS2({
      "src/shared/debug.js"(exports22, module22) {
        function mixinDebug2(plugin, pluginName) {
          plugin.debugLog = function debugLog(tagOrMessage, messageOrData = null, data = null) {
            if (!this._debugMode) return;
            if (messageOrData === null) {
              console.log(`[${pluginName}]`, tagOrMessage);
            } else if (data === null) {
              console.log(`[${pluginName}][${tagOrMessage}]`, messageOrData);
            } else {
              console.log(`[${pluginName}][${tagOrMessage}]`, messageOrData, data);
            }
          };
          plugin.debugError = function debugError(tagOrMessage, messageOrError = null, error = null) {
            if (!this._debugMode) return;
            if (messageOrError === null) {
              console.error(`[${pluginName}]`, tagOrMessage);
            } else if (error === null) {
              console.error(`[${pluginName}][${tagOrMessage}]`, messageOrError);
            } else {
              console.error(`[${pluginName}][${tagOrMessage}]`, messageOrError, error);
            }
          };
        }
        module22.exports = { mixinDebug: mixinDebug2 };
      }
    });
    var require_dispatcher = __commonJS2({
      "src/shared/dispatcher.js"(exports22, module22) {
        var { Webpack } = BdApi;
        function acquireDispatcher() {
          var _a, _b;
          return ((_b = (_a = Webpack.Stores) == null ? void 0 : _a.UserStore) == null ? void 0 : _b._dispatcher) || Webpack.getModule((m) => m.dispatch && m.subscribe) || Webpack.getByKeys("actionLogger") || null;
        }
        function pollForDispatcher2(options = {}) {
          const { interval = 500, maxAttempts = 30, onAcquired, onTimeout } = options;
          const immediate = acquireDispatcher();
          if (immediate) {
            onAcquired == null ? void 0 : onAcquired(immediate);
            return { dispatcher: immediate, cancel: () => {
            } };
          }
          let attempt = 0;
          let timer = null;
          const cancel = () => {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
          };
          const tryAcquire = () => {
            attempt++;
            const dispatcher = acquireDispatcher();
            if (dispatcher) {
              timer = null;
              onAcquired == null ? void 0 : onAcquired(dispatcher);
              return;
            }
            if (attempt >= maxAttempts) {
              timer = null;
              onTimeout == null ? void 0 : onTimeout();
              return;
            }
            timer = setTimeout(tryAcquire, interval);
          };
          timer = setTimeout(tryAcquire, interval);
          return { dispatcher: null, cancel };
        }
        module22.exports = { acquireDispatcher, pollForDispatcher: pollForDispatcher2 };
      }
    });
    var require_warn_once = __commonJS2({
      "src/shared/warn-once.js"(exports22, module22) {
        function createWarnOnce2() {
          const warned = /* @__PURE__ */ new Set();
          return (key, message, detail = null) => {
            if (warned.has(key)) return;
            warned.add(key);
            detail !== null ? console.warn(message, detail) : console.warn(message);
          };
        }
        module22.exports = { createWarnOnce: createWarnOnce2 };
      }
    });
    var crypto = require("crypto");
    var { loadSettings, saveSettings } = require_settings();
    var { mixinDebug } = require_debug();
    var { pollForDispatcher } = require_dispatcher();
    var { createWarnOnce } = require_warn_once();
    var PLUGIN_ID = "ShadowAwayBridge";
    var HEADER_WIDGET_ID = "shadowaway-bridge-toolbar-widget";
    var HEADER_WIDGET_STYLE_ID = "shadowaway-bridge-toolbar-css";
    var HEADER_WIDGET_REINJECT_DELAY_MS = 120;
    var HEADER_WIDGET_BADGE_POLL_MS = 12e3;
    var HEADER_TOOLBAR_FALLBACKS = [
      '[aria-label="Channel header"] [class*="toolbar_"]',
      '[class*="titleWrapper_"] [class*="toolbar_"]',
      'header [class*="toolbar_"]'
    ];
    var DEFAULT_SETTINGS = {
      enabled: true,
      debugMode: false,
      bridgeUrl: "http://127.0.0.1:8787/shadowaway/bridge",
      bridgeSecret: "",
      requestTimeoutMs: 3e3,
      autoReturnOnOutboundMessage: true,
      minReturnSignalGapMs: 6e4,
      statusText: "is currently away.",
      toastOnBridgeError: true
    };
    function clampInt(value, min, max, fallback) {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, Math.floor(n)));
    }
    function normalizeStatusText(value) {
      const text = String(value || "").trim().replace(/\s+/g, " ");
      return text.slice(0, 300) || "is currently away.";
    }
    function buildCanonicalPayload(eventType, payload) {
      return JSON.stringify({
        eventType: String(eventType || ""),
        payload: payload && typeof payload === "object" ? payload : {}
      });
    }
    var TEXT_ENCODER = typeof TextEncoder === "function" ? new TextEncoder() : null;
    function bytesToHex(bytes) {
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    function getNodeCrypto() {
      try {
        if (crypto && typeof crypto.createHmac === "function" && typeof crypto.randomBytes === "function") {
          return crypto;
        }
      } catch (_) {
      }
      try {
        const nodeCrypto = require("node:crypto");
        if (nodeCrypto && typeof nodeCrypto.createHmac === "function" && typeof nodeCrypto.randomBytes === "function") {
          return nodeCrypto;
        }
      } catch (_) {
      }
      try {
        const fallbackCrypto = require("crypto");
        if (fallbackCrypto && typeof fallbackCrypto.createHmac === "function" && typeof fallbackCrypto.randomBytes === "function") {
          return fallbackCrypto;
        }
      } catch (_) {
      }
      return null;
    }
    function createNonce() {
      var _a;
      const nodeCrypto = getNodeCrypto();
      if (nodeCrypto) return nodeCrypto.randomBytes(12).toString("hex");
      const webCrypto = (_a = globalThis == null ? void 0 : globalThis.crypto) != null ? _a : null;
      if (webCrypto == null ? void 0 : webCrypto.getRandomValues) {
        const nonceBytes = new Uint8Array(12);
        webCrypto.getRandomValues(nonceBytes);
        return bytesToHex(nonceBytes);
      }
      return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`;
    }
    async function signBridgePayload(secret, timestampMs, nonce, canonicalPayload) {
      var _a, _b;
      const toSign = `${timestampMs}.${nonce}.${canonicalPayload}`;
      const nodeCrypto = getNodeCrypto();
      if (nodeCrypto) {
        return nodeCrypto.createHmac("sha256", secret).update(toSign, "utf8").digest("hex");
      }
      const subtle = (_b = (_a = globalThis == null ? void 0 : globalThis.crypto) == null ? void 0 : _a.subtle) != null ? _b : null;
      if (!subtle || !TEXT_ENCODER) return null;
      const secretBytes = TEXT_ENCODER.encode(secret);
      const messageBytes = TEXT_ENCODER.encode(toSign);
      const key = await subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const signatureBuffer = await subtle.sign("HMAC", key, messageBytes);
      return bytesToHex(new Uint8Array(signatureBuffer));
    }
    module2.exports = class ShadowAwayBridge {
      constructor() {
        this.settings = loadSettings(PLUGIN_ID, DEFAULT_SETTINGS);
        this._normalizeSettingsInPlace();
        this._debugMode = !!this.settings.debugMode;
        mixinDebug(this, PLUGIN_ID);
        this._warnOnce = createWarnOnce();
        this._isStopped = true;
        this._Dispatcher = null;
        this._dispatcherPollCancel = null;
        this._handleMessageCreate = null;
        this._UserStore = null;
        this._lastReturnSignalMs = 0;
        this._lastBridgeErrorToastMs = 0;
        this._headerObserver = null;
        this._headerReinjectTimeout = null;
        this._headerRouteListener = null;
        this._headerWidgetBusy = false;
        this._headerBadgePollTimer = null;
        this._clockOffsetMs = 0;
        this._bridgeOffline = false;
        this._queuedReturnSignal = null;
        this._queuedReturnSignalToastShown = false;
      }
      // ==========================================================================
      // 1) CONSTANTS + SETTINGS
      // ==========================================================================
      _normalizeSettingsInPlace() {
        this.settings.requestTimeoutMs = clampInt(this.settings.requestTimeoutMs, 500, 15e3, 3e3);
        this.settings.minReturnSignalGapMs = clampInt(this.settings.minReturnSignalGapMs, 1e3, 36e5, 6e4);
        this.settings.statusText = normalizeStatusText(this.settings.statusText);
        this.settings.bridgeUrl = String(this.settings.bridgeUrl || "").trim();
        this.settings.bridgeSecret = String(this.settings.bridgeSecret || "");
      }
      _persistSettings() {
        this._normalizeSettingsInPlace();
        this._debugMode = !!this.settings.debugMode;
        saveSettings(PLUGIN_ID, this.settings);
      }
      _getCurrentUserId() {
        var _a, _b;
        try {
          this._UserStore = this._UserStore || BdApi.Webpack.getStore("UserStore");
          const user = (_b = (_a = this._UserStore) == null ? void 0 : _a.getCurrentUser) == null ? void 0 : _b.call(_a);
          return (user == null ? void 0 : user.id) || null;
        } catch (_) {
          return null;
        }
      }
      _extractMessage(payload) {
        const msg = payload == null ? void 0 : payload.message;
        if (!msg || typeof msg !== "object") return null;
        return msg;
      }
      _extractMessageScope(msg, payload) {
        const guildId = msg.guild_id || (payload == null ? void 0 : payload.guildId) || null;
        const channelId = msg.channel_id || (payload == null ? void 0 : payload.channelId) || null;
        return { guildId, channelId };
      }
      _isPlainOutboundTextMessage(msg, myUserId) {
        var _a, _b;
        if (!msg || ((_a = msg.author) == null ? void 0 : _a.id) !== myUserId) return false;
        if ((_b = msg.author) == null ? void 0 : _b.bot) return false;
        const content = String(msg.content || "").trim();
        if (!content) return false;
        if (content.startsWith("/")) return false;
        return true;
      }
      _getSelectedContext() {
        var _a, _b;
        try {
          const selectedGuildStore = BdApi.Webpack.getStore("SelectedGuildStore");
          const selectedChannelStore = BdApi.Webpack.getStore("SelectedChannelStore");
          const guildId = ((_a = selectedGuildStore == null ? void 0 : selectedGuildStore.getGuildId) == null ? void 0 : _a.call(selectedGuildStore)) || null;
          const channelId = ((_b = selectedChannelStore == null ? void 0 : selectedChannelStore.getChannelId) == null ? void 0 : _b.call(selectedChannelStore)) || null;
          return { guildId, channelId };
        } catch (_) {
          return { guildId: null, channelId: null };
        }
      }
      // ==========================================================================
      // 2) LIFECYCLE + DISPATCHER WIRING
      // ==========================================================================
      start() {
        if (!this._isStopped) this.stop();
        this._isStopped = false;
        this._lastReturnSignalMs = 0;
        // Widget icon removed by preference; rely on slash-command/report flow instead.
        this._teardownHeaderWidget();
        this._removeHeaderWidgetStyles();
        this._startHeaderBadgePolling();
        this._setupDispatcher();
        this.debugLog("START", "ShadowAwayBridge started");
      }
      stop() {
        this._isStopped = true;
        this._stopHeaderBadgePolling();
        this._teardownHeaderWidget();
        this._removeHeaderWidgetStyles();
        this._teardownDispatcher();
        this.debugLog("STOP", "ShadowAwayBridge stopped");
      }
      _setupDispatcher() {
        const result = pollForDispatcher({
          interval: 500,
          maxAttempts: 30,
          onAcquired: (dispatcher) => {
            if (this._isStopped) return;
            this._Dispatcher = dispatcher;
            this._subscribeDispatcher();
          },
          onTimeout: () => {
            this._warnOnce(
              "dispatcher-timeout",
              "[ShadowAwayBridge] Dispatcher not found after 15s; auto return bridge disabled until reload."
            );
          }
        });
        this._dispatcherPollCancel = result.cancel || null;
        if (result.dispatcher) {
          this._Dispatcher = result.dispatcher;
          this._subscribeDispatcher();
        }
      }
      _teardownDispatcher() {
        if (typeof this._dispatcherPollCancel === "function") {
          try {
            this._dispatcherPollCancel();
          } catch (_) {
          }
        }
        this._dispatcherPollCancel = null;
        if (this._Dispatcher && this._handleMessageCreate) {
          try {
            this._Dispatcher.unsubscribe("MESSAGE_CREATE", this._handleMessageCreate);
          } catch (_) {
          }
        }
        this._handleMessageCreate = null;
        this._Dispatcher = null;
      }
      _subscribeDispatcher() {
        if (!this._Dispatcher) return;
        if (this._handleMessageCreate) return;
        this._handleMessageCreate = (payload) => this._onMessageCreate(payload);
        try {
          this._Dispatcher.subscribe("MESSAGE_CREATE", this._handleMessageCreate);
          this.debugLog("DISPATCHER", "Subscribed to MESSAGE_CREATE");
        } catch (error) {
          this._handleMessageCreate = null;
          this.debugError("DISPATCHER", "Failed to subscribe MESSAGE_CREATE", error);
        }
      }
      _clampClockOffsetMs(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        return Math.max(-9e5, Math.min(9e5, Math.floor(n)));
      }
      _isBridgeTemporaryFailure(result) {
        if (!result || result.ok) return false;
        if (result.reason === "bridge_request_failed") return true;
        if (result.reason === "bridge_http_error" && (result.status >= 500 || result.status === 429)) return true;
        return false;
      }
      _setBridgeConnectivity(isOnline, context = {}) {
        const wasOffline = this._bridgeOffline;
        this._bridgeOffline = !isOnline;
        if (wasOffline && isOnline) {
          BdApi.UI.showToast("[ShadowAwayBridge] Bridge reconnected.", { type: "success" });
          this.debugLog("BRIDGE", "Bridge connectivity restored", context);
        } else if (!isOnline && !wasOffline) {
          this.debugLog("BRIDGE", "Bridge connectivity degraded", context);
        }
      }
      _queueReturnSignal(payload, context = {}) {
        this._queuedReturnSignal = payload;
        if (!this._queuedReturnSignalToastShown) {
          this._queuedReturnSignalToastShown = true;
          BdApi.UI.showToast("[ShadowAwayBridge] Return signal queued; retrying when bridge is reachable.", { type: "warning" });
        }
        this.debugLog("RETURN_SIGNAL", "Queued return signal for retry", context);
      }
      async _flushQueuedReturnSignal() {
        if (this._isStopped || !this._queuedReturnSignal) return false;
        const queuedPayload = this._queuedReturnSignal;
        const result = await this._sendBridgeEvent("user_back_online", queuedPayload, { allowClockRetry: true });
        if (result.ok) {
          this._queuedReturnSignal = null;
          this._queuedReturnSignalToastShown = false;
          BdApi.UI.showToast("[ShadowAwayBridge] Queued return signal sent.", { type: "success" });
          this.debugLog("RETURN_SIGNAL", "Flushed queued return signal", { status: result.status });
          return true;
        }
        if (!this._isBridgeTemporaryFailure(result)) {
          this._queuedReturnSignal = null;
          this._queuedReturnSignalToastShown = false;
          this._notifyBridgeFailure(result, { eventType: "user_back_online_queued" });
          return false;
        }
        return false;
      }
      // ==========================================================================
      // 3) BRIDGE TRANSPORT + SIGNING
      // ==========================================================================
      async _sendBridgeEvent(eventType, payload, options = {}) {
        if (!this.settings.enabled) {
          return { ok: false, reason: "bridge_disabled" };
        }
        const allowClockRetry = options.allowClockRetry !== false;
        const url = String(this.settings.bridgeUrl || "").trim();
        const secret = String(this.settings.bridgeSecret || "");
        if (!url) {
          return { ok: false, reason: "missing_bridge_url" };
        }
        if (!secret) {
          return { ok: false, reason: "missing_bridge_secret" };
        }
        const timestampMs = Date.now() + this._clockOffsetMs;
        const nonce = createNonce();
        const canonicalPayload = buildCanonicalPayload(eventType, payload);
        const signature = await signBridgePayload(secret, timestampMs, nonce, canonicalPayload);
        if (!signature) {
          return { ok: false, reason: "hmac_unavailable" };
        }
        const requestBody = JSON.stringify({
          timestampMs,
          nonce,
          signature,
          eventType,
          payload
        });
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const timeoutMs = this.settings.requestTimeoutMs;
        const timer = setTimeout(() => {
          var _a;
          return (_a = controller == null ? void 0 : controller.abort) == null ? void 0 : _a.call(controller);
        }, timeoutMs);
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: requestBody,
            signal: controller == null ? void 0 : controller.signal
          });
          let responseJson = null;
          try {
            responseJson = await response.json();
          } catch (_) {
          }
          if (!response.ok) {
            const failed = {
              ok: false,
              reason: "bridge_http_error",
              status: response.status,
              response: responseJson
            };
            if (allowClockRetry && response.status === 401 && (responseJson == null ? void 0 : responseJson.error) === "timestamp_out_of_range") {
              const serverTimeMs = Number(responseJson == null ? void 0 : responseJson.serverTimeMs);
              if (Number.isFinite(serverTimeMs)) {
                this._clockOffsetMs = this._clampClockOffsetMs(serverTimeMs - Date.now());
                this.debugLog("CLOCK", "Applied bridge server clock hint", { offsetMs: this._clockOffsetMs });
                return this._sendBridgeEvent(eventType, payload, { ...options, allowClockRetry: false });
              }
            }
            if (this._isBridgeTemporaryFailure(failed)) {
              this._setBridgeConnectivity(false, { eventType, status: response.status });
            }
            return failed;
          }
          this._setBridgeConnectivity(true, { eventType, status: response.status });
          return { ok: true, status: response.status, response: responseJson };
        } catch (error) {
          const failed = { ok: false, reason: "bridge_request_failed", error: (error == null ? void 0 : error.message) || String(error) };
          this._setBridgeConnectivity(false, { eventType, error: failed.error });
          return failed;
        } finally {
          clearTimeout(timer);
        }
      }
      _notifyBridgeFailure(result, context = {}) {
        this.debugError("BRIDGE", "Bridge event failed", { result, ...context });
        if (!this.settings.toastOnBridgeError) return;
        const now = Date.now();
        if (now - this._lastBridgeErrorToastMs < 1e4) return;
        this._lastBridgeErrorToastMs = now;
        BdApi.UI.showToast(
          `[ShadowAwayBridge] Bridge request failed (${(result == null ? void 0 : result.reason) || "unknown_error"}).`,
          { type: "warning" }
        );
      }
      async _sendEventWithFeedback(eventType, payload, successMessage) {
        const result = await this._sendBridgeEvent(eventType, payload);
        if (!result.ok) {
          this._notifyBridgeFailure(result, { eventType });
          return false;
        }
        BdApi.UI.showToast(successMessage, { type: "success" });
        this.debugLog("BRIDGE", "Bridge event accepted", { eventType, status: result.status });
        return true;
      }
      // ==========================================================================
      // 4) AUTO RETURN DETECTION
      // ==========================================================================
      async _onMessageCreate(payload) {
        if (this._isStopped) return;
        if (!this.settings.enabled || !this.settings.autoReturnOnOutboundMessage) return;
        const msg = this._extractMessage(payload);
        if (!msg) return;
        const myUserId = this._getCurrentUserId();
        if (!myUserId) return;
        if (!this._isPlainOutboundTextMessage(msg, myUserId)) return;
        const { guildId, channelId } = this._extractMessageScope(msg, payload);
        if (!guildId || !channelId) return;
        const now = Date.now();
        if (now - this._lastReturnSignalMs < this.settings.minReturnSignalGapMs) return;
        this._lastReturnSignalMs = now;
        const returnPayload = {
          ownerUserId: myUserId,
          guildId,
          channelId,
          messageId: msg.id || null
        };
        const result = await this._sendBridgeEvent("user_back_online", returnPayload);
        if (!result.ok) {
          if (this._isBridgeTemporaryFailure(result)) {
            this._queueReturnSignal(returnPayload, { guildId, channelId, messageId: msg.id || null });
            return;
          }
          this._notifyBridgeFailure(result, { eventType: "user_back_online" });
          return;
        }
        this.debugLog("RETURN_SIGNAL", "Sent user_back_online bridge signal", {
          guildId,
          channelId,
          messageId: msg.id || null,
          status: result.status
        });
      }
      async _sendAwayOn() {
        const myUserId = this._getCurrentUserId();
        const statusText = normalizeStatusText(this.settings.statusText);
        return this._sendEventWithFeedback(
          "away_on",
          { ownerUserId: myUserId, statusText },
          "Shadow away mode enabled via bridge."
        );
      }
      async _sendAwayOff() {
        const myUserId = this._getCurrentUserId();
        return this._sendEventWithFeedback(
          "away_off",
          { ownerUserId: myUserId },
          "Shadow away mode disabled via bridge."
        );
      }
      async _sendManualReturnSignal() {
        const myUserId = this._getCurrentUserId();
        const { guildId, channelId } = this._getSelectedContext();
        if (!guildId || !channelId) {
          BdApi.UI.showToast("Open a guild text channel before sending a manual return signal.", { type: "warning" });
          return false;
        }
        return this._sendEventWithFeedback(
          "user_back_online",
          { ownerUserId: myUserId, guildId, channelId },
          "Manual return signal sent via bridge."
        );
      }
      // ==========================================================================
      // 5) CHANNEL HEADER WIDGET + PRIVATE DIGEST VIEW
      // ==========================================================================
      _injectHeaderWidgetStyles() {
        const css = `
#${HEADER_WIDGET_ID} {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--interactive-normal, #b5bac1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-left: 8px;
  transition: color 140ms ease, opacity 140ms ease;
  position: relative;
  padding: 0;
  outline: none !important;
  -webkit-appearance: none;
  appearance: none;
}
#${HEADER_WIDGET_ID}:hover {
  background: transparent !important;
  color: var(--interactive-hover, #ffffff);
}
#${HEADER_WIDGET_ID}.sab-toolbar-widget--busy {
  opacity: 0.6;
  pointer-events: none;
}
#${HEADER_WIDGET_ID}.sab-toolbar-widget--offline {
  border: none !important;
  background: transparent !important;
  color: var(--interactive-muted, #949ba4);
}
#${HEADER_WIDGET_ID}:focus,
#${HEADER_WIDGET_ID}:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}
#${HEADER_WIDGET_ID} .sab-toolbar-widget__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
#${HEADER_WIDGET_ID} .sab-toolbar-widget__icon svg {
  width: 20px;
  height: 20px;
  display: block;
}
#${HEADER_WIDGET_ID} .sab-toolbar-widget__count {
  position: absolute;
  top: -6px;
  right: -7px;
  min-width: 15px;
  height: 15px;
  border-radius: 999px;
  padding: 0 4px;
  background: #d2485f;
  color: #fff;
  border: 1px solid rgba(13, 16, 22, 0.92);
  font-size: 10px;
  line-height: 13px;
  text-align: center;
  font-weight: 700;
  display: none;
}
#${HEADER_WIDGET_ID}.sab-toolbar-widget--has-count .sab-toolbar-widget__count {
  display: inline-block;
}
#${HEADER_WIDGET_ID} .sab-toolbar-widget__delivery {
  position: absolute;
  bottom: -4px;
  left: -4px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #37b26d;
  border: 1px solid rgba(13, 16, 22, 0.92);
  display: none;
}
#${HEADER_WIDGET_ID}.sab-toolbar-widget--has-delivery .sab-toolbar-widget__delivery {
  display: inline-block;
}
.sab-shadow-report-modal {
  max-height: 62vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}
.sab-shadow-report-row {
  background: rgba(22, 26, 33, 0.92);
  border: 1px solid rgba(142, 152, 171, 0.25);
  border-radius: 8px;
  padding: 10px;
}
.sab-shadow-report-head {
  color: #e8ecf3;
  font-weight: 700;
  margin-bottom: 6px;
}
.sab-shadow-report-text {
  color: #c7cfdb;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
}
.sab-shadow-report-links {
  margin-top: 6px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
`;
        BdApi.DOM.addStyle(HEADER_WIDGET_STYLE_ID, css);
      }
      _removeHeaderWidgetStyles() {
        BdApi.DOM.removeStyle(HEADER_WIDGET_STYLE_ID);
      }
      _getChannelHeaderToolbar() {
        for (const selector of HEADER_TOOLBAR_FALLBACKS) {
          const nodes = document.querySelectorAll(selector);
          for (const node of nodes) {
            if (!node || node.offsetParent === null) continue;
            const host = node.closest('[aria-label="Channel header"], [class*="titleWrapper_"], header');
            if (host && host.offsetParent === null) continue;
            return node;
          }
        }
        return null;
      }
      _createHeaderWidget() {
        let icon = document.getElementById(HEADER_WIDGET_ID);
        if (icon) return icon;
        icon = document.createElement("div");
        icon.id = HEADER_WIDGET_ID;
        icon.setAttribute("role", "button");
        icon.setAttribute("tabindex", "0");
        icon.setAttribute("aria-label", "Shadow Away Report");
        icon.title = "Shadow Away Report";
        icon.innerHTML = [
          '<span class="sab-toolbar-widget__icon">',
          '<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
          '<path fill="currentColor" d="M3 4.5A1.5 1.5 0 0 1 4.5 3h15A1.5 1.5 0 0 1 21 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-15Zm3.2 2.6a.8.8 0 0 0 0 1.6h11.6a.8.8 0 1 0 0-1.6H6.2Zm0 4a.8.8 0 0 0 0 1.6h7.6a.8.8 0 1 0 0-1.6H6.2Zm0 4a.8.8 0 0 0 0 1.6h5.2a.8.8 0 1 0 0-1.6H6.2Z"/>',
          "</svg>",
          "</span>",
          '<span class="sab-toolbar-widget__count" aria-hidden="true"></span>',
          '<span class="sab-toolbar-widget__delivery" aria-hidden="true"></span>'
        ].join("");
        const onClick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          this._onHeaderWidgetClick();
        };
        icon.addEventListener("click", onClick);
        icon.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          onClick(event);
        });
        return icon;
      }
      _injectHeaderWidgetNow() {
        const icon = this._createHeaderWidget();
        const toolbar = this._getChannelHeaderToolbar();
        if (!toolbar) {
          if (icon.parentElement) icon.remove();
          return false;
        }
        if (icon.parentElement !== toolbar) {
          toolbar.appendChild(icon);
        }
        return true;
      }
      _scheduleHeaderWidgetReinject(delayMs = HEADER_WIDGET_REINJECT_DELAY_MS) {
        if (this._headerReinjectTimeout) {
          clearTimeout(this._headerReinjectTimeout);
          this._headerReinjectTimeout = null;
        }
        this._headerReinjectTimeout = setTimeout(() => {
          this._headerReinjectTimeout = null;
          if (this._isStopped) return;
          this._injectHeaderWidgetNow();
          this._refreshHeaderWidgetBadge();
        }, delayMs);
      }
      _setupHeaderWidget() {
        this._injectHeaderWidgetNow();
        if (this._headerObserver) return;
        this._headerObserver = new MutationObserver(() => {
          this._scheduleHeaderWidgetReinject(80);
        });
        try {
          // PERF: Scope observer to toolbar area instead of document.body
          // to avoid firing on every DOM mutation in Discord
          const toolbar = document.querySelector('[class*="toolbar_"]')
            || document.querySelector('[class*="headerBar_"]');
          const observeTarget = toolbar?.parentElement || document.querySelector('[class*="title_"]')?.closest('[class*="container_"]') || document.body;
          this._headerObserver.observe(observeTarget, {
            childList: true,
            subtree: observeTarget !== document.body
          });
        } catch (_) {
          this._headerObserver = null;
        }
        this._headerRouteListener = () => this._scheduleHeaderWidgetReinject(80);
        window.addEventListener("resize", this._headerRouteListener, { passive: true });
        window.addEventListener("hashchange", this._headerRouteListener, { passive: true });
        this._scheduleHeaderWidgetReinject(80);
        this._refreshHeaderWidgetBadge();
      }
      _teardownHeaderWidget() {
        if (this._headerObserver) {
          try {
            this._headerObserver.disconnect();
          } catch (_) {
          }
        }
        this._headerObserver = null;
        if (this._headerRouteListener) {
          window.removeEventListener("resize", this._headerRouteListener);
          window.removeEventListener("hashchange", this._headerRouteListener);
        }
        this._headerRouteListener = null;
        if (this._headerReinjectTimeout) {
          clearTimeout(this._headerReinjectTimeout);
          this._headerReinjectTimeout = null;
        }
        const icon = document.getElementById(HEADER_WIDGET_ID);
        if (icon) icon.remove();
        this._headerWidgetBusy = false;
      }
      _setHeaderWidgetVisualState(state) {
        const icon = document.getElementById(HEADER_WIDGET_ID);
        if (!icon) return;
        const countEl = icon.querySelector(".sab-toolbar-widget__count");
        if (!countEl) return;
        const mentionCount = Number((state == null ? void 0 : state.mentionCount) || 0);
        const hasPending = Boolean((state == null ? void 0 : state.hasPending) && mentionCount > 0);
        const hasDelivered = Boolean(state == null ? void 0 : state.hasDelivered);
        const offline = Boolean((state == null ? void 0 : state.offline) || this._bridgeOffline);
        const lockedToChannel = Boolean(state == null ? void 0 : state.lockedToChannel);
        const inSelectedChannel = Boolean(state == null ? void 0 : state.inSelectedChannel);
        icon.classList.toggle("sab-toolbar-widget--has-count", hasPending);
        icon.classList.toggle("sab-toolbar-widget--has-delivery", hasPending && hasDelivered);
        icon.classList.toggle("sab-toolbar-widget--offline", offline);
        const displayCount = mentionCount > 99 ? "99+" : String(mentionCount);
        countEl.textContent = hasPending ? displayCount : "";
        if (offline) {
          icon.title = "Shadow Away Report (bridge offline)";
          return;
        }
        if (!hasPending) {
          icon.title = "Shadow Away Report";
          return;
        }
        if (lockedToChannel && !inSelectedChannel) {
          icon.title = `Shadow Away Report (${displayCount}) locked to return channel`;
          return;
        }
        icon.title = `Shadow Away Report (${displayCount})`;
      }
      async _refreshHeaderWidgetBadge() {
        if (this._isStopped) return;
        const myUserId = this._getCurrentUserId();
        const { guildId, channelId } = this._getSelectedContext();
        if (!myUserId || !guildId || !channelId) {
          this._setHeaderWidgetVisualState({
            hasPending: false,
            mentionCount: 0,
            hasDelivered: false
          });
          return;
        }
        const result = await this._sendBridgeEvent("peek_pending_digest", {
          ownerUserId: myUserId,
          guildId,
          channelId
        });
        if (!result.ok) {
          if (this._isBridgeTemporaryFailure(result)) {
            this._setHeaderWidgetVisualState({
              hasPending: false,
              mentionCount: 0,
              hasDelivered: false,
              offline: true
            });
          }
          this.debugLog("BADGE", "peek_pending_digest failed", { reason: result.reason });
          return;
        }
        const outcome = result.response && result.response.result ? result.response.result : null;
        if (!outcome || outcome.action !== "peek_pending_digest") return;
        this._setHeaderWidgetVisualState({ ...outcome, offline: false });
      }
      _startHeaderBadgePolling() {
        this._stopHeaderBadgePolling();
        this._headerBadgePollTimer = setInterval(async () => {
          if (document.hidden) return; // PERF: Skip when window not visible
          try {
            await this._flushQueuedReturnSignal();
            if (document.getElementById(HEADER_WIDGET_ID)) {
              await this._refreshHeaderWidgetBadge();
            }
          } catch (_) { /* badge poll — non-critical, swallow to avoid unhandled rejection every 12s */ }
        }, HEADER_WIDGET_BADGE_POLL_MS);
        Promise.resolve().then(async () => {
          await this._flushQueuedReturnSignal();
          if (document.getElementById(HEADER_WIDGET_ID)) {
            await this._refreshHeaderWidgetBadge();
          }
        });
      }
      _stopHeaderBadgePolling() {
        if (!this._headerBadgePollTimer) return;
        clearInterval(this._headerBadgePollTimer);
        this._headerBadgePollTimer = null;
      }
      async _onHeaderWidgetClick() {
        if (this._headerWidgetBusy) return;
        this._headerWidgetBusy = true;
        const icon = document.getElementById(HEADER_WIDGET_ID);
        if (icon) icon.classList.add("sab-toolbar-widget--busy");
        try {
          await this._consumePendingDigestForSelectedContext();
        } catch (error) {
          this.debugLog("WIDGET", "Header widget click failed", {
            error: (error == null ? void 0 : error.message) || String(error)
          });
          BdApi.UI.showToast("Shadow Report could not be opened right now.", { type: "warning" });
        } finally {
          this._headerWidgetBusy = false;
          if (icon) icon.classList.remove("sab-toolbar-widget--busy");
        }
      }
      async _consumePendingDigestForSelectedContext() {
        const myUserId = this._getCurrentUserId();
        if (!myUserId) {
          BdApi.UI.showToast("Unable to resolve current user for Shadow Report.", { type: "warning" });
          this._showShadowReportStatusModal(
            "Shadow Away Report",
            "Unable to resolve your current user. Please switch channels and try again."
          );
          return false;
        }
        const { guildId, channelId } = this._getSelectedContext();
        if (!guildId || !channelId) {
          BdApi.UI.showToast("Open the return guild channel to view your Shadow Report.", { type: "warning" });
          this._showShadowReportStatusModal(
            "Shadow Away Report",
            "Open the return guild text channel, then click the Shadow Away icon again."
          );
          return false;
        }
        const bridgeResult = await this._sendBridgeEvent("consume_pending_digest", {
          ownerUserId: myUserId,
          guildId,
          channelId
        });
        if (!bridgeResult.ok) {
          this._notifyBridgeFailure(bridgeResult, { eventType: "consume_pending_digest" });
          return false;
        }
        const outcome = bridgeResult.response && bridgeResult.response.result ? bridgeResult.response.result : null;
        if (!outcome || outcome.action !== "consume_pending_digest") {
          BdApi.UI.showToast("Unexpected Shadow Report bridge response.", { type: "warning" });
          this._showShadowReportStatusModal(
            "Shadow Away Report",
            "The bridge returned an unexpected response. Please try again in a moment."
          );
          return false;
        }
        if (!outcome.consumed) {
          if (outcome.reason === "no_pending_digest") {
            BdApi.UI.showToast("No pending Shadow Report right now.", { type: "info" });
            this._showShadowReportStatusModal(
              "Shadow Away Report",
              "My liege, there are no pending reports at this time."
            );
            return false;
          }
          if (outcome.reason === "locked_to_channel") {
            const expected = outcome.expectedChannelId ? `<#${outcome.expectedChannelId}>` : "the return channel";
            BdApi.UI.showToast(`Shadow Report is locked to ${expected}.`, { type: "warning" });
            this._showShadowReportStatusModal(
              "Shadow Away Report",
              `This report is locked to ${expected}. Open that channel and click the icon again.`
            );
            return false;
          }
          BdApi.UI.showToast(`Shadow Report unavailable (${outcome.reason || "unknown"}).`, { type: "warning" });
          this._showShadowReportStatusModal(
            "Shadow Away Report",
            `The report is currently unavailable (${outcome.reason || "unknown"}).`
          );
          return false;
        }
        try {
          this._showPrivateDigestModal(outcome);
        } catch (error) {
          this.debugLog("REPORT_MODAL", "Digest modal rendering failed", {
            error: (error == null ? void 0 : error.message) || String(error)
          });
          this._showShadowReportStatusModal(
            "Shadow Away Report",
            "The report was received, but the detailed modal failed to render. Check plugin logs for details."
          );
        }
        BdApi.UI.showToast(
          `Shadow Report received: ${Number(outcome.mentionCount || 0)} mention${Number(outcome.mentionCount || 0) === 1 ? "" : "s"}.`,
          { type: "success" }
        );
        this._setHeaderWidgetVisualState({
          hasPending: false,
          mentionCount: 0,
          hasDelivered: false
        });
        return true;
      }
      _renderDigestRow(entry, index) {
        const React = BdApi.React;
        const mentionText = String(entry.messageContentPreview || "(none)");
        const deliveryText = entry.deliveryMessagePreview ? String(entry.deliveryMessagePreview) : "(none)";
        const ts = entry.timestampMs ? new Date(entry.timestampMs).toLocaleString() : "Unknown";
        return React.createElement(
          "div",
          { key: `row-${index}`, className: "sab-shadow-report-row" },
          React.createElement(
            "div",
            { className: "sab-shadow-report-head" },
            `${index + 1}. ${entry.guildName || "Guild"} \u2022 #${entry.channelName || "channel"}`
          ),
          React.createElement(
            "div",
            { className: "sab-shadow-report-text" },
            `From: ${entry.triggerUserTag || entry.triggerUserId || "unknown"}
When: ${ts}
Mention: "${mentionText}"
Delivered: "${deliveryText}"`
          ),
          React.createElement(
            "div",
            { className: "sab-shadow-report-links" },
            entry.messageLink ? React.createElement("a", { href: entry.messageLink, target: "_blank", rel: "noreferrer" }, "Mention Link") : null,
            entry.deliveryMessageLink ? React.createElement("a", { href: entry.deliveryMessageLink, target: "_blank", rel: "noreferrer" }, "Delivery Link") : null
          )
        );
      }
      _showShadowReportStatusModal(title, message) {
        const React = BdApi.React;
        const safeTitle = String(title || "Shadow Away Report");
        const safeMessage = String(message || "No additional details are available.");
        if (React && BdApi.UI.showConfirmationModal) {
          try {
            const content = React.createElement(
              "div",
              { className: "sab-shadow-report-modal" },
              React.createElement("div", { className: "sab-shadow-report-text" }, safeMessage)
            );
            BdApi.UI.showConfirmationModal(safeTitle, content, {
              confirmText: "Close",
              cancelText: "Dismiss"
            });
            return;
          } catch (_) {
          }
        }
        try {
          BdApi.UI.alert(safeTitle, safeMessage);
        } catch (_) {
        }
      }
      _showPrivateDigestModal(outcome) {
        const entries = Array.isArray(outcome.entries) ? outcome.entries : [];
        const title = `Shadow Report (${entries.length}${outcome.truncated ? "+" : ""})`;
        const React = BdApi.React;
        if (!React || !BdApi.UI.showConfirmationModal) {
          const fallbackText = entries.map((entry, index) => {
            return `${index + 1}. ${entry.guildName || "Guild"} \u2022 #${entry.channelName || "channel"}
From: ${entry.triggerUserTag || entry.triggerUserId || "unknown"}
Mention: ${entry.messageContentPreview || "(none)"}
Delivery: ${entry.deliveryMessagePreview || "(none)"}
Mention Link: ${entry.messageLink || "n/a"}`;
          }).join("\n\n") || "No report entries.";
          BdApi.UI.alert(title, fallbackText);
          return;
        }
        const summary = `My liege, ${Number(outcome.mentionCount || entries.length)} mention${Number(outcome.mentionCount || entries.length) === 1 ? "" : "s"} were recorded while you were away.${outcome.truncated ? " (display capped for readability)." : ""}`;
        const content = React.createElement(
          "div",
          { className: "sab-shadow-report-modal" },
          React.createElement("div", { className: "sab-shadow-report-text" }, summary),
          ...entries.map((entry, index) => this._renderDigestRow(entry, index))
        );
        try {
          BdApi.UI.showConfirmationModal(title, content, {
            confirmText: "Close",
            cancelText: "Dismiss"
          });
        } catch (_) {
          const fallbackText = `${summary}

Open plugin debug logs if you need full raw details.`;
          BdApi.UI.alert(title, fallbackText);
        }
      }
      // ==========================================================================
      // 6) SETTINGS UI
      // ==========================================================================
      _createRow(labelText) {
        const row = document.createElement("div");
        row.style.cssText = "margin-bottom:12px;";
        const label = document.createElement("label");
        label.textContent = labelText;
        label.style.cssText = "display:block;margin-bottom:6px;font-weight:600;color:#e5e7eb;";
        row.appendChild(label);
        return { row, label };
      }
      _createCheckbox(labelText, key) {
        const row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;color:#e5e7eb;cursor:pointer;";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!this.settings[key];
        input.addEventListener("change", () => {
          this.settings[key] = !!input.checked;
          this._persistSettings();
        });
        row.appendChild(input);
        row.appendChild(document.createTextNode(labelText));
        return row;
      }
      _createTextInput(labelText, key, { placeholder = "", type = "text" } = {}) {
        const { row } = this._createRow(labelText);
        const input = document.createElement("input");
        input.type = type;
        input.value = String(this.settings[key] || "");
        input.placeholder = placeholder;
        input.style.cssText = "width:100%;padding:8px;border-radius:6px;border:1px solid #374151;background:#111827;color:#f3f4f6;";
        input.addEventListener("change", () => {
          this.settings[key] = input.value;
          this._persistSettings();
        });
        row.appendChild(input);
        return row;
      }
      _createNumberInput(labelText, key, { min, max, step = 1 } = {}) {
        const { row } = this._createRow(labelText);
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(this.settings[key]);
        input.style.cssText = "width:100%;padding:8px;border-radius:6px;border:1px solid #374151;background:#111827;color:#f3f4f6;";
        input.addEventListener("change", () => {
          this.settings[key] = Number(input.value);
          this._persistSettings();
          input.value = String(this.settings[key]);
        });
        row.appendChild(input);
        return row;
      }
      _createActionButton(text, onClick) {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.style.cssText = "padding:8px 10px;border-radius:6px;border:1px solid #374151;background:#1f2937;color:#f3f4f6;cursor:pointer;";
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          Promise.resolve(onClick()).catch((error) => {
            this._notifyBridgeFailure({ reason: "action_failed", error: (error == null ? void 0 : error.message) || String(error) }, { action: text });
          });
        });
        return btn;
      }
      getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.cssText = "padding:12px;background:#0f172a;border:1px solid #1f2937;border-radius:8px;color:#e5e7eb;";
        panel.appendChild(this._createCheckbox("Enable bridge client", "enabled"));
        panel.appendChild(this._createCheckbox("Auto-send return signal on first outbound text message", "autoReturnOnOutboundMessage"));
        panel.appendChild(this._createCheckbox("Show warning toasts when bridge fails", "toastOnBridgeError"));
        panel.appendChild(this._createCheckbox("Debug mode", "debugMode"));
        panel.appendChild(this._createTextInput("Bridge URL", "bridgeUrl", {
          placeholder: "http://127.0.0.1:8787/shadowaway/bridge"
        }));
        panel.appendChild(this._createTextInput("Bridge Secret", "bridgeSecret", {
          type: "password",
          placeholder: "Required for signed bridge requests"
        }));
        panel.appendChild(this._createNumberInput("Request Timeout (ms)", "requestTimeoutMs", {
          min: 500,
          max: 15e3,
          step: 100
        }));
        panel.appendChild(this._createNumberInput("Minimum Return Signal Gap (ms)", "minReturnSignalGapMs", {
          min: 1e3,
          max: 36e5,
          step: 1e3
        }));
        panel.appendChild(this._createTextInput("Away Status Text", "statusText", {
          placeholder: "is currently away."
        }));
        const actions = document.createElement("div");
        actions.style.cssText = "margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;";
        actions.appendChild(this._createActionButton("Send Away On", () => this._sendAwayOn()));
        actions.appendChild(this._createActionButton("Send Away Off", () => this._sendAwayOff()));
        actions.appendChild(this._createActionButton("Send Return Signal", () => this._sendManualReturnSignal()));
        panel.appendChild(actions);
        const note = document.createElement("div");
        note.style.cssText = "margin-top:12px;font-size:12px;line-height:1.4;color:#9ca3af;";
        note.textContent = "Bridge events are signed with HMAC-SHA256 and sent only to the configured local bridge URL.";
        panel.appendChild(note);
        return panel;
      }
    };
  }
});

// src/ShadowAwayBridge/index.js
module.exports = require_ShadowAwayBridge_plugin();
