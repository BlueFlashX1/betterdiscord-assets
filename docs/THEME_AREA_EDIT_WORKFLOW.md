# Theme Area Edit Workflow (Runtime-Safe)

This workflow keeps runtime on the current source theme and only ports selected area edits intentionally.

## Active Runtime Source (unchanged)
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes/SoloLeveling-ClearVision.theme.css`

## Organized Reference
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes/organized/SoloLeveling-ClearVision.organized.reference.theme.css`
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes/organized/organization-manifest.json`

## Preview One Area
```bash
/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/scripts/preview-theme-area.js "Channel Sidebar"
```

## Recommended Edit Flow
1. Choose one area from the manifest.
2. Preview that area from organized reference.
3. Port only desired block changes into source theme file.
4. Deploy runtime:
```bash
/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/scripts/deploy-betterdiscord-runtime.sh
```
5. Validate visually + rerun `ThemeCSSAudit`.

## Safety
- Do not replace runtime source theme wholesale unless explicitly planned.
- Keep each change area-scoped and commit in small batches.
