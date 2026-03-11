const {
  DEFAULT_TYPING_ALERT_COOLDOWN_MS,
  ONLINE_STATUSES,
  STATUS_ACCENT_COLORS,
  STATUS_LABELS,
  STATUS_TOAST_TIMEOUT_MS,
} = require("./constants");
const { createToast } = require("../shared/toast");
const _fallbackToast = createToast();

function resolveUserStore() {
  if (this._plugin._UserStore) return this._plugin._UserStore;
  try {
    this._plugin._UserStore = BdApi.Webpack.getStore("UserStore");
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Failed to resolve UserStore", err);
  }
  return this._plugin._UserStore;
}

function resolvePresenceStore() {
  if (this._plugin._PresenceStore) return this._plugin._PresenceStore;
  try {
    this._plugin._PresenceStore = BdApi.Webpack.getStore("PresenceStore");
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Failed to resolve PresenceStore", err);
  }
  return this._plugin._PresenceStore;
}

function resolveRelationshipStore() {
  if (this._plugin._RelationshipStore) return this._plugin._RelationshipStore;
  try {
    this._plugin._RelationshipStore = BdApi.Webpack.getStore("RelationshipStore");
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Failed to resolve RelationshipStore", err);
  }
  return this._plugin._RelationshipStore;
}

function normalizeStatus(status) {
  if (!status || typeof status !== "string") return "offline";
  return status.toLowerCase();
}

function isOnlineStatus(status) {
  return ONLINE_STATUSES.has(this._normalizeStatus(status));
}

function getStatusLabel(status) {
  const normalized = this._normalizeStatus(status);
  return STATUS_LABELS[normalized] || normalized;
}

function getFriendIdSet() {
  const relationshipStore = this._resolveRelationshipStore();
  if (!relationshipStore || typeof relationshipStore.getFriendIDs !== "function") return new Set();
  try {
    return new Set((relationshipStore.getFriendIDs() || []).map(String));
  } catch (err) {
    this._plugin.debugError("SensesEngine", "Failed to read friend IDs", err);
    return new Set();
  }
}

function snapshotFriendRelationships() {
  this._relationshipFriendIds = this._getFriendIdSet();
}

function resolveUserName(userId, fallbackName = "Unknown") {
  const userStore = this._resolveUserStore();
  if (!userStore || typeof userStore.getUser !== "function") return fallbackName;
  try {
    const user = userStore.getUser(userId);
    return user?.globalName || user?.global_name || user?.username || fallbackName;
  } catch (_) {
    return fallbackName;
  }
}

function resolveUserAvatarUrl(userId) {
  const userStore = this._resolveUserStore();
  if (!userStore || typeof userStore.getUser !== "function") return null;
  try {
    const user = userStore.getUser(userId);
    if (!user) return null;

    const candidateCalls = [
      () => user.getAvatarURL?.(null, 64, true),
      () => user.getAvatarURL?.(),
      () => user.getAvatarURL?.(64),
      () => user.getDefaultAvatarURL?.(),
    ];
    for (const call of candidateCalls) {
      try {
        const value = call();
        if (typeof value === "string" && value.length > 4) return value;
      } catch (_) {}
    }

    if (typeof user.defaultAvatarURL === "string" && user.defaultAvatarURL.length > 4) {
      return user.defaultAvatarURL;
    }
    if (user.avatar && user.id) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
    }
  } catch (_) {}
  return null;
}

function isFriend(userId) {
  return this._relationshipFriendIds instanceof Set && this._relationshipFriendIds.has(String(userId));
}

function toast(message, type = "info", timeout = null) {
  if (this._toastEngine) {
    this._toastEngine.showToast(message, type, timeout, { callerId: "shadowSenses" });
  } else {
    _fallbackToast(message, type);
  }
}

function scheduleStatusToast(toastPayload, delayMs = 0) {
  const emit = () => {
    if (this._plugin._stopped) return;
    this._showStatusToast(toastPayload);
  };
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    emit();
    return;
  }
  const timer = setTimeout(() => {
    this._deferredStatusToastTimers.delete(timer);
    emit();
  }, Math.floor(delayMs));
  this._deferredStatusToastTimers.add(timer);
}

function scheduleDeferredUtilityToast(callback, delayMs = 0) {
  if (typeof callback !== "function") return;
  const emit = () => {
    if (this._plugin._stopped) return;
    callback();
  };
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    emit();
    return;
  }
  const timer = setTimeout(() => {
    this._deferredUtilityToastTimers.delete(timer);
    emit();
  }, Math.floor(delayMs));
  this._deferredUtilityToastTimers.add(timer);
}

