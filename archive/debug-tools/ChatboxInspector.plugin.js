/**
 * @name ChatboxInspector
 * @author BlueFlashX1
 * @description Debug tool to detect and analyze Discord chatbox elements for customization
 * @version 1.0.0
 *
 * PURPOSE: Detect CSS selectors, layout, and customization opportunities for:
 * - Message input area
 * - Icon buttons (gift, emoji, stickers, etc.)
 * - Chat message container
 * - Scrollbar
 * - Toolbar elements
 * - Any interactive elements in chatbox
 *
 * USAGE:
 * 1. Enable plugin
 * 2. Open browser console (Cmd+Option+I)
 * 3. Navigate to different channels
 * 4. Watch console for detected elements
 * 5. Document findings in css-detection-database.json
 * 6. Disable plugin when done
 *
 * PERFORMANCE:
 * - Debounced detection (1-second cooldown)
 * - Filtered output (only chatbox elements)
 * - Smart caching (no repeated analysis)
 */

module.exports = class ChatboxInspector {
  constructor() {
    this.observer = null;
    this.detectedElements = new Map(); // Cache detected elements
    this.lastScanTime = 0;
    this.scanCooldown = 3000; // 3 second cooldown between scans (reduced spam)
    this.pendingScan = null;
    this.scanCount = 0; // Track number of scans
    this.maxAutoScans = 2; // Only auto-scan 2 times (initial + one refresh), then manual only
    this.quietMode = true; // Quiet mode: Only log summary, not details
  }

  start() {
    console.log('%c[ChatboxInspector] Plugin started', 'color: #8b5cf6; font-weight: bold; font-size: 14px;');
    console.log('%c[ChatboxInspector] Type window.ChatboxInspector.scanChatbox() to scan', 'color: #a78bfa;');
    console.log('%c[ChatboxInspector] Type window.ChatboxInspector.generateReport() for full report', 'color: #a78bfa;');

    // Initial scan after short delay (let Discord load)
    setTimeout(() => this.scanChatbox(), 1000);

    // Setup MutationObserver for dynamic changes (but limited auto-scans)
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
    console.log('[ChatboxInspector] Plugin stopped');
  }

  // ============================================================================
  // MUTATION OBSERVER
  // ============================================================================

  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      // Stop auto-scanning after maxAutoScans reached
      if (this.scanCount >= this.maxAutoScans) {
        return; // No more auto-scans, manual only
      }

      // Filter mutations: Only care about chatbox area changes
      const relevantChange = mutations.some(mutation => {
        const target = mutation.target;
        // Check if change is in chat area or form
        return target.closest?.('[class*="chat"]') ||
               target.closest?.('form') ||
               target.querySelector?.('[class*="channelTextArea"]');
      });

      if (!relevantChange) return; // Skip irrelevant changes

      // Debounce: Schedule scan after delay
      if (this.pendingScan) {
        clearTimeout(this.pendingScan);
      }
      this.pendingScan = setTimeout(() => {
        this.scanChatbox();
      }, 1000); // Longer delay for less spam
    });

    // Watch only chat-related areas (not entire document)
    const chatArea = document.querySelector('[class*="chat"]') || document.body;
    this.observer.observe(chatArea, {
      childList: true,
      subtree: true
    });
  }

  // ============================================================================
  // CHATBOX SCANNING
  // ============================================================================

  scanChatbox(verbose = false) {
    // Cooldown check
    const now = Date.now();
    if (now - this.lastScanTime < this.scanCooldown) {
      return; // Too soon, skip scan
    }
    this.lastScanTime = now;
    this.scanCount++;

    // Temporarily disable quiet mode if verbose requested
    const wasQuiet = this.quietMode;
    if (verbose) this.quietMode = false;

    console.log('%c[ChatboxInspector] 🔍 Scanning... (Scan #' + this.scanCount + ')', 'color: #8b5cf6; font-weight: bold;');

    // Track what was found
    const found = {
      messageInput: 0,
      toolbarButtons: 0,
      chatContainer: 0,
      scrollbar: 0,
      attachmentArea: 0,
      emojiPicker: 0
    };

    // Detect all chatbox components
    found.messageInput = this.detectMessageInput();
    found.toolbarButtons = this.detectToolbarButtons();
    found.chatContainer = this.detectChatContainer();
    found.scrollbar = this.detectScrollbar();
    found.attachmentArea = this.detectAttachmentArea();
    found.emojiPicker = this.detectEmojiPicker();

    // Summary output (always show)
    const total = Object.values(found).reduce((a, b) => a + b, 0);
    console.log(`%c[ChatboxInspector] ✅ Found ${total} elements | Input: ${found.messageInput} | Buttons: ${found.toolbarButtons} | Container: ${found.chatContainer}`, 'color: #10b981; font-weight: bold;');

    // Notify when auto-scanning stops
    if (this.scanCount >= this.maxAutoScans) {
      console.log('%c[ChatboxInspector] 🔕 Auto-scan complete. Use window.ChatboxInspector.scanChatbox(true) for detailed scans.', 'color: #fbbf24; font-weight: bold;');
    }

    // Restore quiet mode
    this.quietMode = wasQuiet;
  }

  // ============================================================================
  // DETECTION METHODS
  // ============================================================================

  /**
   * Detect message input/textarea area
   */
  detectMessageInput() {
    const patterns = [
      // Direct textarea
      'textarea[placeholder*="Message"]',
      'textarea[class*="textArea"]',
      'textarea[class*="input"]',
      // Container with textarea
      '[class*="channelTextArea"]',
      '[role="textbox"]',
      // Legacy patterns
      '[class*="scrollableContainer"]',
    ];

    let foundCount = 0;
    for (const pattern of patterns) {
      const elements = document.querySelectorAll(pattern);
      if (elements.length > 0) {
        elements.forEach(el => {
          const key = this.getElementKey(el);
          if (!this.detectedElements.has(key)) {
            this.detectedElements.set(key, el);
            // Only log details if not in quiet mode
            if (!this.quietMode) {
              this.logChatboxElement('MESSAGE INPUT', el, pattern);
            }
            foundCount++;
          }
        });
      }
    }

    return foundCount;
  }

  /**
   * Detect toolbar buttons (emoji, gift, sticker, etc.)
   */
  detectToolbarButtons() {
    const patterns = [
      // Individual buttons (most specific first)
      'button[aria-label*="emoji"]',
      'button[aria-label*="gift"]',
      'button[aria-label*="GIF"]',
      'button[aria-label*="sticker"]',
      'button[aria-label*="Upload"]',
    ];

    const chatArea = document.querySelector('[class*="channelTextArea"]') || document.querySelector('form');
    if (!chatArea) return 0;

    let foundCount = 0;
    for (const pattern of patterns) {
      const elements = chatArea.querySelectorAll(pattern);
      if (elements.length > 0) {
        elements.forEach(el => {
          // Filter: Only actual buttons
          if (el.tagName === 'BUTTON') {
            const key = this.getElementKey(el);
            if (!this.detectedElements.has(key)) {
              this.detectedElements.set(key, el);
              // Only log details if not in quiet mode
              if (!this.quietMode) {
                const label = el.getAttribute('aria-label') || el.textContent || 'Unknown';
                this.logChatboxElement(`TOOLBAR BUTTON (${label})`, el, pattern);
              }
              foundCount++;
            }
          }
        });
      }
    }

    return foundCount;
  }

  /**
   * Detect chat message container
   */
  detectChatContainer() {
    const patterns = [
      '[class*="messages"]',
      '[class*="messagesWrapper"]',
      '[class*="chatContent"]',
      '[role="log"]',
    ];

    let foundCount = 0;
    for (const pattern of patterns) {
      const elements = document.querySelectorAll(pattern);
      if (elements.length > 0) {
        elements.forEach(el => {
          // Filter: Must be large container (not individual messages)
          const rect = el.getBoundingClientRect();
          if (rect.height > 200 && rect.width > 300) {
            const key = this.getElementKey(el);
            if (!this.detectedElements.has(key)) {
              this.detectedElements.set(key, el);
              if (!this.quietMode) {
                this.logChatboxElement('CHAT CONTAINER', el, pattern);
              }
              foundCount++;
            }
          }
        });
      }
    }

    return foundCount;
  }

  /**
   * Detect scrollbar
   */
  detectScrollbar() {
    const patterns = [
      '[class*="scroller"]',
      '[class*="scrollbar"]',
    ];

    let foundCount = 0;
    for (const pattern of patterns) {
      const elements = document.querySelectorAll(pattern);
      if (elements.length > 0) {
        // Only take first scroller (main chat scroller)
        const el = elements[0];
        const key = this.getElementKey(el);
        if (!this.detectedElements.has(key)) {
          this.detectedElements.set(key, el);
          if (!this.quietMode) {
            this.logChatboxElement('SCROLLBAR', el, pattern);
          }
          foundCount++;
        }
      }
    }

    return foundCount;
  }

  /**
   * Detect attachment/upload area
   */
  detectAttachmentArea() {
    const patterns = [
      '[class*="attachButton"]',
      'button[aria-label*="Upload"]',
      'button[aria-label*="file"]',
    ];

    let foundCount = 0;
    for (const pattern of patterns) {
      const elements = document.querySelectorAll(pattern);
      if (elements.length > 0) {
        elements.forEach(el => {
          const key = this.getElementKey(el);
          if (!this.detectedElements.has(key)) {
            this.detectedElements.set(key, el);
            if (!this.quietMode) {
              this.logChatboxElement('ATTACHMENT AREA', el, pattern);
            }
            foundCount++;
          }
        });
      }
    }

    return foundCount;
  }

  /**
   * Detect emoji picker
   */
  detectEmojiPicker() {
    const patterns = [
      'button[aria-label*="emoji"]',
      'button[aria-label*="Emoji"]',
    ];

    let foundCount = 0;
    for (const pattern of patterns) {
      const elements = document.querySelectorAll(pattern);
      if (elements.length > 0) {
        elements.forEach(el => {
          const key = this.getElementKey(el);
          if (!this.detectedElements.has(key)) {
            this.detectedElements.set(key, el);
            if (!this.quietMode) {
              this.logChatboxElement('EMOJI PICKER', el, pattern);
            }
            foundCount++;
          }
        });
      }
    }

    return foundCount;
  }

  // ============================================================================
  // ELEMENT ANALYSIS
  // ============================================================================

  /**
   * Log detailed chatbox element information
   */
  logChatboxElement(type, element, pattern) {
    console.group(`%c[Chatbox] ${type}`, 'color: #a78bfa; font-weight: bold;');

    // Basic info
    console.log('Pattern:', pattern);
    console.log('Tag:', element.tagName.toLowerCase());
    console.log('Classes:', Array.from(element.classList));
    console.log('Full ClassName:', element.className);

    // Generate CSS selector
    const selector = this.generateSelector(element);
    console.log('CSS Selector:', selector);

    // Box model analysis
    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);

    console.log('Box Model:', {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      margin: computed.margin,
      padding: computed.padding,
      border: computed.border,
    });

    // Colors
    console.log('Colors:', {
      background: computed.backgroundColor,
      color: computed.color,
      border: computed.borderColor,
    });

    // Positioning
    console.log('Layout:', {
      position: computed.position,
      display: computed.display,
      zIndex: computed.zIndex,
      overflow: computed.overflow,
    });

    // Attributes
    const attrs = {};
    for (const attr of element.attributes) {
      attrs[attr.name] = attr.value;
    }
    console.log('Attributes:', attrs);

    // Inline styles
    if (element.style.cssText) {
      console.log('Inline Styles:', element.style.cssText);
    }

    // Customization suggestions
    this.suggestCustomizations(type, element, computed);

    console.log('Element:', element);
    console.groupEnd();
  }

  /**
   * Suggest customization opportunities based on element type
   */
  suggestCustomizations(type, element, computed) {
    const suggestions = [];

    switch(type) {
      case 'MESSAGE INPUT':
        suggestions.push('• Change background color/opacity');
        suggestions.push('• Add border glow effect');
        suggestions.push('• Modify border radius');
        suggestions.push('• Change placeholder text color');
        suggestions.push('• Add typing animation effects');
        break;

      case 'TOOLBAR BUTTON':
        suggestions.push('• Add hover glow effects');
        suggestions.push('• Change icon colors');
        suggestions.push('• Add subtle animations');
        suggestions.push('• Modify button spacing');
        break;

      case 'CHAT CONTAINER':
        suggestions.push('• Change background color/pattern');
        suggestions.push('• Add subtle border glow');
        suggestions.push('• Modify message spacing');
        suggestions.push('• Add scrollbar styling');
        break;

      case 'SCROLLBAR':
        suggestions.push('• Custom scrollbar thumb color');
        suggestions.push('• Add glow to scrollbar');
        suggestions.push('• Modify scrollbar width');
        suggestions.push('• Change thumb border radius');
        break;
    }

    if (suggestions.length > 0) {
      console.log('%cCustomization Opportunities:', 'color: #fbbf24; font-weight: bold;');
      suggestions.forEach(s => console.log(s));
    }
  }

  /**
   * Generate CSS selector for element
   */
  generateSelector(element) {
    const parts = [];
    let current = element;

    // Build selector path (max 4 levels)
    for (let i = 0; i < 4 && current && current.tagName; i++) {
      const tag = current.tagName.toLowerCase();
      const classes = Array.from(current.classList)
        .filter(c => c && !c.includes('processed')) // Exclude our markers
        .slice(0, 2); // Max 2 classes per level

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

  /**
   * Get unique key for element (for caching)
   */
  getElementKey(element) {
    return `${element.tagName}-${element.className}-${element.getAttribute('aria-label') || ''}`;
  }

  // ============================================================================
  // DETAILED ANALYSIS
  // ============================================================================

  /**
   * Analyze complete chatbox layout (manual trigger from console)
   * Usage: window.ChatboxInspector.analyzeLayout()
   */
  analyzeLayout() {
    console.log('%c[ChatboxInspector] 📐 Complete Layout Analysis', 'color: #8b5cf6; font-weight: bold; font-size: 16px;');

    // Find main chat area
    const chatArea = document.querySelector('[class*="chat"]') ||
                     document.querySelector('[class*="content"]');

    if (!chatArea) {
      console.log('%c⚠️  Chat area not found!', 'color: #ef4444;');
      return;
    }

    console.group('Chat Area Structure');
    this.analyzeHierarchy(chatArea, 0, 5);
    console.groupEnd();

    // Analyze specific components
    this.analyzeMessageInputDetailed();
    this.analyzeToolbarDetailed();
    this.analyzeChatContainerDetailed();
  }

  /**
   * Recursive hierarchy analysis
   */
  analyzeHierarchy(element, depth, maxDepth) {
    if (depth >= maxDepth || !element) return;

    const indent = '  '.repeat(depth);
    const tag = element.tagName.toLowerCase();
    const classes = Array.from(element.classList).slice(0, 3).join(', ');
    const rect = element.getBoundingClientRect();

    console.log(`${indent}${tag} [${classes}]`);
    console.log(`${indent}  Size: ${Math.round(rect.width)}×${Math.round(rect.height)}px`);
    console.log(`${indent}  Position: (${Math.round(rect.left)}, ${Math.round(rect.top)})`);

    // Recurse into children (only direct children, max 5)
    const children = Array.from(element.children).slice(0, 5);
    children.forEach(child => {
      this.analyzeHierarchy(child, depth + 1, maxDepth);
    });
  }

  /**
   * Detailed message input analysis
   */
  analyzeMessageInputDetailed() {
    const textarea = document.querySelector('textarea[placeholder*="Message"]') ||
                     document.querySelector('textarea[class*="textArea"]');

    if (!textarea) return;

    console.group('%c📝 Message Input - Detailed Analysis', 'color: #3b82f6; font-weight: bold;');

    const computed = window.getComputedStyle(textarea);
    const rect = textarea.getBoundingClientRect();

    // Layout metrics
    console.log('Dimensions:', {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      minHeight: computed.minHeight,
      maxHeight: computed.maxHeight,
    });

    // Spacing
    console.log('Spacing:', {
      margin: computed.margin,
      padding: computed.padding,
    });

    // Styling
    console.log('Appearance:', {
      background: computed.backgroundColor,
      color: computed.color,
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily,
      borderRadius: computed.borderRadius,
      border: computed.border,
    });

    // Behavior
    console.log('Behavior:', {
      resize: computed.resize,
      overflow: computed.overflow,
      placeholder: textarea.getAttribute('placeholder'),
    });

    // Parent container
    const container = textarea.closest('[class*="textArea"]') || textarea.parentElement;
    if (container) {
      const containerComputed = window.getComputedStyle(container);
      console.log('Container:', {
        classes: Array.from(container.classList),
        background: containerComputed.backgroundColor,
        border: containerComputed.border,
        padding: containerComputed.padding,
      });
    }

    console.groupEnd();
  }

  /**
   * Detailed toolbar analysis
   */
  analyzeToolbarDetailed() {
    const toolbar = document.querySelector('[class*="buttons"]') ||
                    document.querySelector('[class*="buttonContainer"]');

    if (!toolbar) return;

    console.group('%c🛠️ Toolbar - Detailed Analysis', 'color: #10b981; font-weight: bold;');

    const computed = window.getComputedStyle(toolbar);
    const rect = toolbar.getBoundingClientRect();

    console.log('Toolbar Container:', {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      display: computed.display,
      gap: computed.gap,
      padding: computed.padding,
      background: computed.backgroundColor,
    });

    // Analyze buttons
    const buttons = toolbar.querySelectorAll('button');
    console.log(`Found ${buttons.length} buttons:`);

    buttons.forEach((btn, i) => {
      const btnComputed = window.getComputedStyle(btn);
      const btnRect = btn.getBoundingClientRect();
      const label = btn.getAttribute('aria-label') || `Button ${i + 1}`;

      console.log(`  ${i + 1}. ${label}:`, {
        size: `${Math.round(btnRect.width)}×${Math.round(btnRect.height)}px`,
        color: btnComputed.color,
        background: btnComputed.backgroundColor,
        borderRadius: btnComputed.borderRadius,
      });
    });

    console.groupEnd();
  }

  /**
   * Detailed chat container analysis
   */
  analyzeChatContainerDetailed() {
    const container = document.querySelector('[class*="messagesWrapper"]') ||
                      document.querySelector('[role="log"]');

    if (!container) return;

    console.group('%c💬 Chat Container - Detailed Analysis', 'color: #ec4899; font-weight: bold;');

    const computed = window.getComputedStyle(container);
    const rect = container.getBoundingClientRect();

    console.log('Container Metrics:', {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      position: computed.position,
      overflow: computed.overflow,
      background: computed.backgroundColor,
    });

    // Analyze scrollbar (if custom)
    const scroller = container.querySelector('[class*="scroller"]');
    if (scroller) {
      const scrollerComputed = window.getComputedStyle(scroller);
      console.log('Scrollbar Styling:', {
        width: scrollerComputed.width,
        scrollbarWidth: scrollerComputed.scrollbarWidth,
        scrollbarColor: scrollerComputed.scrollbarColor,
      });
    }

    // Analyze message spacing
    const messages = container.querySelectorAll('[class*="message"]');
    if (messages.length > 1) {
      const msg1Rect = messages[0].getBoundingClientRect();
      const msg2Rect = messages[1].getBoundingClientRect();
      const spacing = msg2Rect.top - msg1Rect.bottom;
      console.log('Message Spacing:', `${Math.round(spacing)}px between messages`);
    }

    console.groupEnd();
  }

  // ============================================================================
  // CUSTOMIZATION OPPORTUNITIES REPORT
  // ============================================================================

  /**
   * Generate comprehensive customization report
   * Usage: window.ChatboxInspector.generateReport()
   */
  generateReport() {
    console.log('%c[ChatboxInspector] 📋 CUSTOMIZATION OPPORTUNITIES REPORT', 'color: #8b5cf6; font-weight: bold; font-size: 18px; background: rgba(139, 92, 246, 0.1); padding: 10px;');

    const report = {
      messageInput: [],
      toolbarButtons: [],
      chatContainer: [],
      scrollbar: [],
      overallTheme: [],
    };

    // Message Input
    report.messageInput = [
      '🎨 Background: Add dark gradient with purple tint',
      '✨ Border: Glowing purple border on focus',
      '🌟 Placeholder: Styled placeholder text',
      '📝 Font: Custom font with glow effect',
      '🔄 Animation: Smooth transitions on focus/blur',
    ];

    // Toolbar Buttons
    report.toolbarButtons = [
      '💫 Icon Glow: Add hover glow to icons',
      '🎯 Active State: Highlight active button',
      '✨ Spacing: Adjust button gaps',
      '🌈 Colors: Custom icon colors per button',
      '🔄 Animation: Subtle pulse on hover',
    ];

    // Chat Container
    report.chatContainer = [
      '🖼️ Background: Custom pattern or gradient',
      '📏 Message Spacing: Adjust vertical gaps',
      '💬 Message Bubbles: Custom message styling',
      '🎨 Alternating: Alternate message backgrounds',
      '✨ Timestamps: Custom timestamp styling',
    ];

    // Scrollbar
    report.scrollbar = [
      '🎨 Thumb Color: Purple gradient thumb',
      '✨ Glow Effect: Glowing scrollbar',
      '📏 Width: Thicker/thinner scrollbar',
      '🔄 Animation: Smooth scroll animations',
      '💫 Hover: Expand on hover',
    ];

    // Overall Theme
    report.overallTheme = [
      '🌌 Dark Mode Enhancement: Deeper blacks with purple accents',
      '✨ Glow Effects: Purple glow throughout chatbox',
      '🎭 Consistency: Match Solo Leveling stats panel style',
      '🔮 Typography: Custom font family',
      '🌟 Animations: Smooth transitions and effects',
    ];

    // Print report
    Object.entries(report).forEach(([category, items]) => {
      console.group(`%c${category.toUpperCase()}`, 'color: #fbbf24; font-weight: bold;');
      items.forEach(item => console.log(item));
      console.groupEnd();
    });

    console.log('%c📊 Total Opportunities: ' + Object.values(report).flat().length, 'color: #10b981; font-weight: bold; font-size: 14px;');
  }
};

// Make available globally for console access
window.ChatboxInspector = new (module.exports)();
window.ChatboxInspector.start();
