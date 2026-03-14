/**
 * CriticalHit plugin constants — extracted from class getters for reuse across modules.
 */
const dc = require('../shared/discord-classes');

// DEFAULT SETTINGS

const DEFAULT_SETTINGS = {
  enabled: false,
  critChance: 10,
  critColor: '#8a2be2',
  critGradient: true,
  critFont: "'Friend or Foe BB', 'Orbitron', sans-serif",
  animationFont: 'Speedy Space Goat Oddity',
  useLocalFonts: true,
  critAnimation: true,
  critGlow: true,
  filterReplies: true,
  filterSystemMessages: true,
  filterBotMessages: false,
  filterEmptyMessages: true,
  historyRetentionDays: 30,
  autoCleanupHistory: true,
  maxHistorySize: 500,
  maxCritHistory: 500,
  maxHistoryPerChannel: 200,
  animationEnabled: true,
  cssEnabled: true,
  animationDuration: 4000,
  floatDistance: 150,
  fontSize: 36,
  screenShake: true,
  shakeIntensity: 3,
  shakeDuration: 250,
  screenFlash: true,
  cooldown: 500,
  showCombo: true,
  maxCombo: 999,
  ownUserId: null,
  debugMode: false,
  diagnosticLogs: false,
};

// DOM / SELECTOR CONSTANTS

const HEADER_CLASS_PATTERNS = [
  'header', 'username', 'timestamp', 'author',
  'topSection', 'messageHeader', 'messageGroup', 'messageGroupWrapper',
];
const HEADER_SELECTORS = [
  dc.sel.header, dc.sel.username, dc.sel.timestamp, dc.sel.author,
  '[class*="topSection"]', '[class*="messageHeader"]', '[class*="messageGroup"]', dc.sel.messageGroupWrapper,
];

const MESSAGE_CONTENT_SELECTORS = [dc.sel.messageContent, dc.sel.markup, dc.sel.textContainer];
const CONTENT_SELECTORS = [dc.sel.messageContent, dc.sel.markup, dc.sel.textContainer];
const TEXT_ELEMENT_SELECTORS = ['span', 'div', 'p'];
const MESSAGE_SELECTORS = [dc.sel.message, '[data-list-item-id]', '[data-message-id]'];

const CHANNEL_URL_PATTERN = /channels\/(?:@me|\d+)\/(\d+)(?:\/threads\/(\d+))?/;
const GUILD_CHANNEL_URL_PATTERN = /channels\/(\d+)\/(\d+)/;

const REPLY_SELECTORS = Object.freeze([
  '[class*="reply"]', dc.sel.repliedMessage, '[class*="messageReference"]',
  '[class*="repliedText"]', '[class*="replyMessage"]',
]);
const SYSTEM_MESSAGE_SELECTORS = Object.freeze([
  dc.sel.systemMessage, '[class*="systemText"]', '[class*="joinMessage"]',
  '[class*="leaveMessage"]', '[class*="pinnedMessage"]', '[class*="boostMessage"]',
]);
const BOT_SELECTORS = Object.freeze([dc.sel.botTag, dc.sel.bot, dc.sel.botText]);

// TIMING / THRESHOLD CONSTANTS

const CHANNEL_CHANGE_DELAY = 500;
const OBSERVER_RETRY_DELAY_MS = 500;
const LOAD_OBSERVER_TIMEOUT_MS = 5000;
const OBSERVER_ERROR_RETRY_DELAY_MS = 1000;

const PERIODIC_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_HISTORY_RETENTION_DAYS = 30;
const MESSAGE_CONTAINER_CACHE_TTL_MS = 5000;

const PENDING_HASH_ID_MAX_AGE = 5000;
const PENDING_REGULAR_ID_MAX_AGE = 3000;
const PENDING_QUEUE_TRIM_PERCENTAGE = 0.3;

const RESTORATION_CHECK_THROTTLE_MS = 200;
const RESTORATION_OBSERVER_TIMEOUT_MS = 5000;
const MAX_THROTTLE_MAP_SIZE = 1000;
const THROTTLE_ENTRY_MAX_AGE_MS = 1000;

const MAX_REPLY_FIBER_DEPTH = 10;

// ANIMATION CONSTANTS

const ANIMATION_POSITION_TOLERANCE = 100;
const ANIMATION_TIME_TOLERANCE = 1000;
const ANIMATION_SPAWN_PADDING = 150;
const ANIMATION_HORIZONTAL_VARIATION = 300;
const ANIMATION_VERTICAL_VARIATION = 200;
const ANIMATION_BASE_FONT_SIZE = 3.5;
const ANIMATION_MAX_COMBO_SCALE = 5;
const ANIMATION_COMBO_SIZE_INCREMENT = 0.07;
const ANIMATION_COOLDOWN_MS = 100;
const FADE_OUT_DURATION_MS = 300;
const CLEANUP_DELAY_BUFFER_MS = 100;

const COMBO_RESET_TIMEOUT_MS = 5000;
const POSITION_TOLERANCE = 50;
const TIME_TOLERANCE_MS = 2000;
const ELEMENT_POSITION_TOLERANCE = 100;

const SCREEN_SHAKE_CLASS = 'cha-screen-shake-active';
const SCREEN_SHAKE_KEYFRAME = 'chaShake';
const DISCORD_APP_SELECTOR = dc.sel.app;

// CRIT SYSTEM CONSTANTS

const CRIT_ROLL_DIVISOR = 10000;
const CRIT_ROLL_SCALE = 100;
const GRADIENT_VERIFICATION_DELAY_MS = 100;
const GRADIENT_VERIFICATION_TIMEOUT_MS = 2000;
const VERIFIED_MESSAGE_THROTTLE_MS = 50;
const THROTTLE_CLEANUP_CUTOFF_MS = 5000;
const MAX_GRADIENT_VERIFICATION_ATTEMPTS = 3;
const GRADIENT_VERIFICATION_RETRY_DELAY_MS = 500;

