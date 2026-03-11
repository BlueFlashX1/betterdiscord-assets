/**
 * TABLE OF CONTENTS
 * 1) Constants + Settings
 * 2) Lifecycle + Dispatcher Wiring
 * 3) Bridge Transport + Signing
 * 4) Auto Return Detection
 * 5) Settings UI
 */

const crypto = require("crypto");
const { loadSettings, saveSettings } = require("../shared/settings");
const { mixinDebug } = require("../shared/debug");
const { pollForDispatcher } = require("../shared/dispatcher");
const { createWarnOnce } = require("../shared/warn-once");

const PLUGIN_ID = "ShadowAwayBridge";

const DEFAULT_SETTINGS = {
  enabled: true,
  debugMode: false,
  bridgeUrl: "http://127.0.0.1:8787/shadowaway/bridge",
  bridgeSecret: "",
  requestTimeoutMs: 3000,
  autoReturnOnOutboundMessage: true,
  minReturnSignalGapMs: 60000,
  statusText: "is currently away.",
  toastOnBridgeError: true,
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
    payload: payload && typeof payload === "object" ? payload : {},
  });
}

function createNonce() {
  return crypto.randomBytes(12).toString("hex");
}

function signBridgePayload(secret, timestampMs, nonce, canonicalPayload) {
  const toSign = `${timestampMs}.${nonce}.${canonicalPayload}`;
  return crypto.createHmac("sha256", secret).update(toSign).digest("hex");
}

