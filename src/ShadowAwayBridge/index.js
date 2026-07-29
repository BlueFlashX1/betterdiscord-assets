/**
 * @name ShadowAwayBridge
 * @description Signed local bridge between BetterDiscord and shadow-away-bot for away state and return detection.
 * @version 1.1.0
 * @author Solo Leveling Theme Dev
 * @source https://github.com/matthewqilanthompson/betterdiscord-assets
 *
 * DE-BUNDLED 2026-07-13: this file is reconstructed real source. The previous
 * src/ShadowAwayBridge/runtime.js was a committed esbuild bundle of an old
 * plugins/ output, carrying frozen June-07 copies of shared/settings, debug,
 * dispatcher, warn-once and dom-bus — fixes to the real shared/ modules never
 * reached this plugin (the dispatcher API had already drifted). It now
 * requires the live shared modules like every other plugin.
 *
 * Removed in the same pass (dead since the "widget removed by preference"
 * decision — the bot's slash-command/report flow replaced it): the channel-
 * header widget, its CSS/observer/reinject machinery, the badge poll, and the
 * widget-only digest flow (peek_pending_digest / consume_pending_digest +
 * report modals). The old always-on 12s poll is replaced by a retry interval
 * that exists ONLY while a return signal is actually queued.
 *
 * What remains — the actual bridge:
 *   - MESSAGE_CREATE watcher: first plain outbound text message you send
 *     fires a signed `user_back_online` event to shadow-away-bot's local
 *     HTTP endpoint (services/bridgeServer.js, default 127.0.0.1:8787).
 *   - Settings-panel actions: away_on / away_off / manual return signal.
 *   - Transport: HMAC-SHA256(secret, timestamp.nonce.payload) signing,
 *     server clock-skew hint retry, offline queueing with reconnect toasts.
 */

"use strict";

const { loadSettings, saveSettings } = require("../shared/settings");
const { mixinDebug } = require("../shared/debug");
const { pollForDispatcher } = require("../shared/dispatcher");
const { createWarnOnce } = require("../shared/warn-once");

const PLUGIN_ID = "ShadowAwayBridge";

// Retry cadence for a QUEUED return signal (bridge was unreachable). The
// interval only exists while a signal is queued — zero idle timers otherwise.
const QUEUED_SIGNAL_RETRY_MS = 15000;

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

// Canonical form is what gets signed — must stay byte-identical to what
// shadow-away-bot's bridgeServer reconstructs for verification.
function buildCanonicalPayload(eventType, payload) {
  return JSON.stringify({
    eventType: String(eventType || ""),
    payload: payload && typeof payload === "object" ? payload : {},
  });
}

const TEXT_ENCODER = typeof TextEncoder === "function" ? new TextEncoder() : null;

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getNodeCrypto() {
  try {
    const nodeCrypto = require("node:crypto");
    if (nodeCrypto?.createHmac && nodeCrypto?.randomBytes) return nodeCrypto;
  } catch (_) {}
  try {
    const fallbackCrypto = require("crypto");
    if (fallbackCrypto?.createHmac && fallbackCrypto?.randomBytes) return fallbackCrypto;
  } catch (_) {}
  return null;
}

