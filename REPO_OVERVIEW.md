# Repository Overview - betterdiscord-assets

## 📊 Repository Statistics

- **Total Files**: 32 files
- **Plugins**: 7 production plugins
- **Themes**: 1 theme
- **Documentation**: 13 markdown files
- **Scripts**: 5 utility scripts
- **Config**: 3 configuration files

---

## 📦 Plugins (7)

### Core System Plugins:
1. **SoloLevelingStats.plugin.js** - Core stats/leveling system
2. **CriticalHit.plugin.js** - Critical hit message effects
3. **SkillTree.plugin.js** - Passive abilities system
4. **TitleManager.plugin.js** - Title management

### Visual Enhancement Plugins:
5. **LevelProgressBar.plugin.js** - Always-visible progress bar
6. **SoloLevelingToasts.plugin.js** - Custom toast notifications
7. **LevelUpAnimation.plugin.js** - Level up celebration animation

---

## 🎨 Themes (1)

1. **SoloLeveling-ClearVision.theme.css**
   - Dark purple Solo Leveling theme
   - Based on ClearVision v7
   - Orbitron font family
   - Performance optimized

---

## 📚 Documentation (13 files)

### Root Documentation:
- `README.md` - Main documentation (408 lines)
- `SECURITY_REVIEW.md` - Security audit report
- `GIT_SETUP.md` - Git repository setup guide
- `DEPLOY.md` - Deployment instructions
- `PUSH_COMMANDS.md` - Git push commands
- `REPO_OVERVIEW.md` - This file

### Plugin Documentation (`plugins/docs/`):
- `DEBUG_DISCORD.md` - Debugging guide
- `PIXEL_ART_SOURCES.md` - Pixel art resources
- `PLUGIN_ANALYSIS.md` - Plugin analysis
- `PLUGIN_IDEAS.md` - Plugin ideas list
- `SOLO-LEVELING-STATS-README.md` - Stats system docs
- `SOLO-LEVELING-STATS-VERIFICATION.md` - Verification guide

### Theme Documentation (`themes/docs/`):
- `README.md` - Theme overview
- `SOLO-LEVELING-THEME-README.md` - Detailed theme docs

### General Documentation (`docs/`):
- `CRITICAL-HIT-SETUP.md` - CriticalHit setup guide
- `CRITICAL-HIT-VERIFICATION.md` - Verification guide
- `IDEAS.md` - General ideas
- `QUICK-INSTALL.md` - Quick installation guide
- `SOLO-LEVELING-PLUGIN-IDEAS.md` - Plugin ideas

---

## 🔧 Scripts (5)

### Development Scripts (`scripts/`):
- `link-plugin.js` - Link plugin to BetterDiscord
- `link-theme.js` - Link theme to BetterDiscord
- `watch-plugin.js` - Watch plugin for changes

### Utility Scripts (`plugins/`):
- `enable-plugins.sh` - Enable all plugins
- `disable-heavy-plugins.sh` - Disable heavy plugins

---

## ⚙️ Configuration Files (3)

- `.gitignore` - Git ignore rules
- `.gitattributes` - Git attributes (line endings, etc.)
- `package.json` - Node.js package config (for scripts)

---

## 📁 Directory Structure

```
betterdiscord-assets/
├── .gitignore
├── .gitattributes
├── README.md
├── SECURITY_REVIEW.md
├── GIT_SETUP.md
├── DEPLOY.md
├── PUSH_COMMANDS.md
├── REPO_OVERVIEW.md
├── package.json
├── docs/
│   ├── CRITICAL-HIT-SETUP.md
│   ├── CRITICAL-HIT-VERIFICATION.md
│   ├── IDEAS.md
│   ├── QUICK-INSTALL.md
│   └── SOLO-LEVELING-PLUGIN-IDEAS.md
├── plugins/
│   ├── CriticalHit.plugin.js
│   ├── SoloLevelingStats.plugin.js
│   ├── SkillTree.plugin.js
│   ├── TitleManager.plugin.js
│   ├── LevelProgressBar.plugin.js
│   ├── SoloLevelingToasts.plugin.js
│   ├── LevelUpAnimation.plugin.js
│   ├── enable-plugins.sh
│   ├── disable-heavy-plugins.sh
│   └── docs/
│       ├── DEBUG_DISCORD.md
│       ├── PIXEL_ART_SOURCES.md
│       ├── PLUGIN_ANALYSIS.md
│       ├── PLUGIN_IDEAS.md
│       ├── SOLO-LEVELING-STATS-README.md
│       └── SOLO-LEVELING-STATS-VERIFICATION.md
├── themes/
│   ├── SoloLeveling-ClearVision.theme.css
│   └── docs/
│       ├── README.md
│       └── SOLO-LEVELING-THEME-README.md
└── scripts/
    ├── link-plugin.js
    ├── link-theme.js
    └── watch-plugin.js
```

---

## ❌ Excluded Files (via .gitignore)

### Large Files:
- `themes/*.gif` - GIF files (104MB+ total)
- `themes/*Debug.js` - Debug JavaScript files

### Development Files:
- `node_modules/` - Node.js dependencies
- `backups/` - Local backup files
- `plugins/backups/` - Plugin backups
- `package-lock.json` - Lock file

### Personal/Experimental:
- `MyPlugin.plugin.js` - Personal plugin
- `MyTheme.theme.css` - Personal theme
- `PixelSnake.plugin.js` - Unrelated plugin

### Other:
- `*.backup`, `*.bak`, `*.tmp`, `*.log` - Temporary files
- `.DS_Store`, `Thumbs.db` - OS files
- `.vscode/`, `.idea/` - IDE files

---

## 📏 Estimated Repository Size

- **Plugins**: ~660KB
- **Theme**: ~38KB
- **Documentation**: ~50KB
- **Scripts**: ~12KB
- **Config**: ~4KB
- **Total**: ~764KB (excluding large GIFs)

---

## 🔗 Plugin Dependencies

```
SoloLevelingStats (Core)
├── CriticalHit (reads Agility stat)
├── SkillTree (reads stats, saves bonuses)
├── TitleManager (reads titles/achievements)
├── LevelProgressBar (reads level/XP)
├── SoloLevelingToasts (hooks into events)
└── LevelUpAnimation (detects level ups)
```

---

## ✅ Ready to Push

All files are organized, staged, and ready for commit. Run:

```bash
git commit -m "Initial commit: Solo Leveling BetterDiscord Suite"
git remote add origin https://github.com/YOUR_USERNAME/betterdiscord-assets.git
git push -u origin main
```