module.exports = class ShadowAwayBridge {
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
  }

  // ==========================================================================
  // 1) CONSTANTS + SETTINGS
  // ==========================================================================

  _normalizeSettingsInPlace() {
    this.settings.requestTimeoutMs = clampInt(this.settings.requestTimeoutMs, 500, 15000, 3000);
    this.settings.minReturnSignalGapMs = clampInt(this.settings.minReturnSignalGapMs, 1000, 3600000, 60000);
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
    try {
      this._UserStore = this._UserStore || BdApi.Webpack.getStore("UserStore");
      const user = this._UserStore?.getCurrentUser?.();
      return user?.id || null;
    } catch (_) {
      return null;
    }
  }

  _extractMessage(payload) {
    const msg = payload?.message;
    if (!msg || typeof msg !== "object") return null;
    return msg;
  }

  _extractMessageScope(msg, payload) {
    const guildId = msg.guild_id || payload?.guildId || null;
    const channelId = msg.channel_id || payload?.channelId || null;
    return { guildId, channelId };
  }

  _isCommandLikeText(input) {
    const text = String(input || "").trim();
    if (!text) return false;
    if (text.startsWith("/")) return true;

    const first = text[0];
    if ((first === "!" || first === "." || first === "?" || first === "$") && text.length > 1) {
      return true;
    }

    return /^<@!?\d+>\s+\S+/.test(text);
  }

  _isPlainOutboundTextMessage(msg, myUserId) {
    if (!msg || msg.author?.id !== myUserId) return false;
    if (msg.author?.bot) return false;

    const content = String(msg.content || "").trim();
    if (!content) return false;
    if (this._isCommandLikeText(content)) return false;

    return true;
  }

  _getSelectedContext() {
    try {
      const selectedGuildStore = BdApi.Webpack.getStore("SelectedGuildStore");
      const selectedChannelStore = BdApi.Webpack.getStore("SelectedChannelStore");
      const guildId = selectedGuildStore?.getGuildId?.() || null;
      const channelId = selectedChannelStore?.getChannelId?.() || null;
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
    this._setupDispatcher();
    this.debugLog("START", "ShadowAwayBridge started");
  }

  stop() {
    this._isStopped = true;
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
      },
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
      } catch (_) {}
    }
    this._dispatcherPollCancel = null;

    if (this._Dispatcher && this._handleMessageCreate) {
      try {
        this._Dispatcher.unsubscribe("MESSAGE_CREATE", this._handleMessageCreate);
      } catch (_) {}
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

  // ==========================================================================
  // 3) BRIDGE TRANSPORT + SIGNING
  // ==========================================================================

  async _sendBridgeEvent(eventType, payload) {
    if (!this.settings.enabled) {
      return { ok: false, reason: "bridge_disabled" };
    }

    const url = String(this.settings.bridgeUrl || "").trim();
    const secret = String(this.settings.bridgeSecret || "");

    if (!url) {
      return { ok: false, reason: "missing_bridge_url" };
    }
    if (!secret) {
      return { ok: false, reason: "missing_bridge_secret" };
    }

    const timestampMs = Date.now();
    const nonce = createNonce();
    const canonicalPayload = buildCanonicalPayload(eventType, payload);
    const signature = signBridgePayload(secret, timestampMs, nonce, canonicalPayload);
    const requestBody = JSON.stringify({
      timestampMs,
      nonce,
      signature,
      eventType,
      payload,
    });

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutMs = this.settings.requestTimeoutMs;
    const timer = setTimeout(() => controller?.abort?.(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
        signal: controller?.signal,
      });
      let responseJson = null;
      try {
        responseJson = await response.json();
      } catch (_) {
        // Ignore parse error, status code is still authoritative.
      }
      if (!response.ok) {
        return {
          ok: false,
          reason: "bridge_http_error",
          status: response.status,
          response: responseJson,
        };
      }
      return { ok: true, status: response.status, response: responseJson };
    } catch (error) {
      return { ok: false, reason: "bridge_request_failed", error: error?.message || String(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  _notifyBridgeFailure(result, context = {}) {
    this.debugError("BRIDGE", "Bridge event failed", { result, ...context });
    if (!this.settings.toastOnBridgeError) return;

    const now = Date.now();
    if (now - this._lastBridgeErrorToastMs < 10000) return;
    this._lastBridgeErrorToastMs = now;
    BdApi.UI.showToast(
      `[ShadowAwayBridge] Bridge request failed (${result?.reason || "unknown_error"}).`,
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

    const result = await this._sendBridgeEvent("user_back_online", {
      ownerUserId: myUserId,
      guildId,
      channelId,
      messageId: msg.id || null,
    });

    if (!result.ok) {
      this._notifyBridgeFailure(result, { eventType: "user_back_online" });
      return;
    }

    this.debugLog("RETURN_SIGNAL", "Sent user_back_online bridge signal", {
      guildId,
      channelId,
      messageId: msg.id || null,
      status: result.status,
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
  // 5) SETTINGS UI
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
        this._notifyBridgeFailure({ reason: "action_failed", error: error?.message || String(error) }, { action: text });
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
      placeholder: "http://127.0.0.1:8787/shadowaway/bridge",
    }));
    panel.appendChild(this._createTextInput("Bridge Secret", "bridgeSecret", {
      type: "password",
      placeholder: "Required for signed bridge requests",
    }));
    panel.appendChild(this._createNumberInput("Request Timeout (ms)", "requestTimeoutMs", {
      min: 500,
      max: 15000,
      step: 100,
    }));
    panel.appendChild(this._createNumberInput("Minimum Return Signal Gap (ms)", "minReturnSignalGapMs", {
      min: 1000,
      max: 3600000,
      step: 1000,
    }));
    panel.appendChild(this._createTextInput("Away Status Text", "statusText", {
      placeholder: "is currently away.",
    }));

    const actions = document.createElement("div");
    actions.style.cssText = "margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;";
    actions.appendChild(this._createActionButton("Send Away On", () => this._sendAwayOn()));
    actions.appendChild(this._createActionButton("Send Away Off", () => this._sendAwayOff()));
    actions.appendChild(this._createActionButton("Send Return Signal", () => this._sendManualReturnSignal()));
    panel.appendChild(actions);

    const note = document.createElement("div");
    note.style.cssText = "margin-top:12px;font-size:12px;line-height:1.4;color:#9ca3af;";
    note.textContent =
      "Bridge events are signed with HMAC-SHA256 and sent only to the configured local bridge URL.";
    panel.appendChild(note);

    return panel;
  }
};
