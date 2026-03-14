const PLUGIN_NAME = "ShadowSenses";
const PLUGIN_VERSION = "1.1.5";
const STYLE_ID = "shadow-senses-css";
const WIDGET_ID = "shadow-senses-widget";
const WIDGET_SPACER_ID = "shadow-senses-widget-spacer";
const PANEL_CONTAINER_ID = "shadow-senses-panel-root";
const TRANSITION_ID = "shadow-senses-transition-overlay";
const GLOBAL_UTILITY_FEED_ID = "__shadow_senses_global__";

const RANKS = window.SoloLevelingUtils?.RANKS || ["E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+", "NH", "Monarch", "Monarch+", "Shadow Monarch"];
const RANK_COLORS = {
  E: "#9ca3af", D: "#60a5fa", C: "#34d399", B: "#a78bfa",
  A: "#f59e0b", S: "#ef4444", SS: "#ec4899", SSS: "#8b5cf6",
  "SSS+": "#c084fc", NH: "#14b8a6", Monarch: "#fbbf24",
  "Monarch+": "#f97316", "Shadow Monarch": "#8a2be2",
};

const GUILD_FEED_CAP = 5000;
const GLOBAL_FEED_CAP = 25000;
const FEED_MAX_AGE_MS = 1 * 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 10 * 60 * 1000;
const WIDGET_REINJECT_DELAY_MS = 300;
const STARTUP_TOAST_GRACE_MS = 5000;
const STATUS_POLL_INTERVAL_MS = 5000;
const DEFAULT_TYPING_ALERT_COOLDOWN_MS = 15000;
const BURST_WINDOW_MS = 20000;
const PRIORITY = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const PRIORITY_LABELS = { 1: null, 2: "P2", 3: "P3", 4: "P4!" };
const PRIORITY_COLORS = {
  1: null,
  2: "rgba(96, 165, 250, 0.3)",
  3: "rgba(251, 191, 36, 0.35)",
  4: "rgba(239, 68, 68, 0.4)",
};
const KEYWORD_MATCH_COLOR = "rgba(52, 211, 153, 0.35)";
const NAME_MENTION_COLOR = "rgba(236, 72, 153, 0.4)";
const ONLINE_STATUSES = new Set(["online", "idle", "dnd"]);
const PRESENCE_EVENT_NAMES = [
  "PRESENCE_UPDATES",
  "PRESENCE_UPDATE",
  "PRESENCES_REPLACE",
  "PRESENCE_REPLACE",
];
const RELATIONSHIP_EVENT_NAMES = ["FRIEND_REQUEST_ACCEPTED", "RELATIONSHIP_ADD", "RELATIONSHIP_UPDATE", "RELATIONSHIP_REMOVE"];
const STATUS_LABELS = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
  invisible: "Invisible",
};
const STATUS_ACCENT_COLORS = {
  online: "#22c55e",
  idle: "#f59e0b",
  dnd: "#ef4444",
  offline: "#9ca3af",
  invisible: "#9ca3af",
};
const STATUS_TOAST_TIMEOUT_MS = 5200;
const STARTUP_REPORT_ARTWORK_FALLBACK_URL =
  "https://raw.githubusercontent.com/BlueFlashX1/betterdiscord-assets/main/assets/igris/Igris.svg";
const DEFAULT_SETTINGS = {
  animationEnabled: true,
  respectReducedMotion: false,
  animationDuration: 550,
  statusAlerts: true,
  startupShadowReport: true,
  startupShadowReportWindowHours: 24,
  startupShadowReportArtwork: STARTUP_REPORT_ARTWORK_FALLBACK_URL,
  typingAlerts: true,
  removedFriendAlerts: true,
  showMarkedOnlineCount: true,
  typingAlertCooldownMs: DEFAULT_TYPING_ALERT_COOLDOWN_MS,
  groupHighPriorityBursts: false,
  priorityKeywords: [],
  mentionNames: [],
};

module.exports = {
  BURST_WINDOW_MS,
  DEFAULT_SETTINGS,
  DEFAULT_TYPING_ALERT_COOLDOWN_MS,
  FEED_MAX_AGE_MS,
  GLOBAL_FEED_CAP,
  GLOBAL_UTILITY_FEED_ID,
  GUILD_FEED_CAP,
  KEYWORD_MATCH_COLOR,
  NAME_MENTION_COLOR,
  ONLINE_STATUSES,
  PANEL_CONTAINER_ID,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  PRESENCE_EVENT_NAMES,
  PRIORITY,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  PURGE_INTERVAL_MS,
  RANK_COLORS,
  RANKS,
  RELATIONSHIP_EVENT_NAMES,
  STARTUP_TOAST_GRACE_MS,
  STARTUP_REPORT_ARTWORK_FALLBACK_URL,
  STATUS_POLL_INTERVAL_MS,
  STATUS_ACCENT_COLORS,
  STATUS_LABELS,
  STATUS_TOAST_TIMEOUT_MS,
  STYLE_ID,
  TRANSITION_ID,
  WIDGET_ID,
  WIDGET_REINJECT_DELAY_MS,
  WIDGET_SPACER_ID,
};
