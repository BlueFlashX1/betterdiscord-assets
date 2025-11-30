# Solo Leveling Theme

A dark purple theme with glowing effects inspired by Solo Leveling, featuring:

- **Dark purple color palette** with deep backgrounds
- **Glowing effects** throughout the UI
- **Smooth animations** and transitions
- **Orbitron font** for a futuristic feel
- **Comprehensive styling** for all Discord elements

## Installation

1. Copy `SoloLeveling.theme.css` to your BetterDiscord themes folder:
   ```bash
   cp SoloLeveling.theme.css ~/Library/Application\ Support/BetterDiscord/themes/
   ```

2. Open Discord Settings → Themes
3. Enable "Solo Leveling" theme

## Features

### Color Scheme
- **Primary Background**: Deep dark (#0a0a0f)
- **Secondary Background**: Dark purple-tinted (#0f0f1a)
- **Purple Accents**: Multiple shades (8a2be2, 9370db, ba55d3)
- **Text Colors**: Light purple/white for readability

### Glow Effects
- Soft glows on hover states
- Medium glows on selected elements
- Strong glows on modals and important UI
- Animated pulsing glow on selected channels

### Styled Elements
- Server list with hover effects
- Channel list with selected state glow
- Message bubbles with subtle hover
- Input fields with focus glow
- Buttons with gradient backgrounds
- Scrollbars with purple accent
- Status indicators with glow
- Modals and context menus
- Activity feed
- Voice channels
- Reactions
- Threads
- And more!

## Customization

The theme uses CSS variables for easy customization. Edit the `:root` section to change colors:

```css
:root {
  --solo-purple-primary: #8a2be2;  /* Main purple */
  --solo-purple-accent: #ba55d3;    /* Accent purple */
  --solo-bg-primary: #0a0a0f;       /* Main background */
  /* ... more variables */
}
```

## Compatibility

- Works with BetterDiscord plugins
- Compatible with Solo Leveling Stats plugin
- Compatible with Critical Hit plugin
- Tested on Discord desktop app

## Notes

- Discord's class names may change with updates, requiring theme updates
- Some elements may need additional selectors if Discord changes structure
- Performance impact is minimal due to efficient CSS