const MAX_EFFECTIVE_CRIT_CHANCE = 50;
const MAX_BASE_CRIT_CHANCE = 30;
const DEFAULT_CRIT_CHANCE = 10;
const BONUS_TO_PERCENT = 100;

// STYLING CONSTANTS

const DEFAULT_GRADIENT_COLORS = 'linear-gradient(to right, #8a2be2 0%, #9b30ff 15%, #7b21c6 30%, #8a2be2 50%, #9b30ff 70%, #7b21c6 85%, #8a2be2 100%)';

const CSS_STYLE_IDS = {
  static: 'cha-static-styles',
  animation: 'cha-styles',
  crit: 'bd-crit-hit-styles',
  critMessages: 'bd-crit-message-styles',
  settings: 'bd-crit-hit-settings-styles',
  novaFlat: 'bd-crit-hit-nova-flat-font',
};

const GOOGLE_FONTS_BASE_URL = 'https://fonts.googleapis.com/css2';

// FONT CONSTANTS

const DEFAULT_CRIT_FONT = 'Friend or Foe BB';
const DEFAULT_ANIMATION_FONT = 'Speedy Space Goat Oddity';
const FONT_VERIFICATION_DELAY_MS = 100;
const FONT_VERIFICATION_SIZE = '16px';
const FONT_FILENAME_MAP = {
  'friend or foe': 'FriendorFoeBB',
  'friend or foe bb': 'FriendorFoeBB',
  'speedy space goat': 'SpeedySpaceGoatOddity',
  'speedy goat': 'SpeedySpaceGoatOddity',
};
const LOCAL_ONLY_FONTS = ['friend or foe', 'friend or foe bb', 'speedy space goat', 'speedy goat'];

// EXPORTS

module.exports = {
  DEFAULT_SETTINGS,
  // DOM / Selectors
  HEADER_CLASS_PATTERNS,
  HEADER_SELECTORS,
  MESSAGE_CONTENT_SELECTORS,
  CONTENT_SELECTORS,
  TEXT_ELEMENT_SELECTORS,
  MESSAGE_SELECTORS,
  CHANNEL_URL_PATTERN,
  GUILD_CHANNEL_URL_PATTERN,
  REPLY_SELECTORS,
  SYSTEM_MESSAGE_SELECTORS,
  BOT_SELECTORS,
  // Timing / Thresholds
  CHANNEL_CHANGE_DELAY,
  OBSERVER_RETRY_DELAY_MS,
  LOAD_OBSERVER_TIMEOUT_MS,
  OBSERVER_ERROR_RETRY_DELAY_MS,
  PERIODIC_CLEANUP_INTERVAL_MS,
  DEFAULT_HISTORY_RETENTION_DAYS,
  MESSAGE_CONTAINER_CACHE_TTL_MS,
  PENDING_HASH_ID_MAX_AGE,
  PENDING_REGULAR_ID_MAX_AGE,
  PENDING_QUEUE_TRIM_PERCENTAGE,
  RESTORATION_CHECK_THROTTLE_MS,
  RESTORATION_OBSERVER_TIMEOUT_MS,
  MAX_THROTTLE_MAP_SIZE,
  THROTTLE_ENTRY_MAX_AGE_MS,
  MAX_REPLY_FIBER_DEPTH,
  // Animation
  ANIMATION_POSITION_TOLERANCE,
  ANIMATION_TIME_TOLERANCE,
  ANIMATION_SPAWN_PADDING,
  ANIMATION_HORIZONTAL_VARIATION,
  ANIMATION_VERTICAL_VARIATION,
  ANIMATION_BASE_FONT_SIZE,
  ANIMATION_MAX_COMBO_SCALE,
  ANIMATION_COMBO_SIZE_INCREMENT,
  ANIMATION_COOLDOWN_MS,
  FADE_OUT_DURATION_MS,
  CLEANUP_DELAY_BUFFER_MS,
  COMBO_RESET_TIMEOUT_MS,
  POSITION_TOLERANCE,
  TIME_TOLERANCE_MS,
  ELEMENT_POSITION_TOLERANCE,
  SCREEN_SHAKE_CLASS,
  SCREEN_SHAKE_KEYFRAME,
  DISCORD_APP_SELECTOR,
  // Crit System
  CRIT_ROLL_DIVISOR,
  CRIT_ROLL_SCALE,
  GRADIENT_VERIFICATION_DELAY_MS,
  GRADIENT_VERIFICATION_TIMEOUT_MS,
  VERIFIED_MESSAGE_THROTTLE_MS,
  THROTTLE_CLEANUP_CUTOFF_MS,
  MAX_GRADIENT_VERIFICATION_ATTEMPTS,
  GRADIENT_VERIFICATION_RETRY_DELAY_MS,
  MAX_EFFECTIVE_CRIT_CHANCE,
  MAX_BASE_CRIT_CHANCE,
  DEFAULT_CRIT_CHANCE,
  BONUS_TO_PERCENT,
  // Styling
  DEFAULT_GRADIENT_COLORS,
  CSS_STYLE_IDS,
  GOOGLE_FONTS_BASE_URL,
  // Fonts
  DEFAULT_CRIT_FONT,
  DEFAULT_ANIMATION_FONT,
  FONT_VERIFICATION_DELAY_MS,
  FONT_VERIFICATION_SIZE,
  FONT_FILENAME_MAP,
  LOCAL_ONLY_FONTS,
};