function showStatusToast({ userId, userName, previousLabel, nextLabel, nextStatus, deployment }) {
  const accent = STATUS_ACCENT_COLORS[nextStatus] || "#8a2be2";
  const rankLabel = deployment?.shadowRank || "E";
  const shadowName = deployment?.shadowName || "Shadow";
  const friendSuffix = this._isFriend(userId) ? " [FRIEND]" : "";

  if (this._toastEngine) {
    const avatarUrl = this._resolveUserAvatarUrl(userId);
    this._toastEngine.showCardToast({
      avatarUrl: avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png",
      accentColor: accent,
      header: `[${rankLabel}] ${shadowName} reports${friendSuffix}`,
      body: `${userName || "Unknown"} ${previousLabel} -> ${nextLabel}`,
      timeout: STATUS_TOAST_TIMEOUT_MS,
      callerId: "shadowSenses",
    });
  } else {
    BdApi.UI.showToast(`[${rankLabel}] ${shadowName}: ${userName} ${previousLabel} -> ${nextLabel}`, { type: "info" });
  }
}

function showMentionToast({ userId, userName, label, detail, accent, deployment }) {
  if (this._toastEngine) {
    const avatarUrl = this._resolveUserAvatarUrl(userId)
      || "https://cdn.discordapp.com/embed/avatars/0.png";
    this._toastEngine.showCardToast({
      avatarUrl,
      accentColor: accent,
      header: `[${deployment?.shadowRank || "E"}] ${deployment?.shadowName || "Shadow"}`,
      body: `${userName} ${label}`,
      detail: detail || undefined,
      timeout: STATUS_TOAST_TIMEOUT_MS,
      callerId: "shadowSenses",
    });
  } else {
    BdApi.UI.showToast(`${userName} ${label}`, { type: "info" });
  }
}

function seedTrackedStatuses() {
  const presenceStore = this._resolvePresenceStore();
  this._statusByUserId.clear();
  if (!presenceStore || typeof presenceStore.getStatus !== "function") return;
  const monitoredIds = this._plugin.deploymentManager.getMonitoredUserIds();
  for (const userId of monitoredIds) {
    try {
      const status = this._normalizeStatus(presenceStore.getStatus(userId));
      this._statusByUserId.set(userId, status);
    } catch (_) {}
  }
}

function getTypingCooldownMs() {
  const ms = Number(this._plugin.settings?.typingAlertCooldownMs);
  if (!Number.isFinite(ms)) return DEFAULT_TYPING_ALERT_COOLDOWN_MS;
  return Math.min(60000, Math.max(3000, Math.floor(ms)));
}

function extractPresenceUpdates(payload) {
  if (!payload) return [];
  const updates = [];
  const push = (userId, status) => {
    if (!userId) return;
    const normalizedStatus =
      typeof status === "string" && status.trim().length > 0
        ? this._normalizeStatus(status)
        : null;
    updates.push({
      userId: String(userId),
      status: normalizedStatus,
    });
  };

  if (Array.isArray(payload.updates)) {
    for (const update of payload.updates) {
      if (!update) continue;
      const userId = update.userId || update.user_id || update.user?.id;
      const status = update.status || update.presence?.status;
      if (userId) push(userId, status);
    }
  }

  const directUserId = payload.userId || payload.user_id || payload.user?.id || payload.id;
  if (directUserId) {
    const directStatus = payload.status || payload.presence?.status;
    push(directUserId, directStatus);
  }

  return updates;
}

module.exports = {
  _extractPresenceUpdates: extractPresenceUpdates,
  _getFriendIdSet: getFriendIdSet,
  _getStatusLabel: getStatusLabel,
  _getTypingCooldownMs: getTypingCooldownMs,
  _isFriend: isFriend,
  _isOnlineStatus: isOnlineStatus,
  _normalizeStatus: normalizeStatus,
  _resolvePresenceStore: resolvePresenceStore,
  _resolveRelationshipStore: resolveRelationshipStore,
  _resolveUserAvatarUrl: resolveUserAvatarUrl,
  _resolveUserName: resolveUserName,
  _resolveUserStore: resolveUserStore,
  _scheduleDeferredUtilityToast: scheduleDeferredUtilityToast,
  _scheduleStatusToast: scheduleStatusToast,
  _seedTrackedStatuses: seedTrackedStatuses,
  _showMentionToast: showMentionToast,
  _showStatusToast: showStatusToast,
  _snapshotFriendRelationships: snapshotFriendRelationships,
  _toast: toast,
  extractPresenceUpdates,
  getFriendIdSet,
  getStatusLabel,
  getTypingCooldownMs,
  isFriend,
  isOnlineStatus,
  normalizeStatus,
  resolvePresenceStore,
  resolveRelationshipStore,
  resolveUserAvatarUrl,
  resolveUserName,
  resolveUserStore,
  scheduleDeferredUtilityToast,
  scheduleStatusToast,
  seedTrackedStatuses,
  showMentionToast,
  showStatusToast,
  snapshotFriendRelationships,
  toast,
};
