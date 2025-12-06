# CriticalHit Plugin - Fonts Folder

## Folder Structure

Place this `fonts/` folder next to your `CriticalHit.plugin.js` file:

```
BetterDiscord/
└── plugins/
    ├── CriticalHit.plugin.js
    └── CriticalHit/
        └── fonts/
            ├── NovaFlat.woff2
            ├── NovaFlat.woff
            ├── Impact.woff2
            └── (other font files...)
```

## How to Add Fonts

1. **Download your font files** in one or more of these formats:

   - `.woff2` (recommended - best compression, smallest file size)
   - `.woff` (good compatibility, medium file size)
   - `.ttf` (fallback, larger file size)

2. **Rename the font file** to match the font name (remove spaces):

   - Font name: `Nova Flat` → File name: `NovaFlat.woff2`
   - Font name: `Impact` → File name: `Impact.woff2`
   - Font name: `Bebas Neue` → File name: `BebasNeue.woff2`
   - Font name: `Orbitron` → File name: `Orbitron.woff2`

3. **Place the font file(s)** in this `fonts/` folder

4. **Enable local fonts in plugin settings**:
   - Open CriticalHit plugin settings
   - Set `useLocalFonts` to `true` (required for Friend or Foe BB and Vampire Wars)
   - `critFont` defaults to `'Friend or Foe BB'` (Solo Leveling theme - auto-enabled for local fonts)
   - `animationFont` defaults to `'Vampire Wars'` (dramatic animation font)
   - Both fonts will auto-load from local files when `useLocalFonts` is enabled

## Supported Font Formats

The plugin will automatically try to load fonts in this order:

1. `.woff2` (Web Open Font Format 2.0 - best compression, modern browsers)
2. `.woff` (Web Open Font Format - good compatibility)
3. `.ttf` (TrueType Font - fallback for older browsers)

**Recommendation**: Include at least `.woff2` and `.woff` for best compatibility.

## Example Font Names

| Font Name         | File Names                                                       | Use Case                          |
| ----------------- | ---------------------------------------------------------------- | --------------------------------- |
| `Vampire Wars`    | `VampireWars.woff2`, `VampireWars.woff`, `VampireWars.ttf`       | Animation (dramatic/stylized)     |
| `Eternal`         | `Eternal.woff2`, `Eternal.woff`, `Eternal.ttf`                   | Animation (Solo Leveling style!)  |
| `Solo Level Demo` | `SoloLevelDemo.woff2`, `SoloLevelDemo.woff`, `SoloLevelDemo.ttf` | Animation (Solo Leveling gothic)  |
| `Nova Flat`       | `NovaFlat.woff2`, `NovaFlat.woff`, `NovaFlat.ttf`                | Messages (readable, Google Fonts) |
| `Impact`          | `Impact.woff2`, `Impact.woff`, `Impact.ttf`                      | Animation (bold/impactful)        |
| `Bebas Neue`      | `BebasNeue.woff2`, `BebasNeue.woff`, `BebasNeue.ttf`             | Animation (modern)                |
| `Orbitron`        | `Orbitron.woff2`, `Orbitron.woff`, `Orbitron.ttf`                | Animation (futuristic)            |
| `Russo One`       | `RussoOne.woff2`, `RussoOne.woff`, `RussoOne.ttf`                | Animation (bold)                  |

## Font Strategy

- **Message Font** (`critFont`): Uses Solo Leveling theme font "Friend or Foe BB" (loaded from local files)

  - Default: `'Friend or Foe BB'` (Solo Leveling theme - requires local font files)
  - Purpose: Epic Solo Leveling aesthetic for message gradient text
  - **Font Credit**: Icons made from [svg icons](https://www.onlinewebfonts.com/icon) is licensed by CC BY 4.0

- **Animation Font** (`animationFont`): Uses dramatic/stylized fonts like Vampire Wars (loaded from local files)
  - Default: `'Vampire Wars'` (requires local font files)
  - Purpose: Create dramatic visual impact for floating animation

## Where to Download Fonts

- **Google Fonts**: https://fonts.google.com
  - Click on a font → "Download family" → Extract and use the `.woff2` or `.woff` files
- **Font Squirrel**: https://www.fontsquirrel.com (free fonts)
- **DaFont**: https://www.dafont.com (free fonts)

### Solo Leveling Fonts (Recommended for Animation!)

- **Eternal** (by FG Studios) - Official Solo Leveling style font

  - Download: https://www.dafont.com (search "Eternal")
  - Style: Bold, angular, high-contrast, dramatic
  - Perfect for: Epic critical hit animations
  - File name: `Eternal.woff2` or `Eternal.woff`

- **Solo Level Demo** (by Aphriell Art) - Modern gothic Solo Leveling font
  - Download: https://fonts2u.com/solo-level-demo.font
  - Style: Bold, semi-condensed, sleek, edgy
  - Perfect for: Modern Solo Leveling aesthetic
  - File name: `SoloLevelDemo.woff2` or `SoloLevelDemo.woff`

## Converting Font Formats

If you only have `.ttf` files, you can convert them to `.woff2`:

- **Online**: https://cloudconvert.com/ttf-to-woff2
- **Command line**: Use `woff2_compress` tool

## Notes

- Font names are **case-sensitive** - use the exact name as it appears in the font file metadata
- The plugin will automatically **fall back to Google Fonts** if local fonts fail to load
- You can have **multiple fonts** in this folder and switch between them by changing `animationFont` in settings
- Font files are loaded once when the plugin starts - restart Discord after adding new fonts

## Troubleshooting

**Font not loading?**

1. Check that the file name matches the font name (spaces removed)
2. Verify the file is in the correct folder: `plugins/CriticalHit/fonts/`
3. Check browser console for errors
4. Try enabling debug mode in plugin settings
5. Ensure `useLocalFonts` is set to `true` in settings

**Font looks wrong?**

- Make sure you're using the correct font name (check font file metadata)
- Try different font formats (woff2, woff, ttf)
- Clear Discord cache and restart
