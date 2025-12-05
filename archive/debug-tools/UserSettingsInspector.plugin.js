/**
 * @name UserSettingsInspector
 * @description Debug tool to inspect Discord User Settings menu CSS structure
 * @version 1.0.0
 * @author YourName
 */

module.exports = class UserSettingsInspector {
  constructor() {
    this.initialized = false;
    this.detectionPatterns = this.getDetectionPatterns();
    this.lastScan = 0;
    this.scanCooldown = 3000; // 3 second cooldown
    this.detectedElements = new Map();
    this.scanCount = 0;
    this.maxAutoScans = 2; // Auto-scan max 2 times
  }

  start() {
    if (this.initialized) return;
    
    console.log('%c[UserSettingsInspector] Plugin started', 'color: #8b5cf6; font-weight: bold;');
    console.log('%c[UserSettingsInspector] Waiting for settings to open...', 'color: #999;');
    console.log('%c[UserSettingsInspector] Click the gear icon to open User Settings', 'color: #22c55e;');
    
    this.initialized = true;
    this.setupSettingsWatcher();
  }

  stop() {
    if (this.settingsObserver) {
      this.settingsObserver.disconnect();
      this.settingsObserver = null;
    }
    
    if (this.settingsModalObserver) {
      this.settingsModalObserver.disconnect();
      this.settingsModalObserver = null;
    }
    
    this.initialized = false;
    console.log('[UserSettingsInspector] Plugin stopped');
  }

  /**
   * Define detection patterns for User Settings elements
   */
  getDetectionPatterns() {
    return {
      // Settings modal container
      settingsContainer: [
        '[class*="layer"][class*="baseLayer"]',
        '[class*="standardSidebarView"]',
        '[class*="contentRegion"]',
        '[role="dialog"]',
        'div[class*="layer"] div[class*="sidebar"]'
      ],
      
      // Settings sidebar (left side with categories)
      settingsSidebar: [
        '[class*="sidebar"]',
        '[class*="side"]',
        '[class*="settingsSidebar"]',
        'nav[class*="sidebar"]'
      ],
      
      // Settings content (right side with settings)
      settingsContent: [
        '[class*="contentRegion"]',
        '[class*="content"]',
        '[class*="settingsContent"]'
      ],
      
      // Category items (My Account, Privacy & Safety, etc.)
      categoryItems: [
        '[class*="item"]',
        '[class*="side"] > div',
        '[class*="item"][role="button"]'
      ],
      
      // Active category
      activeCategory: [
        '[class*="selected"]',
        '[class*="item"][class*="themed"]'
      ],
      
      // Category headers
      categoryHeaders: [
        '[class*="header"]',
        '[class*="separator"]',
        'h2[class*="header"]'
      ],
      
      // Close button
      closeButton: [
        '[class*="closeButton"]',
        'button[class*="close"]',
        '[aria-label="Close"]'
      ],
      
      // Settings sections
      settingsSections: [
        '[class*="children"]',
        'section',
        'div[class*="section"]'
      ],
      
      // Form elements
      formElements: [
        'input[type="text"]',
        'input[type="checkbox"]',
        'input[type="radio"]',
        'select',
        'textarea',
        '[class*="input"]',
        '[class*="switch"]',
        '[class*="checkbox"]'
      ],
      
      // Buttons
      buttons: [
        'button[class*="button"]',
        '[role="button"]',
        'div[class*="button"]'
      ],
      
      // Scrollable content
      scrollableContent: [
        '[class*="scroller"]',
        '[class*="scrollable"]'
      ],
      
      // Profile section
      profileSection: [
        '[class*="userSettingsAccount"]',
        '[class*="accountProfileCard"]',
        '[class*="avatar"]'
      ],
      
      // Dividers
      dividers: [
        '[class*="divider"]',
        'hr',
        'div[class*="separator"]'
      ]
    };
  }

  /**
   * Setup watcher for settings modal opening
   */
  setupSettingsWatcher() {
    // Watch for settings modal appearing in DOM
    this.settingsObserver = new MutationObserver((mutations) => {
      // Cooldown check
      const now = Date.now();
      if (now - this.lastScan < this.scanCooldown) return;
      
      // Auto-scan limit check
      if (this.scanCount >= this.maxAutoScans) return;
      
      // Check if settings modal is open
      const settingsModal = document.querySelector('[class*="layer"][class*="baseLayer"]');
      if (settingsModal && settingsModal.querySelector('[class*="standardSidebarView"]')) {
        this.lastScan = now;
        this.scanCount++;
        
        console.log('%c[UserSettingsInspector] Settings detected! Scanning...', 'color: #22c55e; font-weight: bold;');
        
        // Scan after a short delay (let DOM settle)
        setTimeout(() => {
          this.scanSettingsModal();
        }, 500);
      }
    });

    this.settingsObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Scan User Settings modal and log all detected elements
   */
  scanSettingsModal() {
    console.log('%c╔════════════════════════════════════════════════════════╗', 'color: #8b5cf6;');
    console.log('%c║   USER SETTINGS INSPECTOR - CSS DETECTION REPORT      ║', 'color: #8b5cf6; font-weight: bold;');
    console.log('%c╚════════════════════════════════════════════════════════╝', 'color: #8b5cf6;');
    console.log('');

    const results = {};

    // Detect each pattern category
    for (const [category, patterns] of Object.entries(this.detectionPatterns)) {
      const detected = this.detectElements(patterns);
      if (detected.length > 0) {
        results[category] = detected;
      }
    }

    // Log results organized by category
    this.logResults(results);

    // Log layout information
    this.logLayoutInfo();

    // Log color information
    this.logColorInfo();

    console.log('');
    console.log('%c[UserSettingsInspector] Scan complete! ✅', 'color: #22c55e; font-weight: bold;');
    console.log('%c[UserSettingsInspector] Auto-scan limit: ' + this.scanCount + '/' + this.maxAutoScans, 'color: #999;');
    
    if (this.scanCount >= this.maxAutoScans) {
      console.log('%c[UserSettingsInspector] Auto-scan limit reached. Manual scan: BdApi.Plugins.get("UserSettingsInspector").instance.manualScan()', 'color: #f59e0b;');
    }
  }

  /**
   * Detect elements matching patterns
   */
  detectElements(patterns) {
    const results = [];
    const seen = new Set();

    for (const pattern of patterns) {
      try {
        const elements = document.querySelectorAll(pattern);
        elements.forEach(el => {
          // Prevent duplicates
          const signature = this.getElementSignature(el);
          if (!seen.has(signature)) {
            seen.add(signature);
            results.push({
              selector: pattern,
              element: el,
              tag: el.tagName.toLowerCase(),
              classes: Array.from(el.classList || []),
              id: el.id || null,
              rect: el.getBoundingClientRect()
            });
          }
        });
      } catch (error) {
        // Invalid selector, skip
      }
    }

    return results;
  }

  /**
   * Get unique signature for element
   */
  getElementSignature(el) {
    const tag = el.tagName;
    const classes = Array.from(el.classList || []).sort().join('.');
    const rect = el.getBoundingClientRect();
    return `${tag}.${classes}@${rect.top},${rect.left}`;
  }

  /**
   * Log detection results organized by category
   */
  logResults(results) {
    for (const [category, detected] of Object.entries(results)) {
      if (detected.length === 0) continue;

      console.log('');
      console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #8b5cf6;');
      console.log(`%c${category.toUpperCase()}`, 'color: #8b5cf6; font-weight: bold; font-size: 14px;');
      console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #8b5cf6;');

      // Show first 3 elements for each category
      const toShow = detected.slice(0, 3);
      
      toShow.forEach((item, index) => {
        console.log('');
        console.log(`%c${index + 1}. ${item.tag.toUpperCase()}`, 'color: #a78bfa; font-weight: bold;');
        console.log(`   Selector: ${item.selector}`);
        
        if (item.classes.length > 0) {
          console.log(`   Classes: ${item.classes.slice(0, 5).join(', ')}${item.classes.length > 5 ? '...' : ''}`);
        }
        
        if (item.id) {
          console.log(`   ID: ${item.id}`);
        }
        
        console.log(`   Size: ${Math.round(item.rect.width)}×${Math.round(item.rect.height)}px`);
        console.log(`   Position: top ${Math.round(item.rect.top)}px, left ${Math.round(item.rect.left)}px`);
      });

      if (detected.length > 3) {
        console.log('');
        console.log(`   ... and ${detected.length - 3} more elements`);
      }
    }
  }

  /**
   * Log layout information
   */
  logLayoutInfo() {
    console.log('');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #ef4444;');
    console.log('%cLAYOUT INFORMATION', 'color: #ef4444; font-weight: bold; font-size: 14px;');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #ef4444;');
    
    const settingsLayer = document.querySelector('[class*="layer"][class*="baseLayer"]');
    const sidebar = document.querySelector('[class*="standardSidebarView"] [class*="sidebar"]');
    const content = document.querySelector('[class*="contentRegion"]');
    
    if (settingsLayer) {
      const rect = settingsLayer.getBoundingClientRect();
      console.log('');
      console.log('%cSettings Modal:', 'color: #f59e0b; font-weight: bold;');
      console.log(`   Size: ${Math.round(rect.width)}×${Math.round(rect.height)}px`);
      console.log(`   Position: ${Math.round(rect.top)}, ${Math.round(rect.left)}`);
    }
    
    if (sidebar) {
      const rect = sidebar.getBoundingClientRect();
      console.log('');
      console.log('%cSidebar (Categories):', 'color: #f59e0b; font-weight: bold;');
      console.log(`   Size: ${Math.round(rect.width)}×${Math.round(rect.height)}px`);
      console.log(`   Position: ${Math.round(rect.top)}, ${Math.round(rect.left)}`);
    }
    
    if (content) {
      const rect = content.getBoundingClientRect();
      console.log('');
      console.log('%cContent Area:', 'color: #f59e0b; font-weight: bold;');
      console.log(`   Size: ${Math.round(rect.width)}×${Math.round(rect.height)}px`);
      console.log(`   Position: ${Math.round(rect.top)}, ${Math.round(rect.left)}`);
    }
  }

  /**
   * Log color information from computed styles
   */
  logColorInfo() {
    console.log('');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #3b82f6;');
    console.log('%cCOLOR INFORMATION', 'color: #3b82f6; font-weight: bold; font-size: 14px;');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #3b82f6;');
    
    const sidebar = document.querySelector('[class*="standardSidebarView"] [class*="sidebar"]');
    const content = document.querySelector('[class*="contentRegion"]');
    const selectedItem = document.querySelector('[class*="side"] [class*="selected"]');
    
    if (sidebar) {
      const styles = window.getComputedStyle(sidebar);
      console.log('');
      console.log('%cSidebar Colors:', 'color: #60a5fa; font-weight: bold;');
      console.log(`   Background: ${styles.backgroundColor}`);
      console.log(`   Border: ${styles.borderRightColor}`);
    }
    
    if (content) {
      const styles = window.getComputedStyle(content);
      console.log('');
      console.log('%cContent Colors:', 'color: #60a5fa; font-weight: bold;');
      console.log(`   Background: ${styles.backgroundColor}`);
    }
    
    if (selectedItem) {
      const styles = window.getComputedStyle(selectedItem);
      console.log('');
      console.log('%cSelected Category Colors:', 'color: #60a5fa; font-weight: bold;');
      console.log(`   Background: ${styles.backgroundColor}`);
      console.log(`   Color: ${styles.color}`);
      console.log(`   Border: ${styles.borderLeftColor}`);
    }
  }

  /**
   * Setup watcher for settings modal opening
   */
  setupSettingsWatcher() {
    // Watch for settings modal
    this.settingsModalObserver = new MutationObserver((mutations) => {
      // Check cooldown
      const now = Date.now();
      if (now - this.lastScan < this.scanCooldown) return;
      
      // Check auto-scan limit
      if (this.scanCount >= this.maxAutoScans) return;
      
      // Check if settings opened
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          
          // Detect settings modal
          if (node.querySelector && node.querySelector('[class*="standardSidebarView"]')) {
            this.lastScan = now;
            this.scanCount++;
            
            console.log('%c[UserSettingsInspector] Settings opened! Scanning in 500ms...', 'color: #22c55e; font-weight: bold;');
            
            // Delay to let DOM settle
            setTimeout(() => {
              this.scanSettingsModal();
            }, 500);
            
            return;
          }
        }
      }
    });

    this.settingsModalObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Manual scan (bypass cooldown and limits)
   */
  manualScan() {
    console.log('%c[UserSettingsInspector] Manual scan triggered...', 'color: #8b5cf6; font-weight: bold;');
    
    const settingsModal = document.querySelector('[class*="layer"][class*="baseLayer"]');
    if (!settingsModal || !settingsModal.querySelector('[class*="standardSidebarView"]')) {
      console.log('%c[UserSettingsInspector] Settings modal not open!', 'color: #ef4444; font-weight: bold;');
      console.log('%c[UserSettingsInspector] Please open User Settings first (gear icon)', 'color: #f59e0b;');
      return;
    }
    
    this.scanSettingsModal();
  }

  /**
   * Get all category items and their info
   */
  getCategoryInfo() {
    console.log('');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #22c55e;');
    console.log('%cCATEGORY ITEMS ANALYSIS', 'color: #22c55e; font-weight: bold; font-size: 14px;');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #22c55e;');
    
    const sidebarItems = document.querySelectorAll('[class*="side"] > [class*="item"]');
    
    console.log('');
    console.log(`%cFound ${sidebarItems.length} category items`, 'color: #34d399; font-weight: bold;');
    
    const categories = [];
    sidebarItems.forEach((item, index) => {
      const text = item.textContent.trim();
      const isSelected = item.classList.toString().includes('selected');
      const rect = item.getBoundingClientRect();
      
      categories.push({
        index: index,
        text: text,
        selected: isSelected,
        classes: Array.from(item.classList).slice(0, 3),
        height: Math.round(rect.height)
      });
    });
    
    // Show first 10 categories
    categories.slice(0, 10).forEach(cat => {
      const marker = cat.selected ? '▶' : ' ';
      console.log(`${marker} ${cat.index + 1}. ${cat.text}${cat.selected ? ' (ACTIVE)' : ''}`);
      console.log(`   Classes: ${cat.classes.join(', ')}`);
      console.log(`   Height: ${cat.height}px`);
    });
    
    if (categories.length > 10) {
      console.log(`   ... and ${categories.length - 10} more categories`);
    }
  }

  /**
   * Get detailed CSS selector recommendations
   */
  getCustomizationRecommendations() {
    console.log('');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #ec4899;');
    console.log('%cCUSTOMIZATION RECOMMENDATIONS', 'color: #ec4899; font-weight: bold; font-size: 14px;');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #ec4899;');
    
    const recommendations = [
      {
        name: 'Settings Modal Background',
        selector: '[class*="standardSidebarView"]',
        property: 'background',
        example: 'linear-gradient(135deg, rgba(20, 10, 30, 0.95), rgba(10, 10, 20, 0.95))'
      },
      {
        name: 'Sidebar Background',
        selector: '[class*="side"]',
        property: 'background',
        example: 'rgba(15, 15, 25, 0.8)'
      },
      {
        name: 'Selected Category',
        selector: '[class*="side"] [class*="selected"]',
        property: 'background, border-left',
        example: 'background: rgba(139, 92, 246, 0.2); border-left: 3px solid #8b5cf6'
      },
      {
        name: 'Category Hover',
        selector: '[class*="side"] [class*="item"]:hover',
        property: 'background, box-shadow',
        example: 'background: rgba(139, 92, 246, 0.1); box-shadow: 0 0 10px rgba(139, 92, 246, 0.3)'
      },
      {
        name: 'Close Button',
        selector: '[class*="closeButton"]:hover',
        property: 'background, box-shadow',
        example: 'background: rgba(239, 68, 68, 0.2); box-shadow: 0 0 10px rgba(239, 68, 68, 0.5)'
      },
      {
        name: 'Content Scrollbar',
        selector: '[class*="contentRegion"] [class*="scroller"]::-webkit-scrollbar-thumb',
        property: 'background',
        example: 'linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(139, 92, 246, 0.6))'
      }
    ];
    
    console.log('');
    recommendations.forEach((rec, index) => {
      console.log(`%c${index + 1}. ${rec.name}`, 'color: #f472b6; font-weight: bold;');
      console.log(`   Target: ${rec.selector}`);
      console.log(`   Property: ${rec.property}`);
      console.log(`   Example: ${rec.example}`);
      console.log('');
    });
  }

  /**
   * Manual scan with extended info
   */
  manualScan() {
    this.scanSettingsModal();
    this.getCategoryInfo();
    this.getCustomizationRecommendations();
  }
};

