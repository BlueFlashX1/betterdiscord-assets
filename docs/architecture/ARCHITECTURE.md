# Architecture Document: BetterDiscord Development

**Project:** BetterDiscord Plugin & Theme Ecosystem
**Version:** 1.0
**Date:** December 21, 2025

---

## System Overview

BetterDiscord development environment with automated mirroring, CSS inspection tools, and modular theme architecture.

### High-Level Architecture

```
┌─────────────────────────────────────────┐
│    BetterDiscord Development Env        │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Development Directory          │   │
│  │  (betterdiscord-dev/)           │   │
│  ├─────────────────────────────────┤   │
│  │  • Plugins (*.plugin.js)        │   │
│  │  • Themes (*.theme.css)         │   │
│  │  • Scripts (automation)         │   │
│  └──────────┬──────────────────────┘   │
│             │ Automated Sync            │
│  ┌──────────┴──────────────────────┐   │
│  │  Production Directory           │   │
│  │  (betterdiscord-assets/)        │   │
│  ├─────────────────────────────────┤   │
│  │  • Deployed Plugins             │   │
│  │  • Deployed Themes              │   │
│  │  • Version Control              │   │
│  └─────────────────────────────────┘   │
│             │                           │
│  ┌──────────┴──────────────────────┐   │
│  │  Discord Application            │   │
│  │  (with BetterDiscord)           │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

---

## Core Components

### 1. Plugin Architecture

**Structure:**

```javascript
/**
 * @name PluginName
 * @version 1.0.0
 * @description Plugin description
 * @author Your Name
 */

module.exports = class PluginName {
  start() {
    // Plugin initialization
  }

  stop() {
    // Cleanup
  }

  getSettingsPanel() {
    // Settings UI
  }
};
```

### 2. Theme Architecture

**Component-Based CSS:**

```css
/* Variable Definitions */
:root {
  --sl-primary: #8b5cf6;
  --sl-accent: #f97316;
  --sl-background: #1a1b1e;
}

/* Component Styles */
.component-name {
  /* Component-specific styles */
}
```

### 3. Mirroring System

**Automated Sync:**

```python
# scripts/mirror_assets.py
def sync_to_assets():
    """Copy dev files to production assets"""
    sync_plugins()
    sync_themes()
    verify_integrity()
```

---

## Development Workflow

1. Edit in `betterdiscord-dev/`
2. Test in Discord (hot-reload if supported)
3. Run mirroring script
4. Verify in `betterdiscord-assets/`
5. Commit both directories

---

## Related Documents

- `docs/PRD.md` - Product requirements
- `.cursor/rules/betterdiscord.mdc` - Development guidelines

---

**Last Updated:** December 21, 2025
