/**
 * SystemWindow CSS builder — resolves Discord's Webpack class names at runtime
 * and returns the full CSS string with fast resolved selectors where available,
 * falling back to wildcard attribute selectors when Webpack lookup fails.
 *
 * Imported by index.js instead of the static styles.css import.
 */

const dc = require("../shared/discord-classes");

/**
 * Build the full SystemWindow CSS string with resolved class selectors.
 * Called once on plugin start (inside _injectCSS).
 *
 * @returns {string}
 */
function buildCSS() {
  // Grab resolved (or fallback) selectors for every Discord class we need.
  // dc.sel is a lazy Proxy — first access triggers the Webpack lookups.
  const messageListItem = dc.sel.messageListItem; // e.g. ".messageListItem_a1b2" or '[class*="messageListItem_"]'
  const mentioned       = dc.sel.mentioned;       // e.g. ".mentioned_x9y8"       or '[class*="mentioned_"]'
  const avatar          = dc.sel.avatar;          // e.g. ".avatar_c3d4"           or '[class*="avatar_"]'
  const username        = dc.sel.username;        // e.g. ".username_e5f6"         or '[class*="username_"]'
  const timestamp       = dc.sel.timestamp;       // e.g. ".timestamp_g7h8"        or '[class*="timestamp_"]'
  const repliedMessage  = dc.sel.repliedMessage;  // e.g. ".repliedMessage_i9j0"   or '[class*="repliedMessage_"]'
  const embedWrapper    = dc.sel.embedWrapper;    // e.g. ".embedWrapper_k1l2"     or '[class*="embedWrapper_"]'
  const message         = dc.sel.message;         // e.g. ".message_m3n4"          or '[class*="message_"]'

  return `/* ═══════════════════════════════════════════════
   SystemWindow v2.5.0 — LI-level codeblock wrapping
   Wraps avatar + username + timestamp + message text

   Colors:
     BLUE:   59, 130, 246  (#3b82f6) — System (others)
     PURPLE: 155, 50, 255  (#9b32ff) — Monarch (self)
     BG:     rgba(0, 0, 0, 0.55) — Darker codeblock background
     R:      2px — Border radius
   ═══════════════════════════════════════════════ */

/* ════════════════════════════════════════════
   PRE-STYLE: CSS-only base applied to ALL message
   items BEFORE JS classification. Prevents the flash
   when Discord replaces DOM nodes on re-render.
   ════════════════════════════════════════════ */

li${messageListItem} {
  background: rgba(0, 0, 0, 0.55) !important;
  border-left: 3px solid rgba(59, 130, 246, 0.5) !important;
  border-right: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-top: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-radius: 2px !important;
  position: relative !important;
  margin-left: 48px !important;
  margin-right: 96px !important;
  margin-top: 4px !important;
  margin-bottom: 4px !important;
  padding: 4px 12px 8px 8px !important;
  transition: box-shadow 200ms ease,
              border-color 200ms ease !important;
}

/* Mentioned messages pre-style (CSS-only) */
li${messageListItem}:has(div${mentioned}) {
  border-left-color: rgba(239, 68, 68, 0.7) !important;
  border-right-color: rgba(239, 68, 68, 0.25) !important;
  border-top-color: rgba(239, 68, 68, 0.25) !important;
  border-bottom-color: rgba(239, 68, 68, 0.25) !important;
  background: rgba(239, 68, 68, 0.08) !important;
}

/* ════════════════════════════════════════════
   BASE: Classified messages (JS-applied)
   ════════════════════════════════════════════ */

li.sw-group-solo,
li.sw-group-start,
li.sw-group-middle,
li.sw-group-end {
  background: rgba(0, 0, 0, 0.55) !important;
  border-left: 3px solid rgba(59, 130, 246, 0.5) !important;
  border-right: 1px solid rgba(59, 130, 246, 0.2) !important;
  position: relative !important;
  margin-left: 48px !important;
  margin-right: 96px !important;
  padding: 4px 12px 8px 8px !important;
  transition: box-shadow 200ms ease,
              border-color 200ms ease !important;
}

/* ════════════════════════════════════════════
   SOLO: Full border + full radius
   ════════════════════════════════════════════ */

li.sw-group-solo {
  border-top: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-radius: 2px !important;
  margin-top: 12px !important;
  margin-bottom: 12px !important;
  padding-bottom: 10px !important;
}

/* ════════════════════════════════════════════
   GROUP START: Top border + top radius
   ════════════════════════════════════════════ */

li.sw-group-start {
  border-top: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-bottom: none !important;
  border-radius: 2px 2px 0 0 !important;
  margin-top: 12px !important;
  margin-bottom: 0 !important;
}

/* ════════════════════════════════════════════
   GROUP MIDDLE: Side borders only
   ════════════════════════════════════════════ */

li.sw-group-middle {
  border-top: none !important;
  border-bottom: none !important;
  border-radius: 0 !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

/* ════════════════════════════════════════════
   GROUP END: Bottom border + bottom radius
   ════════════════════════════════════════════ */

li.sw-group-end {
  border-top: none !important;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-radius: 0 0 2px 2px !important;
  margin-top: 0 !important;
  margin-bottom: 12px !important;
  padding-bottom: 10px !important;
}

/* ════════════════════════════════════════════
   SELF: Purple accent (Monarch)
   ════════════════════════════════════════════ */

li.sw-self {
  border-left-color: rgba(155, 50, 255, 0.5) !important;
  border-right-color: rgba(155, 50, 255, 0.2) !important;
}

li.sw-self.sw-group-solo,
li.sw-self.sw-group-start {
  border-top-color: rgba(155, 50, 255, 0.2) !important;
}

li.sw-self.sw-group-solo,
li.sw-self.sw-group-end {
  border-bottom-color: rgba(155, 50, 255, 0.2) !important;
}

/* ════════════════════════════════════════════
   HOVER: Glow on the codeblock
   ════════════════════════════════════════════ */

li.sw-group-solo:hover,
li.sw-group-start:hover,
li.sw-group-middle:hover,
li.sw-group-end:hover {
  box-shadow: 0 0 18px rgba(59, 130, 246, 0.45),
              0 0 40px rgba(59, 130, 246, 0.15),
              inset 0 0 12px rgba(59, 130, 246, 0.1) !important;
  border-left-color: rgba(59, 130, 246, 1) !important;
}

li.sw-self.sw-group-solo:hover,
li.sw-self.sw-group-start:hover,
li.sw-self.sw-group-middle:hover,
li.sw-self.sw-group-end:hover {
  box-shadow: 0 0 20px rgba(155, 50, 255, 0.6),
              0 0 45px rgba(155, 50, 255, 0.25),
              inset 0 0 12px rgba(155, 50, 255, 0.1) !important;
  border-left-color: rgba(155, 50, 255, 1) !important;
}

/* ════════════════════════════════════════════
   AVATAR: Clean circle inside codeblock
   ════════════════════════════════════════════ */

li.sw-group-solo ${avatar},
li.sw-group-start ${avatar} {
  z-index: 1 !important;
}

/* ════════════════════════════════════════════
   USERNAMES: System label feel
   ════════════════════════════════════════════ */

li.sw-group-solo ${username},
li.sw-group-start ${username} {
  letter-spacing: 0.03em !important;
}

/* ════════════════════════════════════════════
   TIMESTAMPS: Subtle metadata
   ════════════════════════════════════════════ */

li.sw-group-solo time, li.sw-group-start time,
li.sw-group-middle time, li.sw-group-end time,
li.sw-group-solo ${timestamp},
li.sw-group-start ${timestamp},
li.sw-group-middle ${timestamp},
li.sw-group-end ${timestamp} {
  opacity: 0.6 !important;
  font-size: 0.68rem !important;
  transition: opacity 200ms ease !important;
}

li.sw-group-solo:hover time, li.sw-group-start:hover time,
li.sw-group-middle:hover time, li.sw-group-end:hover time,
li.sw-group-solo:hover ${timestamp},
li.sw-group-start:hover ${timestamp},
li.sw-group-middle:hover ${timestamp},
li.sw-group-end:hover ${timestamp} {
  opacity: 0.8 !important;
}

/* ════════════════════════════════════════════
   REPLY BLOCKS: Nested mini-codeblock
   ════════════════════════════════════════════ */

li.sw-group-solo ${repliedMessage},
li.sw-group-start ${repliedMessage} {
  background: rgba(0, 0, 0, 0.25) !important;
  border: 1px solid rgba(59, 130, 246, 0.15) !important;
  border-left: 2px solid rgba(59, 130, 246, 0.3) !important;
  border-radius: 2px !important;
  padding: 4px 8px !important;
  margin-bottom: 4px !important;
}

li.sw-self.sw-group-solo ${repliedMessage},
li.sw-self.sw-group-start ${repliedMessage} {
  border-color: rgba(155, 50, 255, 0.15) !important;
  border-left-color: rgba(155, 50, 255, 0.3) !important;
}

/* ════════════════════════════════════════════
   EMBEDS: Codeblock accent
   ════════════════════════════════════════════ */

li.sw-group-solo ${embedWrapper},
li.sw-group-start ${embedWrapper},
li.sw-group-middle ${embedWrapper},
li.sw-group-end ${embedWrapper} {
  background: rgba(0, 0, 0, 0.25) !important;
  border: 1px solid rgba(59, 130, 246, 0.15) !important;
  border-left: 2px solid rgba(59, 130, 246, 0.3) !important;
  border-radius: 2px !important;
}

li.sw-self ${embedWrapper} {
  border-color: rgba(155, 50, 255, 0.15) !important;
  border-left-color: rgba(155, 50, 255, 0.3) !important;
}

/* ════════════════════════════════════════════
   MENTIONED: Crimson "Emergency Quest" accent
   ════════════════════════════════════════════ */

li.sw-mentioned {
  border-left-color: rgba(239, 68, 68, 0.7) !important;
  border-right-color: rgba(239, 68, 68, 0.25) !important;
  background: rgba(239, 68, 68, 0.08) !important;
}

li.sw-mentioned.sw-group-solo,
li.sw-mentioned.sw-group-start {
  border-top-color: rgba(239, 68, 68, 0.25) !important;
}

li.sw-mentioned.sw-group-solo,
li.sw-mentioned.sw-group-end {
  border-bottom-color: rgba(239, 68, 68, 0.25) !important;
}

/* Kill the theme's mention bg + ::before bar inside codeblocks */
li.sw-mentioned div${mentioned} {
  background: transparent !important;
}
li.sw-mentioned div${mentioned}::before {
  display: none !important;
}

/* Kill Discord's native message hover highlight inside codeblocks */
li.sw-group-solo div${message}:hover,
li.sw-group-start div${message}:hover,
li.sw-group-middle div${message}:hover,
li.sw-group-end div${message}:hover,
li.sw-group-solo div[role="article"]:hover,
li.sw-group-start div[role="article"]:hover,
li.sw-group-middle div[role="article"]:hover,
li.sw-group-end div[role="article"]:hover {
  background: transparent !important;
}

/* Mentioned hover: crimson glow */
li.sw-mentioned.sw-group-solo:hover,
li.sw-mentioned.sw-group-start:hover,
li.sw-mentioned.sw-group-middle:hover,
li.sw-mentioned.sw-group-end:hover {
  box-shadow: 0 0 18px rgba(239, 68, 68, 0.5),
              0 0 40px rgba(239, 68, 68, 0.2),
              inset 0 0 12px rgba(239, 68, 68, 0.1) !important;
  border-left-color: rgba(239, 68, 68, 1) !important;
}
`;
}

module.exports = { buildCSS };
