// SoloLevelingToasts — Message Formatting & Combination Helpers

/**
 * Extract plain text from a message (string, {message}, or {text} object).
 */
export function extractMessageText(message) {
  let messageText = message;
  if (message && typeof message === "object" && message.message) {
    messageText = message.message;
  } else if (message && typeof message === "object" && message.text) {
    messageText = message.text;
  }
  if (typeof messageText !== "string") {
    messageText = String(messageText);
  }
  return messageText;
}

/**
 * Format numbers in messages for display.
 * - Large numbers (4+ digits) get locale separators
 * - Percentages normalised to 1 decimal place
 * - Stat change arrows formatted consistently
 */
export function formatNumbersInMessage(message) {
  if (!message || typeof message !== "string") return message;

  // Format large numbers (XP, stat points, etc.)
  message = message.replace(/([+\-]?)(\d{4,})/g, (match, sign, num) => {
    const number = parseInt(num, 10);
    return !isNaN(number) ? sign + number.toLocaleString() : match;
  });

  // Format percentages - ensure consistent decimal places
  message = message.replace(/(\d+\.\d+)\s*%/g, (match, num) => {
    const number = parseFloat(num);
    return !isNaN(number) ? `${number.toFixed(1)}%` : match;
  });

  // Format stat changes like "10 -> 15" to be more compact
  message = message.replace(/(\d+)\s*→\s*(\d+)/g, (match, oldVal, newVal) => {
    const oldNum = parseInt(oldVal, 10);
    const newNum = parseInt(newVal, 10);
    return !isNaN(oldNum) && !isNaN(newNum)
      ? `${oldNum.toLocaleString()} → ${newNum.toLocaleString()}`
      : match;
  });

  return message;
}

/**
 * Summarize / condense notification messages for brief display.
 * Abbreviates stat names, trims redundant patterns, etc.
 */
