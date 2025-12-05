/**
 * @name ActivityCardInspector
 * @author BlueFlashXS
 * @description Detects and extracts Discord activity card selectors and class names for CSS customization. Helps identify purple timestamp elements.
 * @version 1.0.0
 * @authorId YOUR_ID_HERE
 */

module.exports = class ActivityCardInspector {
  constructor() {
    this.observers = [];
    this.inspectedElements = new Set();
    this.config = {
      info: {
        name: 'ActivityCardInspector',
        authors: [{ name: 'BlueFlashXS' }],
        version: '1.0.0',
        description:
          'Detects and extracts Discord activity card selectors and class names for CSS customization.',
      },
      defaultConfig: [
        {
          type: 'switch',
          id: 'autoInspect',
          name: 'Auto-Inspect Activity Cards',
          note: 'Automatically detect and log activity cards when they appear',
          value: true,
        },
        {
          type: 'switch',
          id: 'highlightElements',
          name: 'Highlight Detected Elements',
          note: 'Add visual borders to detected activity card elements',
          value: true,
        },
        {
          type: 'switch',
          id: 'logToConsole',
          name: 'Log to Console',
          note: 'Log detected selectors to browser console',
          value: true,
        },
        {
          type: 'switch',
          id: 'showNotifications',
          name: 'Show Notifications',
          note: 'Show notifications when activity cards are detected',
          value: false,
        },
      ],
    };
  }

  getName() {
    return this.config.info.name;
  }
  getAuthor() {
    return this.config.info.authors.map((a) => a.name).join(', ');
  }
  getVersion() {
    return this.config.info.version;
  }
  getDescription() {
    return this.config.info.description;
  }

  start() {
    this.log('Plugin started');
    this.settings = BdApi.Data.load(this.getName(), 'settings') || {};

    // Debounce timers
    this.debounceTimer = null;
    this.lastScanTime = 0;
    this.scanCooldown = 1000; // 1 second cooldown between scans

    // Set default settings
    this.config.defaultConfig.forEach((config) => {
      if (this.settings[config.id] === undefined) {
        this.settings[config.id] = config.value;
      }
    });

    // Start observing (with reduced frequency)
    if (this.settings.autoInspect) {
      this.startObserving();
    }

    // Add styles for highlighting
    if (this.settings.highlightElements) {
      this.addHighlightStyles();
    }

    // Scan existing elements (debounced)
    this.scanExistingActivityCards();

    this.log('Activity Card Inspector ready! Type detectContainerHierarchy() in console when needed.');
    if (this.settings.showNotifications) {
      BdApi.UI.showNotification('Activity Card Inspector started (Low-spam mode)', { type: 'success' });
    }
  }

  // Detect and report activity card container hierarchy
  detectContainerHierarchy() {
    console.group('%c[Activity Card Inspector] CONTAINER HIERARCHY ANALYSIS', 'color: #ff6600; font-weight: bold; font-size: 14px;');

    const popouts = document.querySelectorAll('[class*="popout"]');

    if (popouts.length === 0) {
      console.log('%c⚠️ No popouts found. Open a user profile to analyze.', 'color: #ff6600;');
      console.groupEnd();
      return;
    }

    popouts.forEach((popout) => {
      const heroes = popout.querySelectorAll('[class*="hero"]');

      heroes.forEach((hero) => {
        const computed = window.getComputedStyle(hero);
        const bbox = hero.getBoundingClientRect();

        if (bbox.width === 0 || bbox.height === 0) return;

        console.group('%c🎯 HERO CONTAINER', 'color: #ff6600; font-weight: bold;');
        console.log('%cClass:', 'color: #8a2be2;', hero.className);
        console.log('%cBox:', 'color: #8a2be2;', `${Math.round(bbox.x)}, ${Math.round(bbox.y)}, ${Math.round(bbox.width)}x${Math.round(bbox.height)}`);
        console.log('%cMargin:', 'color: #8a2be2;', computed.margin);
        console.log('%cBorder:', 'color: #8a2be2;', computed.border);

        const body = hero.querySelector('[class*="popoutHeroBody"]');
        if (body) {
          const bodyComputed = window.getComputedStyle(body);
          const bodyBbox = body.getBoundingClientRect();

          console.group('%c  📦 BODY CONTAINER', 'color: #00ff88;');
          console.log('%cClass:', 'color: #8a2be2;', body.className);
          console.log('%cBox:', 'color: #8a2be2;', `${Math.round(bodyBbox.x)}, ${Math.round(bodyBbox.y)}, ${Math.round(bodyBbox.width)}x${Math.round(bodyBbox.height)}`);
          console.log('%cMargin:', 'color: #8a2be2;', bodyComputed.margin);
          console.log('%cBorder:', 'color: #8a2be2;', bodyComputed.border);

          const xDiff = bodyBbox.x - bbox.x;
          const rightOffset = (bbox.width - bodyBbox.width) - xDiff;

          console.log('%c🔍 Alignment:', 'color: #ff6600;', `Left: ${Math.round(xDiff)}px, Right: ${Math.round(rightOffset)}px`);

          if (Math.abs(xDiff - rightOffset) > 2) {
            console.log('%c⚠️ NOT CENTERED!', 'color: #ff0000; font-weight: bold;');
          } else {
            console.log('%c✅ CENTERED', 'color: #00ff88;');
          }

          console.groupEnd();
        }

        console.groupEnd();
      });
    });

    console.groupEnd();
  }

  stop() {
    this.log('Plugin stopped');
    this.stopObserving();
    this.removeHighlightStyles();
    this.inspectedElements.clear();

    if (this.settings.showNotifications) {
      BdApi.UI.showNotification('Activity Card Inspector stopped', { type: 'info' });
    }
  }

  // Add visual highlighting styles
  addHighlightStyles() {
    if (document.getElementById('activity-card-inspector-styles')) return;

    const style = document.createElement('style');
    style.id = 'activity-card-inspector-styles';
    style.textContent = `
      /* Activity Card Inspector Highlights */
      .aci-activity-card {
        outline: 3px solid #00ff88 !important;
        outline-offset: 2px !important;
      }
      .aci-timestamp-bar {
        outline: 3px solid #ff4444 !important;
        outline-offset: 1px !important;
      }
      .aci-time-element {
        outline: 2px solid #ffaa00 !important;
        outline-offset: 1px !important;
      }
      .aci-container {
        outline: 2px dashed #8a2be2 !important;
        outline-offset: 1px !important;
      }
      .aci-purple-background {
        box-shadow: 0 0 15px #ff0000 !important;
      }
    `;
    document.head.appendChild(style);
  }

  removeHighlightStyles() {
    const style = document.getElementById('activity-card-inspector-styles');
    if (style) style.remove();

    // Remove all highlight classes
    document.querySelectorAll('[class*="aci-"]').forEach((el) => {
      el.className = el.className
        .split(' ')
        .filter((c) => !c.startsWith('aci-'))
        .join(' ');
    });
  }

  // Start observing DOM for activity cards
  startObserving() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            // Element node
            this.inspectElement(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.observers.push(observer);
  }

  stopObserving() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }

  // Scan existing activity cards
  scanExistingActivityCards() {
    this.log('Scanning for existing activity cards...');

    // Multi-strategy patterns to survive Discord updates
    // Strategy 1: Known current patterns
    const currentPatterns = [
      '[class*="badgesContainer"]', // PRIMARY: Timestamp purple bar container
      '[class*="infoSection"]', // Activity info section
      '[class*="contentTitle"]', // Activity title
    ];

    // Strategy 2: Legacy/common patterns
    const legacyPatterns = [
      '[class*="activityCard"]',
      '[class*="activityPanel"]',
      '[class*="richPresence"]',
      '[class*="Activity"]', // Capital A
    ];

    // Strategy 3: Context-based (find within popouts/profiles)
    const contextPatterns = [
      '[class*="userPopout"] [class*="activity"]',
      '[class*="userPopout"] [class*="Activity"]',
      '[class*="userPopout"] [class*="badges"]',
      '[class*="userProfileModal"] [class*="activity"]',
      '[class*="userProfileModal"] [class*="Activity"]',
      '[class*="popoutHeroBody"] *', // All elements in hero body
    ];

    // Strategy 4: Semantic element search (time elements)
    const semanticPatterns = [
      'time', // <time> elements
      '[datetime]', // Elements with datetime attribute
      '[class*="timestamp"]',
      '[class*="Timestamp"]',
    ];

    // Combine all patterns
    const allPatterns = [
      ...currentPatterns,
      ...legacyPatterns,
      ...contextPatterns,
      ...semanticPatterns,
    ];

    allPatterns.forEach((pattern) => {
      try {
        const elements = document.querySelectorAll(pattern);
        if (elements.length > 0) {
          this.log(`Found ${elements.length} elements matching: ${pattern}`);
          elements.forEach((el) => this.inspectElement(el));
        }
      } catch (error) {
        // Invalid selector, skip
      }
    });

    // Strategy 5: Color-based detection (find purple backgrounds directly)
    this.scanByBackgroundColor();
  }

  // Inspect a single element
  inspectElement(element) {
    // Skip if already inspected
    if (this.inspectedElements.has(element)) return;

    // Check if element or descendants match activity card patterns
    const isActivityCard = this.isActivityCardElement(element);
    if (!isActivityCard) {
      // Check descendants
      const descendants = element.querySelectorAll(
        '[class*="activityCard"], [class*="activityPanel"], [class*="richPresence"], [class*="activity"], [class*="infoSection"], [class*="badgesContainer"], [class*="Activity"]'
      );
      if (descendants.length === 0) return;

      descendants.forEach((desc) => this.inspectElement(desc));
      return;
    }

    this.inspectedElements.add(element);

    // Extract information
    const info = this.extractElementInfo(element);

    // Log to console
    if (this.settings.logToConsole) {
      this.logElementInfo(info);
    }

    // Highlight element
    if (this.settings.highlightElements) {
      this.highlightElement(element, info);
    }
  }

  // Check if element is activity card related
  isActivityCardElement(element) {
    if (!element || !element.className) return false;

    const className = element.className.toString();

    // Multi-pattern matching for resilience
    const classPatterns = [
      'activityCard',
      'activityPanel',
      'richPresence',
      'activity',
      'Activity', // Capital A
      'infoSection',
      'badgesContainer',
      'badges',
      'contentTitle',
      'userPopout',
      'userProfileModal',
      'popoutHero',
      'timestamp',
      'Timestamp',
    ];

    // Check class name patterns
    if (classPatterns.some((pattern) => className.includes(pattern))) {
      return true;
    }

    // Check if element has purple background (color-based detection)
    if (this.hasPurpleBackground(element)) {
      return true;
    }

    // Check if it's a time element
    if (
      element.tagName &&
      (element.tagName.toLowerCase() === 'time' || element.hasAttribute('datetime'))
    ) {
      return true;
    }

    return false;
  }

  // Check if element has purple background color
  hasPurpleBackground(element) {
    try {
      const computed = window.getComputedStyle(element);
      const bgColor = computed.backgroundColor;

      if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
        return false;
      }

      // Check for purple color patterns
      const purplePatterns = [
        '138, 43, 226', // #8a2be2 - Blue Violet
        '139, 92, 246', // #8b5cf6 - Medium Slate Blue
        '186, 85, 211', // #ba55d3 - Medium Orchid
        '139, 127, 168', // #8b7fa8 - Muted Purple
        '147, 51, 234', // #9333ea - Purple
        '124, 58, 237', // #7c3aed - Violet
      ];

      return purplePatterns.some((pattern) => bgColor.includes(pattern));
    } catch (error) {
      return false;
    }
  }

  // Scan for elements with purple backgrounds directly
  scanByBackgroundColor() {
    try {
      // Get all elements in popouts and profiles
      const contexts = document.querySelectorAll(
        '[class*="userPopout"], [class*="userProfile"], [class*="popout"]'
      );

      contexts.forEach((context) => {
        // Check all descendants for purple backgrounds
        const allElements = context.querySelectorAll('*');
        allElements.forEach((el) => {
          if (this.hasPurpleBackground(el)) {
            this.inspectElement(el);
          }
        });
      });
    } catch (error) {
      // Ignore errors
    }
  }

  // Extract detailed information from element
  extractElementInfo(element) {
    const info = {
      type: 'unknown',
      element: element,
      tag: element.tagName.toLowerCase(),
      classes: Array.from(element.classList),
      fullClassName: element.className.toString(),
      id: element.id || null,
      attributes: {},
      computedStyles: {},
      children: [],
      selector: this.generateSelector(element),
      hasBackgroundColor: false,
      backgroundColor: null,
      hasPurpleBackground: false,
      inlineStyles: element.getAttribute('style') || null,
    };

    // Determine type
    if (info.fullClassName.includes('activityCard') || info.fullClassName.includes('Activity')) {
      info.type = 'activityCard';
    } else if (info.fullClassName.includes('activityPanel')) {
      info.type = 'activityPanel';
    } else if (info.fullClassName.includes('richPresence')) {
      info.type = 'richPresence';
    } else if (info.fullClassName.includes('infoSection')) {
      info.type = 'infoSection';
    } else if (info.fullClassName.includes('badgesContainer')) {
      info.type = 'badgesContainer';
    } else if (info.fullClassName.includes('contentTitle')) {
      info.type = 'contentTitle';
    } else if (info.fullClassName.includes('timestamp') || info.fullClassName.includes('time')) {
      info.type = 'timestamp';
    } else if (info.fullClassName.includes('bar') || info.fullClassName.includes('Bar')) {
      info.type = 'bar';
    } else if (info.fullClassName.includes('Container')) {
      info.type = 'container';
    }

    // Get attributes
    Array.from(element.attributes).forEach((attr) => {
      info.attributes[attr.name] = attr.value;
    });

    // Get computed styles (comprehensive for layout debugging)
    const computed = window.getComputedStyle(element);
    info.computedStyles = {
      // Background
      backgroundColor: computed.backgroundColor,
      background: computed.background,
      backgroundImage: computed.backgroundImage,

      // Layout
      display: computed.display,
      position: computed.position,

      // Dimensions
      width: computed.width,
      height: computed.height,

      // Box Model
      padding: computed.padding,
      paddingTop: computed.paddingTop,
      paddingRight: computed.paddingRight,
      paddingBottom: computed.paddingBottom,
      paddingLeft: computed.paddingLeft,

      margin: computed.margin,
      marginTop: computed.marginTop,
      marginRight: computed.marginRight,
      marginBottom: computed.marginBottom,
      marginLeft: computed.marginLeft,

      // Border
      border: computed.border,
      borderWidth: computed.borderWidth,
      borderColor: computed.borderColor,
      borderRadius: computed.borderRadius,

      // Outline
      outline: computed.outline,
      outlineWidth: computed.outlineWidth,
      outlineColor: computed.outlineColor,
      outlineOffset: computed.outlineOffset,

      // Box Shadow
      boxShadow: computed.boxShadow,
    };

    // Get bounding box for alignment checking
    info.boundingBox = element.getBoundingClientRect();
    info.offsetParent = element.offsetParent?.className || 'none';

    // Check for background color
    const bgColor = computed.backgroundColor;
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      info.hasBackgroundColor = true;
      info.backgroundColor = bgColor;

      // Check if purple-ish
      const purplePatterns = ['138, 43, 226', '139, 92, 246', '186, 85, 211', '139, 127, 168'];
      info.hasPurpleBackground = purplePatterns.some((pattern) => bgColor.includes(pattern));
    }

    // Find time-related children
    const timeChildren = element.querySelectorAll(
      'time, [datetime], [class*="time"], [class*="timestamp"], [class*="bar"]'
    );
    info.children = Array.from(timeChildren).map((child) => ({
      tag: child.tagName.toLowerCase(),
      classes: Array.from(child.classList),
      selector: this.generateSelector(child),
      backgroundColor: window.getComputedStyle(child).backgroundColor,
    }));

    return info;
  }

  // Generate CSS selector for element
  generateSelector(element) {
    if (!element) return '';

    const parts = [];
    let current = element;
    let depth = 0;
    const maxDepth = 5;

    while (current && current !== document.body && depth < maxDepth) {
      let selector = current.tagName.toLowerCase();

      // Add ID if available
      if (current.id) {
        selector += `#${current.id}`;
        parts.unshift(selector);
        break;
      }

      // Add classes (first 2 most specific)
      const classes = Array.from(current.classList)
        .filter((c) => !c.startsWith('aci-'))
        .slice(0, 2);
      if (classes.length > 0) {
        selector += `.${classes.join('.')}`;
      }

      parts.unshift(selector);
      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  }

  // Log element information to console (simplified)
  logElementInfo(info) {
    // Only log main container elements (hero, body, infoSection)
    // Skip badges, timestamps, icons, etc.
    const importantTypes = ['hero', 'popoutheroinner', 'popoutherobody', 'infosection'];
    const isImportant = importantTypes.some(type => info.type.toLowerCase().includes(type));

    if (!isImportant) {
      return; // Skip logging for non-container elements
    }

    console.group(
      `%c[Activity Card Inspector] ${info.type.toUpperCase()}`,
      'color: #00ff88; font-weight: bold;'
    );

    console.log('%cElement Type:', 'color: #8a2be2; font-weight: bold;', info.type);
    console.log('%cCSS Selector:', 'color: #00ff88; font-weight: bold;', info.selector);

    // Simplified layout info
    console.log('%cBox:', 'color: #ffaa00;',
      `${Math.round(info.boundingBox.width)}x${Math.round(info.boundingBox.height)} at (${Math.round(info.boundingBox.x)}, ${Math.round(info.boundingBox.y)})`
    );

    if (info.inlineStyles) {
      console.log('%cInline Styles:', 'color: #ff4444;', info.inlineStyles);
    }

    if (info.hasBackgroundColor) {
      const bgStyle = info.hasPurpleBackground
        ? 'color: #ff4444; font-weight: bold;'
        : 'color: #ffaa00;';
      console.log('%cBackground Color:', bgStyle, info.backgroundColor);

      if (info.hasPurpleBackground) {
        console.log(
          '%c⚠️ PURPLE BACKGROUND DETECTED!',
          'color: #ff0000; font-weight: bold; font-size: 14px;'
        );
        console.log(
          '%cCSS to remove:',
          'color: #00ff88;',
          `\n${info.selector} {\n  background: transparent !important;\n  background-color: transparent !important;\n}`
        );
      }
    }

    console.log('%cMargin:', 'color: #ffaa00;', info.computedStyles.margin);
    console.log('%cBorder:', 'color: #ffaa00;', info.computedStyles.border);

    console.groupEnd();
  }

  // Highlight element visually
  highlightElement(element, info) {
    if (info.type === 'activityCard') {
      element.classList.add('aci-activity-card');
    } else if (info.type === 'timestamp' || info.type === 'bar') {
      element.classList.add('aci-timestamp-bar');
    } else if (info.type === 'container') {
      element.classList.add('aci-container');
    }

    if (element.tagName.toLowerCase() === 'time') {
      element.classList.add('aci-time-element');
    }

    if (info.hasPurpleBackground) {
      element.classList.add('aci-purple-background');
    }
  }

  // Utility: Log with plugin prefix
  log(...args) {
    console.log('%c[ActivityCardInspector]', 'color: #8a2be2; font-weight: bold;', ...args);
  }

  // Settings panel
  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.padding = '20px';
    panel.style.color = '#dcddde';

    const title = document.createElement('h2');
    title.textContent = 'Activity Card Inspector Settings';
    title.style.marginBottom = '20px';
    title.style.color = '#fff';
    panel.appendChild(title);

    // Add settings controls
    this.config.defaultConfig.forEach((config) => {
      const setting = this.createSettingElement(config);
      panel.appendChild(setting);
    });

    // Add manual scan button
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '20px';
    buttonContainer.style.paddingTop = '20px';
    buttonContainer.style.borderTop = '1px solid #4f545c';

    const scanButton = document.createElement('button');
    scanButton.textContent = '🔍 Scan Activity Cards Now';
    scanButton.style.padding = '10px 20px';
    scanButton.style.backgroundColor = '#8a2be2';
    scanButton.style.color = '#fff';
    scanButton.style.border = 'none';
    scanButton.style.borderRadius = '4px';
    scanButton.style.cursor = 'pointer';
    scanButton.style.fontSize = '14px';
    scanButton.style.fontWeight = 'bold';
    scanButton.onclick = () => {
      this.inspectedElements.clear();
      this.scanExistingActivityCards();
      BdApi.UI.showNotification('Activity cards scanned! Check console for results.', {
        type: 'success',
      });
    };
    buttonContainer.appendChild(scanButton);

    const clearButton = document.createElement('button');
    clearButton.textContent = '🗑️ Clear Console';
    clearButton.style.padding = '10px 20px';
    clearButton.style.backgroundColor = '#ff4444';
    clearButton.style.color = '#fff';
    clearButton.style.border = 'none';
    clearButton.style.borderRadius = '4px';
    clearButton.style.cursor = 'pointer';
    clearButton.style.fontSize = '14px';
    clearButton.style.fontWeight = 'bold';
    clearButton.style.marginLeft = '10px';
    clearButton.onclick = () => {
      console.clear();
      this.log('Console cleared');
    };
    buttonContainer.appendChild(clearButton);

    panel.appendChild(buttonContainer);

    // Add instructions
    const instructions = document.createElement('div');
    instructions.style.marginTop = '20px';
    instructions.style.padding = '15px';
    instructions.style.backgroundColor = 'rgba(138, 43, 226, 0.1)';
    instructions.style.borderRadius = '4px';
    instructions.style.fontSize = '13px';
    instructions.style.lineHeight = '1.6';
    instructions.innerHTML = `
      <h3 style="color: #8a2be2; margin-bottom: 10px;">📋 How to Use:</h3>
      <ol style="margin: 0; padding-left: 20px;">
        <li>Open a user profile or popout that shows activity</li>
        <li>Open browser console (F12 or Ctrl+Shift+I)</li>
        <li>Watch for logged activity card elements</li>
        <li>Elements with purple backgrounds will be highlighted in RED</li>
        <li>Copy the CSS selectors to remove purple backgrounds</li>
      </ol>
      <br>
      <h3 style="color: #8a2be2; margin-bottom: 10px;">🎨 Highlight Colors:</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li><span style="color: #00ff88;">■</span> Green = Activity Card Root</li>
        <li><span style="color: #ff4444;">■</span> Red = Timestamp Bar</li>
        <li><span style="color: #ffaa00;">■</span> Orange = Time Element</li>
        <li><span style="color: #8a2be2;">■</span> Purple = Container</li>
        <li><span style="color: #ff0000;">■</span> Red Glow = Purple Background Detected!</li>
      </ul>
    `;
    panel.appendChild(instructions);

    return panel;
  }

  createSettingElement(config) {
    const container = document.createElement('div');
    container.style.marginBottom = '15px';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'space-between';

    const labelContainer = document.createElement('div');
    labelContainer.style.flex = '1';

    const label = document.createElement('label');
    label.textContent = config.name;
    label.style.fontSize = '16px';
    label.style.fontWeight = '500';
    label.style.display = 'block';
    label.style.marginBottom = '4px';
    labelContainer.appendChild(label);

    const note = document.createElement('div');
    note.textContent = config.note;
    note.style.fontSize = '12px';
    note.style.color = '#b9bbbe';
    labelContainer.appendChild(note);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = this.settings[config.id];
    toggle.style.width = '40px';
    toggle.style.height = '20px';
    toggle.style.cursor = 'pointer';
    toggle.onchange = () => {
      this.settings[config.id] = toggle.checked;
      BdApi.Data.save(this.getName(), 'settings', this.settings);

      // Apply changes
      if (config.id === 'autoInspect') {
        if (toggle.checked) {
          this.startObserving();
        } else {
          this.stopObserving();
        }
      } else if (config.id === 'highlightElements') {
        if (toggle.checked) {
          this.addHighlightStyles();
        } else {
          this.removeHighlightStyles();
        }
      }
    };

    container.appendChild(labelContainer);
    container.appendChild(toggle);

    return container;
  }
};
