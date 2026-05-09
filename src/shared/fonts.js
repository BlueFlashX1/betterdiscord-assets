/**
 * Shared font constants for the Solo Leveling plugin ecosystem.
 * All plugins should import from here instead of hardcoding font-family strings.
 */
module.exports = {
  /** Primary UI font — used for all text except code and ARISE animation */
  SL_FONT: "'Friend or Foe BB', sans-serif",
  /** Code/monospace font */
  SL_FONT_CODE: "'Consolas', 'Courier New', monospace",
  /** ARISE animation title font */
  SL_FONT_ARISE: "'Speedy Space Goat Oddity', 'Orbitron', sans-serif",

  /** CSS rule string for quick injection into style blocks */
  SL_FONT_RULE: "font-family: 'Friend or Foe BB', sans-serif !important;",
};
