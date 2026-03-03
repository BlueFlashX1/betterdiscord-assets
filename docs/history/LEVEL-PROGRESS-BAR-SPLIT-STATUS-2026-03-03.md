# LevelProgressBar Split Status (2026-03-03)

## Scope Covered

This document summarizes what was completed for the `LevelProgressBar` controlled split and what still remains.

Primary commit:
- `aeb8a04` (`refactor(level-progress-bar): split runtime/style helpers and harden deploy`)

## What Was Covered

1. Safe split research completed before code changes
- Verified packaging/deploy risk for sidecar files.
- Verified plugin method coupling and selected a controlled split boundary.

2. LevelProgressBar split implementation
- Extracted style payload to:
  - `plugins/LevelProgressBarStyles.js`
- Extracted recon/progress runtime helper logic to:
  - `plugins/LevelProgressBarRuntimeHelpers.js`
- Kept `plugins/LevelProgressBar.plugin.js` as orchestrator with delegated calls.
- Added runtime helper fallback behavior via `_invokeRuntimeHelper(...)` to avoid hard crashes if helper file is missing.

3. Deployment + linking hardening (to avoid missing helper files at runtime)
- Updated helper copy list in:
  - `scripts/deploy-betterdiscord-runtime.sh`
- Updated helper symlink list in:
  - `scripts/link-all-plugins.sh`

4. Installation docs updated
- Updated `README.md` to include helper file copy requirements:
  - `SoloLevelingUtils.js`
  - `UnifiedSaveManager.js`
  - `LevelProgressBarStyles.js`
  - `LevelProgressBarRuntimeHelpers.js`

5. Readability/navigation improvements
- Added major section headers in `LevelProgressBar.plugin.js`:
  - Bootstrap + Rendering
  - Settings + Persistence
  - Styles + DOM Mount
  - Data Access + Caching
  - Runtime-Delegated Recon + Progress Logic
  - Event Wiring + Polling
  - Diagnostics + UI Effects

## Verification Performed

1. Static syntax checks
- `node --check` passed for:
  - `plugins/LevelProgressBar.plugin.js`
  - `plugins/LevelProgressBarStyles.js`
  - `plugins/LevelProgressBarRuntimeHelpers.js`
- `bash -n` passed for:
  - `scripts/deploy-betterdiscord-runtime.sh`
  - `scripts/link-all-plugins.sh`

2. Architecture lint
- `archlint scan plugins/LevelProgressBar.plugin.js` result: no smells.

3. Runtime harness checks
- Confirmed runtime helpers load when present.
- Confirmed delegated methods execute through helper module.
- Confirmed non-crash fallback behavior for missing helper methods.

4. File-size outcome
- `plugins/LevelProgressBar.plugin.js` reduced from ~1875 lines to ~927 lines.

## What Remains

1. In-app regression verification (manual)
- Validate in real BetterDiscord runtime:
  - progress fill and text updates
  - recon intel rendering
  - event-driven refresh behavior
  - fallback polling behavior
  - startup/stop lifecycle without console errors

2. Optional hardening cleanup
- Replace fallback `debugError` noise for missing runtime helper with a quieter one-time `debugLog` if desired.
- Consider adding a tiny shared helper loader utility to reduce repeated `_bdLoad(...)` patterns across plugins.

3. Optional follow-up optimization
- If needed, split event wiring block into its own helper module.
- Keep complexity low; only split further if a concrete issue or lint threshold requires it.

## Changed Files (Current State)

- `plugins/LevelProgressBar.plugin.js`
- `plugins/LevelProgressBarStyles.js`
- `plugins/LevelProgressBarRuntimeHelpers.js`
- `scripts/deploy-betterdiscord-runtime.sh`
- `scripts/link-all-plugins.sh`
- `README.md`
