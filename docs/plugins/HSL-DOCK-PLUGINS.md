# HSL Dock Plugins (Critical Runtime Notes)

Last updated: 2026-02-13

## Purpose
These two plugins are the stable solution for the bottom Horizontal Server List workflow:

- `HSLWheelBridge.plugin.js`
- `HSLDockAutoHide.plugin.js`

Use both together.

## Why These Plugins Exist
The current Horizontal Server List setup is rotation-based (`rotate(-90deg)` pattern from the popular HSL CSS).  
Because of that, normal "horizontal looking" movement is actually driven by the scroller's vertical axis.

Result:
- CSS alone is not enough for natural horizontal gesture behavior.
- A small wheel bridge plugin is required for consistent interaction.

## Plugin 1: HSLWheelBridge

File:
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/plugins/HSLWheelBridge.plugin.js`

### What it does
- Hooks only the server dock scroller.
- Maps:
  - horizontal wheel/trackpad delta (`deltaX`)
  - `Shift + wheel` (`deltaY`)
- Into the rotated scroller's `scrollTop`.

### Scope
- Selector is intentionally narrow:
  - `nav[aria-label='Servers sidebar'] ul[role='tree'] > div[class^='itemsContainer_'] > div[class^='stack_'][class*='scroller_'][class*='scrollerBase_']`
- No changes to other Discord scroll containers.

## Plugin 2: HSLDockAutoHide

File:
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/plugins/HSLDockAutoHide.plugin.js`

### What it does
- Auto-hides/shows the bottom dock.
- Show conditions:
  - cursor enters dock
  - cursor is near bottom reveal zone
- Hide condition:
  - cursor leaves + short delay

### Dynamic UI movement
- Adds/removes root classes:
  - `sl-dock-autohide`
  - `sl-dock-visible`
  - `sl-dock-hidden`
- Updates CSS variables at runtime:
  - `--sl-dock-height`
  - `--sl-dock-peek`
- Moves core content using `margin-bottom` transitions so layout responds with the dock.

## Required Theme Behavior

Server dock scroller should remain axis-compatible with rotated HSL behavior:

- `overflow: hidden scroll`
- `overflow-y: auto`
- `overflow-x: hidden`

If these are changed, `HSLWheelBridge` may feel broken.

## Deployment

Both plugins are included in:
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/scripts/deploy-betterdiscord-runtime.sh`

Deploy command:
```bash
/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/scripts/deploy-betterdiscord-runtime.sh
```

Runtime targets:
- `/Users/matthewthompson/Library/Application Support/BetterDiscord/plugins/HSLWheelBridge.plugin.js`
- `/Users/matthewthompson/Library/Application Support/BetterDiscord/plugins/HSLDockAutoHide.plugin.js`

## Enable Order (Recommended)
1. Enable `HSLWheelBridge`
2. Enable `HSLDockAutoHide`
3. Reload Discord (`Cmd+R`)

## Quick Troubleshooting

If wheel bridge does nothing:
- Verify the dock selector still exists (Discord class/name changes can break target path).
- Ensure `HSLWheelBridge` is enabled in BetterDiscord plugins.
- Confirm no other plugin is globally intercepting wheel events first.

If auto-hide works but layout does not move:
- Ensure `HSLDockAutoHide` is enabled.
- Check if other theme/plugin rules override `.content__5e434` margin transitions.

If behavior regresses after updates:
- Re-run deploy script.
- Re-check this doc + plugin selectors first before broad CSS rewrites.

