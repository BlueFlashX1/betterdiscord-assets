# ThemeCSSAudit Plugin

## Purpose
Audit active BetterDiscord theme selectors against the live Discord DOM to identify likely dead CSS.

## Plugin File
- Source: `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/plugins/ThemeCSSAudit.plugin.js`
- Runtime: `/Users/matthewthompson/Library/Application Support/BetterDiscord/plugins/ThemeCSSAudit.plugin.js`

## Run
1. Enable `ThemeCSSAudit` in BetterDiscord -> Plugins.
2. Press `Ctrl+Shift+Y`.
3. Review on-screen summary panel.

## Report Output
Reports are written to:
- `/Users/matthewthompson/Library/Application Support/BetterDiscord/plugins/reports/`

Files created per run:
- `theme-css-audit-<timestamp>.json`
- `theme-css-audit-<timestamp>.md`

## Interpretation Rules
- `Likely unused` means no DOM match in the **current** Discord view/state.
- Before deleting selectors, navigate through channels/settings/modals and rerun.
- Selectors with pseudo-elements and dynamic states are normalized to reduce false positives.

## Deployment
`ThemeCSSAudit.plugin.js` is included in:
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/scripts/deploy-betterdiscord-runtime.sh`

So manual deploy or the fswatch auto-rsync pipeline will keep runtime updated.

## Confidence Scoring (v1.2.0)
The plugin now tracks selector outcomes across runs and writes:
- `/Users/matthewthompson/Library/Application Support/BetterDiscord/plugins/reports/theme-css-audit-history.json`

Per selector stats include:
- `usedRuns`
- `unusedRuns`
- `invalidRuns`
- `seenRuns`
- `deadConfidence`

Interpretation:
- `deadConfidence = 1.0` + `seenRuns >= 3` + `usedRuns = 0` -> high-confidence dead candidate.
- Any `usedRuns > 0` means it has matched live DOM at least once and should be treated as active.
