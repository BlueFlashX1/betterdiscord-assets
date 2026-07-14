/**
 * ShadowSenses report voice (2026-07-13).
 *
 * Turns a report's facts into the toast body string, in one of two voices:
 *   - plain    : functional ("Bob → Online", "Bob typing in #general")
 *   - monarch  : shadows addressing the Sung Jinwoo — flavored verbs
 *                ("Bob has awakened", "Bob stirs in #general"), with the
 *                "My liege" address reserved for signals that actually call
 *                for attention (mentions / name), so it stays evocative
 *                rather than repetitive.
 *
 * Toggled by settings.reportToMonarch. When off, every string is byte-for-
 * byte the plain form the plugin used before, so the toggle is lossless.
 */

// Monarch status verbs keyed by the normalized status.
const MONARCH_STATUS = {
  online: "has awakened",
  idle: "grows distant",
  dnd: "stands guarded",
  offline: "has fallen silent",
};

function _loc(location) {
  return location ? ` in ${location}` : "";
}

/**
 * @param {string} kind  status | typing | message | invisible | mention | name | keyword
 * @param {object} ctx   { userName, location, term, prevLabel, nextLabel, nextStatus }
 * @param {boolean} monarch
 * @returns {string} toast body
 */
function reportBody(kind, ctx, monarch) {
  const u = ctx.userName || "Unknown";
  const loc = ctx.location || "";
  switch (kind) {
    case "status":
      return monarch
        ? `${u} ${MONARCH_STATUS[ctx.nextStatus] || `is now ${ctx.nextLabel}`}`
        : `${u} ${ctx.prevLabel} → ${ctx.nextLabel}`;
    case "typing":
      return monarch ? `${u} stirs${_loc(loc)}` : `${u} typing${_loc(loc)}`;
    case "message":
      return monarch ? `${u} speaks${_loc(loc)}` : `${u} sent${_loc(loc)}`;
    case "invisible":
      return monarch ? `${u} moves unseen${_loc(loc)}` : `${u} sent a message while invisible`;
    case "mention":
      return monarch ? `My liege — ${u} calls upon you${_loc(loc)}` : `${u} @mentioned you`;
    case "name":
      return monarch
        ? `My liege — ${u} utters your name${_loc(loc)}`
        : `${u} said "${ctx.term}"`;
    case "keyword":
      return monarch
        ? `${u} speaks of "${ctx.term}"${_loc(loc)}`
        : `${u} keyword "${ctx.term}"`;
    default:
      return `${u}`;
  }
}

module.exports = { reportBody };
