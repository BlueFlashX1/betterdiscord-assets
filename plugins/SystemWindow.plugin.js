/**
 * @name SystemWindow
 * @description Styles Discord messages as Solo Leveling System windows — codeblock-style grouped containers. Purple for your messages (Monarch), blue for others (System).
 * @version 2.6.0
 * @author BlueFlashX1
 * @source https://github.com/BlueFlashX1/betterdiscord-assets
 */

// src/SystemWindow/styles.css
var styles_default = `/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   SystemWindow v2.5.0 \u2014 LI-level codeblock wrapping
   Wraps avatar + username + timestamp + message text

   Colors:
     BLUE:   59, 130, 246  (#3b82f6) \u2014 System (others)
     PURPLE: 155, 50, 255  (#9b32ff) \u2014 Monarch (self)
     BG:     rgba(0, 0, 0, 0.55) \u2014 Darker codeblock background
     R:      2px \u2014 Border radius
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   PRE-STYLE: CSS-only base applied to ALL message
   items BEFORE JS classification. Prevents the flash
   when Discord replaces DOM nodes on re-render.
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

li[class*="messageListItem_"] {
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
li[class*="messageListItem_"]:has(div[class*="mentioned"]) {
  border-left-color: rgba(239, 68, 68, 0.7) !important;
  border-right-color: rgba(239, 68, 68, 0.25) !important;
  border-top-color: rgba(239, 68, 68, 0.25) !important;
  border-bottom-color: rgba(239, 68, 68, 0.25) !important;
  background: rgba(239, 68, 68, 0.08) !important;
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   BASE: Classified messages (JS-applied)
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

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

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   SOLO: Full border + full radius
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

li.sw-group-solo {
  border-top: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-radius: 2px !important;
  margin-top: 12px !important;
  margin-bottom: 12px !important;
  padding-bottom: 10px !important;
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   GROUP START: Top border + top radius
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

li.sw-group-start {
  border-top: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-bottom: none !important;
  border-radius: 2px 2px 0 0 !important;
  margin-top: 12px !important;
  margin-bottom: 0 !important;
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   GROUP MIDDLE: Side borders only
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

li.sw-group-middle {
  border-top: none !important;
  border-bottom: none !important;
  border-radius: 0 !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   GROUP END: Bottom border + bottom radius
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

li.sw-group-end {
  border-top: none !important;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2) !important;
  border-radius: 0 0 2px 2px !important;
  margin-top: 0 !important;
  margin-bottom: 12px !important;
  padding-bottom: 10px !important;
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   SELF: Purple accent (Monarch)
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

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

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   HOVER: Glow on the codeblock
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

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

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   AVATAR: Clean circle inside codeblock
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

li.sw-group-solo [class*="avatar"],
li.sw-group-start [class*="avatar"] {
  z-index: 1 !important;
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   USERNAMES: System label feel
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

li.sw-group-solo [class*="username"],
li.sw-group-start [class*="username"] {
  letter-spacing: 0.03em !important;
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   TIMESTAMPS: Subtle metadata
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

li.sw-group-solo time, li.sw-group-start time,
li.sw-group-middle time, li.sw-group-end time,
li.sw-group-solo [class*="timestamp"],
li.sw-group-start [class*="timestamp"],
li.sw-group-middle [class*="timestamp"],
li.sw-group-end [class*="timestamp"] {
  opacity: 0.6 !important;
  font-size: 0.68rem !important;
  transition: opacity 200ms ease !important;
}

li.sw-group-solo:hover time, li.sw-group-start:hover time,
li.sw-group-middle:hover time, li.sw-group-end:hover time,
li.sw-group-solo:hover [class*="timestamp"],
li.sw-group-start:hover [class*="timestamp"],
li.sw-group-middle:hover [class*="timestamp"],
li.sw-group-end:hover [class*="timestamp"] {
  opacity: 0.8 !important;
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   REPLY BLOCKS: Nested mini-codeblock
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

li.sw-group-solo [class*="repliedMessage"],
li.sw-group-start [class*="repliedMessage"] {
  background: rgba(0, 0, 0, 0.25) !important;
  border: 1px solid rgba(59, 130, 246, 0.15) !important;
  border-left: 2px solid rgba(59, 130, 246, 0.3) !important;
  border-radius: 2px !important;
  padding: 4px 8px !important;
  margin-bottom: 4px !important;
}

li.sw-self.sw-group-solo [class*="repliedMessage"],
li.sw-self.sw-group-start [class*="repliedMessage"] {
  border-color: rgba(155, 50, 255, 0.15) !important;
  border-left-color: rgba(155, 50, 255, 0.3) !important;
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   EMBEDS: Codeblock accent
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

li.sw-group-solo [class*="embedWrapper"],
li.sw-group-start [class*="embedWrapper"],
li.sw-group-middle [class*="embedWrapper"],
li.sw-group-end [class*="embedWrapper"] {
  background: rgba(0, 0, 0, 0.25) !important;
  border: 1px solid rgba(59, 130, 246, 0.15) !important;
  border-left: 2px solid rgba(59, 130, 246, 0.3) !important;
  border-radius: 2px !important;
}

li.sw-self [class*="embedWrapper"] {
  border-color: rgba(155, 50, 255, 0.15) !important;
  border-left-color: rgba(155, 50, 255, 0.3) !important;
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   MENTIONED: Crimson "Emergency Quest" accent
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

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
li.sw-mentioned div[class*="mentioned_"] {
  background: transparent !important;
}
li.sw-mentioned div[class*="mentioned_"]::before {
  display: none !important;
}

/* Kill Discord's native message hover highlight inside codeblocks */
li.sw-group-solo div[class*="message_"]:hover,
li.sw-group-start div[class*="message_"]:hover,
li.sw-group-middle div[class*="message_"]:hover,
li.sw-group-end div[class*="message_"]:hover,
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

// src/SystemWindow/index.js
function _bdLoad(fileName) {
  if (!fileName) return null;
  try {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(path.join(BdApi.Plugins.folder, fileName), "utf8");
    const moduleObj = { exports: {} };
    const factory = new Function(
      "module",
      "exports",
      "require",
      "BdApi",
      `${source}
