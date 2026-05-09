const STEALTH_SETTINGS_CSS = `
/* ── Font Override ───────────────────────────────────────────── */
.sl-stealth-settings,
.sl-stealth-settings * {
  font-family: 'Friend or Foe BB', sans-serif !important;
}

.sl-stealth-settings input[type="checkbox"] {
  cursor: pointer;
}

.sl-stealth-settings input[type="checkbox"]:focus-visible {
  outline: 2px solid rgba(168, 85, 247, 0.9);
  outline-offset: 2px;
  border-radius: 2px;
}
`;

module.exports = { STEALTH_SETTINGS_CSS };
