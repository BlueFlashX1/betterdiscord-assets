# Git Repository Setup Guide

## Repository Organization

### ✅ Files Included in Git:

**Core Plugins:**
- `plugins/CriticalHit.plugin.js`
- `plugins/SoloLevelingStats.plugin.js`
- `plugins/SkillTree.plugin.js`
- `plugins/TitleManager.plugin.js`
- `plugins/LevelProgressBar.plugin.js`
- `plugins/SoloLevelingToasts.plugin.js`
- `plugins/LevelUpAnimation.plugin.js`

**Themes:**
- `themes/SoloLeveling-ClearVision.theme.css`

**Documentation:**
- `README.md` (main documentation)
- `SECURITY_REVIEW.md` (security audit)
- `docs/` (all markdown documentation)
- `plugins/docs/` (plugin-specific docs)
- `themes/docs/` (theme-specific docs)

**Scripts:**
- `scripts/link-plugin.js`
- `scripts/link-theme.js`
- `scripts/watch-plugin.js`
- `plugins/*.sh` (enable/disable scripts)

**Config:**
- `.gitignore`
- `.gitattributes`
- `package.json` (for scripts, not dependencies)

### ❌ Files Excluded (via .gitignore):

- `node_modules/` - Dependencies (should be installed via npm)
- `backups/` - Local backup files
- `*.gif` - Large media files (198MB+)
- `*Debug.js` - Debug/test files
- `MyPlugin.plugin.js` - Personal/experimental plugins
- `MyTheme.theme.css` - Personal/experimental themes
- `PixelSnake.plugin.js` - Unrelated plugin
- `package-lock.json` - Lock file (optional)

## Git Commands

### Initial Setup:
```bash
cd /Users/matthewthompson/Documents/DEVELOPMENT/betterdiscord-dev
git init
git add .gitignore .gitattributes README.md SECURITY_REVIEW.md
git add plugins/*.plugin.js plugins/docs/ plugins/*.sh
git add themes/*.theme.css themes/docs/
git add scripts/ docs/
git commit -m "Initial commit: Solo Leveling BetterDiscord Suite"
```

### Connect to Remote:
```bash
# If repository doesn't exist, create it on GitHub first
git remote add origin https://github.com/YOUR_USERNAME/betterdiscord-assets.git
git branch -M main
git push -u origin main
```

### Regular Updates:
```bash
git add .
git commit -m "Update: [description of changes]"
git push
```

## Repository Structure

```
betterdiscord-assets/
├── .gitignore
├── .gitattributes
├── README.md
├── SECURITY_REVIEW.md
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

## Notes

- **Large files**: GIF files (198MB+) are excluded - consider using Git LFS if needed
- **Backups**: Keep backups local, don't commit to git
- **Personal plugins**: MyPlugin, MyTheme, PixelSnake excluded (personal/experimental)
- **Dependencies**: node_modules excluded - users install via `npm install` if needed