return module.exports || exports || null;`
    );
    const loaded = factory(moduleObj, moduleObj.exports, require, BdApi);
    const candidate = loaded || moduleObj.exports;
    if (typeof candidate === "function") return candidate;
    if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) return candidate;
  } catch (_) {
  }
  return null;
}
var _PluginUtils;
try {
  _PluginUtils = _bdLoad("BetterDiscordPluginUtils.js");
} catch (_) {
  _PluginUtils = null;
}
var SW_POS_CLASSES = ["sw-group-solo", "sw-group-start", "sw-group-middle", "sw-group-end"];
module.exports = class SystemWindow {
  constructor() {
    this._STYLE_ID = "system-window-css";
    this._defaultSettings = {
      enabled: true,
      debugMode: false
    };
    this.settings = structuredClone(this._defaultSettings);
    this._observer = null;
    this._pollInterval = null;
    this._throttleTimer = null;
    this._lastScrollerEl = null;
    this._classifyRAF = null;
    this._classifyVersion = 0;
    this._started = false;
  }
  /* ═══════════════════════════════════════════════
     §1  Lifecycle
     ═══════════════════════════════════════════════ */
  start() {
    var _a, _b, _c;
    if (this._started) {
      this.stop();
    }
    this._toast = ((_a = _PluginUtils == null ? void 0 : _PluginUtils.createToastHelper) == null ? void 0 : _a.call(_PluginUtils, "systemWindow")) || ((msg, type = "info") => BdApi.UI.showToast(msg, { type: type === "level-up" ? "info" : type }));
    this.settings = {
      ...this._defaultSettings,
      ...BdApi.Data.load("SystemWindow", "settings") || {}
    };
    try {
      this._UserStore = BdApi.Webpack.getStore("UserStore");
      this._currentUserId = ((_c = (_b = this._UserStore) == null ? void 0 : _b.getCurrentUser()) == null ? void 0 : _c.id) || null;
    } catch (e) {
      this._UserStore = null;
      this._currentUserId = null;
    }
    if (this.settings.enabled) {
      this._injectCSS();
      this._attachObserver();
    }
    this._started = true;
    this._toast("SystemWindow active", "success", 2e3);
  }
  stop() {
    BdApi.DOM.removeStyle(this._STYLE_ID);
    this._detachObserver();
    this._cleanupClasses();
    this._currentUserId = null;
    this._started = false;
  }
  /* ═══════════════════════════════════════════════
     §2  Observer — Classify message groups
     ═══════════════════════════════════════════════ */
  _attachObserver() {
    this._detachObserver();
    this._findAndObserve();
    if (_PluginUtils == null ? void 0 : _PluginUtils.NavigationBus) {
      this._navBusUnsub = _PluginUtils.NavigationBus.subscribe(() => this._checkChannelSwitch());
    }
    this._pollInterval = setInterval(() => {
      if (document.hidden) return;
      this._checkChannelSwitch();
    }, 1e4);
  }
  _checkChannelSwitch() {
    var _a, _b;
    try {
      const currentId = ((_b = (_a = this._UserStore) == null ? void 0 : _a.getCurrentUser()) == null ? void 0 : _b.id) || null;
      if (currentId && currentId !== this._currentUserId) {
        this._currentUserId = currentId;
        document.querySelectorAll('div[role="article"][data-sw-self]').forEach((el) => el.removeAttribute("data-sw-self"));
      }
    } catch (_) {
    }
    const scroller = document.querySelector('ol[role="list"][class*="scrollerInner_"]');
    if (!scroller) return;
    if (scroller !== this._lastScrollerEl) {
      this._lastScrollerEl = scroller;
      this._observeScroller(scroller);
      this._classifyMessages();
      if (this.settings.debugMode) {
        console.log("[SystemWindow] Channel switch detected \u2014 re-classified");
      }
    }
  }
  _findAndObserve(retryCount = 0) {
    const scroller = document.querySelector('ol[role="list"][class*="scrollerInner_"]');
    if (scroller) {
      this._lastScrollerEl = scroller;
      this._observeScroller(scroller);
      this._classifyMessages();
    } else if (retryCount < 10) {
      this._findRetryTimer = setTimeout(() => {
        if (this.settings.enabled) this._findAndObserve(retryCount + 1);
      }, 2e3);
    }
  }
  _observeScroller(scroller) {
    if (this._observer) this._observer.disconnect();
    this._observer = new MutationObserver(() => this._throttledClassify());
    this._observer.observe(scroller, { childList: true });
  }
  _detachObserver() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    if (this._findRetryTimer) {
      clearTimeout(this._findRetryTimer);
      this._findRetryTimer = null;
    }
    if (this._navBusUnsub) {
      this._navBusUnsub();
      this._navBusUnsub = null;
    }
    if (this._classifyRAF) {
      cancelAnimationFrame(this._classifyRAF);
      this._classifyRAF = null;
    }
    clearTimeout(this._throttleTimer);
    this._throttleTimer = null;
    this._lastScrollerEl = null;
  }
  _throttledClassify() {
    if (this._throttleTimer) return;
    this._throttleTimer = setTimeout(() => {
      this._throttleTimer = null;
      if (this._classifyRAF) cancelAnimationFrame(this._classifyRAF);
      this._classifyRAF = requestAnimationFrame(() => {
        this._classifyRAF = null;
        this._classifyMessages();
      });
    }, 150);
  }
  /* ═══════════════════════════════════════════════
     §3  Message Classification
     ═══════════════════════════════════════════════ */
  _getGroupSelfFlag(firstArticle) {
    if (firstArticle.hasAttribute("data-sw-self")) {
      return firstArticle.getAttribute("data-sw-self") === "1";
    }
    const isSelf = this._isOwnMessage(firstArticle);
    firstArticle.setAttribute("data-sw-self", isSelf ? "1" : "0");
    return isSelf;
  }
  _getDesiredGroupPosition(groupSize, index) {
    if (groupSize === 1) return "sw-group-solo";
    if (index === 0) return "sw-group-start";
    if (index === groupSize - 1) return "sw-group-end";
    return "sw-group-middle";
  }
  _syncPositionClass(li, desiredPos) {
    if (li.classList.contains(desiredPos)) return;
    li.classList.add(desiredPos);
    for (const cls of SW_POS_CLASSES) {
      if (cls !== desiredPos) li.classList.remove(cls);
    }
  }
  _syncToggleClass(li, className, shouldHave) {
    if (shouldHave) li.classList.add(className);
    else li.classList.remove(className);
  }
  _applyGroupClasses(li, desiredPos, wantSelf, wantMentioned) {
    const hasPos = li.classList.contains(desiredPos);
    const hasSelf = li.classList.contains("sw-self");
    const hasMentioned = li.classList.contains("sw-mentioned");
    if (hasPos && hasSelf === wantSelf && hasMentioned === wantMentioned) return;
    this._syncPositionClass(li, desiredPos);
    this._syncToggleClass(li, "sw-self", wantSelf);
    this._syncToggleClass(li, "sw-mentioned", wantMentioned);
  }
  _classifyGroup(group) {
    if (!group.length) return;
    const isSelf = this._getGroupSelfFlag(group[0].article);
    const groupSize = group.length;
    for (let i = 0; i < groupSize; i++) {
      const { li, article } = group[i];
      const desiredPos = this._getDesiredGroupPosition(groupSize, i);
      const wantMentioned = article.className.includes("mentioned");
      this._applyGroupClasses(li, desiredPos, isSelf, wantMentioned);
    }
  }
  _classifyMessages() {
    const scroller = this._lastScrollerEl || document.querySelector('ol[role="list"][class*="scrollerInner_"]');
    if (!scroller) return;
    const items = scroller.querySelectorAll(':scope > li[class*="messageListItem_"]');
    if (!items.length) return;
    this._classifyVersion = (this._classifyVersion || 0) + 1;
    const ver = String(this._classifyVersion);
    let groupCount = 0;
    let currentGroup = [];
    let groupHasNew = false;
    const flushGroup = () => {
      if (!currentGroup.length) return;
      if (groupHasNew) {
        this._classifyGroup(currentGroup);
        for (const { li } of currentGroup) {
          li.dataset.swVer = ver;
        }
      }
      groupCount++;
      currentGroup = [];
      groupHasNew = false;
    };
    for (const li of items) {
      const article = li.querySelector(':scope > div[role="article"]');
      if (!article) {
        flushGroup();
        continue;
      }
      const isGroupStart = article.className.includes("groupStart");
      if (isGroupStart) flushGroup();
      if (li.dataset.swVer !== ver) groupHasNew = true;
      currentGroup.push({ li, article });
    }
    flushGroup();
    if (this.settings.debugMode) {
      console.log(`[SystemWindow] Classified ${items.length} messages into ${groupCount} groups (v${ver})`);
    }
  }
  _isOwnMessage(article) {
    var _a, _b, _c, _d, _e, _f;
    if (!this._currentUserId || !article) return false;
    try {
      let fiber = BdApi.ReactUtils.getInternalInstance(article);
      for (let i = 0; i < 8 && fiber; i++) {
        const authorId = ((_c = (_b = (_a = fiber.memoizedProps) == null ? void 0 : _a.message) == null ? void 0 : _b.author) == null ? void 0 : _c.id) || ((_f = (_e = (_d = fiber.memoizedState) == null ? void 0 : _d.message) == null ? void 0 : _e.author) == null ? void 0 : _f.id);
        if (authorId) return authorId === this._currentUserId;
        fiber = fiber.return;
      }
    } catch (e) {
    }
    return false;
  }
  _cleanupClasses() {
    document.querySelectorAll(".sw-group-solo, .sw-group-start, .sw-group-middle, .sw-group-end, .sw-self, .sw-mentioned").forEach(
      (el) => el.classList.remove("sw-group-solo", "sw-group-start", "sw-group-middle", "sw-group-end", "sw-self", "sw-mentioned")
    );
    document.querySelectorAll('div[role="article"][data-sw-self]').forEach((el) => el.removeAttribute("data-sw-self"));
    document.querySelectorAll("li[data-sw-ver]").forEach((el) => delete el.dataset.swVer);
  }
  /* ═══════════════════════════════════════════════
     §4  CSS Injection
     ═══════════════════════════════════════════════ */
  _injectCSS() {
    BdApi.DOM.removeStyle(this._STYLE_ID);
    BdApi.DOM.addStyle(this._STYLE_ID, styles_default);
  }
  /* ═══════════════════════════════════════════════
     §5  Settings
     ═══════════════════════════════════════════════ */
  _saveSettings(next) {
    const merged = { ...this.settings, ...next };
    BdApi.Data.save("SystemWindow", "settings", merged);
    this.settings = merged;
  }
  getSettingsPanel() {
    var _a, _b;
    const panel = document.createElement("div");
    panel.style.cssText = "padding: 16px; background: #1e1e2e; border-radius: 0;";
    panel.innerHTML = `
      <div>
        <h2 style="margin: 0 0 4px 0; color: #dcddde; font-size: 18px;">SystemWindow</h2>
        <p style="margin: 0 0 16px 0; opacity: 0.6; font-size: 12px; color: #dcddde;">
          Codeblock-style message display with SL theming
        </p>
      </div>

      <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
        <label style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; cursor: pointer;">
          <input id="sw-enabled" type="checkbox" ${this.settings.enabled ? "checked" : ""} />
          <span style="color: #dcddde;">Enabled</span>
        </label>

        <label style="display: flex; gap: 10px; align-items: center; cursor: pointer;">
          <input id="sw-debug" type="checkbox" ${this.settings.debugMode ? "checked" : ""} />
          <span style="color: #dcddde;">Debug Mode</span>
        </label>
      </div>
    `;
    (_a = panel.querySelector("#sw-enabled")) == null ? void 0 : _a.addEventListener("change", (e) => {
      this._saveSettings({ enabled: e.target.checked });
      if (e.target.checked) {
        this._injectCSS();
        this._attachObserver();
      } else {
        BdApi.DOM.removeStyle(this._STYLE_ID);
        this._detachObserver();
        this._cleanupClasses();
      }
    });
    (_b = panel.querySelector("#sw-debug")) == null ? void 0 : _b.addEventListener("change", (e) => {
      this._saveSettings({ debugMode: e.target.checked });
    });
    return panel;
  }
};