export function summarizeMessage(message) {
  if (!message || typeof message !== "string") return message;

  let summarized = message;

  summarized = summarized
    // Level up messages
    .replace(/LEVEL UP!?\s*/gi, "")
    .replace(/Level\s*(\d+)\s*→\s*(\d+)/gi, "Lv.$1→$2")
    // Stat changes (abbreviated)
    .replace(/Strength:/gi, "STR:")
    .replace(/Agility:/gi, "AGI:")
    .replace(/Intelligence:/gi, "INT:")
    .replace(/Vitality:/gi, "VIT:")
    .replace(/Perception:/gi, "PER:")
    .replace(/Luck:/gi, "LUK:")
    .replace(/\+\s*(\d+)\s*([A-Z]+)\s*\(/gi, "+$1 $2 (")
    // Quest completion
    .replace(/QUEST COMPLETE!?\s*/gi, "Quest: ")
    .replace(/\[QUEST COMPLETE\]\s*/gi, "")
    // Achievement
    .replace(/ACHIEVEMENT UNLOCKED!?\s*/gi, "Achievement: ")
    .replace(/\s*Retroactive Natural Growth Applied!?\s*/gi, "Retro Growth")
    .replace(/\s*Natural Growth!?\s*/gi, "Natural")
    // Rank promotion
    .replace(/Rank Promotion!?\s*/gi, "Rank: ")
    .replace(/([A-Z])\s*→\s*([A-Z])/g, "$1→$2")
    // Remove redundant text
    .replace(/\n{2,}/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();

  return summarized;
}

/**
 * Detect toast type based on message content and explicit type parameter.
 * Returns a CSS class-friendly string: 'level-up' | 'achievement' | 'quest' | 'error' | 'info'.
 */
export function detectToastType(message, type) {
  const msg = message.toLowerCase();

  if (type === "success" || msg.includes("level up") || msg.includes("leveled") || /\blv\.?\d/i.test(msg)) {
    return "level-up";
  }
  if (msg.includes("achievement") || msg.includes("unlocked")) {
    return "achievement";
  }
  if (msg.includes("quest") || msg.includes("complete")) {
    return "quest";
  }
  if (type === "error") {
    return "error";
  }
  return "info";
}

const ACCENT_COLORS = {
  "level-up":    "#8a2be2",
  "achievement": "#fbbf24",
  "quest":       "#22c55e",
  "error":       "#ef4444",
  "info":        "#8a2be2",
};

/**
 * Return the accent colour for a given toast type.
 */
export function getAccentColor(toastType) {
  return ACCENT_COLORS[toastType] || ACCENT_COLORS["info"];
}

/**
 * Generate a grouping key for similar messages (for dedup / batching).
 */
export function getMessageGroupKey(message, type) {
  const messageText = extractMessageText(message);

  // Normalize: remove numbers, extra whitespace
  const normalized = messageText
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .substring(0, 100);

  return `${normalized}_${type}`;
}

// Number extraction / summing for combination

/**
 * Pull all numeric-looking tokens from an array of { message } objects.
 */
function extractMessageNumbers(messages) {
  const numbers = [];
  messages.forEach((msg) => {
    const matches = msg.message.match(/(\+?\d+(?:,\d{3})*(?:\.\d+)?)/g);
    if (matches) {
      numbers.push(...matches.map((m) => m.replace(/,/g, "")));
    }
  });
  return numbers;
}

/**
 * Sum parsed integer numbers from a token list.
 */
function sumParsedNumbers(numbers) {
  return numbers
    .filter((n) => !isNaN(parseInt(n, 10)))
    .reduce((sum, n) => sum + parseInt(n, 10), 0);
}

/**
 * Combine multiple similar messages into one notification string.
 */
export function combineMessages(messages) {
  if (messages.length === 1) {
    return messages[0].message;
  }

  const firstMsg = messages[0].message;
  const count = messages.length;
  const msgLower = firstMsg.toLowerCase();
  const numbers = extractMessageNumbers(messages);
  const totalXP = sumParsedNumbers(numbers);
  const context = { firstMsg, msgLower, count, totalXP };

  const statKeywords = [
    "stat",
    "strength",
    "agility",
    "intelligence",
    "vitality",
    "perception",
  ];

  const rules = [
    {
      when: (ctx) => ctx.msgLower.includes("quest") || ctx.msgLower.includes("complete"),
      format: (ctx) =>
        `Quest Complete x${ctx.count}${ctx.totalXP > 0 ? `\n+${ctx.totalXP.toLocaleString()} XP` : ""}`,
    },
    {
      when: (ctx) => ctx.msgLower.includes("achievement") || ctx.msgLower.includes("unlocked"),
      format: (ctx) => `Achievements Unlocked x${ctx.count}`,
    },
    {
      when: (ctx) => statKeywords.some((keyword) => ctx.msgLower.includes(keyword)),
      format: (ctx) => {
        const statMatches = ctx.firstMsg.match(/(\w+):\s*(\d+)\s*→\s*(\d+)/i);
        if (statMatches) {
          const statName = statMatches[1];
          const finalValue = statMatches[3];
          return `${statName}: +${ctx.count} → ${finalValue}`;
        }
        return `Stat Increases x${ctx.count}`;
      },
    },
    {
      when: (ctx) => ctx.msgLower.includes("xp") || ctx.msgLower.includes("experience"),
      format: (ctx) => {
        if (ctx.totalXP > 0) {
          return `XP Gained x${ctx.count}\n+${ctx.totalXP.toLocaleString()} XP`;
        }
        return `XP Events x${ctx.count}`;
      },
    },
    {
      when: (ctx) => ctx.msgLower.includes("level"),
      format: (ctx) => {
        const levelMatches = ctx.firstMsg.match(/Lv\.?(\d+)/i);
        if (levelMatches) {
          return `Level Up x${ctx.count}\nLv.${levelMatches[1]}`;
        }
        return `Level Events x${ctx.count}`;
      },
    },
  ];

  for (const rule of rules) {
    if (rule.when(context)) {
      return rule.format(context);
    }
  }

  return `${firstMsg.substring(0, 50)}... x${count}`;
}

// Notification filtering helpers

/**
 * Normalise message text for filter comparisons (lowercase, collapse whitespace).
 */
function normalizeNotificationText(messageText) {
  if (typeof messageText !== "string") return "";
  return messageText.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Does the (lowercased) message look like a natural-growth notification?
 */
function isNaturalGrowthNotification(msgLower) {
  const hasNatural = msgLower.includes("natural");
  const hasGrowth = msgLower.includes("growth");
  return (
    (hasNatural && hasGrowth) ||
    msgLower.includes("natural stat growth") ||
    msgLower.includes("retroactive natural growth") ||
    msgLower.includes("natural strength growth") ||
    msgLower.includes("natural agility growth") ||
    msgLower.includes("natural intelligence growth") ||
    msgLower.includes("natural vitality growth") ||
    msgLower.includes("natural luck growth")
  );
}

/**
 * Does the (lowercased) message look like a stat-allocation notification?
 */
function isStatAllocationNotification(msgLower) {
  return (
    msgLower.includes("stat point allocated") ||
    msgLower.includes("allocated to") ||
    msgLower.includes("point added to") ||
    (msgLower.includes("strength:") && msgLower.includes("→")) ||
    (msgLower.includes("agility:") && msgLower.includes("→")) ||
    (msgLower.includes("intelligence:") && msgLower.includes("→")) ||
    (msgLower.includes("vitality:") && msgLower.includes("→")) ||
    (msgLower.includes("perception:") && msgLower.includes("→")) ||
    (msgLower.includes("luck:") && msgLower.includes("→"))
  );
}

/**
 * Return filter flags for a raw notification message string.
 */
export function getNotificationFilterFlags(messageText) {
  const msgLower = normalizeNotificationText(messageText);
  const naturalGrowth = isNaturalGrowthNotification(msgLower);
  const statAllocation = isStatAllocationNotification(msgLower);
  return {
    isNaturalGrowth: naturalGrowth,
    isStatAllocation: statAllocation,
    shouldSkip: naturalGrowth || statAllocation,
  };
}
