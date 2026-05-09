# Theme Visual Regression Checklist (Post-Organize)

Use this after the organized theme deployment.

## How To Run
1. Open Discord and visit each area below.
2. For each area, run `Ctrl+Shift+Y` (ThemeCSSAudit) once.
3. After all areas, run:

```bash
/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/scripts/summarize-theme-audits-since-marker.js
```

4. Read output:
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/docs/THEME_POST_CHANGE_AUDIT_SUMMARY.md`

## Area Pass Checklist
- [ ] Theme Shell & Global: background overlays, base text contrast, no unexpected transparency.
- [ ] Server Sidebar & Home: Home icon, server icon hover, no purple left-edge pill artifacts.
- [ ] Channel Sidebar: unread dots, selected channel visuals, thread connector lines.
- [ ] DM List: selected DM row, hover state, icon visibility.
- [ ] Chat Messages: message hover, crit-hit message styling, no left-edge text artifacts.
- [ ] Message Composer: input focus glow, send/attach buttons, placeholder readability.
- [ ] Embeds & Media: YouTube/GIF/image embeds, border consistency, no double accent bars.
- [ ] Members List: member row readability and hover styles.
- [ ] User Area / Profile Strip: avatar/action row styling, no broken opacity.
- [ ] Menus/Tooltips/Popouts: context menu hover, tooltip readability.
- [ ] Settings UI: tab list, selected tabs, action buttons (primary/destructive).
- [ ] BetterDiscord UI: plugin/theme pages, any bd-specific panels.
- [ ] Scrollbars: chat/settings/sidebar scrollbar visibility and hover.

## Marker
Audit marker file (UTC baseline):
- `/Users/matthewthompson/Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-assets/themes/organized/post-change-audit-marker.txt`

If you want a fresh run set, overwrite marker with current UTC time and repeat.
