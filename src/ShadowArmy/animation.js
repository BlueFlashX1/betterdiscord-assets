/**
 * ShadowArmy — Animation & CSS management.
 * Mixin: all methods assigned to ShadowArmy.prototype via Object.assign.
 *
 * Contains:
 *  - Font loading (CriticalHit integration)
 *  - CSS injection / removal (static + dynamic)
 *  - ARISE animation system (React injection + DOM fallback)
 *  - ARISE queue / throttle
 *  - Extraction animation (simple fallback)
 *  - CSS management helpers (theme integration)
 */

const STATIC_CSS = require('./styles.css');
const C = require('./constants');

module.exports = {
  // ============================================================================
  // FONT LOADING
  // ============================================================================

  /**
   * Load font for ARISE animation (Speedy Space Goat Oddity).
   * Delegates to CriticalHit's font loader if available, with retry.
   */
  loadAriseAnimationFont() {
    const fontName = this.settings?.ariseAnimation?.animationFont || 'Speedy Space Goat Oddity';
    const fontStyleId = `cha-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;

    // Check if font is already loaded (by CriticalHit or previous load)
    if (document.getElementById(fontStyleId)) {
      this.debugLog('FONT_LOADER', 'Font already loaded (likely by CriticalHit plugin)', {
        fontName,
        fontStyleId,
      });
      return true;
    }

    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 500;

    const attemptLoad = () => {
      if (this._isStopped) return false;
      try {
        if (!BdApi.Plugins.isEnabled('CriticalHit')) return false;
        const criticalHitPlugin = BdApi.Plugins.get('CriticalHit');
        if (criticalHitPlugin) {
          const instance = criticalHitPlugin.instance || criticalHitPlugin;
          if (instance && typeof instance.loadLocalFont === 'function') {
            const loaded = instance.loadLocalFont(fontName);
            if (loaded) {
              if (document.getElementById(fontStyleId)) {
                this.debugLog('FONT_LOADER', 'Font loaded via CriticalHit plugin', {
                  fontName,
                  fontStyleId,
                });
                return true;
              }

              const verifyTimeoutId = setTimeout(() => {
                this._retryTimeouts?.delete(verifyTimeoutId);
                if (this._isStopped) return;
                if (document.getElementById(fontStyleId)) {
                  this.debugLog(
                    'FONT_LOADER',
                    'Font loaded via CriticalHit plugin (verified after delay)',
                    { fontName, fontStyleId }
                  );
                } else {
                  this.debugLog(
                    'FONT_LOADER',
                    'CriticalHit.loadLocalFont returned true but font style not found after delay',
                    { fontName, fontStyleId }
                  );
                }
              }, 100);
              this._retryTimeouts?.add(verifyTimeoutId);
              return true;
            }

            // Try alternative font name formats
            const alternativeNames = [
              'Speedy Space Goat Oddity',
              'SpeedySpaceGoatOddity',
              'speedy space goat oddity',
            ];
            for (const altName of alternativeNames) {
              if (altName !== fontName && instance.loadLocalFont(altName)) {
                const altStyleId = `cha-font-${altName.replace(/\s+/g, '-').toLowerCase()}`;
                if (document.getElementById(altStyleId) || document.getElementById(fontStyleId)) {
                  this.debugLog(
                    'FONT_LOADER',
                    'Font loaded via CriticalHit with alternative name',
                    { originalName: fontName, loadedName: altName }
                  );
                  return true;
                }
                return true;
              }
            }
          } else if (retryCount < maxRetries) {
            retryCount++;
            this.debugLog('FONT_LOADER', 'CriticalHit not ready, retrying...', {
              fontName,
              retryCount,
              maxRetries,
            });
            const retryTimeoutId = setTimeout(() => {
              this._retryTimeouts?.delete(retryTimeoutId);
              if (this._isStopped) return;
              attemptLoad();
            }, retryDelay);
            this._retryTimeouts?.add(retryTimeoutId);
            return false;
          }
        } else if (retryCount < maxRetries) {
          retryCount++;
          this.debugLog('FONT_LOADER', 'CriticalHit plugin not found, retrying...', {
            fontName,
            retryCount,
            maxRetries,
          });
          const retryTimeoutId = setTimeout(() => {
            this._retryTimeouts?.delete(retryTimeoutId);
            if (this._isStopped) return;
            attemptLoad();
          }, retryDelay);
          this._retryTimeouts?.add(retryTimeoutId);
          return false;
        }
      } catch (error) {
        this.debugError('FONT_LOADER', 'Error loading font via CriticalHit', {
          fontName,
          error: error?.message,
          retryCount,
        });
      }
      return false;
    };

    const loaded = attemptLoad();
    if (loaded) return true;

    this.debugLog('FONT_LOADER', 'Font not yet loaded, will use fallback until available', {
      fontName,
      fontStyleId,
      retryCount,
      note: 'If CriticalHit plugin is enabled, it will load this font automatically.',
    });
    return false;
  },

  // ============================================================================
  // CSS INJECTION / REMOVAL
  // ============================================================================

  /**
   * Inject all static CSS + dynamic font-family override for .sa-arise-text.
   */
  injectCSS() {
    const styleId = 'shadow-army-styles';
    if (!this._injectedStyles) {
      this._injectedStyles = new Set();
    }

    // Build final CSS: static base + dynamic .sa-arise-text font-family override
    const fontName =
      this.settings?.ariseAnimation?.animationFont || 'Speedy Space Goat Oddity';
    const dynamicFontOverride = `
.sa-arise-text {
  font-family: '${fontName}', 'Orbitron', system-ui, sans-serif !important;
}`;
    const cssContent = STATIC_CSS + '\n' + dynamicFontOverride;

    try {
      BdApi.DOM.addStyle(styleId, cssContent);
    } catch (error) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = cssContent;
      document.head.appendChild(style);
      this.debugError('CSS', 'BdApi.DOM.addStyle failed, using fallback for main CSS', error);
    }
  },

  /**
   * Remove injected CSS styles.
   */
  removeCSS() {
    const styleId = 'shadow-army-styles';
    this.removeCSSById(styleId);
  },

  // ============================================================================
  // ARISE ANIMATION SYSTEM
  // ============================================================================

  /**
   * Initialize ARISE animation system.
   * Webpack modules → React injection → DOM fallback container.
   */
  initializeAriseAnimationSystem() {
    if (!this.settings?.ariseAnimation?.enabled) {
      this.debugLog('ARISE_ANIMATION', 'ARISE animation disabled in settings');
      return;
    }

    this.initializeWebpackModules();

    if (this.webpackModuleAccess) {
      this.tryReactInjection();
    }

    this.getContainer();
  },

  /**
   * Cleanup ARISE animation system.
   */
  cleanupAriseAnimationSystem() {
    if (this.reactInjectionActive) {
      try {
        BdApi.Patcher.unpatchAll('ShadowArmy-AriseAnimation');
        this.reactInjectionActive = false;
        this.debugLog('ARISE_ANIMATION', 'Webpack patches and React injection removed');
      } catch (error) {
        this.debugError('ARISE_ANIMATION', 'Error during cleanup', error);
      }
    }

    this.webpackModules = {
      UserStore: null,
      ChannelStore: null,
      PermissionStore: null,
      Permissions: null,
    };
    this.webpackModuleAccess = false;

    this.removeAllAnimations();
  },

  /**
   * Initialize Webpack modules for better Discord integration.
   */
  initializeWebpackModules() {
    try {
      const { Webpack } = BdApi;
      this.webpackModules.UserStore = Webpack.getStore('UserStore');
      this.webpackModules.ChannelStore = Webpack.getStore('ChannelStore');

      const { UserStore, ChannelStore } = this.webpackModules;
      this.webpackModuleAccess = Boolean(UserStore && ChannelStore);

      this.debugLog('ARISE_ANIMATION', 'Webpack module access initialized', {
        hasUserStore: Boolean(UserStore),
        hasChannelStore: Boolean(ChannelStore),
        access: this.webpackModuleAccess,
      });
    } catch (error) {
      this.debugError('ARISE_ANIMATION', 'Webpack initialization error', error);
      this.webpackModuleAccess = false;
    }
  },

  /**
   * Attempt React injection of animation container into Discord's React tree.
   */
  tryReactInjection() {
    try {
      const _mcStrings = ['baseLayer', 'appMount', 'app-mount'];
      let MainContent = null, _mcKey = 'Z';
      if (typeof BdApi.Webpack.getWithKey === 'function') {
        for (const s of _mcStrings) {
          try {
            const r = BdApi.Webpack.getWithKey(
              (m) => typeof m === 'function' && m.toString().includes(s)
            );
            if (r && r[0]) { MainContent = r[0]; _mcKey = r[1]; break; }
          } catch (_) {}
        }
      }
      if (!MainContent) {
        for (const s of _mcStrings) {
          try {
            const mod = BdApi.Webpack.getByStrings(s, { defaultExport: false });
            if (mod) {
              for (const k of ['Z', 'ZP', 'default']) {
                if (typeof mod[k] === 'function') { MainContent = mod; _mcKey = k; break; }
              }
              if (!MainContent) {
                const k = Object.keys(mod).find((k) => typeof mod[k] === 'function');
                if (k) { MainContent = mod; _mcKey = k; }
              }
              if (MainContent) break;
            }
          } catch (_) {}
        }
      }

      if (!MainContent) {
        this.debugLog(
          'ARISE_ANIMATION',
          'MainContent component not found (all strategies exhausted), using DOM fallback'
        );
        return;
      }

      const React = BdApi.React;
      const pluginInstance = this;

      BdApi.Patcher.after(
        'ShadowArmy-AriseAnimation',
        MainContent,
        _mcKey,
        (thisObject, args, returnValue) => {
          try {
            const bodyPath = BdApi.Utils.findInTree(
              returnValue,
              (node) => node && node.props && node.props.children && node.props.className
            );

            if (!bodyPath || !bodyPath.props || !bodyPath.props.children) return;

            const hasContainer = BdApi.Utils.findInTree(
              bodyPath.props.children,
              (node) => node && node.props && node.props.className === 'sa-animation-container'
            );

            if (hasContainer) return;

            const containerElement = React.createElement('div', {
              className: 'sa-animation-container',
              key: 'sa-animation-container',
            });

            if (Array.isArray(bodyPath.props.children)) {
              bodyPath.props.children.push(containerElement);
            } else {
              bodyPath.props.children = [bodyPath.props.children, containerElement];
            }

            const containerRefTimeoutId = setTimeout(() => {
              pluginInstance._retryTimeouts?.delete(containerRefTimeoutId);
              if (pluginInstance._isStopped) return;
              const domContainer = document.querySelector('.sa-animation-container');
              if (domContainer) {
                pluginInstance.animationContainer = domContainer;
                pluginInstance.debugLog(
                  'ARISE_ANIMATION',
                  'Animation container injected successfully'
                );
              }
            }, 100);
            pluginInstance._retryTimeouts?.add(containerRefTimeoutId);
          } catch (error) {
            pluginInstance.debugError('ARISE_ANIMATION', 'React injection error', error);
          }
        }
      );

      this.reactInjectionActive = true;
      this.debugLog('ARISE_ANIMATION', 'React injection setup complete');
    } catch (error) {
      this.debugError('ARISE_ANIMATION', 'React injection setup error', error);
      this.createContainerDOM();
    }
  },

  /**
   * Get or create animation container element.
   */
  getContainer() {
    if (this.animationContainer) return this.animationContainer;

    if (this.webpackModuleAccess && !this.reactInjectionActive) {
      this.tryReactInjection();
      const reactFallbackTimeoutId = setTimeout(() => {
        this._retryTimeouts?.delete(reactFallbackTimeoutId);
        if (this._isStopped) return;
        if (!this.animationContainer) {
          this.createContainerDOM();
        }
      }, 200);
      this._retryTimeouts?.add(reactFallbackTimeoutId);
      return this.animationContainer;
    }

    this.createContainerDOM();
    return this.animationContainer;
  },

  /**
   * Create animation container using DOM (fallback method).
   */
  createContainerDOM() {
    const container = document.createElement('div');
    container.className = 'sa-animation-container';
    document.body.appendChild(container);
    this.animationContainer = container;
    this.debugLog('ARISE_ANIMATION', 'Created animation container via DOM fallback');
  },

  /**
   * Remove all animations and clean up container.
   */
  removeAllAnimations() {
    this.animationContainer?.parentNode &&
      (this.animationContainer.parentNode.removeChild(this.animationContainer),
      (this.animationContainer = null));
  },

  // ============================================================================
  // EXTRACTION ANIMATION (Simple fallback when ARISE disabled)
  // ============================================================================

  /**
   * Show extraction animation for a shadow.
   * Uses ARISE animation if enabled, otherwise simple inline fallback.
   */
  showExtractionAnimation(shadow) {
    if (!shadow) return;
    if (this._isStopped) return;

    // Use integrated ARISE animation if enabled
    if (this.settings?.ariseAnimation?.enabled) {
      this.queueAriseAnimation(shadow);
      return;
    }

    // Fallback: simple inline extraction animation
    const animation = document.createElement('div');
    animation.className = 'shadow-army-extraction-animation';
    const content = document.createElement('div');
    content.className = 'shadow-extraction-content';

    const title = document.createElement('div');
    title.className = 'shadow-extraction-title';
    title.textContent = 'ARISE';

    const info = document.createElement('div');
    info.className = 'shadow-extraction-info';

    const rank = document.createElement('div');
    rank.className = 'shadow-rank';
    rank.textContent = shadow.rank || '';

    const role = document.createElement('div');
    role.className = 'shadow-role';
    role.textContent = shadow.roleName || shadow.role || '';

    info.appendChild(rank);
    info.appendChild(role);
    content.appendChild(title);
    content.appendChild(info);
    animation.appendChild(content);

    if (BdApi && BdApi.DOM && typeof BdApi.DOM.append === 'function') {
      BdApi.DOM.append(document.body, animation);
    } else {
      document.body.appendChild(animation);
    }

    const fadeOutId = setTimeout(() => {
      this._retryTimeouts?.delete(fadeOutId);
      animation.classList.add('fade-out');
      const removeId = setTimeout(() => {
        this._retryTimeouts?.delete(removeId);
        if (BdApi && BdApi.DOM && typeof BdApi.DOM.remove === 'function') {
          BdApi.DOM.remove(animation);
        } else {
          animation.remove();
        }
      }, 500);
      this._retryTimeouts?.add(removeId);
    }, 2000);
    this._retryTimeouts?.add(fadeOutId);
  },

  // ============================================================================
  // ARISE QUEUE / THROTTLE
  // ============================================================================

  getAriseAnimationMinGapMs() {
    const ariseConfig = this.settings?.ariseAnimation || this.defaultSettings.ariseAnimation;
    const value = Number(ariseConfig?.minGapMs);
    return Number.isFinite(value) ? Math.max(250, value) : 900;
  },

  queueAriseAnimation(shadow) {
    if (!shadow) return;
    if (this._isStopped) return;

    const minGapMs = this.getAriseAnimationMinGapMs();
    const elapsed = Date.now() - (this._lastAriseAnimationAt || 0);

    if (!this._ariseDrainTimeout && elapsed >= minGapMs) {
      this.triggerAriseNow(shadow);
      return;
    }

    // Coalesce burst events: keep latest shadow data while waiting for cooldown
    this._pendingAriseShadow = shadow;
    this.schedulePendingAriseAnimation();
  },

  schedulePendingAriseAnimation() {
    if (this._isStopped) return;
    if (!this._pendingAriseShadow) return;
    if (this._ariseDrainTimeout) return;

    const minGapMs = this.getAriseAnimationMinGapMs();
    const elapsed = Date.now() - (this._lastAriseAnimationAt || 0);
    const waitMs = Math.max(0, minGapMs - elapsed);

    const queueTimeoutId = setTimeout(() => {
      this._retryTimeouts?.delete(queueTimeoutId);
      this._ariseDrainTimeout = null;
      if (this._isStopped) return;

      const nextShadow = this._pendingAriseShadow;
      this._pendingAriseShadow = null;
      if (nextShadow) {
        this.triggerAriseNow(nextShadow);
      }
    }, waitMs);

    this._ariseDrainTimeout = queueTimeoutId;
    this._retryTimeouts?.add(queueTimeoutId);
  },

  triggerAriseNow(shadow) {
    if (!shadow) return;
    try {
      this.triggerArise(shadow);
      this._lastAriseAnimationAt = Date.now();
    } catch (error) {
      this.debugError('ANIMATION', 'Error triggering ARISE animation', error);
    }
  },

  // ============================================================================
  // ARISE ANIMATION — triggerArise (SVG + styled text fallback + particles)
  // ============================================================================

  /**
   * Trigger ARISE animation for a given shadow.
   * SVG-first with styled text fallback, particle effects, font verification.
   */
  triggerArise(shadow) {
    if (!this.settings?.ariseAnimation?.enabled) return;
    if (typeof document === 'undefined') return;

    const container = this.getContainer();
    const ariseSettings = this.settings.ariseAnimation;
    const durationMs = ariseSettings.animationDuration || 2500;
    const fontName = ariseSettings.animationFont || 'Speedy Space Goat Oddity';

    // Ensure font is loaded before creating animation
    if (!document.getElementById(`cha-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`)) {
      this.loadAriseAnimationFont();
    }

    // Debug: Verify font is loaded
    if (this.debug.enabled && document.fonts && document.fonts.check) {
      const fontLoaded = document.fonts.check(`16px '${fontName}'`);
      this.debugLog('ARISE_ANIMATION', 'Font verification check', {
        fontName,
        fontLoaded,
        note: fontLoaded
          ? 'Font is loaded and ready'
          : 'Font may not be loaded - will use fallback',
      });
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'sa-arise-wrapper';
    wrapper.style.setProperty('--sa-duration', `${durationMs}ms`);
    const scale = ariseSettings.scale || 1;
    wrapper.style.setProperty('--sa-scale', String(scale));

    const title = document.createElement('div');
    title.className = 'sa-arise-text';

    // Try hand-drawn ARISE SVG first, fall back to styled text
    let _svgOk = false;
    try {
      if (typeof C.ARISE_SVG === 'string' && C.ARISE_SVG.length > 100) {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(C.ARISE_SVG, 'image/svg+xml');
        if (!svgDoc.querySelector('parsererror')) {
          const svgEl = svgDoc.documentElement;
          title.style.cssText =
            'text-align: center !important; display: flex !important; justify-content: center !important; align-items: center !important; position: relative !important;';
          // Glow layer — blurred clone sits behind
          const glowSvg = document.importNode(svgEl, true);
          glowSvg.style.cssText =
            'height: 180px !important; width: auto !important; position: absolute !important; top: 0 !important; left: 50% !important; transform: translateX(-50%) !important; filter: blur(18px) brightness(1.5) !important; opacity: 0.7 !important; pointer-events: none !important; z-index: 0 !important;';
          title.appendChild(glowSvg);
          // Crisp SVG on top
          const mainSvg = document.importNode(svgEl, true);
          mainSvg.style.cssText =
            'height: 180px !important; width: auto !important; display: inline-block !important; position: relative !important; z-index: 1 !important;';
          title.appendChild(mainSvg);
          _svgOk = true;
        }
      }
    } catch (e) {
      this.debugError('ARISE_SVG', 'ARISE SVG failed', e?.message || e);
    }
    if (!_svgOk) {
      // Fallback: styled text with font
      title.style.fontFamily = `'${fontName}', 'Orbitron', system-ui, sans-serif`;
      title.innerHTML =
        'A<span class="sa-small-r">R</span><span class="sa-mid-i">i</span><span class="sa-small-s">S</span><span class="sa-mid-e">e</span>';
    }
    wrapper.appendChild(title);

    this.debugLog('ARISE_ANIMATION', 'Triggering ARISE animation', {
      shadowRank: shadow?.rank,
      shadowRole: shadow?.roleName || shadow?.role,
      fontName,
      duration: durationMs,
      scale,
      showRankAndRole: ariseSettings.showRankAndRole,
    });

    // Conditional rank + role meta
    ariseSettings.showRankAndRole &&
      shadow &&
      (() => {
        const meta = document.createElement('div');
        meta.className = 'sa-arise-meta';
        const rankText = shadow.rank ? `${shadow.rank}-Rank` : '';
        const roleText = shadow.roleName || shadow.role || '';
        meta.textContent = [rankText, roleText].filter(Boolean).join(' \u2022 ');
        wrapper.appendChild(meta);
      })();

    // Spawn particles
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

    // Debug: Verify font after render
    if (this.debug.enabled) {
      const fontVerifyTimeoutId = setTimeout(() => {
        this._retryTimeouts?.delete(fontVerifyTimeoutId);
        if (this._isStopped) return;
        const computedStyle = window.getComputedStyle(title);
        const appliedFont = computedStyle.fontFamily;
        const fontLoaded = document.fonts?.check(`16px '${fontName}'`);

        this.debugLog('ARISE_ANIMATION', 'Font verification after render', {
          fontName,
          appliedFontFamily: appliedFont,
          fontLoaded,
          matchesExpected: appliedFont.includes(fontName),
          note: appliedFont.includes(fontName)
            ? 'Font is correctly applied to ARISE animation'
            : `Font may not be applied - using fallback. Expected: '${fontName}', Got: ${appliedFont}`,
        });
      }, 100);
      this._retryTimeouts?.add(fontVerifyTimeoutId);
    }

    const wrapperRemoveId = setTimeout(() => {
      this._retryTimeouts?.delete(wrapperRemoveId);
      wrapper.remove();
    }, durationMs + 200);
    this._retryTimeouts?.add(wrapperRemoveId);
  },

  // ============================================================================
  // CSS MANAGEMENT HELPERS — Theme Integration
  // ============================================================================

  /**
   * Inject or update CSS with automatic theme variable integration.
   */
  injectOrUpdateCSS(styleId, cssContent, options = {}) {
    const { forceUpdate = false, useThemeVars = true, priority = 100 } = options;

    if (!styleId || !cssContent) {
      this.debugError('CSS', 'Invalid CSS injection parameters', {
        styleId,
        hasContent: !!cssContent,
      });
      return false;
    }

    try {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle && !forceUpdate) {
        this.debugLog('CSS', `Style ${styleId} already exists, skipping injection`);
        return true;
      }

      let finalCSS = cssContent;
      if (useThemeVars) {
        finalCSS = this.mergeCSSWithThemeVars(cssContent);
      }

      const priorityCSS = `/* Priority: ${priority} */\n${finalCSS}`;

      if (BdApi && BdApi.DOM && BdApi.DOM.addStyle) {
        try {
          BdApi.DOM.addStyle(styleId, priorityCSS);
        } catch (error) {
          this.debugError('CSS', `BdApi.DOM.addStyle failed for ${styleId}, using fallback`, error);
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = priorityCSS;
          style.setAttribute('data-priority', priority);
          document.head.appendChild(style);
        }
      } else {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = priorityCSS;
        style.setAttribute('data-priority', priority);
        document.head.appendChild(style);
      }

      if (!this._injectedStyles) {
        this._injectedStyles = new Set();
      }
      this._injectedStyles.add(styleId);

      this.debugLog('CSS', `CSS injected/updated: ${styleId}`, { priority, useThemeVars });
      return true;
    } catch (error) {
      this.debugError('CSS', `Failed to inject CSS: ${styleId}`, error);
      return false;
    }
  },

  /**
   * Remove CSS by style ID.
   */
  removeCSSById(styleId) {
    if (!styleId) {
      this.debugError('CSS', 'Invalid CSS removal: missing styleId');
      return false;
    }

    try {
      if (BdApi && BdApi.DOM && BdApi.DOM.removeStyle) {
        try {
          BdApi.DOM.removeStyle(styleId);
        } catch (error) {
          this.debugError(
            'CSS',
            `BdApi.DOM.removeStyle failed for ${styleId}, using fallback`,
            error
          );
          const style = document.getElementById(styleId);
          if (style && style.parentNode) {
            style.parentNode.removeChild(style);
          }
        }
      } else {
        const style = document.getElementById(styleId);
        if (style && style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }

      if (this._injectedStyles) {
        this._injectedStyles.delete(styleId);
      }

      this.debugLog('CSS', `CSS removed: ${styleId}`);
      return true;
    } catch (error) {
      this.debugError('CSS', `Failed to remove CSS: ${styleId}`, error);
      return false;
    }
  },

  /**
   * Detect active theme and extract CSS variables.
   */
  detectThemeVariables() {
    try {
      const root = document.documentElement;
      const computedStyle = window.getComputedStyle(root);
      const themeVars = {};

      const commonVars = [
        '--background-primary',
        '--background-secondary',
        '--background-tertiary',
        '--background-accent',
        '--text-normal',
        '--text-muted',
        '--text-link',
        '--interactive-normal',
        '--interactive-hover',
        '--interactive-active',
        '--brand-experiment',
        '--header-primary',
        '--header-secondary',
      ];

      commonVars.forEach((varName) => {
        const value = computedStyle.getPropertyValue(varName).trim();
        if (value) {
          themeVars[varName] = value;
        }
      });

      const themeMeta = document.querySelector('meta[name="theme"]');
      const themeName = themeMeta?.content || root.getAttribute('data-theme') || 'default';

      return {
        name: themeName,
        variables: themeVars,
        hasVariables: Object.keys(themeVars).length > 0,
      };
    } catch (error) {
      this.debugError('CSS', 'Failed to detect theme variables', error);
      return { name: 'default', variables: {}, hasVariables: false };
    }
  },

  /**
   * Merge CSS content with theme variables.
   */
  mergeCSSWithThemeVars(cssContent) {
    const theme = this.detectThemeVariables();

    if (!theme.hasVariables) return cssContent;

    const varMap = {
      '--bg-primary': theme.variables['--background-primary'] || 'rgba(32, 34, 37, 1)',
      '--bg-secondary': theme.variables['--background-secondary'] || 'rgba(24, 25, 28, 1)',
      '--bg-tertiary': theme.variables['--background-tertiary'] || 'rgba(18, 19, 22, 1)',
      '--text-normal': theme.variables['--text-normal'] || 'rgba(220, 221, 222, 1)',
      '--text-muted': theme.variables['--text-muted'] || 'rgba(142, 146, 151, 1)',
      '--brand-color': theme.variables['--brand-experiment'] || 'rgba(88, 101, 242, 1)',
      '--interactive-normal':
        theme.variables['--interactive-normal'] || 'rgba(185, 187, 190, 1)',
      '--interactive-hover': theme.variables['--interactive-hover'] || 'rgba(220, 221, 222, 1)',
    };

    let mergedCSS = cssContent;
    Object.entries(varMap).forEach(([placeholder, value]) => {
      const regex = new RegExp(`\\$\\{${placeholder}\\}`, 'g');
      mergedCSS = mergedCSS.replace(regex, value);
    });

    if (!mergedCSS.includes(':root') && theme.hasVariables) {
      const themeVarsCSS = `:root {\n  ${Object.entries(varMap)
        .map(([key, value]) => `${key}: ${value};`)
        .join('\n  ')}\n}\n\n`;
      mergedCSS = themeVarsCSS + mergedCSS;
    }

    return mergedCSS;
  },

  /**
   * Cleanup all injected CSS styles.
   */
  cleanupAllCSS() {
    if (!this._injectedStyles) return;

    this._injectedStyles.forEach((styleId) => {
      this.removeCSSById(styleId);
    });

    this._injectedStyles.clear();
    this.debugLog('CSS', 'All injected CSS cleaned up');
  },
};
