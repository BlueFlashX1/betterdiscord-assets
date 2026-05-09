/**
 * CriticalHit — Styling methods.
 * Per-message CSS injection, crit styling, font loading, CSS injection.
 * Mixed onto CriticalHit.prototype via Object.assign.
 */

const C = require('./constants');
const dc = require('../shared/discord-classes');
const { FRIENDORFOEBB_WOFF2_DATA, SPEEDYSPACEGOATODDITY_WOFF2_DATA } = require('./font-data');
const STATIC_CSS = require('./styles.css');

module.exports = {
  // Per-Message CSS Injection (survives Discord React re-renders)

  /**
   * Builds a CSS rule string targeting a specific message by data-message-id.
   * Uses Discord's own preserved attribute so styles survive React re-renders.
   * @param {string} messageId - Discord message ID (snowflake)
   * @param {Object} [critSettings] - Crit settings (gradient, color, font, glow)
   * @returns {string} CSS rule string
   */
  buildMessageCSSRule(messageId, critSettings = {}) {
    const useGradient = critSettings.gradient !== undefined ? critSettings.gradient : this.settings.critGradient !== false;
    const gradientColor = critSettings.gradientColor || this.settings.critGradientColor || C.DEFAULT_GRADIENT_COLORS;
    const solidColor = critSettings.color || this.settings.critColor || '#ff0000';
    const messageFont = critSettings.font || this.settings.critFont || "'Friend or Foe BB', 'Orbitron', sans-serif";
    const useGlow = critSettings.glow !== undefined ? critSettings.glow : this.settings.critGlow;

    // Target ALL Discord message identification patterns:
    // 1. data-message-id="123" (direct attribute on some message wrappers)
    // 2. id="chat-messages-123" (list item ID format)
    // 3. data-list-item-id="chat-messages-123___..." (virtualized list item ID)
    // 4. #message-content-123 (direct content element ID)
    // This ensures CSS matches regardless of which extraction method found the ID.
    const selA = `[data-message-id="${messageId}"]`;
    const selB = `[id*="${messageId}"]`;
    const selC = `[data-list-item-id*="${messageId}"]`;
    // Direct content targeting (no descendant selector needed for this one)
    const directContentSel = `#message-content-${messageId}`;
    const mcSel = dc.sel.messageContent;
    const mkSel = dc.sel.markup;
    const contentSel = [
      `${selA} ${mcSel}`, `${selA} ${mkSel}`,
      `${selB} ${mcSel}`, `${selB} ${mkSel}`,
      `${selC} ${mcSel}`, `${selC} ${mkSel}`,
      directContentSel,
    ].join(', ');
    const childSel = [
      `${selA} ${mcSel} *:not(code):not(pre):not(pre *)`,
      `${selA} ${mkSel} *:not(code):not(pre):not(pre *)`,
      `${selB} ${mcSel} *:not(code):not(pre):not(pre *)`,
      `${selB} ${mkSel} *:not(code):not(pre):not(pre *)`,
      `${selC} ${mcSel} *:not(code):not(pre):not(pre *)`,
      `${selC} ${mkSel} *:not(code):not(pre):not(pre *)`,
      `${directContentSel} *:not(code):not(pre):not(pre *)`,
    ].join(', ');

    let glowValue = 'none';
    if (useGlow) {
      glowValue = useGradient
        ? '0 0 5px rgba(138, 43, 226, 0.8), 0 0 10px rgba(123, 33, 198, 0.7), 0 0 15px rgba(107, 31, 176, 0.6), 0 0 20px rgba(75, 14, 130, 0.5)'
        : `0 0 2px ${solidColor}, 0 0 3px ${solidColor}`;
    }

    // v3.4.1: Removed redundant `background` shorthand — it resets background-clip to border-box
    // which can interfere with the explicit background-clip: text needed for gradient text.
    return `
/* CritHit: ${messageId} */
${contentSel} {
  background-image: ${useGradient ? gradientColor : 'none'} !important;
  -webkit-background-clip: ${useGradient ? 'text' : 'border-box'} !important;
  background-clip: ${useGradient ? 'text' : 'border-box'} !important;
  -webkit-text-fill-color: ${useGradient ? 'transparent' : 'inherit'} !important;
  color: ${useGradient ? 'transparent' : solidColor} !important;
  display: inline-block !important;
  text-shadow: ${glowValue} !important;
  font-family: ${messageFont} !important;
  font-weight: bold !important;
  font-size: 1.15em !important;
  font-synthesis: style !important;
  font-variant: inherit !important;
  font-style: inherit !important;
  letter-spacing: 1px !important;
  -webkit-text-stroke: none !important;
  text-stroke: none !important;
}
${childSel} {
  font-family: ${messageFont} !important;
  font-weight: inherit !important;
  font-size: inherit !important;
  font-stretch: inherit !important;
  font-synthesis: style !important;
  font-variant: inherit !important;
  font-style: inherit !important;
  letter-spacing: inherit !important;
  text-transform: inherit !important;
  -webkit-text-stroke: inherit !important;
  text-stroke: inherit !important;
}`;
  },

  /**
   * Injects per-message CSS for a crit message. Survives Discord React re-renders
   * because it targets [data-message-id] (set by Discord, preserved across re-renders).
   * @param {string} messageId - Discord message ID
   * @param {Object} [critSettings] - Crit settings
   */
  injectCritMessageCSS(messageId, critSettings) {
    if (!messageId || messageId.startsWith('hash_')) return;

    const cssRule = this.buildMessageCSSRule(messageId, critSettings);
    this.critCSSRules.set(messageId, cssRule);

    // Safety cap: trim oldest rules if over limit
    if (this.critCSSRules.size > 300) {
      const iter = this.critCSSRules.keys();
      const toRemove = this.critCSSRules.size - 300;
      for (let i = 0; i < toRemove; i++) {
        this.critCSSRules.delete(iter.next().value);
      }
    }

    // PERF: Use debounced path — RAF fires before browser paint so no visual flash.
    this.rebuildCritMessageStyles(false);
  },

  /**
   * Rebuilds the combined per-message CSS style block.
   * @param {boolean} [immediate=false] - If true, rebuild synchronously (bypasses RAF debounce).
   */
  rebuildCritMessageStyles(immediate = false) {
    if (immediate) {
      // Synchronous path — cancel any pending RAF and rebuild now
      if (this._critCSSRebuildRAF) {
        cancelAnimationFrame(this._critCSSRebuildRAF);
        this._critCSSRebuildRAF = null;
      }
      this._applyCritCSS();
      return;
    }
    // Debounced path — batch via requestAnimationFrame
    if (this._critCSSRebuildRAF) return; // Already scheduled
    this._critCSSRebuildRAF = requestAnimationFrame(() => {
      this._critCSSRebuildRAF = null;
      this._applyCritCSS();
    });
  },

  /**
   * PERF: Apply crit CSS by updating the existing <style> element in-place
   * rather than remove+add (which causes full CSSOM invalidation).
   */
  _applyCritCSS() {
    const styleId = C.CSS_STYLE_IDS.critMessages;
    if (this.critCSSRules.size === 0) {
      BdApi.DOM.removeStyle(styleId);
      this._critStyleEl = null;
      return;
    }
    const allRules = Array.from(this.critCSSRules.values()).join('\n');
    // PERF: Cache element reference instead of getElementById (BdApi may prefix the ID)
    if (this._critStyleEl && this._critStyleEl.parentNode) {
      this._critStyleEl.textContent = allRules;
    } else {
      BdApi.DOM.removeStyle(styleId);
      BdApi.DOM.addStyle(styleId, allRules);
      // Cache the actual element BdApi created (search by data attribute or last <style>)
      this._critStyleEl = document.querySelector(`style[id*="${styleId}"]`)
        || document.querySelector(`style#${styleId}`);
    }
  },

  /**
   * Removes per-message CSS for a specific message.
   * @param {string} messageId - Discord message ID
   */
  removeCritMessageCSS(messageId) {
    if (this.critCSSRules.delete(messageId)) {
      this.rebuildCritMessageStyles();
    }
  },

  /**
   * Applies crit styling to a message element using saved crit settings.
   * v3.4.0: Per-message CSS is the sole styling mechanism — no inline styles or observers.
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {Object} critSettings - Saved crit settings (gradient, font, etc.)
   */
  applyCritStyleWithSettings(messageElement, critSettings) {
    try {
      const msgId = this.getMessageIdentifier(messageElement);

      // Mark as crit for animation positioning and checkForCrit fast-skip
      messageElement.classList.add('bd-crit-hit');
      messageElement.setAttribute('data-bd-crit-locked', '1');
      this.injectCritCSS();

      // Inject per-message CSS targeting [data-message-id] for re-render persistence
      const finalMsgId = msgId || this.getMessageIdentifier(messageElement);
      if (finalMsgId && !finalMsgId.startsWith('hash_')) {
        this.injectCritMessageCSS(finalMsgId, critSettings);
      }
    } catch (error) {
      this.debugError('APPLY_CRIT_STYLE_WITH_SETTINGS', error, {
        hasMessageElement: !!messageElement,
        hasCritSettings: !!critSettings,
      });
    }
  },

  // CRIT STYLING — Content Element Discovery & Style Application

  _isContentElement(element) {
    if (!element?.classList) return false;
    const classes = Array.from(element.classList || []);
    const hasContentClass = classes.some(
      (c) => c.includes('messageContent') || c.includes('markup') || c.includes('textContainer')
    );
    return hasContentClass || element.id?.includes('message-content');
  },

  _findTextElementInContent(content) {
    const allTextElements = content.querySelectorAll(C.TEXT_ELEMENT_SELECTORS.join(', '));
    return Array.from(allTextElements).reduce((best, textEl) => {
      if (!textEl.textContent || textEl.textContent.trim().length === 0) return best;
      if (this.isInHeaderArea(textEl)) return best;
      if (
        dc.query(textEl, 'username') ||
        dc.query(textEl, 'timestamp')
      ) {
        return best;
      }
      if (textEl.textContent.trim().match(/^\d{1,2}:\d{2}$/)) return best;

      if (
        !best ||
        (textEl.tagName === 'SPAN' && best.tagName !== 'SPAN') ||
        (textEl.children.length === 0 && best.children.length > 0)
      ) {
        return textEl;
      }
      return best;
    }, null);
  },

  _parentHasHeaderElements(content) {
    const parent = content.parentElement;
    if (!parent) return false;

    const hasUsernameInParent =
      dc.query(parent, 'username') !== null ||
      dc.query(parent, 'timestamp') !== null ||
      parent.querySelector(dc.sel.author) !== null;

    if (hasUsernameInParent) return true;

    const siblings = Array.from(parent.children);
    return siblings.some((sib) => {
      const classes = Array.from(sib.classList || []);
      return classes.some(
        (c) => c.includes('username') || c.includes('timestamp') || c.includes('author')
      );
    });
  },

  findMessageContentForStyling(messageElement) {
    if (!messageElement) return null;

    if (this._isContentElement(messageElement) && !this.isInHeaderArea(messageElement)) {
      return messageElement;
    }

    for (const selector of C.CONTENT_SELECTORS) {
      const elements = messageElement.querySelectorAll(selector);
      const found = Array.from(elements).find((el) => !this.isInHeaderArea(el));
      if (found) {
        if (this._parentHasHeaderElements(found)) {
          const textElement = this._findTextElementInContent(found);
          if (textElement) return textElement;

          const markupElement = dc.query(found, 'markup');
          if (markupElement && !this.isInHeaderArea(markupElement)) {
            return markupElement;
          }

          // This candidate mixes header/content zones. Skip it to avoid styling usernames.
          continue;
        }

        return found;
      }
    }

    return this.findMessageContentElement(messageElement);
  },

  getCritContentElement(messageElement) {
    return this.findMessageContentForStyling(messageElement) || this.findMessageContentElement(messageElement);
  },

  /**
   * Applies crit styling to a message element using current settings.
   * v3.4.0: Per-message CSS is the sole styling mechanism — no inline styles or observers.
   * @param {HTMLElement} messageElement - The message DOM element
   * @param {Object} options - Options (animate: trigger critPulse animation)
   */
  applyCritStyle(messageElement, { animate = false } = {}) {
    try {
      // BUGFIX: If we received a content element instead of message wrapper, find the parent
      let actualMessageElement = messageElement;
      if (this._isContentElement(messageElement)) {
        actualMessageElement =
          messageElement.closest('[data-message-id]') ||
          messageElement.closest(dc.sel.messageListItem) ||
          messageElement.closest('[class*="messageGroup"]') ||
          messageElement;
      }

      actualMessageElement.classList.add('bd-crit-hit');
      actualMessageElement.setAttribute('data-bd-crit-locked', '1');

      const msgId = this.getMessageIdentifier(actualMessageElement);
      if (msgId && !msgId.startsWith('hash_')) {
        this.injectCritMessageCSS(msgId, {
          gradient: this.settings.critGradient !== false,
          gradientColor: this.settings.critGradientColor,
          color: this.settings.critColor,
          font: this.settings.critFont,
          glow: this.settings.critGlow,
        });
      }

      if (animate && this.settings?.critAnimation) {
        const content = this.findMessageContentForStyling(actualMessageElement);
        if (content) {
          content.style.animation = 'critPulse 0.5s ease-in-out';
        }
      }
    } catch (error) {
      this.debugError('APPLY_CRIT_STYLE', error, {
        hasMessageElement: !!messageElement,
      });
    }
  },

  // FONT LOADING HELPERS

  _getPluginsFolderFromBdApi() {
    if (typeof BdApi !== 'undefined' && BdApi.Plugins?.folder) {
      const pluginsFolder = BdApi.Plugins.folder;
      return pluginsFolder.endsWith('/') ? pluginsFolder : `${pluginsFolder}/`;
    }
    return null;
  },

  _getPluginsFolderFromScript() {
    try {
      const scripts = Array.from(document.getElementsByTagName('script'));
      const pluginScript = scripts.find(
        (script) => script.src && script.src.includes('CriticalHit.plugin.js')
      );

      if (pluginScript?.src) {
        const URLConstructor = typeof URL !== 'undefined' ? URL : null;
        const scriptUrl = URLConstructor
          ? new URLConstructor(pluginScript.src)
          : { pathname: pluginScript.src };
        const scriptPath = scriptUrl.pathname;
        return scriptPath.substring(0, scriptPath.lastIndexOf('/'));
      }
    } catch (error) {
      // Script parsing failed
    }
    return null;
  },

  _normalizeFontNameForId(fontName) {
    return fontName.replace(/\s+/g, '-').toLowerCase();
  },

  _extractFontName(fontString) {
    if (!fontString) return null;
    return fontString.replace(/'/g, '').replace(/"/g, '').split(',')[0].trim();
  },

  _matchesFontPattern(fontName, pattern) {
    return fontName.toLowerCase().includes(pattern.toLowerCase());
  },

  loadLocalFont(fontName, fontFamily = null) {
    if (!fontFamily) {
      fontFamily = `'${fontName}', sans-serif`;
    }

    try {
      const existingStyle = document.getElementById(
        `cha-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`
      );
      if (existingStyle) return true;

      let fontFileName = fontName.replace(/\s+/g, '');
      if (fontName.toLowerCase().includes('friend or foe')) {
        fontFileName = 'FriendorFoeBB';
      } else if (fontName.toLowerCase().includes('speedy space goat')) {
        fontFileName = 'SpeedySpaceGoatOddity';
      }

      let fontSrc = '';

      const fontDataMap = {
        FriendorFoeBB: {
          woff2: () => FRIENDORFOEBB_WOFF2_DATA,
        },
        SpeedySpaceGoatOddity: {
          woff2: () => SPEEDYSPACEGOATODDITY_WOFF2_DATA,
        },
      };

      const fontData = fontDataMap[fontFileName];
      if (fontData && fontData.woff2) {
        const base64Data = fontData.woff2();
        if (base64Data) {
          fontSrc = `url('data:font/woff2;base64,${base64Data}') format('woff2')`;
          this.debugLog('FONT_LOADER', 'Using embedded base64 data URI for font loading', {
            fontName,
            fontFileName,
            dataLength: base64Data.length,
          });
        }
      }

      if (!fontSrc) {
        this.debugError('FONT_LOADER', 'Could not get embedded font data', {
          fontName,
          fontFileName,
          availableFonts: Object.keys(fontDataMap),
        });
        return false;
      }

      const fontStyle = document.createElement('style');
      fontStyle.id = `cha-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
      fontStyle.textContent = `
        @font-face {
          font-family: '${fontName}';
          src: ${fontSrc};
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `;
      document.head.appendChild(fontStyle);

      if (document.fonts && document.fonts.check) {
        document.fonts.ready
          .then(() => {
            this._setTrackedTimeout(() => {
              if (this._isStopped) return;
              const fontLoaded = document.fonts.check(`16px '${fontName}'`);
              if (!fontLoaded) {
                this.debugLog('FONT_LOADER', `Font '${fontName}' may not have loaded correctly`, {
                  fontName,
                  note: 'Check that font files exist in fonts/ folder',
                });
              }
            }, 500);
          })
          .catch((fontError) => {
            this.debugLog('FONT_LOADER', 'Font verification failed (non-critical)', {
              fontName,
              error: fontError?.message || 'Unknown error',
              note: 'Will use system font fallback',
            });
          });
      }

      return true;
    } catch (error) {
      this.debugError('FONT_LOADER', error, {
        phase: 'load_local_font',
        fontName,
        fontFamily,
        note: 'Font loading failed, will use system font fallback',
      });
      return false;
    }
  },

  _getGoogleFontLinkId(fontName) {
    return `cha-google-font-${this._normalizeFontNameForId(fontName)}`;
  },

  _convertToGoogleFontsUrl(fontName) {
    return fontName.replace(/\s+/g, '+');
  },

  loadGoogleFont(fontName) {
    if (!fontName) return false;

    try {
      const fontId = this._getGoogleFontLinkId(fontName);
      if (document.getElementById(fontId)) {
        return true;
      }

      const fontLink = document.createElement('link');
      fontLink.id = fontId;
      fontLink.rel = 'stylesheet';
      fontLink.href = `https://fonts.googleapis.com/css2?family=${this._convertToGoogleFontsUrl(
        fontName
      )}&display=swap`;
      fontLink.onerror = () => {
        this.debugLog('FONT_LOADER', 'Google Font failed to load (non-critical)', {
          fontName,
          note: 'Will use system font fallback',
        });
      };

      document.head.appendChild(fontLink);
      return true;
    } catch (error) {
      this.debugError('FONT_LOADER', error, {
        phase: 'load_google_font',
        fontName,
        note: 'Font loading failed, will use system font fallback',
      });
      return false;
    }
  },

  loadCritFont(fontName = null) {
    const fontToLoad =
      fontName ||
      this.settings.critFont?.replace(/'/g, '').replace(/"/g, '').split(',')[0].trim() ||
      'Friend or Foe BB';

    const isFriendOrFoe =
      fontToLoad.toLowerCase().includes('friend or foe') ||
      fontToLoad.toLowerCase() === 'friend or foe bb';
    const isVampireWars =
      fontToLoad.toLowerCase().includes('vampire wars') ||
      fontToLoad.toLowerCase() === 'vampire wars';
    const isNovaFlat =
      fontToLoad.toLowerCase().includes('nova flat') || fontToLoad.toLowerCase() === 'nova flat';
    const isSpeedyGoat =
      fontToLoad.toLowerCase().includes('speedy space goat') ||
      fontToLoad.toLowerCase().includes('speedy goat');

    if (isFriendOrFoe) {
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      this.debugLog(
        'FONT_LOADER',
        'Friend or Foe BB requires local font files. Enable useLocalFonts and ensure font is in fonts/ folder.',
        { fontName: fontToLoad }
      );
      return this.loadGoogleFont(fontToLoad);
    }

    if (isVampireWars) {
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      return this.loadGoogleFont(fontToLoad);
    }

    if (isSpeedyGoat) {
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      this.debugLog(
        'FONT_LOADER',
        'Speedy Space Goat Oddity requires local font files. Enable useLocalFonts and ensure font is in fonts/ folder.',
        { fontName: fontToLoad }
      );
      return this.loadGoogleFont(fontToLoad);
    }

    if (isNovaFlat) {
      return this.loadGoogleFont(fontToLoad);
    }

    return this.loadFont(fontToLoad, true);
  },

  loadFont(fontName, forceGoogle = false) {
    if (!fontName) return false;

    const isNovaFlat =
      fontName.toLowerCase().includes('nova flat') || fontName.toLowerCase() === 'nova flat';

    if (isNovaFlat || forceGoogle) {
      return this.loadGoogleFont(fontName);
    }

    if (this.settings.useLocalFonts) {
      const loaded = this.loadLocalFont(fontName);
      if (loaded) {
        return true;
      }
      this.debugLog('FONT_LOADER', 'Local font load failed, falling back to Google Fonts', {
        fontName,
      });
    }

    return this.loadGoogleFont(fontName);
  },

  loadCritAnimationFont(fontName = null) {
    const fontToLoad = fontName || this.settings.animationFont || 'Speedy Space Goat Oddity';

    const isVampireWars =
      fontToLoad.toLowerCase().includes('vampire wars') ||
      fontToLoad.toLowerCase() === 'vampire wars';
    const isSpeedyGoat =
      fontToLoad.toLowerCase().includes('speedy space goat') ||
      fontToLoad.toLowerCase().includes('speedy goat');

    if (isVampireWars) {
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      this.debugLog(
        'FONT_LOADER',
        'Vampire Wars requires local font files. Enable useLocalFonts and add font to fonts/ folder.',
        { fontName: fontToLoad }
      );
      return this.loadGoogleFont(fontToLoad);
    }

    if (isSpeedyGoat) {
      if (this.settings.useLocalFonts) {
        const loaded = this.loadLocalFont(fontToLoad);
        if (loaded) return true;
      }
      this.debugLog(
        'FONT_LOADER',
        'Speedy Space Goat Oddity requires local font files. Enable useLocalFonts and ensure font is in fonts/ folder.',
        { fontName: fontToLoad }
      );
      return this.loadGoogleFont(fontToLoad);
    }

    return this.loadFont(fontToLoad, false);
  },

  // CSS INJECTION METHODS

  /**
   * Injects all static CSS (keyframes, base classes, settings panel) from styles.css.
   * Called once in start(). Replaces the old separate injectAnimationCSS/injectCritCSS/injectSettingsCSS calls.
   */
  injectStaticCSS() {
    BdApi.DOM.removeStyle(C.CSS_STYLE_IDS.static);
    BdApi.DOM.addStyle(C.CSS_STYLE_IDS.static, STATIC_CSS);
  },

  /**
   * Loads fonts for animations and crit text.
   * v3.6.0: CSS is now in styles.css — this method only handles font loading.
   */
  injectAnimationCSS() {
    const critFontName = this._extractFontName(this.settings.critFont) || C.DEFAULT_CRIT_FONT;
    this.loadCritFont(critFontName);

    const animationFontName = this.settings.animationFont || C.DEFAULT_ANIMATION_FONT;
    const animFontLoaded = this.loadCritAnimationFont(animationFontName);
    if (!animFontLoaded) {
      this.debugLog('FONT_LOADER', 'Animation font failed to load, retrying...', {
        animationFontName,
      });
      this._setTrackedTimeout(() => this.loadCritAnimationFont(animationFontName), 500);
    }

    // Ensure useLocalFonts is enabled for fonts that require local files
    if (
      this._matchesFontPattern(critFontName, 'friend or foe') ||
      this._matchesFontPattern(animationFontName, 'speedy space goat') ||
      this._matchesFontPattern(animationFontName, 'speedy goat')
    ) {
      this.settings.useLocalFonts = true;
    }
  },

  _createNovaFlatFontLink() {
    if (document.getElementById(C.CSS_STYLE_IDS.novaFlat)) return;

    const fontLink = document.createElement('link');
    fontLink.id = C.CSS_STYLE_IDS.novaFlat;
    fontLink.rel = 'stylesheet';
    fontLink.href = `${C.GOOGLE_FONTS_BASE_URL}?family=Nova+Flat&display=swap`;
    document.head.appendChild(fontLink);
  },

  /**
   * Loads crit fonts and marks CSS as injected.
   * v3.6.0: Static CSS (keyframes, .bd-crit-hit) is now in styles.css.
   * This method only handles font loading + the guard flag.
   */
  injectCritCSS() {
    if (this.settings?.cssEnabled !== true) return;
    if (this._critCSSInjected) return;

    const critFontName = this._extractFontName(this.settings.critFont) || C.DEFAULT_CRIT_FONT;
    const fontLoaded = this.loadCritFont(critFontName);
    if (!fontLoaded) {
      this.debugLog('FONT_LOADER', 'Critical hit font failed to load, retrying...', {
        critFontName,
      });
      this._setTrackedTimeout(() => this.loadCritFont(critFontName), 500);
    }
    this._createNovaFlatFontLink();
    this._critCSSInjected = true;
  },

};
