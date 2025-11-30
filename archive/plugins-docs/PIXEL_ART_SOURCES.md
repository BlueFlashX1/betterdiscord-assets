# Guide to Finding Pixel Art Snake Sprite Sheets

## 🎨 Best Sources for Free Pixel Art Snake Sprites

### 1. **OpenGameArt.org** (Recommended - CC0/Free)
**URL:** https://opengameart.org

**Why it's great:**
- Largest collection of free game art
- Clear licensing (CC0 = completely free, no attribution required)
- Search filters for license type, tags, and format
- Community-driven with quality ratings

**How to search:**
- Search: "snake sprite" or "pixel snake"
- Filter by: License (CC0, CC-BY), Format (PNG, Sprite Sheet)
- Tags: `pixel-art`, `snake`, `rpg`, `2d`

**Example assets:**
- "Snake Sprite Sheet" by Blooming Pixels (CC0)
- Various snake animations and sprites

---

### 2. **Itch.io** (Mix of Free & Paid)
**URL:** https://itch.io/game-assets/free/tag-pixel-art

**Why it's great:**
- Mix of free and paid assets
- High-quality indie game assets
- Often includes animations
- Direct download links

**How to search:**
- Browse: Game Assets → Free → Tag: pixel-art
- Search: "snake sprite" or "pixel snake"
- Filter by: Price (Free), Format (PNG, Sprite Sheet)

**Example creators:**
- Elthen's Pixel Art Shop (paid, but high quality)
- Various free snake sprite packs

---

### 3. **Kenney.nl** (Free CC0 Assets)
**URL:** https://kenney.nl/assets

**Why it's great:**
- All assets are CC0 (completely free)
- Professional quality
- Well-organized sprite sheets
- No attribution required

**How to search:**
- Browse: Animal Pack, Nature Pack
- Search: "snake" or "creature"
- Download entire packs or individual sprites

---

### 4. **Pixilart** (Community Gallery)
**URL:** https://www.pixilart.com/gallery

**Why it's great:**
- Community-created pixel art
- Can browse and download
- Various styles and sizes
- **⚠️ Check licensing** - varies by artist

**How to search:**
- Search: "snake" or "pixel snake"
- Filter by: Tags, Size, Style
- **Always check artist's license/terms**

---

### 5. **Lospec** (Pixel Art Community)
**URL:** https://lospec.com/pixel-art-gallery

**Why it's great:**
- High-quality pixel art community
- Tutorials and resources
- Searchable gallery
- **⚠️ Check licensing** - varies by artist

**How to search:**
- Browse: Gallery → Search "snake"
- Filter by: Tags, Palette, Size
- **Contact artist for usage rights**

---

### 6. **Craftpix.net** (Free & Paid)
**URL:** https://craftpix.net

**Why it's great:**
- Professional game assets
- Free section available
- Sprite sheets with animations
- Clear licensing

**How to search:**
- Browse: Free Game Assets → Search "snake"
- Filter by: Free, Format (Sprite Sheet)

---

## 🔍 Search Tips

### Effective Search Terms
- `pixel snake sprite`
- `8-bit snake sprite sheet`
- `retro snake animation`
- `rpg snake sprite`
- `game snake pixel art`
- `snake sprite sheet png`

### What to Look For
✅ **Good sprite sheets include:**
- Multiple frames for animation (idle, move, etc.)
- Consistent size and style
- Transparent background (PNG with alpha)
- Clear documentation (frame count, size)
- Multiple directions (4 or 8 directions)

✅ **File formats:**
- PNG (with transparency) - Best
- GIF (animated) - Good for preview
- Sprite sheet (multiple frames in one image)

---

## 📋 Licensing Guide

### CC0 (Public Domain)
- ✅ **Completely free**
- ✅ **No attribution required**
- ✅ **Commercial use allowed**
- ✅ **Modify freely**
- **Best for:** Commercial projects, no hassle

### CC-BY (Creative Commons Attribution)
- ✅ **Free to use**
- ⚠️ **Must credit the artist**
- ✅ **Commercial use allowed**
- ✅ **Modify freely**
- **Best for:** Projects where you can add credits

### CC-BY-SA (Share Alike)
- ✅ **Free to use**
- ⚠️ **Must credit artist**
- ⚠️ **Must share under same license**
- ✅ **Commercial use allowed**
- **Best for:** Open source projects**

### Commercial License
- ⚠️ **Usually paid**
- ✅ **Full commercial rights**
- ✅ **No attribution required**
- **Best for:** Professional projects with budget

---

## 🎯 Recommended Workflow

### Step 1: Search OpenGameArt.org
1. Go to https://opengameart.org
2. Search "snake sprite"
3. Filter: License = CC0
4. Download sprite sheets

### Step 2: Check Itch.io Free Assets
1. Browse free pixel art assets
2. Search for "snake"
3. Check licensing (usually in description)
4. Download if suitable

### Step 3: Verify Quality
- ✅ Sprite size matches your needs (16x16, 32x32, etc.)
- ✅ Transparent background
- ✅ Consistent style
- ✅ Multiple frames if needed
- ✅ Clear, readable at your scale

### Step 4: Test in Your Plugin
- Load sprite sheet
- Extract individual frames if needed
- Test rendering at your snake size
- Adjust if needed

---

## 🛠️ How to Use Sprite Sheets in Your Plugin

### Option 1: Load External Image
```javascript
loadSpriteSheet(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      this.snakeSprites.spriteSheet = img;
      this.snakeSprites.loaded = true;
      resolve();
    };
    img.onerror = reject;
    img.src = url; // URL to sprite sheet PNG
  });
}
```

### Option 2: Use Data URL (Embedded)
- Convert sprite sheet to base64
- Embed directly in code
- No external file needed

### Option 3: Host Locally
- Download sprite sheet
- Place in plugin directory
- Load from local path

---

## 📚 Additional Resources

### Pixel Art Tools
- **Aseprite** - Professional pixel art editor
- **Piskel** - Free online pixel art editor
- **GIMP** - Free image editor with pixel tools

### Sprite Sheet Tools
- **TexturePacker** - Create sprite sheets
- **ShoeBox** - Free sprite sheet tools
- **Online sprite sheet splitter** - Extract frames

### Learning Resources
- **Lospec Pixel Art Tutorials** - Learn to create your own
- **Pixel Art Fundamentals** - Understand pixel art principles

---

## ⚠️ Important Notes

1. **Always check licensing** - Even on "free" sites, verify terms
2. **Credit when required** - If license requires attribution, add it
3. **Respect artist rights** - Don't use without permission
4. **Test before using** - Ensure sprites work at your scale
5. **Keep originals** - Save original files for reference

---

## 🎨 Quick Links

- **OpenGameArt.org:** https://opengameart.org/content/search?keys=snake+sprite
- **Itch.io Free Assets:** https://itch.io/game-assets/free/tag-pixel-art
- **Kenney.nl:** https://kenney.nl/assets
- **Lospec Gallery:** https://lospec.com/pixel-art-gallery

---

## 💡 Pro Tips

1. **Start with CC0 assets** - No legal worries
2. **Look for sprite sheets with animations** - More versatile
3. **Check sprite size** - Match your plugin's scale needs
4. **Test multiple sources** - Different styles available
5. **Consider creating your own** - If you can't find the perfect match

---

**Last Updated:** 2025-01-29
**For:** BetterDiscord PixelSnake Plugin Development
