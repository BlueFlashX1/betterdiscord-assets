/**
 * @name SidebarInspector
 * @author BlueFlashX1
 * @description Debug tool to detect and analyze Discord left sidebar elements (guilds, channels, server info)
 * @version 1.0.0
 *
 * PURPOSE: Detect CSS selectors for left sidebar navigation including:
 * - Server/Guild list (icons on far left)
 * - Channel list (text channels, voice channels, categories)
 * - Server info (server name, banner, boost status)
 * - User panel (your username, status, settings)
 * - Voice connection panel
 * - All interactive sidebar elements
 *
 * USAGE:
 * 1. Enable plugin
 * 2. Open browser console (Cmd+Option+I)
 * 3. Navigate to different servers/channels
 * 4. Watch console for detected elements
 * 5. Use manual commands for detailed analysis
 * 6. Document findings in css-detection-database.json
 * 7. Disable plugin when done
 *
 * PERFORMANCE:
 * - Ultra-quiet by default (max 2 auto-scans)
 * - Summary output only (verbose on demand)
 * - Smart caching (no duplicates)
 * - 3-second scan cooldown
 */

module.exports = class SidebarInspector {
  constructor() {
    this.observer = null;
    this.detectedElements = new Map();
    this.lastScanTime = 0;
    this.scanCooldown = 3000; // 3 second cooldown
    this.pendingScan = null;
    this.scanCount = 0;
    this.maxAutoScans = 2; // Only 2 auto-scans
    this.quietMode = true; // Summary only by default
  }

  start() {
    console.log('%c[SidebarInspector] Plugin started', 'color: #8b5cf6; font-weight: bold; font-size: 14px;');
    console.log('%c[SidebarInspector] Type window.SidebarInspector.scanSidebar() to scan', 'color: #a78bfa;');
    console.log('%c[SidebarInspector] Type window.SidebarInspector.generateReport() for full report', 'color: #a78bfa;');

    // Initial scan after delay
    setTimeout(() => this.scanSidebar(), 1000);

    // Setup observer for dynamic changes
    this.setupObserver();
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.pendingScan) {
      clearTimeout(this.pendingScan);
      this.pendingScan = null;
    }
    this.detectedElements.clear();
    console.log('[SidebarInspector] Plugin stopped');
  }

  // ============================================================================
  // MUTATION OBSERVER
  // ============================================================================

  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      // Stop auto-scanning after limit
      if (this.scanCount >= this.maxAutoScans) return;

      // Filter: Only sidebar-related changes
      const relevantChange = mutations.some(mutation => {
        const target = mutation.target;
        return target.closest?.('[class*="sidebar"]') ||
               target.closest?.('[class*="guilds"]') ||
               target.closest?.('[class*="channels"]') ||
               target.querySelector?.('[class*="sidebar"]');
      });

      if (!relevantChange) return;

      // Debounce
      if (this.pendingScan) {
        clearTimeout(this.pendingScan);
      }
      this.pendingScan = setTimeout(() => {
        this.scanSidebar();
      }, 1000);
    });

    // Watch only sidebar areas
    const sidebar = document.querySelector('[class*="sidebar"]') || document.body;
    this.observer.observe(sidebar, {
      childList: true,
      subtree: true
    });
  }

  // ============================================================================
  // SIDEBAR SCANNING
  // ============================================================================

  scanSidebar(verbose = false) {
    // Cooldown check
    const now = Date.now();
    if (now - this.lastScanTime < this.scanCooldown) return;
    this.lastScanTime = now;
    this.scanCount++;

    // Temporarily disable quiet mode if verbose
    const wasQuiet = this.quietMode;
    if (verbose) this.quietMode = false;

    console.log('%c[SidebarInspector] 🔍 Scanning... (Scan #' + this.scanCount + ')', 'color: #8b5cf6; font-weight: bold;');

    // Track found elements
    const found = {
      guildList: 0,
      channelList: 0,
      serverInfo: 0,
      userPanel: 0,
      voicePanel: 0,
      categories: 0,
      channels: 0
    };

    // Detect all sidebar components
    found.guildList = this.detectGuildList();
    found.channelList = this.detectChannelList();
    found.serverInfo = this.detectServerInfo();
    found.userPanel = this.detectUserPanel();
    found.voicePanel = this.detectVoicePanel();
    found.categories = this.detectCategories();
    found.channels = this.detectChannels();

    // Summary
    const total = Object.values(found).reduce((a, b) => a + b, 0);
    console.log(`%c[SidebarInspector] ✅ Found ${total} elements | Guilds: ${found.guildList} | Channels: ${found.channels} | Categories: ${found.categories} | User: ${found.userPanel}`, 'color: #10b981; font-weight: bold;');

    // Notify when auto-scanning stops
    if (this.scanCount >= this.maxAutoScans) {
      console.log('%c[SidebarInspector] 🔕 Auto-scan complete. Use window.SidebarInspector.scanSidebar(true) for detailed scans.', 'color: #fbbf24; font-weight: bold;');
    }

    this.quietMode = wasQuiet;
  }

  // ============================================================================
  // DETECTION METHODS
  // ============================================================================

  detectGuildList() {
    const patterns = [
      '[class*="guilds"]',
      '[class*="guildSeparator"]',
      'nav[class*="guilds"]',
      '[aria-label*="Servers"]',
    ];

    let foundCount = 0;
    for (const pattern of patterns) {
      const elements = document.querySelectorAll(pattern);
      elements.forEach(el => {
        const key = this.getElementKey(el);
        if (!this.detectedElements.has(key)) {
          this.detectedElements.set(key, el);
          if (!this.quietMode) {
            this.logElement('GUILD LIST', el, pattern);
          }
          foundCount++;
        }
      });
    }
    return foundCount;
  }

  detectChannelList() {
    const patterns = [
      '[class*="sidebar"]',
      '[class*="panels"]',
      '[class*="content"][class*="sidebar"]',
      'nav[aria-label*="Channels"]',
    ];

    let foundCount = 0;
    for (const pattern of patterns) {
      const elements = document.querySelectorAll(pattern);
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        // Must be large vertical panel
        if (rect.height > 300 && rect.width < 400) {
          const key = this.getElementKey(el);
          if (!this.detectedElements.has(key)) {
            this.detectedElements.set(key, el);
            if (!this.quietMode) {
              this.logElement('CHANNEL LIST SIDEBAR', el, pattern);
            }
            foundCount++;
          }
        }
      });
    }
    return foundCount;
  }

  detectServerInfo() {
    const patterns = [
      '[class*="header"]',
      '[class*="animatedContainer"]',
      '[class*="banner"]',
      'header[class*="header"]',
    ];

    let foundCount = 0;
    const sidebar = document.querySelector('[class*="sidebar"]');
    if (!sidebar) return 0;

    for (const pattern of patterns) {
      const elements = sidebar.querySelectorAll(pattern);
      elements.forEach(el => {
        const key = this.getElementKey(el);
        if (!this.detectedElements.has(key)) {
          this.detectedElements.set(key, el);
          if (!this.quietMode) {
            this.logElement('SERVER INFO', el, pattern);
          }
          foundCount++;
        }
      });
    }
    return foundCount;
  }

  detectUserPanel() {
    const patterns = [
      '[class*="panels"]',
      '[class*="container"][class*="panels"]',
      '[class*="avatarWrapper"]',
      '[class*="nameTag"]',
    ];

    let foundCount = 0;
    for (const pattern of patterns) {
      const elements = document.querySelectorAll(pattern);
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        // User panel is at bottom, small height
        if (rect.bottom > window.innerHeight - 100 && rect.height < 100) {
          const key = this.getElementKey(el);
          if (!this.detectedElements.has(key)) {
            this.detectedElements.set(key, el);
            if (!this.quietMode) {
              this.logElement('USER PANEL', el, pattern);
            }
            foundCount++;
          }
        }
      });
    }
    return foundCount;
  }

  detectVoicePanel() {
    const patterns = [
      '[class*="voiceConnection"]',
      '[class*="wrapper"][class*="voice"]',
      '[aria-label*="voice"]',
    ];

    let foundCount = 0;
    for (const pattern of patterns) {
      const elements = document.querySelectorAll(pattern);
      elements.forEach(el => {
        const key = this.getElementKey(el);
        if (!this.detectedElements.has(key)) {
          this.detectedElements.set(key, el);
          if (!this.quietMode) {
            this.logElement('VOICE PANEL', el, pattern);
          }
          foundCount++;
        }
      });
    }
    return foundCount;
  }

  detectCategories() {
    const patterns = [
      '[class*="containerDefault"]',
      '[role="button"][class*="wrapper"]',
      'h2[class*="container"]',
    ];

    let foundCount = 0;
    const sidebar = document.querySelector('[class*="sidebar"]');
    if (!sidebar) return 0;

    for (const pattern of patterns) {
      const elements = sidebar.querySelectorAll(pattern);
      elements.forEach(el => {
        // Filter for category headers
        if (el.textContent && el.textContent.length > 0) {
          const key = this.getElementKey(el);
          if (!this.detectedElements.has(key)) {
            this.detectedElements.set(key, el);
            if (!this.quietMode) {
              this.logElement('CATEGORY', el, pattern);
            }
            foundCount++;
          }
        }
      });
    }
    return foundCount;
  }

  detectChannels() {
    const patterns = [
      'a[class*="channel"]',
      '[class*="link"][role="link"]',
      '[class*="wrapper"][class*="channel"]',
      'a[href*="/channels/"]',
    ];

    let foundCount = 0;
    const sidebar = document.querySelector('[class*="sidebar"]');
    if (!sidebar) return 0;

    for (const pattern of patterns) {
      const elements = sidebar.querySelectorAll(pattern);
      elements.forEach(el => {
        const key = this.getElementKey(el);
        if (!this.detectedElements.has(key)) {
          this.detectedElements.set(key, el);
          if (!this.quietMode) {
            const channelName = el.textContent || el.getAttribute('aria-label') || 'Unknown';
            this.logElement(`CHANNEL (${channelName})`, el, pattern);
          }
          foundCount++;
        }
      });
    }
    return foundCount;
  }

  // ============================================================================
  // ELEMENT ANALYSIS
  // ============================================================================

  logElement(type, element, pattern) {
    console.group(`%c[Sidebar] ${type}`, 'color: #a78bfa; font-weight: bold;');

    console.log('Pattern:', pattern);
    console.log('Tag:', element.tagName.toLowerCase());
    console.log('Classes:', Array.from(element.classList).slice(0, 5));
    console.log('CSS Selector:', this.generateSelector(element));

    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);

    console.log('Box Model:', {
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      top: `${Math.round(rect.top)}px`,
      left: `${Math.round(rect.left)}px`,
      padding: computed.padding,
      margin: computed.margin,
    });

    console.log('Colors:', {
      background: computed.backgroundColor,
      color: computed.color,
      border: computed.borderColor,
    });

    this.suggestCustomizations(type);
    console.log('Element:', element);
    console.groupEnd();
  }

  suggestCustomizations(type) {
    const suggestions = {
      'GUILD LIST': [
        '• Add hover glow to server icons',
        '• Purple active server indicator',
        '• Animated server icon effects',
        '• Custom separator styling',
      ],
      'CHANNEL LIST SIDEBAR': [
        '• Background gradient/pattern',
        '• Border glow effects',
        '• Category header styling',
        '• Channel hover effects',
      ],
      'SERVER INFO': [
        '• Banner glow effects',
        '• Server name text shadow',
        '• Boost progress bar styling',
        '• Dropdown button effects',
      ],
      'USER PANEL': [
        '• Avatar glow based on status',
        '• Username text shadow',
        '• Settings button hover glow',
        '• Status indicator enhancement',
      ],
      'CATEGORY': [
        '• Header text glow',
        '• Collapse arrow animation',
        '• Category separator effects',
        '• Hover background color',
      ],
      'CHANNEL': [
        '• Active channel highlighting',
        '• Hover glow effects',
        '• Unread indicator styling',
        '• Icon color customization',
      ],
    };

    const relevant = Object.keys(suggestions).find(key => type.includes(key));
    if (relevant && suggestions[relevant]) {
      console.log('%cCustomization Opportunities:', 'color: #fbbf24; font-weight: bold;');
      suggestions[relevant].forEach(s => console.log(s));
    }
  }

  generateSelector(element) {
    const parts = [];
    let current = element;

    for (let i = 0; i < 4 && current && current.tagName; i++) {
      const tag = current.tagName.toLowerCase();
      const classes = Array.from(current.classList)
        .filter(c => c && !c.includes('processed'))
        .slice(0, 2);

      if (classes.length > 0) {
        parts.unshift(`${tag}.${classes.join('.')}`);
      } else if (current.id) {
        parts.unshift(`${tag}#${current.id}`);
      } else {
        parts.unshift(tag);
      }

      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  getElementKey(element) {
    return `${element.tagName}-${element.className}-${element.getAttribute('aria-label') || ''}`;
  }

  // ============================================================================
  // DETAILED ANALYSIS
  // ============================================================================

  analyzeLayout() {
    console.log('%c[SidebarInspector] 📐 Complete Sidebar Layout Analysis', 'color: #8b5cf6; font-weight: bold; font-size: 16px;');

    // Find sidebar
    const sidebar = document.querySelector('[class*="sidebar"]');
    if (!sidebar) {
      console.log('%c⚠️  Sidebar not found!', 'color: #ef4444;');
      return;
    }

    console.group('Sidebar Structure');
    this.analyzeHierarchy(sidebar, 0, 5);
    console.groupEnd();

    this.analyzeGuildListDetailed();
    this.analyzeChannelListDetailed();
    this.analyzeUserPanelDetailed();
  }

  analyzeHierarchy(element, depth, maxDepth) {
    if (depth >= maxDepth || !element) return;

    const indent = '  '.repeat(depth);
    const tag = element.tagName.toLowerCase();
    const classes = Array.from(element.classList).slice(0, 3).join(', ');
    const rect = element.getBoundingClientRect();

    console.log(`${indent}${tag} [${classes}]`);
    console.log(`${indent}  Size: ${Math.round(rect.width)}×${Math.round(rect.height)}px`);
    console.log(`${indent}  Position: (${Math.round(rect.left)}, ${Math.round(rect.top)})`);

    const children = Array.from(element.children).slice(0, 5);
    children.forEach(child => {
      this.analyzeHierarchy(child, depth + 1, maxDepth);
    });
  }

  analyzeGuildListDetailed() {
    const guildList = document.querySelector('[class*="guilds"]') ||
                      document.querySelector('nav[aria-label*="Servers"]');

    if (!guildList) return;

    console.group('%c🏰 Guild List - Detailed Analysis', 'color: #3b82f6; font-weight: bold;');

    const computed = window.getComputedStyle(guildList);
    const rect = guildList.getBoundingClientRect();

    console.log('Dimensions:', {
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      position: computed.position,
    });

    console.log('Styling:', {
      background: computed.backgroundColor,
      padding: computed.padding,
    });

    // Count server icons
    const guilds = guildList.querySelectorAll('[class*="guild"]:not([class*="guilds"])');
    console.log(`Found ${guilds.length} server icons`);

    console.groupEnd();
  }

  analyzeChannelListDetailed() {
    const channelList = document.querySelector('[class*="sidebar"][class*="content"]') ||
                        document.querySelector('nav[aria-label*="Channels"]');

    if (!channelList) return;

    console.group('%c📋 Channel List - Detailed Analysis', 'color: #10b981; font-weight: bold;');

    const computed = window.getComputedStyle(channelList);
    const rect = channelList.getBoundingClientRect();

    console.log('Dimensions:', {
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      position: computed.position,
    });

    console.log('Styling:', {
      background: computed.backgroundColor,
      padding: computed.padding,
    });

    // Count categories and channels
    const categories = channelList.querySelectorAll('[role="button"][class*="container"]');
    const channels = channelList.querySelectorAll('a[class*="channel"]');
    console.log(`Found ${categories.length} categories, ${channels.length} channels`);

    console.groupEnd();
  }

  analyzeUserPanelDetailed() {
    const userPanel = document.querySelector('[class*="panels"]');
    if (!userPanel) return;

    console.group('%c👤 User Panel - Detailed Analysis', 'color: #ec4899; font-weight: bold;');

    const computed = window.getComputedStyle(userPanel);
    const rect = userPanel.getBoundingClientRect();

    console.log('Dimensions:', {
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      bottom: `${Math.round(rect.bottom)}px (from top)`,
    });

    console.log('Styling:', {
      background: computed.backgroundColor,
      padding: computed.padding,
      borderTop: computed.borderTop,
    });

    console.groupEnd();
  }

  // ============================================================================
  // CUSTOMIZATION REPORT
  // ============================================================================

  generateReport() {
    console.log('%c[SidebarInspector] 📋 SIDEBAR CUSTOMIZATION REPORT', 'color: #8b5cf6; font-weight: bold; font-size: 18px; background: rgba(139, 92, 246, 0.1); padding: 10px;');

    const report = {
      guildList: [
        '🎨 Server Icons: Add purple glow on hover',
        '✨ Active Server: Glowing purple indicator',
        '🌟 Unread Badge: Custom purple notification badges',
        '💫 Animations: Pulse/float on new activity',
        '📍 Separators: Styled divider lines',
      ],
      channelList: [
        '🌌 Background: Dark purple gradient',
        '🎨 Categories: Glowing category headers',
        '✨ Channels: Hover glow effects',
        '🔔 Unread: Purple unread indicators',
        '💬 Active Channel: Highlighted with glow',
      ],
      serverInfo: [
        '🏰 Server Name: Glowing text effect',
        '🎭 Banner: Purple overlay/glow',
        '⚡ Boost Bar: Custom progress styling',
        '📊 Member Count: Styled display',
        '🔽 Dropdown: Animated button',
      ],
      userPanel: [
        '👤 Avatar: Glow based on status (online/idle/DND)',
        '📝 Username: Purple text shadow',
        '⚙️ Settings Button: Hover glow',
        '🎤 Mic/Headphone: Icon hover effects',
        '🔊 Voice Status: Animated indicators',
      ],
      channels: [
        '# Text Channels: Custom hashtag icon color',
        '🔊 Voice Channels: Speaker icon glow',
        '📢 Announcement: Megaphone icon effects',
        '🔒 Locked Channels: Different styling',
        '📌 Pinned: Special highlight',
      ],
    };

    Object.entries(report).forEach(([category, items]) => {
      console.group(`%c${category.toUpperCase()}`, 'color: #fbbf24; font-weight: bold;');
      items.forEach(item => console.log(item));
      console.groupEnd();
    });

    console.log('%c📊 Total Opportunities: ' + Object.values(report).flat().length, 'color: #10b981; font-weight: bold; font-size: 14px;');
  }
};

// Make available globally
window.SidebarInspector = new (module.exports)();
window.SidebarInspector.start();
