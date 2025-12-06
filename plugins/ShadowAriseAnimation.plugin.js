/**
 * @name ShadowAriseAnimation
 * @author BlueFlashX1
 * @description Epic ARISE animation when extracting shadows
 * @version 1.1.0
 */

module.exports = class ShadowAriseAnimation {
  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================

  /**
   * Initialize ShadowAriseAnimation plugin with default settings
   * Operations:
   * 1. Set up default settings (enabled, duration, scale, showRankAndRole)
   * 2. Initialize settings and animation container reference
   */
  constructor() {
    this.defaultSettings = {
      enabled: true,
      debugMode: false, // Debug mode toggle
      animationDuration: 2500,
      scale: 1.0,
      showRankAndRole: true,
      animationFont: 'Speedy Space Goat Oddity', // Font for ARISE animation text
      useLocalFonts: true, // Use local font files for animation font
    };

    // CRITICAL FIX: Deep copy to prevent defaultSettings from being modified
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.animationContainer = null;
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Start the ShadowAriseAnimation plugin
   * Operations:
   * 1. Load saved settings from localStorage
   * 2. Inject CSS styles for animation
   */
  start() {
    this.loadSettings();
    this.loadShadowAriseAnimationFont(); // Load animation font before injecting CSS
    this.injectCSS();
  }

  /**
   * Stop the ShadowAriseAnimation plugin and clean up resources
   * Operations:
   * 1. Remove all active animations from DOM
   * 2. Remove injected CSS styles
   */
  stop() {
    this.removeAllAnimations();
    this.removeCSS();
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  /**
   * Load settings from localStorage with defaults
   * Operations:
   * 1. Attempt to load saved settings using BdApi.Data
   * 2. Merge with default settings
   * 3. Handle errors gracefully with console logging
   */
  loadSettings() {
    try {
      const saved = BdApi.Data.load('ShadowAriseAnimation', 'settings');
      // FUNCTIONAL: Short-circuit merge with deep copy (no if-else)
      saved && (this.settings = JSON.parse(JSON.stringify({ ...this.defaultSettings, ...saved })));
    } catch (error) {
      this.debugLog('Failed to load settings', error);
    }
  }

  /**
   * Save current settings to localStorage
   * Operations:
   * 1. Serialize settings object to JSON
   * 2. Save using BdApi.Data.save()
   * 3. Handle errors gracefully with console logging
   */
  saveSettings() {
    try {
      BdApi.Data.save('ShadowAriseAnimation', 'settings', this.settings);
    } catch (error) {
      this.debugLog('Failed to save settings', error);
    }
  }

  // ============================================================================
  // SETTINGS UI
  // ============================================================================

  /**
   * Generate settings panel HTML for BetterDiscord settings UI
   * Operations:
   * 1. Create panel div element
   * 2. Generate HTML with checkboxes and inputs for all settings
   * 3. Attach event listeners for setting changes
   * 4. Return panel element
   */
  getSettingsPanel() {
    const panel = document.createElement('div');
    panel.style.padding = '16px';
    panel.innerHTML = `
      <div style="margin-bottom: 12px;">
        <h3 style="color: #8b5cf6; margin-bottom: 8px;">Shadow ARISE Animation</h3>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
          <input type="checkbox" id="sa-enabled" ${this.settings.enabled ? 'checked' : ''}>
          <span>Enable ARISE animation</span>
        </label>
        <label style="display:block;margin-bottom:8px;">
          <span style="display:block;margin-bottom:4px;">Animation duration (ms)</span>
          <input type="number" id="sa-duration" value="${
            this.settings.animationDuration
          }" min="800" max="6000" step="200" style="width:100%;padding:4px;">
        </label>
        <label style="display:block;margin-bottom:8px;">
          <span style="display:block;margin-bottom:4px;">Scale</span>
          <input type="number" id="sa-scale" value="${
            this.settings.scale
          }" min="0.5" max="2.0" step="0.1" style="width:100%;padding:4px;">
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
          <input type="checkbox" id="sa-show-meta" ${
            this.settings.showRankAndRole ? 'checked' : ''
          }>
          <span>Show rank and role under ARISE</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;">
          <input type="checkbox" id="sa-debug" ${this.settings.debugMode ? 'checked' : ''}>
          <span>Debug Mode (Show console logs)</span>
        </label>
        <div style="margin-top: 15px; padding: 10px; background: rgba(139, 92, 246, 0.1); border-radius: 8px; border-left: 3px solid #8b5cf6;">
          <div style="color: #8b5cf6; font-weight: bold; margin-bottom: 5px;">Debug Information</div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            Enable Debug Mode to see detailed console logs for:
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>Animation triggers and shadow data</li>
              <li>Settings load/save operations</li>
              <li>CSS injection and cleanup</li>
              <li>Container creation and removal</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    panel.querySelector('#sa-enabled')?.addEventListener('change', (e) => {
      this.settings.enabled = e.target.checked;
      this.saveSettings();
      this.debugLog('ARISE animation toggled', { enabled: e.target.checked });
    });

    panel.querySelector('#sa-duration')?.addEventListener('change', (e) => {
      this.settings.animationDuration =
        parseInt(e.target.value, 10) || this.defaultSettings.animationDuration;
      this.saveSettings();
      this.debugLog('Animation duration updated', { duration: this.settings.animationDuration });
    });

    panel.querySelector('#sa-scale')?.addEventListener('change', (e) => {
      this.settings.scale = parseFloat(e.target.value) || this.defaultSettings.scale;
      this.saveSettings();
      this.debugLog('Scale updated', { scale: this.settings.scale });
    });

    panel.querySelector('#sa-show-meta')?.addEventListener('change', (e) => {
      this.settings.showRankAndRole = e.target.checked;
      this.saveSettings();
      this.debugLog('Show rank/role toggled', { enabled: e.target.checked });
    });

    panel.querySelector('#sa-debug')?.addEventListener('change', (e) => {
      this.settings.debugMode = e.target.checked;
      this.saveSettings();
      this.debugLog('Debug mode toggled', { enabled: e.target.checked });
    });

    return panel;
  }

  // ============================================================================
  // FONT LOADING
  // ============================================================================

  /**
   * Get the fonts folder path for Shadow Arise Animation plugin
   * @returns {string} Path to fonts folder
   */
  getFontsFolderPath() {
    try {
      const pluginPath = BdApi.Plugins.folder.replace(/\\/g, '/');
      if (pluginPath) {
        const normalizedPath = pluginPath.endsWith('/') ? pluginPath : `${pluginPath}/`;
        return `${normalizedPath}ShadowAriseAnimation/fonts/`;
      }
    } catch (e) {
      this.debugError('Failed to get plugin path', e);
    }
    return './ShadowAriseAnimation/fonts/';
  }

  /**
   * Load local font file for Shadow Arise animation
   * @param {string} fontName - Name of the font to load
   * @param {string} fontFamily - CSS font-family value (optional)
   * @returns {boolean} True if font was loaded successfully
   */
  loadLocalFont(fontName, fontFamily = null) {
    if (!fontFamily) {
      fontFamily = `'${fontName}', sans-serif`;
    }

    try {
      // Check if font is already loaded
      const existingStyle = document.getElementById(
        `sa-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`
      );
      if (existingStyle) {
        return true; // Font already loaded
      }

      const fontsPath = this.getFontsFolderPath();
      // Handle special font name cases - map display names to file names
      let fontFileName = fontName.replace(/\s+/g, ''); // Remove spaces for filename
      if (fontName.toLowerCase().includes('speedy space goat')) {
        fontFileName = 'SpeedySpaceGoatOddity'; // Exact filename match
      }

      // Create @font-face with multiple format support
      const fontStyle = document.createElement('style');
      fontStyle.id = `sa-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
      fontStyle.textContent = `
        @font-face {
          font-family: '${fontName}';
          src: url('${fontsPath}${fontFileName}.woff2') format('woff2'),
               url('${fontsPath}${fontFileName}.woff') format('woff'),
               url('${fontsPath}${fontFileName}.ttf') format('truetype');
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `;
      document.head.appendChild(fontStyle);
      this.debugLog('Local font loaded', { fontName, fontFileName });
      return true;
    } catch (error) {
      this.debugError('Failed to load local font', error);
      return false;
    }
  }

  /**
   * Load animation font for Shadow Arise animation (Speedy Space Goat Oddity)
   * Uses local files if enabled (for Speedy Space Goat Oddity)
   * @param {string} fontName - Name of the font to load (optional, uses settings if not provided)
   * @returns {boolean} True if font was loaded
   */
  loadShadowAriseAnimationFont(fontName = null) {
    const fontToLoad = fontName || this.settings.animationFont || 'Speedy Space Goat Oddity';

    // Speedy Space Goat Oddity is not on Google Fonts, so try local first
    const isSpeedyGoat =
      fontToLoad.toLowerCase().includes('speedy space goat') ||
      fontToLoad.toLowerCase().includes('speedy goat');

    if (isSpeedyGoat) {
      // Try local files first (Speedy Space Goat Oddity needs to be downloaded)
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      // If local fails, warn user
      this.debugLog(
        'Speedy Space Goat Oddity requires local font files. Enable useLocalFonts and ensure font is in fonts/ folder.',
        {
          fontName: fontToLoad,
        }
      );
      return false; // Can't load from Google Fonts
    }

    // For other fonts, try local if enabled
    if (this.settings.useLocalFonts) {
      return this.loadLocalFont(fontToLoad);
    }

    return false;
  }

  // ============================================================================
  // CSS STYLING
  // ============================================================================

  /**
   * Inject CSS styles for ARISE animation
   * Operations:
   * 1. Check if styles already injected (prevent duplicates)
   * 2. Create style element with all animation CSS rules
   * 3. Append to document head
   */
  injectCSS() {
    const styleId = 'shadow-arise-animation-css';
    // FUNCTIONAL: Guard clause with short-circuit (early return)
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    const animationFont = this.settings.animationFont || 'Speedy Space Goat Oddity';
    style.textContent = `
      .sa-animation-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999999;
      }

      .sa-arise-wrapper {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        animation: sa-arise-float var(--sa-duration, 2.5s) ease-out forwards;
      }

      .sa-arise-text {
        font-family: '${animationFont}', system-ui, sans-serif;
        font-weight: 700;
        font-size: 42px;
        letter-spacing: 0.12em;
        text-transform: none; /* Changed from uppercase to preserve "ARiSe" casing */
        background: linear-gradient(135deg, #020617 0%, #0f172a 35%, #1d4ed8 70%, #38bdf8 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-shadow:
          0 0 10px rgba(15, 23, 42, 0.95),
          0 0 18px rgba(37, 99, 235, 0.95),
          0 0 26px rgba(56, 189, 248, 0.75);
        animation: sa-arise-glow 0.7s ease-in-out infinite alternate;
        /* Font smoothing for smoother edges */
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }
      /* Make the "R" in "ARISE" slightly smaller */
      .sa-arise-text .sa-small-r {
        font-size: 0.9em !important; /* Make R 10% smaller (slightly, not too small) */
        display: inline-block !important;
      }

      .sa-arise-meta {
        margin-top: 6px;
        font-size: 14px;
        color: #e5e7eb;
        text-shadow: 0 0 8px rgba(15, 23, 42, 0.8);
        opacity: 0.9;
      }

      .sa-arise-particle {
        position: absolute;
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: radial-gradient(circle, #38bdf8 0%, rgba(15, 23, 42, 0) 70%);
        animation: sa-arise-particle-fade var(--sa-duration, 2.5s) ease-out forwards;
      }

      @keyframes sa-arise-float {
        0% {
          opacity: 0;
          transform: translate(-50%, -40%) scale(calc(0.6 * var(--sa-scale, 1)));
        }
        15% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(calc(1.1 * var(--sa-scale, 1)));
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -70%) scale(calc(0.9 * var(--sa-scale, 1)));
        }
      }

      @keyframes sa-arise-glow {
        from {
          filter:
            drop-shadow(0 0 10px rgba(15, 23, 42, 1))
            drop-shadow(0 0 18px rgba(37, 99, 235, 0.9));
        }
        to {
          filter:
            drop-shadow(0 0 16px rgba(30, 64, 175, 1))
            drop-shadow(0 0 30px rgba(56, 189, 248, 0.95));
        }
      }

      @keyframes sa-arise-particle-fade {
        0% {
          opacity: 1;
          transform: translate(0, 0) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(var(--sa-particle-x, 0px), var(--sa-particle-y, -140px)) scale(0);
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Remove injected CSS styles
   * Operations:
   * 1. Find style element by ID
   * 2. Remove from document head if found
   */
  removeCSS() {
    const style = document.getElementById('shadow-arise-animation-css');
    // FUNCTIONAL: Short-circuit (no if-else)
    style?.remove();
  }

  // ============================================================================
  // ANIMATION MANAGEMENT
  // ============================================================================

  /**
   * Get or create animation container element
   * Operations:
   * 1. Check if container already exists
   * 2. Create new container div if needed
   * 3. Append to document body
   * 4. Store reference for later use
   * 5. Return container element
   */
  getContainer() {
    if (!this.animationContainer) {
      const container = document.createElement('div');
      container.className = 'sa-animation-container';
      document.body.appendChild(container);
      this.animationContainer = container;
    }
    return this.animationContainer;
  }

  /**
   * Remove all animations and clean up container
   * Operations:
   * 1. Check if container exists and has parent
   * 2. Remove container from DOM
   * 3. Clear reference to null
   */
  removeAllAnimations() {
    // FUNCTIONAL: Short-circuit cleanup (no if-else)
    this.animationContainer?.parentNode &&
      (this.animationContainer.parentNode.removeChild(this.animationContainer),
      (this.animationContainer = null));
  }

  /**
   * Public API used by ShadowArmy: trigger an ARISE animation for a given shadow
   * Operations:
   * 1. Check if animation is enabled
   * 2. Validate document exists (SSR safety)
   * 3. Get animation container
   * 4. Create wrapper element with animation class
   * 5. Set CSS custom properties (duration, scale)
   * 6. Create "ARISE" text element with gradient styling
   * 7. Optionally create meta element with rank and role
   * 8. Spawn particle effects (22 particles with random positions)
   * 9. Append wrapper to container
   * 10. Schedule removal after animation duration
   */
  triggerArise(shadow) {
    // FUNCTIONAL: Guard clauses (early returns - GOOD if-else usage)
    if (!this.settings.enabled) return;
    if (typeof document === 'undefined') return;

    const container = this.getContainer();
    const durationMs = this.settings.animationDuration || this.defaultSettings.animationDuration;

    const wrapper = document.createElement('div');
    wrapper.className = 'sa-arise-wrapper';
    wrapper.style.setProperty('--sa-duration', `${durationMs}ms`);
    const scale = this.settings.scale || 1;
    wrapper.style.setProperty('--sa-scale', String(scale));

    const title = document.createElement('div');
    title.className = 'sa-arise-text';
    // Text should be "ARiSe" (capital A, R, i, S, e) with R slightly smaller
    title.innerHTML = 'A<span class="sa-small-r">R</span>iSe';
    wrapper.appendChild(title);

    // FUNCTIONAL: Short-circuit for conditional rendering (no if-else)
    this.settings.showRankAndRole &&
      shadow &&
      (() => {
        const meta = document.createElement('div');
        meta.className = 'sa-arise-meta';
        const rankText = shadow.rank ? `${shadow.rank}-Rank` : '';
        const roleText = shadow.roleName || shadow.role || '';
        meta.textContent = [rankText, roleText].filter(Boolean).join(' • ');
        wrapper.appendChild(meta);
      })();

    // FUNCTIONAL: Spawn particles using Array.from (no for-loop)
    const particleCount = 22;
    Array.from({ length: particleCount }, () => {
      const p = document.createElement('div');
      p.className = 'sa-arise-particle';
      const angle = Math.random() * Math.PI * 2;
      const radius = 40 + Math.random() * 80;
      const dx = Math.cos(angle) * radius;
      const dy = -Math.abs(Math.sin(angle) * radius);
      p.style.setProperty('--sa-particle-x', `${dx}px`);
      p.style.setProperty('--sa-particle-y', `${dy}px`);
      p.style.left = '50%';
      p.style.top = '50%';
      wrapper.appendChild(p);
      return p;
    });

    container.appendChild(wrapper);

    setTimeout(() => {
      wrapper.remove();
    }, durationMs + 200);
  }

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT
  // ============================================================================

  /**
   * Debug logging helper - only logs when debug mode is enabled
   * @param {string} message - Debug message
   * @param {any} data - Optional data to log
   */
  debugLog(message, data = null) {
    this.settings.debugMode &&
      (data
        ? console.log(`[ShadowArise] ${message}`, data)
        : console.log(`[ShadowArise] ${message}`));
  }

  /**
   * Debug error helper - only logs when debug mode is enabled
   * @param {string} message - Error message
   * @param {any} error - Error object
   */
  debugError(message, error = null) {
    this.settings.debugMode &&
      (error
        ? console.error(`[ShadowArise] ${message}`, error)
        : console.error(`[ShadowArise] ${message}`));
  }
};