function createNonce() {
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto) return nodeCrypto.randomBytes(12).toString("hex");
  const webCrypto = globalThis?.crypto ?? null;
  if (webCrypto?.getRandomValues) {
    const nonceBytes = new Uint8Array(12);
    webCrypto.getRandomValues(nonceBytes);
    return bytesToHex(nonceBytes);
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`;
}

async function signBridgePayload(secret, timestampMs, nonce, canonicalPayload) {
  const toSign = `${timestampMs}.${nonce}.${canonicalPayload}`;
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto) {
    return nodeCrypto.createHmac("sha256", secret).update(toSign, "utf8").digest("hex");
  }
  const subtle = globalThis?.crypto?.subtle ?? null;
  if (!subtle || !TEXT_ENCODER) return null;
  const key = await subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await subtle.sign("HMAC", key, TEXT_ENCODER.encode(toSign));
  return bytesToHex(new Uint8Array(signatureBuffer));
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
    this._SelectedGuildStore = null;
    this._SelectedChannelStore = null;
    this._lastReturnSignalMs = 0;
    this._lastBridgeErrorToastMs = 0;
    this._clockOffsetMs = 0;
    this._bridgeOffline = false;
    this._queuedReturnSignal = null;
    this._queuedReturnSignalToastShown = false;
    this._queuedSignalRetryTimer = null;
    this._queuedSignalRetryInFlight = false;
  }

  // ── Settings ──────────────────────────────────────────────────────────

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

  // ── Store helpers ─────────────────────────────────────────────────────

  _getCurrentUserId() {
    try {
      this._UserStore = this._UserStore || BdApi.Webpack.getStore("UserStore");
      return this._UserStore?.getCurrentUser?.()?.id || null;
    } catch (_) {
      return null;
    }
  }

  _getSelectedContext() {
    try {
      this._SelectedGuildStore = this._SelectedGuildStore || BdApi.Webpack.getStore("SelectedGuildStore");
      this._SelectedChannelStore = this._SelectedChannelStore || BdApi.Webpack.getStore("SelectedChannelStore");
      return {
        guildId: this._SelectedGuildStore?.getGuildId?.() || null,
        channelId: this._SelectedChannelStore?.getChannelId?.() || null,
      };
    } catch (_) {
      return { guildId: null, channelId: null };
    }
  }

  _extractMessage(payload) {
    const msg = payload?.message;
    if (!msg || typeof msg !== "object") return null;
    return msg;
  }

  _extractMessageScope(msg, payload) {
    return {
      guildId: msg.guild_id || payload?.guildId || null,
      channelId: msg.channel_id || payload?.channelId || null,
    };
  }

  _isPlainOutboundTextMessage(msg, myUserId) {
    if (!msg || msg.author?.id !== myUserId) return false;
    if (msg.author?.bot) return false;
    const content = String(msg.content || "").trim();
    if (!content) return false;
    if (content.startsWith("/")) return false;
    return true;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  start() {
    if (!this._isStopped) this.stop();
    this._isStopped = false;
    this._lastReturnSignalMs = 0;
    this._setupDispatcher();
    this.debugLog("START", "ShadowAwayBridge started");
  }

  stop() {
    this._isStopped = true;
    this._stopQueuedSignalRetry();
    this._teardownDispatcher();
    this._queuedReturnSignal = null;
    this._queuedReturnSignalToastShown = false;
    this._UserStore = null;
    this._SelectedGuildStore = null;
    this._SelectedChannelStore = null;
    this.debugLog("STOP", "ShadowAwayBridge stopped");
  }

  _setupDispatcher() {
    // shared/dispatcher pollForDispatcher (live API: backoff + timeout; the
    // old frozen copy used interval/maxAttempts). onAcquired also fires on
    // the sync fast-path; _subscribeDispatcher's guard makes that idempotent.
    const result = pollForDispatcher({
      timeout: 30000,
      onAcquired: (dispatcher) => {
        if (this._isStopped) return;
        this._Dispatcher = dispatcher;
        this._subscribeDispatcher();
      },
      onTimeout: () => {
        this._warnOnce(
          "dispatcher-timeout",
          "[ShadowAwayBridge] Dispatcher not found after 30s; auto return bridge disabled until reload."
        );
      },
    });
    this._dispatcherPollCancel = result.cancel || null;
  }

  _teardownDispatcher() {
    if (typeof this._dispatcherPollCancel === "function") {
      try { this._dispatcherPollCancel(); } catch (_) {}
    }
    this._dispatcherPollCancel = null;
    if (this._Dispatcher && this._handleMessageCreate) {
      try { this._Dispatcher.unsubscribe("MESSAGE_CREATE", this._handleMessageCreate); } catch (_) {}
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

  // ── Bridge connectivity + return-signal queue ─────────────────────────

  _clampClockOffsetMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-900000, Math.min(900000, Math.floor(n)));
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
    this._startQueuedSignalRetry();
  }

  // Retry timer exists ONLY while a signal is queued (replaces the old
  // always-on 12s badge poll that doubled as the retry loop).
  _startQueuedSignalRetry() {
    if (this._queuedSignalRetryTimer) return;
    this._queuedSignalRetryInFlight = false;
    this._queuedSignalRetryTimer = setInterval(async () => {
      if (document.hidden || this._queuedSignalRetryInFlight) return;
      this._queuedSignalRetryInFlight = true;
      try {
        await this._flushQueuedReturnSignal();
      } catch (_) {
        /* non-critical — retried next tick */
      } finally {
        this._queuedSignalRetryInFlight = false;
      }
      if (!this._queuedReturnSignal) this._stopQueuedSignalRetry();
    }, QUEUED_SIGNAL_RETRY_MS);
  }

  _stopQueuedSignalRetry() {
    if (!this._queuedSignalRetryTimer) return;
    clearInterval(this._queuedSignalRetryTimer);
    this._queuedSignalRetryTimer = null;
    this._queuedSignalRetryInFlight = false;
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

  // ── Transport + signing ───────────────────────────────────────────────

  async _sendBridgeEvent(eventType, payload, options = {}) {
    if (!this.settings.enabled) return { ok: false, reason: "bridge_disabled" };
    const allowClockRetry = options.allowClockRetry !== false;
    const url = String(this.settings.bridgeUrl || "").trim();
    const secret = String(this.settings.bridgeSecret || "");
    if (!url) return { ok: false, reason: "missing_bridge_url" };
    if (!secret) return { ok: false, reason: "missing_bridge_secret" };

    const timestampMs = Date.now() + this._clockOffsetMs;
    const nonce = createNonce();
    const canonicalPayload = buildCanonicalPayload(eventType, payload);
    const signature = await signBridgePayload(secret, timestampMs, nonce, canonicalPayload);
    if (!signature) return { ok: false, reason: "hmac_unavailable" };

    const requestBody = JSON.stringify({ timestampMs, nonce, signature, eventType, payload });
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort?.(), this.settings.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
        signal: controller?.signal,
      });
      let responseJson = null;
      try { responseJson = await response.json(); } catch (_) {}
      if (!response.ok) {
        const failed = { ok: false, reason: "bridge_http_error", status: response.status, response: responseJson };
        // Server clock hint: one signed retry with the corrected offset.
        if (allowClockRetry && response.status === 401 && responseJson?.error === "timestamp_out_of_range") {
          const serverTimeMs = Number(responseJson?.serverTimeMs);
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
      const failed = { ok: false, reason: "bridge_request_failed", error: error?.message || String(error) };
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

  // ── Auto return detection ─────────────────────────────────────────────

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

    const returnPayload = { ownerUserId: myUserId, guildId, channelId, messageId: msg.id || null };
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

  // ── Settings UI ───────────────────────────────────────────────────────

  _createRow(labelText) {
    const row = document.createElement("div");
    row.style.cssText = "margin-bottom:12px;";
    const label = document.createElement("label");
    label.textContent = labelText;
    label.style.cssText = "display:block;margin-bottom:6px;font-weight:600;color:#dcddde;";
    row.appendChild(label);
    return row;
  }

  _createCheckbox(labelText, key) {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;color:#dcddde;cursor:pointer;";
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
    const row = this._createRow(labelText);
    const input = document.createElement("input");
    input.type = type;
    input.value = String(this.settings[key] || "");
    input.placeholder = placeholder;
    input.style.cssText = "width:100%;padding:8px;border-radius:2px;border:1px solid rgba(138, 43, 226, 0.4);background:rgba(0,0,0,0.3);color:#dcddde;";
    input.addEventListener("change", () => {
      this.settings[key] = input.value;
      this._persistSettings();
    });
    row.appendChild(input);
    return row;
  }

  _createNumberInput(labelText, key, { min, max, step = 1 } = {}) {
    const row = this._createRow(labelText);
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(this.settings[key]);
    input.style.cssText = "width:100%;padding:8px;border-radius:2px;border:1px solid rgba(138, 43, 226, 0.4);background:rgba(0,0,0,0.3);color:#dcddde;";
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
    btn.style.cssText = "padding:8px 10px;border-radius:2px;border:1px solid rgba(138, 43, 226, 0.4);background:rgba(138, 43, 226, 0.2);color:#dcddde;cursor:pointer;";
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      Promise.resolve(onClick()).catch((error) => {
        this._notifyBridgeFailure(
          { reason: "action_failed", error: error?.message || String(error) },
          { action: text }
        );
      });
    });
    return btn;
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.cssText = "padding:12px;background:rgba(10, 10, 16, 0.98);border:1px solid rgba(138, 43, 226, 0.4);border-radius:2px;color:#dcddde;";
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
    panel.appendChild(this._createNumberInput("Request Timeout (ms)", "requestTimeoutMs", { min: 500, max: 15000, step: 100 }));
    panel.appendChild(this._createNumberInput("Minimum Return Signal Gap (ms)", "minReturnSignalGapMs", { min: 1000, max: 3600000, step: 1000 }));
    panel.appendChild(this._createTextInput("Away Status Text", "statusText", { placeholder: "is currently away." }));
    const actions = document.createElement("div");
    actions.style.cssText = "margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;";
    actions.appendChild(this._createActionButton("Send Away On", () => this._sendAwayOn()));
    actions.appendChild(this._createActionButton("Send Away Off", () => this._sendAwayOff()));
    actions.appendChild(this._createActionButton("Send Return Signal", () => this._sendManualReturnSignal()));
    panel.appendChild(actions);
    const note = document.createElement("div");
    note.style.cssText = "margin-top:12px;font-size:12px;line-height:1.4;color:#b5bac1;";
    note.textContent = "Bridge events are signed with HMAC-SHA256 and sent only to the configured local bridge URL.";
    panel.appendChild(note);
    return panel;
  }
};
